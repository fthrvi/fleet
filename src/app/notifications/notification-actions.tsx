"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteChannel, toggleChannel, testChannel } from "@/actions/notifications";

export function NotificationActions({ id, enabled }: { id: number; enabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !enabled}
          onClick={() =>
            start(async () => {
              const r = await testChannel(id);
              setMsg(r.ok ? "Sent test" : `Failed: ${r.error}`);
              setTimeout(() => setMsg(null), 4000);
            })
          }
        >
          Test
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => start(async () => { await toggleChannel(id, !enabled); router.refresh(); })}
        >
          {enabled ? "Pause" : "Resume"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this channel?")) return;
            start(async () => { await deleteChannel(id); router.refresh(); });
          }}
        >
          Delete
        </Button>
      </div>
      {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
    </div>
  );
}
