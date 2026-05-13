"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface Props {
  machineId: number;
  machineName: string;
  hubHost: string; // Tailscale IP or hostname of the hub
  onClose: () => void;
}

export function Terminal({ machineId, machineName, hubHost, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "closed" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new XTerm({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: {
        background: "#0b0e14",
        foreground: "#c8d3f5",
        cursor: "#fffaf3",
        cursorAccent: "#0b0e14",
        selectionBackground: "#374a51",
      },
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const ws = new WebSocket(`ws://${hubHost}:3002/?machineId=${machineId}`);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      // Clear any error from a prior connection attempt (React StrictMode
      // double-mounts effects in dev — first attempt may have errored before
      // the server fix landed).
      setError(null);
      setStatus("connecting");
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        if (e.data.startsWith("{")) {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "ready") {
              setError(null);
              setStatus("ready");
            } else if (msg.type === "error") {
              setError(msg.message);
              setStatus("error");
            }
            return;
          } catch {
            // fall through
          }
        }
        term.write(e.data);
      } else {
        // ArrayBuffer
        term.write(new Uint8Array(e.data));
      }
    };
    ws.onclose = () => setStatus("closed");
    ws.onerror = () => {
      setError("WebSocket connection failed");
      setStatus("error");
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    const onResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      try { ws.close(); } catch { /* ignore */ }
      try { term.dispose(); } catch { /* ignore */ }
    };
  }, [machineId, hubHost]);

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
        <div ref={containerRef} className="flex-1 bg-[#0b0e14] p-2" />
      </div>
    </div>
  );
}
