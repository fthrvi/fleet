// Workflow execution with variables + `whenExpr` conditions + output capture.
//
// Each step dispatches a regular Job via dispatchTemplate and waits for it to
// complete. Before dispatch, the step's recipe gets `${{ ... }}` placeholders
// substituted against the run context. After completion, stdout lines matching
// `::output name=KEY::VALUE` are harvested into the step's outputs map.
//
// Step gating:
//   - whenExpr (if set) is evaluated and overrides `condition`
//   - condition fallback: "on-success" (skip after a prior failure) | "always"

import { db } from "./db";
import { dispatchTemplate } from "@/actions/jobs";
import { logEvent } from "./activity";
import { notify } from "./notify";
import { evaluateWhen, substituteRecipe, parseOutputs, type ExprContext, type StepCtx } from "./workflow-expr";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 6 * 3600 * 1000;

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
  // Running context: keyed by step.name, exposed to whenExpr + recipe ${{}}.
  const ctxSteps: Record<string, StepCtx> = {};

  for (const runStep of run.steps) {
    const step = runStep.step;

    const exprCtx: ExprContext = {
      steps: ctxSteps,
      run: { id: run.id, triggeredBy: run.triggeredBy },
    };

    // Gate the step
    let shouldRun: boolean;
    if (step.whenExpr && step.whenExpr.trim()) {
      shouldRun = evaluateWhen(step.whenExpr, exprCtx);
    } else if (step.condition === "always") {
      shouldRun = true;
    } else {
      shouldRun = !anyFailed; // on-success default
    }

    if (!shouldRun) {
      await db.workflowRunStep.update({
        where: { id: runStep.id },
        data: { status: "SKIPPED", finishedAt: new Date() },
      });
      ctxSteps[step.name] = { status: "SKIPPED", exitCode: null, outputs: {} };
      continue;
    }

    let machineIds: number[] = [];
    try {
      machineIds = JSON.parse(step.machineIdsJson);
    } catch {
      // ignore
    }
    let baseOverride: Record<string, unknown> | undefined;
    if (step.recipeOverrideJson) {
      try {
        baseOverride = JSON.parse(step.recipeOverrideJson);
      } catch {
        // ignore
      }
    }
    // Substitute ${{ ... }} placeholders in the recipe override against the
    // accumulated context. Untouched if the user didn't set one.
    const recipeOverride = baseOverride ? substituteRecipe(baseOverride, exprCtx) : undefined;

    if (machineIds.length === 0) {
      await db.workflowRunStep.update({
        where: { id: runStep.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      ctxSteps[step.name] = { status: "FAILED", exitCode: null, outputs: {} };
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
      ctxSteps[step.name] = { status: "FAILED", exitCode: null, outputs: {} };
      anyFailed = true;
      continue;
    }

    await db.workflowRunStep.update({
      where: { id: runStep.id },
      data: { jobId: dispatchResult.jobId },
    });

    const { status: finalStatus, exitCode } = await waitForJob(dispatchResult.jobId);
    const ok = finalStatus === "SUCCESS";

    // Harvest ::output lines from the job's stdout
    const outputs = await harvestOutputs(dispatchResult.jobId);

    await db.workflowRunStep.update({
      where: { id: runStep.id },
      data: {
        status: ok ? "SUCCESS" : "FAILED",
        exitCode,
        outputsJson: JSON.stringify(outputs),
        finishedAt: new Date(),
      },
    });

    ctxSteps[step.name] = {
      status: ok ? "SUCCESS" : "FAILED",
      exitCode,
      outputs,
    };

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

async function waitForJob(jobId: number): Promise<{ status: string; exitCode: number | null }> {
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_MS) {
    const job = await db.job.findUnique({
      where: { id: jobId },
      include: { assignments: true },
    });
    if (!job) return { status: "FAILED", exitCode: null };
    if (job.status !== "RUNNING" && job.status !== "PENDING") {
      // Take exit code from the first assignment (workflow steps are usually
      // single-machine; for multi-machine, the first non-null is fine).
      const ec = job.assignments.map((a) => a.exitCode).find((c) => c != null) ?? null;
      return { status: job.status, exitCode: ec };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { status: "FAILED", exitCode: null };
}

async function harvestOutputs(jobId: number): Promise<Record<string, string>> {
  const logs = await db.jobLog.findMany({
    where: { jobId, stream: "stdout" },
    orderBy: { id: "asc" },
    select: { line: true },
  });
  return parseOutputs(logs.map((l) => l.line).join("\n"));
}
