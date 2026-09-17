# P5a — The Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every step of §22's journey can be driven through the edge at `https://console.manifest.internal`, by a script that uses nothing but a TypeScript client generated from a checked-in OpenAPI document under `/v1`, signed in with a real CWL session.

**Architecture:** Every resource route is declared once, with `zod/v4` schemas, through one `defineRoute` helper that validates the request, shapes the response through its public representation (so no database column can leak) and feeds a generated OpenAPI 3.1 document, checked in at `packages/contract/openapi.json` and guarded by a drift test. `openapi-typescript` and `openapi-fetch` turn that document into `@manifest/contract`, whose first caller is `packages/journey` — the script that drives §22 through the edge. The edge serves the API and the (future) console on one origin, `console.manifest.internal`, from a Caddyfile site that refuses every source except the host; cookie-authenticated mutations and stream upgrades must carry that origin. Around the contract, P5a builds what the journey needs and does not have: reserved labels and `GET /v1/slugs/{slug}`, projects created from a blueprint's skeleton plus a starter for a stated audience, the missing reads, asynchronous builds that record their scan, the journey's missing events, a computed read-only `LaunchReadiness`, the first administrator and the fleet list.

**Tech Stack:** TypeScript on Node 24.12.0, Fastify 5.12.3, zod 3.25.76 (its bundled `zod/v4` API for every contract schema; §7's manifest schema stays on zod 3), Drizzle over Postgres 16, Vitest 2.1, the custom Caddy 2.11.4 edge, `openapi-typescript` **7.13.0** and `openapi-fetch` **0.17.0** (with `openapi-typescript-helpers` 0.1.0 — all three checked on npm 2026-09-16), Node 24's global `fetch` and `WebSocket`.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§22** in full (the journey, the reference console's import rule, D23.1–D23.9); **§21** *The front-end in the local topology* and the inventory's control-plane row; **§12** *Edge* (its last paragraph); **§16** *Security regression*, *Contract*, *Acceptance* and *API completeness*; **§17**'s 1c row; **§20** *Manifest's own front door*, *Credential classes*, *Machine-actionable errors*, *Authorization*; **§23** *Some labels are reserved* and *Checking a slug before creating a project*; **§25** *The descriptor* and *Starters*; **§24** *Two questions*; **§13** *First production launch*; **§6**'s entities; **§26** *Fleet*. Rich's five P5 decisions were applied to the spec on 2026-09-16 (commits `1d88846`, `ecf5f29`, `5065c13`), **and so were the six actions this plan proposed, before it executes** (commit `491f8be`, Rich's R9) — so this plan argues from the spec as it now reads.

**Brief:** [`2026-09-16-p5-brief.md`](./2026-09-16-p5-brief.md) — what the code does today with file references, three measurements, and the traps. **Read it before this plan.**

**Roadmap:** the **P5a** row in [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md).

**Predecessor:** [`2026-09-15-p4c-zero-downtime-redeploys.md`](./2026-09-15-p4c-zero-downtime-redeploys.md). Read its *Decisions Rich made* (R3: a deploy returns once the new instance serves) and its sitting 8 record — four of that acceptance's nine negative controls could not fail in it, which is why every control in this plan names the test that goes red.

---

## How this plan is to be executed — TWELVE SITTINGS, one per session

**AGREED WITH RICH ON 2026-09-16 (R8).** The pattern that carried P4a's last twelve tasks, all of P4b and all of P4c: **one sitting per session, with a check-in at each boundary**, so a session limit can never land mid-task. **Executing two sittings in one session is not a shortcut** — it is how a limit lands inside a task. This plan commits after every task; a stop *between* tasks is recoverable, a stop *inside* one is not. **"Sitting", not "phase"** — this project uses *Phase 1c* and *Phase 2* for §17's product roadmap.

| Sitting | Tasks | What it delivers | Status |
|---|---|---|---|
| 1 | 1 | **The measurements the design rests on**, before any code: a `zod/v4` route end to end, the edge refusing an app network by source with its positive control, a CWL login and a WebSocket stream through a new origin, `RelayState` round-tripped by the real IdP, and the reserved-label data. **Alone, and first** | ✅ **done 2026-09-16 — 9 findings**; corrections at the top of Tasks 3, 4, 6, 9, 11 and 12 and in Decision 16; no boundary moved |
| 2 | 2–3 | **The API moves**: every resource route under `/v1`, then served through the edge at `https://console.manifest.internal`, refused to app networks, with S6 probe 15 and `make verify`'s edge probes moved to `edge.manifest.internal` | ✅ **done 2026-09-16 — 16 findings**; corrections at the top of Tasks 7 and 12; no boundary moved |
| 3 | 4–5 | **The front door**: CSRF by `Origin` on every cookie-authenticated mutation and stream upgrade, a sign-in bound to the browser that started it, a safe return-to; then the error-code registry | ✅ **done 2026-09-16 — 15 findings**; a correction at the top of Task 6; no boundary moved |
| 4 | 6 | **The contract's spine**: `defineRoute`, the OpenAPI document generated from the definitions and checked in, its drift test, and `GET /v1/me` as the first converted route | ✅ **done 2026-09-16 — 7 findings**; no later task needed a correction; no boundary moved |
| 5 | 7 | **The client and its first caller**: `@manifest/contract` generated with `openapi-typescript` + `openapi-fetch`, `packages/journey` with its import boundary, and `make demo-journey` at step 1. **Alone, and the one sitting that NEEDS THE NETWORK ON** | ✅ **done 2026-09-16 — 4 findings**; no later task needed a correction; no boundary moved |
| 6 | 8–9 | Projects, environments, members and specs as public representations; then reserved labels and `GET /v1/slugs/{slug}` behind one slug function | ✅ **done 2026-09-16 — 13 findings**, two of them fixed in commits of their own (`4a1d8cd`, `b043d9d`); a correction at the top of Task 11; no boundary moved |
| 7 | 10–11 | Blueprints with starters (the proof app becomes `node-ts-mongo@1`'s first) and the knowledge pack; then a project created from skeleton plus starter for a stated audience, with its provisioning events | ← next |
| 8 | 12 | **The event stream in the contract**: frame and event-payload schemas, the stream documented, the client's `subscribe`, and the journey watching provisioning | |
| 9 | 13 | **Builds answer 202** and finish on the stream (Rich, 2026-09-16), a build that a restart interrupted is failed at boot, and every build records its scan | |
| 10 | 14 | Releases, deploys and incidents as representations, `instance.provisioning` and `instance.starting` on the stream, and the journey through steps 5 and 6 | |
| 11 | 15–16 | `LaunchReadiness` computed and read-only; then the first administrator by an out-of-band script, and `GET /v1/fleet` | |
| 12 | 17 | **`make demo-journey` green — P5a's acceptance**, three times, once from a `make reset` machine, with its negative controls. **Alone, and last** | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. the four gates from *Global Constraints*, plus `pnpm test:docker` for every sitting that touched `runtime/`, `routing/`, `releases/`, `identity/`, `projects/`, `blueprints/`, `infra/` or a `*.docker.test.ts` — which is every sitting except 1, 4 and 5;
2. a dated entry in *What executing this plan found* — the tasks, every defect with the measurement that found it, the negative controls, and the gate numbers;
3. **the sittings table above, updated** — mark the sitting done, move the `← next` marker, say how many findings it produced;
4. **the close-out sweep in ORIENTATION §6**, whose first line is the roadmap ledger. The gate numbers are stated in three documents — ORIENTATION §2's box, README and RUNBOOK (CLAUDE.md has stated none since 2026-09-16) — and move together.

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Task 1 may move task boundaries — that is its job — and if it does, re-cut the sittings before starting sitting 2 and say so in the session record. Three rules survive any re-cut: **Task 1 stays first and alone**, **Task 7 stays alone and needs the network**, and **Task 17 stays alone and last**.

---

## Read this first — what this plan knows that the brief does not

Read or measured on 2026-09-16 while this plan was written. **Every item is a fact about the platform as it stands, not a prediction**, and Task 1 re-measures the ones marked *(T1)*.

1. **The host's requests reach the edge from `10.89.0.1`, and app networks are Docker-assigned subnets.** `curl https://console.manifest.internal/` from the host answered `remote=10.89.0.1` — the gateway of `manifest-platform` (`10.89.0.0/24`, pinned by P1), because Caddy's published ports sit on that network. A `curlimages/curl` container on `manifest-platform` answered `remote=10.89.0.9`. The edge's own addresses: `manifest-platform=10.89.0.10`, `mf-proof-app-staging-net=172.30.0.2`, and `192.168.0.2`, `.16.2`, `.32.2`, `.48.2`, `.80.2`, `.96.2` and `172.31.0.2` on the other app networks — **no pool the platform chose**. So the refusal §12 asks for is an **allow-list of one address**, not a deny-list of subnets the platform would have to track. *(T1)*
2. **`zod/v4` in the installed zod 3.25.76 behaves like this**, run with `node -e` from `packages/control-plane`: `z.toJSONSchema` emits draft 2020-12; `io: 'output'` adds `additionalProperties: false` to an object and `io: 'input'` does not; `z.date()` is **unrepresentable** (`{}` under `unrepresentable: 'any'`), so no representation may carry a `Date`; a `z.registry()` converted with `uri: id => '#/components/schemas/' + id` yields `$ref`s between registered schemas, and **every emitted schema carries its own `$schema` and `$id`**, which an OpenAPI component must not; `z.uuid()` emits `format: uuid` with an RFC 4122 pattern; v4 issue codes are not v3's (`invalid_format` for a regex, `invalid_value` for an enum), so nothing that maps zod 3 issues — `spec/errors.ts` — may be fed a v4 error. *(T1)*
3. **Node 24's `fetch` and `WebSocket` send no `Origin` unless told to, and send the one they are given.** Measured against a local server: `fetch` POST → `origin: null`; with `headers: { origin }` → the value; `new WebSocket(url)` → no `origin`; with `{ headers: { origin, cookie } }` → both. So an `Origin` check does not lock the script out: the client sets it.
4. **`toErrorResponse` maps eleven error classes, and everything else becomes `INTERNAL`.** The codes a client can actually receive are `AuthorizationError`'s, `BadRequestError`'s, `ProjectError`'s, `ReleaseError`'s, `SourceError`'s, `ConfigError`'s, `SamlError`'s, `AiError`'s (`AI_CODES`), `CatalogueError`'s (`CATALOGUE_CODES`), `SpecInvalidError` and `IdempotencyConflictError`, plus six literals in `api/` — `UNAUTHENTICATED`, `INTERNAL`, `REQUEST_INVALID`, `IDEMPOTENCY_KEY_REQUIRED`, `EVENTS_UPGRADE_REQUIRED` and `RELEASE_PRODUCTION_GATE_UNAVAILABLE`. `EngineError`, `DriverRefusalError`, `InjectionError`, `EventError`, `ScanError` and `SecretError` never reach the wire as themselves. **Codes are often on the line after the constructor**, so a single-line grep finds a third of them; Task 5's scan is multi-line.
5. **`POST /projects` never copies a skeleton, for either blueprint.** It writes a four-line `manifest.yaml` and `src/index.js` containing one import. `fixture-node@1` projects build only because `make demo` pushes `fixtures/fixture-app/`, and the proof app only because `scripts/lib/proof-app.sh` lays the skeleton and the fixture over the clone by hand. `build/context.ts` reads the blueprint's descriptor and Dockerfile and nothing else from the blueprint directory, so a `starters/` folder beside `skeleton/` changes no build.
6. **A starter's `manifest.yaml` cannot be copied verbatim.** `spec/policy.ts` refuses a manifest whose `name` is not the project slug (`SPEC_NAME_SLUG_MISMATCH`), and `fixtures/proof-app/manifest.yaml` says `name: proof-app` above forty lines of comments a reviewer needs. `yaml`'s `parseDocument` + `doc.set('name', slug)` + `String(doc)` rewrites the one value and keeps every comment. *(T1 re-measures it on the real file.)* **Task 1 correction (2026-09-16, `[M4c+]`): it keeps every comment but NOT the file** — `String(doc)` folds the 120-character `description:` line at 80 columns and pads both flow sequences (`[a, b]` → `[ a, b ]`), and no `toString` option reproduces this file, which pads flow maps and not flow sequences. Splicing the slug into the source at the `name` scalar's `range` is byte-exact; Task 11's correction has the code.
7. **The two reserved-label files have different shapes.** `infra/reserved-labels/labels.yaml` is `groups: [{group, reason, labels: {label: standsFor}}]`; `ubc-academic.yaml` is one group at the top level (`group`, `reason`, `labels`). One loader reads both.
8. **The slug rule `^[a-z][a-z0-9-]{2,38}$` is written in `spec/schema.ts` (`SLUG`), `projects/repository.ts`, `source/local-driver.ts` and the zod body in `api/routes/projects.ts`**, and a fifth, unrelated copy guards blueprint names in `blueprints/descriptor.ts`. §23's "one function answers both" is about the check and creation, so the route and the repository collapse onto one function; the local driver keeps its own copy **deliberately** — its comment says why: it is a path-traversal guard on a different input.
9. **Two copies of the script API helper.** `scripts/demo.sh` defines its own `key`, `api`, `field` and `environment`; `scripts/lib/proof-app.sh` defines the same four for `demo-identity`, `demo-ai` and `demo-redeploy`. Every path, origin and header change below would otherwise be made twice.
10. **`db/client.ts` throws at import when `MANIFEST_DATABASE_URL` is unset**, and every route module imports it through `db/index.js`. A stand-alone CLI that imports the route definitions to write the OpenAPI document would need the database URL to *write a file*. The document is therefore written by its own drift test, under Vitest, which already has the URLs.
11. **The Docker tier spawns control planes on 7188 and 7189 that re-register the platform's one SP row** with a loopback ACS (`boot.docker.test.ts`, `identity/saml.docker.test.ts`). Today that breaks a developer's control plane on 7100 until it restarts; after Task 3 it breaks a sign-in through `console.manifest.internal` in exactly the same way. **Restart the control plane after `pnpm test:docker`** — it re-registers at boot.
12. **The Manifest IdP has two test users**, `student` (`stu000001`) and `instructor` (`ins000001`), in `infra/idp/config/authsources.php`, bind-mounted read-only. Promoting either to admin would change what every demo proves about them, so Task 16 adds a third, `operator`.
13. **A build takes 17 s for the skeleton (P4b sitting 6) and is bounded at 900 s** (`runtime/docker/builder.ts`); one has been measured stalling for about eight minutes. That, and a deploy's ~5.4 s healthy and ~91 s failing, are what the client's timeouts are set from.
14. **`openapi-typescript` 7.13.0** depends on `@redocly/openapi-core`, `ansi-colors`, `change-case`, `parse-json`, `supports-color` and `yargs-parser`, and peers `typescript ^5.x` (the workspace has 5.7); **`openapi-fetch` 0.17.0** depends only on `openapi-typescript-helpers` 0.1.0. Read with `npm view` on 2026-09-16. Whether any of them runs an install script — which pnpm 11 refuses unless named in `allowBuilds` — is Task 7's first measurement.

---

## Decisions Rich made, 2026-09-16

**Do not re-open any of these.**

**R1. A project starts from the blueprint's skeleton plus a chosen starter** (§22 step 2, §25 *Starters*). `node-ts-mongo@1`'s first starter is §16's proof app.

**R2. P5 is three plans** — P5a (this one), P5b (delegated tokens and pending actions), P5c (`manifest-mock`, the console, the CI script) — **each written only after the one before it has executed.**

**R3. The console and the API share one origin, `console.manifest.internal`, through the edge, and the edge refuses the control plane's routes to app and sandbox networks** (§21, §12, §16). This needed **§23's reserved labels** — six groups, 755 labels already in `infra/reserved-labels/` — and **the slug check API, `GET /v1/slugs/{slug}`**.

**R4. The contract is versioned by a `/v1` path prefix** (§22 D23.8).

**R5. No P5 acceptance depends on a clean machine or a second developer** (§17's 1c row).

**R6. Builds are asynchronous** (asked while this plan was written). `POST /v1/projects/{projectId}/builds` answers **202** with the build `running`; completion arrives on the event stream as `build.succeeded` or `build.failed`, and a build a restart interrupted is marked failed at boot. **A deploy stays synchronous** (P4c R3). *Rejected:* keeping the build call synchronous — a browser tab and the CI script would hold a request open for up to the 900 s build timeout, and changing it after `/v1` ships is a breaking change.

**R7. The client is generated by `openapi-typescript` and called through `openapi-fetch`** (asked while this plan was written), both pinned exactly, with a thin hand-written wrapper for the cookie, `Origin`, the error envelope and the stream. *Rejected:* a dependency-free generator of our own — it would read the document the way we wrote it and so could not catch a document a third-party tool misreads, which is the tool the separate front-end team will use.

**R8. Twelve sittings, one per session** (asked once the plan was written), as the table at the top has them. *Rejected:* merging to about nine — fewer sessions, and a session limit likelier to land inside a task.

**R9. The six spec actions this plan proposed are applied before it executes** (asked once the plan was written) — P4c's pattern, its R10 — in commit `491f8be`: §6 `Project.starter` and `Build.scan`, §6 `RoleChange`, §20's CSRF as an `Origin` check with a sign-in bound to its browser, §22 D23.9 (long-running work answers `202` and ends on the stream; a deploy is the stated exception), and §14's stream carrying provisioning. *Rejected:* holding them until the tasks run (P4b's pattern), and reviewing the wording first. **If executing a task changes what one of them says, it goes back to Rich.**

*Settled before P5 and not to be re-opened either:* a deploy returns once the new instance serves (P4c R3); redeploys interrupt nobody (P4c R1–R11); §10's per-user AI budget is validated, not enforced; live tailing of an app's own output is not v1 (§14).

---

## Decisions this plan makes, and why

Thirty-nine questions below Rich's line. Each says what it rejected and what changing course would cost.

**The contract**

**1. Every `/v1` route is declared once, through `defineRoute`, and nothing else describes it.** A definition carries its `operationId`, method, OpenAPI path, `zod/v4` schemas for params, query, body and success response, and the error codes it can answer; `registerRoutes` validates with those schemas and `openApiDocument` reads the same objects. *Rejected:* Fastify's own JSON-schema route options with ajv — two validators (ajv at the door, zod in the handler) that can disagree; and `fastify-type-provider-zod` — a dependency that targets the `zod` 4 package rather than the `zod/v4` subpath this repo has. **Cost of changing course:** the definitions are data, so a different renderer reads the same array.

**2. A response is parsed through its representation before it leaves, and a mismatch is a `500` with an operator line.** `z.object` strips unknown keys, so a column added to a table — `handle`, `driver`, a key name — cannot reach a client even if a mapper forgets to omit it. The explicit mappers in `api/representations/` are the first read of "what is public"; the parse is the second, and it is also what turns a handler that returns the wrong shape into a test failure rather than a client's surprise.

**3. Timestamps are ISO-8601 strings, never `Date`.** `z.date()` has no JSON Schema (*Read this first* 2). Every mapper calls `.toISOString()`.

**4. Request bodies are `z.strictObject`.** A mistyped field is refused as `REQUEST_INVALID` naming the field, which is what lets an agent correct itself (§20). Response objects are plain `z.object` — stripping, and documented with `additionalProperties: false`; adding a response field is additive under `/v1`, and the contract README says clients ignore fields they do not know.

**5. A request schema never embeds a representation.** Requests are converted with `io: 'input'` and representations with `io: 'output'`, from two registries, into one `components.schemas`; a schema registered in both would be emitted twice with different shapes. A test refuses an id in both registries.

**6. `/v1` holds every resource route; four endpoints sit outside it and the document says so.** `GET /auth/login`, `POST /auth/saml/callback`, `POST /auth/logout` and the registry's token realm (`GET` and `POST /internal/registry/token`) are listed in the document's `x-manifest-unversioned`, each with its reason (D23.8). **`/auth/me` becomes `GET /v1/me`** — it is a resource, the session's user. **No aliases** for the old paths: an alias is a second surface the authorization suite would have to cover, and nothing outside this repository calls them. An unmatched path answers the D23.7 envelope, `404 ROUTE_NOT_FOUND`, with a hint naming `/v1`.

**7. The document is written by its own drift test.** `pnpm contract:write` runs `api/contract/document.test.ts` with `MANIFEST_CONTRACT_WRITE=1`; without it the test compares and fails naming the command. *Rejected:* a CLI entry point — it would import `db/client.ts`, which throws without a database URL (*Read this first* 10).

**8. `info.version` is `0.1.0`, equal to `@manifest/contract`'s package version, and a test holds them equal.** The major version is the path. P5c sets `1.0.0` when the console has proved the contract; until then additive changes bump the minor and nothing else is allowed.

**9. The generated client and document are excluded from Prettier and ESLint.** `openapi-typescript`'s output is not Prettier-formatted and `JSON.stringify` does not match Prettier's array wrapping; both files are checked by their own drift tests instead.

**10. The four gates become `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm format:check`.** Task 7 adds two packages; `pnpm typecheck` runs `pnpm -r typecheck`, and `pnpm test` runs a new `packages` Vitest project beside `unit`. **This renames a gate in every document that states it** — CLAUDE.md, ORIENTATION, README, RUNBOOK — and Task 7's sweep does it.

**The edge and the front door**

**11. `console.manifest.internal` is a Caddyfile site, not a runtime route.** Runtime routes are lost when the edge restarts (§12); the API must not be. The site refuses, forwards `/v1/*` and `/auth/*` to `host.docker.internal:7100`, and answers everything else with a placeholder that says the console is P5c's. Inside a `route` block, because Caddy sorts `respond` ahead of `reverse_proxy` outside one.

**12. The refusal covers the whole site, by an allow-list of `10.89.0.1/32` — so every app network, and every sandbox network Phase 3 adds, is refused by construction — and answers `403` with a body no other answer has**: `manifest: the control plane is not reachable from this network`. A probe classifies by body — the wildcard's `manifest OK`, the control plane's JSON envelope and Caddy's empty `502` are all distinguishable from it (P4b finding 193). An app cannot forge the source: it holds no `CAP_NET_RAW` (§12), and the edge's replies to `10.89.0.1` leave by the platform network, so no handshake completes. *Rejected:* a deny-list of app subnets — Docker chooses them. **Cost of changing course:** at UBC the allowed source is whatever the edge sees from the ingress; it is one line, and `make verify` asserts it equals the platform network's gateway.

**13. `make verify`'s edge probes move to `edge.manifest.internal`.** A label in §23's *environments and infrastructure* group, so no project can ever take it, and no Caddyfile site names it, so the wildcard always answers it. Three new checks replace what the move loses and prove the new site: the host is not refused, a platform-network container is, and the Caddyfile's allowed source is the network's gateway.

**14. `MANIFEST_CONTROL_PLANE_ORIGIN` defaults to `https://console.manifest.internal`**, the session cookie is `Secure` whenever that origin is `https`, and `loadConfig` keeps its port check for loopback origins only (the Docker tier still uses them).

**15. CSRF is an `Origin` check, applied when a request carries the session cookie**: every `POST`, `PUT`, `PATCH` and `DELETE`, and every WebSocket upgrade, must carry `Origin` equal to `config.sp.origin`, or it is `403 CSRF_ORIGIN_REFUSED`. **The threat is concrete here, not generic**: a deployed app at `x.staging.manifest.internal` is *same-site* with `console.manifest.internal` — and at UBC `*.manifest.apps.ltic.ubc.ca` apps are same-site with the console too — so `SameSite=Lax` sends the session cookie on a form POST from untrusted app code, and a WebSocket opened from an app's page would carry it and read the project's events. **One exemption, argued:** `POST /auth/saml/callback`, whose credential is a signed assertion bound to the browser that asked for it (Decision 16). `POST /auth/logout` is **not** exempt. *Rejected:* a double-submit token — state the client must carry, for no protection the origin check lacks; `SameSite=Strict` — it would drop the cookie on the IdP's return.

**16. A sign-in is bound to the browser that started it.** `GET /auth/login` sets `manifest_login` — a random nonce, `HttpOnly`, `Path=/auth`, ten minutes, `SameSite=None; Secure` on an `https` origin — and sends the nonce as SAML `RelayState`, keeping the return path in the login cookie *(Task 1 correction, 2026-09-16: this sentence said "the nonce and the return path as `RelayState`", which Task 4's own code does not do — SAML Bindings §3.4.3 caps `RelayState` at 80 bytes and a return path may be 512; `[M3d]` measured the real IdP echoing `RelayState` unchanged)*; the callback refuses an assertion whose `RelayState` nonce is not the cookie's, as `401 SAML_LOGIN_NOT_BOUND`. Without it, an attacker can start their own sign-in, obtain an assertion, and post it through a victim's browser — node-saml's `InResponseTo` cache proves a request was made by *this process*, not by *this browser*. `SameSite=None` because the IdP's auto-submitting POST is cross-site in any deployment where the IdP is on another registrable domain.

**17. A return path is a same-origin path or nothing.** `^/(?!/)[^\s\\]{0,511}$`; anything else becomes `/`. The callback redirects there.

**18. The error-code registry is `api/error-codes.ts`: code → status, family and a one-line summary.** A multi-line source scan fails for any code thrown through a wire-mapped class that the registry lacks, **and** for any registered code nothing throws; a second test runs `toErrorResponse` over one error per registered code and compares the status. `ErrorCode` is a union type, so a route's `errors:` list is checked by `tsc`. The spec, policy and blueprint codes that travel inside `details` are a separate enum, `ManifestErrorCode`.

**The resources**

**19. Representations live in `api/representations/`, one file per resource family**, each a registered `zod/v4` schema and the function that maps a row to it.

**20. `GET /v1/projects` is the caller's memberships, for everyone, and the fleet is `GET /v1/fleet`, admin-only (`403 FORBIDDEN` otherwise).** A person's own list should not change shape when they are made an administrator, and §26 makes cross-project reads admin-scoped endpoints on the one API. The path is `/v1/fleet`, not `/v1/admin/fleet`: D31 — administration is a role, not a second API.

**21. The fleet list carries the §26 columns that exist**: project, blueprint, starter, owner, audience, created, and per environment the serving instance's state, release, digest and last deploy, plus the newest Incident's time and `slugReserved` (§23: a project already holding a newly reserved label is reported to administrators). AI spend and department are not built and the document says so.

**22. A `Release` exposes its per-environment configuration with env var NAMES only**, and its build's scan. A value in `env:` is the author's, but nothing a client does needs it and a value typed there by mistake should not travel further than the release.

**23. An `Instance` never carries `driver` or `handle`.**

**Slugs, blueprints and projects**

**24. One function, `checkSlug`, answers the slug check and project creation.** It returns every reason that applies — `SLUG_INVALID` alone for a name that fails §7's rule; otherwise `SLUG_RESERVED` and `SLUG_TAKEN` as they apply, both for a grandfathered holder. At creation the first reason is thrown: `SLUG_INVALID` is `400`, `SLUG_RESERVED` and `SLUG_TAKEN` are `409`. The check is always `200` (§23). `PROJECT_INVALID_SLUG`, `PROJECT_SLUG_TAKEN` and `PROJECT_INVALID_INPUT` are deleted.

**25. The reserved labels are loaded once at boot from `MANIFEST_RESERVED_LABELS_DIR`** (default `infra/reserved-labels`, resolved from the repository root like every other repo path in `config.ts`); a label that breaks §7's rule, appears twice, or a file of the wrong shape refuses the boot, naming the file.

**26. The slug check is rate-limited per session user, 60 a minute, in-process** — `429 RATE_LIMITED` with `Retry-After`. Not at the edge: every host request arrives from one address (*Read this first* 1), so a per-IP limit there would be global. P5b generalises it to per-token limits.

**27. A starter is validated when the registry loads**: its path is `./starters/<name>/` inside the blueprint, it holds text files only (a NUL byte refuses it), at most 200 files and 5 MiB, and its `manifest.yaml` passes §7's schema and `checkBlueprintCompatibility` against its own blueprint. The catalogue check waits for creation, because LiteLLM is not a boot dependency of blueprint loading.

**28. `starter` is optional at creation, `audience` is required.** No starter seeds the skeleton and today's minimal manifest (what `fixture-node@1` projects get). §24 asks the audience question *at project creation*, so leaving it out is `REQUEST_INVALID`; it is stored with `set_by` and `set_at`. **In P5a every `/v1` caller is a session, so "human-only" (D29) holds by construction; P5b's token rule must refuse it**, and *What this plan does not build* says so.

**29. Creation happens in this order**: slug check → seed rendered → model policy read (only if the seed declares models) → project, owner membership and three environments in **one transaction** → repository created, and **the project deleted if that fails** → spec validated and recorded → `project.created`, `repository.seeded` and `spec.validated` published. This closes the repository half of P4b finding 178; no event exists before the repository does, so `audit.events`' `RESTRICT` cannot block the delete.

**30. `projects.starter` is a new nullable column** — provenance a console and an administrator both ask for.

**Builds, events, readiness and administration**

**31. Builds run on a `BuildRunner`, one per process, built at boot like the retirer** — `start()` records the build and `build.started` and returns; the build itself runs in the background; `idle()` is for tests and the acceptance. `recoverAtBoot` gains a pass that marks every `pending` or `running` build `failed` with `BUILD_INTERRUPTED` and publishes `build.failed`. An idempotent replay of the `POST` returns the 202 body as recorded; a client reads `GET /v1/builds/{buildId}` for the present state.

**32. Every driver's `buildImage` returns a scan summary** — `ImageRef.scan` is required, the fake returns a clean one that says it is the fake's, and the driver contract asserts its shape. It is stored on `builds.scan` and shown on the `Build` and on every `Release` of that build: §12's *recorded on the Release*, made true (brief §7 item 7) without a second copy.

**33. Every event type has a `machineDetail` schema, and `recordEvent` refuses a detail that does not match it** (`EVENT_DETAIL_INVALID`, before redaction). The same schemas are the contract's `EventFrame` union, so a client switches on `type` and gets a typed payload. Five types are new: `project.created`, `repository.seeded`, `spec.validated` (Task 11), and `instance.provisioning`, `instance.starting` (Task 14).

**34. The stream is documented in the same document**, as its path with a `426` answer and an `x-manifest-websocket` extension naming the frame schema, the replay size and the ready frame. *Rejected:* a sibling AsyncAPI file — a second document is a second drift test, and neither the generator nor P5c's mock reads AsyncAPI.

**35. `LaunchReadiness` lives in a new `launch/` module** (§5's module map) and is computed, never stored. Items, in order: the domain (*canonical only — no action*, met; §23 orders it before IAM registration for a CWL app), IAM registration, the privacy assessment, the pre-production rehearsal, dependency and secret scans, admin approval, and a load rehearsal when the audience is `large_course` or `public`. Each item carries `state` (`met`, `unmet` or `not_built`), `owner`, `blocking`, `why` and, for `not_built`, the plan that builds it. **Scans is the one item P5a computes**: met when the release serving staging was scanned against a database no older than the staleness threshold and nothing blocked; otherwise unmet, saying why. `ready` is true only when every blocking item is met — so it is `false` throughout Phase 1, honestly.

**36. The first administrator is made by `scripts/admin-grant.sh`, out of band**: one SQL transaction through `docker exec manifest-postgres psql` that changes `users.role` and appends to a new `audit.role_changes` (append-only by grant, like `audit.events`). It refuses a user who has never signed in and an empty reason, and prints that the person must sign in again — sessions are stateless and carry the role (brief §7 item 6, P5b's). `audit.events` cannot hold it: its `project_id` is `NOT NULL`.

**37. The demo scripts stay `curl`, through one shared `scripts/lib/api.sh`.** They are thin wrappers proving platform properties, and rewriting 60 KB of bash onto the client adds no evidence about the contract. **The journey is the contract's client**, and it is written in TypeScript so `tsc` checks it against the generated types (brief §8: Vitest strips types).

**38. The journey does CWL sign-ins through the one flow, `infra/lib/idp-login.sh`,** and hands the session to Node. Signing in is the browser's and the IdP's business, outside the contract (D23.8); a second copy of the three-hop walk is the defect `idp-login.sh`'s header exists to prevent. Step 6 — sign in *inside* the app, write a note, ask a question — is the app's API, not Manifest's, and is `curl` for the same reason.

**39. The journey's project is `journey-app`, created from `node-ts-mongo@1` with the `proof-app` starter**, and it is reused by slug on a re-run. It does not collide with the demos' `proof-app`.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec or from a dated measurement.

- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` (from Task 7: `pnpm typecheck`), `pnpm format:check`. **Run `pnpm test` twice** — a suite that is not repeatable has a state leak.
- **`pnpm test:docker` too** for every task that touches `runtime/`, `routing/`, `releases/`, `identity/`, `infra/` or a `*.docker.test.ts`. It needs `make up`, takes ~13 minutes, and **fails rather than skips** when asked to run.
- **`pnpm test -- <filter>` does not filter.** One unit file: `pnpm exec vitest run --project unit src/<path>`; one Docker file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`, both from the repository root.
- **Vitest strips types; it does not check them.** `exactOptionalPropertyTypes` is on: `hint: cond ? x : undefined` is a type error, and a conditional spread is the fix.
- **Contract schemas import `z` from `'zod/v4'`.** §7's `spec/schema.ts` and `spec/errors.ts` stay on `'zod'` (v3); never pass a v4 issue to `toManifestErrors`.
- **Every `/v1` route requires a session**, and every mutation requires `Idempotency-Key` (D23.6) and, from Task 4, `Origin: https://console.manifest.internal` when a session cookie is present.
- **Any spec change is recorded in *Spec actions* and put to Rich; never edited directly.**
- **Ask before `sudo`.** It cannot prompt from a tool call. Nothing in this plan needs it.
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`; `sed -i` takes an argument: `sed -i ''`.
- **The zone is `*.manifest.internal`**, ports **7100–7199**, and everything binds `127.0.0.1` explicitly — never `localhost`.
- **Never touch Valet**, and these four containers must survive: `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **Adding a dependency needs the network, happens only in sitting 5, and is pinned exactly.** pnpm 11 refuses an install script not named in `pnpm-workspace.yaml`'s `allowBuilds`; allowing one is a supply-chain decision recorded with its reason.
- **A Caddyfile edit reaches the edge through `make up`**, whose `ensure-caddy-config.sh` reloads it — and **a reload drops every runtime route**. Restart the control plane afterwards: its boot puts the routes back (P4c Task 9).
- **After `pnpm test:docker`, restart the control plane** — the tier restarts the edge and re-registers the platform's SP row at a loopback ACS (*Read this first* 11). **After `pnpm test`**, the control plane's tables are truncated.
- **`request.log.error` writes nothing** under `Fastify({ logger: false })`. Use `console.error` for anything an operator must see, and never put a key, a secret, a cookie or a third-party error body in it (§14).
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built — **after committing the task** (`git checkout` restores from the index, ORIENTATION §4) — and naming the test that goes red.
- **Every task names its caller.** From Task 7, the caller of every new route is a step of `packages/journey`.
- **The agent's shell is zsh**: `path` is tied to `$PATH`, `ls` is aliased, `grep` is `ugrep` (use `-F` for a pattern with `$`), an unquoted variable is not word-split, a word starting with `=` is expanded. Two Bash calls issued together share one shell — use absolute paths.
- **Leave the machine as you found it.** `./scripts/snapshot-machine.sh > /tmp/p5a-sN-before.txt` at the start of a sitting, the same at the end, and `diff` them.
- **Commit after every task**, on `main`, conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), ending with the attribution line the session's system reminder gives.
- **Test fixtures named in a snippet and not defined are local to that test file** — `loginAs`, `testDeps`, `resetDatabase`, `withProject` come from the harness; anything else a snippet names and does not import is written beside the test that uses it, never in `src/`.

**What this plan does not create.** No delegated token, no pending action, no step-up re-authentication, no `manifest-mock`, no console, no CI workflow, no production deploy, no approval, no custom domain, no change to an audience after creation. Those are P5b's, P5c's and Phase 2's; see *What this plan does not build*.

---

## File Structure

```
infra/
├── caddy/Caddyfile                                MOD  T3  console.manifest.internal site
├── idp/config/authsources.php                     MOD  T16 the `operator` test user
└── lib/common.sh                                  MOD  T3  CONSOLE_HOST, EDGE_PROBE_HOST, HOST_SOURCE_IP
scripts/
├── lib/api.sh                                     NEW  T2  the one key/api/field/json/environment
├── lib/proof-app.sh                               MOD  T2 T3 T4 T10 T11 T13
├── lib/event-stream.mjs                           MOD  T2 T4 path, origin
├── demo.sh demo-identity.sh demo-ai.sh
│   demo-redeploy.sh                               MOD  T2 T3 T11 T13
├── demo-journey.sh                                NEW  T7  grows each task; T17 green
├── admin-grant.sh                                 NEW  T16
├── offline-acceptance.sh                          MOD  T2 T3 T17
├── verify.sh doctor.sh                            MOD  T3
Makefile                                           MOD  T7  demo-journey
package.json pnpm-workspace.yaml
vitest.workspace.ts eslint.config.js .prettierignore MOD T6 T7
blueprints/node-ts-mongo/
├── blueprint.yaml                                 MOD  T10 starters
└── starters/proof-app/                            MOVED T10 from fixtures/proof-app/
packages/contract/                                 NEW  T6 (openapi.json) T7 (client)
├── package.json tsconfig.json README.md
├── openapi.json                                   GENERATED, checked in
└── src/{schema.d.ts,client.ts,errors.ts,stream.ts,index.ts,*.test.ts}
packages/journey/                                  NEW  T7
├── package.json tsconfig.json
└── src/{main.ts,check.ts,state.ts,boundary.test.ts}
packages/control-plane/
├── drizzle/0010_*.sql                             NEW  T11 projects.starter; 3 event types
├── drizzle/0011_*.sql                             NEW  T13 builds.scan
├── drizzle/0012_*.sql                             NEW  T14 2 event types
├── drizzle/0013_*.sql                             NEW  T16 audit.role_changes
└── src/
    ├── config.ts                                  MOD  T3 origin default; T9 reserved labels dir
    ├── index.ts                                   MOD  T3 T9 T13 boot
    ├── api/
    │   ├── actor.ts                               NEW  T6  requireActor, moved out of server.ts
    │   ├── csrf.ts                                NEW  T4
    │   ├── rate-limit.ts                          NEW  T9
    │   ├── error-codes.ts                         NEW  T5
    │   ├── errors.ts server.ts testing.ts         MOD  most tasks
    │   ├── authz-contract.ts                      MOD  every route-adding task
    │   ├── versioning.test.ts                     NEW  T2
    │   ├── contract/
    │   │   ├── route.ts                           NEW  T6  defineRoute, registerRoutes
    │   │   ├── schemas.ts                         NEW  T6  the two registries, common schemas
    │   │   ├── document.ts                        NEW  T6  openApiDocument
    │   │   ├── websocket.ts                       NEW  T12 the stream's path entry
    │   │   └── *.test.ts                          NEW  T6  drift, coverage, route behaviour
    │   ├── representations/                       NEW  T6–T16, one file per resource family
    │   └── routes/                                MOD/NEW T6–T16; index.ts holds ROUTE_DEFINITIONS
    ├── identity/{saml.ts,login-state.ts}          MOD/NEW T4
    ├── projects/
    │   ├── reserved-labels.ts slugs.ts            NEW  T9
    │   ├── provision.ts                           NEW  T11 creation, in order
    │   ├── fleet.ts                               NEW  T16
    │   └── repository.ts                          MOD  T8 T9 T11
    ├── blueprints/{descriptor.ts,registry.ts,
    │   starters.ts,seed.ts}                       MOD/NEW T10 T11
    ├── observability/{events.ts,event-schemas.ts} MOD/NEW T11 T12 T14
    ├── releases/{build.ts,recover.ts,release.ts}  MOD  T13 T14
    ├── runtime/{driver.ts,fake-driver.ts,
    │   driver-contract.ts,docker/driver.ts}       MOD  T13 scan summary
    ├── build/scan.ts                              MOD  T13 summarizeScan
    ├── launch/{readiness.ts,index.ts}             NEW  T15
    └── db/{schema.ts,testing.ts}                  MOD  T11 T13 T14 T16
docs/superpowers/spikes/p5a-baseline/              NEW  T1
```

---
## Task 1: Measure what the design rests on — before any of it is built

> **EXECUTED 2026-09-16 (sitting 1).** The results are `spikes/p5a-baseline/results-task1-2026-09-16.txt`, the index is `spikes/p5a-baseline/README.md`, and every correction or result it wrote is at the top of Tasks 3, 4, 6, 9, 11 and 12, in Decision 16 and in *Read this first* 6. **If you re-run it, do not run it in the order below**: Step 3's `vitest run --project unit` runs `vitest.global-setup.ts`, which TRUNCATES `projects`, `project_members`, `users`, `instances`, `routes` and `secrets` even for one file — so M3 then fails with *"the instructor holds no proof-app project to stream"*. Run M1's typecheck (and M1g's controls) first, and its `vitest run` after Step 8. Sitting 1's record in *What executing this plan found* has the rest.

**Why first and alone.** Every worst defect in this project arrived the first time something ran end to end, and P5a makes four things run for the first time: a `zod/v4` route, an edge site that refuses by source, a sign-in whose ACS is behind the edge, and a stream upgraded through it. Each is measured here, on the machine as P4c left it, with a positive control beside every denial. **No platform code changes in this task.** What it finds is written as corrections at the top of the tasks it affects, and the sittings are re-cut if a boundary moves.

**Files:**
- Create: `docs/superpowers/spikes/p5a-baseline/README.md`
- Create: `docs/superpowers/spikes/p5a-baseline/m1-zod-route.test.ts.txt` (run from a temporary copy under `packages/control-plane/src/`, then removed — Step 3)
- Create: `docs/superpowers/spikes/p5a-baseline/m2-edge-refusal.sh`
- Create: `docs/superpowers/spikes/p5a-baseline/m3-login-through-origin.sh`
- Create: `docs/superpowers/spikes/p5a-baseline/m3b-relaystate.mjs`
- Create: `docs/superpowers/spikes/p5a-baseline/m4-reserved-labels.mjs`
- Create: `docs/superpowers/spikes/p5a-baseline/m5-node-origin.mjs`
- Create: `docs/superpowers/spikes/p5a-baseline/results-task1-<YYYY-MM-DD>.txt` (every run's output, named for the day it ran)
- Modify: this plan — corrections at the top of Tasks 3, 4, 6, 9, 10 or 11 wherever a measurement disagrees with them, and *What executing this plan found*

**Interfaces:**
- Consumes: the platform up (`make up`, `make doctor` 18/0, `make verify` 47/0); the proof app deployed from `make demo-redeploy`'s last run (one app container labelled `manifest.slug=proof-app` and `manifest.release`); the control plane **not** running (port 7100 free); README's *Running the control plane* environment; `infra/lib/idp-login.sh` (`idp_login`), `infra/lib/common.sh` (`ZONE`, `PORT_CADDY_ADMIN`, `CA_FILE`), `scripts/lib/event-stream.mjs` (`watch`).
- Produces: `results-task1-<date>.txt` with the sections `[M1a]`–`[M1g]`, `[M2a]`–`[M2f]`, `[M3a]`–`[M3d]`, `[M4a]`–`[M4c]`, `[M5]`; and, in this plan, a dated *Task 1 corrections* note at the top of every task a result changes.

- [ ] **Step 1: Snapshot the machine and check the preconditions**

```bash
cd /Users/rich/Developer/manifest
./scripts/snapshot-machine.sh > /tmp/p5a-s1-before.txt
make doctor | tail -3            # expect: 18 checks, 0 failed
make verify | tail -3            # expect: 47 checks, 0 failed
curl -sS -m 3 http://127.0.0.1:7100/auth/me && echo "STOP: a control plane is running on 7100 — stop it first" || echo "7100 free"
docker ps --filter label=manifest.slug=proof-app --filter label=manifest.release --format '{{.Names}} {{.Status}}'
# expect ONE line: mf-proof-app-staging-…-app Up … (healthy). Repeated label filters AND (P4c).
mkdir -p docs/superpowers/spikes/p5a-baseline
```

If `make verify` is 47/1 on *the events table is append-only by GRANT*, run `pnpm --filter @manifest/control-plane db:migrate` with README's exports (ORIENTATION §4) and re-run it. If the proof app has no container, run `make demo-ai` first — M2's app-network probe needs a real app on a real app network.

- [ ] **Step 2: Write M1, the `zod/v4` route measurement**

Write it **temporarily** at `packages/control-plane/src/api/contract/m1-spike.test.ts` (it must resolve the control plane's own `fastify` and `zod`, and `tsc` must see it under the package's real `tsconfig.json`):

```ts
// M1 (P5a Task 1) — THROWAWAY. zod/v4 on the shape of one real route, end to end.
// Copied to docs/superpowers/spikes/p5a-baseline/m1-zod-route.test.ts.txt and deleted
// from src/ before the task commits. Every `console.log` line is a measurement: the
// assertions only stop the run when a fact the plan relies on is false.
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { ZodError as ZodV3Error } from 'zod'
import { z } from 'zod/v4'

const Environment = z.object({
  id: z.uuid(),
  kind: z.enum(['sandbox', 'staging', 'production']),
  hostname: z.string(),
})
const Project = z.object({
  id: z.uuid(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
  environments: z.array(Environment).optional(),
})
const CreateProjectRequest = z.strictObject({
  slug: z.string(),
  audience: z.strictObject({
    scale: z.enum(['solo', 'class', 'large_course', 'public']),
    justification: z.string().optional(),
  }),
})

const representations = z.registry<{ id: string }>()
representations.add(Environment, { id: 'Environment' })
representations.add(Project, { id: 'Project' })
const requests = z.registry<{ id: string }>()
requests.add(CreateProjectRequest, { id: 'CreateProjectRequest' })

const PROJECT_ID = '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f'

// M1g: the smallest generic `defineRoute` Task 6 will write, so `tsc` can refuse it now.
interface Def<P extends z.ZodObject, R extends z.ZodType> {
  path: `/v1/${string}`
  params: P
  success: { status: 200; schema: R }
  handler: (ctx: { params: z.output<P> }) => Promise<z.input<R>>
}
function defineRoute<P extends z.ZodObject, R extends z.ZodType>(def: Def<P, R>): Def<P, R> {
  return def
}
const getProject = defineRoute({
  path: '/v1/projects/{projectId}',
  params: z.strictObject({ projectId: z.uuid() }),
  success: { status: 200, schema: Project },
  // `params.projectId` must be typed `string` here, and returning a number for `slug`
  // must be a tsc error — uncomment the second line once to watch it refused.
  handler: async ({ params }) => ({ id: params.projectId, slug: 'chem-labs', createdAt: new Date(0).toISOString() }),
  // handler: async ({ params }) => ({ id: params.projectId, slug: 1, createdAt: '' }),
})

describe('M1 — zod/v4 on a real route shape', () => {
  it('[M1a] refuses a bad param and strips a column the representation does not name', async () => {
    const app = Fastify({ logger: false })
    const Params = z.strictObject({ projectId: z.uuid() })
    app.get('/v1/projects/:projectId', async (request, reply) => {
      const params = Params.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          issues: params.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
        })
      }
      // A database row, with two fields no client may see.
      const row = {
        id: params.data.projectId,
        slug: 'chem-labs',
        createdAt: new Date('2026-09-16T00:00:00Z').toISOString(),
        handle: 'mf-chem-labs-staging-0-0-app',
        driver: 'docker',
      }
      return Project.parse(row)
    })
    const bad = await app.inject({ method: 'GET', url: '/v1/projects/not-a-uuid' })
    const good = await app.inject({ method: 'GET', url: `/v1/projects/${PROJECT_ID}` })
    console.log('[M1a] bad ', bad.statusCode, bad.body)
    console.log('[M1a] good', good.statusCode, good.body)
    expect(bad.statusCode).toBe(400)
    expect(good.json()).not.toHaveProperty('handle')
    expect(await getProject.handler({ params: { projectId: PROJECT_ID } })).toMatchObject({ slug: 'chem-labs' })
  })

  it('[M1b] refuses a Date where a timestamp string belongs', () => {
    const result = Project.safeParse({ id: PROJECT_ID, slug: 'x', createdAt: new Date() })
    console.log('[M1b]', result.success, JSON.stringify(result.error?.issues))
    expect(result.success).toBe(false)
  })

  it('[M1c] turns two registries into components that $ref each other', () => {
    const uri = (id: string) => `#/components/schemas/${id}`
    const output = z.toJSONSchema(representations, { io: 'output', uri })
    const input = z.toJSONSchema(requests, { io: 'input', uri })
    console.log('[M1c] output', JSON.stringify(output))
    console.log('[M1c] input ', JSON.stringify(input))
    expect(JSON.stringify(output)).toContain('"$ref":"#/components/schemas/Environment"')
  })

  it('[M1d] emits the shapes P5a will use', () => {
    const shapes: Record<string, z.ZodType> = {
      nullable: z.string().nullable(),
      record: z.record(z.string(), z.unknown()),
      literal: z.literal('event'),
      union: z.union([z.object({ kind: z.literal('a') }), z.object({ kind: z.literal('b') })]),
      discriminated: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('a'), x: z.string() }),
        z.object({ kind: z.literal('b'), y: z.number() }),
      ]),
      optionalKey: z.object({ a: z.string().optional() }),
      defaulted: z.object({ a: z.string().default('x') }),
      integer: z.number().int().min(0),
    }
    for (const [name, schema] of Object.entries(shapes)) {
      console.log(`[M1d] ${name}`, JSON.stringify(z.toJSONSchema(schema, { io: 'output' })))
    }
  })

  it('[M1e] a v4 ZodError is not a v3 ZodError', () => {
    const result = z.string().safeParse(1)
    console.log('[M1e] instanceof zod 3 ZodError:', result.error instanceof ZodV3Error)
  })

  it('[M1f] a query object converts to what OpenAPI parameters need', () => {
    const Query = z.strictObject({
      expand: z.string().optional(),
      tail: z.coerce.number().int().min(1).max(10_000).optional(),
    })
    const schema = z.toJSONSchema(Query, { io: 'input' })
    console.log('[M1f]', JSON.stringify(schema))
    const parsed = Query.safeParse({ tail: '5' })
    console.log('[M1f] coerced from a query string:', JSON.stringify(parsed))
  })
})
```

- [ ] **Step 3: Run M1, typecheck it, keep the evidence and remove the file**

```bash
cd /Users/rich/Developer/manifest
OUT=docs/superpowers/spikes/p5a-baseline/results-task1-$(date +%F).txt
pnpm exec vitest run --project unit src/api/contract/m1-spike.test.ts 2>&1 | tee -a "$OUT"
pnpm --filter @manifest/control-plane typecheck 2>&1 | tail -5 | tee -a "$OUT"   # [M1g] expect: clean
# [M1g] negative control: swap the two `handler:` lines, re-run typecheck, expect
#   error TS2322 on `slug` — then swap them back.
cp packages/control-plane/src/api/contract/m1-spike.test.ts docs/superpowers/spikes/p5a-baseline/m1-zod-route.test.ts.txt
rm packages/control-plane/src/api/contract/m1-spike.test.ts
rmdir packages/control-plane/src/api/contract
git status --short packages/   # expect: nothing
```

**What to record from M1**, each as a line under `[M1…]` in the results file: the 400's issue codes; whether `handle` survived; the `$ref` form and whether each component carries `$schema`/`$id`; how `nullable`, `discriminated` and `optionalKey` are emitted (`anyOf` or `oneOf`, `required` present or not); whether `default` makes a key required in output; whether a v4 error is `instanceof` the v3 class (**expected `false`** — if `true`, Task 6's error handler needs no second branch); whether `z.coerce.number()` accepts the string `'5'`. **If `tsc` refuses the generic `defineRoute`**, write the error at the top of Task 6.

- [ ] **Step 4: Write M2, the edge refusing by source**

`docs/superpowers/spikes/p5a-baseline/m2-edge-refusal.sh`:

```bash
#!/usr/bin/env bash
# M2 (P5a Task 1): can an edge route refuse every source but the host — and is the
# refusal the MATCHER, not a network that cannot reach the edge anyway?
#
# A throwaway route for p5a-probe.manifest.internal, through the admin API, dialling a
# hold server on the host. Removed on exit. Nothing here changes the Caddyfile.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"
# shellcheck source=../../../../infra/lib/common.sh
. infra/lib/common.sh

ADMIN="http://127.0.0.1:$PORT_CADDY_ADMIN"
HOST="p5a-probe.$ZONE"
HOLD_PORT=7190
ROUTE_ID=p5a-probe
ALLOW="${M2_ALLOW:-10.89.0.1/32}"
REFUSAL='manifest: the control plane is not reachable from this network'

# A hold server: answers `held <ms>` after ?ms=, so the same upstream measures both the
# forward and a long request. Loopback only, like the control plane.
node -e '
  const http = require("node:http")
  http.createServer((req, res) => {
    const ms = Number(new URL(req.url, "http://x").searchParams.get("ms") ?? 0)
    setTimeout(() => res.end(`held ${ms}`), ms)
  }).listen(Number(process.argv[1]), "127.0.0.1")
' "$HOLD_PORT" &
HOLD_PID=$!
cleanup() {
  kill "$HOLD_PID" 2>/dev/null || true
  curl -sS -X DELETE "$ADMIN/id/$ROUTE_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sleep 1

# $1: `with` or `without` the refusal. PUT to routes/0 inserts AHEAD of the wildcard;
# POST would append behind it and never match (ORIENTATION §4).
route() {
  local refuse=''
  if [ "$1" = with ]; then
    refuse="{\"match\":[{\"not\":[{\"remote_ip\":{\"ranges\":[\"$ALLOW\"]}}]}],\"handle\":[{\"handler\":\"static_response\",\"status_code\":403,\"body\":\"$REFUSAL\"}]},"
  fi
  curl -sS -X DELETE "$ADMIN/id/$ROUTE_ID" >/dev/null 2>&1 || true
  curl -sS -f -X PUT "$ADMIN/config/apps/http/servers/srv0/routes/0" \
    -H 'content-type: application/json' \
    -d "{\"@id\":\"$ROUTE_ID\",\"match\":[{\"host\":[\"$HOST\"]}],\"handle\":[{\"handler\":\"subroute\",\"routes\":[$refuse{\"handle\":[{\"handler\":\"reverse_proxy\",\"upstreams\":[{\"dial\":\"host.docker.internal:$HOLD_PORT\"}]}]}]}],\"terminal\":true}" \
    >/dev/null
}

from_host() { curl -sS -m "${2:-10}" -w ' [%{http_code}]' "https://$HOST$1"; echo; }
from_platform() {
  docker run --rm --network "$NET" --dns "$DNS_C_IP" \
    -v "$ROOT/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
    --cacert /ca.crt -sS -m 10 -w ' [%{http_code}]' "https://$HOST$1"
  echo
}
APP="$(docker ps --filter label=manifest.slug=proof-app --filter label=manifest.release --format '{{.Names}}' | head -1)"
[ -n "$APP" ] || { echo "no proof-app container — run make demo-ai first"; exit 1; }
# From INSIDE the app, by the edge's name on the app network, with the probe's name as
# SNI and Host: the path §12 says name resolution does not close. Node's https ignores
# the proxy variables the app is given. rejectUnauthorized is off because this probes
# ROUTING, and the answer must not be a TLS failure mistaken for a refusal.
from_app() {
  docker exec "$APP" node -e '
    const https = require("node:https")
    const [host, path] = process.argv.slice(1)
    https.get({ host: "manifest-caddy", port: 443, servername: host, headers: { host }, path, rejectUnauthorized: false }, (res) => {
      let body = ""; res.on("data", (d) => (body += d)); res.on("end", () => console.log(`${body} [${res.statusCode}]`))
    }).on("error", (e) => console.log(`error ${e.code}`))
  ' "$HOST" "$1"
}

route with
echo "[M2a] host           : $(from_host '/?ms=1')"
echo "[M2b] platform net   : $(from_platform '/?ms=1')"
echo "[M2c] proof-app net  : $(from_app '/?ms=1')"
route without
echo "[M2d] CONTROL, no refusal — proof-app net: $(from_app '/?ms=1')"
route with
echo "[M2e] a 100 s request through the edge, from the host:"
START=$(date +%s); echo "      $(from_host '/?ms=100000' 130) after $(( $(date +%s) - START )) s"

# [M2f] The Caddyfile form Task 3 will ship, adapted by THIS Caddy and printed as JSON —
# checked here, loaded nowhere. `route` keeps written order; outside one, Caddy sorts
# `respond` ahead of `reverse_proxy`.
docker exec -i manifest-caddy sh -c 'cat > /tmp/p5a-m2f.Caddyfile' <<'CADDY'
console.manifest.internal {
	tls internal
	route {
		@outside not remote_ip 10.89.0.1/32
		respond @outside "manifest: the control plane is not reachable from this network" 403
		@api path /v1/* /auth/*
		reverse_proxy @api host.docker.internal:7100
		respond "manifest console: not built yet — P5c serves it here. The API is under /v1/." 200
	}
}
CADDY
echo "[M2f] adapted:"
docker exec manifest-caddy caddy adapt --config /tmp/p5a-m2f.Caddyfile --adapter caddyfile
docker exec manifest-caddy rm -f /tmp/p5a-m2f.Caddyfile
```

- [ ] **Step 5: Run M2**

```bash
cd /Users/rich/Developer/manifest
bash docs/superpowers/spikes/p5a-baseline/m2-edge-refusal.sh 2>&1 | tee -a "$OUT"
curl -sS https://p5a-probe.manifest.internal/ ; echo    # afterwards: the WILDCARD again
```

**Expected, and what each result changes if it differs:**

| | Expected | If not |
|---|---|---|
| M2a | `held 1 [200]` | the host is not `10.89.0.1`: record the address the wildcard reports for the host (`curl https://edge.manifest.internal/`) and put it in Decision 12, Task 3's Caddyfile and `HOST_SOURCE_IP` |
| M2b | the refusal body `[403]` | Task 3's *a platform-network container is refused* check is wrong as written |
| M2c | the refusal body `[403]` | **stop** — §12's refusal cannot be built this way; record it and put it to Rich |
| M2d | `held 1 [200]` | the refusal is not what denied M2c: M2c proves nothing, and Task 3's S6 probe needs a different control |
| M2e | `held 100000 [200]` after ~100 s | the edge cuts long requests: write the bound at the top of Task 7 (the client's deploy timeout) |
| M2f | JSON with a `subroute` whose first route matches `not` → `remote_ip` and whose last is a `static_response` | Task 3's block is written wrong: correct it from the adapted JSON |

- [ ] **Step 6: Write M3, a sign-in and a stream through a new origin**

`docs/superpowers/spikes/p5a-baseline/m3-login-through-origin.sh`:

```bash
#!/usr/bin/env bash
# M3 (P5a Task 1): a real CWL sign-in whose ACS is behind the edge, and a WebSocket
# stream upgraded through it — the two things the brief's §3 did not show.
#
# Boots the control plane with MANIFEST_CONTROL_PLANE_ORIGIN at a throwaway probe
# origin, which RE-REGISTERS the platform's SP row there. Step 8 of Task 1 puts the row
# back by booting once at the default origin.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT"
. infra/lib/common.sh
. infra/lib/idp-login.sh
fail() { echo "FAIL: $*" >&2; exit 1; }

ADMIN="http://127.0.0.1:$PORT_CADDY_ADMIN"
HOST="p5a-probe.$ZONE"
ORIGIN="https://$HOST"
CA="$ROOT/$CA_FILE"
WORK="$(mktemp -d -t p5a-m3)"
JAR="$WORK/jar"; IDP_JAR="$WORK/idp-jar"

set -a; . ./.env; set +a
export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
export MANIFEST_SESSION_SECRET="$(openssl rand -hex 32)"
export MANIFEST_BLUEPRINTS_ROOT="$ROOT/blueprints"
export MANIFEST_REPOS_ROOT="$ROOT/.manifest/repos"
export MANIFEST_LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}"

pnpm --filter @manifest/control-plane build >/dev/null
MANIFEST_CONTROL_PLANE_ORIGIN="$ORIGIN" node packages/control-plane/dist/index.js > "$WORK/cp.log" 2>&1 &
CP=$!
cleanup() {
  kill "$CP" 2>/dev/null || true
  curl -sS -X DELETE "$ADMIN/id/p5a-probe" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
for _ in $(seq 1 60); do grep -q 'control plane ready' "$WORK/cp.log" && break; sleep 1; done
grep 'control plane ready' "$WORK/cp.log" || { cat "$WORK/cp.log"; fail "no boot line"; }

# Everything on the probe origin to the control plane, host source only.
curl -sS -f -X PUT "$ADMIN/config/apps/http/servers/srv0/routes/0" -H 'content-type: application/json' \
  -d "{\"@id\":\"p5a-probe\",\"match\":[{\"host\":[\"$HOST\"]}],\"handle\":[{\"handler\":\"reverse_proxy\",\"upstreams\":[{\"dial\":\"host.docker.internal:7100\"}]}],\"terminal\":true}" >/dev/null

echo "[M3a] sign-in through $ORIGIN"
idp_login "$JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor "$ORIGIN/auth/saml/callback" "$CA"
# Cookie NAMES and FLAGS, never values.
awk -F'\t' 'NF==7 {print "      cookie", $6, "domain="$1, "secure="$4}' "$JAR"
echo "[M3b] $(curl -sS -b "$JAR" "$ORIGIN/auth/me")"

PROJECT_ID="$(curl -sS -b "$JAR" "$ORIGIN/projects" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.slug==="proof-app");console.log(p?p.id:"")})')"
[ -n "$PROJECT_ID" ] || fail "the instructor holds no proof-app project to stream"
node scripts/lib/event-stream.mjs watch "$ORIGIN" "$PROJECT_ID" "$JAR" "$WORK/frames.ndjson" &
WATCH=$!
sleep 4
kill "$WATCH" 2>/dev/null || true
echo "[M3c] frames through the edge: $(wc -l < "$WORK/frames.ndjson" | tr -d ' '), ready frame: $(grep -c 'manifest.stream.ready' "$WORK/frames.ndjson" || true)"

echo "[M3d] RelayState round trip through the real IdP"
URL="$(node docs/superpowers/spikes/p5a-baseline/m3b-relaystate.mjs "$ORIGIN")"
FORM="$(curl -sS --cacert "$CA" -c "$WORK/idp2" -b "$WORK/idp2" -L "$URL")"
STATE="$(echo "$FORM" | sed -n 's/.*name="AuthState"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
ACTION="$(echo "$FORM" | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
case "$ACTION" in http*) POST="$ACTION" ;; *) POST="https://idp.$ZONE$ACTION" ;; esac
ASSERTION="$(curl -sS --cacert "$CA" -c "$WORK/idp2" -b "$WORK/idp2" -L \
  --data-urlencode username=instructor --data-urlencode password=instructor \
  --data-urlencode "AuthState=$STATE" "$POST")"
echo "      RelayState in the IdP's form: $(echo "$ASSERTION" | sed -n 's/.*name="RelayState"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
```

`docs/superpowers/spikes/p5a-baseline/m3b-relaystate.mjs` — a signed AuthnRequest carrying a known `RelayState`, from the control plane's own entity and keypair (the row M3's boot just registered):

```js
// M3b (P5a Task 1): print a signed AuthnRequest URL whose RelayState is a known value.
//   node m3b-relaystate.mjs <origin>
// The IdP must echo RelayState in the form it posts back, or Decision 16's binding
// cannot ride on it. The request is signed with infra/sp/control-plane.key, the same
// key the running control plane registered, so the IdP accepts it.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const ROOT = new URL('../../../../', import.meta.url)
const require = createRequire(new URL('packages/control-plane/package.json', ROOT))
const { SAML } = require('@node-saml/node-saml')
const { controlPlaneSpEntity, SP_NAME_ID_FORMAT } = await import(
  new URL('packages/control-plane/dist/sso/index.js', ROOT)
)

const origin = process.argv[2]
const entity = controlPlaneSpEntity({ entityBase: 'https://manifest.internal', origin })
const saml = new SAML({
  issuer: entity.entityId,
  callbackUrl: entity.acsUrl,
  entryPoint: 'https://idp.manifest.internal/module.php/saml/idp/singleSignOnService',
  idpCert: readFileSync(new URL('infra/idp/cert/server.crt', ROOT), 'utf8'),
  privateKey: readFileSync(new URL('infra/sp/control-plane.key', ROOT), 'utf8'),
  signatureAlgorithm: 'sha256',
  digestAlgorithm: 'sha256',
  identifierFormat: SP_NAME_ID_FORMAT,
  disableRequestedAuthnContext: true,
})
console.log(await saml.getAuthorizeUrlAsync('p5a-m3-relaystate-probe', undefined, {}))
```

- [ ] **Step 7: Run M3**

```bash
cd /Users/rich/Developer/manifest
bash docs/superpowers/spikes/p5a-baseline/m3-login-through-origin.sh 2>&1 | tee -a "$OUT"
```

**Expected:** `[M3a]` a `manifest_session` cookie for `p5a-probe.manifest.internal` with `secure=FALSE` (development: that is what Decision 14 changes); `[M3b]` `{"id":…,"puid":"ins000001","role":"member"}`; `[M3c]` at least one frame and `ready frame: 1`; `[M3d]` `RelayState in the IdP's form: p5a-m3-relaystate-probe`.

**If `[M3d]` is empty**, Decision 16 cannot put its nonce in `RelayState`. Write this at the top of Task 4 instead: the login cookie holds the AuthnRequest's ID (read from the redirect URL with `authnRequestId`, which `identity/testing.ts` already has), and the callback compares it with the assertion's `InResponseTo` from node-saml's `profile.inResponseTo`; the return path then rides in a second cookie. **If `[M3a]` fails at the ACS comparison**, the row was not registered at the probe origin — read `$WORK/cp.log` before the trap removes it (run the script with `trap - EXIT` commented in).

- [ ] **Step 8: Put the platform's SP row back**

M3's boot registered the control plane's SP at the probe origin. Boot once at the default origin, which re-registers it, then stop:

```bash
cd /Users/rich/Developer/manifest
set -a; . ./.env; set +a
export MANIFEST_DATABASE_URL="postgres://manifest_app:${MANIFEST_APP_PASSWORD}@127.0.0.1:7103/manifest_control"
export MANIFEST_IDP_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_idp"
export MANIFEST_SESSION_SECRET="$(openssl rand -hex 32)" MANIFEST_BLUEPRINTS_ROOT="$PWD/blueprints" \
  MANIFEST_REPOS_ROOT="$PWD/.manifest/repos" MANIFEST_LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}"
node packages/control-plane/dist/index.js > /tmp/p5a-s1-restore.log 2>&1 &
CP=$!; for _ in $(seq 1 60); do grep -q 'control plane ready' /tmp/p5a-s1-restore.log && break; sleep 1; done
kill "$CP"
docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
  "SELECT entity_data::json->>'AssertionConsumerService' FROM saml20_sp_remote WHERE entity_id LIKE '%manifest-control-plane/platform'" \
  | tee -a "$OUT"
# expect the ACS at http://127.0.0.1:7100/auth/saml/callback
```

If the `SELECT` names a different column shape, read the row with `SELECT entity_data FROM saml20_sp_remote WHERE entity_id LIKE '%platform'` and find the ACS in it — the check is that it names `127.0.0.1:7100`.

- [ ] **Step 9: Write and run M4, the reserved-label data and the manifest rewrite**

`docs/superpowers/spikes/p5a-baseline/m4-reserved-labels.mjs`:

```js
// M4 (P5a Task 1): the reserved-label data as Task 9 will load it, the platform names
// the edge serves, the repository's own slugs, and a starter manifest's name rewritten
// with its comments kept (Task 11).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const require = createRequire(join(ROOT, 'packages/control-plane/package.json'))
const { parse, parseDocument } = require('yaml')
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

// [M4a] both files, both shapes
const dir = join(ROOT, 'infra/reserved-labels')
const groups = []
for (const file of ['labels.yaml', 'ubc-academic.yaml']) {
  const doc = parse(readFileSync(join(dir, file), 'utf8'))
  const found = Array.isArray(doc.groups) ? doc.groups : [doc]
  for (const g of found) groups.push({ file, ...g })
}
const seen = new Map()
const problems = []
for (const g of groups) {
  for (const label of Object.keys(g.labels)) {
    if (!SLUG.test(label)) problems.push(`${g.file}: '${label}' breaks §7's rule`)
    if (seen.has(label)) problems.push(`'${label}' is in ${seen.get(label)} and ${g.group}`)
    seen.set(label, g.group)
  }
}
console.log(`[M4a] ${seen.size} labels in ${groups.length} groups:`, groups.map((g) => `${g.group}=${Object.keys(g.labels).length}`).join(' '))
console.log(`[M4a] problems: ${problems.length === 0 ? 'none' : problems.join('; ')}`)

// [M4b] every platform name the Caddyfile serves, and the repository's own slugs
const caddy = readFileSync(join(ROOT, 'infra/caddy/Caddyfile'), 'utf8')
const sites = [...caddy.matchAll(/^([a-z0-9*.,\s-]+)\s*\{\s*$/gm)]
  .flatMap((m) => m[1].split(',').map((s) => s.trim()))
  .filter((s) => s.endsWith('.manifest.internal') && !s.startsWith('*'))
console.log('[M4b] Caddyfile sites:', sites.map((s) => `${s} → ${seen.get(s.split('.')[0]) ?? 'NOT RESERVED'}`).join(', '))
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  if (n === 'node_modules' || n === 'dist' || n.startsWith('.')) return []
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const slugs = new Set()
for (const file of [...walk(join(ROOT, 'packages/control-plane/src')), ...walk(join(ROOT, 'scripts')), ...walk(join(ROOT, 'fixtures'))]) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/(?:slug|SLUG|name)["']?\s*[:=]\s*["'`]?([a-z][a-z0-9-]{2,38})["'`]?/g)) slugs.add(m[1])
  for (const m of text.matchAll(/DEMO_SLUG:-([a-z][a-z0-9-]{2,38})/g)) slugs.add(m[1])
}
const reservedUsed = [...slugs].filter((s) => seen.has(s))
console.log(`[M4b] ${slugs.size} slug-shaped names in src/, scripts/ and fixtures/; reserved among them: ${reservedUsed.length === 0 ? 'none' : reservedUsed.join(', ')}`)

// [M4c] the proof app's manifest, renamed with its comments kept
const original = readFileSync(join(ROOT, 'fixtures/proof-app/manifest.yaml'), 'utf8')
const doc = parseDocument(original)
doc.set('name', 'journey-app')
const renamed = String(doc)
const comments = (t) => t.split('\n').filter((l) => l.trim().startsWith('#')).length
const changed = original.split('\n').filter((l, i) => l !== renamed.split('\n')[i]).length
console.log(`[M4c] comments ${comments(original)} → ${comments(renamed)}; lines changed: ${changed}; name now: ${parse(renamed).name}`)
```

```bash
node docs/superpowers/spikes/p5a-baseline/m4-reserved-labels.mjs 2>&1 | tee -a "$OUT"
```

**Expected:** `[M4a] 755 labels in 6 groups`, `problems: none`; `[M4b] idp.manifest.internal → manifest`; the reserved-among-them list — **anything it names is a test or demo Task 9 will break**, and each one is written at the top of Task 9 with its file; `[M4c]` the same comment count before and after, and `lines changed: 1`. A regex over source over-collects (it catches `name: 'db'`-shaped strings too); a name it flags that is not a project slug is noted and ignored, not "fixed".

- [ ] **Step 10: Write and run M5, what Node sends as `Origin`**

`docs/superpowers/spikes/p5a-baseline/m5-node-origin.mjs`:

```js
// M5 (P5a Task 1): does Node 24's fetch or WebSocket send an Origin header by itself,
// and does it send one it is given? Decision 15's CSRF check refuses a cookie-bearing
// mutation without one, so the client must set it — and must be ABLE to.
import http from 'node:http'

const server = http.createServer((req, res) => res.end(JSON.stringify({ origin: req.headers.origin ?? null })))
server.on('upgrade', (req, socket) => {
  console.log(`[M5] WebSocket upgrade origin: ${req.headers.origin ?? null}, cookie: ${req.headers.cookie ? 'present' : 'absent'}`)
  socket.destroy()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
console.log('[M5] fetch POST, no headers:', await (await fetch(base, { method: 'POST', body: '{}' })).text())
console.log('[M5] fetch POST, origin given:', await (await fetch(base, { method: 'POST', body: '{}', headers: { origin: 'https://console.manifest.internal' } })).text())
await new Promise((resolve) => { const ws = new WebSocket(`${base.replace('http', 'ws')}/a`); ws.onerror = resolve })
await new Promise((resolve) => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/b`, { headers: { origin: 'https://console.manifest.internal', cookie: 'manifest_session=x' } })
  ws.onerror = resolve
})
server.close()
```

```bash
node docs/superpowers/spikes/p5a-baseline/m5-node-origin.mjs 2>&1 | tee -a "$OUT"
```

**Expected** (measured once already while this plan was written, on Node 24.12.0): `{"origin":null}`, then the given origin; the first upgrade with no origin, the second with it and a cookie.

- [ ] **Step 11: Write the index, check the machine, and write down what changed**

`docs/superpowers/spikes/p5a-baseline/README.md` — one paragraph per measurement: what it asks, the command, the result file's section, and **which task's design it confirmed or changed**. Then:

```bash
cd /Users/rich/Developer/manifest
curl -sS https://p5a-probe.manifest.internal/ ; echo     # the wildcard: no probe route left
curl -sS -m 3 http://127.0.0.1:7100/ || echo "7100 free"
make verify | tail -3                                    # expect 47 / 0
./scripts/snapshot-machine.sh > /tmp/p5a-s1-after.txt
diff /tmp/p5a-s1-before.txt /tmp/p5a-s1-after.txt
```

The only expected differences are timestamps and container uptimes — M3's boot runs `recoverAtBoot`, which re-applies the proof app's route (harmless: it was already there). A container, a network or a volume the diff shows as new is this task's to remove, by name.

For **every** result that disagrees with the *Expected* column of Steps 3, 5, 7, 9 or 10, write a dated **Task 1 correction** at the top of the task it changes, in this form, and move a task boundary only if a correction makes a task too large for its sitting:

```markdown
> **Task 1 correction (YYYY-MM-DD, [M2a]).** The host reached the edge from `…`, not `10.89.0.1`. Every `10.89.0.1/32` in this task is `…/32`, and `HOST_SOURCE_IP` in `infra/lib/common.sh` is `…`.
```

- [ ] **Step 12: Record and commit**

Add *Sitting 1 — Task 1* to *What executing this plan found*: each measurement's result, every correction and where it was written, the machine diff. Then:

```bash
git add docs/superpowers/spikes/p5a-baseline docs/superpowers/plans/2026-09-16-p5a-the-contract.md
git commit -m "docs(spikes): P5a Task 1 — the edge's source refusal, a sign-in and a stream through a new origin, zod/v4 on a real route"
```

---
## Task 2: Every resource route under `/v1`

> **EXECUTED 2026-09-16 (sitting 2), `fad5e31`.** Two things below are wrong as written and were corrected in the code: **Step 6's `sed` breaks every path that was NOT quoted** — `api POST /projects "{…}"` becomes `api POST "/v1/projects "{…}"`, which leaves `scripts/demo.sh` a bash syntax error while the step's own `grep` prints nothing — and **`scripts/doctor.sh` asks `/auth/me` to recognise the running control plane**, which this task's file list omits. Sitting 2's entry in *What executing this plan found* has both, with the rest.

**Why before the edge.** Two moves change every client's URLs — the path prefix and the origin — and each one breaks every script, README line and test that spells a path. Doing the path first, on the loopback origin every script already uses, means a red demo after this task is a path defect and a red demo after Task 3 is an origin defect, never both at once.

**Files:**
- Create: `scripts/lib/api.sh`
- Create: `packages/control-plane/src/api/unversioned.ts`
- Create: `packages/control-plane/src/api/versioning.test.ts`
- Modify: `packages/control-plane/src/api/server.ts` (the not-found envelope)
- Modify: `packages/control-plane/src/api/routes/auth.ts` (`/auth/me` → `/v1/me`; the callback lands on `/v1/me`)
- Modify: `packages/control-plane/src/api/routes/projects.ts`, `routes/delivery.ts`, `routes/events.ts` (paths)
- Modify: `packages/control-plane/src/api/authz-contract.ts` (every `url` and `request().url`)
- Modify: `packages/control-plane/src/api/{auth,delivery,events,projects}.test.ts`, `src/lifecycle.test.ts`, `src/boot.docker.test.ts`, `src/identity/saml.docker.test.ts`, `src/runtime/docker/s6.docker.test.ts`
- Modify: `scripts/demo.sh`, `scripts/lib/proof-app.sh`, `scripts/demo-identity.sh`, `scripts/demo-ai.sh`, `scripts/demo-redeploy.sh`, `scripts/lib/event-stream.mjs`, `scripts/offline-acceptance.sh`
- Modify: `README.md` (*Running the control plane*), `docs/superpowers/RUNBOOK.md`, `docs/superpowers/WALKTHROUGH.md`

**Interfaces:**
- Produces: `UNVERSIONED` in `api/unversioned.ts` — `readonly { method: 'GET' | 'POST'; path: string; why: string }[]`, the five routes D23.8 keeps outside `/v1`. Task 6 writes it into the document.
- Produces: `404 ROUTE_NOT_FOUND` for any unmatched path, in the D23.7 envelope.
- Produces: `scripts/lib/api.sh` — `key`, `api <METHOD> <path> [json]`, `field <dot.path>`, `json <string>`, `environment <kind>`; the caller sets `CP_JAR` (and `PROJECT_ID` for `environment`); `API` defaults to `${MANIFEST_API:-http://127.0.0.1:7100}` and **every path passed to `api` is spelled as the contract spells it, `/v1` included**.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/api/unversioned.ts`:

```ts
/**
 * D23.8: every resource route and the event stream are served under `/v1/`. These are
 * the endpoints that are NOT resources, and the contract says so rather than omitting
 * them silently (Task 6 writes this list into the OpenAPI document).
 *
 * Adding a route outside `/v1` means adding it here WITH ITS REASON — which is the
 * review `versioning.test.ts` forces.
 */
export const UNVERSIONED = [
  {
    method: 'GET',
    path: '/auth/login',
    why: "Browser-mediated sign-in. Its URL is part of the flow the Manifest IdP completes (§9), not a resource.",
  },
  {
    method: 'POST',
    path: '/auth/saml/callback',
    why: "The ACS. Its URL is registered with the IdP in the platform's SP row (§9), so a prefix change would be an IdP registration change.",
  },
  {
    method: 'POST',
    path: '/auth/logout',
    why: "The SLO URL registered beside the ACS (§9). Ends the browser's session; not a resource.",
  },
  {
    method: 'GET',
    path: '/internal/registry/token',
    why: 'The registry token realm (§13). Its callers are the Docker daemon and BuildKit speaking the distribution token protocol, never a Manifest client.',
  },
  {
    method: 'POST',
    path: '/internal/registry/token',
    why: 'The registry token realm, OAuth2 form grant. Same callers, same reason.',
  },
] as const satisfies readonly { method: 'GET' | 'POST'; path: string; why: string }[]
```

`packages/control-plane/src/api/versioning.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildServer } from './server.js'
import { testDeps } from './testing.js'
import { UNVERSIONED } from './unversioned.js'

describe('the /v1 prefix (D23.8)', () => {
  it('serves every route under /v1/ except the five it names, and those five exactly', async () => {
    const app = await buildServer(await testDeps())
    const outside = app.registeredRoutes
      .filter((route) => !route.url.startsWith('/v1/'))
      .map((route) => `${route.method} ${route.url}`)
      .sort()
    expect(outside).toEqual(UNVERSIONED.map((u) => `${u.method} ${u.path}`).sort())
    await app.close()
  })

  it('answers an old, unversioned path with the envelope, and the hint names /v1', async () => {
    const app = await buildServer(await testDeps())
    const res = await app.inject({ method: 'GET', url: '/projects' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } })
    expect(res.json().error.hint).toContain('/v1/')
    await app.close()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/versioning.test.ts
```

Expected: FAIL — the first test lists `GET /projects`, `POST /projects`, `GET /auth/me` and every other resource route as outside `/v1`; the second receives Fastify's default `{"message":"Route GET:/projects not found",…}`.

- [ ] **Step 3: Move the routes**

In `api/routes/auth.ts`, `app.get('/auth/me', …)` becomes `app.get('/v1/me', …)`, and the callback's `reply.redirect('/auth/me', 302)` becomes `reply.redirect('/v1/me', 302)` (Task 4 replaces that line with the return path). In `api/routes/projects.ts`, `api/routes/delivery.ts` and `api/routes/events.ts`, every path literal gains `/v1`:

```bash
cd /Users/rich/Developer/manifest/packages/control-plane
sed -i '' -E "s#(app\.(get|post)\(|url: )'/(projects|builds|environments)#\1'/v1/\3#g" \
  src/api/routes/projects.ts src/api/routes/delivery.ts src/api/routes/events.ts
grep -nE "'/(v1/)?(projects|builds|environments|auth)" src/api/routes/*.ts
```

Every line the `grep` prints must start `'/v1/` except `/auth/login`, `/auth/saml/callback`, `/auth/logout` and `/internal/registry/token`. The event route's 426 hint names the path — change `ws(s)://<host>/projects/<projectId>/events` to `wss://<host>/v1/projects/<projectId>/events` by hand.

In `api/server.ts`, directly after `app.setErrorHandler(…)`:

```ts
  /**
   * D23.7 for a path that matched nothing, too. Fastify's default answers
   * `{"message":"Route GET:/projects not found","error":"Not Found","statusCode":404}`,
   * which is a shape no client switches on — and after the `/v1` move (P5a Task 2) an
   * old path is exactly what a stale script or a stale bookmark will send. The path is
   * echoed without its query string and capped: it is the caller's own input.
   */
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `no route ${request.method} ${request.url.split('?')[0]!.slice(0, 200)}`,
        hint:
          'Every resource route is under /v1/ (D23.8). Signing in is /auth/login; ' +
          'the document at packages/contract/openapi.json lists every route.',
      },
    }),
  )
```

`app.setNotFoundHandler` runs the root hooks too (ORIENTATION §4); the idempotency `preHandler` already returns early on `request.routeOptions.url === undefined`, so an unmatched `POST` still answers 404, not 400.

- [ ] **Step 4: Move every test's paths**

```bash
cd /Users/rich/Developer/manifest/packages/control-plane
FILES="src/api/authz-contract.ts src/api/auth.test.ts src/api/delivery.test.ts src/api/events.test.ts \
  src/api/projects.test.ts src/lifecycle.test.ts src/boot.docker.test.ts \
  src/identity/saml.docker.test.ts src/runtime/docker/s6.docker.test.ts"
sed -i '' -E "s#(['\`\"])/(projects|builds|environments)([/'\`\"?])#\1/v1/\2\3#g; s#(['\`\"])/auth/me(['\`\"])#\1/v1/me\2#g" $FILES
grep -nE "[^1]/(projects|builds|environments)[/:'\`?]|/auth/me" $FILES
```

zsh does not word-split `$FILES` (ORIENTATION §4) — run the three lines under `bash -c '…'`, or list the files inline. **Every line the final `grep` prints is either a comment, which stays, or a URL built from a base** — `${base}/projects/…` in `events.test.ts`, `${ORIGIN}/auth/me` in `saml.docker.test.ts`, `http://host.docker.internal:7100/auth/me` in `s6.docker.test.ts` — **which is changed by hand**. In `auth.test.ts` and `saml.docker.test.ts`, the assertion `expect(res.headers.location).toBe('/auth/me')` becomes `'/v1/me'`. In `authz-contract.ts`, the `GET /auth/me` row's `url` becomes `/v1/me` — the completeness check compares with `app.registeredRoutes`, so a row left behind is a red test naming it.

- [ ] **Step 5: Run the unit tier and watch it pass**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/versioning.test.ts
pnpm test && pnpm test
```

Expected: `versioning.test.ts` 2 passed; the whole unit tier green twice, at the count §2's box states plus 2.

- [ ] **Step 6: One API helper for every script**

`scripts/lib/api.sh`:

```bash
# shellcheck shell=bash
# THE control-plane client every demo script speaks through. Sourced, never executed.
#
# ONE copy. There were two — `scripts/demo.sh` and `scripts/lib/proof-app.sh` each
# defined key/api/field/environment — so every change to the API's paths, its origin or
# its headers had to be made twice, and the two would drift into proving different
# things (P5a Task 2). The generated client is the contract's client; this is the
# demos', and it is deliberately `curl` (P5a Decision 37).
#
# The caller sets, before calling anything:
#   CP_JAR      the Manifest session's cookie jar
#   PROJECT_ID  for `environment` only
# jq is not guaranteed on a UBC developer's Mac and C1 forbids a new prerequisite, so
# JSON is read with node, which the toolchain already requires.

API="${MANIFEST_API:-http://127.0.0.1:7100}"

key() { uuidgen | tr 'A-Z' 'a-z'; }

# A control-plane call as the person whose session is in $CP_JAR. $2 is the path AS THE
# CONTRACT SPELLS IT — `/v1/projects`, never `/projects` — so a script can be grepped
# against packages/contract/openapi.json. Every mutation carries a fresh
# Idempotency-Key (D23.6): replaying one returns the FIRST response.
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -b "$CP_JAR" -c "$CP_JAR" -X "$method" -H 'content-type: application/json')
  if [ "$method" != GET ]; then args+=(-H "idempotency-key: $(key)"); fi
  if [ -n "$body" ]; then args+=(-d "$body"); fi
  curl "${args[@]}" "$API$path"
}

field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a?.[k],j);if(v===undefined){console.error(s);process.exit(1)}console.log(typeof v==="object"?JSON.stringify(v):v)})' "$1"; }

json() { node -e 'console.log(JSON.stringify(process.argv[1]))' "$1"; }

environment() {
  api GET "/v1/projects/$PROJECT_ID?expand=environments" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const e=(j.environments??[]).find(x=>x.kind===process.argv[1]);if(!e){console.error(s);process.exit(1)}console.log(e.id)})' "$1"
}
```

In `scripts/lib/proof-app.sh`, delete its own `key`, `api`, `field`, `json` and `environment`, and source the helper at the top (after the header comment):

```bash
# shellcheck source=./api.sh
. "$ROOT/scripts/lib/api.sh"
```

In `scripts/demo.sh`, delete its `key`, `api`, `field` and `environment`, delete `API="${MANIFEST_API:-http://127.0.0.1:7100}"`, set `CP_JAR="$JAR"` where `JAR` is created, and source `scripts/lib/api.sh` after `infra/lib/idp-login.sh`. In `demo-identity.sh`, `demo-ai.sh` and `demo-redeploy.sh`, delete the `API=` line (the helper sets it). Then every path:

```bash
cd /Users/rich/Developer/manifest
sed -i '' -E 's#api (GET|POST) "?/(projects|builds|environments)#api \1 "/v1/\2#g; s#api GET /auth/me#api GET /v1/me#g' \
  scripts/demo.sh scripts/demo-identity.sh scripts/demo-ai.sh scripts/demo-redeploy.sh scripts/lib/proof-app.sh
grep -nE 'api (GET|POST)' scripts/*.sh scripts/lib/*.sh | grep -v '/v1/'
```

The last `grep` must print nothing. Three more places spell a path outside `api`: `curl -sS -m 5 -o /dev/null "$API/auth/me"` in each demo's step 0 becomes `"$API/v1/me"`; `scripts/lib/event-stream.mjs`'s `${api.replace(/^http/, 'ws')}/projects/${projectId}/events` becomes `…/v1/projects/…`; and `scripts/offline-acceptance.sh`'s two `http://127.0.0.1:7100/auth/me` probes become `/v1/me`.

- [ ] **Step 7: Move the documented commands**

```bash
cd /Users/rich/Developer/manifest
grep -nE "7100/(projects|builds|environments|auth/me)|curl[^\n]*/(projects|builds|environments)\b|/auth/me" \
  README.md docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md
```

Change each hit that is a command a reader runs to its `/v1` path (`/auth/me` → `/v1/me`). A hit inside a dated record — a sentence saying what a sitting measured — is history and stays.

- [ ] **Step 8: Prove it against the running platform**

```bash
cd /Users/rich/Developer/manifest
pnpm --filter @manifest/control-plane build
# README's exports, then:
node packages/control-plane/dist/index.js > /tmp/p5a-t2-cp.log 2>&1 &
make demo
MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/boot.docker.test.ts src/identity/saml.docker.test.ts
```

Expected: `make demo` green end to end (it signs in, creates or reuses `fixture-app`, builds, deploys, and sees production refused) — through `/v1` paths; both Docker files green. **Restart the control plane after the Docker files** (Global Constraints). `s6.docker.test.ts` changed only a denied probe's path; it runs in full at the end of Task 3.

- [ ] **Step 9: Gates and commit**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
git add -A packages/control-plane/src scripts README.md docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md
git commit -m "feat(api): every resource route under /v1, and an envelope for a path that matched nothing"
```

- [ ] **Step 10: Negative controls — after the commit**

| | Break | Expect red | Then |
|---|---|---|---|
| a | `app.get('/v1/me'` back to `app.get('/auth/me'` in `routes/auth.ts` | `versioning.test.ts` *serves every route under /v1/* — lists `GET /auth/me`; the authz suite's completeness check lists it too | `git checkout packages/control-plane/src/api/routes/auth.ts` |
| b | delete the `app.setNotFoundHandler(…)` call | `versioning.test.ts` *answers an old, unversioned path* — `code` undefined | `git checkout packages/control-plane/src/api/server.ts` |
| c | in `scripts/lib/api.sh`, nothing; in `scripts/demo.sh`, one path back to `api GET /projects` | `make demo` stops at that step with a `ROUTE_NOT_FOUND` body | `git checkout scripts/demo.sh` |

`git status` clean after each.

---

## Task 3: The API is served through the edge, at `https://console.manifest.internal`, and refused to app networks

> **EXECUTED 2026-09-16 (sitting 2), `8520e0a`, with `92b4ebb` and `1c83bd3` after it.** What runs differs from the text below in five places, each measured: **probe 15 sits before probe 11**, not after 14 (probe 11 leaves the app's pids spent); **its host control passes the CA to `https.get`** instead of calling `fetch`; **the console's `reverse_proxy` sets `stream_close_delay 1h`** (an edge reload closes proxied WebSockets with `1001`); **`infra/lib/ensure-caddy-config.sh` re-binds the edge when it cannot see the Caddyfile** (a replacing save strands a single-file mount); and **the demos' event-stream watcher runs under `NODE_EXTRA_CA_CERTS`**. `config.test.ts` and `scripts/offline-acceptance.sh`'s step 5 changed too. Sitting 2's entry has the measurements.

> **Task 1 correction (2026-09-16, `[M2a]`–`[M2g]`).** **M2 matched every row of its table**, so `10.89.0.1/32`, `HOST_SOURCE_IP`, the Caddyfile block and probe 15 below stand as written: the host was forwarded (`held 1 [200]`); a `manifest-platform` container and the proof app were both refused with the body; with the refusal removed the proof app was forwarded (`held 1 [200]`), so the matcher is what refused it; a 100 s request completed; and `caddy adapt` turned the block into a `subroute` whose first route matches `not remote_ip 10.89.0.1/32` and whose last is the placeholder's `static_response`.
>
> **One path M2 did not try was measured and is ADDED to probe 15** (`[M2g]`, `spikes/p5a-baseline/m2g-egress-proxy.sh`). An app's forced egress proxy sits on `manifest-platform` as well as the app network (`mf-proof-app-staging-egress` = `10.89.0.8`), so a `CONNECT` through it would reach the edge from a platform address. Today tinyproxy's deny-by-default filter refuses it: `CONNECT` to `p5a-probe.manifest.internal:443`, `manifest-caddy:443`, `10.89.0.10:443` and `host.docker.internal:7100` were all `403 Filtered`, with and without the edge's refusal, while the allowlisted `manifest-idp:80` opened (`200 Connection established`). **But nothing refuses `egress.allow: [console.manifest.internal]`** — `renderAllowlist` accepts any bare hostname — and for that app the proxy would open the tunnel, leaving the edge's allow-list as the only control. M2b already shows that control holds for any platform-network source but the gateway. So, in probe 15, after `expect(fromApp.trim()).toBe(...)`:
>
> ```ts
>       // The app's own egress proxy (P5a Task 1, [M2g]) is the other way off an app
>       // network. Its deny-by-default filter refuses the console's name; the allowlisted
>       // IdP is the positive control, so a proxy that refuses EVERYTHING cannot pass.
>       const connect = async (target: string) =>
>         (
>           await inApp(
>             `node -e 'const h=require("node:http");const p=new URL(process.env.HTTPS_PROXY);const q=h.request({host:p.hostname,port:p.port,method:"CONNECT",path:"${target}"});q.on("connect",(r,s)=>{console.log(r.statusCode);s.destroy()});q.on("error",e=>console.log("error "+e.code));q.end()'`,
>           )
>         ).trim()
>       expect(await connect('console.manifest.internal:443')).toBe('403')
>       expect(await connect('manifest-idp:80')).toBe('200')
> ```
>
> *What this plan does not build* already names the rest (added in sitting 1): **`egress.allow` does not refuse a platform hostname**, so for an app that declares one the edge's source allow-list is the control (Decision 12, measured by `[M2b]`). **Raised as a spec action and accepted in substance by Rich, 2026-09-16 (see *Spec actions*, raised while executing): refuse a platform surface in `egress.allow`, in a hardening slice of its own, not P5a.** The proxy tunnels raw TCP to any name it resolves on `manifest-platform` (`[M2g]`), so the same gap reaches `manifest-postgres`, not only the edge.

**Why this is one task.** The origin, the edge site and the refusal are one fact from three sides: moving the origin without the site breaks every sign-in, and adding the site without the refusal ships the hole §12 describes. S6's probe proves the refusal from inside a real app, paired with the host.

**Files:**
- Modify: `infra/caddy/Caddyfile` (the `console.manifest.internal` site)
- Modify: `infra/lib/common.sh` (`CONSOLE_HOST`, `HOST_SOURCE_IP`)
- Modify: `scripts/verify.sh` (edge probes → `edge.$ZONE`; three new checks)
- Modify: `scripts/doctor.sh` (line 267's probe → `edge.manifest.internal`)
- Modify: `packages/control-plane/src/config.ts` (`MANIFEST_CONTROL_PLANE_ORIGIN` default and its doc)
- Modify: `packages/control-plane/src/api/routes/auth.ts` (`Secure` from the origin)
- Modify: `packages/control-plane/src/api/testing.ts` (the SP entity's origin from config)
- Modify: `packages/control-plane/src/api/auth.test.ts` (`ACS`, and the cookie's `Secure`)
- Modify: `packages/control-plane/src/sso/platform.ts` (doc only: the control plane is behind the edge now)
- Modify: `packages/control-plane/src/index.ts` (the boot line names the origin)
- Modify: `packages/control-plane/src/runtime/docker/s6.docker.test.ts` (probe 15)
- Modify: `scripts/lib/api.sh` (`ORIGIN`), `scripts/demo.sh`, `scripts/demo-identity.sh`, `scripts/demo-ai.sh`, `scripts/demo-redeploy.sh`, `scripts/offline-acceptance.sh`
- Modify: `README.md`, `docs/superpowers/RUNBOOK.md`, `docs/superpowers/WALKTHROUGH.md`, `docs/superpowers/ORIENTATION.md` §4

**Interfaces:**
- Produces: `https://console.manifest.internal/v1/*` and `/auth/*` → the control plane on `127.0.0.1:7100`; any other path → `200 manifest console: not built yet — …`; any source but `10.89.0.1` → `403 manifest: the control plane is not reachable from this network`.
- Produces: `ORIGIN` in `scripts/lib/api.sh` (`${MANIFEST_ORIGIN:-https://console.manifest.internal}`), and `API="$ORIGIN"`.
- Produces: `config.sp.origin` defaulting to `https://console.manifest.internal`.
- Consumes: Task 2's `/v1` paths and `scripts/lib/api.sh`; Task 1's M2 and M3 results (and any *Task 1 correction* above this line).

- [ ] **Step 1: Write the failing checks first**

In `infra/lib/common.sh`, after `IDP_HOST=…`:

```bash
# §21 (P5a Task 3): the reference console and the API share ONE origin, through the edge.
CONSOLE_HOST="console.${ZONE}"
# The one source that origin accepts: the platform network's GATEWAY, which is where the
# host's requests reach the edge from (measured 2026-09-16, P5a Task 1 M2). App networks
# are subnets Docker chooses, so the site allows this address rather than refusing theirs.
# `make verify` holds it equal to the network's real gateway and to the Caddyfile.
HOST_SOURCE_IP="10.89.0.1"
```

In `scripts/verify.sh`, **move the edge probes** — `edge.$ZONE` is a reserved label (§23, *environments and infrastructure*) that no Caddyfile site names, so the wildcard answers it on every machine for ever:

```bash
cd /Users/rich/Developer/manifest
sed -n '95,106p;736,764p' scripts/verify.sh     # read them first
sed -i '' -e '95,106s#https://console\.\$ZONE/#https://edge.$ZONE/#g' -e '95,106s#host=console\.\$ZONE#host=edge.$ZONE#g' \
  -e '736,764s#https://console\.\$ZONE/#https://edge.$ZONE/#g' -e '736,764s#host=console\.\$ZONE#host=edge.$ZONE#g' scripts/verify.sh
grep -n 'console\.\$ZONE' scripts/verify.sh
```

The remaining `console.$ZONE` hits must be only the three DNS checks (lines ~23, ~33, ~49), which resolve the name and are unaffected. Then, after the `parity` check, add:

```bash
# §21 and §12 (P5a Task 3): the console's origin forwards to the control plane, and
# refuses every source but the host. Three checks, because each alone can pass for the
# wrong reason: a site that refuses EVERYONE passes the second, a site that refuses NO
# ONE passes the first, and a Caddyfile allowing a stale address passes both until the
# platform network's subnet moves.
console_serves_host() {
  local out
  out=$(curl -sS -w ' [%{http_code}]' "https://$CONSOLE_HOST/" 2>&1)
  echo "$out"
  case "$out" in "manifest console: not built yet"*"[200]") return 0 ;; *) return 1 ;; esac
}
check "the host reaches https://$CONSOLE_HOST and is not refused" console_serves_host

console_refuses_platform_container() {
  require_ca || return 1
  local out
  out=$(docker run --rm --network "$NET" --dns "$DNS_C_IP" \
        -v "$PWD/$CA_FILE":/ca.crt:ro curlimages/curl:8.11.1 \
        --cacert /ca.crt -sS -w ' [%{http_code}]' "https://$CONSOLE_HOST/v1/me" 2>&1)
  echo "$out"
  [ "$out" = "manifest: the control plane is not reachable from this network [403]" ]
}
check "a container on $NET is refused by https://$CONSOLE_HOST (§12)" console_refuses_platform_container

console_allows_only_the_gateway() {
  local gw allowed
  gw=$(docker network inspect "$NET" --format '{{(index .IPAM.Config 0).Gateway}}')
  allowed=$(sed -n 's/.*not remote_ip \([0-9.]*\)\/32.*/\1/p' infra/caddy/Caddyfile | head -1)
  echo "platform gateway=$gw Caddyfile allows=$allowed common.sh HOST_SOURCE_IP=$HOST_SOURCE_IP"
  [ -n "$gw" ] && [ "$gw" = "$allowed" ] && [ "$gw" = "$HOST_SOURCE_IP" ]
}
check "the console's one allowed source is the platform network's gateway" console_allows_only_the_gateway
```

In `scripts/doctor.sh` line 267, `https://console.manifest.internal/` becomes `https://edge.manifest.internal/` — it proves Node trusts the CA, and the console site would answer it too, but a check whose target Task 3 is about to change is a check that moves when it should not.

In `packages/control-plane/src/runtime/docker/s6.docker.test.ts`, after probe 14:

```ts
    /**
     * 15 — §12 and §16 (P5a Task 3): an app cannot reach the control plane THROUGH THE
     * EDGE. The edge is attached to this app's network — that is how traffic reaches the
     * app — and it answers any hostname asked of it by address: inside the app,
     * `console.manifest.internal` does not resolve, and a request to `manifest-caddy`
     * with that name as SNI and Host was answered anyway (brief §3, 2026-09-16).
     *
     * The DENIAL reads the BODY, not a status: the refusal is a 403 whose body nothing
     * else in the platform answers with. `rejectUnauthorized: false` because this probes
     * routing — a TLS failure must not read as a refusal. Node's https ignores the proxy
     * variables the app is given.
     *
     * THE POSITIVE CONTROL is the same path from the host, which the site forwards: the
     * answer is the control plane's 401 envelope when one is running and Caddy's 502
     * when none is — either way NOT the refusal, which is the claim.
     */
    it('15. cannot reach the control plane through the edge, while the host can', async () => {
      const REFUSAL = 'manifest: the control plane is not reachable from this network'
      const fromApp = await inApp(
        `node -e 'const h=require("node:https");h.get({host:"manifest-caddy",port:443,servername:"console.manifest.internal",headers:{host:"console.manifest.internal"},path:"/v1/me",rejectUnauthorized:false},r=>{let b="";r.on("data",d=>b+=d);r.on("end",()=>console.log(r.statusCode+" "+b))}).on("error",e=>console.log("error "+e.code))'`,
      )
      expect(fromApp.trim()).toBe(`403 ${REFUSAL}`)

      const fromHost = await fetch('https://console.manifest.internal/v1/me').then(
        async (r) => `${r.status} ${await r.text()}`,
        (e: Error) => `error ${e.message}`,
      )
      expect(fromHost).not.toContain(REFUSAL)
      expect(fromHost).toMatch(/^(401 \{"error":\{"code":"UNAUTHENTICATED"|502 )/)
      record('15', `app=${fromApp.trim().slice(0, 3)}`, `host=${fromHost.slice(0, 3)}`)
    })
```

The host `fetch` needs the platform CA: the Docker tier's Node trusts it only through `NODE_EXTRA_CA_CERTS`, which `.env` sets and `vitest.env.ts` loads — if the control reports `error … self-signed certificate`, export it from `.env` before the run rather than disabling verification.

- [ ] **Step 2: Watch them fail**

```bash
cd /Users/rich/Developer/manifest
make verify 2>&1 | tail -8
MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/runtime/docker/s6.docker.test.ts -t '15\.'
```

Expected: `make verify` **47 passed, 3 failed** — the host gets the wildcard's `manifest OK host=console…`, the container gets the wildcard too, and the Caddyfile allows nothing; probe 15 FAILS with the app receiving `200 manifest OK host=console.manifest.internal …` — **the hole, measured again**. (`-t` does not work on the S6 suite's sequential `beforeAll`; if the filtered run errors on setup, run the whole file.)

- [ ] **Step 3: Add the site**

In `infra/caddy/Caddyfile`, between the `idp.manifest.internal` block and the wildcard (use M2f's adapted form if Task 1 corrected it):

```caddyfile
# §21 and §12 (Rich, 2026-09-16): the reference console and the API on ONE origin,
# through the edge — refused to every source but the host.
#
# A SITE HERE, NOT A RUNTIME ROUTE: routes added through the admin API are lost when the
# edge restarts (§12). An app's route comes back at the control plane's boot; the API a
# person uses to redeploy that app must not depend on it.
#
# AN ALLOW-LIST OF ONE ADDRESS: the edge is attached to every app network and answers any
# hostname asked of it by address, so name resolution is not a boundary (measured
# 2026-09-16 from inside a deployed app, P5 brief §3). The host's requests arrive from the
# platform network's gateway — 10.89.0.1, measured the same day, on the subnet P1 pins —
# while app networks are subnets Docker chooses. `make verify` asserts this address is the
# gateway, and infra/lib/common.sh's HOST_SOURCE_IP, so a moved subnet fails there first.
#
# INSIDE `route`, deliberately: outside one Caddy sorts `respond` ahead of
# `reverse_proxy`, and the placeholder would answer the API's paths too.
console.manifest.internal {
	tls internal
	request_body {
		max_size 10MB
	}
	# §20's baseline, which the control plane does not set itself.
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		Content-Security-Policy "frame-ancestors 'none'"
	}
	route {
		@outside not remote_ip 10.89.0.1/32
		respond @outside "manifest: the control plane is not reachable from this network" 403
		# The versioned API, the event stream (it upgrades through reverse_proxy — measured
		# in P5a Task 1 M3) and the sign-in endpoints (D23.8).
		@api path /v1/* /auth/*
		reverse_proxy @api host.docker.internal:7100
		# P5c replaces this line with the console itself.
		respond "manifest console: not built yet — P5c serves it here. The API is under /v1/." 200
	}
}
```

Apply it, and put the runtime routes back — `ensure-caddy-config.sh`'s reload drops them:

```bash
cd /Users/rich/Developer/manifest
make up
curl -sS https://console.manifest.internal/ ; echo
make verify 2>&1 | tail -4      # expect 50 checks, 0 failed
```

- [ ] **Step 4: Move the control plane's origin**

In `packages/control-plane/src/config.ts`, the setting and its doc:

```ts
  /**
   * Where the control plane is reached, as a bare origin. Every URL the IdP is told to
   * send a person back to is built from it (§9's D15 rule: the app supplies a path,
   * MANIFEST supplies the origin), and from P5a Task 4 it is the only `Origin` a
   * cookie-authenticated mutation is accepted from.
   *
   * `https://console.manifest.internal` since P5a Task 3 (§21, Rich 2026-09-16): the
   * console and the API share one origin, served through the edge, so the platform's own
   * ACS is an `https://….manifest.internal` URL like every app's. At UBC it becomes the
   * console's production origin — a value change, not a code change.
   *
   * `loadConfig` below still checks a LOOPBACK origin's port against MANIFEST_PORT: the
   * Docker tier boots control planes on 7188 and 7189 at loopback origins, and an origin
   * naming a port nothing listens on produces a login that completes at the IdP and then
   * hangs, which reads as an IdP fault.
   */
  MANIFEST_CONTROL_PLANE_ORIGIN: z
    .string()
    .min(1)
    .default('https://console.manifest.internal'),
```

In `packages/control-plane/src/api/routes/auth.ts`, the session cookie's `secure`:

```ts
          // From the ORIGIN, not from MANIFEST_ENV (P5a Task 3): the console's origin is
          // https in development too, and a cookie without Secure on an https origin is
          // one a network position can read the day anything is served over plain http.
          secure: deps.config.sp.origin.startsWith('https://'),
```

In `packages/control-plane/src/api/testing.ts`, the `samlSp` entity:

```ts
      entity: controlPlaneSpEntity({
        entityBase: 'https://manifest.internal',
        // THE CONFIGURED ORIGIN, not a second statement of it (P5a Task 3): the ACS this
        // SP checks must be the one the running control plane registers.
        origin: config.sp.origin,
      }),
```

In `packages/control-plane/src/api/auth.test.ts`: `const ACS = 'https://console.manifest.internal/auth/saml/callback'`, and in *completes a login*, beside the `httpOnly` assertion:

```ts
    // Secure because the ORIGIN is https (P5a Task 3), in development too.
    expect(cookie?.secure).toBe(true)
```

and a new test beside it:

```ts
  it('sets a session cookie without Secure only on a loopback http origin', async () => {
    const deps = await testDeps()
    const loopback = {
      ...deps,
      config: { ...deps.config, sp: { ...deps.config.sp, origin: 'http://127.0.0.1:7100' } },
    }
    const app = await buildServer(loopback)
    const idp = await testSamlIdp()
    const { requestId } = await pendingLogin(app)
    const res = await post(app, assertion(idp, requestId))
    expect(res.cookies.find((c) => c.name === 'manifest_session')?.secure).toBeFalsy()
    await app.close()
  })
```

(The in-process SP in that `deps` still names the https ACS; the assertion is signed for it, and only the cookie flag is under test.)

In `packages/control-plane/src/sso/platform.ts`, the paragraph that begins *"Why the entity is built here and not by `deriveSpEntity`"* says the control plane is a host process the edge does not route. Replace its second and third sentences with:

```ts
 * for APPS: it joins a Manifest §23 hostname to an app-supplied path. The control plane
 * is not an app — it has no slug, no environment kind and no project row — and since
 * P5a Task 3 its origin is `https://console.manifest.internal`, served through the edge
 * (§21). The Docker tier still boots it at loopback origins, which `deriveSpEntity`
 * would rightly refuse, and loosening the function that makes a free-text ACS URL
 * impossible — §9 calls that an assertion-phishing primitive — for one caller that does
 * not need it would be the wrong trade.
```

In `packages/control-plane/src/index.ts`, the boot line gains `origin: config.sp.origin,` after `port`.

- [ ] **Step 5: Move every script onto the origin**

`scripts/lib/api.sh`, replacing the `API=` line:

```bash
# §21 (P5a Task 3): the console and the API share one origin, through the edge. Every
# resource path is under /v1 and the sign-in endpoints are under /auth, both on this
# origin. The host keychain trusts the platform CA, so curl needs no --cacert here.
ORIGIN="${MANIFEST_ORIGIN:-https://console.manifest.internal}"
API="$ORIGIN"
```

In each of `scripts/demo.sh`, `demo-identity.sh`, `demo-ai.sh` and `demo-redeploy.sh`, step 0's reachability check becomes a check of the **answer**, not of an answer — through the edge, a stopped control plane is a `502`, and the app network's refusal is a `403`:

```bash
say "0. Is the control plane up, through the edge?"
UP="$(curl -sS -m 5 "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}).
README's 'Running the control plane' has the exact commands — and check the boot line
says {\"driver\":\"docker\"} and \"origin\":\"$ORIGIN\"." ;;
esac
```

and every sign-in of **Manifest's own** SP:

```bash
idp_login "$JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
```

```bash
cd /Users/rich/Developer/manifest
grep -nE '\$API/auth/(login|saml)' scripts/*.sh scripts/lib/*.sh    # must print nothing after the edit
```

`scripts/offline-acceptance.sh`'s two probes become `curl -sS -m 5 https://console.manifest.internal/v1/me | grep -q UNAUTHENTICATED`, and their SKIPPED messages say *"no control plane behind https://console.manifest.internal"*.

- [ ] **Step 6: Run everything that crosses the origin**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm test
pnpm --filter @manifest/control-plane build
# README's exports (MANIFEST_CONTROL_PLANE_ORIGIN now defaults to the console's), then:
node packages/control-plane/dist/index.js > /tmp/p5a-t3-cp.log 2>&1 &
grep 'control plane ready' /tmp/p5a-t3-cp.log      # "origin":"https://console.manifest.internal"
make demo && make demo-identity && make demo-ai
make demo-redeploy
pnpm test:docker                                   # the whole tier, probe 15 included
```

Expected: every demo green through `https://console.manifest.internal`; `pnpm test:docker` at §2's count **plus 1**, 0 skipped. **Restart the control plane after the Docker tier** — it re-registers the platform SP at loopback ACSs (*Read this first* 11), and `make demo-identity` run straight afterwards fails at the ACS comparison until you do. Record that in the sitting's findings if it bites; it is expected, not new.

- [ ] **Step 7: The documents that tell a person where the API is**

- `README.md` *Running the control plane*: the control plane listens on `127.0.0.1:7100` and **is reached at `https://console.manifest.internal`** through the edge; the boot line example gains `"origin":"https://console.manifest.internal"`; the browser sign-in is `https://console.manifest.internal/auth/login`; the SP paragraph's ACS is `https://console.manifest.internal/auth/saml/callback`, and the sentence calling it "the one Manifest ACS that is not an `https://….manifest.internal` URL" is deleted; add: *after `make up` applies a Caddyfile change, or after `pnpm test:docker`, restart the control plane.*
- `RUNBOOK.md` and `WALKTHROUGH.md`: every `http://127.0.0.1:7100` a reader types becomes `https://console.manifest.internal`.
- `ORIENTATION.md` §4, a new item under *Things that will cost you a morning*: **`console.manifest.internal` refuses every source but the host — a container on `manifest-platform` gets `403 manifest: the control plane is not reachable from this network` by design**, and `make verify`'s edge probes moved to `edge.manifest.internal`, a reserved label no site names; and **after `pnpm test:docker` a sign-in through the console fails at the ACS comparison until the control plane is restarted**.

- [ ] **Step 8: Gates and commit**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
git add -A infra scripts packages/control-plane/src README.md docs/superpowers
git commit -m "feat(edge): the API at https://console.manifest.internal, refused to every source but the host (§12, §21)"
```

- [ ] **Step 9: Negative controls — after the commit**

| | Break | Expect red | Then |
|---|---|---|---|
| a | delete the `@outside` and `respond @outside` lines from the Caddyfile; `make up` | `make verify` *a container on manifest-platform is refused* (it gets the control plane's 401 or a 502); `s6.docker.test.ts` probe 15 (`expected '401 {…' to be '403 manifest: …'`) | `git checkout infra/caddy/Caddyfile && make up`, restart the control plane |
| b | `10.89.0.1/32` → `10.89.0.0/24` in the Caddyfile; `make up` | `make verify` *refused* **and** *the one allowed source is the platform network's gateway* | as (a) |
| c | boot the control plane with `MANIFEST_CONTROL_PLANE_ORIGIN=http://127.0.0.1:7100` | `make demo` step 1: *"the IdP would post the assertion to 'http://127.0.0.1:7100/auth/saml/callback' but this Service Provider answers at 'https://console.manifest.internal/auth/saml/callback'"* — D15's check in `idp_login` | restart with the default |
| d | `secure: deps.config.sp.origin.startsWith('https://')` → `secure: deps.config.env !== 'development'` | `auth.test.ts` *completes a login* (`expected false to be true`) | `git checkout packages/control-plane/src/api/routes/auth.ts` |

---
## Task 4: CSRF by `Origin`, a sign-in bound to the browser that started it, and a safe return path

> **EXECUTED 2026-09-16 (sitting 3), `b59ef28`, with `998557e` after it.** What runs differs from the text below in these places, each measured: **the preHandler's check sits after the unmatched-route guard and BEFORE the idempotency opt-out** — "before the idempotency check" placed after that opt-out's `return` silently exempts `/auth/logout` (control (k)); **`sameNonce` refuses two empty nonces**, which the code below accepts; **`events.test.ts` has no `upgradeStatus`** — its `connect` takes an origin (the console's by default, which every existing stream test also needed) and `outcomeOf` reports an accepted upgrade as `opened`; **four SAML refusal tests now name their code**, and `identity/saml.docker.test.ts`'s *refuses an unsigned assertion* carries a real binding, or both would pass refused by the binding instead; Step 6's `grep` misses `projects.test.ts`'s *no Idempotency-Key* test, which sends no key by design; and **Step 9 also changes `WALKTHROUGH.md`** (a sign-in lands on `/`; it signs in with `?returnTo=/v1/me`) and RUNBOOK's stream paragraph. Sitting 3's entry has the measurements.

**Why now.** Task 3 put the API on an origin that is *same-site* with every deployed app (Decision 15): `x.staging.manifest.internal` and `console.manifest.internal` share a registrable domain locally, and `*.manifest.apps.ltic.ubc.ca` apps share one with the console at UBC. `SameSite=Lax` therefore sends the session cookie on a form POST from untrusted app code, and on a WebSocket an app's page opens. Today a cross-site POST is refused only because the idempotency hook demands a header a form cannot send (brief §2.1), and the two routes exempt from that hook are the ones a browser uses first.

> **Read Task 1's `[M3d]` before starting.** If the real IdP did not echo `RelayState`, the correction at the top of this task replaces Step 4's nonce-in-`RelayState` with the AuthnRequest ID held in the login cookie.
>
> **Task 1 result (2026-09-16, `[M3a]`–`[M3d]`): no correction — the nonce stays in `RelayState`.** A signed AuthnRequest carrying `RelayState=p5a-m3-relaystate-probe` came back in the IdP's auto-submitting form as exactly that value (SimpleSAMLphp v2.5.3.1). Through a probe origin behind the edge, a real CWL sign-in completed — the IdP's form posted to `https://p5a-probe.manifest.internal/auth/saml/callback`, which `idp_login` checks — `manifest_session` came back `HttpOnly` and, in development, not `Secure`; `/auth/me` answered `ins000001`; and a WebSocket upgraded through the edge delivered 25 frames including the ready frame. **Decision 16's own sentence was wrong and is corrected in place**: it said the return path rides in `RelayState`, which this task's code rightly does not do (80-byte cap).

**Files:**
- Create: `packages/control-plane/src/api/csrf.ts`
- Create: `packages/control-plane/src/api/csrf.test.ts`
- Create: `packages/control-plane/src/identity/login-state.ts`
- Create: `packages/control-plane/src/identity/login-state.test.ts`
- Modify: `packages/control-plane/src/identity/saml.ts` (`loginUrl(relayState)`), `identity/index.ts`
- Modify: `packages/control-plane/src/api/server.ts` (the `preHandler`; `FastifyContextConfig.csrf`)
- Modify: `packages/control-plane/src/api/errors.ts` (`CsrfRefusedError` → 403)
- Modify: `packages/control-plane/src/api/routes/auth.ts` (login cookie, `RelayState`, return path; the callback's binding check)
- Modify: `packages/control-plane/src/api/routes/events.ts` (the upgrade's origin, read twice)
- Modify: `packages/control-plane/src/api/testing.ts` (`mutationHeaders`)
- Modify: every unit test that sends a mutation with a session — `api/{auth,delivery,events,projects}.test.ts`, `api/authz-contract.ts`, `lifecycle.test.ts` — and `identity/saml.docker.test.ts`
- Modify: `infra/lib/idp-login.sh` (post `RelayState` back)
- Modify: `scripts/lib/api.sh` (`Origin` on every mutation), `scripts/lib/event-stream.mjs` (`origin` on the upgrade)
- Modify: `README.md`, `docs/superpowers/RUNBOOK.md` (every documented `curl -X POST` gains `-H "origin: https://console.manifest.internal"`)

**Interfaces:**
- Produces: `CsrfRefusedError` (`code = 'CSRF_ORIGIN_REFUSED'`), `assertSameOrigin(request: FastifyRequest, origin: string): void`, `carriesSession(request: FastifyRequest): boolean` — `api/csrf.ts`.
- Produces: `LOGIN_COOKIE = 'manifest_login'`, `LOGIN_TTL_SECONDS = 600`, `safeReturnTo(value: unknown): string`, `newLoginNonce(): string`, `encodeLoginCookie(nonce: string, returnTo: string): string`, `readLoginCookie(value: string | undefined): { nonce: string; returnTo: string } | undefined`, `sameNonce(a: string, b: string): boolean` — `identity/login-state.ts`, exported from `identity/index.ts`.
- Produces: `SamlSp.loginUrl(relayState: string): Promise<string>`; `SamlError('SAML_LOGIN_NOT_BOUND', …)`.
- Produces: `mutationHeaders(deps: ServerDeps): { 'idempotency-key': string; origin: string }` — `api/testing.ts`.
- Produces: `GET /auth/login?returnTo=<path>`; the callback accepts `RelayState` and redirects to the return path, `/` by default.
- Consumes: `config.sp.origin` (Task 3).

- [ ] **Step 1: Write the failing CSRF tests**

`packages/control-plane/src/api/csrf.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from '../db/testing.js'
import { buildServer } from './server.js'
import { loginAs, testDeps } from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

/**
 * §20's "CSRF protection on every state-changing route", as an Origin check (P5a
 * Decision 15). The sibling origin is not hypothetical: a deployed app at
 * `<slug>.staging.manifest.internal` is SAME-SITE with the console, so a SameSite=Lax
 * session cookie rides along on a form it submits.
 */
const APP_ORIGIN = 'https://proof-app.staging.manifest.internal'

async function server() {
  const deps = await testDeps()
  const app = await buildServer(deps)
  const cookies = await loginAs(deps, 'bio_prof')
  const create = (headers: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: { slug: `csrf-${randomUUID().slice(0, 6)}`, blueprint: 'fixture-node@1' },
      cookies,
      headers: { 'idempotency-key': randomUUID(), ...headers },
    })
  return { deps, app, cookies, create }
}

describe('CSRF by Origin (§20, P5a Task 4)', () => {
  it('accepts a mutation carrying a session from the console’s own origin', async () => {
    const { deps, app, create } = await server()
    expect((await create({ origin: deps.config.sp.origin })).statusCode).toBe(201)
    await app.close()
  })

  it('refuses the same mutation from a sibling app’s origin, and changes nothing', async () => {
    const { app, cookies, create } = await server()
    const res = await create({ origin: APP_ORIGIN })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: { code: 'CSRF_ORIGIN_REFUSED' } })
    const list = await app.inject({ method: 'GET', url: '/v1/projects', cookies })
    expect(list.json()).toEqual([])
    await app.close()
  })

  it('refuses a mutation carrying a session and NO Origin at all', async () => {
    const { app, create } = await server()
    const res = await create({})
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('CSRF_ORIGIN_REFUSED')
    await app.close()
  })

  it('answers a mutation with no session 401, not 403 — there is no cookie to forge with', async () => {
    const { app } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      payload: { slug: 'csrf-anon', blueprint: 'fixture-node@1' },
      headers: { 'idempotency-key': randomUUID(), origin: APP_ORIGIN },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('refuses a sign-out from a sibling origin, and leaves the session cookie alone', async () => {
    const { app, cookies } = await server()
    const res = await app.inject({ method: 'POST', url: '/auth/logout', cookies, headers: { origin: APP_ORIGIN } })
    expect(res.statusCode).toBe(403)
    expect(res.cookies.find((c) => c.name === 'manifest_session')).toBeUndefined()
    await app.close()
  })

  it('does not ask the SAML callback for an origin — its credential is the assertion', async () => {
    const { app, cookies } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/saml/callback',
      cookies,
      payload: {},
      headers: { origin: 'https://idp.manifest.internal' },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })
})
```

In `api/events.test.ts`, inside `describe('WS /v1/projects/:projectId/events (D23.2)', …)`, following the existing upgrade tests' own helpers (they open `ws` clients against `app.listen({ port: 0 })`):

```ts
  it('refuses an UPGRADE carrying a member’s session from another origin (P5a Task 4)', async () => {
    // Build the server, a project owned by bio_prof and a listening port exactly as
    // 'refuses the UPGRADE itself for a stranger' does, then:
    const status = await upgradeStatus(url, { cookie, origin: 'https://proof-app.staging.manifest.internal' })
    expect(status).toBe(403)
    const opened = await upgradeStatus(url, { cookie, origin: deps.config.sp.origin })
    expect(opened).toBe(101)
  })
```

`upgradeStatus` is the file's own — if the file has no helper returning the handshake status, write one beside the test: a `ws` client with `headers`, resolving `101` on `open` and the status from `unexpected-response`, which is how *refuses the UPGRADE itself for a stranger* already reads it.

- [ ] **Step 2: Write the failing sign-in tests**

`packages/control-plane/src/identity/login-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { encodeLoginCookie, newLoginNonce, readLoginCookie, safeReturnTo, sameNonce } from './login-state.js'

describe('a sign-in’s state (P5a Task 4)', () => {
  it('keeps a same-origin path and replaces anything else with /', () => {
    expect(safeReturnTo('/projects/42')).toBe('/projects/42')
    expect(safeReturnTo('/')).toBe('/')
    for (const hostile of ['//evil.example/x', 'https://evil.example/', '/\\evil.example', ' /x', 'x', '', undefined, 42, `/${'a'.repeat(600)}`]) {
      expect(safeReturnTo(hostile)).toBe('/')
    }
  })

  it('round-trips the nonce and the return path through the cookie, and re-checks the path', () => {
    const nonce = newLoginNonce()
    expect(readLoginCookie(encodeLoginCookie(nonce, '/v1/me'))).toEqual({ nonce, returnTo: '/v1/me' })
    const forged = `${nonce}.${Buffer.from('//evil.example').toString('base64url')}`
    expect(readLoginCookie(forged)).toEqual({ nonce, returnTo: '/' })
    expect(readLoginCookie(undefined)).toBeUndefined()
    expect(readLoginCookie('no-dot')).toBeUndefined()
  })

  it('makes a nonce short enough for SAML RelayState (80 bytes, SAML Bindings §3.4.3)', () => {
    expect(Buffer.byteLength(newLoginNonce())).toBeLessThanOrEqual(80)
    expect(newLoginNonce()).not.toBe(newLoginNonce())
  })

  it('compares nonces without a length or content short-circuit', () => {
    const nonce = newLoginNonce()
    expect(sameNonce(nonce, nonce)).toBe(true)
    expect(sameNonce(nonce, newLoginNonce())).toBe(false)
    expect(sameNonce(nonce, nonce.slice(1))).toBe(false)
  })
})
```

In `api/auth.test.ts`, `pendingLogin` returns the browser's half too:

```ts
  /** A login redirect, the request ID an assertion must answer, and the browser's binding. */
  async function pendingLogin(
    app: App,
    returnTo?: string,
  ): Promise<{ location: string; requestId: string; relayState: string; loginCookie: string }> {
    const res = await app.inject({
      method: 'GET',
      url: returnTo === undefined ? '/auth/login' : `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
    })
    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    const cookie = res.cookies.find((c) => c.name === 'manifest_login')
    expect(cookie).toBeDefined()
    return {
      location,
      requestId: authnRequestId(location),
      relayState: new URL(location).searchParams.get('RelayState') ?? '',
      loginCookie: cookie!.value,
    }
  }

  const post = (
    app: App,
    SAMLResponse: string,
    binding: { relayState?: string; loginCookie?: string } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/auth/saml/callback',
      payload: {
        SAMLResponse,
        ...(binding.relayState === undefined ? {} : { RelayState: binding.relayState }),
      },
      ...(binding.loginCookie === undefined ? {} : { cookies: { manifest_login: binding.loginCookie } }),
    })
```

Every existing call `post(app, assertion(idp, requestId))` becomes `post(app, assertion(idp, requestId), login)` where `login` is the whole object `pendingLogin` returned. *completes a login* now expects `res.headers.location` to be `'/'`. Add:

```ts
  it('sets a login cookie bound to the RelayState it sends, for ten minutes, on /auth only', async () => {
    const app = await buildServer(await testDeps())
    const res = await app.inject({ method: 'GET', url: '/auth/login' })
    const cookie = res.cookies.find((c) => c.name === 'manifest_login')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.path).toBe('/auth')
    expect(cookie.maxAge).toBe(600)
    expect(cookie.secure).toBe(true)
    expect(String(cookie.sameSite).toLowerCase()).toBe('none')
    const relayState = new URL(res.headers.location as string).searchParams.get('RelayState')
    expect(cookie.value.startsWith(`${relayState}.`)).toBe(true)
    await app.close()
  })

  it('refuses an assertion posted by a browser that did not start the sign-in', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const login = await pendingLogin(app)
    // The attacker's own assertion, posted through a victim's browser: the right
    // RelayState, but no login cookie — the victim never started this sign-in.
    const res = await post(app, assertion(idp, login.requestId), { relayState: login.relayState })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_LOGIN_NOT_BOUND')
    expect(res.cookies.find((c) => c.name === 'manifest_session')).toBeUndefined()
    await app.close()
  })

  it('refuses an assertion whose RelayState is not this browser’s nonce', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    const mine = await pendingLogin(app)
    const theirs = await pendingLogin(app)
    const res = await post(app, assertion(idp, theirs.requestId), {
      relayState: theirs.relayState,
      loginCookie: mine.loginCookie,
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('SAML_LOGIN_NOT_BOUND')
    await app.close()
  })

  it('returns to a same-origin path, and to / for anything else', async () => {
    const app = await buildServer(await testDeps())
    const idp = await testSamlIdp()
    for (const [asked, landed] of [['/projects/7', '/projects/7'], ['//evil.example', '/'], ['https://evil.example/', '/']] as const) {
      const login = await pendingLogin(app, asked)
      const res = await post(app, assertion(idp, login.requestId), login)
      expect(res.statusCode).toBe(302)
      expect(res.headers.location).toBe(landed)
    }
    await app.close()
  })
```

- [ ] **Step 3: Watch them fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/csrf.test.ts src/identity/login-state.test.ts src/api/auth.test.ts src/api/events.test.ts
```

Expected: `login-state.test.ts` fails to import; in `csrf.test.ts` the sibling-origin, no-origin and sign-out tests get `201`, `201` and `204`; in `auth.test.ts` no `manifest_login` cookie is set; the events upgrade opens (`101`) from the other origin.

- [ ] **Step 4: Build the two modules**

`packages/control-plane/src/api/csrf.ts`:

```ts
import type { FastifyRequest } from 'fastify'
import { SESSION_COOKIE } from '../identity/index.js'

/**
 * §20: "CSRF protection on every state-changing route" — as an ORIGIN check (P5a
 * Decision 15), applied to every request that carries the session cookie.
 *
 * WHY THIS AND WHY HERE. The console and the API share `console.manifest.internal`, and
 * every deployed app is SAME-SITE with it (`<slug>.staging.manifest.internal` locally,
 * `<slug>.manifest.apps.ltic.ubc.ca` at UBC). `SameSite=Lax` sends the session cookie on
 * a same-site form POST, so untrusted app code could act as whoever visits it. Browsers
 * send `Origin` on every POST and every WebSocket handshake; a script sets it (Node 24's
 * fetch sends none unless told — P5a Task 1, M5).
 *
 * A request WITHOUT the cookie is not asked: there is nothing to forge with, and its
 * refusal is authentication's (401), not this.
 */
export class CsrfRefusedError extends Error {
  readonly code = 'CSRF_ORIGIN_REFUSED'
  constructor(
    readonly received: string | undefined,
    readonly expected: string,
  ) {
    super(
      received === undefined
        ? 'a request carrying a Manifest session must say which origin it came from, and this one did not'
        : `a request carrying a Manifest session came from '${received.slice(0, 100)}', not '${expected}'`,
    )
    this.name = 'CsrfRefusedError'
  }
}

export function carriesSession(request: FastifyRequest): boolean {
  return request.cookies[SESSION_COOKIE] !== undefined
}

export function assertSameOrigin(request: FastifyRequest, origin: string): void {
  if (!carriesSession(request)) return
  const received = request.headers.origin
  if (received !== origin) {
    throw new CsrfRefusedError(typeof received === 'string' ? received : undefined, origin)
  }
}
```

`packages/control-plane/src/identity/login-state.ts`:

```ts
import { randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * A sign-in, bound to the browser that started it (P5a Decision 16).
 *
 * node-saml's `InResponseTo` check proves an assertion answers a request THIS PROCESS
 * made. It does not prove the request was made by THIS BROWSER: anyone can start their
 * own sign-in, finish it at the IdP, and post the resulting assertion through a victim's
 * browser — which then holds the attacker's session (login CSRF). So `/auth/login` sets
 * a cookie holding a nonce, sends the same nonce as SAML `RelayState`, and the callback
 * refuses an assertion whose `RelayState` is not the cookie's.
 *
 * The RETURN PATH rides in the cookie, not in `RelayState`: SAML Bindings §3.4.3 caps
 * `RelayState` at 80 bytes, which a path does not fit. It is re-checked on the way out,
 * because a cookie is the client's input too.
 */
export const LOGIN_COOKIE = 'manifest_login'
export const LOGIN_TTL_SECONDS = 600

/** A same-origin path: one leading slash, no second, no whitespace, no backslash. */
const RETURN_TO = /^\/(?!\/)[^\s\\]{0,511}$/

export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && RETURN_TO.test(value) ? value : '/'
}

/** 24 random bytes, base64url: 32 characters, inside RelayState's 80. */
export function newLoginNonce(): string {
  return randomBytes(24).toString('base64url')
}

export function encodeLoginCookie(nonce: string, returnTo: string): string {
  return `${nonce}.${Buffer.from(safeReturnTo(returnTo), 'utf8').toString('base64url')}`
}

export function readLoginCookie(
  value: string | undefined,
): { nonce: string; returnTo: string } | undefined {
  if (value === undefined) return undefined
  const dot = value.indexOf('.')
  if (dot <= 0) return undefined
  const nonce = value.slice(0, dot)
  const returnTo = Buffer.from(value.slice(dot + 1), 'base64url').toString('utf8')
  return { nonce, returnTo: safeReturnTo(returnTo) }
}

export function sameNonce(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
```

Export all of them from `identity/index.ts` (`export * from './login-state.js'`).

- [ ] **Step 5: Wire them in**

`identity/saml.ts` — the interface and the call:

```ts
  /** A signed AuthnRequest as a redirect URL, carrying `relayState` back to the ACS. */
  loginUrl(relayState: string): Promise<string>
```

```ts
    loginUrl: (relayState: string) => saml.getAuthorizeUrlAsync(relayState, undefined, {}),
```

`api/server.ts` — declare the opt-out beside `idempotency`:

```ts
    /** `/auth/saml/callback` only: its credential is a signed assertion bound to the browser (P5a Task 4). */
    csrf?: 'exempt'
```

and in the `preHandler`, **before** the idempotency check, so a cross-site form learns nothing about which headers it lacks:

```ts
    // §20 CSRF (P5a Task 4). First, and on the route's own opt-out, never on a path list.
    if (request.routeOptions.config?.csrf !== 'exempt') {
      assertSameOrigin(request, deps.config.sp.origin)
    }
```

`api/errors.ts`, beside `IdempotencyConflictError`:

```ts
  // §20. The hint names the origin: it is configuration, not a secret, and a script
  // author needs it to fix their request.
  if (error instanceof CsrfRefusedError) {
    return {
      status: 403,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: `Send Origin: ${error.expected}. A browser does this itself; a script sets the header, as @manifest/contract's client does.`,
        },
      },
    }
  }
```

`api/routes/auth.ts`:

```ts
const loginQuery = z.object({ returnTo: z.string().max(512).optional() })
const callbackBody = z.object({
  SAMLResponse: z.string().min(1),
  // SAML Bindings §3.4.3: at most 80 bytes. Optional in the SCHEMA so a malformed body is
  // still 400 for every actor (the authorization suite's claim); refused below if absent.
  RelayState: z.string().max(80).optional(),
})
```

```ts
  app.get('/auth/login', async (request, reply) => {
    const { returnTo } = loginQuery.parse(request.query ?? {})
    const nonce = newLoginNonce()
    const https = deps.config.sp.origin.startsWith('https://')
    reply.setCookie(LOGIN_COOKIE, encodeLoginCookie(nonce, safeReturnTo(returnTo)), {
      httpOnly: true,
      path: '/auth',
      maxAge: LOGIN_TTL_SECONDS,
      secure: https,
      // The IdP's auto-submitting POST is CROSS-site wherever the IdP is on another
      // registrable domain, and Lax would drop this cookie from it. None needs Secure,
      // which a loopback http origin cannot give — the Docker tier's case, same-site.
      sameSite: https ? 'none' : 'lax',
    })
    return reply.redirect(await deps.samlSp.loginUrl(nonce), 302)
  })
```

The callback's options become `{ config: { idempotency: 'exempt', csrf: 'exempt' } }`, and its body:

```ts
      const { SAMLResponse, RelayState } = callbackBody.parse(request.body)
      // BOUND BEFORE IT IS VALIDATED: a refusal here never touches the SAML library, and
      // never consumes the request ID node-saml is holding for the real browser.
      const binding = readLoginCookie(request.cookies[LOGIN_COOKIE])
      if (binding === undefined || RelayState === undefined || !sameNonce(binding.nonce, RelayState)) {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'SAML assertion refused',
            error: 'the sign-in was not started by this browser (no login cookie, or a RelayState that is not its nonce)',
          }),
        )
        throw new SamlError('SAML_LOGIN_NOT_BOUND', 'the assertion answers a sign-in this browser did not start')
      }
```

After the session cookie is set, clear the login cookie and return to the path the browser asked for:

```ts
      reply.clearCookie(LOGIN_COOKIE, { path: '/auth' })
      // The path the browser asked for at /auth/login, re-checked (login-state.ts). `/`
      // by default: the console's home, which P5c serves on this origin.
      return reply.redirect(binding.returnTo, 302)
```

`api/routes/events.ts` — both halves, because a guard written once is one edit from gone:

```ts
    preValidation: async (request) => {
      // Cross-site WebSocket hijacking (P5a Task 4): a same-site app's page can open this
      // stream with the member's cookie and READ it. Browsers always send Origin on a
      // handshake. A plain GET — the authorization suite's 426 — is not an upgrade.
      if (request.headers.upgrade?.toLowerCase() === 'websocket') {
        assertSameOrigin(request, deps.config.sp.origin)
      }
      await authorizeStream(deps, request)
    },
```

and at the top of `wsHandler`:

```ts
      try {
        assertSameOrigin(request, deps.config.sp.origin)
      } catch {
        socket.close(4403, 'forbidden')
        return
      }
```

- [ ] **Step 6: Every test that mutates with a session sends the origin**

`api/testing.ts`:

```ts
/**
 * What every mutation a session makes must carry: D23.6's Idempotency-Key and, since P5a
 * Task 4, §20's Origin — the configured one, read from `deps` rather than restated.
 */
export function mutationHeaders(deps: ServerDeps): { 'idempotency-key': string; origin: string } {
  return { 'idempotency-key': randomUUID(), origin: deps.config.sp.origin }
}
```

```bash
cd /Users/rich/Developer/manifest/packages/control-plane
grep -rn "idempotency-key" src --include='*.test.ts' src/api/authz-contract.ts | cut -c1-140
```

Each hit is a mutation. Where it carries `cookies`, its headers become `mutationHeaders(deps)` (or gain `origin: deps.config.sp.origin` where the test builds headers another way). In `authz-contract.ts`, keep the deps `factory()` returned in `beforeAll` and add `origin: deps.config.sp.origin` to the `headers` of every request in the suite — including the fixture's own setup requests. In `identity/saml.docker.test.ts`, hop 1's `set-cookie` for `manifest_login` is kept and sent with the callback, and the callback posts the `RelayState` the IdP's form carries; its `location` expectation becomes `'/'`.

- [ ] **Step 7: The shell's sign-in posts `RelayState` back, and the demos send `Origin`**

`infra/lib/idp-login.sh`, after `saml=…` is read:

```bash
  # RelayState rides back to the ACS beside the assertion (P5a Task 4): Manifest's own SP
  # binds a sign-in to the browser that started it by comparing it with a cookie. An app
  # that sent none gets none back. `${relay_arg[@]+…}` because bash 3.2 under `set -u`
  # calls an empty array unbound.
  local relay relay_arg=()
  relay="$(echo "$assertion" | sed -n 's/.*name="RelayState"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
  if [ -n "$relay" ]; then relay_arg=(--data-urlencode "RelayState=$relay"); fi
```

and the final post becomes:

```bash
  curl -sS -c "$jar" -b "$jar" -o /dev/null --cacert "$ca" \
    --data-urlencode "SAMLResponse=$saml" ${relay_arg[@]+"${relay_arg[@]}"} "$acs"
```

`scripts/lib/api.sh`'s `api`: `if [ "$method" != GET ]; then args+=(-H "idempotency-key: $(key)" -H "origin: $ORIGIN"); fi`. `scripts/lib/event-stream.mjs`'s `watch`: the WebSocket's headers gain `origin: new URL(api).origin`.

- [ ] **Step 8: Run it**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/csrf.test.ts src/identity/login-state.test.ts src/api/auth.test.ts src/api/events.test.ts
pnpm test && pnpm test
pnpm --filter @manifest/control-plane build   # then restart the control plane
make demo-identity && make demo-ai
MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/identity/saml.docker.test.ts
```

Expected: all green; `make demo-identity` signs the instructor in through the edge **with the login binding**, and the app sign-ins (which send no `RelayState`) are unchanged. Restart the control plane after the Docker file.

- [ ] **Step 9: Documents, gates and commit**

`RUNBOOK.md` and `README.md`: every documented `curl -X POST` against the API gains `-H "origin: https://console.manifest.internal"`, and a sentence under *Running the control plane*: **a mutation carrying a session is refused `403 CSRF_ORIGIN_REFUSED` without that header** (§20).

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
git add -A packages/control-plane/src infra/lib/idp-login.sh scripts README.md docs/superpowers/RUNBOOK.md
git commit -m "feat(api): CSRF by Origin on every session mutation and stream upgrade, and a sign-in bound to its browser (§20)"
```

- [ ] **Step 10: Negative controls — after the commit**

| | Break | Expect red | Then |
|---|---|---|---|
| a | delete the `assertSameOrigin` call from the `preHandler` | `csrf.test.ts` *refuses the same mutation from a sibling app's origin* (201) and *NO Origin* (201) and *a sign-out* (204) | `git checkout packages/control-plane/src/api/server.ts` |
| b | in `assertSameOrigin`, `if (received !== origin)` → `if (received !== undefined && received !== origin)` | `csrf.test.ts` *NO Origin at all* only — the one a looser rule would lose | `git checkout packages/control-plane/src/api/csrf.ts` |
| c | delete the `upgrade === 'websocket'` block from `preValidation` **and** the check in `wsHandler` | `events.test.ts` *refuses an UPGRADE … from another origin* (101) | `git checkout packages/control-plane/src/api/routes/events.ts` |
| d | delete only the `wsHandler` check | nothing in the unit tier — the hook still refuses first. **Recorded, not fixed**: the second read exists for the day the hook is lost, and (c) is the control that proves the pair | as (c) |
| e | `binding === undefined \|\| …` → `false` in the callback | `auth.test.ts` *a browser that did not start the sign-in* and *RelayState is not this browser's nonce* (302) | `git checkout packages/control-plane/src/api/routes/auth.ts` |
| f | `RETURN_TO` → `/^\/.{0,511}$/` | `login-state.test.ts` *keeps a same-origin path* (`//evil.example/x`) | `git checkout packages/control-plane/src/identity/login-state.ts` |
| g | drop `${relay_arg[@]+…}` from `idp-login.sh`'s final post | `make demo-identity` step 1: the Manifest sign-in ends without a session (`SAML_LOGIN_NOT_BOUND` in the control plane's stderr) | `git checkout infra/lib/idp-login.sh` |

---

## Task 5: One registry of every error code a client can receive

> **EXECUTED 2026-09-16 (sitting 3), `6b3ae28`, with `cbd4ce5` after it.** The draft below matched the source code for code — 63, `SPEC_INVALID` under two families as predicted. What runs adds three things, each measured: **Fastify's own refusals of an unreadable request answered `500 INTERNAL`** — a malformed or empty JSON body, `text/csv`, a body over 1 MiB — and are now `REQUEST_INVALID` (400), `REQUEST_MEDIA_TYPE_UNSUPPORTED` (415) and `REQUEST_BODY_TOO_LARGE` (413), so the registry holds **65**; **the delivery test Step 4 names does not exist** and was written (a build of an invalid spec is `422` with the same `details` the spec push recorded); and **the stderr report of an unregistered code has a test**. Sitting 3's entry has the rest.

**Why its own task.** §20's *Machine-actionable errors* promises stable codes an agent can switch on, and today they are string literals in eleven classes across seven modules, several of them thrown on the line after the constructor (*Read this first* 4). The generated contract needs one list to publish, and this project's most-repeated lesson says the list must be held to the code by a test, not by care. **Writing the registry finds a defect already**: `SPEC_INVALID` is answered `422` by `SpecInvalidError` and `400` by the build route's `BadRequestError('SPEC_INVALID', …)`.

**Files:**
- Create: `packages/control-plane/src/api/error-codes.ts`
- Create: `packages/control-plane/src/api/error-codes.test.ts`
- Modify: `packages/control-plane/src/api/errors.ts` (an unregistered code is reported on stderr)
- Modify: `packages/control-plane/src/api/routes/delivery.ts` (the build route's invalid-spec refusal becomes `SpecInvalidError` with its details)
- Modify: `packages/control-plane/src/api/delivery.test.ts` (that refusal is 422)

**Interfaces:**
- Produces: `ERROR_CODES: Record<ErrorCode, { status: number; families: readonly ErrorFamily[]; summary: string }>`, `type ErrorCode`, `type ErrorFamily`, `ERROR_CODE_LIST: readonly ErrorCode[]` (sorted), and `MANIFEST_ERROR_CODE_LIST: readonly string[]` (every `SPEC_CODES`, `POLICY_CODES` and `BLUEPRINT_CODES` value, sorted — the codes inside `details`).
- Consumes: `CsrfRefusedError` (Task 4), `ROUTE_NOT_FOUND` (Task 2).

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/api/error-codes.test.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AI_CODES, AiError, CATALOGUE_CODES, CatalogueError } from '../ai/index.js'
import { ConfigError } from '../config.js'
import { SamlError } from '../identity/index.js'
import { AuthorizationError, ProjectError } from '../projects/index.js'
import { ReleaseError } from '../releases/index.js'
import { SourceError } from '../source/index.js'
import { ERROR_CODES, type ErrorFamily } from './error-codes.js'
import { BadRequestError, toErrorResponse } from './errors.js'

const SRC = new URL('..', import.meta.url).pathname

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && entry.name !== 'testing.ts')
      out.push(full)
  }
  return out
}

/** The classes `toErrorResponse` answers as themselves. Everything else is INTERNAL. */
const WIRE_CLASSES = [
  'AuthorizationError',
  'BadRequestError',
  'ProjectError',
  'ReleaseError',
  'SourceError',
  'ConfigError',
  'SamlError',
] as const

/**
 * Every code a client can receive, as the SOURCE throws it — multi-line, because half
 * the constructors put the code on the next line (P5a Task 5).
 */
async function thrown(): Promise<Map<string, Set<ErrorFamily>>> {
  const found = new Map<string, Set<ErrorFamily>>()
  const add = (code: string, family: ErrorFamily) =>
    found.set(code, (found.get(code) ?? new Set()).add(family))
  const construct = new RegExp(`new\\s+(${WIRE_CLASSES.join('|')})\\(\\s*'([A-Z][A-Z0-9_]+)'`, 'g')
  for (const file of await sourceFiles(SRC)) {
    const text = await readFile(file, 'utf8')
    for (const m of text.matchAll(construct)) add(m[2]!, m[1] as ErrorFamily)
    if (relative(SRC, file).split(sep)[0] === 'api') {
      for (const m of text.matchAll(/readonly code = '([A-Z][A-Z0-9_]+)'/g)) add(m[1]!, 'api')
      for (const m of text.matchAll(/\bcode: '([A-Z][A-Z0-9_]+)'/g)) add(m[1]!, 'api')
    }
  }
  for (const code of Object.values(AI_CODES)) add(code, 'AiError')
  for (const code of Object.values(CATALOGUE_CODES)) add(code, 'CatalogueError')
  return found
}

describe('the error-code registry (§20, D23.7)', () => {
  it('registers every code the source throws through a class the API answers as itself', async () => {
    const missing: string[] = []
    for (const [code, families] of await thrown()) {
      const entry = (ERROR_CODES as Record<string, { families: readonly ErrorFamily[] }>)[code]
      if (entry === undefined) missing.push(`${code} (${[...families].join(', ')})`)
      else for (const family of families) if (!entry.families.includes(family)) missing.push(`${code}: not registered for ${family}`)
    }
    expect(missing).toEqual([])
  })

  it('registers nothing the source never throws', async () => {
    const found = await thrown()
    expect(Object.keys(ERROR_CODES).filter((code) => !found.has(code))).toEqual([])
  })

  it('answers each class-thrown code with the status the registry states', () => {
    const make: Partial<Record<ErrorFamily, (code: string) => unknown>> = {
      AuthorizationError: (c) => new AuthorizationError(c as 'FORBIDDEN' | 'NOT_FOUND', 'm'),
      BadRequestError: (c) => new BadRequestError(c, 'm'),
      ProjectError: (c) => new ProjectError(c, 'm'),
      ReleaseError: (c) => new ReleaseError(c, 'm'),
      SourceError: (c) => new SourceError(c, 'm'),
      ConfigError: (c) => new ConfigError(c, 'm'),
      SamlError: (c) => new SamlError(c, 'm'),
      AiError: (c) => new AiError(c, 503, {}),
      CatalogueError: (c) => new CatalogueError(c, 'm', 'h'),
    }
    const wrong: string[] = []
    for (const [code, entry] of Object.entries(ERROR_CODES)) {
      for (const family of entry.families) {
        const build = make[family]
        if (build === undefined) continue
        const { status, body } = toErrorResponse(build(code))
        if (status !== entry.status || body.error.code !== code)
          wrong.push(`${code} via ${family}: ${status} ${body.error.code}, registry says ${entry.status}`)
      }
    }
    expect(wrong).toEqual([])
  })
})
```

- [ ] **Step 2: Watch it fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/error-codes.test.ts
```

Expected: FAIL — `error-codes.js` does not exist.

- [ ] **Step 3: Write the registry**

`packages/control-plane/src/api/error-codes.ts`. **Generate the first draft from the source, never from this plan's memory of it**: run the test with an empty `ERROR_CODES`, and its first failure lists every thrown code with its family. The draft below is what the source held when this plan was written; where the test disagrees, **the test is right**.

```ts
import { BLUEPRINT_CODES } from '../blueprints/index.js'
import { POLICY_CODES, SPEC_CODES } from '../spec/index.js'

/**
 * §20's *Machine-actionable errors* and D23.7: EVERY code a client can receive, once,
 * with the status it is answered with (P5a Task 5).
 *
 * Held to the source by `error-codes.test.ts`, in both directions: a code thrown through
 * a class the API answers as itself and not listed here is red, and a code listed here
 * that nothing throws is red. `ErrorCode` is a union, so a route's `errors:` list
 * (Task 6) is checked by tsc. The contract publishes the list as an enum.
 *
 * A FAMILY is where the code comes from: a class `toErrorResponse` maps, or `api` for
 * the literals and fixed-code classes in `api/` itself.
 */
export type ErrorFamily =
  | 'api'
  | 'AuthorizationError'
  | 'BadRequestError'
  | 'ProjectError'
  | 'ReleaseError'
  | 'SourceError'
  | 'ConfigError'
  | 'SamlError'
  | 'AiError'
  | 'CatalogueError'

interface Entry {
  status: number
  families: readonly ErrorFamily[]
  summary: string
}

const api = (status: number, summary: string): Entry => ({ status, families: ['api'], summary })
const bad = (summary: string): Entry => ({ status: 400, families: ['BadRequestError'], summary })
const release = (summary: string): Entry => ({ status: 409, families: ['ReleaseError'], summary })
const source = (summary: string): Entry => ({ status: 409, families: ['SourceError'], summary })
const config = (summary: string): Entry => ({ status: 409, families: ['ConfigError'], summary })
const saml = (summary: string): Entry => ({ status: 401, families: ['SamlError'], summary })
const ai = (summary: string): Entry => ({ status: 503, families: ['AiError'], summary })

export const ERROR_CODES = {
  // api/ — the envelope's own answers
  UNAUTHENTICATED: api(401, 'The request carries no valid session.'),
  INTERNAL: api(500, 'The control plane failed; its operator log has the reason. Nothing the client sent explains it.'),
  REQUEST_INVALID: api(400, 'A field in the request is missing or malformed; the message names each one.'),
  ROUTE_NOT_FOUND: api(404, 'No route has this method and path. Resource routes are under /v1/.'),
  IDEMPOTENCY_KEY_REUSED: api(409, 'This Idempotency-Key was used on this route with a different body.'),
  CSRF_ORIGIN_REFUSED: api(403, 'A request carrying a session did not come from the console’s origin.'),
  EVENTS_UPGRADE_REQUIRED: api(426, 'The event stream is a WebSocket; a plain GET cannot read it.'),
  SPEC_INVALID: api(422, 'manifest.yaml at this commit is not valid; `details` lists each error with its path.'),
  RELEASE_PRODUCTION_GATE_UNAVAILABLE: {
    status: 409,
    families: ['api', 'ReleaseError'],
    summary: 'A first production launch is a checklist (§13, D19); the body carries LaunchReadiness.',
  },

  // projects/authz.ts
  NOT_FOUND: { status: 404, families: ['AuthorizationError'], summary: 'No such resource — or one the caller has no business knowing exists.' },
  FORBIDDEN: { status: 403, families: ['AuthorizationError'], summary: 'A member of the project whose role does not hold this capability.' },

  // BadRequestError — every one of these is 400
  IDEMPOTENCY_KEY_REQUIRED: bad('A mutation arrived without an Idempotency-Key of at least 8 characters (D23.6).'),
  BLUEPRINT_NOT_FOUND: bad('No blueprint with this reference is in the registry.'),
  BUILD_INVALID_INPUT: bad('The build request body is malformed.'),
  BUILD_LOG_INVALID_QUERY: bad('`tail` is not a whole number from 1 to 10000.'),
  DEPLOY_INVALID_INPUT: bad('The deploy request body is malformed.'),
  MEMBER_INVALID_INPUT: bad('The member request body is malformed.'),
  MEMBER_USER_NOT_FOUND: bad('No user with this PUID has ever signed in.'),
  PROJECT_INVALID_INPUT: bad('The project request body is malformed.'),
  PROJECT_NOT_FOUND: bad('No project with this id.'),
  RELEASE_INVALID_INPUT: bad('The release request body is malformed.'),
  SPEC_INVALID_INPUT: bad('The spec request body is malformed.'),
  SPEC_NOT_FOUND: bad('The project has no validated spec yet.'),

  // projects/repository.ts
  PROJECT_INVALID_SLUG: { status: 409, families: ['ProjectError'], summary: 'The slug breaks §7’s rule.' },
  PROJECT_SLUG_TAKEN: { status: 409, families: ['ProjectError'], summary: 'Another project holds this slug.' },

  // releases/ — every one is 409
  RELEASE_AI_BUDGET_MISSING: release('The release declares models and no AI budget.'),
  RELEASE_AI_DISABLED: release('The release declares models and AI is switched off on this control plane.'),
  RELEASE_BLUEPRINT_NOT_FOUND: release('The project’s blueprint is no longer in the registry.'),
  RELEASE_BUILD_NOT_DEPLOYABLE: release('The build did not succeed, so nothing can be released from it.'),
  RELEASE_BUILD_NOT_FOUND: release('No build with this id.'),
  RELEASE_DIGEST_MISSING: release('The release’s build recorded no digest.'),
  RELEASE_ENVIRONMENT_NOT_FOUND: release('No environment with this id.'),
  RELEASE_IMAGE_REPOSITORY_MISSING: release('The build recorded a digest and no repository; rebuild it.'),
  RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER: release('A laptop-built image cannot reach a remote driver (§13).'),
  RELEASE_MODEL_CLASSIFICATION_TOO_LOW: release('A declared model is not approved for the app’s data classification (D17).'),
  RELEASE_MODEL_NOT_IN_CATALOGUE: release('A declared model is no longer in the catalogue.'),
  RELEASE_MODEL_UNCLASSIFIED: release('A declared model has no classification in the catalogue.'),
  RELEASE_NOT_FOUND: release('No release with this id.'),
  RELEASE_PROJECT_NOT_FOUND: release('The environment names a project that does not exist.'),

  // source/ — every one is 409
  SOURCE_FOREIGN_REPO: source('The repository reference was not made by this driver.'),
  SOURCE_GIT_FAILED: source('git failed; the message names the operation.'),
  SOURCE_INVALID_SLUG: source('The slug cannot name a repository.'),
  SOURCE_PATH_ESCAPE: source('The slug resolves outside the repository root.'),

  // config.ts — mapped by toErrorResponse, raised at boot
  CONFIG_INVALID: config('A setting failed validation.'),
  CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED: config('MANIFEST_BUILD_CREDENTIAL_SECRET is required outside development.'),
  CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH: config('A loopback origin names a port the control plane does not listen on.'),
  CONFIG_LITELLM_MASTER_KEY_REQUIRED: config('MANIFEST_LITELLM_MASTER_KEY is required outside development.'),
  CONFIG_MASTER_SECRET_REQUIRED: config('MANIFEST_MASTER_SECRET is required outside development.'),

  // identity/saml.ts and the callback — every one is 401, and the envelope names no detail
  SAML_ASSERTION_REJECTED: saml('The assertion was refused; the operator log says why.'),
  SAML_NO_PUID: saml('The assertion released no ubcEduCwlPuid.'),
  SAML_USER_UPSERT_FAILED: saml('The user could not be recorded.'),
  SAML_LOGIN_NOT_BOUND: saml('The assertion answers a sign-in this browser did not start.'),

  // ai/ — every one is 503, and carries nothing from the gateway (§14)
  AI_PROJECT_BUDGET_EXCEEDED: ai('The app has used its AI budget for the month.'),
  AI_USER_BUDGET_EXCEEDED: ai('The person has used their AI allowance for the month.'),
  AI_MODEL_NOT_PERMITTED: ai('The app’s key does not reach the model it asked for.'),
  AI_ROUTE_NOT_PERMITTED: ai('The app’s key does not reach that gateway route.'),
  AI_KEY_REVOKED: ai('The app’s key was revoked.'),
  AI_KEY_EXPIRED: ai('The app’s key expired.'),
  AI_MODEL_UNKNOWN: ai('The gateway does not know the model.'),
  AI_BACKEND_UNAVAILABLE: ai('The gateway could not be reached.'),
  AI_UNMAPPED: ai('The gateway answered with a failure this platform does not map.'),
  AI_CATALOGUE_EMPTY: { status: 503, families: ['CatalogueError'], summary: 'The gateway returned an empty model catalogue.' },
  AI_CATALOGUE_DISABLED: { status: 503, families: ['CatalogueError'], summary: 'AI is switched off on this control plane.' },
} as const satisfies Record<string, Entry>

export type ErrorCode = keyof typeof ERROR_CODES

export const ERROR_CODE_LIST = Object.keys(ERROR_CODES).sort() as readonly ErrorCode[]

/** The codes inside `details` (a `ManifestError[]`): §7's schema, its policy, and §25's compatibility check. */
export const MANIFEST_ERROR_CODE_LIST: readonly string[] = [
  ...Object.values(SPEC_CODES),
  ...Object.values(POLICY_CODES),
  ...Object.values(BLUEPRINT_CODES),
].sort()
```

- [ ] **Step 4: Fix the defect the registry names, and report an unregistered code**

In `api/routes/delivery.ts`, the build route's invalid-spec refusal:

```ts
    // SpecInvalidError, with the errors (P5a Task 5). This was
    // `BadRequestError('SPEC_INVALID', …)` — one code answered 400 here and 422 from
    // `POST …/spec`, which a client switching on the code could not tell apart, and it
    // carried no `details` to act on.
    if (!spec.valid) throw new SpecInvalidError(spec.errors as never)
```

In `api/delivery.test.ts`, the test that builds against an invalid spec expects `422` and `details` with at least one entry.

In `api/errors.ts`, wrap the return so every envelope's code is checked once:

```ts
export function toErrorResponse(error: unknown): { status: number; body: ErrorEnvelope } {
  const response = mapError(error)
  if (!(response.body.error.code in ERROR_CODES)) {
    // The test is the gate; this is the operator's copy for a code that reached the wire
    // anyway. The code only — never the message, which can quote the caller's input.
    console.error(JSON.stringify({ level: 'error', msg: 'an error code is not in api/error-codes.ts', code: response.body.error.code }))
  }
  return response
}
```

and rename the existing body to `function mapError(error: unknown): { status: number; body: ErrorEnvelope }`.

- [ ] **Step 5: Watch it pass, and read what it lists**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/error-codes.test.ts
```

Expected: 3 passed. **If a code is missing, add it with its real status; if a code is registered and unthrown, delete it** — and record each in the sitting's findings, because either is a fact the draft above got wrong.

- [ ] **Step 6: Gates and commit**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
git add packages/control-plane/src/api
git commit -m "feat(api): one registry of every error code a client can receive, held to the source (§20, D23.7)"
```

- [ ] **Step 7: Negative controls — after the commit**

| | Break | Expect red | Then |
|---|---|---|---|
| a | in `routes/projects.ts`, throw `new BadRequestError('PROJECT_SLUG_SHOUTED', 'x')` from any branch | *registers every code the source throws* — lists `PROJECT_SLUG_SHOUTED (BadRequestError)` | `git checkout` the file |
| b | put the constructor's code on the next line: `new ReleaseError(\n 'RELEASE_ZZZ',` | the same test lists `RELEASE_ZZZ` — the multi-line scan is what makes (a) not a one-line accident | as (a) |
| c | add `UNUSED_CODE: api(400, 'x')` to the registry | *registers nothing the source never throws* | `git checkout packages/control-plane/src/api/error-codes.ts` |
| d | `RELEASE_NOT_FOUND: release(…)` → `{ status: 404, families: ['ReleaseError'], … }` | *answers each class-thrown code with the status the registry states* — `409, registry says 404` | as (c) |

---
## Task 6: The contract's spine — `defineRoute`, the OpenAPI document, and its drift test

> **EXECUTED 2026-09-16 (sitting 4), `204bf49`.** What runs differs from the text below in these places, each measured: **`ref()` requires the registered ID, not the metadata** — zod 3.25.76's `registry.get` inherits a parent's metadata and deletes only its `id`, so a `.describe()` copy of a registered schema answers `{}`, and the check as written emitted `"$ref": "#/components/schemas/undefined"` for it and let *refuses a representation that is not registered* go red (control (h)); **the wrong-shape test's value is `{ leaked: 'hunter2-probe-value' }`, not `42`** — `not.toContain('42')` failed 15.1% of 100,000 random UUIDs in the logged URL alone, and every run once the stack position the log prints (`route.ts:144:19`) contains 42 (control (i)); **`EVERY_MUTATION` carries sitting 3's two framework codes**; `auth.test.ts` asserts `Me` EXACTLY for a test user (a `toMatchObject` cannot see a leaked column) and gains two tests — a validly signed session whose user row is gone is `401` (without the branch it was `500`, control (j)), and `GET /v1/me?verbose=1` is `400 REQUEST_INVALID` naming the key, pinning `NO_QUERY`'s strictness as intended (control (k)); and **Step 11's row (b) turns only *strips every field* red** — the wrong-shape throw precedes the send, so that test stays `500`. `pnpm contract:write` truncates the control plane's tables like `pnpm test` (its docblock says so).

> **Sitting 3 correction (2026-09-16) — every mutation can answer two more codes.** Task 5 found that Fastify refuses an unreadable body before any route runs, and that those refusals answered `500 INTERNAL`; they are now `REQUEST_MEDIA_TYPE_UNSUPPORTED` (415, a body that is not JSON) and `REQUEST_BODY_TOO_LARGE` (413, over Fastify's 1 MiB), with a malformed or empty body `REQUEST_INVALID`. **So `document.ts`'s `EVERY_MUTATION` below gains `'REQUEST_MEDIA_TYPE_UNSUPPORTED'` and `'REQUEST_BODY_TOO_LARGE'`**, or the document will say a `POST` cannot answer what it does. `api/errors.ts`'s body is already `mapError`, as Step 5 below assumes, and it maps Fastify's refusals first — put `RequestValidationError`'s branch after that call, before `ZodError`'s.

**Why one route.** The brief's §6 asks for the schema machinery to be proved on one real route before the rest are converted, and Task 1's M1 measured the parts. `GET /v1/me` is the route: every client calls it first, it has no parameters and no side effects, and its representation needs a database read the session does not carry.

> **Read Task 1's `[M1a]`–`[M1g]` before starting.** A correction there changes `route.ts` or `document.ts` below.
>
> **Task 1 results (2026-09-16), and one control this task lacks.** M1 ran 6 of 6 on zod 3.25.76's `zod/v4` and Fastify 5.12.3, and nothing below changes: a bad `projectId` was refused with issue code `invalid_format`; `handle` and `driver` did not survive `Project.parse`; a `Date` was refused where `z.iso.datetime()` belongs; two registries converted with `uri` gave `"$ref":"#/components/schemas/Environment"`, and **every component carried its own `$schema` and `$id`** — `document.ts`'s `strip` is needed exactly as written; a v4 `ZodError` is **not** `instanceof` zod 3's, so the handler's second branch stays; `z.coerce.number()` accepted the query string `'5'`. Shapes, for reading the drift diff: `nullable` → `anyOf [T, null]`; `z.discriminatedUnion` → **`anyOf`, with no `oneOf` and no `discriminator`** (Task 12's note); an `.optional()` key is left out of `required`; a **`.default()` key IS `required` in output**; `z.number().int()` emits `maximum: 9007199254740991`, and `minimum: -9007199254740991` when no minimum is set; `z.iso.datetime()` emits a 261-character `pattern`; a `z.strictObject` emits `additionalProperties: false` in **input** mode too. **`tsc` accepted the generic `defineRoute`** under this package's `tsconfig.json`.
>
> **`z.uuid()` is RFC 4122-strict** — version digit 1–8, variant 8–b, or the nil UUID — so a hand-made id such as `1a2b3c4d-0000-0000-0000-000000000000` in a path is `400 REQUEST_INVALID`, not the `404` a test may expect. Of the repository's 32 distinct UUID literals two fail it, both in `runtime/docker/names.test.ts`, and neither reaches a route; the nil UUID the suites use 15 times passes.
>
> **ADD negative control (g).** Task 1's own `[M1g]` control — a handler returning `slug: 1` refused with TS2322 — proves the RETURN type is checked, but it goes red whether or not `ctx.params` is typed, so it cannot see `params` widen to `any`. Measured a second: reading `params.projectID` → `TS2551: Property 'projectID' does not exist on type '{ projectId: string; }'`. In `route.test.ts`, give the probe route's handler one line that reads a param its schema does not declare, under `// @ts-expect-error — params are typed from the schema (P5a Task 1, [M1g])`: `pnpm typecheck` then goes red by itself the day `params` widens to `any`, because an unused `@ts-expect-error` is an error. Row (g): *remove the directive* → `pnpm --filter @manifest/control-plane typecheck` names the line.

**Files:**
- Create: `packages/control-plane/src/api/actor.ts` (`requireActor`, moved out of `server.ts`)
- Create: `packages/control-plane/src/api/contract/schemas.ts`
- Create: `packages/control-plane/src/api/contract/route.ts`
- Create: `packages/control-plane/src/api/contract/document.ts`
- Create: `packages/control-plane/src/api/contract/route.test.ts`
- Create: `packages/control-plane/src/api/contract/document.test.ts`
- Create: `packages/control-plane/src/api/contract/coverage.test.ts`
- Create: `packages/control-plane/src/api/representations/me.ts`
- Create: `packages/control-plane/src/api/routes/me.ts`
- Create: `packages/control-plane/src/api/routes/index.ts`
- Create: `packages/contract/openapi.json` (written by the drift test; `packages/contract/` holds nothing else until Task 7)
- Modify: `packages/control-plane/src/api/server.ts` (`registerRoutes`; re-export `requireActor`)
- Modify: `packages/control-plane/src/api/errors.ts` (`RequestValidationError` → 400)
- Modify: `packages/control-plane/src/api/routes/auth.ts` (the old `/v1/me` handler is deleted)
- Modify: `package.json` (`contract:write`), `.prettierignore` (`packages/contract/openapi.json`)

**Interfaces:**
- Produces, in `api/contract/schemas.ts`: `representations` and `requests` (`z.registry<{ id: string }>()`), `representation<T extends z.ZodType>(id: string, schema: T): T`, `request<T extends z.ZodType>(id: string, schema: T): T`, `Uuid`, `Timestamp`, `ErrorCodeSchema`, `ManifestErrorSchema`, `ErrorEnvelope`, `EmptyRequest` (`z.strictObject({})`, registered).
- Produces, in `api/contract/route.ts`: `type HttpMethod`, `type SuccessStatus = 200 | 201 | 202`, `interface RouteContext<P, Q, B>` (`deps`, `request`, `reply`, `actor: SessionActor`, `params`, `query`, `body`), `interface RouteDefinition<P extends z.ZodObject, Q extends z.ZodObject, B extends z.ZodType, R extends z.ZodType>`, `type AnyRoute`, `defineRoute(route): AnyRoute`, `registerRoutes(app, deps, routes): void`, `fastifyPath(path: string): string`, `NO_PARAMS`, `NO_QUERY`, `NO_BODY`, `RequestValidationError` (`code = 'REQUEST_INVALID'`), `ResponseContractError`.
- Produces, in `api/contract/document.ts`: `CONTRACT_VERSION = '0.1.0'`, `openApiDocument(routes: readonly AnyRoute[]): Record<string, unknown>`.
- Produces: `ROUTE_DEFINITIONS: readonly AnyRoute[]` in `api/routes/index.ts` — **every later task appends its routes here.**
- Produces: `Me` and `toMe(user, role)` in `api/representations/me.ts`; `GET /v1/me` → `{ id, puid, displayName, email, role }`.
- Produces: `pnpm contract:write`.
- Consumes: `ERROR_CODE_LIST`, `MANIFEST_ERROR_CODE_LIST`, `ErrorCode` (Task 5); `UNVERSIONED` (Task 2); `CsrfRefusedError` (Task 4).

- [ ] **Step 1: Write the failing tests**

`packages/control-plane/src/api/contract/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import { randomUUID } from 'node:crypto'
import { resetDatabase } from '../../db/testing.js'
import { buildServer } from '../server.js'
import { loginAs, mutationHeaders, testDeps } from '../testing.js'
import { defineRoute, NO_BODY, NO_QUERY, registerRoutes } from './route.js'
import { representation, request } from './schemas.js'

afterEach(resetDatabase)

// Synthetic routes, registered only in this file's servers — they prove the helper, not a
// resource. Ids are prefixed so they can never collide with a real component.
const Probe = representation('ZzRouteTestProbe', z.object({ id: z.uuid(), name: z.string() }))
const ProbeBody = request('ZzRouteTestProbeBody', z.strictObject({ name: z.string().min(1) }))

let answer: unknown = undefined
const probeGet = defineRoute({
  operationId: 'zzProbeGet',
  method: 'GET',
  path: '/v1/zz-probe/{probeId}',
  tag: 'zz',
  summary: 'probe',
  description: 'probe',
  params: z.strictObject({ probeId: z.uuid() }),
  query: NO_QUERY,
  body: NO_BODY,
  success: { status: 200, description: 'probe', schema: Probe },
  errors: [],
  handler: async ({ params }) => (answer ?? { id: params.probeId, name: 'probe', handle: 'mf-leak' }) as never,
})
const probePost = defineRoute({
  operationId: 'zzProbePost',
  method: 'POST',
  path: '/v1/zz-probe',
  tag: 'zz',
  summary: 'probe',
  description: 'probe',
  params: z.strictObject({}),
  query: NO_QUERY,
  body: ProbeBody,
  success: { status: 201, description: 'probe', schema: Probe },
  errors: [],
  handler: async ({ body }) => ({ id: randomUUID(), name: body.name }),
})

async function server() {
  const deps = await testDeps()
  const app = await buildServer(deps)
  registerRoutes(app, deps, [probeGet, probePost])
  const cookies = await loginAs(deps, 'bio_prof')
  return { deps, app, cookies }
}

describe('defineRoute (P5a Task 6)', () => {
  it('strips every field the representation does not name', async () => {
    answer = undefined
    const { app, cookies } = await server()
    const res = await app.inject({ method: 'GET', url: `/v1/zz-probe/${randomUUID()}`, cookies })
    expect(res.statusCode).toBe(200)
    expect(Object.keys(res.json()).sort()).toEqual(['id', 'name'])
    await app.close()
  })

  it('refuses a malformed path parameter as REQUEST_INVALID, naming it', async () => {
    const { app, cookies } = await server()
    const res = await app.inject({ method: 'GET', url: '/v1/zz-probe/not-a-uuid', cookies })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('REQUEST_INVALID')
    expect(res.json().error.message).toContain('params.probeId')
    await app.close()
  })

  it('refuses a body field the request does not name', async () => {
    const { deps, app, cookies } = await server()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/zz-probe',
      cookies,
      headers: mutationHeaders(deps),
      payload: { name: 'x', nmae: 'typo' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain('nmae')
    await app.close()
  })

  it('answers 401 before it looks at a malformed request from nobody', async () => {
    const { app } = await server()
    const res = await app.inject({ method: 'GET', url: '/v1/zz-probe/not-a-uuid' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('turns a handler that answers the wrong shape into a 500, and tells the operator which operation and field — never the value', async () => {
    answer = { id: randomUUID(), name: 42 }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { app, cookies } = await server()
    const res = await app.inject({ method: 'GET', url: `/v1/zz-probe/${randomUUID()}`, cookies })
    expect(res.statusCode).toBe(500)
    expect(res.json().error.code).toBe('INTERNAL')
    const logged = errors.mock.calls.flat().join('\n')
    expect(logged).toContain('zzProbeGet')
    expect(logged).toContain('name')
    expect(logged).not.toContain('42')
    errors.mockRestore()
    answer = undefined
    await app.close()
  })

  it('replays a mutation’s SHAPED body for the same Idempotency-Key', async () => {
    const { deps, app, cookies } = await server()
    const headers = mutationHeaders(deps)
    const first = await app.inject({ method: 'POST', url: '/v1/zz-probe', cookies, headers, payload: { name: 'x' } })
    const again = await app.inject({ method: 'POST', url: '/v1/zz-probe', cookies, headers, payload: { name: 'x' } })
    expect(first.statusCode).toBe(201)
    expect(again.json()).toEqual(first.json())
    await app.close()
  })
})
```

`packages/control-plane/src/api/contract/document.test.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROUTE_DEFINITIONS } from '../routes/index.js'
import { UNVERSIONED } from '../unversioned.js'
import { openApiDocument } from './document.js'

const DOCUMENT = fileURLToPath(new URL('../../../../contract/openapi.json', import.meta.url))

describe('the OpenAPI document (§16 Contract, D23.8)', () => {
  /**
   * THE DRIFT TEST, and the WRITER (P5a Decision 7). With MANIFEST_CONTRACT_WRITE=1 —
   * `pnpm contract:write` — it writes the document and passes; without, it compares. A CLI
   * would import db/client.ts, which throws without a database URL.
   */
  it('is exactly what the route definitions generate', async () => {
    const generated = `${JSON.stringify(openApiDocument(ROUTE_DEFINITIONS), null, 2)}\n`
    if (process.env.MANIFEST_CONTRACT_WRITE === '1') {
      await writeFile(DOCUMENT, generated)
      return
    }
    const checkedIn = await readFile(DOCUMENT, 'utf8').catch(() => '(missing)')
    const firstDifference = checkedIn.split('\n').findIndex((line, i) => line !== generated.split('\n')[i])
    expect(
      checkedIn === generated,
      `packages/contract/openapi.json is stale from line ${firstDifference + 1} — run \`pnpm contract:write\` and commit it`,
    ).toBe(true)
  })

  it('names every operation once, and every path parameter in its schema', () => {
    const ids = ROUTE_DEFINITIONS.map((r) => r.operationId)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    for (const route of ROUTE_DEFINITIONS) {
      const inPath = [...route.path.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]).sort()
      expect(Object.keys(route.params.shape).sort(), route.operationId).toEqual(inPath)
    }
  })

  it('lists the unversioned endpoints with their reasons, rather than omitting them', () => {
    const document = openApiDocument(ROUTE_DEFINITIONS) as { 'x-manifest-unversioned': unknown[] }
    expect(document['x-manifest-unversioned']).toEqual(UNVERSIONED.map((u) => ({ ...u })))
  })

  it('refuses a representation that is not registered', () => {
    const [first] = ROUTE_DEFINITIONS
    const unregistered = { ...first!, success: { ...first!.success, schema: first!.success.schema.describe('a copy') } }
    expect(() => openApiDocument([unregistered])).toThrow(/not registered/)
  })
})
```

`packages/control-plane/src/api/contract/coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ROUTE_DEFINITIONS } from '../routes/index.js'
import { buildServer } from '../server.js'
import { testDeps } from '../testing.js'
import { fastifyPath } from './route.js'

/**
 * `/v1` routes still registered the old way (P5a Task 6). EACH TASK THAT CONVERTS ONE
 * REMOVES IT, and Task 14 deletes this list. The test is red for a route missing from
 * both, AND for a listed route that is already converted or gone — so the list cannot
 * quietly outlive what it describes.
 */
const UNCONVERTED = [
  'GET /v1/projects',
  'POST /v1/projects',
  'GET /v1/projects/:projectId',
  'GET /v1/projects/:projectId/spec',
  'POST /v1/projects/:projectId/spec',
  'POST /v1/projects/:projectId/members',
  'POST /v1/projects/:projectId/builds',
  'GET /v1/builds/:buildId',
  'GET /v1/builds/:buildId/logs',
  'POST /v1/projects/:projectId/releases',
  'POST /v1/environments/:environmentId/deploy',
  'GET /v1/environments/:environmentId',
  'GET /v1/environments/:environmentId/incidents',
]

/** Documented, never defined: the stream upgrades, and defineRoute answers JSON (Task 12). */
const DOCUMENTED_ONLY = ['GET /v1/projects/:projectId/events']

describe('every /v1 route is a definition (P5a Task 6)', () => {
  it('defines every /v1 route except the ones still listed — and lists nothing stale', async () => {
    const app = await buildServer(await testDeps())
    const defined = new Set(ROUTE_DEFINITIONS.map((r) => `${r.method} ${fastifyPath(r.path)}`))
    const v1 = app.registeredRoutes
      .filter((r) => r.url.startsWith('/v1/'))
      .map((r) => `${r.method} ${r.url}`)
    expect(v1.filter((r) => !defined.has(r) && !UNCONVERTED.includes(r) && !DOCUMENTED_ONLY.includes(r))).toEqual([])
    expect(UNCONVERTED.filter((r) => defined.has(r) || !v1.includes(r))).toEqual([])
    await app.close()
  })
})
```

- [ ] **Step 2: Watch them fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/contract/
```

Expected: FAIL — `route.js`, `schemas.js`, `document.js` and `routes/index.js` do not exist.

- [ ] **Step 3: Move `requireActor` out of the server**

`packages/control-plane/src/api/actor.ts`:

```ts
import type { FastifyRequest } from 'fastify'
import type { Actor } from '../projects/index.js'

export type SessionActor = Actor & { puid: string }

/**
 * Its own file so `api/contract/route.ts` can use it without importing `server.ts`, which
 * imports the route definitions — a cycle that works only until something reads a value
 * at module load (P5a Task 6).
 */
export function requireActor(request: FastifyRequest): SessionActor {
  if (!request.actor) {
    throw Object.assign(new Error('a session is required'), { statusCode: 401 })
  }
  return request.actor
}
```

In `api/server.ts`, delete the function and add `export { requireActor } from './actor.js'` — every existing `import { requireActor } from '../server.js'` keeps working.

- [ ] **Step 4: The schemas module**

`packages/control-plane/src/api/contract/schemas.ts`:

```ts
import { z } from 'zod/v4'
import { ERROR_CODE_LIST, MANIFEST_ERROR_CODE_LIST } from '../error-codes.js'

/**
 * THE TWO REGISTRIES the OpenAPI document is built from (P5a Decisions 1, 5).
 *
 * `representations` hold what the API ANSWERS and are converted with `io: 'output'`;
 * `requests` hold what it ACCEPTS, converted with `io: 'input'`. A schema in both would
 * be emitted twice with two shapes — output objects carry `additionalProperties: false`,
 * input objects do not — so `document.ts` refuses an id registered in both, and a request
 * never embeds a representation.
 *
 * `zod/v4`, the API zod 3.25 ships beside its own (measured P5a Task 1, M1). §7's
 * manifest schema stays on zod 3; never pass a v4 issue to `spec/`.
 */
export const representations = z.registry<{ id: string }>()
export const requests = z.registry<{ id: string }>()

export function representation<T extends z.ZodType>(id: string, schema: T): T {
  representations.add(schema, { id })
  return schema
}

export function request<T extends z.ZodType>(id: string, schema: T): T {
  requests.add(schema, { id })
  return schema
}

export const Uuid = z.uuid()

/** Never a `Date`: `z.date()` has no JSON Schema (Decision 3). Mappers call `toISOString()`. */
export const Timestamp = z.iso.datetime().describe('An instant, ISO 8601 in UTC.')

export const ErrorCodeSchema = representation(
  'ErrorCode',
  z.enum(ERROR_CODE_LIST as unknown as [string, ...string[]]).describe(
    'Every code the API answers with (api/error-codes.ts). Stable: a client switches on it (§20).',
  ),
)

export const ManifestErrorCodeSchema = representation(
  'ManifestErrorCode',
  z.enum(MANIFEST_ERROR_CODE_LIST as unknown as [string, ...string[]]).describe(
    'A code inside `details`: §7 schema, §7 policy, or §25 blueprint compatibility.',
  ),
)

export const ManifestErrorSchema = representation(
  'ManifestError',
  z.object({
    code: ManifestErrorCodeSchema,
    path: z.string().describe('Where in manifest.yaml, dotted: `services.0.type`.'),
    message: z.string(),
    hint: z.string().optional(),
  }),
)

export const ErrorEnvelope = representation(
  'ErrorEnvelope',
  z.object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string().describe('For a person. Never parse it; switch on `code`.'),
      hint: z.string().optional().describe('What to do about it.'),
      details: z.array(ManifestErrorSchema).optional(),
    }),
  }),
)

/** A mutation that takes no fields still takes a JSON object (Decision 4). */
export const EmptyRequest = request('EmptyRequest', z.strictObject({}))
```

- [ ] **Step 5: The route helper**

`packages/control-plane/src/api/contract/route.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod/v4'
import { requireActor, type SessionActor } from '../actor.js'
import type { ErrorCode } from '../error-codes.js'
import type { ServerDeps } from '../server.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type SuccessStatus = 200 | 201 | 202

export interface RouteContext<P, Q, B> {
  deps: ServerDeps
  request: FastifyRequest
  reply: FastifyReply
  /** Every `/v1` route requires a session (P5a); `requireActor` has already run. */
  actor: SessionActor
  params: P
  query: Q
  body: B
}

/**
 * ONE `/v1` route, declared once (P5a Decision 1). `registerRoutes` validates with these
 * schemas and shapes the answer through `success.schema`; `openApiDocument` reads the same
 * object. Nothing else describes a route.
 */
export interface RouteDefinition<
  P extends z.ZodObject,
  Q extends z.ZodObject,
  B extends z.ZodType,
  R extends z.ZodType,
> {
  /** camelCase and unique: it is the generated client's name for this call. */
  operationId: string
  method: HttpMethod
  /** OpenAPI's spelling — `/v1/projects/{projectId}` — converted for Fastify by `fastifyPath`. */
  path: `/v1/${string}`
  tag: string
  summary: string
  description: string
  params: P
  query: Q
  /** `NO_BODY` on a GET; a REGISTERED request schema on a mutation. */
  body: B
  success: { status: SuccessStatus; description: string; schema: R }
  /** Codes this operation can answer beyond the ones every route can (document.ts). */
  errors: readonly ErrorCode[]
  handler: (ctx: RouteContext<z.output<P>, z.output<Q>, z.output<B>>) => Promise<z.input<R>>
}

export type AnyRoute = RouteDefinition<z.ZodObject, z.ZodObject, z.ZodType, z.ZodType>

/** Typed at the call site, erased in the array — a handler's parameter types are contravariant. */
export function defineRoute<
  P extends z.ZodObject,
  Q extends z.ZodObject,
  B extends z.ZodType,
  R extends z.ZodType,
>(route: RouteDefinition<P, Q, B, R>): AnyRoute {
  return route as unknown as AnyRoute
}

export const NO_PARAMS = z.strictObject({})
export const NO_QUERY = z.strictObject({})
export const NO_BODY = z.undefined()

export function fastifyPath(path: string): string {
  return path.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, ':$1')
}

export class RequestValidationError extends Error {
  readonly code = 'REQUEST_INVALID'
  constructor(part: 'params' | 'query' | 'body', issues: readonly { path: string; message: string }[]) {
    super(issues.map((i) => `${part}${i.path === '' ? '' : `.${i.path}`}: ${i.message}`).join('; '))
    this.name = 'RequestValidationError'
  }
}

/**
 * A handler answered something its own representation refuses. A 500 — the CLIENT did
 * nothing wrong — whose message names the operation and the PATHS that failed, never
 * the values: a value here is exactly what the representation exists to keep in.
 */
export class ResponseContractError extends Error {
  constructor(operationId: string, paths: readonly string[]) {
    super(`${operationId} answered a body its representation refuses, at: ${paths.join(', ')}`)
    this.name = 'ResponseContractError'
  }
}

function parsePart<S extends z.ZodType>(
  part: 'params' | 'query' | 'body',
  schema: S,
  value: unknown,
): z.output<S> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  throw new RequestValidationError(
    part,
    result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  )
}

export function registerRoutes(
  app: FastifyInstance,
  deps: ServerDeps,
  routes: readonly AnyRoute[],
): void {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: fastifyPath(route.path),
      handler: async (request, reply) => {
        // Authentication first: nobody learns the shape of a request they may not make.
        const actor = requireActor(request)
        const params = parsePart('params', route.params, request.params ?? {})
        const query = parsePart('query', route.query, request.query ?? {})
        const body = parsePart('body', route.body, route.method === 'GET' ? undefined : (request.body ?? {}))
        const run = async (): Promise<{ status: number; body: unknown }> => {
          const produced = await route.handler({ deps, request, reply, actor, params, query, body })
          // Decision 2: the second read of "what is public". z.object STRIPS unknown keys,
          // so a column a mapper forgot cannot leave; a wrong TYPE is a 500 here rather
          // than a client's surprise.
          const shaped = route.success.schema.safeParse(produced)
          if (!shaped.success) {
            throw new ResponseContractError(
              route.operationId,
              shaped.error.issues.map((i) => i.path.join('.') || '(root)'),
            )
          }
          return { status: route.success.status, body: shaped.data }
        }
        // D23.6 on every mutation, and the stored response is the SHAPED body.
        const result = route.method === 'GET' ? await run() : await app.idempotent(request, run)
        return reply.status(result.status).send(result.body)
      },
    })
  }
}
```

In `api/errors.ts`'s `mapError`, before the `ZodError` branch:

```ts
  // A `/v1` request that its route's own schema refused (P5a Task 6). The zod 3 branch
  // below stays for the routes not yet converted: a v4 error is not a v3 ZodError (M1e).
  if (error instanceof RequestValidationError) {
    return {
      status: 400,
      body: { error: { code: error.code, message: error.message, hint: 'Correct the listed fields and send the request again.' } },
    }
  }
```

- [ ] **Step 6: The document**

`packages/control-plane/src/api/contract/document.ts`:

```ts
import { z } from 'zod/v4'
import type { ErrorCode } from '../error-codes.js'
import { UNVERSIONED } from '../unversioned.js'
import type { AnyRoute } from './route.js'
import { representations, requests } from './schemas.js'

/** `@manifest/contract`'s version too; a test holds them equal from Task 7 (Decision 8). */
export const CONTRACT_VERSION = '0.1.0'

type JsonSchema = Record<string, unknown>

const component = (id: string): string => `#/components/schemas/${id}`

/** Codes EVERY `/v1` operation can answer, and every mutation besides. */
const EVERY_ROUTE: readonly ErrorCode[] = ['UNAUTHENTICATED', 'REQUEST_INVALID', 'INTERNAL']
const EVERY_MUTATION: readonly ErrorCode[] = [
  'CSRF_ORIGIN_REFUSED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
]

/** zod stamps each emitted schema with its own `$schema` and `$id`; a component carries neither. */
function strip(schema: JsonSchema): JsonSchema {
  const { $schema: _schema, $id: _id, ...rest } = schema
  return rest
}

function components(): Record<string, JsonSchema> {
  const out = z.toJSONSchema(representations, { io: 'output', uri: component, unrepresentable: 'throw' }).schemas
  const inp = z.toJSONSchema(requests, { io: 'input', uri: component, unrepresentable: 'throw' }).schemas
  const both = Object.keys(out).filter((id) => id in inp)
  if (both.length > 0) {
    throw new Error(`registered as a representation AND a request: ${both.join(', ')} (P5a Decision 5)`)
  }
  const all = { ...out, ...inp } as Record<string, JsonSchema>
  return Object.fromEntries(Object.keys(all).sort().map((id) => [id, strip(all[id]!)]))
}

function ref(registry: typeof representations, schema: z.ZodType, what: string): JsonSchema {
  const meta = registry.get(schema)
  if (meta === undefined) {
    throw new Error(`${what} is not registered — wrap it in representation() or request() with an id`)
  }
  return { $ref: component(meta.id) }
}

function parameters(route: AnyRoute): JsonSchema[] {
  const list: JsonSchema[] = []
  const add = (where: 'path' | 'query', object: z.ZodObject): void => {
    const schema = z.toJSONSchema(object, { io: 'input', unrepresentable: 'throw' }) as {
      properties?: Record<string, JsonSchema>
      required?: string[]
    }
    for (const name of Object.keys(schema.properties ?? {}).sort()) {
      list.push({
        name,
        in: where,
        required: where === 'path' || (schema.required ?? []).includes(name),
        schema: strip(schema.properties![name]!),
      })
    }
  }
  add('path', route.params)
  add('query', route.query)
  if (route.method !== 'GET') {
    list.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'D23.6. One per user action, reused across retries of THAT action.',
      schema: { type: 'string', minLength: 8 },
    })
  }
  return list
}

/**
 * §16 *Contract*: the OpenAPI 3.1 document, generated from the route definitions and
 * nothing else. Deterministic — paths, methods, parameters and components sorted — so the
 * drift test compares bytes.
 */
export function openApiDocument(routes: readonly AnyRoute[]): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {}
  const ordered = [...routes].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  for (const route of ordered) {
    const codes = [
      ...new Set([...EVERY_ROUTE, ...(route.method === 'GET' ? [] : EVERY_MUTATION), ...route.errors]),
    ].sort()
    const operation: JsonSchema = {
      operationId: route.operationId,
      tags: [route.tag],
      summary: route.summary,
      description: route.description,
      parameters: parameters(route),
      ...(route.method === 'GET'
        ? {}
        : {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: ref(requests, route.body, `${route.operationId}'s body`) } },
            },
          }),
      responses: {
        [String(route.success.status)]: {
          description: route.success.description,
          content: {
            'application/json': {
              schema: ref(representations, route.success.schema, `${route.operationId}'s response`),
            },
          },
        },
        default: {
          description: `An error, in the D23.7 envelope. This operation can answer: ${codes.join(', ')}.`,
          content: { 'application/json': { schema: { $ref: component('ErrorEnvelope') } } },
        },
      },
      'x-manifest-error-codes': codes,
    }
    ;(paths[route.path] ??= {})[route.method.toLowerCase()] = operation
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Manifest',
      version: CONTRACT_VERSION,
      description:
        "Manifest's public API (§22). Generated from the control plane's route definitions; do not edit. " +
        'Resource routes are under /v1 (D23.8); a breaking change is a new prefix beside it. Response ' +
        'objects may gain fields under /v1 — a client ignores fields it does not know. Every mutation ' +
        'carries an Idempotency-Key, and a session-bearing mutation carries Origin (§20).',
    },
    servers: [
      {
        url: 'https://console.manifest.internal',
        description: 'The laptop platform (§21). The console and the API share this origin.',
      },
    ],
    security: [{ session: [] }],
    tags: [...new Set(routes.map((r) => r.tag))].sort().map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'manifest_session',
          description: 'Set by the CWL sign-in at /auth/login (§9). Delegated tokens arrive in P5b.',
        },
      },
      schemas: components(),
    },
    'x-manifest-unversioned': UNVERSIONED.map((u) => ({ ...u })),
  }
}
```

The components include `ZzRouteTest…` only while `route.test.ts` has been imported into the same process — the drift test runs in its own file, so its module graph never loads them. **Check that the written document contains no `ZzRouteTest` component** (Step 9); if it does, Vitest shared a module graph across files and the synthetic schemas move into `route.test.ts`'s own local registry.

- [ ] **Step 7: The first converted route**

`packages/control-plane/src/api/representations/me.ts`:

```ts
import { z } from 'zod/v4'
import type { users } from '../../db/index.js'
import { representation, Uuid } from '../contract/schemas.js'

export const Me = representation(
  'Me',
  z
    .object({
      id: Uuid,
      puid: z.string().describe("The person's ubcEduCwlPuid (§9)."),
      displayName: z.string(),
      email: z.string(),
      role: z.enum(['admin', 'member']).describe('The platform role THIS SESSION is authorized as.'),
    })
    .describe('The person the session belongs to.'),
)

/**
 * The role comes from the SESSION, the rest from the row. Sessions are stateless and carry
 * the role they were issued with (brief §7 item 6), so after `scripts/admin-grant.sh` the
 * row says `admin` and the session says `member` until the person signs in again — and it
 * is the session's role every authorization decision uses. Showing the row's would tell a
 * person they hold a capability their next request will be refused.
 */
export function toMe(user: typeof users.$inferSelect, role: 'admin' | 'member'): z.input<typeof Me> {
  return { id: user.id, puid: user.ubcCwlPuid, displayName: user.displayName, email: user.email, role }
}
```

`packages/control-plane/src/api/routes/me.ts`:

```ts
import { eq } from 'drizzle-orm'
import { users } from '../../db/index.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { Me, toMe } from '../representations/me.js'

export const meRoutes = [
  defineRoute({
    operationId: 'getMe',
    method: 'GET',
    path: '/v1/me',
    tag: 'identity',
    summary: 'The signed-in person',
    description: 'Who this session belongs to, and the platform role it is authorized as. Every client calls it first.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The person.', schema: Me },
    errors: [],
    handler: async ({ deps, actor }) => {
      const [user] = await deps.db.select().from(users).where(eq(users.id, actor.userId))
      // A valid signature over a user who no longer exists: authentication's answer.
      if (user === undefined) throw Object.assign(new Error('a session is required'), { statusCode: 401 })
      return toMe(user, actor.platformRole)
    },
  }),
]
```

`packages/control-plane/src/api/routes/index.ts`:

```ts
import type { AnyRoute } from '../contract/route.js'
import { meRoutes } from './me.js'

/**
 * EVERY `/v1` ROUTE (P5a Decision 1). `server.ts` registers this array and
 * `api/contract/document.test.ts` writes the OpenAPI document from it; a route defined
 * and not listed here exists nowhere. Each P5a task appends its own.
 */
export const ROUTE_DEFINITIONS: readonly AnyRoute[] = [...meRoutes]
```

In `api/server.ts`, directly before `await registerAuthRoutes(app, deps)`: `registerRoutes(app, deps, ROUTE_DEFINITIONS)`. In `api/routes/auth.ts`, delete the `app.get('/v1/me', …)` handler. `auth.test.ts`'s `/v1/me` assertions change from `{ puid, role }` to include `displayName` and `email`.

- [ ] **Step 8: Write the document, and run the suite**

Root `package.json` scripts gain:

```json
    "contract:write": "MANIFEST_CONTRACT_WRITE=1 vitest run --project unit src/api/contract/document.test.ts"
```

`.prettierignore` gains `packages/contract/openapi.json` with a comment: *generated by `pnpm contract:write`; its drift test compares bytes (P5a Decision 9)*.

```bash
cd /Users/rich/Developer/manifest
mkdir -p packages/contract
pnpm contract:write
pnpm exec vitest run --project unit src/api/contract/
pnpm test && pnpm test
```

Expected: `contract/` 11 passed. `packages/contract/openapi.json` exists.

- [ ] **Step 9: Read the document — the shape of the answer, not that it was written**

```bash
cd /Users/rich/Developer/manifest
node -e '
const d = require("./packages/contract/openapi.json")
console.log("openapi", d.openapi, "version", d.info.version)
console.log("paths", Object.keys(d.paths))
console.log("components", Object.keys(d.components.schemas))
console.log("getMe 200", JSON.stringify(d.paths["/v1/me"].get.responses["200"]))
console.log("Me", JSON.stringify(d.components.schemas.Me))
console.log("any $schema or $id left:", JSON.stringify(d).includes("\"$schema\"") || JSON.stringify(d).includes("\"$id\""))
console.log("any test component:", Object.keys(d.components.schemas).some((k) => k.startsWith("Zz")))
'
```

Expected: `3.1.0`, `0.1.0`; paths `['/v1/me']`; components `EmptyRequest, ErrorCode, ErrorEnvelope, ManifestError, ManifestErrorCode, Me`; the 200 `$ref`s `#/components/schemas/Me`; `Me` has `required` naming all five and `additionalProperties: false`; both `any …` lines `false`.

- [ ] **Step 10: Gates and commit**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
git add package.json .prettierignore packages/contract/openapi.json packages/control-plane/src/api
git commit -m "feat(contract): defineRoute, the OpenAPI document generated from it, and GET /v1/me as its first route"
```

- [ ] **Step 11: Negative controls — after the commit**

| | Break | Expect red | Then |
|---|---|---|---|
| a | add `locale: z.string().optional()` to `Me` and do **not** re-run `contract:write` | `document.test.ts` *is exactly what the route definitions generate*, naming the first stale line | `git checkout` the file |
| b | in `registerRoutes`, send `produced` instead of `shaped.data` | `route.test.ts` *strips every field* (`handle` present) — and *the wrong shape* (200) | `git checkout packages/control-plane/src/api/contract/route.ts` |
| c | `z.object` → `z.looseObject` in the test's `Probe` | *strips every field* — the parse is only a control while the object strips | `git checkout` the test |
| d | in `server.ts`, `app.get('/v1/zz', async () => ({}))` beside `registerRoutes` | `coverage.test.ts` lists `GET /v1/zz`; `versioning.test.ts` stays green, which is right | `git checkout packages/control-plane/src/api/server.ts` |
| e | delete `'GET /v1/projects'` from `UNCONVERTED` | `coverage.test.ts`, first expectation | `git checkout` the test |
| f | leave `'GET /v1/me'` in `UNCONVERTED` (add it) | `coverage.test.ts`, the stale-entry expectation | as (e) |

---

## Task 7: The generated client, and its first caller — **the network-on sitting**

> **EXECUTED 2026-09-16 (sitting 5), `97f6be4`, with `917dd5f` after it.** What runs differs from the text below in these places, each measured: **`scripts/demo-journey.sh` no longer sends each package's build to `/dev/null`** — `tsc` writes its errors to stdout, so a journey that did not type-check ended at `make: *** [demo-journey] Error 2` with nothing saying why; the build is quiet on success and prints `tsc`'s output and the reason on failure (`917dd5f`, control (e)); **Step 9's row (e) is wrong in a good way** — `pnpm typecheck` is not the only check that sees `me.cwlPuid`, because `make demo-journey`'s own build refuses it first; the script has **sitting 2's corrections** — `NODE_EXTRA_CA_CERTS="$CA"` before `node`, step 0 copied from `scripts/demo.sh` with the status — and **`main.ts` prints a thrown error's `cause.code`**, which the correction asked for and the code below lacks (control (g) reads `[cause UNABLE_TO_GET_ISSUER_CERT_LOCALLY] TypeError: fetch failed`); **the `Makefile` target is `demo-journey: up  ## …`**, the house style every demo uses, so it brings the platform up and `make help` lists it. **Neither `add` printed an ignored-build-scripts error** — `allowBuilds` is unchanged — and **`pnpm audit --filter @manifest/contract` does not scope to the package**: its 7 advisories are the workspace's own `vitest` 2.1.9 toolchain, none in the new closure.

**Why alone, and why now.** This task adds the only dependencies P5a adds, which needs the network, and it gives the contract a caller before the contract grows: from here on every task that adds a route adds a step to the journey that calls it through the client, **through the edge**. A client whose first caller is a unit test is the module-with-no-caller defect this project has shipped four times (brief §8).

> **Sitting 2 correction (2026-09-16) — a NODE process does not trust the platform CA unless it is told to, and the journey is one.** Since Task 3 every call is `https://console.manifest.internal`, and Node reads neither the macOS keychain (S7) nor `.env`: measured the same day, `fetch('https://console.manifest.internal/v1/me')` from a shell without `NODE_EXTRA_CA_CERTS` failed with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, which global `fetch` reports only as `fetch failed`. It stopped the demos' event-stream watcher (fixed by passing `NODE_EXTRA_CA_CERTS="$CA"`) and S6 probe 15's host control inside `pnpm test:docker` (fixed by passing `ca`). **So Step 7's `scripts/demo-journey.sh` line `MANIFEST_ORIGIN="$ORIGIN" MANIFEST_SESSION="$SESSION" node packages/journey/dist/main.js …` needs `NODE_EXTRA_CA_CERTS="$CA"` in front of it**, and a journey failure that says only `fetch failed` should print `error.cause.code`. `openapi-fetch` calls the global `fetch`, so the client needs nothing. The step 0 block the demos now use also writes the status (`curl -sS -m 5 -w ' [%{http_code}]' …`), because Caddy's 502 for a stopped control plane has no body — copy it from `scripts/demo.sh`, not from Step 7's snippet.

**Files:**
- Create: `packages/contract/package.json`, `packages/contract/tsconfig.json`, `packages/contract/README.md`
- Create: `packages/contract/src/schema.d.ts` (generated), `src/errors.ts`, `src/client.ts`, `src/index.ts`
- Create: `packages/contract/src/client.test.ts`
- Create: `packages/journey/package.json`, `packages/journey/tsconfig.json`
- Create: `packages/journey/src/main.ts`, `src/check.ts`, `src/state.ts`, `src/boundary.test.ts`
- Create: `scripts/demo-journey.sh`
- Modify: `Makefile` (`demo-journey`), `package.json` (`test`, `typecheck`, `contract:generate`), `vitest.workspace.ts` (the `packages` project), `eslint.config.js` (the journey's boundary; ignore `schema.d.ts`), `.prettierignore` (`schema.d.ts`), `pnpm-lock.yaml`, `pnpm-workspace.yaml` (only if an install script needs allowing)
- Modify: `packages/control-plane/src/api/contract/document.test.ts` (the version equals the package's)
- Modify: `CLAUDE.md`, `README.md`, `docs/superpowers/ORIENTATION.md` (§2's box, §6), `docs/superpowers/RUNBOOK.md` — the typecheck gate is `pnpm typecheck`

**Interfaces:**
- Produces: `@manifest/contract` — `createManifestClient(options: { origin: string; session?: string; fetch?: typeof fetch }): ManifestClient`, `type ManifestClient = Client<paths>`, `unwrap<T>(result, operation: string): T`, `idempotencyKey(): string`, `ManifestApiError` (`status`, `code`, `envelope`, `operation`), `type Schemas = components['schemas']`, `type paths`, `SESSION_COOKIE`.
- Produces: `@manifest/journey` — `node packages/journey/dist/main.js <before-app|after-app> <state.json>`, reading `MANIFEST_ORIGIN` and `MANIFEST_SESSION` (and, from Task 16, `MANIFEST_ADMIN_SESSION`); `Checks` (`step`, `ok`, `must`, `finish`) in `src/check.ts`; `readState`/`writeState` in `src/state.ts`.
- Produces: `make demo-journey` — signs in through the edge, runs `before-app`, and (from Task 14) step 6 in the app and `after-app`.
- Produces: `pnpm contract:generate`; `pnpm typecheck` (all packages); `pnpm test` runs projects `unit` and `packages`.
- Consumes: `packages/contract/openapi.json` and `CONTRACT_VERSION` (Task 6); `scripts/lib/api.sh`'s `ORIGIN` (Task 3); `infra/lib/idp-login.sh` (Task 4's `RelayState`).

- [ ] **Step 1: Turn the network on, snapshot, and add the dependencies**

```bash
cd /Users/rich/Developer/manifest
./scripts/snapshot-machine.sh > /tmp/p5a-s5-before.txt
```

`packages/contract/package.json`:

```json
{
  "name": "@manifest/contract",
  "version": "0.1.0",
  "description": "Manifest's public API: the OpenAPI document generated from the control plane's routes, and a TypeScript client generated from that document.",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./dist/index.js" },
    "./openapi.json": "./openapi.json"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "generate": "openapi-typescript openapi.json --output src/schema.d.ts"
  }
}
```

`packages/journey/package.json`:

```json
{
  "name": "@manifest/journey",
  "version": "0.0.0",
  "description": "§22's journey, driven through the edge by nothing but @manifest/contract — P5a's acceptance.",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@manifest/contract": "workspace:*"
  }
}
```

```bash
cd /Users/rich/Developer/manifest
pnpm --filter @manifest/contract add --save-exact openapi-fetch@0.17.0
pnpm --filter @manifest/contract add --save-exact --save-dev openapi-typescript@7.13.0
pnpm install
git diff --stat pnpm-lock.yaml
```

**Measure, and record the answers:** does either `add` print an *ignored build scripts* error (pnpm 11's hard error, ORIENTATION §4)? If it does, that package's install script is a supply-chain decision: read what it runs, and only then `pnpm approve-builds <pkg>` with its reason written beside it in `pnpm-workspace.yaml`. Record the resolved closure (`pnpm --filter @manifest/contract list --depth 1`) and `pnpm audit --prod --filter @manifest/contract` — the control plane's own tree is scanned by nothing (ORIENTATION §8), and this adds to it.

- [ ] **Step 2: Generate the types, and read them**

`packages/contract/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src"]
}
```

```bash
cd /Users/rich/Developer/manifest
pnpm --filter @manifest/contract generate
sed -n '1,40p' packages/contract/src/schema.d.ts
grep -n "getMe\|Me: {" packages/contract/src/schema.d.ts
```

Expected: a banner comment, `export interface paths` with `"/v1/me"`, `export interface components` whose `schemas.Me` has the five fields and whose `schemas.ErrorCode` is a union of string literals. **If the `ErrorCode` union is `string`**, the enum did not survive generation — record it, because every client's `switch` on a code depends on it.

- [ ] **Step 3: Write the failing client tests**

`packages/contract/src/client.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import openapiTS, { astToString } from 'openapi-typescript'
import { describe, expect, it } from 'vitest'
import { createManifestClient, ManifestApiError, unwrap } from './index.js'

/** The generated file without the banner the CLI puts above it. */
const body = (text: string) => text.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')

describe('@manifest/contract', () => {
  it('holds exactly the types the checked-in document generates — `pnpm contract:generate` if not', async () => {
    const generated = astToString(await openapiTS(new URL('../openapi.json', import.meta.url)))
    const checkedIn = await readFile(new URL('./schema.d.ts', import.meta.url), 'utf8')
    expect(body(checkedIn) === body(generated), 'src/schema.d.ts is stale — run `pnpm contract:generate`').toBe(true)
  })

  it('is the version the document says it is', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    const document = JSON.parse(await readFile(new URL('../openapi.json', import.meta.url), 'utf8')) as { info: { version: string } }
    // The document's own version is held to CONTRACT_VERSION by the control plane's drift
    // test, so package = document is the whole chain without importing the control plane.
    expect(pkg.version).toBe(document.info.version)
  })

  it('sends the session and the origin a non-browser client must, and reads the envelope on failure', async () => {
    const seen: Record<string, string | undefined>[] = []
    const server = http.createServer((req, res) => {
      seen.push({ cookie: req.headers.cookie, origin: req.headers.origin })
      if (req.headers.cookie === 'manifest_session=good') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ id: '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f', puid: 'ins000001', displayName: 'Test Instructor', email: 'instructor@ubc.ca', role: 'member' }))
      } else {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'a session is required', hint: 'Log in first.' } }))
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`

    const me = unwrap(await createManifestClient({ origin, session: 'good' }).GET('/v1/me'), 'getMe')
    expect(me.puid).toBe('ins000001')
    expect(seen[0]).toEqual({ cookie: 'manifest_session=good', origin })

    const refused = await createManifestClient({ origin, session: 'bad' }).GET('/v1/me')
    expect(() => unwrap(refused, 'getMe')).toThrow(ManifestApiError)
    try {
      unwrap(refused, 'getMe')
    } catch (error) {
      expect((error as ManifestApiError).status).toBe(401)
      expect((error as ManifestApiError).code).toBe('UNAUTHENTICATED')
    }
    server.close()
  })
})
```

In `packages/control-plane/src/api/contract/document.test.ts`, add:

```ts
  it('versions the document and @manifest/contract together (Decision 8)', async () => {
    const pkg = JSON.parse(await readFile(fileURLToPath(new URL('../../../../contract/package.json', import.meta.url)), 'utf8')) as { version: string }
    expect(pkg.version).toBe(CONTRACT_VERSION)
  })
```

(importing `CONTRACT_VERSION` from `./document.js`).

Root `vitest.workspace.ts` gains a third project:

```ts
  {
    // P5a Task 7. The client and the journey: no Postgres, no Docker, no setup file.
    test: {
      name: 'packages',
      root: '.',
      include: ['packages/contract/src/**/*.test.ts', 'packages/journey/src/**/*.test.ts'],
    },
  },
```

and root `package.json`'s scripts:

```json
    "test": "vitest run --project unit --project packages",
    "typecheck": "pnpm -r typecheck",
    "contract:generate": "pnpm --filter @manifest/contract generate",
```

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project packages
```

Expected: FAIL — `./index.js` does not exist.

- [ ] **Step 4: Write the client**

`packages/contract/src/errors.ts`:

```ts
import type { components } from './schema.js'

export type ErrorEnvelope = components['schemas']['ErrorEnvelope']
export type ErrorCode = components['schemas']['ErrorCode']

/**
 * A refusal, carrying the D23.7 envelope (§20: a stable code and a hint). `code` is what a
 * client switches on; `UNPARSEABLE` means the body was not an envelope at all — Caddy's
 * empty 502 when the control plane is down, or the edge's refusal from an app network.
 */
export class ManifestApiError extends Error {
  readonly code: ErrorCode | 'UNPARSEABLE'
  constructor(
    readonly status: number,
    readonly envelope: ErrorEnvelope | undefined,
    readonly operation: string,
  ) {
    super(
      envelope?.error === undefined
        ? `${operation} failed with ${status} and no error envelope`
        : `${operation} failed with ${status} ${envelope.error.code}: ${envelope.error.message}`,
    )
    this.name = 'ManifestApiError'
    this.code = envelope?.error?.code ?? 'UNPARSEABLE'
  }
}
```

`packages/contract/src/client.ts`:

```ts
import createClient, { type Client } from 'openapi-fetch'
import type { components, paths } from './schema.js'
import { ManifestApiError, type ErrorEnvelope } from './errors.js'

export const SESSION_COOKIE = 'manifest_session'

export type Schemas = components['schemas']
export type ManifestClient = Client<paths>

export interface ManifestClientOptions {
  /** The console's origin — `https://console.manifest.internal` on a laptop. No path. */
  origin: string
  /**
   * The `manifest_session` cookie's VALUE, for a client that is not a browser. A browser
   * sends its own cookie and its own Origin, and may set neither; P5b adds a token here.
   */
  session?: string
  fetch?: typeof globalThis.fetch
}

const inBrowser = typeof (globalThis as { document?: unknown }).document !== 'undefined'

/**
 * `openapi-fetch` over the generated `paths` (Rich, 2026-09-16), plus the two headers a
 * non-browser client owes the API: the session, and §20's Origin — Node sends none unless
 * told (P5a Task 1, M5), and a session-bearing mutation without it is refused.
 *
 * Idempotency-Key is NOT added here. The document makes it a required header parameter of
 * every mutation, so the generated types make each call site supply one — and a key made
 * per call would defeat D23.6, whose whole point is that a RETRY reuses it.
 */
export function createManifestClient(options: ManifestClientOptions): ManifestClient {
  const origin = new URL(options.origin).origin
  return createClient<paths>({
    baseUrl: origin,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(inBrowser
      ? {}
      : {
          headers: {
            origin,
            ...(options.session === undefined ? {} : { cookie: `${SESSION_COOKIE}=${options.session}` }),
          },
        }),
  })
}

/** One per user action; reuse it when retrying that action (D23.6). */
export function idempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}

/** The data of a successful call, or a `ManifestApiError` carrying the envelope. */
export function unwrap<T>(
  result: { data?: T; error?: unknown; response: Response },
  operation: string,
): T {
  if (result.error !== undefined || !result.response.ok) {
    const envelope =
      typeof result.error === 'object' && result.error !== null && 'error' in result.error
        ? (result.error as ErrorEnvelope)
        : undefined
    throw new ManifestApiError(result.response.status, envelope, operation)
  }
  return result.data as T
}
```

`packages/contract/src/index.ts`:

```ts
export { createManifestClient, idempotencyKey, SESSION_COOKIE, unwrap } from './client.js'
export type { ManifestClient, ManifestClientOptions, Schemas } from './client.js'
export { ManifestApiError } from './errors.js'
export type { ErrorCode, ErrorEnvelope } from './errors.js'
export type { components, paths } from './schema.js'
```

`packages/contract/README.md` — what the package is (the document and the client generated from it; the console, the journey and, in Phase 3, `mcp/` may import nothing else — §22); **how it is regenerated** (`pnpm contract:write` then `pnpm contract:generate`, both checked in, both guarded by drift tests); **the version policy** (Decision 8: `/v1` is the major; `info.version` and this package's version move together; `1.0.0` when P5c's console has proved it); **the two headers** a non-browser client sends and why; that `Idempotency-Key` is supplied per call; and that it states no status.

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project packages
pnpm --filter @manifest/contract typecheck
```

Expected: 3 passed; typecheck clean.

- [ ] **Step 5: Write the journey's skeleton, calling step 1**

`packages/journey/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`packages/journey/src/check.ts`:

```ts
/**
 * The journey's assertions. EVERY check runs and prints `ok` or `FAIL`, and the run
 * exits 1 at the end listing each failure — a red run is a measurement, not the first
 * thing that broke (P4c Decision 26). `must` is the exception: a check whose failure makes
 * every later step meaningless records itself and stops the phase.
 */
export class JourneyStop extends Error {}

export class Checks {
  readonly failures: string[] = []

  step(title: string): void {
    console.log(`\n${title}`)
  }

  ok(name: string, passed: boolean, detail = ''): boolean {
    console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${name}${passed || detail === '' ? '' : ` — ${detail.slice(0, 400)}`}`)
    if (!passed) this.failures.push(name)
    return passed
  }

  must<T>(name: string, value: T | undefined | null, detail = ''): T {
    if (!this.ok(name, value !== undefined && value !== null, detail)) throw new JourneyStop(name)
    return value as T
  }

  finish(): never {
    if (this.failures.length > 0) {
      console.log(`\n${this.failures.length} FAILED:\n  ${this.failures.join('\n  ')}`)
      process.exit(1)
    }
    console.log('\nevery check passed')
    process.exit(0)
  }
}
```

`packages/journey/src/state.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs'

/**
 * What one phase hands the next, through `scripts/demo-journey.sh`, which runs step 6 in
 * the deployed app between them. A file, not environment variables: bash reads it with
 * `field`, and a phase that crashed leaves what it had.
 */
export interface JourneyState {
  projectId?: string
  projectSlug?: string
  stagingEnvironmentId?: string
  productionEnvironmentId?: string
  appUrl?: string
  buildId?: string
  releaseId?: string
  instanceId?: string
}

export function readState(path: string): JourneyState {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JourneyState
  } catch {
    return {}
  }
}

export function writeState(path: string, state: JourneyState): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
}
```

`packages/journey/src/main.ts`:

```ts
import { createManifestClient, ManifestApiError, unwrap } from '@manifest/contract'
import { Checks, JourneyStop } from './check.js'
import { readState, writeState, type JourneyState } from './state.js'

/**
 * §22's journey, through the edge, by nothing but the generated client (P5a's acceptance).
 *
 *   node packages/journey/dist/main.js <before-app|after-app> <state.json>
 *
 * Reads MANIFEST_ORIGIN (default the console's) and MANIFEST_SESSION — the instructor's
 * session, which `scripts/demo-journey.sh` obtained through the one CWL flow. Each P5a task
 * that adds a route adds the step that calls it.
 */
const [phase, statePath] = process.argv.slice(2)
const origin = process.env.MANIFEST_ORIGIN ?? 'https://console.manifest.internal'
const session = process.env.MANIFEST_SESSION
if ((phase !== 'before-app' && phase !== 'after-app') || statePath === undefined || session === undefined) {
  console.error('usage: MANIFEST_SESSION=… main.js <before-app|after-app> <state.json>')
  process.exit(2)
}

const client = createManifestClient({ origin, session })
const checks = new Checks()
const state: JourneyState = readState(statePath)

/** §22 step 1 — the sign-in happened in bash; this proves the session is the instructor's. */
async function step1SignedIn(): Promise<void> {
  checks.step('1. Signed in with CWL, through the edge')
  const me = unwrap(await client.GET('/v1/me'), 'getMe')
  checks.ok('GET /v1/me is the instructor', me.puid === 'ins000001', JSON.stringify(me))
  checks.ok(
    'and carries exactly the fields the contract names',
    Object.keys(me).sort().join(',') === 'displayName,email,id,puid,role',
    Object.keys(me).join(','),
  )
}

const phases: Record<'before-app' | 'after-app', (() => Promise<void>)[]> = {
  'before-app': [step1SignedIn],
  'after-app': [],
}

try {
  for (const step of phases[phase]) await step()
} catch (error) {
  if (error instanceof ManifestApiError) checks.ok(`no call refused (${error.operation})`, false, error.message)
  else if (!(error instanceof JourneyStop)) checks.ok('no step threw', false, (error as Error).stack ?? String(error))
} finally {
  writeState(statePath, state)
}
checks.finish()
```

- [ ] **Step 6: The journey's import boundary — a test and a lint rule, each watched failing**

`packages/journey/src/boundary.test.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/**
 * §22 and §16 *API completeness*: a client of the contract imports the contract and
 * nothing else. Written for the journey first, so P5c's console inherits a boundary that
 * has been watched failing (P5a Task 7). Test files are not the client and are not read.
 */
describe('the journey’s imports (§22, §16 API completeness)', () => {
  it('are @manifest/contract, node: builtins and its own files — nothing else', async () => {
    const violations: string[] = []
    for (const name of await readdir(SRC)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
      const file = join(SRC, name)
      const text = await readFile(file, 'utf8')
      for (const m of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g)) {
        const spec = m[1]!
        if (spec === '@manifest/contract' || spec.startsWith('node:')) continue
        if (spec.startsWith('./') && dirname(resolve(dirname(file), spec)) === resolve(SRC)) continue
        violations.push(`${relative(SRC, file)}: ${spec}`)
      }
    }
    expect(violations).toEqual([])
  })
})
```

`eslint.config.js` — add `'packages/contract/src/schema.d.ts'` to the top-level `ignores`, and a block after the control plane's:

```js
  {
    // §22 and §16 API completeness (P5a Task 7): the journey is a client of the contract
    // and may import nothing else. The TEST in packages/journey/src/boundary.test.ts is the
    // other half; each was watched failing. `regex`, not `group`: the gitignore dialect
    // cannot say "only these" (see the control plane's note above).
    files: ['packages/journey/src/**/*.ts'],
    ignores: ['packages/journey/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!@manifest/contract$|node:|\\./)',
              message: 'The journey may import only @manifest/contract, node: builtins and its own ./ files (§22).',
            },
          ],
        },
      ],
    },
  },
```

`.prettierignore` gains `packages/contract/src/schema.d.ts` (Decision 9).

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project packages
pnpm lint
pnpm typecheck
```

Expected: 4 passed; lint and typecheck clean. **If ESLint rejects `regex`** (its support arrived during ESLint 9), record the version (`pnpm exec eslint --version`) and use `paths`/`patterns.group` forms that it accepts — the TEST is the boundary's first read either way, and Step 9's controls say whether the lint rule is a second.

- [ ] **Step 7: `make demo-journey`, at step 1**

`scripts/demo-journey.sh`:

```bash
#!/usr/bin/env bash
# P5a's ACCEPTANCE: §22's journey, through the edge at https://console.manifest.internal,
# driven by a script that uses nothing but the generated client (@manifest/contract),
# signed in with a real CWL session. Grows one step per P5a task; Task 17 makes it green.
#
# THE SPLIT, and why (P5a Decision 38). Signing in is the browser's and the IdP's
# business, outside the versioned contract (D23.8), so it goes through THE one flow,
# infra/lib/idp-login.sh. Everything Manifest's API does is packages/journey — TypeScript,
# checked by tsc against the generated types. Step 6 — inside the deployed app — is the
# app's API, not Manifest's, and is curl for the same reason.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`,
# no `xargs -r`, no `readlink -f`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# shellcheck source=./lib/api.sh
. scripts/lib/api.sh

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

CA="$ROOT/$CA_FILE"
WORK="$(mktemp -d -t manifest-journey)"
trap 'rm -rf "$WORK"' EXIT
CP_JAR="$WORK/instructor.jar"
IDP_JAR="$WORK/instructor-idp.jar"
STATE="$WORK/state.json"

# The session's VALUE out of a curl jar (Netscape format, tab-separated).
session_of() { awk -F'\t' 'NF==7 && $6=="manifest_session" {print $7}' "$1"; }

say "0. The client and the journey, built from the checked-in document"
pnpm --filter @manifest/contract build >/dev/null
pnpm --filter @manifest/journey build >/dev/null
echo "  built"

say "0. Is the control plane up, through the edge?"
UP="$(curl -sS -m 5 "$API/v1/me" 2>&1 || true)"
case "$UP" in
  *'"UNAUTHENTICATED"'*) echo "  $API answered" ;;
  *) fail "no control plane behind $API (got: ${UP:0:120}). README's 'Running the control plane'." ;;
esac

say "1. Sign in to Manifest with CWL, through the edge"
idp_login "$CP_JAR" "$IDP_JAR" "$ORIGIN/auth/login" instructor instructor \
  "$ORIGIN/auth/saml/callback" "$CA"
SESSION="$(session_of "$CP_JAR")"
[ -n "$SESSION" ] || fail "the sign-in left no manifest_session cookie"

say "The journey, through @manifest/contract"
MANIFEST_ORIGIN="$ORIGIN" MANIFEST_SESSION="$SESSION" \
  node packages/journey/dist/main.js before-app "$STATE"
```

`Makefile`: `demo-journey` beside `demo-redeploy`, in `.PHONY`, with the same one-line comment style:

```make
# P5a's acceptance: §22's journey through the edge, by nothing but the generated client.
demo-journey:
	@bash scripts/demo-journey.sh
```

```bash
cd /Users/rich/Developer/manifest
# the control plane running, as README says
make demo-journey
```

Expected: steps 0 and 1 `ok`, `every check passed`, exit 0.

- [ ] **Step 8: The gate is `pnpm typecheck` now — say so everywhere**

```bash
cd /Users/rich/Developer/manifest
grep -rn "filter @manifest/control-plane typecheck" CLAUDE.md README.md docs/superpowers/ORIENTATION.md docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md
```

Every hit that states **the gate** becomes `pnpm typecheck`; a dated record of what a sitting ran stays as it was. ORIENTATION §2's numbers box gains the `packages` project in the `pnpm test` line (its file count moves), and §6's gate list says `pnpm typecheck`.

- [ ] **Step 9: Gates, machine, commit — then the controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
./scripts/snapshot-machine.sh > /tmp/p5a-s5-after.txt && diff /tmp/p5a-s5-before.txt /tmp/p5a-s5-after.txt
git add -A packages/contract packages/journey scripts/demo-journey.sh Makefile package.json pnpm-lock.yaml pnpm-workspace.yaml \
  vitest.workspace.ts eslint.config.js .prettierignore packages/control-plane/src/api/contract CLAUDE.md README.md docs/superpowers
git commit -m "feat(contract): @manifest/contract generated with openapi-typescript + openapi-fetch, and the journey as its first caller"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | in `packages/contract/openapi.json`, rename `displayName` to `name` in `Me` by hand | `client.test.ts` *holds exactly the types the checked-in document generates* **and** the control plane's drift test | `git checkout packages/contract/openapi.json` |
| b | `"version": "0.1.1"` in `packages/contract/package.json` | *is the version the document says it is*, and `document.test.ts`'s version test | `git checkout` the file |
| c | in `packages/journey/src/main.ts`, `import { users } from '../../control-plane/src/db/index.js'` (unused) | `boundary.test.ts` lists it; `pnpm lint` reports it | `git checkout` the file |
| d | as (c), but only lint — delete the eslint block | `boundary.test.ts` still red: the two halves are independent | `git checkout eslint.config.js` |
| e | in `main.ts`, `me.puid === 'ins000001'` → `me.cwlPuid === 'ins000001'` | `pnpm typecheck` (`Property 'cwlPuid' does not exist`) — **the only check that sees it**: Vitest would not, and the journey would fail at run time | `git checkout` the file |
| f | in `client.ts`, drop the `origin` header | `client.test.ts` *sends the session and the origin*; with the control plane running, `make demo-journey` still passes step 1 — **a GET is not asked for an Origin** — and Task 11's first mutation is where the journey would see it | `git checkout` the file |

---
## Task 8: Projects, environments, members and specs as public representations

> **EXECUTED 2026-09-16 (sitting 6), `ba1dda5`, with `4a1d8cd` after it.** What runs differs from the text below in these places, each measured: **the authorization contract suite asserts each refusal's CODE, not only its status** — Step 2's *"the two new rows fail for every actor"* was 8 of 10, because a stranger's `404` passed on both rows against routes that did not exist yet (`404 ROUTE_NOT_FOUND`); **the enum values come from the database's own enums** (`instanceState.enumValues`, `instanceKind`, `environmentKind`, `memberRole`) rather than the literal `STATES` list below; `listProjects` uses `NO_PARAMS`; the journey's check also refuses `blueprintRef`; and **`isSensitiveDiff` no longer reports every re-validation of a manifest with a service as a sensitive change** (`4a1d8cd`) — zod emits `{type, version, name}`, jsonb hands back `{name, type, version}`. `?expand=` takes exactly `environments`; the old handler accepted a comma list and ignored names it did not know.

**What changes for a client.** Every read of a project, its environments, its members and its spec answers a representation instead of a row: `quota`, `visibility`, `published`, `forkedFrom` and `ownerId` stop leaving, an `Instance` stops carrying `driver` and `handle` (Decision 23), and two reads that the journey and a console need and that did not exist are added — an environment list and a member list. `GET /v1/projects` becomes the caller's memberships for everyone, administrators included (Decision 20). `POST /v1/projects` is Task 11's.

**Files:**
- Create: `packages/control-plane/src/api/representations/projects.ts` (`Audience`, `UserSummary`, `Project`, `ProjectList`)
- Create: `packages/control-plane/src/api/representations/environments.ts` (`Environment`, `EnvironmentList`)
- Create: `packages/control-plane/src/api/representations/instances.ts` (`Instance`, `toInstance`)
- Create: `packages/control-plane/src/api/representations/members.ts` (`Member`, `MemberList`, `AddMemberRequest`)
- Create: `packages/control-plane/src/api/representations/specs.ts` (`Spec`, `SpecValidation`, `SensitiveDiff`, `ValidateSpecRequest`)
- Create: `packages/control-plane/src/api/routes/project-reads.ts` (the eight definitions)
- Modify: `packages/control-plane/src/api/routes/projects.ts` (only `POST /v1/projects` remains in it), `routes/delivery.ts` (`GET /v1/environments/:environmentId` removed), `routes/index.ts`
- Modify: `packages/control-plane/src/projects/repository.ts` (`listProjectsFor` without the admin branch; `projectViews`, `listMembers`, `servingInstanceOf`)
- Modify: `packages/control-plane/src/projects/repository.test.ts`, `api/projects.test.ts`, `api/delivery.test.ts`, `api/authz-contract.ts`, `api/contract/coverage.test.ts`, `api/error-codes.ts`
- Modify: `packages/journey/src/main.ts`; `packages/contract/openapi.json`, `packages/contract/src/schema.d.ts` (regenerated)

**Interfaces:**
- Produces: `GET /v1/projects` (`listProjects` → `Project[]`), `GET /v1/projects/{projectId}` (`getProject`, `?expand=environments` → `Project`), `GET /v1/projects/{projectId}/environments` (`listEnvironments` → `Environment[]`), `GET /v1/environments/{environmentId}` (`getEnvironment` → `Environment`), `GET /v1/projects/{projectId}/members` (`listMembers` → `Member[]`), `POST /v1/projects/{projectId}/members` (`addMember` → 201 `Member`), `GET /v1/projects/{projectId}/spec` (`getSpec` → `Spec`), `POST /v1/projects/{projectId}/spec` (`validateSpec` → 201 `SpecValidation`).
- Produces, in `projects/repository.ts`: `interface ProjectView { project: Project; owner: { id: string; displayName: string } }`, `projectViews(db, projectIds: readonly string[]): Promise<ProjectView[]>`, `listMembers(db, projectId): Promise<MemberRow[]>` where `MemberRow = { userId; puid; displayName; email; role }`, `servingInstanceOf(db, environment: Environment): Promise<InstanceRow | undefined>` (the Route record's instance, else the newest row — P4c's rule, moved).
- Produces: representation mappers `toProject(view, environments?)`, `toEnvironment(row, instance)`, `toInstance(row)`, `toMember(row)`.
- Consumes: `defineRoute`, `representation`, `request`, `Uuid`, `Timestamp`, `ManifestErrorSchema` (Task 6); `mutationHeaders` (Task 4).

- [ ] **Step 1: Write the failing tests**

In `packages/control-plane/src/api/projects.test.ts`, a new describe block (its `server()` helper follows the file's existing pattern — `testDeps`, `buildServer`, `loginAs`, and creating a project through the unconverted `POST /v1/projects`):

```ts
describe('project reads answer representations (P5a Task 8)', () => {
  const PROJECT_KEYS = ['audience', 'blueprint', 'createdAt', 'id', 'owner', 'slug']

  it('a project carries exactly the representation’s fields, and its owner by name', async () => {
    const { app, cookies, project } = await withCreatedProject('chem-labs')
    const res = await app.inject({ method: 'GET', url: `/v1/projects/${project.id}`, cookies })
    expect(Object.keys(res.json()).sort()).toEqual(PROJECT_KEYS)
    expect(res.json().owner).toEqual({ id: expect.any(String), displayName: expect.any(String) })
    for (const internal of ['quota', 'visibility', 'published', 'forkedFrom', 'ownerId', 'blueprintRef'])
      expect(res.json()).not.toHaveProperty(internal)
    await app.close()
  })

  it('expands environments, each with its url and no driver internals', async () => {
    const { app, cookies, project } = await withCreatedProject('chem-labs')
    const res = await app.inject({ method: 'GET', url: `/v1/projects/${project.id}?expand=environments`, cookies })
    const staging = res.json().environments.find((e: { kind: string }) => e.kind === 'staging')
    expect(staging).toEqual({
      id: expect.any(String),
      projectId: project.id,
      kind: 'staging',
      hostname: 'chem-labs.staging.manifest.internal',
      url: 'https://chem-labs.staging.manifest.internal',
      instance: null,
    })
    await app.close()
  })

  it('lists a project’s environments and its members', async () => {
    const { app, cookies, project } = await withCreatedProject('chem-labs')
    const environments = await app.inject({ method: 'GET', url: `/v1/projects/${project.id}/environments`, cookies })
    expect(environments.json().map((e: { kind: string }) => e.kind).sort()).toEqual(['production', 'sandbox', 'staging'])
    const members = await app.inject({ method: 'GET', url: `/v1/projects/${project.id}/members`, cookies })
    expect(members.json()).toEqual([
      { userId: expect.any(String), puid: 'bio_prof', displayName: expect.any(String), email: expect.any(String), role: 'owner' },
    ])
    await app.close()
  })

  it('an administrator’s own list is their memberships — the fleet is another read (Decision 20)', async () => {
    const { deps, app } = await withCreatedProject('chem-labs')
    const admin = await loginAs(deps, 'platform_admin')
    const res = await app.inject({ method: 'GET', url: '/v1/projects', cookies: admin })
    expect(res.json()).toEqual([])
    await app.close()
  })
})
```

`withCreatedProject(slug)` is written beside these tests: `testDeps()`, `buildServer`, `loginAs(deps, 'bio_prof')`, then `POST /v1/projects` with `{ slug, blueprint: 'fixture-node@1' }` and `mutationHeaders(deps)`, returning `{ deps, app, cookies, project: res.json() }`.

In `api/authz-contract.ts`, two rows after `GET /v1/projects/:projectId`:

```ts
  {
    // P5a Task 8. The environments a project holds — the same capability as the project.
    method: 'GET',
    url: '/v1/projects/:projectId/environments',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/environments` }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
  {
    // P5a Task 8. Reading who is a member is `project:read`; CHANGING it stays `members:manage`.
    method: 'GET',
    url: '/v1/projects/:projectId/members',
    request: (f) => ({ url: `/v1/projects/${f.projectId}/members` }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
```

- [ ] **Step 2: Watch them fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/projects.test.ts src/api/authz-contract.test.ts
```

Expected: the representation tests see `quota` and `ownerId`; the two list routes are `404 ROUTE_NOT_FOUND`; the admin's list holds the project; the authz suite's two new rows fail for every actor.

- [ ] **Step 3: The representations**

`packages/control-plane/src/api/representations/instances.ts`:

```ts
import { z } from 'zod/v4'
import type { instances } from '../../db/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

/** §11's machine, as the database holds it. */
const STATES = ['pending', 'building', 'provisioning', 'starting', 'healthy', 'failed', 'hibernated', 'waking', 'destroying', 'gone'] as const

export const Instance = representation(
  'Instance',
  z
    .object({
      id: Uuid,
      environmentId: Uuid,
      releaseId: Uuid,
      kind: z.enum(['web', 'worker', 'cron']),
      state: z.enum(STATES),
      lastSeenAt: Timestamp.nullable(),
    })
    .describe('A running (or once-running) copy of a release in one environment (§11). Never its driver or handle.'),
)

export function toInstance(row: typeof instances.$inferSelect): z.input<typeof Instance> {
  return {
    id: row.id,
    environmentId: row.environmentId,
    releaseId: row.releaseId,
    kind: row.kind,
    state: row.state,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  }
}
```

`packages/control-plane/src/api/representations/environments.ts`:

```ts
import { z } from 'zod/v4'
import type { environments, instances } from '../../db/index.js'
import { representation, Uuid } from '../contract/schemas.js'
import { Instance, toInstance } from './instances.js'

export const Environment = representation(
  'Environment',
  z.object({
    id: Uuid,
    projectId: Uuid,
    kind: z.enum(['sandbox', 'staging', 'production']),
    hostname: z.string().describe('§23: `<slug>.<zone for this kind>`. Permanent.'),
    url: z.url(),
    instance: Instance.nullable().describe(
      'The instance the hostname reaches (§6 Route); for an app deployed before P4c, its newest instance. Null before any deploy.',
    ),
  }),
)

export const EnvironmentList = representation('EnvironmentList', z.array(Environment))

export function toEnvironment(
  row: typeof environments.$inferSelect,
  instance: typeof instances.$inferSelect | undefined,
): z.input<typeof Environment> {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    hostname: row.hostname,
    url: `https://${row.hostname}`,
    instance: instance === undefined ? null : toInstance(instance),
  }
}
```

`packages/control-plane/src/api/representations/projects.ts`:

```ts
import { z } from 'zod/v4'
import type { ProjectView } from '../../projects/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'
import { Environment } from './environments.js'

export const UserSummary = representation('UserSummary', z.object({ id: Uuid, displayName: z.string() }))

/** §24 D29: who the app is for, asked of a human at creation (Task 11 writes it). */
export const Audience = representation(
  'Audience',
  z.object({
    scale: z.enum(['solo', 'class', 'large_course', 'public']),
    burst: z.enum(['steady', 'synchronised']),
    justification: z.string().nullable(),
    setBy: Uuid,
    setAt: Timestamp,
  }),
)

export const Project = representation(
  'Project',
  z.object({
    id: Uuid,
    slug: z.string().describe('The project’s name, and the first label of every hostname it has (§23).'),
    blueprint: z.string().describe('`name@major` (§25).'),
    owner: UserSummary,
    audience: Audience.nullable(),
    createdAt: Timestamp,
    environments: z.array(Environment).optional().describe('Present with `?expand=environments` (D23.1).'),
  }),
)

export const ProjectList = representation('ProjectList', z.array(Project))

interface StoredAudience {
  scale: 'solo' | 'class' | 'large_course' | 'public'
  burst: 'steady' | 'synchronised'
  justification: string | null
  set_by: string
  set_at: string
}

export function toProject(
  view: ProjectView,
  environments?: z.input<typeof Environment>[],
): z.input<typeof Project> {
  const audience = view.project.audience as StoredAudience | null
  return {
    id: view.project.id,
    slug: view.project.slug,
    blueprint: view.project.blueprintRef,
    owner: view.owner,
    audience:
      audience === null
        ? null
        : { scale: audience.scale, burst: audience.burst, justification: audience.justification, setBy: audience.set_by, setAt: audience.set_at },
    createdAt: view.project.createdAt.toISOString(),
    ...(environments === undefined ? {} : { environments }),
  }
}
```

`packages/control-plane/src/api/representations/members.ts`:

```ts
import { z } from 'zod/v4'
import type { MemberRow } from '../../projects/index.js'
import { representation, request, Uuid } from '../contract/schemas.js'

export const Member = representation(
  'Member',
  z.object({
    userId: Uuid,
    puid: z.string(),
    displayName: z.string(),
    email: z.string(),
    role: z.enum(['owner', 'collaborator']),
  }),
)
export const MemberList = representation('MemberList', z.array(Member))

export const AddMemberRequest = request(
  'AddMemberRequest',
  z.strictObject({
    puid: z.string().min(1).max(64).describe('The person’s ubcEduCwlPuid. They must have signed in once.'),
    role: z.enum(['owner', 'collaborator']),
  }),
)

export function toMember(row: MemberRow): z.input<typeof Member> {
  return { userId: row.userId, puid: row.puid, displayName: row.displayName, email: row.email, role: row.role }
}
```

`packages/control-plane/src/api/representations/specs.ts`:

```ts
import { z } from 'zod/v4'
import { ManifestErrorSchema, representation, request, Uuid } from '../contract/schemas.js'

const CommitSha = z.string().regex(/^[0-9a-f]{40}$/)

export const Spec = representation(
  'Spec',
  z.object({
    appSpecId: Uuid,
    commitSha: CommitSha,
    spec: z
      .record(z.string(), z.unknown())
      .describe('manifest.yaml v1 as parsed and validated (§7). Its own JSON Schema is not published in P5a.'),
  }),
)

export const SensitiveDiff = representation(
  'SensitiveDiff',
  z.object({ sensitive: z.boolean(), fields: z.array(z.string()) }).describe('D9. Reported, not yet enforced (P6).'),
)

export const SpecValidation = representation(
  'SpecValidation',
  z.object({
    appSpecId: Uuid,
    commitSha: CommitSha,
    valid: z.boolean(),
    errors: z.array(ManifestErrorSchema),
    sensitiveDiff: SensitiveDiff,
  }),
)

export const ValidateSpecRequest = request(
  'ValidateSpecRequest',
  z.strictObject({ commitSha: CommitSha.optional().describe('Defaults to the repository’s HEAD.') }),
)
```

- [ ] **Step 4: The reads the representations need**

In `packages/control-plane/src/projects/repository.ts`:

```ts
export interface ProjectView {
  project: Project
  owner: { id: string; displayName: string }
}

/** Projects with their owners' names, in the order asked for. */
export async function projectViews(db: Db, projectIds: readonly string[]): Promise<ProjectView[]> {
  if (projectIds.length === 0) return []
  const rows = await db
    .select({ project: projects, ownerId: users.id, ownerName: users.displayName })
    .from(projects)
    .innerJoin(users, eq(projects.ownerId, users.id))
    .where(inArray(projects.id, [...projectIds]))
  const byId = new Map(rows.map((r) => [r.project.id, { project: r.project, owner: { id: r.ownerId, displayName: r.ownerName } }]))
  return projectIds.flatMap((id) => byId.get(id) ?? [])
}

/**
 * The caller's memberships — for EVERY caller, administrators included (P5a Decision 20).
 * A person's own list should not change shape the day they are made an administrator;
 * the fleet is `GET /v1/fleet` (Task 16). Newest first.
 */
export async function listProjectsFor(db: Db, actor: Actor): Promise<Project[]> {
  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, actor.userId))
  const ids = memberships.map((m) => m.projectId)
  if (ids.length === 0) return []
  return db.select().from(projects).where(inArray(projects.id, ids)).orderBy(desc(projects.createdAt))
}

export interface MemberRow {
  userId: string
  puid: string
  displayName: string
  email: string
  role: ProjectRole
}

export async function listMembers(db: Db, projectId: string): Promise<MemberRow[]> {
  return db
    .select({
      userId: users.id,
      puid: users.ubcCwlPuid,
      displayName: users.displayName,
      email: users.email,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(projectMembers.role, users.displayName)
}

/**
 * WHAT SERVES an environment — §6's Route record — and, for an app deployed before P4c
 * that has none, its newest instance (P4c Task 8's rule, moved here from the route so the
 * environment list and the fleet read it once).
 */
export async function servingInstanceOf(
  db: Db,
  environment: Environment,
): Promise<typeof instances.$inferSelect | undefined> {
  const [served] = await db
    .select({ instance: instances })
    .from(routes)
    .innerJoin(instances, eq(routes.instanceId, instances.id))
    .where(eq(routes.hostname, environment.hostname))
    .limit(1)
  if (served !== undefined) return served.instance
  const [latest] = await db
    .select()
    .from(instances)
    .where(eq(instances.environmentId, environment.id))
    .orderBy(desc(instances.lastSeenAt))
    .limit(1)
  return latest
}
```

(imports: `desc`, `inArray` from `drizzle-orm`; `instances`, `routes`, `users` from `../db/index.js`; `ProjectRole` from `./authz.js`). `projects/repository.test.ts`'s test of an admin seeing every project becomes a test that an admin sees only their memberships.

- [ ] **Step 5: The definitions**

`packages/control-plane/src/api/routes/project-reads.ts`:

```ts
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { appSpecs, environments, users, type Db } from '../../db/index.js'
import {
  addMember,
  assertCapability,
  AuthorizationError,
  getProject,
  listEnvironments as environmentsOf,
  listMembers,
  listProjectsFor,
  projectViews,
  servingInstanceOf,
} from '../../projects/index.js'
import { isSensitiveDiff, validateSpec, type ManifestSpec } from '../../spec/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { Environment, EnvironmentList, toEnvironment } from '../representations/environments.js'
import { AddMemberRequest, Member, MemberList, toMember } from '../representations/members.js'
import { Project, ProjectList, toProject } from '../representations/projects.js'
import { Spec, SpecValidation, ValidateSpecRequest } from '../representations/specs.js'
import { modelPolicy, validationContext } from './projects.js'

const ProjectParams = z.strictObject({ projectId: z.uuid() })
const EnvironmentParams = z.strictObject({ environmentId: z.uuid() })

async function environmentsWithInstances(db: Db, projectId: string) {
  const rows = await environmentsOf(db, projectId)
  return Promise.all(rows.map(async (row) => toEnvironment(row, await servingInstanceOf(db, row))))
}

export const projectReadRoutes = [
  defineRoute({
    operationId: 'listProjects',
    method: 'GET',
    path: '/v1/projects',
    tag: 'projects',
    summary: 'The projects I am a member of',
    description: 'Every project the caller owns or collaborates on, newest first — for administrators too. The fleet is GET /v1/fleet.',
    params: z.strictObject({}),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The caller’s projects.', schema: ProjectList },
    errors: [],
    handler: async ({ deps, actor }) => {
      const mine = await listProjectsFor(deps.db, actor)
      return (await projectViews(deps.db, mine.map((p) => p.id))).map((view) => toProject(view))
    },
  }),
  defineRoute({
    operationId: 'getProject',
    method: 'GET',
    path: '/v1/projects/{projectId}',
    tag: 'projects',
    summary: 'A project',
    description: 'One project; `?expand=environments` includes its three environments, each with the instance it serves (D23.1).',
    params: ProjectParams,
    query: z.strictObject({ expand: z.literal('environments').optional() }),
    body: NO_BODY,
    success: { status: 200, description: 'The project.', schema: Project },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params, query }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const [view] = await projectViews(deps.db, [params.projectId])
      if (view === undefined) throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      return toProject(view, query.expand === 'environments' ? await environmentsWithInstances(deps.db, params.projectId) : undefined)
    },
  }),
  defineRoute({
    operationId: 'listEnvironments',
    method: 'GET',
    path: '/v1/projects/{projectId}/environments',
    tag: 'projects',
    summary: 'A project’s environments',
    description: 'Sandbox, staging and production — all three exist from the moment the project does (§23).',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The environments.', schema: EnvironmentList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return environmentsWithInstances(deps.db, params.projectId)
    },
  }),
  defineRoute({
    operationId: 'getEnvironment',
    method: 'GET',
    path: '/v1/environments/{environmentId}',
    tag: 'projects',
    summary: 'An environment, and what it serves',
    description: 'The environment and the instance its hostname reaches (§6 Route) — not the newest deploy, which may have failed.',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The environment.', schema: Environment },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      const [row] = await deps.db.select().from(environments).where(eq(environments.id, params.environmentId))
      // The project comes from the environment ROW, never from the request.
      if (row === undefined) throw new AuthorizationError('NOT_FOUND', `no environment '${params.environmentId}'`)
      await assertCapability(deps.db, actor, row.projectId, 'project:read')
      return toEnvironment(row, await servingInstanceOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'listMembers',
    method: 'GET',
    path: '/v1/projects/{projectId}/members',
    tag: 'projects',
    summary: 'Who is a member of a project',
    description: 'Owners and collaborators (§13). Reading is `project:read`; changing membership is `members:manage`.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The members.', schema: MemberList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return (await listMembers(deps.db, params.projectId)).map(toMember)
    },
  }),
  defineRoute({
    operationId: 'addMember',
    method: 'POST',
    path: '/v1/projects/{projectId}/members',
    tag: 'projects',
    summary: 'Add or change a member',
    description:
      'Grants a person who has signed in once a role on the project. One of D24’s privileged four: a delegated token will never hold it (P5b).',
    params: ProjectParams,
    query: NO_QUERY,
    body: AddMemberRequest,
    success: { status: 201, description: 'The member, as they now are.', schema: Member },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'MEMBER_USER_NOT_FOUND'],
    handler: async ({ deps, actor, params, body }) => {
      // A collaborator reaches this line and is refused here (§13).
      await assertCapability(deps.db, actor, params.projectId, 'members:manage')
      const [user] = await deps.db.select().from(users).where(eq(users.ubcCwlPuid, body.puid))
      if (user === undefined) {
        throw new BadRequestError(
          'MEMBER_USER_NOT_FOUND',
          `no user with PUID '${body.puid}' has ever signed in`,
          'A person must sign in once before they can be added to a project.',
        )
      }
      await addMember(deps.db, params.projectId, user.id, body.role)
      return toMember({ userId: user.id, puid: user.ubcCwlPuid, displayName: user.displayName, email: user.email, role: body.role })
    },
  }),
  defineRoute({
    operationId: 'getSpec',
    method: 'GET',
    path: '/v1/projects/{projectId}/spec',
    tag: 'projects',
    summary: 'The project’s newest valid manifest',
    description: 'manifest.yaml as last validated (§7). An invalid newest manifest answers SPEC_INVALID with its errors.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The spec.', schema: Spec },
    errors: ['NOT_FOUND', 'SPEC_NOT_FOUND', 'SPEC_INVALID'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const [latest] = await deps.db
        .select()
        .from(appSpecs)
        .where(eq(appSpecs.projectId, params.projectId))
        .orderBy(desc(appSpecs.createdAt))
        .limit(1)
      if (latest === undefined) throw new BadRequestError('SPEC_NOT_FOUND', 'this project has no validated spec yet')
      if (!latest.valid) throw new SpecInvalidError(latest.errors as never)
      return { appSpecId: latest.id, commitSha: latest.commitSha, spec: latest.parsed as Record<string, unknown> }
    },
  }),
  defineRoute({
    operationId: 'validateSpec',
    method: 'POST',
    path: '/v1/projects/{projectId}/spec',
    tag: 'projects',
    summary: 'Validate manifest.yaml at a commit',
    description:
      '§22 step 3: reads manifest.yaml at the commit (HEAD by default), validates it (§7) and records the result. A sensitive diff (D9) is reported, not yet enforced.',
    params: ProjectParams,
    query: NO_QUERY,
    body: ValidateSpecRequest,
    success: { status: 201, description: 'The validation, valid or not — an invalid manifest is a recorded answer, not a refusal.', schema: SpecValidation },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'SOURCE_GIT_FAILED', 'AI_BACKEND_UNAVAILABLE', 'AI_CATALOGUE_EMPTY'],
    handler: async ({ deps, actor, params, body }) => {
      // The existing POST /projects/:projectId/spec handler's body, unchanged except that
      // `project` comes from getProject after the capability check and the answer is:
      //   { appSpecId, commitSha, valid, errors, sensitiveDiff }
      // Move it here verbatim, including its reading of the catalogue only for a manifest
      // that declares a model (modelPolicy, now exported from ./projects.js).
      await assertCapability(deps.db, actor, params.projectId, 'project:write')
      const project = await getProject(deps.db, params.projectId)
      if (project === undefined) throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      const [previous] = await deps.db
        .select()
        .from(appSpecs)
        .where(eq(appSpecs.projectId, params.projectId))
        .orderBy(desc(appSpecs.createdAt))
        .limit(1)
      const repo = deps.source.repositoryFor(project.slug)
      const commitSha = body.commitSha ?? (await deps.source.headCommit(repo))
      const yamlText = (await deps.source.readFile(repo, commitSha, 'manifest.yaml')) ?? ''
      const models = await modelPolicy(deps.catalogue, yamlText)
      const result = validateSpec(yamlText, validationContext(project.slug, project.quota as Record<string, unknown>, models))
      const [appSpec] = await deps.db
        .insert(appSpecs)
        .values({
          projectId: params.projectId,
          commitSha,
          parsed: result.valid ? result.spec : {},
          schemaVersion: 1,
          valid: result.valid,
          errors: result.valid ? [] : result.errors,
        })
        .returning()
      const sensitiveDiff =
        result.valid && previous?.valid === true
          ? isSensitiveDiff(previous.parsed as ManifestSpec, result.spec)
          : { sensitive: false, fields: [] }
      return { appSpecId: appSpec!.id, commitSha, valid: result.valid, errors: result.valid ? [] : result.errors, sensitiveDiff }
    },
  }),
]
```

In `api/routes/projects.ts`, export `modelPolicy` and `validationContext`, and delete every handler but `app.post('/v1/projects', …)`. In `api/routes/delivery.ts`, delete `app.get('/v1/environments/:environmentId', …)`. `routes/index.ts`: `[...meRoutes, ...projectReadRoutes]`. In `projects/index.ts`, `ProjectView` and `MemberRow` are already exported by `export * from './repository.js'`.

In `api/contract/coverage.test.ts`, remove from `UNCONVERTED`: `GET /v1/projects`, `GET /v1/projects/:projectId`, `GET /v1/projects/:projectId/spec`, `POST /v1/projects/:projectId/spec`, `POST /v1/projects/:projectId/members`, `GET /v1/environments/:environmentId`.

- [ ] **Step 6: Regenerate, run, and let the registry say what died**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test
```

Expected: the representation tests and the authz suite green; `error-codes.test.ts` **red on *registers nothing the source never throws***, listing `MEMBER_INVALID_INPUT`, `SPEC_INVALID_INPUT` and `PROJECT_NOT_FOUND` — the zod bodies that raised them are gone, and `REQUEST_INVALID` and `NOT_FOUND` answer instead. Delete those three from `api/error-codes.ts`, `pnpm contract:write && pnpm contract:generate` again (the `ErrorCode` enum moved), and run `pnpm test` twice. Existing tests that asserted `SPEC_INVALID_INPUT` or `MEMBER_INVALID_INPUT` now assert `REQUEST_INVALID`.

- [ ] **Step 7: The journey reads the instructor's projects**

In `packages/journey/src/main.ts`, after `step1SignedIn`:

```ts
/** §22 step 2, the half before creating: what the instructor already has. */
async function step2MyProjects(): Promise<void> {
  checks.step('2. My projects')
  const mine = unwrap(await client.GET('/v1/projects'), 'listProjects')
  checks.ok('GET /v1/projects answers a list', Array.isArray(mine))
  const internals = mine.flatMap((p) => ['quota', 'ownerId', 'visibility'].filter((k) => k in p))
  checks.ok('no project carries a database-only field', internals.length === 0, internals.join(','))
  const journeyApp = mine.find((p) => p.slug === 'journey-app')
  if (journeyApp !== undefined) state.projectId = journeyApp.id
}
```

and `'before-app': [step1SignedIn, step2MyProjects]`.

```bash
cd /Users/rich/Developer/manifest
pnpm typecheck
# restart the control plane on the new build, then:
make demo-journey
make demo-redeploy     # reads GET /v1/environments/:id's instance.id — the shape it relies on
```

- [ ] **Step 8: Gates, commit, controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A packages/control-plane/src packages/contract packages/journey
git commit -m "feat(api): projects, environments, members and specs answer public representations; two missing reads"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | add `quota: z.record(z.string(), z.unknown())` to `Project`, and `quota: view.project.quota` to `toProject` | `projects.test.ts` *exactly the representation's fields* — and the drift test until `contract:write` | `git checkout` both files |
| b | restore `if (actor.platformRole === 'admin') return db.select().from(projects)` in `listProjectsFor` | *an administrator's own list is their memberships* | `git checkout packages/control-plane/src/projects/repository.ts` |
| c | delete `assertCapability` from `listMembers`' handler | authz suite `GET /v1/projects/:projectId/members as stranger → 404` (gets 200) | `git checkout packages/control-plane/src/api/routes/project-reads.ts` |
| d | in `servingInstanceOf`, return `latest` first | `delivery.test.ts` *reports the instance that SERVES, not the newest deploy* | as (b) |

---

## Task 9: Reserved labels, and `GET /v1/slugs/{slug}` behind one slug function

> **EXECUTED 2026-09-16 (sitting 6), `0246d3c`, with `b043d9d` after it.** What runs differs from the text below in these places, each measured: **no `.max(64)` on the check's `slug` param or on creation's body** — with it an 80-character name answered `400 REQUEST_INVALID` at the check and `400 PROJECT_INVALID_INPUT` at creation, where §23 says *a 200 either way* and the same code at both; **Fastify's router refusals now reach the envelope** (`b043d9d`) — a path parameter over 100 characters answered `414 FST_ERR_MAX_PARAM_LENGTH` in Fastify's own body, quoting the path, and never reached `setErrorHandler`; **`ProjectError` is deleted**, not kept — nothing throws it once both codes go; **`src/index.ts` imports `createRateLimiter` from `./api/index.js`**, because a root file reaching `./api/rate-limit.js` breaks `module-boundaries.test.ts`; the test list is **`projects/testing.ts`'s `testReservedLabels()`**, one real load per process; the TAKEN sentence has **one copy, `slugTaken(slug)`**, used by `checkSlug` and by `createProject`'s race; **`projects/repository.test.ts`'s `rejects.toThrow(/slug/i)` asserts `SLUG_INVALID`** (the sentence no longer says "slug"), with a new *refuses a reserved label before anything is written*; and `PROJECT_INVALID_INPUT` stays, with a hint naming `GET /v1/slugs/{slug}`, until Task 11 converts `POST /v1/projects`.

**What §23 asks, exactly.** Six groups of labels no project may take, held in `infra/reserved-labels/` (755 labels, already written); one function behind the slug check, creation and any rename, answering `SLUG_INVALID`, `SLUG_RESERVED` (with what the label stands for and why its group is reserved) and `SLUG_TAKEN`; the check always `200`, authenticated, rate-limited, saying nothing about a holder; and **a test that fails when the edge serves a platform name the list does not contain**.

> **Read Task 1's `[M4b]` before starting.** Any test or demo slug it listed as reserved is renamed in this task, and named in the sitting's findings.
>
> **Task 1 result (2026-09-16, `[M4a]`/`[M4b]`/`[M4b+]`): nothing to rename.** Both files load with one loader into **755 labels in 6 groups** (`manifest` 12, `sign-in` 16, `environments-and-infrastructure` 21, `automatic-lookups` 6, `ubc` 22, `ubc-academic` 678), every label satisfies §7's rule and none is in two groups. The Caddyfile's only named site is `idp.manifest.internal` → `manifest`; `console` (→ `manifest`) and `edge` (→ `environments-and-infrastructure`) are both reserved, which Decisions 11 and 13 need. M4b's loose scan flagged `manifest`, `staging`, `app` and `port`, and **none is a project slug**: git's `user.name=manifest` and the `manifest.*` container label keys, `staging.hostname`, `appContainer(…)`, and a comment in `spec/injection.ts`. A tight scan (`slug: '…'`, `SLUG:-…`, `SLUG=…` and every `manifest.yaml`'s `name:`, over `src/`, `scripts/`, `fixtures/`, `blueprints/` and `infra/lib/`) found 21 project slugs, none reserved — `journey-app` and `proof-app` included. A slug a test builds at run time is not in either scan; the suite is the check for those.

**Files:**
- Create: `packages/control-plane/src/projects/reserved-labels.ts`, `reserved-labels.test.ts`
- Create: `packages/control-plane/src/projects/slugs.ts`, `slugs.test.ts`
- Create: `packages/control-plane/src/projects/edge-names.test.ts`
- Create: `packages/control-plane/src/api/rate-limit.ts`, `rate-limit.test.ts`
- Create: `packages/control-plane/src/api/representations/slugs.ts`, `api/routes/slugs.ts`
- Modify: `packages/control-plane/src/projects/repository.ts` (`createProject` checks through `checkSlug`; its `SLUG` copy and both `ProjectError` codes deleted), `projects/index.ts`
- Modify: `packages/control-plane/src/api/routes/projects.ts` (the body's slug regex deleted), `api/errors.ts` (`SlugRefusedError`, `RateLimitedError`), `api/server.ts` (`ServerDeps.reservedLabels`, `ServerDeps.limits`; `Retry-After`), `api/testing.ts`, `api/error-codes.ts` (+ its test), `api/authz-contract.ts`, `api/projects.test.ts`, `api/routes/index.ts`
- Modify: `packages/control-plane/src/config.ts` (`MANIFEST_RESERVED_LABELS_DIR`), `src/index.ts` (load at boot; the boot line's count)
- Modify: `infra/reserved-labels/labels.yaml` (only its header's *"Loaded by nothing yet"* line)
- Modify: `packages/journey/src/main.ts`; the regenerated contract

**Interfaces:**
- Produces: `loadReservedLabels(dir: string): Promise<ReservedLabels>`; `interface ReservedLabels { size: number; groups: readonly string[]; lookup(label: string): ReservedLabel | undefined }`; `interface ReservedLabel { label; group; standsFor; reason }`; `ReservedLabelsError` (codes `RESERVED_LABELS_MISSING`, `RESERVED_LABELS_SHAPE`, `RESERVED_LABEL_INVALID`, `RESERVED_LABEL_DUPLICATE`, `RESERVED_LABEL_UNEXPLAINED` — boot errors, never on the wire).
- Produces: `SLUG_CODES`, `type SlugReason = { code: 'SLUG_INVALID' | 'SLUG_RESERVED' | 'SLUG_TAKEN'; message: string; hint: string }`, `type SlugVerdict`, `checkSlug(db, reserved, slug): Promise<SlugVerdict>`, `SlugRefusedError`, `assertSlugAvailable(db, reserved, slug): Promise<void>` — `projects/slugs.ts`.
- Produces: `createRateLimiter({ limit, windowMs, now? }): RateLimiter` with `take(key: string): void`; `RateLimitedError` (`code = 'RATE_LIMITED'`, `retryAfterSeconds`).
- Produces: `ServerDeps.reservedLabels: ReservedLabels`; `ServerDeps.limits: { slugCheck: RateLimiter }`; `config.reservedLabelsDir`.
- Produces: `GET /v1/slugs/{slug}` (`checkSlug` → `SlugCheck`).
- Changes: `createProject(db, config, reserved, input)` — a new third parameter.

- [ ] **Step 1: Write the failing tests**

`packages/control-plane/src/projects/reserved-labels.test.ts`:

```ts
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadReservedLabels } from './reserved-labels.js'

const REAL = fileURLToPath(new URL('../../../../infra/reserved-labels', import.meta.url))

async function dirWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mf-reserved-'))
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text)
  return dir
}

describe('§23’s reserved labels, as data (P5a Task 9)', () => {
  it('loads the list the repository holds — six groups, and chem is Chemistry', async () => {
    const reserved = await loadReservedLabels(REAL)
    expect(reserved.size).toBe(755)
    expect(reserved.groups).toHaveLength(6)
    expect(reserved.lookup('chem')).toMatchObject({ group: 'ubc-academic' })
    expect(reserved.lookup('chem')!.standsFor).toContain('Chemistry')
    expect(reserved.lookup('idp')).toMatchObject({ group: 'manifest' })
    expect(reserved.lookup('chem-labs')).toBeUndefined()
  })

  it('refuses a directory holding no list', async () => {
    await expect(loadReservedLabels(await dirWith({}))).rejects.toMatchObject({ code: 'RESERVED_LABELS_MISSING' })
  })

  it('refuses a label no slug could be', async () => {
    const dir = await dirWith({ 'a.yaml': 'group: g\nreason: r\nlabels:\n  Bad_Label: "x"\n' })
    await expect(loadReservedLabels(dir)).rejects.toMatchObject({ code: 'RESERVED_LABEL_INVALID' })
  })

  it('refuses a label in two places', async () => {
    const dir = await dirWith({
      'a.yaml': 'group: one\nreason: r\nlabels:\n  demo: "x"\n',
      'b.yaml': 'groups:\n  - group: two\n    reason: r\n    labels:\n      demo: "y"\n',
    })
    await expect(loadReservedLabels(dir)).rejects.toMatchObject({ code: 'RESERVED_LABEL_DUPLICATE' })
  })

  it('refuses a label that does not say what it stands for', async () => {
    const dir = await dirWith({ 'a.yaml': 'group: g\nreason: r\nlabels:\n  demo: ""\n' })
    await expect(loadReservedLabels(dir)).rejects.toMatchObject({ code: 'RESERVED_LABEL_UNEXPLAINED' })
  })

  it('refuses a file of neither shape', async () => {
    const dir = await dirWith({ 'a.yaml': 'labels:\n  - demo\n' })
    await expect(loadReservedLabels(dir)).rejects.toMatchObject({ code: 'RESERVED_LABELS_SHAPE' })
  })
})
```

`packages/control-plane/src/projects/slugs.test.ts`:

```ts
import { eq } from 'drizzle-orm'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { projects } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { loadReservedLabels } from './reserved-labels.js'
import { checkSlug } from './slugs.js'

const reserved = await loadReservedLabels(fileURLToPath(new URL('../../../../infra/reserved-labels', import.meta.url)))

describe('one function answers the slug check and creation (§23, P5a Task 9)', () => {
  it('a name §7 refuses is SLUG_INVALID, alone', async () => {
    await withProject(async (tx) => {
      const verdict = await checkSlug(tx, reserved, 'Chem_Labs')
      expect(verdict).toMatchObject({ available: false, reasons: [{ code: 'SLUG_INVALID' }] })
      expect(verdict.available === false && verdict.reasons).toHaveLength(1)
    })
  })

  it('a reserved label says what it stands for and why its group is reserved', async () => {
    await withProject(async (tx) => {
      const verdict = await checkSlug(tx, reserved, 'chem')
      expect(verdict.available).toBe(false)
      const [reason] = verdict.available === false ? verdict.reasons : []
      expect(reason!.code).toBe('SLUG_RESERVED')
      expect(reason!.message).toContain('Chemistry')
      expect(reason!.hint).toContain('reads as that unit')
    })
  })

  it('a name another project holds is SLUG_TAKEN — and says nothing about the holder', async () => {
    await withProject(async (tx, { projectId }) => {
      const [held] = await tx.select({ slug: projects.slug }).from(projects).where(eq(projects.id, projectId))
      const verdict = await checkSlug(tx, reserved, held!.slug)
      expect(verdict).toMatchObject({ available: false, reasons: [{ code: 'SLUG_TAKEN' }] })
      expect(JSON.stringify(verdict)).not.toContain(projectId)
    })
  })

  it('a grandfathered holder of a newly reserved label is both', async () => {
    await withProject(async (tx, { ownerId }) => {
      await tx.insert(projects).values({ slug: 'console', ownerId, blueprintRef: 'fixture-node@1' })
      const verdict = await checkSlug(tx, reserved, 'console')
      expect(verdict.available === false && verdict.reasons.map((r) => r.code)).toEqual(['SLUG_RESERVED', 'SLUG_TAKEN'])
    })
  })

  it('an available name is available, with no reasons at all', async () => {
    await withProject(async (tx) => {
      expect(await checkSlug(tx, reserved, 'journey-app')).toEqual({ slug: 'journey-app', available: true })
    })
  })
})
```

`packages/control-plane/src/projects/edge-names.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadReservedLabels } from './reserved-labels.js'

const reserved = await loadReservedLabels(fileURLToPath(new URL('../../../../infra/reserved-labels', import.meta.url)))
const CADDYFILE = new URL('../../../../infra/caddy/Caddyfile', import.meta.url)

describe('the edge serves no platform name the reserved list lacks (§23)', () => {
  it('every named site in the Caddyfile is a label in the `manifest` group', async () => {
    const text = await readFile(CADDYFILE, 'utf8')
    const sites = [...text.matchAll(/^([a-z0-9*.,\s-]+?)\s*\{\s*$/gm)]
      .flatMap((m) => m[1]!.split(','))
      .map((s) => s.trim())
      .filter((s) => s.endsWith('.manifest.internal') && !s.startsWith('*'))
    // Not vacuous: idp and console are there today, and a regex that matched nothing
    // would pass every assertion below.
    expect(sites).toEqual(expect.arrayContaining(['idp.manifest.internal', 'console.manifest.internal']))
    expect(sites.map((s) => s.split('.')[0]!).filter((label) => reserved.lookup(label)?.group !== 'manifest')).toEqual([])
  })

  it('reserves the names §23 says the platform serves or will serve, and the probe `make verify` uses', () => {
    for (const label of ['idp', 'console', 'app', 'admin', 'api', 'mock']) {
      expect(reserved.lookup(label)?.group, label).toBe('manifest')
    }
    expect(reserved.lookup('edge'), 'make verify probes edge.manifest.internal (P5a Task 3)').toBeDefined()
  })
})
```

`packages/control-plane/src/api/rate-limit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRateLimiter, RateLimitedError } from './rate-limit.js'

describe('a per-key fixed window (P5a Task 9)', () => {
  it('allows the limit, refuses the next with the seconds left, and opens a new window', () => {
    let now = 0
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now })
    for (let i = 0; i < 3; i += 1) limiter.take('a')
    now = 20_000
    try {
      limiter.take('a')
      expect.unreachable('the fourth take should be refused')
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError)
      expect((error as RateLimitedError).retryAfterSeconds).toBe(40)
    }
    limiter.take('b')
    now = 60_000
    limiter.take('a')
  })
})
```

In `api/projects.test.ts`:

```ts
describe('the slug check and creation agree (§23, P5a Task 9)', () => {
  it('GET /v1/slugs answers 200 whatever the answer, and creation refuses with the same code', async () => {
    const { deps, app, cookies } = await signedIn()
    for (const [slug, code, status] of [['console', 'SLUG_RESERVED', 409], ['Chem_Labs', 'SLUG_INVALID', 400]] as const) {
      const check = await app.inject({ method: 'GET', url: `/v1/slugs/${slug}`, cookies })
      expect(check.statusCode).toBe(200)
      expect(check.json()).toMatchObject({ slug, available: false, reasons: [{ code }] })
      const create = await app.inject({
        method: 'POST',
        url: '/v1/projects',
        cookies,
        headers: mutationHeaders(deps),
        payload: { slug, blueprint: 'fixture-node@1' },
      })
      expect(create.statusCode).toBe(status)
      expect(create.json().error.code).toBe(code)
    }
    await app.close()
  })

  it('a name taken by creation is SLUG_TAKEN at both', async () => {
    const { deps, app, cookies } = await signedIn()
    const first = await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(deps), payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' } })
    expect(first.statusCode).toBe(201)
    expect((await app.inject({ method: 'GET', url: '/v1/slugs/chem-labs', cookies })).json().reasons[0].code).toBe('SLUG_TAKEN')
    const again = await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(deps), payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' } })
    expect(again.json().error.code).toBe('SLUG_TAKEN')
    await app.close()
  })

  it('limits the check to 60 a minute per person, with Retry-After', async () => {
    const { app, cookies } = await signedIn()
    for (let i = 0; i < 60; i += 1) await app.inject({ method: 'GET', url: '/v1/slugs/journey-app', cookies })
    const limited = await app.inject({ method: 'GET', url: '/v1/slugs/journey-app', cookies })
    expect(limited.statusCode).toBe(429)
    expect(limited.json().error.code).toBe('RATE_LIMITED')
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    await app.close()
  })
})
```

(`signedIn()` beside them: `testDeps`, `buildServer`, `loginAs(deps, 'bio_prof')`.) In `api/authz-contract.ts`:

```ts
  {
    // §23 (P5a Task 9): any signed-in person may ask, and the answer says nothing about a
    // holder — so there is no stranger to hide anything from.
    method: 'GET',
    url: '/v1/slugs/:slug',
    request: () => ({ url: '/v1/slugs/journey-app' }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 401 },
  },
```

- [ ] **Step 2: Watch them fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/projects/reserved-labels.test.ts src/projects/slugs.test.ts src/projects/edge-names.test.ts src/api/rate-limit.test.ts src/api/projects.test.ts
```

Expected: the four new files fail to import; the API tests get `201` for `console`, `ROUTE_NOT_FOUND` for the check, and `PROJECT_INVALID_INPUT` where `SLUG_INVALID` belongs.

- [ ] **Step 3: The loader**

`packages/control-plane/src/projects/reserved-labels.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { SLUG } from '../spec/index.js'

/**
 * §23: labels no project may take as its slug, each with the sentence the slug check
 * gives a person who asked for it. HELD IN ONE PLACE — `infra/reserved-labels/` — and read
 * once at boot (P5a Decision 25). `labels.yaml` is hand-maintained; `ubc-academic.yaml` is
 * generated from UBC's calendars. They have different shapes (P5a *Read this first* 7):
 * `groups: [...]`, and one group at the top level.
 *
 * A defect in the list REFUSES THE BOOT, naming the file: a list the platform half-read
 * reserves half the names, silently.
 */
export class ReservedLabelsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ReservedLabelsError'
  }
}

export interface ReservedLabel {
  label: string
  group: string
  /** What the label stands for: "UBC Vancouver course subject code CHEM (Chemistry)". */
  standsFor: string
  /** Why its whole group is reserved (§23's table). */
  reason: string
}

export interface ReservedLabels {
  readonly size: number
  readonly groups: readonly string[]
  lookup(label: string): ReservedLabel | undefined
}

interface Group {
  group: string
  reason: string
  labels: Record<string, unknown>
}

function isGroup(value: unknown): value is Group {
  const g = value as Partial<Group> | null
  return (
    typeof g === 'object' && g !== null &&
    typeof g.group === 'string' && typeof g.reason === 'string' &&
    typeof g.labels === 'object' && g.labels !== null && !Array.isArray(g.labels)
  )
}

function groupsIn(document: unknown, file: string): Group[] {
  const groups = (document as { groups?: unknown } | null)?.groups
  if (Array.isArray(groups) && groups.every(isGroup)) return groups
  if (isGroup(document)) return [document]
  throw new ReservedLabelsError(
    'RESERVED_LABELS_SHAPE',
    `${file} is neither \`groups: [{group, reason, labels}]\` nor one \`{group, reason, labels}\` — §23's list cannot be read from it`,
  )
}

export async function loadReservedLabels(dir: string): Promise<ReservedLabels> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.yaml')).sort()
  if (files.length === 0) {
    throw new ReservedLabelsError(
      'RESERVED_LABELS_MISSING',
      `no .yaml file in ${dir}. §23's reserved labels are held there (MANIFEST_RESERVED_LABELS_DIR); without them any project may take \`idp\` or \`console\`.`,
    )
  }
  const byLabel = new Map<string, ReservedLabel>()
  const groups: string[] = []
  for (const file of files) {
    for (const group of groupsIn(parse(await readFile(join(dir, file), 'utf8')), file)) {
      groups.push(group.group)
      for (const [label, standsFor] of Object.entries(group.labels)) {
        if (!SLUG.test(label)) {
          throw new ReservedLabelsError('RESERVED_LABEL_INVALID', `${file}: '${label}' (${group.group}) breaks §7's slug rule, so no project could take it — remove it`)
        }
        if (typeof standsFor !== 'string' || standsFor.trim() === '') {
          throw new ReservedLabelsError('RESERVED_LABEL_UNEXPLAINED', `${file}: '${label}' (${group.group}) does not say what it stands for, which is what the slug check tells a person`)
        }
        const prior = byLabel.get(label)
        if (prior !== undefined) {
          throw new ReservedLabelsError('RESERVED_LABEL_DUPLICATE', `${file}: '${label}' is in ${group.group} and already in ${prior.group}`)
        }
        byLabel.set(label, { label, group: group.group, standsFor: standsFor.trim(), reason: group.reason.trim() })
      }
    }
  }
  return { size: byLabel.size, groups, lookup: (label) => byLabel.get(label) }
}
```

- [ ] **Step 4: The one slug function**

`packages/control-plane/src/projects/slugs.ts`:

```ts
import { eq } from 'drizzle-orm'
import { projects, type Db } from '../db/index.js'
import { SLUG } from '../spec/index.js'
import type { ReservedLabels } from './reserved-labels.js'

/**
 * §23: "One function answers both" — the slug check, project creation, and any rename
 * (P5a Decision 24). It returns EVERY reason that applies; creation throws the first.
 */
export const SLUG_CODES = { INVALID: 'SLUG_INVALID', RESERVED: 'SLUG_RESERVED', TAKEN: 'SLUG_TAKEN' } as const

export interface SlugReason {
  code: (typeof SLUG_CODES)[keyof typeof SLUG_CODES]
  message: string
  hint: string
}

export type SlugVerdict =
  | { slug: string; available: true }
  | { slug: string; available: false; reasons: SlugReason[] }

export async function checkSlug(db: Db, reserved: ReservedLabels, slug: string): Promise<SlugVerdict> {
  if (!SLUG.test(slug)) {
    return {
      slug,
      available: false,
      reasons: [
        {
          code: SLUG_CODES.INVALID,
          message: `'${slug.slice(0, 64)}' cannot be a project name`,
          hint: 'Lower-case letters, digits and hyphens, 3–39 characters, starting with a letter (§7).',
        },
      ],
    }
  }
  const reasons: SlugReason[] = []
  const label = reserved.lookup(slug)
  if (label !== undefined) {
    reasons.push({
      code: SLUG_CODES.RESERVED,
      message: `'${slug}' is reserved — ${label.standsFor}.`,
      hint: `${label.reason} Choose another name.`,
    })
  }
  const [holder] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)).limit(1)
  if (holder !== undefined) {
    // NOTHING ABOUT THE HOLDER (§23): no owner, no id, no environment.
    reasons.push({
      code: SLUG_CODES.TAKEN,
      message: `'${slug}' is already a project's name.`,
      hint: 'Project names are unique across the platform, because each becomes a hostname (§23). Choose another.',
    })
  }
  return reasons.length === 0 ? { slug, available: true } : { slug, available: false, reasons }
}

export class SlugRefusedError extends Error {
  readonly code: SlugReason['code']
  readonly hint: string
  constructor(reason: SlugReason) {
    super(reason.message)
    this.code = reason.code
    this.hint = reason.hint
    this.name = 'SlugRefusedError'
  }
}

export async function assertSlugAvailable(db: Db, reserved: ReservedLabels, slug: string): Promise<void> {
  const verdict = await checkSlug(db, reserved, slug)
  if (!verdict.available) throw new SlugRefusedError(verdict.reasons[0]!)
}
```

Export both modules from `projects/index.ts`. In `projects/repository.ts`: delete the `SLUG` constant and its check; `createProject(db, config, reserved: ReservedLabels, input)` calls `await assertSlugAvailable(db, reserved, input.slug)` first; its unique-violation catch — the race between the check and the insert — throws `new SlugRefusedError({ code: 'SLUG_TAKEN', message: …, hint: … })` with the same sentences `checkSlug` uses. `ProjectError` keeps its class; both its codes are deleted.

- [ ] **Step 5: The rate limit, the errors, the configuration and the route**

`packages/control-plane/src/api/rate-limit.ts`:

```ts
/**
 * A fixed window per key, in this process (P5a Decision 26). §23 requires the slug check
 * to be rate-limited, and it is asked while a person types. Per USER, not per address:
 * every host request reaches the edge from one address (P5a Task 1, M2), so a per-IP limit
 * would be one limit for everybody. P5b generalises this to per-token limits (§20).
 */
export class RateLimitedError extends Error {
  readonly code = 'RATE_LIMITED'
  constructor(readonly retryAfterSeconds: number) {
    super(`too many requests; try again in ${retryAfterSeconds} s`)
    this.name = 'RateLimitedError'
  }
}

export interface RateLimiter {
  take(key: string): void
}

export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = options.now ?? Date.now
  const windows = new Map<string, { start: number; count: number }>()
  return {
    take(key) {
      const at = now()
      let window = windows.get(key)
      if (window === undefined || at - window.start >= options.windowMs) {
        window = { start: at, count: 0 }
        windows.set(key, window)
      }
      window.count += 1
      if (window.count > options.limit) {
        throw new RateLimitedError(Math.max(1, Math.ceil((window.start + options.windowMs - at) / 1000)))
      }
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (at - w.start >= options.windowMs) windows.delete(k)
      }
    },
  }
}
```

`api/errors.ts`'s `mapError` gains two branches:

```ts
  // §23 (P5a Task 9). The same codes the slug check reports, answered at creation.
  if (error instanceof SlugRefusedError) {
    return {
      status: error.code === 'SLUG_INVALID' ? 400 : 409,
      body: { error: { code: error.code, message: error.message, hint: error.hint } },
    }
  }

  if (error instanceof RateLimitedError) {
    return {
      status: 429,
      body: { error: { code: error.code, message: error.message, hint: `Wait ${error.retryAfterSeconds} s; Retry-After says the same.` } },
    }
  }
```

and `setErrorHandler` sets the header before sending: `if (error instanceof RateLimitedError) reply.header('retry-after', String(error.retryAfterSeconds))`.

`api/error-codes.ts`: delete `PROJECT_INVALID_SLUG` and `PROJECT_SLUG_TAKEN`; add a family `'SlugRefusedError'` and

```ts
  // projects/slugs.ts — §23
  SLUG_INVALID: { status: 400, families: ['SlugRefusedError'], summary: 'The name breaks §7’s slug rule.' },
  SLUG_RESERVED: { status: 409, families: ['SlugRefusedError'], summary: 'The name is one of §23’s reserved labels; the message says what it stands for.' },
  SLUG_TAKEN: { status: 409, families: ['SlugRefusedError'], summary: 'Another project holds the name.' },
  RATE_LIMITED: api(429, 'Too many requests from this person; Retry-After says when to try again.'),
```

In `error-codes.test.ts`, `thrown()` adds `for (const code of Object.values(SLUG_CODES)) add(code, 'SlugRefusedError')` (the constructor takes a reason, not a literal), and `make` gains `SlugRefusedError: (c) => new SlugRefusedError({ code: c as SlugReason['code'], message: 'm', hint: 'h' })`.

`config.ts`: `MANIFEST_RESERVED_LABELS_DIR: z.string().min(1).default('infra/reserved-labels')` with a doc comment naming §23 and Decision 25, and `reservedLabelsDir: fromRepoRoot(raw.MANIFEST_RESERVED_LABELS_DIR)` on `Config`.

`api/server.ts`'s `ServerDeps`:

```ts
  /** §23's reserved labels, loaded once at boot (P5a Task 9). */
  reservedLabels: ReservedLabels
  /** In-process request limits, one limiter per purpose, shared by every request (P5a Task 9). */
  limits: { slugCheck: RateLimiter }
```

`src/index.ts`, before `buildServer`: `const reservedLabels = await loadReservedLabels(config.reservedLabelsDir)`, passed with `limits: { slugCheck: createRateLimiter({ limit: 60, windowMs: 60_000 }) }`; the boot line gains `reservedLabels: reservedLabels.size`. `api/testing.ts`: the same two, the labels loaded once per process from the repository's `infra/reserved-labels` (resolved from `import.meta.url`, as `BLUEPRINTS_ROOT` is). Every `createProject(db, config, input)` call passes the loaded labels — find them all with `grep -rn "createProject(" packages/control-plane/src`: the route passes `deps.reservedLabels`, and every test (`projects/repository.test.ts`, `releases/releases.test.ts`'s `fixture`, `boot.docker.test.ts` and any other the grep names) a list loaded from the repository's `infra/reserved-labels` once per file.

`packages/control-plane/src/api/representations/slugs.ts`:

```ts
import { z } from 'zod/v4'
import { representation } from '../contract/schemas.js'

export const SlugCheck = representation(
  'SlugCheck',
  z
    .object({
      slug: z.string(),
      available: z.boolean(),
      reasons: z
        .array(
          z.object({
            code: z.enum(['SLUG_INVALID', 'SLUG_RESERVED', 'SLUG_TAKEN']),
            message: z.string(),
            hint: z.string(),
          }),
        )
        .optional()
        .describe('Present when `available` is false: every reason that applies.'),
    })
    .describe('§23: exactly what project creation will answer — advisory, since creation checks again.'),
)
```

`packages/control-plane/src/api/routes/slugs.ts`:

```ts
import { z } from 'zod/v4'
import { checkSlug } from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { SlugCheck } from '../representations/slugs.js'

export const slugRoutes = [
  defineRoute({
    operationId: 'checkSlug',
    method: 'GET',
    path: '/v1/slugs/{slug}',
    tag: 'projects',
    summary: 'Would this project name work?',
    description:
      '§23: answers exactly what project creation will, so a client can tell a person while they type. Always 200 — the answer is about the name, and a 4xx would make "taken" indistinguishable from "not allowed to ask". Says nothing about a holder. 60 a minute per person.',
    params: z.strictObject({ slug: z.string().min(1).max(64) }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The verdict.', schema: SlugCheck },
    errors: ['RATE_LIMITED'],
    handler: async ({ deps, actor, params }) => {
      deps.limits.slugCheck.take(actor.userId)
      return checkSlug(deps.db, deps.reservedLabels, params.slug)
    },
  }),
]
```

`routes/index.ts` gains `...slugRoutes`. In `api/routes/projects.ts`, the creation body's slug becomes `slug: z.string().min(1).max(64)` — the rule is `checkSlug`'s, not the body's — and `createProject` is called with `deps.reservedLabels`. `infra/reserved-labels/labels.yaml`'s *"Loaded by nothing yet: P5a builds the check, the refusal at creation and the loader."* becomes *"Loaded at boot by `projects/reserved-labels.ts` (P5a Task 9)."*

- [ ] **Step 6: Run it, regenerate, and put the journey in front of it**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test
```

In `packages/journey/src/main.ts`:

```ts
/** §23: the name is checked while it is typed, with the answer creation will give. */
async function step2aCheckTheName(): Promise<void> {
  checks.step('2a. The project’s name, checked while it is typed (§23)')
  const reservedPlatform = unwrap(await client.GET('/v1/slugs/{slug}', { params: { path: { slug: 'console' } } }), 'checkSlug')
  checks.ok('console is reserved for the platform', reservedPlatform.available === false && reservedPlatform.reasons?.[0]?.code === 'SLUG_RESERVED', JSON.stringify(reservedPlatform))
  const reservedUnit = unwrap(await client.GET('/v1/slugs/{slug}', { params: { path: { slug: 'chem' } } }), 'checkSlug')
  checks.ok('chem says it is Chemistry', reservedUnit.reasons?.[0]?.message.includes('Chemistry') === true, JSON.stringify(reservedUnit))
  const invalid = unwrap(await client.GET('/v1/slugs/{slug}', { params: { path: { slug: 'Journey_App' } } }), 'checkSlug')
  checks.ok('Journey_App is SLUG_INVALID', invalid.reasons?.[0]?.code === 'SLUG_INVALID')
  const ours = unwrap(await client.GET('/v1/slugs/{slug}', { params: { path: { slug: 'journey-app' } } }), 'checkSlug')
  checks.ok(
    'journey-app is free — or already ours from an earlier run',
    ours.available || (state.projectId !== undefined && ours.reasons?.[0]?.code === 'SLUG_TAKEN'),
    JSON.stringify(ours),
  )
}
```

`'before-app': [step1SignedIn, step2MyProjects, step2aCheckTheName]`. Restart the control plane on the new build, then `pnpm typecheck && make demo-journey`, and the boot line shows `"reservedLabels":755`.

- [ ] **Step 7: Gates, commit, controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A packages/control-plane/src packages/contract packages/journey infra/reserved-labels/labels.yaml
git commit -m "feat(projects): §23's reserved labels, and GET /v1/slugs/{slug} answering exactly what creation will"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | in `checkSlug`, skip `reserved.lookup` | `slugs.test.ts` *a reserved label* and *grandfathered*; `projects.test.ts` *agree* (the check says available); the journey's *console is reserved* | `git checkout packages/control-plane/src/projects/slugs.ts` |
| b | in `createProject`, delete the `assertSlugAvailable` call | `projects.test.ts` *agree* — creation answers `201` for `console` while the check still refuses it. **This is the test that makes "one function answers both" a fact rather than two functions that happen to agree** | `git checkout packages/control-plane/src/projects/repository.ts` |
| c | in `labels.yaml`, rename the `idp:` label to `idp-x:` | `edge-names.test.ts` *every named site* lists `idp`; `reserved-labels.test.ts`'s `755` | `git checkout infra/reserved-labels/labels.yaml` |
| d | `limit: 60` → `limit: 1_000_000` in `api/testing.ts` | *limits the check to 60 a minute* | `git checkout packages/control-plane/src/api/testing.ts` |
| e | in the loader, drop the `prior !== undefined` check | *refuses a label in two places* | `git checkout packages/control-plane/src/projects/reserved-labels.ts` |
| f | boot with `MANIFEST_RESERVED_LABELS_DIR=/tmp/empty-dir` (after `mkdir /tmp/empty-dir`) | the control plane refuses to boot, naming `RESERVED_LABELS_MISSING` and the directory | `rmdir /tmp/empty-dir`, boot normally |

---
## Task 10: Blueprints with starters, and the knowledge pack over the API

**What §25 and D25 ask.** A starter is a complete application published with its blueprint and laid over the skeleton at creation, validated when the blueprint loads so a broken one is never offered; `node-ts-mongo@1`'s first is §16's proof app. The knowledge pack is served over the API and versioned with its blueprint, so an agent learns the platform's conventions without running inside it. And the console's step 2 needs a list of blueprints to choose from, which does not exist.

**Files:**
- Move: `fixtures/proof-app/` → `blueprints/node-ts-mongo/starters/proof-app/` (`git mv`, contents unchanged)
- Create: `packages/control-plane/src/blueprints/tree.ts` (`readTextTree`, `BlueprintLoadError`)
- Create: `packages/control-plane/src/api/representations/blueprints.ts`, `api/routes/blueprints.ts`
- Modify: `packages/control-plane/src/blueprints/descriptor.ts` (`starters`), `blueprints/registry.ts` (skeleton, starters, pack — read and validated at load), `blueprints/index.ts`
- Modify: `blueprints/node-ts-mongo/blueprint.yaml` (`starters:`)
- Modify: `packages/control-plane/src/blueprints/blueprints.test.ts`, `proof-app-identity.test.ts`, `session-component.test.ts` (the fixture's new path)
- Modify: `scripts/lib/proof-app.sh`, `scripts/demo-identity.sh` (the starter's path)
- Modify: `packages/control-plane/src/api/authz-contract.ts`, `api/routes/index.ts`, `api/error-codes.ts`
- Modify: `packages/journey/src/main.ts`; the regenerated contract
- Modify: `docs/superpowers/ORIENTATION.md` §3 and `docs/superpowers/RUNBOOK.md` wherever they name `fixtures/proof-app`

**Interfaces:**
- Produces, on `BlueprintRegistry`: `skeleton(ref: string): Readonly<Record<string, string>> | undefined`; `starter(ref: string, name: string): { name: string; summary: string; files: Readonly<Record<string, string>> } | undefined`; `knowledgePack(ref: string): readonly KnowledgePackFile[] | undefined` where `KnowledgePackFile = { path: string; mediaType: 'text/markdown' | 'text/plain'; sha256: string; content: string }`.
- Produces: `readTextTree(root: string, limits: { maxFiles: number; maxBytes: number }, what: string): Promise<Record<string, string>>`; `BlueprintLoadError` (`BLUEPRINT_TREE_*`, `BLUEPRINT_STARTER_*` — boot errors).
- Produces: `GET /v1/blueprints` (`listBlueprints` → `Blueprint[]`), `GET /v1/blueprints/{blueprintRef}` (`getBlueprint` → `Blueprint`), `GET /v1/blueprints/{blueprintRef}/knowledge-pack` (`getKnowledgePack` → `KnowledgePack`).
- Consumes: `manifestSchema`, `checkBlueprintCompatibility` (existing); `defineRoute` (Task 6).

- [ ] **Step 1: Move the proof app, and prove nothing moved with it**

```bash
cd /Users/rich/Developer/manifest
git mv fixtures/proof-app blueprints/node-ts-mongo/starters/proof-app
grep -rn "fixtures/proof-app" packages scripts infra Makefile docs/superpowers/ORIENTATION.md docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md README.md
```

Change every hit that is a **path something reads** — `scripts/lib/proof-app.sh`'s `cp -R "$ROOT/fixtures/proof-app/."` becomes `cp -R "$ROOT/blueprints/node-ts-mongo/starters/proof-app/."` with its comment saying the starter is now the one statement of what the proof app is; `demo-identity.sh`; `proof-app-identity.test.ts`'s `new URL('../../../../fixtures/proof-app/', …)` becomes `new URL('../../../../blueprints/node-ts-mongo/starters/proof-app/', …)`; `session-component.test.ts`'s `join(REPO_ROOT, 'fixtures/proof-app')` likewise — and every **document that tells a reader where it is**. A dated record stays as written.

```bash
pnpm exec vitest run --project unit src/blueprints/
```

Expected: green. **`blueprints.test.ts` reads blueprint trees**: if any of its tests walks every file under `blueprints/node-ts-mongo/` (not only `skeleton/`), the starter is now in that walk. A starter is laid over the skeleton, so a rule about an app's files — its imports, its pins — applies to it too; decide per test, and record each decision in the sitting's findings.

- [ ] **Step 2: Write the failing tests**

In `packages/control-plane/src/blueprints/blueprints.test.ts`:

```ts
import { cp, mkdtemp, readFile as readText, writeFile as writeText } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const BLUEPRINTS = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

/** A throwaway copy of the blueprints root, so a broken starter never touches the real one. */
async function blueprintsCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mf-blueprints-'))
  await cp(BLUEPRINTS, dir, { recursive: true, filter: (src) => !src.includes('node_modules') })
  return dir
}

describe('starters and the knowledge pack, read at load (§25, D25 — P5a Task 10)', () => {
  it('offers node-ts-mongo@1’s proof-app starter, laid over a skeleton that has the auth component', async () => {
    const registry = await loadBlueprints(BLUEPRINTS)
    const starter = registry.starter('node-ts-mongo@1', 'proof-app')
    expect(starter?.summary).toContain('CWL sign-in')
    expect(Object.keys(starter!.files)).toEqual(expect.arrayContaining(['manifest.yaml', 'server.js', 'public/index.html']))
    expect(Object.keys(registry.skeleton('node-ts-mongo@1')!)).toEqual(expect.arrayContaining(['server.js', 'package.json', 'package-lock.json', 'auth/session.js']))
    expect(registry.starter('node-ts-mongo@1', 'no-such-starter')).toBeUndefined()
    expect(registry.starter('fixture-node@1', 'proof-app')).toBeUndefined()
  })

  it('serves the knowledge pack with a digest a client can check', async () => {
    const pack = (await loadBlueprints(BLUEPRINTS)).knowledgePack('node-ts-mongo@1')!
    const agents = pack.find((f) => f.path === 'AGENTS.md')!
    expect(agents.mediaType).toBe('text/markdown')
    expect(agents.content).toContain('manifest.yaml')
    const { createHash } = await import('node:crypto')
    expect(agents.sha256).toBe(createHash('sha256').update(agents.content).digest('hex'))
  })

  it('refuses to load a starter whose manifest.yaml is not a valid manifest', async () => {
    const root = await blueprintsCopy()
    const manifest = join(root, 'node-ts-mongo/starters/proof-app/manifest.yaml')
    await writeText(manifest, (await readText(manifest, 'utf8')).replace('manifest: 1', 'manifest: 7'))
    await expect(loadBlueprints(root)).rejects.toMatchObject({ code: 'BLUEPRINT_STARTER_INVALID' })
  })

  it('refuses to load a starter the blueprint cannot deliver', async () => {
    const root = await blueprintsCopy()
    const manifest = join(root, 'node-ts-mongo/starters/proof-app/manifest.yaml')
    await writeText(manifest, (await readText(manifest, 'utf8')).replace('type: mongo', 'type: postgres'))
    await expect(loadBlueprints(root)).rejects.toMatchObject({ code: 'BLUEPRINT_STARTER_INVALID' })
  })

  it('refuses a binary file in a starter', async () => {
    const root = await blueprintsCopy()
    await writeText(join(root, 'node-ts-mongo/starters/proof-app/public/logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x47]))
    await expect(loadBlueprints(root)).rejects.toMatchObject({ code: 'BLUEPRINT_TREE_NOT_TEXT' })
  })

  it('refuses a starter whose path is not ./starters/<its name>/', async () => {
    const root = await blueprintsCopy()
    const yamlPath = join(root, 'node-ts-mongo/blueprint.yaml')
    await writeText(yamlPath, (await readText(yamlPath, 'utf8')).replace('path: ./starters/proof-app/', 'path: ./starters/other/'))
    await expect(loadBlueprints(root)).rejects.toMatchObject({ code: 'BLUEPRINT_STARTER_PATH' })
  })
})
```

In `api/delivery.test.ts` — or a new `api/blueprints.test.ts` with the file's usual `testDeps`/`buildServer`/`loginAs` setup:

```ts
describe('blueprints over the API (§25, D25 — P5a Task 10)', () => {
  it('lists every blueprint with its starters, and nothing registry-internal', async () => {
    const { app, cookies } = await signedIn()
    const list = (await app.inject({ method: 'GET', url: '/v1/blueprints', cookies })).json()
    const ntm = list.find((b: { ref: string }) => b.ref === 'node-ts-mongo@1')
    expect(ntm.starters).toEqual([{ name: 'proof-app', summary: expect.stringContaining('CWL sign-in') }])
    expect(JSON.stringify(list)).not.toContain('sha256:')        // no base-image digest
    expect(JSON.stringify(list)).not.toContain('run_as_uid')
    await app.close()
  })

  it('answers an unknown blueprint 404, and serves a known one’s knowledge pack', async () => {
    const { app, cookies } = await signedIn()
    expect((await app.inject({ method: 'GET', url: '/v1/blueprints/nope@1', cookies })).statusCode).toBe(404)
    const pack = (await app.inject({ method: 'GET', url: '/v1/blueprints/node-ts-mongo@1/knowledge-pack', cookies })).json()
    expect(pack.blueprint).toBe('node-ts-mongo@1')
    expect(pack.files.map((f: { path: string }) => f.path)).toContain('AGENTS.md')
    await app.close()
  })
})
```

In `api/authz-contract.ts`, three rows — every signed-in actor passes and `anonymous` is 401 (a blueprint belongs to no project):

```ts
  { method: 'GET', url: '/v1/blueprints', request: () => ({ url: '/v1/blueprints' }), expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 401 } },
  { method: 'GET', url: '/v1/blueprints/:blueprintRef', request: () => ({ url: '/v1/blueprints/fixture-node@1' }), expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 401 } },
  { method: 'GET', url: '/v1/blueprints/:blueprintRef/knowledge-pack', request: () => ({ url: '/v1/blueprints/fixture-node@1/knowledge-pack' }), expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 401 } },
```

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/blueprints/blueprints.test.ts src/api/blueprints.test.ts src/api/authz-contract.test.ts
```

Expected: FAIL — `registry.starter` is not a function; the routes are `ROUTE_NOT_FOUND`.

- [ ] **Step 3: Read trees safely**

`packages/control-plane/src/blueprints/tree.ts`:

```ts
import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * A blueprint's skeleton, a starter and a knowledge pack are TEXT the platform copies into
 * a project's repository or serves to a client (P5a Task 10). Read once at boot, bounded,
 * and refused — naming the file — when a tree holds something `SeedFiles` cannot carry.
 */
export class BlueprintLoadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'BlueprintLoadError'
  }
}

export async function readTextTree(
  root: string,
  limits: { maxFiles: number; maxBytes: number },
  what: string,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  let bytes = 0
  async function walk(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name)
      if (entry.name === 'node_modules') continue
      const stat = await lstat(full)
      if (stat.isSymbolicLink()) {
        throw new BlueprintLoadError('BLUEPRINT_TREE_SYMLINK', `${what}: ${relative(root, full)} is a symbolic link, which a repository seed cannot carry`)
      }
      if (stat.isDirectory()) {
        await walk(full)
        continue
      }
      const content = await readFile(full)
      if (content.includes(0)) {
        throw new BlueprintLoadError('BLUEPRINT_TREE_NOT_TEXT', `${what}: ${relative(root, full)} is not text — a starter and a skeleton hold text files only`)
      }
      bytes += content.length
      const path = relative(root, full).split(sep).join('/')
      files[path] = content.toString('utf8')
      if (Object.keys(files).length > limits.maxFiles || bytes > limits.maxBytes) {
        throw new BlueprintLoadError('BLUEPRINT_TREE_TOO_LARGE', `${what} is over ${limits.maxFiles} files or ${limits.maxBytes} bytes`)
      }
    }
  }
  await walk(root)
  return files
}
```

- [ ] **Step 4: The descriptor and the registry**

`blueprints/descriptor.ts`, after `pinned_dependencies`:

```ts
    /**
     * §25 *Starters* (P5a Task 10): complete apps laid over the skeleton at project
     * creation and copied once. `path` must be `./starters/<name>/` — the registry checks
     * that the two agree, because a name that points at another starter's files is a
     * console offering one app and seeding a different one.
     */
    starters: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z][a-z0-9-]{2,38}$/),
            path: z.string().regex(/^\.\/starters\/[a-z][a-z0-9-]{2,38}\/$/),
            summary: z.string().min(1).max(200),
          })
          .strict(),
      )
      .optional(),
```

`blueprints/registry.ts`, replacing the file:

```ts
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { manifestSchema } from '../spec/index.js'
import { checkBlueprintCompatibility } from './compatibility.js'
import { descriptorSchema, type BlueprintDescriptor } from './descriptor.js'
import { BlueprintLoadError, readTextTree } from './tree.js'

export interface KnowledgePackFile {
  path: string
  mediaType: 'text/markdown' | 'text/plain'
  sha256: string
  content: string
}

export interface LoadedStarter {
  name: string
  summary: string
  files: Readonly<Record<string, string>>
}

export interface BlueprintRegistry {
  list(): BlueprintDescriptor[]
  /** Resolves a "name@major" reference, exactly as manifest.yaml pins it. */
  resolve(ref: string): BlueprintDescriptor | undefined
  /** Absolute path to a blueprint's directory — the builder needs it for the Dockerfile. */
  pathOf(ref: string): string | undefined
  /** `skeleton/`, as text (P5a Task 10). */
  skeleton(ref: string): Readonly<Record<string, string>> | undefined
  starter(ref: string, name: string): LoadedStarter | undefined
  /** D25: the knowledge pack, served over the API and versioned with the blueprint. */
  knowledgePack(ref: string): readonly KnowledgePackFile[] | undefined
}

/** §25: a starter holds an app's own code, not a dependency tree. */
const STARTER_LIMITS = { maxFiles: 200, maxBytes: 5 * 1024 * 1024 }
/** The skeleton carries a lockfile, which is most of its weight. */
const SKELETON_LIMITS = { maxFiles: 200, maxBytes: 5 * 1024 * 1024 }
const PACK_LIMITS = { maxFiles: 50, maxBytes: 1024 * 1024 }

async function loadStarter(dir: string, descriptor: BlueprintDescriptor, entry: { name: string; path: string; summary: string }): Promise<LoadedStarter> {
  const ref = `${descriptor.blueprint}@${descriptor.major_version}`
  if (entry.path !== `./starters/${entry.name}/`) {
    throw new BlueprintLoadError('BLUEPRINT_STARTER_PATH', `${ref}: starter '${entry.name}' names path ${entry.path}, not ./starters/${entry.name}/`)
  }
  const files = await readTextTree(join(dir, entry.path), STARTER_LIMITS, `${ref} starter ${entry.name}`)
  const text = files['manifest.yaml']
  if (text === undefined) {
    throw new BlueprintLoadError('BLUEPRINT_STARTER_INVALID', `${ref}: starter '${entry.name}' has no manifest.yaml, and a starter declares what its app needs (§25)`)
  }
  // §25: "validated when the blueprint is loaded — its manifest.yaml against §7 and against
  // the blueprint's own descriptor — so a starter that cannot pass validation is never
  // offered." The CATALOGUE is checked at creation: LiteLLM is not a boot dependency of this.
  const parsed = manifestSchema.safeParse(parseYaml(text))
  if (!parsed.success) {
    throw new BlueprintLoadError('BLUEPRINT_STARTER_INVALID', `${ref}: starter '${entry.name}'s manifest.yaml is not a valid manifest: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`)
  }
  const incompatible = checkBlueprintCompatibility(parsed.data, descriptor)
  if (incompatible.length > 0) {
    throw new BlueprintLoadError('BLUEPRINT_STARTER_INVALID', `${ref}: starter '${entry.name}' asks for what ${ref} cannot deliver: ${incompatible.map((e) => e.message).join('; ')}`)
  }
  return { name: entry.name, summary: entry.summary, files }
}

export async function loadBlueprints(root: string): Promise<BlueprintRegistry> {
  const entries = await readdir(root, { withFileTypes: true })
  const byRef = new Map<string, {
    descriptor: BlueprintDescriptor
    dir: string
    skeleton: Record<string, string>
    starters: Map<string, LoadedStarter>
    pack: KnowledgePackFile[]
  }>()

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const text = await readFile(join(dir, 'blueprint.yaml'), 'utf8')
    const descriptor = descriptorSchema.parse(parseYaml(text))
    const ref = `${descriptor.blueprint}@${descriptor.major_version}`
    const skeleton = await readTextTree(join(dir, 'skeleton'), SKELETON_LIMITS, `${ref} skeleton`)
    const starters = new Map<string, LoadedStarter>()
    for (const starter of descriptor.starters ?? []) {
      starters.set(starter.name, await loadStarter(dir, descriptor, starter))
    }
    const packFiles = await readTextTree(join(dir, descriptor.knowledge_pack), PACK_LIMITS, `${ref} knowledge pack`)
    const pack = Object.entries(packFiles).map(([path, content]) => ({
      path,
      mediaType: path.endsWith('.md') ? ('text/markdown' as const) : ('text/plain' as const),
      sha256: createHash('sha256').update(content).digest('hex'),
      content,
    }))
    byRef.set(ref, { descriptor, dir, skeleton, starters, pack })
  }

  return {
    list: () => [...byRef.values()].map((v) => v.descriptor),
    resolve: (ref) => byRef.get(ref)?.descriptor,
    pathOf: (ref) => byRef.get(ref)?.dir,
    skeleton: (ref) => byRef.get(ref)?.skeleton,
    starter: (ref, name) => byRef.get(ref)?.starters.get(name),
    knowledgePack: (ref) => byRef.get(ref)?.pack,
  }
}
```

`blueprints/index.ts` exports `BlueprintLoadError`, `readTextTree`, and the types `KnowledgePackFile` and `LoadedStarter`.

`blueprints/node-ts-mongo/blueprint.yaml`, after `knowledge_pack: ./agents/`:

```yaml
# §25 Starters (P5a Task 10): complete apps a project can start from, laid over the
# skeleton at project creation and copied once — the project owns them from then on.
# Validated when this file is loaded, against §7 and against this descriptor, so a
# starter that cannot pass is never offered. The proof app is the first: it is §16's,
# which is what makes §22's step 6 — sign in, write a note, ask — reachable from a
# project a person created in the console.
starters:
  - name: proof-app
    path: ./starters/proof-app/
    summary: CWL sign-in, a private note, and a question answered from your notes
```

- [ ] **Step 5: The representations and the routes**

`packages/control-plane/src/api/representations/blueprints.ts`:

```ts
import { z } from 'zod/v4'
import type { BlueprintDescriptor, KnowledgePackFile } from '../../blueprints/index.js'
import { representation } from '../contract/schemas.js'

export const Blueprint = representation(
  'Blueprint',
  z
    .object({
      ref: z.string().describe('`name@major` — what a project pins (§25).'),
      name: z.string(),
      majorVersion: z.number().int(),
      language: z.string(),
      defaultPort: z.number().int(),
      healthPath: z.string(),
      schemaVersions: z.array(z.number().int()),
      provides: z.object({
        services: z.array(z.string()),
        authProviders: z.array(z.enum(['cwl', 'none'])),
        ai: z.boolean(),
      }),
      starters: z.array(z.object({ name: z.string(), summary: z.string() })),
    })
    .describe('A blueprint as a client chooses one: what it provides and the starters it offers. Never its base image or build internals.'),
)
export const BlueprintList = representation('BlueprintList', z.array(Blueprint))

export const KnowledgePack = representation(
  'KnowledgePack',
  z
    .object({
      blueprint: z.string(),
      files: z.array(
        z.object({
          path: z.string(),
          mediaType: z.enum(['text/markdown', 'text/plain']),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
          content: z.string(),
        }),
      ),
    })
    .describe('D25: the files that teach an agent to write a valid manifest.yaml and wire the blueprint, versioned with it.'),
)

export function toBlueprint(d: BlueprintDescriptor): z.input<typeof Blueprint> {
  return {
    ref: `${d.blueprint}@${d.major_version}`,
    name: d.blueprint,
    majorVersion: d.major_version,
    language: d.runtime.language,
    defaultPort: d.runtime.default_port,
    healthPath: d.runtime.health_path,
    schemaVersions: d.schema_versions,
    provides: { services: d.provides.services, authProviders: d.provides.auth_providers, ai: d.provides.ai },
    starters: (d.starters ?? []).map((s) => ({ name: s.name, summary: s.summary })),
  }
}

export function toKnowledgePack(ref: string, files: readonly KnowledgePackFile[]): z.input<typeof KnowledgePack> {
  return { blueprint: ref, files: files.map((f) => ({ path: f.path, mediaType: f.mediaType, sha256: f.sha256, content: f.content })) }
}
```

`packages/control-plane/src/api/routes/blueprints.ts`:

```ts
import { z } from 'zod/v4'
import { AuthorizationError } from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { Blueprint, BlueprintList, KnowledgePack, toBlueprint, toKnowledgePack } from '../representations/blueprints.js'

const RefParams = z.strictObject({ blueprintRef: z.string().regex(/^[a-z][a-z0-9-]{2,38}@[1-9][0-9]*$/) })

export const blueprintRoutes = [
  defineRoute({
    operationId: 'listBlueprints',
    method: 'GET',
    path: '/v1/blueprints',
    tag: 'blueprints',
    summary: 'The blueprint catalogue',
    description: '§22 step 2: what a person chooses from, with the starters each offers (§25).',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'Every published blueprint.', schema: BlueprintList },
    errors: [],
    handler: async ({ deps }) => deps.blueprints.list().map(toBlueprint),
  }),
  defineRoute({
    operationId: 'getBlueprint',
    method: 'GET',
    path: '/v1/blueprints/{blueprintRef}',
    tag: 'blueprints',
    summary: 'A blueprint',
    description: 'One blueprint by `name@major`.',
    params: RefParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The blueprint.', schema: Blueprint },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, params }) => {
      const descriptor = deps.blueprints.resolve(params.blueprintRef)
      if (descriptor === undefined) throw new AuthorizationError('NOT_FOUND', `no blueprint '${params.blueprintRef}'`)
      return toBlueprint(descriptor)
    },
  }),
  defineRoute({
    operationId: 'getKnowledgePack',
    method: 'GET',
    path: '/v1/blueprints/{blueprintRef}/knowledge-pack',
    tag: 'blueprints',
    summary: 'A blueprint’s knowledge pack',
    description: 'D25: served over the API and versioned with its blueprint, so an agent learns the conventions without running inside the platform. Each file carries its sha256.',
    params: RefParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The pack.', schema: KnowledgePack },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, params }) => {
      const pack = deps.blueprints.knowledgePack(params.blueprintRef)
      if (pack === undefined) throw new AuthorizationError('NOT_FOUND', `no blueprint '${params.blueprintRef}'`)
      return toKnowledgePack(params.blueprintRef, pack)
    },
  }),
]
```

`routes/index.ts` gains `...blueprintRoutes`.

- [ ] **Step 6: Regenerate, run, and the journey chooses**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test
```

`packages/journey/src/main.ts`:

```ts
import { createHash } from 'node:crypto'

/** §22 step 2: choose a blueprint and a starter (§25), and read what an agent would (D25). */
async function step2bChooseABlueprint(): Promise<void> {
  checks.step('2b. A blueprint and a starter, from the catalogue')
  const catalogue = unwrap(await client.GET('/v1/blueprints'), 'listBlueprints')
  const ntm = checks.must('node-ts-mongo@1 is in the catalogue', catalogue.find((b) => b.ref === 'node-ts-mongo@1'))
  checks.ok('it offers the proof-app starter', ntm.starters.some((s) => s.name === 'proof-app'), JSON.stringify(ntm.starters))
  const pack = unwrap(
    await client.GET('/v1/blueprints/{blueprintRef}/knowledge-pack', { params: { path: { blueprintRef: 'node-ts-mongo@1' } } }),
    'getKnowledgePack',
  )
  const agents = pack.files.find((f) => f.path === 'AGENTS.md')
  checks.ok('its knowledge pack teaches manifest.yaml', agents?.content.includes('manifest.yaml') === true)
  checks.ok(
    'and each file’s sha256 is the digest of what arrived',
    pack.files.every((f) => createHash('sha256').update(f.content).digest('hex') === f.sha256),
  )
}
```

`'before-app': [step1SignedIn, step2MyProjects, step2aCheckTheName, step2bChooseABlueprint]`. Restart the control plane; `pnpm typecheck && make demo-journey`; then `make demo-identity` — the proof app is now copied from the starter's path, and this is the demo that proves the move changed nothing it builds.

- [ ] **Step 7: Gates, commit, controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A blueprints fixtures packages/control-plane/src packages/contract packages/journey scripts docs/superpowers
git commit -m "feat(blueprints): starters and the knowledge pack, read and validated at load, and served over /v1 (§25, D25)"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | in `loadStarter`, delete the `checkBlueprintCompatibility` block | *refuses to load a starter the blueprint cannot deliver* | `git checkout packages/control-plane/src/blueprints/registry.ts` |
| b | in `readTextTree`, delete the NUL check | *refuses a binary file in a starter* | `git checkout packages/control-plane/src/blueprints/tree.ts` |
| c | in `toBlueprint`, add `baseImage: d.runtime.base_image` — and add it to `Blueprint` | *lists every blueprint … and nothing registry-internal* (`sha256:` present) | `git checkout` both |
| d | in `blueprint.yaml`, `summary:` → an empty string | the control plane refuses to boot (`descriptorSchema`), naming `starters.0.summary` — a broken starter is never offered | `git checkout blueprints/node-ts-mongo/blueprint.yaml` |

---

## Task 11: A project is created from its skeleton and a starter, for a stated audience

> **Sitting 6 correction (2026-09-16) — two lines below restate what Task 9 made one copy of.** (1) **`CreateProjectRequest`'s `slug` is `z.string().min(1)` — no `.max(64)`.** With the bound, a name longer than 64 characters answers `400 REQUEST_INVALID` from the request schema instead of `400 SLUG_INVALID` from `checkSlug`, and §23 says the check and creation answer with the same code; measured in sitting 6 on the check's own param and on the unconverted body, and `api/projects.test.ts`'s *answers 200 whatever the answer* now sends an 80-character name. (2) **`createProject`'s unique-violation catch throws `new SlugRefusedError(slugTaken(input.slug))`** — `projects/slugs.ts` exports `slugTaken`, the one copy of the TAKEN sentence — not the object literal written out below. Also: `ProjectError` no longer exists (Task 9 deleted it), and the authorization contract suite now asserts each refusal's code, so a new row's `403`/`404` must be `FORBIDDEN`/`NOT_FOUND`.

**What changes.** §22 step 2 is *name, blueprint and starter, and who it is for*; step 3 is *repository created from the blueprint's skeleton and the chosen starter, `manifest.yaml` validated* — watched, which needs events that do not exist. Today's creation seeds a stub and emits nothing, and it commits the project row before the repository exists (P4b finding 178). This task rebuilds it in Decision 29's order.

> **Task 1 correction (2026-09-16, `[M4c]`/`[M4c+]`) — Step 4's rename reformats the starter, and Step 1's test cannot see it.** `parseDocument` + `set('name', slug)` + `String(manifest)` keeps every comment and still changes three other lines of `fixtures/proof-app/manifest.yaml` (yaml 2.9.0): it folds the 120-character `description:` line at 80 columns, and pads `attributes: [ubcEduCwlPuid, …]` and `models: [default-chat, default-embed]` to `[ … ]`. No `toString` option reproduces the file — `lineWidth: 0` stops the fold, but `flowCollectionPadding` sets flow maps and flow sequences together and the file pads only its maps. The reviewer reading a starter's manifest for IAM registration should see the author's file. **(M4c's own `lines changed: 58` was a measurement defect**: it compared line *i* with line *i*, so the one inserted line shifted every later one.)
>
> **In Step 4, replace the last three lines of `renderProjectSeed`** with a splice at the `name` scalar's source range — measured byte-exact on the real file, and correct for a quoted or commented original (`name: "x"`, `name: x # c`):
>
> ```ts
>   const source = starter.files['manifest.yaml']!
>   // The slug replaces the `name` VALUE in the author's own text, byte for byte (P5a Task 1,
>   // [M4c+]): re-stringifying the document keeps comments but refolds long lines and
>   // re-pads flow collections. A slug is a plain scalar by §7's rule, so it needs no quoting.
>   const name = parseDocument(source).get('name', true)
>   if (!isScalar(name) || !name.range) {
>     throw new SeedError('SEED_STARTER_UNKNOWN', `starter '${input.starter}' has no top-level scalar name in manifest.yaml`)
>   }
>   const manifest = source.slice(0, name.range[0]) + input.slug + source.slice(name.range[1])
>   return { ...skeleton, ...starter.files, 'manifest.yaml': manifest }
> ```
>
> with `import { isScalar, parseDocument } from 'yaml'`. (Typechecked under this package's `tsconfig.json` on 2026-09-16.) **In Step 1's *keeps every comment* test, add** `expect(seeded).toBe(original.replace(/^name: .*$/m, 'name: journey-app'))` — measured: it passes with the splice and FAILS with `String(manifest)`, which the comment comparison alone does not. Add that as a negative-control row: *put `String(parseDocument(…))` back* → *renames the starter's manifest … and keeps every comment* goes red on the byte comparison.

**Files:**
- Create: `packages/control-plane/src/blueprints/seed.ts`, `seed.test.ts`
- Create: `packages/control-plane/drizzle/0010_*.sql` (generated: `projects.starter`; the events CHECK with three new types)
- Modify: `packages/control-plane/src/db/schema.ts` (`projects.starter`; `events_type_known`), `observability/events.ts` (`EVENT_TYPES`)
- Modify: `packages/control-plane/src/projects/repository.ts` (`createProject` in one transaction, with `starter` and `audience`; `deleteProject`)
- Modify: `packages/control-plane/src/api/routes/projects.ts` (`POST /v1/projects` through `defineRoute`), `api/representations/projects.ts` (`starter`, `AudienceInput`, `CreateProjectRequest`, `CreatedProject`)
- Modify: `packages/control-plane/src/api/testing.ts` (`projectBody`), every test that creates a project over HTTP, `api/authz-contract.ts`, `lifecycle.test.ts`, `api/contract/coverage.test.ts`, `api/error-codes.ts`
- Modify: `scripts/lib/proof-app.sh`, `scripts/demo.sh` (the creation body)
- Modify: `packages/journey/src/main.ts`; the regenerated contract

**Interfaces:**
- Produces: `renderProjectSeed(registry: BlueprintRegistry, input: { blueprintRef: string; slug: string; starter?: string }): Record<string, string>` — skeleton, the starter over it, `manifest.yaml` renamed to the slug with its comments kept, or the minimal manifest without a starter.
- Produces: `POST /v1/projects` (`createProject`) — body `CreateProjectRequest` `{ slug, blueprint, starter?, audience: { scale, burst, justification? } }` → 201 `CreatedProject` (`Project` with `environments` and `spec: SpecValidation`).
- Produces: event types `project.created`, `repository.seeded`, `spec.validated`.
- Produces: `projectBody(slug: string, options?: { blueprint?: string; starter?: string }): Record<string, unknown>` in `api/testing.ts`.
- Changes: `createProject(db, config, reserved, input: { slug; ownerId; blueprintRef; starter: string | null; audience: StoredAudience })`; `Project` gains `starter: string | null`.
- Consumes: the registry's `skeleton` and `starter` (Task 10); `assertSlugAvailable` (Task 9); `modelPolicy`, `validationContext` (existing, exported in Task 8); `publishEvent`, `makeRedactor` (P4b).

- [ ] **Step 1: Write the failing seed tests**

`packages/control-plane/src/blueprints/seed.test.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { loadBlueprints } from './registry.js'
import { renderProjectSeed } from './seed.js'

const registry = await loadBlueprints(fileURLToPath(new URL('../../../../blueprints', import.meta.url)))

describe('a project’s first commit (§25, P5a Task 11)', () => {
  it('is the skeleton with the starter laid over it, and the starter wins where both have a file', () => {
    const seed = renderProjectSeed(registry, { blueprintRef: 'node-ts-mongo@1', slug: 'journey-app', starter: 'proof-app' })
    expect(seed['auth/session.js']).toBe(registry.skeleton('node-ts-mongo@1')!['auth/session.js'])
    expect(seed['public/index.html']).toBe(registry.starter('node-ts-mongo@1', 'proof-app')!.files['public/index.html'])
    expect(seed['server.js']).toBe(registry.starter('node-ts-mongo@1', 'proof-app')!.files['server.js'])
  })

  it('renames the starter’s manifest to the project’s slug and keeps every comment', () => {
    const original = registry.starter('node-ts-mongo@1', 'proof-app')!.files['manifest.yaml']!
    const seeded = renderProjectSeed(registry, { blueprintRef: 'node-ts-mongo@1', slug: 'journey-app', starter: 'proof-app' })['manifest.yaml']!
    expect(parse(seeded).name).toBe('journey-app')
    const comments = (t: string) => t.split('\n').filter((l) => l.trim().startsWith('#'))
    expect(comments(seeded)).toEqual(comments(original))
  })

  it('without a starter, is the skeleton and a minimal manifest named for the project', () => {
    const seed = renderProjectSeed(registry, { blueprintRef: 'fixture-node@1', slug: 'chem-labs' })
    expect(seed['server.js']).toBeDefined()
    expect(parse(seed['manifest.yaml']!)).toMatchObject({ manifest: 1, name: 'chem-labs', blueprint: 'fixture-node@1', runtime: { port: 3000, health: '/healthz' } })
    expect(seed['src/index.js']).toBeUndefined()
  })

  it('refuses an unknown blueprint or starter by name', () => {
    expect(() => renderProjectSeed(registry, { blueprintRef: 'nope@1', slug: 'x-x-x' })).toThrow(/nope@1/)
    expect(() => renderProjectSeed(registry, { blueprintRef: 'node-ts-mongo@1', slug: 'x-x-x', starter: 'nope' })).toThrow(/nope/)
  })
})
```

- [ ] **Step 2: Write the failing creation tests**

`api/testing.ts`:

```ts
/**
 * A `POST /v1/projects` body (P5a Task 11). The audience is REQUIRED — §24 asks it at
 * creation — so every test that creates a project states one; `solo`/`steady` because no
 * test here depends on it.
 */
export function projectBody(
  slug: string,
  options: { blueprint?: string; starter?: string } = {},
): Record<string, unknown> {
  return {
    slug,
    blueprint: options.blueprint ?? 'fixture-node@1',
    ...(options.starter === undefined ? {} : { starter: options.starter }),
    audience: { scale: 'solo', burst: 'steady' },
  }
}
```

In `api/projects.test.ts`, the `describe('POST /projects', …)` block is replaced:

```ts
describe('POST /v1/projects (§22 steps 2–3, P5a Task 11)', () => {
  it('creates a project from node-ts-mongo@1’s proof-app starter, for a stated audience', async () => {
    const { deps, app, cookies, me } = await signedIn()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      cookies,
      headers: mutationHeaders(deps),
      payload: {
        slug: 'journey-app',
        blueprint: 'node-ts-mongo@1',
        starter: 'proof-app',
        audience: { scale: 'class', burst: 'synchronised', justification: 'CHEM 121, used live in lectures' },
      },
    })
    expect(res.statusCode).toBe(201)
    const created = res.json()
    expect(created).toMatchObject({
      slug: 'journey-app',
      blueprint: 'node-ts-mongo@1',
      starter: 'proof-app',
      audience: { scale: 'class', burst: 'synchronised', justification: 'CHEM 121, used live in lectures', setBy: me.id },
      spec: { valid: true, errors: [], commitSha: expect.stringMatching(/^[0-9a-f]{40}$/) },
    })
    expect(created.environments).toHaveLength(3)
    const repo = deps.source.repositoryFor('journey-app')
    expect(await deps.source.readFile(repo, created.spec.commitSha, 'public/index.html')).not.toBeNull()
    expect(await deps.source.readFile(repo, created.spec.commitSha, 'auth/session.js')).not.toBeNull()
    await app.close()
  })

  it('requires the audience question to be answered', async () => {
    const { deps, app, cookies } = await signedIn()
    const res = await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(deps), payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('REQUEST_INVALID')
    expect(res.json().error.message).toContain('audience')
    await app.close()
  })

  it('refuses a starter the blueprint does not offer, and leaves no project behind', async () => {
    const { deps, app, cookies } = await signedIn()
    const res = await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(deps), payload: projectBody('chem-labs', { starter: 'proof-app' }) })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('STARTER_NOT_FOUND')
    expect((await app.inject({ method: 'GET', url: '/v1/slugs/chem-labs', cookies })).json().available).toBe(true)
    await app.close()
  })

  it('leaves no project behind when its repository cannot be created (P4b finding 178)', async () => {
    const deps = await testDeps()
    const failing = {
      ...deps,
      source: { ...deps.source, createRepository: () => Promise.reject(new SourceError('SOURCE_GIT_FAILED', 'git init failed')) },
    }
    const app = await buildServer(failing)
    const cookies = await loginAs(failing, 'bio_prof')
    const res = await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(failing), payload: projectBody('chem-labs') })
    expect(res.json().error.code).toBe('SOURCE_GIT_FAILED')
    expect((await app.inject({ method: 'GET', url: '/v1/slugs/chem-labs', cookies })).json().available).toBe(true)
    expect(await failing.db.select().from(events)).toEqual([])
    await app.close()
  })

  it('publishes project.created, repository.seeded and spec.validated, in that order, once the repository exists', async () => {
    const { deps, app, cookies } = await signedIn()
    const frames: { type?: string; machineDetail?: unknown }[] = []
    // The project id is not known until the response, so listen to every project's frames.
    const publish = deps.bus.publish.bind(deps.bus)
    deps.bus.publish = (frame) => { frames.push(frame as never); publish(frame) }
    const res = await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(deps), payload: projectBody('chem-labs') })
    expect(frames.map((f) => f.type)).toEqual(['project.created', 'repository.seeded', 'spec.validated'])
    expect(frames[2]!.machineDetail).toMatchObject({ valid: true, commitSha: res.json().spec.commitSha })
    await app.close()
  })
})
```

(`signedIn()` returns `{ deps, app, cookies, me }`, `me` read from `GET /v1/me`; `SourceError` from `../source/index.js`, `events` from `../db/index.js`.) Replace every other test's creation payload — `authz-contract.ts`'s fixture and its `POST /v1/projects` row, `lifecycle.test.ts`, `delivery.test.ts`, `events.test.ts`, `csrf.test.ts`, the Task 8 and 9 helpers — with `projectBody(slug)`:

```bash
cd /Users/rich/Developer/manifest/packages/control-plane
grep -rn "blueprint: 'fixture-node@1'" src --include='*.test.ts' src/api/authz-contract.ts
```

- [ ] **Step 3: Watch them fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/blueprints/seed.test.ts src/api/projects.test.ts
```

Expected: `seed.js` missing; the creation answers without `starter`/`audience`/`spec`, accepts a missing audience, and publishes nothing.

- [ ] **Step 4: The seed**

`packages/control-plane/src/blueprints/seed.ts`:

```ts
import { parseDocument } from 'yaml'
import type { BlueprintRegistry } from './registry.js'

export class SeedError extends Error {
  constructor(
    readonly code: 'SEED_BLUEPRINT_UNKNOWN' | 'SEED_STARTER_UNKNOWN',
    message: string,
  ) {
    super(message)
    this.name = 'SeedError'
  }
}

/**
 * A project's FIRST COMMIT (§25 *What this changes in the control plane*): the blueprint's
 * skeleton, with the chosen starter laid over it — the starter wins where both carry a file,
 * because the starter is the app and the skeleton is the base it replaces parts of.
 *
 * `manifest.yaml`'s `name` is set to the project's slug, because §7 refuses a manifest whose
 * name is not its project's (SPEC_NAME_SLUG_MISMATCH). Through `parseDocument`, which keeps
 * every comment: a starter's manifest explains itself to the reviewer who reads it for IAM
 * registration, and a rewrite that stripped that would hand them a bare file (P5a Task 1, M4c).
 *
 * Without a starter: the skeleton and the minimal manifest creation has always seeded.
 */
export function renderProjectSeed(
  registry: BlueprintRegistry,
  input: { blueprintRef: string; slug: string; starter?: string },
): Record<string, string> {
  const descriptor = registry.resolve(input.blueprintRef)
  const skeleton = registry.skeleton(input.blueprintRef)
  if (descriptor === undefined || skeleton === undefined) {
    throw new SeedError('SEED_BLUEPRINT_UNKNOWN', `no blueprint '${input.blueprintRef}'`)
  }
  if (input.starter === undefined) {
    return {
      ...skeleton,
      'manifest.yaml': [
        'manifest: 1',
        `name: ${input.slug}`,
        `blueprint: ${input.blueprintRef}`,
        'runtime:',
        `  port: ${descriptor.runtime.default_port}`,
        `  health: ${descriptor.runtime.health_path}`,
        '',
      ].join('\n'),
    }
  }
  const starter = registry.starter(input.blueprintRef, input.starter)
  if (starter === undefined) {
    throw new SeedError('SEED_STARTER_UNKNOWN', `blueprint '${input.blueprintRef}' offers no starter '${input.starter}'`)
  }
  const manifest = parseDocument(starter.files['manifest.yaml']!)
  manifest.set('name', input.slug)
  return { ...skeleton, ...starter.files, 'manifest.yaml': String(manifest) }
}
```

Export `renderProjectSeed` and `SeedError` from `blueprints/index.ts`.

- [ ] **Step 5: The schema, the migration and the repository**

`db/schema.ts`: `projects` gains, after `blueprintRef`,

```ts
    // §25 (P5a Task 11): the starter the first commit was seeded from — provenance a
    // console and an administrator both ask for. Null for a skeleton-only project.
    starter: text('starter'),
```

and `events_type_known`'s list gains `'project.created', 'repository.seeded', 'spec.validated'`. `observability/events.ts`'s `EVENT_TYPES` gains the same three, each with a one-line comment:

```ts
  /** §22 step 3 (P5a): a project and its three environments exist. */
  'project.created',
  /** Its repository exists, seeded from the skeleton and the starter. */
  'repository.seeded',
  /** Its manifest.yaml was validated at a commit — valid or not. */
  'spec.validated',
```

```bash
cd /Users/rich/Developer/manifest
set -a; . ./.env; set +a
# DDL, so the ADMIN url — drizzle.config.ts reads MANIFEST_ADMIN_DATABASE_URL, never the app role's.
export MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
pnpm --filter @manifest/control-plane db:generate
cat packages/control-plane/drizzle/0010_*.sql
pnpm --filter @manifest/control-plane db:migrate
```

Read the generated SQL before migrating: it must `ALTER TABLE "projects" ADD COLUMN "starter" text`, and **drop and re-add** `events_type_known` naming all fifteen types. If it does not touch the constraint, write those two statements by hand below a `--> statement-breakpoint`, exactly as migration 0009 does — and remember an applied migration is never re-run (ORIENTATION §4).

`projects/repository.ts`:

```ts
export interface StoredAudience {
  scale: 'solo' | 'class' | 'large_course' | 'public'
  burst: 'steady' | 'synchronised'
  justification: string | null
  /** §24: "recorded with actor and timestamp on the project". */
  set_by: string
  set_at: string
}

export interface CreateProjectInput {
  slug: string
  ownerId: string
  blueprintRef: string
  starter: string | null
  audience: StoredAudience
}

/**
 * The project, its owner's membership and its three environments — in ONE TRANSACTION
 * (P5a Decision 29), so there is never a project without an owner or an environment. The
 * slug is checked by §23's one function first; the unique index catches a name taken
 * between the check and the insert.
 */
export async function createProject(
  db: Db,
  config: Config,
  reserved: ReservedLabels,
  input: CreateProjectInput,
): Promise<{ project: Project; environments: Environment[] }> {
  await assertSlugAvailable(db, reserved, input.slug)
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ slug: input.slug, ownerId: input.ownerId, blueprintRef: input.blueprintRef, starter: input.starter, audience: input.audience })
      .returning()
      .catch((error: unknown) => {
        if ((error as { cause?: { code?: string } }).cause?.code === UNIQUE_VIOLATION) {
          throw new SlugRefusedError({
            code: 'SLUG_TAKEN',
            message: `'${input.slug}' is already a project's name.`,
            hint: 'Project names are unique across the platform, because each becomes a hostname (§23). Choose another.',
          })
        }
        throw error
      })
    if (!project) throw new Error('project insert returned no row')
    await tx.insert(projectMembers).values({ projectId: project.id, userId: input.ownerId, role: 'owner' })
    const created = await tx
      .insert(environments)
      .values(ENVIRONMENT_KINDS.map((kind) => ({ projectId: project.id, kind, hostname: hostnameFor(config, kind, project.slug) })))
      .returning()
    return { project, environments: created }
  })
}

/**
 * Removes a project that never got a repository (P5a Decision 29) — and ONLY such a
 * project: it runs before any event is recorded, and `audit.events` RESTRICTs a delete
 * of a project that has one, which is the refusal this relies on never meeting.
 */
export async function deleteProject(db: Db, projectId: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, projectId))
}
```

`createProject`'s input gained `starter` and `audience`, so **every other caller changes too** — `grep -rn "createProject(" packages/control-plane/src` — each passing `starter: null` and a fixed audience (`{ scale: 'solo', burst: 'steady', justification: null, set_by: <the owner's id>, set_at: '2026-09-16T00:00:00.000Z' }`).

- [ ] **Step 6: The route**

`api/representations/projects.ts` — `Project` gains `starter: z.string().nullable().describe('The starter the first commit was seeded from (§25).')` between `blueprint` and `owner`, `toProject` maps `view.project.starter`, the file's own `StoredAudience` interface is deleted for the one `projects/repository.ts` now exports, Task 8's `PROJECT_KEYS` in `projects.test.ts` gains `'starter'`, and:

```ts
export const AudienceInput = request(
  'AudienceInput',
  z.strictObject({
    scale: z.enum(['solo', 'class', 'large_course', 'public']).describe('§24: how many people.'),
    burst: z.enum(['steady', 'synchronised']).describe('§24: do they all arrive at once.'),
    justification: z.string().max(1000).optional(),
  }),
)

export const CreateProjectRequest = request(
  'CreateProjectRequest',
  z.strictObject({
    slug: z.string().min(1).max(64).describe('Checked by the same function as GET /v1/slugs/{slug} (§23).'),
    blueprint: z.string().min(1).describe('`name@major`, from GET /v1/blueprints.'),
    starter: z.string().min(1).optional().describe('One the blueprint offers. Without one: the skeleton and a minimal manifest.'),
    audience: AudienceInput,
  }),
)

export const CreatedProject = representation(
  'CreatedProject',
  Project.extend({ environments: z.array(Environment), spec: SpecValidation }).describe(
    '§22 steps 2–3: the project, its environments, and the validation of the manifest its first commit carries.',
  ),
)
```

(`SpecValidation` from `./specs.js`; `request` from `../contract/schemas.js`.)

In `api/routes/projects.ts`, the `app.post('/v1/projects', …)` handler is deleted and replaced by a definition — and `registerProjectRoutes` is deleted with it once nothing remains in it:

```ts
export const createProjectRoutes = [
  defineRoute({
    operationId: 'createProject',
    method: 'POST',
    path: '/v1/projects',
    tag: 'projects',
    summary: 'Create a project',
    description:
      '§22 steps 2–3: a name, a blueprint, optionally a starter, and who the app is for (§24). Creates the project and its three environments, seeds a repository from the skeleton and the starter, and validates its manifest. Progress is on the project’s event stream: project.created, repository.seeded, spec.validated.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: CreateProjectRequest,
    success: { status: 201, description: 'The project, as created.', schema: CreatedProject },
    errors: ['SLUG_INVALID', 'SLUG_RESERVED', 'SLUG_TAKEN', 'BLUEPRINT_NOT_FOUND', 'STARTER_NOT_FOUND', 'SOURCE_GIT_FAILED', 'AI_BACKEND_UNAVAILABLE', 'AI_CATALOGUE_EMPTY'],
    handler: async ({ deps, actor, body }) => {
      // 1. The blueprint and the starter exist — before anything is checked against them.
      if (deps.blueprints.resolve(body.blueprint) === undefined) {
        throw new BadRequestError('BLUEPRINT_NOT_FOUND', `no blueprint '${body.blueprint}'`,
          `Available: ${deps.blueprints.list().map((b) => `${b.blueprint}@${b.major_version}`).join(', ')}`)
      }
      if (body.starter !== undefined && deps.blueprints.starter(body.blueprint, body.starter) === undefined) {
        const offered = deps.blueprints.resolve(body.blueprint)!.starters?.map((s) => s.name) ?? []
        throw new BadRequestError('STARTER_NOT_FOUND', `blueprint '${body.blueprint}' offers no starter '${body.starter}'`,
          offered.length === 0 ? 'This blueprint offers no starters; leave `starter` out.' : `Offered: ${offered.join(', ')}`)
      }
      // 2. The name — §23's one function.
      await assertSlugAvailable(deps.db, deps.reservedLabels, body.slug)
      // 3. The seed, and the catalogue only if the seed declares a model — BEFORE anything
      //    is written, so a gateway outage writes nothing (P4b finding 45).
      const seed = renderProjectSeed(deps.blueprints, {
        blueprintRef: body.blueprint,
        slug: body.slug,
        ...(body.starter === undefined ? {} : { starter: body.starter }),
      })
      const models = await modelPolicy(deps.catalogue, seed['manifest.yaml']!)
      // 4. The rows, in one transaction.
      const { project, environments: created } = await createProject(deps.db, deps.config, deps.reservedLabels, {
        slug: body.slug,
        ownerId: actor.userId,
        blueprintRef: body.blueprint,
        starter: body.starter ?? null,
        audience: {
          scale: body.audience.scale,
          burst: body.audience.burst,
          justification: body.audience.justification ?? null,
          set_by: actor.userId,
          set_at: new Date().toISOString(),
        },
      })
      // 5. The repository — and no project without one (P4b finding 178, Decision 29).
      let commitSha: string
      let yamlText: string
      try {
        const repo = await deps.source.createRepository(body.slug, seed)
        commitSha = await deps.source.headCommit(repo)
        yamlText = (await deps.source.readFile(repo, commitSha, 'manifest.yaml')) ?? ''
      } catch (error) {
        await deleteProject(deps.db, project.id)
        throw error
      }
      // 6. What was seeded, validated and recorded.
      const result = validateSpec(yamlText, validationContext(project.slug, project.quota as Record<string, unknown>, models))
      const [appSpec] = await deps.db
        .insert(appSpecs)
        .values({ projectId: project.id, commitSha, parsed: result.valid ? result.spec : {}, schemaVersion: 1, valid: result.valid, errors: result.valid ? [] : result.errors })
        .returning()
      // 7. The events — LAST, so no audit row exists for a project whose repository failed.
      //    Nothing secret exists yet; the redactor still runs, as §14 requires of every event.
      const redact = makeRedactor([])
      const subject = `project:${project.slug}`
      await publishEvent(deps.db, deps.bus, {
        projectId: project.id, subject, type: 'project.created',
        machineDetail: { slug: project.slug, blueprint: body.blueprint, starter: body.starter ?? null, audience: { scale: body.audience.scale, burst: body.audience.burst } },
        humanMessage: `${project.slug} was created from ${body.blueprint}${body.starter === undefined ? '' : ` with the ${body.starter} starter`}.`,
      }, redact)
      await publishEvent(deps.db, deps.bus, {
        projectId: project.id, subject, type: 'repository.seeded',
        machineDetail: { commitSha, files: Object.keys(seed).length, starter: body.starter ?? null },
        humanMessage: `${project.slug}'s repository was created with ${Object.keys(seed).length} files.`,
      }, redact)
      const errorCount = result.valid ? 0 : result.errors.length
      await publishEvent(deps.db, deps.bus, {
        projectId: project.id, subject, type: 'spec.validated',
        machineDetail: { appSpecId: appSpec!.id, commitSha, valid: result.valid, errorCount },
        humanMessage: result.valid ? `${project.slug}'s manifest.yaml is valid.` : `${project.slug}'s manifest.yaml has ${errorCount} problem(s) to fix.`,
      }, redact)

      const [view] = await projectViews(deps.db, [project.id])
      return {
        ...toProject(view!),
        environments: created.map((row) => toEnvironment(row, undefined)),
        spec: { appSpecId: appSpec!.id, commitSha, valid: result.valid, errors: result.valid ? [] : result.errors, sensitiveDiff: { sensitive: false, fields: [] } },
      }
    },
  }),
]
```

`routes/index.ts` gains `...createProjectRoutes`; `server.ts` no longer calls `registerProjectRoutes`. `api/error-codes.ts`: add `STARTER_NOT_FOUND: bad('The blueprint offers no starter by that name.')`; the error-code test will name `PROJECT_INVALID_INPUT` as unthrown — delete it. `coverage.test.ts`: remove `'POST /v1/projects'` from `UNCONVERTED`.

- [ ] **Step 7: Regenerate, migrate the test tier, run**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test
```

`events.test.ts` reads `events_type_known` back out of Postgres and compares it with `EVENT_TYPES` — green only if the migration and the list agree.

- [ ] **Step 8: The scripts and the journey create through the new body**

`scripts/lib/proof-app.sh`'s `proof_app_project`:

```bash
  project="$(api POST /v1/projects "{\"slug\":\"$SLUG\",\"blueprint\":\"node-ts-mongo@1\",\"starter\":\"proof-app\",\"audience\":{\"scale\":\"class\",\"burst\":\"synchronised\",\"justification\":\"§16's proof application, used by the demos\"}}")"
```

`proof_app_push` stays — it is how `make demo-redeploy` pushes its changed commits — and its comment gains: *creation now seeds exactly these files (P5a Task 11), so on a new project this push commits nothing new; it is kept for the reused project and for the demos that change the app.* `scripts/demo.sh`'s creation gains `"audience":{"scale":"solo","burst":"steady"}`.

`packages/journey/src/main.ts`:

```ts
import { idempotencyKey } from '@manifest/contract'

/** §22 step 2: name, blueprint, starter, and who it is for (§24). Re-runnable: reuses journey-app. */
async function step2Create(): Promise<void> {
  checks.step('2. Create a project — journey-app, from the proof-app starter, for a class')
  if (state.projectId === undefined) {
    const created = unwrap(
      await client.POST('/v1/projects', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
        body: {
          slug: 'journey-app',
          blueprint: 'node-ts-mongo@1',
          starter: 'proof-app',
          audience: { scale: 'class', burst: 'synchronised', justification: 'P5a’s acceptance journey' },
        },
      }),
      'createProject',
    )
    state.projectId = created.id
    checks.ok('created with the proof-app starter', created.starter === 'proof-app')
    checks.ok('for a class that arrives at once', created.audience?.scale === 'class' && created.audience.burst === 'synchronised')
    checks.ok('its seeded manifest.yaml is valid', created.spec.valid, JSON.stringify(created.spec.errors))
  }
  const project = unwrap(
    await client.GET('/v1/projects/{projectId}', { params: { path: { projectId: state.projectId }, query: { expand: 'environments' } } }),
    'getProject',
  )
  state.projectSlug = project.slug
  const staging = checks.must('it has a staging environment', project.environments?.find((e) => e.kind === 'staging'))
  const production = checks.must('and a production one', project.environments?.find((e) => e.kind === 'production'))
  state.stagingEnvironmentId = staging.id
  state.productionEnvironmentId = production.id
  state.appUrl = staging.url
  checks.ok('staging is journey-app.staging.manifest.internal', staging.hostname === 'journey-app.staging.manifest.internal', staging.hostname)
}
```

`'before-app': [step1SignedIn, step2MyProjects, step2aCheckTheName, step2bChooseABlueprint, step2Create]`. Restart the control plane on the new build, then:

```bash
cd /Users/rich/Developer/manifest
pnpm typecheck && make demo-journey    # creates journey-app the first time
make demo-journey                      # reuses it the second
make demo && make demo-identity        # the demos' creation bodies
```

- [ ] **Step 9: Gates, commit, controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A packages/control-plane packages/contract packages/journey scripts
git commit -m "feat(projects): a project is created from its skeleton and a starter, for a stated audience, and says so on its stream"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | in `renderProjectSeed`, return `{ ...skeleton, 'manifest.yaml': … }` without `...starter.files` | `seed.test.ts` *laid over*; `projects.test.ts` *proof-app starter* (`public/index.html` null) | `git checkout packages/control-plane/src/blueprints/seed.ts` |
| b | delete `manifest.set('name', input.slug)` | *renames the starter's manifest*; *proof-app starter* — `spec.valid` false with `SPEC_NAME_SLUG_MISMATCH` | as (a) |
| c | in the route's `catch`, delete `await deleteProject(…)` | *leaves no project behind when its repository cannot be created* (`available: false`) | `git checkout packages/control-plane/src/api/routes/projects.ts` |
| d | move step 7's three `publishEvent` calls above step 5 | the same test — now `500 INTERNAL`: `deleteProject` meets `audit.events`' `RESTRICT`. **The order is load-bearing, and this is the test that says so** | as (c) |
| e | `audience: AudienceInput` → `audience: AudienceInput.optional()` | *requires the audience question* (201) | `git checkout packages/control-plane/src/api/representations/projects.ts` |

---
## Task 12: The event stream in the contract

**Why it matters.** D23.2 makes one stream per project the way a client learns anything changed, and OpenAPI cannot describe a WebSocket — so today a client learns the frames' shapes by reading `observability/bus.ts`. This task puts every frame and every event's `machineDetail` in the document as schemas, **enforces the payload schemas where events are written** (so the document cannot describe a shape nothing produces), documents the stream's path, and gives the client `subscribe`.

> **Read Task 1's `[M1d]`** — whether `z.discriminatedUnion` emits `oneOf` decides whether the generated `EventFrame` type narrows on `type`. If it does not, the journey's reads below cast after checking `type`, and that is recorded.
>
> **Task 1 result (2026-09-16, `[M1d]`): it does NOT emit `oneOf`.** zod 3.25.76's `zod/v4` renders `z.discriminatedUnion('kind', …)` exactly as it renders `z.union`: an `anyOf` of objects, each with its `kind` as a `const` in `required`, and no `discriminator`. **Whether that narrows is not decided by `oneOf` — it depends on what `openapi-typescript` 7.13.0 generates from an `anyOf` of objects with a `const` property**, which could not be measured in sitting 1 because the package is not installed (it arrives in sitting 5, Task 7, with the network on). So: once `@manifest/contract` generates `EventFrame`, check `schema.d.ts` before writing the journey's reads. A `|` of object types whose `type` is a string literal narrows with no cast; anything else (an intersection, or `type: string`) takes the cast this note describes. Record which in this task's session entry.

> **Sitting 2 correction (2026-09-16) — through the edge, a stream is closed with `1001` by any edge reload, and a Node subscriber needs the CA.** Every Caddy admin-API change — any app's deploy moves a route — reloads the edge's whole config, and a reload closes every WebSocket the old config proxied with `1001 Going Away`: measured the same day, one unrelated route `PUT` closed a stream through `console.manifest.internal` in under 3 s, and `make demo-ai` failed at step 5. Task 3's Caddyfile now sets `stream_close_delay 1h` on the console's `reverse_proxy`, and with it the stream survived a `PUT` and a `DELETE` and `make demo-ai` was green. **So a stream can still end with `1001` an hour after a reload**: the README's close codes must list `1001` as *reconnect and be replayed*, and the journey's waits are well inside the hour. The subscriber is `undici`'s WebSocket, so the Task 7 correction applies to it too: run under `NODE_EXTRA_CA_CERTS`.

**Files:**
- Create: `packages/control-plane/src/observability/event-schemas.ts`
- Create: `packages/control-plane/src/api/representations/events.ts`
- Create: `packages/control-plane/src/api/contract/websocket.ts`
- Create: `packages/control-plane/src/api/stream-contract.test.ts`
- Create: `packages/contract/src/stream.ts`
- Create: `packages/journey/src/wait.ts`
- Modify: `packages/control-plane/src/observability/events.ts` (`recordEvent` validates the detail), `observability/index.ts`, `observability/events.test.ts`
- Modify: `packages/control-plane/src/api/contract/document.ts` (the stream's path), `api/contract/document.test.ts`
- Modify: `packages/control-plane/src/api/routes/events.ts` (the 426's hint names the document)
- Modify: `packages/contract/src/index.ts`, `packages/contract/README.md`; `packages/journey/src/main.ts`; the regenerated contract

**Interfaces:**
- Produces: `EVENT_DETAIL_SCHEMAS: { [T in EventType]: z.ZodType }` (zod/v4) in `observability/event-schemas.ts`; `recordEvent` throws `EventError('EVENT_DETAIL_INVALID', …)` naming the type and the paths.
- Produces: registered representations `EventFrame` (discriminated on `type`), `LogFrame`, `ControlFrame`, `StreamFrame` (their union).
- Produces: `streamPathItem(): Record<string, unknown>` and `STREAM_PATH = '/v1/projects/{projectId}/events'` — merged into the document with `x-manifest-websocket` `{ frame: { $ref: StreamFrame }, replay, ready, closeCodes }`.
- Produces, in `@manifest/contract`: `subscribe(options: { origin: string; session?: string; projectId: string; onFrame(frame: StreamFrame): void }): { ready: Promise<void>; closed: Promise<{ code: number; reason: string }>; close(): void }`; types `StreamFrame`, `EventFrame`, `LogFrame`.
- Produces, in the journey: `waitFor<T>(frames: T[], match: (frame: T) => boolean, timeoutMs: number): Promise<T | undefined>`.
- Consumes: `EVENT_TYPES`, `REPLAY_LIMIT`, `STREAM_READY`, `eventFrame`, `logFrame` (P4b); `Task 4`'s origin check on the upgrade.

- [ ] **Step 1: Write the failing tests**

In `observability/events.test.ts`:

```ts
  it('refuses an event whose machineDetail is not its type’s schema (P5a Task 12)', async () => {
    await withProject(async (tx, { projectId }) => {
      await expect(
        recordEvent(
          tx,
          { projectId, subject: 'build:x', type: 'build.started', machineDetail: { buildId: 'not-a-uuid' }, humanMessage: 'Building.' },
          makeRedactor([]),
        ),
      ).rejects.toMatchObject({ code: 'EVENT_DETAIL_INVALID' })
    })
  })

  it('has a detail schema for every event type, and no schema for a type that does not exist', () => {
    expect(Object.keys(EVENT_DETAIL_SCHEMAS).sort()).toEqual([...EVENT_TYPES].sort())
  })
```

`packages/control-plane/src/api/stream-contract.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../db/testing.js'
import { recentFramesFor, type StreamFrame as BusFrame } from '../observability/index.js'
import { StreamFrame } from './representations/events.js'
import { buildServer } from './server.js'
import { loginAs, mutationHeaders, projectBody, testDeps } from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

/**
 * THE DOCUMENT DESCRIBES WHAT STREAMS (P5a Task 12). Every frame the platform publishes
 * through a whole delivery lifecycle — and every frame a reconnecting client is replayed —
 * must parse as the contract's StreamFrame. A schema nothing checks against real frames is
 * a description of what somebody believed the frames were.
 */
describe('the stream in the contract (D23.2)', () => {
  it('every published and every replayed frame is a StreamFrame', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const published: BusFrame[] = []
    const publish = deps.bus.publish.bind(deps.bus)
    deps.bus.publish = (frame) => {
      published.push(frame)
      publish(frame)
    }

    const project = (await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(deps), payload: projectBody('chem-labs') })).json()
    // Build, release and deploy through whatever routes exist at this task — the unit
    // tier's lifecycle, as `lifecycle.test.ts` drives it.
    const build = (await app.inject({ method: 'POST', url: `/v1/projects/${project.id}/builds`, cookies, headers: mutationHeaders(deps), payload: { commitSha: project.spec.commitSha } })).json()
    const release = (await app.inject({ method: 'POST', url: `/v1/projects/${project.id}/releases`, cookies, headers: mutationHeaders(deps), payload: { buildId: build.id } })).json()
    const staging = project.environments.find((e: { kind: string }) => e.kind === 'staging')
    await app.inject({ method: 'POST', url: `/v1/environments/${staging.id}/deploy`, cookies, headers: mutationHeaders(deps), payload: { releaseId: release.id } })

    const replayed = await recentFramesFor(deps.db, project.id, 50)
    const refused = [...published, ...replayed]
      .map((frame) => ({ frame, result: StreamFrame.safeParse(JSON.parse(JSON.stringify(frame))) }))
      .filter((r) => !r.result.success)
      .map((r) => `${r.frame.kind} ${'type' in r.frame ? r.frame.type : ''}: ${r.result.error!.issues.map((i) => i.path.join('.')).join(', ')}`)
    expect(published.length).toBeGreaterThan(5)
    expect(refused).toEqual([])
    await app.close()
  })
})
```

(Builds are synchronous until Task 13, which adds `await deps.builds.idle()` after the build POST here — and must, or the release is created from a running build.) In `api/contract/document.test.ts`:

```ts
  it('documents the event stream, and names the frame schema every message is', () => {
    const document = openApiDocument(ROUTE_DEFINITIONS) as {
      paths: Record<string, { get?: Record<string, unknown> }>
      components: { schemas: Record<string, unknown> }
    }
    const stream = document.paths['/v1/projects/{projectId}/events']?.get
    expect(stream?.['x-manifest-websocket']).toMatchObject({ frame: { $ref: '#/components/schemas/StreamFrame' }, replay: 50, ready: 'manifest.stream.ready' })
    expect(Object.keys(document.components.schemas)).toEqual(expect.arrayContaining(['StreamFrame', 'EventFrame', 'LogFrame', 'ControlFrame']))
  })
```

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/observability/events.test.ts src/api/stream-contract.test.ts src/api/contract/document.test.ts
```

Expected: FAIL — `EVENT_DETAIL_SCHEMAS` and `representations/events.js` do not exist; the document has no stream path.

- [ ] **Step 2: Every event's payload, as a schema**

`packages/control-plane/src/observability/event-schemas.ts`. **Drafted from the call sites as they read on 2026-09-16** — `sso/registration.ts`, `releases/build.ts`, `releases/release.ts`, `releases/retire.ts` and Task 11's route. Step 4 runs every publisher; a refusal there is corrected **to the shape a client should see**, and if that is not the shape the call site sends, the call site changes and the finding is recorded.

```ts
import { z } from 'zod/v4'
import type { EventType } from './events.js'

/**
 * EVERY EVENT TYPE'S `machineDetail`, as a schema (P5a Decision 33). Enforced where events
 * are written — `recordEvent` refuses a detail that does not parse — and published as the
 * contract's EventFrame union, so a client switches on `type` and gets a typed payload, and
 * the document cannot describe a shape nothing produces.
 *
 * Validated BEFORE redaction: redaction replaces substrings inside strings, so a detail
 * that parses before it parses after. Adding an event type now needs THREE things — this
 * map, `EVENT_TYPES`, and the database's CHECK — and a test holds the first two equal.
 */
const Kind = z.enum(['sandbox', 'staging', 'production'])
const Uuid = z.uuid()
const Sha = z.string().regex(/^[0-9a-f]{40}$/)

const InstanceDetail = z.object({
  instanceId: Uuid,
  releaseId: Uuid,
  environmentId: Uuid,
  environment: Kind,
  state: z.string(),
})

const RetireDetail = z.object({
  instanceId: Uuid.nullable(),
  handle: z.string(),
  environment: Kind,
  drainMs: z.number().int().nonnegative(),
})

export const EVENT_DETAIL_SCHEMAS = {
  'sso.registered': z.object({
    entityId: z.string(),
    acsUrl: z.string(),
    attributes: z.array(z.string()),
    certificateFingerprint: z.string(),
    changed: z.boolean(),
  }),
  'sso.acs_changed': z.object({ from: z.string().nullable(), to: z.string() }),
  'build.started': z.object({ buildId: Uuid, commitSha: Sha, blueprintRef: z.string() }),
  'build.succeeded': z.object({ buildId: Uuid, imageDigest: z.string().nullable(), imageRepository: z.string().nullable() }),
  'build.failed': z.object({ buildId: Uuid, code: z.string().nullable(), reason: z.string() }),
  'instance.healthy': InstanceDetail,
  'instance.failed': InstanceDetail.extend({ failedCheck: z.string() }),
  'incident.opened': z.object({ incidentId: Uuid, instanceId: Uuid, releaseId: Uuid, environment: Kind }),
  'ai.key_rotated': z.object({ instanceId: Uuid, environment: Kind, models: z.array(z.string()) }),
  'instance.retiring': RetireDetail,
  'instance.retired': RetireDetail,
  'instance.retire_failed': RetireDetail.extend({ error: z.string() }),
  'project.created': z.object({
    slug: z.string(),
    blueprint: z.string(),
    starter: z.string().nullable(),
    audience: z.object({ scale: z.string(), burst: z.string() }),
  }),
  'repository.seeded': z.object({ commitSha: Sha, files: z.number().int().positive(), starter: z.string().nullable() }),
  'spec.validated': z.object({ appSpecId: Uuid, commitSha: Sha, valid: z.boolean(), errorCount: z.number().int().nonnegative() }),
} satisfies Record<EventType, z.ZodType>
```

In `observability/events.ts`'s `recordEvent`, after the empty-message refusal:

```ts
  const detail = EVENT_DETAIL_SCHEMAS[input.type].safeParse(input.machineDetail)
  if (!detail.success) {
    throw new EventError(
      'EVENT_DETAIL_INVALID',
      `event '${input.type}' on '${input.subject}' carries a machineDetail its schema refuses, at: ` +
        detail.error.issues.map((i) => i.path.join('.') || '(root)').join(', ') +
        ' — observability/event-schemas.ts is the contract a client reads it by',
    )
  }
```

Export `EVENT_DETAIL_SCHEMAS` from `observability/index.ts`.

- [ ] **Step 3: Frames as representations, and the stream in the document**

`packages/control-plane/src/api/representations/events.ts`:

```ts
import { z } from 'zod/v4'
import { EVENT_DETAIL_SCHEMAS, EVENT_TYPES, STREAM_READY, type EventType } from '../../observability/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

const eventFrameOf = (type: EventType) =>
  z.object({
    kind: z.literal('event'),
    id: Uuid,
    projectId: Uuid,
    subject: z.string(),
    type: z.literal(type),
    humanMessage: z.string().describe('For a person (§14). Never parse it.'),
    machineDetail: EVENT_DETAIL_SCHEMAS[type],
    createdAt: Timestamp,
  })

export const EventFrame = representation(
  'EventFrame',
  z
    .discriminatedUnion('type', EVENT_TYPES.map(eventFrameOf) as unknown as [ReturnType<typeof eventFrameOf>, ...ReturnType<typeof eventFrameOf>[]])
    .describe('An audit Event, as recorded (§20). Replayed on reconnect.'),
)

export const LogFrame = representation(
  'LogFrame',
  z
    .object({
      kind: z.literal('log'),
      id: z.string().describe('`<buildId>:<seq>`.'),
      projectId: Uuid,
      buildId: Uuid,
      seq: z.number().int().nonnegative(),
      stream: z.enum(['stdout', 'stderr']),
      text: z.string().describe('Redacted at capture (§14).'),
      createdAt: Timestamp,
    })
    .describe('One line of a build’s output, as it is written. Never replayed — GET /v1/builds/{buildId}/logs has them all.'),
)

export const ControlFrame = representation(
  'ControlFrame',
  z
    .object({ kind: z.literal('control'), id: z.string(), projectId: Uuid, type: z.literal(STREAM_READY) })
    .describe('Ends the replay: everything after it is live.'),
)

export const StreamFrame = representation(
  'StreamFrame',
  z.union([EventFrame, LogFrame, ControlFrame]).describe('Every message on WS /v1/projects/{projectId}/events is one of these, as JSON. Switch on `kind`, then `type`.'),
)
```

`packages/control-plane/src/api/contract/websocket.ts`:

```ts
import { MAX_BUFFERED_BYTES, REPLAY_LIMIT, STREAM_READY } from '../../observability/index.js'

export const STREAM_PATH = '/v1/projects/{projectId}/events'

/**
 * D23.2's stream, in the one document (P5a Decision 34). OpenAPI describes the handshake —
 * its path, its parameter, the 426 a plain GET gets — and `x-manifest-websocket` describes
 * the conversation: every message is a StreamFrame, a new connection is replayed the newest
 * REPLAY_LIMIT events and then the ready frame, and these close codes end it.
 */
export function streamPathItem(): Record<string, unknown> {
  return {
    get: {
      operationId: 'streamProjectEvents',
      tags: ['events'],
      summary: 'The project’s event stream (WebSocket)',
      description:
        'Upgrade to a WebSocket. Builds, log lines, instance state transitions, incidents and every other audit event for this project, as StreamFrames: the newest events first as a replay, then the ready frame, then live. A session-bearing upgrade must carry Origin (§20). A plain GET answers 426.',
      parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '101': { description: 'Switching Protocols. Every message is one StreamFrame, as JSON.' },
        '426': {
          description: 'This endpoint is a WebSocket.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
        },
        default: {
          description: 'Refused before the upgrade: UNAUTHENTICATED, NOT_FOUND, CSRF_ORIGIN_REFUSED.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
        },
      },
      'x-manifest-websocket': {
        frame: { $ref: '#/components/schemas/StreamFrame' },
        replay: REPLAY_LIMIT,
        ready: STREAM_READY,
        maxBufferedBytes: MAX_BUFFERED_BYTES,
        closeCodes: {
          '1011': 'The stream could not be opened; the operator log says why. Reconnect.',
          '1013': 'The client fell behind (more than maxBufferedBytes queued). Reconnect to be replayed.',
          '4403': 'The upgrade carried a session from another origin.',
          '4404': 'Not found — or not yours.',
        },
      },
    },
  }
}
```

In `document.ts`'s `openApiDocument`, after the loop over routes: `paths[STREAM_PATH] = streamPathItem() as Record<string, JsonSchema>`, and the `tags` list gains `'events'`. The events route's 426 hint gains *"The frames are StreamFrame in packages/contract/openapi.json."*

- [ ] **Step 4: Run every publisher**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test
pnpm test:docker
```

The unit tier runs the build, deploy, incident and retire publishers against the fake driver; **the Docker tier runs `sso/registration.ts`'s against the real IdP and the retirer against real containers** — a detail schema drafted wrong fails there, as `EVENT_DETAIL_INVALID` naming the type and path. Correct the schema to what a client should see and re-run both tiers; record every correction. Restart the control plane after the Docker tier.

- [ ] **Step 5: The client subscribes**

`packages/contract/src/stream.ts`:

```ts
import type { components } from './schema.js'
import { SESSION_COOKIE } from './client.js'

export type StreamFrame = components['schemas']['StreamFrame']
export type EventFrame = components['schemas']['EventFrame']
export type LogFrame = components['schemas']['LogFrame']

export interface SubscribeOptions {
  /** The console's origin. The stream is `wss://<origin>/v1/projects/<projectId>/events`. */
  origin: string
  /** The session cookie's value, for a client that is not a browser. */
  session?: string
  projectId: string
  onFrame(frame: StreamFrame): void
}

export interface Subscription {
  /** Resolves on the ready frame, after the replay; rejects if the socket closes first. */
  ready: Promise<void>
  closed: Promise<{ code: number; reason: string }>
  close(): void
}

const inBrowser = typeof (globalThis as { document?: unknown }).document !== 'undefined'

/**
 * D23.2's stream. In Node, the global WebSocket is undici's, which sends headers given in
 * its second argument (P4b sitting 10; P5a Task 1, M5) — so the session and §20's Origin
 * go there. A browser sends both itself, and its WebSocket takes protocols, not headers.
 */
export function subscribe(options: SubscribeOptions): Subscription {
  const origin = new URL(options.origin).origin
  const url = `${origin.replace(/^http/, 'ws')}/v1/projects/${encodeURIComponent(options.projectId)}/events`
  const socket = inBrowser
    ? new WebSocket(url)
    : new (WebSocket as unknown as new (url: string, init: { headers: Record<string, string> }) => WebSocket)(url, {
        headers: {
          origin,
          ...(options.session === undefined ? {} : { cookie: `${SESSION_COOKIE}=${options.session}` }),
        },
      })

  let markReady: () => void = () => undefined
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve
    socket.addEventListener('close', (event) => reject(new Error(`the event stream closed before it was ready (${event.code})`)), { once: true })
  })
  // A rejection nobody awaited would end a Node process. It is still observable by anyone
  // who awaits `ready`, and `closed` reports the same close — so it is handled, not hidden.
  ready.catch(() => undefined)

  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    socket.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }))
  })

  socket.addEventListener('message', (message) => {
    const frame = JSON.parse(String(message.data)) as StreamFrame
    if (frame.kind === 'control') markReady()
    options.onFrame(frame)
  })

  return { ready, closed, close: () => socket.close() }
}
```

`packages/contract/src/index.ts` gains `export { subscribe } from './stream.js'` and `export type { EventFrame, LogFrame, StreamFrame, Subscription, SubscribeOptions } from './stream.js'`. The README gains a *The event stream* section: the path, the two headers, the replay-then-ready order, the close codes, and that `ready` rejecting is how a refused upgrade shows.

- [ ] **Step 6: The journey watches provisioning**

`packages/journey/src/wait.ts`:

```ts
/** The first frame that matches, or undefined once `timeoutMs` has passed. Polls: frames arrive on the socket's callback. */
export async function waitFor<T>(frames: readonly T[], match: (frame: T) => boolean, timeoutMs: number): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = frames.find(match)
    if (found !== undefined || Date.now() > deadline) return found
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}
```

`packages/journey/src/main.ts`:

```ts
import { subscribe, type StreamFrame } from '@manifest/contract'
import { waitFor } from './wait.js'

/** §22 step 3: watch provisioning — replayed, because it finished before anyone could subscribe. */
async function step3WatchProvisioning(): Promise<void> {
  checks.step('3. Watch provisioning on the project’s stream')
  const frames: StreamFrame[] = []
  const stream = subscribe({ origin, session, projectId: state.projectId!, onFrame: (frame) => frames.push(frame) })
  await stream.ready
  const types = frames.flatMap((f) => (f.kind === 'event' ? [f.type] : []))
  const created = types.indexOf('project.created')
  checks.ok(
    'the replay carries project.created, repository.seeded and spec.validated, in order',
    created >= 0 && types.indexOf('repository.seeded') > created && types.indexOf('spec.validated') > types.indexOf('repository.seeded'),
    types.join(', '),
  )
  const validated = frames.find((f) => f.kind === 'event' && f.type === 'spec.validated')
  checks.ok(
    'and the manifest was valid',
    validated?.kind === 'event' && validated.type === 'spec.validated' && validated.machineDetail.valid === true,
  )
  checks.ok('the replay ended with the ready frame', frames.at(-1)?.kind === 'control')
  stream.close()
}
```

(`'before-app'` gains `step3WatchProvisioning` after `step2Create`.) **On a re-run the replay is the newest 50 events**, and a project that has been built and deployed many times may have pushed `project.created` out of it; if that happens, the step records it and the journey's re-run check reads it from `GET /v1/projects/{projectId}` instead — note it in the findings rather than widening the replay.

```bash
cd /Users/rich/Developer/manifest
pnpm typecheck && pnpm exec vitest run --project packages
# restart the control plane on the new build
make demo-journey
```

- [ ] **Step 7: Gates, commit, controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A packages/control-plane/src packages/contract packages/journey
git commit -m "feat(contract): every stream frame and event payload as a schema, enforced where events are written; subscribe()"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | delete the `EVENT_DETAIL_SCHEMAS[…].safeParse` block from `recordEvent` | `events.test.ts` *refuses an event whose machineDetail is not its type's schema* | `git checkout packages/control-plane/src/observability/events.ts` |
| b | in `bus.ts`'s `eventFrame`, `humanMessage: event.humanMessage` → `message: event.humanMessage` | `stream-contract.test.ts` — every event frame refused at `humanMessage` | `git checkout packages/control-plane/src/observability/bus.ts` |
| c | `REPLAY_LIMIT = 50` → `40` | `document.test.ts` drift **and** *documents the event stream* (`replay: 50`) | `git checkout` the file |
| d | in `stream.ts`, drop `origin` from the Node headers | `make demo-journey` step 3: *the event stream closed before it was ready (1006)* — the upgrade was refused 403 by Task 4's check | `git checkout packages/contract/src/stream.ts` |
| e | add `'build.cancelled'` to `EVENT_TYPES` only | `events.test.ts` *a detail schema for every event type*, and its CHECK comparison | `git checkout` the file |

---

## Task 13: Builds answer 202 and finish on the stream, and every build records its scan

**Rich's call (R6).** `POST /v1/projects/{projectId}/builds` answers **202** with the build `running`; the build runs in the background; `build.succeeded` or `build.failed` arrives on the stream. A build a restart interrupted is marked failed at boot. **And §12's *recorded on the Release*** is made true: `ImageRef` carries a scan summary from every driver, stored on the build and shown on every release of it (Decision 32).

**Files:**
- Create: `packages/control-plane/drizzle/0011_*.sql` (generated: `builds.scan`)
- Create: `packages/control-plane/src/api/representations/builds.ts`, `api/routes/builds.ts`
- Modify: `packages/control-plane/src/runtime/driver.ts` (`ScanSummary`, `SeverityCounts`, `ImageRef.scan`), `runtime/fake-driver.ts`, `runtime/driver-contract.ts`
- Modify: `packages/control-plane/src/build/scan.ts` (`summarizeScan`), `build/index.ts`, `build/scan.test.ts`
- Modify: `packages/control-plane/src/runtime/docker/driver.ts` (returns the summary)
- Modify: `packages/control-plane/src/db/schema.ts` (`builds.scan`)
- Modify: `packages/control-plane/src/releases/build.ts` (`createBuildRunner`; `startBuild` deleted), `releases/recover.ts` (interrupted builds), `releases/index.ts`, and their tests
- Modify: `packages/control-plane/src/api/server.ts` (`ServerDeps.builds`), `api/testing.ts`, `src/index.ts` (the runner; `recoverAtBoot` gets the bus; the boot line), `api/routes/delivery.ts` (the three build routes removed)
- Modify: `packages/control-plane/src/api/{delivery,events,projects,stream-contract}.test.ts`, `lifecycle.test.ts`, `api/authz-contract.ts`, `boot.docker.test.ts`, `api/contract/coverage.test.ts`, `api/error-codes.ts`
- Modify: `scripts/lib/api.sh` (`wait_for_build`), `scripts/lib/proof-app.sh`, `scripts/demo.sh`, `scripts/demo-redeploy.sh`, `scripts/demo-ai.sh`
- Modify: `packages/journey/src/main.ts`; the regenerated contract; `README.md`, `RUNBOOK.md` (a build answers 202)

**Interfaces:**
- Produces, in `runtime/driver.ts`: `interface SeverityCounts { critical; high; medium; low; negligible; unknown }` (numbers); `interface ScanSummary { scanner: string; scannedAt: string; databaseAgeDays: number; stale: boolean; fixable: SeverityCounts; unfixable: SeverityCounts; baseImage: SeverityCounts; unfixableFindings: { id: string; severity: string; package: string }[] }`; `ImageRef.scan: ScanSummary` (**required**).
- Produces: `summarizeScan(result: ScanResult, scannedAt: Date): ScanSummary` in `build/`.
- Produces: `createBuildRunner(deps: { db; driver; bus }): BuildRunner` with `start(input: StartBuildInput): Promise<Build>` and `idle(): Promise<void>`; `ServerDeps.builds: BuildRunner`.
- Changes: `recoverAtBoot({ db, driver, retirer, bus })`; `RecoveryReport.buildsInterrupted: number`.
- Produces: `POST /v1/projects/{projectId}/builds` (`startBuild` → **202** `Build`), `GET /v1/builds/{buildId}` (`getBuild`), `GET /v1/builds/{buildId}/logs` (`getBuildLog` → `BuildLog`), `GET /v1/projects/{projectId}/builds` (`listBuilds` → `Build[]`, newest 50).
- Produces: `wait_for_build <buildId>` in `scripts/lib/api.sh` — prints the terminal build, exits 1 after 960 s.

- [ ] **Step 1: Write the failing tests**

In `api/delivery.test.ts`:

```ts
describe('a build answers at once and finishes on the stream (R6, P5a Task 13)', () => {
  it('answers 202 while the build is still running, and GET tells the rest', async () => {
    const deps = await testDeps()
    // A fake driver whose build waits for the test to let it finish.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const buildImage = deps.driver.buildImage.bind(deps.driver)
    deps.driver.buildImage = async (...args) => {
      await gate
      return buildImage(...args)
    }
    deps.builds = createBuildRunner({ db: deps.db, driver: deps.driver, bus: deps.bus })
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const project = (await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(deps), payload: projectBody('chem-labs') })).json()

    const started = await app.inject({ method: 'POST', url: `/v1/projects/${project.id}/builds`, cookies, headers: mutationHeaders(deps), payload: {} })
    expect(started.statusCode).toBe(202)
    expect(started.json().status).toBe('running')
    expect((await app.inject({ method: 'GET', url: `/v1/builds/${started.json().id}`, cookies })).json().status).toBe('running')

    release()
    await deps.builds.idle()
    const done = (await app.inject({ method: 'GET', url: `/v1/builds/${started.json().id}`, cookies })).json()
    expect(done).toMatchObject({ status: 'succeeded', imageDigest: expect.stringMatching(/^sha256:/) })
    expect(done.scan).toMatchObject({ scanner: 'fake', stale: false, fixable: { critical: 0, high: 0 } })
    expect(done).not.toHaveProperty('imageRepository')
    await app.close()
  })

  it('lists a project’s builds, newest first', async () => {
    const { deps, app, cookies, project } = await projectWithBuilds(2)
    const list = (await app.inject({ method: 'GET', url: `/v1/projects/${project.id}/builds`, cookies })).json()
    expect(list).toHaveLength(2)
    expect(Date.parse(list[0].createdAt)).toBeGreaterThanOrEqual(Date.parse(list[1].createdAt))
    await app.close()
  })
})
```

(`projectWithBuilds(n)` beside them: creates a project, starts `n` builds, `await deps.builds.idle()`.) In `releases/recover.test.ts`:

```ts
  it('fails a build the restart interrupted, and says so on the stream (P5a Task 13)', async () => {
    await withProject(async (tx, { projectId }) => {
      const [spec] = await tx.insert(appSpecs).values({ projectId, commitSha: 'a'.repeat(40), parsed: {}, schemaVersion: 1, valid: true }).returning()
      const [running] = await tx.insert(builds).values({ projectId, commitSha: 'a'.repeat(40), appSpecId: spec!.id, status: 'running' }).returning()
      const bus = createEventBus()
      const frames: StreamFrame[] = []
      bus.subscribe(projectId, (f) => frames.push(f))
      const report = await recoverAtBoot({ db: tx, driver: createFakeDriver(), retirer: { schedule: () => undefined }, bus })
      expect(report.buildsInterrupted).toBe(1)
      const [after] = await tx.select().from(builds).where(eq(builds.id, running!.id))
      expect(after).toMatchObject({ status: 'failed', error: expect.stringContaining('BUILD_INTERRUPTED') })
      expect(frames.map((f) => (f.kind === 'event' ? f.type : f.kind))).toEqual(['build.failed'])
    })
  })
```

In `runtime/driver-contract.ts`, beside the existing build tests:

```ts
    it('reports the scan of what it built (§12, P5a Task 13)', async () => {
      const image = await driver.buildImage(fixture.source, fixture.buildSpec)
      const counts = (c: Record<string, number>) => Object.values(c).every((n) => Number.isInteger(n) && n >= 0)
      expect(image.scan.scanner).not.toBe('')
      expect(Number.isNaN(Date.parse(image.scan.scannedAt))).toBe(false)
      expect(typeof image.scan.stale).toBe('boolean')
      expect(counts(image.scan.fixable) && counts(image.scan.unfixable) && counts(image.scan.baseImage)).toBe(true)
      // A build with a fixable Critical or High is REFUSED (§12), so none survives to here.
      expect(image.scan.fixable.critical + image.scan.fixable.high).toBe(0)
    })
```

(Use the contract suite's own names for the source and spec its existing *builds an image* test passes — read the file for them.) In `build/scan.test.ts`:

```ts
  it('summarizes a scan into counts by severity and the unfixable findings by id', () => {
    const summary = summarizeScan(scanResultWith({
      unfixableFindings: [{ id: 'GHSA-1', severity: 'Critical', package: 'passport-saml', packageType: 'npm', layerIds: ['l2'], fixAvailable: false }],
      baseImageFindings: [{ id: 'CVE-2', severity: 'High', package: 'libssl3', packageType: 'apk', layerIds: ['l1'], fixAvailable: true }],
      databaseAgeDays: 1.5,
    }), new Date('2026-09-16T00:00:00Z'))
    expect(summary).toMatchObject({
      scanner: 'anchore/grype:v0.118.0',
      scannedAt: '2026-09-16T00:00:00.000Z',
      databaseAgeDays: 1.5,
      unfixable: { critical: 1, high: 0 },
      baseImage: { critical: 0, high: 1 },
      unfixableFindings: [{ id: 'GHSA-1', severity: 'Critical', package: 'passport-saml' }],
    })
  })
```

(`scanResultWith` beside it: a complete `ScanResult` with empty arrays, overridden by its argument.)

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/delivery.test.ts src/releases/recover.test.ts src/build/scan.test.ts src/runtime/
```

Expected: FAIL — `createBuildRunner`, `summarizeScan`, `image.scan` and `buildsInterrupted` do not exist; the build POST answers 201 after the whole build.

- [ ] **Step 2: The scan summary, from every driver**

In `runtime/driver.ts`, beside `ImageRef`:

```ts
export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
  negligible: number
  unknown: number
}

/**
 * §12's scan of what a build produced, as the platform RECORDS it (P5a Task 13). Required
 * on every ImageRef, from every driver: §12 says unfixable findings are "recorded on the
 * Release", and a field a driver may omit is a record nobody can rely on.
 */
export interface ScanSummary {
  /** `anchore/grype:v0.118.0`, or `fake` — so a summary never passes for a real scan. */
  scanner: string
  scannedAt: string
  databaseAgeDays: number
  /** A clean result from a stale database is NOT evidence there is nothing to find (§12). */
  stale: boolean
  /** Introduced by this build and fixable. A build with a Critical or High here is refused. */
  fixable: SeverityCounts
  /** Introduced by this build, with no published fix: recorded, never blocking (Rich, 2026-09-08). */
  unfixable: SeverityCounts
  /** The base image's own — §20's fleet-wide rebuild. */
  baseImage: SeverityCounts
  /** The unfixable findings a person would look up. At most 50. */
  unfixableFindings: { id: string; severity: string; package: string }[]
}

export interface ImageRef {
  digest: string
  repository: string
  scan: ScanSummary
}
```

In `build/scan.ts`:

```ts
const zero = (): SeverityCounts => ({ critical: 0, high: 0, medium: 0, low: 0, negligible: 0, unknown: 0 })

function count(findings: readonly Vulnerability[]): SeverityCounts {
  const counts = zero()
  for (const f of findings) counts[f.severity.toLowerCase() as keyof SeverityCounts] += 1
  return counts
}

/** What the platform records of a scan (P5a Task 13): counts, staleness, and the unfixable by id. */
export function summarizeScan(result: ScanResult, scannedAt: Date): ScanSummary {
  return {
    scanner: GRYPE,
    scannedAt: scannedAt.toISOString(),
    databaseAgeDays: result.databaseAgeDays,
    stale: result.stale,
    fixable: count(result.appFindings),
    unfixable: count(result.unfixableFindings),
    baseImage: count(result.baseImageFindings),
    unfixableFindings: result.unfixableFindings.slice(0, 50).map((f) => ({ id: f.id, severity: f.severity, package: f.package })),
  }
}
```

(export it from `build/index.ts`; `SeverityCounts`/`ScanSummary` imported from `../runtime/index.js`.) In `runtime/docker/driver.ts`, the build's return becomes `return { repository: …, digest, scan: summarizeScan(scan, new Date()) }`, and the comment *"Persisting these on the Release row is owed and is `releases/`'s to do"* is replaced by *"Recorded on the build as `scan` since P5a Task 13, and shown on every release of it — this line stays as the operator's copy."* In `runtime/fake-driver.ts`, `buildImage` returns

```ts
        // `fake`, so a summary from this driver is never read as a real scan.
        scan: {
          scanner: 'fake',
          scannedAt: new Date().toISOString(),
          databaseAgeDays: 0,
          stale: false,
          fixable: { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, unknown: 0 },
          unfixable: { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, unknown: 0 },
          baseImage: { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, unknown: 0 },
          unfixableFindings: [],
        },
```

`db/schema.ts`'s `builds` gains `scan: jsonb('scan')` with the comment *"§12's scan of the image, as `ScanSummary` (P5a Task 13). Null for a failed build and for every build before this column."* Then:

```bash
cd /Users/rich/Developer/manifest
set -a; . ./.env; set +a
export MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
pnpm --filter @manifest/control-plane db:generate && cat packages/control-plane/drizzle/0011_*.sql
pnpm --filter @manifest/control-plane db:migrate
```

- [ ] **Step 3: The build runner, and boot**

In `releases/build.ts`, `startBuild` is split into the two halves a runner needs — **the same code, moved, not rewritten**:

```ts
export interface BuildRunnerDeps {
  db: Db
  driver: Driver
  bus: EventBus
}

export interface BuildRunner {
  /**
   * Records the build and `build.started`, and returns the RUNNING row (R6). The build
   * itself runs after this resolves; its end is `build.succeeded` or `build.failed`.
   */
  start(input: StartBuildInput): Promise<Build>
  /** Resolves when no build is running — for tests and the acceptance. */
  idle(): Promise<void>
}

/**
 * The control plane's SECOND background work, after the retirer (P5a Decision 31). One per
 * process, built at boot, holding the driver rather than reaching for it.
 */
export function createBuildRunner(deps: BuildRunnerDeps): BuildRunner {
  const inFlight = new Set<Promise<void>>()
  return {
    async start(input) {
      const { created, redact, log } = await recordBuildStart(deps, input)
      const run: Promise<void> = finishBuild(deps, input, created, redact, log)
        .then(() => undefined)
        .catch((error: unknown) => {
          // finishBuild records a FAILED build itself; reaching here means it could not
          // even do that — a database outage mid-build. Not swallowed: the operator's copy,
          // a code and the build id, never a message (§14).
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'a build could not record how it ended; boot will mark it interrupted',
              buildId: created.id,
              error: (error as { code?: string }).code ?? (error as Error).name,
            }),
          )
        })
        .finally(() => inFlight.delete(run))
      inFlight.add(run)
      return created
    },
    async idle() {
      while (inFlight.size > 0) await Promise.all([...inFlight])
    },
  }
}
```

`recordBuildStart` is `startBuild`'s body up to and including the `build.started` event and `createBuildLogWriter`; `finishBuild` is the rest, from `driver.buildImage` to the end, with `scan: image.scan` added to the success `update(builds).set({…})`. `startBuild` is **deleted** — a second path to the same work is how the two drift — and every test that called it creates a runner and awaits `idle()`.

In `releases/recover.ts`, `recoverAtBoot`'s deps gain `bus: EventBus`, the report gains `buildsInterrupted`, and a pass runs **first**:

```ts
  /**
   * PASS 0 — THE BUILDS this process was running when it stopped (P5a Task 13). A build runs
   * in the background since R6, so a restart leaves its row `running` for ever unless boot
   * ends it. Failed, with the reason as its error and its last log line, and published —
   * a client waiting on the stream for this build's end gets one.
   */
  const unfinished = await deps.db.select().from(builds).where(inArray(builds.status, ['pending', 'running']))
  for (const build of unfinished) {
    const reason = 'BUILD_INTERRUPTED: the control plane stopped while this build was running; start it again'
    await deps.db.update(builds).set({ status: 'failed', error: reason }).where(eq(builds.id, build.id))
    await publishEvent(
      deps.db,
      deps.bus,
      {
        projectId: build.projectId,
        subject: `build:${build.id}`,
        type: 'build.failed',
        machineDetail: { buildId: build.id, code: 'BUILD_INTERRUPTED', reason },
        humanMessage: 'A build was interrupted when the platform restarted. Start it again.',
      },
      makeRedactor([]),
    )
  }
```

and `buildsInterrupted: unfinished.length` in the return. `src/index.ts` passes `bus` to `recoverAtBoot` — and so does every other caller (`grep -rn "recoverAtBoot(" packages/control-plane/src`: `recover.test.ts`'s existing tests and `boot.docker.test.ts`) — builds `const builds = createBuildRunner({ db, driver, bus })` beside the retirer, passes it to `buildServer`, and the boot line gains `buildsInterrupted: recovery.buildsInterrupted`. `api/testing.ts` builds one from the fake driver. `boot.docker.test.ts`'s recovery tests gain one: a `running` build row inserted before the spawn is `failed` after it, and the boot line says `"buildsInterrupted":1`.

- [ ] **Step 4: The representations and the routes**

`packages/control-plane/src/api/representations/builds.ts`:

```ts
import { z } from 'zod/v4'
import type { builds } from '../../db/index.js'
import type { StoredBuildLogLine } from '../../observability/index.js'
import type { ScanSummary as DriverScanSummary } from '../../runtime/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'

const Counts = z.object({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  negligible: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
})

export const ScanSummary = representation(
  'ScanSummary',
  z
    .object({
      scanner: z.string(),
      scannedAt: Timestamp,
      databaseAgeDays: z.number().nonnegative(),
      stale: z.boolean().describe('A clean result from a stale database is not evidence there is nothing to find (§12).'),
      fixable: Counts,
      unfixable: Counts.describe('No published fix: recorded, not blocking (§12).'),
      baseImage: Counts.describe('The base image’s own — the blueprint’s to fix (§20).'),
      unfixableFindings: z.array(z.object({ id: z.string(), severity: z.string(), package: z.string() })),
    })
    .describe('§12’s scan of the image a build produced.'),
)

export const Build = representation(
  'Build',
  z.object({
    id: Uuid,
    projectId: Uuid,
    commitSha: z.string().regex(/^[0-9a-f]{40}$/),
    status: z.enum(['pending', 'running', 'succeeded', 'failed']),
    imageDigest: z.string().nullable(),
    error: z.string().nullable().describe('Why a failed build failed, in words its author can act on (§14).'),
    scan: ScanSummary.nullable(),
    createdAt: Timestamp,
  }),
)
export const BuildList = representation('BuildList', z.array(Build))

export const BuildLog = representation(
  'BuildLog',
  z.object({
    buildId: Uuid,
    lines: z.array(z.object({ seq: z.number().int().nonnegative(), stream: z.enum(['stdout', 'stderr']), text: z.string(), at: Timestamp })),
  }),
)

export const StartBuildRequest = request(
  'StartBuildRequest',
  z.strictObject({ commitSha: z.string().regex(/^[0-9a-f]{40}$/).optional().describe('Defaults to the newest validated spec’s commit.') }),
)

export function toBuild(row: typeof builds.$inferSelect): z.input<typeof Build> {
  return {
    id: row.id,
    projectId: row.projectId,
    commitSha: row.commitSha,
    status: row.status,
    imageDigest: row.imageDigest,
    error: row.error,
    scan: (row.scan as DriverScanSummary | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toBuildLog(buildId: string, lines: readonly StoredBuildLogLine[]): z.input<typeof BuildLog> {
  return { buildId, lines: lines.map((l) => ({ seq: l.seq, stream: l.stream, text: l.text, at: l.at.toISOString() })) }
}
```

`packages/control-plane/src/api/routes/builds.ts` — the three existing handlers from `delivery.ts`, moved into definitions with their authorization unchanged (**the project comes from the build ROW, never from the request**), plus the list:

```ts
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { checkBlueprintCompatibility } from '../../blueprints/index.js'
import { appSpecs, builds, projects, type Db } from '../../db/index.js'
import { readBuildLog } from '../../observability/index.js'
import { assertCapability, AuthorizationError, type Actor } from '../../projects/index.js'
import { getBuild } from '../../releases/index.js'
import type { ManifestSpec } from '../../spec/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { Build, BuildList, BuildLog, StartBuildRequest, toBuild, toBuildLog } from '../representations/builds.js'

const ProjectParams = z.strictObject({ projectId: z.uuid() })
const BuildParams = z.strictObject({ buildId: z.uuid() })

/** The project comes from the build ROW, never from the request (P2's IDOR, measured). */
async function buildReadableBy(db: Db, actor: Actor, buildId: string) {
  const build = await getBuild(db, buildId)
  if (build === undefined) throw new AuthorizationError('NOT_FOUND', `no build '${buildId}'`)
  await assertCapability(db, actor, build.projectId, 'project:read')
  return build
}

export const buildRoutes = [
  defineRoute({
    operationId: 'startBuild',
    method: 'POST',
    path: '/v1/projects/{projectId}/builds',
    tag: 'delivery',
    summary: 'Build the project',
    description:
      '§22 step 4. Answers 202 at once with the build running (R6); log lines stream as `log` frames and the end is `build.succeeded` or `build.failed` on the project’s stream. GET /v1/builds/{buildId} for the present state.',
    params: ProjectParams,
    query: NO_QUERY,
    body: StartBuildRequest,
    success: { status: 202, description: 'The build, started.', schema: Build },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'SPEC_NOT_FOUND', 'SPEC_INVALID', 'BLUEPRINT_NOT_FOUND'],
    handler: async ({ deps, actor, params, body }) => {
      await assertCapability(deps.db, actor, params.projectId, 'build:create')
      const [spec] = await deps.db.select().from(appSpecs).where(eq(appSpecs.projectId, params.projectId)).orderBy(desc(appSpecs.createdAt)).limit(1)
      if (spec === undefined) throw new BadRequestError('SPEC_NOT_FOUND', 'this project has no validated spec yet')
      if (!spec.valid) throw new SpecInvalidError(spec.errors as never)
      const [project] = await deps.db.select().from(projects).where(eq(projects.id, params.projectId))
      if (project === undefined) throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      const descriptor = deps.blueprints.resolve(project.blueprintRef)
      if (descriptor === undefined) {
        throw new BadRequestError('BLUEPRINT_NOT_FOUND', `this project pins '${project.blueprintRef}', which is no longer in the registry`)
      }
      const incompatible = checkBlueprintCompatibility(spec.parsed as ManifestSpec, descriptor)
      if (incompatible.length > 0) throw new SpecInvalidError(incompatible)
      const started = await deps.builds.start({
        projectId: params.projectId,
        projectSlug: project.slug,
        appSpecId: spec.id,
        commitSha: body.commitSha ?? spec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: deps.source.repositoryFor(project.slug).path,
      })
      return toBuild(started)
    },
  }),
  defineRoute({
    operationId: 'getBuild',
    method: 'GET',
    path: '/v1/builds/{buildId}',
    tag: 'delivery',
    summary: 'A build',
    description: 'Its status, digest, reason for failing, and scan.',
    params: BuildParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The build.', schema: Build },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => toBuild(await buildReadableBy(deps.db, actor, params.buildId)),
  }),
  defineRoute({
    operationId: 'getBuildLog',
    method: 'GET',
    path: '/v1/builds/{buildId}/logs',
    tag: 'delivery',
    summary: 'A build’s log',
    description: '§14: every line, redacted at capture — or the last `tail`. Live lines arrive on the stream.',
    params: BuildParams,
    query: z.strictObject({ tail: z.coerce.number().int().min(1).max(10_000).optional() }),
    body: NO_BODY,
    success: { status: 200, description: 'The log.', schema: BuildLog },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params, query }) => {
      const build = await buildReadableBy(deps.db, actor, params.buildId)
      const lines = await readBuildLog(deps.db, build.id, query.tail === undefined ? {} : { tail: query.tail })
      return toBuildLog(build.id, lines)
    },
  }),
  defineRoute({
    operationId: 'listBuilds',
    method: 'GET',
    path: '/v1/projects/{projectId}/builds',
    tag: 'delivery',
    summary: 'A project’s builds',
    description: 'The newest 50, newest first.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The builds.', schema: BuildList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const rows = await deps.db.select().from(builds).where(eq(builds.projectId, params.projectId)).orderBy(desc(builds.createdAt)).limit(50)
      return rows.map(toBuild)
    },
  }),
]
```

`routes/index.ts` gains `...buildRoutes`; the three handlers leave `delivery.ts`. `ServerDeps.builds: BuildRunner` with the doc: *"R6: builds run here, in the background — one per process, built at boot like the retirer."* `coverage.test.ts`: remove the three build routes from `UNCONVERTED`. `authz-contract.ts`: the fixture awaits `deps.builds.idle()` after creating its build (keep the `deps` the factory returned), and a row for the list — `GET /v1/projects/:projectId/builds`, stranger 404, anonymous 401, others pass. `api/error-codes.ts`: the test will name `BUILD_INVALID_INPUT` and `BUILD_LOG_INVALID_QUERY` as unthrown — delete both. In `stream-contract.test.ts`, `await deps.builds.idle()` follows the build POST. `lifecycle.test.ts`, `delivery.test.ts` and `events.test.ts`: every build is followed by `await deps.builds.idle()` and a `GET /v1/builds/{id}` where a test reads its status.

- [ ] **Step 5: Scripts wait for the build**

`scripts/lib/api.sh`:

```bash
# A build answers 202 at once and finishes on the event stream (Rich's R6, P5a Task 13).
# A script holding no socket reads the build until it is terminal — bounded past the
# builder's own 900 s timeout, so a stalled build fails the script rather than hanging it.
# Prints the terminal build's JSON; exits 1 if it never ended.
wait_for_build() {
  local id="$1" build status waited=0
  while :; do
    build="$(api GET "/v1/builds/$id")"
    status="$(printf '%s' "$build" | field status 2>/dev/null || echo unknown)"
    case "$status" in
      succeeded|failed) printf '%s' "$build"; return 0 ;;
    esac
    if [ "$waited" -ge 960 ]; then printf '%s' "$build"; return 1; fi
    sleep 2
    waited=$((waited + 2))
  done
}
```

`proof_app_deploy`:

```bash
  build="$(api POST "/v1/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}")"
  BUILD_ID="$(printf '%s' "$build" | field id)"
  build="$(wait_for_build "$BUILD_ID")" || fail "build $BUILD_ID did not finish within 960 s: $build"
  [ "$(printf '%s' "$build" | field status)" = succeeded ] \
    || fail "build $BUILD_ID did not succeed: $build"
```

`scripts/demo.sh` the same; `scripts/demo-redeploy.sh`'s two `NEW_BUILD=`/`FAIL_BUILD=` lines are each followed by `wait_for_build "$NEW_BUILD" >/dev/null || fail …`; `scripts/demo-ai.sh` reads the build log only after its build has ended (it does, through `proof_app_deploy`). The README and RUNBOOK sentences that say a build call returns the finished build say it answers `202` and finishes on the stream.

- [ ] **Step 6: Regenerate, run both tiers, and the journey builds**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test
pnpm test:docker     # the Docker driver's scan summary against a real Grype run; the boot recovery
```

`packages/journey/src/main.ts`:

```ts
/** §22 step 4: trigger a build; its log lines stream live, and it ends on the stream (R6). */
async function step4Build(): Promise<void> {
  checks.step('4. Trigger a build; its logs stream live')
  const frames: StreamFrame[] = []
  const stream = subscribe({ origin, session, projectId: state.projectId!, onFrame: (frame) => frames.push(frame) })
  await stream.ready
  const started = unwrap(
    await client.POST('/v1/projects/{projectId}/builds', {
      params: { path: { projectId: state.projectId! }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {},
    }),
    'startBuild',
  )
  checks.ok('the build answered at once, still running (R6)', started.status === 'running' || started.status === 'pending', started.status)
  state.buildId = started.id
  const ended = await waitFor(
    frames,
    (f) => f.kind === 'event' && (f.type === 'build.succeeded' || f.type === 'build.failed') && (f.machineDetail as { buildId: string }).buildId === started.id,
    960_000,
  )
  checks.must('and ended on the stream', ended)
  const lines = frames.filter((f) => f.kind === 'log' && f.buildId === started.id)
  checks.ok('its log lines arrived before its end', lines.length > 0 && frames.indexOf(lines[0]!) < frames.indexOf(ended!), `${lines.length} lines`)
  stream.close()
  const build = unwrap(await client.GET('/v1/builds/{buildId}', { params: { path: { buildId: started.id } } }), 'getBuild')
  checks.ok('it succeeded, with a digest', build.status === 'succeeded' && /^sha256:[0-9a-f]{64}$/.test(build.imageDigest ?? ''), build.error ?? '')
  checks.ok('and recorded its scan (§12)', build.scan !== null && build.scan.scanner.startsWith('anchore/grype'), JSON.stringify(build.scan))
}
```

`'before-app'` gains `step4Build`. Restart the control plane; `pnpm typecheck && make demo-journey`; then `make demo && make demo-ai && make demo-redeploy`.

- [ ] **Step 7: Gates, commit, controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A packages/control-plane packages/contract packages/journey scripts README.md docs/superpowers/RUNBOOK.md
git commit -m "feat(builds): a build answers 202 and ends on the stream (R6), is failed at boot if interrupted, and records its scan (§12)"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | in `start`, `await finishBuild(…)` before returning | `delivery.test.ts` *answers 202 while the build is still running* — the POST never resolves while the gate is closed, and the test times out | `git checkout packages/control-plane/src/releases/build.ts` |
| b | delete pass 0 from `recoverAtBoot` | `recover.test.ts` *fails a build the restart interrupted* | `git checkout packages/control-plane/src/releases/recover.ts` |
| c | drop `scan: image.scan` from the success update | *answers 202 …* (`scan: null`); the journey's *recorded its scan* | as (a) |
| d | delete `scan` from the fake driver's return | `pnpm typecheck` — `Property 'scan' is missing` — **and nothing in Vitest**, which is why `scan` is required rather than optional | `git checkout packages/control-plane/src/runtime/fake-driver.ts` |
| e | `fixable: count(result.appFindings)` → `fixable: zero()` | `scan.test.ts` would not see it (no fixable finding in the fixture) — **add one to `scanResultWith` in the test and watch it go red**, then keep the fixture with it | `git checkout packages/control-plane/src/build/scan.ts` |

---
## Task 14: Releases, deploys and incidents as representations — and the states between

**What changes.** The last unconverted routes become definitions: a `Release` stops carrying `resolvedConfig` whole and shows its per-environment configuration with env var **names** only, plus its build's digest and scan (Decision 22); a deploy answers an `Instance` with no `driver` and no `handle` (Decision 23); two reads the console needs are added — a release, and a project's releases. And §22 step 5's *instance state transitions stream live* becomes true: today the only instance events are `healthy` and `failed`, and the `starting` state is computed in memory and never stored (read from `releases/release.ts` on 2026-09-16), so this task stores it and publishes `instance.provisioning` and `instance.starting`. **`UNCONVERTED` is empty at the end, and deleted.** The journey reaches step 6: signed in inside the deployed app, a note written, a question answered.

**Files:**
- Create: `packages/control-plane/drizzle/0012_*.sql` (generated: the events CHECK with two new types)
- Create: `packages/control-plane/src/api/representations/releases.ts`, `api/representations/incidents.ts`
- Create: `packages/control-plane/src/api/routes/releases.ts` (create, get, list, deploy, incidents)
- Modify: `packages/control-plane/src/releases/release.ts` (store `starting`; publish both events), `releases/releases.test.ts`
- Modify: `packages/control-plane/src/observability/events.ts`, `observability/event-schemas.ts`, `db/schema.ts`
- Modify: `packages/control-plane/src/api/errors.ts` (`ProductionGateError`), `api/contract/schemas.ts` (`ErrorEnvelope.error.launchReadiness`), `api/error-codes.ts`
- Delete: `packages/control-plane/src/api/routes/delivery.ts` (every route in it is converted); the `UNCONVERTED` list in `api/contract/coverage.test.ts`
- Modify: `packages/control-plane/src/api/{delivery,events,stream-contract}.test.ts`, `lifecycle.test.ts`, `api/authz-contract.ts`, `api/server.ts`, `api/routes/index.ts`
- Modify: `scripts/demo-journey.sh` (step 6, and the `after-app` phase); `packages/journey/src/main.ts`; the regenerated contract

**Interfaces:**
- Produces: `POST /v1/projects/{projectId}/releases` (`createRelease` → 201 `Release`), `GET /v1/releases/{releaseId}` (`getRelease`), `GET /v1/projects/{projectId}/releases` (`listReleases` → `Release[]`, newest 50), `POST /v1/environments/{environmentId}/deploy` (`deploy` → 200 `Instance`; production → 409 `RELEASE_PRODUCTION_GATE_UNAVAILABLE` carrying `launchReadiness`), `GET /v1/environments/{environmentId}/incidents` (`listIncidents` → `IncidentList`).
- Produces: event types `instance.provisioning`, `instance.starting`; an instance row in `starting` from the moment its services are bound until health decides.
- Produces: `ProductionGateError(launchReadiness: unknown)` in `api/errors.ts` → 409 with `error.launchReadiness`. **Task 15 replaces the constant it carries with the computed view.**
- Produces: `make demo-journey` step 6 in bash, then `node … after-app`.
- Consumes: `toInstance`, `Instance` (Task 8); `ScanSummary`, `toBuild` (Task 13); `subscribe`, `waitFor` (Task 12).

- [ ] **Step 1: Write the failing tests**

In `api/delivery.test.ts`:

```ts
describe('releases, deploys and incidents answer representations (P5a Task 14)', () => {
  it('a release shows its build’s digest and scan, and env var NAMES only', async () => {
    const { deps, app, cookies, project, build } = await builtProject('chem-labs', {
      // A manifest with an env var whose VALUE must not travel with the release.
      env: [{ name: 'COURSE_CODE', value: 'CHEM_121' }],
    })
    const res = await app.inject({ method: 'POST', url: `/v1/projects/${project.id}/releases`, cookies, headers: mutationHeaders(deps), payload: { buildId: build.id } })
    expect(res.statusCode).toBe(201)
    const release = res.json()
    expect(release).toMatchObject({ buildId: build.id, imageDigest: build.imageDigest, scan: { scanner: 'fake' } })
    expect(release.config.staging.envNames).toEqual(['COURSE_CODE'])
    expect(JSON.stringify(release)).not.toContain('CHEM_121')
    expect(release).not.toHaveProperty('resolvedConfig')
    expect((await app.inject({ method: 'GET', url: `/v1/releases/${release.id}`, cookies })).json()).toEqual(release)
    expect((await app.inject({ method: 'GET', url: `/v1/projects/${project.id}/releases`, cookies })).json()).toEqual([release])
    await app.close()
  })

  it('a deploy answers the instance without its driver or handle', async () => {
    const { deps, app, cookies, staging, release } = await releasedProject('chem-labs')
    const res = await app.inject({ method: 'POST', url: `/v1/environments/${staging.id}/deploy`, cookies, headers: mutationHeaders(deps), payload: { releaseId: release.id } })
    expect(res.statusCode).toBe(200)
    expect(Object.keys(res.json()).sort()).toEqual(['environmentId', 'id', 'kind', 'lastSeenAt', 'releaseId', 'state'])
    expect(res.json().state).toBe('healthy')
    await app.close()
  })

  it('streams provisioning, starting and healthy for the instance, in that order (§22 step 5)', async () => {
    const { deps, app, cookies, project, staging, release } = await releasedProject('chem-labs')
    const frames: StreamFrame[] = []
    deps.bus.subscribe(project.id, (frame) => frames.push(frame))
    const instance = (await app.inject({ method: 'POST', url: `/v1/environments/${staging.id}/deploy`, cookies, headers: mutationHeaders(deps), payload: { releaseId: release.id } })).json()
    const forInstance = frames.flatMap((f) =>
      f.kind === 'event' && (f.machineDetail as { instanceId?: string }).instanceId === instance.id ? [f.type] : [],
    )
    expect(forInstance.filter((t) => t.startsWith('instance.'))).toEqual(['instance.provisioning', 'instance.starting', 'instance.healthy'])
    await app.close()
  })
})
```

(`builtProject`, `releasedProject` beside them: a project from `projectBody` — with `env` written into its manifest through `deps.source.commitFiles` and `POST /v1/projects/{id}/spec` where given — a build awaited with `deps.builds.idle()`, a release; `releasedProject` also returns the staging environment.) In `releases/releases.test.ts`, beside the deploy tests:

```ts
  it('stores `starting` once services are bound, before the driver starts the instance (P5a Task 14)', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      // The instance row's state at the moment the driver is asked to start it.
      let stateWhenStarted: string | undefined
      const ensure = driver.ensureInstance.bind(driver)
      driver.ensureInstance = async (spec) => {
        const [row] = await db.select({ state: instances.state }).from(instances).where(eq(instances.id, spec.instanceId))
        stateWhenStarted = row?.state
        return ensure(spec)
      }
      const runner = createBuildRunner({ db, driver, bus })
      const build = await runner.start({
        projectId: project.id,
        projectSlug: project.slug,
        appSpecId: appSpec.id,
        commitSha: appSpec.commitSha,
        blueprintRef: project.blueprintRef,
        repoPath: '/tmp/chem-labs.git',
      })
      await runner.idle()
      const release = await createRelease(db, { projectId: project.id, buildId: build.id, appSpecId: appSpec.id, createdBy: user.id, resolvedConfig: RESOLVED })
      const instance = await deployRelease(db, driver, config, deployDeps, { releaseId: release.id, environmentId: byKind.staging!.id })
      expect(stateWhenStarted).toBe('starting')
      expect(instance.state).toBe('healthy')
    })
  })
```

In `api/contract/coverage.test.ts`, delete the `UNCONVERTED` constant and its two expectations, leaving:

```ts
    expect(v1.filter((r) => !defined.has(r) && !DOCUMENTED_ONLY.includes(r))).toEqual([])
```

In `api/authz-contract.ts`, rows for `GET /v1/releases/:releaseId` and `GET /v1/projects/:projectId/releases` (stranger 404, anonymous 401, the rest pass); the four existing delivery rows keep their paths.

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/delivery.test.ts src/releases/releases.test.ts src/api/contract/coverage.test.ts
```

Expected: FAIL — the release carries `resolvedConfig`; the deploy carries `driver` and `handle`; only `instance.healthy` streams; `stateWhenStarted` is `provisioning`; `coverage.test.ts` lists the five routes still in `delivery.ts`.

- [ ] **Step 2: The states between**

`observability/events.ts`'s `EVENT_TYPES` gains, before `'instance.healthy'`:

```ts
  /** §22 step 5 (P5a): an instance row exists and its services are being bound. */
  'instance.provisioning',
  /** Its services are bound and the driver is starting it — beside the one serving (§11). */
  'instance.starting',
```

`observability/event-schemas.ts` gains `'instance.provisioning': InstanceDetail` and `'instance.starting': InstanceDetail`. `db/schema.ts`'s `events_type_known` gains both. Generate and apply migration 0012 exactly as Task 13 Step 2 does, and read it before applying.

In `releases/release.ts`, inside `withEnvironmentLock`, **directly after the instance row is inserted** (`const instanceId = row!.id`):

```ts
    const instanceDetail0 = {
      instanceId,
      releaseId: release.id,
      environmentId: environment.id,
      environment: environment.kind,
      state: 'provisioning',
    }
    // §22 step 5 (P5a Task 14). The redactor is EMPTY and that is accurate: nothing in this
    // detail or sentence is secret, and the app's secret set is opened further down, before
    // anything is minted (P4b finding 162) — not moved up for an event that needs none of it.
    await publishEvent(
      db,
      deps.bus,
      {
        projectId: environment.projectId,
        subject: `instance:${instanceId}`,
        type: 'instance.provisioning',
        machineDetail: instanceDetail0,
        humanMessage: `Preparing ${projectSlug} in ${environment.kind}.`,
      },
      makeRedactor([]),
    )
```

**Directly before** `handle = await driver.ensureInstance({`:

```ts
      // provisioning → starting, STORED (P5a Task 14). Services are bound; the driver is
      // about to start the instance beside the one serving. Before this, `starting` existed
      // only as a value computed on the way to `healthy`, so no client could ever see it —
      // and a restart in this window left a row in `provisioning` that `recoverAtBoot`
      // could not tell from one that never reached its services.
      await db
        .update(instances)
        .set({ state: nextState('provisioning', 'services_bound') })
        .where(eq(instances.id, instanceId))
      await publishEvent(
        db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject: `instance:${instanceId}`,
          type: 'instance.starting',
          machineDetail: { ...instanceDetail0, state: 'starting' },
          humanMessage: `${projectSlug} is starting in ${environment.kind}.`,
        },
        redact,
      )
```

and where the final state is computed, `const starting = nextState('provisioning', 'services_bound')` becomes `const starting = 'starting' as const` with a one-line comment: *stored above, before the driver started the instance*. Every failure path that previously moved a `provisioning` row now moves a `starting` one — run `releases.test.ts` and read what it says; `canTransition` refuses a transition the machine does not have, and the machine already has `starting → failed` (§11).

- [ ] **Step 3: The representations**

`packages/control-plane/src/api/representations/releases.ts`:

```ts
import { z } from 'zod/v4'
import type { builds, releases } from '../../db/index.js'
import type { ResolvedConfigSet } from '../../releases/index.js'
import type { ScanSummary as DriverScanSummary } from '../../runtime/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'
import { ScanSummary } from './builds.js'

const ReleaseConfig = z
  .object({
    port: z.number().int(),
    health: z.string(),
    resources: z.object({ cpu: z.number(), memory: z.string(), pids: z.number().int(), disk: z.string() }),
    services: z.array(z.object({ type: z.string(), version: z.string(), name: z.string() })),
    egressAllow: z.array(z.string()),
    classification: z.string(),
    auth: z.object({ provider: z.enum(['cwl', 'none']), attributes: z.array(z.string()) }),
    ai: z.object({ models: z.array(z.string()) }),
    envNames: z.array(z.string()).describe('The names the app declares — never their values (P5a Decision 22).'),
  })
  .describe('One environment’s view of the release, frozen when it was made (§13).')

export const Release = representation(
  'Release',
  z
    .object({
      id: Uuid,
      projectId: Uuid,
      buildId: Uuid,
      appSpecId: Uuid,
      imageDigest: z.string().describe('What an approval binds to (§13).'),
      summary: z.string().nullable(),
      createdBy: Uuid,
      createdAt: Timestamp,
      scan: ScanSummary.nullable().describe('§12: its build’s scan, recorded on the Release.'),
      config: z.object({ sandbox: ReleaseConfig, staging: ReleaseConfig, production: ReleaseConfig }),
    })
    .describe('Immutable: a build, a spec and the configuration resolved for every environment (§13).'),
)
export const ReleaseList = representation('ReleaseList', z.array(Release))

export const CreateReleaseRequest = request(
  'CreateReleaseRequest',
  z.strictObject({ buildId: z.uuid(), summary: z.string().max(500).optional() }),
)
export const DeployRequest = request('DeployRequest', z.strictObject({ releaseId: z.uuid() }))

export function toRelease(row: typeof releases.$inferSelect, build: typeof builds.$inferSelect): z.input<typeof Release> {
  const resolved = row.resolvedConfig as ResolvedConfigSet
  const configOf = (kind: keyof ResolvedConfigSet) => {
    const c = resolved[kind]
    return {
      port: c.port,
      health: c.health,
      resources: c.resources,
      services: c.services.map((s) => ({ type: s.type, version: s.version, name: s.name })),
      egressAllow: c.egressAllow,
      classification: c.classification,
      auth: { provider: c.auth.provider, attributes: [...c.auth.attributes] },
      // `?.` — a release frozen before ResolvedConfig.ai existed has none (P4b pre-flight 64).
      ai: { models: [...(c.ai?.models ?? [])] },
      envNames: c.env.map((e) => e.name),
    }
  }
  return {
    id: row.id,
    projectId: row.projectId,
    buildId: row.buildId,
    appSpecId: row.appSpecId,
    imageDigest: build.imageDigest ?? '',
    summary: row.summary,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    scan: (build.scan as DriverScanSummary | null) ?? null,
    config: { sandbox: configOf('sandbox'), staging: configOf('staging'), production: configOf('production') },
  }
}
```

`packages/control-plane/src/api/representations/incidents.ts`:

```ts
import { z } from 'zod/v4'
import type { Incident as IncidentRow } from '../../observability/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

export const Incident = representation(
  'Incident',
  z
    .object({
      id: Uuid,
      instanceId: Uuid,
      releaseId: Uuid,
      exitReason: z.string(),
      logTail: z.string().describe('The last 200 lines, redacted at capture (§14).'),
      failedCheck: z.string(),
      diffSinceHealthy: z.string(),
      createdAt: Timestamp,
      prompt: z.string().describe('§14: shaped to be handed straight to an agent as a repair request.'),
    }),
)

export const IncidentList = representation('IncidentList', z.object({ environmentId: Uuid, incidents: z.array(Incident) }))

export function toIncident(row: IncidentRow & { releaseId: string }, prompt: string): z.input<typeof Incident> {
  return {
    id: row.id,
    instanceId: row.instanceId,
    releaseId: row.releaseId,
    exitReason: row.exitReason,
    logTail: row.logTail,
    failedCheck: row.failedCheck,
    diffSinceHealthy: row.diffSinceHealthy,
    createdAt: row.createdAt.toISOString(),
    prompt,
  }
}
```

In `api/contract/schemas.ts`'s `ErrorEnvelope`, the `error` object gains:

```ts
      launchReadiness: z
        .unknown()
        .optional()
        .describe('On RELEASE_PRODUCTION_GATE_UNAVAILABLE: what a first launch still needs (§13). Typed in Task 15.'),
```

- [ ] **Step 4: The routes**

`api/errors.ts`:

```ts
/**
 * §13: a first production launch is a checklist, not a button. A 409 that carries the
 * checklist — not a refusal a client has to go and ask about (P5a Task 14; Task 15 makes
 * the checklist computed rather than a constant).
 */
export class ProductionGateError extends Error {
  readonly code = 'RELEASE_PRODUCTION_GATE_UNAVAILABLE'
  constructor(readonly launchReadiness: unknown) {
    super('first production launch is a checklist, not a button (§13, D19)')
    this.name = 'ProductionGateError'
  }
}
```

with a `mapError` branch answering `409 { error: { code, message, hint: 'These items have multi-week lead times and are tracked from project creation.', launchReadiness } }`.

`packages/control-plane/src/api/routes/releases.ts` — **the handlers `delivery.ts` holds, moved into definitions**, with `LAUNCH_READINESS` moved beside them unchanged until Task 15:

```ts
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { appSpecs, builds, environments, projects, releases, type Db } from '../../db/index.js'
import { incidentPrompt, listIncidents } from '../../observability/index.js'
import { assertCapability, AuthorizationError, type Actor } from '../../projects/index.js'
import { createRelease, deployRelease } from '../../releases/index.js'
import { resolveConfig, type ManifestSpec } from '../../spec/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { BadRequestError, ProductionGateError } from '../errors.js'
import { IncidentList, toIncident } from '../representations/incidents.js'
import { Instance, toInstance } from '../representations/instances.js'
import { CreateReleaseRequest, DeployRequest, Release, ReleaseList, toRelease } from '../representations/releases.js'

const ProjectParams = z.strictObject({ projectId: z.uuid() })
const EnvironmentParams = z.strictObject({ environmentId: z.uuid() })

/**
 * §13's checklist as it stood before P5a — moved from api/routes/delivery.ts unchanged, stale
 * `deliveredBy` stamps and all, so this task changes no answer a client already reads.
 * Task 15 deletes it for the computed view.
 */
const LAUNCH_READINESS = [
  { item: 'IamRegistration', owner: 'UBC IAM', blocking: true, deliveredBy: 'P4' },
  { item: 'PrivacyAssessment', owner: 'UBC Privacy Office', blocking: true, deliveredBy: 'P4' },
  { item: 'PreProductionRehearsal', owner: 'Manifest', blocking: true, deliveredBy: 'P4' },
  { item: 'DependencyAndSecretScans', owner: 'Manifest', blocking: true, deliveredBy: 'P3' },
  { item: 'AdminApproval', owner: 'platform admin', blocking: true, deliveredBy: 'P4' },
] as const

async function releaseWithBuild(db: Db, releaseId: string) {
  const [row] = await db.select({ release: releases, build: builds }).from(releases).innerJoin(builds, eq(releases.buildId, builds.id)).where(eq(releases.id, releaseId))
  return row
}

async function environmentReadableBy(db: Db, actor: Actor, environmentId: string, capability: 'project:read' | 'release:deploy') {
  const [row] = await db.select().from(environments).where(eq(environments.id, environmentId))
  // The project comes from the environment ROW, never from the request.
  if (row === undefined) throw new AuthorizationError('NOT_FOUND', `no environment '${environmentId}'`)
  await assertCapability(db, actor, row.projectId, capability)
  return row
}

export const releaseRoutes = [
  defineRoute({
    operationId: 'createRelease',
    method: 'POST',
    path: '/v1/projects/{projectId}/releases',
    tag: 'delivery',
    summary: 'Release a build',
    description: '§13: an immutable release — the build’s digest, the newest valid spec, and the configuration resolved for all three environments, frozen together.',
    params: ProjectParams,
    query: NO_QUERY,
    body: CreateReleaseRequest,
    success: { status: 201, description: 'The release.', schema: Release },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'SPEC_NOT_FOUND', 'BLUEPRINT_NOT_FOUND', 'RELEASE_BUILD_NOT_FOUND', 'RELEASE_BUILD_NOT_DEPLOYABLE'],
    handler: async ({ deps, actor, params, body }) => {
      // The existing POST …/releases handler's body, moved: capability 'release:create',
      // the project, the newest spec (SPEC_NOT_FOUND), the blueprint's resource defaults
      // (BLUEPRINT_NOT_FOUND), then createRelease with all three resolveConfig calls.
      await assertCapability(deps.db, actor, params.projectId, 'release:create')
      const [project] = await deps.db.select().from(projects).where(eq(projects.id, params.projectId))
      if (project === undefined) throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
      const [spec] = await deps.db.select().from(appSpecs).where(eq(appSpecs.projectId, params.projectId)).orderBy(desc(appSpecs.createdAt)).limit(1)
      if (spec === undefined) throw new BadRequestError('SPEC_NOT_FOUND', 'this project has no validated spec yet')
      const descriptor = deps.blueprints.resolve(project.blueprintRef)
      if (descriptor === undefined) {
        throw new BadRequestError('BLUEPRINT_NOT_FOUND', `this project pins '${project.blueprintRef}', which is no longer in the registry`)
      }
      const parsed = spec.parsed as ManifestSpec
      const defaults = descriptor.defaults.resources
      const release = await createRelease(deps.db, {
        projectId: params.projectId,
        buildId: body.buildId,
        appSpecId: spec.id,
        createdBy: actor.userId,
        ...(body.summary === undefined ? {} : { summary: body.summary }),
        resolvedConfig: {
          sandbox: resolveConfig(parsed, 'sandbox', defaults),
          staging: resolveConfig(parsed, 'staging', defaults),
          production: resolveConfig(parsed, 'production', defaults),
        },
      })
      const joined = await releaseWithBuild(deps.db, release.id)
      return toRelease(joined!.release, joined!.build)
    },
  }),
  defineRoute({
    operationId: 'getRelease',
    method: 'GET',
    path: '/v1/releases/{releaseId}',
    tag: 'delivery',
    summary: 'A release',
    description: 'One immutable release (§13).',
    params: z.strictObject({ releaseId: z.uuid() }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The release.', schema: Release },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      const joined = await releaseWithBuild(deps.db, params.releaseId)
      if (joined === undefined) throw new AuthorizationError('NOT_FOUND', `no release '${params.releaseId}'`)
      await assertCapability(deps.db, actor, joined.release.projectId, 'project:read')
      return toRelease(joined.release, joined.build)
    },
  }),
  defineRoute({
    operationId: 'listReleases',
    method: 'GET',
    path: '/v1/projects/{projectId}/releases',
    tag: 'delivery',
    summary: 'A project’s releases',
    description: 'The newest 50, newest first.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The releases.', schema: ReleaseList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const rows = await deps.db
        .select({ release: releases, build: builds })
        .from(releases)
        .innerJoin(builds, eq(releases.buildId, builds.id))
        .where(eq(releases.projectId, params.projectId))
        .orderBy(desc(releases.createdAt))
        .limit(50)
      return rows.map((r) => toRelease(r.release, r.build))
    },
  }),
  defineRoute({
    operationId: 'deploy',
    method: 'POST',
    path: '/v1/environments/{environmentId}/deploy',
    tag: 'delivery',
    summary: 'Deploy a release to an environment',
    description:
      '§22 step 5. Answers once the new instance serves, or once it has failed with an Incident — a failed deploy is a 200 whose state is `failed` (R3, §14). The previous instance keeps serving until the new one is proved, and drains in the background. Up to ~90 s when a release never becomes ready. Production answers 409 with LaunchReadiness (§13).',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: DeployRequest,
    success: { status: 200, description: 'The instance, healthy or failed.', schema: Instance },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'RELEASE_PRODUCTION_GATE_UNAVAILABLE', 'RELEASE_NOT_FOUND', 'RELEASE_DIGEST_MISSING', 'RELEASE_AI_DISABLED', 'RELEASE_AI_BUDGET_MISSING', 'RELEASE_MODEL_NOT_IN_CATALOGUE', 'RELEASE_MODEL_CLASSIFICATION_TOO_LOW', 'RELEASE_MODEL_UNCLASSIFIED', 'AI_BACKEND_UNAVAILABLE'],
    handler: async ({ deps, actor, params, body }) => {
      const environment = await environmentReadableBy(deps.db, actor, params.environmentId, 'release:deploy')
      if (environment.kind === 'production') throw new ProductionGateError(LAUNCH_READINESS)
      const instance = await deployRelease(
        deps.db,
        deps.driver,
        deps.config,
        { secrets: deps.secrets, appSecrets: deps.appSecrets, sso: deps.sso, blueprints: deps.blueprints, ai: deps.ai, catalogue: deps.catalogue, bus: deps.bus, retirer: deps.retirer },
        { releaseId: body.releaseId, environmentId: params.environmentId },
      )
      return toInstance(instance)
    },
  }),
  defineRoute({
    operationId: 'listIncidents',
    method: 'GET',
    path: '/v1/environments/{environmentId}/incidents',
    tag: 'delivery',
    summary: 'An environment’s incidents',
    description: '§14: each failed deploy’s exit, last 200 log lines, failing check and diff since the last healthy release, newest first, with its repair prompt.',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The incidents.', schema: IncidentList },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      const environment = await environmentReadableBy(deps.db, actor, params.environmentId, 'project:read')
      const [project] = await deps.db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, environment.projectId))
      const rows = await listIncidents(deps.db, environment.id)
      return {
        environmentId: environment.id,
        incidents: rows.map((row) => toIncident(row, incidentPrompt(row, { slug: project!.slug, environmentKind: environment.kind }))),
      }
    },
  }),
]
```

`routes/index.ts` gains `...releaseRoutes`; `api/routes/delivery.ts` is deleted and `server.ts` no longer calls `registerDeliveryRoutes`. `api/error-codes.ts`: `DEPLOY_INVALID_INPUT` and `RELEASE_INVALID_INPUT` will be named unthrown — delete both; `RELEASE_PRODUCTION_GATE_UNAVAILABLE`'s families gain nothing (the `readonly code` in `api/errors.ts` is still family `api`).

- [ ] **Step 5: Regenerate, both tiers**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test
pnpm test:docker     # the Docker deploy path now stores `starting`; incident.docker.test.ts and redeploy.docker.test.ts read state
```

A Docker-tier test that expected a failing instance to move from `provisioning` now sees `starting`: correct the expectation to the state §11's machine says, and record it.

- [ ] **Step 6: The journey deploys, and signs in inside the app**

`packages/journey/src/main.ts`:

```ts
/** §22 step 5: deploy to staging; instance state transitions stream live. */
async function step5Deploy(): Promise<void> {
  checks.step('5. Deploy to staging; the instance’s states stream live')
  const release = unwrap(
    await client.POST('/v1/projects/{projectId}/releases', {
      params: { path: { projectId: state.projectId! }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { buildId: state.buildId!, summary: 'P5a acceptance journey' },
    }),
    'createRelease',
  )
  state.releaseId = release.id
  checks.ok('the release carries its build’s digest and scan (§12, §13)', release.imageDigest.startsWith('sha256:') && release.scan !== null)
  checks.ok(
    'and names its env vars without their values',
    release.config.staging.envNames.includes('COURSE_CODE') && !JSON.stringify(release).includes('CHEM_121'),
    JSON.stringify(release.config.staging.envNames),
  )

  const frames: StreamFrame[] = []
  const stream = subscribe({ origin, session, projectId: state.projectId!, onFrame: (frame) => frames.push(frame) })
  await stream.ready
  const instance = unwrap(
    await client.POST('/v1/environments/{environmentId}/deploy', {
      params: { path: { environmentId: state.stagingEnvironmentId! }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: { releaseId: release.id },
    }),
    'deploy',
  )
  state.instanceId = instance.id
  checks.must('the instance is healthy', instance.state === 'healthy' ? instance : undefined, instance.state)
  checks.ok('and carries no driver internals', !('handle' in instance) && !('driver' in instance))
  const ofInstance = (type: string) => (f: StreamFrame) =>
    f.kind === 'event' && f.type === type && (f.machineDetail as { instanceId?: string }).instanceId === instance.id
  await waitFor(frames, ofInstance('instance.healthy'), 10_000)
  const at = (type: string) => frames.findIndex(ofInstance(type))
  checks.ok(
    'provisioning, starting and healthy streamed, in that order',
    at('instance.provisioning') >= 0 && at('instance.starting') > at('instance.provisioning') && at('instance.healthy') > at('instance.starting'),
    `${at('instance.provisioning')} ${at('instance.starting')} ${at('instance.healthy')}`,
  )
  stream.close()
  const environment = unwrap(await client.GET('/v1/environments/{environmentId}', { params: { path: { environmentId: state.stagingEnvironmentId! } } }), 'getEnvironment')
  checks.ok('the environment serves that instance', environment.instance?.id === instance.id)
}
```

`'before-app'` gains `step5Deploy`.

`scripts/demo-journey.sh`, after the `before-app` run:

```bash
# shellcheck source=./lib/proof-app.sh
. scripts/lib/proof-app.sh     # for `app`: an authenticated call to the DEPLOYED app

APP_URL="$(node -e 'console.log(require(process.argv[1]).appUrl)' "$STATE")"
[ -n "$APP_URL" ] || fail "the journey recorded no app URL"

say "6. Open the app; sign in with CWL INSIDE it; write a note; ask the LLM"
# The app's API, not Manifest's — curl, through the same one sign-in flow (Decision 38).
APP_JAR="$WORK/app.jar"; APP_IDP_JAR="$WORK/app-idp.jar"
idp_login "$APP_JAR" "$APP_IDP_JAR" "$APP_URL/login" instructor instructor \
  "$APP_URL/auth/ubcshib/callback" "$CA"
ME="$(app "$APP_JAR" GET /api/me)"
[ "$(printf '%s' "$ME" | field attributes.ubcEduCwlPuid)" = ins000001 ] \
  || fail "signed in inside the app, and it does not see the instructor: $ME"
echo "  signed in inside the app as ins000001"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)-$$"
NOTE="The P5a journey's note: bismuth grows iridescent staircase crystals. ($STAMP)"
[ "$(app "$APP_JAR" POST /api/notes "{\"text\":$(json "$NOTE")}" | field text)" = "$NOTE" ] \
  || fail "the note was not written"
echo "  wrote a note"
REPLY="$(app "$APP_JAR" POST /api/ask "{\"question\":$(json "What crystals does bismuth grow?")}")"
ANSWER="$(printf '%s' "$REPLY" | field answer 2>/dev/null || true)"
[ -n "$ANSWER" ] || fail "asked, and got no answer: $REPLY"
[ "$(printf '%s' "$REPLY" | field embeddingDimensions)" = 768 ] \
  || fail "the question was embedded in the wrong number of dimensions (S3's silent failure): $REPLY"
echo "  asked, and was answered: $(printf '%s' "$ANSWER" | tr '\n' ' ' | cut -c1-120)"

say "7 and after — through @manifest/contract"
MANIFEST_ORIGIN="$ORIGIN" MANIFEST_SESSION="$SESSION" \
  node packages/journey/dist/main.js after-app "$STATE"
```

(`proof-app.sh` needs `ROOT`, `API`, `CA`, `CP_JAR`, `SLUG` and `APP_URL` set before its functions are called: add `SLUG=journey-app` beside `CA=` at the top of the script — the one place the journey's project name is written in bash.) The `STATE` file must carry `appUrl`: `step2Create` sets `state.appUrl`, and `main.ts` writes the state in `finally`.

```bash
cd /Users/rich/Developer/manifest
pnpm typecheck
# restart the control plane on the new build
make demo-journey
make demo-redeploy && make demo-ai
```

Expected: `make demo-journey` green through step 6 — `after-app` has no steps yet and passes; both demos green on the new representations.

- [ ] **Step 7: Gates, commit, controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A packages/control-plane packages/contract packages/journey scripts/demo-journey.sh
git commit -m "feat(delivery): releases, deploys and incidents answer representations; provisioning and starting stream live (§22 step 5)"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | in `toRelease`, `envNames: c.env.map((e) => e.name)` → `env: c.env` — and add `env` to `ReleaseConfig` | *a release shows … env var NAMES only* (`CHEM_121` present); the journey's step 5 | `git checkout` both files |
| b | delete the `instance.starting` publish in `deployRelease` | *streams provisioning, starting and healthy*; the journey's step 5 | `git checkout packages/control-plane/src/releases/release.ts` |
| c | delete the `update(instances).set({ state: 'starting' })` | `releases.test.ts` *stores `starting` once services are bound* (`provisioning`) | as (b) |
| d | in `deploy`'s handler, return `instance` (the row) instead of `toInstance(instance)` | *a deploy answers the instance without its driver or handle* — **still green**, because the response parse strips both. Recorded: the representation is the second read, and the mapper is not the only thing standing between a row and the wire (Decision 2) | `git checkout packages/control-plane/src/api/routes/releases.ts` |
| e | in (d)'s edit, also change `Instance` to `z.looseObject` | the same test goes red — `driver` and `handle` present | as (d), and `git checkout packages/control-plane/src/api/representations/instances.ts` |
| f | in `demo-journey.sh`, sign in inside the app with `student` | step 6: *signed in inside the app, and it does not see the instructor* | `git checkout scripts/demo-journey.sh` |

---
## Task 15: `LaunchReadiness`, computed and read-only

**What §13, §17 and §22 ask.** Step 7 is *request production; see `LaunchReadiness` with its blocked items and why*. §17 puts the read-only **view** in 1c and the **gate** that blocks on it in Phase 2. Today the refusal carries a constant stamped `deliveredBy: 'P4'` for things P4 did not deliver (brief §2.2). This task computes the checklist from what exists, says *not built yet* — and which plan builds it — for what does not, and computes the one item P5a can: the scans of the release serving staging (Decision 35). It lives in `launch/`, §5's module for it.

**Files:**
- Create: `packages/control-plane/src/launch/readiness.ts`, `launch/index.ts`, `launch/readiness.test.ts`
- Create: `packages/control-plane/src/api/representations/launch.ts`, `api/representations/errors.ts` (`ErrorEnvelope` moves here from `contract/schemas.ts`, to type `launchReadiness` without an import cycle), `api/routes/launch.ts`
- Modify: `packages/control-plane/src/api/contract/schemas.ts` (`ErrorEnvelope` moved out), `api/contract/document.ts` (imports the representations it names by id, so they are registered)
- Modify: `packages/control-plane/src/api/routes/releases.ts` (`LAUNCH_READINESS` deleted; the production refusal computes)
- Modify: `packages/control-plane/src/api/{delivery,projects}.test.ts`, `lifecycle.test.ts`, `api/authz-contract.ts`, `api/routes/index.ts`
- Modify: `packages/journey/src/main.ts`; the regenerated contract

**Interfaces:**
- Produces: `type LaunchItemId = 'domain' | 'iam-registration' | 'privacy-assessment' | 'rehearsal' | 'scans' | 'admin-approval' | 'load-rehearsal'`; `interface LaunchItem { id; title: string; owner: string; blocking: boolean; state: 'met' | 'unmet' | 'not_built'; why: string; builtBy?: string }`; `interface LaunchReadinessView { projectId: string; ready: boolean; candidateReleaseId: string | null; items: LaunchItem[] }`; `computeLaunchReadiness(db: Db, projectId: string): Promise<LaunchReadinessView>` — `launch/`.
- Produces: `GET /v1/projects/{projectId}/launch-readiness` (`getLaunchReadiness` → `LaunchReadiness`); the production deploy's 409 carries the **same** view in `error.launchReadiness`.
- Consumes: `servingInstanceOf` (Task 8); `builds.scan` (Task 13); `STALENESS_THRESHOLD_DAYS` (`build/scan.ts`); `ProductionGateError` (Task 14).

- [ ] **Step 1: Write the failing tests**

`packages/control-plane/src/launch/readiness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { appSpecs, builds, environments, instances, projects, releases, routes } from '../db/index.js'
import { withProject } from '../db/testing.js'
import { eq } from 'drizzle-orm'
import { computeLaunchReadiness } from './readiness.js'

const CLEAN = { critical: 0, high: 0, medium: 0, low: 0, negligible: 0, unknown: 0 }
const scan = (databaseAgeDays: number, stale: boolean) => ({
  scanner: 'anchore/grype:v0.118.0', scannedAt: '2026-09-16T00:00:00.000Z', databaseAgeDays, stale,
  fixable: CLEAN, unfixable: { ...CLEAN, critical: 1 }, baseImage: CLEAN, unfixableFindings: [{ id: 'GHSA-1', severity: 'Critical', package: 'passport-saml' }],
})

/** A project whose staging hostname serves a release of a build with this scan. */
async function serving(tx: Parameters<Parameters<typeof withProject>[0]>[0], projectId: string, ownerId: string, buildScan: unknown) {
  await tx.insert(environments).values({ projectId, kind: 'staging', hostname: `${projectId.slice(0, 8)}.staging.manifest.internal` })
  const [env] = await tx.select().from(environments).where(eq(environments.projectId, projectId))
  const [spec] = await tx.insert(appSpecs).values({ projectId, commitSha: 'a'.repeat(40), parsed: {}, schemaVersion: 1, valid: true }).returning()
  const [build] = await tx.insert(builds).values({ projectId, commitSha: 'a'.repeat(40), appSpecId: spec!.id, status: 'succeeded', imageDigest: `sha256:${'b'.repeat(64)}`, scan: buildScan }).returning()
  const resolved = { auth: { provider: 'cwl', attributes: [] }, ai: { models: [] }, env: [], services: [] }
  const [release] = await tx.insert(releases).values({ projectId, buildId: build!.id, appSpecId: spec!.id, createdBy: ownerId, resolvedConfig: { sandbox: resolved, staging: resolved, production: resolved } }).returning()
  const [instance] = await tx.insert(instances).values({ environmentId: env!.id, releaseId: release!.id, driver: 'fake', state: 'healthy' }).returning()
  await tx.insert(routes).values({ instanceId: instance!.id, hostname: env!.hostname, listener: 'internal' })
  return release!.id
}

describe('LaunchReadiness, read-only (§13, P5a Task 15)', () => {
  it('is never ready in Phase 1, and says which plan builds each item that does not exist', async () => {
    await withProject(async (tx, { projectId }) => {
      const view = await computeLaunchReadiness(tx, projectId)
      expect(view.ready).toBe(false)
      expect(view.items.map((i) => i.id)).toEqual(['domain', 'iam-registration', 'privacy-assessment', 'rehearsal', 'scans', 'admin-approval'])
      expect(view.items.find((i) => i.id === 'domain')).toMatchObject({ state: 'met' })
      for (const id of ['iam-registration', 'privacy-assessment', 'rehearsal', 'admin-approval']) {
        const item = view.items.find((i) => i.id === id)!
        expect(item.state, id).toBe('not_built')
        expect(item.builtBy, id).toMatch(/^P\d$/)
      }
      expect(view.items.every((i) => i.why.length > 20 && i.owner.length > 0)).toBe(true)
    })
  })

  it('scans: unmet, saying why, when nothing serves staging', async () => {
    await withProject(async (tx, { projectId }) => {
      const scans = (await computeLaunchReadiness(tx, projectId)).items.find((i) => i.id === 'scans')!
      expect(scans).toMatchObject({ state: 'unmet', blocking: true })
      expect(scans.why).toContain('staging')
    })
  })

  it('scans: met for the release serving staging, scanned fresh, naming the unfixable findings recorded', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      const releaseId = await serving(tx, projectId, ownerId, scan(1, false))
      const view = await computeLaunchReadiness(tx, projectId)
      expect(view.candidateReleaseId).toBe(releaseId)
      const scans = view.items.find((i) => i.id === 'scans')!
      expect(scans.state).toBe('met')
      expect(scans.why).toContain('1')
    })
  })

  it('scans: unmet when the vulnerability database was stale, and says how old', async () => {
    await withProject(async (tx, { projectId, ownerId }) => {
      await serving(tx, projectId, ownerId, scan(12.5, true))
      const scans = (await computeLaunchReadiness(tx, projectId)).items.find((i) => i.id === 'scans')!
      expect(scans.state).toBe('unmet')
      expect(scans.why).toContain('12.5')
    })
  })

  it('adds the load rehearsal for a large course or a public app, and only then (§24)', async () => {
    await withProject(async (tx, { projectId }) => {
      expect((await computeLaunchReadiness(tx, projectId)).items.some((i) => i.id === 'load-rehearsal')).toBe(false)
      await tx.update(projects).set({ audience: { scale: 'large_course', burst: 'synchronised', justification: null, set_by: projectId, set_at: '2026-09-16T00:00:00.000Z' } }).where(eq(projects.id, projectId))
      const rehearsal = (await computeLaunchReadiness(tx, projectId)).items.find((i) => i.id === 'load-rehearsal')
      expect(rehearsal).toMatchObject({ state: 'not_built', builtBy: 'P9' })
    })
  })
})
```

In `api/delivery.test.ts`, the test *refuses production and says what is blocking it* becomes:

```ts
  it('refuses production with the SAME checklist GET /launch-readiness answers', async () => {
    const { deps, app, cookies, project, release } = await releasedProject('chem-labs')
    const production = project.environments.find((e: { kind: string }) => e.kind === 'production')
    const refused = await app.inject({ method: 'POST', url: `/v1/environments/${production.id}/deploy`, cookies, headers: mutationHeaders(deps), payload: { releaseId: release.id } })
    expect(refused.statusCode).toBe(409)
    const read = await app.inject({ method: 'GET', url: `/v1/projects/${project.id}/launch-readiness`, cookies })
    expect(read.statusCode).toBe(200)
    expect(refused.json().error.launchReadiness).toEqual(read.json())
    expect(JSON.stringify(read.json())).not.toContain('deliveredBy')
    await app.close()
  })
```

`lifecycle.test.ts` step 7 reads `error.launchReadiness.items` and asserts `ready: false` and that `scans` is the only item with a state other than `not_built`/`met` or is `met`. `api/authz-contract.ts` gains `GET /v1/projects/:projectId/launch-readiness` (stranger 404, anonymous 401, the rest pass).

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/launch/ src/api/delivery.test.ts
```

Expected: FAIL — `launch/readiness.js` does not exist; the 409 carries the constant.

- [ ] **Step 2: The computation**

`packages/control-plane/src/launch/readiness.ts`:

```ts
import { eq } from 'drizzle-orm'
import { STALENESS_THRESHOLD_DAYS } from '../build/index.js'
import { builds, environments, projects, releases, type Db } from '../db/index.js'
import { servingInstanceOf, type StoredAudience } from '../projects/index.js'
import type { ResolvedConfigSet } from '../releases/index.js'
import type { ScanSummary } from '../runtime/index.js'

export type LaunchItemId =
  | 'domain'
  | 'iam-registration'
  | 'privacy-assessment'
  | 'rehearsal'
  | 'scans'
  | 'admin-approval'
  | 'load-rehearsal'

export interface LaunchItem {
  id: LaunchItemId
  title: string
  owner: string
  blocking: boolean
  state: 'met' | 'unmet' | 'not_built'
  /** Why this state — for a faculty member, not a log line (§14). */
  why: string
  /** For `not_built`: the plan that builds it (roadmap, Phase 2). */
  builtBy?: string
}

export interface LaunchReadinessView {
  projectId: string
  /** True only when every blocking item is met — so false throughout Phase 1, honestly. */
  ready: boolean
  /** The release a launch would promote: the one serving staging (§13 — promotion never rebuilds). */
  candidateReleaseId: string | null
  items: LaunchItem[]
}

/**
 * §13's first-launch checklist, COMPUTED FROM WHAT EXISTS and never stored (P5a Decision
 * 35). §17 splits it: 1c ships this read-only view; Phase 2 ships the gate that blocks on
 * it. An item whose entity does not exist yet says so, and names the plan that builds it,
 * rather than inventing a status — the constant this replaces stamped four items
 * "deliveredBy: P4" that P4 did not deliver.
 */
export async function computeLaunchReadiness(db: Db, projectId: string): Promise<LaunchReadinessView> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  const [staging] = await db.select().from(environments).where(eq(environments.projectId, projectId)).then((rows) => rows.filter((e) => e.kind === 'staging'))
  const serving = staging === undefined ? undefined : await servingInstanceOf(db, staging)
  const [candidate] =
    serving === undefined
      ? []
      : await db.select({ release: releases, build: builds }).from(releases).innerJoin(builds, eq(releases.buildId, builds.id)).where(eq(releases.id, serving.releaseId))
  const provider = (candidate?.release.resolvedConfig as ResolvedConfigSet | undefined)?.production.auth.provider
  const usesCwl = provider !== 'none'
  const audience = project?.audience as StoredAudience | null | undefined

  const items: LaunchItem[] = [
    {
      id: 'domain',
      title: 'Where the app will live',
      owner: 'project owner',
      blocking: true,
      state: 'met',
      why: 'Canonical hostname only — no action. A custom domain is Phase 2 (§23), and for a CWL app it must be chosen before IAM registration, because the registration carries it.',
    },
    usesCwl
      ? {
          id: 'iam-registration',
          title: 'Registered with UBC IAM',
          owner: 'UBC IAM, from a package Manifest generates',
          blocking: true,
          state: 'not_built',
          builtBy: 'P8',
          why: 'Every production app that signs people in with CWL needs its own IAM registration (§9, C4), with a multi-week lead time. Manifest does not track it yet.',
        }
      : {
          id: 'iam-registration',
          title: 'Registered with UBC IAM',
          owner: 'UBC IAM',
          blocking: true,
          state: 'met',
          why: 'This app does not sign people in with CWL, so it needs no IAM registration.',
        },
    {
      id: 'privacy-assessment',
      title: 'Privacy Impact Assessment approved',
      owner: 'UBC Privacy Office, from a draft Manifest generates',
      blocking: true,
      state: 'not_built',
      builtBy: 'P8',
      why: 'A PIA is required before a production launch (§9), with a multi-week lead time. Manifest does not track it yet.',
    },
    {
      id: 'rehearsal',
      title: 'Pre-production rehearsal passed',
      owner: 'Manifest',
      blocking: true,
      state: 'not_built',
      builtBy: 'P6',
      why: 'A rehearsal against production-shaped identity before launch (D21). It is built with production environments.',
    },
    scansItem(candidate?.build.scan as ScanSummary | null | undefined, candidate !== undefined),
    {
      id: 'admin-approval',
      title: 'Release approved by a platform administrator',
      owner: 'platform admin',
      blocking: true,
      state: 'not_built',
      builtBy: 'P6',
      why: 'An administrator approves the exact image digest, with step-up re-authentication (§13). Approvals are built with production environments.',
    },
    ...(audience?.scale === 'large_course' || audience?.scale === 'public'
      ? [
          {
            id: 'load-rehearsal' as const,
            title: 'Load rehearsal passed',
            owner: 'Manifest',
            blocking: true,
            state: 'not_built' as const,
            builtBy: 'P9',
            why: `An app for ${audience.scale === 'public' ? 'the public' : 'a large course'} is rehearsed against staging with production-shaped capacity before launch (§24).`,
          },
        ]
      : []),
  ]

  return {
    projectId,
    ready: items.filter((i) => i.blocking).every((i) => i.state === 'met'),
    candidateReleaseId: candidate?.release.id ?? null,
    items,
  }
}

function scansItem(scan: ScanSummary | null | undefined, hasCandidate: boolean): LaunchItem {
  const base = { id: 'scans' as const, title: 'Dependency and secret scans clean', owner: 'Manifest', blocking: true }
  if (!hasCandidate) {
    return { ...base, state: 'unmet', why: 'Nothing is serving in staging yet, so there is no release to launch. Deploy to staging first — production runs exactly what staging ran (§13).' }
  }
  if (scan === null || scan === undefined) {
    return { ...base, state: 'unmet', why: 'The release serving staging was built before scans were recorded. Build and deploy it again.' }
  }
  if (scan.stale || scan.databaseAgeDays > STALENESS_THRESHOLD_DAYS) {
    return {
      ...base,
      state: 'unmet',
      why: `The release serving staging was scanned against a vulnerability database ${scan.databaseAgeDays} days old, more than ${STALENESS_THRESHOLD_DAYS}. A clean result from a stale database is not evidence (§12); rebuild once the database is refreshed.`,
    }
  }
  const unfixable = Object.values(scan.unfixable).reduce((a, b) => a + b, 0)
  return {
    ...base,
    state: 'met',
    why: `Its secret and lockfile gates passed and no finding it introduced has a published fix. ${unfixable} finding(s) with no published fix are recorded on the release (§12).`,
  }
}
```

`launch/index.ts`: `export * from './readiness.js'`. Export `StoredAudience` from `projects/index.ts` if it is not already, and `STALENESS_THRESHOLD_DAYS` from `build/index.ts`.

- [ ] **Step 3: The representation, the envelope, the route and the refusal**

`packages/control-plane/src/api/representations/launch.ts`:

```ts
import { z } from 'zod/v4'
import { representation, Uuid } from '../contract/schemas.js'

export const LaunchReadinessItem = representation(
  'LaunchReadinessItem',
  z.object({
    id: z.enum(['domain', 'iam-registration', 'privacy-assessment', 'rehearsal', 'scans', 'admin-approval', 'load-rehearsal']),
    title: z.string(),
    owner: z.string(),
    blocking: z.boolean(),
    state: z.enum(['met', 'unmet', 'not_built']).describe('`not_built`: Manifest does not track this yet; `builtBy` names the plan.'),
    why: z.string(),
    builtBy: z.string().optional(),
  }),
)

export const LaunchReadiness = representation(
  'LaunchReadiness',
  z
    .object({ projectId: Uuid, ready: z.boolean(), candidateReleaseId: Uuid.nullable(), items: z.array(LaunchReadinessItem) })
    .describe('§13’s first-launch checklist, computed from what exists. Read-only in Phase 1; Phase 2 gates on it.'),
)
```

Move `ErrorEnvelope` out of `api/contract/schemas.ts` into `packages/control-plane/src/api/representations/errors.ts`, unchanged except:

```ts
      launchReadiness: LaunchReadiness.optional().describe('On RELEASE_PRODUCTION_GATE_UNAVAILABLE: what a first launch still needs (§13).'),
```

and in `api/contract/document.ts` add `import '../representations/errors.js'` with the comment *registers ErrorEnvelope, which every operation's `default` response names by id*.

`packages/control-plane/src/api/routes/launch.ts`:

```ts
import { z } from 'zod/v4'
import { computeLaunchReadiness } from '../../launch/index.js'
import { assertCapability } from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { LaunchReadiness } from '../representations/launch.js'

export const launchRoutes = [
  defineRoute({
    operationId: 'getLaunchReadiness',
    method: 'GET',
    path: '/v1/projects/{projectId}/launch-readiness',
    tag: 'launch',
    summary: 'What a first production launch still needs',
    description: '§13 and §22 step 7: the checklist, computed from what exists, surfaced from the moment a project exists. Read-only in Phase 1.',
    params: z.strictObject({ projectId: z.uuid() }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The checklist.', schema: LaunchReadiness },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return computeLaunchReadiness(deps.db, params.projectId)
    },
  }),
]
```

`routes/index.ts` gains `...launchRoutes`. In `api/routes/releases.ts`, delete `LAUNCH_READINESS` and its comment; the refusal becomes `throw new ProductionGateError(await computeLaunchReadiness(deps.db, environment.projectId))`.

- [ ] **Step 4: Regenerate, run, and the journey requests production**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test
```

`packages/journey/src/main.ts`:

```ts
/** §22 step 7: request production; see LaunchReadiness with its blocked items and why. */
async function step7RequestProduction(): Promise<void> {
  checks.step('7. Request production — and see what a first launch still needs')
  const attempt = await client.POST('/v1/environments/{environmentId}/deploy', {
    params: { path: { environmentId: state.productionEnvironmentId! }, header: { 'Idempotency-Key': idempotencyKey() } },
    body: { releaseId: state.releaseId! },
  })
  checks.ok('production is refused, 409', attempt.response.status === 409, String(attempt.response.status))
  const envelope = attempt.error
  checks.ok('as RELEASE_PRODUCTION_GATE_UNAVAILABLE', envelope?.error.code === 'RELEASE_PRODUCTION_GATE_UNAVAILABLE')
  const readiness = unwrap(
    await client.GET('/v1/projects/{projectId}/launch-readiness', { params: { path: { projectId: state.projectId! } } }),
    'getLaunchReadiness',
  )
  checks.ok('the refusal carries the checklist the read answers', JSON.stringify(envelope?.error.launchReadiness) === JSON.stringify(readiness))
  checks.ok('not ready — honestly, in Phase 1', readiness.ready === false)
  checks.ok('the candidate is the release serving staging', readiness.candidateReleaseId === state.releaseId)
  const item = (id: string) => readiness.items.find((i) => i.id === id)
  checks.ok('the domain comes first, before IAM registration (§23)', readiness.items[0]?.id === 'domain' && readiness.items[1]?.id === 'iam-registration')
  checks.ok(
    'scans are computed from that release — met, or unmet for a stated reason',
    item('scans')?.state === 'met' || (item('scans')?.state === 'unmet' && item('scans')!.why.includes('days old')),
    `${item('scans')?.state}: ${item('scans')?.why}`,
  )
  checks.ok('what Manifest does not track yet says so, and who builds it', item('iam-registration')?.state === 'not_built' && item('admin-approval')?.builtBy === 'P6')
  checks.ok('every item says why', readiness.items.every((i) => i.why.length > 0))
}
```

`'after-app': [step7RequestProduction]`. `scripts/demo.sh`'s step 8 — which reads `error.code` — is unchanged. Restart the control plane; `pnpm typecheck && make demo-journey && make demo`.

- [ ] **Step 5: Gates, commit, controls**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A packages/control-plane packages/contract packages/journey
git commit -m "feat(launch): LaunchReadiness computed from what exists, read-only, and the production refusal carries it (§13)"
```

| | Break | Expect red | Then |
|---|---|---|---|
| a | in `scansItem`, delete the stale branch | *scans: unmet when the vulnerability database was stale* — a clean result from a stale database reads as met, which §12 forbids | `git checkout packages/control-plane/src/launch/readiness.ts` |
| b | `ready: items.filter(…).every(…)` → `ready: true` | *is never ready in Phase 1*; the journey's *not ready* | as (a) |
| c | in the deploy handler, pass `LAUNCH_READINESS`-shaped literal `[]` to `ProductionGateError` | *refuses production with the SAME checklist*; the journey's *the refusal carries the checklist* | `git checkout packages/control-plane/src/api/routes/releases.ts` |
| d | remove the `import '../representations/errors.js'` from `document.ts` | the drift test — `ErrorEnvelope` vanishes from `components`, every `default` response points at nothing | `git checkout packages/control-plane/src/api/contract/document.ts` |

---

## Task 16: The first administrator, out of band — and the fleet

**What §20 and §26 ask.** *"The first administrator is created by a documented out-of-band procedure, never by 'first user to log in wins'. Role changes are audited."* Today no administrator can exist (brief §2.2). And *cross-project and fleet-wide reads are admin-scoped endpoints on the public API*, the fleet list with §26's columns that exist (Decisions 20, 21, 36).

**Files:**
- Create: `packages/control-plane/drizzle/0013_*.sql` (generated: `audit.role_changes`; the grant appended by hand)
- Create: `scripts/admin-grant.sh`
- Create: `packages/control-plane/src/projects/admin-grant.docker.test.ts`
- Create: `packages/control-plane/src/projects/fleet.ts`, `projects/fleet.test.ts`
- Create: `packages/control-plane/src/api/representations/fleet.ts`, `api/routes/fleet.ts`
- Modify: `packages/control-plane/src/db/schema.ts` (`roleChanges`), `db/testing.ts` and `vitest.global-setup.ts` (the TRUNCATE lists)
- Modify: `infra/idp/config/authsources.php` (the `operator` test user)
- Modify: `packages/control-plane/src/api/authz-contract.ts`, `api/routes/index.ts`
- Modify: `scripts/demo-journey.sh` (the operator, made an administrator; the `after-app` session), `packages/journey/src/main.ts`; the regenerated contract
- Modify: `docs/superpowers/RUNBOOK.md` (*The first administrator*), `docs/superpowers/WALKTHROUGH.md` (the `operator` user)

**Interfaces:**
- Produces: `scripts/admin-grant.sh <grant|revoke> <puid> "<reason>"` — exit 0 on a change or a no-op, non-zero naming why on a refusal.
- Produces: `audit.role_changes` (`id`, `user_id`, `from_role`, `to_role`, `actor`, `reason`, `created_at`), append-only by grant.
- Produces: `listFleet(db: Db, reserved: ReservedLabels): Promise<FleetEntry[]>`; `GET /v1/fleet` (`listFleet` → `Fleet`), `403 FORBIDDEN` for anyone but a platform administrator.
- Produces: the IdP test user `operator` / `operator`, PUID `opr000001`.
- Consumes: `projectViews`, `servingInstanceOf` (Task 8); `ReservedLabels` (Task 9); `MANIFEST_ADMIN_SESSION` in the journey (Task 7's interface).

- [ ] **Step 1: The table, and its grant**

`db/schema.ts`, after `incidents`:

```ts
/**
 * §20: "Role changes are audited" (P5a Task 16). In the `audit` schema, append-only BY
 * GRANT like `events`: the migration grants `manifest_app` SELECT and INSERT only, and
 * the one writer — scripts/admin-grant.sh — runs as the database owner, out of band.
 *
 * Not a row in `audit.events`: that table's `project_id` is NOT NULL, and a platform role
 * belongs to no project. `actor` is TEXT, not a users FK, because the first grant has no
 * administrator to attribute it to — it is `bootstrap:<os user>@<host>`.
 */
export const roleChanges = audit.table(
  'role_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    fromRole: userRole('from_role').notNull(),
    toRole: userRole('to_role').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  },
  (t) => [check('role_changes_reason_present', sql`length(trim(${t.reason})) > 0`)],
)
```

```bash
cd /Users/rich/Developer/manifest
set -a; . ./.env; set +a
export MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
pnpm --filter @manifest/control-plane db:generate
```

Append to the generated `0013_*.sql`, as 0006 does:

```sql
--> statement-breakpoint
-- §20's append-only rule for role changes (P5a Task 16), exactly as 0004–0006 apply it: the
-- application role may read and add a row and never rewrite or remove one, and ON DELETE
-- restrict above closes the route through `users`.
GRANT SELECT, INSERT ON "audit"."role_changes" TO manifest_app;
```

**Read the file from disk** — `cat`, not a `$(ls …)` capture, which is how 0005 lost its grant (ORIENTATION §4) — then `pnpm --filter @manifest/control-plane db:migrate`. Add `'audit.role_changes'` to the TRUNCATE lists in `db/testing.ts` and `vitest.global-setup.ts`, **before `'users'`**.

- [ ] **Step 2: Write the failing Docker test for the script**

`packages/control-plane/src/projects/admin-grant.docker.test.ts`:

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, roleChanges, users } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'

const run = promisify(execFile)
const ROOT = new URL('../../../../', import.meta.url).pathname
const grant = (...args: string[]) =>
  run('bash', ['scripts/admin-grant.sh', ...args], { cwd: ROOT }).then(
    (r) => ({ code: 0, out: r.stdout + r.stderr }),
    (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }),
  )

beforeEach(resetDatabase)
afterAll(resetDatabase)

async function signedInOnce(puid: string) {
  const [user] = await db.insert(users).values({ ubcCwlPuid: puid, email: `${puid}@ubc.ca`, displayName: 'Test Operator' }).returning()
  return user!
}

describe('the first administrator, out of band (§20, P5a Task 16)', () => {
  it('grants the role and records who, when and why', async () => {
    const user = await signedInOnce('opr-test-1')
    const result = await grant('grant', 'opr-test-1', 'the first administrator for this laptop')
    expect(result.code, result.out).toBe(0)
    expect(result.out).toContain('sign in again')
    const [after] = await db.select().from(users).where(eq(users.id, user.id))
    expect(after!.role).toBe('admin')
    const [audit] = await db.select().from(roleChanges).where(eq(roleChanges.userId, user.id))
    expect(audit).toMatchObject({ fromRole: 'member', toRole: 'admin', reason: 'the first administrator for this laptop' })
    expect(audit!.actor).toMatch(/^bootstrap:.+@.+$/)
  })

  it('refuses a person who has never signed in, and an empty reason — changing nothing', async () => {
    expect((await grant('grant', 'nobody-ever', 'a reason')).code).not.toBe(0)
    await signedInOnce('opr-test-2')
    expect((await grant('grant', 'opr-test-2', '   ')).code).not.toBe(0)
    expect(await db.select().from(roleChanges)).toEqual([])
    expect((await db.select().from(users).where(eq(users.ubcCwlPuid, 'opr-test-2')))[0]!.role).toBe('member')
  })

  it('records nothing for a grant that changes nothing, and revokes', async () => {
    await signedInOnce('opr-test-3')
    await grant('grant', 'opr-test-3', 'first')
    expect((await grant('grant', 'opr-test-3', 'again')).code).toBe(0)
    expect(await db.select().from(roleChanges)).toHaveLength(1)
    expect((await grant('revoke', 'opr-test-3', 'no longer needed')).code).toBe(0)
    expect((await db.select().from(users).where(eq(users.ubcCwlPuid, 'opr-test-3')))[0]!.role).toBe('member')
  })

  it('is append-only to the control plane’s own role', async () => {
    await signedInOnce('opr-test-4')
    await grant('grant', 'opr-test-4', 'for the grant test')
    await expect(db.execute(sql`UPDATE audit.role_changes SET reason = 'rewritten'`)).rejects.toThrow(/permission denied/)
    await expect(db.execute(sql`DELETE FROM audit.role_changes`)).rejects.toThrow(/permission denied/)
  })
})
```

```bash
cd /Users/rich/Developer/manifest
MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/projects/admin-grant.docker.test.ts
```

Expected: FAIL — `scripts/admin-grant.sh` does not exist (exit 127); the append-only test passes already, **which proves the grant before the script exists** and is recorded as such.

- [ ] **Step 3: The script**

`scripts/admin-grant.sh`:

```bash
#!/usr/bin/env bash
# §20: "the first administrator is created by a documented out-of-band procedure, never
# by 'first user to log in wins'. Role changes are audited." THIS IS THAT PROCEDURE
# (P5a Task 16). RUNBOOK's *The first administrator* documents it.
#
#   scripts/admin-grant.sh grant  <puid> "<reason>"
#   scripts/admin-grant.sh revoke <puid> "<reason>"
#
# OUT OF BAND, deliberately: it speaks to Postgres as the database OWNER, inside the
# Postgres container. No control-plane route can change a platform role, and no delegated
# token ever will (D24) — so there is nothing on the network to steal that does this.
# At UBC the procedure is the same SQL, run by whoever holds the database owner's
# credential; the script is its local form.
#
# The person must have signed in once (the users row is created at sign-in, §9). Sessions
# carry the role they were issued with, so the change reaches them when they SIGN IN
# AGAIN — the stateless-session divergence from §20 recorded for P5b.
#
# macOS ships bash 3.2 and a BSD userland.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh

fail() { printf '%s\n' "$*" >&2; exit 1; }

[ "$#" -eq 3 ] || fail 'usage: scripts/admin-grant.sh <grant|revoke> <puid> "<reason>"'
ACTION="$1"; PUID="$2"; REASON="$3"
case "$ACTION" in
  grant) TO=admin ;;
  revoke) TO=member ;;
  *) fail "the first argument is grant or revoke, not '$ACTION'" ;;
esac
[ -n "$(printf '%s' "$REASON" | tr -d '[:space:]')" ] \
  || fail 'a reason is required: it is stored with the audit record, which is what makes the change attributable (§26)'
ACTOR="bootstrap:$(id -un)@$(hostname -s)"

# Values reach SQL as psql VARIABLES, quoted by psql (:'name'), then as session settings
# the DO block reads — never interpolated into SQL by this shell.
docker exec -i manifest-postgres psql -U manifest -d manifest_control \
  -v ON_ERROR_STOP=1 --single-transaction -q \
  -v puid="$PUID" -v to_role="$TO" -v actor="$ACTOR" -v reason="$REASON" <<'SQL'
SELECT set_config('manifest.puid', :'puid', true),
       set_config('manifest.to_role', :'to_role', true),
       set_config('manifest.actor', :'actor', true),
       set_config('manifest.reason', :'reason', true) \gset
DO $$
DECLARE
  target users%ROWTYPE;
  wanted user_role := current_setting('manifest.to_role')::user_role;
BEGIN
  SELECT * INTO target FROM users WHERE ubc_cwl_puid = current_setting('manifest.puid');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no user with PUID % has ever signed in; they must sign in once first', current_setting('manifest.puid');
  END IF;
  IF target.role = wanted THEN
    RAISE NOTICE 'PUID % is already %; nothing changed and nothing was recorded', target.ubc_cwl_puid, wanted;
    RETURN;
  END IF;
  UPDATE users SET role = wanted WHERE id = target.id;
  INSERT INTO audit.role_changes (user_id, from_role, to_role, actor, reason)
  VALUES (target.id, target.role, wanted, current_setting('manifest.actor'), current_setting('manifest.reason'));
  RAISE NOTICE 'PUID % is now %', target.ubc_cwl_puid, wanted;
END $$;
SQL
echo "Done. A session issued before this still carries the old role — sign in again."
```

```bash
cd /Users/rich/Developer/manifest
MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/projects/admin-grant.docker.test.ts
```

Expected: 4 passed.

- [ ] **Step 4: The fleet**

`packages/control-plane/src/projects/fleet.ts`:

```ts
import { desc, eq, max } from 'drizzle-orm'
import { builds, environments, incidents, instances, projects, releases, users, type Db } from '../db/index.js'
import type { ReservedLabels } from './reserved-labels.js'
import { servingInstanceOf, type Project, type StoredAudience } from './repository.js'

export interface FleetEnvironment {
  kind: 'sandbox' | 'staging' | 'production'
  hostname: string
  state: string | null
  releaseId: string | null
  imageDigest: string | null
  lastDeployAt: string | null
  latestIncidentAt: string | null
}

export interface FleetEntry {
  project: Project
  owner: { id: string; displayName: string; email: string }
  audience: StoredAudience | null
  /** §23: a project holding a label reserved after it was created — reported, never renamed. */
  slugReserved: boolean
  environments: FleetEnvironment[]
}

/**
 * §26's *Fleet* screen, with the columns that exist today (P5a Decision 21): owner,
 * environments and their state, current release digest, audience, last deploy, newest
 * Incident. AI spend and department are not built; the document says so.
 */
export async function listFleet(db: Db, reserved: ReservedLabels): Promise<FleetEntry[]> {
  const rows = await db
    .select({ project: projects, owner: { id: users.id, displayName: users.displayName, email: users.email } })
    .from(projects)
    .innerJoin(users, eq(projects.ownerId, users.id))
    .orderBy(desc(projects.createdAt))
  const entries: FleetEntry[] = []
  for (const row of rows) {
    const envs = await db.select().from(environments).where(eq(environments.projectId, row.project.id))
    const fleetEnvs: FleetEnvironment[] = []
    for (const env of envs.sort((a, b) => a.kind.localeCompare(b.kind))) {
      const serving = await servingInstanceOf(db, env)
      const [digest] = serving === undefined ? [] : await db.select({ imageDigest: builds.imageDigest }).from(releases).innerJoin(builds, eq(releases.buildId, builds.id)).where(eq(releases.id, serving.releaseId))
      const [last] = await db.select({ at: max(instances.lastSeenAt) }).from(instances).where(eq(instances.environmentId, env.id))
      const [incident] = await db.select({ at: max(incidents.createdAt) }).from(incidents).innerJoin(instances, eq(incidents.instanceId, instances.id)).where(eq(instances.environmentId, env.id))
      fleetEnvs.push({
        kind: env.kind,
        hostname: env.hostname,
        state: serving?.state ?? null,
        releaseId: serving?.releaseId ?? null,
        imageDigest: digest?.imageDigest ?? null,
        lastDeployAt: last?.at?.toISOString() ?? null,
        latestIncidentAt: incident?.at?.toISOString() ?? null,
      })
    }
    entries.push({
      project: row.project,
      owner: row.owner,
      audience: row.project.audience as StoredAudience | null,
      slugReserved: reserved.lookup(row.project.slug) !== undefined,
      environments: fleetEnvs,
    })
  }
  return entries
}
```

`packages/control-plane/src/api/representations/fleet.ts`:

```ts
import { z } from 'zod/v4'
import type { FleetEntry } from '../../projects/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'
import { Audience } from './projects.js'

export const Fleet = representation(
  'Fleet',
  z
    .array(
      z.object({
        id: Uuid,
        slug: z.string(),
        blueprint: z.string(),
        starter: z.string().nullable(),
        owner: z.object({ id: Uuid, displayName: z.string(), email: z.string() }),
        audience: Audience.nullable(),
        createdAt: Timestamp,
        slugReserved: z.boolean().describe('§23: holds a label reserved after it was created. Handle with the owner; never renamed automatically.'),
        environments: z.array(
          z.object({
            kind: z.enum(['sandbox', 'staging', 'production']),
            hostname: z.string(),
            state: z.string().nullable(),
            releaseId: Uuid.nullable(),
            imageDigest: z.string().nullable(),
            lastDeployAt: Timestamp.nullable(),
            latestIncidentAt: Timestamp.nullable(),
          }),
        ),
      }),
    )
    .describe('§26’s fleet, administrators only. Not yet: department, custom domains, AI spend this month.'),
)

export function toFleet(entries: readonly FleetEntry[]): z.input<typeof Fleet> {
  return entries.map((e) => ({
    id: e.project.id,
    slug: e.project.slug,
    blueprint: e.project.blueprintRef,
    starter: e.project.starter,
    owner: e.owner,
    audience:
      e.audience === null
        ? null
        : { scale: e.audience.scale, burst: e.audience.burst, justification: e.audience.justification, setBy: e.audience.set_by, setAt: e.audience.set_at },
    createdAt: e.project.createdAt.toISOString(),
    slugReserved: e.slugReserved,
    environments: e.environments,
  }))
}
```

`packages/control-plane/src/api/routes/fleet.ts`:

```ts
import { listFleet, AuthorizationError } from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { Fleet, toFleet } from '../representations/fleet.js'

export const fleetRoutes = [
  defineRoute({
    operationId: 'listFleet',
    method: 'GET',
    path: '/v1/fleet',
    tag: 'administration',
    summary: 'Every app on the platform',
    description:
      '§26: the fleet, for platform administrators — an admin-scoped read on the one public API (D31), not a second API. Everyone else is refused 403.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The fleet, newest project first.', schema: Fleet },
    errors: ['FORBIDDEN'],
    handler: async ({ deps, actor }) => {
      // The SESSION's role: a person made an administrator reads the fleet once they sign in again.
      if (actor.platformRole !== 'admin') {
        throw new AuthorizationError('FORBIDDEN', 'the fleet is a platform administrator’s read (§26)')
      }
      return toFleet(await listFleet(deps.db, deps.reservedLabels))
    },
  }),
]
```

`routes/index.ts` gains `...fleetRoutes`; `projects/index.ts` exports `./fleet.js`. `api/authz-contract.ts`:

```ts
  {
    // §26 (P5a Task 16): platform administrators only. 403, not 404 — there is no tenant's
    // resource to hide, and "you are not an administrator" is the true answer.
    method: 'GET',
    url: '/v1/fleet',
    request: () => ({ url: '/v1/fleet' }),
    expect: { owner: 403, collaborator: 403, stranger: 403, admin: 'pass', anonymous: 401 },
  },
```

`packages/control-plane/src/projects/fleet.test.ts` — with `withProject`: an entry per project, its owner, `slugReserved: false` for `fixture-…` and `true` after `UPDATE projects SET slug = 'console'`, and a staging environment's `state`/`imageDigest` once a Route row points at a healthy instance (the rows built as Task 15's test builds them).

- [ ] **Step 5: A third test user, and the journey reads the fleet**

`infra/idp/config/authsources.php`, after `instructor`:

```php
        // P5a Task 16: a person to make a platform ADMINISTRATOR with scripts/admin-grant.sh,
        // so the journey can read the fleet (§26) without changing what the student and the
        // instructor prove in every other demo. Friendly names, as above.
        'operator:operator' => [
            'ubcEduCwlPuid'        => ['opr000001'],
            'mail'                 => ['operator@ubc.ca'],
            'givenName'            => ['Test'],
            'sn'                   => ['Operator'],
            'eduPersonAffiliation' => ['staff'],
        ],
```

```bash
cd /Users/rich/Developer/manifest
docker restart manifest-idp          # the file is bind-mounted; a restart re-binds it by path
make verify | tail -3                # unchanged: 50 / 0
```

`scripts/demo-journey.sh`, before the `after-app` run:

```bash
say "An administrator, made out of band (§20), for the fleet (§26)"
OP_JAR="$WORK/operator.jar"; OP_IDP_JAR="$WORK/operator-idp.jar"
# Signed in ONCE so the users row exists, then granted, then signed in AGAIN — a session
# carries the role it was issued with.
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator "$ORIGIN/auth/saml/callback" "$CA"
bash scripts/admin-grant.sh grant opr000001 "P5a's acceptance journey reads the fleet (§26)"
rm -f "$OP_JAR" "$OP_IDP_JAR"
idp_login "$OP_JAR" "$OP_IDP_JAR" "$ORIGIN/auth/login" operator operator "$ORIGIN/auth/saml/callback" "$CA"
ADMIN_SESSION="$(session_of "$OP_JAR")"
[ -n "$ADMIN_SESSION" ] || fail "the operator's second sign-in left no session"
```

and the `after-app` run gains `MANIFEST_ADMIN_SESSION="$ADMIN_SESSION"`. `packages/journey/src/main.ts`:

```ts
/** §26: the fleet — refused to the instructor, read by an administrator made out of band. */
async function step8Fleet(): Promise<void> {
  checks.step('8. The fleet, as a platform administrator (§26)')
  const refused = await client.GET('/v1/fleet')
  checks.ok('the instructor is refused the fleet, 403', refused.response.status === 403, String(refused.response.status))
  const adminSession = process.env.MANIFEST_ADMIN_SESSION
  const admin = createManifestClient({ origin, session: checks.must('an administrator’s session was provided', adminSession) })
  const me = unwrap(await admin.GET('/v1/me'), 'getMe')
  checks.ok('the operator is signed in as an administrator', me.role === 'admin', me.role)
  const fleet = unwrap(await admin.GET('/v1/fleet'), 'listFleet')
  const entry = checks.must('journey-app is in the fleet', fleet.find((e) => e.slug === 'journey-app'))
  checks.ok('owned by the instructor, for a class', entry.owner.displayName === 'Test Instructor' && entry.audience?.scale === 'class', JSON.stringify(entry.owner))
  const staging = entry.environments.find((e) => e.kind === 'staging')
  checks.ok('its staging environment is healthy, on the journey’s release', staging?.state === 'healthy' && staging.releaseId === state.releaseId, JSON.stringify(staging))
  checks.ok('and its name is not a reserved label', entry.slugReserved === false)
}
```

`'after-app': [step7RequestProduction, step8Fleet]`.

- [ ] **Step 6: Run everything, document it, commit**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm test:docker
# restart the control plane
pnpm typecheck && make demo-journey
```

`RUNBOOK.md` gains **The first administrator**: why it is out of band (§20), that the person signs in once first, the two commands, that the change reaches them when they sign in again, how to read `audit.role_changes`, and that `operator` / `operator` is a test user made administrator by `make demo-journey` — `scripts/admin-grant.sh revoke opr000001 "<reason>"` undoes it. `WALKTHROUGH.md`'s test-user list gains `operator`.

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A packages/control-plane packages/contract packages/journey scripts infra/idp/config/authsources.php docs/superpowers/RUNBOOK.md docs/superpowers/WALKTHROUGH.md
git commit -m "feat(admin): the first administrator out of band, audited (§20), and GET /v1/fleet for administrators (§26)"
```

- [ ] **Step 7: Negative controls — after the commit**

| | Break | Expect red | Then |
|---|---|---|---|
| a | delete the `platformRole !== 'admin'` check | authz suite `GET /v1/fleet as owner → 403` (and collaborator, stranger); the journey's *the instructor is refused the fleet* | `git checkout packages/control-plane/src/api/routes/fleet.ts` |
| b | in the migration's grant, add `, UPDATE` — as a NEW migration, never by editing 0013 | *is append-only to the control plane's own role* | revert that migration's commit and `REVOKE UPDATE ON audit.role_changes FROM manifest_app` by hand, then re-run the test |
| c | in the script, delete the `INSERT INTO audit.role_changes` | *grants the role and records who, when and why* | `git checkout scripts/admin-grant.sh` |
| d | in `demo-journey.sh`, skip the second sign-in | the journey's *the operator is signed in as an administrator* (`member`) — the stateless-session fact, measured | `git checkout scripts/demo-journey.sh` |

---

## Task 17: `make demo-journey` green — P5a's acceptance

**Why alone and last.** For the reason P4a's Task 15, P4b's Task 16 and P4c's Task 11 were: the first time the whole journey runs end to end is where the plan's worst defects are, and P4c's sitting 8 showed that **four of an acceptance's nine controls could not fail in it**. The controls below say, for each, whether the journey can see it and, if not, which test does.

**Files:**
- Modify: `scripts/offline-acceptance.sh` (step 8, `make demo-journey`)
- Create: `docs/superpowers/spikes/p5a-baseline/results-sitting12-<YYYY-MM-DD>.txt`
- Modify: this plan's *What executing this plan found*, its sittings table; the close-out sweep's documents

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Snapshot, and the state to start from**

```bash
cd /Users/rich/Developer/manifest
./scripts/snapshot-machine.sh > /tmp/p5a-s12-before.txt
make doctor | tail -2 && make verify | tail -2
pnpm --filter @manifest/control-plane build
# README's exports, then start the control plane and read its boot line:
#   "driver":"docker", "origin":"https://console.manifest.internal", "reservedLabels":755
```

- [ ] **Step 2: Put the journey in the offline acceptance**

`scripts/offline-acceptance.sh`, after step 7, in the same form as step 6 and 7:

```bash
echo
echo "8. make demo-journey — §22's journey through the edge, by nothing but the generated client (P5a)"
if curl -sS -m 5 https://console.manifest.internal/v1/me 2>/dev/null | grep -q UNAUTHENTICATED; then
  make demo-journey
else
  echo "  SKIPPED: no control plane behind https://console.manifest.internal — the same rule as step 6."
fi
```

The offline run itself stays **Rich's** — turning the network off from a tool call cuts the agent off too.

- [ ] **Step 3: Run it three times**

```bash
cd /Users/rich/Developer/manifest
OUT=docs/superpowers/spikes/p5a-baseline/results-sitting12-$(date +%F).txt
make demo-journey 2>&1 | tee -a "$OUT"      # run 1: at once
make demo-journey 2>&1 | tee -a "$OUT"      # run 2: again — the reuse path, a redeploy
```

**Run 3 is from a `make reset` machine, and `make reset` removes every project on this machine — the demos' `proof-app` and `fixture-app` included. Put it to Rich before running it**, as P4c's sitting 8 did. With his agreement:

```bash
cd /Users/rich/Developer/manifest
make reset && make up
# README's exports, then:
pnpm --filter @manifest/control-plane db:migrate
make verify | tail -2                                   # 50 / 0 once migrated (ORIENTATION §4)
# start the control plane
make demo-journey 2>&1 | tee -a "$OUT"                  # run 3: journey-app created fresh
```

**Expected, each run:** every check `ok`, `every check passed` for both phases, exit 0 — and the output records, for the findings: the build's duration, the deploy's, whether `scans` was met or unmet and why, and the number of frames step 5 saw.

- [ ] **Step 4: The negative controls**

Each is an edit, a rebuild and control-plane restart where it is under `src/`, a run, and `git checkout` against the committed tree — `git status` clean after each. **Commit before breaking anything.**

| | Break | In `make demo-journey` | Where it goes red if not there |
|---|---|---|---|
| a | the Caddyfile's `@outside` refusal removed; `make up` | **green** — the journey runs from the host, which the refusal never refused | S6 probe 15; `make verify` *a container on manifest-platform is refused* |
| b | `Instance` → `z.looseObject`, and the deploy handler returns the row | **red** at step 5: *carries no driver internals* | `delivery.test.ts` *a deploy answers the instance without its driver or handle* |
| c | the CSRF check removed from the `preHandler` | **green** — the client always sends Origin | `csrf.test.ts` |
| d | the client's `origin` header removed (`packages/contract/src/client.ts`) | **red** at step 2: `createProject` refused `403 CSRF_ORIGIN_REFUSED` | `client.test.ts` *sends the session and the origin* |
| e | `packages/contract/openapi.json` edited by hand (a field renamed) | **green** — the running API is unchanged, and the journey is built from the checked-in types only when they compile | `client.test.ts` and `document.test.ts` drift |
| f | `/v1/projects/{projectId}/builds` renamed to `/builds` in its definition, without `contract:write` | **red** at step 4: `ROUTE_NOT_FOUND` | `document.test.ts` drift; `pnpm typecheck` once the client is regenerated |
| g | the control plane booted with `MANIFEST_RESERVED_LABELS_DIR` at an empty directory | **red** at step 0 — no control plane: the boot refused, naming `RESERVED_LABELS_MISSING` | `reserved-labels.test.ts` |
| h | `renderProjectSeed` without `...starter.files` (on a `make reset` machine, where `journey-app` is new) | **red** at step 6: the app has no `/api/ask` — or, earlier, at step 2's *manifest.yaml is valid* | `seed.test.ts` |
| i | `BuildRunner.start` awaits the build | **red** at step 4: *answered at once, still running* | `delivery.test.ts` *answers 202 while the build is still running* |
| j | `scan: image.scan` dropped from the build's update | **red** at step 4 (*recorded its scan*), step 5 (*digest and scan*) and step 7 (*scans … unmet* for the wrong reason — a check that reads the reason) | `delivery.test.ts` |
| k | `packages/journey/src/main.ts` imports `../../control-plane/src/db/index.js` | **green** — the import is unused | `boundary.test.ts`; `pnpm lint` |
| l | the `instance.starting` publish removed | **red** at step 5: *provisioning, starting and healthy streamed* | `delivery.test.ts` |
| m | the fleet's admin check removed | **red** at step 8: *the instructor is refused the fleet* | authz suite |
| n | `ready` hard-coded `true` in `computeLaunchReadiness` | **red** at step 7: *not ready* | `readiness.test.ts` |

**Four of these cannot fail in the acceptance — (a), (c), (e) and (k) — and that is recorded, not hidden:** a journey run from the host by a correct client cannot see a refusal of other sources, a forged origin, a hand-edited document or an unused import. Each is watched red in the tier that can see it, and the sitting's record says so, as P4c's sitting 8 did.

- [ ] **Step 5: Every gate, and the machine**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
make doctor | tail -2 && make verify | tail -2
./scripts/snapshot-machine.sh > /tmp/p5a-s12-after.txt && diff /tmp/p5a-s12-before.txt /tmp/p5a-s12-after.txt
```

Remove by explicit name, after checking each, anything the runs and controls left that the before-snapshot did not have — images built by the Docker tier and the controls, LiteLLM keys and users for projects `pnpm test` truncated (P4b finding 183) — and record what was removed. The four containers that must survive are there; port 7100 is whatever the sitting found it as.

- [ ] **Step 6: Record, sweep, commit**

*What executing this plan found*: sitting 12's runs (a table: run, when, checks, build and deploy durations, `scans` state), every finding, the fourteen controls with the four that cannot fail, the gate numbers, the machine. Then **the sweep** (ORIENTATION §6) — the roadmap's P5a row and ledger first; this plan's sittings table; ORIENTATION §2 (the numbers box, the header, the state), §3 (the document map: `packages/contract`, `packages/journey`, the starter's new path), §4 (`console.manifest.internal`, `edge.manifest.internal`, `pnpm typecheck`, `operator`), §7 (P5a done; **P5b is next to write**, from this plan's *What this plan does not build*) and §8; `README.md`; `CLAUDE.md`'s *State*; `RUNBOOK.md` (`make demo-journey`, the current gate totals); `WALKTHROUGH.md` (the console's origin, `make demo-journey`, the `operator` user); **check** the four HTML pages and say in the record that they were checked; `docs/external-track.md`.

```bash
git add -A docs scripts/offline-acceptance.sh README.md CLAUDE.md
git commit -m "docs: P5a is executed — make demo-journey green from a make reset machine, and the sweep"
```

---

## What this plan does not build

Named because the spec asks for it, or because someone will look for it.

**P5b's — delegated tokens and pending actions (D24), written after this plan executes.**
- `DelegatedToken` and `PendingAction`, bearer authentication, the central rule that a token never holds production promotion, secret read, quota change or member management, confirm and reject, expiry, and **per-token rate limits** — Task 9's in-process limiter is the pattern it generalises.
- **The token rule for the audience question**: D29 makes it human-only. In P5a every `/v1` caller is a session, so it holds by construction; P5b must refuse it to a token, and `POST /v1/projects/{projectId}/members` (`addMember`) with it.
- **Step-up re-authentication** for the privileged set (§20).
- **Removing a member** — a privileged action with nowhere to put a pending action until P5b.
- The brief's §7 items 5 and 6: D24's entity fields, and **§20's server-side session store and rotation on privilege change** — Task 16 measured the cost of their absence: a person made an administrator must sign in again.

**P5c's — the clients.**
- `manifest-mock`, validated against `packages/contract/openapi.json`; `console/` with the import boundary Task 7 built for the journey; the CI acceptance script, **signed in with a delegated token** rather than a session; and `@manifest/contract` `1.0.0` (Decision 8).
- The console's origin: the Caddyfile's placeholder `respond` line is what P5c replaces.

**Phase 2's.** The `LaunchReadiness` **gate**, production environments and promotion, approvals, `IamRegistration` and `PrivacyAssessment` as entities, custom domains, the audience tiers' effects and changing an audience after creation, the load rehearsal. Task 15 names each by the plan that builds it.

**Deliberately not attempted, and still open.**
- **A JSON Schema for `manifest.yaml` in the document.** `Spec.spec` is an open object: §7's schema is zod 3, which `z.toJSONSchema` cannot read, and moving it to `zod/v4` changes the issue codes `spec/errors.ts` maps (*Read this first* 2).
- **Nothing scans the control plane's own dependency tree** (ORIENTATION §8), and this plan adds `openapi-typescript`'s closure to the workspace. Task 7 records `pnpm audit` of it; nothing gates on it.
- **A builder container a restart interrupted** is not removed at boot; the build row is failed (Task 13), the container is not.
- **The fleet's AI spend, department and domains** (§26) — no data exists for the first two, and domains are Phase 2.
- **`egress.allow` does not refuse a platform hostname** (`console.manifest.internal`, `idp.manifest.internal`). *Added by Task 1, 2026-09-16 (`[M2g]`).* An app's egress proxy is on `manifest-platform`, so for an app that declares one the proxy would open a tunnel to the edge, and the edge's source allow-list is the control — which `[M2b]` measured refusing every platform-network source but the gateway, and Task 3's probe 15 watches. Refusing platform names in `egress.allow` changes which manifests §7 accepts, so it is a spec question and is not taken here.
- **Renaming a project.** §23 says the slug check, creation *and any rename* call one function; `checkSlug` is written to be that function, and no route renames a project yet.
- **The offline acceptance** is Rich's to run, now with step 8.
- **The second-machine clean clone** — out of 1c's acceptance by R5, still in RUNBOOK's *Known gaps*.

---

## Spec actions

**All six were applied on 2026-09-16, before this plan executes** (commit `491f8be`), on Rich's instruction (R9) — P4c's pattern — so the tasks argue from the spec as it now reads.

| Section | What changed | Why |
|---|---|---|
| §6, `Project` | gains `starter` | provenance of the first commit (Decision 30); §25 describes starters and §6 does not record which one a project used |
| §6, `Build` | gains `scan` (the `ScanSummary` of Task 13) | §12 says unfixable findings are *recorded on the Release*; the record lives on the build a release names, and §6 has no field for it |
| §6 and §20 | a `RoleChange` record — `id, user_id, from_role, to_role, actor, reason, created_at`, append-only | §20: *"Role changes are audited"*; `Event` cannot hold one (its `project_id` is required) |
| §22, D23.9 | a principle: **long-running work answers `202` and completes on the event stream; a deploy answers once the new instance serves** | Rich's R6 and P4c's R3, which a front-end team needs stated where it reads the API's principles |
| §20, *Manifest's own front door* | *CSRF protection* stated as an **`Origin` check** on every session-bearing mutation and stream upgrade, and a sign-in **bound to the browser that started it** | the same-site apps (Decision 15) make the mechanism a security property, not an implementation detail |
| §14 | the stream's contents gain **provisioning**: `project.created`, `repository.seeded`, `spec.validated` | §22 step 3 is *watch provisioning*, and §14 lists what streams |

**Raised while executing — sitting 1, 2026-09-16. Decided by Rich the same day; the §12 text is APPLIED (he told the executing agent to make the change so the decision would survive a hand-off), and it is ITS OWN HARDENING ITEM — not P5a's to build.** Not one of the six above. The rule now sits in §12 with no code enforcing it yet; it is the roadmap's one *Tracked hardening item*, to be built after P5a's Task 9 supplies the reserved-label loader.

**§12, *Egress — default deny, every environment (D18)* (and §7's `egress.allow`): an app may not egress to a platform surface.** Proposed wording, to follow the baseline paragraph:

> **`egress.allow` may name only destinations outside the platform.** It may not name the platform's own zone (`*.manifest.internal`, and each environment zone at UBC) or a platform service (`manifest-*`); such an entry is refused at validation as `EGRESS_ALLOW_INVALID`, before deploy. The destinations an app legitimately reaches on the platform — the package mirror, the AI proxy and the Manifest IdP — are the baseline the platform adds, never something an app declares, so a platform surface in `egress.allow` has no honest use. It also closes an east-west path: the egress proxy is dual-homed onto the platform network (it is the app network's only route out), so a platform name in `egress.allow` would open a proxy tunnel from the app to a platform service — the control plane's database, or the edge — across the boundary this section exists to hold, and that boundary must not rest on the service's own credentials. The refused set is derived from §23's reserved labels and the platform zones, not written as literals, because the zones differ at UBC.

**Why it was raised.** Task 1's `[M2g]` measured that `renderAllowlist` accepts any syntactic hostname — `console.manifest.internal`, `manifest-postgres`, `manifest-caddy` — and that the app's forced proxy tunnels raw TCP to *any* port (the positive control opened `manifest-idp:80`, not 443) to any name it can resolve on `manifest-platform`, which it is dual-homed onto. So an app that declares a platform service in `egress.allow` gets a tunnel to it across the east-west boundary §12 exists to hold. Today two things blunt it — `egress.allow` is a D9 re-escalation field a human reviews, and reaching a service still needs its credentials — but §12/§20 deliberately does not rest a network boundary on credential secrecy, and reserving the platform's own names is the pattern P5a already builds for slugs (Task 9).

**What it is NOT.** Not a replacement for the edge's source allow-list, which stays the primary control and is what Task 3 builds and probe 15 watches (`[M2b]`: the edge already refuses every platform-network source but the gateway, so `console.manifest.internal` is refused there regardless). Not a restriction on an app egressing to *another app's public hostname* — that is east-west, denied at the network layer, and a separate question left untouched.

**Where it lands.** Its own hardening item, **not P5a** and not folded into Task 9 (Rich, 2026-09-16) — the check reuses Task 9's reserved-label loader, so it can only be built once P5a has executed. Tracked in the roadmap's *Tracked hardening items*; the check reuses §23's reserved-label loader plus the environment zones and does not hardcode `*.manifest.internal`.

**Nothing else is proposed.** If executing this plan finds a section that no longer matches what runs, it is recorded here and put to Rich rather than edited.

---

## What the self-review caught

Run against the spec, the brief and the code on 2026-09-16, after the plan was written. **Eleven defects in the plan's own text, and one gap in the design it described.**

1. **A placeholder in Task 14**: `LAUNCH_READINESS = [/* moved verbatim … */]`. Written out in full — the constant a client reads until Task 15 replaces it.
2. **An elided test in Task 14** — `// …deployRelease(…) as the file does…` — which an implementer with no context could not write. Written in full against `releases.test.ts`'s own `fixture`, `RESOLVED` and `deployDeps`.
3. **`client.test.ts` imported the control plane's source** for `CONTRACT_VERSION` — exactly the reach across packages the journey's boundary forbids. Removed: the control plane's drift test already holds the document's version to the constant, so package = document is the whole chain.
4. **`stream-contract.test.ts` called `deps.builds?.idle?.()` in Task 12**, before `ServerDeps.builds` exists — `tsc` would have refused it while Vitest ran it. Removed; Task 13 adds the call when the runner exists.
5. **Task 11's migration exported `MANIFEST_DATABASE_URL`**; `drizzle.config.ts` reads `MANIFEST_ADMIN_DATABASE_URL`, so `db:migrate` would have connected with no URL. Corrected there, and written correctly in Tasks 13, 14 and 16.
6. **`buildReadableBy` was typed through `Parameters<typeof …>`** of two functions — correct and unreadable. Now `(db: Db, actor: Actor, buildId: string)`; the same fix for `environmentsWithInstances`, whose parameter was named `deps` and held a `db`.
7. **Three signature changes named no callers**: `createProject` twice (Tasks 9 and 11) and `recoverAtBoot` (Task 13). `releases/releases.test.ts`'s `fixture` calls `createProject` and none of the three tasks mentioned it. Each now names the `grep` that finds every caller.
8. **`slugs.test.ts`'s *taken* test read any project's slug**, so its *"says nothing about the holder"* assertion compared against an id the holder might not have — a check that could not fail. Filtered to the fixture's own project.
9. **A `waitFor([stream], () => true, 0)` in the journey** that waited for nothing. Removed.
10. **The sittings table's rule for `pnpm test:docker`** listed sittings 2, 3 and 9–12, and missed sittings 6–8, which change `projects/`, `blueprints/` and the event publishers the Docker tier exercises. Widened to every sitting but 1, 4 and 5.
11. **The decision count** said thirty-four; there are thirty-nine.

**The design gap: `starting` was never stored.** §22 step 5 is *instance state transitions stream live*, and the plan first described publishing `instance.starting` — but `deployRelease` computes `starting` in memory on the way to `healthy` and writes `provisioning` then the result (read from `releases/release.ts` while writing Task 14). An event for a state no row ever holds would have been a stream describing something the database contradicts. Task 14 Step 2 stores it, before the driver starts the instance, and its test reads the row at that moment.

**Found while writing, and put in the tasks rather than here**: `SPEC_INVALID` answered `422` from one route and `400` from another (Task 5); the Caddyfile's `respond` sorts ahead of `reverse_proxy` outside a `route` block (Task 3, and M2f measures the form); SAML `RelayState` is capped at 80 bytes, so the return path rides in the login cookie (Task 4); and a same-site app can open the event stream with a member's cookie, so the upgrade is origin-checked too (Task 4).

**Spec coverage.** Every item §7e and the brief's §4 assign to P5a has a task: public representations (8, 11, 13, 14), route schemas as the one source (6), OpenAPI under `/v1` (2, 6), the generated client (7), the error-code registry (5), event and frame schemas and the missing events (11, 12, 14), the API through the edge with CSRF and the refusal and its S6 probe (3, 4), reserved labels and the slug check (9), creation from skeleton and starter (10, 11), the missing reads (8, 10, 13, 14), `LaunchReadiness` with scans persisted (13, 15), audience at creation (11), blueprints and the knowledge pack (10), the admin bootstrap and the fleet list (16), and the acceptance (17). **Not covered, and named in *What this plan does not build***: a rename operation (`checkSlug` is written to serve one; no route renames a project), and §16's *sandbox* half of the refusal, which holds by construction and has no sandbox to probe until Phase 3.

**States this plan is deliberately in between tasks, rather than pretending otherwise:** between Tasks 2 and 3 the scripts speak `/v1` on the loopback origin; from Task 6 to Task 14, `/v1` routes not yet converted are listed in `coverage.test.ts`'s `UNCONVERTED`, which Task 14 deletes; between Tasks 14 and 15 the production refusal carries the old constant; and from Task 7 the journey passes at whatever step the last task reached, and is the acceptance only at Task 17.

---

## What executing this plan found

*One dated section per sitting: the tasks, every defect with the measurement that found it, the negative controls, and the four gate numbers at the end. This is the record that stops the next agent repeating the work rather than continuing it, and it is where a defect that is not worth fixing yet gets named instead of lost.*

### Sitting 1 — Task 1 — 2026-09-16 — 9 findings

**The measurements, before any code.** Run on the machine P4c left — macOS 26.6.2 (25G83), Node 24.12.0, Docker Engine 29.7.2, pnpm 11.24.0, zod 3.25.76, Fastify 5.12.3, yaml 2.9.0, Caddy v2.11.4, SimpleSAMLphp v2.5.3.1 — with `make doctor` 18/0 and `make verify` 47/0 before and after. **No platform code changed.** The raw output is [`spikes/p5a-baseline/results-task1-2026-09-16.txt`](../spikes/p5a-baseline/results-task1-2026-09-16.txt) and the index, measurement by measurement, is [its README](../spikes/p5a-baseline/README.md).

**Every premise the plan rests on held.**

| | Result |
|---|---|
| **M1** `zod/v4` | 6 of 6. A bad param refused (`invalid_format`); `handle` and `driver` stripped by `Project.parse`; a `Date` refused; registries convert to components that `$ref` each other, each carrying its own `$schema` and `$id`; a v4 `ZodError` is not zod 3's; `z.coerce.number()` takes `'5'`; `tsc` accepts the generic `defineRoute` and types `params` from the schema |
| **M2** the edge by source | Exactly the plan's table. Host → `held 1 [200]`; a `manifest-platform` container and the proof app → the refusal body `[403]`; **refusal removed, the proof app → `held 1 [200]`**; a 100 s request completed after 100 s; `caddy adapt` gave the expected `subroute`. The edge had 3 routes before and after, and the probe name answered the wildcard before and after |
| **M3** sign-in and stream through a new origin | A real CWL sign-in completed through `https://p5a-probe.manifest.internal` — `idp_login` read the IdP's form posting to that origin's ACS; `manifest_session` `HttpOnly`, not `Secure`; `/auth/me` → `ins000001`; a WebSocket through the edge delivered 25 frames with the ready frame; the IdP echoed `RelayState=p5a-m3-relaystate-probe` exactly. Step 8 put the ACS back to `http://127.0.0.1:7100/auth/saml/callback`, read before M3, during, and after |
| **M4** reserved labels | 755 labels in 6 groups, no rule breaks, no duplicates; `idp`, `console` and `edge` reserved; no project slug in the repository reserved |
| **M5** Node's `Origin` | `fetch` and `WebSocket` send none unless given one, then send it — with a cookie on the upgrade |

**Findings.**

1. **The plan's order would have failed M3.** Step 3 runs M1 through `vitest run --project unit`, and the unit project's `globalSetup` truncates `projects`, `project_members`, `users`, `instances`, `routes` and `secrets` even for one file that touches no database; M3 then stops at *"the instructor holds no proof-app project to stream"*. Found by reading `vitest.workspace.ts` and `vitest.global-setup.ts` before running M1, and confirmed afterwards — every one of those tables counted 0. M1's typecheck ran before M2 and its test after Step 8. Written at the top of Task 1, and into ORIENTATION §4's truncation entry. (`build` is plain `tsc` over `src/`, so the spike file was also moved out of `src/` while M3 built, or it would have landed in `dist/`.)
2. **M1g's negative control cannot see `params` widen to `any`.** Returning `slug: 1` was refused (TS2322), but it is refused whether or not `ctx.params` is typed. A second control was measured — reading `params.projectID` → `TS2551: Property 'projectID' does not exist on type '{ projectId: string; }'` — and Task 6 gains control (g), an `@ts-expect-error` line that makes `tsc` go red by itself if the typing is lost. Task 6 had no type-level control at all.
3. **`z.uuid()` is RFC 4122-strict** — version 1–8, variant 8–b, or nil — so a hand-made id in a path is a `400`, not the `404` a test may expect. The plan did not say so. Checked against the repository's 32 distinct UUID literals: two fail, both in `runtime/docker/names.test.ts`, neither reaches a route. Written at the top of Task 6.
4. **`z.discriminatedUnion` emits `anyOf`, not `oneOf`, and no `discriminator`** — the case Task 12's note anticipated. Whether the generated `EventFrame` narrows depends on what `openapi-typescript` 7.13.0 makes of it, which cannot be measured until sitting 5 installs it; Task 12's note now says what to check in `schema.d.ts`. Also recorded for reading the drift diff: a `.default()` key is `required` in output, `z.number().int()` emits ±9007199254740991 bounds, `z.iso.datetime()` a 261-character `pattern`, and `z.strictObject` `additionalProperties: false` in input mode too.
5. **M2 did not try the one other way off an app network: the app's own egress proxy**, which sits on `manifest-platform` (`mf-proof-app-staging-egress` = `10.89.0.8`). Measured as `[M2g]` (`m2g-egress-proxy.sh`): tinyproxy's deny-by-default filter answers `403 Filtered` to `CONNECT` for the probe name, `manifest-caddy:443`, `10.89.0.10:443` and `host.docker.internal:7100`, with and without the edge's refusal — **and the positive control, the allowlisted `manifest-idp:80`, opened with `200 Connection established`**, so the proxy does not simply refuse everything. **But `renderAllowlist` accepts any bare hostname**, so an app declaring `egress.allow: [console.manifest.internal]` would get the tunnel, and the edge's allow-list is then the only control — which `[M2b]` shows refusing every platform-network source but the gateway. Task 3's probe 15 gains the proxy half. **The `egress.allow` gap was written up as a spec action and accepted in substance by Rich the same day** (*Spec actions*, raised while executing): refuse a platform surface in `egress.allow`, in a hardening slice of its own, not P5a — because the proxy tunnels raw TCP to any name it resolves on `manifest-platform`, so the gap reaches `manifest-postgres`, not only the edge.
6. **M4c's own count was wrong.** `lines changed: 58` compared line *i* of the original with line *i* of the rewrite, so the one line yaml inserted shifted every later line. The real diff is four hunks.
7. **Task 11's rename reformats the starter's manifest, and Task 11's test cannot see it** — which also makes *Read this first* 6 wrong. `parseDocument` + `set('name', …)` + `String(doc)` keeps all 35 comments and changes three other lines of `fixtures/proof-app/manifest.yaml`: the 120-character `description:` line folded at 80 columns, and `attributes:` and `models:` padded to `[ … ]`. No `toString` option reproduces the file: `lineWidth: 0` removes the fold, but `flowCollectionPadding` sets flow maps and flow sequences together and this file pads only its maps. **A splice at the `name` scalar's `range` is byte-exact** (`[M4c+]`), and correct for a quoted or commented original. It was typechecked under the package's `tsconfig.json` and run as a scratch test beside `blueprints/`; **with `String(doc)` put back, its byte-equality assertion failed**, where Task 11's comment comparison stays green. Task 11's Step 4 code and Step 1 test are corrected, with the control's row.
8. **Decision 16 contradicted Task 4's code.** The decision put *"the nonce and the return path"* in `RelayState`; Task 4 keeps the return path in the cookie because SAML Bindings §3.4.3 caps `RelayState` at 80 bytes, which Decision 17's 512-character path would break. Found while deciding whether to probe a long `RelayState` — the code had already settled it. Corrected in place, marked as a Task 1 correction.
9. **The last sweep missed a status line.** `README.md` line 68 still said *"P5 is unwritten … writing P5a is the next job"*, contradicting line 104 of the same file, and ORIENTATION §2's *Plans* row said *"THE NEXT TO WRITE IS P5a"* beside a sentence saying it was written. Both corrected in this sitting's sweep.

**Checked and found fine, so nobody repeats it.** M4b's loose scan flagged `manifest`, `staging`, `app` and `port`; none is a project slug (git's `user.name`, the `manifest.*` label keys, `staging.hostname`, `appContainer(…)`, a comment). A tight scan found 21 project slugs, none reserved — noted at the top of Task 9. The M3 script now keeps the control plane's log when `M3_LOG` is set, because its trap removes the work directory, and a failed sign-in would otherwise leave nothing to read.

**Negative controls watched.** M1g (a) `slug: 1` → TS2322 and (b) `params.projectID` → TS2551, each restored and `cmp`'d against a saved copy; M2d, the refusal removed → the proof app forwarded; M2g, the allowlisted `CONNECT` → 200; `[M4c+]`, `String(doc)` put back → the byte-equality assertion fails. Every `python3` swap asserted its pattern matched before writing (ORIENTATION §4).

**No sitting boundary moved.** Corrections are at the top of Tasks 3, 4, 6, 9, 11 and 12, in Decision 16 and in *Read this first* 6.

**Gates at the end.** `pnpm test` **832 passed, 72 files**, twice; `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` and `pnpm format:check` clean; `make doctor` **18/0**; `make verify` **47/0**. `pnpm test:docker` not run — sitting 1 touched none of the paths that require it. All four numbers are §2's box unchanged.

**Machine.** `scripts/snapshot-machine.sh` before and after differ only in timestamps, uptimes, free disk (125 → 124 GiB, rounding) and the untracked spikes directory. No container, network, volume or image was added; the four containers that must survive are there; port 7100 and the hold server's 7190 are free; the edge holds the three routes it started with. **One thing did change and is not reversible here: the control plane's tables are empty** (finding 1, and the gates' own `pnpm test`), so the proof app runs with no project row behind it — the state `pnpm test` always leaves, and the one Tasks 2 and 3 start from before they re-run the demos (ORIENTATION §7e).

**Documents swept.** The roadmap's four P5a status lines; this plan's sittings table, Task 1's header and this entry; ORIENTATION's header, §2 (*Plans* row and the immediate-work paragraph — the numbers box did not move), §3 (the document map row and the tree), §4 (the truncation entry), §7's lead and §7e; `README.md`; `CLAUDE.md`'s *State*; `WALKTHROUGH.md` and `RUNBOOK.md` checked — neither states P5a status or a number that moved. The four HTML pages and `docs/external-track.md` were checked and need nothing: a sitting of measurements changes no architecture, status an outsider reads, or UBC item.

### Sitting 2 — Tasks 2 and 3 — 2026-09-16 — 16 findings

**The API moved twice: every resource route under `/v1` (Task 2, `fad5e31`), then onto `https://console.manifest.internal` through the edge, refused to every source but the host (Task 3, `8520e0a`; then `92b4ebb` and `1c83bd3`, two fixes its own negative controls found).** Run on the machine sitting 1 left — macOS 26.6.2 (25G83), Node 24.12.0, Docker Engine 29.7.2, pnpm 11.24.0, Caddy v2.11.4, SimpleSAMLphp v2.5.3.1 (no seed). **Every demo is green through the edge** — `make demo`, `make demo-identity`, `make demo-ai`, and `make demo-redeploy` 24 of 24 on its second run (finding 15 is its first) — with the boot line reading `"origin":"https://console.manifest.internal"`. `make verify` is **50/0**, and S6 probe 15 records `app=403 host=401`.

**Task 2.** `api/unversioned.ts` names the five routes D23.8 keeps outside `/v1`, with their reasons, and `api/versioning.test.ts` holds `app.registeredRoutes` to exactly that list; any unmatched path answers `404 ROUTE_NOT_FOUND` in the D23.7 envelope with a hint naming `/v1` (the hint also names `packages/contract/openapi.json`, which Task 6 creates — a two-sitting forward reference, left as the plan wrote it). `/auth/me` is `/v1/me` and the callback lands there. Every demo speaks through one `scripts/lib/api.sh`; `scripts/demo.sh` and `scripts/lib/proof-app.sh` no longer carry their own copies.

**Task 3.** The Caddyfile's `console.manifest.internal` site; `MANIFEST_CONTROL_PLANE_ORIGIN` defaulting to it; the session cookie `Secure` from the origin, with a test for the loopback case; `CONSOLE_HOST`, `HOST_SOURCE_IP` and `EDGE_PROBE_HOST` in `infra/lib/common.sh`; `make verify`'s edge probes (and their labels) on `edge.manifest.internal` with three new console checks; `doctor.sh`'s Node-trust probe on `edge.`; S6 probe 15 with the egress-proxy half sitting 1 added; and every script signing in and calling through `$ORIGIN`, with step 0 checking that the ANSWER is the control plane's `UNAUTHENTICATED` envelope.

**Findings.**

*Task 2*

1. **Step 6's `sed` breaks every script path that was not already quoted, and the step's check cannot see it.** `s#api (GET|POST) "?/(projects…)#api \1 "/v1/\2#` always writes an opening quote, so `api POST /projects "{…}"` became `api POST "/v1/projects "{…}"` and `api GET /projects | node …` lost its closing quote — two lines each in `scripts/demo.sh` and `scripts/lib/proof-app.sh`. Measured on a copy of `demo.sh`: `bash -n` → `unexpected EOF while looking for matching '"'` (exit 2). The step's `grep … | grep -v '/v1/'` printed nothing, because every broken line contains `/v1/`. Fixed by hand; every script now passes `bash -n`.
2. **`scripts/doctor.sh` recognises the running control plane by asking `/auth/me`**, and Task 2's file list omits it. After the move that path answers `ROUTE_NOT_FOUND`, so with the control plane running `make doctor` said `CLAIMED BY SOMETHING ELSE: 7100` — measured as control (d), 18 checks, 1 failed. It asks `/v1/me`.
3. **A user-facing hint named an old path the plan did not list**: `SPEC_INVALID`'s hint in `routes/delivery.ts` (`GET /projects/:id/spec lists the errors`). Moved, with the 426 hint the plan named and eleven comments in `src/` that describe a current route by method and path.
4. **Control (c) as written aims at a line that usually does not run.** `demo.sh`'s only `api GET /projects` is in the branch that reuses an existing project. The control broke step 1's `api GET /v1/me` instead, which always runs and prints the refused body — `{"error":{"code":"ROUTE_NOT_FOUND",…}}` and `make: *** [demo] Error 1`.

*Task 3*

5. **`config.test.ts` asserts the old default origin** (`http://127.0.0.1:7100`) and is not in the task's file list; it would have gone red. It asserts `https://console.manifest.internal`.
6. **Probe 15 placed after probe 14, as written, fails with `expected '' to be '403 …'` — not on the hole.** Probe 11 forks `sleep 5 &` up to `PidsLimit` 64, and the app's PID 1 is `node`, which never reaps the orphans it adopts. Measured on a throwaway `node:22-alpine --pids-limit 64`: twenty orphaned `sleep 2`s sat in state `Z` under ppid 1, and after probe 11's loop `pids.current` was 64 seventeen seconds later and `docker exec … node` could not start at all, so `inApp` returned `''`. **Probe 15 now runs before probe 11**, and its docblock says why; placed there it failed first on the hole itself (`expected '200 manifest OK host=console.manifest…' to be '403 …'`). **The platform half is named, not fixed**: app containers run with no init, so an app whose children leave grandchildren behind slowly spends its `PidsLimit` (ORIENTATION §4).
7. **Probe 15's host control failed the full `pnpm test:docker` with `error fetch failed`.** Global `fetch` trusts the platform CA only through `NODE_EXTRA_CA_CERTS` in the environment Vitest was started with; `pnpm test:docker` does not set it and nothing else in the tier fetches HTTPS from the host process — every other probe passes `--cacert` inside a container. The plan's advice (export it before the run) would make a gate depend on a shell profile. The control now passes `ca` to `https.get` and reports an error's code; the file went 18 of 18, `app=403 host=401`.
8. **Saving the Caddyfile can strand the edge's mount, and `make up` then fails.** It is a single-file bind mount, bound to the inode; the agent's edit tool — and `git checkout` — replace the file, and `/etc/caddy/Caddyfile` became *No such file or directory* inside `manifest-caddy`, so `ensure-caddy-config.sh`'s reload failed and `make up` exited 1 (`reading config from file: open /etc/caddy/Caddyfile: no such file or directory`). The script now compares the hash the edge reads with the host's and restarts the edge to re-bind when they differ. Watched as control (g): with the check disabled and an `os.replace` save (inode 46354372 → 46355344), `make up` failed exactly as above.
9. **The first version of that fix hid a stale mount** — found by restoring control (g). The failed reload left the applied-hash marker at the old hash; `git checkout` put that content back through another replacing save; the marker matched, and the script exited 0 before its visibility check with the file still missing inside the edge. A live mount always shows the host's bytes, so the comparison now runs first (`92b4ebb`); the next `make up` re-bound it, and the one after was a no-op.
10. **Through the edge, the event stream was closed by any deploy anywhere.** Every Caddy admin-API change is a whole-config reload, and a reload closes every WebSocket the old config proxied with `1001 Going Away`. `make demo-ai` failed at step 5 (*the subscriber's socket closed with 1001*); a probe then showed one `PUT` of an unrelated route closing a subscribed stream in under 3 s. **The console's `reverse_proxy` sets `stream_close_delay 1h`**, and with it the same stream survived a `PUT` and a `DELETE` and `make demo-ai` was green. Build-log lines are not replayed on reconnect, which is why a delay and not only a reconnect. **App routes carry no delay, so any deploy closes every app's proxied WebSockets** — named in ORIENTATION §4, not fixed. Tasks 7 and 12 carry a correction.
11. **The demos' event-stream watcher needed the CA too**, which Task 3 does not mention: `event-stream.mjs` now opens `wss://console.manifest.internal`, and Node does not read the keychain (S7). Measured: `fetch` of the same origin without `NODE_EXTRA_CA_CERTS` → `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`; with it → `401`. `demo-ai.sh` and `demo-redeploy.sh` run the watcher under `NODE_EXTRA_CA_CERTS="$CA"`.
12. **`scripts/offline-acceptance.sh`'s step 5 — C1's parity demo — fetched `console.manifest.internal` from the host and from a container**, which now answer differently by design; the task named only the two control-plane probes. It uses `edge.manifest.internal`.
13. **Step 1's `verify.sh` `sed` moves the probes but not their LABELS**: `check "a container reaches https://console.$ZONE …"` has no `/` after the name, so the check would have said `console` while probing `edge`. The labels moved with the URLs.
14. **Caddy's `502` for a stopped control plane has no body**, so step 0's refusal read `got: ` with nothing after it. Control (h) measured the old check passing (`curl -o /dev/null` → exit 0 on `502`) and the new one failing; step 0 now writes the status (`got:  [502]`, `1c83bd3`).
15. **`make demo-redeploy` failed once, 23 of 24, on *same-release: a question in flight when the route moved was answered by the previous instance* — by chance.** The move landed at +1367 ms, inside the 47 ms between question 2's answer (+1331) and question 3's start (+1378), so no question spanned it (`inFlightAcrossMove: 0`); every other assertion was green, including zero 5xx and nobody signed out. The re-run was 24 of 24 (`acrossMoveMs` `[[-48,2595,"200"]]` and `[[344,2360,"200"]]`). The asker talks to the app's hostname, not the console, so Task 3 did not cause it. Named in ORIENTATION §4.
16. **Tasks 7 and 12 would have met findings 10 and 11 again.** The journey is a Node process calling `https://console.manifest.internal` with no `NODE_EXTRA_CA_CERTS` in Task 7's `demo-journey.sh`, and Task 12's `subscribe` goes through the reloading edge. A *Sitting 2 correction* is at the top of each.

**Checked and found fine, so nobody repeats it.** Task 2 Step 2's second test failed with `401`, not Fastify's default `404` — `/projects` still existed before the move. Control (d) reads `expected undefined to be true` rather than `false`: `light-my-request` omits an absent `Secure`. Task 9's Caddyfile regex still finds exactly `idp` and `console` with the console site's nested `route`/`header`/`reverse_proxy` blocks. `routesRestored` was 0 after most restarts because the Vitest runs had emptied the tables; after the demos it was 2. The four HTML pages state architecture, not the API's address, and need nothing.

**Negative controls watched** — each after its commit, each restored and `git status` clean. Task 2: (a) `/v1/me` back to `/auth/me` → `versioning.test.ts` and seven authz cases red (`expected [ 'GET /auth/me' ] to deeply equal []`); (b) the not-found handler deleted → *answers an old, unversioned path* red; (c) step 1's path back → `make demo` stops on `ROUTE_NOT_FOUND`; (d) `doctor.sh` back to `/auth/me` → *CLAIMED BY SOMETHING ELSE: 7100*. Task 3, before the site existed: `make verify` 50 checks / 3 failed, and probe 15 `expected '200 manifest OK host=console…'`. After: (a) `@outside` removed → `make verify` *refused* (`401` envelope) and *allowed source* red, probe 15 `expected '401 {…' to be '403 …'`; (b) `/32` → `10.89.0.0/24` → both `make verify` checks red; (c) booted at `http://127.0.0.1:7100` → `make demo` step 1: *the IdP would post the assertion to 'http://127.0.0.1:7100/auth/saml/callback' but this Service Provider answers at 'https://console.manifest.internal/auth/saml/callback'*; (d) `Secure` from `MANIFEST_ENV` → *completes a login* red; (e) `secure: true` → the new loopback test red (`expected true to be falsy`); (f) `stream_close_delay` removed → the probe's stream `closed 1001` after one `PUT`, restored → alive; (g) the re-bind disabled + a replacing save → `make up` exit 1; (h) control plane stopped → step 0 fails naming `[502]`. Every `python3` swap asserted its pattern matched before writing.

**Gates at the end.** `pnpm test` **835 passed, 73 files**, run twice after each task's TypeScript landed and again before every commit; `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` and `pnpm format:check` clean; `make doctor` **18/0**; `make verify` **50/0**; `pnpm test:docker` **168 passed, 27 files, 0 skipped**, 762 s — one more than P4c left, S6 probe 15, and measured with the control plane running, so its host control read `401`.

**Machine.** `./scripts/snapshot-machine.sh` before (16:58) and after (18:14), diffed. Containers, networks and volumes are the same apart from **the proof app's instance, its `-files` volume and the image it runs**, which the demos replaced — one container and one volume, as sitting 1 left it. **Cleaned up by name after checking each:** the fixture app `make demo` created this sitting — its three containers, its network (the edge and `manifest-dns-containers` disconnected first), its `-db-data` volume and its database's anonymous volume, and `.manifest/repos/fixture-app.git` (a repository without its project is P4b finding 190's trap); **28 images** the Docker tier and the demos built, each absent from the before-snapshot under every name and used by no container — two of them only after removing the first name showed a second (ORIENTATION §4's two-names trap); **two LiteLLM users and their keys** for proof-app projects the Vitest runs had truncated — one of them the orphan key sitting 1 left, whose container is gone — leaving only the running proof app's user and `p4b-probe-user`; and the raw output `make demo-redeploy`'s red run kept. **The proof app serves again at its hostname** (`{"status":"ok","mongo":true}`): the Docker tier's edge restart and the tests' truncations had dropped its route, so `make demo-identity` ran once more, and the control plane was restarted once after the tier, so **the platform's SP row's ACS is `https://console.manifest.internal/auth/saml/callback`**, checked in `manifest_idp`. The control plane is stopped and port 7100 is free. The four containers that must survive are there. Free disk is 121 GiB against 125 at the start.

**Documents swept.** The roadmap's four P5a status lines; this plan's sittings table, Task 2's and Task 3's headers, *Sitting 2 corrections* at the top of Tasks 7 and 12, and this entry; ORIENTATION's header, §2 (the numbers box — `pnpm test` 835, `pnpm test:docker` 168, `make verify` 50 — the *Plans* and *Code* rows and the immediate-work paragraph), §3 (the document map row and the tree), §4 (seven new entries), §7's lead, §7e and §8 (two questions raised); `README.md` (status, the numbers, *Where to start*, and *Running the control plane* rewritten for the console origin); `CLAUDE.md`'s *State* and numbers; `RUNBOOK.md` (the current `make verify` total, the first page it has you open, and the event stream through the edge); `WALKTHROUGH.md` (what is built, the quick checks, the sign-in URL, and three new confusions). The four HTML pages and `docs/external-track.md` were checked and need nothing: they state the architecture, not the API's address, and no UBC item moved.

### Sitting 3 — Tasks 4 and 5 — 2026-09-16 — 15 findings

**The front door, then the error-code registry.** Task 4 (`b59ef28`, then `998557e`): a request carrying a session must carry `Origin: https://console.manifest.internal` — every mutation and every event-stream upgrade — or it is `403 CSRF_ORIGIN_REFUSED`; a sign-in is bound to the browser that started it and lands on a same-origin return path. Task 5 (`6b3ae28`, then `cbd4ce5`): `api/error-codes.ts`, every code a client can receive — 65 — held to the source in both directions. Run on the machine sitting 2 left — macOS 26.6.2 (25G83), Node 24.12.0, Docker Engine 29.7.2, pnpm 11.24.0, Fastify 5.12.3, @node-saml/node-saml 5.1.0, Caddy v2.11.4, SimpleSAMLphp v2.5.3.1 (no seed). **`make demo-identity` and `make demo-ai` are green through the edge with the binding**, and the control plane logged no refusal of any kind during either.

**Task 4.** `api/csrf.ts` (`CsrfRefusedError`, `carriesSession`, `assertSameOrigin`), called in the preHandler and in both halves of the stream route (the `preValidation` hook, which answers `403` before the upgrade, and the socket handler, which closes `4403`); `identity/login-state.ts` (`manifest_login`, `LOGIN_TTL_SECONDS`, `safeReturnTo`, `newLoginNonce`, `encodeLoginCookie`, `readLoginCookie`, `sameNonce`); `SamlSp.loginUrl(relayState)`; `GET /auth/login?returnTo=` setting the cookie (`HttpOnly`, `Path=/auth`, 600 s, `SameSite=None; Secure` on https, `Lax` on a loopback http origin) and sending the nonce as `RelayState`, which node-saml signs into the redirect; the callback exempt from the origin check on its own route option, refusing an unbound assertion as `401 SAML_LOGIN_NOT_BOUND` BEFORE node-saml validates it, clearing the login cookie on success and redirecting to the return path; `mutationHeaders(deps)` in `api/testing.ts`; `RelayState` posted back by `infra/lib/idp-login.sh`; `Origin` from `scripts/lib/api.sh` and `event-stream.mjs`; README, RUNBOOK and WALKTHROUGH.

**Task 5.** The registry and its test as the plan wrote them — the draft matched the source code for code, 63, with `SPEC_INVALID` under two families as it predicted — plus `REQUEST_MEDIA_TYPE_UNSUPPORTED` and `REQUEST_BODY_TOO_LARGE`; the build route's invalid-spec refusal is `SpecInvalidError` (422, with `details`); `toErrorResponse` is a wrapper over `mapError` that reports an unregistered code on stderr, by code alone.

**Findings.**

*Task 4*

1. **"Before the idempotency check" is one `return` from exempting `/auth/logout`.** The existing preHandler returns early for an idempotency-exempt route before it checks the key, and `/auth/logout` carries that exemption; a check placed after the `return` — a natural reading of Step 5 — never runs for the one `/auth` route Decision 15 says is NOT exempt. It sits between the unmatched-route guard and the opt-out. Control (k), the check moved after the `return`: *refuses a sign-out from a sibling origin* red (`expected 204 to be 403`).
2. **The plan's `sameNonce` returns `true` for two empty strings** — `timingSafeEqual` of two zero-length buffers. The callback cannot reach it today (`readLoginCookie` refuses an empty nonce), so it is refused in the function rather than trusted to a caller; control (i).
3. **Four SAML refusal tests in `auth.test.ts` asserted only `401`** — unsigned, wrong audience, unsolicited and expired. The binding is a new `401` in front of all of them, so any of them that forgot to pass the binding would have stayed green, refused for the wrong reason. Each now names `SAML_ASSERTION_REJECTED`; control (j), the binding dropped from the unsolicited test: `expected 'SAML_LOGIN_NOT_BOUND' to be 'SAML_ASSERTION_REJECTED'`.
4. **`identity/saml.docker.test.ts`'s *refuses an unsigned assertion, and does not crash on one* — not named by the plan — would have stopped reaching the XML parser it exists for.** It posted no binding, so after Task 4 it is refused before node-saml sees the document and stays `401`. It now starts a sign-in, posts with that cookie and nonce, and names `SAML_ASSERTION_REJECTED`. The success test also asserts, on every run, that **the real IdP echoes `RelayState` unchanged** in its auto-submitting form, and that the same real assertion posted with no login cookie is `401 SAML_LOGIN_NOT_BOUND` before the bound post completes — so the request ID survives a refusal.
5. **Step 6's `grep idempotency-key` cannot find two of the sites Task 4 breaks.** `projects.test.ts`'s *refuses a mutating request with no Idempotency-Key* sends no key by design and would have read `403 CSRF_ORIGIN_REFUSED`; and `events.test.ts`'s `connect` sent a cookie and no `Origin`, so every existing stream test would have been refused — the plan names only the file's project creation. Fourteen more call sites had no `deps` in scope, which `tsc` listed. `upgradeStatus` does not exist; the test uses `connect(puid, id, origin)` and `outcomeOf`.
6. **Control (b) went red as a bare `Test timed out in 5000ms`.** An upgrade that should have been refused and was not neither refuses nor closes, and `outcomeOf` waited 10 s, past Vitest's 5 s. It now resolves `{ opened: true }` for an accepted upgrade (`998557e`), and (b) reads `expected { opened: true } to deeply equal { status: 403 }`.
7. **Control (e) reads `500` for *a browser that did not start the sign-in*, not the plan's `302`** — with the check gone and no cookie, the redirect's `binding.returnTo` throws. Still red; recorded so nobody reads the 500 as a new defect.
8. **Control (d) stayed green, as the plan predicted and recorded** — the socket handler's second read of the origin cannot be seen while the hook refuses first. (d′), the hook's read removed and the handler's kept, goes red (`{ opened: true }`), so the hook is the observable half and the handler's `4403` never stands in for it.
9. **Step 9 names only `curl -X POST` lines, and three more places changed.** A sign-in now lands on `/` — the console's placeholder, which names `/v1/` — where `WALKTHROUGH.md` said it lands on `/v1/me`; the walkthrough signs in with `?returnTo=/v1/me` and names both new refusals under *Things that will confuse you*. RUNBOOK's stream paragraph said *"`Origin` unchecked until Task 4"*. **Decided, not asked:** the default stays `/` as Decision 17 has it — through the edge `/` is a page saying the console is not built yet and where the API is, not the control plane's own `404` that made `/` read as a failed sign-in in P4a. And the plan's refusal hint names `@manifest/contract`'s client, which does not exist until Task 7; it names what a script does instead.
10. **Through the real edge, the refusal holds — and the first probe of the stream had to be discarded.** A session-bearing `POST` to `https://console.manifest.internal/v1/projects` from a foreign origin and from none: both `CSRF_ORIGIN_REFUSED`, so Caddy neither strips a foreign `Origin` nor adds one. The stream probe's first run closed all three upgrades with `1006` — including the console's own origin, because `pnpm test` had emptied the tables and the instructor held no project, so that "positive control" was a `404`. After `make demo-identity` recreated the project: foreign and none → `1006` with no frames, the console origin → frames.

*Task 5*

11. **Fastify's own refusals of an unreadable request answered `500 INTERNAL`** — the one code whose summary says *nothing the client sent explains it*. Measured with a scratch test (not committed): a malformed JSON body, an empty one, `text/csv` and a body over 1 MiB each answered `500 {"error":{"code":"INTERNAL",…}}` and wrote an "unhandled error" line naming Fastify's message. Fastify 5.12.3 raises them before any route or hook, as `FST_ERR_CTP_*` with a 4xx `statusCode`, and `setErrorHandler` sent them through `toErrorResponse`, which had no branch for them. `frameworkRefusal` maps 413 → `REQUEST_BODY_TOO_LARGE`, 415 → `REQUEST_MEDIA_TYPE_UNSUPPORTED` and any other `FST_` 4xx → `REQUEST_INVALID` (400), with fixed messages because `FST_ERR_BAD_URL`'s quotes the caller's input. Control (e): the mapping removed → the four answers red. Task 6 carries a *Sitting 3 correction*: `EVERY_MUTATION` gains the two new codes.
12. **The test Step 4 changes does not exist.** No test built against an invalid spec, which is why the build route's `400 SPEC_INVALID` and the spec route's `422` had never been seen to disagree. Written: a manifest naming another project is pushed (`valid: false`), the build is `422 SPEC_INVALID` with `details` equal to the push's recorded errors, and `GET …/spec` answers the same code and status. Control (f), the route back to `BadRequestError` → that test red (`expected 400 to be 422`) and the registry red (`SPEC_INVALID: not registered for BadRequestError`).
13. **Nothing tested the stderr report of an unregistered code**, so deleting it reddened nothing. `cbd4ce5` tests that one is reported once, by code, without the message, and that a registered code is not; control (g).
14. **The literal scan was checked for what it cannot see before it was trusted.** Every wire-class construction whose first argument is not a string literal was listed with a scanner: all are `AI_CODES.*` or `CATALOGUE_CODES.*` (both read as tables by the test), or a fixed-code class — so nothing thrown is invisible to it.
15. **A control harness crashed and left two files broken** — zsh does not word-split an unquoted `$T` (ORIENTATION §4), so `subprocess` was handed one executable named `pnpm exec vitest run …`, raised, and never reached its restore. Both tasks were committed first, so `git checkout` restored exactly and `git status` was clean; the harness now restores in a `finally`. The rule that paid for itself: commit the task BEFORE breaking anything.

**Checked and found fine, so nobody repeats it.** node-saml 5.1.0's `getAuthorizeUrlAsync(relayState)` puts `RelayState` in the signed query when it is non-empty (read from `lib/saml.js`). Caddy passes `Origin` through to the control plane unchanged. The plan's registry draft matched the source's 63 codes exactly. Task 12's stream documentation already names `CSRF_ORIGIN_REFUSED` and close `4403`, which is what was built, and later tasks already use `mutationHeaders` and edit the registry, so neither needs a correction.

**Negative controls watched** — each after its commit, through a harness that asserts its swap matched, runs the named tests, restores with `git checkout` and prints `git status` (clean every time). Task 4: (a) no check in the preHandler → sibling origin `201`, no origin `201`, *before an Idempotency-Key* `400`, sign-out `204`; (b) a missing `Origin` allowed → *NO Origin at all* `201` and the stream's `{ opened: true }`; (c) both reads of the upgrade's origin removed → `{ opened: true }`; (d) the handler's read alone → green, as predicted; (d′) the hook's read alone → `{ opened: true }`; (e) the binding check always passes → the three binding tests (`500`, `302`, `302`); (f) `RETURN_TO` loosened → `//evil.example` kept, in both files; (g) `idp-login.sh` drops `RelayState` → `make demo-identity` step 1 `UNAUTHENTICATED`, exit 2, and the binding refusal on the control plane's stderr; (h) the callback's `csrf: 'exempt'` removed → *does not ask the SAML callback for an origin* `403`; (i) `sameNonce`'s empty guard removed → red; (j) a refusal test that forgets the binding → `SAML_LOGIN_NOT_BOUND` where `SAML_ASSERTION_REJECTED` was expected; (k) the check after the idempotency opt-out → sign-out `204`. Task 5: (a) a new one-line `BadRequestError('PROJECT_SLUG_SHOUTED')` in a route → listed; (b) `ReleaseError(\n 'RELEASE_ZZZ',` → listed; (c) `UNUSED_CODE` registered → listed; (d) `RELEASE_NOT_FOUND` stated 404 → `409 RELEASE_NOT_FOUND, registry says 404`; (e) `frameworkRefusal` not called → the framework test red; (f) the build route back to `400` → two tests red; (g) the stderr report disabled → *reports an unregistered code* red.

**Gates at the end.** `pnpm test` **859 passed, 76 files**, run twice after each task's code landed and again before each commit; `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` and `pnpm format:check` clean; `make doctor` **18/0**; `make verify` **50/0**, after the Docker tier and a control-plane restart; `pnpm test:docker` **168 passed, 27 files, 0 skipped**, 755 s, with the control plane running — the same count as sitting 2, because this sitting changed `identity/saml.docker.test.ts`'s two tests rather than adding any. Twenty-four unit tests more than sitting 2 left: 853 after Task 4, 858 after Task 5, 859 with the report's test.

**Machine.** `./scripts/snapshot-machine.sh` before (18:21) and after (19:05), diffed. Containers, networks and volumes are the same apart from **the proof app's instance, its `-files` volume and the image it runs**, which the demos replaced — one container, one volume and one image, the shape sitting 2 left. **Cleaned up by name after checking each:** **14 image names across 12 images** the Docker tier and the demos built, each absent from the before-snapshot and used by no container — two of them only after `docker image rm` refused with *referenced in multiple repositories* and `RepoDigests` showed the second name (`fixture-rt`/`fixture-s6`, `saml-probe`/`saml-unsigned`; ORIENTATION §4's two-names trap); and **three LiteLLM users and their keys** for proof-app projects this sitting's `pnpm test` runs truncated — sitting 2's, and two the demos recreated — after confirming the one running proof-app instance belongs to the live project (`9425a20b`) and its user still holds its key, leaving that user and `p4b-probe-user`. The refused `edge-csrf-probe` project created nothing (`.manifest/repos` holds only `proof-app.git`). **The proof app serves** (`{"status":"ok","mongo":true}`) with its rows behind it — `make demo-identity` ran last, after the tier and a restart — **the platform SP row's ACS is `https://console.manifest.internal/auth/saml/callback`**, read from `manifest_idp`, the control plane is stopped and port 7100 is free, and the four containers that must survive are there. Free disk is 119 GiB against 121 at the start.

**Documents swept.** The roadmap's four P5a status lines, and its defect-rate table, which gains P5a's three sittings (sittings 1 and 2 had not been added); this plan's sittings table, Task 4's and Task 5's headers, a *Sitting 3 correction* at the top of Task 6, and this entry; ORIENTATION's header, §2 (the numbers box — `pnpm test` 859 in 76 files, the Docker tier re-measured at 168 — the *Plans* and *Code* rows and the immediate-work paragraph), §3 (the document map row and the tree), §4 (three new entries), §7's lead and §7e (what sitting 3 established, what to read before sitting 4, how to execute it, three new surprises, and the state handed over); `README.md` (status, the number, *Where to start*, the documented POST's `origin` and the refusals under *Running the control plane*); `CLAUDE.md`'s *State* and numbers; `RUNBOOK.md` (the event stream's `Origin`; its `make verify` total did not move); `WALKTHROUGH.md` (what is built, the sign-in URL and where it lands, and two new confusions). The four HTML pages and `docs/external-track.md` were checked and need nothing: they state architecture-level status, and neither CSRF by `Origin` nor an error registry is visible to an outsider or moves a UBC item.

### Sitting 4 — Task 6 — 2026-09-16 — 7 findings

**The contract's spine** (`204bf49`). Every `/v1` route is to be declared once, through `defineRoute` (`api/contract/route.ts`), with `zod/v4` schemas that validate the request and shape the answer through a registered representation; `openApiDocument` (`api/contract/document.ts`) reads the same definitions, and **`packages/contract/openapi.json` is generated from them and checked in**, held byte-for-byte by `api/contract/document.test.ts`, which is also its writer (`pnpm contract:write`). `api/contract/schemas.ts` holds the two registries and the envelope; `api/actor.ts` holds `requireActor` (re-exported from `server.ts`); `api/routes/index.ts`'s `ROUTE_DEFINITIONS` is the list every later task appends to; `api/contract/coverage.test.ts` lists the thirteen `/v1` routes still registered the old way. **`GET /v1/me` is the first converted route** — `Me` is `{ id, puid, displayName, email, role }`, the row's name and address beside the SESSION's role — and the old handler in `routes/auth.ts` is deleted. Run on the machine sitting 3 left — macOS 26.6.2 (25G83), Node 24.12.0, Docker Engine 29.7.2, pnpm 11.24.0, zod 3.25.76, Fastify 5.12.3, Caddy v2.11.4, SimpleSAMLphp v2.5.3.1 (no seed).

**The document, read rather than trusted (Step 9).** `openapi` 3.1.0, `info.version` 0.1.0; one path, `/v1/me`; six components — `EmptyRequest`, `ErrorCode` (65 codes), `ErrorEnvelope`, `ManifestError`, `ManifestErrorCode` (23), `Me`; the `200` `$ref`s `Me`, which requires all five fields with `additionalProperties: false`; `getMe`'s `x-manifest-error-codes` are `INTERNAL`, `REQUEST_INVALID`, `UNAUTHENTICATED`; no `$schema` or `$id` left, no `Zz…` test component, no `schemas/undefined`. **Then through the real edge**, with the control plane booted at `https://console.manifest.internal` on the Docker driver and a real CWL sign-in by `idp_login`: no session → `401 UNAUTHENTICATED`; signed in as `instructor` → `200 {"id":"dea42abd-…","puid":"ins000001","displayName":"Test Instructor","email":"instructor@ubc.ca","role":"member"}` — exactly five keys; `?verbose=1` → `400 REQUEST_INVALID` *query: Unrecognized key: "verbose"*; `POST /v1/me` → `404 ROUTE_NOT_FOUND`. **`make demo-identity` then ran green**, its step 1 reading `puid` from the new route.

**Findings.**

1. **The plan's `ref()` could not refuse an unregistered copy of a registered schema — it emitted `"$ref": "#/components/schemas/undefined"` for it, silently.** zod 3.25.76's `registry.get` (`v4/core/registries.js`) inherits a schema's PARENT metadata and deletes only the `id`, and `.describe()` clones with `_zod.parent` set, so `get(copy)` is `{}`, not `undefined`. Measured with `node -e` from `packages/control-plane`: `get(copy) = {}`, `has(copy) = false`, `parent is original: true`; `.optional()` and an unrelated schema do answer `undefined`. The plan's own test *refuses a representation that is not registered* went red on the plan's code (`expected [Function] to throw an error`) — the one place the plan's text disagreed with what its test demanded. `ref()` now requires `registry.get(schema)?.id`, with a docblock saying why. Checked forward: every later task's `success.schema` is a registered name used directly, so none is affected.
2. **The plan's *never the value* assertion was flaky, and would have gone permanently red on an innocent edit.** `answer = { name: 42 }` with `expect(logged).not.toContain('42')` — but the operator's line carries the request URL, a random UUID, and the stack positions (`route.ts:144:19`, `route.ts:153:36`, `task_queues:103:5`), captured by instrumenting the test once. **15.1% of 100,000 random UUIDs contain `42`**, and a change that moves the throw to line 142 fails every run. (The live instructor's id, `dea42abd-…`, is one.) The wrong-typed value is now `{ leaked: 'hunter2-probe-value' }` and the assertion `not.toContain('hunter2')`; control (i) — the error quoting the produced body — turns it red.
3. **Step 11's row (b) predicted two red tests and gets one.** Sending `produced` instead of `shaped.data` turns *strips every field* red (`expected [ 'handle', 'id', 'name' ]`) but not *the wrong shape*, which the plan said would answer 200: the `ResponseContractError` is thrown before the send, so that test stays `500` and green. Recorded so nobody reads the second green as a missing control.
4. **The plan's `/v1/me` handler has a branch nothing tested** — a validly signed session whose user row no longer exists. Sessions are stateless, so the signature outlives the row. A test now signs one for a random id and expects `401 UNAUTHENTICATED`; control (j), the branch removed, answers **`500`** — `toMe(undefined)` throws, which is a client-visible `INTERNAL` and an operator stack for what is an authentication refusal.
5. **`NO_QUERY` is `z.strictObject({})`, so converting a route changes its answer to an unknown query parameter from ignored to `400`.** `GET /v1/me?verbose=1` answered 200 before this task and answers `400 REQUEST_INVALID` naming the key after it. **Decided, not asked:** kept — Decision 4's reason (a mistyped field refused, naming it, so an agent corrects itself) holds for a query as for a body — and pinned by a test so it is intended; control (k), a plain `z.object`, answers 200. **Checked forward, because a demo depends on it:** every query string any script or test sends to a `/v1` route is `?expand=environments` (`scripts/lib/api.sh`'s `environment`, used by every demo, and `projects.test.ts`) or `?tail=` (`delivery.test.ts`), and Task 8's `getProject` and Task 13's `getBuildLog` declare exactly those — so no correction is needed, but **a converted route that forgets a query parameter a script sends fails that script with a `400`, not silently**.
6. **Step 7's `auth.test.ts` change was not forced by anything.** Both `/v1/me` assertions were `toMatchObject`, which new fields cannot fail — and which a leaked column could not fail either. The test user's assertion is now `toEqual` the exact representation, with the id read from the row; the SAML test names `displayName` and `email` from the assertion's `givenName`/`sn` and `mail`.
7. **`pnpm contract:write` empties the control plane's tables.** It runs `document.test.ts` under the `unit` project, whose global setup truncates them for any file (sitting 1, finding 1) — so writing a file has `pnpm test`'s side effect. Said in the test's docblock; **not re-measured**, because doing so would have emptied the proof app's rows this sitting had just restored.

**Checked and found fine, so nobody repeats it.** The thirteen routes in `UNCONVERTED` are exactly the thirteen `app.get`/`app.post` `/v1` registrations in `routes/projects.ts` and `routes/delivery.ts`. The error-code registry's scan picks up `RequestValidationError`'s `readonly code = 'REQUEST_INVALID'` under `api`, where it is registered. `packages/contract/` holds no `package.json`, so `pnpm-workspace.yaml`'s `packages/*` does not make it a workspace until Task 7. `identity/saml.docker.test.ts`, S6 probe 15, `boot.docker.test.ts`, `doctor.sh`, `verify.sh`, `offline-acceptance.sh` and every demo read `/v1/me` by status, envelope or `toMatchObject`/`field puid`, all of which the new representation satisfies — which is why this sitting's rule exempts it from `pnpm test:docker`.

**Negative controls watched** — all twelve after the commit, through a harness that asserts its swap matched once, runs the named tests, restores with `git checkout` in a `finally` and prints `git status` (clean): (a) `locale` added to `Me` without `contract:write` → *is exactly what the route definitions generate*, *stale from line 255*; (b) `produced` sent → *strips every field* (finding 3); (c) the probe a `looseObject` → *strips every field*; (d) `app.get('/v1/zz')` beside `registerRoutes` → coverage `[ 'GET /v1/zz' ]`, `versioning.test.ts` green, as the plan says is right; (e) `'GET /v1/projects'` deleted from `UNCONVERTED` → coverage, first expectation; (f) `'GET /v1/me'` added → the stale-entry expectation; (g) the `@ts-expect-error` removed → `tsc`: `route.test.ts(40,32): error TS2551: Property 'probeID' does not exist on type '{ probeId: string; }'`; (h) `ref()` as the plan wrote it → *refuses a representation that is not registered*; (i) the error quoting the produced body → *never the value*; (j) `getMe`'s missing-user branch removed → `expected 500 to be 401`; (k) `NO_QUERY` a plain `z.object` → `expected 200 to be 400`; (l) `requireActor` after the params are parsed → *answers 401 before it looks at a malformed request* `expected 400 to be 401`.

**Gates at the end.** `pnpm test` **872 passed, 79 files** — thirteen more than sitting 3: eleven in `api/contract/`, two in `auth.test.ts` — run twice before the commit and once more after the control directive landed; `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck` and `pnpm format:check` clean; `make doctor` **18/0** and `make verify` **50/0**, at the start and at the end. `pnpm test:docker` not run — the plan's rule exempts sitting 4 — so it stays at sitting 3's **168**.

**Machine.** `./scripts/snapshot-machine.sh` before (19:09) and after (19:24), diffed. The only differences are **the proof app's instance, its `-files` volume and the image it runs**, which `make demo-identity` replaced — the shape sittings 2 and 3 left — plus a host browser's UDP 443 socket changing owner. `make demo-identity` ran because this sitting's `pnpm test` runs had emptied the proof app's project rows; it serves again at `https://proof-app.staging.manifest.internal` with project `cd4468d1`, a `Route` row and one LiteLLM key behind it. **One thing is NOT left as found: LiteLLM user `mf-9425a20b-036a-4158-8227-6096add8ca73-staging` and its one key** — sitting 3's project, whose rows `pnpm test` truncated and whose container the demo replaced. Deleting it through LiteLLM's admin API, as sitting 3 did, was refused by the session's permission classifier as a secret-store write, and was not worked around; it is Rich's to remove or to allow (ORIENTATION §7e has the command). **The platform SP row's ACS is `https://console.manifest.internal/auth/saml/callback`**, read from `manifest_idp`; the control plane is stopped and port 7100 is free; the four containers that must survive are there. Free disk 119 GiB, as at the start.

**Documents swept.** The roadmap's four P5a status lines and its defect-rate table; this plan's sittings table, Task 6's header and this entry; ORIENTATION's header, §2 (the numbers box — `pnpm test` 872 in 79 files — the *Plans* and *Code* rows and the immediate-work paragraph), §3 (the document map and the tree), §4 (two new entries), §7's lead and §7e; `README.md` (status, the number, *Where to start*); `CLAUDE.md`'s *State* and numbers; `WALKTHROUGH.md` (its status line, and a sentence on the generated document); `RUNBOOK.md` checked — no number or instruction in it moved. The four HTML pages and `docs/external-track.md` were checked and need nothing: a route helper and a generated document change no architecture, status an outsider reads, or UBC item.

### Sitting 5 — Task 7 — 2026-09-16 — 4 findings

**The generated client and its first caller** (`97f6be4`, then `917dd5f`, a fix control (e) found). **`@manifest/contract`** is `openapi.json`, `src/schema.d.ts` generated from it by `openapi-typescript` **7.13.0**, and `createManifestClient` over `openapi-fetch` **0.17.0** (with `openapi-typescript-helpers` 0.1.0), plus `unwrap`, `idempotencyKey` and `ManifestApiError` for the D23.7 envelope, and a README on regenerating, versions and the two headers a non-browser client sends. Both generated files are held by drift tests and the package's version is held to the document's from both sides. **`packages/journey`** is the client's first caller, with an import boundary held by a test and a lint rule; **`make demo-journey`** signs the instructor in through the edge with `idp_login` and runs §22 step 1 — `GET /v1/me` through the client — **green, exit 0**. `pnpm test` runs the `unit` and `packages` projects; **the typecheck gate is `pnpm typecheck`**, `pnpm -r typecheck` over all three packages, and CLAUDE.md, ORIENTATION (§6, §7d, §3 and §4) and WALKTHROUGH say so — README and RUNBOOK never stated it. Run with the network on, on macOS 26.6.2 (25G83), Node 24.12.0, Docker Engine 29.7.2, pnpm 11.24.0, TypeScript 5.9.3, ESLint 9.39.5, Vitest 2.1.9.

**The dependencies, measured (Step 1).** Neither `pnpm --filter @manifest/contract add` printed an *ignored build scripts* error, so **no install script runs and `allowBuilds` is unchanged**. The resolved closure is `openapi-fetch` 0.17.0 → `openapi-typescript-helpers` 0.1.0, and `openapi-typescript` 7.13.0 → `@redocly/openapi-core` 1.34.20, `ansi-colors` 4.1.3, `change-case` 5.4.4, `parse-json` 8.3.0, `supports-color` 10.2.2, `yargs-parser` 21.1.1 and `typescript` 5.9.3 as a peer — **25 packages added to the lockfile, and no existing package removed or re-versioned**, checked by comparing every resolved `name@version` before and after: the lockfile's 22 deleted lines are peer-suffix keys that named `supports-color@7.2.0`. `pnpm audit --prod --filter @manifest/contract`: *No known vulnerabilities found*.

**The types, read (Step 2).** `paths['/v1/me'].get` is `operations['getMe']`, whose `200` is `components['schemas']['Me']` with the five fields, `role` `"admin" | "member"`, and whose `default` is the envelope with the operation's codes in its description; **`ErrorCode` is a union of 65 string literals** and `ManifestErrorCode` of 23, so a `switch` on a code is checked by `tsc`. The CLI's output equals `astToString(openapiTS(…))`'s once the banner is removed, which is what makes the drift test comparable at all.

**Findings.**

1. **`demo-journey.sh` hid why the journey did not build.** The plan's step 0 is `pnpm --filter … build >/dev/null`, and `tsc` writes its errors to STDOUT, so control (e) — the journey reading `me.cwlPuid` — ended at `make: *** [demo-journey] Error 2` after a bare `$ tsc`, naming nothing. Since `917dd5f` the build is captured: silent when it succeeds, and on failure `tsc`'s own `src/main.ts(34,48): error TS2339: Property 'cwlPuid' does not exist on type '{ id: string; puid: string; … }'` followed by *@manifest/journey does not build — tsc's errors are above*. Re-watched both ways.
2. **Step 9's row (e) says `pnpm typecheck` is "the only check that sees it" and that "the journey would fail at run time". Neither holds**: `make demo-journey` compiles the journey with `tsc` before it runs anything, so a call or a field the contract does not have stops the demo at step 0 — which is the property the journey is written in TypeScript for (Decision 37), and with finding 1 fixed it says so.
3. **`pnpm audit --filter @manifest/contract` reports the workspace's own toolchain, not the package — and that toolchain carries a Critical and a High.** Its 7 advisories are `vitest` 2.1.9 (**critical**: an arbitrary file read when the Vitest UI server is listening, patched ≥3.2.6; moderate: a path traversal through `@vitest/mocker`, ≥4.1.11), `vite` 5.4.21 under it (**high**: `server.fs.deny` bypass on Windows alternate paths; two moderates), `@vitest/mocker` 2.1.9 and `esbuild` 0.21.5/0.18.20 (moderate) — every path `.>vitest>…`, none in the new closure, which `--prod` confirms. **Decided, not asked: not upgraded here.** None is reachable as used — no Vitest UI server runs, the host is macOS, and no dev server is served — and Vitest 2 → 3 or 4 is a toolchain change for a sitting that is not about the toolchain. It is the second measurement of ORIENTATION §4's *nothing scans the control plane's own dependency tree*, and is named there.
4. **The plan's `Makefile` snippet is not the house style.** `demo-journey:` with a comment line above it has no `up` prerequisite — every other demo target is `demo-x: up  ## …` — and no `##` help text, so `make help` would not list it. Written as the others are; `make help` lists *P5a's acceptance: §22's journey through the edge, by nothing but the generated client.*

**Checked and found fine, so nobody repeats it.** `pnpm add` labels its summary `.` — the workspace root — while writing to `packages/contract/package.json`; the dependency is where it belongs. `pnpm typecheck` and `pnpm build` both accept the journey importing `@manifest/contract`, whose `types` condition points at `src/index.ts` outside the journey's `rootDir` — no `TS6059`. ESLint 9.39.5 accepts `no-restricted-imports`' `regex` form, and control (c) shows it firing. **Later tasks' mutations pass `Idempotency-Key` as `params: { header: { … } }`**, and nothing in this sitting sends a mutation, so it was measured against a local server with the built client: a `POST /v1/projects/{projectId}/builds` arrived with the passed key, `origin` and `cookie` from the client's defaults, `content-type: application/json` and the body — `openapi-fetch` 0.17.0 merges the two header sources. **Two things left as they are, named:** `packages/contract`'s `build` emits `dist/client.test.js`, as the control plane's does (ignored by git and by both Vitest projects); and `packages/journey/tsconfig.json` excludes its tests, as the plan wrote it, so `boundary.test.ts` is not type-checked by any gate.

**Negative controls watched** — (a)–(g) through a harness that asserts every swap matched once, runs the named commands, restores with `git checkout` in a `finally` and prints `git status` (clean); (h) by hand. (a) `displayName` → `name` in `openapi.json` → *holds exactly the types the checked-in document generates* **and** the control plane's drift test (*stale from line 252*); (b) the package at `0.1.1` → `client.test.ts` and `document.test.ts`'s version tests, `expected '0.1.1' to be '0.1.0'`; (c) `import { users } from '../../control-plane/src/db/index.js'` in `main.ts` → `boundary.test.ts` lists `main.ts: ../../control-plane/src/db/index.js`, and `pnpm lint` reports *import is restricted from being used by a pattern*; (d) as (c) with the lint block's `files` pointed at nothing → the boundary test still red, and lint reports only the unused import; (e) `me.cwlPuid` → `pnpm typecheck` `TS2339` — and `make demo-journey` exit 2 (findings 1, 2); (f) the client's `origin` dropped → *sends the session and the origin* red, and `make demo-journey` **still green**, as the plan predicted: a GET is not asked for an Origin; (g) the journey run without `NODE_EXTRA_CA_CERTS` → `FAIL no step threw — [cause UNABLE_TO_GET_ISSUER_CERT_LOCALLY] TypeError: fetch failed`, exit 2; **(h), added: `locale` added to `Me` and returned by `toMe`, the control plane restarted on it** → `ok GET /v1/me is the instructor`, then `FAIL and carries exactly the fields the contract names — id,puid,displayName,email,locale,role`, `1 FAILED`, exit non-zero — the journey's shape check sees the running system, not the types. Restored, restarted, and green again.

**Gates at the end.** `pnpm test` **877 passed, 81 files** — five more than sitting 4, in two new files: `client.test.ts`'s three and `boundary.test.ts`'s one in the `packages` project, and the version test in `document.test.ts` — run twice before the commit; `pnpm lint`, **`pnpm typecheck`** (three packages) and `pnpm format:check` clean; `make doctor` **18/0** and `make verify` **50/0** at the start and at the end; `make demo-journey` green. `pnpm test:docker` not run — the plan exempts sitting 5 — so it stays at sitting 3's **168**.

**Machine.** `./scripts/snapshot-machine.sh` before (19:32) and after (19:43), diffed: uptimes and `HEAD` only. `node_modules` gained the 25 packages above, through pnpm's store. The control plane is stopped and port 7100 is free; the four containers that must survive are there. **The proof app still serves** at its hostname — its container and edge route were not touched — **but with no project rows behind it**: this sitting's `pnpm test` runs truncated them, and **`make demo-identity` was deliberately not re-run** to restore them, because doing so orphans the current LiteLLM user (`mf-cd4468d1-5f71-4761-a863-6c7b53cbaf38-staging`, whose key the running container still uses) and this session is not permitted to remove one (sitting 4's *Machine*). So LiteLLM holds that user, sitting 3's orphan `mf-9425a20b-036a-4158-8227-6096add8ca73-staging` with its key, and `p4b-probe-user`. The next demo recreates the project from nothing.

**Documents swept.** The roadmap's four P5a status lines and its defect-rate table; this plan's sittings table, Task 7's header and this entry; ORIENTATION's header, §2 (the numbers box — `pnpm test` 877 in 81 files, the `packages` project, `pnpm typecheck` — the *Plans* and *Code* rows and the immediate-work paragraph), §3 (the document map and the tree), §4 (the gate, and two new entries), §6's gate list, §7d's first ten minutes, §7's lead and §7e; `README.md`; `CLAUDE.md`'s *State*, numbers and gate list; `WALKTHROUGH.md` (its status line, its gates row, and `make demo-journey` in its commands and its table); `RUNBOOK.md` (a `make demo-journey` section — it never named the typecheck gate, and no number in it moved); `README.md`'s *Where to start* gains `make demo-journey`. The four HTML pages and `docs/external-track.md` were checked and need nothing.

### Sitting 6 — Tasks 8 and 9 — 2026-09-16 — 13 findings

**Projects as representations, then §23's slug check.** Task 8 (`ba1dda5`): eight `/v1` routes declared through `defineRoute` in `api/routes/project-reads.ts` answer `Project`, `Environment`, `Instance`, `Member`, `Spec` and `SpecValidation` — `quota`, `visibility`, `published`, `forkedFrom`, `ownerId` and an instance's `driver` and `handle` no longer leave — with the two reads that did not exist, `GET /v1/projects/{projectId}/environments` and `…/members`; `GET /v1/projects` is the caller's memberships for administrators too; `servingInstanceOf` moved into `projects/`. Task 9 (`0246d3c`): `infra/reserved-labels/` loaded at boot (755 labels, six groups, a malformed list refuses the boot), `checkSlug` behind `GET /v1/slugs/{slug}` and project creation, 60 checks a minute per person, and `edge-names.test.ts`. Two defects found on the way were fixed in commits of their own: `4a1d8cd` (D9's sensitive diff) and `b043d9d` (the router's refusals). Run on the machine sitting 5 left — macOS 26.6.2 (25G83), Node 24.12.0, Docker Engine 29.7.2, pnpm 11.24.0, zod 3.25.76, Fastify 5.12.3, Caddy v2.11.4, SimpleSAMLphp v2.5.3.1 (no seed); Ollama with `ministral-3` and `nomic-embed-text`.

**Read through the real edge, not only the harness.** After a real CWL sign-in: `GET /v1/projects` → `[{id, slug, blueprint, owner: {id, displayName: "Test Instructor"}, audience: null, createdAt}]` — six keys; the staging environment's `instance` was `58ddd7cd`, the instance its Route serves, **not** the newer failed deploy `make demo-redeploy` had just made; `…/members` → the owner with five keys. `GET /v1/slugs/chem` → `SLUG_RESERVED`, *"'chem' is reserved — UBC Okanagan course subject code CHEM (Chemistry); UBC Vancouver course subject code CHEM (Chemistry)."*, and `POST /v1/projects {slug: chem}` → `409` with the same code, message and hint. The boot line reads `"reservedLabels":755`. **`make demo-redeploy` was green on Task 8's build** — every assertion `ok`, including `GET /v1/environments/{id}`'s `instance.id` it reads — and **`make demo-journey` green through step 2a**, its shape check run against a list holding a project.

**Findings.**

*Task 8*

1. **The authorization contract suite asserted a refusal's status and not its code, so a stranger's `404` was satisfied by a route that did not exist.** Step 2 predicted both new rows would *"fail for every actor"*; they failed for 8 of 10 — `GET …/environments as stranger → 404` and `…/members as stranger → 404` passed against `404 ROUTE_NOT_FOUND` before either route was written. `REFUSAL_CODE` now pairs each expected status with its code (`401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `400 REQUEST_INVALID`, `426 EVENTS_UPGRADE_REQUIRED`), and every existing row passed it unchanged. Controls (e) and (e′).
2. **`isSensitiveDiff` (D9) called every re-validation of a manifest declaring a service a sensitive change** (`4a1d8cd`). zod parses a service in schema order, `{type, version, name}`; the route's *previous* spec comes back from jsonb as `{name, type, version}`; `sameObjectSet` compared `JSON.stringify`s. Measured: three `app_specs` rows with identical `parsed->'services'`, and `make demo-redeploy`'s log says `{"sensitive":true,"fields":["services"]}` for an unchanged manifest — as every `p4c-baseline` results file does since 2026-09-15. P6's approval gate would have escalated every redeploy of every app with a database. The serialisation now ignores object key order at every depth, and the new route test goes through jsonb, where the shape changes (the unit test alone builds both values in one order). Control (g).
3. **`?expand=environments,releases` is now `400 REQUEST_INVALID`.** The old handler split on commas and ignored names it did not know. **Decided, not asked:** kept — §22 asks only for "an explicit `?expand=`", Decision 4 refuses what a route does not declare, and every caller (`scripts/lib/api.sh`, the tests) sends exactly `environments`.
4. **The journey's *no project carries a database-only field* passes on an empty list** — `pnpm test` empties the tables, so its first green run proved nothing. Control (f) created a project and added `quota` to the running control plane's `Project`: `FAIL no project carries a database-only field — quota`. Restored, and green again against that project. Task 17's journey creates `journey-app` first, so this stops being possible there.
5. **A mutation declared through `defineRoute` checks its capability INSIDE the idempotent replay** — `registerRoutes` wraps the whole handler in `app.idempotent` — so a person replaying their own key after losing the role gets the response they were given, where the old `addMember` and `validateSpec` handlers checked first. The response is only what that person already received, and authentication still runs first. **Named, not fixed** — it is Task 6's shape, and P5b should decide whether a revoked token's replay may answer.
6. **`Instance`'s states, kinds, an environment's kind and a member's role come from the database enums** (`instanceState.enumValues` and the rest), not the plan's literal list. **Decided, not asked:** a state a migration adds is then a state the contract names, and the drift test says so.

*Task 9*

7. **A length bound contradicted §23's "a `200` either way".** The plan's `z.string().min(1).max(64)` on the check's param made an 80-character name `400 REQUEST_INVALID` at the check, and the old body's copy made it `400 PROJECT_INVALID_INPUT` at creation — two codes, neither `SLUG_INVALID`. Both bounds removed; the agreement test sends `'a'.repeat(80)`. Control (h). Task 11 carries a *Sitting 6 correction*.
8. **Fastify's router sends two refusals itself, outside the envelope** (`b043d9d`). Measured with a scratch test: `GET /v1/slugs/<101 characters>` → `414 {"error":"Bad Request","code":"FST_ERR_MAX_PARAM_LENGTH","message":"'/v1/slugs/aaaa…' is exceeding the max param length"}`, and `GET /v1/projects/%E0%A4%A` → `400 {"error":"Bad Request","code":"FST_ERR_BAD_URL",…}`. Neither reaches `setErrorHandler` unless the server passes `frameworkErrors`, so **sitting 3's mapping of `FST_ERR_BAD_URL` had never been reachable**. Both now answer `400 REQUEST_INVALID`. Through the edge the long name does; the malformed percent-encoding never reaches the control plane — Caddy's HTTP/2 answers `PROTOCOL_ERROR` (curl `92`). Control (i). **A slug check longer than 100 characters is therefore `400`, not a `200` verdict** — Fastify's `maxParamLength`; no slug is longer than 39 — named, not changed.
9. **`ProjectError` had no thrower once both its codes were deleted**, and the plan said to keep the class. **Decided, not asked:** deleted — the class, its `mapError` branch, its registry family and its test constructor — because a mapped error class nothing throws is a module with no caller. Re-adding it is one class.
10. **The plan's `src/index.ts` imported `createRateLimiter` from `./api/rate-limit.js`**, a deep path from a root file into `api/`, which `module-boundaries.test.ts` refuses; it comes from `./api/index.js`. Found by reading the rule before running it. Tests share one real list through **`projects/testing.ts`'s `testReservedLabels()`**, so a reserved test slug fails where it is written.
11. **`projects/repository.test.ts`'s *rejects a slug §7 would not accept* matched `/slug/i` in the message**, not in the task's file list; the check's sentence is *"'Chem-Labs' cannot be a project name"*. It asserts `SLUG_INVALID`, and a new test asserts a reserved label is refused before any row is written — control (k), the check moved after the insert, turns it red.
12. **Control (d) went red as `TypeError: Cannot read properties of undefined (reading 'code')`** — the limit test read `error.code` off a `200`. It reads `error?.code` (in `b043d9d`), so a limit that never fires names the status.
13. **`PROJECT_INVALID_INPUT`'s hint described the slug rule the body no longer checks.** The code stays — `POST /v1/projects` is unconverted until Task 11, which deletes it — and its hint names `GET /v1/slugs/{slug}`.

**Checked and found fine, so nobody repeats it.** `make demo-redeploy`'s first step printed *reusing project*: `.manifest/repos/proof-app.git` outlived the rows `pnpm test` truncated, so creation inserted the project and failed pushing the seed commit, storing no idempotency record — P4b finding 178's creation-order gap, which Task 11's Decision 29 closes; not new. `servingInstanceOf`'s fallback orders `last_seen_at DESC`, NULLs first, exactly as the route did — it serves only an environment with no Route record. Task 16's fleet row throws `FORBIDDEN`, which the suite's new code check accepts. `scripts/lib/api.sh` sourced into **zsh** loses `PATH` (`local path=` — ORIENTATION §4); run it under `bash`. The four Docker-tier files changed only `createProject`'s arguments, so the tier's count is unchanged.

**Negative controls watched** — each after its commit, through a harness that asserts each swap matched once, runs the named tests, restores with `git checkout` in a `finally` and prints `git status` (clean every time). Task 8: (a) `quota` in `Project` and `toProject` → *exactly the representation's fields* and the drift test (*stale from line 998*); (b) the admin branch back in `listProjectsFor` → both admin tests; (c) `listMembers` without `assertCapability` → *members as stranger → 404* `{ status: 200, code: undefined }`; (d) `servingInstanceOf` newest-first → *reports the instance that SERVES*; (e) the members route moved to `/memberz` → *stranger → 404* red; (e′) the same with the suite's old status-only assertion → *stranger* **green** — finding 1, reproduced; (f) `quota` on the running control plane → the journey's `FAIL … — quota`; (g) `stable` back to `JSON.stringify` → the two sensitive-diff tests. Task 9: (a) `checkSlug` without `reserved.lookup` → three unit tests, and on the running control plane the journey's *console is reserved* and *chem says it is Chemistry*; (b) `createProject` without `assertSlugAvailable` → four tests, creation `{ status: 201 }` for `console`; (c) `idp` → `idp-x` in `labels.yaml` → `edge-names.test.ts` lists `idp`, and the loader test; (d) the harness limit 1 000 000 → the limit test (finding 12); (e) no duplicate check → *refuses a label in two places*; (f) boot with an empty `MANIFEST_RESERVED_LABELS_DIR` → `ReservedLabelsError: no .yaml file in …/empty-labels` with `code: 'RESERVED_LABELS_MISSING'`, before the driver touches Docker; (h) the check's param bounded at 64 → `expected 400 to be 200`; (i) `frameworkErrors` removed → the router test red; (k) the slug checked after the insert → *before anything is written*.

**Gates at the end.** `pnpm test` **918 passed, 85 files** — forty-one more than sitting 5: 891 after Task 8, 893 with `4a1d8cd`, 917 after Task 9, 918 with `b043d9d` — each run twice before its commit; `pnpm lint`, `pnpm typecheck` (three packages) and `pnpm format:check` clean; `make doctor` **18/0** and `make verify` **50/0** at the start and at the end; `pnpm test:docker` **168 passed, 27 files, 0 skipped**, 755 s, with the control plane running (S6 probe 15 `app=403 host=401`) — no Docker test added; `make demo-redeploy`, `make demo-journey` and `make demo-identity` green.

**Machine.** `./scripts/snapshot-machine.sh` before (19:57) and after (20:48), diffed. The differences are **the proof app's instance, its `-files` volume and the image it runs**, replaced by the demos — the shape every sitting since 2 has left — the edge's uptime (the Docker tier restarts it), and a host browser's UDP 443 socket. **Cleaned up by name after checking each:** 14 image names across 12 images the Docker tier and the demos built, each absent from the before-snapshot under every name and used by no container (`fixture-rt`/`fixture-s6` and `saml-probe`/`saml-unsigned` removed by both names); and `.manifest/repos/control-probe.git`, control (f)'s project, whose only commit was the seed. **The proof app serves** (`{"status":"ok","mongo":true}`) with its rows behind it (project `ed4a233f`): the Docker tier's edge restart had dropped its route and `pnpm test` its rows, so `make demo-identity` ran last. **That leaves three LiteLLM users with no project, one key each, for Rich** — `mf-9425a20b-036a-4158-8227-6096add8ca73-staging` (sitting 3's), `mf-cd4468d1-5f71-4761-a863-6c7b53cbaf38-staging` (sitting 4's, replaced by this sitting's `make demo-redeploy`) and `mf-0ffdf5ba-8ed1-4b52-af62-40f79063d49e-staging` (this sitting's, replaced by `make demo-identity`) — read with `/user/info`, not deleted (ORIENTATION §7e has the command). **Rich removed all three the same day, after the sweep; verified: `/user/info` answers `404` for each, `/key/list` holds one key — the running proof app's — and LiteLLM holds `default_user_id`, `p4b-probe-user` and `mf-ed4a233f-…-staging`.** The platform SP row's ACS is the console's, put back by the last boot; the control plane is stopped and port 7100 is free; the four containers that must survive are as they were (`docker-simple-saml-saml-idp-1` exited 12 days ago, before and after). Free disk 117 GiB against 119.

**Documents swept.** The roadmap's four P5a status lines and its defect-rate table; this plan's sittings table, Task 8's and Task 9's headers, a *Sitting 6 correction* at the top of Task 11, and this entry; ORIENTATION's header, §2 (the numbers box — `pnpm test` 918 in 85 files, the Docker tier re-measured at 168 — the *Plans* and *Code* rows and the immediate-work paragraph), §3 (the document map and the tree), §4 (three new entries), §7's lead and §7e; `README.md` (status, the number, *Where to start*); `RUNBOOK.md` and `WALKTHROUGH.md` (status lines and the two new reads). `CLAUDE.md` names no sitting and was left alone. The four HTML pages and `docs/external-track.md` were checked and need nothing: public representations and a slug check change no architecture, status an outsider reads, or UBC item.
