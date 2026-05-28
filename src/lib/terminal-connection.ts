import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export type TerminalStatus = "connecting" | "ready" | "closed" | "error";

export interface TerminalConnOpts {
  machineId: number;
  hubHost: string;
  cmd?: string;
  onStatus?: (status: TerminalStatus, error?: string) => void;
}

export interface TerminalConnection {
  host: HTMLDivElement;
  fit: () => void;
  dispose: () => void;
}

export function openTerminalConnection(opts: TerminalConnOpts): TerminalConnection {
  const host = document.createElement("div");
  host.style.width = "100%";
  host.style.height = "100%";

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
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(host);

  const q = new URLSearchParams({ machineId: String(opts.machineId) });
  if (opts.cmd) q.set("cmd", opts.cmd);
  const ws = new WebSocket(`ws://${opts.hubHost}:3002/?${q.toString()}`);
  ws.binaryType = "arraybuffer";

  const sendResize = () => {
    try {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    } catch { /* not in DOM yet */ }
  };

  opts.onStatus?.("connecting");
  ws.onopen = () => {
    opts.onStatus?.("connecting");
    ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
  };
  ws.onmessage = (e) => {
    if (typeof e.data === "string") {
      if (e.data.startsWith("{")) {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "ready") {
            opts.onStatus?.("ready");
            // The server only registers its resize handler once the PTY shell
            // is ready, so the initial onopen resize is dropped and the PTY
            // keeps its default 100 cols (garbles width-aware TUIs like Claude
            // Code). Re-fit and re-send the real size now that the shell exists.
            try {
              fitAddon.fit();
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
              }
            } catch { /* ignore */ }
            return;
          }
          if (msg.type === "error") {
            opts.onStatus?.("error", msg.message);
            return;
          }
        } catch { /* fall through — treat as terminal data */ }
      }
      term.write(e.data);
    } else {
      term.write(new Uint8Array(e.data));
    }
  };
  ws.onclose = () => opts.onStatus?.("closed");
  ws.onerror = () => opts.onStatus?.("error", "WebSocket connection failed");
  term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(d); });

  const dispose = () => {
    try { ws.close(); } catch { /* ignore */ }
    try { term.dispose(); } catch { /* ignore */ }
  };

  return { host, fit: sendResize, dispose };
}
