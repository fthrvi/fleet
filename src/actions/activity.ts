"use server";

import { recentEvents } from "@/lib/activity";

export async function recentEventsAction(sinceId?: number) {
  return recentEvents(50, sinceId);
}
