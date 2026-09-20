# P6a — The First Production Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An application reaches **production** for the first time in this platform's life — on its own address, through a second edge listener that staging cannot reach, running the exact digest staging ran, with **every one of D19's five blocking items honestly met rather than waived**: an IAM registration an administrator recorded, a privacy assessment they recorded, a pre-production rehearsal that *ran* and passed with evidence, clean scans, and an administrator's approval bound to that digest and made behind a second authentication round trip.

**Architecture:** P6a **wires more than it builds** (brief §2). Three of the pieces §13 asks for are already in the tree with no caller — `release:approve`, `isSensitiveDiff`/`describeDiff` (P6b's), and the internal/public listener split, which is modelled and not enforced. The work is in five layers. **Infrastructure:** a second loopback address (`127.0.0.3`), a second dnsmasq answer for the production zone with the three internal names pinned back, and a second Caddy server inside the one edge container — so §12's *"a route bound to the wrong listener is simply unreachable"* becomes a thing that can be watched failing on this machine. **Records:** migration 0019 adds `approvals`, `iam_registrations` and `privacy_assessments` — §6's own rows, with §9's submission state, driven manually now and programmatically in P8 (R1). **The gate:** one function in `launch/` that both the read and the deploy route call, so the view and the gate can never disagree — replacing the **two** unconditional production refusals that exist today. **The second round trip:** a `ForceAuthn` SAML request against the Manifest IdP, a `steppedUpAt` claim reissued onto the stateless session cookie, and an `assertStepUp` that guards §20's privileged set **and `release:approve`**, which is not in it. **The seam:** R4's `Reviewer` interface with an honest `NullReviewer` whose verdict is `not_performed`, a real caller on the build path, and a **non-blocking** checklist item.

**Tech Stack:** TypeScript on Node 24.12.0, Fastify 5.12.3, Drizzle over Postgres 16, `@node-saml/node-saml` **5.1.0** (whose `forceAuthn` is a **constructor** option, not a per-request one — see *Read this first* 9), the custom `xcaddy` Caddy **2.11.4** edge, dnsmasq as two containers, `zod/v4` for representations, Vitest 2.1, React 19.3.0 + Vite 8.3.0 in `packages/console`, `@manifest/contract` generated from `packages/contract/openapi.json`. **This plan installs no package.** If a task believes it needs one, that is a finding to record and raise, not a step to take.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§13 in full** (promotion never rebuilds, D19's checklist, D9's gate, *Integrity of the gate*, *Residual risk*); **§9** (production registration, the PIA, D21's rehearsal, *Toward automated submission* — which is R1's whole argument); **§12** *Edge* and *DNS*; **§7** *Sensitive fields* and *Validation* (its last production clause is Task 13); **§20** *Manifest's own front door* (step-up), *Credential classes*, *Control map*; **§15**'s reviewer row; **§21**'s inventory and its *honest divergences* item 2; **§17**'s Phase 2 row; **§6**'s `Approval`, `IamRegistration`, `PrivacyAssessment` and `LaunchReadiness` rows. **Decisions D9, D14, D19, D20, D21, D24 and D33.**

**Brief:** [`2026-09-19-p6-brief.md`](./2026-09-19-p6-brief.md) (2026-09-19, written at `d95d848`). **Its §5 carries Rich's four decisions and they are not re-opened here.** Its §2 and §3 are the measured statement of what exists; its §8 lists the traps, and every one of them applies. **Its §7's spec action (R4 → D33, §15, §20) is APPROVED AND APPLIED — the spec already reads that way and nothing in this plan re-proposes it.** The *other* brief in that folder, [`2026-09-19-authoring-api-brief.md`](./2026-09-19-authoring-api-brief.md), is **not this plan's** — it is unplaced, and what it changes is what **P6b** means.

**Predecessors:** [`2026-09-16-p5a-the-contract.md`](./2026-09-16-p5a-the-contract.md) (executed 2026-09-17, 146 findings), [`2026-09-17-p5b-delegated-tokens.md`](./2026-09-17-p5b-delegated-tokens.md) (executed 2026-09-18, 116), [`2026-09-18-p5c-the-clients.md`](./2026-09-18-p5c-the-clients.md) (executed 2026-09-19, 107). **Read P5a's sitting 12 and P5b's sitting 9 before writing a single negative control** — the two previous acceptances, which between them found four controls that could not fail and one prediction of invisibility that was wrong in the direction that mattered. **And read P5c's sitting 9, F11 and F16**, which is this plan's central risk in one sentence: *a fix that passed every test and was still broken, because every test fired garbage at the route and a route that refuses everything passes them all.*

**Roadmap:** the **P6a** row in [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md), and its *Order of operations*. **P6b is written after this plan executes** — the pattern P5a, P5b and P5c used — and this plan's *What this plan does not build* is its input.

---

## How this plan is to be executed — ELEVEN SITTINGS, one per session

**The pattern that carried P4a's last twelve tasks, all of P4b, P4c, P5a, P5b and P5c: one sitting per session, with a check-in at each boundary**, so a session limit can never land mid-task. **Executing two sittings in one session is not a shortcut** — it is how a limit lands inside a task. This plan commits after every task; a stop *between* tasks is recoverable, a stop *inside* one is not. **"Sitting", not "phase"** — this project uses *Phase 1c* and *Phase 2* for §17's product roadmap.

**Rich agreed eleven sittings on 2026-09-19, choosing the LEAN of three splits offered** (thirteen was recommended, sixteen was the cautious one). **He was told what the lean split costs and took it, and the three costs are repeated here because they are the sittings to watch:**

- **Sitting 6 builds a second authentication round trip AND applies it to five routes, in one sitting.** P4a found **four settings that read like controls and are not**, every one of them in SAML. If Task 1's `[M3]` finds the IdP does not honour `ForceAuthn`, this sitting absorbs the repair as well. **If it runs long, stop after Task 8 and sweep** — §6 rule 8 is worth more than finishing a task.
- **Sitting 10 is three tasks and includes BOTH console screens.** P5c measured that the console is where the defects a gate cannot see live: F11 — signing out of a deployed app landing on raw JSON — was found by a person clicking, with 1376 tests, `make doctor` 18/0, `make verify` 51/0 and three `ci-acceptance` runs all green through it.
- **Sitting 9 pairs the rehearsal with the first production deploy, and the rehearsal DEPENDS on that deploy working.** Task 14 cannot be measured until Task 15 runs, so a failure in 15 blocks 14 in the same session rather than in the next one.

*The **Status** column records what a sitting made true, never how many findings it produced — that number lives once, in the roadmap's defect-rate table (Rich, 2026-09-20).*

| Sitting | Tasks | What it delivers | Status |
|---|---|---|---|
| 1 | 1 | **The measurements this plan rests on**, before any code: whether SimpleSAMLphp honours `ForceAuthn`, what the second listener actually costs on this machine (the alias, the dnsmasq split, the probe path), whether `computeLaunchReadiness` survives being read by something that blocks, and the **two** production gates rather than one. **Alone, and first** | **DONE 2026-09-19.** All ten measurements ran. **R3 is a GO**, `ForceAuthn` **is honoured**, Decision 13 is measured. **No task boundary moved, so the eleven-sitting split stands.** Correction blocks on Tasks 1, 2, 3, 4, 5, 7 and 12 |
| 2 | 2–3 | **The second listener exists**: `127.0.0.3` on `lo0` and the dnsmasq split (Rich runs one bundled `sudo` script), then `srv1` inside the edge with the production wildcard site, and `make doctor` and `make verify` checks for both halves | **DONE 2026-09-19.** §12's split is REAL: two servers in one container, and a production name on the internal address and a staging name on the public one are both served by NOTHING, watched both ways. **§21's divergence 2 no longer describes this machine, so Spec action 1 is unconditional in practice — still Rich's, still not applied.** doctor **19/0**, verify **54/0**. **Its headline corrects sitting 1's F3: an unreachable name answers `200` WITH AN EMPTY BODY, not a TLS error, because Caddy's certificate cache is app-global — so a status assertion is green whether the split holds or leaks.** Two of the plan's own controls could not fail as written |
| 3 | 4 | **A production route goes on the public listener and staging cannot reach it** — §12's fail-closed claim watched failing on the only machine that exists, in both directions, and the readiness probe taught the production path | **DONE 2026-09-20.** A production route is written to `srv1` and a staging route to `srv0`, read back off `X-Manifest-Instance` from a REAL route on each listener; `edgeIdentityProbe` and `edgeProbe` take a `port` and the driver passes it for production alone. `pnpm test` **1390 → 1395**, `pnpm test:docker` **180 → 185** (the predicted 180 + 5), doctor **19/0** and verify **54/0** both unmoved — the new port-equality assertion lives INSIDE check 2. **No task boundary moved.** **Its headline is about CONTROLS, not the platform: control (c) went RED rather than staying green, because the case asserts the body as well as the identity, and control (b) CANNOT FAIL AT ALL — the driver's production branch is asserted by nothing until Task 15.** `[M5]` named one hardcoded `public: 'srv0'` and there are nine; two were the Docker tier's own driver factory |
| 4 | 5–6 | **Migration 0019** — `approvals`, `iam_registrations`, `privacy_assessments` and their state machines — and **the two external records over the API**: an administrator records a real registration and a real PIA with a pasted ticket reference | **DONE 2026-09-20.** §13's gate now has REAL ROWS to block on, which is the whole of R1. `[M10]` is confirmed exactly: drizzle wrote the `audit.events` DROP/ADD pair unprompted and **nothing was appended**. THREE routes, not the four this task says. `launch:record` is granted to `PLATFORM_ADMIN` alone and is NOT one of D24's four — `requireSession` is the control, enforced by the matrix **and by `tsc`**. **No task boundary moved.** `pnpm test` **1395 → 1449 in 110 files**. **Its headline is that the plan's own matrix row for `token-other-project` says `404 NOT_FOUND` and the route answers `403 TOKEN_CREDENTIAL_REFUSED`** — `requireSession` runs before the project is read, which is the right order, and control (a) proves the row was written for the other one. **ALL NINE controls fired; none could not fail** |
| 5 | 7 | **The gate that BLOCKS.** One evaluation in `launch/`, called by the read and by the deploy route, with the **two** unconditional refusals that exist today removed — and the checklist's items reading real rows. **Alone: it is this plan's centre** | **DONE 2026-09-20.** §13's checklist is now the thing that gates production: `assertLaunchable` in `launch/gate.ts`, ONE evaluation, two callers, and **both** unconditional refusals gone — the inner one DELETED. Measured live end to end: with nothing recorded the deploy is refused blocking on **four** items; an administrator records a real IAM registration and a real PIA over the API and the same deploy is refused blocking on **two**, `rehearsal` and `admin-approval`. `pnpm test` **1449 → 1456 passed + 1 SKIPPED in 110 files**; `pnpm test:docker` **OWED, RUN and UNMOVED at 185 in 30, 826 s**; doctor 19/0 and verify 54/0 unmoved. **No task boundary moved.** **Its headline is that the plan's Steps 2 and 4 CONTRADICT EACH OTHER** — the class cannot both move to `launch/` and keep the `api` family — **and that moving it would have made its code invisible to the registry**, sitting 4's F5 one sitting later. **Control (b) fired SIX red across FOUR files where the plan predicted the matrix alone and said the delivery test would stay green; control (a) could not fail against all 1456 tests, predicted in advance; control (d) is the second gate SEEN** — `409` with the same code and **no `launchReadiness`** |
| 6 | 8–9 | **Step-up re-authentication**: the `ForceAuthn` round trip, `steppedUpAt` on the stateless cookie, and `assertStepUp` applied to D24's privileged four **and** to `release:approve`, which is not one of them. **The heavy sitting Rich was warned about** | **DONE 2026-09-20.** §20's second round trip exists and is **proved end to end against the REAL Manifest IdP through the edge**: an ordinary session is refused `403 STEP_UP_REQUIRED`, `/auth/step-up` makes the IdP re-prompt **on a warm cookie jar** (`[M3]`'s control, re-fired live), the claim lands on the same session with `expiresAt` unchanged, the same request then answers `201`, and a step-up assertion for a DIFFERENT person is refused with the session left byte-identical. `pnpm test` **1456 → 1496 passed + 1 skipped in 112 files**; `pnpm test:docker` **OWED, RUN and UNMOVED at 185 in 30, 829 s** — and unmoved is the measurement, because **no Docker test makes a member call over HTTP or drives `/auth/step-up`, so that tier cannot see Task 9 at all**. doctor 19/0 and verify 54/0 unmoved. **No task boundary moved.** **Its headline is that the plan's own `assertStepUp` KILLS D24'S CONFIRM-AND-RETRY LOOP** — it refuses every token on a premise that is false, and a token carrying a human-confirmed grant reaches it; the grant is what stands in step-up's place. **Nine of ten controls fired, four of them WIDER than predicted and one — Task 8's (e), the row the plan calls its most important — where the plan says in bold that nothing would.** Control (d) **could not fail** and was fixed rather than recorded. **The guard reddened 48 tests across 7 files, not the 4 predicted, and 29 were the matrix's own fixture failing silently.** **F12 was raised open and CLOSED the same day by Rich's decision**: confirming a pending action now requires step-up and rejecting does not, and `release:promote`'s missing call site is tracked to Task 15 with a correction block there |
| 7 | 10–11 | **The approval**: `release:approve`'s first caller ever, bound to an immutable digest, non-repudiable, behind step-up — and its `diff_snapshot` with the AI-written summary that is **recorded as absent rather than blocking** when the model is down | **DONE 2026-09-20.** `release:approve` has a caller: three routes, four guards in order, the BUILD's digest bound, insert-only, and §13's `admin-approval` item reading the row instead of saying `not_built`. Decision 7 is DRIVEN — a server whose LiteLLM client rejects every call answers the approval **`201` with `summary: null`, `summarySource: 'unavailable'` and the diff still in the record**, and the control for it answers `503 AI_BACKEND_UNAVAILABLE`. `pnpm test` **1496 → 1544 passed + 1 SKIPPED in 114 files**; `pnpm test:docker` **OWED and RUN**; doctor 19/0 and verify 54/0 unmoved. **No task boundary moved.** **Its headline is the CONTROLS: nine run, six fired, THREE could not fail — and two of those three paid for themselves.** Task 10's (e) could not fail, and writing the case it was aimed at found a **live defect**: a rejection reason made of spaces was answered `500 INTERNAL` by a database CHECK rather than `400` by the schema (F3, fixed). Task 11's (c) could not fail against the test the plan names for it (F6). **The plan passes `deps.ai` to `summariseChanges` and `deps.ai` has no `post`** — it is §10's key lifecycle, so `ServerDeps` gains `llm` (F1). **Decision 11's rebuild branch is unreachable through the platform** and the test says so (F5). **Control (b) does NOT make `[M6]`'s finding live**: `tsc` refuses it, and forced past, `assertStepUp` still refuses the token (F8) |
| 8 | 12–13 | **R4's `Reviewer` seam** — the interface, the honest `NullReviewer`, its real caller and its **non-blocking** checklist item — and **§7's last production clause**: `auth.attributes` ⊆ `registered_attributes`, failing at build time | ← **next** |
| 9 | 14–15 | **The D21 rehearsal as R2 redefines it**, and **the first production deploy this platform has ever done** — the digest verified before anything starts. **A first, and this project's worst discoveries have all arrived at a first** | |
| 10 | 16–18 | **Gate integrity asserted** (the registry's refusal, the laptop-image rule, the append-only record) and **both console tasks**: readiness with actions, the two external records, approvals and the step-up prompt | |
| 11 | 19 | **The acceptance**: `make demo-production` — an app reaches production with every blocking item honestly met — its offline-acceptance step, its `ci-acceptance` step, and its negative controls. **Alone, and last** | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. the four gates from *Global Constraints*, plus **`pnpm test:docker`** for every sitting that touched `routing/`, `runtime/`, `releases/`, `identity/`, `sso/`, `infra/`, `projects/`, `launch/`, `build/`, `observability/` or a `*.docker.test.ts` — **which in this plan is almost every sitting** (the brief says so in terms). **Budget the 13 minutes rather than being surprised by it**, and **restart the control plane afterwards**;
2. a dated entry in *What executing this plan found* — the tasks, every defect with the measurement that found it, the negative controls with which ones could not fail, the gate numbers and the machine;
3. **the sittings table above, updated** — mark the sitting done and move the `← next` marker. **It states NO findings count**, and neither does the sitting's heading in *What executing this plan found*: **the count lives once, in the roadmap's defect-rate table**, and is derived by `grep -c '^\*\*F[0-9]'` over the sitting's own section (Rich, 2026-09-20). Put the number in that table's row, at the CLOSE — after the post-sweep check and the final gate run, both of which produce findings;
4. **the close-out sweep in ORIENTATION §6**, whose first line is the roadmap ledger. The gate numbers are stated in three documents — ORIENTATION §2's box, `README.md` and `RUNBOOK.md` — and move together. **§6's post-sweep check has found a defect in every sitting since P5b's third, without exception; run it by opening what you pointed at and counting it, never by re-reading the sentence.**

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Task 1 may move task boundaries — that is its job, and it has done so in three of the last four plans — and if it does, **re-cut the sittings before starting sitting 2 and say so in the session record**. Three rules survive any re-cut, and they are the brief's §10: **Task 1 stays first and alone**; **Task 19 stays alone and last, and it is this plan's own task rather than something that happens after the last feature**; and **the listener work stays early enough that a `compose.yaml` change dropping every runtime route is cheap, and late enough that Task 1's measurement has landed**.

---

## Read this first — what this plan knows that the brief does not

**SITTING 1 CORRECTED THREE OF THE ITEMS BELOW — read this before you trust one of them.**
**Item 16 is WRONG** (`observability/events.test.ts:283` *does* assert the CHECK against
`EVENT_TYPES`, out of Postgres, in the unit tier — and `schema.ts` *does* express the constraint,
so drizzle generates the rewrite itself: Task 5's block). **Item 9 is right in substance and
wrong in trigger** (compose recreates on a service *config* change, not on any edit: Task 2's
block). **Item 4 states only half the `iam-registration` rule** (it also needs a candidate
release: Task 7's block). Items 1, 2, 3, 5, 6, 7, 8, 12 and 18 were each re-measured and
**hold exactly**, line numbers included. Read from the code on **2026-09-19**, at `d02fb67`, while this plan was written. **Every item is a fact about the platform as it stands, not a prediction**, and Task 1 re-measures the ones marked *(T1: M<n>)*. The brief's §2 is still true and is not repeated; these are the things reading the code for a *plan* turned up that reading it for a *brief* did not.

1. **THERE ARE TWO PRODUCTION GATES, NOT ONE, AND THE BRIEF NAMES ONLY THE OUTER ONE.** The route's is `api/routes/releases.ts:233`, and it throws `ProductionGateError` carrying the checklist. **`deployRelease` throws its own**, at `releases/release.ts:213`, before it reads the build: a `ReleaseError('RELEASE_PRODUCTION_GATE_UNAVAILABLE', …)` whose message ends *"they are P6's, and this gate stays closed until they do."* `error-codes.ts` records the code with **two families** — `['api', 'ReleaseError']` — which is the only place the duplication is visible. **A plan that replaced only the route's gate would ship a production deploy that still refuses, with the new gate's tests all green**, because every test of the new gate would be a test of a route that never reaches `deployRelease`. Task 7 removes both, and its negative control is the one that proves it. *(T1: M6.)*
2. **`release:approve` IS NOT ONE OF D24'S PRIVILEGED FOUR, AND A PLATFORM ADMIN CAN MINT A DELEGATED TOKEN THAT HOLDS IT.** `PRIVILEGED` is `{release:promote, secret:read, quota:set, members:manage}` (`projects/authz.ts:60`), held to §20 by `privileged.test.ts` with the four written out as literals. `release:approve` is in `CAPABILITIES`, is granted to `PLATFORM_ADMIN` at `authz.ts:141`, and **is not privileged** — so `assertCapability`'s token branch falls straight through to *"does this token hold it?"*. The mint route (`api/routes/tokens.ts`) refuses only `PRIVILEGED` and caps at what the minter holds, and **a platform admin holds `release:approve`**. So the day Task 10 gives that capability its first route, an agent holding such a token could approve a production release with no person in the loop — which is D14 exactly inverted. **The control is `requireSession` on the route plus step-up, both of which a token cannot satisfy**, and Task 9 writes the test. **It is also a real asymmetry between the spec's words and the code's**, and the plan raises it as *Spec action 2* rather than papering over it. *(T1: M7.)*
3. **`node-saml` 5.1.0's `forceAuthn` is a CONSTRUCTOR option, not a per-request one.** `lib/types.d.ts:128` puts it on `SamlOptions`; `saml.js:71` reads it once in `initialize()` and `saml.js:160` applies it while generating the request. The only per-request options are `AuthOptions` — `{ samlFallback, additionalParams }` — and `ForceAuthn` is an **XML attribute on `<AuthnRequest>`**, so `additionalParams` cannot set it. **Step-up therefore needs a SECOND `SAML` instance**, identical to the first but for that flag. Two consequences Task 8 must handle and neither is obvious: `validateInResponseTo: always` uses an **in-memory cache per instance**, so a step-up assertion can only be validated by the instance that issued its request; and both instances share one entityID and one ACS URL, so **the IdP's registration does not change** — which is what makes this affordable at all.
4. **`computeLaunchReadiness` derives `ready` from `items.filter(i => i.blocking).every(i => i.state === 'met')`** (`launch/readiness.ts`). So **a seventh blocking item in state `not_built` makes production unreachable for ever** — which is precisely R4(c)'s trap, and the reason the reviewer's item is `blocking: false`. Two of the six are already `met` without P6a doing anything: `domain` unconditionally, and `iam-registration` **when `auth.provider === 'none'`**. `scans` is computed from the candidate release's `scan` and is `unmet` with a reason when nothing serves staging. *(T1: M4 reads all six for a real project.)*
5. **The candidate release is the one SERVING STAGING**, not the newest. `computeLaunchReadiness` finds the staging environment, asks `servingInstanceOf`, and joins that instance's release. **`candidateReleaseId` is `null` when nothing serves staging**, and the whole checklist then reports `scans: unmet` with *"Nothing is serving in staging yet"*. This is §13's *promotion never rebuilds* expressed as a query, and every task that binds a digest binds **that** release's build's digest.
6. **Production hostnames already exist and already resolve.** `createProject` writes all three environments at creation (`projects/repository.ts:102`), `hostnameFor(config, 'production', slug)` is `<slug>.manifest.internal`, and dnsmasq's single `--address=/manifest.internal/…` answers it today — **on the internal address**, which is the whole of Task 2's problem. `make verify` already probes all three zones for a trusted certificate and passes.
7. **`listenerFor('production')` is `'public'` and the `Route` row already stores it** (`routing/hostnames.ts:18`, `db/schema.ts:208` `route_listener`). `applyRoute` resolves `deps.servers[listenerFor(spec.kind)]` and `config.ts:160-161` defaults **both** to `srv0`. So the split is one configuration value away in the code and a long way away on the machine — and `upstreamsInUse` already dedupes the server names *"because both listeners are `srv0` on the laptop"*, a line that stops being true in Task 3 and must keep working when it does.
8. **The readiness probe cannot reach a second listener without being told to.** `edgeIdentityProbe(engine, hostname, healthPath, caCertPath, opts)` builds `https://${hostname}${healthPath}` — **no port** — and runs it from a throwaway `curlimages/curl` on `manifest-platform` with `Dns: ['10.89.0.53']`, which answers `10.89.0.10` for the whole zone (`infra/compose.yaml:39`). A production app's probe therefore arrives at `manifest-caddy:443`, the **internal** server, and finds no route. **It fails LOUDLY**: `waitForIdentity` refuses a 200 carrying no `X-Manifest-Instance` and says *"that is the edge's wildcard, not a routed app"*. That is why this is safe to attempt. *(T1: M5.)*
9. **A `compose.yaml` change recreates `manifest-caddy` and drops every runtime route**, so every app hostname then answers the wildcard until the control plane reboots (§2's box; P5c Decision 4 priced it). Tasks 2 and 3 both change it. **Sequence the sitting so the control plane is restarted at the end**, and expect `make verify`'s *runtime routes currently applied* INFO line to read `0` until it is.
10. **`infra/caddy/Caddyfile` is a SINGLE-FILE bind mount.** A save that writes a new file and renames it over the old one — which the agent's edit tool does, and so does `git checkout` — leaves `manifest-caddy` on the deleted inode. `infra/lib/ensure-caddy-config.sh` compares hashes and restarts the edge to re-bind, so **after any Caddyfile edit run `make up` and read its output**, and after any `git checkout` of it, `docker restart manifest-caddy`.
11. **The whole privileged host surface is three steps in one script**, `infra/host/host-setup.sh`, reversed by `infra/host/host-undo.sh`, both invoked as `sudo bash …` by `make host-setup` / `make host-undo`. `EDGE_IP="127.0.0.2"` lives once, in `infra/lib/common.sh`, and `infra/lib/ensure-alias.sh` re-adds it on every `make up` because the alias does not survive a reboot. **Task 2 adds a second constant beside it and a second `ifconfig` line to all three files** — and `host-undo.sh` **asserts** its reversal rather than inheriting an exit status, which is the pattern the new line must follow.
12. **`make doctor` is 18 checks and `make verify` is 51**, and both already assert the alias, the resolver, the zone's answer and the Caddyfile's own words. P5c sitting 3 measured that *"no test sees the Caddyfile"* was **wrong twice over** — `doctor.sh` read `CLAIMED BY SOMETHING ELSE: 7104` and `verify.sh` asserted the placeholder's literal text. **Assume both see your infrastructure change and predict which check moves**, rather than discovering it.
13. **`SESSION_COOKIE` is a stateless signed cookie** (`identity/session.ts`): `{userId, puid, role, issuedAt, expiresAt}`, base64url payload plus an HMAC, verified in constant time, refused when expired or when `role` is not one of two literals. **Adding a field is backward compatible** — an old cookie simply lacks it — and `verifySession` must be extended to *validate* the new field rather than trust it. §20 records the divergence with its cost: **a session cannot be revoked before its own expiry**, and `steppedUpAt` inherits that exactly.
14. **The sign-in flow is already bound to the browser that started it.** `/auth/login` mints a nonce, puts it in the `manifest_login` cookie (`path=/auth`, `SameSite=None` on https) and sends it as `RelayState`; the callback refuses an assertion whose `RelayState` is not the cookie's, **before** node-saml is asked to look at it. **Step-up copies this shape exactly** and adds one thing it must also check: the assertion's `ubcEduCwlPuid` must equal the puid of the session already in hand, or a person could step up into somebody else's session.
15. **`/auth/saml/callback` is the ONE route exempt from §20's origin check**, and `/auth/logout` (both methods) is exempt from idempotency. Whatever Task 8 adds under `/auth/` must be listed in `api/unversioned.ts` **with its reason** — `versioning.test.ts` is the review that forces it.
16. **A new event type is a migration as well as a constant.** `EVENT_TYPES` in `observability/events.ts` holds **21**, and `audit.events` carries a `CHECK … type IN (…)` constraint rewritten by migrations 0012, 0015, 0016 and 0017. **Adding a type without rewriting the CHECK makes the insert fail at runtime with every unit test green**, because the unit tier's schema is created from the same migrations but nothing asserts the two lists agree.
17. **A route change is three files in order**: the definition, then `pnpm contract:write`, then `pnpm contract:generate`. **`packages/contract/openapi.json` is generated — never edit it.** `ROUTE_DEFINITIONS` in `api/routes/index.ts` is the whole `/v1` surface; **a route defined and not listed there exists nowhere**.
18. **D22's coverage gate is fully disarmed by its own list.** P5c sitting 9 measured that with all 34 operations in `DELIBERATELY_UNCALLED` the test is **green**, and the `checked > 30` assertion cannot see it because `checked++` runs before the exemption test. **`DELIBERATELY_UNCALLED` is EMPTY today.** **P6a adds SEVEN operations** — `getLaunchRecords`, `recordIamRegistration`, `recordPrivacyAssessment`, `runRehearsal`, `approveRelease`, `rejectRelease`, `getApproval`; `GET /auth/step-up` is unversioned and is therefore not one (D23.8) — so **a reviewer has to read that list, because the gate will not.** Tasks 17 and 18 either give each new operation a console caller or put it in the list **with a reason a reader can check**, and Task 18's step 5 is that reckoning, in full, in the record.
19. **§16's authorization matrix is a (status, code) pair per actor per route**, nine actors — five session, four token (`api/authz-contract.ts`). **Its production-deploy row expects `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE` today**, which is the gate refusing unconditionally; Task 7 changes what that row means and Task 9 adds `STEP_UP_REQUIRED` to `Expectation`'s vocabulary. **Completeness for the actor dimension is `tsc`** (`error TS2739`), so a new route with a missing actor is a type error, not a silent hole.
20. **`make demo-journey` and `make demo-token` are the two headless drivers of the contract**, both following P5a Decision 38's split: signing in is `infra/lib/idp-login.sh` (outside the contract by D23.8) and everything the API does is TypeScript in `packages/journey` importing nothing but `@manifest/contract`. **`scripts/offline-acceptance.sh` has TEN steps** and `scripts/ci-acceptance.sh` runs the headless half with its four `EXPECT_` counts. Task 19 adds one step to each and writes no new mechanism.
21. **`POST /v1/projects/{id}/members` answers `400 MEMBER_USER_NOT_FOUND` for anybody who has never signed in to MANIFEST**, and **`pnpm test` empties `users` on every run**. Signing in to a *deployed app* is a different SP with a different user store and does **not** satisfy it (P5c sitting 9, F14). Anything in this plan that needs a second person — the approval, which a **platform administrator** makes — needs that person signed into Manifest itself first, and `scripts/admin-grant.sh` is how they become an administrator.
22. **The LiteLLM admin client is `fetch` with a master key and a 10 s timeout** (`ai/client.ts`), and it turns a failure into an `AiError` rather than a raw body — which matters because the raw body carries a key hash. Task 11's summary goes through it, and **a 10 s timeout is the thing that makes "recorded as absent" reachable rather than theoretical**.

---

## Decisions Rich made, 2026-09-19

**Do not re-open any of these.** The brief's §5 carries the reasoning and what each rejected; this is the operative summary.

**R1. P6a folds in `IamRegistration` and `PrivacyAssessment` as tracked objects with manual state transitions; P8 keeps the *generation*.** So the gate blocks on **real rows an administrator can satisfy out of band with a pasted ticket reference**, and **this plan's demo is an app that genuinely reaches production** rather than one correctly refused. §9 already describes *"submitted by a human, with a ticket reference pasted in"* as the first implementation, and says the objects are modelled with submission state *"precisely so that"* the manual and programmatic cases are one state transition with a different driver behind it (D5, D10). *Rejected:* a gate that only ever refuses, leaving P6a's end-to-end path unexercised — the place this project has found every one of its worst defects; and reordering P8 before P6a. **The roadmap's P6a and P8 rows are already edited to match; do not edit them again.**

**R2. The D21 rehearsal is redefined as a local, production-shaped rehearsal that P6a automates.** C1 puts `authentication.stg.id.ubc.ca` out of reach. Instead: the candidate digest is deployed into the production environment behind the gate, its SP is registered with production-shaped values (the production entityID, the public-listener hostname, the registered attribute set), one real CWL sign-in is completed against the Manifest IdP, and pass/fail is recorded on the project **with evidence**. The item becomes met by a **measurement** rather than a checkbox. §9's real-Shibboleth run remains an external-track obligation. **REQUIRED, and Task 14 is judged on it: the item's own `why` text must say that the rehearsal proves the registration's SHAPE and never UBC's acceptance of it.** *Rejected:* a third administrator checkbox; a waiver mechanism, which is the exact hole §13's *Integrity of the gate* exists to close.

**R3. P6a makes the internal/public listener split real.** §12 chose listener assignment over IP allowlisting *because* it fails closed — *"a misconfigured allowlist leaks quietly, whereas a route bound to the wrong listener is simply unreachable"* — and on the only machine that exists **that claim has never been watched failing**. P6a is the first plan to put anything on the public listener, and P7's custom domains are production-only and public-listener-only, so the cost is paid now or paid later with more built on top. **It is the highest-risk item in this plan and Task 1's `[M5]` gates the tasks that depend on it.** *Rejected:* keeping §21's divergence 2 and asserting the listener at config level only; deferring to P7. **The fallback if `[M5]` says it costs more than a sitting is that rejected option, taken deliberately and recorded — see Decision 1.**

**R4. Code safety gets a SEAM now and implementations later.** Nothing today asserts that an app's *code* is safe, and §20's control map said so. P6a defines a `Reviewer` interface and ships an honest `NullReviewer` whose verdict is `not_performed`, **with a real caller** and a **NON-blocking** `LaunchReadiness` item. **Not a stub that purports to review** — that is the *four settings that read like controls and are not* shape, and the next reader would believe it. **And non-blocking is not a preference**: `ready` is every blocking item being met, so a seventh blocking item in state `not_built` would make production unreachable for ever, which is the trap R1 exists to undo. P6b makes the approval summary security-aware (R4d); `SemgrepReviewer` is a tracked hardening item and **not P6 scope** (R4e). **R4's spec action is ✅ APPROVED AND APPLIED — D33, §15's extension-hook row and §20's control-map row, 2026-09-19. The spec already reads this way; write Task 12 against D33 and §15 as they now stand and do NOT re-propose it.**

**Rich also chose the SITTING COUNT on 2026-09-19: eleven, the LEAN of three splits** (thirteen recommended, sixteen cautious). **He was told its three costs and took it**; they are restated at the top of the sittings table because they are the sittings to watch.

*Settled before this plan and not to be re-opened either:* sessions stay **stateless signed cookies** with no server-side store, and their two costs are accepted (P5b R2, §20); **step-up's own second authentication round trip lands with the routes it protects** (Rich, 2026-09-17, §20) — which is this plan; the privileged set is **named once** with §20's alignment test (P5b R1); a delegated token has a server-side record with revocation and does **not** inherit the session divergence (D24); the console and the API share **one origin** behind the edge (P5 R3); the contract is versioned by a `/v1` path prefix (P5 R4); the console has **no DOM test tier** (P5c Decision 7) — so a refactor of a screen can break the clicked demo with every gate green, and only Task 19 catches it.

---

## Decisions this plan makes, and why

Eighteen questions below Rich's line. Each says what it rejected and what changing course would cost. The brief's §6 posed seven of them with a default; those are Decisions 2, 6, 7, 8, 9, 10 and 11, and each says so.

**Decision 1. The second listener is ONE Caddy container with TWO servers — `srv0` on `:443` as today, `srv1` on `:8443` inside the container, published to `127.0.0.3:443` on the host — plus a host-side dnsmasq split that pins `staging.`, `sandbox.`, `console.` and `idp.` back to `127.0.0.2`.** The brief's §3.2 offers this as a starting point and Task 1's `[M5]` buys it before Task 2 depends on it. It satisfies §21's *a port in the URL is not an acceptable fallback* for the faculty-facing URL, because the browser reaches `https://<slug>.manifest.internal` with no port. **The zones are nested and production is the parent**, so the pin-backs are not optional: without them `console.manifest.internal` and `idp.manifest.internal` move to the public address and the console goes down. *Rejected:* **a second Caddy container** — a second `caddy-data` volume means a second internal CA and every certificate the developer trusted is wrong, which is the one host change this project treats as sacred; **pointing the whole production zone at the new alias** — the brief says in terms this is *"wrong in a way that would take the console down"*; **a port in the faculty URL**, refused by `infra/compose.yaml:76-78` in its own words. **THE FALLBACK, if `[M5]` says this costs more than one sitting:** assert the listener at config level only (`MANIFEST_CADDY_SERVER_PUBLIC` set to a name that does not exist, so a production route fails loudly), record the gap in *What this plan does not build*, and leave §21's divergence 2 as it stands — R3's rejected option, **taken deliberately and written down rather than discovered.** *Changing course* after Task 3 is a `compose.yaml` revert and one `sudo` line.

**Decision 2. The gate is ONE function in `launch/`, and both callers reach the checklist through it.** `assertLaunchable(db, projectId)` computes `computeLaunchReadiness` and throws `ProductionGateError(view)` unless `view.ready`; the deploy route calls it and the read route calls `computeLaunchReadiness` directly. **The view and the gate can never disagree because there is one computation**, and P5c sitting 6 measured the two rendered paths **byte-identical** today — Task 7 keeps that property and asserts it in a test that compares the `409` envelope's `launchReadiness` with the read's body. *(Brief §6.1's default.)* *Rejected:* a separate `canLaunch()` predicate — two statements of readiness is the shape §9's *a document that restates a number drifts from it* names, applied to code; evaluating in the route — which is where the current gate is, and is why there are two of them. *Changing course* is inlining one function.

**Decision 3. BOTH of today's production refusals are removed in Task 7, and the one in `deployRelease` is DELETED rather than made conditional.** `releases/release.ts:213` refuses production before it reads the build, and it is not reachable by any client once the route gates properly — so leaving it would be a second gate nothing can open, and making it conditional would be a second statement of the same rule. **`deployRelease`'s production path is then exercised for the first time**, which is Task 15. *Rejected:* keeping it as a belt-and-braces guard — it guards against the route forgetting, which is what the authorization matrix's production row is for, and a guard that cannot be opened is not a guard. *Changing course* is four lines.

**Decision 4. `IamRegistration` and `PrivacyAssessment` transitions are ROUTES on the same public API, session-only and platform-admin — not a script and not a console-private endpoint.** D31: *"Administration is a role on the same public API, not a second API."* A new capability **`launch:record`** is added to `CAPABILITIES`, granted to `PLATFORM_ADMIN` alone, and **every one of those routes also calls `requireSession`** — because `launch:record` is not one of D24's `PRIVILEGED` four, so a token minted by an administrator could otherwise hold it and satisfy the platform's own gate on its own authority. **`requireSession` is the control and the capability is the role check**, and Task 6 writes the test that a token *holding* `launch:record` is still refused `403 TOKEN_CREDENTIAL_REFUSED`. *Rejected:* reusing `release:approve` for these — it means something else and §13 names it separately; adding `launch:record` to D24's four, which is a **spec change** and is not needed once the route is session-only; a `scripts/` command, which would put external state outside the audit trail and outside the console.

**Decision 5. The three new tables are one migration, 0019, and their state machines are PURE FUNCTIONS in `launch/`.** `iamTransition(from, to)` and `piaTransition(from, to)` return the new state or throw a named refusal; the routes call them and so do their tests. §9 gives `IamRegistration` five states (`draft → submitted → active`, plus `change_requested` and `expired`) and `PrivacyAssessment` three (`draft → submitted → approved`); **the legal transitions are written out as a table in the code**, because "which arrows exist" is the whole of what these objects are. *Rejected:* a `state` column with no guard — an administrator could move a PIA from `draft` to `approved` without it ever having been submitted, and the gate would be satisfied by a typo; a state machine library, which is a dependency and this plan installs none.

**Decision 6. `diff_snapshot` stores the RENDERED diff at decision time, not a reference.** §13 says *"the exact diff shown at decision time"*, and a diff recomputed later against a changed spec is a different claim about a different thing. The column is `jsonb` holding `{imageDigest, changes: SpecChange[], services, attributes, resources, summary: string | null, summarySource}`. *(Brief §6.2's default.)* *Rejected:* storing `{beforeReleaseId, afterReleaseId}` and recomputing — cheaper, and it makes the non-repudiable record a function of mutable rows, which is the opposite of non-repudiable. *Changing course* costs a migration and the record's meaning.

**Decision 7. The AI summary comes from `ai/`'s existing LiteLLM admin client on `default-chat-onprem`, and a summary that cannot be produced is recorded as ABSENT rather than blocking the approval.** `summary: null` with `summarySource: 'unavailable'` and a reason on the operator's stderr. **An approval gate that fails closed on a language model being down is an outage, not a control** — and D17's classification question does not arise, because `default-chat-onprem` carries `max_classification: confidential` and the input is a `manifest.yaml` diff rather than personal information. *(Brief §6.3's default.)* *Rejected:* failing the approval — see above; a synchronous call with no timeout — `ai/client.ts` has a 10 s one and that is what makes "absent" reachable; minting a scoped key for it, which is `ai/keys.ts`'s per-app-per-environment machinery pointed at a platform action it does not model.

**Decision 8. `steppedUpAt` is a claim ON THE EXISTING SESSION COOKIE, reissued after the `ForceAuthn` callback, with a ten-minute freshness window enforced at assert time.** Not a second cookie: a second credential is a second thing to expire, a second thing to scope and a second thing to forget on sign-out. `Session` gains `steppedUpAt: number | null`; `verifySession` validates its type rather than trusting it; `assertStepUp` refuses when it is null or older than `STEP_UP_TTL_MS`. **The consequence is stated honestly rather than hidden: like every Phase 1 session property, it cannot be revoked before its own expiry** (§20's recorded divergence) — so ten minutes is chosen to be long enough for a person to read a diff and short enough that a stolen cookie is rarely stepped up. *(Brief §6.4's default.)* *Rejected:* a server-side store for this one claim — it is the store §20 defers, arriving through the side door for one field; a nonce table, which is that store wearing a hat.

**Decision 9. Step-up guards D24's privileged four AND `release:approve` from day one, and `members:manage` is included exactly as §20 names it.** Adding `members:manage` later means a second pass over a route P5b already tested, and it gives step-up a caller that is **not new**, which makes Task 9's negative control cheap: an existing, passing test goes red. **The guard set is `PRIVILEGED ∪ {release:approve}`, and that union is the honest statement of a difference between the spec's words and the code's** (*Read this first* 2): §20 lists *"approving a release"* where the code has two capabilities. **`stepUpGuarded.test.ts` names the set as literals, the way `privileged.test.ts` does**, so nothing can be quietly added or removed. *(Brief §6.5's default, extended by what reading the code found.)* *Rejected:* guarding only `release:approve` — it would leave §20's other three named and unenforced; folding `release:approve` into `PRIVILEGED`, which changes D24's meaning and needs Rich.

**Decision 10. The rehearsal is RE-RUNNABLE, and it is invalidated by a change to `auth.attributes` or to the registered SP values.** A rehearsal passed in week one must not certify a registration that changed in week six. The row stores the `entityId`, `acsUrl` and the sorted `attributes` it was run against; the checklist item compares them with what the candidate release would register **now** and reads `unmet` with *"the registration changed since the rehearsal — run it again"* when they differ. *(Brief §6.6's default.)* *Rejected:* a one-shot rehearsal — it makes the item a fact about the past; a time-based expiry, which would fail an unchanged app for no reason.

**Decision 11. An approval is invalidated by a new build, necessarily, and the checklist says so in words.** The approval binds a digest (§13); a new build is a new digest; a new digest has no approval. **It reads as a bug the first time somebody meets it**, so `admin-approval`'s `why` says *"this release was rebuilt since it was approved, so the approval no longer covers what would be deployed — approve the new build"* rather than reverting to the generic unmet text. *(Brief §6.7's default.)*

**Decision 12. `Reviewer.review()` takes the release diff AND the source ref, and returns one verdict shape.** R4(a) says the signature is the plan author's; this is it, and the reason for both arguments is that the two implementations that will follow read different things — a static analyser reads the tree, an LLM reads the diff.

```ts
export interface ReviewRequest {
  projectId: string
  releaseId: string
  /** What the release CHANGED, already computed by describeDiff (§14). May be empty for a first release. */
  changes: readonly SpecChange[]
  /** Where the code IS: a bare repository path and a commit. A static analyser reads this. */
  source: { repoPath: string; commitSha: string }
}
export type ReviewVerdict =
  | { state: 'not_performed'; reviewer: string; reason: string }
  | { state: 'clean'; reviewer: string; checked: number }
  | { state: 'findings'; reviewer: string; findings: readonly ReviewFinding[] }
export interface Reviewer { readonly name: string; review(request: ReviewRequest): Promise<ReviewVerdict> }
```

**`not_performed` is a first-class member of the union rather than a null verdict**, so `tsc` makes every reader handle it and nobody can mistake "no findings" for "nothing looked". *Rejected:* a boolean, which cannot express the difference this seam exists to express; taking the whole `Release` row, which would make the interface depend on the schema and would not survive P8.

**Decision 13. The reviewer's checklist item is a NEW `LaunchItemId`, `code-review`, with `blocking: false`.** R4(c) is explicit and *Read this first* 4 is the measurement behind it. It sits beside `iam-registration` and `privacy-assessment` in shape — `state: 'not_built'`, `builtBy` naming the hardening item — and **`readiness.test.ts` asserts that `ready` is unaffected by it**, in both directions: with the item present and `not_built`, a project whose five blocking items are met is still `ready`; flipping `blocking` to `true` turns that test red. **That test is the control that keeps production reachable for ever.**

**Decision 14. The rehearsal, the approval and the external records each publish an EVENT, and migration 0019 rewrites `audit.events`'s CHECK constraint in the same file.** Five new types: `iam_registration.recorded`, `privacy_assessment.recorded`, `rehearsal.completed`, `release.approved`, `release.approval_rejected`. *Read this first* 16 is why the CHECK is in the same migration. **`revokeToken`, `consumeAction` and `addMember` publish nothing** — P5b and P5c recorded that three times as the same shape — and this plan does not repeat it.

**Decision 15. The production probe targets `:8443` inside the container, and that divergence is WRITTEN DOWN where the code is.** The faculty-facing URL carries no port; the *probe* does, because the container-side resolver answers one address for the whole zone and the probe must reach the public server specifically. `edgeIdentityProbe` gains an optional `port`, `applyRoute`'s caller passes it for production only, and the doc comment says in as many words that this is a port in a probe URL and not in a person's. *Rejected:* a third dnsmasq process answering containers differently per zone — `--address` is global to a process (S7), so it is a third container for one probe; probing from the host, which S1 measured cannot reach a container address on Docker Desktop.

**Decision 16. The demo is `make demo-production`, a new target beside the six that exist.** It drives §13's whole gate: a project, a build, a release, a staging deploy, a refused production deploy carrying the checklist, an administrator recording both external records, a rehearsal that runs, an approval behind step-up, and then a production deploy that **succeeds** and is answered by the app on its own production hostname. *Rejected:* folding it into `make demo-journey`, whose red run would then be ambiguous about which half broke (P5b Decision 10's reasoning, for the third time).

**Decision 17. Step-up's second SAML instance shares the entityID, the ACS and the keys, and is distinguished at the callback by its OWN cookie.** `manifest_stepup`, `path=/auth`, holding a nonce and the return path, exactly as `manifest_login` does. The callback prefers whichever cookie's nonce matches `RelayState`, and validates with the matching instance — because `validateInResponseTo: always` caches request IDs per instance (*Read this first* 3). **No second ACS URL and therefore no IdP registration change**, which is what makes this affordable. *Rejected:* a second ACS path — the ACS is registered with the IdP in the platform's SP row, so a second one is a registration change and a second thing §9 alerts on; one instance with `forceAuthn` always on, which would make every ordinary sign-in re-prompt.

**Decision 18. Every new route is session-only unless it is plainly not.** Approve, reject, step-up, both external records and the rehearsal all call `requireSession`. **The reason is D14 rather than convenience**: *"privileged actions require an interactive human session, whichever client initiates them"*, and `requireSession`'s return type makes that a `tsc` error at the call site rather than a remembered check. The one exception is the production **deploy**, which stays token-reachable and is refused by D24's central rule as `release:promote` — the loop P5b built, unchanged.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec or from a dated measurement.

- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`. **Run `pnpm test` twice** — a suite that is not repeatable has a state leak. Never with `--filter`: the two differ, and that difference found a defect.
- **`pnpm test:docker`** (~13 min, needs `make up`, **fails rather than skips**) for every task touching `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`, `observability/`, `infra/` or a `*.docker.test.ts`. **In this plan that is almost every task.** It restarts the edge (dropping every runtime route), truncates the tables and re-registers the platform's SP row — **restart the control plane afterwards** — and it regenerates exactly seven dead app networks and one volume.
- **`pnpm test -- <filter>` does not filter.** One unit file: `pnpm exec vitest run --project unit src/<path>`; one packages file: `pnpm exec vitest run --project packages packages/<pkg>/src/<path>`; one Docker file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>` — all from the repository root.
- **Vitest strips types; it does not check them.** `pnpm typecheck` is the only gate that sees a whole class of error, `exactOptionalPropertyTypes` is on, and a conditional spread — not `x: cond ? v : undefined` — is the fix.
- **`pnpm test` TRUNCATES the control plane's tables**, and so does one file, and so does `pnpm contract:write`. **Run anything that needs a demo's rows BEFORE any Vitest run.**
- **A route change is three files, in order**: the definition, then `pnpm contract:write`, then `pnpm contract:generate`. **`packages/contract/openapi.json` is generated — never edit it.** And the route must be in `ROUTE_DEFINITIONS`, or it exists nowhere.
- **EVERY REFUSAL ASSERTS ITS CODE, NEVER ITS STATUS.** P5a sitting 6's lesson, reproduced live five times since. This plan is almost entirely composed of refusals, which is the worst possible ground for it: `403` alone is `FORBIDDEN`, `TOKEN_CREDENTIAL_REFUSED`, `TOKEN_ACTION_PENDING`, `TOKEN_ACTION_REJECTED` and now `STEP_UP_REQUIRED`, and a status-only assertion passes through all five.
- **A REFUSAL TEST NEEDS A POSITIVE CONTROL IN THE SAME FILE.** P5c's F16: the logout fix passed every test and was still broken, because **every test fired garbage at the route and a route that refuses everything passes them all.** Every refusal test in this plan sits beside a test of the same route **succeeding**, and the pair is what makes either one mean something.
- **A NEGATIVE CLAIM NEEDS A POSITIVE CONTROL TOO.** *"This release is not blocked"* is true of a platform that blocks nothing (P5b sitting 6).
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built — **after committing the task** — and naming the test that goes red, with the assertion quoted. `git checkout <path>` restores from the INDEX, so an uncommitted task is destroyed by the restore rather than the experiment. **Predict what turns red before you run it; a wrong prediction is itself a finding** (P5b sitting 9, F1).
- **Every task names its CALLER.** A module with no call site is not built; it has shipped four times here.
- **Every route this plan adds needs a console caller or an honest `DELIBERATELY_UNCALLED` entry with a reason.** D22's gate is fully disarmed by its own list (*Read this first* 18), so **a reviewer reads the list — the gate will not.**
- **Ask before `sudo`.** It cannot prompt from a tool call: you get `sudo: a terminal is required to read the password`. **Task 2 needs it.** Bundle every privileged step into one script and ask Rich to run `! sudo bash <path>` in his own terminal.
- **Never edit the spec.** `docs/superpowers/specs/2026-08-29-manifest-platform-design.md` is *Approved design*. This plan's *Spec actions* section proposes three; **none may be applied until Rich approves it**, and a spec action is not finished when the spec changes — the four shared HTML pages restate it in plain language.
- **Never touch Laravel Valet.** It owns the `.test` TLD, port 53 and 80/443 on `127.0.0.1`. **Task 2 adds `127.0.0.3`, which is additive and leaves Valet untouched** — and `make host-undo` must remove it too, or the machine is not as it was found.
- **These four containers must survive**: `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`. **And `caddy-data` must never be destroyed**: the internal CA lives there and regenerating it invalidates the root the developer trusted.
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`; `sed -i` takes an argument: `sed -i ''`.
- **The zone is `*.manifest.internal`**, ports **7100–7199**, everything binds an explicit address — never `localhost`, which resolves to `::1` and times out in build tooling.
- **`infra/caddy/Caddyfile` is a single-file bind mount** (*Read this first* 10): after any edit run `make up` and read its output; after any `git checkout` of it, `docker restart manifest-caddy`.
- **`request.log.error` writes nothing** under `Fastify({ logger: false })`. Use `console.error`, and never put a token, a secret, a cookie, a session value or an assertion in it (§14).
- **A swallowed `.catch(() => undefined)` is this codebase's most productive defect**, and a failure that leaves no operator line hides the next one.
- **`.map(fn)` passes the ARRAY INDEX as a second argument** (P5b sitting 7). Any representation mapper that grows an optional `now` or `actor` parameter silently receives `0`.
- **Commit after every task**, on `main` — **no branch, no worktree, no push** — with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), ending with the attribution line the session's own system reminder gives.
- **`$SCRATCH` IS YOUR OWN SESSION'S SCRATCHPAD DIRECTORY AND YOU MUST SET IT** before running any snippet that uses one. An unset `$SCRATCH` does not fail loudly — `> "$SCRATCH/x"` becomes `> /x`.
  ```bash
  export SCRATCH=<your session's scratchpad directory>
  [ -d "$SCRATCH" ] || { echo 'SCRATCH is not a directory — every snippet below will write to /'; exit 1; }
  ```
- **Leave the machine as you found it.** `./scripts/snapshot-machine.sh` at the start of a sitting, the same at the end, and `diff` them. **At every sitting's close run `bash scripts/dead-app-resources.sh` and `bash scripts/litellm-orphans.sh` bare, then TRY each with `--apply` yourself** — the permission classifier refuses them in some sessions and allows them in others, and it has tightened mid-session. Hand the output to Rich only when you are refused. **Never work from a written list; the scripts re-derive.**

**What this plan does not create.** No sensitive-diff re-escalation and no `isSensitiveDiff` caller (P6b's, and its whole point), no custom domains (P7), no IAM package or PIA **generation** (P8 — P6a records what they produce), no audience tier effects (P9), no showcase (P10), no admin console (P11), no Semgrep or any real reviewer implementation (a tracked hardening item, R4e), no CI workflow file, no DOM test tier, no server-side session store.

---

## File Structure

```
packages/control-plane/drizzle/0019_*.sql             NEW (Task 5): three tables, five event types in the CHECK
packages/control-plane/src/
├── db/schema.ts                    MODIFIED (T5): approvals, iamRegistrations, privacyAssessments + two enums
├── launch/
│   ├── readiness.ts                MODIFIED (T7, T12, T14): items read real rows; the code-review item
│   ├── gate.ts                     NEW (T7): assertLaunchable — the ONE evaluation, two callers
│   ├── records.ts                  NEW (T5/T6): the two external objects, their transitions, their reads
│   ├── transitions.ts              NEW (T5): iamTransition / piaTransition — pure, table-driven
│   ├── rehearsal.ts                NEW (T14): runs R2's production-shaped rehearsal, records evidence
│   ├── review.ts                   NEW (T12): R4's Reviewer interface + NullReviewer (D33, §15)
│   └── index.ts                    MODIFIED: the module's public surface
├── releases/
│   ├── release.ts                  MODIFIED (T3 Decision 3, T15): the inner gate DELETED; digest verified
│   ├── approval.ts                 NEW (T10, T11): record an approval, its diff_snapshot, its AI summary
│   └── build.ts                    MODIFIED (T13): §7's production attribute check, before the driver
├── identity/
│   ├── session.ts                  MODIFIED (T8): steppedUpAt on the Session, validated not trusted
│   ├── saml.ts                     MODIFIED (T8): createSamlSp gains a forceAuthn variant
│   └── step-up.ts                  NEW (T8): the cookie, the nonce, the freshness window
├── projects/authz.ts               MODIFIED (T4? no — T6, T9): launch:record; assertStepUp; the guarded set
├── routing/
│   ├── readiness.ts                MODIFIED (T4): edgeIdentityProbe gains a port (Decision 15)
│   ├── routes.ts                   MODIFIED (T4): the public server name is no longer srv0
│   └── hostnames.ts                unchanged — listenerFor already says the right thing
├── api/
│   ├── error-codes.ts              MODIFIED (T6–T15): every new code, once, with its status
│   ├── errors.ts                   MODIFIED (T7, T9): the gate envelope; STEP_UP_REQUIRED's hint
│   ├── authz-contract.ts           MODIFIED (T6, T9, T10, T14): rows for every new route, nine actors each
│   ├── unversioned.ts              MODIFIED (T8): GET /auth/step-up, with its reason
│   ├── routes/auth.ts              MODIFIED (T8): the step-up start and the callback's second branch
│   ├── routes/launch.ts            MODIFIED (T6, T14): the records, their transitions, the rehearsal
│   ├── routes/releases.ts          MODIFIED (T7, T10): the gate replaced; approve and reject
│   ├── representations/launch.ts   MODIFIED (T6, T12, T14): the new item id, the two records, the rehearsal
│   └── representations/releases.ts MODIFIED (T10): Approval and its diff snapshot
└── config.ts                       MODIFIED (T3): MANIFEST_CADDY_SERVER_PUBLIC default; the probe port

infra/
├── compose.yaml                    MODIFIED (T2, T3): dnsmasq-host's split; caddy's 127.0.0.3:443 → 8443
├── caddy/Caddyfile                 MODIFIED (T3): srv1's production wildcard site
├── lib/common.sh                   MODIFIED (T2): PUBLIC_EDGE_IP="127.0.0.3"
├── lib/ensure-alias.sh             MODIFIED (T2): both aliases, one prompt
├── host/host-setup.sh              MODIFIED (T2): step 1 adds both
├── host/host-undo.sh               MODIFIED (T2): removes both, and ASSERTS both removals
└── host/p6a-second-address.sh      NEW (T2): the ONE bundled sudo script Rich runs

scripts/
├── doctor.sh                       MODIFIED (T2): the second alias, the split's host answer
├── verify.sh                       MODIFIED (T3, T4): srv1 exists; a production name resolves public
├── demo-production.sh              NEW (T19): §13's whole gate, end to end
├── offline-acceptance.sh           MODIFIED (T19): an ELEVENTH step
└── ci-acceptance.sh                MODIFIED (T19): demo-production, and the four EXPECT_ counts

packages/journey/src/production.ts  NEW (T19): everything the API does, through @manifest/contract alone
packages/console/src/
├── api.ts                          MODIFIED (T17, T18): one function per new operation
├── screens/launch.tsx              MODIFIED (T17): the checklist with ACTIONS
├── screens/records.tsx             NEW (T17): the two external records, admin only
├── screens/approvals.tsx           NEW (T18): the diff at decision time, approve, reject
├── auth.ts                         MODIFIED (T18): the step-up navigation — the only file naming /auth/
└── coverage.test.ts                MODIFIED (T18): DELIBERATELY_UNCALLED, with reasons, read by a person

Makefile                            MODIFIED (T19): demo-production
docs/superpowers/RUNBOOK.md         MODIFIED (T2, T6, T19): the second address; recording a registration; the demo
docs/superpowers/WALKTHROUGH.md     MODIFIED (T19): the production launch, as a checklist a person can run
```

---

## The fixtures and helpers every snippet below uses

**Named once here so no task re-derives them.** Anything a snippet names and does not import is defined in this section or in the task that introduces it.

**Test users** (the Manifest IdP's three, `infra/idp/config/authsources.php`): `student` / `student` (`stu000001`), `instructor` / `instructor` (`ins000001`), `operator` / `operator` (`opr000001`). **`operator` is the one `make demo-journey` promotes to administrator** via `scripts/admin-grant.sh`, and **a platform role reaches a person only when they sign in again** (§20's stateless-session divergence). **This plan needs the administrator in almost every task after 6** — the records, the approval and the rehearsal are all theirs.

**In the control plane:**

- **`resetDatabase(db)`** (`db/testing.ts`) — for a test that drives a real server, whose rows are committed. `withRollback` isolates a test from its **own** writes only.
- **`ensureTestUser(db, puid, role?)`** (`identity/testing.ts`) and **`loginAs(app, actor)`** (`api/testing.ts`) — how every existing route test gets a session; `mutationHeaders()` adds the `Origin` and an `Idempotency-Key`.
- **`mintTestToken(db, {...})`** (`tokens/testing.ts`) — writes a token row directly, so it can hold capabilities the mint route would refuse. **That is exactly why P5b sitting 4's ordering control could not fail**, and why a token test that means to exercise the *real* path must mint through the route.
- **`stepUpSession(session, now?)`** — written in Task 8's `identity/step-up.ts`; returns a `Session` with `steppedUpAt` set, for tests that need a stepped-up actor without a SAML round trip. **It is test-reachable and route-unreachable**: nothing but the callback sets the claim on a real cookie, and Task 9's control proves it.

**In the demos and scripts:**

- **`idp_login <sp-jar> <idp-jar> <login-url> <user> <pass> <acs> <ca>`** (`infra/lib/idp-login.sh`) — THE three-hop CWL login. **One jar per identity**: SimpleSAMLphp remembers who authenticated, so a shared IdP jar silently signs the second person in as the first.
- **`scripts/lib/api.sh`** — the curl helpers the demos share; **`scripts/lib/check.sh`** — `checks.ok`, `checks.finish`. **`check.ok` prints its `detail` only when the check FAILS**, so a measurement a demo is supposed to report must be `console.log`/`echo`ed as well (P5a sitting 12, finding 1).
- **`scripts/admin-grant.sh`** — the out-of-band first administrator (§20), recorded as a `RoleChange`.

**THE TRAP THAT WILL COST A SITTING IF IT IS NOT DISARMED**, twice over:

1. **`POST /v1/projects/{id}/members` and every read of `users` answers for people who have signed in to MANIFEST**, and `pnpm test` empties that table on every run. **Signing in to a deployed app does not count** (P5c sitting 9, F14). The administrator who approves a release in Task 19 must sign in to `https://console.manifest.internal/` first.
2. **A production deploy needs the candidate release to be SERVING STAGING** (*Read this first* 5). A `pnpm test` between the staging deploy and the production one truncates the project and the checklist reads `candidateReleaseId: null`. **Order the sitting so no Vitest run sits between them.**

---

## Task 1: Measure what this plan rests on — before any of it is built

> ### [M1] Correction block — EXECUTED 2026-09-19. Step 1 destroys the state Step 2 exists to measure.
>
> *Written by P6a sitting 1, which hit this in its first ten minutes; evidence in
> [`spikes/p6a-baseline/`](../spikes/p6a-baseline/README.md).*
>
> **What this task said:** Step 1 takes the baseline (`pnpm test`, twice), then Step 2's `[M1]`
> queries `select count(*) from projects` and `from users`.
>
> **What the measurement found:** `pnpm test` **TRUNCATES those exact tables** — Global
> Constraints says so four lines above. So Step 2 as ordered reports what the test run left,
> never "the state this plan starts from", and it reports it as though it were a reading.
>
> **What this task now does: TAKE `[M1]` FIRST, BEFORE STEP 1.** Sitting 1 did, and it cost
> nothing that day only because the tables were already empty (0/0/0 behind twelve running app
> containers). On any other day it would have silently substituted zeroes for the measurement.
> The rest of Step 1 is unchanged and all four gate numbers agreed with §2's box.


**ALONE, AND FIRST.** Every plan since P4c has opened with a measurement sitting, and it has moved task boundaries in three of the last four. **This task writes no feature code.** Its output is a findings file and, where a measurement contradicts this plan, an `[M<n>]` correction block at the top of the task it contradicts.

**The brief names three measurements that must be bought before anything depends on them** (§10): whether SimpleSAMLphp honours `ForceAuthn` (`[M3]`), what the second listener actually costs on this machine (`[M5]`), and whether `computeLaunchReadiness` survives being read by something that blocks rather than displays (`[M4]`). **Seven more are here because reading the code raised them.**

**Files:**
- Create: `docs/superpowers/spikes/p6a-baseline/README.md` — the findings, one section per measurement, each with its command and its raw answer
- Create: `docs/superpowers/spikes/p6a-baseline/results-task1-<date>.txt` — every command and its untrimmed output
- Modify: this plan — an `[M<n>]` correction block at the top of any task a measurement moves, and the sittings table if a boundary does
- Modify (temporarily, and restored in the same step): `packages/control-plane/src/identity/saml.ts` for `[M3]` only

**Interfaces:**
- Consumes: nothing.
- Produces: the four gate numbers as they stand; a yes/no on each of M2–M10; **R3's go/no-go**, which decides whether Tasks 2–4 build the split or take Decision 1's stated fallback; and the `ForceAuthn` answer, which decides whether Task 8 also has to configure the IdP.

- [ ] **Step 1: Snapshot the machine, and take the baseline**

```bash
cd /Users/rich/Developer/manifest
export SCRATCH=<your session's scratchpad directory>       # Global Constraints: it is NOT set for you
[ -d "$SCRATCH" ] || { echo 'SCRATCH is not a directory'; exit 1; }
./scripts/snapshot-machine.sh > "$SCRATCH/before.txt"      # read-only, no sudo, no network
make up                                                     # ~1 min; re-adds the 127.0.0.2 alias
make doctor && make verify
pnpm test && pnpm test                                      # twice — a suite that is not repeatable has a state leak
pnpm lint && pnpm typecheck && pnpm format:check
```

**Record all four numbers with the command beside each** — `pnpm test` as *N passed, M files*, `make doctor` and `make verify` as *checks / failed*. **Expect ORIENTATION §2's box exactly**; a number that disagrees is signal before you write code, not after. **`make verify`'s *per-app resources* and *runtime routes* INFO lines are not checks** — `routes: 0` means the control plane has not booted since the edge last restarted, and more networks than apps means the Docker tier's dead ones.

**If the machine was reset recently, run `make verify` FIRST**: after a reset the host can lose the edge while a container still has it, and the remedy is `docker restart manifest-caddy` (P5b sitting 9, F6).

- [ ] **Step 2: `[M1]` — the state this plan starts from, queried rather than recalled**

```bash
lsof -nP -iTCP:7100 -sTCP:LISTEN || echo 'NOTHING ON 7100 — the control plane is a host process and is DOWN'
ifconfig lo0 | grep 'inet '                       # expect 127.0.0.1 and 127.0.0.2; 127.0.0.3 must NOT be there yet
ls /etc/resolver/                                  # manifest.internal, plus Valet's test — do not touch the latter
docker ps --format '{{.Names}}\t{{.Status}}' | sort
psql "$MANIFEST_DATABASE_URL" -c 'select count(*) from projects' -c 'select count(*) from users' 2>/dev/null \
  || echo '(no psql: read the counts through the API instead)'
```

**Three separate state claims went stale within the hour on 2026-09-19.** Write down what you find; do not carry any note's version of it forward.

- [ ] **Step 3: `[M2]` — there are TWO production gates. Prove it, and prove which one a client meets**

*Read this first* 1 says the route refuses before `deployRelease` is ever called, so the inner gate has never been exercised by a client. **Confirm both exist, and confirm the inner one is unreachable today:**

```bash
grep -n 'RELEASE_PRODUCTION_GATE_UNAVAILABLE' -r packages/control-plane/src | grep -v '\.test\.'
# Expect THREE: api/routes/releases.ts (the errors: list), api/errors.ts (ProductionGateError),
# releases/release.ts (the ReleaseError), plus api/error-codes.ts's entry with TWO families.
```

Then drive it, with the control plane running and a project that has a staging deploy:

```bash
# Through the edge, as a person. PRODUCTION_ENV_ID is the production environment of a project you own.
curl -sS --cacert "$CA" -b "$JAR" -H 'Origin: https://console.manifest.internal' \
  -H "Idempotency-Key: $(uuidgen)" -H 'content-type: application/json' \
  -d '{"releaseId":"'"$RELEASE_ID"'"}' \
  "https://console.manifest.internal/v1/environments/$PRODUCTION_ENV_ID/deploy" | jq '.error.code, (.error.launchReadiness.items|length)'
```

**Expect `"RELEASE_PRODUCTION_GATE_UNAVAILABLE"` and an item count** — which tells you it is the ROUTE's gate (the inner one carries no checklist). **Record the item count and each item's `id`, `blocking` and `state`: that is `[M4]`'s raw material.**

**THEN THE MEASUREMENT THAT MATTERS.** Comment out the route's gate alone, rebuild, restart the control plane, and repeat the request:

```bash
# Temporarily, in api/routes/releases.ts, comment out the `if (environment.kind === 'production') throw …`
pnpm --filter @manifest/control-plane build && <restart the control plane>
# …repeat the curl above…
```

**Predict before you run it:** the answer should still be `RELEASE_PRODUCTION_GATE_UNAVAILABLE`, **with no `launchReadiness` in the envelope**, because `deployRelease`'s own refusal now answers. **If that is what happens, Decision 3 is confirmed and Task 7 must remove both.** If it is *not* — if a production deploy proceeds — that is a finding worth more than this whole step, and Task 15 moves earlier. **Restore with `git checkout`, rebuild, restart, and re-run the first curl to prove the restore took.**

- [ ] **Step 4: `[M3]` — does SimpleSAMLphp honour `ForceAuthn`?**

**This is the measurement P4a's *four settings that read like controls and are not* exists to make you take.** `@node-saml/node-saml` 5.1.0 will happily *issue* a `ForceAuthn` request; whether the IdP re-prompts is unknown, and **a step-up that silently reuses the session is a step-up that does nothing, and every test of it passes.**

**Headlessly, with a positive control in the same walk.** `idp_login` leaves an IdP session in its jar; a second sign-in with that jar normally goes straight through. So:

```bash
cd /Users/rich/Developer/manifest
. infra/lib/common.sh
. infra/lib/idp-login.sh
fail() { echo "FAIL: $*" >&2; exit 1; }
CA="$PWD/$CA_FILE"; JAR="$SCRATCH/cp.jar"; IDPJAR="$SCRATCH/idp.jar"; rm -f "$JAR" "$IDPJAR"

# (a) THE POSITIVE CONTROL, first and with the flag ABSENT: sign in once, then start a second
#     sign-in with the SAME IdP jar and look at what hop 2 serves.
idp_login "$JAR" "$IDPJAR" "https://console.manifest.internal/auth/login" instructor instructor \
  "https://console.manifest.internal/auth/saml/callback" "$CA"
AUTHN="$(curl -sS --cacert "$CA" -c "$JAR" -b "$JAR" -o /dev/null -w '%{redirect_url}' \
  'https://console.manifest.internal/auth/login')"
curl -sS --cacert "$CA" -c "$IDPJAR" -b "$IDPJAR" -L "$AUTHN" > "$SCRATCH/hop2-normal.html"
grep -c 'name="username"' "$SCRATCH/hop2-normal.html"    # EXPECT 0 — the IdP reuses its session
```

Now add the flag, temporarily, at the one place `node-saml` reads it — **it is a CONSTRUCTOR option and there is no per-request form** (*Read this first* 3):

```bash
# In identity/saml.ts, inside `new SAML({ … })`, add:   forceAuthn: true,
pnpm --filter @manifest/control-plane build && <restart the control plane>
rm -f "$JAR"                    # a fresh SP jar; the IdP jar is DELIBERATELY kept
AUTHN="$(curl -sS --cacert "$CA" -c "$JAR" -b "$JAR" -o /dev/null -w '%{redirect_url}' \
  'https://console.manifest.internal/auth/login')"
curl -sS --cacert "$CA" -c "$IDPJAR" -b "$IDPJAR" -L "$AUTHN" > "$SCRATCH/hop2-force.html"
grep -c 'name="username"' "$SCRATCH/hop2-force.html"     # 1 = HONOURED. 0 = NOT HONOURED.
grep -o 'ForceAuthn="[^"]*"' "$SCRATCH/authnrequest.xml" 2>/dev/null   # if you also decode the request
git checkout packages/control-plane/src/identity/saml.ts
pnpm --filter @manifest/control-plane build && <restart the control plane>
```

**Record which it was, with both HTML files kept.** Three outcomes and what each costs:

| Answer | What it means | What changes |
|---|---|---|
| **Honoured** (a form at hop 2, none in the control) | The IdP re-prompts. Step-up is a real second authentication | Nothing. Task 8 as written |
| **Not honoured** (no form either way) | **A step-up would be a setting that reads like a control and is not** | **Task 8 grows a step: configure the Manifest IdP to honour it** (`infra/idp/config/`) and re-measure. `pnpm test:docker` is then owed, because the identity tier parses the IdP's HTML |
| **The control ALSO showed a form** | The IdP does not keep a session across the jar at all, so the measurement cannot distinguish | The measurement is invalid — say so, and find the reason before trusting either column |

**If it cannot be made to honour it at all, that is Rich's**, and it goes to ORIENTATION §8 as a decision with its cost: §13's *"Approving requires step-up re-authentication"* would be satisfied in shape and not in substance locally, and the plan says so in the item's own words rather than claiming otherwise.

- [ ] **Step 5: `[M4]` — what does the checklist answer for a REAL project, and does it survive being read by something that blocks?**

```bash
curl -sS --cacert "$CA" -b "$JAR" \
  "https://console.manifest.internal/v1/projects/$PROJECT_ID/launch-readiness" \
  | jq '{ready, candidateReleaseId, items: [.items[] | {id, blocking, state, builtBy}]}'
```

**Answer all six questions in the findings file:**

1. **How many items, and is `load-rehearsal` among them?** It appears only for a `large_course` or `public` audience. Six or seven — *"count carefully in any sentence that states a number"* (brief §1).
2. **Which are `met` today?** Expect `domain` always, and `iam-registration` **only if `auth.provider` is `none`**. Run it against a CWL project and a non-CWL one and record both.
3. **What does `scans` say, and why?** It is `unmet` with a reason when nothing serves staging, and `met` with an unfixable-finding count when something does.
4. **Is `candidateReleaseId` the release serving STAGING?** Deploy a second release to staging and read it again; it must move.
5. **THE ONE THAT DECIDES A TASK.** Add a seventh item in a throwaway edit — `{id:'code-review', blocking:true, state:'not_built'}` — and read `ready` for a project whose other items you have forced to `met`. **Predict: `ready` becomes false and can never become true.** That is Decision 13's whole justification, measured rather than argued. **Restore.**
6. **Are the two paths still byte-identical?** P5c sitting 6 measured the `409` envelope's `launchReadiness` and the read's body as identical. Compare them with `jq -S . | diff` and record the result. **Task 7 must not break it, and Task 7's test asserts it.**

- [ ] **Step 6: `[M5]` — what the second listener actually costs. FOUR sub-measurements, and R3's go/no-go**

**The highest-risk item in this plan** (R3), and the brief's §3.2 says why in detail. **Measure all four before Task 2 changes anything.**

**(a) Can Caddy run two servers in one container, and does the admin API address them separately?**

```bash
curl -sS http://127.0.0.1:7119/config/apps/http/servers | jq 'keys'          # expect ["srv0"] today
curl -sS http://127.0.0.1:7119/config/apps/http/servers/srv0/routes | jq 'length'
```

Then add a second server through the admin API **without touching `compose.yaml`** — a throwaway `srv1` listening on `:8443` with a `respond` handler — and read it back:

```bash
# node:http, NOT fetch: Caddy refuses any request carrying an Origin header, and undici
# attaches `Origin: ''` to every non-GET. This is P5c sitting 1's F1 in one line.
node -e '
const http=require("node:http");
const body=JSON.stringify({listen:[":8443"],routes:[{handle:[{handler:"static_response",body:"srv1 probe"}]}]});
const r=http.request({host:"127.0.0.1",port:7119,method:"PUT",path:"/config/apps/http/servers/srv1",
  headers:{"content-type":"application/json"}},res=>{let t="";res.on("data",c=>t+=c);
  res.on("end",()=>{console.log("status",res.statusCode,t);process.exit(res.statusCode<300?0:3)})});
r.on("error",e=>{console.error(e.message);process.exit(3)});r.write(body);r.end()'
curl -sS http://127.0.0.1:7119/config/apps/http/servers | jq 'keys'          # expect ["srv0","srv1"]
```

**ASSERT THE STATUS. A measurement that does not check the admin call's status reports whatever it hoped for** — that is exactly how P5c sitting 1 nearly closed §8's question backwards. **Then `DELETE /config/apps/http/servers/srv1` and read the keys back to prove the removal took.**

**(b) Does the dnsmasq split work, with the three internal names pinned back?** dnsmasq's more-specific rules win over less-specific ones, but **this is measured, not assumed.** Start a throwaway dnsmasq on an unused port with exactly the rules Task 2 would install, and ask it four questions:

```bash
docker run --rm -d --name p6a-dns-probe -p 127.0.0.1:7154:53/udp manifest-dnsmasq:local \
  --keep-in-foreground --no-daemon --no-resolv --log-queries \
  --local=/manifest.internal/ \
  --address=/manifest.internal/127.0.0.3 \
  --address=/staging.manifest.internal/127.0.0.2 \
  --address=/sandbox.manifest.internal/127.0.0.2 \
  --address=/console.manifest.internal/127.0.0.2 \
  --address=/idp.manifest.internal/127.0.0.2
for N in demo-app.manifest.internal demo-app.staging.manifest.internal \
         console.manifest.internal idp.manifest.internal demo-app.sandbox.manifest.internal; do
  printf '%-44s %s\n' "$N" "$(dig +short @127.0.0.1 -p 7154 "$N" | head -1)"
done
docker rm -f p6a-dns-probe
```

**Expect `127.0.0.3` for the first and `127.0.0.2` for the other four.** If a pin-back does not win, **Task 2's mechanism is wrong and Decision 1's fallback is live** — and the console would have gone down on the real change, which is the whole reason this is measured on a throwaway.

**(c) Does the CONTAINER-side resolver need the same split?** It answers `10.89.0.10` for the whole zone, and both servers are in that one container — so a production app's probe reaches `manifest-caddy:443`, the internal server (*Read this first* 8). **Measure what a container actually gets, and what it gets on `:8443`:**

```bash
docker run --rm --network manifest-platform --dns 10.89.0.53 curlimages/curl:8.11.1 \
  -sS -o /dev/null -w 'to :443  %{http_code}\n' --insecure https://demo-app.manifest.internal/
docker run --rm --network manifest-platform --dns 10.89.0.53 curlimages/curl:8.11.1 \
  -sS -o /dev/null -w 'to :8443 %{http_code}\n' --insecure https://demo-app.manifest.internal:8443/
```

**With no `srv1` the second is a connection refusal, which is the answer that tells you the probe port is real work rather than a guess.** Record both. **`--insecure` is acceptable HERE and nowhere else in this plan** — this measures reachability, not TLS, and the real probe mounts the CA for the reason `routing/readiness.ts` gives at length.

**(d) What does a `compose.yaml` change cost right now?** *Read this first* 9 says it recreates `manifest-caddy` and drops every runtime route. **Measure it**: count the runtime routes, run `make up` after a no-op whitespace change to the caddy service, count them again, and time how long the control plane takes to re-apply them at boot.

```bash
curl -sS http://127.0.0.1:7119/config/apps/http/servers/srv0/routes | jq '[.[]|select(.["@id"])]|length'
```

**THE GO/NO-GO.** Write it in one sentence in the findings file: *the split is affordable in one sitting* or *it is not, and Decision 1's fallback is taken.* **(a) and (b) failing is a no-go; (c) failing is Decision 15's work rather than a no-go.**

- [ ] **Step 7: `[M6]` — can a platform administrator mint a delegated token holding `release:approve`?**

*Read this first* 2 says yes, from reading `authz.ts` and the mint route. **Measure it through the ROUTE, because a token written straight to the store proves nothing about what the platform will issue** (P5b sitting 4, F1):

```bash
# As the ADMINISTRATOR (scripts/admin-grant.sh first, then sign in again — a role reaches a
# person only at their next sign-in).
curl -sS --cacert "$CA" -b "$ADMIN_JAR" -H 'Origin: https://console.manifest.internal' \
  -H "Idempotency-Key: $(uuidgen)" -H 'content-type: application/json' \
  -d '{"name":"m6-probe","capabilities":["release:approve"],"expiresInDays":1}' \
  "https://console.manifest.internal/v1/projects/$PROJECT_ID/tokens" | jq '.token.capabilities, .error.code'
```

**Expect the token to be MINTED**, because `release:approve` is not one of D24's `PRIVILEGED` four and an administrator holds it. **If it is minted, Decision 4 and Decision 9 are both confirmed and Spec action 2 is real.** Revoke the probe token immediately and say so in the findings. **Also run the same request with `["release:promote"]` as the positive control** — that one must be refused `400 TOKEN_CAPABILITY_FORBIDDEN`, and if it is not, the finding is far larger than this plan.

- [ ] **Step 8: `[M7]` — what does D22's coverage gate do with a route that has no caller?**

*Read this first* 18: the gate is fully disarmed by its own list, and `DELIBERATELY_UNCALLED` is empty today. **Prove the gate still works before adding seven operations to its input**:

```bash
pnpm exec vitest run --project packages packages/console/src/coverage.test.ts   # expect 2 passed
```

Then add a throwaway operation to `ROUTE_DEFINITIONS`, regenerate, and run it again:

```bash
# Add a trivial `GET /v1/m7-probe` route definition, then:
pnpm contract:write && pnpm contract:generate
pnpm exec vitest run --project packages packages/console/src/coverage.test.ts   # EXPECT RED, naming the operation
```

**Record the failure message verbatim** — Tasks 17 and 18 will read it a dozen times. **Then put the operation into `DELIBERATELY_UNCALLED` with a nonsense reason and run it again**: it goes green, which is the measurement that a reviewer and not the gate is what reads that list. **Restore everything, regenerate, and re-run both the coverage test and `pnpm test` to prove the restore took** — `pnpm contract:write` truncates the tables, so do this before anything that needs rows.

- [ ] **Step 9: `[M8]` — the authorization matrix's production row, and what Task 7 does to it**

```bash
grep -n "production" packages/control-plane/src/api/authz-contract.ts | head -20
pnpm exec vitest run --project unit src/api/authz-contract.ts 2>&1 | tail -5     # record the case count
```

**Answer three questions:** what does the production-deploy row expect for each of the nine actors today; **which of those expectations are a statement about the GATE rather than about authorization** (the `409` ones are, and Task 7 changes what they mean); and **does `Expectation`'s `REFUSAL_CODE` table need a new entry for `STEP_UP_REQUIRED`** — it maps one code per status and `403` is already spoken for, so Task 9 adds explicit `(status, code)` pairs rather than a mapping.

- [ ] **Step 10: `[M9]` — does a production SP registration derive production-shaped values today, and who would write it?**

R2's rehearsal rests on this. `deriveSpEntity` takes `environmentKind` and builds `entityId = <base>/sp/<slug>/<kind>` (`sso/entity.ts`), and `deployRelease` registers the SP as part of a deploy. **Read the path and write down, in the findings file, the exact entityID, ACS URL, SLO URL and attribute list a production deploy of your test project WOULD register** — derived by hand from the code and the project's spec, since nothing has ever run it:

```bash
grep -n 'registerServiceProvider\|deriveSpEntity\|environmentKind' packages/control-plane/src/releases/release.ts | head
```

**Then check the one thing that could stop it**: `deriveSpEntity` refuses an empty `auth.attributes` (`SP_ENTITY_NO_ATTRIBUTES`) and refuses `auth.provider !== 'cwl'`. **So an app with `auth.provider: none` registers no SP at all, and R2's rehearsal has nothing to rehearse.** Record what the rehearsal's item must therefore say for such an app — Task 14 needs the answer and it is not obvious.

- [ ] **Step 11: `[M10]` — the event CHECK constraint, and what the Docker tier costs this plan**

```bash
grep -c "'" <(grep -o "'[a-z_]*\.[a-z_]*'" packages/control-plane/drizzle/0017_thin_snowbird.sql)  # the CHECK's list
grep -n "EVENT_TYPES" -A 50 packages/control-plane/src/observability/events.ts | grep -c "^.*'"     # the constant's
```

**Assert the two agree today**, and record that **a new event type without a CHECK rewrite fails at runtime with every unit test green** (*Read this first* 16). **Then confirm the Docker tier's number and cost** (`pnpm test:docker`, ~13 min) so the sitting budget is real rather than remembered, and note the seven dead networks and one volume it regenerates.

- [ ] **Step 12: Write the findings, correct the plan, and leave the machine as you found it**

```bash
mkdir -p docs/superpowers/spikes/p6a-baseline
# README.md: one section per measurement — what was asked, the command, the RAW answer, what it means
# for this plan, and (where it moves something) the task and the correction.
./scripts/snapshot-machine.sh > "$SCRATCH/after.txt"
diff "$SCRATCH/before.txt" "$SCRATCH/after.txt"      # each file's image section derived from its OWN header
git status                                            # must be clean but for the new spike directory and this plan
bash scripts/dead-app-resources.sh && bash scripts/litellm-orphans.sh   # bare, then TRY --apply yourself
```

**Where a measurement contradicts a later task, write an `[M<n>]` correction block at the TOP of that task** — the shape P5b and P5c both used — and say in the block what the task said, what the measurement found, and what the task now does. **If a boundary moves, re-cut the sittings table and say so.**

- [ ] **Step 13: Commit**

```bash
git add docs/superpowers/spikes/p6a-baseline docs/superpowers/plans/2026-09-19-p6a-first-production-launch.md
git commit -m "docs(p6a): sitting 1 — the measurements this plan rests on"
```

**Negative controls for this task.** A measurement task's controls are the positive halves of its own measurements, and three of them are load-bearing:

| | Control | What it proves | Predicted |
|---|---|---|---|
| a | `[M3]`'s ordinary sign-in with the same IdP jar | that the IdP DOES keep a session, so "a form appeared" means `ForceAuthn` and not a lost session | **no login form** |
| b | `[M6]`'s `release:promote` mint request beside the `release:approve` one | that the mint route refuses D24's four, so "it was minted" is about `release:approve` specifically | **`400 TOKEN_CAPABILITY_FORBIDDEN`** |
| c | `[M7]`'s restore, re-run | that the coverage gate is green again and the probe operation is gone from the document | **2 passed** |
| d | `[M5](a)`'s `DELETE` of the throwaway `srv1`, keys read back | that the measurement left the edge as it found it | **`["srv0"]`** |

---

## Task 2: The second address on the host — `127.0.0.3`, and the dnsmasq split

> ### [M5] Correction block — EXECUTED 2026-09-19. R3 is a GO, and the pin-back list is one name short.
>
> *TWO points. The first is the one that would have turned `make verify` red in this sitting;
> evidence in [`spikes/p6a-baseline/`](../spikes/p6a-baseline/README.md), `[M5](b)` and `(d)`.*
>
> **1. `edge.manifest.internal` MUST BE PINNED BACK TO `127.0.0.2` TOO.** Decision 1's list is
> `staging.`, `sandbox.`, `console.` and `idp.`. Measured on a throwaway dnsmasq carrying
> exactly those rules, **`edge.manifest.internal` answers `127.0.0.3`** — it is a §23 reserved
> label (`infra/reserved-labels/labels.yaml`, *"Manifest's edge proxy"*), it lives in the bare
> production zone, and `make doctor` and `make verify` both probe it. Add it to the
> `--address=` pin-backs beside `console.` and `idp.`. **Task 3 carries the other half of this
> repair** — it also needs an explicit site on `srv0`. Everything else in the split works:
> dnsmasq's more-specific rules win for all four original pin-backs, and AAAA still answers
> `NOERROR`.
>
> **2. A `compose.yaml` edit only costs a recreate when it changes the service's CONFIG.**
> *Read this first* 9 says a change "recreates `manifest-caddy` and drops every runtime route".
> Measured both ways: a **comment** line in the `caddy:` service left the container untouched
> (same id), `make up` took **2 s** and the runtime route **survived**; adding one **published
> port** recreated it (new id), `make up` took **7 s** and routes went **1 → 0**. The window is
> then closed by a control-plane restart measured at **546 ms** boot-to-ready with
> `routesRestored: 1`. So sequence the sitting for the config changes and stop budgeting a
> recreate for every save.


**THIS TASK NEEDS `sudo`, AND `sudo` CANNOT PROMPT FROM A TOOL CALL.** You get `sudo: a terminal is required to read the password`. **Every privileged step in this plan is bundled into one script, `infra/host/p6a-second-address.sh`, and Rich runs it himself** with `! sudo bash infra/host/p6a-second-address.sh` in his own terminal. Write the script, ask, and wait. **Do not attempt `sudo` from a tool call, and do not work around it.**

**Depends on `[M5](b)`.** If the dnsmasq pin-backs did not win, **stop and take Decision 1's fallback**, recording it — do not improvise a mechanism here.

**Files:**
- Create: `infra/host/p6a-second-address.sh` — the one script Rich runs
- Modify: `infra/lib/common.sh` — `PUBLIC_EDGE_IP="127.0.0.3"`, beside `EDGE_IP`
- Modify: `infra/lib/ensure-alias.sh` — both aliases, one prompt
- Modify: `infra/host/host-setup.sh` — step 1 adds both
- Modify: `infra/host/host-undo.sh` — removes both, and **asserts** both removals
- Modify: `infra/compose.yaml` — `dns-host`'s command gains the split
- Modify: `scripts/doctor.sh` — two checks
- Modify: `docs/superpowers/RUNBOOK.md` — what the second address is and how to undo it
- Test: `scripts/doctor.sh` is the test — this task's deliverable is infrastructure, and `make doctor` is what asserts it

**Interfaces:**
- Consumes: `[M5](b)`'s measured dnsmasq rules.
- Produces: `PUBLIC_EDGE_IP` (sourced by `compose.yaml`'s interpolation, `doctor.sh`, `verify.sh` and Task 3), and a host on which `<slug>.manifest.internal` resolves to `127.0.0.3` while `console.`, `idp.`, `*.staging.` and `*.sandbox.` resolve to `127.0.0.2`.

- [ ] **Step 1: Name the second address once**

```bash
# infra/lib/common.sh, immediately after EDGE_IP
EDGE_IP="127.0.0.2"          # the lo0 alias Caddy's INTERNAL listener binds, so Valet keeps 127.0.0.1
# §12's public listener, made real (P6a, R3). Production only. A SECOND ADDRESS rather than a
# port, because infra/compose.yaml says in terms that a port in the URL breaks the byte-for-byte
# hostname parity §9 needs — so the faculty-facing URL stays https://<slug>.manifest.internal.
# Additive, like EDGE_IP: Valet keeps 127.0.0.1 and `make host-undo` removes both.
PUBLIC_EDGE_IP="127.0.0.3"
```

- [ ] **Step 2: The bundled `sudo` script — write it, then ASK**

```bash
#!/usr/bin/env bash
# THE ONE PRIVILEGED STEP P6a ADDS, run as: sudo bash infra/host/p6a-second-address.sh
#
# It adds a SECOND loopback alias, 127.0.0.3, which §12's public listener binds. It is
# additive and it is reversible: `make host-undo` removes both aliases and asserts it.
# LARAVEL VALET IS NOT TOUCHED — it holds 127.0.0.1:80 and :443 and neither address is its.
set -euo pipefail
cd "$(dirname "$0")/../.."
. infra/lib/common.sh
[ "$(id -u)" -eq 0 ] || { echo "run via: sudo bash infra/host/p6a-second-address.sh"; exit 1; }

if ifconfig lo0 | grep -q "inet $PUBLIC_EDGE_IP"; then
  echo "1/1  $PUBLIC_EDGE_IP already on lo0"
else
  ifconfig lo0 alias "$PUBLIC_EDGE_IP" up
  echo "1/1  added $PUBLIC_EDGE_IP to lo0"
fi
ifconfig lo0 | grep 'inet '
echo
echo "Done. Both addresses should be listed above. Verify with: make doctor"
```

**Then stop and ask Rich to run it.** Say what it does, that it is additive, that Valet is untouched, and that `make host-undo` reverses it. **Nothing else in this task can be checked until it has run.**

- [ ] **Step 3: `ensure-alias.sh` re-adds BOTH, because neither survives a reboot**

```bash
# infra/lib/ensure-alias.sh — replace the single-address body with a loop over both.
missing=""
for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do
  ifconfig lo0 | grep -q "inet $ip" || missing="$missing $ip"
done
[ -z "$missing" ] && exit 0

cat <<EOS
These loopback aliases are missing:$missing
They are lost on every reboot, and Caddy cannot bind its listeners without them.
Running:

$(for ip in $missing; do echo "    sudo ifconfig lo0 alias $ip up"; done)

This is additive: Laravel Valet keeps 127.0.0.1:80 and :443 untouched, and
\`make host-undo\` removes them again.
EOS
for ip in $missing; do sudo ifconfig lo0 alias "$ip" up; done
ifconfig lo0 | grep 'inet '
```

**`$missing` is unquoted in the two loops deliberately** — it is a space-separated list and word splitting is the mechanism. macOS ships bash 3.2: no arrays needed, and none used.

- [ ] **Step 4: `host-setup.sh` step 1 adds both; `host-undo.sh` removes both AND ASSERTS IT**

```bash
# host-setup.sh, step 1 — replace the single if/else with the same loop shape:
for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do
  if ifconfig lo0 | grep -q "inet $ip"; then echo "1/3  $ip already on lo0"
  else ifconfig lo0 alias "$ip" up; echo "1/3  added $ip to lo0"; fi
done
```

```bash
# host-undo.sh — the removal, and then the ASSERTION, because this file's own comment
# records that an exit status inherited from `grep -c` reported a perfect teardown as
# `Error 1`. An exit status is asserted, never inherited.
for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do ifconfig lo0 -alias "$ip" 2>/dev/null; done
…
for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do
  if ifconfig lo0 | grep -q "inet $ip"; then
    echo "STILL PRESENT  $ip on lo0"; failed=1
  else
    echo "removed        $ip from lo0"
  fi
done
```

- [ ] **Step 5: The dnsmasq split — the host process only**

**The container-side process is NOT split** (Decision 15 and `[M5](c)`): both servers live in one container at `10.89.0.10`, and the probe reaches the public one by port. **Only `dns-host` changes.**

```yaml
  dns-host:
    …
    command:
      - --keep-in-foreground
      - --no-daemon
      - --log-queries
      - --no-resolv
      - --listen-address=10.89.0.54
      - --bind-interfaces
      - --local=/manifest.internal/
      # §12's TWO LISTENERS, made real on the host (P6a, R3). The zones are NESTED and
      # PRODUCTION IS THE PARENT — `manifest.internal` contains `staging.` and `sandbox.`
      # AND `console.` AND `idp.` — so the parent rule below would move the console and the
      # IdP onto the public address if the four more-specific rules did not pin them back.
      # A plan that says "point the production zone at the new alias" takes the console
      # down; measured on a throwaway resolver before this file was touched (P6a `[M5](b)`).
      - --address=/manifest.internal/127.0.0.3
      - --address=/staging.manifest.internal/127.0.0.2
      - --address=/sandbox.manifest.internal/127.0.0.2
      - --address=/console.manifest.internal/127.0.0.2
      - --address=/idp.manifest.internal/127.0.0.2
```

**The addresses are literals here, not `${…}` interpolations**, for the same reason every other address in this file is: `compose.yaml` is read by Docker and by a human, and a variable that is unset renders as an empty address which dnsmasq accepts. **`make verify` holds the literals equal to `common.sh`'s constants**, which is Task 3's check and is where a drift is caught.

**`make up` after this recreates `manifest-dns-host` — and a `compose.yaml` change recreates `manifest-caddy` too, dropping every runtime route** (*Read this first* 9). Expect it, and restart the control plane at the end of the sitting.

- [ ] **Step 6: Two checks in `make doctor`, watched failing**

```bash
# scripts/doctor.sh — beside the existing alias check
check_aliases() {
  for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do
    ifconfig lo0 | grep -q "inet $ip" \
      || { echo "$ip not on lo0 — Docker will refuse to bind Caddy. Lost on every reboot; \`make up\` re-adds it."; return 1; }
  done
  echo "$EDGE_IP and $PUBLIC_EDGE_IP present on lo0"
}
check "both loopback aliases exist"  check_aliases

# And the split's HOST answer — the half that would take the console down if it regressed.
check_zone_split() {
  local app internal
  app="$(dig +short "split-probe.$ZONE" @127.0.0.1 -p 7153 | head -1)"
  internal="$(dig +short "$CONSOLE_HOST" @127.0.0.1 -p 7153 | head -1)"
  [ "$app" = "$PUBLIC_EDGE_IP" ] || { echo "a production name answers ${app:-<nothing>}, want $PUBLIC_EDGE_IP"; return 1; }
  [ "$internal" = "$EDGE_IP" ] || { echo "$CONSOLE_HOST answers ${internal:-<nothing>}, want $EDGE_IP — the console is on the PUBLIC address"; return 1; }
  echo "production=$app  console=$internal  (nested zones, pinned back)"
}
check "the production zone answers the public address, and the console does not"  check_zone_split
```

**Both directions matter and the second is the one that earns its place**: a check that only asserts the production answer stays green while the console has moved.

- [ ] **Step 7: Run the gates, and watch both checks fail**

```bash
make up                 # recreates dns-host and caddy; read its output
make doctor             # expect 20 checks now, 0 failed — RECORD THE NEW NUMBER
make verify             # expect 51/0 still; a change here is a finding
```

**Then break each and watch it:**

| | Control | Predicted |
|---|---|---|
| a | `sudo ifconfig lo0 -alias 127.0.0.3` (Rich's — it is a host change) | `make doctor` red: *"127.0.0.3 not on lo0"* |
| b | remove the `console.manifest.internal` pin-back from `compose.yaml`, `make up` | `make doctor` red: *"console.manifest.internal answers 127.0.0.3 … the console is on the PUBLIC address"* |
| c | remove the `--address=/manifest.internal/127.0.0.3` rule, `make up` | `make doctor` red on the first half: *"a production name answers 127.0.0.2, want 127.0.0.3"* |

**(a) is Rich's**, because removing a loopback alias needs `sudo`; hand him the two commands and take the answer. **(b) and (c) are yours.** Restore with `git checkout infra/compose.yaml && make up` after each, and **re-run `make doctor` to prove the restore took** — a `git checkout` of a bind-mounted file leaves the container on the deleted inode (*Read this first* 10).

- [ ] **Step 8: Commit**

```bash
git add infra/ scripts/doctor.sh docs/superpowers/RUNBOOK.md
git commit -m "feat(infra): a second loopback address and the nested-zone DNS split (§12, R3)"
```

---

## Task 3: The second Caddy server — `srv1`, and the production wildcard site

> ### [M5] Correction block — EXECUTED 2026-09-19. Moving the wildcard takes `edge.manifest.internal` with it.
>
> *ONE point, and it fails at the TLS handshake rather than with an HTTP status, which is the
> expensive kind. Evidence in [`spikes/p6a-baseline/`](../spikes/p6a-baseline/README.md),
> `[M5](a)` and `(b)`.*
>
> **What this task said:** move `*.manifest.internal` from the `srv0` block to the new `:8443`
> block, leaving `*.staging.` and `*.sandbox.` on `srv0`.
>
> **What the measurement found:** `edge.manifest.internal` has **no explicit site** in the
> Caddyfile — only `idp.` and `console.` do — so it is served today **by that wildcard**.
> Containers resolve the whole zone, production included, to `10.89.0.10`, which is `srv0`. With
> the wildcard moved, srv0 has no site matching that Host, and a container asking for one gets
> **`curl: (35) TLS connect error … tlsv1 alert internal error`** — Caddy cannot produce a
> certificate, so it never reaches HTTP. Measured against an unmatched Host on srv0 today, with
> `edge.manifest.internal` answering `200` through the wildcard as the control. **`make verify`
> has a check for exactly this** (*"a container reaches https://edge.manifest.internal with the
> platform CA"*) and it would go red in sitting 2.
>
> **What this task now does:** give `edge.manifest.internal` **its own site on `srv0`**, beside
> `console.` and `idp.`, in the same edit that moves the wildcard — it is a platform surface,
> not a faculty app, and it belongs on the internal listener for the same reason they do. Task 2
> pins it back in DNS. **Predict which `make verify` check moves and watch it**, per *Read this
> first* 12.
>
> **The rest of this task is bought and works.** A second server in the one container: `PUT
> /config/apps/http/servers/srv1` answered **200** (status asserted), keys read back
> `["srv0","srv1"]`, and `srv1` genuinely listened — `manifest-caddy:8443` answered from the
> platform network. `DELETE` restored `["srv0"]` and `:8443` then refused.


**Files:**
- Modify: `infra/compose.yaml` — caddy publishes `127.0.0.3:443` → container `8443`
- Modify: `infra/caddy/Caddyfile` — a site bound to `:8443`, and the production wildcard moved to it
- Modify: `packages/control-plane/src/config.ts` — `MANIFEST_CADDY_SERVER_PUBLIC` default becomes `srv1`
- Modify: `scripts/verify.sh` — three checks
- Test: `packages/control-plane/src/routing/listener-split.docker.test.ts` — NEW, and Task 4 extends it

**Interfaces:**
- Consumes: Task 2's `PUBLIC_EDGE_IP`, and `[M5](a)`'s measured answer that one container can hold two servers.
- Produces: an edge with **two** servers; `config.caddy.servers.public === 'srv1'`; and the container-side fact that the public server answers on `:8443`, which Task 4's probe needs.

- [ ] **Step 1: Publish the second address**

```yaml
    ports:
      # Real 80/443 on the INTERNAL loopback alias (sandbox and staging, and the console
      # and the IdP). Valet keeps 127.0.0.1:80 and :443 and neither is aware of the other.
      - "127.0.0.2:80:80"
      - "127.0.0.2:443:443"
      # §12's PUBLIC listener (P6a, R3): production only, on its own address so the
      # faculty-facing URL carries no port. `srv1` binds :8443 INSIDE the container —
      # two servers in one container, because a second container means a second
      # caddy-data volume, a second internal CA, and every certificate the developer
      # trusted being wrong.
      - "127.0.0.3:443:8443"
      - "127.0.0.1:7119:2019"
```

- [ ] **Step 2: The Caddyfile's second site**

```
# §12's PUBLIC listener. PRODUCTION ONLY, and the ONLY site bound to :8443 — which is what
# makes "a route bound to the wrong listener is simply unreachable" true on this machine
# rather than merely modelled (§21's divergence 2, rewritten by P6a; see Spec action 1).
#
# The address prefix is what puts this site on its own server: Caddy groups sites by their
# listening address, so every site here becomes `srv1` and every site without a prefix stays
# on `srv0`. The control plane addresses them by those names through the admin API, and
# `MANIFEST_CADDY_SERVER_PUBLIC` is the one setting that says which is which.
#
# THE PRODUCTION WILDCARD MOVED HERE FROM THE srv0 BLOCK BELOW. `*.manifest.internal` is the
# production zone (config.ts: MANIFEST_ZONE_PRODUCTION), and leaving it on srv0 would mean a
# production hostname answering on the INTERNAL address — the exact leak this split exists to
# refuse. `*.staging.` and `*.sandbox.` stay on srv0.
https://*.manifest.internal:8443 {
	tls internal
	respond "manifest OK host={host} scheme={scheme} remote={remote_host} listener=public" 200
}
```

**And the `srv0` wildcard loses the production zone:**

```
# §23's internal zones. The production zone is NOT here — it is on :8443 above.
*.sandbox.manifest.internal, *.staging.manifest.internal {
	tls internal
	respond "manifest OK host={host} scheme={scheme} remote={remote_host} listener=internal" 200
}
```

**The two placeholders now differ by one word, and that word is the measurement.** A response body saying `listener=internal` for a production hostname is the leak, visible without reading a config.

**`console.manifest.internal` and `idp.manifest.internal` keep their own sites on `srv0`** — they are more specific than any wildcard and Caddy prefers the more specific site, which is why they were separate blocks in the first place.

- [ ] **Step 3: The control plane learns the second server's name**

```ts
  // §12 meets "staging is UBC-only" by LISTENER ASSIGNMENT, not IP allowlisting: a
  // misconfigured allowlist leaks quietly, a route on the wrong listener is simply
  // unreachable. TWO SETTINGS rather than a derivation, so UBC infrastructure enforces the
  // split by configuration and not by a code change.
  //
  // Both were `srv0` until P6a (R3), and §21's divergence 2 said so. They are now two
  // servers in one edge container: `srv0` on the internal address, `srv1` on the public one.
  MANIFEST_CADDY_SERVER_INTERNAL: z.string().min(1).default('srv0'),
  MANIFEST_CADDY_SERVER_PUBLIC: z.string().min(1).default('srv1'),
```

**`upstreamsInUse` already dedupes the server names** *"because both listeners are `srv0` on the laptop"* (`routing/routes.ts:182`). **That comment stops being true here.** Correct it — the `new Set` is still right, because two names now genuinely mean two reads and the Set is what makes one address counted once — and **say what changed**, so the next reader does not delete a line whose reason has moved.

- [ ] **Step 4: Three checks in `make verify`**

```bash
# 1. The edge has two servers, and they are the ones config.ts names.
check_two_servers() {
  local keys; keys="$(curl -sS http://127.0.0.1:$PORT_CADDY_ADMIN/config/apps/http/servers | jq -r 'keys|join(",")')"
  [ "$keys" = "srv0,srv1" ] || { echo "the edge has servers [$keys], want srv0,srv1"; return 1; }
  echo "servers=$keys"
}
check "the edge serves two listeners, internal and public"  check_two_servers

# 2. The public address answers, and says which listener it is.
check_public_listener() {
  local body; body="$(curl -sS --cacert "$CA_FILE" --resolve "edge.$ZONE:443:$PUBLIC_EDGE_IP" "https://edge.$ZONE/")"
  case "$body" in *listener=public*) echo "$body"; return 0 ;; esac
  echo "the public address answered: $body"; return 1
}
check "the public listener answers on $PUBLIC_EDGE_IP"  check_public_listener

# 3. THE ONE THAT WOULD CATCH A LEAK: the same name on the INTERNAL address must NOT be
#    answered by the public server — and a staging name must not be answered by srv1.
check_no_crossover() {
  local prod_internal stg_public
  prod_internal="$(curl -sS --cacert "$CA_FILE" --resolve "edge.$ZONE:443:$EDGE_IP" "https://edge.$ZONE/" || true)"
  stg_public="$(curl -sS --cacert "$CA_FILE" --resolve "x.staging.$ZONE:443:$PUBLIC_EDGE_IP" "https://x.staging.$ZONE/" || true)"
  case "$prod_internal" in *listener=public*) echo "a production name is answered by the PUBLIC server on the internal address"; return 1 ;; esac
  case "$stg_public" in *listener=internal*) echo "a staging name is answered by the INTERNAL server on the public address"; return 1 ;; esac
  echo "no crossover: internal='$prod_internal' public='$stg_public'"
}
check "neither listener answers for the other's zone"  check_no_crossover
```

**`--resolve`, not `--connect-to`**: the Host header must stay the hostname or the wrong site matches, and `--resolve` is what the rest of `verify.sh` already uses.

- [ ] **Step 5: The Docker test — the claim, not the configuration**

**Files:** `packages/control-plane/src/routing/listener-split.docker.test.ts`

```ts
/**
 * §12: "The staging-is-UBC-only requirement is met by listener assignment, not IP
 * allowlisting: a misconfigured allowlist leaks quietly, whereas a route bound to the
 * wrong listener is simply unreachable."
 *
 * THIS IS THE FIRST TEST IN THE REPOSITORY THAT COULD EVER HAVE FAILED FOR THAT REASON.
 * Both listeners were `srv0` until P6a, so the claim was modelled and untested (§21's
 * divergence 2). It asserts the SHAPE OF THE ANSWER and not a status: the edge's wildcard
 * answers 200 for any name in the zone, so `200` proves nothing and the placeholder's own
 * `listener=` word is what distinguishes them.
 */
it('a production hostname is answered by the public server and not by the internal one', …)
it('a staging hostname is answered by the internal server and not by the public one', …)
```

Both run `curl` through a throwaway container on `manifest-platform`, exactly as `routing/edge-source-refusal.docker.test.ts` does — **that file is the pattern to copy**, because it proves a causal claim against a real edge without weakening the running one.

- [ ] **Step 6: Gates, and the controls**

**`pnpm test:docker` is OWED** — this task changes `infra/` and adds a `*.docker.test.ts`. Expect the count to rise by two; **predict the new number before you run it.**

| | Control | Predicted |
|---|---|---|
| a | the `:8443` site removed from the Caddyfile, `make up` | `make verify` red on *the public listener answers* **and** *two listeners*; the new Docker test red on both cases |
| b | the production wildcard moved back onto `srv0` | `make verify` red on *no crossover*: *"a production name is answered by the INTERNAL server"*; the Docker test red on its first case only |
| c | `MANIFEST_CADDY_SERVER_PUBLIC=srv0`, control plane restarted | **nothing in this task goes red** — it is Task 4's control, and saying so here is what stops it being mistaken for coverage |

**(c) is the honest statement of this task's limit**: Task 3 makes the two servers exist; **nothing yet writes a route to the right one**, and that is Task 4.

- [ ] **Step 7: Commit**

```bash
git add infra/ packages/control-plane/src/config.ts packages/control-plane/src/routing/ scripts/verify.sh
git commit -m "feat(routing): a public listener on srv1, and the production zone moved to it (§12, R3)"
```

**Restart the control plane at the end of the sitting** — the `compose.yaml` change recreated `manifest-caddy` and every runtime route is gone until it boots.

---

## Task 4: A production route goes on the public listener — and staging cannot reach it

> ### [M5] Correction block — EXECUTED 2026-09-19. The probe port is real work, and nothing unit-tests two servers.
>
> *TWO points; evidence in [`spikes/p6a-baseline/`](../spikes/p6a-baseline/README.md), `[M5](c)`.*
>
> **1. Decision 15's probe port is confirmed, and so is the safety claim under it.** A container
> on `manifest-platform` with `--dns 10.89.0.53` reaches `https://demo-app.manifest.internal/`
> at **`10.89.0.10:443` — srv0, the internal server** — and `:8443` **is** reachable from that
> same network. So a production probe without the port lands on the wrong listener, and
> `waitForIdentity` refuses it loudly: `routing/readiness.ts:98-102` rejects a `200` carrying no
> `X-Manifest-Instance` with *"that is the edge's wildcard, not a routed app"*, read and
> confirmed. `edgeIdentityProbe`'s options object is `{ network?, dnsServer? }` — `port` joins
> those two.
>
> **2. `upstreamsInUse` survives the split, but no test exercises it.** `routing/routes.ts:185`
> iterates `new Set(Object.values(deps.servers))`, so two distinct names simply produce two
> iterations — *Read this first* 7 confirmed. **But `routing/routes.test.ts:11` fixes
> `SERVERS = { internal: 'srv0', public: 'srv0' }`**, so the two-server path has no unit
> coverage at all today. Add a case with two distinct server names, or the split's one piece of
> pure logic ships untested.


**§12's fail-closed claim, watched failing, on the only machine that exists.** Task 3 made two servers; this task makes the platform *write to the right one* and makes the readiness probe able to see the result.

**Files:**
- Modify: `packages/control-plane/src/routing/readiness.ts` — `edgeIdentityProbe` and `edgeProbe` gain an optional `port` (Decision 15)
- Modify: `packages/control-plane/src/runtime/docker/driver.ts` — the probe is given the public port for a production instance
- Modify: `packages/control-plane/src/config.ts` — `MANIFEST_EDGE_PUBLIC_PORT`, default `8443`
- Modify: `packages/control-plane/src/routing/listener-split.docker.test.ts` — the real-route cases
- Test: the same file, plus `routing/routes.test.ts` for the server-name selection

**Interfaces:**
- Consumes: `config.caddy.servers.public` (Task 3), `[M5](c)`'s measured container-side answer.
- Produces: `applyRoute` writing a production route to `srv1`; `edgeIdentityProbe(engine, hostname, healthPath, caCertPath, { port })`; and the fact Task 15 rests on — **a production deploy's readiness check can succeed**.

- [ ] **Step 1: The probe learns a port**

```ts
/**
 * Asks the public hostname WHO answered.
 *
 * `port` is §12's PUBLIC LISTENER, and it is a port in a PROBE URL and never in a
 * faculty-facing one (P6a Decision 15). The reason is the container side: both Caddy
 * servers live in one container at 10.89.0.10, and `manifest-dns-containers` answers that
 * one address for the whole zone — so a production app's probe would otherwise arrive at
 * `manifest-caddy:443`, the INTERNAL server, and find no route there. The host's split is
 * by ADDRESS (Task 2); the container's is by PORT, and only the probe uses it.
 *
 * Absent for everything on the internal listener, which is every sandbox and staging app.
 */
export function edgeIdentityProbe(
  engine: EngineClient,
  hostname: string,
  healthPath: string,
  caCertPath: string,
  options: { network?: string; dnsServer?: string; port?: number } = {},
): () => Promise<IdentityProbeResult> {
  return async () => {
    const authority = options.port === undefined ? hostname : `${hostname}:${options.port}`
    const out = await curlThroughEdge(
      engine,
      caCertPath,
      `%{http_code}\n%header{${INSTANCE_HEADER.toLowerCase()}}\n`,
      `https://${authority}${healthPath}`,
      options,
    )
    …unchanged…
  }
}
```

**`curlThroughEdge` needs no change** — it already takes the whole URL and `options` passes straight through; **the `port` key is simply ignored by the container body**, which is correct and is worth a line saying so, because the next reader will look for where it is used.

**The certificate still verifies.** The edge serves one wildcard certificate per zone from its own internal CA and a port does not appear in a certificate, so `--cacert` keeps working. **`[M5](c)` measured this with `--insecure`; this step does not** — a probe that skips verification passes against the wrong certificate, which is what P3 Task 14 paid for.

- [ ] **Step 2: The driver passes it for production and only for production**

```ts
      const verified = await waitForIdentity({
        url: handle.url,
        expected: spec.instanceId,
        probe: edgeIdentityProbe(engine, spec.hostname, spec.healthPath, options.caCertPath, {
          dnsServer: options.dnsServer,
          // §12's public listener. Conditional spread, not `port: cond ? n : undefined`:
          // exactOptionalPropertyTypes is on and the second form is a type error.
          ...(spec.environmentKind === 'production' ? { port: options.publicEdgePort } : {}),
        }),
        timeoutMs: IDENTITY_TIMEOUT_MS,
        intervalMs: 500,
      })
```

**`options.publicEdgePort` comes from config**, not a literal: `MANIFEST_EDGE_PUBLIC_PORT: z.coerce.number().int().positive().default(8443)`, and `infra/compose.yaml`'s `127.0.0.3:443:8443` is the other half. **`make verify` holds them equal** — add that to Task 3's check-2 rather than trusting two files to agree.

- [ ] **Step 3: The Docker test, with a REAL route on each listener**

```ts
/**
 * Task 3 proved the two servers exist and answer differently. THIS proves the platform
 * writes an app's route to the right one — which is the claim §12 actually makes, and
 * which nothing could test while both names were `srv0`.
 *
 * ASSERT THE SHAPE OF THE ANSWER. The edge's wildcard answers 200 for any name in the
 * zone, so `expect(status).toBe(404)` for the wrong listener would be WRONG in the
 * expensive direction — it answers 200, from the placeholder. `X-Manifest-Instance` is
 * what a ROUTE sets and the wildcard does not (P4b finding 193).
 */
it('a production route is reachable on the public listener AS THE INSTANCE', async () => {
  await applyRoute(routing, { hostname: prodHost, upstream, kind: 'production', instanceId })
  const onPublic = await probeThrough({ host: prodHost, port: 8443 })
  expect(onPublic.status).toBe(200)
  expect(onPublic.instance).toBe(instanceId)          // a ROUTE answered, not the wildcard
})

it('and the SAME hostname on the internal listener reaches the wildcard, not the app', async () => {
  const onInternal = await probeThrough({ host: prodHost })          // :443, srv0
  // 200 — the wildcard answers for any name in the zone. The POINT is that it carries no
  // instance header, which is the only thing that distinguishes "routed" from "answered".
  expect(onInternal.instance).toBeUndefined()
  expect(onInternal.body).toContain('listener=internal')
})

it('and a STAGING route is the mirror image', async () => { … })
```

**`probeThrough` is `edgeIdentityProbe` with a body read added**, defined once at the top of the file. **Three cases, not two**, because a test that only looks at production passes on a platform where every route goes to `srv1`.

- [ ] **Step 4: The unit half — which server name is chosen**

`routing/routes.test.ts` already exercises `applyRoute` against a fake `CaddyClient`. **Add the assertion that has been unmakeable until now:**

```ts
it('writes a production route to the PUBLIC server and a staging route to the internal one', async () => {
  const servers = { internal: 'srv0', public: 'srv1' }
  await applyRoute({ caddy, servers }, { ...spec, kind: 'production' })
  expect(caddy.putRoute).toHaveBeenCalledWith('srv1', expect.anything())
  await applyRoute({ caddy, servers }, { ...spec, hostname: 'other.staging.x', kind: 'staging' })
  expect(caddy.putRoute).toHaveBeenCalledWith('srv0', expect.anything())
})
```

**And `upstreamsInUse` must still read both**, which the `new Set` already does — assert it with two distinct names, because the dedupe was written when they were the same and nothing has ever exercised the other branch.

- [ ] **Step 5: Gates and controls**

**`pnpm test:docker` is OWED.** Predict the count before running it.

| | Control | Predicted |
|---|---|---|
| a | `MANIFEST_CADDY_SERVER_PUBLIC=srv0`, control plane restarted, Docker tier re-run | the production case red: *"the edge answered 200 with no X-Manifest-Instance — that is the edge's wildcard, not a routed app"* — **the message `waitForIdentity` already writes**, which is why this fails loudly |
| b | the `port` spread removed from the driver | the same test red for the same reason, and **a real production deploy in Task 15 would hang for `IDENTITY_TIMEOUT_MS` and then roll its route back** — say so in the record, because that is the failure mode a future reader will meet |
| c | `expect(onPublic.instance).toBe(instanceId)` weakened to `expect(onPublic.status).toBe(200)` | **GREEN with the route on the wrong server.** Run it, watch it pass, and restore — **this is the control that proves the assertion is about the shape of the answer and not about a status** |

**(c) is the most important control in this task** and it is the one that will be skipped. Do not skip it.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/routing packages/control-plane/src/runtime/docker/driver.ts packages/control-plane/src/config.ts scripts/verify.sh
git commit -m "feat(routing): production routes go on the public listener, and the probe can see them"
```

---

## Task 5: Migration 0019 — `approvals`, `iam_registrations`, `privacy_assessments`, and their state machines

> ### [M10] Correction block — EXECUTED 2026-09-19. **Do NOT append the CHECK. Drizzle writes it, and appending breaks 0019.**
>
> *THE MOST EXPENSIVE CORRECTION THIS SITTING FOUND, and it is measured rather than reasoned;
> evidence in [`spikes/p6a-baseline/`](../spikes/p6a-baseline/README.md), `[M10]`/F1.*
>
> **What this task said:** *"Read `drizzle/0019_*.sql`. Drizzle will NOT have written the
> `audit.events` CHECK — it is not expressed in `schema.ts`. APPEND, in the same file:"*.
>
> **What the measurement found: both clauses are false.** The constraint **is** expressed in
> `schema.ts` — `db/schema.ts:520-523`, a `check('events_type_known', …)` in the table's extra
> config, with a comment saying it is written out there on purpose — and the drizzle snapshot
> tracks it (`0018_snapshot.json` → `audit.events -> ['events_type_known']`). One event type was
> added to that check and `drizzle-kit generate` was run; it emitted, unprompted:
>
> ```sql
> ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known";--> statement-breakpoint
> ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK (… , 'm10.probe'));
> ```
>
> **So appending would put a SECOND `ADD CONSTRAINT "events_type_known"` in a file that already
> has one, and migration 0019 would fail to apply** with *constraint … already exists* — after
> its three `CREATE TABLE`s had run. ORIENTATION §4 records what that costs: *"An applied
> migration that is missing a line is REPLAYED, not patched."*
>
> **What this task now does:** add the five new event types to **`EVENT_TYPES` in
> `observability/events.ts` AND to `schema.ts`'s `check(...)` list**, then run
> `drizzle-kit generate` and **READ** the migration it writes to confirm the DROP/ADD pair is
> there. Append nothing.
>
> **And *Read this first* 16's premise is wrong too, in the reassuring direction.** It says
> *"nothing asserts the two lists agree"* and that a missing rewrite fails at runtime *"with
> every unit test green"*. **`observability/events.test.ts:283` asserts exactly that**, reading
> `pg_get_constraintdef` out of Postgres and comparing it with `EVENT_TYPES` — in the **unit**
> tier, in `pnpm test`. All three lists read **21** today and two `diff`s confirmed they are
> identical. The guard the plan asks for already exists; do not build a second one.


**Files:**
- Modify: `packages/control-plane/src/db/schema.ts` — three tables, two enums, one decision enum
- Create: `packages/control-plane/drizzle/0019_*.sql` — generated, then **read and edited to rewrite the `audit.events` CHECK**
- Create: `packages/control-plane/src/launch/transitions.ts` — `iamTransition`, `piaTransition`, pure and table-driven
- Create: `packages/control-plane/src/launch/transitions.test.ts`
- Modify: `packages/control-plane/src/observability/events.ts` — five new `EVENT_TYPES`
- Modify: `packages/control-plane/src/observability/event-schemas.ts` — a payload schema per new type
- Modify: `packages/control-plane/src/launch/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `iamRegistrations`, `privacyAssessments`, `approvals` (Drizzle tables); `IamState`, `PiaState`; `iamTransition(from, to): IamState`, `piaTransition(from, to): PiaState`, both throwing `LaunchTransitionError`; **`LaunchRecordError`**, which Task 6 throws; and five event types the CHECK constraint accepts.

> **WHERE A MODULE'S ERRORS LIVE, because getting this wrong is a cycle rather than a style
> point.** `launch/` must not import `api/`'s `BadRequestError`: `api/routes/` imports
> `launch/`, so the dependency runs the other way. The codebase's pattern is a class **in the
> module that owns the rule**, carrying a `code`, mapped by `instanceof` in `api/errors.ts`
> and registered once in `api/error-codes.ts` — exactly how `ReleaseError`, `SourceError`,
> `ConfigError`, `SlugRefusedError` and `SsoError` already work. **So both classes live in
> `launch/`**, both get a family (`LaunchError`) in `error-codes.ts`, and `api/errors.ts`
> gains one `instanceof` branch answering **409** for a transition and **400** for an invalid
> record. `error-codes.test.ts` holds the registry to the source in BOTH directions, so a
> code listed here that nothing throws is a red gate.

- [ ] **Step 1: The two enums and the three tables**

```ts
/** §9: `draft → submitted → active`, plus `change_requested` and `expired` (D19, D20). */
export const iamRegistrationState = pgEnum('iam_registration_state', [
  'draft', 'submitted', 'active', 'change_requested', 'expired',
])
/** §9: `draft → submitted → approved`. Three, and deliberately no rejection state — a
 *  refused PIA goes back to `draft` with the reviewer's note, which is what the Privacy
 *  Office actually does. */
export const privacyAssessmentState = pgEnum('privacy_assessment_state', [
  'draft', 'submitted', 'approved',
])

/**
 * §6's `IamRegistration`. **P6a tracks it; P8 GENERATES what it carries** (R1) — so
 * `entity_id`, `acs_url`, `slo_url` and `registered_attributes` are recorded by an
 * administrator from what UBC IAM actually registered, not derived here. §9: the entityID
 * "is fixed at registration and stored on the IamRegistration rather than recomputed",
 * which is also why **the project slug is immutable after production launch**.
 */
export const iamRegistrations = pgTable(
  'iam_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // ONE per project (§9: one registration per production app).
    projectId: uuid('project_id').notNull().unique()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityId: text('entity_id').notNull(),
    acsUrl: text('acs_url').notNull(),
    sloUrl: text('slo_url').notNull(),
    certFingerprint: text('cert_fingerprint'),
    /** D20: an unnoticed expiry silently kills login for a live course app mid-term. */
    certExpiresAt: timestamp('cert_expires_at', { withTimezone: true }),
    /**
     * WHAT UBC IAM ACTUALLY REGISTERED. §7's last production clause compares a release's
     * `auth.attributes` against this and fails the BUILD (Task 13). `string[]`, not a
     * typed union, because `db/` must not import `spec/` — the dependency runs the other
     * way and the list is validated where it is written.
     */
    registeredAttributes: jsonb('registered_attributes').notNull().$type<string[]>(),
    state: iamRegistrationState('state').notNull().default('draft'),
    /** §15's submission-state hook: "a human submits and pastes a ticket reference". */
    externalTicketRef: text('external_ticket_ref'),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * §9 measured the fail-open case and it is not theoretical: SimpleSAMLphp treats an
     * empty attribute list and a missing one identically and releases EVERYTHING. The same
     * emptiness here would make Task 13's subset check vacuously true — every set is a
     * superset of nothing — so **the database refuses the half-written row**, exactly as
     * §9 asks registration to.
     */
    check('iam_registrations_attributes_present', sql`jsonb_array_length(${t.registeredAttributes}) > 0`),
  ],
)

/** §6's `PrivacyAssessment`. P6a tracks it; P8 generates the draft (R1). */
export const privacyAssessments = pgTable('privacy_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** P8's output. Null here, always, and the column exists so P8 adds no migration. */
  generatedDraft: jsonb('generated_draft'),
  state: privacyAssessmentState('state').notNull().default('draft'),
  reviewer: text('reviewer'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  externalTicketRef: text('external_ticket_ref'),
  recordedBy: uuid('recorded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const approvalDecision = pgEnum('approval_decision', ['approved', 'rejected'])

/**
 * §6's `Approval`, and §13's *Integrity of the gate*: "a non-repudiable record: actor,
 * timestamp, and the exact diff shown at decision time."
 *
 * **IT BINDS A DIGEST, NOT A TAG, AND NOT ONLY A RELEASE ID.** §13: "Binding to a tag would
 * let a later push silently replace approved content." The release id alone would be a
 * binding to a row whose build could be rebuilt — so `image_digest` is stored here, on the
 * approval, and Task 15 verifies it against the build immediately before deploying.
 * Decision 11: a new build is a new digest and therefore has no approval.
 *
 * NO UNIQUE CONSTRAINT ON release_id. A release can be approved, rejected, and approved
 * again — the queue is a history and §13 wants the record, not the latest answer. What
 * reads it takes the newest row by `decided_at`.
 */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    decision: approvalDecision('decision').notNull(),
    decidedBy: uuid('decided_by').notNull().references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    /** THE BINDING. Verified before anything starts (§13, Task 15). */
    imageDigest: text('image_digest').notNull(),
    /** Why, in the administrator's own words. Required on a rejection; optional otherwise. */
    reason: text('reason'),
    /** Decision 6: the RENDERED diff, at decision time. Never a reference recomputed later. */
    diffSnapshot: jsonb('diff_snapshot').notNull().$type<{
      imageDigest: string
      changes: { path: string; from: string; to: string; summary: string }[]
      services: string[]
      attributes: string[]
      resources: Record<string, string | number | null>
      /** Decision 7: null when the model could not be reached. NOT an empty string. */
      summary: string | null
      summarySource: 'llm' | 'unavailable' | 'no-previous-release'
      /** R4: the reviewer's verdict at decision time. `not_performed` until one lands. */
      review: { state: string; reviewer: string; detail: string }
    }>(),
  },
  (t) => [
    index('approvals_release_idx').on(t.releaseId),
    check('approvals_rejection_has_reason', sql`${t.decision} <> 'rejected' OR length(trim(coalesce(${t.reason}, ''))) > 0`),
  ],
)
```

**The `check` on a rejection's reason is the same shape `role_changes_reason_present` already uses** (migration 0013) — and it is here for the same reason: a refusal an agent or a person is told about, with no words in it, is a refusal nobody can act on (D23.7).

- [ ] **Step 2: Generate the migration, then READ IT and add the CHECK rewrite by hand**

```bash
pnpm --filter @manifest/control-plane db:generate
# Read drizzle/0019_*.sql. Drizzle will NOT have written the audit.events CHECK — it is not
# expressed in schema.ts. APPEND, in the same file:
```

```sql
--> statement-breakpoint
ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known";--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK ("audit"."events"."type" IN (
  'sso.registered', 'sso.acs_changed', 'build.started', 'build.succeeded', 'build.failed',
  'instance.provisioning', 'instance.starting', 'instance.healthy', 'instance.failed',
  'incident.opened', 'ai.key_rotated', 'instance.retiring', 'instance.retired',
  'instance.retire_failed', 'project.created', 'repository.seeded', 'spec.validated',
  'token.minted', 'pending_action.created', 'pending_action.confirmed', 'pending_action.rejected',
  'iam_registration.recorded', 'privacy_assessment.recorded', 'rehearsal.completed',
  'release.approved', 'release.approval_rejected'
));
```

**Copy the existing list from `0017_thin_snowbird.sql` rather than retyping it**, and **assert the two lists agree in a test**, because *Read this first* 16 says a mismatch fails at runtime with every unit test green:

```ts
// db/schema.test.ts — it already asserts other schema properties
it('every EVENT_TYPE is accepted by the events CHECK constraint', async () => {
  for (const type of EVENT_TYPES) {
    await expect(db.insert(events).values({ …, type })).resolves.toBeDefined()
  }
})
```

**That loop is the whole check**, and it is stronger than comparing two lists of strings: it asks the database.

- [ ] **Step 3: The transitions, as a table**

```ts
/**
 * §9's two state machines, as the ARROWS THAT EXIST rather than as a column anyone may set.
 *
 * Without this an administrator moves a PIA from `draft` straight to `approved` — the gate
 * is satisfied by something that was never submitted, and the only evidence is a typo. §13's
 * *Integrity of the gate* is about exactly this class of hole.
 *
 * PURE, and table-driven, so the arrows are readable as a fact rather than as control flow.
 * `launch/records.ts` is the caller and the tests drive these directly.
 */
const IAM_ARROWS: Record<IamState, readonly IamState[]> = {
  draft: ['submitted'],
  // §9: a registration can come back with questions, and it can lapse (D20's cert expiry).
  submitted: ['active', 'change_requested'],
  active: ['change_requested', 'expired'],
  change_requested: ['submitted', 'expired'],
  // Terminal. A lapsed registration is re-registered, which is a new submission.
  expired: ['submitted'],
}
const PIA_ARROWS: Record<PiaState, readonly PiaState[]> = {
  draft: ['submitted'],
  // §9 names no rejection state: a refused PIA goes back to draft with the note.
  submitted: ['approved', 'draft'],
  approved: ['draft'],
}

export class LaunchTransitionError extends Error {
  readonly code = 'LAUNCH_TRANSITION_INVALID'
  constructor(what: string, from: string, to: string, allowed: readonly string[]) {
    super(
      `a ${what} cannot go from '${from}' to '${to}' — from '${from}' it can only become ` +
        `${allowed.length === 0 ? 'nothing' : allowed.map((s) => `'${s}'`).join(' or ')}`,
    )
    this.name = 'LaunchTransitionError'
  }
}

export function iamTransition(from: IamState, to: IamState): IamState {
  if (!IAM_ARROWS[from].includes(to))
    throw new LaunchTransitionError('IAM registration', from, to, IAM_ARROWS[from])
  return to
}
// piaTransition is the same shape over PIA_ARROWS. WRITTEN OUT, not generated from a
// higher-order helper: two tiny functions read better than one generic one, and the error
// messages differ in the noun a person sees.
export function piaTransition(from: PiaState, to: PiaState): PiaState { … }
```

- [ ] **Step 4: The tests, with the positive control beside every refusal**

```ts
describe('§9’s IAM registration states', () => {
  it('walks the happy path: draft → submitted → active', () => {
    expect(iamTransition('draft', 'submitted')).toBe('submitted')
    expect(iamTransition('submitted', 'active')).toBe('active')
  })
  it('refuses draft → active, which is the arrow that would satisfy the gate by typo', () => {
    expect(() => iamTransition('draft', 'active')).toThrow(/cannot go from 'draft' to 'active'/)
  })
  // THE CONTROL THAT MAKES THE REFUSALS MEAN SOMETHING (Global Constraints): a function that
  // threw for everything would pass every refusal test above. This is the pair.
  it('allows every arrow the table declares, and refuses every one it does not', () => {
    const states: IamState[] = ['draft','submitted','active','change_requested','expired']
    let allowed = 0, refused = 0
    for (const from of states) for (const to of states) {
      try { iamTransition(from, to); allowed++ } catch { refused++ }
    }
    expect(allowed).toBe(8)      // the arrows above, counted — a number, not a shape
    expect(refused).toBe(17)
  })
})
```

**The counted assertion is the one that could not be written as a refusal.** `8` and `17` are derived from `IAM_ARROWS` by hand; **if the table changes, this test goes red and that is correct** — the arrows are a design statement, not an implementation detail.

- [ ] **Step 5: Migrate, gate, commit**

```bash
pnpm --filter @manifest/control-plane db:migrate
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
```

| | Control | Predicted |
|---|---|---|
| a | one arrow removed from `IAM_ARROWS` | the happy-path test red **and** the counted test red (`8` → `7`) |
| b | `iamTransition` returns `to` unconditionally | every refusal test red, **and the counted test red at `refused: 0`** |
| c | a new `EVENT_TYPES` member without the CHECK rewrite | `schema.test.ts`'s loop red on the insert, with Postgres's own constraint name |
| d | `jsonb_array_length` check removed, an empty `registered_attributes` inserted | the insert succeeds where it should not — **and Task 13's subset test then passes vacuously**, which is the connection to record |

```bash
git add packages/control-plane/src/db packages/control-plane/drizzle packages/control-plane/src/launch packages/control-plane/src/observability
git commit -m "feat(launch): §6's three approval records, their state machines and five event types"
```

---

## Task 6: The two external records over the API — an administrator records what UBC said

**R1 made this P6a's rather than P8's, and the reason is the whole plan: without it the gate can only ever refuse, and P6a's end-to-end path — the place this project has found every one of its worst defects — is never exercised.**

**Files:**
- Create: `packages/control-plane/src/launch/records.ts` — read, upsert and transition both objects; **`LaunchRecordError`** lives here or beside `LaunchTransitionError`, never in `api/` (Task 5's note)
- Create: `packages/control-plane/src/launch/records.test.ts`
- Modify: `packages/control-plane/src/projects/authz.ts` — `launch:record`, granted to `PLATFORM_ADMIN` alone
- Modify: `packages/control-plane/src/api/routes/launch.ts` — four routes
- Modify: `packages/control-plane/src/api/representations/launch.ts` — `IamRegistration`, `PrivacyAssessment`
- Modify: `packages/control-plane/src/api/error-codes.ts`, `api/authz-contract.ts`
- Modify: `packages/contract/openapi.json` **via `pnpm contract:write`** — never by hand

**Interfaces:**
- Consumes: Task 5's tables and `iamTransition` / `piaTransition`.
- Produces: `getIamRegistration(db, projectId)`, `getPrivacyAssessment(db, projectId)` (both `| undefined`), `recordIamRegistration(db, bus, input)`, `recordPrivacyAssessment(db, bus, input)`; and four operations Task 7's gate and Task 17's screen consume.

- [ ] **Step 1: The capability, granted to one role and checked beside `requireSession`**

```ts
export const CAPABILITIES = [
  …
  'release:approve',
  /**
   * §9 and R1: recording what UBC IAM and the Privacy Office actually said. **External
   * state Manifest tracks and drives** (D19), so it is an administrator's and not an
   * owner's — a faculty member cannot assert that their own PIA was approved.
   *
   * **IT IS NOT ONE OF D24'S PRIVILEGED FOUR, AND SO `assertCapability` WILL NOT REFUSE A
   * TOKEN THAT HOLDS IT.** Adding it to `PRIVILEGED` would be a spec change (D24 names
   * four). The control is therefore `requireSession` on every route that asserts this, and
   * `records.test.ts` proves a token holding `launch:record` is still refused
   * `403 TOKEN_CREDENTIAL_REFUSED` — because a token that could satisfy the platform's own
   * launch gate is D14 exactly inverted (P6a Decision 4).
   */
  'launch:record',
  'quota:set',
] as const
…
const PLATFORM_ADMIN: readonly Capability[] = [...OWNER, 'release:approve', 'launch:record', 'quota:set']
```

**`privileged.test.ts` must still pass unchanged** — `PRIVILEGED` is four literals and `launch:record` is not one of them. **Add one assertion there**, in that file, because it is where a reader looks: *"`launch:record` is NOT privileged, and the route's `requireSession` is what refuses a token"*, with a pointer to `records.test.ts`.

- [ ] **Step 2: The four routes**

```ts
  defineRoute({
    operationId: 'getLaunchRecords',
    method: 'GET',
    path: '/v1/projects/{projectId}/launch-records',
    tag: 'launch',
    summary: 'The IAM registration and the privacy assessment, as recorded',
    description:
      '§9 and D19. Manifest tracks both; an administrator records what UBC IAM and the Privacy Office said, with the ticket reference. P8 generates what they carry. Either may be absent, which is a state and not an error.',
    params: z.strictObject({ projectId: z.uuid() }),
    query: NO_QUERY, body: NO_BODY,
    success: { status: 200, description: 'Both records, either of which may be null.', schema: LaunchRecords },
    errors: ['NOT_FOUND'],
    handler: async ({ deps, actor, params }) => {
      // READABLE BY THE PROJECT, not only by an administrator: §13 says the checklist is
      // surfaced "the moment a project is created — not at the point the owner asks to go
      // live", and an owner who cannot see whether their PIA is in has no way to chase it.
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return {
        projectId: params.projectId,
        iamRegistration: toIamRegistration(await getIamRegistration(deps.db, params.projectId)),
        privacyAssessment: toPrivacyAssessment(await getPrivacyAssessment(deps.db, params.projectId)),
      }
    },
  }),
  defineRoute({
    operationId: 'recordIamRegistration',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/iam-registration',
    …
    body: RecordIamRegistrationRequest,   // { entityId, acsUrl, sloUrl, registeredAttributes[], state, externalTicketRef?, certExpiresAt? }
    success: { status: 200, description: 'The registration as it now stands.', schema: IamRegistration },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'TOKEN_CREDENTIAL_REFUSED', 'LAUNCH_TRANSITION_INVALID', 'LAUNCH_RECORD_INVALID'],
    handler: async ({ deps, request, params, body }) => {
      // D14 and Decision 4: an administrator, in a browser. `requireSession`'s RETURN TYPE
      // is the enforcement — reverting this line does not weaken a check, it stops compiling.
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      return toIamRegistration(await recordIamRegistration(deps.db, deps.bus, { …, actor }))
    },
  }),
  // recordPrivacyAssessment — the same shape, over piaTransition.
  // getLaunchRecords is ONE read for BOTH, deliberately: two reads would be two screens'
  // worth of round trips for a console that shows them together, and D23's resource
  // orientation is about resources a client needs, not about rows a table holds.
```

**Note what is NOT here:** no `DELETE`, and no route that moves a record backwards other than through its own arrows. **§13's *Integrity of the gate* is a list of holes to close, and "an administrator can delete the PIA row and start again" is one of them.**

- [ ] **Step 3: `records.ts` — upsert by project, transition by arrow, publish an event**

```ts
export async function recordIamRegistration(
  db: Db, bus: EventBus, input: RecordIamInput,
): Promise<IamRegistrationRow> {
  const existing = await getIamRegistration(db, input.projectId)
  // THE ARROW IS CHECKED EVEN ON THE FIRST WRITE. A record created straight into `active`
  // is the same hole as a transition into it (Task 5's note), so a new record starts at
  // `draft` and the requested state is reached by transition from there — one code path,
  // and `draft → active` is refused for a first write exactly as it is for a later one.
  const from: IamState = existing?.state ?? 'draft'
  const state = input.state === from ? from : iamTransition(from, input.state)

  // §9's fail-open field, refused before anything is written — the same refusal
  // `deriveSpEntity` makes and for the same measured reason (S2: an empty attribute list
  // releases EVERY attribute). The database also refuses it; this is the message.
  if (input.registeredAttributes.length === 0)
    throw new LaunchRecordError(
      'LAUNCH_RECORD_INVALID',
      'registeredAttributes is empty — a registration with no attribute list would make the ' +
        'production subset check vacuously true, because every set is a superset of nothing (§7, §9)',
      'Record exactly the attributes UBC IAM registered, as they appear in the ticket.',
    )

  const [row] = await db.insert(iamRegistrations).values({ … })
    .onConflictDoUpdate({ target: iamRegistrations.projectId, set: { …, state, updatedAt: new Date() } })
    .returning()

  // §14 and Decision 14. THE TICKET REFERENCE IS IN THE EVENT and the attributes are not:
  // a list of requested CWL attributes on a project's public stream is more than the stream
  // needs to carry, and `getLaunchRecords` is where a member reads them.
  await publishEvent(db, bus, {
    projectId: input.projectId,
    subject: `iam-registration:${row!.id}`,
    type: 'iam_registration.recorded',
    machineDetail: { state, entityId: row!.entityId, externalTicketRef: row!.externalTicketRef ?? null, attributeCount: input.registeredAttributes.length },
    humanMessage: `${input.actor.puid} recorded this app's UBC IAM registration as ${state}${row!.externalTicketRef ? ` (ticket ${row!.externalTicketRef})` : ''}.`,
  }, makeRedactor([]))
  return row!
}
```

- [ ] **Step 4: The matrix rows — nine actors each, by CODE**

`api/authz-contract.ts` gains four route entries. **The token rows are the point of this task's authorization story:**

| Actor | `recordIamRegistration` | Why |
|---|---|---|
| `owner` | **`403 FORBIDDEN`** | a faculty member cannot assert their own PIA was approved |
| `collaborator` | `403 FORBIDDEN` | same |
| `admin` | `pass` | §13's platform admin |
| `stranger` | `404 NOT_FOUND` | the enumeration-oracle rule, unchanged |
| `anonymous` | `401 UNAUTHENTICATED` | |
| `token-capable` | **`403 TOKEN_CREDENTIAL_REFUSED`** | **Decision 4's whole point**, and it is refused for the CREDENTIAL CLASS before any capability is read |
| `token-incapable` | `403 TOKEN_CREDENTIAL_REFUSED` | the same, and identically — which says the capability is irrelevant here |
| `token-other-project` | `404 NOT_FOUND` | |
| `token-privileged` | `403 TOKEN_CREDENTIAL_REFUSED` | **not `TOKEN_ACTION_PENDING`**: `launch:record` is not one of D24's four, so no pending action is ever created — and asserting the code is the only way to see that |

**`token-capable` here means a token the harness minted holding `launch:record`** — `mintTestToken` can write one the mint route would also allow, since it is not privileged. **That is the test that matters**, and writing it any other way tests nothing.

- [ ] **Step 5: `pnpm contract:write && pnpm contract:generate`, then the console reckoning**

**Four new operations.** Task 17 gives three of them a caller. **`getLaunchRecords` is called by the launch screen; both `record…` routes by the new records screen.** Nothing goes in `DELIBERATELY_UNCALLED` from this task — **and if that turns out to be wrong at Task 17, the list entry is written there with its reason, not silently.**

- [ ] **Step 6: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | `requireSession` → `requireActor` on `recordIamRegistration` | **four matrix rows red**, each on the CODE: `TOKEN_CREDENTIAL_REFUSED` expected, `FORBIDDEN` or `pass` received. **Predict which:** `token-capable` becomes `pass` — a token would record a registration — and that is the finding this control exists to make visible |
| b | `launch:record` added to `PLATFORM_ADMIN`'s list removed | the admin row red, `403 FORBIDDEN` where `pass` is expected |
| c | `iamTransition` not called (the state written straight through) | `records.test.ts`'s *refuses a first write straight into `active`* red |
| d | the empty-attributes refusal removed | `records.test.ts` red — **and note in the record that the database's CHECK catches it too**, so this is belt and braces and the test says which is which |
| e | `launch:record` added to `PRIVILEGED` | `privileged.test.ts` red on *"is exactly D24's four"* — **the alignment test doing its job**, and the reason Decision 4 did not take that route |

```bash
git add packages/control-plane/src/launch packages/control-plane/src/projects packages/control-plane/src/api packages/contract
git commit -m "feat(launch): an administrator records the IAM registration and the PIA (§9, R1)"
```

---

## Task 7: The gate that BLOCKS — one evaluation, two callers, and the two gates that go

> ### [M2][M4][M8] Correction block — EXECUTED 2026-09-19. Three points, and the first is this task's real negative control.
>
> *THREE points. The third is a control this task would otherwise have believed in; evidence in
> [`spikes/p6a-baseline/`](../spikes/p6a-baseline/README.md), `[M2]`, `[M4]` and `[M8]`.*
>
> **1. THE TWO GATES ANSWER THE SAME STATUS AND THE SAME CODE — assert `launchReadiness`, never
> the code.** Measured: with the route's gate commented out, a production deploy still answered
> **`409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`**, from `deployRelease`'s own `ReleaseError`, and
> the only difference was that the envelope carried **no `launchReadiness`**
> (`.error | has("launchReadiness")` → `false`; `true` again after the restore, with 6 items).
> So a test asserting status **and code** is green against a Task 7 that removed only the outer
> gate — *Read this first* 1's warning, confirmed, and sharper than it reads. **This task's
> negative control asserts the PRESENCE of `launchReadiness` in the refusal.** Both line numbers
> in *Read this first* 1 are exact: the route's gate `api/routes/releases.ts:233`,
> `deployRelease`'s `releases/release.ts:213`, the inner one before the build is read.
>
> **2. Today's gate never reads `ready`, so REPLACE the condition rather than satisfying the
> checklist.** With `computeLaunchReadiness` temporarily forced to mark all six items `met`, the
> production deploy **still refused** — and its envelope said **`launchReadiness.ready: true`**.
> The route keys on `environment.kind === 'production'`. That pair (ready true, still refused) is
> the cheapest before-measurement this task has.
>
> **3. §16's authorization matrix CANNOT FAIL FOR THIS TASK.** The production-deploy row expects
> `409` for `owner` and `admin` — the only two `409`s in `api/authz-contract.ts` — and those are
> statements about the GATE, not about authorization. They pass today because the gate is
> unconditional, and they will pass after this task because the fixture project's blocking items
> are not met. **370 tests stay green on both sides of the change, including a version of this
> task that left `assertLaunchable` throwing unconditionally.** Do not count the matrix as
> coverage here.
>
> **Two facts this task needs when it rewires the items to read real rows.** `computeLaunchReadiness`
> returns **SIX** items for a `class`-audience project, all `blocking: true`, with `domain` and
> `scans` already `met`; the two rendered paths are still **byte-identical** (`jq -S . | diff`,
> 2279 bytes each), which this task must keep. And `iam-registration` is met **only when there is
> a candidate release AND its resolved *production* config says `auth.provider === 'none'`** —
> with no candidate at all the item is `not_built`, deliberately, because *"the conservative
> answer is that it will need one"*. *Read this first* 4 states only the provider half. **Keep
> that conservative default**: "no candidate" must not become "no registration needed".


**This plan's centre, and it gets a sitting to itself.** Until this task the platform refuses every production deploy unconditionally, in **two** places (*Read this first* 1). After it, the checklist decides.

**Files:**
- Create: `packages/control-plane/src/launch/gate.ts` — `assertLaunchable`
- Modify: `packages/control-plane/src/launch/readiness.ts` — `iam-registration` and `privacy-assessment` read real rows
- Modify: `packages/control-plane/src/api/routes/releases.ts` — the route's gate becomes conditional
- Modify: `packages/control-plane/src/releases/release.ts` — **the inner gate is DELETED** (Decision 3)
- Modify: `packages/control-plane/src/api/errors.ts` — unchanged envelope, new reachability
- Test: `packages/control-plane/src/launch/readiness.test.ts`, `api/delivery.test.ts`, `api/authz-contract.ts`

**Interfaces:**
- Consumes: Task 6's `getIamRegistration` / `getPrivacyAssessment`.
- Produces: `assertLaunchable(db, projectId): Promise<LaunchReadinessView>` — returns the view when `ready`, throws `ProductionGateError(view)` when not. **The deploy route's only gate.**

- [ ] **Step 1: The two items read real rows**

```ts
    await iamItem(db, projectId, usesCwl),
    await piaItem(db, projectId),
```

```ts
/**
 * §13's first blocking item. Three states, and the third is the one R1 bought:
 *
 *  - `met` when the app signs nobody in with CWL — there is nothing to register (unchanged).
 *  - `met` when a recorded registration is `active`.
 *  - `unmet` when one exists and is not yet active, naming the state and the ticket, so the
 *    owner can chase it rather than wonder.
 *  - `unmet` when none exists at all — NOT `not_built`, which said "Manifest does not track
 *    this yet" and stopped being true in P6a. **`builtBy` is gone from this item**, and a
 *    reader who finds it again should treat that as a regression.
 */
async function iamItem(db: Db, projectId: string, usesCwl: boolean): Promise<LaunchItem> {
  const base = { id: 'iam-registration' as const, title: 'Registered with UBC IAM', blocking: true }
  if (!usesCwl)
    return { ...base, owner: 'UBC IAM', state: 'met',
      why: 'This app does not sign people in with CWL, so it needs no IAM registration.' }
  const row = await getIamRegistration(db, projectId)
  const owner = 'UBC IAM, recorded by a platform administrator (§9)'
  if (row === undefined)
    return { ...base, owner, state: 'unmet',
      why: 'Every production app that signs people in with CWL needs its own IAM registration (§9, C4), with a multi-week lead time. Nothing has been recorded for this project yet — an administrator records what UBC IAM said, with the ticket reference.' }
  if (row.state === 'active')
    return { ...base, owner, state: 'met',
      why: `Registered as ${row.entityId}, active${row.externalTicketRef ? ` (ticket ${row.externalTicketRef})` : ''}, releasing ${row.registeredAttributes.length} attribute(s).` }
  return { ...base, owner, state: 'unmet',
    why: `The registration is '${row.state}'${row.externalTicketRef ? ` (ticket ${row.externalTicketRef})` : ''} and must be 'active' before a first production launch (§9).` }
}
```

**`piaItem` is the same shape over three states**, and its `met` case names the reviewer and the approval date, because §13's checklist is read by a faculty member who wants to know *who* said yes.

- [ ] **Step 2: `gate.ts` — the ONE evaluation**

```ts
/**
 * §13's gate, and D9.1: "First launch to production — requires the full `LaunchReadiness`
 * checklist."
 *
 * **ONE FUNCTION, TWO CALLERS** (P6a Decision 2). `GET …/launch-readiness` renders the view
 * and this throws on it; both reach it through `computeLaunchReadiness`, so **the thing a
 * person reads and the thing that blocks them cannot disagree.** P5c sitting 6 measured the
 * two rendered paths byte-identical and `readiness.test.ts` now asserts it — a second
 * predicate here would be the shape §9's *a document that restates a number drifts from it*
 * names, in code.
 *
 * It returns the VIEW rather than void, so the caller that proceeds holds the evidence it
 * proceeded on — which is what Task 15's deploy records and Task 19's demo prints.
 */
export async function assertLaunchable(db: Db, projectId: string): Promise<LaunchReadinessView> {
  const view = await computeLaunchReadiness(db, projectId)
  if (!view.ready) throw new ProductionGateError(view)
  return view
}
```

**`ProductionGateError` moves from `api/errors.ts` to `launch/` or is imported by it** — decide and say which, because `launch/` importing `api/` is the dependency running the wrong way and `module-boundaries.test.ts` will say so. **The right answer is that the class moves to `launch/` and `api/errors.ts` imports it**, the way `ReleaseError` lives in `releases/`.

- [ ] **Step 3: The route's gate becomes conditional**

```ts
      if (environment.kind === 'production') {
        // §13's gate, which until P6a refused unconditionally. `assertLaunchable` throws
        // `ProductionGateError` carrying the SAME checklist `GET …/launch-readiness`
        // answers — one computation, so the view and the gate cannot disagree (Decision 2).
        //
        // AFTER `assertCapability` above, deliberately and unchanged: that check is about
        // WHO may ask, this one is about whether the project is ready, and a collaborator is
        // refused without the project's readiness ever being consulted.
        await assertLaunchable(deps.db, environment.projectId)
      }
```

- [ ] **Step 4: DELETE the inner gate — and prove it was the second one**

```ts
  // REMOVED in P6a Task 7 (Decision 3). `deployRelease` refused every production deploy
  // here, before it read the build, with a `ReleaseError` carrying no checklist — a SECOND
  // gate behind the route's, unreachable by any client and openable by nobody. §13's gate is
  // `launch/gate.ts` and there is one of it. The error CODE stays in `error-codes.ts` with
  // one family instead of two, because `ProductionGateError` still uses it.
```

**Change `error-codes.ts`'s entry from `families: ['api', 'ReleaseError']` to `families: ['api']` in the same commit.** `error-codes.test.ts` holds the registry to the source **in both directions** — a family listed that nothing throws is red — so leaving it is a red gate, and that redness is the proof the deletion was complete.

- [ ] **Step 5: The tests, and the one that keeps the two paths identical**

```ts
it('the 409 envelope and the read answer the SAME checklist, byte for byte', async () => {
  const read = await app.inject({ method: 'GET', url: `/v1/projects/${projectId}/launch-readiness`, …session })
  const deploy = await app.inject({ method: 'POST', url: `/v1/environments/${productionId}/deploy`, …session, payload: { releaseId } })
  expect(deploy.statusCode).toBe(409)
  expect(deploy.json().error.code).toBe('RELEASE_PRODUCTION_GATE_UNAVAILABLE')
  // Stringified with sorted keys, so this is about VALUES and not about key order.
  expect(stable(deploy.json().error.launchReadiness)).toBe(stable(read.json()))
})

it('deploys to production when every blocking item is met', async () => { … })
```

**The second test is the positive control, and without it the first one is a test of a route that refuses everything** — which is P5c's F16 in this task's own shape. **It needs every blocking item met**, which at this point in the plan means: a recorded `active` IAM registration, an `approved` PIA, a clean scan on the candidate — **and `rehearsal` and `admin-approval`, which are still `not_built`.**

**SO THIS TEST CANNOT PASS YET, AND THAT IS THE TASK'S HARDEST HONEST FACT.** Two ways to handle it and the second is the one to take:

1. Force the two unbuilt items to `met` in the test — **which is a test of a checklist the platform will never produce.**
2. **Write the test now, `it.skip`ped, with the reason in its name — `pending Tasks 10 and 14: admin-approval and rehearsal are not built`** — and **Task 14's step 5 un-skips it**. A skipped test with a task number in it is a promise a reader can check; a forced fixture is a claim nobody can.

**Take (2), and put the same sentence in the task's record.** `pnpm test`'s count then includes one skipped test; **say so when you report the number**, because §2's box has never carried a skipped one and an unexplained `1 skipped` reads as a mistake.

- [ ] **Step 6: The matrix row changes meaning — say so**

The production-deploy row expects `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE` for the actors that get past authorization. **After this task it still does, for a different reason**: the project in the matrix has no records, so the checklist is genuinely unmet. **Add a comment at that row saying exactly that**, because a row whose meaning changed silently is how a suite stops testing what it claims (`[M8]`).

- [ ] **Step 7: Gates and controls**

**`pnpm test:docker` is OWED** (`releases/`, `launch/`).

| | Control | Predicted |
|---|---|---|
| a | `assertLaunchable` throws unconditionally | the `it.skip`ped positive test cannot see it (it is skipped) — **so this control has nothing to fail against until Task 14.** Say so, and re-run it there. **A control that cannot fail is a finding, and this one is predicted in advance rather than discovered** |
| b | `assertLaunchable` returns without checking `ready` | **the byte-identical test still passes** (the read is unaffected) and **the matrix's production rows go green where `409` is expected → RED**. Predict it as the matrix, not the delivery test |
| c | `iamItem` returns `met` for a `submitted` registration | `readiness.test.ts` red: *"the registration is 'submitted' … must be 'active'"* |
| d | the inner gate left in `release.ts` | **everything above stays green**, and Task 15's first production deploy fails. **Run it: change `assertLaunchable` to always pass and watch the deploy refuse with an envelope carrying NO checklist** — that is the second gate, seen |

**(d) is this task's real deliverable measured.** Do it.

```bash
git add packages/control-plane/src/launch packages/control-plane/src/releases packages/control-plane/src/api
git commit -m "feat(launch): the production gate evaluates the checklist, in one place, and the second gate is gone"
```

---

## Task 8: Step-up re-authentication — the `ForceAuthn` round trip and `steppedUpAt`

**§20 deferred this explicitly — *"step-up's own second authentication round trip lands with the routes it protects"* (Rich, 2026-09-17) — and this is that plan.** Read `[M3]` before starting: **if the IdP does not honour `ForceAuthn`, this task grows a step and the sitting absorbs it.**

**Files:**
- Create: `packages/control-plane/src/identity/step-up.ts` — the cookie, the nonce, the freshness window, `stepUpSession`
- Create: `packages/control-plane/src/identity/step-up.test.ts`
- Modify: `packages/control-plane/src/identity/session.ts` — `steppedUpAt` on `Session`, validated
- Modify: `packages/control-plane/src/identity/saml.ts` — `createSamlSp` gains a `forceAuthn` option; `SamlSp` gains `stepUpUrl`
- Modify: `packages/control-plane/src/api/routes/auth.ts` — `GET /auth/step-up`, and the callback's second branch
- Modify: `packages/control-plane/src/api/unversioned.ts` — the new path, **with its reason**
- Modify: `packages/control-plane/src/api/server.ts` — the actor hook carries `steppedUpAt`
- Modify: `packages/control-plane/src/projects/authz.ts` — `SessionActor.steppedUpAt: number | null`

**Interfaces:**
- Consumes: `[M3]`'s answer.
- Produces: `STEP_UP_COOKIE`, `STEP_UP_TTL_MS`, `stepUpSession(session, now?)`, `isSteppedUp(actor, now?)`; `GET /auth/step-up?returnTo=<path>`; and a `SessionActor` carrying `steppedUpAt`, which Task 9 asserts on.

- [ ] **Step 1: The claim on the session — added, and VALIDATED rather than trusted**

```ts
export interface Session {
  userId: string
  puid: string
  role: 'admin' | 'member'
  issuedAt: number
  expiresAt: number
  /**
   * §20's step-up re-authentication (P6a, Decision 8). When this person last completed a
   * SECOND authentication round trip — a `ForceAuthn` AuthnRequest the IdP re-prompted for.
   *
   * A UNION WITH null, not an optional property: absence is a fact every reader must handle,
   * and `exactOptionalPropertyTypes` makes an optional one awkward at every construction site.
   *
   * **It inherits the divergence §20 records with its cost**: Phase 1 sessions are stateless
   * signed cookies with no server-side store, so a stepped-up session **cannot be revoked
   * before its own expiry** — which is why `STEP_UP_TTL_MS` is short and is enforced at
   * ASSERT time rather than at issue time. The store §20 defers is what would fix it.
   */
  steppedUpAt: number | null
}
```

```ts
export function issueSession(user: …, now: number = Date.now()): Session {
  return { …, steppedUpAt: null }        // NEVER stepped up at sign-in. §20 asks for a SECOND round trip.
}

export function verifySession(token: string, secret: string, now: number = Date.now()): Session | null {
  …
  // VALIDATED, NOT TRUSTED. The payload is signed, so this cannot be forged by a client —
  // but a cookie signed by an older build has no such field, and one written by a future
  // build could have anything. A non-number becomes null rather than a refusal: an old
  // cookie is a valid session that simply is not stepped up.
  const steppedUpAt = typeof session.steppedUpAt === 'number' && Number.isFinite(session.steppedUpAt)
    ? session.steppedUpAt
    : null
  return { ...session, steppedUpAt }
}
```

**The backward-compatibility note is worth its line**: every session cookie in every browser on this machine predates this field, and **a refusal would sign everybody out the moment the control plane restarted** — including, in Task 19's demo, the administrator who is about to approve something.

- [ ] **Step 2: The second SAML instance**

```ts
export interface SamlSpConfig {
  …
  /**
   * §20's step-up. **`forceAuthn` is a CONSTRUCTOR option in node-saml 5.1.0**
   * (`lib/types.d.ts:128`, read once in `initialize()`) and `AuthOptions` carries only
   * `samlFallback` and `additionalParams` — and `ForceAuthn` is an XML attribute on the
   * request, which `additionalParams` cannot reach. So a step-up needs a SECOND instance,
   * identical but for this flag (P6a, Decision 17).
   */
  forceAuthn?: boolean
}
```

```ts
/**
 * ONE SP, TWO REQUEST BUILDERS. Both share the entityID, the ACS URL and the keys — so the
 * IdP's registration does NOT change, which is what makes step-up affordable (§9: the ACS is
 * registered with the IdP and a second one would be a registration change, and a thing §9
 * alerts on specifically).
 *
 * **`validateInResponseTo: always` caches request IDs PER INSTANCE**, in node-saml's
 * in-memory provider. So a step-up assertion can only be validated by the instance that
 * issued its request, and the callback picks by which cookie's nonce matches `RelayState`.
 */
export function createSamlSp(config: SamlSpConfig): SamlSp {
  const saml = new SAML({ …, forceAuthn: config.forceAuthn ?? false })
  …
}
```

`server.ts` builds two: `deps.samlSp` as today, and `deps.samlStepUpSp = createSamlSp({ ...same, forceAuthn: true })`.

- [ ] **Step 3: `identity/step-up.ts`**

```ts
/**
 * A step-up, bound to the browser that started it — the same shape `login-state.ts` uses for
 * a sign-in, and for the same reason: proving an assertion answers a request THIS PROCESS
 * made does not prove THIS BROWSER made it (P5a Decision 16).
 *
 * Its own cookie rather than reusing `manifest_login`, because the two flows differ in what
 * the callback must then do, and a callback that guessed from one cookie would have to guess
 * right every time. `path=/auth`, like the login cookie; `SameSite=None` on https for the
 * same measured reason (the IdP's auto-submitting POST is cross-site).
 */
export const STEP_UP_COOKIE = 'manifest_stepup'
export const STEP_UP_TTL_SECONDS = 600

/**
 * HOW FRESH A STEP-UP MUST BE when it is asserted (Decision 8). Ten minutes: long enough to
 * read a release diff and decide, short enough that a stolen cookie is rarely stepped up.
 *
 * Enforced at ASSERT time, never at issue time — because a Phase 1 session cannot be revoked
 * before its own expiry (§20), so the only lever is how old the claim may be when it is used.
 */
export const STEP_UP_TTL_MS = 10 * 60 * 1000

export function stepUpSession(session: Session, now: number = Date.now()): Session {
  return { ...session, steppedUpAt: now }
}

export function isSteppedUp(
  steppedUpAt: number | null,
  now: number = Date.now(),
): boolean {
  // `> 0` as well as non-null: a zero would be an epoch instant that is always stale, and
  // `.map(fn)` handing a mapper the ARRAY INDEX is how a zero gets into a field like this
  // one (P5b sitting 7, F4). Refusing it costs nothing and closes that door.
  return steppedUpAt !== null && steppedUpAt > 0 && now - steppedUpAt < STEP_UP_TTL_MS
}
```

- [ ] **Step 4: `GET /auth/step-up`, and the callback's second branch**

```ts
  /**
   * §20's step-up re-authentication. A browser NAVIGATION, not a fetch: it ends at the IdP
   * and comes back through the ACS, exactly as `/auth/login` does.
   *
   * IT REQUIRES A SESSION ALREADY. Stepping up is re-proving who you are, not signing in —
   * and the callback refuses an assertion for a DIFFERENT person than the session in hand,
   * which is the check that stops one person stepping up into another's session.
   */
  app.get('/auth/step-up', async (request, reply) => {
    const actor = requireSession(request)                 // 403 TOKEN_CREDENTIAL_REFUSED for a token
    const { returnTo } = loginQuery.parse(request.query ?? {})
    const nonce = newLoginNonce()
    const https = deps.config.sp.origin.startsWith('https://')
    reply.setCookie(STEP_UP_COOKIE, encodeLoginCookie(nonce, safeReturnTo(returnTo)), {
      httpOnly: true, path: '/auth', maxAge: STEP_UP_TTL_SECONDS,
      secure: https, sameSite: https ? 'none' : 'lax',
    })
    console.error(`[auth] step-up started for ${actor.puid}`)   // §14: no assertion, no cookie, no secret
    return reply.redirect(await deps.samlStepUpSp.loginUrl(nonce), 302)
  })
```

**In the callback, before the ordinary branch:**

```ts
      const stepUp = readLoginCookie(request.cookies[STEP_UP_COOKIE])
      const isStepUp = stepUp !== undefined && RelayState !== undefined && sameNonce(stepUp.nonce, RelayState)
      if (isStepUp) {
        // The session must still be here: a step-up is an addition to one, never a way to get
        // one. An expired session here means signing in again, which the ordinary branch does.
        const current = verifySession(request.cookies[SESSION_COOKIE] ?? '', deps.config.sessionSecret)
        if (current === null)
          throw new SamlError('SAML_STEP_UP_NO_SESSION', 'the step-up answered no session — sign in again')
        // VALIDATED BY THE INSTANCE THAT ISSUED THE REQUEST. node-saml's InResponseTo cache is
        // per instance (Decision 17), so the ordinary SP would refuse this assertion outright.
        const identity = await deps.samlStepUpSp.validate(SAMLResponse)
        // AND IT MUST BE THE SAME PERSON. Without this line, signing in as anybody at the IdP
        // stamps `steppedUpAt` onto whoever's session is in this browser.
        if (identity.ubcCwlPuid !== current.puid) {
          console.error(`[auth] step-up REFUSED: assertion is for a different person than the session`)
          throw new SamlError('SAML_STEP_UP_WRONG_USER', 'that sign-in was for a different person')
        }
        reply.setCookie(SESSION_COOKIE, signSession(stepUpSession(current), deps.config.sessionSecret), { …same options… })
        reply.clearCookie(STEP_UP_COOKIE, { path: '/auth' })
        console.error(`[auth] step-up COMPLETED for ${current.puid}`)
        return reply.redirect(stepUp.returnTo, 302)
      }
```

**`api/unversioned.ts` gains the entry with its reason** — `versioning.test.ts` is the review that forces it:

```ts
  {
    method: 'GET',
    path: '/auth/step-up',
    why: "§20's step-up re-authentication. A browser navigation that ends at the IdP and returns through the ACS; it re-proves a person rather than naming a resource.",
  },
```

- [ ] **Step 5: The actor hook carries the claim**

`server.ts`'s credential hook already builds a `SessionActor` from a verified session. **Add `steppedUpAt: session.steppedUpAt`** — and `SessionActor` gains the field as `number | null`, beside `puid`, with the note that it lives on the session member and not on `Actor`, for the reason `puid` already records (`Extract<Actor, …>` over a union would drop it silently).

- [ ] **Step 6: The tests — and the positive control that F16 demands**

```ts
describe('§20’s step-up', () => {
  // THE POSITIVE CONTROL, FIRST. P5c's F16: every test fired garbage at the route and
  // asserted a refusal, and a route that refuses everything passes them all. This is the
  // test that fails if the route refuses everything.
  it('stamps steppedUpAt on the session when a valid assertion comes back for the same person', …)

  it('refuses an assertion for a DIFFERENT person, and leaves the session unstamped', …)
  it('refuses a step-up with no session at all', …)
  it('refuses a RelayState that is not the step-up cookie’s nonce', …)
  it('a token cannot start a step-up: 403 TOKEN_CREDENTIAL_REFUSED', …)
  it('isSteppedUp is false at exactly STEP_UP_TTL_MS and true one millisecond before', …)
  it('a session cookie written before this field existed verifies, and is not stepped up', …)
})
```

**The last two are the ones that will be skipped and should not be.** The boundary test is where an off-by-one lives; the old-cookie test is the one that stops a restart signing everybody out.

- [ ] **Step 7: If `[M3]` said the IdP does NOT honour `ForceAuthn`**

**Then everything above passes and means nothing**, which is the *four settings that read like controls and are not* shape. **Do this instead of proceeding:**

1. Configure the Manifest IdP to honour it (`infra/idp/config/`), and **re-run `[M3]`'s measurement** — the same two HTML files, the same `grep -c 'name="username"'`.
2. **`pnpm test:docker` is then owed**, because the identity tier parses the IdP's HTML.
3. If it still cannot be made to honour it, **stop and raise it with Rich** (ORIENTATION §8) with the measurement attached. **Do not ship a step-up that reads like a control and is not**: the honest alternative is that Task 9's item text says the round trip happens and the IdP does not re-prompt locally, and that is Rich's call and not this plan's.

- [ ] **Step 8: Gates and controls**

**`pnpm test:docker` is OWED** (`identity/`, `sso/`).

| | Control | Predicted |
|---|---|---|
| a | the puid equality check removed | *refuses an assertion for a DIFFERENT person* red — **and note that nothing else in the suite sees it**, which is why it is written |
| b | `stepUpSession` stamps at issue instead of at callback | *stamps steppedUpAt … for the same person* stays green and **Task 9's *a fresh sign-in is not stepped up* goes red**. Predict it as Task 9's, and re-run it there |
| c | `isSteppedUp`'s `> 0` guard removed | the boundary test stays green; **write a case with `steppedUpAt: 0` and watch it go red** — the guard is about `.map(fn)`'s index and nothing else would catch it |
| d | `verifySession` trusts `steppedUpAt` instead of validating it | *a session cookie written before this field existed* red, with `undefined` where `null` belongs |
| e | `forceAuthn: true` removed from the step-up instance | **NOTHING GOES RED** — and that is `[M3]`'s whole point restated. **Record it as a control that cannot fail in the unit tier**, and say which measurement is the only thing that can see it |

**(e) is the most important row in this table.** A step-up whose `ForceAuthn` flag is gone still redirects, still returns, still stamps the claim, and still passes every test — the IdP simply does not re-prompt. **The only check that can see it is `[M3]`'s**, and the record must say so plainly.

```bash
git add packages/control-plane/src/identity packages/control-plane/src/api packages/control-plane/src/projects/authz.ts
git commit -m "feat(identity): §20's step-up re-authentication — a ForceAuthn round trip and a session claim"
```

---

## Task 9: Step-up applied — D24's privileged four, and `release:approve`'s asymmetry

**Files:**
- Modify: `packages/control-plane/src/projects/authz.ts` — `STEP_UP_GUARDED`, `assertStepUp`, `StepUpRequiredError`
- Create: `packages/control-plane/src/projects/step-up-guarded.test.ts` — the set, as literals
- Modify: `packages/control-plane/src/api/error-codes.ts` — `STEP_UP_REQUIRED`
- Modify: `packages/control-plane/src/api/errors.ts` — its envelope and its hint
- Modify: `packages/control-plane/src/api/routes/projects.ts` — `members:manage` (Decision 9)
- Modify: `packages/control-plane/src/api/authz-contract.ts` — explicit `(status, code)` pairs

**Interfaces:**
- Consumes: Task 8's `isSteppedUp` and `SessionActor.steppedUpAt`.
- Produces: `assertStepUp(actor, capability, now?)`, `STEP_UP_GUARDED`; and `403 STEP_UP_REQUIRED` with a hint naming `/auth/step-up`. **Task 10's approve route is its second caller.**

- [ ] **Step 1: The guarded set, named as literals**

```ts
/**
 * §20: step-up re-authentication for "approving a release, reading a secret, changing a
 * quota, changing project membership", plus the two admin-only actions.
 *
 * **IT IS `PRIVILEGED` PLUS `release:approve`, AND THE DIFFERENCE IS REAL RATHER THAN
 * TIDINESS.** §20's four map onto D24's four, and the code's slot for "approving a release"
 * is `release:promote` — deploying to production. `release:approve` is a SEPARATE capability
 * (§13 names the approval and the promotion separately) which is NOT in `PRIVILEGED`, is
 * granted to a platform admin by role, and **could be minted into a delegated token by an
 * administrator** — measured through the mint route as P6a `[M6]`. Adding it to `PRIVILEGED`
 * would change D24's meaning and is a SPEC CHANGE, so it is not done here; the union below
 * plus `requireSession` on the route is what closes it, and Spec action 2 asks Rich whether
 * §20 should say so.
 *
 * LITERALS, like `privileged.test.ts`'s D24 list, so nothing can be quietly added or removed.
 */
export const STEP_UP_GUARDED: ReadonlySet<PrivilegedCapability> = new Set([
  'release:promote', 'release:approve', 'secret:read', 'quota:set', 'members:manage',
])

export class StepUpRequiredError extends Error {
  readonly code = 'STEP_UP_REQUIRED'
  constructor(readonly capability: PrivilegedCapability) {
    super(`'${capability}' needs a second authentication round trip (§20)`)
    this.name = 'StepUpRequiredError'
  }
}

/**
 * Called by a route AFTER `assertCapability`, and deliberately not inside it.
 *
 * `assertCapability` answers *may this actor do this?*; this answers *have they re-proved
 * themselves recently enough?* — two different questions with two different remedies, and a
 * client switches on the difference (D23.7). Folding it in would also make every existing
 * call site of a guarded capability a step-up site, including the ones a TOKEN reaches,
 * where the answer is D24's pending action and not a browser redirect.
 */
export function assertStepUp(actor: Actor, capability: PrivilegedCapability, now = Date.now()): void {
  // A TOKEN NEVER REACHES HERE in a correct route: every step-up-guarded route either calls
  // `requireSession` or is refused by D24's central rule first. This is the belt, and it
  // fails CLOSED rather than assuming — a token has no session to have stepped up.
  if (actor.credential !== 'session') throw new StepUpRequiredError(capability)
  if (!STEP_UP_GUARDED.has(capability)) return
  if (!isSteppedUp(actor.steppedUpAt, now)) throw new StepUpRequiredError(capability)
}
```

- [ ] **Step 2: The code, the status and the HINT that makes it actionable**

```ts
  /**
   * §20's step-up. **403 and not 401**: the credential is valid and the person is who they
   * say — they are being told this particular action needs re-proving, which is a different
   * thing from "who are you" and needs a different client behaviour (D23.7).
   */
  STEP_UP_REQUIRED: api(
    403,
    'This action needs a second authentication round trip (§20). Send the person to /auth/step-up and retry.',
  ),
```

```ts
  if (error instanceof StepUpRequiredError) {
    return {
      status: 403,
      body: { error: {
        code: error.code,
        message: error.message,
        // THE HINT IS THE REMEDY, and it carries the return path so a client does not have
        // to know the flow. D23.7: "an agent corrects itself from the answer."
        hint: 'Navigate the browser to /auth/step-up?returnTo=<the page you are on>, complete the CWL prompt, and make this request again.',
      } },
    }
  }
```

- [ ] **Step 3: `members:manage` gets the guard — the caller that is not new**

```ts
      await assertCapability(deps.db, actor, params.projectId, 'members:manage')
      // §20 names member management in the step-up set, and Decision 9 takes it from day one:
      // adding it later is a second pass over a route P5b already tested, and doing it now
      // gives step-up a caller whose tests already exist — so the negative control is an
      // EXISTING passing test going red rather than a new test nobody has seen fail.
      assertStepUp(actor, 'members:manage')
```

**Both `addMember` and `removeMember`.** **This breaks existing tests, and that is the point** — `projects.test.ts`, `delegation.test.ts` and the authorization matrix all add members today. **Count how many go red before fixing them**, and record the number: it is the measurement that the guard is in force.

**Fix them with `stepUpSession`**, not by removing the assertion: `loginAs` gains an option, `loginAs(app, actor, { steppedUp: true })`, which signs a session with the claim. **`api/testing.ts` is the one place it is done.**

- [ ] **Step 4: The matrix learns a fifth `403`**

`Expectation`'s `REFUSAL_CODE` maps one code per status and `403` is `FORBIDDEN`. **So every step-up row is an explicit pair**, exactly as `PENDING` and `SESSION_ONLY` already are:

```ts
/** §20's step-up: a person who has not re-proved themselves recently enough (P6a Task 9). */
const STEP_UP = { status: 403, code: 'STEP_UP_REQUIRED' } as const
```

**And the nine-actor rows for `addMember` change**: `owner` and `admin` were `pass` and become **`STEP_UP`** for a session that is not stepped up. **The matrix's sessions are not stepped up** — `loginAs` without the option — **so this is the honest expectation, and a row that says `pass` after this task is a row testing a guard that is not there.**

- [ ] **Step 5: The tests**

```ts
describe('§20’s step-up guard', () => {
  it('is exactly D24’s four plus release:approve, and nothing has been quietly added', () => {
    expect([...STEP_UP_GUARDED].sort()).toEqual(
      ['members:manage', 'quota:set', 'release:approve', 'release:promote', 'secret:read'])
  })
  it('names release:approve, which is NOT one of D24’s four', () => {
    expect(STEP_UP_GUARDED.has('release:approve')).toBe(true)
    expect(PRIVILEGED.has('release:approve')).toBe(false)     // the asymmetry, asserted
  })
  it('lets a stepped-up session through — the positive control', () => {
    expect(() => assertStepUp(steppedUp, 'members:manage')).not.toThrow()
  })
  it('refuses a session stepped up longer ago than STEP_UP_TTL_MS', …)
  it('refuses a fresh sign-in, which is not a step-up', …)          // Task 8's control (b)
  it('lets an UNGUARDED capability through without a step-up', () => {
    expect(() => assertStepUp(plain, 'release:deploy')).not.toThrow()
  })
  it('refuses a TOKEN outright, whatever it holds', …)
})
```

**The third and sixth are the positive controls**, and without them this file is a set of refusals a function that threw for everything would satisfy.

- [ ] **Step 6: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | `assertStepUp` removed from `addMember` | **the matrix red on `owner` and `admin`** for that route: `pass` where `STEP_UP` is expected. **The count is the measurement** — record how many rows |
| b | `STEP_UP_GUARDED` loses `release:approve` | the *is exactly* test red **and** the asymmetry test red. Task 10's approve route would then be reachable without a step-up — say so |
| c | `assertStepUp` returns early for a token instead of throwing | *refuses a TOKEN outright* red |
| d | `isSteppedUp`'s window widened to a year | *refuses a session stepped up longer ago* red |
| e | `STEP_UP` written as a bare `403` in the matrix | **GREEN through a route that answers `FORBIDDEN` instead.** Run it, watch it pass, restore — the fifth demonstration of P5a sitting 6's lesson in this repository |

```bash
git add packages/control-plane/src/projects packages/control-plane/src/api
git commit -m "feat(authz): §20's step-up applied to the privileged set and to release:approve"
```

---

## Task 10: The approval — `release:approve`'s first caller, bound to a digest, non-repudiable

**`release:approve` has existed as a capability since P5b and NO ROUTE HAS EVER ASSERTED IT** (brief §2.1, measured by extracting every `assertCapability(` call site). This task is its first caller, and it inherits the `PLATFORM_ADMIN` role grant for free.

**Files:**
- Create: `packages/control-plane/src/releases/approval.ts` — `recordApproval`, `latestApprovalFor`, `approvalCoversDigest`
- Create: `packages/control-plane/src/releases/approval.test.ts`
- Modify: `packages/control-plane/src/api/routes/releases.ts` — `approveRelease`, `rejectRelease`, `getApproval`
- Modify: `packages/control-plane/src/api/representations/releases.ts` — `Approval`, `ApprovalDiff`
- Modify: `packages/control-plane/src/launch/readiness.ts` — `admin-approval` reads the row (Decision 11)
- Modify: `api/error-codes.ts`, `api/authz-contract.ts`

**Interfaces:**
- Consumes: Task 5's `approvals`, Task 9's `assertStepUp`, Task 11's `buildDiffSnapshot` (written next, in the same sitting — **Task 10 calls it and Task 11 fills it in; write the signature here**).
- Produces: `recordApproval(db, bus, input): Promise<ApprovalRow>`, `latestApprovalFor(db, releaseId)`, `approvalCoversDigest(approval, digest): boolean`; and `POST /v1/releases/{releaseId}/approve`, `.../reject`, `GET /v1/releases/{releaseId}/approval`.

- [ ] **Step 1: The route — four guards, in this order, each for a stated reason**

```ts
  defineRoute({
    operationId: 'approveRelease',
    method: 'POST',
    path: '/v1/releases/{releaseId}/approve',
    tag: 'delivery',
    summary: 'Approve a release for production',
    description:
      "§13's *Integrity of the gate*: the approval binds the release's immutable image digest, records who decided and when, and stores the exact diff shown at decision time. It requires step-up re-authentication (§20) and an interactive session (D14). A later rebuild produces a new digest, which this approval does not cover.",
    params: z.strictObject({ releaseId: z.uuid() }),
    query: NO_QUERY,
    body: ApproveReleaseRequest,            // { reason?: string }
    success: { status: 201, description: 'The approval, with the diff it was made on.', schema: Approval },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'TOKEN_CREDENTIAL_REFUSED', 'STEP_UP_REQUIRED',
             'RELEASE_NOT_FOUND', 'RELEASE_DIGEST_MISSING'],
    handler: async ({ deps, request, params, body }) => {
      // 1. D14: an interactive session, enforced by the RETURN TYPE (Decision 18).
      const actor = requireSession(request)
      const release = await releaseById(deps.db, params.releaseId)
      // 2. WHO may approve — `release:approve`, held by a platform admin alone. Its FIRST
      //    caller, and it inherits the role grant `authz.ts:141` has carried since P5b.
      await assertCapability(deps.db, actor, release.projectId, 'release:approve')
      // 3. §20: and they must have re-proved themselves inside STEP_UP_TTL_MS. AFTER the
      //    capability check, so somebody who may not approve is told that rather than being
      //    sent on a round trip that would not help them.
      assertStepUp(actor, 'release:approve')
      // 4. §13: "Approval binds to an immutable image digest." The BUILD's digest, read
      //    here — not a tag, and not the release id alone, because a release row's build can
      //    be rebuilt and a binding to a mutable thing is not a binding.
      const digest = await digestOf(deps.db, release.buildId)
      return toApproval(await recordApproval(deps.db, deps.bus, {
        release, actor, decision: 'approved',
        ...(body.reason === undefined ? {} : { reason: body.reason }),
        diffSnapshot: await buildDiffSnapshot(deps, release, digest),   // Task 11
        imageDigest: digest,
      }))
    },
  }),
```

**`rejectRelease` is the same route with `decision: 'rejected'` and a REQUIRED `reason`** — the database's `approvals_rejection_has_reason` CHECK is the second half of that, and the request schema is the first. **A rejection with no words is a refusal nobody can act on** (D23.7), and it is the same rule P5b's pending-action rejection follows.

**`getApproval` answers the latest**, and `404 NOT_FOUND` when there is none — **readable by `project:read`**, because an owner must be able to see why their release was rejected.

- [ ] **Step 2: `approval.ts`**

```ts
/**
 * §13: "Approval is a non-repudiable record: actor, timestamp, and the exact diff shown at
 * decision time."
 *
 * INSERT ONLY. There is no update and no delete — a release can be approved, rejected and
 * approved again, and each is its own row. *Integrity of the gate* is a list of ways an
 * approval could be made to say something it did not, and "edit the record" is the first of
 * them. `latestApprovalFor` takes the newest by `decided_at`, so the history is kept and
 * the answer is unambiguous.
 */
export async function recordApproval(db: Db, bus: EventBus, input: RecordApprovalInput): Promise<ApprovalRow> {
  const [row] = await db.insert(approvals).values({
    releaseId: input.release.id,
    projectId: input.release.projectId,
    decision: input.decision,
    decidedBy: input.actor.userId,
    imageDigest: input.imageDigest,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    diffSnapshot: input.diffSnapshot,
  }).returning()

  await publishEvent(db, bus, {
    projectId: input.release.projectId,
    subject: `release:${input.release.id}`,
    type: input.decision === 'approved' ? 'release.approved' : 'release.approval_rejected',
    // THE DIGEST, NOT THE DIFF. The diff is on the row and is read through `getApproval`;
    // an event goes on a project's public stream and a manifest diff can name services,
    // attributes and egress destinations (§14's redaction argument, applied by omission).
    machineDetail: { releaseId: input.release.id, imageDigest: input.imageDigest.slice(0, 19), decision: input.decision },
    humanMessage: input.decision === 'approved'
      ? `${input.actor.puid} approved this release for production.`
      : `${input.actor.puid} did not approve this release: ${input.reason}`,
  }, makeRedactor([]))
  return row!
}

/**
 * Does this approval cover what would actually be deployed? (§13, and Decision 11.)
 *
 * **A STRING COMPARISON AND DELIBERATELY NOT A PREFIX ONE.** A digest is `sha256:<64 hex>`;
 * comparing a truncated form — which every log line and every event carries — would make a
 * rebuild whose digest shares nineteen characters look approved.
 */
export function approvalCoversDigest(approval: { decision: string; imageDigest: string }, digest: string): boolean {
  return approval.decision === 'approved' && approval.imageDigest === digest
}
```

- [ ] **Step 3: `admin-approval` reads the row — with Decision 11's sentence**

```ts
async function approvalItem(db: Db, candidate: CandidateRelease | undefined): Promise<LaunchItem> {
  const base = { id: 'admin-approval' as const, title: 'Release approved by a platform administrator',
                 owner: 'platform admin', blocking: true }
  if (candidate === undefined)
    return { ...base, state: 'unmet',
      why: 'Nothing is serving in staging yet, so there is no release to approve. Production runs exactly what staging ran (§13).' }
  const approval = await latestApprovalFor(db, candidate.release.id)
  if (approval === undefined)
    return { ...base, state: 'unmet',
      why: 'An administrator approves the exact image digest, with step-up re-authentication (§13, §20). This release has not been reviewed yet.' }
  if (approval.decision === 'rejected')
    return { ...base, state: 'unmet',
      why: `An administrator did not approve this release: ${approval.reason}` }
  if (!approvalCoversDigest(approval, candidate.build.imageDigest ?? ''))
    // DECISION 11, IN WORDS. It reads as a bug the first time somebody meets it, so the
    // checklist explains it rather than reverting to the generic unmet text.
    return { ...base, state: 'unmet',
      why: 'This release was rebuilt since it was approved, so the approval no longer covers what would be deployed — the approval binds an image digest (§13). Approve the new build.' }
  return { ...base, state: 'met',
    why: `Approved by an administrator on ${approval.decidedAt.toISOString().slice(0, 10)}, bound to image digest ${approval.imageDigest.slice(0, 19)}…` }
}
```

- [ ] **Step 4: The tests, positive control first**

```ts
it('approves a release, binds its digest, and records who and when', …)        // POSITIVE, first
it('refuses an approval from a session that has not stepped up: 403 STEP_UP_REQUIRED', …)
it('refuses an approval from an owner who is not a platform admin: 403 FORBIDDEN', …)
it('refuses a delegated token holding release:approve: 403 TOKEN_CREDENTIAL_REFUSED', …)
it('refuses a rejection with no reason: 400', …)
it('a rebuild invalidates the approval — the checklist says the release was rebuilt', …)
it('a rejection is readable by the project owner, with the administrator’s words', …)
```

**The fourth is `[M6]`'s finding turned into a test**, and it must be written with a token that **the mint route would issue** — `mintTestToken` with `capabilities: ['release:approve']` is exactly that token, because the mint route refuses only `PRIVILEGED`. **A test that used a token the platform cannot mint would prove nothing** (P5b sitting 4, F1).

- [ ] **Step 5: `pnpm contract:write && pnpm contract:generate`, and the matrix**

Three new operations, nine actors each. **`approveRelease`'s `admin` row is `STEP_UP`, not `pass`**, because the matrix's sessions are not stepped up — **unless the matrix gains a stepped-up admin actor, which it should not**: nine actors is already the dimension P5b added, and a tenth for one route is a cost every route pays. **Assert the stepped-up path in `approval.test.ts` instead, and say so in a comment at the matrix row.**

- [ ] **Step 6: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | `assertStepUp` removed from the approve route | the step-up test red; **the matrix's `admin` row red** (`pass` where `STEP_UP` expected) |
| b | `requireSession` → `requireActor` | the token test red — **and `[M6]`'s finding becomes live**: an agent could approve a production release |
| c | `approvalCoversDigest` compares `slice(0, 19)` | *a rebuild invalidates the approval* red — **write this control, because the truncated form is what every event and every log line carries and it is the mistake somebody will make** |
| d | `recordApproval` updates instead of inserting | *a rejection is readable … with the administrator's words* survives; **write a test that two decisions leave two rows**, and watch that one go red |
| e | the rejection-reason CHECK dropped and the schema loosened | the reason test red — and record that the database also refuses it |

```bash
git add packages/control-plane/src/releases packages/control-plane/src/launch packages/control-plane/src/api packages/contract
git commit -m "feat(releases): §13's approval — release:approve's first caller, bound to a digest"
```

---

## Task 11: The `diff_snapshot` and its AI summary — absent rather than blocking

**Files:**
- Modify: `packages/control-plane/src/releases/approval.ts` — `buildDiffSnapshot`
- Create: `packages/control-plane/src/releases/summary.ts` — the LLM call, and its failure
- Create: `packages/control-plane/src/releases/summary.test.ts`
- Modify: `packages/control-plane/src/api/representations/releases.ts` — `ApprovalDiff`

**Interfaces:**
- Consumes: `spec/diff.ts`'s `describeDiff` and `SpecChange` (**`isSensitiveDiff` is NOT called here — that is P6b's, and calling it now would be P6b built badly**), `ai/`'s `LiteLlmClient`, Task 12's `Reviewer` (**written next sitting; this task stores `not_performed` as a literal and Task 12 replaces it with the real call — say so in a comment and in the record**).
- Produces: `buildDiffSnapshot(deps, release, digest)`, `summariseChanges(ai, changes)`.

- [ ] **Step 1: What the snapshot holds, and where each field comes from**

```ts
/**
 * §13: the approval record captures "image digest, `manifest.yaml` diff, services requested,
 * CWL attributes requested, resource delta, and an AI-written plain-English summary of what
 * changed since the last approved release."
 *
 * **RENDERED AT DECISION TIME AND STORED** (Decision 6). §13 says "the exact diff shown at
 * decision time"; a diff recomputed later against a changed spec is a different claim about
 * a different thing, and the record exists precisely to be non-repudiable.
 *
 * `describeDiff` runs over the FROZEN `ResolvedConfig` of each release, never over
 * `app_specs.parsed` — a release is what §13 froze, and reading the spec back would be the
 * second source of truth P4a deleted.
 */
export async function buildDiffSnapshot(deps: SnapshotDeps, release: ReleaseRow, digest: string): Promise<DiffSnapshot> {
  const previous = await lastApprovedReleaseFor(deps.db, release.projectId)
  const now = (release.resolvedConfig as ResolvedConfigSet).production
  // A FIRST LAUNCH HAS NOTHING TO DIFF, and that is a state rather than an absence: §13's
  // gate for a first launch is the whole checklist, and D9.2's re-escalation — which is what
  // a diff is FOR — is P6b's. So the changes are empty and the summary says why.
  const changes = previous === undefined
    ? []
    : describeDiff((previous.resolvedConfig as ResolvedConfigSet).production, now)
  return {
    imageDigest: digest,
    changes,
    services: now.services.map((s) => `${s.type}@${s.version}`).sort(),
    attributes: [...(now.auth?.attributes ?? [])].sort(),
    resources: { cpu: now.resources.cpu ?? null, memory: now.resources.memory ?? null,
                 disk: now.resources.disk ?? null, pids: now.resources.pids ?? null },
    ...(previous === undefined
      ? { summary: null, summarySource: 'no-previous-release' as const }
      : await summariseChanges(deps.ai, changes)),
    // R4 (D33): the reviewer's verdict AT DECISION TIME. Task 12 replaces this literal with
    // `deps.reviewer.review(...)`, and the item's honesty is the whole point — a literal that
    // said `clean` here would be the stub R4(b) forbids.
    review: { state: 'not_performed', reviewer: 'none', detail: 'no code reviewer is configured (D33, §15)' },
  }
}
```

**The `.sort()` calls are not cosmetic**: a snapshot is compared by eye and by `diff` in Task 19's demo, and an unsorted list makes two identical approvals look different — the same order-insensitivity `spec/diff.ts` already applies for the same reason.

- [ ] **Step 2: The summary, and what happens when it cannot be produced**

```ts
/**
 * §13's "AI-written plain-English summary of what changed since the last approved release",
 * for the administrator to read at decision time.
 *
 * **A FAILED SUMMARY DOES NOT BLOCK AN APPROVAL** (Decision 7). An approval gate that fails
 * closed on a language model being down is an outage, not a control — and §13's control is
 * the administrator reading the diff, which is stored beside this and is not generated by
 * anything. So a failure is recorded as `summary: null` with `summarySource: 'unavailable'`,
 * and the reason goes to the operator.
 *
 * `default-chat-onprem` (§10's catalogue, `max_classification: confidential`), so D17's
 * routing question does not arise: the input is a `manifest.yaml` diff, which is
 * configuration rather than personal information, and the on-premise model needs no claim
 * about where it goes.
 */
export async function summariseChanges(
  ai: LiteLlmClient | undefined,
  changes: readonly SpecChange[],
): Promise<{ summary: string | null; summarySource: 'llm' | 'unavailable' }> {
  // MANIFEST_AI_ENABLED=0 is a real configuration (see `ai/client.ts`), so `ai` can be
  // absent. NOT an error: it is the same "recorded as absent" answer by a different route.
  if (ai === undefined) return { summary: null, summarySource: 'unavailable' }
  if (changes.length === 0) return { summary: 'Nothing in manifest.yaml changed since the last approved release.', summarySource: 'llm' }
  try {
    const answer = await ai.post<{ choices: { message: { content: string } }[] }>('/chat/completions', {
      model: 'default-chat-onprem',
      messages: [
        { role: 'system', content:
          'You summarise changes to a university web application’s configuration for an administrator ' +
          'deciding whether to allow it into production. Three sentences at most. Plain English. ' +
          'Say what changed and why it might matter. Do not invent anything that is not in the list.' },
        { role: 'user', content: changes.map((c) => `${c.path}: ${c.from} -> ${c.to} (${c.summary})`).join('\n') },
      ],
      max_tokens: 200,
    })
    const text = answer.choices[0]?.message.content?.trim()
    // AN EMPTY ANSWER IS AN ABSENT ONE, not an empty summary: a blank line in the record
    // would read as "nothing changed" beside a list of changes.
    return text ? { summary: text, summarySource: 'llm' } : { summary: null, summarySource: 'unavailable' }
  } catch (error) {
    // NOT SWALLOWED. `.catch(() => undefined)` is this codebase's most productive defect, and
    // a failure with no operator line hides the next one. `AiError`'s message is already
    // mapped and carries no key hash (`ai/client.ts`).
    console.error(`[approval] the change summary could not be produced: ${(error as Error).message}`)
    return { summary: null, summarySource: 'unavailable' }
  }
}
```

- [ ] **Step 3: The tests, with the failure path driven rather than reasoned about**

```ts
it('summarises a list of changes through the model', …)                       // POSITIVE, first
it('records the summary as ABSENT when the model errors, and does not throw', async () => {
  const ai = { post: () => Promise.reject(new AiError('AI_BACKEND_UNAVAILABLE', 'gateway down')) }
  await expect(summariseChanges(ai as never, [change])).resolves.toEqual({ summary: null, summarySource: 'unavailable' })
})
it('records it as absent when the model answers an empty string', …)
it('records it as absent when AI is disabled entirely', …)
it('an approval still succeeds with an unavailable summary — end to end through the route', …)
```

**The last one is the test that matters and the one that would be left out.** A unit test of `summariseChanges` proves the function returns null; **only a route test proves the approval is still recorded**, which is Decision 7's actual claim.

- [ ] **Step 4: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | the `catch` rethrows instead of recording | *records the summary as ABSENT* red **and** the end-to-end approval test red with the AI error — **the shape Decision 7 exists to refuse, seen** |
| b | `summarySource` always `'llm'` | *records it as absent when the model answers an empty string* red |
| c | `buildDiffSnapshot` stores `{beforeReleaseId, afterReleaseId}` instead of the rendered changes | **every test above still passes** — write one that reads a stored snapshot's `changes[0].summary` and watch it go red. **Decision 6 is invisible to a test that only checks the approval was recorded**, and saying so is the finding |
| d | the `.sort()` on `attributes` removed | nothing goes red — **record it as a control that cannot fail in this tier**, and note that Task 19's demo compares two snapshots and is what would see it |

```bash
git add packages/control-plane/src/releases packages/control-plane/src/api
git commit -m "feat(releases): §13's diff_snapshot, with a summary recorded as absent rather than blocking"
```

---

## Task 12: R4's `Reviewer` seam — the interface, the honest `NullReviewer`, its caller, its NON-blocking item

> ### [M4] Correction block — EXECUTED 2026-09-19. Decision 13 is now MEASURED, and the new item id needs one more file.
>
> *TWO points; evidence in [`spikes/p6a-baseline/`](../spikes/p6a-baseline/README.md), `[M4]` Q5.*
>
> **1. `blocking: false` is measured, not argued — and here are the numbers to put in the test.**
> Against a real project through the edge: with all six blocking items forced to `met` and **no**
> seventh item, `ready` is **`true`** (the positive control — the path can say yes). Adding a
> seventh item `{blocking: true, state: 'not_built'}` makes `ready` **`false`**. The *same* item
> with `blocking: false` leaves `ready` **`true`**. So Decision 13's *"that test is the control
> that keeps production reachable for ever"* is a fact about this machine, and
> `readiness.test.ts` should assert all three rows — the middle one is what turns red if anyone
> flips `blocking`.
>
> **2. `'code-review'` MUST ALSO GO IN `api/representations/launch.ts`.** `LaunchReadinessItem.id`
> is a closed `z.enum([...])` at lines 8-15. Pushing an item with an id that is not in it made
> the route answer **`500 INTERNAL`** with
> `ResponseContractError: getLaunchReadiness answered a body its representation refuses, at:
> items.6.id`. The File Structure already lists that file for this task — this names the failure
> mode, which is a loud `500` rather than a dropped field, and it bites before any test of the
> reviewer runs.


> ### Sitting 7 correction block — EXECUTED 2026-09-20. What Task 12 INHERITS, and one thing its *Files* list gets wrong.
>
> *FOUR points, all measured while building Tasks 10 and 11.*
>
> **1. `buildDiffSnapshot` IS IN `releases/approval.ts`, NOT IN `launch/`, and its `review`
> literal is at the END of the returned object.** Replacing it with `deps.reviewer.review(...)`
> is a one-place change. **Its deps parameter is `SnapshotDeps = { db, llm }`** — add `reviewer`
> there, and the route passes the whole `ServerDeps`, so a `reviewer` field on `ServerDeps`
> satisfies it structurally with nothing to thread.
>
> **2. `ServerDeps` GAINED `llm` IN SITTING 7, AND `deps.ai` IS NOT AN LLM CLIENT.** `ai` is
> `AiKeyService` — §10's mint/store/revoke lifecycle — and has no `post`. Task 11's own snippet
> got this wrong (sitting 7, F1). If Task 12 wants a model, it is `deps.llm`, which is
> `LiteLlmClient | undefined`. `api/testing.ts` sets it to `undefined`, deliberately.
>
> **3. THE ITEM ID ENUM IS IN THREE PLACES, NOT TWO.** `[M4]`'s point 2 names
> `api/representations/launch.ts`. It is ALSO `LaunchItemId` in `launch/readiness.ts:13`, which
> `tsc` catches — and, since P5c, `packages/contract/src/schema.d.ts`, which is GENERATED, so
> `pnpm contract:write && pnpm contract:generate` is owed by this task even though it adds no
> route. Sitting 4 measured the same thing for event types: **published surface changes without
> a route.**
>
> **4. `readiness.test.ts`'s *"is not ready with nothing recorded"* NOW ASSERTS THE ITEM LIST BY
> NAME, and it will go red when `code-review` lands.** Its `items.map(i => i.id)` is an exact
> `toEqual` of six ids. So will `lifecycle.test.ts`'s `byId` map, which is an exact `toEqual` of
> six, and `packages/journey/src/main.ts`'s readiness check — **and that last one is NOT a Vitest
> file**, so `pnpm test` cannot see it and only `make demo-journey` will (sitting 7, F11).
> `packages/mock/src/fixtures.ts`'s `LAUNCH_READINESS` holds three items and is a subset by
> design, so it does not move.

**D33 and §15 are APPLIED and the spec already reads this way. Write against them; do not re-propose anything.** §15's row, verbatim: *"**Phase 2**: an interface with a null implementation, whose verdict is an honest `not_performed`, a real caller on the build/approval path, and a **non-blocking** `LaunchReadiness` item. It reviews nothing and says so (D33)."* §20's control-map row now opens ***"Still accepted under D9"*** and ends ***"until one lands nothing reviews code"*** — **nothing this task ships may make either sentence false.**

**Files:**
- Create: `packages/control-plane/src/launch/review.ts` — `Reviewer`, `ReviewRequest`, `ReviewVerdict`, `NullReviewer`
- Create: `packages/control-plane/src/launch/review.test.ts`
- Modify: `packages/control-plane/src/launch/readiness.ts` — the `code-review` item, `blocking: false`
- Modify: `packages/control-plane/src/api/representations/launch.ts` — the item id enum
- Modify: `packages/control-plane/src/releases/approval.ts` — the real caller (replacing Task 11's literal)
- Modify: `packages/control-plane/src/api/server.ts` — `deps.reviewer`, constructed once at boot

**Interfaces:**
- Consumes: Task 11's `buildDiffSnapshot`.
- Produces: `Reviewer`, `NullReviewer`, `ReviewVerdict`; and the `code-review` `LaunchItemId`.

- [ ] **Step 1: The interface, exactly as Decision 12 fixes it**

```ts
/**
 * D33 and §15: a seam for reviewing what the AGENT WROTE, shipped in Phase 2 with **no
 * implementation behind it**.
 *
 * §13's residual risk is that the gate reviews `manifest.yaml` and not code, and §20's
 * control map says the risk is **still accepted under D9** with containment as the control.
 * **Nothing in this file changes that**, and a reader who takes the existence of this
 * interface as evidence that code is reviewed has read it exactly backwards.
 *
 * TWO ARGUMENTS, because the two implementations that will follow read different things: a
 * static analyser reads the TREE (`source`) and an LLM reads the DIFF (`changes`). Shipping
 * one now and adding the other later would touch the builder, the approval record and
 * `LaunchReadiness` at once — D30's argument, which is D33's rationale in as many words.
 */
export interface ReviewRequest {
  projectId: string
  releaseId: string
  /** What the release CHANGED, from `describeDiff`. EMPTY for a first release, legitimately. */
  changes: readonly SpecChange[]
  /** Where the code IS. A bare repository path and a commit — `source/`'s driver 1 shape. */
  source: { repoPath: string; commitSha: string }
}

export interface ReviewFinding {
  severity: 'block' | 'advise'
  message: string
  path?: string
  line?: number
}

/**
 * `not_performed` IS A MEMBER OF THE UNION and not a null verdict, so `tsc` makes every
 * reader handle it and **nobody can mistake "no findings" for "nothing looked"**. That
 * confusion is the whole of what R4(b) forbids.
 */
export type ReviewVerdict =
  | { state: 'not_performed'; reviewer: string; reason: string }
  | { state: 'clean'; reviewer: string; checked: number }
  | { state: 'findings'; reviewer: string; findings: readonly ReviewFinding[] }

export interface Reviewer {
  readonly name: string
  review(request: ReviewRequest): Promise<ReviewVerdict>
}

/**
 * THE HONEST NULL IMPLEMENTATION (D33, §15, R4b).
 *
 * **It is not a stub that purports to review.** A placeholder that answered `clean` would be
 * another setting that reads like a control and is not — a class this project has measured
 * four instances of (P4a) — and the next person to read an approval record would believe it.
 * So the verdict names itself and says why there is nothing behind it.
 *
 * It takes the request and does not read it, deliberately: a first implementation that
 * quietly ignored its arguments would let the arguments be wrong without anything saying so,
 * and `review.test.ts` asserts that a request with an unreachable `repoPath` is answered
 * identically — which is the statement that this reviewer does not touch the disk.
 */
export const NullReviewer: Reviewer = {
  name: 'none',
  review: async () => ({
    state: 'not_performed',
    reviewer: 'none',
    reason:
      'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the ' +
      'controls that make that tolerable are containment — default-deny egress, network ' +
      'isolation, least privilege and edge protections (§20).',
  }),
}
```

- [ ] **Step 2: THE REAL CALLER — `buildDiffSnapshot`, replacing Task 11's literal**

**A module with no call site is not built, and this project has shipped that four times.** R4(b) says *"it must have a real caller from day one"*. The caller is the approval path:

```ts
  const verdict = await deps.reviewer.review({
    projectId: release.projectId,
    releaseId: release.id,
    changes,
    source: { repoPath: repoPathFor(deps.config, project.slug), commitSha: appSpec.commitSha },
  })
  …
    review: { state: verdict.state, reviewer: verdict.reviewer, detail: detailOf(verdict) },
```

**`detailOf` renders the union into one line for the record** — the `reason` for `not_performed`, the count for `clean`, the findings' messages for `findings`. **It is exhaustive over the union with no `default` branch**, so a fourth state added later is a `tsc` error rather than a silently unrendered verdict.

**`deps.reviewer` is constructed once in `server.ts`** as `NullReviewer`, and **`ServerDeps` types it as `Reviewer`** — so the day a real one exists, the change is one line at the construction site and nothing else. **That is what the seam is.**

- [ ] **Step 3: The checklist item — NON-BLOCKING, and the test that keeps it that way**

```ts
    {
      id: 'code-review',
      title: 'Code reviewed for safety',
      owner: 'Manifest',
      /**
       * **`false`, AND THIS IS NOT A PREFERENCE** (D33, R4c). `ready` is derived from every
       * BLOCKING item being met, so a seventh blocking item in state `not_built` would make
       * production unreachable for ever — the precise trap R1 exists to undo, reintroduced by
       * accident. It becomes blocking when a real implementation lands, and that is a
       * one-field change by design. `readiness.test.ts` asserts both directions.
       */
      blocking: false,
      state: 'not_built',
      builtBy: 'a tracked hardening item (SemgrepReviewer), not a plan',
      why: 'Manifest reviews manifest.yaml, not code (§13). Nothing reviews what the agent wrote; the controls that make that tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20). A reviewer interface exists with no implementation behind it (D33, §15).',
    },
```

```ts
it('the code-review item does not affect ready, in either direction', async () => {
  const view = await computeLaunchReadiness(db, projectWithEveryBlockingItemMet)
  expect(view.items.find((i) => i.id === 'code-review')).toMatchObject({ blocking: false, state: 'not_built' })
  // THE CONTROL THAT KEEPS PRODUCTION REACHABLE FOR EVER. Flip `blocking` to true in the
  // source and this goes red — which is the only thing standing between R4's seam and R1's
  // trap reintroduced.
  expect(view.ready).toBe(true)
})
```

**And the item's `why` must not read as though something reviews code.** Check it against §20's row word by word: *still accepted*, *containment remains the control*, *until one lands nothing reviews code*. **If the item's text and §20's row could be read as saying different things, the item's text is wrong.**

- [ ] **Step 4: The representation's enum gains a member — and the console is not ready for it**

`LaunchReadinessItem`'s `id` is a `z.enum`. **Adding `'code-review'` is a contract change**: `pnpm contract:write && pnpm contract:generate`, and **the console's launch screen renders items generically** (P5c Task 9) so it needs no change — **verify that by reading the screen rather than assuming it**, because P5c sitting 5 found three of its own claims about that renderer wrong.

- [ ] **Step 5: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | `blocking: true` on the item | *does not affect ready* red — **and a project with every real item met becomes unlaunchable**. Say that in the record: it is R4(c)'s trap, seen |
| b | `NullReviewer` returns `{ state: 'clean', checked: 0 }` | **NOTHING GOES RED unless you write the test for it.** Write *the null reviewer's verdict is `not_performed` and names itself*, and watch it. **This is the control R4(b) exists for and it is the one that will be forgotten** |
| c | `deps.reviewer.review(...)` replaced by Task 11's literal again | **nothing goes red.** Write *the snapshot's review comes from the injected reviewer* with a fake reviewer returning a distinctive name, and watch that one go red. **A seam with no caller is not built — and this is the test that says so** |
| d | `detailOf`'s `default` branch added back | **`tsc` stops catching a new verdict state** — demonstrate it by adding a fourth state and watching `pnpm typecheck` stay green |

**(b) and (c) together are this task's deliverable.** Without them the seam is a file.

```bash
git add packages/control-plane/src/launch packages/control-plane/src/releases packages/control-plane/src/api packages/contract
git commit -m "feat(launch): R4's Reviewer seam — an honest NullReviewer with a real caller (D33, §15)"
```

---

## Task 13: §7's last production clause — `auth.attributes` ⊆ `registered_attributes`, at BUILD time

**§7's *Validation* list ends with it, and §9 states the reason: *"Attribute drift is a build-time failure, not a login-time one… If the agent adds an attribute IAM never registered, the build fails with a plain message and a pre-generated change request, long before a student would have hit a broken login."***

**Files:**
- Create: `packages/control-plane/src/spec/registered-attributes.ts` — `assertRegisteredAttributes` and `AttributeDriftError`, both pure
- Create: `packages/control-plane/src/spec/registered-attributes.test.ts`
- Modify: `packages/control-plane/src/releases/build.ts` — the caller, before the driver builds
- **NOT `api/error-codes.ts`, and that is a decision rather than an omission** — see Step 1's second note

**Interfaces:**
- Consumes: Task 6's `getIamRegistration`.
- Produces: `assertRegisteredAttributes(requested, registered, context)`, throwing `AttributeDriftError`.

- [ ] **Step 1: The pure check, with the change request in the message**

```ts
/**
 * §7's last production clause and §9's *Attribute drift is a build-time failure*.
 *
 * **THE EMPTY-REGISTRATION CASE IS THE ONE THAT MATTERS.** Every set is a superset of
 * nothing, so a registration with no `registered_attributes` would make this check
 * vacuously true and silently disable it — the same fail-open shape S2 measured at the IdP,
 * where an empty attribute list releases EVERY attribute. The row cannot be empty (Task 5's
 * CHECK, and `records.ts`'s refusal), and this function refuses it anyway, because a check
 * that depends on a constraint elsewhere is a check that stops working when that constraint
 * moves.
 */
export function assertRegisteredAttributes(
  requested: readonly string[],
  registered: readonly string[],
  context: { slug: string; ticketRef: string | null },
): void {
  if (registered.length === 0)
    throw new AttributeDriftError(
      `this app's UBC IAM registration lists no attributes, so no production release can be ` +
      `checked against it (§9). Record what IAM registered before building for production.`)
  const missing = requested.filter((a) => !registered.includes(a)).sort()
  if (missing.length === 0) return
  throw new AttributeDriftError(
    `manifest.yaml asks for ${missing.length} CWL attribute(s) UBC IAM did not register for ` +
    `'${context.slug}': ${missing.join(', ')}. Registered: ${[...registered].sort().join(', ')}. ` +
    `A production release must request a subset of what was registered (§7, §9) — otherwise ` +
    `students hit a broken login on launch day. Raise an IAM change request` +
    `${context.ticketRef === null ? '' : ` against ${context.ticketRef}`} for the missing ` +
    `attribute(s), or remove them from auth.attributes.`)
}
```

**AND IT GETS NO `error-codes.ts` ENTRY, DELIBERATELY.** This refusal never reaches a client
as an HTTP answer: `finishBuild` catches it and records a **failed build row** whose log's last
line is the message (Step 2), which is §9's own shape — *"the build fails with a plain
message"*. `error-codes.ts` is the registry of codes **a client can receive**, held to the
source in both directions, so **a code listed there that no mapped class throws is a red
gate**. `AttributeDriftError` therefore carries a `code` field for `finishBuild`'s message
renderer — which reads `e.code`, `e.message` and `e.hint` — and nothing else.

**The message IS the "pre-generated change request" §9 asks for**, at the level this plan builds: it names the app, the missing attributes, what is registered, and what to do. **P8 generates the document; this generates the sentence, and saying which is which keeps §9 honest.**

- [ ] **Step 2: The caller — in `finishBuild`, before the driver runs**

```ts
async function finishBuild({ db, driver, bus }: BuildRunnerDeps, input: StartBuildInput, started: StartedBuild) {
  …
  try {
    /**
     * §9: the build fails with a plain message, long before a student hits a broken login.
     *
     * HERE rather than in `startBuild`, so the refusal is a RECORDED FAILED BUILD with the
     * reason as its log's last line — which is what a faculty member can read (§14) — rather
     * than a 4xx on a request nobody keeps. The `catch` below already turns a throw into
     * exactly that row.
     *
     * It runs for EVERY build, not only ones bound for production, because a release is
     * promoted rather than rebuilt (§13): the digest that reaches production is one this
     * function already made, and refusing at promotion time would be refusing the very
     * thing "promotion never rebuilds" exists to prevent.
     */
    const registration = await getIamRegistration(db, input.projectId)
    if (registration !== undefined) {
      const spec = await appSpecById(db, input.appSpecId)
      assertRegisteredAttributes(
        (spec.parsed as ManifestSpec).auth?.attributes ?? [],
        registration.registeredAttributes,
        { slug: input.projectSlug, ticketRef: registration.externalTicketRef },
      )
    }
    const image = await driver.buildImage(…)
```

**`registration === undefined` means no check**, and that is right rather than lax: an app with no registration cannot reach production at all, because Task 7's `iam-registration` item is `unmet`. **Say so in the comment**, because "skips the check when there is no row" reads like a hole until you know the gate is the other half.

- [ ] **Step 3: The tests**

```ts
it('allows a subset', …)                                   // POSITIVE, first
it('allows exactly the registered set', …)                 // the boundary
it('refuses one unregistered attribute, naming it and what IS registered', …)
it('refuses when the registration lists nothing, rather than passing vacuously', …)
it('is order-insensitive — a reordered list is not drift', …)
// AND THE ONE THAT PROVES IT IS WIRED:
it('fails the BUILD, with the reason as the log’s last line', async () => {
  // record an active registration for [ubcEduCwlPuid], build an app asking for mail too
  const build = await runBuildAndWait(…)
  expect(build.status).toBe('failed')
  const log = await getBuildLog(db, build.id)
  expect(log.at(-1)?.text).toContain('SPEC_ATTRIBUTES_UNREGISTERED')
  expect(log.at(-1)?.text).toContain('mail')
})
```

**The last one is the task's real deliverable.** The first five test a pure function; only that one tests that §9's sentence is true.

- [ ] **Step 4: Gates and controls**

**`pnpm test:docker` is OWED** (`releases/`, `build/`) — and the build test above is a Docker-tier test, because it runs a real build.

| | Control | Predicted |
|---|---|---|
| a | the caller removed from `finishBuild` | *fails the BUILD* red; **the five pure tests stay green** — the shape *a module with no call site is not built* takes here |
| b | the `registered.length === 0` guard removed, with an empty row forced in | *refuses when the registration lists nothing* red — **and note the connection to Task 5(d)**: with both removed, the check is silently off |
| c | `filter` → `some` (refusing only when ALL are missing) | *refuses one unregistered attribute* red |
| d | the check moved to the production **deploy** instead of the build | **every test above can be made to pass there too** — so write, in the record, why it is at build time: §13 promotes a digest this function already made, and a deploy-time check refuses the thing promotion exists to guarantee |

```bash
git add packages/control-plane/src/spec packages/control-plane/src/releases packages/control-plane/src/api
git commit -m "feat(spec): a production release may not request an unregistered CWL attribute (§7, §9)"
```

---

## Task 14: The D21 rehearsal, as R2 redefines it

**R2 is decided and its *required* clause is what this task is judged on: the item's own `why` text must say that the rehearsal proves the registration's SHAPE and never UBC's acceptance of it.** D21 asks for a run against `authentication.stg.id.ubc.ca`; C1 says this laptop cannot reach it; §9's real-Shibboleth run **remains an external-track obligation** and nothing here discharges it.

**Files:**
- Create: `packages/control-plane/src/launch/rehearsal.ts` — `runRehearsal`, `rehearsalItem`, `rehearsalCovers`
- Create: `packages/control-plane/src/launch/rehearsal.test.ts`
- Modify: `packages/control-plane/src/db/schema.ts` + a migration — `rehearsals` (see Step 1)
- Modify: `packages/control-plane/src/api/routes/launch.ts` — `POST /v1/projects/{id}/rehearsal`
- Modify: `packages/control-plane/src/launch/readiness.ts` — the `rehearsal` item reads the row

**Interfaces:**
- Consumes: Task 4's public-listener routing, Task 6's `getIamRegistration`, `sso/`'s `deriveSpEntity`.
- Produces: `runRehearsal(deps, projectId): Promise<RehearsalRow>`; a `rehearsal` item that is `met` by a **measurement**.

> **This task depends on Task 15 in the same sitting.** The rehearsal deploys the candidate digest into the production environment behind the gate, so it cannot be measured until a production deploy works. **Build Task 15 first if Task 14 blocks**, and say so in the record — the sittings table already warns that this pair is coupled.

- [ ] **Step 1: The row — what a rehearsal must record to be worth anything**

```ts
/**
 * D21, as R2 redefines it (2026-09-19): a LOCAL, PRODUCTION-SHAPED rehearsal that Manifest
 * automates, because C1 puts UBC's staging IdP out of reach of this laptop.
 *
 * **IT RECORDS WHAT IT WAS RUN AGAINST, and that is what makes it re-runnable and
 * invalidatable** (Decision 10): a rehearsal passed in week one must not certify a
 * registration that changed in week six. The three stored values are compared with what the
 * candidate release would register NOW, and a difference makes the item `unmet` with a
 * reason rather than silently stale.
 */
export const rehearsals = pgTable('rehearsals', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  releaseId: uuid('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
  passed: boolean('passed').notNull(),
  /** WHAT IT WAS RUN AGAINST — Decision 10's three values. */
  entityId: text('entity_id').notNull(),
  acsUrl: text('acs_url').notNull(),
  attributes: jsonb('attributes').notNull().$type<string[]>(),
  /**
   * THE EVIDENCE. §13's items are `met` by a measurement here, not a checkbox, so the row
   * carries what was actually observed: the instance that served, the status the sign-in
   * ended on, the attributes the assertion actually released, and the failure's reason when
   * it did not pass. NEVER the assertion itself and never a NameID — §14 redacts at capture.
   */
  evidence: jsonb('evidence').notNull().$type<{
    instanceId: string | null
    hostname: string
    listener: 'internal' | 'public'
    signInStatus: number | null
    attributesReleased: string[]
    reason: string
  }>(),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  ranBy: uuid('ran_by').references(() => users.id),
})
```

- [ ] **Step 2: What the rehearsal actually does, in order**

```ts
/**
 * R2's rehearsal, in five steps, each of which can fail and each of which is recorded.
 *
 * 1. **Deploy the candidate digest into PRODUCTION, behind the gate.** Not a copy and not a
 *    simulation: §13 says production runs the exact digest staging ran, and a rehearsal
 *    against anything else rehearses something else. It calls `deployRelease` directly —
 *    the INTERNAL function, not the route — because the route's gate is what this item
 *    exists to help satisfy, and a rehearsal that needed the gate open would be circular.
 * 2. **Its SP is registered with production-shaped values** — which `deployRelease` already
 *    does, deriving `https://<base>/sp/<slug>/production` and the public hostname from
 *    `environmentKind` (§9, D15). Read them back off the row rather than recomputing.
 * 3. **One real CWL sign-in against the Manifest IdP**, through the three-hop flow, ending
 *    at the app's own ACS on the PUBLIC listener.
 * 4. **The attributes the assertion actually released are read**, and compared with what was
 *    registered — §9's `core:AttributeLimit` enforcement measured rather than assumed, which
 *    is what S2 paid for.
 * 5. **Pass or fail is recorded with the evidence**, and the instance is left running or
 *    retired according to what the deploy did — a rehearsal never leaves a half-deployed app.
 */
```

**And the sentence R2 requires, on the item:**

```ts
    why: passed
      ? `A production-shaped rehearsal passed on ${row.ranAt.toISOString().slice(0, 10)}: the app was deployed to its production hostname on the public listener, its Service Provider was registered with production values, and one CWL sign-in completed releasing ${row.evidence.attributesReleased.length} attribute(s). **This proves the SHAPE of the registration — the entityID, the ACS URL, the attribute release and the certificate all work together. It proves nothing about UBC's acceptance of it**: the Manifest IdP is not real Shibboleth (D6), and the run against UBC's staging IdP that D21 describes remains an external-track obligation (§9).`
      : `The rehearsal did not pass: ${row.evidence.reason}`,
```

**That paragraph is not decoration.** R2 says *"so nobody mistakes one for the other"*, and the next person to read this checklist will be deciding whether an application may go in front of students.

- [ ] **Step 3: Invalidation — Decision 10, as a comparison**

```ts
/**
 * Does this rehearsal still certify what would be registered NOW? (Decision 10.)
 *
 * Compared against what the CANDIDATE RELEASE would register, derived the same way
 * `deployRelease` derives it — never against the stored `IamRegistration`, which is what UBC
 * accepted and is a different question. Attributes are compared as a SORTED SET, because
 * reordering a list is not a change of intent (`spec/diff.ts` makes the same rule twice).
 */
export function rehearsalCovers(row: RehearsalRow, would: SpEntity): boolean {
  return row.entityId === would.entityId
    && row.acsUrl === would.acsUrl
    && stableSorted(row.attributes) === stableSorted(would.attributes)
}
```

- [ ] **Step 4: The route — an administrator runs it, and it takes time**

```ts
  defineRoute({
    operationId: 'runRehearsal',
    method: 'POST',
    path: '/v1/projects/{projectId}/rehearsal',
    tag: 'launch',
    summary: 'Run the pre-production rehearsal',
    description:
      "D21, as P6a redefines it for a laptop (R2): deploys the candidate release into production behind the gate, registers its Service Provider with production-shaped values, completes one CWL sign-in and records pass or fail with evidence. It proves the registration's SHAPE, never UBC's acceptance of it. Up to ~90 s.",
    …
    success: { status: 200, description: 'The rehearsal, passed or failed.', schema: Rehearsal },
    errors: ['NOT_FOUND', 'FORBIDDEN', 'TOKEN_CREDENTIAL_REFUSED', 'REHEARSAL_NO_CANDIDATE',
             'REHEARSAL_NOT_CWL', 'RELEASE_DIGEST_MISSING'],
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)                       // D14, Decision 18
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      return toRehearsal(await runRehearsal(deps, params.projectId, actor))
    },
  }),
```

**`REHEARSAL_NOT_CWL` is `[M9]`'s finding made into a code.** An app with `auth.provider: none` registers no SP at all, so there is nothing to rehearse — **and the item must say so rather than failing**: for such an app the rehearsal item is `met` with *"this app signs nobody in, so there is no registration to rehearse"*, the same shape `iam-registration` already uses. **A route that refused would make a non-CWL app unlaunchable**, which is R4(c)'s trap in a different costume.

- [ ] **Step 5: Un-skip Task 7's test**

**Task 7 left `deploys to production when every blocking item is met` skipped, with the reason in its name.** Every blocking item is now buildable: record an `active` registration, an `approved` PIA, run the rehearsal, approve the release with a stepped-up admin. **Un-skip it, run it, and report `pnpm test`'s count with `0 skipped`** — the number that has been carrying a skip since Task 7 comes back.

**Then re-run Task 7's control (a)**, which could not fail then: `assertLaunchable` throwing unconditionally now turns that test red. **Record that the prediction held or did not** — a wrong prediction is itself a finding.

- [ ] **Step 6: Gates and controls**

**`pnpm test:docker` is OWED** — the rehearsal deploys, registers an SP and signs in.

| | Control | Predicted |
|---|---|---|
| a | `rehearsalCovers` returns `true` unconditionally | *a rehearsal is invalidated when auth.attributes changes* red |
| b | the CWL sign-in step skipped, `passed: true` recorded anyway | **write *a rehearsal that could not sign in is recorded as FAILED* and watch it** — a rehearsal that records a pass without the measurement is a checkbox, which R2 rejected by name |
| c | the deploy targeted `staging` instead of `production` | *the evidence names the production hostname and the public listener* red — **and without that assertion nothing would notice**, which is why the evidence carries `listener` |
| d | R2's *shape, not acceptance* sentence deleted from the item's `why` | **nothing goes red.** Write `it('says the rehearsal proves the shape and not UBC acceptance', …)` asserting the item's text contains both clauses, and watch it. **A required sentence with no test is a sentence that will be edited out** |

**(d) is the control for a requirement about WORDS, and it is unusual enough to be worth stating: R2 made the sentence a condition, so the sentence gets a test.**

```bash
git add packages/control-plane/src/launch packages/control-plane/src/db packages/control-plane/drizzle packages/control-plane/src/api packages/contract
git commit -m "feat(launch): D21's rehearsal, production-shaped and local (R2) — met by measurement"
```

---

## Task 15: The first production deploy — the digest verified before anything starts

**No release has ever been deployed to production by this platform**, so the production half of `deployRelease`, of SP registration, of routing and of retire has **never run** (brief §2.2). **Treat that sentence the way P3's *no build had ever succeeded* deserved to be treated.**

**Files:**
- Modify: `packages/control-plane/src/releases/release.ts` — digest verification against the approval
- Create: `packages/control-plane/src/releases/production.docker.test.ts`
- Modify: `packages/control-plane/src/api/error-codes.ts` — `RELEASE_DIGEST_NOT_APPROVED`

**Interfaces:**
- Consumes: Task 10's `latestApprovalFor` / `approvalCoversDigest`, Task 4's public-listener routing.
- Produces: a production deploy that works, and the refusal that guards it.

- [ ] **Step 1: §13's *deployment verifies that digest before starting anything***

```ts
  /**
   * §13's *Integrity of the gate*: "Approval binds to an immutable image digest, and
   * deployment verifies that digest before starting anything."
   *
   * **BEFORE ANYTHING** is the operative phrase and it is why this is here rather than in
   * the route: an instance row, a service, a Service Provider registration and a network are
   * all side effects, and a check after any of them has left something behind. This sits
   * immediately after the digest is read and before `assertPromotable`.
   *
   * The check is the GATE'S second half rather than a duplicate of it: `assertLaunchable`
   * asks whether the checklist is satisfied, which includes an approval; this asks whether
   * the approval covers THIS digest. A rebuild between the two answers yes to the first and
   * no to the second, and that window is exactly what "binds to an immutable digest" means.
   */
  if (environment.kind === 'production') {
    const approval = await latestApprovalFor(db, release.id)
    if (approval === undefined || !approvalCoversDigest(approval, digest))
      throw new ReleaseError('RELEASE_DIGEST_NOT_APPROVED',
        `no administrator approval covers image digest ${digest.slice(0, 19)}… for this release. ` +
        `An approval binds the exact digest (§13), so a rebuild needs a new approval.`)
  }
```

- [ ] **Step 2: Drive it, and find what has never run**

**This step is a measurement, not a code change.** Deploy a real release to production, with every blocking item met, and **write down what happens at each stage** — because five code paths run for the first time:

| Stage | What is new | What to watch |
|---|---|---|
| SP registration | `environmentKind: 'production'` in `deriveSpEntity` | the entityID ends `/production`; the ACS is the bare `<slug>.manifest.internal`; the IdP row exists |
| Service binding | a production Mongo, a production egress proxy | container names carry `-production-`, not `-staging-` |
| `ensureInstance` | the readiness probe on `:8443` (Task 4) | `waitForIdentity` succeeds **as the instance**, not against the wildcard |
| `applyRoute` | `srv1` (Tasks 3–4) | the route appears under `srv1`'s routes and **not** `srv0`'s |
| The `Route` row | `listener: 'public'` | §6's row, written for the first time with a value other than `internal` |
| Retire | a production instance replaced | the drain reads the right upstream; nothing on `srv0` is touched |

**Expect defects here.** P3's equivalent step found seven of one shape — *the test constructs the value correctly and the running system re-derives it wrongly* — and this is the same shape of moment.

- [ ] **Step 3: The Docker test**

```ts
it('deploys a release to PRODUCTION, on the public listener, as the instance it started', …)
it('registers the SP with production values, and the row is in the IdP', …)
it('refuses a deploy whose digest no approval covers: RELEASE_DIGEST_NOT_APPROVED', …)
it('refuses when the approval covers a DIFFERENT digest — a rebuild', …)
it('a production route is NOT on srv0', …)
```

**The last is the one nothing else covers**: Task 4 proved the reachability, this proves the platform's own record.

> ### Correction block — ADDED BY SITTING 6, 2026-09-20, AND DECIDED BY RICH. Task 15 owes `release:promote` its step-up call site.
>
> **`release:promote` IS IN `STEP_UP_GUARDED` AND NO ROUTE CALLS `assertStepUp` FOR IT.**
> Sitting 6 built the guard and wired it to `members:manage` (Task 9) and to confirming a
> pending action (F12). The production deploy route authorizes `release:promote` at
> `api/routes/releases.ts` and never asks for freshness — so the set member is, today,
> **enforced by nothing**, which is the *"reads like a control and is not"* shape this
> project has paid for four times.
>
> **It is not a live hole**, and that is why it was not fixed on the spot: §13's checklist
> refuses every production deploy until `rehearsal` and `admin-approval` exist, so the route
> is unreachable until this task. And there is a coherent reading in which it never needs
> one — §13 puts the human decision in the **approval** (Task 10, which does step up) and
> makes the deploy the mechanical execution of it, so a stolen session cannot approve,
> cannot make the checklist ready, and cannot deploy.
>
> **Rich chose to add the call site here anyway (2026-09-20)**, for §20's own sentence:
> *"A stolen admin session must not be sufficient to put an app on the public internet."*
> Defence in depth behind the approval, and it makes that sentence true of the **deploy**
> rather than only of the decision.
>
> **Add to Step 2**: `assertStepUp(actor, 'release:promote')` immediately after the
> `assertCapability` that selects `release:promote` for a production environment — and
> **only on that branch**, because a staging deploy is `release:deploy` and is not guarded.
> Add `'STEP_UP_REQUIRED'` to the route's `errors:` list, give the matrix's **production**
> deploy row `STEP_UP` for `owner` and `admin`, and regenerate the contract.
>
> **Its control is row (e) below**, and it is cheap: the existing production-deploy rows are
> the only ones that can see it.

- [ ] **Step 4: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | the digest check removed | *refuses a deploy whose digest no approval covers* red, and *…a DIFFERENT digest* red |
| b | the check moved after `ensureInstance` | **every test above still passes** — write one that asserts no instance row exists after a refused production deploy, and watch it go red. **"Before starting anything" is a claim about SIDE EFFECTS and only a side-effect assertion can see it** |
| c | `approvalCoversDigest` ignores `decision` | write *a REJECTED approval does not authorise a deploy* and watch it |
| d | `listenerFor` forced to `'internal'` | *a production route is NOT on srv0* red, **and** Task 4's Docker cases red |
| e | `assertStepUp(actor, 'release:promote')` removed (the correction block above) | **the matrix's two production-deploy rows red**, `owner` and `admin`, expecting `403 STEP_UP_REQUIRED` and getting the deploy's own answer. **Predict which answer** before running it — sitting 6's control (b) fired five red where the plan said one, and its (e) fired where the plan said none |

```bash
git add packages/control-plane/src/releases packages/control-plane/src/api
git commit -m "feat(releases): the first production deploy, with its digest verified before anything starts"
```

---

## Task 16: Gate integrity, asserted — the registry, the laptop-image rule, the record

**§13's *Integrity of the gate* is five claims. Tasks 10 and 15 BUILT two of them. This task ASSERTS the other three, which are already true and have nothing holding them true.** That is the brief's own framing: *"digest verification, the non-repudiable record, and **assertions** for what already holds."*

**Files:**
- Create: `packages/control-plane/src/api/registry-scope.docker.test.ts` — or extend the existing `registry-token.docker.test.ts`
- Create: `packages/control-plane/src/releases/gate-integrity.test.ts`
- Modify: `scripts/verify.sh` — one check for the registry's realm

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new — **this task's deliverable is that five claims become falsifiable.**

- [ ] **Step 1: The five claims, and which are already covered**

| §13's claim | State | This task |
|---|---|---|
| Approval binds an immutable digest | **built**, Task 10 | assert that the approval's digest is the BUILD's and not the release id |
| Deployment verifies it before starting anything | **built**, Task 15 | Task 15's control (b) is the assertion |
| The registry rejects pushes from app and sandbox contexts | **built in P1**, `REGISTRY_AUTH: token`, S1 settled it | **assert it** — nothing in the repository does |
| The approval record is non-repudiable | **built**, Task 5's insert-only table | assert that two decisions leave two rows and that neither can be updated |
| Images built on a laptop never reach UBC infrastructure | **built in P3**, `assertPromotable` | assert it **for a production environment**, which has never been exercised |

- [ ] **Step 2: The registry's scope, measured rather than asserted from configuration**

```ts
/**
 * §13: "The image registry rejects pushes from app and sandbox contexts. Only the builder
 * may push. Without this, 'promotion never rebuilds' is defeated by overwriting a tag."
 *
 * S1 settled that `registry:2` enforces a per-repository-path scope through `docker push`
 * and rootless BuildKit both, and P1 wired `REGISTRY_AUTH: token` with the control plane as
 * the realm. **Nothing in this repository has ever asserted it**, so it is one configuration
 * edit away from silently not being true — which is what this test exists to notice.
 *
 * Driven through the REALM, the way the daemon does: ask `/internal/registry/token` for a
 * push scope on somebody else's repository and read what comes back.
 */
it('the token realm refuses a push scope for a repository the caller does not own', …)
it('and grants one for the repository it does own — the positive control', …)
```

**The second is not optional.** A realm that refused everything would pass the first, which is P5c's F16 for the sixth time in this plan.

- [ ] **Step 3: The record's non-repudiability**

```ts
it('two decisions on one release leave two rows, newest first', …)
it('an approval row has no update path — the module exports no updater', () => {
  // A STRUCTURAL assertion, deliberately: the guarantee is that the code cannot edit a
  // record, and a test that tried an UPDATE would be testing Postgres. This reads the
  // module's own surface, the way `module-boundaries.test.ts` reads imports.
  expect(Object.keys(approvalModule)).not.toContain('updateApproval')
})
it('records the ACTOR and the TIMESTAMP, and the actor is the stepped-up session’s user', …)
```

- [ ] **Step 4: `assertPromotable` for a production environment**

```ts
it('a driver declaring a remote target refuses a local/ image bound for PRODUCTION', …)
it('and the local Docker driver accepts one — which is what makes the laptop journey possible', …)
```

**Both directions, because §13's rule is scoped to the DRIVER and not to the environment kind**, and a test that only checked production would quietly re-attach it to the kind — the mistake §13 spends a paragraph warning against.

- [ ] **Step 5: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | `REGISTRY_AUTH_TOKEN_SERVICE` changed in `compose.yaml` | the realm test red — **and `make verify`'s new check red before it**, which is the cheaper signal |
| b | the realm grants every requested scope | *refuses a push scope for a repository the caller does not own* red, *the positive control* green — **the pair is what localises it** |
| c | `assertPromotable`'s `remoteTarget` branch inverted | both promotion tests red, in opposite directions |
| d | `recordApproval` changed to update the newest row | *two decisions leave two rows* red |

```bash
git add packages/control-plane/src scripts/verify.sh
git commit -m "test(releases): §13's integrity of the gate — five claims, all falsifiable"
```

---

## Task 17: The console — readiness with actions, and the two external records

**Files:**
- Modify: `packages/console/src/api.ts` — `getLaunchRecords`, `recordIamRegistration`, `recordPrivacyAssessment`, `runRehearsal`
- Modify: `packages/console/src/screens/launch.tsx` — the checklist gains actions
- Create: `packages/console/src/screens/records.tsx` — the two records, administrators only
- Modify: `packages/console/src/router.ts`, `app.tsx`
- Modify: `packages/console/src/api.test.ts` — the new calls, against `manifest-mock`
- Modify: `packages/mock/src/fixtures.ts`, `server.ts` — the new operations

**Interfaces:**
- Consumes: Tasks 6 and 14's operations.
- Produces: console callers for four operations, and mock fixtures for them.

- [ ] **Step 1: The data layer — one function per operation, in the one file**

```ts
    async getLaunchRecords(projectId: string): Promise<Schemas['LaunchRecords']> {
      return unwrap(await client.GET('/v1/projects/{projectId}/launch-records', {
        params: { path: { projectId } },
      }), 'getLaunchRecords')
    },
    /** THE KEY IS AN ARGUMENT (D23.6): made once per user action, reused on a retry. */
    async recordIamRegistration(projectId: string, body: Schemas['RecordIamRegistrationRequest'], k: string) { … },
```

**Decision 6 of P5c is still in force: components call these and never hold the client.** That is what makes the coverage gate readable and the Node test possible.

- [ ] **Step 2: The checklist gains actions — and it must not become a second checklist**

**`launch.tsx` renders `LaunchReadiness` generically today**, and P5c sitting 6 measured the `409` envelope's copy and the read's as **byte-identical through one renderer**. **Keep that.** An action is attached by item `id`:

```tsx
// ACTIONS BY ITEM ID, and the item's own `why` is still what the person reads. The console
// does NOT restate an item's meaning: P5c sitting 6 measured the two paths byte-identical
// and Task 7 asserts it server-side, and a console that wrote its own sentence beside the
// server's would be a third statement of the same fact (§9's restated-number lesson).
const ACTION: Partial<Record<LaunchItemId, (p: Ctx) => ReactNode>> = {
  'iam-registration': ({ isAdmin, projectId }) => isAdmin ? <Link to={`/projects/${projectId}/records`}>Record what UBC IAM said</Link> : null,
  'privacy-assessment': ({ isAdmin, projectId }) => isAdmin ? <Link to={`/projects/${projectId}/records`}>Record the privacy assessment</Link> : null,
  rehearsal: ({ isAdmin }) => isAdmin ? <RunRehearsalButton/> : null,
  'admin-approval': ({ isAdmin, candidateReleaseId }) => isAdmin && candidateReleaseId ? <Link to={`/releases/${candidateReleaseId}/approval`}>Review this release</Link> : null,
}
```

**`code-review` deliberately has no action** — nothing can be done about it, which is the honest state, and an action that led somewhere would imply otherwise.

- [ ] **Step 3: `records.tsx` — a form that writes external state, and says so**

**Three things the screen must get right, each for a reason the platform has paid for:**

1. **It names the ticket reference as the point.** §15's row: *"a human submits and pastes a ticket reference"*. A form that treats it as optional metadata misses what the object is for.
2. **The attribute list is entered as what UBC registered, not as what the app asks for.** A prefilled list taken from `manifest.yaml` would make Task 13's subset check vacuously true for every project — **the same fail-open S2 measured at the IdP.** Show the app's requested attributes **beside** the field, clearly labelled as *requested*, and leave the field empty.
3. **The state is chosen from the arrows that exist**, not from all five: the form offers only the transitions `iamTransition` allows from the current state, **read from the API's refusal rather than restated in the console** — offer all, and render `LAUNCH_TRANSITION_INVALID`'s message through `<Refusal>`. **A console that restated the state machine would be a second copy of it**, which is the D22 finding P5c already recorded for D24's privileged four.

- [ ] **Step 4: The mock serves them too**

**`packages/mock` must answer every documented operation** — its own `server.test.ts` asserts exactly that, so the four new ones are not optional. **Fixtures typed as `Schemas['…']` and validated by Ajv against `openapi.json`**, which is what caught a token fixture naming a capability that does not exist (P5c sitting 8, F1).

- [ ] **Step 5: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | a new operation's caller removed from `api.ts` | `coverage.test.ts` red, naming the operation — **the message `[M7]` recorded** |
| b | a fixture given a state the enum does not have | `packages/mock/src/validate.test.ts` red — **`tsc` does NOT see it** (P5c sitting 8, F1), so this control is about Ajv and the record should say so |
| c | the attribute field prefilled from `manifest.yaml` | **nothing goes red** — record it as a control that cannot fail, and note that the only thing that would catch it is Task 19's demo asserting a build refusal |

```bash
git add packages/console packages/mock
git commit -m "feat(console): the launch checklist with actions, and the two external records"
```

---

## Task 18: The console — approvals, the step-up prompt, and D22's reckoning

**Files:**
- Modify: `packages/console/src/api.ts` — `approveRelease`, `rejectRelease`, `getApproval`
- Create: `packages/console/src/screens/approvals.tsx`
- Modify: `packages/console/src/auth.ts` — the step-up navigation (**the only file allowed to name a `/auth/` path**)
- Modify: `packages/console/src/ui.tsx` — `<Refusal>` renders `STEP_UP_REQUIRED` as an action
- Modify: `packages/console/src/coverage.test.ts` — `DELIBERATELY_UNCALLED`, with reasons

**Interfaces:**
- Consumes: Tasks 10 and 11's operations; Task 9's `STEP_UP_REQUIRED` envelope.
- Produces: the screen an administrator decides on, and **the honest statement of which operations no client calls**.

- [ ] **Step 1: The approval screen shows the diff, and the verdict beside it**

**What it renders, in this order, because it is what a person decides on:** the digest (truncated, with the full value on hover); the AI summary **or the words *"a summary could not be produced"*** when `summarySource` is `unavailable` — **never a blank space**, which reads as *nothing changed*; the rendered `changes`; services, attributes and resources; **and R4's verdict**, rendered as *"No code reviewer is configured"* with D33's reason. **The verdict is shown even though it is `not_performed`** — R4(b): a seam nobody can see is a seam nobody will build on, and an administrator approving code that nothing reviewed should be told so.

- [ ] **Step 2: The step-up prompt — `<Refusal>` gains one branch**

```tsx
// §20's step-up, rendered as the ACTION it is rather than as an error. The envelope's `hint`
// already says what to do (Task 9), and this turns it into the link. `returnTo` is the page
// the person is on, which `safeReturnTo` re-checks server-side — the console does not have
// to be trusted about it.
{error.code === 'STEP_UP_REQUIRED' && (
  <p><a href={stepUpUrl(window.location.pathname)}>Confirm it is you, then try again</a></p>
)}
```

**`stepUpUrl` lives in `auth.ts`**, which is the one file allowed to name a `/auth/` path — `boundary.test.ts` asserts it, and it was written because **the import boundary cannot see a `fetch` or a path literal** (P5c Decision 5).

- [ ] **Step 3: D22's RECKONING — read the list, in full, and write it down**

**This is the step the gate cannot do for you** (*Read this first* 18). **Go through every operation P6a added and put each in one of two columns, in the record:**

| Operation | Caller, or the reason it has none |
|---|---|
| `getLaunchRecords` | `screens/launch.tsx` and `screens/records.tsx` |
| `recordIamRegistration` | `screens/records.tsx` |
| `recordPrivacyAssessment` | `screens/records.tsx` |
| `runRehearsal` | `screens/launch.tsx` |
| `approveRelease` | `screens/approvals.tsx` |
| `rejectRelease` | `screens/approvals.tsx` |
| `getApproval` | `screens/approvals.tsx` |
| *(anything else)* | **a `DELIBERATELY_UNCALLED` entry with a reason a reader can check — never a weakened regex** |

**`DELIBERATELY_UNCALLED` has been EMPTY since P5c**, and that emptiness is a measurement about the API's completeness. **If P6a has to add the first entry, say so loudly in the record** — it is D22's question answering *"not quite"* for the first time, and that is worth more than a green gate.

- [ ] **Step 4: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | every operation moved into `DELIBERATELY_UNCALLED` | **GREEN** — `[M7]` measured it. Run it once, watch it pass, restore, and **put the measurement in the record beside the list**, because it is the reason a human reads the list |
| b | `<Refusal>`'s step-up branch removed | **nothing goes red** (no DOM tier, P5c Decision 7) — **record it, and note that Task 19's clicked half is the only thing that sees it** |
| c | the summary rendered as `{summary}` with no null branch | nothing goes red; **it is Task 19's clicked half again.** Say so rather than implying coverage |

**Two of this task's three controls cannot fail in any tier, and that is P5c Decision 7's stated cost being collected.** Write it plainly.

```bash
git add packages/console packages/mock
git commit -m "feat(console): the approval screen, the step-up prompt, and D22's coverage reckoning"
```

---

## Task 19: The acceptance — `make demo-production`

**ALONE, AND LAST, and it is this plan's own task rather than something that happens after the last feature** (brief §10's third surviving rule).

**Files:**
- Create: `scripts/demo-production.sh` — the shell half: sign-ins, and the administrator
- Create: `packages/journey/src/production.ts` — the API half, through `@manifest/contract` alone
- Modify: `Makefile` — `demo-production`
- Modify: `scripts/offline-acceptance.sh` — an **eleventh** step
- Modify: `scripts/ci-acceptance.sh` — the step, and the four `EXPECT_` counts
- Modify: `docs/superpowers/WALKTHROUGH.md`, `docs/superpowers/RUNBOOK.md`

**Interfaces:**
- Consumes: everything.
- Produces: **an app in production, with every one of D19's five blocking items honestly met.**

- [ ] **Step 1: The split, unchanged from P5a Decision 38**

**Signing in is the browser's and the IdP's business** (D23.8), so it is `infra/lib/idp-login.sh` in bash; **everything Manifest's API does is TypeScript importing nothing but `@manifest/contract`**, so `tsc` checks the whole demo against the published contract. **`packages/journey/src/boundary.test.ts` enforces it** — and it matches on imports with a comment stripper, because a naive regex matched English prose in a doc comment and turned `pnpm test` red on a file with no forbidden import (P5b sitting 8, F3).

- [ ] **Step 2: What the demo does, in order, and what each step proves**

| | Step | What it proves |
|---|---|---|
| 1 | an instructor signs in with CWL and creates `launch-app` from the proof-app starter | nothing new — the ground |
| 2 | builds it, releases it, deploys it to **staging**, and the app answers | §13's *promotion never rebuilds*: this is the digest production will run |
| 3 | asks to deploy to **production** and is refused | **`409 RELEASE_PRODUCTION_GATE_UNAVAILABLE`, and the envelope's checklist names five blocking items with THREE unmet** — assert the codes and the item ids, never the status |
| 4 | an **administrator** signs in and records the IAM registration `active` and the PIA `approved` | R1: real rows an administrator satisfies out of band |
| 5 | runs the **rehearsal**, which deploys the candidate into production behind the gate, registers a production SP and completes a CWL sign-in | R2: the item is met by a **measurement**, and the evidence names the public listener |
| 6 | approves the release — **and is refused `403 STEP_UP_REQUIRED` first** | §20: a stolen admin session is not enough |
| 7 | steps up through the IdP and approves | §13's non-repudiable record, bound to the digest |
| 8 | deploys to **production**, and **the app answers on its production hostname as the instance** | **the first production launch**, and `X-Manifest-Instance` is what proves it is the app and not the wildcard |
| 9 | reads the checklist again: **`ready: true`, five blocking items met, `code-review` present and non-blocking** | R4's seam is visible and harmless |
| 10 | rebuilds, and reads the checklist: **`admin-approval` is `unmet` — "this release was rebuilt since it was approved"** | Decision 11, which reads as a bug until it is demonstrated |

**Step 3's assertion is the one to write carefully.** *"Three unmet"* is a count over a structure; assert the **ids** as a sorted list, because a checklist that returned six unmet items would satisfy a count of three by accident on the wrong day.

- [ ] **Step 3: Print the measurements, not just the ticks**

`checks.ok` prints its `detail` **only when the check fails** (P5a sitting 12, finding 1), so **a green run throws away everything it measured.** Print, with `console.log`: the candidate digest; the checklist's unmet ids at step 3 and at step 9; the rehearsal's evidence line; the approval's digest; the production instance id and the `X-Manifest-Instance` the app answered with; and the deploy's duration. **A run that passed for the wrong reason must not be byte-identical to one that passed for the right one.**

- [ ] **Step 4: The offline step, and the CI step**

**`scripts/offline-acceptance.sh` gains an ELEVENTH step**, guarded by the same control-plane check steps 6–10 use, and **appended rather than replacing anything** (P4a defect 70 was a second `trap`). **What it proves offline that the other ten do not:** a production launch needs the registry (the digest is verified and the image is pulled), the IdP (twice — the rehearsal's sign-in and the step-up), and `ai/` for the summary — **and the summary is the one that may legitimately be absent with the network off**, which is Decision 7 being demonstrated rather than argued. **Say so in the step's comment**, so a `summarySource: unavailable` in an offline run reads as the design and not as a failure.

**`scripts/ci-acceptance.sh` gains the step and its `EXPECT_` counts move.** Every step **reports rather than exits**, so a red run is a measurement; a moved count reads `MOVED`, not `FAIL`.

- [ ] **Step 5: The clicked half — SHARED, and recorded**

**An agent driving Chrome cannot type a password** (ORIENTATION §4, measured 2026-09-16), and **step-up makes this worse rather than better: it adds a SECOND IdP hop per privileged action** (brief §8). **The extension's per-site permission on `idp.manifest.internal` is intermittent** (P5c F15), so the clicked run must be able to proceed blind across an IdP hop, reading the tab's title.

**So the clicked half follows P5c's R3 exactly**: the agent drives Chrome and reads every page, **Rich types every password and says so**, and the run is recorded as a GIF. **Offer it; do not assume it.** And **WALKTHROUGH.md carries the checklist in full** so Rich can run it alone afterwards — **naming what he will actually see**, not what the plan imagines (P5c F12: a checklist said *"Instructor One"*, which is the mock's fixture name, where the platform says *"Test Instructor"*).

**The rows that only a person can prove:** the step-up prompt actually re-prompts at the IdP; `<Refusal>`'s step-up link goes somewhere useful; the summary's absent state renders as words rather than a blank; and the approval screen shows R4's *"No code reviewer is configured"*.

- [ ] **Step 6: Three runs, and the negative controls**

**Green three times**, as every acceptance since P5a: on the machine the last sitting left, on the re-use path, and **from an `echo reset | make reset` machine** — which needs `make up`, the migration, the control plane started, **and `make host-setup` if the reset removed the aliases**. **Check the aliases after a reset**: `127.0.0.3` is new in this plan and `make reset` has never had to preserve it.

| | Control | Predicted |
|---|---|---|
| a | `assertLaunchable` returns without checking `ready` | step 3 green where a refusal belongs → **red at step 3's code assertion**; and steps 4–7 then pass trivially, so **assert the code, not the status** |
| b | the IAM registration recorded as `submitted` instead of `active` | step 9 red: `ready: false`, `iam-registration` unmet naming the state |
| c | `assertStepUp` removed from the approve route | **step 6 red** — the refusal that should come first does not come |
| d | `approvalCoversDigest` made a prefix comparison | **step 10 red**: the rebuilt release reads as still approved |
| e | `MANIFEST_CADDY_SERVER_PUBLIC=srv0` | **step 8 red** — `waitForIdentity` reports the wildcard, in its own words |
| f | the rehearsal's sign-in skipped | step 5 red on the evidence's `attributesReleased` being empty |
| g | `deps.reviewer` swapped for one answering `clean` | **step 9 stays green** — record it: **nothing in the demo can see a dishonest reviewer**, and Task 12's control (b) is the only thing that can |

**(g) is predicted to be invisible, and P5b sitting 9 is the reason to say so in advance and then check.** A prediction of invisibility that turns out wrong is itself a finding, and it has happened here before.

- [ ] **Step 7: Close out the plan**

**The full sweep, plus the things that are specific to P6a:**

- **ORIENTATION §3's *What the platform keeps true*** gains the production invariants: a production route is on the public listener; an approval binds a digest that is verified before anything starts; the checklist's items read real rows; **and R4's seam reviews nothing and says so.**
- **ORIENTATION §4** gains the second alias, the two dnsmasq answers, and what `make reset` does to them.
- **§21's *honest divergences* item 2** — **Spec action 1, Rich's.** Do not edit the spec.
- **The four shared HTML pages**: `manifest-phases.html` states the two check commands' total (`make doctor` + `make verify`), which **moves in Task 2 and Task 3**. It has been wrong before for exactly this reason.
- **`docs/external-track.md`**: **P6a's R1 makes the external track more urgent, not less** — it builds the objects a real IAM registration and PIA would populate, and the demo is now waiting on real ones. Say so with the date.

```bash
git add scripts Makefile packages/journey docs
git commit -m "feat: make demo-production — an app reaches production with every item honestly met"
```

---

## What this plan does not build

**Named so the next plan inherits a list rather than a surprise.**

- **D9.2 — subsequent releases, and `isSensitiveDiff`'s first caller. THIS IS P6b AND IT IS THE WHOLE OF P6b.** `spec/diff.ts` has held `isSensitiveDiff`, `SENSITIVE_FIELDS` and `describeDiff` since P2 with **no caller for approval purposes**; P6a calls `describeDiff` (Task 11) and deliberately does **not** call `isSensitiveDiff`. **And P6b inherits one thing from a brief that is not P6's**: [`2026-09-19-authoring-api-brief.md`](./2026-09-19-authoring-api-brief.md) measured that **an app can be deployed through the API and cannot be created through it** — zero `PATCH` or `PUT`, no repository reference, `validateSpec` reads `manifest.yaml` rather than writing it. **The moment a write path for `manifest.yaml` exists, an agent can request new `auth.attributes`, `egress.allow`, `services`, `data.classification` or `ai.models` — five of §7's seven sensitive fields — and P6b's re-escalation is the only thing that would stop it.** Today that gate has never had to refuse a hostile change because nothing can make one. **Write P6b's controls as though something will.**
- **The `auth.attributes` → IAM change request path** (§9, D16). P6a refuses the build (Task 13) and names the change request in the message; **it does not create or track one.** P6b.
- **A real `Reviewer` implementation.** `SemgrepReviewer` is a **tracked hardening item** in the roadmap, not a plan (R4e), and it is **advisory before blocking** for the reason §12 gives for the scan gate. **When it is built, its negative control is a corpus of PLANTED DEFECTS** (R4g) — an AI reviewing AI-written code fails **silently**, and *a green result is not evidence a control is in force* applies with unusual force, because no ordinary test can assert that a model noticed something. **Written down here because it is the part most likely to be skipped later.**
- **The AI summary's security dimension** (R4d). P6a stores the reviewer's verdict in the snapshot and renders it; **P6b makes the summary itself security-aware.** Its stated coverage limit travels with it: under D9 it sees first launches and re-escalations only, **never a self-serve release**.
- **Custom domains** (§23, P7) — and note that P7's local proof depends on **this plan's `127.0.0.3`**: §23 makes a custom domain production-only and public-listener-only, so the alias Task 2 adds is the target by construction.
- **IAM package and PIA *generation*** (§9, P8). P6a builds the **objects**; P8 generates what they carry (R1). **`privacy_assessments.generated_draft` exists and is always null**, so P8 adds no migration.
- **Audience tiers' production effects** (§24, P9) — `load-rehearsal` stays `not_built` with `builtBy: 'P9'`.
- **The admin console** (§26, P11). The console's new screens are the *reference* console's (D22), on the same public API (D31).
- **A server-side session store, and revocation before expiry.** §20 records the divergence with its cost, and **`steppedUpAt` inherits it exactly** (Decision 8). The phase that needs either owes them.
- **A run against real UBC Shibboleth.** R2 is explicit: the rehearsal proves the registration's **shape** and never UBC's acceptance of it. §9's real-Shibboleth run **remains an external-track obligation**, and P6a's R1 makes the external track **more** urgent, not less — the demo is now waiting on a real registration and a real PIA.
- **Fixture provenance for the mock.** Hand-written and held honest by `tsc` and Ajv (P5c Decision 10), unchanged.

---

## Spec actions

**THREE ARE PROPOSED AND NONE MAY BE APPLIED UNTIL RICH APPROVES IT.** The spec is *Approved design*; proposing and asking is the pattern, and every spec change this project has made was approved first. **A spec action is not finished when the spec changes**: the four shared HTML pages restate it in plain language, and D33 moved six counts across four files.

**R4's action is NOT among these — it is ✅ APPROVED AND APPLIED** (D33, §15's extension-hook row, §20's control-map row, 2026-09-19). **Verified against the spec on disk while this plan was written.** Do not propose it again.

### 1. §21's *honest divergences* item 2 — rewritten by R3. **CONDITIONAL on Task 3 landing.**

It currently reads:

> 2. Both Caddy listeners are on loopback — there is no real internal/public network separation to enforce (§12).

**If Tasks 2–4 land**, that sentence is false in its first clause and true in its second, and R3 says it is **rewritten rather than deleted** — *"what remains divergent must be stated as precisely as the current text states the whole thing."* Proposed:

> 2. **The two Caddy listeners are real and separate** — `srv0` on `127.0.0.2:443` for sandbox and staging, `srv1` on `127.0.0.3:443` for production — so a route bound to the wrong one is genuinely unreachable and §12's fail-closed claim is tested rather than modelled. **What remains divergent: both addresses are loopback on one host, so there is no network separation to enforce between them** — a process on this machine can reach either, and the separation production provides is topological where this one is only a listener assignment. The **readiness probe** reaches the public listener by port (`:8443` inside the container), because the container-side resolver answers one address for the whole zone; that port is in a probe URL and never in a faculty-facing one.

**If Task 1's `[M5]` says the split costs more than a sitting and Decision 1's fallback is taken, this action is WITHDRAWN and item 2 stands unchanged** — and the record says so.

### 2. §20's step-up list names `release:approve`. **Because the code has two capabilities where the spec has one phrase.**

§20 reads: *"Step-up re-authentication for the privileged set — approving a release, reading a secret, changing a quota, changing project membership… **The first four are exactly D24's forbidden delegated-token capabilities.**"*

**In the code they are not.** `PRIVILEGED` is `{release:promote, secret:read, quota:set, members:manage}` and **`release:approve` is a separate capability that is not in it** — §13 names the approval and the promotion separately, and P5b implemented both. **Measured as `[M6]`: a platform administrator can mint a delegated token holding `release:approve`**, and the day it got a route (Task 10) an agent could have approved a production release with no person in the loop, which is D14 exactly inverted. **P6a closes it without a spec change** — `requireSession` plus `STEP_UP_GUARDED` — but the spec's sentence is now inaccurate about the code, and that inaccuracy is load-bearing because the next reader will believe *"the first four are exactly D24's"*.

**Proposed, one clause:** after *"changing project membership"*, add *"— and, in the implementation, **approving a release is `release:approve`, which is separate from the production promotion D24 forbids**: a delegated token may hold `release:approve` and is refused by the route's interactive-session requirement rather than by D24's central rule."*

**Rich's alternative, which is his to choose and not this plan's to assume:** add `release:approve` to D24's forbidden set, which makes the two lists genuinely identical and is a **change to D24's meaning** — a token could then never hold it, and `assertCapability` would refuse it centrally with a `PendingAction`. **That is the stronger control and it is a larger change.** The plan builds the safe behaviour either way, so neither answer blocks execution.

### 3. §13's *Residual risk* says **five** sensitive fields; §7 says **seven**.

§13: *"only changes to the **five** sensitive fields re-escalate."* §7: *"These **seven** fields, and only these, trigger re-escalation to approval (D9)"*, and `SENSITIVE_FIELDS` has seven. **The number in §13 is stale** — `ai.models` and `blueprint` were added to §7 and §13's prose was not swept, which is §9's *a document that restates a number drifts from it* inside the spec itself.

**Proposed:** §13's sentence reads *"only changes to the sensitive fields listed in §7 re-escalate"* — **naming no number**, so it cannot drift again. **This matters to P6b rather than to P6a**, which is exactly why it is raised now: P6b's whole subject is that sentence.

---

## What the self-review caught

**Run against the spec with fresh eyes after the plan was written, as `superpowers:writing-plans` prescribes. Six, and three of them were real defects in the plan rather than gaps.**

1. **`launch/` cannot throw `api/`'s `BadRequestError`** — `api/routes/` imports `launch/`, so the dependency runs the other way and Task 6 as first drafted was a cycle. Fixed in place: both errors live in `launch/`, mapped by `instanceof` in `api/errors.ts`, the pattern `ReleaseError` and `SlugRefusedError` already follow. **Task 5's *Produces* now carries the note**, because it is the task that creates them.
2. **Task 13 threw a class that does not exist.** There is no `SpecError`; `spec/errors.ts` exports `SPEC_CODES` and a mapper. Fixed to `AttributeDriftError` — **and the second half is the better catch: it needs NO `error-codes.ts` entry at all**, because the refusal is recorded as a failed build and never reaches a client, and `error-codes.test.ts` would go red on a code nothing throws through a mapped class.
3. **`ProductionGateError` had to move.** It lives in `api/errors.ts` today and Task 7 needs it in `launch/gate.ts`; leaving it would have been the same cycle as (1). Named in Task 7's Step 2 with the reason.
4. **Task 7's positive control cannot pass when Task 7 runs.** *"Deploys to production when every blocking item is met"* needs `admin-approval` and `rehearsal`, which are Tasks 10 and 14. The first draft would have forced them to `met` in a fixture — **a test of a checklist the platform will never produce.** It is now `it.skip`ped with the task numbers in its name, and **Task 14's Step 5 un-skips it and re-runs Task 7's control (a)**, which could not fail before that.
5. **Task 19's control (g) is predicted to be invisible**, and P5b sitting 9's F1 is the reason to say so in advance: a prediction of invisibility that turns out wrong is itself a finding, and that has happened on this project before. **Nothing in the demo can see a dishonest reviewer** — Task 12's control (b) is the only thing that can.
6. **Spec coverage.** §13's four asks map to Tasks 7/10/14/15/16; D19's five items to 6, 10, 13 and 14; §12's listeners to 2–4; §9's registration, PIA and D21 to 5, 6 and 14; §20's step-up to 8 and 9; §7's last production clause to 13; §15's and D33's reviewer row to 12; §21's divergence to Spec action 1. **The one §13 clause with no task is D9.2, and that is P6b by Rich's cut** — named in *What this plan does not build* rather than left implicit.

---

## What executing this plan found

**THE FINDINGS COUNT FOR EVERY SITTING LIVES IN ONE PLACE — the roadmap's
defect-rate table** ([`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md)), which is
where it is used for arithmetic (Rich, 2026-09-20). **These headings deliberately state no
number**, and neither does the sittings table at the top of this file. To count a sitting's
findings, count them:

```bash
# The alternation is load-bearing: sitting 1 numbers its findings in a list (`1. **F1 …`)
# and a `^\*\*F` grep reads that sitting as ZERO.
awk '/^### Sitting 6 —/,/^### Sitting 7 —/' docs/superpowers/plans/2026-09-19-p6a-first-production-launch.md \
  | grep -cE '^[[:space:]]*([0-9]+\. )?\*\*F[0-9]+ '
```


*One dated section per sitting, added as it runs — the tasks, every defect with the measurement that found it, the negative controls with which of them could not fail, the gate numbers and the machine. **Sitting 1 executed on 2026-09-19; its section is below.***

**The honest prior, from the roadmap's defect-rate table: 8.6 (P5a), 8.9 (P5b), 7.6 (P5c) findings per task, and the rate has risen, never fallen, with practice.** At nineteen tasks that is **145–170 findings**, and P6a makes production, a second listener, a second authentication round trip and an approval record run for the first time — **four firsts, and this project's worst discoveries have all arrived at a first.** Treat this plan as a hypothesis.

---

### Sitting 1 — Task 1, the measurements, alone and first — 2026-09-19

**All ten measurements ran. NO TASK BOUNDARY MOVED, so the eleven-sitting split stands** —
which is itself a result, and the first time in four plans that Task 1 has not re-cut the
schedule. The record is [`spikes/p6a-baseline/README.md`](../spikes/p6a-baseline/README.md),
one section per measurement, with every command and its untrimmed output in
`results-task1-2026-09-19.txt` (5,045 lines). Correction blocks landed on **Tasks 1, 2, 3, 4,
5, 7 and 12**, and a banner on *Read this first* names its three wrong items.

**THE THREE THE BRIEF NAMED AS MUST-BUY, ANSWERED:**

- **`[M3]` — SimpleSAMLphp HONOURS `ForceAuthn`.** With the flag absent and a warm IdP jar,
  hop 2 served **0 login forms** and a `SAMLResponse` straight through; with
  `forceAuthn: true` it served **1 form and no assertion**; after the restore, 0 forms again.
  The flag was confirmed **on the wire** by inflating the redirect binding's `SAMLRequest`
  (`ForceAuthn="true"`, then `ABSENT`). **Task 8 stands as written, with no IdP configuration
  step, and nothing goes to ORIENTATION §8.** §13's step-up is satisfiable in substance here,
  not merely in shape.
- **`[M5]` — R3 IS A GO.** Two servers in one Caddy container work (`PUT` → **200**, status
  asserted; `["srv0","srv1"]`; `manifest-caddy:8443` answered from the platform network;
  `DELETE` restored `["srv0"]`). The dnsmasq split works — more-specific rules win for every
  pin-back and AAAA still answers `NOERROR`, measured on a throwaway resolver rather than the
  real one. The container-side probe is Decision 15's known work, not a blocker. **Decision 1's
  fallback is NOT taken and Spec action 1 stays live.**
- **`[M4]` — Decision 13 is MEASURED.** Six blocking items forced to `met` with no seventh:
  `ready` **`true`** (the positive control). Add a seventh `blocking: true` in `not_built`:
  `ready` **`false`**. The same item with `blocking: false`: `ready` **`true`**. R4(c)'s trap is
  a fact about this machine, and Task 12's block carries the three rows for `readiness.test.ts`.

**THE FINDINGS.** Each names the measurement that found it.

1. **F1 `[M10]` — Task 5's own step would have made migration 0019 fail to apply.** It says
   drizzle will not have written the `audit.events` CHECK "because it is not expressed in
   `schema.ts`". It **is** expressed there (`db/schema.ts:520-523`) and the snapshot tracks it.
   Measured by adding one event type and running `drizzle-kit generate`: it emitted the
   `DROP CONSTRAINT` / `ADD CONSTRAINT` pair itself, with the new type in it. **Appending would
   have put a second `ADD CONSTRAINT "events_type_known"` in the same file**, failing after the
   three `CREATE TABLE`s had run — and §4 records that a part-applied migration is replayed,
   not patched. **The same item's other half is also wrong in the reassuring direction:**
   `observability/events.test.ts:283` *does* assert the CHECK against `EVENT_TYPES`, read out of
   Postgres, in the unit tier. All three lists read **21** and two `diff`s agree.
2. **F3 `[M5](b)` — Task 3 as written takes `edge.manifest.internal` off the internal listener,
   and it fails at the TLS handshake.** It is a §23 reserved label in the bare production zone
   with **no explicit Caddyfile site** — it rides the `*.manifest.internal` wildcard that Task 3
   moves to `srv1`. Containers resolve the whole zone to srv0, and an unmatched Host there gives
   **`curl: (35) … tlsv1 alert internal error`**, never an HTTP status, so it reads as a
   certificate fault. `make verify` has a check for exactly this. Repair split across Tasks 2
   (pin it back in DNS) and 3 (give it an `srv0` site).
3. **F7 `[M2]` — today's production refusal can assert `ready: true` while refusing.** With the
   checklist forced all-`met`, the deploy still answered `409
   RELEASE_PRODUCTION_GATE_UNAVAILABLE` carrying `launchReadiness.ready: true`. The route keys
   on `environment.kind`, never on `ready`. Task 7 **replaces** the condition.
4. **F9 `[M8]` — §16's authorization matrix cannot fail for Task 7.** Its production row expects
   `409` for `owner` and `admin`, and those two are statements about the *gate*. They pass today
   because the gate is unconditional and will pass afterwards because the fixture's items are
   unmet — **370 tests green on both sides, including a Task 7 that left `assertLaunchable`
   throwing unconditionally.**
5. **F10 `[M2]` — the grep finds SIX non-test hits, not three.** The two the task does not
   predict both matter: `api/authz-contract.ts:75` (`REFUSAL_CODE`'s `409`, which is `[M8]`'s
   subject) and `api/representations/errors.ts:30`. **Both gate line numbers in *Read this
   first* 1 are exactly right**, and the inner gate does run before the build is read.
6. **F2 `[M4]` — a new `LaunchItemId` is refused by the representation with a `500`.**
   `ResponseContractError: … at: items.6.id`. `LaunchReadinessItem.id` is a closed `z.enum`.
   Task 12 must extend it; the failure is loud rather than a dropped field.
7. **F8 `[M4]` — `iam-registration` is met only when there is ALSO a candidate release**, and
   it reads the **production** resolved config. With no candidate, `provider` is `undefined`,
   `usesCwl` is `true` and the item is `not_built` — deliberately, *"the conservative answer is
   that it will need one"*. *Read this first* 4 states only the provider half; Task 7 must keep
   that default when it rewires the item.
8. **F4 `[M5](d)` — *Read this first* 9 is right in substance, wrong in trigger.** A **comment**
   in the `caddy:` service left the container untouched, `make up` 2 s, routes survived; **one
   published port** recreated it, 7 s, routes 1 → 0; a control-plane restart put them back in
   **546 ms**. Compose recreates on a *config* change, not any edit.
9. **F12 `[M5]` — nothing unit-tests two servers.** `upstreamsInUse` survives the split
   (`new Set(Object.values(deps.servers))`), but `routing/routes.test.ts:11` fixes
   `SERVERS = { internal: 'srv0', public: 'srv0' }`, so the two-server path has no coverage.
10. **F5 `[M7]` — `pnpm contract:write` FAILS rather than writing when `ROUTE_DEFINITIONS` is
    malformed.** A stray double comma gave `TypeError: Cannot read properties of undefined
    (reading 'method')`, 4 failed, and `openapi.json` untouched. Worth knowing before Tasks 6, 8,
    10 and 14 each add routes: **a red `contract:write` means the route list, not the document.**
11. **F6 `[M1]` — Task 1's own Step 1 destroys the state Step 2 exists to measure.** `pnpm test`
    truncates `projects` and `users`, which `[M1]` then counts. `[M1]` was taken first here; it
    cost nothing only because the tables were already empty behind twelve running app containers.
12. **F11 `[M8]` — the task's own snippet finds no tests.** `vitest run --project unit
    src/api/authz-contract.ts` (no `.test`) answers *No test files found, exiting with code 1*.
    The real figure is **370 tests** = 41 route cases × 9 actors + 1.
13. **F13 `[M1]` — ORIENTATION §2's box carries one stale state claim.** Its per-app line says
    `containers=6 networks=2 volumes=4`; `make verify` read **`containers=12 networks=4
    volumes=8`** at both ends of this sitting — four apps, not two. The four *gate* numbers in
    that box are all correct.
14. **F14 — a measurement of mine was vacuous and I nearly reported it.** `[M5](b)`'s first pass
    used `set -- $PAIR`; **zsh does not word-split an unquoted variable** (ORIENTATION §4 names
    this exact trap), so the comparison was empty-against-empty and every row printed `OK`. It
    was caught by reading the output rather than the verdict, and re-run with a shell function
    taking real arguments. Recorded because it is the same shape as the defects this sitting
    exists to find.

15. **F15 — THE POST-SWEEP CHECK FOUND ITS DEFECT AGAIN, and it is §6's named class exactly.**
    The first draft of §7e told the next sitting that *"`journey-app` has a staging deploy and
    `opr000001` is a platform administrator"*. Both were true when this sitting wrote them and
    **both were false by the time it finished**: the closing `pnpm test` runs truncated
    `projects`, `users` and `instances` to **0/0/0**, which `psql` reported when the check
    queried it rather than re-reading the sentence. It was written from what the sitting DID
    rather than from a query at close — **the exact failure §6 describes** ("one of the three
    told the next agent that `student` had signed in"), and it would have disarmed the trap
    §7e names as most likely to cost the next sitting. §7e now states the zeroes, names the
    command that produced them, and says the twelve app containers outlive their projects.
    **The gates run LAST and `pnpm test` truncates, so a sitting's narrative is stale about the
    database the moment it ends.**

**WHAT WAS RE-MEASURED AND HELD**, so no one re-buys it: `[M6]` — a platform administrator
**minted** a delegated token holding `release:approve` through the real mint route, with
`release:promote` refused `400 TOKEN_CAPABILITY_FORBIDDEN` beside it, so *Read this first* 2,
Decision 4, Decision 9 and **Spec action 2** are all confirmed (probe revoked immediately,
`revoked: true`). `[M7]` — the coverage gate fires with `expected [ 'GET /v1/m7-probe
(m7Probe)' ] to deeply equal []` and **goes green on a nonsense reason**, so a reviewer and not
the gate reads `DELIBERATELY_UNCALLED`. `[M4]` Q6 — the two rendered paths are still
**byte-identical**, 2279 bytes each. `[M4]` Q4 — the candidate followed *serving*, not *newest*,
with an undeployed release as the control. `[M9]` — a production deploy would register
`https://manifest.internal/sp/journey-app/production` at
`https://journey-app.manifest.internal/auth/ubcshib/callback`; and **for an app with
`auth.provider: none` the SP is skipped by the CALLER**, so `SP_ENTITY_PROVIDER_NOT_CWL` is
unreachable from a deploy and Task 14's item has nothing to rehearse and no error to catch.
`[M5](c)` — `waitForIdentity` refuses a `200` with no `X-Manifest-Instance`, so a mis-listened
probe fails loudly. `[M8]` — `Expectation` already carries `{status, code}` pairs, so Task 9
adds a const beside `PENDING`, not a `REFUSAL_CODE` row.

**NEGATIVE CONTROLS — six, and all six fired.** (a) `[M3]`'s warm-jar sign-in with the flag
absent: **0 forms**, so "a form appeared" means `ForceAuthn` and not a lost session. (b)
`[M6]`'s `release:promote` mint: **`400 TOKEN_CAPABILITY_FORBIDDEN`**. (c) `[M7]`'s restore
re-run: **2 passed**, 34 operations, `m7Probe` gone. (d) `[M5](a)`'s `DELETE` of `srv1`:
**`["srv0"]`** and `:8443` refusing. **(e) and (f) were added by this sitting**, because Q5 and
Q4 are otherwise negative claims: the all-met run **without** the seventh item read
`ready: true`, and a created-but-undeployed release left the candidate **unchanged**. *A
negative claim needs a positive control in the same experiment.*

**EVERY TEMPORARY EDIT WAS RESTORED IN THE SAME STEP AND THE RESTORE RE-MEASURED**, never
assumed: `db/schema.ts` + a generated `0019` and its journal entry (`[M10]`); `api/routes/me.ts`,
`coverage.test.ts` and the regenerated contract (`[M7]`); `identity/saml.ts` (`[M3]`);
`launch/readiness.ts` and `api/representations/launch.ts` (`[M4]`); `api/routes/releases.ts`
(`[M2]`); `infra/compose.yaml` and a throwaway `srv1` and dnsmasq container (`[M5]`).
**This sitting's commit is documentation only** — the spike directory and this plan.

**THE GATES, at the close.** `pnpm test` **1390 passed, 108 files**, run twice (113.97 s,
115.04 s) and identical, so the suite is repeatable; `pnpm lint`, `pnpm typecheck` and
`pnpm format:check` all clean; `make doctor` **18 checks, 0 failed, 0 warnings**; `make verify`
**51 checks, 0 failed, 0 warnings**. **All four agree with ORIENTATION §2's box and none moved.**
**`pnpm test:docker` was NOT RUN and was NOT OWED** — every source file was restored and the
commit touches no code. Sitting 2 owes it (Tasks 2 and 3 change `infra/`); budget ~13 minutes.

**THE MACHINE.** macOS 26.6.2 (25G83), arm64, Node v24.12.0, pnpm 11.24.0, Docker 29.7.2
(API 1.55, buildx v0.36.1-desktop.1), Caddy v2.11.4 / Coraza v2.6.0, OpenSSL 3.6.3, bash 3.2.57.
`bash scripts/dead-app-resources.sh` reads **`none dead`, 0 networks and 0 volumes**.
`bash scripts/litellm-orphans.sh` found **one** orphan from the project `make demo-journey`
replaced; **`--apply` was ALLOWED this session and was run**, and a bare re-run reads
**`Orphaned (0)`** with all four held users surviving. `make verify`'s per-app line reads
`containers=12 networks=4 volumes=8` — **four** apps. The before/after `snapshot-machine.sh`
diff is clocks, 65 → 57 GiB of disk, `manifest-caddy` recreated twice by `[M5](d)`,
`journey-app`'s instance replaced by `[M4]` Q4, and one new app image — all of it platform
operation rather than machine change. **The control plane was started for this sitting and
stopped at its close, leaving 7100 free as `[M1]` found it**; it ran with a deliberately
**stable** `MANIFEST_SESSION_SECRET` because six restarts with the README block's random one
would have invalidated every cookie jar between measurements (§4). **The next sitting should use
the README block as written.** A parallel session committed `45e5b9d` during this sitting and
left two untracked files; **they were not staged.**

---

### Sitting 2 — Tasks 2 and 3, the second listener — 2026-09-19

**§12's LISTENER SPLIT IS REAL ON THIS MACHINE.** The edge runs two servers in one
container — `srv0` on `:443` (internal: staging, sandbox, the console, the IdP and the edge
probe) and `srv1` on `:8443` (public: the production zone and nothing else) — published to
`127.0.0.2:443` and `127.0.0.3:443`. §21's honest divergence 2 no longer describes this
machine, and **Spec action 1 is now unconditional in practice** (it is still Rich's, and is
still not applied). A production name on the internal address and a staging name on the
public one are both served by nothing, watched, in both directions.

**THE ONE THING TO CARRY FORWARD, above every finding below:** a name the split makes
unreachable answers **`200` with an empty body**, NOT a TLS error, because Caddy's
certificate cache is app-global. **A status assertion is green whether the split is intact
or leaking.** Everything Task 4 writes must read the `listener=` word.

| Gate | Before | After |
|---|---|---|
| `make doctor` | 18 checks, 0 failed | **19 checks, 0 failed** |
| `make verify` | 51 checks, 0 failed | **54 checks, 0 failed** |
| `pnpm test` | 1390 in 108 files | **1390 in 108 files** — unchanged, and that is the point: both test files this sitting touched were EDITED, not added |
| `pnpm test:docker` | 178 in 29 files | **180 in 30 files, 0 skipped, 848 s** — exactly the predicted 178 + 2 |

#### The findings

**F1 — `make doctor`'s `check_zone_unclaimed` probes a BARE production-zone name, and the
split turns it red.** It reads `probe-unclaimed.$ZONE` — no environment label, therefore the
production zone — and asserted `= $EDGE_IP`. The moment `dns-host` carried the split it read
`manifest.internal resolves to 127.0.0.3` and failed. **The plan names the two checks Task 2
ADDS and does not consider the one it MOVES**, though *Read this first* 12 says in terms to
predict which check moves. Repaired to assert `PUBLIC_EDGE_IP`, with the reason in the
comment; it still catches the thing it was written for, because Valet's `127.0.0.1` or any
other resolver's answer is neither address. **Found by running the gate.**

**F2 — the plan predicted `make doctor` would read 20 checks. It reads 19.** Task 2's Step 6
says "beside the existing alias check" and then defines `check_aliases`, which loops over
both addresses and therefore subsumes the single-address `check_alias` exactly. Keeping both
would assert `127.0.0.2` twice — the "a document that restates a number drifts from it" shape
applied to a gate — so the old check was REPLACED: 18 − 1 + 2 = 19. The new message names the
missing address, so it is strictly the more useful of the two.

**F3 — Task 2's Step 7 says `make verify` should still read 51/0, and that "a change here is
a finding". It reads 51/2, and it cannot read anything else.** Task 2 moves the bare
production zone to `127.0.0.3`; **nothing publishes that address until Task 3's `compose.yaml`
port.** `zones_serve` and `runtime_route` both failed `curl: (7) Failed to connect …
port 443`. So **Tasks 2 and 3 are only jointly consistent — the split is not a state this
machine can rest in between them.** That is a stronger argument for their sharing a sitting
than the schedule's, and it is the thing to know before anyone splits them.

**F4 — Task 2's control (c) fires with the wrong message, and the right one is more useful.**
Predicted: *"a production name answers 127.0.0.2, want 127.0.0.3"*. Measured: *"a production
name answers `<nothing>`"*. **There is no fall-back to the old answer**: `--local=/manifest.internal/`
makes dnsmasq authoritative for the zone, so removing the parent `--address=` rule leaves the
name resolving to nothing at all. The control still fires, and it is the check's own
`${app:-<nothing>}` default that kept the failure legible rather than printing a bare `want`.

**F5 — SITTING 1's F3 PREDICTED THE WRONG SYMPTOM, AND THE REAL ONE IS MORE DANGEROUS.** F3
said a bare-zone name left without a site on `srv0` would fail at the TLS handshake with
`curl: (35) … tlsv1 alert internal error`. Measured here: it answers **`200` with an EMPTY
BODY**. The mechanism, confirmed with `openssl s_client -servername` against both addresses:
**Caddy's certificate cache is APP-GLOBAL, not per-server** — both servers present
`DNS:*.manifest.internal`, because the certificate `srv1`'s site causes to be issued is
available to `srv0` too. The handshake therefore succeeds, `srv0` matches no site, and Caddy
returns an empty 200. Only a name no certificate anywhere in the config covers
(`foo.notazone.test`) produces F3's alert. **F3 measured a name in no zone and generalised to
a name in a zone whose wildcard had moved, and those are different cases.** Its prescribed
repair is still right and still needed. **The consequence is the sitting's headline: a
status-only assertion passes whether the split holds or leaks.**

**F6 — the plan's own Task 3 check 3 COULD NOT FAIL, and `[M5]`'s repair is what disarmed
it.** Step 4's `check_no_crossover` probes `edge.$ZONE` on the internal address and tests only
for `listener=public`. But `[M5]`'s repair — in the same task — gives `edge.` its **own `srv0`
site**, which Caddy prefers over any wildcard. So with the production wildcard moved back onto
`srv0` — the plan's own control (b), the exact leak the check exists for — `edge.` still
answers `listener=internal` from its explicit site and **the check stays green through the
defect.** The plan wrote the repair and the check in one task and did not notice they collide.
Repaired two ways: probe `PUBLIC_PROBE_HOST` (`cdn.manifest.internal`, a reserved production
label **no site names**, so only a wildcard can answer it), and assert the **absence of
`listener=`** rather than the presence of the wrong value — which is also what makes it
survive F5.

**F7 — `EDGE_PROBE_HOST`'s stated rationale is falsified by this task, exactly as `console.`'s
was in P5a Task 3.** `infra/lib/common.sh` said it is *"A reserved label … that no Caddyfile
site names, so the placeholder answers it on every machine for ever — which `console.` stopped
being in P5a Task 3."* Task 3 gives `edge.` a site, so **`edge.` has now stopped being that
too**, and the comment was left claiming the property that made it trustworthy. Corrected
where the constant lives, and `PUBLIC_PROBE_HOST` added for the job `edge.` can no longer do.

**F8 — `make verify`'s `runtime_route` is broken by the split, and is also its most eloquent
demonstration.** It PUT one route to `srv0` for `late-arrival.manifest.internal` — bare,
therefore production. Post-split that name resolves to `srv1`, so the route sat on a server the
request never reached and the check read the wildcard instead of its own body. **That is §12's
claim working exactly as designed, watched failing on this machine for the first time.** As a
check it now adds one route per listener, mirroring `listenerFor`: production → `srv1`,
staging → `srv0`. **A staging-only repair would have stayed green while no production route
could ever be reached**, and a production-only one would have stayed green while every demo on
this machine broke.

**F9 — serving `edge.manifest.internal` forced a §23 reserved-label group move, and the test
caught it unprompted.** `edge-names.test.ts` holds every NAMED site on the edge to being
reserved *in the group that says Manifest serves it*. `edge` sat in
`environments-and-infrastructure`, whose reason is that a name *"reads as"* a platform
component — true while nothing served it. It now has its own site, so it moved to the
`manifest` group (*"Manifest serves, or will serve, this name itself"*), where its existing
description *"Manifest's edge proxy"* already belonged. **No spec change: the label's
reservation is unchanged, only the reason a person asking for the slug is shown.**

**F10 — `config.test.ts` is the one unit test the split necessarily moves, and its NAME
asserted the old world.** It read *"names both listeners srv0 locally"*. A test whose title
states a fact is a document that drifts; it now reads *"names the two listeners srv0 and
srv1"* and says which test goes red if they are ever collapsed again.

**F11 — the `grep -c` trap bit live, in this session, while running a control.** A
`grep -c … && make up` chain silently skipped `make up`, because **`grep -c` exits 1 when it
counts zero** — the success condition. That is the identical defect `host-undo.sh`'s own
comment records from 2026-09-05, which is why that file asserts its exit status rather than
inheriting one. It cost one confused re-run. **An exit status is asserted, never inherited**,
and that applies to a throwaway shell pipeline as much as to a committed script.

#### Negative controls — every one watched, and which could not fail

| | Control | Predicted | Measured |
|---|---|---|---|
| 2a | `sudo ifconfig lo0 -alias 127.0.0.3` | doctor red: *"127.0.0.3 not on lo0"* | **FIRED — RUN BY RICH IN HIS OWN TERMINAL, 2026-09-20, four sittings after it was owed.** `19 checks, 1 failed`, and the one is *both loopback aliases exist* — *"127.0.0.3 not on lo0 — Docker will refuse to bind Caddy"*. Restored, `19 checks, 0 failed`, *"127.0.0.2 and 127.0.0.3 present on lo0"*. **Exactly one check moved**, which is what the unprivileged stand-in could not establish |
| 2a′ | `PUBLIC_EDGE_IP` pointed at `127.0.0.9`, unprivileged | — | **RED, both new checks**: *"127.0.0.9 not on lo0"* and *"a production name answers 127.0.0.3, want 127.0.0.9"*. Proves the check's logic; does NOT prove a real alias removal, which is why 2a is still owed |
| 2b | console pin-back removed, `make up` | doctor red on the console half | **RED as predicted**: *"console.manifest.internal answers 127.0.0.3, want 127.0.0.2 — the console is on the PUBLIC address"* |
| 2c | production parent rule removed, `make up` | doctor red: *"answers 127.0.0.2"* | **RED, different message** — `<nothing>`. See F4 |
| 3a | the `:8443` site removed, `make up` | verify red on *two listeners* and *the public listener answers* | **RED on both, plus TWO the plan does not name** — `zones_serve` and `runtime_route`'s `srv1` half, because nothing then serves the production zone at all (4 verify checks in total). **The Docker test went red on the PRODUCTION case ONLY**, not both: removing `srv1` does not change `srv0`'s correct handling of staging, so that case passing is right. See F12 |
| 3b | production wildcard moved back to `srv0` | verify red on *no crossover* | **RED, and it is the finding of the sitting**: *"a production name IS served on the internal address: manifest OK host=cdn.manifest.internal … listener=internal"*. Docker test red on its first case only, as predicted. **The plan's own version of this check was run against the same leak and PASSED** — see F6 |
| 3c | `MANIFEST_CADDY_SERVER_PUBLIC=srv0` | **nothing in this task goes red** — it is Task 4's | **NOTHING went red**, as the plan says. Confirmed by running the Docker test with the variable set: 2 passed. Task 3 makes two servers exist; nothing yet writes a route to the right one, and that is Task 4 |

**F12 — control (a)'s prediction about the Docker test is wrong in a way worth knowing.** The
plan says the new Docker test goes *"red on both cases"* when the `:8443` site is removed. It
goes red on the **production case only**, and the staging case passing is **correct**: removing
`srv1` does not change `srv0`'s handling of staging, and the staging case's second half — *a
staging name is not served on the public listener* — is MORE true with no public listener at
all. A reader who expected two failures would go looking for a defect in a passing test. The
control fired on four `make verify` checks, two of which the plan does not name (`zones_serve`
and `runtime_route`'s `srv1` half).

#### What this sitting decided

- **`check_aliases` REPLACES `check_alias` rather than sitting beside it** (F2). *Rejected:*
  keeping both, which is what the plan's wording implies and which asserts `127.0.0.2` twice.
  *Changing course* is three lines.
- **`check_no_crossover` probes a name NO SITE CLAIMS, and asserts the ABSENCE of `listener=`**
  (F6), rather than probing `edge.` for the presence of the wrong value. *Rejected:* the plan's
  version, which was measured passing through the leak. *Changing course* would reintroduce a
  check that cannot fail.
- **`runtime_route` adds one route PER LISTENER** (F8) rather than moving its single route to
  `srv1`. *Rejected:* a production-only version (green while every demo broke) and a
  staging-only version (green while no production route could be reached).
- **`edge` moves reserved-label GROUPS rather than the test being relaxed** (F9). *Rejected:*
  loosening `edge-names.test.ts` to accept any reserved label, which would stop it asking §23's
  actual question. **This is not a spec change** — the reservation is unchanged and only the
  reason shown to a person asking for the slug moves.

#### The machine, queried at close rather than recalled

> **RE-QUERIED AFTER F12's FOLLOW-UP, 2026-09-20.** The table below was written at this
> sitting's first close; the follow-up then ran the Docker tier a second time, restarted the
> control plane, drove D24's loop live and ran `pnpm test` twice more. **What changed:** the
> database is now **fully truncated** — the final test run cleared `stepup-5795` and the
> follow-up's own `confirm-9115`, and **both bare repositories were removed**, so
> `.manifest/repos/` is back to the four it held at open. `containers=12 networks=4
> volumes=8` and doctor 19/0, verify 54/0 all re-measured and unmoved; both cleanup scripts
> allowed and run **again**, `p4b-probe-user` back for the second time in one sitting, 6
> users → 4. **Port 7100 is free.** **The app images are the only thing that moved and
> stayed moved**: `docker images -q | wc -l` **133 → 137**, unique **125 → 129**,
> `127.0.0.1:7107/local/*` **83 → 87** — **four per Docker-tier run, and the tier ran
> twice.** Neither cleanup script covers them, which is the standing gap CLAUDE.md names.


`make doctor` **19/0**, `make verify` **54/0**, `pnpm test` **1390 in 108 files** twice and
identical, `pnpm test:docker` **180 in 30 files, 0 skipped, 848 s**, lint/typecheck/format
clean. **`lo0` carries `127.0.0.1`, `127.0.0.2` and `127.0.0.3`** — Rich ran
`sudo bash infra/host/p6a-second-address.sh` himself. The edge: `srv0 listen=:443 routes=4`,
`srv1 listen=:8443 routes=1`. **Nothing is listening on 7100** — the control plane was never
started this sitting. **The database is EMPTY** — `psql` at close reads `projects=0 users=0
instances=0 releases=0`, because `pnpm test` truncates and the gates ran last; the twelve app
containers are still up, so the containers outlive their projects, which is ordinary here.

**The cleanups were run bare and then APPLIED by this session — the classifier allowed both.**
`dead-app-resources.sh` found the documented **seven networks and one volume** put back by this
sitting's Docker-tier run (`make verify`'s per-app line went `12/4/8` → `12/11/9` → `12/4/8`),
and re-measuring with the script itself afterwards reads **`none dead`**. `litellm-orphans.sh`
found **one** orphan, `p4b-probe-user` — the same name P5c sitting 1 cleared — and a bare re-run
after `--apply` reads **`Orphaned (0)`** with all four held users surviving. **That is now the
sixth measurement of the Docker tier regenerating exactly that set: treat it as a property of
the tier, not a backlog.**

**The before/after `snapshot-machine.sh` diff is 64 lines and every one is platform operation
rather than machine change**: clocks and uptimes, free disk **57 → 59 GiB** (the cleanups
gave some back), `manifest-caddy` and `manifest-dns-host` recreated by the two
`compose.yaml` config changes, `HEAD` moved, and **four new app images left by the Docker
tier** — `boot-recover`, `chem-labs`, `fixture-rd` and `redeploy-cp`. Those four are exactly
the growth CLAUDE.md notes **neither cleanup script covers**, and they are a reason to
measure that set rather than quote a count for it. **All four must-survive containers are
present** (`docker-simple-saml-saml-idp-1` still `Exited (0)`, which is correct — "must
survive" means do not delete it, not that it is up), and **both read-only repositories are
still clean**: `docker-simple-saml`'s only dirty path is the untracked `cert.zip` dated
2026-06-22, exactly as CLAUDE.md records it.

**~~One control is still OWED and is Rich's~~ — RUN AND FIRED, 2026-09-20 (P6a sitting 6's
follow-up).** Task 2's control (a), `sudo ifconfig lo0 -alias 127.0.0.3` with `make doctor`
watched going red. The unprivileged stand-in run here proved the checks' LOGIC; **this proves
a real alias removal is caught**, and it took four sittings to get a terminal to it.

**It also measured something the control was not aimed at, and it is worth more than the
control.** With `127.0.0.3` gone from `lo0` — so Caddy could not have bound it and the
production zone was unreachable — **two checks that name `127.0.0.3` stayed GREEN**:
*nothing but Manifest claims manifest.internal* (*"resolves to 127.0.0.3"*) and **"the
production zone answers the public address"** (*"production=127.0.0.3 console=127.0.0.2"*).
`check_zone_split` is two `dig` calls: it asserts what **dnsmasq answers**, never that
anything is listening there, and that is correct for a check in doctor's *Host setup*
section. **But its name says "answers"**, and a reader skimming a green doctor would have
concluded production was fine while it was unreachable. **The alias check is the only thing
in `doctor` that catches it.**

**The division of labour is sound and only half of it is now measured.** `make verify`'s
*the public listener answers a production name on 127.0.0.3* does a real
`curl --resolve "$PUBLIC_PROBE_HOST:443:$PUBLIC_EDGE_IP"` and asserts `listener=public` in
the BODY — so it would have gone red too. **Would have is a prediction, not a measurement**
(this plan's own rule), and `make verify` was not run inside the window. **Cost to close it:
one more `sudo` line and about thirty seconds.**

**The four shared HTML pages were CHECKED and correctly need no change**: `grep` for
`manifest.internal`, `caddy` and `edge proxy` finds **0** in all four, and the schematic's
`Status` line describes outcomes a non-technical reader would recognise. A second listener is
infrastructure with no such outcome yet — **production is not reachable until Task 15** — so
the pages stay as P5c left them. Checked rather than assumed, per §6.

**A parallel session committed `a451187` during this sitting**; it was not staged, and
`git status` was accounted for before each of the two commits. Commits: `0d612f4` (Task 2) and
`978df32` (Task 3).

#### What the post-sweep check found — TWO, and the streak since P5b's third sitting holds

**1. §7e said "11 findings" while the record, the sittings table and the roadmap all said
12.** The record was renumbered when control (a) produced F12, and §7e — drafted earlier in
the sitting — was not. **It survived the obvious `grep` because the number sat on its own
line**: `grep -o 'ran on 2026-09-19 with [0-9]* findings'` matched a DIFFERENT sentence and
reported 12, which read as agreement. It was found by opening §7e and reading its first six
lines. **§6's rule — grep the PHRASE, never the number — needs one more clause: a phrase
broken across a line break defeats `grep -o` too, so read the lines.**

**2. §7e said `HEAD` moved under this sitting "once (`a451187`)". It moved THREE times** —
`a451187`, `a6f2f61` and `312f083`, all a parallel design agent's, and **two of them landed
BETWEEN this sitting's own two task commits**. Written from what the sitting noticed at its
start rather than from `git log` at its close — the same cause §6 names for the three state
claims that went stale within the hour. Found by counting the commits, not by re-reading the
sentence.

*One note for the next agent, checked rather than assumed: ORIENTATION's "`pnpm test` — even one
file — truncates the control plane's tables" is true of files that USE the database.
`packages/control-plane/vitest.setup.ts` only sets environment variables, and
`edge-names.test.ts` and `reserved-labels.test.ts` import no database helper at all — so running
those two during the Docker tier did not contaminate it. Verified by reading their imports when
the worry arose, rather than discarding an 848-second run on a guess.*

---

### Sitting 3 — Task 4, a production route on the public listener, alone — 2026-09-20

**§12'S CLAIM IS NOW ENFORCED ON AN APP'S OWN ROUTE, NOT JUST IN THE EDGE'S CONFIGURATION.**
`applyRoute` writes a production route to `srv1` and a staging route to `srv0`; five new
Docker-tier cases put a REAL route on each listener and read `X-Manifest-Instance` back, which
is the only thing a route sets and the wildcard does not. `edgeIdentityProbe` and `edgeProbe`
take an optional `port` through one shared `probeAuthority`, and the Docker driver passes
`config.edgePublicPort` for `environmentKind === 'production'` and nothing else (Decision 15).
`MANIFEST_EDGE_PUBLIC_PORT` defaults to 8443 and `make verify` holds it equal to
`infra/compose.yaml`'s `127.0.0.3:443:8443` rather than trusting two files to agree.

**THE TWO THINGS TO CARRY FORWARD, above every finding below, and both are about CONTROLS
rather than about the platform:**

1. **Control (c) went RED where the plan predicted green, and both assertions had to be
   weakened before it fired.** The plan says to weaken `expect(onPublic.instance).toBe(…)` to
   `expect(onPublic.status).toBe(200)` and watch it stay green with the route on the wrong
   server. It did not: the same case also asserts `probe(...) === STUB_BODY`, and an empty-200
   wildcard answer fails that too. With BOTH weakened it is green, exactly as predicted. **A
   control that weakens one assertion measures nothing if a second assertion in the same test
   catches the same defect** — and a sitting that ran it as written would have reported the
   control firing when what fired was a different assertion.
2. **Control (b) CANNOT FAIL, and the branch it guards is the one Task 15 depends on.**
   Removing the `port` spread from the driver leaves **1353 unit tests and all 26
   driver-contract Docker tests green** — measured, both tiers. Nothing deploys a production
   instance through the driver, so the plan's *"the same test red for the same reason"* is
   wrong twice over: the Docker test never goes through the driver, and no test exercises the
   production branch at all. **Task 15 is the first thing that will ever run that line.**

| Gate | Before | After |
|---|---|---|
| `make doctor` | 19 checks, 0 failed | **19 checks, 0 failed** — unmoved |
| `make verify` | 54 checks, 0 failed | **54 checks, 0 failed** — unmoved, and that is the point: the port-equality assertion went INSIDE *the public listener answers a production name* rather than becoming check 55, because it is the same claim's second half |
| `pnpm test` | 1390 in 108 files | **1395 in 108 files**, twice and identical — up 5, **no new file**: 4 in `routing/routes.test.ts`, 1 in `config.test.ts` |
| `pnpm test:docker` | 180 in 30 files | **185 in 30 files, 0 skipped, 827 s** — up 5, no new file. **Predicted 180 + 5 before running it, and that is what it read** |

#### The findings

**F1 — the plan's Step 3 snippet asserts something sitting 2 MEASURED TO BE FALSE.** Its second
case reads `expect(onInternal.body).toContain('listener=internal')` for a production hostname
on the internal listener. There is no such word to find: Task 3 moved the `*.manifest.internal`
wildcard to `srv1`, so `srv0` holds **no site at all** for a production name, matches nothing,
and answers an **empty 200** — sitting 2's F5, which the plan's Task 4 section was never
updated for. ORIENTATION §7e warned about the symptom in general and did not name the line.
Written instead as the two assertions that actually fire: no instance header, and no `listener=`
anywhere in the body. **Found by reading sitting 2's own record against the snippet before
running it**, which is cheaper than watching it fail.

**F2 — `[M5]` names ONE hardcoded `{ internal: 'srv0', public: 'srv0' }` and there are NINE,
two of them the Docker tier's own driver.** The correction block names
`routing/routes.test.ts:11`. `grep -rn "public: 'srv0'"` finds eight more, and the two that
matter are in **`runtime/docker/testing.ts`** — `dockerDriverForTests`, the factory every
Docker-tier suite builds its driver from, and `CONTRACT_ROUTING`. **That is the driver Task
15's first production deploy will use**, so a production route would have gone to the internal
server and the readiness probe on `:8443` would have found nothing there — control (b)'s
failure mode, arriving by a path the plan does not consider. Both fixed. The other six
(`boot.docker.test.ts`, `releases/redeploy.docker.test.ts`, `runtime/docker/driver.docker.test.ts`,
`runtime/docker/redeploy.docker.test.ts`, `routing/routes.docker.test.ts`,
`routing/readiness.docker.test.ts`) were each checked and are **staging-only** — none writes a
production route or deploys a production instance — so `public` is never read in them and they
were left alone. **Recorded rather than fixed, because a change nothing exercises is a change
nothing can catch.**

**F3 — three doc comments still described the pre-split world, and one is in the file the plan
calls "unchanged".** File Structure says `routing/hostnames.ts` is *"unchanged — `listenerFor`
already says the right thing"*. The FUNCTION does; its doc comment said *"On the laptop both
listeners are loopback and both server names default to the same Caddy server (§21, honest
divergence 2), so this distinction is modelled and recorded rather than enforced locally"* —
false since sitting 2, and it is the first thing a reader of `listenerFor` sees. `RoutingDeps.servers`
said *"Both are `srv0` on the laptop"* and `Config.caddyServers` said *"Both `srv0` locally"*.
Sitting 2 updated the config SCHEMA's comment and not the `Config` interface's, three lines
apart in the same file. **The plan checked the code and not the prose.** All three corrected,
each naming what changed and when.

**F4 — a test that hardcodes `srv1` cannot be turned red by control (a), which is the whole
point of control (a).** Sitting 2's control 3c measured that with `MANIFEST_CADDY_SERVER_PUBLIC=srv0`
nothing in `listener-split.docker.test.ts` went red, and said *"that is Task 4"*. A Task 4 test
with two literals in it would have kept that true. So the file now derives `caddyServers` and
`edgePublicPort` from **`loadConfig`**, with `process.env` spread LAST so the real environment
always wins; the three settings `loadConfig` requires and this test does not read are given
`config.test.ts`'s own fixture values. Control (a) then fires — **two cases red, not the one the
plan predicts** (see the controls table).

**F5 — the plan's Step 6 `git add` line omits the one production caller of the new setting.**
It names `packages/control-plane/src/routing`, `runtime/docker/driver.ts`, `config.ts` and
`scripts/verify.sh` — and leaves out **`src/index.ts`**, where `publicEdgePort` is passed to the
driver, and `runtime/docker/testing.ts`. Staging exactly the plan's paths would have committed a
tree that does not typecheck. §6 rule 9 says stage by name; **this is why you read the names
rather than pasting the line.**

**F6 — control (c) as the plan words it is a one-off experiment, so it is now a standing test
as well.** A control that must be re-performed by hand is a control nobody performs again. The
suite now asserts permanently that **`edgeProbe` — which reads a status and nothing else —
answers 200 on BOTH listeners** for the same routed production name. A reader about to replace
an identity assertion with a status one meets that test sitting under it. **It is also what
gives `edgeProbe`'s new `port` a caller**, which is why the option is on both probes rather than
only on the identity one, against this project's rule that a function with no call site is not
built.

**F7 — `deleteRoute`'s `server` argument is discarded by the real client, so the obvious unit
test for `removeRoute` would have asserted a value the implementation throws away.** `caddy.ts`
deletes by `@id` (`async deleteRoute(_server, routeId)`), correctly — index-based removal races.
A draft test asserting `removeRoute` passes `srv1` was written and then dropped: it would have
read as coverage of the listener choice while proving nothing about reachability. **The listener
can only be got wrong on the two PUT paths**, so what is asserted instead is `restoreRouteTo`'s
PUT branch — the rollback a failed deploy takes, where writing a production hostname's previous
route to the internal listener would leave an app that was serving a moment ago unreachable.

**F8 — `upstreamsInUse`'s two-server branch had never run, and it guards a production app from
being retired.** `routing/routes.ts:185` iterates `new Set(Object.values(deps.servers))`, which
was written when both names were `srv0` to stop the same server being read twice. Every test of
it did exactly one read. `retireInstance` refuses an instance whose address is in that set, so a
version reading only the internal listener would let a running **production** app be retired
out from under the route serving it. Now asserted with two servers returning DIFFERENT routes
and the read order recorded — **and with the collapsed pair asserted too**, because the dedupe
is load-bearing in both configurations and UBC may run one.

**F9 — `scripts/ci-acceptance.sh` is a FOURTH place the gate numbers live, and it went stale
the first time they moved.** It carried `EXPECT_DOCTOR=18` and `EXPECT_VERIFY=51` against a
machine at 19 and 54 — moved by sitting 2, which swept the three documents §6's list names.
**§2's box says in its own text that these four lines "carry this box's numbers and move with
it", and §6's sweep table names documents only**, so nothing pointed sitting 2 at the file.
Worse, it is quiet: the script reports `MOVED` rather than `FAIL`, so `make ci-acceptance`
would have printed *"counts moved: expected 18, got 19"* in a summary and passed. Fixed to
1395/108/19/54, **and §6's table now has a row for it** with the reason, plus a second `grep`
in §6 because bare `EXPECT_` assignments match none of the patterns the existing one uses.
**Found by opening the file, not by re-reading the list.**

**F10 — the port-equality check's first draft had a false red in it, found by watching it
fail.** It matched the whole zod chain — `z.coerce.number().int().positive().default(8443)` —
so reordering `.int()` and `.positive()`, a refactor that changes nothing, made it read the
default as ABSENT and the check went red saying *"config.ts states no
MANIFEST_EDGE_PUBLIC_PORT default"*. Loosened to the setting's NAME plus `default(<n>)`, then
re-measured **both** ways: the reordered chain passes, and a real disagreement (8444 against
compose's 8443) still fails with the same message. Committed separately (`f4f7d6a`) so the
repair is legible against the thing it repairs.

**F11 — the emptiness guard in that check protects against one case and not the one it looks
like.** `[ -n "$cfg_port" ]` reads as insurance against a bad comparison, but an empty
`cfg_port` would fail the comparison anyway — `'' != '8443'`. **The case it actually catches is
BOTH seds returning empty**, where `'' = ''` passes and the check reports agreement between two
files it could not read. Stated that way in the code, because the weaker reading would have
someone delete it as redundant.

#### Negative controls — every one watched, and which could not fail

| | Control | Predicted | Measured |
|---|---|---|---|
| 4a | `MANIFEST_CADDY_SERVER_PUBLIC=srv0`, Docker tier re-run, assertions intact | the production case red, with `waitForIdentity`'s *"the edge answered 200 with no X-Manifest-Instance"* | **RED — TWO cases, not one**, and **not with that message**. `a production route is reachable … AS THE INSTANCE`: *expected undefined to be '44444444-…'*; and `the SAME hostname on the internal listener is served by nothing`: *the route must not be on the internal server: expected '44444444-…' to be undefined* — the mirror of the leak, which the plan does not predict and which is the more eloquent of the two. The predicted message belongs to `waitForIdentity`, and this test calls `edgeIdentityProbe` directly; **it will be Task 15's message, not this one's** |
| 4b | the `port` spread removed from the driver | the same test red for the same reason | **NOTHING WENT RED. 1353 unit tests pass and all 26 driver-contract Docker tests pass.** The Docker test does not go through the driver, and **no test deploys a production instance through it at all.** The control cannot fail in this sitting, and the branch is first exercised by Task 15 — recorded in §7e as the thing to look at if that deploy hangs for fifteen seconds and rolls back |
| 4c | `expect(onPublic.instance).toBe(instanceId)` weakened to `expect(onPublic.status).toBe(200)`, route on the wrong server | **GREEN** — the control that proves the assertion is about the shape of the answer | **RED at first, then GREEN.** Weakening only the identity assertion left the case red on the NEXT line — `expect(await probe(…)).toBe(STUB_BODY)`, which an empty-200 wildcard also fails. **Both** weakened, it is green with the route on `srv0`, exactly as predicted. So the control fires, and the test has TWO independent discriminators rather than the one the plan assumes — which is better than asked for, and means the control as WORDED does not fire. Restored and re-run: 7 passed |
| 4d | `MANIFEST_EDGE_PUBLIC_PORT` default changed to 8444 | not in the plan — this sitting's own, for the check it added | **RED**: *"the public listener's port disagrees: config.ts=8444 compose.yaml=8443"* |
| 4e | `.int()` and `.positive()` reordered in the zod chain | not in the plan — written to find out whether the check is brittle | **RED, and it should not have been.** F10: the check was matching the whole chain. Loosened, re-measured green on the reorder and still red on 4d |

#### What this sitting decided

- **`edgeProbe` gains the `port` as well as `edgeIdentityProbe`**, with its caller being the
  standing control that a status answers 200 on both listeners (F6). *Rejected:* giving it the
  option with no caller, which is the shape §9 names four times; and leaving it off, which
  would have left control (c) as a hand-performed experiment.
- **`publicEdgePort` is REQUIRED on `DockerDriverOptions`, not optional.** Every construction
  site is then a `tsc` error rather than a silently absent port. *Rejected:* optional with a
  default of 8443 in the driver — a second statement of the setting, and the failure it hides
  is a fifteen-second timeout whose message names the wildcard and not a port.
- **The port-equality assertion goes INSIDE `make verify`'s check 2 rather than becoming check
  55** (the plan says so, and measuring it confirmed the count holds at 54). *Rejected:* a
  separate check, which would make the same claim twice and move a number three documents and
  one script state.
- **`listener-split.docker.test.ts` derives its server names and port from `loadConfig`**
  (F4). *Rejected:* two literals, which is what makes control (a) unable to fire.
- **The two `public: 'srv0'` fixtures in `runtime/docker/testing.ts` are FIXED and the other
  six are RECORDED** (F2). *Rejected:* fixing all eight — six are staging-only, so the change
  would be unexercised by anything, and an unexercised change is one nothing can catch;
  *rejected also:* recording all eight, which leaves the trap in the exact file Task 15 uses.
- **`INTERNAL_PORT` stays a literal 443 while `PUBLIC_PORT` comes from config.** There is no
  setting for the internal port — it is `infra/compose.yaml`'s `127.0.0.2:443:443` and the
  address every site without a prefix binds — so deriving it would invent a setting to avoid a
  literal.

#### The machine, queried at close rather than recalled

`make doctor` **19/0**, `make verify` **54/0**, `pnpm test` **1395 in 108 files** twice and
identical, `pnpm test:docker` **185 in 30 files, 0 skipped, 827 s**, lint/typecheck/format
clean. **`lo0` carries `127.0.0.1`, `127.0.0.2` and `127.0.0.3`.** **Nothing is listening on
7100** — the control plane was never started this sitting. **The database is EMPTY** — `psql`
at close reads `projects=0 users=0 instances=0 releases=0`, because `pnpm test` truncates and
the gates ran last; the twelve app containers are still up, so the containers outlive their
projects, which is ordinary here.

**Both cleanups were run bare and then APPLIED by this session — the classifier allowed both.**
`dead-app-resources.sh` found the documented **seven networks and one volume** put back by this
sitting's Docker-tier run (`make verify`'s per-app line went `12/4/8` → `12/11/9` → `12/4/8`),
and re-measuring with the script itself afterwards reads **`none dead`, 0 and 0**.
`litellm-orphans.sh` found **one** orphan, `p4b-probe-user` — the same name P5c sitting 1 and
P6a sitting 2 each cleared — and a bare re-run after `--apply` reads **`Orphaned (0)`** with all
four held users surviving. **That is the SEVENTH measurement of the Docker tier regenerating
exactly that set: a property of the tier, not a backlog.**

**The four shared HTML pages were CHECKED and correctly need no change.** `grep` for
`listener`, `127.0.0.2`, `127.0.0.3`, `srv0`, `srv1`, `manifest.internal`, `edge proxy`,
`public listener` and `production zone` finds **0 in all four**. They describe outcomes a
non-technical reader would recognise, and Task 4 produces none — **production is not reachable
until Task 15.** Checked rather than assumed, per §6.

**`HEAD` moved twice under this sitting** — `2d128be` and `c3d29f5`, a parallel design agent's,
both landing before this sitting's own first commit. Neither was staged; `git status` was
accounted for before each commit. Commits: `c31de45` (Task 4) and `f4f7d6a` (F10's repair).

#### What the post-sweep check found — FOUR, and the streak since P5b's third sitting holds

**1. §7e pointed at "Task 5's `[M8]` correction block". It is `[M10]`.** Found by opening
Task 5 and reading the block's own heading, not by re-reading the sentence — and it is the
*wrong pointer* class §6 calls the strongest argument for this check, because the next sitting
is told to read that block before its steps and would have gone looking for a marker Task 5
does not have. **`[M8]` is a real marker elsewhere in this plan** (Task 1's Step 9, and four
references to it), which is what made the mistake plausible.

**2. The first fix for (1) was a blanket find-and-replace, and it corrupted four legitimate
`[M10]` references into `[M8]`** — Task 1's Step 11, the correction block's own evidence line,
F1's label and an *assumed* line. Caught immediately by reading `git diff` rather than trusting
the replacement count, and repaired by restoring the file from the index and re-applying the two
intended edits. **The lesson is the one this project keeps paying for in a new place: a global
edit to a document is the same shape as `git add -A`.** A marker like `[M8]` is not a unique
string, and the count the script printed (`replaced 8`) read as success. **Assert what you
changed, never how many.**

**3. §7e's own grep answers TWELVE, not six.** It told the next agent to run
`grep -rn "public: 'srv0'" packages/` to find the six remaining fixtures;
`packages/control-plane/dist/` holds a compiled copy of every one of them, so the bare grep
answers twelve and a reader would conclude the sitting's own count was wrong. Corrected to carry
`--include="*.ts"` and to say why. **Found by running the command as written**, which is the
cheapest form of this check and the one most easily skipped — a grep in a hand-off is a claim
like any other.

*Also verified by opening the thing pointed at, and correct: the eleven findings are numbered
F1–F11 with no gap and the count agrees in the record's heading, the sittings table, the
roadmap's P6a row, the defect-rate table and §7e; `observability/events.test.ts:283` is indeed
the test that reads the `events_type_known` constraint out of Postgres and compares it with
`EVENT_TYPES`; Decision 14's five event types are quoted exactly; and the four gate numbers
agree across ORIENTATION §2's box, README, RUNBOOK and `scripts/ci-acceptance.sh` — the fourth
of which this sitting had to fix first (F9).*

*The before/after `snapshot-machine.sh` diff is **66 lines and every one is platform operation
rather than machine change**: clocks and uptimes, free disk **59 → 57 GiB**, `HEAD` moved, and
**five new app image rows for four names** left by the Docker tier —
`127.0.0.1:7107/local/boot-recover`, `chem-labs` **twice, with different digests**, `fixture-rd`
and `redeploy-cp`. Those are the same four names sitting 2 recorded, which is the second
measurement of the growth **neither cleanup script covers** — and the doubled `chem-labs` is why
CLAUDE.md says to name the metric: four names are five rows, and `docker images | grep '^local/'`
would answer 0 for all of them, because they are tagged `127.0.0.1:7107/local/*`. Nothing was
recreated: `manifest-caddy` and `manifest-dns-host` show the uptimes `make up` gave them at the
sitting's start, not new ones. **All four must-survive containers are present**
(`docker-simple-saml-saml-idp-1` still `Exited (0)`, which is correct — "must survive" means do
not delete it, not that it is up), and **`docker-simple-saml` is still clean**: its only dirty
path is the untracked `cert.zip` dated 2026-06-22, exactly as CLAUDE.md records it. There is no
git repository at `~/Developer/ubc-genai-toolkit` to check, and nothing in this sitting read or
wrote it.*

**4 — and this one was found by a QUESTION rather than by the checklist: ORIENTATION's
TOP-OF-FILE BOX still stated sitting 2's numbers.** Asked whether a cold agent could simply be
told *"read ORIENTATION and proceed with the next sitting"*, the way to answer was to read the
first thing such an agent sees — and the box's own dated `Last verified` line read *"AFTER P6a
sitting 2"* with `pnpm test` **1390** and `pnpm test:docker` **180 in 30**, both moved by this
sitting, while its P6a sentence stopped at the listener split being *built*. §2's box, README,
RUNBOOK and `ci-acceptance.sh` had all been swept correctly. **The cause is the sweep list
itself**: §6's `ORIENTATION.md` row said *"§7e and §2's numbers box"*, and the top-of-file box is
neither — so a sweep that works down that row as written skips the one part of the file every
cold reader starts at. The row now names it first, and this is the second time in one sitting
that the sweep's own instructions were the defect (F9 was the same shape for
`scripts/ci-acceptance.sh`). **Five copies of the gate numbers, then, not four** — and the
lesson is the one §6 already states and this sitting proved twice: *a list of what to sweep is
itself a thing that goes stale, and the way to test it is to follow it as written rather than to
read it.*

### Sitting 4 — Tasks 5 and 6, migration 0019 and the two external records — 2026-09-20

**§13'S GATE NOW HAS REAL ROWS TO BLOCK ON, WHICH IS THE WHOLE OF R1.** Migration **0019**
adds `approvals`, `iam_registrations` and `privacy_assessments` with §9's submission states,
`launch/transitions.ts` holds the two state machines as pure table-driven functions, and an
administrator records a real IAM registration and a real PIA over the API with a pasted ticket
reference. **THREE routes, not the four Task 6 says**: `getLaunchRecords` reads both, one POST
per record writes it. `launch:record` is Decision 4's new capability, granted to
`PLATFORM_ADMIN` alone — and it is **not** one of D24's privileged four, so the control is
`requireSession` on every route that asserts it.

**THE THREE THINGS TO CARRY FORWARD, above every finding below.**

1. **`[M10]` IS CONFIRMED EXACTLY, AND IT WOULD HAVE COST THE SITTING.** `drizzle-kit generate`
   emitted the `audit.events` `DROP CONSTRAINT`/`ADD CONSTRAINT` pair **unprompted**, because
   the constraint is expressed in `schema.ts`. Appending the plan's SQL would have put a second
   `ADD CONSTRAINT "events_type_known"` in a file that already had one, and 0019 would have
   failed to apply **after its three `CREATE TABLE`s had run** — the replay ORIENTATION §4
   prices. **Nothing was appended, and no second guard was built**: `observability/events.test.ts:283`
   already reads the constraint out of Postgres and compares it with `EVENT_TYPES`, and control
   (c) watched it go red.
2. **THE PLAN'S OWN MATRIX ROW FOR `token-other-project` IS WRONG, AND CONTROL (a) EXPLAINS
   WHY.** Task 6's Step 4 table says `404 NOT_FOUND`; both record routes answer
   **`403 TOKEN_CREDENTIAL_REFUSED`**, measured. `requireSession` runs before `assertCapability`,
   so the project is never read and the answer is identical for every project id — **which is
   the right order**, because the alternative answers `404` for another project and
   `TOKEN_CREDENTIAL_REFUSED` for this one, and that tells a token which projects exist. Control
   (a) proves the plan's row was written for the *other* order: with `requireActor` in place of
   `requireSession`, `token-other-project` does answer `404`.
3. **AN EVENT TYPE IS PUBLISHED SURFACE, AND A NEW ROUTE IS NOT THE ONLY THING THAT NEEDS
   `pnpm contract:write`.** `api/representations/events.ts` builds the contract's `EventFrame`
   union from `EVENT_TYPES` and the detail-schema map, so Task 5's five new types made
   `api/contract/document.test.ts` red — *"openapi.json is stale from line 2678"* — with no route
   added at all. The plan states the three-files-in-order rule for a ROUTE and Task 5's file list
   does not mention the contract.

| Gate | Before | After |
|---|---|---|
| `make doctor` | 19 checks, 0 failed | **19 checks, 0 failed** — unmoved; this sitting adds no platform check |
| `make verify` | 54 checks, 0 failed | **54 checks, 0 failed** — unmoved, same reason |
| `pnpm test` | 1395 in 108 files | **1449 in 110 files**, twice and identical — up **54** and **two files**, and the split was COUNTED PER FILE rather than subtracted, which is how the post-sweep check found it wrong: `launch/transitions.test.ts` **13**, `launch/records.test.ts` **13**, `api/authz-contract.test.ts` **370 → 397 (+27)** — three new routes × nine actors — and `projects/privileged.test.ts` **5 → 6 (+1)** |
| `pnpm test:docker` | 185 in 30 files | **185 in 30 files, 0 skipped, 830 s** — **OWED, RUN and UNMOVED**, and *predicted unmoved before it ran*: this sitting added no Docker test file, and migration 0019 only widens the schema every Docker suite already creates |

#### The findings

**F1 — `[M10]` holds in every particular, and the generated SQL is the evidence.** The
correction block said drizzle writes the CHECK rewrite itself and that appending breaks 0019.
`drizzle/0019_useful_taskmaster.sql` carries
`ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known"` immediately after the three
`CREATE TABLE`s and the matching `ADD CONSTRAINT` with all 26 types as its last statement.
**Read before adding anything to it, as the block says, and nothing was added.**

**F2 — *Read this first* 16's reassuring half is wrong, and `[M10]` already said so; this
sitting measured the guard working.** Control (c) added a 27th `EVENT_TYPE` with its schema and
its example but WITHOUT the `schema.ts` CHECK and without a migration:
`events.test.ts`'s *"is enforced by the DATABASE too — and the constraint names exactly
EVENT_TYPES"* went red, `expected [ 'ai.key_rotated', …(25) ] to deeply equal [ …(26) ]`. The
guard the plan asks for in Step 2 **already exists and a second one was not built.**

**F3 — Task 5's file list omits the FOURTH of the four edits its own module documents.**
`event-schemas.ts`'s doc comment says in terms that adding an event type is four edits — the
schema map, `EVENT_TYPES`, the database's CHECK, and **`EXAMPLE_DETAILS` in
`observability/testing.ts`** — and Task 5's *Files* names only the first three. `tsc` catches
it, because `EXAMPLE_DETAILS` is a `{ readonly [T in EventType]: … }` mapped type, so it is
cheap; it is recorded because the file it lives in warns about it by name and the plan still
missed it.

**F4 — the five new types tripped a gate the plan does not mention, and the honest fix was a
SECOND LIST.** `api/stream-contract.test.ts` asserts that every `EVENT_TYPE` not reached by a
real delivery lifecycle is in `PUBLISHED_ELSEWHERE` — and that map's own doc promises *"the test
that runs each one's publisher"*. **None of the five has a publisher anywhere yet** (Tasks 6, 10
and 14 write them), so an entry there would have been a reassuring claim that another test
covers them. `NO_PUBLISHER_YET` now names the task that writes each one, and **removing the
entry is that task's job**: the moment a lifecycle in that file reaches one, the assertion goes
red and somebody decides which list it belongs in.

**F5 — the plan's `LaunchTransitionError` shape would have left its code UNREGISTERABLE, and
either way out was red.** The plan gives it a fixed `readonly code = 'LAUNCH_TRANSITION_INVALID'`.
`error-codes.test.ts`'s scan reads `readonly code = '…'` **only for files under `api/`** and reads
`new <WireClass>('CODE'` everywhere — so a fixed field in `launch/` is invisible to both
directions: registering the code turns *"registers nothing the source never throws"* red, and
NOT registering it makes the route answer `500 INTERNAL`. **The class now takes its code as a
constructor argument**, exactly like `ReleaseError`, `SourceError`, `ConfigError`, `SsoError` and
`SecretError` — every other domain module's wire error class.

**F6 — and the plan's "both get a family (`LaunchError`)" is not expressible.**
`error-codes.test.ts` derives the family from the CLASS NAME (`m[1] as ErrorFamily`), and the two
classes answer two different statuses — 409 for a transition, 400 for an invalid record. **Two
families, named for their classes**, which is what every existing entry does.

**F7 — so Task 5 touches three `api/` files its list does not name.** The registry holds itself
to the source in BOTH directions, so the code has to be registered in the same commit as the
class that throws it: `api/error-codes.ts`, `api/errors.ts` (the `instanceof` branch, which the
registry's own status test exercises) and `api/error-codes.test.ts`'s `WIRE_CLASSES`.

**F8 — control (a) printed a message no gate can read, and it was wrong.** The refusal read
*"a IAM registration cannot go from 'submitted' to 'active'"*. Found by reading the control's
own output, not by a test — every assertion in `transitions.test.ts` matches on the part after
the noun. `what` now carries its own article.

**F9 — an edit left a doc comment describing the wrong shape, and neither prettier nor eslint
can see that.** `ApprovalDetail` was inserted between `RetireDetail`'s doc comment and
`RetireDetail` itself, so the paragraph about `handle` being *"the only thing naming what was
removed"* sat above the approval detail. Found by reading the file back after the edit.

**F10 — the three new tables ARE reachable by the application role, measured rather than
assumed.** `information_schema.role_table_grants` reads `DELETE,INSERT,SELECT,UPDATE` for
`manifest_app` on all three, through `ALTER DEFAULT PRIVILEGES`. A migration that created a table
the tests' own connection could not read would be invisible until the first test used it, and
these three are in `public` rather than in `audit` precisely so that they are writable.

**F11 — Task 6's matrix row for `token-other-project` is wrong, and control (a) is what makes
the reason visible.** Measured: `403 TOKEN_CREDENTIAL_REFUSED` on both record routes, not the
plan's `404 NOT_FOUND`, because `requireSession` runs first. See *thing to carry forward* 2.

**F12 — Task 6 says "four routes" and "four new operations"; THERE ARE THREE.**
`pnpm contract:write` added exactly `getLaunchRecords`, `recordIamRegistration` and
`recordPrivacyAssessment`. The plan's own *Read this first* 18 enumerates **seven** operations
for the whole of P6a, of which exactly three are Task 6's. **It matters because Step 5's console
reckoning is keyed to the count and D22's gate is disarmed by its own list** — a reviewer
counting to four looks for an operation that does not exist, and the gate will not tell them.

**F13 — Task 6's Step 5 as written would leave `pnpm test` RED FOR SIX SITTINGS.** It says
*"Nothing goes in `DELIBERATELY_UNCALLED` from this task"*, but D22's coverage gate requires a
console caller for **every** documented operation and the records screen is **Task 17's, in
sitting 10**. Three entries now sit in that list naming Task 17 as the one that removes them.
*Rejected:* writing the three `api.ts` functions now — that is the no-caller shape ORIENTATION §9
names four times, moved into the console, and **an unused export is invisible where a list entry
is not.**

**F14 — Task 6's file list omits the MOCK, which has its own half of D22.**
`packages/mock/src/server.test.ts` holds every documented operation to having an entry in
`ANSWERED`, so three answers and three fixtures were needed in the same commit. Both record
routes answer the FIXTURE rather than the request body: the mock keeps no state, and a route that
echoed the body would let a console bug that sends the wrong state look right here and wrong
against the platform.

**F15 — `pnpm typecheck` caught what 1449 green tests could not.** `packages/console/src/screens/tokens.tsx`
holds the capability list to the document by `tsc` in BOTH directions (P5c sitting 6's
`everyCapability`), so `launch:record` collapsed the parameter's type to `never`:
`error TS2345: Argument of type '[…11 capabilities]' is not assignable to parameter of type 'never'`.
**Every test was green through it.** CLAUDE.md's *Vitest strips types* lesson, reproduced live —
and the design worked exactly as P5c intended.

**F16 — the two representation mappers needed TWO SIGNATURES, and `tsc` found it at the route.**
`toIamRegistration(row | undefined) => T | null` made `defineRoute` reject the record handler,
because a route that has just written a row cannot answer `null` against a success schema with no
null in it. Overloads state both callers: the READ may find nothing — an absent record is a
state, not an error — and the WRITE never does.

**F17 — the new test walked straight into `expectSqlState`'s documented trap.**
`rejects.toThrow(/iam_registrations_attributes_present/)` failed **while the constraint was
refusing the insert**, because drizzle wraps every driver error in its own and the message is
`Failed query: insert into "iam_registrations" …` with the real one on `.cause`. That helper's
own doc comment describes this exact failure. It is the second time it has earned its place, and
the test now asserts SQLSTATE `23514`.

**F18 — `requireSession` is enforced TWICE, and `tsc` is the stronger half — with a limit worth
knowing.** Control (a) predicted four red matrix rows and got them; it also **does not compile**,
`error TS2339: Property 'puid' does not exist on type 'Actor'`. **But that is only because the
handler reads `actor.puid`**: a future route asserting `launch:record` that never touches it would
compile with `requireActor` and only the matrix would catch the leak.

**F19 — control (d) is more precise than the plan predicts, and the difference is what to
record.** The plan predicts *"`records.test.ts` red — and note that the database's CHECK catches
it too"*. With the module's refusal removed the request is **still refused**, by the database —
so what is lost is not the refusal but the *actionable message and hint*, and the failure becomes
a drizzle-wrapped constraint violation an administrator cannot act on. The two tests now say
which of the two guards each one exercises.

#### Negative controls — every one watched, and which could not fail

| | Control | Predicted | Measured |
|---|---|---|---|
| T5 a | one arrow removed from `IAM_ARROWS` (`submitted: ['active','change_requested']` → `['change_requested']`) | happy-path red **and** the counted test red at 8 → 7 | **FIRED, exactly**: both red, `{ allowed: 7, refused: 18 }` against `{ allowed: 8, refused: 17 }` |
| T5 b | `iamTransition` returns `to` unconditionally | every refusal red, **and the counted test red at `refused: 0`** | **FIRED**: six red, counted test `{ allowed: 25, refused: 0 }` |
| T5 c | a 27th `EVENT_TYPE` with its schema and example, no CHECK rewrite | `events.test.ts`'s constraint test red | **FIRED**: `expected […(25)] to deeply equal […(26)]` — the EXISTING guard, no second one built |
| T5 d | `iam_registrations_attributes_present` dropped, an empty list inserted | the insert succeeds where it should not | **FIRED, both directions, inside one rolled-back transaction**: with the constraint, `ERROR: new row … violates check constraint`; without it `INSERT 0 1` and `stored_attribute_count = 0` — **so Task 13's subset check would then pass vacuously**. Machine re-measured after `ROLLBACK`: 0 rows, constraint present, no stray user |
| T6 a | `requireSession` → `requireActor` on `recordIamRegistration` | four matrix rows red on the CODE; **`token-capable` becomes `pass`** | **FIRED, and the specific prediction held**: `token-capable` **200**, `token-privileged` **200**, `token-incapable` `403 FORBIDDEN`, `token-other-project` `404 NOT_FOUND`. **It also does not compile** (F18) |
| T6 b | `launch:record` removed from `PLATFORM_ADMIN` | the admin row red, `403` where `pass` is expected | **FIRED, and wider than predicted**: both record routes' admin rows red, plus two `privileged.test.ts` assertions |
| T6 c | `iamTransition` not called (state written straight through) | *refuses a first write straight into `active`* red | **FIRED**: that test red (*"promise resolved … instead of rejecting"*) and the submitted → draft refusal red with it |
| T6 d | the module's empty-attributes refusal removed | `records.test.ts` red, and the database catches it too | **FIRED, and see F19**: the module test red, the request still refused — by the DATABASE, with a message nobody can act on |
| T6 e | `launch:record` added to `PRIVILEGED` | `privileged.test.ts` red on *"is exactly D24's four"* | **FIRED**: that test red, plus the new *"does NOT make launch:record privileged"* assertion |

**ALL NINE FIRED. None could not fail** — which is the first sitting in this plan where that is
true, and it is worth saying why rather than claiming it as a win: eight of the nine act on a
PURE FUNCTION or on an authorization row, both of which are cheap to break and cheap to watch.
Sitting 3's control (b) could not fail because the branch it guarded had no caller at all; every
branch this sitting wrote has one in the same commit.

#### What this sitting decided

1. **All five of Decision 14's event types land in 0019, though three have no publisher until
   Tasks 10 and 14.** One CHECK rewrite on the audit table rather than three, which is what
   Decision 14 asks for. The cost is three types the platform cannot yet produce, and
   `NO_PUBLISHER_YET` is the forcing function that keeps that honest (F4). *Rejected:* adding
   only Task 6's two and letting Tasks 10 and 14 each rewrite the constraint.
2. **Two error classes in `launch/`, two families, code-first constructors** (F5, F6), against
   the plan's one family and fixed code field.
3. **Three temporary `DELIBERATELY_UNCALLED` entries naming Task 17**, against Task 6's
   *"nothing goes in the list"* (F13).
4. **`approvedAt` is set when a PIA REACHES `approved` and cleared when it leaves.** A timestamp
   that survived a return to `draft` would say an assessment was approved while its state said it
   was being rewritten, and §13's gate reads the state.
5. **A request that does not MOVE the state is an edit, not an arrow.** Pasting a corrected
   ticket reference against a `submitted` registration must succeed, and the machines have no
   self-arrows — `transitions.test.ts` asserts that directly, and `records.ts` short-circuits
   before calling them.
6. **The states are written out as literals in `transitions.test.ts` rather than derived from the
   arrow tables.** A test that asked the table under test which states exist would walk a smaller
   grid the moment a state was dropped, and the counted controls would still pass.

#### The machine, queried at close rather than recalled

| | |
|---|---|
| `make doctor` / `make verify` | **19/0 and 54/0**, both re-run AFTER the Docker tier |
| per-app resources | **`containers=12 networks=4 volumes=8`** — the Docker tier took it up and `dead-app-resources.sh --apply` took it back, the **EIGHTH** measurement of that cycle with **the same seven networks and the same one volume** (`mf-blueprint-ntm-`, `mf-chem-labs-`, `mf-fixture-rt-`, `mf-fixture-s6-`, `mf-fixture-s6nb-`, `mf-saml-probe-`, `mf-saml-unsigned-staging-net`, plus `mf-chem-labs-staging-db-data`). Re-measured by the script itself afterwards: `networks left: 4`, `volumes left: 8` |
| LiteLLM | `p4b-probe-user` came back as an orphan **again** and was deleted; re-read afterwards, **4 users remain** and every container-held user survived |
| cleanup scripts | **BOTH were ALLOWED `--apply` in this session** and were run by the agent. The classifier refuses them in other sessions — try the command |
| database | **EMPTY**: `projects=0 users=0 instances=0 releases=0`, and `iam_registrations=0 privacy_assessments=0 approvals=0`. `pnpm test` truncates and the gates ran last |
| migrations | **20 applied**, 0019 among them |
| `lo0` | `127.0.0.1`, `127.0.0.2`, `127.0.0.3` |
| port 7100 | **nothing listening** — the control plane was never started this sitting |
| `HEAD` moved under this sitting | **twice**, `9987484` and `ad979e7`, both a design agent's markdown |
| the four shared HTML pages | **checked, and none needed a change**: this sitting altered no decision, no spike status, no hostname and no count they restate |
| app images | **the snapshot diff names exactly FOUR new ones, all the Docker tier's** — `boot-recover`, `chem-labs`, `fixture-rd`, `redeploy-cp` — and **neither cleanup script covers images**. **NAME THE METRIC** (CLAUDE.md): `docker images -q \| wc -l` reads **123**, `docker images -q \| sort -u \| wc -l` reads **115**, and `docker images --format '{{.Repository}}' \| grep -c '^127.0.0.1:7107/local/'` reads **73**. `docker images \| grep '^local/'` still answers **0** and still reads as *none* |
| protected resources | all four survivors present (`docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`), and the CA volume — **`manifest-caddy-data`, not `caddy-data`** — confirmed by `make verify`'s own check |
| `docker-simple-saml` | still clean: its only dirty path is the untracked `cert.zip` dated months before this project |
| snapshot diff | `scripts/snapshot-machine.sh` before and after: **nothing but uptimes, 2 GiB of free disk, the four images above and this sitting's own `HEAD`** |

#### What the post-sweep check found — TWO, and the streak since P5b's third sitting holds

**F20 — THE LIST THIS SITTING BUILT TO STAY HONEST HAD ALREADY GONE DISHONEST, AND §7e SAID IT
HAD NOT.** Task 5 put all five new event types in `NO_PUBLISHER_YET`; **Task 6 then gave two of
them publishers** (`recordIamRegistration` and `recordPrivacyAssessment` in `launch/records.ts`,
with `records.test.ts` asserting both payloads) **and nothing moved them out.** So a map whose
doc comment says *"types with NO PUBLISHER ANYWHERE YET"* named two that have one — the exact
failure the second list exists to prevent, committed by the sitting that wrote it. Worse, §7e
told the next agent the move had already happened. **Both fixed**: the two are now in
`PUBLISHED_ELSEWHERE` naming `launch/records.test.ts`, `NO_PUBLISHER_YET` holds Tasks 10's and
14's three, and §7e says so. **The assertion could not catch this** — it compares the union of
the two maps against what the lifecycle reaches, so moving a key between them is invisible to
it. Found only by opening the file.

**F21 — a test-count attribution derived by SUBTRACTION was wrong, exactly as §6 warns.**
This sitting first wrote *"13 + 13 + 28 in `api/authz-contract.test.ts`"*, because 1449 − 1395 =
54 and 54 − 26 = 28. **Counted per file instead**: `authz-contract.test.ts` is **370 → 397, +27**,
and the fifty-fourth test is **`projects/privileged.test.ts` 5 → 6** — the assertion that
`launch:record` is NOT privileged, which is the one this sitting's Decision 4 most depends on and
the one the wrong sum erased. Corrected in ORIENTATION's top-of-file box, §2's box, RUNBOOK and
this record. **§6's rule is *re-derive every number rather than subtracting from the last one*,
and this is that rule paying for itself in the sitting that read it.**

**A third claim was checked and HELD**: every file, export, path and marker §7e names was opened
— `spikes/p6a-baseline/README.md`, Task 7's `[M2][M4][M8]` block at line 1709,
`getIamRegistration`/`getPrivacyAssessment` as exports of `launch/records.ts`, both new classes in
`WIRE_CLASSES`, exactly three `DELIBERATELY_UNCALLED` entries, and both Docker files named as
driving the deploy path.


---

### Sitting 5 — Task 7, the gate that BLOCKS, alone — 2026-09-20

**§13's CHECKLIST IS NOW THE THING THAT GATES PRODUCTION, AND BOTH OF THE OLD
UNCONDITIONAL REFUSALS ARE GONE.** `assertLaunchable` in `launch/gate.ts` is one
evaluation over `computeLaunchReadiness`; the deploy route calls it and the read route
calls the same computation, so the view a person reads and the thing that refuses them
cannot disagree (Decision 2). The inner gate inside `deployRelease` is **deleted** rather
than made conditional (Decision 3), which is what makes `deployRelease`'s production path
reachable at all — Task 15 is the first thing that will walk it for real.

**MEASURED LIVE, END TO END, AGAINST `journey-app` THROUGH THE EDGE — and this is the
sitting, not the tests.**

| | blocking items in the refusal | HTTP |
|---|---|---|
| nothing recorded | `iam-registration`, `privacy-assessment`, `rehearsal`, `admin-approval` | `409` with the checklist |
| IAM `submitted` (ticket IAM-2026-4471) | *"The registration is 'submitted' (ticket IAM-2026-4471) and must be 'active'…"* | — |
| IAM `active`, PIA `approved` | `rehearsal`, `admin-approval` | `409` with the checklist |

The `met` messages are the point of R1, and they name what UBC said:
*"Registered as https://journey-app.manifest.internal/sp, active (ticket IAM-2026-4471),
releasing 3 attribute(s)."* and *"Approved by UBC Privacy Office (K. Lam) on 2026-09-20
(ticket PIA-2026-0912)."* **The blocking set SHRANK because an administrator recorded two
rows** — which is the difference between a gate that reads the checklist and one that
refuses unconditionally, and it is not visible from any test.

**THE THREE THINGS TO CARRY FORWARD.**

1. **THE PLAN'S STEPS 2 AND 4 CANNOT BOTH BE TRUE, AND TAKING STEP 2 ALONE WOULD HAVE MADE
   THE ERROR CODE INVISIBLE TO ITS OWN REGISTRY.** Step 2 moves `ProductionGateError` to
   `launch/`; Step 4 says the registry entry becomes `families: ['api']`. With the class
   out of `api/` there is no `api` family left — and worse, `error-codes.test.ts`'s scan
   reads `readonly code = '…'` **only under `api/`**, which is sitting 4's F5 exactly one
   sitting later. The class had a fixed `readonly code`, Task 7 deletes the `ReleaseError`
   that was the registry's only other sighting of that code, so the naive move leaves
   `RELEASE_PRODUCTION_GATE_UNAVAILABLE` thrown by nothing the scan can see and
   *"registers nothing the source never throws"* goes red with nothing to point at. **The
   code is now a constructor argument** (`new ProductionGateError('RELEASE_…', view)`),
   `ProductionGateError` is in `WIRE_CLASSES` and `ErrorFamily`, and the entry is
   `families: ['ProductionGateError']`.
2. **THE PLAN'S OWN PREDICTION FOR CONTROL (b) IS WRONG IN THE DIRECTION THAT MATTERS.** It
   says *"the byte-identical test still passes (the read is unaffected) … Predict it as the
   matrix, not the delivery test"*. Measured: **six red across four files**, the delivery
   test among them. The reasoning was about the comparison — the two payloads would indeed
   still match — and the test never reaches the comparison, because it asserts
   `statusCode === 409` first and the route now returns `200`. **A hand-off that tells the
   next agent to expect a green test makes a real red look like an unrelated break.**
3. **TASK 7 TOUCHES FIVE FILES ITS OWN LIST DOES NOT NAME, AND ONE OF THEM IS `make
   demo-journey`.** `releases/releases.test.ts` held the only test of the inner gate;
   `lifecycle.test.ts` asserted every item's state; `packages/journey/src/main.ts` asserted
   `iam-registration === 'not_built'` — so **step 9 of the offline acceptance and a step of
   `make ci-acceptance` would have gone red**; `packages/mock/src/fixtures.ts` carries the
   checklist a console developer builds against; and `api/representations/launch.ts`'s two
   `describe` strings told the published document the view was read-only.

| Gate | Before | After |
|---|---|---|
| `make doctor` | 19 checks, 0 failed | **19, 0 failed** — unmoved, re-run after the Docker tier; this sitting adds no platform check |
| `make verify` | 54 checks, 0 failed | **54, 0 failed** — unmoved, same reason |
| `pnpm test` | 1449 in 110 files | **1456 passed + 1 SKIPPED in 110 files**, run twice and identical. **Counted per file, never subtracted**: `launch/readiness.test.ts` **8 → 15 (+7)**, `api/delivery.test.ts` **17 + 1 skipped** (the gate's positive control, pending Tasks 10 and 14), `releases/releases.test.ts` **62 → 62** (one test REPLACED), `api/authz-contract.test.ts` **397 → 397** and `lifecycle.test.ts` **1 → 1**. **No new file.** §2's box has never carried a skipped test before |
| `pnpm test:docker` | 185 in 30 files | **185 in 30, 0 skipped, 826 s** — **OWED** (`releases/`, `launch/`, `api/routes/`) **, RUN and UNMOVED**. That it is unmoved is itself a measurement: the inner gate's deletion changes what `deployRelease` does for production, and **not one Docker test deploys to production** — §7e's *"`deployRelease`'s production path is exercised for the first time, which is Task 15"*, confirmed from the other end |

#### The findings

**F1 — the plan's Step 2 and Step 4 contradict each other, and Step 2 alone breaks the
registry.** See *thing to carry forward* 1. The self-review's item 3 spotted that the class
had to move and did not follow the move through to the scan; sitting 4's F5 had already
paid for the same rule for `LaunchTransitionError`, **one sitting earlier, in the same
module.**

**F2 — `error-codes.test.ts`'s `make` map needed a checklist that PARSES, and a failure
here would have been silent rather than red.** The map builds one instance per family and
asserts the status. `toErrorResponse` runs the view through `LaunchReadiness.safeParse`
and, when that fails, **sends the refusal without the checklist and writes a line to
`console.error`** — so a malformed stub would have produced a noisy pass, not a failure.
The stub is a valid empty-item view with a uuid `projectId`.

**F3 — `releases/releases.test.ts` held the ONLY assertion that the second gate existed,
and the plan's file list does not name it.** *"refuses production, naming the
LaunchReadiness items that do not exist yet"* went red on the first full run —
`promise resolved "{ …(8) }" instead of rejecting` — which is the deletion **proved rather
than asserted**. It is replaced with the opposite claim, *"deploys to production like any
other environment — the gate is the route's, not this function's"*, asserting the
instance's environment, release and state rather than that an answer arrived. **That test
is the first thing in the repository ever to walk `deployRelease`'s production path.**

**F4 — `lifecycle.test.ts` could not see this task at all, and the plan does not name it
either.** It asserted `notComputed.every(state === 'not_built' || state === 'met')` for
every item but `scans` — **a claim true of almost any checklist**, and green before and
after the two items changed meaning. It now names every item's state in one `toEqual`, so
an item added, removed or quietly satisfied turns it red.

**F5 — and rewriting it measured something the plan does not state: the lifecycle
fixture's app signs nobody in with CWL, so its `iam-registration` is `met` by the `usesCwl`
branch and not by a recorded row.** The first expectation said `unmet` and went red:
`- "iam-registration": "unmet"` / `+ "iam-registration": "met"`. §9's exemption is real and
it is the branch a reader meets first — the assertion now says which of the two it is
exercising, because the same value arrives by two very different routes.

**F6 — `packages/journey/src/main.ts` asserts `iam-registration === 'not_built'`, so
`make demo-journey` would have gone red — and with it step 9 of the offline acceptance and
a step of `make ci-acceptance`.** It is the only assertion in the whole journey that could
see this task. It is now two checks: *"the two external records are tracked, and unmet
until an administrator records them"* (new, and the one that proves the change from
outside) and *"what Manifest does not track yet says so, and who builds it"*, re-keyed onto
`rehearsal` and `admin-approval`, which genuinely are not built. Both green.

**F7 — the mock's checklist fixture had no `unmet` item at all**, so a console built
against it would never have rendered the state the platform now sends for every production
project. `privacy-assessment` there is `unmet` with no `builtBy` and the platform's own
wording. **A divergence that predates this task is recorded rather than quietly fixed**:
the fixture's `domain` is `not_built` where the platform says `met`, which is Task 17's to
reconcile when the records screen lands.

**F8 — the published document said the checklist was read-only, in two places.**
`LaunchReadiness`'s description read *"Read-only in Phase 1; Phase 2 gates on it."* and
`LaunchReadinessItem.state`'s described `not_built` and never `unmet`. Both are now true,
and `pnpm contract:write` + `contract:generate` moved exactly four lines across
`openapi.json` and `schema.d.ts` — **no operation and no shape, so `@manifest/contract`
stays 1.0.0.**

**F9 — `[M4]`'s *2279 bytes* is exact, and reading it the obvious way gives a different
number.** The before-measurement read **1879** for both paths and looked like a
contradiction; `jq -S .` pretty-printed reads **2279** for the same two payloads, which is
`[M4]`'s figure exactly. CLAUDE.md's *name the metric* rule, met on the first number this
sitting wrote down. **The property is *identical*, and the byte count is a property of the
payload** — after the two records are met the same pair reads 1781/1781 compact.

**F10 — a control-plane restart invalidates every session, because README's block mints a
new `MANIFEST_SESSION_SECRET` on each run.** Control (d) needs two restarts, and the
sessions taken before the first one answered `401 UNAUTHENTICATED` afterwards. This is the
block working as §7e describes — *"a stable secret lets an earlier sitting's cookie
survive"* — seen from the other side: **any sitting that restarts the control plane mid-run
must sign in again**, and a `401` there is the harness, not the platform.

**F11 — `scripts/ci-acceptance.sh`'s `EXPECT_TESTS` is the PASSED count, and this is the
first sitting to give the suite a skipped test.** `1457` there would read `MOVED` on every
run. Checked against the literal line rather than reasoned about:
`awk '{print $2}'` over `      Tests  1456 passed | 1 skipped (1457)` reads **1456**. The
file now says so, and says that Task 14 takes it to 1457 when it un-skips the control.

**F12 — `computeLaunchReadiness`'s own doc comment said §17 ships the gate in Phase 2**,
which this task falsified in the same file. It now says the view has two callers and that
**an item added here changes what production deploys are possible**, not just what a screen
shows — which is the consequence of Decision 2 that a future reader most needs.

#### Negative controls — every one watched, and which could not fail

| | Control | Predicted | Measured |
|---|---|---|---|
| a | `assertLaunchable` throws unconditionally (the `ready` check removed) | **nothing can fail**: the positive test is skipped until Task 14 | **CANNOT FAIL, at the strongest scope**: the whole unit tier, **1456 passed / 1 skipped in 110 files**, green. Predicted in advance rather than discovered, and **Task 14's step 5 re-runs it** |
| b | `assertLaunchable` returns without checking `ready` | the matrix's two production rows red; **the delivery test still passes** | **FIRED, and WIDER — 6 red in 4 files**: both matrix production rows (`owner`, `admin`), **`delivery.test.ts`'s byte-identical refusal test**, `lifecycle.test.ts`, and both new gate tests. **The plan's prediction was wrong** — see *thing to carry forward* 2 |
| c | `iamItem` returns `met` for a `submitted` registration | `readiness.test.ts` red on *"must be 'active'"* | **FIRED, exactly one test**: *"iam-registration: unmet while the registration is submitted, naming the state and the ticket"*. The `active` tests cannot see it, correctly |
| d | the inner gate restored **and** the outer gate made to always pass — run LIVE against `journey-app` | the deploy refuses with an envelope carrying **no** checklist | **FIRED, and it is this task's real deliverable seen**: `HTTP 409`, `{"code":"RELEASE_PRODUCTION_GATE_UNAVAILABLE","hasChecklist":false}`, with the old message *"…they are P6's, and this gate stays closed until they do."* **Same status, same code, no checklist** — so a test asserting status and code is green against a Task 7 that removed only the outer gate, `[M2]` confirmed from the other direction |
| e | *(the conservative default, not in the plan's table)* a project with **no candidate release** must not read *no registration needed* | `iam-registration: unmet` | **HELD**: the first readiness test runs on a project with no candidate at all and asserts `unmet`; the `usesCwl` default is `provider !== 'none'`, so *no evidence* stays *it will need one* |

**FOUR OF THE FIVE FIRED; (a) could not fail and was predicted not to.** The honest reading
is that (a) is the gate's whole positive direction and there is no way to exercise it until
`rehearsal` and `admin-approval` exist — which is also why `delivery.test.ts`'s positive
control is `it.skip`ped with those two task numbers in its name. **What keeps the deploy
route honest in the meantime is its own staging case**, which answers `200` for a
collaborator in the same file: this is not a route that refuses everything.

#### What this sitting decided

1. **`ProductionGateError` moves to `launch/` AND takes its code as a constructor
   argument** (F1), against the plan's Step 4. *Rejected:* keeping the class in `api/` —
   `launch/gate.ts` would have to import `api/`, the dependency running the wrong way;
   **extending `error-codes.test.ts`'s `readonly code` scan to `launch/`** — that weakens
   the gate that keeps the registry honest, to accommodate one class, and sitting 4 chose
   the constructor argument for both of `launch/`'s other wire classes.
2. **The gate's tests live in `readiness.test.ts`, not a new `gate.test.ts`.** Decision 2's
   whole claim is that the gate and the view are ONE computation; putting them in one file
   means a future edit that gives the gate its own predicate has to move tests away from
   the view's, which is the point at which somebody should stop. The file's doc comment
   says so. *Cost:* the file name does not advertise the gate, so the `describe` does.
3. **`readiness.test.ts` writes the two rows DIRECTLY rather than through
   `recordIamRegistration`.** This file is about what the checklist READS; `records.test.ts`
   is about how a row gets there. Going through the write path would make a readiness
   failure ambiguous between the two, and would drag an `EventBus` into a pure read's test.
4. **The obsolete inner-gate test is DELETED, not `it.skip`ped.** A skipped test is a
   promise naming the task that un-skips it (which is what `delivery.test.ts`'s is); a
   skipped test nobody will ever un-skip is dead code that reads like a promise.
5. **The mock's `privacy-assessment` fixture is updated and its `domain` divergence is
   recorded rather than fixed** (F7). Fixing `domain` is Task 17's, with the records
   screen; changing it here would be a fixture edit no test and no reader asked for.

#### The machine, queried at close rather than recalled

| | |
|---|---|
| `make doctor` / `make verify` | **19/0 and 54/0**, both re-run AFTER the Docker tier and after the cleanups |
| per-app resources | **`containers=12 networks=4 volumes=8`** — the Docker tier took it to `networks=11 volumes=9` and `dead-app-resources.sh --apply` took it back. **The NINTH measurement of that cycle, and the same seven networks and the same one volume again** (`mf-blueprint-ntm-`, `mf-chem-labs-`, `mf-fixture-rt-`, `mf-fixture-s6-`, `mf-fixture-s6nb-`, `mf-saml-probe-`, `mf-saml-unsigned-staging-net`, plus `mf-chem-labs-staging-db-data`). Re-measured by the script itself: `networks left: 4`, `volumes left: 8` |
| LiteLLM | **8 users → 4.** Three orphans: `p4b-probe-user` **again**, plus a journey-app user from each of this sitting's TWO `make demo-journey` runs — the *every demo adds one* property, twice in one sitting. Re-read afterwards by the script: 4 remain, every container-held user survived |
| cleanup scripts | **BOTH were ALLOWED `--apply` in this session** and were run by the agent — the third consecutive sitting. The classifier refuses them in other sessions; try the command |
| database | `journey-app` is present and serving staging, with an **`active` IAM registration and an `approved` PIA recorded** (tickets IAM-2026-4471 and PIA-2026-0912) — **the first rows those tables have held outside a rolled-back test.** The four gates ran BEFORE the demo, so `pnpm test` has not truncated since |
| migrations | **20 applied**, 0019 among them; this sitting adds none |
| `lo0` | `127.0.0.1`, `127.0.0.2`, `127.0.0.3` |
| port 7100 | **nothing listening at close.** The control plane was started three times during the sitting (at the start, after the Docker tier, and twice more for control (d)) and **stopped at the end, so the machine matches how it was found** — `before.txt` had 7100 free. Each restart mints a new `MANIFEST_SESSION_SECRET`, so every session taken before one is dead (F10) |
| `HEAD` moved under this sitting | **no** — `25dbca8` at open, and this sitting's own commits on top. The first sitting in this plan where it did not |
| the four shared HTML pages | **ALL FOUR opened and counted, and none needed a change** — see F13, because the first version of this row was written after grepping TWO of them. `IAM`, `Privacy Impact` and every checklist STATE (`not_built`, `unmet`, `builtBy`) appear **zero** times in all four. The word *checklist* appears **five** times across three: twice in `manifest-decisions.html` (both about D33's reviewer socket being shown and NOT blocking — still exactly true), twice in `manifest-schematic.html` (*"the going-live checklist"*, and an app *"refused… until a formal checklist is complete"* — which Task 7 makes more true, not less), and once in `manifest-phases.html` (*"the launch checklist becomes a gate that actually blocks"*, a statement about product Phase 2, which is what this plan is building) |
| `docker-simple-saml` | still clean: its only dirty path is the untracked `cert.zip` dated months before this project |

#### What the post-sweep check found — TWO, and the streak since P5b's third sitting holds

**F13 — THE ROW ABOUT THE FOUR SHARED HTML PAGES WAS WRITTEN AFTER OPENING TWO OF THEM.**
The sweep's own instruction is to *check rather than assume, and say in the session record
that you checked* — and the first draft of that row said *"none of the four mentions IAM, a
PIA or the checklist's states at all"* on the strength of a `grep -n IAM` over
`manifest-schematic.html` and `manifest-phases.html` only. An earlier `grep -l` in the same
session had already listed **`manifest-decisions.html`** as matching one of the terms, and
that signal was not followed. **Opening all four and counting confirms the conclusion** —
`IAM`, `Privacy Impact`, `not_built`, `unmet` and `builtBy` are zero across all four, and
the five occurrences of *checklist* are design statements Task 7 makes more true rather than
less — **but the conclusion was right by luck rather than by checking**, which is the exact
shape §6's list of past defects describes: *found by opening the thing pointed at, not by
re-reading the sentence.* The row now names the counts and the three pages.

**F14 — AND §7e ITSELF CARRIED ONE, FOUND BY READING IT BACK COLD: THE ERROR-CODE RULE WAS
ATTACHED TO THE WRONG TASK, AND THE REAL TRAP IS SHARPER THAN THE SENTENCE.** The hand-off
said *"Task 8 adds `STEP_UP_REQUIRED`"*; the plan adds it in **Task 9**
(`api/error-codes.ts`, line 2161). Following the pointer rather than the sentence turned up
the thing that matters: **Task 9's *Files* puts `StepUpRequiredError` in `projects/authz.ts`
and its Step 1 snippet gives it a fixed `readonly code = 'STEP_UP_REQUIRED'`** — which is
F1's defect and sitting 4's F5 **for the third time, now specified in advance by the plan
itself.** Checked against the code: **no domain module has a fixed code field on a class the
API answers as itself.** `projects/authz.ts`'s `AuthorizationError` takes its code as a
constructor argument and `TokenCapabilityRefusedError` carries none at all, `api/errors.ts`
supplying it at the `instanceof` branch; the six `readonly code = '…'` outside `api/`
(`runtime/`, `ai/`, `build/`, `services/`) are INTERNAL classes that never reach the wire, so
they are not a precedent. §7e now names the task, the file, the class and both acceptable
shapes. **A rule stated against the wrong task is a rule the next agent meets after the
mistake rather than before it.**

**Three other claims were checked and HELD**, each by opening the thing and counting it, not
by re-reading the sentence:

- **`launch/readiness.test.ts` 8 → 15.** `git show 25dbca8:…/readiness.test.ts | grep -c '^  it('`
  reads **8**; the file reads **15** now. Derived by counting both ends, never by subtracting
  from `pnpm test`'s total — sitting 4's F21 is why.
- **"five files its own list does not name"**, counted against the commit rather than
  recalled: `68b5cbd` touches **18** files; Task 7's *Files* names **8**; `error-codes.ts`
  and `error-codes.test.ts` are named in Step 4's prose; `packages/contract/`'s two are
  generated and `launch/index.ts` is one export line — leaving exactly **five** that the
  plan names nowhere and that each needed a real change: `api/representations/launch.ts`,
  `lifecycle.test.ts`, `releases/releases.test.ts`, `packages/journey/src/main.ts` and
  `packages/mock/src/fixtures.ts`.
- **`scripts/ci-acceptance.sh`'s extraction survives the skipped line.** `awk '{print $2}'`
  over the literal string `      Tests  1456 passed | 1 skipped (1457)` reads **1456**, run
  against a fixture file rather than reasoned about — which is the whole reason
  `EXPECT_TESTS` is 1456 and not 1457.

### Sitting 6 — Tasks 8 and 9, step-up re-authentication — 2026-09-20

**§20'S SECOND AUTHENTICATION ROUND TRIP EXISTS, IT GUARDS FIVE CAPABILITIES, AND IT HAS
BEEN WALKED END TO END AGAINST THE REAL MANIFEST IdP.** `GET /auth/step-up` sends a signed
AuthnRequest carrying `ForceAuthn="true"`, bound to the browser that started it by its own
`manifest_stepup` cookie (Decision 17); the ACS's step-up branch validates the assertion
with the instance that issued the request, refuses one for anybody but the person already
in hand, and stamps `steppedUpAt` onto the existing session cookie. `assertStepUp` then
refuses `PRIVILEGED ∪ {release:approve}` to a session that has not re-proved itself inside
ten minutes, with `403 STEP_UP_REQUIRED` — **the API's fifth `403`**.

**MEASURED LIVE, THROUGH THE EDGE, AGAINST THE REAL IdP — and this is the sitting, not the
tests.** The plan asks only for `pnpm test:docker`; this was done because ORIENTATION's
*Before you trust a green result* says to drive the real entry point, and because nothing
had ever completed a second round trip on this machine.

| Step | Answer |
|---|---|
| a real CWL sign-in as `instructor`, through the edge | `steppedUpAt: null` on the session cookie |
| `POST /v1/projects/{id}/members` on that session | **`403 STEP_UP_REQUIRED`**, *"'members:manage' needs a second authentication round trip (§20)"*, hint naming `/auth/step-up?returnTo=` |
| `GET /auth/step-up`, **on the same warm IdP cookie jar** | the IdP **served a login form** — which is `[M3]`'s control re-fired inside the real flow: that jar had just completed a sign-in, so without `ForceAuthn` it would have been handed an assertion straight through |
| the assertion back through the ACS | `steppedUpAt: 1789935795666`, with `userId`, `puid`, `role`, `issuedAt` **and `expiresAt` all unchanged** — the same session, re-signed, not a new one |
| the SAME request again | **`201`**, and `GET …/members` shows both people |
| **the control**: a step-up in which the IdP authenticates the **student** while the browser holds the **instructor's** session | **REFUSED**, and the session cookie afterwards is **byte-identical** — still `ins000001`, still `steppedUpAt: null` |

The operator log is the whole story in four lines, and §14 is respected — the puid and
nothing else, no assertion, no cookie, no secret:

```
[auth] step-up started for ins000001
[auth] step-up COMPLETED for ins000001
[auth] step-up started for ins000001
[auth] step-up REFUSED: the assertion is for a different person than the session
```

*One thing that walk is worth recording for its own sake: the first run reported `404` on
both member calls and it was **the harness's own bug** — a greedy `sed -n 's/.*"id":"\(…\)".*/\1/p'`
took the LAST id in the project body, an environment's. A `404` that reads exactly like
§13's authorization refusal was a wrong path parameter.* **Assert the shape of the answer.**

**THE THREE THINGS TO CARRY FORWARD.**

1. **`assertStepUp` AS THE PLAN WRITES IT KILLS D24'S CONFIRM-AND-RETRY LOOP** (F8). Its
   first line refuses every token, on a premise that is false: a token carrying a
   human-confirmed grant reaches it. A token can never step up, so refusing every token
   makes all four privileged capabilities unreachable **even after a person says yes**.
   The grant is what stands in step-up's place and is the stronger control.
2. **NEITHER SHAPE §7e OFFERS FOR THE ERROR CLASS FITS** (F9), and the reason generalises:
   `error-codes.test.ts`'s scan **cannot tell an expectation from a throw**, because
   `api/authz-contract.ts`'s `{ status, code: 'X' }` constants match its `code: '…'`
   pattern and live under `api/`. The third shape — no code on the class,
   `api/errors.ts` supplying it — is the one that fits, and it is `TokenCapabilityRefusedError`'s,
   in the same file.
3. **A GUARD'S BLAST RADIUS IS NOT ITS ROUTES** (F10). The plan predicted 4 red tests;
   48 went red across 7 files, and **29 of them were a fixture whose setup call nobody
   had ever read the answer to**.

| Gate | Before | After |
|---|---|---|
| `make doctor` | 19 checks, 0 failed | **19, 0 failed** — unmoved, re-run AFTER the Docker tier and after both cleanups. This sitting adds no platform check |
| `make verify` | 54 checks, 0 failed | **54, 0 failed** — unmoved, same reason |
| `pnpm test` | 1456 passed + 1 skipped, 110 files | **1496 passed + 1 skipped, 112 files**, run twice and identical. **Counted per file, never subtracted**: `identity/step-up.test.ts` **9 (NEW)**, `projects/step-up-guarded.test.ts` **10 (NEW)**, `api/auth.test.ts` **22 → 30 (+8)**, `api/authz-contract.test.ts` **397 → 406 (+9)**, `api/error-codes.test.ts` **6 → 7 (+1)**. **Up 40 and two files.** The skip is still `api/delivery.test.ts`'s, untouched |
| `pnpm test:docker` | 185 in 30 files | **185 in 30, 0 skipped, 829 s** — **OWED** (`identity/`, `sso/`, `projects/`, `api/routes/`)**, RUN and UNMOVED — and unmoved is a MEASUREMENT here**: no `*.docker.test.ts` makes a member call over HTTP (`boot.docker.test.ts` writes `pending_actions` rows straight into Postgres) and none drives `/auth/step-up`, so **that tier cannot see Task 9 at all**. Task 19's demo is the first thing that will |
#### The findings

**F1 — Task 8's *Files* line and its Step 2 snippet describe two different designs, and
the object-level one is cheaper.** *Files* says *"`SamlSp` gains `stepUpUrl`"*; Step 2's
closing line says `server.ts` builds **two** SPs (`deps.samlStepUpSp`), while the doc
comment in that same snippet opens *"ONE SP, TWO REQUEST BUILDERS."* Two SPs would have
duplicated the seven-field configuration at **both** construction sites — `src/index.ts`
and `api/testing.ts` — and those seven fields are precisely the thing that must not differ
between the instances (Decision 17: one entityID, one ACS, one keypair, so the IdP's
registration does not change). Built as **one** `SamlSp` holding two `SAML` instances, with
`stepUpUrl` and `validateStepUp`. No new `ServerDeps` field, nothing for the Docker tier's
boot to learn, and node-saml's per-instance `InResponseTo` cache becomes an implementation
detail the callback cannot get wrong.

**F2 — `SessionActor` grew one field and `tsc` found seven test literals `pnpm test`
could not.** Four in `projects/authz.test.ts`, three in `repository.test.ts`, each
constructing a bare session actor. This is the argument for `steppedUpAt: number | null`
over an optional property, paid back inside the hour: an optional field would have compiled
everywhere and left seven call sites silently not stepped up. They now go through
`sessionActor()` in `projects/testing.ts`, whose second caller is `step-up-guarded.test.ts`.

**F3 — the authorization matrix's drift guard drags `authz-contract.ts` into Task 8, whose
*Files* list does not name it.** *"covers every route the server registers"* fails the build
for a route with no row, so `GET /auth/step-up` needed one — and the nine actors then came
for free, including *"a token cannot start a step-up: 403 TOKEN_CREDENTIAL_REFUSED"*, which
Task 8's step 6 asks for by name and which would otherwise have needed a project fixture in
`auth.test.ts`. **A stranger `pass`es**, which is correct rather than a hole: stepping up
proves who you are and authorizes nothing.

**F4 — control (e) FIRED, where the plan says in bold that nothing would.** Task 8's table
calls (e) *"the most important row"* and predicts that removing `forceAuthn: true` reddens
nothing, because only `[M3]`'s live measurement can see it. Measured at the **whole-suite**
scope: **one test red**, *sends ForceAuthn="true" on the step-up request*. `ForceAuthn` is
an XML attribute on the `<AuthnRequest>`, the redirect binding deflates that document, and
`[M3]` proved the flag by inflating it — so the same assertion is available in the unit
tier. The invisible half is narrower than the plan says and is still real: whether the IdP
**honours** the flag. The doc comment written from the plan's prediction was corrected at
the source in `fbf674c`.

**F5 — control (b) fired FIVE red, in Task 8 rather than Task 9, and reddened the positive
control the plan says stays green.** The plan: *"stamps steppedUpAt … stays green and Task
9's* a fresh sign-in is not stepped up *goes red. Predict it as Task 9's, and re-run it
there."* Measured with `issueSession` stamping at sign-in: **5 red across 2 files**, and the
positive control is among them — it asserts the claim is `null` **before** the step-up, so a
session that arrives already stepped up fails at that line. Sitting 5's *thing to carry
forward 2*, one sitting later: **a plan's prediction about which test goes red is a
hypothesis.**

**F6 — an UNVERSIONED route is still a contract change.** *Read this first* 18 says
`GET /auth/step-up` *"is unversioned and is therefore not one"* of D22's operations, which
is true and is not the whole story: `UNVERSIONED` is **published in the OpenAPI document**,
so `document.test.ts` went red until `pnpm contract:write` ran. Seven lines across the two
generated files for Task 8 and seven more for Task 9 — the unversioned entry, two SAML
codes, `STEP_UP_REQUIRED`, and the two member operations' error lists. **No operation and no
shape, so `@manifest/contract` stays 1.0.0** (sitting 5's F8 precedent, and the same
reading).

**F7 — a step-up must not extend a session, and the plan's *"…same options…"* hides the
question.** The callback re-signs the session it already has, so `expiresAt` carries
through unchanged and the browser cookie's `maxAge` must be the **remaining** life rather
than a fresh twelve hours. Both writers of `manifest_session` now go through one local
`sessionCookie(maxAgeSeconds)` helper, so the flags — `httpOnly`, `SameSite=Lax`, `Secure`
from the origin, `path=/` — cannot drift between a sign-in and a step-up; only the age
differs, which is the one thing that should.

**F8 — THE SITTING'S HEADLINE: `assertStepUp` AS THE PLAN WRITES IT KILLS D24'S
CONFIRM-AND-RETRY LOOP.** Its first line refuses every token, on the stated premise that
*"a token NEVER reaches here in a correct route: every step-up-guarded route either calls
`requireSession` or is refused by D24's central rule first."* **The premise is false.** A
token carrying a human-confirmed `grant` passes `assertCapability` — that branch `return`s,
deliberately, and P5b sitting 6's F-series is why — and arrives here. A token can never
step up, so *"refuse every token"* and *"let a confirmed retry through"* cannot both hold.
**Measured: `delegation.test.ts` went nine red, and FOUR of the nine are the loop itself**
— *lets the agent's retry through exactly once*, *lets the confirmed retry of a REMOVAL
through, exactly once*, *replays the confirmed retry's ANSWER for the same key* and
*leaves the confirmation usable when the RETRY's handler fails*. (The other five are
ordinary session-side member calls, F10's.) That is the property P5b spent Tasks 6, 7 and
8 building, and the repair took the file from nine red to five. The fix is one line and it is not a weakening:
**the grant stands in step-up's place and is the stronger of the two**, because a person who
holds the capability themselves read THIS request — this token, this method, this path, this
body — in an interactive session and said yes, once. Everything else still fails closed,
which is what refuses a token holding `release:approve` (*Read this first* 2's whole point).

**F9 — the error class's shape: the plan's is wrong, and BOTH of the two shapes §7e offers
are wrong too.** §7e generalises sittings 4 and 5 as *"a new wire code is a constructor
argument unless its class lives under `api/`"* and says to pick one of those two. Measured,
neither fits:

 * a fixed `readonly code` in `projects/` is **invisible** to `error-codes.test.ts` — the
   plan's own Step 1 snippet, and sitting 4's F5 for the third time;
 * the **constructor argument**, with the class in `WIRE_CLASSES`, makes the registry demand
   a **second family it has not earned**. `api/authz-contract.ts`'s expectation constants
   are written `{ status: 403, code: 'STEP_UP_REQUIRED' }`, the scan's `\bcode: 'CODE'`
   pattern matches them, and they live under `api/` — so the code is found for family `api`
   **whatever the class does**. Watched: `STEP_UP_REQUIRED: not registered for api`.

**The scan cannot tell an EXPECTATION from a THROW.** The third shape is the one that fits
and it is in the same file: `TokenCapabilityRefusedError` carries **no code at all** and
`api/errors.ts` supplies the literal at its `instanceof` branch. One literal on the wire
path, a plain `api(403, …)` entry, no new `ErrorFamily`, and the class cannot be constructed
with the wrong code. Its cost is that `error-codes.test.ts`'s `make` map cannot reach the
class, so the class→status link is asserted by a test of its own beside it — and by four
matrix rows through the real route.

**F10 — the guard reddened 48 existing tests across 7 files, not the 4 the plan predicts —
and 29 of them were a FIXTURE failing silently.** Task 9's Step 3 says *"count how many go
red before fixing them, and record the number: it is the measurement that the guard is in
force."* The count is 48: 33 in the authorization matrix, 9 in `delegation.test.ts`
(F8's), 2 in `projects.test.ts`, and one each in `delivery.test.ts`, `events.test.ts`,
`error-codes.test.ts` and `document.test.ts`. **The matrix's 33 are the interesting ones.**
Only 4 of them are the member rows; the other **29 are `collaborator → pass` rows answering
`404` all over the table**, because the fixture makes `bio_student` a collaborator by
calling `POST …/members` **through the route** — and never read the answer. §20's guard
refused that setup call and the membership was never created. The fixture now uses a
stepped-up owner **and asserts `201`**, so the next person to break it gets one clear
failure rather than twenty-nine misleading ones; the ROWS keep ordinary sessions, because a
row reading `pass` on a guarded route is a row testing a guard that is not there.

**F11 — control (d) COULD NOT FAIL, and the reason is `privileged.test.ts`'s own warning
applied to a number.** Widening `STEP_UP_TTL_MS` to a year left **1492 tests green**. Every
test of the window builds its instants out of the same constant the function compares
against — `steppedUpAt: NOW - STEP_UP_TTL_MS` against `now - steppedUpAt < STEP_UP_TTL_MS`
— so the file agreed with itself whatever the number said. One literal assertion
(`expect(STEP_UP_TTL_MS).toBe(600_000)`) fixes it, and **re-running the control with it in
place turns exactly that test red**. The relative tests stay: they are still the right shape
for an off-by-one, which a literal cannot see.

**F12 — A PERSON CONFIRMING A PENDING ACTION DOES NOT STEP UP, AND THE GUARD IS THEREFORE
ASYMMETRIC. NOT FIXED — raised.** After F8's repair, a person doing a guarded action in the
console must re-authenticate; the same person authorizing an **agent** to do it, by
confirming its pending action, need not. `answerable()` in `api/routes/pending-actions.ts`
already resolves the capability and calls `assertCapability` — one line beside it would
close the gap, on **confirm only** and never on reject, because rejecting is the safe
direction and a person stopping an agent should not need a round trip.

**The exposure is narrower than it first reads, and that is why this is a finding rather
than a change.** An attacker holding only a stolen console cookie cannot use it: they would
also need the delegated token's secret, and a pending action matches one exact request. It
is defence in depth rather than a hole. **It is left for Task 10**, which is the sitting
that builds the other confirm-shaped human decision — `release:approve` — explicitly behind
step-up, and which will have to answer the same question for the approve route. Doing it
here would also have reddened P5b's confirm tests for a reason this task did not ask about.

**F13 — the plan's *Files* list points Task 9 at `api/routes/projects.ts`; `addMember` and
`removeMember` are in `api/routes/project-reads.ts`.** Found by grepping for
`members:manage` rather than by opening the named file. `projects.ts` holds the create route
and the validation context, and exports `modelPolicy` / `validationContext` **to**
`project-reads.ts` — so the name is misleading in both directions.

**F14 — a doc comment in the registry sat on the wrong entry, and had since P5b Task 7.**
`/** A pending action already has an answer, and one question has one. */` described
`PENDING_ACTION_RESOLVED` and was written above `PROJECT_LAST_OWNER`. Noticed while adding
`STEP_UP_REQUIRED` two entries above it; moved. Nothing can see a misplaced comment but a
reader, which is exactly the argument for fixing it when one is passing.

**F15 — `project:delete` HAS NO ROUTE, AND §20's APPEND-ONLY AUDIT LOG MEANS THE OBVIOUS
ONE WOULD NOT WORK.** Found while clearing this sitting's own litter: the live walk
created a project, and `DELETE FROM projects WHERE slug = …` is refused —
`violates foreign key constraint "events_project_id_projects_id_fk" on table "events"`.
Every other child table cascades; `audit.events` deliberately does not, because §20 makes
it append-only by grant. **The capability has been in `CAPABILITIES` since P5b with no
caller** — the no-caller shape ORIENTATION §9 names four times — and this records what the
caller will have to decide when somebody writes it: a project cannot be deleted without
either deleting audit rows, which is the control, or soft-deleting it. **Nothing was
deleted from `audit.events`.** *Postscript, after F12's follow-up: the row is gone — the final `pnpm test` TRUNCATED it, which is the disposal route the platform already has and the reason this was never urgent. The finding stands for whoever writes the delete route: `audit.events` is what they will have to decide about.*
#### Negative controls — every one watched, and which could not fail

**Task 8**, each run after the task was committed, restored with `git checkout <path>`:

| | Control | Predicted | Measured |
|---|---|---|---|
| a | the puid equality check removed | *refuses an assertion for a DIFFERENT person* red, **and nothing else in the suite sees it** | **FIRED, and the scope claim HOLDS**: run against the WHOLE unit tier, **exactly one test red** out of 1481 |
| b | `issueSession` stamps `steppedUpAt` at sign-in | the positive control **stays green**; Task 9's *a fresh sign-in is not stepped up* goes red — *"predict it as Task 9's"* | **FIRED IN TASK 8, and WIDER — 5 red in 2 files**, the positive control among them: it asserts the claim is `null` BEFORE the step-up. **The plan's prediction is wrong twice** (F5) |
| c | `isSteppedUp`'s `> 0` guard removed | the boundary test stays green; the `steppedUpAt: 0` case goes red | **FIRED, exactly as written**: one red, *refuses a steppedUpAt of 0*, and the boundary test green beside it |
| d | `verifySession` trusts the claim instead of validating it | *a session cookie written before this field existed* red, with `undefined` where `null` belongs | **FIRED, and the message is the predicted one**: `expected undefined to be null`, plus *turns a non-number claim into null* |
| e | `forceAuthn: true` removed from the step-up instance | **NOTHING GOES RED** — *"the most important row in this table"* | **FIRED: one test red at the whole-suite scope** (F4). The prediction is right about the IdP HONOURING the flag and wrong about the flag being SENT |

**Task 9**, same discipline:

| | Control | Predicted | Measured |
|---|---|---|---|
| a | `assertStepUp` removed from `addMember` | the matrix red on `owner` and `admin` for that route; **the count is the measurement** | **FIRED, exactly 2** — `POST …/members` as owner and as admin. The two `DELETE` rows stayed green, which is the control on the control: only the route edited moved |
| b | `STEP_UP_GUARDED` loses `release:approve` | *is exactly* red **and** the asymmetry test red | **FIRED, and WIDER — 3 red**: the third is *is a strict superset of D24's privileged four*, written this sitting, which the plan did not know about |
| c | `assertStepUp` returns early for a token instead of throwing | *refuses a TOKEN outright* red | **FIRED — 3 red**, all three token cases, including *lets a token through when a person confirmed THIS capability, and not another*, whose negative half this control removes |
| d | `isSteppedUp`'s window widened to a year | *refuses a session stepped up longer ago* red | **COULD NOT FAIL: 1492 green, nothing red** (F11). Every test derived its instants from the constant under test. **Fixed, and re-run: one test red** |
| e | `STEP_UP` written as a bare `403` in the matrix | **GREEN through a route that answers `FORBIDDEN` instead** — *"run it, watch it pass, restore"* | **DEMONSTRATED IN BOTH DIRECTIONS.** Rows made status-only with the route unchanged: **4 red** (a bare `403` does not match `STEP_UP_REQUIRED`). Rows status-only **and** `assertStepUp` throwing `AuthorizationError('FORBIDDEN')`: **all 406 PASS.** The guard is gone in meaning and the matrix cannot see it — the fifth demonstration of P5a sitting 6's lesson here |

**NINE OF THE TEN FIRED; (d) could not fail and was FIXED rather than recorded.** Three
fired **wider** than predicted (Task 8's b and e, Task 9's b and c) and one — Task 8's (e),
the row the plan calls its most important — fired where the plan says in bold that nothing
would. **Not one prediction in this sitting was exactly right about scope**, which is
sitting 5's *thing to carry forward 2* holding for a second sitting: write down what you
expect, then read which test actually failed.
#### What this sitting decided

1. **ONE `SamlSp` holding two `SAML` instances, not two `SamlSp`s** (F1), against Task 8's
   Step 2 closing line and with its own doc comment. *Rejected:* `deps.samlStepUpSp` —
   it duplicates the seven-field configuration at both construction sites, and those seven
   fields are exactly what Decision 17 requires to be identical. *Cost:* `createSamlSp`
   constructs two instances even where nothing steps up, which is a constructor call.
2. **`StepUpRequiredError` carries NO code; `api/errors.ts` supplies it** (F9), against the
   plan's Step 1 and against both shapes §7e offers. *Rejected:* a fixed `readonly code`,
   invisible to the registry scan; the constructor argument, which makes the entry claim an
   `api` family earned by a test fixture matching a regex. *Cost:* the `make` map cannot
   reach the class, so the class→status link needs a test of its own — which it now has.
3. **A token carrying a human-confirmed grant passes `assertStepUp`** (F8). *Rejected:*
   refusing every token, which is the plan's line and which kills D24's loop; folding the
   check into `assertCapability`, which would make every token call site a step-up site.
   *Cost:* `assertStepUp` now knows about `grant`, which is one more thing the two
   authorization functions share — mitigated by comparing for EQUALITY, exactly as
   `assertCapability` does.
4. **The authorization matrix's SESSIONS stay ordinary and its FIXTURE steps up** (F10).
   *Rejected:* stepping up the matrix's sessions, which would make every guarded row read
   `pass` and test a guard that is not there; dropping the fixture's route call for a direct
   `addMember`, which would stop exercising the route the rest of the table depends on.
5. **Task 8's route tests live in `api/auth.test.ts`, not in `identity/step-up.test.ts`.**
   The plan's *Files* creates the latter, and it holds the pure half — `isSteppedUp`,
   `stepUpSession`, and `verifySession`'s validation of the claim. The HTTP half needs
   `pendingLogin`, `assertion` and `post`, which already exist inside `auth.test.ts`'s
   `describe`; a second harness for the same ACS would be a second statement of the sign-in
   flow. *Cost:* the step-up tests read as *"Manifest is its own SP (§9) > …"*, which is
   accurate and not obvious from the file list.
6. **A step-up does not extend a session** (F7): the re-signed cookie's `maxAge` is the
   remaining life. *Rejected:* a fresh `SESSION_TTL_MS`, which `verifySession` would refuse
   anyway and which would read as an extension to anybody watching the cookie.
7. **F12's asymmetry is RAISED, not closed.** Step-up on the confirm route is one line and
   it is Task 10's, with the approve route, rather than this sitting's — see F12 for the
   exposure, which needs a token secret as well as a stolen cookie.

#### The machine, queried at close rather than recalled

| | |
|---|---|
| `make doctor` / `make verify` | **19/0 and 54/0**, both re-run AFTER the Docker tier and after both cleanups |
| per-app resources | **`containers=12 networks=4 volumes=8`** — the Docker tier took it to `networks=11 volumes=9` and `dead-app-resources.sh --apply` took it back. **The TENTH measurement of that cycle, and the same seven networks and the same one volume again** (`mf-blueprint-ntm-`, `mf-chem-labs-`, `mf-fixture-rt-`, `mf-fixture-s6-`, `mf-fixture-s6nb-`, `mf-saml-probe-`, `mf-saml-unsigned-staging-net`, plus `mf-chem-labs-staging-db-data`). Re-measured by the script itself: `networks left: 4`, `volumes left: 8` |
| LiteLLM | **6 users → 4.** One orphan, `p4b-probe-user`, **again** — sitting 5 recorded the same name, and ORIENTATION records it returning after P5c sitting 1 cleared it. Re-read afterwards by the script: 4 remain, every container-held user survived |
| cleanup scripts | **BOTH were ALLOWED `--apply` in this session** and were run by the agent — the **fourth** consecutive sitting. The classifier refuses them in other sessions; try the command |
| **app images** | **NAME THE METRIC** (CLAUDE.md): `docker images -q \| wc -l` reads **133**, `docker images -q \| sort -u \| wc -l` reads **125**, `127.0.0.1:7107/local/*` reads **83**, and `docker images \| grep '^local/'` reads **0** for the same machine. The snapshot diff attributes **four** new app images to this sitting's Docker-tier run — `boot-recover`, `chem-labs`, `fixture-rd`, `redeploy-cp` — and the rest predate it. **Still nobody's job, still growing, and neither cleanup script covers it** |
| database | **NOT what sitting 5 left.** This sitting's `pnpm test` runs truncated `journey-app` and with it the `active` IAM registration and `approved` PIA sitting 5 recorded — **expected, and §7e warned of it**. The live walk then created `instructor`, `student` and one project, **`stepup-5795`, which could not be removed** (F15): its bare repository is gone, its row is not, and the next `pnpm test` truncates it. `users` holds `ins000001` and `stu000001` |
| migrations | **20 applied**; this sitting adds none |
| `lo0` | `127.0.0.1`, `127.0.0.2`, `127.0.0.3` |
| runtime routes | **0 applied.** `make verify` read `1` at open and `0` at close: the Docker tier restarts the edge and drops every runtime route, and the control plane's boot restored none because the project rows were truncated (`routesRestored:0` on its own boot line). **So every app hostname answers the wildcard** until something redeploys — the documented cost of the tier, not a fault |
| port 7100 | **nothing listening at close.** The control plane was started ONCE, for the live walk and to re-register the platform's SP row after the Docker tier moved it to a loopback ACS, and **stopped at the end — `before.txt` had 7100 free and so does `after.txt`** |
| `snapshot-machine.sh` diff | **66 lines, every one accounted for**: timestamps and uptimes, 1 GiB of disk, the four new app images above, and `HEAD` + the dirty file that was this sitting's own last commit |
| `HEAD` moved under this sitting | **no** — `5e33eeb` at open, and this sitting's own commits on top. The second sitting in this plan where it did not |
| the four shared HTML pages | **ALL FOUR opened and counted, and THE FIRST DRAFT OF THIS ROW WAS WRONG** — it claimed `manifest-decisions.html` mentions *"a second sign-in prompt"*, and the count is **zero**. Sitting 5's F13 is why this row gets counted rather than asserted, and it caught a fabricated claim this time rather than a lucky one. Measured: `step-up`, `stepUp`, `re-authenticat`, `ForceAuthn` and `STEP_UP` are **0** in all four. *"sign in again"* appears **three** times and none is about §20: twice in `manifest-schematic.html` about practice apps versus live CWL, once in `manifest-phases.html` about a deploy interrupting a session. **No page needed a change** |
| `docker-simple-saml` | still clean: its only dirty path is the untracked `cert.zip` dated months before this project |

#### What the close-out found — FOUR, and the streak since P5b's third sitting holds

**Both were found by opening the thing pointed at, and neither is visible from the
sentence** — which is the whole of what this check is for.

**F16 — §7e said *"Task 10 adds `RELEASE_DIGEST_MISSING`"*, and it does not.** The code has
been in `api/error-codes.ts` since P5a, at line 235, under family `ReleaseError`. Found by
grepping the file rather than re-reading the hand-off. **Following the pointer then
answered the more useful question**: every code Tasks 10 and 11 name — `NOT_FOUND`,
`FORBIDDEN`, `TOKEN_CREDENTIAL_REFUSED`, `STEP_UP_REQUIRED`, `RELEASE_NOT_FOUND`,
`RELEASE_DIGEST_MISSING` and `AI_BACKEND_UNAVAILABLE` — **is already registered**, so
sitting 7 adds none and `error-codes.test.ts` should stay quiet through it. A next agent
told to add one would have duplicated a registry entry, or spent the sitting deciding a
family for a decision that does not arise.

**F17 — §7e warned that Task 11 has "a timeout, a budget and a model name" a test could
agree with itself about, and Task 11 has no timeout and no budget.** The 10 s timeout that
makes *"recorded as absent"* reachable at all is `ai/client.ts`'s and already exists
(Decision 7). **A speculative warning in a hand-off is the same defect as a wrong fact**,
because the next sitting trusts what it is told to trust; the line now names what is
actually in Task 11 — its `summarySource` union and `default-chat-onprem` — and says it was
checked against the steps.

**F18 — THE FINAL GATE RUN CAUGHT A PUBLISHED NUMBER THAT WAS ONE TOO LOW, IN SEVEN
PLACES, AND THE PER-FILE BREAKDOWN BESIDE IT WAS RIGHT ALL ALONG.** `pnpm test` was measured
at **1492** and written into ORIENTATION's top-of-file box, §2's numbers box, §7e, README,
RUNBOOK, `scripts/ci-acceptance.sh` and this record — and the machine reads **1493**. The
cause is exact: 1492 was measured **before** control (d)'s repair added
*"is ten minutes, and nothing has quietly widened it"* to `identity/step-up.test.ts`, and
the total was carried forward from that measurement instead of being re-derived.

**The breakdown published beside it was correct and contradicted it**: 9 + 10 + 8 + 9 + 1 is
**37**, and 1456 + 37 is 1493, not 1492. **So the sitting wrote down the parts, wrote down a
total that does not match them, and shipped both** — which is why *"count per file, never
subtract"* is only half a rule. **The other half is to add the parts up and check they equal
the total**, and it is the half sitting 4's F21 and sitting 5's gate table do not state.
`EXPECT_TESTS` was set to 1493, with the `awk` extraction re-checked against the literal
`Tests  1496 passed | 1 skipped (1497)` rather than reasoned about; the three surviving
1492s are control (d)'s own measurement, which really did read 1492 at the moment it ran.

**Found only because the four gates were re-run after the documentation was written.**
A sitting that treats the gates as a pre-commit ritual rather than a close-out measurement
would have shipped this, and `make ci-acceptance` would have read `counts moved: expected
1492, got 1493` quietly on its next run — the failure mode sitting 3 found in that file.
*(F12's follow-up then moved the same five copies again, 1493 → 1496. **That is twice in
one sitting**, and it is the argument for `make ci-acceptance` being the thing that checks
them rather than a human remembering to.)*

**Five other claims were checked and HELD**, each by counting rather than recalling:

- **`api/auth.test.ts` 22 → 30 and `api/error-codes.test.ts` 6 → 7.**
  `git show 5e33eeb:…| grep -cE '^\s+it\('` reads **22** and **6**; the files read 30 and 7
  now. Counted at both ends, never by subtracting from `pnpm test`'s total (sitting 4's F21
  is why). `authz-contract.test.ts` reads **0** to that grep, because the matrix generates
  its tests in a loop — vitest's own per-file count is the right source there, and 397 → 406
  is one new route × nine actors exactly.
- **Twenty migrations applied**, from `SELECT count(*) FROM drizzle.__drizzle_migrations`
  rather than from the previous sitting's record.
- **Every export and helper §7e names exists**, grepped one by one: `STEP_UP_COOKIE`,
  `STEP_UP_TTL_MS`, `stepUpSession`, `isSteppedUp`, `STEP_UP_GUARDED`, `assertStepUp`,
  `StepUpRequiredError`, `sessionActor`, `ownerSteppedUp`, and `steppedUp?: boolean` on both
  `loginAs` and `sessionFor`.
- **Task 10's Step 1 really does already call `assertStepUp(actor, 'release:approve')` and
  really does already list `STEP_UP_REQUIRED`** in its `errors:` — so *"there is nothing for
  you to wire"* is a claim about the plan's own text, read.
- **Findings counted, not asserted:** `grep -c '^\*\*F[0-9]'` over this section read
  **15** before this subsection existed, **17** with F16 and F17 in it, **18** once F18
  landed, and **19** once Rich ran Task 2's owed control and F19 came out of it — **so
  writing the close-out's own findings down moved a number that five documents already
  carried, THREE TIMES.** That is the restated-number trap in its purest form, and it is
  the argument for stating a count in as few places as possible. Every copy was found by
  grepping the PHRASE rather than the number (§6), because the stale one carries a different
  number by definition; the sittings table, the roadmap's two rows, the defect-rate table,
  ORIENTATION's top-of-file box and §7e all now read **19**. **This moved THREE times in one sitting** — 15 → 17 → 18 → 19 — and the test count twice; **six places is too many for a number that changes as the close-out runs**, and that is worth raising as a convention rather than absorbing again.

#### The follow-up Rich decided, 2026-09-20 — F12 CLOSED and the `release:promote` gap TRACKED

**This sitting raised F12 and left it open; Rich took both recommendations the same day, so
it is closed in the same sitting that found it.** *(That sentence deliberately does not begin with the finding's number: `grep -c '^\*\*F[0-9]'` over this section is how the count is derived, and a prose line starting `**F12` made it read 20 for 19.)* Recorded here rather than in
sitting 7's section because the work is this sitting's and the decision is its finding's.

**1. CONFIRMING A PENDING ACTION NOW REQUIRES STEP-UP. REJECTING DOES NOT.**
`answerable()` takes the decision and calls `assertStepUp(actor, action)` for `'confirmed'`
alone, after `assertCapability` and before the state check — the order every other call
site uses.

**The exposure was re-measured before the decision and it is narrower than a hole and wider
than this sitting first wrote down.** F12's original text said an attacker needs *"a
delegated token's secret as well as a stolen cookie"*. **That is only true when the queue is
empty.** A pending question lives for `PENDING_ACTION_TTL_MS` — **a day** — and a queue with
questions waiting in it is the system's normal state, so a stolen session needs **no second
credential** to reach the confirm route. What it cannot do is *choose* the action: it can
only say yes to something an agent already asked for. **The correction matters more than the
finding**, because the first framing would have justified leaving it.

**§20's own sentence is what settled it**: *"A stolen admin session must not be sufficient
to put an app on the public internet"* (spec line 1699), and its control map names the
threat by name — *"Stolen admin session approves a release → step-up re-authentication"*
(line 1855). `answerable()` already calls `assertCapability(db, actor, projectId, action)`,
so **by the platform's own authorization model, confirming IS exercising the privileged
capability**; asking for the capability and not for the freshness was the inconsistency.

**Rejecting stays free, and that is a design constraint rather than an omission.** It grants
nothing and stops an agent, and charging a SAML round trip for it would make the safe action
as expensive as the dangerous one — *"stop my runaway agent"* is the wrong thing to slow
down.

| | |
|---|---|
| tests reddened | **12 across 4 files** — `delegation.test.ts` 8, `authz-contract.test.ts` 2 (the confirm row's `owner` and `admin`), `stream-contract.test.ts` 1, `document.test.ts` 1. **Every one fixed with a stepped-up session, none by weakening an assertion** |
| what proves reject is ungated | **`delegation.test.ts`'s two `'reject', ctx.ownerCookies` call sites were deliberately left alone.** If reject were guarded they would be red — so the absence of a change is the assertion |
| new tests | **3**, and they are a pair plus a control: the refusal, the same person succeeding once stepped up, and an ordinary session rejecting. *A test that only asserted the refusal would be satisfied by a route that refuses everything* (P5c sitting 9, F16) |
| contract | three lines — `STEP_UP_REQUIRED` on `confirmPendingAction`. No operation and no shape, so **`@manifest/contract` stays 1.0.0** |

**2. `release:promote` IS IN `STEP_UP_GUARDED` AND NO ROUTE ENFORCES IT — TRACKED TO TASK 15.**
Found while checking F12's own claim, by grepping every `assertStepUp` call site instead of
trusting that the set implied enforcement. **There are exactly two** (both `members:manage`,
`project-reads.ts:216,270`), and the production deploy route authorizes `release:promote` at
`releases.ts:228` without asking for freshness.

**It is not a live hole and it is not a non-issue.** Not live, because §13's checklist
refuses every production deploy until `rehearsal` and `admin-approval` exist — Tasks 14 and
10 — so the route is unreachable today; and because §13's design arguably puts the human
decision in the **approval** (Task 10, which does step up) and makes the deploy its
mechanical execution, which satisfies §20's sentence by a different route. Not a non-issue,
because **a set member with no call site is the *reads like a control and is not* shape**
that P4a measured four times in SAML settings, and nothing in the code said which it was.

**Rich chose to add the call site in Task 15**, which now carries a correction block naming
the exact change, the branch it goes on (production only — a staging deploy is
`release:deploy` and is deliberately unguarded), and its control. `authz.ts` records where
all five members of the set stand, so the next reader cannot mistake the rule for the
enforcement — or "fix" the list by deleting a member.

**AND D24'S LOOP WAS DRIVEN END TO END WITH §20's NEW GUARD INSIDE IT, LIVE, THROUGH THE
EDGE AGAINST THE REAL IdP.** The two mechanisms had never met outside the unit tier, and
the whole question F12 asked is whether they compose.

| Step | Answer |
|---|---|
| the owner signs in with CWL | `steppedUpAt: null` |
| an agent holding a **real** token — minted through the route, so `project:read` only — asks to add a member | `403 TOKEN_ACTION_PENDING`, with the question, its fingerprint and its 24-hour expiry |
| **the owner tries to confirm on an ordinary session** | **`403 STEP_UP_REQUIRED`** — *"'members:manage' needs a second authentication round trip (§20)"*, with the route to fix it in the hint |
| the owner steps up | `steppedUpAt` stamped, `userId`, `issuedAt` and `expiresAt` all unchanged |
| and confirms | `200`, `state: confirmed`, `consumedAt: null` |
| **the AGENT'S OWN retry, same `Idempotency-Key`** | **`201`** — the member is added, and D24's loop closes with §20's guard inside it |

**The token holds only `project:read`, which is the case that matters** (P5b sitting 9, F1):
no token the platform can mint can hold one of D24's four, so this is the path every real
agent takes rather than a fixture's. **The guard sits between the question and its answer
without breaking the loop** — which is the claim F12's fix had to earn, and the one no unit
test can make on its own.

**F19 — TASK 2's OWED CONTROL FINALLY RAN, AND IT MEASURED SOMETHING IT WAS NOT AIMED AT:
`make doctor` CANNOT TELL YOU PRODUCTION IS REACHABLE.** Rich ran
`sudo ifconfig lo0 -alias 127.0.0.3` in his own terminal on 2026-09-20 — four sittings after
sitting 2 owed it. **The control fired exactly as predicted**: `19 checks, 1 failed`, the one
being *both loopback aliases exist*; restored, 19/0. Exactly one check moved, which is what
the unprivileged stand-in could not establish.

**The finding is in the other eighteen.** With `127.0.0.3` gone from `lo0` — so Caddy could
not have bound it and the whole production zone was unreachable — **two checks that name
`127.0.0.3` stayed GREEN**:

```
PASS  nothing but Manifest claims manifest.internal
        manifest.internal resolves to 127.0.0.3 (the bare zone is production, so 127.0.0.3)
PASS  the production zone answers the public address, and the console does not
        production=127.0.0.3  console=127.0.0.2  (nested zones, pinned back)
```

`check_zone_split` is **two `dig` calls** (`doctor.sh:292`). It asserts what **dnsmasq
answers** and never that anything is listening there — which is correct for a check in
doctor's *Host setup* section, and **its name says "answers"**. A reader skimming a green
doctor would conclude production was fine while it was unreachable; **the alias check is the
only thing in `doctor` that catches it.**

**This is not a defect and it is worth knowing, which is why it is a finding rather than a
fix.** The division of labour is sound: `doctor` asks *is the machine set up*, `verify` asks
*does it work* — and `make verify`'s *the public listener answers a production name on
127.0.0.3* does a real `curl --resolve "$PUBLIC_PROBE_HOST:443:$PUBLIC_EDGE_IP"` and asserts
`listener=public` **in the body** (`verify.sh:158`), so it genuinely probes and would have
gone red. **"Would have" is a prediction, not a measurement** — this plan's own rule, and
sitting 6 broke it twice already — and `make verify` was not run inside the window. **The
residue is one `sudo` line and thirty seconds**, offered to Rich and not taken yet.

**A PROCESS FINDING, PAID FOR IN THIS FOLLOW-UP: `git checkout <path>` RESTORES FROM THE
INDEX, AND AN UNCOMMITTED CHANGE IS DESTROYED BY THE RESTORE RATHER THAN THE EXPERIMENT.**
The plan's *Global Constraints* say exactly that, and this follow-up did it anyway — running
a negative control over an **uncommitted** guard and reverting it wholesale. Nothing was lost
but the time to retype it, and the rule is now paid for rather than read: **commit the task,
then break it.** The second control was run after the commit and restored cleanly.

### Sitting 7 — Tasks 10 and 11, the approval and its diff snapshot — 2026-09-20

**`release:approve` HAS A CALLER. It has existed as a capability since P5b and no route had
ever asserted it; three routes now do.** `POST /v1/releases/{id}/approve`, `.../reject` and
`GET .../approval`. An approval binds the BUILD's immutable image digest, records who
decided and when, stores the exact diff shown at decision time, and is refused to anybody
who is not a platform administrator, to any administrator who has not re-proved themselves
inside ten minutes, and to every delegated token whatever it holds. §13's checklist item
`admin-approval` reads the row instead of saying `not_built`.

**AND THE SUMMARY IS RECORDED AS ABSENT RATHER THAN BLOCKING** (Decision 7), driven rather
than reasoned about: a server built with a LiteLLM client that rejects every call answers
the approval **`201` with `summary: null`, `summarySource: 'unavailable'` and the diff still
in the record** — and the control for it answers `503 AI_BACKEND_UNAVAILABLE`, which is the
shape Decision 7 exists to refuse, seen on the wire.

**THE HEADLINE IS THE CONTROLS, NOT THE FEATURE.** Nine were run across the two tasks.
**Three of them could not fail as written, and two of those three paid for themselves
immediately**: Task 10's control (e) could not fail, and writing the case it was actually
aimed at found a LIVE DEFECT — a rejection reason made of spaces is answered `500 INTERNAL`
by a database CHECK rather than `400` by the schema (F3, fixed in its own commit). Task 11's
control (c) could not fail against the test the plan names for it, and only the unit test
the plan separately told me to write saw it (F6).

#### The decisions this sitting made

**1. `ServerDeps` gains `llm`, because `deps.ai` is a KEY SERVICE** (F1). *Rejected:* a
`post` method on `AiKeyService` — that makes §10's key lifecycle the platform's
general-purpose model client, which is the second producer `ai/client.ts`'s own doc comment
exists to prevent; building a second client in the route, which would be a second timeout
and a second master key. *Changing course* is one field.

**2. `buildDiffSnapshot` is written in Task 10 as a working signature with an EMPTY diff,
and filled in by Task 11.** The plan says to write the signature in Task 10 and the body in
Task 11; `approvals.diff_snapshot` is `NOT NULL`, so Task 10 needs a value. It returns the
shape a real snapshot takes when there is nothing to compare, so nothing downstream
special-cases it and nothing claims a diff was shown that was not. *Rejected:* committing
Task 10 with a function that throws, which would make its own tests untestable.

**3. The approve, reject and read routes answer `NOT_FOUND`, and `RELEASE_NOT_FOUND` is
dropped from the `errors:` list the plan's snippet gives** (F12). A release that does not
exist and one this actor may not see must answer identically — `getRelease`'s rule, for the
enumeration-oracle reason `assertCapability` states. Two codes for those two cases would put
the oracle in the published contract. `RELEASE_DIGEST_MISSING` stays, because the route
genuinely throws it.

**4. `@manifest/contract` stays `1.0.0` although three operations landed.** Sitting 4 added
three operations and did not move it; P6a has not shipped, the console cannot call these
until Task 18, and a version that moves twice inside one plan says less than one that moves
when the plan does. *Changing course* is one line in two files, held equal by
`document.test.ts`.

#### The findings

**F1 — the plan passes `deps.ai` to `summariseChanges`, and `deps.ai` has no `post`.**
Task 11's snippet reads `await summariseChanges(deps.ai, changes)`; `ServerDeps.ai` is an
`AiKeyService` — §10's `mintAppKey` / `storeInstanceKey` / `revokeInstanceKey` lifecycle
(`ai/keys.ts:258`) — and the `LiteLlmClient` it is built FROM was handed only to
`createAiKeyService` and `createCatalogueCache` at boot (`src/index.ts:67`). Nothing on
`ServerDeps` could talk to the gateway. Found by reading `ai/keys.ts` before writing the
code rather than by `tsc`, which would have said only that `post` does not exist.
`ServerDeps.llm` is the same instance, `undefined` under `MANIFEST_AI_ENABLED=0`.

**F2 — the plan's `AiError` construction does not compile.** Its Task 11 test snippet writes
`new AiError('AI_BACKEND_UNAVAILABLE', 'gateway down')`; the real constructor is
`(code, status, detail)` (`ai/errors.ts:60`). A small one, recorded because a test written
from the snippet is the first thing the next reader would try.

**F3 — A LIVE DEFECT: a rejection reason made of spaces was answered `500 INTERNAL`.**
`approvals_rejection_has_reason` is `length(trim(coalesce(reason, ''))) > 0` and the request
schema was `z.string().min(1)`, so `{ reason: '   ' }` satisfied the schema, reached
Postgres and was refused there — and a constraint violation through `mapError` is a `500`.
A client error wearing a server error's clothes. **Fixed** (`66f4bc1`): the schema trims
before it counts, so both halves refuse the same set and the half that can answer `400` with
a path in it does. `openapi.json` is UNCHANGED — `.trim()` is a transform with no JSON
Schema form — so a client validating against the document still accepts `'   '` and is
refused; that is the same shape as any server-side normalisation and is recorded rather
than escalated.

**F4 — CONTROL (e) COULD NOT FAIL AS WRITTEN, AND THAT IS HOW F3 WAS FOUND.** The control is
*"the rejection-reason CHECK dropped and the schema loosened → the reason test red"*. The
test sent `payload: {}`, which `strictObject` refuses whatever `min(1)` says — so removing
`min(1)` left it green against all thirteen tests. The test now sends BOTH `{}` (the field
is required) and `{ reason: '   ' }` (it is non-empty), and the control fires.

**F5 — Decision 11's rebuild branch is UNREACHABLE through the platform, and the test says
so.** A release's `build_id` is immutable and `builds.image_digest` is written exactly once,
by `finishBuild` when a build succeeds; `build.ts`'s other two updates and `recover.ts`'s
write `status` and `error` only. So the digest under an approved release cannot move: a
rebuild is a NEW build, a NEW release, and a checklist reading *"has not been reviewed
yet"*, never *"was rebuilt"*. The test writes the digest directly, which is what a
rebuild-in-place would do, and says in its own comment that this is a state no route
produces. **The branch stays**, because §13's binding is the claim and because Task 15 gives
`approvalCoversDigest` a reachable caller: the digest verified against the image immediately
before a production deploy starts, where the two are read separately.

**F6 — CONTROL (c) COULD NOT FAIL AGAINST THE TEST THE PLAN NAMES FOR IT.** The plan predicts
that comparing `slice(0, 19)` turns *"a rebuild invalidates the approval"* red. It did not:
the test substituted `sha256:aaa…`, which differs from the real digest at the first
character, so a prefix comparison catches it too. **Only the unit test the plan separately
told me to write saw the defect.** The checklist test now substitutes a digest that shares
its first nineteen characters with the approved one and differs after, so both go red — and
the assertion that they share a prefix is written into the test, because a future edit to
that literal would silently disarm it again.

**F7 — CONTROL (d) OF TASK 11 CANNOT FAIL IN THIS TIER, exactly as predicted, and the reason
is worth the line.** Removing both `.sort()` calls leaves all sixteen tests in
`approval.test.ts` green: the fixture blueprint declares `auth.provider: none` and its
manifest declares no services, so **both sorted lists are EMPTY** and every ordering is
sorted. `expect(diff.services.length + diff.attributes.length).toBe(0)` is now in the test
beside the two assertions, so a reader can see why they prove nothing. **Task 19's demo,
which compares two rendered snapshots, is what would see it.**

**F8 — CONTROL (b) DOES NOT MAKE `[M6]`'s FINDING LIVE: the token is still refused, by
`assertStepUp`.** The plan predicts *"an agent could approve a production release"*. Two
things happened instead. First, `tsc` refused the change outright —
`Type 'Actor' is not assignable to type '{ userId: string; puid: string }'. Property 'puid'
is missing in type 'TokenActor'` — which is **Decision 18's claim measured**: reverting
`requireSession` to `requireActor` does not weaken a check, it stops compiling. Forced past
with a cast, the token is refused **`403 STEP_UP_REQUIRED`** rather than approving, because
`assertStepUp`'s first line refuses a credential class with no grant, and `release:approve`
is not one of D24's four so no grant can exist. **Sitting 6's *belt and braces* is now
measured rather than argued.** The code would be misleading — it tells a credential that can
never step up to go and step up — but the action is refused by two independent controls.

**F9 — Task 10's control (d) could not be written as the obvious mistake, because the schema
refuses it.** `onConflictDoUpdate({ target: approvals.releaseId })` fails at the database:
there is no unique constraint on `release_id`, which is migration 0019's own statement of
the insert-only rule (*"NO UNIQUE CONSTRAINT ON release_id"*). The control was written as
`update-if-one-exists` instead, which is what the mistake would actually look like — and it
then fired exactly as predicted: *"a rejection is readable … with the administrator's
words"* stayed green and only the two-rows test went red.

**F10 — `module-boundaries.test.ts` caught an import no prediction named.** A route test
living in `releases/` must reach `api/` through `api/index.js`, not `api/server.js`:
`PUBLIC_ENTRIES` is `index` and `testing` and nothing else. One unpredicted red test, found
by the gate rather than by review, which is the gate doing its job.

**F11 — the journey script asserted `admin-approval` was `not_built`, and `pnpm test` CANNOT
SEE IT.** `packages/journey/src/main.ts:598` is not a Vitest file: it runs under
`make demo-journey` and `make ci-acceptance`. A green `pnpm test` would have shipped a
sitting whose acceptance script fails on the next full run. Found by grepping the item id
across the repository rather than by any gate. **The same grep found the mock** (F13).

**F12 — `RELEASE_NOT_FOUND` in the plan's `errors:` list would put an enumeration oracle in
the contract.** The plan's Task 10 snippet lists both `NOT_FOUND` and `RELEASE_NOT_FOUND`.
`deployRelease` throws `RELEASE_NOT_FOUND` because it is reached only after the route has
already authorized the environment; these three routes read the release FIRST, so a distinct
code for *"no such release"* tells a stranger which release ids exist. Dropped, with the
reason at the line, and `getRelease`'s existing `NOT_FOUND` is the precedent.

**F13 — the mock's drift guard fired, and it is a real guard.**
`packages/mock/src/server.test.ts`'s *"has an entry for every operation the contract
declares"* went red the moment `contract:write` ran. Three handlers and an `APPROVAL`
fixture, whose `summarySource` is **`unavailable` with a populated diff** — deliberately the
state a console screen is most likely to render wrongly, because the obvious layout has
nowhere to put *"there is no summary, and the diff beside it is the control."*

#### The negative controls — nine run, SIX fired, THREE could not fail

**Every one was committed first, broken, watched, and restored with `git checkout <path>`
by name.** *Predictions were written down before the run, in the session's own scratchpad — which the
next agent cannot open, so the **Measured** column carries them*: where a prediction was
wrong, the row says what was predicted and what happened.

| | Control | Predicted | **Measured** |
|---|---|---|---|
| T10 a | `assertStepUp` removed from `decide` | the step-up test red; **the matrix's `admin` row** red | **FIRED, one row wider: 3 red.** `approval.test.ts`'s step-up test, and the matrix's `admin` row on **both** approve AND reject — the plan says "row", singular, and one helper guards two routes |
| T10 b | `requireSession` → `requireActor` | the token test red, and **`[M6]`'s finding live: an agent could approve** | **FIRED, AND THE PREDICTION'S SECOND HALF IS FALSE — F8.** `tsc` refused it first (Decision 18, measured). Forced past: **9 red** (4 token actors × 2 routes, plus the file test) and **the token is still refused**, `403 STEP_UP_REQUIRED`, by `assertStepUp`'s own first line |
| T10 c | `approvalCoversDigest` compares `slice(0, 19)` | *a rebuild invalidates the approval* red | **COULD NOT FAIL against that test — F6.** Only the unit test the plan separately asks for saw it. Test strengthened to a digest sharing nineteen characters; **both** red after |
| T10 d | `recordApproval` updates instead of inserting | *a rejection is readable …* survives; the two-rows test red | **FIRED EXACTLY.** The obvious spelling (`onConflictDoUpdate`) could not even run — F9 |
| T10 e | the rejection-reason CHECK dropped and the schema loosened | the reason test red | **COULD NOT FAIL — F4 — and finding out why produced F3, a live `500`.** Fires now |
| T11 a | the `catch` rethrows instead of recording | *records the summary as ABSENT* red **and** the end-to-end approval test red | **FIRED EXACTLY, both.** The route answered **`503 AI_BACKEND_UNAVAILABLE`** — Decision 7's refused shape, on the wire |
| T11 b | `summarySource` always `'llm'` | *records it as absent when the model answers an empty string* red | **FIRED EXACTLY**, one test, `{ summary: '', summarySource: 'llm' }` |
| T11 c | `buildDiffSnapshot` stores `{beforeReleaseId, afterReleaseId}` | **every other test passes**; the new snapshot test red | **FIRED EXACTLY, and the prediction's first half is the finding**: 15 of 16 green, including every approval test. Decision 6 is invisible to a test that only checks the approval was recorded |
| T11 d | the `.sort()` on `attributes` removed | **nothing goes red** — a control that cannot fail in this tier | **CONFIRMED, and the reason is now IN the test — F7.** Both lists are EMPTY in this fixture, so every ordering is sorted. Removing **both** sorts leaves all 16 green |

| Gate | Before | After |
|---|---|---|
| `make doctor` | 19 checks, 0 failed | **19, 0 failed** — unmoved, re-run AFTER the Docker tier and after both cleanups. This sitting adds no platform check |
| `make verify` | 54 checks, 0 failed | **54, 0 failed** — unmoved, same reason |
| `pnpm test` | 1496 passed + 1 skipped, 112 files | **1544 passed + 1 skipped, 114 files**, run twice and identical. **Counted per file, never subtracted**: `releases/approval.test.ts` **16 (NEW)**, `releases/summary.test.ts` **5 (NEW)**, `api/authz-contract.test.ts` **406 → 433 (+27)** — three new routes × nine actors. **Up 48 and two files.** The skip is still `api/delivery.test.ts`'s and **still cannot run**: Task 10 built `admin-approval`, `rehearsal` is Task 14's |
| `pnpm test:docker` | 185 in 30 files | **185 in 30, 0 skipped, 823 s** — **OWED** (`releases/`, `api/routes/`, `ai/`)**, RUN and UNMOVED — and unmoved is a MEASUREMENT for the third sitting running.** Checked rather than asserted: grepping all 30 `*.docker.test.ts` for `approve`/`approval`/`summariseChanges`/`diffSnapshot` returns exactly ONE hit, and it is a test NAME — `instances.docker.test.ts:87`, *"runs the image by DIGEST, which is what an approval binds to"*. **No Docker test drives an approval.** Task 19's demo is the first thing that will |
| `pnpm lint` / `typecheck` / `format:check` | clean | clean. **`tsc` earned its place twice**: it refused control (b) outright (F8) and it is what forced `ServerDeps.llm` to be a real field rather than a hope (F1) |

**THE MACHINE AT CLOSE — every number queried, not recalled.**

- **`make doctor` 19/0 and `make verify` 54/0**, re-run after the Docker tier AND after both
  cleanup scripts.
- **`make verify`'s per-app INFO line reads `containers=12 networks=4 volumes=8`**, and
  **`runtime routes currently applied: 0`** — the Docker tier restarts the edge and drops
  every route, and the boot restored none because the project rows are gone, so **every app
  hostname answers the wildcard** until something redeploys.
- **BOTH CLEANUP SCRIPTS WERE ALLOWED `--apply` AND WERE RUN — THE FIFTH CONSECUTIVE
  SITTING.** The Docker tier put back the tier's same **seven networks and one volume**
  (`networks=11 volumes=9` before, `4` and `8` after — **the ELEVENTH measurement of that
  cycle**) and LiteLLM went from **6 users to 4**: **`p4b-probe-user` came back again.** Both
  re-measured bare afterwards: `none dead`, `Nothing to delete.`
- **The app images are the only thing this sitting moved and left moved**, and neither script
  covers them. **Name the metric**, because the obvious commands disagree by design:
  `docker images -q | wc -l` reads **141**, `sort -u` **133**, `127.0.0.1:7107/local/*`
  **91**, and `grep '^local/'` **0** — all on the same machine at the same moment.
- **NOTHING IS LISTENING ON 7100.** The control plane was never started this sitting: every
  test drives Fastify in process through `app.inject`, and the one live thing — the Docker
  tier — spawns its own. **`lsof -iTCP:7100 -sTCP:LISTEN` returns nothing.**
- **THE DATABASE IS EMPTY**: `projects`, `releases`, `approvals` and `users` all read **0**,
  because the final `pnpm test` truncated them. **Twenty migrations are applied**; this
  sitting adds none. `.manifest/repos/` holds the same four bare repositories it held at open.
- **`./scripts/snapshot-machine.sh` AT OPEN AND AT CLOSE, DIFFED — 64 lines, and every one
  is accounted for**: timestamps and container uptimes; **free disk 51Gi → 50Gi**; `HEAD`
  moving to this sitting's own commits; and **FOUR new app images**, named, all from the
  Docker tier — `boot-recover`, `chem-labs`, `fixture-rd` and `redeploy-cp`, each tagged
  `127.0.0.1:7107/local/…`. Nothing else moved. **The four protected containers all survive**
  (`docker-simple-saml-saml-idp-1` is present and `Exited (0) 2 weeks ago`, exactly as at
  open), and **both read-only repositories are untouched**: `docker-simple-saml`'s only dirty
  path is the untracked `cert.zip` dated 22 June.
- `make up` was run at open and again before the Docker tier.

**THE POST-SWEEP CHECK FOUND TWO DEFECTS IN THIS SITTING'S OWN HAND-OFF**, and both were found
by opening the thing pointed at rather than by re-reading the sentence.

**F14 — §7e's item 4 said FOUR things assert the checklist's item list by name, and named
`api/delivery.test.ts` as one.** It asserts no such thing: it compares the refusal's checklist
with the read's **byte for byte** and asserts the absence of `deliveredBy`, both of which hold
for any item list. The count is **THREE**, and §7e now also names the two things that will NOT
move, so the next sitting does not go looking for them. **A hand-off that over-predicts red
tests costs the next sitting the same way one that under-predicts does**: it makes them doubt a
green gate.

**F15 — §7e said `rehearsal` is the ONLY item left in `not_built`, and `grep "state:
'not_built'" launch/readiness.ts` returns TWO.** The second is `load-rehearsal`, which is P9's
and appears only for a `large_course` or `public` audience. The claim is now *"the only
UNCONDITIONAL item"*, with the grep beside it — **and the same wrong sentence had already been
written into `packages/journey/src/main.ts`'s comment** by this sitting, which is exactly the
*a wrong pointer is inherited and multiplied by the next sitting* shape ORIENTATION §6 names,
caught one hour rather than one sitting later. Fixed in both places.

**AND THE FOUR HTML PAGES WERE CHECKED AND DELIBERATELY NOT CHANGED.** They are shared outside
the team and describe what a *person* can do. Sitting 7 adds an API capability with **no
screen** — the approvals screen is Task 18's — so nothing an outsider could click has moved,
and `manifest-decisions.html` drifts only when a decision changes and none did. Saying that
here is the requirement (§6), not skipping them silently.
