#!/usr/bin/env bash
# [M7] follow-up. m7.sh's case 3 — api_key `os.environ/STORE_MODEL_IN_DB`, which LiteLLM's get_secret turns into the
# BOOLEAN True — failed pydantic's LiteLLM_Params string check at the router's reload, and from then on EVERY later
# /model/new answered 500 "saved to the database, but … not live in this pod's router": cases 4–9 never went live.
# This measures: (1) are cases 1–2 (registered BEFORE the bad row) still served? (2) are 4–9 served now, after a
# periodic reload? (3) does deleting the bad row bring them live? then (4) cases 4–9 again under fresh names.
#   SCRATCH=<scratchpad> bash m7b.sh   (after m7.sh)
. "$(dirname "$0")/lib.sh"
echo "## [M7] follow-up — one boolean api_key and the router's reload — $(date '+%Y-%m-%d %H:%M:%S %Z')"
RUN0=$(jq -r '.model_id // empty' "$RAW/m7-new-1.b" | sed 's/^probe-m7-1-//')
served() { # served <model_name> — 200 if hop 1 serves it now
  printf '{"model":"%s","messages":[{"role":"user","content":"hi"}]}' "$1" >"$RAW/m7b-ask.json"
  req "$HOP1/v1/chat/completions" POST "$RAW/m7b-ask.json" LITELLM_PROBE_MASTER m7b-ask | cut -d' ' -f1
}
echo "### 1–2. served now? $(for n in 1 2 3 4 5 9; do printf 'probe-m7-%s=%s ' "$n" "$(served "probe-m7-$n")"; done)"
echo "  rows in LiteLLM_ProxyModelTable named probe-m7-*: $(docker exec gw-probe-pg psql -U postgres -d litellm -At -c "select count(*) from \"LiteLLM_ProxyModelTable\" where model_name like 'probe-m7-%'")"
printf '{"id":"probe-m7-3-%s"}' "$RUN0" >"$RAW/m7b-del.json"
echo "### 3. delete the bad row (probe-m7-3) → $(admin POST /model/delete "$RAW/m7b-del.json" m7b-del)  $(bodyof m7b-del 200)"
sleep 12
echo "  12 s later, served? $(for n in 1 2 4 5 9; do printf 'probe-m7-%s=%s ' "$n" "$(served "probe-m7-$n")"; done)"
echo "  gw-probe's log since the delete: reload errors $(docker logs gw-probe --since 15s 2>&1 | grep -c 'Error adding/deleting model to llm_router')"
echo "### 4. cases 4–9 again (fresh names, the bad row gone)"
n=10
again() { # <provider> <label> <api_key fragment>
  n=$((n + 1))
  local name="probe-m7-$n"
  register "m7b-new-$n" "{\"model_name\":\"$name\",\"litellm_params\":{\"model\":\"$1/probe-m7\",\"api_base\":\"http://host.docker.internal:7198/v1\"$3},\"model_info\":{\"id\":\"$name-b\",\"max_classification\":\"internal\"}}" >/dev/null
  curl -s "$STUB/__reset" >/dev/null
  printf '{"model":"%s","messages":[{"role":"user","content":"hi"}]}' "$name" >"$RAW/m7b-$n.json"
  local r
  r=$(req "$HOP1/v1/chat/completions" POST "$RAW/m7b-$n.json" LITELLM_PROBE_MASTER "m7b-$n")
  printf '  %-14s %-44s → register %s; call %s; the stub saw: %s' "$1/" "$2" "$(jq -r 'if .error then "REFUSED/NOT LIVE" else "ok" end' "$RAW/m7b-new-$n.b")" "${r%% *}" "$(curl -s "$STUB/__log" | jq -r '[.[].bearer] | if length == 0 then "NO CALL" else join(",") end')"
  [ "${r%% *}" = 200 ] || printf '; client: %s' "$(jq -c '.error | {type, code, message: (.message // "" | .[0:160])}' "$RAW/m7b-$n.b" 2>&1 | red)"
  echo
}
again openai "no api_key at all" ''
again litellm_proxy "os.environ/PROBE_UNSET (no such variable)" ',"api_key":"os.environ/PROBE_UNSET"'
again litellm_proxy "os.environ/PROBE_EMPTY (set, empty)" ',"api_key":"os.environ/PROBE_EMPTY"'
again litellm_proxy "no api_key at all" ''
again openai "os.environ/MANIFEST_STUB_BEARER" ',"api_key":"os.environ/MANIFEST_STUB_BEARER"'
echo "### the boolean case, LAST, on litellm_proxy/ — its register answer and whether it poisons the next registration"
again litellm_proxy "os.environ/STORE_MODEL_IN_DB (\"True\")" ',"api_key":"os.environ/STORE_MODEL_IN_DB"'
again openai "os.environ/MANIFEST_STUB_BEARER (after it)" ',"api_key":"os.environ/MANIFEST_STUB_BEARER"'
printf '{"id":"probe-m7-%s-b"}' "$((n - 1))" >"$RAW/m7b-del2.json"
echo "  delete the second bad row → $(admin POST /model/delete "$RAW/m7b-del2.json" m7b-del2)"
echo "### 5. the real key's value — docker logs gw-probe: $(docker logs gw-probe 2>&1 | perl -ne '$n++ if index($_, $ENV{UBC_AI_GATEWAY_API_KEY}) >= 0; END { print $n+0 }'); raw files: $(cat "$RAW"/* 2>/dev/null | perl -ne '$n++ if index($_, $ENV{UBC_AI_GATEWAY_API_KEY}) >= 0; END { print $n+0 }')"
