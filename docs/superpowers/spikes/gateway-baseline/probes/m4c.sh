#!/usr/bin/env bash
# [M4c] AT RICH'S ASK (~20:50 PDT, relayed by manifest-af): can two DIFFERENT virtual keys of UBC's gateway read each
# other's stored responses — at the gateway itself, direct (hop 2 only)? A fact for Rich as the gateway's administrator.
#  1. the REAL key: one small POST /v1/responses on the capable model, `store` left at its default — its id kept in
#     $SCRATCH only;
#  2. the PROBE key: GET /v1/responses/{id}, then …/input_items — status and error type/code; on a 200 only WHICH FIELDS
#     came back, never the body's text;
#  3. the real key: DELETE /v1/responses/{id}, then GET again to see it gone.
#   SCRATCH=<scratchpad> CAPABLE=<id> bash m4c.sh
. "$(dirname "$0")/lib.sh"
: "${CAPABLE:?}"
[ -n "${GW_PROBE_KEY:-}" ] || { echo "no probe key"; exit 1; }
echo "## [M4c] two gateway keys and one stored response, direct to the gateway — $(date '+%Y-%m-%d %H:%M:%S %Z')"
printf '{"model":"%s","input":"Reply with the single word: ok"}' "$CAPABLE" >"$RAW/m4c-create.json"
echo "### 1. the real key: POST /v1/responses → $(req "$GW/v1/responses" POST "$RAW/m4c-create.json" UBC_AI_GATEWAY_API_KEY m4c-create)"
echo "  store: $(jq -c '.store' "$RAW/m4c-create.b"); status: $(jq -r '.status' "$RAW/m4c-create.b"); usage: $(jq -c '{input_tokens: .usage.input_tokens, output_tokens: .usage.output_tokens}' "$RAW/m4c-create.b"); cost header: $(grep -i '^x-litellm-response-cost:' "$RAW/m4c-create.h" | tr -d '\r' | cut -d' ' -f2)"
jq -r '.id // empty' "$RAW/m4c-create.b" >"$SCRATCH/m4c-id"
ID=$(cat "$SCRATCH/m4c-id")
[ -n "$ID" ] || { echo "  no id — stopping"; exit 1; }
echo "  (the id is kept in \$SCRATCH only)"
shape() { # status line, and on 200 only the field names; otherwise the error's type and code
  local tag="$1" r="$2"
  case "$r" in
    200*) printf "%s — ANSWERED; fields: %s; the same id: %s" "$r" "$(jq -c 'if type == "object" then (keys) else type end' "$RAW/$tag.b" 2>&1)" "$(jq -r --arg id "$ID" '(.id == $id) or (.first_id != null)' "$RAW/$tag.b" 2>&1)" ;;
    *) printf '%s — %s' "$r" "$(jq -c 'if .error then {type: .error.type, code: .error.code, message: (.error.message // "" | .[0:200])} elif .detail then {detail: (.detail | tostring | .[0:200])} else keys end' "$RAW/$tag.b" 2>&1 | red)" ;;
  esac
}
echo "### 2. the PROBE key: GET /v1/responses/{id} → $(shape m4c-get-probe "$(req "$GW/v1/responses/$ID" GET - GW_PROBE_KEY m4c-get-probe)")"
echo "  the PROBE key: GET /v1/responses/{id}/input_items → $(shape m4c-items-probe "$(req "$GW/v1/responses/$ID/input_items" GET - GW_PROBE_KEY m4c-items-probe)")"
echo "  (control) the REAL key: GET /v1/responses/{id} → $(shape m4c-get-real "$(req "$GW/v1/responses/$ID" GET - UBC_AI_GATEWAY_API_KEY m4c-get-real)")"
echo "### 3. the real key: DELETE /v1/responses/{id} → $(shape m4c-delete "$(req "$GW/v1/responses/$ID" DELETE - UBC_AI_GATEWAY_API_KEY m4c-delete)")"
echo "  then the real key's GET → $(shape m4c-get-after "$(req "$GW/v1/responses/$ID" GET - UBC_AI_GATEWAY_API_KEY m4c-get-after)")"
rm -f "$SCRATCH/m4c-id" "$RAW"/m4c-*.b
echo "  (the id and every body of this probe deleted from \$SCRATCH)"
