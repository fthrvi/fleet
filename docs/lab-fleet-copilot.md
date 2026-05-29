# Lab Fleet Copilot — Chat-to-Recipe Design Doc

**Status:** Draft · 2026-05-17
**Author:** Initial sketch via Claude session
**Scope:** A `/copilot` route on the Lab Fleet dashboard that converts natural-language requests ("transcribe the MP3s in ~/Downloads/foo across the lab") into a validated `JobTemplate` recipe, dry-renders the actual shell commands, optionally runs on a single host as a smoke test, and only then dispatches to the full target set.

---

## 1. Goals

1. **Reduce friction.** Today every new workload requires hand-editing a JSON recipe — a UI form that doesn't currently accept overrides at run time (see the recent PS-course incident: user-supplied recipe overrides were silently dropped, so a new template row had to be inserted via SQL). Chat input bypasses the form-design problem.
2. **Ground the model in live fleet state.** The copilot's value is *not* general code generation — it's that the LLM has fresh awareness of which machines are READY, what binaries they have, what templates already exist, and what has run recently. A copilot that suggests `tesseract image.png` when no machine has tesseract installed is worse than no copilot.
3. **Safety: validate before dispatch.** No recipe runs against the full fleet without an explicit user confirmation. The "validate-then-fan-out" loop is the core of the feature, not the chat itself.
4. **Local-only inference.** All prompts and fleet metadata stay inside the Tailnet. No external API calls.

## 2. Non-goals

- A general-purpose chatbot. The model has one tool: `propose_recipe(prompt) -> RecipeProposal`.
- Auto-running anything. Every dispatch is user-initiated, including the single-host trial.
- Multi-turn conversation in v1. (Single-turn: user prompt → proposal → preview → run.) Conversation history can come in v2.
- Cluster-style distributed inference (Nakshatra). The chat output is small JSON; single-host inference wins on latency.

---

## 3. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Hub (Next.js · this iMac)                                    │
│                                                               │
│   /copilot  (Server Component)                                │
│      │                                                        │
│      ▼                                                        │
│   Chat panel (Client Component, streams tokens)               │
│      │                                                        │
│      │ POST  /api/copilot/propose                             │
│      ▼                                                        │
│   server action: proposeRecipe(prompt)                        │
│      │                                                        │
│      ├─► 1. Snapshot fleet state from SQLite                  │
│      │       Machine[] (status, cpu, ram, modelInventory)     │
│      │       JobTemplate[] (existing recipes)                 │
│      │       last 10 Job rows                                 │
│      │                                                        │
│      ├─► 2. Build system prompt + user prompt                 │
│      │                                                        │
│      ├─► 3. HTTP POST to llama-server on chosen Mac           │
│      │       (OpenAI-compatible /v1/chat/completions)         │
│      │       with `response_format: json_schema` (GBNF)       │
│      │                                                        │
│      ├─► 4. Stream tokens back to chat panel                  │
│      │                                                        │
│      └─► 5. On finish: parse JSON, render proposal panel      │
│             with:                                             │
│              - generated `recipe` (pretty JSON)               │
│              - rendered `scp` / `ssh` command preview         │
│              - suggested `targetMachineIds`                   │
│              - "Run on 1 of N" button                         │
│              - "Run on all N" button (disabled until trial)   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼ HTTP over Tailscale
┌───────────────────────────────────────────────────────────────┐
│  Inference host (mac3-2 OR mac4)                              │
│                                                               │
│   llama-server                                                │
│     --model ~/models/qwen3-coder-flash/...UD-Q4_K_XL.gguf     │
│     --model-draft ~/models/qwen3-draft/Qwen3-1.7B-Q4_K_M.gguf │
│     --port 8090                                               │
│     --host 0.0.0.0   (Tailnet-only via firewall)              │
│     --grammar-file <generated.gbnf>  (per-request)            │
│     -ngl 99           (offload to AMD Radeon Pro 5700 XT)     │
│                                                               │
│   GPU offload: speculative decoding via draft model           │
│   gives ~2-3× speedup over plain CPU.                         │
└───────────────────────────────────────────────────────────────┘
```

---

## 4. Data flow

### 4.1 Fleet snapshot (built per-request, cheap)

```ts
interface FleetSnapshot {
  machines: Array<{
    id: number;
    name: string;
    status: "READY" | "OFFLINE" | "NEW";
    sshUser: string;
    tailscaleHost: string;
    cpuCores: number;
    ramGb: number;
    diskFreeGb: number;
    modelInventory: string[];   // populated by §6 inventory probe
    capabilities: string[];     // derived: ["whisper.cpp", "ffmpeg", "docker", "pandoc", "qwen3-coder-30b-a3b"]
  }>;
  templates: Array<{
    id: number;
    name: string;
    kind: string;
    recipeJson: string;
  }>;
  recentJobs: Array<{
    id: number;
    kind: string;
    status: "SUCCESS" | "FAILED";
    targetCount: number;
    finishedAt: string;
  }>;
}
```

### 4.2 System prompt template

```
You are Lab Fleet Copilot. Your job is to convert a user's natural-language
request into a JobTemplate recipe that the hub will dispatch.

You can ONLY produce output matching the JSON schema below. Do NOT explain.

Current fleet state (snapshot taken now):
{{fleetSnapshot.machines, formatted as a table}}

Existing templates (you may reuse a `kind` or extend a recipe):
{{fleetSnapshot.templates, formatted}}

Last 10 jobs (for context — successes are good models to follow):
{{fleetSnapshot.recentJobs}}

Hard constraints:
- Target machines must be in status READY.
- Only target machines whose `capabilities` includes everything your recipe needs.
  e.g. transcription needs `whisper.cpp` + `ffmpeg`; OCR needs `tesseract`.
- Prefer existing template `kind`s over inventing new ones.
- If the request is ambiguous or unsafe, return `kind: "needs-clarification"`
  and put the question in `rationale`.

Output schema (enforced by grammar):

{
  "kind": "<one of: shell | rsync-from-hub | rsync-to-hub | git-deploy | transcribe-mp4s-worker | setup-mac-worker | needs-clarification>",
  "recipe": { ... arbitrary JSON keyed to the kind ... },
  "targetMachineIds": [<int>, ...],
  "rationale": "<one sentence explaining the choice or the clarification needed>"
}
```

### 4.3 Output grammar (GBNF — llama.cpp's grammar-constrained generation)

GBNF guarantees the model emits parseable JSON matching the schema. Without it, ~5-10% of generations fail to parse (especially with smaller models). With it, 100%.

Sketch:

```
root        ::= proposal
proposal    ::= "{" ws "\"kind\"" ws ":" ws kind ws "," ws "\"recipe\"" ws ":" ws recipe ws "," ws "\"targetMachineIds\"" ws ":" ws idArray ws "," ws "\"rationale\"" ws ":" ws string ws "}"
kind        ::= "\"shell\"" | "\"rsync-from-hub\"" | "\"rsync-to-hub\"" | "\"git-deploy\"" | "\"transcribe-mp4s-worker\"" | "\"setup-mac-worker\"" | "\"needs-clarification\""
recipe      ::= "{" (ws kvPair (ws "," ws kvPair)*)? ws "}"
kvPair      ::= string ws ":" ws value
value       ::= string | number | "true" | "false" | array | object
idArray     ::= "[" (ws number (ws "," ws number)*)? ws "]"
...
```

A full grammar lives at `src/lib/copilot/grammar.gbnf` (to-write).

### 4.4 Dry-render preview

Given a proposal, the copilot renders **the exact strings** the runner would build, so the user can eyeball before dispatching:

```
Target: mac3-2 (midev@mac3-2.tail583a2d.ts.net)

  scp -q /Users/MentoringInstitute/ps-course-text/worker_mp3.sh midev@mac3-2.tail583a2d.ts.net:~/worker.sh

  ssh midev@mac3-2.tail583a2d.ts.net "
    chmod +x ~/worker.sh && \
    ssh-keyscan -t ed25519 bishwa.tail583a2d.ts.net >> ~/.ssh/known_hosts || true && \
    pkill -f worker.sh; sleep 1; true && \
    ( PATH=/usr/local/bin:/opt/homebrew/bin:\$PATH HUB=bishwa.tail583a2d.ts.net ... \
      nohup ~/worker.sh > ~/worker.out 2>&1 & ) && \
    sleep 3; tail -n 5 ~/ps-course-text-worker/logs/worker.log
  "
```

This is the same string the existing `runTranscribeWorker` builds today; we just expose it before running. Implementation: factor the command-building out of `runTranscribeWorker` into a pure function `buildTranscribeCommand(ctx)` that returns `{scpArgs, sshCommand}`, callable from both the runner and the dry-render path.

### 4.5 Single-host trial

A "Run on 1 of N" button. Picks the first machine from `targetMachineIds`, dispatches as a regular Job with `assignmentCount=1`. On success, the "Run on all N" button becomes enabled and dispatches against the remaining targets reusing the same recipe row.

---

## 5. Inference host setup

### 5.1 Choice of host

| Machine | RAM | GPU | Verdict |
|---|---|---|---|
| **mac3-2** | 64 GB | Radeon Pro 5700 XT 16 GB, Metal OK | ✅ Best |
| **mac4** | 64 GB | Radeon Pro 5700 XT 16 GB, Metal OK | ✅ Alt |
| mip | 64 GB | Vega 56, Metal "drift" — runs CPU in Nakshatra | OK fallback |
| bishwa (hub) | varies | GGML_ASSERT bug → CPU only | Last resort |

Start with **mac3-2**. When it's busy with transcription, fall back to **mac4** (round-robin via `Setting` row).

### 5.2 Model files (verified on disk 2026-05-17)

- Full: `~/models/qwen3-coder-flash/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf`
- Draft (for speculative decoding): `~/models/qwen3-draft/Qwen3-1.7B-Q4_K_M.gguf`

Present on at least mac3-2 and bishwa. The inventory probe (§6) confirms across the fleet.

### 5.3 Launch script — `~/lab-fleet/scripts/start-copilot-server.sh`

```bash
#!/bin/bash
# Starts llama-server with Qwen3-Coder-30B-A3B + draft model on the local box.
# Run via Lab Fleet `nakshatra-start-worker`-style dispatch, or by hand.

set -euo pipefail

MODEL=${MODEL:-$HOME/models/qwen3-coder-flash/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf}
DRAFT=${DRAFT:-$HOME/models/qwen3-draft/Qwen3-1.7B-Q4_K_M.gguf}
PORT=${PORT:-8090}

pkill -f "llama-server.*--port $PORT" 2>/dev/null; sleep 1

exec nice -n 10 ~/llama.cpp/build/bin/llama-server \
  --model "$MODEL" \
  --model-draft "$DRAFT" \
  --host 0.0.0.0 \
  --port "$PORT" \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  --threads 6 \
  --log-disable
```

### 5.4 Lab Fleet template for it

New template `start-copilot-llama-server` (kind=`shell`) that runs the script above on the chosen host. Becomes the first thing the user clicks before using `/copilot` in a session.

### 5.5 Health check

`/health` HTTP probe to `http://<host>.tail583a2d.ts.net:8090/health` every 60s. If down: the chat panel shows "Copilot inference host offline; click here to start it."

---

## 6. Model inventory probe

A periodic job (every 5 min via the existing scheduler) that runs on each READY machine:

```bash
find ~/models ~/.cache/huggingface/hub -name "*.gguf" 2>/dev/null | sort -u
which whisper-cli pandoc tesseract ffmpeg ollama 2>/dev/null
[ -x ~/llama.cpp/build/bin/llama-server ] && echo "llama-server"
```

Output is JSON-serialized into `Machine.modelInventory` (new column, nullable text). The fleet snapshot in §4.1 reads this directly.

Add `prisma/migrations/<timestamp>_machine_model_inventory/migration.sql`:

```sql
ALTER TABLE "Machine" ADD COLUMN "modelInventory" TEXT;
ALTER TABLE "Machine" ADD COLUMN "inventoryUpdatedAt" DATETIME;
```

---

## 7. UI sketch

### 7.1 `/copilot` page

```
┌──────────────────────────────────────────────────────────────────┐
│  Lab Fleet Copilot                       Inference: mac3-2 ✓     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Chat input — autofocus, multiline]                             │
│  > transcribe the .mp3s in /Users/me/Downloads/podcast/ across   │
│    the lab                                                       │
│                                       [Generate ↵]               │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  Proposal                                                        │
│                                                                  │
│  Kind:         transcribe-mp4s-worker                            │
│  Targets:      mac3-2, mac4, mip  (3 of 6 READY machines)        │
│  Rationale:    "These 3 have whisper.cpp + ffmpeg. mac3-2/mac4   │
│                 also have Metal-accelerated whisper. Bishwa was  │
│                 excluded because its id_ed25519 is               │
│                 passphrase-protected (worker can't reach agent)."│
│                                                                  │
│  Recipe (JSON):    [collapsed by default; click to expand]       │
│                                                                  │
│  Will run (preview for mac3-2):                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  $ scp -q .../worker_mp3.sh midev@mac3-2...:~/worker.sh   │   │
│  │  $ ssh midev@mac3-2... 'chmod +x ~/worker.sh && ...'      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [ Run on 1 of 3 (mac3-2) ]   [ Run on all 3 — disabled ]        │
│  [ Edit recipe manually ]     [ Discard ]                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 7.2 After single-host trial succeeds

The "Run on all 3" button enables. After full success, a "Save as template" button appears with a name input.

---

## 8. Implementation steps (MVP)

| Step | File(s) | Effort |
|---|---|---|
| 1. Inventory probe + DB column | `prisma/schema.prisma`, `src/lib/inventory-probe.ts`, `src/instrumentation.ts` (add to scheduler) | ~2h |
| 2. `start-copilot-server.sh` + template row | `scripts/start-copilot-server.sh`, new JobTemplate row | ~30min |
| 3. Factor `runTranscribeWorker` command-building into pure `buildTranscribeCommand()` | `src/lib/job-runners.ts` | ~30min |
| 4. `proposeRecipe()` server action + grammar | `src/lib/copilot/propose.ts`, `src/lib/copilot/grammar.gbnf`, `src/lib/copilot/snapshot.ts` | ~3h |
| 5. `/copilot` page UI | `src/app/copilot/page.tsx`, `src/components/CopilotChat.tsx`, `src/components/ProposalPanel.tsx` | ~3h |
| 6. Single-host trial path | `src/actions/copilot.ts` (`runProposal`, `expandProposal`) | ~1h |
| 7. Health check + auto-suggest "start inference host" | `src/components/InferenceStatus.tsx` | ~1h |

Total: ~1 work-day.

---

## 9. v2 ideas (not in MVP)

- **Multi-turn refinement** — "Make that target only mac3-2 and mac4."
- **Learning from past runs** — successful templates are auto-saved as JobTemplate rows; the model sees them in §4.1's snapshot and converges on the user's idioms.
- **Schedule suggestions** — "You ran this 3 times today. Want a 6-hour cron?"
- **Cost / energy hint** — estimate wall-time and electricity from `cpuPercent` history.
- **Fallback to Nakshatra** for prompts that explicitly request the 70B model (long-form reasoning).
- **Multi-model routing** — speculative dispatch to the smallest model that's confident, escalate on low-confidence.

---

## 10. Risks & open questions

1. **GBNF performance overhead.** Grammar-constrained sampling adds ~10-20% latency. For 100-200 token outputs, that's ~2-3s extra. Acceptable for non-streaming preview; mildly noticeable for token-by-token streaming. Mitigation: stream tokens but only validate at the end; re-prompt on parse fail (rare with grammar).

2. **Q4_K_XL quality on structured tasks.** 30B-A3B at Q4 is generally strong on code/JSON, but the A3B nature means only 3B params are active per token — needs evaluation against the specific task. **First experiment:** generate 20 recipes from canned prompts, count valid JSON / correct kinds / valid target IDs. If <90% on any axis, switch to a non-MoE quant or fine-tune.

3. **Model context for fleet snapshot.** 6 machines + 30 templates + 10 recent jobs is ~2-4K tokens of context. Well within 8K window. As `JobTemplate` table grows, prune to top-K most-recently-used.

4. **Inference host contention.** If `mac3-2` is mid-transcription when a copilot request comes in, llama-server competes for the GPU. Solutions: (a) route to `mac4` automatically when mac3-2 is busy; (b) `nice` the transcription workers (already done); (c) reserve a "copilot-only" machine.

5. **AMD Metal stability for llama-server.** The Nakshatra config uses mac3-2 + mac4 Metal for layer ranges and reports them stable. `bishwa` and `mip` Metal trigger crashes. Our llama-server runs on mac3-2/mac4 only — should be OK. **First-run validation required.**

6. **Recipe schema drift.** When a new template `kind` is added in `builtin-templates.ts`, the GBNF grammar's `kind` enum has to be updated. Mitigation: a unit test that asserts the grammar's enum equals the union of registered runner kinds.

---

## 11. Decision log

- **2026-05-17 — Single-host inference over Nakshatra distributed.** Chat outputs are small JSON; gRPC hops would dominate per-token latency. Save Nakshatra for the 70B prod chain.
- **2026-05-17 — Qwen3-Coder-30B-A3B (Q4_K_XL).** Already on disk on at least mac3-2 + bishwa. MoE = fast inference. Coder-tuned = good at structured JSON.
- **2026-05-17 — GBNF grammar-constrained output instead of "please return JSON".** Eliminates the parse-failure class of bugs entirely.
- **2026-05-17 — No auto-run, ever.** Every dispatch is user-initiated, even after model proposal. Lab Fleet's blast radius is multi-machine; a slip is expensive.
