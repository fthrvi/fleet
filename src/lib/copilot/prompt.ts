// Pure functions that turn a FleetSnapshot into a system prompt + JSON schema.
// Kept separate from the LLM call so we can unit-test prompt assembly without
// network I/O.

import type { FleetSnapshot } from "./snapshot";

// Kinds the model is allowed to emit. Keep in sync with src/lib/job-runners.ts
// RUNNERS map. The grammar mirrors this enum.
export const ALLOWED_KINDS = [
  "shell",
  "rsync-from-hub",
  "rsync-to-hub",
  "git-deploy",
  "transcribe-mp4s-worker",
  "needs-clarification",
] as const;

export type AllowedKind = (typeof ALLOWED_KINDS)[number];

export interface Proposal {
  kind: AllowedKind;
  recipe: Record<string, unknown>;
  targetMachineIds: number[];
  rationale: string;
}

export const PROPOSAL_JSON_SCHEMA = {
  type: "object",
  required: ["kind", "recipe", "targetMachineIds", "rationale"],
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ALLOWED_KINDS },
    recipe: { type: "object" },
    targetMachineIds: { type: "array", items: { type: "integer" } },
    rationale: { type: "string", maxLength: 500 },
  },
} as const;

function formatMachineRow(m: FleetSnapshot["machines"][number]): string {
  const ram = m.ramGb ? `${m.ramGb.toFixed(0)}GB` : "?";
  const disk = m.diskFreeGb ? `${(m.diskFreeGb / 1024).toFixed(0)}GB` : "?";
  const caps = m.capabilities.length > 0 ? m.capabilities.join(",") : "(none)";
  const gpus = m.gpus.length > 0 ? m.gpus.join(",") : "none";
  return `  id=${m.id} name=${m.name} ram=${ram} disk=${disk} gpu=${gpus} caps=[${caps}]`;
}

function formatTemplateRow(t: FleetSnapshot["templates"][number]): string {
  return `  id=${t.id} kind=${t.kind} name=${t.name} :: ${t.recipeSummary}`;
}

function formatJobRow(j: FleetSnapshot["recentJobs"][number]): string {
  return `  #${j.id} kind=${j.kind} status=${j.status} on=${j.targets || "(none)"}`;
}

export function buildSystemPrompt(snapshot: FleetSnapshot): string {
  const machineLines = snapshot.machines.map(formatMachineRow).join("\n");
  const templateLines = snapshot.templates.map(formatTemplateRow).join("\n");
  const jobLines = snapshot.recentJobs.map(formatJobRow).join("\n");

  return `You are Lab Fleet Copilot. You convert a user's natural-language request into a
JobTemplate recipe that the hub will dispatch over SSH to selected machines.

Your output MUST be a single JSON object matching this exact schema, with no
prose, no markdown fences, no commentary:

${JSON.stringify(PROPOSAL_JSON_SCHEMA, null, 2)}

Allowed kinds:
  - shell                     run an arbitrary command on the targets. recipe: {command: "..."}
  - rsync-from-hub            push a folder from this hub to the targets. recipe: {srcPath, destPath}
  - rsync-to-hub              pull a folder from the targets back to this hub. recipe: {srcPath, destPath}
  - git-deploy                clone/pull repo + build + restart. recipe: {repoUrl, branch, destDir, buildCmd, restartCmd}
  - transcribe-mp4s-worker    push worker.sh, start it, point at hub coordinator. recipe: {workerScriptPath, hubHost, hubUser, hubPath, prefix, threads}
  - needs-clarification       ONLY when the request is ambiguous, unsafe, or impossible. Put the question in rationale.

Hard constraints:
  1. targetMachineIds may ONLY contain ids from the "Machines" list below.
  2. Every target machine MUST have the capabilities required by the recipe.
     - transcribe-mp4s-worker requires "transcribe" capability (whisper-cli + ffmpeg).
     - llm/inference work requires "llm-host" capability.
  3. Prefer reusing an existing template id rather than inventing a new recipe.
     If a user request matches an existing template's purpose, return its kind
     with the same recipe shape, optionally with parameter overrides.
  4. Keep rationale ≤ 2 sentences. Explain *why* this kind and these targets.
  5. If the request is unsafe (deletes user data, force-pushes to main, kills
     processes by random name), return kind="needs-clarification" with the
     concern in rationale.

Current fleet state (taken ${snapshot.takenAt}):

Machines:
${machineLines || "  (none READY)"}

Existing templates:
${templateLines || "  (none)"}

Recent jobs (most recent first):
${jobLines || "  (none)"}

Return only the JSON object. No code fences, no preamble, no trailing text.`;
}
