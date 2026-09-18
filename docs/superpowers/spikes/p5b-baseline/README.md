# P5b Task 1 — the measurements this plan rests on

Run on **2026-09-17**, sitting 1 of [P5b](../../plans/2026-09-17-p5b-delegated-tokens.md), on the
machine P5a's acceptance left: macOS 26.6.2 (25G83), Node 24.12.0, pnpm 11.24.0, Docker Engine
29.7.2, Fastify 5.12.3, zod 3.25.76, Caddy v2.11.4. `git HEAD` was `29b60bf`, `main`, clean.
Every raw result is in [`results-task1-2026-09-17.txt`](results-task1-2026-09-17.txt) under the
section named below; the three probe scripts that are worth keeping are beside it.

**No `src/` change was made by this task**, with one exception owed and recorded as F1 below.
The one temporary source edit — an `onRequest` probe for `[M3]` — was restored from a byte copy
taken before it, `git status` was clean afterwards, and the rebuilt binary logs zero probe lines.

**Two of the plan's claims are false and one is understated.** `[M1]`, `[M5]` and `[M7]` each
change a task. Corrections are written at the top of Tasks 2, 5, 6, 7 and 11 in the plan itself,
in the same commit as this file.

---

## The scoreboard

| | Claim under test | Verdict |
|---|---|---|
| `[M1]` | *Read this first* 1 — five modules bypass `assertCapability`, `fleet.ts` the only one that must change | **FALSE.** Six modules, eight routes; **three** must change |
| `[M2]` | *Read this first* 2 — one capability for every environment, production refused later | **TRUE**, and the `kind` branch already exists → Task 2's shape decided |
| `[M3]` | Unmeasured — does `Authorization` survive the edge? | **It survives BOTH** a plain request and a WebSocket upgrade |
| `[M4]` | Decision 1 — a SHA-256 is the right primitive and costs nothing | **TRUE.** 0.6 µs per verify, 256-bit secret |
| `[M5]` | *Read this first* 5 — is an idempotency record scoped to the actor? | **Scoped to the USER, not the credential** — and it creates a deadlock in Task 6 as written |
| `[M6]` | Task 11 splits the suite if it projects over ~400 cases or 20 s | **No split needed.** 38 routes, 156 tests, 2.7–3.1 s |
| `[M7]` | *Read this first* 6 — does the stream read the cookie directly? | **No, it reads `requireActor`** — but it is registered OUTSIDE `registerRoutes` |
| `[M8]` | Decision 14 — only member management and a production deploy are reachable | **TRUE, and sharper**: `secret:read` is not even a `Capability` |
| `[M9]` | One inbound reader of `Authorization`, outside `/v1` | **TRUE.** One, and it reads `Basic`, not `Bearer` |

---

## F1 — a defect found on the way in, not by a measurement

`packages/control-plane/src/db/client.ts`'s missing-variable error tells the reader to set

```
export MANIFEST_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
```

— the role `manifest`, which is `POSTGRES_USER` and therefore a **superuser**. `README.md` line
147, ORIENTATION §3 and P4a's session 5 all say the control plane connects as `manifest_app`
precisely because *a superuser bypasses every grant, which makes §20's append-only `audit.events`
grant unimplementable*. Anybody who hits this error and follows its hint silently disables §20's
audit control and gets a working platform, which is the worst possible failure mode: green, and
wrong.

Found by hitting the error while running `[M1]`. **It is a one-line message fix with its own
test, in its own commit** — per Task 1 Step 10's rule that a necessary `src/` change is a finding,
not a step.

---

## `[M1]` — is `assertCapability` actually central? → **Tasks 5, 6 and 11**

**The plan's method has a blind spot, and it matters.** Task 1 Step 1 says "do not grep — read it
out of the registered route table" and tests `r.handler.toString()` for the string
`assertCapability`. That is better than a grep, but `toString()` cannot see **indirection**: four
routes report `—` and are fully guarded through a local helper.

```
POST /v1/environments/{environmentId}/deploy   → environmentReadableBy(…, 'release:deploy')  releases.ts:46
GET  /v1/environments/{environmentId}/incidents → environmentReadableBy(…, 'project:read')   releases.ts:46
GET  /v1/builds/{buildId}                       → buildReadableBy(…)                         builds.ts:28
GET  /v1/builds/{buildId}/logs                  → buildReadableBy(…)                         builds.ts:28
```

Had this been taken at face value, the plan would have concluded that **the deploy route is
unauthorized** — the single most security-relevant route in the platform. Every `—` below was
resolved by reading the handler.

**There are 25 routes in `ROUTE_DEFINITIONS` and 16 non-test `assertCapability` call sites** (the
plan's "21" counts the four test call sites and the import lines). **Eight routes across six
modules** reach a handler without one:

| Route | Module | Guarded how | For a token |
|---|---|---|---|
| `GET /v1/me` | `me.ts` | reads the actor; `platformRole` inline | **needs a deliberate answer** — Task 5 |
| `GET /v1/projects` | `project-reads.ts` | `listProjectsFor(db, actor)` — **membership, by `actor.userId`** | **MUST CHANGE** — see below |
| `POST /v1/projects` | `projects.ts` | nothing yet exists to be a member of | **MUST CHANGE** — Decision 13 refuses it |
| `GET /v1/slugs/{slug}` | `slugs.ts` | none, deliberately | fine |
| `GET /v1/blueprints` (×3) | `blueprints.ts` | none, deliberately | fine |
| `GET /v1/fleet` | `fleet.ts` | `actor.platformRole !== 'admin'` inline | **MUST CHANGE** — Decision 4 |

### The plan says `fleet.ts` is the only one that must change. It is one of three.

**`GET /v1/projects` is the one that was missed, and Decision 12 is the reason it matters.**
Decision 12 promises "a token may call `GET /v1/projects`, and it answers exactly its own
project". It will not. `listProjectsFor` (`projects/repository.ts:159`) selects
`projectMembers.projectId where userId = actor.userId` — **the minting user's memberships, with no
reference to the token's scope**. A token scoped to project X, minted by a user who is also a
member of Y and Z, lists all three. `assertCapability` never runs on this route, so Task 6's
central refusal never sees it.

This is not a refusal bug, it is a **scope-escape read**: the exact blast-radius argument
Decision 4 makes for `fleet.ts` applies here one tenant at a time. **Task 5 gains a step**, and
it cannot be done in `assertCapability`.

**`POST /v1/projects`** needs an explicit refusal for the same structural reason — Decision 13
refuses project creation to a token, and no capability check runs on that route to carry it.

---

## `[M2]` — can `release:deploy` tell production from staging? → **Task 2, decided**

The plan's claim holds. `releases.ts` authorizes and *then* reads the kind:

```ts
// releases.ts:205
const environment = await environmentReadableBy(deps.db, actor, params.environmentId, 'release:deploy')
// releases.ts:214
if (environment.kind === 'production') throw new ProductionGateError(await computeLaunchReadiness(...))
```

One capability covers every environment; production is refused afterwards and separately by
§13's launch gate. **The branch on `kind` already exists**, which is the condition Task 1 set:
*"if the deploy route already branches on `kind`, the new `release:promote` capability hangs off
that branch"*. So Task 2 hangs it there and does **not** add a branch. Note the ordering —
authorization first, `kind` second — is what lets a new privileged capability be checked before
the gate rather than after it.

---

## `[M3]` — does `Authorization` survive the edge? → **Task 5 unchanged, and that is the news**

**Yes, on both.** Measured with a temporary `onRequest` probe that logged only whether the header
was *present*, never its value.

| Request | Control plane saw |
|---|---|
| No header, through the edge (**negative control**) | `hasAuth: false` |
| `Authorization: Bearer …`, through the edge | `hasAuth: true` |
| `Authorization: Bearer …`, direct to 7100 (control) | `hasAuth: true` |
| **WebSocket upgrade**, through the edge | `hasAuth: true`, `upgrade: "websocket"` |

The header-less request reporting `false` is what makes the other three mean anything: it proves
the probe *could* say no.

The edge does no header manipulation — the console site block has no `header_up` — so this is
Caddy's default reverse-proxy behaviour rather than a configured allowance. **Nothing is written
down that keeps it that way**; a future `header_up` block could take it away silently. Task 5's
stream support stays in scope, and the contingency the plan prepared ("a token cannot open a
stream, named in *What this plan does not build*") is **not** needed.

The upgrade closed `1006` — the `preValidation` hook refusing an unauthenticated stranger before
the upgrade, which is the route working correctly. The measurement is `hasAuth`, not the close
code.

---

## `[M4]` — the token hash → **Decision 1 confirmed**

```
secret chars 43   entropy bits 256
sha256 per verify (us) 0.599–0.666
timingSafeEqual same length true   matching secret true
timingSafeEqual refuses a wrong secret false      ← both directions measured
token shape example length 80      (mft_ + 32 hex + _ + 43 chars)
```

Sub-microsecond, against a request that already does at least one database round trip. Decision 1
stands as written, and the number is on the record so the next reader does not have to re-derive
it. Both compare directions were measured, because "it returns true for the right secret" alone
does not show it returns false for the wrong one.

---

## `[M5]` — is an idempotency record scoped to the actor? → **Tasks 5, 6 and 7**

**The plan predicted a defect here and there is one — but not the one it predicted, and the
difference changes the fix.**

The record **is** scoped to the user. `idempotency_keys` is
`primaryKey({ columns: [key, userId, route] })` and `replayOrStore` looks up all three. So the
plan's stated worry — *"a delegated token replaying another user's `Idempotency-Key`"* — **cannot
happen**, and no fix is needed for it.

What is true instead:

**1. The record keys on `userId`, not on the credential.** `app.idempotent`
(`server.ts:282`) passes `userId: actor.userId`. A token carries its minting user's id, so **a
token and that user's browser session share one idempotency namespace.**

**2. Replay happens BEFORE authorization.** `replayOrStore` returns the stored response and
never calls `handler()`; `assertCapability` runs *inside* `handler()`. The nesting in
`registerRoutes` (`route.ts:159`) is:

```ts
const result = route.method === 'GET' ? await run() : await app.idempotent(request, run)
//                                                    └── replayOrStore wraps run, and run
//                                                        contains route.handler → assertCapability
```

### The consequence: Task 6 as written deadlocks the loop

Decision 5 says `assertCapability` throws and "the **one** wrapper in `api/contract/route.ts` …
catches it, records the pending action, and answers". **If that catch is placed around `run` —
the natural reading, and where the refusal is easiest to write — then `run` RESOLVES with a 403
instead of throwing, and `replayOrStore` STORES the 403** under `(key, userId, route)`.

Then: the human confirms the pending action, the agent retries **with the same
`Idempotency-Key`** — which is exactly what D23.6's own error hint instructs
(*"Generate a UUID per user action and reuse it across retries of that action"*) — and
`replayOrStore` replays the cached 403 without ever reaching the handler. **The confirmation is
never consumed, `consumed_at` is never stamped, and the agent loops forever on a cached
refusal.** D24's whole mechanism stops meaning anything, and every test that mints a fresh key
per request would stay green.

**The fix is placement, not scoping**, and this is the part worth getting right: adding
`token_id` to the primary key does **not** help — the refused 403 would simply be cached in the
token's own namespace and deadlock there. **Task 6 must place its catch OUTSIDE
`app.idempotent(...)`**, so the refusal propagates out of `replayOrStore` as a throw and nothing
is stored. Written at the top of Task 6.

**3. A second-order note for Task 7.** After a *successful* confirmed retry, the 2xx **is**
stored under that key, so replaying the key returns it indefinitely with no capability check.
That is not an escalation — the action was authorized once and the response is identical — but
"exactly once" describes the **action**, not the **answer**. Task 7 should say so rather than
leave a reader to discover that a consumed one-shot still has a replayable response.

---

## `[M6]` — what the authorization matrix costs → **Task 11 does not split**

```
38 route cases in api/authz-contract.ts
156 tests, 2.72–3.07 s
```

≈4.1 tests per route across the existing five actors. Doubling the actor set projects to ≈310
tests and ≈6 s — under both of Task 11's thresholds (~400 cases, 20 s). **Task 11 keeps one
file.** The margin is real but not large: a second doubling would cross it.

---

## `[M7]` — what a stream upgrade authorizes with → **Tasks 5 and 6**

**The plan's worry is discharged.** `routes/events.ts`'s `authorizeStream` calls
`requireActor(request)` and then `assertCapability(deps.db, actor, projectId, 'project:read')`.
**It does not read the cookie directly**, so once the `onRequest` hook can build a token actor,
the stream authorizes one with no change to this route.

Two things the plan does not know:

**1. The stream is registered with `app.route` directly, NOT through `defineRoute`/
`registerRoutes`, and it is absent from `ROUTE_DEFINITIONS`.** So Decision 5's "the one wrapper
that already runs for every `/v1` route" **does not run for the stream**. Today that is harmless —
the stream's only capability is `project:read`, which is never privileged, so a
`TokenCapabilityRefusedError` can never be thrown there. **It is a standing assumption, not a
guarantee**: the day a privileged capability is checked on a non-`registerRoutes` route, the
refusal escapes the wrapper and becomes a 500. Task 6 should state the assumption where it
claims centrality, because "every `/v1` route" is not literally true.

**2. `assertSameOrigin` runs on EVERY upgrade, regardless of credential.** The `preValidation`
hook applies it whenever `isUpgrade(request)`, before authorization. Global Constraints says
*"a bearer token is not a browser credential, so CSRF does not apply to it"* — but as the code
stands a token opening a stream must **also** send `Origin: https://console.manifest.internal`.
Task 5 must either make the origin check conditional on the credential class or state that a
token-bearing stream sends the origin anyway. **Either is defensible; leaving it unstated is
what produces a demo that works only because the script happened to send the header.**

---

## `[M8]` — the four privileged capabilities → **Decision 14 confirmed, and Task 2 corrected**

| D24's forbidden capability | In the `Capability` union? | Route |
|---|---|---|
| **member management** | `'members:manage'` ✅ | `POST /v1/projects/{projectId}/members` (`project-reads.ts:178`) — **reachable** |
| **production promotion** | — (`'release:deploy'` covers all kinds) | `POST /v1/environments/{environmentId}/deploy` — **reachable**, see `[M2]` |
| **quota change** | `'quota:set'` ✅ | **none** — held by `PLATFORM_ADMIN`, checked nowhere |
| **secret read** | ❌ **not in the union at all** | **none** |

Decision 14 is right that only two are reachable. **It understates the third point:**
`secret:read` is not a routeless capability, it is **not a capability**. So Task 2 cannot write
its privileged set as four existing `Capability` values — `tsc` will refuse `'secret:read'`.
Task 2 must either add it to the union (creating a capability nothing grants and nothing checks —
the no-caller shape ORIENTATION §9 names four times) or type the privileged set as a superset of
`Capability`. **The second is the better answer**: the privileged set is D24's list, which is a
statement about the *spec*, not about what the code happens to implement today — and §20's
alignment test then has something real to align, which is R1's whole point. Written at the top of
Task 2.

---

## `[M9]` — does anything already answer a bearer token? → **no collision**

**Exactly one** inbound reader of the header in non-test `src/`:

```
api/routes/registry-token.ts:82   (request.headers.authorization ?? '').replace(/^Basic /i, '')
```

It is the registry's token realm, it reads **`Basic`**, and it is outside `/v1` — so Task 5's
bearer path is distinguished from it by **both** the scheme prefix and the path. No collision,
and no correction to Task 5. Every other hit is **outbound** (`ai/client.ts` and `ai/testing.ts`
sending `Bearer <master key>` to LiteLLM) or a comment.

**One piece of luck worth writing down:** `observability/redact.ts:46` already carries
`[/(\bBearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1<redacted>']`, so a delegated token that reaches a
log line **behind the word `Bearer`** is already redacted. A token logged **bare** — which is
exactly how a mint response or a `token_hash` would be logged — is **not**. Tasks 4 and 5 should
not assume the redactor covers them.

---

## One more thing Task 5 needs: there are TWO `Actor` types

Not a numbered measurement; found while reading for `[M8]`.

```ts
// projects/authz.ts:19          the authorization Actor — userId, platformRole. NO puid.
// api/actor.ts:4                export type SessionActor = Actor & { puid: string }
```

`SessionActor` is an **intersection** over the `projects/` `Actor`, not a member of a union.
Decision 2 says "`SessionActor` becomes `Extract<Actor, { credential: 'session' }>`" — which,
applied to the `projects/` `Actor`, **drops `puid`** unless the session variant carries it. So
Task 5's refactor must either move `puid` onto the session member of the union in `projects/`, or
keep `SessionActor` an intersection over the extracted member. *Read this first* 3's measurement
(that `actor.puid` is read by no route handler) still holds and still makes the refactor cheap —
this is about where the field lives, not how many callers move.

---

## What this task did NOT change

`src/` is untouched (F1's fix is owed separately, in its own commit with its own test). The four
gates were green before and after. The control plane was stopped and restarted three times for
`[M3]` and is **left running on 7100** with `driver: docker`, as sitting 1 found it — with a new
`MANIFEST_SESSION_SECRET`, since it is generated per start, so any session cookie predating this
sitting is void. Nothing depended on one.
