import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { RunWatcher } from "./run-watcher";

export const dynamic = "force-dynamic";

export default async function WorkflowRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const run = await db.workflowRun.findUnique({
    where: { id },
    include: {
      workflow: true,
      steps: { include: { step: true }, orderBy: { position: "asc" } },
    },
  });
  if (!run) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">
          {run.workflow.name} <span className="text-muted-foreground">· run #{run.id}</span>
        </h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <Badge variant={run.status === "SUCCESS" ? "success" : run.status === "FAILED" ? "destructive" : "secondary"}>
            {run.status}
          </Badge>
          <span>Started {formatRelative(run.startedAt ?? run.createdAt)}</span>
          {run.finishedAt && <span>Finished {formatRelative(run.finishedAt)}</span>}
        </div>
      </div>

      <RunWatcher runId={id} initial={run.steps.map((s) => ({
        id: s.id,
        position: s.position,
        name: s.step.name,
        status: s.status,
        jobId: s.jobId,
        startedAt: s.startedAt?.toISOString() ?? null,
        finishedAt: s.finishedAt?.toISOString() ?? null,
      }))} />
    </div>
  );
}
