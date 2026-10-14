#!/usr/bin/env bash
# A1's ACCEPTANCE DEMO (Task 9): a launched `class` app's production runs TWO instances behind one edge
# route, through the edge at https://console.manifest.internal, ON EITHER SOURCE DRIVER.
#
#   1  two instances serve — both ids, bare, within 8 requests; every member sends its sign-in to UBC
#   2  P4c's witness across two: a SAME-release and a NEW-release redeploy, each under a loop on /healthz
#      and a person's requests to the app's page, classified by body AND header — no 5xx, no wildcard,
#      the set changing exactly once, only the new pair after, its containers and keys exactly the set's
#   3  a release that never becomes ready leaves the pair serving, with an Incident and nothing left
#   4  one member killed: routed around, `instance.exited`, replaced by a new pair
#   5  a crash loop stopped at its cap — at once, a minute, four minutes, then stopped (~7 minutes); the
#      owner's good release, and the count starting again
#   6  a sign-in across instances — NOT RUN: a launched app signs people in with UBC's IdP, which no laptop
#      can complete (manifest-coord3's decision under Rich's delegation, ede301c); held instead by the
#      skeleton's Docker case. Phase 2's signed-in half is not run for the same reason.
#
#   make demo-capacity                         # on whichever driver answers; ~18 minutes
#   DEMO_CAPACITY_PHASES="1 5" make demo-capacity   # only these phases (1 always runs: it builds the
#                                                   # releases the others deploy) — a control's short run.
#                                                   # Phases 2 and 3 are the owner's deploys, which start
#                                                   # the watcher's count again: a run that skips both
#                                                   # can meet a count a recent replacement left, and
#                                                   # phase 4 then reads attempt 2, a minute's wait.
#
# THE APP, BY DRIVER: `launch-app` on driver 1 (`make demo-production` launches it, and is driver 1's);
# `launchpath-github` on driver 2 — THE GitHub FAKE, real GitHub refused by name — which `make demo-launch`
# launches. On a machine where it has not launched, this runs that demo first and says so.
#
# THE SPLIT, as every headless demo's (P5a Decision 38): signing in and stepping up are the browser's and
# the IdP's business, through THE one flow, infra/lib/idp-login.sh. Everything else is
# packages/journey/src/capacity.ts, through @manifest/contract — and `docker kill`, the failure under test.
# A step-up lasts ten minutes, so the owner steps up right before each phase that deploys production.
#
# IT RUNS EVERY PHASE AND FAILS AT THE END, naming each phase that failed, so a red run is a measurement;
# its working directory is kept when it is red.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# shellcheck source=./lib/api.sh
. scripts/lib/api.sh

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

CA="$ROOT/$CA_FILE"
FAKE="${MANIFEST_FAKE_URL:-http://127.0.0.1:7110}"
PHASES="${DEMO_CAPACITY_PHASES:-1 2 3 4 5 6}"
WORK="$(mktemp -d -t manifest-capacity)"
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"
RUN_ID="c$(date +%s)"
FAILED=""
STARTED="$(date +%s)"

cleanup() {
  if [ -z "$FAILED" ]; then rm -rf "$WORK"; else echo "the run's working directory is kept: $WORK" >&2; fi
  return 0
}
trap cleanup EXIT

wants() { case " $PHASES " in *" $1 "*) return 0 ;; esac; return 1; }

# The Manifest session out of a curl jar, under its name on an https origin (FE-28).
session_of() { awk -F'\t' 'NF==7 && $6=="__Host-manifest_session" {print $7}' "$1"; }

build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above."
  fi
}

# One phase of the TypeScript half; each reads the state file the last one wrote. A failed phase is
# recorded and the run goes on — except the two every later phase rests on, which stop it.
run_phase() {
  local started now
  started="$(date +%s)"
  NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" \
    MANIFEST_SESSION="${SESSION:-}" MANIFEST_SESSION_STEPPED="${SESSION_STEPPED:-}" \
    MANIFEST_SLUG="$SLUG" MANIFEST_RUN_ID="$RUN_ID" MANIFEST_WORK="$WORK" \
    MANIFEST_LOOP_SCRIPT="$ROOT/scripts/lib/redeploy-loop.mjs" \
    MANIFEST_LITELLM_MASTER_KEY="$MASTER" \
    node packages/journey/dist/capacity.js "$1" "$STATE"
  local status=$?
  now="$(date +%s)"
  echo "  ($1: $((now - started)) s)"
  if [ "$status" != 0 ]; then
    FAILED="$FAILED $1"
    case "$1" in status | serve) fail "the $1 phase failed, and every later phase rests on it — stopping." ;; esac
  fi
}

# §20's second round trip, as demo-releases.sh's: the IdP must RE-PROMPT, which `idp_login` asserts.
step_up() {
  local before after
  before="$(session_of "$CP_JAR")"
  idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/step-up" instructor instructor \
    "$ORIGIN/auth/saml/callback" "$CA"
  after="$(session_of "$CP_JAR")"
  [ -n "$after" ] && [ "$after" != "$before" ] || fail "the step-up left the session unchanged —
read the control plane's '[auth] step-up' lines."
  SESSION_STEPPED="$after"
  echo "  the owner stepped up for production"
}

say "0. The client and the demo, built from the checked-in document"
build @manifest/contract
build @manifest/journey
echo "  built"

say "0. Is the control plane up, through the edge?"
UP="$(curl -sS -m 5 -w ' [%{http_code}]' "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}).
docs/superpowers/RUNBOOK.md's 'Running the control plane' has the exact commands." ;;
esac

say "0. Which source driver? An unsigned POST /webhooks/github, which records nothing"
DRIVER="$(source_driver)" || exit 1
case "$DRIVER" in
  local) SLUG=launch-app ;;
  github)
    # The FAKE's demo, never real GitHub's — asked before its health, so the refusal names the cause.
    require_fake_github
    [ "$(curl -sS -m 2 "$FAKE/_fake/health" 2>/dev/null)" = ok ] \
      || fail "the control plane runs driver 2 and the GitHub fake does not answer at $FAKE — make github-up"
    SLUG=launchpath-github
    ;;
  *) fail "source_driver answered '$DRIVER'" ;;
esac
echo "  driver $([ "$DRIVER" = local ] && echo 1 || echo 2) ($DRIVER) — the app is $SLUG"

say "0. Is §12's public listener there? (127.0.0.3)"
ifconfig lo0 | grep -q "inet $PUBLIC_EDGE_IP " || fail "$PUBLIC_EDGE_IP is not on lo0 —
a production app has nowhere to answer. \`make host-setup\` adds it (it needs sudo)."
echo "  $PUBLIC_EDGE_IP is on lo0"
# Read here, never printed: the demo counts production's keys at LiteLLM by the app's user.
MASTER="$(sed -n 's/^LITELLM_MASTER_KEY=//p' .env)"
[ -n "$MASTER" ] || fail "no LITELLM_MASTER_KEY in .env to read LiteLLM's keys with"

say "1. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no __Host-manifest_session cookie"
run_phase status
if ! grep -q '"launched": true' "$STATE"; then
  if [ "$DRIVER" = local ]; then
    say "1. $SLUG has not launched on this machine — running \`make demo-production\` first"
    bash scripts/demo-production.sh || fail "make demo-production failed — $SLUG has not launched"
  else
    say "1. $SLUG has not launched on this machine — running \`make demo-launch\` first"
    bash scripts/demo-launch.sh || fail "make demo-launch failed — $SLUG has not launched"
  fi
  run_phase status
  grep -q '"launched": true' "$STATE" || fail "$SLUG has still not launched"
fi

run_phase serve
if wants 2; then
  step_up; run_phase same
  step_up; run_phase fresh
fi
if wants 3; then step_up; run_phase never; fi
wants 4 && run_phase kill
if wants 5; then
  say "5. The crash loop takes about seven minutes: three replacements, a minute and four minutes apart"
  step_up; run_phase crash
  step_up; run_phase recover
fi
wants 6 && run_phase signin

ELAPSED=$(( $(date +%s) - STARTED ))
if [ -n "$FAILED" ]; then
  printf '\n\033[31mFAILED in %s s — the phases:%s\033[0m\n' "$ELAPSED" "$FAILED" >&2
  exit 1
fi
say "Done — make demo-capacity, phases $PHASES, green in $ELAPSED s on driver $([ "$DRIVER" = local ] && echo 1 || echo 2)."
cat <<SUMMARY
  https://$SLUG.manifest.internal     production, two instances, on the public listener

  What this proved: production runs its audience's count behind one route; a redeploy across the pair
  interrupted nobody; a release that never became ready changed nothing; a member that died was routed
  around and replaced; and an app that kept crashing was replaced three times, then left stopped, with
  an Incident saying so. NOT RUN on a laptop: a signed-in person through the redeploy, and a sign-in
  across instances — a launched app signs people in with UBC's IdP.
SUMMARY
