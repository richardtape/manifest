#!/usr/bin/env bash
# P4c's acceptance: a redeploy of §16's proof app interrupts nobody using it.
#
# A THIN WRAPPER, like demo.sh, demo-identity.sh and demo-ai.sh: the logic under test
# lives in the Docker-tier suites, and a demo that reimplements any of it drifts into
# proving something else. It drives the real HTTP API with curl, the real event stream
# with the dependency-free subscriber, and the deployed app through the edge over TLS.
#
# WHAT IT PROVES, each as the shape of an answer rather than its arrival:
#   5  a SAME-release redeploy, under a /healthz loop classified by body AND by the
#      edge's X-Manifest-Instance header and a signed-in student asking questions back
#      to back: no 5xx, no wildcard page, no 401, every question answered — and the
#      header names the new instance afterwards;
#   6  the same for a NEW-release redeploy;
#   7  after each: exactly one app container for the app, no files volume without a
#      container, and exactly one live LiteLLM key for the app's user — and the key the
#      retired instance held is gone only AFTER the stream said it was retired;
#   8  a release that never becomes ready leaves the previous instance serving — the
#      header still names it — with an Incident, its container gone and no second key.
#
# IT RUNS EVERY PHASE AND FAILS AT THE END, listing every assertion that failed, so a
# red run is a measurement. Task 1 runs it against the platform as P4b left it.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no
# `xargs -r`, no `readlink -f`, and `sed -i` takes an argument.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# shellcheck source=lib/proof-app.sh
. scripts/lib/proof-app.sh

API="${MANIFEST_API:-http://127.0.0.1:7100}"
SLUG="${DEMO_SLUG:-proof-app}"
CA="$ROOT/$CA_FILE"
APP_URL="https://$SLUG.staging.$ZONE"
LITELLM="${MANIFEST_LITELLM_URL:-http://127.0.0.1:7106}"

OUT="$(mktemp -d -t mf-redeploy)"
CP_JAR="$OUT/cp.jar"; IDP_CP_JAR="$OUT/idp-cp.jar"
STU_JAR="$OUT/stu.jar"; IDP_STU_JAR="$OUT/idp-stu.jar"
FRAMES="$OUT/frames.ndjson"; MARKS="$OUT/markers.ndjson"
LOOP="$OUT/loop.ndjson"; ASKS="$OUT/asks.log"
# Created EMPTY up front. Every one of them is `grep`ed or `awk`ed before its writer
# has necessarily appended a line, and a missing file is a stderr error rather than a
# zero count (Task 1 finding 3).
: > "$FRAMES"; : > "$MARKS"; : > "$LOOP"; : > "$ASKS"
WORK=""; WATCHER=""; LOOPER=""; ASKER=""; FAILURES=""

cleanup() {
  touch "$OUT/stop" 2>/dev/null || true
  for pid in "$WATCHER" "$LOOPER" "$ASKER"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
  done
  [ -n "$WORK" ] && rm -rf "$WORK"
  # A red run is EVIDENCE: its raw output is kept and its path printed.
  if [ -z "$FAILURES" ]; then rm -rf "$OUT"; else echo "raw output kept in $OUT" >&2; fi
  return 0
}
# ONE trap, registered once (P4a defect 70).
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
# `fail` is for a PRECONDITION — the platform is not up, the fixture is not there.
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
# `check` is for an ASSERTION: every one runs, and the run reports all of them.
check() {
  local what="$1"; shift
  if "$@"; then
    echo "  ok   $what"
  else
    echo "  FAIL $what"
    FAILURES="$FAILURES
  - $what"
  fi
}
now()  { node -e 'console.log(Date.now())'; }
mark() { printf '{"name":"%s","t":%s}\n' "$1" "$(now)" >> "$MARKS"; }

# `proof_app_push` mktemps a FRESH $WORK on every call and this script calls it three
# times; without dropping the previous one first, two source trees are left behind in
# $TMPDIR and the machine does not end as it started (Task 1 finding 2).
push() { [ -n "$WORK" ] && rm -rf "$WORK"; proof_app_push; }

# WHICH INSTANCE THE EDGE REACHES, read off the edge's own response header. A body
# alone cannot say which of two identical containers answered.
serving_now() {
  curl -sS --cacert "$CA" -m 10 -o /dev/null -D - "$APP_URL/healthz" \
    | tr -d '\r' | sed -n 's/^[Xx]-[Mm]anifest-[Ii]nstance: //p' | tail -1
}
# Every app container of this app: `manifest.release` is carried by app containers and
# not by the database or the egress proxy, and repeated `label` filters AND.
app_containers() {
  docker ps -a --filter "label=manifest.slug=$SLUG" --filter label=manifest.release \
    --format '{{.Names}}' | grep -c . | tr -d ' '
}
# A files volume with no container is an SP private key nobody is using (P4b 194).
orphan_files_volumes() {
  local n=0 volume
  for volume in $(docker volume ls --format '{{.Name}}' \
      | grep -E "^mf-$SLUG-staging-.*-app-files$"); do
    docker container inspect "${volume%-files}" >/dev/null 2>&1 || n=$((n + 1))
  done
  echo "$n"
}
# Live keys for THIS app's LiteLLM user — `mf-<projectId>-<environment>` (ai/keys.ts).
app_keys() {
  curl -sS -m 15 -G -H "Authorization: Bearer $MASTER" "$LITELLM/key/list" \
    --data-urlencode "user_id=mf-$PROJECT_ID-staging" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(Array.isArray(j.keys)?j.keys.length:-1)})'
}
containers_for_release() {
  docker ps -a --filter "label=manifest.release=$1" --format '{{.Names}}' | grep -c . | tr -d ' '
}
incident_for() {
  api GET "/environments/$ENV_ID/incidents" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const rows=j.incidents??j;process.exit(rows.some(i=>i.instanceId===process.argv[1])?0:1)})' "$1"
}
# The stream said this instance was retired — never a sleep: the drain is bounded at
# 120 s and a fixed wait would either be too short or make every run take that long.
wait_retired() {
  local i
  for i in $(seq 1 300); do
    grep -F '"type":"instance.retired"' "$FRAMES" | grep -qF "\"instanceId\":\"$1\"" && return 0
    sleep 0.5
  done
  return 1
}
redeploy() { # $1 phase  $2 release id   -> sets DEPLOYED
  mark "$1-start"
  DEPLOYED="$(api POST "/environments/$ENV_ID/deploy" "{\"releaseId\":\"$2\"}")"
  mark "$1-end"
}

say "0. Is the control plane up?"
curl -sS -m 5 -o /dev/null "$API/auth/me" \
  || fail "no control plane at $API. README's 'Running the control plane' has the exact
commands — and check the boot line says {\"driver\":\"docker\"}, because every claim
this demo makes is meaningless against the fake one."
MASTER="$(sed -n 's/^LITELLM_MASTER_KEY=//p' .env)"
[ -n "$MASTER" ] || fail "no LITELLM_MASTER_KEY in .env to read LiteLLM's keys with"
echo "  $API answered"

say "1. Log in to Manifest itself with CWL (§9: Manifest is its own SP)"
idp_login "$CP_JAR" "$IDP_CP_JAR" "$API/auth/login" instructor instructor \
  "$API/auth/saml/callback" "$CA"

say "2. The proof app, deployed and healthy — the instance every later phase replaces"
proof_app_project
push
proof_app_validate
proof_app_deploy "make demo-redeploy: the instance a redeploy replaces"
BASE_RELEASE="$RELEASE_ID"
BASE_INSTANCE="$(api GET "/environments/$ENV_ID" | field instance.id)"

say "3. Subscribe to the project's event stream"
node scripts/lib/event-stream.mjs watch "$API" "$PROJECT_ID" "$CP_JAR" "$FRAMES" &
WATCHER=$!
for _ in $(seq 1 40); do
  grep -qF '"manifest.stream.ready"' "$FRAMES" && break
  kill -0 "$WATCHER" 2>/dev/null || fail "the stream subscriber exited: $(cat "$FRAMES")"
  sleep 0.5
done
grep -qF '"manifest.stream.ready"' "$FRAMES" \
  || fail "WS /projects/$PROJECT_ID/events sent no ready frame within 20 s"

say "4. A student signs in, writes a note, and the two loops start"
idp_login "$STU_JAR" "$IDP_STU_JAR" "$APP_URL/login" student student \
  "$APP_URL/auth/ubcshib/callback" "$CA"
app "$STU_JAR" POST /api/notes \
  "{\"text\":$(json "My favourite element is xenon. (redeploy demo)")}" > /dev/null
NODE_EXTRA_CA_CERTS="$CA" \
  node scripts/lib/redeploy-loop.mjs "$APP_URL/healthz" "$LOOP" 200 "$OUT/stop" &
LOOPER=$!
# The student asks BACK TO BACK, so a question is always in flight when a route moves —
# which is the only way to exercise a drain, and an AI call that starts during one.
#
# WITH A ONE-SECOND FLOOR, and that floor is load-bearing. §20 rate-limits every route at
# 600 events/min keyed on the client IP, and BOTH loops run on this host, so they share
# one budget: the /healthz loop at 200 ms is already 300/min. An answer takes seconds, so
# back-to-back asking costs about 20/min — but a question that FAILS fails in about 40 ms,
# and without a floor the loop becomes a spin of ~13 requests a second. Measured
# 2026-09-15, Task 1 run A: the same-release redeploy signed the student out at +1.2 s,
# the asker then issued 6,295 questions (2,782 of them refused 429 by the edge), and the
# health loop — the measurement itself — collected 959 of its own 429s, 43% of its
# requests. `--bad` counted every one, so the baseline measured the harness (finding 4).
(
  while [ ! -f "$OUT/stop" ]; do
    t0="$(now)"
    code="$(curl -sS --cacert "$CA" -b "$STU_JAR" -m 180 -X POST \
      -H 'content-type: application/json' \
      -d '{"question":"What is my favourite element?"}' \
      -o "$OUT/ask-body" -w '%{http_code}' "$APP_URL/api/ask" 2>/dev/null)"
    t1="$(now)"
    printf '%s %s %s %s\n' "$t0" "$t1" "$code" \
      "$(head -c 300 "$OUT/ask-body" | tr -d '\n' | sed -n 's/.*"code":"\([A-Z_]*\)".*/\1/p')" \
      >> "$ASKS"
    [ "$((t1 - t0))" -lt 1000 ] && sleep 1
  done
) &
ASKER=$!
# WAIT FOR THE FIRST ANSWER, rather than sleeping a fixed warm-up. An AI answer takes
# 2.5–8.2 s on this machine (measured, Task 1), so `sleep 8` yields between one and three
# questions — and in Task 1's run B the single one it managed was still in flight when the
# redeploy destroyed its container, so the whole run answered ZERO questions and "every
# question was answered 200" was false for a reason that had nothing to do with a redeploy
# (finding 10). Bounded, and an ASSERTION rather than a precondition: if the AI path is
# broken the run says so in its own words instead of blaming the redeploy.
for _ in $(seq 1 60); do
  awk '$3 == 200' "$ASKS" | grep -q . && break
  sleep 1
done
check "a question is answered before any redeploy — the AI path works" \
  [ "$(awk '$3 == 200' "$ASKS" | grep -c . | tr -d ' ')" -ge 1 ]

say "5. A SAME-release redeploy, while both loops run"
PREVIOUS="$BASE_INSTANCE"
redeploy same-release "$BASE_RELEASE"
SAME_INSTANCE="$(printf '%s' "$DEPLOYED" | field id 2>/dev/null || echo none)"
check "same-release: the deploy is healthy" \
  [ "$(printf '%s' "$DEPLOYED" | field state 2>/dev/null || echo none)" = healthy ]
check "same-release: the edge names the new instance" [ "$(serving_now)" = "$SAME_INSTANCE" ]
check "same-release: the previous instance was retired within 150 s" wait_retired "$PREVIOUS"
check "same-release: exactly one app container is left" [ "$(app_containers)" = 1 ]
check "same-release: no files volume without a container" [ "$(orphan_files_volumes)" = 0 ]
check "same-release: LiteLLM holds exactly one key for the app" [ "$(app_keys)" = 1 ]

say "6. A NEW-release redeploy"
push
proof_app_validate
NEW_BUILD="$(api POST "/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}" | field id)"
NEW_RELEASE="$(api POST "/projects/$PROJECT_ID/releases" \
  "{\"buildId\":\"$NEW_BUILD\",\"summary\":\"make demo-redeploy: a new release\"}" | field id)"
PREVIOUS="$SAME_INSTANCE"
redeploy new-release "$NEW_RELEASE"
NEW_INSTANCE="$(printf '%s' "$DEPLOYED" | field id 2>/dev/null || echo none)"
check "new-release: the deploy is healthy" \
  [ "$(printf '%s' "$DEPLOYED" | field state 2>/dev/null || echo none)" = healthy ]
check "new-release: the edge names the new instance" [ "$(serving_now)" = "$NEW_INSTANCE" ]
check "new-release: the previous instance was retired within 150 s" wait_retired "$PREVIOUS"
check "new-release: exactly one app container is left" [ "$(app_containers)" = 1 ]
check "new-release: LiteLLM holds exactly one key for the app" [ "$(app_keys)" = 1 ]

say "7. A release that never becomes ready — the previous instance keeps serving"
# ONE LINE of manifest.yaml, and nothing else: the app still declares ai.models, so this
# deploy still mints a key that must be revoked, and it still builds and releases
# cleanly. What it cannot do is answer at its health path.
#
# `health:` is INDENTED, under `runtime:`. The top-level schema is `.strict()`, so an
# appended top-level `health:` key is refused at validation — the run would die in
# `proof_app_validate` and never reach step 8 — while a `^health:` anchor matches
# nothing at all. Both halves are asserted, because a control that cannot fail is this
# project's most-repeated defect (Task 1 finding 1).
push
grep -q '^[[:space:]]\{1,\}health: /healthz$' "$WORK/manifest.yaml" \
  || fail "no indented 'health: /healthz' under runtime: in $WORK/manifest.yaml —
the failing release's edit would match nothing and nothing would be proved."
sed -i '' 's|^\([[:space:]]\{1,\}\)health: .*|\1health: /never-ready|' "$WORK/manifest.yaml"
grep -q '^[[:space:]]\{1,\}health: /never-ready$' "$WORK/manifest.yaml" \
  || fail "the failing release's manifest.yaml was not edited — nothing would be proved"
git -C "$WORK" -c user.name=manifest -c user.email=manifest@localhost \
  commit -qam 'test: a release that never becomes ready'
git -C "$WORK" push -q origin HEAD:main
COMMIT="$(git -C "$WORK" rev-parse HEAD)"
proof_app_validate
FAIL_BUILD="$(api POST "/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}" | field id)"
FAIL_RELEASE="$(api POST "/projects/$PROJECT_ID/releases" \
  "{\"buildId\":\"$FAIL_BUILD\",\"summary\":\"make demo-redeploy: a release that never becomes ready\"}" | field id)"
redeploy failed-release "$FAIL_RELEASE"
FAILED_INSTANCE="$(printf '%s' "$DEPLOYED" | field id 2>/dev/null || echo none)"
check "failed release: the deploy is recorded failed" \
  [ "$(printf '%s' "$DEPLOYED" | field state 2>/dev/null || echo none)" = failed ]
check "failed release: the edge still names the instance that was serving" \
  [ "$(serving_now)" = "$NEW_INSTANCE" ]
check "failed release: an Incident names the failed instance" incident_for "$FAILED_INSTANCE"
check "failed release: the failed release left no container" \
  [ "$(containers_for_release "$FAIL_RELEASE")" = 0 ]
check "failed release: no files volume without a container" [ "$(orphan_files_volumes)" = 0 ]
check "failed release: LiteLLM still holds exactly one key for the app" [ "$(app_keys)" = 1 ]

say "8. What the loops saw"
touch "$OUT/stop"
wait "$LOOPER" 2>/dev/null; LOOPER=""
wait "$ASKER"  2>/dev/null; ASKER=""
kill "$WATCHER" 2>/dev/null; wait "$WATCHER" 2>/dev/null; WATCHER=""
node scripts/lib/redeploy-summary.mjs "$LOOP" "$MARKS"
BAD="$(node scripts/lib/redeploy-summary.mjs --bad "$LOOP" "$MARKS")"
RESETS="$(grep -c '"cls":"reset"' "$LOOP" | tr -d ' ')"
ASKED="$(grep -c . "$ASKS" | tr -d ' ')"
ASK_FAILS="$(awk '$3 != 200' "$ASKS" | grep -c . | tr -d ' ')"
check "no 5xx and no wildcard answer in any redeploy window" [ "$BAD" = 0 ]
check "every question was answered 200 ($ASKED asked)" [ "$ASK_FAILS" = 0 ]
check "nobody was signed out" [ "$(awk '$3 == 401' "$ASKS" | grep -c . | tr -d ' ')" = 0 ]
echo "  resets: $RESETS (tolerated — an edge configuration reload, §11)"

if [ -n "$FAILURES" ]; then
  printf '\n\033[31mFAILED:%s\033[0m\n' "$FAILURES" >&2
  exit 1
fi
say "Done."
cat <<SUMMARY
  $APP_URL          sign in, write a note, ask about it — through a redeploy

  What this proved that a health check cannot: the app changed release while people
  were using it, nobody was signed out, no question failed, and the instance it
  replaced was drained, its key revoked and its container and files volume removed.
SUMMARY
