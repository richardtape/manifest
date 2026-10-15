# The gentler test tiers — the baseline measurements (Task 1)

*Measured 2026-10-14, 14:19–18:15 PDT, by `manifest-gt-s1` (the second coordinated run's job GT1, coordinated by
`manifest-coord4`, every other session's Vitest and Docker held), on the code of `7627517` — unchanged through the runs (`HEAD`
moved by documents only). The plan: [`../../plans/2026-10-14-gentler-test-tiers.md`](../../plans/2026-10-14-gentler-test-tiers.md),
Task 1. These are the "before" of every comparison its Task 6 makes.*

**What is here:** `burn.sh` (a command beside N `yes` burners, the 1-minute load sampled every 30 s) and `durations.mjs` (a Vitest
JSON report's wall time, reds, slowest tests and slow list; given a second report, the ratios). The JSON reports stayed in the
session's scratchpad, which does not outlive it; their numbers are below.

## The machine and the versions

| | |
|---|---|
| macOS | 26.7.1 (25G241), arm64 — 6 performance + 6 efficiency cores (`hw.ncpu` 12), 36 GiB |
| Node | v24.12.0 |
| Vitest | 2.1.9 — one file at a time, in one worker (`fileParallelism: false`) |
| pg (node-postgres) | 8.23.0 |
| Docker Desktop | 4.87.0, Engine 29.7.2 — `NCPU 12`, `MemTotal 8319238144` (7.75 GiB); `settings-store.json` has no `Cpus` key |
| Postgres (`manifest-postgres`, `manifest_control`) | `deadlock_timeout` **1s**, `lock_timeout` **0** (none) |
| Beside the runs | 7100 (the control plane, PID 49461) running — its tables truncated by each run; the coordinator's `HOLD` |

## The priorities (`ps -o pri=`, read in a grandchild)

| QoS | Run under | `pri` |
|---|---|---|
| normal | — | **31** |
| utility | `taskpolicy -c utility` | **20** |
| background | `taskpolicy -b` | **4** |

## The four runs (`--project unit --project packages`, 3654 tests in 220 files)

| Run | Started | 1-min load at start · min / median / max | Power | Wall (Vitest) | ÷ normal | Result |
|---|---|---|---|---|---|---|
| **normal**, quiet | 14:19:47 | 2.86 · 2.86 / 4.86 / 10.42 (38 samples) | battery 56 % → AC | **1119.6 s** | 1.00 | **green**, 3654/3654 |
| **utility**, quiet | 14:39:30 | 5.11 · 3.77 / 4.81 / 6.25 (39) | AC | **1166.8 s** | **1.04** | **green**, 3654/3654 |
| **background**, quiet | 14:59:00 | 4.17 · 2.84 / 5.16 / 7.38 (119) | AC, then battery | **3541.7 s** | **3.16** | **red**: 192 failed in 37 files — 186 `Test timed out in 5000ms` |
| **normal, twelve burners** | 17:32:00 | 60.02 · 52.94 / 128.17 / 332.82 (87) | AC | **2588.1 s** | 2.31 | **red**: 78 failed in 17 files — 76 `Test timed out in 5000ms` |

**No run read `deadlock detected`.** The non-timeout reds: in the background run, 3 follow-on `SLUG_TAKEN` (a timed-out test's leftover
row: `repository-link`, `webhooks`, `source-repositories`), 1 FE-36 `INTERNAL` (`api/agents.test.ts`) and 2 **in-test wall-clock
limits** — `lifecycle.test.ts:198`'s `controlPlaneWork < 400` read **531.9 ms**, and a `source/github/driver.test.ts` lag case; under
the burners, 1 follow-on `SLUG_TAKEN` (`repository-link`) and 1 `source/github/driver.test.ts` lag case.

**Per test** (tests that passed in both runs and took ≥ 500 ms at normal): utility median **1.05**, p90 1.15, p99 1.30, max 1.94 (n 737);
background median **3.18**, p90 3.94, p99 **5.58**, max 9.92 (n 545); twelve burners median 2.05, p90 2.71, p99 5.80, max 12.87 (n 660).
Background's CPU-bound phases are slower still: collect ×5.4, transform ×5.0, prepare ×5.1. **The tests that timed out** took, at
normal, a median of ~1.8 s and at most 4.1 s.

**The laptop slept from before 17:23:51 to then** (Rich closed it; `manifest-coord4`); the burner run waited for the 1-minute load to
settle below 6 (5.07 at 17:30:00) before its burners started.

## The scales (the plan's Decision 3: `s` = wall ÷ normal's; scale = max(2, ⌈2 × s⌉))

| QoS | `s` | 2 × `s` | **Scale** | Test / hook limit |
|---|---|---|---|---|
| utility | 1166.8 ÷ 1119.6 = **1.04** | 2.08 | **3** | 15 s / 30 s |
| background | 3541.7 ÷ 1119.6 = **3.16** | 6.33 | **7** | 35 s / 70 s |

**Background's `s` is a lower bound** — 186 of its tests were cut off at 5 s — taken as the rule says because the per-test median
agrees with it (3.18) and its factor 2 covers the measured p99 (5.58 < 6.33). Task 6's background run under six burners is the test of
it.

**Every test slower than 2 500 × scale ms** (Step 9): utility (7.5 s) — only `api/contract/document.test.ts`'s *is exactly what the route
definitions generate*, **28.7 s**; background (17.5 s) — that test again, **98.0 s**, and `api/authz-contract.test.ts`'s *declares
PROJECT_ARCHIVED…*, **19.9 s**. Neither is one of the plan's 58 explicit sites:

- **`document.test.ts` cannot time out.** Its time is synchronous — `generated.split('\n')` re-run inside `findIndex` for every line,
  O(n²), even when the two documents match — so no timer fires before it returns. 28 s of every quiet run; a finding, not this plan's.
- **`authz-contract.test.ts`'s cases have explicit limits the plan's count missed**: `api/authz-contract.ts` — a suite kept in a
  module, not a `*.test.ts` — passes `}, 60_000)` at `:3019`, `:3070` and `:3170`. Run only by the unit tier, so Task 2 scales them too
  (61 sites in 14 files). `runtime/driver-contract.ts`'s 23 (120–900 s) are left: the Docker tier runs that suite too.

## The quiet slow list — every test over 5 000 ms in the normal run

The baseline the plan's Decision 4 review compares against (`slowTestThreshold: 5000` lists exactly these):

| ms | Test |
|---|---|
| 28 020 | `api/contract/document.test.ts` › the OpenAPI document (§16 Contract, D23.8) › is exactly what the route definitions generate |
| 7 173 | `api/agents.test.ts` › FE-36 … narrowed in place … › a session whose key is being minted when the raise is recorded is narrowed by it before the commit answers |
| 7 124 | `api/agents.test.ts` › FE-36 … narrowed in place … › a raise recorded while a session waits to start is the one its key is given |
| 5 662 | `api/authz-contract.test.ts` › authorization contract (fake driver) › declares PROJECT_ARCHIVED on exactly the operations that answer it once the project is archived |

The utility run's list is the same four (28 738, 7 191, 7 109, 5 552 ms).

## Under twelve burners — the 78 reds by name

*Today's tree, normal priority, twelve `yes` at normal priority. Every one `Test timed out in 5000ms` but two — `api/repository-link`'s *driver 2, a team organisation* (`SLUG_TAKEN`, a
timed-out test's leftover row) and `source/github/driver`'s *a seed push GitHub REFUSES …* (`expected [] to have a length of 1`). By file: `api/source-commit` 16, `api/delegation` 13,
`source/github/driver` 10, `api/launch` 9, `api/subsequent-releases` 6, `api/members` 6, `api/tokens` 5, `api/webhooks` 2,
`api/sensitive-since-approved` 2, `api/repository-link` 2, and one each in `github-fake/webhooks`, `sso/keypair`, `source/local-driver`,
`api/stream-contract`, `api/rate-limit-token`, `api/lifecycle`, `api/delivery`.*

- `github-fake/webhooks.test.ts > the fake delivers a signed push after every push it accepts names the commits a push added, and says when it was FORCED`
- `api/delegation.test.ts > the queue (§26) hides a pending action from a stranger`
- `api/delegation.test.ts > the queue (§26) never carries the refused request’s body — only the person it named, as its object`
- `api/delegation.test.ts > removing a member (§13, and Task 6’s claim) lets an owner remove a collaborator`
- `api/delegation.test.ts > removing a member (§13, and Task 6’s claim) is idempotent: removing somebody who is not a member answers the same way`
- `api/delegation.test.ts > removing a member (§13, and Task 6’s claim) refuses the LAST owner’s removal, so a project cannot be orphaned`
- `api/delegation.test.ts > removing a member (§13, and Task 6’s claim) lets an owner go once somebody else owns the project`
- `api/delegation.test.ts > removing a member (§13, and Task 6’s claim) is refused to a token with a PendingAction, WITHOUT the route doing anything`
- `api/delegation.test.ts > removing a member (§13, and Task 6’s claim) lets the confirmed retry of a REMOVAL through, exactly once`
- `api/delegation.test.ts > §20’s step-up meets D24’s loop refuses a CONFIRM from a session that has not re-proved itself`
- `api/delegation.test.ts > §20’s step-up meets D24’s loop lets the SAME person confirm once they have stepped up — the positive control`
- `api/delegation.test.ts > §20’s step-up meets D24’s loop lets an ORDINARY session reject — the safe direction stays free`
- `api/delegation.test.ts > a confirmed retry still adds only a person who may build (FE-39) naming a student is refused MEMBER_MAY_NOT_BUILD after the confirmation, and adds nobody`
- `api/delegation.test.ts > a confirmed retry still adds only a person who may build (FE-39) naming a faculty member is added, by the same loop`
- `api/delivery.test.ts > a build uses the validation of the commit it builds (Task 7) builds a commit with THAT commit’s manifest, not the newest one (Read this first 4)`
- `api/launch.test.ts > D19’s registration package (Task 10) a package’s certificate is the one the environment registers with`
- `api/launch.test.ts > D19’s registration package (Task 10) a sent package is never regenerated — LAUNCH_RECORD_SUBMITTED — nor one UBC holds, and one UBC asked the owner to change is`
- `api/launch.test.ts > D19’s registration package (Task 10) no answer carries a private key`
- `api/launch.test.ts > D19’s registration package (Task 10) production is drawn from the launch candidate, and says so when there is none`
- `api/launch.test.ts > D19’s registration package (Task 10) an agent on its person’s token may draft — launch:draft is mintable — a collaborator may, and a stranger is answered 404`
- `api/launch.test.ts > D19’s registration package (Task 10) a re-draft waits for a submission holding the record, and then refuses it — LAUNCH_RECORD_SUBMITTED`
- `api/launch.test.ts > what is sent is the draft the person read (Task 10’s whole-branch review, I2 and I3) a registration drafted before the assessment was approved is not sent — LAUNCH_DRAFT_STALE — until it is drafted again`
- `api/launch.test.ts > a change to a live registration, through the Manifest team (FE-46/47/5 plan Task 7; FE-47) drafted from the newest valid manifest, sent, filed by the team, answered by UBC — the live release met throughout; nothing new is LAUNCH_CHANGE_EMPTY`
- `api/launch.test.ts > a change to a live registration, through the Manifest team (FE-46/47/5 plan Task 7; FE-47) UBC asks the owner about a filed change: drafted again from the newest valid manifest and sent asking for it — nothing dropped; the team re-submits it`
- `api/lifecycle.test.ts > delete (§11, Task 12) refuses a project whose repository another source driver made, before it takes anything down`
- `api/members.test.ts > people by CWL login name or email (Task 7) adds a person by their CWL login name, whatever its case`
- `api/members.test.ts > people by CWL login name or email (Task 7) adds a person by their email, whatever its case`
- `api/members.test.ts > people by CWL login name or email (Task 7) still adds a person by their PUID`
- `api/members.test.ts > people by CWL login name or email (Task 7) refuses two keys, or none, as a malformed request`
- `api/members.test.ts > people by CWL login name or email (Task 7) answers MEMBER_USER_AMBIGUOUS when two people share the address, naming neither`
- `api/members.test.ts > people by CWL login name or email (Task 7) answers MEMBER_USER_NOT_FOUND naming only what was looked for`
- `api/rate-limit-token.test.ts > per-token rate limits (§20) refuses past the token’s own limit, and says when to retry`
- `api/repository-link.test.ts > Project.repository — where the code lives, and whether main is protected (Task 12) driver 1: a repository on this machine — no address, main protected by git`
- `api/repository-link.test.ts > Project.repository — where the code lives, and whether main is protected (Task 12) driver 2, a team organisation: GitHub’s name and address, main protected — and no event says otherwise`
- `api/sensitive-since-approved.test.ts > a commit’s sensitive change since the last approved release (FE-54) an addition and its removal cancel against the approved release, where the newest valid manifest still sees a change`
- `api/sensitive-since-approved.test.ts > a commit’s sensitive change since the last approved release (FE-54) is the gate’s own answer: equal to what the release built from the commit is held to`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) commits writes and a deletion, records the validation, and publishes who made it — by name, never a PUID`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) refuses a stale base, SOURCE_CONFLICT, and main does not move`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) refuses a commit that would leave manifest.yaml invalid — 422 SPEC_INVALID with details — and a dry run answers the same`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) refuses a deleted or emptied manifest.yaml with one problem at the root — the envelope the mock plays`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) carries a validation’s WARNINGS — on the dry run, on the commit, and on validateSpec — and a warning never makes a commit invalid (Spec action 4)`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) a dry run answers what would change, writes nothing, records nothing and announces nothing`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) refuses a secret, names where and which rule, and publishes the finding — never the value`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) refuses a secret in the commit MESSAGE too — the value in neither history nor the record`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) refuses a message with a NUL, a lone surrogate or an escape, before anything is scanned (F8)`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) a retried commit — the same Idempotency-Key — is one commit and one event`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) a commit that LANDED is answered 201 and recorded even when its validation after the push fails — and the same key replays it (the final review’s Important 1)`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) refuses a path into .git, a path that escapes, and text that is not text — before anything is read`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) refuses what the planner refuses, each by its own code`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) takes a file of exactly 1 MiB and refuses one byte more; takes a 7 MiB body and refuses a 9 MiB one`
- `api/source-commit.test.ts > createCommit — changes checked before anything is written (Task 6) a token holding source:write commits, and the record names the agent and the person — a person’s own push is null`
- `api/source-commit.test.ts > createCommit — binary files, as base64 (the front-end enablement plan’s Task 4) commits a PNG as bytes, and reads back exactly those bytes`
- `api/stream-contract.test.ts > the stream in the contract (D23.2) every published and every replayed frame is a StreamFrame`
- `api/subsequent-releases.test.ts > a launched CWL app’s live registration (§9, D9.2, P6b Task 7) while the change request is change_requested or submitted, the build still fails — UBC has not registered it`
- `api/subsequent-releases.test.ts > a launched CWL app’s live registration (§9, D9.2, P6b Task 7) refuses [M9]’s request — the requested set typed in as registered — and the build still fails`
- `api/subsequent-releases.test.ts > a launched CWL app’s live registration (§9, D9.2, P6b Task 7) once it is active with the attribute, the build passes, and the release RE-ESCALATES (auth.attributes)`
- `api/subsequent-releases.test.ts > a launched CWL app’s live registration (§9, D9.2, P6b Task 7) a release built BEFORE the registration shrank is refused by the live check, naming what is missing`
- `api/subsequent-releases.test.ts > a launched CWL app’s live registration (§9, D9.2, P6b Task 7) a REMOVAL re-escalates but does not wait on IAM, and says UBC still releases what the app stopped asking for`
- `api/subsequent-releases.test.ts > a launched CWL app’s live registration (§9, D9.2, P6b Task 7) an auth.callback change — a new ACS UBC never registered — is refused until the registration says so`
- `api/tokens.test.ts > minting a delegated token (D24, Task 4) returns the plaintext exactly once, and never again`
- `api/tokens.test.ts > minting a delegated token (D24, Task 4) names the person who minted it, never their PUID (the authoring API plan’s Task 12)`
- `api/tokens.test.ts > minting a delegated token (D24, Task 4) says who minted it — mintedBy is the minter’s getMe id, on the mint and in the list, and names somebody else’s`
- `api/tokens.test.ts > minting a delegated token (D24, Task 4) says whether a token has EXPIRED, and a revocation is not an expiry`
- `api/tokens.test.ts > minting a delegated token (D24, Task 4) refuses to mint a token holding a privileged capability`
- `api/webhooks.test.ts > POST /webhooks/github — verified, recorded once, and synced off the request accepts a signed push, queues ONE sync, and the new commit is validated — the positive control`
- `api/webhooks.test.ts > POST /webhooks/github — verified, recorded once, and synced off the request a rewritten main is refused by the mirror and reported ONCE, the commit a build used still builds, and the next push is a push`
- `source/local-driver.test.ts > driver 1 refuses a secret in a PERSON’s push, by the repository’s own hook (Task 11) prepare() gives every repository of ITS OWN the current hook, and leaves a driver-2 mirror’s refusing hook alone`
- `sso/keypair.test.ts > per-app SP keypairs (§9, D20) gives sandbox and staging DIFFERENT keys for one project`
- `source/github/driver.test.ts > the github source driver keeps D5's contract refuses to commit a secret, and the head does not move (Task 11, §20)`
- `source/github/driver.test.ts > the github source driver keeps D5's contract refuses a write through a symlink to .git, and runs no command (Read this first 1)`
- `source/github/driver.test.ts > the github source driver keeps D5's contract refuses a write UNDER a gitlink a person pushed, and a write OVER it — each a path conflict (F12)`
- `source/github/driver.test.ts > the github source driver keeps D5's contract writes bytes exactly, and a person reads them back with git (the front-end enablement plan’s Task 4)`
- `source/github/driver.test.ts > the github source driver keeps D5's contract pages the history newest first, and describes one commit’s changes with a patch (Task 4)`
- `source/github/driver.test.ts > the github source driver keeps D5's contract answers GitHub's head after a rewrite AND a normal push — never the mirror's frozen main (F6)`
- `source/github/driver.test.ts > the GitHub driver reports every advance of its mirror, once, to ONE observer (Task 9, Decision 11) reports a rewrite ONCE, as rewritten — and the next normal push as updated, never as another rewrite ([M14])`
- `source/github/driver.test.ts > the GitHub driver reports every advance of its mirror, once, to ONE observer (Task 9, Decision 11) pins every commit it hands the builder: one GitHub rewrote away still builds after gc`
- `source/github/driver.test.ts > the GitHub driver absorbs GitHub’s lag on a repository it has just made — and only there (FE-41, Task 6a) ONLY a creation is retried: the same answer to a later read or commit fails at once, and is not said as a retry`
- `source/github/driver.test.ts > the GitHub driver absorbs GitHub’s lag on a repository it has just made — and only there (FE-41, Task 6a) a seed push GitHub REFUSES with a line for main is not tried again — it fails at once, and is undone`

## What the burners showed about the load itself

**Twelve `yes` burners — each ~90 % of a core — read a 1-minute load of 53 to 333 (median 128), not ~12.** macOS's load average is not
"busy cores": every runnable thread counts, and under contention it climbs far past the core count. The scheduler also decayed ten of
the twelve burners to `pri` 17 while the suite's worker stayed at 31. So the plan's Decision 5 premise — *"12 because it is the load …
twelve burners"* — does not hold: its gate at 12 sits far below what twelve burners make, and at the level of an ordinary busy day here
(the quiet runs' own peaks reached 10.4, and 33 just after a wake). Recorded for Task 6, whose forced run under twelve burners is the
evidence for any other number.

## After — the wrapped runs (Task 6, sitting 2)

*Measured 2026-10-14/15, 19:40–00:50 PDT, by `manifest-gt-s2` (the third coordinated run's job GT2, coordinated by `manifest-coord5`, every
other session's Vitest held), on AC in clamshell mode (lid closed, an external display — `AppleClamshellCausesSleep` No; `manifest-coord5`
ruled Rich's *"lid open and on AC"* met in substance: it cannot sleep), with no Sleep or Wake in `pmset -g log` over any run. The tree:
Task 4's retry (`09f2f0b`) and the review's fix wave (`07c4601`) in all but run A; the utility scale 5 (`f43f894`) in the last. 3680 tests
in 223 files (+7 and +1 on Task 1's: Task 4's six, the fix wave's one). Versions as above.*

| Run | Burners | 1-min load at the gate · min / median / max | Wall (Vitest) | ÷ quiet normal | Result |
|---|---|---|---|---|---|
| **A1** — the gate's live control, unforced | 12 | **26.08** — REFUSED, `exit 75`, no test run | — | — | as designed |
| **A2** — utility, scale 3, FORCED | 12 | 30.29 · 30.29 / 51.52 / 113.57 | stopped at 30 min | — | **starved**: 4 of 220 files, 58 red, all `Test timed out in 15000ms` |
| **N** — the load the gate admits (no tests) | 8 | 8.42 at 120 s, 8.96 at 210 s, from a base of 2.30 | — | — | ~1 per burner below saturation |
| **U** — utility, scale 3, unforced | 10 | **11.61** · 11.61 / 14.67 / 26.55 | 2579.6 s | 2.30 (2.21 ÷ quiet utility) | **red 4**: 3 `Test timed out in 15000ms`, 1 follow-on |
| **B** — background, scale 7, unforced | 6 | **7.99** · 7.91 / 8.99 / 15.13 | 2511 s | 2.24 | **green**, 3680/3680 |
| **U5** — utility, **scale 5**, unforced | 10 | **11.88** · 11.85 / 14.42 / 22.00 | 2523 s | 2.25 | **green**, 3680/3680 |

**A2 — twelve burners starve a utility run; the gate is what keeps a run out of that.** In 30 minutes the forced run finished four of 220
files: `releases` 38.3 s, `launch` 601.3 s (33 red), `delivery` 623.1 s (25 red), `records` 18.6 s — 1 281 s against 130.8 s quiet and
273.8 s under the same twelve burners at NORMAL priority (sitting 1; 10 red at 5 s there). At its end the suite's worker (`pri` 20) got
0.22 s of CPU in 21 s — ~1 % of one core — while each burner got ~86 %. Utility priority does exactly what Rich asked (his work wins
outright), so no timeout scale can make a run green under full saturation by normal-priority work: twelve burners (a 1-minute load of
26–330) is a load the design REFUSES, not one it survives. Stopped by SIGINT to its process group (the RUNBOOK's Ctrl-C); Vitest wrote no
JSON. *(The plan's Decision 5 had chosen the gate as "the load Task 6 proves the scaled run green at — twelve burners"; sitting 1's F5
already showed twelve burners make 26–330, not 12. `manifest-coord5`, under Rich's delegation, restated it: the gate's edge is the
heaviest load it ADMITS, and N burners holding the load there prove it.)*

**N — below saturation each burner adds about one to the 1-minute load** (eight read 8.42 at the gate's moment), so ten burners sit at the
gate's edge (11.61 and 11.88 at the moment the gate read them) and six at ~8 — the plan's own Step 2 load (*"a call's worth"*), admitted.

**U — at the gate's edge the utility run was 2.21× its quiet self and read 4 red at scale 3.** The three timeouts were NOT slow tests
(1.4–2.8 s quiet): `api/agents` FE-36 *a production deploy narrows the sessions holding what it no longer allows, before it answers*
(1.6 s quiet), `source/github/driver` *pages the history newest first …* (2.8 s) and *resolves a branch to GitHub's NOW …* (1.7 s); the
fourth, beside the first, `INTERNAL … expected 500 to be 201`. Per test (quiet ≥ 200 ms, n 832): median 1.85×, p90 2.73×, **p99 8.08×,
max 19.51×** — with ten burners only ~2 cores are free, and when the suite's own processes (Postgres, git, a child Node) want more, utility
loses to the burners in bursts. Scale 3 came from the QUIET ratio (1.04); Decision 3's own formula, max(2, ⌈2 × s⌉), at the edge's s =
2.21 gives **5** (`manifest-coord5`, under Rich's delegation, 21:35) — 25 s a test covers p99 of tests to 3 s and the max of a 1 s test.

**B — background under six burners is green at 7**, at 2.24× a quiet normal run: the price of running on a call, ~42 minutes. It keeps 7.

**U5 — at scale 5 the same edge is green**: 3680/3680, 0 timed out, at 2.25× quiet; per test (n 832) median 1.90×, p90 2.81×, p99
4.92×, max 7.45×. Its slowest: `document.test.ts` 55.6 s (synchronous — sitting 1's F6), `truncate.test.ts`'s reset case 20.3 s (= 3 ×
6 250 + 1 500, by design) and `authz-contract`'s *PROJECT_ARCHIVED* 14.0 s. **The plan's Step 1 criterion — 0 red where the gate admits — is
met at utility 5, background 7, gate 12.**

**The knock-on pair** (Task 6 Step 3, a scratch file never committed, unwrapped, alone): test 1 holds `users` and, a second later,
`audit.incidents` from work it never awaits, and times out at 500 ms. With the retry: test 1 red (`Test timed out in 500ms`), **test 2
green**, one `[test harness] resetDatabase: the TRUNCATE failed with 40P01 (deadlock detected), attempt 1 of 3 — retrying in 100 ms` line.
With `TRUNCATE_ATTEMPTS = 1`: test 1 red, **test 2 red** — `deadlock detected`, in its `beforeEach`.

**The Docker tier at 12 CPUs** — the "before" of Task 7: `pnpm test:docker` through the wrapper (utility, scale 5 exported; its own limits
120 s), 00:16:40, 7100 stopped, the chat model warm, NCPU 12: **305/305 in 44 files, Vitest 1977.1 s**, load min 2.20 / median 5.46 / max
10.64 over 66 samples; 12 networks at its start, 19 at its end. **Against the unwrapped record (1322–1538 s) it is ~1.3–1.5× slower** —
utility priority slows the tier's Node side; the Docker VM is not clamped — so Task 7's 6-CPU run is compared with THIS run.

## Task 7 — the Docker tier at 6 CPUs (sitting 3)

*Measured 2026-10-15, 08:53–09:32 PDT, by `manifest-gt-s3` (the third coordinated run's job GT3, coordinated by `manifest-coord5`, every
other session's Vitest held), on AC, no call over the run (Rich's Zoom began 09:30:31, 43 s after it ended), no Sleep or Wake; on the code of
`fdf9f36`. The plan's *Sitting 3* is the record; **Rich's choice: keep 6** (~09:33, `d2e2d77`).*

| | Before Rich's step (08:53) | After it (09:03) |
|---|---|---|
| Docker Desktop | 4.87.0 | **4.95.0** (build 242831) — *Apply & restart* applied a pending update (F1) |
| Engine / API | 29.7.2 / 1.55 | **29.8.2 / 1.56** (minimum 1.40 both) |
| `docker info` | `NCPU 12`, `MemTotal 8319238144` | **`NCPU 6`**, `MemTotal 8320028672` (7.75 GiB) |
| `settings-store.json` | no `Cpus` key | **`"Cpus": 6`** |
| Containers | 10 `manifest-*` Up; `qdrant-local-dev`, `mongodb`, `mongo-express` Up; the SAML IdP exited | the same set, returned by their restart policies |
| `make verify` | — | 67 checks, 0 failed, 0 warnings |

**The Docker tier, both wrapped (utility, scale 5 exported; the `docker` project's own limits 120 s), 7100 stopped, the chat model warm:**

| | 12 CPUs — sitting 2, 2026-10-15 00:16 | **6 CPUs — sitting 3, 09:04** | 6 ÷ 12 |
|---|---|---|---|
| Result | 305/305, 44 files | **305/305, 44 files** | — |
| Vitest wall | 1977.1 s | **1502.7 s** | **0.76** |
| `runtime/docker/driver` · `roundtrip` · `releases/redeploy` · `runtime/docker/services` | 600.9 · 174.4 · 226.0 · 79.3 s | 444.2 · 44.3 · 123.7 · 37.9 s | 0.60 |
| The other 40 files | 868.2 s | 828.4 s | **0.95** |
| Load (1-min) min / median / max | 2.20 / 5.46 / 10.64 | 3.17 / 5.97 / 11.01 | — |
| Networks | 12 → 19 | 12 → 19 | — |

The four files' saving is in tests that wait on the edge or a build (`roundtrip`'s build 116.2 → 22.7 s; *two deploys of one environment at
once* 139.0 → 39.9 s; `driver`'s health-policy route 116.5 → 21.9 s, its refused route change 92.8 → 20.9 s, its route removal 64.9 →
23.9 s), not in computing; the CPU-bound builds are slower at 6 (*builds the same source to the same digest* 27.3 → 40.3 s, *reports the
scan* 60.7 → 67.8 s). So 6 CPUs is **not slower** — the plan's criterion — and one run a side does not show it faster (F2). The cap did not
lower the host's load during the run (F3).
