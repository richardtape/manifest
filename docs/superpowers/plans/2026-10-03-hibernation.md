# Hibernation and Wake-on-Request — §11, §24, A2 — Implementation Plan

> **WRITTEN 2026-10-03, AFTERNOON, BY THE PLANNING SESSION `manifest-c7`** (coordinated by `manifest-94`). **Rich's, the same afternoon,
> through the question tool** (times from the commits that recorded them): *"Build hibernation in Plan A"* (~13:56) — §11's wake-on-request
> at the edge and §24's hibernation rows; then *"A1 → B → A2"* (~13:58) — this plan after the instances (A1) and the load rehearsal (B);
> **term dates an administrator's platform setting** (*"An admin platform setting"*, ~13:58); **pre-warming not built** (*"Record it as not
> built"*, ~13:58), to come back to him if a cold wake measures more than a few seconds. **Its Task 1 is spike S4** — §11: *"The exact
> mechanism is S4's question … the spike decides it."* Facts read at `e969f9d`; four plans run before this one (the rest of
> *faculty-ready*, FE-46/47/5, A1, B), so **Task 1 re-reads every one**. **Three spec actions are DRAFTED at the end** (two at writing; the
> revision added C), **none applied.** **NOT YET APPROVED — revised (`2d74a5d`); a second fresh review before approval** (Rich, 2026-10-03, 15:20 PDT:
> *"A1 and FE-32 now; B and A2 later (Recommended)"* — B and A2 are reviewed again when each is next in line).
>
> **REVISED 2026-10-03, 14:37–15:19 PDT (read from the clock), TO A FRESH REVIEW** ([`2026-10-03-review-of-four-plans.md`](./2026-10-03-review-of-four-plans.md),
> its §3 and *Cross-plan*; verdict *needs rework*), by a fresh platform session at Rich's word (~14:33), coordinated by `manifest-94`. It
> builds in **Rich's answer on term start — *"Wake them at term start"*** (Decision 6, Task 5). S4's stand-in waker now runs on the host;
> the waker's route has no health checks and knows the edge by a secret; wake starts the same instances through a new `Driver` verb, with
> two more beside it (Spec action C); hibernating writes its intent first; waking is built before hibernating. The review's line references
> were re-checked at `75030d8` and hold. **Every finding, and where it went, is in *Revised to the review*.**

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development, **whichever Rich chooses**. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9.

**Goal:** **An app nobody is using stops costing anything, and the first person who comes back wakes it.** Production follows §24's row —
**`solo` hibernates when idle; `class` hibernates only outside every term an administrator has set, and is woken when a term begins;
`large_course` and `public` never** — and staging hibernates after §11's seven idle days. A hibernated app's instances AND its dedicated
database stop (D3: *"the database hibernates with the app"*); its route points at the platform's waker; the next request wakes it —
rate-limited and capped, as §20 requires of an amplification primitive — and is served once it is healthy, by the mechanism S4 measures.
**Nothing a person wrote is lost, and an app that wakes is the app that slept**: the same instances, started again, never a new deploy.

It is proved by **`make demo-hibernate`**, on either driver. A person clicks it too.

**Architecture:**
- **Task 1 is S4**, the spike §11 leaves the mechanism to — measured with **a stand-in waker running ON THE HOST**, reached by the edge at
  `host.docker.internal`, because that is where the real one runs and the host cannot reach a container's address (spec l.2169;
  `TRAPS.md:55`). It measures two ways of HOLDING a browser's first request — Caddy proxying to the woken set after the waker's blocking
  answer, or the waker sending it back through the edge — against a **holding page** that polls and reloads, at a real cold wake's time,
  and records the answer as Spec action A's words.
- **Idle is read from the edge**: per-host request COUNTERS (Caddy's metrics, `[M3]`) — a counter that went DOWN (an edge restart) counts
  as activity — **and** the per-upstream in-flight gauge (`num_requests`) for a stream held open, sampled by a sweep in the control plane:
  the platform's third background job, after the retirer and A1's set watcher.
- **The policy is one function**, `idlePolicyFor(kind, audience, terms, now, settings)`, replacing `IDLE_POLICY`'s unused table
  (`runtime/state-machine.ts:97-109`); **term dates are `MANIFEST_TERMS`**, an administrator's platform setting (Spec action B).
- **Three new `Driver` verbs** (Spec action C, §11 — the review's I3: *"existing verbs"* was false): **`stopService`** (a service stopped,
  its data kept; `ensureService` already starts a stopped one and waits for it), **`routeToWaker`** (a hostname's route dials the waker —
  no health checks, the header naming the waker, a secret header the edge sets), and **`wakeInstances`** (a stopped set started again,
  proved, and routed in one change). Hibernating writes its intent first, then routes to the waker, drains, and stops; waking starts the
  services, then the set, and moves the route back — each inside the environment's advisory lock, like a deploy.
- **The contract goes to `1.10.0` ONCE, at Task 4** (A1 `1.8.0`, B `1.9.0`): two events, an environment's `asleep`, the terms.

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0, Fastify 5.12.3, Drizzle over Postgres 16, `zod/v4`, Vitest 2.1; Caddy (the edge's own
image) — its metrics and `reverse_proxy`; Docker Desktop 29.7.2. **No new package or image.**

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read §11 (*Driver
interface*, l.1102-1150; *Lifetime policies*, l.1152-1175; the state machine, l.1177-1193 — it draws `hibernated ⇄ waking`; *Hibernation
and wake-on-request*, l.1218-1227), §21 (the control plane is a host process that cannot reach container addresses, l.2169), §24 (the
hibernation row, l.2734; *Sandbox and staging ignore all of it*), D3, §20 (*Availability*: wake is an amplification primitive,
l.2036-2042), §26 (*Platform settings*, l.2959-2966).

**Predecessor:** [`2026-10-03-load-rehearsal.md`](./2026-10-03-load-rehearsal.md) (B), after [`2026-10-03-production-instances.md`](./2026-10-03-production-instances.md) (A1).
**This plan starts only after B's acceptance closes.**

**Successor:** [`2026-10-03-fe32-dependencies.md`](./2026-10-03-fe32-dependencies.md) (FE-32).

---

## How this plan is to be executed — sittings, one per session

> **SIX SITTINGS, PROPOSED** (five before the review, which added the driver's three verbs). Task 1 is S4, alone. Idle, the policy and
> the driver's verbs go together, because each is a unit the rest stands on. **Waking comes BEFORE hibernating**, so no commit ever puts
> an app to sleep that the platform cannot wake — or keep asleep, or launch: **the sweep is bound at boot only in Task 6**, in the same
> commit as everything that keeps an asleep app asleep across a boot, a deploy and a failed deploy, and keeps its staging's candidate. What
> wakes and what does not, the boot, and the clients share a sitting. The acceptance is last.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **S4, and the measurements**: a real cold wake (an app and its Mongo, stopped and started); a request held through it at the edge, both ways, by a stand-in waker ON THE HOST, against a holding page; two waker routes sharing one dial address; Caddy's per-host request counters and the in-flight gauge; the gate numbers | No | After Task 1's commit. **It stops and asks Rich** if a cold wake is more than a few seconds (pre-warming comes back to him, his word), or if S4 finds the mechanisms a genuine choice of what a person sees | ← **next**, once approved and B has closed |
| 2 | 2, 3 | **Idle, the policy and `MANIFEST_TERMS`**; **the driver's three verbs** — `stopService`, `routeToWaker`, `wakeInstances` — on both drivers, in the driver contract | Yes — `runtime/`, `routing/`, `services/` | After both commits, with a staging set stopped, routed to a stand-in waker and woken through the real edge by the verbs alone | |
| 3 | 4 | **Waking**: the waker on its own listener, its secret, its limits (joined per app, capped, queued), S4's mechanism; **contract `1.10.0`** | Yes — `routing/`, `releases/` | After the commit, with a request through the edge waking a set the verbs put to sleep | |
| 4 | 5 | **Hibernating**: the intent written first, the route to the waker, the drain, the stop; the sweep (NOT yet bound at boot); **class apps woken when a term begins**; `environment.hibernated` | Yes — `releases/`, `services/`, `observability/` | After the commit, with a staging app hibernated by the sweep and woken by a request, through the real edge | |
| 5 | 6, 7 | **What wakes and what does not** (a deploy, a failed deploy, an archive, the boot's passes 1 and 1½, a rehearsal, the candidate) — **and the sweep bound at boot, the first commit that lets an app sleep on its own**; **the clients** (*asleep* in the console and the fleet, the mock, the guides) | Yes — `releases/`, `launch/` | After both commits, with the front-end told | |
| 6 | 8 | **The acceptance**: `make demo-hibernate`, three times on each driver; every other demo; a clicked half; the plan's one whole-branch review. **Alone, and last** | Yes, if any code changes | After the clicked half and the review's one fix wave | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates, the Docker tier when owed, a dated *What executing this plan found*, this table, and
ORIENTATION §6's sweep (**and the roadmap's spike ledger: S4 answered**). **Three rules survive any re-cut:** Task 1 first and alone; Task 8
alone and last; no task a spec action changes before Rich has decided it (**B, A's item 1 and C before sitting 2; A's item 2 — written
from S4's answer — before sitting 3**).

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
- **CLASS APPS WOKEN AT TERM START** — *"Wake them at term start (Recommended)"* (~14:33, answering the fresh review's I8): **when
  `MANIFEST_TERMS` says a term begins, asleep `class` production apps are woken**, so a course's first lecture never meets a cold app
  (Decision 6, Task 5).
- **PRE-WARMING** — *"Record it as not built"* (~13:58), with the reason: under §24's own table the only apps that can be cold at a
  `synchronised` burst are `solo` apps and `class` apps between terms. **Task 1 measures a real cold wake; more than a few seconds comes back
  to him with the number.**
- **Carried, still binding:** A1's set (a hibernated environment's whole set sleeps and wakes) and its watcher (which skips an asleep
  environment); B's run (which holds staging while it lasts); P4c (a wake moves the route once); D3; §20's wake limits; every refusal
  asserts its code; published text cites no section, decision or plan; the front-end is told before any commit to `packages/contract` or
  `packages/mock`.

---

## What Rich does, and when

1. **Review this plan, after its second fresh review** (Rich, 15:20: *"B and A2 later"*). 2. **Decide Spec action B, Spec action A's item 1 and Spec action C before sitting 2, and A's item 2 — written
from S4's answer — before sitting 3.** 3. **Hear pre-warming again** only if Task 1's cold wake is more than a few seconds. 4. **The
clicked half, sitting 6**: open a hibernated app in a browser and watch it wake; read *asleep* and then *awake* in the console.

---

## Read this first — what this plan knows from the code

*Read at `e969f9d`; the facts the revision added or corrected were read at `75030d8`. Task 1's `[M1]` re-reads every one, after A1 and B
have landed.*

1. **`IDLE_POLICY`** (`runtime/state-machine.ts:97-109`): `sandbox` destroy after 45 minutes, `staging` hibernate after 7 days,
   `production` none — *"Enforced by whoever runs the reaper (P4)"* — and **nothing applies it** (`manifest-94` confirmed it, 2026-10-03).
2. **The driver can stop an instance, and nothing else this plan needs**: `stopInstance` (`runtime/driver.ts`; Docker
   `runtime/docker/instances.ts:318-…`) stops a container and writes a `-hibernated` marker volume, so `exited` reads `hibernated` rather
   than `failed` (`:26-43`), and the next start removes the marker (`:212-213`). **There is no verb to START a stopped instance**:
   `ensureInstances` (A1's) restarts an existing container only when its environment hash is unchanged, and refuses otherwise
   (`instances.ts:189-206`, `INSTANCE_SPEC_CHANGED`) — and nothing keeps the spec it was built from. **There is no verb to stop a SERVICE**:
   only `destroyService`; **`ensureService` already starts a stopped one and waits for it** (`runtime/docker/services.ts:28-44`, *"a service
   woken after a stop"*). **There is no verb to route a hostname to anything but instances**: `switchOff` is the archive's `410` page.
3. **The state machine**: `healthy → hibernated` on `idle_timeout`; `hibernated → waking` on `wake_requested`; `waking → starting` on
   `container_started`, `→ failed` on `health_failed` or `interrupted` (`runtime/state-machine.ts:50-63`). **`waking` has no way back to
   `hibernated`**, though §11 draws `hibernated ⇄ waking`. **Boot pass 2 turns every `waking` row into `failed`** (`releases/recover.ts`'s
   `MID_DEPLOY`, `:29`, `:144-161`), and `failed` has no path back.
4. **Nothing wakes**: there is no wake path, no waker, and no idle measure. **§11 leaves the mechanism to S4**: Caddy's `lb_try_duration`
   for short waits, or *"a holding page that polls and reloads"* for longer ones (spec l.1218-1227); **S4 is the roadmap's deferred spike**
   (*"⬜ deferred — before Phase 4"*).
5. **§20 calls wake an amplification primitive** — *"one unauthenticated request starts a container and a database. Wake is rate-limited
   per app and globally, with a cap on concurrent wakes and a queue beyond it."* (spec l.2039-2041)
6. **Where a waker can live, and what can reach it.** The control plane is a host process listening on **`127.0.0.1`**
   (`src/index.ts:462`); the edge reaches the host at **`host.docker.internal`** (`infra/caddy/Caddyfile:69`, the API's own route), so
   every request the waker receives from the edge comes from one address and cannot be told from another host process by it. **The host
   cannot reach a container's address** (spec l.2169; `TRAPS.md:55`) — a waker cannot proxy to the woken app itself.
7. **The edge's route** (A1's): N upstreams, round robin, **a health policy passed in, `'none'` leaving out every check**; a route's `@id`
   per hostname; the header **exactly the answering instance's id**. **Caddy's health state is per dial address and shared across
   routes** (the review), so every hibernated route dialling one waker address would share it. The retirer's drain reads Caddy's
   **`num_requests`, an in-flight GAUGE, not a counter** (`routing/caddy.ts:21-27`). **Per-host request COUNTS** are not read anywhere —
   `[M3]` measures Caddy's metrics; **a counter resets when the edge restarts**.
8. **The audience** (`projects.audience.scale`) is read by A1's `shapeFor` and B's load-rehearsal item; **term dates do not exist**.
9. **The background jobs and the boot**: the retirer (`releases/retire.ts`, scheduled per environment; **its skip, kept by A1, is *"the
   serving set is empty"*** — a route that dials the waker serves no instance, so the asleep set is never reaped) and A1's set watcher
   (production, every 15 s; it skips a member whose status is `hibernated`). **Boot recovery's order, fixed by A1's Decision 7**: 0 builds;
   **1 the Route records — an asleep environment routed to the WAKER instead (this plan)**; **1½ a wake left mid-way (this plan)**; 2 a deploy
   left mid-way; 2½ archives; 2¾ D21's rehearsal; 2⅞ B's load rehearsal; 3 the retire passes, last.
10. **The locks**: `withEnvironmentLock` BLOCKS (`db/locks.ts:26-31`) — there is no try-lock for an environment; D21's and B's are
    try-locks of their own. **B's run holds staging by a `running` row, not by the lock** (its deploys take the lock only while they
    deploy).
11. **The candidate is staging's HEALTHY serving instance** (`launch/candidate.ts:43-50`, *"Nothing in Phase 1 hibernates a staging
    instance, so `healthy` is the whole of 'serving'"*) — **an asleep staging would have no candidate**, and the checklist, the
    production deploy's *"only the release serving staging"* rule, and B's rehearsal would all read *"nothing staged"* (found by this
    revision, not the review).

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.10.0`, AT TASK 4**, the first schema change (`environment.woken`); Tasks 5–7 add to it: `environment.hibernated`,
   `Environment.asleep: boolean` (with `sleptAt`), and `GET /v1/platform/terms`. The instance states `hibernated` and `waking` already exist
   in the contract.
2. **THE POLICY, ONE FUNCTION** — `idlePolicyFor(kind, audience, terms, now, settings): { action: 'hibernate' | 'none'; afterMinutes: number |
   null }`,
   replacing `IDLE_POLICY` (`runtime/state-machine.ts:97-109`), its table:
   - **production**: `solo` — hibernate after **24 hours** idle; `class` — hibernate after 24 hours idle **only while `now` is in no term**
     (none set → never); `large_course`, `public` — never; no audience — never.
   - **staging** — hibernate after **7 days** idle (§11).
   - **sandbox** — none here: §11's *"destroyed after 45 min idle"* and §24's *"Sandbox and staging … hibernates when idle"* are not asked
     for, and ending an agent's sandbox is a decision of its own (*What this plan does not build*).
   - The two thresholds are platform settings (Spec action A recommends the numbers; they are Rich's words).
3. **IDLE IS MEASURED AT THE EDGE, FROM TWO SIGNALS** (the review's I10) — the sweep, every 5 minutes, reads **each hostname's request
   COUNTER** (Caddy's metrics with per-host labels — `[M3]` says whether the edge's build has them and what enabling them takes) **and each
   member's in-flight GAUGE** (`num_requests`, the drain's own signal). **An environment was active since the last sample when its counter
   moved, when its counter went DOWN (the edge restarted, and its count since is unknown), or when any member had a request in flight** —
   a WebSocket or an event stream held open is someone using the app. Each activity sets `last_request_at` to the database's `now()`. A
   deploy, a rehearsal and a wake set it too. *Rejected:* the app's own logs (an app that logs nothing would never look busy); the
   instance's CPU (a cron job is not a person); the counter alone (a held stream sends no new requests).
4. **HIBERNATING AN ENVIRONMENT** (Task 5) — **the intent first, then the route, then the stop** (the review's I6). Inside its advisory lock
   (taken by **`tryWithEnvironmentLock`**, new in `db/locks.ts` — a held lock means a deploy is under way, and the sweep skips the
   environment this round rather than queue behind it):
   1. **ONE TRANSACTION**: `slept_at` set, and the `environment.hibernated` event row recorded in it (pushed on the bus after the commit —
      the faculty-ready plan's Task 16 pattern);
   2. **`routeToWaker`** — nothing reaches a container from here on;
   3. **each member drained** — its `num_requests` to 0, bounded by the retirer's 120 s — so a request or a stream the route carried a
      moment before is finished, not cut (the review's minor);
   4. **each member stopped** (`stopInstance`, the row `healthy → hibernated` by `idle_timeout`), **then each service** (`stopService`).
   **A crash anywhere in 2–4 leaves `slept_at` set**, and the boot's pass 1 finishes it: the route to the waker, and any member or service
   still running stopped. **Never while B's run holds the project's staging** (its `running` row — not the lock, which B holds only while
   it deploys); never a production app whose policy says never; **never twice** (an asleep environment is skipped).
5. **WAKING** (Task 4) — **S4 decides how a waiting request is served** (Task 1), and Spec action A records it. Either way:
   - **the waker is the control plane's own second listener**, on `127.0.0.1` at a port of its own (7113 if `[M1]` finds it free), which
     the edge reaches at `host.docker.internal`. **It knows the edge by a SECRET the route sets** (the review's I9): `routeToWaker`'s route
     sets `X-Manifest-Waker: <secret>` and `X-Manifest-Waker-Environment: <environmentId>` on the request — a client's own values for either
     are overwritten, never passed — and the waker refuses any request without the secret (`403`, nothing woken). The secret is made at
     boot, held in memory and never logged; the boot's pass 1 re-applies every asleep route with the new one;
   - **the waker's route has no health checks and no passive policy** (A1's `health: 'none'`), and **its header names the waker** — the
     literal `waker`, never an instance id (the review's C1). **No active probe ever reaches it**, so a probe can never wake every asleep
     app; and a request carrying A1's `X-Manifest-Probe` header is answered `204` without waking, should one arrive;
   - **rate-limited per app and globally**: a wake already in progress for an environment is JOINED, never started twice; **at most
     `MANIFEST_WAKE_CONCURRENCY` wakes at once (default 2 on a laptop), and a bounded queue beyond it (`MANIFEST_WAKE_QUEUE`, default 20)**,
     whose overflow is answered `503` with `Retry-After` (§20); the edge's per-IP limit still applies on the waker's route;
   - **it wakes THE SAME INSTANCES** (the review's I4: *"pick one"*): the services first (`ensureService`, which starts a stopped one and
     waits), then **`wakeInstances(ids)`** over the asleep set — each started again, proved privately, the route moved back to exactly
     that set in ONE change (P4c's rule) — the rows `hibernated → waking` before, `waking → starting → healthy` after, in one transaction
     with `slept_at` cleared; `environment.woken` with the wake's duration.
     *Rejected:* waking by a fresh deploy of the release last served — new rows, new AI keys and a new Service Provider registration on
     every wake, the approval's gate asked again for a release that already passed it, and a slower cold wake, which is the number
     pre-warming turns on; §11's machine draws `hibernated ⇄ waking` for the instance that slept. *Cost to change course:* `wakeInstances`
     and its spec action.
   - **the request that woke it**, by S4's answer: **held** — either Caddy proxies it to the woken set once the waker's blocking answer says
     so, or the waker sends it back through the edge, which puts every held request in the HOST's per-IP 600-a-minute bucket and hides the
     client's address (both costs recorded by `[M4]`) — if S4 measures a cold wake short enough to hold a browser's request; otherwise a
     **holding page** — `503`, `Retry-After`, an HTML page that reloads for a browser and a JSON body for anything else — and the next request
     reaches the app;
   - **a wake that fails** (a member never healthy): the started members stopped again, the rows `waking → hibernated` — **a new transition,
     `wake_abandoned`, the `⇄` §11 already draws** — the services stopped, the route left at the waker, **an Incident**, no
     `environment.woken`; for `MANIFEST_WAKE_FAILURE_COOLDOWN_SECONDS` (default 300) the waker answers the holding page with the failure's
     words, and only then does a request try once more — never a loop.
6. **WHAT WAKES IT, AND WHAT DOES NOT**:
   - **a request through the edge** wakes it;
   - **the term beginning** wakes it (Rich, *"Wake them at term start"*): each sweep, while `now` is in a term, every asleep `class`
     production environment is woken through the same queue and cap, `cause: 'term'` — so within one sweep (5 minutes) of a term's first
     day beginning in Vancouver, or of a boot in term;
   - **a deploy** wakes it — it starts a new set anyway, and the services first, and clears `slept_at`; **a deploy that FAILS leaves it
     asleep** (the review's I7): the rollback re-applies `routeToWaker` (the previous serving set is empty, so `restoreRoute` has nothing to
     restore), the failed members are destroyed — A1's `destroyInstance` leaves a route it is not in untouched — the services it started are
     stopped again, and the asleep set is untouched;
   - **D21's and B's rehearsals** wake staging or production as a deploy does;
   - **an archive does not** (it ends the app; a hibernated app is archived asleep, its stopped instances retired);
   - **the boot leaves an asleep environment asleep**: pass 1 routes it to the waker and finishes a hibernation left mid-way; **pass 1½**,
     before pass 2 can fail them, stops again every `waking` member of an environment with `slept_at` set and returns it `waking →
     hibernated` (the review's I5).
7. **THE TERMS SETTING** — `MANIFEST_TERMS`, `name:YYYY-MM-DD..YYYY-MM-DD` entries separated by commas, each a closed range in Vancouver's
   calendar; refused `CONFIG_INVALID` naming the entry (a bad date, an end before a start, an overlap); read at boot like every platform
   setting; `GET /v1/platform/terms` answers them to an administrator. **None set: a `class` app never hibernates.**
8. **PRE-WARMING IS NOT BUILT** (Rich), named in *What this plan does not build* with his reason; **Task 1's cold wake comes back to him if
   it is more than a few seconds.**
9. **TWO EVENTS** — `environment.hibernated` `{ environmentId, kind, idleMinutes, instances }` and `environment.woken` `{ environmentId,
   kind, wakeMs, cause: 'request' | 'term' | 'deploy' | 'rehearsal' }` — never a requester's address. A failed wake is its Incident.
10. **AN ASLEEP STAGING STILL HAS ITS CANDIDATE** (found by this revision): `launch/candidate.ts`'s *"healthy, or it is not serving"*
    becomes *"healthy — or `hibernated` in an environment whose `slept_at` is set, which serves that release the moment anyone asks"*, so the
    checklist, the production deploy's *"only the release serving staging"* and B's grant read the release staging last served. A
    `failed` instance is still never a candidate.
11. **THE OTHER JOBS LEAVE AN ASLEEP ENVIRONMENT ALONE**: A1's set watcher skips an environment with `slept_at` set (one condition in
    `releases/watch.ts`, beside its `hibernated` status rule); the retirer's *"empty serving set → skip"* already does.

---

## Global Constraints

- **The four gates, clean before every commit**; `pnpm test` twice on a sitting's final tree; never `--filter`.
- **`pnpm test:docker`** is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`,
  `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `source/`, `mail/`, `infra/`, or a
  `*.docker.test.ts` — in the background, never beside a Vitest run; then restart the control plane, the three cleanup scripts, `make verify`.
- **A hibernated app must never lose data**: a test stops and wakes an app with rows in its Mongo and reads them back, at every sitting
  that touches hibernate or wake.
- **No commit puts an app to sleep that the platform cannot wake, keep asleep across a boot, deploy, or launch**: the sweep is bound at
  boot only in Task 6, after Task 4's waker and with Task 6's boot passes, deploys and candidate. **A sitting before it leaves nothing
  asleep at its close** (a scratch hibernation is woken again).
- **Never touch the running edge to measure**: S4 uses a throwaway Caddy from the edge's image, throwaway apps, and a stand-in waker on
  the host. **An edge configuration change** (`[M3]`'s per-host metrics, if the edge's build needs one) **is applied at a sitting that
  says so, by restarting the edge — which drops every runtime route — and then the control plane, whose boot re-applies them** (ORIENTATION
  §4 trap 19).
- **Time is the database's** for every idle comparison (ORIENTATION §4 trap 14: the database's clock is not the host's).
- **One file**: `pnpm exec vitest run --project unit src/<path>`. **Never two Vitest processes.** **A route change is four commands; a
  migration is generate, read, apply; the `audit.events` CHECK migration is CUMULATIVE** — every type the latest migration lists (A1's and
  B's among them), plus this plan's two.
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
   Owned by Task 4 and Task 6.
3. **An app put to sleep under someone.** A request arriving while the sweep hibernates; a long-held WebSocket through an otherwise idle
   app. Expected: **the route goes to the waker BEFORE any container stops, and each member drains before it stops**, so no request reaches
   a stopped container and none in flight is cut; a held stream counts as activity and the app is not idle. Owned by Task 2 (the sampler)
   and Task 5.
4. **The policy, wrong at its edges.** A `class` app on a term's first and last day, between terms, with no terms set; a `large_course` app
   idle for a month. Expected: **asleep only between terms, never with none set; woken at a term's start; a large app never.** Owned by
   Task 2 and Task 5.
5. **A boot that wakes everything, or loses an asleep app.** The control plane restarted with two asleep environments, one left mid-wake and
   one left mid-hibernation. Expected: **the two stay asleep, routed to the waker; the mid-wake one is put back to sleep before pass 2 can
   fail it; the mid-hibernation one is finished — never left with a route to a stopped container.** Owned by Task 6.
6. **A wake that cannot finish.** The release that served it now fails its health check on wake. Expected: **the environment stays asleep
   (routed to the waker), an Incident is opened, `environment.woken` is not published, and the waker answers the holding page with the
   failure's words for the cooldown** rather than looping. Owned by Task 4.
7. **A probe or a stranger that wakes everything.** The edge's own health checks; a request to the waker's port from the host without the
   secret; a client sending its own `X-Manifest-Waker`. Expected: **no probe ever reaches the waker; the secretless request is `403` and
   wakes nothing; the client's header is overwritten by the route's.** Owned by Task 3 (the route) and Task 4 (the waker).
8. **A deploy that fails while the app sleeps.** Expected: **the hostname still reaches the waker — never the edge's wildcard — the asleep
   set is untouched, and the services are stopped again.** Owned by Task 6.

---

## File Structure

```
packages/control-plane/src/hibernation/                 NEW module (T2, T4–T6), reached through its index.ts
  policy.ts                   idlePolicyFor(kind, audience, terms, now, settings)
  terms.ts                    parseTerms(raw), inTerm(terms, now) — MANIFEST_TERMS
  idle.ts                     the sampler (T2): counters and gauges → last_request_at; the sweep (T5): hibernate, and wake at term start
  hibernate.ts                hibernateEnvironment(deps, environmentId) (T5)
  wake.ts                     wakeEnvironment(deps, environmentId, cause) — the join, the cap, the queue, the cooldown (T4)
  waker.ts                    the waker's listener, its secret, S4's mechanism (T4)
  index.ts, testing.ts
packages/control-plane/src/runtime/driver.ts, fake-driver.ts, driver-contract.ts, docker/driver.ts, docker/services.ts   MOD (T3) stopService, routeToWaker, wakeInstances
packages/control-plane/src/runtime/state-machine.ts     MOD (T2) IDLE_POLICY replaced; (T4) waking → hibernated on wake_abandoned
packages/control-plane/src/routing/caddy.ts, routes.ts  MOD (T3) the waker's route; (T2) the counters
packages/control-plane/src/db/locks.ts                  MOD (T5) tryWithEnvironmentLock
packages/control-plane/src/releases/release.ts, recover.ts, lifecycle.ts, watch.ts   MOD (T6) a deploy to an asleep environment, its failure; passes 1 and 1½; A1's watcher skips asleep
packages/control-plane/src/launch/candidate.ts, launch/rehearsal.ts, launch/load.ts   MOD (T6) an asleep staging's candidate; rehearsals wake
packages/control-plane/src/db/schema.ts + drizzle/      MOD (T2, T5) environments.last_request_at, slept_at; the events CHECK (T4, T5)
packages/control-plane/src/config.ts                    MOD (T2, T4) MANIFEST_TERMS, the thresholds; the waker's port, MANIFEST_WAKE_CONCURRENCY, _QUEUE, _FAILURE_COOLDOWN_SECONDS
packages/control-plane/src/index.ts                     MOD (T4) the waker's listener; (T6) the sweep's schedule
infra/caddy/Caddyfile                                   MOD (T2) per-host metrics — ONLY if [M3] says the edge needs it
packages/control-plane/src/api/                         MOD (T4–T6) the events; Environment.asleep; GET /v1/platform/terms; 1.10.0
packages/console/src/, packages/mock/src/, docs/api/, blueprints/node-ts-mongo/agents/AGENTS.md   MOD (T7)
packages/journey/src/hibernate.ts, scripts/demo-hibernate.sh, Makefile   NEW (T8)
docs/superpowers/spikes/S4-findings.md                  NEW (T1) — S4's answer, its first sentence
```

---

## Task 1: S4 — can the edge hold a request while the control plane wakes an app? And the measurements.

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/S4-findings.md` — **its first sentence is
the answer**, as every spike's is (ORIENTATION §5) — and `results-task1-<date>.txt`.

- [ ] **Step 1: `[M1]` Re-read every fact at HEAD** (after A1 and B): the driver's set and A1's `destroyInstance`, the route and its
  health parameter, `stopInstance`, the services' verbs, `IDLE_POLICY`'s callers (none), the retirer's scheduling and A1's watcher,
  `recover.ts`'s passes, `db/locks.ts`, `launch/candidate.ts`, B's `running` row; **which port in 7100–7199 is free for the waker** (7113
  if it is); and whether anything else listens on `host.docker.internal`'s way to the host.
- [ ] **Step 2: `[M2]` A real cold wake.** A `node-ts-mongo` app (the proof app) with rows in its Mongo, its instance and its Mongo
  stopped as Decision 4 would stop them; then started in order, timed: Mongo ready, the app's health path `200`, the first page through a
  throwaway route. Five times; record each, and the rows read back. **If the median is more than a few seconds, it goes to Rich with the
  number** (pre-warming, his word).
- [ ] **Step 3: `[M3]` Idle at the edge**, in a throwaway Caddy from the edge's image: whether its build serves per-host request counters
  (Caddy's metrics with per-host labels), what enabling them takes (a global option in the Caddyfile — then a restart of the real edge at
  Task 2's sitting), the counter per host and the cost of reading it, and **that the counter restarts from zero when Caddy restarts**; and
  the admin API's per-upstream `num_requests` with a WebSocket held — the gauge that shows it. Record the exact reads Task 2 makes.
- [ ] **Step 4: `[M4]` S4 itself**, in the throwaway Caddy, with **a stand-in waker — a 30-line Node server — running ON THE HOST on
  `127.0.0.1`, reached by the throwaway at `host.docker.internal`**, exactly as the real waker will be (a stand-in in a container on the
  throwaway's network would pass for a reason the real one does not share: the host cannot reach a container's address). The asleep app's
  two containers are stopped on the throwaway's network. Measure, at Step 2's wake times and at 30 s, what a browser (headless Chrome) and
  `curl` see for each:
  - **(a1) held, Caddy proxies after the waker's answer**: the route `reverse_proxy`s to the waker, which starts the app and answers only
    once it is healthy, with a header Caddy's `handle_response` matches to `reverse_proxy` to the woken containers' dial addresses — record
    the JSON, and **whether a `POST`'s body survives** (Caddy's request buffering) or held applies to `GET` and `HEAD` alone;
  - **(a2) held, a hairpin**: the waker, once the app is healthy, sends the request back through the throwaway edge — record that the app
    then sees the HOST as its client, and that every held request counts against the host's per-IP bucket;
  - **(b) a holding page**: the waker answers `503` with `Retry-After` and a reloading page — record what a browser shows and when it
    reaches the app;
  - and `lb_try_duration` alone: record that it cannot start a wake (nothing asks the waker), so it is only ever part of (a1).
  **And two waker routes, two hostnames, ONE dial address** (the review's C1): one answering holding pages over and over; record that the
  other is still proxied, with the waker route's health policy `'none'`.
  **S4's answer** is the mechanism that serves a browser's first request without an error at Step 2's wake time — and, if none does
  without a choice of what a person sees, **it stops and asks Rich before sitting 3**.
- [ ] **Step 5: `[M5]` The gate numbers**, the contract's version, and `pnpm test` once.
- [ ] **Step 6: Commit** the spike record by name, and the roadmap's spike ledger's S4 row in the sitting's close.
  ```bash
  git commit -m "docs(S4): wake-on-request — <the answer>; a cold wake measured, idle measured at the edge"
  ```

---

## Task 2: Idle, the policy, and the terms

**Sitting 2. Spec action B and Spec action A's item 1 decided first.** Decisions 2, 3, 7. **Its callers are Task 5's sweep (the policy, the
sampler) and the boot (the terms).**

**Files:** `hibernation/policy.ts`, `terms.ts`, `idle.ts` (the sampler half), their tests; `runtime/state-machine.ts` (`IDLE_POLICY`
removed, its test moved to `policy.test.ts`); `config.ts` (`MANIFEST_TERMS`, `MANIFEST_HIBERNATE_SOLO_HOURS` default 24,
`MANIFEST_HIBERNATE_STAGING_DAYS` default 7); `routing/` (the counters' read, `[M3]`'s); `db/schema.ts` (`environments.last_request_at`,
`slept_at`); the migration; `infra/caddy/Caddyfile` only if `[M3]` says the edge needs per-host metrics enabled — then the real edge is
restarted at this sitting, and the control plane after it.

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

  // hibernation/idle.ts
  /** One sample: each hostname's counter, and each upstream's in-flight gauge. */
  export interface EdgeSample { counters: Record<string, number>; inFlight: Record<string, number> }
  /** Which environments were active since `previous`: a counter that moved OR went down, or any member with a request in flight. */
  export function activeSince(previous: EdgeSample | undefined, current: EdgeSample, members: Record<string, string[]>): Set<string>
  ```

- [ ] **Step 1: The failing tests** (Review Focus 4): every row of Decision 2's table; a `class` app on a term's first day, last day, the day
  after, and with no terms; `parseTerms`: a valid list, a bad date, an end before a start, an overlap, an empty string (no terms) — each
  refusal naming the entry; `inTerm` at a clock change (Vancouver's November). **The sampler** (Review Focus 3's half): a counter that
  moves → active; one that does not, with nothing in flight → idle; **a counter that went DOWN → active**; **a counter unchanged with a
  member's `num_requests` at 1 → active** (a held stream).
- [ ] **Step 2–3: Run, predict, implement, migrate.** **Step 4: Commit**, then the **negative controls**: (a) read `class` as `solo`.
  Predict red: the in-term rows only. (b) Read the counter alone. Predict red: the held-stream row only. (c) Treat a counter that went down
  as idle. Predict red: the edge-restart row only.
  ```bash
  git commit -m "feat(hibernation): which app may sleep, and when — the audience, the terms an administrator sets, and idleness measured at the edge"
  ```

---

## Task 3: The driver's three verbs — a service stopped, a route to the waker, a set woken

**Sitting 2, after Task 2. Spec action C decided first.** Decisions 4 and 5's mechanics. **Its callers are Task 4's wake and Task 5's
hibernate.**

**Files:** `runtime/driver.ts` (the three verbs and their doc comments); `runtime/fake-driver.ts`; `runtime/driver-contract.ts` (the cases
both drivers pass); `runtime/docker/services.ts` (`stopServiceContainer`: a stop, the volume kept — `ensureService` already starts it
again); `runtime/docker/driver.ts` (`routeToWaker`: the hostname's route re-applied — the same `@id`, its rate limit, its headers — to ONE
upstream, the waker's address the driver was constructed with, with A1's `health: 'none'`, the header the literal `waker`, and the request
headers `X-Manifest-Waker` (the boot's secret) and `X-Manifest-Waker-Environment` SET — and, if S4 answered *held by Caddy* (a1), the
`handle_response` that proxies to the asleep set's own dial addresses, read from the route before it is re-pointed, once the waker says so;
`wakeInstances`: each container started — its
hibernated marker removed, as a start already does — proved privately ready from inside the edge as `ensureInstances` proves a new one,
then the route moved in one change to exactly those ids, resolving once the hostname reaches each by identity; if any is not ready, each is
stopped again with its marker, the route is left at the waker, and the error carries every handle); `routing/caddy.ts` (`buildRoute`'s
identity: from the upstream, or a static value); the Docker cases.

**Interfaces:**
- Produces:

  ```ts
  // runtime/driver.ts
  export interface Driver {
    // …A1's set, B's setRateLimitExemption, and:
    /** Stop a service, keeping its data. `ensureService` starts it again and waits for it. Idempotent. */
    stopService(id: string): Promise<void>
    /**
     * Point a hostname at the platform's waker: one upstream, no health checks, the header naming the waker, and the waker's secret
     * and this environment's id set on every request — a client's own values for either overwritten. Idempotent.
     */
    routeToWaker(hostname: string, environmentId: string): Promise<void>
    /**
     * Start a stopped set again, prove each privately, and move the hostname's route to exactly these in ONE change, resolving once the
     * hostname is shown to reach each by its identity. If any is not ready, every one is stopped again and the route is left as it was;
     * `InstancesNotReadyError` carries every handle.
     */
    wakeInstances(ids: readonly string[]): Promise<void>
  }
  ```

- [ ] **Step 1: The failing tests — the driver contract, both drivers**: a service stopped and `ensureService`d again keeps its data
  (rows written before, read after); a set of two routed to the waker, then woken — both identities seen, the header never `waker` after;
  **a set one of whose members cannot start leaves the route at the waker and both stopped**; `routeToWaker` twice is one route.
  **The Docker cases**: the waker's route has no `health_checks` and no `try_duration` (A1's `'none'`), its header is `waker`, and **a
  client's own `X-Manifest-Waker` arrives at a stand-in waker REPLACED by the route's** (Review Focus 7); **destroying a never-routed
  instance leaves the waker's route as it was** (A1's semantics, which Task 6's failed deploy relies on).
- [ ] **Step 2: Run, and predict. Step 3: Implement**, both drivers.
- [ ] **Step 4: Through the edge, on driver 1**: a staging app's set stopped (`stopInstance`, `stopService`), routed to a stand-in waker on
  the host, then woken with `wakeInstances` after `ensureService` — its rows read back, the times quoted.
- [ ] **Step 5: Commit**, then the **negative controls**: (a) let `routeToWaker` use A1's app health policy. Predict red: the
  no-`health_checks` row only. (b) `add` the secret header instead of `set`. Predict red: the client's-own-header row only.
  ```bash
  git commit -m "feat(runtime): the driver stops a service, routes a hostname to the waker, and wakes a stopped set in one route change"
  ```

---

## Task 4: Waking — the waker, its secret, its limits, and S4's mechanism

**Sitting 3. Spec action A's item 2 — written from S4's answer — decided first.** Decision 5. **Contract `1.10.0`.** **Its callers are the
edge (the waker's listener, bound at boot in `src/index.ts`) and Task 5's term-start wake and Task 6's deploys.**

**Files:** `hibernation/wake.ts` (`wakeEnvironment(deps, environmentId, cause)` — the per-environment join, the global cap, the bounded
queue, the failure cooldown; the services (`ensureService`), then `wakeInstances` over the asleep set; the rows and `slept_at` in one
transaction; the event; on failure, the environment left asleep and an Incident); `hibernation/waker.ts` (the listener on its own port —
the secret checked first, the environment from its header, a marked probe answered `204`; S4's mechanism: held, or the holding page);
`runtime/state-machine.ts` (`waking: { wake_abandoned: 'hibernated' }`, and its drift test); `config.ts` (the waker's port,
`MANIFEST_WAKE_CONCURRENCY`, `MANIFEST_WAKE_QUEUE`, `MANIFEST_WAKE_FAILURE_COOLDOWN_SECONDS`, the held request's bound);
`observability/` (`environment.woken`; the CHECK migration, cumulative); `src/index.ts` (the secret made at boot, the listener, the
driver given the waker's address and secret); `api/contract/document.ts` (`1.10.0`) and the four contract commands; their tests and a
Docker case.

- [ ] **Step 1: The failing tests** (Review Focus 1, 2, 6, 7): 200 requests in a second → one wake, every request joined; twenty apps →
  at most the cap running, the rest queued, the overflow `503` with `Retry-After`; **a request without the secret → `403`, nothing woken**;
  a marked probe → `204`, nothing woken; the woken app serves the newest release and its rows; **a release that fails on wake → its rows
  `waking → hibernated` (`wake_abandoned`), the route at the waker, an Incident, no `environment.woken`, and the holding page with the
  failure's words until the cooldown ends — the next request after it tries once more**; **the Docker case**: a set the verbs put to sleep,
  a browser-shaped request through the real edge → the app's page, by S4's mechanism, timed.
- [ ] **Step 2–3: Run, predict, implement**, the migration, the contract commands. **Tell the front-end before the commit**: `1.10.0`;
  `environment.woken`; what a first visitor sees.
- [ ] **Step 4: Through the edge**: wake an asleep staging app from the host with `curl` and headless Chrome; quote the times. **Nothing
  is left asleep at the sitting's close**: the boot does not yet route an asleep app to the waker with a new secret (Task 6).
- [ ] **Step 5: Commit**, then the **negative controls**: (a) remove the per-environment join. Predict red: the *one wake* row (two starts).
  (b) Raise the cap to unbounded. Predict red: the twenty-apps row only. (c) Skip the secret's check. Predict red: the `403` row only.
  ```bash
  git commit -m "feat(hibernation): a request wakes a sleeping app — the edge known by its secret, joined, capped and queued, and served once it is healthy (contract 1.10.0)"
  ```

---

## Task 5: Hibernating an environment — the sweep, and the term's first day

**Sitting 4.** Decisions 4 and 6's term-start wake. **Its caller is the sweep (`idle.ts`), which Task 6 binds at boot beside the retirer and
A1's watcher**; until then the tests and a scratch script call it, and nothing sleeps on its own.

**Files:** `hibernation/hibernate.ts`; `idle.ts` (the sweep: every 5 minutes, the sample and `last_request_at`; every environment whose
policy and `last_request_at` say so, one at a time, by `tryWithEnvironmentLock`, skipping one B's run holds; **and, while in term, every
asleep `class` production environment woken, `cause: 'term'`**); `db/locks.ts` (`tryWithEnvironmentLock`, `withEnvironmentLock`'s key, on
the lock pool); `observability/` (`environment.hibernated`, its sentence and example; the CHECK migration, cumulative); the four contract
commands (still `1.10.0`) and the mock's event example; their tests and a Docker case.

- [ ] **Step 1: The failing tests**: a staging app idle past its threshold → **`slept_at` and the event row written in one transaction
  FIRST**, then the route to the waker, then each member drained, then its set and its service stopped (a recorded order — Review Focus
  3); **a crash injected after the transaction leaves `slept_at` set and the route at the waker or not yet moved** — what Task 6's pass 1
  finishes; a member with a request in flight is drained
  before it stops; a production `large_course` app idle a month → untouched; **an environment whose lock is held → skipped this round, not
  waited for**; an environment B's run holds → skipped; an asleep one → skipped; **a `class` app asleep when a term begins → woken by the
  next sweep, `cause: 'term'`**; **the Docker case**: rows written, hibernated, the containers `exited` with their markers, and nothing
  reachable but the waker.
- [ ] **Step 2–3: Run, predict, implement**, the migration, the contract commands. **Tell the front-end before the commit**:
  `environment.hibernated`. **Step 4: Commit**, then the **negative controls**: (a) stop the containers before re-pointing the route.
  Predict red: the order assertion — and, in the Docker case, a request in the window reaching a stopped container (`502`), which is what makes the control
  visible; give the case a request loop. (b) Write `slept_at` after the stop. Predict red: the crash-after-the-transaction row only. The sitting ends with nothing asleep.
  ```bash
  git commit -m "feat(hibernation): how an idle environment sleeps — its intent recorded, its route to the waker first, then its instances and its database; a term's first day wakes its classes"
  ```

---

## Task 6: What wakes and what does not — deploys, a failed deploy, archives, rehearsals, the candidate, the boot — and the sweep bound

**Sitting 5.** Decisions 6, 10 and 11. **This task's commit is the first at which an app sleeps on its own**: it binds Task 5's sweep at
boot (`src/index.ts`, beside the retirer and A1's watcher) in the same commit as everything that keeps an asleep app asleep and
launchable — so no commit before it can leave an app asleep where a boot, a deploy or the checklist would mistreat it.

**Files:** `releases/release.ts` (a deploy to an asleep environment starts its services first and clears `slept_at`, `environment.woken`
with `cause: 'deploy'`; **a failed one re-applies `routeToWaker`, stops the services again and leaves `slept_at` set**);
`releases/lifecycle.ts` (an archive of an asleep environment needs no stop); `launch/rehearsal.ts` and B's `launch/load.ts` (each wakes as
a deploy); `releases/recover.ts` (**pass 1**: an asleep environment routed to the waker and a hibernation left mid-way finished; **pass
1½**: every `waking` member of an asleep environment stopped again and returned `waking → hibernated`, before pass 2); `releases/watch.ts`
(A1's watcher skips an asleep environment); **`launch/candidate.ts`** (Decision 10); `api/representations/environments.ts` (`asleep`,
`sleptAt`), `GET /v1/platform/terms`; the contract commands; the mock; **`src/index.ts` — the sweep's schedule**.

- [ ] **Step 1: The failing tests** (Review Focus 2, 5, 8): a deploy to an asleep environment → served, awake; **a deploy to an asleep
  environment that FAILS → the hostname still reaches the waker (not the wildcard), the asleep set untouched, the services stopped, `slept_at`
  set**; an archive of an asleep one → archived, nothing started; **a boot with two asleep, one mid-wake (rows `waking`) and one
  mid-hibernation (`slept_at` set, a member running) → all routed to the waker, the mid-wake one's rows `hibernated` and its containers
  stopped BEFORE pass 2 runs, the mid-hibernation one's member stopped**; **an asleep staging's release is the candidate**, and a `failed`
  one is still not; A1's watcher records no exit for an asleep environment; the representation's `asleep`; **the boot binds the sweep
  after recovery's pass 3** (the order a boot test reads). **The failed deploy is TWO rows**: (i) a set that never becomes ready — the
  route never left the waker, so it is still there; (ii) **a set that becomes ready, takes the route, and then fails its health wait** —
  the rollback must put the waker back, because the previous serving set is empty.
- [ ] **Step 2–3. Tell the front-end before the commit**: `asleep`, `sleptAt`; the terms. **Step 4: Commit**, then the **negative
  controls**: (a) restore an asleep environment's route to its (stopped) set at boot. Predict red: the boot row, and in the Docker tier a
  `502`. (b) Run pass 1½ after pass 2. Predict red: the mid-wake row — its rows `failed`. (c) Let the failed deploy's rollback call
  `restoreRoute([])`. Predict red: failed-deploy row (ii) only — row (i) never reaches the rollback's route step, so it stays green; say
  so.
  ```bash
  git commit -m "feat(releases): a deploy wakes a sleeping app and a failed one leaves it asleep; an archive leaves it asleep, and a boot keeps it so"
  ```

---

## Task 7: The clients — *asleep* on screen, the mock, the guides

**Sitting 5, after Task 6.**

**Files:** the console's project and fleet screens (*Asleep since <day>*; a large app never shows it); the mock (`MANIFEST_MOCK_ASLEEP`);
`docs/api/` (a section on sleeping apps: what sleeps, what wakes it — a request, a deploy, a term's first day — what a first visitor sees,
the terms; `events.md`); `blueprints/node-ts-mongo/agents/AGENTS.md` (*"An app that nobody uses may sleep; its first visitor wakes it, in
about <S4's time>. Keep nothing in memory you cannot lose."*).

- [ ] **Step 1–3**: the tests, run, implement, `pnpm docs:write`. **Tell the front-end before the commit.** **Step 4: Commit**, then the
  **negative control**: show *asleep* for a `large_course` app. Predict red: the console's *never for a large app* row.
  ```bash
  git commit -m "feat(console,mock): a sleeping app says so; the guides say what wakes it"
  ```

---

## Task 8: The acceptance — `make demo-hibernate`, and a person clicking it

**Sitting 6. Alone, and last.**

**Files:** `packages/journey/src/hibernate.ts`, `scripts/demo-hibernate.sh`, `Makefile`; `scripts/ci-acceptance.sh` and
`offline-acceptance.sh` (a step).

**The settings are boot-time** (Decision 7; the review's I11): the demo shortens the thresholds and sets `MANIFEST_TERMS` for its own run,
which means **restarting the control plane — RUNBOOK's export block plus its overrides — and that signs everybody out** (ORIENTATION §4
trap 19). So it **says so before it starts**, refuses to start while another session is using 7100 unless told to, and **restores the
operator's own settings and restarts the control plane on EVERY exit path** (`trap … EXIT INT TERM`, a failure and a `^C` included),
reading back afterwards that the running control plane has the operator's values. Each restart is a phase boundary the demo names.

- [ ] **Step 1: The phases**, each ending `every check passed`, on either driver: a staging app with rows → idle → **asleep** (its route to
  the waker, its containers stopped, the event); a request through the edge → **woken**, by S4's mechanism, in the measured time, its rows
  intact; a burst of 100 requests at an asleep app → one wake (Review Focus 1); a request without the secret at the waker's port → `403`;
  a `class` production app asleep only with no current term, **woken by the sweep when a term that begins today is set**, and awake
  through a term; a `large_course` app (from B's demo) never asleep; a deploy to an asleep app; a boot with an app asleep.
- [ ] **Step 2: Green three times on each driver**, every other demo — **`make demo-redeploy`, `make demo-capacity` and `make demo-load` above
  all** — and `make ci-acceptance`; the offline acceptance named to Rich as owed; **after each run, the control plane's settings read back
  as the operator's**.
- [ ] **Step 3: The negative controls**, one per Review Focus line. **Step 4: The clicked half.** **Step 5: The plan's one whole-branch
  review**; one fix wave. **Step 6: Close out**: the ledger and its spike table (S4 answered), §7e (FE-32's plan next), §5 (S4's line), the
  front-end told.

---

## What this plan does not build

- **Pre-warming** ahead of a `synchronised` window an owner declares (§24) — Rich, *"Record it as not built"*: under §24's own table only
  `solo` apps and `class` apps between terms can be cold at a burst, where a cold wake costs least. Task 1 measures it; more than a few
  seconds comes back to him.
- **The sandbox's lifetime** — §11's *"destroyed after 45 min idle"*, and §24's *"Sandbox and staging … hibernates when idle"* for a
  sandbox — ending or sleeping an agent's working environment is a decision of its own, not asked. A sandbox stays as it is today.
- **A term calendar from UBC's Academic API** (FE-20) — the setting is administrator-kept until then.
- **The rest of §24's table**: backups, saturation alerting, tuned rate limits, `public`'s security review.
- **An owner choosing to hibernate a production app** (§11's *"hibernate opt-in"*) beyond what §24's row says.
- **Changing a setting without a restart** — the terms, the thresholds and the wake limits are boot-time configuration, as every
  platform setting is today.

---

## Spec actions — DRAFTED, NONE APPLIED

*§11's interface is changed by four plans, read in order: A1's A, then B's C, then this plan's C, then FE-32's A. §24 gains words from
three: A1's B and then this plan's B after its table, and B's A in *Sandbox and staging ignore all of it*. §26's settings sentence gains words from three: B's B, then this plan's B, then FE-32's C.*

### A. §11 — production's lifetime by audience (item 1, before sitting 2), and wake-on-request as S4 answered it (item 2, after Task 1, before sitting 3)

**Proposed.**
1. **§11, *Lifetime policies*** — *built by Task 2, so decided before sitting 2* — production's lifetime *"always-on (hibernate opt-in)"* ⟶
   *"by audience (§24): `solo` hibernated after 24 hours idle; `class` after 24 hours idle, outside term, and woken when a term begins;
   `large_course` and `public` never"*.
2. **§11, *Hibernation and wake-on-request*** — *written from S4's answer, decided before sitting 3* — *"The exact mechanism is S4's
   question, not a settled design: …the spike decides it."* ⟶ *"**S4 answered it (2026-10-xx): <the mechanism>** — a cold wake of an app and
   its database measured at <n> s. Idle is measured at the edge, from its request counts and the requests it holds open. An environment's
   route goes to the waker before anything stops, and each instance drains first; the same instances are started again and the route comes
   back to them in one change once each is healthy. Wake is joined per app and capped, with a queue (§20), and only the edge — known by a
   secret it sets — can ask for one."*

*Shared pages:* `manifest-phases.html` (S4's line), `manifest-schematic.html` (if it describes an app sleeping) — check.

### B. §24 and §26 — term dates as a platform setting (before sitting 2)

**Proposed.**
1. **§24**, after the table — after A1's sentence on instances (its Spec action B): *"**A term is an administrator's setting**
   (§26): the platform's list of term dates, kept current each year from UBC's published calendar. A `class` app hibernates only outside
   every listed term, and is woken when a term begins; with none listed it never hibernates. (UBC's Academic API can be its source later.)"*
2. **§26, *Platform settings***, after B's sentence: *"And the term dates (§24), how long an app is idle before it sleeps, and how many
   apps may wake at once (§11, §20)."* — like every platform setting today, deployment configuration read at boot, so a change is not yet
   audited with its actor (the gap B's Spec action B names).

*Shared pages:* `manifest-decisions.html` D29 — check.

### C. §11 — the driver stops a service, routes a hostname to the waker, and wakes a stopped set (before sitting 2)

**Why.** The review's I3: hibernating and waking need three things §11's interface does not have — `destroyService` is the only way a
service ends, `switchOff` is the archive's page, and nothing starts a stopped instance (A1's `ensureInstances` restarts one only from an identical
spec, which nothing keeps).

**Proposed.** In the `Driver` interface, after B's `setRateLimitExemption`:
- `stopService(id: string): Promise<void>        // hibernate — data survives; ensureService starts it again`
- `routeToWaker(hostname: string, environmentId: string): Promise<void>   // the hostname answered by the platform's waker`
- `wakeInstances(ids: string[]): Promise<void>  // start a stopped set, prove each, route it in one change`

and in *Hibernation and wake-on-request*, with Spec action A's item 2: *"A hibernated environment keeps its instances, stopped; waking
starts those same instances again — `hibernated ⇄ waking` in the state machine above — and a wake that cannot finish puts them back to
sleep."*

*Shared pages:* `manifest-schematic.html` — check; likely unchanged.

---

## What the self-review caught

1. **§11 leaves the wake mechanism to a spike that never ran** (S4, deferred). A plan that chose one by reading would have built what the spec
   says only a measurement may decide; Task 1 is S4, and Spec action A is written from its answer.
2. **A sweep that stopped containers before moving the route** would have answered `502` to the request that arrived in between — Decision 4's
   order, Review Focus 3, and a negative control given a request loop so it can fail.
3. **A boot restoring an asleep environment's route to its stopped instances** — A1's recovery restores every Route row's set; Task 6 makes an
   asleep one go to the waker.
4. **`IDLE_POLICY` was a table nothing read** — replaced, not left beside the new policy as a second statement.
5. **(The revision's own.) An asleep staging would have had no candidate** — `launch/candidate.ts:49-50` accepts only `healthy` — so a
   project whose staging slept could not launch, be rehearsed, or deploy production at all. Decision 10; Task 6.
6. **(The revision's own.) The sweep could have put an app to sleep before anything could wake it** — the first order built hibernating
   (sitting 2) a sitting before waking (sitting 3), and a staging app idle seven days on this laptop would have slept for good between them.
   Waking is now Task 4, and the sweep is bound at boot only in Task 6 — with the boot's passes, the deploys and the candidate, after the
   consistency check of the revision found that binding it in Task 5 would have let a restart between sittings 4 and 5 route an asleep app
   to its stopped containers.

---

## Revised to the review — what changed, finding by finding (2026-10-03)

*The review is [`2026-10-03-review-of-four-plans.md`](./2026-10-03-review-of-four-plans.md), §3 and *Cross-plan*. Its verdict on this plan:
needs rework (C1, C2, I3–I7). Each finding was checked against the code at `75030d8` before it was built in.*

| Finding | What it said | Where it went |
|---|---|---|
| **C1** | A1's route breaks the waker route: probes wake everything; one app's holding pages eject the shared waker | The waker's route passes A1's `health: 'none'`, its header is `waker`, a marked probe is `204`; `[M4]` measures two waker routes on one address (Decision 5, Tasks 1, 3, 4; Review Focus 7) |
| **C2** | *"Held"* cannot work as written; a stand-in in a container would pass for the wrong reason | The stand-in runs ON THE HOST at `host.docker.internal`; held is measured as (a1) Caddy's `handle_response` and (a2) a hairpin with its costs, beside (b) the holding page (Task 1, Decision 5) |
| **I3** | New Driver verbs, and no spec action | `stopService`, `routeToWaker`, `wakeInstances` (Task 3); **Spec action C** drafted |
| **I4** | *"Wake"* is ambiguous | The same instances, started again (`wakeInstances`); a fresh deploy rejected with its costs (Decision 5) |
| **I5** | Boot pass 2 fails `waking` rows before the plan can act | Pass 1½ before pass 2, and `waking → hibernated` on `wake_abandoned`, the `⇄` §11 draws (Decision 6, Task 6, its control (b)) |
| **I6** | A crash mid-hibernation leaves broken routes | The intent and the event row in one transaction FIRST, then route, drain, stop; pass 1 finishes it (Decision 4, Task 5's control (b)) |
| **I7** | A failed deploy to an asleep environment loses its route | The rollback re-applies `routeToWaker`; A1's `destroyInstance` leaves a route it is not in untouched (Decision 6, Task 6's control (c), Review Focus 8) |
| **I8** | Class apps are cold at the start of term | **Rich: *"Wake them at term start"*** — the sweep wakes asleep `class` production apps while in term (Decision 6, Task 5) |
| **I9** | The waker cannot tell the edge by its address | A secret the route SETS, made at boot, never logged; a secretless request `403` (Decision 5, Tasks 3 and 4) |
| **I10** | Idle needs both signals; a counter resets with the edge | Counters AND the in-flight gauge; a counter that went down is activity (Decision 3, Task 2's controls (b) and (c)) |
| **I11** | The acceptance changes boot-time settings | Said before it starts; restored on every exit path by a `trap`, read back after (Task 8) |
| Minor: Spec action A's timing | Item 1 built in sitting 2, decided before sitting 3 | Item 1 before sitting 2, item 2 before sitting 3 |
| Minor: a false claim | B's run does not hold the lock | B's `running` row is what the sweep checks (Decision 4) |
| Minor: a try-lock | `withEnvironmentLock` blocks; `db/locks.ts` not in Files | `tryWithEnvironmentLock` (Task 5) |
| Minor: sandboxes | §24 says they hibernate | Named as not built |
| Minor: wrong counts | `IDLE_POLICY`'s lines; four plans before this one | `:97-109`; four |
| Minor: held streams | Hibernating does not drain | Each member drained, bounded at 120 s (Decision 4) |
| Cross-plan 1, 3, 5 | The route shape; `recover.ts`'s order; staging's invariant | A1's health parameter and header; passes 1 and 1½ in A1's fixed order; B's `running` row honoured, and an asleep staging keeps its candidate |

**Not taken:** nothing. **Routine calls this revision made**: wake the same instances rather than redeploy (Decision 5); waking before
hibernating in the task order; the waker's port, secret header names, queue bound and failure cooldown; the term-start wake through the
sweep (within 5 minutes of the term's first day) rather than a timer of its own.

**Checked before commit** by a fresh read-only agent, against the review and the other three plans; what it found here was fixed in
place: **the sweep was bound at boot a sitting before the boot, the deploys and the candidate knew an asleep app** — it is now bound in
Task 6 (the self-review's item 6); `idlePolicyFor`'s fifth parameter, `settings`, everywhere; Task 5's event now has its contract
commands, the mock's example and the front-end told; Task 6's failed-deploy control is predicted on the one row that reaches the
rollback's route step; *"`ensureInstance`"* is A1's `ensureInstances`.

---

## What executing this plan found

*(One dated section per sitting.)*
