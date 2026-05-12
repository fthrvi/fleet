import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatRelative } from "@/lib/utils";
import type { Machine } from "@prisma/client";
import type { TailscalePeer } from "@/lib/tailscale";
import { MachineActions } from "./MachineActions";
import { Sparkline } from "./Sparkline";

interface Props {
  machine?: Machine;
  peer?: TailscalePeer;
  cpuSparkline?: number[];
}

export function MachineCard({ machine, peer, cpuSparkline }: Props) {
  const isRegistered = !!machine;
  const isOnline = peer?.online ?? !!machine?.lastSeenAt;
  const name = machine?.name ?? peer?.name ?? "unknown";
  const ip = peer?.ip ?? machine?.tailscaleIp ?? "—";
  const os = peer?.os ?? machine?.osVersion ?? "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <span
            className={
              isOnline ? "h-2 w-2 rounded-full bg-success" : "h-2 w-2 rounded-full bg-muted-foreground"
            }
          />
          {machine ? (
            <Link href={`/machines/${machine.id}`} className="hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
        </CardTitle>
        <div className="flex gap-1">
          {peer?.isSelf && <Badge variant="outline">hub</Badge>}
          {isRegistered ? (
            <Badge variant={machine.status === "READY" ? "success" : "secondary"}>
              {machine.status}
            </Badge>
          ) : (
            <Badge variant="outline">unregistered</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>IP</span>
          <span className="mono">{ip}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>OS</span>
          <span className="mono">{os}</span>
        </div>
        {machine && (
          <>
            <div className="flex justify-between text-muted-foreground">
              <span>SSH user</span>
              <span className="mono">{machine.sshUser || <em className="text-destructive">unset</em>}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>CPU</span>
              <div className="flex items-center gap-2">
                {cpuSparkline && cpuSparkline.length > 1 && (
                  <span className="text-primary">
                    <Sparkline values={cpuSparkline} width={80} height={18} />
                  </span>
                )}
                <span className="mono">
                  {machine.cpuCores ?? "?"} cores{" "}
                  {machine.cpuPercent != null && `· ${machine.cpuPercent.toFixed(0)}%`}
                </span>
              </div>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>RAM</span>
              <span className="mono">{formatBytes(machine.ramGb)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Disk free</span>
              <span className="mono">{formatBytes(machine.diskFreeGb)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Last probe</span>
              <span className="mono">{formatRelative(machine.lastSeenAt)}</span>
            </div>
            <MachineActions machine={machine} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
