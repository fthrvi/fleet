"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TerminalView } from "../TerminalView";

type Machine = { id: number; name: string };

export function AgentTerminalNode({ data }: NodeProps) {
  const machines = (data?.machines ?? []) as Machine[];
  const hubHost = (data?.hubHost ?? "localhost") as string;
  const [machineId, setMachineId] = useState<number | null>(machines[0]?.id ?? null);
  const [started, setStarted] = useState(false);

  return (
    <div
      style={{
        width: 520,
        height: 380,
        background: "#0b0e14",
        border: "1px solid #1f2937",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div
        className="nodrag"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "6px 8px",
          borderBottom: "1px solid #1f2937",
          color: "#c8d3f5",
          fontSize: 12,
        }}
      >
        <span>🤖 claude</span>
        <select
          className="nodrag"
          value={machineId ?? ""}
          disabled={started}
          onChange={(e) => setMachineId(Number(e.target.value))}
          style={{ background: "#111827", color: "#c8d3f5", border: "1px solid #1f2937", borderRadius: 4, padding: "2px 4px" }}
        >
          {machines.length === 0 && <option value="">no machines</option>}
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {!started ? (
          <button
            className="nodrag"
            onClick={() => machineId != null && setStarted(true)}
            disabled={machineId == null}
            style={{ background: "#1f2937", color: "#c8d3f5", border: "none", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}
          >
            Start
          </button>
        ) : (
          <button
            className="nodrag"
            onClick={() => setStarted(false)}
            style={{ background: "#3f1d1d", color: "#fca5a5", border: "none", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}
          >
            Stop
          </button>
        )}
      </div>
      <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0, padding: 4 }}>
        {started && machineId != null ? (
          <TerminalView machineId={machineId} hubHost={hubHost} cmd="claude" />
        ) : (
          <div style={{ color: "#6b7280", padding: 12, fontSize: 12 }}>
            Pick a machine and press Start to launch claude.
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
