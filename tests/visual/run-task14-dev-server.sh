#!/bin/sh
set -eu

next_env_backup=$(mktemp "${TMPDIR:-/tmp}/task14-next-env.XXXXXX")
tsconfig_backup=$(mktemp "${TMPDIR:-/tmp}/task14-tsconfig.XXXXXX")
isolated_dist=$PLAYWRIGHT_NEXT_DIST_DIR
cp next-env.d.ts "$next_env_backup"
cp tsconfig.json "$tsconfig_backup"

cleanup() {
  rm -rf "$isolated_dist"
  cp "$next_env_backup" next-env.d.ts
  cp "$tsconfig_backup" tsconfig.json
  rm -f "$next_env_backup" "$tsconfig_backup"
  rmdir .next-playwright 2>/dev/null || true
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
export OPENAI_API_KEY="playwright-not-used"
export DOORLOCK_PASSWORD="1234"
export AUTH_SECRET="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
export NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS="1"
export NEXT_TELEMETRY_DISABLED="1"
export PLAYWRIGHT_TEST="1"
unset PLAYWRIGHT_NEXT_DIST_DIR
pnpm dev --hostname 127.0.0.1 --port "$PLAYWRIGHT_SERVER_PORT" &
server_pid=$!
trap cleanup_server EXIT INT TERM
wait "$server_pid"
