#!/bin/bash
# start-copilot-server.sh — boot llama-server with Qwen3-Coder-30B-A3B
# (plus the 1.7B draft model for speculative decoding) on the local host.
#
# Run via Lab Fleet `start-copilot-llama-server` template, or by hand:
#
#   ssh midev@mac3-2.tail583a2d.ts.net 'bash -s' < scripts/start-copilot-server.sh
#
# Idempotent: re-running kills the prior server on $PORT and starts fresh.
# Detached via nohup so the SSH session that launched it can disconnect.
#
# Env overrides:
#   PORT         (default 8090)         — HTTP/OpenAI-compat API port
#   MODEL        (default $HOME/models/qwen3-coder-flash/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf)
#   DRAFT        (default $HOME/models/qwen3-draft/Qwen3-1.7B-Q4_K_M.gguf)
#   NGL          (default 99)           — n_gpu_layers; 99 = offload everything that fits
#   CTX          (default 8192)         — context window
#   THREADS      (default 6)            — CPU threads for non-offloaded layers

set -u

PORT="${PORT:-8090}"
MODEL="${MODEL:-$HOME/models/qwen3-coder-flash/Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf}"
DRAFT="${DRAFT:-$HOME/models/qwen3-draft/Qwen3-1.7B-Q4_K_M.gguf}"
NGL="${NGL:-99}"
CTX="${CTX:-8192}"
THREADS="${THREADS:-6}"

LLAMA_SERVER="$HOME/llama.cpp/build/bin/llama-server"
LOG="$HOME/copilot-server.log"

# Pre-flight
[ -x "$LLAMA_SERVER" ] || { echo "FATAL: llama-server not found at $LLAMA_SERVER" >&2; exit 1; }
[ -s "$MODEL" ]        || { echo "FATAL: model not found at $MODEL" >&2; exit 1; }
[ -s "$DRAFT" ]        || { echo "WARN: draft model not found at $DRAFT — running without speculative decoding" >&2; DRAFT=""; }

# Kill any prior server on this port
pkill -f "llama-server.*--port $PORT" 2>/dev/null
sleep 1

# Build args. Draft model is optional.
ARGS=(
  --model "$MODEL"
  --host 0.0.0.0
  --port "$PORT"
  --ctx-size "$CTX"
  --n-gpu-layers "$NGL"
  --threads "$THREADS"
  --log-disable
)
if [ -n "$DRAFT" ]; then
  ARGS+=(--model-draft "$DRAFT")
fi

# Preserve the prior run's log (captures its crash) before overwriting.
[ -f "$LOG" ] && cp "$LOG" "${LOG%.log}.prev.log"

# Launch detached
nohup nice -n 10 "$LLAMA_SERVER" "${ARGS[@]}" > "$LOG" 2>&1 &
PID=$!
disown "$PID" 2>/dev/null || true

# Wait up to 30s for /health to respond
for i in $(seq 1 30); do
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "ready: pid=$PID port=$PORT (took ${i}s)"
    echo "model=$MODEL"
    [ -n "$DRAFT" ] && echo "draft=$DRAFT"
    exit 0
  fi
  sleep 1
done

echo "FATAL: server did not become healthy in 30s. Last log:" >&2
tail -n 30 "$LOG" >&2
exit 1
