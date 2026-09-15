# Measured 2026-09-15 for the P4c brief. IDs, container names and release IDs below are the
# ones that existed that day — READ AND EDIT THEM before re-running. See README.md.
# Does a request IN FLIGHT survive the edge moving its route to another container?
# A signed-in student's question (seconds long) is started on a throwaway route; one second
# in, the route's upstream is moved. Five trials, then the throwaway route is removed.
set -uo pipefail
cd /Users/rich/Developer/manifest
. infra/lib/common.sh; . infra/lib/idp-login.sh
say(){ :; }; fail(){ echo "FAIL: $*" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${P4C_OUT:-${TMPDIR:-/tmp}/p4c-baseline}"; mkdir -p "$S"   # outputs; scripts are beside this file
CA="$PWD/$CA_FILE"; APP_URL="https://proof-app.staging.$ZONE"
ADMIN=http://127.0.0.1:7119; HOST=p4c-probe.staging.manifest.internal
A="$(curl -sS -m 5 $ADMIN/id/mf-proof-app-staging-manifest-internal | grep -o '"dial":"[^"]*"' | cut -d'"' -f4)"
B=mf-proof-app-staging-392ff4ae-app:3000
echo "A (holds the session) = $A   B = $B"
route() { node -e 'const [id,host,dial]=process.argv.slice(1);console.log(JSON.stringify({"@id":id,match:[{host:[host]}],handle:[{handler:"request_body",max_size:10485760},{handler:"rate_limit",rate_limits:{[id]:{match:[{remote_ip:{ranges:["0.0.0.0/0","::/0"]}}],key:"{http.request.remote.host}",window:"1m",max_events:1000000}}},{handler:"headers",response:{set:{"X-Content-Type-Options":["nosniff"]}}},{handler:"reverse_proxy",upstreams:[{dial}]}],terminal:true}))' p4c-probe "$HOST" "$1"; }
adm() { if [ -n "${3:-}" ]; then curl -sS -m 10 -X "$1" -H 'content-type: application/json' --data-binary "$3" -o /dev/null -w '%{http_code}' "$ADMIN$2"; else curl -sS -m 10 -X "$1" -o /dev/null -w '%{http_code}' "$ADMIN$2"; fi; }
STU=$(mktemp); IDPS=$(mktemp); trap 'rm -f "$STU" "$IDPS"; adm DELETE /id/p4c-probe >/dev/null' EXIT
idp_login "$STU" "$IDPS" "$APP_URL/login" student student "$APP_URL/auth/ubcshib/callback" "$CA"
COOKIE="$(awk -F'\t' 'NF==7 && $6=="connect.sid"{print $6"="$7}' "$STU")"
[ -n "$COOKIE" ] || { echo "no connect.sid in the jar; cookies: $(awk -F'\t' 'NF==7{print $6}' "$STU")"; exit 1; }
echo "create probe route on A: $(adm PUT /config/apps/http/servers/srv0/routes/0 "$(route "$A")")"
sleep 2
ask() { curl -sS --cacert "$CA" -H "Cookie: $COOKIE" -m 120 -X POST \
  --data-urlencode 'question=What is my favourite element? Answer in four sentences.' \
  -o $S/p4c-inflight-body -w '%{http_code} %{time_total}s' "https://$HOST/api/ask"; }
trial() {
  ask > $S/p4c-inflight-res 2>&1 & local p=$!
  sleep 1
  local moved=""
  case "$2" in
    none) moved="no move" ;;
    patch) moved="PATCH dial -> B: $(adm PATCH /id/p4c-probe/handle/3/upstreams/0/dial "\"$B\"")" ;;
    delput) moved="DELETE $(adm DELETE /id/p4c-probe), PUT -> B $(adm PUT /config/apps/http/servers/srv0/routes/0 "$(route "$B")")" ;;
  esac
  wait $p
  echo "$1 [$moved]: $(cat $S/p4c-inflight-res) body: $(head -c 90 $S/p4c-inflight-body | tr '\n' ' ')"
  if [ "$2" != none ]; then
    echo "   a NEW request now, on B, with the same session cookie: $(curl -sS --cacert "$CA" -H "Cookie: $COOKIE" -o /dev/null -w '%{http_code}' "https://$HOST/api/me")"
    adm PATCH /id/p4c-probe/handle/3/upstreams/0/dial "\"$A\"" >/dev/null
  fi
  sleep 1
}
trial "control, no move" none
trial "patch 1" patch
trial "patch 2" patch
trial "patch 3" patch
trial "delete-then-put" delput
echo "remove probe route: $(adm DELETE /id/p4c-probe); GET it now: $(adm GET /id/p4c-probe)"
echo "proof-app route untouched: $(curl -sS -m 5 $ADMIN/id/mf-proof-app-staging-manifest-internal | grep -o '"dial":"[^"]*"')"
