import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { transcriptsSnapshot } from "@/lib/transcripts";

export async function QueuePanel() {
  const snap = await transcriptsSnapshot();

  if (!snap.exists) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transcription queue</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No transcripts root found at <span className="mono">{snap.root}</span>
        </CardContent>
      </Card>
    );
  }

  const pct = snap.totalVideos > 0 ? (snap.doneTranscripts / snap.totalVideos) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Transcription queue</CardTitle>
        <Badge variant="secondary" className="mono">
          {snap.doneTranscripts}/{snap.totalVideos} ({pct.toFixed(0)}%)
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-success transition-all"
            style={{ width: `${pct.toFixed(2)}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Done" value={snap.doneTranscripts} tone="success" />
          <Stat label="Claimed" value={snap.activeClaims.length} tone="primary" />
          <Stat label="Remaining" value={snap.remaining} tone="muted" />
        </div>

        {snap.activeClaims.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Active claims
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Session</th>
                    <th className="px-3 py-1.5 text-left font-medium">Holder</th>
                    <th className="px-3 py-1.5 text-right font-medium">Age</th>
                  </tr>
                </thead>
                <tbody className="mono">
                  {snap.activeClaims
                    .sort((a, b) => a.base.localeCompare(b.base))
                    .map((c) => (
                      <tr key={c.base} className="border-t border-border">
                        <td className="px-3 py-1">{c.base}</td>
                        <td className="px-3 py-1 text-muted-foreground">{c.holder}</td>
                        <td className="px-3 py-1 text-right text-muted-foreground">
                          {c.ageMin}m
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "primary" | "muted";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mono text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
