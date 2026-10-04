#!/usr/bin/env bash
# [M4] /v1/responses through both hops (THIS DECIDES TASK 5, at step 8). After m3.sh (probe-capable registered).
#   SCRATCH=<scratchpad> bash m4.sh
. "$(dirname "$0")/lib.sh"
echo "## [M4] $(date '+%Y-%m-%d %H:%M:%S %Z')"
THREE='"/v1/chat/completions","/v1/embeddings","/v1/models"'
MODELS='"probe-capable","probe-responses-stub","default-chat"'
mint KR m4-key-r "{\"models\":[$MODELS],\"allowed_routes\":[$THREE,\"/v1/responses\"],\"max_budget\":1}"
mint KB m4-key-b "{\"models\":[$MODELS],\"allowed_routes\":[$THREE,\"/v1/responses\"],\"max_budget\":1}"
mint KO m4-key-o "{\"models\":[$MODELS],\"allowed_routes\":[\"/v1/responses\"],\"max_budget\":1}"
mint KW m4-key-w "{\"models\":[$MODELS],\"allowed_routes\":[$THREE,\"/v1/responses\",\"/v1/responses/*\"],\"max_budget\":1}"
mint KI m4-key-i "{\"models\":[$MODELS],\"allowed_routes\":[$THREE],\"max_budget\":1}"
admin GET /model/info - m4-info >/dev/null
set -- $(jq -r '.data[] | select(.model_info.id == "probe-gw-1") | "\(.model_info.input_cost_per_token // 0) \(.model_info.output_cost_per_token // 0)"' "$RAW/m4-info.b")
PIN_IN=$1 PIN_OUT=$2
TOOLS='"tools":[{"type":"function","name":"get_weather","description":"Get the current weather for a city","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}]'
charge() { perl -e 'printf "%.10f", $ARGV[0]*$ARGV[2] + $ARGV[1]*$ARGV[3]' "$1" "$2" "$PIN_IN" "$PIN_OUT"; }

for ST in false true; do
  printf '{"model":"probe-capable","input":"What is the weather in Vancouver right now? Use the tool.",%s,"stream":%s}' "$TOOLS" "$ST" >"$RAW/m4-r-$ST.json"
  a=$(spend KR "m4-r-$ST-sa")
  r=$(req "$HOP1/v1/responses" POST "$RAW/m4-r-$ST.json" KR "m4-r-$ST" -N)
  sleep 15
  b=$(spend KR "m4-r-$ST-sb")
  echo "### 1. POST /v1/responses, tool, stream=$ST → $r"
  if [ "$ST" = false ]; then
    jq -c '{id_prefix: (.id // "" | .[0:12]), status, store, types: [.output[]?.type], calls: [.output[]? | select(.type == "function_call") | .name], usage: {input_tokens: .usage.input_tokens, output_tokens: .usage.output_tokens}, error: (.error | if . then {type, code} else null end)}' "$RAW/m4-r-$ST.b" 2>&1 | red
    RID=$(jq -r '.id // empty' "$RAW/m4-r-$ST.b")
    u_in=$(jq -r '.usage.input_tokens // 0' "$RAW/m4-r-$ST.b") u_out=$(jq -r '.usage.output_tokens // 0' "$RAW/m4-r-$ST.b")
  else
    echo "  events: $(grep '^event:' "$RAW/m4-r-$ST.b" | sort | uniq -c | tr -s ' ' | tr '\n' ';' | cut -c1-500)"
    last=$(grep '^data: ' "$RAW/m4-r-$ST.b" | sed 's/^data: //' | jq -c 'select(.type == "response.completed") | .response' 2>/dev/null | tail -1)
    echo "  completed: $(printf '%s' "$last" | jq -c '{types: [.output[]?.type], usage: {input_tokens: .usage.input_tokens, output_tokens: .usage.output_tokens}}' 2>&1)"
    u_in=$(printf '%s' "$last" | jq -r '.usage.input_tokens // 0' 2>/dev/null) u_out=$(printf '%s' "$last" | jq -r '.usage.output_tokens // 0' 2>/dev/null)
    grep -q '^event:' "$RAW/m4-r-$ST.b" || echo "  body: $(bodyof "m4-r-$ST" 400)"
  fi
  echo "  charged: $(perl -e 'printf "%.10f", $ARGV[1]-$ARGV[0]' "$a" "$b") against usage × the price $(charge "${u_in:-0}" "${u_out:-0}")"
done

echo "### 2. hop 1 to a stub: native /responses, or bridged to /chat/completions?"
register m4-new-stub '{"model_name":"probe-responses-stub","litellm_params":{"model":"openai/stub-resp","api_base":"http://host.docker.internal:7198/v1","api_key":"sk-canary-resp"},"model_info":{"id":"probe-resp-stub-1","max_classification":"internal"}}' >/dev/null
curl -s "$STUB/__reset" >/dev/null
printf '%s' '{"model":"probe-responses-stub","input":"hi"}' >"$RAW/m4-stub.json"
echo "  → $(req "$HOP1/v1/responses" POST "$RAW/m4-stub.json" KR m4-stub)"
echo "  the stub saw: $(curl -s "$STUB/__log" | jq -c '[.[] | {path, bearer}]')"

echo "### 3. the stored-response routes (id from step 1)"
if [ -n "${RID:-}" ]; then
  printf '{"model":"probe-capable","input":"And in Kelowna?","previous_response_id":"%s"}' "$RID" >"$RAW/m4-follow.json"
  echo "  follow-up with previous_response_id, key R → $(req "$HOP1/v1/responses" POST "$RAW/m4-follow.json" KR m4-follow)  $(jq -c '{status, types: [.output[]?.type], error: (.error | if . then {type, code} else null end)}' "$RAW/m4-follow.b" 2>&1 | red)"
  for K in KR KW KB KO KI; do
    echo "  GET /v1/responses/{id} with key $K → $(req "$HOP1/v1/responses/$RID" GET - "$K" "m4-get-$K")  $(jq -c '{id_matches: (.id == "'"$RID"'"), status, store, error: (.error | if . then {type, code, message: (.message // "" | .[0:160])} else null end)}' "$RAW/m4-get-$K.b" 2>&1 | red)"
  done
  echo "  (key B is a SECOND key with the same routes: anything but a refusal is one agent reading another's conversation)"
  echo "  GET /v1/responses/{id}/input_items with key KO → $(req "$HOP1/v1/responses/$RID/input_items" GET - KO m4-items-KO)  $(bodyof m4-items-KO 200)"
  echo "  GET /v1/responses/{id}/input_items with key KW → $(req "$HOP1/v1/responses/$RID/input_items" GET - KW m4-items-KW)  $(bodyof m4-items-KW 200)"
  echo "  the same id asked of the GATEWAY directly, real key → $(req "$GW/v1/responses/$RID" GET - UBC_AI_GATEWAY_API_KEY m4-get-gw)  $(bodyof m4-get-gw 200)"
fi

echo "### 4. how allowed_routes matches — key O lists only /v1/responses"
printf '%s' '{"model":"probe-capable","input":"Reply with the single word: ok"}' >"$RAW/m4-plain.json"
echo "  POST /v1/responses → $(req "$HOP1/v1/responses" POST "$RAW/m4-plain.json" KO m4-o-v1)"
echo "  POST /responses (no v1) → $(req "$HOP1/responses" POST "$RAW/m4-plain.json" KO m4-o-nov1)  $(bodyof m4-o-nov1 200)"
echo "  POST /v1/chat/completions (not listed) → $(req "$HOP1/v1/chat/completions" POST "$RAW/m3-chat.json" KO m4-o-chat)  $(bodyof m4-o-chat 200)"

echo "### 5. an intake-shaped key (the three routes only) on /v1/responses → $(req "$HOP1/v1/responses" POST "$RAW/m4-plain.json" KI m4-intake)"
jq -c '.error | {type, code, param, message: (.message // "" | .[0:200])}' "$RAW/m4-intake.b" 2>&1 | red

echo "### 6. /v1/responses on default-chat (Ollama, through host.docker.internal)"
printf '%s' '{"model":"default-chat","input":"Reply with the single word: ok"}' >"$RAW/m4-dc.json"
echo "  → $(MAXTIME=180 req "$HOP1/v1/responses" POST "$RAW/m4-dc.json" KR m4-dc)  $(jq -c '{status, types: [.output[]?.type], text: ([.output[]? | select(.type == "message") | .content[]?.text] | join("") | .[0:40]), error: (.error | if . then {type, code} else null end)}' "$RAW/m4-dc.b" 2>&1 | red)"

echo "### 7. does /key/update { models } keep allowed_routes?"
req "$HOP1/key/info" GET - KR m4-before >/dev/null
echo "  before: $(jq -c '(.info // .).allowed_routes' "$RAW/m4-before.b")"
jq -n --arg k "$KR" '{key: $k, models: ["probe-capable"]}' >"$RAW/m4-narrow.json"
echo "  /key/update → $(admin POST /key/update "$RAW/m4-narrow.json" m4-narrow)"
req "$HOP1/key/info" GET - KR m4-after >/dev/null
echo "  after: routes $(jq -c '(.info // .).allowed_routes' "$RAW/m4-after.b"), models $(jq -c '(.info // .).models' "$RAW/m4-after.b")"

echo "### 8. a tool on /v1/chat/completions through BOTH hops (what an agent on a Manifest key sees) — THIS DECIDES TASK 5"
CTOOL='"tools":[{"type":"function","function":{"name":"get_weather","description":"Get the current weather for a city","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}]'
for RE in unset none; do
  extra=""
  [ "$RE" = none ] && extra=',"reasoning_effort":"none"'
  printf '{"model":"probe-capable","messages":[{"role":"user","content":"What is the weather in Vancouver right now? Use the tool."}],%s%s}' "$CTOOL" "$extra" >"$RAW/m4-ctool-$RE.json"
  echo "  reasoning_effort $RE → $(req "$HOP1/v1/chat/completions" POST "$RAW/m4-ctool-$RE.json" KR "m4-ctool-$RE")  $(jq -c '{finish: .choices[0].finish_reason, tool_calls: ((.choices[0].message.tool_calls // []) | map(.function.name)), error: (.error | if . then {type, code, param, message: (.message // "" | .[0:300])} else null end)}' "$RAW/m4-ctool-$RE.b" 2>&1 | red)"
done
