// Background metrics sampler. Every SAMPLE_INTERVAL_SEC, probes each READY
// machine over SSH and writes a MetricSample row. Trims samples older than
// SAMPLE_RETENTION_DAYS to keep SQLite from growing unbounded.

import { db } from "./db";
import { probeMachine } from "./ssh";

const SAMPLE_INTERVAL_SEC = Number(process.env.SAMPLE_INTERVAL_SEC ?? 60);
const SAMPLE_RETENTION_DAYS = Number(process.env.SAMPLE_RETENTION_DAYS ?? 7);

type GlobalWithSampler = typeof globalThis & {
  __labFleetSampler?: { interval: NodeJS.Timeout; inFlight: boolean };
};

export function startSampler() {
  const g = globalThis as GlobalWithSampler;
  if (g.__labFleetSampler) return;
  const state = { interval: undefined as unknown as NodeJS.Timeout, inFlight: false };
  state.interval = setInterval(() => void tick(state), SAMPLE_INTERVAL_SEC * 1000);
  g.__labFleetSampler = state;
  setTimeout(() => void tick(state), 8000);
  console.info(`[sampler] started, every ${SAMPLE_INTERVAL_SEC}s, retain ${SAMPLE_RETENTION_DAYS}d`);
}

async function tick(state: { inFlight: boolean }) {
  if (state.inFlight) return;
  state.inFlight = true;
  try {
    const machines = await db.machine.findMany({
      where: { status: "READY", sshUser: { not: "" } },
    });
    await Promise.all(machines.map((m) => sampleOne(m)));
    // Prune old samples
    const cutoff = new Date(Date.now() - SAMPLE_RETENTION_DAYS * 86400 * 1000);
    await db.metricSample.deleteMany({ where: { ts: { lt: cutoff } } });
  } catch (err) {
    console.error("[sampler] tick error:", err);
  } finally {
    state.inFlight = false;
  }
}

async function sampleOne(machine: { id: number; tailscaleHost: string; sshUser: string }) {
  const probe = await probeMachine({ host: machine.tailscaleHost, user: machine.sshUser });
  if (!probe.ok) return;
  await db.metricSample.create({
    data: {
      machineId: machine.id,
      cpuPercent: probe.cpuPercent,
      ramTotalGb: probe.ramGb,
      diskFreeGb: probe.diskFreeGb,
    },
  });
  // Also keep the Machine row's "live" columns fresh so the Fleet page sees latest values
  await db.machine.update({
    where: { id: machine.id },
    data: {
      cpuPercent: probe.cpuPercent,
      ramGb: probe.ramGb,
      diskFreeGb: probe.diskFreeGb,
      lastSeenAt: new Date(),
    },
  });
}
