// Boots once per server start. Starts:
//   1. Cron scheduler tick — fires due schedules + health checks
//   2. Metrics sampler — periodic SSH probe of READY machines
//   3. WebSocket terminal server — bridges browser xterm.js to SSH shells

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    const { startSampler } = await import("./lib/sampler");
    const { startInventorySampler } = await import("./lib/inventory-sampler");
    const { startTerminalServer } = await import("./lib/terminal-server");
    const { reapZombieAssignments } = await import("./lib/zombie-reaper");
    startScheduler();
    startSampler();
    startInventorySampler();
    startTerminalServer();
    // One-shot at boot: clean up any JobAssignment rows that were stuck in
    // RUNNING from a prior hub crash. The scheduler tick then keeps them
    // clean periodically.
    void reapZombieAssignments().then((r) => {
      if (r.reaped > 0) console.info(`[reaper] boot cleanup: reaped ${r.reaped} zombie(s)`);
    });
  }
}
