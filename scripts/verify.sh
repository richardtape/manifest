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
        --cacert /ca.crt -sS "https://$EDGE_PROBE_HOST/" 2>&1)
  echo "$out"
  echo "$out" | grep -q "host=$EDGE_PROBE_HOST"
}
check "a container reaches https://$EDGE_PROBE_HOST with the platform CA"  edge_serves_container_side

# ---------------------------------------------------------------------------
# §12's TWO LISTENERS (P6a, R3). Until this plan both were `srv0` and the split was
# modelled rather than enforced — §21's honest divergence 2. These three checks are
# the first thing on this machine that could ever have caught a route bound to the
# wrong listener.
#
# THEY ASSERT THE SHAPE OF THE ANSWER, NOT A STATUS. The edge's wildcard answers 200
# for any name in the zone, so `200` proves nothing; the placeholder's own `listener=`
# word is the only thing that distinguishes the two servers from outside.
# ---------------------------------------------------------------------------

# 1. The edge has two servers, and they are the ones config.ts names.
check_two_servers() {
  local keys; keys="$(curl -sS "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers" | jq -r 'keys|join(",")')"
  [ "$keys" = "srv0,srv1" ] || { echo "the edge has servers [$keys], want srv0,srv1"; return 1; }
  echo "servers=$keys"
}
check "the edge serves two listeners, internal and public"  check_two_servers

# 2. The public address answers a PRODUCTION name, and says which listener it is.
#
#    NOT $EDGE_PROBE_HOST. That name has its own site on srv0 (see common.sh), so it is
#    pinned to the internal listener and cannot stand for a production hostname.
#    $PUBLIC_PROBE_HOST is named by no site, so only a wildcard can answer it.
#
#    IT ALSO HOLDS THE TWO HALVES OF DECISION 15 EQUAL (P6a Task 4). The split is by
#    ADDRESS from the host and by PORT from a container: a production app's readiness
#    probe runs inside one, where both servers sit at the edge's single address, so it
#    reaches srv1 by naming `MANIFEST_EDGE_PUBLIC_PORT`. That default and the
#    CONTAINER-SIDE half of compose's `127.0.0.3:443:8443` are one number in two files.
#    Disagree, and every production deploy's probe reads the INTERNAL server, finds no
#    route, and rolls back after fifteen seconds with a message about the wildcard —
#    which names neither file. Two files that must agree get a check, not trust.
check_public_listener() {
  require_ca || return 1
  local cfg_port compose_port
  cfg_port="$(sed -n 's/.*MANIFEST_EDGE_PUBLIC_PORT: z\.coerce\.number()\.int()\.positive()\.default(\([0-9]*\)).*/\1/p' packages/control-plane/src/config.ts)"
  compose_port="$(sed -n 's/^[[:space:]]*-[[:space:]]*"'"$PUBLIC_EDGE_IP"':443:\([0-9]*\)".*/\1/p' infra/compose.yaml)"
  # Emptiness is its own failure: a `sed` that matched nothing would otherwise compare
  # '' with '' and pass. Both are asserted non-empty before they are compared.
  [ -n "$cfg_port" ] || { echo "config.ts states no MANIFEST_EDGE_PUBLIC_PORT default"; return 1; }
  [ -n "$compose_port" ] || { echo "compose.yaml publishes nothing on $PUBLIC_EDGE_IP:443"; return 1; }
  [ "$cfg_port" = "$compose_port" ] || {
    echo "the public listener's port disagrees: config.ts=$cfg_port compose.yaml=$compose_port"
    return 1
  }
  local body; body="$(curl -sS --cacert "$CA_FILE" --resolve "$PUBLIC_PROBE_HOST:443:$PUBLIC_EDGE_IP" "https://$PUBLIC_PROBE_HOST/" 2>&1)"
  case "$body" in *listener=public*) echo "$body  (probe port $cfg_port = compose $compose_port)"; return 0 ;; esac
  echo "the public address answered: $body"; return 1
}
check "the public listener answers a production name on $PUBLIC_EDGE_IP"  check_public_listener

# 3. THE ONE THAT WOULD CATCH A LEAK, and §12's claim stated as a measurement: a route
#    bound to the wrong listener is SIMPLY UNREACHABLE. Neither cross-probe may produce a
#    `listener=` body at all — a production name must not be served on the internal
#    address, and a staging name must not be served on the public one.
#
#    ASSERTING "not answered AT ALL" RATHER THAN "not answered by the other server" is
#    deliberate and it is what makes this able to fail. An earlier draft probed
#    $EDGE_PROBE_HOST on the internal address and tested only for `listener=public`;
#    because that name has its OWN srv0 site, moving the production wildcard back onto
#    srv0 — the very leak this check exists for — left it answering `listener=internal`
#    from its explicit site, and the check stayed GREEN through the defect.
#
#    WHAT "UNREACHABLE" ACTUALLY LOOKS LIKE IS `200` WITH AN EMPTY BODY — measured here
#    in sitting 2, and it is NOT what P6a sitting 1's F3 predicted. F3 expected a TLS
#    handshake failure, having measured `foo.notazone.test`; but Caddy's certificate cache
#    is APP-GLOBAL, not per-server, so the `*.manifest.internal` certificate that srv1's
#    site causes to be issued is presented by srv0 as well. The handshake therefore
#    SUCCEEDS, srv0 matches no site for that Host, and Caddy answers an empty 200. Only a
#    name no certificate in the whole config covers gets the `(35) tlsv1 alert` F3 saw.
#
#    SO A STATUS ASSERTION HERE WOULD BE GREEN ON THE LEAK AND GREEN OFF IT: `200` is the
#    answer in both directions. The `listener=` word is the only discriminator, which is
#    why this check reads the body and nothing else.
#
#    `--resolve`, not `--connect-to`: the Host header must stay the hostname or the wrong
#    site matches, and `--resolve` is what the rest of this file already uses.
check_no_crossover() {
  require_ca || return 1
  local prod_internal stg_public
  prod_internal="$(curl -sS --cacert "$CA_FILE" --resolve "$PUBLIC_PROBE_HOST:443:$EDGE_IP" "https://$PUBLIC_PROBE_HOST/" 2>&1 || true)"
  stg_public="$(curl -sS --cacert "$CA_FILE" --resolve "x.staging.$ZONE:443:$PUBLIC_EDGE_IP" "https://x.staging.$ZONE/" 2>&1 || true)"
  case "$prod_internal" in
    *listener=*) echo "a production name IS served on the internal address: $prod_internal"; return 1 ;;
  esac
  case "$stg_public" in
    *listener=*) echo "a staging name IS served on the public address: $stg_public"; return 1 ;;
  esac
  # An empty line under each is the CORRECT answer: 200 with no body, because no site on
  # that server matched the Host. Printed rather than summarised so a reader can see that
  # nothing was served, instead of taking this function's word for it.
  echo "no crossover — neither name is served by the other's listener (empty = no site matched):"
  echo "    production on $EDGE_IP:        '$prod_internal'"
  echo "    staging on $PUBLIC_EDGE_IP:    '$stg_public'"
}
check "neither listener answers for the other's zone"  check_no_crossover

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

# STRONGER than "answers 200", which is what this asserted before P3 Task 9: a
# registry that still answers 200 anonymously has no auth at all (§13).
# NOT localhost: it resolves to ::1 and times out (S1, §12).
registry_requires_a_token() {
  local out
  out=$(curl -sS -i -m 6 "http://127.0.0.1:$PORT_REGISTRY/v2/" | tr -d '\r')
  echo "$out" | head -1
  echo "$out" | grep -qi '^HTTP/1.1 401' &&
  echo "$out" | grep -qi '^Www-Authenticate: Bearer realm='
}
check "the registry refuses an anonymous request and advertises its realm"  registry_requires_a_token

# The other half: a SCOPED token is accepted. A registry that refused everything
# would pass the check above while being useless.
registry_accepts_a_scoped_token() {
  local token code
  token=$(node infra/seed/mint-token.mjs base/node)
  code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" \
         "http://127.0.0.1:$PORT_REGISTRY/v2/base/node/tags/list")
  echo "scoped token -> $code (want 200)"
  [ "$code" = "200" ]
}
check "the registry accepts a correctly scoped token"  registry_accepts_a_scoped_token

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
  # 401 from P3 Task 9 onwards, and it proves exactly what this half is for: the
  # request REACHED the registry through the proxy. The registry's own token auth
  # is a different control, checked above. Accepting only 200 here would turn a
  # supply-chain control into a false failure of an egress control.
  echo "example.com -> CONNECT $denied (want 403, D18); allowlisted registry -> $allowed (want 200 or 401)"
  [ "$denied" = "403" ] && { [ "$allowed" = "200" ] || [ "$allowed" = "401" ]; }
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

echo
echo "Builder (§12, S1)"

# THESE FOUR CHECKS WERE DEAD, and had been since P3 Task 10. They were wrapped in
# `if docker inspect manifest-buildkitd`, a compose service behind the `build`
# profile that nothing ever starts — so `make verify` skipped them silently and
# reported a clean run. That is the could-not-fail shape this project keeps paying
# for, and it survived four sessions.
#
# The resolution is NOT to start that container. P3 replaced it with ephemeral
# `mf-builder-*` containers created per build, and a second, permanently-running
# definition of the builder is a thing that can drift from the real one while
# verify happily asserts the wrong object's properties. `infra/compose.yaml`'s
# `builder` service is deleted for that reason.
#
# So the split is: `make verify` asserts the TOPOLOGY the builder sits in, which is
# infrastructure and is exactly what this script is for and what S1 left open.
# The builder's OWN properties — rootless, non-privileged, rootlesskit supervising,
# no egress, mirror reachable — are asserted in
# `packages/control-plane/src/runtime/docker/builder.docker.test.ts`, against the
# container the DRIVER creates, which is the only builder that runs in anger.

# S1 left this open: "Does --internal survive a Docker Desktop restart with the
# same semantics? Not tested." Answering it once is worth very little — Docker
# Desktop upgrades and the answer ages. Asserting it every run converts a
# regression from "a builder that quietly has egress" into a failed check.
internal_network_still_denies() {
  local rc
  docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
    -sS -m 6 -o /dev/null https://registry.npmjs.org/ >/dev/null 2>&1; rc=$?
  echo "curl to npmjs from $NET_BUILD exited $rc (want non-zero)"
  [ "$rc" -ne 0 ]
}
check "NEGATIVE CONTROL: --internal still denies egress after any Docker restart" \
  internal_network_still_denies

# The positive half is already above ("registry and mirror are reachable from the
# internal build network"). Without it, the denial would also pass on a network
# with no connectivity at all.
report "builder properties" echo \
  "rootless, non-privileged, rootlesskit, no egress, mirror reachable: asserted in
          builder.docker.test.ts against the container the driver creates
          (pnpm test:docker). Not duplicated here — a second definition drifts."

echo
echo "AI (§10, S3)"

litellm_ready() {
  local out; out=$(curl -sS "http://127.0.0.1:$PORT_LITELLM/health/readiness")
  echo "$out"
  echo "$out" | grep -q '"db":"connected"'
}
check "LiteLLM is up with its database connected"  litellm_ready

litellm_logical_names_only() {
  local got
  got=$(curl -sS "http://127.0.0.1:$PORT_LITELLM/v1/models" -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
        | sed 's/.*"data"://' | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | sort | tr '\n' ' ')
  echo "catalogue: $got"
  echo "$got" | grep -q 'default-chat' && echo "$got" | grep -q 'default-embed' \
    && ! echo "$got" | grep -q 'ollama'
}
check "only logical model names are exposed (§7)"  litellm_logical_names_only

# THE CHECK THAT CATCHES A THINKING MODEL. A completion alone would pass; only a
# STREAM with non-empty content proves the console will work (S3).
litellm_streams_content() {
  local n
  n=$(curl -sS -N "http://127.0.0.1:$PORT_LITELLM/v1/chat/completions" \
       -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H 'Content-Type: application/json' \
       -d '{"model":"default-chat","stream":true,"max_tokens":300,
            "messages":[{"role":"user","content":"Count 1 to 5, digits only."}]}' \
       | grep -c '"content":"[^"]')
  echo "$n streamed frames carried content (0 means default-chat is a THINKING model)"
  [ "$n" -gt 0 ]
}
check "a streamed completion returns non-empty content"  litellm_streams_content

# THE CHECK THAT CATCHES THE SILENT EMBEDDING CORRUPTION. Asserts the DIMENSION,
# not that a vector came back — 192 near-zero values look like success (S3).
litellm_embedding_dimension() {
  local d
  d=$(curl -sS "http://127.0.0.1:$PORT_LITELLM/v1/embeddings" \
       -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H 'Content-Type: application/json' \
       -d '{"model":"default-embed","input":"chemistry lab scheduling","encoding_format":"float"}' \
       | grep -o '\[[-0-9].*\]' | tr ',' '\n' | wc -l | tr -d ' ')
  echo "embedding dimension = $d (want 768 for nomic-embed-text)"
  [ "$d" = "768" ]
}
check "an embedding comes back at full dimension"  litellm_embedding_dimension

# THE TABLE MUST EXIST AND HOLD ROWS, or this proves nothing. As written without
# those two guards it PASSED with LiteLLM not even running: psql errored, $n was
# empty, and ${n:-0} made "0 rows carry prompt content" trivially true. Measured
# 2026-09-05. The checks above have already driven a completion and an embedding
# through the proxy, so by here there is something to inspect.
#
# BUT WAIT FOR IT. LiteLLM writes spend logs ASYNCHRONOUSLY, on a batch timer
# (proxy_batch_write_at, 10s by default), so against a freshly-initialised
# database the rows are not there yet when these checks run and both of them
# fail with "nothing is under test". That is a flake on exactly the path the
# RUNBOOK tells a new developer to take — `make up && make doctor && make
# verify` right after `make reset` or a first `make seed`. Poll, bounded.
wait_for_spend_rows() {
  local i n
  for i in $(seq 1 40); do
    n=$(docker exec manifest-postgres psql -U manifest -d litellm -tAc \
        'SELECT count(*) FROM "LiteLLM_SpendLogs"' 2>/dev/null | tr -d ' ')
    [ -n "$n" ] && [ "$n" -gt 0 ] 2>/dev/null && { echo "$n"; return 0; }
    sleep 1
  done
  echo 0; return 1
}

litellm_prompt_logging_off() {
  local exists total n
  exists=$(docker exec manifest-postgres psql -U manifest -d litellm -tAc \
           "SELECT to_regclass('public.\"LiteLLM_SpendLogs\"') IS NOT NULL" 2>/dev/null | tr -d ' ')
  [ "$exists" = "t" ] || { echo "LiteLLM_SpendLogs does not exist — nothing is under test"; return 1; }
  total=$(wait_for_spend_rows) \
    || { echo "no spend rows after 40s — nothing is under test (LiteLLM batches these writes)"; return 1; }
  n=$(docker exec manifest-postgres psql -U manifest -d litellm -tAc \
      "SELECT count(*) FROM \"LiteLLM_SpendLogs\" WHERE proxy_server_request::text NOT IN ('{}','null')" 2>/dev/null | tr -d ' ')
  echo "$n of $total spend rows carry request content (want 0 — §7's retention decision)"
  [ "${n:-1}" = "0" ]
}
check "no prompt content is persisted"  litellm_prompt_logging_off

# S3's FIRST finding, asserted rather than assumed. Ollama is free, so without a
# synthetic per-token cost every spend row reads $0.00 — no budget in §10 is ever
# reachable and D8's per-user attribution is untestable. Nothing else in this
# plan notices if the cost lines are dropped from litellm/config.yaml.
litellm_spend_is_attributed() {
  local mx
  wait_for_spend_rows >/dev/null || { echo "no spend rows after 40s — nothing is under test"; return 1; }
  mx=$(docker exec manifest-postgres psql -U manifest -d litellm -tAc \
       'SELECT COALESCE(max(spend),0) FROM "LiteLLM_SpendLogs"' 2>/dev/null | tr -d ' ')
  echo "highest recorded spend = ${mx:-<none>} (want > 0; \$0.00 means the synthetic cost is missing)"
  awk -v v="${mx:-0}" 'BEGIN{exit !(v+0 > 0)}'
}
check "spend is actually attributed, not \$0.00 (S3)"  litellm_spend_is_attributed

echo
echo "Identity (§9, S2)"

# FOLLOW THE REDIRECT. SimpleSAMLphp 2.x answers `/` with 303 (not the 302 this
# check originally allowed) and sends you to /module.php/core/welcome. Asserting
# only the first status is how a BROKEN IdP reads as healthy: with a partial
# config.php the 303 was still correct while its destination returned 500
# ("Missing cachedir parameter"). Measured 2026-09-05. Assert the destination.
idp_serves() {
  local first final
  first=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_IDP/")
  final=$(curl -sSL -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT_IDP/")
  echo "http://127.0.0.1:$PORT_IDP/ -> $first, and after redirects -> $final (want 200)"
  [ "$final" = "200" ]
}
check "the Manifest IdP serves, and its redirect target works"  idp_serves

idp_has_pdo_pgsql() {
  local out; out=$(docker exec manifest-idp php -m 2>/dev/null | grep -c '^pdo_pgsql$')
  echo "pdo_pgsql loaded: $out (needs libpq-dev at build time — S2)"
  [ "$out" = "1" ]
}
check "the IdP image has pdo_pgsql"  idp_has_pdo_pgsql

# The SQL metadata source is the mechanism S2 proved and P4 is built on: one
# INSERT registers an SP on the NEXT request — no reload, no restart, no cache
# TTL. ASSERT THE ROUND TRIP, not that a table exists. P1 first created
# saml20_sp_remote with 1.x's (entityid, entitydata); SimpleSAMLphp 2.x queries
# `SELECT entity_id, entity_data`, so the table existed, an existence check
# passed, and every metadata read threw. Measured 2026-09-05.
idp_reads_metadata_from_sql() {
  local eid='https://verify-probe.manifest.internal/sp' out rc
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "INSERT INTO saml20_sp_remote (entity_id, entity_data) VALUES ('$eid', '{\"entityid\":\"$eid\",\"AssertionConsumerService\":[{\"Binding\":\"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST\",\"Location\":\"https://verify-probe.manifest.internal/acs\",\"index\":0}],\"attributes\":[\"ubcEduCwlPuid\"]}') ON CONFLICT (entity_id) DO NOTHING" >/dev/null 2>&1 \
    || { echo "could not insert a probe SP row"; return 1; }

  out=$(docker exec -e PROBE_EID="$eid" manifest-idp php -r '
    require "/var/simplesamlphp/vendor/autoload.php";
    $h = \SimpleSAML\Metadata\MetaDataStorageHandler::getMetadataHandler();
    $m = $h->getMetaData(getenv("PROBE_EID"), "saml20-sp-remote");
    echo $m["AssertionConsumerService"][0]["Location"];
  ' 2>&1); rc=$?
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "DELETE FROM saml20_sp_remote WHERE entity_id='$eid'" >/dev/null 2>&1

  echo "SimpleSAMLphp read the probe SP back as: ${out##*$'\n'}"
  [ "$rc" -eq 0 ] && [ "$out" = "https://verify-probe.manifest.internal/acs" ]
}
check "one INSERT registers an SP, read back through SimpleSAMLphp (S2)"  idp_reads_metadata_from_sql

# S2's THIRD finding, asserted rather than assumed: database.* and store.sql.*
# are DIFFERENT SUBSYSTEMS, and proving one works proves nothing about the other.
# The check above exercises database.*; this one exercises store.sql.*.
idp_sql_session_store_works() {
  local out
  out=$(docker exec manifest-idp php -r '
    require "/var/simplesamlphp/vendor/autoload.php";
    $s = \SimpleSAML\Store\StoreFactory::getInstance(
           \SimpleSAML\Configuration::getInstance()->getOptionalString("store.type","phpsession"));
    $s->set("test", "manifest-verify-probe", "ok", time()+300);
    echo get_class($s), " ", var_export($s->get("test","manifest-verify-probe"), true);
  ' 2>&1)
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "DELETE FROM simplesamlphp_kvstore WHERE _key='manifest-verify-probe'" >/dev/null 2>&1
  echo "${out##*$'\n'}"
  echo "$out" | grep -q "SQLStore 'ok'"
}
check "the SQL session store is a DIFFERENT subsystem, and also works (S2)"  idp_sql_session_store_works

idp_serves_metadata() {
  local body
  body=$(curl -sS --cacert "$CA_FILE" "https://$IDP_HOST/module.php/saml/idp/metadata" 2>&1)
  # Assert the SHAPE of the answer, not that an answer arrived: a 500 error page
  # is also a 200-shaped string, and the whole point of this check is that the
  # IdP could not previously produce metadata at all.
  echo "$body" | grep -q 'entityID="https://idp.manifest.internal/idp/shibboleth"' \
    && echo "$body" | grep -q '<ds:X509Certificate>' \
    && echo "metadata carries the configured entityID and a signing certificate" \
    || { echo "metadata missing entityID or X509Certificate:"; echo "$body" | head -5; return 1; }
}
check "the IdP serves SAML metadata with our entityID and a certificate"  idp_serves_metadata

idp_entity_id_is_not_host_derived() {
  # S2's trap. The entityID must not carry a port or a bare host, whatever port
  # the container happens to be published on.
  local body eid
  body=$(curl -sS --cacert "$CA_FILE" "https://$IDP_HOST/module.php/saml/idp/metadata")
  # ASSERT THE ENTITY ID IS THERE FIRST. Without this line the port match below
  # finds nothing whenever no metadata is served AT ALL — the wildcard page, a
  # 500, an empty body — and the check passes vacuously. Measured 2026-09-08:
  # it passed against `manifest OK host=idp.manifest.internal`, which is the
  # Caddyfile fallback. A control that cannot fail is not a control.
  eid=$(echo "$body" | grep -o 'entityID="[^"]*"' | head -1 | sed 's/^entityID="//; s/"$//')
  [ -n "$eid" ] || { echo "no entityID in the response at all:"; echo "$body" | head -3; return 1; }
  case "$eid" in
    *:7122*|*:6122*|*:8080*)
      echo "entityID carries a PORT — it is being derived from the request host: $eid"
      return 1 ;;
  esac
  echo "entityID carries no port: $eid"
}
check "the IdP entityID is configured, not derived from the request host"  idp_entity_id_is_not_host_derived

control_plane_sp_keypair() {
  # §9: Manifest is its own SP. `make up` mints the keypair it signs its own
  # AuthnRequests with, and the control plane REFUSES TO BOOT without it — so a
  # half-minted pair is a platform that does not start, which is worth catching
  # here rather than in somebody's terminal.
  local key="infra/sp/control-plane.key" crt="infra/sp/control-plane.crt"
  [ -s "$key" ] || { echo "no SP private key at $key — run \`make up\`"; return 1; }
  [ -s "$crt" ] || { echo "no SP certificate at $crt — run \`make up\`"; return 1; }

  # COMPLETE THE OPERATION, do not look for a file. An interrupted mint leaves a
  # file that exists and is non-empty and is not a certificate, and the failure
  # then lands inside node-saml's XML signer with a message about the assertion
  # rather than about the key. This project's most-repeated lesson.
  local san
  san=$(openssl x509 -in "$crt" -noout -ext subjectAltName 2>/dev/null) \
    || { echo "$crt is not a parseable certificate"; return 1; }
  echo "$san" | grep -q 'URI:https://manifest.internal/sp/manifest-control-plane/platform' \
    || { echo "the certificate's SAN does not carry the control plane's entityID:"; echo "$san"; return 1; }

  # And that the two halves are ONE PAIR. Two valid PEMs that do not match is
  # what a re-mint of one half leaves, and the IdP then refuses every login with
  # "Invalid certificate signature" (S2 Evidence 8) — a failure that reads as a
  # missing registration. Compare the public keys, which is the only thing that
  # answers it.
  local from_key from_crt
  from_key=$(openssl pkey -in "$key" -pubout 2>/dev/null)
  from_crt=$(openssl x509 -in "$crt" -noout -pubkey 2>/dev/null)
  [ -n "$from_key" ] && [ "$from_key" = "$from_crt" ] \
    || { echo "$key and $crt are not the same keypair"; return 1; }

  local bits
  bits=$(openssl x509 -in "$crt" -noout -text | grep -o 'Public-Key: ([0-9]* bit)' | head -1)
  echo "one RSA pair, $bits, SAN carries the control plane entityID"
}
check "the control plane's own SP keypair is a usable pair (§9)"  control_plane_sp_keypair

idp_through_the_edge() {
  # Not `-k`. A demo that skips verification is a demo that would pass against
  # the wrong certificate (P3 Task 14 paid for this one).
  local body code
  body=$(curl -sS --cacert "$CA_FILE" -w '\n%{http_code}' \
           "https://$IDP_HOST/module.php/core/welcome")
  code=${body##*$'\n'}
  # ASSERT WHO ANSWERED. The Caddyfile wildcard returns 200 for EVERY path under
  # the zone, so a status-only check stays green with no IdP route at all —
  # measured 2026-09-08 by removing the site block and watching this check pass.
  # The body is what separates "the edge routed this to the IdP" from "the edge
  # answered it itself".
  echo "https://$IDP_HOST/module.php/core/welcome -> $code (want 200, from SimpleSAMLphp)"
  [ "$code" = "200" ] || return 1
  echo "$body" | grep -q 'SimpleSAMLphp' \
    || { echo "200, but not from the IdP — the wildcard answered: $(echo "$body" | head -1)"; return 1; }
}
check "the IdP is reachable through the edge over trusted TLS"  idp_through_the_edge

# SIGN-OUT (found 2026-09-16, in a browser): an app's /auth/logout sends the person to the
# IdP's singleLogout with ReturnTo=<the app>, and SimpleSAMLphp refuses any ReturnTo whose
# host `trusted.url.domains` does not list — `500 URL not allowed`. It listed only the IdP,
# so no app could sign anybody out, and the IdP session survived: the next "Sign in" was
# answered without a password, as the person who had just signed out. Both directions,
# because the fix is an allow-list: every app zone is allowed, and nothing else is —
# including a hostname that merely starts with an app's.
idp_lets_an_app_sign_out() {
  local slo="https://$IDP_HOST/module.php/saml/idp/singleLogout?ReturnTo=" url out code where failed=0 jar hop
  jar="$(mktemp -t mf-verify-slo)"
  for url in "https://verify-probe.staging.$ZONE" "https://verify-probe.sandbox.$ZONE" "https://verify-probe.$ZONE"; do
    # FOLLOW THE IdP's OWN HOPS, WITH ITS COOKIE. SimpleSAMLphp answers 303 to its
    # `core/logout-resume?id=…`, whose state lives in the session — without the cookie the
    # resume is a 500 (measured 2026-09-16) — and only that page sends the browser home.
    where="$slo$(printf '%s' "$url" | sed 's/:/%3A/g; s#/#%2F#g')"; : > "$jar"
    for hop in 1 2 3 4; do
      out=$(curl -sS --cacert "$CA_FILE" -b "$jar" -c "$jar" -o /dev/null -w '%{http_code} %{redirect_url}' "$where")
      code=${out%% *}; where=${out#* }
      case "$where" in "https://$IDP_HOST/"*) continue ;; *) break ;; esac
    done
    echo "ReturnTo=$url -> the IdP sends the browser to ${where:-nowhere} after $hop hop(s), last $code (want the app)"
    [ "${where%/}" = "$url" ] || failed=1
  done
  rm -f "$jar"
  for url in "https://evil.example" "https://verify-probe.staging.$ZONE.evil.example" "https://a.b.staging.$ZONE"; do
    out=$(curl -sS --cacert "$CA_FILE" -w '\n%{http_code}' "$slo$(printf '%s' "$url" | sed 's/:/%3A/g; s#/#%2F#g')")
    code=${out##*$'\n'}
    echo "ReturnTo=$url -> $code (want refused: URL not allowed)"
    echo "$out" | grep -q 'URL not allowed' || failed=1
  done
  [ "$failed" = 0 ]
}
check "the IdP signs an app's user out to the app, and to nowhere else"  idp_lets_an_app_sign_out

# The row declares TWO attributes. Anything else released is a §9 violation, and
# S2 measured the default as releasing all THIRTEEN the auth source produces.
idp_enforces_attribute_release() {
  local eid='https://manifest.internal/sp/verify-attr-probe/staging'
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "INSERT INTO saml20_sp_remote (entity_id, entity_data) VALUES ('$eid',
     '{\"AssertionConsumerService\":[{\"index\":0,\"Binding\":\"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST\",\"Location\":\"https://verify-attr-probe.staging.manifest.internal/acs\"}],
       \"attributes\":[\"ubcEduCwlPuid\",\"mail\"]}')
     ON CONFLICT (entity_id) DO UPDATE SET entity_data = EXCLUDED.entity_data" >/dev/null
  # Ask SimpleSAMLphp itself what it would release, rather than completing a
  # login here — Task 3 owns the full flow. This asserts the FILTER is loaded.
  local out
  out=$(docker exec manifest-idp php -r '
    require "/var/simplesamlphp/vendor/autoload.php";
    $c = \SimpleSAML\Configuration::getInstance();
    $ap = $c->getOptionalArray("authproc.idp", []);
    $classes = [];
    foreach ($ap as $p) { $classes[] = is_array($p) ? ($p["class"] ?? "?") : $p; }
    echo implode(",", $classes);
  ' 2>&1)
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "DELETE FROM saml20_sp_remote WHERE entity_id='$eid'" >/dev/null
  echo "authproc.idp = [$out]"
  echo "$out" | grep -q 'core:AttributeLimit'
}
check "the IdP loads core:AttributeLimit (without it release fails OPEN)"  idp_enforces_attribute_release

idp_refuses_an_empty_attribute_list() {
  local eid='https://manifest.internal/sp/verify-empty-probe/staging'
  local rc=0
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "INSERT INTO saml20_sp_remote (entity_id, entity_data)
     VALUES ('$eid', '{\"attributes\":[]}')" >/dev/null 2>&1 || rc=$?
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "DELETE FROM saml20_sp_remote WHERE entity_id='$eid'" >/dev/null 2>&1
  echo "INSERT of a row with attributes:[] exited $rc (want non-zero)"
  [ "$rc" -ne 0 ]
}
check "the database refuses a row whose attributes list is empty"  idp_refuses_an_empty_attribute_list

# The SAME rule from the other side. core:AttributeLimit treats a MISSING
# `attributes` key exactly as it treats an empty one — no limit, everything
# released — so a constraint that only rejects `[]` leaves the fail-open row
# perfectly representable. `jsonb_array_length(NULL)` is NULL and `NULL > 0` is
# NULL, which a CHECK accepts, so this is one COALESCE away from being useless.
idp_refuses_a_missing_attribute_list() {
  local eid='https://manifest.internal/sp/verify-missing-probe/staging'
  local rc=0
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "INSERT INTO saml20_sp_remote (entity_id, entity_data)
     VALUES ('$eid', '{\"entityid\":\"$eid\"}')" >/dev/null 2>&1 || rc=$?
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "DELETE FROM saml20_sp_remote WHERE entity_id='$eid'" >/dev/null 2>&1
  echo "INSERT of a row with NO attributes key exited $rc (want non-zero)"
  [ "$rc" -ne 0 ]
}
check "the database refuses a row with no attributes key at all"  idp_refuses_a_missing_attribute_list

idp_metadata_user_is_read_only() {
  local rc=0
  docker exec manifest-postgres psql -U ssp_ro -d manifest_idp -tAc \
    "INSERT INTO saml20_sp_remote VALUES ('verify-ro-probe','{}')" >/dev/null 2>&1 || rc=$?
  # CLEAN UP EVEN THOUGH THE INSERT IS MEANT TO FAIL. When this check does its
  # job the DELETE is a no-op; when it fails, the row it just proved should not
  # exist stays in the table for ever. Measured 2026-09-08: a run with INSERT
  # granted left `('x','{}')` behind, and the next `make up` then died because
  # that row violates the attributes CHECK — a failing check that breaks the
  # platform for the next person is worse than no check.
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "DELETE FROM saml20_sp_remote WHERE entity_id='verify-ro-probe'" >/dev/null 2>&1
  echo "ssp_ro INSERT exited $rc (want non-zero)"
  [ "$rc" -ne 0 ] && docker exec manifest-postgres psql -U ssp_ro -d manifest_idp \
    -tAc "SELECT 1 FROM saml20_sp_remote LIMIT 1" >/dev/null 2>&1
}
check "the SimpleSAMLphp metadata user can read and cannot write (§9)"  idp_metadata_user_is_read_only

# §20: "The events table is append-only BY GRANT, not by convention: the
# application role holds no UPDATE or DELETE privilege on it."
#
# This is a silent control. When it breaks nothing fails, no log line appears and
# no test outside `observability/` notices — the audit log simply becomes
# editable. That is exactly the kind this project keeps finding green, so it is
# asserted here by ATTEMPTING the write rather than by reading a catalogue.
#
# The fourth probe is not decoration. A referential action runs with the
# REFERENCED table's privileges rather than the caller's, so an ON DELETE CASCADE
# on `events.project_id` is a hole straight through the other three: measured
# 2026-09-09 with the grant working exactly as intended, `DELETE FROM projects`
# removed the audit rows and left `events_after_project_delete = 0`.
events_are_append_only_by_grant() {
  local user=manifest_app db=manifest_control probe='verify-append-only-probe'
  local pw="${MANIFEST_APP_PASSWORD:-change-me-locally}" refused=0 verbs=""

  # A project and one event to attempt the writes against, created as the owner.
  docker exec -i manifest-postgres psql -U manifest -d "$db" -q >/dev/null 2>&1 <<SQL || { echo "could not seed the probe row"; return 1; }
INSERT INTO users (ubc_cwl_puid, email, display_name) VALUES ('$probe','$probe@example.ubc.ca','probe')
  ON CONFLICT (ubc_cwl_puid) DO NOTHING;
INSERT INTO projects (slug, owner_id, blueprint_ref)
  SELECT '$probe', id, 'fixture-node@1' FROM users WHERE ubc_cwl_puid='$probe'
  ON CONFLICT (slug) DO NOTHING;
INSERT INTO audit.events (project_id, subject, type, machine_detail, human_message)
  SELECT id, 's', 'sso.registered', '{}', 'probe' FROM projects WHERE slug='$probe';
SQL

  as_app() {
    docker exec -i -e PGPASSWORD="$pw" manifest-postgres       psql -U "$user" -h 127.0.0.1 -d "$db" -tAc "$1" >/dev/null 2>&1
  }
  as_app "SELECT 1 FROM audit.events LIMIT 1" || { verbs="$verbs SELECT-denied"; }
  as_app "UPDATE audit.events SET human_message='x'"       && verbs="$verbs UPDATE"   || refused=$((refused+1))
  as_app "DELETE FROM audit.events"                        && verbs="$verbs DELETE"   || refused=$((refused+1))
  as_app "TRUNCATE audit.events"                           && verbs="$verbs TRUNCATE" || refused=$((refused+1))
  as_app "DELETE FROM projects WHERE slug='$probe'"        && verbs="$verbs CASCADE"  || refused=$((refused+1))

  # Clean up whatever survived, as the owner, whether or not the check passed —
  # ensure-idp-sql.sh's lesson: a failing check that leaves rows behind breaks the
  # platform for the next person.
  docker exec -i manifest-postgres psql -U manifest -d "$db" -q >/dev/null 2>&1 <<SQL
DELETE FROM audit.events WHERE project_id IN (SELECT id FROM projects WHERE slug='$probe');
DELETE FROM projects WHERE slug='$probe';
DELETE FROM users WHERE ubc_cwl_puid='$probe';
SQL

  echo "$user: 4 write paths attempted, $refused refused; readable = $(as_app 'SELECT 1' && echo yes || echo no)"
  [ -z "$verbs" ] || { echo "NOT REFUSED:$verbs — the audit log is editable by the application"; return 1; }
  [ "$refused" -eq 4 ]
}
check "the events table is append-only by GRANT, and unreachable through the FK (§20)"  events_are_append_only_by_grant

# NOT a grep for the OID in a config file. This runs the CONFIGURED chain, in
# priority order, over five attributes with a row declaring two — so it fails if
# the limit is missing, if the map is missing, if the map lacks the UBC entry,
# and (unlike a "the filter is loaded" assertion) if the two priorities are
# SWAPPED, which releases everything while looking identical to working.
idp_releases_exactly_what_the_row_declares_named_by_oid() {
  local want='urn:oid:0.9.2342.19200300.100.1.3,urn:oid:1.3.6.1.4.1.60.6.1.6'
  local got
  got=$(docker exec -i manifest-idp php < scripts/lib/idp-attribute-chain.php 2>&1 | tail -1)
  echo "5 attributes in, row declares 2, released: ${got:-<nothing>}"
  echo "                                   wanted: $want"
  [ "$got" = "$want" ]
}
check "a login releases exactly the declared attributes, named by OID (§9)"  idp_releases_exactly_what_the_row_declares_named_by_oid

# THE CHECK THAT WOULD HAVE CAUGHT IT. Serving metadata and being able to
# authenticate somebody are different claims: SimpleSAMLphp 2.x enables only
# core, admin and saml by default, so `exampleauth:UserPass` — which every D6
# test user is defined with — threw "The module 'exampleauth' is not enabled"
# on every SSO request while metadata, the signing certificate and all 43 checks
# stayed green. Measured 2026-09-08. Instantiating the auth source is the
# cheapest thing that completes the operation rather than starting it.
idp_can_instantiate_its_auth_source() {
  local out
  out=$(docker exec manifest-idp php -r '
    require "/var/simplesamlphp/vendor/autoload.php";
    $s = \SimpleSAML\Auth\Source::getById("manifest-test-users");
    echo $s === null ? "NULL" : get_class($s);
  ' 2>&1)
  echo "manifest-test-users resolves to: ${out##*$'\n'}"
  echo "$out" | grep -q 'UserPass'
}
check "the IdP can instantiate the auth source its test users are defined with"  idp_can_instantiate_its_auth_source

idp_ships_no_flatfile_sp_metadata() {
  # §9: "The deployed IdP ships no saml20-sp-remote.php." S2 measured why —
  # when the same entityID exists in a flatfile AND the SQL store, the FIRST
  # matching metadata.sources entry wins, so a stale file silently shadows a
  # control-plane-written row and nothing reports it. docker-simple-saml's own
  # file defines 15 SPs.
  #
  # True today only by accident: the image ships .dist files and nothing else.
  # An accident is not a control, so it is asserted.
  if docker exec manifest-idp test -f /var/simplesamlphp/metadata/saml20-sp-remote.php; then
    echo "saml20-sp-remote.php EXISTS — it will shadow SQL rows silently"; return 1
  fi
  echo "no flatfile saml20-sp-remote.php; the SQL store is the only place an SP is defined"
}
check "the IdP ships no flatfile SP metadata (§9)"  idp_ships_no_flatfile_sp_metadata

echo
echo "C1 — host/container parity (S7 §Evidence 4, 5)"

host_reaches_edge() {
  local out
  out=$(curl -sS "https://$EDGE_PROBE_HOST/" 2>&1)
  echo "$out"
  echo "$out" | grep -q "host=$EDGE_PROBE_HOST"
}
check "the host reaches https://$EDGE_PROBE_HOST with no -k and no port"  host_reaches_edge

host_trusts_cert() {
  local r
  r=$(curl -sS -o /dev/null -w '%{ssl_verify_result}' "https://$EDGE_PROBE_HOST/" 2>&1)
  echo "ssl_verify_result=$r (0 means the macOS keychain trusts it)"
  [ "$r" = "0" ]
}
check "the certificate verifies against the macOS keychain"  host_trusts_cert

# THE PARITY ASSERTION. Same command string, both contexts, compared.
parity() {
  require_ca || return 1
  local h c
  h=$(curl -sS "https://$EDGE_PROBE_HOST/" 2>&1 | sed 's/ remote=.*//')
  c=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
      -v "$PWD/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
      --cacert /ca.crt -sS "https://$EDGE_PROBE_HOST/" 2>&1 | sed 's/ remote=.*//')
  echo "host     : $h"
  echo "container: $c"
  [ -n "$h" ] && [ "$h" = "$c" ]
}
check "host and container see a byte-identical hostname and scheme"  parity

# §21 and §12 (P5a Task 3): the console's origin forwards to the control plane, and
# refuses every source but the host. Three checks, because each alone can pass for the
# wrong reason: a site that refuses EVERYONE passes the second, a site that refuses NO
# ONE passes the first, and a Caddyfile allowing a stale address passes both until the
# platform network's subnet moves.
# P5c Task 4 (2026-09-18) replaced the placeholder `respond` with a `reverse_proxy` to the
# reference console on 7104, so this check can no longer assert the placeholder's words.
# IT KEEPS ITS ORIGINAL QUESTION — did a request from the HOST reach the console SITE,
# rather than being refused by @outside or falling through to the wildcard — and answers it
# WITHOUT REQUIRING THE CONSOLE PROCESS TO BE RUNNING, because `vite dev` on 7104 is a
# developer's host process and no part of `make up`. The four answers it distinguishes:
#
#   [502]                          the site matched and forwarded; nothing on 7104. PASS
#   [200] + the console's document the console is running. PASS
#   "manifest: the control plane…" @outside REFUSED the host — the failure this exists for
#   "manifest OK host=…"           the WILDCARD answered; this site did not match at all
#
# The last two are why a bare status check will not do: the wildcard answers 200 for any
# path and any name (ORIENTATION §4), so `[200]` alone passes for the wrong reason.
console_serves_host() {
  local out
  out=$(curl -sS -w ' [%{http_code}]' "https://$CONSOLE_HOST/" 2>&1)
  echo "$out"
  case "$out" in
    *"manifest OK host="*) return 1 ;;
    *"the control plane is not reachable"*) return 1 ;;
    *'[502]') return 0 ;;
  esac
  case "$out" in *'[200]') ;; *) return 1 ;; esac
  case "$out" in *'id="root"'*) ;; *) return 1 ;; esac
  case "$out" in *'<title>Manifest</title>'*) return 0 ;; *) return 1 ;; esac
}
check "the host reaches https://$CONSOLE_HOST and is not refused" console_serves_host

console_refuses_platform_container() {
  require_ca || return 1
  local out
  out=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
        -v "$PWD/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
        --cacert /ca.crt -sS -w ' [%{http_code}]' "https://$CONSOLE_HOST/v1/me" 2>&1)
  echo "$out"
  [ "$out" = "manifest: the control plane is not reachable from this network [403]" ]
}
check "a container on $NET is refused by https://$CONSOLE_HOST (§12)" console_refuses_platform_container

console_allows_only_the_gateway() {
  local gw allowed
  gw=$(docker network inspect "$NET" --format '{{(index .IPAM.Config 0).Gateway}}')
  allowed=$(sed -n 's/.*not remote_ip \([0-9.]*\)\/32.*/\1/p' infra/caddy/Caddyfile | head -1)
  echo "platform gateway=$gw Caddyfile allows=$allowed common.sh HOST_SOURCE_IP=$HOST_SOURCE_IP"
  [ -n "$gw" ] && [ "$gw" = "$allowed" ] && [ "$gw" = "$HOST_SOURCE_IP" ]
}
check "the console's one allowed source is the platform network's gateway" console_allows_only_the_gateway

# All three of §23's zones, one wildcard certificate each.
zones_serve() {
  local n host
  for host in "chem-labs.$ZONE" "chem-labs.sandbox.$ZONE" "chem-labs.staging.$ZONE"; do
    curl -sS -o /dev/null "https://$host/" || { echo "$host FAILED"; return 1; }
    n="$n $host"
  done
  echo "served:$n"
}
check "all three §23 platform zones serve with a trusted certificate"  zones_serve

# A name that exists in no config file, added through the admin API as the driver
# will (§12, S1). PUT inserts; POST appends behind the wildcard, whose
# terminal:true then swallows the new route.
#
# ONE ROUTE PER LISTENER SINCE P6a (R3), and this check found the split by going red.
# It used to add ONE route, to srv0, for a name in the BARE zone — which is the
# PRODUCTION zone. The split sends that name to 127.0.0.3 and therefore to srv1, so the
# route sat on a server the request never reached and the check read the wildcard's
# placeholder instead of its own body. That is §12's claim working exactly as designed —
# a route bound to the wrong listener is simply unreachable — but as a CHECK it has to
# assert what the platform really does, which is `listenerFor(kind)`:
# production → public → srv1, staging and sandbox → internal → srv0.
#
# Both halves matter. A staging-only version would stay green while no production route
# could ever be reached, and a production-only version would stay green while every demo
# on this machine broke.
# A HELPER TAKING REAL ARGUMENTS, not a loop over "$server $host" pairs split by the
# shell: P6a sitting 1 lost a measurement to exactly that, because an unquoted variable
# is not word-split in every shell and both fields came back empty, printing a vacuous
# OK for every row. Arguments cannot fail that way.
runtime_route_on() {
  local server="$1" host="$2" got
  curl -sS -X PUT "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/$server/routes/0" \
    -H 'Content-Type: application/json' \
    -d "{\"match\":[{\"host\":[\"$host\"]}],\"handle\":[{\"handler\":\"static_response\",\"body\":\"runtime route OK\",\"status_code\":200}],\"terminal\":true}" \
    >/dev/null || { echo "admin API rejected the route on $server"; return 1; }
  got=$(curl -sS "https://$host/" 2>&1)
  echo "    $server  $host -> $got"
  curl -sS -X DELETE "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/$server/routes/0" >/dev/null
  [ "$got" = "runtime route OK" ]
}

runtime_route() {
  local rc=0
  runtime_route_on srv1 "late-arrival.$ZONE" || rc=1
  runtime_route_on srv0 "late-arrival.staging.$ZONE" || rc=1
  return "$rc"
}
check "a name allocated at runtime resolves, routes and gets a certificate — on both listeners"  runtime_route

if [ "${MANIFEST_VERIFY_OFFLINE:-0}" = "1" ]; then
  echo
  echo "Offline (C1)"

  # If this PASSES, the machine still has network and the offline claim is not
  # being tested. Fail loudly rather than reporting a false green.
  host_is_offline() {
    if curl -sf -m 5 https://registry.npmjs.org/ >/dev/null 2>&1; then
      echo "the host still reaches npmjs — turn Wi-Fi off before claiming offline"
      return 1
    fi
    echo "host has no network, as required"
  }
  check "the machine is genuinely offline"  host_is_offline

  offline_build_resolves_base_image() {
    # BuildKit re-resolves FROM on every build against a REGISTRY. This is the
    # exact failure `make seed`'s mirroring step exists to prevent (S1).
    # A token is required from P3 Task 9 onwards; without one this answers 401 and
    # `-sf` reports the base image as absent, which would read as a mirroring
    # failure and is not one.
    local token; token=$(node infra/seed/mint-token.mjs base/node)
    docker run --rm --network "$NET_BUILD" curlimages/curl:8.11.1 \
      -sf -H "Authorization: Bearer $token" \
      "http://manifest-registry:5000/v2/base/node/tags/list" >/dev/null &&
    echo "node:22-alpine resolvable from the local registry with no network"
  }
  check "base images resolve from the local registry offline"  offline_build_resolves_base_image

  offline_npm_install() {
    local t rc; t=$(mktemp -d)
    printf '{"name":"o","private":true,"dependencies":{"zod":"3.24.1"}}\n' > "$t/package.json"
    # Capture npm's status FIRST. Putting `&& echo` before `rc=$?` would record
    # the echo's status and the check could never fail.
    (cd "$t" && npm install --registry "http://127.0.0.1:$PORT_VERDACCIO" \
       --no-audit --no-fund --silent) >/dev/null 2>&1; rc=$?
    rm -rf "$t"
    [ "$rc" -eq 0 ] && echo "npm install succeeded against the mirror with no network" \
                    || echo "npm install FAILED offline (exit $rc)"
    return "$rc"
  }
  check "npm install works against the mirror offline"  offline_npm_install
fi

# THE MIRROR HOLDS EVERY BLUEPRINT'S CLOSURE, as TARBALLS.
#
# Not conditional on being offline, because the failure it catches is invisible
# WHILE the network is up: Verdaccio proxies whatever it does not hold, so a cold
# mirror and a warm one behave identically until the moment C1 actually matters.
# `make seed` warms from these same lockfiles, and P4a Task 12 checked one by
# hand; this is that check, standing.
#
# TARBALLS, never package documents. Verdaccio caches a `.tgz` when it is
# DOWNLOADED, and `npm install --package-lock-only` downloads nothing — so a warm
# step written that way leaves metadata and no tarballs, which is
# indistinguishable from success (measured 2026-09-08).
mirror_holds_blueprint_closures() {
  local missing=0 total=0 lock name ver base want
  # bash 3.2: no associative arrays, no mapfile. A plain sorted file of what the
  # mirror holds, and one grep per package.
  local have; have=$(mktemp)
  docker exec manifest-verdaccio sh -c \
    'cd /verdaccio/storage && find . -name "*.tgz" | sed "s|^\./||"' \
    2>/dev/null | LC_ALL=C sort -u > "$have"
  for lock in blueprints/*/skeleton/package-lock.json fixtures/*/package-lock.json; do
    [ -f "$lock" ] || continue
    while IFS='	' read -r name ver; do
      [ -n "$name" ] || continue
      base=${name##*/}
      want="$name/$base-$ver.tgz"
      total=$((total + 1))
      grep -qxF "$want" "$have" || { echo "  MISSING $want  ($lock)"; missing=$((missing + 1)); }
    done <<EOF
$(node -e '
const lock = require("path").resolve(process.argv[1])
const seen = new Set()
for (const [key, value] of Object.entries(require(lock).packages ?? {})) {
  if (!key.startsWith("node_modules/") || !value.version) continue
  const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length)
  const line = name + "\t" + value.version
  if (!seen.has(line)) { seen.add(line); console.log(line) }
}' "$lock")
EOF
  done
  rm -f "$have"
  echo "$total pinned tarballs across every blueprint and fixture lockfile; $missing missing from the mirror"
  [ "$missing" -eq 0 ]
}
check "the package mirror holds every blueprint's closure as tarballs"  mirror_holds_blueprint_closures

# No platform container should run under emulation. vimagick/tinyproxy was
# amd64-only, so the egress proxy ran x86_64 on an arm64 host — `make up` warned
# about it once and nothing else would ever have noticed. Measured 2026-09-05.
no_emulated_containers() {
  local host_arch c carch bad=""
  case "$(uname -m)" in arm64|aarch64) host_arch=aarch64 ;; *) host_arch=x86_64 ;; esac
  for c in $(docker ps --filter 'name=^manifest-' --format '{{.Names}}'); do
    carch=$(docker exec "$c" uname -m 2>/dev/null) || continue
    [ "$carch" = "$host_arch" ] || bad="$bad $c($carch)"
  done
  [ -z "$bad" ] && { echo "every running platform container is native $host_arch"; return 0; }
  echo "EMULATED:$bad on a $host_arch host"; return 1
}
check "no platform container runs under emulation"  no_emulated_containers

echo
echo "Per-app resources (P3)"

# S1 lost a live app's route by restarting Caddy. §12 gained a sentence for it and
# P3 gained reapplyAllRoutes; this reports the property that made both necessary,
# so a run after an edge restart shows plainly whether the runtime routes are back.
runtime_routes_applied() {
  local n
  n=$(curl -sS -m 5 "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/srv0/routes" 2>/dev/null \
      | tr ',' '\n' | grep -c '"@id":"mf-' || true)
  echo "runtime routes currently applied: $n (the control plane re-applies these on edge start)"
  true
}
report "routing" runtime_routes_applied

# P1's ownership rule, reported rather than trusted. `mf-` is per-app and ours;
# `manifest-` is the platform's; everything else on this machine is somebody
# else's and is never touched. A non-zero count after `make reset` is a leak.
mf_resources() {
  local c n v
  c=$(docker ps -a --format '{{.Names}}' | grep -c '^mf-' || true)
  n=$(docker network ls --format '{{.Name}}' | grep -c '^mf-' || true)
  v=$(docker volume ls --format '{{.Name}}' | grep -c '^mf-' || true)
  echo "mf- containers=$c networks=$n volumes=$v (0/0/0 immediately after make reset)"
  true
}
report "per-app resources" mf_resources

# The four containers this project must never disturb, and the CA volume a reset
# must never remove. Reported every run, because a `grep '^mf-'` typo in `make
# reset` would take out somebody else's work silently and nothing else would notice.
survivors() {
  local missing="" c
  for c in docker-simple-saml-saml-idp-1 qdrant-local-dev mongodb mongo-express; do
    docker inspect "$c" >/dev/null 2>&1 || missing="$missing $c"
  done
  docker volume inspect manifest-caddy-data >/dev/null 2>&1 \
    || missing="$missing manifest-caddy-data(volume)"
  [ -z "$missing" ] && { echo "all four pre-existing containers and the CA volume are present"; return 0; }
  echo "MISSING:$missing — these must survive every reset (CLAUDE.md, non-negotiable)"
  return 1
}
check "nothing this platform owns has removed somebody else's containers or the CA"  survivors

summary
