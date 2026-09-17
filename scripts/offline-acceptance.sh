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
# edge.manifest.internal, not console.: the console refuses every source but the host
# (P5a Task 3), so it no longer answers both sides identically. `edge` is a reserved label
# no Caddyfile site names, so the wildcard answers it everywhere.
curl -sS https://edge.manifest.internal/ ; echo
docker run --rm --network manifest-platform --dns 10.89.0.53 \
  -v "$PWD/infra/ca/manifest-root.crt":/ca.crt:ro curlimages/curl:8.11.1 \
  --cacert /ca.crt -sS https://edge.manifest.internal/ ; echo

echo
echo "=== 6. P4a's acceptance: a real CWL login, offline ==="
# THE HALF THAT MOST PLAUSIBLY NEEDS THE NETWORK. This one builds an image from
# `node-ts-mongo@1`, whose five app-side dependencies come from Verdaccio, and
# then completes a full SAML round trip against the Manifest IdP — so it
# exercises the mirror, the egress-free builder and the whole identity path in
# one run. `make seed` warms the mirror from the lockfiles; if this is the step
# that needs a route out, that IS the finding.
#
# It needs the control plane RUNNING, which `make up` does not start — see
# README's "Running the control plane". If it is not up, this reports that and
# the rest of the run still stands.
if curl -sS -m 5 https://console.manifest.internal/v1/me 2>/dev/null | grep -q UNAUTHENTICATED; then
  make demo-identity; echo "demo-identity exit=$?"
else
  echo "  SKIPPED: no control plane behind https://console.manifest.internal. Start it (README: Running the"
  echo "  control plane) and re-run this step — a skipped acceptance is not a"
  echo "  passed one, and it is the step most likely to need the network."
fi

echo
echo "=== 7. P4b's acceptance: the proof app answers a question, offline ==="
# APPENDED, never a replacement for step 6 (P4a defect 70 was a second `trap` that
# replaced the first). THE QUESTION OFFLINE IS OLLAMA: it is a HOST application,
# not a container, so `make up` does not start it, and LiteLLM reaches it at
# host.docker.internal:11434. If this is the step that fails, check `ollama list`
# holds ministral-3 and nomic-embed-text before blaming the platform. It also
# reads LiteLLM's spend log, which needs no network.
if curl -sS -m 5 https://console.manifest.internal/v1/me 2>/dev/null | grep -q UNAUTHENTICATED; then
  make demo-ai; echo "demo-ai exit=$?"
else
  echo "  SKIPPED: no control plane behind https://console.manifest.internal — the same rule as step 6."
fi

echo
echo "=== done. Turn the network back on. ==="
