"use server";

import { db } from "@/lib/db";
import { computeNextRunAt, isValidCron } from "@/lib/scheduler";
import { dispatchTemplate } from "@/actions/jobs";
import { startWorkflowRun } from "@/lib/workflow-runner";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  // Exactly one of templateId or workflowId must be set
  templateId: z.number().int().optional(),
  workflowId: z.number().int().optional(),
  cronExpr: z.string().min(1),
  machineIds: z.array(z.number().int()).default([]),
  recipeOverrideJson: z.string().optional(),
  maxRetries: z.number().int().min(0).max(10).default(0),
  enabled: z.boolean().default(true),
});

export async function createSchedule(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  if (!isValidCron(parsed.cronExpr)) {
    return { ok: false as const, error: `Invalid cron expression: ${parsed.cronExpr}` };
  }
  const hasTemplate = parsed.templateId != null;
  const hasWorkflow = parsed.workflowId != null;
  if (hasTemplate === hasWorkflow) {
    return { ok: false as const, error: "Choose exactly one of template or workflow" };
  }
  if (hasTemplate && parsed.machineIds.length === 0) {
    return { ok: false as const, error: "Template schedules need at least one machine" };
  }
  const next = computeNextRunAt(parsed.cronExpr);
  const created = await db.schedule.create({
    data: {
      name: parsed.name,
      templateId: parsed.templateId ?? null,
      workflowId: parsed.workflowId ?? null,
      cronExpr: parsed.cronExpr,
      machineIdsJson: JSON.stringify(parsed.machineIds),
      recipeOverrideJson: parsed.recipeOverrideJson ?? null,
      maxRetries: parsed.maxRetries,
      enabled: parsed.enabled,
      nextRunAt: next,
    },
  });
  revalidatePath("/schedules");
  return { ok: true as const, id: created.id };
}

const updateSchema = z.object({
  id: z.number().int(),
  name: z.string().optional(),
  cronExpr: z.string().optional(),
  machineIds: z.array(z.number().int()).optional(),
  recipeOverrideJson: z.string().nullable().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  enabled: z.boolean().optional(),
});

export async function updateSchedule(input: z.infer<typeof updateSchema>) {
  const parsed = updateSchema.parse(input);
  if (parsed.cronExpr && !isValidCron(parsed.cronExpr)) {
    return { ok: false as const, error: `Invalid cron: ${parsed.cronExpr}` };
  }
  const next = parsed.cronExpr ? computeNextRunAt(parsed.cronExpr) : undefined;
  await db.schedule.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      cronExpr: parsed.cronExpr,
      machineIdsJson: parsed.machineIds ? JSON.stringify(parsed.machineIds) : undefined,
      recipeOverrideJson:
        parsed.recipeOverrideJson === undefined ? undefined : parsed.recipeOverrideJson,
      maxRetries: parsed.maxRetries,
      enabled: parsed.enabled,
      nextRunAt: next,
    },
  });
  revalidatePath("/schedules");
  return { ok: true as const };
}

export async function deleteSchedule(id: number) {
  await db.schedule.delete({ where: { id } });
  revalidatePath("/schedules");
}

export async function runScheduleNow(id: number) {
  const s = await db.schedule.findUnique({ where: { id } });
  if (!s) return { ok: false as const, error: "schedule not found" };

  // Workflow-backed schedule
  if (s.workflowId) {
    try {
      const runId = await startWorkflowRun(s.workflowId, "schedule-manual");
      await db.schedule.update({
        where: { id: s.id },
        data: { lastRunAt: new Date(), lastWorkflowRunId: runId },
      });
      revalidatePath("/schedules");
      return { ok: true as const, workflowRunId: runId };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (!s.templateId) return { ok: false as const, error: "schedule has no template or workflow" };

  let machineIds: number[] = [];
  try {
    machineIds = JSON.parse(s.machineIdsJson);
  } catch {
    // ignore
  }
  if (machineIds.length === 0) {
    return { ok: false as const, error: "schedule has no machines selected" };
  }
  let recipeOverride: Record<string, unknown> | undefined;
  if (s.recipeOverrideJson) {
    try {
      recipeOverride = JSON.parse(s.recipeOverrideJson);
    } catch {
      // ignore
    }
  }
  const result = await dispatchTemplate({
    templateId: s.templateId,
    machineIds,
    recipeOverride,
  });
  if (result.ok) {
    await db.job.update({
      where: { id: result.jobId },
      data: { triggeredBy: "schedule-manual", scheduleId: s.id, maxRetries: s.maxRetries },
    });
    await db.schedule.update({
      where: { id: s.id },
      data: { lastRunAt: new Date(), lastJobId: result.jobId },
    });
    revalidatePath("/schedules");
    return { ok: true as const, jobId: result.jobId };
  }
  return result;
}
