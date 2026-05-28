// Safely compose a "cd <dir> && <command>" launch string for the SSH PTY.
// The `command` is intentionally arbitrary (the user's own command on their own
// machine). The `cwd` is a path, NOT meant to be executable — so we single-quote
// it to prevent shell metacharacters ($(), backticks, quotes) from being
// interpreted, while still honoring a leading ~ for home expansion.

function quoteSingle(s: string): string {
  // POSIX single-quote escaping: close quote, escaped quote, reopen.
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function buildLaunchCommand(command: string, cwd?: string | null): string {
  if (!cwd) return command;
  let cd: string;
  if (cwd === "~") cd = "cd ~";
  else if (cwd.startsWith("~/")) cd = `cd ~/${quoteSingle(cwd.slice(2))}`;
  else cd = `cd ${quoteSingle(cwd)}`;
  return `${cd} && ${command}`;
}
