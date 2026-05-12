import { db } from "./db";

export type ActivityCategory = "job" | "machine" | "schedule" | "system";
export type ActivityLevel = "info" | "warn" | "error" | "success";

export interface LogEventInput {
  category: ActivityCategory;
  kind: string;
  message: string;
  level?: ActivityLevel;
  machineId?: number | null;
  jobId?: number | null;
  scheduleId?: number | null;
}

/**
 * Persists an activity event. Never throws — activity logging is best-effort
 * and should not break the calling action if SQLite has a hiccup.
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    await db.activityEvent.create({
      data: {
        category: input.category,
        kind: input.kind,
        message: input.message,
        level: input.level ?? "info",
        machineId: input.machineId ?? null,
        jobId: input.jobId ?? null,
        scheduleId: input.scheduleId ?? null,
      },
    });
  } catch (err) {
    console.error("logEvent failed:", err);
  }
}

export async function recentEvents(limit = 100, sinceId?: number) {
  return db.activityEvent.findMany({
    where: sinceId ? { id: { gt: sinceId } } : undefined,
    orderBy: { id: "desc" },
    take: limit,
  });
}
