#!/usr/bin/env bash
# M2g (P5a Task 1, added while executing): the one route OUT of an app network that M2
# did not try — the app's own forced egress proxy. The proxy container sits on
# manifest-platform as well as the app network, so a CONNECT through it would reach the
# edge from a platform address. Does the proxy refuse it, and if it does not, does the
# edge's allow-list?
#
# Same throwaway route as M2, with and without the refusal. Removed on exit.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"
# shellcheck source=../../../../infra/lib/common.sh
. infra/lib/common.sh

ADMIN="http://127.0.0.1:$PORT_CADDY_ADMIN"
HOST="p5a-probe.$ZONE"
HOLD_PORT=7190
ROUTE_ID=p5a-probe
REFUSAL='manifest: the control plane is not reachable from this network'

node -e '
  require("node:http").createServer((req, res) => res.end("held")).listen(Number(process.argv[1]), "127.0.0.1")
' "$HOLD_PORT" &
HOLD_PID=$!
cleanup() {
  kill "$HOLD_PID" 2>/dev/null || true
  curl -sS -X DELETE "$ADMIN/id/$ROUTE_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sleep 1

route() {
  local refuse=''
  if [ "$1" = with ]; then
    refuse="{\"match\":[{\"not\":[{\"remote_ip\":{\"ranges\":[\"10.89.0.1/32\"]}}]}],\"handle\":[{\"handler\":\"static_response\",\"status_code\":403,\"body\":\"$REFUSAL\"}]},"
  fi
  curl -sS -X DELETE "$ADMIN/id/$ROUTE_ID" >/dev/null 2>&1 || true
  curl -sS -f -X PUT "$ADMIN/config/apps/http/servers/srv0/routes/0" \
    -H 'content-type: application/json' \
    -d "{\"@id\":\"$ROUTE_ID\",\"match\":[{\"host\":[\"$HOST\"]}],\"handle\":[{\"handler\":\"subroute\",\"routes\":[$refuse{\"handle\":[{\"handler\":\"reverse_proxy\",\"upstreams\":[{\"dial\":\"host.docker.internal:$HOLD_PORT\"}]}]}]}],\"terminal\":true}" \
    >/dev/null
}

APP="$(docker ps --filter label=manifest.slug=proof-app --filter label=manifest.release --format '{{.Names}}' | head -1)"
[ -n "$APP" ] || { echo "no proof-app container"; exit 1; }

# CONNECT through the app's own HTTPS_PROXY, then TLS to the probe name over that tunnel.
# Prints the proxy's answer to CONNECT, and the edge's answer if a tunnel opened.
via_proxy() {
  docker exec "$APP" node -e '
    const http = require("node:http"), tls = require("node:tls")
    const host = process.argv[1]
    const proxy = new URL(process.env.HTTPS_PROXY)
    const req = http.request({ host: proxy.hostname, port: proxy.port, method: "CONNECT", path: `${host}:443` })
    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) { console.log(`proxy refused CONNECT [${res.statusCode} ${res.statusMessage}]`); socket.destroy(); return }
      const s = tls.connect({ socket, servername: host, rejectUnauthorized: false }, () => {
        s.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`)
      })
      let raw = ""; s.on("data", (d) => (raw += d)); s.on("end", () => {
        const [head, body] = raw.split("\r\n\r\n"); console.log(`tunnel opened; edge answered [${head.split("\r\n")[0]}] ${body}`)
      })
      s.on("error", (e) => console.log(`tunnel TLS error ${e.code}`))
    })
    req.on("error", (e) => console.log(`proxy error ${e.code}`))
    req.setTimeout(10000, () => { console.log("proxy timeout"); req.destroy() })
    req.end()
  ' "$HOST"
}

# The proxy's answer to a bare CONNECT, for the positive control and the edge's own names.
connect_status() {
  docker exec "$APP" node -e '
    const http = require("node:http")
    const proxy = new URL(process.env.HTTPS_PROXY)
    const req = http.request({ host: proxy.hostname, port: proxy.port, method: "CONNECT", path: process.argv[1] })
    req.on("connect", (res, socket) => { console.log(`[${res.statusCode} ${res.statusMessage}]`); socket.destroy() })
    req.on("error", (e) => console.log(`proxy error ${e.code}`))
    req.setTimeout(10000, () => { console.log("proxy timeout"); req.destroy() })
    req.end()
  ' "$1"
}

route with
echo "[M2g] proof-app via its egress proxy, WITH the refusal   : $(via_proxy)"
route without
echo "[M2g] proof-app via its egress proxy, WITHOUT the refusal: $(via_proxy)"
echo "[M2g] POSITIVE CONTROL, CONNECT manifest-idp:80 (allowlisted): $(connect_status manifest-idp:80)"
echo "[M2g] CONNECT manifest-caddy:443                           : $(connect_status manifest-caddy:443)"
echo "[M2g] CONNECT 10.89.0.10:443 (the edge's platform address)  : $(connect_status 10.89.0.10:443)"
echo "[M2g] CONNECT host.docker.internal:7100 (the control plane) : $(connect_status host.docker.internal:7100)"
