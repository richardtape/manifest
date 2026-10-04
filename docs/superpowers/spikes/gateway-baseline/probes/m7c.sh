#!/usr/bin/env bash
# [M7] follow-up 2: m7.sh's case 7 (litellm_proxy/, os.environ/STORE_MODEL_IN_DB) was a SECOND boolean row. Delete it,
# wait for a reload, then ask whether every row registered behind the two went live — and what each case sends.
. "$(dirname "$0")/lib.sh"
echo "## [M7] follow-up 2 — the second boolean row removed — $(date '+%Y-%m-%d %H:%M:%S %Z')"
if [ -z "${ASK_ONLY:-}" ]; then
printf '%s' '{"id":"probe-m7-7-210046"}' >"$RAW/m7c-del.json"
echo "  delete probe-m7-7 → $(admin POST /model/delete "$RAW/m7c-del.json" m7c-del)"
sleep 15
echo "  reload errors in the 12 s after: $(docker logs gw-probe --since 12s 2>&1 | grep -c 'Error adding/deleting model to llm_router')"
else echo "  (ASK_ONLY: the asks again, no delete)"; fi
label() { case "$1" in 4|11) echo "openai/ no api_key" ;; 5|12) echo "litellm_proxy/ os.environ/PROBE_UNSET" ;; 6|13) echo "litellm_proxy/ os.environ/PROBE_EMPTY" ;; 8|14) echo "litellm_proxy/ no api_key" ;; 9|15|17) echo "openai/ os.environ/MANIFEST_STUB_BEARER" ;; *) echo "?" ;; esac; }
for n in 4 5 6 8 9 11 12 13 14 15 17; do
  curl -s "$STUB/__reset" >/dev/null
  printf '{"model":"probe-m7-%s","messages":[{"role":"user","content":"hi"}]}' "$n" >"$RAW/m7c-$n.json"
  r=$(req "$HOP1/v1/chat/completions" POST "$RAW/m7c-$n.json" LITELLM_PROBE_MASTER "m7c-$n")
  printf '  probe-m7-%-3s %-44s → %s; the stub saw: %s' "$n" "$(label "$n")" "${r%% *}" "$(curl -s "$STUB/__log" | jq -r '[.[].bearer] | if length == 0 then "NO CALL" else join(",") end')"
  [ "${r%% *}" = 200 ] || printf '; client: %s' "$(jq -c '.error | {type, code, message: (.message // "" | .[0:200])}' "$RAW/m7c-$n.b" 2>&1 | red)"
  echo
done
