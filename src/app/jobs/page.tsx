import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { EmptyState, EmptyIcons } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await db.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { assignments: { include: { machine: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      {jobs.length === 0 && (
        <EmptyState
          icon={EmptyIcons.Jobs}
          title="No jobs yet"
          description="Dispatch a job from /run, run a template, or fire a workflow. Each job's per-machine output streams here in real time."
        />
      )}
      {jobs.map((j) => (
        <Card key={j.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>
              #{j.id} · {j.kind}
            </CardTitle>
            <Badge variant={j.status === "SUCCESS" ? "success" : j.status === "FAILED" ? "destructive" : "secondary"}>
              {j.status}
            </Badge>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="text-muted-foreground">
              Created {formatRelative(j.createdAt)} · {j.assignments.length} machine
              {j.assignments.length === 1 ? "" : "s"}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
