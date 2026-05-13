import { NodeSSH } from "node-ssh";
import { homedir } from "node:os";
import path from "node:path";

export interface SshTarget {
  host: string;
  user: string;
  privateKeyPath?: string;
}

const KEY_PATH = path.join(homedir(), ".ssh", "id_ed25519");

async function connect(target: SshTarget): Promise<NodeSSH> {
  const ssh = new NodeSSH();
  // Prefer the user's ssh-agent if SSH_AUTH_SOCK is present — this handles
  // passphrase-protected keys (the agent already holds the unlocked key).
  // Fall back to reading the key from disk only when no agent is available.
  const agentSock = process.env.SSH_AUTH_SOCK;
  if (agentSock) {
    await ssh.connect({
      host: target.host,
      username: target.user,
      agent: agentSock,
      readyTimeout: 8000,
    });
  } else {
    await ssh.connect({
      host: target.host,
      username: target.user,
      privateKeyPath: target.privateKeyPath ?? KEY_PATH,
      passphrase: process.env.SSH_KEY_PASSPHRASE,
      readyTimeout: 8000,
    });
  }
  return ssh;
}

export async function probeMachine(target: SshTarget): Promise<{
  ok: boolean;
  hostname?: string;
  cpuCores?: number;
  ramGb?: number;
  diskFreeGb?: number;
  cpuPercent?: number;
  arch?: string;
  osVersion?: string;
  error?: string;
}> {
  let ssh: NodeSSH | undefined;
  try {
    ssh = await connect(target);
    const probe = `\
HOST=$(hostname)
ARCH=$(uname -m)
OS=$(uname -sr)
NCPU=$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 0)
RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || awk '/MemTotal/ {print $2 * 1024}' /proc/meminfo 2>/dev/null || echo 0)
DISK_FREE=$(df -k "$HOME" | awk 'NR==2 {print $4}')
CPU_PCT=$(top -l 1 -n 0 2>/dev/null | awk '/CPU usage/ {gsub(/%/,""); print $3 + $5}' || echo 0)
echo "HOST=$HOST"
echo "ARCH=$ARCH"
echo "OS=$OS"
echo "NCPU=$NCPU"
echo "RAM_BYTES=$RAM_BYTES"
echo "DISK_FREE_KB=$DISK_FREE"
echo "CPU_PCT=$CPU_PCT"`;
    const result = await ssh.execCommand(probe);
    if (result.code !== 0 && !result.stdout) {
      return { ok: false, error: result.stderr || "exec failed" };
    }
    const kv: Record<string, string> = {};
    for (const line of result.stdout.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) kv[m[1]] = m[2];
    }
    return {
      ok: true,
      hostname: kv.HOST,
      arch: kv.ARCH,
      osVersion: kv.OS,
      cpuCores: kv.NCPU ? Number(kv.NCPU) : undefined,
      ramGb: kv.RAM_BYTES ? Number(kv.RAM_BYTES) / 1024 ** 3 : undefined,
      diskFreeGb: kv.DISK_FREE_KB ? Number(kv.DISK_FREE_KB) / 1024 / 1024 : undefined,
      cpuPercent: kv.CPU_PCT ? Number(kv.CPU_PCT) : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    ssh?.dispose();
  }
}

export async function runCommand(
  target: SshTarget,
  command: string,
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<{ code: number | null; stdout: string; stderr: string; error?: string }> {
  let ssh: NodeSSH | undefined;
  try {
    ssh = await connect(target);
    const env = options?.env
      ? Object.entries(options.env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ") + " "
      : "";
    const cwd = options?.cwd ? `cd ${JSON.stringify(options.cwd)} && ` : "";
    const wrapped = `${cwd}export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH; ${env}${command}`;
    const result = await ssh.execCommand(wrapped);
    return { code: result.code, stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    return {
      code: null,
      stdout: "",
      stderr: "",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    ssh?.dispose();
  }
}

export async function runCommandStream(
  target: SshTarget,
  command: string,
  hooks: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
  },
): Promise<{ code: number | null; error?: string }> {
  let ssh: NodeSSH | undefined;
  try {
    ssh = await connect(target);
    const wrapped = `export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH; ${command}`;
    let stdoutBuf = "";
    let stderrBuf = "";
    const result = await ssh.execCommand(wrapped, {
      onStdout: (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf8");
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() ?? "";
        for (const line of lines) hooks.onStdout?.(line);
      },
      onStderr: (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf8");
        const lines = stderrBuf.split(/\r?\n/);
        stderrBuf = lines.pop() ?? "";
        for (const line of lines) hooks.onStderr?.(line);
      },
    });
    if (stdoutBuf) hooks.onStdout?.(stdoutBuf);
    if (stderrBuf) hooks.onStderr?.(stderrBuf);
    return { code: result.code };
  } catch (err) {
    return { code: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    ssh?.dispose();
  }
}

export async function uploadFile(target: SshTarget, localPath: string, remotePath: string) {
  let ssh: NodeSSH | undefined;
  try {
    ssh = await connect(target);
    await ssh.putFile(localPath, remotePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    ssh?.dispose();
  }
}
