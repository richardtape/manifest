#!/usr/bin/env bash
# THE ADMINISTRATOR'S CONSOLE AND ITS OWN MOCK, TOGETHER (P11's Task 2; `make admin-ui`).
#
#   manifest-mock on 7113 — MANIFEST_MOCK_ROLE=admin, MANIFEST_MOCK_FLEET=demo (the demo fleet, from
#                           P11's Task 3; until then the mock ignores it and answers mock-app alone)
#   the console on 7101   — vite dev, /v1 and /auth proxied to that mock (MANIFEST_MOCK=1)
#
# Then open http://127.0.0.1:7101. Ctrl-C stops both. MANIFEST_MOCK_STEP_UP=1 makes the mock's
# privileged operations refuse 403 STEP_UP_REQUIRED until its step-up round trip.
#
# 7113, NOT 7102 (P11's Decision 14): 7102 is the faculty front-end's mock, which another session may
# hold. `make doctor` asks both of these ports who they are (Decision 16).
#
# bash 3.2 (macOS): no mapfile, no `xargs -r`.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT_ADMIN_UI=7101
PORT_ADMIN_MOCK=7113

for p in $PORT_ADMIN_UI $PORT_ADMIN_MOCK; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "admin-ui: something already listens on $p — stop it first (lsof -nP -iTCP:$p -sTCP:LISTEN)" >&2
    exit 1
  fi
done

# The console bundles @manifest/contract's dist/, which is git-ignored and absent from a fresh
# checkout or worktree (P11's I1) — built first, as ci-acceptance.sh builds it.
pnpm --filter @manifest/contract build

# A background job's whole tree: pnpm runs each package script through a shell, so killing pnpm
# alone can leave the node process holding its port.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill -TERM "$1" 2>/dev/null || true
}
MOCK_PID=""
UI_PID=""
stop() {
  trap - EXIT INT TERM
  [ -n "$UI_PID" ] && kill_tree "$UI_PID"
  [ -n "$MOCK_PID" ] && kill_tree "$MOCK_PID"
  wait 2>/dev/null || true
}
trap stop EXIT
trap 'stop; exit 130' INT
trap 'stop; exit 143' TERM

# The mock reads `=== '1'`, and an assignment written by an expansion is not an assignment in bash,
# so the variable is always set — to 0 when the caller did not set it.
MANIFEST_MOCK_PORT=$PORT_ADMIN_MOCK MANIFEST_MOCK_ROLE=admin MANIFEST_MOCK_FLEET=demo \
  MANIFEST_MOCK_STEP_UP="${MANIFEST_MOCK_STEP_UP:-0}" \
  pnpm --filter @manifest/mock start &
MOCK_PID=$!

# The mock names itself in an undeclared path's 404 — the question make doctor asks it.
up=""
for _ in $(seq 1 60); do
  if curl -sS -m 1 "http://127.0.0.1:$PORT_ADMIN_MOCK/v1/__doctor" 2>/dev/null | grep -q 'manifest-mock'; then
    up=yes
    break
  fi
  sleep 0.5
done
if [ -z "$up" ]; then
  echo "admin-ui: manifest-mock did not answer on $PORT_ADMIN_MOCK within 30 s" >&2
  exit 1
fi

# In the background and waited on, so a signal reaches the trap at once rather than after the dev
# server exits (bash defers a trap until a FOREGROUND child returns).
MANIFEST_MOCK=1 MANIFEST_MOCK_PORT=$PORT_ADMIN_MOCK pnpm --filter @manifest/admin-ui dev &
UI_PID=$!
echo "admin-ui: the console on http://127.0.0.1:$PORT_ADMIN_UI, its mock on $PORT_ADMIN_MOCK — Ctrl-C stops both"
wait "$UI_PID"
