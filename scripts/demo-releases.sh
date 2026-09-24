#!/usr/bin/env bash
# P6b's ACCEPTANCE: what a LAUNCHED application's next release does (§13 D9.2), through the
# edge at https://console.manifest.internal, on `launch-app`.
#
#   LEG A  a sensitive change — CWL attribute `sn` removed, an egress host unique to this run
#          added — is refused RELEASE_REESCALATED until an administrator, having read a STORED
#          preview, approves it; production's egress proxy then follows the release.
#   LEG B  a code-only change goes to production SELF-SERVE, under a loop on the public
#          listener that sees nothing but the app.
#   LEG C  §9's IAM change request: `sn` added back fails at the build until UBC IAM has
#          registered it, and then re-escalates like any sensitive change.
#
# PATH-INDEPENDENT (P6b Decision 17). On a machine where launch-app has not launched, this runs
# `scripts/demo-production.sh` first and says so; on any other it starts from whatever an
# earlier run left, repairing only what it honestly can (step 1's RECOVERY, printed as setup).
#
# THE SPLIT, and why — the same as `scripts/demo-production.sh`. Signing in and stepping up are
# the browser's and the IdP's business (D23.8), so both go through THE one flow,
# infra/lib/idp-login.sh. The git commits a faculty member's agent would make, and `docker exec`
# into production's app container to ask its egress proxy, are outside the contract too.
# Everything Manifest's API does is packages/journey/src/releases.ts, importing nothing but
# @manifest/contract.
#
# A STEP-UP LASTS TEN MINUTES (identity/step-up.ts) and every leg builds first, so each leg's
# stepped-up calls get a step-up of their own, taken right before them. Sessions are stateless
# (P6a Decision 8), so the cookie from before a step-up stays a valid, un-stepped session — which
# is what lets leg A prove the refusal and the approval from one run.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`, and `sed -i ''`.
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
# The one place this demo's project name is written in bash; releases.ts writes it in `SLUG`.
SLUG=launch-app
REPOS="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}"
STARTER="$ROOT/blueprints/node-ts-mongo/starters/proof-app/manifest.yaml"
WORK="$(mktemp -d -t manifest-releases)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
OP_JAR="$WORK/operator.jar"
OP_IDP_JAR="$WORK/operator-idp.jar"
STATE="$WORK/state.json"
SRC="$WORK/src"
# UNIQUE TO THE RUN, so leg A's manifest is a sensitive change whatever an earlier run left.
RUN_ID="r$(date +%s)"
RUN_HOST="$RUN_ID.example.org"
COMMIT=""

session_of() { awk -F'\t' 'NF==7 && $6=="manifest_session" {print $7}' "$1"; }
state_field() { field "$1" < "$STATE"; }

build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above. This demo is checked against the
generated contract, so a call or a field the contract does not have stops here."
  fi
}

# One phase of the TypeScript half. Each reads the state file the last one wrote.
run_phase() {
  NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" \
    MANIFEST_SESSION="${SESSION:-}" MANIFEST_SESSION_STEPPED="${SESSION_STEPPED:-}" \
    MANIFEST_ADMIN_SESSION="${ADMIN_SESSION:-}" \
    MANIFEST_ADMIN_SESSION_STEPPED="${ADMIN_SESSION_STEPPED:-}" \
    MANIFEST_RUN_HOST="$RUN_HOST" MANIFEST_COMMIT="$COMMIT" \
    MANIFEST_LOOP_SCRIPT="$ROOT/scripts/lib/redeploy-loop.mjs" MANIFEST_WORK="$WORK" \
    node packages/journey/dist/releases.js "$1" "$STATE"
}

# §20's second round trip, for the person whose jars are $1 and $2 — exactly
# demo-production.sh's. Prints the NEW session. The IdP must RE-PROMPT (ForceAuthn), which
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

# A commit to launch-app's repository, as a faculty member's agent would push one. $1 is the
# message; the caller has already edited $SRC. Sets COMMIT, which the next phase validates and
# builds BY SHA — an empty build request builds the newest VALIDATED commit, not HEAD.
commit_to_app() {
  git -C "$SRC" -c user.name=manifest -c user.email=manifest@localhost commit -qam "$1"
  git -C "$SRC" push -q origin HEAD:main
  COMMIT="$(git -C "$SRC" rev-parse HEAD)"
  echo "  pushed $COMMIT — $1"
}

# The starter's manifest.yaml, named for this project the way creation seeds it, with ONE
# egress host — this run's. $1 is the attributes line's list. Each edit is asserted, because an
# edit that matches nothing proves nothing (demo-redeploy's lesson).
write_manifest() {
  sed -e 's/^name: proof-app$/name: launch-app/' \
    -e "s/^  attributes: \[.*\]$/  attributes: [$1]/" "$STARTER" > "$SRC/manifest.yaml"
  printf '\negress:\n  allow: [%s]\n' "$RUN_HOST" >> "$SRC/manifest.yaml"
  grep -q '^name: launch-app$' "$SRC/manifest.yaml" \
    || fail "the starter's manifest.yaml no longer names 'proof-app' — nothing was renamed"
  grep -q "^  attributes: \[$1\]$" "$SRC/manifest.yaml" \
    || fail "the attributes line was not rewritten to [$1] — nothing would be proved"
  grep -q "^  allow: \[$RUN_HOST\]$" "$SRC/manifest.yaml" \
    || fail "egress.allow does not name $RUN_HOST"
}

# What production's egress proxy answers, from inside the app container serving production:
# the first status line tinyproxy returns for http://$2/. `403 Filtered` is tinyproxy's refusal;
# anything else means the filter let it through — offline, `500 Unable to connect`.
# TWO WAYS THIS LINE KILLED THE SCRIPT SILENTLY, both under `pipefail` inside `$(…)`, and both
# measured: wget exits 1 on any non-2xx — every answer here but the positive control's — which
# is what `; true` INSIDE the container absorbs (this demo's first run, 3 of 3); and an awk that
# `exit`s at the first match closes the pipe while `docker exec` is still writing, so the exec
# dies of SIGPIPE, 141, now and then (its second fresh run, on the positive control; 0 of 9 when
# re-measured). So awk reads to the end. The status line is the evidence, never an exit code.
egress_answer() {
  docker exec "$1" sh -c "wget -S -O /dev/null -T 5 'http://$2/' 2>&1; true" \
    | awk '/^  HTTP\// && !seen {sub(/^  /, ""); print; seen = 1}'
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
README's 'Running the control plane' has the exact commands." ;;
esac

say "0. Is §12's public listener there? (127.0.0.3)"
ifconfig lo0 | grep -q "inet $PUBLIC_EDGE_IP " || fail "$PUBLIC_EDGE_IP is not on lo0 —
a production app has nowhere to answer. \`make host-setup\` adds it (it needs sudo)."
echo "  $PUBLIC_EDGE_IP is on lo0"

say "1. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no manifest_session cookie"
run_phase status
if ! grep -q '"launched": true' "$STATE"; then
  say "1. launch-app has not launched on this machine — running \`make demo-production\` first (Decision 17)"
  bash scripts/demo-production.sh
  run_phase status
  grep -q '"launched": true' "$STATE" || fail "make demo-production finished and launch-app has
still not launched — a launch is recorded by the deploy that makes it true (P6b Task 4)."
fi

say "1. An administrator, made out of band (§20), and both people step up"
# Signed in ONCE so the users row exists, granted, then signed in AGAIN — a session carries the
# role it was issued with. `admin-grant.sh` records nothing when the role is already set.
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator \
  "$ORIGIN/auth/saml/callback" "$CA"
bash scripts/admin-grant.sh grant opr000001 "P6b's acceptance approves re-escalated releases (§13 D9.2)"
rm -f "$OP_JAR" "$OP_IDP_JAR"
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator \
  "$ORIGIN/auth/saml/callback" "$CA"
ADMIN_SESSION="$(session_of "$OP_JAR")"
[ -n "$ADMIN_SESSION" ] || fail "the operator's second sign-in left no session"
# Step 1's RECOVERY may approve and deploy, so it gets stepped-up sessions of its own.
ADMIN_SESSION_STEPPED="$(step_up "$OP_JAR" "$OP_IDP_JAR" operator)"
SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
echo "  both stepped up"

run_phase setup
git clone -q "$REPOS/$SLUG.git" "$SRC"

say "2. LEG A — commit manifest.yaml: sn removed, egress.allow [$RUN_HOST]"
write_manifest 'ubcEduCwlPuid, mail, eduPersonAffiliation, givenName'
commit_to_app "make demo-releases, leg A ($RUN_ID): sn removed, egress $RUN_HOST"
run_phase stageA
SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
echo "  the owner stepped up for production"
run_phase gateA
ADMIN_SESSION_STEPPED="$(step_up "$OP_JAR" "$OP_IDP_JAR" operator)"
echo "  the administrator stepped up — the IdP re-prompted a browser it had signed in"
run_phase approveA

say "4. From production's app container, through its egress proxy (Task 5a; Task 1's F1)"
# BY THE INSTANCE ID THE DEPLOY RETURNED, never by a name pattern: during a retire drain two app
# containers match a pattern, and `docker exec` against a list answers the daemon's 404.
INSTANCE_A="$(state_field instanceA)"
APP="$(docker ps -q --filter "label=manifest.instance=$INSTANCE_A")"
[ -n "$APP" ] && [ "$(printf '%s\n' "$APP" | grep -c .)" = 1 ] \
  || fail "not exactly one running container carries manifest.instance=$INSTANCE_A (got: '$APP')"
EGRESS_FAILED=""
egress_check() {
  local host="$1" want="$2" got
  got="$(egress_answer "$APP" "$host")"
  case "$want:$got" in
    filtered:*' 403 Filtered') echo "  ok   $host → $got" ;;
    open:*' 403 Filtered' | open:) echo "  FAIL $host → ${got:-(no answer)} — expected it let through"; EGRESS_FAILED=1 ;;
    open:*) echo "  ok   $host → $got (the filter let it through)" ;;
    ok:*' 200 OK') echo "  ok   $host → $got (the positive control)" ;;
    *) echo "  FAIL $host → ${got:-(no answer)} — expected $want"; EGRESS_FAILED=1 ;;
  esac
}
egress_check manifest-verdaccio:4873 ok
egress_check "$RUN_HOST" open
PREVIOUS="$(state_field previousHosts | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).join(" ")))')"
if [ -z "$PREVIOUS" ]; then
  echo "  (no previous run's host — the fresh path; only this run's is checked)"
fi
for host in $PREVIOUS; do egress_check "$host" filtered; done
[ -z "$EGRESS_FAILED" ] || fail "production's egress proxy does not follow the release it serves"
run_phase notStaged

say "5. LEG B — commit a code-only change: a comment in server.js"
printf '\n// make demo-releases, leg B (%s): a code-only change, so a new digest and nothing sensitive.\n' \
  "$RUN_ID" >> "$SRC/server.js"
commit_to_app "make demo-releases, leg B ($RUN_ID): code only"
run_phase stageB
SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
echo "  the owner stepped up for production"
run_phase deployB

say "6. LEG C — UBC registered the narrower set; then sn is asked for again"
run_phase recordC
write_manifest 'ubcEduCwlPuid, mail, eduPersonAffiliation, givenName, sn'
commit_to_app "make demo-releases, leg C ($RUN_ID): sn back"
run_phase buildC
SESSION_STEPPED="$(step_up "$CP_JAR" "$IDP_JAR" instructor)"
ADMIN_SESSION_STEPPED="$(step_up "$OP_JAR" "$OP_IDP_JAR" operator)"
echo "  both stepped up"
run_phase gateC

say "Done — a launched app's next release, all three ways."
cat <<SUMMARY
  https://$SLUG.manifest.internal     production, on the public listener — leg C
  https://$SLUG.staging.manifest.internal

  What this proved: a launched app's code-only release reached production with no
  administrator and interrupted nobody; a sensitive one was refused until an administrator
  approved exactly the stored preview they read, and its egress change took effect; and a
  CWL attribute UBC had not registered could not even be built until UBC registered it.
SUMMARY
