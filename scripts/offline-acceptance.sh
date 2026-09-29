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

# WHICH SOURCE DRIVER the control plane runs (the D5 plan's Decision 3: ONE per process), asked
# the way `make demo-github` asks it — an unsigned delivery: `local`, `github`, or `none`. Steps 6
# to 12 are DRIVER 1's, step 13 is DRIVER 2's and steps 14 and 15 run on either; run a driver-1 demo on driver 2 and it CREATES
# its project there, where no route can delete it (P6a F5) and driver 1 refuses it for ever.
source_driver() {
  local answer
  answer="$(curl -sS -m 5 -X POST -H 'content-type: application/json' -d '{}' \
    http://127.0.0.1:7100/webhooks/github 2>/dev/null || true)"
  case "$answer" in
    *'"WEBHOOKS_NOT_CONFIGURED"'*) echo local ;;
    *'"WEBHOOK_SIGNATURE_MISSING"'*) echo github ;;
    *) echo none ;;
  esac
}
# 0 when a control plane on driver $1 (`local` or `github`) answers through the edge; otherwise
# SKIP_WHY says why not, for the step's SKIPPED line.
SKIP_WHY=""
control_plane_on() {
  local got
  if ! curl -sS -m 5 https://console.manifest.internal/v1/me 2>/dev/null | grep -q UNAUTHENTICATED; then
    SKIP_WHY="no control plane behind https://console.manifest.internal"
    return 1
  fi
  got="$(source_driver)"
  [ "$got" = "$1" ] && return 0
  case "$got" in
    github) SKIP_WHY="the control plane runs driver 2 (MANIFEST_SOURCE_DRIVER=github), and this step is driver 1's" ;;
    local) SKIP_WHY="the control plane runs driver 1, and this step is driver 2's" ;;
    *) SKIP_WHY="the control plane answers through the edge, and not at 127.0.0.1:7100/webhooks/github" ;;
  esac
  return 1
}

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
# RUNBOOK's "Running the control plane". If it is not up, this reports that and
# the rest of the run still stands.
if control_plane_on local; then
  make demo-identity; echo "demo-identity exit=$?"
else
  echo "  SKIPPED: $SKIP_WHY. Start it on driver 1 (RUNBOOK: Running the"
  echo "  control plane) and re-run this step — a skipped acceptance is not a"
  echo "  passed one, and it is the step most likely to need the network."
fi

echo
echo "=== 7. P4b's acceptance: the proof app answers a question, offline ==="
# APPENDED, never a replacement for step 6 (P4a defect 70 was a second `trap` that
# replaced the first). THE QUESTION OFFLINE IS OLLAMA: it is a HOST application,
# not a container, so `make up` does not start it, and LiteLLM reaches it at
# host.docker.internal:11434. If this is the step that fails, check `ollama list`
# holds qwen3.5:4b and nomic-embed-text before blaming the platform. It also
# reads LiteLLM's spend log, which needs no network.
if control_plane_on local; then
  make demo-ai; echo "demo-ai exit=$?"
else
  echo "  SKIPPED: $SKIP_WHY — the same rule as step 6."
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
if control_plane_on local; then
  make demo-journey; echo "demo-journey exit=$?"
else
  echo "  SKIPPED: $SKIP_WHY — the same rule as step 6."
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
if control_plane_on local; then
  make demo-token; echo "demo-token exit=$?"
else
  echo "  SKIPPED: $SKIP_WHY — the same rule as step 6."
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
if control_plane_on local; then
  MANIFEST_CONSOLE_PREFLIGHT_ONLY=1 make demo-console; echo "demo-console preflight exit=$?"
else
  echo "  SKIPPED: $SKIP_WHY — the same rule as step 6."
fi

echo
echo "=== 11. P6a's acceptance: the first production launch, offline ==="
# APPENDED, like steps 7 to 10, and for the same reason. WHAT THIS PROVES OFFLINE THAT THE
# OTHER TEN DO NOT: a production launch needs the REGISTRY (the approved digest is verified
# and the image pulled before anything starts), the IdP TWICE per person (the rehearsal's
# sign-in, and §20's step-up re-prompt), and §12's second listener on 127.0.0.3 — none of
# which any earlier step touches.
#
# AND `ai/` FOR THE APPROVAL'S SUMMARY — THE ONE THING HERE THAT MAY LEGITIMATELY BE
# ABSENT. With the network off the summary can come back `summarySource: unavailable`, and
# that is Decision 7 being DEMONSTRATED rather than argued: the approval is recorded with
# the diff and without the words, and the launch goes ahead. Do not read it as a failure.
# (On a first launch it reads `no-previous-release` whatever the network does.)
if control_plane_on local; then
  make demo-production; echo "demo-production exit=$?"
else
  echo "  SKIPPED: $SKIP_WHY — the same rule as step 6."
fi

echo
echo "=== 12. P6b's acceptance: subsequent releases, offline ==="
# APPENDED, like steps 7 to 11, and for the same reason. WHAT THIS PROVES OFFLINE THAT STEP 11
# DOES NOT: what a LAUNCHED app's next release does — a self-serve production redeploy under a
# loop on the public listener, a sensitive change re-escalated to an administrator who reads a
# STORED preview and approves naming it, the egress proxy re-rendered for the approved host, and
# §9's IAM change request refusing a build until UBC has registered the attribute. Step 11 ends
# where this begins, and on a machine where launch-app has not launched this runs it first.
#
# THE PREVIEW'S SUMMARY MAY LEGITIMATELY READ `unavailable` OFFLINE — Decision 7 again: the
# record carries the diff and the security notes without the model's words, and the approval
# goes ahead. And while it does, NEGATIVE CONTROL (c) — a decision that re-asks the model instead
# of copying the preview — CANNOT FAIL, because both summaries are null. That control is proved
# online (P6b sitting 7), not here. The run host's egress probe reads `500 Unable to connect`
# offline, which is tinyproxy LETTING IT THROUGH to a name nothing resolves: not a failure.
if control_plane_on local; then
  make demo-releases; echo "demo-releases exit=$?"
else
  echo "  SKIPPED: $SKIP_WHY — the same rule as step 6."
fi

echo
echo "=== 13. The D5 plan's acceptance: an app whose code is on (fake) GitHub, offline ==="
# APPENDED, like steps 7 to 12, and for the same reason. WHAT THIS PROVES OFFLINE THAT THE OTHER
# TWELVE DO NOT: D5's driver 2 — the GitHub FAKE in its container, a person's push reaching
# Manifest by a SIGNED webhook through host.docker.internal (never through the edge), the MIRROR
# building a commit with GitHub stopped while anything needing GitHub NOW answers 503, a
# repository made private again, a pushed secret found and never quoted, and `main` protected.
# The fake's image needed the network ONCE, at `make seed` (apk add git) — an image that was never
# built cannot be built offline, and `make doctor` says so.
#
# IT NEEDS THE CONTROL PLANE ON DRIVER 2, and steps 6 to 12 need it on driver 1: one driver per
# control-plane process. So reached on driver 1, this step prints both restart commands and is
# SKIPPED — a skipped acceptance is not a passed one: restart on driver 2 and run it by hand.
if control_plane_on github; then
  make demo-github; echo "demo-github exit=$?"
else
  echo "  SKIPPED: $SKIP_WHY."
  cat <<'RESTART'
  Stop the control plane (Ctrl-C in its terminal), then start it on DRIVER 2 — RUNBOOK's
  'The control plane on driver 2':

      make github-up
      export MANIFEST_SOURCE_DRIVER=github     # every MANIFEST_GITHUB_* default is the fake's
      pnpm --filter @manifest/control-plane dev

  and run `make demo-github`. Afterwards, back to DRIVER 1 — RUNBOOK's 'Running the control
  plane' — so every other demo runs where it belongs:

      unset MANIFEST_SOURCE_DRIVER
      pnpm --filter @manifest/control-plane dev
      make github-down
RESTART
fi

echo
echo "=== 14. The authoring API's acceptance: an agent builds a bulletin board through the API, offline ==="
# APPENDED, like steps 7 to 13. WHAT THIS PROVES OFFLINE THAT THE OTHER THIRTEEN DO NOT: an app
# CREATED through the API — an agent on a delegated token reads the documentation the API serves,
# commits the board to the bare skeleton (refused six ways, and a person's symlink met), builds
# exactly the commit it wrote, is refused a deploy until it sets the app's secret, and is refused
# production's — then a student posts and an instructor replies and pins the question.
#
# IT RUNS ON EITHER DRIVER, and says which slug: `board-local` on driver 1, `board-github` on
# driver 2 (step 0 asks the control plane, as this script's `source_driver` does). So it runs on
# whichever driver the control plane is on now — after step 13 on driver 2, or after step 12 on
# driver 1. Run it on BOTH for the whole acceptance: once here, and once after restarting.
case "$(source_driver)" in
  local | github)
    echo "  on driver $([ "$(source_driver)" = local ] && echo '1 — board-local' || echo '2 — board-github')"
    make demo-authoring; echo "demo-authoring exit=$?"
    ;;
  *) echo "  SKIPPED: no control plane answered 127.0.0.1:7100/webhooks/github — start one on either driver (RUNBOOK)." ;;
esac

echo
echo "=== 15. The front-end enablement plan's acceptance: the faculty front-end's origin, end to end, offline ==="
# APPENDED, like steps 7 to 14. WHAT THIS PROVES OFFLINE THAT THE OTHER FOURTEEN DO NOT: the `app`
# ORIGIN, https://app.manifest.internal — a person signed in THERE (and a post from the console's
# origin with that cookie refused), a delegated token handed to a front-end's server, a MODEL
# SESSION charged to the person with one real completion on the ON-PREMISE model, an app written as
# text AND bytes (a PDF with a key in it refused), a sandbox instance's recent output read back
# redacted, a student added by CWL login name, the app switched off (410) and brought back with its
# data, and a scratch project deleted for good.
#
# ITS APP IS `confidential`, so its model session holds no `default-chat` and it calls
# `default-chat-onprem` — qwen3.8:27b, which `make doctor` (step 3) needs pulled, and which this step
# warms (~12 s cold; it evicts qwen3.5:4b). It never calls `default-chat-large`, which needs the network.
#
# IT RUNS ON EITHER DRIVER, like step 14, and says which slug: `frontend-local` on driver 1,
# `frontend-github` on driver 2. Run it on BOTH for the whole acceptance.
case "$(source_driver)" in
  local | github)
    echo "  on driver $([ "$(source_driver)" = local ] && echo '1 — frontend-local' || echo '2 — frontend-github')"
    make demo-frontend; echo "demo-frontend exit=$?"
    ;;
  *) echo "  SKIPPED: no control plane answered 127.0.0.1:7100/webhooks/github — start one on either driver (RUNBOOK)." ;;
esac

echo
echo "=== done. Turn the network back on. ==="
