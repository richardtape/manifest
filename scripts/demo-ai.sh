#!/usr/bin/env bash
# P4b's acceptance: §16's proof app ANSWERS A QUESTION, and the answer is
# attributed to the one person who asked it.
#
# A THIN WRAPPER, like `scripts/demo.sh` and `scripts/demo-identity.sh`: the logic
# under test lives in the Docker-tier suites, and a demo that reimplements any of
# it drifts into proving something else. It drives the real HTTP API with curl,
# the real event stream with a subscriber that is not a test's client, and the
# deployed app through the edge over TLS.
#
# WHAT IT PROVES, and each is the shape of an answer rather than its arrival:
#   5  the project's event stream carried THIS deploy, in order — the build, every
#      build-log line exactly as the build stored it, the SSO registration, the
#      healthy instance and the AI key rotation;
#   7  a signed-in student's question is answered by a STREAMED completion with a
#      non-empty answer, chosen context from a 768-dimension embedding, and that
#      context is one of THEIR OWN notes — never the instructor's, which was
#      written to be the closer match;
#   8  the same, for the instructor, the other way round;
#   9  LiteLLM charged each question to sha256(puid ‖ project ‖ environment) — two
#      people, two identifiers — and to no bare PUID hash and no raw PUID.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# THE login flow and THE proof app, each once — never a second copy of either
# (P4a defect 80; P4b Task 16).
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# shellcheck source=lib/proof-app.sh
. scripts/lib/proof-app.sh

SLUG="${DEMO_SLUG:-proof-app}"
CA="$ROOT/$CA_FILE"
APP_URL="https://$SLUG.staging.$ZONE"
LITELLM="${MANIFEST_LITELLM_URL:-http://127.0.0.1:7106}"

# One jar per identity, for demo-identity.sh's reason: two people must be two people.
CP_JAR="$(mktemp -t mf-ai-cp)"
IDP_CP_JAR="$(mktemp -t mf-ai-idpcp)"
STU_JAR="$(mktemp -t mf-ai-stu)"
IDP_STU_JAR="$(mktemp -t mf-ai-idpstu)"
INS_JAR="$(mktemp -t mf-ai-ins)"
IDP_INS_JAR="$(mktemp -t mf-ai-idpins)"
FRAMES="$(mktemp -t mf-ai-frames)"
BUILD_LOG="$(mktemp -t mf-ai-buildlog)"
WORK=""
WATCHER=""
cleanup() {
  if [ -n "$WATCHER" ]; then kill "$WATCHER" 2>/dev/null || true; fi
  rm -f "$CP_JAR" "$IDP_CP_JAR" "$STU_JAR" "$IDP_STU_JAR" "$INS_JAR" "$IDP_INS_JAR" \
    "$FRAMES" "$BUILD_LOG"
  [ -n "$WORK" ] && rm -rf "$WORK"
  return 0
}
# ONE trap, registered once (P4a defect 70).
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

sha256() { node -e 'console.log(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "$1"; }

# Signs one person in to the deployed app and prints their /api/me.
#   $1 jar  $2 IdP jar  $3 username (also the password)  $4 the PUID the app must see
sign_in() {
  local me
  idp_login "$1" "$2" "$APP_URL/login" "$3" "$3" "$APP_URL/auth/ubcshib/callback" "$CA"
  me="$(app "$1" GET /api/me)"
  [ "$(printf '%s' "$me" | field attributes.ubcEduCwlPuid)" = "$4" ] \
    || fail "signed in as $3, and the app does not see puid $4: $me"
  printf '%s' "$me"
}

# Asks a question as one person and checks THE SHAPE of the reply. Prints it.
#   $1 jar  $2 who, for messages  $3 extra JSON members for the body, optional
ask() {
  local reply answer chunks dims
  reply="$(app "$1" POST /api/ask "{\"question\":$(json "$QUESTION")${3:+,$3}}")"
  answer="$(printf '%s' "$reply" | field answer 2>/dev/null || true)"
  [ -n "$answer" ] || fail "$2 asked and got no answer. The app said:
  $reply
A 503 AI_BACKEND_UNAVAILABLE means the app cannot reach manifest-litellm on its
network; an AI_EMPTY_ANSWER is S3's thinking-model failure — zero content frames."
  chunks="$(printf '%s' "$reply" | field streamedChunks)"
  [ "$chunks" -ge 1 ] || fail "$2's answer arrived in $chunks streamed chunks — it was not streamed: $reply"
  dims="$(printf '%s' "$reply" | field embeddingDimensions)"
  [ "$dims" = 768 ] || fail "$2's question was embedded in $dims dimensions, not 768.
192 is S3's SILENT failure: an embed() without encoding_format 'float', whose 768
floats are decoded as base64 bytes. The blueprint's ai/llm.js sets it; check it
still does."
  printf '%s' "$reply"
}

# The context a reply used must be one of THAT person's notes, and must not be the
# other person's. The second check is what the first cannot see: an app whose
# context query dropped `{ owner }` still returns somebody's note.
#   $1 reply  $2 jar  $3 the OTHER person's note  $4 who
check_context() {
  local context notes
  context="$(printf '%s' "$1" | field context)"
  [ "$context" != null ] || fail "$4's question used no note as context, though $4 has written one: $1"
  [ "$context" != "$3" ] || fail "THE MODEL WAS HANDED SOMEBODY ELSE'S NOTE as $4's context:
  $context
The context query must filter on the asker's own identifier, exactly as GET
/api/notes does."
  notes="$(app "$2" GET /api/notes)"
  printf '%s' "$notes" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).notes.some(n=>n.text===process.argv[1])?0:1))' "$context" \
    || fail "$4's context is not one of $4's own notes:
  $context"
  printf '%s' "$context"
}

say "0. Is the control plane up, through the edge?"
# The ANSWER, not that an answer arrived: through the edge a stopped control plane is
# Caddy's empty 502, and a source the console refuses is a 403 with a body of its own —
# `curl -o /dev/null` passed both (P5a Task 3).
UP="$(curl -sS -m 5 "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}).
README's 'Running the control plane' has the exact commands — and check the boot line
says {\"driver\":\"docker\"} and \"origin\":\"$ORIGIN\", because every claim this demo
makes is meaningless against the fake driver or another origin." ;;
esac

say "1. Log in to Manifest itself with CWL (§9: Manifest is its own SP)"
idp_login "$CP_JAR" "$IDP_CP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
WHO="$(api GET /v1/me | field puid)"
[ "$WHO" = ins000001 ] || fail "logged in to the control plane as '$WHO', expected ins000001"
echo "  session for $WHO"

say "2. Create the project — or reuse it"
proof_app_project

say "3. Subscribe to the project's event stream BEFORE anything is built"
# A PROGRAM, because a shell cannot speak WebSocket; and connected first, because a
# connection is replayed the newest events but never the log lines it missed.
# NODE_EXTRA_CA_CERTS: the stream is wss:// through the edge since P5a Task 3, and Node
# does not read the keychain (S7).
NODE_EXTRA_CA_CERTS="$CA" node scripts/lib/event-stream.mjs watch "$API" "$PROJECT_ID" "$CP_JAR" "$FRAMES" &
WATCHER=$!
for _ in $(seq 1 40); do
  grep -qF '"manifest.stream.ready"' "$FRAMES" && break
  kill -0 "$WATCHER" 2>/dev/null || fail "the stream subscriber exited before the stream was ready:
$(cat "$FRAMES")"
  sleep 0.5
done
grep -qF '"manifest.stream.ready"' "$FRAMES" \
  || fail "WS /v1/projects/$PROJECT_ID/events sent no ready frame within 20 s"
REPLAYED="$(( $(wc -l < "$FRAMES") - 1 ))"
echo "  subscribed; replayed $REPLAYED earlier events"

say "4. Push, validate, build, release and deploy to staging — with the stream watching"
proof_app_push
proof_app_validate
proof_app_deploy "make demo-ai"

say "5. The stream carried this deploy, in order"
api GET "/v1/builds/$BUILD_ID/logs" > "$BUILD_LOG"
# The deploy's last event is published before its response returns, but a frame is
# still in flight when curl exits. Wait for it rather than for a fixed time.
for _ in $(seq 1 20); do
  tail -n "+$(( REPLAYED + 2 ))" "$FRAMES" | grep -qF '"type":"ai.key_rotated"' && break
  sleep 0.5
done
kill "$WATCHER" 2>/dev/null || true
wait "$WATCHER" 2>/dev/null || true
WATCHER=""
node scripts/lib/event-stream.mjs expect "$FRAMES" "$PROJECT_ID" "$BUILD_ID" "$BUILD_LOG" \
  build.started build.succeeded sso.registered instance.healthy ai.key_rotated \
  || fail "the event stream did not carry this deploy (above)."

say "6. A student and an instructor sign in, and each writes a note"
STU_ME="$(sign_in "$STU_JAR" "$IDP_STU_JAR" student stu000001)"
INS_ME="$(sign_in "$INS_JAR" "$IDP_INS_JAR" instructor ins000001)"
STU_ID="$(printf '%s' "$STU_ME" | field endUserId)"
INS_ID="$(printf '%s' "$INS_ME" | field endUserId)"
# THE EXPECTED IDENTIFIERS ARE CONSTRUCTED HERE, from the formula written out, not
# read back from the app — a check that asks the implementation what it computes
# and asserts it computed that cannot fail.
[ "$STU_ID" = "$(sha256 "stu000001 $SLUG staging")" ] \
  || fail "the student's end-user id is not sha256(puid ‖ project ‖ environment): $STU_ID"
[ "$INS_ID" = "$(sha256 "ins000001 $SLUG staging")" ] \
  || fail "the instructor's end-user id is not sha256(puid ‖ project ‖ environment): $INS_ID"
echo "  student    ${STU_ID:0:16}…"
echo "  instructor ${INS_ID:0:16}…"

# UNIQUE PER RUN, for demo-identity.sh's reason. And the INSTRUCTOR'S note is written
# to be the CLOSER MATCH for the question — it opens with the question's own words —
# so a context query that lost its owner filter hands the student the instructor's
# note, and step 7 sees it.
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)-$$"
QUESTION="What is my favourite element?"
STU_NOTE="My favourite element is xenon, because it glows blue in a discharge tube. ($STAMP)"
INS_NOTE="What is my favourite element? Bismuth, for its iridescent staircase crystals. ($STAMP)"
[ "$(app "$STU_JAR" POST /api/notes "{\"text\":$(json "$STU_NOTE")}" | field text)" = "$STU_NOTE" ] \
  || fail "the student's note was not written"
[ "$(app "$INS_JAR" POST /api/notes "{\"text\":$(json "$INS_NOTE")}" | field text)" = "$INS_NOTE" ] \
  || fail "the instructor's note was not written"
# Spend rows are compared against this instant, so a previous run's rows prove nothing.
ASKED_FROM="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

say "7. The student asks \"$QUESTION\" — answered from the STUDENT's notes"
STU_REPLY="$(ask "$STU_JAR" student)"
STU_CONTEXT="$(check_context "$STU_REPLY" "$STU_JAR" "$INS_NOTE" student)"
[ "$(printf '%s' "$STU_REPLY" | field attributedTo)" = "$STU_ID" ] \
  || fail "the app says it charged the student's question to someone else: $STU_REPLY"
echo "  streamed in $(printf '%s' "$STU_REPLY" | field streamedChunks) chunks; embedded in 768 dimensions"
# WHICH note, said out loud. Every run adds a note, and an earlier run's near-identical
# note is an equally good match — so the evidence on screen says whether it is this
# run's, rather than letting an old note stand in for a new one (P4a defect 74's shape).
this_run() { case "$1" in *"$STAMP"*) echo "(written this run)" ;; *) echo "(an earlier run's note)" ;; esac; }
echo "  context: $STU_CONTEXT $(this_run "$STU_CONTEXT")"
echo "  answer:  $(printf '%s' "$STU_REPLY" | field answer | tr '\n' ' ' | cut -c1-200)"

say "8. The instructor asks the same question, NAMING THE STUDENT — and is answered as the instructor"
# THE PUID COMES FROM THE SESSION. The request body names the student, the way a
# client that tries to spend somebody else's allowance — or read their notes through
# the model — would. The app must ignore it: the context stays the instructor's, the
# answer is charged to the instructor, and step 9 finds no second row for the student.
INS_REPLY="$(ask "$INS_JAR" instructor '"puid":"stu000001","ubcEduCwlPuid":"stu000001"')"
INS_CONTEXT="$(check_context "$INS_REPLY" "$INS_JAR" "$STU_NOTE" instructor)"
[ "$(printf '%s' "$INS_REPLY" | field attributedTo)" = "$INS_ID" ] \
  || fail "the instructor named the student in the request body, and the app charged the
question to someone other than the instructor: $INS_REPLY
The PUID must come from the session, never from the request."
echo "  context: $INS_CONTEXT $(this_run "$INS_CONTEXT")"
echo "  answer:  $(printf '%s' "$INS_REPLY" | field answer | tr '\n' ' ' | cut -c1-200)"

say "9. LiteLLM charged each question to that person's NAMESPACED identifier"
# THE GATEWAY'S OWN RECORD, read with the master key from .env — this is an operator's
# check, run on the operator's machine. Filtered on `end_user`, which is what an app
# sends as `user`, rather than on LiteLLM's `user_id`: that is the APP's LiteLLM user,
# one per project and environment, and says nothing about which person asked.
MASTER="$(sed -n 's/^LITELLM_MASTER_KEY=//p' .env)"
[ -n "$MASTER" ] || fail "no LITELLM_MASTER_KEY in .env to read the spend log with"
spend_since() {
  curl -sS -m 15 -G -H "Authorization: Bearer $MASTER" "$LITELLM/spend/logs/v2" \
    --data-urlencode "end_user=$1" \
    --data-urlencode "start_date=$(date -u -v-1d '+%Y-%m-%d %H:%M:%S')" \
    --data-urlencode "end_date=$(date -u -v+1d '+%Y-%m-%d %H:%M:%S')" \
    --data-urlencode "page_size=100" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const rows=(JSON.parse(s).data??[]).filter(r=>Date.parse(r.startTime)>=Date.parse(process.argv[1]));console.log(JSON.stringify(rows.map(r=>({model:r.model_group,status:r.status,endUser:r.end_user,spend:r.spend,litellmUser:r.user}))))})' "$ASKED_FROM"
}
# LiteLLM writes spend rows in batches, so they are polled for, not assumed.
#   $1 rows  $2 model group
rows_for() { printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).filter(r=>r.model===process.argv[1]&&r.status==="success").length))' "$2"; }
charged() { [ "$(rows_for "$1" default-chat)" -ge 1 ] && [ "$(rows_for "$1" default-embed)" -ge 1 ]; }
for _ in $(seq 1 45); do
  STU_ROWS="$(spend_since "$STU_ID")"
  INS_ROWS="$(spend_since "$INS_ID")"
  charged "$STU_ROWS" && charged "$INS_ROWS" && break
  sleep 2
done
# BOTH MODELS, for each person. The embedding is spend on the asker's behalf as much
# as the answer is, and until this sitting the blueprint's embed() sent no `user`:
# LiteLLM recorded each one with an EMPTY end_user, charged to nobody (measured on the
# first run of this script, 2026-09-15).
#   $1 rows  $2 who  $3 their identifier
uncharged() {
  fail "LiteLLM holds $(rows_for "$1" default-chat) successful default-chat and $(rows_for "$1" default-embed) default-embed
spend row(s) for the $2's identifier ${3:0:16}… since $ASKED_FROM, after 90 s — one of each
was expected. A missing row means that call was charged to some OTHER string: an embed()
or a chat call that sends no \`user\`, or one that sends something other than endUserId().
Rows: $1"
}
charged "$STU_ROWS" || uncharged "$STU_ROWS" student "$STU_ID"
charged "$INS_ROWS" || uncharged "$INS_ROWS" instructor "$INS_ID"
# The rows were charged through THIS app's LiteLLM user — the one the platform minted
# the key under, carrying the app's monthly budget. It is keyed on the project's UUID
# and its environment (ai/keys.ts), and that is what is checked: a spend row carries
# none of the key's `metadata`, so the project cannot be read from there (measured
# 2026-09-15, LiteLLM 1.98.0 — P4b sitting 10).
for rows in "$STU_ROWS" "$INS_ROWS"; do
  printf '%s' "$rows" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).every(r=>r.litellmUser.includes(process.argv[1])&&r.litellmUser.endsWith("-staging"))?0:1))' "$PROJECT_ID" \
    || fail "a spend row was charged through a LiteLLM user that is not project $PROJECT_ID's staging user: $rows"
done
# AND TO NOTHING UN-NAMESPACED. A bare PUID hash is S3's cross-app lockout; a raw PUID
# is a UBC identifier in the gateway's log.
for bare in "$(sha256 stu000001)" stu000001 "$(sha256 ins000001)" ins000001; do
  [ "$(spend_since "$bare")" = '[]' ] \
    || fail "LiteLLM holds a spend row since $ASKED_FROM charged to an UN-NAMESPACED identifier
('${bare:0:16}…'). That is the cross-app lockout §10's namespace exists to prevent."
done
echo "  student:    $(rows_for "$STU_ROWS" default-chat) chat and $(rows_for "$STU_ROWS" default-embed) embedding row(s) charged to ${STU_ID:0:16}…"
echo "  instructor: $(rows_for "$INS_ROWS" default-chat) chat and $(rows_for "$INS_ROWS" default-embed) embedding row(s) charged to ${INS_ID:0:16}…"
echo "  none charged to a bare PUID hash or a raw PUID"

say "Done."
cat <<SUMMARY
  $APP_URL          from your browser — sign in, write a note, ask about it

  What this proved that a health check cannot: the platform minted this app a key
  confined to its two models, the app reached the gateway on its own network, a
  person's question was answered from that person's notes and nobody else's, and
  the gateway charged it to sha256(puid ‖ project ‖ environment) — the string that
  keeps one application's spending from locking a student out of another's.

  §16's proof app is complete: CWL sign-in (make demo-identity), a note one person
  cannot see, and this answer.
SUMMARY
