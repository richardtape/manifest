#!/usr/bin/env bash
# P4c Task 1: the five facts this plan's design rests on, measured BEFORE anything is
# built on them. Needs `make up`. Creates one throwaway route and up to five throwaway
# containers, and removes each by explicit name at the end.
#
#   bash p4c-measure-edge.sh <containerA:port> <containerB:port>
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
. "$ROOT/infra/lib/common.sh"
A="${1:?usage: p4c-measure-edge.sh <containerA:port> <containerB:port>}"
B="${2:?}"
ADMIN="http://127.0.0.1:$PORT_CADDY_ADMIN"
CA="$ROOT/$CA_FILE"
HOST="p4c-measure.staging.$ZONE"
RID=p4c-measure
SLOW=p4c-measure-slow; FORGE=p4c-measure-forge
SHORT=p4c-measure-short
LONG="p4c-measure-$(printf 'x%.0s' $(seq 1 60))"   # 72 characters: past DNS's 63
S="${P4C_OUT:-${TMPDIR:-/tmp}/p4c-task1}"; mkdir -p "$S"

say() { printf '\n== %s\n' "$*"; }
adm() { # method path [body]
  if [ -n "${3:-}" ]; then
    curl -sS -m 10 -X "$1" -H 'content-type: application/json' --data-binary "$3" \
      -o /dev/null -w '%{http_code}' "$ADMIN$2"
  else
    curl -sS -m 10 -X "$1" -o /dev/null -w '%{http_code}' "$ADMIN$2"
  fi
}
# THE ROUTE THE PLATFORM BUILDS, not a simplified one: §20's three handlers ahead of the
# proxy, and the identity header, deferred (Decision 6). `deferred` is the variable here.
route() { # dial instanceId deferred
  node -e '
const [dial, instance, deferred] = process.argv.slice(1)
console.log(JSON.stringify({
  "@id": "p4c-measure",
  match: [{ host: [process.env.HOST] }],
  handle: [
    { handler: "request_body", max_size: 10485760 },
    { handler: "rate_limit", rate_limits: { "p4c-measure": { match: [{ remote_ip: { ranges: ["0.0.0.0/0", "::/0"] } }], key: "{http.request.remote.host}", window: "1m", max_events: 1000000 } } },
    { handler: "headers", response: { set: { "X-Content-Type-Options": ["nosniff"], "X-Manifest-Instance": [instance] }, ...(deferred === "true" ? { deferred: true } : {}) } },
    { handler: "reverse_proxy", upstreams: [{ dial }] },
  ],
  terminal: true,
}))' "$1" "$2" "$3"
}
serve() { # name body [extra-header]
  docker run -d --name "$1" --network "$NET" alpine:3.22 sh -c \
    "while true; do printf 'HTTP/1.1 200 OK\r\nContent-Length: ${#2}\r\n${3:-}Connection: close\r\n\r\n$2' | nc -l -p 8080; done" \
    > /dev/null
}
edge_curl() { docker exec manifest-caddy curl -sS -m 5 "$@"; }
probe() { # url args…  — from a container, through the edge, with the platform CA
  docker run --rm --network "$NET" --dns "$DNS_C_IP" -v "$CA:/ca.crt:ro" \
    curlimages/curl:8.11.1 --cacert /ca.crt -sS "$@"
}
upstream_count() { # dial
  curl -sS -m 5 "$ADMIN/reverse_proxy/upstreams" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const u=JSON.parse(s).find(x=>x.address===process.argv[1]);console.log(u?u.num_requests:"unlisted")})' "$1"
}
export HOST

{
say "M1. Does Caddy keep counting an upstream that still has a request in flight after a PATCH moved its route?"
docker rm -f "$SLOW" >/dev/null 2>&1
# Answers after 8 s, so one request is provably in flight while the route moves.
docker run -d --name "$SLOW" --network "$NET" alpine:3.22 sh -c \
  "while true; do { sleep 8; printf 'HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nslow'; } | nc -l -p 8080; done" > /dev/null
echo "create route: $(adm PUT "/config/apps/http/servers/srv0/routes/0" "$(route "$SLOW:8080" m1 true)")"
sleep 1
probe -m 30 -o /dev/null -w 'held request: %{http_code} in %{time_total}s\n' "https://$HOST/" &
HELD=$!
sleep 2
echo "before the move: $(upstream_count "$SLOW:8080")"
echo "patch to B: $(adm PATCH "/id/$RID" "$(route "$A" m1 true)")"
for i in $(seq 1 24); do
  printf 'after the move +%s ms: %s\n' "$((i * 250))" "$(upstream_count "$SLOW:8080")"
  sleep 0.25
done
wait $HELD
echo "M1b. The same, with the old upstream ALSO parked on a second route that nothing reaches:"
echo "park: $(adm PUT "/config/apps/http/servers/srv0/routes/0" "$(node -e '
console.log(JSON.stringify({ "@id": "p4c-measure-park", match: [{ host: ["p4c-park.invalid"] }], handle: [{ handler: "reverse_proxy", upstreams: [{ dial: process.argv[1] }] }], terminal: true }))' "$SLOW:8080")")"
echo "patch to slow: $(adm PATCH "/id/$RID" "$(route "$SLOW:8080" m1 true)")"
sleep 1
probe -m 30 -o /dev/null -w 'held request: %{http_code} in %{time_total}s\n' "https://$HOST/" &
HELD=$!
sleep 2
echo "patch away: $(adm PATCH "/id/$RID" "$(route "$A" m1 true)")"
for i in $(seq 1 24); do
  printf 'parked, after the move +%s ms: %s\n' "$((i * 250))" "$(upstream_count "$SLOW:8080")"
  sleep 0.25
done
wait $HELD
echo "remove the parked route: $(adm DELETE /id/p4c-measure-park)"

say "M2. Does a deferred headers handler REPLACE an app's own X-Manifest-Instance?"
docker rm -f "$FORGE" >/dev/null 2>&1
serve "$FORGE" forged 'X-Manifest-Instance: forged\r\n'
# WAIT UNTIL IT ANSWERS. The first run of this script patched and probed immediately, and
# the deferred=true probe raced the container's startup: it printed nothing at all, which
# reads exactly like "the header was not set" — a measurement that cannot fail is worth
# nothing (Task 1 finding 12). The positive control comes first: prove the app really
# does serve its own header, or the whole comparison is against a forgery that is absent.
for _ in $(seq 1 30); do
  [ "$(docker exec manifest-caddy curl -sS -m 2 -o /dev/null -w '%{http_code}' \
      "http://$FORGE:8080/" 2>/dev/null)" = 200 ] && break
  sleep 1
done
echo "the app's own header, read directly from the edge:"
edge_curl -o /dev/null -D - "http://$FORGE:8080/" | tr -d '\r' | grep -i x-manifest-instance
echo "patch to the forging app, deferred=true: $(adm PATCH "/id/$RID" "$(route "$FORGE:8080" edge-value true)")"
sleep 1
probe -o /dev/null -D - "https://$HOST/" | tr -d '\r' | grep -i -e x-manifest-instance -e x-content-type-options
echo "-- the control: the same route with deferred absent"
echo "patch deferred=false: $(adm PATCH "/id/$RID" "$(route "$FORGE:8080" edge-value false)")"
probe -o /dev/null -D - "https://$HOST/" | tr -d '\r' | grep -i -e x-manifest-instance -e x-content-type-options

say "M3. Twenty in-place moves of the REAL route shape, under a request every 25 ms"
: > "$S/m3-loop.ndjson"; : > "$S/m3-marks.ndjson"; rm -f "$S/m3-stop"
APP_MARKER='"mongo":true' NODE_EXTRA_CA_CERTS="$CA" \
  node "$ROOT/scripts/lib/redeploy-loop.mjs" "https://$HOST/healthz" "$S/m3-loop.ndjson" 25 "$S/m3-stop" &
M3=$!
sleep 2
printf '{"name":"patch-moves-start","t":%s}\n' "$(node -e 'console.log(Date.now())')" >> "$S/m3-marks.ndjson"
for i in $(seq 1 20); do
  dial="$A"; [ $((i % 2)) = 1 ] && dial="$B"
  adm PATCH "/id/$RID" "$(route "$dial" "move-$i" true)" > /dev/null
  sleep 0.3
done
printf '{"name":"patch-moves-end","t":%s}\n' "$(node -e 'console.log(Date.now())')" >> "$S/m3-marks.ndjson"
sleep 2; touch "$S/m3-stop"; wait $M3
TAIL_MS=1000 node "$ROOT/scripts/lib/redeploy-summary.mjs" "$S/m3-loop.ndjson" "$S/m3-marks.ndjson"

say "M4. Is a container name longer than DNS's 63-octet label resolvable from the edge?"
docker rm -f "$LONG" "$SHORT" >/dev/null 2>&1
serve "$SHORT" short; serve "$LONG" long
sleep 1
echo "short name (${#SHORT} chars): $(edge_curl -o /dev/null -w '%{http_code}' "http://$SHORT:8080/" || echo 'curl failed')"
echo "long name  (${#LONG} chars): $(edge_curl -o /dev/null -w '%{http_code}' "http://$LONG:8080/" || echo 'curl failed')"
echo "getent from the edge: $(docker exec manifest-caddy getent hosts "$LONG" || echo 'no answer')"

say "M5. Do repeated label filters AND, and do only app containers carry manifest.release?"
docker ps -a --filter "label=manifest.slug=proof-app" --filter label=manifest.release --format '{{.Names}}'
echo "-- with an environment that does not exist (empty means AND):"
docker ps -a --filter "label=manifest.slug=proof-app" --filter label=manifest.environment=nonexistent --format '{{.Names}}'

say "CLEANUP"
echo "remove the route: $(adm DELETE "/id/$RID"); GET it now: $(adm GET "/id/$RID")"
docker rm -f "$SLOW" "$FORGE" "$SHORT" "$LONG" > /dev/null 2>&1
echo "throwaway containers left: $(docker ps -a --format '{{.Names}}' | grep -c '^p4c-measure' | tr -d ' ')"
} 2>&1 | tee "$S/measurements.txt"
