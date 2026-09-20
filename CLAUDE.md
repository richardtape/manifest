# Manifest — working notes for Claude

**Read [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md) before
doing anything else.** It is written for zero context and is the single entry point:
what Manifest is, what five spikes established, what this machine will do to you, the
plan queue, and the conventions below in full. Everything here is the short version.

## State

*This section moves when a plan starts or finishes, not every sitting, and it states no
gate numbers. **ORIENTATION §7e names the exact next job and how to run it**; the current
plan's sittings table is the maintained copy; ORIENTATION §2's box is the only current
statement of the four gate numbers; and the roadmap's ledger
(`docs/superpowers/plans/2026-08-29-plan-roadmap.md`) outranks every other document on
status.*

**The design is approved and complete, five spikes are done, and P1 to P5c are executed
and green — PHASE 1c IS COMPLETE.** Every one of them has an acceptance that passes. **P6 was
split into P6a and P6b on 2026-09-19, and P6a — the first production launch — IS WRITTEN AND
EXECUTING** (`docs/superpowers/plans/2026-09-19-p6a-first-production-launch.md`, 19 tasks in
eleven agreed sittings, from `docs/superpowers/plans/2026-09-19-p6-brief.md`). **Its measurement
sitting has run; ORIENTATION §7e names the exact next job, and this file states no sitting
count.** P6b is written after P6a executes. **The plan raises three spec actions and applies none**;
they are ORIENTATION §8's first entry and they are Rich's.

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

**P5c IS EXECUTED** (`docs/superpowers/plans/2026-09-18-p5c-the-clients.md`, written
2026-09-18, executed 2026-09-18/19): the clients — `manifest-mock`, `console/` behind its import
boundary, and the CI acceptance script — **14 tasks in nine sittings, 107 findings**. It was the
last plan of Phase 1c, and **Phase 1c is now complete**. **§16's Acceptance tier is MET**: §22's
journey is proved by two independent clients over one contract — `make ci-acceptance` headlessly,
run three times including from an `echo reset | make reset` machine, and **a person clicking all
sixteen rows** on 2026-09-19, recorded as a GIF. Rich settled three things in it: nine sittings
(the leaner of three splits, with the cost stated); **§8's `stream_close_delay` question is
answered by a MEASUREMENT** — an app's WebSocket IS cut by any other app's deploy, so
`routing/caddy.ts` carries the field and §8's item is closed; and the **clicked half of its
acceptance is shared and recorded**, because an agent driving Chrome cannot type a password.
**Its acceptance found a live defect no gate can see, and it is now FIXED** (`b23674b`,
2026-09-19, at Rich's direction rather than deferred to P6): signing out of any deployed app
left the person on a raw JSON `404`, because Manifest's own Single Logout URL answered `POST`
only while SAML's logout binding sends `GET` — and Manifest's own session was never ended by
the chain. **Single logout now works end to end, proved in a browser against the real IdP.**
It took TWO fixes, and the second is the one worth knowing: the first passed every test and
was still broken, because `+` is a literal character of base64 and every FORM decoder reads it
as a space — the redirect binding's values are URI components, not form fields. **Every test
missed it because they all fired garbage at the route and asserted a refusal, and a route that
refuses everything passes them all.** ORIENTATION §8 records the decision; P5c's record,
sitting 9, has the measurements.

**P5b — delegated tokens and pending actions (D24) — was executed in nine sittings and finished
on 2026-09-18** (`docs/superpowers/plans/2026-09-17-p5b-delegated-tokens.md`, 13 tasks): an agent
holding a delegated token acts on its one project, asking for one of D24's privileged four is
refused at the authorization layer rather than per route, a person confirms or rejects that
question and a confirmation lets the agent's own retry through exactly once, §26's queue is
readable, every request a token makes is rate-limited, and a question nobody answers is swept to
`expired`. Its acceptance, `make demo-token`, ran green three times — the third from a
`make reset` machine — and is now step 9 of `scripts/offline-acceptance.sh`. **Its four spec
actions were approved and applied on 2026-09-17.** P5a — the contract — finished on 2026-09-17:
the API is under `/v1` at `https://console.manifest.internal` through the edge, an OpenAPI
document is generated from the routes and a TypeScript client from that document
(`packages/contract`), and `make demo-journey` drives §22's journey through nothing but that
client; it is step 8 of the same script. *Sittings pace the work; they are not §17's product
Phases.*

**Outstanding, and Rich's:** the offline acceptance (`scripts/offline-acceptance.sh` —
turning the network off from a tool call cuts the agent off too; **it now has TEN steps**, the
newest being the console's preflight — that the console builds from the checked-in contract
and the edge serves its own document, the one claim about the console a script can falsify), the second-machine clean clone, starting the UBC external track
(its trigger fired on 2026-09-15, and **P6a's R1 makes it more urgent, not less** — P6a builds
the objects a real IAM registration and PIA would populate), and the rest of ORIENTATION §8. **THE MACHINE CLEANUPS ARE ALL CLEAR as of the close of P5c sitting 8**,
applied by the agent session itself and **re-measured by the scripts themselves afterwards**: `dead-app-resources.sh`
reads `none dead` and `litellm-orphans.sh` reads 0 orphaned. They were clear at sitting 1's close
too; sitting 2 ran no Docker tier and they stayed clear; **sitting 3 ran one and seven networks,
one volume and one LiteLLM orphan (`p4b-probe-user`) came straight back**, and were cleared again. **The cycle is the thing to understand, not the status**: a tier run takes
`make verify`'s per-app line from `containers=3 networks=1 volumes=2` to
`containers=3 networks=8 volumes=3`, and an apply takes it back. **The tier has now been measured putting back exactly the same seven networks and one volume
many times over** — ORIENTATION §2's box carries the count, and this file deliberately does not,
because a restated number drifts and this one did — so treat it as a property of the Docker tier
rather than as a backlog: **none of these cleanups stays cleared on its own**, and every demo adds a LiteLLM user
besides. **One thing neither script covers is app images**, and it is nobody's job until somebody
re-derives the held set — not urgent, but growing. **STATE NO COUNT HERE AND MEASURE IT
YOURSELF**: every Docker-tier run and every demo moves it, so any number written down is
wrong within the day. **And NAME THE METRIC when you do**, because the obvious commands
disagree by design: on 2026-09-20 `docker images -q | wc -l` answered **114** while
`docker images -q | sort -u | wc -l` answered **106** (dangling and multiply-tagged images),
and the app images themselves are tagged `127.0.0.1:7107/local/*` — so
`docker images | grep '^local/'` answers **0** and reads as *none* when 64 of them exist.
ORIENTATION §2's *Outstanding* bullet on the image sweep carries the same lesson from the
day 86 of them were removed. **So run both scripts bare at a sitting's close, then TRY `--apply` yourself**, and hand the output to
Rich only when the classifier refuses you — it refused these in earlier sittings and ALLOWED both in
P5c sitting 8, which cleared them without him. Never work from a written list. **The permission classifier is not a
fixed rule** — it allowed all of that and then began refusing `docker volume ls` in the same
session, so try the command rather than assuming either way. *(The one P5a negative control those rules refused —
the edge's `@outside` refusal — was closed on 2026-09-17 without weakening the edge, and is no
longer outstanding.)*

**Where to look:** [`WALKTHROUGH.md`](docs/superpowers/WALKTHROUGH.md) to see it run;
[`RUNBOOK.md`](docs/superpowers/RUNBOOK.md) to operate it and run each demo; README's
*Running the control plane* to start the server; ORIENTATION §4 for what this machine will
do to you, §8 for decisions waiting on Rich, §9 for lessons; and each plan's *What
executing this plan found* for the measurements behind all of it.

## Before you trust a green result

Each of these was paid for. ORIENTATION §4 and §9 carry the measurements.

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
- **Never edit the spec directly.** `docs/superpowers/specs/2026-08-29-manifest-platform-design.md`
  is marked *Approved design*. Record proposed changes and ask — **every spec change this
  project has made was approved by Rich first**, most recently **D33 on 2026-09-19**. The
  roadmap's *Spec action(s) raised by…* sections are the list; this file deliberately states no
  count, because a restated number drifts (ORIENTATION §9) and this one already had.
  **A spec action is not finished when the spec changes**: the four shared HTML pages restate it
  in plain language, and D33 moved six counts across four files.
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
  that the gate numbers are stated in three documents (ORIENTATION §2's box, README and
  RUNBOOK; this file deliberately states none) and must move together. Budget session
  capacity for the sweep; if it is tight, stop a task early and sweep rather than
  finishing the task and leaving the documents lying.
