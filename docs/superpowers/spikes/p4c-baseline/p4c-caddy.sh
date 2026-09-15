# Measured 2026-09-15 for the P4c brief. IDs, container names and release IDs below are the
# ones that existed that day — READ AND EDIT THEM before re-running. See README.md.
# Can Caddy move a route between upstreams with no gap? Three mechanisms, 20 moves each,
# under a request loop every 25 ms, on a THROWAWAY route that is removed at the end.
HERE="$(cd "$(dirname "$0")" && pwd)"
S="${P4C_OUT:-${TMPDIR:-/tmp}/p4c-baseline}"; mkdir -p "$S"   # outputs; scripts are beside this file
CA=/Users/rich/Developer/manifest/infra/ca/manifest-root.crt
ADMIN=http://127.0.0.1:7119
HOST=p4c-probe.staging.manifest.internal
A=mf-proof-app-staging-392ff4ae-app:3000
B=mf-proof-app-staging-4b26692f-app:3000
now() { node -e 'console.log(Date.now())'; }
mark() { echo "{\"name\":\"$1\",\"t\":$(now)}" >> $S/p4c-caddy-markers.ndjson; }
route() { node -e 'const [id,host,dial]=process.argv.slice(1);console.log(JSON.stringify({"@id":id,match:[{host:[host]}],handle:[{handler:"request_body",max_size:10485760},{handler:"rate_limit",rate_limits:{[id]:{match:[{remote_ip:{ranges:["0.0.0.0/0","::/0"]}}],key:"{http.request.remote.host}",window:"1m",max_events:1000000}}},{handler:"headers",response:{set:{"X-Content-Type-Options":["nosniff"]}}},{handler:"reverse_proxy",upstreams:[{dial}]}],terminal:true}))' p4c-probe "$HOST" "$1"; }
adm() { if [ -n "${3:-}" ]; then curl -sS -m 10 -X "$1" -H 'content-type: application/json' --data-binary "$3" -o /dev/null -w '%{http_code}' "$ADMIN$2"; else curl -sS -m 10 -X "$1" -o /dev/null -w '%{http_code}' "$ADMIN$2"; fi; }
: > $S/p4c-caddy-markers.ndjson; : > $S/p4c-caddy-loop.ndjson; rm -f $S/p4c-caddy-stop
RA="$(route $A)"; RB="$(route $B)"
echo "create probe route: $(adm PUT /config/apps/http/servers/srv0/routes/0 "$RA")"
NODE_EXTRA_CA_CERTS=$CA node $HERE/p4c-loop.mjs "https://$HOST/healthz" $S/p4c-caddy-loop.ndjson 25 $S/p4c-caddy-stop &
LOOP=$!
sleep 3
echo "first requests: $(head -3 $S/p4c-caddy-loop.ndjson | tr '\n' ' ')"
bad=0; mark delete-then-put-start
for i in $(seq 1 20); do R="$RA"; [ $((i % 2)) = 1 ] && R="$RB"; s1=$(adm DELETE /id/p4c-probe); s2=$(adm PUT /config/apps/http/servers/srv0/routes/0 "$R"); [ "$s1$s2" = 200200 ] || bad=$((bad + 1)); sleep 0.3; done
mark delete-then-put-end; echo "delete-then-put: admin calls not 200: $bad"
sleep 2; bad=0; mark patch-route-start
for i in $(seq 1 20); do R="$RA"; [ $((i % 2)) = 1 ] && R="$RB"; s=$(adm PATCH /id/p4c-probe "$R"); [ "$s" = 200 ] || bad=$((bad + 1)); sleep 0.3; done
mark patch-route-end; echo "patch whole route: admin calls not 200: $bad"
sleep 2; bad=0; mark patch-dial-start
for i in $(seq 1 20); do d=$A; [ $((i % 2)) = 1 ] && d=$B; s=$(adm PATCH /id/p4c-probe/handle/3/upstreams/0/dial "\"$d\""); [ "$s" = 200 ] || bad=$((bad + 1)); sleep 0.3; done
mark patch-dial-end; echo "patch dial only: admin calls not 200: $bad"
sleep 2; touch $S/p4c-caddy-stop; wait $LOOP
echo "dial after the last patch: $(curl -sS -m 5 $ADMIN/id/p4c-probe | grep -o '"dial":"[^"]*"')"
echo "remove probe route: $(adm DELETE /id/p4c-probe); GET it now: $(adm GET /id/p4c-probe)"
echo "proof-app route untouched: $(curl -sS -m 5 $ADMIN/id/mf-proof-app-staging-manifest-internal | grep -o '"dial":"[^"]*"')"
echo "--- summary (window tail 1 s):"
TAIL_MS=1000 node $HERE/p4c-summary.mjs $S/p4c-caddy-loop.ndjson $S/p4c-caddy-markers.ndjson
