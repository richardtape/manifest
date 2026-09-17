#!/usr/bin/env bash
# P5a's ACCEPTANCE: §22's journey, through the edge at https://console.manifest.internal,
# driven by a script that uses nothing but the generated client (@manifest/contract),
# signed in with a real CWL session. Grows one step per P5a task; Task 17 makes it green.
#
# THE SPLIT, and why (P5a Decision 38). Signing in is the browser's and the IdP's
# business, outside the versioned contract (D23.8), so it goes through THE one flow,
# infra/lib/idp-login.sh. Everything Manifest's API does is packages/journey — TypeScript,
# checked by tsc against the generated types. Step 6 — inside the deployed app — is the
# app's API, not Manifest's, and is curl for the same reason.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# shellcheck source=./lib/api.sh
. scripts/lib/api.sh

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

CA="$ROOT/$CA_FILE"
WORK="$(mktemp -d -t manifest-journey)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"

# The session's VALUE out of a curl jar (Netscape format, tab-separated). curl writes an
# HttpOnly cookie's line with a `#HttpOnly_` prefix on the domain, which leaves the seven
# fields where they are.
session_of() { awk -F'\t' 'NF==7 && $6=="manifest_session" {print $7}' "$1"; }

say "0. The client and the journey, built from the checked-in document"
pnpm --filter @manifest/contract build >/dev/null
pnpm --filter @manifest/journey build >/dev/null
echo "  built"

say "0. Is the control plane up, through the edge?"
# The ANSWER, not that an answer arrived: through the edge a stopped control plane is
# Caddy's empty 502, and a source the console refuses is a 403 with a body of its own —
# `curl -o /dev/null` passed both (P5a Task 3).
UP="$(curl -sS -m 5 -w ' [%{http_code}]' "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}).
README's 'Running the control plane' has the exact commands — and check the boot line
says {\"driver\":\"docker\"} and \"origin\":\"$ORIGIN\"." ;;
esac

say "1. Sign in to Manifest with CWL, through the edge"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no manifest_session cookie"

say "The journey, through @manifest/contract"
# A Node process does not read the macOS keychain (S7), so it is given the platform CA —
# without it every call is `fetch failed` (P5a sitting 2).
NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" MANIFEST_SESSION="$SESSION" \
  node packages/journey/dist/main.js before-app "$STATE"
