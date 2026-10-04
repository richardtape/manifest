#!/usr/bin/env bash
# [M6] The gateway's view of a call: which top-level body FIELDS and header NAMES hop 1 forwards to its provider (never
# values). The provider here is the host stub, with a literal canary api_key (I3). For the privacy record.
#   SCRATCH=<scratchpad> bash m6.sh   (after up.sh)
. "$(dirname "$0")/lib.sh"
echo "## [M6] $(date '+%Y-%m-%d %H:%M:%S %Z')"
register m6-new '{"model_name":"probe-view","litellm_params":{"model":"openai/probe-view","api_base":"http://host.docker.internal:7198/v1","api_key":"sk-canary-view"},"model_info":{"id":"probe-view-1","max_classification":"internal"}}' >/dev/null
# A key shaped like an app instance's: a budgeted LiteLLM user and metadata, the three routes.
printf '%s' '{"user_id":"mf-probe-sandbox","max_budget":1}' >"$RAW/m6-user.json"
admin POST /user/new "$RAW/m6-user.json" m6-user >/dev/null
mint K6 m6-key '{"user_id":"mf-probe-sandbox","models":["probe-view"],"allowed_routes":["/v1/chat/completions","/v1/embeddings","/v1/models"],"metadata":{"project":"probe","environment":"sandbox"},"max_budget":1}'
END_USER=$(printf 'puid-probe|probe|sandbox' | shasum -a 256 | cut -d' ' -f1)
for ST in false true; do
  curl -s "$STUB/__reset" >/dev/null
  printf '{"model":"probe-view","messages":[{"role":"user","content":"hi"}],"user":"%s","metadata":{"probe":"m6"},"stream":%s}' "$END_USER" "$ST" >"$RAW/m6-$ST.json"
  r=$(req "$HOP1/v1/chat/completions" POST "$RAW/m6-$ST.json" K6 "m6-$ST" -N \
    -H 'x-litellm-trace-id: probe-trace-m6' -H 'x-litellm-session-id: probe-session-m6' \
    -H 'traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' -H 'x-probe-custom: m6')
  echo "### stream=$ST → $r"
  curl -s "$STUB/__log" | jq -c '.[] | {path, bearer, stream, fields, headers}'
  # Is the end-user hash's VALUE forwarded? (a count against the stub's raw log is impossible — it keeps names only)
done
echo "  (the stub keeps names only; whether 'user' arrives is read from the field list above)"
