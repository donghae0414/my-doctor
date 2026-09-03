#!/bin/sh
set -eu

route_directory="app/chat-shell-task-10"
rm -rf "$route_directory"

cleanup() {
  rm -rf "$route_directory" "$PLAYWRIGHT_NEXT_DIST_DIR"
}

terminate_tree() {
  parent_pid=$1
  for child_pid in $(pgrep -P "$parent_pid" 2>/dev/null || true); do
    terminate_tree "$child_pid"
  done
  kill -TERM "$parent_pid" 2>/dev/null || true
  wait "$parent_pid" 2>/dev/null || true
}

cleanup_server() {
  trap - EXIT INT TERM
  terminate_tree "$server_pid"
  cleanup
}

trap cleanup EXIT INT TERM
mkdir -p "$route_directory"
cp tests/e2e/chat-shell-page.tsx "$route_directory/page.tsx"

OPENAI_API_KEY="playwright-not-used" \
DOORLOCK_PASSWORD="1234" \
AUTH_SECRET="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" \
NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS=1 \
PLAYWRIGHT_NEXT_DIST_DIR="$PLAYWRIGHT_NEXT_DIST_DIR" \
pnpm dev --hostname 127.0.0.1 --port "$PLAYWRIGHT_SERVER_PORT" &
server_pid=$!
trap cleanup_server EXIT INT TERM
wait "$server_pid"
