"use client";

import { useEffect } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import { TerminalSlot } from "./TerminalSlot";
import { useFocus } from "./focus-context";
import { dispose } from "@/lib/terminal-registry";
import { buildLaunchCommand } from "@/lib/shell-cd";

type AgentData = { machineId: number; hubHost: string; command: string; cwd?: string; label?: string };

function box(border: string): React.CSSProperties {
  return { width: "100%", height: "100%", minWidth: 360, minHeight: 240, background: "#0b0e14", border: `1px solid ${border}`, borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden" };
}

export function AgentTerminalNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as AgentData;
  const { focusedId, setFocused } = useFocus();
  const isFocused = focusedId === id;

  // Dispose the session when the node is removed from the canvas.
  useEffect(() => () => { dispose(id); }, [id]);

  if (d?.machineId == null || !d?.hubHost) {
    return (
      <div style={box("#3f1d1d")}>
        <div style={{ color: "#fca5a5", fontSize: 12, padding: 12 }}>Session not configured (missing machine/host).</div>
      </div>
    );
  }
  const launch = buildLaunchCommand(d.command, d.cwd);

  return (
    <div style={box("#1f2937")} onDoubleClick={() => setFocused(id)} title="Double-click to focus">
      <NodeResizer minWidth={360} minHeight={240} isVisible={!!selected} />
      <Handle type="target" position={Position.Top} />
      {/* Header is the drag handle (NOT nodrag) so the node can be moved; the terminal body stays nodrag. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderBottom: "1px solid #1f2937", color: "#c8d3f5", fontSize: 12, cursor: "grab" }}>
        <span>⠿ 🤖 {d.label || d.command}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>drag · ⤢ dbl-click</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {isFocused
          ? <div style={{ color: "#6b7280", fontSize: 12, padding: 12 }}>focused ↗ (running full-screen)</div>
          : <TerminalSlot sessionId={id} machineId={d.machineId} hubHost={d.hubHost} cmd={launch} />}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
