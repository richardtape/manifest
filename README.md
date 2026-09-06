# Manifest

A self-hosted internal developer platform for UBC. A faculty member describes an
application in plain language, an AI agent builds it, and Manifest deploys it —
authenticated with CWL, running on UBC infrastructure — without the faculty member
ever encountering a container, a template, or a terminal.

This repository is the **deployment control plane**. The faculty-facing front-end is
a separate project; what lives here is the platform it consumes, plus a reference
console that proves the API can carry the whole journey.

## Status: the platform runs locally, and so does the control plane

**P1 is executed and green as of 2026-09-05.** `make seed && make host-setup &&
make up` brings up the whole §21 inventory — split-horizon DNS, a custom `xcaddy`
edge with rate-limiting and Coraza, Postgres with three databases, a private
registry and npm mirror, a default-deny egress proxy, a rootless non-privileged
BuildKit, LiteLLM against host Ollama, and the Manifest IdP. `make doctor` is 14
checks / 0 failed and `make verify` is 31 checks / 0 failed, **both green with the
network off**. `https://console.manifest.internal/` returns the same hostname and
scheme from the host browser and from inside a container — no port, no certificate
warning. See [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md).

**P2 is executed and green as of 2026-09-05 — all 21 tasks.** The control plane
serves HTTP on **7100**: the `manifest.yaml` schema and its machine-actionable
errors, policy validation, blueprints, the §11 `Driver` interface with an in-memory
fake and the contract suite P3 inherits unchanged, the instance state machine, the
Drizzle schema against P1's Postgres, signed session cookies with a dev-only auth
shim, the §13 capability model, a local bare-repo source driver, immutable releases,
and a Fastify surface with D23.6 idempotency keys and the D23.7 error envelope on
every failure. **224 tests.** The whole faculty lifecycle — project, spec, build,
release, staging deploy to healthy, production correctly refused with its §13
checklist — runs against the fake driver in **~300 ms**. See
[*Running the control plane*](#running-the-control-plane) below.

The design is approved and complete.
Seven throwaway spikes de-risk it; **four are done — S7, S2, S1 and S3 — and all four
answered yes**, each far inside its timebox, with every spec change they implied
already applied. The remaining three are scheduled later, against machinery that does
not exist yet.

**Three implementation plans are complete, two have run in full, and the third is
more than half run** — P1, the local substrate (13 tasks, **all executed**), P2, the
control-plane spine (21 tasks, **all executed**), and P3, the Docker driver and
deploy spine (19 tasks, **1–12 executed and green as of 2026-09-06; 13–19 remain**). **P4 and P5 are unwritten, and that is deliberate: on 2026-09-04 the
project stopped writing plans and started executing them.**

Execution vindicated that decision three times over. P1's 13 tasks produced **18
defects** in a plan that had already been self-reviewed, a third of them *checks that
passed while the thing under test was broken or absent*. P2's Tasks 2–8 produced
**20 more**, including a `pnpm format` that would have rewritten the approved spec.
P2's Tasks 12–21 produced **27 more** — six type errors **no test could catch**,
because Vitest strips types without checking them; five test-isolation defects that
made the suite pass or fail on the order Vitest happened to pick; and two safety
mechanisms that turned out to be **one edit from a live authentication bypass and a
live IDOR**, both of which answered `200` when broken. And P3's first twelve tasks
produced **45 more — 3.7 per task**, the highest rate measured here, among them a
vulnerability gate that could never have fired and a `.gitignore` rule that silently
refused to commit an entire module. **Finishing P3, from Task 13, is the current
work.**

## Where to start

**Everyone starts here:** [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md).
It assumes no context and carries what the project is, what has been established, what
this machine will do to you, and what to do next. Then:

| If you are… | Read |
|---|---|
| Running the platform | [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md) — `make seed && make host-setup && make up` |
| Finishing P3 (**the current job**) | ORIENTATION §7c, then [`docs/superpowers/plans/2026-08-31-p3-docker-driver-deploy-spine.md`](docs/superpowers/plans/2026-08-31-p3-docker-driver-deploy-spine.md) — **start at Task 13**; 1–12 are done and green. Read its *What executing this plan found* first |
| Running the control plane | [*Running the control plane*](#running-the-control-plane) below — `make up`, then `pnpm --filter @manifest/control-plane dev` |
| Executing any plan | The plan itself. It is self-contained by construction; if it is not, that is a defect in the plan — fix it there |
| Writing the next plan (**P4, and not yet**) | ORIENTATION §7d, then [`docs/superpowers/plans/2026-08-29-plan-roadmap.md`](docs/superpowers/plans/2026-08-29-plan-roadmap.md). It is held until P3 finishes |
| Looking for what a spike proved | `docs/superpowers/spikes/S{7,2,1,3}-findings.md` — the answer is the first sentence of each |
| Looking for the architecture | [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](docs/superpowers/specs/2026-08-29-manifest-platform-design.md) — authoritative, ~2,340 lines. ORIENTATION §3 tells you which sections you actually need |
| Explaining this to someone non-technical | [`manifest-schematic.html`](docs/superpowers/specs/manifest-schematic.html) and its companions — the same design in plain language, plus six worked faculty stories |
| Tracking the UBC reviews | [`docs/external-track.md`](docs/external-track.md) — the items decided by people outside this team, which carry the longest lead times in the project |

## Running the control plane

Requires P1's substrate (`make up`) for Postgres on 7103. Run these **from the repo
root** — `MANIFEST_BLUEPRINTS_ROOT` and `MANIFEST_REPOS_ROOT` are read as given, and
`pnpm --filter` runs with the *package* directory as its working directory, so
relative paths there point at the wrong place.

```bash
set -a; . ./.env; set +a   # make seed writes .env; the password is NOT "manifest"
export MANIFEST_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
export MANIFEST_SESSION_SECRET=$(openssl rand -hex 32)
export MANIFEST_DEV_AUTH=1
export MANIFEST_BLUEPRINTS_ROOT="$PWD/blueprints"
export MANIFEST_REPOS_ROOT="$PWD/.manifest/repos"

pnpm --filter @manifest/control-plane db:migrate
pnpm --filter @manifest/control-plane dev      # tsc, then node dist/index.js
```

It listens on `http://127.0.0.1:7100`. Verified end to end on 2026-09-05:

```bash
curl -s http://127.0.0.1:7100/auth/me
# {"error":{"code":"UNAUTHENTICATED","message":"a session is required","hint":"Log in first."}}

curl -s -c /tmp/jar -X POST -H 'content-type: application/json' \
  -d '{"puid":"bio_prof"}' http://127.0.0.1:7100/auth/dev-login

curl -s -b /tmp/jar -X POST -H 'content-type: application/json' \
  -H "idempotency-key: $(uuidgen)" \
  -d '{"slug":"boot-check","blueprint":"fixture-node@1"}' http://127.0.0.1:7100/projects
```

**`node src/index.ts` does not work**, though Node 24 strips types natively: the
source uses NodeNext `.js` specifiers, which Node resolves literally rather than
mapping back to `.ts`. Hence the build step.

**`MANIFEST_DEV_AUTH=1` enables the temporary login shim** and is refused outside
`MANIFEST_ENV=development` — the process exits with
`CONFIG_DEV_AUTH_OUTSIDE_DEVELOPMENT` before anything binds the port. Verified by
starting it with `MANIFEST_ENV=production`. P4 replaces the shim with CWL and deletes
it.

## The three things that shape every decision

- **Laptop-first, and reproducibly so.** The entire platform runs on one developer
  machine, offline after a one-time seeding step. Not a demo mode — the real thing.
- **It is a containment system that happens to deploy.** Manifest's primary security
  function is to limit the blast radius of code nobody reviewed. Where "deployment
  platform" and "containment system" disagree, containment wins.
- **Every production app needs its own UBC IAM registration and privacy assessment.**
  Non-negotiable, human, multi-week. The platform's job is to *drive* those processes,
  not to wait on them.

## Conventions

- Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, spike
  findings in `docs/superpowers/spikes/`.
- Spikes run on `spike/<id>` branches that are **never merged**. Only the artefacts
  named in the brief are copied out.
- The design document is marked *Approved design*. Proposed changes are recorded in
  a findings note or a plan and approved before they are made, not edited in directly.
- **Status lives in one place**: the *Spike status* ledger in the roadmap. If any
  other document disagrees with it, the ledger wins — several have gone stale within
  a day of being written, and that is now a documented lesson rather than a surprise.
