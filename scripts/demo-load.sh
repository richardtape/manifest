#!/usr/bin/env bash
# THE LOAD REHEARSAL PLAN'S ACCEPTANCE DEMO (Task 8a): a large course's app rehearsed under its audience's
# arrival, through the edge at https://console.manifest.internal, ON EITHER SOURCE DRIVER. The instructor
# makes `fixtures/load-app/` an app for a large course arriving at once, stages it, and runs the load
# rehearsal: staging is given production's shape — three instances, at production's resources, behind one
# route — the arrival is put on it through the edge, and it PASSES, staging given its own shape back and
# the launch checklist's item met by the measurement. Then the app is made to fall over by its own
# committed switch — a new candidate, the item unmet again — and its rehearsal FAILS, naming the rule it
# broke and the number. And the platform's refusals on the way.
#
#   make demo-load                              # on whichever driver answers; ~13 minutes
#   DEMO_LOAD_STOP_AFTER=2 make demo-load       # stop after step 2 — a negative control's short run
#
#   0  the build; the control plane, the driver                               bash
#   1  the app: created for a large course, committed, staged; the item      load.ts app
#   2  an agent's token and an un-stepped owner refused; nothing started      load.ts app
#   3  the rehearsal — stepped up — answered 202, staging the run's while    bash, load.ts pass
#      it lasts (a deploy, a second run and the sign-in rehearsal refused),
#      polled to PASSED on production's shape read back
#   4  staging given back (one instance, its own memory, the edge's limit    load.ts pass
#      for everyone); the item met; one load_rehearsal.completed
#   5  the app made to fall over — committed: a new candidate, item unmet    load.ts candidate
#   6  its rehearsal — stepped up — FAILS naming the share answered;         bash, load.ts fallover
#      staging given back; the item says why; and LAST, a 601st request
#      from one address in a minute answered 429 (it spends the minute)
#
# THE APP, BY DRIVER: `load-local` on driver 1, `load-github` on driver 2 — THE GitHub FAKE, real GitHub
# refused by name. NOTHING HERE LAUNCHES, so a run that finds the app an earlier run left deletes it (and
# what its rehearsals recorded) and makes it again: every run rehearses a fresh app. The app is left
# behind, staging serving the release that falls over — and a `pnpm test` truncates the platform's tables
# and orphans it, so delete it first (B sitting 5's F2).
#
# THE SPLIT, as every headless demo's (P5a Decision 38): signing in and stepping up are the browser's and
# the IdP's business, through THE one flow, infra/lib/idp-login.sh. Everything else is
# packages/journey/src/load.ts, through @manifest/contract — and `docker inspect` and the edge's admin
# API, which read what the platform built. A step-up lasts ten minutes, so the owner steps up right
# before each rehearsal.
#
# A LOAD REHEARSAL IS LOAD: read the load line at the start and the end, and never trust a red measured
# beside a Vitest run, a Docker tier or a screen share.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`.
set -euo pipefail

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
# The run's own directory: cookie jars and the state file the phases share. Kept when the run is red.
WORK="$(mktemp -d -t manifest-load)"
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"
RUN_ID="r$(date +%s)"
STOP_AFTER="${DEMO_LOAD_STOP_AFTER:-}"
STARTED="$(date +%s)"
case "$STOP_AFTER" in
  '' | [0-6]) ;;
  *) fail "DEMO_LOAD_STOP_AFTER is '$STOP_AFTER' — a step, 0 to 6" ;;
esac

load_now() { sysctl -n vm.loadavg | awk '{print $2}'; }

finish() {
  local status=$?
  if [ "$status" = 0 ]; then
    rm -rf "$WORK"
  else
    printf '\n\033[31mFAILED after %s s (load %s) — the run’s working directory is kept: %s\033[0m\n' \
      "$(($(date +%s) - STARTED))" "$(load_now)" "$WORK" >&2
  fi
}
trap finish EXIT

# The Manifest session out of a curl jar, under its name on an https origin (FE-28).
session_of() { awk -F'\t' 'NF==7 && $6=="__Host-manifest_session" {print $7}' "$1"; }

# Quiet when it builds, and LOUD when it does not: `tsc` writes its errors to STDOUT.
build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above. This demo is checked against the
generated contract, so a call or a field the contract does not have stops here."
  fi
}

# One phase of the TypeScript half, timed. Each reads the state file the last one wrote.
run_phase() {
  local t0=$SECONDS
  env NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" MANIFEST_STOP_AFTER="$STOP_AFTER" \
    MANIFEST_SESSION="${SESSION:-}" MANIFEST_SESSION_STEPPED="${SESSION_STEPPED:-}" \
    MANIFEST_SLUG="$SLUG" MANIFEST_DRIVER="$DRIVER" MANIFEST_RUN_ID="$RUN_ID" \
    node packages/journey/dist/load.js "$1" "$STATE"
  echo "  ($1: $((SECONDS - t0)) s)"
}

state_field() { node -e 'const v=require(process.argv[1])[process.argv[2]];if(v===undefined){process.exit(1)}console.log(v)' "$STATE" "$1"; }

# Ends the run, green, once the step asked for is done — the phase has already said whether every check
# it ran passed (it exits 1 otherwise, and `set -e` stops here first).
stopped() {
  if state_field stopped >/dev/null 2>&1; then
    say "Stopped after step $STOP_AFTER, as DEMO_LOAD_STOP_AFTER asked — $(($(date +%s) - STARTED)) s"
    exit 0
  fi
}

# §20's second round trip: the IdP must RE-PROMPT, which `idp_login` asserts. The cookie from before
# stays a valid, un-stepped session (P6a Decision 8).
step_up() {
  local before after
  before="$(session_of "$CP_JAR")"
  idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/step-up" instructor instructor \
    "$ORIGIN/auth/saml/callback" "$CA"
  after="$(session_of "$CP_JAR")"
  [ -n "$after" ] && [ "$after" != "$before" ] || fail "the step-up left the session unchanged —
read the control plane's '[auth] step-up' lines."
  SESSION_STEPPED="$after"
  echo "  the owner stepped up"
}

say "0. The client and the demo, built from the checked-in document"
build @manifest/contract
build @manifest/journey
echo "  built — the load is $(load_now)"

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
  local) ;;
  github)
    # The FAKE's demo, never real GitHub's — asked before its health, so the refusal names the cause.
    require_fake_github
    [ "$(curl -sS -m 2 "$FAKE/_fake/health" 2>/dev/null)" = ok ] \
      || fail "the control plane runs driver 2 and the GitHub fake does not answer at $FAKE — make github-up"
    ;;
  *) fail "source_driver answered '$DRIVER'" ;;
esac
SLUG="load-$DRIVER"
echo "  driver $([ "$DRIVER" = local ] && echo 1 || echo 2) ($DRIVER) — the app is $SLUG"
GENERATOR="manifest/vegeta:$(awk -F'\t' '$1 == "version" {print $2}' infra/vegeta/vegeta.lock)"
docker image inspect --format '{{.Id}}' "$GENERATOR" >/dev/null 2>&1 \
  || fail "the generator's image $GENERATOR is not in Docker's store — make seed builds it (infra/seed/build-vegeta.sh)"
echo "  the generator's image $GENERATOR is built"
if [ "$STOP_AFTER" = 0 ]; then
  say "Stopped after step 0, as DEMO_LOAD_STOP_AFTER asked"
  exit 0
fi

say "1. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no __Host-manifest_session cookie"
# The slug's repository, if a `pnpm test` or `make reset` left it without its project.
clear_orphan_repository "$SLUG"
run_phase find
if [ "$(state_field existing)" = here ]; then
  step_up
  run_phase clear
  clear_orphan_repository "$SLUG"
fi
run_phase app
stopped

say "3. The load rehearsal, run by the owner — stepped up"
step_up
run_phase pass
stopped

say "5. The app, made to fall over"
run_phase candidate
stopped

say "6. Its load rehearsal — stepped up again"
step_up
run_phase fallover

ELAPSED=$(($(date +%s) - STARTED))
say "Done — make demo-load green in $ELAPSED s on driver $([ "$DRIVER" = local ] && echo 1 || echo 2) (load $(load_now))."
cat <<SUMMARY
  https://$(state_field stagingHost)     staging, back to one instance, serving the release that falls over

  What this proved: a large course's app was given production's three instances on staging for its load
  rehearsal, loaded through the edge with only the generator's address let past the rate limit, judged
  against the pass mark, and given back its own shape — and the launch checklist's item was met by that
  measurement. A new candidate made it unmet again; one that could not take the crowd failed, saying what
  share of requests it answered against the mark. A token, an owner not stepped up, a second run, a
  staging deploy and the sign-in rehearsal were each refused while it ran.
SUMMARY
