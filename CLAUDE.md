# Manifest — working notes for Claude

**Read [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md) before
doing anything else.** It is written for zero context and is the single entry point:
what Manifest is, what five spikes established, what this machine will do to you, the
plan queue, and the conventions below in full. Everything here is the short version.

## State

**P1 is executed and green (2026-09-05). The platform runs.**
`make seed && make host-setup && make up` brings up the whole §21 inventory;
`make doctor` is now **17 checks / 0 failed** and `make verify` **45 / 0**,
and both were green offline when P1 was executed. Start from [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md),
not the plan. The three host changes are in place and all reverse with
`make host-undo`. **Untested: the second-machine clean clone** — no second Mac was
available; it is recorded in the runbook's *Known gaps*, not quietly dropped.

**P2 is executed and green (2026-09-05) — all 21 tasks. The control plane runs.**
It serves HTTP on **7100**: `spec/`, `blueprints/`, `db/`, `runtime/` (the §11
`Driver`, the fake driver, the contract suite P3 inherits), `source/`, `identity/`,
`projects/`, `releases/` and a Fastify `api/` with D23.6 idempotency and the D23.7
error envelope. Run `pnpm test` **from the repo root**, not
with `--filter`; the two differ and that difference found a defect. The database
tests need `make up` and derive their connection from `.env` themselves. To run the
server, see *Running the control plane* in `README.md`.

**P3 is EXECUTED and green (2026-09-07) — all 19 tasks. The platform deploys.**
It added `runtime/docker/` (including the assembled `DockerDriver`), `routing/`,
`services/` and `build/`, plus a second test tier. **It left** `pnpm test` at 381 and
`pnpm test:docker` at 89, with `make verify` at 34 checks; the CURRENT numbers are in
the P4a paragraph below. `pnpm test:docker` needs `make up`, **fails rather than
skips** when asked to run, runs real image builds, and takes ~5 minutes. **`make demo` is the acceptance**: an app from a bare git
repository to `https://fixture-app.staging.manifest.internal`, and again from a
dropped database, a deleted repository root and an emptied registry. Executing the
nineteen tasks found **82 defects — 4.3 per task**, the highest rate measured here;
they are recorded per session in the plan's *What executing this plan found*.

**Sessions 4 and 5 are the entries worth reading before touching anything.** Each was
the first time something ran end to end, and each found that a whole half of the
platform had never worked. **Session 4: no build had ever succeeded** — the blueprint
Dockerfile's `# syntax=` directive made BuildKit fetch a frontend from Docker Hub,
which §12's egress-free builder cannot reach — and **D13's npm-mirror control was
completely inert**, because `.npmrc` arrived after `npm ci`. **Session 5: no deploy
had ever succeeded either**, through seven defects of one shape — *the test constructs
the value correctly and the running system re-derives it wrongly* (a blueprint
directory, a repository path, an image repository, a port) — plus a container health
check that every app failed, because BusyBox `wget` honours `http_proxy` and ignores
`NO_PROXY`, so D18's forced proxy denied each app's probe of its own loopback. **All
of it was green in a suite of 74 passing Docker tests.**

**P4a is PART-EXECUTED: Tasks 1–9 of 15 are green (8–9 on 2026-09-09); Tasks 10–15
remain, and continuing at Task 10 is the current work** — ORIENTATION §7d, which
carries the table. The rest runs in **seven agreed SITTINGS, one per session with a
check-in at each boundary**, so a session limit cannot land mid-task: sittings 1, 2 and
3 are done, so **sitting 4 is Tasks 10–11** (`spec/injection.ts`, then its call site),
then 12–13, 14 alone and 15 alone. *Sittings pace the work; they are not §17's product Phases.*
**A real CWL login now works end to end**, which it could not before: the IdP could
neither issue an assertion nor authenticate anybody, with `make verify` green
throughout — and since Task 7 that login runs through a Service Provider registration
the control plane **derives and writes itself**, signed with a per-app RSA-4096 key it
minted and stored; since Task 9 `deployRelease` writes that registration for any app
that declares CWL. `make verify` is **45 / 0**, `pnpm test` **458**, `pnpm test:docker`
**111**. `secrets/` now holds every service credential — libsodium envelope
encryption in Postgres, replacing P3's HMAC derivation, migrated without breaking a
running database — and §20's `audit.events` is append-only **by grant**, which needed
the control plane to stop connecting as a superuser before it could mean anything:
`REVOKE UPDATE, DELETE` followed by `UPDATE 1` was the measured starting point. It now
connects as **`manifest_app`**, and so does the whole test suite. Those nine tasks
found **43 defects**, two of them spec-level: **§12's
dependency-scan gate blocked every CWL application** (settled by Rich on 2026-09-08 —
it now blocks only on findings that have a published fix), and **§8's
`SAML_IDP_CERT_PATH` named a file nothing could create**, so `InstanceSpec` gained
`files`. **Three of the first eighteen were a swallowed `.catch(() => undefined)`**, which
is this codebase's most productive defect — including one that let a stale container
serve four runs of a suite and made a negative control pass against an app it had
already edited. P4 was split into P4a (identity, secrets, the §8 injection
contract) and P4b (AI, events, streaming, incidents) on Rich's call. **P4b is now
written too (2026-09-07, 16 tasks) and must not be executed first**: it was written
ahead of P4a's execution at Rich's request, and its Task 1 is a reconciliation pass
against the *executed* P4a. Writing P4a found **four live defects that `make verify`
34/0 could not see**: the Manifest IdP could not issue an assertion at all, attribute
release failed open, the `ubcEduCwlPuid` OID matched nothing `passport-ubcshib` maps,
and `MONGODB_DB_NAME` was never injected. Writing P4b found six more, including a
**moving, unpinned LiteLLM image** while §16 pins the error mapping to a version, and
a §10 requirement — the per-user AI budget — that **LiteLLM 1.98.0 provides no way to
enforce**. **P3's six spec actions were all applied on 2026-09-07**, with Rich's
approval; **P4a proposes five more and P4b six, none applied.**

Executing P2 found **52 defects** across three sittings — 5, then 20, then **27 in
Tasks 12–21**. Four from that last batch are worth carrying: the plan's code had
**never been typechecked** against this repo's own tsconfig, and six
`exactOptionalPropertyTypes` errors were invisible to every test because Vitest
strips types without checking them; **five test-isolation defects** made the suite
pass or fail on the order Vitest happened to pick, and `withRollback` turned out not
to protect a suite from rows another test *committed*; **two safety mechanisms were
one edit from being live** — `/auth/dev-login` hardcoded `devAuthEnabled: true`, and
`GET /builds/:id` could be made to trust a client-supplied `projectId`, both
answering `200` when broken; and **nothing had ever executed the boot entry point**,
which is the same defect P3's self-review found in P3.

**Toolchain:** Node 24 via nvm, pnpm 11 via corepack. **Four gates, all clean before
a commit** — and `pnpm test:docker` too, once you are touching `runtime/docker/`,
`services/` or `build/`: `pnpm test` (from the repo root), `pnpm lint`,
`pnpm --filter @manifest/control-plane typecheck` and `pnpm format:check`. The last
two are not optional extras — Vitest strips types without checking them, so `tsc` is
the only thing that sees a whole class of error, and `format:check` was silently red
on 29 files until 2026-09-05. Run `pnpm test` **twice**: a suite that is not
repeatable has a state leak. For the platform itself it is `make doctor` and
`make verify`.

**Five spikes are done** (S7, S2, S1, S3 — all answered yes — and **S6**, which ran
as P3's Task 18 on 2026-09-07 and found every probe denied with every denial paired
with a positive control). P0, P1, P2 and P3 are written and **all three
implementation plans are executed**. **P4a and P4b are both written and unrun — 31
tasks between them; P5 is unwritten.** Plan-writing stopped on 2026-09-04 in favour
of execution; that hold is now discharged, and it was right — the three plans
produced **152 defects between them** after all three had been self-reviewed. That
is also why a 31-task unrun stack is worth naming out loud rather than glossing. The maintained status record is the *Spike status*
ledger in `docs/superpowers/plans/2026-08-29-plan-roadmap.md`; if any document
disagrees with it, the ledger wins.

## Non-negotiables

- **Ask before `sudo`.** It cannot prompt from a tool call — you get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal.
- **Leave the machine exactly as you found it.** Snapshot before changing anything.
  Every spike so far has met this bar, and so has every plan-writing session.
- **Never touch Laravel Valet.** It owns the `.test` TLD, port 53 and ports 80/443 on
  this machine and on other UBC developers' machines. This is why the platform zone
  is `*.manifest.internal` and why the edge binds the `127.0.0.2` loopback alias.
- **Never edit the spec directly.** `docs/superpowers/specs/2026-08-29-manifest-platform-design.md`
  is marked *Approved design*. Record proposed changes and ask; that has been the
  pattern four times.
- **These containers must survive**: `docker-simple-saml-saml-idp-1`,
  `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **`docker-simple-saml` and `ubc-genai-toolkit` are read-only.** Both are clean and
  must stay that way. Work on a copy.

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
- **Close out properly:** update the roadmap ledger, sweep for documents that state
  status, and leave the machine as you found it. The sweep is the step that gets
  forgotten.
