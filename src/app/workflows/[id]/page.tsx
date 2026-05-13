import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { WorkflowStepForm } from "./workflow-step-form";
import { WorkflowActions } from "./workflow-actions";
import { StepRow } from "./step-row";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [workflow, templates, machines] = await Promise.all([
    db.workflow.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { position: "asc" }, include: { runSteps: false } },
        runs: { orderBy: { id: "desc" }, take: 10 },
      },
    }),
    db.jobTemplate.findMany({ orderBy: { name: "asc" } }),
    db.machine.findMany({
      where: { status: { not: "DISABLED" }, sshUser: { not: "" } },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!workflow) notFound();

  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const machinesById = new Map(machines.map((m) => [m.id, m]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{workflow.name}</h1>
          {workflow.description && (
            <p className="mt-1 text-sm text-muted-foreground">{workflow.description}</p>
          )}
        </div>
        <WorkflowActions workflowId={workflow.id} canRun={workflow.steps.length > 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Steps (run sequentially)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {workflow.steps.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No steps yet. Add one below.
            </div>
          ) : (
            workflow.steps.map((s) => {
              const tmpl = templatesById.get(s.templateId);
              let machineIds: number[] = [];
              try { machineIds = JSON.parse(s.machineIdsJson); } catch { /* ignore */ }
              const machineNames = machineIds
                .map((id) => machinesById.get(id)?.name)
                .filter(Boolean)
                .join(", ");
              return (
                <StepRow
                  key={s.id}
                  step={{
                    id: s.id,
                    name: s.name,
                    position: s.position,
                    templateName: tmpl?.name ?? `template #${s.templateId}`,
                    templateKind: tmpl?.kind ?? "?",
                    condition: s.condition,
                    whenExpr: s.whenExpr,
                    machineNames,
                  }}
                />
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add step</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowStepForm
            workflowId={workflow.id}
            templates={templates}
            machines={machines}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {workflow.runs.length === 0 && (
            <div className="text-sm text-muted-foreground">No runs yet.</div>
          )}
          {workflow.runs.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
              <Link href={`/workflows/runs/${r.id}`} className="mono text-primary hover:underline">
                run #{r.id}
              </Link>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    r.status === "SUCCESS"
                      ? "success"
                      : r.status === "FAILED"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {r.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(r.finishedAt ?? r.startedAt ?? r.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
