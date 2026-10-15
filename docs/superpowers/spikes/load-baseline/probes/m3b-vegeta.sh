#!/usr/bin/env bash
# B sitting 2, [M3b]: what vegeta sustains on this laptop — the measurement Task 1 could not make before the
# image existed. vegeta (manifest/vegeta:<version>, built by infra/seed/build-vegeta.sh) in a container
# hardened as launch/load.ts runs it, against a THROWAWAY Caddy from the edge's own image (TLS from its own
# internal CA, NO rate limit) fronting a throwaway Node app that answers the three paths the rehearsal
# loads as a skeleton app does unloaded ([M2]: / 200 with ~2.2 KB, /healthz 200, /login 302). Its own
# network; the live edge, 7100 and every app untouched. Everything removed on exit.
#
#   bash probes/m3b-vegeta.sh <out-dir> [rates…]      default rates: 10 50 100 200 400, 30 s each
#
# Writes each rate's `vegeta report -type=json` WHOLE to <out-dir>/report-<rate>.json (Task 2's unit tests
# read them) and prints a line per rate: asked, achieved, requests, codes, p50/p95/p99, the generator's CPU
# and memory mid-run, and the host's load before and after.
set -u
OUT="${1:?usage: m3b-vegeta.sh <out-dir> [rates…]}"; shift
RATES="${*:-10 50 100 200 400}"
SECS="${M3B_SECONDS:-30}"
NET=b-s2-m3b-net; SUB=10.99.5.0/24; EDGE=10.99.5.10; APP=10.99.5.20; GEN=10.99.5.30
HOST=m3b.staging.manifest.internal
EDGE_IMG=$(docker inspect manifest-caddy --format '{{.Image}}')
NODE_IMG=127.0.0.1:7107/base/node:24-alpine
VEGETA_VERSION=$(awk -F '\t' '$1 == "version" { print $2 }' "$(dirname "$0")/../../../../../infra/vegeta/vegeta.lock")
GEN_IMG=manifest/vegeta:$VEGETA_VERSION
W=$(mktemp -d)
mkdir -p "$OUT"
cleanup() {
  docker rm -f -v b-s2-m3b-caddy b-s2-m3b-app b-s2-m3b-gen >/dev/null 2>&1
  docker network rm $NET >/dev/null 2>&1
  rm -rf "$W"
}
trap cleanup EXIT

# The app: what a skeleton app answers a stranger on the three paths ([M2]'s table), no database behind it —
# this measures the GENERATOR, so nothing behind the edge may be the slower side.
cat > "$W/app.js" <<'JS'
const http = require('node:http')
const page = '<!doctype html><title>proof</title>' + '<p>'.padEnd(2200, 'x')
http.createServer((req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"status":"ok","mongo":true}') }
  if (req.url === '/login') { res.writeHead(302, { location: 'https://idp.manifest.internal/module.php/saml/idp/singleSignOnService?SAMLRequest=x' }); return res.end() }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(page)
}).listen(3000, '0.0.0.0')
JS
cat > "$W/caddy.json" <<J
{"admin":{"listen":"localhost:2019"},
 "apps":{
  "pki":{"certificate_authorities":{"local":{"install_trust":false}}},
  "tls":{"automation":{"policies":[{"subjects":["$HOST"],"issuers":[{"module":"internal"}]}]}},
  "http":{"servers":{"srv0":{"listen":[":443"],"automatic_https":{"disable_redirects":true},"routes":[
   {"match":[{"host":["$HOST"]}],"handle":[
    {"handler":"request_body","max_size":10485760},
    {"handler":"reverse_proxy","upstreams":[{"dial":"$APP:3000"}],"load_balancing":{"selection_policy":{"policy":"round_robin"}}}]}]}}}}}
J
docker network create --subnet $SUB $NET >/dev/null
docker run -d --name b-s2-m3b-app --network $NET --ip $APP --memory 512m -v "$W/app.js":/app.js:ro "$NODE_IMG" node /app.js >/dev/null
docker run -d --name b-s2-m3b-caddy --network $NET --ip $EDGE --network-alias $HOST -v "$W":/m3b:ro "$EDGE_IMG" caddy run --config /m3b/caddy.json >/dev/null
for _ in $(seq 1 30); do docker exec b-s2-m3b-caddy test -f /data/caddy/pki/authorities/local/root.crt 2>/dev/null && break; sleep 1; done
docker cp b-s2-m3b-caddy:/data/caddy/pki/authorities/local/root.crt "$W/ca.crt" >/dev/null 2>&1 || { echo "no CA from the throwaway Caddy"; exit 1; }
chmod 0644 "$W/ca.crt"
printf 'GET https://%s/\n\nGET https://%s/healthz\n\nGET https://%s/login\n\n' $HOST $HOST $HOST > "$W/targets"

# The generator's container, hardened exactly as launch/load.ts creates it (CapDrop ALL, no-new-privileges,
# read-only root, its results on a tmpfs, 256 pids, 512 MiB and no swap), waiting for each phase's command.
docker run -d --name b-s2-m3b-gen --network $NET --ip $GEN \
  --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /work:rw,size=128m,mode=1777 \
  --pids-limit 256 --memory 512m --memory-swap 512m \
  -v "$W/ca.crt":/ca.crt:ro -v "$W/targets":/targets:ro \
  "$GEN_IMG" -c 'sleep 3600' >/dev/null

echo "vegeta $VEGETA_VERSION ($GEN_IMG), edge $(docker run --rm "$EDGE_IMG" caddy version | cut -d' ' -f1), $SECS s per rate; $(date '+%H:%M:%S')"
echo "unloaded: $(docker exec b-s2-m3b-gen sh -c 'echo "GET https://'$HOST'/" | vegeta attack -rate=1/s -duration=1s -root-certs=/ca.crt -redirects=-1 -max-body=0 | vegeta report -type=text' | grep -E 'Status Codes|Latencies' | tr -s ' ' | tr '\n' ' ')"
for R in $RATES; do
  before=$(uptime | sed 's/.*load averages*: //')
  docker exec -d b-s2-m3b-gen sh -c "vegeta attack -rate=$R/s -duration=${SECS}s -timeout=10000ms -root-certs=/ca.crt -redirects=-1 -max-body=0 -targets=/targets > /work/$R.bin; touch /work/$R.done"
  sleep $((SECS / 2))
  stats=$(docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' b-s2-m3b-gen)
  appstats=$(docker stats --no-stream --format '{{.CPUPerc}}' b-s2-m3b-app)
  edgestats=$(docker stats --no-stream --format '{{.CPUPerc}}' b-s2-m3b-caddy)
  until docker exec b-s2-m3b-gen test -f /work/$R.done; do sleep 1; done
  docker exec b-s2-m3b-gen vegeta report -type=json /work/$R.bin > "$OUT/report-$R.json"
  after=$(uptime | sed 's/.*load averages*: //')
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const ms = (ns) => (ns / 1e6).toFixed(1)
    console.log(`${process.argv[2]}/s asked: achieved ${r.rate.toFixed(2)}/s, ${r.requests} requests, codes ${JSON.stringify(r.status_codes)}, p50 ${ms(r.latencies["50th"])} ms, p95 ${ms(r.latencies["95th"])} ms, p99 ${ms(r.latencies["99th"])} ms, max ${ms(r.latencies.max)} ms, errors ${r.errors.length}`)
  ' "$OUT/report-$R.json" "$R"
  echo "      mid-run: generator $stats; edge $edgestats; app $appstats — host load before [$before] after [$after]"
done
echo "done $(date '+%H:%M:%S')"
