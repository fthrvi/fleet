import { db } from "@/lib/db";
import { tailscaleStatus } from "@/lib/tailscale";
import { bootstrapScript } from "@/lib/setup-script";
import { SetupWizard } from "./setup-wizard";
import path from "node:path";
import { homedir } from "node:os";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [machines, peers, script] = await Promise.all([
    db.machine.findMany({ orderBy: { name: "asc" } }),
    tailscaleStatus(),
    bootstrapScript(),
  ]);

  // Default model path: the hub's own ggml-large-v3
  const defaultModelSrc = path.join(homedir(), "whisper.cpp", "models", "ggml-large-v3.bin");

  const peerByName = new Map(peers.map((p) => [p.name, p]));
  const candidates = machines
    .filter((m) => m.status !== "READY" && m.status !== "DISABLED")
    .map((m) => ({ machine: m, peer: peerByName.get(m.name) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add a machine</h1>
        <p className="text-sm text-muted-foreground">
          Onboards a new Mac worker. Today this took 90 minutes; this wizard cuts it to one
          pasted command + one button click.
        </p>
      </div>
      <SetupWizard
        candidates={candidates}
        bootstrapScript={script}
        defaultModelSrc={defaultModelSrc}
      />
    </div>
  );
}
