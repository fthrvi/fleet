import { db } from "./db";
import { tailscaleStatus } from "./tailscale";

export interface FleetSummary {
  totalMachines: number;
  readyMachines: number;
  onlinePeers: number;
  totalDiskFreeGb: number;
  activeJobs: number;
  recentEvents24h: number;
}

export async function fleetSummary(): Promise<FleetSummary> {
  const dayAgo = new Date(Date.now() - 86400 * 1000);
  const [machines, peers, activeJobs, eventsCount] = await Promise.all([
    db.machine.findMany({ where: { status: { not: "DISABLED" } } }),
    tailscaleStatus().catch(() => []),
    db.job.count({ where: { status: "RUNNING" } }),
    db.activityEvent.count({ where: { ts: { gte: dayAgo } } }),
  ]);
  const ready = machines.filter((m) => m.status === "READY").length;
  const onlinePeers = peers.filter((p) => p.online).length;
  const totalDiskFreeGb = machines.reduce((s, m) => s + (m.diskFreeGb ?? 0), 0);
  return {
    totalMachines: machines.length,
    readyMachines: ready,
    onlinePeers,
    totalDiskFreeGb,
    activeJobs,
    recentEvents24h: eventsCount,
  };
}

export interface SparklineData {
  machineId: number;
  samples: number[];
}

/**
 * Fetch recent CPU% samples for every machine, capped to N samples each.
 * Returns one entry per machine for inline sparkline rendering.
 */
export async function recentSparklines(sampleCount = 30): Promise<Map<number, number[]>> {
  // Pull samples for the last 90 minutes (more than enough at 60s cadence)
  const since = new Date(Date.now() - 90 * 60 * 1000);
  const rows = await db.metricSample.findMany({
    where: { ts: { gte: since } },
    orderBy: { ts: "asc" },
    select: { machineId: true, cpuPercent: true },
  });
  const byMachine = new Map<number, number[]>();
  for (const r of rows) {
    const arr = byMachine.get(r.machineId) ?? [];
    arr.push(r.cpuPercent ?? 0);
    byMachine.set(r.machineId, arr);
  }
  // Cap to last N points
  for (const [k, v] of byMachine) {
    byMachine.set(k, v.slice(-sampleCount));
  }
  return byMachine;
}
