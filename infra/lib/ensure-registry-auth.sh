#!/usr/bin/env bash
# The registry token issuer (§13). Called by BOTH `make seed` and `make up`, for the
# same reason ensure-alias.sh is: compose BIND-MOUNTS token.crt into the registry,
# and Docker silently creates a DIRECTORY at a bind-mount source that does not
# exist — after which the registry fails to start with an error about the cert that
# says nothing about the real cause. Generating it here makes `make up` work on a
# fresh clone instead of failing inside Compose.
#
# No sudo, no network. The private half never leaves this machine and is gitignored.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -f infra/registry-auth/token.key ] && [ -f infra/registry-auth/token.crt ]; then
  exit 0
fi

mkdir -p infra/registry-auth
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout infra/registry-auth/token.key \
  -out    infra/registry-auth/token.crt \
  -subj "/CN=manifest-control-plane" 2>/dev/null
chmod 600 infra/registry-auth/token.key
echo "  generated infra/registry-auth/token.{key,crt}"
