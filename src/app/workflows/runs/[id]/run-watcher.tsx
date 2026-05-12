"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";
import { getWorkflowRunSteps } from "@/actions/workflows-poll";

interface Step {
  id: number;
  position: number;
  name: string;
  status: string;
  jobId: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export function RunWatcher({ runId, initial }: { runId: number; initial: Step[] }) {
  const [steps, setSteps] = useState<Step[]>(initial);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const next = await getWorkflowRunSteps(runId);
      if (!cancelled) setSteps(next);
    }
    const t = setInterval(tick, 2000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [runId]);

  const stillRunning = steps.some((s) => s.status === "RUNNING" || s.status === "PENDING");

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        {steps.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="mono inline-block w-6 text-right text-xs text-muted-foreground">
                {s.position}.
              </span>
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.startedAt && `Started ${formatRelative(new Date(s.startedAt))}`}
                  {s.finishedAt && ` · finished ${formatRelative(new Date(s.finishedAt))}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {s.jobId && (
                <Link href={`/jobs/${s.jobId}`} className="text-xs text-primary hover:underline">
                  job #{s.jobId} →
                </Link>
              )}
              <Badge
                variant={
                  s.status === "SUCCESS"
                    ? "success"
                    : s.status === "FAILED"
                    ? "destructive"
                    : s.status === "SKIPPED"
                    ? "secondary"
                    : "outline"
                }
              >
                {s.status}
              </Badge>
            </div>
          </div>
        ))}
        {stillRunning && (
          <div className="pt-2 text-center text-xs text-muted-foreground">
            <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-primary align-middle" />
            polling for updates…
          </div>
        )}
      </CardContent>
    </Card>
  );
}
