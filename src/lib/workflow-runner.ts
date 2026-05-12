// Workflow execution. Each step dispatches a regular Job via dispatchTemplate
// and waits for it to complete by polling Job.status. A step's `condition`
// controls whether it runs after a prior failure:
//   "on-success" — skip remaining steps if any prior step failed
//   "always"     — run regardless of previous outcome
//
// Re-uses the existing Job + JobAssignment + JobLog plumbing so all the
// streaming UI just works.

import { db } from "./db";
import { dispatchTemplate } from "@/actions/jobs";
import { logEvent } from "./activity";
import { notify } from "./notify";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 6 * 3600 * 1000; // 6 hour ceiling per step

export async function startWorkflowRun(workflowId: number, triggeredBy = "manual"): Promise<number> {
  const workflow = await db.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!workflow) throw new Error("workflow not found");
  if (workflow.steps.length === 0) throw new Error("workflow has no steps");

  const run = await db.workflowRun.create({
    data: {
      workflowId,
      status: "RUNNING",
      startedAt: new Date(),
      triggeredBy,
      steps: {
        create: workflow.steps.map((s) => ({
          stepId: s.id,
          position: s.position,
          status: "PENDING",
        })),
      },
    },
  });

  await logEvent({
    category: "system",
    kind: "workflow-start",
    message: `Workflow '${workflow.name}' started as run #${run.id}`,
  });

  // Fire-and-forget background execution
  void executeWorkflowRun(run.id).catch((err) => {
    console.error(`[workflow] run #${run.id} crashed:`, err);
  });

  return run.id;
}

async function executeWorkflowRun(runId: number) {
  const run = await db.workflowRun.findUnique({
    where: { id: runId },
    include: {
      workflow: { include: { steps: { orderBy: { position: "asc" } } } },
      steps: { include: { step: true }, orderBy: { position: "asc" } },
    },
  });
  if (!run) return;

  let anyFailed = false;

  for (const runStep of run.steps) {
    const step = runStep.step;

    if (anyFailed && step.condition !== "always") {
      await db.workflowRunStep.update({
        where: { id: runStep.id },
        data: { status: "SKIPPED", finishedAt: new Date() },
      });
      continue;
    }

    let machineIds: number[] = [];
    try {
      machineIds = JSON.parse(step.machineIdsJson);
    } catch {
      // ignore
    }
    let recipeOverride: Record<string, unknown> | undefined;
    if (step.recipeOverrideJson) {
      try {
        recipeOverride = JSON.parse(step.recipeOverrideJson);
      } catch {
        // ignore
      }
    }

    if (machineIds.length === 0) {
      await db.workflowRunStep.update({
        where: { id: runStep.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      anyFailed = true;
      continue;
    }

    await db.workflowRunStep.update({
      where: { id: runStep.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const dispatchResult = await dispatchTemplate({
      templateId: step.templateId,
      machineIds,
      recipeOverride,
    });

    if (!dispatchResult.ok) {
      await db.workflowRunStep.update({
        where: { id: runStep.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      anyFailed = true;
      continue;
    }

    await db.workflowRunStep.update({
      where: { id: runStep.id },
      data: { jobId: dispatchResult.jobId },
    });

    // Poll until the job is no longer RUNNING
    const finalStatus = await waitForJob(dispatchResult.jobId);
    const ok = finalStatus === "SUCCESS";

    await db.workflowRunStep.update({
      where: { id: runStep.id },
      data: {
        status: ok ? "SUCCESS" : "FAILED",
        finishedAt: new Date(),
      },
    });

    if (!ok) anyFailed = true;
  }

  await db.workflowRun.update({
    where: { id: runId },
    data: {
      status: anyFailed ? "FAILED" : "SUCCESS",
      finishedAt: new Date(),
    },
  });

  await logEvent({
    category: "system",
    kind: anyFailed ? "workflow-failed" : "workflow-succeeded",
    level: anyFailed ? "error" : "success",
    message: `Workflow run #${runId} ${anyFailed ? "failed" : "succeeded"}`,
  });

  if (anyFailed) {
    void notify({
      trigger: "jobFailed",
      level: "error",
      title: `❌ Workflow run #${runId} failed`,
      message: `'${run.workflow.name}' had at least one failed step`,
      url: `/workflows/runs/${runId}`,
    });
  }
}

async function waitForJob(jobId: number): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_MS) {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) return "FAILED";
    if (job.status !== "RUNNING" && job.status !== "PENDING") return job.status;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return "FAILED";
}
