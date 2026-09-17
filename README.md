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
**18 checks / 0 failed** and `make verify` **50 / 0**, and both were green **with the
network off** when P1 was executed. `https://console.manifest.internal/` returned the same hostname and
scheme from the host browser and from inside a container — no port, no certificate
warning. *(Since P5a Task 3 that name is the console's origin, refused to every source but
the host, so `make verify` proves the same parity on `https://edge.manifest.internal/`.)* See [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md).

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
**956 tests with no Docker, and 168 more that need a daemon** — nothing skipped, since P4c Task 5 gave the Docker driver the fixtures for the driver contract's continuity block. See
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
database, a deleted repository root and an emptied registry. **P4a IS EXECUTED IN FULL —
all 15 tasks, green, 2026-09-09: a real CWL login works end to
end — through a Service Provider registration the control plane derives, writes and now
calls from `deployRelease` — every service credential is envelope-encrypted in Postgres
rather than derived, §20's audit log is append-only by grant against a
least-privilege role, §8's environment injection contract is one function with one
producer, so a deployed app is finally told the name of the database its credentials
were minted for, and **`node-ts-mongo@1` — the blueprint faculty applications are
generated from — builds, deploys and issues a real CWL AuthnRequest**, with §16's drift
tier asserting §8's table against the blueprint's own source. **Since Task 14 Manifest
logs its OWN users in with CWL too** — §9's first sentence is that Manifest is itself an
SP — through a registration the control plane writes at its own boot, and
`POST /auth/dev-login`, an unauthenticated route that minted real sessions, is deleted.
And since Task 15, **`make demo-identity` takes §16's proof app from a bare repository
to a real CWL sign-in in which the instructor cannot see the student's note** — the
acceptance is not that a login happened, it is that the application knows who. It ran
green from a `make reset` machine; the offline run is outstanding and is Rich's.
P4b is now EXECUTED AND GREEN — all 16 tasks, in ten sittings, 2026-09-09 to
2026-09-15: a failed deploy produces §14's `Incident`, shaped as a repair prompt, every build, deploy, Incident and AI key rotation streams over `WS /projects/:projectId/events`, and `make demo-ai` shows the proof app answering a question from the asker's own notes, charged to that one person — from a `make reset` machine too; its offline run is Rich's as well.** P4c — zero-downtime redeploys, placed straight after P4b by Rich on 2026-09-14 — is **EXECUTED AND GREEN — all 11 tasks in eight sittings, finished 2026-09-16: the platform redeploys an app without interrupting anybody or signing anybody out, puts its routes back at its own boot, and `make demo-redeploy`, its acceptance, is green from a `make reset` machine**. P5 is three plans — Rich split it into P5a (the contract), P5b (delegated tokens) and P5c (the clients) — and P5a is written; its sitting 1, the measurements, ran on 2026-09-16, and so did sitting 2 — every resource route is under `/v1`, and the API is reached at `https://console.manifest.internal` through the edge, refused to every source but the host — and sitting 3: a request carrying a session must come from the console's origin, a sign-in completes only in the browser that started it, and every error code a client can receive is in one registry. And sitting 4: every `/v1` route is to be declared once, through `defineRoute`, and the OpenAPI document at `packages/contract/openapi.json` is generated from those declarations and held to them by a test — `GET /v1/me` is the first. And sitting 5: `@manifest/contract`, a TypeScript client generated from that document, and `make demo-journey`, which calls it through the edge. And sitting 6: projects, environments, members and specs answer public representations — no database column leaves — and §23's reserved labels are loaded at boot behind `GET /v1/slugs/{slug}`, which tells a person whether a project name will work with exactly the answer creation gives. And sitting 7: §16's proof app is now `node-ts-mongo@1`'s first *starter*, `GET /v1/blueprints` lists what a person chooses from with each blueprint's knowledge pack, and a project is created from a blueprint's skeleton and a starter for a stated audience, saying so on its event stream. Sitting 8 is next. On
2026-09-04 the project stopped writing plans and started executing them, and that
hold is now discharged.

P4 was split in two on 2026-09-07. **P4a** — identity, secrets and the §8 injection
contract, 15 tasks — takes the proof app from a bare repository to a real CWL sign-in.
**P4b** — AI, events, streaming and incidents, 16 tasks — takes it from there to an
answer from a language model. **Execute P4a first**: P4b was written ahead of P4a's
execution and its own Task 1 is a reconciliation pass against the executed P4a.
Writing P4a found **four live defects the green gates could not see**, including that
the Manifest IdP could not issue a SAML assertion at all — and **executing all
fifteen found 80 more — 5.3 per task, the highest rate measured here**, including that
the IdP could not authenticate anybody either, and that §12's dependency-scan gate blocked **every** CWL application
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
**P4a, P4b and P4c are finished — 2026-09-09, 2026-09-15 and 2026-09-16. P5a — the contract, the first of P5's three plans — is written (2026-09-16), its sittings 1 (the measurements), 2 (the API under `/v1`, through the edge at `https://console.manifest.internal`) 3 (CSRF by `Origin`, a sign-in bound to its browser, the error-code registry) 4 (`defineRoute`, and the OpenAPI document generated from it) 5 (the client generated from that document, and `make demo-journey`) 6 (projects as public representations, and the slug check) and 7 (starters, the knowledge pack, and creation from a starter for a stated audience) are done the same day, and executing sitting 8 is the current work.**

## Where to start

**Everyone starts here:** [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md).
It assumes no context and carries what the project is, what has been established, what
this machine will do to you, and what to do next. Then:

| If you are… | Read |
|---|---|
| **Seeing it run end to end, in a browser** | [`docs/superpowers/WALKTHROUGH.md`](docs/superpowers/WALKTHROUGH.md) — start it, deploy the demos, what to open and with which test users, how to check and test it |
| Running the platform | [`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md) — `make seed && make host-setup && make up` |
| Understanding what the Docker half does | ORIENTATION §3's *The code* and §7a's P3 row, then [`docs/superpowers/plans/2026-08-31-p3-docker-driver-deploy-spine.md`](docs/superpowers/plans/2026-08-31-p3-docker-driver-deploy-spine.md) — all 19 tasks executed. Read its *What executing this plan found*, Sessions 4 and 5 |
| Running the control plane | [*Running the control plane*](#running-the-control-plane) below — `make up`, then `pnpm --filter @manifest/control-plane dev` |
| Executing any plan | The plan itself. It is self-contained by construction; if it is not, that is a defect in the plan — fix it there |
| **Executing P5a — the current job** | **[The P5a plan](docs/superpowers/plans/2026-09-16-p5a-the-contract.md)** — 17 tasks in **twelve agreed sittings, one per session**, written 2026-09-16 from [the P5 brief](docs/superpowers/plans/2026-09-16-p5-brief.md); **sitting 1 (Task 1, the measurements) is done — 2026-09-16, 9 findings, in [`spikes/p5a-baseline/`](docs/superpowers/spikes/p5a-baseline/README.md) — and so are sitting 2 (Tasks 2–3: the API under `/v1`, through the edge), 16 findings, and sitting 3 (Tasks 4–5: CSRF by `Origin` and the error-code registry), 15; sitting 4 (Task 6: `defineRoute` and the generated OpenAPI document), 7; sitting 5 (Task 7: the generated client and `make demo-journey`), 4; sitting 6 (Tasks 8–9: projects as public representations and the slug check), 13; sitting 7 (Tasks 10–11: starters, the knowledge pack, and a project created from a starter for a stated audience), 18; sitting 8 (Task 12, the event stream in the contract) is next**, and [ORIENTATION §7e](docs/superpowers/ORIENTATION.md) says what to read first. It has moved the API to `https://console.manifest.internal/v1`, and generates the OpenAPI document and a TypeScript client from the routes, and ends with `make demo-journey` — §22's journey driven through the edge by nothing but that client. P5b (delegated tokens) and P5c (the clients) are written after it executes. **Before it**: [P4c](docs/superpowers/plans/2026-09-15-p4c-zero-downtime-redeploys.md) — zero-downtime redeploys, 11 tasks in eight agreed sittings — **finished 2026-09-16 with 70 findings**. Its last sitting ran the acceptance green three times, once from a `make reset` machine, and found that **four of its nine negative controls could not fail in it** — each is now watched red where it can be; read its sitting-8 record before trusting a green `make demo-redeploy` to prove any of them. Its brief, with the measurements behind it, is [`2026-09-15-p4c-brief.md`](docs/superpowers/plans/2026-09-15-p4c-brief.md) |
| Seeing the platform actually work | `make demo` (an app, from a bare repository to a URL), **`make demo-identity`** (a real CWL sign-in whose note nobody else can see), **`make demo-ai`** (the same app answering a question from the asker's own notes, charged to them) and **`make demo-redeploy`** (the same app redeployed twice and failed once while a signed-in student keeps asking, with nothing interrupted) and **`make demo-journey`** (§22's journey through the client generated from the OpenAPI document — growing, steps 1, 2, 2a and 2b so far, and it creates `journey-app`), after `make up` and starting the control plane. [`RUNBOOK.md`](docs/superpowers/RUNBOOK.md) has all five, step by step |
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
# The control plane connects as `manifest_app`, NOT as `manifest`. `manifest` is
# POSTGRES_USER and therefore a SUPERUSER, and a superuser bypasses every
# privilege check — which makes §20's append-only `audit.events` grant
# unimplementable. `make up` creates the role (infra/lib/ensure-app-role.sh).
export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
# Admin, for DDL only: `db:migrate` below, and the test harness's TRUNCATE. Never
# read by src/ — the control plane has no code path that needs it.
export MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
# The IdP metadata database is a THIRD, required setting — never derived from
# either line above by swapping the name (P4a Decision 13). It has its own roles:
# `ssp_ro` reads, `manifest` writes, and there is no `manifest_app` in it.
export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
export MANIFEST_SESSION_SECRET=$(openssl rand -hex 32)
export MANIFEST_BLUEPRINTS_ROOT="$PWD/blueprints"
export MANIFEST_REPOS_ROOT="$PWD/.manifest/repos"
# The key that mints and revokes every app's LiteLLM key (§10). ONE stored secret:
# LiteLLM reads LITELLM_MASTER_KEY from .env, and this names the same value for the
# control plane. Required outside development; never add a second copy to .env.
export MANIFEST_LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}"
# MANIFEST_MASTER_SECRET comes from .env. Every backing-service credential is
# derived from it, so it must be STABLE — a value that changes between restarts
# cannot reproduce the password an existing database container already holds.

pnpm --filter @manifest/control-plane db:migrate
pnpm --filter @manifest/control-plane dev      # tsc, then node dist/index.js
```

It listens on `127.0.0.1:7100` and **is reached at `https://console.manifest.internal`**,
through the edge (§21, P5a Task 3): the edge forwards `/v1/*` and `/auth/*` to it and refuses
every source but the host, so a container — an app included — gets `403 manifest: the control
plane is not reachable from this network`. It prints one line saying which driver it built
and where it is reached. **Read it** — every acceptance in P3 is meaningless if it says
`fake`, and a sign-in completes only at the origin it names:

```
{"driver":"docker","port":7100,"origin":"https://console.manifest.internal","ai":"enabled",…,"msg":"control plane ready"}
```

**Restart the control plane after `make up` applies a Caddyfile change, and after
`pnpm test:docker`.** Either one drops the edge's runtime routes, and the Docker tier also
re-registers the platform's SP row at a loopback ACS, so a sign-in through the console fails
at the ACS comparison until the control plane's boot puts both back.

Verified end to end on 2026-09-05:

```bash
curl -s https://console.manifest.internal/v1/me
# {"error":{"code":"UNAUTHENTICATED","message":"a session is required","hint":"Log in first."}}

# §9: Manifest is its own SP, so logging in is a real CWL round trip against the
# Manifest IdP. `scripts/demo.sh` step 1 drives all three hops with curl; in a
# browser, just open https://console.manifest.internal/auth/login and sign in as
# `instructor` / `instructor` (D6 — the IdP serves TEST USERS ONLY).
curl -s -o /dev/null -w '%{redirect_url}\n' https://console.manifest.internal/auth/login
# https://idp.manifest.internal/module.php/saml/idp/singleSignOnService?SAMLRequest=…&Signature=…

curl -s -b /tmp/jar -X POST -H 'content-type: application/json' \
  -H "idempotency-key: $(uuidgen)" -H "origin: https://console.manifest.internal" \
  -d '{"slug":"boot-check","blueprint":"fixture-node@1","audience":{"scale":"solo","burst":"steady"}}' \
  https://console.manifest.internal/v1/projects
```

**`audience` is required** (§24, P5a Task 11) — `scale` is `solo`, `class`, `large_course` or
`public`, `burst` is `steady` or `synchronised` — and `starter` is optional: `GET /v1/blueprints`
lists what each blueprint offers, and `node-ts-mongo@1`'s `proof-app` seeds §16's proof app over the
skeleton. The answer carries the project, its environments and `spec` — the validation of the
manifest its first commit carries — and the project's event stream has `project.created`,
`repository.seeded` and `spec.validated`.

**A mutation carrying a session is refused `403 CSRF_ORIGIN_REFUSED` without that `origin`
header** (§20, P5a Task 4), and so is an event-stream upgrade: every deployed app is
same-site with the console, so a session cookie alone proves nothing about which page sent
the request. A browser on the console sends it itself; a script sets it, as
`scripts/lib/api.sh` does. A sign-in lands on `/`, or on the same-origin path it was started
with — `https://console.manifest.internal/auth/login?returnTo=/v1/me` — and it completes only
in the browser that started it: the callback refuses an assertion whose `RelayState` is not
the nonce in that browser's `manifest_login` cookie (`401 SAML_LOGIN_NOT_BOUND`).

**`node src/index.ts` does not work**, though Node 24 strips types natively: the
source uses NodeNext `.js` specifiers, which Node resolves literally rather than
mapping back to `.ts`. Hence the build step.

**There is no login shim any more.** `POST /auth/dev-login` and `MANIFEST_DEV_AUTH`
were deleted in P4a Task 14: the route minted a real session for a named test user
with no credential of any kind, and P2 measured that its only protection was a
registration guard — removing that one condition made it answer 200 with a live
session. Manifest logs its own users in with CWL (§9), and the test suite signs its
own sessions in-process (`identity/testing.ts`), which needs no HTTP surface.

**The control plane registers its own Service Provider at boot**, through the same
`renderSpMetadata` every deployed app's row goes through — entityID
`https://manifest.internal/sp/manifest-control-plane/platform`, ACS
`https://console.manifest.internal/auth/saml/callback`. It is built from
`MANIFEST_CONTROL_PLANE_ORIGIN`, which defaults to `https://console.manifest.internal` —
the console's origin, through the edge — and becomes the console's production origin at
UBC; `loadConfig` refuses a loopback origin whose port is not `MANIFEST_PORT` (the Docker
tier boots control planes at loopback origins). The session cookie is `Secure` whenever the
origin is `https`, in development too. The
keypair it signs with is `infra/sp/control-plane.{key,crt}`, minted by `make up`,
gitignored, and — like the IdP keypair and the envelope master key — **not removed by
`make reset`**.

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
