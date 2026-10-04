#!/usr/bin/env bash
# [M3] 6d: a $0 gateway model (on-prem, the gateway prices it 0) PINNED at the on-premise stand-in's synthetic price
# ($1 / $3 a million, infra/litellm/config.yaml) — Decision 6's rule for a `confidential` gateway model. 6c found hop 1
# charging the GATEWAY's reported cost whatever its own pin says; does a pin bind when the gateway reports $0?
#   SCRATCH=<scratchpad> ONPREM=<id> bash m3d.sh
. "$(dirname "$0")/lib.sh"
: "${ONPREM:?}"
REF=os.environ/UBC_AI_GATEWAY_API_KEY
echo "## [M3] 6d — a \$0 gateway model pinned at the stand-in's synthetic price $(date '+%Y-%m-%d %H:%M:%S %Z')"
body=$(jq -nc --arg m "openai/$ONPREM" --arg b "$GW/v1" --arg k "$REF" \
  '{model_name: "probe-onprem-pin", litellm_params: {model: $m, api_base: $b, api_key: $k, input_cost_per_token: 1e-6, output_cost_per_token: 3e-6}, model_info: {id: "probe-onprem-pin-1", max_classification: "internal"}}')
echo "  register → $(register m3d-new "$body")"
mint KD m3d-key '{"models":["probe-onprem-pin","probe-onprem"],"max_budget":1}'
for M in probe-onprem-pin probe-onprem; do
  for ST in false true; do
    printf '{"model":"%s","messages":[{"role":"user","content":"Reply with the single word: ok"}],"stream":%s,"stream_options":{"include_usage":true}}' "$M" "$ST" >"$RAW/m3d-$M-$ST.json"
    a=$(spend KD "m3d-$M-$ST-a")
    r=$(req "$HOP1/v1/chat/completions" POST "$RAW/m3d-$M-$ST.json" KD "m3d-$M-$ST" -N)
    sleep 15
    b=$(spend KD "m3d-$M-$ST-b")
    if [ "$ST" = false ]; then u=$(jq -c '{p: .usage.prompt_tokens, c: .usage.completion_tokens}' "$RAW/m3d-$M-$ST.b" 2>&1)
    else u=$(grep '^data: {' "$RAW/m3d-$M-$ST.b" | sed 's/^data: //' | jq -c 'select(.usage != null) | {p: .usage.prompt_tokens, c: .usage.completion_tokens}' 2>/dev/null | tail -1); fi
    echo "  $M stream=$ST → $r; usage $u; hop 1 header cost=$(grep -i '^x-litellm-response-cost:' "$RAW/m3d-$M-$ST.h" | tr -d '\r' | cut -d' ' -f2); gateway's=$(grep -i '^llm_provider-x-litellm-response-cost:' "$RAW/m3d-$M-$ST.h" | tr -d '\r' | cut -d' ' -f2); the key's spend change=$(perl -e 'printf "%.10f", $ARGV[1]-$ARGV[0]' "$a" "$b")"
  done
done
echo "  (at the pin, usage x \$1/\$3 a million would be p x 1e-6 + c x 3e-6)"
