"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteHealthCheck, probeHealthNow, toggleHealthCheck } from "@/actions/health";

export function HealthActions({ id, enabled }: { id: number; enabled: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await probeHealthNow(id); router.refresh(); })}>
        Probe now
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await toggleHealthCheck(id, !enabled); router.refresh(); })}>
        {enabled ? "Pause" : "Resume"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this check?")) return;
          start(async () => { await deleteHealthCheck(id); router.refresh(); });
        }}
      >
        Delete
      </Button>
    </div>
  );
}
