// Per-kind handlers for the template-driven job dispatcher.
//
// Each runner takes a context (target machine + recipe) and writes lines into
// the hooks (which the caller persists to JobLog). The runner returns an exit
// code at the end so the dispatcher can mark the assignment success/fail.

import { runCommandStream } from "./ssh";
import { runLocalCommandStream } from "./local-exec";
import { hubPublicKey } from "./setup-script";
import type { Machine } from "@prisma/client";
import { homedir } from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export interface RunnerHooks {
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
  onSystem: (line: string) => void;
}

export interface RunnerContext {
  machine: Machine;
  recipe: Record<string, unknown>;
}

export type RunnerResult = { code: number | null; error?: string };

const target = (m: Machine) => ({ host: m.tailscaleHost, user: m.sshUser });

function homeExpand(p: string, sshUser: string) {
  return p.startsWith("~") ? p.replace(/^~/, `/Users/${sshUser}`) : p;
}

// shell — run an arbitrary command on the machine
export async function runShell(ctx: RunnerContext, hooks: RunnerHooks): Promise<RunnerResult> {
  const command = String(ctx.recipe.command ?? "");
  if (!command) return { code: null, error: "no command in recipe" };
  hooks.onSystem(`$ ${command}`);
  return runCommandStream(target(ctx.machine), command, {
    onStdout: hooks.onStdout,
    onStderr: hooks.onStderr,
  });
}

// rsync-from-hub — push a folder from this hub to the machine
export async function runRsyncFromHub(
  ctx: RunnerContext,
  hooks: RunnerHooks,
): Promise<RunnerResult> {
  const src = String(ctx.recipe.srcPath ?? "");
  const dest = String(ctx.recipe.destPath ?? "");
  if (!src || !dest) return { code: null, error: "srcPath and destPath required" };
  const expandedDest = homeExpand(dest, ctx.machine.sshUser);
  const remote = `${ctx.machine.sshUser}@${ctx.machine.tailscaleHost}:${expandedDest}`;
  hooks.onSystem(`$ rsync -avz ${src} → ${remote}`);
  return runLocalCommandStream(
    "rsync",
    ["-avz", "--progress", src, remote],
    {
      onStdout: hooks.onStdout,
      onStderr: hooks.onStderr,
    },
  );
}

// rsync-to-hub — pull a folder from the machine back into the hub
export async function runRsyncToHub(
  ctx: RunnerContext,
  hooks: RunnerHooks,
): Promise<RunnerResult> {
  const remotePath = String(ctx.recipe.remotePath ?? "");
  const localPathTpl = String(ctx.recipe.localPath ?? "");
  if (!remotePath || !localPathTpl) return { code: null, error: "remotePath and localPath required" };

  const localPath = localPathTpl.replace(/\{machine\}/g, ctx.machine.name);
  const expandedRemote = homeExpand(remotePath, ctx.machine.sshUser);
  const source = `${ctx.machine.sshUser}@${ctx.machine.tailscaleHost}:${expandedRemote}`;
  hooks.onSystem(`$ rsync -avz ${source} → ${localPath}`);

  // mkdir -p the destination (rsync needs it)
  await runLocalCommandStream("mkdir", ["-p", localPath], { onStderr: hooks.onStderr });

  return runLocalCommandStream(
    "rsync",
    ["-avz", "--progress", source, localPath],
    {
      onStdout: hooks.onStdout,
      onStderr: hooks.onStderr,
    },
  );
}

// transcribe-mp4s-worker — deploy worker.sh and start it on the machine
export async function runTranscribeWorker(
  ctx: RunnerContext,
  hooks: RunnerHooks,
): Promise<RunnerResult> {
  const workerScriptPath = String(ctx.recipe.workerScriptPath ?? "");
  const hubHost = String(ctx.recipe.hubHost ?? "");
  const hubUser = String(ctx.recipe.hubUser ?? "");
  const hubPath = String(ctx.recipe.hubPath ?? "mentoring-transcripts");
  const prefix = String(ctx.recipe.prefix ?? "");
  const threads = Number(ctx.recipe.threads ?? 8);

  if (!workerScriptPath || !hubHost || !hubUser) {
    return { code: null, error: "workerScriptPath, hubHost, hubUser required" };
  }

  const remoteWorker = `${ctx.machine.sshUser}@${ctx.machine.tailscaleHost}:~/worker.sh`;
  hooks.onSystem(`$ scp ${workerScriptPath} → ${remoteWorker}`);

  const scp = await runLocalCommandStream(
    "scp",
    ["-q", workerScriptPath, remoteWorker],
    { onStdout: hooks.onStdout, onStderr: hooks.onStderr },
  );
  if (scp.code !== 0) {
    return { code: scp.code, error: scp.error ?? "scp failed" };
  }

  hooks.onSystem(`$ Starting worker on ${ctx.machine.name} (prefix=${prefix || "<any>"}, threads=${threads})`);
  const remoteCmd = [
    `chmod +x ~/worker.sh`,
    // Pre-trust the hub's host key so the worker can SSH back without prompts
    `ssh-keyscan -t ed25519 ${hubHost} 2>/dev/null >> ~/.ssh/known_hosts || true`,
    // Kill any prior worker; start fresh
    `pkill -f worker.sh 2>/dev/null; sleep 1; true`,
    // Launch via nohup with explicit PATH (Homebrew-installed binaries on Intel + Apple Silicon)
    `PATH=/usr/local/bin:/opt/homebrew/bin:$PATH HUB=${hubHost} HUB_USER=${hubUser} HUB_PATH='${hubPath}' WORKER_NAME=${ctx.machine.name} PREFIX='${prefix}' THREADS=${threads} nohup ~/worker.sh > ~/worker.out 2>&1 &`,
    // Give it 3s, then dump the first few log lines
    `sleep 3; tail -n 5 ~/mentoring-transcripts-worker/logs/worker.log 2>/dev/null || echo 'no log yet'`,
  ].join(" && ");

  return runCommandStream(target(ctx.machine), remoteCmd, {
    onStdout: hooks.onStdout,
    onStderr: hooks.onStderr,
  });
}

// setup-mac-worker — the second half of the new-machine wizard. Runs after
// the user has pasted the bootstrap one-liner on the target (which installs
// our SSH key + Homebrew + adds the user to com.apple.access_ssh). From here,
// the hub can SSH in unattended and finish the install:
//   1. brew install ffmpeg cmake (idempotent)
//   2. Clone whisper.cpp and build it
//   3. Persist PATH for non-interactive SSH sessions via ~/.zshenv
//   4. SCP the ggml-large-v3 model from the hub (or skip if already present)
//   5. Generate an SSH key on the worker (if missing) and add it to the
//      hub's authorized_keys so the worker can phone home for jobs
export async function runMacWorkerSetup(
  ctx: RunnerContext,
  hooks: RunnerHooks,
): Promise<RunnerResult> {
  const modelSrc = String(ctx.recipe.modelSrc ?? "");
  if (!modelSrc) return { code: null, error: "modelSrc required" };

  const t = target(ctx.machine);

  // Step 1 — install brew packages + clone + build whisper.cpp + persist PATH
  hooks.onSystem("→ Step 1: brew install ffmpeg + cmake, then clone & build whisper.cpp");
  const buildScript = [
    `export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH`,
    `command -v brew >/dev/null || { echo 'FATAL: brew not found — bootstrap step missed?'; exit 2; }`,
    `brew install ffmpeg cmake`,
    `mkdir -p ~/whisper.cpp/models`,
    `if [ ! -x ~/whisper.cpp/build/bin/whisper-cli ]; then \\
       git clone https://github.com/ggerganov/whisper.cpp.git /tmp/whisper.cpp.src.$$ && \\
       rsync -a --exclude=models /tmp/whisper.cpp.src.$$/ ~/whisper.cpp/ && \\
       rm -rf /tmp/whisper.cpp.src.$$ && \\
       cd ~/whisper.cpp && cmake -B build && cmake --build build --config Release -j; \\
     fi`,
    `grep -q '/usr/local/bin' ~/.zshenv 2>/dev/null || echo 'export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH' >> ~/.zshenv`,
    `ls -la ~/whisper.cpp/build/bin/whisper-cli`,
  ].join(" && ");
  const buildResult = await runCommandStream(t, buildScript, {
    onStdout: hooks.onStdout,
    onStderr: hooks.onStderr,
  });
  if (buildResult.code !== 0) return buildResult;

  // Step 2 — SCP the model if not already present on the worker
  hooks.onSystem("→ Step 2: copy ggml-large-v3 model from hub (if missing)");
  const checkModel = await runCommandStream(
    t,
    `[ -s ~/whisper.cpp/models/ggml-large-v3.bin ] && echo MODEL_PRESENT || echo MODEL_MISSING`,
    {
      onStdout: hooks.onStdout,
      onStderr: hooks.onStderr,
    },
  );
  if (checkModel.code !== 0) return checkModel;
  // We can't easily inspect the stdout we just streamed, so just attempt the SCP unconditionally.
  // scp will overwrite, but the file is the same — at worst we waste a few seconds. For real
  // optimisation we'd compare checksums.
  const scpRemote = `${ctx.machine.sshUser}@${ctx.machine.tailscaleHost}:~/whisper.cpp/models/ggml-large-v3.bin`;
  hooks.onSystem(`$ scp ${modelSrc} → ${scpRemote}`);
  const scp = await runLocalCommandStream("scp", ["-q", modelSrc, scpRemote], {
    onStdout: hooks.onStdout,
    onStderr: hooks.onStderr,
  });
  if (scp.code !== 0) return { code: scp.code, error: "model scp failed" };

  // Step 3 — generate the worker's own SSH key (if missing) and add it to
  // the hub's authorized_keys so the worker can SSH back for jobs/coordination.
  hooks.onSystem("→ Step 3: exchange SSH keys for worker → hub direction");
  const keyResult = await runCommandStream(
    t,
    [
      `test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519 -C '${ctx.machine.name}-worker' >/dev/null 2>&1`,
      `cat ~/.ssh/id_ed25519.pub`,
    ].join(" && "),
    {
      onStdout: (line) => {
        hooks.onStdout(line);
        if (line.startsWith("ssh-ed25519 ")) {
          void appendToHubAuthorizedKeys(line, ctx.machine.name).then(() =>
            hooks.onSystem(`Added ${ctx.machine.name}'s pubkey to hub authorized_keys`),
          );
        }
      },
      onStderr: hooks.onStderr,
    },
  );
  if (keyResult.code !== 0) return keyResult;

  hooks.onSystem("✓ Setup complete. This machine is now a ready worker.");
  return { code: 0 };
}

async function appendToHubAuthorizedKeys(pubkey: string, machineName: string) {
  const file = path.join(homedir(), ".ssh", "authorized_keys");
  let existing = "";
  try {
    existing = await fs.readFile(file, "utf8");
  } catch {
    // create
  }
  if (existing.includes(pubkey.trim())) return; // already present, no-op
  const next = existing.endsWith("\n") || existing === "" ? existing : existing + "\n";
  await fs.writeFile(file, next + pubkey.trim() + `  # added by setup wizard for ${machineName}\n`, {
    mode: 0o600,
  });
}

// app-install — drop a compose.yml on the worker and `docker compose up -d`.
// The Job recipe carries the fully-rendered compose YAML (no env templating
// remains; the app catalog substituted before dispatching).
export async function runAppInstall(
  ctx: RunnerContext,
  hooks: RunnerHooks,
): Promise<RunnerResult> {
  const slug = String(ctx.recipe.slug ?? "");
  const composeYaml = String(ctx.recipe.composeYaml ?? "");
  const installPath = String(ctx.recipe.installPath ?? `~/lab-fleet-apps/${slug}`);
  if (!slug || !composeYaml) return { code: null, error: "slug + composeYaml required" };

  hooks.onSystem(`→ Installing app '${slug}' at ${installPath}`);

  // Stream compose.yml to the worker via a heredoc-encoded SSH command. base64
  // sidesteps quote / newline escaping pitfalls entirely.
  const b64 = Buffer.from(composeYaml, "utf8").toString("base64");
  const script = [
    `mkdir -p ${installPath}`,
    `cd ${installPath}`,
    `echo ${JSON.stringify(b64)} | base64 -d > compose.yml`,
    `echo '→ compose.yml written'`,
    `if command -v docker >/dev/null; then \\
       docker compose up -d; \\
     else \\
       echo 'ERROR: docker not installed on this machine'; exit 2; \\
     fi`,
    `docker compose ps`,
    `echo 'INSTALL_OK'`,
  ].join(" && ");

  return runCommandStream(target(ctx.machine), script, {
    onStdout: hooks.onStdout,
    onStderr: hooks.onStderr,
  });
}

// app-uninstall — `docker compose down -v` + delete the install dir
export async function runAppUninstall(
  ctx: RunnerContext,
  hooks: RunnerHooks,
): Promise<RunnerResult> {
  const installPath = String(ctx.recipe.installPath ?? "");
  if (!installPath) return { code: null, error: "installPath required" };
  hooks.onSystem(`→ Uninstalling at ${installPath}`);
  const script = [
    `if [ -f ${installPath}/compose.yml ]; then \\
       cd ${installPath} && docker compose down -v; \\
     fi`,
    `rm -rf ${installPath}`,
    `echo 'UNINSTALL_OK'`,
  ].join(" && ");
  return runCommandStream(target(ctx.machine), script, {
    onStdout: hooks.onStdout,
    onStderr: hooks.onStderr,
  });
}

// git-deploy — clone (or pull) a repo, run a build, restart a service
export async function runGitDeploy(
  ctx: RunnerContext,
  hooks: RunnerHooks,
): Promise<RunnerResult> {
  const repoUrl = String(ctx.recipe.repoUrl ?? "");
  const branch = String(ctx.recipe.branch ?? "main");
  const destDir = String(ctx.recipe.destDir ?? "");
  const buildCmd = String(ctx.recipe.buildCmd ?? "");
  const restartCmd = String(ctx.recipe.restartCmd ?? "");
  if (!repoUrl || !destDir) return { code: null, error: "repoUrl and destDir required" };

  hooks.onSystem(`$ git-deploy ${repoUrl} (${branch}) → ${destDir}`);
  const script = [
    `mkdir -p "$(dirname ${destDir})"`,
    `if [ -d ${destDir}/.git ]; then \\
       echo '→ pulling existing repo'; \\
       cd ${destDir} && git fetch origin && git checkout ${branch} && git reset --hard origin/${branch}; \\
     else \\
       echo '→ cloning fresh'; \\
       git clone --branch ${branch} ${repoUrl} ${destDir} && cd ${destDir}; \\
     fi`,
    `cd ${destDir}`,
    buildCmd ? `echo '→ build'; ${buildCmd}` : `echo '(no build step)'`,
    restartCmd ? `echo '→ restart'; ${restartCmd}` : `echo '(no restart step)'`,
    `echo 'DEPLOY_OK'`,
  ].join(" && ");

  return runCommandStream(target(ctx.machine), script, {
    onStdout: hooks.onStdout,
    onStderr: hooks.onStderr,
  });
}

export const RUNNERS: Record<string, (ctx: RunnerContext, hooks: RunnerHooks) => Promise<RunnerResult>> = {
  shell: runShell,
  "rsync-from-hub": runRsyncFromHub,
  "rsync-to-hub": runRsyncToHub,
  "transcribe-mp4s-worker": runTranscribeWorker,
  "setup-mac-worker": runMacWorkerSetup,
  "git-deploy": runGitDeploy,
  "app-install": runAppInstall,
  "app-uninstall": runAppUninstall,
};

// Re-export so server actions can call setup-related work from outside the runners table
export { hubPublicKey };
