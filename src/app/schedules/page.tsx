import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { ScheduleForm } from "./schedule-form";
import { ScheduleActions } from "./schedule-actions";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const [schedules, templates, workflows, machines] = await Promise.all([
    db.schedule.findMany({ include: { template: true }, orderBy: { name: "asc" } }),
    db.jobTemplate.findMany({ orderBy: { name: "asc" } }),
    db.workflow.findMany({ orderBy: { name: "asc" } }),
    db.machine.findMany({
      where: { status: { not: "DISABLED" }, sshUser: { not: "" } },
      orderBy: { name: "asc" },
    }),
  ]);

  const workflowsById = new Map(workflows.map((w) => [w.id, w]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Schedules</h1>
        <p className="text-sm text-muted-foreground">
          Cron-driven recurring jobs. Tick every 60s.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleForm templates={templates} workflows={workflows} machines={machines} />
        </CardContent>
      </Card>

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No schedules yet. Create one above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            let machineIds: number[] = [];
            try {
              machineIds = JSON.parse(s.machineIdsJson);
            } catch {
              // ignore
            }
            const targetNames = machines
              .filter((m) => machineIds.includes(m.id))
              .map((m) => m.name);
            const workflowName = s.workflowId ? workflowsById.get(s.workflowId)?.name : null;
            return (
              <Card key={s.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>{s.name}</CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="mono">{s.cronExpr}</Badge>
                      {workflowName ? (
                        <span>→ workflow: {workflowName}</span>
                      ) : (
                        <>
                          <span>→ template: {s.template?.name}</span>
                          <span>·</span>
                          <span>{targetNames.length} machine{targetNames.length === 1 ? "" : "s"}</span>
                        </>
                      )}
                      {s.maxRetries > 0 && (
                        <>
                          <span>·</span>
                          <span>max {s.maxRetries} retr{s.maxRetries === 1 ? "y" : "ies"}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant={s.enabled ? "success" : "secondary"}>
                    {s.enabled ? "enabled" : "paused"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                    <span>Last run: {formatRelative(s.lastRunAt)}</span>
                    <span>
                      Next run:{" "}
                      {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "—"}
                    </span>
                    {s.lastJobId && (
                      <a href={`/jobs/${s.lastJobId}`} className="text-primary hover:underline">
                        Last job #{s.lastJobId}
                      </a>
                    )}
                    {s.lastWorkflowRunId && (
                      <a href={`/workflows/runs/${s.lastWorkflowRunId}`} className="text-primary hover:underline">
                        Last run #{s.lastWorkflowRunId}
                      </a>
                    )}
                  </div>
                  {targetNames.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Targets: <span className="mono">{targetNames.join(", ")}</span>
                    </div>
                  )}
                  <ScheduleActions id={s.id} enabled={s.enabled} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
