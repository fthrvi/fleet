"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runBackupNow, deleteBackupAction } from "@/actions/backups";

export function BackupActions({ name }: { name?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  if (name) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Delete backup ${name}?`)) return;
          start(async () => {
            await deleteBackupAction(name);
            router.refresh();
          });
        }}
      >
        Delete
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runBackupNow();
          if (!r.ok) alert(`Backup failed: ${r.error}`);
          router.refresh();
        })
      }
    >
      {pending ? "Backing up…" : "Backup now"}
    </Button>
  );
}
