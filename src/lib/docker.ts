// Docker management over SSH. Probes the worker for `docker` and parses
// `docker ps --format json` (one JSON per line). All actions go through the
// existing runCommand wrapper.

import { runCommand } from "./ssh";
import type { Machine } from "@prisma/client";

const target = (m: Pick<Machine, "tailscaleHost" | "sshUser">) => ({
  host: m.tailscaleHost,
  user: m.sshUser,
});

export interface ContainerRow {
  id: string;
  name: string;
  image: string;
  status: string;        // human "Up 5 hours" / "Exited (0) 2 minutes ago"
  state: string;         // running | exited | paused | created
  ports: string;
  createdAt: string;
}

export interface DockerStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export async function dockerStatus(machine: Machine): Promise<DockerStatus> {
  const res = await runCommand(target(machine), "docker version --format '{{.Server.Version}}' 2>&1");
  if (res.code === 0 && res.stdout.trim()) {
    return { available: true, version: res.stdout.trim() };
  }
  return { available: false, error: res.stderr || res.stdout || "docker not installed or not running" };
}

export async function listContainers(machine: Machine): Promise<ContainerRow[]> {
  const res = await runCommand(
    target(machine),
    `docker ps -a --format '{{json .}}' 2>/dev/null`,
  );
  if (res.code !== 0 || !res.stdout.trim()) return [];
  const rows: ContainerRow[] = [];
  for (const line of res.stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      rows.push({
        id: obj.ID ?? obj.Id ?? "",
        name: obj.Names ?? obj.Name ?? "",
        image: obj.Image ?? "",
        status: obj.Status ?? "",
        state: obj.State ?? "",
        ports: obj.Ports ?? "",
        createdAt: obj.CreatedAt ?? obj.RunningFor ?? "",
      });
    } catch {
      // ignore malformed lines
    }
  }
  return rows;
}

export type ContainerAction = "start" | "stop" | "restart" | "rm" | "pause" | "unpause";

export async function controlContainer(
  machine: Machine,
  containerName: string,
  action: ContainerAction,
): Promise<{ ok: boolean; output: string; error?: string }> {
  // Whitelist of allowed actions (paranoia: action goes into command string)
  const allowed: ContainerAction[] = ["start", "stop", "restart", "rm", "pause", "unpause"];
  if (!allowed.includes(action)) return { ok: false, output: "", error: "invalid action" };
  // Container name validation — alphanumeric + dash + underscore + dot only
  if (!/^[A-Za-z0-9_.-]+$/.test(containerName)) {
    return { ok: false, output: "", error: "invalid container name" };
  }
  const flag = action === "rm" ? "-f" : "";
  const cmd = `docker ${action} ${flag} ${JSON.stringify(containerName)}`.trim();
  const res = await runCommand(target(machine), cmd);
  return {
    ok: res.code === 0,
    output: (res.stdout || "") + (res.stderr || ""),
    error: res.code === 0 ? undefined : res.stderr || res.error,
  };
}

export async function containerLogs(
  machine: Machine,
  containerName: string,
  lines = 200,
): Promise<string> {
  if (!/^[A-Za-z0-9_.-]+$/.test(containerName)) return "(invalid container name)";
  const n = Math.max(10, Math.min(2000, Math.floor(lines)));
  const res = await runCommand(
    target(machine),
    `docker logs --tail ${n} ${JSON.stringify(containerName)} 2>&1`,
  );
  return res.stdout || res.stderr || "(no output)";
}
