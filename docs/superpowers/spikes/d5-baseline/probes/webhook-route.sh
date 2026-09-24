#!/usr/bin/env bash
# probes/webhook-route.sh <scratch> — [M7]: can a platform container reach a host listener on
# 127.0.0.1 through host.docker.internal (the edge's own route to the control plane), can an APP
# network, and what does the edge's console site answer a container asking for /webhooks/github?
set -u
S=$1; mkdir -p "$S/www" && echo reached > "$S/www/index.html"
python3 -m http.server 7197 --bind 127.0.0.1 --directory "$S/www" > "$S/http.log" 2>&1 & HTTP=$!; sleep 1
C=curlimages/curl:8.11.1
docker run --rm --network manifest-platform $C -sS -m 5 http://host.docker.internal:7197/; echo " platform exit=$?"
docker run --rm --network manifest-platform --add-host host.docker.internal:host-gateway $C -sS -m 5 http://host.docker.internal:7197/; echo " host-gateway exit=$?"
APPNET=$(docker network ls --format '{{.Name}}' | grep -E '^mf-.*-staging-net$' | head -1); echo "app network: $APPNET"
docker run --rm --network "$APPNET" $C -sS -m 5 http://host.docker.internal:7197/; echo " app-network exit=$?"
docker run --rm --network manifest-platform $C -sS -m 5 -k --resolve console.manifest.internal:443:10.89.0.10 -w ' [status %{http_code}]' https://console.manifest.internal/webhooks/github -X POST -d '{}'; echo " via-edge exit=$?"
# positive control for the edge line: the same container, the same site, a path the site DOES forward
docker run --rm --network manifest-platform $C -sS -m 5 -k --resolve console.manifest.internal:443:10.89.0.10 -w ' [status %{http_code}]' https://console.manifest.internal/v1/me; echo " via-edge /v1/me exit=$?"
kill $HTTP
echo "requests the host listener logged:"; grep -c 'GET / ' "$S/http.log"
