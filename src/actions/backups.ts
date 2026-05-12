"use server";

import { makeBackup, listBackups, deleteBackup } from "@/lib/backup";
import { logEvent } from "@/lib/activity";
import { revalidatePath } from "next/cache";

export async function runBackupNow() {
  const r = await makeBackup();
  if (r.ok) {
    await logEvent({ category: "system", kind: "backup", level: "success", message: `Backup created: ${r.file.split("/").pop()}` });
  } else {
    await logEvent({ category: "system", kind: "backup-failed", level: "error", message: `Backup failed: ${r.error}` });
  }
  revalidatePath("/backups");
  return r;
}

export async function listBackupsAction() {
  return listBackups();
}

export async function deleteBackupAction(name: string) {
  const ok = await deleteBackup(name);
  revalidatePath("/backups");
  return ok;
}
