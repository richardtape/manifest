# A fresh review of four plans: FE-32, A1, B and A2 (2026-10-03)

> **What this is.** A read-only review by a fresh background agent of `manifest-94`, at Rich's word (~14:09 PDT, *"Fresh reviewer
> first"*). It covers the four plans `manifest-c7` wrote that afternoon. The plans were read at `f6b3d83`, and no code changed after
> `e969f9d`. `manifest-94` spot-checked the most serious findings against the code (`packages/contract/src/client.ts:73-75`,
> `scripts/demo-redeploy.sh:43`, `TRAPS.md:55`, and the FE-32 plan's l.496), and each holds. **The fixes are not yet applied.** By
> Rich's word (~14:33), a FRESH platform session revises the plans to this review, because the agents that wrote them were long in
> context.
>
> **Rich's answers to the four questions it raised (~14:33 PDT, through the question tool; `2026-09-30-decisions.md`):**
> - **A1, a dead member: *"Replace it automatically"*** (over the recommended *"Report it"*, and *"Record as not built"*). The
>   platform starts a replacement when an instance of a production set exits. The plan must handle a crash-looping app, for example
>   with a backoff and a cap that then reports, and must say how.
> - **A2, term start: *"Wake them at term start (Recommended)"*.** When `MANIFEST_TERMS` says a term begins, asleep class production
>   apps are woken.
> - **B, vegeta: *"Build it locally (Recommended)"*.** The image is built from the already-mirrored alpine plus vegeta's official
>   release binary, verified against its published checksum. The download is a Rich-step at that sitting.
> - **Who revises: a fresh session**, started by Rich when `manifest-94` asks.
>
> The plans, all in this directory:
> - `2026-10-03-fe32-dependencies.md` (FE-32);
> - `2026-10-03-production-instances.md` (A1);
> - `2026-10-03-load-rehearsal.md` (B);
> - `2026-10-03-hibernation.md` (A2).
>
> The order is FE-46/47/5 → A1 → B → A2 → FE-32.

---

## 1. A1 — production instances (`2026-10-03-production-instances.md`)

**Summary.** Production runs 1/2/3/3 instances by audience behind one round-robin, health-checked edge route.
- `routes` becomes one row per (hostname, instance), and the Driver handles a set (`ensureInstances`, `servingInstances`,
  `restoreRoute(ids)`).
- Deploy, retire and boot work across N. D21's rehearsal stays at 1. The knowledge pack gains a no-state-in-memory rule.
- Contract 1.8.0, in 6 sittings. Acceptance: `make demo-capacity`, every launch demo on two instances, and a clicked half.
- Spec actions: A (§11, the Driver handles a set) and B (§24, exactly 1/2/3/3).

**Verdict: approve with the fixes below.**

*Important*
- **I1. The `X-Manifest-Instance` header's meaning changes, and the plan doesn't list its readers.**
  - Decision 4 (plan:175-179) sets the header from the upstream host, which is `mf-i-<id>`, not `<id>`
    (`runtime/docker/names.ts:80`).
  - Under round robin, a single request no longer names "the" instance.
  - These readers compare one response's header to one id: journey `production.ts:366` and `:811`, `launch.ts:1269` and `:1346`,
    `releases.ts:282`, `:847` and `:930`, `scripts/demo-redeploy.sh:94-97` (`serving_now`), and `scripts/lib/redeploy-loop.mjs:42`.
    None is in the File Structure (plan:247-261).
  - **Fix:** make the header exactly the instance id. Change every reader to check that every id of the set is seen within k
    requests, and list those files.
- **I2. The claim that `make demo-redeploy` is green on two instances is false** (plan:229-230, :460).
  - demo-redeploy is staging-only (`APP_URL` is staging, demo-redeploy.sh:43; its keys are `mf-$PROJECT_ID-staging`, :116), and A1
    keeps staging at 1.
  - **Fix:** demo-capacity must carry P4c's whole witness across two instances: a signed-in asker, nobody signed out, and no
    failed request.
- **I3. Task 5's negative control cannot fail** (plan:400-401).
  - The retirer targets `listInstances − serving` (`releases/retire.ts:102-107`), not the rows' state, and the Docker guard
    protects route members.
  - **Fix:** assert the rows' states, or make the control "only the first new member routed".
- **I4. The health-check policy needs care.**
  - Decision 4 (plan:175-180) makes passive `unhealthy_status` include 503, so an app briefly shedding load is ejected, and its
    load cascades onto the siblings.
  - Caddy's health state is per dial address and shared (this bites A2; see the cross-plan section).
  - [M2] doesn't measure whether fresh upstreams are healthy in the first seconds after a PATCH.
  - **Fix:** passive checks on dial errors, 502 and 504 only, plus `lb_try_duration` retries on dial failure. Add to [M2] a request
    loop across a PATCH to a fresh set with checks on, expecting zero failures.
- **I5. A dead member is routed around but never replaced or recorded.**
  - App containers have `RestartPolicy: 'no'` (`runtime/docker/hardening.ts:42`), and nothing polls them.
  - Review Focus 2's "the instance reads failed" (plan:231-233) is written by nothing.
  - **Rich decided: replace it automatically** (above). The plan must design the replacement: who notices, its backoff and cap, and
    the event.
- **I6. What the deploy answers with N instances is unspecified.** `deployRelease` returns one `Instance` (`release.ts:225`), and
  clients compare `DEPLOYED.id` to the header. **Fix:** state what the operation answers.

*Minor*
- **Spec action timing.** Spec action B is decided before sitting 5, but `instancesFor` builds the counts in Task 5 (sitting 4).
  Decide it before sitting 4.
- **Stale spec words.** Spec action A leaves §11's *Redeploys* stale: spec l.1197-1203 still say "`ensureInstance` starts…" and
  "refuses to retire the instance that is serving". §12 l.1287 says "the instance it started". Sweep them too.
- **A swallowed error.** Task 4 rewrites `destroyInstance`. Drop the swallowed `.catch(() => undefined)` at
  `runtime/docker/driver.ts:772`.
- **The retirer's skip.** Decision 7 must keep "nothing serves → skip" (`retire.ts:93-103`) as "empty set → skip". A2's asleep
  environments rely on it.
- **Callers [M1] must list.** `launch/testing.ts:265-267`'s `onConflictDoUpdate({target: routes.hostname})` becomes a `42P10` error
  after Task 3, and `launch/rehearsal.ts:378` reads one serving instance.
- **A tie-break.** `Environment.instance`, "the newest of the set", needs one, because every member comes from the same deploy.
- **Sizing.** Sitting 6 (every demo on two instances, three runs per driver, the review and the Docker tier) is likely more than
  one session.

## 2. B — the load rehearsal (`2026-10-03-load-rehearsal.md`)

**Summary.** The owner's or a collaborator's person-only, stepped-up `POST …/load-rehearsal`.
- Staging is redeployed in production's N-instance shape.
- A pinned, mirrored vegeta runs through the edge, with the generator's IP exempt for that run.
- A run passes at ≥99% answered, p95 < 2 s and instances healthy, and is recorded in `load_rehearsals`.
- Staging is given back in a `finally` and at boot.
- Contract 1.9.0, in 5 sittings. Acceptance: `make demo-load` and a clicked half.
- Spec actions: A (§24, with the numbers) and B (D24's person-only list, §26).

**Verdict: needs rework.** Decision 7 must become asynchronous, Decision 5's mechanism needs a Driver verb with its spec action,
and staging must be excluded from other deploys during a run. The rest stands.

*Critical*
- **C1. A synchronous 8–10-minute operation cannot be called by Node clients.**
  - Decision 7 answers when the run is over (plan:180-181), but Node's global `fetch` (undici) waits at most 300 s for response
    headers.
  - The journey uses global fetch with no dispatcher (`packages/contract/src/client.ts:73-75`), and so, almost certainly, does the
    faculty front-end's server. As designed, `make demo-load` cannot pass.
  - **Fix:** answer `202` with a `running` record and poll `getLoadRehearsal`, as builds do. That row is also what the boot needs
    (I6).

*Important*
- **I2. The rate-limit exemption needs a Driver verb, yet the plan says no new Driver method is needed** (plan:32-33).
  - Task 4 consumes `applyRoute`'s exemption (plan:435), but only the Docker driver applies routes; outside it, `routing/` is
    imported only for `listenerFor` (`release.ts:20`, `rehearsal.ts:16`). The fake driver's call-list test also needs a
    Driver-level call.
  - **Fix:** add a Driver verb (exempt and clear, by hostname) and draft its §11 spec action. `restoreRoute` already rebuilds a
    plain route (`driver.ts:711-733`) and can be the boot half.
- **I3. Staging is unlocked during the run.**
  - `withEnvironmentLock` covers each deploy only (`release.ts:407`). A token's staging deploy mid-run replaces the granted set
    and drops the exemption, and the take-down then silently reverts it.
  - **Fix:** refuse staging deploys (`409`) while a load rehearsal holds the project, or abort the run and skip the revert.
- **I4. vegeta's image provenance.** **Rich decided: build it locally** from the mirrored alpine plus vegeta's official release
  binary, checksum-verified (above). That also gives the multi-phase run the shell it needs (plan:381-384).
- **I5. The users-to-rate rule is the plan's, not Rich's.**
  - Rich approved "500 virtual users". The plan converts that, with a 10-second think time, to 75 then 50 requests per second, and
    loads no page assets. That rule alone decides pass or fail.
  - **Fix:** state the rates and the 10 s explicitly in Spec action A for Rich's words.
- **I6. The boot cannot find a run left behind.**
  - The record (Decision 9) has no state and is written at the end. The boot test hand-writes "granted staging and an exempting
    route" (plan:447-448), and `recover.ts` isn't in the File Structure.
  - **Fix:** insert the row as `running` before the grant, and run a boot pass before pass 3 (`recover.ts:196`).
- **I7. Sitting 3 (Task 4) is too big for one session.** **Fix:** split it into two sittings.

*Minor*
- **The `instances` override** is missing from Task 4's Files and its narrowness test (plan:419-421, :452). Better: derive the count
  and resources from `purpose` inside `deployRelease`.
- **Spec action B's timing.** It is decided "before sitting 4", but Task 4 builds the person-only route in sitting 3.
- **The ORDER bullet** (plan:90-91) omits A1 and A2.
- **A failed take-down's record** must never meet the checklist item.
- **A wrong hint.** `REHEARSAL_RUNNING`'s hint, "up to about two minutes" (`api/error-codes.ts:619-622`), is wrong for a load
  rehearsal.
- **Getting results out.** Per-path 3xx classification and the whole-run p95 need per-request results out of a read-only
  container whose results sit on tmpfs. Say how, e.g. stdout and `vegeta report` over all the `.bin` files.
- **Scale but not burst.** The item compares scale but not burst.
- **A control that may fail for the wrong reason.** Task 3's "drop the matcher's argument" may produce a config Caddy refuses.
- **The demo's candidate.** `FALL_OVER` set as a secret doesn't change the digest, so the demo must build a new candidate.

## 3. A2 — hibernation and wake-on-request (`2026-10-03-hibernation.md`)

**Summary.** S4 is Task 1.
- `idlePolicyFor` replaces the unused `IDLE_POLICY`: solo after 24 h; class after 24 h outside `MANIFEST_TERMS`; large_course and
  public never; staging after 7 days.
- Idleness is measured from the edge's counters.
- Hibernating moves the route to a waker, then stops the set and its Mongo. The waker is joined per app, capped and queued.
- Deploys wake an app, archives don't, and the boot keeps an asleep app asleep.
- Contract 1.10.0, in 5 sittings. Acceptance: `make demo-hibernate` and a clicked half.
- Spec actions: A (§11's production lifetime by audience, plus S4's answer) and B (term dates as a §24/§26 setting).

**Verdict: needs rework** (C1, C2, I3–I7). **Rich added** (above): wake asleep class production apps at term start.

*Critical*
- **C1. A1's route shape breaks the waker route.**
  - The hibernated route keeps "the same @id, its rate limit and headers" (plan:304-305). Under A1's active checks, the edge probes
    the health path every 5 s, which reaches the waker and wakes every asleep app.
  - A1's passive `unhealthy_status` 503 trips on the holding page, which is a 503. Caddy's health state is per dial address and
    shared, so one app's holding pages eject the waker for every asleep app. Caddy then answers its own bare 503, with no
    `Retry-After` and no page.
  - **Fix:** the waker route gets no health checks and no passive policy (or a per-app dial address), the waker ignores marked
    probes, and the header names the waker.
- **C2. "Held" cannot work as written.**
  - In the held mode the waker "proxies it once the set is healthy" (plan:146-148). But the waker lives in the host-run control
    plane, which cannot reach container IPs (spec l.2169; `TRAPS.md:55`).
  - A stand-in waker in a container on [M4]'s throwaway network would pass for a reason the real one doesn't share.
  - **Fix:** run the stand-in on the host, reached at `host.docker.internal`. "Held" then means either Caddy proxies after the
    waker's blocking answer, or a hairpin back through the edge, which puts every held request in the host's per-IP 600/min bucket
    and loses the client IP.

*Important*
- **I3. New Driver verbs, and no spec action for them.** "Existing verbs" (plan:30-31) is false.
  - There's no verb to stop a service: only `destroyService`, and `ensureService` starts a stopped one
    (`runtime/docker/services.ts:33`).
  - There's no verb to route a hostname to a waker: `switchOff` is the 410 page.
  - **Fix:** draft both as §11 spec actions.
- **I4. "Wake" is ambiguous.** "`ensureInstances` with the release last served" either reuses the stopped containers (which needs
  an identical spec, or it meets `INSTANCE_SPEC_CHANGED`, `runtime/docker/instances.ts:190-206`) or deploys fresh (new keys and
  rows, and through the approval gate). **Fix:** pick one.
- **I5. Boot pass 2 runs before the plan's mid-wake handling.** Pass 2 turns every `waking` row into `failed` (`recover.ts:29`,
  `:150-161`; `state-machine.ts:59-63`), and `failed` has no path back to `hibernated`, so Task 5's "finished or put back asleep"
  never gets a chance.
- **I6. A crash mid-hibernation leaves broken routes.**
  - Decision 4 moves the route, stops the containers, then writes `slept_at`. A crash in between leaves no record, and boot pass 1
    restores a stopped set, which answers 502s.
  - **Fix:** write the intent and its event row first, in one transaction, then route, then stop.
- **I7. A failed deploy to an asleep environment loses its route.**
  - The rollback reads `servingInstances`, which is empty on a waker route, and `destroyInstance` removes the route with its last
    member.
  - The hostname falls to the wildcard, not back to the waker, and the stopped set is orphaned.
- **I8. Class apps are cold at the start of term.** **Rich decided: wake them at term start** (above).
- **I9. The waker cannot tell the edge by its address.** "Refusing any source but the edge's" (plan:327-328) is unworkable: the
  edge reaches the host at `host.docker.internal` (Caddyfile:69), and the control plane listens on 127.0.0.1 (`index.ts:462`).
  **Fix:** a secret header that the route sets and strips from clients.
- **I10. Idle sampling needs both signals.** Caddy's per-upstream `num_requests` is an in-flight gauge
  (`routing/caddy.ts:21-27`), not a counter. Per-host counters reset when the edge restarts, and a reset must count as activity.
  **Fix:** use the counters plus the gauge (for held streams).
- **I11. The acceptance changes boot-time settings.** It shortens the thresholds and sets `MANIFEST_TERMS`, which means restarting
  the control plane (and that signs everyone out). It must restore them on every exit path.

*Minor*
- **Spec action A's timing.** Its item 1 is built in Task 2 (sitting 2) but decided "before sitting 3".
- **A false claim.** "Never while … a load rehearsal holds the environment (the lock)" (plan:139) is false: B holds staging's lock
  only during its deploys.
- **A try-lock.** "Skipped this round" needs one (`withEnvironmentLock` blocks, `db/locks.ts:31-36`), and `db/locks.ts` isn't in
  Files.
- **Sandboxes.** §24 also says sandboxes hibernate; name that as not built.
- **Wrong counts.** `IDLE_POLICY` is at `state-machine.ts:97-109`, and four plans run before this one, not three.
- **Held streams.** Hibernating doesn't drain held streams before stopping, as the retirer does.

## 4. FE-32 — dependencies and the allowlist (`2026-10-03-fe32-dependencies.md`)

**Summary.** `POST …/dependencies/resolve` (`source:write`, mintable).
- The Driver resolves a `package-lock.json` from a blueprint-declared `Resolve.tmpl`: a full install, scripts off, `--no-cache`,
  in the rootless `--internal` builder through Verdaccio, keeping the committed lock. It never commits.
- Three refusal codes.
- §12's allowlist is a platform-setting file plus the skeletons' own dependencies, enforced by the operation and the build gate
  (`409 DEPENDENCY_NOT_ALLOWED`).
- Contract 1.11.0, in 5 sittings. Acceptance: `make demo-authoring` extended with `marked`.
- Spec actions: A (§11/§12, `Driver.resolveDependencies`), B (§25, the descriptor's `dependencies` block) and C (§12/§26, the
  allowlist made concrete).

**Verdict: approve with the fixes below.**

*Important*
- **I1. The allowlist can be bypassed.**
  - `directDependencies` reads only the keys (plan:496-497). These all get past it:
    - an alias, `"express": "npm:evil@1"`;
    - `overrides`, which the skeleton itself uses;
    - a `file:` or `git+` specifier with code committed alongside;
    - a hand-written lockfile that maps an allowed name to another tarball.
  - **Fix**, at both doors: refuse direct and override specifiers that aren't plain registry ranges, check override targets
    against the list, and have the gate check that each lockfile entry's `resolved` (under `node_modules/<n>`) names `<n>`.
- **I2. New lockfile entries will point at the internal mirror.**
  - Their `resolved` URLs will name `http://manifest-verdaccio:4873/…`. Today's lockfiles say `https://registry.npmjs.org/`.
  - `make seed`'s warm loop runs on the host with npm's default `replace-registry-host` (`infra/seed/seed.sh:66-77`). It fails
    with ENOTFOUND, `|| echo WARN` swallows it, and a clean machine is never warmed. The lockfile isn't portable either.
  - **Fix:** [M2] records the `resolved` hosts, and the recipe or driver normalises them to registry.npmjs.org (or omits them).
- **I3. Negative control (b) cannot fail** (plan:444-445). [M2] and Task 2 use a package already in the mirror, so the tarball count
  doesn't move either way. **Fix:** assert the fetches from `npm --loglevel http` lines in the build log (seed.sh's own method), or
  record it as "cannot fail".

*Minor*
- **Spec action B's wording.** It omits `format: npm`, which Task 4 relies on. Its "the platform names no package manager"
  contradicts the npm reader Task 4 adds to the control plane.
- **Spec action A's wording.** Its "keeping every pin" says more than the plan builds; Review Focus 2 says "unless the new one's
  ranges force a change".
- **The build gate's refusal** should put `DEPENDENCY_NOT_ALLOWED` on `Build.error`. Say so.
- **The network.** With it on, every resolution refreshes metadata from npmjs through Verdaccio's uplink
  (`infra/verdaccio/config.yaml:9-13`), so "never sends the live Verdaccio to npmjs" (plan:236-237) can't hold online. Have [M2]
  pin an exact cached version.
- **Small errors.** `readText` is `readTextIn` (`source/reading.ts:244`), and "Two plans will have run" (plan:304) should be five.
- **The Docker case.** The plan doesn't say how Task 2's Docker case points the real builder at the throwaway mirror.

## Cross-plan

1. **Route shape.** A1's per-route health checks and its upstream-derived header conflict with A2's waker route. A1's route builder
   should take a health policy, which A2 sets to none.
2. **§11's Driver interface.** Four plans change it: A1 drafts its spec action and FE-32 its own, but B and A2 need verbs and draft
   none. Sequence all four spec actions together.
3. **`recover.ts` passes.**
   - A1 changes pass 1 to restore sets.
   - B needs a take-down pass before pass 3.
   - A2 needs asleep environments routed to the waker in pass 1, and changes pass 2's handling of `waking`.
   - Fix the order now.
4. **`deployRelease`'s shape per purpose.** A1 (a count by audience, the rehearsal at 1), B (production's count and resources on
   staging) and A2 (wake on deploy; a failed deploy restores the waker) all change it. Use one `shapeFor(kind, purpose, audience)`,
   not three override paths.
5. **Staging's one-instance invariant.** A1's readers rely on it (`launch/candidate.ts:43`), and B breaks it for the length of a
   run. A2 assumes B holds staging's lock, which it doesn't.
6. **§26's settings sentence.** B, A2 and FE-32 each append to it, with stale anchors. All three settings are boot-time
   configuration, not audited as §26 says changes are (a gap that already exists).
7. **Contract versions and migrations.** 1.8.0 → 1.9.0 → 1.10.0 → 1.11.0 is consistent, and the migrations are sequential. Each
   change to the events check must be cumulative.
8. **Spec-action timing.** A1's B, B's B and A2's A item 1 are each scheduled after the sitting that builds them.
