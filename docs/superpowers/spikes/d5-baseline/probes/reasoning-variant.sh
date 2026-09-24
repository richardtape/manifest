#!/usr/bin/env bash
# probes/reasoning-variant.sh <scratch> [model] — the -reasoning logical names: thinking ON by default.
set -u
S=$1; M=${2:-default-chat-reasoning}
KEY=$(grep '^LITELLM_MASTER_KEY=' .env | cut -d= -f2- | tr -d "\"'")
run() { # $1 label, $2 body fields before messages
  local t0=$(date +%s)
  curl -sS -N -m 600 http://127.0.0.1:7106/v1/chat/completions -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
    -d '{"model":"'$M'","stream":true'"$2"',"messages":[{"role":"user","content":"Count 1 to 5, digits only."}]}' > "$S/rv.sse"
  echo "$M, $1: frames $(grep -c '^data:' "$S/rv.sse"), content $(grep -c '"content":"[^"]' "$S/rv.sse"), reasoning $(grep -c '"reasoning_content":"[^"]' "$S/rv.sse"), $(( $(date +%s) - t0 )) s, answer: $(grep -o '"content":"[^"]*"' "$S/rv.sse" | sed 's/"content":"//; s/"$//' | tr -d '\n' | head -c 60)"
}
run 'max_tokens 300' ',"max_tokens":300'
run 'no max_tokens' ''
run 'max_tokens 300, request reasoning_effort "none"' ',"max_tokens":300,"reasoning_effort":"none"'
