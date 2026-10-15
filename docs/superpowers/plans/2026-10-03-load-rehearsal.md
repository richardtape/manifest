# The Load Rehearsal — §24, FE-44 — Implementation Plan

> **READ FIRST — REVISED 2026-10-14 TO ITS SECOND FRESH REVIEW** ([`2026-10-14-second-review-of-load-rehearsal.md`](./2026-10-14-second-review-of-load-rehearsal.md),
> `6f99611`; job RB of the second coordinated run, `manifest-review-b`, at Rich's 2026-10-13 answer 8, `c0f969e`). The review read this plan
> against **the code as A1 has left it — HEAD `c7e0978`, A1 through its sitting 5** — and its verdict is **approve with the fixes**: every
> one is built in below, none argued; *Revised to the second review* (near the end) says where each went. **What changed most:** a grant
> that fails is ANSWERED, not thrown, so the run reads back what serves before it loads (I1); *answered* is Rich's *"non-5xx, no timeout"*
> plus a `429`, with no per-path rule (I2); the sign-in path is the skeleton's `/login`, which now writes to the app's Mongo (I3); the demo's
> failing app is made able to fail (I4); an out-of-memory exit is read from the driver (I5); a **Spec action D** (§20's *"the one image
> that is built"*) and C moved to §20 (I6); the shared pages corrected, the stories page's class app given two copies rather than a rehearsal (I7 — decided (a) by `manifest-coord3`
> under Rich's delegation, for his review, `2f34041`); the
> D21 exclusion designed as a database invariant (I9); **SEVEN sittings** (the acceptance in two, I10). **The chain is Rich's order**:
> A1 → **B** → FE-32 → BYOA on the laptop → Phase 3 → A2 — **contract `1.10.0`** (A1 took `1.9.0` at `163f42c`). **APPROVED AS REVISED, 2026-10-14 ~00:47 PDT,**
> by `manifest-coord3` on the second review's recommendation (`6f99611`; revised `b25d7e3`), under Rich's standing delegation (`028bb94`),
> recorded for his review in `docs/superpowers/2026-09-30-decisions.md` — inline, one fresh session per sitting, seven sittings, after A1's
> sitting 8 closes; its Spec actions A–D still DRAFTED, each decided and applied at its sitting's open.
>
> **AND FE-62 IS PLACED IN THIS PLAN'S TASK 5** (contract `1.10.0`, its first schema change) — by `manifest-coord3` under Rich's delegation,
> for his review (`67fa118`, 2026-10-14 ~02:02): **`incident.opened` carries `cause`** (`deploy` | `exit` | `exit_stopped`, as `Incident.cause`
> does since A1's `60ec46e`/`68274fa`), **and a replacement's deploy says it is one**, so the front end's keeper — whose watch token is
> refused a `high` app's production Incidents (S9) — can stop inferring an exit from the events' order (its W4, manifest-app
> `docs/api-findings.md` FE-62). Additive. Task 1's `[M1]` re-reads where `incident.opened` is published (A1's sitting 5's watcher, the
> deploy) and adds it to Task 5's Files. **A1's sittings 6–8 land after this revision** — the review's §3 lists what they change under this plan; Task 1 re-reads
> every one.

> **AND SINCE THE GENTLER TEST TIERS PLAN (2026-10-14, [`2026-10-14-gentler-test-tiers.md`](./2026-10-14-gentler-test-tiers.md), placed between A1 and this plan — Rich's 1–4, `abdd01e`; approved `b492e31`):** `pnpm test` and `pnpm test:docker` run through `scripts/test-gently.sh` (utility priority, a timeout scale, a load gate — exit 75 is the gate); `resetDatabase` retries a deadlock; and **Docker Desktop's CPU count is what Rich chose in its sitting 3 — 6** (*"keep 6"*, 2026-10-15 ~09:33, `d2e2d77`; the Docker tier read 1502.7 s at 6 against 1977.1 s at 12), **on Docker Desktop 4.95.0, Engine 29.8.2** (the CPU-limit restart applied a pending update — that plan's *Sitting 3*, F1) — this plan's Task 1 reads `docker info --format '{{.NCPU}}'`, records the version, and measures on it. **THAT PLAN IS EXECUTED (2026-10-15).** **This plan starts after that plan's sitting 3, and after the small out-of-plan fix session placed before it** (`b967a8e`, `1fe7d7f`: the driver-2 sensitive-diff race and the launch demos' re-use check after `make demo-capacity` — this plan's sitting 7 runs `make ci-acceptance`). **That fix session is DONE (2026-10-15, `manifest-fix2`): `a4937a6` (a commit's sensitive diff is never against its own row) and `f57b3cb` (a launch demo's re-use passes on a self-serve release since an approval) — so driver 2's `make ci-acceptance` no longer meets the race, and a launch demo's re-use right after `make demo-capacity` is green (the roadmap's *Tracked defects*).**

> **SITTING 1 IS DONE (2026-10-15, `manifest-b-s1`, Task 1 `a46bdad9`)** — the measurements are
> [`../spikes/load-baseline/README.md`](../spikes/load-baseline/README.md), and a *SITTING 1 MEASURED* note sits under each task one
> changes. **SITTING 2 IS DONE (2026-10-15, `manifest-b-s2`)**: Spec actions C and D APPLIED (`a5c44838`; D in Rich's re-worded words),
> vegeta v12.13.0 downloaded and checksum-verified, Task 2 `3205b956` (the generator), Task 3 `fff41f8c` (the exemption, `outOfMemory`),
> the two composed through the real edge `d33d950f`; a *SITTING 2 BUILT AND MEASURED* note sits under Task 4. **Sitting 3 is next: Spec
> action A at its open (approved as drafted, `3ba424a`), then Task 4.**

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
> added C; the second review added D), **none applied.** **NOT YET APPROVED — revised (`2d74a5d`); a second fresh review before approval** (Rich, 2026-10-03, 15:20 PDT:
> *"A1 and FE-32 now; B and A2 later (Recommended)"* — B and A2 are reviewed again when each is next in line). **The second review is
> done** (`6f99611`) and this plan revised to it (the banner above).
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
  boot. **A deploy that fails is ANSWERED, not thrown** (a member `failed`, the previous set restored), so **the run reads back what
  serves staging before it loads anything**, and loads only exactly the set it started (the second review's I1). **While a run holds
  staging, every other staging deploy of the project is refused** (`409 LOAD_REHEARSAL_RUNNING`), so nothing replaces the granted set
  mid-run and the take-down never silently reverts someone's deploy.
- **The load is vegeta's** (MIT; Rich: *"vegeta"*), in an image **built locally** (Rich: *"Build it locally"*) from the already-mirrored
  `alpine:3.22` and vegeta's official release binary, **verified against its published checksum and a checksum pinned in this repository**;
  `make seed` builds it on any machine, into the Docker daemon's own image store (the second image the platform builds rather than pulls —
  Spec action D). It runs in a throwaway container on the platform network, reaching staging THROUGH THE EDGE — the
  engine seam D21's sign-in probe already uses (`sso/sign-in.ts`) — and prints its whole result as ONE JSON line last. Its one download is a
  Rich-step at sitting 2.
- **For the run's duration only, the staging route's per-IP rate limit does not apply to the generator's own address** (Rich: *"Exempt
  the generator's IP"*) — **through a new `Driver` verb, `setRateLimitExemption(hostname, address | null)`** (Spec action C, §11 and §20):
  only the driver applies routes, and the control plane outside it imports `routing/` for `listenerFor` alone (`releases/release.ts:26`,
  `launch/rehearsal.ts:16`).
- **The profile comes from the audience** (Spec action A's numbers, platform settings with those defaults); the pass mark is stated —
  **a request is answered unless it is a server error, a `429` or a timeout** (Rich's *"non-5xx, no timeout"*, and a `429` because the
  limiter answered it, not the app).
- **The item is met by the newest `passed` rehearsal of the candidate, at the audience it was run for** — scale and burst — and a new
  candidate, or an audience raised, makes it `unmet` again.
- **The contract goes to `1.10.0` ONCE, at Task 5**, the first schema change (A1 took `1.9.0` at `163f42c`; FE-32 then takes `1.11.0`,
  BYOA on the laptop ~`1.12.0`, A2 later — Rich's order).

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0 (host); the generator vegeta (MIT), its image built locally from `alpine:3.22` (by the
digest `infra/images.lock` holds) and its official `linux` release binary, checksum-verified (Task 2); Fastify 5.12.3, Drizzle over
Postgres 16, `zod/v4`, Vitest 2.1; Caddy 2.11.4 with `caddy-ratelimit` v0.1.0 (`infra/caddy/Dockerfile`); Docker Desktop 29.7.2. **One new
image, built here** (Rich, 2026-10-03) — the platform's second built image (Spec action D); no new package.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read (lines at `c7e0978`):
- **§24**, *Audience and scale* — its production table as A1's Spec action B left it (l.2797-2812: *"Instances are exactly 1, 2, 3 and 3"*)
  and above all *Sandbox and staging ignore all of it* (l.2822-2833).
- **§13**, the checklist, and **D21**'s rehearsal (the pattern this follows) with **D24**'s person-only list (l.220).
- **§11**, the *Driver interface* as A1's Spec action A left it (l.1159-1180) and *Redeploys* (a redeploy is a new set beside the one
  serving, l.1263-…).
- **§20**, *The edge as a control point* (l.2077-2095) — the per-IP rate limits, and *"the one image that is built rather than pulled"*.
- **§12**, the edge's listeners and the hardening baseline.

**Roadmap:** the ORDER line in *The faculty front-end's message* (2026-10-03, as re-cut 15:28 and 2026-10-13): A1 → B → FE-32 → BYOA on
the laptop → Phase 3 → A2.

**Predecessor:** [`2026-10-03-production-instances.md`](./2026-10-03-production-instances.md) — A1, production's instances by audience (Rich,
2026-10-03: *"Build §24's capacity first"*, then *"A1 → B → A2"*), **EXECUTING since 2026-10-13** (sittings 1–5 done at this revision).
**This plan starts only after A1's sitting 8 has closed** (its acceptance and its clicked half; A1's close names this plan next).

**Successor:** [`2026-10-03-fe32-dependencies.md`](./2026-10-03-fe32-dependencies.md) — FE-32, with §12's allowlist (approved 2026-10-03,
contract `1.11.0`); then BYOA on the laptop ([`2026-10-13-byoa-on-the-laptop.md`](./2026-10-13-byoa-on-the-laptop.md), approved
2026-10-13, `2b3dd6d`), Phase 3, and A2 ([`2026-10-03-hibernation.md`](./2026-10-03-hibernation.md)) — Rich's order of 2026-10-03 15:28
(*"FE-46/47/5 → A1 → B → FE-32 → Phase 3 → A2"*), with BYOA placed after FE-32 on 2026-10-13 (`0b17f87`).

---

## How this plan is to be executed — sittings, one per session

> **SEVEN SITTINGS, PROPOSED** (five before the first review, which judged the old sitting 3 too big for one session; six before the
> second, which judged the acceptance's sitting too big — I10 — and split it as A1 split its own: the demo, then everything else). Task 1
> is first and alone. The generator, the edge's exemption and its `Driver` verb are Docker-heavy and share a sitting. **The run** — the
> grant, the load, the watch, the judgement, the record, the take-down and the boot's half — is one task in its own sitting, with no wire
> change. **The operation** — the route, its codes, its event, and staging held while a run lasts — is the next. The checklist and the
> clients share one. The acceptance is last, in two sittings. **Inline** (`superpowers:executing-plans`), one fresh session per sitting, as
> A1 runs — for the approval to confirm.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Where it stops | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements**: every fact re-read (A1's sittings 6–8 included); a container on the platform network reaching staging through the edge (the CA, SNI, the source address Caddy sees); the laptop's headroom (what vegeta sustains is Task 2's, after its download); a route whose rate limit skips one address, in a THROWAWAY Caddy from the edge's image; a staging-shaped set in production's N-instance shape on a hostname no project holds, started and given back; an out-of-memory exit as Docker reports it; the gate numbers | No | After Task 1's commit | **DONE 2026-10-15** (`manifest-b-s1`, the third coordinated run's B1): Task 1 `a46bdad9` — [`../spikes/load-baseline/`](../spikes/load-baseline/README.md); 14 findings, F1 (Spec action D's count) re-worded by Rich (`624deb66`); a *SITTING 1 MEASURED* note under Tasks 2–6 and 8a |
| 2 | 2, 3 | **Spec actions C and D applied first** (staged scripts Rich runs). **The generator** (vegeta built locally — its download and checksum a Rich-step at this sitting's open — its container, its one-line result) and **the edge's exemption** with its **`Driver` verb** (`setRateLimitExemption`, both drivers, the driver contract), **and `InstanceStatus.outOfMemory`** | Yes — `launch/`, `routing/`, `runtime/`, `infra/` | After both commits, with one generator run through the real edge quoted. **It stops and asks Rich** if `[M3b]` finds the laptop cannot sustain Spec action A's profile — the numbers are his | **DONE 2026-10-15** (`manifest-b-s2`, the third coordinated run's B2): Spec actions C and D `a5c44838` (in-session, D in Rich's words); vegeta v12.13.0, both checksums matched; Task 2 `3205b956`, Task 3 `fff41f8c`, composed `d33d950f` (exempted 750/750 at 30.04/s, p95 2.8 ms; not, 600 + 150 × `429`); `[M3b]` 400/s with 0 errors — no stop for Rich; the Docker tier and `pnpm` twice in the record |
| 3 | 4 | **Spec action A applied first.** **The run**: grant, read back, load, watch, judge, record — the row written `running` BEFORE the grant — and take down; one at a time platform-wide, by a database invariant; **the boot's pass 2⅞**; the `load_rehearsals` table. No wire change | Yes — `launch/`, `releases/`, `db/` | After the commit, with one run through the edge on driver 1 from a scratch script, passed, and staging back in its own shape | ← **next** (`manifest-b-s3`): Spec action A at its open (approved as drafted, `3ba424a`); read Task 4's *SITTING 2 BUILT AND MEASURED* note first |
| 4 | 5 | **Spec action B applied first.** **The operation**: `runLoadRehearsal` (`202`) and `getLoadRehearsal`; its codes, declared on every operation that answers them; `load_rehearsal.completed`; **staging deploys refused while a run holds the project**; **contract `1.10.0`** | Yes — `launch/`, `releases/`, `observability/` | After the commit, with the front-end told and one run through the edge polled to its end | |
| 5 | 6, 7 | **The checklist** — met by a `passed` measurement, at the scale and the burst, for the first launch and an audience raised (Q3) — and **the clients**: the console's *Run the load rehearsal*, the mock's stage, the guide | Yes — `launch/` | After both commits, with the front-end told | |
| 6 | 8a | **The acceptance's demo**: `make demo-load`, three times on each driver (fresh, re-use, from `make reset`), and its negative controls | Yes, if any code changes | After the demo's commit and its controls | |
| 7 | 8b | **The rest of the acceptance**: every other demo; `make ci-acceptance`; a clicked half; the plan's one whole-branch review beside the Docker tier, and its one fix wave. **Alone, and last** | Yes, if any code changes | After the clicked half and the review's one fix wave | |

**EVERY SITTING ENDS THE SAME WAY** — the four gates (`pnpm test` twice, alone, on the final tree), the Docker tier when owed (**7100
stopped for it** — it runs the set watcher), a dated *What executing this plan found*, this table, and ORIENTATION §6's sweep. **Three rules
survive any re-cut:** Task 1 first and alone; Task 8 last, 8b alone; no task a spec action changes before it has been decided and applied
(**C and D before sitting 2**, where Task 3 adds the verb and Task 2 the image; **A before sitting 3**, where Task 4 builds the profile;
**B before sitting 4**, where Task 5 builds the person-only route).

---

## Decided by Rich — build them, do not re-open them

- **FE-44 (a) — *"Build the load rehearsal first"*** (2026-10-03, ~13:46 PDT, through `manifest-94`'s question tool;
  [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md)): the platform builds §24's load rehearsal, before faculty use it for real, as
  a plan of its own, **after FE-46, FE-47 and FE-5, before FE-32**. *Rejected by that choice:* (b) a `not_built` item that does not block;
  (c) only saying so earlier. The front-end's *"waiting on the Manifest team"* line stays true meanwhile.
- **THE ORDER** (2026-10-03, ~13:58: *"A1 → B → A2"*; RE-CUT at 15:28, his words: *"I think your suggestion of FE-46/47/5 → A1 → B →
  FE-32 → Phase 3 → A2 is good"*; and on 2026-10-13, ~20:15, BYOA on the laptop split out of Phase 3 and placed after FE-32, `0b17f87`,
  approved ~21:50, `2b3dd6d`): *faculty-ready* → the UBC AI Gateway → the U1 levels → the Manifest team's step (FE-46, FE-47, FE-5) →
  **A1, production instances by audience** → **the load rehearsal (this plan)** → FE-32 with the allowlist → BYOA on the laptop → Phase 3
  (sandboxes) → **A2, hibernation and wake-on-request** → the vulnerability database in the console → FE-45.
- **THIS PLAN'S SECOND FRESH REVIEW, IN THE SECOND COORDINATED RUN** (2026-10-13, 16:01, answer 8, `c0f969e`: *"RB: B's second review
  (Recommended)"* — beside A1's sittings 6–8, documents only, its approval put to him at its close), and **his standing delegation**
  (~19:38, `028bb94`: *"For future questions over this session, please lock in your own recommendations"*) — so `manifest-coord3` decides
  this plan's approval on the review's recommendation, recorded for his review. Under it, `manifest-coord3` decided the review's I7
  (`2f34041`): the stories page's class app is told two copies, not a load rehearsal (Spec action A's sweep).
- **VEGETA, BUILT LOCALLY** — *"Build it locally (Recommended)"* (2026-10-03, ~14:33 PDT, through the question tool, answering the fresh
  review's I4): **an image built from the already-mirrored alpine plus vegeta's official release binary, verified against its published
  checksum; the download a Rich-step at that sitting.** (It replaces *"pinned by digest and mirrored"*, which assumed a published image whose
  provenance nobody had checked.)
- **Carried, still binding:** D21's rehearsal is the owner's (`launch:rehearse`, person-only, stepped up — the launch path plan's Spec
  action 8); D24; every refusal asserts its code; published text cites no section, decision or plan; the front-end is told before any
  commit to `packages/contract` or `packages/mock`.

---

## What Rich does, and when

1. **This plan's approval, after its second fresh review** (Rich, 15:20: *"B and A2 later"*) — done (`6f99611`) and revised to; the approval
   is `manifest-coord3`'s under his delegation (`028bb94`), recorded for his review, or his own. His answers of 2026-10-03 are in *Asked of
   Rich*; the review's §4 lists every place this plan goes past them.
2. **The network, at sitting 2's open**, for Task 2's Step 1 alone: vegeta's release archive for this machine's architecture and its
   published checksums file downloaded, the archive verified against both, and the image built (*"its download a Rich-step at that
   sitting"*).
3. **Spec actions C and D before sitting 2, A before sitting 3, and B before sitting 4: decided** (his, or `manifest-coord3`'s under the
   delegation, marked for his review) **and APPLIED BY HIM from a staged script at that sitting's open.** The classifier refused A1's spec
   edits AND their commits (A1's sittings 3 and 4: Rich applied Spec action A, `49b9a83`, and B, `3d57fc3`, with the schematic's sweep
   `6eb15e0`, from the sessions' staged scripts). So each sitting stages ONE guarded script — the spec edit, the shared pages' sweep and
   the commit, refusing unless the diff is exactly the drafted words — for him to run with `! bash <path>`; the session never retries a
   refused edit another way.
4. **The clicked half, sitting 7**: as `instructor`, run the load rehearsal on a large-course app in the console — stepped up — and watch it
   run and finish; read its result; read the checklist turn `met`. **Agents may type the laptop IdP's test passwords** (his standing yes);
   the clicked half is still a person seeing it.

---

## Read this first — what this plan knows from the code

*Read at `e969f9d` on 2026-10-03; the facts the first revision added were read at `75030d8`. **Re-read at `c7e0978` (2026-10-14) by the
second review** — A1 through its sitting 5 — and every line number below is that commit's; facts 13–22 are the second review's. A1's
sittings 6–8 land after it (the review's §3), so Task 1's `[M1]` re-reads every one.*

> **RE-READ AT `d2e2cf0d` BY TASK 1 (2026-10-15, sitting 1 — every fact's lines at that commit:
> [`../spikes/load-baseline/facts-at-d2e2cf0.md`](../spikes/load-baseline/facts-at-d2e2cf0.md)). None changed in meaning.** Lines moved:
> **6** → `routing/caddy.ts:156-166` (and 8: no `unhealthy_status` at all, `745def2`); **16** → the skeleton's `/login` `server.js:120`, the
> ACS `:125`, `/healthz` `:104-111`, the starter's static `/` `proof-app/server.js:365` (`1d40042`); **17** → `releases/watch.ts:197-203`,
> launched-only COMMITTED (`59a540f`). **Fact 1's *"the audience's `burst` is read only by the checklist"* is wrong: nothing reads `burst`
> yet** — Task 6 is its first reader. Already slightly off at `c7e0978`: `db/locks.ts:96-117`, `restoreRoute` `:774-816`, the fake's
> `crash` `:58`, `samlRequestCache` `:77-110`; the set watcher is created at `src/index.ts:453` and STARTED at `:471`.

**What §24 asks, and what exists.**
1. **§24's production counts are BUILT** (A1's Task 5, `163f42c`): **`shapeFor(kind, purpose, audience)`** (`releases/shape.ts:46-55`) is
   the only place a deploy's shape is decided — production for a launch or a replacement `solo` 1, `class` 2, `large_course` 3, `public`
   3, at production's resources; D21's rehearsal 1; staging and sandbox 1 at their own — read inside `deployReleaseSet` and nowhere else
   (`releases/release.ts:504-510`: the count from the audience as it is at THIS deploy, and `release.resolvedConfig[shape.resources]
   .resources`). The audience's `burst` is read only by the checklist; `shapeFor` takes the scale.
2. **The item is in BOTH of D9's clauses** (`launch/readiness.ts:168`, the launched list; `:198`, the first launch's; the item itself
   `:227-240`, `not_built`), so a launched large app would be blocked on every later release too — moot today, because none can launch.
3. **Staging is one instance**, its resources resolved from the manifest's three layers for `staging` (`spec/resolve.ts:88`:
   `spec.environments[kind]`); production's are resolved the same way for `production`. **A1 keeps staging at one, and its readers rely on
   it** (`launch/candidate.ts:43`: `candidateFor` reads staging's `servingInstanceOf`, the set's first, and A1's sitting 6 makes it the set's
   first HEALTHY member) — this plan breaks that for a run's length, and only for the candidate's own release. **Nothing hibernates on its
   own** today; A2, three plans after this one, hibernates staging.

**D21's rehearsal — the pattern.**
4. `launch/rehearsal.ts`: `runRehearsal` (`:110-…`) is **one at a time per project** (`tryWithRehearsalLock`, `db/locks.ts:96-115`, on
   `outerLockPool`; `409 REHEARSAL_RUNNING`), deploys through **`deployRelease` with `purpose: 'rehearsal'`** (`:205-209`), measures, **takes
   down in a `finally`**, and the boot takes down a left one (`takeDownLeftRehearsals`, `:412-…`, `recover.ts`'s pass 2¾). Its record is the
   `rehearsals` table (`db/schema.ts:1165-…`) with an `evidence` jsonb; `rehearsalItem` (`:711-…`) is met by the newest PASSING record for
   the candidate. Its route is `launch:rehearse`, person-only, stepped up. **`REHEARSAL_RUNNING`'s hint says *"up to about two minutes"***
   (`api/error-codes.ts:641-644`) — true of D21's, wrong for this one.
5. **Its measurement runs in a container through the engine seam** (`sso/sign-in.ts:177-311`, `createCwlSignInProbe({ engine, … })`):
   create, start, wait, read the logs' LAST JSON line, `DELETE …?force=true&v=true` — bound at boot in `src/index.ts:370`. **Not through
   the `Driver`**, which §11 keeps to what the control plane asks of infrastructure for an app. Its image, `curlimages/curl:8.11.1`
   (`:77`), is run from the Docker daemon's own store.

**The edge.**
6. **Every app route carries a per-client-IP rate limit, 600 a minute by default** (`routing/caddy.ts:153-164`: `handler: 'rate_limit'`,
   one zone whose `match` is every address, `key: '{http.request.remote.host}'`, `max_events: input.rateLimit ?? 600`) — ten a second from
   one address. **A generator from one container would measure the limiter, not the app.** (ORIENTATION §4 trap 21.) The Docker driver
   applies every app route with the default (`runtime/docker/driver.ts:577-585`, `:807-816`).
7. **A container reaches a platform hostname through the edge** as D21's probe does (`sso/sign-in.ts:271-283`: the platform network, the
   platform resolver, the CA mounted); Task 1's `[M2]` confirms for staging.
8. **Only the driver applies a route.** Outside `runtime/docker/`, the control plane imports `routing/` for `listenerFor` alone
   (`releases/release.ts:26`, `launch/rehearsal.ts:16`). **`restoreRoute(ids)` rebuilds a SET's plain route** from the containers' labels,
   its health policy from their health-path label (`runtime/docker/driver.ts:774-818`), with no exemption. The route builder takes the
   health policy as a parameter (`routing/caddy.ts`, `appHealthPolicy`): active checks on the health path every 5 s, passive ones counting
   ~~dial failures, `502` and `504` — **never `503`**~~ **only the failures the edge meets reaching a member — a dial or transport failure —
   and NO status the app answers, `502`, `503` and `504` included** (A1 sitting 8's whole-branch review, I1, `745def2`: a `502` or `504` an
   app answers because its own dependency failed ejected it, and a shared outage every member), so a member shedding load, or answering
   its model gateway's failure, stays in rotation. **And from the same fix wave:** a deploy's identity check waits for every member within
   **`16 × N`** answers, not `4 × N` (M1: under live traffic a reached member went unseen for `4 × N` about 1 deploy in 256 at two and 1 in
   65 at three — this plan's generator IS that traffic); and a replacement that fails before it starts anything is retried by the set
   watcher's next pass, not stopped (I2) — only the gate's `ReleaseError` stops replacing.

**Who may.**
9. **`launch:rehearse`** is person-only (`projects/authz.ts:195-209`) and step-up-guarded, held by **the owner, a collaborator and an
   administrator** (the launch path plan's Task 6b, FE-42; an administrator acting as no member gives §26's reason,
   `ADMIN_REASON_REQUIRED`) — the same people this rehearsal is for.

**Added by the first revision** (the first review's C1, I3, I6).
10. **No Node client can wait out a run.** The journey's client is `openapi-fetch` over the global `fetch` (`packages/contract/src/client.ts:49`,
    `:75`: a caller may pass its own `fetch`, and none does), and Node's `fetch` (undici) gives up on response headers after **300 s** by
    default — a synchronous 8–10-minute operation cannot be called by `make demo-load`, nor, almost certainly, by the faculty front-end's
    server.
11. **A deploy holds staging only while it deploys.** `withEnvironmentLock` wraps each deploy's work (`release.ts:530`) and nothing longer,
    so between the grant and the take-down any staging deploy — a token's included — replaces the granted set, and the take-down's redeploy
    then silently reverts it.
12. **The boot's passes** (`releases/recover.ts:54-276`): 0 builds; 1 the Route records, each hostname's whole SET (A1); 2 a deploy left
    mid-way (`provisioning`, `starting`, `waking` → `failed`); 2½ archives (`finishTeardowns`); **2¾ a D21 rehearsal left serving
    (`takeDownLeftRehearsals`, `:237-242`)**; **3 the retire passes, LAST** (`:245-264`); then the set watcher starts (`src/index.ts:453`).
    A1's Decision 7 fixes the order, and gives this plan **pass 2⅞**, after D21's and before the retirer.

**Added by the second review** (read at `c7e0978`).
13. **`shapeFor`'s staging answer comes FIRST** (`shape.ts:51`: *not production, or a rehearsal → one, at its own*), so this plan's row is
    written before that line. `shape.test.ts:37-45` asserts staging is one *"whatever the audience or purpose"* over the three purposes it
    names — true until this row; its title changes with it. `shape.test.ts:58-68` is A1's type test: `DeployInput` has no `instances` or
    `resources`.
14. **A deploy that fails is ANSWERED, not thrown.** When a member of the set is not healthy, `deployReleaseSet` marks every member
    `failed`, restores the previous set, revokes the new keys, records ONE Incident and **returns** — `answer` is the failed member
    (`release.ts:1280-1283`; an `InstanceNotReadyError` is caught and recorded, `:962-988`; A1's sitting 4, F4). It throws only when the set
    never started. D21's rehearsal reads `instance.state` for exactly this reason (`launch/rehearsal.ts:269-275`: *"the previous instance —
    if any — keeps serving, so the probe would measure something other than this release"*).
15. **Nothing reports an out-of-memory exit.** `InstanceStatus` is `{ id, state, healthy, message?, exitCode? }` (`runtime/driver.ts:176-186`),
    and the Docker mapping reads `Status`, `ExitCode` and `Health` (`runtime/docker/instances.ts:15-47`), never `State.OOMKilled`. An exit
    code of 137 is any `SIGKILL`. The fake driver's `crash(id, exitCode?)` (`runtime/fake-driver.ts:51-57`) has no such flag either.
16. **The sign-in path is the skeleton's `/login`** (`blueprints/node-ts-mongo/skeleton/server.js:119`), not `auth.callback`'s — that is the
    ACS, a POST (`:124`). No manifest field names it; D21's probe hard-codes it (`sso/sign-in.ts:112`). **Since A1's Task 8a (`0ba9af8`),
    each `/login` inserts an AuthnRequest id into the app's own Mongo** (`saml_requests`, an eight-hour TTL index;
    `skeleton/auth/ubcshib.js:59`, `:77-108`). Sessions are not written for a stranger (`skeleton/auth/session.js`: `saveUninitialized:
    false`). `/healthz` pings Mongo (`server.js:103-110`). The starter's `/` is its static page (`starters/proof-app/server.js:363`) — an
    agent's app may answer `/` however it likes, a redirect to sign-in included.
17. **The set watcher reads PRODUCTION only** (`releases/watch.ts:191-193`), of active projects, members its own driver started — and, in
    A1's sitting 6's working tree at this review, **launched projects only** (sitting 5's F12). A granted staging set is never its business;
    nothing notices a staging member's exit but this plan's own watch. **7100 runs it since `68274fa`: stop 7100 for every `pnpm test:docker`**
    (ORIENTATION §4's trap 7; TRAPS.md *SET WATCHER*).
18. **The lock pools** (`db/client.ts:38-40`): `lockPool` (the environments' locks — *"nothing holding an environment lock ever takes
    another lock"*) and `outerLockPool` (a project's and D21's rehearsal's, which take an environment's inside), ten connections each. The
    launch path plan's sitting 12 deadlocked the boot on nested holders of one pool.
19. **The `deploy` operation** (`api/routes/releases.ts:1071`) is the one way a person or a token deploys; its `errors` list declares what it
    answers. A code an operation answers and does not declare is the front-end enablement plan's F19.
20. **§20 says the edge's image is *"the one image that is built rather than pulled"*** (spec l.2088-2089) — this plan builds a second —
    and **§20, not §12, states the per-IP rate limits** (*The edge as a control point*, l.2077-2084).
21. **`make reset` wipes the registry** and re-pushes only `infra/images.txt`'s images from the daemon (`Makefile:88`, `:119-121`;
    `infra/seed/mirror-images.sh`); `scripts/app-images.sh` sweeps every tag under `127.0.0.1:7107/local/`. A container the control plane
    creates through the Engine API runs from the daemon's store.
22. **The fake driver keeps no call list** — `routeHistory`, `routeOf`, `crash`, `vanish` and the rest (`runtime/fake-driver.ts:49-97`);
    A1's restore test records `restoreRoute` calls with a wrapper of its own.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.10.0`, AT TASK 5**, the first schema change; Tasks 6 and 7 add to it. Additive: three operations, one
   representation, its codes, one event. (A1 took `1.9.0`, `163f42c`; FE-32 takes `1.11.0`, BYOA on the laptop ~`1.12.0`, A2 later.) Task
   4 changes nothing on the wire. **What it leaves its successors**: `runLoadRehearsal` is session-only, and `getLoadRehearsal` and
   `listLoadRehearsals` are a token's to call — so BYOA's tool count (its Task 7 Step 5 says *"46 at contract `1.9.0`"*) and its count of
   session-only operations (27 at `1.8.0`, its *Read this first* 9) each move; its Task 1 re-chains them.
2. **THE GRANT IS A REDEPLOY OF THE CANDIDATE TO STAGING IN PRODUCTION'S SHAPE** — `deployRelease(…, { purpose: 'load-rehearsal' })`, and
   **the shape is `shapeFor`'s new row** (A1's one function, `releases/shape.ts`): **staging, `'load-rehearsal'` → production's count for
   the audience, at production's resolved resources**. `deployRelease` refuses `'load-rehearsal'` for any environment but staging (a plain
   `Error`: no client can reach it). **The take-down is a redeploy of the same release to staging's own shape** (`purpose: 'launch'`'s
   staging row: one instance, staging's resources), in a `finally` and at boot. A redeploy is new instances beside the ones serving (§11),
   so staging never goes dark. **"Production-shaped" is production as A1 builds it** (Rich: *"Build §24's capacity first"*): the audience's
   instance count, production's resources, the same load-balanced route; the record says the shape. The row is written BEFORE `shapeFor`'s
   *"not production → one"* line (*Read this first* 13), and the staging case's test names the purposes it covers.
   **THE RUN LOADS ONLY WHAT IT READ BACK** (the second review's I1): a deploy whose member is not healthy is ANSWERED — every member
   `failed`, the previous set restored, one Incident (*Read this first* 14) — so after the grant the run reads
   `driver.servingInstances(hostname)` and proceeds only when it is EXACTLY the set the grant started, `shapeFor`'s count, every member
   `healthy`. Otherwise the row ends `failed` — *"production's shape could not start on staging"*, with the Incident's line — and nothing is
   exempted or loaded: what still serves is staging's own instance, and a measurement of it would meet the item for a shape that never ran.
   **`granted` is written from that read**, never from the intent (P6a sitting 9's lesson: the evidence describes what happened). The
   take-down is read back the same way — one member, staging's resources, serving — and a take-down ANSWERED `failed` is
   `teardown_failed`, as a thrown one is (Decision 9).
   *Rejected:* a `DeployInput.instances` / `.resources` override (this plan's first draft) — three plans would each grow an override path,
   and a caller-supplied resource is a hole a refusal then has to close; a purpose can only ask for the shape its row gives (the review's
   minor and cross-plan 4). *Rejected:* `docker update` of the serving container's limits — a new driver method (§11) for one caller, and a
   container whose limits were changed live is not the image's own start-up under load. *Rejected:* rehearsing in production, D21's way —
   production's listener is the public one, and load is not a sign-in.
3. **THE GENERATOR IS vegeta, BUILT HERE** (MIT; Rich: *"vegeta"*, then *"Build it locally"*): `infra/vegeta/Dockerfile` — `FROM` the
   mirrored `alpine:3.22` by digest, the release binary copied in, `vegeta --version` run at build time — **built by `make seed` into the
   Docker daemon's own image store as `manifest/vegeta:<version>`**, which is where the Engine API creates a container from (as D21's probe
   runs `curlimages/curl`), never under `127.0.0.1:7107/local/` (`scripts/app-images.sh` sweeps that prefix) and not in the registry, which
   `make reset` wipes (*Read this first* 21; the second review's M5); **its version and the release archive's sha256 for each architecture
   pinned in `infra/vegeta/vegeta.lock`**, and a download whose sha256 matches neither vegeta's published checksums file nor the lock is
   refused (ORIENTATION's pinning rule: the current release, recorded with the day and the reason). It runs in a throwaway container on the
   platform network, reaching staging's hostname through the edge with the platform CA mounted, **`-max-body=0`** so no response body is
   kept in its results (a large `/` would otherwise fill its in-memory tmpfs and fail the generator, not the app — the second review's M6).
   **Its result comes out as ONE JSON line, last** (the sign-in probe's convention), built inside the container by its own shell from the
   results on its tmpfs: **each phase's `vegeta report -type=json`; the whole run's, over every phase's `.bin` (`vegeta report -type=json
   <all>.bin`)**; and **per-path status counts** from `vegeta encode -to csv`, folded by busybox `awk` — EVIDENCE of where a failure was,
   never a rule (Decision 8), and nothing per-request ever leaves the container. **Arrival is a RATE** (requests
   a second, vegeta's own unit), because §24's second question is about arrival. **The rate vegeta ACHIEVED is read from its own report
   and compared with the rate asked**, so a generator-bound run is a FAILURE, never a pass (Decision 8). *Rejected:* k6 (AGPL); the Node
   script (Rich's answer); a published vegeta image (provenance unchecked — Rich's answer).
4. **WHAT IS LOADED: WHAT A CROWD DOES FIRST** — the app's `/`, its blueprint's `health_path`, and, for a CWL app, its sign-in redirect:
   **the skeleton's `/login`** (*Read this first* 16 — the convention D21's probe uses; `auth.callback` is the ACS, a POST), answered
   `302` without following it to the IdP. **Each `/login` writes** an AuthnRequest id into the app's own Mongo (A1's Task 8a, an eight-hour
   TTL) — a synchronised run's ~6,500 — so the rehearsal measures the app's database on sign-in, as real arrivals do; the record says how
   many `/login` requests it sent, and the documents expire by themselves. *Rejected:* synthetic signed-in sessions — UBC's staging IdP
   has no load users, so it would not be portable. The record names the paths.
5. **THE EDGE'S EXEMPTION IS FOR ONE ADDRESS, FOR ONE RUN — AND IT IS A `Driver` VERB** (the review's I2; Spec action C):
   `setRateLimitExemption(hostname: string, address: string | null): Promise<void>` re-applies the hostname's route as it stands — its
   set, its health policy, its headers — with its `rate_limit` handler skipped for that one address (a `not remote_ip <addr>` matcher —
   Task 1's `[M4]` measures the shape — the route's zone already carries a `match` over every address, *Read this first* 6, and the
   exemption may be that zone's matcher), or, given `null`, without any exemption. The run sets it after the grant and clears it before the
   take-down; the take-down's redeploy builds a plain route anyway, and the boot clears it too. **The run calls it under staging's
   environment lock** (an archive takes that lock, so the two cannot interleave); **a switched-off name stays switched off** (its route
   dials nothing — `servingInstances` answers `[]` — and the verb changes nothing there); it re-applies EXACTLY the set the hostname reaches
   now, with its health policy, never the Route rows' idea of it. The fake driver records it, so the run's order test sees it. Every other
   client keeps 600 a minute; nobody can widen it with a header.
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
   The laptop — and, at UBC, the shared cluster — is the shared resource, and two at once would measure each other.
   **HOW, AS A DATABASE INVARIANT AND ONE BRIEF LOCK** (the second review's I9 — the first draft's *"an advisory lock on its own pool"* would
   have held a pooled connection for the whole ten-minute run, from a third pool nothing named): **a partial unique index on
   `load_rehearsals` for `state = 'running'` across the WHOLE table** — so an insert that conflicts is `LOAD_REHEARSAL_BUSY` or
   `LOAD_REHEARSAL_RUNNING` by the conflicting row's project, a process that dies leaves no lock behind, and the boot's pass 2⅞ ends every
   `running` row before the control plane listens. **The insert runs inside the project's `tryWithRehearsalLock`** — held only for the
   check and the insert; `undefined` there is D21's under way, `REHEARSAL_RUNNING` — **and D21's `rehearse` reads the `running` row under the
   same lock**, answering `LOAD_REHEARSAL_RUNNING`. So the two exclude each other both ways with no new pool; the lock order is the
   rehearsal lock (`outerLockPool`), then an environment's (`lockPool`), never the reverse (*Read this first* 18). **An archive mid-run**
   takes staging away: the run's watch sees the set gone and stops the generator rather than loading the switched-off page for minutes; the
   take-down finds the project archived, redeploys nothing (the archive has retired every instance and switched the name off), and the
   record ends `abandoned`. *Rejected:* letting a staging deploy abort the run and skip the revert — an agent's routine deploy would
   silently throw away ten minutes of a person's measurement.
7. **THE PROFILE IN RATES, AND THE RUN BOUNDED.** Rich's *"500 virtual users"* (*"As proposed"*) becomes vegeta's rates by one stated rule,
   **which is this plan's and goes to Rich in Spec action A's words** (the review's I5 — it alone decides pass or fail): **an arriving user
   asks for the three paths once, and a user who has arrived asks for one every 10 s; no page assets are loaded.** So `synchronised` is
   **75 a second for 60 s** (500 × 3 arriving, plus those already there), **then 50 a second for 5 minutes**; `steady` is **a ramp of 10,
   20, 30, 40 and 50 a second, a minute each**. `public` is the same on a laptop — the stated cap — and every number is a platform setting
   (Decision 12). A hard stop at 8 minutes, the generator's container removed whatever happens. **Answered at once, `202`, with the
   `running` record** (the review's C1); the run takes up to ~10 minutes and a client polls `getLoadRehearsal`.
8. **THE PASS MARK** (Spec action A; Rich, *"As proposed"*: *"≥99% answered (non-5xx, no timeout)"*): **≥ 99% of requests answered** —
   **a request is ANSWERED when its status is below `500` and is not `429`, within its timeout** (a `429` is the edge's limiter answering,
   not the app: Rich's *"A run the generator could not drive fails, never passes"*; the second review's I2 — the first draft's per-path
   rule, *"a `3xx` answered only on a path that expects one"*, is gone: an app's own `/` may redirect a stranger to sign-in, and that is
   not load); **p95 under 2 s**; **the generator reached at least nine-tenths of the rate asked**; **every instance `healthy` throughout**
   (each polled every 5 s through the driver's `status`) **with no exit and no out-of-memory exit** — read from
   `InstanceStatus.outOfMemory`, which Task 3 adds (Docker's `State.OOMKilled`; *Read this first* 15) — an app container is never restarted
   in place (`RestartPolicy: 'no'`), so what a person would call a restart is an exit, and A1's watcher, which is production's, does not
   replace it here. The rules are checked in that order, and a failure names the first it broke, with the number (*"p95 was 4.8 s; the mark
   is 2 s"*).
9. **THE RECORD, `load_rehearsals`** — **INSERTED `running` BEFORE THE GRANT** (the review's I6), so a boot can find a run a stopped process
   left: `id`, `project_id`, `environment_id` (staging's), `release_id`, `image_digest`, `scale` and `burst` as rehearsed, **`state`**
   (`running` → `passed` | `failed` | `teardown_failed` | `abandoned`), `profile` (the rates, the durations, the paths), `granted` (the
   count, the instance ids and the resources, AS READ BACK — Decision 2), `generator_address`, `evidence` jsonb (`requests`, `answered`,
   `status_counts` by path, `p50`, `p95`, `p99`, `timeouts`, `achieved_rps`, `instance_exits`, `out_of_memory`, `duration_ms`, `reason`),
   `run_by`, `created_at`, `finished_at`, `taken_down_at`; **the partial unique index on `state = 'running'`, across the table** (Decision
   6). **`passed` is written only after the take-down has given staging back** — a run that passed and could not be taken down ends
   `teardown_failed`, with its judgement in `evidence`, and **never meets the item** (the review's minor). **A `teardown_failed` row is no
   longer `running`**: staging deploys are no longer refused, the boot does not retry it, and the next staging deploy gives staging back
   its own shape — the record's reason and one operator line say exactly that. **Never a response body.**
10. **THE ITEM** (`load-rehearsal`): before launch, **met by the newest `passed` record for the candidate's digest that COVERS the project's
    audience** — its scale at least the project's (`public` covers `large_course`) **and its burst at least the project's (`synchronised`
    covers `steady`, whose rates it exceeds)** (the review's minor: scale was compared, burst was not); `unmet` with the newest failed
    record's reason, or *"not rehearsed yet"*, or *"running"* while one is. After launch (Rich, *"First launch + audience raised"*;
    readiness's second clause changes accordingly): **met while some `passed` record covers the project's current audience** — so a later
    release needs none, and raising the scale or the burst needs one. **Nothing raises an audience through the API yet** (A1's *What this
    plan does not build*; §24's *Changing the answer*), so that row is held at the function, by writing the audience. `builtBy` is gone
    from it; a `not_built` load-rehearsal item is a regression.
11. **ONE EVENT, `load_rehearsal.completed`** `{ loadRehearsalId, releaseId, state, p95Ms, answeredRatio, reason }`, its sentence naming
    who ran it and the result — published once the record leaves `running`, by the run or by the boot.
12. **THE PROFILE'S NUMBERS ARE PLATFORM SETTINGS** with Spec action A's values as defaults (`MANIFEST_LOAD_PEAK_RPS_LARGE`, …), as every
    platform setting is today (deployment configuration), so UBC's cluster can set what a laptop cannot. **`make demo-load` runs with them**
    unless `[M3b]` finds the laptop cannot, in which case the sitting stops and asks (sitting 2's row).
13. **THE BOOT TAKES DOWN A RUN LEFT RUNNING** — `recover.ts`'s **pass 2⅞** (A1's Decision 7: after D21's 2¾, before the retirer's 3):
    for each `running` row — the generator's container removed (by its label, `manifest.load-rehearsal=<id>`); the exemption cleared
    (`setRateLimitExemption(hostname, null)`); staging redeployed to its own shape with the row's release, and read back (Decision 2) —
    not for an archived project, whose pass 2½ has already retired staging and switched its name off; the row `abandoned` and the event
    published — or, when a step fails, `teardown_failed` and one operator line naming the step. Never throws for one row. Its deploy
    carries the row's id (`DeployInput.loadRehearsalId`), so the staging refusal lets it through.

---

## Global Constraints

- **The four gates, clean before every commit**, from the repository root; `pnpm test` twice on a sitting's final tree; never `--filter`.
- **`pnpm test:docker`** is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`,
  `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `source/`, `mail/`, `infra/`, or a
  `*.docker.test.ts` — in the background, never beside a Vitest run; `docker network ls -q | wc -l` first; from a shell with
  `MANIFEST_SOURCE_DRIVER` and every `MANIFEST_GITHUB_*` unset; **with 7100 STOPPED** — it runs A1's set watcher, which would read the
  tier's docker-driver production sets as exits and redeploy them (ORIENTATION §4's trap 7; TRAPS.md *SET WATCHER*); then restart the
  control plane from `.env`, the three cleanup scripts, `make verify`.
- **A number this plan moves is changed in its ONE place**: `pnpm test`'s count, doctor's and verify's in `scripts/ci-acceptance.sh`'s
  `EXPECT_` lines (a doctor check for the generator's image moves `EXPECT_DOCTOR` in the same commit), the Docker tier's in ORIENTATION
  §2's row.
- **A spec action is applied by Rich from a staged script** at its sitting's open (*What Rich does* 3): one guarded script — the edit,
  the shared pages' sweep, the commit — never a retry of a refused edit another way.
- **A launch demo after 2026-10-16 needs `make refresh-vulndb` first** (the network on), and the next build watched (FE-57: a refresh can
  refuse every build). This plan's own demo launches nothing.
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

**The eight failure modes most likely to bite a person, that no happy path exercises.**

0. **A pass at the wrong shape** (the second review's I1). The grant's deploy is ANSWERED `failed` — a member never healthy — and staging
   still serves its own one instance. Expected: **the row `failed`, *"production's shape could not start on staging"*, with the Incident's
   line; no exemption set, no load sent, no item met**; `granted` is what was read back serving. And the mirror: a take-down answered
   `failed` leaves the granted set serving → `teardown_failed`, never `passed`. Owned by Task 4's *the grant read back*.
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
   number** — the exit count, *"out of memory"* (from `InstanceStatus.outOfMemory`), the answered ratio — and staging restored to one
   instance. Owned by Task 4, with the fixture of Task 8 — **which must be able to fall over at the profile's rates** (the second review's
   I4: by Little's law a member's in-flight count is its rate times its service time).
6. **A person who may not, or should not.** A collaborator (may — FE-42's rule); an administrator (may, as no member only with §26's reason
   — `400 ADMIN_REASON_REQUIRED` without it); a token (refused `403 TOKEN_CREDENTIAL_REFUSED`); an owner not stepped up (`403
   STEP_UP_REQUIRED`); a `class` app (`409 LOAD_REHEARSAL_NOT_NEEDED`); no release serving staging (`409 REHEARSAL_NO_CANDIDATE`); an
   archived project (`409 PROJECT_ARCHIVED`). Owned by Task 5's matrix.
7. **Staging changed under a run.** A token's staging deploy, or a person's, while the run holds staging. Expected: **`409
   LOAD_REHEARSAL_RUNNING`, nothing deployed; the granted set serves until the take-down; the take-down gives back the candidate in
   staging's shape**. Owned by Task 5.

---

## File Structure

```
infra/vegeta/Dockerfile, infra/vegeta/vegeta.lock     NEW (T2) the generator's image, built here; its version and each architecture's sha256
infra/seed/seed.sh (or the step [M1] names)            MOD (T2) download (cached in infra/seed-cache/), verify, build into the daemon as manifest/vegeta:<version>
scripts/doctor.sh, scripts/ci-acceptance.sh            MOD (T2) the image present, if its image checks enumerate the list ([M1]); EXPECT_DOCTOR with it
packages/control-plane/src/launch/
  load.ts                     NEW (T2) createLoadGenerator({ engine, … }) — vegeta's container, its address, its one-line result;
                                       (T4) runLoadRehearsal, judge, phasesFor, takeDownLeftLoadRehearsals
  readiness.ts                MOD (T6) loadRehearsalItem — met by a passed measurement that covers the audience
  index.ts                    MOD exports
packages/control-plane/src/routing/caddy.ts            MOD (T3) a route's rate limit may skip one address
packages/control-plane/src/runtime/driver.ts, fake-driver.ts, driver-contract.ts, docker/driver.ts   MOD (T3) setRateLimitExemption;
                                                       InstanceStatus.outOfMemory (and the fake's crash option)
packages/control-plane/src/runtime/docker/instances.ts MOD (T3) State.OOMKilled read into the status
packages/control-plane/src/releases/shape.ts, shape.test.ts   MOD (T4) shapeFor's 'load-rehearsal' row, before the staging line; the staging test renamed
packages/control-plane/src/releases/release.ts         MOD (T4) purpose 'load-rehearsal' (staging only), loadRehearsalId; (T5) staging refused while a run holds it
packages/control-plane/src/releases/recover.ts         MOD (T4) pass 2⅞
packages/control-plane/src/db/schema.ts + drizzle/     MOD (T4) load_rehearsals, its partial unique index on state = 'running'; (T5) the events CHECK
packages/control-plane/src/observability/              MOD (T5) load_rehearsal.completed
packages/control-plane/src/config.ts                   MOD (T4) the profile's settings
packages/control-plane/src/index.ts                    MOD (T2, T4) the generator bound at boot; the boot's take-down
packages/control-plane/src/api/routes/launch.ts, representations/launch.ts, error-codes.ts, authz-contract.ts, contract/document.ts   MOD (T5)
packages/control-plane/src/api/routes/releases.ts      MOD (T5) the deploy operation declares LOAD_REHEARSAL_RUNNING
packages/control-plane/src/launch/rehearsal.ts         MOD (T5) D21's rehearsal refused while a load rehearsal runs (the running row, under its lock)
packages/control-plane/src/launch/candidate.ts         READ (T4) the candidate while staging serves N — tested, changed only if it reads otherwise
packages/console/src/screens/launch.tsx, launch-records-state.ts, packages/mock/src/, docs/api/launching.md, events.md, frontend.md   MOD (T7)
packages/journey/src/load.ts, scripts/demo-load.sh, Makefile, fixtures/load-app/   NEW (T8a; journey/src/serving-set.ts reused); ci-acceptance.sh, offline-acceptance.sh MOD (T8b)
docs/superpowers/spikes/load-baseline/                 NEW (T1)
```

---

## Task 1: Measure what this plan rests on

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/load-baseline/README.md` and
`results-task1-<date>.txt`.

- [ ] **Step 1: `[M1]` Re-read every *Read this first* fact at HEAD**, with line numbers — above all `launch/rehearsal.ts`,
  `releases/release.ts`'s `DeployInput`, `purpose` and **what a failed set answers** (fact 14), **A1's `releases/shape.ts`**,
  `sso/sign-in.ts`'s container, `routing/caddy.ts`'s route, `runtime/driver.ts`'s interface and `InstanceStatus` as A1 left it,
  `db/locks.ts`'s and `db/client.ts`'s pools, `recover.ts`'s passes, the set watcher's read, and **how `make seed` builds an image of the
  platform's own** (the edge's, `infra/caddy/Dockerfile`) — Task 2 builds vegeta's into the daemon the same way — **and that `make reset`
  and the three cleanup scripts leave a `manifest/…` image in the daemon alone** (fact 21). **And what A1's sittings 6–8 changed** (the
  second review's §3): the candidate's read, D21's set checks, the watcher's launched-only read, the skeleton's error handler and
  `NODE_ENV=production`, `make demo-capacity`'s journey helpers.
- [ ] **Step 2: `[M2]` A container reaches staging through the edge.** On a demo project with a release serving staging (the machine's
  `launchpath-local` if present), run `node:24-alpine` from the local registry on the platform network, as `sso/sign-in.ts` runs its probe,
  with the platform CA mounted, and `fetch` staging's hostname: record the status, the listener (`srv0`), and **the source address Caddy
  logs** for it — Task 3's exemption keys on it. And `/`, `/healthz` and `/login` of a skeleton app built AFTER A1's sitting 6: each one's
  status unloaded, and the `saml_requests` documents one `/login` adds (fact 16).
- [ ] **Step 3: `[M3]` What the generator will meet, offline.** vegeta is not on this machine until Task 2's download (a Rich-step), so
  what it sustains is measured there (`[M3b]`). Here, record: `alpine:3.22`'s digest in `infra/images.lock` and that the daemon holds it;
  whether that alpine's busybox has `awk`, `sh`, `cat` and `base64` (Decision 3's last line needs them); and **the laptop's headroom** —
  `docker stats` and `uptime` with the demo apps running — so Task 2's measurement can be read against it.
- [ ] **Step 4: `[M4]` A rate limit that skips one address**, in a THROWAWAY Caddy from `manifest-caddy`'s own image on its own network:
  the route's own `rate_limit` handler (`routing/caddy.ts:153-164`) with its zone's `match` excluding one address (`not` a `remote_ip`
  range), and — if Caddy refuses that — the handler under a `not remote_ip <addr>` matcher; from two containers, record that one is
  limited at 600 a minute and the other is not. Record the exact JSON Task 3 will write, **what Caddy does with the exemption set to
  `0.0.0.0/0`** (Task 3's negative control), and **whether caddy-ratelimit's counters survive a PATCH of the route** (it decides how Task
  3's Docker case counts). Remove the throwaway.
- [ ] **Step 5: `[M5]` A set in production's shape, given back** — on a hostname NO project holds (a throwaway name on the internal
  listener), so 7100's Route rows never name what it moved: from a scratch script, the driver's `ensureInstances` (A1) with three specs of
  a demo app's image at production's resources, then one at staging's; each move's time, and the laptop's memory with three instances of
  a large app beside everything else. Every container removed after, by name.
- [ ] **Step 6: `[M7]` An out-of-memory exit as Docker reports it** (fact 15): a throwaway container with a 64 MiB ceiling that allocates
  past it — record `State.OOMKilled`, `State.ExitCode` and `State.Status` on this Docker Desktop (cgroup v2); Task 3's
  `InstanceStatus.outOfMemory` reads exactly what this records. Removed after.
- [ ] **Step 7: `[M6]` The gate numbers**, the contract's version (expected `1.9.0` with A1's additions, so this plan's is `1.10.0`), and
  `pnpm test` once — under the run's HOLD, if a coordinator's run is live.
- [ ] **Step 8: Commit** the spike directory by name.
  ```bash
  git commit -m "docs(load): Task 1 — the measurements (a container through the edge, the laptop's headroom, a limit that skips one address, an OOM exit)"
  ```

---

## Task 2: The generator — vegeta, built here, through the edge

**Sitting 2, Spec action D applied first** (§20's *"the one image that is built"*). Decision 3. **Its caller is Task 4's run.** **Its Step 1
is a Rich-step**: the network, at his yes AT THIS SITTING (Rich, 2026-10-03: *"Build it locally"* — *"its download a Rich-step at that
sitting"*).

> **SITTING 1 MEASURED** ([`../spikes/load-baseline/`](../spikes/load-baseline/README.md)): `alpine:3.22` is in the daemon by
> `infra/images.lock:5`'s digest (`sha256:14358309…`; Alpine 3.22.5, `aarch64`), and its busybox v1.37.0 has `sh`, `awk`, `cat`, `base64`
> and `touch` (run, not just found). **The address Task 3 exempts is the generator container's own address on `manifest-platform`** — the
> edge's `remote_host` read `10.89.0.13` for a container at `10.89.0.13` — so `start()` reads `NetworkSettings.Networks["manifest-platform"]
> .IPAddress` (F7). **A daemon image `manifest/vegeta:<version>` survives `make reset` and all three cleanup scripts**; a generator
> CONTAINER named `mf-…` would be removed by `make reset` (`Makefile:107`) and counted as the app's by `dead-app-resources.sh` (`:78`);
> `scripts/doctor.sh` checks images only by its lists and does not check `manifest-caddy:local`, so a doctor check for the generator is NEW
> and moves `EXPECT_DOCTOR` (F11). **Spec action D's words changed** (Rich, `624deb66`; F1). `infra/caddy/Dockerfile:1` repeats §20's old
> sentence — sweep it with D.

**Files:**
- Create: `infra/vegeta/Dockerfile` (`FROM` the daemon's mirrored `alpine:3.22` by digest; `COPY` the verified binary; `RUN vegeta
  --version`; a non-root user), `infra/vegeta/vegeta.lock` (`version`, and per architecture `url` and `sha256`)
- Modify: the `make seed` step `[M1]` named (download into `infra/seed-cache/vegeta/` if absent, verify against the lock AND vegeta's
  published checksums file, build into the daemon as `manifest/vegeta:<version>` — never under `127.0.0.1:7107/local/`, never only in the
  registry; **offline with the archive cached, it rebuilds; offline without it, it says so and exits non-zero** — never a silent `WARN`);
  `scripts/doctor.sh` and `scripts/verify.sh` if their image checks enumerate, with `EXPECT_DOCTOR` / `EXPECT_VERIFY` moved in
  `scripts/ci-acceptance.sh` in the same commit
- Create: `packages/control-plane/src/launch/load.ts` (`createLoadGenerator`, `readLoadResult`), `launch/load.test.ts` (the result's
  reading, from vegeta's own JSON captured at Step 2), `launch/load.docker.test.ts` (the container through the real edge)
- Modify: `src/index.ts` (the generator bound at boot: the engine, the image's daemon reference, the platform network and resolver, the CA
  path)

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
    /** The paths loaded, round robin — `['/', '/healthz', '/login']` for a CWL app (Decision 4). No expected class: a status below 500
     *  other than 429, in time, is answered on every path (Decision 8; the second review's I2). */
    paths: string[]
    /** Each request's own timeout. */
    timeoutMs: number
  }

  export interface PhaseReport {
    name: LoadPhase['name']
    asked: number
    /** vegeta's own `rate` — what it actually sent, a second. */
    achieved: number
    requests: number
    /** Answered: a status below 500 other than 429, within the timeout — never a 5xx, a 429, a timeout or a connection error. */
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
    /** The whole run: every request, those answered, those that timed out, and the rate vegeta achieved. */
    requests: number
    answered: number
    timeouts: number
    achievedRps: number
    answeredRatio: number
    /** Per path, per status — EVIDENCE of where a failure was, folded inside the container; nothing per-request leaves it. */
    byPath: Record<string, Record<string, number>>
    durationMs: number
  }

  export interface LoadGenerator {
    /**
     * The container started and WAITING: its own address on the platform network (Task 3 exempts it), `go()` to begin the load once
     * the exemption is set, and `done` — which also settles, rejected, if `go()` is never called before the hard stop.
     */
    start(
      target: LoadTarget,
      phases: LoadPhase[],
      labels: { loadRehearsalId: string },
    ): Promise<{ address: string; go(): Promise<void>; done: Promise<LoadReport> }>
  }

  /** The container's last stdout line → a LoadReport; anything else is an error naming what was missing. */
  export function readLoadResult(line: string, target: LoadTarget, phases: LoadPhase[]): LoadReport
  ```

- [ ] **Step 1: The download — a Rich-step, asked at this sitting's open.** With his yes and the network on: vegeta's current release —
  the version, the day and why recorded (the current release: ORIENTATION's pinning rule) — its `linux` archive for this machine's
  architecture (and the other's, so the lock holds both) and its published checksums file; each archive's sha256 checked against that
  file, then written into `vegeta.lock`; the image built into the daemon by the seed step; then `make doctor` (its image checks, if they
  enumerate) and `make verify`. **Nothing else uses the network.**
- [ ] **Step 2: `[M3b]` What vegeta sustains here** — the measurement Task 1 could not make before the image was on this machine. vegeta
  in a container on the platform network (the hardening of Step 4 below), against a staging app **through a THROWAWAY Caddy route with no
  rate limit** (Task 1's `[M4]` throwaway, never the live edge), at 10, 50, 100, 200 and 400 requests a second for 30 s each: record each
  `vegeta report -type=json` WHOLE (Step 3's tests read these files), the achieved `rate`, p95, errors, and `uptime` before and after.
  **Compare with Spec action A's profile; if the laptop cannot reach it, STOP and ask Rich** (the numbers are his).
- [ ] **Step 3: The failing tests.**
  - **`load.test.ts`, *the report is honest* (Review Focus 2)** — `readLoadResult`, over Step 2's captured JSON and hand-made variants:
    `achieved` is vegeta's `rate`, never the asked one; **a `429` and a `5xx` are not answered, and a `302` and a `404` are** (Rich's
    *"non-5xx"*); timeouts and connection errors (vegeta's status `0`) counted, not answered; **the whole run's p95 is the all-phases
    report's, not a mean of the phases'** (a variant whose phases' mean differs from it); `byPath` carried whole; a line missing `byPath` or
    a phase is an error naming it.
  - **`load.docker.test.ts`** — the container on the platform network reaches a staging app through the edge; `start` answers its address
    before the load; the result line is read whole for a two-phase run of 20 s; **the container is gone after `done` resolves AND after it
    rejects**.
  - **The seed step** (a shell test of its own, or `[M1]`'s home for seed's checks): an archive whose sha256 differs from the lock is
    refused, naming both.
- [ ] **Step 4: Run, and predict. Then implement.** `createLoadGenerator` creates one container from the daemon's image (`HostConfig`:
  `CapDrop: ['ALL']`, `ReadonlyRootfs`, a tmpfs for its results with its size stated, `pids` 256, a 512 MiB ceiling; the platform CA
  read-only; `NetworkMode` the platform network and its resolver, as the probe's; the label `manifest.load-rehearsal=<id>`, which the
  boot's pass 2⅞ removes by), whose shell waits for a go-file, then runs each phase in turn — `vegeta attack -rate=<rps>/s
  -duration=<s>s -timeout=<ms>ms -root-certs=<ca> -redirects=-1 -max-body=0 -targets=<file> > <phase>.bin` — then prints Decision 3's one
  line last. The targets file round-robins the paths with the staging hostname. It reads the container's address from
  `/containers/{id}/json` once it has started, and writes the go-file with an Engine **exec** of `touch` once Task 3's exemption is set (the
  archive API cannot write onto a tmpfs mount — the second review's M7; Step 2 confirms it), and in a `finally` deletes it with
  `?force=true&v=true`.
- [ ] **Step 5: Commit**, then the **negative control**: count a `429` as answered. Predict red: the report's `answered` assertion only.
  ```bash
  git commit -m "feat(launch): the load generator — vegeta, built here from a checksummed release, through the edge, reporting the rate it achieved"
  ```

---

## Task 3: The edge — a staging route's rate limit skips the generator, for one run, through a `Driver` verb

**Sitting 2, after Task 2. Spec action C applied first.** Decision 5. **Its callers are Task 4's run and the boot's pass 2⅞** — and, for
`InstanceStatus.outOfMemory`, Task 4's watch (Decision 8).

> **SITTING 1 MEASURED** ([`../spikes/load-baseline/`](../spikes/load-baseline/README.md), `[M4]` in a throwaway Caddy from the edge's
> image, `[M7]` in throwaways): **`[M4]`'s shape is the zone's own `match` given a `not`** — `{"remote_ip":{"ranges":["0.0.0.0/0","::/0"]},
> "not":[{"remote_ip":{"ranges":["<address>/32"]}}]}` — no new handler, no subroute: the exempt client sent 1,300 in a minute with no
> `429`, another was cut at 600; Caddy reads it back `not` first, so compare parsed JSON. **`0.0.0.0/0` is accepted and limits nobody**
> (control (a) stands). **caddy-ratelimit's counters SURVIVE every PATCH** — identical, or changing the zone's `match` — so the Docker
> case's limited client starts fresh (a new address), and the exempt address starts at zero once cleared (F5). **A malformed address is the
> admin API's `500`, the old config kept** — validate before writing, and refuse with the driver's own code (F6). **`[M7]`: an
> out-of-memory exit is `{ Status: 'exited', ExitCode: 137, OOMKilled: true }`, a kill `{ exited, 137, false }`** (control (b) stands) —
> **and `OOMKilled` is STICKY: `true` on a container still `running`** after a process the app started was killed under the init, and
> after an exit `0`. The mapping's table gains a `running` row, with what `outOfMemory` means there (F2; the record recommends `true`
> whatever the state).

**Files:**
- Modify: `packages/control-plane/src/routing/caddy.ts` — the route input gains `rateLimitExempt?: string` (one address); the `rate_limit`
  handler's zone (or the handler) takes `[M4]`'s matcher when it is set
- Modify: `runtime/driver.ts` (`setRateLimitExemption(hostname: string, address: string | null): Promise<void>` and its doc comment;
  **`InstanceStatus.outOfMemory?: boolean`** — absent from a driver that cannot tell, as `exitCode` is); `runtime/fake-driver.ts` (records
  the exemption, readable by tests; `crash(id, exitCode, { outOfMemory })`); `runtime/driver-contract.ts` (its cases);
  `runtime/docker/driver.ts` (re-applies EXACTLY the set the hostname reaches now — A1's set, its health policy off the containers'
  label — with or without the exemption; a hostname with no route is `INSTANCE_NOT_FOUND`; **a switched-off name is left switched off**);
  `runtime/docker/instances.ts` (`State.OOMKilled` read into the status, as `[M7]` recorded it)
- Test: `routing/caddy.test.ts` (the JSON), the driver contract, `runtime/docker/instances.test.ts` (the OOM mapping),
  `routing/routes.docker.test.ts` (or a new file `[M1]` names: the real edge)

- [ ] **Step 1: The failing tests.** The JSON: with `rateLimitExempt`, exactly `[M4]`'s shape; without it, byte-identical to today's (a pin).
  The driver contract (both drivers): set → the hostname's exemption reads that address; `null` → none; the route's set and health policy
  unchanged by either; an unknown hostname refused with its code; **a switched-off hostname still answers the switched-off page after
  either**. The Docker case: two containers, the exempt one sends 1,200 requests in a minute with no `429`; the other gets `429` after 600
  (counted after the last route PATCH if `[M4]` found a PATCH resets the counters); **after `setRateLimitExemption(hostname, null)`, the
  first is limited again** — the take-down's half. **The OOM mapping**: Docker's `{ Status: 'exited', ExitCode: 137, OOMKilled: true }` →
  `failed`, `outOfMemory: true`; `OOMKilled: false` with 137 → `outOfMemory: false` (a kill is not out of memory); the fake's crash with
  and without the flag.
- [ ] **Step 2: Run, and predict.** **Step 3: Implement.**
- [ ] **Step 4: Commit**, then the **negative controls**: **(a)** exempt every address — `0.0.0.0/0` for the generator's, a config Caddy
  accepts (`[M4]` recorded it; *"drop the matcher's argument"* may be refused outright, and a refusal is red for the wrong reason). Predict
  red: the second container's `429` assertion only. **(b)** read `outOfMemory` from the exit code (137) instead of `OOMKilled`. Predict
  red: the *"a kill is not out of memory"* row only.
  ```bash
  git commit -m "feat(runtime,routing): a route's rate limit may skip one address, through the driver — the load rehearsal's generator, for one run"
  ```

---

## Task 4: The run — grant, load, watch, judge, record, take down; and the boot's half

**Sitting 3, alone. Spec action A applied first.** Decisions 2, 3, 6–9, 12, 13. **Its caller is Task 5's route; until then a scratch
script calls it (Step 4).** Nothing on the wire changes here.

> **SITTING 1 MEASURED** ([`../spikes/load-baseline/`](../spikes/load-baseline/README.md)): **staging and production resolve to the SAME
> resources unless the manifest's `environments` block says otherwise** (`spec/resolve.ts:113-117`; node-ts-mongo's defaults, 0.5 CPU /
> 512 Mi / 256 pids / 2 Gi, for both) — so `load.docker.test.ts`'s *"staging's instance afterwards at staging's own resources
> (`HostConfig.Memory`)"* cannot fail unless its app sets `environments.production.resources` to what staging does not have (F4). `judge`
> meets a member `running` with `outOfMemory: true` (F2), and a member that swaps before it is killed — an app's `MemorySwap` is unset, so
> twice its memory (F3). Pass 2⅞ goes between `releases/recover.ts:242` and `:244`; `shape.ts:10-11`'s comment on `'replacement'` is stale
> (F12). `[M5]`'s grant and take-down times are in the record.

> **SITTING 2 BUILT AND MEASURED** (`3205b956` Task 2, `fff41f8c` Task 3, `d33d950f` the two composed; the record's *Sitting 2*):
> **`createLoadGenerator` is NOT bound at boot yet** — Task 4 binds it in `src/index.ts` beside its caller (the engine, `config.caCertPath`,
> `config.dnsServer`; `hardStopMs` from Decision 7's eight minutes) and exports it from `launch/index.ts` (sitting 2's ruling: a deps slot
> nobody read). `start()` answers the address BEFORE any load; `go()` after the exemption; `done` reads one line and removes the container
> whatever happens (labelled `manifest.load-rehearsal=<id>`, named by nobody — pass 2⅞ finds it by the label). **CLEAR THE EXEMPTION
> BEFORE THE GENERATOR'S CONTAINER IS GONE — or at once after, never later**: Docker handed the removed generator's address (`10.89.0.11`)
> to the NEXT container on `manifest-platform` at once (measured, `d33d950f`), so an exemption left behind exempts whoever is started
> next. `Driver.setRateLimitExemption` refuses `ADDRESS_INVALID` (anything but one address) and `INSTANCE_NOT_FOUND` (no route), leaves a
> switched-off name the page, and is forgotten by any route written afresh — so the take-down's redeploy clears it anyway, and pass 2⅞'s
> clear on a name with no route must expect `INSTANCE_NOT_FOUND`. **`InstanceStatus.outOfMemory` is Docker's `OOMKilled` WHATEVER the
> state** (sitting 2's ruling on F2): `true` of a member still running whose process was killed at its ceiling, and sticky — the grant
> starts fresh members, so for `judge` it means *during this run*; the fake's `crash(id, 137, { outOfMemory: true })` says it. A `429` is
> counted not answered (the composed case: unexempted, 600 answered of 750). `LoadReport` carries no error strings (vegeta's own list is
> per-connection and dropped inside the container) — `timeouts` and each path's status `0` say what failed.

**Files:**
- Modify: `releases/shape.ts` — `DeployPurpose` (A1 declares it there) gains `'load-rehearsal'`, and `shapeFor` its row for staging, written
  BEFORE the *"not production → one"* line (*Read this first* 13); `shape.test.ts` — its staging case renamed to the purposes it covers,
  and the new row's case; `releases/release.ts` — `'load-rehearsal'` refused for any environment but staging (a plain `Error`, as
  `replacing`'s pairing is), and **`DeployInput.loadRehearsalId?: string`**, which the run's two deploys — the grant and the take-down —
  carry, refused on anything but staging, and which Task 5's staging check reads to let exactly those two through
- Modify: `db/schema.ts` — `load_rehearsals` (Decision 9), with **a partial unique index on `state = 'running'` across the whole table**
  (Decision 6); then `db:generate`, read it, apply it. **No new lock pool**: the insert runs inside `tryWithRehearsalLock(projectId)`
- Modify: `launch/load.ts` — `runLoadRehearsal(deps, { projectId, actor }): Promise<{ row: LoadRehearsalRow; done: Promise<LoadRehearsalRow>
  }>` (inserts the `running` row and answers it with the run's own promise; the route answers `row`, a test awaits `done`; the run's
  failures are logged and recorded, never unhandled), `judge(report, watched, phases)`, `phasesFor(audience, settings)`,
  `takeDownLeftLoadRehearsals(deps)`; `config.ts` — the profile's settings (Decision 12); `releases/recover.ts` — pass 2⅞, a REQUIRED dep
  as `takeDownLeftRehearsals` is; `src/index.ts` — its binding
- Test: `launch/load.test.ts` (the fake driver behind a call-recording wrapper — the fake keeps no call list, *Read this first* 22 — and a
  fake generator), `launch/load.docker.test.ts` (one real run), `recover.test.ts`, `shape.test.ts`

**Interfaces:**
- Consumes: `LoadGenerator`, `LoadPhase`, `LoadReport` (Task 2); `Driver.setRateLimitExemption` (Task 3); `shapeFor` (A1).
- Produces: `runLoadRehearsal(deps: LoadRehearsalDeps, input: { projectId: string; actor: { id: string } }): Promise<{ row:
  LoadRehearsalRow; done: Promise<LoadRehearsalRow> }>` (the row as inserted, `running`, and the run's end); `latestLoadRehearsalFor(db,
  projectId)`; `loadRehearsalById(db, projectId, id)`; `judge(report: LoadReport, watched: { exits: number; outOfMemory: boolean;
  unhealthy: boolean }, phases: LoadPhase[]): { passed: boolean; reason: string }`
  (pure); `phasesFor(audience, settings): LoadPhase[]` (Decision 7); `takeDownLeftLoadRehearsals(deps): Promise<{ abandoned: string[];
  failed: string[] }>`.

- [ ] **Step 1: The failing tests, as one matrix.**
  - **The run** (fake driver, fake generator): the `running` row inserted FIRST; the candidate redeployed to staging in `shapeFor`'s
    `'load-rehearsal'` shape (the audience's count, production's resources); **`servingInstances(hostname)` read back — exactly the
    granted ids**; `setRateLimitExemption(hostname, <the generator's address>)`, under staging's environment lock; the generator's `go()`;
    the load; `setRateLimitExemption(hostname, null)`; staging redeployed to its own shape and read back; the row `passed` with
    `taken_down_at`, `granted` naming the ids read back — **in that order** (a recorded call list). `runLoadRehearsal` resolves with the
    `running` row before the load starts.
  - **The grant read back** (Review Focus 0; the second review's I1): the grant's deploy ANSWERED `failed` (the fake's `neverReady` on one
    member) → the row `failed`, *"production's shape could not start on staging"* with the Incident's line; **no `setRateLimitExemption`, no
    `go()`, no item met**; staging still its own one instance. And the take-down answered `failed` → `teardown_failed`, the granted set
    still serving, and a staging deploy afterwards NOT refused (the row is no longer `running`) and giving staging back its own shape.
  - **One at a time** (Decision 6): a second insert while a row is `running` — this project's → `LOAD_REHEARSAL_RUNNING`, another's →
    `LOAD_REHEARSAL_BUSY`, decided by the index's conflict, not a read-then-insert; D21's rehearsal holding the project's rehearsal lock →
    `REHEARSAL_RUNNING`, nothing inserted.
  - **`judge`, every rule** (Review Focus 2 and 5): a clean report passes; 98.9% answered fails naming the ratio; p95 2.1 s fails naming it;
    an exit, an out-of-memory exit (from `InstanceStatus.outOfMemory`), an unhealthy poll each fail naming it; an achieved rate under 90%
    fails naming it; a `302` and a `404` are answered, a `429` is not; the FIRST broken rule, in Decision 8's order, is the reason.
  - **The take-down, every way** (Review Focus 1): the generator throws → `failed`, staging given back; the redeploy back throws → the row
    **`teardown_failed`, even when the judgement passed**; **a boot with a `running` row left** — a granted staging set and an exempting
    route, made by a run the test stops mid-way, not written by hand — → pass 2⅞: the generator's container removed, the exemption cleared,
    staging redeployed to its own shape, the row `abandoned`, one operator line; and **pass 2⅞ runs after 2¾ and before 3** (the report's
    order).
  - **The shape is narrow**: `'load-rehearsal'` to production is refused; `DeployInput` has no `instances` or `resources` (A1's type test
    still red-able).
  - **The candidate while staging serves N** (the review's cross-plan 5): during the run — staging granted, N members serving the
    candidate — `candidateFor` (`launch/candidate.ts`, through `servingInstanceOf`, the set's first healthy member since A1's sitting 6)
    answers the candidate's release, the same as before the grant and after the take-down — and with the set's FIRST member crashed (the
    fake's `crash`) too.
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
  - **(d)** make the partial unique index per project (the first draft's). Predict red: the *"another's → `LOAD_REHEARSAL_BUSY`"* row
    only.
  - **(e)** skip the grant's read-back. Predict red: the *grant read back* rows only — the failed grant reads `passed`.
  ```bash
  git commit -m "feat(launch): the load rehearsal's run — staging given production's capacity, the audience's arrival through the edge, judged, recorded, given back, and taken down at boot"
  ```

---

## Task 5: The operation — `runLoadRehearsal` answers at once, and staging is the run's while it lasts

**Sitting 4, alone. Spec action B applied first.** Decisions 1, 6, 7, 11. **Contract `1.10.0`.** **Its callers are the console, the mock's
clients and `make demo-load`.**

> **SITTING 1 MEASURED — FE-63, its placement `manifest-coord5`'s at this sitting's open** (its GO of 2026-10-15 11:27): the front end's
> FE-63 asks that an instance or its Incident say it is a replacement, beside FE-62's event field, in `1.10.0`. **The stored mark already
> exists, on the instance** — `instances.replacing` (`db/schema.ts:347-349`, written for every member of a replacement set,
> `release.ts:588-589`) — so the instance's mark needs no migration, and an Incident's can be derived by the join `listIncidents` already
> makes (`observability/incidents.ts:115-127`). `incidents.cause` has no replacement value; a replacement's failed deploy is
> `cause: 'deploy'` (`release.ts:1134-1139` passes none). What it would touch, file by file, is the record's *FE-63* section (F13).
> `incident.opened`'s schema is `observability/event-schemas.ts:319-328` (strict, no `cause`); its publishers `release.ts:1145-1163` and
> `watch.ts:461`.

**Files:**
- Modify: `api/routes/launch.ts` — **`runLoadRehearsal`** (`POST /v1/projects/{projectId}/load-rehearsal`, `credential: 'session'`,
  `capability: 'launch:rehearse'`, stepped up, **`202` with the `running` `LoadRehearsal`**) and **`getLoadRehearsal`** (`GET
  /v1/projects/{projectId}/load-rehearsals/{loadRehearsalId}`, `project:read`) and `listLoadRehearsals` (`GET …/load-rehearsals`, newest
  first, bounded); `api/representations/launch.ts` — `LoadRehearsal` (`state`, the profile, the shape, the evidence once finished,
  `pollAfterSeconds`); `api/error-codes.ts` — `LOAD_REHEARSAL_BUSY`, `LOAD_REHEARSAL_RUNNING` (its hint: *"up to about ten minutes; read
  `getLoadRehearsal`"*), `LOAD_REHEARSAL_NOT_NEEDED`; `REHEARSAL_NO_CANDIDATE` and `REHEARSAL_RUNNING` reused where their hints are true;
  `api/authz-contract.ts`; `api/contract/document.ts` (`1.10.0`); the four contract commands; the mock's answers in the same step.
  **Every operation that can answer a new code declares it** (the front-end enablement plan's F19: a code answered and declared by none):
  `LOAD_REHEARSAL_RUNNING` on `api/routes/releases.ts`'s `deploy` (`:1071`) and on `runRehearsal` (`api/routes/launch.ts`), beside the
  new operations
- Modify: `releases/release.ts` — **a staging deploy of a project with a `running` row is refused `LOAD_REHEARSAL_RUNNING`, checked under
  the environment's lock**, except the run's own two deploys, which carry that row's id in `DeployInput.loadRehearsalId` (Task 4) — an id
  that is not the project's `running` row is refused like any other deploy; `launch/rehearsal.ts` — D21's `rehearse` reads the `running`
  row under its own `tryWithRehearsalLock` and refuses `LOAD_REHEARSAL_RUNNING` (Decision 6)
- Modify: `observability/event-schemas.ts`, `events.ts`, `examples.ts` — `load_rehearsal.completed`; the CHECK migration (cumulative);
  `launch/load.ts` publishes it when a row leaves `running`
- Test: the route's file, `launch/load.test.ts`, `releases/release.test.ts`, `launch/rehearsal.test.ts`

- [ ] **Step 1: The failing tests, as one matrix.**
  - **The answer is at once**: `runLoadRehearsal` → `202`, state `running`, before the fake generator's load has begun; `getLoadRehearsal`
    → `running`, then `passed` with its evidence; `listLoadRehearsals` newest first.
  - **The refusals** (Review Focus 4 and 6): busy elsewhere, `LOAD_REHEARSAL_BUSY` naming no other project; this project's run under way,
    `LOAD_REHEARSAL_RUNNING`; D21's rehearsal under way, `REHEARSAL_RUNNING`; D21's asked while a load rehearsal runs,
    `LOAD_REHEARSAL_RUNNING`; a `class` app, `LOAD_REHEARSAL_NOT_NEEDED`; no candidate, `REHEARSAL_NO_CANDIDATE`; an archived project,
    `409 PROJECT_ARCHIVED`; a token, `403 TOKEN_CREDENTIAL_REFUSED`; not stepped up, `403 STEP_UP_REQUIRED`; a collaborator, `202`; an
    administrator who is no member, `400 ADMIN_REASON_REQUIRED` without §26's reason and `202` with it (the reason in the run's events);
    **nothing granted by any refusal**.
  - **Declared where answered**: the `deploy` operation's and `runRehearsal`'s published errors include `LOAD_REHEARSAL_RUNNING` (read
    from the generated document, not the route file).
  - **Staging is the run's** (Review Focus 7): a staging deploy by a person, and by a token, while a run holds staging → `409
    LOAD_REHEARSAL_RUNNING`, nothing deployed; the run's own deploys pass; a production deploy is not affected; after the row leaves
    `running`, a staging deploy passes.
  - **The event**: one `load_rehearsal.completed` per finished row, from the run or from the boot.
- [ ] **Step 2: Run, and predict. Step 3: Implement**, the migration, the contract commands. **Tell the front-end before the commit**
  (and, in a coordinated run, the coordinator as the edits BEGIN, landing on its *"land it"*): `1.10.0`; the operation answers `202` and
  is polled; the record; the event; the codes, and that a staging deploy can now answer `409 LOAD_REHEARSAL_RUNNING`.
- [ ] **Step 4: Through the edge, on driver 1**: a run started over `https://console.manifest.internal`, polled to its end; a staging
  deploy tried mid-run and refused, quoted.
- [ ] **Step 5: Commit**, then the **negative control**: drop the staging deploy's check. Predict red: Review Focus 7's rows only.
  ```bash
  git commit -m "feat(launch): runLoadRehearsal answers at once and is polled; staging is the run's while it lasts (contract 1.10.0)"
  ```

---

## Task 6: The checklist — met by a measurement

**Sitting 5.** Decision 10.

> **SITTING 1 MEASURED:** nothing reads an audience's `burst` yet — `loadRehearsalItems` keys on `audience?.scale` alone
> (`launch/readiness.ts:229`); `burst` is stored and echoed only (`api/routes/projects.ts:299`, `:391`). This item is its first reader (F10).

**Files:**
- Modify: `launch/readiness.ts` — `loadRehearsalItems` (`:227-240` at `c7e0978`) becomes `loadRehearsalItem(db, project, candidate,
  audience)`, async, in both clauses (`:168`, `:198`); `builtBy` gone; `since` the passing record's `finished_at`
- Test: `launch/readiness.test.ts`

- [ ] **Step 1: The failing tests** (Review Focus 3): no record → `unmet`, *"not rehearsed yet"*, naming `runLoadRehearsal`; a `running`
  record → `unmet`, *"running"*; a `failed` record → `unmet` with its reason; **a `teardown_failed` record whose judgement passed → `unmet`**;
  a `passed` record for the candidate → `met`; **a new candidate → `unmet`**; **the scale raised to `public` after a `large_course` pass →
  `unmet`**; **the burst raised to `synchronised` after a `steady` pass → `unmet`**; a `public` pass covers `large_course`, and a
  `synchronised` pass covers `steady`; after launch, a pass covering the current audience for ANY release → `met` (Q3 (a)), and the audience
  raised after launch → `unmet` (held at the function, by writing the audience: nothing raises one through the API yet — Decision 10); a
  `class` app → no item (unchanged, a pin). **And the gate**: a production deploy of a large app with every
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
  commit** (and, in a coordinated run, the coordinator as the mock's edits BEGIN): its *"waiting on the Manifest team"* line for
  `load-rehearsal` can become the owner's action; the operation is polled.
- [ ] **Step 4: Walk the console** headless (agents may type the laptop's test passwords): the button, the step-up, the progress, the
  result.
- [ ] **Step 5: Commit**, then the **negative control**: show the button on a `class` app. Predict red: the console's *only for a large
  app* row; through the edge, `409 LOAD_REHEARSAL_NOT_NEEDED`.
  ```bash
  git commit -m "feat(console,mock): the owner runs the load rehearsal, watches it, and reads its result; the mock plays it"
  ```

---

## Task 8: The acceptance — `make demo-load`, and a person clicking it — 8a (sitting 6) and 8b (sitting 7)

**SPLIT BY THE SECOND REVIEW (I10)**, as A1 split its own acceptance (its Task 9 alone in sitting 7, Task 10 in sitting 8): one `make
demo-load` run holds two full rehearsals — the pass and the fall-over — ~8–9 minutes each, so three runs on each driver are ~2 hours
before a control is seen. **8a is sitting 6** (the demo and its controls); **8b is sitting 7, alone and last** (everything else).

> **SITTING 1 MEASURED** ([`../spikes/load-baseline/`](../spikes/load-baseline/README.md)): **the fixture's `manifest.yaml` sets
> `environments.production.resources`** to a memory staging does not have, or Step 1's *"at its own resources (`HostConfig.Memory`)"*
> cannot fail (F4). **The journey's `seeEveryMember` still waits `4 × N`** (`journey/src/serving-set.ts:42`) where the platform moved to
> `16 × N` (`745def2`) — no read of a set through the edge while the generator loads may use it as it stands (F8). **`journey/src/capacity.ts`
> exports nothing**: extract what the demo reuses into an exported module (F9). A fixture that falls over by MEMORY must allocate past
> TWICE its ceiling (an app's `MemorySwap` is unset, F3). Unloaded, a skeleton app's staging answers `/` `200`, `/healthz` `200`, `/login`
> `302` with no cookie, and each `/login` writes ONE `saml_requests` document (eight-hour TTL).

**Files (8a):**
- Create: `packages/journey/src/load.ts` (reusing `journey/src/serving-set.ts` for the set, A1's sitting 4), `scripts/demo-load.sh`;
  `Makefile` (`demo-load`; `DEMO_LOAD_STOP_AFTER=<step>` for a control's short run, as every recent demo has one); `fixtures/load-app/` — a
  starter-shaped CWL app whose `/` answers in ~20 ms and which, **when its COMMITTED `load-app.json` says `"fallOver": true`**, holds `/` for
  ~600 ms and answers `503` above eight requests in flight, leaving `/healthz` alone (Review Focus 5's app, made honestly by its own code).
  **Why those numbers** (the second review's I4): by Little's law a member's in-flight count is its rate times its service time — at the
  synchronised profile's 25 then ~17 requests a second a member, ~20 ms is ~0.5 in flight, never above eight, so the first draft's fixture
  could not fall over; ~600 ms is ≈10–15 in flight, roughly a fifth to a half refused. `/healthz` untouched keeps Docker's check and the
  edge's active one green, so the FIRST broken rule is the answered ratio, as the demo asserts. The numbers are checked against `[M3b]`'s
  measurement before the fixture is committed. **A committed file, not a secret**: a secret changes no image digest, so the candidate — and
  the item — would not change (the first review's minor); a commit builds a new candidate.

- [ ] **8a, Step 1: The phases**, each ending `every check passed`, on either driver: a `large_course` project from the fixture; a release
  serving staging; the checklist's item `unmet`, *"not rehearsed yet"*; a token refused, an un-stepped session refused; **the rehearsal
  started — `202`, `running` — a staging deploy mid-run refused `LOAD_REHEARSAL_RUNNING`, then polled to `passed`**, its `granted` naming
  three instances read back; staging back to ONE instance (`getEnvironment`'s `instances`) at its own resources (`docker inspect`'s
  `HostConfig.Memory`, from the shell), the route back to its limit (a 601st request from one address in a minute is `429`); the item
  `met`; then `fallOver: true` committed and built — **a new candidate**, the item `unmet` again — **a rehearsal that fails naming the
  answered ratio and its number**, staging restored.
- [ ] **8a, Step 2: Green three times on each driver** (fresh, re-use, from `make reset`), each run's time quoted.
- [ ] **8a, Step 3: The negative controls**, one per Review Focus line (0–7), each predicted, seen red and restored — with
  `DEMO_LOAD_STOP_AFTER` where the control does not need a whole run. **A control that needs a shorter profile restarts 7100 with its
  settings and restores them on every exit path** (`scripts/gateway-controls.sh`'s pattern; the first review's A2 I11) — a restart signs
  everyone out, so it is said before it runs. A line that cannot be broken from the demo says so and names the task-level control that
  holds it.
- [ ] **8a, Step 4: Commit**:
  ```bash
  git commit -m "feat(journey): make demo-load — a large course's app rehearsed under its audience's arrival, a pass and a fall-over, staging given back"
  ```

**Files (8b):** `scripts/ci-acceptance.sh` (a `demo-load` step, either driver), `scripts/offline-acceptance.sh` (a step; nothing here needs
the network once `make seed` has built the generator); whatever the review's one fix wave touches.

- [ ] **8b, Step 1: Every other demo** green — the launch demos after `make refresh-vulndb` if the database is past seven days (the network
  on; the next build watched, FE-57) — then **`make ci-acceptance`**, and `scripts/offline-acceptance.sh` named to Rich as owed.
- [ ] **8b, Step 2: The clicked half** (*What Rich does* 4). **8b, Step 3: The plan's one whole-branch review**, beside the Docker tier
  (7100 stopped for it); one fix wave, each fix with its own test and its control. **8b, Step 4: Close out**: the ledger, ORIENTATION §7e
  (FE-32's plan next), §8 (FE-44 BUILT), the front-end told.

---

## What this plan does not build

- **The rest of §24's production table** — backups by audience, saturation alerting, tuned edge rate limits and abuse controls — and
  **pre-warming ahead of a `synchronised` window** (Rich, 2026-10-03: *"Record it as not built"*). The instances plan (A1) builds the counts;
  **hibernation and wake-on-request are A2's**, three plans after this one (Rich's order: FE-32, BYOA on the laptop and Phase 3 first).
- **`public`'s extra gate, the security review** (§24's table). There is no item for it; FE-44 named the load rehearsal alone.
- **Raising an audience after launch** (§24's *Changing the answer*: an administrator approves an upward change, in §26's queue) — this
  plan only makes the item `unmet` when it happens.
- **Signed-in load** (Decision 4), and **page assets** (Decision 7's rule loads the three paths and nothing they reference).
- **Cancelling a run.** It ends by itself within 8 minutes of load; a person who wants staging back sooner waits.
- **Each arrival's own connection.** vegeta reuses connections (keep-alive), so 500 arrivals' 500 TLS handshakes are not put on the edge;
  the rate is, and the app's work per request is.
- **A rehearsal of a `class` app**, even a synchronised one: §24's table gives `class` no load gate, Rich's profile is a large course's,
  and the run refuses it `409 LOAD_REHEARSAL_NOT_NEEDED`. The stories page's class app is told two copies instead (`2f34041`; Spec
  action A's sweep).

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

*Lines at `c7e0978`. **Each is decided before its sitting and APPLIED BY RICH from a staged, guarded script at that sitting's open** —
the edit, the shared pages' sweep and the commit (*What Rich does* 3). **Read in Rich's order** (A1 → B → FE-32 → BYOA on the laptop →
Phase 3 → A2; the second review's M2): **§11's interface** — A1's A (APPLIED, `49b9a83`), then this plan's C, then FE-32's A, then A2's C
(BYOA changes no §11). **§24** — A1's B (APPLIED, `3d57fc3`) after its table; this plan's A in *Sandbox and staging ignore all of it*; A2's
B later. **§26's settings sentence** — this plan's B first, then FE-32's C, then A2's B. **§20** — this plan's C (*The edge as a control
point*) and D, then BYOA's C (l.2052-2055, a different paragraph: the per-token limits).*

### A. §24 — what the load rehearsal is (before sitting 3)

**Proposed.** After *"…launch day will fail on launch day, and that is as true of capacity as it is of identity."* (l.2831-2833), add:

> *"**The owner or a collaborator runs it** — or an administrator, giving their reason (§26) — as D21's rehearsal is run, in their own
> session and stepped up, and it is one at a time across the platform; while it runs, nothing else is deployed to that app's staging.
> Manifest redeploys the release serving staging **in production's shape for the audience** — its instances, at production's resources,
> behind one balanced route — and puts the audience's arrival on it through the edge: for `large_course` and `public`, **500 people
> arriving within a minute and staying five minutes** (`synchronised`) **or arriving over five minutes** (`steady`). **Each arriving person
> asks for three pages — the app's front page, its health path and its sign-in — and then one every ten seconds while they stay; no page's
> images or scripts are fetched.** So `synchronised` is **75 requests a second for the first minute, then 50 a second for five minutes**,
> and `steady` is **10, 20, 30, 40 and 50 a second, a minute each**. It **passes** when at least 99% of requests are answered — **anything
> but a server error, the edge's own rate limit or a timeout** — the 95th percentile is under two seconds, and every instance stays healthy
> with no exit and no out-of-memory exit; **a generator that reached less than nine-tenths of the rate asked is a failure, never a pass.**
> Then staging is given back its own shape. The numbers are platform settings (§26), these their defaults. The item is met by the newest
> passing rehearsal of the release that would launch, at the audience — its scale and its burst — it was run for; after launch, it is asked
> again only when the audience is raised."*

*Shared pages* (the second review's I7 — the first draft named `manifest-phases.html` and D29, neither of which names a load rehearsal):
- **`manifest-stories.html` l.128** — the story's app is a `class` app (*"A whole course"*, *"all 240"*), which §24 gives no load gate:
  *"A load rehearsal: 240 simulated students in sixty seconds. It holds."* ⟶ **"Before launch: two copies of the app running behind one
  address, so one can stop without anyone noticing."** (*decided (a) by `manifest-coord3` under Rich's delegation, for his review,
  `2f34041`*). The next line, *"September, 9am — It holds for real."*, then follows no rehearsal; whether *"for real"* stays is the
  applying sitting's to put to `manifest-coord3` (or Rich) with the script, not to decide alone.
- **`manifest-stories.html` l.308** (a public app, *"A load rehearsal for 5,000 people"*) — checked, unchanged: the story is UBC's cluster,
  whose settings name its own numbers.
- **`manifest-schematic.html` l.347** (the large-course choice, *"a rehearsal before launch"*) and **l.566-571** (*"any app expecting a
  large audience does a separate load rehearsal before going live"*) — checked, unchanged: both say what this builds.
- `manifest-phases.html`, `manifest-decisions.html` (D29) — checked, name no load rehearsal; unchanged.

### B. D24 and §26 — the person-only list and the platform settings (before sitting 4)

**Proposed.**
1. **D24** (l.220), *"running D21's pre-production rehearsal (§9)"* ⟶ *"running D21's pre-production rehearsal (§9) or §24's load
   rehearsal"* — the same capability. *"Four actions are stricter still"* stays four: the load rehearsal is part of the third. **And its
   reasons sentence** (the second review's M4 — the first draft's *"past anything a token deploys"* is false for staging, which a token
   deploys): *"…and the rehearsal puts an unapproved release on production's public listener while its sign-in runs, past anything a token
   deploys (§20)."* ⟶ *"…and the two rehearsals change what serves past anything a token deploys: D21's puts an unapproved release on
   production's public listener while its sign-in runs (§20), and §24's grants staging production's capacity, which is a person's decision
   (D29), and holds staging for its length."*
2. **§26, *Platform settings*** (l.3039), after *"…and the platform's monthly intake budget."*: *"And the load rehearsal's profile and pass
   mark (§24)."* — **the first of three such sentences**: FE-32's C and then A2's B each add theirs after it. **Like every platform setting
   today, it is deployment configuration read at boot, so a change to it is not yet audited with its actor as the bullet's last sentence
   says** — a gap every setting already has (the first review's cross-plan 6), named here and not closed by this plan.

*Shared pages:* `manifest-decisions.html`'s D24 (l.170-173) — checked: its *"the four consequential things"* are the privileged four, not
the person-only list; unchanged.

### C. §11 and §20 — the driver exempts one address from a route's rate limit (before sitting 2)

**Why.** The run needs the edge to skip its per-IP limit for the generator alone (Rich: *"Exempt the generator's IP"*), only the driver
applies routes, and §11's interface is *"everything the control plane may ask of infrastructure, and nothing more"* (the first review's I2).

**Proposed.** In the `Driver` interface (l.1166-1180), after `restoreRoute(ids: string[]): Promise<void>     // re-point a hostname at
running instances`:
`setRateLimitExemption(hostname: string, address: string | null): Promise<void>   // one address past the route's rate limit; null clears`

and in **§20's *The edge as a control point*** (where the per-IP limits are stated, l.2080-2084 — the second review's I6; the first draft
put it in §12), after the bullet list: *"For the length of one load rehearsal (§24), the staging route of the app being rehearsed does not
limit the load generator's own address; every other client keeps its limit, and the exemption is cleared when the rehearsal ends, and at
boot."*

*Shared pages:* `manifest-schematic.html`'s edge line — check; likely unchanged.

### D. §20 — a second image built rather than pulled (before sitting 2) — added by the second review (I6)

**Why.** §20 says the custom Caddy image is *"built during `make seed` — the one image that is built rather than pulled"* (l.2088-2089).
Rich's *"Build it locally"* makes the load generator a second.

**Proposed.** *"…built during `make seed` — the one image that is built rather than pulled."* ⟶ ~~*"…built during `make seed` — one of two
images built rather than pulled; the other is §24's load generator, built from its release binary, checksum-verified."*~~

> **RE-WORDED BY RICH, 2026-10-15 ~11:45 PDT (`624deb66`; his *"yes I am happy to go with your recommendation"*, to `manifest-coord5`),
> option (a), after Task 1 found the draft's count false** (sitting 1's F1): `make seed` already builds FIVE images —
> `infra/seed/seed.sh:17` runs `$COMPOSE --profile github build`, and `infra/compose.yaml` builds `manifest-dnsmasq:local`,
> `manifest-caddy:local`, `manifest-egress:local`, `manifest-idp:local` and `manifest-github-fake:local` — so l.2089 is already false and
> *"one of two"* would be too. **D's words, as applied at sitting 2's open:** *"…built during `make seed` — the platform builds its own
> images rather than pulling them where it must (this one, its resolver, egress proxy and IdP), and builds §24's load generator there
> too, from its release binary, checksum-verified."* Rejected: (b) apply the draft, its count wrong; (c) drop D and correct the count later.

*Shared pages:* checked — none says how many images are built (`grep -i 'built rather'` over the four finds nothing); unchanged.

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
   (changed in that plan in the same commit as this one). *Superseded:* the FE-46/47/5 plan took `1.8.0` and A1 `1.9.0`, and Rich re-cut
   the order (A2 after FE-32, BYOA and Phase 3), so this plan is **`1.10.0`** and FE-32 `1.11.0` (the second review's M1).

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

## Revised to the second review — what changed, finding by finding (2026-10-14)

*The review is [`2026-10-14-second-review-of-load-rehearsal.md`](./2026-10-14-second-review-of-load-rehearsal.md) (`6f99611`), read at
`c7e0978` — A1 through its sitting 5. Its verdict: **approve with the fixes**. Every finding is built in; none is argued. Its one question,
I7, was decided by `manifest-coord3` under Rich's delegation, for his review (`2f34041`: (a)).*

| Finding | What it said | Where it went |
|---|---|---|
| **I1** | A grant that fails is ANSWERED, not thrown, so the run could load staging's own instance and pass at the wrong shape; a take-down answered `failed` leaves the granted set; a `teardown_failed` row is never retried | Architecture; *Read this first* 14; Decision 2 (the read-back; `granted` from it), Decision 9 (`teardown_failed` stops blocking, the next deploy gives staging back); Review Focus 0; Task 4's *grant read back* rows and control (e) |
| **I2** | The pass rule went past Rich's *"non-5xx, no timeout"* (a per-path 2xx/3xx rule) and Spec action A did not say how | *Answered* = below `500`, not `429`, in time (Architecture, Decision 8); per-path counts evidence only (Decision 3, Task 2's interface and tests); Spec action A's words gain the `429` and the nine-tenths rule |
| **I3** | The sign-in path is the skeleton's `/login`, not `auth.callback`'s; each `/login` now writes to the app's Mongo; sitting 6 changes the skeleton | *Read this first* 16; Decision 4; Task 1's `[M2]` on a skeleton built after A1's sitting 6 |
| **I4** | The fall-over fixture cannot fall over at the profile (Little's law) | Task 8a's fixture: `/` held ~600 ms, `503` above eight, `/healthz` untouched, checked against `[M3b]`; Review Focus 5 |
| **I5** | Nothing reports an out-of-memory exit | `InstanceStatus.outOfMemory` from `State.OOMKilled` (Task 3, its control (b)); `[M7]` (Task 1); *Read this first* 15; Decision 8; `judge`'s `outOfMemory` |
| **I6** | §20's *"the one image that is built"* made false; C's sentence in the wrong section | **Spec action D**; C's sentence in §20's *The edge as a control point*; *Read this first* 20; Task 2's header |
| **I7** | A swept the wrong pages; the stories page's class app is rehearsed | Spec action A's sweep list; l.128 → *"two copies…"* (`2f34041`); *What this plan does not build* |
| **I8** | 7100's set watcher, the classifier's refusals of spec edits and commits, the execution method — not carried | Global Constraints (7100 stopped for the Docker tier; spec actions by staged script; the gate numbers' one place; the vulnerability database); *What Rich does* 3; the sittings' preamble (inline) |
| **I9** | The D21 exclusion had no mechanism; the platform lock would hold a pooled connection for ten minutes, from a pool nothing named | Decision 6: a partial unique index on `state = 'running'` across the table, the insert inside `tryWithRehearsalLock`, D21's reading the row under the same lock, no new pool; `runLoadRehearsal` returns `{ row, done }`; Task 4's rows and control (d); *Read this first* 18 |
| **I10** | Sitting 6 too big | Task 8 as 8a (sitting 6) and 8b (sitting 7); `DEMO_LOAD_STOP_AFTER`; a control's restart restored on every path — seven sittings |
| **M1** | The chain: `1.10.0`; A1 → B → FE-32 → BYOA → Phase 3 → A2 | The banner, Architecture, Decision 1, Task 5, *Predecessor*/*Successor*, the ORDER bullet, *Read this first* 3, *What this plan does not build*; **FE-32's l.51** reason line (*"B, before this one"*) in the same commit |
| **M2** | The spec actions' composition order | The note above the spec actions |
| **M3** | `launch:rehearse` is an administrator's too | *Read this first* 9; Review Focus 6; Task 5's matrix; Spec action A's words |
| **M4** | Spec action B.1's reason false for staging | B.1 amends D24's reasons sentence (capacity, D29); *"part of the third"* |
| **M5** | The image's home: the daemon, not the registry | Decision 3; Task 2's files; *Read this first* 21; Task 1's `[M1]` |
| **M6** | vegeta keeps response bodies | `-max-body=0`; the tmpfs's size stated (Decision 3, Task 2 Step 4) |
| **M7** | The archive API cannot write onto a tmpfs | `go()` by an Engine exec of `touch` (Task 2's interface and Step 4) |
| **M8** | No fake call list; `shape.test.ts`'s staging title | A recording wrapper (Task 4's tests); the title renamed (Task 4's files); *Read this first* 13, 22 |
| **M9** | `setRateLimitExemption`'s edges | Decision 5; Task 3's files and tests; `[M4]` (the zone's matcher; counters across a PATCH) |
| **M10** | An archive mid-run loads a `410` for minutes | Decision 6: the watch stops the generator |
| **M11** | `deploy` must declare `LOAD_REHEARSAL_RUNNING` | Task 5's files and matrix; the File Structure |
| **M12** | `EXPECT_DOCTOR` moves with a doctor check | Task 2's files; Global Constraints |
| **M13** | `[M5]` against a project's live route desynchronises 7100 | `[M5]` on a hostname no project holds |
| **M14** | *"Audience raised"* is unreachable through the API | Decision 10; Task 6's rows |
| **M15** | Keep-alive: no per-arrival TLS | *What this plan does not build* |
| **M16** | Line drift | *Read this first*, every fact re-read at `c7e0978`; the spec's lines |
| **M17** | The vulnerability database for sitting 7's demos | Global Constraints; Task 8b Step 1 |

**Not taken:** nothing. **Routine calls this revision made**: the fixture is a CWL app (so the demo loads all three paths); `go()` on the
generator's handle rather than a second container; the index across the table rather than per project plus a lock; a `teardown_failed`
row stops blocking staging rather than the boot retrying it (a person's next deploy is the remedy, and the record says so).

**What A1's sittings 6–8 change under this plan** is the review's §3 — re-read at Task 1. At this revision sitting 6 was in progress
(uncommitted: the candidate read off the set's first healthy member; the set watcher reading launched projects only).
---

## What executing this plan found

*(One dated section per sitting.)*

### Sitting 1 — 2026-10-15, 11:27–12:46 PDT (`manifest-b-s1`, the third coordinated run's job B1): Task 1 — the measurements

**Opened** by `manifest-coord5`'s GO (11:27), which relayed Rich's decisions — the decisions file's *2026-10-14, ~18:34* entry and its
appended words (`6c9949a`: *"B, the load rehearsal, 7 sittings"*, his delegation continuing; `3ba424a`: Spec actions A–D approved as
drafted; `bdfc6f2`: the standing yeses — inline execution among them) and `d2e2d772` (Docker Desktop kept at 6 CPUs) — and handed over
FE-63 to be noted here. HEAD `d2e2cf0d`. 7100 was P11's LANDING 1's under the coordinator's HOLD until 12:14, so the sitting measured
what needed neither 7100 nor heavy CPU first, with Rich on a Zoom call. **Task 1** (`a46bdad9`): the record is
[`../spikes/load-baseline/README.md`](../spikes/load-baseline/README.md), its raw output `results-task1-2026-10-15.txt`, its probes
`probes/`, and `[M1]`'s fact-by-fact table at `d2e2cf0d`, `facts-at-d2e2cf0.md` — read by one read-only agent and the claims the record
leans on re-read by hand (facts 1, 6, 14–17 and 20, and the five images of F1). **Measured on Docker Desktop 4.95.0, Engine 29.8.2,
`NCPU` 6** (`docker info`), the VM 7,934 MiB. A *SITTING 1 MEASURED* note now sits under each task a measurement changes (2, 3, 4, 5, 6,
8a) and under *Read this first*; Spec action D carries Rich's re-wording (F1).

1. **F1 — SPEC ACTION D'S APPROVED WORDS WERE FALSE: `make seed` builds FIVE images, not one** — `infra/seed/seed.sh:17` runs `$COMPOSE
   --profile github build`, and `infra/compose.yaml` builds `manifest-dnsmasq:local`, `manifest-caddy:local`, `manifest-egress:local`,
   `manifest-idp:local` and `manifest-github-fake:local` (all five in the daemon), so §20's *"the one image that is built rather than
   pulled"* (l.2089) is already false and D's *"one of two"* would have been. Put to `manifest-coord5` at 11:42 with three options; it
   verified the premise and put it to Rich: **re-worded, option (a)** (~11:45, `624deb66`) — the words are at Spec action D. Applied at
   sitting 2's open with the shared pages' sweep.
2. **F2 — `State.OOMKilled` IS STICKY, AND SET ON A CONTAINER STILL RUNNING** (`[M7]` case (c)): under the init every app runs with, a
   process the app started that hits the ceiling is killed, the container stays `running` — and `OOMKilled` reads `true`, and stays `true`
   after an exit `0`. An out-of-memory EXIT is `{ exited, 137, true }`; a plain `SIGKILL` `{ exited, 137, false }` — only the flag tells
   them apart (Task 3's control (b) stands). Task 3's mapping has only `exited` rows; recommendation recorded: `outOfMemory: true` whatever
   the state, `judge` failing on it as *"an instance ran out of memory"*.
3. **F3 — AN APP CONTAINER MAY USE SWAP EQUAL TO ITS MEMORY**: the driver sets `Memory` and leaves `MemorySwap` unset
   (`runtime/docker/hardening.ts:28`), read back as twice `Memory`; the VM has 2 GiB of swap. A 64 MiB ceiling was killed at 104 MiB (48
   MiB with swap off). For the rehearsal a member is slow before it is killed, so the p95 rule meets it first; a fixture that falls over by
   memory must allocate past twice its ceiling. **Recorded, not this plan's**: whether apps should swap at all is §12's hardening.
4. **F4 — STAGING AND PRODUCTION RESOLVE TO THE SAME RESOURCES UNLESS THE MANIFEST SAYS OTHERWISE** (`spec/resolve.ts:113-117`;
   node-ts-mongo's defaults for both, the proof app setting no `environments`) — so Task 4's and Task 8a's *"staging back at its own
   resources (`HostConfig.Memory`)"* is a check that cannot fail unless the app declares `environments.production.resources` that staging
   does not have. Recorded under Tasks 4 and 8a.
5. **F5 — caddy-ratelimit's COUNTERS SURVIVE EVERY PATCH** (`[M4]` T3, T4): identical, or changing the zone's `match`. Task 3's Docker case
   counts with a fresh address; an exempt address's requests are never counted, so once cleared it starts at zero.
6. **F6 — A MALFORMED EXEMPTION IS THE ADMIN API'S `500`, AND THE PREVIOUS CONFIG KEEPS SERVING** (`[M4]` T7): Task 3 validates the
   address and refuses with the driver's own code before it writes.
7. **F7 — THE EXEMPTION KEYS ON THE GENERATOR CONTAINER'S OWN `manifest-platform` ADDRESS** (`[M2]`): the edge's staging wildcard echoed
   `remote=10.89.0.13` for a container at `10.89.0.13` — no NAT, no proxy header. A host's request arrives as `10.89.0.1`.
8. **F8 — THE JOURNEY'S `seeEveryMember` STILL WAITS `4 × N`** (`packages/journey/src/serving-set.ts:42`), where the platform's identity
   check moved to `16 × N` (`routing/readiness.ts:109`, `745def2`) because live traffic made `4 × N` miss a member about 1 in 65 at three.
   Task 8a's reads through the edge while the generator loads must not use it as it stands.
9. **F9 — `packages/journey/src/capacity.ts` EXPORTS NOTHING**: `make demo-capacity`'s set readers are private; Task 8a extracts what it
   reuses.
10. **F10 — NOTHING READS AN AUDIENCE'S `burst` YET** — fact 1 said the checklist did; `loadRehearsalItems` keys on `scale` alone
    (`launch/readiness.ts:229`). Task 6 is its first reader.
11. **F11 — THE GENERATOR'S IMAGE IS SAFE IN THE DAEMON; ITS CONTAINER'S NAME IS A CHOICE**: a daemon image `manifest/vegeta:<version>`
    survives `make reset` and all three cleanup scripts (none removes a daemon image outside `127.0.0.1:7107/local/`); a container named
    `mf-…` would be removed by `make reset` (`Makefile:107`) and counted as the app's by `dead-app-resources.sh` (`:78`). `doctor.sh` checks
    images only by its lists and does not check `manifest-caddy:local`, so a check for vegeta's image is a new check (`EXPECT_DOCTOR`).
12. **F12 — TWO STALE COMMENTS**: `runtime/docker/driver.ts:572-574` (passive checks *"`502` and `504`"*, gone since `745def2`) and
    `releases/shape.ts:10-11` (`'replacement'` *"passed by nothing until the watcher exists"*, passed since `68274fa`). Task 4 edits
    `shape.ts`; the driver's is whoever next edits that file.
13. **F13 — FE-63's REPLACEMENT MARK: THE INSTANCE ALREADY STORES IT** (`instances.replacing`, `db/schema.ts:347-349`) — no migration for
    the instance's mark; an Incident's derivable by `listIncidents`' existing join; `incidents.cause` has no replacement value. The whole
    touch list is the record's *FE-63* section; its placement is `manifest-coord5`'s at sitting 4's open (noted under Task 5).
14. **F14 — `pgrep -fl` PRINTED A RUNNING VITEST'S ENVIRONMENT, A SESSION TOKEN INCLUDED, INTO THIS SITTING'S RAW OUTPUT** — caught by a
    scan before anything was staged, and the four lines removed from the results file (it says so where they were). **Why:** Vitest sets
    `process.title` (`node (vitest)`), and on macOS that overwrites the argument area so `ps`/`pgrep -fl` read on into the environment
    strings that follow it — measured: a `node` given `process.title = 'node (b1probe)'` listed as `node (b1probe) TERM_SESSION_ID=…
SSH_AUTH_SOCK=…`, the same `node` without a title listed no variable; which variables show depends on the original arguments' length. A
probe whose output is committed counts processes with `pgrep -f … | wc -l`, never `-l`. (TRAPS.md.)

**`[M2]`'s app half** ran at 11:46 on `muddiest-point`'s STAGING (W5B's walk app, done with at 11:36, its image built 10:44 — after
`1d40042`), `manifest-coord5`'s choice under Rich's delegation (11:47) since 7100 would hold no project after LANDING 1: `/` `200`,
`/healthz` `200`, `/login` `302` to the laptop IdP with no cookie; `saml_requests` 0 → 1 (TTL 28,800 s), counted by `mongosh` inside
its staging DB container. Nothing of its production or repository touched.

**The window** (12:14–12:40, `manifest-coord5`'s *"7100 is yours"* after LANDING 1 landed at `355f612`, which moved `EXPECT_TESTS`
3691 → 3756 and `EXPECT_FILES` 224 → 231 during this sitting): **`[M6]` `pnpm test` once — 231 files, 3756 tests, all passed**, equal to
the `EXPECT_` lines, 1,093.97 s at utility, load median 3.40; **`[M5]`** through the Docker driver's own `ensureInstances` on
`bs1-m5.staging.manifest.internal` (no project): the GRANT (one → three at production's resources, the route moved in one change)
**3.6 s**, the TAKE-DOWN (three → one) **1.4 s**, retires 0.1–0.3 s, each member idle 25–27 MiB with `Memory` 512 Mi and `MemorySwap` 1
Gi (F3, on containers the driver made) — the moves are seconds, the ten minutes are the load's; then **G4**: 7100 restarted from `.env`
(`capableModel` and `ubc-qwen-27b` *unchanged*, 16 secrets scrubbed) and ONE call to `default-chat-large` answered by **`gpt-6.1-sol`,
`x-litellm-attempted-fallbacks: 0`**, through the UBC gateway. 7100 handed back at 12:40 with 0 projects (the two runs' truncations).
**The probe's two defects, mine** (in `probes/m5-set.ts`'s comments): fixed ids must differ in their first eight characters
(`instanceName` takes the release's and the instance's first eight), and `retireInstance` takes the driver's handle id, not an
instance's uuid (given one, it finds nothing and answers at once) — the record's numbers are the third, corrected run's.

**Gates**: `pnpm test` ONCE — nothing any gate covers changed (the sitting's only code is `probes/`, outside every package and Prettier's
remit; `eslint` over it clean), so the close's *"twice on the final tree"* would run an unchanged tree again (A1's sitting 1's ruling;
the ledger has it). The Docker tier not owed (nothing under `packages/` or `infra/`). **The machine** (12:40, `docker`, `psql`, `curl`):
31 containers (23 running), 15 networks, 49 volumes — the 11:29 snapshot exactly; images 54 → 52 (`app-images.sh --apply`: two dead
`muddiest-point` images); every throwaway gone; the three cleanup scripts bare — 0 dead networks or volumes, `litellm-orphans.sh`
refusing itself (four app containers, no AI key among them: `muddiest-point`'s), 17 orphaned mirrors named (`muddiest-point.git` new).
`muddiest-point`'s containers, rows truncated, left for the coordinator. **Fourteen findings.**

### Sitting 2 — 2026-10-15, 12:47–15:48 PDT (`manifest-b-s2`, the third coordinated run's job B2): Spec actions C and D, vegeta, Tasks 2 and 3

**Opened** by `manifest-coord5`'s GO (12:47), relaying Rich's decisions — `3ba424a` (A–D approved as drafted; vegeta's download a
standing yes, checksum-verified, a mismatch stopping the sitting), `d5b0eb2` (his allow line for committing an approved spec action),
`624deb66` (D re-worded), `d2e2d772` (Docker at 6 CPUs) and his word that work may run during his calls (13:00–16:00). HEAD `3293d9b7`.
7100 held from the open (real GitHub, 0 projects). Rich was on a Zoom call from ~13:00, so every whole-suite run went at background
priority.

**At the open — W5B's orphans** (`manifest-coord5`'s ask): `muddiest-point` had 10 running containers and no row in 7100 (0 projects, 0
instances, read first). Removed by name (`docker rm -f -v`), with its three runtime routes (`DELETE /id/…` on 7119 — staging and sandbox
on `srv0`, production on `srv1`, each `200`), 7 named volumes, 2 images, and — through `dead-app-resources.sh --apply`, the edge and the
container resolver being attached — its 3 networks; read back to zero. No LiteLLM user was its (no container carried `LLM_API_KEY`).
**`litellm-orphans.sh`, which refused itself at sitting 1's close**, then read 0 app containers and listed three budget users with no live
key — two people's (`mf-person-…`) and `mf-platform-intake` — so `--apply` (allowed) deleted them, resetting those months on this laptop
(a mint recreates each). `app-images.sh` 0 dead. The GitHub repository `Manifest-local-dev/muddiest-point` is Rich's and was not touched.
Machine after: 21 containers (13 running), 12 networks, 39 volumes.

**Spec actions C and D — APPLIED AND COMMITTED IN THE SESSION** (`a5c44838`, 12:50): the edits and the commit were both allowed under
`d5b0eb2` (no staged script). C word for word (§11's interface line after `restoreRoute`; §20's sentence after its bullet list); **D in
Rich's re-worded words** (`624deb66`), not the draft's. Read back: those lines and nothing else. **The four shared pages, checked: none
changes** — none restates the `Driver` interface, the per-IP limit (the stories page's l.302 *"rate limiting at the front door"* is a
public app's own guard; the schematic's *"limited to a rate set on its own credential"* is the per-token limit) or a count of built images.
`infra/caddy/Dockerfile:1`'s copy of §20's old sentence swept in Task 2's commit.

**vegeta's download** (Rich's standing yes, 12:51): **v12.13.0** — GitHub's `releases/latest`, published 2025-10-31 (the one before,
v12.12.0, 2024-07-29). `linux_arm64` `950381173a55…`, `linux_amd64` `e8759ce45c14…`: each `shasum -c` OK against the release's
`vegeta_12.13.0_checksums.txt` **and equal to GitHub's own server-side asset digest** (the checksums file's too, `384239c9…`) — a second,
independent source. No mismatch. Into `infra/seed-cache/vegeta/` (git-ignored). Nothing else used the network.

**Task 2 — the generator** (`3205b956`; the Dockerfile's parser directive `30b14484`): `infra/vegeta/` (the lock, both sha256s; a
Dockerfile FROM `alpine:3.22` by `images.lock`'s digest, the archive checked a third time in the build, a non-root user, the archive's
sha256 a label); `infra/seed/build-vegeta.sh`, `make seed`'s step 4a after the mirror — download if absent, verify against the lock AND
the published file, build into the DAEMON as `manifest/vegeta:12.13.0` (1.6 s from the cache; offline without it, exit 1 naming why); a
new doctor check (the image built AND labelled with the lock's archive for this daemon's architecture) — **`EXPECT_DOCTOR` 22 → 23**,
measured 23/0/0; `launch/load.ts` (`createLoadGenerator`, `readLoadResult`) with 27 unit tests, the seed step's 4, and Docker cases.
**`[M3b]`** (12:57–13:00, under the coordinator's HOLD): vegeta reached **10.03 / 50.03 / 100.03 / 200.03 / 400.04 a second** for 10–400
asked, 0 errors, p95 ≤ 3.7 ms, at 15.8 % of a CPU and 15 MiB at 400 — **Spec action A's 75 a second is within reach, so the sitting's
stop-and-ask did not fire** ([`../spikes/load-baseline/`](../spikes/load-baseline/README.md), `[M3b]`).

**Task 3 — the exemption and `outOfMemory`** (`fff41f8c`): `Driver.setRateLimitExemption` on both drivers and the contract; routing's
`setRouteRateLimitExemption` PATCHes the route as the edge holds it with only the zone's `match` changed; `ADDRESS_INVALID`;
`InstanceStatus.outOfMemory` from `State.OOMKilled`; the fake's `crash(…, { outOfMemory })`. On the real edge: the exempt client 1,200
with no `429`, a fresh one cut at 600, cleared and the first limited again.

**The stop, quoted** (`d33d950f`, Tasks 2 and 3 composed as Task 4 will call them): a stub app behind a real route on the live edge
(600 a minute per address), the generator at 30 a second for 25 s — **exempted through the Docker driver's own verb: 750 requests, 750
answered, 30.04/s achieved, p50 1.9 ms, p95 2.8 ms, p99 4.0 ms, from `10.89.0.11`; not exempted: 600 answered, 150 `429`.**

**Rulings** (the ledger has each with its cost): the generator is not bound at boot until Task 4 binds it beside its caller, nor exported
from `launch/index.ts` (a deps slot nobody read); `load.docker.test.ts`'s first cases load the edge's staging wildcard (no project's
route touched), its composed cases a stub app's real route; vegeta's `errors` list dropped inside the container; `readLoadResult` refuses
counts that do not add up and paths the run did not load; a third Docker case (a 1 ms timeout) for Go's real timeout words; **the verb
PATCHes the route as held rather than rebuilding it with `buildRoute({…, rateLimitExempt})` from the containers** (the plan's Files) —
Decision 5's *exactly the set the hostname reaches now*; **F2: `outOfMemory` is `OOMKilled` whatever the state**, documented sticky;
`ADDRESS_INVALID`, a new driver refusal (never on the wire); the fake forgets an exemption on any route written afresh; commits on
single-file runs (the DB-free scratch config, Docker files included with `MANIFEST_TEST_DOCKER=1`), the whole suite twice at the close.

**Negative controls, watched red and restored**: a `429` counted answered → only *"counts a 429 and a 5xx as NOT answered"* (1,400 vs
1,300); the container's timeout match broken → only the real-timeout Docker case (0 timeouts) — **its first attempt stayed GREEN because
my `sed` never matched (no diff): redone by exact replacement** (a green control is a question); the awk path fold off by one → the
two-phase case (*"a path the run did not load: 'healthz'"*); each of the seed step's three checks broken → only its own case; doctor's
check → FAIL for the image absent and for the lock pinning another archive; Task 3's **(a)** the exemption written as `0.0.0.0/0` →
only the other client's assertion (`{"200":700}`); **(b)** `outOfMemory` read from exit `137` → the kill row AND F2's running row (the
plan predicted the kill row alone; F2's row came after the prediction).

**Findings**
1. **F1 — DOCKER HANDS A REMOVED GENERATOR'S ADDRESS TO THE NEXT CONTAINER AT ONCE** (`10.89.0.11` twice in the composed case): an
   exemption left after the generator is gone exempts whoever is started next on `manifest-platform`. Task 4 clears it before (or at once
   after) the container goes — under its *SITTING 2* note.
2. **F2 — VEGETA'S `errors` LIST IS PER-CONNECTION**: one string per distinct error, a local port in many (`read tcp 10.89.0.13:45678->…`),
   so it is unbounded; the container drops it from every report it prints. What failed is still in the line: `timeouts` and each path's
   status `0`. Task 4 may add a capped map of error kinds if a failed run's reason needs one.
3. **F3 — GO'S TIMEOUT WORDS ARE *"(Client.Timeout exceeded while awaiting headers)"*** (vegeta 12.13.0, measured), and the error string
   carries the URL — so a timeout is matched on Go's own phrases, never on the word *timeout*, which an app's slug may contain.
4. **F4 — BUILDKIT RESOLVES `alpine:3.22@<digest>` FROM THE DAEMON'S STORE IN 0.0 s**, every step cached on a rebuild; the image's id
   moves at each build only because each exports a new attestation index (the config digest is the same, no dangling image). Whether it
   builds with the network OFF is the offline acceptance's to confirm (Rich's, by hand).
5. **F5 — A `FROM` ARGUMENT WITH NO DEFAULT TRIPS BUILDKIT'S `InvalidDefaultArgInFrom` CHECK** — skipped by its parser directive rather
   than given a default that would drift from `images.lock`; without the argument the build fails (`invalid reference format`).
6. **F6 — THE PLAN'S FILES AND THE CODE DIFFER IN TWO PLACES, BY RULING**: no boot binding yet (Task 4's); no `buildRoute` input — the
   route is PATCHed as held.
7. **F7 — `litellm-orphans.sh` AT THE OPEN** listed two people's budgets and the platform's intake budget as orphans (no live key), once
   the keyless app containers that made it refuse itself were gone: their months on this laptop were reset by `--apply`.
8. **F8 — MY OWN THREE**: a control whose `sed` never matched (above); an unquoted `$P` in zsh (the shell these tool calls run) staged
   nothing on the first commit attempt — no word splitting — so the paths went in as `"$@"`; and a scripted edit written against
   imports Prettier had since reflowed did not apply (seen: the run said `3 skipped`).

**Gates**: `pnpm test` twice on the final tree (`30b14484`; the code `d33d950f`, the only change after it a Dockerfile parser directive no test reads) — **233 files / 3800 tests both times**, 3,335.6 s and 3,330.7 s at background priority (Rich on a call; scale 7; load median 4.98 and 4.88, max 11.61 and 10.54, not forced) — so `EXPECT_TESTS` 3756 → 3800 and `EXPECT_FILES` 231 → 233 (`6fba2128`); `EXPECT_DOCTOR` 22 → 23 with Task 2 (measured 23/0/0); lint, typecheck and format:check clean on every commit. **The Docker tier** (owed: `launch/`, `routing/`, `runtime/`, `infra/`): **315/315, 45 files, 1,940.7 s** through the wrapper at utility (the call over by then), load median 6.62 / max 19.56, 12 → 19 networks, 7100 stopped — ORIENTATION §2’s row moves 305/44 → 315/45; its composed case again under the tier’s load: exempted 750/750 at 30.04/s (p95 4.2 ms), not exempted 600 + 150 × `429`. The slow list: nothing of this sitting’s (its unit files 11–904 ms). Inline execution; the plan’s one whole-branch review is Task 8b’s (sitting 7).

**The machine**: at the open (12:47) 31 containers (23 running), 15 networks, 49 volumes, 62 images (`docker images -q`); after the orphans 21/13, 12, 39, 60; **at the close (15:47) 21 containers (13 running), 12 networks, 39 volumes, 61 images** — the one more is `manifest/vegeta:12.13.0`, in the daemon by design (it survives `make reset` and every cleanup script). After the tier: `dead-app-resources.sh --apply` 7 networks and 1 volume, `litellm-orphans.sh --apply` `mf-platform-intake` (recreated by the tier’s boots) and `p4b-probe-user`, `app-images.sh --apply` 14 images — each re-read to zero; `make verify` 67/0/0, runtime routes 0, `srv1` none. Every throwaway gone (`[M3b]`’s network and three containers, every generator, both clients, the stubs). **7100** (15:46): real GitHub from `.env`, `capableModel` and `ubc-qwen-27b` registered, 16 secrets scrubbed; G4’s one call to `default-chat-large` answered `200` by **`gpt-6.1-sol`, 0 fallbacks**; **0 projects**. HOLD given back to `manifest-coord5` at 15:47.
