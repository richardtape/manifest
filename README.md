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
**18 checks / 0 failed** and `make verify` **51 / 0**, and both were green **with the
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
**1355 tests with no Docker, and 178 more that need a daemon** — nothing skipped, since P4c Task 5 gave the Docker driver the fixtures for the driver contract's continuity block. See
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
2026-09-15: a failed deploy produces §14's `Incident`, shaped as a repair prompt, every build, deploy, Incident and AI key rotation streams over `WS /projects/:projectId/events`, and `make demo-ai` shows the proof app answering a question from the asker's own notes, charged to that one person — from a `make reset` machine too; its offline run is Rich's as well.** P4c — zero-downtime redeploys, placed straight after P4b by Rich on 2026-09-14 — is **EXECUTED AND GREEN — all 11 tasks in eight sittings, finished 2026-09-16: the platform redeploys an app without interrupting anybody or signing anybody out, puts its routes back at its own boot, and `make demo-redeploy`, its acceptance, is green from a `make reset` machine**. P5 is three plans — Rich split it into P5a (the contract), P5b (delegated tokens) and P5c (the clients) — and P5a is written; its sitting 1, the measurements, ran on 2026-09-16, and so did sitting 2 — every resource route is under `/v1`, and the API is reached at `https://console.manifest.internal` through the edge, refused to every source but the host — and sitting 3: a request carrying a session must come from the console's origin, a sign-in completes only in the browser that started it, and every error code a client can receive is in one registry. And sitting 4: every `/v1` route is to be declared once, through `defineRoute`, and the OpenAPI document at `packages/contract/openapi.json` is generated from those declarations and held to them by a test — `GET /v1/me` is the first. And sitting 5: `@manifest/contract`, a TypeScript client generated from that document, and `make demo-journey`, which calls it through the edge. And sitting 6: projects, environments, members and specs answer public representations — no database column leaves — and §23's reserved labels are loaded at boot behind `GET /v1/slugs/{slug}`, which tells a person whether a project name will work with exactly the answer creation gives. And sitting 7: §16's proof app is now `node-ts-mongo@1`'s first *starter*, `GET /v1/blueprints` lists what a person chooses from with each blueprint's knowledge pack, and a project is created from a blueprint's skeleton and a starter for a stated audience, saying so on its event stream. And sitting 8, on 2026-09-17: every event the platform records has a payload schema it is refused without, those schemas are the contract's description of the event stream, and the generated client can subscribe to it — `make demo-journey` watches a new project's provisioning. And sitting 9: a build answers `202` and finishes on the event stream, with §12's scan recorded on it. And sitting 10: releases, deploys and Incidents answer public representations too, so **every `/v1` route is now a definition** — a release names its env vars without their values, and a deploy's states are stored and streamed. And sitting 11: §13's first-launch checklist is **computed** from what a project has, read-only, and the production refusal carries it; the first administrator is made **out of band** and the change audited; and an administrator reads every app on the platform at `GET /v1/fleet`. **And sitting 12, on 2026-09-17: P5a's acceptance — `make demo-journey`, §22's journey driven through the edge by nothing but the generated client — ran green THREE TIMES, the third from a `make reset` machine, and it is now step 8 of the offline acceptance. P5a IS EXECUTED — and P5b, delegated tokens and pending actions, was written the same day: 13 tasks in nine sittings. Its sitting 1, the measurements, ran on 2026-09-17 with 11 findings and corrected five of its own tasks — a token would have escaped its scope on `GET /v1/projects`, and the central refusal as drafted would have deadlocked D24's confirm-and-retry loop through the idempotency cache. Its four spec actions were approved and applied the same day. And its sitting 2, the same day: D24's four privileged capabilities are named once with the alignment test §20 asks for, promoting a release to production is a capability of its own — refused to a collaborator before the launch gate is ever consulted — and the two token tables exist with the module that mints, parses and verifies a delegated token. Sitting 2 found that the plan's own token parser would have refused 47.5% of the tokens it minted, because base64url's alphabet contains the character it split on. Sittings 3 to 7 followed: an agent holding a token authenticates with it and acts on its one project; asking for one of D24's privileged four is refused centrally and becomes a question a person confirms or rejects, a confirmation granting that exact request one retry; the questions are readable as a queue and every request a token makes is rate-limited from its own row; removing a member exists at last; and a question nobody answers in time is swept to `expired` by the boot, with the database now refusing a second open ask for the same thing. **And sitting 8, the same day: `make demo-token` runs D24's whole loop end to end through the edge** — an instructor signs in with CWL and mints a delegated token, an agent holding nothing but that token builds and deploys a real application on its own authority, is refused the fleet and a promotion to production, asks to add a member and is handed the question a person must answer, and its own retry succeeds exactly once; a fresh ask is rejected in the instructor's own words and the token is revoked. It is the first client any of these routes has had outside a test harness, and both of its worst findings were in the CLIENT rather than the platform — the generated client's event stream could not carry a delegated token at all, so an agent could start a build and had nothing to watch it end on. **Sitting 9 — Task 13, the acceptance, alone and last — is the next job.** On
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
**P4a, P4b and P4c are finished — 2026-09-09, 2026-09-15 and 2026-09-16. P5a — the contract, the first of P5's three plans — is written (2026-09-16), its sittings 1 (the measurements), 2 (the API under `/v1`, through the edge at `https://console.manifest.internal`) 3 (CSRF by `Origin`, a sign-in bound to its browser, the error-code registry) 4 (`defineRoute`, and the OpenAPI document generated from it) 5 (the client generated from that document, and `make demo-journey`) 6 (projects as public representations, and the slug check) and 7 (starters, the knowledge pack, and creation from a starter for a stated audience) are done the same day, and so is 8 (the event stream in the contract), on 2026-09-17, 9 (builds that answer `202` and end on the stream, each recording §12's scan) and 10 (releases, deploys and incidents as representations — so every `/v1` route is now a definition — with the instance's states stored and streamed, which took `make demo-journey` through §22 step 6) and 11 (§13's `LaunchReadiness` computed and read-only, the first administrator made out of band and audited, and §26's fleet — which took `make demo-journey` through **step 8**), the same day; and **sitting 12 — the acceptance — on 2026-09-17, which ran `make demo-journey` green three times, the third from a `make reset` machine. P5a IS EXECUTED, all 17 tasks, 146 findings. **P5b IS EXECUTED TOO — all 13 tasks in nine sittings, 116 findings, finished 2026-09-18.** `make demo-token` runs D24's whole loop end to end through the edge: a person mints a delegated token, an agent holding it builds and deploys a real application on its own authority, is refused the things it may not do, and gets past one of them only because a person confirmed that exact request, once. **Its acceptance ran green three times, the third from a `make reset` machine, and it is step 9 of the offline acceptance.** **P5c — the clients — IS WRITTEN (2026-09-18) AND EXECUTING: 14 tasks in nine agreed sittings.** It is the last plan of Phase 1c: `manifest-mock`, `console/` behind its import boundary, and the CI acceptance script. **Which sitting is next is stated in the *Where to start* table below and in [ORIENTATION §7e](docs/superpowers/ORIENTATION.md), and deliberately not here** — this sentence said *"none of them has run"* and *"the next job is its sitting 1"* for four sittings after both stopped being true, while the table below was swept correctly. A forward pointer that names a number decays; one that names where the number lives does not. *How many sittings are done, and what each one found, is in the plan's own sittings table and in the row below — this paragraph deliberately stops enumerating them, because a list restated in two places drifts and this one did. The plan's four spec actions are applied.*

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
| **Executing P5c — the current job** | **[P5c, the clients](docs/superpowers/plans/2026-09-18-p5c-the-clients.md)** — WRITTEN 2026-09-18 and **NOW EXECUTING: sittings 1 to 5 are DONE, 2026-09-18/19, with 19, 10, 9, 9 and 13 findings; 6 of its 14 tasks remain. §22 STEPS 1 TO 5 ARE CLICKED, AND STEP 6 AS FAR AS THE SIGN-IN — `https://console.manifest.internal` serves a real console, a person signs in with CWL, creates a project by typing a name that is checked as they type, watches that project's events arrive on a live socket, BUILDS it and reads the log lines as they are written, releases it, DEPLOYS it to staging watching the instance states arrive, and opens the running application to sign in to it with CWL. Step 6 also says *write a note; ask the LLM*, which is `make demo-ai`'s ground and Task 14's, not this sitting's.** It is the last plan of Phase 1c and its three deliverables are `manifest-mock`, `console/` behind an import boundary, and the CI acceptance script. **[ORIENTATION §7e](docs/superpowers/ORIENTATION.md) is the hand-off, and it names which sitting is next rather than this row doing it twice.** The heavy sitting is behind us: sitting 5 carried both streaming screens, which is what the lean nine-sitting split cost, and it found that **the stream alone is not the log** — build log frames are never replayed, so a screen that reads only the socket is empty for anyone who did not watch the build live. Read the plan's *Read this first*, *Decisions Rich made* and *Decisions this plan makes* before starting, plus the `[M1][M2][M6]` correction block sitting 1 put at the top of Task 4 — **five paragraphs, and the last one is the Caddyfile bind-mount procedure.** **THE ONE SITTING WITH THE NETWORK ON IS OVER**: sitting 2 installed React 19.3.0, Vite 8.3.0, `ws` 8.21.3, `ajv` 8.20.0 and `ajv-formats` 3.0.1, all exact, and nothing after it may add a package. **Sitting 2 also made the console's import boundary refuse things before a single screen exists** — including the half a lint rule cannot see, a screen calling `fetch('/v1/projects')` without importing anything, which `pnpm lint` stays green through. **Sitting 3 served the console and swept the four shared HTML pages**, whose "no user interface has been built yet" it made false; nothing in the build checks them. **Its sharpest finding is that Task 4's own control table was wrong about its coverage** — it said no test sees the Caddyfile's console line, and `make doctor` and `make verify` BOTH went red on their first run after the change, the first being the identical defect this project fixed for port 7100 in 2026-09-07. **Sitting 1 closed §8's `stream_close_delay` question with the measurement Rich asked for** — an app's WebSocket IS cut by any other app's deploy, so `routing/caddy.ts` now carries the field — **and found that the plan's own snippet for that measurement would have answered it backwards**, because it drives the Caddy admin API with node's `fetch` (refused `403`) and checked neither `r.ok` nor `r.status`. **Before it**: [P5b, delegated tokens](docs/superpowers/plans/2026-09-17-p5b-delegated-tokens.md) — **EXECUTED 2026-09-18, 13 tasks in nine sittings, 116 findings**, whose acceptance `make demo-token` drives D24's whole loop through the edge; and [P5a, the contract](docs/superpowers/plans/2026-09-16-p5a-the-contract.md) — **EXECUTED 2026-09-17 with 146 findings**, whose `make demo-journey` drives §22's journey through nothing but the generated client. **Read P5b sitting 9's record and P5a sitting 12's before trusting any green negative control**: between them they found four controls that could not fail as written, and one prediction that a control would be invisible which was wrong in the direction that mattered. |
| Seeing the platform actually work | `make demo` (an app, from a bare repository to a URL), **`make demo-identity`** (a real CWL sign-in whose note nobody else can see), **`make demo-ai`** (the same app answering a question from the asker's own notes, charged to them) and **`make demo-redeploy`** (the same app redeployed twice and failed once while a signed-in student keeps asking, with nothing interrupted) and **`make demo-journey`** (§22's journey through the client generated from the OpenAPI document — **all eight steps**: it creates `journey-app` from a starter, builds it, deploys it, signs in inside it, asks for production and reads the fleet), after `make up` and starting the control plane. [`RUNBOOK.md`](docs/superpowers/RUNBOOK.md) has all five, step by step |
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
