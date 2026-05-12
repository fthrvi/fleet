import { db } from "@/lib/db";
import { DeployForm } from "./deploy-form";

export const dynamic = "force-dynamic";

export default async function DeployPage() {
  const machines = await db.machine.findMany({
    where: { status: { not: "DISABLED" }, sshUser: { not: "" } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Deploy files</h1>
        <p className="text-sm text-muted-foreground">
          Drag files (or whole folders) onto the drop zone, pick target machines, click Deploy.
          Hub uploads them once, then rsyncs to each machine in parallel.
        </p>
      </div>

      {machines.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          No eligible machines. Set SSH users on the Fleet page first.
        </div>
      ) : (
        <DeployForm machines={machines} />
      )}
    </div>
  );
}
