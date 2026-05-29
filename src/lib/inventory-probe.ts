// Inventory probe: enumerates each READY machine's installed GGUF model files,
// known binaries, and GPUs. Result is JSON-serialized into Machine.modelInventory
// so the copilot fleet snapshot can ground recipe generation in real capabilities.
//
// Runs out-of-band from the main scheduler tick (own interval, 5 min).
// Cheap enough that one call across the whole fleet is well under 10s.

import { db } from "./db";
import { connect } from "./ssh";

export interface MachineInventory {
  gguf: string[]; // basenames only — path noise is not useful to the model
  binaries: string[]; // [whisper-cli, pandoc, tesseract, ffmpeg, ollama, llama-server, ...]
  gpus: string[]; // [Radeon Pro 5700 XT, ...] or [] when none / unknown
}

const PROBE_SCRIPT = `\
# All commands are best-effort. Empty lines are filtered by the parser.
echo "===GGUF==="
( find "$HOME/models" "$HOME/whisper.cpp/models" "$HOME/.cache/huggingface/hub" -name '*.gguf' 2>/dev/null | head -50 ) | while read f; do basename "$f"; done | sort -u
echo "===BIN==="
for b in whisper-cli pandoc tesseract ffmpeg ollama llama-server; do
  command -v "$b" >/dev/null 2>&1 && echo "$b"
done
[ -x "$HOME/whisper.cpp/build/bin/whisper-cli" ] && echo "whisper-cli"
[ -x "$HOME/llama.cpp/build/bin/llama-server" ] && echo "llama-server"
echo "===GPU==="
if [ "$(uname -s)" = "Darwin" ]; then
  system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Chipset Model:/ {print $2}'
elif command -v lspci >/dev/null 2>&1; then
  lspci 2>/dev/null | grep -iE 'vga|3d|display' | sed 's/.*: //'
fi
echo "===END==="
`;

interface ParsedSections {
  gguf: string[];
  binaries: string[];
  gpus: string[];
}

function parseProbeOutput(stdout: string): ParsedSections {
  const sections: ParsedSections = { gguf: [], binaries: [], gpus: [] };
  let current: keyof ParsedSections | null = null;
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "===GGUF===") { current = "gguf"; continue; }
    if (line === "===BIN===") { current = "binaries"; continue; }
    if (line === "===GPU===") { current = "gpus"; continue; }
    if (line === "===END===") { current = null; continue; }
    if (current) sections[current].push(line);
  }
  // De-dupe (the binary section can list whisper-cli/llama-server twice if both
  // the PATH variant and the build-dir variant exist).
  sections.binaries = Array.from(new Set(sections.binaries)).sort();
  sections.gguf = Array.from(new Set(sections.gguf)).sort();
  sections.gpus = Array.from(new Set(sections.gpus));
  return sections;
}

export async function probeMachineInventory(
  host: string,
  user: string,
): Promise<{ ok: true; inv: MachineInventory } | { ok: false; error: string }> {
  let ssh;
  try {
    ssh = await connect({ host, user });
    const result = await ssh.execCommand(PROBE_SCRIPT);
    if (!result.stdout) {
      return { ok: false, error: result.stderr || "empty output" };
    }
    return { ok: true, inv: parseProbeOutput(result.stdout) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    ssh?.dispose();
  }
}

export async function runInventoryProbeAll(): Promise<{
  probed: number;
  ok: number;
  failed: Array<{ name: string; error: string }>;
}> {
  const machines = await db.machine.findMany({
    where: { status: "READY" },
    select: { id: true, name: true, tailscaleHost: true, sshUser: true },
  });
  let ok = 0;
  const failed: Array<{ name: string; error: string }> = [];
  await Promise.all(
    machines.map(async (m) => {
      if (!m.sshUser) {
        failed.push({ name: m.name, error: "sshUser unset" });
        return;
      }
      const r = await probeMachineInventory(m.tailscaleHost, m.sshUser);
      if (!r.ok) {
        failed.push({ name: m.name, error: r.error });
        return;
      }
      await db.machine.update({
        where: { id: m.id },
        data: {
          modelInventory: JSON.stringify(r.inv),
          inventoryUpdatedAt: new Date(),
        },
      });
      ok++;
    }),
  );
  return { probed: machines.length, ok, failed };
}
