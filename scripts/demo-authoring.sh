#!/usr/bin/env bash
# THE AUTHORING API PLAN'S ACCEPTANCE (Task 13): an AGENT builds a course bulletin board from the
# bare `node-ts-mongo@1` skeleton through nothing but Manifest's API, holding a delegated token —
# ON EITHER SOURCE DRIVER — and then people use it: a student posts a question, an instructor
# replies and pins it.
#
#   make demo-authoring                                    # on whichever driver answers
#   DEMO_AUTHORING_STOP_AFTER=5 make demo-authoring        # stop after step 5 (a negative control)
#
# ONE SCRIPT, BOTH DRIVERS. Step 0 asks which driver the control plane runs (`source_driver`,
# scripts/lib/api.sh) and picks the project: `board-local` on driver 1, `board-github` on driver 2
# — a project's repository never moves between drivers, so each driver has its own. Run it on
# driver 1, then restart the control plane on driver 2 (RUNBOOK's 'The control plane on driver
# 2', after `make github-up`) and run it again.
#
# THE SPLIT, as every headless demo's (P5a Decision 38). Signing in is the browser's and the IdP's
# business, outside the versioned contract (D23.8), so it goes through THE one flow,
# infra/lib/idp-login.sh — and so does a PERSON's `git push`, which is git's. Everything the AGENT
# does is packages/journey/src/authoring.ts, through @manifest/contract and nothing else:
#
#   0  which driver                         bash
#   1  the project, and the agent's token   authoring.ts project   (the instructor's session)
#   2–5  read, check, commit, refused       authoring.ts agent     (the token)
#   6  a PERSON pushes link → .git          bash — then authoring.ts attack (steps 6 and 7)
#   8–10 build, deploy, the secret          authoring.ts deploy    (the token)
#   11 people use the board                 bash — CWL sign-ins INSIDE the app, and its own API
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no `xargs -r`,
# no `readlink -f`.
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
ORG=manifest-apps
FAKE="${MANIFEST_FAKE_URL:-http://127.0.0.1:7110}"
REPOS="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}"
DEVELOPER_TOKEN_FILE="$ROOT/infra/secrets/github-fake-developer.token"
# The run's own directory: the cookie jars, the state file the phases share (it holds the
# agent's token and the board's admin code, so it is 0600 inside a 0700 directory), the
# person's clone, and step 6's canary. All of it is gone when the script ends.
WORK="$(mktemp -d -t manifest-authoring)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"
SRC="$WORK/src"
# THE CANARY: the `core.fsmonitor` command the agent's step-6 commit carries would create this
# file if git ever ran it. It is on the host, because the control plane runs git on the host.
MARKER="$WORK/fsmonitor-ran"
RUN_ID="a$(date +%s)"
STOP_AFTER="${DEMO_AUTHORING_STOP_AFTER:-}"
case "$STOP_AFTER" in
  '' | [0-9] | 1[01]) ;;
  *) fail "DEMO_AUTHORING_STOP_AFTER is '$STOP_AFTER' — a step, 0 to 11" ;;
esac

session_of() { awk -F'\t' 'NF==7 && $6=="manifest_session" {print $7}' "$1"; }

# Quiet when it builds, and LOUD when it does not: `tsc` writes its errors to STDOUT.
build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above. This demo is checked against the
generated contract, so a call or a field the contract does not have stops here."
  fi
}

run_phase() {
  local phase="$1"
  shift
  env NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" MANIFEST_STOP_AFTER="$STOP_AFTER" "$@" \
    node packages/journey/dist/authoring.js "$phase" "$STATE"
}

# Ends the run, green, once the step asked for is done — the phase before has already said
# whether every check it ran passed (it exits 1 otherwise, and `set -e` stops here first).
stop_after() {
  if [ -n "$STOP_AFTER" ] && [ "$STOP_AFTER" -le "$1" ]; then
    say "Stopped after step $STOP_AFTER, as DEMO_AUTHORING_STOP_AFTER asked"
    exit 0
  fi
}

state_field() { node -e 'const v=require(process.argv[1])[process.argv[2]];if(v===undefined){process.exit(1)}console.log(v)' "$STATE" "$1"; }

# git as a PERSON, on this machine, with no configuration but its own: no system or global file,
# no prompt, no signing.
person_git() {
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 \
    git -c user.name=faculty-dev -c user.email=faculty-dev@manifest.invalid \
      -c commit.gpgsign=false "$@"
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
  local) SLUG=board-local ;;
  github)
    SLUG=board-github
    [ "$(curl -sS -m 2 "$FAKE/_fake/health" 2>/dev/null)" = ok ] \
      || fail "the control plane runs driver 2 and the GitHub fake does not answer at $FAKE — make github-up"
    [ -r "$DEVELOPER_TOKEN_FILE" ] || fail "$DEVELOPER_TOKEN_FILE is missing — \`make up\` mints it"
    MANIFEST_FAKE_TOKEN="$(cat "$DEVELOPER_TOKEN_FILE")"
    export MANIFEST_FAKE_TOKEN
    ;;
  *) fail "source_driver answered '$DRIVER'" ;;
esac
echo "  driver $([ "$DRIVER" = local ] && echo '1 (local)' || echo '2 (GitHub)') — the board is $SLUG"
stop_after 0

say "1. The instructor signs in with CWL"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no manifest_session cookie"
# $SLUG's repository, if a `pnpm test` or `make reset` left it without its project.
clear_orphan_repository "$SLUG"
run_phase project MANIFEST_SESSION="$SESSION" MANIFEST_DRIVER="$DRIVER" MANIFEST_RUN_ID="$RUN_ID"
stop_after 1

say "2–5. The agent, on its token alone"
run_phase agent
stop_after 5

say "6. A PERSON pushes a symlink, link → .git, straight to the repository — not through Manifest"
if [ "$DRIVER" = local ]; then
  # Driver 1: the project's bare repository on this machine, as a person with the laptop would.
  [ -d "$REPOS/$SLUG.git" ] || fail "no bare repository at $REPOS/$SLUG.git"
  person_git clone -q "$REPOS/$SLUG.git" "$SRC"
else
  # Driver 2: GitHub (the fake), as faculty-dev — the webhook tells Manifest.
  fake_git clone -q "$FAKE/$ORG/$SLUG.git" "$SRC"
fi
ln -s .git "$SRC/link"
[ -L "$SRC/link" ] || fail "ln -s made no symlink"
if [ "$DRIVER" = local ]; then
  person_git -C "$SRC" add link
  person_git -C "$SRC" commit -qm "make demo-authoring, step 6 ($RUN_ID): a link to .git"
  person_git -C "$SRC" push -q origin HEAD:main
else
  fake_git -C "$SRC" add link
  fake_git -C "$SRC" commit -qm "make demo-authoring, step 6 ($RUN_ID): a link to .git"
  fake_git -C "$SRC" push -q origin HEAD:main
fi
PERSON_COMMIT="$(git -C "$SRC" rev-parse HEAD)"
echo "  faculty-dev pushed $PERSON_COMMIT"
run_phase attack MANIFEST_MARKER="$MARKER" MANIFEST_PERSON_COMMIT="$PERSON_COMMIT"
# The phase checked it; this is the same fact from outside the process that asked.
[ ! -e "$MARKER" ] || fail "THE CANARY EXISTS: $MARKER — a core.fsmonitor command the agent committed RAN"
stop_after 7

say "8–10. The agent builds step 4's commit, meets the missing secret, sets it, deploys"
run_phase deploy
stop_after 10

say "11. People use the board: a student asks, an instructor replies and pins it"
APP_URL="$(state_field stagingUrl)" || fail "the agent's phases recorded no staging URL"
ADMIN_CODE="$(state_field adminCode)" || fail "the agent's phases recorded no admin code"
# shellcheck source=./lib/proof-app.sh
. scripts/lib/proof-app.sh     # for `app`: an authenticated call to the DEPLOYED app
STU_JAR="$WORK/student.jar"; STU_IDP_JAR="$WORK/student-idp.jar"
INS_JAR="$WORK/instructor-app.jar"; INS_IDP_JAR="$WORK/instructor-app-idp.jar"

idp_login "$STU_JAR" "$STU_IDP_JAR" "$APP_URL/login" student student \
  "$APP_URL/auth/ubcshib/callback" "$CA"
STUDENT_NAME="$(app "$STU_JAR" GET /api/me | field name)" || fail "the board does not know the student"
echo "  the student is signed in to the board as $STUDENT_NAME"
QUESTION="Why does bismuth grow staircase crystals? ($RUN_ID)"
POST="$(app "$STU_JAR" POST /api/posts "{\"title\":$(json "$QUESTION"),\"body\":$(json "Asked in make demo-authoring.")}")"
POST_ID="$(printf '%s' "$POST" | field id)" || fail "the question was not posted: $POST"
echo "  posted question $POST_ID"

idp_login "$INS_JAR" "$INS_IDP_JAR" "$APP_URL/login" instructor instructor \
  "$APP_URL/auth/ubcshib/callback" "$CA"
INSTRUCTOR_NAME="$(app "$INS_JAR" GET /api/me | field name)" || fail "the board does not know the instructor"
REPLY="$(app "$INS_JAR" POST "/api/posts/$POST_ID/replies" "{\"body\":$(json "The crystal's edges grow faster than its faces — hopper growth.")}")"
[ "$(printf '%s' "$REPLY" | field author.name)" = "$INSTRUCTOR_NAME" ] || fail "the reply was not made: $REPLY"
echo "  $INSTRUCTOR_NAME replied"

# THE SECRET, USED: pinning is allowed only with the admin code the agent set — the one proof that
# the VALUE reached the container, not only that a variable is set. The header goes to curl on its
# STDIN (-K -), never an argument another process could read.
pin() {
  printf 'header = "x-board-admin-code: %s"\n' "$1" \
    | curl -sS --cacert "$CA" -K - -b "$INS_JAR" -o /dev/null -w '%{http_code}' \
        -X POST "$APP_URL/api/posts/$POST_ID/pin"
}
[ "$(pin "not-the-code")" = 403 ] || fail "a wrong admin code pinned the question"
[ "$(pin "$ADMIN_CODE")" = 200 ] || fail "the admin code the agent set did not pin the question"
echo "  a wrong code is refused 403; the code the agent set pins it"

POSTS="$(app "$STU_JAR" GET /api/posts)"
printf '%s' "$POSTS" | node -e '
  let s = ""
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const [id, student, instructor] = process.argv.slice(1)
    const post = JSON.parse(s).posts.find((p) => p.id === id)
    const ok =
      post !== undefined &&
      post.author.name === student && post.author.instructor === false &&
      post.replies.length === 1 &&
      post.replies[0].author.name === instructor && post.replies[0].author.instructor === true &&
      post.pinned === true
    if (!ok) { console.error(JSON.stringify(post ?? JSON.parse(s)).slice(0, 600)); process.exit(1) }
  })' "$POST_ID" "$STUDENT_NAME" "$INSTRUCTOR_NAME" \
  || fail "GET /api/posts does not show the question by $STUDENT_NAME, pinned, with $INSTRUCTOR_NAME's reply"
echo "  GET /api/posts: the question by $STUDENT_NAME, pinned, and $INSTRUCTOR_NAME's reply"
case "$STUDENT_NAME:$INSTRUCTOR_NAME" in
  "Test Student:Test Instructor") ;;
  *) fail "the names are '$STUDENT_NAME' and '$INSTRUCTOR_NAME', not the IdP's Test Student and Test Instructor" ;;
esac

say "make demo-authoring ($SLUG, driver $([ "$DRIVER" = local ] && echo 1 || echo 2)): every check passed"
echo "  the board: $APP_URL"
