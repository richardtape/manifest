#!/bin/bash
# The review's I1: does a price PINNED on a DB-held deployment (litellm_params.*_cost_per_token) override LiteLLM's maps,
# show in /model/info, and charge spend? Local model, no network, no money. Everything probe-capable-*, deleted here.
set -u
cd /Users/rich/Developer/manifest
MK=$(awk -F= '/^LITELLM_MASTER_KEY=/{print substr($0, index($0,"=")+1)}' .env)
U=http://127.0.0.1:7106; H=(-H "authorization: Bearer $MK" -H 'content-type: application/json')
TS=$(date +%s)
new() { curl -s -o /dev/null -w "model/new $1 HTTP %{http_code}\n" -X POST $U/model/new "${H[@]}" -d "$2"; }
new terra-pinned "{\"model_name\":\"probe-capable-pin-a\",\"litellm_params\":{\"model\":\"openai/gpt-6-terra\",\"input_cost_per_token\":2e-06,\"output_cost_per_token\":1e-05},\"model_info\":{\"id\":\"probe-capable-pin-a-$TS\",\"max_classification\":\"internal\"}}"
new luna-pinned-diff "{\"model_name\":\"probe-capable-pin-b\",\"litellm_params\":{\"model\":\"openai/gpt-6-luna\",\"input_cost_per_token\":3e-07,\"output_cost_per_token\":7e-07},\"model_info\":{\"id\":\"probe-capable-pin-b-$TS\",\"max_classification\":\"internal\"}}"
new local-pinned "{\"model_name\":\"probe-capable-pin-c\",\"litellm_params\":{\"model\":\"ollama_chat/qwen3.5:4b\",\"api_base\":\"http://host.docker.internal:11434\",\"think\":false,\"input_cost_per_token\":0.00005,\"output_cost_per_token\":0.0001},\"model_info\":{\"id\":\"probe-capable-pin-c-$TS\",\"max_classification\":\"internal\"}}"
echo "=== /model/info"
curl -s $U/model/info -H "authorization: Bearer $MK" | python3 -c "
import json,sys
for r in json.load(sys.stdin)['data']:
  if r['model_name'].startswith('probe-capable') or r['model_name']=='default-chat-large':
    mi=r['model_info']; lp=r['litellm_params']
    print(r['model_name'], lp.get('model'), 'lp.in=',lp.get('input_cost_per_token'), 'lp.out=',lp.get('output_cost_per_token'), '| mi.in=',mi.get('input_cost_per_token'), 'mi.out=',mi.get('output_cost_per_token'))"
echo "=== a chat on the local pinned deployment (no network), spend at the pinned price?"
curl -s -o /dev/null -w 'user/new %{http_code}\n' -X POST $U/user/new "${H[@]}" -d "{\"user_id\":\"probe-capable-user-$TS\",\"max_budget\":1,\"auto_create_key\":false}"
KEY=$(curl -s -X POST $U/key/generate "${H[@]}" -d "{\"user_id\":\"probe-capable-user-$TS\",\"key_alias\":\"probe-capable-key-$TS\",\"models\":[\"probe-capable-pin-c\"],\"duration\":\"600s\",\"max_budget\":0.5}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["key"])')
curl -s -X POST $U/v1/chat/completions -H "authorization: Bearer $KEY" -H 'content-type: application/json' -d '{"model":"probe-capable-pin-c","max_tokens":8,"messages":[{"role":"user","content":"Answer with the single word ok."}]}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print("usage", d.get("usage",{}).get("prompt_tokens"), d.get("usage",{}).get("completion_tokens"), d.get("error",""))' | tee /tmp/claude-501/t12a-usage.txt
for i in $(seq 1 24); do S=$(curl -s "$U/key/info?key=$KEY" -H "authorization: Bearer $MK" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("info",{}).get("spend"))'); [ "$S" != "0.0" ] && [ "$S" != "None" ] && break; sleep 5; done
echo "key spend: $S (after ~$((i*5)) s); pinned price 5e-05 in / 1e-04 out would give prompt*5e-05 + completion*1e-04"
echo "=== cleanup"
curl -s -o /dev/null -w 'key/delete %{http_code}\n' -X POST $U/key/delete "${H[@]}" -d "{\"key_aliases\":[\"probe-capable-key-$TS\"]}"
curl -s -o /dev/null -w 'user/delete %{http_code}\n' -X POST $U/user/delete "${H[@]}" -d "{\"user_ids\":[\"probe-capable-user-$TS\"]}"
for x in a b c; do curl -s -o /dev/null -w "model/delete $x %{http_code}\n" -X POST $U/model/delete "${H[@]}" -d "{\"id\":\"probe-capable-pin-$x-$TS\"}"; done
docker exec manifest-postgres psql -U manifest -d litellm -Atc 'select count(*) from "LiteLLM_ProxyModelTable"' | sed 's/^/rows left: /'
