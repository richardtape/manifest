#!/bin/bash
# Task 12b Step 1: LiteLLM 1.98.0's /fallback over a restart, an update, a delete and a repoint — locally, no provider call, no money.
# The primary is a PROBE name at an UNREACHABLE api_base with a key that is not a key: nothing leaves the container.
set -u
cd /Users/rich/Developer/manifest
MK=$(awk -F= '/^LITELLM_MASTER_KEY=/{print substr($0, index($0,"=")+1)}' .env)
U=http://127.0.0.1:7106; H=(-H "authorization: Bearer $MK" -H 'content-type: application/json')
T=${TMPDIR:-/tmp}/t12b.$$; mkdir -p "$T"
TS=$(date +%s); P=probe-fallback-primary; USR=probe-fallback-user-$TS; FB=default-chat-onprem
newprimary() { curl -s -o /dev/null -w "model/new $1 %{http_code}\n" -X POST $U/model/new "${H[@]}" -d "{\"model_name\":\"$P\",\"litellm_params\":{\"model\":\"openai/gpt-6-luna\",\"api_base\":\"http://127.0.0.1:9/v1\",\"api_key\":\"sk-probe-not-a-key\",\"input_cost_per_token\":1e-07,\"output_cost_per_token\":5e-07},\"model_info\":{\"id\":\"$1\",\"max_classification\":\"internal\"}}"; }
delprimary() { curl -s -o /dev/null -w "model/delete $1 %{http_code}\n" -X POST $U/model/delete "${H[@]}" -d "{\"id\":\"$1\"}"; }
post() { curl -s -w ' HTTP %{http_code}\n' -X POST $U/fallback "${H[@]}" -d "{\"model\":\"$P\",\"fallback_models\":$1,\"fallback_type\":\"general\"}" | cut -c1-260; }
get() { curl -s -w ' HTTP %{http_code}\n' "$U/fallback/$P?fallback_type=general" -H "authorization: Bearer $MK" | cut -c1-260; }
del() { curl -s -w ' HTTP %{http_code}\n' -X DELETE "$U/fallback/$P?fallback_type=general" -H "authorization: Bearer $MK" | cut -c1-200; }
db() { docker exec manifest-postgres psql -U manifest -d litellm -Atc "select param_value::text from \"LiteLLM_Config\" where param_name = 'router_settings'" | sed 's/^/  router_settings: /'; }
chat() { curl -s -D "$T/h" -X POST $U/v1/chat/completions -H "authorization: Bearer $1" -H 'content-type: application/json' -d "{\"model\":\"$P\",\"max_tokens\":8,\"messages\":[{\"role\":\"user\",\"content\":\"Answer with the single word ok.\"}]}" -w '\nHTTP %{http_code}\n' > "$T/b"; python3 - "$T" <<'PY'
import json,sys
t=sys.argv[1]; raw=open(t+'/b').read(); body,_,st=raw.rpartition('\nHTTP ')
try:
  d=json.loads(body)
  print('  chat', st.strip(), '|', ('error: '+str(d['error'].get('type'))+' '+str(d['error'].get('message'))[:200]) if 'error' in d else ('model='+str(d.get('model'))+' usage='+str((d.get('usage') or {}).get('prompt_tokens'))+'+'+str((d.get('usage') or {}).get('completion_tokens'))))
except Exception: print('  chat', st.strip(), 'unparsed', body[:200])
for l in open(t+'/h'):
  if l.lower().startswith(('x-litellm-attempted-fallbacks','x-litellm-model-group')): print('   ', l.strip()[:120])
PY
}
capable() { curl -s $U/model/info -H "authorization: Bearer $MK" | python3 -c 'import json,sys; [print("  default-chat-large:", d["litellm_params"].get("model"), "pinned", d["litellm_params"].get("input_cost_per_token"), d["model_info"].get("max_classification")) for d in json.load(sys.stdin)["data"] if d["model_name"]=="default-chat-large"]'; }
echo "=== before"; db; capable
newprimary probe-fallback-a-$TS
echo "=== P1 POST"; post "[\"$FB\"]"; db
echo "=== P2 the same POST again"; post "[\"$FB\"]"; db
echo "=== P2b a different list, then back"; post '["default-chat"]'; db; post "[\"$FB\"]" > /dev/null
echo "=== P3 GET"; get
curl -s -o /dev/null -w 'user/new %{http_code}\n' -X POST $U/user/new "${H[@]}" -d "{\"user_id\":\"$USR\",\"max_budget\":1,\"auto_create_key\":false}"
K=$(curl -s -X POST $U/key/generate "${H[@]}" -d "{\"user_id\":\"$USR\",\"key_alias\":\"probe-fallback-key-$TS\",\"models\":[\"$P\"],\"allowed_routes\":[\"/v1/chat/completions\"],\"duration\":\"900s\",\"max_budget\":0.5}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["key"])')
echo "=== P4 a key holding ONLY the primary"; chat "$K"
echo "=== P5 docker restart manifest-litellm"; docker restart manifest-litellm > /dev/null
for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' $U/health/liveliness)" = 200 ] && break; sleep 2; done; echo "  live after ~$((i*2)) s"
get; db; chat "$K"; capable
echo "=== P6 the primary deleted"; delprimary probe-fallback-a-$TS; get; echo "  POST while absent:"; post "[\"$FB\"]"
echo "=== P7 DELETE while absent from the router"; del; echo "  again:"; del; echo "  GET:"; get; db
echo "=== P8 a repoint keeps the name"; newprimary probe-fallback-b-$TS; post "[\"$FB\"]"; delprimary probe-fallback-b-$TS; newprimary probe-fallback-c-$TS; get; chat "$K"
echo "=== cleanup"; del
curl -s -o /dev/null -w 'key/delete %{http_code}\n' -X POST $U/key/delete "${H[@]}" -d "{\"key_aliases\":[\"probe-fallback-key-$TS\"]}"
curl -s -o /dev/null -w 'user/delete %{http_code}\n' -X POST $U/user/delete "${H[@]}" -d "{\"user_ids\":[\"$USR\"]}"
delprimary probe-fallback-c-$TS
db; capable
docker exec manifest-postgres psql -U manifest -d litellm -Atc "select model_name, count(*) from \"LiteLLM_ProxyModelTable\" group by 1" | sed 's/^/  model rows: /'
rm -rf "$T"
