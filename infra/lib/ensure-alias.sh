#!/usr/bin/env bash
# NEITHER loopback alias survives a reboot (S7), and Docker refuses to bind Caddy
# without them. Called by BOTH `make seed` and `make up`. Prompts ONLY when an alias
# is actually missing, and prints the command before running it — nothing privileged
# happens silently.
#
# TWO ADDRESSES SINCE P6a (R3): EDGE_IP carries §12's internal listener and
# PUBLIC_EDGE_IP carries the public one. They are re-added together because a machine
# missing either has a half-bound edge, which fails at the TLS handshake rather than
# with a status and therefore reads as a certificate fault (P6a sitting 1, F3).
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

missing=""
for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do
  ifconfig lo0 | grep -q "inet $ip" || missing="$missing $ip"
done
[ -z "$missing" ] && exit 0

cat <<EOS
These loopback aliases are missing:$missing
They are lost on every reboot, and Caddy cannot bind its listeners without them.
Running:

$(for ip in $missing; do echo "    sudo ifconfig lo0 alias $ip up"; done)

This is additive: Laravel Valet keeps 127.0.0.1:80 and :443 untouched, and
\`make host-undo\` removes them again.
EOS
# \$missing is UNQUOTED in both loops deliberately — it is a space-separated list and
# word splitting is the mechanism. macOS ships bash 3.2: no arrays needed, none used.
for ip in $missing; do sudo ifconfig lo0 alias "$ip" up; done
ifconfig lo0 | grep 'inet '
