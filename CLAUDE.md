# Manifest — working notes for Claude

**Read [`docs/superpowers/ORIENTATION.md`](docs/superpowers/ORIENTATION.md) before
doing anything else.** It is written for zero context and is the single entry point:
what Manifest is, what five spikes established, what this machine will do to you, the
plan queue, and the conventions below in full. Everything here is the short version.

## State

**P1 is executed and green (2026-09-05). The platform runs.**
`make seed && make host-setup && make up` brings up the whole §21 inventory;
`make doctor` is now **18 checks / 0 failed** and `make verify` **50 / 0**,
and both were green offline when P1 was executed. To see it run end to end, start from
[`docs/superpowers/WALKTHROUGH.md`](docs/superpowers/WALKTHROUGH.md); to operate it,
[`docs/superpowers/RUNBOOK.md`](docs/superpowers/RUNBOOK.md) — not the plan. The three host changes are in place and all reverse with
`make host-undo`. **Untested: the second-machine clean clone** — no second Mac was
available; it is recorded in the runbook's *Known gaps*, not quietly dropped.

**P2 is executed and green (2026-09-05) — all 21 tasks. The control plane runs.**
It serves HTTP on **7100**: `spec/`, `blueprints/`, `db/`, `runtime/` (the §11
`Driver`, the fake driver, the contract suite P3 inherits), `source/`, `identity/`,
`projects/`, `releases/` and a Fastify `api/` with D23.6 idempotency and the D23.7
error envelope. Run `pnpm test` **from the repo root**, not
with `--filter`; the two differ and that difference found a defect. The database
tests need `make up` and derive their connection from `.env` themselves. To run the
server, see *Running the control plane* in `README.md`.

**P3 is EXECUTED and green (2026-09-07) — all 19 tasks. The platform deploys.**
It added `runtime/docker/` (including the assembled `DockerDriver`), `routing/`,
`services/` and `build/`, plus a second test tier. **It left** `pnpm test` at 381 and
`pnpm test:docker` at 89, with `make verify` at 34 checks; the CURRENT numbers are in
the P4a paragraph below. `pnpm test:docker` needs `make up`, **fails rather than
skips** when asked to run, runs real image builds, and takes ~5 minutes. **`make demo` is the acceptance**: an app from a bare git
repository to `https://fixture-app.staging.manifest.internal`, and again from a
dropped database, a deleted repository root and an emptied registry. Executing the
nineteen tasks found **82 defects — 4.3 per task**, the highest rate measured here;
they are recorded per session in the plan's *What executing this plan found*.

**Sessions 4 and 5 are the entries worth reading before touching anything.** Each was
the first time something ran end to end, and each found that a whole half of the
platform had never worked. **Session 4: no build had ever succeeded** — the blueprint
Dockerfile's `# syntax=` directive made BuildKit fetch a frontend from Docker Hub,
which §12's egress-free builder cannot reach — and **D13's npm-mirror control was
completely inert**, because `.npmrc` arrived after `npm ci`. **Session 5: no deploy
had ever succeeded either**, through seven defects of one shape — *the test constructs
the value correctly and the running system re-derives it wrongly* (a blueprint
directory, a repository path, an image repository, a port) — plus a container health
check that every app failed, because BusyBox `wget` honours `http_proxy` and ignores
`NO_PROXY`, so D18's forced proxy denied each app's probe of its own loopback. **All
of it was green in a suite of 74 passing Docker tests.**

**P4a is EXECUTED AND GREEN: all 15 tasks (2026-09-09). P4b is EXECUTED AND GREEN —
all 16 tasks, in ten sittings, finished 2026-09-15; P4C — zero-downtime redeploys — IS
EXECUTED AND GREEN: 11 tasks in EIGHT AGREED SITTINGS, ONE PER SESSION, FINISHED 2026-09-16 WITH 70 FINDINGS. P5a — THE CONTRACT, FIRST OF P5'S THREE PLANS — IS WRITTEN (2026-09-16): `docs/superpowers/plans/2026-09-16-p5a-the-contract.md`, 17 TASKS IN TWELVE AGREED SITTINGS, ONE PER SESSION, WITH ITS SIX SPEC ACTIONS APPLIED BEFORE EXECUTION (`491f8be`). ITS SITTING 1 — TASK 1, THE MEASUREMENTS — IS DONE (2026-09-16, 9 FINDINGS, NO PLATFORM CODE CHANGED), AND SO IS SITTING 2 — TASKS 2–3 (2026-09-16, 16 FINDINGS): EVERY RESOURCE ROUTE IS UNDER `/v1`, AND THE API IS REACHED AT `https://console.manifest.internal` THROUGH THE EDGE, REFUSED TO EVERY SOURCE BUT THE HOST. THE NEXT JOB IS SITTING 3, TASKS 4–5 (ORIENTATION §7e). **Sitting 2's to carry: an edge reload closes every WebSocket it proxied with `1001` (the console sets `stream_close_delay 1h`; app routes do not — ORIENTATION §8), a save that replaces the Caddyfile strands the edge's mount (`ensure-caddy-config.sh` re-binds), a Node process needs the platform CA passed to it, and after `pnpm test:docker` the control plane must be restarted before anyone signs in through the console.** Every premise held with its control watched: the edge refuses an app network by source (`10.89.0.1/32`) and forwards the host, a CWL sign-in and a stream work through an origin behind the edge, and the IdP echoes `RelayState`. What changed is at the top of Tasks 3, 4, 6, 9, 11 and 12 — among it, **an app's egress proxy is a second way toward the edge** (its filter refuses the console today, but `egress.allow` would accept a platform hostname), and **a one-file `vitest run` truncates the control plane's tables too**, which would have failed the plan's own M3. Rich decided four things while it was written: builds answer `202` and finish on the event stream (a deploy stays synchronous); the client is generated by `openapi-typescript` and called through `openapi-fetch`; twelve sittings; the spec actions applied now. Writing it found, among other things, that **every deployed app is same-site with the console**, so CSRF is an `Origin` check on mutations AND stream upgrades, and that **the deploy path never stores the `starting` state** it would stream. P5b and P5c are written after P5a executes. **Sitting 8 (Task 11, 2026-09-16) is P4c's acceptance, with 12 findings: `make demo-redeploy` green three times — at once, again immediately, and from a `make reset` machine — and its nine negative controls watched. FOUR OF THE NINE COULD NOT FAIL IN THE ACCEPTANCE** — a delete-then-insert route move, revoking the old AI key at promotion, a 1 ms drain and both serving guards removed — and each is now watched red in the tier that can see it, **the early key revoke in a unit test the sitting had to write because nothing caught it**. Two more changed the acceptance, which ends at 24 assertions: the asker counted a status the edge's wildcard also answers, and the failed release was read once at the end, when a never-ready instance could serve for 90 s. **The one to carry: a green `make demo-redeploy` does not prove the drain** — the deploy call outlasts the question a move leaves behind (ORIENTATION §4). **Sitting 1 (Task 1) is done, 2026-09-15, with 13 findings**: `make demo-redeploy` exists and is red by design — run three times, exit 1 each time, **eleven of its twenty-one assertions failing and ten already green** — and the baseline it measured is the plan's own number (a redeploy is ~1.0–1.9 s of empty 502s, every user is signed out, and an AI question in flight when a same-release redeploy destroys its container comes back 502). Two of the thirteen were defects in the acceptance itself that made the measurement meaningless — it rate-limited its own health loop, and a fixed warm-up let a whole run answer zero questions — both fixed before the baseline was taken. **Sitting 2 (Task 2) is done too, with 4 findings**: §11's redeploy contract is in code — `InstanceSpec.instanceId`/`hostname`, `instanceName` carrying the instance so a redeploy is a new instance BESIDE the one serving, the four new `Driver` methods, and the contract suite's eleven-test continuity block, which the fake driver passes and the Docker driver skips with the reason in its name until Task 5. The finding to carry: the plan's fake folded `failInstances` into the readiness refusal, erasing the health-check half of §14's Incident. **Sitting 3 (Tasks 3 and 4) is done too, with 7 findings, and it is the one that made the platform's central claim true at the driver**: `ensureInstance` starts the new container BESIDE what serves, proves it ready from INSIDE THE EDGE against a bounded per-instance alias `mf-i-<instanceId>`, moves the route with one in-place `PATCH`, and resolves only when the edge answers AS THAT INSTANCE — rolling the route back if it does not. `redeploy.docker.test.ts` takes a hostname over under a request every 25 ms with **zero 502s and zero wildcard answers**, where the pre-P4c order records **seven empty 502s**. Two of its nine negative controls first came out WRONG — one red before the thing under test ran, one GREEN because the "lying" driver never moved the route at all — and the finding to carry is that **neither fixture app 404s an unknown path**, so Task 5's `neverReady` fixture as written cannot work. **Nothing yet removes the old container, so a redeploy now leaves two; that is sitting 4, which is Task 5.** **`make demo-redeploy` was re-run at the end of sitting 3 and is 14 of 21 green, against sitting 1's baseline of 10** — no 5xx and no wildcard answer in any redeploy window, and of 399 questions asked under load zero returned a 5xx where the baseline returned three; the seven still red are Tasks 7, 8 and 10's. **Sitting 4 (Task 5) is done too, with 6 findings, and THE DRIVER CONTRACT IS NOW GREEN ON DOCKER — 25 of 25, 0 skipped**, where sitting 3 left the eleven-test continuity block skipped: `retireInstance` refuses anything a live route dials, drains until the edge holds nothing against the old instance — proved against a real request held open for 20 s through the real edge, and cut off at 3 s when the bound says so — removes the container with its `-files` volume, and takes §10's gateway off the app network once nothing on it needs one. **The driver can now reap what a redeploy replaced — but nothing CALLS it yet**, so a redeploy through the control plane still leaves two containers until Task 7 builds the retirer and Task 8 wires it. Two of the plan's OWN negative controls turned out to be defective and both were measured: control (b) comes out GREEN and cannot fail, and the retire guard as written protects NOTHING for a pre-P4c container — the very one R7 exists to reap. **Sitting 5 (Tasks 6 and 7) is done too, with 9 findings**: §6's `Route` record — specified since P2 and never built — exists with migration 0009; `withEnvironmentLock` serializes a deploy and a retire of one environment on one pooled connection; an AI key is stored PER INSTANCE, so a draining container's key stays live and dies exactly when that instance is retired; and `releases/retire.ts` is THE CONTROL PLANE'S FIRST BACKGROUND WORK — `retireEnvironment` reaps every instance of an environment that does not serve and **does nothing at all when NOTHING serves**, which after an edge restart is the difference between a tidy-up and removing the app people are using. **THREE of the plan's own negative controls could not fail** and all three were measured and replaced. **Sitting 6 (Tasks 8 and 9) is done too, with 10 findings, and IT GAVE ALL OF IT A CALLER — THE PLATFORM NOW REDEPLOYS ITSELF WITHOUT INTERRUPTING ANYBODY**: `deployRelease` runs everything that changes what serves inside the environment's advisory lock — the instance row, the mint, the ensure, §6's `Route` record and the marking of every instance it replaced — then schedules the retirer; an AI key is recorded against ITS OWN instance before the container starts and revoked when that instance is retired (`commitAppKey` is deleted with its caller); a release that never becomes ready leaves the previous one serving and takes its own container, files volume and key with it; and `recoverAtBoot` puts the routes back at the control plane's own boot, ends the deploys a restart interrupted and finishes the drains it cut short, BEFORE `listen`. **`make demo-redeploy` was then 19 of 21 green**, up from 14: all 560 requests across three redeploy windows were answered by the app, with no 5xx, no wildcard page and ZERO resets — and the two left red were Task 10's, one thing (the app kept sessions in memory), which sitting 7 closed. **A FOURTH of the plan's own negative controls could not fail** — Task 8's (a), measured at 58 of 58 passing with the lock removed — and sitting 5's correction 3 was confirmed by measurement: the plan's code leaks a failed FIRST deploy's container and its files volume with `INSTANCE_SERVING`. **The one to carry: `retireEnvironment` opens the app's WHOLE secret set before it retires anything, so a set it cannot open silently stops every reap of that environment.** **Sitting 7 (Task 10, 2026-09-16) is done too, with 9 findings, and A REDEPLOY NOW SIGNS NOBODY OUT**: `node-ts-mongo@1`'s `skeleton/auth/session.js` keeps sessions in the app's own Mongo through `connect-mongo` 6.0.0, with no fallback for `SESSION_SECRET` or `MONGODB_DB_NAME`, and the proof app mounts the same module; the pin was added with the network on and the mirror was watched warming (152 → 157 tarballs). **`make demo-redeploy` is 21 OF 21 GREEN AND EXITS 0, for the first time.** **A FIFTH of the plan's own negative controls could not fail** — with the network on, Verdaccio fetched the tarball Task 10's (d) had removed, mid-build; `make verify` is the control. **The one to carry: the `make seed` it needed REBUILT FOUR PLATFORM IMAGES** — the Manifest IdP came back on SimpleSAMLphp v2.5.3.1 from `^2.0` — **left unpinned on purpose, Rich's call on 2026-09-16: keep it current** — and a recreated `manifest-dns-containers` came up on no app network (ORIENTATION §4, §8). P4c is finished** — ORIENTATION §7d-3, the plan `docs/superpowers/plans/2026-09-15-p4c-zero-downtime-redeploys.md`, and its brief,
`docs/superpowers/plans/2026-09-15-p4c-brief.md`, which measured the redeploy baseline. P4a's last twelve
tasks ran in **seven agreed SITTINGS, one per session with a check-in at each
boundary**, so a session limit could not land mid-task; all seven are done, and **P4b
is split the same way into TEN sittings** (Rich, 2026-09-09) — the table is at the top
of P4b and is the maintained copy. **Sitting 1 produced 10 findings.** Its
reconciliation pass did not come back clean: `manifest_audit_owner` **does not exist**,
so two of P4b's migrations would have failed on their first statement, and both new
audit tables used `ON DELETE CASCADE`, which bypasses §20's append-only grant because a
referential action runs with the referenced table's privileges. Then LiteLLM was pinned
by digest to **`sha256:20b5044b` / 1.98.0, the version S3 measured** — Rich's call,
taken because the `main-stable` tag moved to a fresh build two hours before the task
started. `make doctor` is **18 checks** from there. **Sitting 2 (Task 3, 2026-09-14) built §16's AI-path tier and found that LiteLLM's `/user/new` mints an unconfined key unless `auto_create_key: false` is passed — Task 7's code would have done that for every app; the correction is at the top of Task 7.** **Sitting 3 (Tasks 4–5, the same day) built `ai/errors.ts` and `ai/client.ts` and found that Task 7's `ensureAiUser` would throw on every redeploy of an AI app — it matches LiteLLM text the client exists to strip — and that Task 9's client wiring cannot typecheck; both corrections are at the top of those tasks.** **Sitting 4 (Tasks 6–7, the same day) built `ai/catalogue.ts` and `ai/keys.ts` with 12 findings, and decided that AI is on unless `MANIFEST_AI_ENABLED=0` — on means a boot with no LiteLLM master key is refused, in development too. It measured that a key minted with an empty `models` list reaches EVERY model, which Task 9 must not do; A pre-flight read of Tasks 8 and 9 then wrote fifteen corrections and a note at the top of those two tasks, and ORIENTATION §7d-2 carried the sitting-5 hand-off.** **Rich then decided that no live AI call may fail because a deploy revoked its key — Task 9 now commits the new key only after the instance is healthy — and that redeploys must become zero-downtime for the whole app in a plan of their own — P4c, straight after P4b.** **Sitting 5 (Tasks 8–9, the same day) built that interim: `deployRelease` mints the app key before the instance starts, commits it only after health and discards it on failure; the gateway joins only an AI app's network; and an AI release deployed with AI switched off is refused (`RELEASE_AI_DISABLED`). 11 findings — two now in ORIENTATION §4: a network removed under a stopped container strands it, and an empty `model_info:` stops LiteLLM starting.** **Sitting 6 (Task 10, the same day) gave `node-ts-mongo@1` its AI half — `skeleton/ai/llm.js`, proved on the wire against the real toolkit in `blueprints/ai-component.test.ts` — with 14 findings: seed's npm warm had never warmed a package already in the developer's npm cache (fixed, and caught only by `make verify`), and Docker Desktop's credential helper can hang and stop `make seed` at step 2 (cleared by restarting Docker Desktop; RUNBOOK's *Known gaps*). A pre-flight read then wrote eighteen corrections at the tops of Tasks 11 and 12, and Rich settled Task 12's entropy rule.** **Sitting 7 (Tasks 11–12, the same day) built both, with 16 findings: a build's output reaches `audit.build_logs` line by line while it runs, redacted, and `makeRedactor` has §14's heuristic half. Migration 0005 applied without its grant — a `$(ls …)` captured an aliased listing — and was replayed from the file as it ships; a missing flush was invisible inside one test transaction and is now proved on the pool against a table lock. Its Docker tier ended 130 of 131: a Mongo service is reported ready 24 s or more before it accepts the app's credentials (finding 133), a platform defect since P3, measured and not fixed.** **Sitting 8 (Task 13, 2026-09-15) settled that race first — a Mongo service is healthy only once it enforces authentication, and its check runs every second only while it starts — and then built §14's `Incident`, with 20 findings. The plan's caller position was unreachable on the Docker driver: a readiness refusal threw with no handle, so an app that crashed as it started left no record and a row parked in `provisioning`. It now throws `InstanceNotReadyError` carrying the handle, and `deployRelease` records a `failed` instance with an Incident — exit code, last 200 log lines, failing check and diff since the last healthy release, redacted at capture and append-only — served with its repair prompt at `GET /environments/:environmentId/incidents`. A failed deploy is therefore a `200` whose state is `failed`. **Sitting 9 (Tasks 14–15, the same day) built D23.2's stream, with 18 findings: `WS /projects/:projectId/events` is authorized in a route hook BEFORE the upgrade — the plan's code authorized inside the socket handler, after it, and could not pass its own test — and every build, deploy, Incident and AI key rotation, plus P4a's SSO registrations, reaches it through one `publishEvent` that records the row and publishes it as stored. `audit.events` gained `clock_timestamp()` and a database CHECK on its nine types, and a deploy now opens the app's secret set before it mints anything. ** **Sitting 10 (Task 16, the same day) finished P4b, with 22 findings: §16's proof app answers a question from the asker's own notes, charged to `sha256(puid ‖ project ‖ environment)`, and `make demo-ai` proves it — the event stream carrying the deploy, a streamed answer, a 768-dimension embedding and LiteLLM's own spend log — green from a `make reset` machine, twice. The blueprint's `embed()` had charged every embedding to nobody (fixed), and an app whose gateway vanishes under a pooled connection makes a student wait 611 s (named, for P4c and the blueprint). The external-track trigger has fired; starting it is Rich's call.** *Sittings pace the work; they are not §17's product Phases.*
**`make demo-identity` is P4a's acceptance and it passes**: §16's proof app from a bare
repository to a real CWL sign-in in which the instructor cannot see the student's note
— including from a `make reset` machine. **The offline run is outstanding and is
Rich's**, because turning the network off from a tool call cuts the agent off too.
**A real CWL login now works end to end**, which it could not before: the IdP could
neither issue an assertion nor authenticate anybody, with `make verify` green
throughout — and since Task 7 that login runs through a Service Provider registration
the control plane **derives and writes itself**, signed with a per-app RSA-4096 key it
minted and stored; since Task 9 `deployRelease` writes that registration for any app
that declares CWL. **Since Task 11 §8's injection contract is ONE function with one
producer** — `spec/injection.ts` — and `MONGODB_DB_NAME` reaches a deployed container
for the first time, measured on the running platform. **Since Task 12
`node-ts-mongo@1` exists** — the blueprint faculty applications are generated from —
built, deployed and made to issue a real AuthnRequest, with **Task 13's drift tier
reading its source** rather than a second hand-maintained list. **Since Task 14 Manifest logs its OWN users in with CWL** — §9's first sentence is that
Manifest is itself an SP — through a registration the control plane writes at its own
boot, and `POST /auth/dev-login`, an unauthenticated route that minted real sessions,
is deleted along with `MANIFEST_DEV_AUTH`; the control plane's SAML client is
`@node-saml/node-saml`, **not** the `passport-saml` the blueprint pins, because that
one carries an unfixable critical signature-verification advisory and nothing in this
platform scans the control plane's own dependency tree. `make verify` is
**50 / 0** (three console checks, P5a sitting 2), `pnpm test` **835**, `pnpm test:docker` **168 passed and NOTHING skipped** (P5a sitting 2 added S6 probe 15) (P4c Task 5 gave the Docker driver the driver contract's continuity fixtures), all passing — one added 2026-09-14 when §12's scan turned out to refuse any vulnerability database more than five days old (fixed in `build/scan.ts`), five in sitting 2 (§16's AI-path tier), two in sitting 3 (the error table re-provoked against the live proxy), two in sitting 4 (the live catalogue, and a key rotated against the live gateway), and two in sitting 5 (an app network torn down with the gateway attached, and a container replaced when its environment changed); sitting 6 added none, sitting 7 three (a real build streamed, a real build stopped by its timeout, and the Docker run of the contract's streaming test), and sitting 8 two (Mongo's readiness race forced with a slow init script, and a failed deploy's Incident from a real crashing container); sitting 9 none — its Docker-tier proofs are assertions added to existing suites; and sitting 10 none — its proofs are `make demo-ai` against the running platform and one unit test, the refusal of `embed()` for nobody, which was the 736th (P4c sitting 2 took the unit tier to 748, sitting 3 to 775, sitting 4 to 788, sitting 5 to 811, sitting 6 to 824, sitting 7 to 831 and sitting 8 to 832, with the key-order test control (c) showed was missing; sitting 3 added eleven Docker-tier tests, five of them `redeploy.docker.test.ts`'s takeover under load, sitting 4 added fifteen — the eleven that had been skipped, plus four retire tests — sitting 5 one, a key per instance against the live gateway, sitting 6 six — three for a redeploy through `deployRelease` and three for what the real boot recovers — and sitting 7 one, a real CWL login whose session lands in the app's own Mongo). `secrets/` now holds every service credential — libsodium envelope
encryption in Postgres, replacing P3's HMAC derivation, migrated without breaking a
running database — and §20's `audit.events` is append-only **by grant**, which needed
the control plane to stop connecting as a superuser before it could mean anything:
`REVOKE UPDATE, DELETE` followed by `UPDATE 1` was the measured starting point. It now
connects as **`manifest_app`**, and so does the whole test suite. Those fifteen tasks
found **80 defects — 5.3 per task**, two of them spec-level: **§12's
dependency-scan gate blocked every CWL application** (settled by Rich on 2026-09-08 —
it now blocks only on findings that have a published fix), and **§8's
`SAML_IDP_CERT_PATH` named a file nothing could create**, so `InstanceSpec` gained
`files`. **Three of the first eighteen were a swallowed `.catch(() => undefined)`**, which
is this codebase's most productive defect — including one that let a stale container
serve four runs of a suite and made a negative control pass against an app it had
already edited. P4 was split into P4a (identity, secrets, the §8 injection
contract) and P4b (AI, events, streaming, incidents) on Rich's call. **P4b is now
written too (2026-09-07, 16 tasks) and must not be executed first**: it was written
ahead of P4a's execution at Rich's request, and its Task 1 is a reconciliation pass
against the *executed* P4a. Writing P4a found **four live defects that `make verify`
34/0 could not see**: the Manifest IdP could not issue an assertion at all, attribute
release failed open, the `ubcEduCwlPuid` OID matched nothing `passport-ubcshib` maps,
and `MONGODB_DB_NAME` was never injected. Writing P4b found six more, including a
**moving, unpinned LiteLLM image** while §16 pins the error mapping to a version, and
a §10 requirement — the per-user AI budget — that **LiteLLM 1.98.0 provides no way to
enforce**. **P3's six spec actions were all applied on 2026-09-07**, with Rich's
approval; **eight more were applied on 2026-09-14** — §12's scan-gate wording, four of P4a's, P4b's LiteLLM digest row, and two §7 rows Rich settled once Tasks 6 and 7 had run (an unclassified model refuses only itself; an omitted AI budget defaults to the project's quota), which change committed code that P4b's Task 9 now carries; and **the last three on 2026-09-15**, Rich's calls once Task 14 had run — §10's per-user AI budget is validated but not enforced in Phase 1, §10's agent-key row binds from Phase 3, and §14 describes the event stream as built, with no tailing of an app's own output in v1.

Executing P2 found **52 defects** across three sittings — 5, then 20, then **27 in
Tasks 12–21**. Four from that last batch are worth carrying: the plan's code had
**never been typechecked** against this repo's own tsconfig, and six
`exactOptionalPropertyTypes` errors were invisible to every test because Vitest
strips types without checking them; **five test-isolation defects** made the suite
pass or fail on the order Vitest happened to pick, and `withRollback` turned out not
to protect a suite from rows another test *committed*; **two safety mechanisms were
one edit from being live** — `/auth/dev-login` hardcoded `devAuthEnabled: true`, and
`GET /builds/:id` could be made to trust a client-supplied `projectId`, both
answering `200` when broken; and **nothing had ever executed the boot entry point**,
which is the same defect P3's self-review found in P3.

**Toolchain:** Node 24 via nvm, pnpm 11 via corepack. **Four gates, all clean before
a commit** — and `pnpm test:docker` too, once you are touching `runtime/docker/`,
`services/` or `build/`: `pnpm test` (from the repo root), `pnpm lint`,
`pnpm --filter @manifest/control-plane typecheck` and `pnpm format:check`. The last
two are not optional extras — Vitest strips types without checking them, so `tsc` is
the only thing that sees a whole class of error, and `format:check` was silently red
on 29 files until 2026-09-05. Run `pnpm test` **twice**: a suite that is not
repeatable has a state leak. For the platform itself it is `make doctor` and
`make verify`.

**Five spikes are done** (S7, S2, S1, S3 — all answered yes — and **S6**, which ran
as P3's Task 18 on 2026-09-07 and found every probe denied with every denial paired
with a positive control). P0, P1, P2 and P3 are written and **all three
implementation plans are executed**. **P4a, P4b and P4c are executed in full; P4c (zero-downtime redeploys, placed straight
after P4b) finished 2026-09-16 — eight sittings, 70 findings. P5 is three plans — P5a, P5b and P5c — and **P5a is written (2026-09-16, 17 tasks in twelve sittings) and its sittings 1 and 2 are done, 9 and 16 findings; executing sitting 3 is next (ORIENTATION §7e).**** Plan-writing stopped on 2026-09-04 in favour
of execution; that hold is now discharged, and it was right — the three plans
produced **152 defects between them** after all three had been self-reviewed, and
P4a's fifteen tasks have since produced **80 more**, P4b's sixteen **140**, and P4c's eleven **70**. The maintained status record is the *Spike status*
ledger in `docs/superpowers/plans/2026-08-29-plan-roadmap.md`; if any document
disagrees with it, the ledger wins.

## Non-negotiables

- **Ask before `sudo`.** It cannot prompt from a tool call — you get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal.
- **Leave the machine exactly as you found it.** Snapshot before changing anything.
  Every spike so far has met this bar, and so has every plan-writing session.
- **Never touch Laravel Valet.** It owns the `.test` TLD, port 53 and ports 80/443 on
  this machine and on other UBC developers' machines. This is why the platform zone
  is `*.manifest.internal` and why the edge binds the `127.0.0.2` loopback alias.
- **Never edit the spec directly.** `docs/superpowers/specs/2026-08-29-manifest-platform-design.md`
  is marked *Approved design*. Record proposed changes and ask; that has been the
  pattern four times.
- **These containers must survive**: `docker-simple-saml-saml-idp-1`,
  `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **`docker-simple-saml` and `ubc-genai-toolkit` are read-only.** Both are clean and
  must stay that way. Work on a copy.

## How Rich wants this done

- **Decide, then document the decision.** Settle routine questions yourself and record
  the reasoning — the option chosen, the options rejected, what it would cost to
  change course. P1's *Decisions this plan makes* section is the pattern. Save
  questions for what is genuinely his: spec changes, host changes, anything
  irreversible.
- **Capture negative controls.** "It works" is much weaker than "it works, and here it
  is correctly failing when I remove the thing that makes it work." A green result is
  not evidence a control is in force — that lesson has been paid for twice.
- **Assert the shape of the answer, not that an answer arrived.** S3 ran six checks
  and all six passed while one returned 192 numbers where 768 belonged.
- **Record exact versions** — image digests, package versions, macOS and Docker
  Desktop versions. A finding without a version is not reproducible.
- **Write for a reader who was not there.** Every document here gets read cold. That
  is the normal case.

## Conventions

- Specs in `docs/superpowers/specs/`, plans in `plans/`, spike findings in `spikes/`.
- Spikes run on `spike/<id>` branches that are **never merged**; only the artefacts
  the brief names are copied out.
- Plans follow `superpowers:writing-plans`. `plans/2026-08-30-p1-local-substrate.md`
  is the current house style.
- Ports: the platform uses **7100–7199**. macOS ships **bash 3.2 and a BSD
  userland** — no `xargs -r`, no `mapfile`, no GNU-only flags.
- **Close out properly, AT THE END OF EVERY SITTING** — not at the end of the plan.
  Update the roadmap ledger, sweep every document that states status, and leave the
  machine as you found it. **The sweep is the step that gets forgotten.** The next
  sitting is a different agent with an empty window who will believe whatever these
  documents say, so a sitting that ends unswept sends them at a task that is already
  committed. **The plan's own sittings table is the first thing to change and the
  easiest to miss.** ORIENTATION §6 carries the full checklist — including the fact
  that the four gate numbers are stated in four separate documents and must move
  together. Budget session capacity for the sweep; if it is tight, stop a task early
  and sweep rather than finishing the task and leaving the documents lying.
