// Notification fan-out. Reads enabled NotificationChannel rows, sends
// the message to each configured channel, respecting the per-channel
// triggers JSON. Best-effort: failure of one channel never blocks others.

import { db } from "./db";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export type NotifyTrigger =
  | "jobFailed"
  | "jobSucceeded"
  | "scheduleFireFailed"
  | "machineOffline"
  | "healthDown"
  | "healthRecovered";

export interface NotifyPayload {
  trigger: NotifyTrigger;
  title: string;
  message: string;
  // Optional URL — surfaced as a clickable link on Discord, etc.
  url?: string;
  // Level controls color/severity on supported channels
  level?: "info" | "warn" | "error" | "success";
}

export async function notify(payload: NotifyPayload) {
  const channels = await db.notificationChannel.findMany({ where: { enabled: true } });
  for (const ch of channels) {
    let triggers: Record<string, boolean> = {};
    try {
      triggers = JSON.parse(ch.triggersJson);
    } catch {
      // ignore
    }
    if (!triggers[payload.trigger]) continue;
    try {
      const cfg = JSON.parse(ch.configJson);
      switch (ch.kind) {
        case "discord":
          await sendDiscord(cfg.webhookUrl, payload);
          break;
        case "pushover":
          await sendPushover(cfg.userKey, cfg.appToken, payload);
          break;
        case "slack":
          await sendSlack(cfg.webhookUrl, payload);
          break;
        case "macos":
          await sendMacOS(payload);
          break;
      }
    } catch (err) {
      console.error(`[notify] channel ${ch.name} failed:`, err);
    }
  }
}

const COLORS = {
  info: 0x3b82f6,
  warn: 0xf59e0b,
  error: 0xef4444,
  success: 0x22c55e,
} as const;

async function sendDiscord(webhookUrl: string, p: NotifyPayload) {
  if (!webhookUrl) throw new Error("webhookUrl missing");
  const embed: Record<string, unknown> = {
    title: p.title,
    description: p.message,
    color: COLORS[p.level ?? "info"],
    timestamp: new Date().toISOString(),
    footer: { text: "yantra" },
  };
  if (p.url) embed.url = p.url;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) throw new Error(`discord ${res.status} ${await res.text()}`);
}

async function sendSlack(webhookUrl: string, p: NotifyPayload) {
  if (!webhookUrl) throw new Error("webhookUrl missing");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `*${p.title}*\n${p.message}${p.url ? `\n${p.url}` : ""}`,
    }),
  });
  if (!res.ok) throw new Error(`slack ${res.status} ${await res.text()}`);
}

async function sendPushover(userKey: string, appToken: string, p: NotifyPayload) {
  if (!userKey || !appToken) throw new Error("pushover keys missing");
  const priorityMap = { info: 0, warn: 0, error: 1, success: 0 } as const;
  const body = new URLSearchParams({
    token: appToken,
    user: userKey,
    title: p.title,
    message: p.message,
    priority: String(priorityMap[p.level ?? "info"]),
    ...(p.url ? { url: p.url, url_title: "Open" } : {}),
  });
  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(`pushover ${res.status}`);
}

async function sendMacOS(p: NotifyPayload) {
  // Trigger a native banner via osascript. Works because yantra runs on
  // the hub Mac (it's a homeserver, so it sees the user's notification centre).
  const script = `display notification ${JSON.stringify(p.message)} with title ${JSON.stringify(p.title)} sound name "Glass"`;
  await execFile("osascript", ["-e", script]);
}
