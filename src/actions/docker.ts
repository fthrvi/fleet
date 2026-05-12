"use server";

import { db } from "@/lib/db";
import { listContainers, controlContainer, containerLogs, dockerStatus } from "@/lib/docker";
import type { ContainerAction } from "@/lib/docker";
import { logEvent } from "@/lib/activity";
import { revalidatePath } from "next/cache";

export async function getDockerSnapshot(machineId: number) {
  const machine = await db.machine.findUnique({ where: { id: machineId } });
  if (!machine || !machine.sshUser) return { available: false, containers: [] as never };
  const status = await dockerStatus(machine);
  if (!status.available) {
    return { available: false as const, error: status.error };
  }
  const containers = await listContainers(machine);
  return { available: true as const, version: status.version, containers };
}

export async function doContainerAction(
  machineId: number,
  containerName: string,
  action: ContainerAction,
) {
  const machine = await db.machine.findUnique({ where: { id: machineId } });
  if (!machine) return { ok: false as const, error: "machine not found" };
  const res = await controlContainer(machine, containerName, action);
  await logEvent({
    category: "machine",
    kind: `docker-${action}`,
    level: res.ok ? "info" : "error",
    message: `docker ${action} ${containerName} on ${machine.name} ${res.ok ? "ok" : `failed: ${res.error}`}`,
    machineId,
  });
  revalidatePath(`/machines/${machineId}`);
  return res.ok ? { ok: true as const } : { ok: false as const, error: res.error ?? res.output };
}

export async function fetchContainerLogs(machineId: number, containerName: string, lines = 200) {
  const machine = await db.machine.findUnique({ where: { id: machineId } });
  if (!machine) return "";
  return containerLogs(machine, containerName, lines);
}
