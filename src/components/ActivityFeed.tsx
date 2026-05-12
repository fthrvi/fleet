"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { recentEventsAction } from "@/actions/activity";

interface Event {
  id: number;
  ts: Date;
  category: string;
  kind: string;
  message: string;
  level: string;
  jobId: number | null;
  machineId: number | null;
  scheduleId: number | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  job: "bg-primary/20 text-primary",
  machine: "bg-success/20 text-success",
  schedule: "bg-secondary text-secondary-foreground",
  system: "bg-muted text-muted-foreground",
};

const LEVEL_BORDER: Record<string, string> = {
  info: "border-l-border",
  warn: "border-l-yellow-500",
  error: "border-l-destructive",
  success: "border-l-success",
};

export function ActivityFeed() {
  const [events, setEvents] = useState<Event[]>([]);
  const lastIdRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const fresh = await recentEventsAction(lastIdRef.current);
      if (cancelled || fresh.length === 0) return;
      lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((e) => e.id));
      setEvents((prev) =>
        [...fresh.map((e) => ({ ...e, ts: new Date(e.ts) })), ...prev].slice(0, 100),
      );
    }
    void tick();
    const t = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Activity feed</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" />
          live · {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No activity yet. Dispatch a job, sync from Tailscale, or fire a schedule to see events appear.
          </div>
        ) : (
          <div className="max-h-[480px] space-y-1.5 overflow-y-auto">
            {events.map((e) => (
              <div
                key={e.id}
                className={`flex items-start gap-2 border-l-2 ${LEVEL_BORDER[e.level] ?? "border-l-border"} bg-card pl-3 pr-2 py-1.5 text-sm`}
              >
                <Badge variant="outline" className={`mt-0.5 text-[10px] ${CATEGORY_COLORS[e.category] ?? ""}`}>
                  {e.category}/{e.kind}
                </Badge>
                <div className="flex-1">
                  <div>{e.message}</div>
                  <div className="text-[11px] text-muted-foreground">{formatRelative(e.ts)}</div>
                </div>
                {e.jobId && (
                  <a
                    href={`/jobs/${e.jobId}`}
                    className="mt-0.5 text-xs text-primary hover:underline"
                  >
                    job →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
