#!/bin/bash
# Task 12b's review: can a REQUEST's own fallbacks reach a model outside the key's list, and does the ROUTER follow a fallback's own
# fallbacks? Locally, no provider call, no money: every target is Ollama, every "failing" deployment an address nothing listens on.
set -u
cd /Users/rich/Developer/manifest
MK=$(awk -F= '/^LITELLM_MASTER_KEY=/{print substr($0, index($0,"=")+1)}' .env)
U=http://127.0.0.1:7106; H=(-H "authorization: Bearer $MK" -H 'content-type: application/json')
T=${TMPDIR:-/tmp}/t12b-review.$$; mkdir -p "$T"
TS=$(date +%s); USR=probe-review-user-$TS; A=probe-chain-a; B=probe-chain-b
dead() { curl -s -o /dev/null -w "model/new $1 %{http_code}\n" -X POST $U/model/new "${H[@]}" -d "{\"model_name\":\"$1\",\"litellm_params\":{\"model\":\"openai/gpt-6-luna\",\"api_base\":\"http://127.0.0.1:9/v1\",\"api_key\":\"sk-probe-not-a-key\",\"input_cost_per_token\":1e-07,\"output_cost_per_token\":5e-07},\"model_info\":{\"id\":\"$1-$TS\",\"max_classification\":\"internal\"}}"; }
mint() { curl -s -X POST $U/key/generate "${H[@]}" -d "{\"user_id\":\"$USR\",\"key_alias\":\"probe-review-$1-$TS\",\"models\":$2,\"allowed_routes\":[\"/v1/chat/completions\"],\"duration\":\"900s\",\"max_budget\":0.5}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["key"])'; }
chat() { curl -s -D "$T/h" -X POST $U/v1/chat/completions -H "authorization: Bearer $1" -H 'content-type: application/json' -d "$2" -w '\nHTTP %{http_code}\n' > "$T/b"; python3 - "$T" <<'PY'
import json,sys
t=sys.argv[1]; raw=open(t+'/b').read(); body,_,st=raw.rpartition('\nHTTP ')
try:
  d=json.loads(body)
  print('  chat', st.strip(), '|', ('error: '+str(d['error'].get('type'))+' '+str(d['error'].get('message'))[:220]) if 'error' in d else ('model='+str(d.get('model'))))
except Exception: print('  chat', st.strip(), 'unparsed', body[:200])
for l in open(t+'/h'):
  if l.lower().startswith(('x-litellm-attempted-fallbacks','x-litellm-model-group')): print('   ', l.strip()[:120])
PY
}
ask() { echo "{\"model\":\"$1\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"Answer with the single word ok.\"}]$2}"; }
curl -s -o /dev/null -w 'user/new %{http_code}\n' -X POST $U/user/new "${H[@]}" -d "{\"user_id\":\"$USR\",\"max_budget\":1,\"auto_create_key\":false}"
ONLY=$(mint only '["default-chat-onprem"]'); BOTH=$(mint both '["default-chat-onprem","default-chat"]')
echo "=== Q1 a key holding ONLY default-chat-onprem asks for default-chat"; chat "$ONLY" "$(ask default-chat '')"
echo "=== Q2 the same key, a REQUEST-SIDE fallback to default-chat, forced"; chat "$ONLY" "$(ask default-chat-onprem ',"fallbacks":["default-chat"],"mock_testing_fallbacks":true')"
echo "=== Q3 a key holding BOTH, the same request"; chat "$BOTH" "$(ask default-chat-onprem ',"fallbacks":["default-chat"],"mock_testing_fallbacks":true')"
echo "=== Q4 router fallbacks chain: A → B → default-chat, a key holding ONLY A"
dead $A; dead $B
curl -s -o /dev/null -w 'fallback A→B %{http_code}\n' -X POST $U/fallback "${H[@]}" -d "{\"model\":\"$A\",\"fallback_models\":[\"$B\"],\"fallback_type\":\"general\"}"
curl -s -o /dev/null -w 'fallback B→default-chat %{http_code}\n' -X POST $U/fallback "${H[@]}" -d "{\"model\":\"$B\",\"fallback_models\":[\"default-chat\"],\"fallback_type\":\"general\"}"
KA=$(mint a "[\"$A\"]"); chat "$KA" "$(ask $A '')"
echo "=== cleanup"
for m in $A $B; do curl -s -o /dev/null -w "fallback/delete $m %{http_code}\n" -X DELETE "$U/fallback/$m?fallback_type=general" -H "authorization: Bearer $MK"; curl -s -o /dev/null -w "model/delete $m %{http_code}\n" -X POST $U/model/delete "${H[@]}" -d "{\"id\":\"$m-$TS\"}"; done
curl -s -o /dev/null -w 'user/delete %{http_code}\n' -X POST $U/user/delete "${H[@]}" -d "{\"user_ids\":[\"$USR\"]}"
docker exec manifest-postgres psql -U manifest -d litellm -Atc "select param_value::text from \"LiteLLM_Config\" where param_name = 'router_settings'" | sed 's/^/  router_settings: /'
docker exec manifest-postgres psql -U manifest -d litellm -Atc "select model_name, count(*) from \"LiteLLM_ProxyModelTable\" group by 1" | sed 's/^/  model rows: /'
rm -rf "$T"
