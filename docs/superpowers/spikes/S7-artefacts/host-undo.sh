#!/usr/bin/env bash
# Reverts host-setup.sh. Run with sudo. Names nothing belonging to Valet.
cd "$(dirname "$0")"
rm -f /etc/resolver/manifest.internal
ifconfig lo0 -alias 127.0.0.2 2>/dev/null
security remove-trusted-cert -d ca/manifest-root.crt 2>/dev/null
security delete-certificate -c "Caddy Local Authority - 2026 ECC Root" \
  /Library/Keychains/System.keychain 2>/dev/null
echo "--- /etc/resolver should hold only test and vibonarium.local:"; ls /etc/resolver/
echo "--- lo0 should hold only 127.0.0.1:"; ifconfig lo0 | grep 'inet 127'
echo "--- Caddy roots remaining (want 0):"
security find-certificate -a -c "Caddy Local Authority" \
  /Library/Keychains/System.keychain 2>&1 | grep -c keychain
