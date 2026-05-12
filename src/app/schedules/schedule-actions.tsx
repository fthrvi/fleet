"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteSchedule, runScheduleNow, updateSchedule } from "@/actions/schedules";

export function ScheduleActions({ id, enabled }: { id: number; enabled: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runScheduleNow(id);
            if (r.ok && r.jobId) router.push(`/jobs/${r.jobId}`);
          })
        }
      >
        Run now
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await updateSchedule({ id, enabled: !enabled });
            router.refresh();
          })
        }
      >
        {enabled ? "Pause" : "Resume"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this schedule?")) return;
          start(async () => {
            await deleteSchedule(id);
            router.refresh();
          });
        }}
      >
        Delete
      </Button>
    </div>
  );
}
