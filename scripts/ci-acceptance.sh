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
# sixteen `=== n.` headings are numbered 0 to 15, where 0 is the precondition and 1-15 are
# the work (this line said "ten, 0 to 9" through P5c's step 10; P6a Task 19 found it; P6b
# Task 11 added step 12, `make demo-releases`; the D5 plan's Task 15 step 13, `make
# demo-github`; the authoring API plan's Task 13 step 14, `make demo-authoring`; the front-end
# enablement plan's Task 15 step 15, `make demo-frontend`).
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
# update ORIENTATION's two boxes, RUNBOOK and this line together (§6).
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
# Then P6b sitting 6 (2026-09-23): +33 and one file — the stored preview (13), its two
# routes in the authorization matrix (18), the rehearsal's one-clock bound (1) and the mock
# refusing a decision that names no preview (1). Then the F10 sitting (2026-09-24): +19, no new
# file — the session's IdP handle (3), the SLO route's signed-only refusals and the console
# sign-out's round trip (10), the console's `signOut` (5) and the mock's answer (1).
# Then the D5 plan's sitting 2 (2026-09-24): +36 and two files — the source-driver contract
# suite (11) and startBuild's absent-commit refusal (1), then the key custody rule (11), the
# App JWT and key loader (8) and the source driver's settings (5).
# Then the D5 plan's sitting 8 (2026-09-25): +2, no new file — the GitHub fake's not-GitHub page
# at a repository's html_url (1) and its delivery log kept across a restart (1); then its final
# review's fix pass: +3 — a path into the worktree's own .git refused (1 contract case × 2
# drivers) and a push a read synced first still validated (1).
# Then the authoring API plan's sitting 2 (2026-09-25): +29 and one file — F7's added/removed
# (2) and its lock (1); `source/plumbing.test.ts` (12: the planner, the builder, pushVerdict);
# and the write primitive's seven contract cases × 2 drivers (14). Then, the same evening, +3 for
# F7's option (b): no model sentence for a CWL attribute change (3).
# Then the authoring API plan's sitting 3 (2026-09-25): +66 and two files — Task 4's read cases
# (4 contract cases × 2 drivers, 8) and `source/reading.test.ts` (14); Task 5's `api/source.test.ts`
# (7), its four rows in the authorization matrix (36) and the mock answering from the document (1).
# Then the authoring API plan's sitting 4 (2026-09-26): +28 and one file — `api/source-commit.test.ts`
# (12), `createCommit`'s row in the authorization matrix (9), `pathProblem` (2), an invalid
# validation announced (1), and Task 7's builds of the right spec (2) and the blueprint pin (2).
# Then the authoring API plan's sitting 5 (2026-09-26): +66 and one file — `api/secrets.test.ts`
# (16), the five secrets rows in the authorization matrix (45), the injection contract's declared
# secrets (3), `secret:write` in the step-up set (1) and the keyed idempotency fingerprint (1).
# Then the authoring API plan's sitting 6 (2026-09-26): +14 and three files — the reference's
# completeness gate `api/contract/docs.test.ts` (5), the independent linter `lint.test.ts` (4),
# `manifest-yaml.test.ts`'s corpus (3), the matrix's `credential: session` check (1) and the
# wrapper's own refusal of a token (1).
# Then the authoring API plan's sitting 7 (2026-09-26): +16 and one file — the mock's gate over
# every document example and its FROM_EXAMPLE gate (2) and four keyed answers (4) in
# `packages/mock/src/server.test.ts`, the Code screen's pure half `code-state.test.ts` (9), and
# the console's calls of the eight new operations against the mock (1).
# Then the authoring API plan's sitting 8 (2026-09-26): +71 and five files — the docs loader
# `docs/load.test.ts` (10), the served docs `api/docs.test.ts` (6), the three docs rows in the
# authorization matrix (27), the platform's emptied-manifest envelope (1), the mock's keyed docs and
# two refusals (4), the journey gate `coverage.test.ts` (3), the guides' examples run against the
# mock `examples.test.ts` (12), the docs drift gate `packages/journey/src/docs.test.ts` (5), the
# console's docs calls (1) and the HTML reference's boundary (2). Then, after its close at Rich's
# request, `pnpm docs:html`'s `packages/journey/src/docs-html.test.ts` (4) — +4 and one file — and
# the page opening itself (1).
# Then the authoring API plan's sitting 9 (2026-09-26): +25 and two files — the scan paged to the
# end (2) and its driver half (1), the observer's `repository.scan_incomplete` in
# `projects/source-events.test.ts` (1); `personName` in `projects/source-attribution.test.ts` (1)
# and three publishers' sentences (3); the six minors (7: the bodyless webhook, a never-read
# visibility, a repository with none, the link's visibility, the fake refused outside development,
# no inherited git configuration, SummaryContext's type); a replayed mint (3), the primitive's
# withholding (1) and the mock's (1); and Spec action 4 — the per-user quota and the warnings (4)
# and the route's warnings, held to the published examples (1).
# Then the authoring API plan's sitting 10 (2026-09-26, the acceptance): +2 and no file — the whole-branch
# review's two Important findings, each red first: a commit that LANDED answered and recorded when its
# validation after the push fails (1), and one Idempotency-Key on another secret refused (1).
# Then the front-end enablement plan's sitting 2 (2026-09-27, recent output): +74 and two files —
# the demuxer (9), the ONE reader `observability/output.test.ts` (15, new), the line redactor (10),
# the fake driver's run of *honours tail* (1), `listInstances` and `getInstanceOutput` in
# `api/instances.test.ts` (12, new), and the authorization matrix's three rows (27); minus
# nothing — `events.test.ts`'s three reads were scoped, not removed.
# Then the front-end enablement plan's sitting 3 (2026-09-27, binary files): +21 and one file —
# `source/binary.test.ts` (7, new), the source driver contract's three byte cases on each driver
# (6), `api/source-commit.test.ts`'s binary writes (7) and `api/source.test.ts`'s byte read (1).
# Then the front-end enablement plan's sitting 4 (2026-09-27, Task 5 and every quadratic line reader):
# +26 and one file — the secret list's 1 MiB bound, a token inside it and its oracle (3) and the
# hook's 1 MiB corpus push (1); the redactor's bound, joined lines, tail and oracle (4);
# `identity/saml.test.ts` (2, new) and the logout's two bombs and a request beside a response (3);
# F1's pin (1), F4 (1), F7 (1, and 2 on the drivers), F8 (1), F9 (2), F10 (1), F11 (2) and F12 on
# the drivers (2).
# Then the front-end enablement plan's sitting 5 (2026-09-27, a project's name and people by CWL
# login): +33 and one file — `api/projects.test.ts`'s name, rename and first-PATCH cases (9),
# `api/auth.test.ts`'s four `uid` sign-ins (4), `api/members.test.ts` (11, new), and the
# authorization matrix's `PATCH` row, once per actor (9).
# Then its sitting 8 (2026-09-27, archive and restore): +50 and two files — `api/lifecycle.test.ts`
# (16, new), `projects/state.test.ts` (2, new), `projects/authz.test.ts` (4), `db/locks.test.ts` (1),
# `tokens/expiry.test.ts` (1), `routing/routes.test.ts` (3), `sso/entity.test.ts` (1), the fake
# driver's contract (4), and the authorization matrix's archive and restore rows (18).
# Then its sitting 9 (2026-09-27, delete): +28, no new file — `api/lifecycle.test.ts` (11),
# `projects/state.test.ts` (1), `projects/source-events.test.ts` (1), `source/plumbing.test.ts` (1),
# the source driver contract on both drivers (2), `source/github/driver.test.ts` (1),
# `build/context.test.ts` (1), the fake driver's contract (1), and the matrix's delete row (9).
# Then its sitting 9a (2026-09-28, the capable model): +18 and one file — `ai/capable.test.ts` (17,
# new) and `config.test.ts`'s capable-model setting (1); the scrub list grew inside an existing test.
# Then its sitting 9b (2026-09-28, the capable model's fallback): +19, no new file — `ai/capable.test.ts`
# (17: the fallback's 12 and the boot's 5), `config.test.ts`'s fallback setting (1) and `ai/client.test.ts`'s
# DELETE (1).
# Then its sitting 10 (2026-09-28, the console and the mock): +45 and four files — `mock/src/scripted.test.ts`
# (17, new), `contract/src/dist.test.ts` (2, new), `api/auth-page.test.ts` (5, new), `console/src/ending-state.test.ts`
# (4, new), `console/src/code-state.test.ts` (5), `console/src/api.test.ts` (1), `api/instances.test.ts` (1),
# `api/logout.test.ts` (1), and the matrix's staging-output row (9).
# Then its sitting 11 (2026-09-28, the guides): +15, no new file — the examples (8), the journey's docs gates (2),
# the document's gates (2), the slug cases (2) and one pinned body-hash vector.
# Then its sitting 11a (2026-09-29, the building agent's models): +31 and one file — `api/incidents.test.ts` (4, new),
# `api/agents.test.ts` (11), `ai/models.test.ts` (4), `config.test.ts` (1), the matrix's confidential-Incidents row (9),
# `mock/src/scripted.test.ts` (1) and the journey's docs gate (1).
EXPECT_TESTS=2923
EXPECT_FILES=184
EXPECT_DOCTOR=20
EXPECT_VERIFY=62

STEPS=""
FAILED=0
MOVED=0
NOT_RUN=0

# record <name> <status> <note>
record() {
  STEPS="${STEPS}${1}|${2}|${3}
"
  [ "$2" = FAIL ] && FAILED=$((FAILED + 1))
  [ "$2" = MOVED ] && MOVED=$((MOVED + 1))
  [ "$2" = "NOT RUN" ] && NOT_RUN=$((NOT_RUN + 1))
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
      "counts moved: expected $expected, got ${got:-none} — update ORIENTATION's two boxes, RUNBOOK and this script together"
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

# ---------------------------------------------------------------- 5. the four headless journeys
# All four drive the published contract through the edge and none uses a browser.
#   demo-journey    — §22's journey on a SESSION (P5a's acceptance)
#   demo-token      — D24's loop on a DELEGATED TOKEN (P5b's acceptance), which is why P5b
#                     came first: the second credential class needs the first one's routes.
#   demo-production — the FIRST PRODUCTION LAUNCH (P6a's acceptance): records, rehearsal,
#                     step-up, approval and a deploy to §12's public listener. It adds NO
#                     test, so the EXPECT_ counts above did not move with it.
#   demo-releases   — a LAUNCHED app's next release (P6b's acceptance): self-serve under a
#                     loop, a re-escalation approved from a stored preview, and the IAM change
#                     request. AFTER demo-production, because it starts from the launch that
#                     leaves (and runs it first on a machine where launch-app has not launched);
#                     LAST, because it leaves `launch-app` on its leg C release in production.
#                     It adds no test either.
#
# ONE SOURCE DRIVER PER CONTROL-PLANE PROCESS (the D5 plan's Decision 3), and these four are
# DRIVER 1's: on driver 2, `launch-app` is refused SOURCE_PROVIDER_MISMATCH by design — and
# worse, a demo whose project does not exist yet would CREATE it on driver 2, where no route
# can delete it and driver 1 would refuse it for ever. `make demo-github` is DRIVER 2's. So the
# control plane is asked which it runs, the way `make demo-github` asks it (an unsigned
# delivery), and the other driver's steps read NOT RUN — which is NOT a pass, and the summary
# says so.
source_driver() {
  local answer
  answer="$(curl -sS -m 5 -X POST -H 'content-type: application/json' -d '{}' \
    "http://127.0.0.1:7100/webhooks/github" 2>/dev/null || true)"
  case "$answer" in
    *'"WEBHOOKS_NOT_CONFIGURED"'*) echo local ;;
    *'"WEBHOOK_SIGNATURE_MISSING"'*) echo github ;;
    *) echo none ;;
  esac
}
DRIVER="$(source_driver)"
bold "=== the control plane's source driver: $DRIVER ==="
if [ "$DRIVER" = github ]; then
  for demo in demo-journey demo-token demo-production demo-releases; do
    record "make $demo" "NOT RUN" "the control plane runs driver 2, and this demo is driver 1's — restart it without MANIFEST_SOURCE_DRIVER"
  done
else
  run "make demo-journey" make demo-journey
  run "make demo-token" make demo-token
  run "make demo-production" make demo-production
  run "make demo-releases" make demo-releases
fi

# ---------------------------------------------------------------- 6. driver 2's acceptance
#   demo-github     — D5's driver 2 end to end against the GitHub fake (the D5 plan's Task 15):
#                     a person's push reaches Manifest by a signed webhook, is built from the
#                     mirror (and again with GitHub gone), a repository made public is made
#                     private again, a pushed secret is found and never quoted, `main` cannot
#                     be rewritten, and the webhook's refusals each have their own code. It adds
#                     no test either.
case "$DRIVER" in
  github) run "make demo-github" make demo-github ;;
  local) record "make demo-github" "NOT RUN" "the control plane runs driver 1 — demo-github needs MANIFEST_SOURCE_DRIVER=github (RUNBOOK)" ;;
  *) record "make demo-github" "NOT RUN" "no control plane answered the driver probe at 127.0.0.1:7100" ;;
esac

# ---------------------------------------------------------------- 7. the authoring API's acceptance
#   demo-authoring  — an AGENT builds a bulletin board from the bare skeleton through the API
#                     alone, and people use it (the authoring API plan's Task 13). It runs on
#                     EITHER driver — step 0 asks which, and picks board-local or board-github —
#                     so it runs on whichever answered above. It adds no test.
case "$DRIVER" in
  local | github) run "make demo-authoring" make demo-authoring ;;
  *) record "make demo-authoring" "NOT RUN" "no control plane answered the driver probe at 127.0.0.1:7100" ;;
esac

# ---------------------------------------------------------------- 8. the front-end enablement plan's acceptance
#   demo-frontend   — what the faculty front-end at https://app.manifest.internal needs, end to end
#                     through the app origin (the front-end enablement plan's Task 15): a person's
#                     session there and a front-end server's delegated token, a model session
#                     charged to the person, an app written as text and bytes, a sandbox
#                     instance's output read back redacted, a collaborator added by CWL login
#                     name, the app switched off and brought back, a scratch project deleted. It
#                     runs on EITHER driver, as demo-authoring does, and adds no test. AFTER
#                     demo-releases on driver 1, so `launch-app` has launched and its step 9 asks
#                     the read-only PROJECT_LAUNCHED_NOT_DELETABLE refusal.
case "$DRIVER" in
  local | github) run "make demo-frontend" make demo-frontend ;;
  *) record "make demo-frontend" "NOT RUN" "no control plane answered the driver probe at 127.0.0.1:7100" ;;
esac

# ---------------------------------------------------------------- the summary
bold "=== summary ==="
printf '%s' "$STEPS" | while IFS='|' read -r name status note; do
  [ -z "$name" ] && continue
  case "$status" in
    PASS) printf '  %s  %-28s %s\n' "$(green PASS)" "$name" "$note" ;;
    MOVED) printf '  %s %-28s %s\n' "$(printf '\033[33m%s\033[0m' MOVED)" "$name" "$note" ;;
    "NOT RUN") printf '  %s %-24s %s\n' "$(printf '\033[33m%s\033[0m' 'NOT RUN')" "$name" "$note" ;;
    *) printf '  %s  %-28s %s\n' "$(red FAIL)" "$name" "$note" ;;
  esac
done

printf '\n  %d failed, %d moved, %d not run\n' "$FAILED" "$MOVED" "$NOT_RUN"
if [ "$NOT_RUN" -gt 0 ]; then
  echo "  NOT RUN IS NOT A PASS: those steps need the control plane on the other source driver."
fi
cat <<'TAIL'

  WHAT THIS DOES NOT COVER, deliberately:
   - the CLICKED half of the acceptance — `make demo-console` prints that checklist, and
     a person runs it, because the Chrome extension will not type a password;
   - `pnpm test:docker` (~13 minutes), owed only by a change to runtime/, routing/,
     services/, build/, releases/, identity/, sso/, secrets/, projects/, blueprints/,
     ai/, observability/, infra/ or a *.docker.test.ts;
   - the OFFLINE acceptance — `scripts/offline-acceptance.sh`, run by hand with the
     network off, whose steps 0-15 include `make demo-identity` and `make demo-ai`;
   - BOTH source drivers in one run — one driver per control-plane process, so a run on
     driver 1 reads `make demo-github` NOT RUN, and a run on driver 2 the other four.
TAIL

[ "$FAILED" -eq 0 ]
