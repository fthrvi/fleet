"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { refreshAllMachines, syncFromTailscale } from "@/actions/machines";

export function RefreshButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => await refreshAllMachines())}
    >
      {pending ? "Probing…" : "Refresh status"}
    </Button>
  );
}

export function SyncButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await syncFromTailscale();
          if (r.created.length) {
            console.info("Imported:", r.created.join(", "));
          }
        })
      }
    >
      {pending ? "Syncing…" : "Sync from Tailscale"}
    </Button>
  );
}
