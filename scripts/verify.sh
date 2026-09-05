#!/usr/bin/env bash
# make verify — IS THE RUNNING PLATFORM CORRECT? Needs `make up` first.
# Asserts the properties S7, S1 and S3 established, not merely that things booted.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/check.sh
. infra/lib/common.sh
# Sourced here, not by the caller: `make verify` must work on its own, and the
# LiteLLM checks need LITELLM_MASTER_KEY.
[ -f .env ] && { set -a; . ./.env; set +a; }

echo "manifest verify — $(date)"

echo
echo "DNS — the split-horizon property (S7)"

# Containers must be told the zone lives at Caddy's platform-network address.
dns_container_view() {
  local got
  # manifest-dnsmasq:local, NOT alpine + `apk add` — verify must run OFFLINE
  # (Task 13), and that image already carries dig.
  got=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
        --entrypoint dig manifest-dnsmasq:local +short "console.$ZONE" \
        2>/dev/null | tail -1)
  echo "container sees console.$ZONE = ${got:-<nothing>} (want $CADDY_IP)"
  [ "$got" = "$CADDY_IP" ]
}
check "containers resolve the zone to Caddy's platform IP"  dns_container_view

# The host must be told the same name lives on the loopback alias.
dns_host_view() {
  local got
  got=$(dig +short @127.0.0.1 -p "$PORT_DNS" "console.$ZONE" | tail -1)
  echo "host sees console.$ZONE = ${got:-<nothing>} (want $EDGE_IP)"
  [ "$got" = "$EDGE_IP" ]
}
check "the host resolves the zone to the loopback alias"  dns_host_view

# THE NEGATIVE CONTROL that cost S7 the most time. Without --local, dnsmasq does
# not answer AAAA authoritatively, and both musl and glibc treat a hard error on
# either half of a dual-stack lookup as total failure. The symptom is
# "curl: could not resolve host" WHILE dig returns the correct A record.
#
# MEASURED 2026-09-05 on dnsmasq 2.91 / alpine 3.22.5: removing --local gives
# REFUSED, not SERVFAIL as S7 recorded. Assert NOERROR rather than listing the
# failure codes — the exact code varies and only NOERROR is correct.
dns_aaaa_is_nodata() {
  local st
  st=$(dig AAAA @127.0.0.1 -p "$PORT_DNS" "console.$ZONE" | awk -F'status: ' '/status:/{split($2,a,","); print a[1]}')
  echo "AAAA status = ${st:-<none>} (want NOERROR, i.e. NODATA; anything else means --local is missing)"
  [ "$st" = "NOERROR" ]
}
check "AAAA returns NODATA, not SERVFAIL"  dns_aaaa_is_nodata

# Without --server=127.0.0.11, --no-resolv makes dnsmasq authoritative for the
# whole namespace and containers lose Docker service names AND external names.
dns_forwards_non_zone() {
  local got
  got=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
        --entrypoint dig manifest-dnsmasq:local +short manifest-dns-host \
        2>/dev/null | tail -1)
  echo "Docker service name manifest-dns-host = ${got:-<nothing>} (want $DNS_H_IP)"
  [ "$got" = "$DNS_H_IP" ]
}
check "non-zone queries still reach Docker's resolver"  dns_forwards_non_zone

echo
echo "Edge — the custom Caddy build (§20)"

caddy_has_modules() {
  local mods
  mods=$(docker exec manifest-caddy caddy list-modules 2>/dev/null | grep -E '^http\.handlers\.(rate_limit|waf)$' | sort | tr '\n' ' ')
  echo "modules: ${mods:-<none>} (want http.handlers.rate_limit http.handlers.waf)"
  [ "$(echo "$mods" | wc -w | tr -d ' ')" = "2" ]
}
check "Caddy carries the rate-limit and Coraza modules"  caddy_has_modules

caddy_version_pinned() {
  local v; v=$(docker exec manifest-caddy caddy version 2>/dev/null | awk '{print $1}')
  echo "caddy $v (Coraza v2.6.0 requires exactly v2.11.4)"
  [ "$v" = "v2.11.4" ]
}
check "Caddy is pinned to v2.11.4"  caddy_version_pinned

# GUARD, and it is load-bearing. `docker run -v $PWD/$CA_FILE:/ca.crt` with the
# CA absent makes Docker CREATE infra/ca/manifest-root.crt as a DIRECTORY — the
# exact path `make seed` must later write the root to. `docker cp` would then put
# the certificate INSIDE it, and both `--cacert` and `security add-trusted-cert`
# fail on a directory. Every check that mounts the CA calls this first.
require_ca() {
  [ -f "$CA_FILE" ] && return 0
  echo "$CA_FILE is not a file — run \`make seed\` to mint it. Not mounting it: Docker would create a directory there."
  return 1
}

# The container half of the parity property. The host half is Task 5.
edge_serves_container_side() {
  require_ca || return 1
  local out
  out=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
        -v "$PWD/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
        --cacert /ca.crt -sS "https://console.$ZONE/" 2>&1)
  echo "$out"
  echo "$out" | grep -q "host=console.$ZONE"
}
check "a container reaches https://console.$ZONE with the platform CA"  edge_serves_container_side

echo
echo "Postgres — one server, three databases (§21)"

pg_has_three_databases() {
  local got want="litellm manifest_control manifest_idp"
  got=$(docker exec manifest-postgres psql -U manifest -d postgres -tAc \
        "SELECT datname FROM pg_database WHERE datname IN ('manifest_control','litellm','manifest_idp') ORDER BY datname" \
        2>&1 | tr '\n' ' ' | sed 's/ *$//')
  echo "found: ${got:-<none>} (want $want)"
  [ "$got" = "$want" ]
}
check "manifest_control, litellm and manifest_idp all exist"  pg_has_three_databases

pg_reachable_from_host() {
  # §21: the control plane is a HOST process and connects over the published port.
  nc -z 127.0.0.1 "$PORT_POSTGRES" && echo "127.0.0.1:$PORT_POSTGRES accepting connections"
}
check "Postgres is reachable from the host on $PORT_POSTGRES"  pg_reachable_from_host

echo
echo "Supply chain (§12)"

registry_from_host() {
  # NOT localhost: it resolves to ::1 and times out (S1, §12).
  local code; code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_REGISTRY/v2/")
  echo "http://127.0.0.1:$PORT_REGISTRY/v2/ -> $code"
  [ "$code" = "200" ]
}
check "the registry answers on the host's published port"  registry_from_host

verdaccio_from_host() {
  local code; code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_VERDACCIO/-/ping")
  echo "http://127.0.0.1:$PORT_VERDACCIO/-/ping -> $code"
  [ "$code" = "200" ]
}
check "Verdaccio answers on the host's published port"  verdaccio_from_host

# Dual-homed: the same two services must ALSO be reachable from the internal
# network, which is the only network the builder will be on.
reachable_from_internal() {
  docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
    -sS -o /dev/null -w 'registry=%{http_code} ' http://manifest-registry:5000/v2/ &&
  docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
    -sS -o /dev/null -w 'mirror=%{http_code}\n' http://manifest-verdaccio:4873/-/ping
}
check "registry and mirror are reachable from the internal build network"  reachable_from_internal

# NEGATIVE CONTROL. The internal network must actually deny egress, or the
# "network-restricted builder" in §20's control map is a claim, not a control.
#
# THREE THINGS THIS ASSERTS, and it needs all three. A bare `rc != 0` is NOT a
# control: when manifest-build-internal did not yet exist, `docker run` failed
# with 125 and the check reported a green "egress correctly denied". Measured
# 2026-09-05. So:
#   1. the network must exist        — else there is nothing under test;
#   2. the failure must be CURL's, not Docker's — exit 125/126/127 mean the
#      container never ran, which tells us nothing about egress;
#   3. the same request on the PLATFORM network must succeed — the positive half,
#      which proves the request is well formed and the internet is reachable, so
#      the denial is attributable to the network and not to a broken URL.
# (3) is skipped with no host network, because Task 13 runs this offline.
internal_network_denies_egress() {
  docker network inspect "$NET_BUILD" >/dev/null 2>&1 \
    || { echo "$NET_BUILD does not exist — nothing is under test"; return 1; }

  # Judge by curl's EXIT CODE, not by grepping the output: the failure message
  # itself contains the word "registry", which a naive grep would match.
  local out rc
  out=$(docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
        -sS -m 6 -o /dev/null https://registry.npmjs.org/ 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "REACHED npmjs from $NET_BUILD — egress is NOT restricted"; return 1
  fi
  if [ "$rc" -ge 125 ]; then
    echo "docker itself failed (exit $rc), so egress was never exercised: ${out:0:90}"
    return 1
  fi

  if curl -sf -m 5 https://registry.npmjs.org/ >/dev/null 2>&1; then
    local prc
    docker run --rm --network "$NET" curlimages/curl:8.11.1 \
      -sS -m 10 -o /dev/null https://registry.npmjs.org/ >/dev/null 2>&1; prc=$?
    if [ "$prc" -ne 0 ]; then
      echo "positive half FAILED: the same request also fails on $NET (exit $prc), so the denial proves nothing"
      return 1
    fi
    echo "curl exited $rc on $NET_BUILD and 0 on $NET — the network is the difference"
    return 0
  fi
  echo "curl exited $rc on $NET_BUILD (a curl-level failure, not docker's); positive half skipped, host is offline"
}
check "NEGATIVE CONTROL: the internal network cannot reach the public internet"  internal_network_denies_egress

egress_proxy_denies_by_default() {
  # %{http_code} is the WRONG variable here. For an https:// URL through a proxy
  # the request is a CONNECT tunnel; when the proxy refuses it, the tunnelled
  # response never happens and %{http_code} is 000 while the proxy plainly
  # answered 403. %{http_connect} carries the CONNECT's own status. Measured
  # 2026-09-05: http_code=000, http_connect=403, curl exit 56.
  local denied allowed
  denied=$(curl -sS -o /dev/null -w '%{http_connect}' -x "http://127.0.0.1:$PORT_EGRESS" \
           -m 8 https://example.com/ 2>/dev/null)
  # POSITIVE HALF. A proxy that refused EVERYTHING would pass a deny-only test
  # while being useless, so assert an allowlisted destination still gets through.
  # The proxy resolves manifest-registry itself; the host cannot.
  allowed=$(curl -sS -o /dev/null -w '%{http_code}' -x "http://127.0.0.1:$PORT_EGRESS" \
            -m 8 http://manifest-registry:5000/v2/ 2>/dev/null)
  echo "example.com -> CONNECT $denied (want 403, D18); allowlisted registry -> $allowed (want 200)"
  [ "$denied" = "403" ] && [ "$allowed" = "200" ]
}
check "the egress proxy denies an undeclared destination, and allows a declared one"  egress_proxy_denies_by_default

# The egress proxy must SURVIVE denying. Without DefaultErrorFile, tinyproxy
# 1.11.0 exits after serving a 403 and `restart: unless-stopped` puts it back —
# so the 403 above is correct while the proxy is briefly down behind it, and an
# allowed request racing the restart gets "Empty reply from server". Measured
# 2026-09-05. Compare the restart count ACROSS a denial rather than asserting it
# is zero, so an unrelated earlier restart does not fail this.
egress_proxy_survives_denial() {
  local before after
  before=$(docker inspect manifest-egress --format '{{.RestartCount}}' 2>/dev/null)
  curl -sS -o /dev/null -x "http://127.0.0.1:$PORT_EGRESS" -m 8 https://example.com/ >/dev/null 2>&1
  sleep 3
  after=$(docker inspect manifest-egress --format '{{.RestartCount}}' 2>/dev/null)
  echo "restart count $before -> $after across one denial (want no change)"
  [ -n "$before" ] && [ "$before" = "$after" ]
}
check "the egress proxy survives denying a request"  egress_proxy_survives_denial

summary
