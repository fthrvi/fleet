import Link from "next/link";
import { db } from "@/lib/db";
import { APPS } from "@/lib/apps/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const installed = await db.installedApp.findMany({
    include: { /* nothing — we just need slugs + machineId */ },
  });
  const installedBySlug = new Map<string, number>();
  for (const i of installed) installedBySlug.set(i.slug, (installedBySlug.get(i.slug) ?? 0) + 1);

  // Group catalog by category
  const byCategory: Record<string, typeof APPS> = {};
  for (const a of APPS) {
    (byCategory[a.category] ??= []).push(a);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">App catalog</h1>
        <p className="text-sm text-muted-foreground">
          One-click install of common self-hosted apps. Targets any machine in your fleet that has
          Docker. Compose templates live in <span className="mono">src/lib/apps/registry.ts</span>{" "}
          — add your own via PR.
        </p>
      </div>

      {Object.entries(byCategory).map(([cat, apps]) => (
        <section key={cat}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {cat}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => {
              const count = installedBySlug.get(a.slug);
              return (
                <Link key={a.slug} href={`/apps/${a.slug}`}>
                  <Card className="h-full transition-colors hover:border-primary">
                    <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                      <img
                        src={a.iconUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="rounded-md bg-card object-contain"
                        loading="lazy"
                      />
                      <div className="flex-1">
                        <CardTitle className="text-base">{a.name}</CardTitle>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                          {count && (
                            <Badge variant="success" className="text-[10px]">
                              installed × {count}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {a.description}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
