"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addWorkflowStep } from "@/actions/workflows";
import type { JobTemplate, Machine } from "@prisma/client";

interface Props {
  workflowId: number;
  templates: JobTemplate[];
  machines: Machine[];
}

export function WorkflowStepForm({ workflowId, templates, machines }: Props) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(templates[0]?.id ?? null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [condition, setCondition] = useState<"on-success" | "always">("on-success");
  const [whenExpr, setWhenExpr] = useState("");
  const [recipeOverride, setRecipeOverride] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function submit() {
    setError(null);
    if (!name.trim() || !templateId || selected.size === 0) {
      setError("Name, template, and at least one machine required.");
      return;
    }
    if (recipeOverride.trim()) {
      try {
        JSON.parse(recipeOverride);
      } catch {
        setError("Recipe override must be valid JSON (or empty).");
        return;
      }
    }
    start(async () => {
      const r = await addWorkflowStep({
        workflowId,
        name: name.trim(),
        templateId,
        machineIds: Array.from(selected),
        condition,
        whenExpr: whenExpr.trim() || undefined,
        recipeOverrideJson: recipeOverride.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setName("");
      setSelected(new Set());
      setRecipeOverride("");
      setWhenExpr("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Step name (e.g. build-app)"
          className="mono rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <select
          value={templateId ?? ""}
          onChange={(e) => setTemplateId(Number(e.target.value))}
          className="mono rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.kind})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Machines ({selected.size})</label>
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
              <span className="flex-1 font-medium">{m.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Run condition</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as "on-success" | "always")}
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={!!whenExpr.trim()}
          >
            <option value="on-success">on-success (skip if a prior step failed)</option>
            <option value="always">always (run regardless)</option>
          </select>
          {whenExpr.trim() && <div className="mt-1 text-xs text-muted-foreground">Ignored when `whenExpr` is set.</div>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Recipe override JSON (optional)</label>
          <input
            type="text"
            value={recipeOverride}
            onChange={(e) => setRecipeOverride(e.target.value)}
            placeholder='e.g. {"command": "echo ${{ steps.build.outputs.tag }}"}'
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">whenExpr (advanced — overrides Run condition)</label>
        <input
          type="text"
          value={whenExpr}
          onChange={(e) => setWhenExpr(e.target.value)}
          placeholder="e.g. steps.build.exitCode == 0 && steps.test.outputs.passed == 'true'"
          className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-1 text-xs text-muted-foreground">
          Access: <span className="mono">steps.&lt;name&gt;.{`{status,exitCode,outputs.<key>}`}</span> ·{" "}
          <span className="mono">run.{`{id,triggeredBy}`}</span>. Operators: == != &gt; &lt; &amp;&amp; || !
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={pending} onClick={submit}>
          {pending ? "Adding…" : "Add step"}
        </Button>
      </div>
    </div>
  );
}
