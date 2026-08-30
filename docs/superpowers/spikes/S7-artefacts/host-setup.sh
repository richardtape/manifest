#!/usr/bin/env bash
# THREE PRIVILEGED STEPS. Run with sudo, AFTER up.sh has produced ca/manifest-root.crt.
#   sudo bash host-setup.sh
# Every change is reverted by host-undo.sh. Laravel Valet is never touched.
set -e
cd "$(dirname "$0")"

# 1. loopback alias — lets Caddy own :443 without taking it from Valet.
#    LOST ON EVERY REBOOT; re-run then.
ifconfig lo0 alias 127.0.0.2 up
ifconfig lo0 | grep 'inet 127'

# 2. resolver, scoped to manifest.internal so /etc/resolver/test and
#    Docker's *.docker.internal both keep working.
cp etc-resolver-manifest.internal /etc/resolver/manifest.internal
chmod 644 /etc/resolver/manifest.internal
cat /etc/resolver/manifest.internal

# 3. trust Caddy's internal CA. PROMPTS for a password even under sudo.
security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain \
  ca/manifest-root.crt
security find-certificate -a -c "Caddy Local Authority" \
  /Library/Keychains/System.keychain | grep -c keychain
