// Periodic inventory probe — runs runInventoryProbeAll() on a slow interval.
// Default every 5 minutes. Cheap (one SSH per machine, ~3-5s total).

import { runInventoryProbeAll } from "./inventory-probe";

const INVENTORY_INTERVAL_SEC = Number(process.env.INVENTORY_INTERVAL_SEC ?? 300);

type GlobalWithInventory = typeof globalThis & {
  __labFleetInventory?: { interval: NodeJS.Timeout; inFlight: boolean };
};

export function startInventorySampler() {
  const g = globalThis as GlobalWithInventory;
  if (g.__labFleetInventory) return;
  const state = { interval: undefined as unknown as NodeJS.Timeout, inFlight: false };
  state.interval = setInterval(() => void tick(state), INVENTORY_INTERVAL_SEC * 1000);
  g.__labFleetInventory = state;
  // First run after 15s so the metrics sampler's burst settles first.
  setTimeout(() => void tick(state), 15_000);
  console.info(`[inventory] started, every ${INVENTORY_INTERVAL_SEC}s`);
}

async function tick(state: { inFlight: boolean }) {
  if (state.inFlight) return;
  state.inFlight = true;
  try {
    const r = await runInventoryProbeAll();
    if (r.failed.length > 0) {
      console.warn(
        `[inventory] probed=${r.probed} ok=${r.ok} failed=${r.failed.length}:`,
        r.failed.map((f) => `${f.name}(${f.error})`).join(", "),
      );
    } else {
      console.info(`[inventory] probed=${r.probed} ok=${r.ok}`);
    }
  } catch (err) {
    console.error("[inventory] tick error:", err);
  } finally {
    state.inFlight = false;
  }
}
