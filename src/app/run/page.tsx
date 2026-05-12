import { db } from "@/lib/db";
import { RunForm } from "./run-form";

export const dynamic = "force-dynamic";

export default async function RunPage() {
  const machines = await db.machine.findMany({
    where: { status: { not: "DISABLED" } },
    orderBy: { name: "asc" },
  });
  const eligible = machines.filter((m) => m.sshUser);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run on fleet</h1>
        <p className="text-sm text-muted-foreground">
          Paste a shell command, pick one or more machines, dispatch. Output streams to the job log.
        </p>
      </div>

      {eligible.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          No machines have SSH users set yet. Sync from Tailscale on the Fleet page, then set users
          before dispatching.
        </div>
      ) : (
        <RunForm machines={eligible} />
      )}
    </div>
  );
}
