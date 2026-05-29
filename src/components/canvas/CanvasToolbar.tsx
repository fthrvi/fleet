"use client";

import { useState } from "react";
import type { Node } from "@xyflow/react";

type Machine = { id: number; name: string };

export function CanvasToolbar({ machines, hubHost, onAdd }: { machines: Machine[]; hubHost: string; onAdd: (n: Node) => void }) {
  const [open, setOpen] = useState(false);
  const [machineId, setMachineId] = useState<number | null>(machines[0]?.id ?? null);
  const [cwd, setCwd] = useState("");
  const [command, setCommand] = useState("claude");

  const addSession = () => {
    if (machineId == null) return;
    const id = `s-${Date.now()}`;
    onAdd({
      id, type: "agentTerminal",
      position: { x: 80 + Math.random() * 120, y: 80 + Math.random() * 120 },
      width: 520, height: 360,
      data: { machineId, hubHost, command, cwd: cwd || undefined, label: machines.find((m) => m.id === machineId)?.name },
    } as Node);
    setOpen(false);
  };
  const addProject = () => {
    const id = `p-${Date.now()}`;
    onAdd({ id, type: "project", position: { x: 60, y: 60 }, width: 600, height: 360, data: { label: "new project" } } as Node);
  };

  return (
    <div style={{ position: "absolute", zIndex: 10, top: 10, left: 10, display: "flex", gap: 8 }}>
      <a href="/" style={{ ...btn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>← Fleet</a>
      <button onClick={() => setOpen((o) => !o)} style={btn}>+ New session</button>
      <button onClick={addProject} style={btn}>+ New project</button>
      {open && (
        <div className="nodrag" style={{ position: "absolute", top: 40, left: 0, background: "#0b0e14", border: "1px solid #1f2937", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6, width: 280 }}>
          <label style={lbl}>Machine
            <select value={machineId ?? ""} onChange={(e) => setMachineId(Number(e.target.value))} style={inp}>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label style={lbl}>Project dir (cwd, optional)
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="~/projects/omni" style={inp} />
          </label>
          <label style={lbl}>Command
            <input value={command} onChange={(e) => setCommand(e.target.value)} style={inp} />
          </label>
          <button onClick={addSession} style={{ ...btn, background: "#1f2937" }}>Create</button>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = { background: "#111827", color: "#c8d3f5", border: "1px solid #1f2937", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" };
const inp: React.CSSProperties = { background: "#111827", color: "#c8d3f5", border: "1px solid #1f2937", borderRadius: 4, padding: "3px 6px", fontSize: 12, marginTop: 3, width: "100%" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", fontSize: 11, color: "#9ca3af" };
