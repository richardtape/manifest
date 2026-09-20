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

| Sitting | Tasks | What it delivers | Status |
|---|---|---|---|
| 1 | 1 | **The measurements this plan rests on**, before any code: whether SimpleSAMLphp honours `ForceAuthn`, what the second listener actually costs on this machine (the alias, the dnsmasq split, the probe path), whether `computeLaunchReadiness` survives being read by something that blocks, and the **two** production gates rather than one. **Alone, and first** | ← **next** |
| 2 | 2–3 | **The second listener exists**: `127.0.0.3` on `lo0` and the dnsmasq split (Rich runs one bundled `sudo` script), then `srv1` inside the edge with the production wildcard site, and `make doctor` and `make verify` checks for both halves | |
| 3 | 4 | **A production route goes on the public listener and staging cannot reach it** — §12's fail-closed claim watched failing on the only machine that exists, in both directions, and the readiness probe taught the production path | |
| 4 | 5–6 | **Migration 0019** — `approvals`, `iam_registrations`, `privacy_assessments` and their state machines — and **the two external records over the API**: an administrator records a real registration and a real PIA with a pasted ticket reference | |
| 5 | 7 | **The gate that BLOCKS.** One evaluation in `launch/`, called by the read and by the deploy route, with the **two** unconditional refusals that exist today removed — and the checklist's items reading real rows. **Alone: it is this plan's centre** | |
| 6 | 8–9 | **Step-up re-authentication**: the `ForceAuthn` round trip, `steppedUpAt` on the stateless cookie, and `assertStepUp` applied to D24's privileged four **and** to `release:approve`, which is not one of them. **The heavy sitting Rich was warned about** | |
| 7 | 10–11 | **The approval**: `release:approve`'s first caller ever, bound to an immutable digest, non-repudiable, behind step-up — and its `diff_snapshot` with the AI-written summary that is **recorded as absent rather than blocking** when the model is down | |
| 8 | 12–13 | **R4's `Reviewer` seam** — the interface, the honest `NullReviewer`, its real caller and its **non-blocking** checklist item — and **§7's last production clause**: `auth.attributes` ⊆ `registered_attributes`, failing at build time | |
| 9 | 14–15 | **The D21 rehearsal as R2 redefines it**, and **the first production deploy this platform has ever done** — the digest verified before anything starts. **A first, and this project's worst discoveries have all arrived at a first** | |
| 10 | 16–18 | **Gate integrity asserted** (the registry's refusal, the laptop-image rule, the append-only record) and **both console tasks**: readiness with actions, the two external records, approvals and the step-up prompt | |
| 11 | 19 | **The acceptance**: `make demo-production` — an app reaches production with every blocking item honestly met — its offline-acceptance step, its `ci-acceptance` step, and its negative controls. **Alone, and last** | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. the four gates from *Global Constraints*, plus **`pnpm test:docker`** for every sitting that touched `routing/`, `runtime/`, `releases/`, `identity/`, `sso/`, `infra/`, `projects/`, `launch/`, `build/`, `observability/` or a `*.docker.test.ts` — **which in this plan is almost every sitting** (the brief says so in terms). **Budget the 13 minutes rather than being surprised by it**, and **restart the control plane afterwards**;
2. a dated entry in *What executing this plan found* — the tasks, every defect with the measurement that found it, the negative controls with which ones could not fail, the gate numbers and the machine;
3. **the sittings table above, updated** — mark the sitting done, move the `← next` marker, say how many findings it produced;
4. **the close-out sweep in ORIENTATION §6**, whose first line is the roadmap ledger. The gate numbers are stated in three documents — ORIENTATION §2's box, `README.md` and `RUNBOOK.md` — and move together. **§6's post-sweep check has found a defect in every sitting since P5b's third, without exception; run it by opening what you pointed at and counting it, never by re-reading the sentence.**

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Task 1 may move task boundaries — that is its job, and it has done so in three of the last four plans — and if it does, **re-cut the sittings before starting sitting 2 and say so in the session record**. Three rules survive any re-cut, and they are the brief's §10: **Task 1 stays first and alone**; **Task 19 stays alone and last, and it is this plan's own task rather than something that happens after the last feature**; and **the listener work stays early enough that a `compose.yaml` change dropping every runtime route is cheap, and late enough that Task 1's measurement has landed**.

---

## Read this first — what this plan knows that the brief does not

Read from the code on **2026-09-19**, at `d02fb67`, while this plan was written. **Every item is a fact about the platform as it stands, not a prediction**, and Task 1 re-measures the ones marked *(T1: M<n>)*. The brief's §2 is still true and is not repeated; these are the things reading the code for a *plan* turned up that reading it for a *brief* did not.

1. **THERE ARE TWO PRODUCTION GATES, NOT ONE, AND THE BRIEF NAMES ONLY THE OUTER ONE.** The route's is `api/routes/releases.ts:233`, and it throws `ProductionGateError` carrying the checklist. **`deployRelease` throws its own**, at `releases/release.ts:211`, before it reads the build: a `ReleaseError('RELEASE_PRODUCTION_GATE_UNAVAILABLE', …)` whose message ends *"they are P6's, and this gate stays closed until they do."* `error-codes.ts` records the code with **two families** — `['api', 'ReleaseError']` — which is the only place the duplication is visible. **A plan that replaced only the route's gate would ship a production deploy that still refuses, with the new gate's tests all green**, because every test of the new gate would be a test of a route that never reaches `deployRelease`. Task 7 removes both, and its negative control is the one that proves it. *(T1: M6.)*
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
16. **A new event type is a migration as well as a constant.** `EVENT_TYPES` in `observability/events.ts` holds 22, and `audit.events` carries a `CHECK … type IN (…)` constraint rewritten by migrations 0012, 0015, 0016 and 0017. **Adding a type without rewriting the CHECK makes the insert fail at runtime with every unit test green**, because the unit tier's schema is created from the same migrations but nothing asserts the two lists agree.
17. **A route change is three files in order**: the definition, then `pnpm contract:write`, then `pnpm contract:generate`. **`packages/contract/openapi.json` is generated — never edit it.** `ROUTE_DEFINITIONS` in `api/routes/index.ts` is the whole `/v1` surface; **a route defined and not listed there exists nowhere**.
18. **D22's coverage gate is fully disarmed by its own list.** P5c sitting 9 measured that with all 34 operations in `DELIBERATELY_UNCALLED` the test is **green**, and the `checked > 30` assertion cannot see it because `checked++` runs before the exemption test. **`DELIBERATELY_UNCALLED` is EMPTY today.** P6a adds roughly a dozen operations, so **a reviewer has to read that list — the gate will not.** Tasks 17 and 18 either give each new operation a console caller or put it in the list **with a reason a reader can check**, and Task 18's step 5 is that reckoning, in full, in the record.
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

**Decision 3. BOTH of today's production refusals are removed in Task 7, and the one in `deployRelease` is DELETED rather than made conditional.** `releases/release.ts:211` refuses production before it reads the build, and it is not reachable by any client once the route gates properly — so leaving it would be a second gate nothing can open, and making it conditional would be a second statement of the same rule. **`deployRelease`'s production path is then exercised for the first time**, which is Task 15. *Rejected:* keeping it as a belt-and-braces guard — it guards against the route forgetting, which is what the authorization matrix's production row is for, and a guard that cannot be opened is not a guard. *Changing course* is four lines.

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

*Read this first* 18: the gate is fully disarmed by its own list, and `DELIBERATELY_UNCALLED` is empty today. **Prove the gate still works before adding a dozen operations to its input**:

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

- [ ] **Step 4: Gates and controls**

| | Control | Predicted |
|---|---|---|
| a | the digest check removed | *refuses a deploy whose digest no approval covers* red, and *…a DIFFERENT digest* red |
| b | the check moved after `ensureInstance` | **every test above still passes** — write one that asserts no instance row exists after a refused production deploy, and watch it go red. **"Before starting anything" is a claim about SIDE EFFECTS and only a side-effect assertion can see it** |
| c | `approvalCoversDigest` ignores `decision` | write *a REJECTED approval does not authorise a deploy* and watch it |
| d | `listenerFor` forced to `'internal'` | *a production route is NOT on srv0* red, **and** Task 4's Docker cases red |

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

*One dated section per sitting, added as it runs — the tasks, every defect with the measurement that found it, the negative controls with which of them could not fail, the gate numbers and the machine. **Nothing is written here until sitting 1 executes.***

**The honest prior, from the roadmap's defect-rate table: 8.6 (P5a), 8.9 (P5b), 7.6 (P5c) findings per task, and the rate has risen, never fallen, with practice.** At nineteen tasks that is **145–170 findings**, and P6a makes production, a second listener, a second authentication round trip and an approval record run for the first time — **four firsts, and this project's worst discoveries have all arrived at a first.** Treat this plan as a hypothesis.
