#!/usr/bin/env bash
# B sitting 1, [M4]: a rate limit that skips one address, in a THROWAWAY Caddy from the edge's own image
# (manifest-caddy:local) on its own network. Never touches the running edge. Everything removed on exit.
set -u
NET=b-s1-m4-net; SUB=10.99.4.0/24; EDGE=10.99.4.10; EXEMPT=10.99.4.21
EDGE_IMG=$(docker inspect manifest-caddy --format '{{.Image}}')
CURL=curlimages/curl:8.11.1
HOST=m4.throwaway.internal
W=$(mktemp -d)
cleanup() { docker rm -f -v b-s1-m4-caddy >/dev/null 2>&1; docker network rm $NET >/dev/null 2>&1; rm -rf "$W"; }
trap cleanup EXIT

zone_match() { # $1 = '' (today's) or an address/range to exclude
  if [ -z "$1" ]; then echo '[{"remote_ip":{"ranges":["0.0.0.0/0","::/0"]}}]'
  else echo '[{"remote_ip":{"ranges":["0.0.0.0/0","::/0"]},"not":[{"remote_ip":{"ranges":["'"$1"'"]}}]}]'; fi
}
route() { # the route's shape as routing/caddy.ts buildRoute writes it (headers omitted), its zone's match from $1
  cat <<J
{"@id":"m4-route","match":[{"host":["$HOST"]}],"handle":[
 {"handler":"request_body","max_size":10485760},
 {"handler":"rate_limit","rate_limits":{"m4-route":{"match":$(zone_match "$1"),"key":"{http.request.remote.host}","window":"1m","max_events":600}}},
 {"handler":"reverse_proxy","upstreams":[{"dial":"127.0.0.1:8081"}],"load_balancing":{"selection_policy":{"policy":"round_robin"}}}]}
J
}
cat > "$W/caddy.json" <<J
{"admin":{"listen":"0.0.0.0:2019","origins":["$EDGE:2019"]},
 "apps":{"http":{"servers":{
  "srv0":{"listen":[":80"],"automatic_https":{"disable":true},"routes":[$(route '')]},
  "up":{"listen":["127.0.0.1:8081"],"routes":[{"handle":[{"handler":"static_response","status_code":200,"body":"ok"}]}]}}}}}
J
docker network create --subnet $SUB $NET >/dev/null
docker run -d --name b-s1-m4-caddy --network $NET --ip $EDGE -v "$W":/m4:ro "$EDGE_IMG" caddy run --config /m4/caddy.json >/dev/null
sleep 2; docker logs b-s1-m4-caddy 2>&1 | grep -i 'error' | head -3
send() { # $1 client ip, $2 count → "<n> <code>" lines
  docker run --rm --network $NET --ip "$1" $CURL -s -o /dev/null -H "Host: $HOST" -w '%{http_code}\n' "http://$EDGE/p[1-$2]" | sort | uniq -c | tr '\n' ' '; echo
}
patch() { # $1 = exclusion ('' clears); prints the admin API's status and body
  route "$1" > "$W/route.json"
  docker run --rm --network $NET -v "$W":/m4:ro $CURL -s -o /dev/stderr -w 'PATCH %{http_code}\n' -X PATCH -H 'Content-Type: application/json' --data @/m4/route.json "http://$EDGE:2019/id/m4-route" 2>&1 | tr '\n' ' '; echo
}
echo "edge image: $EDGE_IMG ($(docker run --rm "$EDGE_IMG" caddy version | cut -d' ' -f1))"
echo "== T1 today's route (zone match every address): client .22 sends 700 in a minute"; send 10.99.4.22 700
echo "== T2 the zone's match excluding $EXEMPT/32 (PATCH /id/m4-route)"; patch "$EXEMPT/32"
echo "-- the exempt client $EXEMPT sends 1300:"; send $EXEMPT 1300
echo "-- another client .23 sends 700:"; send 10.99.4.23 700
echo "-- the zone as Caddy now holds it:"; docker run --rm --network $NET $CURL -s "http://$EDGE:2019/id/m4-route/handle/1/rate_limits/m4-route/match"; echo
echo "== T3 counters across a PATCH of an IDENTICAL route: client .24 sends 400, PATCH (same), sends 400"
send 10.99.4.24 400; patch "$EXEMPT/32"; send 10.99.4.24 400
echo "== T4 counters across a PATCH that CHANGES the zone (exemption cleared): client .25 sends 400, PATCH (cleared), sends 400"
send 10.99.4.25 400; patch ""; send 10.99.4.25 400
echo "-- after the clear, the formerly exempt client $EXEMPT sends 700 (limited again?):"; send $EXEMPT 700
echo "== T5 the exemption given as a bare address (no /32): accepted?"; patch "$EXEMPT"
echo "-- $EXEMPT (already 700 in this window) sends 100 more:"; send $EXEMPT 100
echo "== T6 Task 3's negative control: the exemption set to 0.0.0.0/0"; patch "0.0.0.0/0"
echo "-- client .26 sends 700:"; send 10.99.4.26 700
echo "-- client .22 (limited in T1, same window) sends 100:"; send 10.99.4.22 100
echo "== T7 an invalid exemption (not an address): what the admin API answers"; patch "not-an-address"
echo "-- still serving? client .27 sends 5:"; send 10.99.4.27 5
echo "== caddy's error lines:"; docker logs b-s1-m4-caddy 2>&1 | grep -ci '"level":"error"'
