// One-off dispatcher: run the nora text-extraction as a real hub Job so it
// shows on the dashboard with live logs. Shards are already staged on the
// workers (~/endnote-nora/worker-N); process_shard.py is idempotent and resumes.
// Run from the yantra repo root:  node scripts/dispatch-nora.mjs
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import os from "node:os";

const db = new PrismaClient();
const KEY = `${os.homedir()}/.ssh/id_cluster`;
const SSH = ["-i", KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20"];
const WORKERS = [
  { machineId: 1, name: "mac4", target: "mi@mac4.tail583a2d.ts.net", n: 1, total: 1288 },
  { machineId: 3, name: "mac3-2", target: "midev@mac3-2.tail583a2d.ts.net", n: 2, total: 1290 },
  { machineId: 2, name: "mentorings-imac-pro",
    target: "mentoringinstitute@mentorings-imac-pro.tail583a2d.ts.net", n: 3, total: 1289 },
];
// --jobs 8 of 16 cores; OMP_THREAD_LIMIT=1 keeps each tesseract single-threaded
// (predictable ~8-core use); nice -n 10 yields to anyone using the Mac.
const cmd = (n) =>
  `export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH; export OMP_THREAD_LIMIT=1; ` +
  `nice -n 10 ~/endnote-worker-venv/bin/python ~/endnote-worker/process_shard.py ` +
  `~/endnote-nora/worker-${n} --jobs 8`;

const log = (jobId, machine, stream, line) =>
  db.jobLog.create({ data: { jobId, machine, stream, line } }).catch(() => {});

const countDone = (w) =>
  new Promise((res) => {
    const p = spawn("ssh", [...SSH, w.target, `ls ~/endnote-nora/worker-${w.n}/out/json 2>/dev/null | wc -l`]);
    let o = "";
    p.stdout.on("data", (d) => (o += d));
    p.on("close", () => res(parseInt(o.trim() || "0", 10)));
    p.on("error", () => res(0));
  });

async function main() {
  const job = await db.job.create({
    data: {
      kind: "shell",
      recipeJson: JSON.stringify({ command: cmd("N"), note: "nora corpus text-extraction (staged shards)" }),
      status: "RUNNING",
      startedAt: new Date(),
      triggeredBy: "nora-extract",
      assignments: {
        create: WORKERS.map((w) => ({
          machineId: w.machineId, status: "RUNNING", startedAt: new Date(), unitsTotal: w.total,
        })),
      },
    },
    include: { assignments: true },
  });
  console.log("JOB_ID=" + job.id);
  await log(job.id, null, "system", `nora text-extraction on ${WORKERS.length} workers (shards pre-staged, resuming)`);
  const asgId = Object.fromEntries(job.assignments.map((a) => [a.machineId, a.id]));

  const procs = WORKERS.map((w) => {
    const p = spawn("ssh", [...SSH, w.target, cmd(w.n)]);
    const st = { w, p, buf: "", done: false, exit: null };
    p.stdout.on("data", (d) => (st.buf += d.toString()));
    p.stderr.on("data", (d) => log(job.id, w.name, "stderr", d.toString().trim()));
    p.on("close", (code) => { st.done = true; st.exit = code; });
    p.on("error", (e) => { st.done = true; st.exit = 1; log(job.id, w.name, "stderr", String(e)); });
    return st;
  });

  while (procs.some((s) => !s.done)) {
    await new Promise((r) => setTimeout(r, 15000));
    for (const s of procs) {
      if (s.done) continue;
      const c = await countDone(s.w);
      await db.jobAssignment.update({ where: { id: asgId[s.w.machineId] }, data: { unitsDone: c } }).catch(() => {});
      await log(job.id, s.w.name, "stdout", `progress: ${c}/${s.w.total} extracted`);
    }
  }

  for (const s of procs) {
    const summary = (s.buf || "").trim().split("\n").pop() || "(no summary)";
    await log(job.id, s.w.name, "stdout", `done (exit ${s.exit}): ${summary}`);
    await db.jobAssignment.update({
      where: { id: asgId[s.w.machineId] },
      data: { status: s.exit === 0 ? "SUCCESS" : "FAILED", finishedAt: new Date(), exitCode: s.exit, stdout: summary.slice(0, 2000) },
    }).catch(() => {});
  }
  const allOk = procs.every((s) => s.exit === 0);
  await db.job.update({ where: { id: job.id }, data: { status: allOk ? "SUCCESS" : "FAILED", finishedAt: new Date() } });
  await log(job.id, null, "system", `job ${allOk ? "SUCCESS" : "FAILED"}`);
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect().catch(() => {}); process.exit(1); });
