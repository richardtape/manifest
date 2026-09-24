#!/usr/bin/env bash
# probes/think-pin.sh <scratch> [model] — does the mapping's `think: false` hold against what a REQUEST sends?
# LiteLLM 1.98.0 maps a request's reasoning_effort to Ollama `think` FIRST (utils.py:4268), then copies the
# deployment's provider-specific params over it (utils.py:4508). Read, then measured here.
set -u
S=$1; M=${2:-default-chat}
KEY=$(grep '^LITELLM_MASTER_KEY=' .env | cut -d= -f2- | tr -d "\"'")
run() { # $1 label, $2 extra JSON fields
  curl -sS -N -m 300 http://127.0.0.1:7106/v1/chat/completions -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
    -d '{"model":"'$M'","stream":true,"max_tokens":300'"$2"',"messages":[{"role":"user","content":"Count 1 to 5, digits only."}]}' > "$S/pin.sse"
  echo "$M, $1: frames $(grep -c '^data:' "$S/pin.sse"), content $(grep -c '"content":"[^"]' "$S/pin.sse"), reasoning $(grep -c '"reasoning_content":"[^"]' "$S/pin.sse")"
}
run 'no reasoning parameter' ''
run 'request reasoning_effort "high"' ',"reasoning_effort":"high"'
run 'request reasoning_effort "low"' ',"reasoning_effort":"low"'
run 'request sends Ollama think:true' ',"think":true'
