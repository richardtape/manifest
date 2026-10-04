#!/usr/bin/env bash
# [M2] Hop 2 alone — direct to the gateway, with the REAL key — for the capable candidate and one on-premise candidate.
#   SCRATCH=<scratchpad> CAPABLE=<gateway model id> ONPREM=<gateway model id> bash m2.sh
# 1. chat, plain and streamed: status, the body's model, usage, the headers (redacted); 2. x-litellm-response-cost;
# 3. /chat/completions against /v1/chat/completions; 4. the capable candidate with a function tool on chat
# completions, reasoning_effort unset and then "none" (S5's case); 5. latency for Decision 12's timeout.
. "$(dirname "$0")/lib.sh"
: "${CAPABLE:?name the capable candidate}" "${ONPREM:?name the on-premise candidate}"
echo "## [M2] $(date '+%Y-%m-%d %H:%M:%S %Z')"

chat_body() { # <tag> <model> <stream> [extra json fields]
  local extra="${4:-}"
  json "$1" <<EOF
{"model":"$2","messages":[{"role":"user","content":"Reply with the single word: ok"}],"stream":$3${extra}}
EOF
}

for M in "$CAPABLE" "$ONPREM"; do
  t=m2-chat-$(printf '%s' "$M" | tr -c 'A-Za-z0-9' '_')
  echo "### 1. $M, not streamed → $(req "$GW/v1/chat/completions" POST "$(chat_body "$t" "$M" false)" UBC_AI_GATEWAY_API_KEY "$t")"
  jq -c '{model, usage, finish: .choices[0].finish_reason, content: (.choices[0].message.content // "" | .[0:40])}' "$RAW/$t.b" 2>&1 | red
  [ "$(head -c1 "$RAW/$t.b")" = "{" ] || echo "body: $(bodyof "$t" 400)"
  echo "headers: $(heads "$t")"
  echo "2. x-litellm-response-cost: $(grep -i '^x-litellm-response-cost' "$RAW/$t.h" | tr -d '\r' | cut -d' ' -f2-)"
  ts="$t-stream"
  echo "### 1. $M, streamed → $(req "$GW/v1/chat/completions" POST "$(chat_body "$ts" "$M" true ',"stream_options":{"include_usage":true}')" UBC_AI_GATEWAY_API_KEY "$ts" -N)"
  echo "frames: $(grep -c '^data:' "$RAW/$ts.b"); [DONE]: $(grep -c '^data: \[DONE\]' "$RAW/$ts.b")"
  grep '^data: {' "$RAW/$ts.b" | sed 's/^data: //' | jq -c 'select(.usage != null) | {model, usage}' 2>/dev/null | tail -1 | red
  grep '^data: {' "$RAW/$ts.b" | sed 's/^data: //' | jq -r '.model' 2>/dev/null | sort | uniq -c | red
  grep -q '^data: {' "$RAW/$ts.b" || echo "body: $(bodyof "$ts" 400)"
  echo "headers: $(heads "$ts")"
done

echo "### 3. /chat/completions (no /v1) → $(req "$GW/chat/completions" POST "$(chat_body m2-nov1 "$CAPABLE" false)" UBC_AI_GATEWAY_API_KEY m2-nov1)"
jq -c '{model, usage}' "$RAW/m2-nov1.b" 2>&1 | red

TOOL='"tools":[{"type":"function","function":{"name":"get_weather","description":"Get the current weather for a city","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}]'
for RE in unset none; do
  extra=""
  [ "$RE" = none ] && extra=',"reasoning_effort":"none"'
  t=m2-tool-$RE
  json "$t" <<EOF >/dev/null
{"model":"$CAPABLE","messages":[{"role":"user","content":"What is the weather in Vancouver right now? Use the tool."}],${TOOL}${extra}}
EOF
  echo "### 4. tool on chat completions, reasoning_effort $RE → $(req "$GW/v1/chat/completions" POST "$RAW/$t.json" UBC_AI_GATEWAY_API_KEY "$t")"
  jq -c '{finish: .choices[0].finish_reason, tool_calls: ((.choices[0].message.tool_calls // []) | map(.function.name)), error: (.error | if . then {type, code, param, message: (.message // "" | .[0:300])} else null end)}' "$RAW/$t.b" 2>&1 | red
done

echo "### 5. latency — the capable candidate, ~1,500 words, three times not streamed, then the first streamed frame"
json m2-long <<EOF >/dev/null
{"model":"$CAPABLE","messages":[{"role":"user","content":"Write an essay of about 1,500 words on the history of public universities in Canada. Plain prose, no headings."}],"stream":false}
EOF
for n in 1 2 3; do
  r=$(MAXTIME=600 req "$GW/v1/chat/completions" POST "$RAW/m2-long.json" UBC_AI_GATEWAY_API_KEY "m2-long-$n")
  echo "run $n: status/total/first-byte = $r; $(jq -c '{completion_tokens: .usage.completion_tokens, reasoning: .usage.completion_tokens_details.reasoning_tokens}' "$RAW/m2-long-$n.b" 2>&1)"
done
sed 's/"stream":false/"stream":true/' "$RAW/m2-long.json" >"$RAW/m2-long-stream.json"
START=$(perl -MTime::HiRes=time -e 'printf "%.3f", time')
printf 'header = "Authorization: Bearer %s"\n' "$UBC_AI_GATEWAY_API_KEY" |
  curl -sS -N -K - --max-time 600 -H 'content-type: application/json' --data-binary "@$RAW/m2-long-stream.json" \
    "$GW/v1/chat/completions" |
  START=$START perl -MTime::HiRes=time -ne 'if (/^data: \{/ && !$f) { printf "first frame after %.2f s\n", time - $ENV{START}; $f = 1 } if (/^data: \[DONE\]/) { printf "[DONE] after %.2f s\n", time - $ENV{START} }'
