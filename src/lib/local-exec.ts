// Spawn a local command with streaming stdout/stderr callbacks.
// Uses spawn (no shell) so arguments are never interpolated.

import { spawn } from "node:child_process";

export interface LocalExecHooks {
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

export function runLocalCommandStream(
  cmd: string,
  args: string[],
  hooks: LocalExecHooks,
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<{ code: number | null; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      shell: false,
    });

    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf8");
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) hooks.onStdout?.(line);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString("utf8");
      const lines = stderrBuf.split(/\r?\n/);
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) hooks.onStderr?.(line);
    });

    child.on("error", (err) => {
      resolve({ code: null, error: err.message });
    });

    child.on("close", (code) => {
      if (stdoutBuf) hooks.onStdout?.(stdoutBuf);
      if (stderrBuf) hooks.onStderr?.(stderrBuf);
      resolve({ code });
    });
  });
}
