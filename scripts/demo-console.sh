#!/usr/bin/env bash
# P5c Decision 13: serve D22's reference console and print the checklist a PERSON clicks.
#
# IT SIGNS NOBODY IN. An agent driving Chrome cannot type a password (ORIENTATION §4), and
# more to the point the clicked half of 1c's acceptance is a person's job by Rich's R3.
# This script's whole responsibility is to make the console reachable and say what to do
# with it; `scripts/ci-acceptance.sh` is the headless half.
#
# It is its own target rather than a phase of `make demo-journey` for the reason P5b's
# Decision 10 gives: a red run of a combined target is ambiguous about which client broke.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=./lib/api.sh
. scripts/lib/api.sh

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

PORT="${MANIFEST_CONSOLE_PORT:-7104}"
PREVIEW_PID=""

# BY PID, in a trap, and it says so — a preview server left listening is a machine this
# script did not leave as it found it, and the next run fails `EADDRINUSE` on a strict port.
cleanup() {
  if [ -n "$PREVIEW_PID" ] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    echo "  stopped the preview server on $PORT (pid $PREVIEW_PID)"
  fi
}
trap cleanup EXIT

# Quiet when it builds, LOUD when it does not. `tsc` writes its errors to STDOUT, so a
# `build >/dev/null` throws them away and a console that no longer type-checks against the
# generated contract stops at `make: *** Error 2` with nothing saying why (P5a sitting 5).
build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — the errors are above."
  fi
}

say "0. The client and the console, built from the checked-in document"
# THE CONTRACT FIRST, EVERY TIME. Its `exports` map sends `tsc` to src/ and Vite to dist/,
# so a stale dist/ ships with every gate green (P5c sitting 1, F3).
build @manifest/contract
build @manifest/console
echo "  built"

say "1. Is the control plane up, through the edge?"
# THE ANSWER, NOT THAT AN ANSWER ARRIVED: through the edge a stopped control plane is
# Caddy's empty 502 and a refused source is a 403 with a body of its own, and
# `curl -o /dev/null` passes both (P5a Task 3).
UP="$(curl -sS -m 5 -w ' [%{http_code}]' "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}).
README's 'Running the control plane' has the exact commands." ;;
esac

say "2. Serve the console on $PORT — the production build, not the dev server"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "something is already listening on $PORT. Stop it first:
  lsof -nP -iTCP:$PORT -sTCP:LISTEN -t | xargs kill"
fi
pnpm --filter @manifest/console preview >/dev/null 2>&1 &
PREVIEW_PID=$!
echo "  vite preview started (pid $PREVIEW_PID)"

say "3. Does the EDGE serve the console — the console's document, not the wildcard page?"
# THE WILDCARD ANSWERS 200 FOR ANY NAME AND ANY PATH with the body `manifest OK host=…`
# (P4b finding 193), so a status-only check passes against a console that is not there.
# Read the BODY.
OK=""
for _try in 1 2 3 4 5 6 7 8 9 10; do
  BODY="$(curl -sS -m 5 "$ORIGIN/" 2>/dev/null || true)"
  case "$BODY" in
    *'<div id="root">'*) OK=yes; break ;;
    *'manifest OK host='*) fail "the WILDCARD answered, not the console site — the request
never reached the console's Caddyfile site at all. Check infra/caddy/Caddyfile." ;;
  esac
  sleep 1
done
[ -n "$OK" ] || fail "the console never answered at $ORIGIN (last body: ${BODY:0:120}).
A 502 means nothing is listening on $PORT; check the preview server above."
echo "  $ORIGIN serves the console's own document"

cat <<CHECKLIST

$(printf '\033[1m%s\033[0m' "The console is at $ORIGIN — §22's journey, clicked.")

Sign in as the INSTRUCTOR (instructor / instructor). Only you can type the password: the
Chrome extension will not, even a test user's (ORIENTATION §4).

  1. Sign in with CWL. The header reads your name and CWL PUID.
  2. Create a project. Type a name and watch it checked as you type; choose the blueprint,
     the starter and who it is for. It lands on the project screen.
  3. The project's ACTIVITY panel says 'live' and already carries three events —
     project.created, repository.seeded, spec.validated.
  4. Press Build and read the log lines as they are written. WAIT: the log reaching DONE
     is NOT the end of the build — §12's scan runs after it, silently, for about ten
     seconds. The pill says 'running' until it is done, and a release before then is
     refused 409 RELEASE_BUILD_NOT_DEPLOYABLE.
  5. Release this build, then Deploy to staging, and watch the instance states arrive.
  6. Open the app's own URL and sign in to the RUNNING APPLICATION with CWL (student /
     student). Write a note; ask the LLM a question. [make demo-ai covers this half.]
  7. Request production: read §13's first-launch checklist, every item with its state, its
     reason, its owner and the plan that builds it.
  8. Tokens: mint a delegated token, copy the secret you are shown ONCE, list it, revoke it.
  9. Queue: with an agent holding that token, ask for something D24 reserves to a person,
     and confirm or reject it here. RUNBOOK's 'Answering an agent's pending action' has
     the agent's half.

An administrator also has /fleet (§26). scripts/admin-grant.sh grants the role, and it
reaches a person only when they SIGN IN AGAIN.

Press Ctrl-C when you are done; this script stops the server it started.
CHECKLIST

# Hold the preview server until the person is finished. `wait` on the pid rather than a
# sleep, so Ctrl-C runs the trap.
wait "$PREVIEW_PID"
