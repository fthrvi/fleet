// HTTP client for the llama-server running Qwen3-Coder-30B-A3B on one of the
// lab Macs. Uses the OpenAI-compatible /v1/chat/completions endpoint with
// llama.cpp's extension fields (json_schema, grammar) for constrained output.
//
// Inference host config:
//   COPILOT_HOST       default "mac3-2.tail583a2d.ts.net"
//   COPILOT_PORT       default 8090
//   COPILOT_TIMEOUT_MS default 60000
//
// Mock mode: set COPILOT_MOCK=1 to short-circuit and return a synthetic
// response — useful for developing the /copilot UI before llama-server is up.

import { PROPOSAL_JSON_SCHEMA, type Proposal } from "./prompt";

const HOST = process.env.COPILOT_HOST ?? "mac3-2.tail583a2d.ts.net";
const PORT = Number(process.env.COPILOT_PORT ?? 8090);
const TIMEOUT_MS = Number(process.env.COPILOT_TIMEOUT_MS ?? 60_000);

export interface LlmCallResult {
  ok: true;
  raw: string;
  proposal: Proposal;
  tokensIn?: number;
  tokensOut?: number;
  elapsedMs: number;
}

export interface LlmCallError {
  ok: false;
  error: string;
  raw?: string;
  elapsedMs: number;
}

const MOCK_PROPOSAL: Proposal = {
  kind: "shell",
  recipe: {
    command:
      "echo \"mock copilot — set COPILOT_MOCK=0 and start llama-server on the inference host to get real proposals\"",
  },
  targetMachineIds: [],
  rationale:
    "Mock mode is on (COPILOT_MOCK=1). This is a stub proposal so the UI can be developed without a running llama-server.",
};

async function pingHealth(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(`http://${HOST}:${PORT}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export async function isCopilotHostReachable(): Promise<{
  ok: boolean;
  host: string;
  port: number;
  mock: boolean;
}> {
  const mock = process.env.COPILOT_MOCK === "1";
  // In mock mode we never hit the network — the indicator shows "mock" instead
  // of misleadingly green/red.
  if (mock) return { ok: true, host: HOST, port: PORT, mock: true };
  return { ok: await pingHealth(), host: HOST, port: PORT, mock: false };
}

export async function callLlamaServer(
  systemPrompt: string,
  userPrompt: string,
): Promise<LlmCallResult | LlmCallError> {
  const start = Date.now();

  if (process.env.COPILOT_MOCK === "1") {
    await new Promise((r) => setTimeout(r, 200));
    return {
      ok: true,
      raw: JSON.stringify(MOCK_PROPOSAL, null, 2),
      proposal: MOCK_PROPOSAL,
      elapsedMs: Date.now() - start,
    };
  }

  const body = {
    model: "qwen3-coder-30b-a3b", // ignored by llama-server but kept for log clarity
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 1024,
    // llama.cpp OpenAI-compat extension: hard-constrain output to our schema.
    // If the host doesn't support this field it's ignored — we still parse
    // defensively below.
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "copilot_proposal",
        schema: PROPOSAL_JSON_SCHEMA,
        strict: true,
      },
    },
    stream: false,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(`http://${HOST}:${PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: `llama-server unreachable at ${HOST}:${PORT} — ${err instanceof Error ? err.message : String(err)}. Did you dispatch the start-copilot-llama-server template?`,
      elapsedMs: Date.now() - start,
    };
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "(no body)");
    return {
      ok: false,
      error: `llama-server HTTP ${resp.status}: ${text.slice(0, 300)}`,
      elapsedMs: Date.now() - start,
    };
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const elapsedMs = Date.now() - start;

  // Best-effort JSON extraction: model might wrap in ```json fences despite
  // the schema constraint. Strip them, then parse.
  const stripped = raw.replace(/```(?:json)?\s*/g, "").replace(/```\s*$/g, "").trim();

  let proposal: Proposal;
  try {
    proposal = JSON.parse(stripped) as Proposal;
  } catch (err) {
    return {
      ok: false,
      error: `model output did not parse as JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw: stripped,
      elapsedMs,
    };
  }

  // Minimal structural validation. The runner does deeper validation on dispatch.
  if (typeof proposal.kind !== "string" || typeof proposal.rationale !== "string" || !Array.isArray(proposal.targetMachineIds) || typeof proposal.recipe !== "object" || proposal.recipe === null) {
    return {
      ok: false,
      error: "model output missing required fields",
      raw: stripped,
      elapsedMs,
    };
  }

  return {
    ok: true,
    raw: stripped,
    proposal,
    tokensIn: json.usage?.prompt_tokens,
    tokensOut: json.usage?.completion_tokens,
    elapsedMs,
  };
}
