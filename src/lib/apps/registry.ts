// Curated catalog of one-click Docker apps. Each entry ships a compose.yml
// template with `${VAR}` placeholders that get substituted from the user's
// env form at install time.
//
// Adding a new app: append a CatalogApp to APPS below. No code changes needed.

export interface EnvField {
  key: string;
  label: string;
  /** Default value when none provided. */
  default?: string;
  /** If true, render as a password field and redact in previews. */
  secret?: boolean;
  required?: boolean;
  hint?: string;
}

export interface CatalogApp {
  slug: string;
  name: string;
  category: "Media" | "Productivity" | "Networking" | "Sync" | "Monitoring";
  description: string;
  iconUrl: string;
  /** Comma-separated default host ports surfaced as "Open" links. */
  defaultPorts: string;
  envSchema: EnvField[];
  /** Compose template with `${VAR}` placeholders. */
  composeYaml: string;
  /** Optional doc URL shown on the install page. */
  docsUrl?: string;
}

export const APPS: CatalogApp[] = [
  {
    slug: "vaultwarden",
    name: "Vaultwarden",
    category: "Productivity",
    description: "Self-hosted Bitwarden-compatible password manager. Lightweight (Rust) reimplementation of the Bitwarden server, runs in a single container.",
    iconUrl: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/vaultwarden.png",
    defaultPorts: "8088",
    docsUrl: "https://github.com/dani-garcia/vaultwarden",
    envSchema: [
      { key: "PORT", label: "Web port (host)", default: "8088", required: true },
      { key: "ADMIN_TOKEN", label: "Admin token (random string)", secret: true, hint: "Used to access /admin. Leave blank to disable the admin panel." },
      { key: "SIGNUPS_ALLOWED", label: "Allow new signups", default: "true" },
    ],
    composeYaml: `services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    restart: unless-stopped
    ports:
      - "\${PORT}:80"
    volumes:
      - ./data:/data
    environment:
      - ADMIN_TOKEN=\${ADMIN_TOKEN}
      - SIGNUPS_ALLOWED=\${SIGNUPS_ALLOWED}
      - DOMAIN=http://0.0.0.0:\${PORT}
`,
  },
  {
    slug: "pihole",
    name: "Pi-hole",
    category: "Networking",
    description: "Network-wide ad and tracker blocker. Point your router's DNS at this machine to filter ads across every device on your LAN.",
    iconUrl: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/pi-hole.png",
    defaultPorts: "8089,53",
    docsUrl: "https://github.com/pi-hole/docker-pi-hole",
    envSchema: [
      { key: "WEB_PORT", label: "Admin web port (host)", default: "8089", required: true },
      { key: "WEBPASSWORD", label: "Admin password", secret: true, required: true },
      { key: "TIMEZONE", label: "Timezone", default: "America/Denver" },
    ],
    composeYaml: `services:
  pihole:
    image: pihole/pihole:latest
    container_name: pihole
    restart: unless-stopped
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "\${WEB_PORT}:80/tcp"
    environment:
      - TZ=\${TIMEZONE}
      - WEBPASSWORD=\${WEBPASSWORD}
    volumes:
      - ./etc-pihole:/etc/pihole
      - ./etc-dnsmasq.d:/etc/dnsmasq.d
    cap_add:
      - NET_ADMIN
`,
  },
  {
    slug: "syncthing",
    name: "Syncthing",
    category: "Sync",
    description: "Continuous, decentralized file sync between devices. Like Dropbox without the cloud middleman.",
    iconUrl: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/syncthing.png",
    defaultPorts: "8384,22000",
    docsUrl: "https://docs.syncthing.net/",
    envSchema: [
      { key: "WEB_PORT", label: "Web UI port (host)", default: "8384", required: true },
      { key: "DATA_DIR", label: "Data path on host", default: "./data", required: true },
    ],
    composeYaml: `services:
  syncthing:
    image: syncthing/syncthing:latest
    container_name: syncthing
    hostname: syncthing
    restart: unless-stopped
    user: "1000:1000"
    ports:
      - "\${WEB_PORT}:8384"
      - "22000:22000/tcp"
      - "22000:22000/udp"
      - "21027:21027/udp"
    volumes:
      - \${DATA_DIR}:/var/syncthing
`,
  },
  {
    slug: "uptime-kuma",
    name: "Uptime Kuma",
    category: "Monitoring",
    description: "Beautiful self-hosted uptime monitor. HTTP/TCP/ping/keyword checks with status pages and notifications.",
    iconUrl: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/uptime-kuma.png",
    defaultPorts: "3010",
    docsUrl: "https://github.com/louislam/uptime-kuma",
    envSchema: [
      { key: "PORT", label: "Web port (host)", default: "3010", required: true },
    ],
    composeYaml: `services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "\${PORT}:3001"
    volumes:
      - ./data:/app/data
`,
  },
  {
    slug: "glances",
    name: "Glances",
    category: "Monitoring",
    description: "Cross-platform system monitor with a web interface. Live CPU/RAM/disk/network/processes.",
    iconUrl: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/glances.png",
    defaultPorts: "61208",
    docsUrl: "https://nicolargo.github.io/glances/",
    envSchema: [
      { key: "PORT", label: "Web port (host)", default: "61208", required: true },
    ],
    composeYaml: `services:
  glances:
    image: nicolargo/glances:latest-full
    container_name: glances
    restart: unless-stopped
    pid: host
    privileged: true
    ports:
      - "\${PORT}:61208"
    environment:
      - GLANCES_OPT=-w
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /run/user/1000/podman/podman.sock:/run/user/1000/podman/podman.sock:ro
`,
  },
  {
    slug: "jellyfin",
    name: "Jellyfin",
    category: "Media",
    description: "Free media server. Streams your movies, TV, music to every device. Self-hosted Netflix.",
    iconUrl: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/jellyfin.png",
    defaultPorts: "8096",
    docsUrl: "https://jellyfin.org/docs/",
    envSchema: [
      { key: "PORT", label: "Web port (host)", default: "8096", required: true },
      { key: "MEDIA_PATH", label: "Path to media library on host", default: "/Users/$USER/Movies", required: true, hint: "On Linux, /mnt/media. On macOS, e.g. /Users/you/Movies." },
    ],
    composeYaml: `services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    container_name: jellyfin
    restart: unless-stopped
    ports:
      - "\${PORT}:8096"
    volumes:
      - ./config:/config
      - ./cache:/cache
      - \${MEDIA_PATH}:/media:ro
`,
  },
];

export function appBySlug(slug: string): CatalogApp | undefined {
  return APPS.find((a) => a.slug === slug);
}

/**
 * Resolves all `${VAR}` placeholders in compose YAML against the user-provided
 * env values (filling in schema defaults for anything missing).
 */
export function renderCompose(app: CatalogApp, env: Record<string, string>): string {
  const merged = { ...defaultEnv(app), ...env };
  return app.composeYaml.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, key) => merged[key] ?? "");
}

export function defaultEnv(app: CatalogApp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of app.envSchema) out[f.key] = f.default ?? "";
  return out;
}

export function resolvedPorts(app: CatalogApp, env: Record<string, string>): string {
  // Replace any port placeholders in defaultPorts with the user-chosen value
  return app.defaultPorts
    .split(",")
    .map((p) => p.trim())
    .map((p) => {
      // If a port value is a number, leave as-is; otherwise treat as env-key reference
      if (/^\d+$/.test(p)) return p;
      return env[p] ?? p;
    })
    .filter(Boolean)
    .join(",");
}
