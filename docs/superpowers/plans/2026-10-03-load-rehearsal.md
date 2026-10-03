# The Load Rehearsal — §24, FE-44 — Implementation Plan

> **WRITTEN 2026-10-03, AFTERNOON, BY THE PLANNING SESSION `manifest-c7`** (coordinated by `manifest-94`), after FE-32's plan and placed
> BEFORE it: Rich, 2026-10-03, ~13:46 PDT, answering FE-44, *"Build the load rehearsal first"* — §24's load rehearsal, before faculty use
> it for real, as a plan of its own, after the Manifest team's step and before FE-32. **Every fact in *Read this first* was read from the code
> at `e969f9d`**; three plans run before this one, so **Task 1 re-reads every fact** into `spikes/load-baseline/`.
>
> **§24 leaves most of the rehearsal open, and Rich answered three questions on it** (2026-10-03, ~13:52 PDT, through `manifest-94`):
> **production's instances by audience are BUILT FIRST** (*"Build §24's capacity first"*; then *"A1 → B → A2"*) — by the plan before this
> one, [`2026-10-03-production-instances.md`](./2026-10-03-production-instances.md) — so this rehearsal grants staging production's real
> shape, N instances; **the profile and the pass mark *"As proposed"***; and **a re-run at the first launch and when the
> audience is raised** (*"First launch + audience raised"*). **Three spec actions are DRAFTED at the end** (two at writing; the revision
> added C), **none applied.** **NOT YET APPROVED — revised (`2d74a5d`); a second fresh review before approval** (Rich, 2026-10-03, 15:20 PDT:
> *"A1 and FE-32 now; B and A2 later (Recommended)"* — B and A2 are reviewed again when each is next in line).
>
> **REVISED 2026-10-03, 14:37–15:19 PDT (read from the clock), TO A FRESH REVIEW** ([`2026-10-03-review-of-four-plans.md`](./2026-10-03-review-of-four-plans.md),
> its §2 and *Cross-plan*; verdict *needs rework*), by a fresh platform session at Rich's word (~14:33), coordinated by `manifest-94`. It
> builds in **Rich's answer on the generator — *"Build it locally"*** (Decision 3, Task 2). The operation now answers at once and is
> polled; the exemption is a `Driver` verb with its spec action (C); staging is held while a run lasts; the old sitting 3 is two. The
> review's line references were re-checked at `75030d8` and hold. **Every finding, and where it went, is in *Revised to the review*.**

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development, **whichever Rich chooses**. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9.

**Goal:** **A large course's or a public app's owner can take it to production.** Today they cannot: the checklist's `load-rehearsal` item
is `blocking` and `not_built` for a `large_course` or `public` audience, so `ready` stays `false` for ever (FE-44). After this plan **the
owner runs the load rehearsal**: Manifest gives staging production's capacity for the app's audience — its N instances, at production's
resources, behind one load-balanced route — puts the audience's arrival on it through
the edge for a bounded time, watches the app, judges it against a stated pass mark, records what it measured, and gives staging back its
own shape — and **the item is met by that measurement**, as D21's rehearsal item is by its own. **A failed one says why**, in numbers a
person can act on.

It is proved by **`make demo-load`**, on either driver: a `large_course` app rehearsed and passing, one that cannot take the load failing
with its reason, and the platform's own refusals. A person clicks it too.

**Architecture:**
- **One operation, `runLoadRehearsal`** (`POST /v1/projects/{projectId}/load-rehearsal`), the owner's, person-only and stepped up — D21's
  capability, `launch:rehearse` — **answered at once, `202`, with a `LoadRehearsal` record in state `running`**; the run goes on in the
  control plane, and a client polls **`getLoadRehearsal`** (`GET /v1/projects/{projectId}/load-rehearsals/{loadRehearsalId}`) until it is
  `passed`, `failed`, `teardown_failed` or `abandoned`, as it polls a build. *(The review's C1: a run takes up to ~10 minutes, and Node's
  `fetch` — the journey's client, and almost certainly the faculty front-end's server — waits at most 300 s for response headers.)*
- **The grant is a redeploy**: the candidate release redeployed to STAGING in production's shape — `deployRelease`'s `purpose:
  'load-rehearsal'`, which **A1's `shapeFor` gives production's count for the audience and production's resolved resources** (one new row
  in that one function; no caller passes a count or resources) — and staging redeployed to its own one-instance shape in a `finally` and at
  boot. **While a run holds staging, every other staging deploy of the project is refused** (`409 LOAD_REHEARSAL_RUNNING`), so nothing
  replaces the granted set mid-run and the take-down never silently reverts someone's deploy.
- **The load is vegeta's** (MIT; Rich: *"vegeta"*), in an image **built locally** (Rich: *"Build it locally"*) from the already-mirrored
  `alpine:3.22` and vegeta's official release binary, **verified against its published checksum and a checksum pinned in this repository**;
  `make seed` builds it on any machine. It runs in a throwaway container on the platform network, reaching staging THROUGH THE EDGE — the
  engine seam D21's sign-in probe already uses (`sso/sign-in.ts`) — and prints its whole result as ONE JSON line last. Its one download is a
  Rich-step at sitting 2.
- **For the run's duration only, the staging route's per-IP rate limit does not apply to the generator's own address** (Rich: *"Exempt
  the generator's IP"*) — **through a new `Driver` verb, `setRateLimitExemption(hostname, address | null)`** (Spec action C, §11): only the
  driver applies routes, and the control plane outside it imports `routing/` for `listenerFor` alone (`releases/release.ts:20`,
  `launch/rehearsal.ts:16`).
- **The profile comes from the audience** (Spec action A's numbers, platform settings with those defaults); the pass mark is stated.
- **The item is met by the newest `passed` rehearsal of the candidate, at the audience it was run for** — scale and burst — and a new
  candidate, or an audience raised, makes it `unmet` again.
- **The contract goes to `1.9.0` ONCE, at Task 5**, the first schema change (A1 leaves it `1.8.0`; A2 then takes `1.10.0`, FE-32
  `1.11.0`).

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0 (host); the generator vegeta (MIT), its image built locally from `alpine:3.22` (by the
digest `infra/images.lock` holds) and its official `linux` release binary, checksum-verified (Task 2); Fastify 5.12.3, Drizzle over
Postgres 16, `zod/v4`, Vitest 2.1; Caddy with `caddy-ratelimit` v0.1.0 (`infra/caddy/Dockerfile`). **One new image, built here** (Rich,
2026-10-03); no new package.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read:
- **§24**, *Audience and scale* (l.2690-2780) — above all *Sandbox and staging ignore all of it* (l.2752-2762).
- **§13**, the checklist, and **D21**'s rehearsal (the pattern this follows) with **D24**'s person-only list.
- **§11**, the *Driver interface* (l.1102-1150) and *Redeploys* (a redeploy is a new instance beside the one serving).
- **§12**, the edge's rate limits and the hardening baseline.

**Roadmap:** the ORDER line in *The faculty front-end's message* (2026-10-03).

**Predecessor:** [`2026-10-03-production-instances.md`](./2026-10-03-production-instances.md) — A1, production's instances by audience (Rich,
2026-10-03: *"Build §24's capacity first"*, then *"A1 → B → A2"*). **This plan starts only after its acceptance closes.** Before it: the
Manifest team's step.

**Successor:** [`2026-10-03-hibernation.md`](./2026-10-03-hibernation.md) — A2, hibernation and wake-on-request; then FE-32
([`2026-10-03-fe32-dependencies.md`](./2026-10-03-fe32-dependencies.md)).

---

## How this plan is to be executed — sittings, one per session

> **SIX SITTINGS, PROPOSED** (five before the review, which judged the old sitting 3 too big for one session). Task 1 is first and alone.
> The generator, the edge's exemption and its `Driver` verb are Docker-heavy and share a sitting. **The run** — the grant, the load, the
> watch, the judgement, the record, the take-down and the boot's half — is one task in its own sitting, with no wire change. **The
> operation** — the route, its codes, its event, and staging held while a run lasts — is the next. The checklist and the clients share
> one. The acceptance is alone and last.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements**: every fact re-read; a container on the platform network reaching staging through the edge (the CA, SNI, the source address Caddy sees); the laptop's headroom (what vegeta sustains is Task 2's, after its download); a route whose rate limit skips one address, in a THROWAWAY Caddy from the edge's image; a staging set in production's N-instance shape, started and given back; the gate numbers | No | After Task 1's commit | ← **next**, once approved and the plan before it has closed |
| 2 | 2, 3 | **The generator** (vegeta built locally — its download and checksum a Rich-step at this sitting's open — its container, its one-line result) and **the edge's exemption** with its **`Driver` verb** (`setRateLimitExemption`, both drivers, the driver contract) | Yes — `launch/`, `routing/`, `runtime/`, `infra/` | After both commits, with one generator run through the real edge quoted. **It stops and asks Rich** if `[M3b]` finds the laptop cannot sustain Spec action A's profile — the numbers are his | |
| 3 | 4 | **The run**: grant, load, watch, judge, record — the row written `running` BEFORE the grant — and take down; one at a time platform-wide; **the boot's pass 2⅞**; the `load_rehearsals` table. No wire change | Yes — `launch/`, `releases/`, `db/` | After the commit, with one run through the edge on driver 1 from a scratch script, passed, and staging back in its own shape | |
| 4 | 5 | **The operation**: `runLoadRehearsal` (`202`) and `getLoadRehearsal`; its codes; `load_rehearsal.completed`; **staging deploys refused while a run holds the project**; **contract `1.9.0`** | Yes — `launch/`, `releases/`, `observability/` | After the commit, with the front-end told and one run through the edge polled to its end | |
| 5 | 6, 7 | **The checklist** — met by a `passed` measurement, at the scale and the burst, for the first launch and an audience raised (Q3) — and **the clients**: the console's *Run the load rehearsal*, the mock's stage, the guide | Yes — `launch/` | After both commits, with the front-end told | |
| 6 | 8 | **The acceptance**: `make demo-load`, three times on each driver; every other demo; a clicked half; the plan's one whole-branch review. **Alone, and last** | Yes, if any code changes | After the clicked half and the review's one fix wave | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates (`pnpm test` twice, alone, on the final tree), the Docker tier when owed, a dated
*What executing this plan found*, this table, and ORIENTATION §6's sweep. **Three rules survive any re-cut:** Task 1 first and alone; Task
8 alone and last; no task a spec action changes before Rich has decided it (**C before sitting 2**, where Task 3 adds the verb; **A before
sitting 3**, where Task 4 builds the profile; **B before sitting 4**, where Task 5 builds the person-only route).

---

## Decided by Rich — build them, do not re-open them

- **FE-44 (a) — *"Build the load rehearsal first"*** (2026-10-03, ~13:46 PDT, through `manifest-94`'s question tool;
  [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)): the platform builds §24's load rehearsal, before faculty use it for real, as
  a plan of its own, **after FE-46, FE-47 and FE-5, before FE-32**. *Rejected by that choice:* (b) a `not_built` item that does not block;
  (c) only saying so earlier. The front-end's *"waiting on the Manifest team"* line stays true meanwhile.
- **THE ORDER** (2026-10-03, ~13:58: *"A1 → B → A2"*): *faculty-ready* → the Manifest team's step (FE-46, FE-47, FE-5) → **A1, production
  instances by audience** → **the load rehearsal (this plan)** → **A2, hibernation and wake-on-request** → FE-32 with the allowlist → the
  vulnerability database → FE-45.
- **VEGETA, BUILT LOCALLY** — *"Build it locally (Recommended)"* (2026-10-03, ~14:33 PDT, through the question tool, answering the fresh
  review's I4): **an image built from the already-mirrored alpine plus vegeta's official release binary, verified against its published
  checksum; the download a Rich-step at that sitting.** (It replaces *"pinned by digest and mirrored"*, which assumed a published image whose
  provenance nobody had checked.)
- **Carried, still binding:** D21's rehearsal is the owner's (`launch:rehearse`, person-only, stepped up — the launch path plan's Spec
  action 8); D24; every refusal asserts its code; published text cites no section, decision or plan; the front-end is told before any
  commit to `packages/contract` or `packages/mock`.

---

## What Rich does, and when

1. **Review this plan, after its second fresh review** (Rich, 15:20: *"B and A2 later"*); his answers of 2026-10-03 are in *Asked of Rich*.
2. **The network, at sitting 2's open**, for Task 2's Step 1 alone: vegeta's release archive for this machine's architecture and its
   published checksums file downloaded, the archive verified against both, and the image built (*"its download a Rich-step at that
   sitting"*).
3. **Read and decide Spec action C before sitting 2, A before sitting 3, and B before sitting 4.**
4. **The clicked half, sitting 6**: as `instructor`, run the load rehearsal on a large-course app in the console — stepped up — and watch it
   run and finish; read its result; read the checklist turn `met`. **Agents may type the laptop IdP's test passwords** (his standing yes);
   the clicked half is still a person seeing it.

---

## Read this first — what this plan knows from the code

*Read at `e969f9d` on 2026-10-03; the facts the revision added were read at `75030d8`. Task 1's `[M1]` re-reads every one.*

**What §24 asks, and what exists.**
1. **At `e969f9d`, §24's production table is not built**: `audience` (`{ scale, burst }`, `projects.audience`) is read in ONE place,
   `launch/readiness.ts:226-240` (the `not_built` item), and production runs one instance whatever the scale. **The instances plan before
   this one (A1) builds the instance counts** (solo 1, class 2, large_course 3, public 3) behind one load-balanced route, **in one function,
   `shapeFor(kind, purpose, audience)`**; Task 1's `[M1]` reads what it built — the deploy's shape, the route's upstreams, the driver's set
   of serving instances — before anything here.
2. **The item is in BOTH of D9's clauses** (`readiness.ts:166`, the launched list; `:196`, the first launch's), so a launched large app
   would be blocked on every later release too — moot today, because none can launch.
3. **Staging is one instance**, its resources resolved from the manifest's three layers for `staging` (`spec/resolve.ts:88`:
   `spec.environments[kind]`); production's are resolved the same way for `production`. **A1 keeps staging at one, and its readers rely on
   it** (`launch/candidate.ts:43`, the candidate is staging's serving instance) — this plan breaks that for a run's length, and only for the
   candidate's own release. **Nothing hibernates on its own** today; A2, after this plan, hibernates staging.

**D21's rehearsal — the pattern.**
4. `launch/rehearsal.ts`: `runRehearsal` (`:110-…`) is **one at a time per project** (`tryWithRehearsalLock`, `db/locks.ts:66`; `409
   REHEARSAL_RUNNING`), deploys through **`deployRelease` with `purpose: 'rehearsal'`** (`releases/release.ts:200`, `:285-310`), measures,
   **takes down in a `finally`**, and the boot takes down a left one (`takeDownLeftRehearsals`, `:412-440`, `recover.ts`'s pass 2¾). Its
   record is the `rehearsals` table (`db/schema.ts:1043-…`) with an `evidence` jsonb; `rehearsalItem` (`:710-…`) is met by the newest
   PASSING record for the candidate. Its route is `launch:rehearse`, person-only, stepped up. **`REHEARSAL_RUNNING`'s hint says *"up to
   about two minutes"*** (`api/error-codes.ts:619-622`) — true of D21's, wrong for this one.
5. **Its measurement runs in a container through the engine seam** (`sso/sign-in.ts:177-309`, `createCwlSignInProbe({ engine, … })`):
   create, start, wait, read the logs' LAST JSON line, `DELETE …?force=true&v=true` — bound at boot in `src/index.ts`. **Not through the
   `Driver`**, which §11 keeps to what the control plane asks of infrastructure for an app.

**The edge.**
6. **Every app route carries a per-client-IP rate limit, 600 a minute by default** (`routing/caddy.ts:52-69`: `handler: 'rate_limit'`,
   `max_events: input.rateLimit ?? 600`) — ten a second from one address. **A generator from one container would measure the limiter,
   not the app.** (ORIENTATION §4 trap 21.)
7. **A container reaches a platform hostname through the edge** as D21's probe does (`sso/sign-in.ts:185-190`: the internal listener,
   SNI, the platform CA); Task 1's `[M2]` confirms for staging.
8. **Only the driver applies a route.** Outside `runtime/docker/`, the control plane imports `routing/` for `listenerFor` alone
   (`releases/release.ts:20`, `launch/rehearsal.ts:16`), and the fake driver's call list — what the run's order test reads — sees only
   `Driver` calls. **`restoreRoute` rebuilds a plain route** from the container's labels (`runtime/docker/driver.ts:711-733`; A1 makes it
   a set), with no exemption.

**Who may.**
9. **`launch:rehearse`** is person-only (`projects/authz.ts:202-209`) and step-up-guarded, held by the owner and a collaborator (the launch
   path plan's Task 6b, FE-42) — the same people this rehearsal is for.

**Added by the revision** (the review's C1, I3, I6).
10. **No Node client can wait out a run.** The journey's client uses the global `fetch` with no dispatcher
    (`packages/contract/src/client.ts:73-75`; a caller may pass its own `fetch`, and none does), and Node's `fetch` (undici) gives up on
    response headers after **300 s** by default — a synchronous 8–10-minute operation cannot be called by `make demo-load`, nor, almost
    certainly, by the faculty front-end's server.
11. **A deploy holds staging only while it deploys.** `withEnvironmentLock` wraps each `deployRelease` (`release.ts:407`) and nothing
    longer, so between the grant and the take-down any staging deploy — a token's included — replaces the granted set, and the take-down's
    redeploy then silently reverts it.
12. **The boot's passes** (`releases/recover.ts`): 0 builds; 1 the Route records (A1: sets); 2 a deploy left mid-way (`provisioning`,
    `starting`, `waking` → `failed`); 2½ archives; **2¾ a D21 rehearsal left serving (`takeDownLeftRehearsals`)**; **3 the retire passes,
    LAST** (`:184-200`). A1's Decision 7 fixes the order for all three plans, and gives this plan **pass 2⅞**, after D21's and before the
    retirer.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.9.0`, AT TASK 5**, the first schema change; Tasks 6 and 7 add to it. Additive: two operations, one
   representation, its codes, one event. (A1 takes `1.8.0`, A2 `1.10.0`, FE-32 `1.11.0`.) Task 4 changes nothing on the wire.
2. **THE GRANT IS A REDEPLOY OF THE CANDIDATE TO STAGING IN PRODUCTION'S SHAPE** — `deployRelease(…, { purpose: 'load-rehearsal' })`, and
   **the shape is `shapeFor`'s new row** (A1's one function, `releases/shape.ts`): **staging, `'load-rehearsal'` → production's count for
   the audience, at production's resolved resources**. `deployRelease` refuses `'load-rehearsal'` for any environment but staging (a plain
   `Error`: no client can reach it). **The take-down is a redeploy of the same release to staging's own shape** (`purpose: 'launch'`'s
   staging row: one instance, staging's resources), in a `finally` and at boot. A redeploy is new instances beside the ones serving (§11),
   so staging never goes dark. **"Production-shaped" is production as A1 builds it** (Rich: *"Build §24's capacity first"*): the audience's
   instance count, production's resources, the same load-balanced route; the record says the shape.
   *Rejected:* a `DeployInput.instances` / `.resources` override (this plan's first draft) — three plans would each grow an override path,
   and a caller-supplied resource is a hole a refusal then has to close; a purpose can only ask for the shape its row gives (the review's
   minor and cross-plan 4). *Rejected:* `docker update` of the serving container's limits — a new driver method (§11) for one caller, and a
   container whose limits were changed live is not the image's own start-up under load. *Rejected:* rehearsing in production, D21's way —
   production's listener is the public one, and load is not a sign-in.
3. **THE GENERATOR IS vegeta, BUILT HERE** (MIT; Rich: *"vegeta"*, then *"Build it locally"*): `infra/vegeta/Dockerfile` — `FROM` the
   mirrored `alpine:3.22` by digest, the release binary copied in, `vegeta --version` run at build time — tagged into the local registry by
   `make seed`; **its version and the release archive's sha256 for each architecture pinned in `infra/vegeta/vegeta.lock`**, and a download
   whose sha256 matches neither vegeta's published checksums file nor the lock is refused (ORIENTATION's pinning rule: the current release,
   recorded with the day and the reason). It runs in a throwaway container on the platform network, reaching staging's hostname through the
   edge with the platform CA mounted. **Its result comes out as ONE JSON line, last** (the sign-in probe's convention), built inside the
   container by its own shell from the results on its tmpfs: **each phase's `vegeta report -type=json`; the whole run's, over every phase's
   `.bin` (`vegeta report -type=json <all>.bin`)**; and **per-path status counts** from `vegeta encode -to csv`, folded by busybox `awk` —
   so a `3xx` is answered only on a path that expects one, and nothing per-request ever leaves the container. **Arrival is a RATE** (requests
   a second, vegeta's own unit), because §24's second question is about arrival. **The rate vegeta ACHIEVED is read from its own report
   and compared with the rate asked**, so a generator-bound run is a FAILURE, never a pass (Decision 8). *Rejected:* k6 (AGPL); the Node
   script (Rich's answer); a published vegeta image (provenance unchecked — Rich's answer).
4. **WHAT IS LOADED: WHAT A CROWD DOES FIRST** — the app's `/` (or the starter's index), its `health_path`, and, for a CWL app, its sign-in
   redirect (`auth.callback`'s login path, answered `302` without following it to the IdP). *Rejected:* synthetic signed-in sessions —
   UBC's staging IdP has no load users, so it would not be portable. The record names the paths.
5. **THE EDGE'S EXEMPTION IS FOR ONE ADDRESS, FOR ONE RUN — AND IT IS A `Driver` VERB** (the review's I2; Spec action C):
   `setRateLimitExemption(hostname: string, address: string | null): Promise<void>` re-applies the hostname's route as it stands — its
   set, its health policy, its headers — with its `rate_limit` handler skipped for that one address (a `not remote_ip <addr>` matcher —
   Task 1's `[M4]` measures the shape), or, given `null`, without any exemption. The run sets it after the grant and clears it before the
   take-down; the take-down's redeploy builds a plain route anyway, and the boot clears it too. The fake driver records it, so the run's
   order test sees it. Every other client keeps 600 a minute; nobody can widen it with a header.
   *Rejected:* keying the limit by a per-user header — any client could then send the header and escape its own limit. *Rejected:*
   calling `routing/`'s `applyRoute` from `launch/` — only the driver applies routes (*Read this first* 8), and a second writer of a route
   is how a route and its records drift apart.
6. **ONE LOAD REHEARSAL AT A TIME, PLATFORM-WIDE, AND STAGING IS THE RUN'S WHILE IT LASTS.** The refusals, each with its own code and an
   honest hint:
   - another project's run under way → **`409 LOAD_REHEARSAL_BUSY`**, naming nobody else's project;
   - this project's own run under way — asked again, or D21's rehearsal asked for, or **a staging deploy of this project by anyone** (a
     token's included) → **`409 LOAD_REHEARSAL_RUNNING`**, its hint *"up to about ten minutes; read `getLoadRehearsal`"* (the review's I3
     and its hint minor) — checked **under the environment's lock** against the project's `running` row (Decision 9), so a deploy that
     started before the row exists finishes first and the grant then waits for it;
   - D21's rehearsal of this project under way when a load rehearsal is asked for → **`409 REHEARSAL_RUNNING`** (its hint is true there).
   The laptop — and, at UBC, the shared cluster — is the shared resource, and two at once would measure each other. An advisory lock on
   its own pool (the launch path plan's sitting 12 lesson: never on the query pool). **An archive mid-run** takes staging away: the take-down
   finds the project archived, redeploys nothing (the archive has retired every instance and switched the name off), and the record ends
   `abandoned`. *Rejected:* letting a staging deploy abort the run and skip the revert — an agent's routine deploy would silently throw
   away ten minutes of a person's measurement.
7. **THE PROFILE IN RATES, AND THE RUN BOUNDED.** Rich's *"500 virtual users"* (*"As proposed"*) becomes vegeta's rates by one stated rule,
   **which is this plan's and goes to Rich in Spec action A's words** (the review's I5 — it alone decides pass or fail): **an arriving user
   asks for the three paths once, and a user who has arrived asks for one every 10 s; no page assets are loaded.** So `synchronised` is
   **75 a second for 60 s** (500 × 3 arriving, plus those already there), **then 50 a second for 5 minutes**; `steady` is **a ramp of 10,
   20, 30, 40 and 50 a second, a minute each**. `public` is the same on a laptop — the stated cap — and every number is a platform setting
   (Decision 12). A hard stop at 8 minutes, the generator's container removed whatever happens. **Answered at once, `202`, with the
   `running` record** (the review's C1); the run takes up to ~10 minutes and a client polls `getLoadRehearsal`.
8. **THE PASS MARK** (Spec action A; Rich, *"As proposed"*): **≥ 99% of requests answered without a `5xx` or a timeout**; **p95 under 2 s**;
   **every instance `healthy` throughout** (each polled every 5 s through the driver's `status`) **with no exit and no out-of-memory
   exit** — an app container is never restarted in place (`RestartPolicy: 'no'`), so what a person would call a restart is an exit, and
   A1's watcher, which is production's, does not replace it here. A failure names the first rule it broke, with the number (*"p95 was 4.8 s;
   the mark is 2 s"*).
9. **THE RECORD, `load_rehearsals`** — **INSERTED `running` BEFORE THE GRANT** (the review's I6), so a boot can find a run a stopped process
   left: `id`, `project_id`, `environment_id` (staging's), `release_id`, `image_digest`, `scale` and `burst` as rehearsed, **`state`**
   (`running` → `passed` | `failed` | `teardown_failed` | `abandoned`), `profile` (the rates, the durations, the paths), `granted` (the
   count and the resources), `generator_address`, `evidence` jsonb (`requests`, `answered`, `status_counts`, `p50`, `p95`, `p99`,
   `timeouts`, `achieved_rps`, `instance_exits`, `oom`, `duration_ms`, `reason`), `run_by`, `created_at`, `finished_at`, `taken_down_at`.
   **`passed` is written only after the take-down has given staging back** — a run that passed and could not be taken down ends
   `teardown_failed`, with its judgement in `evidence`, and **never meets the item** (the review's minor). **Never a response body.**
10. **THE ITEM** (`load-rehearsal`): before launch, **met by the newest `passed` record for the candidate's digest that COVERS the project's
    audience** — its scale at least the project's (`public` covers `large_course`) **and its burst at least the project's (`synchronised`
    covers `steady`, whose rates it exceeds)** (the review's minor: scale was compared, burst was not); `unmet` with the newest failed
    record's reason, or *"not rehearsed yet"*, or *"running"* while one is. After launch (Rich, *"First launch + audience raised"*;
    readiness's second clause changes accordingly): **met while some `passed` record covers the project's current audience** — so a later
    release needs none, and raising the scale or the burst needs one. `builtBy` is gone from it; a `not_built` load-rehearsal item is a
    regression.
11. **ONE EVENT, `load_rehearsal.completed`** `{ loadRehearsalId, releaseId, state, p95Ms, answeredRatio, reason }`, its sentence naming
    who ran it and the result — published once the record leaves `running`, by the run or by the boot.
12. **THE PROFILE'S NUMBERS ARE PLATFORM SETTINGS** with Spec action A's values as defaults (`MANIFEST_LOAD_PEAK_RPS_LARGE`, …), as every
    platform setting is today (deployment configuration), so UBC's cluster can set what a laptop cannot. **`make demo-load` runs with them**
    unless `[M3b]` finds the laptop cannot, in which case the sitting stops and asks (sitting 2's row).
13. **THE BOOT TAKES DOWN A RUN LEFT RUNNING** — `recover.ts`'s **pass 2⅞** (A1's Decision 7: after D21's 2¾, before the retirer's 3):
    for each `running` row — the generator's container removed (by its label, `manifest.load-rehearsal=<id>`); the exemption cleared
    (`setRateLimitExemption(hostname, null)`); staging redeployed to its own shape with the row's release; the row `abandoned` and the event
    published — or, when a step fails, `teardown_failed` and one operator line naming the step. Never throws for one row.

---

## Global Constraints

- **The four gates, clean before every commit**, from the repository root; `pnpm test` twice on a sitting's final tree; never `--filter`.
- **`pnpm test:docker`** is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`,
  `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `source/`, `mail/`, `infra/`, or a
  `*.docker.test.ts` — in the background, never beside a Vitest run; `docker network ls -q | wc -l` first; from a shell with
  `MANIFEST_SOURCE_DRIVER` and every `MANIFEST_GITHUB_*` unset; then restart the control plane, the three cleanup scripts, `make verify`.
- **Check machine load before trusting a red** (`uptime`): a load rehearsal IS load, and a Zoom share beside it measures the laptop.
- **One file**: `pnpm exec vitest run --project unit src/<path>`. **Never two Vitest processes.** `pnpm test` truncates.
- **A route change is four commands, in order**: the definition, `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write`.
- **A migration**: `db:generate`, READ it, apply it. **The `audit.events` CHECK migration is CUMULATIVE**: it lists every event type the
  latest migration lists, plus `load_rehearsal.completed` — read from that migration (A1 added `instance.exited`), never from a plan.
- **Published text cites no section, decision or plan.** **Every refusal asserts its code**, with a positive control.
- **Never accept a check you have not watched fail.** **Every task names its CALLER.**
- **Every container the rehearsal starts is removed** (`?force=true&v=true`), and **staging is given back its own shape in a `finally`
  and at boot** — a rehearsal that dies mid-run must never leave staging granted or the edge exempting an address.
- **Never touch the running edge to measure**: `[M4]` uses a throwaway Caddy from the edge's own image.
- **The front-end is told before any commit to `packages/contract` or `packages/mock`.**
- **Commit on `main`, stage your own paths by name.** **Never edit the spec; never touch Valet; ask before `sudo`.** **The four protected
  containers survive; `caddy-data` is never destroyed.** **Leave the machine as you found it.**

---

## Review Focus

**The seven failure modes most likely to bite a person, that no happy path exercises.**

1. **A rehearsal that dies leaves staging granted, or the edge exempting an address.** The control plane killed mid-run; the generator's
   container killed; the redeploy back failing. Expected: **at the next boot, pass 2⅞ finds the `running` row: the generator's container
   removed, the exemption cleared, staging redeployed to its own shape, the row `abandoned`**, with an operator line naming any step that
   failed; a failed take-down in a live run ends the row `teardown_failed`, which never meets the item. Owned by Task 4's *the take-down,
   every way*.
2. **A pass that measured the limiter, or the laptop.** The exemption not applied (every request `429`); a generator that cannot reach
   its rate. Expected: **a `429` is counted as not answered, so the pass mark fails, naming it**; the report carries the rate ACHIEVED, and
   a run that achieved under 90% of its target is `failed`, reason *"the generator reached N of M requests a second"* — never a pass.
   Owned by Task 2's *the report is honest* and Task 4's judge.
3. **A stale pass.** A new candidate after a pass; the audience raised from `large_course` to `public`, or its burst from `steady` to
   `synchronised`, after a pass. Expected: **the item is `unmet` again**, saying why. Owned by Task 6.
4. **Two at once.** A second project's rehearsal while one runs; the same project's D21 rehearsal while a load rehearsal runs, and the
   reverse. Expected: **`409 LOAD_REHEARSAL_BUSY`, naming no other project; `409 LOAD_REHEARSAL_RUNNING`; `409 REHEARSAL_RUNNING`**;
   nothing granted by the refused one. Owned by Task 5.
5. **An app that falls over is reported as falling over.** An app that crashes under concurrency (exits), one that runs out of memory,
   one that answers `503` above a few in flight — on ANY of its instances. Expected: **`failed` with the rule, the instance and the
   number** — the exit count, *"out of memory"*, the answered ratio — and staging restored to one instance. Owned by Task 4, with the
   fixture of Task 8.
6. **A person who may not, or should not.** A collaborator (may — FE-42's rule); a token (refused `403 TOKEN_CREDENTIAL_REFUSED`); an owner
   not stepped up (`403 STEP_UP_REQUIRED`); a `class` app (`409 LOAD_REHEARSAL_NOT_NEEDED`); no release serving staging (`409
   REHEARSAL_NO_CANDIDATE`); an archived project (`409 PROJECT_ARCHIVED`). Owned by Task 5's matrix.
7. **Staging changed under a run.** A token's staging deploy, or a person's, while the run holds staging. Expected: **`409
   LOAD_REHEARSAL_RUNNING`, nothing deployed; the granted set serves until the take-down; the take-down gives back the candidate in
   staging's shape**. Owned by Task 5.

---

## File Structure

```
infra/vegeta/Dockerfile, infra/vegeta/vegeta.lock     NEW (T2) the generator's image, built here; its version and each architecture's sha256
infra/seed/seed.sh (or the step [M1] names)            MOD (T2) download (cached in infra/seed-cache/), verify, build, push to the local registry
scripts/doctor.sh                                      MOD (T2) the image present, if its image checks enumerate the list ([M1])
packages/control-plane/src/launch/
  load.ts                     NEW (T2) createLoadGenerator({ engine, … }) — vegeta's container, its address, its one-line result;
                                       (T4) runLoadRehearsal, judge, phasesFor, takeDownLeftLoadRehearsals
  readiness.ts                MOD (T6) loadRehearsalItem — met by a passed measurement that covers the audience
  index.ts                    MOD exports
packages/control-plane/src/routing/caddy.ts            MOD (T3) a route's rate limit may skip one address
packages/control-plane/src/runtime/driver.ts, fake-driver.ts, driver-contract.ts, docker/driver.ts   MOD (T3) setRateLimitExemption
packages/control-plane/src/releases/shape.ts           MOD (T4) shapeFor's 'load-rehearsal' row
packages/control-plane/src/releases/release.ts         MOD (T4) purpose 'load-rehearsal' (staging only); (T5) staging refused while a run holds it
packages/control-plane/src/releases/recover.ts         MOD (T4) pass 2⅞
packages/control-plane/src/db/schema.ts, locks.ts + drizzle/   MOD (T4) load_rehearsals; tryWithLoadRehearsalLock; (T5) the events CHECK
packages/control-plane/src/observability/              MOD (T5) load_rehearsal.completed
packages/control-plane/src/config.ts                   MOD (T4) the profile's settings
packages/control-plane/src/index.ts                    MOD (T2, T4) the generator bound at boot; the boot's take-down
packages/control-plane/src/api/routes/launch.ts, representations/launch.ts, error-codes.ts, authz-contract.ts, contract/document.ts   MOD (T5)
packages/control-plane/src/launch/rehearsal.ts         MOD (T5) D21's rehearsal refused while a load rehearsal runs
packages/control-plane/src/launch/candidate.ts         READ (T4) the candidate while staging serves N — tested, changed only if it reads otherwise
packages/console/src/, packages/mock/src/, docs/api/launching.md      MOD (T7)
packages/journey/src/load.ts, scripts/demo-load.sh, Makefile, fixtures/load-app/   NEW (T8); ci-acceptance.sh, offline-acceptance.sh MOD (T8)
docs/superpowers/spikes/load-baseline/                 NEW (T1)
```

---

## Task 1: Measure what this plan rests on

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/load-baseline/README.md` and
`results-task1-<date>.txt`.

- [ ] **Step 1: `[M1]` Re-read every *Read this first* fact at HEAD**, with line numbers — above all `launch/rehearsal.ts`,
  `releases/release.ts`'s `DeployInput` and `purpose`, **A1's `releases/shape.ts`**, `sso/sign-in.ts`'s container, `routing/caddy.ts`'s
  route, `runtime/driver.ts`'s interface as A1 left it, `db/locks.ts`'s pools, `recover.ts`'s passes, and **how `make seed` builds an image
  of the platform's own** (the edge's, `infra/caddy/Dockerfile`) **and tags it into the local registry** — Task 2 builds vegeta's the same
  way.
- [ ] **Step 2: `[M2]` A container reaches staging through the edge.** On a demo project with a release serving staging (the machine's
  `launchpath-local` if present), run `node:24-alpine` from the local registry on the platform network, as `sso/sign-in.ts` runs its probe,
  with the platform CA mounted, and `fetch` staging's hostname: record the status, the listener (`srv0`), and **the source address Caddy
  logs** for it — Task 3's exemption keys on it.
- [ ] **Step 3: `[M3]` What the generator will meet, offline.** vegeta is not on this machine until Task 2's download (a Rich-step), so
  what it sustains is measured there (`[M3b]`). Here, record: `alpine:3.22`'s digest in `infra/images.lock` and that the local registry
  serves it; whether that alpine's busybox has `awk`, `sh` and `cat` (Decision 3's last line needs them); and **the laptop's headroom** —
  `docker stats` and `uptime` with the demo apps running — so Task 2's measurement can be read against it.
- [ ] **Step 4: `[M4]` A rate limit that skips one address**, in a THROWAWAY Caddy from `manifest-caddy`'s own image on its own network:
  a route with `caddy-ratelimit`'s handler under a `not remote_ip <addr>` matcher; from two containers, record that one is limited at
  600 a minute and the other is not. Record the exact JSON Task 3 will write, **and what Caddy does with `not remote_ip 0.0.0.0/0`** (Task
  3's negative control). Remove the throwaway.
- [ ] **Step 5: `[M5]` A staging set in production's shape, given back.** From a scratch script, the driver's `ensureInstances` (A1) with
  three specs of a demo project's staging release at production's resources, then one at staging's: each move's time, and the laptop's
  memory with three instances of a large app beside everything else.
- [ ] **Step 6: `[M6]` The gate numbers**, the contract's version, and `pnpm test` once.
- [ ] **Step 7: Commit** the spike directory by name.
  ```bash
  git commit -m "docs(load): Task 1 — the measurements (a container through the edge, the laptop's headroom, a limit that skips one address)"
  ```

---

## Task 2: The generator — vegeta, built here, through the edge

**Sitting 2.** Decision 3. **Its caller is Task 4's run.** **Its Step 1 is a Rich-step**: the network, at his yes AT THIS SITTING (Rich,
2026-10-03: *"Build it locally"* — *"its download a Rich-step at that sitting"*).

**Files:**
- Create: `infra/vegeta/Dockerfile` (`FROM` the local registry's `alpine:3.22` by digest; `COPY` the verified binary; `RUN vegeta
  --version`; a non-root user), `infra/vegeta/vegeta.lock` (`version`, and per architecture `url` and `sha256`)
- Modify: the `make seed` step `[M1]` named (download into `infra/seed-cache/vegeta/` if absent, verify against the lock AND vegeta's
  published checksums file, build, tag into the local registry; **offline with the archive cached, it rebuilds; offline without it, it
  says so and exits non-zero** — never a silent `WARN`); `scripts/doctor.sh` and `scripts/verify.sh` if their image checks enumerate
- Create: `packages/control-plane/src/launch/load.ts` (`createLoadGenerator`, `readLoadResult`), `launch/load.test.ts` (the result's
  reading, from vegeta's own JSON captured at Step 2), `launch/load.docker.test.ts` (the container through the real edge)
- Modify: `src/index.ts` (the generator bound at boot: the engine, the image's local-registry reference, the platform network, the CA path)

**Interfaces:**
- Produces:

  ```ts
  // launch/load.ts
  /** One phase of the arrival: a rate, for a time. Spec action A's profile is two or five of these. */
  export interface LoadPhase {
    name: 'arrive' | 'sustain' | 'ramp-1' | 'ramp-2' | 'ramp-3' | 'ramp-4' | 'ramp-5'
    rps: number
    seconds: number
  }

  export interface LoadTarget {
    /** `https://<staging hostname>` — reached through the edge. */
    origin: string
    /** Path → expected class, e.g. `{ '/': 2, '/healthz': 2, '/auth/login': 3 }` — a 3xx is answered for a redirect path. */
    paths: Record<string, 2 | 3>
    /** Each request's own timeout. */
    timeoutMs: number
  }

  export interface PhaseReport {
    name: LoadPhase['name']
    asked: number
    /** vegeta's own `rate` — what it actually sent, a second. */
    achieved: number
    requests: number
    /** Answered as each path expects: never a 5xx, a 429 or a timeout. */
    answered: number
    statusCounts: Record<string, number>
    p50Ms: number
    p95Ms: number
    p99Ms: number
  }

  export interface LoadReport {
    phases: PhaseReport[]
    /** The whole run's latencies, from vegeta's report over EVERY phase's results — never an average of the phases'. */
    p50Ms: number
    p95Ms: number
    p99Ms: number
    /** The whole run: every request, those answered as their path expects, those that timed out, and the rate vegeta achieved. */
    requests: number
    answered: number
    timeouts: number
    achievedRps: number
    answeredRatio: number
    /** Per path, per status — folded inside the container; nothing per-request leaves it. */
    byPath: Record<string, Record<string, number>>
    durationMs: number
  }

  export interface LoadGenerator {
    /** The generator's own address on the platform network, known before the load starts (Task 3 exempts it). */
    start(
      target: LoadTarget,
      phases: LoadPhase[],
      labels: { loadRehearsalId: string },
    ): Promise<{ address: string; done: Promise<LoadReport> }>
  }

  /** The container's last stdout line → a LoadReport; anything else is an error naming what was missing. */
  export function readLoadResult(line: string, target: LoadTarget, phases: LoadPhase[]): LoadReport
  ```

- [ ] **Step 1: The download — a Rich-step, asked at this sitting's open.** With his yes and the network on: vegeta's current release —
  the version, the day and why recorded (the current release: ORIENTATION's pinning rule) — its `linux` archive for this machine's
  architecture (and the other's, so the lock holds both) and its published checksums file; each archive's sha256 checked against that
  file, then written into `vegeta.lock`; the image built and tagged into the local registry by the seed step; then `make doctor` (its image
  checks, if they enumerate) and `make verify`. **Nothing else uses the network.**
- [ ] **Step 2: `[M3b]` What vegeta sustains here** — the measurement Task 1 could not make before the image was on this machine. vegeta
  in a container on the platform network (the hardening of Step 4 below), against a staging app **through a THROWAWAY Caddy route with no
  rate limit** (Task 1's `[M4]` throwaway, never the live edge), at 10, 50, 100, 200 and 400 requests a second for 30 s each: record each
  `vegeta report -type=json` WHOLE (Step 3's tests read these files), the achieved `rate`, p95, errors, and `uptime` before and after.
  **Compare with Spec action A's profile; if the laptop cannot reach it, STOP and ask Rich** (the numbers are his).
- [ ] **Step 3: The failing tests.**
  - **`load.test.ts`, *the report is honest* (Review Focus 2)** — `readLoadResult`, over Step 2's captured JSON and hand-made variants:
    `achieved` is vegeta's `rate`, never the asked one; **a `429` and a `5xx` are not answered**; a `3xx` is answered only on a path that
    expects one (from `byPath`); timeouts counted; **the whole run's p95 is the all-phases report's, not a mean of the phases'** (a variant
    whose phases' mean differs from it); a line missing `byPath` or a phase is an error naming it.
  - **`load.docker.test.ts`** — the container on the platform network reaches a staging app through the edge; `start` answers its address
    before the load; the result line is read whole for a two-phase run of 20 s; **the container is gone after `done` resolves AND after it
    rejects**.
  - **The seed step** (a shell test of its own, or `[M1]`'s home for seed's checks): an archive whose sha256 differs from the lock is
    refused, naming both.
- [ ] **Step 4: Run, and predict. Then implement.** `createLoadGenerator` creates one container from the local image (`HostConfig`:
  `CapDrop: ['ALL']`, `ReadonlyRootfs`, a tmpfs for its results, `pids` 256, a 512 MiB ceiling; the platform CA read-only; `NetworkMode`
  the platform network; the label `manifest.load-rehearsal=<id>`, which the boot's pass 2⅞ removes by), whose shell runs each phase in turn
  — `vegeta attack -rate=<rps>/s -duration=<s>s -timeout=<ms>ms -root-certs=<ca> -redirects=-1 -targets=<file> > <phase>.bin` — then prints
  Decision 3's one line last. The targets file round-robins the paths with the staging hostname. It reads the container's address from
  `/containers/{id}/json` before the attack begins (a `sleep` until a file appears, or a two-step start — Step 2 records which works), and
  in a `finally` deletes it with `?force=true&v=true`.
- [ ] **Step 5: Commit**, then the **negative control**: count a `429` as answered. Predict red: the report's `answered` assertion only.
  ```bash
  git commit -m "feat(launch): the load generator — vegeta, built here from a checksummed release, through the edge, reporting the rate it achieved"
  ```

---

## Task 3: The edge — a staging route's rate limit skips the generator, for one run, through a `Driver` verb

**Sitting 2, after Task 2. Spec action C decided first.** Decision 5. **Its caller is Task 4's run, and the boot's pass 2⅞.**

**Files:**
- Modify: `packages/control-plane/src/routing/caddy.ts` — the route input gains `rateLimitExempt?: string` (one address); the `rate_limit`
  handler is wrapped in `[M4]`'s matcher when it is set
- Modify: `runtime/driver.ts` (`setRateLimitExemption(hostname: string, address: string | null): Promise<void>` and its doc comment);
  `runtime/fake-driver.ts` (records it; the hostname's exemption readable by tests); `runtime/driver-contract.ts` (its cases);
  `runtime/docker/driver.ts` (re-applies the hostname's current route — A1's set, its health policy — with or without the exemption; a
  hostname with no route is `INSTANCE_NOT_FOUND`)
- Test: `routing/caddy.test.ts` (the JSON), the driver contract, `routing/routes.docker.test.ts` (or a new file `[M1]` names: the real edge)

- [ ] **Step 1: The failing tests.** The JSON: with `rateLimitExempt`, exactly `[M4]`'s shape; without it, byte-identical to today's (a pin).
  The driver contract (both drivers): set → the hostname's exemption reads that address; `null` → none; the route's set unchanged by
  either; an unknown hostname refused with its code. The Docker case: two containers, the exempt one sends 1,200 requests in a minute with
  no `429`; the other gets `429` after 600; **after `setRateLimitExemption(hostname, null)`, the first is limited again** — the take-down's
  half.
- [ ] **Step 2: Run, and predict.** **Step 3: Implement.**
- [ ] **Step 4: Commit**, then the **negative control**: exempt every address — `0.0.0.0/0` for the generator's, a config Caddy accepts
  (`[M4]` recorded it; *"drop the matcher's argument"* may be refused outright, and a refusal is red for the wrong reason). Predict red:
  the second container's `429` assertion only.
  ```bash
  git commit -m "feat(runtime,routing): a route's rate limit may skip one address, through the driver — the load rehearsal's generator, for one run"
  ```

---

## Task 4: The run — grant, load, watch, judge, record, take down; and the boot's half

**Sitting 3, alone. Spec action A decided first.** Decisions 2, 3, 6–9, 12, 13. **Its caller is Task 5's route; until then a scratch
script calls it (Step 4).** Nothing on the wire changes here.

**Files:**
- Modify: `releases/shape.ts` — `DeployPurpose` (A1 declares it there) gains `'load-rehearsal'`, and `shapeFor` its row for staging;
  `releases/release.ts` — `'load-rehearsal'` refused for any environment but staging, and **`DeployInput.loadRehearsalId?: string`**,
  which the run's two deploys — the grant and the take-down — carry, and which Task 5's staging check reads to let exactly those two
  through
- Modify: `db/schema.ts` — `load_rehearsals` (Decision 9), with a partial unique index *one `running` row per project*; `db/locks.ts` —
  `tryWithLoadRehearsalLock` on a pool of its own; then `db:generate`, read it, apply it
- Modify: `launch/load.ts` — `runLoadRehearsal(deps, { projectId, actor }): Promise<LoadRehearsalRow>` (inserts the `running` row and
  answers it; the run continues on the process's own promise, its failures logged and recorded, never unhandled), `judge(report, watched,
  phases)`, `phasesFor(audience, settings)`, `takeDownLeftLoadRehearsals(deps)`; `config.ts` — the profile's settings (Decision 12);
  `releases/recover.ts` — pass 2⅞; `src/index.ts` — its binding
- Test: `launch/load.test.ts` (the fake driver and a fake generator), `launch/load.docker.test.ts` (one real run), `recover.test.ts`

**Interfaces:**
- Consumes: `LoadGenerator`, `LoadPhase`, `LoadReport` (Task 2); `Driver.setRateLimitExemption` (Task 3); `shapeFor` (A1).
- Produces: `runLoadRehearsal(deps: LoadRehearsalDeps, input: { projectId: string; actor: { id: string } }): Promise<LoadRehearsalRow>`
  (the row as inserted, `running`); `latestLoadRehearsalFor(db, projectId)`; `loadRehearsalById(db, projectId, id)`; `judge(report:
  LoadReport, watched: { exits: number; oom: boolean; unhealthy: boolean }, phases: LoadPhase[]): { passed: boolean; reason: string }`
  (pure); `phasesFor(audience, settings): LoadPhase[]` (Decision 7); `takeDownLeftLoadRehearsals(deps): Promise<{ abandoned: string[];
  failed: string[] }>`.

- [ ] **Step 1: The failing tests, as one matrix.**
  - **The run** (fake driver, fake generator): the `running` row inserted FIRST; the candidate redeployed to staging in `shapeFor`'s
    `'load-rehearsal'` shape (the audience's count, production's resources); `setRateLimitExemption(hostname, <the generator's address>)`;
    the load; `setRateLimitExemption(hostname, null)`; staging redeployed to its own shape; the row `passed` with `taken_down_at` —
    **in that order** (a recorded call list). `runLoadRehearsal` resolves with the `running` row before the load starts.
  - **`judge`, every rule** (Review Focus 2 and 5): a clean report passes; 98.9% answered fails naming the ratio; p95 2.1 s fails naming it;
    an exit, an OOM, an unhealthy poll each fail naming it; an achieved rate under 90% fails naming it; the FIRST broken rule is the reason.
  - **The take-down, every way** (Review Focus 1): the generator throws → `failed`, staging given back; the redeploy back throws → the row
    **`teardown_failed`, even when the judgement passed**; **a boot with a `running` row left** — a granted staging set and an exempting
    route, made by a run the test stops mid-way, not written by hand — → pass 2⅞: the generator's container removed, the exemption cleared,
    staging redeployed to its own shape, the row `abandoned`, one operator line; and **pass 2⅞ runs after 2¾ and before 3** (the report's
    order).
  - **The shape is narrow**: `'load-rehearsal'` to production is refused; `DeployInput` has no `instances` or `resources` (A1's type test
    still red-able).
  - **The candidate while staging serves N** (the review's cross-plan 5): during the run — staging granted, N members serving the
    candidate — `launchCandidateFor` (`launch/candidate.ts`, through A1's `servingInstancesOf`) answers the candidate's release, the same as
    before the grant and after the take-down.
  - **`load.docker.test.ts`**: one real run against a small app at a light profile (the test's own settings), `passed`, and staging's
    instance afterwards at staging's own resources (`docker inspect`'s `HostConfig.Memory`) and its route with no exemption.
- [ ] **Step 2: Run, and predict.** **Step 3: Implement**, the migration.
- [ ] **Step 4: Through the edge, on driver 1**: a large-course demo project's run from a scratch script calling `runLoadRehearsal` with
  the running process's deps — its report, its time, staging's resources and route after, quoted.
- [ ] **Step 5: Commit**, then the **negative controls**:
  - **(a)** skip the take-down's `setRateLimitExemption(…, null)`. Predict red: the order assertion only (the redeploy back builds a
    plain route anyway — say so: the Docker case stays green, and the boot's clearing is what it guards).
  - **(b)** let `judge` ignore `achieved`. Predict red: the under-90% row only.
  - **(c)** write the row at the END instead of first. Predict red: the boot row — pass 2⅞ finds nothing to take down.
  - **(d)** take the lock on the query pool. Predict: green in the unit tier — say so — and record the sitting-12 reason it is on its own
    pool; the Docker case with ten concurrent boots is where it would show, and is not this task's.
  ```bash
  git commit -m "feat(launch): the load rehearsal's run — staging given production's capacity, the audience's arrival through the edge, judged, recorded, given back, and taken down at boot"
  ```

---

## Task 5: The operation — `runLoadRehearsal` answers at once, and staging is the run's while it lasts

**Sitting 4, alone. Spec action B decided first.** Decisions 1, 6, 7, 11. **Contract `1.9.0`.** **Its callers are the console, the mock's
clients and `make demo-load`.**

**Files:**
- Modify: `api/routes/launch.ts` — **`runLoadRehearsal`** (`POST /v1/projects/{projectId}/load-rehearsal`, `credential: 'session'`,
  `capability: 'launch:rehearse'`, stepped up, **`202` with the `running` `LoadRehearsal`**) and **`getLoadRehearsal`** (`GET
  /v1/projects/{projectId}/load-rehearsals/{loadRehearsalId}`, `project:read`) and `listLoadRehearsals` (`GET …/load-rehearsals`, newest
  first, bounded); `api/representations/launch.ts` — `LoadRehearsal` (`state`, the profile, the shape, the evidence once finished,
  `pollAfterSeconds`); `api/error-codes.ts` — `LOAD_REHEARSAL_BUSY`, `LOAD_REHEARSAL_RUNNING` (its hint: *"up to about ten minutes; read
  `getLoadRehearsal`"*), `LOAD_REHEARSAL_NOT_NEEDED`; `REHEARSAL_NO_CANDIDATE` and `REHEARSAL_RUNNING` reused where their hints are true;
  `api/authz-contract.ts`; `api/contract/document.ts` (`1.9.0`); the four contract commands; the mock's answers in the same step
- Modify: `releases/release.ts` — **a staging deploy of a project with a `running` row is refused `LOAD_REHEARSAL_RUNNING`, checked under
  the environment's lock**, except the run's own two deploys, which carry that row's id in `DeployInput.loadRehearsalId` (Task 4);
  `launch/rehearsal.ts` — D21's refused the same while a load rehearsal runs
- Modify: `observability/event-schemas.ts`, `events.ts`, `examples.ts` — `load_rehearsal.completed`; the CHECK migration (cumulative);
  `launch/load.ts` publishes it when a row leaves `running`
- Test: the route's file, `launch/load.test.ts`, `releases/release.test.ts`, `launch/rehearsal.test.ts`

- [ ] **Step 1: The failing tests, as one matrix.**
  - **The answer is at once**: `runLoadRehearsal` → `202`, state `running`, before the fake generator's load has begun; `getLoadRehearsal`
    → `running`, then `passed` with its evidence; `listLoadRehearsals` newest first.
  - **The refusals** (Review Focus 4 and 6): busy elsewhere, `LOAD_REHEARSAL_BUSY` naming no other project; this project's run under way,
    `LOAD_REHEARSAL_RUNNING`; D21's rehearsal under way, `REHEARSAL_RUNNING`; D21's asked while a load rehearsal runs,
    `LOAD_REHEARSAL_RUNNING`; a `class` app, `LOAD_REHEARSAL_NOT_NEEDED`; no candidate, `REHEARSAL_NO_CANDIDATE`; an archived project,
    `409 PROJECT_ARCHIVED`; a token, `403 TOKEN_CREDENTIAL_REFUSED`; not stepped up, `403 STEP_UP_REQUIRED`; a collaborator, `202`;
    **nothing granted by any refusal**.
  - **Staging is the run's** (Review Focus 7): a staging deploy by a person, and by a token, while a run holds staging → `409
    LOAD_REHEARSAL_RUNNING`, nothing deployed; the run's own deploys pass; a production deploy is not affected; after the row leaves
    `running`, a staging deploy passes.
  - **The event**: one `load_rehearsal.completed` per finished row, from the run or from the boot.
- [ ] **Step 2: Run, and predict. Step 3: Implement**, the migration, the contract commands. **Tell the front-end before the commit**:
  `1.9.0`; the operation answers `202` and is polled; the record; the event; the codes.
- [ ] **Step 4: Through the edge, on driver 1**: a run started over `https://console.manifest.internal`, polled to its end; a staging
  deploy tried mid-run and refused, quoted.
- [ ] **Step 5: Commit**, then the **negative control**: drop the staging deploy's check. Predict red: Review Focus 7's rows only.
  ```bash
  git commit -m "feat(launch): runLoadRehearsal answers at once and is polled; staging is the run's while it lasts (contract 1.9.0)"
  ```

---

## Task 6: The checklist — met by a measurement

**Sitting 5.** Decision 10.

**Files:**
- Modify: `launch/readiness.ts` — `loadRehearsalItems` (`:226-240`) becomes `loadRehearsalItem(db, project, candidate, audience)`, async,
  in both clauses; `builtBy` gone; `since` the passing record's `finished_at`
- Test: `launch/readiness.test.ts`

- [ ] **Step 1: The failing tests** (Review Focus 3): no record → `unmet`, *"not rehearsed yet"*, naming `runLoadRehearsal`; a `running`
  record → `unmet`, *"running"*; a `failed` record → `unmet` with its reason; **a `teardown_failed` record whose judgement passed → `unmet`**;
  a `passed` record for the candidate → `met`; **a new candidate → `unmet`**; **the scale raised to `public` after a `large_course` pass →
  `unmet`**; **the burst raised to `synchronised` after a `steady` pass → `unmet`**; a `public` pass covers `large_course`, and a
  `synchronised` pass covers `steady`; after launch, a pass covering the current audience for ANY release → `met` (Q3 (a)), and the audience
  raised after launch → `unmet`; a `class` app → no item (unchanged, a pin). **And the gate**: a production deploy of a large app with every
  other item met is `409` with the checklist until the item is met, then `200`.
- [ ] **Step 2: Run, and predict.** **Step 3: Implement.**
- [ ] **Step 4: Commit**, then the **negative controls**: (a) ignore the scale on the record. Predict red: the scale rows only. (b) Ignore
  the burst. Predict red: the burst rows only.
  ```bash
  git commit -m "feat(launch): the load rehearsal item is met by a measurement — of the candidate, at the audience it was run for"
  ```

---

## Task 7: The clients — the console, the mock, the guide

**Sitting 5, after Task 6.**

**Files:**
- Modify: `packages/console/src/screens/launch.tsx` (or the records screen `[M1]` names) — for an owner or collaborator on a large app,
  **Run the load rehearsal** (stepped up; it says it takes ~10 minutes and what it will do to staging, and that staging cannot be deployed
  meanwhile), its progress while `running` (polled at the record's `pollAfterSeconds`), and the newest record's result in words
  (*"Passed: 99.8% answered, p95 0.6 s"*, or the reason); `launch-records-state.ts` (or its neighbour) for the words
- Modify: `packages/mock/src/launch.ts` — `runLoadRehearsal` (`202`, `running`), `getLoadRehearsal` (`running` on the first read, `passed`
  after), and, under a new switch `MANIFEST_MOCK_LOAD=failed`, a failure; the checklist's item by the stage; `scripted.test.ts`
- Modify: `docs/api/launching.md` — **The load rehearsal** (who, what it does to staging, that staging deploys wait for it, the profile,
  the pass mark, the refusals, how long it takes, how to poll); `docs/api/events.md`; `docs/api/frontend.md` (the switch)
- Test: the console's, the mock's

- [ ] **Step 1: The failing tests. Step 2: Run, and predict. Step 3: Implement**, `pnpm docs:write`. **Tell the front-end before the
  commit**: its *"waiting on the Manifest team"* line for `load-rehearsal` can become the owner's action; the operation is polled.
- [ ] **Step 4: Walk the console** headless (agents may type the laptop's test passwords): the button, the step-up, the progress, the
  result.
- [ ] **Step 5: Commit**, then the **negative control**: show the button on a `class` app. Predict red: the console's *only for a large
  app* row; through the edge, `409 LOAD_REHEARSAL_NOT_NEEDED`.
  ```bash
  git commit -m "feat(console,mock): the owner runs the load rehearsal, watches it, and reads its result; the mock plays it"
  ```

---

## Task 8: The acceptance — `make demo-load`, and a person clicking it

**Sitting 6. Alone, and last.**

**Files:**
- Create: `packages/journey/src/load.ts`, `scripts/demo-load.sh`; `Makefile` (`demo-load`); `fixtures/load-app/` — a starter-shaped app
  whose `/` answers in ~20 ms and which, **when its COMMITTED `load-app.json` says `"fallOver": true`**, answers `503` above eight requests
  in flight (Review Focus 5's app, made honestly by its own code). **A committed file, not a secret**: a secret changes no image digest, so
  the candidate — and the item — would not change (the review's minor); a commit builds a new candidate.
- Modify: `scripts/ci-acceptance.sh` (a step, either driver), `scripts/offline-acceptance.sh` (a step; nothing here needs the network once
  `make seed` has built the generator)

- [ ] **Step 1: The phases**, each ending `every check passed`, on either driver: a `large_course` project from the fixture; a release
  serving staging; the checklist's item `unmet`, *"not rehearsed yet"*; a token refused, an un-stepped session refused; **the rehearsal
  started — `202`, `running` — a staging deploy mid-run refused `LOAD_REHEARSAL_RUNNING`, then polled to `passed`**, staging back to its
  own resources, the route back to its limit (a 601st request from one address in a minute is `429`); the item `met`; then `fallOver:
  true` committed and built — **a new candidate**, the item `unmet` again — **a rehearsal that fails naming the answered ratio**, staging
  restored.
- [ ] **Step 2: Green three times on each driver** (fresh, re-use, from `make reset`), every other demo, `make ci-acceptance`, and
  `scripts/offline-acceptance.sh` named to Rich as owed.
- [ ] **Step 3: The negative controls**, one per Review Focus line, each predicted, seen red and restored.
- [ ] **Step 4: The clicked half** (*What Rich does* 4). **Step 5: The plan's one whole-branch review**, beside the Docker tier; one fix
  wave. **Step 6: Close out**: the ledger, ORIENTATION §7e (A2's plan next), §8 (FE-44 BUILT), the front-end told.

---

## What this plan does not build

- **The rest of §24's production table** — backups by audience, saturation alerting, tuned edge rate limits and abuse controls — and
  **pre-warming ahead of a `synchronised` window** (Rich, 2026-10-03: *"Record it as not built"*). The instances plan (A1) builds the counts;
  **hibernation and wake-on-request are A2's**, after this plan.
- **`public`'s extra gate, the security review** (§24's table). There is no item for it; FE-44 named the load rehearsal alone.
- **Raising an audience after launch** (§24's *Changing the answer*: an administrator approves an upward change, in §26's queue) — this
  plan only makes the item `unmet` when it happens.
- **Signed-in load** (Decision 4), and **page assets** (Decision 7's rule loads the three paths and nothing they reference).
- **Cancelling a run.** It ends by itself within 8 minutes of load; a person who wants staging back sooner waits.

---

## Asked of Rich — answered 2026-10-03, ~13:52 and ~14:33 PDT

*Put to him through `manifest-94` (who checked the premises first); his answers, through the question tool.*

1. **"Production-shaped capacity", when production is one instance.** Recommended was (a), rehearse production as built. **Rich: *"Build
   §24's capacity first"*** — production runs instances by audience (class ≥2, large_course ≥3 with headroom, public ≥3), the edge
   balancing across them; then this rehearsal grants staging that shape. → A1, the instances plan, before this one
   (placed by him, *"A1 → B → A2"*); Decision 2 rewritten.
2. **The profile and the pass mark.** **Rich: *"As proposed"*** — 500 virtual users for `large_course` (`public` the same on a laptop, with a
   stated cap); `synchronised` all within 60 s then 5 minutes sustained; `steady` a 5-minute ramp; ≥ 99% answered (no `5xx`, no timeout),
   p95 under 2 s, the instances staying healthy; the health path, the root and the sign-in redirect. → Spec action A, with those numbers
   **and the users-to-rate rule that turns them into rates, which is this plan's and is put to him there** (the review's I5).
3. **Launched apps.** **Rich: *"First launch + audience raised"*** — not on every release. → Decision 10; readiness's second clause.
4. **vegeta's image** (the fresh review's I4, ~14:33). **Rich: *"Build it locally (Recommended)"*** — from the mirrored alpine and vegeta's
   official release binary, checksum-verified; the download a Rich-step at that sitting. → Decision 3, Task 2.

**And then** (2026-10-03, ~13:56 PDT, through the question tool): **the split — *"Two plans: A then B"*** (A, production capacity by
audience — proposed to him to split again, A1 and A2; this plan needs A1 alone); **hibernation — *"Build hibernation in Plan A"***;
**the generator — *"vegeta"***, the achieved rate compared with the asked; and **the rate limit — *"Exempt the generator's IP"***, for one
run, measured on a throwaway Caddy first.

---

## Spec actions — DRAFTED, NONE APPLIED

*§11's interface is changed by four plans, read in order: A1's A, then this plan's C, then A2's C, then FE-32's A (A1's note above its
spec actions). §24 gains words from three: A1's B and then A2's B after its table, and this plan's A in *Sandbox and staging ignore all
of it*. §26's settings sentence gains words from
three: this plan's B first, then A2's B, then FE-32's C.*

### A. §24 — what the load rehearsal is (before sitting 3)

**Proposed.** After *"…and that is as true of capacity as it is of identity."* (l.2762), add:

> *"**The owner runs it**, as they run D21's rehearsal, in their own session and stepped up, and it is one at a time across the platform;
> while it runs, nothing else is deployed to that app's staging. Manifest redeploys the release serving staging **in production's shape
> for the audience** — its instances, at production's resources, behind one balanced route — and puts the audience's arrival on it through
> the edge: for `large_course` and `public`, **500 people arriving within a minute and staying five minutes** (`synchronised`) **or
> arriving over five minutes** (`steady`). **Each arriving person asks for three pages — the app's front page, its health path and its
> sign-in — and then one every ten seconds while they stay; no page's images or scripts are fetched.** So `synchronised` is **75 requests
> a second for the first minute, then 50 a second for five minutes**, and `steady` is **10, 20, 30, 40 and 50 a second, a minute each**.
> It **passes** when at least 99% of requests are answered without a server error or a timeout, the 95th percentile is under two seconds,
> and every instance stays healthy with no exit and no out-of-memory exit; a generator that could not reach the rate asked is a failure,
> never a pass. Then staging is given back its own shape. The numbers are platform settings (§26), these their defaults. The item is met by
> the newest passing rehearsal of the release that would launch, at the audience — its scale and its burst — it was run for; after launch,
> it is asked again only when the audience is raised."*

*Shared pages:* `manifest-phases.html` and `manifest-decisions.html` (D29, if it names the load gate) — check.

### B. D24 and §26 — the person-only list and the platform settings (before sitting 4)

**Proposed.**
1. **D24**, *"running D21's pre-production rehearsal (§9)"* ⟶ *"running D21's pre-production rehearsal (§9) or §24's load rehearsal"* —
   the same capability, the same reason (it changes what staging runs, past anything a token deploys). *"Four actions are stricter still"*
   stays four: the load rehearsal is part of the fourth.
2. **§26, *Platform settings***, after *"…and the platform's monthly intake budget."*: *"And the load rehearsal's profile and pass mark
   (§24)."* — **the first of three such sentences**: A2's B and FE-32's C each add theirs after it. **Like every platform setting today,
   it is deployment configuration read at boot, so a change to it is not yet audited with its actor as the bullet's last sentence says** —
   a gap every setting already has (the review's cross-plan 6), named here and not closed by this plan.

*Shared pages:* `manifest-decisions.html`'s D24 — check.

### C. §11 — the driver exempts one address from a route's rate limit (before sitting 2)

**Why.** The run needs the edge to skip its per-IP limit for the generator alone (Rich: *"Exempt the generator's IP"*), only the driver
applies routes, and §11's interface is *"everything the control plane may ask of infrastructure, and nothing more"* (the review's I2).

**Proposed.** In the `Driver` interface, after A1's `restoreRoute(ids: string[])`:
`setRateLimitExemption(hostname: string, address: string | null): Promise<void>   // one address past the route's rate limit; null clears`

and in §12's *Edge*, after the paragraph on the per-client limits (or where §12 states them): *"For the length of one load rehearsal
(§24), the staging route of the app being rehearsed does not limit the load generator's own address; every other client keeps its limit,
and the exemption is cleared when the rehearsal ends, and at boot."*

*Shared pages:* `manifest-schematic.html`'s edge line — check; likely unchanged.

---

## What the self-review caught

1. **Rate limiting would have made every rehearsal measure the edge, not the app** — 600 a minute per address (`routing/caddy.ts:69`)
   from one generator is ten a second. Decision 5 exempts one address for one run, and Review Focus 2 makes a limiter-bound run a failure,
   never a pass.
2. **A new load-tool image needs the network and a `make seed`.** First drawn as a Node script in the mirrored base image to avoid it;
   Rich chose vegeta (*"vegeta"*), and then to build its image here (*"Build it locally"*), so its download is a Rich-step at sitting 2 and
   `make seed` builds it on every machine after.
3. **The resources override was a hole as first sketched** — any deploy could grant itself production's resources. Task 4 refused it for
   every purpose and environment but the rehearsal's staging deploy; **the revision removed the override altogether** (A1's `shapeFor`).
4. **The contract versions follow Rich's order** (A1 `1.8.0`, this plan `1.9.0`, A2 `1.10.0`, FE-32 `1.11.0`); FE-32's plan said `1.8.0`
   (changed in that plan in the same commit as this one).

---

## Revised to the review — what changed, finding by finding (2026-10-03)

*The review is [`2026-10-03-review-of-four-plans.md`](./2026-10-03-review-of-four-plans.md), §2 and *Cross-plan*. Its verdict on this plan:
needs rework — Decision 7 asynchronous, Decision 5 a Driver verb with its spec action, staging held during a run. Each finding was checked
against the code at `75030d8` before it was built in.*

| Finding | What it said | Where it went |
|---|---|---|
| **C1** | A synchronous 8–10-minute operation cannot be called by Node clients (undici's 300 s) | `202` with a `running` record, polled by `getLoadRehearsal` (Architecture, Decisions 7 and 9, Task 5); *Read this first* 10 |
| **I2** | The exemption needs a Driver verb | `setRateLimitExemption(hostname, address \| null)` (Decision 5, Task 3); **Spec action C** drafted; the boot clears it too |
| **I3** | Staging is unlocked during the run | Staging deploys refused `409 LOAD_REHEARSAL_RUNNING` under the environment's lock while a `running` row exists (Decision 6, Task 5, Review Focus 7); an archive mid-run ends it `abandoned` |
| **I4** | vegeta's image provenance | **Rich: *"Build it locally"*** — Decision 3, Task 2: from `alpine:3.22` and the release binary, verified against the published checksums AND `vegeta.lock` |
| **I5** | The users-to-rate rule is the plan's, not Rich's | Stated as the plan's in Decision 7, and put to him in Spec action A's words with the rates and the 10 s |
| **I6** | The boot cannot find a run left behind | The row inserted `running` before the grant; pass 2⅞ before pass 3 (Decisions 9 and 13; Task 4, its control (c)); the boot test makes a real half-run, not a hand-written one |
| **I7** | Sitting 3 is too big | Split: the run (Task 4, sitting 3, no wire change), then the operation (Task 5, sitting 4); six sittings |
| Minor: the `instances` override | Missing from Files; better derived from `purpose` | No override at all: `shapeFor`'s `'load-rehearsal'` row (Decision 2) |
| Minor: Spec action B's timing | Built a sitting before it is decided | B before sitting 4, where Task 5 builds the route |
| Minor: the ORDER bullet | Omits A1 and A2 | Fixed |
| Minor: a failed take-down's record | Must never meet the item | `teardown_failed` (Decision 9); Task 6's row |
| Minor: a wrong hint | `REHEARSAL_RUNNING`'s *"two minutes"* | `LOAD_REHEARSAL_RUNNING`, its own hint (Decision 6) |
| Minor: getting results out | Per-path 3xx and the whole-run p95 from a read-only container | One JSON line built inside it: each phase's report, the all-phases report, per-path counts by `awk` (Decision 3; Task 2's tests) |
| Minor: scale but not burst | The item compares scale only | Scale AND burst (Decision 10; Task 6's rows and control (b)) |
| Minor: a control that may fail for the wrong reason | Dropping the matcher's argument | `0.0.0.0/0`, measured accepted by `[M4]` (Task 3) |
| Minor: the demo's candidate | A secret changes no digest | A committed `load-app.json` (Task 8) |
| Cross-plan 2, 4, 6, 7 | §11 sequenced; one `shapeFor`; §26 composed; the CHECK cumulative | The note above the spec actions; Decision 2; Spec action B; Global Constraints |
| Cross-plan 5 | Staging's one-instance invariant, which A1's readers rely on, broken for a run | Only the candidate's own release serves during a run; Task 4 tests that the candidate reads the same while staging serves N (*Read this first* 3) |

**Not taken:** nothing. **Routine calls this revision made**: refuse a staging deploy rather than abort the run (Decision 6, its rejected
alternative); an archive mid-run ends the run `abandoned`; the record's four end states; one verb with `null` to clear rather than two;
`listLoadRehearsals` beside `getLoadRehearsal` (the console's history needs it).

**Checked before commit** by a fresh read-only agent, against the review and the other three plans; what it found here was fixed in
place: cross-plan 5 (the candidate while staging serves N) had no test — Task 4 has one; Task 5's matrix lacked Review Focus 6's archived
project; the take-down's row id is `DeployInput.loadRehearsalId`; `DeployPurpose` lives in A1's `shape.ts`; `LoadReport` carries every
field Decision 9's evidence records; the File Structure names `launch/rehearsal.ts`.

---

## What executing this plan found

*(One dated section per sitting.)*
