// Bootstrap script generator. The output is a single shell one-liner the user
// pastes into the worker's Terminal (via VNC or local console). It handles
// only the parts that genuinely require sudo on the target:
//   1. SSH key install + perms
//   2. Adding the user to com.apple.access_ssh (works around the macOS
//      pam_sacl nested-group quirk we hit on mac4 today)
//   3. Homebrew install if missing
// Everything else (ffmpeg/cmake install, whisper.cpp build, model copy, key
// exchange) is automated from the hub via SSH once this runs.

import fs from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

let cachedHubPubKey: string | null = null;

export async function hubPublicKey(): Promise<string> {
  if (cachedHubPubKey) return cachedHubPubKey;
  const p = path.join(homedir(), ".ssh", "id_cluster.pub");
  const content = (await fs.readFile(p, "utf8")).trim();
  cachedHubPubKey = content;
  return content;
}

export async function bootstrapScript(): Promise<string> {
  const pub = await hubPublicKey();
  // The script is intentionally on one line so the user can paste it as a
  // single shell command. Each `&&` enforces strict success ordering.
  return [
    `mkdir -p ~/.ssh`,
    `chmod 700 ~/.ssh`,
    `echo '${pub}' >> ~/.ssh/authorized_keys`,
    `chmod 600 ~/.ssh/authorized_keys`,
    `sudo dseditgroup -o edit -a "$(whoami)" -t user com.apple.access_ssh`,
    `if ! command -v brew &>/dev/null; then /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; fi`,
    `echo "BOOTSTRAP_OK on $(hostname) for $(whoami)"`,
  ].join(" && ");
}
