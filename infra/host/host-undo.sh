#!/usr/bin/env bash
# Reverses host-setup.sh. Run as: make host-undo
# ORDER-INDEPENDENT: works whether or not `make reset` has already deleted
# infra/ca/. S7 shipped a version that did not, and it printed a confusing
# "Error reading file" when run in the other order.
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

rm -f "/etc/resolver/$ZONE"
ifconfig lo0 -alias "$EDGE_IP" 2>/dev/null

# Remove by COMMON NAME first — authoritative, and does not need the file to
# still exist. The file-based call is belt-and-braces.
security delete-certificate -c "Caddy Local Authority - 2026 ECC Root" \
  /Library/Keychains/System.keychain 2>/dev/null
[ -f "$CA_FILE" ] && security remove-trusted-cert -d "$CA_FILE" 2>/dev/null

echo "--- /etc/resolver should no longer list $ZONE:"; ls /etc/resolver/
echo "--- lo0 should hold only 127.0.0.1:"; ifconfig lo0 | grep 'inet 127'
echo "--- Caddy roots remaining (want 0):"
security find-certificate -a -c "Caddy Local Authority" \
  /Library/Keychains/System.keychain 2>&1 | grep -c keychain
