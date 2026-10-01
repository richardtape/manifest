# Manifest — working notes for Claude

**Read [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md) before
doing anything else.** It is written for zero context and is the single entry point:
what Manifest is, what five spikes established, what this machine will do to you, the
plan queue, and the conventions below in full. Everything here is the short version.

## State

*This section moves only when a plan starts or finishes. It states no job, no sitting and no gate numbers: **ORIENTATION §7e
names the next job** and the current plan's sittings table says how far it has got; the gate numbers are `scripts/ci-acceptance.sh`'s
`EXPECT_` lines and ORIENTATION §2's `pnpm test:docker` row, stated nowhere else; and the roadmap's ledger
(`docs/superpowers/plans/2026-08-29-plan-roadmap.md`) outranks every document on status (Rich, 2026-09-24 and 2026-09-30).*

**The design is approved and complete, five spikes are done, and fourteen plans are executed** — each with an acceptance that
passes. **The launch path plan** (`docs/superpowers/plans/2026-09-29-launch-path.md`) is approved and in execution, every one of its
spec actions decided and applied. **The plan after it, *faculty-ready*** (`docs/superpowers/plans/2026-09-30-faculty-ready.md`), is
written and approved; then FE-32's plan; then the vulnerability database in the console. Rich's decisions of 2026-09-30 are in
`docs/superpowers/2026-09-30-decisions.md`. Each plan's *What executing this plan found* is its record; this file keeps none of it.

| Plan | Executed | What it made true | Acceptance |
|---|---|---|---|
| P1 | 2026-09-05 | The platform runs on one laptop, offline after `make seed` | `make doctor`, `make verify` |
| P2 | 2026-09-05 | The control plane serves the API on 7100 | its unit tier |
| P3 | 2026-09-07 | An app goes from a bare repository to a URL, through the Docker driver and the edge | `make demo` |
| P4a | 2026-09-09 | A real CWL sign-in; secrets stored, not derived; §8's injection contract | `make demo-identity` |
| P4b | 2026-09-15 | AI answers charged to the asker; build logs, events and Incidents | `make demo-ai` |
| P4c | 2026-09-16 | A redeploy interrupts and signs out nobody | `make demo-redeploy` |
| P5a | 2026-09-17 | The API is a published contract under `/v1`, driven by a generated client | `make demo-journey` |
| P5b | 2026-09-18 | An agent acts on a delegated token; D24's privileged four are refused centrally and a person confirms one retry | `make demo-token` |
| P5c | 2026-09-19 | The clients: `manifest-mock`, `console/` behind its import boundary, the CI acceptance script — and Phase 1c's acceptance | §22's journey clicked by a person **and** run headlessly, over one contract |
| P6a | 2026-09-22 | The first production launch: §12's public listener, the two external records, the rehearsal, step-up, an approval bound to a digest | `make demo-production`, **and a launch clicked by a person** |
| P6b | 2026-09-23 | Subsequent releases: self-serve unless sensitive, re-escalation approved from a stored preview, the egress proxy following its release, §9's IAM change request, the person-only class | `make demo-releases`, **and a person clicking it** |
| D5 driver 2 | 2026-09-25 | An app's code in a GitHub organisation: private and kept private, pushes by HMAC-verified webhook, every commit scanned for secrets, `main` protected, built offline from a mirror — against a GitHub fake, checked against a real App | `make demo-github` (driver 2), **and a person clicking both drivers** |
| Authoring API | 2026-09-27 | An app CREATED through the API: files read and committed against the commit read (git plumbing, no worktree, both drivers), history attributed by the platform's own record, app secrets set write-only, a build of exactly the commit written with its own manifest — and the API's documentation served by the API | `make demo-authoring` (either driver), **and a person clicking it** |
| Front-end enablement | 2026-09-29 | A second origin (`app.`) for the faculty front-end; a project's name, people by CWL login, agent and intake model keys, recent output (sandbox), binary files, archive/restore and delete, the capable model and its on-premise fallback, the building agent's models as a setting | `make demo-frontend` (either driver), **and a person clicking it** |

**Outstanding, and Rich's** (ORIENTATION §2 and §8 have the detail):
- **the offline acceptance** — `scripts/offline-acceptance.sh`, run by hand, because turning the network off from a tool call cuts the
  agent off too;
- **the second-machine clean clone**;
- **`make refresh-vulndb`, weekly, with the network on** — next due after **2026-10-06**; past seven days `make doctor` warns and
  §13's `scans` item refuses every production launch;
- **any real repository in `Manifest-local-dev` that no project owns** — ONE on 2026-10-01, `f6-watch` (the faculty front-end's F6 sitting 1;
  its rows truncated by the launch path plan's sitting 8) (`bash scripts/github-real-repos.sh`);
  removing one is his;
- **the UBC external track — DEFERRED by Rich, 2026-09-30** (*"I have to get all of this working first locally. And then show
  demos"*): not a blocker; do not raise it as urgent;
- the rest of ORIENTATION §8 *Open*.

**Machine cleanup: at every sitting's close run `scripts/dead-app-resources.sh`, `litellm-orphans.sh` and `app-images.sh` bare,
then TRY `--apply` yourself**, and hand the output to Rich only when the permission classifier actually refuses you — it is not a
fixed rule, so try rather than assume. **None of these stays cleared on its own**: a Docker-tier run puts back ~7 networks, a volume
and ~13 app images, and every demo adds a LiteLLM user. **Never work from a written count — measure, and NAME THE METRIC**:
`docker images` counts disagree by design, and the app images are tagged `127.0.0.1:7107/local/*`, so `grep '^local/'` reads 0 when
dozens exist.

**Where to look:** [`WALKTHROUGH.md`](docs/superpowers/WALKTHROUGH.md) to see it run;
[`RUNBOOK.md`](docs/superpowers/RUNBOOK.md) to operate it, run each demo, and — its
*Running the control plane* — start the server; ORIENTATION §4 (its 27 likeliest traps, and
[`TRAPS.md`](docs/superpowers/TRAPS.md) for all of them) for what this machine will
do to you, §8 for decisions waiting on Rich, §9 for lessons; and each plan's *What
executing this plan found* for the measurements behind all of it.

## Before you trust a green result

Each of these was paid for. ORIENTATION §4, `docs/superpowers/TRAPS.md` and §9 carry the measurements.

- **Integration is where the false greens sit.** P3 found that no build, and then no
  deploy, had ever succeeded — behind 74 passing Docker tests — because the test
  constructs a value correctly and the running system re-derives it wrongly. Drive the
  real entry point (a `make demo*` through the edge), not only a harness.
- **A green result is not evidence a control is in force, and a plan's own negative
  controls often cannot fail** — P4c measured five of its plan's and four of its
  acceptance's nine. Commit, break the thing, watch the named test go red, restore.
- **Assert the shape of the answer.** The edge's wildcard answers `200` for any name, and
  a test that expects a refusal must name the refusal's CODE, or a new refusal in front of
  it keeps the test green for the wrong reason.
- **Vitest strips types.** `pnpm typecheck` is the only gate that sees a whole class of
  error, and `exactOptionalPropertyTypes` makes that class common.
- **A swallowed `.catch(() => undefined)` is this codebase's most productive defect**, and
  a failure that leaves no operator line hides the next one. `request.log` writes nothing
  here; use `console.error`, never with a secret in it.
- **A module with no caller is not built.** It has shipped four times; every task names
  its caller.
- **Tests change the running platform.** `pnpm test` — even one file, and
  `pnpm contract:write` — truncates the control plane's tables; `pnpm test:docker`
  restarts the edge and re-registers the platform's SP row. Restart the control plane
  afterwards.

**Toolchain:** Node 24 via nvm, pnpm 11 via corepack. **Four gates, all clean before a
commit:** `pnpm test` (from the repo root, never with `--filter` — the two differ, and that
difference found a defect), `pnpm lint`, `pnpm typecheck` (every workspace package) and
`pnpm format:check`. The last two are not optional extras: `tsc` is the only thing that sees
a type error, and `format:check` was silently red on 29 files until 2026-09-05. Run
`pnpm test` **twice**: a suite that is not repeatable has a state leak. **`pnpm test:docker` too** (~15 min, needs `make up`, fails rather than skips) for
any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`,
`sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`, `observability/`, `infra/` or a
`*.docker.test.ts` — and whenever the current plan's sittings rule says so, which wins.
For the platform itself it is `make doctor` and `make verify`.

## Non-negotiables

- **Ask before `sudo`.** It cannot prompt from a tool call — you get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal.
- **Leave the machine exactly as you found it.** Snapshot before changing anything.
  Every spike so far has met this bar, and so has every plan-writing session.

- **YOU ARE PROBABLY NOT THE ONLY AGENT WORKING IN THIS REPOSITORY.** Rich runs several
  sessions at once. They should not be changing code, but they **do** add markdown files and
  assets, and they **do commit on `main` while you are working** — P6a sitting 1 watched `HEAD`
  move under it twice and found two untracked files that were not its own.
  **So: NEVER `git add -A`, `git add .`, `git commit -a` or `git checkout .`** — stage the
  paths you actually changed, by name, every time. A parallel session's file was swept into an
  unrelated commit exactly that way on 2026-09-19.
  **Before committing, run `git status` and account for every path**; anything you cannot
  explain is somebody else's, and you leave it alone rather than staging, reverting or
  stashing it. If `git log` shows commits you did not make, that is normal — build on them.
  **Nothing is pushed**, so a surprising `HEAD` is never a conflict to resolve, only a commit
  to land on top of. The same rule protects THEM from you.
- **Never touch Laravel Valet.** It owns the `.test` TLD, port 53 and ports 80/443 on
  this machine and on other UBC developers' machines. This is why the platform zone
  is `*.manifest.internal` and why the edge binds the `127.0.0.2` loopback alias.
- **Never edit the spec directly.** `docs/superpowers/specs/2026-08-29-manifest-platform-design.md` is marked *Approved design*.
  Record proposed changes and ask — **every spec change this project has made was approved by Rich first** (most recently, on
  2026-09-30, the launch path plan's Spec actions 3, 4, 5 and a new 9, and §21's Mailpit row). The roadmap's *Spec action(s) raised
  by…* sections are the list; this file deliberately keeps no chain of them, because a restated list drifts. **A spec action is not
  finished when the spec changes**: the four shared HTML pages restate it in plain language, and are swept with it.
- **These containers must survive**: `docker-simple-saml-saml-idp-1`,
  `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **`docker-simple-saml` and `ubc-genai-toolkit` are read-only.** Both are clean and
  must stay that way. Work on a copy. **That is exactly what the IdP's UBC CLF theme is**:
  P5c sitting 9 copied `modules/ubc-clf-7/` OUT of `docker-simple-saml` into
  `infra/idp/modules/`, changed it there, and left the source untouched — its only dirty
  file is an untracked `cert.zip` dated months earlier. Check that repo is still clean
  after any work that reads from it.

## How Rich wants this done

- **Decide, then document the decision.** Settle routine questions yourself and record
  the reasoning — the option chosen, the options rejected, what it would cost to
  change course. P1's *Decisions this plan makes* section is the pattern. Save
  questions for what is genuinely his: spec changes, host changes, anything
  irreversible.
- **Capture negative controls.** "It works" is much weaker than "it works, and here it
  is correctly failing when I remove the thing that makes it work." A green result is
  not evidence a control is in force — that lesson has been paid for twice.
- **Assert the shape of the answer, not that an answer arrived.** S3 ran six checks
  and all six passed while one returned 192 numbers where 768 belonged.
- **Record exact versions** — image digests, package versions, macOS and Docker
  Desktop versions. A finding without a version is not reproducible.
- **Write for a reader who was not there.** Every document here gets read cold. That
  is the normal case.

## Conventions

- Specs in `docs/superpowers/specs/`, plans in `plans/`, spike findings in `spikes/`.
- Spikes run on `spike/<id>` branches that are **never merged**; only the artefacts
  the brief names are copied out.
- Plans follow `superpowers:writing-plans`. `plans/2026-08-30-p1-local-substrate.md`
  is the current house style.
- Ports: the platform uses **7100–7199**. macOS ships **bash 3.2 and a BSD
  userland** — no `xargs -r`, no `mapfile`, no GNU-only flags.
- **Close out properly, AT THE END OF EVERY SITTING** — not at the end of the plan.
  Update the roadmap ledger, sweep every document that states status, and leave the
  machine as you found it. **The sweep is the step that gets forgotten.** The next
  sitting is a different agent with an empty window who will believe whatever these
  documents say, so a sitting that ends unswept sends them at a task that is already
  committed. **The plan's own sittings table is the first thing to change and the
  easiest to miss.** ORIENTATION §6 carries the full checklist — including the fact
  that the gate numbers are stated ONCE: `scripts/ci-acceptance.sh`'s `EXPECT_` lines and ORIENTATION §2's
  `pnpm test:docker` row (this file deliberately states none). Budget session
  capacity for the sweep; if it is tight, stop a task early and sweep rather than
  finishing the task and leaving the documents lying.
