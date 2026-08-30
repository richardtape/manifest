#!/usr/bin/env bash
# Removes only what the spike created. Pre-existing containers are named nowhere.
docker rm -f manifest-caddy manifest-dns-containers manifest-dns-host \
  manifest-registry manifest-verdaccio manifest-egress manifest-litellm \
  s1-buildkitd s2-idp s2-postgres 2>/dev/null
# S1 creates per-app containers, networks and volumes under an mf- prefix.
docker ps -aq --filter 'name=^mf-' | xargs -r docker rm -f 2>/dev/null
docker network rm manifest-spike manifest-build manifest-build-internal 2>/dev/null
docker network ls -q --filter 'name=^mf-' | xargs -r docker network rm 2>/dev/null
docker volume rm manifest-spike-caddy-data 2>/dev/null
docker volume ls -q --filter 'name=^mf-' | xargs -r docker volume rm 2>/dev/null
docker buildx rm s1-remote 2>/dev/null
docker image rm manifest-caddy:spike manifest-dnsmasq:spike 2>/dev/null
echo "--- spike containers left (want none):"
docker ps -a --format '{{.Names}}' | grep -E '^(manifest-|s1-|s2-|mf-)' || echo "    none"
