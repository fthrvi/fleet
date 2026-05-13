"use server";

import { db } from "@/lib/db";
import { startWorkflowRun } from "@/lib/workflow-runner";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function createWorkflow(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  const w = await db.workflow.create({
    data: { name: parsed.name, description: parsed.description ?? null },
  });
  revalidatePath("/workflows");
  return { ok: true as const, id: w.id };
}

export async function deleteWorkflow(id: number) {
  await db.workflow.delete({ where: { id } });
  revalidatePath("/workflows");
}

const addStepSchema = z.object({
  workflowId: z.number().int(),
  name: z.string().min(1).regex(/^[A-Za-z_][A-Za-z0-9_-]*$/, "Step name must be a valid identifier (letters, digits, underscore, dash)"),
  templateId: z.number().int(),
  machineIds: z.array(z.number().int()).min(1),
  recipeOverrideJson: z.string().optional(),
  condition: z.enum(["on-success", "always"]).default("on-success"),
  whenExpr: z.string().optional(),
});

export async function addWorkflowStep(input: z.infer<typeof addStepSchema>) {
  const parsed = addStepSchema.parse(input);

  // Validate recipe override is JSON-parseable if provided
  if (parsed.recipeOverrideJson) {
    try {
      JSON.parse(parsed.recipeOverrideJson);
    } catch {
      return { ok: false as const, error: "recipeOverrideJson must be valid JSON" };
    }
  }

  const max = await db.workflowStep.findFirst({
    where: { workflowId: parsed.workflowId },
    orderBy: { position: "desc" },
  });
  const position = (max?.position ?? 0) + 1;

  await db.workflowStep.create({
    data: {
      workflowId: parsed.workflowId,
      position,
      name: parsed.name,
      templateId: parsed.templateId,
      machineIdsJson: JSON.stringify(parsed.machineIds),
      recipeOverrideJson: parsed.recipeOverrideJson ?? null,
      condition: parsed.condition,
      whenExpr: parsed.whenExpr?.trim() || null,
    },
  });
  revalidatePath(`/workflows/${parsed.workflowId}`);
  return { ok: true as const };
}

export async function deleteWorkflowStep(id: number) {
  const step = await db.workflowStep.findUnique({ where: { id } });
  if (!step) return;
  await db.workflowStep.delete({ where: { id } });
  revalidatePath(`/workflows/${step.workflowId}`);
}

export async function reorderWorkflowSteps(workflowId: number, orderedIds: number[]) {
  // Two-phase update so we don't violate the unique(workflowId, position) constraint
  await db.$transaction(async (tx) => {
    for (const id of orderedIds) {
      await tx.workflowStep.update({
        where: { id },
        data: { position: -id }, // temporary negative number, guaranteed unique
      });
    }
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.workflowStep.update({
        where: { id: orderedIds[i] },
        data: { position: i + 1 },
      });
    }
  });
  revalidatePath(`/workflows/${workflowId}`);
}

export async function runWorkflowNow(id: number) {
  try {
    const runId = await startWorkflowRun(id, "manual");
    return { ok: true as const, runId };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
