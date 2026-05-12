# Lab Fleet

A private compute coordinator for your homelab. Discovers machines on Tailscale, dispatches jobs over SSH, schedules recurring work, exposes a browser terminal per machine, monitors live CPU/RAM/disk, runs HTTP/TCP health checks, and notifies you on Discord / Slack / Pushover / macOS when things break.

Built with Next.js 15 + Prisma + SQLite + Tailwind + shadcn/ui + node-ssh + xterm.js + Recharts. Zero external services — runs on a single Mac or Linux box, reachable only over your Tailnet.

## Features

- **Fleet view** — every Tailscale peer as a card with live CPU / RAM / disk
- **Browser terminal** — full xterm.js session over WebSocket → SSH PTY, per machine
- **Drag-and-drop deploy** — upload files or whole folders, rsync to N machines in parallel
- **Shell-on-fleet** — paste a command, pick targets, see streamed output per machine
- **Job templates** — 5 built-ins (`shell-on-fleet`, `rsync-from-hub`, `rsync-to-hub`, `git-deploy`, `transcribe-mp4s-worker`), each configurable; custom templates trivially added
- **Cron scheduler** — standard 5-field cron, per-schedule machine targeting + retry caps; fires every 60s
- **Health checks** — HTTP / TCP probes on a per-check interval; down/recovery transitions notify
- **Notifications** — Discord webhook, Slack webhook, Pushover, macOS native banners
- **Time-series graphs** — 60s sampler stores 7d of CPU/disk history per machine, surfaced as Recharts line charts on the machine detail page
- **Activity feed** — Slack-style live stream of every meaningful event across the fleet
- **One-click new-machine wizard** — automates the SACL + key + Homebrew + whisper.cpp setup that's normally a 90-minute manual ordeal

## Why

Existing tools are either too heavy (Rundeck, SaltStack) or too generic (Tailscale alone). Lab Fleet sits in the middle: enough structure to be useful for repeatable work (templates, schedules, history), few enough moving parts to host on a single Mac mini in your office.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  Lab Fleet (single Node process on the hub)            │
│                                                        │
│  ├─ Next.js (3001, bound to Tailscale IP)              │
│  │   ├─ Server Components / Actions                    │
│  │   └─ Prisma → SQLite (data/lab.db)                  │
│  │                                                     │
│  ├─ WebSocket server (3002, browser terminal)          │
│  ├─ Cron tick (every 60s: schedules + health probes)   │
│  └─ Metrics sampler (every 60s: SSH probe READY hosts) │
│                                                        │
└─────────────────────────┬──────────────────────────────┘
                          │ SSH over Tailscale
                          ▼
                ┌──────────────────────┐
                │   Worker machines    │
                │   (any Mac / Linux)  │
                └──────────────────────┘
```

Outbound only — workers don't run any agent. The hub keeps a per-machine SSH key. No exposed ports outside your Tailnet.

## Install

```bash
# Clone
git clone https://github.com/fthrvi/fleet.git ~/fleet
cd ~/fleet

# Install deps
npm install

# Configure
cp .env.example .env
# (edit .env if you need to override defaults)

# Initialize SQLite schema
npx prisma db push

# Start dev (binds to Tailscale IP automatically)
npm run dev
```

The dashboard is at `http://<your-tailscale-ip>:3001`. Open it from any device on the Tailnet.

For production, `npm run build && npm start` works. Consider running it under launchd / systemd / pm2 to keep it up across reboots.

## Onboarding a new machine

1. Make sure the target is on Tailscale and SSH is enabled (System Settings → General → Sharing → Remote Login on macOS).
2. Go to `/setup` in the dashboard.
3. Pick the machine, enter its SSH username, copy the one-line bootstrap script.
4. Paste the script into the machine's Terminal (via VNC or in person), enter the password when prompted.
5. Tick the "BOOTSTRAP_OK" checkbox, click "Finish setup."
6. The hub takes over and installs whisper.cpp + ffmpeg + cmake, copies the model, exchanges SSH keys for the reverse direction, and marks the machine `READY`.

After that, the machine is selectable in `/run`, `/templates`, `/schedules`, `/deploy`.

## Project layout

```
lab-fleet/
├── README.md, LICENSE, .env.example
├── package.json
├── prisma/schema.prisma          # SQLite schema (9 models)
├── data/                         # SQLite DB + uploaded batches (gitignored)
├── scripts/install.sh            # one-line bootstrap for a fresh hub
└── src/
    ├── instrumentation.ts        # boots scheduler + sampler + WS terminal server
    ├── app/                      # 11 routes
    │   ├── page.tsx              # / Fleet (queue + activity feed + machine grid)
    │   ├── run/                  # /run ad-hoc shell runner
    │   ├── deploy/               # /deploy drag-drop file pusher
    │   ├── jobs/                 # /jobs list + /jobs/[id] live detail
    │   ├── templates/            # /templates + /templates/[id] configurable
    │   ├── schedules/            # /schedules cron + retries
    │   ├── health/               # /health HTTP/TCP probes
    │   ├── notifications/        # /notifications channel CRUD + tester
    │   ├── machines/[id]/        # /machines/N detail + Recharts graphs
    │   └── setup/                # /setup new-machine wizard
    ├── components/
    │   ├── ui/                   # shadcn primitives
    │   ├── MachineCard.tsx, MachineActions.tsx
    │   ├── Terminal.tsx          # xterm.js modal
    │   ├── QueuePanel.tsx        # adapts the mentoring-transcripts coordinator
    │   └── ActivityFeed.tsx      # live polling stream
    ├── lib/
    │   ├── db.ts                 # Prisma client singleton
    │   ├── tailscale.ts          # parses `tailscale status --json`
    │   ├── ssh.ts                # node-ssh wrappers + streaming
    │   ├── local-exec.ts         # local spawn with line-by-line streaming
    │   ├── activity.ts           # event-log helpers
    │   ├── scheduler.ts          # cron tick (every 60s)
    │   ├── sampler.ts            # metrics tick (every 60s)
    │   ├── health.ts             # HTTP/TCP probe runner
    │   ├── notify.ts             # Discord/Slack/Pushover/macOS fan-out
    │   ├── terminal-server.ts    # ws ↔ SSH-PTY bridge on port 3002
    │   ├── job-runners.ts        # per-template-kind handlers
    │   ├── builtin-templates.ts  # 5 ship-with templates
    │   └── setup-script.ts       # bootstrap one-liner generator
    └── actions/                  # server actions: machines, jobs, templates, schedules, health, notifications, setup, deploy, activity
```

## Built-in templates

| Name | Kind | What it does |
|---|---|---|
| `shell-on-fleet` | `shell` | Paste any command, run on selected machines, stream output |
| `rsync-from-hub` | `rsync-from-hub` | Push a folder from the hub to each machine |
| `rsync-to-hub` | `rsync-to-hub` | Pull a folder from each machine back to the hub (with `{machine}` substitution) |
| `git-deploy` | `git-deploy` | Clone or pull a repo, run a build, restart a service |
| `transcribe-mp4s-worker` | `transcribe-mp4s-worker` | Start a whisper-cli worker on a machine pointing at this hub's coordinator |

Custom templates are just rows in the `JobTemplate` table — edit the JSON recipe on `/templates/[id]` to tweak defaults.

## Security model

- **No exposed ports** outside Tailscale. The dashboard binds to the hub's Tailnet IP only.
- **No password storage.** The wizard generates a bootstrap script you paste on the target; everything after that uses SSH keys.
- **No agent on workers.** Plain `sshd` + `rsync` + `git`.
- **Notification webhook URLs** live in SQLite (the local file). Treat backups as sensitive.

## License

MIT — see [LICENSE](LICENSE).

Built by Bishwa Bastola for the UNM Mentoring Institute homelab, then generalized.
