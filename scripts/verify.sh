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
    "INSERT INTO saml20_sp_remote (entity_id, entity_data) VALUES ('$eid', '{\"entityid\":\"$eid\",\"AssertionConsumerService\":[{\"Binding\":\"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST\",\"Location\":\"https://verify-probe.manifest.internal/acs\",\"index\":0}]}') ON CONFLICT (entity_id) DO NOTHING" >/dev/null 2>&1 \
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

echo
echo "C1 — host/container parity (S7 §Evidence 4, 5)"

host_reaches_edge() {
  local out
  out=$(curl -sS "https://console.$ZONE/" 2>&1)
  echo "$out"
  echo "$out" | grep -q "host=console.$ZONE"
}
check "the host reaches https://console.$ZONE with no -k and no port"  host_reaches_edge

host_trusts_cert() {
  local r
  r=$(curl -sS -o /dev/null -w '%{ssl_verify_result}' "https://console.$ZONE/" 2>&1)
  echo "ssl_verify_result=$r (0 means the macOS keychain trusts it)"
  [ "$r" = "0" ]
}
check "the certificate verifies against the macOS keychain"  host_trusts_cert

# THE PARITY ASSERTION. Same command string, both contexts, compared.
parity() {
  require_ca || return 1
  local h c
  h=$(curl -sS "https://console.$ZONE/" 2>&1 | sed 's/ remote=.*//')
  c=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
      -v "$PWD/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
      --cacert /ca.crt -sS "https://console.$ZONE/" 2>&1 | sed 's/ remote=.*//')
  echo "host     : $h"
  echo "container: $c"
  [ -n "$h" ] && [ "$h" = "$c" ]
}
check "host and container see a byte-identical hostname and scheme"  parity

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
runtime_route() {
  curl -sS -X PUT "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/srv0/routes/0" \
    -H 'Content-Type: application/json' \
    -d "{\"match\":[{\"host\":[\"late-arrival.$ZONE\"]}],\"handle\":[{\"handler\":\"static_response\",\"body\":\"runtime route OK\",\"status_code\":200}],\"terminal\":true}" \
    >/dev/null || { echo "admin API rejected the route"; return 1; }
  local got; got=$(curl -sS "https://late-arrival.$ZONE/" 2>&1)
  echo "$got"
  curl -sS -X DELETE "http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers/srv0/routes/0" >/dev/null
  [ "$got" = "runtime route OK" ]
}
check "a name allocated at runtime resolves, routes and gets a certificate"  runtime_route

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
