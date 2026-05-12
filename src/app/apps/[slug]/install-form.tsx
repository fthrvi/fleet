"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { installApp } from "@/actions/apps";

interface EnvField {
  key: string;
  label: string;
  default?: string;
  secret?: boolean;
  required?: boolean;
  hint?: string;
}

interface Machine {
  id: number;
  name: string;
  tailscaleHost: string;
}

interface Props {
  slug: string;
  envSchema: EnvField[];
  defaultEnv: Record<string, string>;
  machines: Machine[];
}

export function InstallForm({ slug, envSchema, defaultEnv, machines }: Props) {
  const [env, setEnv] = useState<Record<string, string>>(defaultEnv);
  const [machineId, setMachineId] = useState<number | null>(machines[0]?.id ?? null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function setField(key: string, value: string) {
    setEnv((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    setError(null);
    if (!machineId) {
      setError("Pick a machine");
      return;
    }
    for (const f of envSchema) {
      if (f.required && !env[f.key]?.trim()) {
        setError(`${f.label} is required`);
        return;
      }
    }
    start(async () => {
      const r = await installApp({ slug, machineId, env });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/jobs/${r.jobId}`);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Target machine</label>
        <select
          value={machineId ?? ""}
          onChange={(e) => setMachineId(Number(e.target.value))}
          className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.tailscaleHost})
            </option>
          ))}
        </select>
      </div>

      {envSchema.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Configuration
          </div>
          {envSchema.map((f) => (
            <div key={f.key}>
              <label className="mb-1 flex items-center justify-between text-sm font-medium">
                <span>
                  {f.label}
                  {f.required && <span className="ml-1 text-destructive">*</span>}
                </span>
                <span className="mono text-[10px] text-muted-foreground">${f.key}</span>
              </label>
              <input
                type={f.secret ? "password" : "text"}
                value={env[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {f.hint && <div className="mt-1 text-xs text-muted-foreground">{f.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={pending} onClick={submit}>
          {pending ? "Installing…" : "Install"}
        </Button>
      </div>
    </div>
  );
}
