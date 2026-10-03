# Hibernation and Wake-on-Request — §11, §24, A2 — Implementation Plan

> **WRITTEN 2026-10-03, AFTERNOON, BY THE PLANNING SESSION `manifest-c7`** (coordinated by `manifest-94`). **Rich's, the same afternoon,
> through the question tool** (times from the commits that recorded them): *"Build hibernation in Plan A"* (~13:56) — §11's wake-on-request
> at the edge and §24's hibernation rows; then *"A1 → B → A2"* (~13:58) — this plan after the instances (A1) and the load rehearsal (B);
> **term dates an administrator's platform setting** (*"An admin platform setting"*, ~13:58); **pre-warming not built** (*"Record it as not
> built"*, ~13:58), to come back to him if a cold wake measures more than a few seconds. **Its Task 1 is spike S4** — §11: *"The exact
> mechanism is S4's question … the spike decides it."* Facts read at `e969f9d`; three plans run before this one, so **Task 1 re-reads every
> one**. **Two spec actions are DRAFTED at the end, none applied.** **NOT YET APPROVED.**

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development, **whichever Rich chooses**. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9.

**Goal:** **An app nobody is using stops costing anything, and the first person who comes back wakes it.** Production follows §24's row —
**`solo` hibernates when idle; `class` hibernates only outside every term an administrator has set; `large_course` and `public` never** —
and staging hibernates after §11's seven idle days. A hibernated app's instances AND its dedicated database stop (D3: *"the database
hibernates with the app"*); its route points at the platform's waker; the next request wakes it — rate-limited and capped, as §20 requires
of an amplification primitive — and is served once it is healthy, by the mechanism S4 measures. Nothing a person wrote is lost, and an
app that wakes is the app that slept.

It is proved by **`make demo-hibernate`**, on either driver. A person clicks it too.

**Architecture:**
- **Task 1 is S4**, the spike §11 leaves the mechanism to: a request held at the edge while the control plane wakes the instance
  (`reverse_proxy` to the waker, which wakes and then proxies, or Caddy's `lb_try_duration`), against a **holding page** that polls and
  reloads — measured for a real cold wake, and recorded as Spec action A's words.
- **Idle is read from the edge**: per-host request counters (Caddy's metrics, `[M3]`), sampled by a sweep in the control plane — the
  platform's second background job after the retirer.
- **The policy is one function**, `idlePolicyFor(kind, audience, terms, now)`, replacing `IDLE_POLICY`'s unused table
  (`runtime/state-machine.ts:103-111`); **term dates are `MANIFEST_TERMS`**, an administrator's platform setting (Spec action B).
- **Hibernate and wake are the driver's existing verbs over A1's set**: `stopInstance` for each instance and the environment's services,
  a route to the waker; wake starts them in order and moves the route back — inside the environment's advisory lock, like a deploy.
- **The contract goes to `1.10.0` ONCE** (A1 `1.8.0`, B `1.9.0`): two events, an environment's `asleep`.

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0, Fastify 5.12.3, Drizzle over Postgres 16, `zod/v4`, Vitest 2.1; Caddy (the edge's own
image) — its metrics and `reverse_proxy`; Docker Desktop 29.7.2. **No new package or image.**

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read §11 (*Lifetime policies*,
l.1152-1160; *Hibernation and wake-on-request*, l.1218-1227; the state machine, l.~1182), §24 (the hibernation row, l.2734; *Sandbox and
staging ignore all of it*), D3, §20 (*Availability*: wake is an amplification primitive, l.2036-2042), §26 (*Platform settings*).

**Predecessor:** [`2026-10-03-load-rehearsal.md`](./2026-10-03-load-rehearsal.md) (B), after [`2026-10-03-production-instances.md`](./2026-10-03-production-instances.md) (A1).
**This plan starts only after B's acceptance closes.**

**Successor:** [`2026-10-03-fe32-dependencies.md`](./2026-10-03-fe32-dependencies.md) (FE-32).

---

## How this plan is to be executed — sittings, one per session

> **FIVE SITTINGS, PROPOSED.** Task 1 is S4, alone. Idle and the policy go with hibernating, because a hibernation needs both. Waking is
> alone — it is the amplification primitive. Boot and the clients share one. The acceptance is last.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **S4, and the measurements**: a real cold wake (an app and its Mongo, stopped and started); a request held through it at the edge, both ways, against a holding page; Caddy's per-host request counters; the gate numbers | No | After Task 1's commit. **It stops and asks Rich** if a cold wake is more than a few seconds (pre-warming comes back to him, his word), or if S4 finds the two mechanisms a genuine choice of what a person sees | ← **next**, once approved and B has closed |
| 2 | 2, 3 | **Idle, the policy and `MANIFEST_TERMS`**; **hibernating** an environment — its set and its services stopped, its route to the waker, recorded | Yes — `runtime/`, `routing/`, `releases/`, `services/` | After both commits, with a staging app hibernated through the real edge | |
| 3 | 4 | **Waking**: the waker, rate-limited per app and globally with a capped queue; the route moved back; S4's mechanism | Yes — `routing/`, `releases/`, `api/` | After the commit, with a request through the edge waking a hibernated app | |
| 4 | 5, 6 | **What wakes and what does not** (a deploy, an archive, the boot, a rehearsal); **the clients** (*asleep* in the console and the fleet, the mock, the guides); **contract `1.10.0`** | Yes — `releases/`, `launch/` | After both commits, with the front-end told | |
| 5 | 7 | **The acceptance**: `make demo-hibernate`, three times on each driver; every other demo; a clicked half; the plan's one whole-branch review. **Alone, and last** | Yes, if any code changes | After the clicked half and the review's one fix wave | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates, the Docker tier when owed, a dated *What executing this plan found*, this table, and
ORIENTATION §6's sweep (**and the roadmap's spike ledger: S4 answered**). **Three rules survive any re-cut:** Task 1 first and alone; Task 7
alone and last; no task a spec action changes before Rich has decided it (A after Task 1 and before sitting 3; B before sitting 2).

---

## Decided by Rich — build them, do not re-open them

*His words through `manifest-94`'s question tool on 2026-10-03, recorded in [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md); the
times are the commits'.*

- **HIBERNATION IN THIS PLAN** — *"Build hibernation in Plan A"* (~13:56), over instances-only: §11's wake-on-request at the edge, and
  §24's rows — **`solo` hibernates; `class` not during term; `large_course` and `public` never**.
- **THE ORDER** — *"A1 → B → A2"* (~13:58): this plan after the instances and the load rehearsal; then FE-32, the vulnerability database,
  FE-45.
- **TERM DATES** — *"An admin platform setting"* (~13:58): administrator-managed, deployment configuration (`MANIFEST_TERMS=…`), kept
  current each year from UBC's published calendar. **With none set, a `class` app never hibernates.** Drafted as a spec action (§24, §26).
  UBC's Academic API (FE-20) can be its later source.
- **PRE-WARMING** — *"Record it as not built"* (~13:58), with the reason: under §24's own table the only apps that can be cold at a
  `synchronised` burst are `solo` apps and `class` apps between terms. **Task 1 measures a real cold wake; more than a few seconds comes back
  to him with the number.**
- **Carried, still binding:** A1's set (a hibernated environment's whole set sleeps and wakes); P4c (a wake moves the route once); D3; §20's
  wake limits; every refusal asserts its code; published text cites no section, decision or plan; the front-end is told before any commit
  to `packages/contract` or `packages/mock`.

---

## What Rich does, and when

1. **Review this plan.** 2. **Decide Spec action B before sitting 2, and A — written from S4's answer — before sitting 3.** 3. **Hear
pre-warming again** only if Task 1's cold wake is more than a few seconds. 4. **The clicked half, sitting 5**: open a hibernated app in a
browser and watch it wake; read *asleep* and then *awake* in the console.

---

## Read this first — what this plan knows from the code

*Read at `e969f9d`. Task 1's `[M1]` re-reads every one, after A1 and B have landed.*

1. **`IDLE_POLICY`** (`runtime/state-machine.ts:97-111`): `sandbox` destroy after 45 minutes, `staging` hibernate after 7 days, `production`
   none — *"Enforced by whoever runs the reaper (P4)"* — and **nothing applies it** (`manifest-94` confirmed it, 2026-10-03).
2. **The driver can hibernate**: `stopInstance` (`runtime/driver.ts`; Docker `runtime/docker/instances.ts:318-…`) stops a container and
   writes a `-hibernated` marker volume, so `exited` reads `hibernated` rather than `failed` (`:26-43`), and the next start removes the
   marker (`:212-213`). §11's states include `hibernated ⇄ waking` (spec l.~1182; `instance_state` enum has both, `db/schema.ts`).
   **Services** (D3's per-app Mongo) have `ensureService`/`destroyService` and no stop — `[M1]` says what stopping one takes.
3. **Nothing wakes**: there is no wake path, no waker, and no idle measure. **§11 leaves the mechanism to S4**: Caddy's `lb_try_duration`
   for short waits, or *"a holding page that polls and reloads"* for longer ones (spec l.1218-1227); **S4 is the roadmap's deferred spike**
   (*"⬜ deferred — before Phase 4"*).
4. **§20 calls wake an amplification primitive** — *"one unauthenticated request starts a container and a database. Wake is rate-limited
   per app and globally, with a cap on concurrent wakes and a queue beyond it."* (spec l.2039-2041)
5. **The edge's route** (A1's): N upstreams, round robin, health checks, the per-IP rate limit; a route's `@id` per hostname; the
   retirer's drain reads Caddy's per-address `num_requests`. **Per-host request COUNTS** are not read anywhere — `[M3]` measures Caddy's
   metrics.
6. **The audience** (`projects.audience.scale`) is read by A1's `instancesFor` and B's load-rehearsal item; **term dates do not exist**.
7. **The retirer** (`releases/retire.ts`) is the control plane's one background job, scheduled per environment; **boot recovery**
   (`releases/recover.ts`) restores routes from the Route rows — a hibernated environment's route must come back to the WAKER, not to a
   stopped instance.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.10.0`.** Two events (`environment.hibernated`, `environment.woken`), and `Environment.asleep: boolean` (with
   `sleptAt`). The instance states `hibernated` and `waking` already exist in the contract.
2. **THE POLICY, ONE FUNCTION** — `idlePolicyFor(kind, audience, terms, now): { action: 'hibernate' | 'none'; afterMinutes: number | null }`,
   replacing `IDLE_POLICY` (`runtime/state-machine.ts`), its table:
   - **production**: `solo` — hibernate after **24 hours** idle; `class` — hibernate after 24 hours idle **only while `now` is in no term**
     (none set → never); `large_course`, `public` — never; no audience — never.
   - **staging** — hibernate after **7 days** idle (§11).
   - **sandbox** — none here: §11's *"destroyed after 45 min idle"* is not asked for, and destroying an agent's sandbox is a decision of its
     own (*What this plan does not build*).
   - The two thresholds are platform settings (Spec action A recommends the numbers; they are Rich's words).
3. **IDLE IS MEASURED AT THE EDGE** — a request through an environment's route resets its idle clock. The sweep samples the edge's
   per-host request counters every 5 minutes (`[M3]`: Caddy's metrics with per-host labels, or its admin API's upstream counters — the cheaper
   that is complete) and keeps `last_request_at` on the environment. A deploy, a rehearsal and a wake reset it too. *Rejected:* the app's own
   logs (an app that logs nothing would never look busy); the instance's CPU (a cron job is not a person).
4. **HIBERNATING AN ENVIRONMENT** (Task 3), inside its advisory lock: the route re-applied to the WAKER (Decision 5) — so nothing reaches a
   stopped container — then each instance stopped (`stopInstance`, state `hibernated`), then the environment's services stopped (D3), then
   `environment.hibernated`. **Never while a deploy, a rehearsal or a load rehearsal holds the environment** (the lock), never a production
   app whose policy says never, and **never twice** (an asleep environment is skipped).
5. **WAKING** (Task 4) — **S4 decides the mechanism** (Task 1), and Spec action A records it. Either way:
   - the waker is a control-plane endpoint on its own internal listener, reachable from the edge alone, which the hibernated route dials;
   - **rate-limited per app and globally, at most `MANIFEST_WAKE_CONCURRENCY` wakes at once (default 2 on a laptop), and a bounded queue
     beyond it** (§20); a wake already in progress for an environment is joined, never started twice;
   - it starts the services, then the set (A1's `ensureInstances` with the release the environment last served), proves each, and moves the
     route back to the set in ONE change — P4c's rule;
   - **the request that woke it**: *held* (the waker proxies it once the set is healthy, within a bound) if S4 measures a cold wake short
     enough to hold a browser's request; otherwise a **holding page** — `503`, `Retry-After`, an HTML page that reloads for a browser and a
     JSON body for anything else — and the next request reaches the app;
   - `environment.woken` with the wake's duration.
6. **WHAT WAKES IT, AND WHAT DOES NOT**: a request through the edge wakes it; **a deploy wakes it** (it starts a new set anyway, and the
   services first); an archive does not (it ends the app; a hibernated app is archived asleep); D21's and B's rehearsals wake staging/production
   as a deploy does; **the boot leaves an asleep environment asleep** and restores its route to the waker.
7. **THE TERMS SETTING** — `MANIFEST_TERMS`, `name:YYYY-MM-DD..YYYY-MM-DD` entries separated by commas, each a closed range in Vancouver's
   calendar; refused `CONFIG_INVALID` naming the entry (a bad date, an end before a start, an overlap); read at boot like every platform
   setting; `GET /v1/platform/terms` answers them to an administrator. **None set: a `class` app never hibernates.**
8. **PRE-WARMING IS NOT BUILT** (Rich), named in *What this plan does not build* with his reason; **Task 1's cold wake comes back to him if
   it is more than a few seconds.**
9. **TWO EVENTS** — `environment.hibernated` `{ environmentId, kind, idleMinutes, instances }` and `environment.woken` `{ environmentId,
   kind, wakeMs, cause: 'request' | 'deploy' | 'rehearsal' }` — never a requester's address.

---

## Global Constraints

- **The four gates, clean before every commit**; `pnpm test` twice on a sitting's final tree; never `--filter`.
- **`pnpm test:docker`** is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`,
  `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `source/`, `mail/`, `infra/`, or a
  `*.docker.test.ts` — in the background, never beside a Vitest run; then restart the control plane, the three cleanup scripts, `make verify`.
- **A hibernated app must never lose data**: a test stops and wakes an app with rows in its Mongo and reads them back, at every sitting
  that touches hibernate or wake.
- **Never touch the running edge to measure**: S4 uses a throwaway Caddy from the edge's image and throwaway apps.
- **Time is the database's** for every idle comparison (ORIENTATION §4 trap 14: the database's clock is not the host's).
- **One file**: `pnpm exec vitest run --project unit src/<path>`. **Never two Vitest processes.** **A route change is four commands; a
  migration is generate, read, apply.**
- **Published text cites no section, decision or plan.** **Every refusal asserts its code.** **Never accept a check you have not watched
  fail.** **Every task names its CALLER.**
- **The front-end is told before any commit to `packages/contract` or `packages/mock`.** **Commit on `main`, stage your own paths by name.**
  **Never edit the spec; never touch Valet; ask before `sudo`.** **The four protected containers survive; `caddy-data` is never destroyed.**
  **Leave the machine as you found it.**

---

## Review Focus

1. **A wake storm.** Two hundred requests to a hibernated app in one second; requests to twenty hibernated apps at once. Expected: **one wake
   per app, joined by every request for it; at most `MANIFEST_WAKE_CONCURRENCY` wakes running, the rest queued to a bound, the queue's
   overflow answered `503` with `Retry-After`** — never an unbounded start of containers. Owned by Task 4.
2. **Data lost, or the wrong release woken.** Rows written, the app hibernated, a deploy of a NEW release made while asleep, then a request.
   Expected: **the rows are there; the release that answers is the newest deployed**, and an app asleep before the deploy wakes on it.
   Owned by Task 4 and Task 5.
3. **An app put to sleep under someone.** A request arriving while the sweep hibernates; a long-held WebSocket through an otherwise idle
   app. Expected: **the route goes to the waker BEFORE any container stops**, so no request reaches a stopped container; a held stream counts
   as activity (`[M3]` says how) and the app is not idle. Owned by Task 3.
4. **The policy, wrong at its edges.** A `class` app on a term's first and last day, between terms, with no terms set; a `large_course` app
   idle for a month. Expected: **asleep only between terms, never with none set; a large app never.** Owned by Task 2.
5. **A boot that wakes everything, or loses an asleep app.** The control plane restarted with two asleep environments and one mid-wake.
   Expected: **the two stay asleep, routed to the waker; the mid-wake one is finished or put back asleep — never left with a route to a
   stopped container.** Owned by Task 5.
6. **A wake that cannot finish.** The release that served it now fails its health check on wake. Expected: **the environment stays asleep
   (routed to the waker), an Incident is opened, `environment.woken` is not published, and the waker answers the holding page with the
   failure's words** rather than looping. Owned by Task 4.

---

## File Structure

```
packages/control-plane/src/hibernation/                 NEW module (T2–T5), reached through its index.ts
  policy.ts                   idlePolicyFor(kind, audience, terms, now)
  terms.ts                    parseTerms(raw) — MANIFEST_TERMS
  idle.ts                     the sweep: per-host counters → last_request_at → hibernate
  hibernate.ts                hibernateEnvironment(deps, environmentId)
  wake.ts                     wakeEnvironment(deps, environmentId, cause) — the queue, the cap, the join
  waker.ts                    the waker's listener (S4's mechanism)
  index.ts, testing.ts
packages/control-plane/src/runtime/state-machine.ts     MOD (T2) IDLE_POLICY replaced by the policy
packages/control-plane/src/services/                    MOD (T3) stopping and starting a service (D3)
packages/control-plane/src/routing/                     MOD (T3, T4) a route to the waker; the counters
packages/control-plane/src/releases/release.ts, recover.ts, lifecycle.ts, launch/rehearsal.ts   MOD (T5)
packages/control-plane/src/db/schema.ts + drizzle/      MOD (T2, T3) environments.last_request_at, slept_at; the events CHECK
packages/control-plane/src/config.ts                    MOD (T2) MANIFEST_TERMS, the thresholds, MANIFEST_WAKE_CONCURRENCY
packages/control-plane/src/api/                         MOD (T5, T6) Environment.asleep; GET /v1/platform/terms; 1.10.0
packages/console/src/, packages/mock/src/, docs/api/    MOD (T6)
packages/journey/src/hibernate.ts, scripts/demo-hibernate.sh, Makefile   NEW (T7)
docs/superpowers/spikes/S4-findings.md                  NEW (T1) — S4's answer, its first sentence
```

---

## Task 1: S4 — can the edge hold a request while the control plane wakes an app? And the measurements.

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/S4-findings.md` — **its first sentence is
the answer**, as every spike's is (ORIENTATION §5) — and `results-task1-<date>.txt`.

- [ ] **Step 1: `[M1]` Re-read every fact at HEAD** (after A1 and B): the driver's set, the route, `stopInstance`, the services' verbs,
  `IDLE_POLICY`'s callers (none), the retirer's scheduling.
- [ ] **Step 2: `[M2]` A real cold wake.** A `node-ts-mongo` app (the proof app) with rows in its Mongo, its instance and its Mongo
  stopped as Decision 4 would stop them; then started in order, timed: Mongo ready, the app's health path `200`, the first page through a
  throwaway route. Five times; record each, and the rows read back. **If the median is more than a few seconds, it goes to Rich with the
  number** (pre-warming, his word).
- [ ] **Step 3: `[M3]` Idle at the edge**, in a throwaway Caddy from the edge's image: Caddy's metrics with per-host labels (whether the
  build enables them, the counter per host, the cost of reading it), and the admin API's per-upstream counters; a held WebSocket — whether
  it shows as activity in either. Record the cheapest complete measure.
- [ ] **Step 4: `[M4]` S4 itself — the two mechanisms**, in the throwaway Caddy with a stand-in waker (a 30-line Node server):
  (a) **held**: the hibernated route's `reverse_proxy` dials the waker, which starts the app and then proxies the request, within a bound —
  record what a browser (headless Chrome) and `curl` see at the wake times of Step 2, and at 30 s; and Caddy's `lb_try_duration` variant if
  it can trigger a wake at all; (b) **holding page**: the waker answers `503` with `Retry-After` and a reloading page — record what a
  browser shows and when it reaches the app. **S4's answer** is the mechanism that serves a browser's first request without an error at
  Step 2's wake time — and, if neither does without a choice of what a person sees, **it stops and asks Rich before sitting 3**.
- [ ] **Step 5: `[M5]` The gate numbers**, the contract's version, and `pnpm test` once.
- [ ] **Step 6: Commit** the spike record by name, and the roadmap's spike ledger's S4 row in the sitting's close.
  ```bash
  git commit -m "docs(S4): wake-on-request — <the answer>; a cold wake measured, idle measured at the edge"
  ```

---

## Task 2: Idle, the policy, and the terms

**Sitting 2. Spec action B decided first.** Decisions 2, 3, 7.

**Files:** `hibernation/policy.ts`, `terms.ts`, `idle.ts` (the sampler half), their tests; `runtime/state-machine.ts` (`IDLE_POLICY`
removed, its test moved to `policy.test.ts`); `config.ts` (`MANIFEST_TERMS`, `MANIFEST_HIBERNATE_SOLO_HOURS` default 24,
`MANIFEST_HIBERNATE_STAGING_DAYS` default 7); `db/schema.ts` (`environments.last_request_at`, `slept_at`); the migration.

**Interfaces:**
- Produces:

  ```ts
  // hibernation/terms.ts
  export interface Term { name: string; from: string; to: string }   // YYYY-MM-DD, inclusive, Vancouver
  export function parseTerms(raw: string): Term[]                      // throws ConfigError('CONFIG_INVALID', …) naming the entry
  export function inTerm(terms: readonly Term[], now: Date): boolean   // the day in Vancouver within any term

  // hibernation/policy.ts
  export interface HibernationPolicy { action: 'hibernate' | 'none'; afterMinutes: number | null }
  export function idlePolicyFor(
    kind: 'sandbox' | 'staging' | 'production',
    audience: { scale: 'solo' | 'class' | 'large_course' | 'public' } | null,
    terms: readonly Term[],
    now: Date,
    settings: { soloHours: number; stagingDays: number },
  ): HibernationPolicy
  ```

- [ ] **Step 1: The failing tests** (Review Focus 4): every row of Decision 2's table; a `class` app on a term's first day, last day, the day
  after, and with no terms; `parseTerms`: a valid list, a bad date, an end before a start, an overlap, an empty string (no terms) — each
  refusal naming the entry; `inTerm` at a clock change (Vancouver's November). **The sampler**: counters that move reset `last_request_at`;
  counters that do not leave it.
- [ ] **Step 2–3: Run, predict, implement, migrate.** **Step 4: Commit**, then the **negative control**: read `class` as `solo`. Predict
  red: the in-term rows only.
  ```bash
  git commit -m "feat(hibernation): which app may sleep, and when — the audience, the terms an administrator sets, and idleness measured at the edge"
  ```

---

## Task 3: Hibernating an environment

**Sitting 2, after Task 2.** Decision 4. **Its caller is the sweep (`idle.ts`), bound at boot beside the retirer.**

**Files:** `hibernation/hibernate.ts`, `idle.ts` (the sweep: every environment whose policy and `last_request_at` say so, one at a time, in
its lock); `services/` (stop and start a service, `[M1]`'s shape); `routing/` (a hibernated route: the same `@id`, its rate limit and
headers, dialling the waker); `observability/` (`environment.hibernated`); `src/index.ts` (the sweep's schedule); their tests and a Docker
case.

- [ ] **Step 1: The failing tests**: a staging app idle past its threshold → its route dials the waker FIRST, then its set and its service
  stop, `slept_at` set, one event (a recorded order — Review Focus 3); a production `large_course` app idle a month → untouched; an
  environment held by a deploy's lock → skipped this round; an asleep one → skipped; **the Docker case**: rows written, hibernated, the
  containers `exited` with their markers, and nothing reachable but the waker.
- [ ] **Step 2–3. Step 4: Commit**, then the **negative control**: stop the containers before re-pointing the route. Predict red: the
  order assertion — and, in the Docker case, a request in the window reaching a stopped container (`502`), which is what makes the control
  visible; give the case a request loop.
  ```bash
  git commit -m "feat(hibernation): an idle environment sleeps — its route to the waker first, then its instances and its database"
  ```

---

## Task 4: Waking — the waker, its limits, and S4's mechanism

**Sitting 3. Spec action A decided first, written from S4's answer.** Decision 5.

**Files:** `hibernation/wake.ts` (`wakeEnvironment(deps, environmentId, cause)` — the per-environment join, the global cap, the bounded
queue; the services, then `ensureInstances` with the last-served release; the route moved back in one change; the event; on failure, the
environment left asleep and an Incident); `hibernation/waker.ts` (the listener the hibernated route dials — on the control plane's internal
listener, refusing any source but the edge's; S4's mechanism: held or the holding page); `config.ts` (`MANIFEST_WAKE_CONCURRENCY`, the
queue's bound, the held request's bound); their tests and a Docker case.

- [ ] **Step 1: The failing tests** (Review Focus 1, 2, 6): 200 requests in a second → one wake, every request joined; twenty apps → at most
  the cap running, the rest queued, the overflow `503` with `Retry-After`; a request from anything but the edge → refused; the woken app
  serves the newest release and its rows; a release that fails on wake → asleep, an Incident, no `environment.woken`, the holding page with
  the failure's words; **the Docker case**: a hibernated app, a browser-shaped request through the real edge → the app's page, by S4's
  mechanism, timed.
- [ ] **Step 2–3. Step 4: Through the edge**: wake a hibernated staging app from the host with `curl` and headless Chrome; quote the times.
- [ ] **Step 5: Commit**, then the **negative controls**: (a) remove the per-environment join. Predict red: the *one wake* row (two starts).
  (b) Raise the cap to unbounded. Predict red: the twenty-apps row only.
  ```bash
  git commit -m "feat(hibernation): a request wakes a sleeping app — joined, capped and queued, and served once it is healthy"
  ```

---

## Task 5: What wakes and what does not — deploys, archives, rehearsals and the boot

**Sitting 4.** Decision 6. **Contract `1.10.0`.**

**Files:** `releases/release.ts` (a deploy to an asleep environment starts its services first and clears `slept_at`; `environment.woken`
with `cause: 'deploy'`), `releases/lifecycle.ts` (an archive of an asleep environment needs no stop), `launch/rehearsal.ts` and B's
`launch/load.ts` (each wakes as a deploy), `releases/recover.ts` (an asleep environment's route restored to the waker; a mid-wake one
finished or put back to sleep); `api/representations/environments.ts` (`asleep`, `sleptAt`), the events, `GET /v1/platform/terms`; the
contract commands; the mock.

- [ ] **Step 1: The failing tests** (Review Focus 2, 5): a deploy to an asleep environment → served, awake; an archive of an asleep one →
  archived, nothing started; a boot with two asleep and one mid-wake → the two still asleep and routed to the waker, the third resolved; the
  representation's `asleep`.
- [ ] **Step 2–3. Tell the front-end before the commit**: `1.10.0`; `asleep`; the two events. **Step 4: Commit**, then the **negative
  control**: restore an asleep environment's route to its (stopped) set at boot. Predict red: the boot row, and in the Docker tier a `502`.
  ```bash
  git commit -m "feat(releases): a deploy wakes a sleeping app, an archive leaves it asleep, and a boot keeps it so (contract 1.10.0)"
  ```

---

## Task 6: The clients — *asleep* on screen, the mock, the guides

**Sitting 4, after Task 5.**

**Files:** the console's project and fleet screens (*Asleep since <day>*; a large app never shows it); the mock (`MANIFEST_MOCK_ASLEEP`); 
`docs/api/` (a section on sleeping apps: what sleeps, what wakes it, what a first visitor sees, the terms; `events.md`); `blueprints/`
`node-ts-mongo/agents/AGENTS.md` (*"An app that nobody uses may sleep; its first visitor wakes it, in about <S4's time>. Keep nothing in
memory you cannot lose."*).

- [ ] **Step 1–3**: the tests, run, implement, `pnpm docs:write`. **Tell the front-end before the commit.** **Step 4: Commit**, then the
  **negative control**: show *asleep* for a `large_course` app. Predict red: the console's *never for a large app* row.
  ```bash
  git commit -m "feat(console,mock): a sleeping app says so; the guides say what wakes it"
  ```

---

## Task 7: The acceptance — `make demo-hibernate`, and a person clicking it

**Sitting 5. Alone, and last.**

**Files:** `packages/journey/src/hibernate.ts`, `scripts/demo-hibernate.sh`, `Makefile`; `scripts/ci-acceptance.sh` and
`offline-acceptance.sh` (a step). The demo shortens the thresholds through the settings for its own run and says so.

- [ ] **Step 1: The phases**, each ending `every check passed`, on either driver: a staging app with rows → idle → **asleep** (its route to
  the waker, its containers stopped, the event); a request through the edge → **woken**, by S4's mechanism, in the measured time, its rows
  intact; a burst of 100 requests at an asleep app → one wake (Review Focus 1); a `class` production app asleep only with no current term,
  and awake through a term (`MANIFEST_TERMS` set for the run); a `large_course` app (from B's demo) never asleep; a deploy to an asleep app;
  a boot with an app asleep.
- [ ] **Step 2: Green three times on each driver**, every other demo — **`make demo-redeploy`, `make demo-capacity` and `make demo-load` above
  all** — and `make ci-acceptance`; the offline acceptance named to Rich as owed.
- [ ] **Step 3: The negative controls**, one per Review Focus line. **Step 4: The clicked half.** **Step 5: The plan's one whole-branch
  review**; one fix wave. **Step 6: Close out**: the ledger and its spike table (S4 answered), §7e (FE-32's plan next), §5 (S4's line), the
  front-end told.

---

## What this plan does not build

- **Pre-warming** ahead of a `synchronised` window an owner declares (§24) — Rich, *"Record it as not built"*: under §24's own table only
  `solo` apps and `class` apps between terms can be cold at a burst, where a cold wake costs least. Task 1 measures it; more than a few
  seconds comes back to him.
- **The sandbox's *destroyed after 45 minutes idle*** (§11) — destroying an agent's working environment is a decision of its own, not asked.
- **A term calendar from UBC's Academic API** (FE-20) — the setting is administrator-kept until then.
- **The rest of §24's table**: backups, saturation alerting, tuned rate limits, `public`'s security review.
- **An owner choosing to hibernate a production app** (§11's *"hibernate opt-in"*) beyond what §24's row says.

---

## Spec actions — DRAFTED, NONE APPLIED

### A. §11 — wake-on-request as S4 answered it, and production's lifetime by audience (after Task 1, before sitting 3)

**Proposed** (the mechanism's sentence is filled from S4's answer):
1. **§11, *Lifetime policies***, production's lifetime *"always-on (hibernate opt-in)"* ⟶ *"by audience (§24): `solo` after 24 hours idle;
   `class` after 24 hours idle, outside term; `large_course` and `public` never"*.
2. **§11, *Hibernation and wake-on-request***: *"The exact mechanism is S4's question, not a settled design: …the spike decides it."* ⟶
   *"**S4 answered it (2026-10-xx): <the mechanism>** — a cold wake of an app and its database measured at <n> s. Idle is measured at the edge;
   an environment's route goes to the waker before anything stops, and comes back to its instances in one change once they are healthy. Wake is
   joined per app and capped, with a queue (§20)."*

*Shared pages:* `manifest-phases.html` (S4's line), `manifest-schematic.html` (if it describes an app sleeping) — check.

### B. §24 and §26 — term dates as a platform setting (before sitting 2)

**Proposed.**
1. **§24**, after the table: *"**A term is an administrator's setting** (§26): the platform's list of term dates, kept current each year
   from UBC's published calendar. A `class` app hibernates only outside every listed term, and with none listed it never does. (UBC's
   Academic API can be its source later.)"*
2. **§26, *Platform settings***: add *"and the term dates (§24)"*.

*Shared pages:* `manifest-decisions.html` D29 — check.

---

## What the self-review caught

1. **§11 leaves the wake mechanism to a spike that never ran** (S4, deferred). A plan that chose one by reading would have built what the spec
   says only a measurement may decide; Task 1 is S4, and Spec action A is written from its answer.
2. **A sweep that stopped containers before moving the route** would have answered `502` to the request that arrived in between — Decision 4's
   order, Review Focus 3, and a negative control given a request loop so it can fail.
3. **A boot restoring an asleep environment's route to its stopped instances** — A1's recovery restores every Route row's set; Task 5 makes an
   asleep one go to the waker.
4. **`IDLE_POLICY` was a table nothing read** — replaced, not left beside the new policy as a second statement.

---

## What executing this plan found

*(One dated section per sitting.)*
