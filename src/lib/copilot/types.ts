// Shared types for the copilot module. Kept here (instead of in copilot.ts
// server-action file) because Next.js "use server" files can only export
// async functions, not types or constants.

import type { Proposal } from "./prompt";
import type { ShellPreview, TranscribePreview } from "../job-previews";

export interface MachinePreview {
  machineId: number;
  machineName: string;
  preview:
    | { kind: "transcribe-mp4s-worker"; data: TranscribePreview }
    | { kind: "shell"; data: ShellPreview }
    | { kind: "unsupported"; reason: string };
}

export interface ProposeResult {
  ok: boolean;
  proposal?: Proposal;
  raw?: string;
  previews?: MachinePreview[];
  snapshotMeta?: { takenAt: string; machineCount: number; templateCount: number };
  elapsedMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
}
