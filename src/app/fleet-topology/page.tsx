import { db } from "@/lib/db";
import { TopologyRows } from "./topology-rows";

export const dynamic = "force-dynamic";

export default async function FleetTopologyPage() {
  const machines = await db.machine.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, osVersion: true,
      hubEligible: true, modelServer: true, worker: true,
      isActiveHub: true, modelEndpoints: true,
    },
  });
  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold">Fleet / Topology</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Assign roles per machine. The active hub holds the canonical DB; model servers serve LLM inference; workers run agents/jobs.
      </p>
      <TopologyRows machines={machines} />
    </div>
  );
}
