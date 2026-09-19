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

**The design is approved and complete, five spikes are done, and P1 to P5b are executed
and green.** Each plan has an acceptance that passes:

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

**There is NO plan under way. The next job is to WRITE P5c** — the clients (`manifest-mock`,
`console/`, the CI acceptance script), the last of Phase 1c's three. **ORIENTATION §7e says what
to read and in what order**, and its author starts at the P5 brief's §10, *What P5c INHERITS*
(`docs/superpowers/plans/2026-09-16-p5-brief.md`). **Its subsection *The one thing to get right
first* — not its opening paragraph, which is about the brief's own stale sections — says that
§17's Phase 1c row is NOT P5c's scope**, P5a and P5b having already shipped most of what it lists.

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
turning the network off from a tool call cuts the agent off too; **it now has NINE steps**, the
newest being `make demo-token`), the second-machine clean clone, starting the UBC external track
(its trigger fired on 2026-09-15), **the dead app networks and volumes the Docker tier leaves**
— `bash scripts/dead-app-resources.sh` re-derives them and an agent cannot apply the removal —
and the rest of ORIENTATION §8. **Two long-standing items were cleared on 2026-09-18**: LiteLLM's
orphaned users (`scripts/litellm-orphans.sh` now does it — an agent lists, Rich applies) and P5a
sitting 12's Docker cleanup. **Neither stays cleared on its own**: every `pnpm test:docker`
regenerates both, which P5b sitting 9 measured — a single run put back exactly the seven networks
and the one volume that had been removed by hand that morning. **The permission classifier is not a
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
