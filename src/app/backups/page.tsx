import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listBackups } from "@/lib/backup";
import { formatBytes, formatRelative } from "@/lib/utils";
import { BackupActions } from "./backup-actions";

export const dynamic = "force-dynamic";

export default async function BackupsPage() {
  const backups = await listBackups();
  const totalBytes = backups.reduce((s, b) => s + b.sizeBytes, 0);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Backups</h1>
          <p className="text-sm text-muted-foreground">
            SQLite hot backups under <span className="mono">data/backups/</span>. Auto-rotates to the
            most recent 14. A daily snapshot is taken at 02:00 by the background tick if none was
            created that day.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {backups.length} backup{backups.length === 1 ? "" : "s"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({formatBytes(totalBytes / 1024 ** 3)} total)
            </span>
          </CardTitle>
          <BackupActions />
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No backups yet. Click <strong>Backup now</strong> above to create one.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">File</th>
                    <th className="px-3 py-1.5 text-left font-medium">Size</th>
                    <th className="px-3 py-1.5 text-left font-medium">Created</th>
                    <th className="px-3 py-1.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b, i) => (
                    <tr key={b.name} className="border-t border-border">
                      <td className="mono px-3 py-1.5">
                        {b.name}
                        {i === 0 && <Badge variant="success" className="ml-2 text-[10px]">latest</Badge>}
                      </td>
                      <td className="mono px-3 py-1.5 text-xs text-muted-foreground">
                        {formatBytes(b.sizeBytes / 1024 ** 3)}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {formatRelative(b.mtime)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <BackupActions name={b.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
