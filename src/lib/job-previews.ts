// Pure command-builders for the runners that the copilot dry-render UI needs
// to preview before dispatching. Each builder returns the exact shell strings
// that the runner would execute, so the user can eyeball them — and so the
// runner itself can reuse the same code path (single source of truth).
//
// Pattern: builders return a discriminated union `{ valid: true, ... } | { valid: false, error }`.
// On valid=true the structure mirrors the natural shape of the operation
// (scp step + ssh step for the transcribe worker, just a single ssh-exec for
// shell, etc.). Both the runner and the UI consume the same shape.

import type { Machine } from "@prisma/client";

export interface SshTarget {
  host: string;
  user: string;
}

// ─── transcribe-mp4s-worker ──────────────────────────────────────────────────

export interface TranscribePreviewSteps {
  scp: {
    args: string[]; // exactly what runLocalCommandStream("scp", args) gets
    label: string; // for hooks.onSystem + UI preview
  };
  ssh: {
    target: SshTarget;
    command: string;
    label: string;
  };
}

export interface TranscribeParams {
  workerScriptPath: string;
  hubHost: string;
  hubUser: string;
  hubPath: string;
  prefix: string;
  threads: number;
}

export type TranscribePreview =
  | { valid: true; params: TranscribeParams; steps: TranscribePreviewSteps }
  | { valid: false; error: string };

export function buildTranscribeCommand(
  machine: Pick<Machine, "name" | "tailscaleHost" | "sshUser">,
  recipe: Record<string, unknown>,
): TranscribePreview {
  const workerScriptPath = String(recipe.workerScriptPath ?? "");
  const hubHost = String(recipe.hubHost ?? "");
  const hubUser = String(recipe.hubUser ?? "");
  const hubPath = String(recipe.hubPath ?? "mentoring-transcripts");
  const prefix = String(recipe.prefix ?? "");
  const threads = Number(recipe.threads ?? 8);

  if (!workerScriptPath || !hubHost || !hubUser) {
    return { valid: false, error: "workerScriptPath, hubHost, hubUser required" };
  }

  const remoteWorker = `${machine.sshUser}@${machine.tailscaleHost}:~/worker.sh`;
  const scpArgs = ["-q", workerScriptPath, remoteWorker];
  const scpLabel = `scp ${workerScriptPath} → ${remoteWorker}`;

  // Build the remote command chain. The subshell-wrap around the nohup line
  // is load-bearing: `nohup ... & && next` is a zsh/bash parse error, so we
  // wrap in `( ... & )` to keep the trailing & from colliding with the join's
  // `&&`. See [[Yantra]] memory for the bug history.
  const remoteCmd = [
    `chmod +x ~/worker.sh`,
    `ssh-keyscan -t ed25519 ${hubHost} 2>/dev/null >> ~/.ssh/known_hosts || true`,
    `pkill -f worker.sh 2>/dev/null; sleep 1; true`,
    `( PATH=/usr/local/bin:/opt/homebrew/bin:$PATH HUB=${hubHost} HUB_USER=${hubUser} HUB_PATH='${hubPath}' WORKER_NAME=${machine.name} PREFIX='${prefix}' THREADS=${threads} nohup ~/worker.sh > ~/worker.out 2>&1 & )`,
    `sleep 3; tail -n 5 ~/mentoring-transcripts-worker/logs/worker.log ~/ps-course-text-worker/logs/worker.log 2>/dev/null || echo 'no log yet'`,
  ].join(" && ");

  return {
    valid: true,
    params: { workerScriptPath, hubHost, hubUser, hubPath, prefix, threads },
    steps: {
      scp: { args: scpArgs, label: scpLabel },
      ssh: {
        target: { host: machine.tailscaleHost, user: machine.sshUser },
        command: remoteCmd,
        label: `Starting worker on ${machine.name} (prefix=${prefix || "<any>"}, threads=${threads})`,
      },
    },
  };
}

// ─── shell ────────────────────────────────────────────────────────────────────

export type ShellPreview =
  | { valid: true; target: SshTarget; command: string; label: string }
  | { valid: false; error: string };

export function buildShellCommand(
  machine: Pick<Machine, "tailscaleHost" | "sshUser">,
  recipe: Record<string, unknown>,
): ShellPreview {
  const command = String(recipe.command ?? "");
  if (!command) return { valid: false, error: "no command in recipe" };
  return {
    valid: true,
    target: { host: machine.tailscaleHost, user: machine.sshUser },
    command,
    label: `ssh ${machine.sshUser}@${machine.tailscaleHost} '<command>'`,
  };
}
