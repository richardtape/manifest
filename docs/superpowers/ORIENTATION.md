# Orientation — read this first

**Manifest's design is finished, six implementation plans are executed — P1, P2, P3, P4a, P4b and P4c — and the seventh, P5a (the contract), is being executed one sitting per session. The next job is always §7e.** This is the single entry point: what Manifest is, where things stand, how the platform is built, what the machine will do to you, how to work here, and what to do next. It is written for someone with **no prior context** — a new agent with a fresh window, or a developer joining.

*Last verified 2026-09-16.* **Three places state current status — §2, §7e and §8 — and a sitting's sweep REPLACES what they say; it never appends a sitting's story here** (§6). **The roadmap's ledger outranks all three.** Everything else is durable.

**Short of context? Read §7e, §2's numbers box, §6, and the newest entries at the end of §4's *Things that will cost you a morning*, in that order.** §4 is most of this file and is meant to be searched, not read through.

---

## 1. What Manifest is, in four sentences

Manifest is a self-hosted internal developer platform for UBC. A faculty member
describes an application in plain language, an AI agent builds it, and Manifest
deploys it — authenticated with UBC's CWL single sign-on, running on UBC
infrastructure — without the faculty member ever seeing a container or a YAML file.

The design is **approved and complete**. The whole platform must run on one laptop,
offline after a one-time seeding step, and that constraint (**C1**) shapes almost
everything.

---

## 2. Where things stand

**Five spikes are done — S7, S2, S1, S3 and S6 — and all five answered yes (§5); S5 and S4 are deliberately later. Six plans are executed, and each has an acceptance that passes:**

| Plan | Executed | What it made true | Acceptance |
|---|---|---|---|
| P1 | 2026-09-05 | The platform runs on one laptop, offline after `make seed` | `make doctor`, `make verify` |
| P2 | 2026-09-05 | The control plane serves the API on 7100 | its unit tier |
| P3 | 2026-09-07 | An app goes from a bare repository to a URL, through the Docker driver and the edge | `make demo` |
| P4a | 2026-09-09 | A real CWL sign-in; secrets stored, not derived; §8's injection contract | `make demo-identity` |
| P4b | 2026-09-15 | AI answers charged to the asker; build logs, events and Incidents | `make demo-ai` |
| P4c | 2026-09-16 | A redeploy interrupts and signs out nobody | `make demo-redeploy` |

**The current plan is P5a — the contract** ([`plans/2026-09-16-p5a-the-contract.md`](plans/2026-09-16-p5a-the-contract.md), 17 tasks in twelve agreed sittings, one per session), the first of Phase 1c's three plans. It puts the API under `/v1` at `https://console.manifest.internal` through the edge, generates an OpenAPI document from the routes and a TypeScript client from that document, and ends with `make demo-journey` driving §22's journey through nothing but that client. **Which of its sittings are done, and which is next, is its sittings table — and §7e.** P5b (delegated tokens) and P5c (the mock, the console, CI) are written only after it executes. *Sittings pace the work; they are not §17's product Phases.*

**Executing a plan finds defects at a rate that has never fallen with practice** — 18 in P1's 13 tasks, 52 in P2's 21, 82 in P3's 19, 80 in P4a's 15, 140 in P4b's 16, 70 in P4c's 11, every plan self-reviewed first. The roadmap's defect-rate table has every plan and sitting. Treat a written plan as a hypothesis (§9).

**The four numbers you will check first, measured 2026-09-16 on this machine, at the end of P5a sitting 7:**

| | |
|---|---|
| `pnpm test` (from the **repo root**) | **956 passed, 87 files**, ~57 s — the `unit` project and `packages` (the client and the journey, which need nothing running). No Docker needed except Postgres for the `db/`, `api/`, `secrets/`, `services/`, `sso/`, `observability/` and `releases/` suites, plus `spec/injection-drift`, which reads the pinned `passport-ubcshib` tarball out of the platform's own mirror. It connects as **`manifest_app`**, not as `manifest` (§3) |
| `pnpm test:docker` | **168 passed, 0 SKIPPED**, 27 files, ~771 s — re-measured at the end of P5a sitting 7 with the control plane running (S6 probe 15 `app=403 host=401`). Needs `make up`, and **fails rather than skips** when asked to run |
| `make doctor` | **18 checks, 0 failed, 0 warnings** |
| `make verify` | **50 checks, 0 failed, 0 warnings** |

**A different number on a clean checkout is signal, not noise** — it means something moved, and finding out what is cheaper before you start than after. **This box is the only current one in this file**; the same four numbers are stated in `README.md` and `RUNBOOK.md`, and all three move together (§6). A plan's record carries the numbers as each sitting left them, dated, and they deliberately do not move.

**Outstanding, and Rich's.**

- **The offline acceptance.** Turning the network off from a tool call cuts the agent off too, so `scripts/offline-acceptance.sh` is run by hand. Its step 6 runs `make demo-identity`, the step most likely to need a route out; its step 7 runs `make demo-ai`, whose open question is whether Ollama — a host application, not a container — answers with the network off. **A skipped acceptance is not a passed one.**
- **The second-machine clean clone** — no second Mac has been available; `RUNBOOK.md`'s *Known gaps* records it.
- **Starting the UBC external track** — its trigger, §16's proof app answering a question, fired on 2026-09-15 and was raised with Rich that day. [`docs/external-track.md`](../external-track.md).
- **§8's open questions.**

**The spec is current.** Every spike's and every plan's spec actions have been applied with Rich's explicit approval — most recently P5a's six (`491f8be`). **Trust the spec over the spike briefs**, which are preserved as a record of what was originally asked, and **propose any further change; never edit it** (§6).

---

## 3. The document map, the code, and what it keeps true

Read for your purpose, not front to back. The spec is ~2,340 lines; nobody reads it all.

| You are… | Read |
|---|---|
| **new, any role** | This file — §7e and §2 first. Then the roadmap's ledger and its *Lessons*. |
| **executing a plan** | **The current plan, which §7e names.** Its sittings table says which sitting is next, and its *What executing this plan found* is the record of every sitting before — read that before the task. One sitting per session, with a check-in at each boundary. A plan is self-contained by construction; if it is not, that is a defect in the plan — fix it there. |
| **writing a plan** | None is waiting: P5b is written only after P5a executes, from [`plans/2026-09-16-p5-brief.md`](plans/2026-09-16-p5-brief.md) and P5a's *What this plan does not build*. House style: [`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md), or any later plan. |
| **seeing it run end to end** | [`WALKTHROUGH.md`](WALKTHROUGH.md) — start it, deploy the demos, what to open in a browser and with which test users, how to check it, and the traps. |
| **running the platform** | [`RUNBOOK.md`](RUNBOOK.md) — `make seed && make host-setup && make up`, every demo step by step, and *Known gaps*. README's *Running the control plane* is the export block to start it with. |
| **writing code** | *The code* and *What the platform keeps true* below. **Then run `make demo` once**: it is the only thing that exercises boot, build, release, deploy and the edge through the real HTTP surface, and it is where this project's worst defects were found. |
| **changing the spec** | Don't, without asking. It is marked *Approved design*. Record the proposed change and Rich decides. |

```
docs/external-track.md          the UBC IAM / PIA work that runs in parallel (docs/, not docs/superpowers/)
docs/superpowers/
├── ORIENTATION.md              ← you are here
├── WALKTHROUGH.md              run it, see it, check it — one page, browser included
├── RUNBOOK.md                  run and operate the platform; every demo; Known gaps
├── specs/
│   ├── 2026-08-29-manifest-platform-design.md   AUTHORITATIVE. 27 sections.
│   └── manifest-*.html         plain-language versions, SHARED OUTSIDE THE TEAM; markdown wins
├── plans/
│   ├── 2026-08-29-plan-roadmap.md                 THE LEDGER. Status and the defect-rate table.
│   ├── 2026-08-29-phase-0-spike-briefs.md         P0. Historical record.
│   ├── 2026-08-30-p1-local-substrate.md           P1 — and the house style for a plan
│   ├── 2026-08-29-p2-control-plane-spine.md       P2
│   ├── 2026-08-31-p3-docker-driver-deploy-spine.md P3 — its Sessions 4 and 5 above all
│   ├── 2026-09-07-p4a-identity-secrets-injection.md P4a
│   ├── 2026-09-07-p4b-ai-events-streaming-incidents.md P4b
│   ├── 2026-09-15-p4c-brief.md + …-p4c-zero-downtime-redeploys.md P4c
│   ├── 2026-09-16-p5-brief.md                     the brief P5a, P5b and P5c are written from
│   └── 2026-09-16-p5a-the-contract.md             P5a ← CURRENT
└── spikes/
    ├── S7, S2, S1, S3, S6-findings.md   each one's answer is its first sentence (§5)
    ├── S1-controls-settled.md          scoped registry tokens; the builder's bounds
    ├── p4c-baseline/, p5a-baseline/    the measurements P4c and P5a rest on
    ├── START-HERE.md                   the ORIGINAL spike briefing. Historical; its §6 is wrong
    └── HANDOFF-2026-08-3*.md           dated handoffs, SUPERSEDED by this file; do not act on either
```

**Every executed plan's *What executing this plan found* is its record**: every defect with the measurement that found it, every negative control, the gate numbers and the machine, sitting by sitting. §7a says which entries to read first.

### The code

```
Makefile  infra/  scripts/        P1's platform: compose.yaml and its services; make seed / up / down / reset /
                                  doctor / verify / demo*; infra/lib/ holds the ensure-*.sh steps and idp-login.sh
vitest.config.ts                  ROOT: fileParallelism: false — a root-level option; it does nothing in a package config
.prettierrc  .prettierignore      Prettier owns packages/ ONLY — without the ignore, `pnpm format` rewrites the approved spec
blueprints/fixture-node/          P2's minimal blueprint
blueprints/node-ts-mongo/         THE blueprint faculty apps are generated from: descriptor, Dockerfile, skeleton
                                  (auth/, ai/, server.js), agents/AGENTS.md — the knowledge pack — and starters/
blueprints/node-ts-mongo/starters/proof-app/
                                  §16's proof app, node-ts-mongo@1's first STARTER (P5a Task 10; it was
                                  fixtures/proof-app/) — laid over the skeleton by scripts/lib/proof-app.sh
fixtures/fixture-app/             make demo's build target — server.js at the tree root, because the blueprint's CMD
                                  is not templated
fixtures/saml-sp/                 a throwaway SP on the real passport-ubcshib — §16's identity-path tier
infra/reserved-labels/            §23's reserved labels, loaded at boot
packages/control-plane/src/       the control plane — below
packages/contract/                openapi.json (GENERATED) and @manifest/contract, the client generated from it
packages/journey/                 §22's journey through that client — make demo-journey
```

`packages/control-plane/src/` — one directory per §5 module, and **`module-boundaries.test.ts` refuses an import of another module except through its `index.ts` or `testing.ts`**:

| Module | What it is |
|---|---|
| `index.ts`, `config.ts` | the boot, and env parsing (repo paths resolve from the repo root, never the cwd) |
| `spec/` | §7's schema and policy, `diff.ts` (D9's sensitive diff, §14's readable diff), `resolve.ts` (three layers), `injection.ts` (§8) |
| `blueprints/` | §25 descriptors and the registry |
| `db/` | Drizzle schema and client, `locks.ts`, `testing.ts` — `withRollback` isolates a test from its OWN writes only; `resetDatabase` is for a test that drives a real server, whose rows are committed |
| `runtime/` | §11's `Driver`, the fake driver, **`driver-contract.ts`**, the state machine; `runtime/docker/` is the one real driver |
| `routing/` | §23 hostnames → Caddy routes; readiness and identity probes run from inside the edge. `caddy.ts` speaks `node:http`, not `fetch` — Caddy's admin API refuses any request carrying an `Origin` header |
| `build/`, `services/`, `source/` | the build context, §12's gates and scan; per-app Mongo; bare git repositories (D5 driver 1) |
| `identity/`, `sso/`, `secrets/` | sessions and Manifest's own SAML SP; per-app SP registration in the IdP; envelope encryption |
| `projects/` | §13 authorization (`authz.ts`), the repository, reserved labels and `checkSlug` |
| `releases/` | build, release, deploy, retire, recover-at-boot |
| `observability/` | events, redaction, build logs, Incidents, the event bus |
| `ai/` | the LiteLLM admin client, D17's catalogue, app keys |
| `api/` | the Fastify server; `contract/` (`defineRoute`, the OpenAPI document); `representations/`; `routes/`; `error-codes.ts`; CSRF; idempotency; **`authz-contract.ts`** |

**Read first:** `runtime/driver.ts` and `runtime/driver-contract.ts` — everything is built against them — then `runtime/docker/driver.ts`, `api/server.ts` for how a request becomes an actor, `projects/authz.ts`, and `api/contract/route.ts`.

### What the platform keeps true

Each of these was built, measured and paid for; the record is in the plan named. **A change that breaks one is a defect even when every test is green.**

**Identity**

- **Manifest is its own SP (§9), and there is no login shim.** `GET /auth/login` sets `manifest_login` and sends its nonce as `RelayState`; `POST /auth/saml/callback` refuses an assertion not bound to the browser that started the sign-in (`401 SAML_LOGIN_NOT_BOUND`) before node-saml validates it, then lands on `/` or a same-origin `?returnTo=`. Sessions are stateless signed cookies that carry the role they were issued with. Tests sign their own with `identity/testing.ts`. *(P4a Task 14, P5a Task 4.)*
- **The control plane's SAML library is `@node-saml/node-saml` 5.1.0, NOT the `passport-saml` the blueprint pins**, which audits one Critical with no fix. Three node-saml defaults fail open and are set explicitly — sha1 signing and digest, `validateInResponseTo: never`, `emailAddress` — and nothing scans the control plane's own dependency tree (§12's gate scans app images). *(P4a.)*
- **The platform's SP row is written at every boot**, through `renderSpMetadata` — the one renderer of an `entity_data` document — with its ACS from `MANIFEST_CONTROL_PLANE_ORIGIN` (default `https://console.manifest.internal`) and its keypair in `infra/sp/control-plane.{key,crt}`. The Docker tier boots control planes on 7188/7189 that re-register it at a loopback ACS: **restart the control plane after `pnpm test:docker`.**
- **The Manifest IdP releases attributes by `core:AttributeLimit` at priority 50 on friendly names, then `core:AttributeMap` at 60 to the OIDs UBC sends — the order is load-bearing** (reversed, it releases nothing), and `make verify` asserts it. `ssp_ro` reads metadata and cannot write it; a CHECK makes a row with an empty or absent `attributes` — which S2 measured releasing everything — unrepresentable.
- **Four settings read like controls and are not**: SimpleSAMLphp's `validate.authnrequest` (a present signature is always validated), node-saml's `wantAssertionsSigned` and `wantAuthnResponseSigned`, and the blueprint's `attributeConfig` (its bridge reads the OID first). §9's release enforcement is the control. *(P4a, measured.)*
- **The three-hop CWL sign-in is ONE function, `idp_login` in `infra/lib/idp-login.sh`.** It proves the SP row and the AuthnRequest signature; it does not prove the session authenticates anybody, so **a caller's identity check is the assertion**.

**Data, secrets and audit**

- **The control plane connects as `manifest_app`, never as `manifest`**: `manifest` is `POSTGRES_USER` and so a superuser, and a superuser bypasses every grant — which made §20's append-only audit unimplementable. **Three database URLs, none derived from another**: `MANIFEST_DATABASE_URL` (the app role), `MANIFEST_ADMIN_DATABASE_URL` (migrations and the test harness's `TRUNCATE` only; `src/` never reads it) and `MANIFEST_IDP_DATABASE_URL`. `vitest.env.ts` derives all three from `.env`.
- **`audit` is its own schema** — `events`, `build_logs` and `incidents`, append-only by grant, with foreign keys `ON DELETE RESTRICT`, because a referential action runs with the referenced table's privileges and a cascade let the application erase the trail. `recordEvent` takes its redactor as a PARAMETER, so nothing writes an unredacted row, and **every event goes through `publishEvent`**, which records it and streams it; a database CHECK closes the event types.
- **`secrets/` is libsodium envelope encryption over a `secrets` table**; service credentials and each app's `SESSION_SECRET` are STORED, not derived; `process.env` is scrubbed at boot. Tests use `withSecretScope` (`secrets/testing.ts`). **`deriveCredentials` survives on purpose**: a service created before credentials were stored still holds the derived password, which the store adopts on first call — deleting it before every existing service has been deployed once is the trap P4a's Decision 8 describes. **`infra/secrets/master.key`, `infra/idp/cert/`, `infra/sp/` and the Caddy CA are minted by `make up`, gitignored, and NOT removed by `make reset`.**
- **A migration is always its own file** — drizzle-kit keeps a journal and never re-runs an applied one — applied with `pnpm --filter @manifest/control-plane db:migrate`, which reads the admin URL.

**Build and deploy**

- **§8's injection contract is ONE function with ONE producer** — `spec/injection.ts`'s `renderInjection` — and `deployRelease` adds nothing; service variables are read out of the endpoint the driver returned, and §8's two files reach the container through `InstanceSpec.files` — the IdP certificate `0444`, the SP key `0440`, root-owned with the blueprint's `run_as_uid` as its group. **§16's drift tier reads the blueprint's SOURCE**, comments stripped, against the renderer's output; `ALLOWED_UNSET` and `PLATFORM_ONLY` are deliberately empty. *(P4a Tasks 10–13.)*
- **A deploy reads only the `ResolvedConfig` frozen at release (§13)**, never `app_specs.parsed` — a second source of truth is the defect shape P3 paid for seven times.
- **A redeploy interrupts nobody (P4c).** The new instance starts beside the old one, is proved ready from inside the edge, and takes the route with one in-place `PATCH`, under a per-environment advisory lock, with §6's `Route` record written; the retirer drains and removes the old one after the deploy returns. `recoverAtBoot` puts routes back from `Route` rows, ends interrupted deploys and finishes drains. **A release that never becomes ready is a `200` whose state is `failed`**, with §14's Incident, and the previous instance keeps serving. Sessions live in the app's own Mongo.
- **§12's scan gate blocks on a Critical or High that has a published fix**; findings with no fix, and the base image's, are recorded on the Release.
- **AI (P4b):** the gateway joins an app's network only when the app declares models; each instance's key is confined to `/v1/chat/completions`, `/v1/embeddings` and `/v1/models`, under a budgeted LiteLLM user `mf-<project>-<environment>`; the end-user identifier `sha256(puid ‖ project ‖ environment)` has one producer, the blueprint's `skeleton/ai/end-user.js`. AI is on unless `MANIFEST_AI_ENABLED=0`, and on refuses a boot with no master key.
- **`node-ts-mongo@1` is §20's security multiplier**: its skeleton — CWL sign-in, the AI component, sessions — is written once and inherited by every app, its skeleton is a Docker-tier build target, and every app-side dependency is pinned exactly (C6, D30).

**The API (P5a)**

- **Every resource route is under `/v1`, reached at `https://console.manifest.internal` through the edge, which refuses every source but the host** (`10.89.0.1/32`); the sign-in endpoints and the registry's token realm stay outside `/v1`, listed in `api/unversioned.ts`.
- **A `/v1` route is declared once, through `defineRoute`**, with `zod/v4` schemas; its answer is parsed through a registered representation, so no column a mapper forgets can leave. `packages/contract/openapi.json` is generated from the definitions and held by a drift test (`pnpm contract:write`), and `@manifest/contract` is generated from the document (`pnpm contract:generate`).
- **A session-bearing mutation or stream upgrade must carry the console's `Origin`** (`403 CSRF_ORIGIN_REFUSED`); **every mutation carries an `Idempotency-Key`** (D23.6); **every code a client can receive is in `api/error-codes.ts`**, held to the source in both directions.
- **§13's authorization is `projects/authz.ts`**: a stranger gets `404 NOT_FOUND`, a member without the capability `403 FORBIDDEN`. **`api/authz-contract.ts` covers every registered route and asserts each refusal's code.**
- **One event stream per project**, `WS /v1/projects/:projectId/events`, authorized before it upgrades.
- **One slug function, `checkSlug`**, answers `GET /v1/slugs/{slug}` and project creation with the same code, message and hint.
- **A blueprint is read whole at load, and a broken one refuses the boot, naming its file** (P5a Task 10): `loadBlueprints` reads each `skeleton/`, starter and knowledge pack as bounded UTF-8 text, and refuses a starter whose `manifest.yaml` fails §7, pins another blueprint, or asks for what its blueprint cannot deliver. **The proof app is `node-ts-mongo@1`'s first starter**, `blueprints/node-ts-mongo/starters/proof-app/` — it was `fixtures/proof-app/`. `GET /v1/blueprints` never carries the base image or build internals.
- **A project is created in ONE order** (P5a Decision 29, Task 11): blueprint and starter exist → `checkSlug` → the seed rendered (skeleton, the starter over it, the manifest's `name` spliced to the slug byte for byte) and the model catalogue read only if it declares a model → project, owner and three environments in one transaction → the repository, **and the project deleted if that fails** → the spec validated and stored → `project.created`, `repository.seeded`, `spec.validated`, **last**, because `audit.events` RESTRICTs the delete. `audience` is required (§24).

### What it deliberately does not do yet

Each is named in its plan's *What this plan does not build*, and none is an accident:

- **A sign-in under way at the IdP when a route moves fails once** — `passport-ubcshib` 0.1.6 drops passport-saml's `cacheProvider`, so the request id lives in the old container. Rich: tolerate it. *(P4c.)*
- **An edge configuration reload can reset about one request in 300 per admin change** (P4c R1), and **closes every app's proxied WebSocket** — only the console sets `stream_close_delay` (§8).
- **Two releases share one database for up to two minutes** during a redeploy — a knowledge-pack rule, checked by nothing. *(P4c R8.)*
- **An AI app whose gateway vanishes under a pooled connection makes a person wait 611 s** — the toolkit exposes no timeout. *(P4b finding 181.)*
- **Nothing notices an edge restart while the control plane runs** — that is Phase 4's reconciler; restart the control plane after `docker restart manifest-caddy` or `pnpm test:docker`.
- **§10's per-user AI budget is validated, not enforced**, in Phase 1.
- **`egress.allow` may still name a platform surface** — decided in §12, enforced by nothing until the roadmap's tracked hardening item.
- **A `POST /v1/projects` for a slug whose repository outlived its project answers `SOURCE_GIT_FAILED` with git's raw output, host path included** — `pnpm test` and `make reset` leave `.manifest/repos` behind. Since P5a Task 11 it leaves no project; the demos and the journey clear their OWN slug's orphan first (`clear_orphan_repository`). A distinct code, and a message without the path, are not built. *(P4b finding 178's other half.)*
- **No console, no delegated tokens, no production deploy, no custom domain** — P5b, P5c and Phase 2.

**Which spec sections matter, by topic:** §7 the `manifest.yaml` contract · §9 identity ·
§10 AI access · §11 execution model and the `Driver` interface · §12 networking,
secrets, the builder, supply chain · §13 releases · §16 testing tiers · §20 security
architecture · §21 local topology · §22 the public API · §23 hostnames · §25
blueprints. Decisions are **D1–D32** in §4; constraints **C1–C6** in §3.

---

## 4. The machine, and what it will do to you

**This section is the one that saves you a morning.** Every item was paid for by a
spike. It was previously stranded inside a superseded handoff; it lives here now.

### Laravel Valet owns things you will want

- **Valet owns the `.test` TLD, port 53, and ports 80 and 443.** A Homebrew dnsmasq
  2.91 runs as `nobody` on `127.0.0.1:53` answering `address=/.test/127.0.0.1`, and
  the nginx on 80/443 is Valet's. **Never touch any of it** — Rich needs it, and
  other UBC developers run it too.
- **This is why the zone is `*.manifest.internal`**, not `*.manifest.test`. ICANN
  reserved `.internal` in July 2024 for exactly this.
- **The resolver file is scoped to `manifest.internal`, never all of `.internal`** —
  Docker's own `host.docker.internal` lives in that TLD.
- **Caddy binds `127.0.0.2`**, a loopback alias, so Valet keeps `127.0.0.1:443`. The
  alias **does not survive a reboot**; `can't assign requested address` means it is
  gone. **`make up` re-adds it, and that is not always enough** (measured 2026-09-14):
  starting Docker Desktop restarts `manifest-caddy` itself before `make up` can add the
  alias, the port forward fails, and Docker never retries it. The container reports
  healthy from inside, so `make up` and `make doctor` both pass; `make verify` fails
  every host→edge check while every container→edge check passes.
  `docker restart manifest-caddy` fixes it. RUNBOOK's *Known gaps* has the detail.

### The toolchain, and what executing P2 put on this machine

- **Node is 24, not 22.** nvm has only `v24.12.0`; there is no Node 22 on this
  machine. P2's plan originally pinned 22 for no reason that survived checking — the
  spec names no Node version, no spike treated it as a variable, and the only evidence
  was `passport-ubcshib`'s `">=22.0.0"`, which is a floor. **Repinned to 24**
  (2026-08-31, Rich's call). Nothing was tried on 24 and found wanting.
- **The app-side base image is still `node:22-alpine`** and is a *separate* decision:
  it is what faculty apps run in, S1 recorded its digest and mirrored it into the
  local registry, and P1 references it in three places including the offline test.
- **`pnpm` was added via `corepack enable pnpm`** — pnpm 11.24.0, a shim in
  `~/.nvm/versions/node/v24.12.0/bin/`. User-owned, **no `sudo`**, reversible with
  `corepack disable pnpm`. This is the only host change P2's execution made.
- **pnpm 11 blocks dependency install scripts by default**, as a hard error, so
  `pnpm test` will not run until they are allowed. The key is `allowBuilds` in
  `pnpm-workspace.yaml`; pnpm 10's `onlyBuiltDependencies` is still *read back* by
  `pnpm config get` but has no effect, which makes hand-writing it look like a
  mystery. Use `pnpm approve-builds <pkg>`.

### What is a container, and what is actually on this machine

**Almost nothing Manifest runs is installed on the Mac.** This is worth stating
plainly because every list of "absent" images in this project reads like a missing
dependency and is not one. §21's inventory is the authority; this is its summary.

**Host-resident, and only these:**

| | Why it cannot be a container |
|---|---|
| **Ollama** | Metal GPU access is unavailable from a container |
| **The control plane** (Node, 7100) | It needs the Docker socket, which §12 forbids mounting into *workload* containers. Running it on the host sidesteps the question and iterates faster. It **cannot reach container IPs** on Docker Desktop (S1), so health checks go through the edge or a published port |
| **Admin UI (7101), `manifest-mock` (7102), reference console (7104)** | Vite dev servers |

**Everything else is a container**: Caddy, Postgres, the registry, Verdaccio,
LiteLLM, the Manifest IdP, both dnsmasq processes, the egress proxy, the builder, and
the Syft/Grype scanners. So:

- **Caddy is never `brew install`ed.** It is a **custom `xcaddy` build** (§20), because
  S7 established that **Coraza pins the Caddy version**. `make seed` builds that image.
  `caddy: ABSENT` from a host-tool check means nothing at all.
- **Syft and Grype are transient per build** (§21: *"Scanner + SBOM — transient, per
  build"*). P3 Task 12 runs each as a throwaway container against the Docker socket.
- **The Manifest IdP is ours and is built from scratch** — `infra/idp/Dockerfile`,
  `FROM php:8.3-apache` plus `composer create-project simplesamlphp/simplesamlphp:^2.0`,
  its own `manifest_idp` database, on **port 7122 deliberately not 6122**. It has **no
  dependency on `/Users/rich/Developer/docker-simple-saml`** running, or existing.
  That repository is read-only to us and stays clean; what S2 took from it was
  knowledge — `pdo_pgsql` needs `libpq-dev`, `database.*` and `store.sql.*` are
  different subsystems, one `INSERT` into `saml20_sp_remote` registers an SP — not code.

**The images `make seed` must therefore fetch or build include** `caddy:2.11.4` and
its builder, `anchore/syft`, `anchore/grype`, `php:8.3-apache` and `composer:2` —
none of which are on this machine today. Seed is the one step that needs the network,
which is why P1's **offline** acceptance can only run after a successful seed.

### Rules of engagement

- **`sudo` cannot prompt from a tool call.** You get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal. **Ask before
  anything needing `sudo`** — standing instruction.
- **The machine must end up exactly as it started.** Snapshot before you change
  anything. Every spike has met this bar and Rich has confirmed each teardown.
- **Pre-existing containers that must survive**: `docker-simple-saml-saml-idp-1`,
  `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **The Bash tool's shell is zsh, and zsh ties `path` to `$PATH`.** A loop written
  `for path in /v1/models /key/info` empties `$PATH` for the rest of the command, so
  `docker`, `curl` and `python3` all become *command not found* partway through —
  measured 2026-09-14, when it leaked a LiteLLM key minted before the loop. Name loop
  variables anything else.
- **Work on a copy.** `docker-simple-saml` and `ubc-genai-toolkit` are read-only to
  you unless told otherwise; both are currently clean and must stay that way.
- **`git checkout <path>` restores from the INDEX, so on an uncommitted file it destroys
  your work, not your experiment.** Measured 2026-09-15: reverting one three-line negative
  control in `runtime/docker/driver.ts` reverted all 200 lines of the task with it, because
  the task had not been committed. **Commit the task BEFORE breaking anything to watch a
  control fail** — the restore is then exact, and `git status` proves it.

### Numbers

- Ports in use by other things: **6122** (`docker-simple-saml`), **27017** (mongodb),
  **6333/6334** (qdrant), **8081** (mongo-express), **11434** (Ollama), plus 80/443/53.
  The **7100–7199** block was entirely free.
- Docker VM memory is **8.32 GB decimal / 7.75 GiB binary** — passes or fails §21's
  "≥8 GB" floor *depending on the unit*, which is why the spec now states the unit.
- Host: 36 GiB RAM, 12 cores, ~163 GiB free. **macOS 26.6.2 (build 25G83)** — the
  machine was updated; §4 said 26.5.2 until 2026-09-04. arm64, Docker Engine 29.7.2,
  which serves **API 1.55, minimum 1.40** (so P3's deliberate `v1.44` pin is inside
  the window).
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`,
  no `xargs -r`, no `readlink -f`. A script that needs Homebrew bash 5 is a C1 defect.

### Things that will cost you a morning

- **A `REVOKE` against a SUPERUSER is a no-op that reads exactly like a control.**
  `manifest` is `POSTGRES_USER`, so Postgres created it as a superuser and it bypasses
  every privilege check: measured 2026-09-09, `REVOKE UPDATE, DELETE ON t FROM manifest`
  → `REVOKE`, then `UPDATE 1`, `DELETE 1`. The control plane therefore connects as
  **`manifest_app`** (`infra/lib/ensure-app-role.sh`, run by `make up`), and so does
  `pnpm test` — a grant is only observable from the role it constrains. **The README's
  export block now has THREE database URLs**: the app's, `MANIFEST_ADMIN_DATABASE_URL`
  for `db:migrate` and the harness's `TRUNCATE`, and the IdP's.
- **A foreign key's `ON DELETE CASCADE` runs with the REFERENCED table's privileges**,
  not the caller's — so it walks straight through a grant on the referencing table. With
  `audit.events` correctly refusing `UPDATE`, `DELETE` and `TRUNCATE`, deleting the
  project removed its audit rows anyway. `audit.events` is `ON DELETE RESTRICT`.
- **`--local=/manifest.internal/` is mandatory** on dnsmasq. Without it AAAA returns
  **SERVFAIL** instead of NODATA, and both musl and glibc treat SERVFAIL on either
  half of a dual-stack lookup as total failure. The symptom is
  `curl: (6) Could not resolve host` **while `dig +short` returns the correct A
  record.** The single most misleading failure in the project so far.
- **`--server=127.0.0.11` is mandatory.** Without it `--no-resolv` makes dnsmasq
  authoritative for everything and containers lose Docker service names *and*
  external resolution.
- **`--address` is global to a dnsmasq *process*.** Verified. That is why there are
  two dnsmasq containers rather than one with two listeners.
- **On Docker Desktop, `--dns` sets the *upstream*** for Docker's embedded resolver
  rather than replacing it. `/etc/resolv.conf` still says `nameserver 127.0.0.11`.
  Good news — service names survive. Do not conclude `--dns` is ignored.
- **Caddy admin API: `PUT` inserts, `POST` appends** — and appending puts your route
  behind the wildcard whose `terminal: true` swallows it.
- **A host process cannot reach container IPs** on Docker Desktop, so health checks
  go through the edge or a published port.
- **`localhost` resolves to `::1` and times out** in build tooling. Use `127.0.0.1`.
- **Restarting Caddy discards all runtime routes.** Route *changes* under load are
  safe: 0 failures in 400 requests across 12 add/remove cycles.
- **User-namespace remapping silently does nothing** on Docker Desktop. Every other
  §12 hardening flag genuinely enforces.
- **LiteLLM serves admin and proxy traffic on ONE port.** There is no admin port to
  firewall; confinement is per-key `allowed_routes`.
- **A LiteLLM key minted with `models: []` reaches EVERY model, not none.** Measured
  2026-09-14 on 1.98.0: it listed all three catalogue entries and embedded with a model it was
  never given, while the same key with `['default-chat']` was refused the other with 403.
  `ai/keys.ts` refuses an empty list.
- **`make up` does not apply an edit to `infra/litellm/config.yaml`.** It is a single-file
  `:ro` bind mount LiteLLM reads once at start, and compose sees no service change — the shape
  the Caddyfile had. `docker restart manifest-litellm` applies it, in ~10 s. Measured 2026-09-14.
- **`/key/delete` accepts the hashed `token` that `/user/info` reports**, so a key nobody saw —
  one `/user/new` auto-created — can still be removed. Measured 2026-09-14.
- **LiteLLM checks a key when a request STARTS.** A streaming completion whose key was deleted 7 s
  in ran on to a normal finish — 961 of its 1,003 characters after the delete — while a new request
  with that key got 401. Measured 2026-09-14 on 1.98.0. Revoking a key cannot cut off a stream
  already under way; it only refuses the next request.
- **Most Ollama models on this machine are *thinking* models**, and that breaks
  streaming silently: zero content frames, no error, at any token budget.
- **`node src/index.ts` does not work here**, even though Node 24 strips TypeScript
  types natively. The source uses NodeNext `.js` specifiers and Node resolves them
  **literally**, so it looks for `src/api/index.js` and does not find it. Compile
  with `tsc` and run `dist/index.js`. `pnpm --filter @manifest/control-plane dev`
  does both.
- **`pnpm test` and `pnpm --filter … test` are not the same command.** The filtered
  form runs with the *package* directory as its working directory; the root form does
  not. Any cwd-relative path in a test passes under one and `ENOENT`s under the other.
  **`pnpm test` from the repo root is the one that counts** — it is what CLAUDE.md
  requires before a commit.
- **`node --experimental-strip-types` cannot run this repo's TypeScript either**, and
  for a *different* reason from the one above: strip-only mode rejects **parameter
  properties**, and `EngineError`, `ScanError`, `BuildGateError` and `ConfigError` all
  use them — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. So a throwaway `node -e` script that
  imports a `.ts` file to poke at it does not work. Write a scratch **test** instead,
  or drive the thing through `docker`/`curl` directly.
- **A `sed`/`python .replace()` negative control silently matches nothing after
  Prettier has reformatted its target — and every test then passes.** That reads as
  *"the control cannot fail"* and means *"the control never ran"*; it happened on
  2026-09-06 while proving a scan rule, and it is the same shape as every other
  could-not-fail check this project has paid for. **Assert the pattern matched before
  writing the file.** A `git diff` after the edit is the other cheap proof.
- **Vitest strips types; it does not check them.** A file can pass every one of its
  tests and have four `tsc` errors. `pnpm typecheck` (every package — P5a Task 7)
  is the only gate that sees them, and this repo's `exactOptionalPropertyTypes` makes
  that class common: `hint: cond ? x : undefined` is a type error, conditional spread
  is the fix.
- **`fileParallelism` is a ROOT-level Vitest option.** Setting it in a package's
  `vitest.config.ts` has no effect on a workspace run, and the symptom is a suite that
  fails a *different* number of tests on each run.
- **A shell PIPELINE takes its exit status from the LAST command**, so
  `git archive … | tar -x` reports success when `git` dies. Measured 2026-09-07:
  `git --git-dir=file://… archive HEAD` exits **128** and the pipeline exits **0**,
  which made every failed build-context export produce an empty directory and a
  clean bill of health. `set -o pipefail` is not available in `execFile('sh', …)`
  by default — run the two commands separately.
- **BusyBox `wget` honours `http_proxy` and does not support `NO_PROXY` at all.**
  On BusyBox v1.37.0 a container health check of its own `127.0.0.1` is sent to the
  egress proxy and comes back `403 Filtered`. `wget -Y off` is the switch. This
  silently marked every deployed app `unhealthy` while it was serving perfectly.
- **`request.log.error` under `Fastify({ logger: false })` writes nothing** — it
  exists and accepts the call. Same trap as `app.log.info` on the boot line. Use
  `console.error` for anything an operator must be able to see.
- **An unqualified image name is DOCKER HUB to the daemon.** `local/chem-labs@sha…`
  resolves as `docker.io/local/chem-labs` and 401s. Record the repository the build
  produced; never re-derive it from a slug.
- **`docker network rm` fails while ANY container is still attached**, and the app
  networks always have two: `ensureAppNetwork` attaches `manifest-caddy` and
  `manifest-dns-containers` to every one of them by design. `make reset` only worked
  because `compose down` ran first and stopped them — correctness by accident of
  ordering, with `|| true` hiding the failure. It now disconnects them explicitly.
  Measured 2026-09-07: five app networks survived a cleanup that reported success.
- **`docker rm` without `-v` orphans the container's anonymous volumes**, and
  `mongodb/mongodb-community-server` declares **two** volumes while the driver binds
  only `/data/db`. `moby/buildkit` likewise declares one the ephemeral builder does
  not bind — harmless while the process lives, because the driver deletes with
  `v=true` in a `finally`, but one empty volume per build leaks if the control plane
  is killed mid-build. **`docker volume ls -f dangling=true` is NOT a safe prune
  list**: it includes *named* volumes that merely have no container attached, so it
  lists `manifest-caddy-data` — the trusted CA — and other people's volumes. List and
  date them, then remove by id.
- **`registry garbage-collect` on a RUNNING registry corrupts it.** It deletes the
  manifest blob and leaves the tag and revision links, after which every `docker
  push` of the same content reports success **with the correct digest** while the
  registry answers 404. Stop or restart the registry around a GC.
- **This `registry:2` does not split a comma-joined `Accept` header**, and mirrored
  base images are **OCI** manifests. Pass separate `-H 'Accept: …'` flags including
  `application/vnd.oci.image.manifest.v1+json`, or you get a 404 that reads exactly
  like a missing image: `OCI manifest found, but accept header does not support OCI
  manifests`.
- **npm's `replace-registry-host` defaults to `npmjs`**, so a mirror redirect only
  applies to lockfiles whose `resolved` URLs name registry.npmjs.org. Any other host
  is fetched directly, past the mirror. `replace-registry-host=always` is what D13
  actually means.
- **`pnpm test` TRUNCATES the control plane's §6 tables** — `vitest.global-setup.ts`
  does it once per run, deliberately, so a run never inherits the last one's rows.
  It also means running the suite wipes whatever `make demo` created. **So does ONE file**:
  `pnpm exec vitest run --project unit <file>` runs the same `globalSetup`, and measured
  2026-09-16 (P5a sitting 1) it emptied `projects`, `users`, `instances`, `routes` and `secrets`
  for a test that touches no database — which would have failed the next measurement, a sign-in
  that needed the demo's project. Run anything that needs a demo's rows BEFORE any Vitest run.
- **The Manifest IdP could not issue an assertion, and `make verify` was 34/0.**
  Measured 2026-09-07: the image ships only `saml20-idp-hosted.php.dist` and an empty
  `cert/`, so `/module.php/saml/idp/metadata` answered **500** —
  *"Could not find any default metadata entities in set [saml20-idp-hosted]"*. Verify
  checked that the IdP served a page, that `pdo_pgsql` was present and that a row
  round-tripped through the metadata handler; none of that touches signing. **P4a
  Task 1 fixes it.** The general lesson is the one this project keeps re-learning: a
  check that does not complete the operation proves the operation can start.
- **SimpleSAMLphp 2.x's endpoint paths are not 1.x's, and `passport-ubcshib`
  hardcodes 1.x's.** `UBC_CONFIG.LOCAL` carries
  `/simplesaml/saml2/idp/SSOService.php`; 2.x serves
  `/module.php/saml/idp/singleSignOnService`, `…/singleLogout` and `…/metadata`
  (read off the running container's `routes.yml`). This is why §8 makes
  `SAML_ENTRY_POINT` mandatory, and a 404 from the IdP reads as "the IdP is down".
- **SimpleSAMLphp validates any AuthnRequest signature that is PRESENT**, whether or
  not the SP's row says `validate.authnrequest`. So an app that signs and a row with no
  `certData` is refused with *"Missing certificate in metadata"* — which reads as a
  missing registration rather than a missing key — and, the other way round, the
  `validate.authnrequest` flag can be deleted without any wrong-key test noticing. Only
  an SP that does **not** sign can show that flag doing anything. Measured 2026-09-09.
- **The IdP's error page never says why.** `showerrors` is off, as it must be on a
  deployed IdP, so an uncaught exception renders as "Unhandled exception" and the reason
  exists only in the container log. A *titled* error (metadata not found, invalid
  certificate signature) does put its title in `<title>`, which is why some assertions
  against the page body work and others silently cannot. Read `docker logs manifest-idp`
  — and count occurrences before and after, or a line from an earlier run stands in for
  a refusal that never happened.
- **`core:AttributeLimit` is not in SimpleSAMLphp's default chain**, so a metadata
  row's `attributes` list is advisory — S2 measured three declared and thirteen
  released. An empty list is also treated as "no limit". Both fail **open**, silently,
  and both were live here until P4a Task 2.
- **The OpenAI SDK cannot be forced through an HTTP proxy by any environment setting.**
  Measured 2026-09-07 against three mechanisms: `http_proxy` is ignored; undici's
  `setGlobalDispatcher(new ProxyAgent(…))` fixes global `fetch` and **not** the SDK;
  a patched `http.globalAgent` is bypassed too. The SDK bundles `node-fetch` and
  supplies its own `agentkeepalive` agent, and its only supported override is the
  `httpAgent` constructor option — which `ubc-genai-toolkit-llm` does not expose.
  So an app on an `--internal` network cannot reach LiteLLM through the egress proxy.
- **Fastify runs root-level hooks for the not-found handler too**, and an unmatched
  route has no `routeOptions.config` to opt out with. A `preHandler` that throws will
  turn every 404 into whatever it throws. Guard on
  `request.routeOptions.url === undefined`.

- **SimpleSAMLphp 2.x enables only `core`, `admin` and `saml`.** Every D6 test user is
  defined with `exampleauth:UserPass`, so until 2026-09-08 every SSO request answered
  **500** — *"The module 'exampleauth' is not enabled"* — while `make verify` said
  43/0. `config.php` must `array_merge` into the dist's `module.enable`, never replace
  it, or `core`, `admin` and `saml` go with it.
- **`config.php.dist` already ships `50 => core:AttributeLimit`**, and our `config.php`
  merges *over* the dist, so the filter has been live since P1. What was missing was
  the OID map. A plan that says otherwise was written against the file we wrote rather
  than the file that runs.
- **`core:AttributeLimit` compares the SP row's list against the attribute KEYS as
  they stand at its priority.** Measured, all four combinations: auth source emitting
  OIDs + a row declaring friendly names releases **nothing**; friendly + friendly
  releases the two declared; OID + OID also works; and an **empty or absent** list
  releases **everything**. That last one is S2's fail-open and is why there is a
  `CHECK` constraint.
- **`jsonb_array_length(NULL)` is NULL and `NULL > 0` is NULL — which a CHECK
  ACCEPTS.** A constraint written without `COALESCE` rejects `"attributes": []` and
  waves through a row with no `attributes` key at all, and AttributeLimit treats those
  two identically.
- **`bin/initMDSPdo.php` issues `CREATE TABLE` through `database.*`** — the same
  credentials the request path reads metadata with. Making that user read-only makes
  the container restart-loop on `permission denied for schema public`. `SSP_DB_INIT`
  scopes the owning role to that one command.
- **`make up` could not apply a Caddyfile edit.** The file is bind-mounted and read
  once at container start, and compose sees no service change when only content
  changed. `infra/lib/ensure-caddy-config.sh` now reloads the edge, **conditional on a
  hash** kept in the edge's own volume — `caddy reload` replaces the whole config and
  an unconditional reload would drop the driver's runtime routes on every `make up`.
- **`mv`-ing a bind-mounted DIRECTORY leaves the running container on the old inode.**
  A negative control that moves one aside and runs `make up` changes nothing; the
  container has to be force-recreated. Commenting the mount out of `compose.yaml`
  *does* work, because that changes the service definition.
- **The container rootfs is READ-ONLY (§12), and the daemon refuses to write into it**
  — `container rootfs is marked read-only`. A **volume** path on the same container is
  accepted, and `:ro` on that volume is refused too (`mounted volume is marked
  read-only`). That is why `InstanceSpec.files` is backed by a per-instance volume at
  `/manifest`, mounted read-write, with **file ownership** carrying the protection.
- **`CapDrop: ALL` takes `CAP_DAC_OVERRIDE` with it, so root inside a container cannot
  read past permission bits.** Measured 2026-09-08: a `0400` file owned by uid 10001
  was unreadable by root — `stat` fine, `cat` silent. Anything the app must read has to
  be reachable by ownership or group, never by privilege.
- **`destroyInstance` takes the CONTAINER name (`appContainer(instanceName(…))`), not
  the instance name.** Passing the wrong one destroys nothing, and `ensureInstance` is
  idempotent by name — so a stale container survives and every later run silently
  redeploys nothing and tests the first image it ever built.
- **`passport-ubcshib` exports `Strategy`, not `UBCStrategy`.** It is CommonJS ending
  `module.exports = { Strategy: UBCStrategy, … }`, so a named import is `undefined` and
  `new undefined(...)` throws at construction.
- **`AuthState` comes out of an HTML attribute and carries a query string**, so it
  arrives with `&amp;`. Posting it undecoded means SimpleSAMLphp cannot match the
  pending authentication and the SAML flow loops rather than failing.
- **`passport-saml` is npm-DEPRECATED and carries a critical signature-verification
  advisory (GHSA-4mxg-3p6v-xgq3) at range `*`**, with `@xmldom/xmldom@0.7.13`
  underneath it. `@node-saml/passport-saml@5.1.0` audits clean. §12's scan gate now
  blocks only on findings that **have a published fix** (Rich, 2026-09-08) — and it
  still has teeth: the xmldom highs blocked until an npm `override` to 0.8.15.
- **Two libsodium seals of one value differ even when the data key is SHARED**, so
  "the ciphertext differs" proves nothing about per-secret keys. The nonce is random
  and `crypto_box_seal` draws an ephemeral keypair per call, so both `ciphertext` and
  `wrappedKey` change either way. Measured 2026-09-08 by hoisting the data key out of
  `sealSecret`: the test written to catch exactly that stayed green. The observable
  consequence of reuse is that one envelope's wrapped key opens **another's**
  ciphertext — assert that instead.
- **An APPLIED drizzle migration is never re-run**, because `drizzle/meta/_journal.json`
  records it by tag. Editing a migration file that has already run changes nothing on
  any existing database and everything on a fresh one, so the two diverge silently.
  New SQL needs a new migration. `drizzle-kit generate` also names the file itself, so
  a plan naming `0001_something.sql` is naming a file that will not exist.
- **`drizzle-kit migrate` needs `MANIFEST_DATABASE_URL` exported**, which `.env` does
  NOT contain — `.env` carries `POSTGRES_PASSWORD` and the URL is derived from it
  (`vitest.env.ts` does this for tests). README's *Running the control plane* has the
  two-line export; without it the failure is `Please provide required params for
  Postgres driver: [x] url: undefined`, which reads like a broken config file.
- **macOS `openssl` cannot emit a raw X25519 key**, and libsodium wants the bare 32
  bytes. `openssl pkey -outform DER | tail -c 32` works for both halves because RFC 8410
  fixes the prefix lengths (48 DER bytes private, 44 public). **Length proves nothing
  about correctness** — a wrong extraction still yields 32 bytes — so seal and open with
  the file's own two halves before trusting it. `infra/lib/ensure-master-key.sh` does it
  this way and it was verified against libsodium on 2026-09-08.
- **Verdaccio caches a tarball when it is DOWNLOADED.** `npm install
  --package-lock-only` resolves metadata and downloads nothing, so a warm step that
  uses it leaves the mirror holding package documents and **no `.tgz`** —
  indistinguishable from a warm mirror until the network goes away.
  `find /verdaccio/storage -name '*.tgz'` is what tells the two apart. **`make verify`
  now asserts this standing**, for every blueprint and fixture lockfile — 210 tarballs
  as of 2026-09-09 — because Verdaccio *proxies* whatever it does not hold, so a cold
  mirror and a warm one behave identically right up until C1 matters. **Measured as a
  negative control on 2026-09-16 (P4c finding 55):** with `connect-mongo` moved out of
  `/verdaccio/storage`, a real build of `node-ts-mongo@1` passed, and Verdaccio had put a
  byte-identical tarball back from npmjs by the time it finished. So "empty the mirror and
  rebuild" **cannot fail with the network on**; `make verify` named the missing tarball
  and its lockfile, and is the control to use.
- **A `cat <dir>/*` stamp is a TOP-LEVEL glob and cannot see a subdirectory.**
  `fixtureBareRepo` used one, and no source tree here had a subdirectory until
  `node-ts-mongo@1`'s `skeleton/auth/`. Measured 2026-09-09: editing
  `auth/ubcshib.js` left the hash byte-identical, so the cached bare repo would have
  been reused and the build would have tested the code *before* the edit — the same
  shape as the stale container that served four runs of a suite. It is `find -type f`
  over names **and** contents now.
- **A shell fragment inside a TypeScript template literal has its escapes eaten by
  TypeScript.** `` `… | tr '\n' '\0' | …` `` compiles to a string containing a real
  NUL byte, and `execFileSync` refuses it: *"args[1] must be a string without null
  bytes."* Double the backslashes. Same family as the Prettier trap — the edit applies
  cleanly and the thing it produces is not what it reads like.
- **A `process.env.X` scan counts COMMENTS, and the dangerous half is silent.** A
  comment mentioning a variable invents a requirement, which is noisy and obvious; a
  read that has been **commented out** still matches, which means "the blueprint reads
  every variable the platform injects" passes against a variable the running app never
  reads. `spec/injection-drift.test.ts` strips comments and string bodies with a
  scanner rather than a regex — `'//'` inside a string is not a comment.
- **`tsc` will not follow a relative import outside the package's `rootDir`**, so a
  test importing app-side blueprint JavaScript is a TS7016 error `pnpm test` cannot
  see. `blueprints/attribute-bridge.test.ts` loads it through a computed specifier with
  one explicit cast — and that cast must spell out its key union, because
  `noUncheckedIndexedAccess` makes an indexed read `string | undefined` and a computed
  key of that type becomes the literal string `"undefined"`.
- **LiteLLM's admin API answers its OWN errors in a route denial's envelope.** It is
  FastAPI, so an unknown route is `404 {"detail":"Not Found"}` and a refused body
  `422 {"detail":[…]}` — the same `{"detail": …}` shape `allowed_routes` refuses with, and
  the 422 echoes the refused `input` back. `mapLiteLlmError` treats a `detail` body as a
  route denial **only on a 403**. Measured 2026-09-14, LiteLLM 1.98.0.
- **A LiteLLM key with a `models` list never sees "unknown model".** Any model off its
  list, existing or not, is `403 key_model_access_denied`; S3's `400` with `type: "None"`
  comes only from a key with no list, such as the master key. Every app key carries a
  list, so an app's misspelt model reads as *not permitted*. Measured 2026-09-14.
- **LiteLLM's errors reach callers as a code and a status, never as text** — that is
  `ai/client.ts`'s job. So a caller that matches an error MESSAGE (`/already exists/`)
  never matches. A duplicate `/user/new` is **409**; test the status.
- **`pnpm test -- <filter>` does not filter** — it runs every file. The one-file loop is
  `pnpm exec vitest run --project unit src/ai/errors`.
- **Node's `JSON.parse` QUOTES the text it could not parse** in its `SyntaxError`, so
  letting one propagate from a third-party body leaks the body. `ai/client.ts` catches it
  on the success path as well as the error path.
- **A Docker network removed under a STOPPED container leaves that container unable to
  start.** A stopped container keeps a network connection the network's own read-back does
  not list, so `network rm` succeeds — and then `docker start` fails with `failed to set up
  container networking: network … not found`. Measured 2026-09-14 on a throwaway container.
  A force-disconnect of a stopped container works, and one that is not attached answers `is
  not connected to the network`. That is why `destroyAppNetwork` sweeps every platform
  neighbour as well as what the network lists: a read-back-only teardown run while
  `manifest-litellm` is stopped would leave the gateway unstartable.
- **An empty `model_info:` in `infra/litellm/config.yaml` stops LiteLLM starting — for
  every app.** Deleting the only key under it leaves the mapping null, and 1.98.0 exits on
  start (`TypeError: argument of type 'NoneType' is not iterable`, `Application startup
  failed. Exiting.`), restarting every ~10 s. Measured 2026-09-14. So §7's "an unclassified
  model refuses only itself" holds only while `model_info` is still a mapping: to take a
  classification away, make it invalid, never delete the line.
- **Two Bash tool calls issued together share one shell**, so a `cd` in one moves the
  other's working directory mid-command. Measured 2026-09-14, when a guard refused seven
  edits it could no longer find. Use absolute paths in anything issued in parallel.
- **The Docker tier leaves images in the daemon, and one image can carry two names.**
  Deploys pull what the builder pushed into the daemon's store as
  `127.0.0.1:7107/local/<slug>@sha256:…`, so a before/after snapshot shows new `<none>`
  entries even when nothing else changed. Remove one only if its digest is absent from the
  starting snapshot under EVERY name: two fixtures built from the same source share a digest
  (`local/fixture-s6` and `local/fixture-rt`), `docker image rm <id>` then answers
  `referenced in multiple repositories`, and untagging one name only moves the diff to the
  other. Measured 2026-09-14, when four were left behind.
- **`npm install` warms NOTHING a developer's npm cache already holds.** npm takes a tarball
  out of `~/.npm` by its integrity hash and never asks the registry, so a package this machine
  has installed anywhere before is never downloaded through Verdaccio and never lands in its
  storage. Measured 2026-09-14: seed's warm printed no `WARN` and exited 0 while
  `npm --loglevel http` showed 135 of 135 packages `(cache hit)` and zero fetches, and
  `make verify` listed every new tarball MISSING. A clean second machine warms correctly;
  the developer's own never did. Seed's warm now passes an empty `--cache` per lockfile.
  **`make verify`'s mirror check is what caught it** — the storage `ls` a plan tells you to
  run shows the same emptiness and suggests re-seeding, which cannot help.
- **`docker-credential-desktop get` can hang, and then every BuildKit lookup of a Docker Hub
  tag dies with `DeadlineExceeded`.** Measured 2026-09-14: `make seed` failed twice at step 2
  (`load metadata for docker.io/library/php:8.3-apache … context deadline exceeded`) while
  `curl` reached Docker Hub in 0.3 s from the host and from the VM with 100 of 100 anonymous
  pulls left — curl never asks the credential helper. `docker buildx imagetools inspect`
  hung the same way. Diagnose with
  `echo https://index.docker.io/v1/ | gtimeout 20 docker-credential-desktop get >/dev/null`
  (exit 124 is the hang). **Each hung call leaves a `docker-credential-desktop get` process
  parented to launchd** — list and kill the ones your commands started. It stops seed before step 4b's npm warm,
  which does not need Docker Hub at all. **Restarting Docker Desktop cleared it** (Rich,
  2026-09-14): afterwards the helper answered in under a second, `docker buildx imagetools
  inspect php:8.3-apache` in 1 s, and `make doctor` and `make verify` were 18/0 and 47/0.
- **zsh expands a word beginning with `=`**, so `echo =====` fails with `==== not found` and
  **abandons the rest of the command**. Quote separators: `echo '-----'`. Measured 2026-09-14.
- **A background command reports its LAST command's exit status.** `make seed > log;
  echo "exit=$?" >> log` told the harness *completed, exit 0* while the log said `exit=2`.
  End such a wrapper with `exit $rc`. Measured 2026-09-14.
- **`ls` is aliased to a long listing here**, so `$(ls -d path/*)` captures whole listing
  lines rather than paths. Use a glob or `find`.
- **`grep` in the agent's Bash tool is a shell FUNCTION backed by `ugrep`**, which reads a `$`
  inside a pattern as an anchor. `grep -c -- '--cache "$tmp/.npm-cache"'` counted 0 against a
  file containing that exact line, and the `&&` guard built on it silently skipped the step it
  was guarding (2026-09-14). Use `grep -F` for any pattern with a `$` in it.
- **Vitest cannot mock a CommonJS package imported by app-side ESM outside the package.**
  Measured 2026-09-14 with `ubc-genai-toolkit-llm`: `vi.mock` was not applied and the package
  loaded under the wrong path (`Cannot find module './types'`). `blueprints/ai-component.test.ts`
  runs such code in a child `node` process instead, against a fake gateway.
- **An applied migration that is missing a line is REPLAYED, not patched.** Measured 2026-09-14: migration 0005's `GRANT` never reached the file — `F=$(ls drizzle/0005_*.sql)` captured a long listing, because `ls` is aliased — and `drizzle-kit migrate` created the table with no privilege for `manifest_app`. Appending the line afterwards changes nothing on that database. Delete its row from `drizzle.__drizzle_migrations` by `created_at`, drop what it created, fix the file, and migrate it as it ships. Check with `\dp`.
- **zsh does not word-split an unquoted variable.** `PSQL='docker exec … psql'` then `$PSQL …` runs one command whose name is the whole string — `command not found`. Use a shell function. Measured 2026-09-14.
- **A single-connection transaction hides an ordering race.** Inside `withRollback` every query runs on one connection, in order, so a status UPDATE issued before a log INSERT has landed still queues behind it — deleting the `await` that orders them left the test green. The control plane runs on a pool, where the two race. To make such a property observable, run on the pool and hold `LOCK TABLE … IN ACCESS EXCLUSIVE MODE` from an admin connection (`releases.test.ts` does). Measured 2026-09-14.
- **Docker CLI 29.7.2 forwards SIGTERM to the `docker-buildx` plugin**, so killing the `docker` process alone stops a real build — measured with buildx v0.36.1-desktop.1. `runStreamed` kills the whole process group anyway, for a CLI that does not.
- **`mongodb/mongodb-community-server` answers a loopback `ping` before it enforces authentication — so a `ping` is not readiness.** `7.0.28-ubi8` first runs an init `mongod` on `127.0.0.1` with no auth while it creates the user and runs `/docker-entrypoint-initdb.d`, then restarts it with `--auth --bind_ip_all`. Measured 2026-09-14: healthy at 9.6 s, an authenticated insert from another container refused until 33.8 s (P4b finding 133). **Fixed 2026-09-15, sitting 8:** the catalogue's check is an *unauthenticated* `listDatabases` that must be REFUSED with code 13 — the init `mongod` allows it and the final one refuses it, because the localhost exception closes once a user exists — so a service is healthy only once it enforces its credentials, and a Mongo started with no authentication never is. Measured with a 20 s init script: the check flipped 240 ms after the final `mongod` began listening. **A container created before the fix keeps its old check** — the two demo databases on this machine among them — until something recreates it. The image has **no** `/docker-entrypoint-initdb.d` directory, so an archive upload into it must extract at `/` with the directory in the entry's name. `getent hosts "$(hostname)"` answers `::1` first inside that image; `hostname -i` gives the container's IPv4 address.
- **Docker 29.7.2 honours a healthcheck's `StartInterval`** (Engine API 1.44, which `engine.ts` pins). Measured 2026-09-15: checks 1.2 s apart until the first success, then 30 s apart. A one-second `mongosh` check for a service's whole life costs about a core a run — the two demo databases sat at ~30% CPU idle, against 0.62% on the new cadence (P4b finding 134).
- **A deploy that never becomes ready is a `200` whose `state` is `failed`, with an Incident — on both drivers.** Since P4b Task 13 the Docker driver refuses readiness by throwing `InstanceNotReadyError`, which carries the handle, and `deployRelease` records it instead of rethrowing; until then the same failure was a `500 INTERNAL` with the row parked in `provisioning` and no record of why. A script has to check that `state` is `healthy`, not that a state came back — `make demo` and `make demo-identity` now do. `GET /environments/:environmentId/incidents` has the exit, the last 200 log lines, the diff since the last healthy release and a repair prompt.
- **`@fastify/websocket` 11.3.0 routes an upgrade through Fastify's router, so a route's hooks run BEFORE the socket upgrades** — and a hook that throws answers the upgrade with an ordinary HTTP status, after which the plugin destroys the socket. Authorize a stream in a `preValidation` hook, never only inside `wsHandler`, which runs after the upgrade: there a refusal can only be a close code, on a socket the stranger already holds. Read from its `index.js`, and measured by P4b sitting 9's controls (findings 155).
- **`websocket: true` beside `handler` and `wsHandler` is a trap**: the plugin then uses `handler` as the socket handler and answers every plain GET `404`. Declare such a route in full, without the flag (P4b finding 156). The plugin also wraps EVERY route's handler, not only WebSocket routes (170).
- **`app.inject` cannot perform a WebSocket upgrade**, so a stream's refusal of a stranger is provable only against a listening server (`app.listen({ port: 0 })`). `api/events.test.ts` asserts the HTTP status on `ws`'s `unexpected-response`, which only a refusal before the upgrade can produce. A `ws` client with no `error` listener turns a refused upgrade into an uncaught exception on whichever test runs next.
- **Postgres `now()` is the TRANSACTION's start time**, so every row one transaction inserts with a `now()` default shares one timestamp, and anything ordered by it comes back in the index's order. `audit.events.created_at` is `clock_timestamp()` since migration 0007. Measured 2026-09-15 (P4b finding 157).
- **A `ws` client that is `pause()`d never reads a close frame queued behind data it has not read**, so a backpressure test that pauses and never resumes cannot see the server's 1013. Measured 2026-09-15, `ws` 8.21.3 (P4b finding 165).
- **Every deploy opens the app's WHOLE secret set**, to redact what it records, and does it before it mints anything (P4b finding 162).
- **Node 24's global `WebSocket` sends a `cookie` header passed in `{ headers }`** — undici's, measured on Node 24.12.0 against a server that printed the upgrade (P4b sitting 10). So a stream subscriber needs no dependency: `scripts/lib/event-stream.mjs` is one. What it cannot see is a refused upgrade's HTTP status — a stranger's `404` arrives as an `error` event and close `1006`.
- **In LiteLLM's spend log, `user_id` is the APP and `end_user` is the PERSON.** `/spend/logs?user_id=` filters on the LiteLLM user a key was minted under — `mf-<projectId>-<env>`, one per app and environment — and says nothing about who asked; the `user` an app sends lands in each row's `end_user`, which `/spend/logs/v2?end_user=` filters on. **A spend row carries none of the key's `metadata`**, so `manifest_project` cannot be read back from spend. Measured 2026-09-15 on 1.98.0.
- **`ubc-genai-toolkit-llm` 0.7.0's errors say nothing about their class.** Every SDK failure becomes the toolkit's `APIError` with `details.type` `'Error'` — the OpenAI SDK's error classes set no `name` — and `code` the HTTP status, or 500 when there was none. A gateway that cannot be reached is `code` 500 with the SDK's own message `'Connection error.'` (or `'Request timed out.'`), which is the only thing that tells it from a 500 the gateway sent. The toolkit builds its client with no `timeout` or `maxRetries` and exposes neither, so the SDK's 600 s and two retries apply: measured 2026-09-15, a refused connection answered in **1.2 s**, an unresolvable gateway in **16.5 s**, and a kept-alive socket to a gateway detached from the network in **611 s**.
- **`curl -sS` exits 0 on an HTTP error**, so `until curl -sS …/healthz; do sleep 1; done` stops at the edge's first `502`. A wait loop needs `-f`. It cost a control run on 2026-09-15.
- **`pnpm test` and `make reset` both leave `.manifest/repos` behind, and `pnpm test` leaves LiteLLM's users and keys too.** The next `POST /projects` for a surviving slug answers `SOURCE_GIT_FAILED` after committing the project row, and a project `pnpm test` removed keeps a live, confined key (P4b findings 178 and 183; RUNBOOK's *Known gaps*).
- **`docker ps --filter name=A --filter name=B` is an OR, not an AND** — and **`docker rm -f` exits 0 for a name that does not exist.** Measured 2026-09-15 (P4b finding 192), cleaning up leaked app containers: `--filter 'name=^mf-proof-app-staging-' --filter 'name=-app$'` listed another app's container and the proof app's own DATABASE and egress. The removal did nothing only because zsh passed the whole list as one argument, and it still printed "removed". Filter once and narrow with `grep`, name what you remove explicitly, and list afterwards.
- **A container name longer than DNS's 63-octet label does not resolve, and the failure names the wrong thing.** Measured 2026-09-15 from inside `manifest-caddy`: a 72-character container name answers `curl: (6) Could not resolve host: … (Misformatted domain name)` and `getent hosts` gives nothing, while a 17-character one answers 200. Caddy dials an upstream **by name**, and `mf-` + a 39-character slug + `-staging-` + 8 + `-` + 8 + `-app` is 72 characters — which is why P4c dials a bounded per-instance alias instead of the container name.
- **Caddy keeps counting an upstream whose route has moved away, until its in-flight request ends — and only then unlists the address.** Measured 2026-09-15: `GET /reverse_proxy/upstreams` reported `num_requests: 1` for 4,000 ms after a `PATCH` moved the route, the whole time a held request was in flight, and the address went missing from the list only after that request finished. The control: with a second, unreachable route still referencing the same address, it stayed listed and went 1 → 0 when the request ended. So the pool counts addresses the **configuration** references, and for a moved-away upstream *unlisted* means *idle*.
- **A `headers` handler must be `deferred` for the edge's value to REPLACE an app's own.** Measured 2026-09-15 against an app serving its own `X-Manifest-Instance`: with `deferred: true` the response carries only the edge's value; with `deferred` absent **both** are present and a client's `headers.get()` returns the joined string `"edge-value, forged"`. This applies to §20's four security headers too, which is what "protections live where an app cannot remove them" depends on.
- **The edge's wildcard answers `200 manifest OK host=… scheme=https` for ANY path**, not only `/` — measured 2026-09-15 on an unrouted hostname with `/never-ready`. So a status-only readiness probe against a hostname with no route passes whatever path it asks for. This is P4b finding 193's general form.
- **Destroying a container does not let an in-flight request finish, where moving a route does.** Caddy lets a proxied request complete on the upstream it started on across a route move (P4c brief §3.3); a same-release redeploy today **deletes** the live container, and an AI question in flight when that happens comes back **502** — measured three times on 2026-09-15 (2,493 ms, 8,223 ms, 585 ms in).
- **The two fixture apps are not interchangeable, and NEITHER of them 404s an unknown path.**
  `fixtureBareRepo()` builds `fixtures/fixture-app`, which does `await client.connect()` **before**
  `server.listen` and exits if Mongo is not there — measured 2026-09-15 with no service
  provisioned: `node server.js` running, nothing bound, an empty log for 30 s, then
  `MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`, which a readiness probe reads
  as 87 attempts of `000`. `ensureContractRepo()` builds `blueprints/fixture-node/skeleton`, which
  needs no database. **Both** end in a catch-all `200`, so "point the health path at something the
  app does not serve" does NOT make an instance never-ready for either of them; only the **proof
  app** (Express) answers 404. Use a port nothing is bound to instead, as
  `roundtrip.docker.test.ts` and `redeploy.docker.test.ts` both do.
- **`demux` yields one record per LINE with the terminator stripped**, because it exists for §14's
  log stream where a line is the unit. Anything reading a container's stdout for a **multi-line**
  value has to put the newlines back: measured 2026-09-15, a two-line `curl -w` format concatenated
  into `20033333333-3333-…`, so the status parsed as 20,033,333,333. No unit test can see it — the
  probe is faked in both tiers — and a one-line format has no newline to lose, which is why it
  survived from P3 to P4c unnoticed.
- **`s6.docker.test.ts` probe 14 can fail once in a FULL `pnpm test:docker` and pass alone.**
  Measured 2026-09-15: `/v1/embeddings` came back `000` in the same test where `/v1/models` and
  `/v1/chat/completions` had just returned 200 from the same network with the same key, so
  neither the gateway attachment nor the key explains it; the file alone was 17 of 17 and the
  next full tier was green. On an idle machine with both Ollama models unloaded first, probe
  14's own order measures a cold chat at **3.54 s** and a cold embedding at **0.30 s**, so a
  cold model load does not account for `statusFromNetwork`'s 15 s bound being exceeded.
  **Cause not established, and the bound was deliberately NOT raised** — raising a timeout to
  remove a flake whose cause is unknown hides whatever it might be. Re-run the file before
  concluding anything from it.
- **`pg_advisory_unlock` on a DIFFERENT connection from the one that locked is a WARNING, not
  an error.** A session-level advisory lock belongs to the connection that took it, so
  releasing it through `pool.query` leaves the lock held for the life of that pooled
  connection while the call itself looks successful. Measured 2026-09-15: the serialization
  test timed out at 5,006 ms and Postgres logged `WARNING: you don't own a lock of type
  ExclusiveLock` five times. `withEnvironmentLock` takes and releases on one `pool.connect()`
  client, in a `finally`.
- **A bigint advisory key is reassembled from `pg_locks` by MASKING, never by shifting.**
  Postgres stores it as `classid` = the high 32 bits, `objid` = the low 32 bits, `objsubid`
  = 1, both `oid` — so `(classid::bigint << 32) | objid::bigint` overflows `int8` for any key
  with the high bit set. Use `((hashtextextended(k,0) >> 32) & 4294967295)::bigint::oid` and
  `(hashtextextended(k,0) & 4294967295)::bigint::oid`. Verified 2026-09-15 for a positive key
  and a negative one.
- **`TRUNCATE … CASCADE` truncates the tables that REFERENCE the named ones**, so a new child
  table is emptied by its parent being in the list and Postgres says so —
  `NOTICE: truncate cascades to table "routes"`. Naming it in the harness's list is belt and
  braces, not the thing that makes a run repeatable, and a control built on leaving it out
  cannot fail (P4c finding 36). Measured 2026-09-15.
- **The retirer opens the app's WHOLE secret set before it removes anything, so a set it
  cannot open stops every reap of that environment — silently.** `retireEnvironment`
  builds §14's redactor first, and §14's redaction fails closed, so an app whose secrets
  were sealed under a different master keypair throws `SECRET_UNWRAP_FAILED` before the
  first `retireInstance`; `createRetirer`'s own catch turns that into one line on stderr
  and the pass reports nothing. Measured 2026-09-15 at the boot tier: the routes were
  restored, the boot line said so, and both containers were still running 120 s later.
  Anything that deploys an app in one process and expects ANOTHER process to reap it must
  use the platform's own key — `infra/secrets/master.key`, through `loadMasterKeypair` —
  not a generated one (P4c finding 46).
- **Two `createFakeDriver()`s hand out the SAME instance handles.** Each counts its own
  from `inst-1`, so two fixtures that each build a driver both call their instance
  `inst-1` and every id-keyed assertion silently matches the wrong one. Measured
  2026-09-15: `recover.test.ts`'s "carries on with the rest" test refused both routes and
  read as a defect in the code under test. A fixture that may be used twice takes a
  driver (P4c finding 48).
- **A connection reset carries no identity header, and it can land last.** R1 tolerates
  about one reset in 300 per admin change, so a request loop's FINAL record may be a
  status-0 with an empty `X-Manifest-Instance` — which fails `seen.at(-1).instance` on an
  otherwise perfect run. Read the requests that were ANSWERED, and assert instead that
  none of them lacks the header (P4c finding 49).
- **`npm install --package-lock-only pkg@1.2.3` writes `"pkg": "^1.2.3"` into `package.json`.**
  The version on the command line decides what is installed, not what is saved; npm's
  default save prefix is `^`. Measured 2026-09-16 on npm 11.6.2 (P4c finding 57). Every
  blueprint pin is exact (C6, D30) and `blueprints.test.ts` holds the skeleton's
  `package.json` equal to `blueprint.yaml`, so pass `--save-exact`. npm also rewrites a
  hand-compacted `"engines": { … }` onto three lines.
- **`make seed` REBUILDS the platform images, and what it rebuilds is not always what was
  running.** Measured 2026-09-16 (P4c findings 58 and 62), by diffing
  `scripts/snapshot-machine.sh` across a seed: `manifest-dnsmasq:local`, `manifest-idp:local`,
  `manifest-caddy:local` and `manifest-egress:local` all came out with **new image IDs**
  (`docker images`' *CreatedAt* still says 2026-08-29 for dnsmasq — that is not the build).
  Three consequences, each measured:
  1. **The IdP moved.** Its Dockerfile runs `composer create-project
     simplesamlphp/simplesamlphp:^2.0` — a RANGE — and seed built it from nothing, so the
     running IdP is now **SimpleSAMLphp v2.5.3.1** (composer root), where S2 measured 2.4.9 on
     the reference IdP. **The image it replaced is gone, so the version it ran is unrecorded.**
     Every identity tier passed on the new one (the Docker tier's login suites, a real login in
     `node-ts-mongo.docker.test.ts`, and `make demo-redeploy`'s CWL sign-ins) — which is §16's
     identity tier doing the job S2 wrote it for. **Rich, 2026-09-16: do not pin it — keep it
     current** (§8). Record the version a seed leaves running:
     `docker exec manifest-idp grep -m1 '"version"' /var/simplesamlphp/composer.json`.
  2. **Seed's step 5 (`compose up -d dns-containers dns-host caddy`) RECREATED both dnsmasq
     containers onto the rebuilt image, and a recreated `manifest-dns-containers` is on NO app
     network** — `ensureAppNetwork` attaches it to every one (`PLATFORM_NEIGHBOURS`) and
     nothing re-attaches it until each app is deployed again. Put back by hand with
     `docker network connect <net> manifest-dns-containers`. No consequence was measured: an
     app container failed `getent hosts idp.manifest.internal` both before and after.
  3. **`manifest-caddy`, `manifest-egress` and every app's egress container were NOT
     recreated**, by seed or by the `make up` after it, and still run the previous, now
     untagged images. Why compose treated them differently from dnsmasq and the IdP was not
     established. The next recreate — `make reset`, or a changed service definition — moves
     them onto the rebuild. **Measured 2026-09-16 (P4c sitting 8):** `make reset` then `make up`
     put `manifest-caddy` on `manifest-caddy:local` `4926f9a62410` and `manifest-egress` on
     `fcbbbde15c72`, and doctor, verify, both test tiers and `make demo-redeploy` were green on them.
- **A `200` from a `*.manifest.internal` name can be the edge's wildcard page, not the app** — its body is `manifest OK host=… scheme=https`. `routes.docker.test.ts` restarts the edge, which drops every runtime route, so after `pnpm test:docker` every demo hostname answers 200 with that body while its containers stay up and healthy (P4b finding 193). A reachability check reads the body, never only the status. A secret sealed under a different master keypair — a test fixture that binds two, or a key file replaced under a database that kept its rows — refuses every deploy of that app with `SECRET_UNWRAP_FAILED`, where it once failed only CWL deploys and failed ones.
- **An `nc` one-liner is not an HTTP server, and behind the edge it produces a 502 that looks like
  the edge's.** `printf "HTTP/1.1 200 OK…" | nc -l` writes its response the moment a connection
  opens, before any request — measured 2026-09-16 by connecting and sending nothing. The edge
  keeps pooled connections to an upstream, so one it parks receives an answer nobody asked for:
  Caddy logs `Unsolicited response received on idle HTTP channel`, then an empty `502` as
  `readLoopPeekFailLocked` for whichever request was handed that connection. It failed a full
  `pnpm test:docker` and was first mistaken for a config-reload defect (P4c finding 74). Put a real
  server behind the edge — `routing/testing.ts`'s `stubAppArgs` — and read the log line BEFORE a
  502, not only the 502.
- **A green `make demo-redeploy` does not prove four of the things it looks like it proves.**
  Measured 2026-09-16 (P4c sitting 8) by removing each and watching the acceptance stay green:
  **(1) an in-place route move** — delete-then-insert leaves a gap of milliseconds, and the
  acceptance samples every 200 ms because §20's 600/min per-IP limit is shared by both its loops;
  `routes.docker.test.ts`'s 20 moves at 25 ms is the test that goes red (and the single-move
  takeover in `runtime/docker/redeploy.docker.test.ts` does not). **(2) The drain** — the route
  moves ~1.3 s into a ~5.4 s deploy and the retirer starts only when the deploy returns, so the
  question a move leaves on the old instance has usually finished before any drain begins; a 1 ms
  bound changed nothing. The driver contract's *a retire waits for a request that is in flight* is
  the test; the summary's `inFlightAtRetire` says whether a run happened to exercise it (once in
  ten redeploys). **(3) Revoking the old AI key only after the drain** — LiteLLM checks a key when a
  request starts, and the question under way made its calls long before; `releases.test.ts`'s
  *a redeploy leaves the REPLACED instance's key alone* is the test, and nothing tested it before
  that sitting. **(4) The retirer's nothing-serves guard** — nothing in a run makes a pass find
  nothing serving; `retire.test.ts` and the driver contract's serving refusal are the tests, and a
  staged boot with no `Route` record after an edge restart removed the app within a second with
  both guards gone.
- **`console.manifest.internal` refuses every source but the host — by design.** Since P5a Task 3 it is
  the API's origin: a Caddyfile site that forwards `/v1/*` and `/auth/*` to the control plane on the host
  and answers everything else with `manifest console: not built yet`, inside a `route` that first refuses
  `not remote_ip 10.89.0.1/32` with **`403 manifest: the control plane is not reachable from this
  network`**. A container on `manifest-platform` gets that body, and so does a deployed app (S6 probe 15).
  So **`make verify`'s edge probes moved to `edge.manifest.internal`**, a reserved label no site names,
  which the wildcard answers everywhere — and `scripts/offline-acceptance.sh`'s C1 parity step with them.
  **After `pnpm test:docker`, restart the control plane**: the tier re-registers the platform's SP row at a
  loopback ACS, and a sign-in through the console then fails at `idp_login`'s ACS comparison until the
  boot puts it back.
- **Saving `infra/caddy/Caddyfile` can leave the edge unable to see it at all.** It is a SINGLE-FILE bind
  mount, bound to the file's inode, and a save that writes a new file and renames it over the old one —
  the agent's edit tool did, and so does `git checkout` — leaves `manifest-caddy` on the deleted inode:
  measured 2026-09-16 (P5a sitting 2), `/etc/caddy/Caddyfile` was *No such file or directory* inside the
  container and `make up` exited 1 at the reload. **`infra/lib/ensure-caddy-config.sh` now compares the
  hash the edge reads with the host's and restarts the edge to re-bind when they differ**, then fails
  loudly if a restart did not fix it. The same shape would hit any other single-file mount —
  `infra/litellm/config.yaml` is one.
- **Every Caddy admin-API change reloads the WHOLE config, and a reload closes every WebSocket the old
  config proxied with `1001 Going Away`** — unless its `reverse_proxy` sets `stream_close_delay`.
  Measured 2026-09-16 (P5a sitting 2): one PUT of an unrelated route closed an event stream through the
  console in under 3 s, and `make demo-ai` failed at step 5 with `1001`, because a deploy moves routes.
  The console site now sets `stream_close_delay 1h`, and with it the same stream survived a PUT and a
  DELETE and `make demo-ai` was green. **An app's own WebSockets are NOT covered**: `routing/`'s runtime
  routes carry no delay, so any deploy anywhere closes every app's proxied WebSockets — named, not fixed.
- **An app container's PID 1 is `node`, which never reaps the orphans it adopts — and no init is set.**
  Measured 2026-09-16 on `node:22-alpine` with `--pids-limit 64`: twenty backgrounded `sleep 2`s from an
  exited `sh` stayed in state `Z` under ppid 1, holding their pids; after `s6.docker.test.ts` probe 11's
  fork loop, `pids.current` was still 64 seventeen seconds on and `docker exec … node` could not start at
  all. So **any S6 probe that execs into the app must run BEFORE probe 11** (probe 15's placement says
  why), and an app whose children leave grandchildren behind slowly spends its `PidsLimit`. `Init: true`
  on the container would reap them; it is not set — named, not fixed.
- **`make demo-redeploy`'s *a question in flight when the route moved* can fail by chance.** Measured
  2026-09-16 (P5a sitting 2): the same-release move landed at +1367 ms, in the 47 ms between one
  question's answer (+1331) and the next one's start (+1378), so no question spanned it and the run was
  23 of 24; the re-run was 24 of 24. Read `acrossMoveMs` in that phase's summary before treating the
  assertion as a regression.
- **`make verify` straight after `make reset && make up` fails *the events table is append-only by
  GRANT*** (47 checks, 1 failed) until `pnpm --filter @manifest/control-plane db:migrate` runs —
  the reset leaves the database empty. Measured 2026-09-16; not a defect in the grant.
- **A request carrying a Manifest session must carry `Origin: https://console.manifest.internal`** —
  every `POST`, `PUT`, `PATCH` and `DELETE`, and every event-stream upgrade — or it is `403
  CSRF_ORIGIN_REFUSED` (P5a Task 4, §20). A deployed app is same-site with the console, so a `SameSite=Lax`
  cookie alone proves nothing. `scripts/lib/api.sh` and `event-stream.mjs` send it; a hand-written `curl`
  with a session jar needs `-H "origin: https://console.manifest.internal"`. Measured through the real edge
  on 2026-09-16: a foreign origin and no origin both refused, the console's accepted — so Caddy neither
  strips nor adds one. A refused upgrade reaches a Node WebSocket client as close `1006` with no status.
- **A sign-in to Manifest completes only in the cookie jar that STARTED it.** `GET /auth/login` sets
  `manifest_login` (a nonce, `Path=/auth`, ten minutes) and sends the nonce as `RelayState`; the callback
  refuses an assertion whose `RelayState` is not that cookie's as `401 SAML_LOGIN_NOT_BOUND`, before node-saml
  sees it. `infra/lib/idp-login.sh` carries both; a hand-rolled walk that drops hop 1's cookie, or does not
  post `RelayState` back, ends with no session and that line on the control plane's stderr. A sign-in lands
  on `/` (the console's placeholder) unless it was started with `?returnTo=/v1/me`.
- **Fastify refuses an unreadable request BEFORE any route or hook runs, and `setErrorHandler` still receives
  it** — an `FST_` code with a 4xx `statusCode`. Until P5a Task 5 all four measured (a malformed JSON body, an
  empty one, `text/csv`, a body over 1 MiB) answered `500 INTERNAL` with an "unhandled error" operator line;
  `api/errors.ts`'s `frameworkRefusal` maps them to `REQUEST_INVALID`, `REQUEST_MEDIA_TYPE_UNSUPPORTED` and
  `REQUEST_BODY_TOO_LARGE`. **Every code a client can receive is in `api/error-codes.ts`**, held to the source
  by a test in both directions — a new code thrown anywhere turns `pnpm test` red until it is registered.
- **`packages/contract/openapi.json` is GENERATED from the route definitions, and a stale copy turns `pnpm test` red** —
  `api/contract/document.test.ts` compares it byte for byte and names the first stale line (P5a Task 6). `pnpm contract:write`
  rewrites it, and **it truncates the control plane's tables**, because it is that test run under the `unit` project, whose global
  setup truncates for any file. It is excluded from Prettier: `JSON.stringify` does not wrap arrays as Prettier does.
- **zod 3.25.76's `z.registry().get()` INHERITS a schema's parent metadata and deletes only the `id`** — so a `.describe()` copy of
  a registered schema answers `{}`, not `undefined`, while `.has()` answers `false`. Measured 2026-09-16 (P5a sitting 4): a check
  for "registered" on the metadata alone let `openApiDocument` emit `"$ref": "#/components/schemas/undefined"`. Ask for the `id`.
- **`tsc` writes its errors to STDOUT**, so `pnpm --filter … build >/dev/null` discards them and leaves only the exit code.
  `scripts/demo-journey.sh` did exactly that until P5a sitting 5 (control (e)): a journey that no longer type-checked ended at
  `make: *** [demo-journey] Error 2` with nothing naming the cause. Capture `2>&1` and print it on failure.
- **`pnpm audit --filter <pkg>` does not scope to the package** — it reports the whole workspace. Measured 2026-09-16 on
  pnpm 11.24.0: `--filter @manifest/contract` listed seven advisories, every path `.>vitest>…`; `--prod` is what isolates a
  package's runtime closure. **The workspace's own test toolchain carries a Critical and a High** — `vitest` 2.1.9 (an arbitrary
  file read while the Vitest UI server listens; patched ≥3.2.6) and `vite` 5.4.21 (`server.fs.deny` bypassed on Windows) —
  plus five moderates, none reachable as used here (no UI server, no dev server, macOS). The second measurement of *nothing
  scans the control plane's own dependency tree*; not upgraded.
- **A status-only `404` expectation is satisfied by a route that does not exist.** An unmatched path answers `404
  ROUTE_NOT_FOUND` (P5a Task 2), so the authorization contract suite's *stranger → 404* passed for both of P5a Task 8's new rows
  before either route was written — measured 2026-09-16, 8 of 10 cases red where the plan predicted 10. The suite now pairs each
  expected status with its code (`NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, …); CLAUDE.md's *name the refusal's CODE* is the rule.
- **Postgres `jsonb` hands an object back with its keys reordered — by length, then bytes** — so a value read from a jsonb column
  is not `JSON.stringify`-equal to the same value freshly parsed. zod emits a §7 service as `{type, version, name}`; jsonb returns
  `{name, type, version}`. Measured 2026-09-16: `isSensitiveDiff` reported `services` as a sensitive change on every re-validation
  of an unchanged manifest (visible in every `make demo-redeploy` log since P4c's baseline) until `spec/diff.ts`'s `stable` sorted
  keys (`4a1d8cd`). Compare structure, never serialisations, across that boundary.
- **Fastify's ROUTER sends two refusals itself, in its own body, unless the server passes `frameworkErrors`.** A path parameter
  over `maxParamLength` (100) answered `414 {"error":"Bad Request","code":"FST_ERR_MAX_PARAM_LENGTH","message":"'/v1/slugs/aaaa…'
  is exceeding the max param length"}` and a malformed URL `400 FST_ERR_BAD_URL` — neither reaches `setErrorHandler`, so P5a Task 5's
  mapping of `FST_ERR_BAD_URL` had never run. Measured 2026-09-16 on Fastify 5.12.3; both answer `400 REQUEST_INVALID` since
  `b043d9d`. Through the edge a malformed percent-encoding never arrives at all: Caddy's HTTP/2 resets the stream (`PROTOCOL_ERROR`,
  curl exit 92).
- **Every project created over HTTP records THREE events before anything else happens to it** — `project.created`,
  `repository.seeded`, `spec.validated` (P5a Task 11). So a test that counts a project's `audit.events` rows, or the frames a
  stream replays, starts with them: `api/events.test.ts`'s `streamServer()` returns their ids as `creation`, and
  `delivery.test.ts` compares a subscriber that joined after creation with `rows.slice(3)`. Measured 2026-09-16: five tests
  went red the moment creation published, each on a count.
- **After `pnpm test` or `make reset`, a demo's slug has a repository and no project — and creation no longer leaves a row
  to reuse.** Until P5a Task 11 creation committed the project before the repository failed, and every demo printed
  *reusing project*; since then the project is deleted (Decision 29), so the fallback finds nothing. Measured 2026-09-16
  with the helper removed: `make demo-identity` stopped at step 2 printing `[]`. The demos and `make demo-journey` call
  `clear_orphan_repository <slug>` (`scripts/lib/api.sh`), which removes `.manifest/repos/<slug>.git` only when
  `GET /v1/slugs/{slug}` answers `available` — no project holds the name — and prints what it removed. A hand-written
  creation for such a slug still gets `SOURCE_GIT_FAILED`: move the repository aside.
- **A NUL check is not a text check, and a PNG header cannot tell you which check you have.** Latin-1 bytes carry no NUL, so a
  reader that only refuses NUL decodes them with U+FFFD in place and seeds a different file. `blueprints/tree.ts` refuses both,
  with a fatal `TextDecoder`. The bytes `89 50 00 47` fail BOTH checks, so a test built on them stays green with either one
  deleted — measured 2026-09-16, the NUL check removed, 25 of 25 green. One case per refusal.
- **A drizzle error answers `Failed query: <the SQL>` and not WHY** — the Postgres reason (a foreign key's `RESTRICT`, a
  unique violation) is on `.cause`, and the operator line `toErrorResponse` writes prints only the message. Measured
  2026-09-16 (P5a Task 11 control (d)): an `audit.events` row blocking a project's delete logged `Failed query: delete from
  "projects" where "projects"."id" = $1` and nothing naming the constraint. Read `.cause.code` / `.cause.constraint` in a
  scratch test. Named, not fixed.
- **Prettier formats any app tree under `blueprints/` that `.prettierignore` does not name.** `skeleton/` was named; the
  proof app moved to `starters/proof-app/` (P5a Task 10) and `pnpm format:check` went red on its `server.js` and
  `public/index.html` — `pnpm format` would have rewritten an app. `blueprints/*/starters/` is named now; a new kind of app
  directory needs the same line.

### Images already pulled

`postgres:16-alpine`, `registry:2`, `verdaccio/verdaccio:6`, `vimagick/tinyproxy`,
`ghcr.io/berriai/litellm:main-stable`, `node:22-alpine`, `curlimages/curl:8.11.1`,
`moby/buildkit:v0.32.2-rootless`, `mongodb/mongodb-community-server:7.0.28-ubi8`.

**That list is a hint, not a fact.** P1's execution on 2026-09-05 pulled and built
what it needed, so `caddy:2.11.4`, `alpine:3.22`, `php:8.3-apache` and `composer:2`
are now present, and four base images are **mirrored into the local registry** with
their digests pinned in `infra/images.lock` — which is what makes offline builds
work, since merely pulling is not enough. As verified on 2026-09-04, before that:
**`anchore/syft:v1.51.1` and `anchore/grype:v0.118.0` are absent** and P3 Task 12
needs them; the `alpine` present is **3.20**, not 3.22, and its digest is the one
`S1-controls-settled.md` used; and **`moby/buildkit:v0.27.0-rootless` sits alongside
the `v0.32.2` P3 pins**, so do not let a tool pick the older one.

**Take a snapshot before you touch anything:** `./scripts/snapshot-machine.sh`. It is
read-only, needs no `sudo` and no network, and runs under macOS's bash 3.2. Run it
again at the end and `diff` the two — that is how "leave the machine exactly as you
found it" stops being a memory. Today's baseline is
[`machine-baseline-2026-09-04.md`](machine-baseline-2026-09-04.md).

**What P1's execution changed, 2026-09-05.** The three host changes are now **in
place**: `/etc/resolver/manifest.internal`, the `127.0.0.2` alias on `lo0`, and the
Caddy root trusted in the System keychain. All three are reversible with
`make host-undo`. `docker-simple-saml-saml-idp-1` is still **exited, not running** —
"must survive" means do not delete it, not that it is up. Valet was verified
untouched: its config files are unmodified (mtime 2026-07-03) and its dnsmasq is the
same process it has run since 1 September.

**Valet's dnsmasq hangs, and when it does NOTHING resolves — including `.test`.**
Hit on 2026-09-05 and diagnosed. The symptom is the most misleading kind: the
process is alive, `/etc/resolver/test` is correct, the config is correct,
`nc -z 127.0.0.1 53` **succeeds** — and every query times out. It is not a `.test`
problem: `vibonarium.local` and `google.com` time out too.

A stack sample of the hung process showed all 2497 samples in one place:

```
main → receive_query → forward_query → __sendto
```

**dnsmasq was blocked in `sendto` to an upstream nameserver, and dnsmasq is
single-threaded** — so one stuck upstream send freezes the entire resolver,
including names it would have answered locally with no upstream at all. `lsof`
showed `com.cisco` (root) holding DNS sockets to UBC's nameservers 137.82.1.2 and
142.103.1.42, so **suspect the Cisco Secure Client / VPN** on connect, disconnect
or network change.

**The fix, which changes no configuration:**

```bash
sudo launchctl kickstart -k system/homebrew.mxcl.dnsmasq
```

Then `sudo killall -HUP mDNSResponder`. **Diagnose before restarting** — if
`google.com` resolves and only `.test` does not, this is *not* the problem and a
restart will not help. Manifest is not involved either way: its dnsmasq containers
publish `127.0.0.1:7153`, never 53, and the two resolvers coexist — verified with
`cms.test` → 127.0.0.1 and `console.manifest.internal` → 127.0.0.2 answering at the
same time, each served by its own web server.

**Do not read a blank port as a free port.** Without `sudo`, `lsof` cannot see sockets
owned by other users, and Valet's dnsmasq runs as `nobody` — so port 53 reads as empty
while dnsmasq is plainly listening on it. The snapshot script reported `(free)` on its
first run and that was wrong; it now says "nothing visible to this user" and explains
why. `make doctor` (P1 Task 2) will need the same care.

---

## 5. What the spikes established

Read the findings note before touching the area it covers. Do not re-derive any of it.

| Spike | Answer | What it settles |
|---|---|---|
| **S7** ~1.5 h of 3 days | **Yes**, with a zone change | Split-horizon DNS works via two dnsmasq processes. `.test` is unusable (Valet). Trust is needed in **three** places — macOS keychain, container trust stores, **and host Node processes**, because Node ignores the keychain. The custom `xcaddy` build works; **Coraza pins the Caddy version**. |
| **S2** ~0.5 h of 2 days | **Yes** | One `INSERT` into `saml20_sp_remote` registers a working SP on the next HTTP request — no file write, no reload, no restart, no cache TTL. **Manifest writes no PHP.** Attribute release fails **open**: a row with an empty `attributes` list releases everything. `pdo_pgsql` also needs `libpq-dev`. `database.*` and `store.sql.*` are different subsystems. |
| **S1** ~2 h of 3 days | **Yes** | A bare repo drives to a routed healthy container with a bound database, and **§11's `Driver` interface needed no revision**. Rootless BuildKit works — but *not* via buildx's own driver, which wraps it in a `--privileged` container. **Offline builds need base images pushed into the local registry**, not merely pulled. |
| **S3** ~2 h of 2 days | **Yes**, with three corrections | LiteLLM does everything §10 assumes and `ubc-genai-toolkit` needs no change. But **three defaults are wrong and all three fail silently** — see below. |

**S3's three, because they are the ones most likely to be forgotten:**

1. **Every key needs `allowed_routes`.** Otherwise an app key whose user came from
   `/user/new` can mint a child key **that survives revocation of its parent**.
2. **Every `embed()` needs `encoding_format: 'float'`.** Otherwise the OpenAI SDK's
   base64 default meets LiteLLM's Ollama path and you get **192 near-zero values
   where 768 floats belong** — no error, every other assertion green.
3. **The LiteLLM `user` must be `hash(puid ‖ project ‖ environment)`.** End-user
   budgets are global, so a bare PUID hash lets one app's exhaustion lock a student
   out of every other Manifest app.

---

## 6. How to work here

These conventions have held since P1 and are why the work has stayed
coherent. Follow them.

1. **Invoke the skill.** `superpowers:writing-plans` for a plan,
   `superpowers:subagent-driven-development` or `executing-plans` to execute one,
   `superpowers:brainstorming` before creative work. If a skill applies, use it.
2. **Ask before `sudo`, and before modifying anything outside your branch.**
   Installing a global tool counts. So does touching the spec.
3. **Green before you commit:** `pnpm test`, `pnpm lint`,
   `pnpm typecheck` (all three packages, since P5a Task 7) and `pnpm format:check`. All
   four, every time — `CLAUDE.md` says why the last two are not optional extras.
4. **Record exact versions.** Image digests, package versions, macOS and Docker
   Desktop versions. A finding without a version is not reproducible.
5. **Make the judgment call, then write down why.** Rich would rather you decide a
   routine question and record the reasoning as a documented decision than block on
   asking. Reserve questions for things that are genuinely his — spec changes, host
   changes, anything irreversible. P1's *Decisions this plan makes* section is the
   pattern.
6. **Capture negative controls.** "It works" is much weaker than "it works, and here
   it is correctly failing when I remove the thing that makes it work."
7. **Write for a reader who was not there.** Every one of these documents will be
   read cold by someone with no context. That is the normal case, not the exception.
8. **Close out properly — AT THE END OF EVERY SITTING, not at the end of the plan.**
   Update the roadmap ledger, sweep every document that states status, and leave the
   machine as you found it. **The sweep is the step that gets forgotten**, and
   forgetting it is how four documents once spent a day lying about the state of the
   project — and how the four HTML pages spent five days telling outsiders the project
   was "designed, not yet built" after it was neither.

   **WHY EVERY SITTING, AND NOT JUST AT THE END.** A sitting is one session, and the
   next one is a different agent with an empty window that will believe whatever these
   documents say. If a sitting ends without the sweep, the next agent starts by
   executing a task that is already done, or re-deriving a decision that is already
   made, or trusting a gate count that moved — and it will not know to doubt any of it,
   because everything here is written to be trusted. **The plan's own sittings table is
   the single most important line**: it is what says which task is next, and it is
   wrong the moment a sitting ends.

   This is also the step a session limit eats. **Budget for it**: leave enough room to
   sweep before you run out, and if you are close, stop a task early and sweep rather
   than finishing the task and leaving the documents lying. A finished task nobody can
   find is worth less than an unfinished one that is accurately described.

   Sweeping by memory is what fails, so here is the list. Check each one every time:

   | Document | What in it goes stale |
   |---|---|
   | `plans/2026-08-29-plan-roadmap.md` | **The ledger — update this first, it outranks the rest.** Spike status, the plan set table, *Order of operations* |
   | **The plan's own SITTINGS TABLE** | **Added 2026-09-09. The first thing to change and the easiest to forget** — it is at the top of the plan, it says which sitting is next, and a stale one sends the next agent at a task that is already committed. Mark the sitting done, move the `← next` marker, and say how many findings it produced |
   | **The plan's *What executing this plan found*** | One dated section per sitting: the tasks, every defect with the measurement that found it, the negative controls, and the gate numbers at the end. **This is the record that stops the next agent repeating the work rather than continuing it** — and it is where a defect that is not worth fixing yet gets named instead of lost |
   | `ORIENTATION.md` | **§7e and §2's numbers box, every sitting — and REPLACE, never append.** §7e says only what the next sitting needs: the job, what to read, how to run it, what will surprise it, and the state it is handed. A sitting's story — what it built, its findings, its controls — goes in its plan's *What executing this plan found*, not here; this file grew to 240 KB by collecting them and was trimmed on 2026-09-16. §2's plan table when a plan starts or finishes; §3's *What the platform keeps true* when an invariant changes; §4 whenever the machine does something new; §8 when something becomes or stops being Rich's call |
   | `README.md` | The status section, and the *Where to start* table's "current job" row |
   | `RUNBOOK.md` | **Added to this list 2026-09-09, having been missed once.** Its *C1's acceptance* preamble restates the CURRENT `make doctor` / `make verify` totals beside the dated 2026-09-05 ones, so it drifts every time a check lands — and it is the document a new agent opens to run the platform |
   | `WALKTHROUGH.md` | **Added 2026-09-15.** Its *What is built* status lines, and any URL, command, test user or demo that changes. It deliberately states no counts — keep it that way |
   | `CLAUDE.md` | The *State* section — **only when a plan starts or finishes, or an item in its *Outstanding, and Rich's* line moves.** Trimmed on 2026-09-16 from ~30 KB of per-sitting history to a pointer here; it names no sitting and states no gate numbers, so a sitting leaves it alone. Keep it that way — every fact it used to repeat is in this file, the roadmap or a plan |
   | `specs/manifest-schematic.html` | **Shared outside the team.** The `Status` line in the header, the footer, and the "no user interface has been built yet" disclaimers |
   | `specs/manifest-phases.html` | **Shared outside the team.** The spike section — how many have run, what they answered, where the remaining ones sit |
   | `specs/manifest-decisions.html` | **Shared outside the team.** Drifts when a **decision** changes, not when status does — check it after any spec action is applied |
   | `specs/manifest-stories.html` | **Shared outside the team.** Hostname examples, which must match §23's zone rule |
   | `docs/external-track.md` | Owners and states of the UBC items |
   | `machine-baseline-*.md` | **Do not edit these.** They are dated evidence. Re-run `scripts/snapshot-machine.sh` and add a new one |

   **THE GATE NUMBERS LIVE IN THREE DOCUMENTS**, and they move whenever a check
   or a test file lands — which is most sittings. `make doctor`, `make verify`,
   `pnpm test` and `pnpm test:docker` are stated in **ORIENTATION §2's numbers box**,
   **`README.md`** and **`RUNBOOK.md`**. `CLAUDE.md` stated them too until 2026-09-16 and
   now deliberately does not — do not add them back. One `grep` catches all three:

   ```bash
   grep -rn "make doctor\|pnpm test\` \|checks / 0 failed\|passed, .* files" \
     ORIENTATION.md README.md RUNBOOK.md   # from docs/superpowers and the root
   ```

   Update them together or not at all. A half-swept set is worse than a stale one,
   because the disagreement makes every number suspect — which is exactly why §2's box
   says in its own text that it is the only current one and wins any disagreement.

   **The four HTML pages are the easiest to forget and the most expensive to get
   wrong**, because Rich shares them with people outside the team and nothing in the
   build checks them. They are also the slowest to drift: their architecture stays
   right for months while their *status* is wrong within days. Most sittings do not
   touch them — a pinned digest or a reconciliation pass is invisible to an outsider —
   but **check rather than assume**, and say in the session record that you checked.

### Your first ten minutes, in this order

Establish a baseline before you change anything — every session that skipped this spent longer working out whether a red result was theirs.

```bash
./scripts/snapshot-machine.sh > <scratchpad>/before.txt  # read-only, no sudo, no network
make up                                                  # ~1 min; re-adds the loopback alias
make doctor && make verify                               # expect §2's box
pnpm test                                                # expect §2's box
pnpm lint && pnpm typecheck && pnpm format:check
curl -s --cacert infra/ca/manifest-root.crt \
  https://idp.manifest.internal/module.php/saml/idp/metadata | head -3   # signed metadata, entityID …/idp/shibboleth
```

**`pnpm test:docker`** (~13 minutes, `make up` first, §2's box has the count) is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`, `observability/`, `infra/` or a `*.docker.test.ts` — and whenever the current plan's sittings rule says so, which wins. One Docker file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`. **Restart the control plane after it.**

**`make demo` is worth one run before you start** — README's *Running the control plane* first. It is the only thing that exercises boot, build, release, deploy and the edge through the real HTTP surface.

---

## 7. What to do next

**The next job is §7e.** Everything before it is executed, and each plan's own *What executing this plan found* is its record. The roadmap's ledger outranks this section on status.

### 7a. The executed plans, and which of their records to read first

*Until 2026-09-16 each executed plan had a hand-off section here — P1 was §7a, P2 §7b, P3 §7c, P4a §7d, P4b §7d-2, P4c §7d-3 — and a paragraph per sitting in §2. What in them was durable is now §3's* What the platform keeps true *and* What it deliberately does not do yet*, §4 and §9; the rest was each plan's history, which is in that plan's record, and in this file as it stood at `191cc60`. A plan or brief that cites one of those sections means the plan named in the row below.*

| Plan | Record | Acceptance | Read first |
|---|---|---|---|
| **P1** | [`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md) | `make doctor`, `make verify` | 18 defects in 13 tasks, and **six were checks that passed while the thing under test was broken or absent**. The second-machine clean clone is untested. |
| **P2** | [`plans/2026-08-29-p2-control-plane-spine.md`](plans/2026-08-29-p2-control-plane-spine.md) | its unit tier; `lifecycle.test.ts` | 52 defects: six type errors no test could catch, five test-isolation defects, a login shim one line from an authentication bypass, and a boot entry point nothing had ever executed. |
| **P3** | [`plans/2026-08-31-p3-docker-driver-deploy-spine.md`](plans/2026-08-31-p3-docker-driver-deploy-spine.md) | `make demo` | **Sessions 4 and 5**: no build had ever succeeded (a `# syntax=` directive the egress-free builder could not fetch, and a `.npmrc` that arrived after `npm ci`), and then no deploy — seven defects of one shape behind 74 green Docker tests. S6 ran as its Task 18 ([`spikes/S6-findings.md`](spikes/S6-findings.md)). |
| **P4a** | [`plans/2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md) | `make demo-identity` | 80 defects in seven sittings. **Session 5's first**: §20's audit grant was unimplementable while the application connected as a superuser. The acceptance passed first time and eight defects came out of disbelieving it. |
| **P4b** | [`plans/2026-09-07-p4b-ai-events-streaming-incidents.md`](plans/2026-09-07-p4b-ai-events-streaming-incidents.md) | `make demo-ai` | 140 findings in ten sittings. **Sitting 9**: the plan's stream authorized after the upgrade and could not pass its own test. **Sitting 10**: every embedding had been charged to nobody. |
| **P4c** | [`plans/2026-09-15-p4c-zero-downtime-redeploys.md`](plans/2026-09-15-p4c-zero-downtime-redeploys.md), with [its brief](plans/2026-09-15-p4c-brief.md) | `make demo-redeploy` | 70 findings in eight sittings. **Sitting 8**: four of the acceptance's nine negative controls could not fail in it — §4 says which tier sees each. |

### 7e. Execute P5a — the contract (first of 1c's three plans) ← **START HERE**

**P5a IS WRITTEN (2026-09-16) AND ITS SITTINGS 1 TO 7 ARE DONE, THE SAME DAY — YOUR TASK IS SITTING 8: TASK 12 (the event stream in the contract — every frame and every event's `machineDetail` as a schema, enforced where events are written; the stream documented in `openapi.json`; `subscribe` in `@manifest/contract`; and the journey watching provisioning).**
[`plans/2026-09-16-p5a-the-contract.md`](plans/2026-09-16-p5a-the-contract.md) — **17 tasks in twelve agreed sittings, one per session** (Rich, its R8). The
sittings table at the top of the plan is the maintained copy and says which sitting is next. Do not write
P5b or P5c: each is written only after the plan before it has executed — the 2026-09-04 lesson that a plan
written against an imagined predecessor pays for it in defects.

**What 1c is.** §17's Phase 1c: the published contract and the clients that prove it — an OpenAPI
document generated from the routes, a versioned TypeScript client, `manifest-mock`, delegated tokens
and pending actions (D24), the knowledge pack API (D25), blueprint starters, a reference console
that may import **only** the generated client, a read-only `LaunchReadiness` view, the audience
question, a read-only fleet list, and a headless acceptance script. **Demo:** §22's seven-step journey,
clicked by a person in the console and run by the script, over one contract.

| Plan | Scope | Its acceptance |
|---|---|---|
| **P5a — the contract** ← yours | public representations of every resource (today every response is a database row); route schemas as the one source; OpenAPI under `/v1`; the generated client; an error-code registry; event and frame schemas, plus the journey's missing events; **the API on the console's origin through the edge**, with CSRF and the edge refusing app and sandbox networks (and the S6 probe proving it); reserved labels and **the slug check API, `GET /v1/slugs/{slug}`**; project creation from the skeleton plus a starter (the proof app becomes `node-ts-mongo@1`'s first); the missing reads; the `LaunchReadiness` view with scan findings persisted; audience at creation; blueprints and the knowledge pack; an admin bootstrap and the fleet list | every §22 step driven, through the edge, by a script using only the generated client, with a session |
| P5b — delegated tokens | D24's two tables, bearer authentication, the central rule that tokens never hold the privileged four, pending actions, per-token limits, the authorization suite's new actors | a token runs the build loop and is refused the privileged four, each refusal a `PendingAction` a human confirms |
| P5c — the clients | `manifest-mock`, `console/` with its import boundary, the CI acceptance script | the journey clicked and run headlessly over one contract |

**EVERYTHING THAT WAS RICH'S IS DECIDED, AND THE SPEC ALREADY SAYS IT** (Rich, 2026-09-16; spec
commits `1d88846`, `ecf5f29` and `5065c13`). Do not re-open any of these: **(1)** a project starts from the blueprint's
skeleton plus a chosen *starter* (§22 step 2, §25 *Starters*); **(2)** three plans, as above;
**(3)** the console and the API share **one origin, `console.manifest.internal`, through the edge**,
and the edge refuses the control plane's routes to app and sandbox networks (§21, §12, §16);
**(4)** the contract is versioned by a **`/v1` path prefix** (§22 D23.8); **(5)** no P5 acceptance
depends on a clean machine or a second developer (§17's 1c row). Applying (3) needed **§23's reserved
labels**, which Rich then extended the same day (spec commits `ecf5f29` and `5065c13`): **six groups
of labels no project may take** — Manifest's own surfaces, sign-in and identity words, environment
and infrastructure words, names software resolves unasked, UBC's campuses and shared services, and
**every UBC faculty, department and course subject by name and abbreviation** (`chemistry`, `chem`) —
**755 labels, already written as data in `infra/reserved-labels/`**, the academic ones generated from
UBC's calendars by a committed script — **and a slug check API**, `GET
/v1/slugs/{slug}`, answering exactly what project creation will, so a client can tell a person
whether a name works while they type it. **Any further
spec change is proposed to Rich, never edited** — the brief's §7 items 5 and 6 are still proposals,
both P5b's; item 7 is not a spec change but work P5a does (persisting scan findings on the release). **And four more were made while P5a was written, the same day, and are in the plan's *Decisions Rich made*:** **R6** — builds answer `202` and finish on the event stream, while a deploy stays synchronous; **R7** — the client is generated by `openapi-typescript` 7.13.0 and called through `openapi-fetch` 0.17.0; **R8** — twelve sittings; **R9** — the plan's six spec actions applied before it executes (spec commit `491f8be`: §6 `Project.starter`, `Build.scan` and `RoleChange`, §20's CSRF as an `Origin` check with a sign-in bound to its browser, §22 D23.9, and provisioning on §14's stream). Do not re-open any of them.

**What sittings 1 to 7 established is in the plan's *What executing this plan found*, one dated entry each — read them; do not look for them here.** In one line each: **1** the measurements the design rests on (`spikes/p5a-baseline/`); **2** every resource route under `/v1`, served at `https://console.manifest.internal` through the edge and refused to every source but the host; **3** CSRF by `Origin`, a sign-in bound to its browser, and one registry of every error code; **4** `defineRoute` and the generated OpenAPI document with its drift test; **5** `@manifest/contract` and `make demo-journey`; **6** projects, environments, members and specs as public representations, and §23's reserved labels behind `GET /v1/slugs/{slug}`; **7** starters (the proof app is `node-ts-mongo@1`'s first) and the knowledge pack over `/v1`, and a project created from its skeleton and a starter for a stated audience, publishing `project.created`, `repository.seeded` and `spec.validated`. Each later task a sitting's measurements changed carries a correction at its top.

**Read, in this order, before sitting 8:**

1. **The plan's** *How this plan is to be executed*, *Read this first*, *Decisions Rich made*, *Decisions this plan makes* (33 and 34 above all) and **sittings 1 to 7's entries in *What executing this plan found*** — then **Task 12 in full**, including the *Task 1 result* on `[M1d]` (a discriminated union is an `anyOf`, and whether the generated type narrows is for you to read in `schema.d.ts`), the *Sitting 2 correction* (a Node subscriber through the edge needs the CA and `Origin`, and an edge reload closes a stream) and the *Sitting 7 correction* (creation's three events, body and answer).
2. **[`plans/2026-09-16-p5-brief.md`](plans/2026-09-16-p5-brief.md)** §8 (the traps).
3. **This file's §4** — its last fifteen entries are sittings 3 to 7's — and **§6** (how to work, and the close-out sweep every sitting owes).

**How to execute it.** `superpowers:executing-plans` or `superpowers:subagent-driven-development`, **one sitting per
session**, with a check-in at each boundary. **Start with the baseline in §6's *Your first ten minutes*** — snapshot the
machine, `make up`, doctor, verify and the four gates — and compare every number with §2's box before changing anything. **Sitting 8 changes
`observability/` (`recordEvent` refuses a detail that is not its type's schema — every publisher in the codebase goes through it), `api/`
(the stream in the document), `packages/contract` (`subscribe`) and the journey, so it OWES `pnpm test:docker` (~13 min, `make up` first; the
task's own Step 4 runs it) as well as the four gates, and `pnpm contract:write && pnpm contract:generate`, whose drift tests are red until
both are committed.** It adds no migration, needs no network and no Ollama. **Its Step 6 runs `make demo-journey`**, which creates or reuses
`journey-app` — no container, so no LiteLLM user. A Caddyfile edit reaches the edge through `make up`, whose reload drops every runtime route,
and the Docker tier restarts the edge and re-registers the platform's SP row at a loopback ACS — **restart the control plane after either**;
its boot puts both back. Every sitting ends with the plan's four steps, the last of which is §6's sweep.

**What will surprise you** (the plan's tasks carry each of these; they are here so none is a surprise):

- **Every demo speaks `$ORIGIN` — `https://console.manifest.internal` — through ONE helper,
  `scripts/lib/api.sh`** (sitting 2), which since sitting 3 sends `Origin` on every mutation, as
  `scripts/lib/event-stream.mjs` does on its upgrade. A test that mutates with a session uses
  `mutationHeaders(deps)` from `api/testing.ts`; one that sends a session and no `Origin` gets `403`, not
  whatever it was testing.
- **A test that expects a refusal must name the refusal's CODE**, not only its status: the preHandler now
  refuses a session with no `Origin` before it asks for an Idempotency-Key, and the callback refuses an unbound
  assertion before node-saml validates it, so a status-only test goes on passing for the wrong reason.
- **`api/error-codes.ts` is held to the source**: a new code thrown through a wire class, or a new `code: '…'`
  literal in `api/`, turns `error-codes.test.ts` red until it is registered with its one status — and a
  registered code nothing throws turns it red too.
- **A Node process does not trust the platform CA unless given it** — `fetch` fails as `fetch failed`
  and hides `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Pass `ca` in a test, `NODE_EXTRA_CA_CERTS` to a script.
- **The session cookie is now `Secure`** (the origin is https). `app.inject` does not care; `curl`'s jar
  sends it only over https, which every script now uses.
- **After `pnpm test:docker`, restart the control plane before any sign-in through the console** — the
  tier re-registers the platform's SP at a loopback ACS, and `idp_login` then refuses the mismatch.
- **Any new S6 probe that execs `node` inside the app must come before probe 11** (§4).
- **The authorization contract suite fails for any route it does not list** (`app.registeredRoutes`),
  so every route-adding task adds its row.
- **`pnpm test` truncates the control plane's tables and `pnpm test:docker` restarts the edge** — a
  demo app answers the wildcard afterwards until it is redeployed.
- **zod 3.25 already ships `zod/v4`** with `z.toJSONSchema`; no schema library needs adding to start.
- **Adding a dependency needs the network**, and pnpm 11 refuses install scripts not named in
  `allowBuilds` (§4).
- **`packages/contract/openapi.json` is generated; never edit it.** Change a route definition, run `pnpm contract:write`,
  commit both — `pnpm test` is red on the first stale line until you do. **`pnpm contract:write` truncates the control
  plane's tables**, like `pnpm test`, because it runs under the same Vitest project.
- **A `/v1` route declared through `defineRoute` refuses what it does not declare**: an unknown body field or query
  parameter is `400 REQUEST_INVALID` naming it. A script that sends `?expand=environments` depends on the route declaring
  `expand` — Task 8's `getProject` does.
- **A response schema must be a REGISTERED name** — `representation('Id', …)` — used as is. `openApiDocument` throws
  *not registered* for anything else, including a `.describe()` copy of a registered schema (§4).
- **A route change is three files, in order**: the definition, then `pnpm contract:write` (the document), then
  `pnpm contract:generate` (the client's types) — and the journey, whose `tsc` build inside `make demo-journey` refuses a call
  or a field the regenerated contract does not have, and now prints why.
- **The gate is `pnpm typecheck`**, over all three packages, and `pnpm test` includes the `packages` project. The journey is a Node
  process: `make demo-journey` passes it `NODE_EXTRA_CA_CERTS`, and a journey run by hand needs the same.
- **The authorization contract suite now asserts each refusal's CODE** (sitting 6): a row expecting `404` gets `NOT_FOUND`,
  `403` gets `FORBIDDEN`, `401` gets `UNAUTHENTICATED`. A new row whose route refuses with another code fails, naming it.
- **`createProject(db, config, reserved, input)` takes §23's list**, and every test that creates a project passes
  `await testReservedLabels()` from `projects/testing.ts` — the real 755. A test slug that is reserved (`chem`, `app`, `api`,
  `admin`, `console`, a UBC subject code) is refused `SLUG_RESERVED`, and creation checks the slug before writing anything.
- **A `/v1` route's `?expand=` takes exactly what it declares** — `GET /v1/projects/{projectId}` accepts `environments` and
  nothing else; a comma list is `400 REQUEST_INVALID`.
- **`ProjectError` is gone**; a refused slug is `SlugRefusedError` (`SLUG_INVALID` 400, `SLUG_RESERVED` and `SLUG_TAKEN` 409),
  and Task 11's `createProject` catch uses `slugTaken()`, the one copy of that sentence.
- **`scripts/lib/api.sh` must be sourced into `bash`, not the agent's zsh**: its `local path=` overwrites zsh's `$path`, which is
  `$PATH`, and every later `curl` is *command not found*. `bash -c '. scripts/lib/api.sh; …'`.
- **`POST /v1/projects` requires `audience`** (§24) and answers `CreatedProject`: the seeded commit is `created.spec.commitSha` and
  validity `created.spec.valid` — `commitSha`, `specValid` and `repositoryUrl` are gone. A test body comes from `api/testing.ts`'s
  `projectBody(slug, { blueprint?, starter? })`; a direct `createProject` caller passes `starter: null, audience: testAudience(ownerId)`
  from `projects/testing.ts`. `PROJECT_INVALID_INPUT` is gone; `STARTER_NOT_FOUND` is new.
- **Every project created over HTTP has three events before anything else** — `project.created`, `repository.seeded`,
  `spec.validated` — so a replay, or a count of a project's events, starts with them (`streamServer()`'s `creation`, §4). Task 12's
  journey step reads exactly these from the replay.
- **Creation from the `proof-app` starter reads the model catalogue**, because the starter declares two models — so a gateway outage
  is `503 AI_BACKEND_UNAVAILABLE` at creation, and a harness with no catalogue behind it cannot create one.
- **After `pnpm test`, every demo and `make demo-journey` print `removed …/.manifest/repos/<slug>.git`** the first time — that is
  `clear_orphan_repository` clearing a repository whose project the truncation removed, and only when the slug check says no project
  holds the name. A `POST /v1/projects` of your own for such a slug answers `SOURCE_GIT_FAILED` and leaves nothing.
- **The proof app lives at `blueprints/node-ts-mongo/starters/proof-app/`** (it was `fixtures/proof-app/`), and `.prettierignore`
  names `blueprints/*/starters/`. A broken starter or descriptor refuses the control plane's BOOT, naming the file.

**The state you are handed, 2026-09-16, after sitting 7.** `main`, clean. The code commits are Task 10's `930cbe2` with `45a5cc9`,
`8eff3ab` and `343f189`, and Task 11's `c12c423`; everything later is documentation. Migration **0010** is applied. The four gate numbers
are §2's box — all green, `pnpm test` 956, `make verify` 50/0 and `pnpm test:docker` 168, re-measured this sitting. **The proof app
serves at `https://proof-app.staging.manifest.internal/` WITH its rows behind it** (project `be9ad9f3`, created from the starter):
`make demo-identity` ran last, after the Docker tier. **Project `journey-app` exists, with its repository and no container** — the
journey's own, reused by design. **The fixture app is not deployed**, so `make demo` starts it from nothing. **The platform SP row's ACS
is `https://console.manifest.internal/auth/saml/callback`.** The control plane is **not** running (port 7100 is free); README's *Running
the control plane* starts it, and its boot line must name that origin and `"reservedLabels":755`.
**Three LiteLLM users have no project, one key each, for Rich** — `mf-ed4a233f-ef0c-4854-87a4-8a780a9d616e-staging`,
`mf-c3eda3d7-fccd-4131-a1c3-64dae4ecfec3-staging` and `mf-eb6f6c83-a48a-4cd8-8336-c6be49979d50-staging`, each a proof-app project a demo
replaced. LiteLLM also holds `default_user_id`, `p4b-probe-user` and `mf-be9ad9f3-ffa3-489a-ade9-b6064874a5bb-staging`, whose key the
running proof app uses; that one becomes an orphan the next time a demo replaces the proof app's container. Deleting through LiteLLM's
admin API has been refused by the session's permission classifier as a secret-store write, so do not work around it — record the user
for Rich. To remove one, from the repo root: `set -a; . ./.env; set +a`, read its hashed tokens with
`curl -sS -H "authorization: Bearer $LITELLM_MASTER_KEY" "http://127.0.0.1:7106/user/info?user_id=<user>"` (`keys[].token`),
then `POST /key/delete` with `{"keys":["<token>"]}` and `POST /user/delete` with `{"user_ids":["<user>"]}`,
both with the same header.

## 8. Decisions waiting on Rich

Surface these; do not decide them. **When one is decided, move it to *Decided* as one line naming where the reasoning is recorded.**

### Open

- **Should an APP's route carry `stream_close_delay`, as the console's does? — RAISED 2026-09-16 (P5a sitting 2).**
  Every Caddy admin-API change reloads the edge's whole config and closes every WebSocket the old config proxied with
  `1001` — measured by closing an event stream with one unrelated route `PUT`. The console site now sets an hour. **App
  routes, which `routing/` writes, set nothing, so any deploy of any app closes every app's WebSockets**, which sits
  badly beside P4c's "a redeploy interrupts nobody" for an app that holds one open. The mechanism is one field on each
  route; the questions are the value (a stream on an old config outlives it by that long, and the old handler with it)
  and whether it belongs in P5a, a hardening slice or Phase 4. *Not measured:* an app WebSocket actually cut by another
  app's deploy.
- **Should app containers run with an init (`Init: true`)? — RAISED 2026-09-16 (P5a sitting 2).** An app's PID 1 is its
  own `node`, which never reaps the orphans it adopts, so a process an app starts that leaves children behind turns them
  into zombies holding pids against §12's `PidsLimit` (64 in the S6 fixture) for the container's life — measured with
  twenty orphaned `sleep`s in state `Z`, and with S6 probe 11 leaving `docker exec … node` unable to start. It changes
  every app's process tree, which is why it is asked rather than done.
- **P5b's two spec questions, when P5b is written** — the P5 brief's §7 items 5 and 6: D24's entity fields, and the
  stateless-session divergence from §20 (a session carries the role it was issued with).
- **Should the blueprint base image move from `node:22-alpine` to 24?** Priced in exposure as well as effort (Grype
  v0.118.0, 2026-09-06):

  | | apk Critical / High | npm Critical / High |
  |---|---|---|
  | `node:22-alpine` *(what the blueprint pins)* | 4 / 14 | **1 / 10** |
  | `node:24-alpine` | 4 / 14 | **0 / 4** |

  The npm findings are npm's own bundled tree inside the image, not anything an app chose; moving removes the
  Critical. Mechanically one line in `infra/images.txt` plus a `make seed` — but it changes what faculty apps run in,
  which is a compatibility decision.
- **Should Phase 1 ship an apk mirror alongside Verdaccio? — RAISED 2026-09-06.** The 4 Critical and 14 High apk
  findings are `libcrypto3`/`libssl3` at `3.5.7-r0`, fixed in `3.5.8-r0`; no newer base image clears them, and
  `RUN apk upgrade` cannot work from a builder with no route off its `--internal` network. An apk mirror is the only
  mechanism that would let a build clear them offline. The scan gate does not block on base-image findings, but
  "ship on day one with four Criticals in the base image" is a decision rather than an accident.
- **SimpleSAMLphp's session store connects as the superuser `manifest`** (found 2026-09-14). §9 says that store has
  "its own credentials"; `infra/idp/config/config.php` gives it the superuser the control plane writes SP rows with.
  The spec is right and the implementation is not; not fixed.
- **The long-term fix for `passport-ubcshib` is UBC's.** `@node-saml/passport-saml@5.1.0` audits clean, and moving to
  it is the "strictly safer for every consumer" change C6 permits. It does not block Manifest — but somebody should
  tell the owners of the six UBC applications that depend on a library with a critical signature-verification
  advisory. If it is fixed upstream, ship it as **0.2.0** so apps on `^0.1.6` adopt deliberately; its other gaps are
  the unreachable MACE entry and missing OID entries for `uid` and `eduPersonPrincipalName`.
- **Does LiteLLM's embedding `encoding_format` bug affect a commercial provider, or only the Ollama path?** Unmeasured
  — only Ollama was reachable offline. Cheap to settle the first time anyone has a provider key.
- **Starting the UBC external track (C4)** — the trigger fired 2026-09-15; see §2 and `docs/external-track.md`.

### Decided — do not re-raise

- **`egress.allow` may not name a platform surface** (2026-09-16) — §12 applied; enforcing it is the roadmap's tracked hardening item, after P5a. Only the implementation is open.
- **P5a's R6–R9** (2026-09-16) — builds answer `202`; `openapi-typescript` + `openapi-fetch`; twelve sittings; spec actions applied first. P5a's *Decisions Rich made*.
- **P5's five** (2026-09-16) — starters; P5a/P5b/P5c; one console origin through the edge with §23's reserved labels and a slug check; a `/v1` prefix; no acceptance on a second machine. The P5 brief's §5; spec `1d88846`, `ecf5f29`, `5065c13`.
- **§12's scan gate blocks only on a Critical or High with a published fix** (2026-09-08) — §12, `build/scan.ts`.
- **P4a's and P4b's spec actions** (2026-09-14 and 2026-09-15), among them §10's per-user AI budget validated not enforced in Phase 1, §14's stream as built with no app-output tailing, and §10's agent-key row from Phase 3 — the roadmap and each plan's *Spec actions*.
- **Zero-downtime redeploys required, as P4c, before P5** (2026-09-14) — executed; P4c's *Decisions Rich made*.
- **A sign-in under way when a route moves may fail once** — tolerated (P4c).
- **The Manifest IdP's SimpleSAMLphp is kept current, not pinned** (2026-09-16) — a sitting that runs `make seed` records the version it left running; P4c finding 62.
- **Task 12's entropy redaction rule** (2026-09-14) — P4b Task 12.
- **Where the service-binding wire lands** (2026-09-06) — P3 Task 15; platform bindings apply after the app's own `env`.
- **The external track starts once the local proof works end to end** (2026-09-05) — that trigger has fired; starting it is the open item above.
- **`make doctor` asserts the host tools the control plane spawns** (2026-09-09); **P3's six spec actions** (2026-09-07, `53ecb1d`); **the §11/§23 hostname rule — the environment lives in the zone** (2026-08-31); **`make up` re-adds the `127.0.0.2` alias** (P1); **the hung Docker credential helper** (2026-09-14, cleared by restarting Docker Desktop).

---

## 9. Lessons — each one was paid for

These are about *how to work here*, and they are in the roadmap too, which is the
maintained copy.

- **Integration is where the false greens sit, and units cannot reveal them.** Two of
  the three worst discoveries in this project arrived the first time something ran end
  to end: P3's Task 15 found that **no build had ever succeeded**, and its Task 17
  found that **no deploy had ever succeeded either** — through seven defects of one
  shape, *the test constructs the value correctly and the running system re-derives it
  wrongly*. Both were invisible behind a fully green suite of 74 Docker tests, because
  a test hands the driver what it built while the control plane rebuilds it from a
  slug. **Schedule the end-to-end task early and drive it through the real entry
  point**, not through a harness.
- **A module with no call site is not built.** `waitForReady` and `edgeProbe` shipped
  in P3 Task 14 with passing tests and nothing called them until Task 17;
  `isSensitiveDiff` shipped in P2 and nothing called it for a whole plan. This is the
  same defect as the unwired boot entry point, and it has now happened three times.
  Every task should name its caller, not just its module.
- **Diagnosability is a feature, and its absence hides other defects.** A failed build
  recorded no reason at all (`void error`), and an unexpected 500 left no trace
  anywhere because the handler logged through a logger the server was built without.
  Fixing both took minutes and immediately named four further defects that had been
  invisible.
- **A plan is not verified until it runs, and the gap is not small.** P2's written
  self-review found seven defects. Then executing just **four of its twenty-one
  tasks** found **five more**, and not one was findable on paper: a package manager
  that makes an un-named build script a hard error, a lint config whose glob dialect
  silently has no extglob, a linter that does not honour the `_` convention the
  plan's own code assumed, a negative control aimed at a target that could not fail,
  and an unguarded table index that turned drift into a crash in an unrelated test.
  **Five defects in four tasks.** P3's own self-review then found **seven** more,
  the worst being that no task wired the Docker driver into the boot entry point — so
  its `make demo`, the plan's entire acceptance, would have passed against the fake
  driver. **Acted on 2026-09-04**: plan-writing stops until P3 has executed. Treat
  "the plan is written" as a hypothesis, and execute the cheapest representative
  slice early rather than banking a large unexecuted stack.
- **A green result is not evidence a control is in force.** S1's first build appeared
  to succeed while silently using the public npm registry instead of the mirror.
  Only checking the mirror's storage caught it.
- **Some defects are invisible to every test that could be written.** Executing P2's
  Tasks 12–21 produced 27 defects; **six were type errors** that `pnpm test` cannot
  see, because Vitest strips types without checking them, and **five were test
  isolation** — the suite passed or failed on the order Vitest happened to pick, and
  three suites had been green only because the database happened to be empty. Neither
  class is findable by reading a plan, and neither is findable by running its tests.
  The gates are the plan: run all four, and run the suite twice.
- **A guard whose enabling condition is written twice is a guard.** P2's
  `/auth/dev-login` passed `devAuthEnabled: true` as a literal because the route was
  only registered when the shim was on. Removing that single registration guard made
  the endpoint mint **real sessions** — a complete authentication bypass, one line
  from live, and it read correctly in review. The same shape produced an IDOR in
  `GET /builds/:id`. Two independent reads of one setting cost nothing.
- **Assert the shape of the answer, not that an answer arrived.** S3 ran six toolkit
  checks and all six passed; one was returning 192 numbers where 768 belonged, almost
  all zero, with no error anywhere. "It returned a vector" and "it returned the right
  vector" are different claims.
- **Treat a briefing document as evidence, not fact.** `START-HERE.md` stated that
  `/etc/resolver/test` pointed at a dead nameserver. It did not, and that one wrong
  premise forced the zone change.
- **A document that restates a number drifts from it.** ORIENTATION §2's *Code* row
  carried `make doctor` 14, `make verify` 31, `pnpm test` 224 and then 332, and
  `pnpm test:docker` 48 — **five stale figures at once**, four releases behind, while
  §3 and §7c of the same file had them right. A new agent's first act is to run the
  gates and compare, so the cost lands on exactly the person with the least context.
  Fixed structurally on 2026-09-07 rather than by correcting the numbers: **§2 now has
  one box, measured and dated, and every other mention points at it.**
- **Briefings go stale in days.** A handoff was sending its reader to a finished spike
  one day after it was written, and three of twelve "already pulled" images vanished
  between sessions. Anything stating current status needs an owner and a date — which
  is why the ledger exists and why this file says which of its sections decay.
- **Handoff chains strand durable knowledge.** The machine landmines in §4 spent a day
  behind a SUPERSEDED banner because they lived in a dated handoff. Durable content
  belongs in a durable document; only *what to do next* belongs in a handoff.
- **Prefer ownership-adjusted risk.** S2's risk was priced as existential and was not,
  because `docker-simple-saml` is ours. Ask what a "no" costs *given what we control*
  before ranking a risk.
- **Run the plan self-review; record what it caught.** P1's found five defects, the
  worst being a verification script that used `apk add` — which needs the network, so
  the offline acceptance test would have failed on its own harness. Writing down what
  the review caught stops the next reader mistaking a fix for a mistake.
- **Spikes came in far under their timeboxes** (~1.5 h, ~0.5 h, ~2 h, ~2 h against 3,
  2, 3 and 2 days). Do not re-plan the schedule on that: all four were the tractable
  ones, and the estimate that matters — C4's turnaround — is still unmeasured.
