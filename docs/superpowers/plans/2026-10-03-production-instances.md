# Production Instances by Audience — §24, A1 — Implementation Plan

> **WRITTEN 2026-10-03, AFTERNOON, BY THE PLANNING SESSION `manifest-c7`** (coordinated by `manifest-94`). **Rich's, the same afternoon,
> through the question tool**: answering the load rehearsal's first question, *"Build §24's capacity first"* — production runs instances by
> audience, the edge balancing across them, before the rehearsal measures it; then *"Two plans: A then B"*; then *"A1 → B → A2"* — A1 this
> plan (the instances), B the load rehearsal, A2 hibernation and wake-on-request. **Every fact in *Read this first* was read from the code at
> `e969f9d`** (a read-only survey and this session); two plans run before this one, so **Task 1 re-reads every fact**.
> **Two spec actions are DRAFTED at the end, none applied.** **NOT YET APPROVED.**

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development, **whichever Rich chooses**. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9.

**Goal:** **Production runs as many instances as its audience needs** — §24's table: `solo` 1, `class` 2, `large_course` 3, `public` 3 —
**behind one edge route that balances across them and routes around one that dies.** A redeploy starts the new N beside the N serving,
proves each, moves the route ONCE, and retires the old N — P4c's *"a redeploy interrupts nobody"*, across N. Boot recovery, retirement,
D21's rehearsal, the per-instance AI keys and every reader of *"the serving instance"* follow. **A faculty app runs correctly on several
instances** — its sessions are in its own Mongo already, and the knowledge pack says what else it must not keep in memory. Sandbox and
staging stay one instance (§24: *"Sandbox and staging ignore all of it"*), until B's load rehearsal grants staging production's shape.

It is proved by **`make demo-capacity`**, and by every launch demo, now on two instances: `make demo-production`, `make demo-releases` and
`make demo-launch` create `class` apps (`journey/src/production.ts:280`, `launch.ts:497`). A person clicks it too.

**Architecture:**
- **§11's `Driver` handles a SET per hostname** (Spec action A): `ensureInstances(specs)` starts every new instance beside what serves,
  proves each privately, moves the route in ONE change to exactly the new set, and resolves only once the hostname is shown to reach EACH
  of them; `servingInstances(hostname)` answers the set; `restoreRoute(ids)` puts a set back; `retireInstance` refuses any member of the
  serving set; `destroyInstance` takes its own upstream out of the route and removes the route only with the last.
- **The edge's route dials N upstreams, round robin, with active and passive health checks**, and stamps each response with the instance
  that answered it from the upstream it chose — not one static value — so a deploy can see each new instance, and a person can see which
  one answered.
- **`routes` holds one row per (hostname, instance)** — the unique index on `hostname` alone goes.
- **The count is the audience's, for production only**, read at each deploy; staging and sandbox are 1; D21's rehearsal stays 1.
- **The contract goes to `1.8.0` ONCE, at Task 5** (`Environment.instances`, the serving set; the old `instance` kept, the newest of them).
  B then takes `1.9.0`, A2 `1.10.0`, FE-32 the next.

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0, Fastify 5.12.3, Drizzle over Postgres 16, `zod/v4`, Vitest 2.1; Caddy with its
`reverse_proxy` load balancing and health checks (the edge's own image, `infra/caddy/Dockerfile`); Docker Desktop 29.7.2. **No new
package or image.**

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read §24 (*What each answer
actually changes — production only*, l.2733-2745), §11 (*Driver interface* and *Redeploys*), §12 (the edge), §13 (D21's rehearsal), §14
(an instance's events and Incidents), §20 (the edge's headers).

**Predecessor:** [`2026-10-03-fe46-fe47-fe5.md`](./2026-10-03-fe46-fe47-fe5.md). **This plan starts only after its sitting 5 closes.**

**Successor:** [`2026-10-03-load-rehearsal.md`](./2026-10-03-load-rehearsal.md) (B); then [`2026-10-03-hibernation.md`](./2026-10-03-hibernation.md) (A2).

---

## How this plan is to be executed — sittings, one per session

> **SIX SITTINGS, PROPOSED.** Task 1 is first and alone. The edge's route and the `routes` table go first, together, because every later
> task reads them. The driver's set is the heart and is alone. The deploy, retire and boot recovery move together, because each assumes
> the others' set. The readers — the API, the console, D21's rehearsal, the knowledge pack — share a sitting. The acceptance is last.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements**: every fact re-read; Caddy's `reverse_proxy` with N upstreams, round robin, active and passive health checks, and a deferred header from the chosen upstream, in a THROWAWAY Caddy from the edge's image; a CWL sign-in started on one instance and finished on another; a WebSocket and a drain across N; the laptop's memory with three instances; the gate numbers | No | After Task 1's commit. **It stops and asks Rich** if `[M3]` finds a sign-in cannot cross instances (then the fork — sticky routing or a shared SAML cache — is his) | ← **next**, once approved and the plan before it has closed |
| 2 | 2, 3 | **The edge's route** for N upstreams; **`routes` one row per (hostname, instance)** | Yes — `routing/`, `db/` | After both commits, with an N-upstream route applied to the real edge and read back | |
| 3 | 4 | **The driver's set**: `ensureInstances`, `servingInstances`, `restoreRoute(ids)`, retire and destroy across a set; the driver contract; both drivers | Yes — `runtime/` | After the commit, with the Docker contract cases green | |
| 4 | 5 | **The deploy, retire and boot recovery across N**; the count by audience; the per-instance AI keys; **contract `1.8.0`** | Yes — `releases/`, `ai/`, `projects/` | After the commit, with a `class` app's production on two instances through the edge | |
| 5 | 6, 7 | **The readers**: D21's rehearsal pinned to one; the API's and console's serving set; the fleet's count; **the knowledge pack's no-state-in-memory rule** | Yes — `launch/`, `projects/` | After both commits, with the front-end told | |
| 6 | 8 | **The acceptance**: `make demo-capacity` and every launch demo on two instances, three times on each driver; a clicked half; the plan's one whole-branch review. **Alone, and last** | Yes, if any code changes | After the clicked half and the review's one fix wave | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates (`pnpm test` twice, alone, on the final tree), the Docker tier when owed, a dated
*What executing this plan found*, this table, and ORIENTATION §6's sweep. **Three rules survive any re-cut:** Task 1 first and alone; Task 8
alone and last; no task a spec action changes before Rich has decided it (A before sitting 3; B before sitting 5).

---

## Decided by Rich — build them, do not re-open them

- **§24's CAPACITY FIRST** — *"Build §24's capacity first"* (2026-10-03, ~13:52 PDT, answering the load rehearsal's first question, through
  `manifest-94`, [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)): production runs instances by audience — *class ≥2,
  large_course ≥3 with headroom, public ≥3* — the edge load-balancing across them; hibernation per the table. **The rest of §24's table**
  (backups, saturation alerting, tuned rate limits and abuse controls, `public`'s security review) **was not asked for.**
- **THE SPLIT AND THE ORDER** — *"Two plans: A then B"* (~13:56), then *"A1 → B → A2"* (~13:58): **this plan builds the instances**; B the
  load rehearsal; **A2 hibernation and wake-on-request** (*"Build hibernation in Plan A"*, ~13:56), with term dates as an administrator's
  platform setting (*"An admin platform setting"*) and pre-warming not built (*"Record it as not built"*). Then FE-32, the vulnerability
  database, FE-45.
- **Carried, still binding:** P4c's *"a redeploy interrupts nobody"* (`make demo-redeploy`); §20's edge headers on every route, deferred so
  an app cannot forge them; D21's rehearsal (person-only, stepped up, taken down in a `finally` and at boot); every refusal asserts its
  code; published text cites no section, decision or plan; the front-end is told before any commit to `packages/contract` or `packages/mock`.

---

## What Rich does, and when

1. **Review this plan.** 2. **Read and decide Spec action A before sitting 3, and B before sitting 5.** 3. **The clicked half, sitting 6**:
open a launched `class` app twice in two browsers and read, in DevTools, two different `X-Manifest-Instance` values; sign in on one and
stay signed in on the other; read the console's environment showing two instances.

---

## Read this first — what this plan knows from the code

*Read at `e969f9d` on 2026-10-03 by a read-only survey and this session. Task 1's `[M1]` re-reads every one.*

**The driver (`runtime/`).**
1. **`Driver.ensureInstance`** (`runtime/driver.ts:337-347`): *"Start the instance BESIDE whatever serves `spec.hostname` … move the route in
   ONE in-place change, and resolve only once the hostname is shown to reach THIS instance by its identity."* **`servingInstance(hostname):
   Promise<string | undefined>`** (`:355-356`) answers ONE; `listInstances` (`:357-358`) answers all, serving or not; **`restoreRoute(id)`**
   (`:359-365`) one; `retireInstance` refuses the serving one (`:349-354`, `INSTANCE_SERVING`); `switchOff` and `removeName` are
   hostname-level (`:367-384`). `InstanceSpec` (`:88-111`) has `instanceId` — *"the instance's identity everywhere: in its name, … in the
   alias the edge dials, and in the `X-Manifest-Instance` header"* — and no replica field.
2. **The driver contract asserts ONE server** (`runtime/driver-contract.ts:384-584`): *"the first instance serves its hostname"*
   (`:400-405`), *"a second instance takes the hostname over"* (`:407-416`), *"REFUSES to retire the instance that is serving"* (`:448-457`),
   `restoreRoute` (`:492-500`). **The fake driver** keeps `routes = new Map<string, string>()`, *"hostname -> instance id"*
   (`runtime/fake-driver.ts:93-97`, `:240-241`, `:266-267`, `:285`, `:307`).
3. **The Docker driver** (`runtime/docker/driver.ts`): `ensureInstance` (`:437-579`) dials `` `${instanceAlias(spec.instanceId)}:${spec.port}` ``
   (`:442`) — the alias is already per instance (`instances.ts:292`, `names.ts:75-83`); proves readiness privately from inside the edge
   (`:484-489`); reads `servingRoute` and calls `applyRoute` with ONE upstream (`:515-521`), **replacing the route**; `waitForIdentity`
   (`:530-557`), restoring the previous route JSON on failure (`:563-568`). `retireInstance` (`:592-641`) guards on `upstreamsInUse`
   (`:610-621`) and drains per address (`drainUpstream`, `:220-233`, Caddy's `num_requests`). `servingInstance` (`:653-657`) maps the
   route's one upstream to a container (`containers.ts:146-159`, `found[0]`). `restoreRoute` (`:711-733`) rebuilds a one-upstream route.
   **`destroyInstance` removes the hostname's WHOLE route** (`:751-775`, `:772`).

**The edge (`routing/`).**
4. **`buildRoute`** (`routing/caddy.ts:41-135`) takes one `upstream` and one `instanceId`; **`reverse_proxy`'s `upstreams: [{ dial }]`**
   (`:100-102`); **`X-Manifest-Instance` is a STATIC header** set by the route, deferred so the app cannot forge it (`:81`, `:84-97`); no
   `lb_policy`, no `health_checks` anywhere. **`upstreamOf` reads `upstreams?.[0]`** (`routing/routes.ts:141-146`), so `upstreamsInUse`
   (`:262-277`) — the retire guard's input — would not see upstreams 2..N. `servingRoute` (`:181-198`): *"A route this platform wrote always
   dials exactly one upstream."* `waitForIdentity` (`routing/readiness.ts:78-112`) succeeds only on `seen.instance === input.expected`.
   `stream_close_delay` is an hour (`caddy.ts:103-131`).

**The database.**
5. **`routes`** (`db/schema.ts:345-376`): one `instance_id` FK, and **`uniqueIndex('routes_hostname_key').on(t.hostname)`** (`:375`) —
   *"one hostname reaches one instance"*. **`instances`** (`:314-338`) has only a non-unique index: nothing blocks N rows.
   `environments` (`:300-312`) holds the hostname; no count.

**The deploy (`releases/`).**
6. **`deployRelease`** (`releases/release.ts`, all under `withEnvironmentLock`, `:407`): ONE `instances` row (`:422-432`); `previous =
   servingInstance(...)` (`:473`); services (`:488-509`); the AI key minted ONCE and stored per instance (`:626-648`;
   `ai/keys.ts:183-184` `instanceKeySecretName(instanceId)` — keys are already per instance); ONE `ensureInstance` (`:694-748`); ONE health
   wait (`:749`, `:1198-1222`); rollback by `servingInstance === handle.id` → `restoreRoute(previous)` (`:792-809`); the Route upsert
   `onConflictDoUpdate({ target: routes.hostname })` (`:832-840`); **every other instance of the environment marked `destroy_requested`**
   (`ne(instances.id, instanceId)`, `:847-860`) — with N, that reaps the N−1 siblings it just started; one `instance.healthy` and
   `recordLaunch` (`:933-957`).
7. **`retire.ts`**: `serving = servingInstance(…)` and targets `listInstances(…).filter(id => id !== serving)` (`:102-107`) — with N, the
   N−1 live siblings. `retireInstanceRow` (`:202-273`) is per instance. **`recover.ts`** pass 1 restores one route per hostname row
   (`:119-141`).

**The readers.**
8. **`servingInstanceOf`** (`projects/repository.ts:299-317`, `.limit(1)`) — called by `api/routes/project-reads.ts:100,368`,
   `api/routes/instances.ts:168-173`, `projects/fleet.ts:61`, `launch/candidate.ts:43`, `ai/models.ts:94`. `Environment.instance` (one,
   `api/representations/environments.ts:23-25`); `InstanceSummary.serving` — *"At most one instance of an environment serves"*
   (`representations/instances.ts:49-57`). The console reads `e.instance` (`screens/project.tsx:342-347`, `deploy.tsx:230`) and a per-row
   `serving` pill (`deploy.tsx:347-350`).
9. **D21's rehearsal** deploys into production through `deployRelease` (`launch/rehearsal.ts:205-209`) and takes down by
   `servingInstance === current.handle` (`:490-491`) — with N it would deploy N and take down one.
10. **What a faculty app keeps in memory.** The skeleton's sessions are in the app's own Mongo (`connect-mongo` 6.0.0,
    `blueprints/node-ts-mongo/skeleton/auth/session.js:1-14`, P4c Task 10: *"a redeploy signs nobody out"*). **The SAML login's own state** —
    whether `passport-ubcshib`'s `@node-saml/node-saml` 5.1.0 validates `InResponseTo` from a per-process cache — is unmeasured (`[M3]`).
11. **The audience** (`projects.audience`, `db/schema.ts:102`; `{ scale, burst }`) is read today only by the load-rehearsal item
    (`launch/readiness.ts:226-227`). Every launch demo creates `class`.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.8.0`, AT TASK 5.** Additive: `Environment.instances` (the serving set), `InstanceSummary.serving` re-described
   (*"one of the instances the hostname reaches"*). `Environment.instance` stays — the newest of the set — so no client breaks.
2. **THE COUNT**: `solo` 1, `class` 2, `large_course` 3, `public` 3 — **production only**, read from the audience at each deploy
   (`instancesFor(kind, audience)`, one function, `releases/`). *"≥3 with headroom"* is read as **three, each at the manifest's own
   resources**: two can carry the app while the third is replaced or has died. A setting can raise it later. Sandbox and staging are 1; D21's
   rehearsal is 1 (Decision 8).
3. **§11's `Driver` HANDLES A SET** (Spec action A):
   - `ensureInstances(specs: InstanceSpec[]): Promise<InstanceHandle[]>` — every spec the same hostname; starts each beside what serves,
     proves each privately, **moves the route in ONE change to exactly the new set**, and resolves only once the hostname is shown to reach
     EACH; if any is not ready, it throws with every handle, the route unmoved. Idempotent, as `ensureInstance` was. **`ensureInstance`
     goes**: one is a set of one.
   - `servingInstances(hostname): Promise<string[]>`; `restoreRoute(ids: string[])`; `retireInstance` refuses any member of the serving
     set; **`destroyInstance` takes its own upstream out of the route, and removes the route only with the last.**
   - *Rejected:* `ensureInstance` per replica, each moving the route — N route changes, N moments when the hostname reaches a partial new
     set beside the old, which is the interruption P4c exists to prevent.
4. **THE ROUTE**: `reverse_proxy` with every upstream; **`lb_policy: round_robin`** (so a deploy's identity check sees each new instance in
   N requests, and the load spreads evenly); **active health checks** on the blueprint's `health_path` every 5 s, and **passive** ones
   (`fail_duration`, `max_fails`, `unhealthy_status` 502/503/504), so a dead instance is routed around within seconds; **the
   `X-Manifest-Instance` header from the CHOSEN upstream** — a placeholder of the upstream's host, which is the instance's own alias
   (`mf-i-<instanceId>`) — still deferred, so the app cannot forge it. `[M2]` measures each half in a throwaway Caddy first. The rate limit,
   the headers and the body cap are unchanged: they are the route's, not an upstream's.
5. **`routes` IS ONE ROW PER (hostname, instance)**: the unique index becomes `(hostname, instance_id)`; a migration keeps every existing
   row (each is already one instance). Every reader asks for a SET; boot recovery groups by hostname.
6. **THE DEPLOY ACROSS N** (Task 5): N `instances` rows; **N AI keys, minted and stored per instance** (the scheme is already per instance;
   a shared key would outlive its first instance's retirement); one `ensureInstances`; a health wait for each; **any one unhealthy fails the
   deploy** — every new instance destroyed, the previous set restored, an Incident for the failed one (§14), and the previous set still
   serving (P4c's rule, unchanged in meaning); the Route rows replaced by the new set in one transaction; **every instance NOT in the new set
   marked `destroy_requested`**; one `instance.healthy` per instance; `recordLaunch` once, naming the set's first.
7. **RETIRE AND BOOT ACROSS N**: the retirer's targets are `listInstances` minus `servingInstances`; boot recovery restores each hostname's
   whole set from its Route rows (`restoreRoute(ids)`), and an instance whose container is gone leaves the set rather than the set being
   lost.
8. **D21'S REHEARSAL STAYS ONE INSTANCE** — it measures a sign-in, not load, and its take-down removes exactly what it put up; the
   equality checks (`launch/rehearsal.ts:490-491`) become set checks. **B's load rehearsal is where staging takes production's N.**
9. **WHAT A FACULTY APP MUST NOT KEEP IN MEMORY** (Task 7, the knowledge pack): *"Several copies of your app run at once in production, and
   any of them answers any request. Keep nothing a person needs between requests in the process — sessions are already in the app's
   database; put anything else there too."* **The SAML login** is held by `[M3]`: if a sign-in started on one instance cannot finish on
   another, sitting 1 stops and asks — **sticky routing by a platform cookie** (`lb_policy: cookie`) or **the SAML request cache in the
   app's Mongo** (a change to the skeleton, inherited by every app). *Recommended in advance:* the cache in Mongo, because sticky routing
   breaks round robin's even spread and the identity check, and a skeleton change is what §20 calls the blueprint's multiplier.
10. **NO NEW EVENT.** `instance.*` events are per instance already; `instance.healthy`'s description changes from *"now serves the
    environment"* to *"now serves the environment, with the rest of its set"*.

---

## Global Constraints

- **The four gates, clean before every commit**, from the repository root; `pnpm test` twice on a sitting's final tree; never `--filter`.
- **`pnpm test:docker`** is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`,
  `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `source/`, `mail/`, `infra/`, or a
  `*.docker.test.ts` — in the background, never beside a Vitest run; `docker network ls -q | wc -l` first; from a shell with
  `MANIFEST_SOURCE_DRIVER` and every `MANIFEST_GITHUB_*` unset; then restart the control plane, the three cleanup scripts, `make verify`.
- **Restarting the edge drops every runtime route**; the Docker tier does it. **Never touch the running edge to measure**: `[M2]` uses a
  throwaway Caddy from the edge's own image.
- **`make demo-redeploy` is P4c's acceptance and must stay green at every sitting that touches the deploy** — it is the witness that a
  redeploy interrupts nobody.
- **One file**: `pnpm exec vitest run --project unit src/<path>`. **Never two Vitest processes.** `pnpm test` truncates.
- **A route change is four commands**; **a migration** is `db:generate`, read, apply.
- **Published text cites no section, decision or plan.** **Every refusal asserts its code.** **Never accept a check you have not watched
  fail.** **Every task names its CALLER.**
- **The front-end is told before any commit to `packages/contract` or `packages/mock`.**
- **Commit on `main`, stage your own paths by name.** **Never edit the spec; never touch Valet; ask before `sudo`.** **The four protected
  containers survive; `caddy-data` is never destroyed.** **Leave the machine as you found it** — every throwaway container, network and route
  removed; the three cleanup scripts bare, then `--apply` (a Docker-tier run with N instances leaves more behind — count, never assume).

---

## Review Focus

1. **A redeploy that interrupts.** A request loop through the edge during a redeploy of a two-instance app. Expected: **no request fails
   and none reaches a retired instance**; the old pair drains. Owned by Task 5's *a redeploy across two* and `make demo-redeploy` (the
   acceptance runs it on two).
2. **A dead instance that keeps getting traffic.** One of two instances killed (`docker kill`). Expected: **within the health checks'
   window, every request reaches the survivor**; the deploy's Incident logic is not triggered by it (it is not a deploy) — the instance
   reads `failed`, and the next deploy replaces the set. Owned by Task 2's Docker case and Task 8.
3. **A retire or destroy that kills a sibling.** Retiring an instance outside the set while a set of two serves; destroying one member of
   the set. Expected: **the other member keeps serving; the route survives until its last upstream goes.** Owned by Task 4's contract cases.
4. **A partial deploy.** Of three new instances, one never becomes ready. Expected: **the route never reaches any of the three; the old set
   serves throughout; all three are destroyed; one Incident names the one that failed.** Owned by Task 4 and Task 5.
5. **A boot that loses a member.** The control plane restarted with two instances serving, one of whose containers was removed by hand.
   Expected: **the route is restored to the one that exists, and an operator line names the one that did not.** Owned by Task 5.
6. **A sign-in that breaks across instances** (`[M3]`). Expected: **a CWL sign-in completes whichever instance receives the assertion.**
   Owned by Task 1's stop and Task 7.

---

## File Structure

```
packages/control-plane/src/routing/caddy.ts, routes.ts, readiness.ts     MOD (T2) N upstreams; lb; health checks; the chosen upstream's identity;
                                                                          upstreamsOf (every one); servingRoute's set; waitForIdentities
packages/control-plane/src/db/schema.ts + drizzle/                        MOD (T3) routes unique (hostname, instance_id)
packages/control-plane/src/runtime/driver.ts, driver-contract.ts, fake-driver.ts   MOD (T4) the set
packages/control-plane/src/runtime/docker/driver.ts, containers.ts        MOD (T4) ensureInstances; servingInstances; restoreRoute(ids); retire, destroy
packages/control-plane/src/releases/release.ts, retire.ts, recover.ts, instances-for.ts (NEW)   MOD/NEW (T5)
packages/control-plane/src/projects/repository.ts, fleet.ts               MOD (T6) servingInstancesOf; the count
packages/control-plane/src/launch/rehearsal.ts, candidate.ts              MOD (T6) one instance; set checks
packages/control-plane/src/api/representations/environments.ts, instances.ts, routes/project-reads.ts, routes/instances.ts, contract/document.ts   MOD (T5, T6)
packages/console/src/screens/project.tsx, deploy.tsx; packages/mock/src/  MOD (T6)
blueprints/node-ts-mongo/agents/AGENTS.md (and the skeleton, if [M3] says)  MOD (T7)
packages/journey/src/capacity.ts, scripts/demo-capacity.sh, Makefile      NEW (T8); ci-acceptance.sh, offline-acceptance.sh MOD (T8)
docs/superpowers/spikes/instances-baseline/                               NEW (T1)
```

---

## Task 1: Measure what this plan rests on

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/instances-baseline/README.md`.

- [ ] **Step 1: `[M1]` Re-read every *Read this first* fact at HEAD**, with line numbers; and grep every caller of `servingInstance`,
  `servingInstanceOf`, `restoreRoute`, `upstreamOf` and `routes.hostname` — that list is Tasks 4–6's.
- [ ] **Step 2: `[M2]` Caddy across N**, in a THROWAWAY Caddy from `manifest-caddy`'s image on its own network, with three tiny upstreams
  (the fixture app's image) answering their own name: (a) `round_robin` — 9 requests reach each three times; (b) the deferred header from
  `{http.reverse_proxy.upstream.host}` (or the placeholder that names the chosen upstream — record which) carries the upstream that ANSWERED,
  and an upstream's own `X-Manifest-Instance` does not survive; (c) active health checks on `/healthz` at 5 s and passive ones — `docker
  kill` one upstream mid-loop and record how many requests fail and for how long; (d) a WebSocket held across a route re-apply that removes
  its upstream (`stream_close_delay`); (e) `num_requests` per upstream address for the drain. Record the exact JSON Task 2 will write.
- [ ] **Step 3: `[M3]` A CWL sign-in across two instances.** Two containers of the proof app at the same staging hostname behind a
  throwaway route, round robin: start a sign-in (its AuthnRequest from instance A), complete it at the IdP, and let the assertion's POST land
  on B (round robin alternates). Record whether `passport-ubcshib` accepts it, and `@node-saml/node-saml` 5.1.0's `validateInResponseTo`
  default as the skeleton constructs it. **If it is refused, STOP and ask Rich before sitting 2** (Decision 9's fork).
- [ ] **Step 4: `[M4]` The laptop's memory** with `launch-app` on three instances beside everything else (`docker stats`), and `uptime`.
- [ ] **Step 5: `[M5]` The gate numbers**, the contract's version, and `pnpm test` once.
- [ ] **Step 6: Commit** the spike directory by name.
  ```bash
  git commit -m "docs(instances): Task 1 — the measurements (Caddy across N, a sign-in across two instances, the laptop's memory)"
  ```

---

## Task 2: The edge's route — N upstreams, balanced, health-checked, each answer naming its instance

**Sitting 2.** Decision 4. **Its callers are Task 4's driver.**

**Files:** `routing/caddy.ts` (`buildRoute` takes `upstreams: { dial: string; instanceId: string }[]` and the blueprint's `healthPath`),
`routing/routes.ts` (`upstreamsOf(route): string[]` — every one — and `upstreamsInUse` from it; `servingRoute` answers `{ route,
upstreams, instanceIds }`), `routing/readiness.ts` (`waitForIdentities({ expected: string[] })` — succeeds once every expected id has been
seen within a bound, round robin's N requests, and fails naming those never seen); their tests and `routing/routes.docker.test.ts`.

- [ ] **Step 1: The failing tests.** The JSON: N upstreams, `round_robin`, the health checks, the header from the chosen upstream, still
  `deferred`; **a single-upstream route's JSON equal to today's except those three** (a pin of everything else — the rate limit, the
  headers, the body cap, `stream_close_delay`). `upstreamsOf` reads all; `upstreamsInUse` holds a second upstream (the retire guard's
  hole). `waitForIdentities`: every id seen → resolves; one never seen → rejects naming it. **The Docker case** (the real edge): a route of
  two upstreams; 10 requests reach both; one killed → within the window all reach the survivor (Review Focus 2).
- [ ] **Step 2: Run, and predict. Step 3: Implement.**
- [ ] **Step 4: Commit**, then the **negative control**: read only `upstreams[0]` again. Predict red: `upstreamsInUse`'s second-upstream
  row — the retire guard's witness.
  ```bash
  git commit -m "feat(routing): an app's route dials every instance it has — balanced, health-checked, each answer naming the instance that gave it"
  ```

---

## Task 3: `routes` — one row per (hostname, instance)

**Sitting 2, after Task 2.** Decision 5.

**Files:** `db/schema.ts` (`routes_hostname_key` → `routes_hostname_instance_key` on `(hostname, instance_id)`); `db:generate`, read it
(every existing row already satisfies it), apply; every writer that upserts on `routes.hostname` (`releases/release.ts:832-840`, `launch/`
`rehearsal.ts`) moves to delete-then-insert of the set in one transaction — Task 5 lands the deploy's; this task changes the schema and the
one shared helper, `replaceRouteSet(tx, hostname, instanceIds)`, with its test.

- [ ] **Step 1: The failing test**: two rows for one hostname are accepted; the same (hostname, instance) twice is refused (`23505`);
  `replaceRouteSet` leaves exactly the set given. **Step 2–3: Run, predict, implement, migrate.**
- [ ] **Step 4: Commit**, then the **negative control**: restore the hostname-only index. Predict red: the two-rows row only.
  ```bash
  git commit -m "feat(db): a hostname's route is a set of instances — one row each"
  ```

---

## Task 4: The driver's set

**Sitting 3. Spec action A decided first.** Decision 3. **Its caller is Task 5's deploy.**

**Files:** `runtime/driver.ts` (the interface, Decision 3's signatures and their doc comments); `runtime/fake-driver.ts`
(`routes: Map<string, Set<string>>`); `runtime/driver-contract.ts` (every continuity case at `:384-584` restated for a set, and new
ones); `runtime/docker/driver.ts` (`ensureInstances`: each container started and proved privately, then `applyRoute` once with every new
upstream, then `waitForIdentities`; on any failure, the previous route JSON restored and every new handle in the error;
`servingInstances` from `upstreamsOf`; `restoreRoute(ids)`; `retireInstance`'s guard over the set; `destroyInstance` re-applies the route
without its own upstream, or removes it with the last); `containers.ts` (`containersForUpstreams`).

**Interfaces:**
- Produces:

  ```ts
  // runtime/driver.ts
  export interface Driver {
    /**
     * Start EVERY spec beside whatever serves their hostname (all one hostname), make each ready without touching the route, move the
     * route in ONE change to exactly this set, and resolve only once the hostname is shown to reach EACH of them by its identity (§11
     * Redeploys, across N). If any is not ready, nothing is routed: `InstancesNotReadyError` carries every handle, and the set that
     * served still serves. Idempotent: asked again for the same specs it answers the same handles.
     */
    ensureInstances(specs: readonly InstanceSpec[]): Promise<InstanceHandle[]>
    /** The instances this hostname reaches now — empty when none. */
    servingInstances(hostname: string): Promise<string[]>
    /** Point the hostname back at exactly these instances (boot recovery; a failed deploy's rollback). */
    restoreRoute(ids: readonly string[]): Promise<void>
    // retireInstance: refuses any member of the serving set (INSTANCE_SERVING), unchanged in shape.
    // destroyInstance: takes its own upstream out of the route; removes the route only with the last.
    // …the rest unchanged
  }
  ```

- [ ] **Step 1: The failing tests — the driver contract, both drivers**: a set of two serves its hostname (both identities seen); a second
  set of two takes over in one move and the first set still runs (P4c, across N); a set with one never-ready member moves nothing and the
  first set serves (Review Focus 4); retiring a member of the serving set is `INSTANCE_SERVING`; retiring the old set's members leaves the
  new set serving; **destroying one member of a serving set leaves the other serving** (Review Focus 3); destroying the last removes the
  name; `restoreRoute([a, b])` puts both back; `listInstances` answers all.
- [ ] **Step 2: Run, and predict. Step 3: Implement**, both drivers.
- [ ] **Step 4: Commit**, then the **negative controls**: (a) route each new instance as it becomes ready (N moves). Predict red: the
  *"one move"* case — **only if it asserts that no request in a loop during the move reached a mixed set**; make it, or the control cannot
  fail. (b) Let `destroyInstance` remove the whole route again. Predict red: the destroy-one-member case only.
  ```bash
  git commit -m "feat(runtime): the driver runs a set of instances per hostname — started beside what serves, moved in one change, each proved"
  ```

---

## Task 5: The deploy, retire and boot recovery across N — and the count by audience

**Sitting 4.** Decisions 1, 2, 6, 7. **Contract `1.8.0`.**

**Files:** `releases/instances-for.ts` (NEW: `instancesFor(kind: EnvironmentKind, audience: Audience | null): number` — production by
Decision 2's table, every other kind 1; null audience 1); `releases/release.ts` (Decision 6 through `deployRelease`, its rollback and its
Incident; `servingInstances`); `releases/retire.ts` (targets `listInstances − servingInstances`; `servingIsRecorded` over the set);
`releases/recover.ts` (pass 1 grouped by hostname; a missing container leaves the set with an operator line); `api/representations/`
`environments.ts` (`instances: Instance[]`, the serving set; `instance` the newest of it), `instances.ts` (`serving`'s description);
`api/contract/document.ts` (`1.8.0`); the four contract commands; the mock's environments in the same step.

- [ ] **Step 1: The failing tests** (the fake driver; `releases/release.test.ts`, `retire.test.ts`, `recover.test.ts`): a `class`
  production deploy runs two instances, two AI keys stored per instance, two Route rows, one `instance.healthy` each; a `large_course` one
  three; staging one; a redeploy of two retires exactly the old two after the drain; **one of three new never healthy → the old set serves,
  the three destroyed, one Incident** (Review Focus 4); the retirer never targets a serving member; **a boot with one member's container gone
  → the route restored to the other, one operator line** (Review Focus 5); `instancesFor`'s table, and every non-production kind 1.
- [ ] **Step 2: Run, and predict. Step 3: Implement**, the contract commands. **Tell the front-end before the commit**: `1.8.0`;
  `Environment.instances`.
- [ ] **Step 4: Through the edge, on driver 1**: `make demo-production`'s `launch-app` (a `class` app) redeployed — two instances, both
  identities seen through the edge; **`make demo-redeploy` green** (Review Focus 1).
- [ ] **Step 5: Commit**, then the **negative control**: mark every instance but the FIRST new one `destroy_requested` (the old rule).
  Predict red: the two-instance deploy's *"two serve after the retirer runs"* row, and `make demo-production`'s identity check.
  ```bash
  git commit -m "feat(releases): production runs as many instances as its audience needs — deployed, retired and recovered as a set (contract 1.8.0)"
  ```

---

## Task 6: The readers — D21's rehearsal, the API, the console, the fleet

**Sitting 5. Spec action B decided first.** Decision 8.

**Files:** `launch/rehearsal.ts` (`deployRelease` with one instance for `purpose: 'rehearsal'`; `takeDown`'s and `releaseUnlaunchedName`'s
checks over the set); `launch/candidate.ts`, `ai/models.ts`, `projects/fleet.ts`, `api/routes/project-reads.ts`, `api/routes/instances.ts`
(`servingInstancesOf`, `projects/repository.ts:299-317` rewritten without `.limit(1)`; each caller says which it means — the set, or the
newest); `projects/fleet.ts` and its representation (the production count); the console (`screens/project.tsx:342-347`: *"2 instances,
healthy"*; `deploy.tsx`'s pill per row, unchanged in kind); the mock.

- [ ] **Step 1: The failing tests**: D21's rehearsal on a `class` app puts up ONE instance and takes down exactly it, the launched set
  untouched (a launched app refuses the rehearsal anyway — the case is a first launch's production, before which nothing serves there);
  the candidate is read the same with two staging-serving rows impossible (staging is one); the fleet shows `2`; the console renders two.
- [ ] **Step 2–3: Run, predict, implement.** **Tell the front-end before the commit.**
- [ ] **Step 4: Commit**, then the **negative control**: let the rehearsal deploy the audience's count. Predict red: the rehearsal's
  *"exactly one"* row.
  ```bash
  git commit -m "feat(launch,console): every reader of what serves an environment reads the set; D21's rehearsal stays one instance"
  ```

---

## Task 7: A faculty app on several instances — the knowledge pack (and the skeleton, if `[M3]` says)

**Sitting 5, after Task 6.** Decision 9.

**Files:** `blueprints/node-ts-mongo/agents/AGENTS.md` (Decision 9's paragraph, after *What you write*); `blueprints/blueprints.test.ts`
(the pack names the rule); and — **only if `[M3]` found a sign-in cannot cross instances and Rich chose the cache** —
`blueprints/node-ts-mongo/skeleton/auth/ubcshib.js` (`@node-saml`'s `cacheProvider` backed by the app's Mongo, beside the sessions), its
starter, and the skeleton's Docker tier.

- [ ] **Step 1: The failing test**: the pack says the rule. **Step 2–3.** **Step 4: Commit**, then the **negative control**: remove the
  paragraph. Predict red: the pack test only.
  ```bash
  git commit -m "docs(blueprints): several copies of an app answer its requests — the knowledge pack says what it must not keep in memory"
  ```

---

## Task 8: The acceptance — `make demo-capacity`, every launch demo on two instances, and a person clicking it

**Sitting 6. Alone, and last.**

**Files:** `packages/journey/src/capacity.ts`, `scripts/demo-capacity.sh`, `Makefile` (`demo-capacity`; it runs `make demo-production` first
when `launch-app` has not launched, as `demo-releases` does); `scripts/ci-acceptance.sh` and `offline-acceptance.sh` (a step).

- [ ] **Step 1: The phases**, each ending `every check passed`, on either driver, against `launch-app` (a launched `class` app): **two
  instances serve** — both `X-Manifest-Instance` values seen in 10 requests; **a redeploy of the same release loses no request** of a loop
  running through it (Review Focus 1); **one instance killed** — the loop's failures bounded by the health window, then every request on the
  survivor (Review Focus 2); **the next deploy replaces the set**; **a sign-in on one instance holds on the other** (Review Focus 6); and the
  console's environment reads two.
- [ ] **Step 2: Green three times on each driver** (fresh, re-use, from `make reset`); **`make demo-production`, `make demo-releases`,
  `make demo-launch` and `make demo-redeploy` green on two instances**; every other demo; `make ci-acceptance`; the offline acceptance named
  to Rich as owed.
- [ ] **Step 3: The negative controls**, one per Review Focus line, predicted, seen red, restored. **Step 4: The clicked half** (*What Rich
  does* 3). **Step 5: The plan's one whole-branch review**, beside the Docker tier; one fix wave. **Step 6: Close out**: the ledger, §7e
  (B's plan next), the front-end told.

---

## What this plan does not build

- **Hibernation and wake-on-request** — A2, after B (Rich, *"A1 → B → A2"*). Until then nothing hibernates, as today.
- **The rest of §24's table**: backups by audience, saturation alerting, tuned edge rate limits and abuse controls, `public`'s security
  review, and pre-warming (*"Record it as not built"*). Not asked for (2026-10-03).
- **Changing an audience after creation** (§24's *Changing the answer*). The count follows the audience at each deploy; nothing changes the
  audience yet.
- **More than one instance in staging or the sandbox**, except B's load rehearsal's grant.

---

## Spec actions — DRAFTED, NONE APPLIED

### A. §11 — the driver runs a set of instances per hostname (before sitting 3)

**Proposed.** In the `Driver` interface:
- `ensureInstance(d: InstanceSpec): Promise<InstanceHandle>   // idempotent — see Redeploys` ⟶
  `ensureInstances(d: InstanceSpec[]): Promise<InstanceHandle[]>   // one hostname; idempotent — see Redeploys`
- `servingInstance(hostname: string): Promise<string | undefined>` ⟶ `servingInstances(hostname: string): Promise<string[]>`
- `restoreRoute(id: string): Promise<void>        // re-point a hostname at a running instance` ⟶
  `restoreRoute(ids: string[]): Promise<void>     // re-point a hostname at running instances`
- `retireInstance(id, …)   // never the serving instance` ⟶ `// never one the hostname reaches`

and in *Redeploys*, after *"A redeploy of the same release is a new instance beside the one serving, never a replacement of it."*:
*"**Production runs as many instances as its audience needs (§24)**: a redeploy starts the whole new set beside the set serving, proves
each, and moves the route to the new set in one change; the edge balances across a set and routes around a member that stops answering."*

*Shared pages:* `manifest-schematic.html` (if it draws one instance per app), `manifest-decisions.html` (D29) — check.

### B. §24 — the instance counts, as built (before sitting 5)

**Proposed.** Under *What each answer actually changes*, after the table: *"**Instances are exactly 1, 2, 3 and 3**, each at the manifest's
own resources — *headroom* is the third instance, which carries the app while another is replaced or has died. Production's count is read
from the audience at each deploy; a faculty app runs correctly on several because it keeps nothing a person needs in its process's memory —
its sessions are in its own database (§8, the blueprint)."*

*Shared pages:* `manifest-decisions.html` D29, `manifest-stories.html` (a lecture's app) — check.

---

## What the self-review caught

1. **The retire guard would have let the retirer reap live replicas** — `upstreamOf` reads `upstreams[0]` (`routing/routes.ts:141-146`);
   Task 2's control is exactly that line.
2. **The deploy's own clean-up would have reaped the siblings it had just started** — `ne(instances.id, instanceId)`
   (`releases/release.ts:847-860`). Decision 6.
3. **A static `X-Manifest-Instance` cannot say which of N answered**, so no deploy could prove it moved. Decision 4 stamps it from the
   chosen upstream, still deferred.
4. **`destroyInstance` removes a whole hostname** (`runtime/docker/driver.ts:772`) — destroying one replica would have taken the app down.
   Decision 3; Review Focus 3.

---

## What executing this plan found

*(One dated section per sitting.)*
