"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  getCopilotHostStatus,
  getCopilotHostCandidates,
  startCopilotInferenceHost,
} from "@/actions/copilot";

interface Health {
  ok: boolean;
  host: string;
  port: number;
  mock: boolean;
}
interface Candidate {
  id: number;
  name: string;
  tailscaleHost: string;
  gpus: string[];
}

interface Props {
  initialHealth: Health;
  initialCandidates: Candidate[];
}

const POLL_MS = 5000;

export function InferenceStatusLive({ initialHealth, initialCandidates }: Props) {
  const [health, setHealth] = useState<Health>(initialHealth);
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [dispatchJobId, setDispatchJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await getCopilotHostStatus();
      if (cancelled) return;
      setHealth(next);
      // If we just came online, clear the "starting" job id so the affordance hides cleanly.
      if (next.ok && !next.mock && dispatchJobId !== null) {
        setDispatchJobId(null);
      }
    };
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dispatchJobId]);

  // Refresh candidate list every 30s — slower because inventory probe is on a 5-min cadence.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await getCopilotHostCandidates();
      if (cancelled) return;
      setCandidates(next);
    };
    const interval = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const onStart = (machineId: number) => {
    setError(null);
    startTransition(async () => {
      const r = await startCopilotInferenceHost({ machineId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDispatchJobId(r.jobId);
    });
  };

  const tone = health.mock
    ? "border-sky-700/50 bg-sky-950/30 text-sky-300"
    : health.ok
      ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-300"
      : "border-amber-700/50 bg-amber-950/30 text-amber-300";

  return (
    <div className={`rounded-md border px-3 py-2 text-xs space-y-1 ${tone}`}>
      <div className="font-medium">
        {health.mock
          ? "● Mock mode"
          : health.ok
            ? "● Inference host online"
            : "● Inference host offline"}
      </div>
      <div className="text-muted-foreground">
        {health.host}:{health.port}
      </div>

      {health.mock && (
        <div className="text-muted-foreground">
          COPILOT_MOCK=1 set in .env. Proposals are synthetic. Unset and restart to use the real model.
        </div>
      )}

      {!health.mock && !health.ok && (
        <div className="space-y-2 pt-1">
          <div className="text-muted-foreground">
            Boot it with one click:
          </div>
          {candidates.length === 0 && (
            <div className="text-muted-foreground">
              No machine has Qwen3-Coder + llama-server in its inventory yet. Wait for the next probe (5 min) or copy the GGUF to a worker.
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant="secondary"
                disabled={pending || dispatchJobId !== null}
                onClick={() => onStart(c.id)}
              >
                Start on {c.name}
                {c.gpus.length > 0 && (
                  <span className="ml-1 text-muted-foreground">· {c.gpus[0]}</span>
                )}
              </Button>
            ))}
          </div>
          {dispatchJobId !== null && (
            <div className="text-muted-foreground">
              Dispatched as{" "}
              <Link
                href={`/jobs/${dispatchJobId}`}
                className="underline hover:text-foreground"
              >
                job #{dispatchJobId}
              </Link>
              . Health indicator will turn green once /health responds (usually ≤30s after model loads).
            </div>
          )}
          {error && <div className="text-destructive">{error}</div>}
        </div>
      )}
    </div>
  );
}
