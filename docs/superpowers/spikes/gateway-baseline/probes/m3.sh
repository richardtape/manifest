#!/usr/bin/env bash
# [M3] Both hops, through gw-probe: the gateway registered as a provider, the key by REFERENCE.
#   SCRATCH=<scratchpad> CAPABLE=<gateway model id> ONPREM=<gateway model id> bash m3.sh   (after up.sh)
. "$(dirname "$0")/lib.sh"
: "${CAPABLE:?}" "${ONPREM:?}"
REF=os.environ/UBC_AI_GATEWAY_API_KEY
echo "## [M3] $(date '+%Y-%m-%d %H:%M:%S %Z')"

reg() { # reg <tag> <model_name> <provider/model> <id> [extra litellm_params json]
  register "$1" "{\"model_name\":\"$2\",\"litellm_params\":{\"model\":\"$3\",\"api_base\":\"$GW/v1\",\"api_key\":\"$REF\"${5:-}},\"model_info\":{\"id\":\"$4\",\"max_classification\":\"internal\"}}"
}
echo "### 1. POST /model/new probe-capable (openai/$CAPABLE) → $(reg m3-new-capable probe-capable "openai/$CAPABLE" probe-gw-1)"
jq -c '{model_name, model_id: (.model_id // .model_info.id // null)}' "$RAW/m3-new-capable.b" 2>&1 | red
echo "### 4. POST /model/new probe-onprem (openai/$ONPREM) → $(reg m3-new-onprem probe-onprem "openai/$ONPREM" probe-gw-2)"

admin GET /model/info - m3-info >/dev/null
for id in probe-gw-1 probe-gw-2; do
  echo "### 2–4. /model/info for $id"
  jq -r --arg id "$id" --arg ref "$REF" '.data[] | select(.model_info.id == $id) | [
      .model_name,
      ("api_key=" + (if (.litellm_params | has("api_key")) | not then "ABSENT"
                     elif .litellm_params.api_key == $ref then "SHOWN AS THE REFERENCE"
                     elif .litellm_params.api_key == null then "null"
                     else "OTHER (redacted below)" end)),
      ("api_base=" + ((.litellm_params.api_base // "ABSENT") | tostring)),
      ("input_cost_per_token=" + ((.model_info.input_cost_per_token // "null") | tostring)),
      ("output_cost_per_token=" + ((.model_info.output_cost_per_token // "null") | tostring)),
      ("cache_read_input_token_cost=" + ((.model_info.cache_read_input_token_cost // "null") | tostring)),
      ("max_classification=" + ((.model_info.max_classification // "null") | tostring))
    ] | @tsv' "$RAW/m3-info.b" | red
  jq -r --arg id "$id" --arg ref "$REF" '.data[] | select(.model_info.id == $id) | .litellm_params.api_key | select(. != null and . != $ref)' "$RAW/m3-info.b" | red | sed 's/^/  api_key as shown: /'
  # whether the shown api_key IS the real key's value (a count, the value read from the environment)
  echo "  the real key's value in /model/info's answer: $(perl -ne '$n++ if index($_, $ENV{UBC_AI_GATEWAY_API_KEY}) >= 0; END { print $n+0 }' "$RAW/m3-info.b")"
done

echo "### 5. the LiteLLM_ProxyModelTable row, decrypted inside gw-probe, by verdict"
docker cp "$PROBES/decrypt-verdict.py" gw-probe:/tmp/decrypt-verdict.py >/dev/null
for id in probe-gw-1 probe-gw-2; do
  echo "  $id: $(docker exec gw-probe-pg psql -U postgres -d litellm -At -c "select litellm_params from \"LiteLLM_ProxyModelTable\" where model_id='$id'" |
    docker exec -i gw-probe python3 /tmp/decrypt-verdict.py "$REF" 2>&1 | tr '\n' ';')"
done
docker exec gw-probe-pg pg_dump -U postgres litellm >"$RAW/m3-dump.sql" 2>/dev/null
echo "  clear-text dump: the reference string $(grep -c "$REF" "$RAW/m3-dump.sql") time(s); the real key's value $(perl -ne '$n++ if index($_, $ENV{UBC_AI_GATEWAY_API_KEY}) >= 0; END { print $n+0 }' "$RAW/m3-dump.sql") time(s)"

echo "### 6. chat and streamed chat on a scratch key (models [probe-capable], the agent key's three routes)"
mint K3 m3-key '{"models":["probe-capable","probe-capable-proxy"],"allowed_routes":["/v1/chat/completions","/v1/embeddings","/v1/models"],"max_budget":1}'
price=$(jq -r '.data[] | select(.model_info.id == "probe-gw-1") | "\(.model_info.input_cost_per_token // 0) \(.model_info.output_cost_per_token // 0) \(.model_info.cache_read_input_token_cost // 0)"' "$RAW/m3-info.b")
set -- $price
PIN_IN=$1 PIN_OUT=$2 PIN_CACHE=$3
s0=$(spend K3 m3-spend0)
json m3-chat <<EOF >/dev/null
{"model":"probe-capable","messages":[{"role":"user","content":"Reply with the single word: ok"}]}
EOF
echo "  chat → $(req "$HOP1/v1/chat/completions" POST "$RAW/m3-chat.json" K3 m3-chat)"
jq -c '{model, usage}' "$RAW/m3-chat.b" 2>&1 | red
echo "  headers: $(heads m3-chat)"
sleep 15
s1=$(spend K3 m3-spend1)
perl -e 'printf "  spend: %.10f → %.10f, change %.10f; usage × LiteLLM'"'"'s price = %.10f\n", @ARGV[0,1], $ARGV[1]-$ARGV[0], $ARGV[2]*$ARGV[4] + $ARGV[3]*$ARGV[5]' \
  "$s0" "$s1" "$(jq -r '.usage.prompt_tokens // 0' "$RAW/m3-chat.b")" "$(jq -r '.usage.completion_tokens // 0' "$RAW/m3-chat.b")" "$PIN_IN" "$PIN_OUT"
json m3-stream <<EOF >/dev/null
{"model":"probe-capable","messages":[{"role":"user","content":"Reply with the single word: ok"}],"stream":true,"stream_options":{"include_usage":true}}
EOF
echo "  streamed → $(req "$HOP1/v1/chat/completions" POST "$RAW/m3-stream.json" K3 m3-stream -N)"
echo "  frames: $(grep -c '^data:' "$RAW/m3-stream.b"); [DONE]: $(grep -c '^data: \[DONE\]' "$RAW/m3-stream.b"); usage: $(grep '^data: {' "$RAW/m3-stream.b" | sed 's/^data: //' | jq -c 'select(.usage != null) | .usage' 2>/dev/null | tail -1)"
sleep 15
s2=$(spend K3 m3-spend2)
echo "  spend after the stream: $s2 (change $(perl -e 'printf "%.10f", $ARGV[1]-$ARGV[0]' "$s1" "$s2"))"

echo "### 6b. the cache: one ~2,000-token fixed preamble, sent twice"
PRE=$(perl -e 'print join(" ", map { "Clause $_: the University of British Columbia operates campuses in Vancouver and the Okanagan, and this sentence is fixed preamble for a cache measurement." } 1..90)')
for n in 1 2; do
  printf '{"model":"probe-capable","messages":[{"role":"system","content":"%s"},{"role":"user","content":"Reply with the single word: ok"}]}' "$PRE" >"$RAW/m3-cache-$n.json"
  a=$(spend K3 "m3-cache-s$n-a")
  r=$(req "$HOP1/v1/chat/completions" POST "$RAW/m3-cache-$n.json" K3 "m3-cache-$n")
  sleep 15
  b=$(spend K3 "m3-cache-s$n-b")
  echo "  call $n → $r; usage $(jq -c '{prompt_tokens: .usage.prompt_tokens, cached_tokens: .usage.prompt_tokens_details.cached_tokens, completion_tokens: .usage.completion_tokens}' "$RAW/m3-cache-$n.b" 2>&1)"
  echo "    Manifest's charge (hop 1 spend change): $(perl -e 'printf "%.10f", $ARGV[1]-$ARGV[0]' "$a" "$b"); hop 1's x-litellm-response-cost: $(grep -i '^x-litellm-response-cost:' "$RAW/m3-cache-$n.h" | tr -d '\r' | cut -d' ' -f2-)"
done
echo "  LiteLLM's map for openai/$CAPABLE: cache_read_input_token_cost = $PIN_CACHE"

echo "### 7. the same as litellm_proxy/$CAPABLE → $(register m3-new-proxy "{\"model_name\":\"probe-capable-proxy\",\"litellm_params\":{\"model\":\"litellm_proxy/$CAPABLE\",\"api_base\":\"$GW/v1\",\"api_key\":\"$REF\"},\"model_info\":{\"id\":\"probe-gw-3\",\"max_classification\":\"internal\"}}")"
admin GET /model/info - m3-info2 >/dev/null
jq -r '.data[] | select(.model_info.id == "probe-gw-3") | "  litellm_proxy price: in=\(.model_info.input_cost_per_token) out=\(.model_info.output_cost_per_token)"' "$RAW/m3-info2.b"
sed 's/"probe-capable"/"probe-capable-proxy"/' "$RAW/m3-chat.json" >"$RAW/m3-chat-proxy.json"
echo "  chat → $(req "$HOP1/v1/chat/completions" POST "$RAW/m3-chat-proxy.json" K3 m3-chat-proxy)"
jq -c '{model, usage, error: (.error | if . then {type, code} else null end)}' "$RAW/m3-chat-proxy.b" 2>&1 | red

echo "### 8. TLS: environment names in gw-probe matching ssl/verify/ca (names only): $(docker exec gw-probe sh -c 'env | cut -d= -f1 | grep -iE "ssl|verify|cert|ca_bundle" | tr "\n" " "')"
echo "  no ssl_verify in any registered litellm_params: $(jq '[.data[].litellm_params | has("ssl_verify")] | any' "$RAW/m3-info2.b")"

echo "### 9. stream_timeout: a deployment at the stub's /slow/ path (first frame after 6 s), stream_timeout 2"
register m3-new-slow '{"model_name":"probe-slow","litellm_params":{"model":"openai/probe-slow","api_base":"http://host.docker.internal:7198/slow/v1","api_key":"sk-canary-slow","stream_timeout":2},"model_info":{"id":"probe-slow-1","max_classification":"internal"}}' >/dev/null
printf '%s' '{"model":"probe-slow","messages":[{"role":"user","content":"hi"}],"stream":true}' >"$RAW/m3-slow.json"
echo "  streamed → status/total/first-byte $(LITELLM_PROBE_MASTER=$LITELLM_PROBE_MASTER MAXTIME=60 req "$HOP1/v1/chat/completions" POST "$RAW/m3-slow.json" LITELLM_PROBE_MASTER m3-slow -N)"
echo "  body: $(bodyof m3-slow 300)"
printf '%s' '{"model":"probe-slow","messages":[{"role":"user","content":"hi"}],"stream":false}' >"$RAW/m3-slow2.json"
echo "  not streamed → status/total/first-byte $(MAXTIME=60 req "$HOP1/v1/chat/completions" POST "$RAW/m3-slow2.json" LITELLM_PROBE_MASTER m3-slow2)"
