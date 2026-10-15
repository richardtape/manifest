# B baseline — Task 1's measurements (2026-10-15)

*Measured 2026-10-15, from 11:27 PDT, by `manifest-b-s1` — the third coordinated run's job B1 (`manifest-coord5`), the load rehearsal
plan's sitting 1 ([`../../plans/2026-10-03-load-rehearsal.md`](../../plans/2026-10-03-load-rehearsal.md), Task 1), executed inline. HEAD
`d2e2cf0d` at the start. macOS 26.7.1 (25G241) on an Apple M3 Pro (12 CPUs, 36 GiB); **Docker Desktop 4.95.0, Engine 29.8.2, `NCPU` 6**
(`docker info --format '{{.NCPU}}'` — Rich's *"keep 6"*, `d2e2d77`), 7,934 MiB for its VM, cgroup v2 (`cgroupfs`), kernel 7.0.14-linuxkit,
`aarch64`; Node v24.12.0 on the host; Caddy v2.11.4 (`manifest-caddy:local`, `sha256:128a37e0…`). Host load 3.1–6.1 while measuring:
P11's LANDING 1 was running `pnpm test` under the coordinator's HOLD, and Rich was on a Zoom call.*

**Nothing under `packages/` changed, and nothing running was changed by `[M2]`, `[M3]`, `[M4]` or `[M7]`**: `[M4]` ran in a THROWAWAY
Caddy from the edge's own image on its own network; `[M7]` and `[M3]` in `--network none` throwaways; `[M2]`'s edge half read a hostname
no app holds, which the edge's staging wildcard answers. Every container and network they made was removed and counted gone. **`[M2]`'s
app half, `[M5]` and `[M6]`'s `pnpm test` ran in the coordinator's 7100 window** (their sections say when). Raw output:
[`results-task1-2026-10-15.txt`](results-task1-2026-10-15.txt). Probes: [`probes/`](probes/). The fact-by-fact re-read, every line
number at `d2e2cf0d`: [`facts-at-d2e2cf0.md`](facts-at-d2e2cf0.md).

## The answers, and what each changes

| | Question | Answer | For |
|---|---|---|---|
| `[M1]` | The 22 facts of *Read this first*, at HEAD | **None changed in meaning.** Two changed in substance: **16** (the skeleton's lines, +1: `/login` `server.js:120`, the ACS `:125`, `/healthz` `:104-111`; the starter's static `/` `:365`) and **17** (the watcher's *launched projects only* is COMMITTED, `59a540f`, `watch.ts:197-203`). **6** moved (`caddy.ts:156-166`). Fact 1's *"`burst` is read only by the checklist"* is wrong — nothing reads `burst` yet. Not in the facts and now later tasks': the journey's set reader is still `4 × N`; `capacity.ts` exports nothing; FE-63's mark | Every task's line numbers; Task 6 (the first reader of `burst`); Task 8a |
| `[M2]` | A container reaches staging through the edge | **Yes, as D21's probe does**: `manifest-platform`, `Dns` `10.89.0.53`, the platform CA; TLSv1.3, verified; `srv0`, `:443`. **Caddy sees the container's own address on `manifest-platform`** (`remote=10.89.0.13`) — no NAT, no proxy header. A skeleton app's staging built after `1d40042`: **`/` `200`, `/healthz` `200`, `/login` `302`** to the IdP with no cookie, and **one `saml_requests` document per `/login`** (0 → 1, an eight-hour TTL) | Task 3 (the exemption keys on that address); Task 2 (`start()` reads it); Decision 4's paths |
| `[M3]` | What the generator meets, offline | `alpine:3.22` held by the lock's digest; its busybox has `sh`, `awk`, `cat`, `base64`, `touch`. The VM: 6 CPUs, 5,176 MiB available with one app's three environments running; an idle skeleton member 45–48 MiB of its 512 | Task 2's Dockerfile and result line; `[M3b]` |
| `[M4]` | A rate limit that skips one address | **The zone's own `match` takes a `not`**, `{"remote_ip":{…every address…},"not":[{"remote_ip":{"ranges":["<addr>/32"]}}]}`: the exempt client sent **1,300 with no `429`**, another was cut at 600. **Counters SURVIVE a PATCH** — identical or changing the zone. `0.0.0.0/0` is accepted and limits nobody. A malformed address: `500`, the old config kept | Task 3's JSON, its Docker case's counting, its negative control (a), its validation |
| `[M5]` | A set in production's shape, given back | Through the driver's own `ensureInstances`, on a hostname no project holds: **the GRANT (one → three at production's resources, the route moved in one change) 3.6 s; the TAKE-DOWN (three → one) 1.4 s**; retires 0.1–0.3 s; each member idle 25–27 MiB, its limits `Memory` 512 Mi and **`MemorySwap` 1 Gi** | Task 4's time budget (the moves are seconds; the load is the ten minutes); the laptop's memory |
| `[M7]` | An out-of-memory exit | **`exited` / `137` / `OOMKilled: true`** — and a plain `SIGKILL` is `exited` / `137` / **`false`**: only the flag tells them apart. **Two surprises: `OOMKilled` is STICKY and is set on a container still RUNNING** (a child killed under the init); **an app may use swap equal to its memory** (`MemorySwap` unset → twice `Memory`) | Task 3's mapping; Task 4's `judge`; Task 8a's fixture |
| `[M3b]` | What vegeta sustains here (sitting 2) | **Every rate it was asked, to two decimals: 10.03 … 400.04 a second, 0 errors**, p95 ≤ 3.7 ms through a throwaway Caddy (no limit) to a throwaway app; the generator at 400/s used 15.8 % of a CPU and 15 MiB. **Spec action A's peak is 75/s** — about a fifth of what was measured | Task 2 (no stop for Rich); Task 4's judge (a generator-bound run should not happen on this laptop); Task 8a |
| `[M6]` | The gate numbers | **`pnpm test` once: 231 files, 3756 tests, all passed** — equal to `EXPECT_FILES`/`EXPECT_TESTS` since P11's LANDING 1 moved them during this sitting (224/3691 → 231/3756, `355f612`); `EXPECT_DOCTOR` 22, `EXPECT_VERIFY` 67; the Docker tier 305 / 0 skipped / 44 files (ORIENTATION §2, not re-run). **Contract `1.9.0`** (`document.ts:130`, `openapi.json`, 76 operations) — so this plan's is **`1.10.0`** | Every later gate |

## Findings for the later sittings

Each was measured or read here; none is decided here. The sitting that owns it rules on it, with the plan's spec as the authority.

- **F1 — Spec action D's words were false as drafted — RE-WORDED BY RICH, 2026-10-15 ~11:45 (`624deb66`), applied at sitting 2's
  open.** §20 (spec l.2089) says the edge's image is *"the one image that is built rather than pulled"*, and D would have made it *"one of
  two"*. **`make seed` already builds five**: `infra/seed/seed.sh:17` runs `$COMPOSE --profile github build`, and `infra/compose.yaml`
  builds `manifest-dnsmasq:local` (`:23-24`, `:45-46`), `manifest-caddy:local` (`:88-89`), `manifest-egress:local` (`:191-192`),
  `manifest-idp:local` (`:274-275`) and `manifest-github-fake:local` (`:380-381`) — all five in the daemon now. Put to `manifest-coord5`
  at 11:42 with three options; it verified the premise and put it to Rich, who chose (a), *"yes I am happy to go with your
  recommendation"*: D's words are now *"…built during `make seed` — the platform builds its own images rather than pulling them where it
  must (this one, its resolver, egress proxy and IdP), and builds §24's load generator there too, from its release binary,
  checksum-verified."* (the plan's Spec action D carries them). `infra/caddy/Dockerfile:1` says what the spec did (a comment, Task 2's to
  sweep).
- **F2 — `OOMKilled` is sticky, and set on a RUNNING container** (`[M7]` case (c); Task 3, Task 4's `judge`). Under the init every app
  runs with, a process the app starts that hits the ceiling is killed, the container keeps running and `/healthz` keeps answering —
  with `State.OOMKilled: true`, which stays `true` after an exit `0`. Task 3's mapping table has only `exited` rows; it should add
  `{ Status: 'running', OOMKilled: true }`. *Recommendation:* `outOfMemory: true` whatever the state, and `judge` fails the run on it
  as *"an instance ran out of memory"* — under the profile, a member that lost a process to its ceiling did run out of memory.
- **F3 — an app container may use swap equal to its memory ceiling** (`[M7]`; Task 8a; recorded, not this plan's to change). The driver
  sets `HostConfig.Memory` and leaves `MemorySwap` unset (`runtime/docker/hardening.ts:28`), which Docker reads as twice `Memory`; the VM
  has 2 GiB of swap. The kill came at 104 MiB for a 64 MiB ceiling (48 MiB with swap off). For the rehearsal, a member that swaps under
  load is slow before it is killed — the p95 rule sees it first; and Task 8a's fixture, if it ever falls over by memory, must allocate
  past TWICE its ceiling. Whether apps should have swap at all is §12's hardening, not B's.
- **F4 — staging and production resolve to the SAME resources unless the manifest says otherwise** (Task 4's Docker case, Task 8a).
  `spec/resolve.ts:113-117` layers the blueprint's defaults, the manifest's `resources`, then `environments[kind].resources`; the
  node-ts-mongo blueprint's defaults are 0.5 CPU, 512 Mi, 256 pids, 2 Gi (`blueprints/node-ts-mongo/blueprint.yaml:57-61`), and the proof
  app sets no `environments`. So *"staging back at its own resources (`docker inspect`'s `HostConfig.Memory`)"* — Task 4's
  `load.docker.test.ts` and Task 8a Step 1 — **is a check that cannot fail** for an app with no `environments` block: the grant and the
  take-down read the same number. *Recommendation:* Task 4's test app and Task 8a's `fixtures/load-app/manifest.yaml` set
  `environments.production.resources.memory` to a value staging does not have (and the negative control proves the check can go red).
- **F5 — caddy-ratelimit's counters survive every PATCH** (`[M4]` T3, T4; Task 3). A zone's count is kept across a config reload, even
  one that changes the zone's `match`. Task 3's Docker case cannot count *"after the last PATCH"*: the limited client starts fresh (a new
  address) or its count includes what it sent before. And the exempt address's requests are never counted, so after
  `setRateLimitExemption(hostname, null)` it starts at zero — the *"limited again"* half sees 600 then `429`.
- **F6 — Caddy refuses a malformed address with `500` and changes nothing** (`[M4]` T7; Task 3): *"invalid IP address: 'not-an-address'"*,
  the previous config still serving. The verb should validate the address before it writes, so a refusal is the driver's own, with its
  code, not the admin API's text.
- **F7 — the exemption keys on the generator container's own `manifest-platform` address** (`[M2]`; Tasks 2 and 3).
  `{http.request.remote.host}` at the edge is that address exactly; Task 2's `start()` reads it from `/containers/{id}/json`,
  `NetworkSettings.Networks["manifest-platform"].IPAddress`. A request from the host arrives as `10.89.0.1`, the network's gateway.
- **F8 — the journey's set reader still waits `4 × N`** (`packages/journey/src/serving-set.ts:42`; Task 8a). The platform's own identity
  check moved to `16 × N` in A1's fix wave (`routing/readiness.ts:109`, `745def2`) because under live traffic `4 × N` missed a member
  about 1 in 65 at three. B's demo reads sets through the edge; any read made while the generator loads must not use `seeEveryMember`'s
  window as it stands.
- **F9 — `packages/journey/src/capacity.ts` exports nothing** (Task 8a): its set readers (`environment()`, `exactlyTheSet()`,
  `productionAppContainers()`, …) are private. Task 8a extracts what it reuses into an exported module (`serving-set.ts` or beside it)
  rather than copying it.
- **F10 — nothing reads an audience's `burst` yet** (fact 1; Task 6). `loadRehearsalItems` keys on `audience?.scale` alone
  (`launch/readiness.ts:229`); `burst` is stored and echoed only (`api/routes/projects.ts:299`, `:391`). Task 6's item is its first reader.
- **F11 — where the generator's image and container live** (Task 2). A daemon image named `manifest/vegeta:<version>` is left alone by
  `make reset` (it removes `^mf-` containers, networks and volumes and wipes the registry — never a daemon image, `Makefile:83-129`) and by
  all three cleanup scripts (`app-images.sh` selects only `127.0.0.1:7107/local/`, `:51`, `:74-75`; the other two touch no image). **A
  generator CONTAINER named `mf-…`** would be removed by `make reset` (`Makefile:107`) and counted by `dead-app-resources.sh` as the
  app's (`name=^mf-${app}-`, `:78`). `scripts/doctor.sh` checks images by its lists (`images.txt` against `images.lock`, `:366-378`;
  the registry's bases, `:406-440`; `manifest-github-fake:local` built, `:450-456`) and does NOT check `manifest-caddy:local` — so a doctor
  check for the generator's image is a new check, and `EXPECT_DOCTOR` moves with it.
- **F12 — two stale comments** (whoever next edits the file): `runtime/docker/driver.ts:572-574` still says the passive checks count
  *"dial failures, `502` and `504`"* (`745def2` removed that); `releases/shape.ts:10-11` says `'replacement'` is *"passed by nothing until
  the watcher exists"* (the watcher passes it since `68274fa`, `src/index.ts:464`). Task 4 edits `shape.ts`.
- **F13 — FE-63 (for `manifest-coord5`'s placement at sitting 4's open)** — see *FE-63* below.
- **F14 — `pgrep -fl` printed a running Vitest's environment, a session token included, into this record's raw output** — caught by a
  scan before anything was staged; the four lines are removed from the results file, which says so where they were. Vitest sets
  `process.title`, and on macOS `ps` then reads on into the environment strings beside the title (measured with a harmless variable; a
  TRAPS.md entry). Process counts here are `pgrep -f … | wc -l`.

## `[M1]` — the 22 facts, at `d2e2cf0d`

Read by a fresh read-only agent and spot-checked by this sitting (facts 1, 6, 14, 15, 16, 17 and 20 against the code, and §G's five
images); the whole table — every fact's lines, the decisive code and its verdict, and §§A–N — is
[`facts-at-d2e2cf0.md`](facts-at-d2e2cf0.md). **Since `c7e0978` none of `releases/release.ts`, `releases/shape.ts`, `releases/recover.ts`,
`launch/rehearsal.ts`, `launch/readiness.ts`, `db/*`, `runtime/driver.ts`, `runtime/docker/*`, `runtime/fake-driver.ts`,
`api/error-codes.ts`, `api/routes/releases.ts`, `src/index.ts` or the cleanup scripts has changed.** What did:

| Fact | At `c7e0978` | At `d2e2cf0d` | By |
|---|---|---|---|
| 6 | `routing/caddy.ts:153-164` | **`:156-166`** (the handler; `max_events` `:163`) | `745def2` (+3, the health policy's comment) |
| 8 | passive checks never `503` | **no `unhealthy_status` at all** (`caddy.ts:96`, `:231-234`): only dial and transport failures eject; identity `16 × N` (`readiness.ts:109`) | `745def2` |
| 16 | `server.js:119` / `:124` / `:103-110`; `proof-app/server.js:363` | **`:120` / `:125` / `:104-111`; `:365`** — the error handler's import; `errors.js:23-39`, mounted last (`server.js:160`); `ENV NODE_ENV=production` (`Dockerfile.tmpl:51`) | `1d40042` (A1 Task 8b) |
| 17 | `watch.ts:191-193`; launched-only in a working tree | **`:197-203`, `isNotNull(projects.launchedAt)` at `:201`, COMMITTED** — a staging set and an unlaunched project's production are never the watcher's; a replacement failing before it starts anything (not a `ReleaseError`) is retried by the next pass (`:540-551`) | `59a540f`, `745def2` |
| 3 | `candidate.ts:43` | same; **`servingInstanceOf` is the set's first HEALTHY member** (`projects/repository.ts:339-344`, `:350-355`) and `candidate.ts:54` answers nothing unless it is `healthy` — committed | `59a540f` |

**Lines the plan had slightly wrong at `c7e0978` already** (files unchanged since): `tryWithRehearsalLock` is `db/locks.ts:96-117`;
`restoreRoute` is `runtime/docker/driver.ts:774-816`; the fake's `crash(id, exitCode?)` signature is `fake-driver.ts:58` (`:51` is
`markHealthy`); `samlRequestCache` is `ubcshib.js:77-110`; the set watcher is created at `src/index.ts:453` and STARTED at `:471`;
`src/index.ts:13` imports `routing/` too (`createCaddyClient`, the boot's composition) beside `release.ts:26` and `rehearsal.ts:16`.
**Fact 22, precisely:** the fake keeps one call list, `destroyedEnvironments()` (`:79-84`), and `routeHistory` records a `restoreRoute`'s
route indistinguishably from a deploy's move — there is no list of `restoreRoute`, `ensureInstances` or `retireInstance` calls, so Task
4's recording wrapper stands.

**Held exactly** (same lines): `shapeFor` `shape.ts:46-55`, its staging answer first `:51-52`, read only at `release.ts:504-510`;
`shape.test.ts:37-45` and `:58-68`; a failed set ANSWERED (`release.ts:962-988` caught, `:1280-1283` returned — every member `failed`,
the previous set restored only if the route had moved, one Incident `cause: 'deploy'`, the new keys revoked); `DeployInput`
`release.ts:185-229`, no `instances` or `resources`; the boot's passes (`recover.ts:54-276`: 2¾ at `:242`, 3 at `:259-264` — **pass 2⅞
goes between `:242` and `:244`**); the probe `sso/sign-in.ts:77`, `:112`, `:265-311`, bound at `src/index.ts:370-376`; the pools
`db/client.ts:38`, `:40`; `REHEARSAL_RUNNING`'s *"up to about two minutes"* (`error-codes.ts:641-644`); `deploy` at
`api/routes/releases.ts:1071`, 19 declared codes `:1088-1125`; `launch:rehearse` person-only (`authz.ts:203-211`, `:207`), stepped up
(`:274`), the owner's and so the collaborator's and administrator's (`:466-467`); the item `readiness.ts:168`, `:198`, `:228-241`
(`not_built` `:236`); `InstanceStatus` `runtime/driver.ts:176-186` with **no `OOMKilled` read anywhere in `packages/`**; the make-seed
build of the edge (`seed.sh:17` → compose; `manifest-caddy:local`, daemon only, never pushed).

## `[M2]` — a container reaches staging through the edge

### The edge's half (11:33, no app touched)

A throwaway `127.0.0.1:7107/base/node:24-alpine` container, as `sso/sign-in.ts` runs its probe (`:265-283`): `manifest-platform`, the
platform resolver `10.89.0.53` as `Dns`, the platform CA (`infra/ca/manifest-root.crt`) mounted read-only, `CapDrop ALL`,
`no-new-privileges`, read-only root, `NODE_EXTRA_CA_CERTS` at the CA (`probes/m2-edge.sh`). **The hostname is one no app holds**
(`b-s1-m2.staging.manifest.internal`), so the edge's `*.staging.manifest.internal` site answers it (`infra/caddy/Caddyfile:201-206`) — and
that site, like `edge.manifest.internal`'s (`:170-173`), echoes `remote={remote_host}`: **the source address Caddy sees, read without
touching any app, route or row.**

| | Answer |
|---|---|
| The container's address | **`10.89.0.13`** on `manifest-platform` (`10.89.0.0/24`) |
| The name resolves to | **`10.89.0.10`** — `manifest-caddy` on `manifest-platform` |
| TLS | **TLSv1.3, verified against the platform CA**; SAN `*.staging.manifest.internal`, issuer *"Caddy Local Authority - ECC Intermediate"*; SNI the hostname |
| `GET /` | **`200`** `manifest OK host=b-s1-m2.staging.manifest.internal scheme=https remote=10.89.0.13 listener=internal`, 40 ms (the next name 3 ms) |
| The listener | **`srv0`, `:443`** (`listener=internal`; the live edge's `srv0` listens `[":443"]`, `srv1` `[":8443"]`) |
| The same name on `:8443` | `200`, EMPTY body: no site on the public listener matches a two-label name |

### The app's half (11:46, `manifest-coord5`'s choice under Rich's delegation, 11:47)

**muddiest-point's STAGING** — W5B's walk app, done with at 11:36 — a node-ts-mongo skeleton app whose image (`sha256:de9e1919…`) was
built **2026-10-15 10:44 PDT, after `1d40042`** (A1's error handler and `NODE_ENV=production`): its image carries `NODE_ENV=production`
and `/app/errors.js`. The same throwaway container as above, `redirect: 'manual'`; the `saml_requests` count read before and after by
`mongosh` run INSIDE the staging DB container, its credentials expanding there and never printed (`probes/m2-app.sh`). Nothing of its
production or its repository was touched; the one `/login` left one document, which expires by itself.

| Path | Status | Time | What came back |
|---|---|---|---|
| `/` | **`200`** | 298 ms (the first, cold) | 2,252 B, the starter's static page; no cookie |
| `/healthz` | **`200`** | 16 ms | `{"status":"ok","mongo":true}` — the Mongo ping (`server.js:104-111`) |
| `/login` | **`302`** | 56 ms | to `https://idp.manifest.internal/module.php/saml/idp/singleSignOnService` (`SAMLRequest`, `SigAlg`, `Signature`) — the laptop IdP, not followed; **no cookie set** (`saveUninitialized: false`) |
| `saml_requests` in `muddiest_point` | **0 → 1** | | **one document per `/login`**, TTL index **28,800 s** (eight hours) |

Every answer carried `X-Manifest-Instance: 97d7ecec-…`, staging's one member. **What it decides:** Decision 4's three paths answer
below `500` unloaded — `/` `200`, `/healthz` `200`, `/login` `302`, all *answered* by Decision 8's rule; **each `/login` is one Mongo
insert in the app's own database** (fact 16), so the synchronised profile's ~6,500 `/login`s (a third of its requests) leave ~6,500
documents that expire eight hours later — the record says how many it sent; and `/login` sets no cookie, so vegeta's requests carry no
session state between them.

## `[M3]` — what the generator will meet, offline

- **`alpine:3.22`**: `infra/images.lock:5` pins `sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce` (`infra/images.txt:6`
  lists it); **the daemon holds it by that digest** (`alpine:3.22`, the multi-platform index, 26.2 MB as listed; `127.0.0.1:7107/alpine:3.22`
  beside it, and the mirror's `127.0.0.1:7107/base/alpine:3.22` at a different digest, `sha256:2c9d26f4…`, 13.3 MB — a single-platform copy).
  Task 2's `FROM` takes the lock's digest. Alpine **3.22.5**, `aarch64`.
- **Its busybox** (v1.37.0): `sh`, `awk` (`/usr/bin/awk`), `cat`, `base64`, `touch`, `sleep`, `sed`, `wc`, `tr`, `date` — every applet
  Decision 3's last line needs, all the one busybox binary; an `awk` fold over a CSV line and `base64` run, not just found. The image runs
  as root by default (Task 2 adds its non-root user).
- **The laptop's headroom** (11:32, P11's `pnpm test` running, Rich on a Zoom call): host load **5.72 / 4.49 / 4.60** on 12 CPUs; host
  memory *"free percentage 56%"*, host swap 6.47 of 8 GiB used. **Docker's VM: 6 CPUs, 7,934 MiB, 5,176 MiB available, its own load
  0.94**; 23 containers running — the platform's ten, the three protected (and `mongo-express`), and one app's three environments
  (`muddiest-point`, not this sitting's: a `class` app, two production members) — each idle skeleton member **44.8–47.7 MiB of its 512
  MiB**, each app's Mongo 105–250 MiB, LiteLLM 556 MiB, qdrant 1.0 GiB. The top host consumers: Docker's VM process 108% CPU, Zoom 47%,
  Vitest 31%. **What vegeta sustains here is `[M3b]`, Task 2's, after its download.**

## `[M4]` — a rate limit that skips one address (a throwaway Caddy)

A THROWAWAY Caddy from the edge's own image (`manifest-caddy:local`, `sha256:128a37e0…`, **Caddy v2.11.4**, `http.handlers.rate_limit`)
on its own network (`b-s1-m4-net`, `10.99.4.0/24`), no published port; the route exactly as `routing/caddy.ts`'s `buildRoute` writes
its `request_body` → `rate_limit` → `reverse_proxy` chain (the `headers` handler left out — it plays no part), its upstream a
`static_response` on the same Caddy; clients `curlimages/curl:8.11.1` containers at fixed addresses, each sending over one keep-alive
connection; every change a `PATCH /id/m4-route`, the verb the platform's `patchRoute` uses. The live edge was never touched. Removed after,
network included (`probes/m4-ratelimit.sh`). **8 s** end to end.

| Test | What | Answer |
|---|---|---|
| T1 | today's route — the zone's `match` every address — one client, 700 in a minute | **600 × `200`, 100 × `429`** |
| T2 | the zone's `match` given a `not` of `10.99.4.21/32` | **PATCH `200`**; the exempt client **1,300 → 1,300 × `200`**; another, 700 → **600 / 100 × `429`** |
| T3 | **counters across a PATCH of an IDENTICAL route**: 400, PATCH, 400 from one client | **200 × `200`, 200 × `429`** — the count SURVIVED |
| T4 | **counters across a PATCH that CHANGES the zone** (the exemption cleared): 400, PATCH, 400 | **200 / 200** — SURVIVED; the formerly exempt client then sends 700 → **600 / 100**: limited again, its exempt 1,300 never counted |
| T5 | the exemption as a bare address (`10.99.4.21`, no `/32`) | accepted, and exempts |
| T6 | **Task 3's negative control: the exemption `0.0.0.0/0`** | **accepted (PATCH `200`)**; a fresh client's 700 → all `200`; a client limited in this window → `200` again. Nobody is limited |
| T7 | an exemption that is not an address | **PATCH `500`** — *"…provision http.matchers.remote_ip: invalid IP address: 'not-an-address'…"* — and the previous config keeps serving |

**The JSON Task 3 writes** — the zone's `match`, and nothing else in the route changed (the handler order, the key, the window and the
count as they are; no new handler, no subroute — the plan's fallback was not needed):

```json
"rate_limits": { "<routeId>": {
  "match": [{ "remote_ip": { "ranges": ["0.0.0.0/0", "::/0"] }, "not": [{ "remote_ip": { "ranges": ["<address>/32"] } }] }],
  "key": "{http.request.remote.host}", "window": "1m", "max_events": 600 } }
```

Caddy reads it back with its own key order (`not` first): a test comparing the route Caddy HOLDS with the one written compares parsed
JSON, never text. F5 and F6 above are what it decides for Task 3.

## `[M5]` — a set in production's shape, given back

12:37–12:38, in the coordinator's window (no Vitest running; host load 4.5), from a scratch script calling the **Docker driver's own
`ensureInstances`** (A1's) — the compiled control plane (`dist/`, built 09:30, after the last `src` change at 02:01) under Node 24's
type stripping, through `dockerDriverForTests` (`runtime/docker/testing.ts`: the real daemon, registry and edge) with a database URL
that points nowhere (nothing here reads one; the routing module's import demands it) — **on a hostname NO project holds**,
`bs1-m5.staging.manifest.internal`, so 7100's Route rows never named what it moved (`probes/m5-set.ts`). The image is the fixture-node
skeleton (`blueprints/fixture-node`, no database), built by the driver with its scan; each instance at production's resolved resources
(node-ts-mongo's defaults: 0.5 CPU, 512 Mi, 256 pids, 2 Gi — staging's are the same, F4). The sequence is the run's: staging's one
instance; the GRANT — three new instances of the same release, the route moved to exactly them in one change, the old one retired; the
TAKE-DOWN — one new instance, the route moved, the three retired. Everything removed by name after (containers with their volumes, the
egress proxy, the route, the app network, the image).

| Step | Time | Read back |
|---|---|---|
| build (the driver's `buildImage`, with its scan) | 20.8 s (19.3 s and 35.9 s in two earlier runs, the first cold) | `127.0.0.1:7107/local/bs1-m5@sha256:7dd880f7…` |
| 0. staging's own shape, one instance | **1.9 s** | `servingInstances` = the one |
| 1. **the GRANT** — three at production's resources, the route moved | **3.6 s** (4.2 s in the run before) | `servingInstances` = **exactly the three new ids** |
| the one before retired (`drainMs` 5,000, nothing in flight) | 0.1 s | |
| each member's limits | | `Memory` **536870912** (512 Mi), **`MemorySwap` 1073741824** (1 Gi — F3, on containers the driver made), `NanoCpus` 500000000, `PidsLimit` 256 |
| each member, idle | | **25.1–26.7 MiB** of 512 (the fixture skeleton; a node-ts-mongo skeleton idles at 45–48, `[M3]`) |
| the VM with three serving | | `MemAvailable` 5,041,684 kB (5,024,572 before): three idle members move nothing measurable |
| 2. **the TAKE-DOWN** — one at staging's resources, the route moved | **1.4 s** (1.4 s before) | `servingInstances` = the one new id |
| the three retired | 0.3 s | `listInstances` = the one |

**What it decides:** the run's grant and take-down are seconds, not minutes, for a small app — the ten-minute budget is the load's, not
the moves'; a node-ts-mongo app's start-up (its Mongo ping) adds to each. **Three idle members are ~150 MiB of a 4.8 GiB headroom; their
CEILINGS are 1.5 GiB of memory and another 1.5 GiB of swap** — what three members can take under load before they are killed. Two probe
defects on the way, both mine, both recorded in the probe's comments: fixed ids must differ in their first eight characters
(`instanceName` names a container by the release's and the instance's first eight, `runtime/driver.ts`), and `retireInstance` takes the
driver's HANDLE id (the container's name) — given an instance's uuid it finds nothing and answers at once.

## `[M7]` — an out-of-memory exit, as Docker reports it (fact 15)

Throwaway containers of `node:24-alpine` (the app image's base, `sha256:ebfe2f90…`), each with the app containers' own hardening
(`runtime/docker/hardening.ts`: read-only root, a `/tmp` tmpfs, `CapDrop ALL`, `no-new-privileges`, a pids limit, **`Init: true`**,
`Memory` and NO `MemorySwap`), `--network none`, a **64 MiB** ceiling, a Node loop allocating 8 MiB of `Buffer`s every 20 ms; removed
after (`probes/m7-oom.sh`). Docker Desktop 4.95.0, Engine 29.8.2, cgroup v2.

| Case | `State.Status` | `State.ExitCode` | `State.OOMKilled` | Note |
|---|---|---|---|---|
| (a) **an app container's shape**: init as PID 1, node its child, past the ceiling | `exited` | **137** | **`true`** | logged 104 MiB before it died (F3) |
| (b) the same with no init (node PID 1) | `exited` | 137 | `true` | 112 MiB |
| (c) init + a shell whose node CHILD hits the ceiling; the shell lives on, then exits `0` | `running`, then `exited` | **0** | **`true` — while running, and after a clean exit** | F2: the flag is sticky |
| (d) init + `docker kill -s KILL`, under the ceiling | `exited` | **137** | **`false`** | a kill is not out of memory |
| (e) init + `docker stop` | `exited` | 143 | `false` | |
| (f) as (a) with `MemorySwap` = `Memory` | `exited` | 137 | `true` | killed at 48 MiB |

`HostConfig.MemorySwap` read back as **`134217728`** — twice the 64 MiB `Memory` — on every case but (f). **Only `State.OOMKilled` tells
(a) from (d)**, so `InstanceStatus.outOfMemory` is that flag, never the exit code — Task 3's negative control (b) is right as written.

## `[M6]` — the gate numbers

`scripts/ci-acceptance.sh`: **`EXPECT_TESTS=3691`** (`:346`), **`EXPECT_FILES=224`** (`:347`), **`EXPECT_DOCTOR=22`** (`:350`),
**`EXPECT_VERIFY=67`** (`:355`). ORIENTATION §2's Docker-tier row: **305 tests, 0 skipped, 44 files** (305/305 in 1502.7 s at 6 CPUs,
the gentler tiers' sitting 3; not re-run here — nothing here owes it). **Contract `1.9.0`**: `api/contract/document.ts:130`
(`CONTRACT_VERSION`), `packages/contract/package.json:3`, `packages/contract/openapi.json` `info.version`, **76 operations** — so this
plan's Task 5 takes **`1.10.0`**.

**HEAD moved to `355f612` during the sitting** (P11's LANDING 1, `manifest-coord5`'s window before this one): `EXPECT_TESTS` 3691 →
**3756** and `EXPECT_FILES` 224 → **231** (`scripts/ci-acceptance.sh:350-351` now; `EXPECT_DOCTOR` 22 at `:354`, `EXPECT_VERIFY` 67 at
`:359`) — the `admin-ui` project and the mock's demo fleet.

**`pnpm test` once** (12:14–12:32, in the coordinator's window, `scripts/test-gently.sh` at utility, no call assertion held): **Test
Files 231 passed (231), Tests 3756 passed (3756)** — equal to the `EXPECT_` lines at `355f612`; 1,093.97 s; *"test-gently: load (1-min)
min 2.25 / median 3.40 / max 5.69 over 37 samples 30 s apart; QoS utility, timeout scale 5, gate 12, forced no; exit 0"*. The slow list's
head: `source/github/driver.test.ts` 94.7 s, `api/launch.test.ts` 67.7 s, `api/agents.test.ts` 63.7 s, `api/delegation.test.ts` 49.9 s.
**Once, not twice**: nothing any gate covers changed in this sitting (its only code is `probes/`, outside every package and Prettier's
remit, and `eslint` over it is clean) — A1's sitting 1's ruling, the same shape.

## FE-63 — what a replacement mark on `InstanceSummary` or `Incident` would touch

*For `manifest-coord5`, who places it at sitting 4's open (its GO, 11:27). A list, not a design.* FE-63 (manifest-app
`docs/api-findings.md:2040-2059`, MIN11) asks that the instance or its Incident say it is a replacement — e.g. `purpose: 'replacement'` —
beside FE-62's event field (Task 5), in `1.10.0`, additive; today a replacement's failed deploy is `cause: 'deploy'`, as a person's is.

- **The stored mark already exists, on the INSTANCE**: `instances.replacing` (`db/schema.ts:347-349`), written for every member of a
  replacement set (`releases/release.ts:588-589`) and read by the watcher's count (`watch.ts:150-156`). **So the instance's mark needs no
  migration**, and an Incident's can be DERIVED by the join `listIncidents` already makes (`observability/incidents.ts:115-127` selects
  `{ ...incidents, releaseId: instances.releaseId }` — `instances.replacing` would be one more column). A stored `incidents` column instead
  would be a migration (`db/schema.ts:1404-1438`), `captureIncident`'s input (`observability/incidents.ts:35-50`) and both its callers
  (`release.ts:1134-1139`, which passes no `cause` today; `watch.ts:450-455`).
- **`incidents.cause`** (`db/schema.ts:1428-1436`) is `deploy | exit | exit_stopped` — no replacement value; adding one would change an
  enum the front end already switches on, which is not additive in spirit.
- **The representations**: `api/representations/instances.ts` — `Instance` (`:5-34`) and `toInstance` (`:37-47`, which does not map
  `replacing` today; a field there also changes the `deploy` answer and `Environment.instance(s)`), or `InstanceSummary` alone
  (`:49-58`), filled inline at `api/routes/instances.ts:173-176`; `api/representations/incidents.ts` — the schema (`:5-43`), `toIncident`
  (`:55-71`) and its row type (`:56`).
- **FE-62's half, already Task 5's**: `incident.opened`'s strict schema (`observability/event-schemas.ts:319-328`, no `cause` today), its
  example (`observability/examples.ts:74`), its two publishers (`release.ts:1145-1163`, `watch.ts:461`); a replacement's deploy events via
  `detailOf` (`release.ts:599-605`) and the `instance.*` schemas.
- **The contract and the mock, in the same step**: `document.ts:130` and its notes, `packages/contract/package.json:3`, the generated
  `openapi.json` and `schema.d.ts`, `docs/api/events.md` and the reference; the mock's fixtures typed by the schema
  (`packages/mock/src/fixtures.ts`: the instances `:126`–`:235`, `INCIDENTS` `:654-670`), `server.ts:461`, `script.ts:296`.

## `[M3b]` — what vegeta sustains here (sitting 2, 2026-10-15, `manifest-b-s2`)

*Task 2's Step 2, the measurement Task 1 could not make before the image existed. 12:57:28–13:00:04 PDT, under
`manifest-coord5`'s HOLD (no Vitest anywhere, 0 `vitest` processes; AC power; no Zoom assertion until after it ended).
Probe: [`probes/m3b-vegeta.sh`](probes/m3b-vegeta.sh); raw output: [`results-m3b-2026-10-15.txt`](results-m3b-2026-10-15.txt);
each rate's `vegeta report -type=json`, WHOLE, is `packages/control-plane/src/launch/load-fixtures/report-<rate>.json` (Task 2's
unit tests read them).*

**vegeta v12.13.0** (`manifest/vegeta:12.13.0`, built by `infra/seed/build-vegeta.sh` from the release's `linux_arm64` archive,
sha256 `950381173a55…` — equal to the release's checksums file AND GitHub's own asset digest), in a container hardened exactly as
`launch/load.ts` creates it (CapDrop ALL, `no-new-privileges`, read-only root, results on a tmpfs, 256 pids, 512 MiB, no swap),
**against a THROWAWAY Caddy** from the edge's own image (v2.11.4, TLS from its own internal CA, **no rate limit**) on its own
network, fronting a throwaway Node app that answers the three paths as a skeleton app does a stranger ([M2]: `/` 200 with ~2.2
KB, `/healthz` 200, `/login` 302) with no database behind it — so nothing behind the edge is the slower side. The live edge, 7100
and every app untouched; every container and the network removed after, counted gone. 30 s per rate, the three paths round
robin, `-timeout=10s`, `-redirects=-1`, `-max-body=0`, one keep-alive pool.

| Asked | Achieved (vegeta's `rate`) | Requests | Codes | p50 | p95 | p99 | max | Generator mid-run | Edge | App |
|---|---|---|---|---|---|---|---|---|---|---|
| 10/s | **10.03/s** | 300 | 200 × 200, 302 × 100 | 2.5 ms | 3.7 ms | 5.5 ms | 6.1 ms | 1.5 % CPU, 8.6 MiB | 1.5 % | 0.9 % |
| 50/s | **50.03/s** | 1,500 | 200 × 1,000, 302 × 500 | 2.1 ms | 3.3 ms | 4.3 ms | 10.2 ms | 6.4 %, 9.9 MiB | 9.8 % | 2.8 % |
| 100/s | **100.03/s** | 3,000 | 200 × 2,000, 302 × 1,000 | 1.6 ms | 2.7 ms | 3.5 ms | 8.1 ms | 8.9 %, 12.5 MiB | 14.4 % | 4.5 % |
| 200/s | **200.03/s** | 6,000 | 200 × 4,000, 302 × 2,000 | 1.1 ms | 2.4 ms | 4.5 ms | 109.5 ms | 13.7 %, 13.8 MiB | 24.7 % | 9.1 % |
| 400/s | **400.04/s** | 12,000 | 200 × 8,000, 302 × 4,000 | 0.6 ms | 1.3 ms | 2.9 ms | 33.9 ms | 15.8 %, 15.5 MiB | 25.0 % | 11.6 % |

**0 errors at every rate. Host load 3.84 before, 3.37 after** (12 CPUs; the VM 6). **Spec action A's profile peaks at 75 a
second** (`synchronised`'s arrival minute) — **the generator reaches it with about five times the headroom measured here and a
sixth of one CPU at 400**, so sitting 2's stop-and-ask does not fire: the numbers stand as Rich approved them. A result is ~260 bytes
on the tmpfs with `-max-body=0` (2,589 bytes for ten), so the synchronised profile's ~19,500 requests are ~5 MiB.

**What it does not measure**: an app's own ceiling (Task 4's Docker case and Task 8a's fixture), and the real edge's route (with
its headers and health checks) — the latter measured the same day by `load.docker.test.ts`'s composed case: **through a real route
on the live edge, exempted by the Docker driver's verb, 750 requests at 30 a second all answered (p50 1.9 ms, p95 2.8 ms, p99 4.0
ms); not exempted, 600 answered and 150 refused `429`** (`d33d950f`).

## The machine, left as found

Read at 12:40 with `docker`, `psql` and `curl` (`results-task1-2026-10-15.txt` has the commands' output). **Docker: 31 containers (23
running), 15 networks, 49 volumes — exactly the 11:29 snapshot**; images 54 → **52**: `scripts/app-images.sh --apply` removed two dead
`muddiest-point` images (not this sitting's; the cleanup rule's), and every image this sitting built was removed by its own probe (0
`bs1-m5` tags). Every throwaway (`b-s1-*` containers, `b-s1-m4-net`, the `bs1-m5` set, its egress proxy, network and route) is gone. The
registry keeps the three `local/bs1-m5` pushes until `make reset`, as every Docker-tier build's. **7100: restarted from `.env`** (G4,
12:38: `{"source":"github","capableModel":"unchanged","gatewayModels":[{"name":"ubc-qwen-27b","state":"unchanged"}],"secretsScrubbed":16}`),
**one call** to `default-chat-large` at 12:39 → `200`, **`llm_provider-x-litellm-model-name: gpt-6.1-sol`**, **`x-litellm-attempted-fallbacks:
0`**, through `ai-gateway.apps.ltic.ubc.ca`; **0 projects, 0 instances, 0 routes** (LANDING 1's and `[M6]`'s truncations). The three
cleanup scripts, bare: `dead-app-resources.sh` — **0 dead networks, 0 dead volumes**, 17 orphaned driver-2 mirrors named (`muddiest-point`'s
among them, new since its rows were truncated; never removed by the script); `litellm-orphans.sh` — **refused itself** (*"4 app
container(s) exist and NOT ONE yielded an LLM_API_KEY hash"*: muddiest-point's, an app with no models), nothing changed; `app-images.sh` —
2 dead, removed by `--apply` as above. `muddiest-point`'s containers (W5B's walk app, its rows truncated) are left as they are: the
coordinator's to clear.
