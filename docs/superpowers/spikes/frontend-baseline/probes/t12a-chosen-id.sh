#!/bin/bash
set -u
cd /Users/rich/Developer/manifest
MK=$(awk -F= '/^LITELLM_MASTER_KEY=/{print substr($0, index($0,"=")+1)}' .env)
U=http://127.0.0.1:7106
post() { curl -s -w '\nHTTP %{http_code}\n' -X POST "$U$1" -H "authorization: Bearer $MK" -H 'content-type: application/json' -d "$2"; }
db() { docker exec manifest-postgres psql -U manifest -d litellm -Atc 'select model_id, model_name from "LiteLLM_ProxyModelTable"'; }
ID1=probe-capable-id-$(date +%s)-a
ID2=probe-capable-id-$(date +%s)-b
echo "=== (g) our own model_info.id, a priced model"
post /model/new "{\"model_name\":\"probe-capable-g\",\"litellm_params\":{\"model\":\"openai/gpt-6-luna\"},\"model_info\":{\"id\":\"$ID1\",\"max_classification\":\"internal\"}}" | cut -c1-200
echo "=== (h) our own model_info.id, an unknown provider"
post /model/new "{\"model_name\":\"probe-capable-h\",\"litellm_params\":{\"model\":\"nowhere/whatever\"},\"model_info\":{\"id\":\"$ID2\",\"max_classification\":\"internal\"}}" | cut -c1-200
echo "=== db"; db
echo "=== /model/info ids"
curl -s "$U/model/info" -H "authorization: Bearer $MK" | python3 -c "import json,sys; [print(r['model_name'], r['model_info'].get('id'), r['model_info'].get('db_model')) for r in json.load(sys.stdin)['data']]"
echo "=== delete both by our ids"
post /model/delete "{\"id\":\"$ID1\"}"; post /model/delete "{\"id\":\"$ID2\"}"
echo "=== db after"; db; echo "(end)"
