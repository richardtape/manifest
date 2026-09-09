#!/usr/bin/env bash
# The Manifest IdP's signing keypair.
#
# §20 holds this in SEPARATE CUSTODY from application secrets: it is a file on
# disk, not a row in the `secrets` table, and `make reset` does not remove it —
# regenerating it invalidates every SP that pinned the certificate, which is a
# re-registration rather than a reset. Under D6 it signs only for TEST USERS, so
# its compromise never touches a real identity; it is still treated as sensitive
# because it can forge access to a staging app holding real work (§9).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/infra/idp/cert"
mkdir -p "$DIR"

if [ -f "$DIR/server.pem" ] && [ -f "$DIR/server.crt" ]; then
  exit 0
fi

echo "  minting the Manifest IdP signing keypair (10 years, RSA-4096)"
openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 3650 \
  -keyout "$DIR/server.pem" -out "$DIR/server.crt" \
  -subj "/CN=idp.manifest.internal/O=Manifest Local IdP" >/dev/null 2>&1
chmod 600 "$DIR/server.pem"
