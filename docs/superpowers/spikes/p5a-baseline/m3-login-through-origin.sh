#!/usr/bin/env bash
# M3 (P5a Task 1): a real CWL sign-in whose ACS is behind the edge, and a WebSocket
# stream upgraded through it — the two things the brief's §3 did not show.
#
# Boots the control plane with MANIFEST_CONTROL_PLANE_ORIGIN at a throwaway probe
# origin, which RE-REGISTERS the platform's SP row there. Step 8 of Task 1 puts the row
# back by booting once at the default origin.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"
. infra/lib/common.sh
. infra/lib/idp-login.sh
fail() { echo "FAIL: $*" >&2; exit 1; }

ADMIN="http://127.0.0.1:$PORT_CADDY_ADMIN"
HOST="p5a-probe.$ZONE"
ORIGIN="https://$HOST"
CA="$ROOT/$CA_FILE"
WORK="$(mktemp -d -t p5a-m3)"
JAR="$WORK/jar"; IDP_JAR="$WORK/idp-jar"

set -a; . ./.env; set +a
export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
export MANIFEST_SESSION_SECRET="$(openssl rand -hex 32)"
export MANIFEST_BLUEPRINTS_ROOT="$ROOT/blueprints"
export MANIFEST_REPOS_ROOT="$ROOT/.manifest/repos"
export MANIFEST_LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}"

pnpm --filter @manifest/control-plane build >/dev/null
MANIFEST_CONTROL_PLANE_ORIGIN="$ORIGIN" node packages/control-plane/dist/index.js > "$WORK/cp.log" 2>&1 &
CP=$!
cleanup() {
  kill "$CP" 2>/dev/null || true
  curl -sS -X DELETE "$ADMIN/id/p5a-probe" >/dev/null 2>&1 || true
  # Added while executing: keep the control plane's log for a reader, since the
  # work directory goes with the trap. Set M3_LOG to a path to keep it.
  [ -z "${M3_LOG:-}" ] || cp "$WORK/cp.log" "$M3_LOG" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT
for _ in $(seq 1 60); do grep -q 'control plane ready' "$WORK/cp.log" && break; sleep 1; done
grep 'control plane ready' "$WORK/cp.log" || { cat "$WORK/cp.log"; fail "no boot line"; }

# Everything on the probe origin to the control plane, host source only.
curl -sS -f -X PUT "$ADMIN/config/apps/http/servers/srv0/routes/0" -H 'content-type: application/json' \
  -d "{\"@id\":\"p5a-probe\",\"match\":[{\"host\":[\"$HOST\"]}],\"handle\":[{\"handler\":\"reverse_proxy\",\"upstreams\":[{\"dial\":\"host.docker.internal:7100\"}]}],\"terminal\":true}" >/dev/null

echo "[M3a] sign-in through $ORIGIN"
idp_login "$JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor "$ORIGIN/auth/saml/callback" "$CA"
# Cookie NAMES and FLAGS, never values.
awk -F'\t' 'NF==7 {print "      cookie", $6, "domain="$1, "secure="$4}' "$JAR"
echo "[M3b] $(curl -sS -b "$JAR" "$ORIGIN/auth/me")"

PROJECT_ID="$(curl -sS -b "$JAR" "$ORIGIN/projects" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.slug==="proof-app");console.log(p?p.id:"")})')"
[ -n "$PROJECT_ID" ] || fail "the instructor holds no proof-app project to stream"
node scripts/lib/event-stream.mjs watch "$ORIGIN" "$PROJECT_ID" "$JAR" "$WORK/frames.ndjson" &
WATCH=$!
sleep 4
kill "$WATCH" 2>/dev/null || true
echo "[M3c] frames through the edge: $(wc -l < "$WORK/frames.ndjson" | tr -d ' '), ready frame: $(grep -c 'manifest.stream.ready' "$WORK/frames.ndjson" || true)"

echo "[M3d] RelayState round trip through the real IdP"
URL="$(node docs/superpowers/spikes/p5a-baseline/m3b-relaystate.mjs "$ORIGIN")"
FORM="$(curl -sS --cacert "$CA" -c "$WORK/idp2" -b "$WORK/idp2" -L "$URL")"
STATE="$(echo "$FORM" | sed -n 's/.*name="AuthState"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
ACTION="$(echo "$FORM" | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
case "$ACTION" in http*) POST="$ACTION" ;; *) POST="https://idp.$ZONE$ACTION" ;; esac
ASSERTION="$(curl -sS --cacert "$CA" -c "$WORK/idp2" -b "$WORK/idp2" -L \
  --data-urlencode username=instructor --data-urlencode password=instructor \
  --data-urlencode "AuthState=$STATE" "$POST")"
echo "      RelayState in the IdP's form: $(echo "$ASSERTION" | sed -n 's/.*name="RelayState"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
