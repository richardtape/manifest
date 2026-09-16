#!/usr/bin/env bash
# M2 (P5a Task 1): can an edge route refuse every source but the host — and is the
# refusal the MATCHER, not a network that cannot reach the edge anyway?
#
# A throwaway route for p5a-probe.manifest.internal, through the admin API, dialling a
# hold server on the host. Removed on exit. Nothing here changes the Caddyfile.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"
# shellcheck source=../../../../infra/lib/common.sh
. infra/lib/common.sh

ADMIN="http://127.0.0.1:$PORT_CADDY_ADMIN"
HOST="p5a-probe.$ZONE"
HOLD_PORT=7190
ROUTE_ID=p5a-probe
ALLOW="${M2_ALLOW:-10.89.0.1/32}"
REFUSAL='manifest: the control plane is not reachable from this network'

# A hold server: answers `held <ms>` after ?ms=, so the same upstream measures both the
# forward and a long request. Loopback only, like the control plane.
node -e '
  const http = require("node:http")
  http.createServer((req, res) => {
    const ms = Number(new URL(req.url, "http://x").searchParams.get("ms") ?? 0)
    setTimeout(() => res.end(`held ${ms}`), ms)
  }).listen(Number(process.argv[1]), "127.0.0.1")
' "$HOLD_PORT" &
HOLD_PID=$!
cleanup() {
  kill "$HOLD_PID" 2>/dev/null || true
  curl -sS -X DELETE "$ADMIN/id/$ROUTE_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sleep 1

# $1: `with` or `without` the refusal. PUT to routes/0 inserts AHEAD of the wildcard;
# POST would append behind it and never match (ORIENTATION §4).
route() {
  local refuse=''
  if [ "$1" = with ]; then
    refuse="{\"match\":[{\"not\":[{\"remote_ip\":{\"ranges\":[\"$ALLOW\"]}}]}],\"handle\":[{\"handler\":\"static_response\",\"status_code\":403,\"body\":\"$REFUSAL\"}]},"
  fi
  curl -sS -X DELETE "$ADMIN/id/$ROUTE_ID" >/dev/null 2>&1 || true
  curl -sS -f -X PUT "$ADMIN/config/apps/http/servers/srv0/routes/0" \
    -H 'content-type: application/json' \
    -d "{\"@id\":\"$ROUTE_ID\",\"match\":[{\"host\":[\"$HOST\"]}],\"handle\":[{\"handler\":\"subroute\",\"routes\":[$refuse{\"handle\":[{\"handler\":\"reverse_proxy\",\"upstreams\":[{\"dial\":\"host.docker.internal:$HOLD_PORT\"}]}]}]}],\"terminal\":true}" \
    >/dev/null
}

from_host() { curl -sS -m "${2:-10}" -w ' [%{http_code}]' "https://$HOST$1"; echo; }
from_platform() {
  docker run --rm --network "$NET" --dns "$DNS_C_IP" \
    -v "$ROOT/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
    --cacert /ca.crt -sS -m 10 -w ' [%{http_code}]' "https://$HOST$1"
  echo
}
APP="$(docker ps --filter label=manifest.slug=proof-app --filter label=manifest.release --format '{{.Names}}' | head -1)"
[ -n "$APP" ] || { echo "no proof-app container — run make demo-ai first"; exit 1; }
# From INSIDE the app, by the edge's name on the app network, with the probe's name as
# SNI and Host: the path §12 says name resolution does not close. Node's https ignores
# the proxy variables the app is given. rejectUnauthorized is off because this probes
# ROUTING, and the answer must not be a TLS failure mistaken for a refusal.
from_app() {
  docker exec "$APP" node -e '
    const https = require("node:https")
    const [host, path] = process.argv.slice(1)
    https.get({ host: "manifest-caddy", port: 443, servername: host, headers: { host }, path, rejectUnauthorized: false }, (res) => {
      let body = ""; res.on("data", (d) => (body += d)); res.on("end", () => console.log(`${body} [${res.statusCode}]`))
    }).on("error", (e) => console.log(`error ${e.code}`))
  ' "$HOST" "$1"
}

route with
echo "[M2a] host           : $(from_host '/?ms=1')"
echo "[M2b] platform net   : $(from_platform '/?ms=1')"
echo "[M2c] proof-app net  : $(from_app '/?ms=1')"
route without
echo "[M2d] CONTROL, no refusal — proof-app net: $(from_app '/?ms=1')"
route with
echo "[M2e] a 100 s request through the edge, from the host:"
START=$(date +%s); echo "      $(from_host '/?ms=100000' 130) after $(( $(date +%s) - START )) s"

# [M2f] The Caddyfile form Task 3 will ship, adapted by THIS Caddy and printed as JSON —
# checked here, loaded nowhere. `route` keeps written order; outside one, Caddy sorts
# `respond` ahead of `reverse_proxy`.
docker exec -i manifest-caddy sh -c 'cat > /tmp/p5a-m2f.Caddyfile' <<'CADDY'
console.manifest.internal {
	tls internal
	route {
		@outside not remote_ip 10.89.0.1/32
		respond @outside "manifest: the control plane is not reachable from this network" 403
		@api path /v1/* /auth/*
		reverse_proxy @api host.docker.internal:7100
		respond "manifest console: not built yet — P5c serves it here. The API is under /v1/." 200
	}
}
CADDY
echo "[M2f] adapted:"
docker exec manifest-caddy caddy adapt --config /tmp/p5a-m2f.Caddyfile --adapter caddyfile
docker exec manifest-caddy rm -f /tmp/p5a-m2f.Caddyfile
