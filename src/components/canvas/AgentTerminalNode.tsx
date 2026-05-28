"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { TerminalView, type TerminalStatus } from "../TerminalView";

type Machine = { id: number; name: string };

export function AgentTerminalNode({ data }: NodeProps) {
  const machines = (data?.machines ?? []) as Machine[];
  const hubHost = (data?.hubHost ?? "localhost") as string;
  const [machineId, setMachineId] = useState<number | null>(machines[0]?.id ?? null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    if (machineId == null) return;
    setStatus("connecting");
    setError(null);
    setStarted(true);
  };
  const stop = () => setStarted(false);

  const statusLabel =
    status === "ready" ? "● connected"
    : status === "connecting" ? "connecting…"
    : status === "closed" ? "○ closed"
    : "● error";
  const statusColor =
    status === "ready" ? "#34d399" : status === "error" ? "#f87171" : "#9ca3af";

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
            onClick={start}
            disabled={machineId == null}
            style={{ background: "#1f2937", color: "#c8d3f5", border: "none", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}
          >
            Start
          </button>
        ) : (
          <button
            className="nodrag"
            onClick={stop}
            style={{ background: "#3f1d1d", color: "#fca5a5", border: "none", borderRadius: 4, padding: "2px 10px", cursor: "pointer" }}
          >
            Stop
          </button>
        )}
        {started && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: statusColor }}>{statusLabel}</span>
        )}
      </div>
      <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0, padding: 4, position: "relative" }}>
        {started && machineId != null ? (
          <>
            <TerminalView
              machineId={machineId}
              hubHost={hubHost}
              cmd="claude"
              onStatusChange={(s, e) => {
                setStatus(s);
                setError(e ?? null);
              }}
            />
            {error && (
              <div
                style={{
                  position: "absolute",
                  inset: 4,
                  background: "rgba(11,14,20,0.92)",
                  color: "#fca5a5",
                  fontSize: 12,
                  padding: 12,
                  overflow: "auto",
                }}
              >
                <strong>Connection failed</strong>
                <div style={{ marginTop: 6, color: "#fbcfe8", fontFamily: "ui-monospace, monospace" }}>{error}</div>
                <div style={{ marginTop: 8, color: "#9ca3af" }}>Press Stop, then Start to retry.</div>
              </div>
            )}
          </>
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
