"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { proposeRecipe, runTrial, runRemaining, saveProposalAsTemplate } from "@/actions/copilot";
import type { MachinePreview, ProposeResult } from "@/lib/copilot/types";
import type { TranscribePreview } from "@/lib/job-previews";

interface TrialState {
  jobId: number;
  attemptedMachineIds: number[];
}

export function CopilotChat() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<ProposeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [trial, setTrial] = useState<TrialState | null>(null);
  const [expandJobId, setExpandJobId] = useState<number | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(false);

  const onSubmit = () => {
    if (!prompt.trim()) return;
    setResult(null);
    setTrial(null);
    setExpandJobId(null);
    setDispatchError(null);
    startTransition(async () => {
      const r = await proposeRecipe({ prompt });
      setResult(r);
    });
  };

  const onTrial = () => {
    if (!result?.proposal) return;
    setDispatchError(null);
    startTransition(async () => {
      const r = await runTrial({
        kind: result.proposal!.kind,
        recipe: result.proposal!.recipe,
        machineIds: result.proposal!.targetMachineIds,
      });
      if (!r.ok) {
        setDispatchError(r.error);
        return;
      }
      setTrial({ jobId: r.jobId, attemptedMachineIds: [result.proposal!.targetMachineIds[0]] });
    });
  };

  const onExpand = () => {
    if (!result?.proposal || !trial) return;
    setDispatchError(null);
    startTransition(async () => {
      const r = await runRemaining({
        kind: result.proposal!.kind,
        recipe: result.proposal!.recipe,
        machineIds: result.proposal!.targetMachineIds,
        excludeMachineIds: trial.attemptedMachineIds,
      });
      if (!r.ok) {
        setDispatchError(r.error);
        return;
      }
      setExpandJobId(r.jobId);
    });
  };

  const onSave = (name: string) => {
    if (!result?.proposal) return;
    setDispatchError(null);
    startTransition(async () => {
      const r = await saveProposalAsTemplate({
        name,
        kind: result.proposal!.kind,
        recipe: result.proposal!.recipe,
        description: result.proposal!.rationale,
      });
      if (!r.ok) {
        setDispatchError(r.error);
        return;
      }
      router.push(`/templates`);
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <textarea
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={3}
            placeholder="e.g. transcribe the .mp3s in /Users/me/Downloads/podcast across the lab"
            value={prompt}
            disabled={pending}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">⌘⏎ to submit</span>
            <Button size="sm" onClick={onSubmit} disabled={pending || !prompt.trim()}>
              {pending ? "Thinking…" : "Generate proposal"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && !result.ok && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Proposal failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>{result.error}</div>
            {result.raw && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">raw output</summary>
                <pre className="mono mt-2 whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs">
                  {result.raw}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {result?.ok && result.proposal && (
        <>
          <ProposalCard result={result} onToggleRaw={() => setShowRaw((v) => !v)} showRaw={showRaw} onToggleSnapshot={() => setShowSnapshot((v) => !v)} showSnapshot={showSnapshot} />
          {result.previews && result.previews.length > 0 && (
            <PreviewList previews={result.previews} />
          )}
          <TrialPanel
            proposalKind={result.proposal.kind}
            targets={result.previews ?? []}
            trial={trial}
            expandJobId={expandJobId}
            pending={pending}
            error={dispatchError}
            onTrial={onTrial}
            onExpand={onExpand}
            onSave={onSave}
          />
        </>
      )}
    </div>
  );
}

function TrialPanel({
  proposalKind,
  targets,
  trial,
  expandJobId,
  pending,
  error,
  onTrial,
  onExpand,
  onSave,
}: {
  proposalKind: string;
  targets: MachinePreview[];
  trial: TrialState | null;
  expandJobId: number | null;
  pending: boolean;
  error: string | null;
  onTrial: () => void;
  onExpand: () => void;
  onSave: (name: string) => void;
}) {
  const [templateName, setTemplateName] = useState("");
  const trialTarget = targets[0];
  const remainingCount = Math.max(0, targets.length - 1);
  const trialDisabled = pending || targets.length === 0 || trial !== null || proposalKind === "needs-clarification";
  const expandDisabled = pending || trial === null || remainingCount === 0 || expandJobId !== null;

  if (proposalKind === "needs-clarification") {
    return (
      <Card className="border-amber-700/50">
        <CardContent className="p-3 text-xs text-amber-300">
          The model returned <code>needs-clarification</code>. Rephrase your request and submit again — there is nothing to dispatch.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispatch</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={trialDisabled} onClick={onTrial}>
            {trial ? "Trial dispatched" : `Run on 1${trialTarget ? ` (${trialTarget.machineName})` : ""}`}
          </Button>
          <Button size="sm" variant="outline" disabled={expandDisabled} onClick={onExpand}>
            Run on remaining {remainingCount}
          </Button>
          {trial && (
            <Link
              href={`/jobs/${trial.jobId}`}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              trial → job #{trial.jobId}
            </Link>
          )}
          {expandJobId && (
            <Link
              href={`/jobs/${expandJobId}`}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              expand → job #{expandJobId}
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="flex-1 min-w-[180px] rounded-md border border-input bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="template-name (alphanumeric/dash)"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            disabled={pending}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || !templateName.trim()}
            onClick={() => onSave(templateName.trim())}
          >
            Save as template
          </Button>
        </div>

        {error && <div className="text-xs text-destructive">{error}</div>}
        <p className="text-xs text-muted-foreground">
          Click <b>Run on 1</b> to dispatch only the first target as a smoke test. Verify the trial job succeeds at <code>/jobs/…</code>, then click <b>Run on remaining</b> to fan out to the rest.
        </p>
      </CardContent>
    </Card>
  );
}

function ProposalCard({
  result,
  showRaw,
  onToggleRaw,
  showSnapshot,
  onToggleSnapshot,
}: {
  result: ProposeResult;
  showRaw: boolean;
  onToggleRaw: () => void;
  showSnapshot: boolean;
  onToggleSnapshot: () => void;
}) {
  const p = result.proposal!;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <span>Proposal</span>
          <Badge variant={p.kind === "needs-clarification" ? "destructive" : "secondary"}>
            {p.kind}
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {result.elapsedMs != null && <span>{result.elapsedMs}ms</span>}
          {result.tokensOut != null && <span>{result.tokensOut} tok</span>}
          <button className="underline hover:text-foreground" onClick={onToggleSnapshot}>
            {showSnapshot ? "hide" : "show"} snapshot
          </button>
          <button className="underline hover:text-foreground" onClick={onToggleRaw}>
            {showRaw ? "hide" : "show"} raw
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rationale
          </div>
          <div className="mt-1">{p.rationale}</div>
        </div>

        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Targets
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.targetMachineIds.length === 0 && (
              <span className="text-xs text-muted-foreground">(none — model declined to target any machine)</span>
            )}
            {result.previews?.map((pv) => (
              <Badge key={pv.machineId} variant="outline">
                {pv.machineName}
              </Badge>
            ))}
          </div>
        </div>

        <details>
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
            recipe ({p.kind})
          </summary>
          <pre className="mono mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs">
            {JSON.stringify(p.recipe, null, 2)}
          </pre>
        </details>

        {showSnapshot && result.snapshotMeta && (
          <div className="rounded border border-border bg-card p-2 text-xs text-muted-foreground">
            Snapshot: {result.snapshotMeta.machineCount} READY machines, {result.snapshotMeta.templateCount} templates, taken {new Date(result.snapshotMeta.takenAt).toLocaleString()}
          </div>
        )}

        {showRaw && (
          <pre className="mono max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs">
            {result.raw}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewList({ previews }: { previews: MachinePreview[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Will run ({previews.length} target{previews.length === 1 ? "" : "s"})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {previews.map((pv) => (
          <PreviewRow key={pv.machineId} pv={pv} />
        ))}
      </CardContent>
    </Card>
  );
}

function PreviewRow({ pv }: { pv: MachinePreview }) {
  return (
    <div className="space-y-1">
      <div className="font-medium">{pv.machineName}</div>
      {pv.preview.kind === "shell" && pv.preview.data.valid && (
        <pre className="mono whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs">
          {`ssh ${pv.preview.data.target.user}@${pv.preview.data.target.host} '${pv.preview.data.command}'`}
        </pre>
      )}
      {pv.preview.kind === "transcribe-mp4s-worker" && pv.preview.data.valid && (
        <TranscribePreviewBlock data={pv.preview.data} />
      )}
      {(pv.preview.kind === "shell" || pv.preview.kind === "transcribe-mp4s-worker") &&
        !pv.preview.data.valid && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            preview invalid: {pv.preview.data.error}
          </div>
        )}
      {pv.preview.kind === "unsupported" && (
        <div className="rounded border border-amber-700/50 bg-amber-950/30 p-2 text-xs text-amber-300">
          {pv.preview.reason}
        </div>
      )}
    </div>
  );
}

function TranscribePreviewBlock({ data }: { data: Extract<TranscribePreview, { valid: true }> }) {
  return (
    <div className="space-y-2">
      <pre className="mono whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs">
        {`$ scp ${data.steps.scp.args.join(" ")}`}
      </pre>
      <pre className="mono whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs">
        {`$ ssh ${data.steps.ssh.target.user}@${data.steps.ssh.target.host} '\n  ${data.steps.ssh.command.replaceAll(" && ", " && \\\n  ")}\n'`}
      </pre>
    </div>
  );
}

