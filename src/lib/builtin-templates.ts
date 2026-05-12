// Built-in job templates. Auto-seeded on first visit to /templates if missing.
//
// Each template has a `kind` that selects which runner is used at dispatch time
// (see src/actions/jobs.ts → dispatchTemplate). Recipes are stored as JSON strings
// in JobTemplate.recipeJson and validated per-kind on dispatch.

export type TemplateKind =
  | "shell"
  | "rsync-from-hub"
  | "rsync-to-hub"
  | "transcribe-mp4s-worker"
  | "git-deploy";

export interface BuiltinTemplate {
  name: string;
  description: string;
  kind: TemplateKind;
  defaultThreads?: number;
  defaults: Record<string, unknown>;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    name: "shell-on-fleet",
    description:
      "Paste a shell command. Runs on each selected machine in parallel. Streams stdout/stderr per machine to the job log.",
    kind: "shell",
    defaults: { command: "uptime" },
  },
  {
    name: "rsync-from-hub",
    description:
      "Push a folder from this hub to each selected machine. Uses rsync over the existing SSH key pair.",
    kind: "rsync-from-hub",
    defaults: {
      srcPath: "/Users/MentoringInstitute/mentoring-transcripts/worker.sh",
      destPath: "~/worker.sh",
      excludes: [],
    },
  },
  {
    name: "rsync-to-hub",
    description:
      "Collect a folder from each selected machine back to this hub. Useful for harvesting worker outputs or logs.",
    kind: "rsync-to-hub",
    defaults: {
      remotePath: "~/mentoring-transcripts-worker/logs/",
      localPath: "/Users/MentoringInstitute/lab-fleet/data/collected/{machine}/",
      excludes: [],
    },
  },
  {
    name: "git-deploy",
    description:
      "Pull a git repo on each selected machine, run a build command, restart a service. Works with any GitHub repo. Idempotent — clones on first run, pulls on subsequent runs.",
    kind: "git-deploy",
    defaults: {
      repoUrl: "https://github.com/your-org/your-app.git",
      branch: "main",
      destDir: "~/apps/your-app",
      buildCmd: "npm ci && npm run build",
      restartCmd: "pm2 restart your-app || true",
    },
  },
  {
    name: "transcribe-mp4s-worker",
    description:
      "Deploy worker.sh and start it on each selected machine, pointing at this hub's transcription coordinator. Requires whisper.cpp + ffmpeg + the model to already be installed on the worker (use the setup wizard in /setup once it ships).",
    kind: "transcribe-mp4s-worker",
    defaultThreads: 8,
    defaults: {
      workerScriptPath: "/Users/MentoringInstitute/mentoring-transcripts/worker.sh",
      hubHost: "bishwa.tail583a2d.ts.net",
      hubUser: "MentoringInstitute",
      hubPath: "mentoring-transcripts",
      prefix: "",
      threads: 8,
    },
  },
];

export function builtinByName(name: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.name === name);
}
