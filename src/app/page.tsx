import { db } from "@/lib/db";
import { tailscaleStatus } from "@/lib/tailscale";
import { MachineCard } from "@/components/MachineCard";
import { QueuePanel } from "@/components/QueuePanel";
import { ActivityFeed } from "@/components/ActivityFeed";
import { FleetSummaryStrip } from "@/components/FleetSummary";
import { recentSparklines } from "@/lib/fleet-summary";
import { RefreshButton, SyncButton } from "./fleet-buttons";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [machines, peers, sparklines] = await Promise.all([
    db.machine.findMany(),
    tailscaleStatus(),
    recentSparklines(40),
  ]);

  const peerByName = new Map(peers.map((p) => [p.name, p]));
  const registeredNames = new Set(machines.map((m) => m.name));
  const unregistered = peers.filter((p) => !p.isSelf && !registeredNames.has(p.name));

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fleet</h1>
          <p className="text-sm text-muted-foreground">
            {machines.length} registered · {peers.length} on Tailscale
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshButton />
          <SyncButton />
        </div>
      </section>

      <FleetSummaryStrip />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QueuePanel />
        <ActivityFeed />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Registered machines
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {machines.length === 0 && (
            <div className="col-span-full rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No machines registered yet. Click <span className="font-semibold">Sync from Tailscale</span>{" "}
              above to import all visible peers.
            </div>
          )}
          {machines.map((m) => (
            <MachineCard
              key={m.id}
              machine={m}
              peer={peerByName.get(m.name)}
              cpuSparkline={sparklines.get(m.id)}
            />
          ))}
        </div>
      </section>

      {unregistered.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Discovered on Tailscale (not yet registered)
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {unregistered.map((p) => (
              <MachineCard key={p.name} peer={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
