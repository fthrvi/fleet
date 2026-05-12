import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { TemplateRunForm } from "./template-run-form";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const template = await db.jobTemplate.findUnique({ where: { id } });
  if (!template) notFound();

  const machines = await db.machine.findMany({
    where: { status: { not: "DISABLED" }, sshUser: { not: "" } },
    orderBy: { name: "asc" },
  });

  let recipe: Record<string, unknown> = {};
  try {
    recipe = JSON.parse(template.recipeJson);
  } catch {
    recipe = {};
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold mono">{template.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
      </div>
      <TemplateRunForm
        templateId={template.id}
        kind={template.kind}
        defaultRecipe={recipe}
        machines={machines}
      />
    </div>
  );
}
