// Read-only helpers for a transcription coordinator dir.
// Lets the dashboard surface live queue progress without reimplementing
// claim_next.sh / queue_status.sh.
//
// Layouts auto-detected from ROOT:
//   - MP4 (webinar): {root}/videos/*.mp4 -> {root}/transcripts/{base}.txt
//   - MP3 (PS course): {root}/sources/*.mp3 -> {root}/transcripts/{base}.mp3.txt
// Override via env: TRANSCRIPTS_SOURCE_DIR, TRANSCRIPTS_SOURCE_EXT, TRANSCRIPTS_OUTPUT_EXT.

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

async function detectLayout() {
  const sourceDir = process.env.TRANSCRIPTS_SOURCE_DIR;
  const sourceExt = process.env.TRANSCRIPTS_SOURCE_EXT;
  const outputExt = process.env.TRANSCRIPTS_OUTPUT_EXT;
  if (sourceDir && sourceExt && outputExt) {
    return { sourceDir, sourceExt, outputExt };
  }
  try {
    await fs.access(path.join(ROOT, "sources"));
    return { sourceDir: "sources", sourceExt: ".mp3", outputExt: ".mp3.txt" };
  } catch {
    return { sourceDir: "videos", sourceExt: ".mp4", outputExt: ".txt" };
  }
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

  const { sourceDir, sourceExt, outputExt } = await detectLayout();
  const videosDir = path.join(ROOT, sourceDir);
  const transcriptsDir = path.join(ROOT, "transcripts");
  const claimsDir = path.join(ROOT, "claims");

  const [videos, txts, claims] = await Promise.all([
    safeReaddir(videosDir, (f) => f.endsWith(sourceExt)),
    safeReaddir(transcriptsDir, (f) => f.endsWith(outputExt)),
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
