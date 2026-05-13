"use server";

import { db } from "@/lib/db";
import { tailscaleStatus } from "@/lib/tailscale";
import { probeMachine } from "@/lib/ssh";
import { logEvent } from "@/lib/activity";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1),
  tailscaleHost: z.string().min(1),
  sshUser: z.string().min(1),
  tags: z.string().optional(),
});

export async function registerMachine(input: z.infer<typeof registerSchema>) {
  const parsed = registerSchema.parse(input);
  const machine = await db.machine.upsert({
    where: { name: parsed.name },
    update: {
      tailscaleHost: parsed.tailscaleHost,
      sshUser: parsed.sshUser,
      tags: parsed.tags ?? null,
    },
    create: {
      name: parsed.name,
      tailscaleHost: parsed.tailscaleHost,
      sshUser: parsed.sshUser,
      tags: parsed.tags ?? null,
      status: "NEW",
    },
  });
  revalidatePath("/");
  return machine;
}

export async function refreshMachine(id: number) {
  const machine = await db.machine.findUnique({ where: { id } });
  if (!machine) return { ok: false, error: "not found" };

  const probe = await probeMachine({
    host: machine.tailscaleHost,
    user: machine.sshUser,
  });

  if (!probe.ok) {
    await db.machine.update({
      where: { id },
      data: { status: machine.status === "NEW" ? "NEW" : machine.status },
    });
    await logEvent({
      category: "machine",
      kind: "probe-failed",
      level: "warn",
      message: `Probe failed on ${machine.name}: ${probe.error ?? "unknown"}`,
      machineId: id,
    });
    revalidatePath("/");
    return { ok: false, error: probe.error };
  }

  const wasReady = machine.status === "READY";
  await db.machine.update({
    where: { id },
    data: {
      cpuCores: probe.cpuCores,
      ramGb: probe.ramGb,
      diskFreeGb: probe.diskFreeGb,
      cpuPercent: probe.cpuPercent,
      arch: probe.arch,
      osVersion: probe.osVersion,
      lastSeenAt: new Date(),
      status: machine.status === "NEW" ? "READY" : machine.status,
    },
  });
  if (!wasReady) {
    await logEvent({
      category: "machine",
      kind: "ready",
      level: "success",
      message: `${machine.name} is now READY (${probe.cpuCores ?? "?"} cores, ${probe.ramGb?.toFixed(0) ?? "?"} GB RAM)`,
      machineId: id,
    });
  }
  revalidatePath("/");
  return { ok: true };
}

export async function refreshAllMachines() {
  const machines = await db.machine.findMany({ where: { status: { not: "DISABLED" } } });
  await Promise.all(machines.map((m) => refreshMachine(m.id)));
  revalidatePath("/");
}

export async function discoverFromTailscale() {
  const peers = await tailscaleStatus();
  return peers;
}

export async function syncFromTailscale() {
  const peers = await tailscaleStatus();
  const created: string[] = [];
  for (const peer of peers) {
    // We do include self — the hub can run jobs on itself, and showing it on
    // the dashboard makes the fleet feel complete.
    const existing = await db.machine.findUnique({ where: { name: peer.name } });
    if (existing) {
      await db.machine.update({
        where: { id: existing.id },
        data: { tailscaleIp: peer.ip, tailscaleHost: peer.tailscaleAddr ?? peer.name },
      });
    } else {
      const created_ = await db.machine.create({
        data: {
          name: peer.name,
          tailscaleHost: peer.tailscaleAddr ?? peer.name,
          tailscaleIp: peer.ip,
          sshUser: "",
          status: "NEW",
        },
      });
      created.push(peer.name);
      await logEvent({
        category: "machine",
        kind: "discovered",
        message: `Discovered ${peer.name} on Tailscale (${peer.ip})`,
        machineId: created_.id,
      });
    }
  }
  revalidatePath("/");
  return { created };
}

export async function setSshUser(id: number, sshUser: string) {
  const machine = await db.machine.findUnique({ where: { id } });
  await db.machine.update({ where: { id }, data: { sshUser } });
  if (machine && machine.sshUser !== sshUser) {
    await logEvent({
      category: "machine",
      kind: "user-set",
      message: `Set SSH user on ${machine.name}: ${sshUser}`,
      machineId: id,
    });
  }
  revalidatePath("/");
}

export async function disableMachine(id: number) {
  const machine = await db.machine.findUnique({ where: { id } });
  await db.machine.update({ where: { id }, data: { status: "DISABLED" } });
  if (machine) {
    await logEvent({
      category: "machine",
      kind: "disabled",
      level: "warn",
      message: `${machine.name} disabled`,
      machineId: id,
    });
  }
  revalidatePath("/");
}
