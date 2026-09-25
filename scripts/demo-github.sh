#!/usr/bin/env bash
# THE D5 PLAN'S ACCEPTANCE (Task 15): D5's driver 2 end to end, against the GitHub FAKE,
# offline — an application whose code is on GitHub, private, on `github-app`.
#
#   0  WHICH DRIVER: an unsigned delivery. Driver 1 answers `404 WEBHOOKS_NOT_CONFIGURED`,
#      and this stops, CREATING NOTHING (Decision 17) — no route deletes a project.
#   1  the instructor signs in with CWL
#   2  an orphan `github-app` — left by `pnpm test` or `make reset` — is cleared
#   3  `github-app`, created or re-used: its repository on GitHub, private, `main` protected
#   4  faculty-dev pushes straight to GitHub; a SIGNED webhook reaches Manifest, which
#      validates the commit and never builds it
#   5  the commit is built from the MIRROR, released and deployed to staging
#   6  GitHub gone: the mirror still builds it; HEAD is `503 SOURCE_UNREACHABLE`
#   7  faculty-dev makes the repository public; Manifest makes it private again
#   8  faculty-dev pushes two secret-shaped values; Manifest FINDS them (never quoting
#      them), and the build of that commit fails at the gate; then they are removed
#   9  faculty-dev force-pushes a rewritten `main`: GitHub refuses it (GH006)
#  10  the receiver's refusals, each beside step 4's accepted delivery, and GitHub's
#      redelivery of it recorded once
#
# PATH-INDEPENDENT: `github-app` created, or re-used; every step makes a NEW commit, so no
# step depends on what the last run left. The fake's repositories outlive `pnpm test`, so
# step 2 clears one no project holds — and its mirror — before a creation meets it.
#
# THE SPLIT, and why — the same as every demo since P5a (D23.8, P5a Decision 38): signing in is
# the browser's and the IdP's business, so it goes through THE one flow, infra/lib/idp-login.sh;
# git pushes as a PERSON (`faculty-dev`, never Manifest's App) and `docker stop` are outside the
# contract too. Everything Manifest's API does is packages/journey/src/github.ts, importing
# nothing but @manifest/contract.
#
# THE DEVELOPER TOKEN NEVER REACHES AN ARGUMENT OR A URL: git is handed it through
# GIT_CONFIG_* in its environment, exactly as driver 2 hands git its own (the D5 plan's Read
# this first 3), and node through its environment.
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
# The one place this demo's project name is written in bash; github.ts writes it in `SLUG`.
SLUG=github-app
ORG=manifest-apps
FAKE="${MANIFEST_FAKE_URL:-http://127.0.0.1:7110}"
CONTROL_PLANE_URL="http://127.0.0.1:$PORT_CONTROL_PLANE"
FAKE_CONTAINER=manifest-github-fake
DEVELOPER_TOKEN_FILE="$ROOT/infra/secrets/github-fake-developer.token"
WORK="$(mktemp -d -t manifest-github)"
FAKE_STOPPED=""
# The fake is platform state: a run that stopped it starts it again, whatever else failed.
cleanup() {
  if [ -n "$FAKE_STOPPED" ]; then docker start "$FAKE_CONTAINER" >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"
SRC="$WORK/src"
# UNIQUE TO THE RUN, so step 4's page text is this run's whatever an earlier run left.
RUN_ID="g$(date +%s)"
MARK="make demo-github $RUN_ID"
COMMIT=""

session_of() { awk -F'\t' 'NF==7 && $6=="manifest_session" {print $7}' "$1"; }

build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above. This demo is checked against the
generated contract, so a call or a field the contract does not have stops here."
  fi
}

# THE PHASES AFTER STEP 3 DO NOT STOP THE DEMO WHEN THEY FAIL: each records itself and the run
# goes on, and exits 1 at the end naming every phase that failed — a red run is a MEASUREMENT of
# every step (P4c Decision 26), which is what a negative control needs: breaking the observer
# must be seen at steps 4, 7 AND 8, not only at the first. Steps 0 and 3 still stop it, because
# nothing after them means anything without a driver-2 control plane and a project.
FAILED_PHASES=""
measure() {
  if ! run_phase "$@"; then FAILED_PHASES="$FAILED_PHASES $1"; fi
}

# One phase of the TypeScript half. Each reads the state file the last one wrote. Extra
# `NAME=value` arguments are that phase's own inputs — never a token: MANIFEST_FAKE_TOKEN is
# exported once, below, and reaches node through its environment.
run_phase() {
  local phase="$1"
  shift
  env NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" \
    MANIFEST_CONTROL_PLANE_URL="$CONTROL_PLANE_URL" MANIFEST_FAKE_URL="$FAKE" \
    MANIFEST_SESSION="${SESSION:-}" MANIFEST_COMMIT="$COMMIT" MANIFEST_MARK="$MARK" "$@" \
    node packages/journey/dist/github.js "$phase" "$STATE"
}

# git as `faculty-dev` — a PERSON with admin in the organisation — against the fake. The
# token is in git's ENVIRONMENT only: GIT_CONFIG_COUNT/KEY/VALUE, no system or global config
# (Apple git's osxkeychain helper comes from the system file), an empty credential helper and
# no prompt — the D5 plan's Global Constraints, as driver 2 does it.
fake_git() {
  local basic
  basic="$(printf 'x-access-token:%s' "$MANIFEST_FAKE_TOKEN" | base64 | tr -d '\n')"
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 \
    GIT_CONFIG_COUNT=2 \
    GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic $basic" \
    GIT_CONFIG_KEY_1=credential.helper GIT_CONFIG_VALUE_1= \
    git -c user.name=faculty-dev -c user.email=faculty-dev@manifest.invalid \
      -c commit.gpgsign=false "$@"
}

# A commit to github-app's repository ON GITHUB, as faculty-dev would push one. $1 is the
# message; the caller has already changed $SRC. Sets COMMIT.
push_to_github() {
  fake_git -C "$SRC" add -A
  fake_git -C "$SRC" commit -qm "$1"
  fake_git -C "$SRC" push -q origin HEAD:main
  COMMIT="$(git -C "$SRC" rev-parse HEAD)"
  echo "  faculty-dev pushed $COMMIT — $1"
}

# A throwaway value in a secret's SHAPE, made at run time so no file in this repository holds
# one. Never a real credential: the AWS id is random, and the installation token is GitHub's
# stateless `ghs_<APPID>_<JWT>` layout around random bytes, signed by nobody.
shaped_value() {
  node -e '
    const c = require("node:crypto")
    const b = (x) => Buffer.from(x).toString("base64url")
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    if (process.argv[1] === "aws") console.log("AKIA" + Array.from(c.randomBytes(16), (x) => A[x % 36]).join(""))
    else console.log(`ghs_1234567_${b(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b(JSON.stringify({ demo: process.argv[2] }))}.${c.randomBytes(32).toString("base64url")}`)
  ' "$1" "$RUN_ID"
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
docs/superpowers/RUNBOOK.md's 'The control plane on driver 2' has the exact commands." ;;
esac

run_phase probe
if grep -q '"driver": "local"' "$STATE"; then
  fail "The control plane runs driver 1 (the local source driver), and this demo is driver 2's.
Nothing was created. Stop the control plane, then start it on driver 2 — RUNBOOK's 'The
control plane on driver 2':

  make github-up
  export MANIFEST_SOURCE_DRIVER=github     # every MANIFEST_GITHUB_* default is the fake's
  pnpm --filter @manifest/control-plane dev

and run \`make demo-github\` again. Every OTHER demo is driver 1's: restart without the
variable before running one."
fi
[ -r "$DEVELOPER_TOKEN_FILE" ] || fail "$DEVELOPER_TOKEN_FILE is missing — \`make up\` mints it"
MANIFEST_FAKE_TOKEN="$(cat "$DEVELOPER_TOKEN_FILE")"
export MANIFEST_FAKE_TOKEN

say "1. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no manifest_session cookie"

say "2. An orphan $SLUG — on GitHub or in the mirror — that no project holds, cleared"
clear_orphan_repository "$SLUG"

run_phase project

say "4. faculty-dev clones $ORG/$SLUG from GitHub, changes the page, and pushes"
fake_git clone -q "$FAKE/$ORG/$SLUG.git" "$SRC"
PAGE="$SRC/public/index.html"
[ -f "$PAGE" ] || fail "the repository has no public/index.html — the proof-app starter's page moved"
sed -i '' -e "s#^<h1>.*</h1>\$#<h1>Manifest proof application — $MARK</h1>#" "$PAGE"
grep -q "^<h1>Manifest proof application — $MARK</h1>\$" "$PAGE" \
  || fail "the page's <h1> was not rewritten — nothing would be proved"
push_to_github "make demo-github, step 4 ($RUN_ID): the page text"
measure pushed

measure deploy

say "6. GitHub gone — docker stop $FAKE_CONTAINER"
docker stop "$FAKE_CONTAINER" >/dev/null
FAKE_STOPPED=1
measure offline
docker start "$FAKE_CONTAINER" >/dev/null
FAKE_STOPPED=""
UP_AGAIN=""
for _ in $(seq 1 30); do
  if [ "$(curl -sS -m 2 "$FAKE/_fake/health" 2>/dev/null)" = ok ]; then UP_AGAIN=1; break; fi
  sleep 1
done
[ -n "$UP_AGAIN" ] || fail "the fake did not answer /_fake/health within 30 s of docker start"
echo "  the fake is back, and answers"

measure publicize

say "8. faculty-dev pushes an AWS-key-shaped value and a stateless installation token"
MANIFEST_SECRET_AWS="$(shaped_value aws)"
MANIFEST_SECRET_TOKEN="$(shaped_value token)"
export MANIFEST_SECRET_AWS MANIFEST_SECRET_TOKEN
printf '%s\n' "$MANIFEST_SECRET_AWS" > "$SRC/aws-credentials.txt"
printf '%s\n' "$MANIFEST_SECRET_TOKEN" > "$SRC/installation-token.txt"
push_to_github "make demo-github, step 8 ($RUN_ID): two secret-shaped values"
measure secrets
rm "$SRC/aws-credentials.txt" "$SRC/installation-token.txt"
push_to_github "make demo-github, step 8 ($RUN_ID): the two values removed"

say "9. faculty-dev force-pushes a rewritten main"
KEPT="$COMMIT"
fake_git -C "$SRC" commit -q --amend -m "make demo-github, step 9 ($RUN_ID): main, rewritten"
REWRITTEN="$(git -C "$SRC" rev-parse HEAD)"
if fake_git -C "$SRC" push --force origin HEAD:main > "$WORK/force-push.txt" 2>&1; then
  FORCE_EXIT=0
else
  FORCE_EXIT=$?
fi
REMOTE_MAIN="$(fake_git -C "$SRC" ls-remote origin refs/heads/main | awk '{print $1}')"
measure forcePush MANIFEST_COMMIT="$KEPT" MANIFEST_REWRITTEN="$REWRITTEN" \
  MANIFEST_FORCE_EXIT="$FORCE_EXIT" MANIFEST_FORCE_OUTPUT="$WORK/force-push.txt" \
  MANIFEST_REMOTE_MAIN="$REMOTE_MAIN"

measure refusals

if [ -n "$FAILED_PHASES" ]; then
  fail "make demo-github FAILED in:$FAILED_PHASES — each phase's FAIL lines are above."
fi

say "Done — an application whose code is on GitHub, end to end."
cat <<SUMMARY
  https://$SLUG.staging.manifest.internal       staging, the page faculty-dev pushed
  $FAKE/$ORG/$SLUG    the repository, on the GitHub FAKE

  What this proved: a person's push to GitHub reached Manifest by a signed webhook and was
  validated, never built; Manifest built it from its own mirror, and again with GitHub gone,
  where anything needing GitHub NOW answered 503 rather than a stale answer; a repository
  made public was made private again; secrets pushed straight to GitHub were found and
  named without being quoted, and could not be built; GitHub refused a rewrite of main; and
  the webhook refused every unsigned, malformed or wrongly signed delivery by its own code,
  and recorded GitHub's redelivery once.
SUMMARY
