"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createWorkflow } from "@/actions/workflows";

export function WorkflowCreateForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Name required");
      return;
    }
    start(async () => {
      const r = await createWorkflow({ name: name.trim(), description: description.trim() || undefined });
      if (!r.ok) {
        setError("Create failed");
        return;
      }
      router.push(`/workflows/${r.id}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. nightly-deploy)"
          className="mono rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex justify-end">
        <Button disabled={pending} onClick={submit}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
