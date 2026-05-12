import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatRelative } from "@/lib/utils";
import { MachineMetricsChart } from "./metrics-chart";
import { DockerPanel } from "./docker-panel";

export const dynamic = "force-dynamic";

export default async function MachineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const machine = await db.machine.findUnique({ where: { id } });
  if (!machine) notFound();

  const since = new Date(Date.now() - 6 * 3600 * 1000);
  const samples = await db.metricSample.findMany({
    where: { machineId: id, ts: { gte: since } },
    orderBy: { ts: "asc" },
  });

  const recentJobs = await db.jobAssignment.findMany({
    where: { machineId: id },
    orderBy: { id: "desc" },
    take: 10,
    include: { job: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{machine.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="mono">{machine.sshUser || <em className="text-destructive">no user</em>}@{machine.tailscaleHost}</span>
            <Badge variant={machine.status === "READY" ? "success" : "secondary"}>{machine.status}</Badge>
            <span>{machine.cpuCores ?? "?"} cores · {formatBytes(machine.ramGb)} RAM · {formatBytes(machine.diskFreeGb)} free</span>
            <span>Last seen {formatRelative(machine.lastSeenAt)}</span>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 6 hours · {samples.length} samples</CardTitle>
        </CardHeader>
        <CardContent>
          {samples.length < 2 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Not enough samples yet. The background sampler probes every 60s; check back shortly.
            </div>
          ) : (
            <MachineMetricsChart
              samples={samples.map((s) => ({
                ts: s.ts.toISOString(),
                cpuPercent: s.cpuPercent ?? null,
                diskFreeGb: s.diskFreeGb ?? null,
                ramTotalGb: s.ramTotalGb ?? null,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <DockerPanel machineId={id} />

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs on this machine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {recentJobs.length === 0 && (
            <div className="text-sm text-muted-foreground">No jobs have run on this machine yet.</div>
          )}
          {recentJobs.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
              <a href={`/jobs/${a.jobId}`} className="mono text-primary hover:underline">
                #{a.jobId} · {a.job.kind}
              </a>
              <div className="flex items-center gap-3">
                <Badge variant={a.status === "SUCCESS" ? "success" : a.status === "FAILED" ? "destructive" : "secondary"}>
                  {a.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatRelative(a.finishedAt ?? a.startedAt)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
