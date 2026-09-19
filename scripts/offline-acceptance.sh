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
echo "=== 8. P5a's acceptance: §22's journey through the edge, by nothing but the generated client ==="
# APPENDED, like step 7, and for the same reason. This one proves a DIFFERENT
# thing offline from steps 6 and 7: not that the platform works, but that the
# published contract does — `packages/journey` calls `@manifest/contract`, which
# is generated from `packages/contract/openapi.json`, over the edge at
# console.manifest.internal. Its `tsc` build runs from the checked-in types and
# needs no registry; `make demo-journey` creates journey-app from a starter,
# builds it, deploys it, signs in inside it with CWL, asks for production and
# reads the fleet. If the step that needs a route out is this one, that is the
# finding — the same rule as step 6.
if curl -sS -m 5 https://console.manifest.internal/v1/me 2>/dev/null | grep -q UNAUTHENTICATED; then
  make demo-journey; echo "demo-journey exit=$?"
else
  echo "  SKIPPED: no control plane behind https://console.manifest.internal — the same rule as step 6."
fi

echo
echo "=== 9. P5b's acceptance: D24's loop — an agent on a delegated token, and a human who answers ==="
# APPENDED, like steps 7 and 8, and for the same reason. What this proves offline that
# step 8 does not: the SECOND CREDENTIAL CLASS. An instructor signs in with CWL and mints
# a delegated token; an agent holding nothing but that token builds and deploys token-app
# on its own authority, is refused the fleet and a production promotion, asks to add a
# member and is handed the question; the instructor confirms it in their own session and
# the agent's own retry succeeds exactly once. Nothing in it should want the network — the
# token is `node:crypto` and the build comes from the same mirror step 6 uses — so if this
# is the step that needs a route out, that IS the finding, the same rule as step 6.
#
# It leaves ONE `pending` question behind on purpose (the production promotion nobody
# answers), which is what Task 10's expiry exists for. Do not read it as a leak.
if curl -sS -m 5 https://console.manifest.internal/v1/me 2>/dev/null | grep -q UNAUTHENTICATED; then
  make demo-token; echo "demo-token exit=$?"
else
  echo "  SKIPPED: no control plane behind https://console.manifest.internal — the same rule as step 6."
fi

echo
echo "=== 10. P5c's acceptance, the half a script can run: the console builds offline, and the edge serves it ==="
# APPENDED, like steps 7, 8 and 9, and for the same reason. WHAT THIS PROVES OFFLINE THAT
# STEPS 8 AND 9 DO NOT: the console's own BUILD and its own ORIGIN. Step 8 proves the
# generated CONTRACT works offline, but `packages/journey` is plain `tsc` over checked-in
# types; the console is Vite + React + esbuild, a different toolchain with its own reasons
# to want a registry. And every step above reaches console.manifest.internal/v1/* — the
# API — never the console's DOCUMENT at `/`, which is a separate Caddyfile site proxying
# to a host process on 7104 (P5c Task 4). Both claims were untested offline until now.
#
# PREFLIGHT ONLY. `make demo-console` ends in `wait` on its preview server because its
# checklist is a person's (R3): called unguarded it would HANG this run rather than fail
# it. The flag stops it once the edge has answered with the console's own document — and
# that assertion reads the BODY for `<div id="root">`, because the wildcard answers 200
# with `manifest OK host=…` for any name (P4b finding 193).
if curl -sS -m 5 https://console.manifest.internal/v1/me 2>/dev/null | grep -q UNAUTHENTICATED; then
  MANIFEST_CONSOLE_PREFLIGHT_ONLY=1 make demo-console; echo "demo-console preflight exit=$?"
else
  echo "  SKIPPED: no control plane behind https://console.manifest.internal — the same rule as step 6."
fi

echo
echo "=== done. Turn the network back on. ==="
