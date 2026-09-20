#!/usr/bin/env bash
# THE ONE PRIVILEGED STEP P6a ADDS, run as: sudo bash infra/host/p6a-second-address.sh
#
# It adds a SECOND loopback alias, 127.0.0.3, which §12's public listener binds. It is
# additive and it is reversible: `make host-undo` removes both aliases and asserts it.
# LARAVEL VALET IS NOT TOUCHED — it holds 127.0.0.1:80 and :443 and neither address is its.
#
# This script exists because `sudo` cannot prompt from an agent's tool call (it answers
# "sudo: a terminal is required to read the password"), so every privileged step this plan
# needs is bundled here for a person to run in their own terminal. `make up` re-adds both
# aliases on every start through infra/lib/ensure-alias.sh, because neither survives a
# reboot — so this script is needed once, and after that only if host-undo has run.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh
[ "$(id -u)" -eq 0 ] || { echo "run via: sudo bash infra/host/p6a-second-address.sh"; exit 1; }

if ifconfig lo0 | grep -q "inet $PUBLIC_EDGE_IP"; then
  echo "1/1  $PUBLIC_EDGE_IP already on lo0"
else
  ifconfig lo0 alias "$PUBLIC_EDGE_IP" up
  echo "1/1  added $PUBLIC_EDGE_IP to lo0"
fi
ifconfig lo0 | grep 'inet '
echo
echo "Done. Both addresses should be listed above. Verify with: make doctor"
