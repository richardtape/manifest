#!/usr/bin/env bash
# [M7] Where the key goes — FOUR CASES ON BOTH PROVIDERS (C1, I2), each a deployment whose api_base is the host stub and
# one call. gw-probe's OPENAI_API_KEY is a canary, so `canary` means LiteLLM fell back to OPENAI_API_KEY. The stub
# records only the bearer's CLASS. Then os.environ/MANIFEST_STUB_BEARER on openai/ (the stand-in Task 2's Docker
# case rests on), and the count of the real key's value in gw-probe's logs and this probe's files.
#   SCRATCH=<scratchpad> bash m7.sh   (after up.sh)
. "$(dirname "$0")/lib.sh"
echo "## [M7] $(date '+%Y-%m-%d %H:%M:%S %Z')"
RUN=$(date +%H%M%S)
n=0
one() { # <provider> <label> <api_key json fragment, e.g. ,"api_key":"…" or empty>
  n=$((n + 1))
  local name="probe-m7-$n"
  register "m7-new-$n" "{\"model_name\":\"$name\",\"litellm_params\":{\"model\":\"$1/probe-m7\",\"api_base\":\"http://host.docker.internal:7198/v1\"$3},\"model_info\":{\"id\":\"$name-$RUN\",\"max_classification\":\"internal\"}}" >/dev/null
  curl -s "$STUB/__reset" >/dev/null
  printf '{"model":"%s","messages":[{"role":"user","content":"hi"}]}' "$name" >"$RAW/m7-$n.json"
  local r
  r=$(req "$HOP1/v1/chat/completions" POST "$RAW/m7-$n.json" LITELLM_PROBE_MASTER "m7-$n")
  printf '  %-14s %-44s → %s; the stub saw: %s' "$1/" "$2" "$r" "$(curl -s "$STUB/__log" | jq -r '[.[].bearer] | if length == 0 then "NO CALL" else join(",") end')"
  [ "${r%% *}" = 200 ] || printf '; client: %s' "$(jq -c '.error | {type, code, message: (.message // "" | .[0:160])}' "$RAW/m7-$n.b" 2>&1 | red)"
  echo
}
for P in openai litellm_proxy; do
  echo "### $P"
  one "$P" "os.environ/PROBE_UNSET (no such variable)" ',"api_key":"os.environ/PROBE_UNSET"'
  one "$P" "os.environ/PROBE_EMPTY (set, empty)" ',"api_key":"os.environ/PROBE_EMPTY"'
  one "$P" "os.environ/STORE_MODEL_IN_DB (\"True\")" ',"api_key":"os.environ/STORE_MODEL_IN_DB"'
  one "$P" "no api_key at all" ''
done
echo "### the stand-in"
one openai "os.environ/MANIFEST_STUB_BEARER" ',"api_key":"os.environ/MANIFEST_STUB_BEARER"'
echo "### 5. the real key's value — count in docker logs gw-probe: $(docker logs gw-probe 2>&1 | perl -ne '$n++ if index($_, $ENV{UBC_AI_GATEWAY_API_KEY}) >= 0; END { print $n+0 }'); in this probe's raw files: $(cat "$RAW"/* 2>/dev/null | perl -ne '$n++ if index($_, $ENV{UBC_AI_GATEWAY_API_KEY}) >= 0; END { print $n+0 }'); the probe key's, docker logs: $(docker logs gw-probe 2>&1 | perl -ne '$n++ if length($ENV{GW_PROBE_KEY} // "") && index($_, $ENV{GW_PROBE_KEY}) >= 0; END { print $n+0 }')"
