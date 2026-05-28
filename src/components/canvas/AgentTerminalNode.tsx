"use client";

import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { TerminalView, type TerminalStatus } from "../TerminalView";
import { useState } from "react";
import { buildLaunchCommand } from "@/lib/shell-cd";

type AgentData = { machineId: number; hubHost: string; command: string; cwd?: string; label?: string };

export function AgentTerminalNode({ data, selected }: NodeProps) {
  const d = data as unknown as AgentData;
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  // Compose a safe "cd <dir> && <command>" launch — cwd is single-quote-escaped
  // (shell metacharacters neutralized), ~ home preserved. See src/lib/shell-cd.ts.
  const launch = buildLaunchCommand(d.command, d.cwd);
  const statusColor = status === "ready" ? "#34d399" : status === "error" ? "#f87171" : "#9ca3af";

  if (d?.machineId == null || !d?.hubHost) {
    return (
      <div style={{ width: "100%", height: "100%", minWidth: 360, minHeight: 240, background: "#0b0e14", border: "1px solid #3f1d1d", borderRadius: 8, color: "#fca5a5", fontSize: 12, padding: 12 }}>
        Session not configured (missing machine/host).
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", minWidth: 360, minHeight: 240, background: "#0b0e14", border: "1px solid #1f2937", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <NodeResizer minWidth={360} minHeight={240} isVisible={!!selected} />
      <Handle type="target" position={Position.Top} />
      <div className="nodrag" style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderBottom: "1px solid #1f2937", color: "#c8d3f5", fontSize: 12 }}>
        <span>🤖 {d.label || d.command}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: statusColor }}>
          {status === "ready" ? "● connected" : status === "connecting" ? "connecting…" : status === "closed" ? "○ closed" : "● error"}
        </span>
      </div>
      <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0, padding: 4, position: "relative" }}>
        <TerminalView machineId={d.machineId} hubHost={d.hubHost} cmd={launch} onStatusChange={(s, e) => { setStatus(s); setError(e ?? null); }} />
        {error && (
          <div style={{ position: "absolute", inset: 4, background: "rgba(11,14,20,.92)", color: "#fca5a5", fontSize: 12, padding: 12, overflow: "auto" }}>
            <strong>Connection failed</strong>
            <div style={{ marginTop: 6, fontFamily: "ui-monospace, monospace" }}>{error}</div>
            <div style={{ marginTop: 8, color: "#9ca3af" }}>Reload the page to retry.</div>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
