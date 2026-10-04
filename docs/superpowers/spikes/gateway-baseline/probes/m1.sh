#!/usr/bin/env bash
# [M1] The gateway's models, and the key's own limits — direct to the gateway, with the REAL key by `curl -K -`.
#   SCRATCH=<scratchpad> bash m1.sh
# Records model ids, each model's mode and prices, and only PRESENT/ABSENT for litellm_params, api_base and api_key
# (M9: LTIC's upstream addresses are not this repository's to publish); from /key/info only the eight fields the plan
# names. Raw answers stay in $SCRATCH/raw, deleted at Step 10.
. "$(dirname "$0")/lib.sh"
echo "## [M1] $(date '+%Y-%m-%d %H:%M:%S %Z')"

echo "### 1. GET /v1/models → $(req "$GW/v1/models" GET - UBC_AI_GATEWAY_API_KEY m1-models)"
jq -r '.data[]?.id' "$RAW/m1-models.b" | sort
echo "x-litellm-version: $(grep -i '^x-litellm-version' "$RAW/m1-models.h" | tr -d '\r' | cut -d' ' -f2-)"
echo "headers: $(heads m1-models)"

for p in /model/info /v1/model/info; do
  tag=m1-info$(printf '%s' "$p" | tr '/' '-')
  echo "### 2. GET $p → $(req "$GW$p" GET - UBC_AI_GATEWAY_API_KEY "$tag")"
  jq -r '
    if (.data | type) == "array" then
      .data[] | [
        .model_name,
        ("mode=" + ((.model_info.mode // "-") | tostring)),
        ("in=" + ((.model_info.input_cost_per_token // "-") | tostring)),
        ("out=" + ((.model_info.output_cost_per_token // "-") | tostring)),
        ("cache_read=" + ((.model_info.cache_read_input_token_cost // "-") | tostring)),
        ("provider=" + ((.model_info.litellm_provider // "-") | tostring)),
        (if has("litellm_params") and .litellm_params != null then "litellm_params:PRESENT" else "litellm_params:ABSENT" end),
        (if (.litellm_params // {}) | has("api_base") then "api_base:PRESENT" else "api_base:ABSENT" end),
        (if (.litellm_params // {}) | has("api_key") then "api_key:PRESENT" else "api_key:ABSENT" end)
      ] | @tsv
    else "not a model list: " + (keys | join(",")) end' "$RAW/$tag.b" 2>&1 | red
  [ "$(head -c1 "$RAW/$tag.b")" = "{" ] || echo "body: $(bodyof "$tag" 300)"
done

echo "### 3. GET /key/info → $(req "$GW/key/info" GET - UBC_AI_GATEWAY_API_KEY m1-keyinfo)"
jq '(.info // .) | {max_budget, spend, budget_duration, budget_reset_at, expires, rpm_limit, tpm_limit, models}' \
  "$RAW/m1-keyinfo.b" 2>&1 | red
[ "$(head -c1 "$RAW/m1-keyinfo.b")" = "{" ] || echo "body: $(bodyof m1-keyinfo 300)"

echo "### 4. the gateway's LiteLLM version: $(grep -ih '^x-litellm-version' "$RAW"/m1-*.h | head -1 | tr -d '\r' | cut -d' ' -f2-)"
