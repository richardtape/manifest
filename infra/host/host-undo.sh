#!/usr/bin/env bash
# Reverses host-setup.sh. Run as: make host-undo
# ORDER-INDEPENDENT: works whether or not `make reset` has already deleted
# infra/ca/. S7 shipped a version that did not, and it printed a confusing
# "Error reading file" when run in the other order.
#
# DELIBERATELY NOT `set -e`: each removal must be attempted even if an earlier
# one finds nothing to remove. Correctness is asserted at the end instead.
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

rm -f "/etc/resolver/$ZONE"
# BOTH aliases since P6a (R3). If only one were removed the machine would not be as
# it was found, and a stray 127.0.0.3 is invisible until something tries to bind it.
for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do ifconfig lo0 -alias "$ip" 2>/dev/null; done

# Remove by COMMON NAME first — authoritative, and does not need the file to
# still exist. The file-based call is belt-and-braces.
security delete-certificate -c "Caddy Local Authority - 2026 ECC Root" \
  /Library/Keychains/System.keychain 2>/dev/null
[ -f "$CA_FILE" ] && security remove-trusted-cert -d "$CA_FILE" 2>/dev/null

# ---------------------------------------------------------------------------
# ASSERT the reversal, and set the exit status from THAT.
#
# The previous version ended with `security find-certificate … | grep -c keychain`.
# `grep -c` exits 1 when it counts ZERO — which is the SUCCESS condition — so a
# perfect teardown reported `make: *** [host-undo] Error 1`. Measured 2026-09-05.
# An exit status should be asserted, never inherited from whatever ran last.
# ---------------------------------------------------------------------------
failed=0

if [ -f "/etc/resolver/$ZONE" ]; then
  echo "STILL PRESENT  /etc/resolver/$ZONE"; failed=1
else
  echo "removed        /etc/resolver/$ZONE"
fi

for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do
  if ifconfig lo0 | grep -q "inet $ip"; then
    echo "STILL PRESENT  $ip on lo0"; failed=1
  else
    echo "removed        $ip from lo0"
  fi
done

roots=$(security find-certificate -a -c "Caddy Local Authority" \
        /Library/Keychains/System.keychain 2>/dev/null | grep -c keychain)
if [ "${roots:-0}" -ne 0 ]; then
  echo "STILL PRESENT  $roots Caddy root(s) in the System keychain"; failed=1
else
  echo "removed        Caddy root(s) from the System keychain"
fi

# Valet must have survived all of the above. It is never touched, but say so.
echo "untouched      /etc/resolver holds: $(ls /etc/resolver/ 2>/dev/null | tr '\n' ' ')"

echo
if [ "$failed" -eq 0 ]; then
  echo "All three host changes reversed. The platform containers are still running;"
  echo "\`make down\` stops them. \`make host-setup\` puts the host changes back."
else
  echo "One or more host changes could NOT be reversed — see above."
fi
exit "$failed"
