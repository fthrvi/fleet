"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { uninstallApp } from "@/actions/apps";

interface Row {
  id: number;
  machineId: number;
  machineName: string;
  status: string;
  ports: string | null;
  tailscaleHost: string | null;
}

export function InstalledList({ installed }: { installed: Row[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function openLink(host: string | null, port: string) {
    if (!host) return;
    window.open(`http://${host}:${port}`, "_blank");
  }

  return (
    <div className="space-y-2">
      {installed.map((i) => (
        <div key={i.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="font-medium">{i.machineName}</span>
            <Badge variant={i.status === "RUNNING" ? "success" : i.status === "FAILED" ? "destructive" : "secondary"}>
              {i.status}
            </Badge>
            {i.ports && (
              <span className="text-xs text-muted-foreground">ports: {i.ports}</span>
            )}
          </div>
          <div className="flex gap-1">
            {i.ports?.split(",").map((p) => p.trim()).filter(Boolean).map((p) => (
              <Button key={p} size="sm" variant="ghost" onClick={() => openLink(i.tailscaleHost, p)}>
                Open :{p}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Uninstall this instance? Containers and volume data will be removed.`)) return;
                start(async () => {
                  const r = await uninstallApp(i.id);
                  if (r.ok) router.push(`/jobs/${r.jobId}`);
                });
              }}
            >
              Uninstall
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
