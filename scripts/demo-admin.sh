#!/usr/bin/env bash
# P11's ACCEPTANCE, THE HEADLESS HALF (Task 12; `make demo-admin`): the administrator's console walked
# headless in Chrome on the mock's demo fleet — nine checks, each asserting what an operator sees
# (packages/admin-ui/walk/walk.ts says which). The clicked half is Rich's.
#
#   1. refuses if 7101 or 7113 already listens (`make admin-ui`, or another walk);
#   2. builds @manifest/contract (its dist/ is git-ignored — P11's I1) and the console (`vite build`);
#   3. starts manifest-mock on 7113 with a FRESH demo fleet (MANIFEST_MOCK_FLEET=demo — the walk's
#      decisions change it, and only a restart resets it) and its step-up on, then the built console
#      on 7101 (`vite preview`, /v1 and /auth proxied to that mock);
#   4. starts Chrome headless on a debugging port the system picks (Decision 17), in a fresh profile;
#   5. runs the walk; stops all three and deletes the profile, whatever happened.
#
# No control plane, no Docker, no network — so it runs on either source driver, or none.
#
#   DEMO_ADMIN_SHOTS=<dir>      each check's screenshot (default: a new temporary directory, kept)
#   DEMO_ADMIN_STOP_AFTER=1–9   stop after that check — a negative control's short run
#   DEMO_ADMIN_DEV=1            walk `vite dev` instead of the build: React's StrictMode runs every effect
#                               twice there, which is the only place a defect of that kind shows
#                               (sitting 5's F2) — and what `make admin-ui` serves
#
# bash 3.2 (macOS): no mapfile, no `xargs -r`.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT_ADMIN_UI=7101
PORT_ADMIN_MOCK=7113
CHROME="${DEMO_ADMIN_CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

for p in $PORT_ADMIN_UI $PORT_ADMIN_MOCK; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "demo-admin: something already listens on $p — stop it first (lsof -nP -iTCP:$p -sTCP:LISTEN)" >&2
    exit 1
  fi
done
if [ ! -x "$CHROME" ]; then
  echo "demo-admin: no Chrome at $CHROME (DEMO_ADMIN_CHROME names another)" >&2
  exit 1
fi

pnpm --filter @manifest/contract build
if [ "${DEMO_ADMIN_DEV:-0}" = 1 ]; then
  SERVE=dev
else
  SERVE=preview
  pnpm --filter @manifest/admin-ui build
fi

SHOTS="${DEMO_ADMIN_SHOTS:-$(mktemp -d -t manifest-demo-admin)}"
mkdir -p "$SHOTS"
PROFILE="$(mktemp -d -t manifest-demo-admin-chrome)"

# A background job's whole tree, every pid of it, read BEFORE any is signalled: a job a non-interactive
# script backgrounds ignores SIGINT, and pnpm runs each package script through a shell, so killing pnpm
# alone can leave the node process holding its port (P11 sitting 1's F2; scripts/admin-ui.sh's pattern),
# and a child whose parent has gone is no longer found under it.
tree_of() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null || true); do
    tree_of "$child"
  done
  echo "$1"
}
# Running, and not merely a zombie this shell has not reaped yet (`kill -0` succeeds on one).
running() {
  local st
  st="$(ps -o stat= -p "$1" 2>/dev/null)" || return 1
  case "$st" in *Z*) return 1 ;; esac
  return 0
}
MOCK_PID=""
UI_PID=""
CHROME_PID=""
WALK_PID=""
# TERM to every process of the four trees, then up to ten seconds, then KILL whatever ignored it — a
# wedged server or Chrome must not hold this trap, the two ports and the profile for ever (the
# whole-branch review's M3).
stop() {
  trap - EXIT INT TERM
  local pids="" p alive=""
  for p in "$WALK_PID" "$CHROME_PID" "$UI_PID" "$MOCK_PID"; do
    [ -n "$p" ] && pids="$pids $(tree_of "$p" | tr '\n' ' ')"
  done
  for p in $pids; do kill -TERM "$p" 2>/dev/null || true; done
  for _ in $(seq 1 20); do
    alive=""
    for p in $pids; do running "$p" && alive="$alive $p"; done
    [ -z "$alive" ] && break
    sleep 0.5
  done
  if [ -n "$alive" ]; then
    echo "demo-admin: KILL to what ignored TERM for 10 s:$alive" >&2
    for p in $alive; do kill -KILL "$p" 2>/dev/null || true; done
  fi
  wait 2>/dev/null || true
  rm -rf "$PROFILE"
}
trap stop EXIT
trap 'stop; exit 130' INT
trap 'stop; exit 143' TERM

MANIFEST_MOCK_PORT=$PORT_ADMIN_MOCK MANIFEST_MOCK_ROLE=admin \
  MANIFEST_MOCK_FLEET=demo MANIFEST_MOCK_STEP_UP=1 \
  pnpm --filter @manifest/mock start >"$SHOTS/mock.log" 2>&1 &
MOCK_PID=$!

# Each server asked by name, not by an open port: the mock names itself in an undeclared path's 404 (the
# question make doctor asks it), and the console's page carries its title.
wait_for() {
  local pid="$1" url="$2" says="$3" what="$4"
  for _ in $(seq 1 120); do
    if curl -sS -m 1 "$url" 2>/dev/null | grep -q "$says"; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "demo-admin: $what exited before it answered — its log is in $SHOTS" >&2
      return 1
    fi
    sleep 0.5
  done
  echo "demo-admin: $what did not answer within 60 s — its log is in $SHOTS" >&2
  return 1
}
wait_for "$MOCK_PID" "http://127.0.0.1:$PORT_ADMIN_MOCK/v1/__doctor" manifest-mock "manifest-mock on $PORT_ADMIN_MOCK"

MANIFEST_MOCK=1 MANIFEST_MOCK_PORT=$PORT_ADMIN_MOCK \
  pnpm --filter @manifest/admin-ui "$SERVE" >"$SHOTS/console.log" 2>&1 &
UI_PID=$!
wait_for "$UI_PID" "http://127.0.0.1:$PORT_ADMIN_UI/" '<title>Manifest operations</title>' "the console on $PORT_ADMIN_UI ($SERVE)"

"$CHROME" --headless=new --remote-debugging-port=0 --user-data-dir="$PROFILE" \
  --window-size=1440,1000 --no-first-run --no-default-browser-check about:blank \
  >"$SHOTS/chrome.log" 2>&1 &
CHROME_PID=$!

echo "demo-admin: the console ($SERVE) on $PORT_ADMIN_UI, its mock on $PORT_ADMIN_MOCK, Chrome headless — walking"
# In the background and waited on, so a signal reaches the trap at once rather than after the walk
# exits (bash defers a trap until a FOREGROUND child returns — found when a hung walk outlived a TERM).
DEMO_ADMIN_PROFILE="$PROFILE" DEMO_ADMIN_SHOTS="$SHOTS" node packages/admin-ui/walk/walk.ts &
WALK_PID=$!
rc=0
wait "$WALK_PID" || rc=$?
WALK_PID=""
if [ "$rc" -ne 0 ]; then
  echo "demo-admin: FAILED (walk exit $rc) — screenshots and the three servers' logs in $SHOTS" >&2
  exit "$rc"
fi
echo "demo-admin: every check passed — screenshots in $SHOTS"
