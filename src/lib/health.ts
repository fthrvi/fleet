// Health-check probes — HTTP GET or TCP connect. Called by the scheduler
// tick when a check's nextProbeAt is due (we reuse the existing tick rather
// than spinning up a separate interval).

import { db } from "./db";
import { logEvent } from "./activity";
import { notify } from "./notify";
import net from "node:net";

export async function runDueHealthChecks() {
  const checks = await db.healthCheck.findMany({ where: { enabled: true } });
  for (const c of checks) {
    const dueAt = c.lastProbeAt ? new Date(c.lastProbeAt.getTime() + c.intervalSec * 1000) : new Date(0);
    if (dueAt > new Date()) continue;
    await runHealthCheck(c.id);
  }
}

export async function runHealthCheck(id: number): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const c = await db.healthCheck.findUnique({ where: { id } });
  if (!c) return { ok: false, error: "not found" };

  const start = Date.now();
  let ok = false;
  let error: string | undefined;

  try {
    if (c.kind === "http") {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), c.timeoutMs);
      try {
        const res = await fetch(c.target, { signal: ctrl.signal });
        const expected = c.expectedStatus ?? 200;
        ok = res.status === expected;
        if (!ok) error = `status ${res.status} (expected ${expected})`;
      } finally {
        clearTimeout(t);
      }
    } else if (c.kind === "tcp") {
      const [host, port] = c.target.split(":");
      ok = await tcpConnect(host, Number(port), c.timeoutMs);
      if (!ok) error = `connect failed to ${c.target}`;
    } else {
      error = `unknown kind ${c.kind}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = Date.now() - start;
  const newStatus = ok ? "up" : "down";
  const transitioned = c.lastStatus && c.lastStatus !== newStatus;

  await db.healthCheck.update({
    where: { id },
    data: { lastStatus: newStatus, lastLatencyMs: latencyMs, lastError: error ?? null, lastProbeAt: new Date() },
  });

  if (transitioned) {
    if (newStatus === "down") {
      await logEvent({
        category: "system",
        kind: "health-down",
        level: "error",
        message: `${c.name} is DOWN${error ? `: ${error}` : ""}`,
      });
      if (c.notifyOnDown) {
        await notify({
          trigger: "healthDown",
          level: "error",
          title: `🔴 ${c.name} DOWN`,
          message: `${c.target} failed${error ? `: ${error}` : ""}`,
        });
      }
    } else {
      await logEvent({
        category: "system",
        kind: "health-up",
        level: "success",
        message: `${c.name} recovered (${latencyMs}ms)`,
      });
      await notify({
        trigger: "healthRecovered",
        level: "success",
        title: `🟢 ${c.name} recovered`,
        message: `${c.target} is back, ${latencyMs}ms`,
      });
    }
  }

  return { ok, latencyMs, error };
}

function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (val: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(val);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.connect(port, host);
  });
}
