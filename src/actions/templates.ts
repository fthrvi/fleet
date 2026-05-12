"use server";

import { db } from "@/lib/db";
import { BUILTIN_TEMPLATES } from "@/lib/builtin-templates";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// Idempotent seed used from both server-component renders AND explicit buttons.
// Does not call revalidatePath here because Next.js forbids it during render;
// callers that need invalidation should call revalidatePath themselves.
export async function seedBuiltinTemplates() {
  for (const t of BUILTIN_TEMPLATES) {
    await db.jobTemplate.upsert({
      where: { name: t.name },
      update: {
        description: t.description,
        kind: t.kind,
        defaultThreads: t.defaultThreads ?? null,
      },
      create: {
        name: t.name,
        description: t.description,
        kind: t.kind,
        defaultThreads: t.defaultThreads ?? null,
        recipeJson: JSON.stringify(t.defaults),
      },
    });
  }
}

export async function reseedBuiltinTemplates() {
  await seedBuiltinTemplates();
  revalidatePath("/templates");
}

const updateSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  recipeJson: z.string().optional(),
  defaultThreads: z.number().int().optional(),
});

export async function updateTemplate(input: z.infer<typeof updateSchema>) {
  const parsed = updateSchema.parse(input);
  const updated = await db.jobTemplate.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      description: parsed.description,
      recipeJson: parsed.recipeJson,
      defaultThreads: parsed.defaultThreads ?? undefined,
    },
  });
  revalidatePath("/templates");
  revalidatePath(`/templates/${parsed.id}`);
  return updated;
}

export async function deleteTemplate(id: number) {
  await db.jobTemplate.delete({ where: { id } });
  revalidatePath("/templates");
}
