"use client";

import { useEffect, useRef } from "react";
import { openTerminalConnection, type TerminalStatus } from "@/lib/terminal-connection";

export type { TerminalStatus };

interface Props {
  machineId: number;
  hubHost: string;
  cmd?: string;
  onStatusChange?: (status: TerminalStatus, error?: string) => void;
}

export function TerminalView({ machineId, hubHost, cmd, onStatusChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const conn = openTerminalConnection({ machineId, hubHost, cmd, onStatus: (s, e) => statusRef.current?.(s, e) });
    el.appendChild(conn.host);
    conn.fit();
    const ro = new ResizeObserver(() => conn.fit());
    ro.observe(el);
    return () => {
      ro.disconnect();
      try { el.removeChild(conn.host); } catch { /* ignore */ }
      conn.dispose();
    };
  }, [machineId, hubHost, cmd]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
