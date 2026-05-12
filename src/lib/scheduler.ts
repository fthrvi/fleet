// Cron tick. Runs every 60s. Finds enabled schedules whose nextRunAt has
// passed, dispatches the underlying template, advances nextRunAt to the
// next cron occurrence.
//
// Uses a module-level singleton so it survives Fast Refresh in dev. Avoids
// concurrent ticks via a simple boolean lock.

import { parseExpression } from "cron-parser";
import { db } from "./db";
import { dispatchTemplate } from "@/actions/jobs";
import { startWorkflowRun } from "./workflow-runner";
import { logEvent } from "./activity";

type GlobalWithScheduler = typeof globalThis & {
  __labFleetScheduler?: { interval: NodeJS.Timeout; tickInFlight: boolean };
};

const TICK_INTERVAL_MS = 60_000;

export function startScheduler() {
  const g = globalThis as GlobalWithScheduler;
  if (g.__labFleetScheduler) return;
  const state = { interval: undefined as unknown as NodeJS.Timeout, tickInFlight: false };
  state.interval = setInterval(() => void tick(state), TICK_INTERVAL_MS);
  g.__labFleetScheduler = state;
  // Run once on boot so a freshly-due schedule fires within a few seconds
  // rather than waiting for the first interval.
  setTimeout(() => void tick(state), 5_000);
  console.info("[scheduler] started, tick every", TICK_INTERVAL_MS / 1000, "s");
}

async function tick(state: { tickInFlight: boolean }) {
  if (state.tickInFlight) return;
  state.tickInFlight = true;
  try {
    const due = await db.schedule.findMany({
      where: {
        enabled: true,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
      },
    });
    for (const schedule of due) {
      try {
        await fireSchedule(schedule);
      } catch (err) {
        console.error(`[scheduler] schedule #${schedule.id} failed:`, err);
      }
    }
    // Piggy-back health checks on every tick
    const { runDueHealthChecks } = await import("./health");
    await runDueHealthChecks();
    // And a daily backup probe
    const { maybeDailyBackup } = await import("./backup");
    await maybeDailyBackup();
  } catch (err) {
    console.error("[scheduler] tick error:", err);
  } finally {
    state.tickInFlight = false;
  }
}

async function fireSchedule(schedule: {
  id: number;
  templateId: number | null;
  workflowId: number | null;
  cronExpr: string;
  machineIdsJson: string;
  recipeOverrideJson: string | null;
  maxRetries: number;
}) {
  // Workflow-backed schedule: just kick off the workflow run, ignore machines (each step has its own).
  if (schedule.workflowId) {
    try {
      const runId = await startWorkflowRun(schedule.workflowId, "schedule");
      await db.schedule.update({
        where: { id: schedule.id },
        data: { lastWorkflowRunId: runId },
      });
      await logEvent({
        category: "schedule",
        kind: "fired",
        message: `Schedule fired → workflow run #${runId}`,
        scheduleId: schedule.id,
      });
    } catch (err) {
      await logEvent({
        category: "schedule",
        kind: "fire-failed",
        level: "error",
        message: `Workflow schedule fire failed: ${err instanceof Error ? err.message : String(err)}`,
        scheduleId: schedule.id,
      });
    }
  } else if (schedule.templateId) {
    let machineIds: number[] = [];
    try {
      machineIds = JSON.parse(schedule.machineIdsJson);
    } catch {
      // ignore
    }
    let recipeOverride: Record<string, unknown> | undefined;
    if (schedule.recipeOverrideJson) {
      try {
        recipeOverride = JSON.parse(schedule.recipeOverrideJson);
      } catch {
        // ignore
      }
    }

    if (machineIds.length > 0) {
      const result = await dispatchTemplate({
        templateId: schedule.templateId,
        machineIds,
        recipeOverride,
      });
      if (result.ok) {
        await db.job.update({
          where: { id: result.jobId },
          data: {
            triggeredBy: "schedule",
            scheduleId: schedule.id,
            maxRetries: schedule.maxRetries,
          },
        });
        await db.schedule.update({
          where: { id: schedule.id },
          data: { lastJobId: result.jobId },
        });
        await logEvent({
          category: "schedule",
          kind: "fired",
          message: `Schedule fired → job #${result.jobId}`,
          scheduleId: schedule.id,
          jobId: result.jobId,
        });
      } else {
        await logEvent({
          category: "schedule",
          kind: "fire-failed",
          level: "error",
          message: `Schedule fire failed: ${result.error ?? "unknown"}`,
          scheduleId: schedule.id,
        });
      }
    }
  }

  await db.schedule.update({
    where: { id: schedule.id },
    data: { lastRunAt: new Date(), nextRunAt: computeNextRunAt(schedule.cronExpr) },
  });
}

export function computeNextRunAt(cronExpr: string): Date | null {
  try {
    const it = parseExpression(cronExpr);
    return it.next().toDate();
  } catch {
    return null;
  }
}

export function isValidCron(cronExpr: string): boolean {
  try {
    parseExpression(cronExpr);
    return true;
  } catch {
    return false;
  }
}
