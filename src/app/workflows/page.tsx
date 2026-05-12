import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { WorkflowCreateForm } from "./workflow-create-form";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const workflows = await db.workflow.findMany({
    orderBy: { name: "asc" },
    include: {
      steps: { orderBy: { position: "asc" } },
      runs: { orderBy: { id: "desc" }, take: 1 },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workflows</h1>
        <p className="text-sm text-muted-foreground">
          Chain templates as sequential steps. A failed step stops the workflow unless its
          condition is &ldquo;always&rdquo;. Each step dispatches a regular job, so logs and
          activity events still flow through the rest of the dashboard.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowCreateForm />
        </CardContent>
      </Card>

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No workflows yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {workflows.map((w) => {
            const lastRun = w.runs[0];
            return (
              <Card key={w.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>
                      <Link href={`/workflows/${w.id}`} className="hover:underline">
                        {w.name}
                      </Link>
                    </CardTitle>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {w.steps.length} step{w.steps.length === 1 ? "" : "s"}
                      {w.description && ` · ${w.description}`}
                    </div>
                  </div>
                  {lastRun && (
                    <Badge
                      variant={
                        lastRun.status === "SUCCESS"
                          ? "success"
                          : lastRun.status === "FAILED"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      last run · {lastRun.status}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    {lastRun ? `Last ran ${formatRelative(lastRun.startedAt ?? lastRun.createdAt)}` : "Never run"}
                  </div>
                  <Link href={`/workflows/${w.id}`}>
                    <Button size="sm">Configure & run</Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
