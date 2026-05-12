"use server";

import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["discord", "pushover", "slack", "macos"]),
  configJson: z.string(),
});

export async function createChannel(input: z.infer<typeof createSchema>) {
  const parsed = createSchema.parse(input);
  try {
    JSON.parse(parsed.configJson);
  } catch {
    return { ok: false as const, error: "configJson must be valid JSON" };
  }
  const created = await db.notificationChannel.create({
    data: parsed,
  });
  revalidatePath("/notifications");
  return { ok: true as const, id: created.id };
}

export async function toggleChannel(id: number, enabled: boolean) {
  await db.notificationChannel.update({ where: { id }, data: { enabled } });
  revalidatePath("/notifications");
}

export async function deleteChannel(id: number) {
  await db.notificationChannel.delete({ where: { id } });
  revalidatePath("/notifications");
}

export async function testChannel(id: number) {
  const ch = await db.notificationChannel.findUnique({ where: { id } });
  if (!ch) return { ok: false as const, error: "not found" };
  // Temporarily enable just-this-channel for a single test
  try {
    await notify({
      trigger: "jobSucceeded",
      level: "info",
      title: "🧪 Test notification",
      message: `Hello from lab-fleet · channel '${ch.name}' (${ch.kind})`,
    });
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
