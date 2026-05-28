"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { activeHubUpdates, parseModelEndpoints } from "@/lib/device-roles";

export async function setMachineRoles(
  machineId: number,
  roles: { hubEligible: boolean; modelServer: boolean; worker: boolean },
) {
  await db.machine.update({ where: { id: machineId }, data: roles });
  revalidatePath("/fleet-topology");
}

export async function setModelEndpoints(machineId: number, rawJson: string) {
  const parsed = parseModelEndpoints(rawJson);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  await db.machine.update({
    where: { id: machineId },
    data: { modelEndpoints: parsed.value.length ? JSON.stringify(parsed.value) : null },
  });
  revalidatePath("/fleet-topology");
  return { ok: true as const };
}

export async function setActiveHub(machineId: number) {
  const machines = await db.machine.findMany({ select: { id: true, isActiveHub: true } });
  const target = machines.find((m) => m.id === machineId);
  if (!target) return { ok: false as const, error: "machine not found" };
  await db.$transaction(
    activeHubUpdates(machines, machineId).map((u) =>
      db.machine.update({ where: { id: u.id }, data: { isActiveHub: u.isActiveHub } }),
    ),
  );
  revalidatePath("/fleet-topology");
  return { ok: true as const };
}
