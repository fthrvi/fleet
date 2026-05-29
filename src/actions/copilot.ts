"use server";

import { z } from "zod";
import { getFleetSnapshot } from "@/lib/copilot/snapshot";
import { buildSystemPrompt, ALLOWED_KINDS } from "@/lib/copilot/prompt";
import { callLlamaServer, isCopilotHostReachable } from "@/lib/copilot/llm";
import { buildShellCommand, buildTranscribeCommand } from "@/lib/job-previews";
import type { MachinePreview, ProposeResult } from "@/lib/copilot/types";
import { dispatchProposal, dispatchTemplate } from "@/actions/jobs";
import { db } from "@/lib/db";

const COPILOT_TEMPLATE_NAME = "start-copilot-llama-server";

const proposeSchema = z.object({
  prompt: z.string().min(1).max(4000),
});

export async function proposeRecipe(input: z.infer<typeof proposeSchema>): Promise<ProposeResult> {
  const parsed = proposeSchema.parse(input);

  const snapshot = await getFleetSnapshot();
  if (snapshot.machines.length === 0) {
    return {
      ok: false,
      error: "no READY machines in the fleet to target",
    };
  }

  const systemPrompt = buildSystemPrompt(snapshot);
  const r = await callLlamaServer(systemPrompt, parsed.prompt);
  if (!r.ok) {
    return {
      ok: false,
      error: r.error,
      raw: r.raw,
      elapsedMs: r.elapsedMs,
    };
  }

  // Validate the proposal's structure before building previews.
  const { proposal } = r;
  if (!(ALLOWED_KINDS as readonly string[]).includes(proposal.kind)) {
    return {
      ok: false,
      error: `model proposed unknown kind: ${proposal.kind}`,
      raw: r.raw,
      elapsedMs: r.elapsedMs,
    };
  }

  // Render dry-run previews for every target the model picked. We look up
  // each machine's full Machine row so the builders get the same shape they
  // see at dispatch time.
  const machineMap = new Map(snapshot.machines.map((m) => [m.id, m]));
  const previews: MachinePreview[] = [];
  for (const id of proposal.targetMachineIds) {
    const m = machineMap.get(id);
    if (!m) {
      previews.push({
        machineId: id,
        machineName: `id=${id}`,
        preview: { kind: "unsupported", reason: "machine id not in current snapshot (or not READY)" },
      });
      continue;
    }
    const minimalMachine = {
      name: m.name,
      tailscaleHost: m.tailscaleHost,
      sshUser: m.sshUser,
    };
    if (proposal.kind === "transcribe-mp4s-worker") {
      previews.push({
        machineId: id,
        machineName: m.name,
        preview: { kind: "transcribe-mp4s-worker", data: buildTranscribeCommand(minimalMachine, proposal.recipe) },
      });
    } else if (proposal.kind === "shell") {
      previews.push({
        machineId: id,
        machineName: m.name,
        preview: { kind: "shell", data: buildShellCommand(minimalMachine, proposal.recipe) },
      });
    } else {
      previews.push({
        machineId: id,
        machineName: m.name,
        preview: {
          kind: "unsupported",
          reason: `dry-render not yet implemented for kind=${proposal.kind} — dispatch will work but no preview`,
        },
      });
    }
  }

  return {
    ok: true,
    proposal,
    raw: r.raw,
    previews,
    snapshotMeta: {
      takenAt: snapshot.takenAt,
      machineCount: snapshot.machines.length,
      templateCount: snapshot.templates.length,
    },
    elapsedMs: r.elapsedMs,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
  };
}

export async function getCopilotHostStatus() {
  return isCopilotHostReachable();
}

// Machines that could host the copilot's llama-server. Derived from the live
// inventory: must have the Qwen3-Coder GGUF on disk + the llama-server binary
// + be READY. Used by the offline-host affordance to render "Start on X" buttons.
export async function getCopilotHostCandidates() {
  const machines = await db.machine.findMany({
    where: { status: "READY", sshUser: { not: "" }, modelInventory: { not: null } },
    select: { id: true, name: true, modelInventory: true, tailscaleHost: true },
  });
  type Inv = { gguf: string[]; binaries: string[]; gpus: string[] };
  const candidates: Array<{ id: number; name: string; tailscaleHost: string; gpus: string[] }> = [];
  for (const m of machines) {
    if (!m.modelInventory) continue;
    let inv: Inv;
    try {
      inv = JSON.parse(m.modelInventory) as Inv;
    } catch {
      continue;
    }
    const hasQwenCoder = inv.gguf.some((g) => g.toLowerCase().includes("qwen3-coder"));
    const hasLlamaServer = inv.binaries.includes("llama-server");
    if (hasQwenCoder && hasLlamaServer) {
      candidates.push({
        id: m.id,
        name: m.name,
        tailscaleHost: m.tailscaleHost,
        gpus: inv.gpus,
      });
    }
  }
  return candidates;
}

// One-click "start the inference host on machine X". Looks up the start-copilot-
// llama-server template and dispatches it. Returns the resulting Job id.
export async function startCopilotInferenceHost(input: { machineId: number }) {
  const tpl = await db.jobTemplate.findUnique({ where: { name: COPILOT_TEMPLATE_NAME } });
  if (!tpl) {
    return {
      ok: false as const,
      error: `template '${COPILOT_TEMPLATE_NAME}' not found — run scripts/seed-copilot-template.mjs first`,
    };
  }
  return dispatchTemplate({ templateId: tpl.id, machineIds: [input.machineId] });
}

// Helper for the UI's "single-host trial" button. Looks up the machine,
// runs the appropriate dispatch action, returns the new Job id.
export async function pickFirstTarget(targetMachineIds: number[]) {
  if (targetMachineIds.length === 0) return null;
  const m = await db.machine.findUnique({
    where: { id: targetMachineIds[0] },
    select: { id: true, name: true, status: true, sshUser: true },
  });
  return m;
}

const trialSchema = z.object({
  kind: z.string().min(1),
  recipe: z.record(z.unknown()),
  machineIds: z.array(z.number().int()).min(1),
});

// Dispatch ONLY the first machine in the proposal. The UI then shows the
// resulting Job id; the user clicks "Run on remaining" once they verify the
// trial succeeded (handled by runRemaining below).
export async function runTrial(input: z.infer<typeof trialSchema>) {
  const parsed = trialSchema.parse(input);
  if (!(ALLOWED_KINDS as readonly string[]).includes(parsed.kind)) {
    return { ok: false as const, error: `kind ${parsed.kind} not allowed for dispatch` };
  }
  if (parsed.kind === "needs-clarification") {
    return { ok: false as const, error: "needs-clarification proposals are not dispatchable" };
  }
  const first = parsed.machineIds[0];
  return dispatchProposal({
    kind: parsed.kind,
    recipe: parsed.recipe,
    machineIds: [first],
    triggeredBy: "copilot-trial",
  });
}

const remainingSchema = z.object({
  kind: z.string().min(1),
  recipe: z.record(z.unknown()),
  machineIds: z.array(z.number().int()).min(1),
  excludeMachineIds: z.array(z.number().int()).default([]),
});

// Dispatch every target that wasn't covered by the trial. Caller passes the
// full proposal target list + the list of ids already dispatched in the trial.
export async function runRemaining(input: z.infer<typeof remainingSchema>) {
  const parsed = remainingSchema.parse(input);
  if (!(ALLOWED_KINDS as readonly string[]).includes(parsed.kind)) {
    return { ok: false as const, error: `kind ${parsed.kind} not allowed for dispatch` };
  }
  if (parsed.kind === "needs-clarification") {
    return { ok: false as const, error: "needs-clarification proposals are not dispatchable" };
  }
  const exclude = new Set(parsed.excludeMachineIds);
  const remaining = parsed.machineIds.filter((id) => !exclude.has(id));
  if (remaining.length === 0) {
    return { ok: false as const, error: "no remaining targets — all already dispatched" };
  }
  return dispatchProposal({
    kind: parsed.kind,
    recipe: parsed.recipe,
    machineIds: remaining,
    triggeredBy: "copilot-expand",
  });
}

const saveSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/i, "name must be alphanumeric/dash"),
  description: z.string().max(500).optional(),
  kind: z.string().min(1),
  recipe: z.record(z.unknown()),
  defaultThreads: z.number().int().optional().nullable(),
});

// Save a proposal as a JobTemplate so the user can rerun it from /run without
// going back through the chat. Idempotent on name (errors if name is taken).
export async function saveProposalAsTemplate(input: z.infer<typeof saveSchema>) {
  const parsed = saveSchema.parse(input);
  const existing = await db.jobTemplate.findUnique({ where: { name: parsed.name } });
  if (existing) {
    return { ok: false as const, error: `template name '${parsed.name}' is already taken` };
  }
  const t = await db.jobTemplate.create({
    data: {
      name: parsed.name,
      description: parsed.description ?? null,
      kind: parsed.kind,
      recipeJson: JSON.stringify(parsed.recipe),
      defaultThreads: parsed.defaultThreads ?? null,
    },
  });
  return { ok: true as const, templateId: t.id };
}
