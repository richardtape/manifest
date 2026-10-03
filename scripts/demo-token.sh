#!/usr/bin/env bash
# P5b's ACCEPTANCE: D24's loop, end to end, through the edge at
# https://console.manifest.internal. An instructor signs in with CWL and mints a delegated
# token; an agent holding that token runs §22's build loop on its own authority, is refused
# one of D24's privileged four and handed the question a person must answer; the instructor
# confirms it in their own session; and the agent's own retry succeeds exactly once.
#
# THE SPLIT, and why — the same as `scripts/demo-journey.sh` (P5a Decision 38). Signing in
# is the browser's and the IdP's business, outside the versioned contract (D23.8), so it
# goes through THE one flow, infra/lib/idp-login.sh. Everything Manifest's API does is
# packages/journey/src/token.ts — TypeScript, checked by tsc against the generated types,
# importing nothing but @manifest/contract.
#
# THE ONE PRECONDITION THIS SCRIPT EXISTS TO MEET. Step 6 has the agent ask to add a faculty
# COLLEAGUE to the project, and `POST /v1/projects/{id}/members` refuses `400
# MEMBER_USER_NOT_FOUND` for anybody who has never signed in. So the colleague is signed in
# here, before the TypeScript runs — otherwise the confirmed retry answers 400 and reads as
# a defect in D24's grant rather than as a missing sign-in. The STUDENT is signed in too: since
# FE-39 only a person who may build is added, and step 8 shows the student refused
# `409 MEMBER_MAY_NOT_BUILD` — which needs a student who has signed in, or it is 400.
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
# The one place this demo's project name is written in bash. The TypeScript half writes it
# in `SLUG`, and `clear_orphan_repository` below needs it here.
SLUG=token-app
WORK="$(mktemp -d -t manifest-token)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"

# The session's VALUE out of a curl jar (Netscape format, tab-separated). curl writes an
# HttpOnly cookie's line with a `#HttpOnly_` prefix on the domain, which leaves the seven
# fields where they are.
# The Manifest session out of a curl jar, under its name on an https origin — every origin this
# demo signs in on is one, through the edge (FE-28: the plain name is loopback http's alone).
session_of() { awk -F'\t' 'NF==7 && $6=="__Host-manifest_session" {print $7}' "$1"; }

# Quiet when it builds, and LOUD when it does not. `tsc` writes its errors to STDOUT, so a
# `build >/dev/null` throws them away and a demo that no longer type-checks against the
# generated contract stops at `make: *** Error 2` with nothing saying why (P5a sitting 5).
build() {
  local out
  if ! out="$(pnpm --filter "$1" build 2>&1)"; then
    printf '%s\n' "$out" >&2
    fail "$1 does not build — tsc's errors are above. This demo is checked against the
generated contract, so a call or a field the contract does not have stops here."
  fi
}

say "0. The client and the demo, built from the checked-in document"
build @manifest/contract
build @manifest/journey
echo "  built"

say "0. Is the control plane up, through the edge?"
# The ANSWER, not that an answer arrived: through the edge a stopped control plane is
# Caddy's empty 502, and a source the console refuses is a 403 with a body of its own —
# `curl -o /dev/null` passed both (P5a Task 3).
UP="$(curl -sS -m 5 -w ' [%{http_code}]' "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}).
docs/superpowers/RUNBOOK.md's 'Running the control plane' has the exact commands — and check the boot line
says {\"driver\":\"docker\"} and \"origin\":\"$ORIGIN\"." ;;
esac
# Driver 1's demo: refused on a driver-2 control plane BEFORE anything is created (Task 12).
require_driver local

say "1. Sign in to Manifest with CWL, as the instructor, through the edge"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no __Host-manifest_session cookie"
echo "  signed in as the instructor"

say "1b. The instructor steps up (§20) — confirming a privileged action needs it, since P6a"
# Since P6a (`f989fcb`, 2026-09-20) confirming one of D24's privileged actions is a step-up
# capability, so step 7 needs a stepped-up session; without one it was refused STEP_UP_REQUIRED,
# red and unseen until the D5 plan's sitting 8 (nothing had run this demo since P5c). Sessions are
# stateless (P6a Decision 8): the cookie from BEFORE the step-up stays a valid, un-stepped session,
# which is what lets step 7 prove the refusal and the confirmation in one run. A step-up lasts ten
# minutes, and this demo takes about thirty seconds. The IdP must RE-PROMPT, which idp_login asserts.
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/step-up" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION_STEPPED="$(session_of "$CP_JAR")"
[ -n "$SESSION_STEPPED" ] && [ "$SESSION_STEPPED" != "$SESSION" ] \
  || fail "the step-up left the session unchanged — the callback did not re-sign it"
echo "  stepped up"

say "1a. Sign the COLLEAGUE and the STUDENT in once, so there is somebody to add, and somebody refused"
# A person must exist in `users` before they can be made a member, and `pnpm test` and
# `make reset` both empty that table. Each session is thrown away immediately — all this
# needs to leave behind is the row, and the affiliation its sign-in wrote.
COL_JAR="$WORK/colleague.jar"; COL_IDP_JAR="$WORK/colleague-idp.jar"
idp_login "$COL_JAR" "$COL_IDP_JAR" "$ORIGIN/auth/login" colleague colleague \
  "$ORIGIN/auth/saml/callback" "$CA"
[ -n "$(session_of "$COL_JAR")" ] || fail "the colleague's sign-in left no session, so
col000001 may not exist in \`users\` — step 8's retry would answer 400 MEMBER_USER_NOT_FOUND
and read as a defect in D24's grant"
rm -f "$COL_JAR" "$COL_IDP_JAR"
echo "  col000001 (faculty) has signed in at least once"
STU_JAR="$WORK/student.jar"; STU_IDP_JAR="$WORK/student-idp.jar"
idp_login "$STU_JAR" "$STU_IDP_JAR" "$ORIGIN/auth/login" student student \
  "$ORIGIN/auth/saml/callback" "$CA"
[ -n "$(session_of "$STU_JAR")" ] || fail "the student's sign-in left no session, so
step 8's refusal would be 400 MEMBER_USER_NOT_FOUND rather than 409 MEMBER_MAY_NOT_BUILD"
rm -f "$STU_JAR" "$STU_IDP_JAR"
echo "  stu000001 (a student) has signed in at least once"

# token-app's repository, if a `pnpm test` left it without its project (P5a Task 11).
clear_orphan_repository "$SLUG"

say "D24's loop, through @manifest/contract"
# A Node process does not read the macOS keychain (S7), so it is given the platform CA —
# without it every call is `fetch failed` (P5a sitting 2). It reaches the DEPLOYED APP's
# hostname too, at step 5, which the same CA signs.
NODE_EXTRA_CA_CERTS="$CA" MANIFEST_ORIGIN="$ORIGIN" MANIFEST_SESSION="$SESSION" \
  MANIFEST_SESSION_STEPPED="$SESSION_STEPPED" node packages/journey/dist/token.js
