#!/bin/sh
set -eu

chat_route="app/motion-task-12"
attachments_route="app/motion-attachments-task-12"
rm -rf "$chat_route" "$attachments_route"

cleanup() {
  rm -rf "$chat_route" "$attachments_route" "$PLAYWRIGHT_NEXT_DIST_DIR"
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
mkdir -p "$chat_route" "$attachments_route"
cp tests/e2e/chat-shell-page.tsx "$chat_route/page.tsx"
cp tests/e2e/motion-attachments-page.tsx "$attachments_route/page.tsx"

export OPENAI_API_KEY="playwright-not-used"
export DOORLOCK_PASSWORD="1234"
export AUTH_SECRET="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
export NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS="1"
export PLAYWRIGHT_NEXT_DIST_DIR
if [ "${TASK12_SERVER_MODE:-production}" = "development" ]; then
  pnpm dev --hostname 127.0.0.1 --port "$PLAYWRIGHT_SERVER_PORT" &
else
  pnpm build
  pnpm start --hostname 127.0.0.1 --port "$PLAYWRIGHT_SERVER_PORT" &
fi
server_pid=$!
trap cleanup_server EXIT INT TERM
wait "$server_pid"
