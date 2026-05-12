// Boots once per server start. Starts:
//   1. Cron scheduler tick — fires due schedules + health checks
//   2. Metrics sampler — periodic SSH probe of READY machines
//   3. WebSocket terminal server — bridges browser xterm.js to SSH shells

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    const { startSampler } = await import("./lib/sampler");
    const { startTerminalServer } = await import("./lib/terminal-server");
    startScheduler();
    startSampler();
    startTerminalServer();
  }
}
