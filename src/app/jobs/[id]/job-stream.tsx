"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJobLogs, getJobSnapshot } from "@/actions/jobs";
import { formatRelative } from "@/lib/utils";

type Snapshot = NonNullable<Awaited<ReturnType<typeof getJobSnapshot>>>;

interface LogLine {
  id: number;
  ts: Date;
  machine: string | null;
  stream: string;
  line: string;
}

export function JobStream({ jobId }: { jobId: number }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const lastIdRef = useRef<number | undefined>(undefined);
  const tailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const [next, newLogs] = await Promise.all([
        getJobSnapshot(jobId),
        getJobLogs(jobId, lastIdRef.current),
      ]);
      if (cancelled) return;
      if (next) setSnap(next);
      if (newLogs.length) {
        lastIdRef.current = newLogs[newLogs.length - 1].id;
        setLines((prev) => [...prev, ...newLogs].slice(-2000));
        requestAnimationFrame(() => {
          tailRef.current?.scrollTo({ top: tailRef.current.scrollHeight });
        });
      }
    }
    void tick();
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [jobId]);

  if (!snap) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {snap.assignments.map((a) => (
          <Card key={a.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>{a.machine.name}</CardTitle>
              <Badge
                variant={
                  a.status === "SUCCESS"
                    ? "success"
                    : a.status === "FAILED"
                    ? "destructive"
                    : "secondary"
                }
              >
                {a.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-0.5 text-xs text-muted-foreground">
              <div>Started {formatRelative(a.startedAt)}</div>
              {a.exitCode != null && <div>Exit code {a.exitCode}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Log</span>
            <Badge variant={snap.status === "SUCCESS" ? "success" : snap.status === "FAILED" ? "destructive" : "secondary"}>
              {snap.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            ref={tailRef}
            className="mono max-h-[480px] overflow-y-auto rounded-md border border-border bg-card p-3 text-xs leading-relaxed"
          >
            {lines.length === 0 && <div className="text-muted-foreground">No output yet…</div>}
            {lines.map((l) => (
              <div key={l.id} className="flex gap-2">
                <span className="w-28 shrink-0 truncate text-muted-foreground">
                  {l.machine ?? "system"}
                </span>
                <span
                  className={
                    l.stream === "stderr"
                      ? "text-destructive"
                      : l.stream === "system"
                      ? "text-muted-foreground"
                      : ""
                  }
                >
                  {l.line}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
