"use server";

import { db } from "@/lib/db";

export async function loadCanvas(): Promise<string> {
  const row = await db.canvas.findUnique({ where: { id: 1 } });
  return row?.graphJson ?? '{"nodes":[],"edges":[]}';
}

const MAX_GRAPH_BYTES = 2_000_000;

export async function saveCanvas(graphJson: string): Promise<{ ok: boolean; error?: string }> {
  // Validate before persisting: bound the size and require a {nodes,edges} shape.
  // (The app is single-user/tailnet-trusted, but stored graph data drives terminal
  // launches downstream, so we keep the persisted payload well-formed.)
  if (typeof graphJson !== "string" || graphJson.length > MAX_GRAPH_BYTES) {
    return { ok: false, error: "invalid canvas payload" };
  }
  try {
    const parsed = JSON.parse(graphJson);
    if (!Array.isArray(parsed?.nodes) || !Array.isArray(parsed?.edges)) {
      return { ok: false, error: "canvas must be {nodes,edges}" };
    }
  } catch {
    return { ok: false, error: "canvas not valid JSON" };
  }
  await db.canvas.upsert({
    where: { id: 1 },
    create: { id: 1, graphJson },
    update: { graphJson },
  });
  return { ok: true };
}
