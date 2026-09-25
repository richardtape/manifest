#!/usr/bin/env bash
# The FAKE GitHub App's credentials (the D5 plan, Task 3).
#
# Four files in infra/secrets/, the master key's custody (§20, the plan's Decision 5),
# minted once and never removed by `make reset` — the same rule as master.key:
#   github-fake-app.pem         the App's PRIVATE key. The control plane holds it; the fake
#                               NEVER sees it — GitHub holds only the public half.
#   github-fake-app.pub.pem     the public half, which the fake verifies App JWTs with.
#   github-fake-webhook.secret  the App's webhook secret: the fake signs with it, the control
#                               plane verifies with it (§20: "verified by HMAC before any
#                               processing").
#   github-fake-developer.token faculty-dev's classic PAT: a PERSON who pushes to GitHub
#                               directly, outside Manifest — what the acceptance's direct
#                               pushes use.
# Nothing here is a real credential. A REAL App's key is Rich's to place (the plan's
# "What Rich does"), at infra/secrets/github-app.pem, and this script never touches it.
#
# Every file is 600 in a 700 directory. Not decoration: the control plane's
# `assertOwnerOnly` refuses a looser App key at load, and the plan's Task 5 mounts the
# public key and the token into the fake read-only, where a mounted file keeps its mode.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/infra/secrets"
mkdir -p "$DIR"
chmod 700 "$DIR"
umask 077

if [ ! -f "$DIR/github-fake-app.pem" ]; then
  echo "  minting the fake GitHub App's key (RSA 2048, the D5 plan's Task 3)"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out "$DIR/github-fake-app.pem" 2>/dev/null
  chmod 600 "$DIR/github-fake-app.pem"
fi

# Re-derived from the private key on every run, so the two halves can never disagree — and
# written only when the derivation differs, compared in memory, so a second `make up` touches
# nothing in the directory: minted once, like the rest.
PUB="$(openssl pkey -in "$DIR/github-fake-app.pem" -pubout 2>/dev/null)"
[ -n "$PUB" ] || { echo "  could not derive the fake App's public key" >&2; exit 1; }
if [ "$PUB" != "$(cat "$DIR/github-fake-app.pub.pem" 2>/dev/null)" ]; then
  printf '%s\n' "$PUB" > "$DIR/github-fake-app.pub.pem"
fi
chmod 600 "$DIR/github-fake-app.pub.pem"

if [ ! -f "$DIR/github-fake-webhook.secret" ]; then
  openssl rand -hex 32 > "$DIR/github-fake-webhook.secret"
  chmod 600 "$DIR/github-fake-webhook.secret"
fi

if [ ! -f "$DIR/github-fake-developer.token" ]; then
  # A classic PAT's shape: ghp_ and 36 alphanumerics. `tr -dc` over /dev/urandom, BSD-safe.
  # `|| true`: head closing the pipe gives tr SIGPIPE, which pipefail would make fatal.
  TOKEN="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 36 || true)"
  [ "${#TOKEN}" -eq 36 ] || { echo "  could not mint faculty-dev's token" >&2; exit 1; }
  printf 'ghp_%s\n' "$TOKEN" > "$DIR/github-fake-developer.token"
  chmod 600 "$DIR/github-fake-developer.token"
fi
