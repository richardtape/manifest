. /Users/rich/Developer/manifest/docs/superpowers/spikes/gateway-baseline/probes/lib.sh
echo "## [M4] follow-ups $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "### 3b. what key B (a SECOND key) read — the same conversation?"
for K in KR KB; do echo "  $K: $(jq -c '{object, status, model, types: [.output[]?.type], calls: [.output[]? | select(.type=="function_call") | .name], usage: {input_tokens: .usage.input_tokens, output_tokens: .usage.output_tokens}}' "$RAW/m4-get-$K.b" | red)"; done
echo "  identical bodies, KR vs KB: $(cmp -s "$RAW/m4-get-KR.b" "$RAW/m4-get-KB.b" && echo yes || echo no)"
echo "  hop 1's id vs the id it answers: requested prefix $(jq -r '.id' "$RAW/m4-r-false.b" | cut -c1-12)…, answered $(jq -r '.id' "$RAW/m4-get-KB.b" | cut -c1-12)…"
echo "### 3c. the follow-up's 400: $(bodyof m4-follow 400)"
echo "### 5b. the intake key's 403 body: $(bodyof m4-intake 300)"
echo "### 3d. what the stub saw for a GET by id (does hop 1 forward it to the provider?)"
curl -s "$STUB/__reset" >/dev/null
SID=$(jq -r '.id // empty' "$RAW/m4-stub.b")
KR=$(jq -r .key "$RAW/m4-key-r.b"); KB=$(jq -r .key "$RAW/m4-key-b.b"); export KR KB
echo "  GET stub-made response by KB → $(req "$HOP1/v1/responses/$SID" GET - KB m4-stubget)  stub saw: $(curl -s "$STUB/__log" | jq -c '[.[] | {method, path, bearer}]')"
echo "### 7 (re-measured, by the admin — a key whose allowed_routes omit /key/info cannot read itself)"
mint KN m4-key-n '{"models":["probe-capable","default-chat"],"allowed_routes":["/v1/chat/completions","/v1/embeddings","/v1/models","/v1/responses"],"max_budget":1}'
req "$HOP1/key/info?key=$KN" GET - LITELLM_PROBE_MASTER m4-n-before >/dev/null
echo "  before: routes $(jq -c '(.info // .).allowed_routes' "$RAW/m4-n-before.b"), models $(jq -c '(.info // .).models' "$RAW/m4-n-before.b")"
jq -n --arg k "$KN" '{key: $k, models: ["probe-capable"]}' >"$RAW/m4-n-narrow.json"
echo "  /key/update { models } → $(admin POST /key/update "$RAW/m4-n-narrow.json" m4-n-narrow)"
req "$HOP1/key/info?key=$KN" GET - LITELLM_PROBE_MASTER m4-n-after >/dev/null
echo "  after: routes $(jq -c '(.info // .).allowed_routes' "$RAW/m4-n-after.b"), models $(jq -c '(.info // .).models' "$RAW/m4-n-after.b")"
