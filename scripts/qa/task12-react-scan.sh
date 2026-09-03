#!/bin/sh
set -eu

cleanup() {
  rm -rf app/motion-task-12 app/motion-attachments-task-12 .next-playwright/task-12-*
}

trap cleanup EXIT INT TERM
cleanup
TASK12_SERVER_MODE=development PLAYWRIGHT_TASK_SCOPE=task-12 \
  pnpm playwright test tests/e2e/react-scan.spec.ts --project=chromium
