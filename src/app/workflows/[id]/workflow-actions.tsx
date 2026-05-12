"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteWorkflow, runWorkflowNow } from "@/actions/workflows";

export function WorkflowActions({ workflowId, canRun }: { workflowId: number; canRun: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <Button
        disabled={pending || !canRun}
        onClick={() =>
          start(async () => {
            const r = await runWorkflowNow(workflowId);
            if (r.ok) router.push(`/workflows/runs/${r.runId}`);
          })
        }
      >
        {pending ? "Starting…" : "Run workflow"}
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this workflow? Its run history will also be deleted.")) return;
          start(async () => {
            await deleteWorkflow(workflowId);
            router.push("/workflows");
          });
        }}
      >
        Delete
      </Button>
    </div>
  );
}
