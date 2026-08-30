#!/usr/bin/env bash
# Brings up S7's proven DNS + edge, for S1 to build on. THROWAWAY spike scaffolding,
# not P1 code. Run from this directory. Assumes host-setup.sh has already been run.
set -euo pipefail
cd "$(dirname "$0")"
NET=manifest-spike
CADDY_IP=10.89.0.10; DNS_C_IP=10.89.0.53; DNS_H_IP=10.89.0.54

docker network inspect $NET >/dev/null 2>&1 || \
  docker network create --subnet 10.89.0.0/24 --gateway 10.89.0.1 $NET

docker build -f Dockerfile.caddy  -t manifest-caddy:spike   .
docker build -f Dockerfile.dnsmasq -t manifest-dnsmasq:spike .

docker rm -f manifest-caddy manifest-dns-containers manifest-dns-host >/dev/null 2>&1 || true

# Answers CONTAINERS: the zone -> Caddy's address on the platform network.
docker run -d --name manifest-dns-containers --network $NET --ip $DNS_C_IP \
  manifest-dnsmasq:spike --keep-in-foreground --no-daemon --log-queries --no-resolv \
  --listen-address=$DNS_C_IP --bind-interfaces \
  --local=/manifest.internal/ --address=/manifest.internal/$CADDY_IP \
  --server=127.0.0.11

# Answers the HOST: the zone -> 127.0.0.2 (the lo0 alias).
docker run -d --name manifest-dns-host --network $NET --ip $DNS_H_IP \
  -p 127.0.0.1:7153:53/udp -p 127.0.0.1:7153:53/tcp \
  manifest-dnsmasq:spike --keep-in-foreground --no-daemon --log-queries --no-resolv \
  --listen-address=$DNS_H_IP --bind-interfaces \
  --local=/manifest.internal/ --address=/manifest.internal/127.0.0.2

# The 127.0.0.2 alias is created by host-setup.sh, which in turn needs the CA that
# only exists once Caddy has run. So: bind the alias if it is there, otherwise come
# up on override ports so the CA gets generated, then re-run this after host-setup.
if ifconfig lo0 | grep -q 'inet 127.0.0.2'; then
  PORTS=(-p 127.0.0.2:80:80 -p 127.0.0.2:443:443)
  BOUND="127.0.0.2:443 (clean, port-free URLs)"
else
  PORTS=(-p 127.0.0.1:7180:80 -p 127.0.0.1:7143:443)
  BOUND="127.0.0.1:7143 (override ports - the lo0 alias is not present yet)"
fi

docker run -d --name manifest-caddy --network $NET --ip $CADDY_IP \
  "${PORTS[@]}" -p 127.0.0.1:7119:2019 \
  -v "$PWD/Caddyfile":/etc/caddy/Caddyfile:ro -v manifest-spike-caddy-data:/data \
  manifest-caddy:spike

sleep 5
mkdir -p ca
docker cp manifest-caddy:/data/caddy/pki/authorities/local/root.crt ca/manifest-root.crt

echo
echo "--- Caddy bound on $BOUND"
echo "--- CA root written to ca/manifest-root.crt"
echo "--- container check (works now):"
echo "      docker run --rm --network $NET --dns $DNS_C_IP \\"
echo "        -v \$PWD/ca/manifest-root.crt:/ca.crt:ro curlimages/curl:8.11.1 \\"
echo "        --cacert /ca.crt -sS https://console.manifest.internal/"
if ! ifconfig lo0 | grep -q 'inet 127.0.0.2'; then
  echo
  echo "--- HOST side is not up yet. Ask the human to run, in their terminal:"
  echo "      sudo bash $PWD/host-setup.sh"
  echo "    then re-run this script to move Caddy onto 127.0.0.2:443."
else
  echo "--- host check:  curl -sS https://console.manifest.internal/"
fi
