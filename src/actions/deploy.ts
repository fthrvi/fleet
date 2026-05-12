"use server";

import { db } from "@/lib/db";
import { dispatchTemplate } from "@/actions/jobs";
import { logEvent } from "@/lib/activity";
import fs from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { z } from "zod";

const UPLOAD_ROOT = path.join(homedir(), "lab-fleet", "data", "uploads");

const deploySchema = z.object({
  machineIds: z.array(z.number().int()).min(1),
  destPath: z.string().min(1),
  description: z.string().optional(),
});

/**
 * Server action invoked from the drag-drop deploy form.
 *
 * Steps:
 *  1. Materialise every uploaded file under data/uploads/<batch>/
 *  2. Look up (or lazily create) a one-off rsync-from-hub template that
 *     points at that batch directory.
 *  3. Dispatch the template to all selected machines.
 *  4. Redirect to the resulting job for live progress.
 */
export async function deployFiles(formData: FormData): Promise<
  | { ok: true; jobId: number; uploadedCount: number }
  | { ok: false; error: string }
> {
  const machineIdsRaw = formData.get("machineIds");
  const destPath = formData.get("destPath");
  const description = formData.get("description");

  if (typeof machineIdsRaw !== "string" || typeof destPath !== "string") {
    return { ok: false, error: "machineIds and destPath required" };
  }
  let parsed: z.infer<typeof deploySchema>;
  try {
    parsed = deploySchema.parse({
      machineIds: JSON.parse(machineIdsRaw),
      destPath,
      description: typeof description === "string" ? description : undefined,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Materialise files
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return { ok: false, error: "no files in upload" };
  }
  const batchId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const batchDir = path.join(UPLOAD_ROOT, batchId);
  await fs.mkdir(batchDir, { recursive: true });
  let totalBytes = 0;
  for (const file of files) {
    // Preserve directory structure when uploaded via webkitdirectory
    // (the File.name may contain '/' segments in that case)
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const target = path.join(batchDir, relPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(target, buf);
    totalBytes += buf.byteLength;
  }

  // Lazily ensure an internal "deploy-upload" template exists, then dispatch
  // a one-off run with the batch directory as srcPath.
  let template = await db.jobTemplate.findUnique({ where: { name: "_internal_deploy_upload" } });
  if (!template) {
    template = await db.jobTemplate.create({
      data: {
        name: "_internal_deploy_upload",
        description: "Internal: backs the drag-drop deploy UI. Pushes a freshly-uploaded batch from the hub to selected machines.",
        kind: "rsync-from-hub",
        recipeJson: JSON.stringify({ srcPath: "", destPath: "" }),
      },
    });
  }

  // rsync source: add trailing '/' so contents are copied (not the dir name itself)
  const recipeOverride = {
    srcPath: batchDir + "/",
    destPath: parsed.destPath,
  };

  const result = await dispatchTemplate({
    templateId: template.id,
    machineIds: parsed.machineIds,
    recipeOverride,
  });
  if (!result.ok) return result;

  await logEvent({
    category: "job",
    kind: "deploy-uploaded",
    message: `Deployed ${files.length} file(s) (${(totalBytes / 1024 / 1024).toFixed(1)} MB) to ${parsed.machineIds.length} machine(s)`,
    jobId: result.jobId,
  });
  return { ok: true, jobId: result.jobId, uploadedCount: files.length };
}
