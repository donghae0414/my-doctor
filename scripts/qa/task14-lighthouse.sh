#!/bin/bash
set -euo pipefail

port="${TASK14_LIGHTHOUSE_PORT:-31014}"
: "${TASK14_SOURCE_HASH:?TASK14_SOURCE_HASH is required}"
evidence=".omo/evidence/task-14-postpartum-medical-chat"
output="$evidence/lighthouse"
server_log="$evidence/lighthouse-server.log"
run_log="$evidence/lighthouse-run.log"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill -TERM "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

rm -rf "$output"
mkdir -p "$output"
OPENAI_API_KEY="lighthouse-not-used" \
DOORLOCK_PASSWORD="1234" \
AUTH_SECRET="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" \
NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS="1" \
  pnpm build 2>&1 | tee "$evidence/lighthouse-build.txt"

OPENAI_API_KEY="lighthouse-not-used" \
DOORLOCK_PASSWORD="1234" \
AUTH_SECRET="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" \
NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS="1" \
  pnpm start --hostname 127.0.0.1 --port "$port" > "$server_log" 2>&1 &
server_pid=$!

set +o pipefail
tail -n +1 -f "$server_log" | grep -m 1 "Ready in" > "$evidence/lighthouse-ready.txt"
set -o pipefail
TASK14_LIGHTHOUSE_OUTPUT="$output" TASK14_SOURCE_HASH="$TASK14_SOURCE_HASH" \
  bun run scripts/qa/task14-lighthouse.mts "http://127.0.0.1:$port" | tee "$run_log"
