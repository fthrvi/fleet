export interface AgentTerminalQuery {
  machineId: number | null;
  cmd: string | null;
}

export function parseAgentTerminalQuery(url: string): AgentTerminalQuery {
  const params = new URL(url, "http://localhost").searchParams;
  const idRaw = params.get("machineId");
  const idNum = idRaw === null ? NaN : Number(idRaw);
  const machineId = Number.isFinite(idNum) && idRaw !== "" ? idNum : null;
  const cmdRaw = params.get("cmd");
  const cmd = cmdRaw && cmdRaw.length > 0 ? cmdRaw : null;
  return { machineId, cmd };
}
