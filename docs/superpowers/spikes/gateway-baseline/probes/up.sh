#!/usr/bin/env bash
# The UBC AI Gateway plan's Task 1: the throwaway. NEVER touches manifest-litellm, 7100 or the control database.
#   SCRATCH=<scratchpad> bash up.sh
# Starts: the host stub on 127.0.0.1:7198; gw-probe-pg (postgres:16-alpine, infra/compose.yaml's image) and gw-probe
# (LiteLLM from the pinned digest) on their own network gw-probe-net, LiteLLM published on 127.0.0.1:7197.
# gw-probe's environment: the gateway key and the probe key by NAME (`-e NAME`, no value on argv); OPENAI_API_KEY a
# fresh canary, so a key sent to the wrong party is recognisable and is not Rich's; PROBE_EMPTY set but empty;
# MANIFEST_STUB_BEARER=probe-not-a-key; PROBE_WRONG_KEY a second canary. Re-running recreates gw-probe (the database
# and its rows are kept), which is how a probe key written after the first run reaches it.
. "$(dirname "$0")/lib.sh"

[ -n "${UBC_AI_GATEWAY_API_KEY:-}" ] || { echo "UBC_AI_GATEWAY_API_KEY is not set — is its .env line uncommented?"; exit 1; }
[ -n "${GW_PROBE_KEY:-}" ] && echo "probe key: loaded from its file" || echo "probe key: NOT loaded (no file yet)"

if [ ! -s "$STATE" ]; then
  rnd() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
  umask 077
  {
    echo "LITELLM_PROBE_MASTER=sk-gwprobe-$(rnd 24)"
    echo "LITELLM_PROBE_SALT=$(rnd 32)"
    echo "PROBE_CANARY=sk-canary-$(rnd 16)"
    echo "PROBE_PG_PW=$(rnd 24)"
  } >"$STATE"
  chmod 600 "$STATE"
  set -a
  . "$STATE"
  set +a
fi

# The stub: digests of the two keys (computed here, piped, never on argv) so it can SAY a key reached it.
if ! curl -sf "$STUB/__log" >/dev/null 2>&1; then
  STUB_GW_SHA=$(printf '%s' "$UBC_AI_GATEWAY_API_KEY" | shasum -a 256 | cut -d' ' -f1) \
    STUB_PROBE_SHA=$( [ -n "${GW_PROBE_KEY:-}" ] && printf '%s' "$GW_PROBE_KEY" | shasum -a 256 | cut -d' ' -f1) \
    STUB_CANARY="$PROBE_CANARY" STUB_WRONG=sk-canary-wrong \
    nohup node "$PROBES/stub.mjs" >"$SCRATCH/stub.out" 2>&1 &
  echo "STUB_PID=$!" >>"$STATE"
  sleep 1
fi
curl -sf "$STUB/__log" >/dev/null && echo "stub: up on 7198"

docker network inspect gw-probe-net >/dev/null 2>&1 || docker network create gw-probe-net >/dev/null
if ! docker inspect gw-probe-pg >/dev/null 2>&1; then
  docker run -d --name gw-probe-pg --network gw-probe-net -e POSTGRES_PASSWORD="$PROBE_PG_PW" -e POSTGRES_DB=litellm \
    -v gw-probe-pgdata:/var/lib/postgresql/data postgres:16-alpine >/dev/null
fi
for i in $(seq 1 30); do docker exec gw-probe-pg pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
echo "gw-probe-pg: ready"

docker rm -f gw-probe >/dev/null 2>&1
docker run -d --name gw-probe --network gw-probe-net -p 127.0.0.1:7197:4000 \
  --add-host host.docker.internal:host-gateway \
  -e DATABASE_URL="postgresql://postgres:$PROBE_PG_PW@gw-probe-pg:5432/litellm" \
  -e LITELLM_MASTER_KEY="$LITELLM_PROBE_MASTER" -e LITELLM_SALT_KEY="$LITELLM_PROBE_SALT" -e STORE_MODEL_IN_DB=True \
  -e UBC_AI_GATEWAY_API_KEY -e GW_PROBE_KEY -e OPENAI_API_KEY="$PROBE_CANARY" -e PROBE_EMPTY= \
  -e MANIFEST_STUB_BEARER=probe-not-a-key -e PROBE_WRONG_KEY=sk-canary-wrong \
  -v "$PROBES/probe-config.yaml:/app/config.yaml:ro" \
  -v "$REPO/infra/litellm/manifest_guard.py:/app/manifest_guard.py:ro" \
  -v "$PROBES/guard-inspect.py:/app/guard_inspect.py:ro" \
  "$IMG" --config /app/config.yaml --port 4000 >/dev/null
for i in $(seq 1 120); do curl -sf "$HOP1/health/liveliness" >/dev/null 2>&1 && break; sleep 2; done
echo "gw-probe: live after ~$((i * 2)) s"
docker exec gw-probe sh -c '[ -n "$UBC_AI_GATEWAY_API_KEY" ] && echo "gw-probe: gateway key set" || echo "gw-probe: gateway key ABSENT"'
docker exec gw-probe sh -c '[ -n "$GW_PROBE_KEY" ] && echo "gw-probe: probe key set" || echo "gw-probe: probe key absent"'
docker logs gw-probe 2>&1 | grep -E 'manifest_guard: loaded|guard_inspect' | head -2
