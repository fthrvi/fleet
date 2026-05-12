"use server";

import { db } from "@/lib/db";
import { runHealthCheck } from "@/lib/health";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["http", "tcp"]),
  target: z.string().min(1),
  intervalSec: z.number().int().min(10).max(86400).default(60),
  timeoutMs: z.number().int().min(500).max(60000).default(5000),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  notifyOnDown: z.boolean().default(true),
});

export async function createHealthCheck(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  const created = await db.healthCheck.create({
    data: {
      name: parsed.name,
      kind: parsed.kind,
      target: parsed.target,
      intervalSec: parsed.intervalSec,
      timeoutMs: parsed.timeoutMs,
      expectedStatus: parsed.kind === "http" ? parsed.expectedStatus ?? 200 : null,
      notifyOnDown: parsed.notifyOnDown,
    },
  });
  revalidatePath("/health");
  return { ok: true as const, id: created.id };
}

export async function probeHealthNow(id: number) {
  const result = await runHealthCheck(id);
  revalidatePath("/health");
  return result;
}

export async function toggleHealthCheck(id: number, enabled: boolean) {
  await db.healthCheck.update({ where: { id }, data: { enabled } });
  revalidatePath("/health");
}

export async function deleteHealthCheck(id: number) {
  await db.healthCheck.delete({ where: { id } });
  revalidatePath("/health");
}
