import { db } from "@/lib/db";
import { CanvasBoard } from "@/components/canvas/CanvasBoard";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  const machines = await db.machine.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return <CanvasBoard machines={machines} />;
}
