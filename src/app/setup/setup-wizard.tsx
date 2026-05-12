"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { startMacSetup } from "@/actions/setup";
import { setSshUser } from "@/actions/machines";
import type { Machine } from "@prisma/client";
import type { TailscalePeer } from "@/lib/tailscale";

interface Candidate {
  machine: Machine;
  peer?: TailscalePeer;
}

interface Props {
  candidates: Candidate[];
  bootstrapScript: string;
  defaultModelSrc: string;
}

export function SetupWizard({ candidates, bootstrapScript, defaultModelSrc }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(candidates[0]?.machine.id ?? null);
  const [sshUserDraft, setSshUserDraft] = useState<string>(candidates[0]?.machine.sshUser ?? "");
  const [modelSrc, setModelSrc] = useState(defaultModelSrc);
  const [bootstrapConfirmed, setBootstrapConfirmed] = useState(false);
  const [copyHint, setCopyHint] = useState("Copy");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const selected = candidates.find((c) => c.machine.id === selectedId);

  function pick(id: number) {
    setSelectedId(id);
    const c = candidates.find((c) => c.machine.id === id);
    setSshUserDraft(c?.machine.sshUser ?? "");
    setBootstrapConfirmed(false);
    setError(null);
  }

  function copyBootstrap() {
    navigator.clipboard.writeText(bootstrapScript).then(() => {
      setCopyHint("Copied!");
      setTimeout(() => setCopyHint("Copy"), 1500);
    });
  }

  async function saveSshUser() {
    if (!selectedId) return;
    start(async () => {
      await setSshUser(selectedId, sshUserDraft.trim());
    });
  }

  async function startSetup() {
    if (!selectedId) return;
    setError(null);
    start(async () => {
      // Make sure the chosen ssh user is persisted first
      if (sshUserDraft.trim() && selected && sshUserDraft.trim() !== selected.machine.sshUser) {
        await setSshUser(selectedId, sshUserDraft.trim());
      }
      const r = await startMacSetup({ machineId: selectedId, modelSrc: modelSrc.trim() });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/jobs/${r.jobId}`);
    });
  }

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No candidates. Either every registered machine is already <Badge variant="success">READY</Badge>,
          or you haven&apos;t synced any peers from Tailscale yet (Fleet page → Sync from Tailscale).
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Step 1 · Pick the new machine</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c) => (
              <label
                key={c.machine.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  selectedId === c.machine.id ? "border-primary bg-primary/5" : "border-input"
                }`}
              >
                <input
                  type="radio"
                  checked={selectedId === c.machine.id}
                  onChange={() => pick(c.machine.id)}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <div className="font-medium">{c.machine.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.peer?.ip ?? c.machine.tailscaleIp ?? "?"} · {c.machine.status}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 · SSH username on the new machine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={sshUserDraft}
                onChange={(e) => setSshUserDraft(e.target.value)}
                placeholder="e.g. mi, midev, mentoringinstitute"
                className="mono flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !sshUserDraft.trim() || sshUserDraft.trim() === selected.machine.sshUser}
                onClick={saveSshUser}
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Open Terminal on the machine and run <span className="mono">whoami</span> to find this.
            </p>
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3 · Paste this on the new machine (one-time, via VNC or local Terminal)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This installs the hub&apos;s SSH key, adds the user to{" "}
              <span className="mono">com.apple.access_ssh</span> (works around the macOS pam_sacl
              nested-group bug), and installs Homebrew if missing. You&apos;ll be asked for the
              user&apos;s password once.
            </p>
            <div className="relative rounded-md border border-border bg-card p-3">
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-2 top-2"
                onClick={copyBootstrap}
              >
                {copyHint}
              </Button>
              <pre className="mono whitespace-pre-wrap break-all pr-16 text-xs leading-relaxed">
                {bootstrapScript}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground">
              When you see <span className="mono">BOOTSTRAP_OK on …</span>, tick the box below.
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bootstrapConfirmed}
                onChange={(e) => setBootstrapConfirmed(e.target.checked)}
                className="h-4 w-4"
              />
              I&apos;ve pasted that on <span className="mono font-semibold">{selected.machine.name}</span>
              {" "}and it printed BOOTSTRAP_OK.
            </label>
          </CardContent>
        </Card>
      )}

      {selected && bootstrapConfirmed && (
        <Card>
          <CardHeader>
            <CardTitle>Step 4 · Finish setup automatically</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The hub will now SSH in and: install ffmpeg + cmake, clone &amp; build whisper.cpp,
              copy the ggml-large-v3 model, exchange SSH keys for the worker → hub direction. ~5–10
              minutes; the next page streams live progress.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium">Path to model on this hub</label>
              <input
                type="text"
                value={modelSrc}
                onChange={(e) => setModelSrc(e.target.value)}
                className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                disabled={pending || !sshUserDraft.trim() || !modelSrc.trim()}
                onClick={startSetup}
              >
                {pending ? "Starting…" : "Finish setup on " + selected.machine.name}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
