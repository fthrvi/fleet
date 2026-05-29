// Zombie reaper: marks JobAssignment rows stuck in RUNNING for too long as
// FAILED with a reaped-by-hub message. Handles the case where the hub
// crashed mid-dispatch — the assignment was created with status=RUNNING
// but finishedAt never got set, so the UI shows a forever spinner.
//
// Two callers:
//   - One-shot at instrumentation boot (clears pre-existing zombies left
//     over from a previous hub process)
//   - Periodic from scheduler.ts on every tick
//
// Conservative thresholds: an assignment is only reaped when its startedAt
// is older than REAP_STALE_MIN ago AND no JobLog row has been written for
// it in REAP_QUIET_MIN. The second check avoids reaping a long-running but
// healthy job (one whose runner is still streaming output).

import { db } from "./db";
import { logEvent } from "./activity";

const REAP_STALE_MIN = Number(process.env.JOB_REAP_STALE_MIN ?? 30);
const REAP_QUIET_MIN = Number(process.env.JOB_REAP_QUIET_MIN ?? 10);

export interface ReapResult {
  scanned: number;
  reaped: number;
  details: Array<{ jobId: number; assignmentId: number; machine: string; ageMin: number }>;
}

export async function reapZombieAssignments(): Promise<ReapResult> {
  const staleCutoff = new Date(Date.now() - REAP_STALE_MIN * 60_000);
  const quietCutoff = new Date(Date.now() - REAP_QUIET_MIN * 60_000);

  const candidates = await db.jobAssignment.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: staleCutoff },
    },
    include: { machine: { select: { name: true } } },
  });

  const details: ReapResult["details"] = [];

  for (const a of candidates) {
    // Quietness check: any log line newer than quietCutoff means the runner
    // is still streaming — skip.
    const recentLog = await db.jobLog.findFirst({
      where: {
        jobId: a.jobId,
        machine: a.machine.name,
        ts: { gt: quietCutoff },
      },
      select: { id: true },
    });
    if (recentLog) continue;

    const ageMin = Math.floor((Date.now() - (a.startedAt?.getTime() ?? 0)) / 60_000);
    await db.jobAssignment.update({
      where: { id: a.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        stderr: `reaped by hub: assignment was RUNNING for ${ageMin} min with no log activity for at least ${REAP_QUIET_MIN} min (hub likely crashed mid-dispatch)`,
      },
    });
    await db.jobLog.create({
      data: {
        jobId: a.jobId,
        machine: a.machine.name,
        stream: "system",
        line: `Reaped · stuck RUNNING for ${ageMin} min · marked FAILED`,
      },
    });
    details.push({
      jobId: a.jobId,
      assignmentId: a.id,
      machine: a.machine.name,
      ageMin,
    });

    // Update the parent Job's status if every assignment is now terminal.
    const sibs = await db.jobAssignment.findMany({
      where: { jobId: a.jobId },
      select: { status: true },
    });
    const anyRunning = sibs.some((s) => s.status === "RUNNING");
    if (!anyRunning) {
      const anyFailed = sibs.some((s) => s.status === "FAILED");
      await db.job.update({
        where: { id: a.jobId },
        data: {
          status: anyFailed ? "FAILED" : "SUCCESS",
          finishedAt: new Date(),
        },
      });
    }
  }

  if (details.length > 0) {
    await logEvent({
      category: "job",
      kind: "reaped",
      level: "warn",
      message: `Reaped ${details.length} zombie assignment(s): ${details
        .map((d) => `${d.machine}(${d.ageMin}m)`)
        .join(", ")}`,
    });
    console.warn(
      `[reaper] reaped ${details.length} zombie assignment(s):`,
      details.map((d) => `job#${d.jobId}/${d.machine}@${d.ageMin}m`).join(", "),
    );
  }

  return { scanned: candidates.length, reaped: details.length, details };
}
