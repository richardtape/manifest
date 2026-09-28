#!/bin/bash
# Task 12a Step 1 (a)-(d): offline, no provider key. Every deployment is probe-capable-*, deleted here.
set -u
cd /Users/rich/Developer/manifest
MK=$(awk -F= '/^LITELLM_MASTER_KEY=/{print substr($0, index($0,"=")+1)}' .env)
U=http://127.0.0.1:7106
post() { curl -s -w '\nHTTP %{http_code}\n' -X POST "$U$1" -H "authorization: Bearer $MK" -H 'content-type: application/json' -d "$2"; }
info() { curl -s "$U/model/info" -H "authorization: Bearer $MK" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
for r in d:
  if r['model_name'].startswith('probe-capable') or r['model_name']=='default-chat-large':
    mi=r.get('model_info') or {}; lp=r.get('litellm_params') or {}
    print(json.dumps({'model_name':r['model_name'],'litellm_params':{k:(v if k!='api_key' else '<present>') for k,v in lp.items()},'id':mi.get('id'),'max_classification':mi.get('max_classification'),'input_cost_per_token':mi.get('input_cost_per_token','<absent>'),'output_cost_per_token':mi.get('output_cost_per_token','<absent>'),'db_model':mi.get('db_model'),'key':mi.get('key')}))
print('total entries', len(d), [r['model_name'] for r in d])
"; }
for M in openai/gpt-5.6-luna openai/gpt-6-luna openai/gpt-6-terra unpriced/whatever; do
  N=probe-capable-$(echo $M | tr '/.' '--')
  echo "=== (a) /model/new $N -> $M"
  post /model/new "{\"model_name\":\"$N\",\"litellm_params\":{\"model\":\"$M\"},\"model_info\":{\"max_classification\":\"internal\"}}" | tee /tmp/claude-501/new.json | cut -c1-600
done
echo "=== (b)/(c) /model/info"
info
echo "=== (d) delete each"
IDS=$(curl -s "$U/model/info" -H "authorization: Bearer $MK" | python3 -c "
import json,sys
print(' '.join(r['model_info']['id'] for r in json.load(sys.stdin)['data'] if r['model_name'].startswith('probe-capable')))")
for ID in $IDS; do echo "delete $ID"; post /model/delete "{\"id\":\"$ID\"}" | cut -c1-300; done
FIRST=$(echo $IDS | awk '{print $1}')
echo "=== (d2) second delete of $FIRST"
post /model/delete "{\"id\":\"$FIRST\"}" | cut -c1-400
echo "=== after"
info
