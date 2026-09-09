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
BuildKit, LiteLLM against host Ollama, and the Manifest IdP. `make doctor` is now
**16 checks / 0 failed** and `make verify` **44 / 0**, and both were green **with the
network off** when P1 was executed. `https://console.manifest.internal/` returns the same hostname and
scheme from the host browser and from inside a container — no port, no certificate
warning. See [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md).

**P2 is executed and green as of 2026-09-05 — all 21 tasks.** The control plane
serves HTTP on **7100**: the `manifest.yaml` schema and its machine-actionable
errors, policy validation, blueprints, the §11 `Driver` interface with an in-memory
fake and the contract suite P3 inherits unchanged, the instance state machine, the
Drizzle schema against P1's Postgres, signed session cookies with a dev-only auth
shim, the §13 capability model, a local bare-repo source driver, immutable releases,
and a Fastify surface with D23.6 idempotency keys and the D23.7 error envelope on
every failure. The whole faculty lifecycle — project, spec, build, release, staging
deploy to healthy, production correctly refused with its §13 checklist — runs against
the fake driver in **~300 ms**, and against **real Docker** through `make demo`.
**439 tests with no Docker, and 108 more that need a daemon.** See
[*Running the control plane*](#running-the-control-plane) below.

The design is approved and complete.
Seven throwaway spikes de-risk it; **five are done — S7, S2, S1, S3 and S6 — and all
five answered yes**, each far inside its timebox, with every spec change they implied
already applied. S6 ran as P3's Task 18 on 2026-09-07: every probe denied, every
denial paired with a positive control. The remaining two — S5 (an agent in a sandbox)
and S4 (wake-on-request) — are scheduled later, against machinery that does not exist
yet. **Nothing is waiting on a spike.**

**Three implementation plans are complete and ALL THREE HAVE RUN IN FULL** — P1, the
local substrate (13 tasks), P2, the control-plane spine (21 tasks), and P3, the
Docker driver and deploy spine (19 tasks, **finished 2026-09-07**). `make demo` takes
an application from a bare git repository to a healthy
`https://fixture-app.staging.manifest.internal` — and does it again from a dropped
database, a deleted repository root and an emptied registry. **P4a is part-executed —
Tasks 1–7 of 15 are done and green (6–7 on 2026-09-09): a real CWL login works end to
end — through a Service Provider registration the control plane derives and writes
itself — and every service credential is envelope-encrypted in Postgres rather than
derived. Continuing P4a at Task 8 is the current work**, in seven agreed sittings of one session each. P4b is written and unrun;
P5 is unwritten. On
2026-09-04 the project stopped writing plans and started executing them, and that
hold is now discharged.

P4 was split in two on 2026-09-07. **P4a** — identity, secrets and the §8 injection
contract, 15 tasks — takes the proof app from a bare repository to a real CWL sign-in.
**P4b** — AI, events, streaming and incidents, 16 tasks — takes it from there to an
answer from a language model. **Execute P4a first**: P4b was written ahead of P4a's
execution and its own Task 1 is a reconciliation pass against the executed P4a.
Writing P4a found **four live defects the green gates could not see**, including that
the Manifest IdP could not issue a SAML assertion at all — and **executing its first
three tasks found fourteen more**, including that the IdP could not authenticate
anybody either, and that §12's dependency-scan gate blocked **every** CWL application
because `passport-ubcshib` depends on a deprecated library with an unfixable critical
advisory. Rich settled that on 2026-09-08: the gate blocks on findings that have a
published fix. Writing P4b found that
**`ghcr.io/berriai/litellm:main-stable` is a moving tag nothing pins**, and that one
thing §10 requires cannot be implemented at the LiteLLM version in use.

Execution vindicated that decision three times over. P1's 13 tasks produced **18
defects** in a plan that had already been self-reviewed, a third of them *checks that
passed while the thing under test was broken or absent*. P2's Tasks 2–8 produced
**20 more**, including a `pnpm format` that would have rewritten the approved spec.
P2's Tasks 12–21 produced **27 more** — six type errors **no test could catch**,
because Vitest strips types without checking them; five test-isolation defects that
made the suite pass or fail on the order Vitest happened to pick; and two safety
mechanisms that turned out to be **one edit from a live authentication bypass and a
live IDOR**, both of which answered `200` when broken. And P3 produced **82 across 19
tasks — 4.3 per task**, the highest rate measured here.

**P3's last two sessions are the ones worth reading**, because each was the first time
something ran end to end. Session 4 found that **no build in this platform had ever
succeeded** and that D13's npm-mirror control was completely inert. Session 5 found
that **no deploy had ever succeeded either** — seven separate defects of a single
shape, *the test constructs the value correctly and the running system re-derives it
wrongly* — every one of them green behind a suite of 74 passing Docker tests.
**Continuing P4a at Task 8 is the current work.**

## Where to start

**Everyone starts here:** [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md).
It assumes no context and carries what the project is, what has been established, what
this machine will do to you, and what to do next. Then:

| If you are… | Read |
|---|---|
| Running the platform | [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md) — `make seed && make host-setup && make up` |
| Understanding what the Docker half does | ORIENTATION §7c, then [`docs/superpowers/plans/2026-08-31-p3-docker-driver-deploy-spine.md`](docs/superpowers/plans/2026-08-31-p3-docker-driver-deploy-spine.md) — all 19 tasks executed. Read its *What executing this plan found*, Sessions 4 and 5 |
| Running the control plane | [*Running the control plane*](#running-the-control-plane) below — `make up`, then `pnpm --filter @manifest/control-plane dev` |
| Executing any plan | The plan itself. It is self-contained by construction; if it is not, that is a defect in the plan — fix it there |
| **Continuing P4a at Task 8 — the current job** | ORIENTATION §7d, then [`docs/superpowers/plans/2026-09-07-p4a-identity-secrets-injection.md`](docs/superpowers/plans/2026-09-07-p4a-identity-secrets-injection.md), 15 tasks, **1–7 executed, 6–7 on 2026-09-09**, the rest in seven agreed sittings. Read P4a's own *What executing this plan found* first — Sessions 1, 2, 2b, 3 and 4, 35 defects — then P3's Sessions 4 and 5. **Do not start P4b**: it is written, and its own first task reconciles it against a P4a that has already run |
| Seeing the platform actually work | `make demo`, after `make up` and starting the control plane. [`RUNBOOK.md`](docs/superpowers/RUNBOOK.md) has the nine steps it runs and the offline control |
| Looking for what a spike proved | `docs/superpowers/spikes/S{7,2,1,3,6}-findings.md` — the answer is the first sentence of each |
| Looking for the architecture | [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](docs/superpowers/specs/2026-08-29-manifest-platform-design.md) — authoritative, ~2,340 lines. ORIENTATION §3 tells you which sections you actually need |
| Explaining this to someone non-technical | [`manifest-schematic.html`](docs/superpowers/specs/manifest-schematic.html) and its companions — the same design in plain language, plus six worked faculty stories |
| Tracking the UBC reviews | [`docs/external-track.md`](docs/external-track.md) — the items decided by people outside this team, which carry the longest lead times in the project |

## Running the control plane

Requires P1's substrate (`make up`) — Postgres on 7103, the registry, the edge and
its admin API, and the registry issuer keypair `make up` generates. **The control
plane now constructs the Docker driver** (P3 Task 15), so it needs the Docker socket
and refuses to boot without the issuer.

Run these **from the repo root** — `MANIFEST_BLUEPRINTS_ROOT` and
`MANIFEST_REPOS_ROOT` are read as given, and `pnpm --filter` runs with the *package*
directory as its working directory, so relative paths there point at the wrong
place. The issuer paths are no longer among them: they resolve against the
repository root, because the documented command below could not otherwise find
them.

```bash
set -a; . ./.env; set +a   # make seed writes .env; the password is NOT "manifest"
export MANIFEST_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
# The IdP metadata database is a SECOND, required setting — never derived from
# the line above by swapping the name (P4a Decision 13).
export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
export MANIFEST_SESSION_SECRET=$(openssl rand -hex 32)
export MANIFEST_DEV_AUTH=1
export MANIFEST_BLUEPRINTS_ROOT="$PWD/blueprints"
export MANIFEST_REPOS_ROOT="$PWD/.manifest/repos"
# MANIFEST_MASTER_SECRET comes from .env. Every backing-service credential is
# derived from it, so it must be STABLE — a value that changes between restarts
# cannot reproduce the password an existing database container already holds.

pnpm --filter @manifest/control-plane db:migrate
pnpm --filter @manifest/control-plane dev      # tsc, then node dist/index.js
```

It listens on `http://127.0.0.1:7100` and prints one line saying which driver it
built. **Read it** — every acceptance in P3 is meaningless if it says `fake`:

```
{"driver":"docker","port":7100,"msg":"control plane ready"}
```

Verified end to end on 2026-09-05:

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
