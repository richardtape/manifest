#!/usr/bin/env bash
# [M3] LiteLLM against a provider's 422, in a THROWAWAY (faculty-ready Task 1). Never touches manifest-litellm.
# The pinned image, as `f8-probe` on its own network and port 7197; a stub on the host's 7198 answers every call 422.
# For each guard (today's, then A, B, C): one non-streamed and one streamed request; status, headers, body, stub hits.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
IMG=ghcr.io/berriai/litellm@sha256:20b5044b619055374061a6d5b7b08754cad75aeabbf82ddf4f69cc0cf80ddaf4
KEY=sk-probe-m3
node "$HERE/stub.mjs" & STUB=$!
docker network create fr-m3-net >/dev/null
ask() { # $1 = label, $2 = stream true|false
  curl -s "http://127.0.0.1:7198/reset" >/dev/null
  local H=$(mktemp) B=$(mktemp)
  local code=$(curl -s -o "$B" -D "$H" -w '%{http_code}' --max-time 60 http://127.0.0.1:7197/v1/chat/completions \
    -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
    -d "{\"model\":\"probe-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":$2}")
  echo "  [$1 stream=$2] status=$code stub_hits=$(curl -s http://127.0.0.1:7198/hits)"
  echo "    headers: $(grep -i '^x-litellm\|^content-type' "$H" | tr -d '\r' | tr '\n' ';' | cut -c1-400)"
  echo "    body: $(head -c 600 "$B" | tr '\n' ' ')"
  rm -f "$H" "$B"
}
for G in ${GUARDS:-0-today A B C}; do
  docker rm -f f8-probe >/dev/null 2>&1
  docker run -d --name f8-probe --network fr-m3-net -p 127.0.0.1:7197:4000 -e LITELLM_MASTER_KEY=$KEY \
    -v "$HERE/config.yaml:/app/config.yaml:ro" -v "$HERE/guard-$G.py:/app/manifest_guard.py:ro" \
    $IMG --config /app/config.yaml --port 4000 >/dev/null
  for i in $(seq 1 90); do curl -sf http://127.0.0.1:7197/health/liveliness >/dev/null 2>&1 && break; sleep 2; done
  echo "--- guard $G (ready after ~$((i*2)) s)"
  ask "$G" false
  ask "$G" true
  echo "    guard log: $(docker logs f8-probe 2>&1 | grep -o 'manifest_guard[^,]*' | sort | uniq -c | tr '\n' ';' | cut -c1-500)"
  docker rm -f f8-probe >/dev/null
done
docker network rm fr-m3-net >/dev/null
kill $STUB; wait $STUB 2>/dev/null
echo "removed f8-probe, fr-m3-net and the stub"
