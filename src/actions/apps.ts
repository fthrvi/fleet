"use server";

import { db } from "@/lib/db";
import { APPS, appBySlug, renderCompose, resolvedPorts } from "@/lib/apps/registry";
import { dispatchTemplate } from "@/actions/jobs";
import { logEvent } from "@/lib/activity";
import { revalidatePath } from "next/cache";

const APP_DIR_BASE = "~/lab-fleet-apps";

async function ensureTemplate(name: string, kind: string, description: string) {
  let t = await db.jobTemplate.findUnique({ where: { name } });
  if (!t) {
    t = await db.jobTemplate.create({
      data: { name, kind, description, recipeJson: "{}" },
    });
  }
  return t;
}

export async function installApp(input: {
  slug: string;
  machineId: number;
  env: Record<string, string>;
}) {
  const app = appBySlug(input.slug);
  if (!app) return { ok: false as const, error: "unknown app slug" };
  const machine = await db.machine.findUnique({ where: { id: input.machineId } });
  if (!machine || !machine.sshUser) {
    return { ok: false as const, error: "machine not found or missing SSH user" };
  }

  const installPath = `${APP_DIR_BASE}/${app.slug}`;
  const compose = renderCompose(app, input.env);
  const ports = resolvedPorts(app, input.env);

  const installed = await db.installedApp.upsert({
    where: { slug_machineId: { slug: app.slug, machineId: machine.id } },
    update: {
      status: "INSTALLING",
      ports,
      envJson: JSON.stringify(input.env),
      composeYaml: compose,
      installPath,
    },
    create: {
      slug: app.slug,
      name: app.name,
      machineId: machine.id,
      status: "INSTALLING",
      ports,
      envJson: JSON.stringify(input.env),
      composeYaml: compose,
      installPath,
    },
  });

  const template = await ensureTemplate(
    "_internal_app_install",
    "app-install",
    "Internal: runs a one-click app catalog install on a machine.",
  );

  const result = await dispatchTemplate({
    templateId: template.id,
    machineIds: [machine.id],
    recipeOverride: {
      slug: app.slug,
      composeYaml: compose,
      installPath,
    },
  });
  if (!result.ok) {
    await db.installedApp.update({
      where: { id: installed.id },
      data: { status: "FAILED" },
    });
    return result;
  }

  await db.installedApp.update({
    where: { id: installed.id },
    data: { lastJobId: result.jobId, status: "RUNNING" },
  });
  await logEvent({
    category: "machine",
    kind: "app-install",
    message: `Installing ${app.name} on ${machine.name}`,
    machineId: machine.id,
    jobId: result.jobId,
  });
  revalidatePath("/apps");
  revalidatePath(`/machines/${machine.id}`);
  return { ok: true as const, jobId: result.jobId };
}

export async function uninstallApp(installedId: number) {
  const installed = await db.installedApp.findUnique({ where: { id: installedId } });
  if (!installed) return { ok: false as const, error: "not found" };

  const template = await ensureTemplate(
    "_internal_app_uninstall",
    "app-uninstall",
    "Internal: removes an installed app's containers + files.",
  );

  const result = await dispatchTemplate({
    templateId: template.id,
    machineIds: [installed.machineId],
    recipeOverride: { installPath: installed.installPath },
  });
  if (!result.ok) return result;

  await db.installedApp.delete({ where: { id: installedId } });
  await logEvent({
    category: "machine",
    kind: "app-uninstall",
    message: `Uninstalling ${installed.name}`,
    machineId: installed.machineId,
    jobId: result.jobId,
  });
  revalidatePath("/apps");
  revalidatePath(`/machines/${installed.machineId}`);
  return { ok: true as const, jobId: result.jobId };
}

export async function listInstalledForMachine(machineId: number) {
  return db.installedApp.findMany({
    where: { machineId },
    orderBy: { installedAt: "desc" },
  });
}

export { APPS };
