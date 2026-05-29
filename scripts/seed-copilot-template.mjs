// One-off seed: inserts a `shell`-kind template that boots llama-server
// with Qwen3-Coder-30B-A3B on the target machine. Idempotent — re-running
// updates the recipe in place.
//
// Run from ~/lab-fleet:
//   node scripts/seed-copilot-template.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Inline launcher. Mirrors scripts/start-copilot-server.sh but kept compact
// so it survives as a JSON-encoded shell-template recipe. Idempotent: kills
// any prior llama-server on the same port before starting a fresh one.
const COMMAND = `\
set -u
PORT=8090
LLAMA="$HOME/llama.cpp/build/bin/llama-server"
MODEL="$HOME/models/qwen3-coder-flash/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf"
DRAFT="$HOME/models/qwen3-draft/Qwen3-1.7B-Q4_K_M.gguf"
LOG="$HOME/copilot-server.log"
[ -x "$LLAMA" ] || { echo "FATAL: missing $LLAMA"; exit 1; }
[ -s "$MODEL" ] || { echo "FATAL: missing model $MODEL"; exit 1; }
[ -s "$DRAFT" ] || { echo "WARN: missing draft $DRAFT (speculative decoding off)"; DRAFT=""; }
pkill -f "llama-server.*--port $PORT" 2>/dev/null
sleep 1
ARGS="--model $MODEL --host 0.0.0.0 --port $PORT --ctx-size 8192 --n-gpu-layers 99 --threads 6 --log-disable"
[ -n "$DRAFT" ] && ARGS="$ARGS --model-draft $DRAFT"
nohup nice -n 10 $LLAMA $ARGS > "$LOG" 2>&1 &
PID=$!
for i in $(seq 1 30); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "ready: pid=$PID port=$PORT (took \${i}s)"
    echo "model=$MODEL"
    [ -n "$DRAFT" ] && echo "draft=$DRAFT"
    exit 0
  fi
  sleep 1
done
echo "FATAL: not healthy in 30s. Last log:"
tail -n 30 "$LOG"
exit 1
`;

const recipe = {
  command: COMMAND,
};

const name = "start-copilot-llama-server";
const existing = await prisma.jobTemplate.findUnique({ where: { name } });

if (existing) {
  const updated = await prisma.jobTemplate.update({
    where: { name },
    data: {
      description:
        "Boot llama-server with Qwen3-Coder-30B-A3B + 1.7B draft model on the target machine. Idempotent (restarts on re-dispatch). Listens on Tailnet at port 8090. Use mac3-2 or mac4 (have the model + a stable AMD Metal GPU).",
      recipeJson: JSON.stringify(recipe),
      defaultThreads: 6,
    },
  });
  console.log(`Updated template id=${updated.id} name=${updated.name}`);
} else {
  const created = await prisma.jobTemplate.create({
    data: {
      name,
      description:
        "Boot llama-server with Qwen3-Coder-30B-A3B + 1.7B draft model on the target machine. Idempotent (restarts on re-dispatch). Listens on Tailnet at port 8090. Use mac3-2 or mac4 (have the model + a stable AMD Metal GPU).",
      kind: "shell",
      recipeJson: JSON.stringify(recipe),
      defaultThreads: 6,
    },
  });
  console.log(`Created template id=${created.id} name=${created.name}`);
}

await prisma.$disconnect();
