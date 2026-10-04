#!/usr/bin/env bash
# [M3] follow-ups, after m3.sh's first run:
#  7.  litellm_proxy/<capable> registered properly (m3.sh's first body was broken by brace expansion: its 422 was mine);
#  6c. does a PINNED price change what hop 1 charges? Hop 1 charged exactly the gateway's cost in m3.sh — so pin the
#      map's price (Task 2's pin), then a price 10x it, and compare each charge with the gateway's own header;
#  9b. `timeout` (Decision 12) against `stream_timeout`, at the stub's /slow/ path, counting the stub's attempts.
#   SCRATCH=<scratchpad> CAPABLE=<id> bash m3b.sh
. "$(dirname "$0")/lib.sh"
: "${CAPABLE:?}"
REF=os.environ/UBC_AI_GATEWAY_API_KEY
echo "## [M3] follow-ups $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "  (correction to [M3].6's header line above: hop 1's x-litellm-model-api-base there is the GATEWAY's own address — that"
echo "   run's redactor classed every *.ubc.ca host alike; fixed. Its llm_provider-* values are re-read below.)"

mk() { # mk <model_name> <id> <provider/model> [extra litellm_params, starting with a comma]
  local body
  body=$(jq -nc --arg n "$1" --arg id "$2" --arg m "$3" --arg b "$GW/v1" --arg k "$REF" --argjson x "{${4#,}}" \
    '{model_name: $n, litellm_params: ({model: $m, api_base: $b, api_key: $k} + $x), model_info: {id: $id, max_classification: "internal"}}')
  register "m3b-new-$1" "$body"
}
cost_line() { # cost_line <tag> — hop 1's charge, the gateway's charge, and the gateway's breakdown
  printf 'hop 1 x-litellm-response-cost=%s; the gateway'"'"'s (llm_provider-x-litellm-response-cost)=%s; gateway breakdown: %s' \
    "$(grep -i '^x-litellm-response-cost:' "$RAW/$1.h" | tr -d '\r' | cut -d' ' -f2)" \
    "$(grep -i '^llm_provider-x-litellm-response-cost:' "$RAW/$1.h" | tr -d '\r' | cut -d' ' -f2)" \
    "$(grep -iE '^llm_provider-x-litellm-response-cost-(input|output|cache-read|cache-creation):' "$RAW/$1.h" | tr -d '\r' | sed 's/llm_provider-x-litellm-response-cost-//' | tr '\n' ' ')"
}

echo "### 7. litellm_proxy/$CAPABLE → $(mk probe-capable-proxy probe-gw-3 "litellm_proxy/$CAPABLE")"
admin GET /model/info - m3b-info >/dev/null
jq -r '.data[] | select(.model_info.id == "probe-gw-3") | "  price: in=\(.model_info.input_cost_per_token) out=\(.model_info.output_cost_per_token) cache_read=\(.model_info.cache_read_input_token_cost)"' "$RAW/m3b-info.b"
printf '%s' '{"model":"probe-capable-proxy","messages":[{"role":"user","content":"Reply with the single word: ok"}]}' >"$RAW/m3b-proxy.json"
echo "  chat → $(req "$HOP1/v1/chat/completions" POST "$RAW/m3b-proxy.json" LITELLM_PROBE_MASTER m3b-proxy)  $(jq -c '{model, usage: {prompt_tokens: .usage.prompt_tokens, completion_tokens: .usage.completion_tokens}, error: (.error | if . then {type, code} else null end)}' "$RAW/m3b-proxy.b" 2>&1 | red)"
echo "  $(cost_line m3b-proxy)"

echo "### 6c. a PINNED price (litellm_params input/output, as Task 2 pins): the map's price, then 10x it"
mk probe-pin1 probe-pin-1 "openai/$CAPABLE" ',"input_cost_per_token":1e-7,"output_cost_per_token":5e-7' >/dev/null
mk probe-pin10 probe-pin-10 "openai/$CAPABLE" ',"input_cost_per_token":1e-6,"output_cost_per_token":5e-6' >/dev/null
PRE=$(perl -e 'print join(" ", map { "Clause $_: the University of British Columbia operates campuses in Vancouver and the Okanagan, and this sentence is fixed preamble for a second cache measurement." } 1..90)')
for M in probe-pin1 probe-pin10; do
  for n in 1 2; do
    printf '{"model":"%s","messages":[{"role":"system","content":"%s"},{"role":"user","content":"Reply with the single word: ok"}]}' "$M" "$PRE" >"$RAW/m3b-$M-$n.json"
    r=$(req "$HOP1/v1/chat/completions" POST "$RAW/m3b-$M-$n.json" LITELLM_PROBE_MASTER "m3b-$M-$n")
    echo "  $M call $n → $r; usage $(jq -c '{prompt_tokens: .usage.prompt_tokens, cached_tokens: .usage.prompt_tokens_details.cached_tokens, completion_tokens: .usage.completion_tokens}' "$RAW/m3b-$M-$n.b" 2>&1)"
    echo "    $(cost_line "m3b-$M-$n")"
  done
done
echo "  the unpinned deployment (m3.sh's cache pair, re-read): call 1 $(cost_line m3-cache-1)"
echo "                                                         call 2 $(cost_line m3-cache-2)"

echo "### 9b. timeout against stream_timeout, at the stub's /slow/ path (first byte after 6 s); the stub counts attempts"
slow() { # slow <model_name> <extra litellm_params>
  register "m3b-new-$1" "{\"model_name\":\"$1\",\"litellm_params\":{\"model\":\"openai/probe-slow\",\"api_base\":\"http://host.docker.internal:7198/slow/v1\",\"api_key\":\"sk-canary-slow\"$2},\"model_info\":{\"id\":\"$1-1\",\"max_classification\":\"internal\"}}" >/dev/null
}
slow probe-slow-t ',"timeout":2'
slow probe-slow-t-st ',"timeout":2,"stream_timeout":2'
slow probe-slow-st-r0 ',"stream_timeout":2,"num_retries":0'
slow probe-slow-t-r0 ',"timeout":2,"num_retries":0'
for M in probe-slow-t probe-slow-t-st probe-slow-st-r0 probe-slow-t-r0; do
  for ST in false true; do
    curl -s "$STUB/__reset" >/dev/null
    printf '{"model":"%s","messages":[{"role":"user","content":"hi"}],"stream":%s}' "$M" "$ST" >"$RAW/m3b-$M-$ST.json"
    r=$(MAXTIME=60 req "$HOP1/v1/chat/completions" POST "$RAW/m3b-$M-$ST.json" LITELLM_PROBE_MASTER "m3b-$M-$ST" -N)
    echo "  $M stream=$ST → status/total/first-byte $r; stub attempts $(curl -s "$STUB/__log" | jq 'length'); retries header $(grep -i '^x-litellm-attempted-retries' "$RAW/m3b-$M-$ST.h" | tr -d '\r' | cut -d' ' -f2)"
  done
done
