import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { HealthForm } from "./health-form";
import { HealthActions } from "./health-actions";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const checks = await db.healthCheck.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Health checks</h1>
        <p className="text-sm text-muted-foreground">
          HTTP and TCP probes on a per-check interval. Down/recovery transitions fire notifications.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New check</CardTitle>
        </CardHeader>
        <CardContent>
          <HealthForm />
        </CardContent>
      </Card>

      {checks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No checks yet. Add an HTTP URL or host:port above to begin monitoring.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {checks.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{c.name}</CardTitle>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.kind.toUpperCase()} · <span className="mono">{c.target}</span> · every {c.intervalSec}s
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    variant={
                      c.lastStatus === "up"
                        ? "success"
                        : c.lastStatus === "down"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {c.lastStatus ?? "unknown"}
                  </Badge>
                  {!c.enabled && <Badge variant="secondary">paused</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-muted-foreground">
                  {c.lastProbeAt ? `Last probe ${formatRelative(c.lastProbeAt)}` : "Never probed"}
                  {c.lastLatencyMs != null && ` · ${c.lastLatencyMs}ms`}
                </div>
                {c.lastError && (
                  <div className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                    {c.lastError}
                  </div>
                )}
                <HealthActions id={c.id} enabled={c.enabled} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
