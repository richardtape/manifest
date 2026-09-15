# Measured 2026-09-15 for the P4c brief. IDs, container names and release IDs below are the
# ones that existed that day — READ AND EDIT THEM before re-running. See README.md.
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${P4C_OUT:-${TMPDIR:-/tmp}/p4c-baseline}"; mkdir -p "$S"   # outputs; scripts are beside this file
CA=/Users/rich/Developer/manifest/infra/ca/manifest-root.crt
ADMIN=http://127.0.0.1:7119
HOST=p4c-probe.staging.manifest.internal
A=mf-proof-app-staging-392ff4ae-app:3000
B=mf-proof-app-staging-4b26692f-app:3000
now() { node -e 'console.log(Date.now())'; }
mark() { echo "{\"name\":\"$1\",\"t\":$(now)}" >> $S/p4c-ctl-markers.ndjson; }
route() { node -e 'const [id,host,dial]=process.argv.slice(1);console.log(JSON.stringify({"@id":id,match:[{host:[host]}],handle:[{handler:"request_body",max_size:10485760},{handler:"rate_limit",rate_limits:{[id]:{match:[{remote_ip:{ranges:["0.0.0.0/0","::/0"]}}],key:"{http.request.remote.host}",window:"1m",max_events:1000000}}},{handler:"headers",response:{set:{"X-Content-Type-Options":["nosniff"]}}},{handler:"reverse_proxy",upstreams:[{dial}]}],terminal:true}))' p4c-probe "$HOST" "$1"; }
adm() { if [ -n "${3:-}" ]; then curl -sS -m 10 -X "$1" -H 'content-type: application/json' --data-binary "$3" -o /dev/null -w '%{http_code}' "$ADMIN$2"; else curl -sS -m 10 -X "$1" -o /dev/null -w '%{http_code}' "$ADMIN$2"; fi; }
: > $S/p4c-ctl-markers.ndjson; : > $S/p4c-ctl-ka.ndjson; : > $S/p4c-ctl-nc.ndjson; rm -f $S/p4c-ctl-stop
echo "create probe route: $(adm PUT /config/apps/http/servers/srv0/routes/0 "$(route $A)")"
NODE_EXTRA_CA_CERTS=$CA node $HERE/p4c-loop.mjs "https://$HOST/healthz" $S/p4c-ctl-ka.ndjson 25 $S/p4c-ctl-stop &
L1=$!
NODE_EXTRA_CA_CERTS=$CA NEWCONN=1 node $HERE/p4c-loop.mjs "https://$HOST/healthz" $S/p4c-ctl-nc.ndjson 25 $S/p4c-ctl-stop &
L2=$!
sleep 3
mark idle-no-config-change-start; sleep 7; mark idle-no-config-change-end
sleep 1; bad=0; mark patch-dial-start
for i in $(seq 1 20); do d=$A; [ $((i % 2)) = 1 ] && d=$B; s=$(adm PATCH /id/p4c-probe/handle/3/upstreams/0/dial "\"$d\""); [ "$s" = 200 ] || bad=$((bad + 1)); sleep 0.3; done
mark patch-dial-end; echo "patch dial: admin calls not 200: $bad"
sleep 2; touch $S/p4c-ctl-stop; wait $L1; wait $L2
echo "remove probe route: $(adm DELETE /id/p4c-probe); GET it now: $(adm GET /id/p4c-probe)"
echo "--- keep-alive client (fetch):"; TAIL_MS=1000 node $HERE/p4c-summary.mjs $S/p4c-ctl-ka.ndjson $S/p4c-ctl-markers.ndjson
echo "--- a new connection per request:"; TAIL_MS=1000 node $HERE/p4c-summary.mjs $S/p4c-ctl-nc.ndjson $S/p4c-ctl-markers.ndjson
