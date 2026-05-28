import { openTerminalConnection, type TerminalConnection, type TerminalStatus } from "./terminal-connection";

interface Entry {
  conn: TerminalConnection;
  status: TerminalStatus;
  error?: string;
  listeners: Set<(s: TerminalStatus, e?: string) => void>;
}

const sessions = new Map<string, Entry>();
let parking: HTMLDivElement | null = null;

function parkingEl(): HTMLDivElement {
  if (!parking) {
    parking = document.createElement("div");
    parking.id = "yantra-terminal-parking";
    parking.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;left:-99999px;top:0;";
    document.body.appendChild(parking);
  }
  return parking;
}

export function ensureSession(id: string, opts: { machineId: number; hubHost: string; cmd?: string }): void {
  if (sessions.has(id)) return; // idempotent: survives StrictMode / re-render
  const entry: Entry = { conn: null as unknown as TerminalConnection, status: "connecting", listeners: new Set() };
  entry.conn = openTerminalConnection({
    machineId: opts.machineId,
    hubHost: opts.hubHost,
    cmd: opts.cmd,
    onStatus: (s, e) => { entry.status = s; entry.error = e; entry.listeners.forEach((l) => l(s, e)); },
  });
  parkingEl().appendChild(entry.conn.host); // keep in-DOM so xterm can measure
  sessions.set(id, entry);
}

export function adopt(id: string, container: HTMLElement): void {
  const e = sessions.get(id);
  if (!e) return;
  container.appendChild(e.conn.host); // moves out of its previous parent
  // Guard: skip a stale rAF fit if a later adopt() moved the host elsewhere.
  requestAnimationFrame(() => { if (e.conn.host.parentElement === container) e.conn.fit(); });
}

export function release(id: string): void {
  const e = sessions.get(id);
  if (!e) return;
  parkingEl().appendChild(e.conn.host); // park it; keep alive + in-DOM
}

export function dispose(id: string): void {
  const e = sessions.get(id);
  if (!e) return;
  try { e.conn.host.remove(); } catch { /* ignore */ }
  e.conn.dispose();
  sessions.delete(id);
}

export function getStatus(id: string): { status: TerminalStatus; error?: string } {
  const e = sessions.get(id);
  return e ? { status: e.status, error: e.error } : { status: "connecting" };
}

export function subscribeStatus(id: string, cb: (s: TerminalStatus, e?: string) => void): () => void {
  const e = sessions.get(id);
  if (!e) return () => {};
  e.listeners.add(cb);
  cb(e.status, e.error);
  return () => { e.listeners.delete(cb); };
}
