"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dispatchShellJob } from "@/actions/jobs";
import type { Machine } from "@prisma/client";

interface Props {
  machines: Machine[];
}

const SAMPLE_COMMANDS = [
  { label: "uptime + load", cmd: "uptime" },
  { label: "disk free", cmd: "df -h ~ | tail -1" },
  { label: "queue status (worker only)", cmd: "tail -3 ~/mentoring-transcripts-worker/logs/worker.log 2>/dev/null || echo no-worker" },
  { label: "running whisper-cli", cmd: "ps aux | grep whisper-cli | grep -v grep" },
];

export function RunForm({ machines }: Props) {
  const [command, setCommand] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(machines.map((m) => m.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function dispatch() {
    setError(null);
    start(async () => {
      const r = await dispatchShellJob({
        command,
        machineIds: Array.from(selected),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/jobs/${r.jobId}`);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Command</label>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder='e.g. "uptime" or "ls ~/whisper.cpp/build/bin/"'
            rows={4}
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="text-muted-foreground">Quick fills:</span>
            {SAMPLE_COMMANDS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setCommand(s.cmd)}
                className="rounded-md border border-input px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium">Machines ({selected.size} selected)</label>
            <div className="space-x-2 text-xs">
              <button type="button" onClick={selectAll} className="text-primary hover:underline">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="text-muted-foreground hover:underline">
                Clear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  selected.has(m.id) ? "border-primary bg-primary/5" : "border-input"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.sshUser}@{m.tailscaleHost}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            disabled={pending || !command.trim() || selected.size === 0}
            onClick={dispatch}
          >
            {pending ? "Dispatching…" : `Run on ${selected.size} machine${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
