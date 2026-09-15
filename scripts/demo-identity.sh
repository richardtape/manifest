#!/usr/bin/env bash
# P4a's acceptance: the proof app signs a REAL PERSON in with CWL, keeps their
# note theirs, and proves it by failing to show it to somebody else.
#
# A THIN WRAPPER, like `scripts/demo.sh`: the logic under test lives in the
# Docker-tier suite, and a demo that reimplements any of it drifts into proving
# something else — which is how a demo ends up green against a platform that
# does not work.
#
# Steps 6 and 7 prove a login happened. ONLY STEP 8 PROVES THE APP KNOWS WHO.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# THE login flow, shared with `scripts/demo.sh` and with the negative-control
# harness, so a control drives the same code the acceptance does.
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh

API="${MANIFEST_API:-http://127.0.0.1:7100}"
SLUG="${DEMO_SLUG:-proof-app}"
CA="$ROOT/$CA_FILE"
APP_URL="https://$SLUG.staging.$ZONE"

# One jar per IDENTITY, and that is not tidiness: the whole acceptance is that
# two people are two people, and a shared jar would carry one session into the
# other's requests and prove nothing. The IdP jars are separate for the same
# reason — SimpleSAMLphp remembers who authenticated, so a shared IdP session
# would silently sign the second person in as the first.
CP_JAR="$(mktemp -t mf-di-cp)"
IDP_CP_JAR="$(mktemp -t mf-di-idpcp)"
STU_JAR="$(mktemp -t mf-di-stu)"
IDP_STU_JAR="$(mktemp -t mf-di-idpstu)"
INS_JAR="$(mktemp -t mf-di-ins)"
IDP_INS_JAR="$(mktemp -t mf-di-idpins)"
WORK=""
cleanup() {
  rm -f "$CP_JAR" "$IDP_CP_JAR" "$STU_JAR" "$IDP_STU_JAR" "$INS_JAR" "$IDP_INS_JAR"
  [ -n "$WORK" ] && rm -rf "$WORK"
  return 0
}
# ONE trap, registered once. `demo.sh` grew a second one that REPLACED the first
# and unregistered a file four lines after registering it (defect 70).
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

key() { uuidgen | tr 'A-Z' 'a-z'; }

api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -b "$CP_JAR" -c "$CP_JAR" -X "$method" -H 'content-type: application/json')
  if [ "$method" != GET ]; then args+=(-H "idempotency-key: $(key)"); fi
  if [ -n "$body" ]; then args+=(-d "$body"); fi
  curl "${args[@]}" "$API$path"
}

# jq is not guaranteed on a UBC developer's Mac and C1 forbids a new
# prerequisite, so JSON is read with node, which the toolchain already requires.
field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a?.[k],j);if(v===undefined){console.error(s);process.exit(1)}console.log(typeof v==="object"?JSON.stringify(v):v)})' "$1"; }

environment() {
  api GET "/projects/$PROJECT_ID?expand=environments" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const e=(j.environments??[]).find(x=>x.kind===process.argv[1]);if(!e){console.error(s);process.exit(1)}console.log(e.id)})' "$1"
}

# An authenticated call to the DEPLOYED APP, as one identity.
app() {
  local jar="$1" method="$2" path="$3" body="${4:-}"
  local args=(-sS --cacert "$CA" -b "$jar" -c "$jar" -X "$method")
  if [ -n "$body" ]; then args+=(-H 'content-type: application/json' -d "$body"); fi
  curl "${args[@]}" "$APP_URL$path"
}

say "0. Is the control plane up?"
curl -sS -m 5 -o /dev/null "$API/auth/me" \
  || fail "no control plane at $API. README's 'Running the control plane' has the
exact commands — and check the boot line says {\"driver\":\"docker\"}, because
every claim this demo makes is meaningless against the fake one."
echo "  $API answered"

say "1. Log in to Manifest itself with CWL (§9: Manifest is its own SP)"
idp_login "$CP_JAR" "$IDP_CP_JAR" "$API/auth/login" instructor instructor \
  "$API/auth/saml/callback" "$CA"
WHO="$(api GET /auth/me | field puid)"
[ "$WHO" = ins000001 ] || fail "logged in to the control plane as '$WHO', expected ins000001"
echo "  session for $WHO"

say "2. Create the project — three environments and a bare repository"
PROJECT="$(api POST /projects "{\"slug\":\"$SLUG\",\"blueprint\":\"node-ts-mongo@1\"}")"
PROJECT_ID="$(printf '%s' "$PROJECT" | field id 2>/dev/null || true)"
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID="$(api GET /projects | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.slug===process.argv[1]);if(!p){console.error(s);process.exit(1)}console.log(p.id)})' "$SLUG")"
  echo "  reusing project $PROJECT_ID"
else
  echo "  project $PROJECT_ID"
fi
BARE="${MANIFEST_REPOS_ROOT:-$ROOT/.manifest/repos}/$SLUG.git"
[ -d "$BARE" ] || fail "no bare repository at $BARE — is MANIFEST_REPOS_ROOT the
same value the control plane was started with?"

say "3. Push the proof app — the blueprint skeleton, then the app over it"
WORK="$(mktemp -d -t mf-di-src)"
git clone -q "$BARE" "$WORK"
rm -f "$WORK/src/index.js"
# THE SKELETON FIRST. This is what an agent generating an application actually
# does, and it is why `fixtures/proof-app/` carries no `auth/` of its own: §20
# calls a blueprint a security multiplier, so the SAML wiring is written once
# and inherited. A forked copy in the fixture would drift from the blueprint's
# silently, and a vulnerability fixed in one would live on in the other.
cp -R blueprints/node-ts-mongo/skeleton/. "$WORK/"
# Then the app over it: its own server.js, identity.js, manifest.yaml and page.
# `package.json` and `package-lock.json` are the skeleton's, unmodified — the
# proof app adds no dependency, and a second copy of §12's pinned set is a
# second producer of the list the scan gate and the drift test both key on.
cp fixtures/proof-app/server.js fixtures/proof-app/identity.js \
   fixtures/proof-app/manifest.yaml "$WORK/"
mkdir -p "$WORK/public"
cp fixtures/proof-app/public/index.html "$WORK/public/"
git -C "$WORK" add -A
git -C "$WORK" \
  -c user.name=manifest -c user.email=manifest@localhost \
  commit -q -m 'feat: the proof app — CWL sign-in and a per-user note' --allow-empty
git -C "$WORK" push -q origin HEAD:main
COMMIT="$(git -C "$WORK" rev-parse HEAD)"
echo "  pushed $COMMIT"

say "4. Validate manifest.yaml at that commit (§22 step 3)"
SPEC="$(api POST "/projects/$PROJECT_ID/spec" "{\"commitSha\":\"$COMMIT\"}")"
[ "$(printf '%s' "$SPEC" | field valid)" = true ] \
  || fail "manifest.yaml is not valid: $SPEC"
echo "  valid; sensitive diff: $(printf '%s' "$SPEC" | field sensitiveDiff)"

say "5. Build, release, deploy to staging"
BUILD="$(api POST "/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}")"
BUILD_ID="$(printf '%s' "$BUILD" | field id)"
[ "$(printf '%s' "$BUILD" | field status)" = succeeded ] \
  || fail "build $BUILD_ID did not succeed: $BUILD"
echo "  built $(printf '%s' "$BUILD" | field imageDigest)"

RELEASE_ID="$(api POST "/projects/$PROJECT_ID/releases" \
  "{\"buildId\":\"$BUILD_ID\",\"summary\":\"make demo-identity\"}" | field id)"
echo "  release $RELEASE_ID"

ENV_ID="$(environment staging)"
DEPLOY="$(api POST "/environments/$ENV_ID/deploy" "{\"releaseId\":\"$RELEASE_ID\"}")"
STATE="$(printf '%s' "$DEPLOY" | field state)" || fail "deploy failed: $DEPLOY"
# HEALTHY, not merely a state (P4b Task 13): a deploy that never becomes ready is a
# 200 whose state is `failed`, with an Incident. See the same check in demo.sh.
[ "$STATE" = healthy ] || fail "the deploy did not become healthy (state: $STATE).
§14's Incident has the exit, the app's last 200 log lines and a repair prompt:
GET /environments/$ENV_ID/incidents, signed in as the project's owner."
echo "  instance $STATE at $APP_URL"

# The deploy registered a Service Provider for this app, because its resolved
# `auth.provider` is cwl. A health check that passes proves the container is up;
# it does not prove the row exists, which is what step 6 is for.
HEALTH="$(curl -sS --cacert "$CA" -m 15 "$APP_URL/healthz")"
case "$HEALTH" in
  *'"mongo":true'*) echo "  healthz pings its own database: $HEALTH" ;;
  *) fail "the app is not healthy: $HEALTH" ;;
esac

say "6. Sign a STUDENT in to the deployed app, through the edge, over TLS"
idp_login "$STU_JAR" "$IDP_STU_JAR" "$APP_URL/login" student student \
  "$APP_URL/auth/ubcshib/callback" "$CA"
STU_ME="$(app "$STU_JAR" GET /api/me)"
STU_PUID="$(printf '%s' "$STU_ME" | field attributes.ubcEduCwlPuid)"
[ "$STU_PUID" = stu000001 ] || fail "the app sees puid '$STU_PUID', expected stu000001: $STU_ME"
# THE SHAPE OF THE ANSWER, not that an answer arrived. A session that
# authenticates nobody would carry this three steps further before failing.
STU_ID="$(printf '%s' "$STU_ME" | field endUserId)"
# `|| true`, deliberately, on the two that an attribute change makes ABSENT.
# `field` exits non-zero on a missing key, and under `set -e` inside a command
# substitution that kills the script before the explaining `fail` below ever
# runs — so shortening `auth.attributes` produced a raw JSON dump instead of the
# sentence naming the cause. Measured: that is what negative control (c) did.
STU_NAME="$(printf '%s' "$STU_ME" | field displayName 2>/dev/null || true)"
STU_AFF="$(printf '%s' "$STU_ME" | field affiliation 2>/dev/null || true)"
[ "$STU_NAME" = "Test Student" ] || fail "the app rendered no display name.
§9 enforces attribute release AT THE IdP against the Service Provider row the
platform derives from \`auth.attributes\`, so an attribute the manifest does not
declare is never sent — the app sees a MISSING key, not an empty one. Check
\`auth.attributes\` in manifest.yaml. The app saw:
  $STU_ME"
[ "$STU_AFF" = student ] || fail "affiliation is '$STU_AFF', expected student: $STU_ME"
echo "  $STU_NAME <$(printf '%s' "$STU_ME" | field attributes.mail)>, $STU_AFF"
echo "  end-user id ${STU_ID:0:16}… (sha256 of puid ‖ project ‖ environment)"

say "7. Write a note, and read it back"
# UNIQUE PER RUN, both of them. This demo is re-runnable by design — `make demo`
# reuses its project too — so the database already holds every earlier run's
# notes. An assertion that reads "the list is empty" or "the list is note 0"
# passes only against a virgin database, which is a demo that works once and
# then reports a defect that is not there. Measured: the second run of this
# script failed on exactly that.
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)-$$"
NOTE="a note only the student should ever see — $STAMP"
INS_NOTE="the instructor's own note — $STAMP"
json() { node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"; }
WROTE="$(app "$STU_JAR" POST /api/notes "{\"text\":$(json "$NOTE")}")"
[ "$(printf '%s' "$WROTE" | field text)" = "$NOTE" ] || fail "the write did not echo the note: $WROTE"
STU_NOTES="$(app "$STU_JAR" GET /api/notes)"
printf '%s' "$STU_NOTES" | grep -qF "$NOTE" \
  || fail "the student cannot read back the note they just wrote: $STU_NOTES"
echo "  wrote it, read it back: $NOTE"

say "8. Sign an INSTRUCTOR in — and DO NOT show them the student's note"
idp_login "$INS_JAR" "$IDP_INS_JAR" "$APP_URL/login" instructor instructor \
  "$APP_URL/auth/ubcshib/callback" "$CA"
INS_ME="$(app "$INS_JAR" GET /api/me)"
INS_PUID="$(printf '%s' "$INS_ME" | field attributes.ubcEduCwlPuid)"
[ "$INS_PUID" = ins000001 ] || fail "the app sees puid '$INS_PUID', expected ins000001: $INS_ME"
INS_ID="$(printf '%s' "$INS_ME" | field endUserId)"
[ "$INS_ID" != "$STU_ID" ] || fail "two people share one end-user id. That is
control (d)'s failure without control (d) — every note in this database belongs
to everybody."
[ "$(printf '%s' "$INS_ME" | field affiliation)" = faculty ] \
  || fail "affiliation is not faculty: $INS_ME"

# THE ACCEPTANCE, and it is THREE assertions rather than one.
#
# "The student's note is absent" is also true of an app that returns nothing to
# anybody, so the instructor must read back their OWN note in the same breath —
# otherwise a broken query that answers [] to everyone passes the acceptance.
# And the check runs BOTH WAYS: the student must not see the instructor's note
# either, which is what catches a filter keyed on something that happens to
# separate these two users without being the identity at all.
app "$INS_JAR" POST /api/notes "{\"text\":$(json "$INS_NOTE")}" >/dev/null
INS_NOTES="$(app "$INS_JAR" GET /api/notes)"

printf '%s' "$INS_NOTES" | grep -qF "$NOTE" \
  && fail "THE INSTRUCTOR CAN SEE THE STUDENT'S NOTE. This is the one thing this
demo exists to disprove: $INS_NOTES"
printf '%s' "$INS_NOTES" | grep -qF "$INS_NOTE" \
  || fail "the instructor cannot read back their OWN note, so its absence from
the student's list below would prove nothing: $INS_NOTES"

STU_AFTER="$(app "$STU_JAR" GET /api/notes)"
printf '%s' "$STU_AFTER" | grep -qF "$INS_NOTE" \
  && fail "THE STUDENT CAN SEE THE INSTRUCTOR'S NOTE. The filter separates these
two people in one direction only, which is not a filter: $STU_AFTER"
printf '%s' "$STU_AFTER" | grep -qF "$NOTE" \
  || fail "the student's own note vanished when the instructor wrote one: $STU_AFTER"

echo "  the instructor reads their own note and not the student's"
echo "  the student reads their own note and not the instructor's"

say "9. The AI half is P4b's, and says so"
AI="$(app "$STU_JAR" GET /api/ai)"
[ "$(printf '%s' "$AI" | field error)" = 'the AI half of the proof app is P4b' ] \
  || fail "unexpected /api/ai: $AI"
echo "  501, naming what fills it"

say "Done."
cat <<SUMMARY
  $APP_URL         from your browser — no port, no -k
  $APP_URL/login   sign in as student/student or instructor/instructor

  What this proved that a health check cannot: the IdP posted each assertion to
  the ACS in the row THE PLATFORM wrote, the app read \`ubcEduCwlPuid\` out of it
  under a friendly name, and the note the student wrote is invisible to the
  instructor in the same deployment of the same application.

  \`fixtures/proof-app/README.md\` carries the attribute justifications that P8's
  UBC IAM registration request needs.
SUMMARY
