#!/usr/bin/env bash
# The CONTROL PLANE's own Service Provider keypair.
#
# §9's first sentence: Manifest itself is an SP. It signs its AuthnRequests with
# this key and its `saml20_sp_remote` row pins the certificate, exactly as every
# deployed app's does.
#
# It is a FILE and not a row in the `secrets` table because that table's rows are
# scoped to a `projects` row by a foreign key, and the platform is not a project.
# So it sits in the same custody as the IdP's signing keypair and the envelope
# master key (§20): minted here on every `make up`, gitignored, and NOT removed
# by `make reset` — regenerating it invalidates the registration that pins it,
# which is a re-registration rather than a reset.
#
# Idempotent: present and readable means leave it alone. macOS bash 3.2.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DIR="infra/sp"
KEY="$DIR/control-plane.key"
CRT="$DIR/control-plane.crt"

# Must match MANIFEST_SP_ENTITY_BASE and sso/platform.ts's CONTROL_PLANE_SLUG /
# CONTROL_PLANE_ENVIRONMENT. The entityID goes in a subjectAltName URI rather
# than the common name for the two reasons sso/keypair.ts measured: openssl's
# `-subj` uses `/` as its RDN separator, so a URL common name is refused
# outright, and the entityID is longer than X.509's 64-byte limit for a CN.
ENTITY_BASE="${MANIFEST_SP_ENTITY_BASE:-https://manifest.internal}"
ENTITY_ID="$ENTITY_BASE/sp/manifest-control-plane/platform"

if [ -s "$KEY" ] && [ -s "$CRT" ]; then
  echo "ensure-cp-sp-keypair: present ($CRT)"
  exit 0
fi

# One half without the other is a crash between two writes, not a repair: neither
# can be recovered from the other, so both are replaced. Safe here because the
# control plane rewrites its own metadata row from this pair on every boot.
mkdir -p "$DIR"
rm -f "$KEY" "$CRT"

# RSA-4096 and two years, the same as sso/keypair.ts mints for an app (§9 allows
# one to five years; D20 alerts from 90 days out).
openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 730 \
  -keyout "$KEY" -out "$CRT" \
  -subj "/CN=manifest-control-plane/O=Manifest" \
  -addext "subjectAltName=URI:$ENTITY_ID" 2>/dev/null

chmod 600 "$KEY"
chmod 644 "$CRT"

# The SHAPE of the answer, not that the command exited 0. An interrupted mint
# leaves a file that exists, is non-empty and is not a certificate, and the
# failure then lands inside node-saml's XML signer with a message about the
# assertion rather than about the key.
grep -q 'BEGIN PRIVATE KEY' "$KEY" || {
  echo "ensure-cp-sp-keypair: $KEY is not a PEM private key"; exit 1; }
openssl x509 -in "$CRT" -noout -subject >/dev/null || {
  echo "ensure-cp-sp-keypair: $CRT is not a certificate"; exit 1; }

echo "ensure-cp-sp-keypair: minted $CRT for $ENTITY_ID"
