# Measured 2026-09-15 for the P4c brief. IDs, container names and release IDs below are the
# ones that existed that day — READ AND EDIT THEM before re-running. See README.md.
# P4c's baseline: what a redeploy of the proof app does to people using it, TODAY.
# A /healthz loop every 200 ms (under the route's 600/min rate limit), classified by body,
# and a signed-in student asking questions back to back, through a same-release redeploy
# and then a new-release redeploy.
set -uo pipefail
cd /Users/rich/Developer/manifest
. infra/lib/common.sh; . infra/lib/idp-login.sh
say(){ :; }; fail(){ echo "FAIL: $*" >&2; exit 1; }
ROOT=$PWD; API=http://127.0.0.1:7100; CA="$ROOT/$CA_FILE"; SLUG=proof-app; APP_URL="https://proof-app.staging.$ZONE"
. scripts/lib/proof-app.sh
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${P4C_OUT:-${TMPDIR:-/tmp}/p4c-baseline}"; mkdir -p "$S"   # outputs; scripts are beside this file
now() { node -e 'console.log(Date.now())'; }
mark() { echo "{\"name\":\"$1\",\"t\":$(now)}" >> $S/p4c-markers.ndjson; }
: > $S/p4c-markers.ndjson; : > $S/p4c-health.ndjson; : > $S/p4c-asks.log; rm -f $S/p4c-stop
CP_JAR=$(mktemp); IDP=$(mktemp); STU=$(mktemp); IDPS=$(mktemp); WORK=""
trap 'rm -f "$CP_JAR" "$IDP" "$STU" "$IDPS"; [ -n "$WORK" ] && rm -rf "$WORK"' EXIT
PROJECT_ID=e741c882-d72d-4298-ab59-e33f3ad5e604
ENV_ID=ad5b43ea-7862-4c1e-ad38-f85469337b0b
OLD_RELEASE=392ff4ae-682f-42a3-aab1-e94eb1711ab1

idp_login "$CP_JAR" "$IDP" "$API/auth/login" instructor instructor "$API/auth/saml/callback" "$CA"
idp_login "$STU" "$IDPS" "$APP_URL/login" student student "$APP_URL/auth/ubcshib/callback" "$CA"

NODE_EXTRA_CA_CERTS=$CA node $HERE/p4c-loop.mjs "$APP_URL/healthz" $S/p4c-health.ndjson 200 $S/p4c-stop &
LOOP=$!
(
  while [ ! -f $S/p4c-stop ]; do
    t0=$(now)
    code=$(curl -sS --cacert "$CA" -b "$STU" -c "$STU" -m 120 -X POST \
      --data-urlencode 'question=What is my favourite element?' -o $S/p4c-ask-body \
      -w '%{http_code}' "$APP_URL/api/ask" 2>/dev/null)
    t1=$(now)
    err=$(head -c 400 $S/p4c-ask-body | tr -d '\n' | sed -n 's/.*"code":"\([A-Z_]*\)".*/\1/p')
    wild=$(head -c 11 $S/p4c-ask-body | grep -c 'manifest OK')
    echo "$t0 $t1 status=$code code=${err:--} wildcard=$wild" >> $S/p4c-asks.log
    if [ "$code" = 401 ]; then
      echo "$(now) the session was gone: signing in again" >> $S/p4c-asks.log
      : > "$STU"; : > "$IDPS"
      ( idp_login "$STU" "$IDPS" "$APP_URL/login" student student "$APP_URL/auth/ubcshib/callback" "$CA" ) \
        || echo "$(now) sign-in FAILED" >> $S/p4c-asks.log
    fi
  done
) &
ASKS=$!

sleep 10
mark same-release-deploy-start
api POST "/environments/$ENV_ID/deploy" "{\"releaseId\":\"$OLD_RELEASE\"}" > $S/p4c-deploy-same.json
mark same-release-deploy-end
echo "same-release deploy: $(field state < $S/p4c-deploy-same.json 2>/dev/null)"
sleep 15

proof_app_push
proof_app_validate
BUILD="$(api POST "/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}")"
BUILD_ID="$(printf '%s' "$BUILD" | field id)"
RELEASE_ID="$(api POST "/projects/$PROJECT_ID/releases" "{\"buildId\":\"$BUILD_ID\",\"summary\":\"p4c baseline\"}" | field id)"
echo "new release $RELEASE_ID"
sleep 5
mark new-release-deploy-start
api POST "/environments/$ENV_ID/deploy" "{\"releaseId\":\"$RELEASE_ID\"}" > $S/p4c-deploy-new.json
mark new-release-deploy-end
echo "new-release deploy: $(field state < $S/p4c-deploy-new.json 2>/dev/null)"
sleep 15

touch $S/p4c-stop
wait $LOOP
wait $ASKS
echo "--- /healthz, by body (window tail 5 s):"
node $HERE/p4c-summary.mjs $S/p4c-health.ndjson $S/p4c-markers.ndjson
echo "--- markers:"; cat $S/p4c-markers.ndjson
echo "--- asks (start end status code):"; cat $S/p4c-asks.log
echo "--- proof-app containers now:"; docker ps --filter 'name=^mf-proof-app-staging-' --format '{{.Names}}\t{{.Status}}'
