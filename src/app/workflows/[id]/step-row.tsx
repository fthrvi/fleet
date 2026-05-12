"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteWorkflowStep } from "@/actions/workflows";

interface Step {
  id: number;
  name: string;
  position: number;
  templateName: string;
  templateKind: string;
  condition: string;
  machineNames: string;
}

export function StepRow({ step }: { step: Step }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="mono inline-block w-6 text-right text-xs text-muted-foreground">
          {step.position}.
        </span>
        <div>
          <div className="font-medium">{step.name}</div>
          <div className="text-xs text-muted-foreground">
            <span className="mono">{step.templateName}</span> ({step.templateKind}) ·{" "}
            {step.machineNames || "no machines"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={step.condition === "always" ? "secondary" : "outline"}>
          {step.condition}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this step?")) return;
            start(async () => {
              await deleteWorkflowStep(step.id);
              router.refresh();
            });
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
