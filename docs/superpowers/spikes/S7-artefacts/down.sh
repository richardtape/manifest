#!/usr/bin/env bash
# Removes only what the spike created. Pre-existing containers are named nowhere.
docker rm -f manifest-caddy manifest-dns-containers manifest-dns-host \
  manifest-registry manifest-verdaccio manifest-egress manifest-litellm \
  s2-idp s2-postgres 2>/dev/null
docker network rm manifest-spike 2>/dev/null
docker volume rm manifest-spike-caddy-data 2>/dev/null
docker image rm manifest-caddy:spike manifest-dnsmasq:spike 2>/dev/null
echo "--- spike containers left (want none):"
docker ps -a --format '{{.Names}}' | grep -E '^(manifest-|s2-)' || echo "    none"
