import { Card } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import { fleetSummary } from "@/lib/fleet-summary";

export async function FleetSummaryStrip() {
  const s = await fleetSummary();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label="Machines" value={s.totalMachines.toString()} />
      <Stat label="Ready" value={s.readyMachines.toString()} accent="success" />
      <Stat label="Online (Tailnet)" value={s.onlinePeers.toString()} />
      <Stat label="Fleet disk free" value={formatBytes(s.totalDiskFreeGb)} />
      <Stat label="Active jobs" value={s.activeJobs.toString()} accent={s.activeJobs > 0 ? "primary" : undefined} />
      <Stat label="Events · 24h" value={s.recentEvents24h.toString()} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "primary" | "success" }) {
  const color = accent === "primary" ? "text-primary" : accent === "success" ? "text-success" : "text-foreground";
  return (
    <Card className="px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mono mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </Card>
  );
}
