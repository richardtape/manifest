#!/usr/bin/env bash
# scripts/github-conformance.sh — the fake's answers against REAL GitHub (Rich's decision, 2026-09-24;
# the D5 plan, Task 6). OPT-IN: needs infra/secrets/github-conformance.json and
# infra/secrets/github-app.pem (the plan's "What Rich does" 2), the network, and Rich's yes — it
# creates two private repositories in his organisation, pushes one commit, and deletes both.
# SKIPPED, exit 0, when any of those is missing: the offline acceptance must never fail on it.
set -euo pipefail
cd "$(dirname "$0")/.."
CONF=infra/secrets/github-conformance.json KEY=infra/secrets/github-app.pem
[ -f "$CONF" ] && [ -f "$KEY" ] || { echo "SKIPPED — no real App configured (see RUNBOOK, The conformance run)"; exit 0; }
curl -sS -m 5 -o /dev/null https://api.github.com/zen || { echo "SKIPPED — api.github.com is unreachable (the network is off)"; exit 0; }
node --import ./packages/github-fake/resolve-ts.mjs packages/github-fake/src/conformance-main.ts "$CONF" "$KEY"
