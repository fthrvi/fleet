"use client";

import { useEffect } from "react";
import { TerminalSlot } from "./TerminalSlot";
import { useFocus } from "./focus-context";

type Session = { sessionId: string; machineId: number; hubHost: string; cmd: string; label: string };

export function FocusOverlay({ session }: { session: Session }) {
  const { setFocused } = useFocus();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setFocused]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#0b0e14", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid #1f2937", color: "#c8d3f5", fontSize: 13 }}>
        <span>🤖 {session.label}</span>
        <button
          onClick={() => setFocused(null)}
          style={{ marginLeft: "auto", background: "#1f2937", color: "#c8d3f5", border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
        >⤡ back to canvas (Esc)</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TerminalSlot sessionId={session.sessionId} machineId={session.machineId} hubHost={session.hubHost} cmd={session.cmd} />
      </div>
    </div>
  );
}
