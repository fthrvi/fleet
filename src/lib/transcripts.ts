// Read-only helpers for the existing ~/mentoring-transcripts coordinator.
// Lets the dashboard surface live queue progress without reimplementing
// claim_next.sh / queue_status.sh.

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFile = promisify(execFileCb);

const ROOT =
  process.env.TRANSCRIPTS_ROOT ?? path.join(process.env.HOME ?? "", "mentoring-transcripts");

export interface TranscriptsSnapshot {
  root: string;
  exists: boolean;
  totalVideos: number;
  doneTranscripts: number;
  activeClaims: { base: string; holder: string; ageMin: number }[];
  remaining: number;
}

export async function transcriptsSnapshot(): Promise<TranscriptsSnapshot> {
  try {
    await fs.access(ROOT);
  } catch {
    return {
      root: ROOT,
      exists: false,
      totalVideos: 0,
      doneTranscripts: 0,
      activeClaims: [],
      remaining: 0,
    };
  }

  const videosDir = path.join(ROOT, "videos");
  const transcriptsDir = path.join(ROOT, "transcripts");
  const claimsDir = path.join(ROOT, "claims");

  const [videos, txts, claims] = await Promise.all([
    safeReaddir(videosDir, (f) => f.endsWith(".mp4")),
    safeReaddir(transcriptsDir, (f) => f.endsWith(".txt")),
    safeReaddir(claimsDir, (f) => f.endsWith(".claim")),
  ]);

  const activeClaims = await Promise.all(
    claims.map(async (file) => {
      const full = path.join(claimsDir, file);
      let holder = "?";
      let ageMin = 0;
      try {
        holder = await fs.readlink(full);
        const stat = await fs.lstat(full);
        ageMin = Math.floor((Date.now() - stat.mtimeMs) / 60000);
      } catch {
        // ignore unreadable claims
      }
      return { base: file.replace(/\.claim$/, ""), holder, ageMin };
    }),
  );

  return {
    root: ROOT,
    exists: true,
    totalVideos: videos.length,
    doneTranscripts: txts.length,
    activeClaims,
    remaining: videos.length - txts.length - activeClaims.length,
  };
}

async function safeReaddir(dir: string, filter: (name: string) => boolean) {
  try {
    return (await fs.readdir(dir)).filter(filter);
  } catch {
    return [];
  }
}

export async function pipelineLastLines(n = 5): Promise<string[]> {
  try {
    const { stdout } = await execFile("tail", [
      "-n",
      String(n),
      path.join(ROOT, "logs/pipeline.log"),
    ]);
    return stdout.trim().split("\n");
  } catch {
    return [];
  }
}
