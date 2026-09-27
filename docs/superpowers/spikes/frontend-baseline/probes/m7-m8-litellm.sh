#!/bin/bash
# m7-m8-litellm.sh — [M7][M8] warms the chat model (as Global Constraints does), then runs the probe with .env.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../../.." && pwd)"
cd "$ROOT"
set -a; . ./.env; set +a
curl -s http://127.0.0.1:11434/api/generate -d '{"model":"qwen3.5:4b","prompt":"ok","stream":false,"think":false,"keep_alive":"30m","options":{"num_predict":1}}' >/dev/null && echo 'chat model warm'
bash "$HERE/run.sh" "$HERE/m7-m8-litellm.mts"
echo "--- LiteLLM users named probe-agent-* left in its database (want 0):"
docker exec manifest-postgres psql -U manifest -d litellm -tAc "SELECT count(*) FROM \"LiteLLM_UserTable\" WHERE user_id LIKE 'probe-agent-%'"
docker exec manifest-postgres psql -U manifest -d litellm -tAc "SELECT count(*) FROM \"LiteLLM_VerificationToken\" WHERE key_alias LIKE 'probe-agent-%'"
