# P4a — Identity, Secrets and the Injection Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A faculty member's application logs a real person in with CWL — against the Manifest IdP, through an SP the control plane registered by itself, with a per-app keypair, with attribute release actually enforced — and writes a note to its own Mongo. Driven by `curl`, offline, from a bare git repository.

**Architecture:** Four seams, in dependency order. **The IdP becomes an IdP** (`infra/idp/`, `infra/lib/`) — it currently cannot issue an assertion at all. **`secrets/`** replaces P3's HMAC derivation with libsodium envelope encryption in Postgres. **`sso/`** derives a Service Provider registration from an `AppSpec` and writes one row into SimpleSAMLphp's SQL metadata store, per S2. **`spec/injection.ts`** turns §8's frozen table into one function, called from `deployRelease`, asserted against the blueprint by a drift test. On top of those sits `node-ts-mongo@1` — the first blueprint faculty will actually use — and the proof app that exercises it.

**Tech Stack:** TypeScript on Node 24, Fastify 5, Drizzle over Postgres 16, Vitest, `libsodium-wrappers` 0.8.4, SimpleSAMLphp 2.4.x on `php:8.3-apache`, `passport-ubcshib` 0.1.6 on `passport-saml` 3.x, Express 4 + `express-session` in the blueprint skeleton, and the same custom Caddy 2.11.4 edge P1 built.

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§9** (identity) and **§8** (the injection contract) in full, plus §6 (the `Secret`, `Event` and `IamRegistration` rows), §12 (*Secrets*), §14 (redaction at capture), §16 (the injection-contract drift, identity-path regression and security-regression tiers), §20 (key management, audit integrity, the blueprint as a security multiplier) and §25 (blueprints).

**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — P4's scope, and gaps 2, 3 and 6.

**Predecessor:** [`2026-08-31-p3-docker-driver-deploy-spine.md`](./2026-08-31-p3-docker-driver-deploy-spine.md). Read **Sessions 4 and 5** of its *What executing this plan found* before starting. They are the most useful pages in this repository and this plan is shaped by them.

---

## How this plan is being executed — SEVEN SITTINGS, one per session

**Tasks 1–7 are DONE (Tasks 6–7 on 2026-09-09). Sitting 3 — Tasks 8 and 9 — is next.**

Agreed with Rich on 2026-09-08: the remaining tasks run one sitting per session, with
a check-in at each boundary, so a session limit can never land in the middle of a task.
This plan commits after every task, so a stop *between* tasks is recoverable; a stop
*inside* one is not. **"Sitting", not "phase"** — this project uses *Phase 1/2/4+* for
the §17 product roadmap, and confusing the two sends a reader to the wrong document.

| Sitting | Tasks | Status |
|---|---|---|
| 1 | 4–5 — `secrets/` and its first call site | ✅ done 2026-09-08, 8 defects |
| 2 | 6–7 — per-app SP keypairs, then `sso/` and the one row | ✅ done 2026-09-09, 9 defects |
| **3** | **8–9 — events and the registration call site** | ← **next** |
| 4 | 10–11 — §8's injection contract and its call site | |
| 5 | 12–13 — `node-ts-mongo@1` and the drift test (**needs the network**) | |
| 6 | 14 — Manifest's own login, and the end of the dev shim | alone: it reddens most of the API suite |
| 7 | 15 — the proof app and P4a's acceptance | alone: the first end-to-end run |

**Every sitting ends the same way:** the four gates from *Global Constraints*,
`pnpm test:docker` where the phase touched `infra/`, `runtime/`, `services/`, `sso/`
or `secrets/`, a dated entry in *What executing this plan found* below, and the
close-out sweep in ORIENTATION §6. **Read the most recent session entry before
starting** — Tasks 4–15's text was written before Tasks 1–5 ran, and several of its
assumptions have since been corrected there rather than in the task text.

---

## Findings this plan is built from

P4a has no research left in it. Every value below was measured, and the measurements are dated. Read these before starting, not while stuck.

| Source | What it settles for P4a |
|---|---|
| [`S2-findings.md`](../spikes/S2-findings.md) | The whole of `sso/`. One `INSERT` into `saml20_sp_remote` registers a working SP on the next request — no reload, no restart, no cache TTL. `entity_data` is the JSON encoding of the PHP array, in a `TEXT` column with a `VARCHAR(255)` primary key. Attribute release **fails open** without `core:AttributeLimit`, and fails open again on an empty list. `certData` carries the per-app certificate. `attributes.NameFormat` and a per-SP `authproc` set OID naming from the row. **Tasks 1, 2, 3, 7.** |
| [`S3-findings.md`](../spikes/S3-findings.md) | Not P4a's — its AI half is **P4b's**. One thing lands here: the `user` namespacing rule shapes the `ubcEduCwlPuid` hash P4a's blueprint computes. |
| [`S7-findings.md`](../spikes/S7-findings.md) | The edge, the zone, and trust in three places — including that **host Node processes ignore the macOS keychain**, which is why `.env` carries `NODE_EXTRA_CA_CERTS`. **Task 1's edge route.** |
| **Measured 2026-09-07, for this plan** | The section below. Six facts nobody had measured, four of them live defects. |

### What was measured for this plan, on 2026-09-07

Every one of these was probed against the running platform before a task was written, because the house rule is that **no step may stand in for a spike result**. The platform was `make up` at the time; the machine was left exactly as found.

**1. The Manifest IdP cannot issue an assertion.** `make verify` is 34/0 and this is still true.

```
$ docker exec manifest-idp ls /var/simplesamlphp/metadata/
saml20-idp-hosted.php.dist   saml20-idp-remote.php.dist   saml20-sp-remote.php.dist

$ docker exec manifest-idp ls -la /var/simplesamlphp/cert/
total 12      (empty)

$ curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7122/module.php/saml/idp/metadata
500
   SimpleSAML\Error\Error: METADATA
   Caused by: Exception: Could not find any default metadata entities in set
   [saml20-idp-hosted] for host [127.0.0.1 : 127.0.0.1:7122/]
```

There is no hosted IdP entity and no signing keypair. `verify.sh` checks that the IdP serves a page, that `pdo_pgsql` is present, and that a row round-trips through `MetaDataStorageHandlerPdo` — none of which touches the ability to sign an assertion. **Task 1.**

**2. `core:AttributeLimit` is not configured**, so attribute release fails open. `infra/idp/config/config.php` has no `authproc.idp` key at all. S2 measured the consequence: a row listing three attributes released **all thirteen** the auth source produced. **Task 2.**

**3. The `ubcEduCwlPuid` OID is wrong, and nothing could have noticed.** `infra/idp/config/authsources.php` releases `urn:oid:1.3.6.1.4.1.60.1.1.1`. `passport-ubcshib`'s own map says otherwise:

```
$ grep -n '60\.' /Users/rich/Developer/passport-ubcshib/lib/attributes.js
10:  'urn:oid:1.3.6.1.4.1.60.6.1.6': 'ubcEduCwlPuid',             // OID format
```

S2 and `ATTRIBUTE_MAPPINGS` agree on `…60.6.1.6`. No app built on this IdP could read its own user identifier. `mapAttributes` falls back to the *friendly* name when the OID key is absent — but the IdP sends neither the right OID nor the friendly name, so the value is simply missing and the strategy throws `Missing ubcEduCwlPuid attribute`. **Task 2.**

**4. `MONGODB_DB_NAME` is never injected.** This is Session 5's shape, still live:

```
$ grep -rn 'MONGODB_DB_NAME' packages/control-plane/src fixtures/
src/runtime/docker/roundtrip.docker.test.ts:99:      MONGODB_DB_NAME: 'app',
src/runtime/docker/s6.docker.test.ts:136:        env: { …, MONGODB_DB_NAME: 'app' },
fixtures/fixture-app/server.js:30:const db = () => client.db(process.env.MONGODB_DB_NAME ?? 'app')
```

Two tests construct it; `deployRelease` injects only `SERVICE_CATALOGUE.mongo.envVar` (`MONGODB_URI`), so the running app silently falls back to a database called `app` rather than the one its credentials were derived for. §8 requires both variables. **Task 11 fixes it and Task 12's drift test is what stops it coming back.**

**5. The IdP is reachable through the edge, and its hostname already resolves.** Measured, so Task 1's design is not a guess:

```
$ docker exec manifest-caddy sh -c 'wget -q -S -O /dev/null http://manifest-idp:80/ 2>&1 | head -1'
  HTTP/1.1 303 See Other
$ dig +short idp.manifest.internal            →  127.0.0.2
$ curl -s --resolve idp.manifest.internal:443:127.0.0.2 https://idp.manifest.internal/
manifest OK host=idp.manifest.internal scheme=https remote=10.89.0.1   (the wildcard fallback)
```

**6. `libsodium-wrappers` installs clean under pnpm 11.** This mattered enough to check: pnpm 11 makes an un-named dependency build script a **hard error** (ORIENTATION §4), and a native crypto binding would have one.

```
$ npm view libsodium-wrappers scripts          → lint/format only; no install, no postinstall
$ node -e "…crypto_box_seal / crypto_box_seal_open…"
0.8.4 sealed box: hello
secretbox_easy: function | SODIUM_LIBRARY_VERSION: 26.4
```

**And the SimpleSAMLphp 2.x endpoint paths, read off the running container** rather than inferred from 1.x documentation — `passport-ubcshib`'s `UBC_CONFIG.LOCAL` hardcodes the **1.x** paths (`/simplesaml/saml2/idp/SSOService.php`), which is exactly why §8 makes `SAML_ENTRY_POINT` mandatory:

```
$ docker exec manifest-idp cat /var/simplesamlphp/modules/saml/routing/routes/routes.yml
websso-single-sign-on:   path: /idp/singleSignOnService
websso-single-logout:    path: /idp/singleLogout
websso-metadata:         path: /idp/metadata
```

Module routes are served under `/module.php/saml`, so the three URLs this plan uses are `/module.php/saml/idp/singleSignOnService`, `/module.php/saml/idp/singleLogout` and `/module.php/saml/idp/metadata`.

### Two facts measured for P4b, recorded here so P4b does not re-derive them

**`ubc-genai-toolkit-llm@0.7.0` reproduces all three of S3's findings**, so the blueprint pins the current version rather than the one S3 happened to test (0.4.0). Same dependency set, same `embed` signature, same `...providerOptions` spread. Measured against the running LiteLLM, which is the digest S3 used (`sha256:20b5044b…`): `embed()` returns **dim 192, first three `[0,0,0]`** by default and **768** with `encoding_format: 'float'`, matching S3's values to six places; a streamed completion through `default-chat` yields 5 content frames; a key with `allowed_routes` is **403** on `/key/generate`, `/model/info` and `/spend/logs` while **200** on `/v1/models`; and an unconfined key mints a child that answers **200 after its parent is revoked and answers 401**.

**The toolkit cannot be forced through §12's egress proxy, and P4b must not try.** Measured by pointing `http_proxy` at a black hole and seeing whether the request still succeeded:

| Mechanism | Result |
|---|---|
| `http_proxy` alone | **ignored** — global `fetch` reached LiteLLM, 200 |
| `undici` `setGlobalDispatcher(new ProxyAgent(…))` | fixes global `fetch` (`UND_ERR_CONNECT_TIMEOUT`) — **the OpenAI SDK still went direct**, 401 |
| `http.globalAgent = new HttpProxyAgent(…)` | **also bypassed**, 401 |

The mechanism: the OpenAI SDK v4 bundles `node-fetch` and supplies its own `agentkeepalive` agent, so no environment-level proxy reaches it. Its only supported override is the `httpAgent` constructor option, and the toolkit does `new OpenAI({ apiKey, baseURL })` with no way to pass one — and **C6 forbids a toolkit change being a prerequisite**. So an app on an `--internal` network cannot reach LiteLLM through the proxy at all. P4b's answer is to add `manifest-litellm` to `PLATFORM_NEIGHBOURS` in `runtime/docker/networks.ts` and inject `LLM_ENDPOINT=http://manifest-litellm:4000/v1`; §12 already states this control is per-key `allowed_routes` and "**Not a port rule**", so no spec change is implied. The proxy path itself is sound for anything that honours it — `manifest-litellm:4000` answers **200** through `manifest-egress` and `postgres:5432` answers **403**.

---

## Decisions this plan makes, and why

Thirteen questions were open when this plan was written. Each is settled here, because a plan that defers one is a plan that cannot be executed.

**1. P4 is two plans, and only P4a is written.** *Rich's call, 2026-09-07.* P4a is identity, secrets, the §8 contract, the blueprint's auth half and the proof app's login. **P4b** is the LiteLLM client, the classification-gated catalogue, key lifecycle, the blueprint's AI wiring, event streaming, incidents and heuristic redaction. Each produces working, testable software on its own, which is what the writing-plans scope check asks for. **P4b was subsequently written on 2026-09-07 too, at Rich's request** — [`2026-09-07-p4b-ai-events-streaming-incidents.md`](./2026-09-07-p4b-ai-events-streaming-incidents.md), 16 tasks, also unrun. **That changes nothing about executing P4a, but you should know two things.** First, P4b's Task 1 is a reconciliation pass against *this* plan as you actually execute it — so **when you change a seam here you are not obliged to chase it into P4b**; that pass exists to catch it. Record what you changed in *What executing this plan found*, which is where it looks. Second, three ambiguities in this plan were found while writing P4b and have been **fixed here**: Task 10's `InjectionContext` is now fully typed, Task 11 shows where `parsedSpec` comes from, and Task 8 states where its redactor comes from. Do not be surprised to find those three more specific than their neighbours.

**2. P4a finishes the IdP, and that is infrastructure work.** P1's decision 2 said *"P1 ships the containers; P4 writes the clients"*. That does not survive contact: the container P1 shipped cannot issue an assertion (finding 1). Tasks 1 and 2 are P1-shaped work — Compose, shell, a Caddyfile block — inside a TypeScript plan. The alternative, a P1 amendment, was rejected: P1 is executed and closed, and splitting one deliverable across two plans is how a seam gets forgotten.

**3. The IdP's entityID is configuration, never derived from the request host.** `https://idp.manifest.internal/idp/shibboleth`, which mirrors UBC's own shape (`https://authentication.ubc.ca/idp/shibboleth`) so the production cutover is a value change rather than a code change. S2 recorded the trap: the shipped `saml20-idp-hosted.php` keys its entry on `'host'` and hard-codes a port into the entityID, so running on 7122 issued assertions from `http://localhost:6122/...`. We use `'host' => '__DEFAULT__'` with an explicit entityID and never let the port near it. An SP that pins `idp.entityID` then keeps working when the port moves.

**4. The IdP is served through the edge at `idp.manifest.internal`.** Measured in finding 5: Caddy already reaches `manifest-idp:80`, and the name already resolves — to `127.0.0.2` on the host and to Caddy's platform address inside a container. SAML is browser-mediated, so the IdP needs **one URL that is the same everywhere**, over a certificate the browser and `curl` both trust. Rejected: `http://127.0.0.1:7122`, which no container can reach and which would make `SAML_ENTRY_POINT` environment-specific in a way production is not; C1's whole bar is a name that resolves identically from host and container. The published 7122 port stays, for `docker exec`-free debugging.

**5. `ubcEduCwlPuid` is `urn:oid:1.3.6.1.4.1.60.6.1.6`, and OID naming is used everywhere.** S2 confirmed real UBC Shibboleth sends OID (`tlef-biocbot` authenticates in production with no bridge and the OID is its only reachable key). Using OID in sandbox and staging means those environments exercise production's attribute vocabulary. MACE is deliberately **not** used: `passport-ubcshib`'s reverse map makes its MACE entry for this attribute unreachable, and choosing OID sidesteps the library bug without patching it — which C6 requires, since a library change may never be a prerequisite.

**6. `core:AttributeLimit` runs at priority 50 and `core:AttributeMap` at 60, in that order.** S2 measured why the order is load-bearing: the limit matches the *friendly* vocabulary `auth.attributes` uses, and the map converts to OIDs afterwards. Reverse them and the limit matches nothing and releases everything. Registration additionally **refuses** an empty or missing `attributes` list before writing, and a database `CHECK` makes the half-written row impossible — two independent reads of one rule, which is the shape the roadmap's lesson asks for.

**7. Envelope encryption uses `libsodium-wrappers@0.8.4`.** §12 names libsodium; finding 6 confirms the WASM build installs with no build script under pnpm 11. Per-secret data key, payload sealed with `crypto_secretbox_easy`, data key wrapped with `crypto_box_seal` against the master **public** key — so wrapping needs only the public half, and master-key rotation re-wraps data keys without touching ciphertext, which is exactly the property §20 says makes rotation cheap enough to happen. Rejected: `sodium-native` (native build, install script, pnpm 11 hard error) and hand-rolled AES-256-GCM over `node:crypto` (it would work; owning a bespoke envelope format is the wrong thing to own, and the spec names libsodium).

**8. Service credentials migrate from derivation to storage without breaking a running service.** P3's `services/credentials.ts` derives every backing-service password by HMAC from `MANIFEST_MASTER_SECRET`, and `config.ts` already warns at boot that a regenerated secret makes every existing database reject the process — *"the failure reads as a Mongo fault"*. So `ensureService` after P4a does this: **if a stored secret exists, use it; if not, derive the P3 value, store it, and use that.** New services generate a random secret and store it. A developer's existing containers keep working, and the derivation is dead within one deploy. Deleting `deriveCredentials` outright was rejected for exactly the failure `config.ts` describes.

**9. The dev shim's HTTP route dies; the test suite mints sessions directly.** **Measured 2026-09-07: 19 references to `POST /auth/dev-login` across 8 files** — `api/auth.test.ts` 6, `api/projects.test.ts` 4, `api/authz-contract.ts` 3, `api/delivery.test.ts` 2, and one each in `lifecycle.test.ts`, `api/server.ts`, `api/routes/auth.ts` and `scripts/demo.sh`. (An earlier draft of this plan said "28"; that was an estimate and this is a count. Re-run the `grep` in Task 14 Step 1 before starting — it is the list you actually work through.) The authentication bypass is the *route*, not a test's ability to construct a session — and `issueSession`/`signSession` are already exported from `identity/session.ts` and need no HTTP surface. So `identity/dev-auth.ts`, the route, `MANIFEST_DEV_AUTH` and its two safeguards all go, and `identity/testing.ts` gains `testSessionCookie(user, secret)`. `scripts/demo.sh` moves to the real SAML flow, which is P4a's acceptance anyway.

**10. Events land in P4a, minimally.** §9 requires *"every registration and change is an append-only audit Event, with alerting specifically on ACS URL changes"*, so P4a cannot ship `sso/` without them. It ships the `events` table, §20's append-only **grant** (not convention), and exactly two call sites. **P4b** ships `WS /projects/:id/events`, incidents, and the faculty-legible message catalogue. This keeps every task's output consumed — an events table with no writer would be the third instance of the defect this project has now hit three times.

**11. Redaction at capture lands in P4a — the exact-match half only.** The plan that creates secrets owns not leaking them. §14's rule is *"redacted at capture, never at display"*, and its first clause is *"matches every value in the app's own secret set"* — which needs the secret set, which is P4a's. The **entropy and pattern heuristics**, and the third-party error-body mapping, need P4b's inputs (LiteLLM's error envelopes) and go there.

**12. `node-ts-mongo@1` ships with `provides.ai: false`, and `renderInjection` refuses an AI row.** P4a has no LiteLLM client, so a spec declaring `ai.models` must fail **loudly at validation** rather than deploy with no key. The blueprint descriptor says `ai: false`, so `checkBlueprintCompatibility` produces the clear message §25 asks for; and `renderInjection` throws `INJECTION_AI_UNSUPPORTED` naming P4b, so flipping the descriptor without doing the work fails immediately instead of injecting nothing. **P4b flips it to `true`** — additive, so no app breaks and it is not a major version bump. A dead code branch was rejected: an unreachable branch is the same smell as an uncalled module.

**13. The control plane holds a second database connection, explicitly.** SimpleSAMLphp's metadata tables live in `manifest_idp`; the control plane's own rows live in `manifest_control`. `sso/` gets its own pool from a new, **required** `MANIFEST_IDP_DATABASE_URL`. Deriving it from `MANIFEST_DATABASE_URL` by swapping the database name was rejected on this repository's own evidence: *the test constructs the value correctly and the running system re-derives it wrongly* is the single most expensive defect shape measured here, and a derived connection string is that shape waiting to happen.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec or from a dated measurement.

- **Four gates, all clean before every commit**, run from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck`, `pnpm format:check`. `pnpm test` and `pnpm --filter … test` are different commands with different working directories, and that difference has been a defect three times. **Run `pnpm test` twice** — a suite that is not repeatable has a state leak.
- **`pnpm test:docker` too**, for every task touching `infra/`, `runtime/docker/`, `services/`, `sso/` or `secrets/`. It needs `make up`, takes ~5 minutes, and **fails rather than skips** when asked to run.
- **Vitest strips types; it does not check them.** `exactOptionalPropertyTypes` is on. `hint: cond ? x : undefined` is a type error — conditional spread is the fix. Ten instances of this class were found executing P3.
- **Never edit the spec.** It is approved design. Record a proposed change in *Spec actions proposed by this plan*.
- **Ask before `sudo`.** It cannot prompt from a tool call. Bundle privileged steps into one script and ask Rich to run `! sudo bash <path>`.
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`. Every shell script here runs under bash 3.2 or it is a C1 defect.
- **The zone is `*.manifest.internal`.** Never `.test` — Valet owns that TLD and ports 53/80/443 on this and other UBC developers' machines.
- **Ports 7100–7199 only.** Caddy on 80/443 of the `127.0.0.2` alias is the sole exception.
- **Everything binds `127.0.0.1` explicitly**, never `localhost` — it resolves to `::1` and times out in build tooling.
- **Base images are pinned by digest, and blueprint dependencies by exact version** (C6, D30). A caret range would let §8's contract drift underneath the test that exists to catch drift; `descriptorSchema` already refuses anything but `x.y.z` in `pinned_dependencies`.
- **`node:22-alpine` stays the app-side base image**, mirrored into the local registry at `sha256:1ef15d33…`. Moving to 24 is open and is Rich's call (ORIENTATION §8); this plan does not touch it.
- **A shell PIPELINE takes the last command's exit status.** `git archive … | tar -x` reports success when `git` dies. Run the two separately.
- **`request.log.error` writes nothing** under `Fastify({ logger: false })`. Use `console.error` for anything an operator must see.
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built and naming the test that goes red.
- **Every task names its caller.** A module with no call site is not built — three instances so far, twice with passing tests.
- **Leave the machine as you found it.** `./scripts/snapshot-machine.sh` before and after; `diff` the two.
- **Commit after every task**, conventional messages (`feat:`, `fix:`, `chore:`, `test:`).

**What P4a does not create.** No LiteLLM client, no model catalogue, no WebSocket, no incidents, no `IamRegistration` or `PrivacyAssessment` rows, no `LaunchReadiness` gate. Those are P4b's and P6's; see *What this plan does not build*. Growing a half-gate here is explicitly out of scope — §7's `isSensitiveDiff` stays computed-and-reported by `POST /projects/:id/spec`, exactly as P3 left it.

---

## File Structure

```
infra/
├── compose.yaml                        MODIFIED: idp gains the cert volume + entityID env
├── caddy/Caddyfile                     MODIFIED: a named site block for idp.manifest.internal
├── idp/
│   ├── config/config.php               MODIFIED: authproc.idp, ssp_ro, technicalcontact
│   ├── config/authsources.php          MODIFIED: the ubcEduCwlPuid OID
│   └── metadata/
│       └── saml20-idp-hosted.php       NEW: the hosted entity. Without it there is no IdP
├── lib/
│   ├── ensure-idp-keypair.sh           NEW: mints the IdP signing keypair, idempotent
│   └── ensure-idp-sql.sh               NEW: ssp_ro, grants, the attributes CHECK
├── secrets/                            NEW, gitignored: the master keypair
└── seed/seed.sh                        MODIFIED: warm the mirror from the BLUEPRINT lockfile

blueprints/node-ts-mongo/               NEW — the blueprint faculty actually use
├── blueprint.yaml                      provides.ai: false until P4b
├── Dockerfile.tmpl                     keeps BOTH of fixture-node's hard-won refusals
├── .npmrc                              D13, with replace-registry-host=always
├── skeleton/
│   ├── package.json / package-lock.json
│   ├── server.js                       express + session + the auth component
│   ├── auth/ubcshib.js                 passport-ubcshib wired per §8
│   └── auth/attributes.js              the attribute bridge §9 requires
└── agents/AGENTS.md                    the knowledge pack (D25)

fixtures/proof-app/                     NEW — §16's proof app, login + Mongo halves
packages/control-plane/
├── drizzle/0001_*.sql                  secrets, events, and the events grant
└── src/
    ├── config.ts                       MODIFIED: idp settings in, dev-auth OUT
    ├── index.ts                        MODIFIED: scrub secrets from process.env at boot
    ├── db/schema.ts                    MODIFIED: secrets, events
    ├── identity/
    │   ├── dev-auth.ts                 DELETED (roadmap gap 3)
    │   ├── saml.ts                     NEW: the control plane's own SP
    │   └── testing.ts                  NEW: testSessionCookie — what replaces the shim
    ├── secrets/                        NEW
    │   ├── envelope.ts                 seal / open, pure, no I/O
    │   ├── store.ts                    put / get / listFor, over Postgres
    │   ├── scrub.ts                    §12's process.env scrub
    │   └── index.ts
    ├── sso/                            NEW
    │   ├── entity.ts                   D15 derivation — every value Manifest computes
    │   ├── keypair.ts                  per-app RSA-4096, stored as Secrets
    │   ├── metadata-store.ts           the manifest_idp pool; INSERT/UPDATE/DELETE
    │   ├── registration.ts             registerServiceProvider — the orchestration
    │   └── index.ts
    ├── observability/                  NEW (minimal — P4b grows it)
    │   ├── events.ts                   recordEvent, append-only
    │   ├── redact.ts                   exact-match redaction at capture
    │   └── index.ts
    ├── spec/injection.ts               NEW: §8's table, one function
    ├── services/credentials.ts         MODIFIED: derive-then-store migration
    └── releases/release.ts             MODIFIED: registration + injection call sites
```

**New configuration**, fixed here so every task agrees:

| Setting | Default | Why |
|---|---|---|
| `MANIFEST_IDP_DATABASE_URL` | none — **required** | Decision 13. `manifest_idp`, a different database from the control plane's. |
| `MANIFEST_IDP_ENTITY_ID` | `https://idp.manifest.internal/idp/shibboleth` | Decision 3. Never derived from the request host. |
| `MANIFEST_IDP_BASE_URL` | `https://idp.manifest.internal` | What `SAML_ENTRY_POINT`, `SAML_LOGOUT_URL` and `SAML_IDP_METADATA_URL` are built from. |
| `MANIFEST_SP_ENTITY_BASE` | `https://manifest.internal` | §9's `{platform-domain}` in `https://{domain}/sp/{slug}/{env}`. `manifest.ubc.ca` at UBC. |
| `MANIFEST_SECRETS_MASTER_KEY` | `infra/secrets/master.key` | Decision 7, repo-relative via `fromRepoRoot`. |
| `MANIFEST_DEV_AUTH` | **removed** | Decision 9. |

---

## Task 1: The IdP becomes an IdP — a hosted entity, a signing keypair, and one URL

**Files:**
- Create: `infra/idp/metadata/saml20-idp-hosted.php`
- Create: `infra/lib/ensure-idp-keypair.sh`
- Modify: `infra/compose.yaml` (the `idp` service), `infra/caddy/Caddyfile`, `Makefile` (`up`), `.gitignore`
- Test: `scripts/verify.sh` — three new checks

**Interfaces:**
- Consumes: nothing.
- Produces: an IdP that serves valid SAML metadata at `https://idp.manifest.internal/module.php/saml/idp/metadata`, with entityID `https://idp.manifest.internal/idp/shibboleth`; and the shell constant `IDP_HOST=idp.manifest.internal` in `infra/lib/common.sh`.

**Why this is Task 1, and why it is shell rather than TypeScript.** Everything else in this plan registers Service Providers with an IdP that, today, cannot issue an assertion — finding 1. There is no point deriving an SP row before there is something to consume it. This task is the one place where P1's *"P1 ships the containers; P4 writes the clients"* boundary has to move, and moving it deliberately in one task is better than discovering it in Task 7.

**The trap S2 left for this task, verbatim from its notes:** *"The IdP's `Issuer` is wrong on a non-default port… `saml20-idp-hosted.php` keys that entry on `'host' => 'localhost'` and hard-codes the port in the entityID. Harmless here… but Manifest's IdP entityID must be set deliberately, and a mismatch will break any SP that pins `idp.entityID`. Not chased further; out of S2's scope, but P4 will trip over it."* Decision 3 is that trip, avoided.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify.sh`, above the summary:

```bash
idp_serves_metadata() {
  local body
  body=$(curl -sS --cacert "$CA_FILE" "https://$IDP_HOST/module.php/saml/idp/metadata" 2>&1)
  # Assert the SHAPE of the answer, not that an answer arrived: a 500 error page
  # is also a 200-shaped string, and the whole point of this check is that the
  # IdP could not previously produce metadata at all.
  echo "$body" | grep -q 'entityID="https://idp.manifest.internal/idp/shibboleth"' \
    && echo "$body" | grep -q '<ds:X509Certificate>' \
    && echo "metadata carries the configured entityID and a signing certificate" \
    || { echo "metadata missing entityID or X509Certificate:"; echo "$body" | head -5; return 1; }
}
check "the IdP serves SAML metadata with our entityID and a certificate"  idp_serves_metadata

idp_entity_id_is_not_host_derived() {
  # S2's trap. The entityID must not carry a port or a bare host, whatever port
  # the container happens to be published on.
  local body; body=$(curl -sS --cacert "$CA_FILE" "https://$IDP_HOST/module.php/saml/idp/metadata")
  if echo "$body" | grep -qE 'entityID="[^"]*:(7122|6122|8080)'; then
    echo "entityID carries a PORT — it is being derived from the request host"; return 1
  fi
  echo "entityID carries no port"
}
check "the IdP entityID is configured, not derived from the request host"  idp_entity_id_is_not_host_derived

idp_through_the_edge() {
  # Not `-k`. A demo that skips verification is a demo that would pass against
  # the wrong certificate (P3 Task 14 paid for this one).
  local code
  code=$(curl -sS --cacert "$CA_FILE" -o /dev/null -w '%{http_code}' \
           "https://$IDP_HOST/module.php/core/welcome")
  echo "https://$IDP_HOST/module.php/core/welcome -> $code (want 200)"
  [ "$code" = "200" ]
}
check "the IdP is reachable through the edge over trusted TLS"  idp_through_the_edge
```

- [ ] **Step 2: Run them and watch all three fail**

Run: `make verify 2>&1 | grep -A2 'IdP serves SAML metadata'`

Expected: all three FAIL. The first two because the edge answers the Caddyfile wildcard (`manifest OK host=idp.manifest.internal`), which contains neither string; the third because the wildcard returns 200 for `/module.php/core/welcome` too — **so watch the third one's output, not only its status.** It will pass for the wrong reason until Step 5. That is the failure mode this repository has paid for six times; the check earns its keep only after the route exists.

- [ ] **Step 3: Add `IDP_HOST` and the keypair script**

`infra/lib/common.sh`, alongside the other constants:

```bash
IDP_HOST="idp.${ZONE}"
```

`infra/lib/ensure-idp-keypair.sh` — idempotent, no `sudo`, no network:

```bash
#!/usr/bin/env bash
# The Manifest IdP's signing keypair.
#
# §20 holds this in SEPARATE CUSTODY from application secrets: it is a file on
# disk, not a row in the `secrets` table, and `make reset` does not remove it —
# regenerating it invalidates every SP that pinned the certificate, which is a
# re-registration rather than a reset. Under D6 it signs only for TEST USERS, so
# its compromise never touches a real identity; it is still treated as sensitive
# because it can forge access to a staging app holding real work (§9).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/infra/idp/cert"
mkdir -p "$DIR"

if [ -f "$DIR/server.pem" ] && [ -f "$DIR/server.crt" ]; then
  exit 0
fi

echo "  minting the Manifest IdP signing keypair (10 years, RSA-4096)"
openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 3650 \
  -keyout "$DIR/server.pem" -out "$DIR/server.crt" \
  -subj "/CN=idp.manifest.internal/O=Manifest Local IdP" >/dev/null 2>&1
chmod 600 "$DIR/server.pem"
```

Add `infra/idp/cert/` to `.gitignore`, and call the script from `make up` next to `ensure-alias.sh` and `ensure-registry-auth.sh`.

- [ ] **Step 4: Write the hosted metadata entity**

`infra/idp/metadata/saml20-idp-hosted.php`. This file is the whole reason the IdP can sign:

```php
<?php
// THE HOSTED IdP ENTITY. Without this file SimpleSAMLphp has `enable.saml20-idp`
// set and no entity to be, and every metadata or SSO request returns 500:
//   "Could not find any default metadata entities in set [saml20-idp-hosted]"
// The image ships only `saml20-idp-hosted.php.dist`, so this was missing from
// P1's IdP entirely (measured 2026-09-07) while `make verify` stayed green.

$entityId = getenv('MANIFEST_IDP_ENTITY_ID') ?: 'https://idp.manifest.internal/idp/shibboleth';

$metadata[$entityId] = [
    // '__DEFAULT__', NOT a hostname. Keying on 'host' is what made the spike's
    // IdP issue assertions from `http://localhost:6122/...` while running on
    // 7122 (S2). The entityID above is configuration; nothing derives it from
    // the request, so the published port can move without breaking an SP that
    // pinned it.
    'host' => '__DEFAULT__',

    // Relative to /var/simplesamlphp/cert/, which the compose file mounts from
    // infra/idp/cert/. `ensure-idp-keypair.sh` mints them.
    'privatekey'  => 'server.pem',
    'certificate' => 'server.crt',

    'auth' => 'manifest-test-users',

    // D6: this IdP serves test users only and never authenticates a real person.
    'authproc' => [],
];
```

- [ ] **Step 5: Mount it, and route the IdP through the edge**

`infra/compose.yaml`, the `idp` service — add to `volumes:` and `environment:`:

```yaml
      MANIFEST_IDP_ENTITY_ID: ${MANIFEST_IDP_ENTITY_ID:-https://idp.manifest.internal/idp/shibboleth}
    volumes:
      - ./idp/config/config.php:/var/simplesamlphp/config/config.php:ro
      - ./idp/config/authsources.php:/var/simplesamlphp/config/authsources.php:ro
      - ./idp/metadata/saml20-idp-hosted.php:/var/simplesamlphp/metadata/saml20-idp-hosted.php:ro
      - ./idp/cert:/var/simplesamlphp/cert:ro
```

`infra/caddy/Caddyfile` — a **named site block, placed above the wildcard**:

```caddyfile
# The Manifest IdP, served at ONE name over trusted TLS.
#
# SAML is browser-mediated: the app redirects the BROWSER to the IdP, so the IdP
# needs a URL that is identical from the host, from a container and from `curl`
# — C1's bar. `http://127.0.0.1:7122` satisfies none of that. Caddy reaches the
# container by service name on the platform network (measured 2026-09-07: a
# 303 from `manifest-idp:80`), and `idp.manifest.internal` already resolves to
# 127.0.0.2 on the host and to Caddy inside a container.
#
# ABOVE the wildcard, and a separate block rather than a matcher inside it:
# Caddy prefers the more specific site, but the wildcard's `respond` is terminal
# and reviewing that ordering is cheaper than debugging it.
idp.manifest.internal {
	tls internal
	reverse_proxy manifest-idp:80 {
		# SimpleSAMLphp builds absolute URLs from these. Without them every
		# redirect it issues points at `http://manifest-idp/...`, which no
		# browser can reach, and the SAML flow dies on the second hop.
		header_up X-Forwarded-Proto https
		header_up X-Forwarded-Host {host}
	}
}
```

`infra/idp/config/config.php` — SimpleSAMLphp must be told to trust that header:

```php
    // Caddy terminates TLS; without this SimpleSAMLphp builds `http://` URLs
    // into the SAML flow and the browser is redirected off the trusted origin.
    'baseurlpath' => 'https://idp.manifest.internal/',
    'trusted.url.domains' => ['idp.manifest.internal'],
```

- [ ] **Step 6: Bring it up and run the checks**

Run: `make up && make verify 2>&1 | grep -A2 -i 'idp'`

Expected: all three PASS, and the metadata check prints the entityID and a certificate rather than a 500 page.

- [ ] **Step 7: The negative controls — watch each check fail for its own reason**

Three separate controls, because three separate things could be broken:

```bash
# a) No hosted entity -> metadata 500. Comment the volume line out, `make up`.
#    Expected: check 1 red with "Could not find any default metadata entities".
# b) No keypair -> metadata without <ds:X509Certificate>. Move infra/idp/cert
#    aside, `make up`. Expected: check 1 red on the certificate half only.
# c) No edge route -> the wildcard answers. Comment the Caddyfile block out,
#    `make up`. Expected: checks 1 and 2 red with "manifest OK host=" in the body.
```

Restore all three and re-run `make verify`.

- [ ] **Step 8: Commit**

```bash
git add infra/ Makefile .gitignore scripts/verify.sh
git commit -m "feat: the Manifest IdP can issue assertions, and has one URL

It could not before: no saml20-idp-hosted.php (the image ships only the
.dist) and an empty cert/, so /module.php/saml/idp/metadata answered 500
with 'Could not find any default metadata entities'. make verify was 34/0
throughout — it checked that the IdP served a page, not that it could sign.

entityID is configuration, never derived from the request host (S2's trap),
and the IdP is served through the edge at idp.manifest.internal so the SAML
flow has one URL from host, container and curl alike."
```

---

## Task 2: Enforced attribute release, the right OID, and a read-only metadata user

**Files:**
- Modify: `infra/idp/config/config.php`, `infra/idp/config/authsources.php`
- Create: `infra/lib/ensure-idp-sql.sh`
- Modify: `Makefile` (`up`), `scripts/doctor.sh`, `scripts/verify.sh`

**Interfaces:**
- Consumes: Task 1's working IdP.
- Produces: `ssp_ro`, a `SELECT`-only role on `manifest_idp`; a `saml20_sp_remote_attributes_present` CHECK constraint; and an IdP that releases exactly the attributes a row declares, named by OID.

**Why the two halves are one task.** They are the same claim from two directions. §9 says *"An app cannot receive an attribute it did not declare"*, and S2 measured that the claim is false three ways at once: the filter is not in the default chain, an empty list means "no limit", and the attribute the whole platform identifies people by is named with an OID nothing maps. Fixing one and not the others leaves the sentence untrue and the failure silent.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify.sh`:

```bash
# The row declares TWO attributes. Anything else released is a §9 violation, and
# S2 measured the default as releasing all THIRTEEN the auth source produces.
idp_enforces_attribute_release() {
  local eid='https://manifest.internal/sp/verify-attr-probe/staging'
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "INSERT INTO saml20_sp_remote (entity_id, entity_data) VALUES ('$eid',
     '{\"AssertionConsumerService\":[{\"index\":0,\"Binding\":\"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST\",\"Location\":\"https://verify-attr-probe.staging.manifest.internal/acs\"}],
       \"attributes\":[\"ubcEduCwlPuid\",\"mail\"]}')
     ON CONFLICT (entity_id) DO UPDATE SET entity_data = EXCLUDED.entity_data" >/dev/null
  # Ask SimpleSAMLphp itself what it would release, rather than completing a
  # login here — Task 3 owns the full flow. This asserts the FILTER is loaded.
  local out
  out=$(docker exec manifest-idp php -r '
    require "/var/simplesamlphp/vendor/autoload.php";
    $c = \SimpleSAML\Configuration::getInstance();
    $ap = $c->getOptionalArray("authproc.idp", []);
    $classes = [];
    foreach ($ap as $p) { $classes[] = is_array($p) ? ($p["class"] ?? "?") : $p; }
    echo implode(",", $classes);
  ' 2>&1)
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "DELETE FROM saml20_sp_remote WHERE entity_id='$eid'" >/dev/null
  echo "authproc.idp = [$out]"
  echo "$out" | grep -q 'core:AttributeLimit'
}
check "the IdP loads core:AttributeLimit (without it release fails OPEN)"  idp_enforces_attribute_release

idp_refuses_an_empty_attribute_list() {
  local eid='https://manifest.internal/sp/verify-empty-probe/staging'
  local rc=0
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "INSERT INTO saml20_sp_remote (entity_id, entity_data)
     VALUES ('$eid', '{\"attributes\":[]}')" >/dev/null 2>&1 || rc=$?
  docker exec manifest-postgres psql -U manifest -d manifest_idp -tAc \
    "DELETE FROM saml20_sp_remote WHERE entity_id='$eid'" >/dev/null 2>&1
  echo "INSERT of a row with attributes:[] exited $rc (want non-zero)"
  [ "$rc" -ne 0 ]
}
check "the database refuses a row whose attributes list is empty"  idp_refuses_an_empty_attribute_list

idp_metadata_user_is_read_only() {
  local rc=0
  docker exec manifest-postgres psql -U ssp_ro -d manifest_idp -tAc \
    "INSERT INTO saml20_sp_remote VALUES ('x','{}')" >/dev/null 2>&1 || rc=$?
  echo "ssp_ro INSERT exited $rc (want non-zero)"
  [ "$rc" -ne 0 ] && docker exec manifest-postgres psql -U ssp_ro -d manifest_idp \
    -tAc "SELECT 1 FROM saml20_sp_remote LIMIT 1" >/dev/null 2>&1
}
check "the SimpleSAMLphp metadata user can read and cannot write (§9)"  idp_metadata_user_is_read_only

idp_releases_the_right_puid_oid() {
  # The identifier the whole platform keys people on. passport-ubcshib maps
  # urn:oid:1.3.6.1.4.1.60.6.1.6; P1's authsources.php shipped 60.1.1.1, which
  # matches nothing (measured 2026-09-07).
  docker exec manifest-idp grep -q '1\.3\.6\.1\.4\.1\.60\.6\.1\.6' \
    /var/simplesamlphp/config/authsources.php \
    && ! docker exec manifest-idp grep -q '1\.3\.6\.1\.4\.1\.60\.1\.1\.1' \
    /var/simplesamlphp/config/authsources.php \
    && echo "authsources.php uses urn:oid:1.3.6.1.4.1.60.6.1.6 and not 60.1.1.1"
}
check "the IdP releases ubcEduCwlPuid under the OID the library maps"  idp_releases_the_right_puid_oid

idp_ships_no_flatfile_sp_metadata() {
  # §9: "The deployed IdP ships no saml20-sp-remote.php." S2 measured why —
  # when the same entityID exists in a flatfile AND the SQL store, the FIRST
  # matching metadata.sources entry wins, so a stale file silently shadows a
  # control-plane-written row and nothing reports it. docker-simple-saml's own
  # file defines 15 SPs.
  #
  # True today only by accident: the image ships .dist files and nothing else.
  # An accident is not a control, so it is asserted.
  if docker exec manifest-idp test -f /var/simplesamlphp/metadata/saml20-sp-remote.php; then
    echo "saml20-sp-remote.php EXISTS — it will shadow SQL rows silently"; return 1
  fi
  echo "no flatfile saml20-sp-remote.php; the SQL store is the only place an SP is defined"
}
check "the IdP ships no flatfile SP metadata (§9)"  idp_ships_no_flatfile_sp_metadata
```

- [ ] **Step 2: Run them and watch all four fail**

Run: `make verify 2>&1 | grep -B1 -A3 'AttributeLimit\|empty\|read-only\|OID'`

Expected: four FAILs — `authproc.idp = []`, the empty-list INSERT exits **0**, `ssp_ro` does not exist (`psql: FATAL: role "ssp_ro" does not exist` — note this fails for the *right* reason only once the role exists and is *denied*; until then read the message), and `authsources.php` carries `60.1.1.1`.

- [ ] **Step 3: Enable the filter, in the order S2 measured**

`infra/idp/config/config.php`, inside the `array_merge`:

```php
    // WITHOUT THIS THE ROW'S `attributes` LIST IS ADVISORY. S2 measured a row
    // declaring three attributes releasing all thirteen the auth source
    // produced, with no error anywhere. §9's "an app cannot receive an
    // attribute it did not declare" is only true with this line.
    //
    // THE PRIORITIES ARE LOAD-BEARING. AttributeLimit at 50 matches the
    // FRIENDLY vocabulary `auth.attributes` uses; AttributeMap at 60 converts
    // to OIDs afterwards. Reverse them and the limit matches nothing and
    // releases everything — which looks identical to it working.
    'authproc.idp' => [
        50 => ['class' => 'core:AttributeLimit'],
        60 => ['class' => 'core:AttributeMap', 'name2oid'],
    ],

    // §9: the metadata source's user is READ-ONLY. Note the scope — this is
    // `database.*`. `store.sql.*` below is a different subsystem with its own
    // credentials and it DOES write (S2); reading this as "SimpleSAMLphp never
    // writes to Postgres" would mis-provision §21's shared server.
    'database.username' => 'ssp_ro',
    'database.password' => getenv('SSP_RO_PASSWORD'),
```

Add `SSP_RO_PASSWORD` to the `idp` service's environment in `infra/compose.yaml` and to `.env.example`.

- [ ] **Step 4: Fix the OID**

`infra/idp/config/authsources.php` — replace both occurrences:

```php
        'student:student' => [
            // urn:oid:1.3.6.1.4.1.60.6.1.6, NOT 60.1.1.1. This is the OID
            // passport-ubcshib's ATTRIBUTE_MAPPINGS carries, and S2 confirmed
            // real UBC Shibboleth sends OID (tlef-biocbot authenticates in
            // production with no bridge and this is its only reachable key).
            // The value P1 shipped matched nothing, so `ubcEduCwlPuid` was
            // simply absent and the strategy threw `Missing ubcEduCwlPuid`.
            'urn:oid:1.3.6.1.4.1.60.6.1.6'      => ['stu000001'],
            'urn:oid:0.9.2342.19200300.100.1.3' => ['student@student.ubc.ca'],
            'urn:oid:2.5.4.42' => ['Test'],
            'urn:oid:2.5.4.4'  => ['Student'],
            'urn:oid:1.3.6.1.4.1.5923.1.1.1.1' => ['student'],
        ],
        'instructor:instructor' => [
            'urn:oid:1.3.6.1.4.1.60.6.1.6'      => ['ins000001'],
            'urn:oid:0.9.2342.19200300.100.1.3' => ['instructor@ubc.ca'],
            'urn:oid:2.5.4.42' => ['Test'],
            'urn:oid:2.5.4.4'  => ['Instructor'],
            'urn:oid:1.3.6.1.4.1.5923.1.1.1.1' => ['faculty'],
        ],
```

- [ ] **Step 5: The role and the constraint**

`infra/lib/ensure-idp-sql.sh`. **Note the ordering hazard it exists to solve:** Postgres `initdb` scripts run **once, on an empty data directory only**, so a role added there would never reach an existing volume; and the tables are created by the IdP's own entrypoint at *its* start, not at Postgres's.

```bash
#!/usr/bin/env bash
# ssp_ro, its grants, and the constraint that makes §9's fail-open row
# unrepresentable. Idempotent, runs on every `make up`.
#
# NOT an initdb script: those run once on an empty data directory, so an
# existing developer's volume would never see this. NOT the IdP's entrypoint
# either — S2's headline is that MANIFEST WRITES NO PHP, and that is worth
# keeping true.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
. infra/lib/common.sh

psql_idp() { docker exec -i manifest-postgres psql -v ON_ERROR_STOP=1 -U manifest -d manifest_idp "$@"; }

# The IdP's entrypoint runs initMDSPdo.php at ITS start, which is not ordered
# against ours. Wait for the table rather than assuming it.
for i in $(seq 1 60); do
  if psql_idp -tAc "SELECT to_regclass('public.saml20_sp_remote')" 2>/dev/null | grep -q saml20_sp_remote; then
    break
  fi
  [ "$i" -eq 60 ] && { echo "ensure-idp-sql: saml20_sp_remote never appeared"; exit 1; }
  sleep 1
done

psql_idp <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ssp_ro') THEN
    EXECUTE format('CREATE ROLE ssp_ro LOGIN PASSWORD %L', current_setting('manifest.ssp_ro_password', true));
  ELSE
    EXECUTE format('ALTER ROLE ssp_ro PASSWORD %L', current_setting('manifest.ssp_ro_password', true));
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE manifest_idp TO ssp_ro;
GRANT USAGE ON SCHEMA public TO ssp_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ssp_ro;
-- Easy to omit, and the failure is a runtime "permission denied" long after
-- seeding: initMDSPdo.php creates tables on a SimpleSAMLphp upgrade too (S2).
ALTER DEFAULT PRIVILEGES FOR ROLE manifest IN SCHEMA public GRANT SELECT ON TABLES TO ssp_ro;

-- §9: registration must reject a row whose attributes list is missing or empty.
-- This is the SECOND of the two independent reads of that rule; sso/ carries
-- the first. entity_data is TEXT, not jsonb (the handler hard-codes it), so the
-- constraint costs a cast per write — S2 priced that and it is acceptable.
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saml20_sp_remote_attributes_present') THEN
    ALTER TABLE public.saml20_sp_remote
      ADD CONSTRAINT saml20_sp_remote_attributes_present
      CHECK (jsonb_array_length((entity_data::jsonb) -> 'attributes') > 0);
  END IF;
END
\$\$;
SQL
```

Pass the password through with `PGOPTIONS`-style setting — call it as:

```bash
docker exec -i -e PGOPTIONS="-c manifest.ssp_ro_password=${SSP_RO_PASSWORD}" manifest-postgres …
```

Call it from `make up`, after `compose up --wait`.

- [ ] **Step 6: Run the checks**

Run: `make up && make verify 2>&1 | tail -20`

Expected: all four PASS, and the total check count rises by four from Task 1's.

- [ ] **Step 7: The negative controls**

```bash
# a) Remove `50 => core:AttributeLimit` from config.php, `make up`.
#    Expected: check red, printing `authproc.idp = [core:AttributeMap]`.
# b) Swap the priorities (AttributeMap at 50, AttributeLimit at 60), `make up`.
#    Expected: the check still passes — it only asserts the filter is LOADED.
#    Task 3's login test is what catches the ordering, and this is why Task 3
#    exists rather than trusting a configuration assertion.
# c) `ALTER TABLE saml20_sp_remote DROP CONSTRAINT saml20_sp_remote_attributes_present`
#    Expected: the empty-list check red, the INSERT exiting 0.
# d) `GRANT INSERT ON saml20_sp_remote TO ssp_ro`
#    Expected: the read-only check red. REVOKE it afterwards.
```

Restore, `make up`, re-run.

- [ ] **Step 8: Commit**

```bash
git add infra/ Makefile scripts/verify.sh .env.example
git commit -m "fix: attribute release is enforced, and the PUID OID matches the library

Three things were wrong at once and all three were silent. authproc.idp was
empty, so a row's attributes list was advisory (S2 measured three declared and
thirteen released). Nothing stopped an empty list, which AttributeLimit treats
as 'no limit'. And authsources.php released ubcEduCwlPuid under
urn:oid:1.3.6.1.4.1.60.1.1.1 while passport-ubcshib maps 60.6.1.6, so the one
attribute the platform identifies people by was simply missing.

ssp_ro is now SELECT-only, per §9 — scoped to the metadata source, since
store.sql.* is a different subsystem and does write."
```

---

## Task 3: A real CWL login, end to end, before any control-plane code exists

**Files:**
- Create: `packages/control-plane/src/sso/login.docker.test.ts`
- Create: `packages/control-plane/src/sso/testing.ts`
- Create: `fixtures/saml-sp/` (`package.json`, `package-lock.json`, `server.js`)
- Modify: `packages/control-plane/src/sso/index.ts` (created empty here), `infra/seed/seed.sh`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: `withRegisteredSp(row, fn)` from `sso/testing.ts` — inserts a `saml20_sp_remote` row, runs the callback, deletes the row; and the **identity-path regression tier** §16 names, as a permanent Docker-tier suite.

**This is the most important task in the plan, and it is third on purpose.** P3's two worst sessions were its last two, both because something ran together for the first time — Task 15 found that no build had ever succeeded, Task 17 that no deploy had either. The roadmap's lesson is explicit: *schedule the end-to-end task early and drive it through the real entry point.* For P4a the end-to-end thing is a **complete SAML login**, and the cheapest honest version of it needs no `sso/` module, no secrets, no blueprint and no control-plane route — a hand-written row, a throwaway Express SP built on the real `passport-ubcshib`, and `curl`.

Everything Tasks 6–15 build is a way of *producing* that row automatically. If the row does not work by hand, nothing downstream can work, and finding that out here costs an afternoon rather than a session.

**It also settles S2's open question**, which was explicitly handed forward: *"P2 should own a fixture test that a known-good row still produces a known-good assertion, so an upgrade fails in CI rather than in staging."* Nothing owned it. It is this file.

- [ ] **Step 1: Write the throwaway SP**

`fixtures/saml-sp/server.js`. Small, and deliberately built on the **real library** rather than a SAML mock — the point is to exercise `passport-ubcshib`'s attribute mapping against this IdP:

```js
// A minimal Service Provider, used only by sso/login.docker.test.ts. It exists
// to prove that a hand-written saml20_sp_remote row produces a usable login
// BEFORE any code generates such a row (§16, identity-path regression).
//
// It is built on the real passport-ubcshib because the mapping between what the
// IdP releases and what an app can read is precisely what is under test —
// S2 found the library's own map covers six names, has no OID entry for `uid`
// or `eduPersonPrincipalName` at all, and reaches its MACE entry never.
import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { UBCStrategy } from 'passport-ubcshib'
import { readFileSync } from 'node:fs'

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }))
app.use(passport.initialize())
app.use(passport.session())
passport.serializeUser((u, d) => d(null, u))
passport.deserializeUser((u, d) => d(null, u))

passport.use(
  new UBCStrategy(
    {
      // Every one of these is §8's contract, read from the environment exactly
      // as the blueprint will read it.
      entryPoint: process.env.SAML_ENTRY_POINT,
      issuer: process.env.SAML_ISSUER,
      callbackUrl: process.env.SAML_CALLBACK_URL,
      // MANDATORY. The strategy builds `cert: options.cert || (() => { throw })()`,
      // an IIFE evaluated at construction, so it throws unless a certificate is
      // supplied and the library's _fetchCertificate() fallback is unreachable.
      cert: readFileSync(process.env.SAML_IDP_CERT_PATH, 'utf8'),
      // NON-EMPTY, or mapAttributes never runs and the app sees raw OID keys
      // (S2 Evidence 11). This list is what §9's attribute bridge is for.
      attributeConfig: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn', 'eduPersonAffiliation'],
    },
    (profile, done) => done(null, profile),
  ),
)

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }))
app.get('/login', passport.authenticate('ubcshib'))
app.post(
  '/auth/ubcshib/callback',
  express.urlencoded({ extended: false }),
  passport.authenticate('ubcshib', { failureRedirect: '/failed' }),
  (req, res) => res.json({ attributes: req.user.attributes ?? null }),
)
app.get('/failed', (_req, res) => res.status(401).json({ error: 'saml login failed' }))
app.get('/me', (req, res) =>
  req.user ? res.json({ attributes: req.user.attributes }) : res.status(401).json({ error: 'no session' }),
)

app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () =>
  console.log(JSON.stringify({ msg: 'saml-sp listening', port: process.env.PORT })),
)
```

`fixtures/saml-sp/package.json` — exact versions, per C6 and D30:

```json
{
  "name": "manifest-saml-sp-fixture",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "dependencies": {
    "express": "4.21.2",
    "express-session": "1.18.1",
    "passport": "0.7.0",
    "passport-ubcshib": "0.1.6"
  }
}
```

Generate the lockfile the way a real app's is generated — **not** with `--registry` pointing at the published mirror port, which writes `resolved` URLs naming a host that does not exist inside the builder (P3 defect 64):

```bash
cd fixtures/saml-sp && npm install --package-lock-only && cd -
```

- [ ] **Step 2: Warm the mirror, and write the failing test**

`infra/seed/seed.sh`, replacing the hardcoded warm list — this is what makes the login test runnable offline:

```bash
echo "4b/6 warming the package mirror from the blueprint and fixture lockfiles"
# The blueprint's dependency closure, fetched once through Verdaccio so it is in
# its storage. Derived from the lockfiles rather than restated: a hardcoded list
# goes stale the moment a blueprint gains a dependency, and the symptom is a
# build that works online and fails offline.
for lock in blueprints/*/skeleton/package.json fixtures/*/package.json; do
  [ -f "$lock" ] || continue
  d=$(dirname "$lock")
  (cd "$d" && npm install --registry "http://127.0.0.1:$PORT_VERDACCIO" \
      --package-lock-only --no-audit --no-fund --silent) \
    || echo "     WARN: mirror warm failed for $d"
done
```

`packages/control-plane/src/sso/login.docker.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { withRegisteredSp, startSamlSp, idpLogin } from './testing.js'

/**
 * §16's identity-path regression tier, and S2's open question answered: a
 * known-good row still produces a known-good assertion, so a SimpleSAMLphp
 * upgrade fails here rather than in staging.
 *
 * It runs BEFORE `sso/` exists. Everything later in this plan is a way of
 * producing this row automatically; if the row does not work by hand, nothing
 * downstream can, and this is the cheapest place to find that out.
 */
describeDocker('a real CWL login against the Manifest IdP', () => {
  let sp: Awaited<ReturnType<typeof startSamlSp>>

  beforeAll(async () => {
    sp = await startSamlSp({ slug: 'saml-probe', kind: 'staging' })
  }, 300_000)
  afterAll(async () => sp?.stop())

  it('completes a login and the app reads ubcEduCwlPuid', async () => {
    await withRegisteredSp(sp.row, async () => {
      const result = await idpLogin(sp, { user: 'student', password: 'student' })
      expect(result.status).toBe(200)
      // ASSERT THE SHAPE OF THE ANSWER. "a login happened" and "the app can
      // identify the person" are different claims and only the second matters:
      // S3's six green checks included one returning 192 numbers where 768
      // belonged.
      expect(result.attributes).toMatchObject({
        ubcEduCwlPuid: expect.arrayContaining(['stu000001']),
        mail: expect.arrayContaining(['student@student.ubc.ca']),
      })
    })
  }, 120_000)

  it('releases exactly the attributes the row declares, and no more', async () => {
    // The row asks for two. The auth source produces five. §9's whole claim.
    const twoOnly = { ...sp.row, attributes: ['ubcEduCwlPuid', 'mail'] }
    await withRegisteredSp(twoOnly, async () => {
      const result = await idpLogin(sp, { user: 'student', password: 'student' })
      expect(Object.keys(result.attributes!).sort()).toEqual(['mail', 'ubcEduCwlPuid'])
      expect(result.attributes).not.toHaveProperty('givenName')
      expect(result.attributes).not.toHaveProperty('sn')
    })
  }, 120_000)

  it('refuses an entityID with no row at all', async () => {
    // The negative control that makes the two above attributable to the row and
    // nothing else. S2 Evidence 4: "Metadata not found".
    const result = await idpLogin(sp, { user: 'student', password: 'student' })
    expect(result.status).not.toBe(200)
    expect(result.body).toMatch(/Metadata not found|Unable to locate metadata/i)
  }, 120_000)
})
```

- [ ] **Step 3: Write the harness**

`packages/control-plane/src/sso/testing.ts`. `idpLogin` walks the flow the way a browser does — three hops — and is the piece worth writing carefully:

```ts
/**
 * The SAML flow, driven the way a browser drives it, from a CONTAINER.
 *
 * From a container because a host process cannot reach a container IP on Docker
 * Desktop (§21), and because the SP under test runs in one. The cookie jar
 * matters: SimpleSAMLphp carries the authentication state in a session cookie
 * between the SSO request and the login POST, and without a jar the second hop
 * starts a new session and the flow loops.
 *
 * `--cacert`, never `-k`: a probe that skips verification would pass against
 * the wrong certificate, which is the failure P3 Task 14 paid for.
 */
export async function idpLogin(
  sp: SamlSpHandle,
  credentials: { user: string; password: string },
): Promise<{ status: number; body: string; attributes?: Record<string, string[]> }> {
  const output = await runProbeContainer(sp.engine, {
    network: sp.network,
    dnsServer: sp.dnsServer,
    caCertPath: sp.caCertPath,
    script: LOGIN_SCRIPT,
    env: {
      APP: `https://${sp.hostname}`,
      IDP: sp.idpBaseUrl,
      USER: credentials.user,
      PASS: credentials.password,
    },
  })
  // The script prints one JSON line last, so the container's own diagnostics
  // above it are kept (they are the only record when a hop fails) without
  // being parsed.
  const line = output.trim().split('\n').at(-1) ?? '{}'
  return JSON.parse(line) as { status: number; body: string; attributes?: Record<string, string[]> }
}

/**
 * Three hops, because that is what a browser does. curl cannot auto-submit an
 * HTML form, so each form's fields are extracted and re-POSTed.
 *
 * Extracting them with `sed` is regex-over-HTML, which is normally a mistake.
 * It is acceptable here for one reason: this is a FIXTURE IdP whose exact
 * SimpleSAMLphp version we pin and whose markup we can re-check on upgrade —
 * and that re-check is precisely what this suite is for (S2's open question).
 * If the markup moves, this test fails loudly, which is the desired behaviour.
 */
const LOGIN_SCRIPT = String.raw`
set -eu
J=/tmp/jar

# HOP 1: the app redirects to the IdP with a SAMLRequest. -L follows it; the
# jar picks up SimpleSAMLphp's session cookie, without which hop 2 starts a new
# authentication and the flow loops forever rather than failing.
form=$(curl -sS --cacert /ca.crt -c $J -b $J -L "$APP/login")

# If there is no login form, the IdP refused the SP. That is the negative
# control's expected path, so report it rather than failing the container.
if ! echo "$form" | grep -q 'name="username"'; then
  code=$(curl -sS --cacert /ca.crt -c $J -b $J -L -o /dev/null -w '%{http_code}' "$APP/login")
  printf '{"status":%s,"body":%s}\n' "$code" "$(echo "$form" | head -c 400 | sed 's/"/\\"/g;s/^/"/;s/$/"/' | tr -d '\n')"
  exit 0
fi

# HOP 2: post the credentials. AuthState is what carries the pending
# authentication between requests; dropping it restarts the flow.
state=$(echo "$form" | sed -n 's/.*name="AuthState"[^>]*value="\([^"]*\)".*/\1/p' | head -1)
action=$(echo "$form" | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | head -1)
case "$action" in http*) post="$action" ;; *) post="$IDP$action" ;; esac
assertion=$(curl -sS --cacert /ca.crt -c $J -b $J -L \
  --data-urlencode "username=$USER" --data-urlencode "password=$PASS" \
  --data-urlencode "AuthState=$state" "$post")

# HOP 3: the IdP answers with an auto-submitting form carrying the SAMLResponse.
# Post it to the app's ACS. --location-trusted, not -L: the POST crosses from
# the IdP origin to the app origin and plain -L drops the body on a
# cross-origin redirect, which reads as "the app rejected the assertion".
saml=$(echo "$assertion" | sed -n 's/.*name="SAMLResponse"[^>]*value="\([^"]*\)".*/\1/p' | head -1)
if [ -z "$saml" ]; then
  printf '{"status":0,"body":"no SAMLResponse in the IdP response"}\n'
  exit 0
fi
body=$(curl -sS --cacert /ca.crt -c $J -b $J --location-trusted \
  --data-urlencode "SAMLResponse=$saml" "$APP/auth/ubcshib/callback")
code=$(curl -sS --cacert /ca.crt -b $J -o /dev/null -w '%{http_code}' "$APP/me")

# The app's /me returns {"attributes": …}; pass it through untouched so the
# TEST decides what is correct, not this script.
printf '{"status":%s,"body":%s,"attributes":%s}\n' \
  "$code" "$(echo "$body" | head -c 400 | sed 's/"/\\"/g;s/^/"/;s/$/"/' | tr -d '\n')" \
  "$(echo "$body" | sed -n 's/.*"attributes":\(.*\)}$/\1/p' | head -1)"
`
```

`runProbeContainer` is the same shape as `edgeProbe` in `routing/readiness.ts` — create, start, wait, read the logs, remove with `v=true` — and it must **use `demux`, not a raw read**: the Engine API frames its log stream as `[type:u8][000][size:u32be][payload]`, and stripping non-digits out of the raw bytes works only while no header byte happens to be an ASCII digit (P3 defect 52). Mount the platform CA at `/ca.crt` and pass `Dns: [dnsServer]`, exactly as `edgeProbe` does.

- [ ] **Step 4: Run it and watch it fail**

Run: `make up && pnpm test:docker -- sso/login`

Expected: FAIL. `startSamlSp` does not exist yet, then — once it does — the login fails at whichever hop is wrong. **Work the hops in order and record what each one said**; this is the task where the SAML flow is understood, and a note per hop is worth more later than a passing test.

- [ ] **Step 5: Make it pass**

Build the SP image from `fixtures/saml-sp/` with the blueprint's own base image and `.npmrc`, run it on an app-shaped network with the platform neighbours attached, and register a Caddy route for `saml-probe.staging.manifest.internal` — all of which `runtime/docker/` and `routing/` already do. `sso/testing.ts` composes them; it must not reimplement any of it.

- [ ] **Step 6: Run the whole suite twice**

Run: `pnpm test:docker && pnpm test:docker`

Expected: PASS both times, with the same count. A different count on the second run is a state leak — `withRegisteredSp` not deleting its row is the likely one, and it is exactly the class that made five of P2's tests order-dependent.

- [ ] **Step 7: The negative controls — four, because four things could be false**

```bash
# a) Swap the authproc priorities from Task 2 (AttributeMap 50, AttributeLimit 60).
#    Expected: "releases exactly the attributes the row declares" RED, showing
#    five attributes where two belong. THIS IS THE CHECK TASK 2 COULD NOT MAKE.
# b) Revert the OID in authsources.php to 1.3.6.1.4.1.60.1.1.1.
#    Expected: the first test RED with `Missing ubcEduCwlPuid attribute`.
# c) Remove `attributeConfig` from the fixture SP's strategy options.
#    Expected: the first test RED — raw `urn:oid:...` keys, no friendly names
#    (S2 Evidence 11: mapAttributes only runs when the list is non-empty).
# d) Remove the row inside withRegisteredSp before the login.
#    Expected: the first test RED with "Unable to locate metadata".
```

Record what each one printed. These four controls are the evidence that Tasks 1 and 2 are in force, and no later task re-establishes them.

- [ ] **Step 8: Commit**

```bash
git add fixtures/saml-sp packages/control-plane/src/sso infra/seed/seed.sh
git commit -m "test: a real CWL login, end to end, before any sso/ code exists

Scheduled third rather than last, deliberately. P3's two worst sessions were
its last two, both because something ran together for the first time; this is
the cheapest honest version of P4a's end-to-end path — a hand-written
saml20_sp_remote row, the real passport-ubcshib, and curl.

It also answers S2's open question, which nothing owned: a known-good row
still produces a known-good assertion, so a SimpleSAMLphp upgrade fails here
rather than in staging. Four negative controls recorded, including the
authproc ordering that Task 2's configuration check cannot see."
```

---

## Task 4: `secrets/` — envelope encryption, and the `process.env` scrub

**Files:**
- Create: `packages/control-plane/src/secrets/envelope.ts`, `store.ts`, `scrub.ts`, `index.ts`
- Create: `packages/control-plane/src/secrets/envelope.test.ts`, `store.test.ts`, `scrub.test.ts`
- Create: `packages/control-plane/drizzle/0001_secrets_and_events.sql`
- Create: `infra/lib/ensure-master-key.sh`
- Modify: `packages/control-plane/src/db/schema.ts`, `src/config.ts`, `src/index.ts`, `Makefile`, `.gitignore`, `package.json`

**Interfaces:**
- Consumes: nothing at runtime — `envelope.ts` is pure and takes keys as arguments, which is what makes it testable with no database and no file.
- Produces:
  - `interface SecretEnvelope { v: 1; wrappedKey: string; nonce: string; ciphertext: string }`
  - `sealSecret(plaintext: string, masterPublicKey: Uint8Array): SecretEnvelope`
  - `openSecret(envelope: SecretEnvelope, keys: MasterKeypair): string`
  - `rewrapSecret(envelope: SecretEnvelope, from: MasterKeypair, toPublicKey: Uint8Array): SecretEnvelope`
  - `loadMasterKeypair(path: string): Promise<MasterKeypair>`
  - `putSecret(db, { projectId, environmentKind, name, value }, keys): Promise<Secret>`
  - `getSecret(db, { projectId, environmentKind, name }, keys): Promise<string | undefined>`
  - `secretValuesFor(db, { projectId, environmentKind }, keys): Promise<Map<string, string>>` — **the input to Task 8's redactor**
  - `scrubSecretEnv(env: NodeJS.ProcessEnv): string[]`

**Why envelope encryption rather than encrypting each secret with the master key.** §20: *"per-secret data keys wrapped by a master key. Master-key rotation re-wraps data keys without re-encrypting plaintext, so rotation is cheap enough to actually happen."* That last clause is the whole argument — a rotation that requires decrypting and re-encrypting every secret is a rotation nobody performs. `rewrapSecret` touches `wrappedKey` and leaves `ciphertext` byte-identical, and a test asserts exactly that.

- [ ] **Step 1: Add the dependency and write the failing test**

```bash
pnpm --filter @manifest/control-plane add libsodium-wrappers@0.8.4
pnpm --filter @manifest/control-plane add -D @types/libsodium-wrappers@0.7.14
```

`libsodium-wrappers` declares **no install or postinstall script** — checked before it was chosen, because pnpm 11 makes an un-named dependency build script a hard error and a native crypto binding would have one (ORIENTATION §4).

`packages/control-plane/src/secrets/envelope.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  generateMasterKeypair,
  openSecret,
  rewrapSecret,
  sealSecret,
} from './envelope.js'

describe('envelope encryption (§12, §20)', () => {
  it('round-trips a secret', async () => {
    const keys = await generateMasterKeypair()
    const envelope = sealSecret('mongodb://app:hunter2@db:27017/x', keys.publicKey)
    expect(openSecret(envelope, keys)).toBe('mongodb://app:hunter2@db:27017/x')
  })

  it('never puts the plaintext in the envelope', async () => {
    const keys = await generateMasterKeypair()
    const envelope = sealSecret('STUDENT-PII-CANARY', keys.publicKey)
    // The whole envelope, not just the ciphertext field: a plaintext that leaks
    // into `nonce` or `wrappedKey` would be just as exposed and would still
    // round-trip.
    expect(JSON.stringify(envelope)).not.toContain('STUDENT-PII-CANARY')
  })

  it('uses a fresh data key per secret, so two seals of one value differ', async () => {
    const keys = await generateMasterKeypair()
    const a = sealSecret('same', keys.publicKey)
    const b = sealSecret('same', keys.publicKey)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.wrappedKey).not.toBe(b.wrappedKey)
  })

  it('refuses to open an envelope wrapped for a different master key', async () => {
    const mine = await generateMasterKeypair()
    const theirs = await generateMasterKeypair()
    const envelope = sealSecret('secret', theirs.publicKey)
    expect(() => openSecret(envelope, mine)).toThrow(/could not unwrap/i)
  })

  it('refuses an envelope whose ciphertext has been tampered with', async () => {
    const keys = await generateMasterKeypair()
    const envelope = sealSecret('secret', keys.publicKey)
    const flipped = Buffer.from(envelope.ciphertext, 'base64')
    flipped[0] ^= 0xff
    expect(() =>
      openSecret({ ...envelope, ciphertext: flipped.toString('base64') }, keys),
    ).toThrow(/could not decrypt/i)
  })

  // §20's rotation argument, asserted rather than assumed. If this test ever
  // needs `ciphertext` to change, envelope encryption has stopped being what
  // makes rotation cheap and the design has quietly reverted.
  it('re-wraps for a new master key WITHOUT touching the ciphertext', async () => {
    const oldKeys = await generateMasterKeypair()
    const newKeys = await generateMasterKeypair()
    const envelope = sealSecret('rotate me', oldKeys.publicKey)
    const rewrapped = rewrapSecret(envelope, oldKeys, newKeys.publicKey)

    expect(rewrapped.ciphertext).toBe(envelope.ciphertext)
    expect(rewrapped.nonce).toBe(envelope.nonce)
    expect(rewrapped.wrappedKey).not.toBe(envelope.wrappedKey)
    expect(openSecret(rewrapped, newKeys)).toBe('rotate me')
    expect(() => openSecret(rewrapped, oldKeys)).toThrow()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test -- secrets/envelope`

Expected: FAIL — `Cannot find module './envelope.js'`.

- [ ] **Step 3: Implement the envelope**

`packages/control-plane/src/secrets/envelope.ts`:

```ts
import sodium from 'libsodium-wrappers'

/**
 * §12: "Envelope-encrypted in Postgres (libsodium sealed box)."
 *
 * Two layers, and the reason is §20's: the PAYLOAD is encrypted with a fresh
 * per-secret data key, and only the DATA KEY is wrapped with the master key.
 * Rotation therefore re-wraps 32 bytes per secret and never touches the
 * ciphertext — "cheap enough to actually happen", which a scheme that
 * re-encrypts every plaintext is not.
 *
 * The wrap is a SEALED BOX, so wrapping needs only the master PUBLIC key. That
 * is not decoration: it means a future component that only writes secrets can
 * hold half the master key, and it costs nothing today.
 */
export interface SecretEnvelope {
  v: 1
  /** The data key, sealed to the master public key. base64. */
  wrappedKey: string
  /** secretbox nonce. base64. */
  nonce: string
  /** The payload under the data key. base64. */
  ciphertext: string
}

export interface MasterKeypair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

let ready: Promise<void> | undefined
/** libsodium is WASM and must be awaited once per process before any call. */
export async function sodiumReady(): Promise<void> {
  ready ??= sodium.ready
  return ready
}

export async function generateMasterKeypair(): Promise<MasterKeypair> {
  await sodiumReady()
  const kp = sodium.crypto_box_keypair()
  return { publicKey: kp.publicKey, privateKey: kp.privateKey }
}

export function sealSecret(plaintext: string, masterPublicKey: Uint8Array): SecretEnvelope {
  const dataKey = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES)
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    dataKey,
  )
  return {
    v: 1,
    wrappedKey: sodium.to_base64(
      sodium.crypto_box_seal(dataKey, masterPublicKey),
      sodium.base64_variants.ORIGINAL,
    ),
    nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
  }
}

export class SecretError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SecretError'
  }
}

function unwrap(envelope: SecretEnvelope, keys: MasterKeypair): Uint8Array {
  const b64 = (s: string) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL)
  let dataKey: Uint8Array
  try {
    dataKey = sodium.crypto_box_seal_open(b64(envelope.wrappedKey), keys.publicKey, keys.privateKey)
  } catch {
    // Distinguished from a decryption failure below, because the two mean
    // different things to an operator: this one is "wrong master key", which is
    // a configuration problem, and that one is "the row was altered".
    throw new SecretError(
      'SECRET_UNWRAP_FAILED',
      'could not unwrap the data key — this envelope was sealed for a different master key',
    )
  }
  return dataKey
}

export function openSecret(envelope: SecretEnvelope, keys: MasterKeypair): string {
  if (envelope.v !== 1) {
    throw new SecretError('SECRET_VERSION_UNKNOWN', `unknown envelope version ${envelope.v}`)
  }
  const b64 = (s: string) => sodium.from_base64(s, sodium.base64_variants.ORIGINAL)
  const dataKey = unwrap(envelope, keys)
  try {
    return sodium.to_string(
      sodium.crypto_secretbox_open_easy(b64(envelope.ciphertext), b64(envelope.nonce), dataKey),
    )
  } catch {
    throw new SecretError(
      'SECRET_DECRYPT_FAILED',
      'could not decrypt the secret — the stored ciphertext or nonce has been altered',
    )
  }
}

/** §20's rotation: re-wrap the data key, leave the ciphertext untouched. */
export function rewrapSecret(
  envelope: SecretEnvelope,
  from: MasterKeypair,
  toPublicKey: Uint8Array,
): SecretEnvelope {
  const dataKey = unwrap(envelope, from)
  return {
    ...envelope,
    wrappedKey: sodium.to_base64(
      sodium.crypto_box_seal(dataKey, toPublicKey),
      sodium.base64_variants.ORIGINAL,
    ),
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test -- secrets/envelope`

Expected: PASS, 6 tests.

- [ ] **Step 5: The table, the store, and the master key file**

`packages/control-plane/src/db/schema.ts` — §6's `Secret`, plus the unique key that makes `putSecret` idempotent:

```ts
/**
 * §6's Secret. `ciphertext` holds the whole SecretEnvelope as JSON — the
 * wrapped data key travels with the payload, because a wrapped key in a
 * separate column is a wrapped key that can be restored from a different
 * backup than its ciphertext.
 *
 * `environment_kind` is a column rather than a reference to `environments`
 * deliberately: §11's "a sandbox never receives staging or production secrets"
 * is a property of the KIND, and a secret must be storable for an environment
 * kind before that environment row exists.
 */
export const secrets = pgTable(
  'secrets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    environmentKind: environmentKind('environment_kind').notNull(),
    name: text('name').notNull(),
    ciphertext: jsonb('ciphertext').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('secrets_scope_name_key').on(t.projectId, t.environmentKind, t.name)],
)
```

`infra/lib/ensure-master-key.sh` mints `infra/secrets/master.key` (JSON, two base64 fields, mode 600) if absent, is called from `make up`, and `infra/secrets/` goes in `.gitignore`. **`make reset` must not remove it** — the same rule as the Caddy CA: destroying it makes every stored secret unrecoverable, which is not a reset.

`store.ts` implements `putSecret` as an upsert on that unique index, sets `rotatedAt` when a value changes, and `secretValuesFor` returns a `Map<name, plaintext>` — the input Task 8's redactor needs.

- [ ] **Step 6: The `process.env` scrub, and its call site**

§12: *"scrubbed from the control plane's own `process.env` at boot so that any child process it spawns cannot read them."* This is not theoretical — `build/context.ts` runs `git` and `tar` through `execFile`, and `runtime/docker/` shells out.

`packages/control-plane/src/secrets/scrub.ts`:

```ts
/**
 * The names whose VALUES are secrets. Listed explicitly rather than matched by
 * a pattern: a regex over `.*SECRET.*` would miss POSTGRES_PASSWORD and would
 * silently start deleting a variable somebody adds later for another purpose.
 */
export const SECRET_ENV_NAMES = [
  'MANIFEST_SESSION_SECRET',
  'MANIFEST_MASTER_SECRET',
  'MANIFEST_BUILD_CREDENTIAL_SECRET',
  'MANIFEST_DATABASE_URL',
  'MANIFEST_IDP_DATABASE_URL',
  'POSTGRES_PASSWORD',
  'LITELLM_MASTER_KEY',
  'LITELLM_SALT_KEY',
  'SSP_RO_PASSWORD',
  'SSP_ADMIN_PASSWORD',
  'SSP_SECRET_SALT',
] as const

/** Returns the names actually removed, so the boot line can say how many. */
export function scrubSecretEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const removed: string[] = []
  for (const name of SECRET_ENV_NAMES) {
    if (env[name] !== undefined) {
      delete env[name]
      removed.push(name)
    }
  }
  return removed
}
```

**The call site**, `src/index.ts`, immediately after `loadConfig()` — and the ordering is the whole point:

```ts
// loadConfig has read everything it needs; from here nothing may read these
// again from the environment. §12: a child process this server spawns — `git`
// in build/context.ts, `docker` anywhere in runtime/ — inherits process.env,
// and an app's build log is a place secrets end up.
const scrubbed = scrubSecretEnv()
```

with the boot line reporting `secretsScrubbed: scrubbed.length`.

- [ ] **Step 7: Run everything, twice**

Run: `pnpm test && pnpm test` then `pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check`

Expected: PASS, same count both runs. The database tests need `make up`.

- [ ] **Step 8: The negative controls**

```bash
# a) Make sealSecret reuse one data key across calls (hoist it out of the
#    function). Expected: "uses a fresh data key per secret" RED.
# b) Make rewrapSecret re-seal the payload as well as the key.
#    Expected: "re-wraps ... WITHOUT touching the ciphertext" RED. This is the
#    one that guards §20's rotation argument.
# c) Delete the `delete env[name]` line in scrubSecretEnv.
#    Expected: the scrub test RED.
# d) Point MANIFEST_SECRETS_MASTER_KEY at a second, freshly minted key file and
#    read an existing secret. Expected: SECRET_UNWRAP_FAILED, naming the master
#    key rather than the database — which is the message an operator needs.
```

- [ ] **Step 9: Commit**

```bash
git add packages/control-plane infra/lib/ensure-master-key.sh Makefile .gitignore
git commit -m "feat: secrets/ — libsodium envelope encryption, and the boot scrub

Per-secret data keys wrapped by the master key with crypto_box_seal, payloads
under crypto_secretbox_easy. rewrapSecret touches only the wrapped key, and a
test asserts the ciphertext is byte-identical afterwards — that property is
the whole of §20's argument that rotation is cheap enough to happen, so it is
asserted rather than assumed.

libsodium-wrappers rather than sodium-native: pnpm 11 makes an un-named
dependency build script a hard error and the WASM build declares none.

process.env is scrubbed at boot, after loadConfig, because build/context.ts
spawns git and every child inherits the environment (§12)."
```

---

## Task 5: Service credentials move from derivation to storage, without breaking a running database

**Files:**
- Modify: `packages/control-plane/src/services/credentials.ts`, `src/services/index.ts`
- Modify: `packages/control-plane/src/runtime/docker/services.ts`
- Test: `packages/control-plane/src/services/credentials.test.ts`, `src/runtime/docker/services.docker.test.ts`

**Interfaces:**
- Consumes: `putSecret` / `getSecret` from Task 4.
- Produces: `ensureServiceCredentials(db, keys, binding, masterSecret): Promise<{ username; password; database }>` — replacing the direct `deriveCredentials` call in `runtime/docker/services.ts`.

**This task exists because deleting `deriveCredentials` outright would break every developer's running database, and the failure would not look like a credentials problem.** `config.ts` already spells out the trap: *"a generated one makes every existing database reject this process and the failure reads as a Mongo fault."* Storing a freshly generated password for a service whose container already holds the derived one is the same failure by another route. Decision 8 is the migration: **stored if present, otherwise derive the P3 value and store that.**

**It is also `secrets/`'s first call site**, which is the point. A `secrets/` module that nothing calls is the defect this project has hit three times.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/services/credentials.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { withRollback } from '../db/testing.js'
import { deriveCredentials, ensureServiceCredentials } from './index.js'

const binding = { name: 'chem-labs-staging-db', type: 'mongo', projectSlug: 'chem-labs' }

describe('service credentials (§12 secrets, D3)', () => {
  it('adopts the DERIVED value the first time, so a running database keeps working', async () => {
    await withRollback(async (db, { projectId, keys, masterSecret }) => {
      const derived = deriveCredentials(masterSecret, binding)
      const got = await ensureServiceCredentials(db, keys, projectId, 'staging', binding, masterSecret)
      // Not a fresh random password. The Mongo container that already exists
      // holds the derived one, and nothing can change a running container's
      // root password — so a generated value here is an outage that reads as a
      // database fault (config.ts spells this out for the master secret).
      expect(got.password).toBe(derived.password)
    })
  })

  it('stores what it adopted, and returns the STORED value afterwards', async () => {
    await withRollback(async (db, { projectId, keys, masterSecret }) => {
      const first = await ensureServiceCredentials(db, keys, projectId, 'staging', binding, masterSecret)
      // A different master secret — as if .env had been regenerated. The stored
      // value must win, which is the entire point of storing it.
      const second = await ensureServiceCredentials(db, keys, projectId, 'staging', binding, 'x'.repeat(64))
      expect(second.password).toBe(first.password)
    })
  })

  it('scopes the secret to the environment kind, so staging and sandbox differ', async () => {
    await withRollback(async (db, { projectId, keys, masterSecret }) => {
      const staging = await ensureServiceCredentials(db, keys, projectId, 'staging', binding, masterSecret)
      const sandbox = await ensureServiceCredentials(
        db, keys, projectId, 'sandbox',
        { ...binding, name: 'chem-labs-sandbox-db' }, masterSecret,
      )
      // §11: "a sandbox never receives staging or production secrets" —
      // enforced by the key, not by remembering.
      expect(sandbox.password).not.toBe(staging.password)
    })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `make up && pnpm test -- services/credentials`

Expected: FAIL — `ensureServiceCredentials` is not exported.

- [ ] **Step 3: Implement it**

`packages/control-plane/src/services/credentials.ts`, keeping `deriveCredentials` exported and adding:

```ts
/**
 * §12 stores service credentials; P3 DERIVED them by HMAC from
 * MANIFEST_MASTER_SECRET. The change-over cannot be a cut-over.
 *
 * A Mongo container's root password is fixed when the container is created and
 * nothing can change it afterwards, so storing a freshly generated password for
 * a service that already exists produces an authentication failure that reads
 * as a database fault — the exact trap config.ts warns about for the master
 * secret itself. So: stored if present, otherwise ADOPT the derived value and
 * store that. New services get a random one. Within a deploy of every existing
 * service the derivation is dead, and `deriveCredentials` can then be removed
 * — but not in this plan, and not without checking.
 */
export async function ensureServiceCredentials(
  db: Db,
  keys: MasterKeypair,
  projectId: string,
  environmentKind: 'sandbox' | 'staging' | 'production',
  binding: Pick<ServiceBinding, 'name' | 'type' | 'projectSlug'>,
  masterSecret: string,
): Promise<{ username: string; password: string; database: string }> {
  const name = `service:${binding.name}:password`
  const stored = await getSecret(db, { projectId, environmentKind, name }, keys)
  const derived = deriveCredentials(masterSecret, binding)
  if (stored !== undefined) return { ...derived, password: stored }

  await putSecret(db, { projectId, environmentKind, name, value: derived.password }, keys)
  return derived
}
```

- [ ] **Step 4: Name the caller**

`runtime/docker/services.ts` calls `deriveCredentials` directly today. That call moves. **The driver has no database**, deliberately — §5 keeps `runtime/` free of `db/` — so the credentials are resolved by the caller and passed in: `ServiceBinding` gains `credentials: { username; password; database }`, and `deployRelease` (Task 9) fills it.

Grep afterwards and confirm the answer is exactly one line:

```bash
grep -rn 'deriveCredentials' packages/control-plane/src/
```

Expected: its definition, its own test, and `services/credentials.ts:ensureServiceCredentials`. **Nothing in `runtime/`.**

- [ ] **Step 5: Run everything**

Run: `pnpm test && pnpm test:docker -- services`

Expected: PASS. `services.docker.test.ts` constructs its own bindings, so it must now construct `credentials` too — and that is a real reduction in what the test proves, so add one assertion that a service created with a *stored* credential is connectable, not only one created with a derived one.

- [ ] **Step 6: The negative control**

```bash
# Make ensureServiceCredentials always generate a fresh random password.
# Expected: "adopts the DERIVED value the first time" RED. Then, more
# importantly, run it against a REAL existing Mongo container:
#   pnpm test:docker -- services
# and record the authentication error, so the next reader knows what this
# migration is protecting them from.
```

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/services packages/control-plane/src/runtime/docker/services.ts
git commit -m "feat: service credentials are stored, adopting the derived value first

§12 stores them; P3 derived them by HMAC. A cut-over would break every
existing database — a container's root password is fixed at creation, so a
freshly generated secret is an outage that reads as a Mongo fault. First call
adopts the derived value and stores it; the stored value wins from then on.

This is secrets/'s first call site, which is the point: a module with no
caller is not built, and that has now happened three times here."
```

---

## Task 6: Per-app SP keypairs

**Files:**
- Create: `packages/control-plane/src/sso/keypair.ts`, `keypair.test.ts`
- Modify: `packages/control-plane/src/sso/index.ts`

**Interfaces:**
- Consumes: `putSecret`/`getSecret` from Task 4.
- Produces:
  - `interface SpKeypair { privateKeyPem: string; certificatePem: string; certData: string; fingerprint: string; expiresAt: Date }`
  - `ensureSpKeypair(db, keys, { projectId, environmentKind, entityId }): Promise<SpKeypair>` — idempotent, generates once and returns the stored pair thereafter

**Why `certData` is a separate field from `certificatePem`.** S2 measured it: the metadata row wants the **base64 body with no PEM armour**. Storing both and naming them apart is what stops a `-----BEGIN CERTIFICATE-----` reaching `saml20_sp_remote`, where it fails at signature validation with a message about the certificate rather than about its encoding.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { X509Certificate } from 'node:crypto'
import { withRollback } from '../db/testing.js'
import { ensureSpKeypair } from './index.js'

describe('per-app SP keypairs (§9, D20)', () => {
  it('generates an RSA-4096 keypair whose certificate names the entityID', async () => {
    await withRollback(async (db, { projectId, keys }) => {
      const kp = await ensureSpKeypair(db, keys, {
        projectId, environmentKind: 'staging',
        entityId: 'https://manifest.internal/sp/chem-labs/staging',
      })
      const cert = new X509Certificate(kp.certificatePem)
      // §9: "an RSA-4096 keypair". Assert the MODULUS, not that a PEM arrived.
      expect(cert.publicKey.asymmetricKeyDetails?.modulusLength).toBe(4096)
      expect(cert.subject).toContain('chem-labs')
    })
  })

  it('is idempotent — the second call returns the SAME key', async () => {
    await withRollback(async (db, { projectId, keys }) => {
      const scope = {
        projectId, environmentKind: 'staging' as const,
        entityId: 'https://manifest.internal/sp/chem-labs/staging',
      }
      const first = await ensureSpKeypair(db, keys, scope)
      const second = await ensureSpKeypair(db, keys, scope)
      // A regenerated keypair silently invalidates the certData already in the
      // metadata row, and the symptom is "Invalid certificate signature" on a
      // login that worked yesterday (S2 Evidence 8).
      expect(second.certData).toBe(first.certData)
      expect(second.privateKeyPem).toBe(first.privateKeyPem)
    })
  })

  it('gives sandbox and staging DIFFERENT keys for one project', async () => {
    await withRollback(async (db, { projectId, keys }) => {
      const staging = await ensureSpKeypair(db, keys, {
        projectId, environmentKind: 'staging',
        entityId: 'https://manifest.internal/sp/chem-labs/staging',
      })
      const sandbox = await ensureSpKeypair(db, keys, {
        projectId, environmentKind: 'sandbox',
        entityId: 'https://manifest.internal/sp/chem-labs/sandbox',
      })
      // §9: "per app+environment ... so that a compromise is contained to a
      // single application" — and §11's sandbox rule on top.
      expect(sandbox.certData).not.toBe(staging.certData)
    })
  })

  it('emits certData with NO PEM armour and no newlines', async () => {
    await withRollback(async (db, { projectId, keys }) => {
      const kp = await ensureSpKeypair(db, keys, {
        projectId, environmentKind: 'staging',
        entityId: 'https://manifest.internal/sp/chem-labs/staging',
      })
      // S2: the row takes the base64 BODY. Armour in the row fails validation
      // with a message about the certificate, not about its encoding.
      expect(kp.certData).not.toContain('BEGIN CERTIFICATE')
      expect(kp.certData).not.toContain('\n')
      expect(kp.certData).toMatch(/^[A-Za-z0-9+/=]+$/)
    })
  })

  it('records an expiry §9 can alert on', async () => {
    await withRollback(async (db, { projectId, keys }) => {
      const kp = await ensureSpKeypair(db, keys, {
        projectId, environmentKind: 'staging',
        entityId: 'https://manifest.internal/sp/chem-labs/staging',
      })
      const years = (kp.expiresAt.getTime() - Date.now()) / (365 * 24 * 3600 * 1000)
      // §9: saml-metadata-generator issues one to five years; D20 tracks the
      // date and alerts from 90 days out. Two years locally.
      expect(years).toBeGreaterThan(1.9)
      expect(years).toBeLessThan(2.1)
    })
  })
})
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm test -- sso/keypair`, expected FAIL on the missing export.

- [ ] **Step 3: Implement it** with `node:crypto`'s `generateKeyPairSync('rsa', { modulusLength: 4096 })` and a self-signed certificate. Store the private key **and** the certificate as two secrets named `sp:{environmentKind}:privateKey` and `sp:{environmentKind}:certificate`, so the private key never has to be re-derived from anything.

- [ ] **Step 4: Run it and watch it pass** — five tests.

- [ ] **Step 5: The negative controls**

```bash
# a) Drop the modulus to 2048. Expected: the first test RED, naming 2048.
# b) Make ensureSpKeypair always generate. Expected: the idempotence test RED.
# c) Return the armoured PEM as certData. Expected: the armour test RED — and
#    Task 7's registration test will also go red, which is the pairing that
#    matters.
```

- [ ] **Step 6: Commit** — `feat: per-app, per-environment SP keypairs, stored as Secrets`.

---

## Task 7: `sso/` — the derived registration, and one row

**Files:**
- Create: `packages/control-plane/src/sso/entity.ts`, `entity.test.ts`
- Create: `packages/control-plane/src/sso/metadata-store.ts`, `metadata-store.docker.test.ts`
- Create: `packages/control-plane/src/sso/registration.ts`, `registration.test.ts`
- Modify: `packages/control-plane/src/sso/index.ts`, `src/config.ts`, `.env.example`, `packages/control-plane/vitest.env.ts`

**Interfaces:**
- Consumes: `ensureSpKeypair` (Task 6); `ManifestSpec` and `ResolvedConfig` from `spec/`.
- Produces:
  - `deriveSpEntity(input): SpEntity` — pure, every value §9's D15 table names
  - `interface SpEntity { entityId; acsUrl; sloUrl; attributes: string[] }`
  - `renderSpMetadata(entity: SpEntity, keypair: SpKeypair): SpMetadataRow` — the `entity_data` object S2 recorded
  - `upsertSpRow(pool, entityId, entityData)`, `deleteSpRow(pool, entityId)`, `readSpRow(pool, entityId)`
  - `registerServiceProvider(db, pool, keys, input): Promise<SpRegistration>`, where
    `SpRegistration = { entity: SpEntity; keypair: SpKeypair; changed: boolean; previousAcsUrl?: string }`.
    **Task 9 consumes it as a BOUND dependency** — `createSsoRegistrar(pool, keys)` returns
    `{ registerServiceProvider(input): Promise<SpRegistration> }`, so `releases/` never holds the
    pool or the master key and `ServerDeps` gains one field rather than three.

**The security argument this task implements, in one line from §9:** *"Origins are never accepted as input. The app supplies a path; Manifest supplies the origin… A free-text ACS URL is an assertion-phishing primitive."* Every field below is derived; the spec contributes two **paths** and a list of attribute names, and nothing else.

- [ ] **Step 1: Write the failing test for the derivation**

`packages/control-plane/src/sso/entity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveSpEntity, SpEntityError } from './index.js'

const base = {
  slug: 'chem-labs',
  environmentKind: 'staging' as const,
  hostname: 'chem-labs.staging.manifest.internal',
  entityBase: 'https://manifest.internal',
  auth: {
    provider: 'cwl' as const,
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
    attributes: ['ubcEduCwlPuid', 'mail'],
  },
}

describe('D15 derivation — Manifest supplies every origin (§9)', () => {
  it('derives the entityID, ACS and SLO from the slug, kind and hostname', () => {
    expect(deriveSpEntity(base)).toEqual({
      entityId: 'https://manifest.internal/sp/chem-labs/staging',
      acsUrl: 'https://chem-labs.staging.manifest.internal/auth/ubcshib/callback',
      sloUrl: 'https://chem-labs.staging.manifest.internal/auth/logout',
      attributes: ['ubcEduCwlPuid', 'mail'],
    })
  })

  it('refuses a callback that carries an origin, rather than joining it', () => {
    // The assertion-phishing primitive §9 names. spec/schema.ts already refuses
    // this at parse time with AUTH_PATH; this is the SECOND independent read of
    // the same rule, because a guard whose condition is written twice is a
    // guard, and the one time it was written once here it was one line from
    // being live (P2's /auth/dev-login).
    expect(() =>
      deriveSpEntity({ ...base, auth: { ...base.auth, callback: 'https://evil.example/acs' } }),
    ).toThrow(SpEntityError)
  })

  it.each(['//evil.example/acs', '/../../x', '/acs?next=https://evil.example'])(
    'refuses the callback %s',
    (callback) => {
      expect(() => deriveSpEntity({ ...base, auth: { ...base.auth, callback } })).toThrow(
        SpEntityError,
      )
    },
  )

  it('refuses an empty attribute list before anything is written', () => {
    // §9: the one field governing what personal information leaves the IdP is
    // the one field whose absence is silently permissive (S2 Evidence 12). This
    // is the first of the two independent reads; Task 2's CHECK constraint is
    // the second.
    expect(() =>
      deriveSpEntity({ ...base, auth: { ...base.auth, attributes: [] } }),
    ).toThrow(/attributes/i)
  })

  it('keeps the entityID inside the column it has to fit', () => {
    // S2: entity_id is VARCHAR(255). A 39-character slug is legal under §7.
    const long = deriveSpEntity({ ...base, slug: 'a'.repeat(39) })
    expect(long.entityId.length).toBeLessThan(255)
  })

  it('puts the environment kind in the entityID, never only in the zone', () => {
    const staging = deriveSpEntity(base)
    const sandbox = deriveSpEntity({
      ...base, environmentKind: 'sandbox',
      hostname: 'chem-labs.sandbox.manifest.internal',
    })
    // Two environments of one project must be two SPs, or an assertion minted
    // for sandbox is replayable at staging.
    expect(sandbox.entityId).not.toBe(staging.entityId)
  })
})
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm test -- sso/entity`.

- [ ] **Step 3: Implement `entity.ts`**, re-validating the paths against `AUTH_PATH` from `spec/index.js` rather than a second copy of the regex, and refusing an empty attribute list.

- [ ] **Step 4: `renderSpMetadata` — the row S2 proved**

Implement it against **S2's worked registration verbatim**, which is reproduced in that findings note precisely so this function does not have to be invented:

```ts
/**
 * The `entity_data` value. Every key here is from S2's worked registration —
 * the one row that produced a complete login with enforced attribute release,
 * a per-app keypair, signed AuthnRequests and OID attribute naming.
 *
 * `authproc` at 60 with an INLINE OID for ubcEduCwlPuid: SimpleSAMLphp ships no
 * UBC attribute map (`grep -r ubcEdu attributemap/` returns nothing), so the
 * OID has to be supplied here. It must be 1.3.6.1.4.1.60.6.1.6 — the value
 * passport-ubcshib maps; P1's authsources.php shipped .60.1.1.1 and nothing
 * could read the attribute (measured 2026-09-07, fixed in Task 2).
 */
export function renderSpMetadata(entity: SpEntity, keypair: SpKeypair): SpMetadataRow {
  return {
    AssertionConsumerService: [
      {
        index: 0,
        Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
        Location: entity.acsUrl,
      },
    ],
    SingleLogoutService: [
      {
        Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
        Location: entity.sloUrl,
      },
    ],
    NameIDFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
    'simplesaml.attributes': true,
    attributes: entity.attributes,
    'attributes.NameFormat': 'urn:oasis:names:tc:SAML:2.0:attrname-format:uri',
    authproc: {
      60: { class: 'core:AttributeMap', 0: 'name2oid', ubcEduCwlPuid: 'urn:oid:1.3.6.1.4.1.60.6.1.6' },
    },
    'saml20.sign.assertion': true,
    'saml20.sign.response': true,
    // §9: "Both must be `true` in staging and production... requiring signed
    // AuthnRequests costs nothing" — Manifest mints the keypair anyway.
    'validate.authnrequest': true,
    'validate.logout': true,
    certData: keypair.certData,
  }
}
```

- [ ] **Step 5: The metadata store, and its own connection**

`config.ts` gains `MANIFEST_IDP_DATABASE_URL` as **required** (Decision 13). Three callers must be updated in the same commit or the whole suite goes red: `api/testing.ts`'s `testDeps`, `vitest.env.ts`'s `ensureDatabaseUrl`, and `.env.example`. `metadata-store.ts` owns a `pg` pool over it and writes through **parameterized statements only** — §9 names that specifically, and this is the one place the control plane writes to a database SimpleSAMLphp reads.

`metadata-store.docker.test.ts` asserts a round trip, that the CHECK constraint from Task 2 rejects an empty list *through this code path*, and that `deleteSpRow` is idempotent.

- [ ] **Step 6: `registerServiceProvider`, and what it returns**

It composes the three: derive, ensure the keypair, upsert the row. It returns `changed` and `previousAcsUrl` because **Task 8 alerts on an ACS change specifically** (§9) and cannot detect one after the write.

- [ ] **Step 7: Run it all, twice** — `pnpm test && pnpm test && pnpm test:docker -- sso`.

- [ ] **Step 8: The negative controls**

```bash
# a) Let deriveSpEntity join the callback with `new URL(callback, origin)`.
#    Expected: the origin test RED. Record the entityId it produced — an ACS at
#    an attacker's origin is what §9 calls an assertion-phishing primitive.
# b) Drop `validate.authnrequest` from the row. Expected: no test goes red yet.
#    Add one to Task 3's login suite that signs with the WRONG key and expects
#    a refusal, then watch THAT go red. S2 Evidence 8 has both controls.
# c) Change the inline OID to 1.3.6.1.4.1.60.1.1.1.
#    Expected: Task 3's attribute assertions RED.
```

Control (b) is a real gap found while writing this task: nothing else in the plan proves `validate.authnrequest` is in force. Add the test.

- [ ] **Step 9: Commit** — `feat: sso/ derives an SP registration and writes one row`.

---

## Task 8: Events, append-only by grant, and redaction at capture

**Files:**
- Create: `packages/control-plane/src/observability/events.ts`, `redact.ts`, `index.ts`, and their tests
- Modify: `packages/control-plane/drizzle/0001_secrets_and_events.sql`, `src/db/schema.ts`

**Interfaces:**
- Consumes: `secretValuesFor` (Task 4).
- Produces:
  - `recordEvent(db, { projectId, subject, type, machineDetail, humanMessage }, redactor): Promise<Event>`
  - `makeRedactor(secretValues: Iterable<string>): (value: unknown) => unknown`
  - `EVENT_TYPES` — the closed set P4a writes

**Two things here are load-bearing and neither is the table.** First, §20 requires the `events` table be append-only **by grant** — *"the application role holds no `UPDATE` or `DELETE` privilege on it"* — not by convention, so the migration owns a `REVOKE`. Second, §14 requires redaction **at capture**: *"the unredacted form is never persisted."* That means the redactor runs inside `recordEvent`, before the insert, and there is no code path that writes an event without it.

**P4a ships the exact-match half only** (Decision 11): every value in the app's own secret set, replaced. The entropy and pattern heuristics, and LiteLLM's error bodies, are P4b's.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { withRollback } from '../db/testing.js'
import { makeRedactor, recordEvent } from './index.js'

describe('redaction at capture (§14)', () => {
  it('replaces a secret wherever it appears, at any depth', () => {
    const redact = makeRedactor(['hunter2', 'sk-abc123'])
    expect(
      redact({
        uri: 'mongodb://app:hunter2@db:27017/x',
        nested: { key: 'Bearer sk-abc123' },
        list: ['hunter2'],
      }),
    ).toEqual({
      uri: 'mongodb://app:[REDACTED]@db:27017/x',
      nested: { key: 'Bearer [REDACTED]' },
      list: ['[REDACTED]'],
    })
  })

  it('ignores a very short secret rather than redacting the whole document', () => {
    // A one-character secret would replace every occurrence of that character.
    // Refusing to use it is safer than a document redacted into uselessness —
    // and the refusal is visible, which a mangled document is not.
    const redact = makeRedactor(['a', 'hunter2'])
    expect(redact('a cat named hunter2')).toBe('a cat named [REDACTED]')
  })

  it('never persists the unredacted form', async () => {
    await withRollback(async (db, { projectId }) => {
      const redact = makeRedactor(['STUDENT-PII-CANARY'])
      await recordEvent(
        db,
        {
          projectId,
          subject: 'instance:abc',
          type: 'instance.failed',
          machineDetail: { stderr: 'connect failed: STUDENT-PII-CANARY' },
          humanMessage: 'Your app could not start.',
        },
        redact,
      )
      // Search the whole row, not the field we expect it in. §14's rule is
      // about what is persisted, and a canary in `human_message` is just as
      // persisted as one in `machine_detail`.
      const [row] = await db.select().from(events)
      expect(JSON.stringify(row)).not.toContain('STUDENT-PII-CANARY')
      expect(JSON.stringify(row)).toContain('[REDACTED]')
    })
  })

  it('carries a faculty-legible message alongside the machine detail', async () => {
    // §14's first bullet. A row with only machine_detail is a row a faculty
    // member cannot act on, and P3 measured what that costs: a failed build
    // recorded `failed` and nothing else.
    await withRollback(async (db, { projectId }) => {
      await expect(
        recordEvent(db, {
          projectId, subject: 'sp:chem-labs:staging', type: 'sso.registered',
          machineDetail: {}, humanMessage: '',
        }, (v) => v),
      ).rejects.toThrow(/human_message/i)
    })
  })
})

describe('audit integrity (§20)', () => {
  it('refuses an UPDATE and a DELETE at the GRANT level, not in code', async () => {
    await withRollback(async (db, { projectId }) => {
      await recordEvent(db, { projectId, subject: 's', type: 'sso.registered',
        machineDetail: {}, humanMessage: 'Registered.' }, (v) => v)
      // Raw SQL deliberately: a code-level guard is a convention, and §20 says
      // "append-only by grant, not by convention". This asserts the grant.
      await expect(db.execute(sql`UPDATE events SET human_message = 'x'`)).rejects.toThrow(
        /permission denied/i,
      )
      await expect(db.execute(sql`DELETE FROM events`)).rejects.toThrow(/permission denied/i)
    })
  })
})
```

- [ ] **Step 2: Run them and watch them fail** — `make up && pnpm test -- observability`.

- [ ] **Step 3: The migration, including the REVOKE**

```sql
-- §20: "The `events` table is append-only BY GRANT, not by convention: the
-- application role holds no UPDATE or DELETE privilege on it."
--
-- The role is the one the control plane connects as. Locally that is `manifest`,
-- which OWNS the table — and an owner's privileges cannot be revoked from
-- itself. So the table is owned by a separate role and the application is
-- granted INSERT and SELECT only. Without this the REVOKE below is a no-op that
-- reads exactly like a control.
CREATE ROLE manifest_audit_owner NOLOGIN;
ALTER TABLE events OWNER TO manifest_audit_owner;
REVOKE ALL ON events FROM manifest;
GRANT SELECT, INSERT ON events TO manifest;
```

**That comment is the finding, not decoration.** A `REVOKE UPDATE ON events FROM manifest` while `manifest` owns the table changes nothing, the test above passes on a broken control only if it is written to assert the message rather than the failure — so run the negative control in Step 6 and watch it.

- [ ] **Step 4: Implement `redact.ts` and `events.ts`** — the redactor walks strings, arrays and plain objects, skips secrets shorter than 6 characters, and `recordEvent` refuses an empty `humanMessage`.

- [ ] **Step 5: Name the callers**

Two, both in `sso/registration.ts`, added here rather than left for later.

**Where `redact` comes from**, stated because three call sites need it and an
invented answer at each is three answers: `registerServiceProvider` builds one per
call from the app's own secret set —
`const redact = makeRedactor(await secretValuesFor(db, { projectId, environmentKind }, keys))`.
That is what Task 4 means by *"the input to Task 8's redactor"*. It stays a
**parameter** of `recordEvent` rather than a bound dependency, so `recordEvent` has
no way to write an unredacted row even by accident.

```ts
// §9: "Every registration and change is an append-only audit Event, with
// alerting specifically on ACS URL changes."
await recordEvent(db, {
  projectId, subject: `sp:${slug}:${environmentKind}`, type: 'sso.registered',
  machineDetail: { entityId: entity.entityId, attributes: entity.attributes },
  humanMessage: `Single sign-on was set up for ${slug} in ${environmentKind}.`,
}, redact)

if (result.previousAcsUrl && result.previousAcsUrl !== entity.acsUrl) {
  await recordEvent(db, {
    projectId, subject: `sp:${slug}:${environmentKind}`, type: 'sso.acs_changed',
    machineDetail: { from: result.previousAcsUrl, to: entity.acsUrl },
    humanMessage: `Where ${slug} receives sign-in responses has changed.`,
  }, redact)
}
```

`grep -rn 'recordEvent' packages/control-plane/src/` must show these two plus the module and its test. An events table with no writer is the defect this project has hit three times.

- [ ] **Step 6: The negative controls**

```bash
# a) Restore `manifest` as the table's owner and keep only the REVOKE.
#    Expected: the append-only test RED — the UPDATE succeeds. This is the
#    control that proves the grant does something.
# b) Call recordEvent with the identity function as its redactor from a route.
#    Expected: "never persists the unredacted form" RED.
# c) Remove the length floor in makeRedactor and pass a one-character secret.
#    Expected: the short-secret test RED, with a document redacted to noise.
```

- [ ] **Step 7: Commit** — `feat: events, append-only by grant, with redaction at capture`.

---

## Task 9: The registration call site — `deployRelease` sets up sign-on before the app starts

**Files:**
- Modify: `packages/control-plane/src/releases/release.ts`, `src/api/server.ts` (deps), `src/index.ts`
- Test: `packages/control-plane/src/releases/releases.test.ts`, `src/runtime/docker/roundtrip.docker.test.ts`

**Interfaces:**
- Consumes: `registerServiceProvider` (Task 7), `ensureServiceCredentials` (Task 5).
- Produces: `deployRelease` registering an SP for every environment whose resolved spec has `auth.provider === 'cwl'`, before `ensureInstance`.
- **Signature change, called out because every caller and test must move with it:** P3's
  `deployRelease(db, driver, config, input, healthWait?)` becomes
  `deployRelease(db, driver, config, deps, input, healthWait?)`, where
  `deps = { sso: SsoRegistrar; secrets: SecretStore }`. Threading them through arguments rather
  than importing them keeps `releases/` testable with no database and no IdP, which is what
  makes §16's fake-driver tier worth having.

**This task is here because of the roadmap's second lesson, and it is deliberately small.** `waitForReady` and `edgeProbe` shipped in P3 Task 14 with passing tests and nothing called them until Task 17; `isSensitiveDiff` shipped in P2 and waited a whole plan. Tasks 6, 7 and 8 have the same shape — modules with tests and no production caller — so this task exists purely to give them one, and its acceptance is a `grep`.

**Ordering matters and is asserted.** The SP must exist before the container starts: an app that comes up and redirects a user to the IdP before the row is written gets "Metadata not found" on its first login, which is a real user-visible failure for a race nobody would reproduce.

- [ ] **Step 1: Write the failing test**

```ts
it('registers the SP BEFORE the instance starts', async () => {
  const order: string[] = []
  const driver = createFakeDriver({ onEnsureInstance: () => order.push('instance') })
  const sso = { registerServiceProvider: async () => { order.push('sp'); return stubResult } }
  await deployRelease(db, driver, config, { ...deps, sso }, input)
  // Not "both happened" — the ORDER. An app that redirects to the IdP before
  // the row exists gets "Metadata not found" on its first login, which is a
  // race nobody reproduces on demand.
  expect(order).toEqual(['sp', 'instance'])
})

it('does not register an SP for an app that declares auth.provider: none', async () => {
  // fixture-node is such an app, and P3's whole Docker tier deploys it. An
  // unconditional registration would put a useless row in the IdP for every
  // app on the platform — and would make Task 7's empty-attributes refusal
  // fire on a spec that is perfectly valid, because `auth.attributes` defaults
  // to [] when the provider is `none` (spec/schema.ts).
  const calls: string[] = []
  const sso = {
    registerServiceProvider: async (input: { entityId: string }) => {
      calls.push(input.entityId)
      return stubResult
    },
  }
  const release = await releaseWithSpec({ auth: { provider: 'none' } })
  await deployRelease(db, createFakeDriver(), config, { ...deps, sso }, {
    releaseId: release.id,
    environmentId: staging.id,
  })
  expect(calls).toEqual([])
})
```

- [ ] **Step 2: Run it and watch it fail** — the order comes back `['instance']`.

- [ ] **Step 3: Wire it**, threading an `sso` dependency through `ServerDeps` and `src/index.ts` the way `source` and `blueprints` already are.

- [ ] **Step 4: The grep that is this task's real acceptance**

```bash
grep -rn 'registerServiceProvider\|ensureSpKeypair\|ensureServiceCredentials' \
  packages/control-plane/src/ --include='*.ts' | grep -v '\.test\.ts' | grep -v '/sso/\|/services/'
```

Expected: at least one line in `releases/release.ts` per function. **An empty result means this task did not happen**, whatever the tests say.

- [ ] **Step 5: Run everything** — `pnpm test && pnpm test && pnpm test:docker`.

- [ ] **Step 6: The negative control**

```bash
# Move registerServiceProvider to AFTER ensureInstance.
# Expected: the ordering test RED. Then delete the call entirely: expected,
# the ordering test RED with ['instance']. Both, because "called late" and
# "not called" are different defects and this project has shipped the second
# three times.
```

- [ ] **Step 7: Commit** — `feat: deployRelease registers the SP before the app starts`.

---

## Task 10: `spec/injection.ts` — §8's frozen table, as one function

**Files:**
- Create: `packages/control-plane/src/spec/injection.ts`, `injection.test.ts`
- Modify: `packages/control-plane/src/spec/index.ts`

**Interfaces:**
- Consumes: `ResolvedConfig` from `spec/resolve.ts`; nothing else — it is a pure function, which is what puts it in §16's unit tier.
- Produces:
  - `INJECTION_CONTRACT_VERSION = 'v1'` — the value `blueprint.yaml`'s `injection.contract` must equal
  - `InjectionContext`, fully typed — **this shape is consumed by Task 11's call site, Task 13's drift test and P4b, so it is written out here rather than left to the implementer:**

    ```ts
    export interface InjectionContext {
      /** The parsed manifest. Task 11 loads it from the release's AppSpec row. */
      spec: ManifestSpec
      /** That environment's view of it, from `resolveConfig`. */
      resolved: ResolvedConfig
      environmentKind: 'sandbox' | 'staging' | 'production'
      /** The app's own hostname, e.g. `chem-labs.staging.manifest.internal`. */
      hostname: string
      projectSlug: string
      /** From `config.idp` — see the New configuration table above. */
      idp: { entityId: string; baseUrl: string; spEntityBase: string }
      /** Absent when `auth.provider` is `none`; Task 7's derivation when it is `cwl`. */
      spEntity?: SpEntity
      /** Container-side PATHS and the session secret, never the key material. */
      secrets: {
        sessionSecret: string
        /** Mounted by the driver; absent in sandbox, where the SP key is optional. */
        spPrivateKeyPath?: string
        idpCertPath: string
      }
      /** What `ensureService` returned, in declaration order. */
      services: ServiceHandle[]
    }
    ```
  - `renderInjection(ctx: InjectionContext): Record<string, string>`
  - `INJECTION_VARIABLES: readonly InjectionVariable[]` — the table as **data**, which is what Task 13's drift test reads
  - `assertNoReservedEnvNames(resolved: ResolvedConfig): void` — throws `SPEC_ENV_NAME_RESERVED`.
    Defined here because it reads `INJECTION_VARIABLES`; **called from `spec/policy.ts` in Task 11**,
    so a faculty member is told at validation rather than discovering their `PORT` does nothing.

**Why this lives in `spec/` and not a module of its own.** §8 says so directly: *"The `spec/` module owns the mapping from a declared service to its full variable set, and that mapping is versioned with the blueprint."* The roadmap's workspace layout has no `injection/` module, and inventing one would put §5's boundary rule between a spec and its own rendering.

**Why the table is exported as data.** §16's drift tier asserts *"every variable the blueprint reads is injected"*. A drift test that reads a hand-maintained list asserts that two hand-maintained lists agree — which is the failure §8 already had once, *"from being written against memory of the libraries rather than against them"*. Exporting `INJECTION_VARIABLES` means the test compares the **renderer's own table** against the **blueprint's actual source**, and neither is a copy of the other.

**This is where §8's real exposure sits.** The roadmap's P4 lesson names it: *"§8's injection contract is precisely a set of values two code paths must agree on"*, and Session 5's seven defects were all one shape — the test constructs the value correctly and the running system re-derives it wrongly. So `renderInjection` is the **only** thing that produces these names anywhere, and Task 11 deletes the ad-hoc block in `deployRelease` rather than adding beside it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { INJECTION_VARIABLES, renderInjection, InjectionError } from './index.js'

const ctx = () => ({ /* a staging chem-labs with mongo, cwl auth, no ai */ })

describe('§8 injection contract', () => {
  it('injects every variable the table marks required-in-all', () => {
    const env = renderInjection(ctx())
    for (const v of INJECTION_VARIABLES.filter((x) => x.requiredIn === 'all')) {
      expect(env, `missing ${v.name}`).toHaveProperty(v.name)
      expect(env[v.name], `${v.name} is empty`).not.toBe('')
    }
  })

  it('never leaves SAML_ENVIRONMENT unset', () => {
    // §8 spends a paragraph on this and §16 carries a regression for it: the
    // library defaults it to 'STAGING' at index.js:120 AND :307, so an app
    // deployed without it points at https://authentication.stg.id.ubc.ca —
    // real UBC infrastructure.
    expect(renderInjection(ctx()).SAML_ENVIRONMENT).toBe('LOCAL')
    expect(renderInjection({ ...ctx(), environmentKind: 'production' }).SAML_ENVIRONMENT).toBe(
      'PRODUCTION',
    )
  })

  it('derives SAML_CALLBACK_URL as MANIFEST_APP_URL + auth.callback (D15)', () => {
    const env = renderInjection(ctx())
    expect(env.SAML_CALLBACK_URL).toBe(`${env.MANIFEST_APP_URL}/auth/ubcshib/callback`)
  })

  it('produces MORE THAN ONE variable for a declared mongo service', () => {
    // §8: "A service declaration produces more than one variable. services[].name
    // is a convenience label, not a variable name." Measured 2026-09-07:
    // deployRelease injected MONGODB_URI alone, and every app fell back to a
    // database called `app` — while two Docker tests set MONGODB_DB_NAME
    // themselves and passed.
    const env = renderInjection(ctx())
    expect(env.MONGODB_URI).toContain('mongodb://')
    expect(env.MONGODB_DB_NAME).toBe('chem_labs')
  })

  // §16's identity-path regression tier names these two directly, and getting
  // either backwards points a real cohort at the wrong identity provider.
  it('never resolves a production environment to the Manifest IdP', () => {
    const env = renderInjection({ ...ctx(), environmentKind: 'production' })
    expect(env.SAML_IDP_METADATA_URL).toBe('https://authentication.ubc.ca/idp/shibboleth')
    expect(env.SAML_IDP_METADATA_URL).not.toContain('manifest.internal')
  })

  it('never resolves sandbox or staging to real UBC Shibboleth', () => {
    for (const kind of ['sandbox', 'staging'] as const) {
      const env = renderInjection({ ...ctx(), environmentKind: kind })
      expect(env.SAML_IDP_METADATA_URL).toContain('idp.manifest.internal')
      expect(env.SAML_ENTRY_POINT).not.toContain('ubc.ca')
      // The stg host specifically: it is what the library defaults to, so a
      // sandbox pointed there is the exact failure §8 spends a paragraph on.
      expect(env.SAML_ENTRY_POINT).not.toContain('authentication.stg.id.ubc.ca')
    }
  })

  it('injects the SP paths only when auth.provider is cwl', () => {
    const none = renderInjection({ ...ctx(), spec: withAuthProvider('none') })
    expect(none).not.toHaveProperty('SAML_ISSUER')
    expect(none).not.toHaveProperty('SAML_IDP_CERT_PATH')
  })

  it('requires SAML_PRIVATE_KEY_PATH in staging and production, not in sandbox', () => {
    // §8's "Required in" column, which is not decoration: the Manifest IdP
    // requires signed AuthnRequests in staging (§9) and real UBC encrypts
    // assertions.
    expect(renderInjection(ctx())).toHaveProperty('SAML_PRIVATE_KEY_PATH')
    expect(renderInjection({ ...ctx(), environmentKind: 'sandbox' })).not.toHaveProperty(
      'SAML_PRIVATE_KEY_PATH',
    )
  })

  it('refuses to render an AI row, naming P4b', () => {
    // Decision 12. P4a has no LiteLLM client, so a spec with ai.models must
    // fail loudly rather than deploy with LLM_API_KEY unset — an app that
    // starts and cannot reach a model is a support ticket, not an error.
    expect(() => renderInjection({ ...ctx(), spec: withModels(['default-chat']) })).toThrow(
      /INJECTION_AI_UNSUPPORTED/,
    )
  })

  it('never lets the app shadow a platform binding', () => {
    // P3 established the ordering in deployRelease and gave it a test; this
    // asserts it inside the renderer, so the rule survives the ad-hoc block
    // being deleted in Task 11.
    const env = renderInjection({
      ...ctx(),
      resolved: withEnv([{ name: 'MONGODB_URI', value: 'mongodb://attacker/' }]),
    })
    expect(env.MONGODB_URI).not.toContain('attacker')
  })

  it('rejects an app variable whose name collides with a platform one', () => {
    // Silently overwriting is right for the SECURITY property above and wrong
    // for the faculty member, who wrote a variable that does nothing. The spec
    // is validated long before a deploy, so this is where they can be told.
    expect(() =>
      assertNoReservedEnvNames(withEnv([{ name: 'PORT', value: '9000' }])),
    ).toThrow(/PORT is set by the platform/)
  })
})
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm test -- spec/injection`.

- [ ] **Step 3: Implement the table as data**

```ts
/**
 * §8's table, and it is FROZEN — the spec's word. Every row below is copied
 * from it, with the "Required in" column as `requiredIn`.
 *
 * As DATA rather than as a series of assignments, because Task 13's drift test
 * compares this against what the blueprint actually reads. A test comparing two
 * hand-maintained lists asserts only that somebody updated both, and §8 was
 * already wrong once "from being written against memory of the libraries
 * rather than against them".
 */
export interface InjectionVariable {
  name: string
  requiredIn: 'all' | 'staging+production' | 'if-service' | 'if-ai'
  /** Which declaration makes it appear, for the ones that are conditional. */
  when?: 'auth.provider=cwl' | 'services.mongo' | 'services.qdrant' | 'ai.models'
  note?: string
}

export const INJECTION_VARIABLES: readonly InjectionVariable[] = [
  { name: 'MANIFEST_ENV', requiredIn: 'all' },
  { name: 'MANIFEST_APP_URL', requiredIn: 'all' },
  { name: 'MANIFEST_PROJECT_SLUG', requiredIn: 'all' },
  { name: 'PORT', requiredIn: 'all' },
  { name: 'SESSION_SECRET', requiredIn: 'all' },
  {
    name: 'SAML_ENVIRONMENT', requiredIn: 'all', when: 'auth.provider=cwl',
    note: 'NEVER unset. Defaults to STAGING at index.js:120 AND :307, which points a deploy at real UBC infrastructure.',
  },
  { name: 'SAML_ISSUER', requiredIn: 'all', when: 'auth.provider=cwl' },
  { name: 'SAML_CALLBACK_URL', requiredIn: 'all', when: 'auth.provider=cwl' },
  {
    name: 'SAML_ENTRY_POINT', requiredIn: 'all', when: 'auth.provider=cwl',
    note: "UBC_CONFIG.LOCAL hardcodes SimpleSAMLphp 1.x paths (/simplesaml/saml2/idp/SSOService.php). 2.x serves /module.php/saml/idp/singleSignOnService — measured off the running container 2026-09-07.",
  },
  { name: 'SAML_LOGOUT_URL', requiredIn: 'all', when: 'auth.provider=cwl',
    note: "the library's logout() reads this from ENV, not options" },
  { name: 'SAML_IDP_METADATA_URL', requiredIn: 'all', when: 'auth.provider=cwl' },
  {
    name: 'SAML_IDP_CERT_PATH', requiredIn: 'all', when: 'auth.provider=cwl',
    note: 'MANDATORY: cert is an IIFE that throws at construction, so _fetchCertificate() is unreachable.',
  },
  { name: 'SAML_PRIVATE_KEY_PATH', requiredIn: 'staging+production', when: 'auth.provider=cwl' },
  { name: 'MONGODB_URI', requiredIn: 'if-service', when: 'services.mongo' },
  { name: 'MONGODB_DB_NAME', requiredIn: 'if-service', when: 'services.mongo' },
  { name: 'QDRANT_URL', requiredIn: 'if-service', when: 'services.qdrant' },
  { name: 'QDRANT_API_KEY', requiredIn: 'if-service', when: 'services.qdrant' },
  { name: 'QDRANT_COLLECTION', requiredIn: 'if-service', when: 'services.qdrant' },
  // The AI rows are in the table because §8 has them and the drift test reads
  // this list. renderInjection REFUSES to produce them until P4b supplies a
  // key — a variable rendered empty is worse than a refusal (Decision 12).
  { name: 'LLM_PROVIDER', requiredIn: 'if-ai', when: 'ai.models', note: "P4b. `openai` — there is no `openai-compat` provider." },
  { name: 'LLM_ENDPOINT', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
  { name: 'LLM_API_KEY', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
  { name: 'LLM_DEFAULT_MODEL', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
  { name: 'EMBEDDINGS_PROVIDER', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
  { name: 'EMBEDDINGS_MODEL', requiredIn: 'if-ai', when: 'ai.models', note: 'P4b.' },
] as const
```

`renderInjection` then walks that list. **`MANIFEST_ENV` carries the environment kind, and `SAML_ENVIRONMENT` carries `LOCAL` or `PRODUCTION`** — two different vocabularies for two different consumers, and conflating them is how an app in `sandbox` ends up pointed at `authentication.stg.id.ubc.ca`.

- [ ] **Step 4: Run it and watch it pass.**

- [ ] **Step 5: The negative controls**

```bash
# a) Delete the MONGODB_DB_NAME row from the table.
#    Expected: "produces MORE THAN ONE variable" RED. This is the live defect
#    from finding 4, and this is the test that keeps it fixed.
# b) Make SAML_ENVIRONMENT conditional on the environment kind being staging.
#    Expected: the SAML_ENVIRONMENT test RED for sandbox.
# c) Apply the platform bindings BEFORE the app's own env.
#    Expected: "never lets the app shadow a platform binding" RED, with
#    `mongodb://attacker/`.
# d) Let renderInjection emit LLM_* with an empty API key.
#    Expected: the AI refusal test RED.
```

- [ ] **Step 6: Commit** — `feat: §8's injection contract, as one function and one table`.

---

## Task 11: The injection call site — and the `MONGODB_DB_NAME` defect, fixed

**Files:**
- Modify: `packages/control-plane/src/releases/release.ts`
- Modify: `packages/control-plane/src/spec/policy.ts` (reserved names)
- Test: `packages/control-plane/src/releases/releases.test.ts`, `src/runtime/docker/roundtrip.docker.test.ts`, `fixtures/fixture-app/server.js`

**Interfaces:**
- Consumes: `renderInjection` (Task 10).
- Produces: `deployRelease` whose `env` is **entirely** `renderInjection`'s output. The ad-hoc block P3 wrote is deleted, not extended.

**This is the task the roadmap's first P4 lesson is about.** §8's contract is a set of values two code paths must agree on, and the way this repository has failed at that seven times in one session is by having two producers. After this task there is one, and `grep` proves it.

**It also fixes a live defect.** `deployRelease` injects `SERVICE_CATALOGUE[type].envVar` and nothing else, so `MONGODB_DB_NAME` has never been injected; `fixtures/fixture-app/server.js` falls back to `client.db('app')` while `roundtrip.docker.test.ts` and `s6.docker.test.ts` set the variable themselves and pass. Measured 2026-09-07.

- [ ] **Step 1: Write the failing test — against the running system, not a harness**

`roundtrip.docker.test.ts`, in the deploy path that already exists:

```ts
it('gives the app the database its credentials were derived for', async () => {
  // NOT the test's own MONGODB_DB_NAME. This asks the deployed container what
  // it actually received, which is the only question that has ever mattered
  // here: every value in Session 5's seven defects was correct in the test and
  // wrong in the running system.
  const env = await readContainerEnv(engine, instanceHandle.id)
  expect(env.MONGODB_DB_NAME).toBe('fixture_app')
  expect(env.MONGODB_URI).toContain('/fixture_app')
  // And the app agrees — a write lands in that database and nowhere else.
  const before = await mongoDatabases(service)
  await httpPost(`https://${hostname}/notes`)
  expect(await mongoDatabases(service)).toContain('fixture_app')
  expect(await mongoDatabases(service)).not.toContain('app')
})
```

Remove `MONGODB_DB_NAME` from the two Docker tests' hand-built `env` blocks at the same time. **That removal is the point** — while they set it themselves, they cannot see this.

- [ ] **Step 2: Run it and watch it fail**

Run: `make up && pnpm test:docker -- roundtrip`

Expected: FAIL — `MONGODB_DB_NAME` is `undefined` and the write lands in `app`. Record both, because this is the defect that was invisible.

- [ ] **Step 3: Replace the ad-hoc block**

In `deployRelease`, the whole `env: { ...Object.fromEntries(...), PORT, MANIFEST_ENV, ... , ...serviceEnv }` expression becomes one call:

```ts
// `parsedSpec` is the release's OWN AppSpec, read here rather than re-parsed
// from the repository: a Release is Build + AppSpec + resolved config (§13) and
// is immutable, so a redeploy must inject what the release fixed and not what
// manifest.yaml says today. `release.appSpecId` is the join.
const [appSpec] = await db.select().from(appSpecs).where(eq(appSpecs.id, release.appSpecId))
if (!appSpec) throw new ReleaseError('RELEASE_APPSPEC_MISSING', `release '${release.id}' has no AppSpec`)
const parsedSpec = appSpec.parsed as ManifestSpec

env: renderInjection({
  spec: parsedSpec,
  resolved,
  environmentKind: environment.kind,
  hostname: environment.hostname,
  projectSlug,
  idp: config.idp,
  spEntity,          // undefined when auth.provider is 'none'
  secrets,           // SESSION_SECRET and the mounted SP paths
  services: serviceHandles,
}),
```

Keep P3's comment about the ordering, moved to `renderInjection` in Task 10 where the ordering now lives.

- [ ] **Step 4: Reserved names, so the faculty member is told**

`spec/policy.ts` gains a check that `env[].name` is not one of `INJECTION_VARIABLES`' names, with code `SPEC_ENV_NAME_RESERVED` and a hint naming the variable. Silently overwriting is the right *security* answer (§12: an app is untrusted input) and the wrong answer for someone who set `PORT` and cannot work out why it does nothing.

- [ ] **Step 5: The grep**

```bash
grep -rn "MANIFEST_APP_URL\|SAML_ENTRY_POINT\|MONGODB_DB_NAME" \
  packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts'
```

Expected: `spec/injection.ts` **only**. Any second producer is Session 5 waiting to happen.

- [ ] **Step 6: Run everything, twice** — `pnpm test && pnpm test && pnpm test:docker`.

- [ ] **Step 7: The negative control**

```bash
# Put the old ad-hoc env block back alongside renderInjection, with PORT
# hardcoded to 3000. Expected: the roundtrip deploy of a manifest declaring
# runtime.port: 8080 times out — which is P3's defect 70 exactly, reproduced
# deliberately so the next reader sees what one extra producer costs.
```

- [ ] **Step 8: Commit** — `fix: one producer for §8's variables, and MONGODB_DB_NAME is injected`.

---

## Task 12: `node-ts-mongo@1` — the blueprint faculty actually use

**Files:**
- Create: `blueprints/node-ts-mongo/blueprint.yaml`, `Dockerfile.tmpl`, `.npmrc`
- Create: `blueprints/node-ts-mongo/skeleton/{package.json,package-lock.json,server.js}`
- Create: `blueprints/node-ts-mongo/skeleton/auth/{ubcshib.js,attributes.js}`
- Create: `blueprints/node-ts-mongo/agents/AGENTS.md`
- Test: `packages/control-plane/src/blueprints/blueprints.test.ts`

**Interfaces:**
- Consumes: Task 10's contract — the skeleton reads exactly those names.
- Produces: the blueprint reference `node-ts-mongo@1`, resolvable through `BlueprintRegistry.pathOf`, and `pinned_dependencies` naming every app-side library version.

**Roadmap gap 2, second half.** P2 shipped the machinery and one minimal blueprint; this is the content. §20 calls the blueprint *"a security multiplier"* — whatever is in it is replicated into every application, so its auth component is written once and inherited, and a vulnerability in it is a vulnerability in all of them.

**Two refusals are inherited from `fixture-node` and must survive**, because each cost a session:

1. **No `# syntax=` directive.** It makes BuildKit fetch a frontend from Docker Hub before reading line two, and §12's builder has no egress. `renderDockerfile` refuses the directive by name, so this is enforced as well as documented.
2. **`.npmrc` is copied WITH the lockfile, not after it.** `npm ci` reads it from the working directory; arriving later makes D13's mirror control completely inert — and, worse, inert in a way that *succeeds* when the network is up.

- [ ] **Step 1: Write the failing test**

```ts
it('resolves node-ts-mongo@1 and it supports cwl', async () => {
  const registry = await loadBlueprints(BLUEPRINTS_ROOT)
  const d = registry.resolve('node-ts-mongo@1')
  expect(d?.provides.auth_providers).toContain('cwl')
  expect(d?.provides.services).toContain('mongo')
  // Decision 12: false until P4b's AI wiring exists, so a spec declaring
  // ai.models is refused with §25's clear message rather than deployed with
  // no key.
  expect(d?.provides.ai).toBe(false)
  expect(d?.injection.contract).toBe(INJECTION_CONTRACT_VERSION)
})

it('pins every app-side library exactly (C6, D30)', async () => {
  const d = (await loadBlueprints(BLUEPRINTS_ROOT)).resolve('node-ts-mongo@1')!
  expect(d.pinned_dependencies).toMatchObject({
    'passport-ubcshib': '0.1.6',
    passport: '0.7.0',
    express: expect.stringMatching(/^\d+\.\d+\.\d+$/),
  })
})

it('agrees with its own skeleton package.json', async () => {
  // The descriptor and the lockfile drifting apart is how §16's drift test
  // ends up asserting against a version nothing installs.
  const d = (await loadBlueprints(BLUEPRINTS_ROOT)).resolve('node-ts-mongo@1')!
  const pkg = JSON.parse(await readFile(join(pathOf('node-ts-mongo@1'), 'skeleton/package.json'), 'utf8'))
  for (const [name, version] of Object.entries(d.pinned_dependencies ?? {})) {
    expect(pkg.dependencies[name], `${name} disagrees`).toBe(version)
  }
})
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm test -- blueprints`.

- [ ] **Step 3: The descriptor**

```yaml
blueprint: node-ts-mongo
major_version: 1
schema_versions: [1]

runtime:
  language: typescript
  # The SAME digest fixture-node pins, and pinned at the LOCAL REGISTRY, which
  # is the only place an offline build can resolve it from (S1). It is NOT the
  # digest in infra/images.lock: that records what Docker Hub returned (a
  # multi-arch index); `docker pull` on arm64 takes a single-arch manifest out
  # of it and `docker push` republishes that.
  base_image: manifest-registry:5000/base/node@sha256:1ef15d33d74602021f35ec64a4e72f4a21e2cfa68ebecd125fbe0c44af8f604a
  default_port: 3000
  health_path: /healthz
  run_as_uid: 10001

provides:
  services: [mongo]
  auth_providers: [cwl, none]
  # false until P4b's AI wiring exists. Flipping this to true is ADDITIVE — it
  # permits more, so no app breaks and it is not a major bump.
  ai: false

defaults:
  resources: { cpu: 0.5, memory: 512Mi, pids: 256, disk: 2Gi }

injection:
  contract: v1

dockerfile: ./Dockerfile.tmpl
knowledge_pack: ./agents/

pinned_dependencies:
  express: 4.21.2
  express-session: 1.18.1
  passport: 0.7.0
  passport-ubcshib: 0.1.6
  mongodb: 6.12.0
```

- [ ] **Step 4: The auth component, and the attribute bridge**

`skeleton/auth/attributes.js` is the bridge §9 requires, and its comment is the reason it exists:

```js
// THE ATTRIBUTE BRIDGE. §9: tlef-starter carries one "precisely to bridge that,
// because passport-ubcshib's own mapping has gaps", and S2 measured the gaps:
//
//  * the library's map covers SIX friendly names: displayName,
//    eduPersonAffiliation, givenName, mail, sn, ubcEduCwlPuid
//  * it has NO OID entry at all for `uid` or `eduPersonPrincipalName`, so an
//    app that requests either gets a raw urn:oid: key it cannot read
//  * its MACE entry for ubcEduCwlPuid is UNREACHABLE — mapAttributes builds a
//    reverse map friendly -> OID, so the OID entry overwrites the MACE one
//
// We use OID everywhere (S2: real UBC Shibboleth sends OID, confirmed against
// tlef-biocbot in production), which sidesteps the MACE bug without patching
// the library — C6 forbids a library change being a prerequisite.
export const OID = {
  ubcEduCwlPuid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
  mail: 'urn:oid:0.9.2342.19200300.100.1.3',
  givenName: 'urn:oid:2.5.4.42',
  sn: 'urn:oid:2.5.4.4',
  eduPersonAffiliation: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.1',
  eduPersonPrincipalName: 'urn:oid:1.3.6.1.4.1.5923.1.1.1.6',
  uid: 'urn:oid:0.9.2342.19200300.100.1.1',
}

/** First value only: SAML attributes are multi-valued and apps want a scalar. */
export function bridge(profile) { … }
```

`skeleton/auth/ubcshib.js` wires the strategy from §8's names and **nothing else** — no literal URLs, no defaults:

```js
// Every value comes from the environment, and NONE of them has a fallback.
// §8's SAML_ENVIRONMENT is the reason: the library defaults it to 'STAGING' at
// two sites, so an app deployed without it points at
// https://authentication.stg.id.ubc.ca — real UBC infrastructure. A fallback
// here would reintroduce exactly that, one level up.
function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required and was not injected (§8)`)
  return value
}
```

- [ ] **Step 5: The knowledge pack**

`agents/AGENTS.md` — served over the API in P5 (D25). It must state what an agent may declare, and the three things it must never do: supply a Dockerfile or any `runtime.build` block (D13), write an origin into `auth.callback` (D15), or request an attribute outside `auth.attributes` and expect to receive it (§9's enforcement is at the IdP).

- [ ] **Step 6: Build it for real**

Run: `make up && pnpm test:docker -- roundtrip` with a fixture whose project pins `node-ts-mongo@1`.

Expected: a green build. **If it fails at `npm ci`, the seed warm list from Task 3 did not include this blueprint** — check Verdaccio's storage rather than the exit code, which is how S1's silently-wrong build was caught:

```bash
docker exec manifest-verdaccio ls /verdaccio/storage/passport-ubcshib/
```

- [ ] **Step 7: The negative controls**

```bash
# a) Add `# syntax=docker/dockerfile:1` to the top of Dockerfile.tmpl.
#    Expected: renderDockerfile REFUSES it by name — not a build failure naming
#    DNS and Docker Hub, which is what it looked like the first time.
# b) Move `.npmrc` out of the lockfile COPY into the `COPY . .` below.
#    Expected: the build fails offline. Then, with the network on, watch it
#    SUCCEED and check the mirror storage: an empty passport-ubcshib directory
#    is D13 being inert, and it is the failure S1 and P3 both paid for.
# c) Remove `attributeConfig` from ubcshib.js.
#    Expected: Task 15's acceptance RED with raw urn:oid: keys.
```

- [ ] **Step 8: Commit** — `feat: node-ts-mongo@1, with the auth component and the attribute bridge`.

---

## Task 13: The injection-contract drift test

**Files:**
- Create: `packages/control-plane/src/spec/injection-drift.test.ts`

**Interfaces:**
- Consumes: `INJECTION_VARIABLES` (Task 10) and the blueprint skeleton on disk (Task 12).
- Produces: nothing at runtime. It is §16's *Injection-contract drift* tier.

**§16 describes exactly what this asserts:** *"The §8 table is asserted against the blueprint: every variable the blueprint reads is injected, and `SAML_ENVIRONMENT` is never absent. This is what keeps §8 honest — it was wrong once, from being written against memory of the libraries rather than against them."*

**So it must read the blueprint's source, not a list.** A drift test that compares `INJECTION_VARIABLES` against a hand-written expectation asserts that somebody updated two files, which is the failure it exists to prevent.

- [ ] **Step 1: Write it**

```ts
/**
 * §16's drift tier. It reads the blueprint's ACTUAL SOURCE for `process.env.X`
 * and compares that set against what renderInjection produces. Neither side is
 * a copy of the other, which is the only arrangement that can catch drift.
 */
const ENV_READ = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\['([A-Z][A-Z0-9_]*)'\])/g

describe('injection-contract drift (§16)', () => {
  it('injects every variable the blueprint skeleton reads', async () => {
    const read = await variablesReadBy('blueprints/node-ts-mongo/skeleton')
    const rendered = new Set(Object.keys(renderInjection(fullContext())))
    const missing = [...read].filter((name) => !rendered.has(name) && !ALLOWED_UNSET.has(name))
    // The message names the file, because "MONGODB_DB_NAME missing" without a
    // location sends the reader to the wrong module.
    expect(missing, `blueprint reads these and nothing injects them: ${missing}`).toEqual([])
  })

  it('the blueprint reads every variable marked required-in-all', async () => {
    // The other direction, and it is not redundant: a variable injected and
    // read by nothing is a contract row that has quietly died, and §8 is
    // "frozen" — a dead row means the table and the blueprint disagree about
    // what the platform promises.
    const read = await variablesReadBy('blueprints/node-ts-mongo/skeleton')
    const required = INJECTION_VARIABLES.filter((v) => v.requiredIn === 'all').map((v) => v.name)
    expect(required.filter((n) => !read.has(n) && !PLATFORM_ONLY.has(n))).toEqual([])
  })

  it('SAML_ENVIRONMENT is never absent, in any environment kind', () => {
    for (const kind of ['sandbox', 'staging', 'production'] as const) {
      expect(renderInjection({ ...fullContext(), environmentKind: kind })).toHaveProperty(
        'SAML_ENVIRONMENT',
      )
    }
  })

  it('asserts against the PINNED version of passport-ubcshib, not whatever is installed', async () => {
    // C6, and the roadmap's reason: "a caret range would let the contract drift
    // underneath the test that exists to catch drift". The two names §8 says
    // the LIBRARY itself reads are checked against its source at the pinned
    // version.
    const descriptor = registry.resolve('node-ts-mongo@1')!
    expect(descriptor.pinned_dependencies?.['passport-ubcshib']).toBe('0.1.6')
    const source = await readPinnedLibrarySource('passport-ubcshib', '0.1.6')
    expect(source).toContain('process.env.SAML_ENVIRONMENT')
    expect(source).toContain('process.env.SAML_LOGOUT_URL')
  })
})
```

- [ ] **Step 2: Run it and watch it fail, then pass.** Expect a real disagreement on the first run — that is the test working, and whatever it finds should be recorded here rather than quietly fixed.

- [ ] **Step 3: The negative controls**

```bash
# a) Add `process.env.COURSE_TERM` to skeleton/server.js.
#    Expected: the first test RED, naming COURSE_TERM and the file.
# b) Delete the SESSION_SECRET row from INJECTION_VARIABLES.
#    Expected: the first test RED — the blueprint reads it.
# c) Delete a read of MANIFEST_APP_URL from the skeleton.
#    Expected: the SECOND test RED. If it is not, the second test is not
#    pulling its weight and should be fixed here rather than trusted.
```

- [ ] **Step 4: Commit** — `test: the §8 drift tier, reading the blueprint's own source`.

---

## Task 14: Manifest's own CWL login, and the end of the dev shim

**Files:**
- Create: `packages/control-plane/src/identity/saml.ts`, `saml.test.ts`, `testing.ts`
- Delete: `packages/control-plane/src/identity/dev-auth.ts`, `dev-auth.test.ts`
- Modify: `src/api/routes/auth.ts`, `src/config.ts`, `src/config.test.ts`, `src/api/testing.ts`, `src/index.ts`, `scripts/demo.sh`, `README.md`, and the ~28 test call sites
- Modify: `infra/lib/ensure-idp-sql.sh` (register the control plane's own SP)

**Interfaces:**
- Consumes: Task 7's `sso/` for the row; Task 1's IdP.
- Produces: `GET /auth/login` (302 to the IdP), `POST /auth/saml/callback` (validates the assertion, mints the §13 session), and `testSessionCookie(user, secret)` from `identity/testing.ts`.

**§9's first sentence, and the one that is easy to forget:** *"The first is easy to forget: **Manifest itself is an SP.** Its own users log in with CWL… Locally it uses the Manifest IdP like everything else."* Roadmap gap 3 closes here.

**Decision 9 in practice.** The bypass is the *route*, not a test's ability to construct a session. **19 references across 8 files** (counted 2026-09-07; see Decision 9 for the per-file breakdown) move to `testSessionCookie`, which signs a session with the same `issueSession`/`signSession` the real callback uses. `MANIFEST_DEV_AUTH`, its config guard and its test go with the route.

**Do this task last but one, and read this before starting:** deleting the shim reddens most of the API suite at once — `authz-contract.ts` alone drives 81 of the 381 tests — which is a bad state to debug in. Add `testSessionCookie` and migrate every call site **first**, with the shim still present and the suite green; delete the shim only when `grep -rn 'dev-login' packages/control-plane/src` returns nothing but the route itself.

- [ ] **Step 1: Add `testSessionCookie` and migrate the call sites, shim still in place**

```ts
/**
 * What replaces POST /auth/dev-login for tests.
 *
 * The authentication bypass was the ROUTE — an unauthenticated HTTP endpoint
 * that minted a real session, one line from live (P2 measured that: removing
 * the registration guard made it answer 200 with a real session, not the
 * refusal the plan predicted). A test constructing a signed session in-process
 * is not that: it holds the signing secret already.
 */
export function testSessionCookie(
  user: { id: string; ubcCwlPuid: string; role: 'admin' | 'member' },
  secret: string,
): string {
  return `${SESSION_COOKIE}=${signSession(issueSession(user), secret)}`
}
```

Run `pnpm test` after the migration and **before** any deletion. Expected: green, with `MANIFEST_DEV_AUTH` still on.

- [ ] **Step 2: Write the failing tests for the real login**

```ts
describe('Manifest is its own SP (§9)', () => {
  it('GET /auth/login redirects to the Manifest IdP with a SAMLRequest', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/login' })
    expect(res.statusCode).toBe(302)
    const location = new URL(res.headers.location as string)
    expect(location.origin).toBe('https://idp.manifest.internal')
    // The 2.x path, measured off the running container. UBC_CONFIG.LOCAL's
    // 1.x path would 404 and the failure would read as "the IdP is down".
    expect(location.pathname).toBe('/module.php/saml/idp/singleSignOnService')
    expect(location.searchParams.get('SAMLRequest')).toBeTruthy()
  })

  it('refuses an assertion signed by a key that is not the IdP', async () => {
    // The control that makes the success meaningful. Without it the callback
    // is an endpoint that mints a session for anyone who can POST XML.
    const res = await app.inject({
      method: 'POST', url: '/auth/saml/callback',
      payload: { SAMLResponse: assertionSignedBy(someOtherKey) },
    })
    expect(res.statusCode).toBe(401)
    expect(res.cookies).toHaveLength(0)
  })

  it('refuses an assertion whose audience is a different SP', async () => {
    // An assertion minted for a deployed APP replayed at the control plane.
    // Both are SPs of the same IdP, so this is a live shape, not a theoretical
    // one, and the entityID is the only thing that separates them.
    const res = await app.inject({
      method: 'POST', url: '/auth/saml/callback',
      payload: { SAMLResponse: assertionFor('https://manifest.internal/sp/chem-labs/staging') },
    })
    expect(res.statusCode).toBe(401)
  })

  it('creates the user on first login and reuses them on the second', async () => {
    // §6's User is keyed on ubc_cwl_puid. Two logins must not be two people —
    // and the second login must not fail on the unique index either, which is
    // what an INSERT without onConflictDoUpdate would do (and P3 defect 76
    // showed what an unhandled unique violation looks like from outside: a
    // 500 INTERNAL with no trace anywhere).
    const assertion = assertionFor(CONTROL_PLANE_ENTITY_ID, {
      'urn:oid:1.3.6.1.4.1.60.6.1.6': ['ins000001'],
      'urn:oid:0.9.2342.19200300.100.1.3': ['instructor@ubc.ca'],
    })
    const first = await app.inject({
      method: 'POST', url: '/auth/saml/callback', payload: { SAMLResponse: assertion },
    })
    expect(first.statusCode).toBe(302)

    const second = await app.inject({
      method: 'POST', url: '/auth/saml/callback', payload: { SAMLResponse: assertion },
    })
    expect(second.statusCode).toBe(302)

    const rows = await db.select().from(users).where(eq(users.ubcCwlPuid, 'ins000001'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('instructor@ubc.ca')
    // `member`, not `admin`. Platform role comes from Manifest, never from an
    // attribute the IdP asserts — eduPersonAffiliation says `faculty` here,
    // and letting that grant admin would make the IdP an authorization
    // authority as well as an authentication one.
    expect(rows[0]!.role).toBe('member')
  })

  it('has no /auth/dev-login route at all', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/dev-login',
      payload: { puid: 'bio_prof' }, headers: { 'idempotency-key': 'x'.repeat(8) } })
    // 404, not 401 or 403: the route must be ABSENT, not merely refusing.
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 3: Register the control plane's own SP**

The control plane is an SP like any other, so its row goes in the same table — but it cannot register itself through `deployRelease`, which registers *apps*. Add it to `infra/lib/ensure-idp-sql.sh` with entityID `https://manifest.internal/sp/manifest-control-plane/platform` and ACS `http://127.0.0.1:7100/auth/saml/callback`.

**Note the origin:** the control plane is a host process on 7100 (§21), not something the edge routes, so its ACS is the only Manifest ACS that is not an `https://…manifest.internal` URL. Say so in the script, because it looks like a mistake.

- [ ] **Step 4: Implement `identity/saml.ts`** using the same `passport-saml` version the blueprint pins, so the control plane and the apps validate assertions identically — one library to reason about, one CVE surface.

- [ ] **Step 5: Delete the shim**

```bash
git rm packages/control-plane/src/identity/dev-auth.ts packages/control-plane/src/identity/dev-auth.test.ts
```

and remove `MANIFEST_DEV_AUTH` from `config.ts`, its guard, its test, `api/testing.ts`'s `devAuth` option, `.env.example` and `README.md`. `scripts/demo.sh` step 1 becomes the real login.

- [ ] **Step 6: The grep, and the config check**

```bash
grep -rn 'dev-login\|devLogin\|DEV_USERS\|MANIFEST_DEV_AUTH' packages/control-plane/src scripts README.md
```

Expected: **nothing**. A single remaining reference means a caller was migrated by deletion rather than by replacement.

- [ ] **Step 7: Run everything, twice** — all four gates, plus `pnpm test:docker`.

- [ ] **Step 8: The negative controls**

```bash
# a) Skip signature validation in the callback (accept any SAMLResponse).
#    Expected: "refuses an assertion signed by a key that is not the IdP" RED.
#    This is the control that replaces the one P2 measured on /auth/dev-login,
#    and it is the same class: an endpoint one edit from minting real sessions.
# b) Drop the audience check.
#    Expected: the replay test RED. Record the session it minted.
# c) Re-register the route behind `if (config.env === 'development')`.
#    Expected: the "no /auth/dev-login route at all" test RED with 200.
```

- [ ] **Step 9: Commit** — `feat: Manifest logs its own users in with CWL; the dev shim is gone`.

---

## Task 15: The proof app, and P4a's acceptance

**Files:**
- Create: `fixtures/proof-app/` — `package.json`, `package-lock.json`, `server.js`, `manifest.yaml`, `public/index.html`
- Create: `scripts/demo-identity.sh`
- Modify: `Makefile` (`demo-identity`), `docs/superpowers/RUNBOOK.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `make demo-identity`, and `fixtures/proof-app/` — §16's proof app, which **P4b completes** by adding the LLM half.

**Roadmap gap 6, and it is deliberately not minimal.** `fixtures/fixture-app/` stays trivial and is P3's build target. This one is the app that goes to UBC on the external track: its `manifest.yaml` is the first real input to P8's IAM registration package and PIA draft, *"which is a good reason for it to be honest rather than minimal."* It declares real attributes with real reasons, and its README says what each one is for — because §9 says IAM asks for exactly that and *"a faculty member cannot write it unaided."*

**And it is the trigger for the external track.** ORIENTATION §8: the C4 conversation with UBC IAM starts once the local proof of concept works end to end. This task is that trigger for the identity half — but the trigger the decision names is the **full** proof app, so it is P4b that fires it. Do not raise it here.

- [ ] **Step 1: Write the proof app**

`fixtures/proof-app/manifest.yaml`, written the way a faculty member's agent would write it:

```yaml
manifest: 1
name: proof-app
blueprint: node-ts-mongo@1
description: The Manifest proof application — CWL sign-in and a per-user note.

runtime:
  port: 3000
  health: /healthz

services:
  - { type: mongo, version: "7", name: db }

auth:
  provider: cwl
  # Only ubcEduCwlPuid, mail and eduPersonAffiliation are pre-authorized by UBC
  # IAM; anything else needs a justification in the registration request (§7).
  # givenName and sn are here because the app greets people by name, and that
  # sentence is the justification P8's package will carry.
  attributes: [ubcEduCwlPuid, mail, eduPersonAffiliation, givenName, sn]
  callback: /auth/ubcshib/callback
  logout: /auth/logout

env:
  - { name: COURSE_CODE, value: CHEM_121 }

data:
  classification: internal
  retention_days: 365
```

The app itself: sign in, write a note **keyed on the PUID hash**, list your own notes and nobody else's. The AI half is a stub that says so.

**The PUID hash is `sha256(puid ‖ project ‖ environment)` from day one**, even though nothing reads it until P4b. S3's finding is that LiteLLM keys end-user budgets on that string **globally**, so a bare PUID hash locks a student out of every Manifest app once they exhaust one app's budget. Computing it correctly here means P4b passes it through rather than changing what the app stores about people, which is a migration nobody wants.

- [ ] **Step 2: Write `scripts/demo-identity.sh`**

A **thin wrapper**, like `scripts/demo.sh`: the logic under test lives in the Docker-tier suite, and a demo that reimplements any of it drifts into proving something else. It drives the real HTTP API with `curl` and a cookie jar:

1. log in — **the real SAML flow**, not a shim
2. create the project, which provisions three environments and a bare repository
3. push the proof app and its manifest
4. validate the manifest at that commit
5. build, release, deploy to staging
6. **sign in to the deployed app as `student`**, through the edge, over TLS with the platform CA
7. write a note; read it back; assert the note is the one that was written
8. sign in as `instructor` and assert the student's note is **not** visible

Step 8 is the one that matters. Steps 6 and 7 prove a login happened; only step 8 proves the app knows *who*.

- [ ] **Step 3: Run it and watch it fail**

Run: `make up && make demo-identity`

Expected: FAIL somewhere. Record where. A first end-to-end run has never yet passed in this project, and the two times it did not, it turned out that no build and then no deploy had ever succeeded.

- [ ] **Step 4: Make it pass, then run it again from nothing**

```bash
make reset && make up && make demo-identity
```

The second run is what proves nothing depended on state the first run happened to leave. P3's demo runs from a dropped database, a deleted repository root and an emptied registry, and this one must too — `make reset` keeps the Caddy CA, the master key and the IdP keypair, and **destroys the rest**.

- [ ] **Step 5: Offline**

Disabling Wi-Fi cuts the agent off too, so this is Rich's to run: `scripts/offline-acceptance.sh` exists for exactly that, and this task adds `make demo-identity` to it. **Ask before assuming it passed.**

- [ ] **Step 6: The negative controls, and they are the acceptance**

```bash
# a) Delete the app's saml20_sp_remote row between deploy and login.
#    Expected: step 6 RED with "Unable to locate metadata".
# b) Point SAML_IDP_CERT_PATH at a different certificate.
#    Expected: step 6 RED with a signature failure — NOT a hang, and not a 500.
# c) Reduce auth.attributes to [ubcEduCwlPuid] and redeploy.
#    Expected: the app renders no display name, and step 7 still passes. That
#    is §9's enforcement visible from the outside.
# d) Return a fixed PUID hash from the app instead of the real one.
#    Expected: step 8 RED — the instructor sees the student's note. This is the
#    control that makes steps 6 and 7 mean something.
```

- [ ] **Step 7: Update the documents that state status**

The close-out list is in ORIENTATION §6 and forgetting it is the step that gets forgotten: the roadmap ledger **first**, then ORIENTATION §2 and §7, `README.md`, `CLAUDE.md`, `RUNBOOK.md`, and the four HTML pages that are shared outside the team. Re-run `scripts/snapshot-machine.sh` and add a new dated baseline; **do not edit the old ones**.

- [ ] **Step 8: Commit**

```bash
git add fixtures/proof-app scripts/demo-identity.sh Makefile docs/
git commit -m "feat: the proof app signs a real person in with CWL, driven by curl

§16's proof app, half of it: CWL sign-in and a per-user note in the app's own
Mongo. P4b adds the LLM answer.

The acceptance is not that a login happened — it is that the instructor cannot
see the student's note, which is the only assertion that proves the app knows
who signed in."
```

---

## What this plan does not build

**P4b — AI, streaming and incidents.** ***Now written*** ([`2026-09-07-p4b-ai-events-streaming-incidents.md`](./2026-09-07-p4b-ai-events-streaming-incidents.md), 16 tasks, unrun). The table below was its brief and is kept as written, because it records what P4a deliberately stops short of. **Two rows have since changed on measurement, and P4b says so at length:** the `duration` TTL is Phase 3's, because nothing mints an agent key before sandboxes exist; and `ai.budget.per_user_monthly_usd` **cannot be enforced at LiteLLM 1.98.0 at all.** Its scope, and the seams it inherits:

| | |
|---|---|
| `ai/` | The LiteLLM client. **Every key carries `allowed_routes`** (`/v1/chat/completions`, `/v1/embeddings`, `/v1/models`) and every agent key a `duration` TTL — both re-measured on the running LiteLLM 2026-09-07, with the escalation reproduced: an unconfined key mints a child that answers 200 after its parent is revoked and answers 401. Budgets go on the LiteLLM **user**, not the key, because app keys rotate every deploy; `budget_duration: 1mo`, never `30d`. |
| The catalogue | D17, read from `/model/info` so `max_classification` has one source of truth. `spec/policy.ts` already validates against a `modelCatalogue` passed in — **the wiring is a call site, not a new check.** The catalogue must be DB-held (`STORE_MODEL_IN_DB`, already set in P1's compose): a config-file deployment cannot be deleted through the admin API at all. |
| Reaching LiteLLM | **Measured: the toolkit cannot be proxied.** Add `manifest-litellm` to `PLATFORM_NEIGHBOURS` in `runtime/docker/networks.ts` and inject `LLM_ENDPOINT=http://manifest-litellm:4000/v1`. §12 already says the control is per-key `allowed_routes` and "Not a port rule", so no spec change is implied — **but re-run `s6.docker.test.ts`**, because attaching a platform container to every app network changes the topology S6 measured. |
| The blueprint's AI half | `ubc-genai-toolkit-llm@0.7.0` — re-measured, all three S3 findings reproduce. `encoding_format: 'float'` on **every** `embed()`; the end-user identifier is `sha256(puid ‖ project ‖ environment)`, which P4a's proof app already computes. Flip `provides.ai` to `true` and delete `renderInjection`'s `INJECTION_AI_UNSUPPORTED` refusal in the same commit. |
| Events | P4a ships the table, the append-only grant, the redactor and two call sites. P4b adds `WS /projects/:id/events` (D23.2 — **one stream per project, not polling**), the faculty-legible message catalogue, and LiteLLM's error mapping. That mapping cannot rely on `type` alone: a route denial arrives as `{"detail": …}` with no `type`, and key-over-budget and end-user-over-budget share `budget_exceeded` while needing different messages. Pin it to LiteLLM 1.98.0. |
| Redaction | P4a ships the exact-match half. P4b adds the entropy and pattern heuristics, and the rule that **LiteLLM's key-revocation error body carries the masked key and the full key hash** and must never reach an `Event` verbatim (§14). |
| Incidents | §14's structured `Incident`: exit reason, last 200 log lines, the failing check, the diff since the last healthy release — shaped to be handed back to an agent as a repair prompt. |

**P6's, and P4a must not grow a half-version of any of it:** the `LaunchReadiness` gate, sensitive-diff escalation, approvals with step-up re-auth, `IamRegistration` and `PrivacyAssessment` as tracked objects. `POST /projects/:projectId/spec` computes `isSensitiveDiff` and **reports it without enforcing**; leave it that way. `deployRelease` refuses production with `RELEASE_PRODUCTION_GATE_UNAVAILABLE` and its checklist; leave that too.

**Three things P4a builds the near half of and deliberately stops short of.** Each is named because the spec asks for it and silence would read as an oversight:

- **Secret rotation as an operation.** §12: *"Rotation is re-inject plus instance restart."* P4a ships `rewrapSecret` for **master-key** rotation and `putSecret` overwriting a value, but no route and no restart. The API for it belongs with P5's contract, and the restart belongs with Phase 4's reconciliation loop; building a rotate endpoint that cannot restart an instance would be a half-gate.
- **The 90-day certificate alert (D20).** Task 6 records `expiresAt` on every SP keypair, which is the half that has to exist first. Nothing evaluates it, because P4a has no scheduler — §11's reconciliation loop is Phase 4 (D10), and until then there is no periodic anything. `LaunchReadiness` (P6) is where it surfaces for production.
- **Per-app metrics.** §14's *"request count, error rate, p95 latency, memory, AI spend"*. AI spend is P4b's, through LiteLLM; the rest needs a metrics path nothing in Phase 1 has.

**Not this plan either:** the second-machine clean clone (still untested, `RUNBOOK.md`'s *Known gaps*), the `node:22-alpine` → 24 decision (Rich's, ORIENTATION §8), and an apk mirror (raised 2026-09-06, undecided).

---

## What the self-review caught

Run after the plan was complete, reading the spec with fresh eyes. Recorded so the next reader does not mistake a deliberate fix for a mistake.

1. **Task 7's `validate.authnrequest` had no test.** The row sets it, S2 proved it enforces, and nothing in the plan would have noticed it being dropped. Added as negative control (b) on Task 7, with the instruction to write the missing assertion into Task 3's suite rather than leave the control unpaired.
2. **The append-only grant would have been a no-op.** `REVOKE UPDATE ON events FROM manifest` does nothing while `manifest` owns the table — an owner's privileges cannot be revoked from itself. The migration now transfers ownership to a `NOLOGIN` role first. This is the §16 tier's own rule applied to itself: a control that cannot fail is not a control.
3. **Task 2's configuration check cannot see the `authproc` ordering.** Asserting that `core:AttributeLimit` is *loaded* passes just as happily when the priorities are swapped and the limit therefore matches nothing. The ordering is only visible in a completed login, which is why Task 3 exists and why swapping the priorities is one of its four negative controls.
4. **Deleting `deriveCredentials` outright would have broken every running database.** Caught by reading `config.ts`'s existing warning about the master secret, which describes precisely this failure and says it "reads as a Mongo fault". Decision 8 and Task 5 are the result.
5. **Task 14 would have reddened ~28 test files at once.** Deleting the shim before migrating its call sites is a bad state to debug in; the task now migrates first, keeps the suite green, and deletes last.
6. **`MANIFEST_IDP_DATABASE_URL` breaks three callers, not one.** `testDeps`, `vitest.env.ts` and `.env.example` all construct configuration, and a required setting added to `config.ts` alone would have failed the whole suite for a reason unrelated to the task. Named in Task 7 Step 5.
7. **The seed's mirror warm list was hardcoded to three packages.** `fastify`, `mongodb`, `zod` — so the moment `node-ts-mongo` needs `passport-ubcshib`, the offline build fails and the symptom is an `npm ci` error inside the builder. Task 3 derives the list from the lockfiles instead. This one would have been found in execution, at the worst moment: the offline acceptance.

**The formal pass — spec coverage, placeholders, type consistency — then found seven more.**

8. **Three code blocks were elided rather than written.** `idpLogin` in Task 3, and one test body each in Tasks 9 and 14. The writing-plans skill counts these as plan failures and it is right to: `idpLogin` is the three-hop SAML walk, which is the single fiddliest piece of the plan and exactly the thing an executor should not have to invent. All three are now written out, including the form-field extraction and why regex-over-HTML is acceptable against a version-pinned fixture IdP.
9. **Three signatures disagreed with themselves across tasks.** `renderSpMetadata` was declared with an `idp` argument its implementation does not take; `registerServiceProvider` was a four-argument function in its *Interfaces* block and a bound dependency method in Task 9's test; `testSessionCookie` was `(user)` in two prose mentions and `(user, secret)` in its code. Each is the kind of mismatch that costs an executor half an hour of deciding which one is authoritative.
10. **`assertNoReservedEnvNames` was used in Task 10's test and only described in Task 11.** A function a test calls before any task produces it is a task that cannot pass its own step 2.
11. **`deployRelease`'s signature change was implied and never stated.** It gains a `deps` parameter in Task 9, which moves every existing caller and test. An executor discovering that from a type error is an executor debugging the wrong thing.
12. **§9 asks `make doctor` to assert the absence of `saml20-sp-remote.php` and nothing did.** It is absent today — but only because the image happens to ship `.dist` files, and an accident is not a control. Added to Task 2, with S2's reason: the first matching `metadata.sources` entry wins, so a flatfile would shadow every control-plane-written row silently.
13. **§16's identity-path tier names two assertions nothing asserted** — that a production environment never resolves to the Manifest IdP, and that sandbox and staging never resolve to real UBC Shibboleth. Both are one line in `renderInjection`'s test and both prevent pointing a real cohort at the wrong identity provider. Added to Task 10.
14. **Three spec requirements were being dropped silently** rather than deliberately: secret rotation as an operation (§12), the 90-day certificate alert (D20), and per-app metrics (§14). P4a builds the near half of each — `rewrapSecret`, `expiresAt` — and stops. They are now named in *What this plan does not build*, with the reason each stops where it does.

---

## What executing this plan found

*Appended per session. P1 found 18 defects, P2 52, P3 82 — 4.3 per task, in plans that
had all been self-reviewed first. Finding them is the expected outcome, not a sign the
plan was bad.*

### Session 1 — baseline and Tasks 1–2 (2026-09-08). 9 defects.

**Baseline first, and it matched the handover exactly**: `make doctor` 16/0, `make verify`
34/0, `pnpm test` 381 twice, lint/typecheck/format clean, and the plan's premise
reproduced — `/module.php/saml/idp/metadata` answered **500** with an empty `cert/`.

| # | Task | Defect | Measured against |
|---|---|---|---|
| 1 | 1 | **The plan's own entityID check could not fail.** `grep -qE 'entityID="[^"]*:(7122\|6122\|8080)'` matches nothing when there is no `entityID` at all, so it passed against the Caddy wildcard page and would have passed had metadata never been served. | Green against `manifest OK host=idp.manifest.internal`. Now extracts the entityID, fails if absent, then checks for a port. Watched red under control (c). |
| 2 | 1 | **The edge check could not fail either.** It asserted only a 200, and the Caddyfile wildcard returns 200 for **every** path under the zone. The plan predicted it would "pass for the wrong reason until Step 5"; it would have kept passing for ever after. | With the site block removed the check stayed green while the IdP was unreachable. It now asserts *who answered* — `SimpleSAMLphp` in the body — and goes red under control (c). |
| 3 | 1 | **`make up` had no way to apply a Caddyfile change.** The file is bind-mounted and read once at container start; compose sees no service change when only content changed, so Task 1's new site block did nothing and `make up` reported success. | `infra/lib/ensure-caddy-config.sh` reloads the edge, **conditional** on a hash kept in the edge's own volume — `caddy reload` replaces the whole config and would otherwise drop the driver's runtime routes on every `make up`. |
| 4 | 1 | Control (b) as written cannot run. `make up` calls `ensure-idp-keypair.sh`, which **re-mints the keypair it just removed**; and `mv`-ing a bind-mounted *directory* leaves the running container on the old inode, so the container must be force-recreated. Also, the plan expected "the certificate half only" to redden — SimpleSAMLphp refuses to serve metadata **at all** without a private key. | Control run properly: `docker compose up -d --force-recreate idp` with an emptied `cert/` → `Error: METADATA`. |
| 5 | 2 | **Finding 2 was wrong, in the platform's favour.** `config.php.dist` ships `50 => 'core:AttributeLimit'` and our `config.php` merges *over* the dist, so the filter was live all along. `authproc.idp` read `[core:LanguageAdaptor, core:AttributeLimit, core:LanguageAdaptor]` before any change. What was actually missing was the OID map. | `grep -A25 "'authproc.idp'" config.php.dist`, and the plan's own first check passing on a stock IdP. |
| 6 | 2 | **The naming halves disagreed, and the plan's Step 4 would have left them disagreeing.** `core:AttributeLimit` compares the SP row's `attributes` list against the attribute **keys** at priority 50. The auth source emitted OIDs; a row declares friendly names. Following the plan literally releases **nothing**, and `passport-ubcshib` throws `Missing ubcEduCwlPuid`. | All four combinations measured against this SimpleSAMLphp: OID keys + friendly row → `[]`; friendly + friendly → the two declared; OID + OID → the two declared; friendly + `[]` → **all five** (S2's fail-open). Auth source now speaks friendly; `AttributeMap` at 60 converts to OIDs. `name2oid` knows four of the five — `ubcEduCwlPuid` is UBC's own and needs `attributemap/ubcoid.php`. |
| 7 | 2 | **The CHECK constraint accepted the row it exists to forbid.** `(entity_data::jsonb)->'attributes'` is SQL NULL when the key is absent, `jsonb_array_length(NULL)` is NULL, and `NULL > 0` is NULL — which a CHECK **accepts**. So `"attributes": []` was rejected and a row with no `attributes` key went straight in, and `core:AttributeLimit` treats the two identically. | `COALESCE(..., 0) > 0`, plus a sixth check asserting exactly that row is refused. Both watched red under control (c). |
| 8 | 2 | **Making the metadata user read-only made the IdP restart-loop.** `bin/initMDSPdo.php` issues `CREATE TABLE` through `database.*` — the same credentials the request path reads metadata with — so the entrypoint died with `permission denied for schema public` and the container looped on exit 255. | `SSP_DB_INIT=1` scopes the owning role to that one command in the entrypoint. Deliberately **not** a `php_sapi_name() === 'cli'` split, which would silently give every CLI probe more privilege than the server has — the exact shape that cost P3 seven defects in one session. |
| 9 | 2 | **A failing check broke the platform for the next person.** `idp_metadata_user_is_read_only` INSERTs a row it expects to be denied and never deleted it, so control (d) left `('x','{}')` behind — and the next `make up` died, because that row violates the new constraint, with three lines of PL/pgSQL context naming no row. | The probe now deletes unconditionally; `ensure-idp-sql.sh` lists the offending `entity_id`s and the SQL to remove them, and refuses to delete them itself — §9 calls such a row fail-open, and silently removing it would take a deployed app's sign-on away without saying so. |

**Two checks were added beyond the plan**, both because a control could not fail without
them: `idp_refuses_a_missing_attribute_list` (defect 7) and
`idp_releases_exactly_what_the_row_declares_named_by_oid`, which runs the configured
chain in priority order rather than grepping a config file. The second **catches the
priority swap the plan expected only Task 3's login to catch** — its self-review item 3
says asserting the filter is *loaded* passes just as happily when the order is reversed,
and control (b) confirms it: `authproc.idp = [core:AttributeMap, core:AttributeLimit]`
keeps the "loaded" check green while releasing nothing.

**Deviations from the plan's text, all deliberate:** `IDP_HOST` moved from Task 1 Step 3
to Step 1, so Step 2's failures are honest rather than `unbound variable`; the
`X-Forwarded-*` headers were dropped from the Caddy block (Caddy sets all three by
default and **warns** on the explicit `X-Forwarded-Host`, and `baseurlpath` is absolute
so SimpleSAMLphp does not read them); Task 2's flatfile check went to `verify.sh` rather
than `doctor.sh`, since it needs a running container; and `authsources.php` changed more
than Step 4 asked — friendly names throughout, not only the corrected PUID OID.

**State at the end of the session:** `make doctor` 16/0, `make verify` **43/0**,
`pnpm test` 381, `pnpm test:docker` 89, lint/typecheck/format clean. Two commits.

---

### Session 2 — Task 3, the end-to-end CWL login (2026-09-08). 6 defects, one of them a spec conflict.

**A real CWL login now works**, driven by `curl` from a container: the SP redirects to
the IdP, the IdP authenticates a test user, releases exactly the attributes the row
declares named by OID, and `passport-ubcshib` maps them back so the app reads
`ubcEduCwlPuid`. §16's identity-path regression tier exists, and S2's handed-forward
question — *"a known-good row still produces a known-good assertion"* — is finally
owned by a file.

| # | Task | Defect | Measured against |
|---|---|---|---|
| 10 | 3 | **The IdP could not authenticate anybody, and `make verify` was 43/0.** SimpleSAMLphp 2.x enables only `core`, `admin` and `saml`; every D6 test user is defined with `exampleauth:UserPass`. Every SSO request answered **500** — *"The module 'exampleauth' is not enabled"*. Task 1's finding one level deeper: the IdP served metadata, held a correct signing key, and no login could ever have completed. | Apache's log, on the exact `SAMLRequest` the fixture SP generated. `module.enable` is merged INTO the dist's list (replacing it would disable `core`, `admin` and `saml` and turn one broken thing into four), and `verify.sh` now instantiates the auth source — watched red with the module disabled. |
| 11 | 3 | **§12's scan gate blocked every CWL application.** `passport-ubcshib@0.1.6` → `passport-saml` (npm-**deprecated**, critical signature-verification advisory GHSA-4mxg-3p6v-xgq3 at range `*`) → `@xmldom/xmldom@0.7.13` (five highs). §12 makes dependency scanning platform-mandatory and unwaivable by an app; **C6 forbids a library change being a prerequisite**. Both could not hold: the platform could not build the thing it exists to build. | The gate's own output, then `npm audit` on the closure, then `@node-saml/passport-saml@5.1.0` measured **clean, 0 advisories**. **Rich's call, 2026-09-08:** block on a Critical/High **with a published fix**; record the rest on the Release. See the spec action below. The gate keeps its teeth — the five xmldom highs **did** block until an npm `override` took the fixture to 0.8.15. |
| 12 | 3 | The plan's fixture wrote `import { UBCStrategy } from 'passport-ubcshib'`. The library ends `module.exports = { Strategy: UBCStrategy, … }` — there is no such named export, so that is `new undefined(...)`. | `grep -n 'module.exports' index.js`. Default import, then destructure `Strategy`. |
| 13 | 3 | **`AuthState` arrives HTML-escaped.** It carries a query string, so the raw attribute value ends `…singleSignOnService?spentityid=…**&amp;**cookieTime=…`; posting it undecoded means SimpleSAMLphp cannot match the pending authentication and the flow loops. | Printed from hop 1. All three extractions now decode entities. |
| 14 | 3 | **The plan's seed warm loop would have left the mirror empty of tarballs.** `--package-lock-only` resolves metadata and downloads nothing, and Verdaccio caches a tarball when it is DOWNLOADED — so the mirror would hold package documents and no `.tgz`, which is indistinguishable from a warm mirror until the network goes away. | `find /verdaccio/storage -name '*.tgz'` — 13 present, all from the one full install the old loop did. Now a full install per lockfile, into a **temp directory** so `node_modules` never lands in a build context. |
| 15 | 3 | **Mine, and it made a negative control lie.** `stop()` passed `destroyInstance` the *instance* name where the **container** name belongs, and swallowed the error. `ensureInstance` is idempotent by name, so a stale `mf-saml-probe-staging-r1-app` survived **sixteen minutes and four runs**, and every one of those runs redeployed nothing and tested the first image ever built. Control (c) passed against an app it had already edited. | `docker ps -a` — "Up 16 minutes". The failure is now reported rather than swallowed, and the egress container is removed too. **This is the third swallowed-error defect this session.** |

**The four negative controls, each red for its own reason.** (a) authproc priorities
swapped → **nothing** released; (b) the PUID OID reverted to `…60.1.1.1` → `mail`
still arrives and `ubcEduCwlPuid` **vanishes**, which is precisely the live defect
Task 2 fixed, reproduced through a real login; (c) `attributeConfig` removed → raw
`urn:oid:` keys, S2's Evidence 11; (d) the row deleted → the IdP refuses.

**Deviations from the plan's text.** The fixture pins `express@4.22.2` and
`express-session@1.19.0` and carries an npm `override` for `@xmldom/xmldom@0.8.15` —
all three needed to get the blocking set down to what genuinely has no fix.
`runtime/testing.ts` gained `CA_CERT`, `dockerDriverForTests`, `fixtureBareRepo`,
`appContainer` and `egressContainer`, because §5's boundary rule forbids `sso/`
reaching into `runtime/docker/` and the task's instruction is to compose that
machinery rather than reimplement it. `fixtureBareRepo` is now parameterised by
source and by `extraFiles`.

**One thing left open, deliberately.** `routes.docker.test.ts`'s idempotence
assertion failed **once in five tier runs** and passed on the retry. The mechanism is
visible and matches the symptom exactly: `applyRoute` does
`deleteRoute(...).catch(() => undefined)` before its `PUT` at index 0, so a delete
that fails silently leaves **two** routes for one host. It is P3 code and was recorded
rather than changed inside this task. `fileParallelism: false` is set at the root, so
cross-file racing is ruled out.

**`SAML_IDP_CERT_PATH` names a file nothing creates.** §8 specifies it as a path
Manifest **mounts**, and `InstanceSpec` has no `files` or `binds` field — nothing in
P4a adds one. Task 11 will therefore inject a path that does not exist, and the
blueprint's `readFileSync` will `ENOENT` at startup. The fixture commits the
certificate into its own repository as a deliberate stand-in (it is public — the IdP
publishes it in its metadata). **Tasks 10-12 must resolve this properly**, and it is
the same shape as `MONGODB_DB_NAME`: a contract row with no producer.

**State at the end of the session:** `make doctor` 16/0, `make verify` **44/0**,
`pnpm test` **384**, `pnpm test:docker` **92**, lint/typecheck/format clean.

---

### Session 2b — the two things Rich asked for before Phase 3 (2026-09-08). 3 defects.

**Both were findings Session 2 recorded rather than fixed**, and he called them before
moving on. Neither is in the plan's text; both are now closed.

| # | Task | Defect | Measured against |
|---|---|---|---|
| 16 | — | **`applyRoute` swallowed a failed delete.** `putRoute` inserts at index 0 unconditionally, so idempotence rests entirely on the delete having happened; a 404 is already tolerated inside the client, so anything still throwing is a real failure being turned into a silent duplicate. | A unit test with a client whose `deleteRoute` rejects: `applyRoute` now rejects and puts nothing. Watched red first. |
| 17 | 3, 10-12 | **§8's `SAML_IDP_CERT_PATH` and `SAML_PRIVATE_KEY_PATH` named files nothing could create.** `InstanceSpec` had no `files` and no `binds`, and nothing in P4a adds one — so Task 11 would inject a path that does not exist and the blueprint's `readFileSync` throws ENOENT at startup. **A contract row with no producer, exactly like `MONGODB_DB_NAME`.** | `InstanceSpec.files`, materialised through the Engine API's archive endpoint. Negative control: remove `files` and the app never becomes reachable — 502 through the edge, 75 attempts, the readiness gate fires. |
| 18 | — | **I hit ORIENTATION's Prettier trap three times in one change.** A `python .replace()` matched **nothing** after Prettier had reformatted its target across lines, and reported success. Twice it left the test asserting values the spec did not ask for. | ORIENTATION §4 documents this exact failure and says *"assert the pattern matched before writing the file."* Every edit in that change now does. |

**Three measurements shaped the file-placement design, and each ruled out the obvious answer.**

| Probe | Result |
|---|---|
| `docker cp` into the container's rootfs | **refused** — `container rootfs is marked read-only` (§12 hardening sets `ReadonlyRootfs`) |
| `docker cp` into a **volume** path on the same container | **accepted**, and the content survives into the next container that mounts it |
| the same, with the volume mounted `:ro` | **refused** — `mounted volume is marked read-only` |

So the files live in a per-instance volume at `/manifest`, mounted **read-write**, and
**ownership carries the protection** instead of the mount flag. They are placed before
the container starts, which is not a detail: the app reads its certificate at
*construction*, so anything written after start is too late.

**And the finding that decides the file mode.** §12's `CapDrop: ALL` takes
**`CAP_DAC_OVERRIDE`** with it, so **root inside the container cannot read past
permission bits** — measured 2026-09-08, a `0400` file owned by uid 10001 was
unreadable by root, with `stat` fine and `cat` silent. §8's private key must therefore
be reachable by **ownership or group, never by privilege**: root-owned, group-readable
`0440` with the blueprint's gid. The app reads it and cannot rewrite it.

**What Tasks 10-12 inherit.** `renderInjection` should emit
`SAML_IDP_CERT_PATH=/manifest/idp-signing.crt` and
`SAML_PRIVATE_KEY_PATH=/manifest/sp-private-key.pem`, and `deployRelease` should pass
both through `InstanceSpec.files` — the certificate as `0444`, the key as `0440` with
`gid` set to the blueprint's `run_as_uid` group. **`run_as_uid` is in the blueprint
descriptor and is not on `InstanceSpec`**, so Task 11 has to thread it through; that is
the one piece this change deliberately did not do, because it belongs with the
injection call site rather than with the mechanism.

**State:** `make doctor` 16/0, `make verify` 44/0, `pnpm test` **391**,
`pnpm test:docker` **93** (twice, same count), lint/typecheck/format clean.

---

### Session 3 — sitting 1: Tasks 4 and 5 (2026-09-08). 8 defects.

**The remaining twelve tasks were split into seven sittings before any code was written**,
at Rich's request and with his approval, so a session limit can never land mid-task:
**1: Tasks 4–5 · 2: 6–7 · 3: 8–9 · 4: 10–11 · 5: 12–13 · 6: 14 · 7: 15.** Each sitting
ends with the four gates, the Docker tier where it applies, a record here, and the
close-out sweep. This is sitting 1.

**Baseline first, and it matched the handover exactly**: `make doctor` 16/0, `make verify`
44/0, `pnpm test` 391 twice, lint/typecheck/format clean.

**`secrets/` exists and has a call site.** Envelope encryption over libsodium, a
Postgres store, the `process.env` scrub wired into the real boot entry point, and
service credentials migrated from derivation to storage without breaking a running
Mongo — proved against one, including the outage the migration exists to prevent.

| # | Task | Defect | Measured against |
|---|---|---|---|
| 19 | 4 | **The plan's own test code does not typecheck.** `flipped[0] ^= 0xff` is TS2532 under this repo's `noUncheckedIndexedAccess` — indexing a Buffer yields `number \| undefined`. Every test passed; Vitest strips types without checking them, so only `tsc` saw it. Same class as P2's six. | `pnpm --filter @manifest/control-plane typecheck`. `flipped.writeUInt8(flipped.readUInt8(0) ^ 0xff, 0)`. |
| 20 | 4 | **"uses a fresh data key per secret" COULD NOT FAIL.** Hoisting the data key out of `sealSecret` so every secret shares one leaves both its assertions green: `ciphertext` differs because the nonce is random, and `wrappedKey` differs because `crypto_box_seal` draws an ephemeral keypair per call. Two seals of one value differ either way. | The control run: mutation applied, 413 passed. A second test asserts the observable consequence of reuse — one envelope's wrapped key opening another's ciphertext — and goes red under the same mutation. |
| 21 | 4 | **The migration number the plan names is taken, and Task 8 must not reuse the file.** P3 shipped `0001` and `0002`; drizzle-kit generates the name, so this is `0003_steep_pepper_potts.sql`. The journal means an APPLIED migration is never re-run, so Task 8's "modify `0001_secrets_and_events.sql`" would write SQL that never executes on any existing database. | `drizzle/meta/_journal.json`, and `db:migrate` applying 0003. **Task 8 needs its own migration.** |
| 22 | 4, 5 | **`withRollback` has no context to destructure.** Both tasks' tests read `(db, { projectId, keys, masterSecret })`; the real helper takes `(tx) => Promise<void>` and creates no rows, and `secrets.project_id` is a real foreign key. | `db/testing.ts`. Added `withProject` there (a unique slug per call — `projects_slug_key` is unique and P2 paid for two tests reaching for `chem-labs`) and `withSecretScope` in `secrets/testing.ts`, which composes it with a per-call keypair. |
| 23 | 4 | **`secrets` was missing from `resetDatabase`'s TRUNCATE list**, which is the thing that makes `pnpm test` repeatable. Found by reading rather than by failing — the API tests commit, so a row would have outlived its test and surfaced later as an order-dependent failure. | `db/testing.ts`'s TABLES list, which the plan does not mention. |
| 24 | 5 | **`ServiceBinding.credentials` had no producer until Task 9.** Step 4 makes the field required and says "`deployRelease` (Task 9) fills it" — but `deployRelease` builds that binding today, so between Task 5 and Task 9 every deploy is broken. **A contract field with no producer, the same shape as `MONGODB_DB_NAME` and `SAML_IDP_CERT_PATH`.** | `tsc` naming `releases/release.ts` the moment the field became required. Task 9's `deps` parameter was pulled forward carrying `{ secrets }` only; Task 9 adds `sso` to the same object. Rejected: an OPTIONAL `credentials` with the driver deriving a fallback — that is two producers of one value, which is what cost P3 seven defects in one session. |
| 25 | 5 | **Decision 8's prose and its own code disagree.** The prose says "New services generate a random secret and store it"; the code adopts the derived value unconditionally on first call. Nothing at this layer can tell a new service from an existing one — the container is the driver's knowledge, and §5 keeps the driver away from `db/`. | Implemented as the code does, and the reason is now in the function. Adopting the derived value for a new service is exactly what P3 already did, so nothing is weaker than today; randomness arrives for free when `deriveCredentials` is deleted. |
| 26 | 5 | **The fake driver's endpoint carried no credentials**, so `driver-contract.ts` — the suite both drivers share — could not distinguish a driver that uses `binding.credentials` from one that ignores them entirely. The Docker driver builds its URI from them; the fake built `mongo://<name>.fake:27017`. | A new contract assertion that the endpoint carries the username, password and database it was handed. Watched RED against the fake, then the fake was made to honour it. |

**The negative controls, each watched red and reverted.**

| Control | Result |
|---|---|
| (a) hoist the data key out of `sealSecret` | the new reuse test RED — **the plan's own test stayed green**, which is defect 20 |
| (b) `rewrapSecret` re-seals the payload too | "re-wraps … WITHOUT touching the ciphertext" RED — §20's rotation argument |
| (c) `env[name] = undefined` instead of `delete env[name]` | the scrub test RED, showing the key still present: a child process receives the literal text `undefined` |
| (d) a SECOND master key, minted by the real `ensure-master-key.sh` | `could not unwrap the data key — this envelope was sealed for a different master key`. Also proves the script's file and `loadMasterKeypair` agree on format |
| (e) `putSecret` treats every put as a rotation | the `rotatedAt` test RED |
| (f) `secretValuesFor` drops the environment-kind filter | the scoping test RED, returning sandbox's value under staging's name |

**One thing was verified by hand rather than by a test, because no test could:** the
master keypair `openssl` mints is a *curve25519* keypair libsodium accepts. `tail -c 32`
off the DER encoding gives 32 bytes for each half whether or not the extraction is
right, so length proves nothing. Sealing and opening with the file's own two halves
round-trips, and a different private key cannot open it.

**Deviations from the plan's text, all deliberate.** The store's `rotatedAt` is set only
when the plaintext changed, which means `putSecret` opens the stored envelope to compare
— comparing ciphertext would report a rotation on every deploy, since a fresh data key
per seal makes the same plaintext encrypt differently every time. `deployRelease` takes
a bound `ServiceCredentialResolver` rather than a `MasterKeypair`, so `releases/` never
holds key material and `ServerDeps` grew by one field; that is the shape Task 7 already
specifies for `SsoRegistrar`. `services.docker.test.ts` gained a test that runs the whole
migration against a real Mongo — the plan asked for the authentication error to be
*recorded*, and it is a permanent assertion instead.

**State at the end of the sitting:** `make doctor` 16/0, `make verify` 44/0,
`pnpm test` **420** twice, `pnpm test:docker` **95** (17 files, 0 failed, 318 s),
lint/typecheck/format clean. Two commits.

**One check deliberately NOT added, with the reason.** `make doctor` does not assert
the secrets master key exists. The failure it would catch is already loud and already
names the file: `loadMasterKeypair` refuses to boot the control plane and says *"cannot
read the secrets master key at '<path>'. Run `make up`, which calls
infra/lib/ensure-master-key.sh."* A doctor check would restate that in a second place
without completing any operation the boot does not already complete — which is the
shape this project keeps recording as worthless.

**What sitting 2 inherits.** Task 6's `ensureSpKeypair` and Task 7's `registerServiceProvider`
both take `(db, keys, …)`, and `withSecretScope` in `secrets/testing.ts` is what their
tests should use — it hands over a rolled-back transaction with a project row, a
per-call master keypair and a master secret. Task 7's `createSsoRegistrar(pool, keys)`
should be bound and added to `DeployDeps` in `releases/release.ts`, which now exists and
carries `{ secrets }`; Task 9 then has only its ordering assertion left to do.
**Task 8 must create its OWN migration** rather than modifying `0003` — drizzle-kit
keeps a journal and an applied migration is never re-run.

---

### Session 4 — sitting 2: Tasks 6 and 7 (2026-09-09). 9 defects.

**Baseline first, and it matched the handover exactly**: `make doctor` 16/0, `make verify`
44/0, `pnpm test` 420 twice, lint/typecheck/format clean, and the IdP serving signed
metadata with the right entityID.

**`sso/` exists and produces a working registration.** A per-app RSA-4096 keypair
stored as two Secrets, §9's D15 derivation, S2's worked `entity_data` as one renderer,
the `manifest_idp` metadata store, and `registerServiceProvider` composing the three.
**A real CWL login now completes through a row `sso/` itself rendered**, with the
AuthnRequest signed by the per-app key — and is refused when the row pins a different
certificate, and refused again when the SP does not sign at all.

| # | Task | Defect | Measured against |
|---|---|---|---|
| 27 | 6 | **Step 3 names an implementation that cannot exist.** `node:crypto` generates keypairs and *parses* X.509; it has no API that ISSUES a certificate, at any Node version. A new dependency needs the network and a Verdaccio warm-up in a plan whose builds must work offline, and hand-rolling ASN.1 is what Decision 7 rejected in principle. | `openssl` is spawned instead, the way `source/` spawns `git`. Verified identical on both flavours present here — LibreSSL 3.3.6 at `/usr/bin/openssl` and OpenSSL 3.6.3 from Homebrew — with `-keyout /dev/stdout`, so the private key never touches a file. |
| 28 | 6 | **`ensureSpKeypair`'s scope carries no slug, and the task's own test asserts the certificate subject names the app.** Parsing the slug back out of a URL Manifest itself derived is the re-derivation shape that cost P3 seven defects in one session. The entityID cannot be the common name either. | Measured: `-subj "/CN=https://…"` is refused outright — `req: Missing '=' after RDN type string`, because `/` is openssl's RDN separator — and at §7's 39-character slug limit the entityID is **76 bytes against X.509's 64**. The scope gained `slug`; the entityID is carried verbatim in a `subjectAltName` URI, where length is unbounded, and the test asserts it. |
| 29 | 6 | **My own first control could not fail.** "Transpose the two secret names" is symmetric — storage and retrieval swap together — so the pairing test stayed green. The test as written could only have failed if one openssl invocation had returned a mismatched pair, which it cannot. | The control run. The test now reads both halves back through `getSecret` and signs with one against the other, and goes red under the transposition that matters: the two VALUES stored under each other's names. |
| 30 | 6 | **The control plane has two undeclared host-tool dependencies and `make doctor` asserts neither.** `openssl` joins `git`, which has been a hard requirement since P2 and is not checked. A first draft of the comment claimed doctor checked it. | `grep -n openssl scripts/doctor.sh` — nothing. Not fixed here: a check for one and not the other would be worse, and the failure is legible (the spawn error is wrapped in a message naming the entityID). **Raised for Rich** rather than decided. |
| 31 | 7 | **"Three callers must be updated in the same commit or the whole suite goes red" was nine.** `MANIFEST_IDP_DATABASE_URL` is required, so every `loadConfig` caller had to move: five test env literals, `api/testing.ts`, `vitest.env.ts`, the README export block, and the global setup. | `tsc`, then the suite. `ensureDatabaseUrl` became `ensureDatabaseUrls` and derives both URLs **side by side from one password**, never one from the other — the running system keeps them as two independent settings and a helper that derived one from the other would test a shape the platform does not have. |
| 32 | 7 | **`vitest.global-setup.ts`'s TRUNCATE list still lacked `secrets`.** It is a SECOND copy of the list Session 3 fixed in `db/testing.ts`, in a different process for a reason the file documents. No behaviour changed — `TRUNCATE … CASCADE` reaches `secrets` through its foreign key — but the two lists had already drifted once. | Read, not failed. Both lists now name every table. |
| 33 | 7 | **SimpleSAMLphp validates any signature that is PRESENT, whether or not the row asks it to.** Making the fixture SP sign broke two of Task 3's tests, whose hand-written rows carry no `certData`: *"Missing certificate in metadata for 'https://manifest.internal/sp/saml-probe/staging'"* — which reads as a missing registration rather than a missing key. | The IdP's own Apache log, on the exact request. `SpRow` gained an optional `certData` and the fixture puts in the certificate it signs with. **The consequence for the platform: `certData` is not optional for any app that signs, which is every app `renderSpMetadata` registers.** |
| 34 | 7 | **The plan's control (b) cannot prove what it is for.** It asks for a login test that signs with the WRONG key — but by defect 33 that is refused whether or not `validate.authnrequest` is set, so the flag can be deleted and nothing goes red. Only an SP that does **not** sign can show the flag doing anything. | A second deployment that does not sign, registered with a rendered row: refused. Watched red with `'validate.authnrequest': false`, where the unsigned login **succeeded with a 200**. That is S2 Evidence 8's first control, which nothing in this repository had ever run. |
| 35 | 7 | **The login probe truncated every body at 400 characters, and the IdP's error page does not carry the reason anyway.** `showerrors` is off, as it must be on a deployed IdP, so the page says only "Unhandled exception" — the earlier assertions passed because SimpleSAMLphp puts a *titled* error's title in `<title>`, and an uncaught exception has no such title. | Raised to 4000 characters (which did not help, and is kept because it is the only record when a hop fails), and the unsigned-SP assertion moved to the IdP's **log**, read through the Engine API and **counted before and after** — a line left by an earlier run must not stand in for a refusal that did not happen. |

**The negative controls, each watched red and reverted.**

| Control | Result |
|---|---|
| (a) `rsa:2048` | the modulus assertion RED, naming 2048 |
| (b) `ensureSpKeypair` always regenerates | the idempotence test RED |
| (c) armoured PEM as `certData` | the row-encoding assertion RED |
| (d) the two keypair halves stored under each other's names | the new pairing test RED, and idempotence RED with `PEM routines::no start line` |
| (e) the `subjectAltName` dropped | the entityID assertion RED |
| (f) the expiry computed from `VALIDITY_DAYS` instead of read off the certificate | RED by 44 ms — the certificate's own seconds-resolution date is the one that will be enforced |
| (g) the ACS built with `new URL(callback, origin)` | six refusal tests RED. Recorded, because it is the point: `https://evil.example/acs` and `//evil.example/acs` **both** produced an ACS at the attacker's origin — §9's assertion-phishing primitive, from the obvious implementation |
| (h) the previous row read AFTER the upsert | `previousAcsUrl` RED and `changed` RED — §9's ACS alert is unrecoverable one statement later |
| (i) `changed: true` unconditionally | the re-registration test RED |
| (j) the CHECK constraint dropped from the live IdP database | both refusal tests RED. Restored with `infra/lib/ensure-idp-sql.sh`, constraint verified present, zero rows left behind |
| (k) `'validate.authnrequest': false` | the unsigned-SP test RED with a **200** |

**Deviations from the plan's text, all deliberate.** `registration.test.ts` and the
metadata-store suite are **Docker tier**: the table is the IdP container's artefact and
the constraint is `make up`'s, and the alternative was a stub pool — a second
implementation of the store, which is the shape that cost P3 seven defects.
`mintSpKeypair` is exported so the login suite and `ensureSpKeypair` share one
implementation rather than two. `deriveSpEntity` refuses three things beyond the plan:
a provider that is not `cwl` (which would otherwise be refused with a message about
attributes, sending the reader to the wrong line), an entity base that is not a bare
https origin, and a hostname that is not a bare hostname. `createSsoRegistrar` takes
`entityBase` as a third bound argument — the plan's two-argument form has no source for
§9's platform domain — and `MANIFEST_SP_ENTITY_BASE` is the new setting behind it, whose
only consumer is Task 9. **`.env.example` was NOT changed**, though the plan lists it:
nothing loads `.env` into the control plane, so the variable belongs in README's export
block, which is the documented path.

**State at the end of the sitting:** `make doctor` 16/0, `make verify` 44/0,
`pnpm test` **439** twice, `pnpm test:docker` **108** (19 files, 0 failed, 334 s),
lint/typecheck/format clean. Two commits. Zero rows left in `saml20_sp_remote`.

**What sitting 3 inherits.** `SsoRegistrar` is built and **has no caller** — Task 9's
whole job is to give it one: construct `createIdpPool(config.idpDatabaseUrl)` and
`createSsoRegistrar(pool, keys, config.spEntityBase)` at boot, add `sso` to the
`DeployDeps` object that already carries `{ secrets }`, and register **before**
`ensureInstance`. `registerServiceProvider` already returns exactly what Task 8's events
need — `changed`, and `previousAcsUrl` when the ACS moved, read before the write because
it is unrecoverable after it. **Task 8 must still create its OWN migration**; `0003` is
applied and drizzle-kit never re-runs an applied migration.

### Session 5 — sitting 3: the doctor addendum, then Tasks 8 and 9 (2026-09-09).

**Baseline first, and it matched the handover exactly**: `make doctor` 16/0, `make verify`
44/0, `pnpm test` 439 in 50 files.

**`events` exists, is append-only against a role that can actually be constrained, and
`registerServiceProvider` has a caller.** Tasks 8 and 9 are done. The sitting also
carried an addendum Rich asked for.

**Addendum, at Rich's request and decided by him: `make doctor` now asserts the host
tools the control plane spawns.** Session 4 raised it (defect 30) and left it; this
closes it. `make doctor` is **17 checks** from here on, and the sweep moved the four
documents that quote the number.

**It found two more undeclared host dependencies than the two that prompted it.** The
question was about `git` and `openssl`. Writing the check meant listing every `execFile`
in `src/` that is not `docker`, and the list is four:

| Tool | Call site | What the check runs |
|---|---|---|
| `git` | `source/local-driver.ts`, `build/context.ts` | `init` · `commit` · `show -s --format=%ct` · `archive --format=tar` — `sourceDateEpoch`'s and `assembleContext`'s own calls, in a scratch repo |
| `tar` | `build/context.ts` | `tar -x -f` of what git just archived, asserting the file comes back with its contents. **Two processes, not a pipe** — the same composition, for the reason P3 Session 4 paid for |
| `openssl` | `sso/keypair.ts` | `mintSpKeypair`'s exact invocation, `-keyout /dev/stdout` included, then `x509 -noout -text` asserting **4096 bits and the `subjectAltName` URI** |
| `docker buildx` | `runtime/docker/builder.ts` | a throwaway `DOCKER_CONFIG` with `~/.docker/cli-plugins` symlinked into it, exactly as `runBuildxBuild` builds one, then `buildx version` through it |

**Two things are load-bearing about how it is written.**

- **It RUNS each tool rather than looking on `PATH`**, and this is not ceremony.
  Presence has never been the failure that costs anything here: macOS ships LibreSSL at
  `/usr/bin/openssl`, Homebrew puts OpenSSL ahead of it, and `-addext` — which
  `mintSpKeypair` depends on — is a flag older LibreSSL does not have. `command -v
  openssl` passes on a machine where no app can be registered for sign-on.
- **The buildx probe asserts the SYMLINKED path, not the command.** `runBuildxBuild`
  sets `DOCKER_CONFIG`, which moves CLI-plugin discovery with it, so the requirement is
  `~/.docker/cli-plugins/docker-buildx` specifically. Buildx installed anywhere else
  passes a plain `docker buildx version` and then fails every build with `unknown flag:
  --builder`, which reads as a version problem and is not one. That symptom is now a
  RUNBOOK row.

Each probe asserts the **shape** of what came back — 4096 bits, the SAN URI, the
extracted file's contents — rather than that a command exited 0, which is S3's lesson.
The check is one check, not four, for the reason Session 4 gave for adding none: the
output names whichever tool failed. It costs ~0.9 s (RSA-4096 is 0.45 s of it) and
needs no daemon, so doctor still runs with nothing up.

**The negative controls, each watched red and reverted.**

| Control | Result |
|---|---|
| (a) a shim `git` on `PATH` that exits 127 | RED, `CANNOT DO WHAT THE CONTROL PLANE ASKS: git/tar` |
| (b) a shim `tar` | RED, same line — the archive is written and cannot be unpacked |
| (c) a shim `openssl` | RED, naming openssl |
| (d) `HOME` pointed at a directory with no `.docker/cli-plugins` | RED, naming `docker-buildx`. `ln -s` to a missing target SUCCEEDS on POSIX, which is why the probe uses the plugin rather than testing for the directory |
| (e) `rsa:2048` in the probe | RED — the 4096-bit assertion does something |
| (f) `-addext` deleted from the probe | RED — the SAN assertion does something |

Controls (e) and (f) were applied by `sed` **with a `diff` asserting the file changed**
before the run, because a mutation that matches nothing reports success and proves
nothing — §4's Prettier trap, in its other clothes. The real
`~/.docker/cli-plugins/docker-buildx` was verified untouched after (d).

---

**Tasks 8 and 9 found 8 defects. The first one is the sitting.**

| # | Task | Defect | Measured against |
|---|---|---|---|
| 36 | 8 | **§20's control was not merely missing, it was UNIMPLEMENTABLE.** The plan's migration creates an owner role and REVOKEs from `manifest` — but `manifest` is `POSTGRES_USER` and therefore a **superuser**, and a superuser bypasses every privilege check in Postgres. The plan spotted the ownership trap and not the superuser one, and its own negative control (a) would have shown nothing. | Measured before writing a line: `REVOKE UPDATE, DELETE ON ctl_probe FROM manifest` → `REVOKE`, then `UPDATE 1`, `DELETE 1`. The fix is `infra/lib/ensure-app-role.sh` and a real application role — see the decision below. |
| 37 | 8 | **The foreign key was a hole straight through the grant.** With `UPDATE`, `DELETE` and `TRUNCATE` on `audit.events` all correctly refused, `manifest_app` deleted the project and the audit rows went with it: a referential action runs with the REFERENCED table's privileges, not the caller's. | `events_after_project_delete = 0`, as `manifest_app`, against a working grant. `ON DELETE restrict`; nothing in the control plane deletes a project, so it costs nothing today and makes the first code that wants to decide. |
| 38 | 8 | **`rejects.toThrow(/permission denied/i)` — the plan's own assertion — matches nothing.** drizzle wraps every driver error in its own, whose message is `Failed query: UPDATE audit.events …`; the real one is on `.cause`. The query WAS being refused and the test was red for the wrong reason, and would have gone green against a broken control the moment somebody relaxed it to a bare `.rejects.toThrow()`. | The failure output. `expectSqlState` walks the cause chain for `42501` / `23503` — the SQLSTATE, which a message match cannot fake. |
| 39 | 8 | **`ResolvedConfig` has no `auth` field, so Task 9's condition could not be read at all.** The plan says "every environment whose resolved spec has `auth.provider === 'cwl'`"; `resolve.ts` drops the whole `auth:` block. | `tsc`. `auth` is carried through now — §7 permits no override of it. Reading the raw spec back out of `app_specs` was rejected: §13 FROZE the resolved config at release time, and a second source of truth beside it is P3 Session 5's shape exactly. Task 10 is the second reader. |
| 40 | 8 | **My own redaction test at the call site could not fail.** "Never writes the SP private key into an event" passes because nothing ever puts it there — the control (identity redactor at the call site) left the whole suite green. Same shape as defects 20 and 29: three sittings running. | The control run. Rewritten with a canary where app-supplied text genuinely reaches `machine_detail` — `auth.callback` lands in `acsUrl` verbatim — plus a secret of that value. Goes red under the same mutation, showing the canary in the persisted row. |
| 41 | 8 | **Releases frozen before `ResolvedConfig.auth` existed have no `auth` key**, so `resolved.auth.provider` would throw and take an existing developer's next deploy with it. | Read, not failed — the shape `MONGODB_DB_NAME` and `ServiceBinding.credentials` already taught. Treated as no sign-on, which is what those releases were deployed with, and it has its own test. |
| 42 | 9 | **`api/testing.ts` and `releases.test.ts` needed an `sso` dependency, and a STUB would have been wrong.** Every app either harness deploys declares `auth.provider: none`, so a stub returning a plausible registration would silently absorb a registration that should never happen. | Both throw with a message naming the cause. If the guard in `deployRelease` ever stops working, the suite says so rather than passing. |
| 43 | 9 | **The plan's Task 9 has no test that runs the REAL registrar.** Its recorder proves the ORDER, which is the right tool for an ordering question and accepts whatever it is handed for everything else — entityID derivation, the origin refusal, the keypair, the metadata row and the events were all unreached from `deployRelease`. | `releases/deploy-sso.docker.test.ts`, added beyond the plan. It asserts the row at the entityID D15 derives, its ACS built from the ENVIRONMENT's hostname, its `certData`, and the audit event. Watched red with the call deleted. |

**One decision this sitting made, and it is bigger than a task.** **The control plane
now connects as `manifest_app`, a least-privilege role, and so does the whole test
suite.** `manifest` keeps its superuser attributes and remains what migrations and the
harness's `TRUNCATE` use, through a new `MANIFEST_ADMIN_DATABASE_URL` that `src/` never
reads. Three things were rejected: leaving §20 unimplemented and recording it (shipping
a control that reads as one and is not is worse than shipping none, and this project has
paid for that twice); demoting `manifest` itself (nothing could then truncate the audit
table between tests, and granting the application `TRUNCATE` is the same loophole in a
different hat); and running the suite as the superuser while only production used the
role (every test would then exercise privileges the running system does not have, which
is the false green this whole change exists to remove). **Running the suite as the
application role cost nothing and found nothing** — 439 tests passed unchanged on the
first run, which is itself the evidence that the grants are complete.

**`events` lives in an `audit` SCHEMA rather than in `public`**, and that is the control
rather than a filing decision. Every blanket grant in this repository is scoped
`IN SCHEMA public` — `GRANT … ON ALL TABLES`, `ALTER DEFAULT PRIVILEGES` — so none of
them can reach it, now or in a year. The alternative was to grant everything on `public`
and revoke on one table by name, which converges only as long as every future author
remembers the exception. Granting exactly two verbs is stronger than granting four and
taking two back.

**The negative controls, each watched red and reverted.**

| Control | Result |
|---|---|
| (a) `GRANT UPDATE, DELETE, TRUNCATE ON audit.events TO manifest_app` | both append-only tests RED |
| (b) the suite connected as the superuser `manifest` | three tests RED, and the UPDATE, DELETE and TRUNCATE all **succeeded** — this is defect 36, reproduced as a control |
| (c) the six-character floor removed from `makeRedactor` | the short-secret test RED |
| (d) the longest-first sort removed | the nested-secret test RED, leaving `[REDACTED]xyz` |
| (e) the foreign key restored to `ON DELETE CASCADE` | the cascade test RED — the project delete succeeded and took the event |
| (f) the identity function as the call site's redactor | the canary test RED, showing `CANARY-…` in the persisted `machine_detail`. **Green before the test was rewritten** — that is defect 40 |
| (g) the verbs granted back, against `make verify` | the new check RED, naming `UPDATE DELETE TRUNCATE CASCADE`, with zero rows left behind |
| (h) `registerServiceProvider` moved after `ensureInstance` | the ordering test RED with `['instance','sp']` |
| (i) the call deleted | the ordering test RED with `['instance']`, and the values test RED. Both, because "called late" and "not called" are different defects |
| (j) the `auth.provider === 'cwl'` condition removed | six unrelated deploy tests RED — every app on the platform would register an SP |
| (k) the call deleted, against the REAL-registrar Docker test | RED, no metadata row. Zero IdP rows left behind |

**Deviations from the plan's text, all deliberate.** The migration creates no
`manifest_audit_owner` role: that role exists in the plan only because the plan assumed
the application connects as the table's owner, and with `manifest_app` there is nothing
to own around. There is no `REVOKE` either — the `audit` schema means there is nothing
to revoke. `EVENT_TYPES` is enforced at runtime as well as in the type, because a type
is not there for a JSON body. `make verify` gained a check (45), which the plan does not
ask for: this control is SILENT when it breaks — no failure, no log line, the audit log
simply becomes editable — and that is exactly the kind this project keeps finding green.

**State at the end of the sitting:** `make doctor` **17/0** (16 before the addendum),
`make verify` **45/0**, `pnpm test` **458** twice, `pnpm test:docker` **111** (20 files,
0 failed, 350 s), lint/typecheck/format clean, and **`make demo` green end to end**
against the new boot path and the least-privilege role. Three commits.

**What sitting 4 inherits.** Tasks 10–11: `spec/injection.ts` as §8's frozen table, then
its call site. `ResolvedConfig.auth` now exists and Task 10 is its second reader, so the
injection function does not need to reach for the raw spec. `run_as_uid` is still in the
blueprint descriptor and still not on `InstanceSpec` — Task 11 has to thread it, along
with `InstanceSpec.files` for `SAML_IDP_CERT_PATH` and `SAML_PRIVATE_KEY_PATH`. Note
that `deployRelease` now takes `deps = { secrets, sso }`, and that the test suite runs as
`manifest_app`: a new table needs no action (`ALTER DEFAULT PRIVILEGES` covers it), but
anything that needs DDL at runtime will be refused, which is the point.

---

---

## Spec actions proposed by this plan

**Not applied.** The spec is approved design and changing it is Rich's call; this is the record, in the same form the spikes and P3 used. P3's own six were applied on 2026-09-07 with his approval, before this plan was written.

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| §9, *Sandbox and staging* | *"`docker-simple-saml` keeps its IdP role here."* | Replace with: the **Manifest IdP** (`infra/idp/`) keeps this role — an image Manifest builds from `php:8.3-apache` plus SimpleSAMLphp 2.x, with **no dependency on `docker-simple-saml` running or existing**. | The sentence names a repository that is read-only to this project and is not part of the platform. P1 built a separate IdP deliberately; the spec still points at the spike's subject. |
| §9, *Registration hardening* | *(add a bullet)* | "**The IdP's hosted entity and signing keypair are deployment artefacts, not defaults.** SimpleSAMLphp ships only `saml20-idp-hosted.php.dist` and an empty `cert/`, so an IdP deployed without both **serves, answers health checks, and cannot issue an assertion** — measured 2026-09-07, with `make verify` green throughout. The entityID is configuration and is never derived from the request host." | This is the failure this plan's Task 1 exists to fix, and it is invisible to every check that does not complete a login. It belongs next to the other registration-hardening bullets rather than only in a plan. |
| §8, `SAML_ENTRY_POINT` row | *"the IdP SSO endpoint. Required because `UBC_CONFIG.LOCAL` hardcodes `http://localhost:8080/simplesaml/...`"* | Add the measured 2.x paths: SSO `/module.php/saml/idp/singleSignOnService`, SLO `/module.php/saml/idp/singleLogout`, metadata `/module.php/saml/idp/metadata`. The library's hardcoded values are SimpleSAMLphp **1.x** paths and 404 against 2.x. | The row explains *why* the variable is required and not *what to put in it*. The 1.x/2.x difference is the part that costs an afternoon, because a 404 from the IdP reads as "the IdP is down". |
| §8, injection table | *(the `MONGODB_URI, MONGODB_DB_NAME` row)* | No wording change — but record that as of 2026-09-07 only `MONGODB_URI` was injected, that the two Docker tests set `MONGODB_DB_NAME` themselves, and that every deployed app therefore wrote to a database called `app`. | §8 was right and the implementation was not, which is exactly what the drift tier exists to catch and did not, because no drift test existed. Worth recording next to the row so the next reader knows the test earned its keep. |
| §21, *Platform inventory* | *(the Postgres row, already amended by S2)* | Add: the IdP metadata database needs **two roles** and P1 shipped one — `ssp_ro` for the metadata source and `manifest` for the control plane's writes. Until 2026-09-07 SimpleSAMLphp connected as the read-write owner. | S2 raised this and it was recorded as a spec action against §21; the role was never created. Naming the gap alongside the requirement stops it being missed a second time. |

| §12, *Supply chain* | *"dependency and secret scanning run as **platform-mandatory build gates** on every build — they are not app-declared and cannot be waived by an app"* | Add: "A Critical or High finding blocks **only when a fix is published**. One with no available fix is recorded on the Release and reported to the owner for §20's fleet-wide rebuild, exactly as a base-image finding is — a gate that blocks on what nobody can fix stops deployments without making anything safer." | **Rich approved this change on 2026-09-08; the spec text is not edited here, per the standing rule.** Measured: `passport-ubcshib` → `passport-saml` (deprecated, critical, range `*`) → `@xmldom/xmldom` (five highs) blocked **every** CWL application, which is every application the platform exists to deploy. §12 as written and C6 could not both hold. Implemented in `build/scan.ts`; the teeth are preserved — the xmldom highs still blocked until an npm override cleared them. |

**And one thing deliberately NOT proposed.** Attaching `manifest-litellm` to every app network (P4b) looks like it needs a §12 change and does not: §12's east-west list already reads *"app or sandbox → LiteLLM's admin **routes**. **Not a port rule.**"*, which the S3 action put there. The topology change is consistent with the text as it stands. It does, however, change what S6 measured, so P4b re-runs that tier rather than assuming it still holds.
