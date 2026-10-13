#!/bin/bash
# [M2] (c) rerun, (c'), (c''), (d), (e), and the header on an edge-made 502. Throwaway only.
cd "$(dirname "$0")"
NET=a1s1-m2
IMG=node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
A=$(cat up1.id); B=$(cat up2.id); C=$(cat up3.id)
upstream() { # name id mode
  docker rm -f "$1" >/dev/null 2>&1
  docker run -d --name "$1" --network $NET --network-alias "mf-i-$2" --user node -e NAME="$2" -e MODE="$3" \
    -v "$PWD/m2-upstream.mjs:/srv/up.mjs:ro" $IMG node /srv/up.mjs >/dev/null
}
admin_upstreams() { curl -s http://127.0.0.1:7191/reverse_proxy/upstreams; echo; }

echo "== (c) rerun: kill one mid-loop, try_duration 3s, health on — $(date +%T)"
node m2-route.mjs patch $A,$B,$C; sleep 6
node m2-loop.mjs 20 50 > loop.out & LP=$!; sleep 5; docker kill a1s1-m2-up2 >/dev/null; echo "killed up2 $B at +5s"; wait $LP; cat loop.out
docker start a1s1-m2-up2 >/dev/null; sleep 8

echo "== (c') up3 answers 503 to every request but /healthz (200) — passive [502,504] — $(date +%T)"
upstream a1s1-m2-up3 $C 503; sleep 3; node m2-route.mjs patch $A,$B,$C; sleep 6
node m2-loop.mjs 15 50; admin_upstreams
echo "== (c') CONTROL: the same with 503 in the passive policy — $(date +%T)"
node m2-route.mjs patch $A,$B,$C --passive-503; sleep 6
node m2-loop.mjs 15 50; admin_upstreams
echo "== (c') up3 answers 503 to /healthz too (MODE=503-all) — passive [502,504] — $(date +%T)"
upstream a1s1-m2-up3 $C 503-all; sleep 3; node m2-route.mjs patch $A,$B,$C; sleep 8
node m2-loop.mjs 15 50; admin_upstreams
upstream a1s1-m2-up3 $C ok; sleep 3

echo "== (c'') a loop across a PATCH to three FRESH upstreams, checks on — $(date +%T)"
D=$(uuidgen | tr A-Z a-z); E=$(uuidgen | tr A-Z a-z); F=$(uuidgen | tr A-Z a-z); echo "$D $E $F" > fresh.ids
upstream a1s1-m2-up4 $D ok; upstream a1s1-m2-up5 $E ok; upstream a1s1-m2-up6 $F ok; sleep 3
for n in 4 5 6; do docker exec a1s1-m2-up$n wget -qO- http://127.0.0.1:8080/healthz >/dev/null && echo "up$n ready (private)"; done
node m2-route.mjs patch $A,$B,$C; sleep 6
SEQ=seq-c2.json node m2-loop.mjs 12 25 > loop.out & LP=$!; sleep 4; node m2-route.mjs patch $D,$E,$F; echo "PATCHed to fresh set at ~+4s $(date +%T.%N | cut -c1-12)"; wait $LP; cat loop.out
node -e '
const seq = JSON.parse(require("fs").readFileSync("seq-c2.json"));
const fresh = new Set(require("fs").readFileSync("fresh.ids","utf8").trim().split(" "));
seq.sort((a,b)=>a[0]-b[0]);
const firstNew = seq.findIndex(r => fresh.has(r[3]));
const oldAfter = seq.slice(firstNew).filter(r => !fresh.has(r[3]));
console.log(JSON.stringify({ requests: seq.length, firstNewAtMs: seq[firstNew]?.[0], oldAnswersAfterFirstNew_byStart: oldAfter.length, oldAfterDetail: oldAfter.slice(0,5) }));
const byEnd = [...seq].sort((a,b)=>a[1]-b[1]); const fe = byEnd.findIndex(r => fresh.has(r[3]));
console.log(JSON.stringify({ oldAnswersAfterFirstNew_byCompletion: byEnd.slice(fe).filter(r => !fresh.has(r[3])).length }));'
for n in 4 5 6; do echo -n "up$n probes: "; docker exec a1s1-m2-up$n wget -qO- http://127.0.0.1:8080/probes; echo; done

echo "== (d) a WebSocket held across a re-apply that removes its upstream — $(date +%T)"
node m2-route.mjs patch $D,$E,$F; sleep 3
node m2-websocket.mjs 40 > ws.out & WP=$!; sleep 4
WSUP=$(grep -m1 " tick " ws.out | awk "{print \$3}"); echo "ws landed on $WSUP"
REST=$(for i in $D $E $F; do [ "$i" != "$WSUP" ] && echo -n "$i,"; done)
node m2-route.mjs patch "$REST"; echo "PATCHed WITHOUT $WSUP at +4s"; sleep 6
node m2-route.mjs patch "$REST"; echo "and an unrelated re-apply at +10s"; sleep 10
for n in 4 5 6; do [ "$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' a1s1-m2-up$n | grep ^NAME= | cut -d= -f2)" = "$WSUP" ] && WSC=a1s1-m2-up$n; done
docker stop -t 1 $WSC >/dev/null; echo "stopped its container $WSC at +20s"
wait $WP; grep -v tick ws.out; echo "ticks: $(grep -c tick ws.out) (first $(grep -m1 tick ws.out | cut -d' ' -f1) ms, last $(grep tick ws.out | tail -1 | cut -d' ' -f1) ms)"
docker start $WSC >/dev/null; sleep 3

echo "== (e) num_requests per upstream address, for the drain — $(date +%T)"
node m2-route.mjs patch $D,$E,$F; sleep 3
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -H 'Host: m2.manifest.internal' "http://127.0.0.1:7190/slow?ms=9000" & done
sleep 2; echo "-- 6 slow requests in flight:"; admin_upstreams
node m2-route.mjs patch $D,$E; echo "-- after a PATCH removing $F (its 2 slow requests still in flight):"; admin_upstreams
sleep 9; echo "-- after they finished:"; admin_upstreams
wait

echo "== (b') the header on a response the EDGE makes (every upstream unreachable) — $(date +%T)"
node m2-route.mjs patch 00000000-0000-0000-0000-000000000000 --no-health
curl -s -D - -o body.txt -H 'Host: m2.manifest.internal' http://127.0.0.1:7190/ | tr -d '\r' | grep -i '^HTTP\|x-manifest\|content-length'; echo "body=$(head -c 80 body.txt)"
node m2-route.mjs patch 00000000-0000-0000-0000-000000000000
curl -s -D - -o body.txt -H 'Host: m2.manifest.internal' http://127.0.0.1:7190/ | tr -d '\r' | grep -i '^HTTP\|x-manifest\|content-length'; echo "body=$(head -c 80 body.txt)"
echo "== done $(date +%T)"
