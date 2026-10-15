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
# twenty `=== n.` headings are numbered 0 to 19, where 0 is the precondition and 1-19 are
# the work (this line said "ten, 0 to 9" through P5c's step 10; P6a Task 19 found it; P6b
# Task 11 added step 12, `make demo-releases`; the D5 plan's Task 15 step 13, `make
# demo-github`; the authoring API plan's Task 13 step 14, `make demo-authoring`; the front-end
# enablement plan's Task 15 step 15, `make demo-frontend`; the launch path plan's Task 15 step
# 16, `make demo-launch`; the faculty-ready plan's Task 11 step 17, `make demo-faculty-ready`;
# the U1 plan's Task 7 step 18, `make demo-levels`; A1's Task 10 step 19, `make demo-capacity`).
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
# Then the launch path plan's sitting 5a (2026-09-30, FE-39 — who may build): +26 and one file —
# `identity/builders.test.ts` (4, new), `api/auth.test.ts` (8), `api/projects.test.ts` (5), `api/members.test.ts` (4),
# `api/delegation.test.ts` (2), `api/intake.test.ts` (1), `config.test.ts` (1) and `mock/src/scripted.test.ts` (1).
# Then Mailpit, §21's tenth container (2026-09-30, out of plan at Rich's word): no test moved; `make doctor` +1 (its
# image, at the digest compose pins) and `make verify` +2 (an SMTP round trip through the inbox's API, and compose's
# settings that keep it on the laptop).
# Then the launch path plan's sitting 6 (2026-09-30/10-01, the three clocks' records): +62 and one file, `api/launch.test.ts`
# (its record has the breakdown).
# Then its sitting 7 (2026-10-01, D19's registration package, and its fix wave): +47 and three files —
# `sso/registration-xml.test.ts` (5, new), `launch/usage.test.ts` (5, new), `launch/package.test.ts` (8, new),
# `api/launch.test.ts` (13), the matrix's draft row (9), `launch/readiness.test.ts` (4), `sso/keypair.test.ts` (2) and
# `config.test.ts` (1).
# Then its sitting 8 (2026-10-01, D19's privacy-assessment draft, and its fix wave): +36 and two files —
# `launch/assessment.test.ts` (14, new), `spec/declares.test.ts` (2, new), `api/launch.test.ts` (11) and the matrix's
# assessment-draft row (9).
# Then its sitting 9 (2026-10-01, the sign-off request and the administrators' queue, and its fix wave): +52 and four files —
# `launch/requests.test.ts` (11, new), `api/queue.test.ts` (11, new), `launch/queue.test.ts` (6, new), `api/fleet.test.ts` (1, new),
# `launch/records.test.ts` (5) and the matrix's two rows (18).
# Then its sitting 10 (2026-10-01, the console and the mock, the guides and the published-text pass, and its fix wave): +33 and
# one file — `console/src/launch-records-state.test.ts` (16, new), `mock/src/scripted.test.ts` (11), the guides' gates (2), the
# document's pattern cases (1), the mock's text check (1), `console/src/api.test.ts` (1) and `journey/src/examples.test.ts` (1).
# Then its sitting 12 (2026-10-02, the acceptance, and its fix wave — the plan EXECUTED): +5, no new file — `db/locks.test.ts` (2:
# more holders than the pool, F1; nested holders, the review's I2) and `launch/readiness.test.ts` (3: a lapsed registration sent
# again, F3). Measured twice on the final tree, 3197 in 196, 0 `deadlock detected`.
# The faculty-ready plan's sitting 2 (2026-10-03, the envelope sitting, contract 1.6.0): +35, one new file — `api/refusal.test.ts`
# (15: every refusal path's id and line, the stream's 426 among them), `api/intake.test.ts` and `api/agents.test.ts` (6: a limit's and
# a session's facts), `api/delegation.test.ts` (4: FE-51/FE-50's pins, the words, every guide), `blueprints/blueprints.test.ts` (3) and
# `api/blueprints.test.ts` (1) — FE-31, the hint the review found — `source/driver-contract.ts` (2: F7 on both drivers),
# `source/local-driver.test.ts` (1: a failed create undoes itself), and one each in `contract/src/client.test.ts`,
# `mock/src/server.test.ts` and `mock/src/scripted.test.ts`. Measured on the final tree, 3232 in 197.
# Then its sitting 3 (2026-10-03, FE-28, `__Host-` cookies): +15, one new file — `identity/cookie-names.test.ts` (2, new),
# `api/auth.test.ts` (7: the browser model, the `__Host-` session, login and step-up cookies and their clears, the positive control,
# a plain session on https, the direct port's name, the tossed login cookie), `api/logout.test.ts` (2: a clear on https carries
# Secure), `contract/src/client.test.ts` (2), `contract/src/stream.test.ts` (1) and `mock/src/server.test.ts` (1). Measured twice on
# the final tree, 3247 in 198.
# Then its sitting 4 (2026-10-03, F8, `Init: true`, FE-52 and FE-49): +11, one new file — `api/questions-end.test.ts` (9: a revoke,
# a removal and an archive each ending a waiting question with one event, two positive controls, the cap at the token's expiry, and
# the review's I1 — an ask racing its token's end records nothing, twice, with a positive control), `api/tokens.test.ts` (1: mintedBy)
# and `runtime/docker/hardening.test.ts` (1: Init). Measured twice on the final tree, 3258 in 199.
# Then its sitting 6 (2026-10-03, §26's administrator reason): +19, one new file — `api/admin-reason.test.ts` (13, new: who is asked and
# who is not, the fingerprint, the mint, the limit, the percent-decoding, a quota question, the operator line, the stream's actor, the
# redaction, the owner's positive control and its replay, the three sentences, a token's act), `api/authz-contract.ts` (1: the reason
# declared exactly where a non-member administrator is answered it — `[M5]`'s 24), `api/idempotency.test.ts` (1),
# `releases/retire.test.ts` (1) and `projects/source-events.test.ts` (1: shared work names nobody), `mock/src/scripted.test.ts` (1) and
# `console/src/api.test.ts` (1). Measured twice on the final tree, 3277 in 200.
# Then its sitting 5 (2026-10-03, Tasks 7, 9, 15, 16 and 16b): +8, one new file — `api/questions-end-atomic.test.ts` (5, new: an
# event write that fails undoes a revoke, a removal and an archive, and the retry records it once; a positive control; and
# `member.removed` recorded in the removal's transaction), `api/admin-reason.test.ts` (2: a collaborator-administrator asked beyond
# the role, and the owner-administrator not) and `api/authz-contract.ts` (1: the collaborator-administrator's exact eight).
# Then its sitting 5b (2026-10-03, Task 17, passport-ubcshib 0.1.7-rc.1): +2, no new file — `blueprints/blueprints.test.ts` (2: an
# exact prerelease pin accepted and every range naming one refused (F3), and fixtures/saml-sp held to the blueprint's versions (F1)).
# Measured twice on the final tree, 3287 in 201.
# Then its sitting 7 (2026-10-03, Task 11, the acceptance): +2, no new file — `api/contract/document.test.ts` (2: the published words
# of §26's reason — the Manifest-Admin-Reason header and EventActor.asAdministrator — name the collaborator beyond their role, and
# never call a sent reason ignored; the plan's whole-branch review's I1). Measured twice on the final tree, 3289 in 201 (once inside
# `make ci-acceptance`).
# Then the UBC AI Gateway plan's sitting 2 (2026-10-03, Tasks 2–4): +34, two new files — `ai/providers.test.ts` (6, new: a
# setting resolved — direct passed through, a gateway one by reference with its timeout and retries, the bound, failing closed,
# the bare prefix and no gateway), `ai/gateway-models.test.ts` (12, new: each entry at its classification, the stand-in's price,
# failing closed, a foreign name, an unlisted one removed, the setting empty, D17's hand-out, and five at boot — the order
# among them), `ai/capable.test.ts` (8: the gateway's registration, unchanged, the repoint both ways, the positive control,
# failing closed, an alias, no gateway, and the boot's line) and `config.test.ts` (8: the URL, http off loopback, keyInEnv,
# the value never kept; MANIFEST_GATEWAY_MODELS parsed, empty, the last @, every malformed entry).
# Then the UBC AI Gateway plan's sitting 3 (2026-10-04, the fix pass on LiteLLM 1.102.0): +3, no new file — `ai/errors.test.ts`
# (1: 1.102.0's unknown model, never a provider's 400 quoting it, nor any other 400 — F33) and `ai/capable.test.ts` (2: failing
# closed whatever the setting, and its positive control naming a kept gateway registration — F34).
# Then the U1 plan's sitting 1 (2026-10-04, Tasks 1–3): +32, two new files — Task 1 +12: `spec/levels.test.ts` (6, new: the
# four levels' ranks, every alias at its level, the seven names and no prototype name, a name's level and words, the enum,
# stored as written), `ai/models.test.ts` (1: very-high keeps the builder exception), `api/incidents.test.ts` (1: very-high's
# tails refused a token), `launch/assessment.test.ts` (2: very-high on premises, rule and model), `ai/gateway-models.test.ts`
# (1: the very-high pin) and `api/contract/manifest-yaml.test.ts` (1: the published enum); Task 2 +12: `spec/levels.test.ts`
# (+2: stored as the level, the default medium, specInLevels — replacing Task 1's boundary case), `ai/models.test.ts` (3: the
# floors answer levels), `ai/catalogue.test.ts` (1: a U1 name, toString and a typo), `spec/diff.test.ts` (4: a rename is no
# change, a real change is, a frozen alias, the words) and `api/levels.test.ts` (2, new: getSpec and a release in levels);
# Task 3 +8: `spec/policy.test.ts` (4: the aliases never widen, internal vs high, the undeclared default, E14's hint),
# `launch/assessment.test.ts` (2: Very high, high's zero retention), `api/intake.test.ts` (1: paused in medium's words, and
# started at its alias) and `releases/releases.test.ts` (1: the deploy-time refusal in levels, and its positive control).
# Then the U1 plan's sitting 2 (2026-10-04, Tasks 4–6): +36, one new file — Task 4 +14: `config.test.ts` (4: the capable model's
# level, its default and the seven names, and its refusal; the gateway entries in U1's names, and theirs), `ai/models.test.ts`
# (3: the builder exception at every level above the capable model's), `ai/capable.test.ts` (3: registered at the level given,
# an alias row unchanged at its level, the fallback's floor moving with it) and `ai/gateway-models.test.ts` (4: a lowered level
# refused leaves the catalogue, a lower one kept, a new session never given it, the boot's thread); Task 5 +13:
# `api/incidents.test.ts` (+3: one case inverted, three joined), `api/authz-contract.test.ts` (+9: the high project's row, nine
# actors) and `packages/mock/src/scripted.test.ts` (1: MANIFEST_MOCK_LEVEL); Task 6 +9: `ai/app-key-sweep.test.ts` (9, new).
# Then the U1 plan's sitting 3 (2026-10-04, Task 7 and the whole-branch review's fix wave): +1, no new file —
# `ai/capable.test.ts` (1: a level none of the seven names floors the fallback at very-high, the review's I1).
# Then P0, out of plan (2026-10-08, the coordinated run — the roadmap's *Tracked defects found in use*, its two platform rows): +5,
# one new file — `blueprints/proof-app-boot.test.ts` (3, new: the proof-app starter boots with COURSE_CODE and /api/me answers it,
# and refuses to boot without it or with it empty) and `blueprints/blueprints.test.ts` (2: AGENTS.md's two sentences, the second
# with the starter's page telling a 401 from any other failure). Measured 3400/207, 0 failed, 988 s.
# Then the FE-46/47/5 plan's sitting 2 (2026-10-08, the coordinated run's P2 — Tasks 2, 2b, 3): +37, five new files — Task 2 +16:
# `tokens/pending.test.ts` (5: the column held to the event's schema, the event's four fields and its sentence, a null object, the
# answers' sentences, the words), `api/contract/pending-object.test.ts` (2, new: exactly the three routes, each declaring one),
# `api/delegation.test.ts` (6: a member named, who has signed in never told, a removal, a deploy and another project's release, the
# retry pin) and `packages/console/src/question-words.test.ts` (3, new); Task 2b +4: `api/sensitive-since-approved.test.ts` (4,
# new); Task 3 +17: `mail/team.test.ts` (5, new), `mail/mailer.test.ts` (4, new), `config.test.ts` (7: the mail settings) and
# `launch/requests.test.ts` (1: the team told once, after the event). Measured 3437/212, 0 failed, 1052 s.
# Then the FE-46/47/5 plan's sitting 3 (2026-10-08, the coordinated run's P3 — Tasks 4, 5, 8a): +69, no new file — Task 4 +6:
# `launch/assessment.test.ts` (6: the gaps' stable ids); Task 5 +59: `launch/assessment.test.ts` (3: checkGapAnswers),
# `launch/records.test.ts` (+12: the sends, the team's submission and hand-back, the ways around it, the CHECKs, the email),
# `launch/transitions.test.ts` (+3: no arrow into or out of `sent`, where a send may go and a hand-back return, the recorded
# states; SUBMIT_ARROWS' two retired), `api/launch.test.ts` (+2 net: the sends and the team's step through the routes, two M4
# describes retired), `packages/console/src/launch-records-state.test.ts` (3: a `sent` record's actions) and
# `api/authz-contract.test.ts` (+36: four net new routes — two sends, two returns; the submissions changed hands — nine actors
# each); Task 8a +4: `packages/console/src/launch-records-state.test.ts` (3: answersReady, teamActions, holderLine) and
# `packages/mock/src/scripted.test.ts` (1: the with-team stage). Measured 3506/212, 0 failed, twice.
# Then the FE-46/47/5 plan's sitting 4 (2026-10-08, the coordinated run's P4 — Tasks 6, 7, 8b): +24, no new file — Task 6 +7:
# `launch/readiness.test.ts` (4: since follows the holder for the assessment and a registration, the lapsed live registration
# through `sent`, a sent request's drift) and `launch/queue.test.ts` (3: the team's kinds, through the team's step, a hand-back and an
# archived project); Task 7 +13: `launch/records.test.ts` (4: a change sent, LAUNCH_CHANGE_EMPTY with its ACS control, the team's
# filing, a hand-back), `launch/readiness.test.ts` (2: a change with the team, an uncovered release waiting since the send),
# `launch/queue.test.ts` (1: iam-change-to-file), `spec/policy.test.ts` (1: FE-55's rule), `spec/registered-attributes.test.ts` (1: the
# change's words), `releases/build-attributes.test.ts` (1: the build still refused while the change is with the team),
# `api/launch.test.ts` (2: the change through the routes; FE-55's two halves) and `packages/mock/src/scripted.test.ts` (1: a change
# drafted and sent); Task 8b +4: `packages/console/src/launch-records-state.test.ts` (3: Ask for a change, the change's send, the
# team's words) and `packages/mock/src/scripted.test.ts` (1: the change-with-team stage). Measured 3530/212, 0 failed, twice.
# EXPECT_TESTS 3530 -> 3533 (2026-10-08, the FE-46/47/5 plan's sitting 5 — the whole-branch review's fix wave, `154f220`), no new
# file: `api/launch.test.ts` (2: a production change UBC sent back with questions drafted again as the change it is — I1; an
# assessment sent while an administrator's record of it waits is not overwritten — m5) and `launch/readiness.test.ts` (1: before a
# first launch, a change to a registration in force says where it is — sitting 4's F16). Measured 3533/212, 0 failed, twice (inside
# `make ci-acceptance`, 969 s, and alone, 988 s).
# EXPECT_TESTS 3533 -> 3534 (2026-10-13, `manifest-p9`, out of plan — every node-ts-mongo build refused on proxy-addr, `5869070`), no
# new file: `blueprints/blueprints.test.ts` (1: no shipped lockfile resolves a package below the fix of an advisory that refused its
# builds). Run twice on `5869070`, 3534 tests in 212 files each time: 1052 s with ONE red, `observability/bus.test.ts` (the database clock
# stepped back mid-test — the roadmap's *Tracked defects found in use*; 6 of 6 green alone), then 1053 s, 3534 passed, 0 failed.
# EXPECT_TESTS 3534 -> 3560 and EXPECT_FILES 212 -> 214 (2026-10-13, A1's sitting 2, `manifest-a1-s2`), two new files:
# `db/routes.test.ts` (5: a hostname's two rows, the (hostname, instance) key by name, `replaceRouteSet`'s set and its empty-set refusal,
# the launch suites' staged release twice) and `packages/mock/src/launch.test.ts` (5: the mock's item across every in-force state —
# F16(b)); and `routing/caddy.test.ts` (7: [M2]'s JSON across N, never 503, no policy, a set of one, the alias and empty refusals, the
# health path), `routing/routes.test.ts` (3: a set's route read whole, the instances it names, the retire guard's second upstream),
# `routing/readiness.test.ts` (4: `waitForIdentities` — every member, one unseen within 4 x N, the timeout naming each, an empty set),
# `launch/readiness.test.ts` (+1: F16(b)'s case rewritten, and a release asking for what a change asks still waiting) and
# `packages/mock/src/scripted.test.ts` (1: the change-before-launch stage). Measured 3560/214, 0 failed, twice on `0c7a2a3` (1019 s,
# 970 s).
# EXPECT_TESTS 3560 -> 3577 and EXPECT_FILES 214 -> 215 (2026-10-13, A1's sitting 3, `manifest-a1-s3`): Task 4's driver
# contract restated for sets — `runtime/fake-driver.test.ts` 31 -> 38 (the set cases, and the fake's one-route-change case),
# `routing/routes.test.ts` 22 -> 26 (`withdrawUpstream`), `runtime/docker/containers.test.ts` 7 -> 9 (the health path a set is
# restored with) — and Task 8a's new `blueprints/saml-request-cache.test.ts` (4). Measured 3577/215, 0 failed, twice on `0ba9af8`
# (19:12-19:29, and 19:50-20:06 — a run between them timed out 17 tests in two untouched files under load, 15-min average 7.3,
# and is not counted; the two files alone 123/123).
# EXPECT_TESTS 3577 -> 3593 and EXPECT_FILES 215 -> 216 (2026-10-13, A1's sitting 4, `manifest-a1-s4`): Task 5's deploy across N —
# the new `releases/shape.test.ts` (6: `shapeFor`'s table, and DeployInput's missing fields as a type test),
# `releases/releases.test.ts` +7 (a class production of TWO, the answer the set's first, THREE and ONE, staging ONE, a redeploy of
# two, one of three never ready, one of two failing after the move), `releases/recover.test.ts` +2 (a set restored in one route; a
# gone member left out) and `releases/retire.test.ts` +1 (a serving SET never targeted). Measured 3593/216, 0 failed, twice on
# `81d469c` (21:30-21:46, and run B).
# EXPECT_TESTS 3593 -> 3620 and EXPECT_FILES 216 -> 217 (2026-10-13, A1's sitting 5, `manifest-a1-s5`): Task 6's set watcher — the
# new `releases/watch.test.ts` (18: the backoff's table; an exit recorded once and the set replaced; gone; unhealthy for four passes;
# a failed replacement and the stop after three; the cap and a restarted process; a person's deploy resetting it; three in ANY
# hour; nothing to replace; the gate; staging, an archived project, the lock held, a member asleep; another driver's member; rows a
# thrown deploy left; a solo set; the database's clock), `releases/releases.test.ts` +4 (a replacement's gate, its rows and no
# launch, production's IdP, `replacing` paired), `launch/records.test.ts` +1 (FE-59's two origins), `observability/bus.test.ts` +1
# (the replay by `seq`), `config.test.ts` +1, `db/locks.test.ts` +1 (`tryWithEnvironmentLock`), `api/incidents.test.ts` +1
# (`Incident.cause`). Measured 3620/217, 0 failed, twice on `cef3421` (23:15:59-23:32:37, and 23:32:46-23:49:18), 7100 stopped.
# EXPECT_TESTS 3620 -> 3638 and EXPECT_FILES 217 -> 219 (2026-10-14, A1's sitting 6, `manifest-a1-s6`): two new files —
# `blueprints/error-page.test.ts` (5: the skeleton's error handler and NODE_ENV=production) and
# `console/src/instances-state.test.ts` (5: the console's words for a set) — and `api/projects.test.ts` +1 (the projects list while
# a project is being made, FE-58), `releases/watch.test.ts` +1 (an unlaunched project's production is not watched),
# `api/delivery.test.ts` +1 (D21's rehearsal on a `class` app is one instance), `launch/readiness.test.ts` +1 (the candidate off a
# set whose first member stopped), `projects/fleet.test.ts` +1 and `api/fleet.test.ts` +1 (the fleet's `instances`),
# `blueprints/blueprints.test.ts` +1 (the knowledge pack's several-copies rule), `packages/mock/src/scripted.test.ts` +1 (a launched
# app's production set of two). Measured 3638/219, 0 failed, on `1d40042` (00:48:57-01:05:47), 7100 stopped.
# EXPECT_TESTS 3638 -> 3652 and EXPECT_FILES 219 -> 220 (2026-10-14, A1's sitting 7, `manifest-a1-s7`): one new file —
# `packages/journey/src/capacity-checks.test.ts` (14: `make demo-capacity`'s reading of its loops and of the set watcher's events —
# requests overlapping a window and in flight at a moment, the answers that were not the app, the sets the answers came from, the
# replacement waves, and the crash loop's backoff and cap: at once, a minute, four minutes, then stopped). Measured 3652/220, 0 failed,
# twice on the final tree (04:37:29-04:53:59 and 04:53:59-05:10:38), 7100 running on driver 1 beside it.
# EXPECT_TESTS 3652 -> 3654 (2026-10-14, A1's sitting 8, `manifest-a1-s8` — the plan's one whole-branch review's fix wave), no new
# file: `releases/watch.test.ts` +1 (a replacement that throws before it starts anything is not a refusal — the next pass replaces the
# member) and `routing/readiness.test.ts` +1 (a member first seen after more than 4 × N other answers is still reached — the identity
# window is 16 × N); `routing/caddy.test.ts`'s status-list pin was REWRITTEN, not added (the passive policy counts no status).
# EXPECT_TESTS 3654 -> 3673 and EXPECT_FILES 220 -> 222 (2026-10-14, the gentler test tiers plan's sitting 1, `manifest-gt-s1`):
# Task 2's new `test-timeouts.test.ts` (7: the scale's parsing and arithmetic, and the scanner that every explicit limit goes
# through `scaled()`) and Task 3's new `test-gently.test.ts` (12: the wrapper's priority, scale, gate, summary, status and leftovers).
# Measured 3673/222, 0 failed, twice on the final tree through `scripts/test-gently.sh` — utility priority, timeout scale 3
# (18:32:55-18:50:50, 1072.6 s, and 18:51:24-19:09:22, 1074.7 s), 7100 running beside them.
# EXPECT_TESTS 3673 -> 3680 and EXPECT_FILES 222 -> 223 (2026-10-14, the gentler test tiers plan's sitting 2, `manifest-gt-s2`):
# Task 4's new `db/truncate.test.ts` (6: the TRUNCATE retried on 40P01 and 55P03 under a lock budget, and resetDatabase's own budget)
# and the whole-branch review's fix wave's one case in `test-gently.test.ts` (a SIGKILLed wrapper's sampler ends itself).
# Measured 3680/223, 0 failed, by Task 6's background run under six burners (21:34:52, 2511 s, on `07c4601`'s tree) — and on the
# final tree by this sitting's `make ci-acceptance` and its closing `pnpm test` (its record has both).
# EXPECT_TESTS 3680 -> 3691 and EXPECT_FILES 223 -> 224 (2026-10-15, the out-of-plan FIX session, `manifest-fix2`): one new file —
# `packages/journey/src/launch-trace.test.ts` (10: the launch demos' re-use check — approved, or a self-serve release since an approval;
# getApproval read by status AND code; launchTrace's reads throwing rather than reading "nothing approved") — and
# `api/source-commit.test.ts` +1 (a commit's sensitive diff with the push webhook's row recorded FIRST); P5a sitting 6's
# `api/projects.test.ts` case was rewritten across two commits, not added. Measured 3691/224 on the final tree — the roadmap's FIX record.
EXPECT_TESTS=3691
EXPECT_FILES=224
# EXPECT_DOCTOR 21 -> 22 (2026-10-03, the UBC AI Gateway plan's sitting 2, Task 2): the gateway key's expiry, a
# check_warn — counted, never failing — from 14 days ahead (its Decision 11). Measured: 22 checks, 0 failed, 0 warnings.
EXPECT_DOCTOR=22
# EXPECT_VERIFY 64 -> 66 (2026-10-03, the faculty-ready plan's sitting 5, Task 9): the IdP's session store is
# ssp_store's own and cannot read the SP metadata; ssp_ro cannot read the session store.
# EXPECT_VERIFY 66 -> 67 (2026-10-03, the UBC AI Gateway plan's sitting 2, Task 2): LiteLLM holds the gateway key
# .env holds, by fingerprint, a verdict only (its Decision 4). Measured: 67 checks, 0 failed, 0 warnings — `matches`.
EXPECT_VERIFY=67

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
LOAD_REPORT="$(mktemp -t manifest-load)"
trap 'rm -f "$LOG" "$LOAD_REPORT"' EXIT

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
# `pnpm test` is scripts/test-gently.sh: utility priority, the timeout scale, the load gate. Its one
# line — the load over the run, or why it refused to start — goes on this step's line in the summary,
# PASS or FAIL, so a red says what the machine was doing (the gentler test tiers plan, Task 5).
: > "$LOAD_REPORT"
MANIFEST_TEST_LOAD_REPORT="$LOAD_REPORT" pnpm test 2>&1 | tee "$LOG"
TEST_RC="${PIPESTATUS[0]}"
LOAD_NOTE="$(cat "$LOAD_REPORT")"
LOAD_NOTE="${LOAD_NOTE:-no load line — did pnpm test run through scripts/test-gently.sh?}"
GOT_TESTS="$(grep -E '^ +Tests +[0-9]+ passed' "$LOG" | awk '{print $2}' | tail -1)"
GOT_FILES="$(grep -E '^ +Test Files +[0-9]+ passed' "$LOG" | awk '{print $3}' | tail -1)"
if [ "$TEST_RC" -ne 0 ]; then
  record "pnpm test" FAIL "exit $TEST_RC — $LOAD_NOTE"
elif [ "$GOT_TESTS" = "$EXPECT_TESTS" ] && [ "$GOT_FILES" = "$EXPECT_FILES" ]; then
  record "pnpm test" PASS "$GOT_TESTS tests in $GOT_FILES files — $LOAD_NOTE"
else
  record "pnpm test" MOVED \
    "counts moved: expected $EXPECT_TESTS in $EXPECT_FILES files, got ${GOT_TESTS:-none} in ${GOT_FILES:-none} — update ORIENTATION §2 and this script together — $LOAD_NOTE"
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

# ---------------------------------------------------------------- 9. the launch path plan's acceptance
#   demo-launch     — a faculty member takes an app to production themselves (the launch path
#                     plan's Task 15): the privacy assessment and both registrations drafted from
#                     the app's own code and certificates, read and sent in UBC's order; an agent
#                     on a token drafting and asking for sign-off, refused saying anything was
#                     sent; the administrators' queue; the launch; then a revoked token's stream
#                     4401, a removed colleague's 4404, a failed attempt newer than the instance
#                     serving, and an open agent session narrowed by raising the app to
#                     confidential. It runs on EITHER driver, as demo-frontend does, on its own
#                     project (launchpath-local or launchpath-github), and adds no test.
case "$DRIVER" in
  local | github) run "make demo-launch" make demo-launch ;;
  *) record "make demo-launch" "NOT RUN" "no control plane answered the driver probe at 127.0.0.1:7100" ;;
esac

# ---------------------------------------------------------------- 10. the faculty-ready plan's acceptance
#   demo-faculty-ready — what stood between the platform and a faculty member's first day (the
#                     faculty-ready plan's Task 11): __Host- session cookies on console. and app., a
#                     tossed plain cookie ignored; a refusal's reference as a header, in the body and
#                     in one operator line; the test blueprint not offered; a model session's replayed
#                     start naming the session; PID 1 an init; an administrator's reason, as no member
#                     and as a collaborator beyond the role; an agent's question ending with its token;
#                     a removal recorded once; an app's single logout answered Success. EITHER driver,
#                     on its own project (facultyready-local or facultyready-github); it adds no test.
case "$DRIVER" in
  local | github) run "make demo-faculty-ready" make demo-faculty-ready ;;
  *) record "make demo-faculty-ready" "NOT RUN" "no control plane answered the driver probe at 127.0.0.1:7100" ;;
esac

# ---------------------------------------------------------------- 11. the U1 plan's acceptance
#   demo-levels     — Manifest's data classes as UBC's U1 levels (the U1 plan's Task 7): D17's refusal
#                     hint naming U1 and no law; an earlier name never widening (confidential is
#                     very-high); a level stored and answered by its U1 name, a rename not a sensitive
#                     change; the agents' models by rank at high and by the builder exception above
#                     it; a token refused a high project's staging Incidents; the privacy assessment's
#                     level and model lines. EITHER driver, on its own projects (levels-local and
#                     levels-vh-local, or the -github pair); it adds no test.
case "$DRIVER" in
  local | github) run "make demo-levels" make demo-levels ;;
  *) record "make demo-levels" "NOT RUN" "no control plane answered the driver probe at 127.0.0.1:7100" ;;
esac

# ---------------------------------------------------------------- 12. A1's acceptance
#   demo-capacity   — a launched `class` app's production on TWO instances behind one edge route (A1's
#                     Task 9): both members answering, a same- and a new-release redeploy under two loops
#                     with no answer but the app's and the set changing once, a release that never becomes
#                     ready changing nothing, a member killed and replaced, and a crash loop stopped at its
#                     cap (~7 of its ~12 minutes). EITHER driver: `launch-app` on driver 1, which
#                     demo-production and demo-releases above have launched, `launchpath-github` on driver
#                     2, which demo-launch above has. LAST, because it is the longest and changes no other
#                     demo's project; it leaves its app serving its own last release on a new pair. It adds
#                     no test (its reading of the loops is `capacity-checks.test.ts`, counted above).
case "$DRIVER" in
  local | github) run "make demo-capacity" make demo-capacity ;;
  *) record "make demo-capacity" "NOT RUN" "no control plane answered the driver probe at 127.0.0.1:7100" ;;
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
     network off, whose steps 0-19 include `make demo-identity` and `make demo-ai`;
   - BOTH source drivers in one run — one driver per control-plane process, so a run on
     driver 1 reads `make demo-github` NOT RUN, and a run on driver 2 the other four.
TAIL

[ "$FAILED" -eq 0 ]
