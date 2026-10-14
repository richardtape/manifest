# A second fresh review of B — the load rehearsal (2026-10-14)

> **What this is.** The second fresh review of [`2026-10-03-load-rehearsal.md`](./2026-10-03-load-rehearsal.md) (B, §24, FE-44) that
> Rich asked for on 2026-10-03 (15:20 PDT, *"A1 and FE-32 now; B and A2 later (Recommended)"* — *"a second fresh review when they are
> next in line"*), placed in the second coordinated run as job **RB** (Rich, 2026-10-13 16:01, answer 8, `c0f969e`). Written by
> `manifest-review-b`, at `manifest-coord3`'s GO, **documents only** — no test, demo, Docker run or server. It reads B against **the
> code as A1 has left it: HEAD `c7e0978`, A1 through sitting 5's close-out (`ab82e35`)**, in the shape of
> [`2026-10-03-review-of-four-plans.md`](./2026-10-03-review-of-four-plans.md). Started 00:17 PDT; this file written 00:22–00:37 PDT (read from the clock).
>
> **A1's sitting 6 was running while this was written** (`manifest-a1-s6`, uncommitted edits to `launch/candidate.ts`,
> `projects/repository.ts`, `releases/watch.ts`, the console, the mock and the contract at 00:34). Every line number below is HEAD's
> (`c7e0978`), never the working tree's. §3 lists what sittings 6–8 change under B; B's Task 1 re-reads each.
>
> **Verdict: approve with the fixes below** — all of them taken into B by the revision that follows this review (*Revised to the second
> review* in B). B's shape holds against A1 as built: one row in `shapeFor`, the deploy across N, a set route whose health policy is a
> parameter, the boot's pass 2⅞ reserved between D21's take-down and the retirer, and a set watcher that reads production only. What
> does not hold is mostly what A1 built *differently* from what B assumed: a failed set is ANSWERED, not thrown; there is no out-of-memory
> signal; the sign-in path is not `auth.callback`'s; and since A1's Task 8a every sign-in writes to the app's Mongo.

---

## 1. B, as it stands

The owner's (or a collaborator's) person-only, stepped-up `POST /v1/projects/{projectId}/load-rehearsal`, answered `202` with a `running`
record and polled; staging redeployed in production's shape through `shapeFor`'s new `'load-rehearsal'` row; vegeta — an image built here
from the mirrored `alpine:3.22` and its checksummed release — loading staging through the edge, the generator's one address exempt from the
route's per-IP limit through a new `Driver` verb; a pass mark, a `load_rehearsals` record written `running` before the grant, staging given
back in a `finally` and at boot (pass 2⅞); staging deploys refused while a run holds it; the checklist item met by a passing measurement at
the audience's scale and burst. Contract one minor bump; six sittings; `make demo-load` and a clicked half; spec actions A (§24), B (D24,
§26) and C (§11, §12).

## 2. Findings

*Each was checked against the code at `c7e0978`. Important first, most likely to cost a person first.*

### Important

**I1. A grant that fails is ANSWERED, not thrown — and the run, as written, would load whatever still serves staging and could record a
pass at the wrong shape.**
- `deployReleaseSet` returns, never throws, when a member is unhealthy: every member is marked `failed`, the previous set is restored,
  and `answer` is the failed member (`releases/release.ts:1280-1283`; `InstanceNotReadyError` is caught and recorded, `:962-988`; A1's
  sitting 4, F4). D21's rehearsal knows this and says so: *"A failed deploy is a `200` whose state is `failed` (P4c), and the previous
  instance — if any — keeps serving, so the probe would measure something other than this release"* (`launch/rehearsal.ts:269-275`).
- B's Task 4 matrix covers *"the generator throws"* and *"the redeploy back throws"* only. A grant answered `failed` leaves staging on
  its OWN one instance at staging's resources; the run would exempt the address, load it, and — at 25–75 requests a second on a small app
  — likely pass, writing `granted` from what was intended. **§13's gate would then be met by a rehearsal that never ran production's
  shape.** It is P6a sitting 9's lesson again (*the evidence describes what happened, not what was intended*).
- The take-down has the mirror case: its redeploy to one instance answered `failed` leaves the GRANTED set serving (the rollback restores
  it), so the row must end `teardown_failed`. And a `teardown_failed` row is not `running`, so the boot's pass 2⅞ never retries it.
- **Fix:** after the grant, the run reads `driver.servingInstances(hostname)` and proceeds only when it is exactly the set it started,
  `shapeFor`'s count, every member `healthy`; otherwise the row ends `failed`, reason *"production's shape could not start on staging"*
  with the Incident's line — no exemption, no load. `granted` is written from that read. The take-down checks the same way (one member,
  staging's resources, serving); answered `failed` is `teardown_failed`, like a throw. A `teardown_failed` row stops blocking staging
  deploys (it is no longer `running`), so the next staging deploy gives staging back its own shape — the record, its reason and one
  operator line say so. Task 4 gains both rows and a control (skip the read-back: predict red on the failed-grant row only).

**I2. The pass mark B builds is stricter than Rich's words, and Spec action A does not say how.**
- Rich approved *"≥99% answered (non-5xx, no timeout)"* (2026-10-03, ~13:52, *"As proposed"*). B counts a `429` as unanswered and, through
  `LoadTarget.paths`, counts a `2xx` or `3xx` as unanswered on a path that expects the other (Decision 3; Task 2's interface, *"Answered as
  each path expects"*).
- The `429` rule is defensible from Rich's own *"A run the generator could not drive fails, never passes"* (13:56): a `429` means the
  edge's limiter, not the app, answered. The per-path class rule is not his and is fragile: **a faculty app's own `/` may redirect a
  stranger to sign-in** — the starter's does not (`blueprints/node-ts-mongo/starters/proof-app/server.js:363`, static files), but an
  agent's app may — and then every `/` request fails the run for a reason that is not load.
- **Fix:** *answered* is a status below `500`, other than `429`, within the request's timeout. Per-path status counts stay as EVIDENCE
  (they say where a failure was), never a rule. Spec action A's words gain *"a request the edge refused for its rate limit counts as
  unanswered"* and the 90% rule (*"a generator that reached less than nine-tenths of the rate asked"*) — both are the plan's, and Rich
  should read them.

**I3. The sign-in path is the skeleton's `/login`, not `auth.callback`'s — and since A1's Task 8a every sign-in WRITES to the app's
Mongo.**
- Decision 4 loads *"its sign-in redirect (`auth.callback`'s login path, answered `302`)"*. `auth.callback` is the ACS — a POST,
  `/auth/ubcshib/callback` (`skeleton/server.js:124`). The sign-in redirect is the skeleton's own `/login` (`skeleton/server.js:119`); no
  manifest field names it, and D21's probe hard-codes it too (`sso/sign-in.ts:112`). As written, a CWL app's third of the load hits a path
  the app does not serve.
- A1's sitting 3 (Task 8a, `0ba9af8`) put the SAML request cache in the app's own Mongo: each `/login` inserts an AuthnRequest id into
  `saml_requests`, kept eight hours (`skeleton/auth/ubcshib.js:59`, `:77-108`). A synchronised run is ~19,500 requests, a third of them
  `/login` — **~6,500 documents in staging's Mongo, swept by the TTL index after eight hours.** That is realistic (real arrivals sign in)
  and it is new: the rehearsal now measures the app's database on sign-in, not only its process.
- And A1's sitting 6 is adding the skeleton's error handler and `ENV NODE_ENV=production` (Rich, ~19:38, *"both."*, `028bb94`), which
  changes how every skeleton app behaves under load.
- **Fix:** Decision 4 names `/login` as the skeleton's convention (as D21's probe does) and says what it writes; the record counts it.
  Task 1's measurements are made on a skeleton app built after sitting 6.

**I4. The demo's failing app cannot fall over at the profile.**
- Task 8's fixture answers `/` in ~20 ms and, with `fallOver: true`, `503` above eight requests in flight. By Little's law a member's
  in-flight count is its rate times its service time: the synchronised profile gives each of three members 25 then ~17 requests a second,
  so ~0.5 in flight — **never above eight**. The "fails naming the answered ratio" leg would pass, and the demo would go red for the wrong
  reason in sitting 6.
- **Fix:** with `fallOver: true` the fixture holds `/` for ~600 ms and answers `503` above eight in flight (≈10–15 in flight a member at
  17–25 a second, so roughly a fifth to a half refused), and leaves `/healthz` alone — so the edge and Docker keep it healthy and the
  FIRST broken rule is the answered ratio, as the demo asserts. The numbers are checked against `[M3b]`'s measurement, and the demo's own
  control (`fallOver: false` passes; `true` fails naming the ratio) is seen both ways.

**I5. Nothing reports an out-of-memory exit.**
- `InstanceStatus` is `{ id, state, healthy, message?, exitCode? }` (`runtime/driver.ts:176-186`); the Docker mapping reads `Status`,
  `ExitCode` and `Health` (`runtime/docker/instances.ts:15-47`) and never `OOMKilled`. B's `judge(… { oom } …)`, its evidence's `oom` and
  its reason *"out of memory"* have no source, and an exit code of 137 is any `SIGKILL`.
- **Fix:** `InstanceStatus.outOfMemory?: boolean`, from Docker's `State.OOMKilled`, in Task 3 (sitting 2 already edits `runtime/driver.ts`,
  the fake and the driver contract); the fake's `crash(id, exitCode, { outOfMemory })`. No spec action: `status` is unchanged and §11 does
  not define `InstanceStatus`'s fields (`exitCode` was added the same way, P4b Task 13). Task 1 measures that a container killed at its
  memory ceiling reads `OOMKilled: true` on this Docker Desktop.

**I6. B makes one spec sentence false, and anchors Spec action C in the wrong section.**
- §20's *The edge as a control point* says the custom Caddy image is *"built during `make seed` — **the one image that is built rather than
  pulled**"* (spec l.2088-2089). B builds a second. No spec action covers it.
- The per-IP rate limits are stated in **§20** (*The edge as a control point*, l.2077-2084: *"per-app and per-IP rate limits"*), not in
  §12's *Edge* (l.1332-…), where Spec action C puts its sentence.
- **Fix:** a **Spec action D** (§20: *"… — one of two images built rather than pulled; the other is §24's load generator, built from its
  checksum-verified release"*), decided with C before sitting 2; C's edge sentence moved to §20's *The edge as a control point*, after the
  bullet list. BYOA on the laptop's Spec action C rewrites §20's l.2052-2055 (the per-token limits) — a different paragraph, applied after
  B's.

**I7. Spec action A sweeps the wrong shared pages — and one of the right ones tells a story §24 does not allow.**
- A names `manifest-phases.html` and D29 in `manifest-decisions.html`. Neither names a load rehearsal. The two that do are
  `manifest-schematic.html` (l.347, the large-course choice: *"a rehearsal before launch"*; l.566-571, the test copy's note) and
  `manifest-stories.html` (l.128, l.308).
- `manifest-stories.html` l.104-129 tells **a `class` app** — *"A whole course"*, *"all 240"*, synchronised — doing *"A load rehearsal: 240
  simulated students in sixty seconds"*. The schematic's own choices put 240 in *"One course: Up to about 400 students"* — `class` — and
  §24's table gives `class` no load gate; B refuses it `409 LOAD_REHEARSAL_NOT_NEEDED`. The divergence predates B; B's sweep is where it
  surfaces.
- **Fix:** A's sweep list corrected. **A question for `manifest-coord3`** (Rich's delegation, `028bb94`): *the story's line* — (a) **say
  what a class app gets** (recommended: §24 is the authority, and the story's point — synchronised arrival needs several copies — still
  stands; draft: *"Before launch: two copies of the app running behind one address, so one can stop without anyone noticing."*); (b) make
  the story's app a large course (a larger headcount, a bigger edit); (c) let a `class` app run a voluntary rehearsal (a new profile Rich
  never gave numbers for). B carries (a) as drafted until it is decided.

**I8. Three things A1 learned that B's plan does not carry.**
- **7100 runs the set watcher since `68274fa`**: every `pnpm test:docker` needs 7100 STOPPED (the Docker tier commits docker-driver
  production sets and removes their containers, which 7100 would read as exits and redeploy — ORIENTATION §4's trap 7, TRAPS.md *SET
  WATCHER*). B's Global Constraints say only *"then restart the control plane"*.
- **The classifier refused A1's spec edits AND their commits** (sittings 3 and 4): Rich applied Spec actions A and B himself from staged,
  guarded scripts (`49b9a83`; `3d57fc3` and the schematic's sweep `6eb15e0`). B's *What Rich does* asks him only to *"read and decide"*.
- **The execution method** is still *"whichever Rich chooses"*; A1 and BYOA run inline, one fresh session per sitting.
- **Fix:** all three in B's Global Constraints and *What Rich does*: each spec action staged as one guarded script (edit + page sweep +
  commit) for Rich to run at its sitting's open; inline, one session per sitting, as A1 (for the approval to confirm).

**I9. How a load rehearsal and D21's exclude each other is not designed, and the one-at-a-time lock would hold a pooled connection for
ten minutes.**
- Decision 6 lists `REHEARSAL_RUNNING` (D21's under way) and `LOAD_REHEARSAL_RUNNING` (D21's asked during a load rehearsal) but no
  mechanism. D21's holds `tryWithRehearsalLock(projectId)` on `outerLockPool` for its whole run (`db/locks.ts:96-115`); a load rehearsal
  that only *looked* would race it.
- `tryWithLoadRehearsalLock` *"on a pool of its own"* must be held by the background run for up to ten minutes, and *"its own pool"* is a
  third pool in `db/client.ts` (today `lockPool` and `outerLockPool`, ten each, `:38-40`) that the File Structure does not name. The
  launch path plan's sitting 12 is why nesting outer locks is dangerous.
- **Fix:** **the platform-wide rule as a database invariant** — a partial unique index on `load_rehearsals` for `state = 'running'` across
  the whole table (not per project): an insert that conflicts is `LOAD_REHEARSAL_BUSY` or `LOAD_REHEARSAL_RUNNING` by the conflicting
  row's project, a dead process leaves no lock, and the boot's pass 2⅞ ends every `running` row before `listen`. **The insert runs
  inside the project's `tryWithRehearsalLock`** (brief; `undefined` there is `REHEARSAL_RUNNING`), and **D21's `rehearse` reads the
  `running` row under the same lock** (`LOAD_REHEARSAL_RUNNING`). Lock order: rehearsal lock (outer) → environment lock (inner), never the
  reverse; no new pool. And the run returns `{ row, done }` inside the control plane (the route answers `row`; tests await `done`), as
  `LoadGenerator.start` does.

**I10. Sitting 6 is too big for one session.**
- One `make demo-load` run holds two full rehearsals (a pass and a fall-over), ~8–9 minutes each: ~18 minutes. Three runs on each
  driver is ~2 hours; seven controls more, unless each stops early; then every other demo, `make ci-acceptance`, the clicked half, the
  whole-branch review beside the Docker tier and its fix wave. A1 split the same shape in two (Task 9 alone in sitting 7, Task 10 in
  sitting 8).
- **Fix:** Task 8 in two sittings — **8a** (sitting 6): `make demo-load` green three times on each driver and its controls, with
  `DEMO_LOAD_STOP_AFTER=<step>` for a control's short run; **8b** (sitting 7): every other demo, `make ci-acceptance`, the clicked half,
  the whole-branch review and its one fix wave, the close-out. A control that needs a shorter profile restarts 7100 with its settings and
  restores them on every exit path (`scripts/gateway-controls.sh`'s pattern; the first review's A2 I11). Seven sittings.

### Minor

- **M1. The chain.** A1 took `1.9.0` (`163f42c`), so B is **`1.10.0`** — B says `1.9.0` at ll.58, 96, 199, 830 (and Task 5's header, its
  commit message and the File Structure's `document.ts`). Rich's order since 2026-10-03 15:28, with BYOA placed 2026-10-13 (`0b17f87`,
  `2b3dd6d`): **A1 → B → FE-32 → BYOA on the laptop → Phase 3 → A2**. B's *Successor* (A2, then FE-32), its ORDER bullet (*"→ A2 → FE-32"*),
  *"A2, after this plan, hibernates staging"*, and *What this plan does not build*'s *"A2's, after this plan"* follow it. **FE-32's own
  reason line** (`2026-10-03-fe32-dependencies.md:51`, *"A2, before this one, leaves it `1.10.0`"*) is B's, not A2's. (The BYOA run's
  review, `1fa72d6`, X6.)
- **M2. The spec actions' composition.** §11's interface: A1's A (applied, `49b9a83`), **B's C, FE-32's A, then A2's C** (BYOA changes no
  §11). §26's settings sentence: **B's B, FE-32's C, then A2's B**. §20: B's C and D, then BYOA's C. §24: A1's B (applied, `3d57fc3`),
  B's A, A2's B.
- **M3. `launch:rehearse` is an administrator's too** (`projects/authz.ts:195-209`; `runRehearsal`'s description, `api/routes/launch.ts:651`).
  An administrator acting as no member gives §26's reason (`400 ADMIN_REASON_REQUIRED`). Task 5's matrix gains both rows; Spec action A's
  *"The owner runs it"* → *"The owner or a collaborator runs it — or an administrator, giving §26's reason"*.
- **M4. Spec action B.1's reason is false as worded.** *"It changes what staging runs, past anything a token deploys"* — but a token deploys
  staging (D24's own list). The reason is capacity: the run grants production's capacity, which §24 and D29 make a person's decision
  (*"capacity costs real money"*), and holds staging for its length. D24's sentence after the list gives each person-only action's reason;
  B.1 adds this one's.
- **M5. The image's home.** The generator is created through the Engine API, from the DAEMON's image store (as D21's probe runs
  `curlimages/curl:8.11.1`, `sso/sign-in.ts:77`); the registry holds only what BuildKit `FROM`s. `make reset` wipes the registry and
  re-pushes only `infra/images.txt`'s images (`Makefile:88`, `:119-121`), and `scripts/app-images.sh` sweeps `127.0.0.1:7107/local/`.
  B says *"tagged into the local registry"*. Name it in the daemon (`manifest/vegeta:<version>`), never under `local/`, and have `[M1]`
  confirm `make reset` and the three cleanup scripts leave it.
- **M6. vegeta keeps response BODIES** in its results unless `-max-body` caps them; in a 512 MiB container whose results sit on tmpfs, a
  large `/` fails the generator, not the app. `-max-body=0` in Task 2's attack line, and the tmpfs's size stated.
- **M7. The start signal.** The Engine's archive API cannot write onto a tmpfs mount; an exec of `touch` into the waiting container can.
  Task 2's Step 4 names it rather than leaving it to Step 2.
- **M8. Tests.** The fake driver has no call list (`routeHistory`, `crash`, `vanish`; `runtime/fake-driver.ts:49-97`): the run's order
  test wraps the driver to record calls, as A1's restore test records `restoreRoute`. `shape.test.ts:37-45`'s title *"whatever the audience
  or purpose"* becomes false with B's row — renamed, the row added.
- **M9. `setRateLimitExemption`'s edges.** It runs under staging's environment lock (an archive takes it); a switched-off name stays
  switched off (`servingInstances` answers `[]`); it re-applies exactly the live set and its health policy (the Docker driver applies every
  route with the default 600, `runtime/docker/driver.ts:577-585`, `:807-816`). The route's `rate_limit` handler already carries a zone
  `match` over every address (`routing/caddy.ts:153-164`) — the exemption may be that zone's matcher. `[M4]` records whether
  caddy-ratelimit's counters survive a route PATCH (it decides how Task 3's Docker case counts).
- **M10. An archive mid-run** retires staging and switches it off: the run stops the generator when the set is gone, rather than loading the
  `410` page for minutes, and ends `abandoned`.
- **M11. The `deploy` operation declares `LOAD_REHEARSAL_RUNNING`** (`api/routes/releases.ts:1071`'s errors), and `runRehearsal` too —
  the front-end enablement plan's F19 (a code answered and declared by none). B's Files list `api/routes/launch.ts` only.
- **M12. Gate numbers.** A doctor check for the image moves `EXPECT_DOCTOR` in `scripts/ci-acceptance.sh`, in the same commit.
- **M13. `[M5]`'s scratch `ensureInstances`** against a demo project's live staging route leaves 7100's Route rows naming what no longer
  serves. Use a hostname no project holds, and remove every container.
- **M14. *"The audience raised after launch"* is unreachable through the API** (A1's *What this plan does not build*: nothing changes an
  audience yet); Task 6 tests it at the function by writing the audience, and says so.
- **M15. What the load does not model.** vegeta reuses connections (keep-alive), so 500 arrivals' 500 TLS handshakes are not on the edge.
  Named in *What this plan does not build*.
- **M16. Line drift** in *Read this first* (re-read at `c7e0978`): readiness `:168`/`:198`/`:227-240`; `rehearsal.ts`'s `runRehearsal`
  `:110`, `takeDownLeftRehearsals` `:412`, `rehearsalItem` `:711`; `tryWithRehearsalLock` `db/locks.ts:96`; `rehearsals` `db/schema.ts:1165`;
  the rate limit `routing/caddy.ts:153-164`; `REHEARSAL_RUNNING`'s hint `api/error-codes.ts:641-644`; `withEnvironmentLock` in the deploy
  `release.ts:530`, `listenerFor` `:26`; pass 2¾ `recover.ts:237-242`, pass 3 `:245-264`; `restoreRoute` `runtime/docker/driver.ts:774-818`;
  the client's `fetch` `packages/contract/src/client.ts:49`, `:75`; the candidate is `candidateFor` (not `launchCandidateFor`), reading
  `servingInstanceOf` at `launch/candidate.ts:43`.
- **M17. The vulnerability database.** B's demo launches nothing, but sitting 7's *"every other demo"* does: after 2026-10-16 it needs
  `make refresh-vulndb` first (the network on) and the next build watched (FE-57).

## 3. What A1's sittings 6–8 change under B — re-read at B's Task 1

- **Sitting 6 (Tasks 7, 8b; in progress at 00:34):** `launch/rehearsal.ts` (the set checks, `:378`), which B's Task 5 also edits;
  `launch/candidate.ts` (the candidate read off the set's first HEALTHY member — B's *"the candidate while staging serves N"* rests on
  it); `projects/repository.ts`'s `servingInstancesOf` / `servingInstanceOf`; **the set watcher reading LAUNCHED projects only** (sitting
  5's F12, the working tree at 00:34) — so a load rehearsal, before any launch, is never the watcher's; the fleet's count; the mock's
  production set; the skeleton's error handler and `NODE_ENV=production` (I3); the knowledge pack's rule.
- **Sitting 7 (Task 9):** `make demo-capacity` — `packages/journey/src/capacity.ts` and `scripts/lib/redeploy-loop.mjs` generalised to a
  set; B's demo should reuse its set readers (`journey/src/serving-set.ts`, from sitting 4).
- **Sitting 8 (Task 10):** every launch demo on two instances, `make ci-acceptance`, the whole-branch review's fix wave — any of which may
  move `shapeFor`, `deployReleaseSet`'s answer, `recover.ts`'s passes or the route builder. A1's close names B next (Task 10 Step 4).

**B rests on, and re-reads first:** `shapeFor` (`releases/shape.ts:46-55` — staging returns before any production row, so B's row goes
first); `deployReleaseSet`'s answer for a failed set (I1); `Driver.servingInstances`, `restoreRoute`, `status`; `buildRoute`'s
`rate_limit` handler and `appHealthPolicy` (A1 Decision 4: passive checks never count `503`, so a shedding member stays in rotation — the
rehearsal measures that honestly); `recoverAtBoot`'s order (2¾ then 3, `releases/recover.ts:237-264`); the watcher's production-only,
launched-only read.

## 4. Departures from what Rich approved on 2026-10-03 — for B's approval

Each is the plan's, inside his answers; the revision states each where it is built, and the spec actions carry the ones he reads.

1. **The users-to-rate rule** — 75 a second for 60 s, then 50 for 5 minutes (`synchronised`); 10–50 a minute each (`steady`); three paths on
   arrival, one each 10 s after; no page assets (the first review's I5). Rich approved *"500 virtual users"*; the rule is in Spec action A.
2. **"Answered"** — Rich: *"non-5xx, no timeout"*; B adds *a `429` is not answered* (from his *"a run the generator could not drive fails"*).
   After this review, no per-path rule (I2).
3. **The generator's rate held to nine-tenths** of the rate asked — the plan's number, in Spec action A.
4. **"Instances healthy"** read as healthy throughout, no exit, no out-of-memory exit (I5).
5. **Answered at once and polled** (`202`, the first review's C1).
6. **Staging held** — every other staging deploy refused `409 LOAD_REHEARSAL_RUNNING` while a run lasts.
7. **One at a time across the platform.**
8. **Person-only through D21's capability** (`launch:rehearse`: owner, collaborator, administrator with §26's reason) — Spec action B adds
   it to D24's person-only list.
9. **The exemption as a `Driver` verb** (Spec action C) — the mechanism of his *"Exempt the generator's IP"*.
10. **A second image built here** (Spec action D) — what his *"Build it locally"* makes true of §20.
11. **`class` refused** (`LOAD_REHEARSAL_NOT_NEEDED`), per §24 — and the stories page's class story (I7).
12. **The paths**: `/`, the blueprint's health path, and `/login` for a CWL app (his *"the health path, the root and the sign-in redirect"*).
13. **An 8-minute hard stop; no cancel.**

## 5. Recommendation

**Approve B as revised** — inline, one fresh session per sitting, as A1 — **once `manifest-coord3` has decided I7's story line**, which
blocks nothing before sitting 3 (Spec action A's sweep). Its four spec actions are decided before their sittings (C and D before sitting 2,
A before 3, B before 4) and staged as scripts Rich runs; its one network step (vegeta's download, sitting 2) and its clicked half
(sitting 7) are Rich's.
