# [M1] — the 22 facts of *Read this first*, re-read at HEAD

**Read at `d2e2cf0d`. HEAD was `d2e2cf0d` when I started and when I finished** (2026-10-15, 11:37 PDT). The plan's lines were read at
`c7e0978` (2026-10-14 00:16). Read-only: nothing in the repository was changed. Paths are `packages/control-plane/src/…` unless they say
otherwise.

**Commits since `c7e0978` that touch a fact's file** (`git log --oneline c7e0978..HEAD -- <file>`; 81 commits in all, most of them docs):

| File | Commits since `c7e0978` |
|---|---|
| `releases/release.ts`, `releases/shape.ts`, `releases/shape.test.ts`, `releases/recover.ts`, `launch/rehearsal.ts`, `launch/readiness.ts`, `projects/authz.ts`, `db/locks.ts`, `db/client.ts`, `db/schema.ts`, `api/error-codes.ts`, `api/routes/releases.ts`, `runtime/driver.ts`, `runtime/docker/driver.ts`, `runtime/docker/instances.ts`, `runtime/fake-driver.ts`, `spec/resolve.ts`, `src/index.ts`, `packages/contract/src/client.ts`, `infra/seed/mirror-images.sh`, `infra/caddy/Dockerfile`, `scripts/app-images.sh`, `scripts/dead-app-resources.sh`, `scripts/litellm-orphans.sh`, `scripts/doctor.sh`, `scripts/verify.sh`, `skeleton/auth/ubcshib.js`, `skeleton/auth/session.js` | **none** |
| `releases/watch.ts` | `59a540f` (A1 sitting 6: launched projects only), `745def2` (A1 sitting 8's fix wave: I2, a non-`ReleaseError` replacement failure retried) |
| `launch/candidate.ts`, `projects/repository.ts` | `59a540f` (the set's first HEALTHY member) |
| `routing/caddy.ts` | `745def2` (passive checks lose `unhealthy_status`) |
| `sso/sign-in.ts` | `1c69a66` (one comment: "three fixture users" → "fixture users"; no line moved) |
| `Makefile` | `a336119` (`make demo-capacity`; the lines the plan cites did not move) |
| `blueprints/node-ts-mongo/skeleton/server.js`, `starters/proof-app/server.js`, `Dockerfile.tmpl`, `skeleton/errors.js` (new), `agents/AGENTS.md` | `1d40042` (A1 Task 8b / I3: the error handler, `NODE_ENV=production`, the knowledge pack's rule) |

---

## The 22 facts

| # | The plan's claim | File:line at HEAD | The code that decides it | Verdict |
|---|---|---|---|---|
| 1 | `shapeFor(kind, purpose, audience)` is the only place a deploy's shape is decided; read only inside `deployReleaseSet`; count from the audience at THIS deploy; resources `release.resolvedConfig[shape.resources].resources` | `releases/shape.ts:46-55`; `releases/release.ts:504-510` (call `:504-508`, resources `:509-510`). Only non-test caller: `release.ts:504` | `const shape = shapeFor(environment.kind, input.purpose ?? 'launch', project.audience as StoredAudience \| null)` | **HOLDS (lines same).** Nuance: *"the audience's `burst` is read only by the checklist"* is not quite true. **Nothing reads `burst` to decide anything.** `loadRehearsalItems` (`launch/readiness.ts:228-229`) keys on `audience?.scale` alone. `burst` is only stored and echoed (`api/routes/projects.ts:299`, `:391`; `api/representations/projects.ts:302`; `api/representations/fleet.ts:102`). The file was unchanged since `c7e0978`, so this was already so then |
| 2 | The item is in both of D9's clauses: launched `:168`, first launch `:198`; the item `:227-240`, `not_built` | `launch/readiness.ts:168` and `:198` (`...loadRehearsalItems(audience),`); the item: doc comment `:227`, function `:228-241`, `state: 'not_built'` `:236` | `if (audience?.scale !== 'large_course' && audience?.scale !== 'public') return []` (`:229`) | **HOLDS (lines same)**; the function closes at `:241` |
| 3 | Staging is one instance, its resources from `spec/resolve.ts:88`; `candidateFor` reads staging's `servingInstanceOf` (`launch/candidate.ts:43`), and since A1's sitting 6 that is the set's first HEALTHY member | `spec/resolve.ts:88`; `launch/candidate.ts:43`; `projects/repository.ts:339-344` (`answeringMemberOf`), `:350-355` (`servingInstanceOf`) | `kind === 'sandbox' ? undefined : spec.environments[kind]` (`resolve.ts:88`); `return set.find((member) => member.state === 'healthy') ?? set[0]` (`repository.ts:342`) | **HOLDS (lines same).** Sitting 6 is now COMMITTED (`59a540f`): `candidate.ts:44-47` adds a comment naming B (*"staging is one instance, and N during B's load rehearsal"*), and `:54` still returns `undefined` unless the answering member is `healthy`. More in §F |
| 4 | `runRehearsal` `:110`, one at a time (`tryWithRehearsalLock`, `db/locks.ts:96-115`, `outerLockPool`, `409 REHEARSAL_RUNNING`); `deployRelease` with `purpose: 'rehearsal'` `:205-209`; `takeDownLeftRehearsals` `:412`; `rehearsals` `db/schema.ts:1165`, `evidence` jsonb; `rehearsalItem` `:711`; hint `api/error-codes.ts:641-644` | `launch/rehearsal.ts:110`, `:115` (`tryWithRehearsalLock`), `:205-209`, `:412`, `:711`; `db/locks.ts:96-117`; `db/schema.ts:1165`, `evidence` `:1189`; `api/error-codes.ts:641-644` | `instance = await deployRelease(deps.db, deps.driver, deps.config, deps.deploy, { …, purpose: 'rehearsal' })` (`:205-209`); hint `'… — up to about two minutes — …'` (`error-codes.ts:643`) | **HOLDS (lines same).** One slip: `tryWithRehearsalLock` runs `:96-117`, not `:96-115`. The file is unchanged since `c7e0978`, so the plan's end line was already two short |
| 5 | The measurement runs in a container through the engine seam (`sso/sign-in.ts:177-311`); bound at boot `src/index.ts:370`; not through the `Driver`; image `curlimages/curl:8.11.1` (`:77`) from the daemon's store | `sso/sign-in.ts:177` (`createCwlSignInProbe`), `:265-311` (`runProbeContainer`), `:77`; `src/index.ts:370-376` | `Image: PROBE_IMAGE` (`:271`); a missing image throws `` `no such image: ${PROBE_IMAGE} — \`make seed\` mirrors it for exactly this` `` (`:285-289`); `DELETE /containers/${id}?force=true&v=true` (`:309`); the LAST log line is parsed (`:208`) | **HOLDS (lines same)** |
| 6 | Every app route carries a per-IP rate limit, 600/min (`routing/caddy.ts:153-164`); the Docker driver applies every app route with the default (`runtime/docker/driver.ts:577-585`, `:807-816`) | `routing/caddy.ts:156-166` (handler object), `max_events` `:163`; `runtime/docker/driver.ts:577-585`, `:807-815` | `max_events: input.rateLimit ?? 600` (`caddy.ts:163`); `RouteSpec` (`routing/routes.ts:25-35`) has no `rateLimit` field, and `applyRoute` (`routes.ts:50-53`) builds with `{ ...spec, routeId }`, so every app route takes 600 | **HOLDS (lines moved: `caddy.ts:153-164` → `:156-166`**, +3 from `745def2`'s `HealthPolicy` comment). `driver.ts` lines same |
| 7 | A container reaches a platform hostname through the edge as D21's probe does (`sso/sign-in.ts:271-283`: platform network, resolver, CA) | `sso/sign-in.ts:275-283` (`HostConfig`) | `NetworkMode: 'manifest-platform'` `:276`, `Dns: [options.dnsServer]` `:277`, `Binds: [\`${ca}:/ca.crt:ro\`]` `:278` | **HOLDS (lines same)** |
| 8 | Only the driver applies a route: outside `runtime/docker/`, `routing/` is imported for `listenerFor` alone (`release.ts:26`, `rehearsal.ts:16`); `restoreRoute` rebuilds a set's plain route (`driver.ts:774-818`), no exemption; `appHealthPolicy`: active every 5 s; passive counts only edge-side failures, NO app status; identity check `16 × N` | `releases/release.ts:26`, `launch/rehearsal.ts:16`, and also `src/index.ts:13` (`createCaddyClient`, the boot's composition); `runtime/docker/driver.ts:774-816`; `routing/caddy.ts:88-100` (`appHealthPolicy`), `:231-234` (passive in the route); `routing/readiness.ts:109` | `passive: { failDuration: 10 * SECOND_NS, maxFails: 2 },` (`caddy.ts:96`), and no `unhealthy_status` anywhere in `buildRoute`; `const window = 16 * expected.size` (`readiness.ts:109`) | **HOLDS.** Lines: `restoreRoute` is `:774-816`, not `:774-818`. Nuance: `src/index.ts:13` also imports `routing/`, to bind the driver; it was unchanged since `c7e0978`. **Stale comment:** `driver.ts:573-574` still says passive checks count *"dial failures, `502` and `504`"*; `745def2` did not update it. **The journey's helper is still `4 × N`:** `packages/journey/src/serving-set.ts:42` has `while (asked < 4 * set.length …)`, so B's demo inherits the old window if it reuses `seeEveryMember` |
| 9 | `launch:rehearse` is person-only (`projects/authz.ts:195-209`), step-up-guarded, held by owner, collaborator and administrator | `projects/authz.ts:195-202` (doc), `PERSON_ONLY` `:203-211` (entry `:207`); step-up set entry `:274`; owner's role entry `:467` | `'launch:rehearse',` (`:207`, `:274`, `:467`) | **HOLDS (lines same)** |
| 10 | The journey's client is `openapi-fetch` over the global `fetch` (`packages/contract/src/client.ts:49`, `:75`) | `packages/contract/src/client.ts:49`, `:75` | `fetch?: typeof globalThis.fetch` (`:49`); `...(options.fetch === undefined ? {} : { fetch: options.fetch })` (`:75`) | **HOLDS (lines same)** |
| 11 | `withEnvironmentLock` wraps each deploy's work (`release.ts:530`) and nothing longer | `releases/release.ts:530` | `return withEnvironmentLock(environment.id, async () => {` | **HOLDS (lines same)** |
| 12 | The boot's passes (`releases/recover.ts:54-276`); 2¾ `:237-242`; 3 `:245-264`; then the set watcher starts (`src/index.ts:453`) | `recover.ts:54-276`; pass ranges in §C; `src/index.ts:453` (`createSetWatcher`), `:471` (`setWatcher.start()`) | `const rehearsalsTakenDown = await deps.takeDownLeftRehearsals()` (`:242`); `for (const environmentId of scheduled) deps.retirer.schedule(environmentId)` (`:264`) | **HOLDS (lines same).** `:453` is where the watcher is CREATED; it STARTS at `:471` |
| 13 | `shapeFor`'s staging answer comes FIRST (`shape.ts:51`); `shape.test.ts:37-45` asserts staging is one *"whatever the audience or purpose"*; `:58-68` is A1's type test | `releases/shape.ts:51-52`; `releases/shape.test.ts:37-45`, `:58-68` | `if (kind !== 'production' \|\| purpose === 'rehearsal') return { instances: 1, resources: kind }` | **HOLDS (lines same)**; both tests quoted in §B |
| 14 | A failed deploy is ANSWERED, not thrown (`release.ts:1280-1283`; `InstanceNotReadyError` caught `:962-988`); throws only when the set never started; D21 reads `instance.state` (`rehearsal.ts:269-275`) | `releases/release.ts:1280-1283`, `:962-988`; `launch/rehearsal.ts:269-275` | `answer: healthy ? set[0]! : set.find((row) => row.id === members[failedIndex]!.id)!,` (`:1282`) | **HOLDS (lines same)**; the full path is in §A |
| 15 | Nothing reports an out-of-memory exit: `InstanceStatus` is `{ id, state, healthy, message?, exitCode? }` (`runtime/driver.ts:176-186`); the Docker mapping reads `Status`, `ExitCode`, `Health` (`runtime/docker/instances.ts:15-47`), never `State.OOMKilled`; the fake's `crash(id, exitCode?)` (`runtime/fake-driver.ts:51-57`) | `runtime/driver.ts:176-186`; `runtime/docker/instances.ts:15-21` (`DockerState`), `:31-48` (mapping), `:351-386` (`instanceStatus`); `runtime/fake-driver.ts:52-58` | `grep -rn OOMKilled packages/control-plane/src` → **0 hits**; `crash(id: string, exitCode?: number): void` (`fake-driver.ts:58`) | **HOLDS.** `instanceStatus` also reads `State.Error` into `message` (`instances.ts:360`, `:374`, `:383`). The fake's `crash` doc is `:52-57` and its signature `:58`; the plan's `:51` is `markHealthy`. The file is unchanged since `c7e0978`, so that was already one line off |
| 16 | The sign-in path is the skeleton's `/login` (`server.js:119`), the ACS a POST (`:124`); hard-coded in the probe (`sso/sign-in.ts:112`); `saml_requests` 8 h TTL (`ubcshib.js:59`, `:77-108`); `saveUninitialized: false`; `/healthz` pings Mongo (`server.js:103-110`); the starter's `/` is static (`starters/proof-app/server.js:363`) | `blueprints/node-ts-mongo/skeleton/server.js:120` (`/login`), `:125` (ACS POST), `:104-111` (`/healthz`); `sso/sign-in.ts:112`; `skeleton/auth/ubcshib.js:59`, `:77-110` (wired at `:135`); `skeleton/auth/session.js:57`; `starters/proof-app/server.js:365` | `app.get('/login', cwl.login)` (`:120`); `app.post('/auth/ubcshib/callback', cwl.callback, …)` (`:125`); `await db().command({ ping: 1 })` (`:106`) | **CHANGED (lines moved).** `server.js`: `/login` `:119` → **`:120`**, ACS `:124` → **`:125`**, `/healthz` `:103-110` → **`:104-111`**, all +1 from `1d40042`'s `import { errorHandler } from './errors.js'` (`:18`). `proof-app/server.js`'s `express.static`: `:363` → **`:365`** (+2, the errorHandler import). `ubcshib.js`: `samlRequestCache` runs `:77-110`, not `:77-108` (the file is unchanged since `c7e0978`). The behaviour is the same |
| 17 | The set watcher reads PRODUCTION only (`releases/watch.ts:191-193`), active projects, its own driver's members; and, in sitting 6's working tree, launched projects only | `releases/watch.ts:197-203` (`.where`), `:201` (`isNotNull(projects.launchedAt)`), `:252` (`eq(instances.driver, deps.driver.name)`) | `.where(and(eq(environments.kind, 'production'), eq(projects.state, 'active'), isNotNull(projects.launchedAt)))` | **CHANGED.** Launched-only is now COMMITTED (`59a540f`), no longer a working tree; lines `:191-193` → **`:197-203`**. The comment at `:191-196` gives the ruling. Also new (`745def2`): a replacement failing before it starts anything, with anything but a `ReleaseError`, is retried by the next pass, not stopped (`watch.ts:540-551`) |
| 18 | The lock pools (`db/client.ts:38-40`): `lockPool` and `outerLockPool`, ten each | `db/client.ts:38`, `:40` (doc `:39`; rationale `:22-37`) | `export const lockPool = new pg.Pool({ connectionString, max: 10 })` / `export const outerLockPool = new pg.Pool({ connectionString, max: 10 })` | **HOLDS (lines same)** |
| 19 | The `deploy` operation (`api/routes/releases.ts:1071`) and its `errors` list | `api/routes/releases.ts:1071`; `errors` `:1088-1125` | 19 codes, listed in §K | **HOLDS (lines same)** |
| 20 | §20 says the edge's image is *"the one image that is built rather than pulled"* (spec l.2088-2089); §20 states the per-IP rate limits (l.2077-2084) | spec `:2077` (`### The edge as a control point`), `:2084` (`per-app and per-IP rate limits`), `:2089` (`the one image that is built rather than pulled`) | — | **HOLDS (lines same; the spec is unchanged since `c7e0978`).** Nuance: in practice `compose build` already builds **five** images, not one (§G), so the spec sentence is already loose |
| 21 | `make reset` wipes the registry and re-pushes only `infra/images.txt`'s images (`Makefile:88`, `:119-121`; `mirror-images.sh`); `app-images.sh` sweeps every tag under `127.0.0.1:7107/local/` | `Makefile:88`, `:119-121`; `infra/seed/mirror-images.sh:14-62`; `scripts/app-images.sh:51`, `:74-75` | `docker volume rm -f manifest-pgdata manifest-registry-data …` (`:88`); `bash infra/seed/mirror-images.sh` (`:121`); `PREFIX='127.0.0.1:7107/local/'` (`app-images.sh:51`) | **HOLDS (lines same)**; details in §G |
| 22 | The fake driver keeps no call list — `routeHistory`, `routeOf`, `crash`, `vanish` (`runtime/fake-driver.ts:49-97`); A1's restore test wraps `restoreRoute` itself | `runtime/fake-driver.ts:49-95` (the `FakeDriver` type); `restoreRoute` `:340-356` writes through `route()` (`:123-127`), which appends to `history`; `releases/releases.test.ts:3450-3451` (the wrapper) | `history.set(hostname, [...(history.get(hostname) ?? []), [...ids]])` (`:126`); `restoreRoute: async (ids) => { restored.push(...ids)` (`releases.test.ts:3450-3451`) | **HOLDS (lines: the type is `:49-95`).** Nuance: there IS one call list, `destroyedEnvironments()` (`:79-84`, pushed at `:398`). And `routeHistory` DOES record a `restoreRoute`'s route, but it cannot be told apart from a deploy's move. So the precise claim is that no `restoreRoute` call list exists |

---

## A. Fact 14 in detail — `deployReleaseSet` when a member is not healthy (`releases/release.ts`, unchanged since `c7e0978`)

| Step | File:line | Code |
|---|---|---|
| Entry | `:300-307` | `export async function deployReleaseSet(db, driver, config, deps, input, healthWait = DEFAULT_HEALTH_WAIT): Promise<DeployedSet>` |
| The previous set, read under the lock | `:644` | `const previous = await driver.servingInstances(environment.hostname)` |
| State for the set's outcome | `:850`, `:852`, `:854` | `let handles …`, `let failedIndex = -1`, `let failedCheck = ''` |
| The try around `ensureInstances` | `:855` → `:884` (`driver.ensureInstances(…)`) | — |
| Health wait for every member at once; the FIRST unhealthy is the failure | `:954-961` | `failedIndex = health.findIndex((result) => !result.healthy)` (`:957`) |
| **`InstanceNotReadyError` caught and recorded, not thrown** | `:962-980` | `} catch (error) { if (error instanceof InstanceNotReadyError) { handles = members.map(…error.handles[index]); failedIndex = …; failedCheck = error.check` |
| **Thrown instead** (the set never started, or a health read failed): its keys are revoked, then the original error is rethrown | `:981-988` | `await revokeMintedKeys(deps.ai, db, environment, minted)` (`:986`); `throw error` (`:987`) |
| Other throws before anything starts (not a "failed set") | `:310-315` (`replacing` without `purpose: 'replacement'`, and the reverse); the `ReleaseError`s before the lock (e.g. `:320-331`); `:551-570` (`NothingToReplaceError`); `:817-823` (a key-store failure: revoke, rethrow) | — |
| `healthy` | `:990` | `const healthy = failedIndex === -1` |
| **Previous set restored only if the route had moved to the new set** (a readiness refusal never moves it) | `:1003-1022` | `let routeDialsFailed = !healthy && (await driver.servingInstances(environment.hostname)).some(…startedIds…)`; `if (routeDialsFailed && previous.length > 0) { routeDialsFailed = await driver.restoreRoute(previous).then(() => false).catch(…console.error…; return true) }` |
| **EVERY member's row marked `failed`** (`health_failed`) | `:1031-1046` | `const state = nextState(starting, healthy ? 'health_passed' : 'health_failed')` (`:1032`) |
| One `instance.failed` per member | `:1114-1133` | `type: 'instance.failed'` (`:1121`) |
| **ONE Incident**, for the failed member, `cause` defaulted (`deploy`) — so a replacement's failed deploy is `cause: deploy` too | `:1134-1139` | `captureIncident(db, driver, { instanceId: failed.id, failedCheck }, redact)` |
| `incident.opened` | `:1145-1163` | `type: 'incident.opened'` (`:1151`), detail `{ incidentId, instanceId, releaseId, environment }` |
| Every member removed: `destroyInstance` if the route still dials it, else `retireInstance(…, { drainMs: 0 })` | `:1242-1257` | — |
| **New keys revoked** | `:1258` | `await revokeMintedKeys(deps.ai, db, environment, minted)` |
| **RETURNS** | `:1275-1283` | `return { instances: set, answer: healthy ? set[0]! : set.find((row) => row.id === members[failedIndex]!.id)! }` (`:1280-1283`) |
| `deployRelease` answers `.answer` | `:282-291` | `return (await deployReleaseSet(…)).answer` (`:290`) |

D21's reading of it: `launch/rehearsal.ts:269-273` (the comment) and `:275` (`instance.state === 'healthy'`). A deploy that THREW is caught at `:210`.

## B. `DeployInput` (`releases/release.ts:185-229`) and `shape.test.ts`

| Field | Line | Type / note |
|---|---|---|
| `releaseId` | `:186` | `string` |
| `environmentId` | `:187` | `string` |
| `purpose?` | `:220` (doc `:188-219`) | `DeployPurpose` = `'launch' \| 'rehearsal' \| 'replacement'` (`shape.ts:13`); defaults to `'launch'` (`:506`); the digest check's condition is `purpose !== 'rehearsal'` (`:379`) |
| `replacing?` | `:228` (doc `:221-227`) | `string`: required with `'replacement'` and refused with anything else (`:310-315`); written to `instances.replacing` (`:589`) |
| `instances` / `resources` | — | **NONE.** The interface closes at `:229` |

- **`shape.test.ts:37-45`, the staging case.** Title at `:37`: `'keeps sandbox and staging at one, at their own resources, whatever the audience or purpose'`. It loops `kind ∈ {sandbox, staging}` × `purpose ∈ {launch, rehearsal, replacement}` × all four scales, and expects `{ instances: 1, resources: kind }`.
- **`shape.test.ts:58-68`, A1's type test.** `const input: DeployInput = { releaseId: 'r', environmentId: 'e' }`, then `// @ts-expect-error — no \`instances\` on DeployInput` (`:63-64`) and `// @ts-expect-error — no \`resources\` on DeployInput` (`:65-66`). Only `pnpm typecheck` runs it.
- **Stale comment.** `shape.ts:10-11` still says the `'replacement'` purpose is *"passed by nothing until the watcher exists"*. The watcher has passed it since `68274fa` (`src/index.ts:464`: `{ ...input, purpose: 'replacement' }`).

## C. The boot's passes (`releases/recover.ts`, unchanged since `c7e0978`)

| Pass | Lines | What it does |
|---|---|---|
| (function) | `:54-276` | `export async function recoverAtBoot(deps: {…}): Promise<RecoveryReport>` |
| **0** builds | comment `:76-87`, code `:88-112` | Every `running` build becomes interrupted and its end is published |
| **1** Route records, each hostname's whole SET | comment `:118-133`, code `:134-202` | `deps.driver.restoreRoute(present)` (`:194`); a member whose container is gone is left out and named |
| **2** a deploy left mid-way | comment `:204-211`, code `:212-224` | `MID_DEPLOY = ['provisioning', 'starting', 'waking']` (`:35`) → `interrupted` → `failed` (`runtime/state-machine.ts:41/47/60`) |
| **2½** archives | comment `:226-233`, code `:234` | `const teardowns = await deps.finishTeardowns()` |
| **2¾** a D21 rehearsal left serving | comment `:236-241`, code `:242` | `const rehearsalsTakenDown = await deps.takeDownLeftRehearsals()` |
| **3** retire passes, LAST | comment `:244-258`, code `:259-264` | `for (const environmentId of scheduled) deps.retirer.schedule(environmentId)` |
| report | `:266-275` | — |

**The plan's pass 2⅞ goes between `:242` and `:244`.** In `src/index.ts`: `recoverAtBoot({` `:418`; `finishTeardowns` bound `:425-…`; `takeDownLeftRehearsals` bound `:441-442`; the set watcher is created `:453-470` (doc `:444-452`) and started at `setWatcher.start()` **`:471`**. **`createCwlSignInProbe` is bound at `src/index.ts:370-376`** (`signIn: createCwlSignInProbe({ engine: createEngineClient({ socketPath: config.dockerSocket }), idpBaseUrl, caCertPath, dnsServer, credentials: config.rehearsalCredentials })`). The plan's `:370` holds.

## D. Fact 17 — the set watcher's read (`releases/watch.ts`)

| Filter | Line | Code |
|---|---|---|
| The environments it watches | `:181-203` | `selectDistinct … from(environments) .innerJoin(projects, …) .innerJoin(routes, eq(routes.hostname, environments.hostname))` (`:188-190`) |
| PRODUCTION only | `:199` | `eq(environments.kind, 'production'),` |
| ACTIVE projects only | `:200` | `eq(projects.state, 'active'),` |
| **LAUNCHED projects only (now committed, `59a540f`)** | `:201` | `isNotNull(projects.launchedAt),` |
| Members: the Route rows of this hostname and environment | `:237-256` | `eq(routes.hostname, environment.hostname)`, `eq(instances.environmentId, environment.id)` (`:244-245`) |
| ITS OWN DRIVER's members only | `:252` | `eq(instances.driver, deps.driver.name),` |
| Under the environment's lock, skipped if it is held | `:227-229` | `tryWithEnvironmentLock(environment.id, () => readAndRecord(environment))` |

**For B:** a staging set, and an unlaunched project's production, are never the watcher's.

## E. `incident.opened`, the representations, and what FE-63's mark would touch

**Publishers of `incident.opened`** (grep of the whole of `src`, non-test). There are exactly two:

| Publisher | File:line | `cause` passed to `captureIncident` | Event detail |
|---|---|---|---|
| The deploy (any purpose, the replacement's included) | `releases/release.ts:1151` (the `publishEvent` at `:1145-1163`; the capture at `:1134-1139`) | none, so `'deploy'` | `{ incidentId, instanceId, releaseId, environment }` (`:1152-1157`) |
| The set watcher's `openIncident` | `releases/watch.ts:461` (function `:442-475`; called by `recordExit` `:390` with `'exit'`/`'exit_stopped'` (`:388-389`), and by `sayStopped` `:488`) | `'exit'` or `'exit_stopped'` | `{ incidentId, instanceId, releaseId, environment: 'production' }` (`:462-467`) |

The event's schema is `observability/event-schemas.ts:319-328`, a `z.strictObject({ incidentId, instanceId, releaseId, environment })` with **no `cause`**. Its example is `observability/examples.ts:74`, and the type list `observability/events.ts:49`. The DB CHECK of event types is `db/schema.ts:1330`.

**Representations:**

| Representation | File:line | Fields |
|---|---|---|
| `Instance` | `api/representations/instances.ts:5-34` | `id` `:9`, `environmentId` `:10`, `releaseId` `:11`, `kind` `:12-16`, `state` `:19-23`, `lastSeenAt` `:24-26`, `createdAt` `:27-29`. Mapper `toInstance` `:37-47` (never `driver`/`handle`, and **not `replacing`**) |
| `InstanceSummary` | `api/representations/instances.ts:49-58` | `Instance.extend({ serving: z.boolean() })` (`:52-56`). Filled INLINE in `api/routes/instances.ts:173-176`: `{ ...toInstance(row), serving: serving.has(row.id) && SERVING_STATES.has(row.state) }` |
| `Incident` | `api/representations/incidents.ts:5-43` | `id` `:9`, `instanceId` `:10-12`, `releaseId` `:13`, `exitReason` `:14-16`, `logTail` `:17-19`, `failedCheck` `:20-22`, `diffSinceHealthy` `:23-27`, `createdAt` `:28`, **`cause` `:29-33`** (`z.enum(['deploy','exit','exit_stopped'])`), `prompt` `:34-38`. Mapper `toIncident` `:55-71` (`cause: row.cause` `:68`); the route `listIncidents` `api/routes/releases.ts:1233`, mapping at `:1297-1308` |

**What marks a replacement today:**
- **DB, instances:** `instances.replacing` (`db/schema.ts:347-349`, doc `:338-346`), a nullable `uuid` referencing `instances.id`, `onDelete: 'set null'`. It is written by the deploy for every member of a replacement set (`release.ts:588-589`: `replacing: input.purpose === 'replacement' ? input.replacing! : null`) and read by the watcher's counting (`watch.ts:150-156`, `SELECT count(DISTINCT created_at) … WHERE replacing = …`). **This is the only stored mark, and it is on the INSTANCE row.**
- **DB, incidents:** `incidents.cause` (`db/schema.ts:1428-1430`; CHECK `:1436`) is `'deploy' | 'exit' | 'exit_stopped'`, default `'deploy'`. **It has no replacement value.** A replacement's failed deploy writes `'deploy'` (`release.ts:1137` passes no cause). `IncidentCause` is defined at `observability/incidents.ts:53`, and the capture input's `cause?` at `:49`.
- **Events:** **no deploy event marks a replacement.** `detailOf` (`release.ts:599-605`) is `{ instanceId, releaseId, environmentId, environment, state }` for `instance.provisioning`/`starting`/`healthy`/`failed`. Only the watcher's `instance.exited` carries `replacement: 'scheduled' | 'stopped'` (`observability/event-schemas.ts:406-409`; published at `watch.ts:416-438`, `type: 'instance.exited'` `:422`). That is the exit's decision, not a deploy's.

**FE-62** (`manifest-app/docs/api-findings.md:2012-2038`) asks that `incident.opened` carry `cause`, and that a replacement's deploy events say they are one. **FE-63** (`:2040-2059`) asks that `InstanceSummary` or `Incident` say it is a replacement (e.g. `purpose: 'replacement'`) beside FE-62's event field, in `1.10.0`, additively. It is carried by `manifest-coord5` to B before its Task 5.

**Files a mark on `InstanceSummary` / `Incident` would touch.** This is a list, not a design:
1. **No migration is needed for the instance mark.** `instances.replacing` already exists (`db/schema.ts:347`). An Incident's mark can be derived from its instance's `replacing` by a join. A stored `incidents` column would be a migration, plus `db/schema.ts:1404-1438`, plus `captureIncident`'s input (`observability/incidents.ts:35-50`) and its two callers (`release.ts:1134-1139`, `watch.ts:450-455`).
2. **`api/representations/instances.ts`.** Add the field to `Instance` (`:5-34`) and `toInstance` (`:37-47`), which also changes the `deploy` answer and `Environment.instance(s)` (`api/representations/environments.ts:56`, `api/routes/releases.ts:1229`). Or add it to `InstanceSummary` alone (`:49-58`) and fill it in `api/routes/instances.ts:173-176`.
3. **`api/representations/incidents.ts`.** The schema `:5-43`, `toIncident` `:55-71`, and its row type `IncidentRow & { releaseId: string }` (`:56`).
4. **`observability/incidents.ts:115-127` (`listIncidents`).** It selects `{ ...getTableColumns(incidents), releaseId: instances.releaseId }` from the join, so `instances.replacing` would be added there.
5. **FE-62's half.** `observability/event-schemas.ts:319-328` (`incident.opened`, strict), `observability/examples.ts:74`, and the two publishers above. For the deploy events, `detailOf` (`release.ts:599-605`) and the `instance.*` schemas in `event-schemas.ts`.
6. **The contract.** `api/contract/document.ts:130` (`CONTRACT_VERSION = '1.9.0'`) and its version notes (`:116-129`); `packages/contract/package.json:3`. Generated, by `pnpm contract:write` / `contract:generate`: `packages/contract/openapi.json` (`info.version` `:5`) and `packages/contract/src/schema.d.ts`. Docs: `docs/api/events.md` and `docs/api/reference/events.md` both name `incident.opened`; `docs/api/reference/operations.md` is regenerated.
7. **The mock** (typed `Schemas['Instance']`/`['Incident']`, so a REQUIRED field breaks every fixture until filled). `packages/mock/src/fixtures.ts`: `INSTANCE` `:126`, `FAILED_INSTANCE` `:142`, `SANDBOX_INSTANCE` `:153`, `PRODUCTION_INSTANCE` `:164`, `PRODUCTION_SET` `:177`, `FAILED_SANDBOX_INSTANCE` `:183`, `LAUNCHED_PRODUCTION_INSTANCES` `:205-207`, `INSTANCE_LISTS` `:217-235`, `INCIDENTS` `:654-670` (`cause: 'deploy'` `:666`). `packages/mock/src/server.ts:461` serves the lists. `packages/mock/src/script.ts:296` is the scripted `incident.opened` (FE-62).
8. **Consumers to re-read, which need no change for an additive field:** `packages/console/src/api.ts`, `console/src/screens/deploy.tsx`; `packages/journey/src/{production,launch,frontend,capacity,coverage,example-output}.ts`.

## F. A1's sittings 6–8 under B

| What | File:line | Code / finding |
|---|---|---|
| `candidateFor` | `launch/candidate.ts:34-63`; `servingInstanceOf` `:43`; healthy-or-nothing `:54` | Reads staging's `servingInstanceOf`, which is **the first HEALTHY member by `(created_at, id)`, else the first** (`projects/repository.ts:339-344`, `answeringMemberOf`); then `if (serving === undefined \|\| serving.state !== 'healthy') return undefined` (`:54`) |
| `servingInstancesOf` | `projects/repository.ts:311-329` | The Route rows' set ordered `asc(createdAt), asc(id)` (`:315-320`); with no Route row, the NEWEST instance alone (`:322-328`) |
| `servingInstanceOf` | `projects/repository.ts:350-355` | `return answeringMemberOf(await servingInstancesOf(db, environment))` |
| `launch/rehearsal.ts`'s set checks (was `:378`) | `launch/rehearsal.ts:378` (in `releaseUnlaunchedName`, `:362-395`); `:490-491` (in `takeDown`) | **Unchanged since `c7e0978`; sitting 6 did NOT edit `rehearsal.ts`** (`59a540f` touches no file under `launch/` but `candidate.ts`). `:378`: `if ((await deps.driver.servingInstances(production.hostname)).length > 0) await deps.driver.removeName(…)`; `:490-491`: `const serving = …servingInstances(production.hostname); if (serving.length === 1 && serving[0] === current.handle) removeName(…)` |
| The skeleton's error handler (I3) | `blueprints/node-ts-mongo/skeleton/errors.js:23-39` (new, `1d40042`); imported `skeleton/server.js:18`, mounted LAST `:160`; `starters/proof-app/server.js:28-29` (import), `:368` (mount) | `export function errorHandler(error, req, res, next)`: logs the method and path (never the query or body), answers `500` `'Something went wrong on our side. Please try again.'` or a 4xx sentence |
| `NODE_ENV=production` | `blueprints/node-ts-mongo/Dockerfile.tmpl:51` | `ENV NODE_ENV=production`, after `npm ci`, before `COPY . .` |
| `/login` and the ACS | `skeleton/server.js:120`, `:125` | (fact 16) |
| `/healthz` | `skeleton/server.js:104-111` | Pings Mongo; `503` with `{ status: 'error' }` on failure (`:109`) |
| `saml_requests` | `skeleton/auth/ubcshib.js:58-59` (TTL `8 * 60 * 60`), `:77-110` (`samlRequestCache`: `createIndex({ createdAt: 1 }, { expireAfterSeconds })` `:79-82`, `insertOne` `:90`), wired at `:135` (`cacheProvider: samlRequestCache(client)`) | **One Mongo insert per `/login`** |
| `saveUninitialized` | `skeleton/auth/session.js:57` | `saveUninitialized: false,` |
| The knowledge pack's rule | `blueprints/node-ts-mongo/agents/AGENTS.md:71-…` | `### Several copies of your app answer its requests` |
| `packages/journey/src/serving-set.ts` (exported) | `SeenSet` `:14-25`, `EdgeAnswer` `:27-31`, **`seeEveryMember(ask, set, isTheApp?)` `:33-61`** (window `4 * set.length`, `:42`), **`describeSeen(set, result)` `:64-74`** | Asks until every member has answered and says what it saw: `seen`, `strangers`, `wrong`, `asked` |
| `packages/journey/src/capacity-checks.ts` (exported) | `LoopRecord` `:10-20`, `overlapping` `:23`, `inFlightAt` `:32`, `notTheApp` `:40`, `setRuns` `:50`, `Wave`/`wavesOf` `:66`/`:76`, `Exit` `:90`, `crashLoop` `:115` | Pure checks over `scripts/lib/redeploy-loop.mjs`'s records |
| `packages/journey/src/capacity.ts` | **exports nothing** (`grep -c '^export'` = 0) | Its set readers are private: `environment()` `:174-184`, `ids`/`states` `:189-191`, `twoHealthy` `:194-195`, `incidents()` `:197`, `servesAs()` `:271-285` (uses `seeEveryMember` on `/healthz`), `signsInWithUbc()` `:291`, `productionAppContainers()` `:319-333` (`docker ps -a` by labels), `productionContainersOf()` `:336-348`, `productionKeys()` `:351-361` (LiteLLM `/key/list`), `exactlyTheSet()` `:364-379`, `startLoop()` `:456-495` (spawns `MANIFEST_LOOP_SCRIPT`), `kill()` `:600`. **B's demo must extract or copy them; it cannot import them** |

## G. The edge's image, and what would remove `manifest/vegeta:<version>`

| Question | Answer | File:line |
|---|---|---|
| Who builds the edge's image | `make seed` → `bash infra/seed/seed.sh` (`Makefile:31-32`) → **`$COMPOSE --profile github build`** (`infra/seed/seed.sh:17`), where `$COMPOSE` = `docker compose -f infra/compose.yaml -p manifest --env-file .env` (`infra/lib/common.sh:115`) | `infra/compose.yaml:87-89`: `caddy: build: { context: ./caddy }`, `image: manifest-caddy:local` |
| The Dockerfile | `xcaddy build v2.11.4 --with github.com/mholt/caddy-ratelimit@v0.1.0 --with github.com/corazawaf/coraza-caddy/v2@v2.6.0` | `infra/caddy/Dockerfile:10-18`; its line 1 says *"The one image built rather than pulled (§20)"* |
| Tag | **`manifest-caddy:local`** | `infra/compose.yaml:89` |
| Pushed to `127.0.0.1:7107`? | **No. It stays in the daemon only.** `mirror-images.sh` pushes only `infra/images.txt`'s lines, as `127.0.0.1:7107/base/<repo>:<ver>` (`:50`, `:60`), and `images.txt` names no `manifest-*` image | `infra/seed/mirror-images.sh:14-62`; `infra/images.txt` (node:22/24-alpine, alpine:3.22, mongodb 7.0.28-ubi8, curlimages/curl:8.11.1, syft v1.51.1, grype v0.118.0, litellm by digest) |
| Other images compose BUILDS (§20's "one" is already loose) | `manifest-dnsmasq:local` (`compose.yaml:23-24`, `:45-46`), `manifest-egress:local` (`:191-192`), `manifest-idp:local` (`:274-275`), `manifest-github-fake:local` (`:380-381`, profile github) | — |
| `make reset` | Removes containers `name=^mf-` (`Makefile:107`), networks `^mf-` (`:116-117`), volumes `^mf-` (`:118`), and the registry/pgdata/buildkit/github-fake volumes (`:88`); re-mirrors `images.txt` (`:119-121`). **It never removes a daemon image**, so `manifest/vegeta:<v>` would survive. But it is not in `images.txt`, so it is not re-mirrored (it was never in the registry anyway). A generator CONTAINER named `mf-…` WOULD be removed by `:107` | `Makefile:83-129` |
| `infra/seed/mirror-images.sh` | Reads `images.txt` only. It would neither touch nor know a `manifest/vegeta` image. **If `manifest/vegeta` were added to `images.txt`**, it would `docker pull` it when absent (`:22-26`; a locally built image is "already local") and push it to `base/vegeta`; `doctor.sh`'s lock check (`:366-378`) would then require it in `images.lock` | — |
| `scripts/app-images.sh` | Selects only images whose Repository starts with `127.0.0.1:7107/local/` (`PREFIX` `:51`; `awk -v p="$PREFIX" 'index($2, p) == 1'` `:74-75`). It keeps an image named outside the prefix (`:89-90`). **It leaves `manifest/vegeta` alone** | — |
| `scripts/dead-app-resources.sh` | Networks `grep '^mf-'` (`:74`) and volumes `name=^mf-` (`:120`) only. **No images.** Note: it counts containers `name=^mf-${app}-` (`:78`) to decide whether a network is dead, so a generator container named `mf-<slug>-…` would count as the app's | — |
| `scripts/litellm-orphans.sh` | LiteLLM users; it reads containers `^mf-.*-app$` (`:78`). **No images** | — |
| No script prunes images | `grep prune\|rmi\|image rm` over `scripts/*.sh`, `infra/lib`, `infra/seed`, `Makefile` → only `app-images.sh` (and a comment in `snapshot-machine.sh:94`) | — |
| Does `doctor.sh` enumerate images? | **Yes, against lists:** `check_lockfile` loops `images.txt` against `images.lock` (`:366-378`, loop `:372`); `litellm_is_pinned` (`:380-405`); `check_registry_has_bases` loops `images.txt` minus litellm against the registry (`:406-440`, loop `:427`); `manifest-github-fake:local` built (`:450-456`); Mailpit at compose's digest (`:464-473`). **It does not check `manifest-caddy:local`** | `scripts/doctor.sh` |
| Does `verify.sh`? | It uses images (`manifest-dnsmasq:local` `:24`, `:61`; `curlimages/curl:8.11.1` many times) and checks the RUNNING edge's modules: `docker exec manifest-caddy caddy list-modules \| grep -E '^http\.handlers\.(rate_limit\|waf)$'` (`:73-74`). It keeps no list of images | `scripts/verify.sh` |

## H. `routing/caddy.ts` and the Docker driver

**The rate_limit handler, whole** (`routing/caddy.ts:156-166`; it was `:153-163` at `c7e0978`, and moved +3 by `745def2`):

```
156:       {
157:         handler: 'rate_limit',
158:         rate_limits: {
159:           [input.routeId]: {
160:             match: [{ remote_ip: { ranges: ['0.0.0.0/0', '::/0'] } }],
161:             key: '{http.request.remote.host}',
162:             window: '1m',
163:             max_events: input.rateLimit ?? 600,
164:           },
165:         },
166:       },
```

`rateLimit?: number` is the `buildRoute` input at `:135`. `buildRoute` runs `:123-…`; `request_body` comes first (`:155`), the rate limit second, then `headers` (`:167-210`), then `reverse_proxy` (`:211-…`).

**`appHealthPolicy`, now** (`:88-100`; the `HealthPolicy` type is `:55-79`):
- **Active.** `{ path: healthPath, interval: 5 * SECOND_NS, timeout: 2 * SECOND_NS, probeHeader: 'health' }` (`:90-95`). In the route: `uri`, `interval`, `timeout`, `expect_status: 200`, and the probe header (`:224-230`).
- **Passive.** `{ failDuration: 10 * SECOND_NS, maxFails: 2 }` (`:96`). In the route: `{ fail_duration, max_fails }` (`:231-234`). **There is no `unhealthy_status` and no status field in the type** (`:67-70`), so only dial and transport failures count; the app's `502`, `503` and `504` never eject a member.
- **Retry.** `tryDuration: 3 * SECOND_NS, tryInterval: SECOND_NS / 4` (`:97-98`), placed in `load_balancing` (`:214-219`, `round_robin`).

**The Docker driver** (`runtime/docker/driver.ts`, unchanged since `c7e0978`):
- `ensureInstances` (`:449-…`) applies the set's route at `:577-585`: `applyRoute(options.routing, { hostname, kind, upstreams, health: appHealthPolicy(first.healthPath) })`, with no `rateLimit`, so 600.
- `restoreRoute` is **`:774-816`**. It inspects every id (`:775`) and refuses `INSTANCE_NOT_FOUND` for any id missing its labels (`:784-792`). It takes one hostname (`:794-797`) and the kind from the label (`:798-800`). The health path comes from the containers' label, and is `'none'` plus an operator line if they disagree (`:801-806`, `:814`). It applies at `:807-815`, again with no `rateLimit`. It has no exemption.
- The identity window is `16 × N` (`routing/readiness.ts:85-92`, `:109`).

## I. `runtime/driver.ts`, the Docker mapping, the fake

**`Driver`** (`runtime/driver.ts:334-430`):

| Member | Line |
|---|---|
| `name` | `:335` |
| `buildImage` | `:336-341` |
| `ensureService` | `:342` |
| `ensureInstances` | `:359` (doc `:343-358`) |
| `retireInstance` | `:367` |
| `servingInstances` | `:369` |
| `listInstances` | `:371` |
| `restoreRoute` | `:379` |
| `switchOff` | `:388` |
| `removeName` | `:398` |
| `stopInstance` | `:399` |
| `destroyInstance` | `:407` |
| `destroyService` | `:408` |
| `destroyEnvironment` | `:417-424` |
| `status` | `:425` |
| `logs` | `:426` |
| `exec` | `:427` |
| `snapshotService` | `:428` |
| `capabilities` | `:429` |

- **`InstanceStatus`** (`:176-186`): `{ id: string; state: InstanceState; healthy: boolean; message?: string; exitCode?: number }`. **HOLDS, same lines.** `InstanceState` is `:164-174`.
- **The Docker mapping** (`runtime/docker/instances.ts`). `DockerState` is `{ Status, ExitCode, Health?, hibernationMarker }` (`:15-21`). `dockerStateToInstanceState` (`:31-48`) maps `exited` to `failed` unless the hibernation marker is present. `instanceStatus` (`:351-386`) inspects `State: { Status, ExitCode, Health?, Error? }` (`:355-362`), reports `exitCode` only for `exited`, `dead` or `restarting` (`:378`, `:384`), and `message` from `State.Error` (`:374`, `:383`). **`State.OOMKilled` is read nowhere** (0 hits in `packages/`).
- **The fake.** `crash(id: string, exitCode?: number): void` is at `runtime/fake-driver.ts:58`, with its doc at `:52-57`. Its body (`:514-520`) sets `state = 'failed'` and `exitCode` (deleted when absent). It has no OOM flag.
- **What the fake keeps (fact 22).** `history` (`:121`) is appended by `route()` (`:123-127`), the ONLY writer of routes, which `restoreRoute` calls (`:354`). That is exposed as `routeHistory` (`:491`). `environmentsDestroyed` (`:132`, pushed `:398`) is exposed as `destroyedEnvironments()` (`:79-84`, `:504`). **There is no list of `restoreRoute`, `ensureInstances` or `retireInstance` calls.**

## J. Pools and the rehearsal lock

- **`db/client.ts:38`.** `export const lockPool = new pg.Pool({ connectionString, max: 10 })`.
- **`:40`.** `export const outerLockPool = new pg.Pool({ connectionString, max: 10 })`. The why is at `:22-37` and `:39`.
- **`db/locks.ts:96-117`, `tryWithRehearsalLock`.** The key is `` `manifest:rehearsal:${projectId}` `` (`:100`), taken on `outerLockPool.connect()` (`:102`). It runs `pg_try_advisory_lock(hashtextextended($1, 0))` (`:104-107`) and answers `undefined` when the lock is held (`:108`), which gives `409 REHEARSAL_RUNNING`. It unlocks in a `finally` (`:111-113`) and releases the client (`:114-116`).

## K. The hint, the deploy operation, `launch:rehearse`

- **`api/error-codes.ts:641-644`, `REHEARSAL_RUNNING`.** Message: `'A rehearsal of this project is already running, so this one was not started and nothing was deployed.'` Hint: `'Wait for the running rehearsal to answer — up to about two minutes — then read the launch checklist (\`getLaunchReadiness\`): its \`rehearsal\` item says how it went.'` **HOLDS.**
- **`api/routes/releases.ts:1071`, `operationId: 'deploy'`.** `POST /v1/environments/{environmentId}/deploy` (`:1073`). The success answer is `Instance` (`:1081-1086`). Its capabilities are `['release:deploy', 'release:promote']` (`:1087`). **`errors` (`:1088-1125`), 19 codes:** `NOT_FOUND`, `FORBIDDEN`, `STEP_UP_REQUIRED`, `RELEASE_PRODUCTION_GATE_UNAVAILABLE`, `RELEASE_REESCALATED`, `RELEASE_NOT_STAGED`, `RELEASE_DIGEST_NOT_APPROVED`, `RELEASE_SECRET_NOT_SET`, `RELEASE_CWL_NO_ATTRIBUTES`, `TOKEN_ACTION_PENDING`, `TOKEN_ACTION_REJECTED`, `RELEASE_NOT_FOUND`, `RELEASE_DIGEST_MISSING`, `RELEASE_AI_DISABLED`, `RELEASE_AI_BUDGET_MISSING`, `RELEASE_MODEL_NOT_IN_CATALOGUE`, `RELEASE_MODEL_CLASSIFICATION_TOO_LOW`, `RELEASE_MODEL_UNCLASSIFIED`, `AI_BACKEND_UNAVAILABLE`. **HOLDS.**
- **`projects/authz.ts`, `launch:rehearse`.** In `PERSON_ONLY` (`:203-211`, entry `:207`, doc `:195-202`); in the step-up set (`:274`, comment `:271-273`); in the owner's capabilities, and so the collaborator's and the administrator's (`:466-467`). **HOLDS.**

## L. `launch/readiness.ts`

- The launched clause: `...loadRehearsalItems(audience),` at **`:168`**, inside `if (project?.launchedAt != null) {` (`:160`).
- The first launch's clause: **`:198`**, before `codeReviewItem` (`:202`).
- The item: doc `:227`, `function loadRehearsalItems(…)` `:228-241`. It is `id: 'load-rehearsal'` `:232`, `blocking: true` `:235`, `state: 'not_built'` `:236`, `builtBy: 'a later Manifest release (the load rehearsal)'` `:237`.
- **HOLDS, same lines.** `not_built` also appears at `:286` and `:316`, for other items.

## M. `sso/sign-in.ts`

| Item | Line | Code |
|---|---|---|
| `createCwlSignInProbe` | `:177` | `export function createCwlSignInProbe(options: CwlSignInProbeOptions): CwlSignInProbe` |
| The container | `:265-311` (`runProbeContainer`) | `/containers/create` `:270`; `start` `:292`; `wait` `:293`; logs demuxed `:298-304`; `DELETE …?force=true&v=true` `:309` in a `finally` |
| Image | `:77` | `const PROBE_IMAGE = 'curlimages/curl:8.11.1'` |
| `/login` hard-coded | `:112` (and `:117`) | `form=$(curl -sS --cacert /ca.crt -c $J -b $J -L "$APP/login")` |
| Network / resolver / CA | `:276`, `:277`, `:278` | `NetworkMode: 'manifest-platform'`, `Dns: [options.dnsServer]`, `Binds: [\`${ca}:/ca.crt:ro\`]`; plus `CapDrop: ['ALL']`, `no-new-privileges`, not privileged, `RestartPolicy: 'no'` (`:279-282`) |

**HOLDS, same lines.** `1c69a66` changed only a comment at `:67`.

## N. The contract version

- **`1.9.0`, as expected.**
- `api/contract/document.ts:130`: `export const CONTRACT_VERSION = '1.9.0'`. Its history note is at `:116-129`, and it is used at `:482`.
- `packages/contract/package.json:3`: `"version": "1.9.0"`.
- `packages/contract/openapi.json:5`: `"version": "1.9.0"`.
