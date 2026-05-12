import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { appBySlug, defaultEnv } from "@/lib/apps/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InstallForm } from "./install-form";
import { InstalledList } from "./installed-list";

export const dynamic = "force-dynamic";

export default async function AppDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = appBySlug(slug);
  if (!app) notFound();

  const [machines, installed] = await Promise.all([
    db.machine.findMany({
      where: { status: { not: "DISABLED" }, sshUser: { not: "" } },
      orderBy: { name: "asc" },
    }),
    db.installedApp.findMany({
      where: { slug },
      include: { /* */ },
      orderBy: { installedAt: "desc" },
    }),
  ]);
  const machinesById = new Map(machines.map((m) => [m.id, m]));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <img
          src={app.iconUrl}
          alt=""
          width={64}
          height={64}
          className="rounded-md bg-card object-contain"
        />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{app.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{app.category}</Badge>
            {app.docsUrl && (
              <a href={app.docsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                docs ↗
              </a>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{app.description}</p>
        </div>
      </div>

      {installed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Installed instances</CardTitle>
          </CardHeader>
          <CardContent>
            <InstalledList installed={installed.map((i) => ({
              id: i.id,
              machineName: machinesById.get(i.machineId)?.name ?? `#${i.machineId}`,
              machineId: i.machineId,
              status: i.status,
              ports: i.ports,
              tailscaleHost: machinesById.get(i.machineId)?.tailscaleHost ?? null,
            }))} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Install</CardTitle>
        </CardHeader>
        <CardContent>
          {machines.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No eligible machines. Sync from Tailscale + set ssh users first.
            </div>
          ) : (
            <InstallForm
              slug={app.slug}
              envSchema={app.envSchema}
              defaultEnv={defaultEnv(app)}
              machines={machines.map((m) => ({ id: m.id, name: m.name, tailscaleHost: m.tailscaleHost }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compose template (preview)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="mono max-h-96 overflow-y-auto rounded-md border border-border bg-card p-3 text-xs leading-relaxed">
            {app.composeYaml}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
