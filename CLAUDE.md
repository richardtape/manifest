# Manifest — working notes for Claude

**Read [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md) before
doing anything else.** It is written for zero context and is the single entry point:
what Manifest is, what four spikes established, what this machine will do to you, the
plan queue, and the conventions below in full. Everything here is the short version.

## State

**P1 is executed and green (2026-09-05). The platform runs.**
`make seed && make host-setup && make up` brings up the whole §21 inventory;
`make doctor` is 14 checks / 0 failed and `make verify` is 31 checks / 0 failed,
**both green offline**. Start from [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md),
not the plan. The three host changes are in place and all reverse with
`make host-undo`. **Untested: the second-machine clean clone** — no second Mac was
available; it is recorded in the runbook's *Known gaps*, not quietly dropped.

**P2 is executed and green (2026-09-05) — all 21 tasks. The control plane runs.**
It serves HTTP on **7100**: `spec/`, `blueprints/`, `db/`, `runtime/` (the §11
`Driver`, the fake driver, the contract suite P3 inherits), `source/`, `identity/`,
`projects/`, `releases/` and a Fastify `api/` with D23.6 idempotency and the D23.7
error envelope. **224 tests** via `pnpm test` — **run it from the repo root**, not
with `--filter`; the two differ and that difference found a defect. The database
tests need `make up` and derive their connection from `.env` themselves. To run the
server, see *Running the control plane* in `README.md`.

**P3 is part-executed (2026-09-06). Tasks 1–15 are done and green; 16–19 remain —
pick up at Task 16.** It has added `runtime/docker/` (including the assembled
`DockerDriver`), `routing/`, `services/` and `build/`, plus a second test tier:
`pnpm test` is **364** and `pnpm test:docker` is **70** (needs `make up`; it **fails
rather than skips** when asked to run, and now runs real image builds, so it takes
~3 minutes). `make doctor` is 15 checks, `make verify` 32. Executing those fifteen
tasks found **61 defects — 4.1 per task**, above the 2.7–2.9 the roadmap predicted;
they are recorded per session in the plan's *What executing this plan found*, and
Session 4's entry ends with *What Session 5 inherits*.

**Session 4 is the entry worth reading before touching a build.** It found that **no
build in this platform had ever succeeded** — the blueprint Dockerfile's `# syntax=`
directive made BuildKit fetch a frontend from Docker Hub, which §12's egress-free
builder cannot reach — and that **D13's npm-mirror control was completely inert**,
because `.npmrc` arrived after `npm ci`. The second is S1's silently-wrong build by
another route: offline it fails loudly, with the network up it would have succeeded
against the public registry. The control plane now boots the **Docker** driver, and
`src/boot.docker.test.ts` reads that fact back from the compiled entry point.

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

Four spikes are done (S7, S2, S1, S3 — all answered yes). P0, P1, P2 and P3 are
written; **P1 and P2 are fully executed and P3 is part-executed**. **P4 and P5 are unwritten,
deliberately.** Plan-writing stopped on 2026-09-04 in favour of
execution — a decision P1 then confirmed, producing **18 defects across 13 tasks** in
an already-self-reviewed plan, a third of them checks that passed while the thing
under test was broken or absent. The maintained status record is the *Spike status*
ledger in `docs/superpowers/plans/2026-08-29-plan-roadmap.md`; if any document
disagrees with it, the ledger wins.

## Non-negotiables

- **Ask before `sudo`.** It cannot prompt from a tool call — you get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal.
- **Leave the machine exactly as you found it.** Snapshot before changing anything.
  Four spikes have met this bar.
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
