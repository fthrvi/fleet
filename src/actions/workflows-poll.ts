"use server";

import { db } from "@/lib/db";

export async function getWorkflowRunSteps(runId: number) {
  const steps = await db.workflowRunStep.findMany({
    where: { runId },
    include: { step: true },
    orderBy: { position: "asc" },
  });
  return steps.map((s) => ({
    id: s.id,
    position: s.position,
    name: s.step.name,
    status: s.status,
    jobId: s.jobId,
    startedAt: s.startedAt?.toISOString() ?? null,
    finishedAt: s.finishedAt?.toISOString() ?? null,
  }));
}
