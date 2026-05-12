import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BUILTIN_TEMPLATES } from "@/lib/builtin-templates";
import { seedBuiltinTemplates } from "@/actions/templates";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const existing = await db.jobTemplate.findMany({ orderBy: { name: "asc" } });
  // Auto-seed on first visit (idempotent — upserts).
  const haveAllBuiltins = BUILTIN_TEMPLATES.every((t) => existing.some((e) => e.name === t.name));
  if (!haveAllBuiltins) {
    await seedBuiltinTemplates();
  }
  const templates = haveAllBuiltins
    ? existing
    : await db.jobTemplate.findMany({ orderBy: { name: "asc" } });
  const builtinNames = new Set(BUILTIN_TEMPLATES.map((t) => t.name));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Job templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable recipes. Built-ins are auto-seeded on first load and can be edited per-recipe.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="mono">{t.name}</CardTitle>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{t.kind}</Badge>
                  {builtinNames.has(t.name) && <Badge variant="secondary">built-in</Badge>}
                </div>
              </div>
              <Link href={`/templates/${t.id}`}>
                <Button size="sm">Configure & run</Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{t.description}</p>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Default recipe</summary>
                <pre className="mono mt-1 whitespace-pre-wrap rounded-md border border-border bg-card p-2 text-[11px]">
                  {prettyJson(t.recipeJson)}
                </pre>
              </details>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
