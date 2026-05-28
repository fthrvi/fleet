export interface ModelEndpoint {
  label: string;
  baseUrl: string;
  model: string;
}

export function activeHubUpdates(
  machines: { id: number; isActiveHub: boolean }[],
  targetId: number,
): { id: number; isActiveHub: boolean }[] {
  return machines.map((m) => ({ id: m.id, isActiveHub: m.id === targetId }));
}

export type ParseResult =
  | { ok: true; value: ModelEndpoint[] }
  | { ok: false; error: string };

export function parseModelEndpoints(raw: string | null | undefined): ParseResult {
  if (raw == null || raw.trim() === "") return { ok: true, value: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "must be a JSON array" };
  const value: ModelEndpoint[] = [];
  for (const item of parsed) {
    if (
      typeof item !== "object" || item === null ||
      typeof (item as Record<string, unknown>).label !== "string" ||
      typeof (item as Record<string, unknown>).baseUrl !== "string" ||
      typeof (item as Record<string, unknown>).model !== "string"
    ) {
      return { ok: false, error: "each endpoint needs string label, baseUrl, model" };
    }
    const it = item as Record<string, string>;
    value.push({ label: it.label, baseUrl: it.baseUrl, model: it.model });
  }
  return { ok: true, value };
}
