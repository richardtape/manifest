# Production Instances by Audience — §24, A1 — Implementation Plan

> **WRITTEN 2026-10-03, AFTERNOON, BY THE PLANNING SESSION `manifest-c7`** (coordinated by `manifest-94`). **Rich's, the same afternoon,
> through the question tool**: answering the load rehearsal's first question, *"Build §24's capacity first"* — production runs instances by
> audience, the edge balancing across them, before the rehearsal measures it; then *"Two plans: A then B"*; then *"A1 → B → A2"* — A1 this
> plan (the instances), B the load rehearsal, A2 hibernation and wake-on-request. **Every fact in *Read this first* was read from the code at
> `e969f9d`** (a read-only survey and this session); two plans run before this one (the rest of *faculty-ready*, then FE-46/47/5), so
> **Task 1 re-reads every fact**. **Two spec actions are DRAFTED at the end, none applied.** **APPROVED by Rich, 2026-10-03, 15:20 PDT,
> as revised (`2d74a5d`)** — *"A1 and FE-32 now; B and A2 later (Recommended)"*, through `manifest-94`'s question tool — with his two answers on the
> replacement built in (Decision 11).
>
> **REVISED 2026-10-03, 14:37–15:19 PDT (read from the clock), TO A FRESH REVIEW** ([`2026-10-03-review-of-four-plans.md`](./2026-10-03-review-of-four-plans.md),
> its §1 and *Cross-plan*), by a fresh platform session at Rich's word (~14:33, *"starting fresh ones"*), coordinated by `manifest-94`.
> It builds in **Rich's answer on a dead member — *"Replace it automatically"*** (Decision 11, Task 6). The review's line references were
> re-checked against the code at `75030d8` and hold. **Every finding, and where it went, is in *Revised to the review*** near the end.

> **AND F16(b) IS DECIDED FOR THIS PLAN (Rich, 2026-10-09 11:24, `6a4ae2a`, through `manifest-coord`): (b).** A change to a registration UBC
> holds in force does not block a FIRST launch — §13's first-launch row reads *"UBC IAM's registration is in force (recorded `active`, not lapsed
> since) and covers the release; a change asked for or filed does not unregister it"*, the after-launch predicate (`launch/readiness.ts`'s
> `iamItem` → `registrationInForce(row)`, and the mock's `iamItem`). **Sitting 1 drafts the Spec action from (b)'s words and applies it**, the
> shared HTML pages swept; any wording beyond (b)'s goes to him first. **And FE-56 is CARRIED** (the same morning): `sendIamRegistration`
> never checks that a draft was drawn from what a draft would be drawn from now — the roadmap's *Tracked defects found in use*.

> **READ FIRST — WHAT THE FE-46/47/5 PLAN LEFT THIS ONE (2026-10-08, `manifest-p5`, at that plan's close).** It EXECUTED after this plan
> was written, and it took the contract to **`1.8.0`** — so **wherever this plan says the contract goes to `1.8.0`, it goes to `1.9.0`**
> (lines 62, 93, 241, 601, 612, 629, 639, 656 — counted with this banner in place), and B, A2 and FE-32 each one further (`1.10.0`, `1.11.0`, `1.12.0`);
> sitting 1 re-reads each against `packages/contract` and corrects them before Task 5's first schema change, as FE-46/47/5's sitting 1 did.
> **Migration `0053` is FE-46/47/5's** (`0053_lumpy_boomerang`: the records' `sent` state); this plan's first takes `0054`. **`launch/`
> moved throughout** (`records.ts`, `readiness.ts`, `queue.ts`, the new `mail/`; a registration IN FORCE — `registrationInForce` — is now
> what "live" means), and **`make demo-launch`'s `class` audience is at `journey/src/launch.ts:516-517`** (line 43's `launch.ts:497`); Task
> 1's `[M1]` re-reads every fact anyway. **`make demo-launch` takes ~3–4 min; its change leg (8b) runs on the RE-USE path only**, so *"three
> times on each driver"* is fresh, re-use, re-use again; **`make demo-token` is driver 1's alone** (`require_driver local`). The vulnerability
> database is fresh until 2026-10-15 23:32 PDT (refreshed 2026-10-09, built `2026-10-09T06:32:32Z`): a launch demo after that needs `make refresh-vulndb`, with the network on.

> **READ FIRST — WHAT 2026-10-13 LEFT THIS ONE (`manifest-coord2`, the coordinated run's end).** ORIENTATION §7e's *What 2026-10-13 left
> it* is the full list: **FE-57 fixed out of plan** (`5869070`: the skeleton's `proxy-addr` 2.0.8; `EXPECT_TESTS` 3534); **three tracked
> defects open, their placement Rich's** — FE-56, the projects-list `500` (`projects/repository.ts:215`, the file Task 7 rewrites) and the
> event replay's clock order (`observability/bus.ts:258`, beside Task 6's migration; `bus.test.ts` can red once in a whole-suite run);
> and **Rich's launched `reading-updates` is 7100's only project — `[M5]`'s `pnpm test` empties it: ask him first.** Two corrections to the
> banner above: **its line numbers have drifted** — the `1.8.0` mentions are now at lines 69, 100, 248, 608, 619, 636, 646, 663 (sitting
> 1 re-reads them anyway); and **the chain after this plan follows Rich's order of 2026-10-03 15:28** (*"FE-46/47/5 → A1 → B → FE-32 →
> Phase 3 → A2"*), so B is `1.10.0`, FE-32 `1.11.0`, and A2 later — not *"A2 `1.11.0`, FE-32 `1.12.0`"*.

> **READ FIRST — WHAT SITTING 1 FOUND, AND WHAT RICH DECIDED (2026-10-13, `manifest-a1-s1`, the second coordinated run).** The two banners
> above are SETTLED on every point they raise: **the `1.8.0` lines all say `1.9.0` now** (nine, at the close of sitting 1); **the three
> tracked defects and F16(b)'s build are PLACED** (Rich, 16:01, answer 3, `c0f969e` — *Decided by Rich*): F16(b)'s build in sitting 2, the
> event replay's clock order in Task 6, the projects list's `500` in Task 7, FE-56 its own item later; **F16(b)'s Spec action is APPLIED**
> (`daf2ad0`); **Spec actions A and B are APPROVED** (answers 4 and 5); and **`reading-updates` went at `[M5]`'s `pnpm test`** (Rich let it
> go, answer 2). **`[M3]`'s STOP FIRED**: a CWL sign-in started on one instance and finished on another is refused (`InResponseTo is not
> valid`), and **Rich chose the SAML request cache in the app's own Mongo, built in sitting 3 beside Task 4** (~16:28, `3487e68`) — Task 8
> is split, 8a in sitting 3 and 8b (the knowledge pack) in sitting 6. **`[M2]` held Decision 4 as written**, and its exact JSON is the
> record's. **`[M1]` changed nothing in meaning**; what it found that the plan does not name is in a *SITTING 1 MEASURED* note under each
> task it changes (2–7). The record: [`../spikes/instances-baseline/README.md`](../spikes/instances-baseline/README.md); the story: *What
> executing this plan found*, *Sitting 1*.

> **READ FIRST — WHAT SITTING 2 BUILT AND LEFT (2026-10-13, `manifest-a1-s2`, the second coordinated run).** **Tasks 2 and 3 and F16(b)'s
> build are DONE** — Task 2 `98a9a9f` (an app's route dials every instance, round robin, health policy a parameter, each answer naming
> its instance — `[M2]`'s JSON, on the real edge), Task 3 `941789c` (`routes` keyed `(hostname, instance_id)`, migration `0054_daffy_ezekiel`,
> `replaceRouteSet`), F16(b) `3bcb269` (platform) and `0c7a2a3` (the mock, a new stage `change-before-launch`). **Two things sitting 3
> must read first**, in the *SITTING 2 BUILT* note under Task 4: the Docker driver still writes a set of ONE with `health: 'none'`, and
> **no container label carries the health path** — `restoreRoute(ids)` cannot build an app's health policy from a container alone.
> **And Task 3 moved the DEPLOY's Route-row writer too** (Postgres refuses the old upsert, `42P10` — measured): Task 5 passes the set to
> it. `make demo-launch`'s step 8 now carries F16(b)'s witness (a change sent before the first launch; the launch goes ahead). The story:
> *What executing this plan found*, *Sitting 2*.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development, **whichever Rich chooses**. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9.

**Goal:** **Production runs as many instances as its audience needs** — §24's table: `solo` 1, `class` 2, `large_course` 3, `public` 3 —
**behind one edge route that balances across them and routes around one that dies.** A redeploy starts the new N beside the N serving,
proves each, moves the route ONCE, and retires the old N — P4c's *"a redeploy interrupts nobody"*, across N. Boot recovery, retirement,
D21's rehearsal, the per-instance AI keys and every reader of *"the serving instance"* follow. **A member that exits is replaced**
(Rich: *"Replace it automatically"*): the platform notices it, records it with an Incident, and redeploys the set — backing off, and after
three replacements in an hour it stops and says so, because a crash-looping app must not loop for ever (§11: *"no silent retry"*). **A
faculty app runs correctly on several instances** — its sessions are in its own Mongo already, and the knowledge pack says what else it
must not keep in memory. Sandbox and staging stay one instance (§24: *"Sandbox and staging ignore all of it"*), until B's load rehearsal
grants staging production's shape.

It is proved by **`make demo-capacity`** — which carries P4c's whole witness across two instances (a signed-in person asking questions
back to back through a redeploy: nobody signed out, no failed request), a member killed and replaced, and a sign-in that crosses
instances — and by every launch demo, now on two instances: `make demo-production`, `make demo-releases` and `make demo-launch` create
`class` apps (`journey/src/production.ts:280`, `launch.ts:497`). **`make demo-redeploy` is NOT a witness of N** — it is staging-only
(`scripts/demo-redeploy.sh:43`, `APP_URL` is staging), and staging stays one; it stays green as P4c's one-instance witness. A person
clicks it too.

**Architecture:**
- **§11's `Driver` handles a SET per hostname** (Spec action A): `ensureInstances(specs)` starts every new instance beside what serves,
  proves each privately, moves the route in ONE change to exactly the new set, and resolves only once the hostname is shown to reach EACH
  of them; `servingInstances(hostname)` answers the set; `restoreRoute(ids)` puts a set back; `retireInstance` refuses any member of the
  serving set; `destroyInstance` takes its own upstream out of the route — **leaving the route untouched when its upstream is not in it**
  — and removes the route only with the last.
- **The edge's route dials N upstreams, round robin**, with **active health checks on the health path and passive ones that count dial
  failures, `502` and `504` — never `503`** (an app shedding load is not ejected onto its siblings), and a dial failure retried on another
  member within `lb_try_duration`. **The route builder takes the health policy as a parameter** (A2's waker route passes none). Each
  response is stamped with **exactly the instance id** of the upstream that answered — not one static value, and not the `mf-i-` alias —
  so a deploy can see each new instance, and a person can see which one answered.
- **`routes` holds one row per (hostname, instance)** — the unique index on `hostname` alone goes.
- **The shape is one function, `shapeFor(kind, purpose, audience)`** (Decision 2): production's count is the audience's, read at each
  deploy; staging and sandbox are 1; D21's rehearsal stays 1. B's load rehearsal and A2 add to this one function, never an override.
- **A member that exits is replaced** by a background job beside the retirer, the set watcher (Decision 11, Task 6).
- **The contract goes to `1.9.0` ONCE, at Task 5** (`Environment.instances`, the serving set; the old `instance` kept, the set's first);
  Tasks 6 and 7 add to it (`instance.exited`). B then takes `1.10.0` and FE-32 `1.11.0` (Rich's order of 2026-10-03 15:28); A2 later.

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

> **EIGHT SITTINGS, PROPOSED** (six before the review; it added the replacement Rich chose, and judged the old sitting 6 more than one
> session). Task 1 is first and alone. The edge's route and the `routes` table go first, together, because every later task reads them. The
> driver's set is the heart and is alone. The deploy, retire and boot recovery move together, because each assumes the others' set — and
> with them every client that reads the instance header, so no launch demo is left red between sittings. The replacement is alone. The
> readers — the API, the console, D21's rehearsal, the knowledge pack — share a sitting. The acceptance is two sittings: the demo, then
> everything else and the review.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements**: every fact re-read; Caddy's `reverse_proxy` with N upstreams, round robin, the health policy (passive without `503`, a dial failure retried), a fresh set PATCHed in under a loop with checks on, and a deferred header naming exactly the chosen upstream's instance id, in a THROWAWAY Caddy from the edge's image; a CWL sign-in started on one instance and finished on another; a WebSocket and a drain across N; the laptop's memory with three instances; the gate numbers | No | After Task 1's commit. **It stops and asks Rich** if `[M3]` finds a sign-in cannot cross instances (then the fork — sticky routing or a shared SAML cache — is his) | ✅ **DONE 2026-10-13** (`manifest-a1-s1`, the second coordinated run's job S1, inline): Task 1 `a70b94b` — [`spikes/instances-baseline/`](../spikes/instances-baseline/README.md). **`[M3]`'s stop FIRED**: a CWL sign-in cannot cross instances (`InResponseTo is not valid`); **Rich chose the SAML request cache in the app's own Mongo, built in sitting 3** (~16:28, `3487e68`). F16(b)'s Spec action applied (`daf2ad0`), §21's label beside it (`1c3066c`). *What executing this plan found*, *Sitting 1* |
| 2 | 2, 3, **F16(b)** | **The edge's route** for N upstreams, its health policy a parameter (`[M2]`'s JSON); **`routes` one row per (hostname, instance)**; **and F16(b)'s build** (Rich, 2026-10-13 answer 3, `c0f969e`): `launch/readiness.ts`'s `iamItem` → `registrationInForce(row)` — a change UBC holds in force no longer blocks a first launch (§13's row, applied `daf2ad0`) — and the mock's `iamItem`, its notice to the front end (G3); W2 starts on this sitting's close-out | Yes — `routing/`, `db/`, `launch/` | After the commits, with an N-upstream route applied to the real edge and read back, and F16(b)'s refusal gone through the edge | ✅ **DONE 2026-10-13** (`manifest-a1-s2`, the second coordinated run's job S2, inline): Task 2 `98a9a9f`, Task 3 `941789c`, F16(b) `3bcb269` + the mock `0c7a2a3` (G3 notice, landed on `manifest-coord3`'s word). A two-upstream route applied to the real edge and read back (`routing/routes.docker.test.ts`); F16(b) through the edge in `make demo-launch`'s step 8, driver 1, every check passed. The Docker tier 293/293. *What executing this plan found*, *Sitting 2* |
| 3 | 4, **8a** | **Spec action A applied first** (approved 2026-10-13, answer 4). **The driver's set**: `ensureInstances`, `servingInstances`, `restoreRoute(ids)`, retire and destroy across a set; the driver contract; both drivers. **And Task 8a — the SAML request cache in the app's own Mongo** (Rich, ~16:28, `3487e68`: `[M3]` found a sign-in cannot cross instances), so it lands before sitting 4 puts every launch demo's `class` production on two | Yes — `runtime/`, `blueprints/` | After the commits, with the Docker contract cases green and the skeleton's sign-in crossing two instances | ← **next** (read Task 4's *SITTING 2 BUILT* note first) |
| 4 | 5 | **Spec action B applied first** (approved 2026-10-13, answer 5). **The deploy, retire and boot recovery across N**; `shapeFor`; the per-instance AI keys; what the deploy answers; **every client that reads `X-Manifest-Instance`**; **contract `1.9.0`** | Yes — `releases/`, `ai/`, `projects/` | After the commit, with a `class` app's production on two instances through the edge, `make demo-production` and `make demo-releases` green on it, and `make demo-redeploy` green (staging, one) | |
| 5 | 6 | **A member that exits is replaced**: the set watcher, its backoff and cap, `instance.exited`, an Incident per exit; **and the event replay's clock order** (Rich, answer 3: `observability/bus.ts:258` reads `ORDER BY created_at`, a clock that can step back — an insertion order beside Task 6's migration; the roadmap's *Tracked defects*); **and FE-59** (Rich, 2026-10-13 ~18:14, *"go with the recommendations"*, `40c0f82`: `iam_registration.recorded` carries `changeRequestedFrom` as the record holds it — a change filed with UBC (`active`) and UBC's questions (`submitted`) read the same today — inside `1.9.0`, so W4's adoption picks it up and closes the front end's m178; `launch/records.ts`, `observability/event-schemas.ts`) | Yes — `releases/`, `observability/`, `launch/` | After the commit, with a member `docker kill`ed through the edge and replaced, quoted | |
| 6 | 7, 8b | **The readers**: D21's rehearsal pinned to one; the API's and console's serving set; the fleet's count; **and the projects list's `500`** (Rich, answer 3: `GET /v1/projects` answers `500` while a project is between its rows and its repository, `projects/repository.ts:215` — the file Task 7 rewrites; the roadmap's *Tracked defects*); **Task 8b, the knowledge pack's no-state-in-memory rule** | Yes — `launch/`, `projects/`, `blueprints/` | After both commits, with the front-end told | |
| 7 | 9 | **The acceptance's demo**: `make demo-capacity` — P4c's whole witness across two, a member killed and replaced, a crash loop stopped at its cap, a sign-in across instances — three times on each driver, every negative control seen red. **Alone** | No, unless a fix touches the owed list | After the commit, with the three runs on each driver quoted | |
| 8 | 10 | **The rest of the acceptance**: every launch demo on two instances, three times on each driver; `make ci-acceptance`; the clicked half; the plan's one whole-branch review beside the Docker tier, and its one fix wave. **Alone, and last** | Yes — beside the reviewer | After the clicked half and the review's one fix wave | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates (`pnpm test` twice, alone, on the final tree), the Docker tier when owed, a dated
*What executing this plan found*, this table, and ORIENTATION §6's sweep. **Three rules survive any re-cut:** Task 1 first and alone; Tasks
9 and 10 alone and last, in that order; no task a spec action changes before Rich has decided it (**A before sitting 3; B before sitting
4**, where Task 5's `shapeFor` builds the counts).

---

## Decided by Rich — build them, do not re-open them

- **A SIGN-IN THAT CROSSES INSTANCES: THE SAML REQUEST CACHE IN THE APP'S OWN MONGO, BUILT IN SITTING 3** — *"I'm confortable going with
  your recommendations"* (2026-10-13, ~16:28 PDT, to `manifest-coord3`; [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md),
  `3487e68`), answering `[M3]`'s stop: sitting 1 measured a sign-in started on one instance and finished on another REFUSED
  (`InResponseTo is not valid` — passport-ubcshib 0.1.7-rc.1 makes the skeleton's unset `validateInResponseTo` `'always'`, and node-saml
  5.1.0 keeps each AuthnRequest's id in a per-process memory cache). **(1)** `skeleton/auth/ubcshib.js` passes node-saml a `cacheProvider`
  on a Mongo collection with an 8-hour TTL index, on the client `session.js` already holds; passport-ubcshib unchanged (Decision 9, Task
  8a). **(2)** It moves from sitting 6 into **sitting 3, beside Task 4**, so it lands before sitting 4 puts every launch demo's `class`
  production on two instances; the knowledge pack's paragraph stays in sitting 6 (Task 8b). *Rejected:* sticky routing by an edge cookie
  (Caddy's is `SameSite=Lax`, which the IdP's cross-site POST does not carry; an uneven spread; the redeploy case left open);
  `validateInResponseTo: 'never'` (turns off the replay check); its own sitting between 2 and 3; sitting 2.
- **THE THREE TRACKED DEFECTS AND F16(b)'S BUILD, FOLDED IN** — *"Fold them into A1"* (2026-10-13, 16:01, answer 3, `c0f969e`; not the
  recommendation, a P0 beside sitting 1): **F16(b)'s build into sitting 2**, beside Tasks 2 and 3; **the projects list's `500`**
  (`projects/repository.ts:215`) **into Task 7** (sitting 6), which rewrites that file; **the event replay's clock order**
  (`observability/bus.ts:258`) **into Task 6** (sitting 5), beside its `observability/` migration; **FE-56 stays in the roadmap's *Tracked
  defects*, its own item later.** And **Spec actions A and B APPROVED AS DRAFTED** (answers 4 and 5): sitting 3 applies A before Task 4,
  sitting 4 applies B before Task 5. **Execution: inline, one sitting per session** (answer 6 — the *"whichever Rich chooses"* below).

- **§24's CAPACITY FIRST** — *"Build §24's capacity first"* (2026-10-03, ~13:52 PDT, answering the load rehearsal's first question, through
  `manifest-94`, [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)): production runs instances by audience — *class ≥2,
  large_course ≥3 with headroom, public ≥3* — the edge load-balancing across them; hibernation per the table. **The rest of §24's table**
  (backups, saturation alerting, tuned rate limits and abuse controls, `public`'s security review) **was not asked for.**
- **A DEAD MEMBER IS REPLACED AUTOMATICALLY** — *"Replace it automatically"* (2026-10-03, ~14:33 PDT, through the question tool, over the
  recommended *"Report it"* and *"Record as not built"*; [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)), answering the fresh
  review's I5: **the platform starts a replacement when an instance of a production set exits**, and this plan designs who notices it, a
  backoff and a cap for a crash-looping app, and the event (Decision 11, Task 6).
- **A REPLACEMENT SKIPS §13's CHECKLIST, AND KEEPS THE APPROVAL'S DIGEST CHECK** — *"Skip the checklist (Recommended)"* (2026-10-03,
  15:20 PDT, through the question tool; [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)): a replacement redeploys production's
  exact digest without the route's `assertLaunchable`, and `release.ts:285`'s approval-digest check runs for it. *Rejected by that
  choice:* running the checklist too, which would leave a dead member dead — and a `solo` app down — whenever the vulnerability database
  is more than a week old.
- **A RUNNING MEMBER UNHEALTHY FOR A MINUTE HAS EXITED** — *"Yes, after ~1 minute (Recommended)"* (15:20 PDT, the same): a member still
  running but `failed` (Docker's health check `unhealthy`, no `exitCode`) for four watcher passes in a row counts as an exit, its event
  `exitCode: null`. *Rejected by that choice:* real exits only, which would leave a hung member routed around until a person redeploys.
- **APPROVAL** — *"A1 and FE-32 now; B and A2 later (Recommended)"* (15:20 PDT, the same): this plan APPROVED as revised (`2d74a5d`); B and A2 get a second
  fresh review when each is next in line.
- **THE SPLIT AND THE ORDER** — *"Two plans: A then B"* (~13:56), then *"A1 → B → A2"* (~13:58): **this plan builds the instances**; B the
  load rehearsal; **A2 hibernation and wake-on-request** (*"Build hibernation in Plan A"*, ~13:56), with term dates as an administrator's
  platform setting (*"An admin platform setting"*) and pre-warming not built (*"Record it as not built"*). Then FE-32, the vulnerability
  database, FE-45.
- **Carried, still binding:** P4c's *"a redeploy interrupts nobody"* (`make demo-redeploy`); §20's edge headers on every route, deferred so
  an app cannot forge them; D21's rehearsal (person-only, stepped up, taken down in a `finally` and at boot); every refusal asserts its
  code; published text cites no section, decision or plan; the front-end is told before any commit to `packages/contract` or `packages/mock`.

---

## What Rich does, and when

1. ~~Review this plan~~ — **APPROVED 2026-10-03, 15:20 PDT.** 2. ~~Read and decide Spec action A before sitting 3, and B before sitting 4~~ — **BOTH APPROVED AS DRAFTED 2026-10-13** (answers 4 and 5,
`c0f969e`). 3. **The clicked half, sitting 8**:
open a launched `class` app twice in two browsers and read, in DevTools, two different `X-Manifest-Instance` values; sign in on one and
stay signed in on the other; read the console's environment showing two instances; and read the history of the app's production after
the agent kills one member — *"an instance stopped and was replaced"* — and its Incident.

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
   (`:442`) — the alias is already per instance, **`mf-i-<instanceId>`** (`instances.ts:292`, `names.ts:80-84`, `INSTANCE_ALIAS_PREFIX`), so
   an upstream's host is the alias, never the bare id; proves readiness privately from inside the edge
   (`:484-489`); reads `servingRoute` and calls `applyRoute` with ONE upstream (`:515-521`), **replacing the route**; `waitForIdentity`
   (`:530-557`), restoring the previous route JSON on failure (`:563-568`). `retireInstance` (`:592-641`) guards on `upstreamsInUse`
   (`:610-621`) and drains per address (`drainUpstream`, `:220-233`, Caddy's `num_requests`). `servingInstance` (`:653-657`) maps the
   route's one upstream to a container (`containers.ts:146-159`, `found[0]`). `restoreRoute` (`:711-733`) rebuilds a one-upstream route.
   **`destroyInstance` removes the hostname's WHOLE route** (`:751-775`) — **and swallows a failure to do so**, `removeRoute(…).catch(() =>
   undefined)` (`:772`), so a route left pointing at a destroyed container leaves no operator line.

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
   N−1 live siblings. **Its targets are the DRIVER's view, not the rows' states**, so marking a row `destroy_requested` does not make the
   retirer take it. **And *"nothing serves → skip"*** (`:93-103`, *"THE MOST DANGEROUS LINE IN THIS PLAN"*): after an edge restart every
   instance reads non-serving, so a pass that finds nothing serving does nothing. `retireInstanceRow` (`:202-273`) is per instance.
   **`recover.ts`**'s passes, in order (`:71-200`): 0 the builds left; **1 the Route records, one `restoreRoute` per row** (`:112-141`);
   2 a deploy left mid-way (`provisioning`, `starting`, `waking` → `failed`, `:144-161`); 2½ archived projects; 2¾ a D21 rehearsal left
   serving; **3 the retire passes, LAST** (`:184-200`).

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

**Added by the revision** (re-read at `75030d8`).

12. **Nothing notices an instance that dies.** App containers run with **`RestartPolicy: { Name: 'no' }`** (`runtime/docker/hardening.ts:42`,
    *"§11 has no silent retry: a crash becomes `failed` and an Event, not a loop"*), and nothing polls them. §11's machine already has
    the transition: **`healthy` → `failed` on `crashed`** (`runtime/state-machine.ts:50-54`), raised by nothing. The driver's **`status(id)`**
    (`runtime/driver.ts:176-187`, `:404`) answers `state`, `healthy` and the process's `exitCode`. **It never throws for a missing
    container — it answers `{ state: 'gone' }`** (`runtime/docker/instances.ts:357-358`, `runtime/fake-driver.ts:336`) — **and `failed`
    means two things**: a container that EXITED (with an `exitCode`), or one still RUNNING whose Docker health check reads `unhealthy`
    (`instances.ts:36-38`).
13. **Every client that compares ONE response's `X-Manifest-Instance` to ONE id** — each breaks under round robin, and none is in the
    original File Structure: `packages/journey/src/production.ts:366` and `:811`, `launch.ts:1269` and `:1346`, `releases.ts:282`, `:847`
    and `:930`, **and the self-serve redeploy's loop at `releases.ts:1024-1040`** (*"the instance changed exactly once, from leg A's to leg
    B's"*: `runs.length === 2`), whose per-request instance comes from `scripts/lib/redeploy-loop.mjs:42`. **Staging's readers are
    unchanged in meaning**, because staging stays one: `launch.ts:612` (`onStaging.id`) and `scripts/demo-redeploy.sh:94-97`
    (`serving_now`) — but each still reads the header, so each must read the BARE id after Task 2 (Decision 4).
14. **What a deploy answers.** `deployRelease` returns ONE `Instance` (`releases/release.ts:219-226`), and the `deploy` operation answers it
    (`api/routes/releases.ts:1066-1083`, `:1172-1199`, *"The instance, healthy or failed"*); clients compare `DEPLOYED.id` to the header.
    **The gates sit in two places**: the route calls `assertLaunchable` — §13's checklist — for production (`:1170-1171`), and
    `deployRelease` itself checks the approval's digest **only when `(input.purpose ?? 'launch') === 'launch'`** (`release.ts:285`) — so
    any new purpose skips it unless the condition changes.
15. **Two more writers and readers of one route per hostname**, missed before: `launch/testing.ts:265-267` upserts a Route with
    `onConflictDoUpdate({ target: routes.hostname })` — after Task 3 there is no unique index on `hostname` alone, and Postgres refuses
    that `ON CONFLICT` target (`42P10`); and `launch/rehearsal.ts:378` asks `servingInstance(production.hostname) !== undefined`.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.9.0`, AT TASK 5**, the first schema change; Tasks 6 and 7 add to it. Additive: `Environment.instances` (the
   serving set), `InstanceSummary.serving` re-described (*"one of the instances the hostname reaches"*), and `instance.exited` (Task 6).
   `Environment.instance` stays — **the set's first by `(created_at, id)`**, the same instance the deploy answers (Decision 6), because
   every member of a set comes from one deploy and *"the newest"* would tie — so no client breaks.
2. **THE SHAPE IS ONE FUNCTION** — `shapeFor(kind: EnvironmentKind, purpose: DeployPurpose, audience: Audience | null): { instances:
   number; resources: EnvironmentKind }` (`releases/shape.ts`), read inside `deployRelease` and nowhere else. Its rows here:
   **production, for a launch or a replacement — `solo` 1, `class` 2, `large_course` 3, `public` 3** (no audience: 1), at production's own
   resources; **production, for D21's rehearsal — 1** (Decision 8); **staging and sandbox — 1, at their own**. *"≥3 with headroom"* is
   read as **three, each at the manifest's own resources**: two can carry the app while the third is replaced or has died. A setting can
   raise it later. **B adds one row** (staging, `purpose: 'load-rehearsal'` → production's count and production's resources) **and A2
   none.** *Rejected:* a count or resources a CALLER passes (`DeployInput.instances`, `.resources` — B's first sketch): three plans would
   each grow an override path, and a caller-supplied resource is a hole a refusal then has to close; here a purpose cannot ask for a
   shape its row does not give. *Cost to change course:* one function's table.
3. **§11's `Driver` HANDLES A SET** (Spec action A):
   - `ensureInstances(specs: InstanceSpec[]): Promise<InstanceHandle[]>` — every spec the same hostname; starts each beside what serves,
     proves each privately, **moves the route in ONE change to exactly the new set**, and resolves only once the hostname is shown to reach
     EACH; if any is not ready, it throws with every handle, the route unmoved. Idempotent, as `ensureInstance` was. **`ensureInstance`
     goes**: one is a set of one.
   - `servingInstances(hostname): Promise<string[]>`; `restoreRoute(ids: string[])`; `retireInstance` refuses any member of the serving
     set; **`destroyInstance` takes its own upstream out of the route, and removes the route only with the last — and leaves the route
     exactly as it is when its upstream is not in it** (an instance never routed, such as a failed deploy's — A2's waker route depends on
     this). **No failure is swallowed**: a route that could not be changed is thrown, naming the hostname, BEFORE the container goes, so
     the caller (the retirer, the deploy's rollback) records it — `driver.ts:772`'s `.catch(() => undefined)` goes.
   - *Rejected:* `ensureInstance` per replica, each moving the route — N route changes, N moments when the hostname reaches a partial new
     set beside the old, which is the interruption P4c exists to prevent.
4. **THE ROUTE** (rewritten to the review's I4): `reverse_proxy` with every upstream; **`selection_policy: round_robin`** (so a deploy's
   identity check sees each new instance in N requests, and the load spreads evenly); **the health policy is a PARAMETER of `buildRoute`**,
   `health: HealthPolicy | 'none'`, and an app route's is:
   - **active** checks on the blueprint's `health_path` every 5 s (a 2 s timeout, `200` expected), carrying the request header
     `X-Manifest-Probe: health` so anything behind a route can tell a probe from a person;
   - **passive** ones counting **dial failures, `502` and `504` only — never `503`**, so an app briefly shedding load is not ejected and
     its load does not cascade onto its siblings (`max_fails` 2 within a 10 s `fail_duration`);
   - **a dial failure retried on another member** within `load_balancing.try_duration` 3 s (`try_interval` 250 ms) — Caddy retries only
     dial failures by default, which is the point: a request an app has begun is never sent twice.
   **Caddy's health state is per dial address and shared across routes** (the review); an app's members each have their own address, so
   only A2's waker — one address for many hostnames — meets it, and A2's route passes `'none'`. **`[M2]` measures** that a set PATCHed in
   with checks on serves a request loop across the PATCH with zero failures (whether a fresh upstream is healthy before its first check),
   and that an upstream answering `503` stays in rotation.
   **The `X-Manifest-Instance` header is EXACTLY the instance id of the upstream that answered** — set from the chosen upstream's host
   (`{http.reverse_proxy.upstream.host}`, which is `mf-i-<instanceId>`), with the `mf-i-` prefix removed by a `replace` after the `set` —
   still deferred, so the app cannot forge it; `[M2]` records the exact JSON that does it, or the placeholder that names the id another way.
   *Rejected:* the alias as the header's value — every reader would learn a second spelling of an instance, and `waitForIdentity` would
   compare two. The rate limit, the headers and the body cap are unchanged: they are the route's, not an upstream's.
5. **`routes` IS ONE ROW PER (hostname, instance)**: the unique index becomes `(hostname, instance_id)`; a migration keeps every existing
   row (each is already one instance). Every reader asks for a SET; boot recovery groups by hostname. **Every writer that upserted on
   `routes.hostname` moves to `replaceRouteSet`** — the deploy's (`release.ts:832-840`) and **`launch/testing.ts:265-267`'s**, which would
   otherwise be refused `42P10`.
6. **THE DEPLOY ACROSS N** (Task 5): N `instances` rows; **N AI keys, minted and stored per instance** (the scheme is already per instance;
   a shared key would outlive its first instance's retirement); one `ensureInstances`; a health wait for each; **any one unhealthy fails the
   deploy** — every new instance destroyed, the previous set restored, an Incident for the failed one (§14), and the previous set still
   serving (P4c's rule, unchanged in meaning); the Route rows replaced by the new set in one transaction; **every instance NOT in the new set
   marked `destroy_requested`**; one `instance.healthy` per instance; `recordLaunch` once, naming the set's first.
   **WHAT IT ANSWERS** (the review's I6): `deployRelease` returns the whole set, `Instance[]`, in `(created_at, id)` order, and the `deploy`
   operation answers ONE `Instance`, unchanged in shape — **the first member that failed, if any did** (so *"a failed deploy is a `200`
   whose `state` is `failed`"* still holds, with that member's Incident), **otherwise the set's first** — the same instance
   `Environment.instance` names. **A client that needs the set reads `getEnvironment`'s `instances`**, and every reader in *Read this
   first* 13 checks that **every id of the set is seen within `4 × N` requests** through the edge (round robin's N, with room for a health
   check's interleaving). *Rejected:* an `Instance.set` field on every instance read — a new column (`instances.deploy_id`) for an answer
   one extra read already gives.
7. **RETIRE AND BOOT ACROSS N**: the retirer's targets are `listInstances` minus `servingInstances`, and **its skip is kept as *"the
   serving set is empty → skip"*** (`retire.ts:93-103`) — after an edge restart, and for A2's asleep environments, whose route dials the
   waker. Boot recovery's **pass 1 restores each hostname's whole set** from its Route rows (`restoreRoute(ids)`), and an instance whose
   container is gone leaves the set, with an operator line, rather than the set being lost. **The order of `recover.ts`'s passes is
   fixed here for all three plans** (the review's cross-plan 3): 0 builds; **1 sets restored (this plan), and an asleep environment routed
   to the waker instead (A2)**; **1½ a wake left mid-way put back to sleep (A2)** — before 2, which would otherwise fail its `waking` rows;
   2 deploys left mid-way; 2½ archives; 2¾ a D21 rehearsal; **2⅞ a load rehearsal left running taken down (B)**; 3 the retire passes,
   LAST; then the set watcher starts (Task 6).
8. **D21'S REHEARSAL STAYS ONE INSTANCE** — it measures a sign-in, not load, and its take-down removes exactly what it put up; `shapeFor`'s
   rehearsal row gives it one, and the equality checks (`launch/rehearsal.ts:490-491`, and `:378`'s *"is anything serving"*) become set
   checks. **B's load rehearsal is where staging takes production's N.**
9. **WHAT A FACULTY APP MUST NOT KEEP IN MEMORY** (Task 8, the knowledge pack): *"Several copies of your app run at once in production, and
   any of them answers any request. Keep nothing a person needs between requests in the process — sessions are already in the app's
   database; put anything else there too."* **The SAML login** is held by `[M3]`: if a sign-in started on one instance cannot finish on
   another, sitting 1 stops and asks — **sticky routing by a platform cookie** (`lb_policy: cookie`) or **the SAML request cache in the
   app's Mongo** (a change to the skeleton, inherited by every app). *Recommended in advance:* the cache in Mongo, because sticky routing
   breaks round robin's even spread and the identity check, and a skeleton change is what §20 calls the blueprint's multiplier.
   **`[M3]` FOUND IT CANNOT CROSS, AND RICH CHOSE THE CACHE IN MONGO, BUILT IN SITTING 3** (2026-10-13, `3487e68`; *Decided by Rich*;
   Task 8a). Measured with a shared cache: all four orders sign in, and a replay is still refused.
10. **NO NEW EVENT FOR THE SET ITSELF.** `instance.*` events are per instance already; `instance.healthy`'s description changes from *"now
    serves the environment"* to *"now serves the environment, with the rest of its set"*. Decision 11 adds one event, for an exit.
11. **A MEMBER THAT EXITS IS REPLACED** (Rich, *"Replace it automatically"*; Task 6). Each part, with what was rejected:
    - **WHO NOTICES: the set watcher**, a background job beside the retirer (`releases/watch.ts`, `createSetWatcher(deps)`, started by
      `src/index.ts` after `recoverAtBoot`'s pass 3). Every `MANIFEST_SET_WATCH_SECONDS` (default 15) it asks the driver's **`status`** —
      an existing verb, so every driver inherits it — of each member of every PRODUCTION environment's serving set (its Route rows). **A
      member has EXITED when its status is `gone` (its container is missing), or `failed` WITH an `exitCode` (the process ended).** A
      member RUNNING but `failed` (Docker's health check reads `unhealthy`, no `exitCode`) is routed around by the edge's active checks
      already, and **is treated as an exit only once it has stayed so for four passes in a row (a minute)** — Rich, *"Yes, after ~1
      minute"* (15:20): a member nobody has been able to reach for a minute is as gone, to the people using the app, as one that died; its
      event says `exitCode: null` and why. *Rejected:* Docker's event stream (one
      driver's mechanism, and a stream the host-run control plane must keep open across Docker Desktop restarts); the edge's passive
      health state (it routes around a member, and says nothing about why).
    - **WHAT IT RECORDS, ONCE PER EXIT** (a member whose row is already `failed` is never recorded again): the row `healthy → failed` on
      `crashed` (§11's machine already has it); **an Incident** (§14 — the
      member's logs, redacted, which is where a crash's reason is); and **`instance.exited`** `{ instanceId, releaseId, environment,
      exitCode, attempt, replacement: 'scheduled' | 'stopped', nextInSeconds }`, whose sentence says the app kept serving on the rest of
      its set, or did not. **Never silent** (§11: *"Failures back off exponentially and surface as an Event; there is no silent retry"*).
    - **THE REPLACEMENT IS A REDEPLOY OF THE SET** — `deployRelease(…, { releaseId: <the release the set serves>, purpose: 'replacement',
      replacing: <the exited id> })`. It is P4c's redeploy exactly: the new set beside the survivors, proved, one route move, the old set
      (survivors and the dead member) retired after the drain. Inside the environment's lock it first re-reads that `replacing` is still a
      Route row — a person's deploy in between has already replaced the set, and the replacement then does nothing and says so.
      **The approval check runs for it**: `release.ts:285`'s condition becomes `input.purpose !== 'rehearsal'`, so no purpose added
      after this one (B's included) can skip it by being new (a test and a negative control). **It does not pass through the route's
      `assertLaunchable`** — Rich, *"Skip the checklist"* (15:20): it is the release production already serves, not a launch, and §13's checklist — whose `scans` item refuses
      every launch once the vulnerability database is a week old — must not keep a dead member dead.
      *Rejected:* replacing only the dead member — `ensureInstances` moves the route to exactly the specs it is given, so keeping the
      survivors means re-deriving their specs, which `INSTANCE_SPEC_CHANGED` refuses once an app secret has changed since their deploy; it
      would need a Driver verb that adds one instance to a serving set, and its spec action, to save N−1 container starts now and then.
      *Cost to change course:* that verb, its spec action, and the watcher's one call.
    - **THE BACKOFF AND THE CAP, for an app that crashes over and over**: per environment, the first exit is replaced at once, the second
      after **1 minute** and the third after **4** (each four times the one before — §11's *"back off exponentially"*); **at most three
      replacements in any hour** — a fourth exit within the hour is recorded with
      `replacement: 'stopped'`, nothing more is started, its Incident's prompt says the app is crashing repeatedly and names the exits, and
      the survivors, if any, serve on. **The count is of replacements STARTED, and it is DERIVED from rows, never kept in memory**: each
      replacement's instances carry **`instances.replacing`** (a new nullable column, Task 6 — the exited member they were started to
      replace), and the attempts this hour are the distinct replacement deploys whose rows were created since the later of an hour ago and
      the environment's last deploy that was not a replacement (the database's clock) — so a control plane that restarts mid-loop neither
      forgets the cap nor double-counts, **a person's deploy resets it**, and **a replacement that itself fails counts**, because its rows
      exist, `failed`. **A failed replacement** is the deploy's ordinary failure — the previous set restored, the dead member still in it
      with its row `failed`, an Incident — and the watcher, seeing a set that still holds a `failed` member, **starts the next attempt
      when the backoff allows, or, past the cap, starts nothing and says so in that deploy's Incident** (*"replacing has stopped after
      three tries this hour"*).
    - **SCOPE: production, every audience** — a `solo` app's set of one is replaced too (its one exit is the app down until the
      replacement is healthy). **Staging and sandbox are unchanged** — one instance, and §11's *"a crash becomes `failed` and an Event"*
      for a person to act on. **An archived project's environments, an environment a deploy is mid-way through (rows `provisioning` or
      `starting`), and A2's asleep environments are skipped** — a hibernated member's status reads `hibernated`, never `failed`, by
      `stopInstance`'s marker.
    - **`RestartPolicy: 'no'` STAYS** (`hardening.ts:42`): a container the engine restarts in place is invisible to the platform — no
      event, no Incident, no cap — which is the silent retry §11 forbids.

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
  redeploy of ONE instance interrupts nobody (it is staging-only, and staging stays one). **The witness across N is `make demo-capacity`**
  (Task 9), and until it exists, Task 5's redeploy loop across two through the edge and `make demo-releases`' self-serve loop.
- **One file**: `pnpm exec vitest run --project unit src/<path>`. **Never two Vitest processes.** `pnpm test` truncates.
- **A route change is four commands**; **a migration** is `db:generate`, read, apply. **An `audit.events` CHECK migration is
  CUMULATIVE**: it lists every event type the latest migration lists, plus its own — read from that migration, never from a plan (B, A2
  and FE-46/47/5 each add types too).
- **Published text cites no section, decision or plan.** **Every refusal asserts its code.** **Never accept a check you have not watched
  fail.** **Every task names its CALLER.**
- **The front-end is told before any commit to `packages/contract` or `packages/mock`.**
- **Commit on `main`, stage your own paths by name.** **Never edit the spec; never touch Valet; ask before `sudo`.** **The four protected
  containers survive; `caddy-data` is never destroyed.** **Leave the machine as you found it** — every throwaway container, network and route
  removed; the three cleanup scripts bare, then `--apply` (a Docker-tier run with N instances leaves more behind — count, never assume).

---

## Review Focus

1. **A redeploy that interrupts.** A request loop through the edge, and a signed-in person asking questions back to back, during a
   redeploy of a two-instance app. Expected: **no request fails, none reaches a retired instance, nobody is signed out (no `401`), every
   question is answered**; the old pair drains. Owned by Task 5's *a redeploy across two* and Task 9's `make demo-capacity`, which carries
   P4c's whole witness across two (`make demo-redeploy` cannot: it is staging-only).
2. **A dead instance that keeps getting traffic — and is never replaced.** One of two instances killed (`docker kill`). Expected: **within
   the health checks' window, every request reaches the survivor; within the watcher's interval the exit is recorded — the row `failed`,
   an Incident, `instance.exited` — and the set is redeployed, after which the hostname reaches two healthy instances again with no failed
   request.** Owned by Task 2's Docker case (routing around), Task 6 (the replacement) and Task 9.
3. **A retire or destroy that kills a sibling.** Retiring an instance outside the set while a set of two serves; destroying one member of
   the set; destroying an instance that was never routed. Expected: **the other member keeps serving; the route survives until its last
   upstream goes; a never-routed instance's destroy leaves the route exactly as it was.** Owned by Task 4's contract cases.
4. **A partial deploy.** Of three new instances, one never becomes ready. Expected: **the route never reaches any of the three; the old set
   serves throughout; all three are destroyed; one Incident names the one that failed.** Owned by Task 4 and Task 5.
5. **A boot that loses a member.** The control plane restarted with two instances serving, one of whose containers was removed by hand.
   Expected: **the route is restored to the one that exists, and an operator line names the one that did not.** Owned by Task 5.
6. **A sign-in that breaks across instances** (`[M3]`). Expected: **a CWL sign-in completes whichever instance receives the assertion.**
   Owned by Task 1's stop (it FIRED, 2026-10-13), Task 8a and Task 9's phase 6.
7. **A crash loop that loops for ever, or a cap that forgets.** An app whose every instance exits a few seconds after it is healthy; the
   control plane restarted between two exits. Expected: **three replacements in the hour, at once, then 1 minute, then 4; the fourth exit
   `replacement: 'stopped'`, nothing more started, an Incident saying so**; the count the same after a restart; a person's deploy resets
   it. Owned by Task 6.
8. **A replacement that slips a gate.** The watcher's redeploy of a production set. Expected: **the approval's digest is checked for it as
   for any production deploy** — a release whose approval was rejected since is never redeployed by a replacement. Owned by Task 6's test
   and its negative control.

---

## File Structure

```
packages/control-plane/src/routing/caddy.ts, routes.ts, readiness.ts     MOD (T2) N upstreams; round robin; the health policy a parameter; the
                                                                          header exactly the answering id; upstreamsOf (every one); servingRoute's
                                                                          set; waitForIdentities
packages/control-plane/src/db/schema.ts + drizzle/                        MOD (T3) routes unique (hostname, instance_id); replaceRouteSet
packages/control-plane/src/launch/testing.ts                              MOD (T3) its route upsert → replaceRouteSet (42P10 otherwise)
packages/control-plane/src/runtime/driver.ts, driver-contract.ts, fake-driver.ts   MOD (T4) the set
packages/control-plane/src/runtime/docker/driver.ts, containers.ts        MOD (T4) ensureInstances; servingInstances; restoreRoute(ids); retire, destroy
packages/control-plane/src/releases/release.ts, retire.ts, recover.ts, shape.ts (NEW)   MOD/NEW (T5) the deploy across N; shapeFor; what it answers
packages/control-plane/src/api/routes/releases.ts                         MOD (T5) the deploy's answer (Decision 6)
packages/journey/src/production.ts, launch.ts, releases.ts                MOD (T5) every header reader checks the SET (Read this first 13)
scripts/lib/redeploy-loop.mjs, scripts/demo-redeploy.sh                   READ (T5) the bare id still parses; changed only if [M1] finds it does not
packages/control-plane/src/releases/watch.ts (NEW), src/index.ts          NEW/MOD (T6) the set watcher; started after recovery
packages/control-plane/src/observability/event-schemas.ts, events.ts, examples.ts + drizzle/   MOD (T6) instance.exited; the events CHECK
packages/control-plane/src/config.ts                                      MOD (T6) MANIFEST_SET_WATCH_SECONDS
packages/control-plane/src/projects/repository.ts, fleet.ts               MOD (T7) servingInstancesOf; the count
packages/control-plane/src/launch/rehearsal.ts, candidate.ts              MOD (T7) one instance (shapeFor); set checks, :378 included
packages/control-plane/src/api/representations/environments.ts, instances.ts, routes/project-reads.ts, routes/instances.ts, contract/document.ts   MOD (T5, T7)
packages/console/src/screens/project.tsx, deploy.tsx; packages/mock/src/  MOD (T5, T7)
blueprints/node-ts-mongo/agents/AGENTS.md; skeleton/auth/ubcshib.js       MOD (T8b; T8a, sitting 3 — [M3], Rich 3487e68)
packages/journey/src/capacity.ts, scripts/demo-capacity.sh, Makefile      NEW (T9); ci-acceptance.sh, offline-acceptance.sh MOD (T10)
docs/superpowers/spikes/instances-baseline/                               NEW (T1)
```

---

## Task 1: Measure what this plan rests on

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/instances-baseline/README.md`.

- [ ] **Step 1: `[M1]` Re-read every *Read this first* fact at HEAD**, with line numbers; and grep every caller of `servingInstance`,
  `servingInstanceOf`, `restoreRoute`, `upstreamOf`, `routes.hostname` (an `onConflictDoUpdate` target above all), **`deployRelease`'s
  answer**, and **every reader of `X-Manifest-Instance` / `x-manifest-instance`** in `packages/`, `scripts/` and `infra/` — that list is
  Tasks 3–7's, and a reader it finds that *Read this first* 13 does not name is added to Task 5's Files before sitting 4.
- [ ] **Step 2: `[M2]` Caddy across N**, in a THROWAWAY Caddy from `manifest-caddy`'s image on its own network, with three tiny upstreams
  (the fixture app's image) answering their own name, each with a network alias `mf-i-<a uuid>`: (a) `round_robin` — 9 requests reach each
  three times; (b) **the deferred header is EXACTLY the answering upstream's id** — `{http.reverse_proxy.upstream.host}` set, then the
  `mf-i-` prefix removed by a `replace` (or the placeholder that names it another way — record which) — and an upstream's own
  `X-Manifest-Instance` does not survive; (c) Decision 4's health policy: active checks on `/healthz` at 5 s carrying `X-Manifest-Probe:
  health`, passive ones on dial failures, `502` and `504` — `docker kill` one upstream mid-loop and record how many requests fail and for
  how long, with and without `try_duration` 3 s; **(c′) an upstream that answers `503` to every request stays in rotation** (the passive
  policy without `503`); **(c″) a request loop across a PATCH that replaces the set with three FRESH upstreams, checks on: zero failures
  expected** — record whether Caddy treats an upstream as healthy before its first active check; (d) a WebSocket held across a route
  re-apply that removes its upstream (`stream_close_delay`); (e) `num_requests` per upstream address for the drain. Record the exact JSON
  Task 2 will write.
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

**Files:** `routing/caddy.ts` (`buildRoute` takes `upstreams: { dial: string; instanceId: string }[]` and **`health: HealthPolicy |
'none'`** — an app route's built by `appHealthPolicy(healthPath)`, Decision 4's numbers; `'none'` leaves out `health_checks` and
`try_duration` entirely), `routing/routes.ts` (`upstreamsOf(route): string[]` — every one — and `upstreamsInUse` from it; `servingRoute`
answers `{ route, upstreams, instanceIds }`), `routing/readiness.ts` (`waitForIdentities({ expected: string[] })` — succeeds once every
expected id has been seen within `4 × N` requests, and fails naming those never seen); their tests and `routing/routes.docker.test.ts`.

**Interfaces:**
- Produces: `export interface HealthPolicy { active: { path: string; interval: string; timeout: string; probeHeader: string };
  passive: { failDuration: string; maxFails: number; unhealthyStatus: readonly (502 | 504)[] }; tryDuration: string; tryInterval: string }`
  — `unhealthyStatus`'s type cannot hold `503`; `appHealthPolicy(healthPath: string): HealthPolicy`; `buildRoute(input: { …;
  upstreams: …; health: HealthPolicy | 'none' })`. A2's waker route calls it with `'none'`.

> **SITTING 1 MEASURED (2026-10-13, `[M2]`, [`../spikes/instances-baseline/README.md`](../spikes/instances-baseline/README.md)):** Decision 4 holds as written, in a throwaway Caddy 2.11.4 from the edge's image.
> **The exact JSON is the record's**: the header `set` to `{http.reverse_proxy.upstream.host}` (which is `mf-i-<id>`) and a `replace` of
> `search_regexp: ^mf-i-` → `""` in the same deferred `headers` handler leaves EXACTLY the bare id, one value, the app's own gone. A member
> killed mid-loop: 0 of 391 failed with `try_duration` 3 s, 3 of 391 without; a `503` member stays in rotation (its control ejects it); a
> loop across a PATCH to a fresh set: 0 of 450, no old answer after the first new. **And: a response the EDGE makes carries NO
> `X-Manifest-Instance`** — `502` with no health checks, **`503` with them** once every member is down — so a reader's *"header absent"*
> still means *"no app answered"*, and a classifier that expects `502` for that meets `503`. `[M1]`: `waitForIdentity`
> (`routing/readiness.ts:78-131`, the match :103) is the one server-side one-id reader.

- [ ] **Step 1: The failing tests.** The JSON: N upstreams, `round_robin`, Decision 4's health policy (`unhealthy_status` exactly `[502,
  504]`, a pin), `try_duration`, **the header set from the chosen upstream and its `mf-i-` prefix removed, still `deferred`** — `[M2]`'s
  exact JSON; **with `health: 'none'`, no `health_checks` key and no `try_duration`**; **a single-upstream route's JSON equal to today's
  except those** (a pin of everything else — the rate limit, the headers, the body cap, `stream_close_delay`). `upstreamsOf` reads all;
  `upstreamsInUse` holds a second upstream (the retire guard's hole). `waitForIdentities`: every id seen → resolves; one never seen →
  rejects naming it. **The Docker case** (the real edge): a route of two upstreams; 10 requests reach both, **each response's header
  EXACTLY one of the two ids** (never `mf-i-…`); one killed → within the window all reach the survivor (Review Focus 2's first half); **one
  answering `503` stays in rotation**.
- [ ] **Step 2: Run, and predict. Step 3: Implement.**
- [ ] **Step 4: Commit**, then the **negative controls**: (a) read only `upstreams[0]` again. Predict red: `upstreamsInUse`'s
  second-upstream row — the retire guard's witness. (b) Put `503` back in the passive policy (a cast past the type). Predict red: the
  `unhealthy_status` pin and the Docker case's `503` row. (c) Drop the `replace` of the prefix. Predict red: the route-JSON pin and the Docker case's
  *exactly one of the two ids* row. (`waitForIdentities`' unit rows stub the probe — `routing/readiness.test.ts:85-90` — so they never see
  the route's JSON and cannot go red; say so.)
  ```bash
  git commit -m "feat(routing): an app's route dials every instance it has — balanced, health-checked, each answer naming the instance that gave it"
  ```

---

## Task 3: `routes` — one row per (hostname, instance)

**Sitting 2, after Task 2.** Decision 5.

**Files:** `db/schema.ts` (`routes_hostname_key` → `routes_hostname_instance_key` on `(hostname, instance_id)`); `db:generate`, read it
(every existing row already satisfies it), apply; every writer that upserts on `routes.hostname` (`releases/release.ts:832-840`,
**`launch/testing.ts:265-267`**, and any other `[M1]` found) moves to delete-then-insert of the set in one transaction — Task 5 lands the
deploy's; **this task changes the schema, the one shared helper, `replaceRouteSet(tx, hostname, instanceIds)`, with its test, and
`launch/testing.ts`'s upsert** (its callers are the launch suites, which would otherwise be refused `42P10` from this commit on).

> **SITTING 1 MEASURED (2026-10-13, `[M1]`, [`../spikes/instances-baseline/README.md`](../spikes/instances-baseline/README.md)):** **`0054` is free** (the newest is `0053_lumpy_boomerang`); the index is
> `routes_hostname_key` (`db/schema.ts:375`, made by `0009_outgoing_killer_shrike.sql:13`). `launch/testing.ts`'s upsert is now **:282-285**,
> the deploy's **`release.ts:849-857`**. Writers the plan does not name, each still right with a set: deletes by hostname at
> `launch/rehearsal.ts:380` and `releases/lifecycle.ts:142`, by (hostname, instance) at `rehearsal.ts:492-499`; plain test inserts in five
> files (the record lists them).

- [ ] **Step 1: The failing test**: two rows for one hostname are accepted; the same (hostname, instance) twice is refused (`23505`);
  `replaceRouteSet` leaves exactly the set given; **`launch/testing.ts`'s helper called twice for one hostname leaves one row, the second
  instance's**. **Step 2–3: Run, predict, implement, migrate.**
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
without its own upstream, removes it with the last, **leaves it untouched when its upstream is not in it, and throws — naming the hostname
— when the route could not be changed, before the container goes: `:772`'s `.catch(() => undefined)` is removed**); `containers.ts`
(`containersForUpstreams`). The routes the driver applies are built with `appHealthPolicy(spec.healthPath)` (Task 2).

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
    /**
     * Take this instance's own upstream out of its hostname's route — removing the route only when it was the last — then remove the
     * container. An instance whose upstream is NOT in the route (never routed, or routed away) leaves the route exactly as it is. A route
     * that could not be changed is THROWN, naming the hostname, and the container is left for the caller's retry.
     */
    destroyInstance(id: string): Promise<void>
    // …the rest unchanged
  }
  ```

> **SITTING 1 MEASURED (2026-10-13, `[M1]`, [`../spikes/instances-baseline/README.md`](../spikes/instances-baseline/README.md)):** the fake driver has **six more one-route sites than *Read this first* 2
> names** — `fake-driver.ts:195` (an existing healthy instance), `:249` (the retire guard), `:290` (`switchOff`), `:295` (`removeName`), `:390`
> (`holdRequest`), `:405` (`dropRoutes`) — each this task's. The Docker `destroyInstance` removes the route **without checking which
> instance it dials** (`driver.ts:771-773`; the fake checks, `:307`). **Task 8a joins this sitting** (Rich, `3487e68`).

> **SITTING 2 BUILT (2026-10-13, `manifest-a1-s2`; Task 2 `98a9a9f`, Task 3 `941789c`) — WHAT THIS TASK INHERITS:**
> - **`routing/` answers sets now**: `buildRoute({ hostname, routeId, upstreams: { dial, instanceId }[], health })`, `appHealthPolicy(healthPath)`
>   (durations in NANOSECONDS, as the edge receives them), `upstreamsOf`, `instanceIdsOf` (off each dial's `mf-i-` alias — `instanceIdOf`
>   is gone), `servingRoute → { route, upstreams, instanceIds }`, `waitForIdentities({ expected: string[] })` (every id seen; one unseen
>   4 × N answers after the first in-set answer is named — a `ReadinessResult`, not a rejection). **`buildRoute` REFUSES an upstream whose
>   dial is not its instance's own alias** (the header is read off it) and an empty set.
> - **THE DOCKER DRIVER STILL WRITES A SET OF ONE WITH `health: 'none'`** (`ensureInstance` and `restoreRoute(id)`, each commented) — this
>   task switches both to the set and to `appHealthPolicy(spec.healthPath)`, as its Files say. **No container label carries the health
>   path** (`instances.ts` `LABEL`: slug, environment, release, instance, hostname, port, ai-gateway, envHash), so **`restoreRoute(ids)`
>   cannot build an app's health policy from its containers alone** — a new label (and what a container without it gets), or the Route
>   rows, or the route JSON the edge last held: this task's call. `servingInstance` reads `upstreams[0]` until `servingInstances`.
> - The contract-suite helper `runtime/docker/testing.ts`'s `holdRequest` already waits on ANY member of the set; the Docker-tier stubs
>   dial by alias (`routing/testing.ts`'s `stubAppArgs(name, body, headers, { aliases, status })`), and the pre-P4c retire-guard case writes
>   its container-name route as raw JSON (`runtime/docker/redeploy.docker.test.ts`).

- [ ] **Step 1: The failing tests — the driver contract, both drivers**: a set of two serves its hostname (both identities seen); a second
  set of two takes over in one move and the first set still runs (P4c, across N) — **and a request loop through the edge during the move
  never meets a mixed set: no answer from the old set after the first answer from the new** (the Docker driver's case; the fake driver
  records ONE route change); a set with one never-ready member moves nothing and the first set serves (Review Focus 4); retiring a member
  of the serving set is `INSTANCE_SERVING`; retiring the old set's members leaves the new set serving; **destroying one member of a serving
  set leaves the other serving** (Review Focus 3); destroying the last removes the name; **destroying an instance that was never routed leaves the route byte-for-byte as it was** (read back before and after);
  `restoreRoute([a, b])` puts both back; `listInstances` answers all. **The Docker driver alone**: a route update the edge refuses (the
  admin API stopped for the case) makes `destroyInstance` reject naming the hostname, and the container still exists.
- [ ] **Step 2: Run, and predict. Step 3: Implement**, both drivers.
- [ ] **Step 4: Commit**, then the **negative controls**: (a) route each new instance as it becomes ready (N moves). Predict red: the
  *"one move"* case's no-mixed-set row (Step 1) and the fake driver's one-route-change row. (b) Let `destroyInstance` remove the whole route again. Predict red: the destroy-one-member case and the never-routed case. (c) Put
  the `.catch(() => undefined)` back. Predict red: the refused-update case only.
  ```bash
  git commit -m "feat(runtime): the driver runs a set of instances per hostname — started beside what serves, moved in one change, each proved"
  ```

---

## Task 5: The deploy, retire and boot recovery across N — `shapeFor`, what the deploy answers, and every client that reads the header

**Sitting 4. Spec action B decided first.** Decisions 1, 2, 6, 7. **Contract `1.9.0`.** **Its callers are the `deploy` route
(`api/routes/releases.ts:1172`) and D21's rehearsal; the readers it changes are the journeys `make demo-production`, `make demo-releases`
and `make demo-launch` run.**

**Files:** `releases/shape.ts` (NEW: `shapeFor(kind, purpose, audience)`, Decision 2's rows, and `type DeployPurpose = 'launch' |
'rehearsal' | 'replacement'` — `'replacement'` declared here, used by Task 6); `releases/release.ts` (Decision 6 through `deployRelease`:
the count from `shapeFor`, never from a caller; its rollback and its Incident; `servingInstances`; it returns `Instance[]`);
`api/routes/releases.ts` (the `deploy` operation answers Decision 6's one `Instance`; its description says *"the first member that failed,
or the set's first"*); `releases/retire.ts` (targets `listInstances − servingInstances`; **the empty set → skip**, kept; `servingIsRecorded`
over the set); `releases/recover.ts` (pass 1 grouped by hostname; a missing container leaves the set with an operator line);
`api/representations/environments.ts` (`instances: Instance[]`, the serving set; `instance` the set's first by `(created_at, id)`),
`instances.ts` (`serving`'s description); `api/contract/document.ts` (`1.9.0`); the four contract commands; the mock's environments in the
same step. **And every client of *Read this first* 13**: `packages/journey/src/production.ts` (`:366`, `:811`), `launch.ts` (`:1269`,
`:1346`), `releases.ts` (`:282`, `:847`, `:930`, and the loop's assertion at `:1024-1040`) — each reads the set from `getEnvironment`'s
`instances` and checks that **every id of it is seen within `4 × N` requests**; the loop's becomes *"every answer before the move from set
A, every answer after it from set B, and the set changing exactly once"*. `scripts/lib/redeploy-loop.mjs` and `scripts/demo-redeploy.sh`
(`serving_now`) are READ: they take the header's value as it is, and staging stays one — changed only if `[M1]` found otherwise.

> **SITTING 1 MEASURED (2026-10-13, `[M1]`, [`../spikes/instances-baseline/README.md`](../spikes/instances-baseline/README.md)) — READERS *READ THIS FIRST* 13 DOES NOT NAME, ADDED TO THIS TASK'S FILES:**
> the staging journeys `faculty-ready.ts:582`, `authoring.ts:962`, `github.ts:591` (one id each, the class of `launch.ts:632` — staging
> stays one, so each needs only the bare id, which `[M2]` shows it gets); `scripts/demo-redeploy.sh` `:224-225` (a second reader, the asker
> loop), `:258`, `:278`, `:315-316`, `:353-354`, and `scripts/lib/redeploy-summary.mjs` `:95-105`, `:109`, `:114` (staging, one instance —
> READ); and **two production Docker-tier tests that compare one id**, `releases/production.docker.test.ts:461-465` and `:567-571`. The
> named ones have moved: `production.ts:366`, `:847`; `launch.ts:1547`, `:1624`, `:632`; `releases.ts:282`, `:865`, `:948`, the loop
> `:1042-1058`. `release.ts` is +17 lines from the lock on (`deployRelease` returns at :220-227; the gate :286 and :967; the upsert
> :849-857; `destroy_requested` :859-877). The contract is `1.8.0`, so this task's bump is **`1.9.0`** (corrected throughout).

> **SITTING 2 BUILT (2026-10-13, `manifest-a1-s2`):** **the deploy's Route-row writer is ALREADY `replaceRouteSet`** (`db/routes.ts`,
> exported by `db/index`; Task 3 `941789c`) — a set of one, `instanceIds: [instanceId]`: with the key on `(hostname, instance_id)`
> Postgres refuses the old `ON CONFLICT (hostname)` (`42P10`, measured), so it could not wait for this task. This task passes the whole set
> to the same call. `recover.ts`'s pass 1 still restores ONE route per Route row — with two rows for a hostname that is two one-upstream
> routes, the last winning: this task's grouping by hostname is what makes it a set. And **`make demo-launch`'s step 8 now asks for a
> change before the launch** (F16(b)'s witness, `3bcb269`) — its probe of the public listener (`launch.ts`, step 8) is one of this task's
> header readers.

- [ ] **Step 1: The failing tests** (the fake driver; `releases/release.test.ts`, `retire.test.ts`, `recover.test.ts`, `shape.test.ts`):
  a `class` production deploy runs two instances, two AI keys stored per instance, two Route rows, one `instance.healthy` each, **and
  both rows `healthy` — neither `destroy_requested`** — after the retirer has run; a `large_course` one three; staging one; a redeploy of
  two retires exactly the old two after the drain; **one of three new never healthy → the old set serves, the three destroyed, one
  Incident, and the deploy answers THAT member, `failed`** (Review Focus 4; Decision 6); a healthy deploy answers the set's first by
  `(created_at, id)`, equal to `Environment.instance`; the retirer never targets a serving member, and **does nothing when the serving set
  is empty**; **a boot with one member's container gone → the route restored to the other, one operator line** (Review Focus 5);
  `shapeFor`'s table — production `launch` and `replacement` by audience, `rehearsal` 1, every non-production kind 1, no audience 1 — and
  **`DeployInput` has no `instances` or `resources` field** (a type test: `@ts-expect-error`).
- [ ] **Step 2: Run, and predict. Step 3: Implement**, the contract commands, then the journey readers. **Tell the front-end before the
  commit**: `1.9.0`; `Environment.instances`; *"a deploy answers one instance of its set — read the set from the environment"*.
- [ ] **Step 4: Through the edge, on driver 1**: `make demo-production`'s `launch-app` (a `class` app) redeployed — two instances, both
  identities seen through the edge, each header a bare id; **`make demo-production` and `make demo-releases` green on two** (the latter's
  self-serve loop is the redeploy across two, under a request loop: set A, then set B, once); **`make demo-redeploy` green** (staging, one —
  P4c's one-instance witness).
- [ ] **Step 5: Commit**, then the **negative controls**: (a) mark every instance but the FIRST new one `destroy_requested` (the old rule).
  Predict red: the two-instance deploy's *"both rows `healthy`"* row — **the rows' states, because the retirer reads the driver's view and
  would leave a serving sibling running either way, so a control predicted on what serves cannot fail** (the review's I3). (b) Route only
  the first new member. Predict red: the deploy's *"both identities seen"* row and `make demo-production`'s set check.
  ```bash
  git commit -m "feat(releases): production runs as many instances as its audience needs — deployed, retired and recovered as a set (contract 1.9.0)"
  ```

---

## Task 6: A member that exits is replaced — the set watcher, its backoff and its cap

**Sitting 5, alone.** Decision 11 (Rich: *"Replace it automatically"*). **Its caller is `src/index.ts`, which starts it after
`recoverAtBoot`'s pass 3, beside the retirer.**

**Files:** `releases/watch.ts` (NEW: `createSetWatcher(deps: SetWatcherDeps): SetWatcher` — `{ start(): void; stop(): Promise<void>;
idle(): Promise<void> }`, one pass every `MANIFEST_SET_WATCH_SECONDS`; per environment one replacement at a time, joined); `releases/
release.ts` (`DeployInput.replacing?: string`, honoured only with `purpose: 'replacement'` — under the lock, a `replacing` that is no
longer a Route row ends the deploy with nothing done and an operator line; each instance it starts records it in **`instances.replacing`**
(a new nullable column and its migration); **the approval check's condition becomes `input.purpose !== 'rehearsal'`**); `config.ts` (`MANIFEST_SET_WATCH_SECONDS`, default 15, `CONFIG_INVALID` below 5); `observability/event-schemas.ts`,
`events.ts`, `examples.ts` (`instance.exited`, its sentence); the `audit.events` CHECK migration — **cumulative**: every type the latest
migration lists, plus this one; the Incident's prompt for an exit and for a stopped replacement (`observability/`'s Incident builder,
`[M1]` names it); `src/index.ts`; the four contract commands (`instance.exited`, still `1.9.0`); the mock's event example. **And FE-59**
(Rich, 2026-10-13 ~18:14, `40c0f82`; the front end's `docs/api-findings.md`, FE-59): `launch/records.ts`'s `recordIamRegistration`
publishes `iam_registration.recorded` with `changeRequestedFrom` as the record holds it, and `observability/event-schemas.ts` (with its
example) gains the field — inside `1.9.0`, told to the front end in this sitting's notice (W4 adopts it; it closes their m178).

**Interfaces:**
- Consumes: `Driver.status(id)` (`InstanceStatus`); `deployRelease` (Task 5) with `purpose: 'replacement'`; `servingInstances`.
- Produces:

  ```ts
  // releases/watch.ts
  export interface SetWatcherDeps {
    db: Db
    driver: Driver
    /** The deploy, bound at boot as the route binds it — the watcher never builds its own. */
    redeploy(input: { environmentId: string; releaseId: string; replacing: string }): Promise<void>
    /** The database's clock (ORIENTATION §4 trap 14) — never the host's. */
    now(): Promise<Date>
    /** Injected so the tests drive the backoff; `setTimeout` in production. */
    delay(ms: number): Promise<void>
    intervalSeconds: number
  }
  /** 0, 60 and 240 seconds before the first, second and third replacement STARTED in an hour; `undefined` after three — stopped. */
  export function replacementDelaySeconds(attemptsThisHour: number): number | undefined
  ```

> **SITTING 1 MEASURED (2026-10-13, `[M1]`, [`../spikes/instances-baseline/README.md`](../spikes/instances-baseline/README.md)):** the Incident is built by **`captureIncident`** (`observability/incidents.ts:59`,
> called once, by the deploy, `release.ts:919`) and its prompt by **`incidentPrompt`** (`:128-147`) at READ time
> (`api/routes/releases.ts:1301`), whose first line is hard-coded *"…failed to start in its <kind> environment."* (`:133`) — an exit's
> Incident needs its own. `describeExit` (`:154-170`) already says *"the process exited with code N"*. **The CHECK is `events_type_known`,
> and `0053` lists 58 types** (= `EVENT_TYPES`). **AND THIS TASK TAKES THE EVENT REPLAY'S CLOCK ORDER** (Rich, 2026-10-13 answer 3,
> `c0f969e`): `recentFramesFor` orders by `created_at` (`observability/bus.ts:258`), a `clock_timestamp()` that can step back — an
> insertion order instead, test-first, beside this task's migration; the roadmap's *Tracked defects found in use* row is deleted when it lands.

- [ ] **Step 1: The failing tests** (`releases/watch.test.ts`, the fake driver with a test hook that makes one member's `status` answer
  `failed`):
  - **The exit is recorded, once**: a `class` production set of two, one member `failed` with an `exitCode` → its row `failed` (by
    `crashed`), one Incident, one `instance.exited` `{ attempt: 1, replacement: 'scheduled', nextInSeconds: 0 }`; then a replacement
    deploy, its instances' `replacing` the exited id; afterwards two `healthy` members, the Route rows the new set, and the retirer takes
    the old pair. **A member whose status is `gone` is an exit too; a member RUNNING and `failed` (no `exitCode`) is not — until its fourth
    pass in a row**; a member whose row is already `failed` is never recorded twice.
  - **A replacement that fails**: the set restored with its dead member, the deploy's Incident, and the next attempt started only after
    the backoff — counted, because its rows exist.
  - **The backoff and the cap** (Review Focus 7): the second exit in the hour waits 60 s and the third 240 s (the injected `delay` records
    them); **the fourth is `replacement: 'stopped'`, no deploy is started, and its Incident's prompt says the app is crashing repeatedly**;
    **a fresh watcher (a restarted process) derives the same count** from the rows; **a person's deploy in between resets it**;
    `replacementDelaySeconds`'s table.
  - **A replacement that finds nothing to replace**: a person's deploy lands between the exit and the replacement → the replacement does
    nothing, one operator line, no second deploy.
  - **The gate** (Review Focus 8): the release the set serves has had its approval rejected since → the replacement is refused
    `RELEASE_DIGEST_NOT_APPROVED`, nothing started, `replacement: 'stopped'` with the code in the Incident's prompt.
  - **What is skipped**: staging's and sandbox's members (no exit recorded, nothing replaced); an archived project's; a member
    `provisioning` or `starting` (a deploy is mid-way); a member whose status reads `hibernated`.
- [ ] **Step 2: Run, and predict. Step 3: Implement**, the migration, the contract commands. **Tell the front-end before the commit**:
  `instance.exited`, and its sentence (*"An instance of <app>'s production stopped; it is being replaced"* / *"…stopped again; replacing
  it has stopped after three tries this hour"*).
- [ ] **Step 4: Through the edge, on driver 1**: `launch-app`'s production of two, a request loop through the edge, one member `docker
  kill`ed: quote the loop's failures (bounded by the requests in flight at the kill — Decision 4's retry takes the rest), the time to
  `instance.exited`, and the time until two healthy members answer again.
- [ ] **Step 5: Commit**, then the **negative controls**: (a) put the gate's condition back to `(input.purpose ?? 'launch') === 'launch'`.
  Predict red: the gate row only — a replacement deployed past a rejected approval. (b) Remove the cap (`replacementDelaySeconds` never
  `undefined`). Predict red: the fourth-exit row only. (c) Count the hour's attempts in the watcher's memory instead of from the rows.
  Predict red: the restarted-process row only. (d) Treat a running `failed` member as an exit at once. Predict red: the
  four-passes row only.
  ```bash
  git commit -m "feat(releases): a production instance that exits is replaced — noticed, recorded with an Incident, backed off, and stopped after three in an hour"
  ```

---

## Task 7: The readers — D21's rehearsal, the API, the console, the fleet

**Sitting 6.** Decision 8.

**Files:** `launch/rehearsal.ts` (its deploy keeps `purpose: 'rehearsal'`, which `shapeFor` makes one instance; `takeDown`'s and
`releaseUnlaunchedName`'s checks over the set, **`:378`'s `servingInstance(…) !== undefined` → `servingInstances(…).length > 0`**);
`launch/candidate.ts`, `ai/models.ts`, `projects/fleet.ts`, `api/routes/project-reads.ts`, `api/routes/instances.ts` (`servingInstancesOf`,
`projects/repository.ts:299-317` rewritten without `.limit(1)`; each caller says which it means — the set, or the set's first);
`projects/fleet.ts` and its representation (the production count); the console (`screens/project.tsx:342-347`: *"2 instances, healthy"*;
`deploy.tsx`'s pill per row, unchanged in kind; an `instance.exited` line in the project's history); the mock.

> **AND THIS TASK TAKES THE PROJECTS LIST'S `500`** (Rich, 2026-10-13 answer 3, `c0f969e`): `GET /v1/projects` answers `500` — the
> whole list — while any project its caller can see is between its rows and its repository (`projects/repository.ts:215`, against
> `api/routes/projects.ts:284` and `:324`; the roadmap's *Tracked defects found in use*, FE-58 on the front end), test-first, in the file this
> task rewrites; the row is deleted when it lands. **Sitting 1's `[M1]`:** `servingInstanceOf` is now `projects/repository.ts:300-318`;
> its callers `project-reads.ts:102`, `:370`, `instances.ts:168`, `fleet.ts:61`, `candidate.ts:43`, **`ai/models.ts:101`
> (`classificationFloor`)** — no others.

- [ ] **Step 1: The failing tests**: D21's rehearsal on a `class` app puts up ONE instance and takes down exactly it, the launched set
  untouched (a launched app refuses the rehearsal anyway — the case is a first launch's production, before which nothing serves there);
  the candidate is read the same whether staging serves one instance or, during B's run, N — every member then runs the same release
  (B's Task 4 tests it); the fleet shows `2`; the console renders two, and an exit's line.
- [ ] **Step 2–3: Run, predict, implement.** **Tell the front-end before the commit.**
- [ ] **Step 4: Commit**, then the **negative control**: make `shapeFor`'s rehearsal row the audience's count. Predict red: the
  rehearsal's *"exactly one"* row.
  ```bash
  git commit -m "feat(launch,console): every reader of what serves an environment reads the set; D21's rehearsal stays one instance"
  ```

---

## Task 8: A faculty app on several instances — 8a the SAML request cache in the app's Mongo (sitting 3), 8b the knowledge pack (sitting 6)

**SPLIT BY RICH'S ANSWER TO `[M3]`** (2026-10-13, ~16:28, `3487e68`): sitting 1 measured that a sign-in started on one instance cannot finish
on another, and he chose the cache in the app's own Mongo, **built in sitting 3, beside Task 4** — before sitting 4 puts every launch demo's
`class` production on two instances. **8a: sitting 3, after Task 4. 8b: sitting 6, after Task 7.** Decision 9.

**8a — Files:** `blueprints/node-ts-mongo/skeleton/auth/ubcshib.js` — ONE more option, `cacheProvider`: node-saml's `saveAsync` /
`getAsync` / `removeAsync` on a collection of the app's own Mongo with a TTL index of 8 hours (node-saml's own `requestIdExpirationPeriodMs`,
`saml.js:91`), on the client `skeleton/auth/session.js` already holds; passport-ubcshib passes an option it does not manage straight
through, so the library is unchanged (`[M3]`'s `probes/m3-sp-shared.mjs` is the shape, measured). Its starter; the skeleton's Docker tier.
**Its callers are every app made from the skeleton after it**; an app made before keeps the in-memory cache (on this laptop none survives
sitting 1's `pnpm test`). **8b — Files:** `blueprints/node-ts-mongo/agents/AGENTS.md` (Decision 9's paragraph, after *What you write*);
`blueprints/blueprints.test.ts` (the pack names the rule).

- [ ] **8a, Step 1: The failing tests** — the skeleton's Docker tier: **two instances of a skeleton app on ONE Mongo, an AuthnRequest from
  one answered on the other through the laptop IdP → signed in**, both orders; **a replay refused**; and `[M3]`'s two-process measurement
  (`spikes/instances-baseline/probes/`) as a unit case if it fits the blueprints tier. **Step 2–3.** **Step 4: Commit**, then the
  **negative control**: take `cacheProvider` out. Predict red: both crossing rows, `InResponseTo is not valid` — the same-instance control
  stays green.
  ```bash
  git commit -m "feat(blueprints): a sign-in started on one instance of an app finishes on another — the SAML request cache in the app's own Mongo"
  ```
- [ ] **8b, Step 1: The failing test**: the pack says the rule. **Step 2–3.** **Step 4: Commit**, then the **negative control**: remove the
  paragraph. Predict red: the pack test only.
  ```bash
  git commit -m "docs(blueprints): several copies of an app answer its requests — the knowledge pack says what it must not keep in memory"
  ```

---

## Task 9: The acceptance's demo — `make demo-capacity`

**Sitting 7. Alone.**

**Files:** `packages/journey/src/capacity.ts`, `scripts/demo-capacity.sh`, `Makefile` (`demo-capacity`; it runs `make demo-production`
first when `launch-app` has not launched, as `demo-releases` does); `scripts/lib/redeploy-loop.mjs` and `redeploy-summary.mjs` reused,
generalised from one instance id to a set only if they need it. `fixtures/` gains nothing: the crash-looping release is a commit the
demo makes to `launch-app` (an exit a few seconds after `/healthz` first answers), built, and deployed self-serve.

- [ ] **Step 1: The phases**, each ending `every check passed`, on either driver, against `launch-app` (a launched `class` app):
  1. **Two instances serve** — both ids, bare, seen within 8 requests; `getEnvironment`'s `instances` names the same two.
  2. **P4c's whole witness, across two** (Review Focus 1): a same-release redeploy, then a new-release one, each under a `/healthz` loop
     classified by body AND header AND a signed-in person's requests back to back (the app's signed-in page, and its questions where the
     app declares a model): **no `5xx`, no wildcard page, no `401` — nobody signed out — and every question answered**; afterwards every id
     of the NEW set seen and none of the old; the set changing exactly once; exactly two app containers for the app and, where it has a
     model, two live LiteLLM keys for its user.
  3. **A release that never becomes ready** leaves the old set serving — both its ids still seen — with an Incident, and no container or
     key of the failed set left.
  4. **One member killed** (Review Focus 2): the loop's failures bounded by the requests in flight at the kill; `instance.exited` within
     the watcher's interval; two healthy members again, a new set, every request after it answered.
  5. **A crash loop stopped at its cap** (Review Focus 7): the crash-looping release deployed; three replacements, the second ≥ 60 s and
     the third ≥ 240 s after the exit before; the fourth exit `replacement: 'stopped'`, nothing more started, its Incident's prompt read;
     then a good release deployed by the owner — two healthy members, and the count reset. *(~6 minutes; the demo says so before it
     starts.)*
  6. **A sign-in across instances** (Review Focus 6): a CWL sign-in started and completed four times, so both orders of
     AuthnRequest-instance and assertion-instance occur, each signed in; a session made on one instance read on the other.
- [ ] **Step 2: Green three times on each driver** (fresh, re-use, from `make reset`); quote each run's time.
- [ ] **Step 3: The negative controls**, one per Review Focus line, each predicted, seen red, restored; a line that cannot be broken from
  the demo says so and names the task-level control that holds it.
- [ ] **Step 4: Commit**:
  ```bash
  git commit -m "feat(journey): make demo-capacity — two instances serve, a redeploy across them interrupts nobody, a dead one is replaced"
  ```

---

## Task 10: The rest of the acceptance — every launch demo on two instances, and a person clicking it

**Sitting 8. Alone, and last.**

**Files:** `scripts/ci-acceptance.sh` (a `demo-capacity` step, either driver) and `scripts/offline-acceptance.sh` (a step); whatever the
review's one fix wave touches.

- [ ] **Step 1: Green three times on each driver** (fresh, re-use, from `make reset`): **`make demo-production`, `make demo-releases` and
  `make demo-launch` on two instances**; **`make demo-redeploy`** (staging, one); every other demo; then **`make ci-acceptance`**, and the
  offline acceptance named to Rich as owed.
- [ ] **Step 2: The clicked half** (*What Rich does* 3).
- [ ] **Step 3: The plan's one whole-branch review**, beside the Docker tier; one fix wave, each fix with its own test and its control.
- [ ] **Step 4: Close out**: the ledger, §7e (B's plan next), the front-end told.

---

## What this plan does not build

- **Hibernation and wake-on-request** — A2, after B (Rich, *"A1 → B → A2"*). Until then nothing hibernates, as today.
- **The rest of §24's table**: backups by audience, saturation alerting, tuned edge rate limits and abuse controls, `public`'s security
  review, and pre-warming (*"Record it as not built"*). Not asked for (2026-10-03).
- **Changing an audience after creation** (§24's *Changing the answer*). The count follows the audience at each deploy; nothing changes the
  audience yet.
- **More than one instance in staging or the sandbox**, except B's load rehearsal's grant.
- **Replacing only the dead member** (Decision 11's rejected alternative): the whole set is redeployed. A Driver verb that adds one
  instance to a serving set would save N−1 container starts per exit.
- **Noticing an exit in staging or a sandbox.** Nothing notices one today, and Rich's decision is production's; a person still sees a
  staging app down and redeploys it.

---

## Spec actions — A AND B APPROVED AS DRAFTED BY RICH 2026-10-13 (answers 4 and 5, `c0f969e`); sitting 3 applies A, sitting 4 applies B

*And F16(b)'s, placed with this plan: applied by sitting 1 (`daf2ad0`), with §21's label beside it (`1c3066c`, minor, for his review) —
the roadmap's* Spec actions raised by A1.

**§11's `Driver` interface is changed by FOUR plans** (the review's cross-plan 2): this plan's A, then B's C (a rate limit's exemption),
then A2's C (a service stopped, a route to the waker, a set woken), then FE-32's A (dependencies resolved). **Each is worded against the
interface as the one before it leaves it, and Rich reads them in that order**; none is applied before the one ahead of it.

### A. §11 and §12 — the driver runs a set of instances per hostname, and a member that exits is replaced (before sitting 3)

**Proposed.**
1. **§11, the `Driver` interface**:
   - `ensureInstance(d: InstanceSpec): Promise<InstanceHandle>   // idempotent — see Redeploys` ⟶
     `ensureInstances(d: InstanceSpec[]): Promise<InstanceHandle[]>   // one hostname; idempotent — see Redeploys`
   - `retireInstance(id: string, opts: { drainMs: number }): Promise<void>  // never the serving instance` ⟶
     `retireInstance(id: string, opts: { drainMs: number }): Promise<void>  // never one the hostname reaches`
   - `servingInstance(hostname: string): Promise<string | undefined>` ⟶ `servingInstances(hostname: string): Promise<string[]>`
   - `restoreRoute(id: string): Promise<void>        // re-point a hostname at a running instance` ⟶
     `restoreRoute(ids: string[]): Promise<void>     // re-point a hostname at running instances`
   - `destroyInstance(id: string): Promise<void>` ⟶ `destroyInstance(id: string): Promise<void>   // its upstream out of the route; the route only with the last`
2. **§11, *Redeploys*** — its words still say ONE instance (the review), so they change with it:
   - *"`ensureInstance` starts the new instance beside the one serving and makes it ready without touching the route; the route then
     moves in one in-place change, and the call resolves only once the hostname is shown to reach the new instance **by its identity,
     never by a status**"* ⟶ *"`ensureInstances` starts the new set beside the set serving and makes each ready without touching the route;
     the route then moves in one in-place change, and the call resolves only once the hostname is shown to reach **each** new instance
     **by its identity, never by a status**"*;
   - *"An instance that never becomes ready leaves the previous one serving, untouched"* ⟶ *"A set any member of which never becomes ready
     leaves the previous set serving, untouched"*;
   - *"a driver refuses to retire the instance that is serving"* ⟶ *"a driver refuses to retire any instance the hostname reaches"*;
   - and after *"A redeploy of the same release is a new instance beside the one serving, never a replacement of it."* (§11's interface
     paragraph): *"**Production runs as many instances as its audience needs (§24)**: a redeploy starts the whole new set beside the set
     serving, proves each, and moves the route to the new set in one change; the edge balances across a set and routes around a member
     that stops answering. **A production instance that exits is replaced**: the platform notices it, records it with an Incident and an
     Event, and redeploys the set — backing off, and stopping, and saying so, after three replacements in an hour. There is still no silent
     retry."*
3. **§12, *Edge***: *"Every route sets `X-Manifest-Instance`, which is how a deploy proves the edge reaches the instance it started
   (§11)."* ⟶ *"Every route sets `X-Manifest-Instance` to the instance that answered, which is how a deploy proves the edge reaches each
   instance it started (§11)."*

*Shared pages:* `manifest-schematic.html` (if it draws one instance per app), `manifest-decisions.html` (D29) — check.

### B. §24 — the instance counts, as built (before sitting 4)

**Proposed.** Under *What each answer actually changes*, after the table: *"**Instances are exactly 1, 2, 3 and 3**, each at the manifest's
own resources — *headroom* is the third instance, which carries the app while another is replaced or has died. Production's count is read
from the audience at each deploy; a faculty app runs correctly on several because it keeps nothing a person needs in its process's memory —
its sessions are in its own database (§8, the blueprint)."* — **A2's Spec action B adds a sentence after this one** (B's Spec action A
goes in *Sandbox and staging ignore all of it*), so this one is applied first.

*Shared pages:* `manifest-decisions.html` D29, `manifest-stories.html` (a lecture's app) — check.

---

## Revised to the review — what changed, finding by finding (2026-10-03)

*The review is [`2026-10-03-review-of-four-plans.md`](./2026-10-03-review-of-four-plans.md), §1 and *Cross-plan*. Its verdict on this plan:
approve with the fixes. Each was checked against the code at `75030d8` before it was built in.*

| Finding | What it said | Where it went |
|---|---|---|
| **I1** | The header's meaning changes, and its readers are not listed | The header is EXACTLY the instance id (Decision 4; Task 2's control (c)); every reader listed (*Read this first* 13) and changed in Task 5 to see every id of the set within `4 × N` requests; the self-serve loop's *"changed exactly once"* becomes set A → set B |
| **I2** | `make demo-redeploy` is staging-only, so it cannot be green "on two instances" | Said plainly (Goal, Global Constraints); `make demo-capacity` carries P4c's whole witness across two (Task 9, phase 2); `make demo-redeploy` stays P4c's one-instance witness |
| **I3** | Task 5's negative control cannot fail | Task 5 asserts the rows' states, and its control (a) is predicted on them; control (b) routes only the first member |
| **I4** | The health policy: `503` ejects a busy app; health state is shared per dial address; a fresh set's first seconds unmeasured | Passive on dial failures, `502`, `504` only, a type that cannot hold `503`; a dial failure retried within `try_duration`; the policy a parameter (`'none'` for A2's waker); `[M2]` (c′) and (c″) (Decision 4, Task 2) |
| **I5** | A dead member is routed around but never replaced or recorded | **Rich: *"Replace it automatically"*** — Decision 11, Task 6: the set watcher, a redeploy of the set, an Incident and `instance.exited` per exit, 0/1/4-minute backoff, three in an hour then stopped; Review Focus 7 and 8; Task 9's phases 4 and 5 |
| **I6** | What the deploy answers with N is unspecified | Decision 6: the first member that failed, or the set's first; the set read from `getEnvironment` |
| Minor: spec action timing | B decided before sitting 5, built in sitting 4 | B before sitting 4 |
| Minor: stale spec words | §11 *Redeploys* and §12's header sentence still say one | Spec action A, items 2 and 3 |
| Minor: a swallowed error | `driver.ts:772` | Removed in Task 4, with a test and control (c) |
| Minor: the retirer's skip | Keep *"nothing serves → skip"* | Decision 7, Task 5's test |
| Minor: callers `[M1]` must list | `launch/testing.ts:265-267` (`42P10`), `rehearsal.ts:378` | *Read this first* 15; Task 3 changes the first, Task 7 the second |
| Minor: a tie-break | *"the newest of the set"* ties | `(created_at, id)` — Decisions 1 and 6 |
| Minor: sizing | Sitting 6 is more than one session | Two sittings, 7 and 8 (Tasks 9 and 10) |
| Cross-plan 1 | A1's route shape and header conflict with A2's waker | The health policy is a parameter; the header is the bare id; `destroyInstance` leaves a route it is not in untouched |
| Cross-plan 2 | Four plans change §11's interface | The order, stated above the spec actions |
| Cross-plan 3 | `recover.ts`'s passes | Fixed in Decision 7 for all three plans |
| Cross-plan 4 | `deployRelease`'s shape per purpose | `shapeFor(kind, purpose, audience)`, one function (Decision 2); no caller-supplied count or resources |
| Cross-plan 7 | The events CHECK must be cumulative | Task 6 says so |

**Not taken:** nothing. **Routine calls this revision made** (each recorded where it is decided): the whole set redeployed rather than one
member (Decision 11); production of every audience, `solo` included, replaced; the watcher polling the driver's `status` every 15 s; the
backoff's numbers and the cap of three in an hour; the count derived from the rows (`instances.replacing`), reset by a person's
deploy. **Two more were put to Rich and answered at 15:20, both as recommended**: a replacement skips §13's checklist and keeps the
approval's digest check (*"Skip the checklist"*), and a running member unhealthy for a minute counts as an exit (*"Yes, after ~1
minute"*) — *Decided by Rich* above.

**Checked before commit** by a fresh read-only agent, against the review and the other three plans; what it found here was fixed in
place: `status()` answers `gone` for a missing container and never throws, and `failed` also means a RUNNING member Docker calls
unhealthy — so an exit is `gone` or `failed` with an `exitCode`, and a running unhealthy member only after a minute (Decision 11); the
cap counts replacements STARTED, from `instances.replacing`, so a failed replacement counts and a dead member is recorded once; Task 2's
control (c) predicted a row that stubs the probe; Task 4's control (a) needed its no-mixed-set row in Step 1; the candidate during B's
run; two line references.

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

### Sitting 1 — 2026-10-13, 16:03–16:45 PDT (`manifest-a1-s1`, the second coordinated run's job S1): Task 1 — the measurements

**Opened** by `manifest-coord3`'s GO (16:03), which relayed Rich's decisions of 16:01 (the decisions file's *2026-10-13, 16:01* entry,
`c0f969e`): **inline** execution (answer 6), **`reading-updates` let go** (answer 2), the three tracked defects and F16(b)'s build **folded
into A1** (answer 3), Spec actions A and B **approved** (answers 4 and 5), the night-shift spec rule (answer 9); and at ~16:05 his three
standing permissions (`1fb75f8`). HEAD `c0f969e`; `manifest-coord3` committed `1fb75f8` and `3487e68` during the sitting, nothing of
theirs staged here. **Task 1** (`a70b94b`): the record is [`../spikes/instances-baseline/README.md`](../spikes/instances-baseline/README.md),
its raw output `results-task1-2026-10-13.txt`, its probes `probes/`. `[M1]`'s fifteen facts and the inventory of every caller and header
reader were read by three read-only surveys, and the claims the record leans on hardest re-read by hand (fact 10 in the built image; the
route builder; the contract's version; `registrationInForce`). **The plan's `[M3]` stop FIRED, and Rich answered it within the sitting.**
The close-out corrected the plan's nine `1.8.0` lines to `1.9.0`, wrote Rich's placements into the sittings table, split Task 8, and put a
*SITTING 1 MEASURED* note under each task a measurement changed (2–7). **The machine as found**: 39 containers, 64 images, 18 networks,
57 volumes before and after (the throwaway Caddy, its six upstreams and network removed at 16:34); the three cleanup scripts bare — no dead
network, volume or image (`reading-updates`' and `a8-clocks-1`'s containers still exist, so the script keeps theirs), 18 orphan mirrors
(`reading-updates`' the new one), and LiteLLM's two unheld budgets (a person's agent budget and the platform's intake budget) removed by
`litellm-orphans.sh --apply` — every app-held user (both apps', six) left alone.

1. **F1 — `[M3]`: A CWL SIGN-IN CANNOT CROSS INSTANCES** — the plan's stop. Two SP processes built by the repository's own
   `skeleton/auth/ubcshib.js` on a built app image's `node_modules` (passport-ubcshib 0.1.7-rc.1, @node-saml/node-saml 5.1.0, passport-saml
   5.1.1), a throwaway IdP key: an assertion answering the other process's AuthnRequest is refused **`InResponseTo is not valid`**, both
   ways; every same-process control signs in; a replay is refused. **Why:** the skeleton sets no `validateInResponseTo`; passport-ubcshib's
   `normalizeValidateInResponseTo(undefined)` answers `'always'` (`index.js:123-129`); node-saml's default `cacheProvider` is a per-process
   `InMemoryCacheProvider` (`saml.js:92`), read BEFORE any signature (`:513-516`). **The positive control** — the same with ONE added
   option, a `cacheProvider` both processes share — signs in all four orders and still refuses the replay; passport-ubcshib passes the
   option through unchanged. Sent to `manifest-coord3` at 16:23 as the fork; **Rich, ~16:28: *"I'm confortable going with your
   recommendations"*** (`3487e68`) — the cache in the app's own Mongo, built in sitting 3 beside Task 4 (Task 8a).
2. **F2 — PRE-EXISTING, NEWLY RECORDED: a sign-in in flight across a REDEPLOY fails today, with one instance** — the new instance never
   issued the id the old one did. It follows from F1's measured mechanism; it was not measured through a redeploy. Task 8a closes it.
3. **F3 — `[M3]`'s app-level form was REFUSED by the permission classifier, `[Production Reads]`** (16:18): a sibling of `reading-updates`'
   staging container started with that container's environment (`docker inspect` into a 0600 env-file — secrets included). It never ran;
   no file and no container existed. **Not retried**; reported to `manifest-coord3`, which judged the library-level form a DIFFERENT action
   (it reads no app's environment and touches no running app) and allowed it with conditions (16:20): a built image's `node_modules` only,
   `--network none`, a throwaway keypair removed after (16:23). **A second refusal, `[Modify Shared Resources]`**, met a READ-ONLY `find
   docs -name '*.html'` beside the spec edit; not retried — the four pages' paths came from ORIENTATION §6's table instead.
4. **F4 — `[M2]`: Decision 4 holds as written** (a throwaway Caddy 2.11.4 from `manifest-caddy:local`, its own network, ports 7190/7191,
   removed at the close). Round robin; the header EXACTLY the answering instance's bare id, from `{http.reverse_proxy.upstream.host}` and a
   `replace` of `^mf-i-` in the same deferred handler, the app's forged value gone; every probe carrying `X-Manifest-Probe: health`. **The
   exact JSON Task 2 writes is the record's.** The throwaway raised the rate limit to 1,000,000 for its loops — the one difference.
5. **F5 — `try_duration` is load-bearing:** a member `docker kill`ed mid-loop failed **0 of 391** requests with it (max 269 ms) and **3 of
   391** without — two `502` at once and one after hanging 3,004 ms.
6. **F6 — the passive policy without `503` keeps a shedding member in rotation** (97 of 292 answers its `503`, `fails` 0), and its control
   (`503` in the list) ejects it; a member whose HEALTH path answers `503` is ejected by the ACTIVE check, as Decision 4 means.
7. **F7 — a set PATCHed in under a loop, checks on: 0 of 450 failed, and no answer from the old set after the first from the new**, by
   request start and by completion — what Task 4's *"no mixed set"* row asserts is achievable. Caddy probes each fresh upstream at
   provisioning; whether one counts healthy before that probe returns was not separable.
8. **F8 — a response the EDGE makes carries NO `X-Manifest-Instance`**: `502` with no health checks, and **`503`** (*no upstreams
   available*) with them once every member is down — the placeholder is empty and Caddy omits the header. Every *"header absent"* check
   keeps its meaning; a classifier that expects `502` for *"nothing serves"* meets `503` (Task 2's note).
9. **F9 — a WebSocket survives a re-apply that removes its upstream** (and an unrelated one), closing only when its container stops; **the
   drain's `num_requests` survives a PATCH that removes the address**, which leaves the pool once its requests finish.
10. **F10 — Caddy's sticky cookie is `SameSite=Lax`** over HTTP (`mf_lb=…; Path=/; HttpOnly; SameSite=Lax`), which a browser does not send
    on the IdP's cross-site POST — the measured reason the fork's option (2) was weaker than it looked. Over TLS: not measured.
11. **F11 — `[M1]`: nothing changed in meaning; four kinds of thing the plan does not name** — readers of the header (three staging
    journeys, `demo-redeploy.sh`'s comparisons and asker loop, `redeploy-summary.mjs`, two production Docker-tier tests), six one-route
    sites in the fake driver, the Incident prompt's hard-coded *"failed to start"*, and route writers that delete by hostname. Each is in the
    *SITTING 1 MEASURED* note of the task that changes it (2–7) — Task 5's Files gained the readers, as Step 1 asks.
12. **F12 — `[M4]`: an idle node-ts-mongo instance is 50–59 MiB of its 512 MiB limit**; Docker's VM 7,934 MiB, 3,122 used, 4,570
    available. Three instances add ~120 MiB idle over one; a `class` redeploy holds four for its drain.
13. **F13 — `[M5]`: `pnpm test` ONCE, at `manifest-coord3`'s *"7100 is yours"* and HOLD (16:25): **212 files, 3534 tests, all passed** in 1,006 s — equal to
    `EXPECT_FILES`/`EXPECT_TESTS`, nothing moves; `bus.test.ts` did not redden. Contract `1.8.0`; migration `0054` free. **It emptied 7100**:
    `reading-updates`' rows went (Rich's answer 2), and with the users table, `operator`'s admin grant (the coordinator counted 0 projects, 0
    users) — 7100 not restarted, PID 2683, as after `manifest-p9`'s run.**
14. **F14 — F16(b)'s Spec action APPLIED** (`daf2ad0`), Rich's words exactly; **§21's label beside it** (`1c3066c`, judged minor by
    `manifest-coord3` under answer 9, for his review); the four shared pages checked — none restates either. **Rulings this sitting made**
    (the ledger's): `[M3]` measured at library level rather than through the IdP (F3); each hop aimed at a chosen process rather than left
    to round robin, which makes both orders certain; `[M4]` from the running app instances rather than starting `launch-app` (it needs 7100
    and a demo); `pnpm test` ONCE (`[M5]`) — no code changed, so the close's *"twice on the final tree"* would run an unchanged tree again.

### Sitting 2 — 2026-10-13, 16:46–18:20 PDT (`manifest-a1-s2`, the second coordinated run's job S2): Tasks 2 and 3, and F16(b)'s build

**Opened** by `manifest-coord3`'s GO (16:46), relaying Rich's decisions of 16:01 (`c0f969e`: answer 3 put F16(b)'s build here; answer 6
inline), his standing permissions of ~16:05 (`1fb75f8`: the cleanup scripts' `--apply`) and the `[M3]` answer (~16:28, `3487e68`: the SAML
cache in sitting 3, not here). HEAD `8239d15`, clean. **The windows were the coordinator's**: *"7100 is yours"* for single files (16:5x),
the HOLD from 17:14:17 for the Docker tier, the demo and `pnpm test` twice; the mock edit held for W3's acceptance and begun at its word
(17:15), its notice's content sent before the commit and landed on *"land it"*. Commits: Task 2 `98a9a9f`, Task 3 `941789c`, F16(b)
`3bcb269` and `0c7a2a3`, and this close-out. Every decision is a `Ruling:` line in the plan's git-ignored ledger; the ones a later
sitting inherits are in the *SITTING 2 BUILT* notes under Tasks 4 and 5.

1. **F1 — Task 2: an app's route dials every instance, `[M2]`'s JSON exactly** (`routing/caddy.ts`): round robin always;
   `appHealthPolicy(healthPath)` — active checks every 5 s (2 s timeout, `200`) carrying `X-Manifest-Probe: health`, passive on dial
   failures, `502` and `504` within 10 s (a type that cannot hold `503`), a dial failure retried for 3 s every 250 ms — or `'none'` (no
   `health_checks`, no retry: A2's waker); `X-Manifest-Instance` set to `{http.reverse_proxy.upstream.host}` and its `^mf-i-` removed by a
   `replace` in the same deferred handler. A set of one is today's route but for the selection policy and the header (a pin of everything
   else). `upstreamsOf` reads every upstream (`upstreamOf`'s `[0]` was the retire guard's hole), `instanceIdsOf` names them off their
   aliases, `servingRoute` answers `{ route, upstreams, instanceIds }`, `waitForIdentities` waits for every member (one unseen `4 × N`
   answers after the first in-set answer is named then, not after the timeout). **Ruling:** `HealthPolicy`'s durations are nanosecond
   numbers, not the plan's strings — the edge receives them as written, and `[M2]` measured that JSON.
2. **F2 — ON THE REAL EDGE** (`routing/routes.docker.test.ts`, a describe of its own): a two-upstream route **applied and read back** —
   the JSON `manifest-caddy` holds equal to `buildRoute`'s — ten sequential requests **five each, every header exactly one bare id with
   the body that id's stub serves**, `waitForIdentities` through the edge ready on both; **a member answering `503` (its `/healthz` `200`)
   kept in rotation** (≥ 8 of 20); **one of two `docker kill`ed and the next ten all `200` from the survivor**. Negative controls, each
   restored: **(a)** `upstreamsOf` reading only the first — red exactly on the two set rows (the retire guard's witness and the set read);
   **(b)** `503` in the passive list (a cast past the type) — red on both JSON pins and the Docker `503` row, *"expected 2 to be greater than
   or equal to 8"* (ejected after two); **(c)** the prefix `replace` dropped — red on three JSON pins and five Docker rows (the old loop
   test, the forger, all three set cases). `waitForIdentities`' unit rows stub the probe and cannot see a route, as the plan said; its
   Docker row reddened under (c) behind the header.
3. **F3 — THE HEADER IS ONLY AS TRUE AS THE DIAL, so `buildRoute` refuses an upstream that does not dial its own instance's alias** (and
   an empty set). It moved the Docker tier's stubs onto `mf-i-<id>` aliases (`stubAppArgs(name, body, headers, { aliases, status })`):
   `listener-split`'s one stub carries both instances' aliases; the forger got an id of its own (two containers sharing an alias would be
   round-robined by Docker's DNS); the pre-P4c retire-guard case writes its container-name route as raw JSON. `instanceIdOf` is gone.
4. **F4 — THE DRIVER WRITES A SET OF ONE WITH `health: 'none'` UNTIL TASK 4** (a ruling: Task 4's Files give it `appHealthPolicy`
   together with its set and contract cases), **and NO CONTAINER LABEL CARRIES THE HEALTH PATH** — so Task 4's `restoreRoute(ids)` cannot
   build an app's health policy from a container alone (Task 4's *SITTING 2 BUILT* note).
5. **F5 — Task 3: the plan's *"Task 5 lands the deploy's"* could not hold.** With the key on `(hostname, instance_id)` Postgres refuses
   `ON CONFLICT (hostname)` — **`42P10`, measured on every case of the new test**, through `stagedRelease`'s upsert — so every healthy
   deploy would have failed from this commit to sitting 4. **Both writers moved to `replaceRouteSet(db, { hostname, listener, instanceIds
   })`** (`db/routes.ts`: delete then insert in one transaction, refusing an empty set; the listener because every row records it), the
   deploy's as a set of one. Migration `0054_daffy_ezekiel.sql` (drop `routes_hostname_key`, create `routes_hostname_instance_key`) read,
   applied with the admin URL, read back from `pg_indexes`. `releases.test.ts`'s Route-row case no longer pins the row's id across a
   redeploy (nothing refers to a Route by id). **The control** (the old key re-created by hand on the dev database, then dropped): red on
   the two-rows row and `replaceRouteSet`'s set row — and the constraint-NAME row stayed green, because with both keys Postgres reports the
   pair first; that row's red is the pre-change run's (*"expected 'routes_hostname_key' to be 'routes_hostname_instance_key'"*).
6. **F6 — F16(b), THE PLATFORM** (`3bcb269`): `iamItem`'s first-launch predicate is `registrationInForce(row)` — a change with the
   Manifest team, filed with UBC, or sent back with UBC's questions is **met** when UBC's registration covers the release serving staging,
   saying where the change is, and **unmet naming the gap, since the send,** when it does not; an `active` row reads exactly as before; a
   lapse is not in force. `changeBeforeLaunch` is gone; `changeRequestOnFile` gains UBC's questions on a change (*"… draft it again and
   send it to the Manifest team (sendIamRegistration); …"*) — so a launched app's live item says it too, in that one state. No published
   description states the predicate: **the contract did not change.** The control (the branch narrowed back to `active`): red on the (b)
   case, and on the *covers* guard I predicted green — with the in-force branch gone a `sent` row falls to the not-in-force branch, which
   states no coverage gap.
7. **F7 — F16(b) THROUGH THE EDGE, in `make demo-launch`** (a ruling: built into the demo's fresh path, so sitting 8's acceptance re-runs
   it): step 8 now commits a manifest asking for `eduPersonAffiliation`, drafts and sends the change to the Manifest team **before** the
   launch, reads the item **met** and the checklist **ready**, launches, then has the team hand the change back and commits the manifest back
   for steps 9–11. **Run once on driver 1 (17:38–17:42), fresh path, `launchpath-local`: every check passed (161 `ok`).** 7100 ran on
   driver 1 by `bash scripts/gateway-controls.sh start local` — which unsets `.env`'s driver-2 block in its own start subshell — instead of
   the `.env` swap: the same effect, nothing to restore (the coordinator agreed). The demo is also the first deploy through the edge on
   Task 2's route and Task 3's rows: production answered on the public listener **as the instance the deploy started** (the header off the
   alias). Its F16(b) check was not separately watched red through a demo (a ruling: it reads the very item the unit control reddened).
8. **F8 — F16(b), THE MOCK** (`0c7a2a3`, packages/mock — the G3 notice sent at the edit's start and before the commit): `iamItemOf(row,
   base)` reads a registration in force as met with the platform's words for a change (exported for its own tests: no stage holds a filed
   or UBC's-questions change); **every existing stage answers exactly as before** (`change-with-team`'s words kept — the front end's tests
   read them live); **a new stage, `MANIFEST_MOCK_RECORDS=change-before-launch`** — `change-with-team`'s records on an app NOT launched: met,
   ready, a production deploy answering production's own instance — on the server's allow-list and in `docs/api/frontend.md`. The control
   (the old rule, `active` or `sent` from `active`): red exactly on the filed and UBC's-questions rows. W2 (I1 (a)) starts on this close-out.
9. **F9 — THE DOCKER TIER: 293/293 in 44 files, 1364 s, on `3bcb269`** (17:15:09–17:37:54; networks 18 → 25), +3 — Task 2's set cases.
   ORIENTATION §2's row moves 290 → 293.
10. **F10 — `pnpm test` twice on the final tree** (`0c7a2a3`, under the HOLD): **214 files, 3560 tests, all passed, both runs** (17:43–18:00, 1019 s;
    18:00–18:16, 970 s) — +26 tests and +2 files (`db/routes.test.ts`, `packages/mock/src/launch.test.ts`); `EXPECT_TESTS` 3534 → 3560 and
    `EXPECT_FILES` 212 → 214, each counted in `scripts/ci-acceptance.sh`'s comment. `bus.test.ts` did not redden. lint 0, typecheck clean
    (six packages), `format:check` clean. The working runs before it: the routing units from a no-truncation scratch config (the DB-free
    memory), the DB files and `routes.docker.test.ts` alone under *"7100 is yours"*.
11. **F11 — THE MACHINE.** As found: 39 containers, 64 images, 18 networks, 57 volumes; 7100 PID 2683 on real GitHub (`5869070`), EMPTY.
    **At the close**: 7100 restarted from `.env` on real GitHub (`gateway-controls.sh start real`, PID 95289; capable model and
    `ubc-qwen-27b` registered) and EMPTY (the suite truncated what the demo made). **Removed**: the demo's own — 9 `mf-launchpath-local-*`
    containers, its three runtime routes (DELETE by `@id`; none with an `@id` left on `srv0` or `srv1`), its networks, volumes and images,
    and its driver-1 repository `.manifest/repos/launchpath-local.git` (born 17:39, so not there before); the tier's seven dead fixture
    networks and a volume; **and at Rich's word (~18:14, *"go with the recommendations"*, `40c0f82`, relayed by `manifest-coord3` and read
    there) `reading-updates`' and `a8-clocks-1`'s leftovers** — 18 containers by name (`docker rm -f -v`), 6 networks, 12 volumes, 4 images
    and 6 LiteLLM users (with two unheld budgets and `p4b-probe-user`), every script re-read to zero; their GitHub repositories and mirrors
    left for Rich, who is deleting them himself. **`make verify`: 67 checks, 0 failed, 0 warnings**, per-app resources 0/0/0. The machine:
    39 → 21 containers, 64 → 60 images, 18 → 12 networks, 57 → 39 volumes — every difference the two apps' removal. **And FE-59** (Rich,
    `40c0f82`) is placed in sitting 5's Task 6 — the sittings table and Task 6's Files carry it.
