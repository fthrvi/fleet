"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createChannel } from "@/actions/notifications";

const SCAFFOLDS = {
  discord: `{\n  "webhookUrl": "https://discord.com/api/webhooks/..."\n}`,
  slack: `{\n  "webhookUrl": "https://hooks.slack.com/services/..."\n}`,
  pushover: `{\n  "userKey": "u...",\n  "appToken": "a..."\n}`,
  macos: `{}`,
};

export function NotificationForm() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<keyof typeof SCAFFOLDS>("discord");
  const [config, setConfig] = useState(SCAFFOLDS.discord);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function changeKind(k: keyof typeof SCAFFOLDS) {
    setKind(k);
    setConfig(SCAFFOLDS[k]);
  }

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Name required");
      return;
    }
    start(async () => {
      const r = await createChannel({ name: name.trim(), kind, configJson: config });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setName("");
      setConfig(SCAFFOLDS[kind]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. homelab-discord)"
          className="mono rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <select
          value={kind}
          onChange={(e) => changeKind(e.target.value as keyof typeof SCAFFOLDS)}
          className="mono rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="discord">Discord webhook</option>
          <option value="slack">Slack webhook</option>
          <option value="pushover">Pushover</option>
          <option value="macos">macOS native banner</option>
        </select>
      </div>
      <textarea
        value={config}
        onChange={(e) => setConfig(e.target.value)}
        rows={6}
        className="mono w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex justify-end">
        <Button disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Add channel"}
        </Button>
      </div>
    </div>
  );
}
