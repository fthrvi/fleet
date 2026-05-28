"use client";

import { useState } from "react";
import { TerminalView, TerminalStatus } from "./TerminalView";

interface Props {
  machineId: number;
  machineName: string;
  hubHost: string; // Tailscale IP or hostname of the hub
  onClose: () => void;
}

export function Terminal({ machineId, machineName, hubHost, onClose }: Props) {
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const handleStatusChange = (s: TerminalStatus, e?: string) => {
    // Clear error on connecting/ready (mirrors original ws.onopen and ready-message behaviour)
    if (s === "connecting" || s === "ready") setError(null);
    setStatus(s);
    if (e !== undefined) setError(e);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="mono font-semibold">{machineName}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span
              className={
                status === "ready"
                  ? "text-xs text-success"
                  : status === "connecting"
                  ? "text-xs text-muted-foreground"
                  : status === "closed"
                  ? "text-xs text-muted-foreground"
                  : "text-xs text-destructive"
              }
            >
              {status === "ready" ? "● connected" : status === "connecting" ? "connecting…" : status}
            </span>
            {error && <span className="text-xs text-destructive">· {error}</span>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Close
          </button>
        </div>
        <div className="flex-1 bg-[#0b0e14] p-2">
          <TerminalView
            machineId={machineId}
            hubHost={hubHost}
            onStatusChange={handleStatusChange}
          />
        </div>
      </div>
    </div>
  );
}
