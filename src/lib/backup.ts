// SQLite hot-backup. Uses sqlite3's `.backup` command which is safe against
// concurrent writes (unlike a naive `cp`). Backups land in data/backups/ and
// are rotated to keep the last RETAIN files.
//
// Also integrates with the scheduler tick: once per day (at any time after
// the configured hour) we write a snapshot if one isn't already present.

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { homedir } from "node:os";

const execFile = promisify(execFileCb);

const ROOT = path.join(homedir(), "lab-fleet");
const DB_PATH = path.join(ROOT, "data", "lab.db");
const BACKUP_DIR = path.join(ROOT, "data", "backups");
const RETAIN = Number(process.env.BACKUP_RETAIN ?? 14);

export interface BackupFile {
  name: string;
  path: string;
  sizeBytes: number;
  mtime: Date;
}

export async function makeBackup(): Promise<{ ok: true; file: string } | { ok: false; error: string }> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = path.join(BACKUP_DIR, `lab-${ts}.db`);
    await execFile("sqlite3", [DB_PATH, `.backup ${dest}`]);
    await rotate();
    return { ok: true, file: dest };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listBackups(): Promise<BackupFile[]> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const rows: BackupFile[] = [];
    for (const f of files) {
      if (!f.endsWith(".db")) continue;
      const full = path.join(BACKUP_DIR, f);
      const stat = await fs.stat(full);
      rows.push({ name: f, path: full, sizeBytes: stat.size, mtime: stat.mtime });
    }
    return rows.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

async function rotate() {
  const files = await listBackups();
  for (const f of files.slice(RETAIN)) {
    try { await fs.unlink(f.path); } catch { /* ignore */ }
  }
}

export async function deleteBackup(name: string) {
  // Defensive — only delete files in BACKUP_DIR ending in .db
  if (!/^[A-Za-z0-9._-]+\.db$/.test(name)) return false;
  try {
    await fs.unlink(path.join(BACKUP_DIR, name));
    return true;
  } catch {
    return false;
  }
}

// Called from scheduler tick. No-op if today already has a backup.
export async function maybeDailyBackup() {
  const files = await listBackups();
  const today = new Date().toISOString().slice(0, 10);
  const haveTodaysBackup = files.some((f) => f.mtime.toISOString().slice(0, 10) === today);
  if (haveTodaysBackup) return;
  const hour = new Date().getHours();
  // Only run between 02:00 and 03:00 to avoid bursts
  const targetHour = Number(process.env.BACKUP_HOUR ?? 2);
  if (hour !== targetHour) return;
  await makeBackup();
}
