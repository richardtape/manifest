#!/usr/bin/env bash
# THE ENTIRE PRIVILEGED SURFACE OF THE PLATFORM — three steps, all reversible by
# host-undo.sh. Run as: make host-setup
#
# LARAVEL VALET IS NEVER TOUCHED. Its /etc/resolver/test, its dnsmasq on port 53
# and its nginx on 127.0.0.1:80/443 are left exactly as they are; step 2 is scoped
# to manifest.internal and step 1 gives Caddy a DIFFERENT address to own.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

[ "$(id -u)" -eq 0 ] || { echo "run via: make host-setup"; exit 1; }

# 1. The loopback aliases — BOTH of them since P6a (R3): EDGE_IP carries §12's
#    internal listener and PUBLIC_EDGE_IP the public one. LOST ON EVERY REBOOT —
#    `make up` re-adds them. Valet keeps 127.0.0.1 and is untouched by either.
for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do
  if ifconfig lo0 | grep -q "inet $ip"; then
    echo "1/3  $ip already on lo0"
  else
    ifconfig lo0 alias "$ip" up
    echo "1/3  added $ip to lo0"
  fi
done

# 2. The resolver, scoped to manifest.internal — NOT to all of .internal, which
#    would break Docker's own host.docker.internal and gateway.docker.internal.
install -m 644 "infra/host/resolver-$ZONE" "/etc/resolver/$ZONE"
echo "2/3  installed /etc/resolver/$ZONE"

# 3. Trust Caddy's internal CA. THIS PROMPTS FOR A PASSWORD EVEN UNDER sudo —
#    §21 calls it "one automated step, not a manual dance"; it is automatable but
#    it is not silent, and D12 should not be read as claiming otherwise (S7).
[ -f "$CA_FILE" ] || { echo "$CA_FILE missing — run \`make seed\` first"; exit 1; }
security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_FILE"
echo "3/3  trusted $CA_FILE in the System keychain"

echo
echo "Done. Verify with: make doctor"
