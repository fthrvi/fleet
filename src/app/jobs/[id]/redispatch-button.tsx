"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { redispatchJob } from "@/actions/jobs";

interface Props {
  jobId: number;
  failedCount: number;
  totalCount: number;
}

export function RedispatchButton({ jobId, failedCount, totalCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (failedCount === 0 && totalCount === 0) return null;

  const onClick = (scope: "failed" | "all") => {
    setError(null);
    startTransition(async () => {
      const r = await redispatchJob({ jobId, scope });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/jobs/${r.jobId}`);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {failedCount > 0 && (
        <Button
          variant="default"
          size="sm"
          disabled={pending}
          onClick={() => onClick("failed")}
        >
          Re-dispatch on {failedCount} failed {failedCount === 1 ? "target" : "targets"}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => onClick("all")}
      >
        Re-run on all {totalCount}
      </Button>
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}
