"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export type TerminalStatus = "connecting" | "ready" | "closed" | "error";

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

    const q = new URLSearchParams({ machineId: String(machineId) });
    if (cmd) q.set("cmd", cmd);
    const ws = new WebSocket(`ws://${hubHost}:3002/?${q.toString()}`);
    ws.binaryType = "arraybuffer";

    statusRef.current?.("connecting");
    ws.onopen = () => {
      statusRef.current?.("connecting");
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        if (e.data.startsWith("{")) {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "ready") {
              statusRef.current?.("ready");
              // The server only registers its resize handler once the PTY shell
              // is ready, so the initial onopen resize is dropped and the PTY
              // keeps its default 100 cols (garbles width-aware TUIs like Claude
              // Code). Re-fit and re-send the real size now that the shell exists.
              try {
                fit.fit();
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
                }
              } catch {
                /* ignore */
              }
              return;
            }
            if (msg.type === "error") {
              statusRef.current?.("error", msg.message);
              return;
            }
          } catch {
            // fall through — treat as terminal data
          }
        }
        term.write(e.data);
      } else {
        term.write(new Uint8Array(e.data));
      }
    };
    ws.onclose = () => statusRef.current?.("closed");
    ws.onerror = () => statusRef.current?.("error", "WebSocket connection failed");

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    const sendResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener("resize", sendResize);
    const ro = new ResizeObserver(() => sendResize());
    ro.observe(containerRef.current);

    return () => {
      window.removeEventListener("resize", sendResize);
      ro.disconnect();
      try { ws.close(); } catch { /* ignore */ }
      try { term.dispose(); } catch { /* ignore */ }
    };
  }, [machineId, hubHost, cmd]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
