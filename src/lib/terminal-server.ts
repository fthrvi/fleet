// WebSocket → SSH shell bridge for the browser terminal.
//
// Boots once via instrumentation.ts. Listens on TERMINAL_PORT (3002), bound
// to the same Tailscale IP as the Next.js dev server. For each incoming
// connection:
//   1. Parse machineId from query
//   2. Look up machine in SQLite
//   3. Open an SSH shell (PTY) channel to the machine via ssh2
//   4. Pipe channel.stdout → WS frames
//   5. WS data frames → channel.stdin
//   6. Forward 'resize' control messages → channel.setWindow
//   7. Tear everything down when either side disconnects

import { WebSocketServer, WebSocket } from "ws";
import { Client as Ssh2Client } from "ssh2";
import { homedir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { db } from "./db";

type GlobalWithTerminal = typeof globalThis & {
  __labFleetTerminal?: { wss: WebSocketServer };
};

const TERMINAL_PORT = Number(process.env.TERMINAL_PORT ?? 3002);

export function startTerminalServer() {
  const g = globalThis as GlobalWithTerminal;
  if (g.__labFleetTerminal) return;

  const host = process.env.HOST ?? "0.0.0.0";
  const wss = new WebSocketServer({ port: TERMINAL_PORT, host });

  wss.on("connection", async (ws, req) => {
    try {
      await handleConnection(ws, req.url ?? "/");
    } catch (err) {
      console.error("[terminal] connection error:", err);
      try {
        ws.close(1011, err instanceof Error ? err.message : "connection error");
      } catch {
        // ignore
      }
    }
  });

  wss.on("listening", () => {
    console.info(`[terminal] WebSocket server listening on ws://${host}:${TERMINAL_PORT}`);
  });

  g.__labFleetTerminal = { wss };
}

async function handleConnection(ws: WebSocket, url: string) {
  const params = new URL(url, "http://localhost").searchParams;
  const machineId = Number(params.get("machineId"));
  if (!Number.isFinite(machineId)) {
    ws.send(JSON.stringify({ type: "error", message: "missing machineId" }));
    ws.close();
    return;
  }
  const machine = await db.machine.findUnique({ where: { id: machineId } });
  if (!machine || !machine.sshUser) {
    ws.send(JSON.stringify({ type: "error", message: "machine not found or has no SSH user" }));
    ws.close();
    return;
  }

  const conn = new Ssh2Client();
  let shellStream: import("ssh2").ClientChannel | undefined;
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    try { shellStream?.end(); } catch { /* ignore */ }
    try { conn.end(); } catch { /* ignore */ }
    try { ws.close(); } catch { /* ignore */ }
  }

  conn.on("ready", () => {
    conn.shell({ term: "xterm-256color", rows: 30, cols: 100 }, (err, stream) => {
      if (err) {
        ws.send(JSON.stringify({ type: "error", message: `shell: ${err.message}` }));
        cleanup();
        return;
      }
      shellStream = stream;
      ws.send(JSON.stringify({ type: "ready", machine: machine.name }));

      stream.on("data", (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
      stream.stderr.on("data", (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });
      stream.on("close", () => cleanup());

      ws.on("message", (raw, isBinary) => {
        if (isBinary) {
          stream.write(raw as Buffer);
          return;
        }
        const text = raw.toString();
        // Control messages are JSON-encoded objects with a `type` field
        if (text.startsWith("{")) {
          try {
            const msg = JSON.parse(text);
            if (msg.type === "resize" && Number.isFinite(msg.cols) && Number.isFinite(msg.rows)) {
              stream.setWindow(msg.rows, msg.cols, 0, 0);
              return;
            }
          } catch {
            // fall through — treat as raw keystroke
          }
        }
        stream.write(text);
      });
    });
  });

  conn.on("error", (err) => {
    ws.send(JSON.stringify({ type: "error", message: `ssh: ${err.message}` }));
    cleanup();
  });

  ws.on("close", () => cleanup());
  ws.on("error", () => cleanup());

  // Prefer the user's ssh-agent if available (handles passphrase-protected
  // keys). Fall back to disk key only when no agent is set.
  const agentSock = process.env.SSH_AUTH_SOCK;
  const connectOpts: Parameters<typeof conn.connect>[0] = {
    host: machine.tailscaleHost,
    username: machine.sshUser,
    readyTimeout: 8000,
  };
  if (agentSock) {
    connectOpts.agent = agentSock;
  } else {
    const keyPath = path.join(homedir(), ".ssh", "id_ed25519");
    connectOpts.privateKey = fs.readFileSync(keyPath);
    if (process.env.SSH_KEY_PASSPHRASE) {
      connectOpts.passphrase = process.env.SSH_KEY_PASSPHRASE;
    }
  }
  conn.connect(connectOpts);
}
