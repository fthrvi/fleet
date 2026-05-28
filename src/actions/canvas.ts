"use server";

import { db } from "@/lib/db";

export async function loadCanvas(): Promise<string> {
  const row = await db.canvas.findUnique({ where: { id: 1 } });
  return row?.graphJson ?? '{"nodes":[],"edges":[]}';
}

export async function saveCanvas(graphJson: string): Promise<void> {
  await db.canvas.upsert({
    where: { id: 1 },
    create: { id: 1, graphJson },
    update: { graphJson },
  });
}
