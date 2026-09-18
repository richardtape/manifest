# P5b — Delegated Tokens and Pending Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agent holding a scoped delegated token can run §22's whole build loop — create a project, read everything about it, build, deploy to sandbox and staging, stream events — and is refused D24's privileged four **centrally, not per route**, each refusal producing a `PendingAction` that a human confirms in an interactive session, after which the agent's retry succeeds exactly once.

**Architecture:** A second credential class beside the session cookie. `Actor` becomes a **discriminated union on `credential`**, so "this route is interactive-only" is a type-level property rather than a remembered check, and the one `onRequest` hook that turns a cookie into an actor learns to turn `Authorization: Bearer` into one too. `projects/authz.ts`'s `assertCapability` — the single function 21 call sites already go through — refuses a privileged capability to a token by throwing; **one place, the `registerRoutes` wrapper, catches that throw and records the `PendingAction`**, because that is the only layer that can see the request being refused. Confirming a pending action does not replay it server-side: it grants a **one-shot retry** of that exact request, so the action executes through its normal route with its normal validation. Per-token rate limits generalise P5a Task 9's in-process limiter.

**Tech Stack:** TypeScript on Node 24.12.0, Fastify 5.12.3, zod 3.25.76 (`zod/v4` for every contract schema), Drizzle over Postgres 16, Vitest 2.1, the custom Caddy 2.11.4 edge, `openapi-typescript` 7.13.0 and `openapi-fetch` 0.17.0. **No new dependency** — token secrets use `node:crypto`, which is why this plan has no network sitting (P5a Task 7 was the only one that ever needed one).

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **D24** in full (the two credential classes and the privileged four); **§20** *Credential classes*, *Manifest's own front door*, *Machine-actionable errors*, *Authorization*; **§6**'s `DelegatedToken` and `PendingAction` rows; **§22** D23.4 (the API is the only integration point, authentication included), D23.6 (idempotency), D23.7 (machine-actionable errors); **§26** *The primary screen is the queue*; **§16** *Security regression* and the authorization contract suite; **§17**'s 1c row; **§13** for the capabilities a role holds.

**Brief:** [`2026-09-16-p5-brief.md`](./2026-09-16-p5-brief.md) — §4's gap table (delegated tokens are its one row marked *large, security*), §6's defaults, §7 items 5 and 6, and **§8's traps**. Read it before this plan.

**Predecessor:** [`2026-09-16-p5a-the-contract.md`](./2026-09-16-p5a-the-contract.md), executed 2026-09-17. **Read its *What this plan does not build*** — the P5b list there is this plan's scope — **and its sitting 12 record**, whose three controls that could not fail are why every control below names the assertion rather than the mechanism.

**Roadmap:** the **P5b** row in [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md).

---

## How this plan is to be executed — NINE SITTINGS, one per session

**The pattern that carried P4a's last twelve tasks, all of P4b, all of P4c and all twelve of P5a: one sitting per session, with a check-in at each boundary**, so a session limit can never land mid-task. **Executing two sittings in one session is not a shortcut** — it is how a limit lands inside a task. This plan commits after every task; a stop *between* tasks is recoverable, a stop *inside* one is not. **"Sitting", not "phase"** — this project uses *Phase 1c* and *Phase 2* for §17's product roadmap.

| Sitting | Tasks | What it delivers | Status |
|---|---|---|---|
| 1 | 1 | **The measurements this plan rests on**, before any code: whether `assertCapability` is actually central, whether `release:deploy` can tell production from staging, whether a bearer header survives the edge, what the token hash should be, and whether a stream upgrade can carry a token. **Alone, and first** | ✅ **DONE 2026-09-17 — 11 findings.** Corrections at the top of Tasks 2, 5, 6, 7 and 11 |
| 2 | 2–3 | **The privileged set named once**, with §20's alignment test, and **the two tables** with the token's shape and its `tokens/` module | ← next — **blocked on the four *Spec actions*** |
| 3 | 4–5 | **Minting, listing and revoking** a token in an interactive session; then **bearer authentication** — one place turns either credential into an `Actor` | |
| 4 | 6 | **The central refusal, and the `PendingAction` it creates.** The heart of D24. **Alone** | |
| 5 | 7 | **Confirm, reject, and the one-shot retry** — the loop closing. **Alone** | |
| 6 | 8–9 | **The queue** (§26's primary screen, as a read) and **per-token rate limits** | |
| 7 | 10–11 | **Expiry** for both entities, and **the authorization contract suite's token actors** — the matrix roughly doubles | |
| 8 | 12 | **`make demo-token`** — an agent runs the build loop on a token, is refused twice, a human confirms, and the retry succeeds | |
| 9 | 13 | **The acceptance**, three times, once from a `make reset` machine, with its negative controls. **Alone, and last** | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. the four gates from *Global Constraints*, plus `pnpm test:docker` for every sitting that touched `runtime/`, `routing/`, `releases/`, `identity/`, `projects/`, `blueprints/`, `infra/` or a `*.docker.test.ts` — **which for this plan is sittings 3 onwards**, because `projects/authz.ts` is in the Docker tier's blast radius;
2. a dated entry in *What executing this plan found* — the tasks, every defect with the measurement that found it, the negative controls, and the gate numbers;
3. **the sittings table above, updated** — mark the sitting done, move the `← next` marker, say how many findings it produced;
4. **the close-out sweep in ORIENTATION §6**, whose first line is the roadmap ledger. The gate numbers are stated in three documents — ORIENTATION §2's box, README and RUNBOOK (CLAUDE.md has stated none since 2026-09-16) — and move together.

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Task 1 may move task boundaries — that is its job — and if it does, re-cut the sittings before starting sitting 2 and say so in the session record. Three rules survive any re-cut: **Task 1 stays first and alone**, **Task 6 stays alone** (it is the plan's one irreversible design commitment), and **Task 13 stays alone and last**.

---

## Read this first — what this plan knows that the brief does not

Read or measured on 2026-09-17, immediately after P5a's acceptance, while this plan was written. **Every item is a fact about the platform as it stands, not a prediction**, and Task 1 re-measures the ones marked *(T1)*.

1. **[CORRECTED BY `[M1]`, 2026-09-17 — the count and the conclusion were both wrong. It is 16 non-test call sites, six modules bypass it, and THREE must change, not one. See Task 5's and Task 6's corrections.]** **`assertCapability` has 21 call sites and is the only project-scoped authorization function** — which is what makes D24's "enforced centrally at the authorization layer, not per-route" achievable at all. **But five `/v1` route modules never call it**: `blueprints.ts`, `fleet.ts`, `me.ts`, `projects.ts` (creation — no project exists yet to be a member of) and `slugs.ts`. Four of those are fine for a token; **`fleet.ts` is not** — it checks `actor.platformRole !== 'admin'` inline, so a token minted by an administrator would read every project on the platform if nothing else changed. *(T1 re-measures the full list from the route registry rather than from a grep.)*
2. **`release:deploy` cannot tell production from staging.** One capability covers every environment; production is refused later and separately, by §13's launch gate (`409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, P5a Task 15). So **"production promotion" is not a capability today**, and D24's first forbidden item has nothing to name until this plan adds one. *(T1)*
3. **`actor.puid` is read by no route handler** — `grep` finds it only in the `SessionActor` type, the session hook that sets it, and tests. `api/representations/members.ts` reads `puid` from a database row, not from the actor. **So turning `Actor` into a discriminated union is a cheap refactor**, not the sprawling one it looks like. *(T1)*
4. **[SHARPENED BY `[M8]`: `secret:read` is not in the `Capability` union AT ALL — see Task 2's correction.]** **`secret:read` and `quota:set` have no route.** `quota:set` is a `Capability` the admin holds and nothing calls; there is no secret-read route at all. Two of D24's four forbidden capabilities are therefore **unreachable in Phase 1**, and a negative control that tries to exercise them end to end cannot fail. The two that ARE reachable are **member management** (`POST /v1/projects/{projectId}/members`) and **a deploy to a production environment** (`POST /v1/environments/{environmentId}/deploy` — the route exists and the authorization check runs before the launch gate).
5. **[CORRECTED BY `[M5]`: it does NOT key on the header alone — the primary key is `(key, userId, route)`, so the predicted cross-user defect cannot happen. The real one is worse and is in Task 6's correction.]** **The idempotency hook keys on the header alone.** `api/idempotency.ts`'s `replayOrStore` is reached from the `preHandler` after the CSRF check; **Task 1 must measure whether the stored record is scoped to the actor**, because a delegated token replaying another user's `Idempotency-Key` would otherwise read a recorded response it never made. *(T1 — this is the measurement most likely to find a defect that already exists.)*
6. **[CONFIRMED AND EXTENDED BY `[M3]`/`[M7]`: `Authorization` DOES survive the edge on an upgrade; the stream reads `requireActor`, not the cookie; but it is registered outside `registerRoutes` and applies the origin check to every upgrade. Tasks 5 and 6.]** **The event stream authorizes before it upgrades** (`api/routes/events.ts`, two `assertCapability` calls) and reads the session cookie to do it. Node's `WebSocket` sends the headers it is given (P5a *Read this first* 3), so a token in an `Authorization` header can reach the upgrade — but **whether Caddy forwards `Authorization` on an upgrade is unmeasured**. *(T1)*
7. **`api/error-codes.ts` holds every code a client can receive, in both directions**, and `ErrorCode` is a union `tsc` checks against each route's `errors:` list. Every code this plan adds needs an entry, and a code listed that nothing throws is red.
8. **A new event type is FOUR edits** — `EVENT_TYPES` in `observability/events.ts`, the database CHECK (a migration), `EVENT_DETAIL_SCHEMAS` in `observability/event-schemas.ts`, and `observability/testing.ts`'s `EXAMPLE_DETAILS`. `api/representations/events.ts` builds the contract's `EventFrame` from the first and third, so the document follows by construction.
9. **`audit.role_changes` (migration 0013) is the pattern for an append-only audit table**: `GRANT SELECT, INSERT` to `manifest_app`, foreign keys `ON DELETE restrict`, and a CHECK for a non-empty reason. `observability/testing.ts`'s `expectSqlState` is how a test asserts the refusal — drizzle wraps the driver's error, so `rejects.toThrow(/permission denied/)` goes red against a working grant (P5a sitting 11 finding 5).
10. **`scripts/admin-grant.sh` is the precedent for an out-of-band privileged operation**, and its header states the rule this plan must not break: *"No control-plane route can change a platform role, and no delegated token ever will (D24)."*
11. **Minting is the only moment a token's plaintext exists.** There is no way to recover it afterwards by design, which means the mint route's response is the one place in the whole API that returns a credential — and `api/contract/route.ts` parses every response through its representation, so that field must be in the schema deliberately rather than by accident.
12. **P5a's sitting 12 found three of fourteen negative controls unable to fail**, for three different reasons: `tsc` refused the edit before it could run, an error arrived as a `500` before the named assertion was reached, and a check read a *status* where the property was a *latency*. **Every control in this plan names the assertion that must go red, not the mechanism.**

---

## Decisions Rich made, 2026-09-17

**Do not re-open either of these.**

**R1. The privileged set is named once now; step-up re-authentication is deferred.** P5b defines D24's forbidden four as one constant, refuses them to delegated tokens centrally, and writes the alignment test §20 asks for ("keeping the two lists aligned is a test, not a convention"). **Step-up's second SAML round trip — `ForceAuthn` and a recent-auth stamp on the session — is not built here**, and *What this plan does not build* names the plan that owes it. *Rejected:* building step-up now — a second authentication flow for the one privileged route reachable in Phase 1, with no browser to exercise it until P5c, is the shape that ships untested; and deferring the list as well, which would leave §20's alignment test with nothing to align.

**R2. Phase 1 sessions stay stateless, and the spec records it.** §20 specifies a server-side session store with rotation on privilege change; the implementation diverges, and P5a Task 16 measured the cost — a person made an administrator must sign in again. **§20 is amended to say so** (a *Spec action* below). **Delegated tokens still get a real store with revocation**, because revocation is not optional for a credential an agent holds, so the asymmetry between the two credential classes becomes deliberate and documented. *Rejected:* building the session store in this plan — it puts a database read on every authenticated request where there is none today, and it changes the login path P4a and P5a both hardened.

*Settled before this plan and not to be re-opened either:* P5 is three plans, each written after the one before executes (P5 R2); the contract is versioned by a `/v1` path prefix (P5 R4); the console and the API share one origin behind the edge (P5 R3); a deploy returns once the new instance serves (P4c R3); §10's per-user AI budget is validated, not enforced.

---

## Decisions this plan makes, and why

Fourteen questions below Rich's line. Each says what it rejected and what changing course would cost.

**Decision 1. A token is `mft_<id>_<secret>`, and only a SHA-256 of the secret is stored.** The id is the token row's uuid with its dashes removed (32 hex characters), so verification is one indexed lookup rather than a scan; the secret is 32 bytes from `randomBytes` in base64url. The stored `token_hash` is `sha256(secret)` hex, compared with `timingSafeEqual`. *Rejected:* **argon2 or scrypt** — those exist to make *low-entropy human passwords* expensive to guess, and a 256-bit CSPRNG secret has nothing to brute-force, so a slow KDF would buy no security and put a deliberate CPU cost on every single API request a token makes; **an opaque secret with no id part** — it forces either a table scan or an index on a secret-derived column, and the latter is the same lookup with worse ergonomics. *Changing course* means a migration and re-minting every token, which is cheap while the only tokens are this plan's own.

**Decision 2. `Actor` becomes a discriminated union on `credential`.** `SessionActor` becomes `Extract<Actor, { credential: 'session' }>`, and a route that may only be called interactively takes it, so **"interactive-only" is checked by `tsc` rather than remembered**. *Rejected:* an optional `token?` field beside a `credential: 'session' | 'token'` string — two fields that must agree is precisely P2's `/auth/dev-login` shape, where a guard whose enabling condition was written twice was one line from an authentication bypass (ORIENTATION §9). *Changing course* is mechanical but touches every route signature, so it is made once, in Task 5, before any route depends on it.

**Decision 3. A token is scoped to exactly ONE project, and a project-scoped route for any other project answers `404 NOT_FOUND`.** The same answer a stranger gets, for the same reason: `FORBIDDEN` would confirm the project exists and turn the id space into an enumeration oracle (`projects/authz.ts`'s own comment). *Rejected:* a token scoped to several projects — D24 says "scoped to a project and a capability set", and a multi-project token is a strictly larger blast radius for no Phase 1 need.

**Decision 4. A token never carries platform-admin authority, and admin-scoped routes require an interactive session.** `GET /v1/fleet` becomes session-only and answers a token `403 TOKEN_CREDENTIAL_REFUSED`. §26's fleet is cross-tenant data; a leaked project-scoped token must not become a read of every project on the platform. *Rejected:* letting an administrator's token inherit their role — it makes the blast radius of one leaked agent credential the whole fleet, and D24's sentence is "scoped to a project", full stop. **The token's `platformRole` is therefore not carried at all**, rather than carried and ignored — a value that exists and is deliberately not read is the next agent's bug.

**Decision 5. `assertCapability` throws; `registerRoutes` records the `PendingAction`.** The refusal must know *what was requested* — method, path, body — and `assertCapability` cannot see a request. So it throws `TokenCapabilityRefusedError(capability)`, and the **one** wrapper in `api/contract/route.ts` that already runs for every `/v1` route catches it, records the pending action from the request it is holding, and answers. *Rejected:* recording inside `assertCapability` by passing it the request — it would put a write inside a function 21 call sites treat as a pure check, and the two Docker-tier suites that call it directly would start writing rows; **recording in each route** — that is per-route enforcement, which D24 explicitly forbids.

**Decision 6. Confirming grants a ONE-SHOT RETRY; the platform never replays the request server-side.** The pending action stores a fingerprint of the refused request — method, path, and a SHA-256 of the canonical body — and once confirmed, the next matching request from that token passes the capability check exactly once, stamping `consumed_at`. *Rejected:* **server-side replay** (the platform re-dispatches the stored request as the confirming user) — it is a second authorization path into every handler, reachable with an actor the original request did not have, which is the same shape as the dev-login bypass and strictly harder to review; **advisory-only** (the human performs the action themselves) — the queue item becomes a to-do note, the agent's loop never completes, and D24's "requesting one of those creates a pending action" stops meaning anything mechanical.

**Decision 7. `consumed_at` is a column, not a fifth state.** §6's state machine is `pending | confirmed | rejected | expired` and stays exactly that. *Rejected:* a `consumed` state — it would put this plan's implementation detail into the spec's entity, and "confirmed but not yet retried" and "confirmed and used" are the same decision at two moments, not two decisions.

**Decision 8. A refused privileged request answers `403 TOKEN_ACTION_PENDING` with a typed `pendingAction` in the error envelope.** Registered as a representation and `$ref`'d from `ErrorEnvelope`, exactly as P5a Task 15 did for `launchReadiness` — and for the reason sitting 10's finding 1 paid for: an extra key in the envelope that the document forbids is a client that cannot read it. *Rejected:* **`202` with the pending action as the body** — the mutation did not happen, and a success status for a thing that did not happen is the defect §14 exists to prevent; **a bare `403`** — an agent cannot find the thing it must wait for, which fails D23.7.

**Decision 9. Rate limits are per token, in this process, from a `rate_limit` column.** `createRateLimiter` (P5a Task 9) already takes `{ limit, windowMs }`; this plan builds one limiter per token id, with the token's own limit, and its own comment already says *"P5b generalises this to per-token limits (§20)."* *Rejected:* a shared limiter keyed by token — one window size for every token, so the column would be decorative; a database-backed limiter — a write per request, for a control that exists to shed load.

**Decision 10. A new demo, `make demo-token`, rather than extending `make demo-journey`.** The journey is §22's seven steps driven by a session and is P5a's acceptance; this is a different actor doing a different thing, and folding them would make one red run ambiguous about which contract broke. *Rejected:* extending the journey — P5a's sitting 12 measured that a phase-1 failure hides every later measurement in the same run, and a longer single script makes that worse.

**Decision 11. Minting returns the plaintext exactly once, and the representation says so.** The mint response is the only place in the API that returns a credential; `Token.secret` is present only on the mint response schema, and the read schemas do not have the field at all — two schemas, not one with an optional field. *Rejected:* one `Token` schema with `secret` optional — an optional secret is a field every read might carry, and P5a Decision 22 already established that a representation which *can* carry a value eventually does.

**Decision 12. A token may call `GET /v1/projects`, and it answers exactly its own project.** Scoping behaving correctly, rather than a refusal a client has to special-case. *Rejected:* `403` — an agent listing "my projects" and getting a refusal has to learn a second code path for no benefit.

**Decision 12a. §24's audience question stays human-only, and this plan discharges that by construction.** P5a's *What this plan does not build* asks P5b to refuse the audience question to a token (D29 makes it human-only). `audience` is set at creation and nowhere else — changing one afterwards is Phase 2's — and **Decision 13 refuses project creation to a token**, so no token can state an audience. **A test asserts it rather than leaving it to be inferred**, in Task 5: a token calling `POST /v1/projects` is refused. If Phase 2 adds an audience-change route, it is privileged and inherits Task 6's rule; *What this plan does not build* says so.

**Decision 13. `POST /v1/projects` — creating a project — is refused to a token in Phase 1.** D24's prose says a token can "create projects", but a token is scoped to a project (Decision 3), so a token that creates a *second* project would either escape its scope or create something it cannot then use. **Named as a divergence from D24's prose in *What this plan does not build*, with the resolution — unscoped "creator" tokens — left to the plan that needs it.** *Rejected:* letting a token create projects it cannot address — a capability whose result is unreachable is worse than its absence.

**Decision 14. Two of D24's four forbidden capabilities cannot be exercised end to end in Phase 1**, because `secret:read` and `quota:set` have no route (*Read this first* 4). They are enforced and tested **at the authorization layer** — `assertCapability` directly, with its own unit test — and the acceptance exercises the two that are reachable. **This is stated in advance rather than discovered in the acceptance**, which is what P5a's sitting 12 asks of every plan after it.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec or from a dated measurement.

- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`. **Run `pnpm test` twice** — a suite that is not repeatable has a state leak.
- **`pnpm test:docker` too** for every task that touches `runtime/`, `routing/`, `releases/`, `identity/`, `projects/`, `infra/` or a `*.docker.test.ts` — **which is every sitting from 3 onwards**, because `projects/authz.ts` is read by the Docker tier. It needs `make up`, takes ~13 minutes, and **fails rather than skips** when asked to run.
- **`pnpm test -- <filter>` does not filter.** One unit file: `pnpm exec vitest run --project unit src/<path>`; one Docker file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`, both from the repository root.
- **Vitest strips types; it does not check them.** `exactOptionalPropertyTypes` is on: `hint: cond ? x : undefined` is a type error, and a conditional spread is the fix.
- **Contract schemas import `z` from `'zod/v4'`.** §7's `spec/schema.ts` and `spec/errors.ts` stay on `'zod'` (v3); never pass a v4 issue to `toManifestErrors`.
- **A route change is three files, in order**: the definition, then `pnpm contract:write`, then `pnpm contract:generate`. **`packages/contract/openapi.json` is generated — never edit it.** The journey's and the demos' `tsc` build refuses a call the regenerated contract does not have.
- **Every `/v1` route requires a credential**, every mutation requires `Idempotency-Key` (D23.6), and a **session-bearing** mutation or stream upgrade requires `Origin: https://console.manifest.internal` (P5a Task 4). **A bearer token is not a browser credential, so CSRF does not apply to it** — Task 5 states that rule in one place and tests it.
- **Every code a client can receive is in `api/error-codes.ts`**, held to the source in both directions; **`api/authz-contract.ts` covers every registered route and asserts each refusal's CODE**, and a route registered but not listed fails the completeness check.
- **Any spec change is recorded in *Spec actions* and put to Rich; never edited directly.**
- **Ask before `sudo`.** It cannot prompt from a tool call. Nothing in this plan needs it.
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`; `sed -i` takes an argument: `sed -i ''`.
- **The zone is `*.manifest.internal`**, ports **7100–7199**, and everything binds `127.0.0.1` explicitly — never `localhost`.
- **Never touch Valet**, and these four containers must survive: `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **No new dependency.** Token secrets are `node:crypto`. If a task believes it needs a package, that is a finding to record and raise, not a step to take.
- **After `pnpm test:docker`, restart the control plane** — the tier restarts the edge and re-registers the platform's SP row at a loopback ACS. **After `pnpm test` or `pnpm contract:write`**, the control plane's tables are truncated.
- **`request.log.error` writes nothing** under `Fastify({ logger: false })`. Use `console.error` for anything an operator must see, and **never put a token, a secret, a cookie or a hash in it** (§14).
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built — **after committing the task** — and naming the test that goes red, with the assertion quoted.
- **Every task names its caller.** A module with no call site is not built; it has shipped four times here.
- **The agent's shell is zsh**: `grep` is `ugrep` (quote a glob like `'*.ts'`), an unquoted variable is not word-split, a word starting with `=` is expanded. Two Bash calls issued together share one shell — use absolute paths.
- **Leave the machine as you found it.** `./scripts/snapshot-machine.sh` at the start of a sitting, the same at the end, and `diff` them.
- **Commit after every task**, on `main`, conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), ending with the attribution line the session's system reminder gives.
- **Test fixtures named in a snippet and not defined are local to that test file** — `loginAs`, `mutationHeaders`, `projectBody`, `testDeps`, `resetDatabase` come from `api/testing.ts` and `db/testing.ts`; anything else a snippet names and does not import is written beside the test that uses it, never in `src/`.

**What this plan does not create.** No step-up re-authentication (R1), no server-side session store (R2), no `manifest-mock`, no console, no CI workflow, no production promotion route, no secret-read route, no quota route. Those are P5c's and Phase 2's; see *What this plan does not build*.

---

## The test fixtures every snippet below uses

**Read this before the first test you write.** The existing helpers do not have the shapes
a reader might assume, and two of them were the first thing this plan got wrong in its own
self-review.

**What `api/testing.ts` already has, with its REAL signatures** (read from the file on
2026-09-17, not remembered):

```ts
loginAs(deps: ServerDeps, puid: TestUserPuid): Promise<Record<'manifest_session', string>>
mutationHeaders(deps: ServerDeps): { 'idempotency-key': string; origin: string }
projectBody(slug: string, options?: { blueprint?: string; starter?: string }): Record<string, unknown>
testDeps(): Promise<ServerDeps>
```

`loginAs` takes **`deps`, not the app** — the cookie has to be signed with the secret *this*
server was built with — it takes **no role or project**, and it returns a **cookies object**
that `app.inject` takes as `cookies:`, not as a `cookie` header. `mutationHeaders` takes
**`deps`**, because since P5a Task 4 it reads the configured `Origin` from it rather than
restating it. The idiom every existing test uses:

```ts
const deps = await testDeps()
const app = await buildServer(deps)
const cookies = await loginAs(deps, 'ins000001')
await app.inject({ method: 'POST', url: '/v1/projects', cookies, headers: mutationHeaders(deps), payload: projectBody('chem-labs') })
```

**Two fixtures are NEW, and Task 3 Step 7 writes them** in `api/testing.ts` beside the
others, because four test files in this plan need them and a fixture copied four times
drifts four ways:

```ts
export interface TestProject {
  app: FastifyInstance
  deps: ServerDeps
  db: Db
  /** The owner: `ins000001`, who created the project and is therefore its owner (§13). */
  userId: string
  ownerCookies: Record<string, string>
  projectId: string
  /** A SECOND project, owned by somebody else — what Decision 3's scope rule is tested against. */
  otherProjectId: string
  stagingEnvironmentId: string
  productionEnvironmentId: string
}

/** Builds a server, a project with its three environments, and a second project; closes the app in a `finally`. */
export async function withProject(fn: (ctx: TestProject) => Promise<void>): Promise<void>

/**
 * A session for `puid`, added to `ctx`'s project with `role` first when one is given.
 * With no role the person is a STRANGER to the project, which is what the 404-versus-403
 * distinction is tested with.
 */
export async function sessionFor(
  ctx: TestProject,
  puid: TestUserPuid,
  role?: 'owner' | 'collaborator',
): Promise<Record<string, string>>
```

Some snippets below also name `builtProject(slug)` — that one **already exists**, in
`api/delivery.test.ts`, and is local to it; a test in another file that needs a built
project either imports it or builds its own, and **P5a sitting 10 finding 6 is the warning**:
that fixture threaded its slug to one of the two places that needed it and worked for
exactly one name. Check it before reusing it.

`mintTestToken(db, { userId, projectId, capabilities, rateLimit? })` is Task 3's, and
returns `{ plaintext, row }`. **It writes the row directly**, which is how Task 6 mints a
token holding a privileged capability that Task 4's route would refuse — that is
deliberate, and it is what "regardless of how it was minted" in D24 means.

---

## File Structure

```
packages/control-plane/
├── drizzle/
│   └── 0014_*.sql                                  NEW  T3  delegated_tokens, pending_actions
├── src/
│   ├── db/schema.ts                                MOD  T3  the two tables and their enums
│   ├── projects/
│   │   ├── authz.ts                                MOD  T2 T6  PRIVILEGED, the token refusal
│   │   ├── privileged.test.ts                      NEW  T2  §20's alignment test
│   │   └── index.ts                                MOD  T2 T6  exports
│   ├── tokens/                                     NEW  T3  the module this plan adds
│   │   ├── index.ts                                NEW  T3  the module's surface
│   │   ├── token.ts                                NEW  T3  format, mint, hash, verify
│   │   ├── token.test.ts                           NEW  T3
│   │   ├── repository.ts                           NEW  T3  rows: create, byId, revoke, touch
│   │   ├── repository.test.ts                      NEW  T3
│   │   ├── pending.ts                              NEW  T6  record, find a confirmed match, consume
│   │   ├── pending.test.ts                         NEW  T6
│   │   ├── expiry.ts                               NEW  T10 the sweeper, called at boot
│   │   ├── expiry.test.ts                          NEW  T10
│   │   └── testing.ts                              NEW  T3  mintTestToken, for every later tier
│   ├── api/
│   │   ├── actor.ts                                MOD  T5  the discriminated union
│   │   ├── server.ts                               MOD  T5 T9  the credential hook, the limiter
│   │   ├── error-codes.ts                          MOD  T4 T5 T6 T7 T9  the new codes
│   │   ├── contract/route.ts                       MOD  T6 T7  the one place that records
│   │   ├── representations/
│   │   │   ├── tokens.ts                           NEW  T4  Token, MintedToken, TokenList
│   │   │   ├── pending-actions.ts                  NEW  T6  PendingAction, PendingActionList
│   │   │   └── errors.ts                           MOD  T6  ErrorEnvelope gains pendingAction
│   │   ├── routes/
│   │   │   ├── tokens.ts                           NEW  T4  mint, list, revoke
│   │   │   ├── pending-actions.ts                  NEW  T7 T8  confirm, reject, list
│   │   │   ├── fleet.ts                            MOD  T5  session-only (Decision 4)
│   │   │   ├── project-reads.ts                    MOD  T12 scoping listProjects to a token
│   │   │   └── index.ts                            MOD  T4 T7  registration
│   │   ├── tokens.test.ts                          NEW  T4
│   │   ├── delegation.test.ts                      NEW  T6 T7  the refusal and the retry
│   │   └── authz-contract.ts                       MOD  T11 the token actors
│   ├── observability/
│   │   ├── events.ts                               MOD  T4 T6 T7  four event types
│   │   ├── event-schemas.ts                        MOD  T4 T6 T7  their payloads
│   │   └── testing.ts                              MOD  T4 T6 T7  EXAMPLE_DETAILS
│   └── index.ts                                    MOD  T3 T9 T10  the module at boot
packages/contract/
├── openapi.json                                    GEN  T4 T6 T7 T8  never edited
└── src/client.ts                                   MOD  T5  a bearer client
packages/journey/src/main.ts                        MOD  T12 the token phase
scripts/
├── demo-token.sh                                   NEW  T12 the acceptance's driver
└── lib/api.sh                                      MOD  T12 a bearer helper
Makefile                                            MOD  T12 demo-token
docs/superpowers/
├── RUNBOOK.md                                      MOD  T4 T12  minting a token; the demo
└── WALKTHROUGH.md                                  MOD  T12 what a token can and cannot do
```

---
## Task 1: Measure what this plan rests on — before any of it is built

**Why alone and first.** P5a's Task 1 produced 9 findings and corrections at the top of six later tasks; P4c's equivalent moved a task boundary. This plan's design rests on five claims about code nobody has read with delegated tokens in mind, and **two of them, if false, change the shape of Task 6**. Nothing here writes production code: every measurement is a throwaway script or a temporary test, and the task ends by deleting them and writing down what they said.

**Files:**
- Create: `docs/superpowers/spikes/p5b-baseline/README.md` — the measurements, each with its command and its raw answer
- Create (and delete before the commit): `/tmp/p5b-m*.ts`, `/tmp/p5b-m*.sh`
- Modify: this plan — a correction block at the top of every task a measurement contradicts

**Interfaces:**
- Produces: the measurements `[M1]`–`[M9]`, cited by task number below.

- [ ] **Step 1: `[M1]` Is `assertCapability` actually central?**

Do not grep. Read it out of the registered route table, which is what `authz-contract.ts` already trusts:

```bash
cd /Users/rich/Developer/manifest
cat > /tmp/p5b-m1.ts <<'TS'
import { ROUTE_DEFINITIONS } from './packages/control-plane/src/api/routes/index.js'
import { readFileSync } from 'node:fs'
// Every /v1 route, and whether its handler's source mentions assertCapability.
for (const r of ROUTE_DEFINITIONS) {
  const src = r.handler.toString()
  const guarded = src.includes('assertCapability')
  const inline = /platformRole/.test(src)
  console.log(
    [r.method.padEnd(6), r.path.padEnd(52), guarded ? 'assertCapability' : '—', inline ? 'platformRole INLINE' : ''].join(' '),
  )
}
TS
pnpm --filter @manifest/control-plane build
node --experimental-strip-types /tmp/p5b-m1.ts 2>/dev/null || npx tsx /tmp/p5b-m1.ts
```

**Record:** every route, and which of the three columns it is in. **The claim being tested is *Read this first* 1** — that exactly five modules bypass it and that `fleet.ts` is the only one that must change. **If a route is found that is neither guarded nor deliberately open, Task 6 gains a step for it**, and the correction goes at the top of Task 6.

- [ ] **Step 2: `[M2]` Can `release:deploy` tell production from staging?**

```bash
cd /Users/rich/Developer/manifest
grep -n "release:deploy" packages/control-plane/src/api/routes/releases.ts
sed -n '/operationId: .deployRelease./,/^  }),/p' packages/control-plane/src/api/routes/releases.ts | head -60
```

**Record:** the exact line that authorizes a deploy, and whether the environment's `kind` is read before or after it. **The claim is *Read this first* 2** — one capability for every environment, with production refused later by §13's gate. **This decides Task 2's shape**: if the deploy route already branches on `kind`, the new `release:promote` capability hangs off that branch; if it does not, Task 2 adds the branch and Task 6's control (b) targets it.

- [ ] **Step 3: `[M3]` Does an `Authorization` header survive the edge, on a plain request AND on a WebSocket upgrade?**

The control plane must be running (README's *Running the control plane*).

```bash
cd /Users/rich/Developer/manifest
# A plain request. /v1/me answers 401 with no credential; the point is the header arriving.
curl -sS -o /dev/null -w '%{http_code}\n' --cacert infra/ca/manifest-root.crt \
  -H 'Authorization: Bearer mft_probe' https://console.manifest.internal/v1/me
# What the control plane SAW. Add this line temporarily to the onRequest hook in
# packages/control-plane/src/api/server.ts, rebuild, restart, re-run the curl above:
#   console.error(JSON.stringify({ probe: 'M3', hasAuth: request.headers.authorization !== undefined }))
# Then REMOVE it and rebuild. Never print the header's VALUE.
```

For the upgrade, drive it from Node with the platform CA (a Node process does not trust it unless given it — ORIENTATION §4):

```bash
cat > /tmp/p5b-m3.mjs <<'JS'
const ca = (await import('node:fs')).readFileSync('infra/ca/manifest-root.crt')
const ws = new WebSocket('wss://console.manifest.internal/v1/projects/00000000-0000-0000-0000-000000000000/events', {
  headers: { authorization: 'Bearer mft_probe', origin: 'https://console.manifest.internal' },
})
ws.addEventListener('open', () => { console.log('OPEN'); ws.close() })
ws.addEventListener('error', (e) => console.log('ERROR', String(e.message ?? e)))
setTimeout(() => process.exit(0), 4000)
JS
NODE_EXTRA_CA_CERTS=infra/ca/manifest-root.crt node /tmp/p5b-m3.mjs
```

**Record:** whether `authorization` reached the control plane in each case. **If Caddy strips it on the upgrade, Task 5's stream support becomes "a token cannot open a stream", named in *What this plan does not build* rather than half-built** — and that correction goes at the top of Task 5.

- [ ] **Step 4: `[M4]` What the token's hash should be, measured rather than assumed**

```bash
cat > /tmp/p5b-m4.mjs <<'JS'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
const secret = randomBytes(32).toString('base64url')
console.log('secret chars', secret.length, 'entropy bits', 32 * 8)
const h = (s) => createHash('sha256').update(s).digest('hex')
const stored = h(secret)
const t0 = process.hrtime.bigint()
for (let i = 0; i < 10_000; i++) h(secret)
console.log('sha256 per verify (us)', Number(process.hrtime.bigint() - t0) / 10_000 / 1000)
const a = Buffer.from(stored, 'hex'), b = Buffer.from(h(secret), 'hex')
console.log('timingSafeEqual same length', a.length === b.length, timingSafeEqual(a, b))
JS
node /tmp/p5b-m4.mjs
```

**Record:** the per-verify cost in microseconds and the secret's length. **The claim is Decision 1** — that a hash is the right primitive because the secret is CSPRNG entropy, and that its cost is negligible per request. If the measured cost is not negligible, say so; it would not change the decision, but the number belongs in the record.

- [ ] **Step 5: `[M5]` Is an idempotency record scoped to the actor?**

**The measurement most likely to find a defect that already exists** (*Read this first* 5).

```bash
cd /Users/rich/Developer/manifest
sed -n '1,80p' packages/control-plane/src/api/idempotency.ts
grep -n "idempotencyKeys" packages/control-plane/src/db/schema.ts
sed -n "$(grep -n 'export const idempotencyKeys' packages/control-plane/src/db/schema.ts | cut -d: -f1),+26p" packages/control-plane/src/db/schema.ts
```

**Record:** the columns of `idempotency_keys` and, exactly, what the lookup keys on. **If the key alone identifies a record, then two different actors sharing a key share a response** — write it up as a finding, and **Task 5 gains a step** that scopes the record to the actor, because a delegated token makes it reachable by a party that is not the user.

- [ ] **Step 6: `[M6]` What the authorization matrix costs**

```bash
cd /Users/rich/Developer/manifest
grep -c "method:" packages/control-plane/src/api/authz-contract.ts
pnpm exec vitest run --project unit src/api/authz-contract.test.ts 2>&1 | grep -E "Tests |Duration"
```

**Record:** the number of route cases and the suite's current test count and duration. Task 11 multiplies the cases by the number of new actors; **if the projected count is over about 400 cases or 20 s, Task 11 says so and splits the token actors into their own file** rather than growing one that every sitting runs.

- [ ] **Step 7: `[M7]` What a stream upgrade authorizes with**

```bash
cd /Users/rich/Developer/manifest
sed -n '1,90p' packages/control-plane/src/api/routes/events.ts
```

**Record:** the two `assertCapability` calls, where the actor comes from, and whether anything reads the cookie directly rather than `request.actor`. **If the route reads the cookie**, Task 5 must change it to read the actor, or a token can never stream regardless of `[M3]`.

- [ ] **Step 8: `[M8]` The four privileged capabilities, and which are reachable**

```bash
cd /Users/rich/Developer/manifest
for cap in "members:manage" "quota:set" "release:approve" "secret:read" "release:deploy"; do
  echo "== $cap"; grep -rn "'$cap'" packages/control-plane/src --include='*.ts' | grep -v "\.test\.ts" | grep -v authz.ts
done
```

**Record:** for each of D24's four, the route that would exercise it, or *none*. **The claim is Decision 14** — that only member management and a production deploy are reachable. If a third turns out to be reachable, Task 13's acceptance gains a control for it.

- [ ] **Step 9: `[M9]` Does anything already answer a bearer token?**

```bash
cd /Users/rich/Developer/manifest
grep -rn "authorization\|Bearer" packages/control-plane/src --include='*.ts' | grep -v "\.test\.ts" | head -20
```

**Record:** every place that reads an `Authorization` header today. `api/routes/registry-token.ts` is expected — it is the registry's token realm and **must stay outside `/v1` and outside this plan's credential path**. If anything else reads it, that is a collision Task 5 must resolve, and the correction goes at the top of Task 5.

- [ ] **Step 10: Write the findings, delete the probes, commit**

Write `docs/superpowers/spikes/p5b-baseline/README.md`: each measurement, the exact command, the raw answer, and **what it changes in this plan** — with the correction written at the top of the affected task in the same commit.

```bash
cd /Users/rich/Developer/manifest
rm -f /tmp/p5b-m*.ts /tmp/p5b-m*.mjs /tmp/p5b-m*.sh
git status --short            # expect only the baseline README and this plan
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add -A docs/superpowers
git commit -m "docs(p5b): the measurements this plan rests on — sitting 1"
```

**Expected:** no `src/` change at all. If a measurement made one necessary, that is a finding and it goes in its own commit with its own test.

---

## Task 2: The privileged set, named once — and the capability that production promotion needs
> **Task 1 correction (2026-09-17, `[M8]`, `[M2]`).** **`secret:read` is not in the `Capability` union at all** — it is not a routeless capability, it is not a capability. So the privileged set CANNOT be written as four `Capability` values; `tsc` refuses `'secret:read'`. **Type the privileged set as a superset of `Capability`** rather than adding `secret:read` to the union: D24's list is a statement about the SPEC, not about what the code implements today, and a capability nothing grants and nothing checks is the no-caller shape ORIENTATION §9 names four times. §20's alignment test then has something real to align, which is R1's point. `quota:set` and `release:approve` ARE in the union and are held by `PLATFORM_ADMIN`, checked nowhere.
>
> **`[M2]` decided this task's other half: the deploy route ALREADY branches on `kind`**, at `releases.ts:214`, and the branch runs AFTER `environmentReadableBy(…, 'release:deploy')` at `:205`. So **`release:promote` hangs off the existing branch and this task adds no branch.** The existing order — authorize, then read `kind` — is what lets a new privileged capability be checked before §13's launch gate rather than after it.

**What this is for.** D24's four forbidden capabilities and §20's four step-up capabilities are **the same four**, and §20 says in as many words that *"keeping the two lists aligned is a test, not a convention."* This task writes the list once and the test that holds it. It adds no token code — a token cannot yet exist — so it is the cheapest possible place to get the list right.

**Files:**
- Modify: `packages/control-plane/src/projects/authz.ts` — `Capability` gains `secret:read` and `release:promote`; `PRIVILEGED` is exported
- Create: `packages/control-plane/src/projects/privileged.test.ts`
- Modify: `packages/control-plane/src/projects/index.ts` — export `PRIVILEGED`, `isPrivileged`
- Modify: `packages/control-plane/src/api/routes/releases.ts` — a deploy to a production environment asserts `release:promote`

**Interfaces:**
- Produces: `PRIVILEGED: ReadonlySet<Capability>`, `isPrivileged(c: Capability): boolean` — Task 6's central refusal consumes both.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/projects/privileged.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { capabilitiesFor, isPrivileged, PRIVILEGED, type Capability } from './authz.js'

/**
 * §20: "The first four are exactly D24's forbidden delegated-token capabilities ...
 * Keeping the two lists aligned is a test, not a convention." This is that test.
 *
 * D24's four, in the spec's words: production promotion, secret read, quota change,
 * member management. They are named here as LITERALS on purpose — deriving them from
 * the constant under test would make this file agree with itself no matter what the
 * constant said.
 */
const D24_FORBIDDEN: readonly Capability[] = [
  'release:promote',
  'secret:read',
  'quota:set',
  'members:manage',
]

describe('the privileged set (D24, §20)', () => {
  it('is exactly D24’s four, and nothing has been quietly added', () => {
    expect([...PRIVILEGED].sort()).toEqual([...D24_FORBIDDEN].sort())
  })

  it('names every one of them as privileged, and nothing else', () => {
    for (const cap of D24_FORBIDDEN) expect(isPrivileged(cap)).toBe(true)
    for (const cap of ['project:read', 'build:create', 'release:create', 'release:deploy'] as const)
      expect(isPrivileged(cap)).toBe(false)
  })

  it('distinguishes deploying from promoting — a staging deploy is not privileged', () => {
    // §13: an owner deploys to staging all day; putting an app in front of real
    // students is the decision a human must make (§20, D24).
    const owner = capabilitiesFor('owner', 'member')
    expect(owner.has('release:deploy')).toBe(true)
    expect(owner.has('release:promote')).toBe(true)
    expect(isPrivileged('release:deploy')).toBe(false)
  })

  it('gives a collaborator neither member management nor promotion', () => {
    const collaborator = capabilitiesFor('collaborator', 'member')
    expect(collaborator.has('members:manage')).toBe(false)
    expect(collaborator.has('release:promote')).toBe(false)
    expect(collaborator.has('release:deploy')).toBe(true)
  })

  it('gives a platform admin the two admin capabilities and not secret read', () => {
    // `secret:read` has no route in Phase 1 (Decision 14) and no role holds it yet:
    // it is in the set so that the route which adds it cannot forget the rule.
    const admin = capabilitiesFor(null, 'admin')
    expect(admin.has('release:approve')).toBe(true)
    expect(admin.has('quota:set')).toBe(true)
    expect(admin.has('secret:read')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/projects/privileged.test.ts
```

Expected: FAIL — `isPrivileged` and `PRIVILEGED` are not exported, and `'release:promote'` and `'secret:read'` are not `Capability`s.

- [ ] **Step 3: Extend the capability model**

In `packages/control-plane/src/projects/authz.ts`, add the two capabilities and the set:

```ts
export type Capability =
  | 'project:read'
  | 'project:write'
  | 'project:delete'
  | 'members:manage'
  | 'build:create'
  | 'release:create'
  | 'release:deploy'
  /**
   * §13 and D24: putting a release in front of real students, as distinct from
   * deploying it to staging. Separate from `release:deploy` because D24 forbids
   * exactly this one to a delegated token and permits the other — one capability
   * covering both would make the rule unstatable (P5b `[M2]`).
   */
  | 'release:promote'
  | 'release:approve'
  | 'quota:set'
  /**
   * §20's privileged set. NO ROUTE READS A SECRET IN PHASE 1 (Decision 14); the
   * capability exists so that the route which adds one inherits the rule rather
   * than having to remember it.
   */
  | 'secret:read'

/**
 * D24's four, and §20's step-up four. ONE list, because the spec says keeping the two
 * aligned is a test rather than a convention — `privileged.test.ts` is that test.
 *
 * A delegated token may NEVER hold one of these, however it was minted (Task 6). Step-up
 * re-authentication for an interactive session is deferred (Rich, R1) and is owed by the
 * plan that adds the routes it would protect.
 */
export const PRIVILEGED: ReadonlySet<Capability> = new Set([
  'release:promote',
  'secret:read',
  'quota:set',
  'members:manage',
])

export function isPrivileged(capability: Capability): boolean {
  return PRIVILEGED.has(capability)
}
```

Then give `release:promote` to the roles that hold it — the owner, and the platform admin:

```ts
const OWNER: readonly Capability[] = [
  'project:read',
  'project:write',
  'project:delete',
  'members:manage',
  'build:create',
  'release:create',
  'release:deploy',
  'release:promote',
]

// §13: "same as owner except member management and deletion" — and not promotion,
// which is the owner's decision about their own students.
const COLLABORATOR: readonly Capability[] = OWNER.filter(
  (cap) =>
    cap !== 'members:manage' && cap !== 'project:delete' && cap !== 'release:promote',
)
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/projects/privileged.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Make the new capability load-bearing — a production deploy asserts it**

**A capability nothing asserts is not built.** In `packages/control-plane/src/api/routes/releases.ts`, the deploy handler currently asserts `release:deploy` for every environment. Read the environment first, then assert the capability its `kind` calls for:

```ts
      const environment = await environmentById(deps.db, params.environmentId)
      // §13 and D24: promoting to production is a different decision from deploying to
      // staging, and a different capability. The launch gate (Task 15 of P5a) refuses
      // production for a second, independent reason — this check is about WHO may ask,
      // that one is about whether the project is ready. Both must hold.
      await assertCapability(
        deps.db,
        actor,
        environment.projectId,
        environment.kind === 'production' ? 'release:promote' : 'release:deploy',
      )
```

**`[M2]` decides whether `environmentById` already exists here** — if the handler reads the environment after authorizing, this step moves the read up, and the diff is larger than it looks. Read the handler before editing it.

- [ ] **Step 6: Assert it from the outside, where a client can see it**

Add to `packages/control-plane/src/api/delivery.test.ts`:

```ts
it('a collaborator may deploy to staging and may not promote to production', async () => {
  const { app, projectId, stagingEnvironmentId, productionEnvironmentId, releaseId } =
    await builtProject('chem-labs')
  const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')

  const staging = await app.inject({
    method: 'POST',
    url: `/v1/environments/${stagingEnvironmentId}/deploy`,
    cookies: collaborator, headers: mutationHeaders(ctx.deps),
    payload: { releaseId },
  })
  expect(staging.statusCode).toBe(200)

  const production = await app.inject({
    method: 'POST',
    url: `/v1/environments/${productionEnvironmentId}/deploy`,
    cookies: collaborator, headers: mutationHeaders(ctx.deps),
    payload: { releaseId },
  })
  // FORBIDDEN, not the launch gate's 409: the collaborator is refused before the
  // project's readiness is ever consulted.
  expect(production.statusCode).toBe(403)
  expect(production.json().error.code).toBe('FORBIDDEN')
  await app.close()
})
```

- [ ] **Step 7: Update the authorization contract suite for the changed expectation**

`api/authz-contract.ts` lists the deploy route once. A production environment now refuses a collaborator, so **the suite's row for that route must say which environment it drives**. Read the existing row before changing it; if the suite only ever deploys to staging, nothing changes and **say so in the record** rather than assuming.

- [ ] **Step 8: Every gate, then commit**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker          # projects/ changed
git add -A packages/control-plane
git commit -m "feat(authz): D24's privileged four named once, and promotion separated from deploy"
```

- [ ] **Step 9: Break it, and watch the named test go red**

Each after the commit; `git checkout` to restore; `git status` clean after each.

| Break | The assertion that must go red |
|---|---|
| `'release:promote'` removed from `PRIVILEGED` | `privileged.test.ts` *is exactly D24's four* — `expected [...] to equal [...]` naming the missing member |
| `release:promote` added to `COLLABORATOR` | `privileged.test.ts` *gives a collaborator neither member management nor promotion* |
| the deploy handler asserts `release:deploy` for every environment | `delivery.test.ts` *a collaborator may deploy to staging and may not promote to production* — `expected 200 to be 403` |
| `isPrivileged` returns `false` always | *names every one of them as privileged* — and **note whether anything else goes red**; at this point nothing consumes it, which is exactly why Task 6 is the task that makes it load-bearing |

**The fourth is the interesting one.** `isPrivileged` has no caller until Task 6, so this task deliberately ships a function whose only proof is its own unit test — the shape ORIENTATION §9 warns about four times. **It is acceptable here only because Task 6 is the next task and names it as its consumer**; if Task 6 slips, this is the first thing to check.

---
## Task 3: The two tables, and the token's shape

**What this is for.** §6's `DelegatedToken` and `PendingAction` rows, plus the three fields the brief's §7 item 5 proposes (`token_hash`, `name`, `revoked_at`) and the two this plan adds (`expires_at`, `consumed_at` on `PendingAction`). It also builds `tokens/token.ts` — mint, hash, parse, verify — which is pure and therefore the one part of this plan that can be tested exhaustively without a database.

**Files:**
- Create: `packages/control-plane/drizzle/0014_*.sql` (drizzle-kit names it)
- Modify: `packages/control-plane/src/db/schema.ts`
- Create: `packages/control-plane/src/tokens/{index,token,repository,testing}.ts`
- Create: `packages/control-plane/src/tokens/{token,repository}.test.ts`
- Modify: `packages/control-plane/src/db/testing.ts` and `packages/control-plane/vitest.global-setup.ts` — **both** TRUNCATE lists (P5a sitting 11 finding 7: there are two, and they must move together)

**Interfaces:**
- Produces: `mintToken()`, `parseToken()`, `hashSecret()`, `secretMatches()`, `TOKEN_PREFIX`; `createToken()`, `tokenById()`, `revokeToken()`, `touchToken()`; and the three fixtures every later task's tests use — `mintTestToken()`, `withProject()` and `sessionFor()` (*The test fixtures every snippet below uses*). Task 4 consumes the first group, Task 5 the second.

- [ ] **Step 1: Write the failing test for the token's shape**

`packages/control-plane/src/tokens/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashSecret, mintToken, parseToken, TOKEN_PREFIX } from './token.js'

describe('a delegated token’s shape (D24, Decision 1)', () => {
  it('is prefix, id and secret, and the id round-trips', () => {
    const id = '7c841b6e-4e60-4b96-9002-964cd3baa83c'
    const minted = mintToken(id)
    expect(minted.plaintext.startsWith(`${TOKEN_PREFIX}_`)).toBe(true)
    const parsed = parseToken(minted.plaintext)
    expect(parsed?.id).toBe(id)
    expect(parsed?.secret).toBe(minted.secret)
  })

  it('stores a hash, never the secret', () => {
    const minted = mintToken('7c841b6e-4e60-4b96-9002-964cd3baa83c')
    expect(minted.tokenHash).toBe(hashSecret(minted.secret))
    expect(minted.tokenHash).not.toContain(minted.secret)
    expect(minted.tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('mints a different secret every time', () => {
    const id = '7c841b6e-4e60-4b96-9002-964cd3baa83c'
    const secrets = new Set(Array.from({ length: 50 }, () => mintToken(id).secret))
    expect(secrets.size).toBe(50)
  })

  // Every one of these is a string an agent, a shell or a log rotation could hand us.
  it.each([
    ['empty', ''],
    ['no prefix', 'abc_def'],
    ['wrong prefix', 'ghp_7c841b6e4e604b969002964cd3baa83c_x'],
    ['no secret', `${TOKEN_PREFIX}_7c841b6e4e604b969002964cd3baa83c`],
    ['id not hex', `${TOKEN_PREFIX}_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_x`],
    ['id wrong length', `${TOKEN_PREFIX}_7c841b6e_x`],
    ['too many parts', `${TOKEN_PREFIX}_7c841b6e4e604b969002964cd3baa83c_a_b`],
    ['a session cookie', 'eyJ1c2VySWQiOiJ4In0.c2ln'],
  ])('refuses %s without throwing', (_name, input) => {
    expect(parseToken(input)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/tokens/token.test.ts
```

Expected: FAIL — `Cannot find module './token.js'`.

- [ ] **Step 3: Write `tokens/token.ts`**

```ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * `mft` — Manifest delegated token. A fixed, greppable prefix so a leaked credential is
 * recognisable in a log, a paste or a scanner, and so `parseToken` can refuse a session
 * cookie loudly rather than treating it as a malformed token (Decision 1).
 */
export const TOKEN_PREFIX = 'mft'

/** 32 bytes of CSPRNG. See Decision 1 for why this is hashed and not KDF'd. */
const SECRET_BYTES = 32

export interface MintedToken {
  /** The ONLY moment this exists. Returned to the minter once and never stored. */
  plaintext: string
  secret: string
  tokenHash: string
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function mintToken(id: string): MintedToken {
  const secret = randomBytes(SECRET_BYTES).toString('base64url')
  return {
    plaintext: `${TOKEN_PREFIX}_${id.replaceAll('-', '')}_${secret}`,
    secret,
    tokenHash: hashSecret(secret),
  }
}

const ID_32 = /^[0-9a-f]{32}$/

/**
 * Undefined for anything that is not one of ours — never a throw. This runs on every
 * request carrying an Authorization header, including requests from things that are not
 * clients of ours at all, so a malformed value is an ordinary answer, not an exception.
 */
export function parseToken(
  plaintext: string,
): { id: string; secret: string } | undefined {
  const parts = plaintext.split('_')
  if (parts.length !== 3) return undefined
  const [prefix, rawId, secret] = parts as [string, string, string]
  if (prefix !== TOKEN_PREFIX || !ID_32.test(rawId) || secret.length === 0)
    return undefined
  const id = [
    rawId.slice(0, 8),
    rawId.slice(8, 12),
    rawId.slice(12, 16),
    rawId.slice(16, 20),
    rawId.slice(20),
  ].join('-')
  return { id, secret }
}

/**
 * Constant-time by length AND content. `timingSafeEqual` throws on a length mismatch,
 * which would itself be a timing signal and a crash on malformed input, so the lengths
 * are compared first and a mismatch answers false.
 */
export function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/tokens/token.test.ts
```

Expected: PASS, 11 tests (3 plus the 8 `it.each` cases).

- [ ] **Step 5: The schema, and the migration**

In `packages/control-plane/src/db/schema.ts`, beside the other tables:

```ts
export const pendingActionState = pgEnum('pending_action_state', [
  'pending',
  'confirmed',
  'rejected',
  'expired',
])

export const delegatedTokens = pgTable(
  'delegated_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** D24: scoped to ONE project (Decision 3). */
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** A person's label for it, so a list of tokens is reviewable. */
    name: text('name').notNull(),
    /** sha256 of the secret, hex. THE SECRET IS NEVER STORED (Decision 1). */
    tokenHash: text('token_hash').notNull().unique(),
    /** The explicit set D24 asks for. Never one of PRIVILEGED — Task 4 refuses it at mint. */
    capabilities: jsonb('capabilities').notNull().$type<string[]>(),
    rateLimit: integer('rate_limit').notNull().default(600),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('delegated_tokens_user_idx').on(t.userId)],
)

export const pendingActions = pgTable(
  'pending_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /**
     * D24 and §6. `restrict`, not `cascade`: a pending action is the record that a token
     * asked for something privileged, and revoking the token must not erase it.
     */
    requestedByToken: uuid('requested_by_token')
      .notNull()
      .references(() => delegatedTokens.id, { onDelete: 'restrict' }),
    /** The capability that was refused — one of PRIVILEGED. */
    action: text('action').notNull(),
    /**
     * What was asked for: method, path and a sha256 of the canonical body. NOT the body
     * itself — a refused request can carry anything, and this row is read by a person in
     * a queue (§26). The fingerprint is what Task 7 matches a retry against.
     */
    payload: jsonb('payload').notNull().$type<{
      method: string
      path: string
      bodySha256: string
      summary: string
    }>(),
    state: pendingActionState('state').notNull().default('pending'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** Task 10: an unanswered request does not wait for ever. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Decision 7: confirmed-and-used, without a fifth state. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('pending_actions_project_state_idx').on(t.projectId, t.state)],
)
```

Generate and apply the migration:

```bash
cd /Users/rich/Developer/manifest
pnpm --filter @manifest/control-plane db:generate
pnpm --filter @manifest/control-plane db:migrate       # reads MANIFEST_ADMIN_DATABASE_URL
```

**Read the generated SQL before applying it.** A migration is always its own file and drizzle-kit never re-runs an applied one.

- [ ] **Step 6: Both TRUNCATE lists**

`packages/control-plane/src/db/testing.ts` and `packages/control-plane/vitest.global-setup.ts` each carry one, and **they must move together** (P5a sitting 11 finding 7). `pending_actions` references `delegated_tokens` with `ON DELETE restrict`, so **`pending_actions` must be truncated before `delegated_tokens`, and both before `projects` and `users`** — the same ordering trap `audit.role_changes` hit.

- [ ] **Step 7: The repository, its test, and the testing helper**

`packages/control-plane/src/tokens/repository.test.ts` — driven against a real database with `withRollback`:

```ts
import { describe, expect, it } from 'vitest'
import { withRollback } from '../db/testing.js'
import { createToken, revokeToken, tokenById, touchToken } from './repository.js'
import { mintToken } from './token.js'

describe('the delegated token store', () => {
  it('stores a hash and reads the row back by id', async () => {
    await withRollback(async (db, { userId, projectId }) => {
      const minted = mintToken('00000000-0000-0000-0000-000000000000')
      const row = await createToken(db, {
        userId,
        projectId,
        name: 'ci',
        tokenHash: minted.tokenHash,
        capabilities: ['project:read', 'build:create'],
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      const read = await tokenById(db, row.id)
      expect(read?.tokenHash).toBe(minted.tokenHash)
      expect(read?.capabilities).toEqual(['project:read', 'build:create'])
      expect(read?.revokedAt).toBeNull()
    })
  })

  it('refuses two tokens with the same hash', async () => {
    // The unique index is the real guard: a duplicated hash would make one secret
    // authenticate two rows, and which one wins would be the planner's choice.
    await withRollback(async (db, { userId, projectId }) => {
      const minted = mintToken('00000000-0000-0000-0000-000000000000')
      const args = {
        userId,
        projectId,
        name: 'ci',
        tokenHash: minted.tokenHash,
        capabilities: ['project:read'],
        expiresAt: new Date(Date.now() + 86_400_000),
      }
      await createToken(db, args)
      await expect(createToken(db, { ...args, name: 'ci-2' })).rejects.toThrow()
    })
  })

  it('revokes once, and says so', async () => {
    await withRollback(async (db, { userId, projectId }) => {
      const minted = mintToken('00000000-0000-0000-0000-000000000000')
      const row = await createToken(db, {
        userId, projectId, name: 'ci', tokenHash: minted.tokenHash,
        capabilities: ['project:read'], expiresAt: new Date(Date.now() + 86_400_000),
      })
      expect(await revokeToken(db, row.id, userId)).toBe(true)
      expect((await tokenById(db, row.id))?.revokedAt).not.toBeNull()
      // Idempotent: revoking a revoked token is not an error, and does not move the stamp.
      const stamp = (await tokenById(db, row.id))?.revokedAt
      expect(await revokeToken(db, row.id, userId)).toBe(false)
      expect((await tokenById(db, row.id))?.revokedAt).toEqual(stamp)
    })
  })

  it('records last use without rewriting anything else', async () => {
    await withRollback(async (db, { userId, projectId }) => {
      const minted = mintToken('00000000-0000-0000-0000-000000000000')
      const row = await createToken(db, {
        userId, projectId, name: 'ci', tokenHash: minted.tokenHash,
        capabilities: ['project:read'], expiresAt: new Date(Date.now() + 86_400_000),
      })
      await touchToken(db, row.id)
      const read = await tokenById(db, row.id)
      expect(read?.lastUsedAt).not.toBeNull()
      expect(read?.tokenHash).toBe(minted.tokenHash)
    })
  })
})
```

Write `repository.ts` to make it pass, and `tokens/testing.ts` with
`mintTestToken(db, { userId, projectId, capabilities, rateLimit? })` returning
`{ plaintext, row }`. **Then write `withProject` and `sessionFor` in `api/testing.ts`**, to
the signatures in *The test fixtures every snippet below uses* — four later test files
depend on them, and a fixture copied four times drifts four ways (P5a sitting 10 finding 6).
`withProject` creates a SECOND project owned by somebody else, which is what Decision 3's
scope rule is tested against and is easy to forget until Task 5 needs it.

- [ ] **Step 8: Run, gate, commit**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/tokens/
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane
git commit -m "feat(tokens): the delegated token and pending action stores, and the token's shape"
```

- [ ] **Step 9: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| `mintToken` returns the secret as `tokenHash` | *stores a hash, never the secret* — `expected '<secret>' to match /^[0-9a-f]{64}$/` |
| `parseToken` accepts any prefix | *refuses wrong prefix without throwing* — `expected { id: …} to be undefined` |
| the `unique()` dropped from `tokenHash` | *refuses two tokens with the same hash* — `promise resolved instead of rejecting` |
| `pending_actions` removed from one TRUNCATE list only | **run `pnpm test` twice** — the second run fails on a foreign key, which is the point: one list moving without the other is invisible in a single run |
| `randomBytes` replaced by a constant | *mints a different secret every time* — `expected 1 to be 50` |

---

## Task 4: Minting, listing and revoking a token — interactive sessions only

**What this is for.** D24: a token is *"minted by the user in an interactive session, scoped to a project and a capability set, with an expiry."* This task builds the three routes, their representations, and the two rules that make minting safe: **a token may never be minted holding a privileged capability**, and **the plaintext is returned exactly once**.

**Its caller** is `packages/journey`'s new token phase (Task 12) and `scripts/demo-token.sh`; until then, `api/tokens.test.ts` drives it through `app.inject`. **Task 12 is where it gets a real caller through the edge** — that is stated here so the gap is deliberate.

**Files:**
- Create: `packages/control-plane/src/api/representations/tokens.ts`
- Create: `packages/control-plane/src/api/routes/tokens.ts`
- Create: `packages/control-plane/src/api/tokens.test.ts`
- Modify: `api/routes/index.ts`, `api/error-codes.ts`, `observability/{events,event-schemas,testing}.ts`
- Modify: `packages/contract/openapi.json` (generated), `docs/superpowers/RUNBOOK.md`

**Interfaces:**
- Consumes: `mintToken`, `createToken`, `tokenById`, `revokeToken` (Task 3); `PRIVILEGED`, `isPrivileged` (Task 2).
- Produces: `POST /v1/projects/{projectId}/tokens`, `GET /v1/projects/{projectId}/tokens`, `DELETE /v1/tokens/{tokenId}`; the `MintedToken` and `Token` representations.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/api/tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loginAs, mutationHeaders, withProject } from './testing.js'

describe('minting a delegated token (D24, Task 4)', () => {
  it('returns the plaintext exactly once, and never again', async () => {
    await withProject(async ({ app, projectId }) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const minted = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tokens`,
        cookies: owner, headers: mutationHeaders(ctx.deps),
        payload: { name: 'ci', capabilities: ['project:read', 'build:create'], expiresInDays: 30 },
      })
      expect(minted.statusCode).toBe(201)
      const body = minted.json()
      expect(body.secret).toMatch(/^mft_[0-9a-f]{32}_/)

      const listed = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectId}/tokens`,
        cookies: owner,
      })
      const one = listed.json().find((t: { id: string }) => t.id === body.id)
      expect(one).toBeDefined()
      // The read schema HAS NO `secret` FIELD (Decision 11) — not an empty one.
      expect('secret' in one).toBe(false)
      expect(JSON.stringify(listed.json())).not.toContain(body.secret)
    })
  })

  it('refuses to mint a token holding a privileged capability', async () => {
    await withProject(async ({ app, projectId }) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      for (const capability of ['members:manage', 'release:promote', 'quota:set', 'secret:read']) {
        const res = await app.inject({
          method: 'POST',
          url: `/v1/projects/${projectId}/tokens`,
          cookies: owner, headers: mutationHeaders(ctx.deps),
          payload: { name: 'bad', capabilities: ['project:read', capability], expiresInDays: 30 },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error.code).toBe('TOKEN_CAPABILITY_FORBIDDEN')
        // D23.7: the message must name WHICH capability, or an agent cannot correct itself.
        expect(res.json().error.message).toContain(capability)
      }
    })
  })

  it('refuses a capability the minter does not hold themselves', async () => {
    // A collaborator cannot mint a token that deploys if they cannot deploy. Otherwise a
    // token is a privilege-escalation primitive rather than a delegation of one.
    await withProject(async ({ app, projectId }) => {
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tokens`,
        cookies: collaborator, headers: mutationHeaders(ctx.deps),
        payload: { name: 'x', capabilities: ['project:delete'], expiresInDays: 30 },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })
  })

  it('revokes a token, and a stranger cannot', async () => {
    await withProject(async ({ app, projectId }) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const minted = (
        await app.inject({
          method: 'POST',
          url: `/v1/projects/${projectId}/tokens`,
          cookies: owner, headers: mutationHeaders(ctx.deps),
          payload: { name: 'ci', capabilities: ['project:read'], expiresInDays: 30 },
        })
      ).json()

      const stranger = await sessionFor(ctx, 'stu000001')
      const refused = await app.inject({
        method: 'DELETE',
        url: `/v1/tokens/${minted.id}`,
        cookies: stranger, headers: mutationHeaders(ctx.deps),
      })
      expect(refused.statusCode).toBe(404)
      expect(refused.json().error.code).toBe('NOT_FOUND')

      const revoked = await app.inject({
        method: 'DELETE',
        url: `/v1/tokens/${minted.id}`,
        cookies: owner, headers: mutationHeaders(ctx.deps),
      })
      expect(revoked.statusCode).toBe(200)
      expect(revoked.json().revokedAt).not.toBeNull()
    })
  })

  it('bounds the expiry, and says what the bound is', async () => {
    await withProject(async ({ app, projectId }) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/tokens`,
        cookies: owner, headers: mutationHeaders(ctx.deps),
        payload: { name: 'forever', capabilities: ['project:read'], expiresInDays: 4000 },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('REQUEST_INVALID')
      expect(res.json().error.message).toContain('expiresInDays')
    })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/tokens.test.ts
```

Expected: FAIL — `404 ROUTE_NOT_FOUND` on every case.

- [ ] **Step 3: The representations**

`packages/control-plane/src/api/representations/tokens.ts`:

```ts
import { z } from 'zod/v4'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'
import type { delegatedTokens } from '../../db/index.js'

/**
 * A token as anyone may read it afterwards. THERE IS NO `secret` FIELD — not an optional
 * one (Decision 11): a representation that CAN carry a credential eventually does.
 */
export const Token = representation(
  'Token',
  z
    .object({
      id: Uuid,
      projectId: Uuid,
      name: z.string(),
      capabilities: z.array(z.string()),
      rateLimit: z.int(),
      expiresAt: Timestamp,
      revokedAt: Timestamp.nullable(),
      lastUsedAt: Timestamp.nullable(),
      createdAt: Timestamp,
    })
    .describe(
      'A delegated token (D24), scoped to one project and a capability set. Its secret is shown once, when it is minted, and is never readable again.',
    ),
)

export const TokenList = representation('TokenList', z.array(Token))

/**
 * The mint response, and the ONE place in this API that returns a credential. A separate
 * schema from `Token` so that the field cannot leak into a read by someone adding an
 * optional property later.
 */
export const MintedToken = representation(
  'MintedToken',
  z
    .object({
      token: Token,
      secret: z
        .string()
        .describe(
          'The token, in full: `mft_<id>_<secret>`. Shown ONCE. Store it now — the platform keeps only a hash and cannot show it again.',
        ),
    })
    .describe('A newly minted delegated token, with its secret. The only time the secret exists.'),
)

export function toToken(row: typeof delegatedTokens.$inferSelect): z.input<typeof Token> {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    capabilities: row.capabilities,
    rateLimit: row.rateLimit,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
```

- [ ] **Step 4: The routes**

`packages/control-plane/src/api/routes/tokens.ts` — three `defineRoute` definitions. The mint handler, in order:

1. `assertCapability(db, actor, projectId, 'project:write')` — who may mint at all.
2. **Refuse a privileged capability**, before anything is written: `const bad = body.capabilities.filter((c) => isPrivileged(c as Capability))`, and if any, throw `BadRequestError('TOKEN_CAPABILITY_FORBIDDEN', …)` naming them. *(Defence in depth: Task 6's central rule is the control; this makes the row impossible as well as the request.)*
3. **Refuse a capability the minter does not hold**: compare against `capabilitiesFor(await membershipOf(...), actor.platformRole)` and throw `AuthorizationError('FORBIDDEN', …)`.
4. Insert the row, then `mintToken(row.id)` and store the hash — **two statements in one transaction**, because the id has to exist before the plaintext can embed it.
5. Publish `token.minted` — **never the secret, never the hash** (§14).
6. Return `{ token: toToken(row), secret: minted.plaintext }` with status **201**.

**Every route in this module takes a `SessionActor`** (Task 5's union makes that a type error to get wrong); until Task 5 lands, add the comment `// Interactive only (D24). Task 5 makes this a type error rather than a comment.`

- [ ] **Step 5: The error codes and the event type**

`api/error-codes.ts` gains `TOKEN_CAPABILITY_FORBIDDEN` (400, `BadRequestError`). The event type `token.minted` is **four edits** (*Read this first* 8) — `EVENT_TYPES`, the migration for the database CHECK, `EVENT_DETAIL_SCHEMAS`, and `observability/testing.ts`'s `EXAMPLE_DETAILS`. Its `machineDetail` is `{ tokenId, projectId, capabilities, expiresAt }`; its `humanMessage` names the token and who minted it.

- [ ] **Step 6: Run, regenerate the contract, gate, commit**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/tokens.test.ts
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane packages/contract docs
git commit -m "feat(api): mint, list and revoke a delegated token, in an interactive session"
```

Add RUNBOOK's *Minting a delegated token* in the same commit — §20 asks for the out-of-band admin procedure to be documented, and this is the credential an agent will actually be handed.

- [ ] **Step 7: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| the privileged filter deleted from the mint handler | *refuses to mint a token holding a privileged capability* — `expected 201 to be 400` |
| `secret` added to the `Token` schema and populated | *returns the plaintext exactly once* — `expected true to be false` on `'secret' in one` |
| the minter's-own-capability check deleted | *refuses a capability the minter does not hold themselves* — `expected 201 to be 403` |
| revoke's ownership check deleted | *revokes a token, and a stranger cannot* — `expected 200 to be 404` |
| `expiresInDays`'s `.max()` removed | *bounds the expiry* — `expected 201 to be 400` |
| the mint response returns the row instead of `toToken(row)` | **watch which** — P5a sitting 10 finding 10 says a `Date` in a `Timestamp` field is a `500`, not a stripped `200`, so expect `expected 500 to be 201` and record it |

---
## Task 5: Bearer authentication — one place turns either credential into an `Actor`
> **Task 1 correction (2026-09-17, `[M1]`, `[M3]`, `[M7]`, `[M9]`).** Four things, two of which add steps.
>
> **1. `[M3]` — `Authorization` survives the edge on BOTH a plain request and a WebSocket upgrade** (measured, with a header-less negative control). The contingency this task prepared — "a token cannot open a stream, named in *What this plan does not build*" — is **not needed**. Caddy does no header manipulation on the console site; nothing written down keeps it that way.
>
> **2. `[M1]` — THIS TASK GAINS A STEP: `GET /v1/projects` escapes a token's scope.** `listProjectsFor` (`projects/repository.ts:159`) selects by `actor.userId` alone, and the route calls no `assertCapability`, so Task 6's central refusal never sees it. A token scoped to project X, minted by a user who is also a member of Y and Z, **lists all three** — contradicting Decision 12, which promises it "answers exactly its own project". Scope it here; it cannot be done in `assertCapability`. `POST /v1/projects` needs its explicit Decision 13 refusal for the same structural reason (no capability check runs on it to carry one). The plan said `fleet.ts` was the only module that must change; **it is one of three.**
>
> **3. `[M7]` — THIS TASK GAINS A STEP: `assertSameOrigin` runs on EVERY upgrade, regardless of credential.** `routes/events.ts`'s `preValidation` applies it whenever `isUpgrade(request)`. Global Constraints says a bearer token is not a browser credential and CSRF does not apply to it — but as the code stands **a token opening a stream must also send `Origin: https://console.manifest.internal`.** Either make the check conditional on the credential class or state that a token-bearing stream sends the origin anyway; leaving it unstated produces a demo that works only because the script happened to send the header. The good news: `authorizeStream` reads `requireActor`, **not the cookie**, so the stream needs no other change.
>
> **4. `[M9]` — no collision.** One inbound reader of the header exists (`routes/registry-token.ts:82`) and it reads **`Basic`**, outside `/v1`: distinguished by both scheme and path. **But `observability/redact.ts:46` only redacts a secret behind the word `Bearer`** — a token logged bare, which is how a mint response or a `token_hash` would be logged, is not redacted. Do not assume the redactor covers it.
>
> **5. There are TWO `Actor` types.** `projects/authz.ts:19`'s `Actor` has `userId` and `platformRole` and **no `puid`**; `api/actor.ts:4` is `SessionActor = Actor & { puid: string }`, an INTERSECTION. Decision 2's `Extract<Actor, { credential: 'session' }>` applied to the `projects/` `Actor` **drops `puid`**. Either move `puid` onto the session member of the union, or keep `SessionActor` an intersection over the extracted member.

**What this is for.** D23.4: *"The API is the only integration point, authentication included: an interactive session cookie for browsers, a scoped delegated token for agents."* Today one `onRequest` hook turns a cookie into an actor and routes never read the cookie. This task keeps that property with two credential classes, and makes **"interactive only" a type error rather than a habit** (Decision 2).

**Files:**
- Modify: `packages/control-plane/src/projects/authz.ts` — `Actor` becomes a union
- Modify: `packages/control-plane/src/api/actor.ts` — `requireActor`, `requireSession`
- Modify: `packages/control-plane/src/api/server.ts` — the credential hook, the CSRF rule
- Modify: `packages/control-plane/src/api/routes/fleet.ts` — session-only (Decision 4)
- Modify: `packages/control-plane/src/api/routes/events.ts` — if `[M7]` says it reads the cookie
- Modify: `packages/contract/src/client.ts` — a bearer client
- Create: `packages/control-plane/src/api/credential.test.ts`

**Interfaces:**
- Consumes: `parseToken`, `secretMatches`, `tokenById`, `touchToken` (Task 3).
- Produces: `Actor` (a union), `SessionActor`, `TokenActor`, `requireSession(request)`; `createManifestClient({ token })`. Task 6 consumes the union.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/api/credential.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mintTestToken } from '../tokens/testing.js'
import { loginAs, mutationHeaders, withProject } from './testing.js'

describe('the two credential classes (D24, D23.4)', () => {
  it('lets a token read the project it is scoped to', async () => {
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read'],
      })
      const res = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe(projectId)
    })
  })

  it('answers 404 for a project the token is not scoped to', async () => {
    // The STRANGER's answer, not FORBIDDEN (Decision 3): a token must not be an
    // enumeration oracle any more than a stranger is.
    await withProject(async ({ app, db, projectId, userId, otherProjectId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read'],
      })
      const res = await app.inject({
        method: 'GET',
        url: `/v1/projects/${otherProjectId}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('NOT_FOUND')
    })
  })

  it('refuses a capability the token was not minted with', async () => {
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read'],
      })
      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/builds`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
        payload: {},
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })
  })

  it.each([
    ['a revoked token', 'revoked'],
    ['an expired token', 'expired'],
    ['an unknown id', 'unknown'],
    ['a wrong secret', 'wrong-secret'],
    ['a malformed value', 'malformed'],
  ])('answers 401 UNAUTHENTICATED for %s', async (_name, kind) => {
    await withProject(async ({ app, db, projectId, userId }) => {
      const header = await bearerFor(db, { userId, projectId, kind })
      const res = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectId}`,
        headers: { authorization: header },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('UNAUTHENTICATED')
    })
  })

  it('does not require an Origin on a token mutation, and still does on a session one', async () => {
    // CSRF is a BROWSER attack. A bearer token is not sent automatically by a browser,
    // so demanding an Origin of it would be cargo cult — and would lock out every agent.
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read', 'build:create'],
      })
      const byToken = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/builds`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
        payload: {},
      })
      expect(byToken.statusCode).toBe(202)

      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const bySession = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/builds`,
        cookies: owner,
        headers: { 'idempotency-key': 'k'.repeat(12) },  // NO origin
        payload: {},
      })
      expect(bySession.statusCode).toBe(403)
      expect(bySession.json().error.code).toBe('CSRF_ORIGIN_REFUSED')
    })
  })

  it('refuses a request carrying BOTH a cookie and a bearer token', async () => {
    // Two credentials is ambiguous, and an ambiguity resolved silently is the shape
    // every confused-deputy bug has. Refuse it and say so.
    await withProject(async ({ app, db, projectId, userId }) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read'],
      })
      const res = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectId}`,
        cookies: owner,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('CREDENTIAL_AMBIGUOUS')
    })
  })

  it('refuses a token the creation of a project — §24’s audience is human-only (D29)', async () => {
    // Decision 12a/13: `audience` is stated at creation and nowhere else, so refusing
    // creation to a token is what keeps §24's question human-only. Asserted, not inferred.
    await withProject(async (ctx) => {
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId, projectId: ctx.projectId, capabilities: ['project:read'],
      })
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
        payload: projectBody('another-app'),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('TOKEN_CREDENTIAL_REFUSED')
    })
  })

  it('refuses a token the fleet — §26 is an interactive read', async () => {
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read'],
      })
      const res = await app.inject({
        method: 'GET', url: '/v1/fleet', headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('TOKEN_CREDENTIAL_REFUSED')
    })
  })

  it('records last use, and never the secret', async () => {
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext, row } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read'],
      })
      await app.inject({
        method: 'GET', url: `/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      const { tokenById } = await import('../tokens/repository.js')
      expect((await tokenById(db, row.id))?.lastUsedAt).not.toBeNull()
    })
  })
})
```

`bearerFor` is a helper local to this file: it mints a token and then, per `kind`, revokes it, backdates `expiresAt`, swaps the id for a random uuid, corrupts the secret, or returns `'Bearer not-a-token'`.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/credential.test.ts
```

Expected: FAIL — every case `401`, because nothing reads the header.

- [ ] **Step 3: `Actor` becomes a union**

In `packages/control-plane/src/projects/authz.ts`:

```ts
/** Who is asking, and with WHICH credential class (D24). Carried from the request hook. */
export type Actor = SessionActor | TokenActor

export interface SessionActor {
  credential: 'session'
  userId: string
  platformRole: 'admin' | 'member'
  puid: string
}

export interface TokenActor {
  credential: 'token'
  userId: string
  tokenId: string
  /** D24 and Decision 3: exactly one project. */
  projectId: string
  /** The explicit set the token was minted with. Never one of PRIVILEGED. */
  capabilities: ReadonlySet<Capability>
  /** §20's per-token limit, off the row. Task 9 is its only reader. */
  rateLimit: number
  /**
   * Set by the route wrapper, from a `confirmed` PendingAction whose fingerprint matches
   * THIS request (Task 7, Decision 6). Absent on every ordinary request, and nothing but
   * that wrapper can produce it. It is the single-use permission a human granted.
   */
  grant?: Capability
  /**
   * NO `platformRole`. Decision 4: a token never carries platform-admin authority, and a
   * field that exists and is deliberately never read is the next agent's bug.
   */
}
```

`capabilitiesFor` keeps its signature; `assertCapability` gains a token branch **in Task 6**, not here. For this task a token's capability check is: scope first (`actor.projectId !== projectId` → `NOT_FOUND`), then `actor.capabilities.has(capability)` → `FORBIDDEN`.

**`api/actor.ts`:**

```ts
export function requireActor(request: FastifyRequest): Actor { … }

/**
 * For a route D24 reserves to an interactive session. The RETURN TYPE is the point: a
 * handler that takes a `SessionActor` cannot be handed a token, and `tsc` says so at the
 * call site rather than a reviewer saying so in a comment (Decision 2).
 */
export function requireSession(request: FastifyRequest): SessionActor {
  const actor = requireActor(request)
  if (actor.credential !== 'session') {
    throw new TokenCredentialRefusedError(
      'this action is only available in an interactive session (D24)',
    )
  }
  return actor
}
```

- [ ] **Step 4: The credential hook — one place, two classes**

In `api/server.ts`, replace the body of the existing `onRequest` hook. **Keep it one hook**: two hooks is two places that decide who is asking.

```ts
  // ONE place turns a credential into an actor. Routes never read the cookie or the
  // header — that property is what makes D24's central rule possible at all.
  app.addHook('onRequest', async (request) => {
    const bearer = readBearer(request)          // undefined unless `Authorization: Bearer …`
    const cookie = request.cookies[SESSION_COOKIE]
    if (bearer !== undefined && cookie !== undefined) {
      throw new BadRequestError(
        'CREDENTIAL_AMBIGUOUS',
        'a request carries either a session cookie or a delegated token, never both',
        'Send the Authorization header alone for an agent, or the cookie alone for a browser.',
      )
    }
    if (bearer !== undefined) {
      request.actor = await tokenActor(deps, bearer)   // throws 401 for every bad case
      return
    }
    if (cookie === undefined) return
    const session = verifySession(cookie, deps.config.sessionSecret)
    if (!session) return
    request.actor = {
      credential: 'session',
      userId: session.userId,
      platformRole: session.role,
      puid: session.puid,
    }
  })
```

`tokenActor` lives in `tokens/` and does: `parseToken` → `tokenById` → **one refusal for every failure** (unknown id, wrong secret, revoked, expired) so that a caller cannot tell which is wrong, → `touchToken` (fire and forget, but **awaited**: an unawaited write is a floating promise ESLint refuses) → the `TokenActor`.

**`readBearer` must not be fooled**: `Bearer` is case-insensitive per RFC 7235, and a value with no space, or a second scheme, is not a bearer credential.

- [ ] **Step 5: CSRF applies to sessions only**

In the `preHandler`, the origin check becomes:

```ts
    // §20's CSRF control protects a BROWSER credential. A bearer token is not sent
    // automatically by a browser, so requiring an Origin of it would refuse every agent
    // for no gain. `carriesSession` in `csrf.ts` already names the condition.
    if (request.actor?.credential === 'session' && request.routeOptions.config?.csrf !== 'exempt') {
      assertSameOrigin(request, deps.config.sp.origin)
    }
```

**Read `csrf.ts`'s `carriesSession` before editing** — it may already express this, in which case the change is one line there rather than here, and the record says so.

- [ ] **Step 6: The fleet becomes session-only, and the stream learns the actor**

`api/routes/fleet.ts`: `requireSession` instead of reading `actor.platformRole` off a possibly-token actor. Keep the admin check — the two rules are independent and both apply.

`api/routes/events.ts`: `[M7]` says whether it reads the cookie. If it does, it reads `request.actor` instead. **If `[M3]` measured that Caddy strips `Authorization` on an upgrade**, this step instead writes the one-line refusal and *What this plan does not build* gains "a token cannot open an event stream", with the measurement cited.

- [ ] **Step 7: The client learns a second credential**

`packages/contract/src/client.ts` — `ManifestClientOptions` gains `token?: string`, mutually exclusive with `session`:

```ts
  // Exactly one credential, enforced here as well as by the server (D24): a client that
  // sends both gets a 400 it cannot act on, and the fix belongs where the mistake is.
  if (options.session !== undefined && options.token !== undefined)
    throw new Error('a Manifest client carries either a session or a delegated token, never both')
```

A token client sets `authorization` and **does not set `origin`** — it is not a browser.

- [ ] **Step 8: Run, regenerate, gate, commit**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/credential.test.ts
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane packages/contract
git commit -m "feat(api): bearer authentication — one hook, two credential classes"
```

- [ ] **Step 9: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| the scope check dropped (a token may address any project) | *answers 404 for a project the token is not scoped to* — `expected 200 to be 404` |
| the scope refusal answers `403` instead of `404` | the same test's `expected 'FORBIDDEN' to be 'NOT_FOUND'` — **the code, not only the status** |
| `revokedAt` ignored in `tokenActor` | *answers 401 UNAUTHENTICATED for a revoked token* |
| `secretMatches` replaced by `===` | *answers 401 for a wrong secret* stays green — **and that is the finding**: string equality still refuses a wrong secret, it merely leaks timing. **Record that this control cannot fail through the API**, and watch `token.test.ts`'s timing-safety assertion instead, or say plainly that the property is unasserted |
| the both-credentials refusal deleted | *refuses a request carrying BOTH* — `expected 200 to be 400` |
| CSRF applied to tokens too | *does not require an Origin on a token mutation* — `expected 403 to be 202` |
| `requireSession` in `fleet.ts` reverted to `requireActor` | *refuses a token the fleet* — `expected 200 to be 403` |
| `requireSession` reverted on `POST /v1/projects` | *refuses a token the creation of a project* — and **§24's audience becomes token-settable**, which is the rule that refusal is really holding |

**The fourth row is expected to be a genuine can't-fail control**, and it is written down in advance rather than discovered. P5a sitting 12 found three of these; naming the likely one here is the cheapest way to be honest about it.

---

## Task 6: The central refusal, and the `PendingAction` it creates
> **Task 1 correction (2026-09-17, `[M5]`, `[M1]`, `[M7]`). READ THIS BEFORE WRITING THE CATCH — as drafted, this task deadlocks D24's loop.**
>
> **1. THE CATCH MUST GO OUTSIDE `app.idempotent(...)`.** `registerRoutes` (`route.ts:159`) is `route.method === 'GET' ? await run() : await app.idempotent(request, run)`, and `app.idempotent` is `replayOrStore`, which **stores whatever `run` RESOLVES with** and, on a repeated key, **returns the stored response without ever calling `run`**. If the refusal is caught around `run` — the natural reading of Decision 5, and where it is easiest to write — `run` resolves with the 403 and **the refusal is cached under `(key, userId, route)`**. The human then confirms, the agent retries **with the same `Idempotency-Key`** — exactly what D23.6's own error hint instructs — and `replayOrStore` replays the cached 403 without reaching the handler. **The confirmation is never consumed, `consumed_at` is never stamped, and the agent loops for ever on a cached refusal.** Every test that mints a fresh key per request stays green. Catch outside `app.idempotent` so the refusal propagates out of `replayOrStore` as a throw and nothing is stored. **Adding `token_id` to the primary key does NOT fix this** — the 403 would cache in the token's own namespace and deadlock there. This needs its own negative control: refuse, confirm, retry with the SAME key, assert the retry reaches the handler.
>
> **2. "the one wrapper that runs for every `/v1` route" is not literally true.** `[M7]`: the event stream is registered with `app.route` DIRECTLY in `routes/events.ts:66` and is **absent from `ROUTE_DEFINITIONS`**, so `registerRoutes` never wraps it. Harmless today — the stream's only capability is `project:read`, which is never privileged, so the refusal cannot be thrown there — but **state the assumption where this task claims centrality.** The day a privileged capability is checked on a non-`registerRoutes` route, the refusal escapes the wrapper and becomes a 500.
>
> **3. `[M1]`: three route modules bypass `assertCapability` and must be handled in Task 5, not here** — `fleet.ts` (known), `project-reads.ts`'s `GET /v1/projects` (missed by the plan) and `projects.ts`'s `POST /v1/projects`. Central enforcement covers the other 22 routes; **these three are named exceptions, not oversights**, and this task should say so rather than imply the wrapper covers everything.

**Why alone.** This is D24's sentence — *"enforced centrally at the authorization layer, not per-route, so a new privileged route cannot accidentally omit it"* — and it is the one design commitment in this plan that is expensive to reverse. It is also the task where a mistake is a security defect rather than a bug.

**Files:**
- Modify: `packages/control-plane/src/projects/authz.ts` — the token branch and `TokenCapabilityRefusedError`
- Create: `packages/control-plane/src/tokens/pending.ts` and `pending.test.ts`
- Modify: `packages/control-plane/src/api/contract/route.ts` — the one place that records
- Create: `packages/control-plane/src/api/representations/pending-actions.ts`
- Modify: `packages/control-plane/src/api/representations/errors.ts` — `ErrorEnvelope` gains `pendingAction`
- Create: `packages/control-plane/src/api/delegation.test.ts`
- Modify: `api/error-codes.ts`, `observability/{events,event-schemas,testing}.ts`

**Interfaces:**
- Consumes: `PRIVILEGED`, `isPrivileged` (Task 2); `pendingActions` (Task 3); the `Actor` union (Task 5).
- Produces: `TokenCapabilityRefusedError`, `recordPendingAction()`, `pendingById()`, `fingerprintOf(request)`; the `PendingAction` representation. Task 7 consumes all of them.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/api/delegation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mintTestToken } from '../tokens/testing.js'
import { loginAs, mutationHeaders, withProject } from './testing.js'

describe('D24’s central refusal', () => {
  it('refuses a privileged action to a token and records a PendingAction', async () => {
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext, row } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read', 'members:manage'],
      })
      // The token was minted holding `members:manage` DIRECTLY IN THE DATABASE, bypassing
      // Task 4's mint-time refusal. That is deliberate: this test proves the CENTRAL rule
      // holds even for a token that should not exist, which is exactly what "regardless of
      // how it was minted" means in D24.
      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/members`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
        payload: { puid: 'stu000001', role: 'collaborator' },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('TOKEN_ACTION_PENDING')
      const pending = res.json().error.pendingAction
      expect(pending.action).toBe('members:manage')
      expect(pending.state).toBe('pending')
      expect(pending.id).toMatch(/^[0-9a-f-]{36}$/)

      // The member was NOT added. A refusal that half-happened is worse than either.
      const members = await app.inject({
        method: 'GET',
        url: `/v1/projects/${projectId}/members`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(members.json().some((m: { puid: string }) => m.puid === 'stu000001')).toBe(false)
    })
  })

  it('records the request’s fingerprint and no more', async () => {
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['members:manage'],
      })
      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/members`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
        payload: { puid: 'stu000001', role: 'collaborator' },
      })
      const { pendingById } = await import('../tokens/pending.js')
      const stored = await pendingById(db, res.json().error.pendingAction.id)
      expect(stored?.payload.method).toBe('POST')
      expect(stored?.payload.path).toBe(`/v1/projects/${projectId}/members`)
      expect(stored?.payload.bodySha256).toMatch(/^[0-9a-f]{64}$/)
      // The BODY IS NOT STORED (Task 3's column comment): a refused request can carry
      // anything, and a person reads this row in a queue.
      expect(JSON.stringify(stored?.payload)).not.toContain('stu000001')
      expect(stored?.payload.summary).toContain('member')
    })
  })

  it('refuses a production promotion to a token, before the launch gate', async () => {
    await withProject(async ({ app, db, projectId, userId, productionEnvironmentId, releaseId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['release:deploy', 'release:promote'],
      })
      const res = await app.inject({
        method: 'POST',
        url: `/v1/environments/${productionEnvironmentId}/deploy`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
        payload: { releaseId },
      })
      // TOKEN_ACTION_PENDING, not RELEASE_PRODUCTION_GATE_UNAVAILABLE: who may ask is
      // settled before whether the project is ready.
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('TOKEN_ACTION_PENDING')
      expect(res.json().error.pendingAction.action).toBe('release:promote')
    })
  })

  it('does not record a second PendingAction for an identical retry', async () => {
    // An agent in a retry loop must not fill a human's queue with one question.
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['members:manage'],
      })
      const ask = () =>
        app.inject({
          method: 'POST',
          url: `/v1/projects/${projectId}/members`,
          headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
          payload: { puid: 'stu000001', role: 'collaborator' },
        })
      const first = await ask()
      const second = await ask()
      expect(second.json().error.pendingAction.id).toBe(first.json().error.pendingAction.id)
    })
  })

  it('does not touch a session’s path at all', async () => {
    await withProject(async ({ app, projectId }) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const res = await app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/members`,
        cookies: owner, headers: mutationHeaders(ctx.deps),
        payload: { puid: 'stu000001', role: 'collaborator' },
      })
      expect(res.statusCode).toBe(201)
    })
  })

  it('enforces the rule for a capability with no route, at the authorization layer', async () => {
    // Decision 14: `secret:read` and `quota:set` have no route in Phase 1, so this is the
    // only tier that can see them. Asserted directly rather than pretended end to end.
    const { assertCapability, TokenCapabilityRefusedError } = await import('../projects/authz.js')
    await withProject(async ({ db, projectId, userId }) => {
      const actor = {
        credential: 'token' as const,
        userId,
        tokenId: '00000000-0000-0000-0000-000000000000',
        projectId,
        capabilities: new Set(['secret:read', 'quota:set'] as const),
      }
      for (const capability of ['secret:read', 'quota:set'] as const) {
        await expect(assertCapability(db, actor, projectId, capability)).rejects.toThrow(
          TokenCapabilityRefusedError,
        )
      }
    })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/delegation.test.ts
```

Expected: FAIL — the first case answers `201`, because a token holding `members:manage` is currently obeyed. **That failure is the vulnerability this task closes; read it before fixing it.**

- [ ] **Step 3: The token branch in `assertCapability`**

```ts
export class TokenCapabilityRefusedError extends Error {
  readonly code = 'TOKEN_ACTION_PENDING'
  constructor(
    readonly capability: Capability,
    readonly projectId: string,
    readonly tokenId: string,
  ) {
    super(
      `a delegated token may never '${capability}' (D24); a human must confirm this action`,
    )
    this.name = 'TokenCapabilityRefusedError'
  }
}

export async function assertCapability(
  db: Db,
  actor: Actor,
  projectId: string,
  capability: Capability,
): Promise<void> {
  if (actor.credential === 'token') {
    // D24, and the ORDER matters. Scope first: a token must not learn that a project it
    // cannot address exists, not even by being told the action is privileged.
    if (actor.projectId !== projectId)
      throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
    // THE CENTRAL RULE. Before the token's own capability set is consulted, because
    // D24 says "regardless of how it was minted" — a token that somehow holds a
    // privileged capability is refused by this line, not by the mint route.
    if (isPrivileged(capability))
      throw new TokenCapabilityRefusedError(capability, projectId, actor.tokenId)
    if (!actor.capabilities.has(capability))
      throw new AuthorizationError('FORBIDDEN', `this token may not '${capability}'`)
    return
  }
  … the existing session path, unchanged …
}
```

**The ordering is the security property.** Scope, then the privileged rule, then the token's own set. Write the comment; the next reader will want to reorder these for readability.

- [ ] **Step 4: One place records the pending action**

In `api/contract/route.ts`'s handler wrapper — the function that already runs for every `/v1` route:

```ts
    try {
      const answer = await route.handler({ deps, request, reply, actor, params, query, body })
      …
    } catch (error) {
      // D24's "enforced centrally": the ONLY place a PendingAction is created. The
      // authorization layer decides; this layer, which is holding the request, records
      // what was asked. Neither can do the other's half.
      if (error instanceof TokenCapabilityRefusedError) {
        const pending = await recordPendingAction(deps, request, error)
        throw new PendingActionRequiredError(pending)
      }
      throw error
    }
```

`recordPendingAction` (in `tokens/pending.ts`) computes the fingerprint, **reuses an existing `pending` row with the same fingerprint** rather than inserting a second, sets `expiresAt`, publishes `pending_action.created`, and returns the row. `fingerprintOf` canonicalises the body by `JSON.stringify` of parsed JSON with sorted keys, then SHA-256 — **sorted, because two agents sending the same fields in a different order are asking the same question**.

- [ ] **Step 5: The envelope carries it, in the contract**

`api/representations/pending-actions.ts` defines `PendingAction`; `api/representations/errors.ts`'s `ErrorEnvelope` gains `pendingAction: PendingAction.optional()`, and `api/errors.ts`'s interface **derives from the schema** (P5a sitting 11 finding 2 — it already does; keep it that way). `mapError` parses the pending action **through its representation** before sending, failing closed with an operator line, exactly as P5a's `launchReadiness` does — and for the same reason: zod emits keys in schema order and a hand-built body does not.

- [ ] **Step 6: The code and the event**

`TOKEN_ACTION_PENDING` (403) and `TOKEN_CREDENTIAL_REFUSED` (403) in `api/error-codes.ts`; `pending_action.created` as an event type (four edits), `machineDetail` `{ pendingActionId, tokenId, action }` — **never the payload, never the body**.

- [ ] **Step 7: Run, regenerate, gate, commit**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/delegation.test.ts src/tokens/
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane packages/contract
git commit -m "feat(authz): a delegated token is refused the privileged four, centrally, with a PendingAction"
```

- [ ] **Step 8: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| the `isPrivileged` branch deleted from `assertCapability` | *refuses a privileged action to a token and records a PendingAction* — `expected 201 to be 403`, **and the member is added**, which the same test asserts |
| the privileged check moved AFTER the token's own capability set | the same test **stays green** for a token minted without the capability — so **use the test that mints one WITH it**, which is why the first case seeds the database directly. Record which orderings each test can and cannot see |
| the scope check moved after the privileged check | *answers 404 for a project the token is not scoped to* (Task 5's) — a token learns that another project exists by being told its action is privileged |
| `recordPendingAction`'s reuse lookup removed | *does not record a second PendingAction for an identical retry* — `expected '<id2>' to be '<id1>'` |
| the body stored in `payload` instead of its hash | *records the request's fingerprint and no more* — `expected '…stu000001…' not to contain 'stu000001'` |
| `pendingAction` removed from `ErrorEnvelope`'s schema | *refuses a privileged action…* on `pending.action` — **and note whether it is a `500`**: `mapError` fails closed, so the answer may be a refusal with the field dropped rather than a crash. Record which |

---
## Task 7: Confirm, reject, and the one-shot retry
> **Task 1 correction (2026-09-17, `[M5]`).** **The retry reuses the SAME `Idempotency-Key`** as the refused request — D23.6's error hint tells clients to reuse a key across retries of an action — so this task depends on Task 6 catching the refusal OUTSIDE `app.idempotent`. See Task 6's correction 1; if that is got wrong, this task's loop cannot close and its tests will not show it.
>
> **And a second-order property to state rather than leave to be discovered:** after a successful confirmed retry, the 2xx **is** stored under that key, so replaying the key returns it indefinitely with no capability check. That is not an escalation — the action was authorized once and the response is identical — but **"exactly once" describes the ACTION, not the ANSWER**, and a reader who assumes otherwise will mis-read `consumed_at`. Say it in the task and in `demo-token`'s record.

**Why alone.** This is the half of D24 that makes the mechanism useful rather than a notification: *"requesting one of those produces a `PendingAction` that a human resolves in an interactive session."* Decision 6 says confirming grants a one-shot retry rather than replaying the request server-side, and **the one-shot property is the whole security argument** — a confirmed action that can be replayed for ever is a privileged capability with extra steps.

**Files:**
- Create: `packages/control-plane/src/api/routes/pending-actions.ts`
- Modify: `packages/control-plane/src/tokens/pending.ts` — `confirmAction`, `rejectAction`, `findConfirmedMatch`, `consume`
- Modify: `packages/control-plane/src/projects/authz.ts` — the confirmed-match escape, threaded from the wrapper
- Modify: `packages/control-plane/src/api/contract/route.ts`
- Modify: `packages/control-plane/src/api/delegation.test.ts`
- Modify: `api/error-codes.ts`, `api/routes/index.ts`, `observability/*`

**Interfaces:**
- Consumes: everything Task 6 produced.
- Produces: `POST /v1/pending-actions/{pendingActionId}/confirm`, `.../reject`. Task 8 lists them; Task 12 drives the loop.

- [ ] **Step 1: Write the failing test**

Append to `packages/control-plane/src/api/delegation.test.ts`:

```ts
describe('confirming a pending action (D24, Decision 6)', () => {
  /** The whole loop: the agent asks, is refused, a human confirms, the agent retries. */
  async function refusedOnce(ctx: TestProject) {
    const { plaintext } = await mintTestToken(ctx.db, {
      userId: ctx.userId, projectId: ctx.projectId, capabilities: ['members:manage'],
    })
    const ask = () =>
      ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/members`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
        payload: { puid: 'stu000001', role: 'collaborator' },
      })
    const refusal = await ask()
    return { ask, plaintext, pendingId: refusal.json().error.pendingAction.id }
  }

  it('lets the agent’s retry through exactly once', async () => {
    await withProject(async (ctx) => {
      const { ask, pendingId } = await refusedOnce(ctx)
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const confirmed = await ctx.app.inject({
        method: 'POST',
        url: `/v1/pending-actions/${pendingId}/confirm`,
        cookies: owner, headers: mutationHeaders(ctx.deps),
      })
      expect(confirmed.statusCode).toBe(200)
      expect(confirmed.json().state).toBe('confirmed')

      const retry = await ask()
      expect(retry.statusCode).toBe(201)          // it happened

      // ONCE. The second retry is refused, and it is a NEW question, not the old one.
      const again = await ask()
      expect(again.statusCode).toBe(403)
      expect(again.json().error.code).toBe('TOKEN_ACTION_PENDING')
      expect(again.json().error.pendingAction.id).not.toBe(pendingId)
    })
  })

  it('does not let a DIFFERENT request through on a confirmation', async () => {
    // The confirmation is for the request a human read, not for the capability.
    await withProject(async (ctx) => {
      const { plaintext, pendingId } = await refusedOnce(ctx)
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      await ctx.app.inject({
        method: 'POST',
        url: `/v1/pending-actions/${pendingId}/confirm`,
        cookies: owner, headers: mutationHeaders(ctx.deps),
      })
      const different = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/members`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'j'.repeat(12) },
        payload: { puid: 'ins000001', role: 'owner' },     // a DIFFERENT body
      })
      expect(different.statusCode).toBe(403)
      expect(different.json().error.pendingAction.id).not.toBe(pendingId)
    })
  })

  it('refuses a rejected action’s retry, and says it was rejected', async () => {
    await withProject(async (ctx) => {
      const { ask, pendingId } = await refusedOnce(ctx)
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const rejected = await ctx.app.inject({
        method: 'POST',
        url: `/v1/pending-actions/${pendingId}/reject`,
        cookies: owner, headers: mutationHeaders(ctx.deps),
        payload: { reason: 'not this term' },
      })
      expect(rejected.json().state).toBe('rejected')
      const retry = await ask()
      expect(retry.statusCode).toBe(403)
      expect(retry.json().error.code).toBe('TOKEN_ACTION_REJECTED')
    })
  })

  it('cannot be confirmed by a token, only in an interactive session', async () => {
    // The entire point of D24. If a token could confirm its own pending action the
    // mechanism would be a loop with no human in it.
    await withProject(async (ctx) => {
      const { plaintext, pendingId } = await refusedOnce(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/pending-actions/${pendingId}/confirm`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('TOKEN_CREDENTIAL_REFUSED')
    })
  })

  it('cannot be confirmed by someone who lacks the capability themselves', async () => {
    await withProject(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/v1/pending-actions/${pendingId}/confirm`,
        cookies: collaborator, headers: mutationHeaders(ctx.deps),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })
  })

  it('cannot be confirmed twice', async () => {
    await withProject(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const once = () =>
        ctx.app.inject({
          method: 'POST',
          url: `/v1/pending-actions/${pendingId}/confirm`,
          cookies: owner, headers: mutationHeaders(ctx.deps),
        })
      expect((await once()).statusCode).toBe(200)
      const twice = await once()
      expect(twice.statusCode).toBe(409)
      expect(twice.json().error.code).toBe('PENDING_ACTION_RESOLVED')
    })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/delegation.test.ts
```

Expected: FAIL — `404 ROUTE_NOT_FOUND` on every confirm.

- [ ] **Step 3: The confirmed-match escape**

`assertCapability` cannot look up a pending action — it does not see the request. So the **wrapper** resolves it and tells the authorization layer, keeping the decision in one place and the lookup in the other:

```ts
// api/contract/route.ts, before calling the handler, for a token actor only:
const confirmed = await findConfirmedMatch(deps.db, actor, fingerprintOf(request))
// `grant` is the single-use permission this request carries, and nothing else can
// manufacture one: it comes from a row a human moved to `confirmed` in a session.
const scoped: Actor = confirmed === undefined ? actor : { ...actor, grant: confirmed.action }
```

and in `assertCapability`'s token branch:

```ts
    if (isPrivileged(capability)) {
      // Decision 6: a human confirmed THIS request, once. `grant` is set by the route
      // wrapper from a confirmed PendingAction whose fingerprint matches, and is stamped
      // consumed by the wrapper when the handler succeeds.
      if (actor.grant !== capability)
        throw new TokenCapabilityRefusedError(capability, projectId, actor.tokenId)
    }
```

**`consumed_at` is stamped by the wrapper AFTER the handler resolves**, not before — a handler that throws must leave the confirmation usable, or a transient failure burns the human's decision. Say so in the comment, and **test it**: add a case where the handler fails and the confirmation survives.

- [ ] **Step 4: The two routes**

Both take a `SessionActor` (Task 5 makes that a type error to get wrong). Confirm: load the row, refuse unless `state === 'pending'` (`409 PENDING_ACTION_RESOLVED`), `assertCapability(db, actor, row.projectId, row.action)` — **the confirmer must hold the capability themselves** — then set `state`, `resolvedBy`, `resolvedAt`, publish `pending_action.confirmed`. Reject: the same, with a `reason` in the body, `state: 'rejected'`.

A retry against a rejected action answers `TOKEN_ACTION_REJECTED`, which needs `findConfirmedMatch` to distinguish "no row" from "a resolved row".

- [ ] **Step 5: Run, regenerate, gate, commit**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/delegation.test.ts
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane packages/contract
git commit -m "feat(api): a human confirms a pending action, and the agent's retry succeeds once"
```

- [ ] **Step 6: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| `consumed_at` never stamped | *lets the agent's retry through exactly once* — `expected 201 to be 403` on the second retry |
| `consumed_at` stamped BEFORE the handler runs | the new handler-fails case — the confirmation is burned by a failure the agent did not cause |
| `findConfirmedMatch` matches on `action` instead of the fingerprint | *does not let a DIFFERENT request through* — `expected 201 to be 403` |
| `requireSession` reverted to `requireActor` on confirm | *cannot be confirmed by a token* — `expected 200 to be 403` |
| the confirmer's `assertCapability` removed | *cannot be confirmed by someone who lacks the capability* — `expected 200 to be 403` |
| the `state === 'pending'` guard removed | *cannot be confirmed twice* — `expected 200 to be 409` |

---

## Task 8: The queue — reading pending actions — and the member removal that now has somewhere to go

**What this is for.** §26: *"The primary screen is the queue ... Not the fleet list."* P5c builds the screen; this task builds the read it needs, and gives the agent a way to poll for its own answer without guessing.

**And why member removal lands here.** P5a's *What this plan does not build* names it exactly
once: *"**Removing a member** — a privileged action with nowhere to put a pending action until
P5b."* P5b is now that plan, and the place has existed since Task 6. The route is small; it is
in this task rather than its own because it is the **first privileged route added after the
central rule**, and the whole claim of Task 6 is that such a route inherits the rule without
doing anything — **so this task's real deliverable is the test that it did.**

**Files:**
- Modify: `packages/control-plane/src/api/routes/pending-actions.ts` — two reads
- Modify: `packages/control-plane/src/api/representations/pending-actions.ts` — `PendingActionList`
- Modify: `packages/control-plane/src/api/routes/projects.ts` — `DELETE /v1/projects/{projectId}/members/{userId}`
- Modify: `packages/control-plane/src/api/delegation.test.ts`, `api/authz-contract.ts`

**Interfaces:**
- Produces: `GET /v1/projects/{projectId}/pending-actions`, `GET /v1/pending-actions/{pendingActionId}`, `DELETE /v1/projects/{projectId}/members/{userId}`.

- [ ] **Step 1: Write the failing test**

```ts
describe('the queue (§26)', () => {
  it('lists a project’s pending actions, newest first, with how long each has waited', async () => {
    await withProject(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}/pending-actions`,
        cookies: owner,
      })
      expect(res.statusCode).toBe(200)
      const [first] = res.json()
      expect(first.id).toBe(pendingId)
      expect(first.action).toBe('members:manage')
      // §26: "how long it has waited" is the queue's headline number, so it is in the
      // representation rather than computed by each client from createdAt.
      expect(typeof first.waitingSeconds).toBe('number')
      expect(first.summary).toContain('member')
    })
  })

  it('lets the TOKEN read its own pending action, so an agent can poll for the answer', async () => {
    await withProject(async (ctx) => {
      const { plaintext, pendingId } = await refusedOnce(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/pending-actions/${pendingId}`,
        headers: { authorization: `Bearer ${plaintext}` },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().state).toBe('pending')
    })
  })

  it('hides a pending action from a stranger', async () => {
    await withProject(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const stranger = await sessionFor(ctx, 'stu000001')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/v1/pending-actions/${pendingId}`,
        cookies: stranger,
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('NOT_FOUND')
    })
  })

  it('never carries the refused request’s body', async () => {
    await withProject(async (ctx) => {
      const { pendingId } = await refusedOnce(ctx)
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const res = await ctx.app.inject({
        method: 'GET', url: `/v1/pending-actions/${pendingId}`, cookies: owner,
      })
      expect(JSON.stringify(res.json())).not.toContain('stu000001')
    })
  })
})
```

- [ ] **Step 2: Run it, watch it fail, implement, run it again**

The representation carries `id`, `projectId`, `action`, `summary`, `state`, `waitingSeconds`, `createdAt`, `expiresAt`, `resolvedAt` — **and never `payload.bodySha256`**, which is an implementation detail of the match, nor the body. A token may read a pending action **it requested**; anyone who can read the project may read the project's.

- [ ] **Step 3: Remove a member — and prove the central rule reached a route that did not ask for it**

**Write this test BEFORE the route**, and note that its second half is the one that matters:

```ts
describe('removing a member (§13, and Task 6’s claim)', () => {
  it('lets an owner remove a collaborator', async () => {
    await withProject(async (ctx) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const collaborator = await sessionFor(ctx, 'bio_student', 'collaborator')
      void collaborator
      const { userId } = await userByPuid(ctx.db, 'bio_student')
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${userId}`,
        cookies: owner,
        headers: mutationHeaders(ctx.deps),
      })
      expect(res.statusCode).toBe(204)
    })
  })

  it('refuses the LAST owner’s removal, so a project cannot be orphaned', async () => {
    await withProject(async (ctx) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${ctx.userId}`,
        cookies: owner,
        headers: mutationHeaders(ctx.deps),
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('PROJECT_LAST_OWNER')
    })
  })

  /**
   * THE POINT OF THIS TASK. This route was written after Task 6 and knows nothing about
   * delegated tokens: it calls `assertCapability(..., 'members:manage')` like every other
   * route and does nothing else. If D24's rule is genuinely central, it is already
   * enforced here — and if it is not, this is the test that says so.
   */
  it('is refused to a token with a PendingAction, WITHOUT the route doing anything', async () => {
    await withProject(async (ctx) => {
      const { plaintext } = await mintTestToken(ctx.db, {
        userId: ctx.userId, projectId: ctx.projectId, capabilities: ['members:manage'],
      })
      const { userId } = await userByPuid(ctx.db, 'bio_student')
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/v1/projects/${ctx.projectId}/members/${userId}`,
        headers: { authorization: `Bearer ${plaintext}`, 'idempotency-key': 'k'.repeat(12) },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('TOKEN_ACTION_PENDING')
      expect(res.json().error.pendingAction.action).toBe('members:manage')
    })
  })
})
```

Then write the route: `assertCapability(db, actor, projectId, 'members:manage')`, refuse the
last owner (`PROJECT_LAST_OWNER`, 409, a new code), delete the row, publish nothing new —
**and add the row to `api/authz-contract.ts`**, which fails on a registered route it does
not list. `userByPuid` is local to the test file.

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane packages/contract
git commit -m "feat(api): the pending-action queue, and removing a member"
```

- [ ] **Step 5: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| the central refusal removed (Task 6's branch) | *is refused to a token … WITHOUT the route doing anything* — `expected 204 to be 403`. **This is Task 6's claim, tested by a route that never heard of it** |
| the last-owner guard removed | *refuses the LAST owner's removal* — `expected 204 to be 409` |
| the route left out of `authz-contract.ts` | the completeness check, by name |
| `waitingSeconds` dropped from the representation | *lists a project's pending actions … with how long each has waited* — `expected undefined to be 'number'` |
| the token's own-request check widened to any token | *hides a pending action from a stranger* — mint a second token in another project and assert the `404` |
| `payload` added to the representation | *never carries the refused request's body* |

---

## Task 9: Per-token rate limits

**What this is for.** §20: *"Delegated tokens carry per-token rate limits and quotas ... the control-plane API needs its own, because a third-party agent is code the platform did not write, running on a machine it does not control."* P5a Task 9's limiter already says in its own comment that P5b generalises it.

**Files:**
- Modify: `packages/control-plane/src/api/server.ts` — a limiter per token
- Modify: `packages/control-plane/src/api/rate-limit.ts` — only if a limiter per token turns out to need a factory; `createRateLimiter({ limit, windowMs })` already takes the limit per instance, so the expected change here is **none**, and making one is a finding to record
- Create: `packages/control-plane/src/api/rate-limit-token.test.ts`

**Interfaces:**
- Consumes: `TokenActor.rateLimit`, which Task 5 defines.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { mintTestToken } from '../tokens/testing.js'
import { withProject } from './testing.js'

describe('per-token rate limits (§20)', () => {
  it('refuses past the token’s own limit, and says when to retry', async () => {
    await withProject(async ({ app, db, projectId, userId }) => {
      const { plaintext } = await mintTestToken(db, {
        userId, projectId, capabilities: ['project:read'], rateLimit: 3,
      })
      const get = () =>
        app.inject({
          method: 'GET', url: `/v1/projects/${projectId}`,
          headers: { authorization: `Bearer ${plaintext}` },
        })
      for (let i = 0; i < 3; i++) expect((await get()).statusCode).toBe(200)
      const refused = await get()
      expect(refused.statusCode).toBe(429)
      expect(refused.json().error.code).toBe('RATE_LIMITED')
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0)
    })
  })

  it('limits each token separately', async () => {
    // One busy agent must not lock out another, which a shared window would do.
    await withProject(async ({ app, db, projectId, userId }) => {
      const a = await mintTestToken(db, { userId, projectId, capabilities: ['project:read'], rateLimit: 2 })
      const b = await mintTestToken(db, { userId, projectId, capabilities: ['project:read'], rateLimit: 2 })
      const get = (t: string) =>
        app.inject({ method: 'GET', url: `/v1/projects/${projectId}`, headers: { authorization: `Bearer ${t}` } })
      await get(a.plaintext); await get(a.plaintext)
      expect((await get(a.plaintext)).statusCode).toBe(429)
      expect((await get(b.plaintext)).statusCode).toBe(200)
    })
  })

  it('does not limit a session', async () => {
    // §20 scopes this control to tokens; the slug check keeps its own limiter (P5a Task 9).
    await withProject(async ({ app, projectId }) => {
      const owner = await sessionFor(ctx, 'ins000001', 'owner')
      for (let i = 0; i < 20; i++) {
        const res = await app.inject({
          method: 'GET', url: `/v1/projects/${projectId}`, cookies: owner,
        })
        expect(res.statusCode).toBe(200)
      }
    })
  })
})
```

- [ ] **Step 2: Implement, run, gate, commit**

The limiter is taken in the `onRequest` hook, **after** the token is verified (so an unknown token cannot exhaust a real one's window) and **before** the handler. One `RateLimiter` per token id, created on first use from the row's `rateLimit`, in a bounded map — the existing limiter's eviction is the pattern.

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane
git commit -m "feat(api): per-token rate limits, from the token's own row"
```

- [ ] **Step 3: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| one shared limiter for every token | *limits each token separately* — `expected 429 to be 200` |
| the limiter keyed by user instead of token | the same test |
| the limit taken before verification | add a case: 100 requests with a **bogus** token, then a good one — the good one must still answer `200` |
| `retry-after` not set | *says when to retry* — `expected NaN to be greater than 0` |

---
## Task 10: Expiry — for both entities, and at boot

**What this is for.** §6 gives `DelegatedToken` an `expires_at` and `PendingAction` the state `expired`; D24 says a token is minted *"with an expiry."* Task 5 already refuses an expired token at authentication — **that is the control**. This task adds the sweeper that makes the *rows* honest, so a queue does not fill with questions nobody will ever answer and `GET /v1/projects/{id}/tokens` does not show a dead token as live.

**Files:**
- Create: `packages/control-plane/src/tokens/expiry.ts` and `expiry.test.ts`
- Modify: `packages/control-plane/src/index.ts` — the sweeper at boot, **named as its caller**
- Modify: `packages/control-plane/src/api/representations/tokens.ts` — a derived `expired` flag

**Interfaces:**
- Produces: `expirePendingActions(db, now)` returning the number expired; called at boot beside `recoverAtBoot`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { withRollback } from '../db/testing.js'
import { expirePendingActions } from './expiry.js'

describe('expiry (§6, D24)', () => {
  it('moves a pending action past its expiry to `expired`, and leaves the rest', async () => {
    await withRollback(async (db, ctx) => {
      const stale = await seedPending(db, ctx, { expiresAt: new Date(Date.now() - 1000) })
      const fresh = await seedPending(db, ctx, { expiresAt: new Date(Date.now() + 86_400_000) })
      expect(await expirePendingActions(db, new Date())).toBe(1)
      expect((await pendingById(db, stale.id))?.state).toBe('expired')
      expect((await pendingById(db, fresh.id))?.state).toBe('pending')
    })
  })

  it('never re-opens or re-decides a resolved one', async () => {
    // An expired sweep that touched a `confirmed` row would revoke a human's decision
    // after the fact, which is the one thing this sweeper must not do.
    await withRollback(async (db, ctx) => {
      const confirmed = await seedPending(db, ctx, {
        expiresAt: new Date(Date.now() - 1000), state: 'confirmed',
      })
      expect(await expirePendingActions(db, new Date())).toBe(0)
      expect((await pendingById(db, confirmed.id))?.state).toBe('confirmed')
    })
  })

  it('is idempotent — a second sweep expires nothing', async () => {
    await withRollback(async (db, ctx) => {
      await seedPending(db, ctx, { expiresAt: new Date(Date.now() - 1000) })
      expect(await expirePendingActions(db, new Date())).toBe(1)
      expect(await expirePendingActions(db, new Date())).toBe(0)
    })
  })
})
```

Plus, in `credential.test.ts`, the control that matters more than the sweeper: **an expired token is refused even when no sweep has run**, which Task 5's `it.each` already covers — cite it here rather than duplicating it.

- [ ] **Step 2: Implement, wire it to its caller, run**

`src/index.ts` calls `expirePendingActions` once at boot, beside `recoverAtBoot`, and logs the count on the boot line. **A module with no caller is not built** — this task's whole risk is shipping a sweeper nothing runs, which has happened four times in this project.

`toToken` gains a derived `expired: boolean` (computed, never stored — P5a Task 15's rule for `LaunchReadiness`), so a client does not have to compare clocks.

- [ ] **Step 3: Gate and commit**

```bash
cd /Users/rich/Developer/manifest
pnpm contract:write && pnpm contract:generate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane packages/contract
git commit -m "feat(tokens): pending actions expire, and the sweeper runs at boot"
```

- [ ] **Step 4: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| the `state = 'pending'` filter dropped from the sweep | *never re-opens or re-decides a resolved one* — `expected 'expired' to be 'confirmed'` |
| the boot call removed | **nothing in the unit tier goes red** — that is the point. Add the assertion to the boot test (`boot.docker.test.ts`) that the boot line reports the count, and say in the record that the unit tier cannot see it |
| `expired` computed as `revokedAt !== null` | a new case: an expired-but-not-revoked token reads `expired: true` |

---

## Task 11: The authorization contract suite's token actors
> **Task 1 correction (2026-09-17, `[M6]`). No split: keep one file.** Measured today — **38 route cases, 156 tests, 2.72–3.07 s**, ≈4.1 tests per route across the existing five actors. Doubling the actor set projects to ≈310 tests and ≈6 s, under both thresholds this task set (~400 cases, 20 s). **The margin is real but not large** — a second doubling crosses it, so say so if a later plan adds actors.
>
> **`[M1]`: the suite's completeness check reads the route registry, which does NOT contain the event stream** — `routes/events.ts` registers with `app.route` directly. The suite covers it today through its `426` plain-GET case (`authz-contract.ts:456`), which is deliberate and must survive the token actors: `app.inject` cannot upgrade, so `426` is the only way the matrix sees that route at all.

**What this is for.** §16's suite exercises every registered route as owner, collaborator, stranger, admin and anonymous, and fails when a route is registered that it does not list. **D24 adds a credential class, so every route now has a second dimension**, and the brief said in advance that "delegated tokens add at least three actors to the matrix."

**Files:**
- Modify: `packages/control-plane/src/api/authz-contract.ts` — the token actors, or a sibling file if `[M6]` said to split
- Modify: `packages/control-plane/src/api/testing.ts` — a token actor helper

**Interfaces:**
- Consumes: `mintTestToken` (Task 3), the `Actor` union (Task 5).

- [ ] **Step 1: Add the actors**

Four, each answering a different question:

| Actor | What it proves |
|---|---|
| `token-capable` | a token holding the route's capability gets the same answer an owner does — **the build loop works** |
| `token-incapable` | a token minted without it gets `403 FORBIDDEN`, not `404` — it can address the project |
| `token-other-project` | `404 NOT_FOUND` — Decision 3's scope, on **every** project-scoped route, which is the only way to be sure no route reads the project id from somewhere other than the path |
| `token-privileged` | `403 TOKEN_ACTION_PENDING` on each of the privileged routes, and `pass` elsewhere |

**The completeness check must grow with them**: a route registered and not given a token expectation is as much a hole as one with no session expectation.

- [ ] **Step 2: Watch the count, and split if `[M6]` said to**

```bash
cd /Users/rich/Developer/manifest
pnpm exec vitest run --project unit src/api/authz-contract.test.ts 2>&1 | grep -E "Tests |Duration"
```

Compare with `[M6]`'s baseline. **If the file is now over ~20 s, split the token actors into `authz-contract-token.test.ts`** sharing the route table by import — a suite every sitting runs is a tax on every sitting.

- [ ] **Step 3: Gate and commit**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A packages/control-plane
git commit -m "test(authz): the contract suite's four delegated-token actors"
```

- [ ] **Step 4: Break it, and watch the named test go red**

| Break | The assertion that must go red |
|---|---|
| one project-scoped route's token expectation removed | the completeness check — **quote its message**, because P5a sitting 6 found a stranger's `404` passing against a route that did not exist |
| `token-other-project` expected `403` instead of `404` | that actor's case, on the code rather than the status |
| a new route added with no token expectation | add one temporarily and watch the completeness check; restore |

---

## Task 12: `make demo-token` — an agent runs the loop, a human answers

**What this is for.** The acceptance's driver, and **the caller every route in this plan has been waiting for**. Until now the only client of `POST /v1/projects/{id}/tokens` is a test using `app.inject`, which never asks whether the edge, the credential and the generated client agree — the exact gap P5a sitting 10 finding 8 named.

**Files:**
- Create: `scripts/demo-token.sh`
- Modify: `packages/journey/src/main.ts` — a `token` phase, or a sibling entry point
- Modify: `scripts/lib/api.sh`, `Makefile`, `docs/superpowers/{RUNBOOK,WALKTHROUGH}.md`

**Interfaces:**
- Consumes: every route this plan has built, **through `@manifest/contract` only** — `packages/journey`'s import boundary (`boundary.test.ts` and `no-restricted-imports`) applies unchanged.

- [ ] **Step 1: The shape of the demo**

Nine steps, each asserted with the journey's `checks.ok` so a red run is a measurement rather than the first thing that broke:

```
0.  the client and the driver, built from the checked-in document
1.  sign in as the instructor with CWL, through the edge          (a session)
2.  mint a delegated token for journey-app                         (interactive only)
3.  the token reads the project, and CANNOT read the fleet
4.  the token builds — a 202, and build.succeeded on the stream    (the build loop)
5.  the token deploys to staging, and the app answers              (the build loop)
6.  the token asks to add a member — 403 TOKEN_ACTION_PENDING      (the refusal)
7.  the instructor sees it in the queue and confirms it            (a human, in a session)
8.  the token retries — it succeeds; it retries again — refused    (once, and only once)
9.  the token is revoked, and its next call is 401                 (the end of the loop)
```

**Step 3's negative half is as important as the positive half**, and it is the one an agent-shaped demo would naturally leave out.

- [ ] **Step 2: Write it, run it, and record the numbers it should print**

Print, as the journey does, so the filed result carries the measurements and not just `ok` (P5a sitting 12 finding 1 — `checks.ok` prints its detail **only on failure**):

```
  (token minted: <n> capabilities, expires <date>)
  (build ended <n> ms after the token asked for it)
  (pending action <id> waited <n> ms for a human)
  (retry 1: 201; retry 2: 403 TOKEN_ACTION_PENDING)
```

- [ ] **Step 3: Gate and commit**

```bash
cd /Users/rich/Developer/manifest
make demo-token
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
git add -A scripts Makefile packages docs
git commit -m "feat(demo): make demo-token — an agent runs the build loop and a human answers"
```

- [ ] **Step 4: Break it, and watch the named step go red**

Each needs the control plane **rebuilt and restarted** where the swap is under `src/` — it serves from `dist/`, and a source swap that does not reach it proves nothing (P5a sitting 12).

| Break | The step that must go red |
|---|---|
| the privileged branch removed from `assertCapability` | step 6 — *the token is refused and a pending action is recorded* |
| `consumed_at` never stamped | step 8 — *it succeeds once, and only once* |
| `requireSession` reverted on confirm | step 7 — **and check it is not step 6**: a token confirming its own action would make step 7 pass for the wrong reason |
| the fleet's `requireSession` reverted | step 3 — *and cannot read the fleet* |
| revocation ignored at authentication | step 9 — *its next call is 401* |

---

## Task 13: The acceptance

**Why alone and last.** For the reason P4a's Task 15, P4b's Task 16, P4c's Task 11 and P5a's Task 17 were: the first time the whole thing runs end to end is where the plan's worst defects are, and **P5a's sitting 12 found three of fourteen controls unable to fail** — a rate this plan should expect to repeat.

**Files:**
- Modify: `scripts/offline-acceptance.sh` — step 9, in the same form as steps 6, 7 and 8
- Create: `docs/superpowers/spikes/p5b-baseline/results-sitting9-<YYYY-MM-DD>.txt`
- Modify: this plan's *What executing this plan found* and its sittings table; the close-out sweep's documents

- [ ] **Step 1: Snapshot, and the state to start from**

```bash
cd /Users/rich/Developer/manifest
./scripts/snapshot-machine.sh > <scratchpad>/p5b-s9-before.txt
make doctor | tail -2 && make verify | tail -2      # expect ORIENTATION §2's box
pnpm --filter @manifest/control-plane build
# README's exports, then start the control plane and read its boot line.
```

- [ ] **Step 2: Put the demo in the offline acceptance**

After step 8, guarded by the same control-plane check, in the same `=== N. … ===` form the file uses.

- [ ] **Step 3: Run it three times**

Once now; once again on the re-use path; and **once from a `make reset` machine — which needs Rich's agreement before it is run**, as P4c's sitting 8 and P5a's sitting 12 did. Runs 1 and 2 need no permission; do them first, so a refusal still leaves two-thirds of the acceptance. After `make reset && make up` the order is **`pnpm --filter @manifest/control-plane db:migrate`, then the control plane, then the demos**.

**`make reset` prompts**, so from a tool call it needs `echo reset | make reset` (ORIENTATION §4).

- [ ] **Step 4: The negative controls**

The table in Task 12 Step 4, plus these, each watched in the tier named:

| | Break | In `make demo-token` | Where it goes red if not there |
|---|---|---|---|
| a | the privileged check moved after the token's capability set | **green** for a token minted without it — the demo's token holds it, so it IS visible; **verify which** | `delegation.test.ts` |
| b | `secretMatches` replaced by `===` | **green** — string equality still refuses a wrong secret (Task 5 predicted this) | **nothing** — record it as unasserted, or assert timing-safety directly |
| c | the mint-time privileged filter removed | **green** — the central rule still refuses at use | `tokens.test.ts` *refuses to mint a token holding a privileged capability* |
| d | `secret:read` / `quota:set` refusal | **cannot be exercised** — no route (Decision 14) | `delegation.test.ts` *enforces the rule for a capability with no route* |
| e | the scope check dropped | **green** — the demo's token only ever addresses its own project | `credential.test.ts` and the authz suite's `token-other-project` |

**Five of this plan's controls are predicted, in advance, to be invisible to the acceptance.** That is not a weakness in the acceptance; it is the honest statement P5a's sitting 12 asks every plan after it to make. Each names the tier that does see it.

- [ ] **Step 5: Every gate, and the machine**

```bash
cd /Users/rich/Developer/manifest
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker
make doctor | tail -2 && make verify | tail -2
./scripts/snapshot-machine.sh > <scratchpad>/p5b-s9-after.txt && diff <before> <after>
```

Remove by explicit name, after checking each, anything the runs left that the before-snapshot did not have. **If the session's permission rules refuse a `docker rm` or `docker rmi`, list what is owed by exact name and hand it over** — P5a sitting 12 hit exactly that, and a cleanup nobody can find is worse than one never started.

- [ ] **Step 6: Record, sweep, commit**

*What executing this plan found*: the runs, every finding, the controls with the ones that could not fail, the gate numbers, the machine. Then **the sweep** (ORIENTATION §6) — the roadmap's ledger first; this plan's sittings table; ORIENTATION §2, §3 (a token is a credential class; the privileged four), §4, §7e (**P5c is next, TO BE WRITTEN**) and §8; `README.md`; `CLAUDE.md`'s *State* (a plan finishes); `RUNBOOK.md`; `WALKTHROUGH.md`; **check** the four HTML pages and say in the record that they were checked; `docs/external-track.md`.

---

## What this plan does not build

Named because the spec asks for it, or because someone will look for it.

**Deferred by Rich, 2026-09-17 (R1 and R2).**
- **Step-up re-authentication** (§20). The privileged set is defined and the alignment test written; the second SAML round trip — `ForceAuthn`, a recent-auth stamp on the session, and the re-auth prompt — is owed by the plan that adds the routes it protects. **`privileged.test.ts` is where that plan starts.**
- **A server-side session store, and rotation on privilege change** (§20). Sessions stay stateless signed cookies; §20 is amended to say so. **A person made an administrator must sign in again**, and `scripts/admin-grant.sh` says so on every run.

**P5c's — the clients.**
- `manifest-mock`, `console/` with its import boundary, and the CI acceptance script, **signed in with a delegated token this plan makes possible** rather than a session.
- The queue as a **screen** (§26). This plan builds the two reads it needs; the console is P5c's.

**Phase 2's.**
- **A secret-read route and a quota route.** Two of D24's four forbidden capabilities have no route in Phase 1 (Decision 14), so the rule that protects them is asserted at the authorization layer and nowhere else. **The plan that adds either inherits the rule by construction** — that is what building it centrally bought.
- **Production promotion as a working path.** `release:promote` exists and is refused to tokens; §13's launch gate still refuses production to everyone, and the approval flow (D9) is Phase 2's.
- The `LaunchReadiness` gate, `IamRegistration` and `PrivacyAssessment` as entities, custom domains, audience tiers' effects.

**Deliberately not attempted, and still open.**
- **A token cannot create a project**, which diverges from D24's prose ("Note what a delegated token *can* do: create projects…"). Decision 13 says why: a token is scoped to one project, so a token that created a second could not then address it. **The resolution — an unscoped "creator" token, or a token whose scope widens on creation — is left to the plan that needs it**, and is a spec question when it arrives.
- **Nothing scans the control plane's own dependency tree** (ORIENTATION §8), unchanged by this plan, which adds no dependency.
- **Rate limits are per process**, not per platform. One control plane runs against one database (P5a Task 13's `recoverAtBoot` makes that a rule), so this is exact today and becomes approximate the day it is not.
- **An expired token's rows are not removed**, only refused; `expirePendingActions` moves pending actions, and nothing deletes a `DelegatedToken`. A row is an audit record of a credential that existed.
- **The offline acceptance** is Rich's to run, now with step 9.

---

## Spec actions

**Proposed, to be put to Rich before this plan executes** (P5a's R9 pattern: applying them first is cheaper than reconciling after).

1. **§6 — `DelegatedToken` gains `token_hash`, `name` and `revoked_at`; `PendingAction` gains `expires_at` and `consumed_at`.** The brief's §7 item 5, plus `consumed_at` for Decision 7's one-shot retry. *Why:* the row as §6 states it cannot be authenticated (no hash), reviewed (no name), ended early (no revocation), or used once (no consumption stamp).
2. **§20 — record that Phase 1 sessions are stateless signed cookies** carrying the role they were issued with, with no server-side store, and that a role change reaches a person when they sign in again. **Rich decided this on 2026-09-17 (R2).** *Why:* the spec currently describes a store that does not exist, and P5a Task 16 measured the consequence.
3. **§20 — record that step-up re-authentication lands with the routes it protects**, while the privileged set it shares with D24 is defined and tested from P5b. **Rich decided this on 2026-09-17 (R1).**
4. **D24 — reconcile "create projects" with a project-scoped token** (Decision 13). *Why:* D24's prose lists project creation among what a token may do, and a token scoped to one project cannot use what it creates. Either the scope rule or the prose should move; this plan implements the scope rule and flags the sentence.

---

## What the self-review caught

*Written after the plan, before it executes — the record of what a fresh read found, so the next reader does not mistake a fix for a mistake.*

1. **Task 2 shipped a function with no caller** — `isPrivileged` is consumed only by its own unit test until Task 6. That is the defect shape ORIENTATION §9 names four times. Left in place deliberately, because splitting the list from its enforcement is what makes Task 6 reviewable, **but Task 2's control table now says so explicitly** and names Task 6 as the consumer to check.
2. **Task 5's `secretMatches` control cannot fail**, and the first draft did not say so: replacing the timing-safe compare with `===` leaves every test green, because string equality still refuses a wrong secret — it only leaks timing. Written into Task 5's table and again into Task 13's, rather than discovered in the acceptance.
3. **Task 6's first draft ordered the token branch as capability-set-then-privileged**, which would let a token minted without `members:manage` learn nothing, while one minted *with* it — the case that matters — was refused for the wrong reason. Reordered to scope, privileged, set, with the ordering called out as the security property and a control aimed at each reordering.
4. **The first draft had `assertCapability` record the `PendingAction`.** It cannot: it never sees the request, and two Docker-tier suites call it directly and would start writing rows. Moved to the route wrapper, which is equally central and is holding the request (Decision 5).
5. **`consumed_at` was being stamped before the handler ran**, which would burn a human's confirmation on a transient failure. Moved after the handler resolves, with a test for the failing-handler case.
6. **Two of D24's four capabilities have no route**, so an end-to-end control for them cannot fail. Found while writing Task 13's control table; promoted to Decision 14 and stated in advance rather than left for the acceptance to discover.
7. **`pending_actions` references `delegated_tokens` `ON DELETE restrict`**, so the two TRUNCATE lists need it ordered before both — the same trap `audit.role_changes` sprang in P5a sitting 11, and its control is a **second** `pnpm test` run, not the first.

---

## What executing this plan found

*One dated section per sitting: the tasks, every defect with the measurement that found it, the
negative controls, and the gate numbers at the end. Written for a reader who was not there.*

### Sitting 1 — 2026-09-17 — Task 1, the measurements — 11 findings

**Task 1 only, as the sittings table requires.** No `src/` change (one is owed and recorded as
F1). Full write-up, with every command and raw answer, in
[`../spikes/p5b-baseline/README.md`](../spikes/p5b-baseline/README.md) and
[`results-task1-2026-09-17.txt`](../spikes/p5b-baseline/results-task1-2026-09-17.txt).

**The machine:** macOS 26.6.2 (25G83), Node 24.12.0, pnpm 11.24.0, Docker Engine 29.7.2,
Fastify 5.12.3, zod 3.25.76, Caddy v2.11.4. `git HEAD` `29b60bf`, `main`, clean.

**Two of the plan's claims are false, one is understated, and one existing defect was found.**

| # | Finding | Found by | Changes |
|---|---|---|---|
| 1 | **`db/client.ts`'s error hint tells the reader to connect as the SUPERUSER `manifest`** — the exact thing that makes §20's append-only audit grant unimplementable (README:147, ORIENTATION §3, P4a session 5). Follow the hint and you get a working platform with the audit control silently disabled | hitting the error while running `[M1]` | **F1 — a `src/` fix owed in its own commit with its own test** |
| 2 | **`GET /v1/projects` escapes a token's scope.** `listProjectsFor` selects by `actor.userId` alone and the route calls no `assertCapability`, so a token scoped to X lists its minter's Y and Z too — contradicting Decision 12 | `[M1]` | **Task 5 gains a step** |
| 3 | **`fleet.ts` is one of THREE modules that must change, not the only one** — with `project-reads.ts` and `projects.ts`. 16 non-test call sites, not 21; six modules bypass, not five | `[M1]` | Tasks 5, 6 |
| 4 | **Task 6 as drafted DEADLOCKS D24's loop.** A refusal caught around `run` resolves rather than throws, so `replayOrStore` caches the 403; the confirmed retry reuses the same `Idempotency-Key` (as D23.6's own hint instructs) and replays the cached refusal for ever. `consumed_at` is never stamped, and every test using a fresh key per request stays green | `[M5]` | **Task 6 correction 1, Task 7** |
| 5 | **Scoping the idempotency record to the token does NOT fix finding 4** — the 403 caches in the token's namespace and deadlocks there. Only catch placement fixes it | `[M5]` | Task 6 |
| 6 | **The predicted `[M5]` defect does not exist.** The primary key is `(key, userId, route)`, so a token cannot replay *another user's* key. The real issue is that a token shares its **minter's** namespace | `[M5]` | *Read this first* 5 corrected |
| 7 | **`secret:read` is not in the `Capability` union at all** — so Task 2 cannot write the privileged set as four `Capability` values; `tsc` refuses it | `[M8]` | **Task 2 correction** |
| 8 | **The event stream is registered with `app.route` directly and is absent from `ROUTE_DEFINITIONS`**, so Decision 5's "the one wrapper that runs for every `/v1` route" is not literally true | `[M7]` | Task 6 correction 2, Task 11 |
| 9 | **`assertSameOrigin` runs on every upgrade regardless of credential**, so a token-bearing stream must send the console's `Origin` unless Task 5 makes the check conditional | `[M7]` | **Task 5 gains a step** |
| 10 | **`observability/redact.ts` only redacts a secret behind the word `Bearer`.** A token logged bare — a mint response, a `token_hash` — is not redacted | `[M9]` | Tasks 4, 5 |
| 11 | **There are two `Actor` types.** `SessionActor` is an *intersection* adding `puid` over `projects/`'s `Actor`, which has none; Decision 2's `Extract<…>` would drop `puid` | read for `[M8]` | Task 5 |

**What the measurements confirmed, and did not change:** `[M2]` — the deploy route already
branches on `kind` after authorizing, so `release:promote` hangs off the existing branch and
Task 2 adds none. `[M3]` — `Authorization` survives the edge on a plain request **and on a
WebSocket upgrade**, so Task 5's stream support stays in scope and the prepared contingency is
not needed. `[M4]` — 0.6 µs per verify on a 256-bit secret; Decision 1 stands. `[M6]` — 38
routes, 156 tests, 2.7–3.1 s; Task 11 keeps one file. `[M9]` — the one inbound reader of the
header is the registry realm, reading `Basic` outside `/v1`; no collision.

**Negative controls.** Three, all watched:

- **`[M3]`'s probe could report false.** The header-less request through the edge logged
  `hasAuth: false` while the two header-bearing ones logged `true`. Without that the probe would
  have been a check that cannot fail.
- **`[M4]`'s compare refuses as well as accepts.** `timingSafeEqual` returned `true` for the
  matching hash and `false` for a freshly generated wrong one. *(Noted for Task 5: the self-review
  is right that replacing it with `===` leaves every test green — this control shows the compare
  works, not that it is timing-safe.)*
- **The `[M3]` probe was fully removed.** `git status` clean against a byte copy taken before the
  edit, and the rebuilt binary logged **zero** probe lines afterwards.

**A method finding worth carrying forward.** Task 1 Step 1 says "do not grep — read it out of the
registered route table" and tests `handler.toString()`. **That method has a blind spot of its
own**: four routes report `—` and are fully guarded through a local helper, including
`POST /v1/environments/{environmentId}/deploy`. Taken at face value, the plan's own prescribed
measurement would have reported the platform's most security-relevant route as unauthorized.
Every `—` was resolved by reading the handler. *A better instrument is not automatically a good
one — assert the shape of the answer.*

**Gate numbers at the end of this sitting — unchanged from P5a sitting 12, as a
documentation-only sitting should leave them:** `pnpm test` **1016 passed, 91 files**;
`pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean. `pnpm test:docker` not owed (this
sitting touched no `src/`; the plan requires it from sitting 3). `make doctor` **18/0**,
`make verify` **51/0**.

**The machine was left as found** — `snapshot-machine.sh` diffed before and after. The control
plane is **running on 7100** with `driver: docker`; it was stopped and restarted three times for
`[M3]` and carries a new `MANIFEST_SESSION_SECRET`, which is generated per start, so any session
cookie predating this sitting is void. Nothing depended on one.

**Blocked, and Rich's:** the four *Spec actions*. Put to him at the start of this sitting, with a
recommendation on each; **sitting 2 cannot start until they are applied.**
