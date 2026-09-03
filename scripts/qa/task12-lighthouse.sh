#!/bin/sh
set -eu

port="${TASK12_LIGHTHOUSE_PORT:-31012}"
output="${TASK12_LIGHTHOUSE_OUTPUT:-.omo/evidence/task-12-postpartum-medical-chat/lighthouse-current}"
server_log=".omo/evidence/task-12-postpartum-medical-chat/lighthouse-server.log"
run_log=".omo/evidence/task-12-postpartum-medical-chat/lighthouse-methodology.log"
server_pid=""

cleanup() {
  if [ -n "$server_pid" ]; then
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM
rm -rf "$output"
OPENAI_API_KEY="lighthouse-not-used" \
DOORLOCK_PASSWORD="1234" \
AUTH_SECRET="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" \
NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS="1" \
  pnpm build
OPENAI_API_KEY="lighthouse-not-used" \
DOORLOCK_PASSWORD="1234" \
AUTH_SECRET="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" \
NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS="1" \
  pnpm start --hostname 127.0.0.1 --port "$port" > "$server_log" 2>&1 &
server_pid=$!
until curl -fsS "http://127.0.0.1:$port" >/dev/null; do
  kill -0 "$server_pid"
done
TASK12_LIGHTHOUSE_OUTPUT="$output" \
  bun run scripts/qa/task12-lighthouse.mts "http://127.0.0.1:$port" | tee "$run_log"
