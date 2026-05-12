"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createHealthCheck } from "@/actions/health";

export function HealthForm() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"http" | "tcp">("http");
  const [target, setTarget] = useState("");
  const [intervalSec, setIntervalSec] = useState(60);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function submit() {
    setError(null);
    if (!name.trim() || !target.trim()) {
      setError("Name and target required.");
      return;
    }
    start(async () => {
      const r = await createHealthCheck({
        name: name.trim(),
        kind,
        target: target.trim(),
        intervalSec,
        timeoutMs: 5000,
        notifyOnDown: true,
      });
      if (!r.ok) {
        setError("Create failed");
        return;
      }
      setName("");
      setTarget("");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. mentor.unm.edu)"
        className="mono rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-1"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as "http" | "tcp")}
        className="mono rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="http">HTTP</option>
        <option value="tcp">TCP</option>
      </select>
      <input
        type="text"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder={kind === "http" ? "https://example.com" : "host:5432"}
        className="mono rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-1"
      />
      <div className="flex gap-2">
        <input
          type="number"
          value={intervalSec}
          min={10}
          max={3600}
          onChange={(e) => setIntervalSec(Number(e.target.value))}
          className="mono w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Add"}
        </Button>
      </div>
      {error && <div className="col-span-full text-sm text-destructive">{error}</div>}
    </div>
  );
}
