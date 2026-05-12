"use server";

import { db } from "@/lib/db";
import { bootstrapScript } from "@/lib/setup-script";
import { dispatchTemplate } from "@/actions/jobs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function getBootstrapScript() {
  return bootstrapScript();
}

const startSetupSchema = z.object({
  machineId: z.number().int(),
  modelSrc: z.string().min(1),
});

/**
 * Kicks off the post-bootstrap automation (brew install, whisper build, model
 * scp, key exchange) as a setup-mac-worker job. The target must have already
 * had the bootstrap one-liner pasted in.
 */
export async function startMacSetup(input: z.infer<typeof startSetupSchema>) {
  const parsed = startSetupSchema.parse(input);

  // Find or create a setup-mac-worker template, since we run setup via the
  // template dispatcher (so logs / retries / job history all just work).
  let template = await db.jobTemplate.findUnique({
    where: { name: "setup-mac-worker" },
  });
  if (!template) {
    template = await db.jobTemplate.create({
      data: {
        name: "setup-mac-worker",
        description:
          "Post-bootstrap automation for a new worker Mac. Installs ffmpeg + cmake, clones and builds whisper.cpp, copies the model, exchanges SSH keys.",
        kind: "setup-mac-worker",
        recipeJson: JSON.stringify({
          modelSrc: parsed.modelSrc,
        }),
      },
    });
  }

  const result = await dispatchTemplate({
    templateId: template.id,
    machineIds: [parsed.machineId],
    recipeOverride: { modelSrc: parsed.modelSrc },
  });
  if (!result.ok) return result;

  // Promote the machine status to READY once setup launches. The job stream
  // will flip it back to NEW if setup fails (handled below).
  await db.machine.update({
    where: { id: parsed.machineId },
    data: { status: "READY" },
  });
  revalidatePath("/setup");
  revalidatePath("/");
  return result;
}
