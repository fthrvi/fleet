"use client";

import { useEffect, useState, useTransition } from "react";
import { setMachineRoles, setModelEndpoints, setActiveHub } from "@/actions/device-roles";

type Machine = {
  id: number; name: string; osVersion: string | null;
  hubEligible: boolean; modelServer: boolean; worker: boolean;
  isActiveHub: boolean; modelEndpoints: string | null;
};

export function TopologyRows({ machines }: { machines: Machine[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_repeat(3,80px)_1fr_120px] gap-2 text-xs text-muted-foreground">
        <span>Machine</span><span>hub-elig</span><span>model-srv</span><span>worker</span><span>model endpoints (JSON)</span><span>active hub</span>
      </div>
      {machines.map((m) => (
        <Row key={m.id} m={m} />
      ))}
    </div>
  );
}

function Row({ m }: { m: Machine }) {
  const [pending, startTransition] = useTransition();
  const [endpoints, setEndpoints] = useState(m.modelEndpoints ?? "");
  const [error, setError] = useState<string | null>(null);

  // Reset the editable field when the server sends fresh data (e.g. after save + revalidate).
  useEffect(() => { setEndpoints(m.modelEndpoints ?? ""); }, [m.modelEndpoints]);

  const toggle = (key: "hubEligible" | "modelServer" | "worker") => {
    const next = { hubEligible: m.hubEligible, modelServer: m.modelServer, worker: m.worker, [key]: !m[key] };
    startTransition(() => { void setMachineRoles(m.id, next); });
  };

  return (
    <div className="grid grid-cols-[1fr_repeat(3,80px)_1fr_120px] items-center gap-2 rounded-md border border-border p-2 text-sm">
      <span className="mono font-medium">{m.name}{m.osVersion?.toLowerCase().includes("linux") ? " (linux)" : ""}</span>
      <input type="checkbox" checked={m.hubEligible} disabled={pending} onChange={() => toggle("hubEligible")} />
      <input type="checkbox" checked={m.modelServer} disabled={pending} onChange={() => toggle("modelServer")} />
      <input type="checkbox" checked={m.worker} disabled={pending} onChange={() => toggle("worker")} />
      <span className="flex items-center gap-1">
        <input
          className="w-full rounded border border-border bg-card px-1 py-0.5 text-xs"
          value={endpoints}
          placeholder='[{"label":"ollama","baseUrl":"http://mac4:11434","model":"qwen"}]'
          onChange={(e) => setEndpoints(e.target.value)}
        />
        <button
          className="rounded bg-accent px-2 py-0.5 text-xs"
          disabled={pending}
          onClick={() => {
            startTransition(() => {
              void (async () => {
                const r = await setModelEndpoints(m.id, endpoints);
                setError(r.ok ? null : r.error ?? null);
              })();
            });
          }}
        >save</button>
      </span>
      <span className="flex items-center gap-2">
        {m.isActiveHub ? (
          <span className="text-xs text-success">● ACTIVE</span>
        ) : (
          <>
            <button
              className="rounded bg-muted px-2 py-0.5 text-xs"
              disabled={pending}
              onClick={() => startTransition(() => { void setActiveHub(m.id); })}
            >Set hub*</button>
            <button className="rounded px-2 py-0.5 text-xs text-muted-foreground" disabled title="Live promotion comes in Phase 1b">Promote →</button>
          </>
        )}
      </span>
      {error && <span className="col-span-6 text-xs text-destructive">{error}</span>}
    </div>
  );
}
