#!/usr/bin/env bash
# C1's acceptance: the whole loop, with the network off.
#
# Run this yourself with Wi-Fi (and any Ethernet) DISABLED. It is deliberately
# not automated: turning the network off from inside an agent session cuts the
# agent off too, and a half-finished script would leave the machine offline.
#
#   1. turn the network off
#   2. bash scripts/offline-acceptance.sh 2>&1 | tee /tmp/manifest-offline.txt
#   3. turn the network back on
#
# Everything after `make seed` is supposed to work with no network at all. If
# something here needs it, THAT IS THE FINDING — it goes in RUNBOOK.md under
# Known gaps, and the check is not weakened to make it pass.
cd "$(dirname "$0")/.."

echo "=== 0. confirming the machine really is offline ==="
if curl -sf -m 5 https://registry.npmjs.org/ >/dev/null 2>&1; then
  echo "STILL ONLINE — turn the network off first, or this proves nothing."
  exit 1
fi
echo "no route to npmjs. Good."

echo
echo "=== 1. make down ==="
make down || echo "  (down exited $?)"

echo
echo "=== 2. make up  — the half no spike has ever tested ==="
make up; echo "up exit=$?"

echo
echo "=== 3. make doctor ==="
make doctor; echo "doctor exit=$?"

echo
echo "=== 4. make verify, with the offline checks ==="
MANIFEST_VERIFY_OFFLINE=1 make verify; echo "verify exit=$?"

echo
echo "=== 5. the C1 demo itself: one name, host and container, no port, no -k ==="
curl -sS https://console.manifest.internal/ ; echo
docker run --rm --network manifest-platform --dns 10.89.0.53 \
  -v "$PWD/infra/ca/manifest-root.crt":/ca.crt:ro curlimages/curl:8.11.1 \
  --cacert /ca.crt -sS https://console.manifest.internal/ ; echo

echo
echo "=== done. Turn the network back on. ==="
