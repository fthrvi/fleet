"use client";

import { useEffect, useRef, useState } from "react";
import { ensureSession, adopt, release, subscribeStatus } from "@/lib/terminal-registry";
import type { TerminalStatus } from "@/lib/terminal-connection";

interface Props { sessionId: string; machineId: number; hubHost: string; cmd: string; }

export function TerminalSlot({ sessionId, machineId, hubHost, cmd }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureSession(sessionId, { machineId, hubHost, cmd });
    const el = ref.current;
    if (el) adopt(sessionId, el);
    const unsub = subscribeStatus(sessionId, (s, e) => { setStatus(s); setError(e ?? null); });
    return () => { unsub(); release(sessionId); }; // release (NOT dispose) — host parks, session lives
  }, [sessionId, machineId, hubHost, cmd]);

  const color = status === "ready" ? "#34d399" : status === "error" ? "#f87171" : "#9ca3af";
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative" }}>
      <div className="nodrag" style={{ display: "flex", alignItems: "center", padding: "4px 8px", fontSize: 11, color }}>
        <span style={{ marginLeft: "auto" }}>
          {status === "ready" ? "● connected" : status === "connecting" ? "connecting…" : status === "closed" ? "○ closed" : "● error"}
        </span>
      </div>
      <div className="nodrag nowheel" ref={ref} style={{ flex: 1, minHeight: 0, padding: 4 }} />
      {error && (
        <div style={{ position: "absolute", inset: 4, top: 28, background: "rgba(11,14,20,.92)", color: "#fca5a5", fontSize: 12, padding: 12, overflow: "auto" }}>
          <strong>Connection failed</strong>
          <div style={{ marginTop: 6, fontFamily: "ui-monospace, monospace" }}>{error}</div>
          <div style={{ marginTop: 8, color: "#9ca3af" }}>Reload the page to retry.</div>
        </div>
      )}
    </div>
  );
}
