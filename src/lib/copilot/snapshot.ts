// Fleet snapshot for the copilot. Reads from SQLite and produces a compact
// JSON-shaped object that gets formatted into the LLM system prompt.
//
// Goals:
//   - Cheap (single DB round trip per call; called per /copilot request).
//   - Stable shape (the LLM is grounded in it, so don't churn field names).
//   - Token-efficient (8 KB context window for the snapshot at most).

import { db } from "../db";

export interface MachineSnapshot {
  id: number;
  name: string;
  status: string;
  sshUser: string;
  tailscaleHost: string;
  cpuCores: number | null;
  ramGb: number | null;
  diskFreeGb: number | null;
  /** Derived from modelInventory + status; e.g. "transcribe", "ocr", "llm". */
  capabilities: string[];
  gguf: string[];
  binaries: string[];
  gpus: string[];
  /** ISO; null when never probed. */
  inventoryUpdatedAt: string | null;
}

export interface TemplateSnapshot {
  id: number;
  name: string;
  kind: string;
  description: string | null;
  /** Compact one-liner; the recipe's most distinguishing fields. */
  recipeSummary: string;
}

export interface RecentJobSnapshot {
  id: number;
  kind: string;
  status: string;
  targetCount: number;
  /** Comma-separated machine names. */
  targets: string;
  finishedAt: string | null;
}

export interface FleetSnapshot {
  machines: MachineSnapshot[];
  templates: TemplateSnapshot[];
  recentJobs: RecentJobSnapshot[];
  takenAt: string;
}

function deriveCapabilities(inv: { gguf: string[]; binaries: string[] } | null): string[] {
  if (!inv) return [];
  const caps: string[] = [];
  const hasWhisper = inv.binaries.includes("whisper-cli");
  const hasFfmpeg = inv.binaries.includes("ffmpeg");
  const hasTesseract = inv.binaries.includes("tesseract");
  const hasPandoc = inv.binaries.includes("pandoc");
  const hasOllama = inv.binaries.includes("ollama");
  const hasLlamaServer = inv.binaries.includes("llama-server");
  const hasQwenCoder = inv.gguf.some((g) => g.toLowerCase().includes("qwen3-coder"));
  if (hasWhisper && hasFfmpeg) caps.push("transcribe");
  if (hasTesseract) caps.push("ocr");
  if (hasPandoc) caps.push("doc-extract");
  if (hasLlamaServer && hasQwenCoder) caps.push("llm-host");
  if (hasOllama) caps.push("ollama");
  return caps;
}

function summarizeRecipe(kind: string, recipeJson: string): string {
  try {
    const r = JSON.parse(recipeJson) as Record<string, unknown>;
    switch (kind) {
      case "shell": {
        const cmd = String(r.command ?? "");
        return cmd.length > 80 ? cmd.slice(0, 80) + "…" : cmd;
      }
      case "transcribe-mp4s-worker":
        return `workerScript=${String(r.workerScriptPath ?? "?")} hubPath=${String(r.hubPath ?? "?")} threads=${r.threads ?? 8}`;
      case "rsync-from-hub":
      case "rsync-to-hub":
        return `src=${String(r.srcPath ?? "?")} → dst=${String(r.destPath ?? "?")}`;
      case "git-deploy":
        return `repo=${String(r.repoUrl ?? "?")} branch=${String(r.branch ?? "main")}`;
      default:
        return "(custom)";
    }
  } catch {
    return "(unparseable recipe)";
  }
}

export async function getFleetSnapshot(): Promise<FleetSnapshot> {
  const [machinesRaw, templates, jobs] = await Promise.all([
    db.machine.findMany({
      where: { status: "READY", sshUser: { not: "" } },
      orderBy: { name: "asc" },
    }),
    db.jobTemplate.findMany({ orderBy: { id: "asc" } }),
    db.job.findMany({
      orderBy: { id: "desc" },
      take: 10,
      include: { assignments: { include: { machine: { select: { name: true } } } } },
    }),
  ]);

  type Inventory = { gguf: string[]; binaries: string[]; gpus: string[] };
  const machines: MachineSnapshot[] = machinesRaw.map((m) => {
    let inv: Inventory | null = null;
    if (m.modelInventory) {
      try {
        inv = JSON.parse(m.modelInventory) as Inventory;
      } catch {
        inv = null;
      }
    }
    return {
      id: m.id,
      name: m.name,
      status: m.status,
      sshUser: m.sshUser,
      tailscaleHost: m.tailscaleHost,
      cpuCores: m.cpuCores,
      ramGb: m.ramGb,
      diskFreeGb: m.diskFreeGb,
      gguf: inv?.gguf ?? [],
      binaries: inv?.binaries ?? [],
      gpus: inv?.gpus ?? [],
      capabilities: deriveCapabilities(inv),
      inventoryUpdatedAt: m.inventoryUpdatedAt?.toISOString() ?? null,
    };
  });

  return {
    machines,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      description: t.description,
      recipeSummary: summarizeRecipe(t.kind, t.recipeJson),
    })),
    recentJobs: jobs.map((j) => ({
      id: j.id,
      kind: j.kind,
      status: j.status,
      targetCount: j.assignments.length,
      targets: j.assignments.map((a) => a.machine.name).join(","),
      finishedAt: j.finishedAt?.toISOString() ?? null,
    })),
    takenAt: new Date().toISOString(),
  };
}
