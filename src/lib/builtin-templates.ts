// Built-in job templates. Auto-seeded on first visit to /templates if missing.
//
// Each template has a `kind` that selects which runner is used at dispatch time
// (see src/actions/jobs.ts → dispatchTemplate). Recipes are stored as JSON strings
// in JobTemplate.recipeJson and validated per-kind on dispatch.

export type TemplateKind =
  | "shell"
  | "rsync-from-hub"
  | "rsync-to-hub"
  | "transcribe-mp4s-worker"
  | "git-deploy";

export interface BuiltinTemplate {
  name: string;
  description: string;
  kind: TemplateKind;
  defaultThreads?: number;
  defaults: Record<string, unknown>;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    name: "shell-on-fleet",
    description:
      "Paste a shell command. Runs on each selected machine in parallel. Streams stdout/stderr per machine to the job log.",
    kind: "shell",
    defaults: { command: "uptime" },
  },
  {
    name: "rsync-from-hub",
    description:
      "Push a folder from this hub to each selected machine. Uses rsync over the existing SSH key pair.",
    kind: "rsync-from-hub",
    defaults: {
      srcPath: "/Users/MentoringInstitute/mentoring-transcripts/worker.sh",
      destPath: "~/worker.sh",
      excludes: [],
    },
  },
  {
    name: "rsync-to-hub",
    description:
      "Collect a folder from each selected machine back to this hub. Useful for harvesting worker outputs or logs.",
    kind: "rsync-to-hub",
    defaults: {
      remotePath: "~/mentoring-transcripts-worker/logs/",
      localPath: "/Users/MentoringInstitute/lab-fleet/data/collected/{machine}/",
      excludes: [],
    },
  },
  {
    name: "git-deploy",
    description:
      "Pull a git repo on each selected machine, run a build command, restart a service. Works with any GitHub repo. Idempotent — clones on first run, pulls on subsequent runs.",
    kind: "git-deploy",
    defaults: {
      repoUrl: "https://github.com/your-org/your-app.git",
      branch: "main",
      destDir: "~/apps/your-app",
      buildCmd: "npm ci && npm run build",
      restartCmd: "pm2 restart your-app || true",
    },
  },
  {
    name: "transcribe-mp4s-worker",
    description:
      "Deploy worker.sh and start it on each selected machine, pointing at this hub's transcription coordinator. Requires whisper.cpp + ffmpeg + the model to already be installed on the worker (use the setup wizard in /setup once it ships).",
    kind: "transcribe-mp4s-worker",
    defaultThreads: 8,
    defaults: {
      workerScriptPath: "/Users/MentoringInstitute/mentoring-transcripts/worker.sh",
      hubHost: "bishwa.tail583a2d.ts.net",
      hubUser: "MentoringInstitute",
      hubPath: "mentoring-transcripts",
      prefix: "",
      threads: 8,
    },
  },
  // ─── Nakshatra (L2 inference engine) ─────────────────────────────────────
  // These run against the patched-llama.cpp worker daemon + Python gRPC
  // shim from github.com/fthrvi/nakshatra. The defaults match
  // scripts/cluster_5worker.yaml in that repo; edit per-dispatch to target
  // a different port / layer range / model.
  {
    name: "nakshatra-start-worker",
    description:
      "Start one Nakshatra worker on the selected machine(s). Kills anything on the port first, then nohup-launches scripts/worker.py and waits up to 20s for the 'M5 listening' ready marker. Linux machines need 'loginctl enable-linger <user>' one-time so the worker survives SSH disconnect.",
    kind: "shell",
    defaults: {
      command: [
        "PORT=5530; LSTART=0; LEND=6; MODE=first; MODEL_ID=prithvi-q8;",
        "SUB_GGUF=/tmp/w0.gguf;",
        'DAEMON_BIN="$HOME/llama.cpp/build/bin/llama-nakshatra-worker";',
        "N_CTX=256; N_THREADS=8;",
        "lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null; sleep 1;",
        "rm -f /tmp/worker_$PORT.log;",
        "cd ~/nakshatra-v0 && source venv/bin/activate &&",
        "nohup python scripts/worker.py --port $PORT --sub-gguf $SUB_GGUF --mode $MODE",
        "  --layer-start $LSTART --layer-end $LEND --model-id $MODEL_ID",
        "  --daemon-bin $DAEMON_BIN --n-ctx $N_CTX --n-threads $N_THREADS",
        "  > /tmp/worker_$PORT.log 2>&1 < /dev/null &",
        "for i in $(seq 1 20); do grep -q 'M5 listening' /tmp/worker_$PORT.log 2>/dev/null && break; sleep 1; done;",
        "grep -q 'M5 listening' /tmp/worker_$PORT.log && echo READY || (echo NOT_READY; tail -50 /tmp/worker_$PORT.log)",
      ].join(" "),
    },
  },
  {
    name: "nakshatra-stop-worker",
    description:
      "Kill any Nakshatra worker listening on the given port on the selected machine(s). Uses lsof, not pkill — pkill matches its own command line and self-terminates.",
    kind: "shell",
    defaults: {
      command:
        'PORT=5530; PIDS=$(lsof -ti:$PORT 2>/dev/null); ' +
        'if [ -n "$PIDS" ]; then kill -9 $PIDS && echo "stopped pids=$PIDS on :$PORT"; else echo "nothing on :$PORT"; fi',
    },
  },
  {
    name: "nakshatra-healthz",
    description:
      "Curl the worker's /healthz endpoint (on the file-server port = gRPC port + 1000, e.g. 5530 → 6530) and pretty-print the JSON. Run against all worker machines to spot-check the cluster.",
    kind: "shell",
    defaults: {
      command:
        'PORT=6530; ' +
        'curl -fsS --max-time 3 "http://localhost:$PORT/healthz" | python3 -m json.tool 2>/dev/null || echo "DOWN or no /healthz on :$PORT"',
    },
  },
  {
    name: "nakshatra-run-chain",
    description:
      "Run one inference through the assembled chain using scripts/client.py against a cluster YAML. Intended to run on a single 'hub' machine that can reach every worker over Tailscale. Override PROMPT for ad-hoc queries.",
    kind: "shell",
    defaults: {
      command: [
        'CONFIG=scripts/cluster_5worker.yaml;',
        'PROMPT="The capital of France is";',
        'MAX_TOKENS=16;',
        "cd ~/nakshatra-v0 && source venv/bin/activate &&",
        'python scripts/client.py --config "$CONFIG" --prompt "$PROMPT" --max-tokens $MAX_TOKENS',
      ].join(" "),
    },
  },
  {
    name: "nakshatra-benchmark",
    description:
      "Time a run-chain invocation and report wall time. Useful to spot per-worker latency regressions after a sub-GGUF redistribute or worker restart. Same caveats as nakshatra-run-chain (hub-side).",
    kind: "shell",
    defaults: {
      command: [
        'CONFIG=scripts/cluster_5worker.yaml;',
        'PROMPT="The quick brown fox";',
        'MAX_TOKENS=32;',
        "cd ~/nakshatra-v0 && source venv/bin/activate &&",
        'time python scripts/client.py --config "$CONFIG" --prompt "$PROMPT" --max-tokens $MAX_TOKENS',
      ].join(" "),
    },
  },
];

export function builtinByName(name: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.name === name);
}
