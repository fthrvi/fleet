import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NotificationForm } from "./notification-form";
import { NotificationActions } from "./notification-actions";
import { EmptyState, EmptyIcons } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const channels = await db.notificationChannel.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Fan-out destinations for alerts. Supports Discord webhook, Slack webhook, Pushover, and
          macOS native banners.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New channel</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationForm />
        </CardContent>
      </Card>

      {channels.length === 0 ? (
        <EmptyState
          icon={EmptyIcons.Bell}
          title="No notification channels yet"
          description="Discord webhooks are the easiest: Discord server settings → Integrations → Webhooks → New Webhook, copy the URL, paste here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {channels.map((c) => (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{c.name}</CardTitle>
                  <Badge variant="outline" className="mt-1">{c.kind}</Badge>
                </div>
                <Badge variant={c.enabled ? "success" : "secondary"}>
                  {c.enabled ? "enabled" : "paused"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Config</summary>
                  <pre className="mono mt-1 max-h-32 overflow-y-auto rounded-md border border-border bg-card p-2">
                    {safePretty(c.configJson)}
                  </pre>
                </details>
                <NotificationActions id={c.id} enabled={c.enabled} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function safePretty(s: string) {
  try {
    const obj = JSON.parse(s);
    // Redact obvious secrets in the preview
    const redacted = Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k,
        typeof v === "string" && /token|secret|key|webhook/i.test(k) ? `${v.slice(0, 12)}…` : v,
      ]),
    );
    return JSON.stringify(redacted, null, 2);
  } catch {
    return s;
  }
}
