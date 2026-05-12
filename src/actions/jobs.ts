"use server";

import { db } from "@/lib/db";
import { runCommandStream } from "@/lib/ssh";
import { RUNNERS } from "@/lib/job-runners";
import { logEvent } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const dispatchShellSchema = z.object({
  command: z.string().min(1),
  machineIds: z.array(z.number().int()).min(1),
  description: z.string().optional(),
});

export type DispatchShellInput = z.infer<typeof dispatchShellSchema>;

export async function dispatchShellJob(input: DispatchShellInput) {
  const parsed = dispatchShellSchema.parse(input);

  const machines = await db.machine.findMany({
    where: { id: { in: parsed.machineIds } },
  });
  if (machines.length === 0) {
    return { ok: false as const, error: "No valid machines" };
  }
  if (machines.some((m) => !m.sshUser)) {
    return {
      ok: false as const,
      error: "One or more selected machines have no SSH user set",
    };
  }

  const job = await db.job.create({
    data: {
      kind: "shell",
      status: "RUNNING",
      startedAt: new Date(),
      recipeJson: JSON.stringify({
        command: parsed.command,
        description: parsed.description ?? null,
      }),
      assignments: {
        create: machines.map((m) => ({
          machineId: m.id,
          status: "RUNNING",
          startedAt: new Date(),
        })),
      },
    },
    include: { assignments: true },
  });

  await db.jobLog.create({
    data: {
      jobId: job.id,
      stream: "system",
      line: `Dispatching to ${machines.length} machine(s): ${machines.map((m) => m.name).join(", ")}`,
    },
  });
  await logEvent({
    category: "job",
    kind: "dispatched",
    message: `Shell job #${job.id} dispatched to ${machines.map((m) => m.name).join(", ")}`,
    jobId: job.id,
  });

  // Fire-and-forget per-machine execution.
  for (const assignment of job.assignments) {
    const machine = machines.find((m) => m.id === assignment.machineId);
    if (!machine) continue;
    void runOnMachine(job.id, assignment.id, machine, parsed.command);
  }

  revalidatePath("/jobs");
  return { ok: true as const, jobId: job.id };
}

async function runOnMachine(
  jobId: number,
  assignmentId: number,
  machine: { id: number; name: string; tailscaleHost: string; sshUser: string },
  command: string,
) {
  const start = Date.now();
  try {
    const result = await runCommandStream(
      { host: machine.tailscaleHost, user: machine.sshUser },
      command,
      {
        onStdout: (line) => {
          void db.jobLog.create({
            data: { jobId, machine: machine.name, stream: "stdout", line },
          });
        },
        onStderr: (line) => {
          void db.jobLog.create({
            data: { jobId, machine: machine.name, stream: "stderr", line },
          });
        },
      },
    );

    const ok = result.code === 0;
    await db.jobAssignment.update({
      where: { id: assignmentId },
      data: {
        status: ok ? "SUCCESS" : "FAILED",
        exitCode: result.code,
        finishedAt: new Date(),
        stderr: result.error ?? null,
      },
    });
    await db.jobLog.create({
      data: {
        jobId,
        machine: machine.name,
        stream: "system",
        line: `Exit ${result.code} after ${Math.round((Date.now() - start) / 1000)}s${result.error ? ` (${result.error})` : ""}`,
      },
    });
  } catch (err) {
    await db.jobAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        stderr: err instanceof Error ? err.message : String(err),
      },
    });
    await db.jobLog.create({
      data: {
        jobId,
        machine: machine.name,
        stream: "system",
        line: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
  }

  // Roll up overall job status when all assignments are done.
  const remaining = await db.jobAssignment.count({
    where: { jobId, status: { in: ["RUNNING", "PENDING"] } },
  });
  if (remaining === 0) {
    const fails = await db.jobAssignment.count({ where: { jobId, status: "FAILED" } });
    await db.job.update({
      where: { id: jobId },
      data: {
        status: fails > 0 ? "FAILED" : "SUCCESS",
        finishedAt: new Date(),
      },
    });
  }
}

const dispatchTemplateSchema = z.object({
  templateId: z.number().int(),
  machineIds: z.array(z.number().int()).min(1),
  recipeOverride: z.record(z.unknown()).optional(),
});

export async function dispatchTemplate(input: z.infer<typeof dispatchTemplateSchema>) {
  const parsed = dispatchTemplateSchema.parse(input);
  const template = await db.jobTemplate.findUnique({ where: { id: parsed.templateId } });
  if (!template) return { ok: false as const, error: "template not found" };

  const machines = await db.machine.findMany({ where: { id: { in: parsed.machineIds } } });
  if (machines.length === 0) return { ok: false as const, error: "no machines" };
  if (machines.some((m) => !m.sshUser)) {
    return { ok: false as const, error: "one or more selected machines have no SSH user set" };
  }

  const runner = RUNNERS[template.kind];
  if (!runner) return { ok: false as const, error: `unknown kind ${template.kind}` };

  const baseRecipe = JSON.parse(template.recipeJson) as Record<string, unknown>;
  const recipe = { ...baseRecipe, ...(parsed.recipeOverride ?? {}) };

  const job = await db.job.create({
    data: {
      kind: template.kind,
      templateId: template.id,
      status: "RUNNING",
      startedAt: new Date(),
      recipeJson: JSON.stringify(recipe),
      assignments: {
        create: machines.map((m) => ({
          machineId: m.id,
          status: "RUNNING",
          startedAt: new Date(),
        })),
      },
    },
    include: { assignments: true },
  });

  await db.jobLog.create({
    data: {
      jobId: job.id,
      stream: "system",
      line: `Running template '${template.name}' on ${machines.length} machine(s): ${machines.map((m) => m.name).join(", ")}`,
    },
  });
  await logEvent({
    category: "job",
    kind: "dispatched",
    message: `Template '${template.name}' dispatched as job #${job.id} on ${machines.map((m) => m.name).join(", ")}`,
    jobId: job.id,
  });

  for (const assignment of job.assignments) {
    const machine = machines.find((m) => m.id === assignment.machineId);
    if (!machine) continue;
    void runTemplateAssignment(job.id, assignment.id, machine, template.kind, recipe);
  }

  revalidatePath("/jobs");
  return { ok: true as const, jobId: job.id };
}

async function runTemplateAssignment(
  jobId: number,
  assignmentId: number,
  machine: { id: number; name: string; tailscaleHost: string; sshUser: string },
  kind: string,
  recipe: Record<string, unknown>,
) {
  const runner = RUNNERS[kind];
  if (!runner) {
    await db.jobAssignment.update({
      where: { id: assignmentId },
      data: { status: "FAILED", finishedAt: new Date(), stderr: `unknown kind ${kind}` },
    });
    return;
  }

  // Read maxRetries from the job header
  const job = await db.job.findUnique({ where: { id: jobId } });
  const maxRetries = job?.maxRetries ?? 0;

  // Need the full Machine row for runners
  const full = await db.machine.findUnique({ where: { id: machine.id } });
  if (!full) return;

  const hooks = {
    onStdout: (line: string) => {
      void db.jobLog.create({
        data: { jobId, machine: machine.name, stream: "stdout", line },
      });
    },
    onStderr: (line: string) => {
      void db.jobLog.create({
        data: { jobId, machine: machine.name, stream: "stderr", line },
      });
    },
    onSystem: (line: string) => {
      void db.jobLog.create({
        data: { jobId, machine: machine.name, stream: "system", line },
      });
    },
  };

  let attempt = 0;
  let lastResult: { code: number | null; error?: string } = { code: null };

  while (attempt <= maxRetries) {
    const start = Date.now();
    try {
      if (attempt > 0) {
        await db.jobLog.create({
          data: {
            jobId,
            machine: machine.name,
            stream: "system",
            line: `Retry attempt ${attempt}/${maxRetries}`,
          },
        });
      }
      lastResult = await runner({ machine: full, recipe }, hooks);
      const ok = lastResult.code === 0 && !lastResult.error;
      if (ok) {
        await db.jobAssignment.update({
          where: { id: assignmentId },
          data: {
            status: "SUCCESS",
            exitCode: lastResult.code,
            finishedAt: new Date(),
            retries: attempt,
          },
        });
        await db.jobLog.create({
          data: {
            jobId,
            machine: machine.name,
            stream: "system",
            line: `Done · exit ${lastResult.code} · ${Math.round((Date.now() - start) / 1000)}s${attempt > 0 ? ` · after ${attempt} retr${attempt === 1 ? "y" : "ies"}` : ""}`,
          },
        });
        break;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 5000));
        attempt += 1;
        continue;
      }
      // Out of retries
      await db.jobAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "FAILED",
          exitCode: lastResult.code,
          finishedAt: new Date(),
          stderr: lastResult.error ?? null,
          retries: attempt,
        },
      });
      await db.jobLog.create({
        data: {
          jobId,
          machine: machine.name,
          stream: "system",
          line: `Failed · exit ${lastResult.code} · ${Math.round((Date.now() - start) / 1000)}s${lastResult.error ? ` · ${lastResult.error}` : ""}${maxRetries > 0 ? ` · gave up after ${attempt} retr${attempt === 1 ? "y" : "ies"}` : ""}`,
        },
      });
      break;
    } catch (err) {
      lastResult = { code: null, error: err instanceof Error ? err.message : String(err) };
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 5000));
        attempt += 1;
        continue;
      }
      await db.jobAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          stderr: lastResult.error,
          retries: attempt,
        },
      });
      break;
    }
  }

  // Roll up the job status when all assignments finish
  const remaining = await db.jobAssignment.count({
    where: { jobId, status: { in: ["RUNNING", "PENDING"] } },
  });
  if (remaining === 0) {
    const fails = await db.jobAssignment.count({ where: { jobId, status: "FAILED" } });
    await db.job.update({
      where: { id: jobId },
      data: { status: fails > 0 ? "FAILED" : "SUCCESS", finishedAt: new Date() },
    });
    await logEvent({
      category: "job",
      kind: fails > 0 ? "failed" : "succeeded",
      level: fails > 0 ? "error" : "success",
      message:
        fails > 0
          ? `Job #${jobId} failed (${fails} assignment${fails === 1 ? "" : "s"})`
          : `Job #${jobId} succeeded`,
      jobId,
    });
    void notify({
      trigger: fails > 0 ? "jobFailed" : "jobSucceeded",
      level: fails > 0 ? "error" : "success",
      title: fails > 0 ? `❌ Job #${jobId} failed` : `✅ Job #${jobId} succeeded`,
      message:
        fails > 0
          ? `${fails} machine${fails === 1 ? "" : "s"} failed`
          : `All machines reported success`,
      url: `/jobs/${jobId}`,
    });
  }
}

export async function getJobLogs(jobId: number, sinceId?: number) {
  return db.jobLog.findMany({
    where: { jobId, id: sinceId ? { gt: sinceId } : undefined },
    orderBy: { id: "asc" },
    take: 500,
  });
}

export async function getJobSnapshot(jobId: number) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { assignments: { include: { machine: true } } },
  });
  return job;
}
