#!/usr/bin/env bash
# P6a's ACCEPTANCE: an application reaches PRODUCTION with every one of §13's blocking
# items honestly met, through the edge at https://console.manifest.internal.
#
# An instructor builds `launch-app` and is refused production; an administrator records
# what UBC IAM and the Privacy Office said (R1), Manifest runs the rehearsal (R2), the
# administrator is refused the approval until they re-prove themselves at the IdP (§20),
# approves the exact digest (§13), the owner deploys, and the app answers on §12's PUBLIC
# listener as the instance the deploy started. What a LAUNCHED app's next release does is
# `make demo-releases` (P6b), which runs this first on a machine where launch-app has not launched.
#
# THE SPLIT, and why — the same as `scripts/demo-journey.sh` (P5a Decision 38). Signing in,
# and stepping up, are the browser's and the IdP's business (D23.8), so both go through THE
# one flow, infra/lib/idp-login.sh — `/auth/step-up` is driven exactly as `/auth/login` is,
# and `idp_login` already posts `RelayState` beside the assertion, whose absence answered
# `401` when a second implementation of this walk forgot it (P6a sitting 9, F11).
# Everything Manifest's API does is packages/journey/src/production.ts, importing nothing
# but @manifest/contract.
#
# THE STEP-UP IS A CLAIM ON THE COOKIE, AND SESSIONS ARE STATELESS (P6a Decision 8): the
# cookie from before a step-up is still a valid session afterwards, without the claim. So
# this script keeps BOTH for each person and hands the TypeScript the one each step needs —
# which is what lets step 6 prove the refusal and step 7 prove the approval, from one run.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.
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
# The one place this demo's project name is written in bash; production.ts writes it in
# `SLUG`. Its OWN project, never journey-app (P6a sitting 10, F21).
SLUG=launch-app
WORK="$(mktemp -d -t manifest-production)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
OP_JAR="$WORK/operator.jar"
OP_IDP_JAR="$WORK/operator-idp.jar"
STATE="$WORK/state.json"

session_of() { awk -F'\t' 'NF==7 && $6=="manifest_session" {print $7}' "$1"; }

build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above. This demo is checked against the
generated contract, so a call or a field the contract does not have stops here."
  fi
}

# One phase of the TypeScript half. Each phase reads the state file the last one wrote.
run_phase() {
  NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" \
    MANIFEST_SESSION="${SESSION:-}" MANIFEST_SESSION_STEPPED="${SESSION_STEPPED:-}" \
    MANIFEST_ADMIN_SESSION="${ADMIN_SESSION:-}" \
    MANIFEST_ADMIN_SESSION_STEPPED="${ADMIN_SESSION_STEPPED:-}" \
    node packages/journey/dist/production.js "$1" "$STATE"
}

# §20's second round trip, for the person whose jars are $1 and $2. Prints the NEW session
# value. The IdP must RE-PROMPT a jar it signed in minutes ago (ForceAuthn), which
# `idp_login` asserts for free: its hop 2 fails unless the IdP serves a login form.
step_up() {
  local jar="$1" idp_jar="$2" user="$3" before after
  before="$(session_of "$jar")"
  idp_login "$jar" "$idp_jar" "$ORIGIN/auth/step-up" "$user" "$user" \
    "$ORIGIN/auth/saml/callback" "$CA"
  after="$(session_of "$jar")"
  [ -n "$after" ] && [ "$after" != "$before" ] || fail "the step-up for '$user' left the
session unchanged — the callback did not re-sign it. Read the control plane's
'[auth] step-up' lines."
  printf '%s' "$after"
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
README's 'Running the control plane' has the exact commands — and check the boot line
says {\"driver\":\"docker\"} and \"origin\":\"$ORIGIN\"." ;;
esac

say "0. Is §12's public listener there? (127.0.0.3, P6a Task 2)"
ifconfig lo0 | grep -q "inet $PUBLIC_EDGE_IP " || fail "$PUBLIC_EDGE_IP is not on lo0 —
a production app has nowhere to answer. \`make host-setup\` adds it (it needs sudo)."
echo "  $PUBLIC_EDGE_IP is on lo0"

say "1. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no manifest_session cookie"
clear_orphan_repository "$SLUG"

say "1–3. launch-app: built, in staging, and refused production — through @manifest/contract"
run_phase instructor

# P6b Task 4: A LAUNCHED launch-app ENDS THE RUN HERE. The instructor phase checked what a
# launched project durably is and said so in the state file — a flag, not an exit code,
# because a phase that ends early must not read as red (P6a F9). The phases below were
# written for a project that has not launched, and the admin phase's rehearsal is refused
# once one has (REHEARSAL_LAUNCHED).
if grep -q '"launched": true' "$STATE"; then
  say "launch-app has launched — the re-use path ends here (P6b Task 4)"
  exit 0
fi

say "4. An administrator, made out of band (§20)"
# Signed in ONCE so the users row exists, granted, then signed in AGAIN — a session carries
# the role it was issued with. `admin-grant.sh` records nothing when the role is already set.
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator \
  "$ORIGIN/auth/saml/callback" "$CA"
bash scripts/admin-grant.sh grant opr000001 "P6a's acceptance approves a production launch (§13)"
rm -f "$OP_JAR" "$OP_IDP_JAR"
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator \
  "$ORIGIN/auth/saml/callback" "$CA"
ADMIN_SESSION="$(session_of "$OP_JAR")"
[ -n "$ADMIN_SESSION" ] || fail "the operator's second sign-in left no session"

say "4–6. Records, the rehearsal, and an approval refused — through @manifest/contract"
run_phase admin

say "7. Both people re-prove themselves at the IdP (§20's step-up)"
ADMIN_SESSION_STEPPED="$(step_up "$OP_JAR" "$OP_IDP_JAR" operator)"
echo "  the administrator stepped up — the IdP re-prompted a browser it had signed in"
SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
echo "  the owner stepped up"

say "7–9. The gate, the approval and the launch — through @manifest/contract"
run_phase launch
