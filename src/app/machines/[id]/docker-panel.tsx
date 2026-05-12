"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { doContainerAction, fetchContainerLogs, getDockerSnapshot } from "@/actions/docker";

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  createdAt: string;
}

export function DockerPanel({ machineId }: { machineId: number }) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [version, setVersion] = useState<string | undefined>();
  const [containers, setContainers] = useState<Container[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logsText, setLogsText] = useState<string>("");

  async function refresh() {
    const snap = await getDockerSnapshot(machineId);
    setLoading(false);
    if (!snap.available) {
      setAvailable(false);
      setError(snap.error ?? null);
      return;
    }
    setAvailable(true);
    setVersion(snap.version);
    setContainers(snap.containers);
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [machineId]);

  function act(name: string, action: "start" | "stop" | "restart" | "rm") {
    start(async () => {
      const r = await doContainerAction(machineId, name, action);
      if (!r.ok) alert(`${action} failed: ${r.error}`);
      await refresh();
    });
  }

  async function showLogs(name: string) {
    setLogsFor(name);
    setLogsText("Loading…");
    const text = await fetchContainerLogs(machineId, name, 300);
    setLogsText(text);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Docker {version && <span className="ml-2 text-xs font-normal text-muted-foreground">v{version}</span>}</span>
          {available && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => start(refresh)}>
              Refresh
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Probing…</div>
        ) : !available ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Docker not detected on this machine.
            {error && <div className="mono mt-2 text-xs">{error}</div>}
          </div>
        ) : containers.length === 0 ? (
          <div className="text-sm text-muted-foreground">No containers.</div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Name</th>
                  <th className="px-3 py-1.5 text-left font-medium">Image</th>
                  <th className="px-3 py-1.5 text-left font-medium">State</th>
                  <th className="px-3 py-1.5 text-left font-medium">Status</th>
                  <th className="px-3 py-1.5 text-left font-medium">Ports</th>
                  <th className="px-3 py-1.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="mono px-3 py-1.5">{c.name}</td>
                    <td className="mono px-3 py-1.5 text-xs text-muted-foreground">{c.image}</td>
                    <td className="px-3 py-1.5">
                      <Badge
                        variant={
                          c.state === "running"
                            ? "success"
                            : c.state === "exited"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {c.state}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.status}</td>
                    <td className="mono px-3 py-1.5 text-xs text-muted-foreground">{c.ports}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex justify-end gap-1">
                        {c.state === "running" ? (
                          <>
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(c.name, "restart")}>↻</Button>
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(c.name, "stop")}>■</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(c.name, "start")}>▶</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => showLogs(c.name)}>Logs</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => {
                            if (confirm(`Remove container ${c.name}?`)) act(c.name, "rm");
                          }}
                        >
                          🗑
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {logsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="mono text-sm font-semibold">Logs · {logsFor}</div>
              <Button size="sm" variant="ghost" onClick={() => setLogsFor(null)}>
                Close
              </Button>
            </div>
            <pre className="mono flex-1 overflow-y-auto whitespace-pre-wrap bg-[#0b0e14] p-3 text-xs leading-relaxed text-foreground">
              {logsText}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
}
