#!/bin/bash
# Spec action 8's measurements: LiteLLM 1.98.0's router fallbacks, locally, no provider call, no money.
set -u
cd /Users/rich/Developer/manifest
MK=$(awk -F= '/^LITELLM_MASTER_KEY=/{print substr($0, index($0,"=")+1)}' .env)
U=http://127.0.0.1:7106; H=(-H "authorization: Bearer $MK" -H 'content-type: application/json')
TS=$(date +%s); P=probe-capable-primary; DID=probe-capable-primary-$TS; USR=probe-capable-user-$TS
echo "=== register the primary: openai/gpt-6-luna at an UNREACHABLE api_base (the network-off case), pinned"
curl -s -o /dev/null -w 'model/new %{http_code}\n' -X POST $U/model/new "${H[@]}" -d "{\"model_name\":\"$P\",\"litellm_params\":{\"model\":\"openai/gpt-6-luna\",\"api_base\":\"http://127.0.0.1:9/v1\",\"api_key\":\"sk-probe-not-a-key\",\"input_cost_per_token\":1e-07,\"output_cost_per_token\":5e-07},\"model_info\":{\"id\":\"$DID\",\"max_classification\":\"internal\"}}"
echo "=== (1) POST /fallback"
curl -s -w '\nHTTP %{http_code}\n' -X POST $U/fallback "${H[@]}" -d "{\"model\":\"$P\",\"fallback_models\":[\"default-chat\"],\"fallback_type\":\"general\"}" | cut -c1-300
curl -s -w '\nHTTP %{http_code}\n' "$U/fallback/$P?fallback_type=general" -H "authorization: Bearer $MK" | cut -c1-300
curl -s -o /dev/null -w 'user/new %{http_code}\n' -X POST $U/user/new "${H[@]}" -d "{\"user_id\":\"$USR\",\"max_budget\":1,\"auto_create_key\":false}"
mint() { curl -s -X POST $U/key/generate "${H[@]}" -d "{\"user_id\":\"$USR\",\"key_alias\":\"probe-capable-key-$1-$TS\",\"models\":$2,\"allowed_routes\":[\"/v1/chat/completions\"],\"duration\":\"600s\",\"max_budget\":0.5}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["key"])'; }
chat() { curl -s -D /tmp/claude-501/fb-h.txt -X POST $U/v1/chat/completions -H "authorization: Bearer $1" -H 'content-type: application/json' -d "{\"model\":\"$P\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"Answer with the single word ok.\"}]}" -w '\nHTTP %{http_code}\n' > /tmp/claude-501/fb-b.txt; python3 - <<'PY'
raw=open('/tmp/claude-501/fb-b.txt').read(); body,_,st=raw.rpartition('\nHTTP ')
import json
try:
  d=json.loads(body)
  print(' status',st.strip(),'|', ('error: '+str(d['error'].get('type'))+' '+str(d['error'].get('message'))[:220]) if 'error' in d else ('model='+str(d.get('model'))+' content='+repr(d['choices'][0]['message'].get('content'))[:40]+' usage='+str((d.get('usage') or {}).get('prompt_tokens'))+'+'+str((d.get('usage') or {}).get('completion_tokens'))))
except Exception as e: print(' status',st.strip(),'unparsed',body[:200])
for l in open('/tmp/claude-501/fb-h.txt'):
  if l.lower().startswith(('x-litellm-attempted-fallbacks','x-litellm-model-group','x-litellm-model-id','x-litellm-response-cost','x-litellm-model-api-base')): print(' ',l.strip()[:160])
PY
}
spend() { for i in $(seq 1 18); do S=$(curl -s "$U/key/info?key=$1" -H "authorization: Bearer $MK" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("info",{}).get("spend"))'); [ "$S" != "0.0" ] && [ "$S" != "None" ] && break; sleep 5; done; echo "  key spend: $S (after ~$((i*5)) s)"; }
K1=$(mint only "[\"$P\"]"); K2=$(mint both "[\"$P\",\"default-chat\"]")
echo "=== (3a) a key holding ONLY the primary"; chat "$K1"; spend "$K1"
echo "=== (2)/(3b)/(4) a key holding the primary AND default-chat"; chat "$K2"; spend "$K2"
echo "=== (6) DELETE /fallback, then the same call"
curl -s -w '\nHTTP %{http_code}\n' -X DELETE "$U/fallback/$P?fallback_type=general" -H "authorization: Bearer $MK" | cut -c1-200
chat "$K2"
echo "=== cleanup"
curl -s -o /dev/null -w 'key/delete %{http_code}\n' -X POST $U/key/delete "${H[@]}" -d "{\"key_aliases\":[\"probe-capable-key-only-$TS\",\"probe-capable-key-both-$TS\"]}"
curl -s -o /dev/null -w 'user/delete %{http_code}\n' -X POST $U/user/delete "${H[@]}" -d "{\"user_ids\":[\"$USR\"]}"
curl -s -o /dev/null -w 'model/delete %{http_code}\n' -X POST $U/model/delete "${H[@]}" -d "{\"id\":\"$DID\"}"
curl -s "$U/fallback/$P?fallback_type=general" -H "authorization: Bearer $MK" -w ' HTTP %{http_code}\n' | cut -c1-160
docker exec manifest-postgres psql -U manifest -d litellm -Atc 'select count(*) from "LiteLLM_ProxyModelTable"' | sed 's/^/model rows left: /'
docker exec manifest-postgres psql -U manifest -d litellm -Atc "select param_name, left(param_value::text,200) from \"LiteLLM_Config\" where param_name ilike '%router%' or param_value::text ilike '%fallback%'" | sed 's/^/config: /'
