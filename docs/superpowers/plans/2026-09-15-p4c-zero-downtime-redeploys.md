# P4c — Zero-Downtime Redeploys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A redeploy interrupts nobody using the app — no 502, no wildcard page, no signed-out user, no refused AI call — and a release that never becomes ready leaves the previous one serving.

**Architecture:** The guarantee lives in the §11 `Driver` contract, so Phase 5's UBC driver inherits it rather than `deployRelease` alone providing it. `ensureInstance` starts the new instance **beside** the one serving, makes it ready **privately** (from inside the edge, against the instance's own network alias), moves the route with **one in-place `PATCH`**, and resolves only once the edge is shown to reach *this* instance **by identity**. `retireInstance` drains the old one — until Caddy reports nothing in flight to it, at most 120 s — and then removes it **without touching a route**. The control plane serializes each environment with a Postgres advisory lock, records which instance serves in §6's `Route` table, stores each instance's AI key under its own name so the old key is revoked only after its drain, retires every non-serving instance in the background, and restores routes at boot. `node-ts-mongo@1` keeps sessions in the app's own Mongo, so a redeploy signs nobody out.

**Tech Stack:** TypeScript on Node 24, Fastify 5.12.3, Drizzle over Postgres 16, Vitest, Docker Engine API **v1.44**, the custom Caddy **2.11.4** edge's admin API (`PATCH /id/…`, `GET /reverse_proxy/upstreams`), LiteLLM **1.98.0** by digest; app-side, `express-session` **1.19.0** with **`connect-mongo` 6.0.0** over `mongodb` 6.12.0.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§11** (the `Driver` interface, the naming key, and the new **Redeploys** subsection), **§12** *Edge*, **§13**'s opening, **§10**'s App key row, **§16**'s driver-contract row and **§17**'s `1b+` row. **All of those were applied on 2026-09-15, before this plan was written** (commit `888d9d1`), on Rich's instruction, so this plan is written against the spec as it now reads. Also §6 (the `Route` entity, which has never been built), §14 (Incidents, events, redaction at capture) and §25 (the blueprint is a security multiplier).

**Brief:** [`2026-09-15-p4c-brief.md`](./2026-09-15-p4c-brief.md) — the baseline measured under load, three route-move mechanisms measured, a request in flight across a move, and the redeploy path traced through the code with file:line references. **Read it before this plan.** Its measurement scripts are in [`../spikes/p4c-baseline/`](../spikes/p4c-baseline/).

**Roadmap:** the **P4c** row in [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md).

**Predecessor:** [`2026-09-07-p4b-ai-events-streaming-incidents.md`](./2026-09-07-p4b-ai-events-streaming-incidents.md). Read sitting 5 (findings 71–75) and sitting 10 (178–194) of its *What executing this plan found*, and the two items of its *What this plan does not build* that say "both belong with P4c".

---

## How this plan is to be executed — EIGHT SITTINGS, one per session

Agreed with Rich on 2026-09-15, the pattern that carried P4a's last twelve tasks and all of P4b: **one sitting per session, with a check-in at each boundary**, so a session limit can never land mid-task. **Executing two sittings in one session is not a shortcut** — it is how a limit lands inside a task, and this plan's tasks change the deploy path every app runs through. This plan commits after every task; a stop *between* tasks is recoverable, a stop *inside* one is not. **"Sitting", not "phase"** — this project uses *Phase 1/2/4+* for §17's product roadmap.

| Sitting | Tasks | What it delivers | Status |
|---|---|---|---|
| 1 ✅ | 1 | **The acceptance, built first and watched failing**, plus the five edge and Docker measurements every later task relies on. **Alone**, and first, because every worst defect in this project arrived the first time something ran end to end (brief §8) — **done 2026-09-15, 13 findings; run three times, exit 1 each time; the baseline is run C; M1 confirmed `UNLISTED_UPSTREAM_IS_IDLE = true` and M4 made Decision 2's alias load-bearing** | ✅ |
| 2 ✅ | 2 | §11's contract in code: `InstanceSpec.instanceId`/`hostname`, the four new methods, the fake driver's routes and in-flight counters, and the contract suite's continuity block — **done 2026-09-15, 4 findings; the fake runs all eleven continuity tests, the Docker driver's four refuse and its block skips with its reason; the plan's fake folded `failInstances` into the readiness refusal and erased the health-check half of §14's Incident** | ✅ |
| 3 | 3–4 | The edge (upsert in place, identity header, what serves, what is in flight), then the Docker `ensureInstance` that uses it: beside, privately ready, moved, verified, rolled back | ← **next** |
| 4 | 5 | Docker `retireInstance`, `listInstances`, `servingInstance`, `restoreRoute` and the gateway detach — **the contract suite green on the Docker driver**, drain tests included | |
| 5 | 6–7 | The data and the keys (the `Route` table, migration 0009, per-instance AI keys, the advisory lock, the drain setting), then the retirer that uses them | |
| 6 | 8–9 | `deployRelease` reordered — serialized, per instance, failing without taking the app down — with its wiring; then boot recovery | |
| 7 | 10 | `node-ts-mongo@1` keeps sessions in the app's own Mongo. **Alone, and the one sitting that NEEDS THE NETWORK ON**: it adds a pinned dependency, regenerates the lockfile and needs `make seed` to warm Verdaccio from it (P4a sitting 5, P4b sitting 6) | |
| 8 | 11 | `make demo-redeploy` green, with its negative controls. **Alone**, for the reason P4a's Task 15 and P4b's Task 16 were alone | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. the four gates from *Global Constraints*, plus `pnpm test:docker` for every sitting that touched `runtime/`, `routing/`, `releases/`, `secrets/`, `ai/`, `observability/`, `blueprints/` or `infra/` — which is all of them from sitting 2 on;
2. a dated entry in *What executing this plan found* — the tasks, every defect with the measurement that found it, the negative controls, and the gate numbers;
3. **the sittings table above, updated** — mark the sitting done, move the `← next` marker, say how many findings it produced;
4. **the close-out sweep in ORIENTATION §6**, whose first line is the roadmap ledger, and note that the four gate numbers are stated in four separate documents and must move together.

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Task 1 may move task boundaries — that is its job — and if it does, re-cut the sittings before starting sitting 2 and say so in the session record. Three rules survive any re-cut: **Task 1 stays first and alone**, **Task 10 stays alone and needs the network**, and **Task 11 stays alone and last**.

---

## Read this first — what this plan knows that the brief does not

The brief was written from the code on 2026-09-15. The design conversation that produced this plan (the same day, with Rich) read further and measured more. Each of these changed the design, and **every one of them is a fact about the platform as it stands, not a prediction**:

1. **Nothing re-applies routes — at boot or ever.** `reapplyAllRoutes` is exported by `routing/index.ts` and has **no production caller**; the brief §3.4, §12 and ORIENTATION §4 all said the control plane re-applies routes when the edge starts. §12 was corrected on 2026-09-15 and this plan builds the boot half (Task 9); detecting an edge restart while the control plane runs stays Phase 4's.
2. **`stopInstance` and `destroyInstance` have no production callers either.** Hibernation is a contract obligation, not an operation a user can reach. The wake path must keep working; nothing else depends on either.
3. **Builds and deploys run inside the HTTP request, and the control plane runs no background work at all.** The retirer (Task 7) is the first, which is why it is its own task with its own tests and why boot has to finish what a restart cut short (Task 9).
4. **Nothing records which instance serves.** `GET /environments/:environmentId` returns the instance row with the newest `last_seen_at`. §6's `Route` entity — `id, instance_id, hostname, listener, kind` — has never been built, so Task 6 builds it as specified and that becomes the record.
5. **`passport-ubcshib` 0.1.6 sets `validateInResponseTo: true` and drops a `cacheProvider` option** (read from its `index.js`: it builds passport-saml's options field by field). So a sign-in that starts on the old container and returns after the route moved fails its `InResponseTo` check, and the window is as long as the person spends at the IdP. **Rich, 2026-09-15: tolerate it** — sessions move to Mongo, the request-ID cache does not, and a sign-in under way during a redeploy fails once. Named in *What this plan does not build*.
6. **Caddy's `/reverse_proxy/upstreams` exists on this edge and reports `num_requests` per upstream address** (read 2026-09-15 against `127.0.0.1:7119`). That is the drain's signal; Task 1 measures whether it keeps counting after a route move.
7. **A probe can run inside the edge.** `manifest-caddy` has `curl` and BusyBox `wget`, carries **no** proxy environment, and is attached to every app network. Measured 2026-09-15: `docker exec manifest-caddy curl http://mf-proof-app-staging-23fb8892-app:3000/healthz` → `{"status":"ok","mongo":true}`, 200, 3 ms. That is the same network position Caddy dials from.
8. **Repeated `--filter label=` ANDs** (measured: `label=manifest.slug=proof-app --filter label=manifest.environment=nonexistent` lists nothing), unlike repeated `name` filters, which OR (P4b finding 192). **Only app containers carry `manifest.release`**; the database and egress containers carry `manifest.slug` and `manifest.environment` too.
9. **A container name can exceed DNS's 63-octet label limit.** `mf-` + a 39-character slug + `-staging-` + 8 + `-` + 8 + `-app` is 72 characters, and Caddy dials the container **by name**. Today's longest is exactly 63 for staging and 66 for production, which production never reaches because `deployRelease` refuses it. Task 1 measures what the daemon's resolver does with an over-long name; the design does not depend on the answer, because the edge dials a **bounded alias** instead (Decision 2).
10. **Caddy's `headers` handler adds to the upstream's headers unless its operations are deferred**, so an app could serve its own `X-Manifest-Instance` beside the edge's. Read from Caddy's documented behaviour; Task 1 measures it, and the route sets `deferred: true` (Decision 6).
11. **`connect-mongo` 6.0.0** is the current release (checked 2026-09-15): peers `express-session ^1.17.1` and `mongodb >=5.0.0`, engines `node >=20.8.0`, dependencies `debug ^4.4.3` and `kruptein 3.0.8` (→ `asn1.js ^5.4.1`), dual ESM/CJS with a default export.
12. **Two corrections to the design as approved in the conversation**, both recorded as Decisions 10 and 13 below: the driver does **not** remove a never-ready instance (the Incident needs its log), and the AI-gateway detach needs a per-network lock inside the driver.

---

## Decisions Rich made, 2026-09-15

Each was put to him during the design conversation, with the alternatives. **Do not re-open any of these.**

**R1. What "not interrupted" means.** No 5xx and no wildcard answer, and every in-flight request finishes. **The connection reset a Caddy configuration reload occasionally causes is tolerated** — about one request in 300 per admin change, on any app, measured 2026-09-15 — and is **counted and reported** by the acceptance rather than failing it. *Rejected:* zero failed requests of any kind, which would mean changing how the edge is reconfigured and is unmeasured; and adding a spike to look for a reload-free mechanism.

**R2. People stay signed in across a redeploy.** The blueprint gets a shared session store in the app's own Mongo (`connect-mongo`, a new pinned dependency, a sitting with the network on). The SAML request-ID cache stays in memory — see *Read this first* item 5. *Rejected:* signed-cookie sessions (no server-side sign-out, 4 KB limit); leaving it to a later plan.

**R3. The deploy call returns once the new instance serves.** The old one drains and is retired by background work, with a sweep at boot for anything a restart cut short. *Rejected:* blocking the deploy call through the drain, which would make a deploy take minutes and show that way in P5's contract and console.

**R4. A drain ends when nothing is in flight to the old instance, and never later than 120 s.** One platform setting, not per app. **If Task 1 finds that Caddy stops counting an upstream once its route has moved, the drain waits the full bound instead.** *Rejected:* a 300 s bound; a per-app field in `manifest.yaml` (a §7 schema change); a fixed timer that ignores what is in flight.

**R5. A release that never becomes ready leaves the previous one serving.** The route never moves; the deploy is still a `200` whose state is `failed` with an Incident; and once the Incident has captured the exit code, the last 200 log lines and the diff, **the failed container and its files volume are removed and its key is discarded**, so a failed deploy leaks nothing. *Rejected:* keeping the failed container stopped for inspection — the Incident already has its log, and the container's files volume holds an SP private key.

**R6. The §11 shape is two calls plus three reads.** `ensureInstance` keeps its signature and changes its meaning; `retireInstance` drains and removes; `servingInstance`, `listInstances` and `restoreRoute` are what the contract suite and the control plane read. *Rejected:* three explicit steps (`startInstance`/`promoteInstance`/`retireInstance`), which makes "started but not promoted" a state the orchestrator must clean up on every failure path and gives a Phase 5 driver three operations to implement instead of one.

**R7. Every app instance of the environment that is not serving is retired** — not only the one this deploy replaced — so the backlog from before P4c, and anything a crashed control plane left, is reaped by the next redeploy of that app. *Rejected:* retiring only the replaced instance and cleaning the backlog by hand.

**R8. Two releases sharing one database is a knowledge-pack rule.** Expand, migrate, contract, taught in `AGENTS.md` with a worked example; the platform checks nothing, because nothing can see a schema change in a Mongo app. *Rejected:* an opt-in `recreate` strategy in `manifest.yaml` (a §7 schema change and a second deploy path).

**R9. Two neighbouring items are in scope, two are not.** **In:** routes re-applied at the control plane's boot (§12 says so and nothing did it), and the AI-gateway detach plus key revoke for an app that stops declaring models (P4b finding 80). **Out:** a deadline in the blueprint's AI client (P4b finding 181 — it needs a decision about stream semantics and is not about redeploys), and detecting an edge restart while the control plane runs (that is Phase 4's reconciler).

**R10. The eight spec actions were applied before this plan was written**, rather than held until the tasks that implement them had run. *Rejected:* P4b's pattern of holding them. The design lives in this plan — *Decisions this plan makes* — rather than in a second design document beside the approved spec.

**R11. No new instance state.** Draining is the first half of `destroying`; `healthy → destroying → gone` already exists in §11's table and in the `instance_state` enum, so there is no migration and no change to §11's diagram. *Rejected:* a `draining` state a console could tell apart.

---

## Decisions this plan makes, and why

Fourteen questions the design conversation settled below Rich's line. Each says what it rejected and what changing course would cost.

**1. An instance's name carries its instance id, and the id is the `instances` row's uuid.** `instanceName(slug, kind, releaseId, instanceId)` → `${slug}-${kind}-${releaseId.slice(0,8)}-${instanceId.slice(0,8)}`, and the row is inserted **before** `ensureInstance` so the id exists. §11 as applied says the name is derived from `(project, environment, release, instance)`. *Rejected:* a per-deploy counter (another table) and a timestamp (not deterministic across an idempotent retry). **Cost of changing course:** the name is computed in one function and read back from labels, never parsed.

**2. The edge dials an instance by a bounded network alias, never by container name.** `instanceAlias(instanceId)` → `mf-i-<instanceId>` (41 characters), set as a network alias at create time. A container name can exceed DNS's 63-octet label limit once the instance id is in it (*Read this first* item 9), and the dial address is a DNS label. The alias is also what the drain counts and what `servingInstance` maps back to a container. *Rejected:* shortening the name (the spec names release **and** instance, and a slug may be 39 characters); dialling the container IP (it changes on every restart, and §21 forbids the control plane reaching container IPs anyway).

**3. Containers carry five new labels**: `manifest.instance`, `manifest.hostname`, `manifest.port`, `manifest.ai-gateway`, beside P4b's `manifest.env-sha256`. They are how `retireInstance`, `listInstances`, `servingInstance` and `restoreRoute` read an instance **without the database** — §5 keeps `runtime/` free of `db/`, and the driver must work for containers whose rows `pnpm test` truncated.

**4. Readiness is proved privately, from inside the edge.** `docker exec manifest-caddy curl http://mf-i-<id>:<port><health>`, 200 only. The identity question is answered by construction: that alias resolves to that container on that network and nothing else. *Rejected:* a throwaway curl container attached to the app's `--internal` network (a new, transient member of the network S6 measured); a non-public per-instance hostname (a name in a zone whose labels are legal slugs — §23's squatting argument).

**5. A route is moved by upsert, never by delete-then-insert.** `GET /id/<route>`, then `PATCH /id/<route>` if it exists or `PUT …/routes/0` if it does not. The brief measured 4 wildcard answers in 320 requests across 20 delete-then-insert moves and none across 20 in-place moves.

**6. Every route sets `X-Manifest-Instance`, with the headers handler deferred.** Deferral makes the edge's value replace an app's copy rather than sit beside it; it applies to §20's four security headers too, which is what "protections live where an app cannot remove them" means. Task 1 measures both halves before anything relies on it.

**7. Promotion is verified through the edge, by identity.** A 200 whose `X-Manifest-Instance` is this instance. A status alone cannot tell the app from the wildcard (P4b finding 193), and the wildcard carries no such header. A verification that fails puts the previous route back and refuses the deploy.

**8. `servingInstance` reads Caddy's configuration, not the wire.** The route's dial address is the platform's own record of what serves; the wire check belongs inside `ensureInstance`, the Docker tier and the acceptance. A wire-only answer would report `undefined` for an app that is merely slow.

**9. The drain polls `/reverse_proxy/upstreams` for the old dial every 250 ms, and one zero ends it.** After the move no new request can select the old upstream, so the count does not rise again. **Task 1 decides what an *unlisted* upstream means** — `UNLISTED_UPSTREAM_IS_IDLE` in `runtime/docker/driver.ts` is set to what it measured, and if the counter does not survive the move at all, the drain waits the full bound (R4).

**10. A never-ready instance is left in place for its Incident, and the CALLER removes it.** §11 as applied says an instance that never becomes ready "is removed once its Incident is captured (§14)", and `captureIncident` reads the exit code and the last 200 log lines **through the handle**. A driver that removed it first would hand the Incident nothing. *This corrects the design conversation's Section 3, which had the driver removing it.*

**11. `retireInstance` refuses an instance that ANY route dials**, not only the hostname it was created for. The check reads every route's upstream, so a container from before P4c — which has no hostname label — is protected by the same line. It is the second guard behind the control plane's own selection, and it gets its own negative control.

**12. The retirer does nothing when `servingInstance` answers `undefined`.** After an edge restart every instance reads as non-serving, and R7 would then remove the live app. A run that finds nothing serving records why and stops. This is the most dangerous line in the plan and it is tested in both directions.

**13. The AI-gateway detach happens inside the Docker driver's retire, under a per-app-network in-process mutex shared with `ensureInstance`'s attach-and-create.** Without it a deploy of an AI release that starts while a retire is deciding can lose its gateway — and P4b finding 181 measured what that costs a student: 611 s. One control-plane process serves the platform; a second process against one daemon is not a Phase 1 configuration, and the mutex says so. *This corrects the design conversation's Sections 3 and 4, which left the detach unguarded.*

**14. The environment lock is a Postgres advisory lock on a dedicated pooled connection**, held from the instance row's insert to the `Route` row's update and **released before any drain**. `pg_advisory_lock(hashtextextended('manifest:environment:<id>', 0))`, unlocked on the same connection in a `finally`. *Rejected:* an in-process mutex — `pnpm test` and a running control plane are two processes against one database, and only Postgres sees both; `pg_advisory_xact_lock`, which would require the whole deploy inside one transaction, which its pooled writes and published events are not. **What it costs, stated rather than discovered:** each holder keeps one pooled connection for the length of its deploy, so the pool's size bounds how many *different* environments can deploy at once (`pg.Pool`'s default maximum is 10). One developer's laptop is not near that; a queue belongs with Phase 4's reconciler, and §20's *Availability* already bounds builds the same way.

**15. An AI key is stored per instance, at the mint.** Secret name `app:llmApiKey:<instanceId>`; `AiKeyService` becomes `mintAppKey` / `storeInstanceKey` / `revokeInstanceKey` / `revokeLegacyAppKey` / `discardAppKey`, and **`commitAppKey` is deleted once its caller is gone** (Task 8). The environment-level `app:llmApiKey` from P4b is revoked and deleted the first time an environment whose serving instance has a `Route` record is retired. This also closes half of P4b's "a minted key can outlive a failed deploy": a key whose discard failed stays recorded, and the next retire revokes it.

**16. The `Route` row is upserted on `hostname` and its foreign key cascades.** A route is not an audit record; when an instance row goes, its route record goes with it. §20's `ON DELETE RESTRICT` argument applies to `audit.events`, not here.

**17. A successful deploy marks every other non-gone instance row of the environment `destroying`, under the lock.** The rows are how a console sees what is happening; the containers are what the retirer actually reads.

**18. A health check that fails AFTER promotion puts the previous route back.** `ensureInstance` resolves once the edge reaches the new instance, and the container's own `HEALTHCHECK` can still disagree within `waitForHealth`. `restoreRoute(previous)` then retires the new one — the same failure semantics as never-ready, reusing the method boot needs anyway.

**19. The retirer runs at most one pass per environment at a time, coalesces requests, and never throws.** A failure is an `instance.retire_failed` event and a line on stderr; the next deploy or boot tries again (§11: "there is no silent retry"). `idle()` exists for tests and for the acceptance.

**20. Boot restores routes from the `Route` records, ends interrupted deploys, and schedules the sweeps.** A route whose container is gone is reported on stderr and does not stop the boot. **There is no backfill** for apps deployed before P4c: a backfilled row would name a container with no hostname label, which `restoreRoute` refuses. Such an app gets its record at its first P4c deploy.

**21. The drain bound is `MANIFEST_DRAIN_TIMEOUT_MS`, default 120000**, beside `MANIFEST_READINESS_TIMEOUT_MS` in `config.ts`.

**22. `reapplyAllRoutes` is deleted.** It has no caller and `restoreRoute` replaces it. A function with no call site is this project's most-repeated defect; leaving this one while adding its replacement would be the fourth instance.

**23. The contract suite's continuity block is enabled per driver by a fixture.** The fake driver supplies it in Task 2, the Docker driver in Task 5. Between those sittings the Docker tier runs the pre-P4c contract tests and says in the suite name why the rest are skipped.

**24. `fixture-node@1`'s skeleton gains `/hold?ms=`, and `ensureContractRepo` becomes stamp-aware.** The drain tests need a request the app holds open. `ensureContractRepo` returns early when `/tmp/repo` exists, so without a stamp the contract suite would keep testing the skeleton as it was before this task — the same shape as the stale bare repo that made a negative control pass against an app it had already edited (P4a, ORIENTATION §4).

**25. The acceptance's failed release is a manifest whose `health:` path nothing answers.** `fixtures/proof-app/manifest.yaml` line 14 is `health: /healthz`; the failing release changes it to `/never-ready` and changes nothing else, so the app still declares `ai.models` and the deploy still mints a key that must be revoked. *Rejected:* a boot-failure hook in the proof app (a test switch inside §16's proof app), and a resource ceiling low enough to be killed (unpredictable, and it tests the ceiling rather than the deploy).

**26. The acceptance classifies every response by body AND by identity header**, counts `reset` separately from failure (R1), and runs every phase before failing, listing each failed assertion. A red run is then a measurement, which is what Task 1 needs it to be.

**27. Sessions expire after 8 hours and are refreshed at most every 5 minutes.** Eight hours matches passport-saml's own `requestIdExpirationPeriodMs` default and a working day; `touchAfter` keeps a read-only request from writing. Nothing is lost by choosing it: today every session ends at the next redeploy.

**28. The blueprint stays `node-ts-mongo@1`.** Adding a dependency and a module permits more and breaks no app, exactly as P4b's `provides.ai` flip did.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec or from a dated measurement.

- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck`, `pnpm format:check`. **Run `pnpm test` twice** — a suite that is not repeatable has a state leak.
- **`pnpm test:docker` too**, for every task from 2 onwards. It needs `make up`, takes ~8 minutes, and **fails rather than skips** when asked to run.
- **`pnpm test -- <filter>` does not filter.** One file: `pnpm exec vitest run --project unit src/<path>`; one Docker file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`.
- **Vitest strips types; it does not check them.** `exactOptionalPropertyTypes` is on: `hint: cond ? x : undefined` is a type error, conditional spread is the fix.
- **The spec's P4c actions are already applied** (commit `888d9d1`). Any *further* spec change is recorded in *Spec actions proposed by this plan* and put to Rich; never edited directly.
- **Ask before `sudo`.** It cannot prompt from a tool call.
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`. `sed -i` takes an argument: `sed -i ''`.
- **The zone is `*.manifest.internal`**, ports **7100–7199**, and everything binds `127.0.0.1` explicitly — never `localhost`, which resolves to `::1` and times out.
- **Never touch Valet**, and these four containers must survive: `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **Base images are pinned by digest and blueprint dependencies by exact version** (C6, D30). `descriptorSchema` refuses anything but `x.y.z`.
- **`request.log.error` writes nothing** under `Fastify({ logger: false })`. Use `console.error` for anything an operator must see, and **never** put a key, a secret or a third-party error body in it (§14).
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built and naming the test that goes red.
- **Every task names its caller.** A module with no call site is not built — this project has shipped that defect three times, twice with passing tests. Task 7's caller arrives in Task 8, in the next sitting, and that is stated in Task 7 rather than left to be noticed.
- **Cleaning up after a Docker-tier run has traps**: repeated `name` filters OR (P4b 192), repeated `label` filters AND (measured 2026-09-15), `docker rm -f` exits 0 for a name that does not exist, each instance holds a **named** `…-app-files` volume (194), and `docker volume ls -f dangling=true` lists other people's volumes. Remove by explicit name and list afterwards.
- **`pnpm test:docker` restarts the edge**, which drops every runtime route, and `pnpm test` truncates the control plane's tables. After either, a demo app is unreachable until it is redeployed or the control plane is restarted (Task 9 makes the restart enough).
- **The agent's shell is zsh**: `path` is tied to `$PATH`, `ls` is aliased, `grep` is `ugrep` (use `-F` for a pattern with `$`), an unquoted variable is not word-split, and a word starting with `=` is expanded. Two Bash calls issued together share one shell — use absolute paths.
- **Leave the machine as you found it.** `./scripts/snapshot-machine.sh > /tmp/before.txt` before, the same after, and `diff` them.
- **Commit after every task**, on `main`, conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- **Test fixtures named in a snippet and not defined are local to that test file** — `fakeCaddy`, `fakeAdmin`, `recordingAi`, `recordingDriver`, `releaseWith`, `fixture`, `waitUntil`, `sleep`, `holdThrough`, `loopThroughEdge`. Write each beside the test that uses it; none belongs in `src/`.

**What this plan does not create.** No reconciler, no crash-loop detection, no hibernation caller, no multi-host anything, no production database blue/green, no control-plane restart that keeps its WebSockets open, and no change to how a release is approved. Those are Phase 4's, Phase 2's and P6's; see *What this plan does not build*.

---

## File Structure

```
scripts/
├── demo-redeploy.sh                      NEW  Task 1 (red), Task 11 (green)
├── lib/redeploy-loop.mjs                 NEW  classifies by body AND identity header
└── lib/redeploy-summary.mjs              NEW  counts each class per phase window
Makefile                                  MOD  demo-redeploy target
docs/superpowers/spikes/p4c-baseline/
└── p4c-measure-edge.sh                   NEW  Task 1's five measurements

packages/control-plane/src/
├── runtime/
│   ├── driver.ts                         MOD  InstanceSpec.instanceId + hostname;
│   │                                          retireInstance/servingInstance/
│   │                                          listInstances/restoreRoute;
│   │                                          DriverRefusalError; instanceName(4)
│   ├── fake-driver.ts                    MOD  routes, in-flight, neverReady, affordances
│   ├── driver-contract.ts                MOD  the continuity block (§11 Redeploys)
│   ├── state-machine.ts                  MOD  the `interrupted` event
│   ├── index.ts                          MOD  exports
│   └── docker/
│       ├── names.ts                      MOD  instanceAlias, LABEL
│       ├── containers.ts                 NEW  listContainers/inspectApp by label
│       ├── keyed-mutex.ts                NEW  one app network at a time (Decision 13)
│       ├── probes.ts                     NEW  privateProbe — curl inside the edge
│       ├── instances.ts                  MOD  labels, alias, refusal instead of replace
│       ├── networks.ts                   MOD  EDGE_NEIGHBOUR, detachAiGatewayIfUnused
│       ├── driver.ts                     MOD  ensureInstance rewritten; the four methods
│       ├── redeploy.docker.test.ts       NEW  a takeover under a request loop
│       └── testing.ts                    MOD  stamped contract repo; routing override
├── routing/
│   ├── caddy.ts                          MOD  identity header (deferred), getRoute,
│   │                                          patchRoute, upstreams
│   ├── routes.ts                         MOD  applyRoute upserts; servingRoute,
│   │                                          inFlightTo, upstreamsInUse;
│   │                                          reapplyAllRoutes DELETED
│   ├── readiness.ts                      MOD  edgeIdentityProbe, waitForIdentity
│   └── index.ts                          MOD  exports
├── db/
│   ├── schema.ts                         MOD  routes table; events CHECK + 3 types
│   ├── locks.ts                          NEW  withEnvironmentLock
│   ├── testing.ts                        MOD  TRUNCATE list gains `routes`
│   └── index.ts                          MOD  exports
├── secrets/store.ts                      MOD  deleteSecret
├── ai/keys.ts                            MOD  per-instance keys; commitAppKey deleted
├── observability/events.ts               MOD  three retire event types
├── releases/
│   ├── release.ts                        MOD  the lock, the instance id, the Route row,
│   │                                          the failure that leaves the app up
│   ├── retire.ts                         NEW  the background retirer
│   ├── recover.ts                        NEW  recoverAtBoot
│   └── redeploy.docker.test.ts           NEW  deployRelease + retirer, real driver
├── api/
│   ├── server.ts                         MOD  ServerDeps.retirer
│   ├── routes/delivery.ts                MOD  serving instance from the Route row
│   └── testing.ts                        MOD  the retirer in testDeps
├── config.ts                             MOD  MANIFEST_DRAIN_TIMEOUT_MS
└── index.ts                              MOD  the retirer, and recovery before listen
packages/control-plane/drizzle/0009_*.sql NEW  routes + the event-type CHECK
packages/control-plane/vitest.global-setup.ts MOD  TRUNCATE list gains `routes`

blueprints/
├── fixture-node/skeleton/server.js       MOD  /hold?ms= for the drain tests
└── node-ts-mongo/
    ├── skeleton/auth/session.js          NEW  express-session over the app's Mongo
    ├── skeleton/server.js                MOD  uses it
    ├── skeleton/package.json             MOD  connect-mongo 6.0.0
    ├── skeleton/package-lock.json        MOD  regenerated (network on)
    ├── blueprint.yaml                    MOD  the same pin
    └── agents/AGENTS.md                  MOD  "Two releases run at once"
fixtures/proof-app/server.js              MOD  uses the blueprint's session module
```

---
## Task 1: The acceptance, watched failing — and the five measurements everything else rests on

**Why first and alone.** Every worst defect in this project arrived the first time something ran end to end, and this plan's brief says so in its own §8. So the acceptance is written against the platform **as P4b left it**, run, and watched failing with the numbers the final acceptance will be compared against. Five facts the design depends on are measured in the same sitting, before any code is built on them.

**Files:**
- Create: `scripts/lib/redeploy-loop.mjs`
- Create: `scripts/lib/redeploy-summary.mjs`
- Create: `scripts/demo-redeploy.sh`
- Create: `docs/superpowers/spikes/p4c-baseline/p4c-measure-edge.sh`
- Create: `docs/superpowers/spikes/p4c-baseline/results-task1-2026-09-15.txt` (the run's output; name it for the day it ran)
- Modify: `Makefile` (the `demo-redeploy` target and `.PHONY`)
- Modify: this plan's *What executing this plan found*

**Interfaces:**
- Produces: `node scripts/lib/redeploy-loop.mjs <url> <out.ndjson> <intervalMs> <stopFile>` — appends `{t, ms, status, cls, instance}` per request, where `cls` is `app` | `wildcard` | `502-empty` | `reset` | `status-<n>` | `error-<code>`, and `instance` is the edge's `X-Manifest-Instance` or `null`. `APP_MARKER` (default `"mongo":true`) is the substring an app body carries.
- Produces: `node scripts/lib/redeploy-summary.mjs [--bad] <loop.ndjson> <markers.ndjson>` — one JSON line per phase, or with `--bad` the single number of responses in any phase window that were neither `app` nor `reset`.
- Produces: `bash scripts/demo-redeploy.sh` — runs every phase, prints `ok`/`FAIL` per assertion, exits 1 listing the failures.
- Consumes: `scripts/lib/proof-app.sh` (`proof_app_project`, `proof_app_push`, `proof_app_validate`, `proof_app_deploy`, `api`, `app`, `field`, `json`, `environment`), `infra/lib/idp-login.sh` (`idp_login`), `infra/lib/common.sh` (`ZONE`, `CA_FILE`, `PORT_CADDY_ADMIN`), `scripts/lib/event-stream.mjs` (`watch`).

- [ ] **Step 1: Snapshot the machine**

```bash
./scripts/snapshot-machine.sh > /tmp/p4c-task1-before.txt
```

- [ ] **Step 2: Write the request loop**

`scripts/lib/redeploy-loop.mjs`:

```js
// A request loop that classifies every response by its BODY and by the edge's
// X-Manifest-Instance header (P4c Task 1).
//
//   node scripts/lib/redeploy-loop.mjs <url> <out.ndjson> <intervalMs> <stopFile>
//
// Ported from docs/superpowers/spikes/p4c-baseline/p4c-loop.mjs, which measured the
// baseline this plan is judged against. THE STATUS IS NEVER EVIDENCE: the edge's
// wildcard answers 200 for a hostname it holds no route to (P4b finding 193), so the
// body says whether an app answered and the header says WHICH instance did.
//
// `reset` is its own class and not a failure: §11 records that every admin change
// reloads Caddy's configuration and that a reload occasionally resets a connection —
// about one request in 300 per change, on any app (measured 2026-09-15).
import { appendFileSync, existsSync } from 'node:fs'

const [url, out, interval, stop] = process.argv.slice(2)
if (stop === undefined) {
  console.error('usage: redeploy-loop.mjs <url> <out.ndjson> <intervalMs> <stopFile>')
  process.exit(2)
}
const marker = process.env.APP_MARKER ?? '"mongo":true'
const RESET_CODES = new Set(['ECONNRESET', 'UND_ERR_SOCKET', 'EPIPE'])

const classify = (status, body) => {
  if (status === 200 && body.startsWith('manifest OK')) return 'wildcard'
  if (status === 200 && body.includes(marker)) return 'app'
  if (status === 502 && body.trim() === '') return '502-empty'
  return `status-${status}`
}

while (!existsSync(stop)) {
  const t = Date.now()
  let record
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const body = await response.text()
    record = {
      t,
      ms: Date.now() - t,
      status: response.status,
      cls: classify(response.status, body),
      instance: response.headers.get('x-manifest-instance'),
    }
  } catch (error) {
    const code = error.code ?? error.cause?.code ?? error.name
    record = {
      t,
      ms: Date.now() - t,
      status: 0,
      cls: RESET_CODES.has(code) ? 'reset' : `error-${code}`,
      instance: null,
    }
  }
  appendFileSync(out, `${JSON.stringify(record)}\n`)
  const wait = Number(interval) - (Date.now() - t)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}
```

- [ ] **Step 3: Write the summary**

`scripts/lib/redeploy-summary.mjs`:

```js
// node scripts/lib/redeploy-summary.mjs [--bad] <loop.ndjson> <markers.ndjson>
//
// One line per phase — a `<phase>-start` / `<phase>-end` marker pair — counting each
// class of response from the phase's start until TAIL_MS (default 5000) after its end,
// because the window that matters ends when the app is serving again, not when the
// deploy call returns. `--bad` prints one number: responses that were neither `app`
// nor `reset`, which is what the acceptance asserts is zero.
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const badOnly = argv[0] === '--bad'
const [loopPath, markPath] = badOnly ? argv.slice(1) : argv
const read = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const rows = read(loopPath)
const marks = read(markPath)
const at = (name) => marks.find((m) => m.name === name)?.t
const tail = Number(process.env.TAIL_MS ?? 5000)
let bad = 0

for (const phase of [...new Set(marks.map((m) => m.name.replace(/-(start|end)$/, '')))]) {
  const start = at(`${phase}-start`)
  const end = at(`${phase}-end`)
  if (start === undefined || end === undefined) continue
  const window = rows.filter((r) => r.t >= start && r.t <= end + tail)
  const counts = {}
  for (const r of window) counts[r.cls] = (counts[r.cls] ?? 0) + 1
  const wrong = window.filter((r) => r.cls !== 'app' && r.cls !== 'reset')
  bad += wrong.length
  if (!badOnly) {
    console.log(
      JSON.stringify({
        phase,
        deployMs: end - start,
        requests: window.length,
        counts,
        instancesSeen: [...new Set(window.map((r) => r.instance).filter(Boolean))],
        firstWrongAtMs: wrong[0] === undefined ? null : wrong[0].t - start,
        lastWrongEndedMs:
          wrong.length === 0 ? null : wrong.at(-1).t + wrong.at(-1).ms - start,
      }),
    )
  }
}
if (badOnly) console.log(bad)
```

- [ ] **Step 4: Write the acceptance**

`scripts/demo-redeploy.sh`. It is long because it is the whole acceptance; every assertion in it is one the final sitting must make green.

```bash
#!/usr/bin/env bash
# P4c's acceptance: a redeploy of §16's proof app interrupts nobody using it.
#
# A THIN WRAPPER, like demo.sh, demo-identity.sh and demo-ai.sh: the logic under test
# lives in the Docker-tier suites, and a demo that reimplements any of it drifts into
# proving something else. It drives the real HTTP API with curl, the real event stream
# with the dependency-free subscriber, and the deployed app through the edge over TLS.
#
# WHAT IT PROVES, each as the shape of an answer rather than its arrival:
#   5  a SAME-release redeploy, under a /healthz loop classified by body AND by the
#      edge's X-Manifest-Instance header and a signed-in student asking questions back
#      to back: no 5xx, no wildcard page, no 401, every question answered — and the
#      header names the new instance afterwards;
#   6  the same for a NEW-release redeploy;
#   7  after each: exactly one app container for the app, no files volume without a
#      container, and exactly one live LiteLLM key for the app's user — and the key the
#      retired instance held is gone only AFTER the stream said it was retired;
#   8  a release that never becomes ready leaves the previous instance serving — the
#      header still names it — with an Incident, its container gone and no second key.
#
# IT RUNS EVERY PHASE AND FAILS AT THE END, listing every assertion that failed, so a
# red run is a measurement. Task 1 runs it against the platform as P4b left it.
#
# macOS ships bash 3.2 and a BSD userland: no associative arrays, no `mapfile`, no
# `xargs -r`, no `readlink -f`, and `sed -i` takes an argument.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../infra/lib/common.sh
. infra/lib/common.sh
# shellcheck source=../infra/lib/idp-login.sh
. infra/lib/idp-login.sh
# shellcheck source=lib/proof-app.sh
. scripts/lib/proof-app.sh

API="${MANIFEST_API:-http://127.0.0.1:7100}"
SLUG="${DEMO_SLUG:-proof-app}"
CA="$ROOT/$CA_FILE"
APP_URL="https://$SLUG.staging.$ZONE"
LITELLM="${MANIFEST_LITELLM_URL:-http://127.0.0.1:7106}"

OUT="$(mktemp -d -t mf-redeploy)"
CP_JAR="$OUT/cp.jar"; IDP_CP_JAR="$OUT/idp-cp.jar"
STU_JAR="$OUT/stu.jar"; IDP_STU_JAR="$OUT/idp-stu.jar"
FRAMES="$OUT/frames.ndjson"; MARKS="$OUT/markers.ndjson"
LOOP="$OUT/loop.ndjson"; ASKS="$OUT/asks.log"
WORK=""; WATCHER=""; LOOPER=""; ASKER=""; FAILURES=""

cleanup() {
  touch "$OUT/stop" 2>/dev/null || true
  for pid in "$WATCHER" "$LOOPER" "$ASKER"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
  done
  [ -n "$WORK" ] && rm -rf "$WORK"
  # A red run is EVIDENCE: its raw output is kept and its path printed.
  if [ -z "$FAILURES" ]; then rm -rf "$OUT"; else echo "raw output kept in $OUT" >&2; fi
  return 0
}
# ONE trap, registered once (P4a defect 70).
trap cleanup EXIT

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
# `fail` is for a PRECONDITION — the platform is not up, the fixture is not there.
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
# `check` is for an ASSERTION: every one runs, and the run reports all of them.
check() {
  local what="$1"; shift
  if "$@"; then
    echo "  ok   $what"
  else
    echo "  FAIL $what"
    FAILURES="$FAILURES
  - $what"
  fi
}
now()  { node -e 'console.log(Date.now())'; }
mark() { printf '{"name":"%s","t":%s}\n' "$1" "$(now)" >> "$MARKS"; }

# WHICH INSTANCE THE EDGE REACHES, read off the edge's own response header. A body
# alone cannot say which of two identical containers answered.
serving_now() {
  curl -sS --cacert "$CA" -m 10 -o /dev/null -D - "$APP_URL/healthz" \
    | tr -d '\r' | sed -n 's/^[Xx]-[Mm]anifest-[Ii]nstance: //p' | tail -1
}
# Every app container of this app: `manifest.release` is carried by app containers and
# not by the database or the egress proxy, and repeated `label` filters AND.
app_containers() {
  docker ps -a --filter "label=manifest.slug=$SLUG" --filter label=manifest.release \
    --format '{{.Names}}' | grep -c . | tr -d ' '
}
# A files volume with no container is an SP private key nobody is using (P4b 194).
orphan_files_volumes() {
  local n=0 volume
  for volume in $(docker volume ls --format '{{.Name}}' \
      | grep -E "^mf-$SLUG-staging-.*-app-files$"); do
    docker container inspect "${volume%-files}" >/dev/null 2>&1 || n=$((n + 1))
  done
  echo "$n"
}
# Live keys for THIS app's LiteLLM user — `mf-<projectId>-<environment>` (ai/keys.ts).
app_keys() {
  curl -sS -m 15 -G -H "Authorization: Bearer $MASTER" "$LITELLM/key/list" \
    --data-urlencode "user_id=mf-$PROJECT_ID-staging" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(Array.isArray(j.keys)?j.keys.length:-1)})'
}
containers_for_release() {
  docker ps -a --filter "label=manifest.release=$1" --format '{{.Names}}' | grep -c . | tr -d ' '
}
incident_for() {
  api GET "/environments/$ENV_ID/incidents" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const rows=j.incidents??j;process.exit(rows.some(i=>i.instanceId===process.argv[1])?0:1)})' "$1"
}
# The stream said this instance was retired — never a sleep: the drain is bounded at
# 120 s and a fixed wait would either be too short or make every run take that long.
wait_retired() {
  local i
  for i in $(seq 1 300); do
    grep -F '"type":"instance.retired"' "$FRAMES" | grep -qF "\"instanceId\":\"$1\"" && return 0
    sleep 0.5
  done
  return 1
}
redeploy() { # $1 phase  $2 release id   -> sets DEPLOYED
  mark "$1-start"
  DEPLOYED="$(api POST "/environments/$ENV_ID/deploy" "{\"releaseId\":\"$2\"}")"
  mark "$1-end"
}

say "0. Is the control plane up?"
curl -sS -m 5 -o /dev/null "$API/auth/me" \
  || fail "no control plane at $API. README's 'Running the control plane' has the exact
commands — and check the boot line says {\"driver\":\"docker\"}, because every claim
this demo makes is meaningless against the fake one."
MASTER="$(sed -n 's/^LITELLM_MASTER_KEY=//p' .env)"
[ -n "$MASTER" ] || fail "no LITELLM_MASTER_KEY in .env to read LiteLLM's keys with"
echo "  $API answered"

say "1. Log in to Manifest itself with CWL (§9: Manifest is its own SP)"
idp_login "$CP_JAR" "$IDP_CP_JAR" "$API/auth/login" instructor instructor \
  "$API/auth/saml/callback" "$CA"

say "2. The proof app, deployed and healthy — the instance every later phase replaces"
proof_app_project
proof_app_push
proof_app_validate
proof_app_deploy "make demo-redeploy: the instance a redeploy replaces"
BASE_RELEASE="$RELEASE_ID"
BASE_INSTANCE="$(api GET "/environments/$ENV_ID" | field instance.id)"

say "3. Subscribe to the project's event stream"
node scripts/lib/event-stream.mjs watch "$API" "$PROJECT_ID" "$CP_JAR" "$FRAMES" &
WATCHER=$!
for _ in $(seq 1 40); do
  grep -qF '"manifest.stream.ready"' "$FRAMES" && break
  kill -0 "$WATCHER" 2>/dev/null || fail "the stream subscriber exited: $(cat "$FRAMES")"
  sleep 0.5
done
grep -qF '"manifest.stream.ready"' "$FRAMES" \
  || fail "WS /projects/$PROJECT_ID/events sent no ready frame within 20 s"

say "4. A student signs in, writes a note, and the two loops start"
idp_login "$STU_JAR" "$IDP_STU_JAR" "$APP_URL/login" student student \
  "$APP_URL/auth/ubcshib/callback" "$CA"
app "$STU_JAR" POST /api/notes \
  "{\"text\":$(json "My favourite element is xenon. (redeploy demo)")}" > /dev/null
NODE_EXTRA_CA_CERTS="$CA" \
  node scripts/lib/redeploy-loop.mjs "$APP_URL/healthz" "$LOOP" 200 "$OUT/stop" &
LOOPER=$!
# The student asks BACK TO BACK, so a question is always in flight when a route moves —
# which is the only way to exercise a drain, and an AI call that starts during one.
(
  while [ ! -f "$OUT/stop" ]; do
    t0="$(now)"
    code="$(curl -sS --cacert "$CA" -b "$STU_JAR" -m 180 -X POST \
      -H 'content-type: application/json' \
      -d '{"question":"What is my favourite element?"}' \
      -o "$OUT/ask-body" -w '%{http_code}' "$APP_URL/api/ask" 2>/dev/null)"
    printf '%s %s %s %s\n' "$t0" "$(now)" "$code" \
      "$(head -c 300 "$OUT/ask-body" | tr -d '\n' | sed -n 's/.*"code":"\([A-Z_]*\)".*/\1/p')" \
      >> "$ASKS"
  done
) &
ASKER=$!
sleep 8

say "5. A SAME-release redeploy, while both loops run"
PREVIOUS="$BASE_INSTANCE"
redeploy same-release "$BASE_RELEASE"
SAME_INSTANCE="$(printf '%s' "$DEPLOYED" | field id 2>/dev/null || echo none)"
check "same-release: the deploy is healthy" \
  [ "$(printf '%s' "$DEPLOYED" | field state 2>/dev/null || echo none)" = healthy ]
check "same-release: the edge names the new instance" [ "$(serving_now)" = "$SAME_INSTANCE" ]
check "same-release: the previous instance was retired within 150 s" wait_retired "$PREVIOUS"
check "same-release: exactly one app container is left" [ "$(app_containers)" = 1 ]
check "same-release: no files volume without a container" [ "$(orphan_files_volumes)" = 0 ]
check "same-release: LiteLLM holds exactly one key for the app" [ "$(app_keys)" = 1 ]

say "6. A NEW-release redeploy"
proof_app_push
proof_app_validate
NEW_BUILD="$(api POST "/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}" | field id)"
NEW_RELEASE="$(api POST "/projects/$PROJECT_ID/releases" \
  "{\"buildId\":\"$NEW_BUILD\",\"summary\":\"make demo-redeploy: a new release\"}" | field id)"
PREVIOUS="$SAME_INSTANCE"
redeploy new-release "$NEW_RELEASE"
NEW_INSTANCE="$(printf '%s' "$DEPLOYED" | field id 2>/dev/null || echo none)"
check "new-release: the deploy is healthy" \
  [ "$(printf '%s' "$DEPLOYED" | field state 2>/dev/null || echo none)" = healthy ]
check "new-release: the edge names the new instance" [ "$(serving_now)" = "$NEW_INSTANCE" ]
check "new-release: the previous instance was retired within 150 s" wait_retired "$PREVIOUS"
check "new-release: exactly one app container is left" [ "$(app_containers)" = 1 ]
check "new-release: LiteLLM holds exactly one key for the app" [ "$(app_keys)" = 1 ]

say "7. A release that never becomes ready — the previous instance keeps serving"
# ONE LINE of manifest.yaml, and nothing else: the app still declares ai.models, so this
# deploy still mints a key that must be revoked, and it still builds and releases
# cleanly. What it cannot do is answer at its health path.
proof_app_push
if grep -q '^health:' "$WORK/manifest.yaml"; then
  sed -i '' 's|^health:.*|health: /never-ready|' "$WORK/manifest.yaml"
else
  printf '\nhealth: /never-ready\n' >> "$WORK/manifest.yaml"
fi
grep -q '^health: /never-ready$' "$WORK/manifest.yaml" \
  || fail "the failing release's manifest.yaml was not edited — nothing would be proved"
git -C "$WORK" -c user.name=manifest -c user.email=manifest@localhost \
  commit -qam 'test: a release that never becomes ready'
git -C "$WORK" push -q origin HEAD:main
COMMIT="$(git -C "$WORK" rev-parse HEAD)"
proof_app_validate
FAIL_BUILD="$(api POST "/projects/$PROJECT_ID/builds" "{\"commitSha\":\"$COMMIT\"}" | field id)"
FAIL_RELEASE="$(api POST "/projects/$PROJECT_ID/releases" \
  "{\"buildId\":\"$FAIL_BUILD\",\"summary\":\"make demo-redeploy: a release that never becomes ready\"}" | field id)"
redeploy failed-release "$FAIL_RELEASE"
FAILED_INSTANCE="$(printf '%s' "$DEPLOYED" | field id 2>/dev/null || echo none)"
check "failed release: the deploy is recorded failed" \
  [ "$(printf '%s' "$DEPLOYED" | field state 2>/dev/null || echo none)" = failed ]
check "failed release: the edge still names the instance that was serving" \
  [ "$(serving_now)" = "$NEW_INSTANCE" ]
check "failed release: an Incident names the failed instance" incident_for "$FAILED_INSTANCE"
check "failed release: the failed release left no container" \
  [ "$(containers_for_release "$FAIL_RELEASE")" = 0 ]
check "failed release: no files volume without a container" [ "$(orphan_files_volumes)" = 0 ]
check "failed release: LiteLLM still holds exactly one key for the app" [ "$(app_keys)" = 1 ]

say "8. What the loops saw"
touch "$OUT/stop"
wait "$LOOPER" 2>/dev/null; LOOPER=""
wait "$ASKER"  2>/dev/null; ASKER=""
kill "$WATCHER" 2>/dev/null; wait "$WATCHER" 2>/dev/null; WATCHER=""
node scripts/lib/redeploy-summary.mjs "$LOOP" "$MARKS"
BAD="$(node scripts/lib/redeploy-summary.mjs --bad "$LOOP" "$MARKS")"
RESETS="$(grep -c '"cls":"reset"' "$LOOP" | tr -d ' ')"
ASKED="$(grep -c . "$ASKS" | tr -d ' ')"
ASK_FAILS="$(awk '$3 != 200' "$ASKS" | grep -c . | tr -d ' ')"
check "no 5xx and no wildcard answer in any redeploy window" [ "$BAD" = 0 ]
check "every question was answered 200 ($ASKED asked)" [ "$ASK_FAILS" = 0 ]
check "nobody was signed out" [ "$(awk '$3 == 401' "$ASKS" | grep -c . | tr -d ' ')" = 0 ]
echo "  resets: $RESETS (tolerated — an edge configuration reload, §11)"

if [ -n "$FAILURES" ]; then
  printf '\n\033[31mFAILED:%s\033[0m\n' "$FAILURES" >&2
  exit 1
fi
say "Done."
cat <<SUMMARY
  $APP_URL          sign in, write a note, ask about it — through a redeploy

  What this proved that a health check cannot: the app changed release while people
  were using it, nobody was signed out, no question failed, and the instance it
  replaced was drained, its key revoked and its container and files volume removed.
SUMMARY
```

- [ ] **Step 5: Add the target**

In `Makefile`, beside `demo-ai`, and on the `.PHONY` line:

```make
demo-redeploy: up  ## P4c's acceptance: a redeploy nobody using the app notices.
	@bash scripts/demo-redeploy.sh
```

- [ ] **Step 6: Write the measurement script**

`docs/superpowers/spikes/p4c-baseline/p4c-measure-edge.sh`. It takes two upstream addresses to move a throwaway route between — pass the two proof-app containers the Task 1 run leaves behind — and removes everything it creates, by explicit name.

```bash
#!/usr/bin/env bash
# P4c Task 1: the five facts this plan's design rests on, measured BEFORE anything is
# built on them. Needs `make up`. Creates one throwaway route and up to five throwaway
# containers, and removes each by explicit name at the end.
#
#   bash p4c-measure-edge.sh <containerA:port> <containerB:port>
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
. "$ROOT/infra/lib/common.sh"
A="${1:?usage: p4c-measure-edge.sh <containerA:port> <containerB:port>}"
B="${2:?}"
ADMIN="http://127.0.0.1:$PORT_CADDY_ADMIN"
CA="$ROOT/$CA_FILE"
HOST="p4c-measure.staging.$ZONE"
RID=p4c-measure
SLOW=p4c-measure-slow; FORGE=p4c-measure-forge
SHORT=p4c-measure-short
LONG="p4c-measure-$(printf 'x%.0s' $(seq 1 60))"   # 72 characters: past DNS's 63
S="${P4C_OUT:-${TMPDIR:-/tmp}/p4c-task1}"; mkdir -p "$S"

say() { printf '\n== %s\n' "$*"; }
adm() { # method path [body]
  if [ -n "${3:-}" ]; then
    curl -sS -m 10 -X "$1" -H 'content-type: application/json' --data-binary "$3" \
      -o /dev/null -w '%{http_code}' "$ADMIN$2"
  else
    curl -sS -m 10 -X "$1" -o /dev/null -w '%{http_code}' "$ADMIN$2"
  fi
}
# THE ROUTE THE PLATFORM BUILDS, not a simplified one: §20's three handlers ahead of the
# proxy, and the identity header, deferred (Decision 6). `deferred` is the variable here.
route() { # dial instanceId deferred
  node -e '
const [dial, instance, deferred] = process.argv.slice(1)
console.log(JSON.stringify({
  "@id": "p4c-measure",
  match: [{ host: [process.env.HOST] }],
  handle: [
    { handler: "request_body", max_size: 10485760 },
    { handler: "rate_limit", rate_limits: { "p4c-measure": { match: [{ remote_ip: { ranges: ["0.0.0.0/0", "::/0"] } }], key: "{http.request.remote.host}", window: "1m", max_events: 1000000 } } },
    { handler: "headers", response: { set: { "X-Content-Type-Options": ["nosniff"], "X-Manifest-Instance": [instance] }, ...(deferred === "true" ? { deferred: true } : {}) } },
    { handler: "reverse_proxy", upstreams: [{ dial }] },
  ],
  terminal: true,
}))' "$1" "$2" "$3"
}
serve() { # name body [extra-header]
  docker run -d --name "$1" --network "$NET" alpine:3.22 sh -c \
    "while true; do printf 'HTTP/1.1 200 OK\r\nContent-Length: ${#2}\r\n${3:-}Connection: close\r\n\r\n$2' | nc -l -p 8080; done" \
    > /dev/null
}
edge_curl() { docker exec manifest-caddy curl -sS -m 5 "$@"; }
probe() { # url args…  — from a container, through the edge, with the platform CA
  docker run --rm --network "$NET" --dns "$DNS_C_IP" -v "$CA:/ca.crt:ro" \
    curlimages/curl:8.11.1 --cacert /ca.crt -sS "$@"
}
upstream_count() { # dial
  curl -sS -m 5 "$ADMIN/reverse_proxy/upstreams" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const u=JSON.parse(s).find(x=>x.address===process.argv[1]);console.log(u?u.num_requests:"unlisted")})' "$1"
}
export HOST

{
say "M1. Does Caddy keep counting an upstream that still has a request in flight after a PATCH moved its route?"
docker rm -f "$SLOW" >/dev/null 2>&1
# Answers after 8 s, so one request is provably in flight while the route moves.
docker run -d --name "$SLOW" --network "$NET" alpine:3.22 sh -c \
  "while true; do { sleep 8; printf 'HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nslow'; } | nc -l -p 8080; done" > /dev/null
echo "create route: $(adm PUT "/config/apps/http/servers/srv0/routes/0" "$(route "$SLOW:8080" m1 true)")"
sleep 1
probe -m 30 -o /dev/null -w 'held request: %{http_code} in %{time_total}s\n' "https://$HOST/" &
HELD=$!
sleep 2
echo "before the move: $(upstream_count "$SLOW:8080")"
echo "patch to B: $(adm PATCH "/id/$RID" "$(route "$A" m1 true)")"
for i in $(seq 1 24); do
  printf 'after the move +%s ms: %s\n' "$((i * 250))" "$(upstream_count "$SLOW:8080")"
  sleep 0.25
done
wait $HELD
echo "M1b. The same, with the old upstream ALSO parked on a second route that nothing reaches:"
echo "park: $(adm PUT "/config/apps/http/servers/srv0/routes/0" "$(node -e '
console.log(JSON.stringify({ "@id": "p4c-measure-park", match: [{ host: ["p4c-park.invalid"] }], handle: [{ handler: "reverse_proxy", upstreams: [{ dial: process.argv[1] }] }], terminal: true }))' "$SLOW:8080")")"
echo "patch to slow: $(adm PATCH "/id/$RID" "$(route "$SLOW:8080" m1 true)")"
sleep 1
probe -m 30 -o /dev/null -w 'held request: %{http_code} in %{time_total}s\n' "https://$HOST/" &
HELD=$!
sleep 2
echo "patch away: $(adm PATCH "/id/$RID" "$(route "$A" m1 true)")"
for i in $(seq 1 24); do
  printf 'parked, after the move +%s ms: %s\n' "$((i * 250))" "$(upstream_count "$SLOW:8080")"
  sleep 0.25
done
wait $HELD
echo "remove the parked route: $(adm DELETE /id/p4c-measure-park)"

say "M2. Does a deferred headers handler REPLACE an app's own X-Manifest-Instance?"
docker rm -f "$FORGE" >/dev/null 2>&1
serve "$FORGE" forged 'X-Manifest-Instance: forged\r\n'
echo "patch to the forging app, deferred=true: $(adm PATCH "/id/$RID" "$(route "$FORGE:8080" edge-value true)")"
probe -o /dev/null -D - "https://$HOST/" | tr -d '\r' | grep -i -e x-manifest-instance -e x-content-type-options
echo "-- the control: the same route with deferred absent"
echo "patch deferred=false: $(adm PATCH "/id/$RID" "$(route "$FORGE:8080" edge-value false)")"
probe -o /dev/null -D - "https://$HOST/" | tr -d '\r' | grep -i -e x-manifest-instance -e x-content-type-options

say "M3. Twenty in-place moves of the REAL route shape, under a request every 25 ms"
: > "$S/m3-loop.ndjson"; : > "$S/m3-marks.ndjson"; rm -f "$S/m3-stop"
APP_MARKER='"mongo":true' NODE_EXTRA_CA_CERTS="$CA" \
  node "$ROOT/scripts/lib/redeploy-loop.mjs" "https://$HOST/healthz" "$S/m3-loop.ndjson" 25 "$S/m3-stop" &
M3=$!
sleep 2
printf '{"name":"patch-moves-start","t":%s}\n' "$(node -e 'console.log(Date.now())')" >> "$S/m3-marks.ndjson"
for i in $(seq 1 20); do
  dial="$A"; [ $((i % 2)) = 1 ] && dial="$B"
  adm PATCH "/id/$RID" "$(route "$dial" "move-$i" true)" > /dev/null
  sleep 0.3
done
printf '{"name":"patch-moves-end","t":%s}\n' "$(node -e 'console.log(Date.now())')" >> "$S/m3-marks.ndjson"
sleep 2; touch "$S/m3-stop"; wait $M3
TAIL_MS=1000 node "$ROOT/scripts/lib/redeploy-summary.mjs" "$S/m3-loop.ndjson" "$S/m3-marks.ndjson"

say "M4. Is a container name longer than DNS's 63-octet label resolvable from the edge?"
docker rm -f "$LONG" "$SHORT" >/dev/null 2>&1
serve "$SHORT" short; serve "$LONG" long
sleep 1
echo "short name (${#SHORT} chars): $(edge_curl -o /dev/null -w '%{http_code}' "http://$SHORT:8080/" || echo 'curl failed')"
echo "long name  (${#LONG} chars): $(edge_curl -o /dev/null -w '%{http_code}' "http://$LONG:8080/" || echo 'curl failed')"
echo "getent from the edge: $(docker exec manifest-caddy getent hosts "$LONG" || echo 'no answer')"

say "M5. Do repeated label filters AND, and do only app containers carry manifest.release?"
docker ps -a --filter "label=manifest.slug=proof-app" --filter label=manifest.release --format '{{.Names}}'
echo "-- with an environment that does not exist (empty means AND):"
docker ps -a --filter "label=manifest.slug=proof-app" --filter label=manifest.environment=nonexistent --format '{{.Names}}'

say "CLEANUP"
echo "remove the route: $(adm DELETE "/id/$RID"); GET it now: $(adm GET "/id/$RID")"
docker rm -f "$SLOW" "$FORGE" "$SHORT" "$LONG" > /dev/null 2>&1
echo "throwaway containers left: $(docker ps -a --format '{{.Names}}' | grep -c '^p4c-measure' | tr -d ' ')"
} 2>&1 | tee "$S/measurements.txt"
```

- [ ] **Step 7: Run the acceptance against the platform as P4b left it, and watch it fail**

```bash
make up
# The control plane, per README's 'Running the control plane'.
bash scripts/demo-redeploy.sh 2>&1 | tee /tmp/p4c-task1-demo.txt
```

Expected: **exit 1**, with `FAIL` lines for the same-release and new-release phases (502s and a signed-out student), for the identity header (no route sets one yet, so `serving_now` is empty), for the container count, and for the failed release (today the route has already moved, so the app is down). Record the exact numbers the summary prints: requests, `502-empty`, `reset`, the window in milliseconds, and how many questions failed.

- [ ] **Step 8: Run the measurements**

```bash
docker ps --filter "label=manifest.slug=proof-app" --filter label=manifest.release --format '{{.Names}}'
bash docs/superpowers/spikes/p4c-baseline/p4c-measure-edge.sh <containerA>:3000 <containerB>:3000
```

Copy the output into `results-task1-2026-09-15.txt` beside the brief's own results file.

- [ ] **Step 9: Turn each measurement into a decision, in writing**

- **M1** → `UNLISTED_UPSTREAM_IS_IDLE` in Task 5. If the count stays 1 until the held request ends, set it `false` is unnecessary — set it **`true`** only if an *unlisted* upstream means idle, i.e. M1 showed the count reaching 0 or the address vanishing **only after** the held request finished. If the address vanishes **while the request is still in flight**, and M1b's parked route keeps it listed, **write this correction at the top of Task 5**: *"The drain parks the old upstream: before the route moves, `applyRoute` also PUTs a route `@id mf-drain-<instanceId>` matching `drain-<instanceId>.invalid` and dialling the old upstream, and `retireInstance` deletes it after the drain. Caddy's upstream pool only counts addresses its configuration references (measured, Task 1 M1)."* If neither keeps counting, set `UNLISTED_UPSTREAM_IS_IDLE = false` and record that every drain waits its full bound (R4 provides for exactly this).
- **M2** → if a deferred handler does not replace the app's header, **write a correction at the top of Task 3** naming what does (a second `headers` handler after the proxy, or `X-Manifest-Instance` removed from the request first).
- **M3** → the wildcard count must be 0. If it is not, the design's central claim is wrong and the sitting stops and reports.
- **M4** → if the long name resolves, Decision 2 keeps the alias anyway (it is bounded and unambiguous) and the finding is recorded; if it does not, the alias is load-bearing and ORIENTATION §4 gains the fact.
- **M5** → confirms the retire selector. If `manifest.release` turns out to be carried by anything else, Task 5's selector changes with it.

- [ ] **Step 10: Prove the harness can see a wildcard — the control for the control**

```bash
# With the loop running for a few seconds, take the app's route away and put it back.
curl -sS -X DELETE http://127.0.0.1:7119/id/mf-proof-app-staging-manifest-internal
```

The loop must record `wildcard`. Restore by redeploying the proof app (`bash scripts/demo-redeploy.sh` step 2 does it, or `make demo-ai`). **A classifier that cannot see a wildcard is the one thing that would make every later green run meaningless.**

- [ ] **Step 11: Clean up what the run left**

Today every redeploy leaves its predecessor's container running (P4b 189). Remove them **by explicit name**, with their files volumes (P4b 192, 194), and list afterwards:

```bash
docker ps -a --filter label=manifest.slug=proof-app --filter label=manifest.release --format '{{.Names}}'
# remove all but the one the edge dials; then:
docker volume ls --format '{{.Name}}' | grep -- '-app-files$'
./scripts/snapshot-machine.sh > /tmp/p4c-task1-after.txt
diff /tmp/p4c-task1-before.txt /tmp/p4c-task1-after.txt
```

- [ ] **Step 12: Record and commit**

Write the session record — the baseline numbers, the five measurements, every correction written into a later task — then:

```bash
git add scripts/demo-redeploy.sh scripts/lib/redeploy-loop.mjs scripts/lib/redeploy-summary.mjs \
  Makefile docs/superpowers/spikes/p4c-baseline/ docs/superpowers/plans/2026-09-15-p4c-zero-downtime-redeploys.md
git commit -m "test: P4c's acceptance, watched failing, and the edge measurements it rests on"
```

---

## Task 2: §11's contract in code — the four methods, and a fake driver that has routes

**Files:**
- Modify: `packages/control-plane/src/runtime/driver.ts`
- Modify: `packages/control-plane/src/runtime/fake-driver.ts`
- Modify: `packages/control-plane/src/runtime/driver-contract.ts`
- Modify: `packages/control-plane/src/runtime/fake-driver.test.ts`
- Modify: `packages/control-plane/src/runtime/index.ts`
- Modify: `packages/control-plane/src/runtime/docker/driver.ts`, `runtime/docker/instances.ts`, `runtime/docker/testing.ts`, `src/index.ts` (the hostname stops being re-derived; the four methods refuse until Tasks 4–5)
- Modify: `packages/control-plane/src/releases/release.ts` (the name carries the instance row's id)
- Modify, because `instanceName` takes a fourth argument and `InstanceSpec` has two new fields: `runtime/docker/names.test.ts`, `runtime/docker/driver.docker.test.ts`, `runtime/docker/instances.docker.test.ts`, `runtime/docker/roundtrip.docker.test.ts`, `runtime/docker/s6.docker.test.ts`, `runtime/docker/node-ts-mongo.docker.test.ts`, `releases/incident.docker.test.ts`, `releases/releases.test.ts`, `sso/testing.ts`

**Interfaces:**
- Produces: `InstanceSpec.instanceId: string`, `InstanceSpec.hostname: string`; `instanceName(projectSlug, environmentKind, releaseId, instanceId)`; `Driver.retireInstance(id, { drainMs })`, `Driver.servingInstance(hostname)`, `Driver.listInstances(hostname)`, `Driver.restoreRoute(id)`; `DriverRefusalError` with `code: 'INSTANCE_SERVING' | 'INSTANCE_SPEC_CHANGED' | 'INSTANCE_NOT_FOUND'`; `FAKE_NEVER_READY_PATH`; the fake driver's `holdRequest(hostname, ms)` and `dropRoutes()`; `DriverContractFixtures.continuity`.
- Consumes: nothing new.

- [ ] **Step 1: Write the contract's continuity tests first**

In `runtime/driver-contract.ts`, above the existing suite, add the fixtures and below it the block. This is the whole §16 obligation §11 gained, and **it is written before any implementation**.

```ts
export interface DriverContractFixtures {
  runnableImage?: (driver: Driver) => Promise<ImageRef>
  /**
   * P4c. Supplying this ENABLES the continuity block below — §11's *Redeploys*.
   * A driver that has not implemented the four methods yet leaves it out, and the
   * block is skipped WITH THE REASON IN ITS NAME rather than silently passing.
   */
  continuity?: ContinuityFixtures
}

export interface ContinuityFixtures {
  /** The same spec, made so this driver starts it and can never make it ready. */
  neverReady: (spec: InstanceSpec) => InstanceSpec
  /**
   * Starts ONE request to `hostname` that the app holds open, and resolves once that
   * request is in flight. `done` settles when the request does, and `ok` is true only
   * for a complete answer from the instance it started on.
   */
  holdRequest: (driver: Driver, hostname: string) => Promise<{ done: Promise<{ ok: boolean }> }>
  /** How long `holdRequest` holds — the fake's is milliseconds, a real one's seconds. */
  holdMs: number
  /** A drain bound comfortably shorter than `holdMs`, for the "never longer" test. */
  shortDrainMs: number
  /** Removes the edge's route for `hostname`, as restarting the edge does. */
  dropRoute: (hostname: string) => Promise<void>
  /** A hostname nothing else in the run uses. */
  hostname: () => string
}
```

```ts
    const continuity = fixtures.continuity
    const describeContinuity =
      continuity === undefined
        ? (name: string, body: () => void) =>
            describe.skip(`${name} [skipped: this driver supplies no continuity fixtures]`, body)
        : describe

    describeContinuity('continuity — §11 Redeploys', () => {
      // A hostname per test: the edge's routes outlive a test, so two tests sharing one
      // would each see the other's instance serving.
      const hosts: string[] = []
      const host = (): string => {
        const next = continuity!.hostname()
        hosts.push(next)
        return next
      }
      afterAll(async () => {
        for (const hostname of hosts) await continuity!.dropRoute(hostname)
      }, 120_000)

      const beside = (hostname: string, releaseId: string): InstanceSpec =>
        spec({ hostname, releaseId, instanceId: randomUUID() })

      it('the first instance serves its hostname', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('a second instance takes the hostname over, and the first is still running', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const second = await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        expect(second.id).not.toBe(first.id)
        expect(await driver.servingInstance(hostname)).toBe(second.id)
        // §11: beside, never instead. The old one is what a drain drains.
        expect((await driver.status(first.id)).state).not.toBe('gone')
      }, 600_000)

      it('an instance that never becomes ready throws WITH ITS HANDLE, and the previous one still serves', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const refusal = driver.ensureInstance(
          continuity!.neverReady(beside(hostname, 'release-cccccccc')),
        )
        await expect(refusal).rejects.toBeInstanceOf(InstanceNotReadyError)
        const handle = await refusal.catch((error: unknown) => (error as InstanceNotReadyError).handle)
        expect(await driver.servingInstance(hostname)).toBe(first.id)
        // STILL THERE: §14's Incident reads its exit code and its log through this
        // handle, and the CALLER removes it once that is captured (§11).
        expect((await driver.status(handle.id)).state).not.toBe('gone')
        await driver.retireInstance(handle.id, { drainMs: 0 })
        expect((await driver.status(handle.id)).state).toBe('gone')
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('retiring the instance it replaced leaves the new one serving', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const second = await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        await driver.retireInstance(first.id, { drainMs: 0 })
        expect((await driver.status(first.id)).state).toBe('gone')
        expect(await driver.servingInstance(hostname)).toBe(second.id)
      }, 600_000)

      it('REFUSES to retire the instance that is serving', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        await expect(driver.retireInstance(first.id, { drainMs: 0 })).rejects.toMatchObject({
          code: 'INSTANCE_SERVING',
        })
        expect((await driver.status(first.id)).state).not.toBe('gone')
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('a retire waits for a request that is in flight', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const held = await continuity!.holdRequest(driver, hostname)
        let finished = false
        void held.done.then(() => {
          finished = true
        })
        await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        await driver.retireInstance(first.id, { drainMs: continuity!.holdMs * 4 })
        // NOT "it took a while": the request had ALREADY finished when the retire
        // returned, and it was answered.
        expect(finished).toBe(true)
        expect(await held.done).toEqual({ ok: true })
      }, 600_000)

      it('a retire never waits longer than its drain bound', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const held = await continuity!.holdRequest(driver, hostname)
        await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        const started = Date.now()
        await driver.retireInstance(first.id, { drainMs: continuity!.shortDrainMs })
        const waited = Date.now() - started
        expect(waited).toBeGreaterThanOrEqual(continuity!.shortDrainMs)
        expect(waited).toBeLessThan(continuity!.holdMs)
        // And what it cut off is cut off — a bound that quietly waited anyway would
        // pass every other assertion here.
        expect(await held.done).toEqual({ ok: false })
      }, 600_000)

      it('restoreRoute points a hostname back at its instance after the route is lost', async () => {
        const driver = await factory()
        const hostname = host()
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        await continuity!.dropRoute(hostname)
        expect(await driver.servingInstance(hostname)).toBeUndefined()
        await driver.restoreRoute(first.id)
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('a woken instance serves its hostname again', async () => {
        const driver = await factory()
        const hostname = host()
        const target = beside(hostname, 'release-aaaaaaaa')
        const first = await driver.ensureInstance(target)
        await driver.stopInstance(first.id)
        const woken = await driver.ensureInstance(target)
        expect(woken.id).toBe(first.id)
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('the same name with a DIFFERENT environment is refused, never replaced', async () => {
        const driver = await factory()
        const hostname = host()
        const target = beside(hostname, 'release-aaaaaaaa')
        const first = await driver.ensureInstance(target)
        await expect(
          driver.ensureInstance({ ...target, env: { ...target.env, CHANGED: '1' } }),
        ).rejects.toMatchObject({ code: 'INSTANCE_SPEC_CHANGED' })
        // The old behaviour DELETED it — and it may be the container serving the app.
        expect((await driver.status(first.id)).state).not.toBe('gone')
        expect(await driver.servingInstance(hostname)).toBe(first.id)
      }, 600_000)

      it('listInstances names every instance of a hostname — serving or not — and nothing else', async () => {
        const driver = await factory()
        const hostname = host()
        const other = host()
        // A bound service is never an instance, and it carries the same project labels.
        await driver.ensureService(binding())
        const first = await driver.ensureInstance(beside(hostname, 'release-aaaaaaaa'))
        const second = await driver.ensureInstance(beside(hostname, 'release-bbbbbbbb'))
        const elsewhere = await driver.ensureInstance(beside(other, 'release-dddddddd'))
        expect((await driver.listInstances(hostname)).sort()).toEqual([first.id, second.id].sort())
        expect(await driver.listInstances(other)).toEqual([elsewhere.id])
      }, 900_000)
    })
```

The existing `spec()` helper gains the two fields, and the naming test gains the instance:

```ts
    const INSTANCE_ID = 'a1a1a1a1-0000-4000-8000-000000000001'
    const OTHER_INSTANCE_ID = 'b2b2b2b2-0000-4000-8000-000000000002'

    const spec = (overrides: Partial<InstanceSpec> = {}): InstanceSpec => {
      const instanceId = overrides.instanceId ?? INSTANCE_ID
      const releaseId = overrides.releaseId ?? 'release-abcdef12'
      return {
        name: instanceName('chem-labs', 'staging', releaseId, instanceId),
        instanceId,
        // §23 assigns it and §11 now carries it, so a driver never re-derives it.
        hostname: 'chem-labs.staging.manifest.internal',
        projectSlug: 'chem-labs',
        environmentKind: 'staging',
        releaseId,
        image,
        env: { MANIFEST_ENV: 'staging', PORT: '3000' },
        port: 3000,
        healthPath: '/healthz',
        needsAiGateway: false,
        resources: { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 },
        services: [],
        egressAllow: [],
        ...overrides,
      }
    }

    it('derives instance names deterministically from project, environment, release AND instance', () => {
      const name = instanceName('chem-labs', 'staging', 'release-abcdef12', INSTANCE_ID)
      expect(instanceName('chem-labs', 'staging', 'release-abcdef12', INSTANCE_ID)).toBe(name)
      expect(instanceName('chem-labs', 'production', 'release-abcdef12', INSTANCE_ID)).not.toBe(name)
      // §11: a redeploy of the SAME release is a new instance beside the one serving.
      expect(instanceName('chem-labs', 'staging', 'release-abcdef12', OTHER_INSTANCE_ID)).not.toBe(name)
    })
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm exec vitest run --project unit src/runtime/fake-driver
```

Expected: TypeScript-shaped failures — `retireInstance is not a function`, and the naming test failing on arity. **The continuity block must RUN, not skip**, once Step 4 supplies the fake's fixtures; check that it is not silently skipped by looking for its name in the output.

- [ ] **Step 3: Change the interface**

In `runtime/driver.ts`:

```ts
export interface InstanceSpec {
  /** Deterministic, derived from (project, environment, release, instance) — §11. */
  name: string
  /**
   * The control plane's `instances` row (P4c). It is the instance's identity
   * everywhere: in its name, in its container labels, in the alias the edge dials,
   * and in the `X-Manifest-Instance` header a deploy checks the edge for.
   */
  instanceId: string
  /**
   * The hostname §23 assigned this environment, PASSED IN rather than re-derived.
   * `deployRelease` holds the environment row; a driver that rebuilt the name from a
   * slug would be a second producer of it, which is the shape that cost P3's Session 5
   * seven defects.
   */
  hostname: string
  projectSlug: string
  // …and every field it already had: environmentKind, releaseId, image, env, port,
  // healthPath, resources, services, egressAllow, needsAiGateway, files.
}
```

```ts
/** What a driver refuses to do, as a code the caller can act on (§20's machine-actionable errors). */
export type DriverRefusalCode = 'INSTANCE_SERVING' | 'INSTANCE_SPEC_CHANGED' | 'INSTANCE_NOT_FOUND'

export class DriverRefusalError extends Error {
  constructor(
    readonly code: DriverRefusalCode,
    message: string,
    readonly hint: string,
  ) {
    super(message)
    this.name = 'DriverRefusalError'
  }
}

export interface RetireOpts {
  /** How long to wait for what is in flight, before the instance is removed anyway. */
  drainMs: number
}

export interface Driver {
  readonly name: string
  buildImage(…): Promise<ImageRef>
  ensureService(binding: ServiceBinding): Promise<ServiceHandle>
  /**
   * Start the instance BESIDE whatever serves `spec.hostname`, make it ready without
   * touching the route, move the route in ONE in-place change, and resolve only once
   * the hostname is shown to reach THIS instance by its identity (§11 Redeploys).
   *
   * An instance that never becomes ready throws `InstanceNotReadyError` carrying its
   * handle, with the route unmoved and the instance still there for §14's Incident.
   * Asked twice for one name it returns the same instance; asked for one name with a
   * different environment it throws `DriverRefusalError('INSTANCE_SPEC_CHANGED')`.
   */
  ensureInstance(spec: InstanceSpec): Promise<InstanceHandle>
  /**
   * Wait until nothing is in flight to this instance — at most `drainMs` — then remove
   * it and everything it owns. NEVER changes what a hostname reaches, and refuses an
   * instance that is serving one (`DriverRefusalError('INSTANCE_SERVING')`).
   * Retiring something that is already gone is a no-op, like `destroyInstance`.
   */
  retireInstance(id: string, opts: RetireOpts): Promise<void>
  /** Which instance this hostname reaches now, or undefined if nothing does. */
  servingInstance(hostname: string): Promise<string | undefined>
  /** Every instance this driver holds for the hostname, serving or not. */
  listInstances(hostname: string): Promise<string[]>
  /**
   * Point the hostname's route back at an instance that is already running, starting
   * and stopping nothing — what the control plane calls at boot for each Route record
   * (§12). Throws `DriverRefusalError('INSTANCE_NOT_FOUND')` for an instance it does
   * not hold.
   */
  restoreRoute(id: string): Promise<void>
  stopInstance(id: string): Promise<void>
  destroyInstance(id: string): Promise<void>
  // destroyService, status, logs, exec, snapshotService, capabilities: unchanged.
}

/** §11: keyed by a deterministic name derived from (project, environment, release, instance). */
export function instanceName(
  projectSlug: string,
  environmentKind: string,
  releaseId: string,
  instanceId: string,
): string {
  return `${projectSlug}-${environmentKind}-${releaseId.slice(0, 8)}-${instanceId.slice(0, 8)}`
}
```

- [ ] **Step 4: Give the fake driver routes, in-flight requests and a refusal**

`runtime/fake-driver.ts`, in full for the parts that change:

```ts
/** A health path this driver starts and never makes ready — the contract's `neverReady`. */
export const FAKE_NEVER_READY_PATH = '/__fake_never_ready__'

interface FakeInstance {
  spec: InstanceSpec
  state: InstanceStatus['state']
  logs: LogLine[]
  /** Requests the contract's drain tests are holding open against this instance. */
  inFlight: number
}

export interface FakeDriverOptions {
  failInstances?: boolean
  /** Which specs this driver starts and never makes ready. */
  neverReady?: (spec: InstanceSpec) => boolean
  capabilities?: Partial<DriverCapabilities>
}

export type FakeDriver = Driver & {
  markHealthy(id: string): void
  instanceCount(): number
  /** Holds one request in flight to whatever serves `hostname` for `ms`. */
  holdRequest(hostname: string, ms: number): Promise<{ ok: boolean }>
  /** Forgets every route, as restarting the edge does. */
  dropRoutes(): void
}

export function createFakeDriver(options: FakeDriverOptions = {}): FakeDriver {
  const instances = new Map<string, FakeInstance>()
  const services = new Map<string, FakeService>()
  const byName = new Map<string, string>()
  /** hostname -> instance id. The fake driver's edge. Without it the two drivers
   *  disagreed about the route and no contract test could see it (P4b finding 73). */
  const routes = new Map<string, string>()
  // NOT `instances.size + 1`: a retire removes entries, and a reused id would make two
  // instances share one name in the tests that retire and redeploy.
  let created = 0

  const envKey = (env: Record<string, string>): string =>
    JSON.stringify(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)))
  const handleOf = (id: string, spec: InstanceSpec): InstanceHandle => ({
    id,
    name: spec.name,
    url: `https://${spec.hostname}`,
  })
  const neverReady = options.neverReady ?? ((spec) => spec.healthPath === FAKE_NEVER_READY_PATH)

  return {
    name: 'fake',
    // buildImage, ensureService, stopInstance, status, logs, exec, snapshotService and
    // capabilities are unchanged from P4b's fake driver.
    async ensureInstance(spec: InstanceSpec): Promise<InstanceHandle> {
      const existingId = byName.get(`instance:${spec.name}`)
      if (existingId !== undefined) {
        const existing = instances.get(existingId)!
        if (envKey(existing.spec.env) !== envKey(spec.env)) {
          throw new DriverRefusalError(
            'INSTANCE_SPEC_CHANGED',
            `instance '${spec.name}' exists with a different environment`,
            'A name carries its instance id (§11), so this can only be a retry that ' +
              'changed something. Deploy a new instance instead — replacing this one ' +
              'would delete a container that may be serving.',
          )
        }
        existing.spec = spec
        if (existing.state === 'hibernated') existing.state = 'healthy'
        if (existing.state === 'healthy') routes.set(spec.hostname, existingId)
        return handleOf(existingId, spec)
      }
      const id = `inst-${++created}`
      const ready = !(options.failInstances === true || neverReady(spec))
      instances.set(id, {
        spec,
        state: ready ? 'healthy' : 'failed',
        logs: [{ at: new Date(), stream: 'stdout', text: `starting ${spec.name}` }],
        inFlight: 0,
      })
      byName.set(`instance:${spec.name}`, id)
      const handle = handleOf(id, spec)
      if (!ready) {
        // WITH THE HANDLE, and the instance left in place: §14's Incident is read
        // through it, and §11 has the caller remove the instance afterwards.
        throw new InstanceNotReadyError(
          handle,
          `readiness: the fake driver was asked for a spec it never makes ready (${spec.healthPath})`,
          `${spec.name} never became ready`,
          'The route did not move, so whatever served this hostname still does.',
        )
      }
      // THE MOVE, AFTER READINESS. The other order is the 1.6 s of 502s the brief measured.
      routes.set(spec.hostname, id)
      return handle
    },

    async retireInstance(id: string, opts: RetireOpts): Promise<void> {
      const instance = instances.get(id)
      if (instance === undefined) return
      if (routes.get(instance.spec.hostname) === id) {
        throw new DriverRefusalError(
          'INSTANCE_SERVING',
          `instance '${id}' is what ${instance.spec.hostname} reaches`,
          'A retire never changes what a hostname reaches (§11). Move the hostname to ' +
            'another instance first — ensureInstance does exactly that.',
        )
      }
      const deadline = Date.now() + opts.drainMs
      while (instance.inFlight > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      instance.state = 'gone'
      byName.delete(`instance:${instance.spec.name}`)
      instances.delete(id)
    },

    async servingInstance(hostname: string): Promise<string | undefined> {
      return routes.get(hostname)
    },

    async listInstances(hostname: string): Promise<string[]> {
      return [...instances.entries()]
        .filter(([, instance]) => instance.spec.hostname === hostname)
        .map(([id]) => id)
    },

    async restoreRoute(id: string): Promise<void> {
      const instance = instances.get(id)
      if (instance === undefined) {
        throw new DriverRefusalError(
          'INSTANCE_NOT_FOUND',
          `no instance '${id}' to point a hostname at`,
          'restoreRoute re-points a hostname at an instance that is already running.',
        )
      }
      routes.set(instance.spec.hostname, id)
    },

    async destroyInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (instance === undefined) return
      if (routes.get(instance.spec.hostname) === id) routes.delete(instance.spec.hostname)
      instance.state = 'gone'
      byName.delete(`instance:${instance.spec.name}`)
      instances.delete(id)
    },

    holdRequest(hostname: string, ms: number): Promise<{ ok: boolean }> {
      const id = routes.get(hostname)
      const instance = id === undefined ? undefined : instances.get(id)
      if (instance === undefined || id === undefined) return Promise.resolve({ ok: false })
      instance.inFlight += 1
      return new Promise((resolve) =>
        setTimeout(() => {
          instance.inFlight -= 1
          // Answered only if its instance outlived it — which is what a drain protects.
          resolve({ ok: instances.get(id) === instance })
        }, ms),
      )
    },

    dropRoutes(): void {
      routes.clear()
    },
    // markHealthy and instanceCount: unchanged.
  }
}
```

- [ ] **Step 5: Wire the fake's fixtures and watch the block run**

`runtime/fake-driver.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { describeDriverContract } from './driver-contract.js'
import { FAKE_NEVER_READY_PATH, createFakeDriver, type FakeDriver } from './fake-driver.js'

// ONE driver for the contract's continuity block: those tests ensure, retire and read
// routes across calls, and a fresh in-memory driver per call would forget all of it.
const shared = createFakeDriver()

describeDriverContract('fake', () => shared, {
  continuity: {
    neverReady: (spec) => ({ ...spec, healthPath: FAKE_NEVER_READY_PATH }),
    holdRequest: async (driver, hostname) => ({
      done: (driver as FakeDriver).holdRequest(hostname, 400),
    }),
    holdMs: 400,
    shortDrainMs: 50,
    // The fake edge is one map, so dropping is all-or-nothing — which is what
    // restarting the real edge does anyway (ORIENTATION §4).
    dropRoute: async () => {
      ;(shared as FakeDriver).dropRoutes()
    },
    hostname: () => `fake-${randomUUID().slice(0, 8)}.staging.manifest.internal`,
  },
})
```

**`factory()` is called per test and must return the same driver here**, or every continuity test starts from an empty edge. Run it:

```bash
pnpm exec vitest run --project unit src/runtime/fake-driver
```

Expected: the eleven continuity tests pass, and the rest of the contract is unchanged.

- [ ] **Step 6: Keep the rest of the repository compiling — and honest**

- `runtime/docker/instances.ts`: `ensureInstanceContainer` reads `spec.hostname` (so `InstanceDeps.hostname` goes) and, where a mismatched environment hash used to force a delete, throws `DriverRefusalError('INSTANCE_SPEC_CHANGED')` instead. **This is the line P4b added to fix finding 72; it becomes a refusal because with per-instance names the only container that name can belong to is one this deploy did not create.**
- `runtime/docker/driver.ts`: delete the `hostnameFor` option, use `spec.hostname`, and add the four methods as refusals for now:

```ts
    // Tasks 4 and 5 implement these. Refusing loudly — with the task that supplies it —
    // beats a plausible-looking answer: `servingInstance` returning undefined would
    // read as "nothing serves", which is exactly the state Decision 12 refuses to act on.
    retireInstance: () => {
      throw new EngineError(
        'DRIVER_UNSUPPORTED',
        'retireInstance is P4c Task 5',
        'The Docker driver gains it in Task 5; until then the contract suite skips the continuity block for this driver.',
      )
    },
```

  …and the same shape for `servingInstance`, `listInstances` and `restoreRoute`.
- `src/index.ts` and `runtime/docker/testing.ts`: drop the `hostnameFor` option they pass.
- `releases/release.ts`: move the name below the row insert and hand the driver the two new fields:

```ts
  const [row] = await db.insert(instances).values({ … }).returning()
  const instanceId = row!.id
  // §11's key gained the instance (P4c): a redeploy of the same release is a NEW
  // instance beside the one serving, so the name can no longer be computed before the
  // row exists.
  const name = instanceName(projectSlug, environment.kind, release.id, instanceId)
```

```ts
    handle = await driver.ensureInstance({
      name,
      instanceId,
      hostname: environment.hostname,
      projectSlug,
      // image, env, files, port, healthPath, resources, services, egressAllow and
      // needsAiGateway: exactly as P4b passes them.
```

- Every test listed in **Files** gains the fourth argument and the two fields. `sso/testing.ts` uses `instanceName(slug, kind, 'r1', SP_INSTANCE_ID)` with a constant uuid, and passes `hostname` — it already computes one.

- [ ] **Step 7: Four gates, the Docker tier, and the negative control**

```bash
pnpm test && pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
make up && pnpm test:docker
```

The Docker tier's contract run must show the continuity block **skipped with its reason**, and everything else green.

**Negative controls, each watched red:**
- (a) In the fake's `ensureInstance`, move `routes.set(...)` above the readiness refusal → *an instance that never becomes ready…* fails: the never-ready instance serves.
- (b) Delete the `INSTANCE_SERVING` check in `retireInstance` → *REFUSES to retire…* fails.
- (c) Make the refusal for a changed environment a delete-and-recreate again → *the same name with a DIFFERENT environment…* fails.
- (d) Drop `instanceId` from `instanceName` → the naming test fails on the third expectation.

- [ ] **Step 8: Commit**

```bash
git add packages/control-plane/src
git commit -m "feat(runtime): §11's redeploy contract — beside, retired, and what serves"
```

---

## Task 3: The edge — one in-place move, an identity on every response, and what is in flight

**Files:**
- Modify: `packages/control-plane/src/routing/caddy.ts`
- Modify: `packages/control-plane/src/routing/routes.ts`
- Modify: `packages/control-plane/src/routing/readiness.ts`
- Modify: `packages/control-plane/src/routing/index.ts`
- Modify: `packages/control-plane/src/routing/caddy.test.ts`, `routes.test.ts`, `readiness.test.ts`, `routes.docker.test.ts`, `readiness.docker.test.ts`
- Modify: `packages/control-plane/src/runtime/docker/driver.ts` (its `applyRoute` call passes the instance)

**Interfaces:**
- Produces: `INSTANCE_HEADER`; `buildRoute({ …, instanceId })`; `CaddyClient.getRoute`, `.patchRoute`, `.upstreams`; `applyRoute` upserting; `servingRoute(deps, hostname)`, `upstreamOf(route)`, `instanceIdOf(route)`, `restoreRouteTo(deps, previous, hostname, kind)`, `inFlightTo(deps, upstream)`, `upstreamsInUse(deps)`; `edgeIdentityProbe(...)`, `waitForIdentity(...)`.
- Removes: `reapplyAllRoutes` (Decision 22).

- [ ] **Step 1: Write the failing unit tests**

In `routing/caddy.test.ts`, extend `fakeAdmin()` so a test can choose the answer, and add:

```ts
  it('sets X-Manifest-Instance on every response, DEFERRED so an app cannot serve its own', () => {
    const route = buildRoute({
      hostname: 'chem-labs.staging.manifest.internal',
      upstream: 'mf-i-a1a1a1a1-0000-4000-8000-000000000001:3000',
      routeId: 'mf-chem-labs-staging-manifest-internal',
      instanceId: 'a1a1a1a1-0000-4000-8000-000000000001',
    })
    const headers = route.handle[2] as {
      response: { set: Record<string, string[]>; deferred?: boolean }
    }
    expect(headers.response.set[INSTANCE_HEADER]).toEqual([
      'a1a1a1a1-0000-4000-8000-000000000001',
    ])
    // Without this the upstream's own copy is ADDED beside the edge's, and a deploy
    // could be told the app it started is serving when it is not (Task 1, M2).
    expect(headers.response.deferred).toBe(true)
  })

  it('reads one route by @id, and reports a missing one as undefined rather than throwing', async () => { … })

  it('PATCHES a route by @id — and refuses to treat a 404 as success', async () => {
    const { url } = await fakeAdmin({ status: 404, body: '{"error":"unknown object ID"}' })
    await expect(
      createCaddyClient(url).patchRoute('r1', buildRoute({ … })),
    ).rejects.toThrow(/vanished|404/)
  })

  it('reads the edge’s in-flight count per upstream', async () => {
    const { url, seen } = await fakeAdmin({
      status: 200,
      body: '[{"address":"mf-i-x:3000","num_requests":2,"fails":0}]',
    })
    expect(await createCaddyClient(url).upstreams()).toEqual([
      { address: 'mf-i-x:3000', num_requests: 2, fails: 0 },
    ])
    expect(seen[0]!.path).toBe('/reverse_proxy/upstreams')
  })
```

In `routing/routes.test.ts`, replace the two delete-then-put tests with:

```ts
  it('moves an existing route IN PLACE — one PATCH, and never a delete', async () => {
    const calls: string[] = []
    const { client } = fakeCaddy({
      getRoute: async () => existingRoute,
      patchRoute: async (routeId) => { calls.push(`patch ${routeId}`) },
      putRoute: async () => { calls.push('put') },
      deleteRoute: async () => { calls.push('delete') },
    })
    await applyRoute({ caddy: client, servers: SERVERS }, spec)
    // Delete-then-insert leaves a gap the edge's wildcard answers with a 200 — measured
    // 2026-09-15: 4 of 320 requests across 20 moves, and none with a PATCH.
    expect(calls).toEqual(['patch mf-app-staging-manifest-internal'])
  })

  it('creates a route that does not exist yet with PUT at index 0', async () => { … expect(calls).toEqual(['put']) })

  it('reports what a hostname reaches: the upstream and the instance', async () => { … })

  it('counts what is in flight to one upstream, and says so when the edge no longer lists it', async () => {
    // `undefined`, never 0: "the edge is not counting this address" and "nothing is in
    // flight" are different facts, and Task 1 measured which one a moved route produces.
    expect(await inFlightTo(deps, 'mf-i-gone:3000')).toBeUndefined()
  })
```

In `routing/readiness.test.ts`:

```ts
describe('waitForIdentity (P4c)', () => {
  it('is ready when the edge answers 200 AS THIS INSTANCE', async () => { … })

  it('is NOT ready when a 200 carries no identity — that is the edge’s wildcard', async () => {
    const result = await waitForIdentity({
      url: 'https://x/', expected: 'inst-a', timeoutMs: 60, intervalMs: 10,
      probe: async () => ({ status: 200, instance: undefined }),
    })
    expect(result.ready).toBe(false)
    expect(result.reason).toContain('no X-Manifest-Instance')
  })

  it('is NOT ready when the edge still answers as another instance, and says which', async () => {
    const result = await waitForIdentity({ … probe: async () => ({ status: 200, instance: 'inst-b' }) })
    expect(result.ready).toBe(false)
    expect(result.reason).toContain('inst-b')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm exec vitest run --project unit src/routing
```

- [ ] **Step 3: Implement the client and the route**

In `caddy.ts`: export `INSTANCE_HEADER = 'X-Manifest-Instance'`, take `instanceId` in `buildRoute`, set it in the headers handler with `deferred: true`, and add to `createCaddyClient`:

```ts
    async getRoute(routeId) {
      const response = await call('GET', `/id/${routeId}`)
      // 404 is tolerated inside `call` because removing an absent route is the desired
      // end state; here it is the ANSWER, so it is read rather than parsed.
      if (response.status === 404) return undefined
      return JSON.parse(response.body) as CaddyRoute
    },
    async patchRoute(routeId, route) {
      const response = await call('PATCH', `/id/${routeId}`, route)
      // A 404 here means the route went away between the read and the write. `call`
      // tolerates 404 for the delete's sake, so this is the one place that must not:
      // a swallowed one leaves the hostname pointing at the old instance while the
      // deploy reports success.
      if (response.status === 404) {
        throw new Error(
          `caddy admin PATCH /id/${routeId}: the route vanished between the read and the write`,
        )
      }
    },
    async upstreams() {
      const response = await call('GET', '/reverse_proxy/upstreams')
      return (JSON.parse(response.body) as UpstreamStatus[] | null) ?? []
    },
```

- [ ] **Step 4: Implement the upsert and the reads**

`routes.ts` — `applyRoute` becomes an upsert, `reapplyAllRoutes` is deleted, and the reads are added:

```ts
/**
 * Applies a route, IN PLACE where one exists.
 *
 * P4c. This used to delete by `@id` and then PUT at index 0, which leaves a window with
 * no route for the hostname — and the edge's wildcard answers `200` in that window, so
 * the gap is invisible to any check that reads a status (P4b finding 193). Measured
 * 2026-09-15: 4 wildcard answers in 320 requests across 20 delete-then-insert moves, and
 * 0 in 302 across 20 in-place PATCHes.
 */
export async function applyRoute(deps: RoutingDeps, spec: RouteSpec): Promise<void> {
  const server = deps.servers[listenerFor(spec.kind)]
  const routeId = routeIdFor(spec.hostname)
  const route = buildRoute({ ...spec, routeId })
  const existing = await deps.caddy.getRoute(routeId)
  if (existing === undefined) await deps.caddy.putRoute(server, route)
  else await deps.caddy.patchRoute(routeId, route)
}

export interface ServingRoute {
  route: CaddyRoute
  upstream: string
  instanceId: string | undefined
}

/** What this hostname reaches, as the edge's own configuration has it. */
export async function servingRoute(deps: RoutingDeps, hostname: string): Promise<ServingRoute | undefined>

/** Puts back what served before a move — or removes the route, if nothing did. */
export async function restoreRouteTo(deps: RoutingDeps, previous: ServingRoute | undefined, hostname: string, kind: EnvironmentKind): Promise<void>

/** How many requests the edge is holding against one upstream — `undefined` when it
 *  does not list the address at all, which is NOT the same as none (Task 1, M1). */
export async function inFlightTo(deps: RoutingDeps, upstream: string): Promise<number | undefined>

/** Every upstream any route dials. `retireInstance` refuses anything in here. */
export async function upstreamsInUse(deps: RoutingDeps): Promise<Set<string>>
```

- [ ] **Step 5: Implement the identity probe**

`readiness.ts` — factor the throwaway-curl-container run out of `edgeProbe`, and add:

```ts
export interface IdentityProbeResult {
  status: number
  /** The edge's own `X-Manifest-Instance`. Absent for the wildcard, which answers 200. */
  instance: string | undefined
}

/**
 * Asks the public hostname WHO answered.
 *
 * `%header{}` needs curl ≥ 7.84; the mirrored probe image is 8.11.1. A status alone
 * cannot tell this instance from the previous one, or from the edge's wildcard page —
 * which is what makes a status-only readiness check pass against an unrouted name.
 */
export function edgeIdentityProbe(engine, hostname, healthPath, caCertPath, options = {}): () => Promise<IdentityProbeResult>

export async function waitForIdentity(input: {
  url: string
  expected: string
  probe: () => Promise<IdentityProbeResult>
  timeoutMs: number
  intervalMs: number
}): Promise<ReadinessResult>
```

- [ ] **Step 6: Update the Docker-tier routing suites**

- `routes.docker.test.ts`: the restart test now uses `applyRoute` rather than the deleted `reapplyAllRoutes`; add **'moves a route between two upstreams with no wildcard answer'** — twenty in-place moves under a request loop run inside one `curlimages/curl` container, asserting **zero** wildcard bodies — and **'the edge sets X-Manifest-Instance, and an app cannot serve its own'** against an `nc` server that tries.
- `readiness.docker.test.ts`: `edgeIdentityProbe` against a routed instance answers with its id; against a hostname with no route it answers 200 with **no** identity, and `waitForIdentity` refuses it.

- [ ] **Step 7: Gates, Docker tier, negative controls**

**Negative controls, each watched red:**
- (a) Put delete-then-put back in `applyRoute` → the Docker-tier no-wildcard test fails (this is the brief's measurement, as a test).
- (b) Remove `deferred: true` → the forged-header test fails.
- (c) Make `waitForIdentity` accept any 200 → the wildcard test fails.
- (d) Let `patchRoute` swallow a 404 → the client test fails.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(routing): move a route in place, name the instance on every response"
```

---
## Task 4: The Docker `ensureInstance` — beside, privately ready, moved, verified, rolled back

> **ONE CORRECTION FROM SITTING 2 (2026-09-15).** `manifest.hostname` is **already written** by
> `ensureInstanceContainer`, and `destroyInstance` already reads it to find the route to remove.
> It was pulled forward because Task 2 deletes `DockerDriverOptions.hostnameFor` — between the two
> tasks the driver would otherwise have had no way to name the route, and the removal sits inside a
> `.catch(() => undefined)`, so it would have failed silently (finding 19). So the `LABEL` map
> below adds **three** labels to a container in practice — `instance`, `port`, `aiGateway` —
> and replaces one hand-written literal with `LABEL.hostname`. The refusal on a mismatched
> environment hash is likewise already in place, as the text below already notes.

**Files:**
- Modify: `packages/control-plane/src/runtime/docker/names.ts` (`instanceAlias`, `LABEL`)
- Create: `packages/control-plane/src/runtime/docker/keyed-mutex.ts` + `keyed-mutex.test.ts`
- Create: `packages/control-plane/src/runtime/docker/probes.ts`
- Modify: `packages/control-plane/src/runtime/docker/instances.ts` (labels, alias, url)
- Modify: `packages/control-plane/src/runtime/docker/networks.ts` (`EDGE_NEIGHBOUR`)
- Modify: `packages/control-plane/src/runtime/docker/driver.ts` (`ensureInstance`)
- Create: `packages/control-plane/src/runtime/docker/redeploy.docker.test.ts`
- Modify: `runtime/docker/names.test.ts`, `instances.docker.test.ts`, `roundtrip.docker.test.ts`

**Interfaces:**
- Produces: `instanceAlias(instanceId)`; `LABEL` (slug, environment, release, instance, hostname, port, aiGateway, envHash); `createKeyedMutex()`; `privateProbe(engine, edgeContainer, upstream, healthPath)`; `EDGE_NEIGHBOUR`.
- Consumes: Task 3's `applyRoute`, `servingRoute`, `restoreRouteTo`, `edgeIdentityProbe`, `waitForIdentity`; Task 2's `DriverRefusalError`, `InstanceSpec.instanceId`/`hostname`.

- [ ] **Step 1: Write `keyed-mutex.test.ts` first**

```ts
describe('createKeyedMutex (P4c Decision 13)', () => {
  it('runs two callers of ONE key one after the other', async () => {
    const run = createKeyedMutex()
    const seen: string[] = []
    await Promise.all([
      run('net-a', async () => { seen.push('first in'); await sleep(40); seen.push('first out') }),
      sleep(5).then(() => run('net-a', async () => { seen.push('second in'); seen.push('second out') })),
    ])
    expect(seen).toEqual(['first in', 'first out', 'second in', 'second out'])
  })

  it('lets two keys run at the same time', async () => { … expect(seen).toEqual(['a in', 'b in', 'b out', 'a out']) })

  it('releases the key when the caller throws — the next one still runs', async () => {
    const run = createKeyedMutex()
    await expect(run('net-a', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(run('net-a', async () => 'through')).resolves.toBe('through')
  })
})
```

- [ ] **Step 2: Implement it**

```ts
/**
 * One caller at a time per key, in this process.
 *
 * It guards an app network: `ensureAppNetwork` attaches §10's gateway and then the
 * container is created, and a retire decides whether anything still needs the gateway
 * and detaches it. Interleave those two and an AI app can come up with no route to its
 * models — which P4b measured as a student waiting 611 s (finding 181).
 *
 * IN PROCESS, deliberately. The control plane is one process (§21); two of them against
 * one daemon is not a Phase 1 configuration, and the environment lock in `db/locks.ts`
 * is what serializes anything that crosses a process boundary.
 */
export function createKeyedMutex(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>()
  return async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve()
    let release = (): void => {}
    const mine = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => mine)
    tails.set(key, tail)
    await previous
    try {
      return await fn()
    } finally {
      release()
      if (tails.get(key) === tail) tails.delete(key)
    }
  }
}
```

- [ ] **Step 3: The alias, and the labels**

`names.ts`:

```ts
/**
 * What the EDGE dials to reach one instance. `mf-i-<instanceId>` — 41 characters.
 *
 * A dial address is a DNS label, and a label is at most 63 octets. A container name
 * carries the slug, the environment, the release and the instance (§11), which for a
 * 39-character slug is 72 — so the name cannot be the dial address. The alias is
 * bounded, unambiguous (Docker resolves it only on the app's own network) and is what
 * `servingInstance` maps back to a container.
 */
export const INSTANCE_ALIAS_PREFIX = 'mf-i-'
export function instanceAlias(instanceId: string): string {
  return `${INSTANCE_ALIAS_PREFIX}${instanceId}`
}
```

`instances.ts`:

```ts
/**
 * What a container says about itself. The driver reads an instance's identity, its
 * hostname, its port and whether it needs §10's gateway from HERE and not from the
 * database — §5 keeps `runtime/` away from `db/`, and a container whose row `pnpm test`
 * truncated is still a container this driver has to be able to retire.
 */
export const LABEL = {
  slug: 'manifest.slug',
  environment: 'manifest.environment',
  release: 'manifest.release',
  instance: 'manifest.instance',
  hostname: 'manifest.hostname',
  port: 'manifest.port',
  aiGateway: 'manifest.ai-gateway',
  envHash: ENV_HASH_LABEL,
} as const
```

In `ensureInstanceContainer`: `const url = \`https://${spec.hostname}\``; the mismatched-hash branch throws `DriverRefusalError('INSTANCE_SPEC_CHANGED', …)` (Task 2); and the create body gains

```ts
    Labels: {
      [LABEL.slug]: spec.projectSlug,
      [LABEL.environment]: spec.environmentKind,
      [LABEL.release]: spec.releaseId,
      [LABEL.instance]: spec.instanceId,
      [LABEL.hostname]: spec.hostname,
      [LABEL.port]: String(spec.port),
      [LABEL.aiGateway]: String(spec.needsAiGateway),
      [LABEL.envHash]: envHash,
    },
    // The alias the edge dials. It has to be set at CREATE time: an alias added by a
    // later `network connect` applies to that attachment, and this container already
    // has one from `NetworkMode`.
    NetworkingConfig: {
      EndpointsConfig: { [deps.networkName]: { Aliases: [instanceAlias(spec.instanceId)] } },
    },
```

- [ ] **Step 4: The private probe**

`probes.ts`:

```ts
/**
 * Is this instance ready, asked from INSIDE THE EDGE.
 *
 * The edge is attached to every app network (`PLATFORM_NEIGHBOURS`), carries `curl`, and
 * has no proxy environment — measured 2026-09-15: `docker exec manifest-caddy curl
 * http://<container>:3000/healthz` answered the app's own body in 3 ms. So this asks the
 * same question, from the same place, that Caddy will ask when the route moves — and it
 * asks it WITHOUT the public hostname, which is what keeps the edge's wildcard out of
 * the answer (P4b finding 193: a status-only probe of an unrouted name passes).
 *
 * The alias resolves to exactly one container on one network, so a 200 here is this
 * instance's 200 by construction.
 */
export function privateProbe(
  engine: EngineClient,
  edgeContainer: string,
  upstream: string,
  healthPath: string,
): () => Promise<number> {
  return async () => {
    const exec = containerExec(
      engine,
      edgeContainer,
      ['curl', '-sS', '-m', '5', '-o', '/dev/null', '-w', '%{http_code}', `http://${upstream}${healthPath}`],
      {},
    )
    let out = ''
    // A failure to RUN the probe — no edge container, no exec — reaches `waitForReady`
    // as a throw, which reports "the probe could not run" rather than a status.
    for await (const chunk of exec.stdout) out += chunk
    await exec.exitCode
    const code = Number.parseInt(out.trim().slice(-3), 10)
    return Number.isNaN(code) ? 0 : code
  }
}
```

- [ ] **Step 5: Rewrite `ensureInstance`**

```ts
    async ensureInstance(spec: InstanceSpec): Promise<InstanceHandle> {
      const network = appNetwork(spec.projectSlug, spec.environmentKind)
      const upstream = `${instanceAlias(spec.instanceId)}:${spec.port}`
      // The network, the proxy, the image and the container, with nothing else touching
      // this network meanwhile (Decision 13).
      const handle = await perNetwork(network, async () => {
        await ensureAppNetwork(
          engine, spec.projectSlug, spec.environmentKind,
          spec.needsAiGateway ? [AI_GATEWAY_NEIGHBOUR] : [],
        )
        const proxy = await ensureEgressProxy(engine, { slug: spec.projectSlug, kind: spec.environmentKind, allow: spec.egressAllow })
        await ensureImagePulled(engine, spec.image, pullToken, options.registryPublicHost)
        return ensureInstanceContainer(engine, spec, {
          networkName: network,
          dnsServer: options.dnsServer,
          proxyUrl: proxy.url,
          diskQuotaEnforceable: host.diskQuota,
        })
      })

      /**
       * 1. READY, WITHOUT TOUCHING THE ROUTE. Whatever serves this hostname keeps
       *    serving it while the new instance starts — which is the whole of §11's
       *    Redeploys, and the 1.4 s of empty 502s the brief measured without it.
       */
      const readiness = await waitForReady({
        url: `http://${upstream}${spec.healthPath}`,
        probe: privateProbe(engine, EDGE_NEIGHBOUR, upstream, spec.healthPath),
        timeoutMs: options.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS,
        intervalMs: 1000,
      })
      if (!readiness.ready) {
        // The instance STAYS: §14's Incident is read through this handle, and §11 has
        // the caller remove it once that is captured.
        throw new InstanceNotReadyError(
          handle,
          `readiness: GET ${spec.healthPath} on ${upstream} from the edge — ${readiness.reason} (${readiness.attempts} attempts)`,
          `${handle.name} started and never answered 200 at ${spec.healthPath} — ${readiness.reason}`,
          `The route did not move, so whatever served ${spec.hostname} still does. ` +
            `\`docker logs ${handle.name}\` is the next thing to read.`,
        )
      }

      /** 2. ONE IN-PLACE MOVE. */
      const previous = await servingRoute(options.routing, spec.hostname)
      await applyRoute(options.routing, {
        hostname: spec.hostname,
        upstream,
        kind: spec.environmentKind,
        instanceId: spec.instanceId,
      })

      /**
       * 3. AND THE EDGE MUST SAY SO ITSELF. Not a status — the wildcard answers 200 for
       *    a hostname with no route at all — but this instance's own identity, off the
       *    header the route sets.
       */
      const verified = await waitForIdentity({
        url: handle.url,
        expected: spec.instanceId,
        probe: edgeIdentityProbe(engine, spec.hostname, spec.healthPath, options.caCertPath, {
          dnsServer: options.dnsServer,
        }),
        timeoutMs: IDENTITY_TIMEOUT_MS,
        intervalMs: 500,
      })
      if (!verified.ready) {
        // PUT IT BACK. The previous instance is still running and still healthy; leaving
        // the hostname on a move we could not confirm is the outage this refuses.
        await restoreRouteTo(options.routing, previous, spec.hostname, spec.environmentKind)
        throw new InstanceNotReadyError(
          handle,
          `identity: GET ${spec.healthPath} at ${handle.url} through the edge did not answer as ${spec.instanceId} — ${verified.reason}`,
          `${handle.name} is ready, and ${spec.hostname} did not reach it`,
          'The route was put back to what served before. The edge, its route and DNS are ' +
            'what to look at; the container itself answered on its own network.',
        )
      }
      return handle
    },
```

with `const IDENTITY_TIMEOUT_MS = 15_000` and `const perNetwork = createKeyedMutex()` beside the build queue.

- [ ] **Step 6: The Docker-tier proof, before the control plane exists**

`runtime/docker/redeploy.docker.test.ts` — the driver's own takeover, under load:

```ts
describeDocker('a takeover, at the driver (§11 Redeploys)', () => {
  it('a second instance takes the hostname over with no 502 and no wildcard answer', async () => {
    const driver = await dockerDriverForTests()
    const image = await driver.buildImage({ repoPath: '/tmp/repo', commitSha: 'abc123' }, { blueprintRef: 'fixture-node@1', projectSlug: SLUG })
    const first = await driver.ensureInstance(specFor(image, randomUUID(), 'release-aaaaaaaa'))
    // The loop starts AFTER the first instance serves: before that the wildcard answers,
    // and counting that would be counting the platform's normal state as a failure.
    const loop = loopThroughEdge(HOST, 30)
    const second = await driver.ensureInstance(specFor(image, randomUUID(), 'release-bbbbbbbb'))
    const seen = await loop
    expect(seen.filter((line) => line.wildcard)).toEqual([])
    expect(seen.filter((line) => line.status >= 500)).toEqual([])
    // And it really did change instance — otherwise a route that never moved would pass.
    expect(seen.at(0)!.instance).toBe(first.id === second.id ? seen.at(-1)!.instance : FIRST_ID)
    expect(seen.at(-1)!.instance).toBe(SECOND_ID)
  }, 900_000)

  it('an instance that never becomes ready leaves the route where it was', async () => { … })

  it('a move the edge cannot confirm is put back', async () => {
    const real = await dockerDriverForTests()
    const first = await real.ensureInstance(specFor(image, randomUUID(), 'release-aaaaaaaa'))
    // A SECOND driver whose route writes do NOTHING — the route never actually moves, so
    // the identity check cannot pass. The first driver is the real one, or this test
    // would be proving that a broken edge breaks the first deploy too.
    const lying = await dockerDriverForTests({
      routing: { caddy: { ...createCaddyClient(ADMIN), patchRoute: async () => {}, putRoute: async () => {} }, servers: SERVERS },
    })
    await expect(
      lying.ensureInstance(specFor(image, randomUUID(), 'release-bbbbbbbb')),
    ).rejects.toBeInstanceOf(InstanceNotReadyError)
    // Refused, and what served still serves.
    expect(await real.servingInstance(HOST)).toBe(first.id)
  }, 900_000)
})
```

`loopThroughEdge` runs one `curlimages/curl` container printing `status|instance|body` per request and parses `docker logs`; `specFor` builds the `InstanceSpec` through `renderInjection`, as `roundtrip.docker.test.ts` does.

- [ ] **Step 7: Update the two suites this changes**

- `instances.docker.test.ts`: *'reuses a container whose environment is unchanged, and REPLACES one whose environment changed'* becomes *'…and REFUSES one whose environment changed — it never replaces what may be serving'*, expecting `DriverRefusalError` with `code: 'INSTANCE_SPEC_CHANGED'` and the container still there.
- `roundtrip.docker.test.ts`: the refusal test's `check` now reads `readiness: GET /healthz on mf-i-<id>:9999 from the edge — …`.

- [ ] **Step 8: Gates, Docker tier, negative controls**

**Each watched red:**
- (a) Move `applyRoute` above the readiness wait → the no-502 test fails (this is the brief's baseline, as a test).
- (b) Drop the `restoreRouteTo` call → *a move the edge cannot confirm is put back* fails.
- (c) Point the private probe at the public hostname instead of the alias → it passes against the wildcard for an instance that never started; the never-ready test fails.
- (d) Remove the alias from `NetworkingConfig` → the private probe cannot resolve, and every deploy fails readiness (the control for Decision 2).

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(runtime/docker): start beside, ready privately, move once, verify by identity"
```

---

## Task 5: Retire, list, serve, restore — and the contract suite green on Docker

**Files:**
- Create: `packages/control-plane/src/runtime/docker/containers.ts`
- Modify: `packages/control-plane/src/runtime/docker/driver.ts` (the four methods)
- Modify: `packages/control-plane/src/runtime/docker/networks.ts` (`detachAiGatewayIfUnused`) + `networks.test.ts`
- Modify: `blueprints/fixture-node/skeleton/server.js` (`/hold?ms=`)
- Modify: `packages/control-plane/src/runtime/docker/testing.ts` (stamped contract repo; continuity fixtures)
- Modify: `packages/control-plane/src/runtime/docker/driver.docker.test.ts` (fixtures, route cleanup)
- Modify: `packages/control-plane/src/runtime/docker/redeploy.docker.test.ts` (retire, volume, gateway)

**Interfaces:**
- Produces: `listContainers(engine, labels)`, `inspectApp(engine, id)`; `detachAiGatewayIfUnused(engine, slug, kind)`; the Docker driver's `retireInstance`/`servingInstance`/`listInstances`/`restoreRoute`; the contract's Docker continuity fixtures.
- Consumes: Task 3's `inFlightTo`, `upstreamsInUse`, `applyRoute`; Task 4's `LABEL`, `instanceAlias`, `perNetwork`.

- [ ] **Step 1: The app the drain tests need**

In `blueprints/fixture-node/skeleton/server.js`, before the fallback:

```js
  // P4c: the driver contract's drain tests hold ONE request open here, so a retire can
  // be SHOWN to wait for it — and to stop waiting at its bound. Bounded at 60 s: a
  // fixture that could hold a request for ever is a fixture that can hang a suite.
  if (url.pathname === '/hold') {
    const ms = Math.min(Number(url.searchParams.get('ms') ?? 0), 60_000)
    await new Promise((resolve) => setTimeout(resolve, ms))
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('held')
    return
  }
```

And `ensureContractRepo` gets a stamp, exactly as `fixtureBareRepo` has one:

```ts
/**
 * …idempotent across runs, and REBUILT when the skeleton changes.
 *
 * It used to return early whenever `/tmp/repo` existed, so a skeleton edited after the
 * first run was never tested again — the same shape as the stale bare repo that made a
 * negative control pass against an app it had already edited (ORIENTATION §4). The
 * stamp is over names AND contents, recursively.
 */
```

- [ ] **Step 2: Write the Docker continuity fixtures**

In `runtime/docker/testing.ts`, and used from `driver.docker.test.ts`:

```ts
export function dockerContinuityFixtures(): ContinuityFixtures {
  const routing = { caddy: createCaddyClient('http://127.0.0.1:7119'), servers: { internal: 'srv0', public: 'srv0' } }
  return {
    // The fixture app answers 404 for a path it does not serve, and readiness takes 200
    // only — so this instance starts, runs, and never becomes ready.
    neverReady: (spec) => ({ ...spec, healthPath: '/never-ready' }),
    holdMs: 20_000,
    shortDrainMs: 3_000,
    holdRequest: async (driver, hostname) => {
      const done = run('docker', ['run', '--rm', '--network', 'manifest-platform', '--dns', '10.89.0.53',
        '-v', `${CA_CERT}:/ca.crt:ro`, 'curlimages/curl:8.11.1', '--cacert', '/ca.crt', '-sS', '-m', '60',
        `https://${hostname}/hold?ms=20000`])
        .then(({ stdout }) => ({ ok: stdout.trim() === 'held' }), () => ({ ok: false }))
      // IN FLIGHT means the EDGE is holding it against the upstream — which is also the
      // signal the drain reads, so a fixture that returned early would make the drain
      // test pass against a request that had not started.
      const serving = await servingRoute(routing, hostname)
      await waitUntil(async () => ((await inFlightTo(routing, serving!.upstream)) ?? 0) >= 1, 30_000)
      return { done }
    },
    dropRoute: async (hostname) => { await routing.caddy.deleteRoute('srv0', routeIdFor(hostname)) },
    hostname: () => `contract-${randomUUID().slice(0, 8)}.staging.manifest.internal`,
  }
}
```

and in `driver.docker.test.ts`:

```ts
  describeDriverContract('docker', () => dockerDriverForTests({ readinessTimeoutMs: 20_000 }), {
    runnableImage: (driver) => driver.buildImage({ repoPath: '/tmp/repo', commitSha: 'abc123' }, { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' }),
    continuity: dockerContinuityFixtures(),
  })
```

**The suite's `afterAll` must also remove the app-files volumes and every route the continuity block created** — the block's own `afterAll` drops the routes, and the suite removes containers by label, not by repeated `name` filters (P4b 192).

- [ ] **Step 3: Run the contract on Docker and watch it fail**

```bash
MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/runtime/docker/driver
```

Expected: the continuity block now RUNS and fails on `DRIVER_UNSUPPORTED` from Task 2's refusals.

- [ ] **Step 4: Implement the four methods**

`containers.ts`:

```ts
export interface AppContainer { id: string; name: string; labels: Record<string, string>; running: boolean }

/** Containers carrying every one of these labels. Repeated label filters AND (measured
 *  2026-09-15) — unlike repeated `name` filters, which OR and once listed another app's
 *  container during a cleanup (P4b finding 192). */
export async function listContainers(engine: EngineClient, labels: string[]): Promise<AppContainer[]>
export async function inspectApp(engine: EngineClient, id: string): Promise<AppContainer | undefined>

/**
 * The container an edge dial address names: `mf-i-<instanceId>:<port>` since P4c — found
 * by its `manifest.instance` label — and the container's own NAME before it, because a
 * route written before this plan is still live until that app's next deploy.
 */
export async function containerForUpstream(engine: EngineClient, upstream: string): Promise<string | undefined>
```

In `driver.ts`:

```ts
    /**
     * What the hostname reaches, read from the EDGE'S OWN CONFIGURATION rather than from
     * the wire: a wire check cannot tell "nothing is routed" from "the app is slow", and
     * Decision 12 makes the difference between retiring nothing and retiring everything.
     */
    async servingInstance(hostname: string): Promise<string | undefined> {
      const serving = await servingRoute(options.routing, hostname)
      if (serving === undefined) return undefined
      return containerForUpstream(engine, serving.upstream)
    },

    /**
     * Every app container of this hostname — and the containers from before P4c, which
     * carry no hostname label and are exactly what R7 exists to reap. A database or an
     * egress proxy is never listed: only an app container carries `manifest.release`
     * (measured 2026-09-15).
     */
    async listInstances(hostname: string): Promise<string[]> {
      const byHostname = await listContainers(engine, [`${LABEL.hostname}=${hostname}`, LABEL.release])
      const found = new Map(byHostname.map((c) => [c.name, c]))
      for (const container of byHostname) {
        const slug = container.labels[LABEL.slug]
        const kind = container.labels[LABEL.environment]
        if (slug === undefined || kind === undefined) continue
        const siblings = await listContainers(engine, [`${LABEL.slug}=${slug}`, `${LABEL.environment}=${kind}`, LABEL.release])
        for (const sibling of siblings) {
          if (sibling.labels[LABEL.hostname] === undefined) found.set(sibling.name, sibling)
        }
      }
      return [...found.keys()]
    },

    async retireInstance(id: string, { drainMs }: RetireOpts): Promise<void> {
      const container = await inspectApp(engine, id)
      if (container === undefined) return // gone already: a no-op, like destroyInstance
      const upstream = upstreamFor(container)
      /**
       * THE SECOND GUARD, and it reads the edge rather than the caller's intent: any
       * route dialling this instance means it is serving somebody, including a hostname
       * this driver was never told about. The control plane also chooses not to retire
       * what serves; this is what makes a wrong choice harmless.
       */
      if ((await upstreamsInUse(options.routing)).has(upstream)) {
        throw new DriverRefusalError(
          'INSTANCE_SERVING',
          `${container.name} is dialled by a live route (${upstream})`,
          'A retire never changes what a hostname reaches (§11). Move the hostname first.',
        )
      }
      await drainUpstream(options.routing, upstream, drainMs)
      // No stop-then-remove: the drain is the wait, and `force` removes what is left —
      // a second grace period here would double every retire for nothing.
      await destroyInstanceContainer(engine, id)
      const slug = container.labels[LABEL.slug]
      const kind = container.labels[LABEL.environment] as InstanceSpec['environmentKind'] | undefined
      if (slug !== undefined && kind !== undefined) {
        await perNetwork(appNetwork(slug, kind), () => detachAiGatewayIfUnused(engine, slug, kind))
      }
    },

    async restoreRoute(id: string): Promise<void> {
      const container = await inspectApp(engine, id)
      const hostname = container?.labels[LABEL.hostname]
      const instanceId = container?.labels[LABEL.instance]
      const kind = container?.labels[LABEL.environment] as InstanceSpec['environmentKind'] | undefined
      if (container === undefined || hostname === undefined || instanceId === undefined || kind === undefined) {
        throw new DriverRefusalError(
          'INSTANCE_NOT_FOUND',
          `no instance '${id}' with a hostname to restore`,
          'Only an instance this driver created since P4c carries its hostname. An app ' +
            'deployed before it gets its Route record at its next deploy.',
        )
      }
      await applyRoute(options.routing, { hostname, upstream: upstreamFor(container), kind, instanceId })
    },
```

with

```ts
/**
 * Waits until the edge holds nothing against this upstream.
 *
 * `undefined` is not zero: it means Caddy does not list the address at all. Task 1
 * measured which of those a moved route produces, and this constant carries the answer.
 *
 * MEASURED 2026-09-15 (Task 1, M1), and `true` is confirmed. After a PATCH moved the
 * route away, Caddy kept reporting `num_requests: 1` for the old address for 4,000 ms —
 * the whole time the held request was in flight — and the address became UNLISTED only
 * after that request finished (200 in 6.81 s). M1b showed the other half: with a second,
 * unreachable route still referencing the same address it stayed listed and went 1 -> 0
 * when the request ended. So the pool counts addresses the configuration references, and
 * an address nothing references any more has no request left on it. No drain parking is
 * needed, and the drain does not have to wait its full bound.
 */
const UNLISTED_UPSTREAM_IS_IDLE = true // ← Task 1, measurement M1 — CONFIRMED

async function drainUpstream(routing: RoutingDeps, upstream: string, drainMs: number): Promise<void> {
  const deadline = Date.now() + drainMs
  for (;;) {
    const inFlight = await inFlightTo(routing, upstream)
    if (inFlight === 0) return
    if (inFlight === undefined && UNLISTED_UPSTREAM_IS_IDLE) return
    if (Date.now() >= deadline) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

/** The address the edge dials for this container: its alias since P4c, its NAME before. */
function upstreamFor(container: AppContainer): string
```

`detachAiGatewayIfUnused` in `networks.ts`:

```ts
/**
 * Takes §10's gateway off an app network once nothing on it needs one (P4b finding 80).
 *
 * Here, in the retire, because this is the first moment it is safe: the container that
 * was using the gateway has just been removed, and the one that replaced it declared no
 * models. Detaching during the deploy would cut the previous release off from its models
 * while it was still serving — and P4b measured what that costs: 611 s (finding 181).
 *
 * A container from before P4c carries no `manifest.ai-gateway` label, and is read as
 * needing one: the safe direction is to leave the gateway attached.
 */
export async function detachAiGatewayIfUnused(engine, slug, kind): Promise<'detached' | 'kept' | 'absent'>
```

- [ ] **Step 5: Extend the Docker redeploy suite**

Add to `redeploy.docker.test.ts`:
- **'retires the instance it replaced, with its files volume'** — `docker volume ls` shows no `…-app-files` for the retired instance (P4b 194).
- **'takes the model gateway off the network once no instance needs it'**, with its positive control: while an AI instance is still there, the gateway stays.
- **'lists an instance from before P4c, and retires it'** — create a container by hand with only the pre-P4c labels (slug, environment, release) and prove `listInstances` finds it and `retireInstance` removes it. **This is R7's backlog, as a test.**

- [ ] **Step 6: Gates, the whole Docker tier, negative controls**

```bash
make up && pnpm test:docker
```

**Each watched red:**
- (a) Delete the `upstreamsInUse` check → the contract's *REFUSES to retire the instance that is serving* fails.
- (b) Return `0` instead of `undefined` from `inFlightTo` for an unlisted address → the *waits for a request in flight* test fails.
- (c) Widen the selector to `manifest.slug` alone → *listInstances names … and nothing else* fails, listing the database.
- (d) Make `detachAiGatewayIfUnused` treat a missing label as "does not need one" → the pre-P4c positive control fails.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(runtime/docker): drain and retire, without touching a route"
```

---

## Task 6: The data and the keys — a Route record, three event types, a key per instance, one lock

**Files:**
- Modify: `packages/control-plane/src/db/schema.ts`
- Create: `packages/control-plane/drizzle/0009_*.sql` (generated)
- Create: `packages/control-plane/src/db/locks.ts` + `locks.test.ts`
- Modify: `packages/control-plane/src/db/index.ts`, `db/testing.ts`, `packages/control-plane/vitest.global-setup.ts`
- Modify: `packages/control-plane/src/observability/events.ts` + `events.test.ts`
- Modify: `packages/control-plane/src/secrets/store.ts` + `secrets.test.ts` + `secrets/index.ts`
- Modify: `packages/control-plane/src/ai/keys.ts` + `ai/index.ts` + `ai/keys.docker.test.ts`
- Modify: `packages/control-plane/src/runtime/state-machine.ts` + `state-machine.test.ts`
- Modify: `packages/control-plane/src/config.ts` + `config.test.ts`
- Modify: `releases/releases.test.ts` and `api/testing.ts` (the key service gained methods)

**Interfaces:**
- Produces: `routes` table and its Drizzle model; `withEnvironmentLock(environmentId, fn)`; `deleteSecret(db, scope)`; `instanceKeySecretName(instanceId)`, `storeInstanceKey`, `revokeInstanceKey`, `revokeLegacyAppKey` on `AiKeyService`; event types `instance.retiring` / `instance.retired` / `instance.retire_failed`; the `interrupted` transition; `config.drainTimeoutMs`.

- [ ] **Step 1: Write the failing tests**

`db/locks.test.ts` (four tests: two holders of one environment serialize; two environments do not wait for each other; a throwing holder releases; the lock is visible in `pg_locks` while held).

`observability/events.test.ts`: the database's `events_type_known` constraint still names exactly `EVENT_TYPES` — **this test already exists and now must include the three new types**, which is how the migration and the array are held together.

`secrets/secrets.test.ts`: `deleteSecret` removes one scope's row and leaves the others; deleting an absent secret answers `false` rather than throwing.

`ai/keys.docker.test.ts`: **a key per instance** — mint and store A, mint and store B, both answer on `/key/info`; `revokeInstanceKey(A)` refuses A and leaves B; the stored secret for A is gone; a second revoke answers `false`. (The old `commitAppKey` test stays until Task 8 deletes the function with its caller.)

`state-machine.test.ts`: `provisioning`, `starting` and `waking` accept `interrupted` and land in `failed`; `healthy` does not.

`config.test.ts`: `MANIFEST_DRAIN_TIMEOUT_MS` defaults to 120000 and is read.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: The Route record (§6, never built until now)**

```ts
export const routeListener = pgEnum('route_listener', ['internal', 'public'])
export const routeKind = pgEnum('route_kind', ['canonical', 'custom'])

/**
 * §6's `Route`, and the platform's record of WHICH INSTANCE SERVES a hostname (P4c).
 *
 * Nothing recorded it before: `GET /environments/:id` answered with the instance row
 * whose `last_seen_at` was newest, which is the newest DEPLOY — including one that
 * failed. Boot re-applies the edge's routes from these rows (§12).
 *
 * `ON DELETE cascade`, unlike `audit.events`' restrict: a route is not an audit record,
 * and when an instance row goes its route goes with it.
 */
export const routes = pgTable(
  'routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    listener: routeListener('listener').notNull(),
    kind: routeKind('kind').notNull().default('canonical'),
  },
  (t) => [uniqueIndex('routes_hostname_key').on(t.hostname)],
)
```

and the `events_type_known` check gains the three types, beside `EVENT_TYPES`:

```ts
  /** §11: an instance this deploy replaced is finishing its last requests. */
  'instance.retiring',
  /** §11: it finished, its container is gone and its AI key is revoked. */
  'instance.retired',
  /** It could not be, and will be tried again — never a silent retry (§11). */
  'instance.retire_failed',
```

- [ ] **Step 4: Generate and apply the migration**

```bash
set -a; . ./.env; set +a
export MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control"
pnpm --filter @manifest/control-plane db:generate
find packages/control-plane/drizzle -name '0009_*.sql'   # `ls` is aliased; use find
```

**Read the generated file before applying it.** It must create both enums and the table, and **drop and re-add** `events_type_known` (migration 0008's own comment says a type change is a new migration that does exactly that). Then:

```bash
pnpm --filter @manifest/control-plane db:migrate
docker exec -i manifest-postgres psql -U manifest -d manifest_control -c '\dp routes'
```

`manifest_app` must hold `SELECT, INSERT, UPDATE, DELETE` — it gets them from `ALTER DEFAULT PRIVILEGES` in `ensure-app-role.sh`, and P4b's migration 0005 shipped without its grant because nobody looked (finding 129). **Look.**

Add `'routes'` to the TRUNCATE list in **both** `db/testing.ts` and `vitest.global-setup.ts`, before `instances`.

- [ ] **Step 5: The lock**

`db/locks.ts`:

```ts
/**
 * One deploy or retire per environment at a time (§11: "one reconciliation loop per
 * project, serialized"; Phase 1 does it in a straight line).
 *
 * ON ONE CONNECTION, taken from the pool and released in a `finally`: a session-level
 * advisory lock belongs to the connection that took it, and `pool.query` would take it
 * on one and release it on another. Not `pg_advisory_xact_lock`, which would need the
 * whole deploy inside one transaction — which its pooled writes and published events
 * are not.
 *
 * Not an in-process mutex: `pnpm test` and a running control plane are two processes
 * against one database, and only Postgres sees both.
 */
export async function withEnvironmentLock<T>(environmentId: string, fn: () => Promise<T>): Promise<T> {
  const key = `manifest:environment:${environmentId}`
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
    try {
      return await fn()
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
    }
  } finally {
    client.release()
  }
}
```

- [ ] **Step 6: `deleteSecret`, and a key per instance**

`secrets/store.ts`:

```ts
/** Removes one secret. `false` when there was none — a retire of an instance that never
 *  minted a key is not an error. */
export async function deleteSecret(db: Db, scope: SecretScope): Promise<boolean>
```

`ai/keys.ts`:

```ts
/**
 * An instance's own key (P4c).
 *
 * P4b stored ONE key per app and environment and revoked the previous one at the commit,
 * which is the moment the previous container is still serving — so the revoke had to
 * wait for a drain that did not exist. A key stored under its instance's id can be
 * revoked exactly when that instance is retired, and a key whose instance failed is
 * still recorded, so the next retire cleans it up.
 */
export const instanceKeySecretName = (instanceId: string): string =>
  `${LLM_API_KEY_SECRET}:${instanceId}`

export interface InstanceKeyScope {
  projectId: string
  kind: EnvironmentKind
  instanceId: string
}

export async function storeInstanceKey(db: Db, keys: MasterKeypair, input: InstanceKeyScope & { key: string }): Promise<void>

/** Revokes the key this instance held and forgets it. `false` when it held none.
 *  The REVOKE comes first: a failure leaves the secret recorded, so the next retire
 *  tries again rather than losing the only reference to a live key. */
export async function revokeInstanceKey(db: Db, client: LiteLlmClient, keys: MasterKeypair, input: InstanceKeyScope): Promise<boolean>

/** The same for P4b's environment-level `app:llmApiKey`, which every app deployed before
 *  P4c holds. Called once an environment's serving instance has a Route record — until
 *  then that key is the one the running container is using. */
export async function revokeLegacyAppKey(db: Db, client: LiteLlmClient, keys: MasterKeypair, input: { projectId: string; kind: EnvironmentKind }): Promise<boolean>
```

`AiKeyService` gains `storeInstanceKey`, `revokeInstanceKey` and `revokeLegacyAppKey`; `disabledAiKeyService()` refuses each naming `MANIFEST_AI_ENABLED`; `commitAppKey` **stays until Task 8**, which deletes it with its caller.

Every harness that builds an `AiKeyService` — `releases/releases.test.ts`, `api/testing.ts` — gains the three methods. In `api/testing.ts` the two revokes answer `false` rather than throwing: that tier has no LiteLLM and no app in it declares a model, so a retire there must not fail on a key that was never minted.

- [ ] **Step 7: The rest**

- `state-machine.ts`: add `'interrupted'` to `InstanceEvent` and to `provisioning`, `starting` and `waking`, each → `failed`. **Not to `healthy`**: a restart does not make a running app fail.
- `config.ts`: `MANIFEST_DRAIN_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000)` → `drainTimeoutMs`, beside `readinessTimeoutMs`.

- [ ] **Step 8: Gates, Docker tier, negative controls**

**Each watched red:**
- (a) Release the advisory lock on a different connection (`pool.query` rather than the held client) → the serialization test fails, and Postgres logs the unlock warning.
- (b) Remove `'instance.retired'` from the migration but leave it in `EVENT_TYPES` → the constraint test fails, naming the difference.
- (c) Make `revokeInstanceKey` delete the secret before revoking, then make the revoke throw → the key is live and nothing records it; the keys Docker test fails.
- (d) Leave `routes` out of the TRUNCATE lists → the second `pnpm test` run fails on the unique hostname.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(db,ai): §6's Route record, a key per instance, and one lock per environment"
```

---
## Task 7: The retirer — the control plane's first background work

**Its caller arrives in Task 8, in the next sitting.** That is stated here rather than left to be noticed: this project has shipped a module with no call site three times, twice with passing tests. Task 8's title says it gives this one its caller, and Task 8 is the first task of sitting 6.

**Files:**
- Create: `packages/control-plane/src/releases/retire.ts`
- Create: `packages/control-plane/src/releases/retire.test.ts`
- Modify: `packages/control-plane/src/releases/index.ts`

**Interfaces:**
- Produces: `Retirer { schedule(environmentId): void; idle(): Promise<void> }`, `createRetirer(deps)`, `retireEnvironment(deps, environmentId)`, `RetirerDeps`, `RetireOutcome`.
- Consumes: Task 2's `Driver.servingInstance`/`listInstances`/`retireInstance`; Task 6's `withEnvironmentLock`, `routes`, `revokeInstanceKey`, `revokeLegacyAppKey`, the three event types; `publishEvent` and `makeRedactor` from `observability/`.

- [ ] **Step 1: Write the failing tests**

`releases/retire.test.ts`. Seven tests; the second is the one that matters most.

```ts
describe('retireEnvironment (P4c)', () => {
  it('retires every instance of the environment that does not serve, and leaves the one that does', async () => {
    await withRollback(async (db) => {
      const { driver, environment, rows } = await threeInstances(db)  // old, serving, and one with no row
      const outcome = await retireEnvironment({ ...deps, db, driver }, environment.id)
      expect(outcome.retired.sort()).toEqual([rows.old.handle, 'inst-orphan'].sort())
      expect(await driver.servingInstance(environment.hostname)).toBe(rows.serving.handle)
      expect((await db.select().from(instances).where(eq(instances.id, rows.old.id)))[0]!.state).toBe('gone')
    })
  })

  /**
   * THE MOST DANGEROUS LINE IN THIS PLAN, as a test.
   *
   * R7 says every instance that is not serving is retired. After an edge restart NOTHING
   * serves — `routes.docker.test.ts` restarts the edge, and ORIENTATION §4 records that a
   * restart drops every runtime route — so "everything that is not serving" is EVERY
   * instance, including the one people are using. A retire that finds no serving instance
   * does nothing at all and says why.
   */
  it('does nothing at all when the hostname reaches no instance', async () => {
    await withRollback(async (db) => {
      const { driver, environment, rows } = await threeInstances(db)
      ;(driver as FakeDriver).dropRoutes()
      const outcome = await retireEnvironment({ ...deps, db, driver }, environment.id)
      expect(outcome).toEqual({ retired: [], failed: [], skipped: 'nothing-serves' })
      expect((await driver.listInstances(environment.hostname)).length).toBe(3)
      expect((await db.select().from(instances).where(eq(instances.id, rows.old.id)))[0]!.state).toBe('healthy')
    })
  })

  it('revokes each retired instance’s key AFTER its retire, never before', async () => {
    // The order IS the requirement: LiteLLM checks a key when a request STARTS
    // (measured 2026-09-14), so a key revoked while the old container is still draining
    // fails a question a student has already asked.
    expect(events).toEqual([
      'retire mf-chem-labs-staging-aaaaaaaa-11111111-app',
      'revoke key of instance old',
      'retire mf-…-orphan',
    ])
  })

  it('revokes the environment’s pre-P4c key once the serving instance has a Route record', async () => { … })

  it('does NOT revoke the pre-P4c key while the instance serving is itself from before P4c', async () => { … })

  it('records instance.retire_failed, leaves the row destroying, and never throws', async () => {
    // A driver that refuses is not a crash: §11 says a failure surfaces as an Event and
    // is tried again, and a throw here would take down the process that scheduled it.
  })

  it('never retires an instance a concurrent deploy is still starting', async () => {
    // A deploy holds the environment lock from its instance row to its Route row. This
    // holds the lock, creates an instance, makes it serve, and releases — while a retire
    // scheduled in the middle waits and then sees the NEW instance serving.
  })
})

describe('createRetirer (P4c)', () => {
  it('runs one pass per environment at a time, and runs again when something was scheduled meanwhile', async () => { … })
  it('idle() resolves only once every pass has finished', async () => { … })
})
```

- [ ] **Step 2: Run them and watch them fail**

```bash
pnpm exec vitest run --project unit src/releases/retire
```

- [ ] **Step 3: Implement it**

`releases/retire.ts`:

```ts
export interface RetirerDeps {
  db: Db
  driver: Driver
  ai: AiKeyService
  appSecrets: AppSecretResolver
  bus: EventBus
  /** §11's bound. `config.drainTimeoutMs`, 120 s by default (Rich, 2026-09-15). */
  drainMs: number
}

export interface RetireOutcome {
  retired: string[]
  failed: string[]
  skipped?: 'no-environment' | 'nothing-serves'
}

export interface Retirer {
  /** Returns at once. The pass takes the environment's lock itself. */
  schedule(environmentId: string): void
  /** Resolves when no pass is running — for tests, and for the acceptance. */
  idle(): Promise<void>
}

/**
 * ONE PASS PER ENVIRONMENT AT A TIME, and a pass NEVER THROWS.
 *
 * This is the control plane's first background work: everything else it does runs inside
 * an HTTP request. An unhandled rejection here is the whole process (Node's default), so
 * a failed pass is a line on stderr and an Event, and the next deploy or boot tries again
 * — §11: "Failures back off exponentially and surface as an Event; there is no silent
 * retry." The backing off is the next trigger; nothing here polls.
 */
export function createRetirer(deps: RetirerDeps): Retirer
```

```ts
export async function retireEnvironment(deps: RetirerDeps, environmentId: string): Promise<RetireOutcome> {
  const [environment] = await deps.db.select().from(environments).where(eq(environments.id, environmentId))
  if (environment === undefined) return { retired: [], failed: [], skipped: 'no-environment' }
  const projectSlug = environment.hostname.split('.')[0]!

  // UNDER THE LOCK: choosing what to retire, and marking it. A deploy holds the same lock
  // from its instance row to its Route row, so nothing here can select an instance that
  // is mid-deploy. The DRAIN is outside it — a deploy must not wait two minutes for one.
  const plan = await withEnvironmentLock(environment.id, async () => {
    const serving = await deps.driver.servingInstance(environment.hostname)
    if (serving === undefined) return undefined
    const targets = (await deps.driver.listInstances(environment.hostname)).filter((id) => id !== serving)
    const rows = targets.length === 0
      ? []
      : await deps.db.select().from(instances)
          .where(and(eq(instances.environmentId, environment.id), inArray(instances.handle, targets)))
    const marked: string[] = []
    for (const row of rows) {
      if (row.state === 'destroying') { marked.push(row.id); continue }
      if (!canTransition(row.state, 'destroy_requested')) continue
      await deps.db.update(instances)
        .set({ state: nextState(row.state, 'destroy_requested') })
        .where(eq(instances.id, row.id))
      marked.push(row.id)
    }
    // Is the instance that serves one this platform deployed since P4c? Only then is the
    // environment's pre-P4c key nobody's, and only then may it be revoked.
    const [servingRecord] = await deps.db.select({ id: instances.id }).from(instances)
      .innerJoin(routes, eq(routes.instanceId, instances.id))
      .where(and(eq(routes.hostname, environment.hostname), eq(instances.handle, serving)))
    return { targets, rows, marked, servingIsRecorded: servingRecord !== undefined }
  })
  if (plan === undefined) return { retired: [], failed: [], skipped: 'nothing-serves' }

  const redact = makeRedactor(
    await deps.appSecrets.secretValues(deps.db, {
      projectId: environment.projectId,
      environmentKind: environment.kind,
    }),
  )
  const retired: string[] = []
  const failed: string[] = []
  for (const handle of plan.targets) {
    const row = plan.rows.find((candidate) => candidate.handle === handle)
    const subject = row === undefined ? `container:${handle}` : `instance:${row.id}`
    const detail = { instanceId: row?.id ?? null, handle, environment: environment.kind, drainMs: deps.drainMs }
    try {
      await publishEvent(deps.db, deps.bus, {
        projectId: environment.projectId,
        subject,
        type: 'instance.retiring',
        machineDetail: detail,
        humanMessage: `The previous version of ${projectSlug} in ${environment.kind} is finishing its last requests.`,
      }, redact)

      await deps.driver.retireInstance(handle, { drainMs: deps.drainMs })

      // AFTER the drain, never at the deploy: LiteLLM checks a key when a request starts,
      // so a key revoked earlier fails a question the old container has already accepted.
      if (row !== undefined && deps.ai.enabled) {
        await deps.ai.revokeInstanceKey(deps.db, {
          projectId: environment.projectId, kind: environment.kind, instanceId: row.id,
        })
      }
      if (row !== undefined && plan.marked.includes(row.id)) {
        await deps.db.update(instances)
          .set({ state: nextState('destroying', 'destroyed') })
          .where(eq(instances.id, row.id))
      }
      await publishEvent(deps.db, deps.bus, {
        projectId: environment.projectId, subject, type: 'instance.retired',
        machineDetail: detail,
        humanMessage: `The previous version of ${projectSlug} in ${environment.kind} has been removed.`,
      }, redact)
      retired.push(handle)
    } catch (error) {
      failed.push(handle)
      // The CODE, never the message: a driver or gateway message is third-party text and
      // §14 keeps that out of an Event that a faculty member reads.
      await publishEvent(deps.db, deps.bus, {
        projectId: environment.projectId, subject, type: 'instance.retire_failed',
        machineDetail: { ...detail, error: (error as { code?: string }).code ?? (error as Error).name },
        humanMessage: `The previous version of ${projectSlug} in ${environment.kind} could not be removed yet; it will be tried again.`,
      }, redact)
    }
  }
  // P4b's environment-level key, now that the app's own instance holds its own.
  if (plan.servingIsRecorded && deps.ai.enabled) {
    await deps.ai.revokeLegacyAppKey(deps.db, { projectId: environment.projectId, kind: environment.kind })
  }
  return { retired, failed }
}
```

- [ ] **Step 4: Gates and negative controls**

**Each watched red:**
- (a) Remove the `serving === undefined` guard → *does nothing at all when the hostname reaches no instance* fails, and it fails by retiring the instance people are using.
- (b) Move the key revoke above `retireInstance` → the ordering test fails.
- (c) Take the selection out of the lock → *never retires an instance a concurrent deploy is still starting* fails.
- (d) Let a pass throw rather than publishing `instance.retire_failed` → the failure test fails, and the process would have died in production.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(releases): the retirer — drain, revoke, remove, and say so"
```

---

## Task 8: `deployRelease` — serialized, per instance, and a failure that leaves the app up. **The task that gives Tasks 5, 6 and 7 their caller.**

**Files:**
- Modify: `packages/control-plane/src/releases/release.ts`
- Modify: `packages/control-plane/src/releases/releases.test.ts`
- Modify: `packages/control-plane/src/api/server.ts`, `api/routes/delivery.ts`, `api/testing.ts`, `api/delivery.test.ts`
- Modify: `packages/control-plane/src/index.ts`
- Modify: `packages/control-plane/src/ai/keys.ts`, `ai/index.ts`, `ai/keys.docker.test.ts` (`commitAppKey` deleted with its caller)
- Create: `packages/control-plane/src/releases/redeploy.docker.test.ts`
- Modify: `releases/incident.docker.test.ts`, `releases/deploy-sso.docker.test.ts` (the new dep)

**Interfaces:**
- Produces: `DeployDeps.retirer: Pick<Retirer, 'schedule'>`; `ServerDeps.retirer: Retirer`; a deploy that writes a `routes` row.
- Consumes: Task 6's lock, keys and Route table; Task 7's retirer; Task 2's `restoreRoute`, `retireInstance`.

- [ ] **Step 1: Write the failing tests**

In `releases/releases.test.ts`:

```ts
  it('starts the new instance BESIDE the one serving, and only then makes it serve', async () => {
    // The order, from the driver's own point of view: the previous instance is still
    // there when the new one is ensured, and the Route row moves after health passes.
  })

  it('records which instance serves, and GET /environments reads that rather than the newest deploy', async () => { … })

  it('marks every other instance of the environment destroying, and schedules the retire', async () => {
    expect(scheduled).toEqual([byKind.staging!.id])
  })

  it('serializes two deploys of one environment — one Route row, one serving instance', async () => {
    // Committed rows, not withRollback: two deploys in parallel are two connections.
  })

  it('leaves the previous instance serving when the new one never becomes ready, and removes the failed one AFTER its Incident', async () => {
    // The Incident is read through the handle, so the ORDER is the assertion:
    expect(events).toEqual(['instance', 'incident captured', 'retire inst-2', 'revoke key of inst-2'])
    expect(await driver.servingInstance(hostname)).toBe(first.id)
  })

  it('puts the route back when the container’s own health check fails after the move', async () => {
    // ensureInstance resolves once the edge reaches the new instance; Docker's HEALTHCHECK
    // can still disagree a second later. restoreRoute is what that costs.
  })

  it('stores the minted key against THIS instance before the container starts, and revokes it when the deploy fails', async () => { … })
```

In `api/delivery.test.ts`: `GET /environments/:environmentId` reports the **serving** instance after a failed deploy has written a newer `instances` row.

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Reorder `deployRelease`**

Everything before the instance row is unchanged (the release, the environment, §13's production gate, the digest, the repository, `assertPromotable`, the resolved config, the project, §10's `modelsForDeploy`). From there:

```ts
  // EVERYTHING THAT CHANGES WHAT SERVES IS INSIDE THE LOCK (Decision 14): the instance
  // row, the mint, the ensure, the Route row and the marking. The drain is not — a
  // second deploy must not wait two minutes for the first one's old container.
  return withEnvironmentLock(environment.id, async () => {
    const [row] = await db.insert(instances).values({
      environmentId: environment.id, releaseId: release.id, driver: driver.name,
      kind: 'web', state: 'provisioning',
    }).returning()
    const instanceId = row!.id
    const name = instanceName(projectSlug, environment.kind, release.id, instanceId)
    // What serves right now: what a failure falls back to, and what this deploy replaces.
    const previous = await driver.servingInstance(environment.hostname)

    …services, sessionSecret, the SP registration, the files, the app's secret set and
    the redactor: unchanged, in the same order and for the same reasons…

    /**
     * §10's key, minted before the container starts and STORED AGAINST THIS INSTANCE at
     * once (P4c). P4b minted it here and committed it after health, which meant the
     * previous key was revoked while the previous container was still serving. Now each
     * instance holds its own, and the retirer revokes one only after its drain.
     */
    let minted: string | undefined
    if (aiPlan !== undefined) {
      minted = await deps.ai.mintAppKey({ projectId: environment.projectId, projectSlug, kind: environment.kind, models, monthlyUsd: aiPlan.monthlyUsd })
      try {
        await deps.ai.storeInstanceKey(db, { projectId: environment.projectId, kind: environment.kind, instanceId, key: minted })
      } catch (error) {
        // Nothing recorded it, so nothing else can ever revoke it: by value, here.
        await discardMintedKey(deps.ai, minted, environment)
        throw error
      }
    }
    …the injection context, unchanged…

    let handle: InstanceHandle
    let healthy: boolean
    let failedCheck = ''
    try {
      handle = await driver.ensureInstance({ name, instanceId, hostname: environment.hostname, … })
      const health = await waitForHealth(driver, handle.id, healthWait)
      healthy = health.healthy
      if (!health.healthy) failedCheck = `health: GET ${resolved.health} on port ${resolved.port} — ${health.why}`
    } catch (error) {
      if (error instanceof InstanceNotReadyError) {
        handle = error.handle; healthy = false; failedCheck = error.check
      } else {
        if (minted !== undefined) await revokeInstanceKeyQuietly(deps.ai, db, { projectId: environment.projectId, kind: environment.kind, instanceId })
        throw error
      }
    }

    if (!healthy && previous !== undefined && (await driver.servingInstance(environment.hostname)) === handle.id) {
      /**
       * THE ROUTE MOVED AND THE CONTAINER THEN FAILED ITS OWN HEALTH CHECK.
       * `ensureInstance` resolves once the edge reaches the new instance; Docker's
       * HEALTHCHECK runs on its own interval and can disagree a second later. The
       * previous instance is still running, so the hostname goes back to it — §13:
       * deploying a release never takes down the one it replaces.
       */
      await driver.restoreRoute(previous).catch((error: unknown) => {
        console.error(JSON.stringify({ level: 'error', msg: 'the previous instance could not be put back after a failed health check; the app is serving a failed instance', environmentId: environment.id, error: (error as { code?: string }).code ?? (error as Error).name }))
      })
    }

    const state = nextState(nextState('provisioning', 'services_bound'), healthy ? 'health_passed' : 'health_failed')
    const [updated] = await db.update(instances).set({ state, handle: handle.id, lastSeenAt: new Date() }).where(eq(instances.id, row!.id)).returning()

    if (healthy) {
      // THE PLATFORM'S RECORD OF WHAT SERVES (§6's Route). Boot re-applies the edge's
      // routes from it, and the retirer reads it to know whose key is whose.
      await db.insert(routes).values({
        instanceId, hostname: environment.hostname,
        listener: listenerFor(environment.kind), kind: 'canonical',
      }).onConflictDoUpdate({ target: routes.hostname, set: { instanceId } })

      for (const other of await db.select({ id: instances.id, state: instances.state }).from(instances)
        .where(and(eq(instances.environmentId, environment.id), ne(instances.id, instanceId)))) {
        if (other.state === 'destroying' || other.state === 'gone') continue
        if (!canTransition(other.state, 'destroy_requested')) continue
        await db.update(instances).set({ state: nextState(other.state, 'destroy_requested') }).where(eq(instances.id, other.id))
      }
    }

    …the events and the Incident: unchanged, except that `ai.key_rotated` is published
    here, at the moment the Route row moved, rather than after a commit that no longer
    exists…

    if (!healthy) {
      // §11: "removed once its Incident is captured". The Incident above read its exit
      // code and its last 200 log lines THROUGH this handle; now the container and its
      // files volume — which holds the app's SP private key — go, and so does its key.
      await driver.retireInstance(handle.id, { drainMs: 0 }).catch((error: unknown) => {
        console.error(JSON.stringify({ level: 'error', msg: 'a failed instance could not be removed; the next deploy or boot will retire it', instanceId, error: (error as { code?: string }).code ?? (error as Error).name }))
      })
      if (minted !== undefined) await revokeInstanceKeyQuietly(deps.ai, db, { projectId: environment.projectId, kind: environment.kind, instanceId })
    } else {
      // The old instances of this environment — and anything left from before P4c.
      deps.retirer.schedule(environment.id)
    }
    return updated!
  })
```

`commitAppKey` and its Docker test go with the caller they had. `discardAppKey` stays: the store-failure path above is its caller. And the helper the failure paths use, beside `discardMintedKey`:

```ts
/**
 * Revokes the key this instance was given, and never lets a gateway failure replace the
 * deploy's own failure (Rich, 2026-09-14).
 *
 * The key stays RECORDED when the revoke fails, so the next retire of this environment
 * tries again — which is the half of P4b's "a minted key can outlive a failed deploy"
 * that a key per instance closes.
 */
async function revokeInstanceKeyQuietly(
  ai: AiKeyService,
  db: Db,
  scope: InstanceKeyScope,
): Promise<void> {
  try {
    await ai.revokeInstanceKey(db, scope)
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'a minted AI key could not be revoked after a failed deploy; it stays recorded and the next retire will try again',
        projectId: scope.projectId,
        environment: scope.kind,
        error: (error as { code?: string }).code ?? (error as Error).name,
      }),
    )
  }
}
```

- [ ] **Step 4: Wire it**

- `api/server.ts`: `ServerDeps.retirer: Retirer`.
- `api/routes/delivery.ts`: pass `retirer: deps.retirer` into `DeployDeps`, and read the serving instance from the Route row:

```ts
    // WHAT SERVES, not the newest deploy. A failed deploy writes a newer instance row,
    // and reporting that one told a faculty member their app was failed while it was
    // serving perfectly.
    const [served] = await deps.db.select({ instance: instances }).from(routes)
      .innerJoin(instances, eq(routes.instanceId, instances.id))
      .where(eq(routes.hostname, environment.hostname)).limit(1)
    const [latest] = await deps.db.select().from(instances)
      .where(eq(instances.environmentId, environmentId))
      .orderBy(desc(instances.lastSeenAt)).limit(1)
    return { ...environment, instance: served?.instance ?? latest ?? null }
```

- `src/index.ts`: build the retirer once, beside the bus, and hand it over:

```ts
// P4c: what retires the instances a deploy replaced. ONE per process, like the bus, and
// it holds the driver and the key service rather than reaching for them.
const retirer = createRetirer({ db, driver, ai, appSecrets, bus, drainMs: config.drainTimeoutMs })
```

- `api/testing.ts`: `retirer: createRetirer({ db, driver, ai, appSecrets, bus, drainMs: 0 })` — a real one, because a stub would let a deploy that never schedules a retire pass every API test.

- [ ] **Step 5: The Docker-tier proof, through the real control plane**

`releases/redeploy.docker.test.ts` — `deployRelease` and the retirer against the real driver, with rows that are committed (this suite resets the database rather than rolling back: the retirer runs after the deploy returns, and a rolled-back transaction is gone by then):

```ts
describeDocker('a redeploy through deployRelease (§11 Redeploys)', () => {
  it('replaces the instance under a request loop, then retires the old one with its files volume', async () => { … })
  it('leaves the previous instance serving when a release never becomes ready, and removes the failed container', async () => { … })
  it('two deploys of one environment at once leave exactly one instance serving', async () => { … })
})
```

- [ ] **Step 6: Gates, the whole Docker tier, negative controls**

**Each watched red:**
- (a) Take `withEnvironmentLock` off `deployRelease` → the concurrent-deploy tests fail.
- (b) Write the Route row before health passes → *leaves the previous instance serving…* fails.
- (c) Remove `deps.retirer.schedule(...)` → *marks every other instance destroying, and schedules the retire* fails, and the Docker-tier redeploy test leaves two containers.
- (d) Remove the failed-instance retire → the Docker test finds the failed container still there.
- (e) Move the retire of the failed instance ABOVE `captureIncident` → the Incident's log is empty; the Incident test fails.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(releases): a deploy that replaces an instance without interrupting it"
```

---

## Task 9: Boot — the routes come back, interrupted deploys end, and a cut-short drain finishes

**Files:**
- Create: `packages/control-plane/src/releases/recover.ts` + `recover.test.ts`
- Modify: `packages/control-plane/src/releases/index.ts`
- Modify: `packages/control-plane/src/index.ts`
- Modify: `packages/control-plane/src/boot.docker.test.ts`

**Interfaces:**
- Produces: `recoverAtBoot(deps)` → `{ routesRestored, routesFailed, interrupted, scheduled }`.
- Consumes: Task 2's `restoreRoute`; Task 6's `interrupted` transition and `routes`; Task 7's retirer.

- [ ] **Step 1: Write the failing tests**

`releases/recover.test.ts`:

```ts
  it('re-applies the edge route for every Route record', async () => { … })
  it('reports a route whose instance is gone, and carries on with the rest', async () => {
    // §12 says the control plane re-applies routes at its own boot. An app whose
    // container was removed cannot be one of them, and a boot that threw here would take
    // the whole platform down for one missing container.
  })
  it('ends a deploy the restart interrupted — provisioning and starting become failed', async () => { … })
  it('schedules a retire for every environment with something left to remove', async () => { … })
  it('schedules nothing for an environment whose instances are all gone', async () => { … })
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement it**

```ts
/**
 * What a control plane does before it serves its first request (P4c).
 *
 * THREE THINGS THAT HAD NO OWNER. §12 says "the control plane re-applies all routes",
 * and nothing did — `reapplyAllRoutes` existed and had no caller, so an edge restart left
 * every app on the wildcard until somebody redeployed it. A deploy the process was
 * running when it stopped left its row in `provisioning`, a state nothing moves. And a
 * drain the process was in the middle of left a container running for ever.
 *
 * Before `listen`, deliberately: an app is reachable again before this process accepts
 * the first request that might deploy over it.
 */
export async function recoverAtBoot(deps: {
  db: Db
  driver: Driver
  retirer: Pick<Retirer, 'schedule'>
}): Promise<RecoveryReport>
```

with the three passes exactly as Decision 20 states, each failure reported by `console.error` with a code and never a message, and the report returned so `src/index.ts` can print it on the boot line:

```ts
const recovery = await recoverAtBoot({ db, driver, retirer })
// …the server is built and starts listening exactly as before, and its boot line —
// which boot.docker.test.ts reads back — carries what the recovery did:
console.log(
  JSON.stringify({
    driver: driver.name,
    port: config.port,
    ai: catalogue.enabled ? 'enabled' : 'disabled',
    routesRestored: recovery.routesRestored,
    routesFailed: recovery.routesFailed.length,
    interrupted: recovery.interrupted,
    msg: 'control plane ready',
    secretsScrubbed: secretsScrubbed.length,
  }),
)
```

- [ ] **Step 4: Prove it against a real control plane**

In `boot.docker.test.ts`, which already boots the compiled entry point and reads its line back:

```ts
  it('re-applies an app’s route at boot, after the edge lost it', async () => {
    // Deploy a real instance through the driver, record a Route row, DELETE the route
    // from Caddy (what a `docker restart manifest-caddy` does to every runtime route),
    // boot the compiled control plane, and read the hostname back through the edge —
    // by its identity header, never by a status, because the wildcard answers 200.
  }, 600_000)

  it('finishes a drain a restart cut short', async () => {
    // A running, non-serving container and a row in `destroying`: after boot the
    // container is gone and the row says gone, without any deploy happening.
  }, 600_000)

  it('ends a deploy the restart interrupted', async () => { … }, 600_000)
```

- [ ] **Step 5: Gates, Docker tier, negative controls**

**Each watched red:**
- (a) Skip `restoreRoute` at boot → the boot-tier route test fails, and the app answers the wildcard.
- (b) Let a failed `restoreRoute` throw → one missing container stops the whole boot; the *carries on with the rest* test fails.
- (c) Drop the `interrupted` pass → a row stays in `provisioning` for ever.
- (d) Assert the boot-tier route test on the STATUS rather than the identity header → it passes with no route at all (P4b finding 193, as a control).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(releases): routes, interrupted deploys and unfinished drains, recovered at boot"
```

---
## Task 10: `node-ts-mongo@1` keeps its sessions in the app's own database

**Alone, and THE ONE SITTING THAT NEEDS THE NETWORK ON.** It adds a pinned dependency, regenerates the lockfile and needs `make seed` to warm Verdaccio from it — P4a's sitting 5 and P4b's sitting 6 were alone for exactly this, and P4b's finding 143 is what happens when the warm silently does nothing.

**Files:**
- Create: `blueprints/node-ts-mongo/skeleton/auth/session.js`
- Modify: `blueprints/node-ts-mongo/skeleton/server.js`
- Modify: `blueprints/node-ts-mongo/skeleton/package.json`, `skeleton/package-lock.json`, `blueprint.yaml`
- Modify: `blueprints/node-ts-mongo/agents/AGENTS.md`
- Modify: `fixtures/proof-app/server.js`
- Modify: `packages/control-plane/src/runtime/docker/node-ts-mongo.docker.test.ts`

**Interfaces:**
- Produces: `sessionMiddleware(client)` from `skeleton/auth/session.js`; `connect-mongo@6.0.0` in both pin lists.
- Consumes: §8's `SESSION_SECRET` and `MONGODB_DB_NAME`, which the platform already injects and which the skeleton already reads with no fallback.

- [ ] **Step 1: Add the dependency, with the network on**

```bash
cd blueprints/node-ts-mongo/skeleton
npm install --package-lock-only connect-mongo@6.0.0
grep -n '"connect-mongo"' package.json package-lock.json
```

Then the same exact version in `blueprint.yaml`'s `pinned_dependencies` — `blueprints.test.ts` asserts the two agree, and C6/D30 refuse a range.

**Why 6.0.0 and not a range** (ORIENTATION §8's rule: a pin with no evidence is a pin Rich will ask about): it is the current release, its peers are the versions this blueprint already pins (`express-session ^1.17.1` against 1.19.0, `mongodb >=5.0.0` against 6.12.0), its engine floor is Node ≥20.8 against the image's 22, and it brings two runtime dependencies — `debug` and `kruptein` — into every faculty app's image.

- [ ] **Step 2: Check it through §12's gate before writing any code against it**

```bash
make seed        # warms Verdaccio from the blueprint lockfiles — network on
docker exec manifest-verdaccio sh -c 'ls /verdaccio/storage/connect-mongo /verdaccio/storage/kruptein'
make verify      # its mirror check lists every lockfile's tarballs
```

**A warm that did nothing looks exactly like a warm that worked** until the network is off (P4b finding 143: 135 of 135 cache hits, exit 0, and an empty mirror). The storage listing and `make verify` are what tell them apart. Then prove the scan gate is happy, by building the blueprint through it:

```bash
MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/runtime/docker/node-ts-mongo
```

If §12's scan blocks on a finding **with a published fix** in that closure, this task stops and reports: the gate is unwaivable and an override is Rich's (ORIENTATION §8).

- [ ] **Step 3: Write the module**

`blueprints/node-ts-mongo/skeleton/auth/session.js`:

```js
// The session, kept in the app's OWN database — not in this container's memory.
//
// WHY IT IS NOT MemoryStore. The platform replaces an app's container on every deploy
// (§11 Redeploys), and `express-session`'s default store lives in the process: measured
// 2026-09-15, every redeploy signed every user out — the first request to the new
// container answered 401 while the platform was carefully keeping SESSION_SECRET stable
// so that exactly that would not happen. express-session's own authors say MemoryStore
// is not for production.
//
// One module, imported by the skeleton's server.js AND by §16's proof app, because §20
// calls the blueprint a security multiplier: a forked copy of session handling drifts,
// and a session bug in it is a session bug in every generated application.
import session from 'express-session'
import MongoStore from 'connect-mongo'

/**
 * §8's rows, read as literals so §16's injection-drift test can see them, and with NO
 * fallback: the platform owns these values, and a default turns "Manifest did not inject
 * it" into "the app quietly used something else" — which is what `MONGODB_DB_NAME` cost
 * before 2026-09-09.
 */
const RAW = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
}

function required(name) {
  const value = RAW[name]
  if (!value) throw new Error(`${name} is required and was not injected (§8)`)
  return value
}

/** Eight hours, refreshed at most every five minutes. Eight because that is
 *  passport-saml's own request-id expiry and a working day; the refresh window keeps a
 *  read-only request from writing to the database on every page. */
const TTL_SECONDS = 8 * 60 * 60
const TOUCH_AFTER_SECONDS = 5 * 60

/**
 * The app's session middleware, over the SAME MongoClient the app already holds — one
 * connection, one set of credentials, and the sessions land in the app's own database
 * beside its own collections.
 */
export function sessionMiddleware(client) {
  return session({
    // Stored per app+environment by the platform and stable across deploys: a
    // regenerated secret signs everyone out, which is the failure this module exists to
    // prevent from the other direction.
    secret: required('SESSION_SECRET'),
    resave: false,
    saveUninitialized: false,
    // The platform terminates TLS at the edge and speaks HTTP to the container, so
    // express-session must be told the connection was secure or it refuses to set a
    // `secure` cookie and no session survives the redirect back from the IdP.
    proxy: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: true },
    store: MongoStore.create({
      client,
      dbName: required('MONGODB_DB_NAME'),
      collectionName: 'sessions',
      ttl: TTL_SECONDS,
      touchAfter: TOUCH_AFTER_SECONDS,
      // Mongo expires them itself, so an app that is asleep is not accumulating rows.
      autoRemove: 'native',
    }),
  })
}
```

- [ ] **Step 4: Use it — in both apps, and nowhere else**

In `blueprints/node-ts-mongo/skeleton/server.js`: drop `import session from 'express-session'` and `SESSION_SECRET` from its own `RAW` block, import `sessionMiddleware` from `./auth/session.js`, and replace the inline `app.use(session({…}))` with `app.use(sessionMiddleware(client))`. The same three edits in `fixtures/proof-app/server.js`.

**`client.connect()` still happens where it did**, at the end of `server.js`: the driver connects lazily on first use, and the store holds the same client.

- [ ] **Step 5: Teach it**

`agents/AGENTS.md` gains a section, between *The environment you are given* and *AI*:

```markdown
## Two releases run at once, for up to two minutes

When Manifest deploys a new version, the old one keeps serving until its last requests
finish — that is what makes a deploy invisible to the people using your app (§11). For up
to two minutes, **both versions are running against the same database.**

Two rules follow, and the platform cannot check either of them for you.

**Change the shape of your data in three releases, never one.** Add the new field and
write both; then migrate what is already stored; then, in a later release, stop writing
the old one. A release that renames a field in place will be reading its own new documents
with the previous version's code for as long as the drain lasts.

**Never keep anything that matters in the process.** Sessions, caches, counters, uploaded
files held in a variable: the next release cannot see them, and the previous release's
copy disappears when its container goes. Your session store is already in Mongo
(`auth/session.js`) — do not replace it with `express-session`'s default, which keeps
sessions in memory and signs everybody out on every deploy.
```

- [ ] **Step 6: Prove the store is real, in the Docker tier**

In `node-ts-mongo.docker.test.ts`, after the existing AuthnRequest test:

```ts
  it('writes a sign-in to the app’s OWN DATABASE, not to the container’s memory', async () => {
    // A real CWL login against the deployed blueprint app, through the edge, with the
    // app's SP row registered — then the evidence is in Mongo rather than in a cookie:
    // `express-session` writes a session document only when it has a STORE.
    await withRegisteredMetadata(spEntity.entityId, renderSpMetadata(…), async () => {
      const login = await idpLogin(handleFor(HOST), { user: 'student', password: 'student' })
      expect(login.status).toBe(200)
    })
    const { stdout } = await run('docker', ['exec', serviceContainer(SERVICE), 'mongosh',
      '--quiet', '-u', CREDENTIALS.username, '-p', CREDENTIALS.password,
      '--authenticationDatabase', 'admin',
      '--eval', `db.getSiblingDB('${CREDENTIALS.database}').sessions.countDocuments()`])
    expect(Number(stdout.trim())).toBeGreaterThanOrEqual(1)
  }, 600_000)
```

- [ ] **Step 7: Gates, Docker tier, negative controls**

```bash
pnpm test && pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
make up && pnpm test:docker
make verify
```

**Each watched red:**
- (a) Put `express-session`'s default store back (drop `store:` from `sessionMiddleware`) → the Mongo session document test fails: 0 documents. **This is the defect this task exists to fix, as a control.**
- (b) Remove `connect-mongo` from `blueprint.yaml` but leave it in `package.json` → `blueprints.test.ts`'s agreement test fails.
- (c) Give `SESSION_SECRET` a fallback in `session.js` → §16's drift test still passes and the app silently signs its cookies with a default; assert instead that `sessionMiddleware` throws when the variable is absent, and watch that test go red with the fallback in place.
- (d) Empty Verdaccio's `connect-mongo` directory and rebuild → `npm ci` fails in the builder, which is what a cold mirror does with the network off (C1).

- [ ] **Step 8: Commit**

```bash
git add blueprints/node-ts-mongo fixtures/proof-app/server.js packages/control-plane/src/runtime/docker/node-ts-mongo.docker.test.ts
git commit -m "feat(blueprint): sessions in the app's own database, so a redeploy signs nobody out"
```

---

## Task 11: `make demo-redeploy` green — P4c's acceptance

> **FOUR CORRECTIONS FROM SITTING 1, which built this script and ran it twice (2026-09-15).**
>
> 1. **Control (e) comes out GREEN as written — it does not test what it says.** It breaks the readiness probe to "status-only against the public hostname" and expects a never-ready release to succeed. But Decision 25's failing release is a manifest whose `health:` path is `/never-ready`, and the probe requests **that path**: under P4c the route has not moved, so the probe reaches the **previous** instance, which is the same application and answers `/never-ready` **404** — measured on the failed container, which served `GET /healthz` **200** at the same moment. The control fails for the wrong reason and proves nothing. **Run control (e) against a slug the platform has never deployed**, whose hostname therefore has no route at all: measured 2026-09-15, the edge's wildcard answers **200 `manifest OK host=… scheme=https` for ANY path**, `/never-ready` included. That is P4b finding 193's real shape and the only thing a status-only probe can be fooled by.
> 2. **`BAD` says nothing about the failed-release phase, so do not read it as if it did.** The same measurement is why: a release whose health path 404s is an otherwise perfect container, so in sitting 1's run the loop recorded **314 `app` responses** inside the failed-release window while the route had wrongly moved to the failed instance. The assertion that covers that phase is `the edge still names the instance that was serving` — the identity header, Decision 7 — and nothing else. Step 1's "every assertion must be green" is unchanged; what changes is what a green `BAD` is evidence of.
> 3. **The asker carries a one-second floor, and it is load-bearing.** §20 rate-limits every route at 600 events/min keyed on the client IP and both loops run on this host, so they share one budget. Without the floor, a question that fails fast — a 401 after a redeploy signed the student out — turns the asker into a ~13 req/s spin: sitting 1 measured 6,295 questions, 2,782 of them refused 429 by the edge, and **959 of the health loop's own requests, 43% of them, refused 429 as well**. Do not remove the floor to make questions "more back to back"; with answers taking seconds one is in flight regardless, which is what Step 1 requires.
> 4. **The container backlog is real and the acceptance sees it.** Sitting 1's three runs left nine app containers for one app. R7 says the first P4c redeploy of an app reaps all of them, so `exactly one app container is left` is the assertion that proves R7 as well as the retire.
> 5. **There is a TWELFTH assertion, and it is the first one.** `a question is answered before any redeploy — the AI path works`. The script no longer sleeps a fixed warm-up: an AI answer here takes 2.5–8.2 s, so `sleep 8` yielded between one and three questions, and in run B the single one it managed was still in flight when the redeploy destroyed its container — the run answered **zero** questions and `every question was answered 200` was red for a reason that had nothing to do with a redeploy. The warm-up now waits (bounded at 60 s) for the first question answered 200 and asserts it, so a broken AI path says so in its own words.

**Alone, for the reason P4a's Task 15 and P4b's Task 16 were alone:** the first end-to-end run is where this project's worst defects have always been, and P4a's passed at the first attempt and still produced eight defects, every one of them from refusing to believe it.

**Files:**
- Modify: `scripts/demo-redeploy.sh` (whatever the run shows it needs — the assertions do not move)
- Modify: `docs/superpowers/RUNBOOK.md` (*Known gaps*: the leaked-container gap closes; the offline note), `WALKTHROUGH.md` (the new demo)
- Modify: this plan's *What executing this plan found*, and the close-out sweep of ORIENTATION §6

- [ ] **Step 1: Run it from the machine as it is**

```bash
make up
# the control plane, per README's 'Running the control plane'
bash scripts/demo-redeploy.sh 2>&1 | tee /tmp/p4c-demo-1.txt
```

**Every assertion must be green, and the summary must show at least one question in flight through each redeploy** — a run where the student's loop happened to be idle proves nothing about a drain. If `resets` is greater than zero, that is R1's tolerated case: report the number, and check it against Task 1's baseline rather than treating it as new.

- [ ] **Step 2: Run it again, immediately**

A second run redeploys an app that P4c has already deployed once, which is the path every later run takes. P4a's `make demo-identity` passed its first run and failed its second.

- [ ] **Step 3: Run it from a `make reset` machine**

```bash
make reset
mv .manifest/repos /tmp/p4c-repos-aside   # `make reset` does not remove them (P4b finding 190)
make up
pnpm --filter @manifest/control-plane db:migrate
# the control plane, then:
bash scripts/demo-redeploy.sh
```

This is the run that proves the acceptance does not depend on anything a previous run left behind — including the `routes` rows, which a reset drops.

- [ ] **Step 4: The negative controls, each watched red**

Each is a one-line edit, a run, and an undo. **A control that comes out green is a finding, not a formality** — two of P4b's sitting 7 controls did, and each forced a test that goes red.

| # | Break this | What must fail |
|---|---|---|
| a | `applyRoute` back to delete-then-insert | wildcard answers appear in a redeploy window |
| b | Move the route before the private readiness wait | 502s appear |
| c | Revoke the old key at promotion rather than after the drain | a question in flight fails with an AI code |
| d | `drainMs: 0` in the retirer | an in-flight question is cut off when the old container goes |
| e | Make the readiness probe status-only against the public hostname | a never-ready release "succeeds" |
| f | Remove `retireInstance`'s serving check **and** the retirer's serving guard | the app goes down mid-run |
| g | Put `express-session`'s default store back | the student is signed out (401) |
| h | Remove `deps.retirer.schedule(...)` | two app containers at the end |
| i | Drop the `X-Manifest-Instance` header from the route | the identity assertions fail rather than passing on a status |

Control (f) takes the app down on purpose: run it last, and redeploy afterwards.

- [ ] **Step 5: Sweep what P4c changed in the documents**

- **RUNBOOK's *Known gaps*:** the leaked-container gap **closes for every redeploy from here on** — say that, say that containers from before P4c are reaped by the next redeploy of that app (R7), and keep the manual recipe for anything older, including its `-files` volume (P4b 194).
- **RUNBOOK and WALKTHROUGH:** `make demo-redeploy` exists, what it proves, and that a redeploy no longer signs anyone out.
- **ORIENTATION §4:** the facts this plan measured — Caddy's in-flight counting after a move, the deferred identity header, the DNS label limit, and anything Task 1 recorded.
- **The four gate numbers**, in ORIENTATION §2's box, `README.md`, `CLAUDE.md` and `RUNBOOK.md`, together.
- **The roadmap ledger first**, then the rest of ORIENTATION §6's checklist, including the four HTML pages — **check them rather than assuming**, and say in the record that you checked.

- [ ] **Step 6: Leave the machine as you found it**

```bash
# The `before` file is this sitting's own, taken before anything ran — every sitting
# takes one (Global Constraints).
./scripts/snapshot-machine.sh > /tmp/p4c-sitting8-after.txt
diff /tmp/p4c-sitting8-before.txt /tmp/p4c-sitting8-after.txt
```

The proof app's containers, its database and its network are expected to remain — the demo leaves a deployed app, as `make demo-ai` does. **Exactly one app container**, no orphan `-files` volume, and one LiteLLM key for the app: the acceptance asserts all three, so the diff should show nothing else.

- [ ] **Step 7: Commit**

```bash
git commit -m "test: P4c's acceptance — a redeploy nobody using the app notices"
```

---

## What this plan does not build

Everything below is named because the spec asks for it, or because someone will look for it, and silence would read as an oversight.

**Named by Rich as out of scope (R9).**

- **A deadline in the blueprint's AI client.** P4b finding 181: an app whose gateway vanishes under a pooled connection makes a person wait **611 s**, because `ubc-genai-toolkit-llm` 0.7.0 builds its OpenAI client with no `timeout` and exposes none. P4c's retire never removes the gateway while an app that needs it is running (Task 5), so the realistic trigger left is recreating `manifest-litellm` by hand. The deadline needs a decision about what a half-streamed answer means, and it belongs with the blueprint.
- **Re-applying routes when the edge restarts under a running control plane.** §12 now says routes are re-applied **at the control plane's boot**, which Task 9 builds. Noticing that the edge restarted is watching over time, which is Phase 4's reconciler (D10). Until then `docker restart manifest-caddy` — or `pnpm test:docker`, which restarts it — is followed by restarting the control plane.

**Three things a redeploy still cannot promise.**

- **A sign-in that is under way when the route moves fails once.** `passport-ubcshib` 0.1.6 drops a `cacheProvider`, so passport-saml keeps each request's id in the container's memory and the assertion comes back to a container that never issued it. Sessions are shared (Task 10); this is not. Rich's call, 2026-09-15: tolerate it. The upstream fix — forwarding `cacheProvider` — is added to ORIENTATION §8's existing `passport-ubcshib` item as a reason for UBC, and C6 forbids treating it as a prerequisite.
- **A connection reset when the edge reloads its configuration**, about one request in 300 per admin change, on any app (measured 2026-09-15). R1 tolerates it; the acceptance counts and reports it. Removing it means changing how the edge is reconfigured, which is unmeasured.
- **Two releases sharing one database.** The blueprint's knowledge pack teaches expand, migrate, contract (R8). Nothing in Phase 1 can see a schema change in a Mongo app, so nothing checks it.

**What stays P4b's, unchanged.** The per-user AI budget (validated, not enforced — §10 says so since 2026-09-15), agent keys and their TTL (Phase 3), "revoked on archive" (there is no archive operation), crash-loop detection, live tailing of an application's own output, approval decisions on the stream, and per-app metrics.

**Still open from P4a and P4b**, and P4c does not close them: secret rotation as an operation, D20's 90-day certificate alert, the second-machine clean clone, the `node:22-alpine` → 24 decision, an apk mirror, and `POST /projects` committing a project row before its repository exists (P4b finding 178).

**Deliberately not attempted here:** the reconciler (Phase 4, D10), multiple hosts, production database blue/green, and a control-plane restart that keeps its WebSocket connections open. A client reconnects to `WS /projects/:projectId/events` and is replayed the newest 50 events, which is what P4b built it to do.

---

## Spec actions

**All eight were applied on 2026-09-15, before this plan was written** (commit `888d9d1`), on Rich's instruction — the reverse of P4b's pattern, so that this plan argues from the spec as it now reads rather than from a proposal.

| Section | What changed |
|---|---|
| §11, the `Driver` interface | `retireInstance`, `servingInstance`, `listInstances` and `restoreRoute`; `ensureInstance`'s comment points at *Redeploys* |
| §11, the naming sentence | the key gained **instance**; a redeploy of one release is a new instance beside the one serving |
| §11, new *Redeploys* subsection | the whole guarantee: ready before the route moves, an in-place move verified by identity, a failed instance leaving the previous one serving, a bounded background drain, the tolerated reset, and the shared database during the drain |
| §12, *Edge* | routes re-applied **at the control plane's boot** from the Route records; a route changed in place and never removed and re-added, with the measurement; every route sets `X-Manifest-Instance` |
| §13, opening | deploying a release never takes down the one it replaces |
| §10, App key row | one key per instance, revoked after its drain, discarded if it never became ready |
| §16, driver contract row | the suite covers continuity |
| §17, phases | `1b+ — Redeploys that do not interrupt`, between 1b and 1c, with a consistency sentence in the section's lead |

**Nothing further is proposed.** If executing this plan finds a section that no longer matches what runs — which is what happened to §12's "re-applies all routes on edge start" — record it here and put it to Rich rather than editing the spec.

---

## What the self-review caught

Run against the spec and the code on 2026-09-15, after the plan was written. **Six defects in the plan's own text, and one design gap.**

1. **`revokeInstanceKeyQuietly` was called twice in Task 8 and defined nowhere.** Both failure paths used it. It is now written out beside `discardMintedKey`, and it keeps the key RECORDED when a revoke fails so the next retire tries again.
2. **`containerForUpstream` was called by `servingInstance` and declared nowhere.** It is the one place that maps an edge dial address back to a container, including the pre-P4c form where the address is the container's own name. Now declared in `containers.ts` with both cases stated.
3. **A fixture bound a value it never used** (`const serving = await shared.servingInstance(hostname)`), which `pnpm lint` would have refused in the first sitting that ran it.
4. **Six code blocks ended in a bare `…`** that did not say what it stood for. Each now names the members it is standing in for — the plan's reader is assumed to have no context, and "the rest" is not a fact.
5. **The lying-edge test could not have worked as written.** It built one driver whose route writes do nothing and then deployed *both* instances through it, so the first deploy would have failed too and the test would have proved nothing about a rollback. The first instance now goes through the real driver.
6. **Two snapshot filenames disagreed** — Task 1 wrote `/tmp/p4c-task1-before.txt`, Task 11 diffed `/tmp/p4c-before.txt`, so the last sitting's "leave the machine as you found it" would have compared against a file that does not exist.
7. **The design gap: the environment lock holds a pooled connection for the length of a deploy.** With `pg.Pool`'s default maximum of 10, ten concurrent deploys of *different* environments would starve their own queries. Named in Decision 14, with the reason it is acceptable in Phase 1 and where a queue belongs.

**Spec coverage.** Each of the eight applied spec actions has at least one task: §11's interface and naming (Task 2), §11's *Redeploys* behaviour (Tasks 4, 5, 7, 8), §12's *Edge* (Tasks 3 and 9), §13's opening (Task 8), §10's App key row (Tasks 6, 7, 8), §16's contract row (Tasks 2 and 5), §17's `1b+` row (the plan). §6's `Route` entity, which the spec has carried since it was written and nothing had built, is Task 6.

**Two states this plan is deliberately in for a sitting, rather than pretending otherwise:** the Docker driver's four methods refuse between Tasks 2 and 5, so the contract suite's continuity block is skipped for that driver and says so in its name; and the retirer has no caller between Tasks 7 and 8. Both are named in the tasks that create them and closed by the tasks that follow.

---

## What executing this plan found

*One dated section per sitting: the tasks, every defect with the measurement that found it, the negative controls, and the four gate numbers at the end. This is the record that stops the next agent repeating the work rather than continuing it, and it is where a defect that is not worth fixing yet gets named instead of lost.*

### Sitting 1 — Task 1 — 2026-09-15 — 13 findings

**What it built.** `scripts/lib/redeploy-loop.mjs`, `scripts/lib/redeploy-summary.mjs`, `scripts/demo-redeploy.sh`, `make demo-redeploy`, and `docs/superpowers/spikes/p4c-baseline/p4c-measure-edge.sh`. No production code, on purpose. **The acceptance was run three times and exited 1 every time**, with the same eleven red assertions — **eleven red and ten green, twenty-one in all** (run C; runs A and B had twenty, before the twelfth assertion of finding 5 was added); the raw output of all three runs and of the five measurements is [`../spikes/p4c-baseline/results-task1-2026-09-15.txt`](../spikes/p4c-baseline/results-task1-2026-09-15.txt).

**Run C is the baseline** — it is the script as it ships. Runs A and B are kept because each exposed a defect in the harness itself, and a baseline taken with a different script from the one that ships is exactly the drift this project pays for.

| phase | deploy | requests | app | 502-empty | outage window |
|---|---|---|---|---|---|
| same-release | 5,578 ms | 53 | 44 | **9** | +275 → +1,882 ms |
| new-release | 5,456 ms | 52 | 47 | **5** | +351 → +1,157 ms |
| failed-release | 90,599 ms | 452 | 448 | 4 | +378 → +982 ms |

Questions: 404 asked, **1 × 200** (in 8,731 ms), 400 × 401, 3 × 502. **Resets: 0.** The student was signed out **2,305 ms** after the first redeploy began. This agrees with the brief's §3.1 and is now this plan's own number.

**Three defects found by READING, before the first run.**

1. **The failing release's `manifest.yaml` edit matched nothing, and its guard passed anyway.** The plan's step 7 anchors on `^health:`; `health:` lives **indented** under `runtime:` (`fixtures/proof-app/manifest.yaml:14`). The `if` therefore took the `else` branch and appended a **top-level** `health: /never-ready`, which the guard `grep -q '^health: /never-ready$'` matches — so the control could not fail. And the top-level manifest schema is `.strict()` (`spec/schema.ts:80`), so `proof_app_validate` would have called `fail` and **the run would have exited at step 7, never reaching step 8's summary** — the whole point of the sitting. Fixed: the edit targets the indented key and asserts **both** the pre-state and the post-state.
2. **Three `proof_app_push` calls, two leaked source trees.** It mktemps a fresh `$WORK` every call and `cleanup` removes only the last. Fixed with a `push()` wrapper.
3. **Four of the run's own files were read before their writer had written them** — `frames.ndjson`, `markers.ndjson`, `loop.ndjson`, `asks.log`. A missing file is a stderr error, not a zero count. Created empty up front.

**Two defects in the harness, each found by RUNNING it and each of which made the measurement meaningless.**

4. **THE ACCEPTANCE RATE-LIMITED ITS OWN MEASUREMENT.** §20 rate-limits every route at 600 events/min keyed on the client IP; both loops run on this host and share one budget, and the `/healthz` loop at 200 ms is already 300/min. The back-to-back asker had no floor, so when the same-release redeploy signed the student out at +1.2 s each question failed 401 in ~40 ms and the asker became a **~13 requests/second spin**: run A issued **6,295 questions, 2,782 of them refused 429 by the edge**, and thirty seconds later the health loop — the measurement itself — began collecting its own 429s: **959 of 2,252, 43%**. `--bad` counts every one, so run A measured the harness. **Fixed with a one-second floor per question**, which keeps a question in flight while answers take seconds (the real case) and stops the spin when one fails instantly. Runs B and C have **zero** 429s anywhere.
5. **A fixed `sleep 8` warm-up does not guarantee the acceptance ever sees a question answered.** An AI answer here takes **2.5–8.2 s**, so eight seconds yields between one and three questions. Run A got `200 in 3,055 ms`, `200 in 2,585 ms`, `502 in 2,493 ms`; **run B got exactly one, `502 in 8,223 ms`** — still in flight when the redeploy destroyed its container at +197 ms. So run B answered **zero** questions in its whole life, and `every question was answered 200 (404 asked)` was red for a reason that had nothing to do with a redeploy. Fixed: the warm-up **waits** (bounded at 60 s) for the first question answered 200 and then **asserts** it — a twelfth assertion, `a question is answered before any redeploy — the AI path works` — so a broken AI path says so in its own words. Green in run C.

**Four facts about the platform, measured rather than read.**

6. **A failed deploy leaves the public route on the failed container.** The brief §2.6 read this from the code and said so ("*Read from the code, not measured*"). Measured: after run A's failed release the route dialled `mf-proof-app-staging-86c294fa-app:3000`, a container Docker's own HEALTHCHECK reports **unhealthy**, and nothing restored the previous route. R5 and Task 8 close it.
7. **The failed container and its files volume are left behind.** `failed release: the failed release left no container` is red: P4b Task 13 keeps the container so `captureIncident` can read its exit code and log tail, and nothing removes it afterwards. The Incident itself **is** recorded — `an Incident names the failed instance` is green. R5 removes the container once the Incident is captured.
8. **Destroying a container does NOT let an in-flight request finish, where moving a route does.** The brief §3.3 measured a request surviving a route move. A same-release redeploy today deletes the live container instead, and an AI question in flight when that happens comes back **502** — measured three times (2,493 ms, 8,223 ms, 585 ms). This is R1's interruption on a real AI call rather than a health check, which is what brief §8 asks the drain to be tested against.
9. **Zero connection resets**, across three runs, nine admin changes and ~6,800 loop requests — plus one in M3's 330 requests across 20 moves. R1's tolerated reset is real but rarer than one run will show; the acceptance counts and reports it rather than asserting on it, which is right.

**Two corrections written into later tasks** (both at the top of Task 11).

10. **Decision 25's failure mode is invisible to the request loop.** A release whose `health:` path 404s is an otherwise perfect container: measured on the failed instance, `GET /never-ready` → **404** while `GET /healthz` → **200 `{"status":"ok","mongo":true}`**. So the loop recorded **448 `app` responses inside the failed-release window** while the route had wrongly moved to the failed instance. **`BAD` therefore says nothing about that phase**; the assertion that covers it is the identity header, Decision 7, and nothing else.
11. **Task 11's negative control (e) would have come out GREEN.** It breaks the readiness probe to "status-only against the public hostname" and expects a never-ready release to succeed — but the probe requests the declared health path `/never-ready`, the route has not moved, so it reaches the **previous** instance, which is the same application and also answers 404. The control fails for the wrong reason and proves nothing. What does fool a status-only probe is P4b finding 193's real shape, measured here: **the wildcard answers 200 `manifest OK host=… scheme=https` for ANY path** on a hostname it holds no route to, `/never-ready` included. So control (e) must be run against a slug the platform has never deployed.

**Two defects in this sitting's own measurement script.**

12. **M2 raced the forge container's startup**, so its `deferred: true` probe printed nothing at all — which reads exactly like *"the header was not set"*. A measurement that cannot fail is worth nothing. Fixed in `p4c-measure-edge.sh` with a readiness wait and a **positive control first** (prove the app really does serve its own header), and M2 was re-run.
13. **A 72-character container name does not resolve, so Decision 2's bounded alias is load-bearing rather than tidy.** From inside the edge: `curl: (6) Could not resolve host … (Misformatted domain name)` and `getent hosts` gives no answer, while a 17-character name answers 200. ORIENTATION §4 gains it.

**What the five measurements decided.**

- **M1 → `UNLISTED_UPSTREAM_IS_IDLE = true`, confirmed, and no drain parking is needed.** Caddy reported `num_requests: 1` for the moved-away upstream for **4,000 ms**, the whole time the held request was in flight, and the address became `unlisted` only **after** it finished (200 in 6.81 s). **M1b is the control**: with a second, unreachable route still referencing the same address it stayed **listed** and went 1 → 0 when the request ended. Both halves agree — the pool counts addresses the configuration references, so unlisted means idle. The constant's comment now carries the measurement.
- **M2 → no correction to Task 3.** With `deferred: true` the response carries only the edge's `x-manifest-instance: edge-value`. **Control, deferred absent:** both are present, and a client's `headers.get()` returns the string `"edge-value, forged"`.
- **M3 → the design's central claim holds.** **Zero wildcard answers in 330 requests** across 20 in-place `PATCH` moves of the real route shape, at a request every 25 ms.
- **M4 → see finding 13.**
- **M5 → Task 5's retire selector is unchanged.** Repeated `--filter label=` **ANDs** (`slug=proof-app` plus `environment=nonexistent` lists nothing, while either alone lists rows), and only app containers carry `manifest.release`.

**Six negative controls, each watched.** (a) the classifier's own control — the app's route was deleted under a running loop and the loop recorded **16 × `wildcard`**, then the route was PUT back from its saved JSON and `app` resumed; without this a green run later would prove nothing; (b) M2 with `deferred` absent — both header values present; (c) M1b's parked route — the address stays listed and goes 1 → 0; (d) M5's `environment=nonexistent` — nothing listed; (e) M4's 17-character name — 200, against the 72-character name's refusal; (f) the failing release's edit asserts `health: /healthz` is present **before** it rewrites it, so the edit can fail.

**One thing left as it is, named rather than fixed.** `wait_retired` polls for 150 s and nothing retires today, so each red run spends 300 s in two waits. That is the assertion doing its job against a 120 s drain bound; a shorter poll would pass for the wrong reason once Task 7 exists.

**Machine.** `./scripts/snapshot-machine.sh` before and after: the only differences are timestamps, uptimes, 2 GiB of disk, port 7100 (the control plane, stopped at the end), and **one** proof-app container in place of the one that was there. The three runs left **ten** app containers for one app and nine build images; all were removed by explicit name with their `-files` volumes, and the eight images removed were each checked absent from the before-snapshot under every name first. The app was left **healthy and routed** by deploying the last good release through the API rather than leaving it on the failed one. LiteLLM holds **one** user and **one** key for the app — P4b's commit-and-revoke held across nine deploys.

**Gates.** `pnpm test` **736 passed, 66 files**, run **twice**, identical. `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck`, `pnpm format:check` all clean. `make doctor` **18 / 0**, `make verify` **47 / 0**, before and after. **`pnpm test:docker` was not run**: the sittings table requires it for every sitting that touched `runtime/`, `routing/`, `releases/`, `secrets/`, `ai/`, `observability/`, `blueprints/` or `infra/` — "which is all of them from sitting 2 on" — and this one touched only `scripts/`, `Makefile` and `docs/`. It also restarts the edge, which would drop every runtime route and leave the demo app unreachable (P4b finding 193). **All four numbers are unchanged, so the four documents that state them did not move.**

**Documents swept.** The roadmap ledger first, then the plan's sittings table, ORIENTATION §2, §3, §4 and §7d-3, `README.md`, `CLAUDE.md`, `RUNBOOK.md` and `WALKTHROUGH.md`. The last two now say that **`make demo-redeploy` exists and fails on purpose**, so nobody runs it expecting a working demo before Task 11 — an undocumented red target in `make help` is a trap. **The four HTML pages were CHECKED and need no change**: none of them mentions P4c, and this sitting changed no product behaviour, no decision, no hostname example and no spike count. `docs/external-track.md` is untouched — the trigger P4b fired is still Rich's, and nothing here moves it.

**No re-cut of the sittings.** Task 1's job includes moving task boundaries and it did not need to: nothing it measured changed what a later task must build. The corrections it produced are all inside tasks that already existed.

### Sitting 2 — Task 2 — 2026-09-15 — 4 findings

**What it built.** §11's redeploy contract, in code and in the suite that every driver must pass. `InstanceSpec` gained `instanceId` and `hostname`; `instanceName` gained the instance; `Driver` gained `retireInstance`, `servingInstance`, `listInstances` and `restoreRoute` plus `DriverRefusalError`; the fake driver gained an edge — a `hostname → instance` map — in-flight counters and both refusals; and the contract suite gained its **continuity block, eleven tests over §11's *Redeploys***, enabled per driver by a fixture (Decision 23).

**The fake driver runs all eleven. The Docker driver's four methods refuse, naming Task 5**, and its continuity block is skipped **with the reason in its name** — proved on the wire rather than assumed, because the default reporter prints no skipped names:

```
ok 14 - continuity — §11 Redeploys [skipped: this driver supplies no continuity fixtures] # SKIP
```

**Three findings from RUNNING it, one from reading.**

18. **The plan folded two different failure modes into one, and that erased the health-check half of §14's Incident.** Its fake driver computes `const ready = !(options.failInstances === true || neverReady(spec))` and throws `InstanceNotReadyError` whenever `!ready`. But the two model different failures. `neverReady` is §11's readiness refusal — the hostname never reaches the instance, `ensureInstance` throws, **the route does not move**. `failInstances` is an instance that **is** reachable and whose own `HEALTHCHECK` is failing: `ensureInstance` resolves, the route moves, and `deployRelease` fails afterwards at `waitForHealth`. That is what the Docker driver does, and §14's Incident has both producers. Measured: three `releases.test.ts` assertions went red — `records an Incident naming the health check` got the readiness text instead of `health: GET /healthz on port 3000 …`, and `DISCARDS the minted key…` lost `health failed` from its event order. **Fixed: only `neverReady` throws**, and the fake's comment says why the two must stay apart.
19. **`destroyInstance` would have silently stopped removing routes for a whole sitting.** Task 2 deletes `DockerDriverOptions.hostnameFor`, but `manifest.hostname` — the label that replaces it — is in **Task 4's** file list. Between the two, `destroyInstance` has no way to name the route to remove, and its removal is already wrapped in `.catch(() => undefined)`, so it would have failed silently: a route left pointing at a container that no longer exists is a permanent 502 on the app's own hostname. **One label pulled forward into Task 2**, and the driver reads the hostname off the container's own label. Found by reading, before the first run.
20. **`incident.docker.test.ts` predicted the container name before the deploy**, which the instance-in-the-name makes impossible — the row's uuid is created inside `deployRelease`. Rewritten to read it back from `instance.id`, which is the **stronger** assertion: it proves the running system derived the name from the same four parts the test did, rather than matching a literal. That is the "the test constructs the value correctly and the running system re-derives it wrongly" shape, tested from the right side.
21. **Four suites name the containers they remove**, so a random instance id would leak one container per run. `sso/testing.ts`, `roundtrip.docker.test.ts`, `s6.docker.test.ts` and `node-ts-mongo.docker.test.ts` each pin a constant uuid, the way `sso/testing.ts` already pins its release id.

**Five negative controls, each watched red.**

| | Broken | What went red |
|---|---|---|
| a | the route moved BEFORE readiness | *an instance that never becomes ready…* — the never-ready instance served |
| b | the `INSTANCE_SERVING` check deleted | *REFUSES to retire the instance that is serving* |
| c | delete-and-recreate restored for a changed environment | *the same name with a DIFFERENT environment is refused, never replaced* |
| d | `instanceId` dropped from `instanceName` | **eight tests**, in two files — including *a second instance takes the hostname over*, because without the instance in the name the second deploy collides with the first |
| e | the fake's `continuity` fixtures withheld | the block skips **and its name says why** (the TAP line above); this is the control for Decision 23 itself |

Control (d) is the one worth keeping: it fails loudly and in two files, which is what a naming key that is load-bearing should do.

**What this sitting deliberately did NOT do.** The Docker driver's four methods throw `DRIVER_UNSUPPORTED` naming Task 5, rather than answering plausibly — a `servingInstance` that returned `undefined` would read as "nothing serves", which is exactly the state Decision 12 refuses to act on and on which a retirer would remove the live app. The plan names this state and closes it in Tasks 4–5; it is recorded here rather than left to be noticed.

**Gates.** `pnpm test` **748 passed, 66 files**, run **twice**, identical — twelve more than sitting 1's 736: the eleven continuity tests and one new naming test. `pnpm test:docker` **133 passed, 11 skipped** in 25 files (~8 min) — the passing count is unchanged and the eleven skipped are the Docker driver's continuity block. `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck`, `pnpm format:check` clean. `make doctor` **18 / 0**, `make verify` **47 / 0**.

**Documents swept.** The roadmap ledger first, then the plan's sittings table, ORIENTATION §2 (both gate numbers moved this time), §3 and §7d-3, `README.md` and `CLAUDE.md`. `RUNBOOK.md` and `WALKTHROUGH.md` needed nothing: they state `make doctor` and `make verify`, which are unchanged at 18/0 and 47/0, and sitting 1 already described `make demo-redeploy` as red on purpose. **The four HTML pages were CHECKED and need no change** — none mentions P4c, and this sitting changed no product behaviour, no decision and no hostname example.

**Machine.** Exactly one proof-app container, one `-files` volume and one LiteLLM key, as sitting 1 left them. Two known gaps bit in sequence and are worth the next agent's attention, because together they leave a state that reads as healthy and is not:

- **`pnpm test:docker` restarts the edge, which drops every runtime route** (ORIENTATION §4), and nothing re-applies them until Task 9. Afterwards `https://proof-app.staging.manifest.internal/healthz` answered **`200 manifest OK host=…`** — the edge's wildcard, not the app (P4b finding 193), with the app's container up and healthy the whole time. **Read the body, never the status.**
- **`pnpm test` truncates the control plane's tables**, so the proof app no longer has a project row at all, while its container, network, database and LiteLLM key live on (P4b findings 178 and 183). A redeploy through the API was therefore not available to put the route back — there was no project to deploy.

So the route was restored **by hand**, as one admin `PUT` of exactly the route `buildRoute` produces, dialling the running container; the hostname serves the app's own body again. The next `make demo-ai` or `make demo-redeploy` recreates the project and takes it over.

The Docker tier also left five images in the daemon. Three were removed by digest, each checked absent from the previous snapshot under every name first; **two could not be, and should not be** — `local/fixture-s6` and `local/saml-unsigned` answer *"image is referenced in multiple repositories"*, which is ORIENTATION §4's shared-digest case: two fixtures built from the same source share one digest, and untagging one name only moves the diff to the other. They are named here rather than forced.
