"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSchedule } from "@/actions/schedules";
import type { JobTemplate, Machine, Workflow } from "@prisma/client";

const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: "every minute (test)", expr: "* * * * *" },
  { label: "every 15 min", expr: "*/15 * * * *" },
  { label: "every hour", expr: "0 * * * *" },
  { label: "daily 06:00", expr: "0 6 * * *" },
  { label: "weekdays 09:00", expr: "0 9 * * 1-5" },
  { label: "Sun 02:00", expr: "0 2 * * 0" },
];

interface Props {
  templates: JobTemplate[];
  workflows: Workflow[];
  machines: Machine[];
}

export function ScheduleForm({ templates, workflows, machines }: Props) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"template" | "workflow">("template");
  const [templateId, setTemplateId] = useState<number | null>(templates[0]?.id ?? null);
  const [workflowId, setWorkflowId] = useState<number | null>(workflows[0]?.id ?? null);
  const [cronExpr, setCronExpr] = useState("0 * * * *");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [maxRetries, setMaxRetries] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Name required.");
      return;
    }
    if (mode === "template" && (!templateId || selected.size === 0)) {
      setError("Template and at least one machine required.");
      return;
    }
    if (mode === "workflow" && !workflowId) {
      setError("Workflow required.");
      return;
    }
    start(async () => {
      const r = await createSchedule({
        name: name.trim(),
        templateId: mode === "template" ? templateId ?? undefined : undefined,
        workflowId: mode === "workflow" ? workflowId ?? undefined : undefined,
        cronExpr: cronExpr.trim(),
        machineIds: mode === "template" ? Array.from(selected) : [],
        maxRetries,
        enabled,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setName("");
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. nightly-rsync-logs"
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Run a">
          <div className="flex gap-2">
            <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${mode === "template" ? "border-primary bg-primary/5" : "border-input"}`}>
              <input
                type="radio"
                checked={mode === "template"}
                onChange={() => setMode("template")}
                className="h-4 w-4"
              />
              Template
            </label>
            <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${mode === "workflow" ? "border-primary bg-primary/5" : "border-input"}`}>
              <input
                type="radio"
                checked={mode === "workflow"}
                onChange={() => setMode("workflow")}
                className="h-4 w-4"
              />
              Workflow
            </label>
          </div>
        </Field>
      </div>

      {mode === "template" ? (
        <Field label="Template">
          <select
            value={templateId ?? ""}
            onChange={(e) => setTemplateId(Number(e.target.value))}
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.kind})
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Workflow">
          <select
            value={workflowId ?? ""}
            onChange={(e) => setWorkflowId(Number(e.target.value))}
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {workflows.length === 0 ? (
              <option value="">No workflows yet — create one at /workflows first</option>
            ) : (
              workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))
            )}
          </select>
        </Field>
      )}

      <Field label="Cron expression" hint="Standard 5-field cron, UTC.">
        <input
          type="text"
          value={cronExpr}
          onChange={(e) => setCronExpr(e.target.value)}
          className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Presets:</span>
          {CRON_PRESETS.map((p) => (
            <button
              key={p.expr}
              type="button"
              onClick={() => setCronExpr(p.expr)}
              className="rounded-md border border-input px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Field>

      {mode === "template" && (
        <Field label={`Machines (${selected.size} selected)`}>
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
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                      return next;
                    })
                  }
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <div className="font-medium">{m.name}</div>
                </div>
              </label>
            ))}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Max retries on failure">
          <input
            type="number"
            min={0}
            max={10}
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Initial state">
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Enabled
          </label>
        </Field>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Create schedule"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
