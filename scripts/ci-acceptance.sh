#!/usr/bin/env bash
# 1c's acceptance, the HEADLESS half: §22's journey driven over the published contract with
# no browser automation at all (§22, *The CI half comes free*). The clicked half is a
# person's — an agent driving Chrome cannot type a password (ORIENTATION §4) — and
# `make demo-console` prints its checklist.
#
# THERE IS NO CI WORKFLOW FILE, deliberately (P5c Decision 11): nothing can run this but a
# Mac with Docker Desktop, Ollama with two models, a trusted CA in the macOS keychain and
# the 127.0.0.2 loopback alias. A workflow no runner executes is a module with no call
# site, the defect shape this project has shipped four times. THIS SCRIPT IS THE CALLER;
# the day a runner exists, the workflow is three lines that invoke it.
#
# IT IS NOT scripts/offline-acceptance.sh. That one is C1's — run by hand with the network
# OFF, because turning the network off from a tool call cuts the agent off too — and its
# twelve `=== n.` headings are numbered 0 to 11, where 0 is the precondition and 1-11 are
# the work (this line said "ten, 0 to 9" through P5c's step 10; P6a Task 19 found it).
# This one runs with the network on and asserts the gates' COUNTS as well.
#
# EVERY STEP REPORTS RATHER THAN EXITS (P4c Decision 26), so a red run is a MEASUREMENT of
# what is broken rather than a stop at the first thing. The exit status is the summary's.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m' "$1"; }
red() { printf '\033[31m%s\033[0m' "$1"; }

# THE EXPECTED COUNTS, READ FROM ORIENTATION §2's BOX ON THE DAY THIS WAS WRITTEN
# (2026-09-19, P5c sitting 8). Decision 12: this script asserts COUNTS and never exit codes
# alone, because `vitest run <path>` against a path that matches no file prints
# `No test files found` and EXITS 1 — and a summary-only filter swallows that line, leaving
# a result that looks exactly like nothing failed (P5b sitting 9, F5).
#
# A MISMATCH IS REPORTED AS A NUMBER THAT MOVED, NOT AS A FAILURE. A test added on purpose
# must not fail CI; what must not happen is that it moves and nobody notices. When it does,
# update ORIENTATION §2's box, README, RUNBOOK and this line together (§6).
#
# THIS SCRIPT IS THE FOURTH PLACE THE GATE NUMBERS LIVE, AND IT WENT STALE THE FIRST TIME
# THEY MOVED. P6a sitting 2 took doctor 18 -> 19 and verify 51 -> 54 and swept the three
# DOCUMENTS; nothing pointed it at this file, because §6's sweep list names documents only.
# Found by P6a sitting 3 by opening the file rather than by re-reading the list, and §6's
# table now carries a row for it.
#
# EXPECT_TESTS IS THE *PASSED* COUNT, AND SINCE P6a SITTING 9 THERE IS NO SKIPPED TEST.
# `pnpm test` prints `Tests  1604 passed (1604)`: Task 14 un-skipped the production gate's
# positive control — the one `it.skip` that had been there since Task 7 — so the `| 1 skipped`
# is gone and the passed count and the total are the same number. `awk '{print $2}'` reads the
# passed count from that line either way. Last moved 2026-09-22 by P6a sitting 11 (Task 19):
# +1 test in `routing/routes.test.ts` — an existing route on the WRONG listener is moved,
# found by the acceptance's control (e). Before that, sitting 10: +6 and one file, and
# `make verify` +1 for the registry's realm. Then P6b sitting 2 (2026-09-23): +30 and two
# files — the person-only class and the sensitive diff over frozen releases. `make doctor`
# carried ONE WARNING from that sitting (a vulnerability database past seven days) until P6b
# sitting 3 refreshed it; a warning is not a check, so EXPECT_DOCTOR never moved. Then P6b
# sitting 3 (2026-09-23): +16 and one file — an app has launched, and D9.2's second half.
# Then P6b sitting 4 (2026-09-23): +11, no new file — the gate for a launched app. Then P6b
# sitting 5 (2026-09-23): +28, no new file — the IAM change request and R4(d)'s summary.
EXPECT_TESTS=1690
EXPECT_FILES=122
EXPECT_DOCTOR=19
EXPECT_VERIFY=55

STEPS=""
FAILED=0
MOVED=0

# record <name> <status> <note>
record() {
  STEPS="${STEPS}${1}|${2}|${3}
"
  [ "$2" = FAIL ] && FAILED=$((FAILED + 1))
  [ "$2" = MOVED ] && MOVED=$((MOVED + 1))
  return 0
}

LOG="$(mktemp -t manifest-ci)"
trap 'rm -f "$LOG"' EXIT

# run <name> <command...> — reports, never exits.
run() {
  local name="$1"
  shift
  bold "=== $name ==="
  if "$@" 2>&1 | tee "$LOG"; then
    :
  fi
  # The status of the COMMAND, not of `tee`. In zsh this array is `$pipestatus` indexed
  # from 1 and `${PIPESTATUS[0]}` is EMPTY (ORIENTATION §4); this script is bash, where
  # PIPESTATUS[0] is the right spelling — which is why it has a bash shebang and is run
  # as `bash scripts/ci-acceptance.sh`.
  local rc="${PIPESTATUS[0]}"
  if [ "$rc" -eq 0 ]; then
    record "$name" PASS "exit 0"
  else
    record "$name" FAIL "exit $rc — $(tail -n 3 "$LOG" | tr '\n' ' ' | cut -c1-160)"
  fi
  return 0
}

bold "1c's acceptance, headless. $(date '+%Y-%m-%d %H:%M:%S')"
echo "Every step reports; the summary at the end is the result."

# ---------------------------------------------------------------- 1. the platform
# counted <name> <expected> — reads the count out of the run that has just happened, from
# $LOG. Never re-runs the command: `make verify` is the better part of a minute, and a
# second run would also report a DIFFERENT machine from the one the first step checked.
counted() {
  local name="$1" expected="$2" got
  got="$(grep -E '^ +[0-9]+ checks' "$LOG" | tail -1 | awk '{print $1}')"
  if [ "$got" = "$expected" ]; then
    record "$name count" PASS "$got checks"
  else
    record "$name count" MOVED \
      "counts moved: expected $expected, got ${got:-none} — update ORIENTATION §2, README, RUNBOOK and this script together"
  fi
}

run "make doctor" make doctor
counted doctor "$EXPECT_DOCTOR"

# `make verify` BEFORE any demo, and especially after a reset: the host can lose the edge
# while a container still has it, intermittently, and `make verify` names the shape exactly
# — the remedy is `docker restart manifest-caddy`, not debugging the control plane (P5b
# sitting 9, F6).
run "make verify" make verify
counted verify "$EXPECT_VERIFY"

# ---------------------------------------------------------------- 2. the three fast gates
run "pnpm lint" pnpm lint
run "pnpm typecheck" pnpm typecheck
run "pnpm format:check" pnpm format:check

# ---------------------------------------------------------------- 3. the unit tier
# IT RUNS BEFORE THE DEMOS, AND THE ORDER IS LOAD-BEARING: `pnpm test` TRUNCATES the
# control plane's §6 tables (so does one file, and so does `pnpm contract:write`). The
# other way round it would empty the database the demos had just filled, the demos would
# recreate their projects, and which step made the machine what it is would be hidden.
bold "=== pnpm test ==="
pnpm test 2>&1 | tee "$LOG"
TEST_RC="${PIPESTATUS[0]}"
GOT_TESTS="$(grep -E '^ +Tests +[0-9]+ passed' "$LOG" | awk '{print $2}' | tail -1)"
GOT_FILES="$(grep -E '^ +Test Files +[0-9]+ passed' "$LOG" | awk '{print $3}' | tail -1)"
if [ "$TEST_RC" -ne 0 ]; then
  record "pnpm test" FAIL "exit $TEST_RC"
elif [ "$GOT_TESTS" = "$EXPECT_TESTS" ] && [ "$GOT_FILES" = "$EXPECT_FILES" ]; then
  record "pnpm test" PASS "$GOT_TESTS tests in $GOT_FILES files"
else
  record "pnpm test" MOVED \
    "counts moved: expected $EXPECT_TESTS in $EXPECT_FILES files, got ${GOT_TESTS:-none} in ${GOT_FILES:-none} — update ORIENTATION §2 and this script together"
fi

# ---------------------------------------------------------------- 4. the clients build
# The contract's `tsc` half is what proves the console and the mock still FIT the document:
# a generated client is mostly types, and `tsc` over them is the only check there is.
# `@manifest/contract` first, every time — its `exports` map sends `tsc` to src/ and Vite
# to dist/, so a stale dist/ ships with every gate green (P5c sitting 1, F3), and this
# matters most the moment its version changes.
run "build @manifest/contract" pnpm --filter @manifest/contract build
run "build @manifest/console" pnpm --filter @manifest/console build
run "build @manifest/mock" pnpm --filter @manifest/mock build

# ---------------------------------------------------------------- 5. the three headless journeys
# All three drive the published contract through the edge and none uses a browser.
#   demo-journey    — §22's journey on a SESSION (P5a's acceptance)
#   demo-token      — D24's loop on a DELEGATED TOKEN (P5b's acceptance), which is why P5b
#                     came first: the second credential class needs the first one's routes.
#   demo-production — the FIRST PRODUCTION LAUNCH (P6a's acceptance): records, rehearsal,
#                     step-up, approval and a deploy to §12's public listener. It adds NO
#                     test, so the EXPECT_ counts above did not move with it. LAST, because
#                     it leaves `launch-app` in production and a rebuild in staging.
run "make demo-journey" make demo-journey
run "make demo-token" make demo-token
run "make demo-production" make demo-production

# ---------------------------------------------------------------- the summary
bold "=== summary ==="
printf '%s' "$STEPS" | while IFS='|' read -r name status note; do
  [ -z "$name" ] && continue
  case "$status" in
    PASS) printf '  %s  %-28s %s\n' "$(green PASS)" "$name" "$note" ;;
    MOVED) printf '  %s %-28s %s\n' "$(printf '\033[33m%s\033[0m' MOVED)" "$name" "$note" ;;
    *) printf '  %s  %-28s %s\n' "$(red FAIL)" "$name" "$note" ;;
  esac
done

printf '\n  %d failed, %d moved\n' "$FAILED" "$MOVED"
cat <<'TAIL'

  WHAT THIS DOES NOT COVER, deliberately:
   - the CLICKED half of the acceptance — `make demo-console` prints that checklist, and
     a person runs it, because the Chrome extension will not type a password;
   - `pnpm test:docker` (~13 minutes), owed only by a change to runtime/, routing/,
     services/, build/, releases/, identity/, sso/, secrets/, projects/, blueprints/,
     ai/, observability/, infra/ or a *.docker.test.ts;
   - the OFFLINE acceptance — `scripts/offline-acceptance.sh`, run by hand with the
     network off, whose steps 0-11 include `make demo-identity` and `make demo-ai`.
TAIL

[ "$FAILED" -eq 0 ]
