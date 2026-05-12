"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dispatchTemplate } from "@/actions/jobs";
import { updateTemplate } from "@/actions/templates";
import type { Machine } from "@prisma/client";

interface Props {
  templateId: number;
  kind: string;
  defaultRecipe: Record<string, unknown>;
  machines: Machine[];
}

export function TemplateRunForm({ templateId, kind, defaultRecipe, machines }: Props) {
  const [recipe, setRecipe] = useState<Record<string, unknown>>(defaultRecipe);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [savePending, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const router = useRouter();

  function setRecipeField(key: string, value: unknown) {
    setRecipe((prev) => ({ ...prev, [key]: value }));
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function dispatch() {
    setError(null);
    start(async () => {
      const r = await dispatchTemplate({
        templateId,
        machineIds: Array.from(selected),
        recipeOverride: recipe,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/jobs/${r.jobId}`);
    });
  }

  function saveDefaults() {
    setSavedMsg(null);
    startSave(async () => {
      await updateTemplate({
        id: templateId,
        recipeJson: JSON.stringify(recipe, null, 2),
      });
      setSavedMsg("Defaults saved");
      setTimeout(() => setSavedMsg(null), 2000);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recipe
          </h2>
          <RecipeFields kind={kind} recipe={recipe} setField={setRecipeField} />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={savePending}
              onClick={saveDefaults}
            >
              {savePending ? "Saving…" : "Save as defaults"}
            </Button>
            {savedMsg && <span className="ml-3 self-center text-xs text-success">{savedMsg}</span>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Machines ({selected.size}/{machines.length} selected)
            </h2>
            <div className="space-x-2 text-xs">
              <button
                type="button"
                onClick={() => setSelected(new Set(machines.map((m) => m.id)))}
                className="text-primary hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-muted-foreground hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          {machines.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No eligible machines. Set SSH users on the Fleet page first.
            </div>
          ) : (
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
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button disabled={pending || selected.size === 0} onClick={dispatch}>
            {pending ? "Dispatching…" : `Run on ${selected.size} machine${selected.size === 1 ? "" : "s"}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RecipeFields({
  kind,
  recipe,
  setField,
}: {
  kind: string;
  recipe: Record<string, unknown>;
  setField: (k: string, v: unknown) => void;
}) {
  switch (kind) {
    case "shell":
      return (
        <Field label="Command">
          <textarea
            value={String(recipe.command ?? "")}
            onChange={(e) => setField("command", e.target.value)}
            rows={4}
            className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
      );

    case "rsync-from-hub":
      return (
        <>
          <Field label="Source path (on hub)">
            <Text value={recipe.srcPath} onChange={(v) => setField("srcPath", v)} />
          </Field>
          <Field label="Destination path (on each machine)" hint="Use ~ for the worker's home">
            <Text value={recipe.destPath} onChange={(v) => setField("destPath", v)} />
          </Field>
        </>
      );

    case "rsync-to-hub":
      return (
        <>
          <Field label="Remote path (on each machine)">
            <Text value={recipe.remotePath} onChange={(v) => setField("remotePath", v)} />
          </Field>
          <Field
            label="Local path (on hub)"
            hint="Use {machine} to substitute the machine name. Folder will be created if missing."
          >
            <Text value={recipe.localPath} onChange={(v) => setField("localPath", v)} />
          </Field>
        </>
      );

    case "git-deploy":
      return (
        <>
          <Field label="Repo URL">
            <Text value={recipe.repoUrl} onChange={(v) => setField("repoUrl", v)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch">
              <Text value={recipe.branch} onChange={(v) => setField("branch", v)} />
            </Field>
            <Field label="Dest directory on each machine">
              <Text value={recipe.destDir} onChange={(v) => setField("destDir", v)} />
            </Field>
          </div>
          <Field label="Build command" hint="Runs in destDir after pull. Leave blank to skip.">
            <Text value={recipe.buildCmd} onChange={(v) => setField("buildCmd", v)} />
          </Field>
          <Field label="Restart command" hint="Runs after build. Leave blank to skip.">
            <Text value={recipe.restartCmd} onChange={(v) => setField("restartCmd", v)} />
          </Field>
        </>
      );

    case "transcribe-mp4s-worker":
      return (
        <>
          <Field label="Worker script path (on hub)">
            <Text
              value={recipe.workerScriptPath}
              onChange={(v) => setField("workerScriptPath", v)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hub Tailscale host">
              <Text value={recipe.hubHost} onChange={(v) => setField("hubHost", v)} />
            </Field>
            <Field label="Hub SSH user">
              <Text value={recipe.hubUser} onChange={(v) => setField("hubUser", v)} />
            </Field>
          </div>
          <Field label="Hub path (where claim_next.sh lives)">
            <Text value={recipe.hubPath} onChange={(v) => setField("hubPath", v)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prefix (optional, e.g. phase4)" hint="Blank = claim anything available">
              <Text value={recipe.prefix} onChange={(v) => setField("prefix", v)} />
            </Field>
            <Field label="Threads">
              <input
                type="number"
                min={1}
                max={64}
                value={Number(recipe.threads ?? 8)}
                onChange={(e) => setField("threads", Number(e.target.value))}
                className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </>
      );

    default:
      return (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          No form for kind &quot;{kind}&quot;. Edit recipeJson manually in /templates.
        </div>
      );
  }
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

function Text({ value, onChange }: { value: unknown; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}
