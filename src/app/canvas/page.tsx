import { db } from "@/lib/db";
import { loadCanvas } from "@/actions/canvas";
import { CanvasBoard } from "@/components/canvas/CanvasBoard";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  const [machines, graphJson] = await Promise.all([
    db.machine.findMany({ where: { worker: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadCanvas(),
  ]);
  return <CanvasBoard machines={machines} initialGraphJson={graphJson} />;
}
