#!/usr/bin/env bash
# [M5] The error shapes the guard meets, through both hops, as the client sees each AND as the guard reads it.
#   SCRATCH=<scratchpad> CAPABLE=<id> PROBE_MODEL=<the probe key's one model> PHASE=<a-d|g|cii|e> bash m5.sh   (after m3.sh)
# Each case is its own model_name with a `general` fallback to probe-ok (the stub, answering "ok"), so the REAL guard
# (mounted under guard_inspect.py, which prints the failed attempt's class and status attributes) decides.
# PHASE=cii runs BEFORE PHASE=e, so the probe key's two answers cannot mix. (e) spends the PROBE key's budget, never
# the real key's: a few large-input calls direct to the gateway, 20 s apart, at most E_MAX of them.
. "$(dirname "$0")/lib.sh"
: "${CAPABLE:?}" "${PROBE_MODEL:?}" "${PHASE:?}"
REF=os.environ/UBC_AI_GATEWAY_API_KEY
RUN=$(date +%H%M%S)
OK_MSGS='[{"role":"user","content":"Reply with the single word: ok"}]'
echo "## [M5] phase $PHASE — $(date '+%Y-%m-%d %H:%M:%S %Z')"

case_model() { # <model_name> <provider/model> <api_base> <api_key>
  register "m5-new-$1" "{\"model_name\":\"$1\",\"litellm_params\":{\"model\":\"$2\",\"api_base\":\"$3\",\"api_key\":\"$4\"},\"model_info\":{\"id\":\"$1-$RUN\",\"max_classification\":\"internal\"}}" >/dev/null
  printf '{"model":"%s","fallback_models":["probe-ok"],"fallback_type":"general"}' "$1" >"$RAW/m5-fb-$1.json"
  admin POST /fallback "$RAW/m5-fb-$1.json" "m5-fb-$1" >/dev/null
}
run_case() { # <label> <model_name> <stream> [extra json, starting with a comma] [messages json]
  local label="$1" model="$2" st="$3" extra="${4:-}" msgs="${5:-$OK_MSGS}"
  local tag="m5-$label-$st"
  printf '{"model":"%s","messages":%s,"stream":%s%s}' "$model" "$msgs" "$st" "$extra" >"$RAW/$tag.json"
  local since
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  sleep 1
  local r
  r=$(req "$HOP1/v1/chat/completions" POST "$RAW/$tag.json" LITELLM_PROBE_MASTER "$tag" -N)
  sleep 2
  echo "### ($label) stream=$st → status/total/first-byte $r"
  echo "  attempted-fallbacks: $(grep -i '^x-litellm-attempted-fallbacks' "$RAW/$tag.h" | tr -d '\r' | cut -d' ' -f2-); x-litellm-model-id: $(grep -i '^x-litellm-model-id' "$RAW/$tag.h" | tr -d '\r' | cut -d' ' -f2-)"
  if [ "$st" = true ]; then
    echo "  first frame: $(grep -m1 '^data:' "$RAW/$tag.b" | cut -c1-400 | red)"
    echo "  frames: $(grep -c '^data:' "$RAW/$tag.b"); content: $(grep '^data: {' "$RAW/$tag.b" | sed 's/^data: //' | jq -r '.choices[0].delta.content // empty' 2>/dev/null | tr -d '\n' | cut -c1-40)"
    grep -q '^data:' "$RAW/$tag.b" || echo "  body: $(bodyof "$tag" 400)"
  else
    echo "  client sees: $(jq -c 'if .error then {type: .error.type, code: .error.code, param: .error.param, message: (.error.message // "" | .[0:260])} else {answered_by: .model, content: (.choices[0].message.content // "" | .[0:30])} end' "$RAW/$tag.b" 2>&1 | red)"
  fi
  echo "  guard: $(docker logs gw-probe --since "$since" 2>&1 | grep -E 'guard_inspect|manifest_guard: (refused|a provider|could not)' | cut -c1-300 | red | tr '\n' '|')"
}

case "$PHASE" in
a-d)
  run_case a-maxtokens probe-capable false ',"max_tokens":-1'
  run_case a-role probe-capable false '' '[{"role":"wizard","content":"hi"}]'
  run_case a-role probe-capable true '' '[{"role":"wizard","content":"hi"}]'
  run_case b-n probe-capable false ',"n":"abc"'
  run_case b-temp probe-capable false ',"temperature":"hot"'
  case_model probe-nosuch "openai/no-such-model-$RUN" "$GW/v1" "$REF"
  run_case c-i probe-nosuch false
  run_case c-i probe-nosuch true
  case_model probe-badkey "openai/$CAPABLE" "$GW/v1" os.environ/PROBE_WRONG_KEY
  run_case d probe-badkey false
  echo "  (d) the fragment the 401 echoes, in the client's answer: $(perl -ne 'while (/(sk-\.\.\.[A-Za-z0-9_-]+|sk-canary-[A-Za-z0-9_-]+|canary-wrong|-wrong)/g) { print "[$1] " }' "$RAW/m5-d-false.b")"
  FRAG="...rong"   # the canary sk-canary-wrong as LiteLLM echoes a key it refused: sk-...<last 4>
  echo "  (d) count of the canary's fragment '$FRAG' — docker logs gw-probe: $(docker logs gw-probe 2>&1 | grep -cF "$FRAG"); probe files: $(grep -lF "$FRAG" "$RAW"/m5-d-* 2>/dev/null | wc -l | tr -d ' ') file(s)"
  docker exec gw-probe-pg pg_dump -U postgres litellm >"$RAW/m5-dump.sql" 2>/dev/null
  echo "  (d) in LiteLLM's tables (clear-text dump): $(grep -cF "$FRAG" "$RAW/m5-dump.sql") line(s); error-log rows: $(docker exec gw-probe-pg psql -U postgres -d litellm -At -c 'select count(*) from "LiteLLM_ErrorLogs"' 2>&1); spend-log rows: $(docker exec gw-probe-pg psql -U postgres -d litellm -At -c 'select count(*) from "LiteLLM_SpendLogs"' 2>&1)"
  ;;
a2)
  # (a) again, with probe-capable GIVEN its fallback (the first a–d run left it with none, so the guard was never asked)
  printf '%s' '{"model":"probe-capable","fallback_models":["probe-ok"],"fallback_type":"general"}' >"$RAW/m5-fb-probe-capable.json"
  echo "  fallback probe-capable → probe-ok: $(admin POST /fallback "$RAW/m5-fb-probe-capable.json" m5-fb-probe-capable)"
  run_case a2-maxtokens probe-capable false ',"max_tokens":-1'
  run_case a2-maxtokens probe-capable true ',"max_tokens":-1'
  run_case a2-role probe-capable false '' '[{"role":"wizard","content":"hi"}]'
  run_case a2-role probe-capable true '' '[{"role":"wizard","content":"hi"}]'
  run_case a2-n probe-capable false ',"n":"abc"'
  echo "  key fragments anywhere in docker logs gw-probe (sk-...<x>): $(docker logs gw-probe 2>&1 | grep -cE 'sk-\.\.\.[A-Za-z0-9]'); 'Received API Key' lines: $(docker logs gw-probe 2>&1 | grep -c 'Received API Key')"
  ;;
g)
  case_model probe-unreach "openai/$CAPABLE" http://127.0.0.1:9/v1 sk-canary-unreach
  run_case g probe-unreach false
  run_case g probe-unreach true
  ;;
cii)
  [ -n "${GW_PROBE_KEY:-}" ] || { echo "no probe key loaded"; exit 1; }
  docker exec gw-probe sh -c '[ -n "$GW_PROBE_KEY" ]' || { echo "gw-probe lacks GW_PROBE_KEY — re-run up.sh"; exit 1; }
  case_model probe-cii "openai/$CAPABLE" "$GW/v1" os.environ/GW_PROBE_KEY
  run_case c-ii probe-cii false
  run_case c-ii probe-cii true
  ;;
e)
  [ -n "${GW_PROBE_KEY:-}" ] || { echo "no probe key loaded"; exit 1; }
  case_model probe-e "openai/$PROBE_MODEL" "$GW/v1" os.environ/GW_PROBE_KEY
  echo "### (e) baseline through both hops, before the budget is spent"
  run_case e-before probe-e false
  BIG=$(perl -e 'print join(" ", map { "Line $_ of a long fixed text for a budget measurement at the University of British Columbia." } 1..'"${E_LINES:-2000}"')')
  printf '{"model":"%s","messages":[{"role":"user","content":"%s Reply with the single word: ok"}],"max_tokens":5}' "$PROBE_MODEL" "$BIG" >"$RAW/m5-e-big.json"
  for n in $(seq 1 "${E_MAX:-12}"); do
    r=$(MAXTIME=180 req "$GW/v1/chat/completions" POST "$RAW/m5-e-big.json" GW_PROBE_KEY "m5-e-spend-$n")
    echo "  spend call $n, direct → $r  $(jq -c 'if .error then {error: {type: .error.type, code: .error.code, message: (.error.message // "" | .[0:200])}} else {prompt_tokens: .usage.prompt_tokens} end' "$RAW/m5-e-spend-$n.b" 2>&1 | red)  cost header: $(grep -i '^x-litellm-response-cost:' "$RAW/m5-e-spend-$n.h" | tr -d '\r' | cut -d' ' -f2-)"
    case "$r" in 2*) sleep 20 ;; *) break ;; esac
  done
  echo "### (e) the budget spent — through both hops"
  run_case e probe-e false
  run_case e probe-e true
  ;;
e2)
  # (e) again: the first run's identical prompts were served from the gateway's prompt cache after call 1 ($0.0016, then
  # $0.0000118 each), so the budget barely moved. Each call now begins with its own nonce, so nothing is a cached prefix.
  [ -n "${GW_PROBE_KEY:-}" ] || { echo "no probe key loaded"; exit 1; }
  for n in $(seq 1 "${E_MAX:-10}"); do
    NONCE=$(LC_ALL=C tr -dc a-z0-9 </dev/urandom | head -c 12)
    BIG=$(perl -e 'print join(" ", map { "Line $_ of a long fixed text for a budget measurement at the University of British Columbia." } 1..'"${E_LINES:-1500}"')')
    printf '{"model":"%s","messages":[{"role":"user","content":"Nonce %s. %s Reply with the single word: ok"}],"max_tokens":5}' "$PROBE_MODEL" "$NONCE" "$BIG" >"$RAW/m5-e2-big.json"
    r=$(MAXTIME=180 req "$GW/v1/chat/completions" POST "$RAW/m5-e2-big.json" GW_PROBE_KEY "m5-e2-spend-$n")
    echo "  spend call $n, direct, unique prefix → $r  $(jq -c 'if .error then {error: {type: .error.type, code: .error.code, message: (.error.message // "" | .[0:220])}} else {prompt_tokens: .usage.prompt_tokens, cached: .usage.prompt_tokens_details.cached_tokens} end' "$RAW/m5-e2-spend-$n.b" 2>&1 | red)  cost: $(grep -i '^x-litellm-response-cost:' "$RAW/m5-e2-spend-$n.h" | tr -d '\r' | cut -d' ' -f2); key spend/max: $(grep -i '^x-litellm-key-spend:' "$RAW/m5-e2-spend-$n.h" | tr -d '\r' | cut -d' ' -f2)/$(grep -i '^x-litellm-key-max-budget:' "$RAW/m5-e2-spend-$n.h" | tr -d '\r' | cut -d' ' -f2)"
    case "$r" in 2*) sleep 20 ;; *) break ;; esac
  done
  echo "### (e) the budget spent — through both hops"
  run_case e probe-e false
  run_case e probe-e true
  ;;
e3)
  # (e) at last: Rich lowered the probe key's budget to $0.01 (~21:0x), below the $0.016 it had spent. One direct call (hop 2:
  # the gateway's own refusal, and the budget header if it sends one), then the case through both hops, plain and streamed.
  [ -n "${GW_PROBE_KEY:-}" ] || { echo "no probe key loaded"; exit 1; }
  printf '{"model":"%s","messages":[{"role":"user","content":"Reply with the single word: ok"}],"max_tokens":5}' "$PROBE_MODEL" >"$RAW/m5-e3-direct.json"
  r=$(req "$GW/v1/chat/completions" POST "$RAW/m5-e3-direct.json" GW_PROBE_KEY m5-e3-direct)
  echo "### (e) direct, hop 2 → $r"
  echo "  the gateway says: $(jq -c 'if .error then {type: .error.type, code: .error.code, param: .error.param, message: (.error.message // "" | .[0:300])} else {answered: .model, usage: .usage} end' "$RAW/m5-e3-direct.b" 2>&1 | red)"
  echo "  budget headers: max=$(grep -i '^x-litellm-key-max-budget:' "$RAW/m5-e3-direct.h" | tr -d '\r' | cut -d' ' -f2) spend=$(grep -i '^x-litellm-key-spend:' "$RAW/m5-e3-direct.h" | tr -d '\r' | cut -d' ' -f2)"
  run_case e probe-e false
  run_case e probe-e true
  ;;
e4)
  # (e) as a caller sees it with NO fallback: the gateway's 429 names its key's alias and a fragment — does hop 1 pass that on?
  register m5-new-e-nofb "{\"model_name\":\"probe-e-nofb\",\"litellm_params\":{\"model\":\"openai/$PROBE_MODEL\",\"api_base\":\"$GW/v1\",\"api_key\":\"os.environ/GW_PROBE_KEY\"},\"model_info\":{\"id\":\"probe-e-nofb-$RUN\",\"max_classification\":\"internal\"}}" >/dev/null
  sleep 3
  run_case e-nofb probe-e-nofb false
  echo "  does the client's body name the gateway key's alias? $(grep -c 'manifest-gw-probe' "$RAW/m5-e-nofb-false.b") ; a key fragment (sk-...)? $(grep -cE 'sk-\.\.\.[A-Za-z0-9]' "$RAW/m5-e-nofb-false.b")"
  ;;
esac
