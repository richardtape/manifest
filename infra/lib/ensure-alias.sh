#!/usr/bin/env bash
# The 127.0.0.2 loopback alias does not survive a reboot (S7), and Docker refuses
# to bind Caddy without it. Called by BOTH `make seed` and `make up`. Prompts
# ONLY when the alias is actually missing, and prints the command before running
# it — nothing privileged happens silently.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh

if ifconfig lo0 | grep -q "inet $EDGE_IP"; then
  exit 0
fi

cat <<EOS
The $EDGE_IP loopback alias is missing. It is lost on every reboot, and Caddy
cannot bind 80/443 without it. Running:

    sudo ifconfig lo0 alias $EDGE_IP up

This is additive: Laravel Valet keeps 127.0.0.1:80 and :443 untouched, and
\`make host-undo\` removes the alias again.
EOS
sudo ifconfig lo0 alias "$EDGE_IP" up
ifconfig lo0 | grep "inet $EDGE_IP"
