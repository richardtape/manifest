#!/bin/bash
# Task 12a Step 1 (e)/(f): ONE chat through a probe key limited to one probe deployment. Everything
# named probe-capable-*, deleted at the end. Prints no key. Usage: t12a-live.sh <label> <litellm model>
set -u
cd /Users/rich/Developer/manifest
LABEL=$1; MODEL=$2
MK=$(awk -F= '/^LITELLM_MASTER_KEY=/{print substr($0, index($0,"=")+1)}' .env)
U=http://127.0.0.1:7106
H=(-H "authorization: Bearer $MK" -H 'content-type: application/json')
TS=$(date +%s)
DEP=probe-capable-$LABEL; DID=probe-capable-$LABEL-$TS; USER=probe-capable-user-$TS; ALIAS=probe-capable-key-$TS
echo "=== container has OPENAI_API_KEY: $(docker exec manifest-litellm sh -c '[ -n "${OPENAI_API_KEY:-}" ] && echo yes || echo no')"
echo "=== register $DEP -> $MODEL (id $DID)"
curl -s -w ' HTTP %{http_code}\n' -X POST $U/model/new "${H[@]}" -d "{\"model_name\":\"$DEP\",\"litellm_params\":{\"model\":\"$MODEL\"},\"model_info\":{\"id\":\"$DID\",\"max_classification\":\"internal\"}}" | sed -E 's/"litellm_params":\{[^}]*\}/"litellm_params":<elided>/' | cut -c1-200
curl -s -o /dev/null -w 'user/new HTTP %{http_code}\n' -X POST $U/user/new "${H[@]}" -d "{\"user_id\":\"$USER\",\"max_budget\":1,\"auto_create_key\":false}"
KEY=$(curl -s -X POST $U/key/generate "${H[@]}" -d "{\"user_id\":\"$USER\",\"key_alias\":\"$ALIAS\",\"models\":[\"$DEP\"],\"allowed_routes\":[\"/v1/chat/completions\",\"/v1/embeddings\",\"/v1/models\"],\"duration\":\"600s\",\"max_budget\":0.1}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["key"])')
echo "key minted: ${KEY:+yes}"
echo "=== chat"
T0=$(date +%s)
curl -s -w '\nHTTP %{http_code}\n' -X POST $U/v1/chat/completions -H "authorization: Bearer $KEY" -H 'content-type: application/json' -d "{\"model\":\"$DEP\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: ok\"}]}" > /tmp/claude-501/t12a-chat.json
python3 - <<'PY'
import json
raw=open('/tmp/claude-501/t12a-chat.json').read()
body,_,status=raw.rpartition('\nHTTP ')
print('status', status.strip())
try:
  d=json.loads(body)
  if 'error' in d:
    e=d['error']; print('error type:', e.get('type'), '| code:', e.get('code'), '| message:', str(e.get('message'))[:400])
  else:
    print('model:', d.get('model'), '| content:', repr(d['choices'][0]['message'].get('content'))[:80], '| finish:', d['choices'][0].get('finish_reason'), '| usage:', d.get('usage'))
except Exception as ex: print('unparsed', body[:300])
PY
echo "chat took $(( $(date +%s) - T0 )) s"
echo "=== key spend (polled up to 120 s)"
for i in $(seq 1 24); do
  S=$(curl -s "$U/key/info?key=$KEY" -H "authorization: Bearer $MK" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("info",{}).get("spend"))')
  [ "$S" != "0.0" ] && [ "$S" != "0" ] && [ "$S" != "None" ] && break
  sleep 5
done
echo "key spend: $S (after ~$((i*5)) s)"
echo "=== cleanup"
curl -s -o /dev/null -w 'key/delete HTTP %{http_code}\n' -X POST $U/key/delete "${H[@]}" -d "{\"key_aliases\":[\"$ALIAS\"]}"
curl -s -o /dev/null -w 'user/delete HTTP %{http_code}\n' -X POST $U/user/delete "${H[@]}" -d "{\"user_ids\":[\"$USER\"]}"
curl -s -o /dev/null -w 'model/delete HTTP %{http_code}\n' -X POST $U/model/delete "${H[@]}" -d "{\"id\":\"$DID\"}"
docker exec manifest-postgres psql -U manifest -d litellm -Atc 'select count(*) from "LiteLLM_ProxyModelTable"' | sed 's/^/models left in the table: /'
