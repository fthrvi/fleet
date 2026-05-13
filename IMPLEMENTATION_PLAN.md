# Lab Fleet — Implementation Plan

A living roadmap for taking Lab Fleet from "useful internal tool" to "homeserver dashboard people star on GitHub." Updated after each shipped milestone.

---

## Current state (shipped)

**Routes (17)** — Fleet, Run, Deploy, Jobs (list + detail), Templates (list + detail), Workflows (list + detail + run detail), Schedules, Health, Notifications, Apps (list + detail), Backups, Machines/[id], Setup.

**Background services** — cron scheduler (60s), metrics sampler (60s, 7d retention), WebSocket terminal server (port 3002).

**Runner kinds (6)** — shell, rsync-from-hub, rsync-to-hub, git-deploy, transcribe-mp4s-worker, setup-mac-worker.

**Storage** — SQLite at `data/lab.db`, 12 Prisma models.

**Capabilities** — fleet discovery via Tailscale; browser terminal per machine; drag-and-drop file deploy; ad-hoc shell-on-fleet; reusable templates with kind-specific forms; sequential workflows with on-success/always conditions; cron-scheduled jobs OR workflows; HTTP/TCP health checks; Discord/Slack/Pushover/macOS notifications wired into job + schedule + health events; per-machine CPU/disk timeline graphs (Recharts); Docker container management (list / start / stop / restart / rm / logs) via SSH.

**Polish** — README (~450 lines), MIT LICENSE, .env.example, scripts/install.sh.

---

## Roadmap

Six phases, ordered by impact-per-hour. Each phase is independently shippable and leaves the dashboard fully working.

### Phase A — Polish & dashboard density ✅ SHIPPED

- [x] **Sparklines on machine cards** — inline SVG CPU% chart driven by `MetricSample`
- [x] **System summary strip on `/`** — 6-stat strip (machines / ready / online / disk / active jobs / events 24h)
- [x] **Mobile responsive pass** — header collapses to hamburger drawer on `<md`
- [x] **Light-mode** — toggle in the header, FOUC-prevented via `public/theme-init.js`
- [x] **Loading skeletons** — `loading.tsx` for `/` and `/machines/[id]`

### Phase B — App catalog ✅ SHIPPED

- [x] **Schema** — `InstalledApp` model with unique `(slug, machineId)` constraint
- [x] **App registry** at `src/lib/apps/registry.ts` — Vaultwarden, Pi-hole, Syncthing, Uptime Kuma, Glances, Jellyfin (6 well-tested apps; format documented so contributors can PR more)
- [x] **Runners** — `app-install` + `app-uninstall` kinds in `job-runners.ts`. Base64-encoded compose.yml streams to worker, `docker compose up -d` runs, `docker compose ps` confirms
- [x] **UI** — `/apps` grid grouped by category, install-count badges
- [x] **Detail** — `/apps/[slug]` with env-var form (secret fields rendered as password), machine picker, installed-instances panel with "Open :port" buttons and Uninstall
- [ ] **Updates** — "Update available" badge (deferred to Phase F)

### Phase C — Workflow variables (~45 min)

**Goal:** Workflows become genuinely useful for chaining. Step N can reference outputs from step N-1.

- [ ] **Variable substitution** — `${{ steps.step-name.exitCode }}`, `${{ steps.step-name.firstMachine }}`. Resolver runs on recipe before dispatch.
- [ ] **Per-step "outputs" capture** — for shell kind, grep for `::output name=KEY::VALUE` lines in stdout and store them.
- [ ] **`if` condition expressions** — beyond just on-success/always, allow `${{ steps.previous.exitCode == 0 }}` boolean.

### Phase D — Backups + reliability ✅ SHIPPED

- [x] **SQLite hot backup** — `src/lib/backup.ts` uses `sqlite3 .backup` (safe under concurrent writes), rotates to last 14 (configurable via `BACKUP_RETAIN`)
- [x] **Auto-daily backup** — `maybeDailyBackup()` piggy-backs on the existing 60s scheduler tick; takes a snapshot at 02:00 if none exists for today
- [x] **`/backups` page** — list + manual "Backup now" + per-file delete
- [x] **`scripts/launchd-template.plist`** — macOS LaunchAgent (KeepAlive + RunAtLoad)
- [x] **`scripts/systemd-template.service`** — Linux equivalent (After=tailscaled.service, Restart=always)

### Phase E — Visual polish for GitHub (~1 h)

**Goal:** Make the screenshots in the README sell the project.

- [ ] **Branded landing/hero** — small logo + tagline on `/` when no machines registered yet, with a "Sync from Tailscale" CTA.
- [ ] **Empty-state illustrations** — every empty page (no jobs, no templates, no workflows) gets a friendly icon + 1-line nudge.
- [ ] **Screenshots in README** — 5-6 high-quality shots (fleet view, terminal, workflow run, machine detail with graphs+docker, app catalog).
- [ ] **Architecture diagram** — replace the ASCII art in README with an SVG (mermaid block, GitHub renders it natively).
- [ ] **Demo GIF** — short screen capture of a workflow running end-to-end.

### Phase F — Power features (deferred / "if needed")

Lower priority. Build only if a real use case surfaces.

- [ ] **Multi-user auth** — currently single-user, Tailnet-gated. If we ever want shared use, add NextAuth.js with a single admin password.
- [ ] **Resource caps** — schedule says "skip if target CPU > 80%."
- [ ] **Smart machine picker** — auto-select least-loaded N machines for a job.
- [ ] **Docker Compose stacks** — beyond single-app installs, manage multi-service stacks.
- [ ] **HTTPS via Tailscale Funnel** — expose the dashboard publicly (with proper auth) if user wants remote access without Tailscale client.
- [ ] **Web-based file browser** — read a worker's filesystem via SSH SFTP, surfaced as a tree view.
- [ ] **Plugin system** — drop-in JS files in `~/lab-fleet/plugins/` that register new runner kinds.

---

## Build order recommendation

For maximum impact on a GitHub launch:

1. **Phase A** ✅
2. **Phase B** ✅
3. **Phase D** ✅
4. **Phase E** ✅
5. **Phase C** ✅
6. **Phase F** — only as needed

**Status: launch-ready.** Only screenshots in `docs/screenshots/` remain before the README looks fully polished. Phase F items are pure enhancements; ship them when there's a real ask.

---

## Acceptance for "launch-ready"

The repo is ready for `git push` + GitHub README + Show HN when:

- [ ] Fresh clone → `./scripts/install.sh` → working dashboard in <5 min
- [ ] All 16 routes render at 200, no console errors, no Prisma client warnings
- [ ] README has 4+ screenshots
- [ ] LICENSE present
- [ ] `.env.example` matches actual env usage
- [ ] At least one app installs cleanly via the catalog (Vaultwarden is a good demo)
- [ ] Backup schedule auto-seeded; verified `data/backups/` populates after first run
- [ ] Survives a hub reboot (launchd / systemd template provided)

---

## Operating tips for big batch jobs

These apply to any long-running fan-out workload (the bundled transcription
template, but also large rsync syncs, batch git-deploys, mass Docker installs).

### Speed up CPU-bound work

| Tuning | Speedup | Tradeoff |
|---|---|---|
| Run 2+ worker instances per machine (use all cores, not just 8) | ~2× | Slightly more memory pressure |
| Use a distilled / smaller model variant (e.g. `large-v3-turbo`) | ~8× | Small accuracy drop |
| Use a domain-specialised model (e.g. `medium.en` for English transcription) | ~3× | Limited to one domain |
| Add a GPU machine to the fleet | ~10–15× per machine | Need the hardware |

A combination of "smaller model + more workers per box" usually wins on a
CPU-only homelab. Always measure with a small canary before committing the
full run.

### Coordination gotchas to avoid

- **Mixed claim-aware and non-claim-aware workers double-process work.**
  If part of your fleet runs through Lab Fleet's claim coordinator and part
  runs through a legacy shell loop that just checks "has output file been
  written," two machines can race the same input. Pick one model and stick
  with it.
- **Workers that exit on empty-queue can leave a queue half-drained.** The
  bundled `worker.sh` exits after 3 idle polls, which is fine when the
  queue is genuinely empty — but if stale claims age out *after* the
  worker quit, the remaining work sits unowned. Either keep workers alive
  longer or set up a "watchdog" schedule that restarts them periodically.
- **Sanitised env on the hub strips `SSH_AUTH_SOCK`.** If you launch the
  dashboard under `env -i` or similar, Probe + Terminal break because
  node-ssh / ssh2 can't unlock a passphrase-protected key. Preserve
  `SSH_AUTH_SOCK` (or generate a dedicated passphrase-less key for
  Lab Fleet).

### Recipe for a smooth big run

1. **Pre-stage** any large data (models, base images, datasets) on every
   worker before the run starts. Use `rsync-from-hub` once, run the job
   many times.
2. **Set up notifications** (Discord / Pushover / macOS) before kicking
   off, so you get pinged on failure overnight instead of finding it in
   the morning.
3. **Run a 3-item canary** through the full pipeline first to verify
   end-to-end. Only then dispatch the full batch.
4. **Pick the dashboard's coordinator OR a shell loop, never both.** The
   `transcribe-mp4s-worker` template is the canonical way to fan out
   workers — drives the same queue without the dual-control problems.

---

*Last updated: 2026-05-13*
