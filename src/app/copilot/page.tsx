import { getCopilotHostStatus, getCopilotHostCandidates } from "@/actions/copilot";
import { CopilotChat } from "./copilot-chat";
import { InferenceStatusLive } from "./inference-status";

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const [health, candidates] = await Promise.all([
    getCopilotHostStatus(),
    getCopilotHostCandidates(),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Copilot</h1>
          <p className="text-sm text-muted-foreground">
            Describe what you want to run on the fleet. The model proposes a recipe; you
            review the rendered shell commands; then dispatch on one host or the whole
            target set.
          </p>
        </div>
        <InferenceStatusLive initialHealth={health} initialCandidates={candidates} />
      </div>
      <CopilotChat />
    </div>
  );
}
