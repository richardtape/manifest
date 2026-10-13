# A1 baseline — Task 1's measurements (2026-10-13)

*Measured 2026-10-13, 16:04–16:43 PDT, by `manifest-a1-s1` — the second coordinated run's job S1, the A1 plan's sitting 1
([`../../plans/2026-10-03-production-instances.md`](../../plans/2026-10-03-production-instances.md), Task 1), executed inline (Rich,
2026-10-13 16:01, answer 6, `c0f969e`). HEAD `c0f969e` at the start (`manifest-coord3` committed `1fb75f8` during it). macOS 26.7.1
(25G241), Docker Desktop engine 29.7.2, Node v24.12.0 on the host (v24.21.0 inside the app image), Caddy v2.11.4 (`manifest-caddy:local`,
`sha256:128a37e0…`), load 3.3–9.8 (other sessions working).*

**Nothing under `packages/` changed, and nothing running was touched**: `[M2]` ran in a THROWAWAY Caddy from the edge's own image on its own
network (`a1s1-m2`, ports 7190/7191), removed after; `[M3]` ran in a `--network none` container of a built app image, removed after; `[M4]`
read `docker stats`. Raw output: [`results-task1-2026-10-13.txt`](results-task1-2026-10-13.txt). Probes: [`probes/`](probes/).

## The answers, and what each changes

| | Question | Answer | For |
|---|---|---|---|
| `[M3]` | Does a CWL sign-in cross instances? | **NO — THE PLAN'S STOP FIRED.** An assertion answering an AuthnRequest another process issued is refused **`InResponseTo is not valid`**, both ways; every same-process control signs in. The skeleton sets no `validateInResponseTo`; passport-ubcshib 0.1.7-rc.1 makes that `'always'`; node-saml 5.1.0 keeps request ids in a per-process memory cache and checks them FIRST. **With ONE shared cache passed as `cacheProvider` (one added option, the library unchanged) all four orders sign in and a replay is still refused.** The fork went to Rich (through `manifest-coord3`, 16:23); **he chose the cache in the app's own Mongo, built in sitting 3** (~16:28, `3487e68`). | Decision 9, Task 8a (sitting 3) |
| `[M2]` | Caddy across N | **Decision 4 holds, as written.** Round robin: 9 requests → each of three, three times. The header is EXACTLY the answering instance's bare id: `{http.reverse_proxy.upstream.host}` then a `replace` of `^mf-i-`, still `deferred`; the app's own header does not survive. Every active probe carries `X-Manifest-Probe: health`. A member killed mid-loop: **0 of 391 failed with `try_duration` 3 s, 3 of 391 without** (one hung 3 s). A member answering `503` **stays in rotation**; its control (`503` in the passive list) ejects it. A loop across a PATCH to three FRESH upstreams: **0 of 450 failed, and no answer from the old set after the first from the new**. A WebSocket survives a re-apply that removes its upstream. The drain's `num_requests` survives a PATCH that removes the address. **An edge-made `502`/`503` carries NO `X-Manifest-Instance`.** | Task 2 (its exact JSON below), Task 4, Task 5 |
| `[M4]` | The laptop's memory | Docker's VM: **7,934 MiB, 3,122 used, 4,570 available**; 38 running containers using 2,355 MiB. An idle node-ts-mongo instance: **50–59 MiB of its 512 MiB limit**. Three instances of one app add ~120 MiB idle; their limits, 1.5 GiB; a `class` redeploy holds four for a moment. | Task 5, Task 9 |
| `[M5]` | The gate numbers | **`pnpm test` once: 212 files, 3534 tests, all passed** — equal to `EXPECT_FILES`/`EXPECT_TESTS`; `EXPECT_DOCTOR` 22, `EXPECT_VERIFY` 67, the Docker tier 290/44 (ORIENTATION §2), none re-run. **Contract `1.8.0`** — A1's bump is **`1.9.0`**. **Migration `0054` is free.** | Every sitting |
| `[M1]` | The 15 facts of *Read this first*, at HEAD | **None changed in meaning.** Lines moved (`releases/release.ts` +17 from the lock on). **Not named by it, and now Tasks 4–6's**: six one-route sites in the fake driver; three staging journey readers, `demo-redeploy.sh`'s four comparisons and `redeploy-summary.mjs`; two production Docker-tier readers; the Incident prompt's hard-coded *"failed to start"*. | Tasks 3–7 |

## `[M3]` — a CWL sign-in across two instances

**What the plan asked for, and what ran instead.** The plan's `[M3]` is two containers of the proof app behind a throwaway route, through
the real laptop IdP. The form tried here — a sibling of `reading-updates`' staging container started with that container's environment —
**was refused by the permission classifier, `[Production Reads]`** (16:18; the command copied the running container's environment,
secrets included, into an env-file; it never ran, so no file and no container existed). **Not retried.** `manifest-coord3` judged a
library-level measurement a different action — it reads no app's environment or secrets and touches no running app — and allowed it with
conditions (16:20): only a built image's `node_modules`, `--network none`, a throwaway IdP keypair removed after. That is what ran.

**The code, read in the built image** (`reading-updates`, `sha256:783691867fe9…`, built from the skeleton's lockfile):
- `blueprints/node-ts-mongo/skeleton/auth/ubcshib.js` passes no `validateInResponseTo`, no `cacheProvider` and no
  `requestIdExpirationPeriodMs`;
- `passport-ubcshib` 0.1.7-rc.1, `index.js:123-129` — `normalizeValidateInResponseTo(undefined)` answers `'always'` (*"0.1.6 default was
  `options.validateInResponseTo !== false`"*), set at `:198-200`;
- `@node-saml/node-saml` 5.1.0, `lib/saml.js:92` — `cacheProvider` defaults to `new InMemoryCacheProvider(…)`, per instance of the
  strategy, so per process; `:91` — the ids expire after 8 h; `:513-516` — `validatePostResponseAsync` reads the Response's `InResponseTo`
  and checks it BEFORE any signature; `:633-641` — *"InResponseTo is not valid"* when the cache does not hold it.

**The measurement** (`probes/m3-harness.mjs`, `probes/m3-sp.mjs`): two Node processes, A and B, each an express app whose strategy is built
by the REPOSITORY's `skeleton/auth/ubcshib.js` (mounted read-only), on the image's `node_modules` — passport-ubcshib 0.1.7-rc.1,
@node-saml/node-saml 5.1.0, @node-saml/passport-saml 5.1.1, passport 0.7.0, xml-crypto 6.3.2 — with the same configuration, as two instances
of one app are. A throwaway IdP key signs each assertion (xml-crypto, RSA-SHA256, exclusive C14N); each AuthnRequest's id is read from the
SP's own redirect.

| AuthnRequest issued by | Assertion posted to | Answer |
|---|---|---|
| A | A (control) | `200` signed in |
| **A** | **B** | **`500` — `InResponseTo is not valid`** |
| **B** | **A** | **`500` — `InResponseTo is not valid`** |
| B | B (control) | `200` signed in |
| A | A (control, after the two above) | `200` signed in |
| A, posted twice | A | first `200`; second `InResponseTo is not valid` — the cache is the replay refusal |

**The positive control** (`probes/m3-shared-cache.diff`, `probes/m3-sp-shared.mjs`): the same, with ONE line added to a copy of the
skeleton's `ubcshib.js` — `cacheProvider:` an object both processes share (a directory standing in for the app's Mongo), implementing
node-saml's `saveAsync` / `getAsync` / `removeAsync`. passport-ubcshib passes an option it does not manage straight through. **All five
orders `200`; the replay still refused.**

**Sticky routing, measured as far as the throwaway allows:** Caddy 2.11.4's `cookie` selection policy sets `mf_lb=…; Path=/; HttpOnly;
SameSite=Lax` over plain HTTP. A browser does not send a `Lax` cookie on the IdP's cross-site POST back to the app. Over TLS: not measured.

**What it means.** A faculty app on two instances signs a person in about half the time — whichever instance the IdP's POST reaches must be
the one that sent them. **The same mechanism already breaks a sign-in that is in flight across a REDEPLOY, with one instance** (the new
instance never issued the id) — pre-existing and unrecorded; it follows from the measured mechanism and was not measured through a
redeploy. **The fork was Rich's** (the plan's Decision 9; put to him by `manifest-coord3` at ~16:24) — **he answered at ~16:28, *"I'm
confortable going with your recommendations"*** (`3487e68`): option 1, built in sitting 3 beside Task 4:
1. **The SAML request cache in the app's own Mongo** — Decision 9's recommendation in advance, and this sitting's: one option in the
   skeleton's `ubcshib.js`, a Mongo collection with an 8-hour TTL index on the client `session.js` already holds. Measured to work with the
   library unchanged and to keep the replay refusal; it also closes the redeploy case. A skeleton change every new app inherits (Task 8's
   conditional half). **It must land before sitting 4**: Task 5 puts every launch demo's `class` production on two instances.
2. **Sticky routing by an edge cookie** — Task 2's `selection_policy: cookie`. The cookie above would not ride the IdP's POST unless Caddy
   marks it `SameSite=None` over TLS; it spreads load unevenly and leaves the redeploy case open. Not recommended.
3. *Named only:* `validateInResponseTo: 'never'` turns off exactly the check that refused the replay. Not recommended.

## `[M2]` — Caddy across N, in a throwaway edge

A Caddy from `manifest-caddy:local` (v2.11.4 with caddy-ratelimit and Coraza, the edge's own build) on its own network, its config loaded
from JSON, its admin API on 127.0.0.1:7191 — written with `node:http`, because `fetch` adds an empty `Origin` the admin API refuses (the
trap `routing/caddy.ts:155-178` records). Three upstreams from `node:24-alpine` by the lock's digest, each `probes/m2-upstream.mjs`
answering its own id and forging `X-Manifest-Instance: forged-<id>`, each on the network as `mf-i-<uuid>`. The route is today's
`buildRoute` chain (`probes/m2-route.mjs`) with three changes — every upstream, round robin and Decision 4's health policy, and the header
from the chosen upstream — **and one difference that is the throwaway's alone: the rate limit's `max_events` raised from 600 to 1,000,000**
so a measurement loop at 20 requests a second is not answered `429`. The loop is `probes/m2-loop.mjs` (one request every 50 ms, each
classified by status, header and body); the script that ran (c) to (e) is `probes/m2-run.sh`.

| | What | Result |
|---|---|---|
| (a) | Round robin, three upstreams | 9 requests: each upstream three times, in turn. A 5-s loop: 33 / 33 / 32 of 98 |
| (b) | The header | **EXACTLY the bare id** — `{http.reverse_proxy.upstream.host}` is `mf-i-<id>` (raw, without the `replace`); `.address` is `tcp/mf-i-<id>:8080`. The `replace` with `search_regexp: ^mf-i-` after the `set` leaves `<id>`. ONE value on the response; the upstream's `forged-<id>` gone |
| (c) | Active checks | Every probe carried `X-Manifest-Probe: health` (12, 11, 11 with it; 0 without) |
| (c) | One member `docker kill`ed mid-loop | **`try_duration` 3 s: 0 of 391 failed**, p99 14 ms, max 269 ms. **Without it: 3 of 391** — two `502` at once and one after hanging **3,004 ms** — all within 300 ms of the kill |
| (c′) | A member answering `503` (its `/healthz` `200`) | **Stays in rotation**: 97 of 292 answers were its `503`, spread over the whole 15 s; `fails` 0 |
| (c′) control | The same with `503` in the passive list | Ejected after two; back after the 10-s `fail_duration`; ejected again — 4 of 293 |
| (c′) | A member whose `/healthz` answers `503` too | The ACTIVE check ejects it (Decision 4's `expect_status 200`): 0 of 294 reached it |
| (c″) | A loop across a PATCH replacing the set with three FRESH upstreams (each proved ready privately first, as the driver does) | **0 of 450 failed**; the first answer from the new set at 4.04 s into the loop, the PATCH sent at ~4 s; **no answer from the old set after the first from the new — by request start AND by completion**. Each fresh upstream was probed at provisioning (2 probes in ~8 s at a 5-s interval); whether one counts healthy BEFORE its first probe returns was not separable here |
| (d) | A WebSocket held across a re-apply that removes its upstream, then an unrelated re-apply | **Survived both** (ticks every second from 1 s to 21 s); closed only when its container stopped (`stream_close_delay`, unchanged) |
| (e) | `num_requests` for the drain | 2 / 2 / 2 with six slow requests in flight; **after a PATCH removing one upstream, its address stays in `/reverse_proxy/upstreams` with its 2 in flight**, and leaves when they finish — `drainUpstream`'s signal holds across a set |
| (b′) | A response the EDGE makes | Every upstream unreachable, no health checks: `502`, **no `X-Manifest-Instance`**. With health checks on: **`503`** (*no upstreams available*), **no header**. The readers' *"header absent"* checks still mean *"no app answered"*; a classifier that expects `502` for *"nothing serves"* meets `503` |

**The JSON Task 2 writes** — the two handlers that change (`probes/m2-route-two-upstreams.json` is the whole route; its rate limit there
is the throwaway's):

```json
{ "handler": "headers", "response": {
    "set": { "…": "the four headers as today", "X-Manifest-Instance": ["{http.reverse_proxy.upstream.host}"] },
    "replace": { "X-Manifest-Instance": [{ "search_regexp": "^mf-i-", "replace": "" }] },
    "deferred": true } },
{ "handler": "reverse_proxy",
  "upstreams": [{ "dial": "mf-i-<id>:<port>" }, { "dial": "mf-i-<id>:<port>" }],
  "load_balancing": { "selection_policy": { "policy": "round_robin" }, "try_duration": 3000000000, "try_interval": 250000000 },
  "health_checks": {
    "active": { "uri": "<health_path>", "interval": 5000000000, "timeout": 2000000000, "expect_status": 200,
                "headers": { "X-Manifest-Probe": ["health"] } },
    "passive": { "fail_duration": 10000000000, "max_fails": 2, "unhealthy_status": [502, 504] } },
  "stream_close_delay": 3600000000000 }
```

With `health: 'none'` (A2's waker): no `health_checks` and no `try_duration`/`try_interval` — `try_duration` without health is what (c)'s
second run measured.

## `[M4]` — the laptop's memory

16:19, load 5.72 / 9.75 / 8.05 (other sessions working). The host: 36 GiB, 12 cores, 55% free (`memory_pressure`). Docker Desktop's VM:
`MemTotal` 7.75 GiB; inside it `free -m`: **7,934 total, 3,122 used, 849 free, 3,963 cache, 4,570 available**; swap 475 of 1,024 MiB
used. 38 containers running, **2,355 MiB** between them (LiteLLM 526, qdrant 217, the six app databases 79–128 each). **An idle
node-ts-mongo app instance: 50–59 MiB of its 512 MiB limit** (`reading-updates` and `a8-clocks-1`, each environment's). `launch-app` was not
started (it needs 7100 and a demo); its instance is the same blueprint, so **three instances of one app add ~120 MiB idle over one** — the
database and egress are per environment and shared by the set — **and 1.5 GiB of limits**; a `class` redeploy holds four for its drain.
Room enough for `make demo-capacity`; the limits, not the use, are what a crash-looping phase 5 could reach.

## `[M5]` — the gate numbers

**`pnpm test`, from the repository root, ONCE** (Task 1's step; no code changed in this sitting), 16:25:58–16:42:47, at `manifest-coord3`'s
*"7100 is yours"* and its HOLD (16:25): **Test Files 212 passed (212), Tests 3534 passed (3534)**, 1,006 s (load 3–10; ~17 min, slower than
usual), exit 0. **Equal to `scripts/ci-acceptance.sh`'s `EXPECT_TESTS=3534` and `EXPECT_FILES=212`** — nothing moves. `observability/bus.test.ts`
did not redden (the tracked clock-order defect, now Task 6's). `EXPECT_DOCTOR=22` and `EXPECT_VERIFY=67` read, not run; the Docker tier is
290 tests in 44 files (ORIENTATION §2's row), not owed. **The contract is `1.8.0`** (`api/contract/document.ts:119`,
`packages/contract/package.json:3`, `openapi.json:5`). **The run truncated 7100's tables** — `reading-updates`' rows went, as Rich allowed
(answer 2); its containers, networks, volumes and LiteLLM users are left, his, as `a8-clocks-1`'s are. 7100 was not restarted (PID 2683
answers, as after `manifest-p9`'s run).

## `[M1]` — every *Read this first* fact, re-read

*Read by three read-only surveys (facts 1–7; facts 8–15; an inventory of every caller and header reader) and checked by hand where the record
leans hardest (fact 10 in the built image; the contract's version; the route builder; `registrationInForce`). "Now" is HEAD `c0f969e`. Since
`e969f9d`, where the plan was written, only `db/schema.ts` (below line 518) and `releases/release.ts` changed among the files facts 1–7 cite.*

| Fact | Verdict | Now |
|---|---|---|
| 1 `runtime/driver.ts` | HOLDS | `ensureInstance` :337-347; `servingInstance` :355-356; `listInstances` :357-358; `restoreRoute(id)` :359-365; `retireInstance` :348-354; `switchOff` :374, `removeName` :384; `InstanceSpec` :88-144 (`instanceId` :91-96), no replica field |
| 2 the driver contract, the fake | HOLDS | continuity :384-583; the cases at :400-405, :407-416, :448-457, :492-500; the fake's `routes = new Map<string, string>()` :97, :241, :266-268, :285, :307 — **and six more one-route sites the fact does not name: `:195` (an existing healthy instance), `:249` (the retire guard), `:290` (`switchOff`), `:295` (`removeName`), `:390` (`holdRequest`), `:405` (`dropRoutes`)** |
| 3 the Docker driver | HOLDS | `ensureInstance` :437-579, the dial :442, the private probe :484-489, one upstream :515-521, `waitForIdentity` :530-557, the restore :563-568; `retireInstance` :592-641, its guard :610-621, the drain :220-233; `servingInstance` :653-657 → `containers.ts:149-160` (`found[0]` :157); `restoreRoute` :711-733; `destroyInstance` :751-775, **`.catch(() => undefined)` :772** — and it removes the route **without checking which instance it dials** (the fake checks, `:307`). Alias prefix `names.ts:79`, `instanceAlias` :81-83; set on the container `instances.ts:292` |
| 4 `routing/` | HOLDS | `buildRoute` `caddy.ts:41-135` (one `upstream` :43, one `instanceId` :51, the static header :81, `deferred` :97, `upstreams: [{ dial }]` :100-102, `stream_close_delay` :129); no `lb_policy`, `selection_policy` or `health_checks` anywhere in the repository; `upstreamOf` `routes.ts:141-147` (`[0]` :144); `upstreamsInUse` :262-277; `servingRoute` :181-198 (*"always dials exactly one upstream"* :178-179); `waitForIdentity` `readiness.ts:78-131` (the match :103) |
| 5 the database | HOLDS | `routes` `schema.ts:364-376`, `routes_hostname_key` :375 (created in `0009_outgoing_killer_shrike.sql:13`); `instances` :314-338, a non-unique index :337; `environments` :300-312. **The newest migration is `0053_lumpy_boomerang`; `0054` is free** |
| 6 the deploy | HOLDS, +17 lines | returns ONE `Instance` :220-227; the digest check :286 (`(input.purpose ?? 'launch') === 'launch'`, and again for `recordLaunch` :967); the lock :424; one row :439-449; `previous` :490; services :503-526; the key :643-665 (`ai/keys.ts:182-183`); `ensureInstance` :711-765; the health wait :766 (`waitForHealth` :1215-1239); the rollback :809-826; the upsert on `routes.hostname` :849-857; `destroy_requested` for every other :859-877; `instance.healthy` :956, `recordLaunch` :968. New before the lock: `RELEASE_CWL_NO_ATTRIBUTES` :325-332 (FE-55) |
| 7 retire and recover | HOLDS | `retire.ts`: `serving` :102, the filter :102-107, the skip :93-103, `retireInstanceRow` :202-295. `recover.ts`: pass 0 :70-106, **pass 1 :111-141 (`restoreRoute(route.handle)` :133)**, 2 :143-163, 2½ :165-173, 2¾ :175-181, 3 :183-203 |
| 8 the readers | HOLDS, lines moved | `servingInstanceOf` `projects/repository.ts:300-318` (`.limit(1)` :309, the newest-row fallback :316); callers `project-reads.ts:102`, `:370`; `instances.ts:168`, `:173`; `fleet.ts:61`; `candidate.ts:43`; `ai/models.ts:101` (`classificationFloor`) — no others. `Environment.instance` `environments.ts:23-25`; `InstanceSummary.serving` `instances.ts:49-57`. The console: `project.tsx:342-347`, `deploy.tsx:230`, `:347-350` |
| 9 D21's rehearsal | HOLDS | deploys `rehearsal.ts:205-209` (`purpose: 'rehearsal'`); takes down by `servingInstance === current.handle` :490-491 |
| 10 what a faculty app keeps in memory | **ANSWERED — see `[M3]`** | sessions in the app's Mongo (`session.js:63-73`, connect-mongo 6.0.0); **the SAML request cache in the process** |
| 11 the audience | HOLDS | `schema.ts:102`; read for a decision only by the load-rehearsal item (`readiness.ts:129`, `:168`, `:198`, `:228-229`); shown by `fleet.ts:92` and `representations/projects.ts:289`; every launch demo `class` (`production.ts:279-280`, `launch.ts:516-517`) |
| 12 nothing notices a death | HOLDS | `RestartPolicy: 'no'` `hardening.ts:41-42`; `crashed` `state-machine.ts:12`, `:50-54`, raised by nothing; `status()` `driver.ts:176-186`, `:404`; `gone` `docker/instances.ts:357-358`, `fake-driver.ts:336`; `failed` = exited or `unhealthy` `instances.ts:36-46`. **No timer anywhere**: `status()` is called only by the deploy's `waitForHealth` (`release.ts:1222`), `describeExit` (`incidents.ts:157`) and the instance output read (`instances.ts:237`) |
| 13 the one-id header readers | HOLDS, lines moved; **and more** | `production.ts:366`, `:847`; `launch.ts:1547`, `:1624`, staging `:632`; `releases.ts:282` (called :931, :1068, :1181), `:865`, `:948`, the loop :1042-1058; `redeploy-loop.mjs:42`; `demo-redeploy.sh:94-97`. **Not named — see below** |
| 14 what a deploy answers | HOLDS, lines moved | the operation `api/routes/releases.ts:1070-1087` (*"The instance, healthy or failed."* :1083); the handler :1202-1228; `assertLaunchable` :1200-1201; new: `pendingObject` :1141-1159 (FE-5). Callers of `deployRelease`: the route (`toInstance` :1228) and the rehearsal (`.environmentId` :253, `.state` :275, `takeDown` :292, `.id` :317) |
| 15 more one-route writers | HOLDS, moved | `launch/testing.ts:282-285` (`onConflictDoUpdate({ target: routes.hostname })`); `rehearsal.ts:378` |

**Readers of `X-Manifest-Instance` that fact 13 does not name** — every one added to Task 5's Files before sitting 4, as Step 1 says:
- the deploy's own: `routing/readiness.ts:103` (`waitForIdentity`, its probe :326-348) — Task 2 replaces it with `waitForIdentities`;
- **staging journeys, one id each**: `faculty-ready.ts:582`, `authoring.ts:962`, `github.ts:591` — the class of `launch.ts:632`: staging
  stays one, so each needs only the bare id (Decision 4), which `[M2]` (b) shows it gets;
- **`scripts/demo-redeploy.sh`**: `:258`, `:278`, `:315-316` compare `serving_now` to one id; `:224-225` is a second reader (the asker
  loop, into `asks.log`); `:353-354` requires every instance seen in a window to be one id; and **`scripts/lib/redeploy-summary.mjs`**
  `:55-60`, `:95-105` (one previous instance, one move), `:109`, `:114` — staging, one instance: READ, unchanged in meaning;
- **two production Docker-tier tests that compare one id**: `releases/production.docker.test.ts` `:461-465` and `:567-571` (through
  `askEdge` :317-321) — they break under N if their app's audience gives two;
- one-id readers in other Docker-tier tests (`boot.docker.test.ts:691`, `releases/redeploy.docker.test.ts:380-381`,
  `runtime/docker/redeploy.docker.test.ts:360-361` and `:495`, `routing/listener-split.docker.test.ts:276`, `:311`,
  `routing/readiness.docker.test.ts:111`, `routing/routes.docker.test.ts:296`, `:334`) — staging or route-level; each re-read by the task
  that changes its subject.

**Other writers of `routes`** the plan does not name: deletes by hostname at `launch/rehearsal.ts:380` and `releases/lifecycle.ts:142` (each
removes the whole set — right for both), and by (hostname, instance) at `rehearsal.ts:492-499`; plain test inserts at
`launch/readiness.test.ts:133`, `projects/fleet.test.ts:80`, `releases/recover.test.ts:140`, `releases/retire.test.ts:202`,
`ai/models.test.ts:82` — each still valid under `(hostname, instance_id)`.

**For Task 6** (`[M1]` names them, as its Files ask): the Incident is built by **`captureIncident`** (`observability/incidents.ts:59`),
called once, by the deploy (`release.ts:919`); its prompt by **`incidentPrompt`** (`:128-147`) at READ time (`api/routes/releases.ts:1301`),
whose first line is hard-coded *"The application "<slug>" failed to start in its <kind> environment."* (`:133`) — an exit's Incident needs
its own first line. `describeExit` (`:154-170`) already says *"the process exited with code N"* and *"the instance no longer exists"*. **The
events CHECK is `events_type_known`, and `0053` lists 58 types** (= `EVENT_TYPES`, `events.ts:30`); `instance.exited` is in neither.

**And:** the contract is **`1.8.0`** (`api/contract/document.ts:119`, `packages/contract/package.json:3`, `openapi.json:5`), so A1's bump is
`1.9.0` — the plan's nine mentions corrected at this sitting's close. New since the plan, outside facts 1–15: `ai/app-key-sweep.ts`
(`e27d548`) handles each instance's key by `instanceKeySecretName(instance.id)` (`:112`) — already per instance.

## What was left running, and what was removed

The throwaway Caddy, its six upstreams and its network `a1s1-m2` — removed at 16:34 (`docker rm -f`, `docker network rm`): networks
18 → 18, volumes 57 → 57. The `[M3]`
containers ran with `--rm`; the throwaway keypair was deleted at 16:23. Nothing of `reading-updates` was started, stopped or read beyond
`docker inspect` of its staging container's non-secret settings and a read of its image's `node_modules`.
