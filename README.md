# Manifest

A self-hosted internal developer platform for UBC. A faculty member describes an
application in plain language, an AI agent builds it, and Manifest deploys it —
authenticated with CWL, running on UBC infrastructure — without the faculty member
ever encountering a container, a template, or a terminal.

This repository is the **deployment control plane**. The faculty-facing front-end is
a separate project; what lives here is the platform it consumes, plus a reference
console that proves the API can carry the whole journey.

## Status: the platform runs locally

**P1 is executed and green as of 2026-09-05.** `make seed && make host-setup &&
make up` brings up the whole §21 inventory — split-horizon DNS, a custom `xcaddy`
edge with rate-limiting and Coraza, Postgres with three databases, a private
registry and npm mirror, a default-deny egress proxy, a rootless non-privileged
BuildKit, LiteLLM against host Ollama, and the Manifest IdP. `make doctor` is 14
checks / 0 failed and `make verify` is 31 checks / 0 failed, **both green with the
network off**. `https://console.manifest.internal/` returns the same hostname and
scheme from the host browser and from inside a container — no port, no certificate
warning. See [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md).

**P2 is eleven tasks in.** Its runtime island landed 2026-08-31 — the §11 `Driver`
interface, the in-memory fake driver, the shared contract suite P3 inherits
unchanged, and the instance state machine. **Tasks 2–8 followed on 2026-09-05**: the
`manifest.yaml` schema, machine-actionable errors, policy validation,
`isSensitiveDiff`, the blueprint descriptor and registry, the `fixture-node`
blueprint, and the Drizzle schema against P1's Postgres. **80 tests.** The design is
approved and complete.
Seven throwaway spikes de-risk it; **four are done — S7, S2, S1 and S3 — and all four
answered yes**, each far inside its timebox, with every spec change they implied
already applied. The remaining three are scheduled later, against machinery that does
not exist yet.

**Three implementation plans are complete** — P1, the local substrate (13 tasks,
**all executed**), P2, the control-plane spine (21 tasks, **eleven executed**), and
P3, the Docker driver and deploy spine (19 tasks). **P4 and P5 are unwritten, and that
is deliberate: on 2026-09-04 the project stopped writing plans and started executing
them.** P1's execution vindicated that decision — 13 tasks produced **18 defects** in
a plan that had already been self-reviewed, and a third of them were *checks that
passed while the thing under test was broken or absent*. **P2's Tasks 2–8 then
produced 20 more**, including a `pnpm format` that would have rewritten the approved
spec and a blueprint Dockerfile that could not build at all. **P2 Tasks 12–21 are the
current work.**

## Where to start

**Everyone starts here:** [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md).
It assumes no context and carries what the project is, what has been established, what
this machine will do to you, and what to do next. Then:

| If you are… | Read |
|---|---|
| Running the platform | [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md) — `make seed && make host-setup && make up` |
| Finishing P2 (**the current job**) | ORIENTATION §7b, then [`docs/superpowers/plans/2026-08-29-p2-control-plane-spine.md`](docs/superpowers/plans/2026-08-29-p2-control-plane-spine.md) — **Tasks 12–21**; 1–11 are executed |
| Executing any plan | The plan itself. It is self-contained by construction; if it is not, that is a defect in the plan — fix it there |
| Writing the next plan (**P4, and not yet**) | ORIENTATION §7c, then [`docs/superpowers/plans/2026-08-29-plan-roadmap.md`](docs/superpowers/plans/2026-08-29-plan-roadmap.md). It is held until P3 executes |
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
