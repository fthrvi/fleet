import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { JobStream } from "./job-stream";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const job = await db.job.findUnique({
    where: { id },
    include: { assignments: { include: { machine: true } } },
  });
  if (!job) notFound();

  const recipe = JSON.parse(job.recipeJson) as { command?: string; description?: string };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">
          Job #{job.id} <span className="text-muted-foreground">· {job.kind}</span>
        </h1>
        {recipe.command && (
          <pre className="mono mt-2 whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-xs">
            {recipe.command}
          </pre>
        )}
      </div>

      <JobStream jobId={job.id} />
    </div>
  );
}
