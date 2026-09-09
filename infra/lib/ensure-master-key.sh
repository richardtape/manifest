#!/usr/bin/env bash
# The secrets master keypair — §12's envelope encryption, §20's key management.
#
# Every application secret in Postgres is sealed to the PUBLIC half of this
# keypair; only the private half opens them. It is a file on disk in SEPARATE
# CUSTODY from the database, so a stolen database dump is not a stolen secret
# set, and `make reset` does NOT remove it — the same rule as the IdP signing
# key and the Caddy CA. Destroying it makes every stored secret unrecoverable,
# which is not a reset.
#
# curve25519, so both halves are 32 bytes. Minted with openssl and converted to
# raw base64 because `loadMasterKeypair` wants the bare keys, not PEM armour.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/infra/secrets"
FILE="$DIR/master.key"
mkdir -p "$DIR"
chmod 700 "$DIR"

if [ -f "$FILE" ]; then
  exit 0
fi

echo "  minting the secrets master keypair (curve25519, §12)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

openssl genpkey -algorithm X25519 -out "$TMP/private.pem" >/dev/null 2>&1
openssl pkey -in "$TMP/private.pem" -pubout -out "$TMP/public.pem" >/dev/null 2>&1

# The raw 32 bytes sit at the end of the DER encoding for both halves: X25519
# private keys are 48 DER bytes and public keys 44, with the key as the final 32.
# `tail -c 32` rather than a parser because macOS ships no `openssl pkey -raw`
# equivalent that emits bare bytes, and the prefix lengths are fixed by RFC 8410.
PRIVATE="$(openssl pkey -in "$TMP/private.pem" -outform DER | tail -c 32 | base64)"
PUBLIC="$(openssl pkey -in "$TMP/public.pem" -pubin -outform DER | tail -c 32 | base64)"

umask 077
printf '{"v":1,"publicKey":"%s","privateKey":"%s"}\n' "$PUBLIC" "$PRIVATE" > "$FILE"
chmod 600 "$FILE"
