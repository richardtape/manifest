#!/usr/bin/env bash
# THE FRONT-END ENABLEMENT PLAN'S ACCEPTANCE (Task 15): everything the faculty front-end at
# https://app.manifest.internal needs from the platform, driven end to end — ON EITHER SOURCE
# DRIVER. An instructor signs in ON THE `app` ORIGIN, names and renames a project, and mints a
# token for the front-end's server; the server starts a model session charged to the instructor,
# writes a reading-responses app as text AND bytes, builds and deploys it, and reads what the app
# printed — redacted; a student signs in to the app and posts a response; the instructor adds a
# faculty colleague by CWL login name — and may not add the student, who may not build (FE-39) —
# switches the app off and brings it back with the response kept, and deletes a scratch project for
# good.
#
#   make demo-frontend                                   # on whichever driver answers
#   DEMO_FRONTEND_STOP_AFTER=4 make demo-frontend        # stop after step 4 (a negative control)
#
# ONE SCRIPT, BOTH DRIVERS, as `make demo-authoring`. Step 0 asks which driver the control plane
# runs (`source_driver`, scripts/lib/api.sh) and picks the projects: `frontend-local` and
# `frontend-scratch-local` on driver 1, `frontend-github` and `frontend-scratch-github` on driver 2
# — a project's repository never moves between drivers. Run it on driver 1, then restart the
# control plane on driver 2 (RUNBOOK's 'The control plane on driver 2', after `make github-up`)
# and run it again.
#
# THE SPLIT, as every headless demo's (P5a Decision 38). Signing in and stepping up are the
# browser's and the IdP's business, outside the versioned contract (D23.8), so they go through
# THE one flow, infra/lib/idp-login.sh — and so do the edge's answers and the app's own pages.
# Everything a CLIENT does is packages/journey/src/frontend.ts, through @manifest/contract and
# nothing else — the PERSON's actions in their session (browser code on the real front-end), the
# SERVER's on the token it was handed:
#
#   0  the build; the app origin answers; which driver       bash
#   1  the instructor signs in ON app; the CSRF control      bash
#   2  intake key, the project named and renamed, a token    frontend.ts person   (the session)
#   3  the manifest, a model session, one real completion    frontend.ts session, agent (the token)
#   4  the app as text and bytes; refused three ways         frontend.ts agent    (the token)
#   5  build, release, deploy — then the student posts       frontend.ts deploy, then bash
#   6  what the sandbox instance printed, redacted            bash, then frontend.ts output
#   7  a step-up on app; the colleague added, the student not bash, then frontend.ts people
#   8  switched off (410) and brought back, data kept        frontend.ts archive, bash, restore, bash
#   9  the scratch project deleted, its slug taken again     bash, frontend.ts delete, bash, recreate, bash
#  10  the session ended, the token revoked                  frontend.ts end
#
# THE API IS THE app ORIGIN'S: https://app.manifest.internal/v1/* — the edge forwards /v1/* and
# /auth/* there to the control plane on 7100. Nothing here needs anything on 7105, which is the
# faculty front-end's own server (a separate project).
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

# THE FRONT-END'S ORIGIN, not the console's: `api` (scripts/lib/api.sh) sends every call here,
# with this Origin.
ORIGIN="https://app.$ZONE"
API="$ORIGIN"
CONSOLE_ORIGIN="https://console.$ZONE"
CA="$ROOT/$CA_FILE"
ORG=manifest-apps
FAKE="${MANIFEST_FAKE_URL:-http://127.0.0.1:7110}"
REPOS="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}"
DEVELOPER_TOKEN_FILE="$ROOT/infra/secrets/github-fake-developer.token"
OLLAMA="http://127.0.0.1:11434"
# The run's own directory: the cookie jars and the state file the phases share — which holds the
# server's token and its model key, so it is 0600 inside a 0700 directory. All of it is gone when
# the script ends.
WORK="$(mktemp -d -t manifest-frontend)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"
RUN_ID="f$(date +%s)"
STOP_AFTER="${DEMO_FRONTEND_STOP_AFTER:-}"
case "$STOP_AFTER" in
  '' | [0-9] | 10) ;;
  *) fail "DEMO_FRONTEND_STOP_AFTER is '$STOP_AFTER' — a step, 0 to 10" ;;
esac

# The Manifest session out of a curl jar, under its name on an https origin — every origin this
# demo signs in on is one, through the edge (FE-28: the plain name is loopback http's alone).
session_of() { awk -F'\t' 'NF==7 && $6=="__Host-manifest_session" {print $7}' "$1"; }
# Every host the jar holds a __Host-manifest_session cookie for. curl writes an HttpOnly cookie's domain
# as `#HttpOnly_<host>`.
session_hosts() {
  awk -F'\t' 'NF==7 && $6=="__Host-manifest_session" {d=$1; sub(/^#HttpOnly_/, "", d); print d}' "$1" \
    | sort -u | tr '\n' ' ' | sed 's/ $//'
}

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
    node packages/journey/dist/frontend.js "$phase" "$STATE"
}

# Ends the run, green, once the step asked for is done — the phase before has already said
# whether every check it ran passed (it exits 1 otherwise, and `set -e` stops here first).
stop_after() {
  if [ -n "$STOP_AFTER" ] && [ "$STOP_AFTER" -le "$1" ]; then
    say "Stopped after step $STOP_AFTER, as DEMO_FRONTEND_STOP_AFTER asked"
    exit 0
  fi
}

state_field() { node -e 'const v=require(process.argv[1])[process.argv[2]];if(v===undefined){process.exit(1)}console.log(v)' "$STATE" "$1"; }

# §20's second round trip, ON THE APP ORIGIN, for the instructor. Prints the NEW session value; the
# jar holds it afterwards. The cookie from before stays a valid, un-stepped session (P6a Decision
# 8), which is what lets a phase show a refusal and the stepped call in one run. The IdP must
# RE-PROMPT a jar it signed in minutes ago (ForceAuthn), which `idp_login` asserts for free: its
# hop 2 fails unless the IdP serves a login form.
step_up() {
  local before after
  before="$(session_of "$CP_JAR")"
  idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/step-up" instructor instructor \
    "$ORIGIN/auth/saml/callback" "$CA"
  after="$(session_of "$CP_JAR")"
  [ -n "$after" ] && [ "$after" != "$before" ] || fail "the step-up left the session unchanged —
the callback did not re-sign it. Read the control plane's '[auth] step-up' lines."
  printf '%s' "$after"
}

# The Ollama model behind a LOGICAL name, read from infra/litellm/config.yaml — the bootstrap
# catalogue — so the model the session was allowed is the one warmed. Prints nothing for a name
# that is not an Ollama model there.
ollama_tag_of() {
  awk -v name="$1" '
    $1 == "-" && $2 == "model_name:" { inside = ($3 == name); next }
    inside && $1 == "model:" { if (sub(/^ollama(_chat)?\//, "", $2)) print $2; exit }
  ' infra/litellm/config.yaml
}

# A GET of an app's page, through the edge: the status, and the body into $2.
page() {
  curl -sS --cacert "$CA" -m 20 -o "$2" -w '%{http_code}' "$1" || true
}

say "0. The client and the demo, built from the checked-in document"
build @manifest/contract
build @manifest/journey
echo "  built"

say "0. The app origin answers — the control plane's API, and not the edge's wildcard"
CODE="$(curl -sS -m 5 --cacert "$CA" -o "$WORK/me.json" -w '%{http_code}' "$ORIGIN/v1/me" 2>&1 || true)"
if grep -q 'manifest OK' "$WORK/me.json" 2>/dev/null; then
  fail "$ORIGIN/v1/me was answered by the edge's WILDCARD: $(head -c 160 "$WORK/me.json")
The name did not reach the app. site — dnsmasq's app. pin is missing (infra/compose.yaml; RUNBOOK's
'Serving the reference console on the front-end's origin')."
fi
[ "$CODE" = 401 ] && grep -q '"UNAUTHENTICATED"' "$WORK/me.json" \
  || fail "no control plane behind $ORIGIN (got $CODE: $(head -c 160 "$WORK/me.json" 2>/dev/null)).
docs/superpowers/RUNBOOK.md's 'Running the control plane' has the exact commands."
echo "  $ORIGIN/v1/me: 401 UNAUTHENTICATED — the API, through the app origin"

say "0. Which source driver? An unsigned POST /webhooks/github, which records nothing"
DRIVER="$(source_driver)" || exit 1
case "$DRIVER" in
  local) ;;
  github)
    # The FAKE's demo, never real GitHub's (the launch path plan's Task 2) — asked before its health.
    require_fake_github
    [ "$(curl -sS -m 2 "$FAKE/_fake/health" 2>/dev/null)" = ok ] \
      || fail "the control plane runs driver 2 and the GitHub fake does not answer at $FAKE — make github-up"
    [ -r "$DEVELOPER_TOKEN_FILE" ] || fail "$DEVELOPER_TOKEN_FILE is missing — \`make up\` mints it"
    ;;
  *) fail "source_driver answered '$DRIVER'" ;;
esac
SLUG="frontend-$DRIVER"
SCRATCH="frontend-scratch-$DRIVER"
DRIVER_N="$([ "$DRIVER" = local ] && echo 1 || echo 2)"
echo "  driver $DRIVER_N ($DRIVER) — the app is $SLUG, and $SCRATCH is the one step 9 deletes"
stop_after 0

say "1. The instructor signs in with CWL ON THE APP ORIGIN"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no __Host-manifest_session cookie"
HOSTS="$(session_hosts "$CP_JAR")"
[ "$HOSTS" = "app.$ZONE" ] || fail "the session cookie is set for '$HOSTS', not app.$ZONE alone"
echo "  the assertion came back to $ORIGIN/auth/saml/callback, and __Host-manifest_session is app.$ZONE's alone"
NAME="$(api GET /v1/me | field displayName)" || fail "GET /v1/me with the app's cookie did not answer a person"
[ "$NAME" = "Test Instructor" ] || fail "signed in as '$NAME', not Test Instructor"
echo "  signed in as $NAME"

# THE CONTROL: the same session, from a page on the CONSOLE's origin. Every origin judges a
# mutation against the origin it ARRIVED on (Decision 16), so a page on console. cannot post to
# app.'s API with app.'s cookie — even though both are Manifest's.
count_projects() { api GET /v1/projects | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))'; }
BEFORE="$(count_projects)"
CREATE="{\"slug\":\"$SLUG\",\"name\":\"Week 3 — reading responses\",\"blueprint\":\"node-ts-mongo@1\",\"audience\":{\"scale\":\"class\",\"burst\":\"synchronised\",\"justification\":\"make demo-frontend's CSRF control\"}}"
CODE="$(curl -sS --cacert "$CA" -b "$CP_JAR" -o "$WORK/csrf.json" -w '%{http_code}' -X POST \
  -H 'content-type: application/json' -H "idempotency-key: $(key)" \
  -H "origin: $CONSOLE_ORIGIN" -d "$CREATE" "$ORIGIN/v1/projects" || true)"
REFUSED="$(field error.code < "$WORK/csrf.json" 2>/dev/null || true)"
[ "$CODE $REFUSED" = "403 CSRF_ORIGIN_REFUSED" ] \
  || fail "createProject with app.'s cookie and Origin $CONSOLE_ORIGIN answered $CODE $REFUSED, not 403 CSRF_ORIGIN_REFUSED: $(head -c 200 "$WORK/csrf.json")"
[ "$(count_projects)" = "$BEFORE" ] || fail "the refused createProject changed the project list"
echo "  createProject with Origin $CONSOLE_ORIGIN: 403 CSRF_ORIGIN_REFUSED, and nothing created"
# Each slug's repository, if a `pnpm test` or `make reset` left it without its project.
clear_orphan_repository "$SLUG"
clear_orphan_repository "$SCRATCH"
stop_after 1

say "2. The instructor, in their session: an intake key, the project named and renamed, the server's token"
run_phase person MANIFEST_SESSION="$SESSION" MANIFEST_DRIVER="$DRIVER" MANIFEST_RUN_ID="$RUN_ID"
stop_after 2

say "3. The front-end's server, on the token: the confidential manifest, then a model session"
run_phase session
CHAT_MODEL="$(state_field chatModel)" || fail "step 3 recorded no chat model"
TAG="$(ollama_tag_of "$CHAT_MODEL")"
if [ -n "$TAG" ]; then
  # A COLD FIRST CALL TO THE ON-PREMISE MODEL TAKES ~12 s, and loading it EVICTS qwen3.5:4b
  # (TRAPS.md: OLLAMA WILL NOT HOLD qwen3.8:27b BESIDE qwen3.5:4b). Warmed straight at Ollama,
  # charged to nobody; the call the step asserts is the session's own, through the gateway.
  T0=$SECONDS
  WARM="$(curl -sS -m 300 -o /dev/null -w '%{http_code}' "$OLLAMA/api/generate" \
    -d "{\"model\":\"$TAG\",\"prompt\":\"ok\",\"stream\":false,\"think\":false,\"keep_alive\":\"30m\",\"options\":{\"num_predict\":1}}" || true)"
  [ "$WARM" = 200 ] || fail "Ollama did not warm $TAG (answered $WARM) — ollama list; make doctor"
  echo "  warmed $TAG, behind $CHAT_MODEL, in $((SECONDS - T0)) s"
else
  echo "  ($CHAT_MODEL is not an Ollama model in infra/litellm/config.yaml — not warmed)"
fi

say "3–4. One real completion with the key; then the agent writes the app, as text and bytes"
run_phase agent
stop_after 4

say "5. The server builds, releases and deploys; the student signs in INSIDE the app and posts a response"
run_phase deploy
APP_URL="$(state_field stagingUrl)" || fail "step 2 recorded no staging URL"
APP_URL="${APP_URL%/}"
STU_JAR="$WORK/student-app.jar"; STU_IDP_JAR="$WORK/student-app-idp.jar"
idp_login "$STU_JAR" "$STU_IDP_JAR" "$APP_URL/login" student student \
  "$APP_URL/auth/ubcshib/callback" "$CA"
# F1's GUARD (the authoring API's; the plan's Task 5): a fixture without `express.urlencoded`
# reads no SAMLResponse, and the sign-in lands quietly on /login/failed.
ME="$(curl -sS --cacert "$CA" -b "$STU_JAR" "$APP_URL/api/me")"
[ "$ME" = '{"name":"Test Student"}' ] || fail "the app does not know the student (/api/me: ${ME:0:160}).
If it answered 'not signed in', the sign-in did not complete — the fixture must keep
express.urlencoded (the plan's Task 5, F1)."
echo "  the student is signed in to the app as Test Student"
RESPONSE="The reading argues that the tools a class uses shape what it practises ($RUN_ID)."
POSTED="$(curl -sS --cacert "$CA" -b "$STU_JAR" -c "$STU_JAR" -o /dev/null \
  -w '%{http_code} %{redirect_url}' --data-urlencode "text=$RESPONSE" "$APP_URL/responses")"
[ "$POSTED" = "303 $APP_URL/" ] || fail "the response was not posted: $POSTED"
CODE="$(curl -sS --cacert "$CA" -b "$STU_JAR" -o "$WORK/page.html" -w '%{http_code}' "$APP_URL/")"
[ "$CODE" = 200 ] && grep -qF "<strong>Test Student</strong>: $RESPONSE" "$WORK/page.html" \
  || fail "the page does not list the response under Test Student ($CODE): $(head -c 300 "$WORK/page.html")"
echo "  posted, and the page lists it under Test Student"
CODE="$(curl -sS --cacert "$CA" -o "$WORK/logo.png" -w '%{http_code} %{content_type}' "$APP_URL/logo.png")"
GOT="$(shasum -a 256 "$WORK/logo.png" | awk '{print $1}')"
[ "$CODE" = "200 image/png" ] && [ "$GOT" = "$(state_field logoSha256)" ] \
  || fail "/logo.png answered $CODE with sha256 $GOT — not the bytes the agent committed"
echo "  /logo.png: the bytes the agent committed, served as image/png"
stop_after 5

say "6. The agent reads what the app printed — the SANDBOX instance's output (staging's is refused)"
SANDBOX_URL="$(state_field sandboxUrl)" || fail "step 2 recorded no sandbox URL"
SANDBOX_URL="${SANDBOX_URL%/}"
# The request whose line step 6 looks for: the run id in its path, so an earlier run's line is not it.
CODE="$(page "$SANDBOX_URL/?from=$RUN_ID" "$WORK/sandbox.html")"
[ "$CODE" = 200 ] && grep -q 'Sign in with CWL' "$WORK/sandbox.html" \
  || fail "the sandbox's page answered $CODE: $(head -c 200 "$WORK/sandbox.html")"
echo "  GET $SANDBOX_URL/?from=$RUN_ID — the app printed a line for it"
run_phase output MANIFEST_SESSION="$SESSION"
stop_after 6

say "7. The instructor steps up ON THE APP ORIGIN; the student and a colleague sign in to Manifest there"
SESSION_STEPPED="$(step_up)"
echo "  stepped up"
# The platform knows a person's CWL login once they have signed in to MANIFEST since it began
# asking for `uid` (sitting 5) — signing in to the app is the app's own Service Provider, not
# Manifest's. Its own jars: the IdP remembers who signed in, so a shared IdP jar would sign the
# student in as whoever used it last.
STU_CP_JAR="$WORK/student.jar"; STU_CP_IDP_JAR="$WORK/student-idp.jar"
idp_login "$STU_CP_JAR" "$STU_CP_IDP_JAR" "$ORIGIN/auth/login" student student \
  "$ORIGIN/auth/saml/callback" "$CA"
STUDENT_SESSION="$(session_of "$STU_CP_JAR")"
[ -n "$STUDENT_SESSION" ] || fail "the student's sign-in to Manifest left no __Host-manifest_session cookie"
# WHO MAY BUILD (FE-39): only a faculty member is added to a project, so the person added is the
# laptop IdP's second faculty member, `colleague` (the launch path plan's Decision 31); the student
# is shown refused. Its own jars, for the reason above.
COL_CP_JAR="$WORK/colleague.jar"; COL_CP_IDP_JAR="$WORK/colleague-idp.jar"
idp_login "$COL_CP_JAR" "$COL_CP_IDP_JAR" "$ORIGIN/auth/login" colleague colleague \
  "$ORIGIN/auth/saml/callback" "$CA"
COLLEAGUE_SESSION="$(session_of "$COL_CP_JAR")"
[ -n "$COLLEAGUE_SESSION" ] || fail "the colleague's sign-in to Manifest left no __Host-manifest_session cookie"
run_phase people MANIFEST_SESSION="$SESSION" MANIFEST_SESSION_STEPPED="$SESSION_STEPPED" \
  MANIFEST_STUDENT_SESSION="$STUDENT_SESSION" MANIFEST_COLLEAGUE_SESSION="$COLLEAGUE_SESSION"
stop_after 7

say "8. Switched off: the app's names answer 410, and the key and the token stop"
run_phase archive MANIFEST_SESSION="$SESSION" MANIFEST_SESSION_STEPPED="$SESSION_STEPPED"
for url in "$APP_URL" "$SANDBOX_URL"; do
  CODE="$(page "$url/" "$WORK/off.html")"
  [ "$CODE" = 410 ] && grep -q 'This app has been switched off by its owner.' "$WORK/off.html" \
    || fail "$url/ answered $CODE, not the switched-off page: $(head -c 200 "$WORK/off.html")"
  echo "  $url/: 410, This app has been switched off by its owner."
done
run_phase restore MANIFEST_SESSION="$SESSION"
# The student signs in again — new jars — and finds what they posted BEFORE the archive: the app's
# data volume was kept.
STU2_JAR="$WORK/student-app-2.jar"; STU2_IDP_JAR="$WORK/student-app-2-idp.jar"
idp_login "$STU2_JAR" "$STU2_IDP_JAR" "$APP_URL/login" student student \
  "$APP_URL/auth/ubcshib/callback" "$CA"
CODE="$(curl -sS --cacert "$CA" -b "$STU2_JAR" -o "$WORK/page-2.html" -w '%{http_code}' "$APP_URL/")"
[ "$CODE" = 200 ] && grep -qF "<strong>Test Student</strong>: $RESPONSE" "$WORK/page-2.html" \
  || fail "after the restore the page does not show the response posted before the archive ($CODE): $(head -c 300 "$WORK/page-2.html")"
echo "  restored and redeployed: the page shows the response posted before the archive"
stop_after 8

say "9. A scratch project, deployed once and never launched, deleted for good — and its name taken again"
# THE REPOSITORY, WHERE THE CONTROL PLANE KEEPS IT — asked before the delete as well as after, so
# "gone" is a change this step saw, never a path that was empty all along ($REPOS pointing somewhere
# other than the control plane's MANIFEST_REPOS_ROOT) or a 404 the fake gives anything it will not
# show. On driver 2 the fake is asked as faculty-dev (admin), whose 200 below is what makes its 404
# after mean "no such repository". Prints the status; the body lands in $WORK/fake-repo.json.
fake_repo() {
  printf 'header = "authorization: token %s"\n' "$(cat "$DEVELOPER_TOKEN_FILE")" \
    | curl -sS -K - -o "$WORK/fake-repo.json" -w '%{http_code}' -m 10 \
      -H 'accept: application/vnd.github+json' "$FAKE/api/v3/repos/$ORG/$SCRATCH" || true
}
repository_there() {
  if [ "$DRIVER" = local ]; then
    [ -d "$REPOS/$SCRATCH.git" ] || fail "no $REPOS/$SCRATCH.git ($1) — is MANIFEST_REPOS_ROOT the
value the control plane was started with?"
    echo "  its repository is there ($1): $REPOS/$SCRATCH.git"
  else
    STATUS="$(fake_repo)"
    [ "$STATUS" = 200 ] && [ "$(field name < "$WORK/fake-repo.json" 2>/dev/null)" = "$SCRATCH" ] \
      || fail "the GitHub fake answers $STATUS for $ORG/$SCRATCH ($1), not 200 naming it: $(head -c 200 "$WORK/fake-repo.json")"
    [ -d "$REPOS/$SCRATCH.git" ] || fail "no mirror at $REPOS/$SCRATCH.git ($1) — is MANIFEST_REPOS_ROOT the
value the control plane was started with?"
    echo "  its repository is there ($1): $ORG/$SCRATCH on the GitHub fake (200, named), and its mirror"
  fi
}
repository_there "before the delete"
# A step-up of its own: the scratch project builds first, and a step-up lasts ten minutes.
SESSION_STEPPED="$(step_up)"
run_phase delete MANIFEST_SESSION_STEPPED="$SESSION_STEPPED"
if [ "$DRIVER" = local ]; then
  [ ! -e "$REPOS/$SCRATCH.git" ] || fail "$REPOS/$SCRATCH.git is still there"
  echo "  its repository is gone: no $REPOS/$SCRATCH.git"
else
  # The fake's own 404 — GitHub's `{"message":"Not Found",…}` — not a status alone.
  STATUS="$(fake_repo)"
  [ "$STATUS" = 404 ] && [ "$(field message < "$WORK/fake-repo.json" 2>/dev/null)" = "Not Found" ] \
    || fail "the GitHub fake answers $STATUS for $ORG/$SCRATCH, not 404 Not Found: $(head -c 200 "$WORK/fake-repo.json")"
  [ ! -e "$REPOS/$SCRATCH.git" ] || fail "its mirror, $REPOS/$SCRATCH.git, is still there"
  echo "  its repository is gone: $ORG/$SCRATCH is 404 Not Found on the GitHub fake, and its mirror is removed"
fi
# THE SLUG, TAKEN AGAIN: only a create meets the partial unique index behind it (control 3(g)).
# AFTER the check above, because it makes a new repository. The new project is left for the next
# run's step 9.
run_phase recreate MANIFEST_SESSION="$SESSION"
repository_there "the new project's"
stop_after 9

say "10. The server ends its session; the instructor revokes its token"
run_phase end MANIFEST_SESSION="$SESSION"

say "make demo-frontend ($SLUG, driver $DRIVER_N): every check passed, in $SECONDS s"
echo "  the app: $APP_URL"
