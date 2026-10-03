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
> audience is raised** (*"First launch + audience raised"*). **Two spec actions are DRAFTED at the end, none applied.** **NOT YET APPROVED.**

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
  capability, `launch:rehearse` — answered when it is over: a `LoadRehearsal` record, passed or not, with its evidence.
- **The grant is a redeploy**: the candidate release redeployed to STAGING in production's shape — the audience's instance count and
  production's resolved resources (`deployRelease`'s `purpose: 'load-rehearsal'`, over the instances plan's N-instance deploy) — and
  staging redeployed to its own one-instance shape in a `finally` and at boot (`takeDownLeftRehearsals`' pattern). No new driver method
  beyond the instances plan's.
- **The load is vegeta's** (MIT; Rich, 2026-10-03: *"vegeta"*), pinned by digest and mirrored into the local registry by `make seed`, run
  in a throwaway container on the platform network, reaching staging THROUGH THE EDGE — the engine seam D21's sign-in probe already uses
  (`sso/sign-in.ts`). Its one network pull is a Rich-step at sitting 2. For the run's duration only, the staging route's per-IP rate limit
  does not apply to the generator's own address (Rich: *"Exempt the generator's IP"*).
- **The profile comes from the audience** (Spec action A's numbers, platform settings with those defaults); the pass mark is stated.
- **The item is met by the newest passing rehearsal of the candidate, at the audience it was run for** — a new candidate, or an audience
  raised, makes it `unmet` again.
- **The contract goes to `1.9.0` ONCE, at Task 4** (A1 leaves it `1.8.0`; A2 then takes `1.10.0`, FE-32 `1.11.0`).

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0 (host); the generator vegeta (MIT), its image pinned by digest and mirrored (Task 2);
Fastify 5.12.3, Drizzle over Postgres 16, `zod/v4`, Vitest 2.1; Caddy with `caddy-ratelimit` v0.1.0 (`infra/caddy/Dockerfile`).
**One new image, vegeta**, pinned by digest and mirrored (Rich, 2026-10-03); no new package.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read:
- **§24**, *Audience and scale* (l.2690-2780) — above all *Sandbox and staging ignore all of it* (l.2752-2762).
- **§13**, the checklist, and **D21**'s rehearsal (the pattern this follows) with **D24**'s person-only list.
- **§11**, *Redeploys* (a redeploy is a new instance beside the one serving).
- **§12**, the edge's rate limits and the hardening baseline.

**Roadmap:** the ORDER line in *The faculty front-end's message* (2026-10-03).

**Predecessor:** [`2026-10-03-production-instances.md`](./2026-10-03-production-instances.md) — A1, production's instances by audience (Rich,
2026-10-03: *"Build §24's capacity first"*, then *"A1 → B → A2"*). **This plan starts only after its acceptance closes.** Before it: the
Manifest team's step.

**Successor:** [`2026-10-03-hibernation.md`](./2026-10-03-hibernation.md) — A2, hibernation and wake-on-request; then FE-32
([`2026-10-03-fe32-dependencies.md`](./2026-10-03-fe32-dependencies.md)).

---

## How this plan is to be executed — sittings, one per session

> **FIVE SITTINGS, PROPOSED.** Task 1 is first and alone. The generator and the edge's exemption are Docker-heavy and share a sitting.
> The rehearsal's own steps — the grant, the run, the judgement, the record, the take-down — are one task in their own sitting. The
> operation, the checklist and the clients share one. The acceptance is alone and last.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements**: every fact re-read; a container on the platform network reaching staging through the edge (the CA, SNI, the source address Caddy sees); the laptop's headroom (what vegeta sustains is Task 2's, after its pull); a route whose rate limit skips one address, in a THROWAWAY Caddy from the edge's image; a staging redeploy's time in production's N-instance shape; the gate numbers | No | After Task 1's commit | ← **next**, once approved and the plan before it has closed |
| 2 | 2, 3 | **The generator** (vegeta pinned and mirrored — its pull a Rich-step at this sitting's open — its container, its report) and **the edge's exemption** (the staging route, for the generator's address, for the rehearsal's duration) | Yes — `launch/`, `routing/`, `infra/` | After both commits, with one generator run through the real edge quoted. **It stops and asks Rich** if `[M3b]` finds the laptop cannot sustain Spec action A's profile — the numbers are his | |
| 3 | 4 | **The rehearsal**: grant, run, watch, judge, record, take down; one at a time platform-wide; its boot recovery; the `load_rehearsals` table; **contract `1.9.0`** | Yes — `launch/`, `releases/`, `db/` | After the commit, with one rehearsal through the edge on driver 1, passed, and staging back in its own shape | |
| 4 | 5, 6 | **The checklist** — met by a measurement, for the first launch and an audience raised (Q3) — and **the clients**: the console's *Run the load rehearsal*, the mock's stage, the guide | Yes — `launch/` | After both commits, with the front-end told | |
| 5 | 7 | **The acceptance**: `make demo-load`, three times on each driver; every other demo; a clicked half; the plan's one whole-branch review. **Alone, and last** | Yes, if any code changes | After the clicked half and the review's one fix wave | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates (`pnpm test` twice, alone, on the final tree), the Docker tier when owed, a dated
*What executing this plan found*, this table, and ORIENTATION §6's sweep. **Three rules survive any re-cut:** Task 1 first and alone; Task
7 alone and last; no task a spec action changes before Rich has decided it (A before sitting 3; B before sitting 4).

---

## Decided by Rich — build them, do not re-open them

- **FE-44 (a) — *"Build the load rehearsal first"*** (2026-10-03, ~13:46 PDT, through `manifest-94`'s question tool;
  [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)): the platform builds §24's load rehearsal, before faculty use it for real, as
  a plan of its own, **after FE-46, FE-47 and FE-5, before FE-32**. *Rejected by that choice:* (b) a `not_built` item that does not block;
  (c) only saying so earlier. The front-end's *"waiting on the Manifest team"* line stays true meanwhile.
- **THE ORDER** (2026-10-03): *faculty-ready* → the Manifest team's step → **the load rehearsal** → FE-32 with the allowlist → the
  vulnerability database → FE-45.
- **Carried, still binding:** D21's rehearsal is the owner's (`launch:rehearse`, person-only, stepped up — the launch path plan's Spec
  action 8); D24; every refusal asserts its code; published text cites no section, decision or plan; the front-end is told before any
  commit to `packages/contract` or `packages/mock`.

---

## What Rich does, and when

1. **Review this plan** (his answers of 2026-10-03 are in *Asked of Rich*).
2. **The network, at sitting 2's open**, for Task 2's Step 1 alone: vegeta's image pulled at its current release, pinned by digest and
   mirrored (*"its pull needs Rich's yes at that sitting"*).
3. **Read and decide Spec action A before sitting 3, and B before sitting 4.**
4. **The clicked half, sitting 5**: as `instructor`, run the load rehearsal on a large-course app in the console — stepped up — and read
   its result; read the checklist turn `met`. **Agents may type the laptop IdP's test passwords** (his standing yes); the clicked half is
   still a person seeing it.

---

## Read this first — what this plan knows from the code

*Read at `e969f9d` on 2026-10-03. Task 1's `[M1]` re-reads every one.*

**What §24 asks, and what exists.**
1. **At `e969f9d`, §24's production table is not built**: `audience` (`{ scale, burst }`, `projects.audience`) is read in ONE place,
   `launch/readiness.ts:226-240` (the `not_built` item), and production runs one instance whatever the scale. **The instances plan before
   this one (A1) builds the instance counts** (solo 1, class 2, large_course 3, public 3) behind one load-balanced route; Task 1's `[M1]` reads
   what it built — the deploy's instance count, the route's upstreams, the driver's set of serving instances — before anything here.
2. **The item is in BOTH of D9's clauses** (`readiness.ts:166`, the launched list; `:196`, the first launch's), so a launched large app
   would be blocked on every later release too — moot today, because none can launch.
3. **Staging is one instance**, its resources resolved from the manifest's three layers for `staging` (`spec/resolve.ts:88`:
   `spec.environments[kind]`); production's are resolved the same way for `production`. **Nothing hibernates on its own** today (the
   driver can stop an instance, `runtime/docker/instances.ts:318-…`; no sweep calls it).

**D21's rehearsal — the pattern.**
4. `launch/rehearsal.ts`: `runRehearsal` (`:110-…`) is **one at a time per project** (`tryWithRehearsalLock`, `db/locks.ts:66`; `409
   REHEARSAL_RUNNING`), deploys through **`deployRelease` with `purpose: 'rehearsal'`** (`releases/release.ts:200`, `:285-310`), measures,
   **takes down in a `finally`**, and the boot takes down a left one (`takeDownLeftRehearsals`, `:412-440`). Its record is the
   `rehearsals` table (`db/schema.ts:1043-…`) with an `evidence` jsonb; `rehearsalItem` (`:710-…`) is met by the newest PASSING record for
   the candidate. Its route is `launch:rehearse`, person-only, stepped up.
5. **Its measurement runs in a container through the engine seam** (`sso/sign-in.ts:177-309`, `createCwlSignInProbe({ engine, … })`):
   create, start, wait, read the logs' LAST JSON line, `DELETE …?force=true&v=true` — bound at boot in `src/index.ts`. **Not through the
   `Driver`**, which §11 keeps to what the control plane asks of infrastructure for an app.

**The edge.**
6. **Every app route carries a per-client-IP rate limit, 600 a minute by default** (`routing/caddy.ts:52-69`: `handler: 'rate_limit'`,
   `max_events: input.rateLimit ?? 600`) — ten a second from one address. **A generator from one container would measure the limiter,
   not the app.** (ORIENTATION §4 trap 21.)
7. **A container reaches a platform hostname through the edge** as D21's probe does (`sso/sign-in.ts:185-190`: the internal listener,
   SNI, the platform CA); Task 1's `[M2]` confirms for staging.

**Who may.**
8. **`launch:rehearse`** is person-only (`projects/authz.ts:202-209`) and step-up-guarded, held by the owner and a collaborator (the launch
   path plan's Task 6b, FE-42) — the same people this rehearsal is for.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.9.0`, AT TASK 4.** Additive: one operation, one representation, its codes, one event. (A1 takes `1.8.0`, A2
   `1.10.0`, FE-32 `1.11.0`.)
2. **THE GRANT IS A REDEPLOY OF THE CANDIDATE TO STAGING IN PRODUCTION'S SHAPE** — `deployRelease(…, { purpose: 'load-rehearsal',
   instances: <production's count for the audience>, resources: <production's resolved> })` — and **the take-down is a redeploy of the same
   release to staging's own shape** (one instance, staging's resources), in a `finally` and at boot. A redeploy is new instances beside the
   ones serving (§11), so staging never goes dark. **"Production-shaped" is production as the instances plan (A1) builds it** (Rich: *"Build §24's
   capacity first"*): the audience's instance count, production's resources, the same load-balanced route; the record says the shape.
   *Rejected:* `docker update` of the serving container's limits — a new driver method (§11) for one caller, and a container whose limits
   were changed live is not the image's own start-up under load. *Rejected:* rehearsing in production, D21's way — production's listener is
   the public one, and load is not a sign-in.
3. **THE GENERATOR IS vegeta** (MIT; Rich, 2026-10-03: *"vegeta"*, over the Node script this plan first proposed), **pinned by digest and
   mirrored into the local registry by `make seed`** — its pull a Rich-step at sitting 2 — run in a throwaway container on the platform
   network, reaching staging's hostname through the edge with the platform CA mounted, its per-phase `vegeta report -type=json` read back as
   one JSON line. **Arrival is a RATE** (requests a second, vegeta's own unit), because §24's second question is about arrival. **The rate
   vegeta ACHIEVED is read from its own report and compared with the rate asked**, so a generator-bound run is a FAILURE, never a pass
   (Decision 8). *Rejected:* k6 (AGPL); the Node script (Rich's answer).
4. **WHAT IS LOADED: WHAT A CROWD DOES FIRST** — the app's `/` (or the starter's index), its `health_path`, and, for a CWL app, its sign-in
   redirect (`auth.callback`'s login path, answered `302` without following it to the IdP). *Rejected:* synthetic signed-in sessions —
   UBC's staging IdP has no load users, so it would not be portable. The record names the paths.
5. **THE EDGE'S EXEMPTION IS FOR ONE ADDRESS, FOR ONE RUN.** While a rehearsal runs, the staging route is re-applied with its rate limiter
   skipped for the generator container's own IP (a `not remote_ip <addr>` matcher on the `rate_limit` handler — Task 1's `[M4]` measures
   the shape), and re-applied without it in the take-down. Every other client keeps 600 a minute; nobody can widen it with a header.
   *Rejected:* keying the limit by a per-user header — any client could then send the header and escape its own limit.
6. **ONE LOAD REHEARSAL AT A TIME, PLATFORM-WIDE** (`409 LOAD_REHEARSAL_BUSY`, naming nobody else's project), and refused beside D21's
   rehearsal of the same project (`409 REHEARSAL_RUNNING`): the laptop — and, at UBC, the shared cluster — is the shared resource, and two
   at once would measure each other. An advisory lock on its own pool (the launch path plan's sitting 12 lesson: never on the query pool).
7. **THE PROFILE IN RATES, AND THE RUN BOUNDED.** Rich's *"500 virtual users"* (*"As proposed"*) becomes vegeta's rates by one stated rule:
   **an arriving user asks for the three paths once, and a user who has arrived asks for one every 10 s.** So `synchronised` is **75 a
   second for 60 s** (500 × 3 arriving, plus those already there), **then 50 a second for 5 minutes**; `steady` is **a ramp of 10, 20, 30, 40
   and 50 a second, a minute each**. `public` is the same on a laptop — the stated cap — and every number is a platform setting (Decision
   12). A hard stop at 8 minutes, the generator's container removed whatever happens; the whole operation answers within ~10 minutes. **Answered when it is
   over** (as `runRehearsal` is), so a client waits; its `log` and the event say what happened.
8. **THE PASS MARK** (Spec action A; Rich, *"As proposed"*): **≥ 99% of requests answered without a `5xx` or a timeout**; **p95 under 2 s**;
   **every instance `healthy` throughout** (each polled every 5 s through the driver's `status`) **with no restart and no out-of-memory
   exit**. A failure
   names the first rule it broke, with the number (*"p95 was 4.8 s; the mark is 2 s"*).
9. **THE RECORD, `load_rehearsals`**: `project_id`, `release_id`, `image_digest`, `scale` and `burst` as rehearsed, `passed`, `profile`
   (the rates, the durations, the paths), `granted` (the resources), `evidence` jsonb (`requests`, `answered`, `status_counts`, `p50`,
   `p95`, `p99`, `timeouts`, `instance_restarts`, `oom`, `duration_ms`, `reason`), `run_by`, `created_at`. **Never a response body.**
10. **THE ITEM** (`load-rehearsal`): before launch, **met by the newest passing record for the candidate's digest at a scale at least the
    project's** (`public` covers `large_course`); `unmet` with the failed record's reason, or *"not rehearsed yet"*. After launch (Rich,
    *"First launch + audience raised"*; readiness's second clause changes accordingly):
    **met while some passing record covers the project's current scale** — so a later release needs none, and raising the audience needs
    one. `builtBy` is gone from it; a `not_built` load-rehearsal item is a regression.
11. **ONE EVENT, `load_rehearsal.completed`** `{ loadRehearsalId, releaseId, passed, p95Ms, answeredRatio, reason }`, its sentence naming
    who ran it and the result.
12. **THE PROFILE'S NUMBERS ARE PLATFORM SETTINGS** with Spec action A's values as defaults (`MANIFEST_LOAD_PEAK_RPS_LARGE`, …), as every
    platform setting is today (deployment configuration), so UBC's cluster can set what a laptop cannot. **`make demo-load` runs with them**
    unless `[M3]` finds the laptop cannot, in which case the sitting stops and asks (sitting 1's row).

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
- **A migration**: `db:generate`, READ it, apply it; the `audit.events` CHECK for the new event type.
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

**The six failure modes most likely to bite a person, that no happy path exercises.**

1. **A rehearsal that dies leaves staging granted, or the edge exempting an address.** The control plane killed mid-run; the generator's
   container killed; the redeploy back failing. Expected: **at the next boot, staging is redeployed to its own shape and the route
   re-applied without the exemption**, with an operator line naming the step; a failed take-down is `500 LOAD_REHEARSAL_TEARDOWN_FAILED`
   and the record says so. Owned by Task 4's *the take-down, every way*.
2. **A pass that measured the limiter, or the laptop.** The exemption not applied (every request `429`); a generator that cannot reach
   its rate. Expected: **a `429` is counted as not answered, so the pass mark fails, naming it**; the report carries the rate ACHIEVED, and
   a run that achieved under 90% of its target is `passed: false`, reason *"the generator reached N of M requests a second"* — never a pass.
   Owned by Task 2's *the report is honest* and Task 4's judge.
3. **A stale pass.** A new candidate after a pass; the audience raised from `large_course` to `public` after a pass. Expected: **the
   item is `unmet` again**, saying why. Owned by Task 5.
4. **Two at once.** A second project's rehearsal while one runs; the same project's D21 rehearsal while a load rehearsal runs. Expected:
   **`409 LOAD_REHEARSAL_BUSY`, naming no other project; `409 REHEARSAL_RUNNING`**; nothing granted by the refused one. Owned by Task 4.
5. **An app that falls over is reported as falling over.** An app that crashes under concurrency (restarts), one that runs out of memory,
   one that answers `503` above a few in flight — on ANY of its instances. Expected: **`passed: false` with the rule, the instance and the
   number** — the restart count, *"out of memory"*, the answered ratio — and staging restored to one instance. Owned by Task 4, with the
   fixture of Task 7.
6. **A person who may not, or should not.** A collaborator (may — FE-42's rule); a token (refused `403 TOKEN_CREDENTIAL_REFUSED`); an owner
   not stepped up (`403 STEP_UP_REQUIRED`); a `class` app (`409 LOAD_REHEARSAL_NOT_NEEDED`); no release serving staging (`409
   REHEARSAL_NO_CANDIDATE`); an archived project (`409 PROJECT_ARCHIVED`). Owned by Task 4's matrix.

---

## File Structure

```
packages/control-plane/src/launch/
  load.ts                     NEW (T2) createLoadGenerator({ engine, … }) — vegeta's container, its address, its report; (T4) runLoadRehearsal,
                                       takeDownLeftLoadRehearsals, judge
  readiness.ts                MOD (T5) loadRehearsalItem — met by a measurement
  index.ts                    MOD exports
packages/control-plane/src/routing/caddy.ts            MOD (T3) a route's rate limit may skip one address
packages/control-plane/src/releases/release.ts         MOD (T4) DeployInput.purpose 'load-rehearsal'; a resources override
packages/control-plane/src/db/schema.ts + drizzle/     MOD (T4) load_rehearsals; tryWithLoadRehearsalLock; the events CHECK
packages/control-plane/src/observability/              MOD (T4) load_rehearsal.completed
packages/control-plane/src/config.ts                   MOD (T4) the profile's settings
packages/control-plane/src/index.ts                    MOD (T2, T4) the generator bound at boot; the boot's take-down
packages/control-plane/src/api/routes/launch.ts, representations/launch.ts, error-codes.ts, authz-contract.ts, contract/document.ts   MOD (T4)
packages/console/src/, packages/mock/src/, docs/api/launching.md      MOD (T6)
packages/journey/src/load.ts, scripts/demo-load.sh, Makefile, fixtures/load-app/   NEW (T7); ci-acceptance.sh, offline-acceptance.sh MOD (T7)
docs/superpowers/spikes/load-baseline/                 NEW (T1)
```

---

## Task 1: Measure what this plan rests on

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/load-baseline/README.md` and
`results-task1-<date>.txt`.

- [ ] **Step 1: `[M1]` Re-read every *Read this first* fact at HEAD**, with line numbers — above all `launch/rehearsal.ts`,
  `releases/release.ts`'s `DeployInput` and `purpose`, `sso/sign-in.ts`'s container, `routing/caddy.ts`'s route, and `db/locks.ts`'s pools.
- [ ] **Step 2: `[M2]` A container reaches staging through the edge.** On a demo project with a release serving staging (the machine's
  `launchpath-local` if present), run `node:24-alpine` from the local registry on the platform network, as `sso/sign-in.ts` runs its probe,
  with the platform CA mounted, and `fetch` staging's hostname: record the status, the listener (`srv0`), and **the source address Caddy
  logs** for it — Task 3's exemption keys on it.
- [ ] **Step 3: `[M3]` What the generator will meet, offline.** vegeta is not on this machine until Task 2's pull (a Rich-step), so what it
  sustains is measured there (`[M3b]`). Here, record: vegeta's current release and image name as the project's documents and the image's
  own labels name it once pulled (nothing is pulled now); `infra/images.txt`'s and `mirror-images.sh`'s shape for a new image; and **the
  laptop's headroom** — `docker stats` and `uptime` with the demo apps running — so Task 2's measurement can be read against it.
- [ ] **Step 4: `[M4]` A rate limit that skips one address**, in a THROWAWAY Caddy from `manifest-caddy`'s own image on its own network:
  a route with `caddy-ratelimit`'s handler under a `not remote_ip <addr>` matcher; from two containers, record that one is limited at
  600 a minute and the other is not. Record the exact JSON Task 3 will write. Remove the throwaway.
- [ ] **Step 5: `[M5]` A staging redeploy's time** in production's shape — three instances at production's resources, through the
  instances plan's deploy — and back to one (`deployRelease` from a scratch script against a demo project): the grant's and the take-down's
  cost, and the laptop's memory with three instances of a large app beside everything else.
- [ ] **Step 6: `[M6]` The gate numbers**, the contract's version, and `pnpm test` once.
- [ ] **Step 7: Commit** the spike directory by name.
  ```bash
  git commit -m "docs(load): Task 1 — the measurements (a container through the edge, what one generator sustains, a limit that skips one address)"
  ```

---

## Task 2: The generator — vegeta, pinned and mirrored, through the edge

**Sitting 2.** Decision 3. **Its caller is Task 4's `runLoadRehearsal`.** **Its Step 1 is a Rich-step**: the network, at his yes AT THIS
SITTING (Rich, 2026-10-03: *"vegeta"* — *"pinned by digest and mirrored by make seed; the network pull needs Rich's yes at that sitting"*).

**Files:**
- Modify: `infra/images.txt` and `infra/images.lock` (vegeta, by digest), and whatever `make seed` mirrors from them into the local
  registry (`infra/seed/mirror-images.sh`); `scripts/doctor.sh` if its image checks enumerate the list (Task 1's `[M1]` says)
- Create: `packages/control-plane/src/launch/load.ts` (`createLoadGenerator`, `readVegetaReport`), `launch/load.test.ts` (the report's
  reading, from vegeta's own JSON captured at Step 2), `launch/load.docker.test.ts` (the container through the real edge)
- Modify: `src/index.ts` (the generator bound at boot: the engine, vegeta's local-registry reference, the platform network, the CA path)

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
    /** The whole run's p95 and answered ratio, over every phase's requests. */
    p95Ms: number
    answeredRatio: number
    durationMs: number
  }

  export interface LoadGenerator {
    /** The generator's own address on the platform network, known before the load starts (Task 3 exempts it). */
    start(target: LoadTarget, phases: LoadPhase[]): Promise<{ address: string; done: Promise<LoadReport> }>
  }
  ```

- [ ] **Step 1: The pull — a Rich-step, asked at this sitting's open.** With his yes and the network on:
  `docker pull <vegeta's image>` at its current release, **its digest recorded** (the version, the day, and why: the current release —
  ORIENTATION's pinning rule), added to `infra/images.txt` and `images.lock`, and mirrored into the local registry the way `make seed`
  mirrors every image (`infra/seed/mirror-images.sh`), so a clean machine's `make seed` brings it and the offline acceptance runs it. Then
  `make doctor` (its image checks, if they enumerate) and `make verify`. **Nothing else uses the network.**
- [ ] **Step 2: `[M3b]` What vegeta sustains here** — the measurement Task 1 could not make before the image was on this machine. vegeta
  in a container on the platform network (the hardening of Step 4 below), against a staging app **through a THROWAWAY Caddy route with no
  rate limit** (Task 1's `[M4]` throwaway, never the live edge), at 10, 50, 100, 200 and 400 requests a second for 30 s each: record each
  `vegeta report -type=json` WHOLE (Step 3's tests read these files), the achieved `rate`, p95, errors, and `uptime` before and after.
  **Compare with Spec action A's profile; if the laptop cannot reach it, STOP and ask Rich** (the numbers are his).
- [ ] **Step 3: The failing tests.**
  - **`load.test.ts`, *the report is honest* (Review Focus 2)** — `readVegetaReport`, over Step 2's captured JSON and hand-made variants:
    `achieved` is vegeta's `rate`, never the asked one; **a `429` and a `5xx` are not answered**; a `3xx` is answered only for a path that
    expects one (vegeta's per-request results are read for that — `vegeta encode` of the results, not only the summary); timeouts counted;
    the whole run's p95 is over every phase's latencies.
  - **`load.docker.test.ts`** — the container on the platform network reaches a staging app through the edge; `start` answers its address
    before the load; **the container is gone after `done` resolves AND after it rejects**.
- [ ] **Step 4: Run, and predict. Then implement.** `createLoadGenerator` creates one container from vegeta's local-registry image
  (`HostConfig`: `CapDrop: ['ALL']`, `ReadonlyRootfs`, a tmpfs for its results, `pids` 256, a 512 MiB ceiling; the platform CA read-only;
  `NetworkMode` the platform network), whose command runs each phase in turn — `vegeta attack -rate=<rps>/s -duration=<s>s
  -timeout=<ms>ms -root-certs=<ca> -redirects=-1 -targets=<file> > <phase>.bin` — then `vegeta encode` and `vegeta report -type=json` of
  each, printed as ONE JSON line last (the sign-in probe's convention). The targets file round-robins the paths with the staging hostname.
  It reads the container's address from `/containers/{id}/json` before the attack begins (a `sleep` until a file appears, or a
  two-step start — Step 2 records which works), and in a `finally` deletes it with `?force=true&v=true`.
- [ ] **Step 5: Commit**, then the **negative control**: count a `429` as answered. Predict red: the report's `answered` assertion only.
  ```bash
  git commit -m "feat(launch): the load generator — vegeta, pinned by digest and mirrored, through the edge, reporting the rate it achieved"
  ```

---

## Task 3: The edge — a staging route's rate limit skips the generator, for one run

**Sitting 2, after Task 2.** Decision 5.

**Files:**
- Modify: `packages/control-plane/src/routing/caddy.ts` — the route input gains `rateLimitExempt?: string` (one address); the `rate_limit`
  handler is wrapped in `[M4]`'s matcher when it is set; `routing/index.ts`'s apply exposes it
- Test: `routing/caddy.test.ts` (the JSON), `routing/routes.docker.test.ts` (or a new file `[M1]` names: the real edge)

- [ ] **Step 1: The failing tests.** The JSON: with `rateLimitExempt`, exactly `[M4]`'s shape; without it, byte-identical to today's (a pin).
  The Docker case: two containers, the exempt one sends 1,200 requests in a minute with no `429`; the other gets `429` after 600; **re-applied
  without the exemption, the first is limited again** — the take-down's half.
- [ ] **Step 2: Run, and predict.** **Step 3: Implement.**
- [ ] **Step 4: Commit**, then the **negative control**: exempt every address (drop the matcher's argument). Predict red: the second
  container's `429` assertion only.
  ```bash
  git commit -m "feat(routing): a route's rate limit may skip one address — the load rehearsal's generator, for one run"
  ```

---

## Task 4: The rehearsal — grant, run, watch, judge, record, take down

**Sitting 3. Spec action A decided first.** Decisions 1, 2, 6–9, 11, 12. **Its caller is the route below.**

**Files:**
- Modify: `releases/release.ts` — `DeployInput.purpose` gains `'load-rehearsal'`, and `DeployInput.resources?` overrides the resolved
  resources for that one deploy (refused for any purpose but `'load-rehearsal'`, and for any environment but staging — a deploy that could
  grant itself production's resources is the hole this closes)
- Modify: `db/schema.ts` — `load_rehearsals` (Decision 9); `tryWithLoadRehearsalLock` in `db/locks.ts` on a pool of its own; the
  `audit.events` CHECK; then `db:generate`, read it, apply it
- Modify: `launch/load.ts` — `runLoadRehearsal(deps, { projectId, actor })`, `judge(report, status, profile)`,
  `takeDownLeftLoadRehearsals(deps)`; `config.ts` — the profile's settings (Decision 12); `src/index.ts` — the boot's take-down
- Modify: `observability/event-schemas.ts`, `events.ts`, `examples.ts` — `load_rehearsal.completed`
- Modify: `api/routes/launch.ts` — `runLoadRehearsal` (`POST /v1/projects/{projectId}/load-rehearsal`, `credential: 'session'`,
  `capability: 'launch:rehearse'`, stepped up), and `getLoadRehearsal` (`GET …/load-rehearsal`, the newest record, `project:read`);
  `api/representations/launch.ts` — `LoadRehearsal`; `api/error-codes.ts` — `LOAD_REHEARSAL_BUSY`, `LOAD_REHEARSAL_NOT_NEEDED`,
  `LOAD_REHEARSAL_TEARDOWN_FAILED` (and `REHEARSAL_NO_CANDIDATE`, `REHEARSAL_RUNNING` reused); `api/authz-contract.ts`;
  `api/contract/document.ts` (`1.9.0`); the four contract commands; the mock's answer in the same step
- Test: `launch/load.test.ts` (the fake driver and a fake generator), `launch/load.docker.test.ts` (one real run), the route's file

**Interfaces:**
- Consumes: `LoadGenerator`, `LoadPhase`, `LoadReport` (Task 2); `applyRoute`'s `rateLimitExempt` (Task 3).
- Produces: `runLoadRehearsal(deps: LoadRehearsalDeps, input: { projectId: string; actor: { id: string } }): Promise<LoadRehearsalRow>`;
  `latestLoadRehearsalFor(db, projectId)`; `judge(report: LoadReport, watched: { restarts: number; oom: boolean; unhealthy: boolean },
  phases: LoadPhase[]): { passed: boolean; reason: string }` (pure); `phasesFor(audience, settings): LoadPhase[]` (Decision 7).

- [ ] **Step 1: The failing tests, as one matrix.**
  - **The run** (fake driver, fake generator): the candidate redeployed to staging with production's resources; the route re-applied with
    the generator's address exempt; the load; staging redeployed to its own resources; the route re-applied without the exemption; one
    record; one event — **in that order** (a recorded call list).
  - **`judge`, every rule** (Review Focus 2 and 5): a clean report passes; 98.9% answered fails naming the ratio; p95 2.1 s fails naming it;
    a restart, an OOM, an unhealthy poll each fail naming it; an achieved rate under 90% fails naming it; the FIRST broken rule is the reason.
  - **The take-down, every way** (Review Focus 1): the generator throws; the redeploy back throws (`LOAD_REHEARSAL_TEARDOWN_FAILED`, and the
    record says so); and **a boot after a run left mid-way** (a granted staging and an exempting route, written by hand) → staging redeployed
    to its own shape and the route re-applied plain, with one operator line.
  - **The refusals** (Review Focus 4 and 6): busy elsewhere, `LOAD_REHEARSAL_BUSY` naming no other project; D21's rehearsal running,
    `REHEARSAL_RUNNING`; a `class` app, `LOAD_REHEARSAL_NOT_NEEDED`; no candidate, `REHEARSAL_NO_CANDIDATE`; a token, `403
    TOKEN_CREDENTIAL_REFUSED`; not stepped up, `403 STEP_UP_REQUIRED`; a collaborator, `200`; **nothing granted by any refusal**.
  - **The override is narrow**: `deployRelease` with `resources` for a `'launch'` purpose, or for production, is refused.
  - **`load.docker.test.ts`**: one real run against a small app at a light profile (the test's own settings), passed, and staging's
    instance afterwards at staging's own resources (`docker inspect`'s `HostConfig.Memory`).
- [ ] **Step 2: Run, and predict.**
- [ ] **Step 3: Implement**, the migration, the contract commands. **Tell the front-end before the commit**: `1.9.0`; the operation; the
  record; the event; the codes.
- [ ] **Step 4: Through the edge, on driver 1**: a large-course demo project's rehearsal, quoted — its report, its time, and staging's
  resources after.
- [ ] **Step 5: Commit**, then the **negative controls**:
  - **(a)** skip the take-down's route re-apply. Predict red: the order assertion and the take-down rows.
  - **(b)** let `judge` ignore `achievedRps`. Predict red: the under-90% row only.
  - **(c)** take the lock on the query pool. Predict: green in the unit tier — say so — and record the sitting-12 reason it is on its own
    pool; the Docker case with ten concurrent boots is where it would show, and is not this task's.
  ```bash
  git commit -m "feat(launch): the load rehearsal — staging given production's capacity, the audience's arrival through the edge, judged, recorded, and given back (contract 1.9.0)"
  ```

---

## Task 5: The checklist — met by a measurement

**Sitting 4. Spec action B decided first.** Decision 10.

**Files:**
- Modify: `launch/readiness.ts` — `loadRehearsalItems` (`:226-240`) becomes `loadRehearsalItem(db, project, candidate, audience)`, async,
  in both clauses; `builtBy` gone; `since` the passing record's `created_at`
- Test: `launch/readiness.test.ts`

- [ ] **Step 1: The failing tests** (Review Focus 3): no record → `unmet`, *"not rehearsed yet"*, naming `runLoadRehearsal`; a failed
  record → `unmet` with its reason; a pass for the candidate → `met`; **a new candidate → `unmet`**; **the audience raised to `public`
  after a `large_course` pass → `unmet`**; a `public` pass covers `large_course`; after launch, a pass at the current scale for ANY release
  → `met` (Q3 (a)), and the audience raised after launch → `unmet`; a `class` app → no item (unchanged, a pin). **And the gate**: a
  production deploy of a large app with every other item met is `409` with the checklist until the item is met, then `200`.
- [ ] **Step 2: Run, and predict.** **Step 3: Implement.**
- [ ] **Step 4: Commit**, then the **negative control**: ignore the scale on the record. Predict red: the *audience raised* rows only.
  ```bash
  git commit -m "feat(launch): the load rehearsal item is met by a measurement — of the candidate, at the audience it was run for"
  ```

---

## Task 6: The clients — the console, the mock, the guide

**Sitting 4, after Task 5.**

**Files:**
- Modify: `packages/console/src/screens/launch.tsx` (or the records screen `[M1]` names) — for an owner or collaborator on a large app,
  **Run the load rehearsal** (stepped up; it says it takes ~10 minutes and what it will do to staging), and the newest record's result in
  words (*"Passed: 99.8% answered, p95 0.6 s"*, or the reason); `launch-records-state.ts` (or its neighbour) for the words
- Modify: `packages/mock/src/launch.ts` — `runLoadRehearsal` and `getLoadRehearsal` answering a pass, and, under a new switch
  `MANIFEST_MOCK_LOAD=failed`, a failure; the checklist's item by the stage; `scripted.test.ts`
- Modify: `docs/api/launching.md` — **The load rehearsal** (who, what it does to staging, the profile, the pass mark, the refusals, how long
  it takes); `docs/api/events.md`; `docs/api/frontend.md` (the switch)
- Test: the console's, the mock's

- [ ] **Step 1: The failing tests. Step 2: Run, and predict. Step 3: Implement**, `pnpm docs:write`. **Tell the front-end before the
  commit**: its *"waiting on the Manifest team"* line for `load-rehearsal` can become the owner's action.
- [ ] **Step 4: Walk the console** headless (agents may type the laptop's test passwords): the button, the step-up, the result.
- [ ] **Step 5: Commit**, then the **negative control**: show the button on a `class` app. Predict red: the console's *only for a large
  app* row; through the edge, `409 LOAD_REHEARSAL_NOT_NEEDED`.
  ```bash
  git commit -m "feat(console,mock): the owner runs the load rehearsal, and reads its result; the mock plays it"
  ```

---

## Task 7: The acceptance — `make demo-load`, and a person clicking it

**Sitting 5. Alone, and last.**

**Files:**
- Create: `packages/journey/src/load.ts`, `scripts/demo-load.sh`; `Makefile` (`demo-load`); `fixtures/load-app/` — a starter-shaped app
  whose `/` answers in ~20 ms and which, with `FALL_OVER=1` in its staging secret, answers `503` above eight requests in flight (Review
  Focus 5's app, made honestly by its own code)
- Modify: `scripts/ci-acceptance.sh` (a step, either driver), `scripts/offline-acceptance.sh` (a step; nothing here needs the network)

- [ ] **Step 1: The phases**, each ending `every check passed`, on either driver: a `large_course` project from the fixture; a release
  serving staging; the checklist's item `unmet`, *"not rehearsed yet"*; a token refused, an un-stepped session refused; **the rehearsal,
  passed**, staging back to its own resources, the route back to its limit (a 601st request from one address in a minute is `429`); the item
  `met`; then `FALL_OVER=1`, a new candidate, the item `unmet` again, **a rehearsal that fails naming the answered ratio**, staging restored.
- [ ] **Step 2: Green three times on each driver** (fresh, re-use, from `make reset`), every other demo, `make ci-acceptance`, and
  `scripts/offline-acceptance.sh` named to Rich as owed.
- [ ] **Step 3: The negative controls**, one per Review Focus line, each predicted, seen red and restored.
- [ ] **Step 4: The clicked half** (*What Rich does* 3). **Step 5: The plan's one whole-branch review**, beside the Docker tier; one fix
  wave. **Step 6: Close out**: the ledger, ORIENTATION §7e (FE-32's plan next), §8 (FE-44 BUILT), the front-end told.

---

## What this plan does not build

- **The rest of §24's production table** — backups by audience, saturation alerting, tuned edge rate limits and abuse controls — and
  **pre-warming ahead of a `synchronised` window** (Rich, 2026-10-03: *"Record it as not built"*). The instances plan (A1) builds the counts;
  **hibernation and wake-on-request are A2's**, after this plan.
- **`public`'s extra gate, the security review** (§24's table). There is no item for it; FE-44 named the load rehearsal alone.
- **Raising an audience after launch** (§24's *Changing the answer*: an administrator approves an upward change, in §26's queue) — this
  plan only makes the item `unmet` when it happens.
- **Signed-in load** (Decision 4).

---

## Asked of Rich — answered 2026-10-03, ~13:52 PDT

*Put to him through `manifest-94` (who checked the premises first); his answers, through the question tool.*

1. **"Production-shaped capacity", when production is one instance.** Recommended was (a), rehearse production as built. **Rich: *"Build
   §24's capacity first"*** — production runs instances by audience (class ≥2, large_course ≥3 with headroom, public ≥3), the edge
   balancing across them; then this rehearsal grants staging that shape. → A1, the instances plan, before this one
   (placed by him, *"A1 → B → A2"*); Decision 2 rewritten.
2. **The profile and the pass mark.** **Rich: *"As proposed"*** — 500 virtual users for `large_course` (`public` the same on a laptop, with a
   stated cap); `synchronised` all within 60 s then 5 minutes sustained; `steady` a 5-minute ramp; ≥ 99% answered (no `5xx`, no timeout),
   p95 under 2 s, the instances staying healthy; the health path, the root and the sign-in redirect. → Spec action A, with those numbers.
3. **Launched apps.** **Rich: *"First launch + audience raised"*** — not on every release. → Decision 10; readiness's second clause.

**And then** (2026-10-03, ~13:56 PDT, through the question tool): **the split — *"Two plans: A then B"*** (A, production capacity by
audience — proposed to him to split again, A1 and A2; this plan needs A1 alone); **hibernation — *"Build hibernation in Plan A"***;
**the generator — *"vegeta"***, pinned by digest and mirrored, its pull his yes at that sitting, the achieved rate compared with the asked;
and **the rate limit — *"Exempt the generator's IP"***, for one run, measured on a throwaway Caddy first.

---

## Spec actions — DRAFTED, NONE APPLIED

### A. §24 — what the load rehearsal is (before sitting 3)

**Proposed.** After *"…and that is as true of capacity as it is of identity."* (l.2762), add:

> *"**The owner runs it**, as they run D21's rehearsal, in their own session and stepped up, and it is one at a time across the platform.
> Manifest redeploys the release serving staging **in production's shape for the audience** — its instances, at production's resources,
> behind one balanced route — and puts the audience's arrival on it through the edge: for `large_course` and `public`, **500 people arriving within a
> minute and staying five minutes** (`synchronised`) **or arriving over five minutes** (`steady`) — an arriving person asking for three pages, and
> one every ten seconds while they stay — at the app's front page, its health path
> and its sign-in. It **passes** when at least 99% of requests are answered without a server error or a timeout, the 95th percentile is under
> two seconds, and every instance stays healthy with no restart and no out-of-memory exit. Then staging is given back its own shape. The numbers
> are platform settings (§26), these their defaults. The item is met by the newest passing rehearsal of the release that would launch, at
> the audience it was run for; after launch, it is asked again only when the audience is raised."*

*Shared pages:* `manifest-phases.html` and `manifest-decisions.html` (D29, if it names the load gate) — check.

### B. D24 and §26 — the person-only list and the platform settings (before sitting 4)

**Proposed.**
1. **D24**, *"running D21's pre-production rehearsal (§9)"* ⟶ *"running D21's pre-production rehearsal (§9) or §24's load rehearsal"* —
   the same capability, the same reason (it changes what staging runs, past anything a token deploys). *"Four actions are stricter still"*
   stays four: the load rehearsal is part of the fourth.
2. **§26, *Platform settings***: add *"and the load rehearsal's profile (§24)"*.

*Shared pages:* `manifest-decisions.html`'s D24 — check.

---

## What the self-review caught

1. **Rate limiting would have made every rehearsal measure the edge, not the app** — 600 a minute per address (`routing/caddy.ts:69`)
   from one generator is ten a second. Decision 5 exempts one address for one run, and Review Focus 2 makes a limiter-bound run a failure,
   never a pass.
2. **A new load-tool image needs the network and a `make seed`.** First drawn as a Node script in the mirrored base image to avoid it;
   Rich chose vegeta (*"vegeta"*), so its pull is a Rich-step at sitting 2 and `make seed` mirrors it for every machine after.
3. **The resources override was a hole as first sketched** — any deploy could grant itself production's resources. Task 4 refuses it for
   every purpose and environment but the rehearsal's staging deploy.
4. **The contract versions follow Rich's order** (A1 `1.8.0`, this plan `1.9.0`, A2 `1.10.0`, FE-32 `1.11.0`); FE-32's plan said `1.8.0`
   (changed in that plan in the same commit as this one).

---

## What executing this plan found

*(One dated section per sitting.)*
