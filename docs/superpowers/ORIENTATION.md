# Orientation — read this first

**Manifest's design is finished and EIGHT implementation plans are executed — P1, P2, P3, P4a, P4b, P4c, P5a (the contract) and P5b (delegated tokens), whose acceptance passed on 2026-09-18.** D24's whole loop runs end to end through the edge as `make demo-token` — a person mints a delegated token, an agent holding it builds and deploys a real application on its own authority, is refused the things it may not do, and gets past one of them only because a person confirmed that exact request, once. **It ran green three times, the third from a `make reset` machine, and is step 9 of the offline acceptance.** **P5c — the clients — IS WRITTEN AND NOW EXECUTING (2026-09-18): 14 tasks in nine agreed sittings, of which SITTINGS 1 TO 6 ARE DONE — the measurements (19 findings), the two new packages and the console's import boundary (10), the console SERVED and signing a person in (9), my projects, creating one and the project screen with its live stream (9), both streaming screens (13), and request-production, the fleet and delegated tokens (11). §22 STEPS 1 TO 5 AND 7 ARE CLICKED, AND THE FIRST HALF OF STEP 6: a person signs in with CWL, creates a project by typing a name checked as they type, watches its events arrive on a live socket, **builds it and reads the log lines as they are written, releases it, deploys it to staging watching the instance states arrive, opens the running application and signs in to it with CWL, reads §13's first-launch checklist with every item's reason and owner, and mints, lists and revokes a delegated token whose secret is shown exactly once** — while an administrator reads §26's fleet. *§22's step 6 also says **write a note; ask the LLM**, and that half was NOT exercised — it is what `make demo-ai` covers and what Task 14's acceptance owes.* The next job is its sitting 7 — Task 11, §26's queue as a screen, alone — and the next job is always §7e.** **The network-on sitting is over: nothing from here to the end of the plan may install a package.** Sitting 1 closed §8's `stream_close_delay` question, open since 2026-09-16: **an app's WebSocket IS cut by any other app's deploy**, so `buildRoute` now carries the field. This is the single entry point: what Manifest is, where things stand, how the platform is built, what the machine will do to you, how to work here, and what to do next. It is written for someone with **no prior context** — a new agent with a fresh window, or a developer joining.

*Last verified 2026-09-19 (P5c sitting 6; **all four gate numbers UNCHANGED** — `pnpm test` **1355 in 103 files**, run twice at baseline and twice at close, with no new test file because Tasks 9 and 10 add none by Decision 7; `make doctor` 18/0 and `make verify` 51/0 re-run at close, with the per-app meter and the runtime-route count both back where the sitting found them; and **`pnpm test:docker` NOT run and NOT owed**, since both commits touch only `packages/console/src/` — and unlike sitting 5 this one ran no build and no deploy at all).* **Three places state current status — §2, §7e and §8 — and a sitting's sweep REPLACES what they say; it never appends a sitting's story here** (§6). **The roadmap's ledger outranks all three.** Everything else is durable.

**Short of context? Read §7e, §2's numbers box, §6, and the newest entries at the end of §4's *Things that will cost you a morning*, in that order.** §4 is most of this file and is meant to be searched, not read through.

---

## 1. What Manifest is, in four sentences

Manifest is a self-hosted internal developer platform for UBC. A faculty member
describes an application in plain language, an AI agent builds it, and Manifest
deploys it — authenticated with UBC's CWL single sign-on, running on UBC
infrastructure — without the faculty member ever seeing a container or a YAML file.

The design is **approved and complete**. The whole platform must run on one laptop,
offline after a one-time seeding step, and that constraint (**C1**) shapes almost
everything.

---

## 2. Where things stand

**Five spikes are done — S7, S2, S1, S3 and S6 — and all five answered yes (§5); S5 and S4 are deliberately later. EIGHT plans are executed, and each has an acceptance that passes:**

| Plan | Executed | What it made true | Acceptance |
|---|---|---|---|
| P1 | 2026-09-05 | The platform runs on one laptop, offline after `make seed` | `make doctor`, `make verify` |
| P2 | 2026-09-05 | The control plane serves the API on 7100 | its unit tier |
| P3 | 2026-09-07 | An app goes from a bare repository to a URL, through the Docker driver and the edge | `make demo` |
| P4a | 2026-09-09 | A real CWL sign-in; secrets stored, not derived; §8's injection contract | `make demo-identity` |
| P4b | 2026-09-15 | AI answers charged to the asker; build logs, events and Incidents | `make demo-ai` |
| P4c | 2026-09-16 | A redeploy interrupts and signs out nobody | `make demo-redeploy` |
| P5a | 2026-09-17 | The API is a published contract under `/v1`, and §22's journey runs through a generated client | `make demo-journey` |
| P5b | 2026-09-18 | An agent acts on a delegated token, is refused D24's privileged four centrally, and a person confirms one retry | `make demo-token` |

**P5a — the contract — IS EXECUTED** ([`plans/2026-09-16-p5a-the-contract.md`](plans/2026-09-16-p5a-the-contract.md), 17 tasks in twelve sittings, finished 2026-09-17), the first of Phase 1c's three plans. It put the API under `/v1` at `https://console.manifest.internal` through the edge, generated an OpenAPI document from the routes and a TypeScript client from that document, and its acceptance — `make demo-journey`, §22's journey driven through nothing but that client — **ran green three times, the third from a `make reset` machine**. **P5b — delegated tokens and pending actions — IS EXECUTED (2026-09-18, 13 tasks in nine sittings, 116 findings); it was WRITTEN the same day P5a finished** ([`plans/2026-09-17-p5b-delegated-tokens.md`](plans/2026-09-17-p5b-delegated-tokens.md), 13 tasks in nine sittings), **its four spec actions were approved by Rich and applied the same day** (§8, *Decided*), and **how many of its sittings are done is stated in this file ONCE, in the box at the very top, and in the plan's own sittings table** — this paragraph said *six* for two sittings after it stopped being true (found by sitting 8's post-sweep check). Sitting 1 — the measurements — ran with 11 findings and corrected five tasks ([`spikes/p5b-baseline/`](spikes/p5b-baseline/README.md)): a token would have escaped its scope on `GET /v1/projects`, Task 6 as drafted would have deadlocked D24's confirm-and-retry loop through the idempotency cache, and `secret:read` is not in the `Capability` union at all. **Sitting 2 — Tasks 2–3 — ran with 14 findings**: D24's privileged four are named once with §20's alignment test, `release:promote` separates promoting from deploying and is asserted before §13's launch gate, and migration **0014** adds `delegated_tokens` and `pending_actions` with the `tokens/` module that mints, parses and verifies a token. **It found that the plan's token parser would have refused 47.5% of its own tokens** — base64url's alphabet contains the `_` it split on — **and that the plan's own TRUNCATE negative control could not fail.** **Sitting 3 — Tasks 4–5 — ran with 15 findings**: a person mints, lists and revokes a delegated token in an interactive session, and **an agent holding one can now authenticate with it** — `Actor` is a discriminated union on `credential`, one `onRequest` hook turns either class into an actor, and `requireSession` makes an interactive-only route a `tsc` error rather than a remembered check. **It found that the contract layer could not carry a bodyless mutation at all** — `DELETE /v1/tokens/{tokenId}` is the API's first, and it was a `400` before its handler ran and an OpenAPI document that could not be generated — **and that three of its own negative controls answer `403` for the wrong reason**, so every refusal it writes now asserts its CODE. **Sitting 4 — Task 6, the central refusal, alone — ran with 10 findings (2026-09-18)**: D24's sentence is implemented — `assertCapability` refuses a token any of `PRIVILEGED`, scope first and the privileged rule before the token's own set, and the ONE route wrapper holding the request records a `PendingAction` the `403` then carries, with the catch **outside** `app.idempotent` so a confirmed retry can reach the handler (migration 0016). **It found that the plan's own ordering control could not fail against any of the 31 tests that existed** — every one of them writes a token holding the privileged capability, which no token the platform can mint can hold, so the swapped order answers a DEAD-END `403 FORBIDDEN` for every real token; a twelfth test now asserts exactly that. **Sitting 5 — Task 7, confirm, reject and the one-shot retry, alone — ran with 12 findings (2026-09-18)**: **D24's loop closes.** A person who holds the capability themselves confirms or rejects the question in an interactive session, and a confirmation grants that EXACT request — this token, this method, this path, this body — ONE retry, which the agent makes itself through its normal route; a retry after a rejection is answered `403 TOKEN_ACTION_REJECTED` carrying the person's own words, so an agent stops rather than loops (migration 0017). **It found that two of its own nine new tests were green before the route they test existed** — their confirmation 404'd, so the refusal that followed happened for the ordinary reason and the assertion under it proved nothing — and that **`recordPendingAction`'s reuse lookup is a read-then-insert: five CONCURRENT identical asks create five rows**, which defeats the very thing it exists for and is carried to Task 10, whose expiry sweeper the fix depends on. **Sitting 6 — Tasks 8 and 9 — ran with 12 findings (2026-09-18)**: §26's queue is readable as two reads, where a person who may read the project sees every question and a TOKEN sees only the ones it asked; **removing a member exists at last** — D24's fourth privileged action, and the FIRST privileged route written after Task 6, so the test that it inherits the central refusal without doing anything is the task's real deliverable, and it passes; and **§20's per-token rate limit has a reader**, taken in the one credential hook after the token is verified so a forged token spends nobody's window. **It found that two of its own four new rate-limit tests were green before the limiter existed** — both were *"is not limited"* claims, which are true of a platform that limits nothing — and, by reading the ledger rather than the sweep checklist, that **the roadmap's defect-rate table had no P5b rows at all, five sittings running**. No migration. **Sitting 7 — Tasks 10 and 11 — ran with 15 findings (2026-09-18)**: §6's fourth `PendingAction` state is applied by `expirePendingActions`, which `src/index.ts` calls once at boot with the count on the boot line — and `boot.docker.test.ts` is the only test in the repository that fails if that caller goes. **Sitting 5's F10 is discharged** by migration **0018**'s partial unique index over the token and the request's fingerprint `WHERE state = 'pending'`, with `onConflictDoNothing` handing the loser of a race the winner's row — **and a boot-only sweep does not make that index safe**, because a row past its own `expiresAt` that still says `pending` satisfies its predicate while the reuse lookup will not reuse it, so the sweep also runs scoped to the token on the path that inserts. §16's matrix gained D24's four token actors — **361 tests in 3.5 s**, and `Expectation` had to become a (status, code) pair first, since `FORBIDDEN`, `TOKEN_ACTION_PENDING` and `TOKEN_CREDENTIAL_REFUSED` are one status and three answers. **It found that `.map(toToken)` passes the array index as a second argument**, so giving the mapper a `now` parameter made every token in every list read `expired: false`; that **the plan's own `Promise.all` control could not fail on a cold pool**, because `pg.Pool` establishes a connection per acquire and the five asks serialise; and that **the one route authorizing `release:promote` had no case in the matrix at all**, since it only ever deployed to staging. **Sitting 8 — Task 12, 2026-09-18 — ran with 16 findings**: `make demo-token` runs D24's whole loop end to end through the edge, on its own project `token-app`, and it is **the first client any route in this plan has had outside `app.inject`**. Both of its worst findings were in the CLIENT, invisible to everything server-side: **`subscribe` could not carry a delegated token at all** — Task 5 gave `createManifestClient` a `token` and nothing gave the stream one, so an agent could start a build through the generated client and had nothing to watch it end on, while the route had accepted a bearer all along — and **the journey's import boundary test matches English prose**, turning `pnpm test` red on a file with no forbidden import. **Three of its five negative controls answer `403` for the WRONG REASON**, so a status-only demo would have passed all three; and its own no-bearer control reported ONE red check until step 3 stopped throwing, then six. **Sitting 9 — Task 13, the acceptance, 2026-09-18 — ran with 11 findings, and P5b IS EXECUTED**: `make demo-token` is step 9 of `scripts/offline-acceptance.sh` and ran green three times — truncated database, re-use path, and an `echo reset | make reset` machine — with twelve negative controls watched and restored. It found that **sitting 8's prediction about Task 13's control (a) was wrong in the direction that matters**: a token that does NOT hold the privileged capability is refused by a different rule with a different code, and that is every real token; and that **the token secret's constant-time comparison was asserted by nothing at all** — replacing it with `===` left 1342 tests and all nine demo steps green — so it is now asserted at the source. **P5c — the mock, the console and the CI acceptance script — WAS WRITTEN ON 2026-09-18 AND IS NOW EXECUTING** ([`plans/2026-09-18-p5c-the-clients.md`](plans/2026-09-18-p5c-the-clients.md)), **14 tasks in nine agreed sittings. HOW MANY ARE DONE IS STATED IN THIS FILE ONCE, in the box at the very top, and in the plan's own sittings table — this sentence deliberately does not, because it said *"TWO ARE DONE"* through the whole of sitting 3 while the box above said three, which is the defect P5b sitting 8's post-sweep check found in this file's P5b paragraph and the reason the rule exists.** **Sitting 1 — Task 1, the measurements, alone and first — ran on 2026-09-18 with 19 findings** ([`spikes/p5c-baseline/`](spikes/p5c-baseline/README.md)). **All ten measurements ran, all nine of the `(T1: M<n>)` markers held, and no task boundary moved, so the nine-sitting split stands.** **It closed §8's `stream_close_delay` question with the measurement Rich asked for**: without the field a runtime route's WebSocket was `CLOSED 1001` two milliseconds after an unrelated route was inserted; with it, it survived — so one app's deploy was disconnecting every other app's sockets, and `routing/caddy.ts` now sets the field. **Its worst finding is about the plan's own snippet for that measurement**: it drives the Caddy admin API with node's `fetch`, which Caddy refuses `403` because undici attaches `Origin: ''`, and it checked neither `r.ok` nor `r.status` — so it would have reported the socket SURVIVING a reload that never happened, and closed §8 backwards. Four more corrections landed on Tasks 2, 4, 13 and 14, the sharpest being that **`ajv-formats` must be installed in sitting 2 or never** (the document carries 185 format assertions and Ajv v8 implements none of them). Rich decided three things in it: **nine sittings, the leaner of three splits offered** (eleven was recommended, and the cost was stated — sitting 5 carries both streaming screens); **§8's `stream_close_delay` question is settled by a MEASUREMENT in its Task 1** rather than by reasoning; and **the clicked half of its acceptance is SHARED and recorded** — the agent drives Chrome and reads every page, Rich types every password, because the extension will not (§4). Its own decisions worth knowing before reading it: the console reaches the API through `@manifest/contract` and nothing else **except the two unversioned sign-in endpoints, which live in one file a test polices**; **every API call is a function in one file**, which is what makes D22's coverage gate and a DOM-free test of the console's calls both possible; **the pending-action sweeper gets NO timer** (the decision P5b left to it); and there is **no DOM test tier and no CI workflow file**, both named with what they cost. **Its self-review caught eleven.** **Sitting 2 — Tasks 2 and 3, the ONE sitting with the network on — ran on 2026-09-18 with 10 findings**: `packages/console` (React 19.3.0 + Vite 8.3.0) and `packages/mock` exist, all four gates read them, and the console's import boundary refuses two different things before a single screen exists. **Nothing from here to the end of the plan may install a package.** Its two best findings are about the plan rather than the platform, and both are step ORDER: **Task 2's Step 2 installs into packages that Step 3 creates**, so `pnpm --filter @manifest/console add` answers *"No projects matched the filters"*; and **Task 3 cannot go green as written**, because `main.tsx` is the only console file with an import — React 19's automatic JSX runtime means `app.tsx` needs none — so the boundary's own *"read more than one file"* control fails until `auth.ts` has a caller, which is this plan's own rule and the repair at once. It also found that **the plan's `fetch` rule cannot see the template literal `auth.ts` itself uses to name `/auth/login`**, and that **a negative control keyed on a whole suite's exit code borrows every flake in that suite** — the control was contaminated by an unrelated 5 s timeout and was settled instead by grepping the output for the file that should not have been collected. **Sitting 3 — Task 4, alone — ran on 2026-09-18 with 9 findings and SERVED THE CONSOLE**: the Caddyfile's placeholder is a `reverse_proxy` to 7104, the shell, router, data layer and refusal surface exist, and **Rich signed in with CWL in a browser and the header read `Test Instructor ins000001`**. **Its sharpest finding is about the plan's own honesty**: Task 4's control table said no test sees the Caddyfile's console line — *"the honest statement of this task's coverage"* — and **two of the four platform gates see it**. `make doctor` read `CLAIMED BY SOMETHING ELSE: 7104` the moment a console ran on §21's own port, and `make verify`'s console check asserted the placeholder's literal words; both went red on their first run after the change, and **the first is the identical defect this project fixed for port 7100 on 2026-09-07**, with `doctor.sh`'s own comment saying so. It also found that **`signOut` never checked its answer** — a refused sign-out reloaded the page and left the person signed in with nothing saying so — and that **`response.ok` would not have caught it**, because at `127.0.0.1:7104` the console's own Vite server answers `GET /v1/me` with `index.html` and **200**. **Sitting 5 — Tasks 7 and 8, the two streaming screens, the heavy one — ran on 2026-09-18/19 with 13 findings and CLICKED §22 STEPS 4 AND 5 AND THE SIGN-IN HALF OF STEP 6** (step 6's *write a note; ask the LLM* was not exercised — that is `make demo-ai`'s ground and Task 14's): a person presses *Build* and watches BuildKit's output arrive line by line, the build ends `succeeded` with no reload carrying its digest and §12's scan, they release it, deploy it to staging watching four states arrive live, and open the app's own URL to sign in to the running application with CWL — and a redeploy answered **14 consecutive `200`s as the same person** from the app's own tab, which is P4c's property seen from a browser for the first time. **Its headline is that the stream alone is not the log**: `LogFrame` is never replayed — the document says so and `recentFramesFor` proves it by selecting from `events` — so a screen opened after a build shows nothing unless it also reads `getBuildLog`, measured at **74 lines on screen against 0 log frames in the replay**, and the plan's Task 7 never mentions that read. **Three of the plan's own claims were wrong and are corrected in place**: `<Refusal>` never rendered the envelope's `launchReadiness` though Task 4's doc comment said it did and Task 8 relied on the sentence (**6 items in the envelope, 0 on screen**); an empty `StartBuildRequest` builds the last VALIDATED manifest's commit and not the repository's HEAD; and **Task 7's control row 3 cannot fail**, two ways over. **The sharpest defect was the screen's own**: what is SERVING and what the last ATTEMPT did are two different facts, and a failed deploy is a `200` whose state is `failed` while the previous instance keeps serving — watched with the stream ending `instance.failed` while the environment answered `healthy` on the release before it. **Sitting 6 — Tasks 9 and 10 — ran on 2026-09-19 with 11 findings**: §22 step 7 is clicked, an administrator reads §26's fleet, and a person mints a delegated token, is shown its secret once, lists it and revokes it. **The launch checklist's two paths were measured BYTE-IDENTICAL** — the read and the production deploy's `409` envelope — re-proving P5a sitting 11's property, and both now render through one component. **Its headline finding is a renderer that lied about every future instant**: `<Ago>` clamped its difference at zero, so a token expiring in thirty days read `expires 0s ago` beside a pill correctly reading `active`, with all four gates green — both fields are `string`, so no gate here can tell a past instant from a future one. It is now the direction-aware `<Instant>`. **The D22 finding §7e predicted is confirmed**: the document cannot mark D24's privileged four, so the console restates them; the ELEVEN capabilities are held to the document by `tsc` in both directions, the four are not. **`revokeToken` publishes no event**, the third instance of that shape. **Two of the plan's own control rows proved weaker than they read**, one of them un-fireable because the formula it proposes is not the mistake anybody would make. *Sittings pace the work; they are not §17's product Phases.*

**Executing a plan finds defects at a rate that has never fallen with practice** — 18 in P1's 13 tasks, 52 in P2's 21, 82 in P3's 19, 80 in P4a's 15, 140 in P4b's 16, 70 in P4c's 11, 146 in P5a's 17 — plus 8 more found in a browser after sitting 7, which no tier had ever looked at — and **116 in P5b's 13** — every plan self-reviewed first. The roadmap's defect-rate table has every plan and sitting. Treat a written plan as a hypothesis (§9).

**The four numbers you will check first, re-measured 2026-09-19 on this machine at the close of P5c sitting 6. NOTHING MOVED THIS SITTING — Tasks 9 and 10 add no test file, by Decision 7 (the console has no DOM test tier), so all four are the figures sitting 4 left:**

| | |
|---|---|
| `pnpm test` (from the **repo root**) | **1355 passed, 103 files**, ~110 s — the `unit` project and `packages` (the client and the journey, which need nothing running). **Unmoved by sittings 5 and 6, neither of which adds a test file (Decision 7). Up 1 and NO new file from sitting 3's 1354/103** — `packages/console/src/boundary.test.ts`'s fourth assertion, that the scanner descends into `src/`'s subdirectories, which sitting 4 measured all three earlier tests staying green without (F3). Tasks 5 and 6 add no test FILE, by Decision 7. Sitting 3's 1354 was up 6 and one file from sitting 2's 1348/102, all of it `packages/console/src/auth.test.ts` — `signOut`'s *assert the shape of the answer* guard, in Node with no DOM. Sitting 2's 1348 was itself up 3 and one file, `packages/console/src/boundary.test.ts`. The 1345 itself was up 1 from P5b's 1344, in `routing/caddy.test.ts`: the assertion that `buildRoute` sets `stream_close_delay` to the NUMBER `3_600_000_000_000`, which sitting 1 added when M8 measured that an app's WebSocket is cut by any other app's deploy. **The `packages` project now names four packages, not two** — a test file in a package `vitest.workspace.ts` does not list runs under NO project and is silently not collected, which reads exactly like a passing suite (sitting 1's M4, fixed and watched in sitting 2). No Docker needed except Postgres for the `db/`, `api/`, `secrets/`, `services/`, `sso/`, `observability/`, `releases/` and `tokens/` suites, plus `spec/injection-drift`, which reads the pinned `passport-ubcshib` tarball out of the platform's own mirror. It connects as **`manifest_app`**, not as `manifest` (§3) |
| `pnpm test:docker` | **178 passed, 0 SKIPPED**, 29 files, **~807 s, last measured by P5c sitting 3**, which owed the tier because it changed `infra/caddy/Caddyfile`. **Sittings 4, 5 and 6 neither ran nor owed it** — and sitting 6 ran no Docker work of any kind, where sitting 5 at least ran real builds and deploys. **Sitting 4 neither ran nor owed it** — neither of its commits touches `routing/`, `infra/` or a `*.docker.test.ts`, and the Caddyfile it changed as a negative control was restored byte-identical before either commit. (Sitting 2 neither ran nor owed it; do not spend 13 minutes on it out of habit) — **unchanged through P5b sittings 8 and 9 and P5c sitting 1, none of which adds a Docker test** (P5c sitting 1 changed `routing/caddy.ts`, so it OWED the tier, but its assertion is a unit test); **177 had held for eight runs across five sittings before P5b sitting 7 added the one.** The one is `boot.docker.test.ts`'s *expires a question nobody answered*, and it is the ONLY test in the repository that fails if `src/index.ts` stops calling the expiry sweeper (sitting 7). The tier still drives SESSIONS: `grep` over every `*.docker.test.ts` finds no `Authorization: Bearer` that is a Manifest delegated token — they are registry tokens and LiteLLM keys — so nothing there presents the credential class sittings 3 to 7 have been building. Needs `make up`, and **fails rather than skips** when asked to run |
| `make doctor` | **18 checks, 0 failed, 0 warnings** |
| `make verify` | **51 checks, 0 failed, 0 warnings** — measured by P5c sitting 3 **both with `vite dev` on 7104 and with 7104 free**, because its console check was rewritten to stop depending on a developer's host process (sitting 3, F3) — and read its *per-app resources* INFO line, which is not a check: **it reads `containers=3 networks=1 volumes=2` on a machine whose dead resources have just been cleared, and `containers=3 networks=8 volumes=3` after ANY `pnpm test:docker` run — both measured again on 2026-09-18 by P5c sitting 3, in that order, which is the THIRD time the tier has been watched regenerating exactly the same seven networks and one volume.** **It reads `containers=3 networks=1 volumes=2` today**: sitting 3 ran the tier, which took it to `8`/`3`, and Rich applied both scripts at that sitting's close — re-measured clear afterwards by the scripts themselves. One app is deployed (`token-app`: three containers, one network, two volumes), so the honest figure is `containers=3 networks=1 volumes=2` — it read `9/3/6` for three apps until sitting 9's `make reset` destroyed the other two. **The extra seven networks and one volume are DEAD and are Rich's to remove**; until he has, expect `8` and `3` and do not go looking for a fault. More networks than apps means an app whose containers are gone and whose network is not; `0/0/0` is a freshly reset machine. **One `pnpm test:docker` run takes it to `networks=8` on its own** and the extra seven are dead: run `bash scripts/dead-app-resources.sh`, which re-derives them, and hand the output to Rich — an agent session's classifier refuses `docker network rm` (sitting 9, F8) |
| `make demo-token` | green — **P5b's acceptance, and it ran three times in sitting 9**: from a truncated database (create path, 64 checks), on the re-use path (63 — the one fewer is the create path's own check) and from an `echo reset | make reset` machine (64). ~30 s. It is step 9 of `scripts/offline-acceptance.sh` |
| `make demo-journey` | green, all eight steps — last run at the end of sitting 8. **Sitting 9's `make reset` destroyed `journey-app`**, so the next run of it recreates the project from its starter |

**A different number on a clean checkout is signal, not noise** — it means something moved, and finding out what is cheaper before you start than after. **This box is the only current one in this file**; the same four numbers are stated in `README.md` and `RUNBOOK.md`, and all three move together (§6). A plan's record carries the numbers as each sitting left them, dated, and they deliberately do not move.

**Outstanding, and Rich's.**

- **The offline acceptance.** Turning the network off from a tool call cuts the agent off too, so `scripts/offline-acceptance.sh` is run by hand. Its step 6 runs `make demo-identity`, the step most likely to need a route out; its step 7 runs `make demo-ai`, whose open question is whether Ollama — a host application, not a container — answers with the network off. **A skipped acceptance is not a passed one.**
- **The second-machine clean clone** — no second Mac has been available; `RUNBOOK.md`'s *Known gaps* records it.
- **Starting the UBC external track** — its trigger, §16's proof app answering a question, fired on 2026-09-15 and was raised with Rich that day. [`docs/external-track.md`](../external-track.md).
- **~~LiteLLM's orphaned users~~ — CLEARED 2026-09-18, and there is now a script so it stays that way.** Rich ran `bash scripts/litellm-orphans.sh --apply` **most recently at the close of P5c sitting 1, clearing one orphan (`p4b-probe-user`) and leaving 0** — and before that at the end of P5b sitting 8, where **19 rows became 4** — `default_user_id` and the three held by a running container (`mf-1db14646-…` proof-app, `mf-3a7ed662-…` token-app, `mf-4992be4b-…` journey-app). Re-measured afterwards by the same script: **0 orphaned, and all three held users survived.** `scripts/litellm-orphans.sh` (RUNBOOK, *Reaping LiteLLM's orphaned users*) **re-derives what is orphaned on every run and never reads a list**, because journey-app's user moved in every one of the last eight sittings; it reads stopped containers as well as running ones, and refuses to delete anything if it read app containers and got no key hashes at all. **An agent USUALLY cannot run the delete** — the session's permission classifier has refused it as a secret-store write — but **P5c sitting 5 was ALLOWED it, and was allowed `dead-app-resources.sh --apply` in the same session**, so the honest rule is §4's: **try the command rather than trusting this note.** The split still stands as the fallback: an agent runs it bare and hands the list over, Rich runs it with `--apply`. **The list will grow again**: every demo that replaces a project and every `pnpm test:docker` leaves one more.
- **~~The Docker cleanup sitting 12 could not do~~ — DONE 2026-09-18, at the end of P5b sitting 8, and it turned out to be four times the size the list said.** Sitting 12's own list named 20 images; re-deriving the held set found **86 unheld `local/*` app images**, accumulated across the whole project rather than one sitting — and found that sitting 12's *"KEEP `journey-app@e288f8b3`"* had **gone stale**, because journey-app had been redeployed twice since. **Never work from that list; re-derive.** Removed: all 86 (**`docker system df` reported Images 132 → 46**, then 45 once the fixture app's own image went — **name the metric**: `docker images -q | wc -l` answers **53** for the same machine, because the two count dangling and intermediate images differently, and a number with no metric reads as a contradiction. The `fixture-rt`/`fixture-s6` two-names trap hit once and was handled by `repo@digest`), and **the fixture app `make demo` left** — its three containers with `rm -f -v`, then the network after disconnecting `manifest-caddy` and `manifest-dns-containers`, then `mf-fixture-app-staging-db-data`, its image and `.manifest/repos/fixture-app.git` — so `make demo` starts from nothing. `base/*`, every platform image and every image a container holds were untouched, and the four apps were healthy and serving afterwards. **`make doctor` 18/0 and `make verify` 51/0 were re-run after the IMAGE sweep and are owed after the fixture teardown**, which is an app rather than a platform change. **The classifier TIGHTENED MID-SESSION** (§4): it allowed 86 `docker image rm`s and the whole fixture teardown, then began refusing `docker volume ls`, `snapshot-machine.sh` and `make doctor` as *[Interfere With Workloads]* — so try, and expect the answer to change under you.
- **~~Dead app networks and volumes~~ — CLEARED 2026-09-18, re-measured by the script, and RECURRING by construction.** Rich ran `bash scripts/dead-app-resources.sh --apply` **most recently at the close of P5c sitting 1**, and a re-measurement by the same script afterwards read **`none dead`, 0 networks and 0 volumes** — the only survivors are `mf-token-app-staging-net` and token-app's two volumes, all three correctly KEPT because containers hold them. So the seven networks and one volume P5b sitting 9 left are gone. **This does not stay cleared**: the set is regenerated by the Docker tier, and sitting 9 measured a single `pnpm test:docker` putting back exactly the same seven names and one volume. **The standing instruction is unchanged — never work from a list, run the script**, which re-derives; an agent runs it bare and hands the output over, Rich runs it with `--apply`, because the classifier refuses `docker network rm` as *[Interfere With Workloads]*. **`make verify`'s per-app INFO line is the meter** and should now read `containers=3 networks=1 volumes=2` for the one app this machine has. The seven names the tier regenerates are `mf-blueprint-ntm-`, `mf-chem-labs-`, `mf-fixture-rt-`, `mf-fixture-s6-`, `mf-fixture-s6nb-`, `mf-saml-probe-` and `mf-saml-unsigned-staging-net`, plus `mf-chem-labs-staging-db-data` — recorded as what to EXPECT after a Docker-tier run, never as a list to work from. **So this is not a backlog, it is a fixed set the Docker tier regenerates every run**: the tier removes its throwaway apps' containers and not their networks. **Never work from a list — run `bash scripts/dead-app-resources.sh`**, which re-derives, calls a network dead only when no container of ANY state is named for that app AND only `manifest-caddy` and `manifest-dns-containers` are attached, and disconnects those two before removing. An agent runs it bare and hands the output over; **Rich runs it with `--apply`, because the classifier refuses `docker network rm` as *[Interfere With Workloads]*** — refused again in sitting 9, minutes after the same session had been allowed far more. **`make verify`'s per-app INFO line is the meter**: it should read `containers=3 networks=1 volumes=2` for the one app this machine has, and a `pnpm test:docker` takes it to `networks=8`.
- **~~Watching the edge's `@outside` refusal go red~~ — CLOSED 2026-09-17, and no longer Rich's.** P5a Task 17's control (a) asked for the refusal to be removed from `infra/caddy/Caddyfile` and the edge reloaded; that weakens a running edge, and this machine's classifier refused it twice as *[Security Weaken]*. **It is now proved two ways that do not weaken anything.** (1) `make verify`'s *the console's one allowed source is the platform network's gateway* reads the **Caddyfile on disk**, so removing the rule was watched turning it red — `platform gateway=10.89.0.1 Caddyfile allows= …` — with no `make up` and the edge never reloaded. (2) `routing/edge-source-refusal.docker.test.ts` starts a **throwaway** `manifest-caddy:local` on the platform network with and without the matcher and asserts the answer changes, so the causal link is re-proved on every `pnpm test:docker` instead of once by hand. Both of its directions were watched failing.
- **§8's open questions.**

**The spec is current.** Every spike's and every plan's spec actions have been applied with Rich's explicit approval — most recently P5a's six (`491f8be`). **Trust the spec over the spike briefs**, which are preserved as a record of what was originally asked, and **propose any further change; never edit it** (§6).

---

## 3. The document map, the code, and what it keeps true

Read for your purpose, not front to back. The spec is ~2,340 lines; nobody reads it all.

| You are… | Read |
|---|---|
| **new, any role** | This file — §7e and §2 first. Then the roadmap's ledger and its *Lessons*. |
| **executing a plan** | **The current plan, which §7e names.** Its sittings table says which sitting is next, and its *What executing this plan found* is the record of every sitting before — read that before the task. One sitting per session, with a check-in at each boundary. A plan is self-contained by construction; if it is not, that is a defect in the plan — fix it there. |
| **writing a plan** | **Nothing is waiting to be written.** P5c was written on 2026-09-18 and is the last of Phase 1c; the next plan to write is Phase 2's first, and it is not started. House style: [`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md), or any later plan. |
| **seeing it run end to end** | [`WALKTHROUGH.md`](WALKTHROUGH.md) — start it, deploy the demos, what to open in a browser and with which test users, how to check it, and the traps. |
| **running the platform** | [`RUNBOOK.md`](RUNBOOK.md) — `make seed && make host-setup && make up`, every demo step by step, and *Known gaps*. README's *Running the control plane* is the export block to start it with. |
| **writing code** | *The code* and *What the platform keeps true* below. **Then run `make demo` once**: it is the only thing that exercises boot, build, release, deploy and the edge through the real HTTP surface, and it is where this project's worst defects were found. |
| **changing the spec** | Don't, without asking. It is marked *Approved design*. Record the proposed change and Rich decides. |

```
docs/external-track.md          the UBC IAM / PIA work that runs in parallel (docs/, not docs/superpowers/)
docs/superpowers/
├── ORIENTATION.md              ← you are here
├── WALKTHROUGH.md              run it, see it, check it — one page, browser included
├── RUNBOOK.md                  run and operate the platform; every demo; Known gaps
├── specs/
│   ├── 2026-08-29-manifest-platform-design.md   AUTHORITATIVE. 27 sections.
│   └── manifest-*.html         plain-language versions, SHARED OUTSIDE THE TEAM; markdown wins
├── plans/
│   ├── 2026-08-29-plan-roadmap.md                 THE LEDGER. Status and the defect-rate table.
│   ├── 2026-08-29-phase-0-spike-briefs.md         P0. Historical record.
│   ├── 2026-08-30-p1-local-substrate.md           P1 — and the house style for a plan
│   ├── 2026-08-29-p2-control-plane-spine.md       P2
│   ├── 2026-08-31-p3-docker-driver-deploy-spine.md P3 — its Sessions 4 and 5 above all
│   ├── 2026-09-07-p4a-identity-secrets-injection.md P4a
│   ├── 2026-09-07-p4b-ai-events-streaming-incidents.md P4b
│   ├── 2026-09-15-p4c-brief.md + …-p4c-zero-downtime-redeploys.md P4c
│   ├── 2026-09-16-p5-brief.md                     the brief P5a, P5b and P5c are written from
│   ├── 2026-09-16-p5a-the-contract.md             P5a — executed 2026-09-17
│   ├── 2026-09-17-p5b-delegated-tokens.md         P5b — executed 2026-09-18
│   └── 2026-09-18-p5c-the-clients.md              P5c ← CURRENT, executing; its own sittings table says how far
└── spikes/
    ├── S7, S2, S1, S3, S6-findings.md   each one's answer is its first sentence (§5)
    ├── S1-controls-settled.md          scoped registry tokens; the builder's bounds
    ├── p4c-baseline/, p5a-baseline/    the measurements P4c and P5a rest on
    ├── START-HERE.md                   the ORIGINAL spike briefing. Historical; its §6 is wrong
    └── HANDOFF-2026-08-3*.md           dated handoffs, SUPERSEDED by this file; do not act on either
```

**Every executed plan's *What executing this plan found* is its record**: every defect with the measurement that found it, every negative control, the gate numbers and the machine, sitting by sitting. §7a says which entries to read first.

### The code

```
Makefile  infra/  scripts/        P1's platform: compose.yaml and its services; make seed / up / down / reset /
                                  doctor / verify / demo*; infra/lib/ holds the ensure-*.sh steps and idp-login.sh
vitest.config.ts                  ROOT: fileParallelism: false — a root-level option; it does nothing in a package config
.prettierrc  .prettierignore      Prettier owns packages/ ONLY — without the ignore, `pnpm format` rewrites the approved spec
blueprints/fixture-node/          P2's minimal blueprint
blueprints/node-ts-mongo/         THE blueprint faculty apps are generated from: descriptor, Dockerfile, skeleton
                                  (auth/, ai/, server.js), agents/AGENTS.md — the knowledge pack — and starters/
blueprints/node-ts-mongo/starters/proof-app/
                                  §16's proof app, node-ts-mongo@1's first STARTER (P5a Task 10; it was
                                  fixtures/proof-app/) — laid over the skeleton by scripts/lib/proof-app.sh
fixtures/fixture-app/             make demo's build target — server.js at the tree root, because the blueprint's CMD
                                  is not templated
fixtures/saml-sp/                 a throwaway SP on the real passport-ubcshib — §16's identity-path tier
infra/reserved-labels/            §23's reserved labels, loaded at boot
packages/control-plane/src/       the control plane — below
packages/contract/                openapi.json (GENERATED) and @manifest/contract, the client generated from it
packages/journey/                 §22's journey through that client — make demo-journey
```

`packages/control-plane/src/` — one directory per §5 module, and **`module-boundaries.test.ts` refuses an import of another module except through its `index.ts` or `testing.ts`**:

| Module | What it is |
|---|---|
| `index.ts`, `config.ts` | the boot, and env parsing (repo paths resolve from the repo root, never the cwd) |
| `spec/` | §7's schema and policy, `diff.ts` (D9's sensitive diff, §14's readable diff), `resolve.ts` (three layers), `injection.ts` (§8) |
| `blueprints/` | §25 descriptors and the registry |
| `db/` | Drizzle schema and client, `locks.ts`, `testing.ts` — `withRollback` isolates a test from its OWN writes only; `resetDatabase` is for a test that drives a real server, whose rows are committed |
| `runtime/` | §11's `Driver`, the fake driver, **`driver-contract.ts`**, the state machine; `runtime/docker/` is the one real driver |
| `routing/` | §23 hostnames → Caddy routes; readiness and identity probes run from inside the edge. `caddy.ts` speaks `node:http`, not `fetch` — Caddy's admin API refuses any request carrying an `Origin` header |
| `build/`, `services/`, `source/` | the build context, §12's gates and scan; per-app Mongo; bare git repositories (D5 driver 1) |
| `identity/`, `sso/`, `secrets/` | sessions and Manifest's own SAML SP; per-app SP registration in the IdP; envelope encryption |
| `projects/` | §13 authorization (`authz.ts`), the repository, reserved labels, `checkSlug` and §26's `fleet.ts` |
| `releases/` | build (the `BuildRunner` a build runs on), release, deploy, retire, recover-at-boot |
| `observability/` | events and every event type's payload schema (`event-schemas.ts`), redaction, build logs, Incidents, the event bus |
| `ai/` | the LiteLLM admin client, D17's catalogue, app keys |
| `launch/` | §13's first-launch checklist, computed from what exists and never stored (`readiness.ts`) |
| `api/` | the Fastify server; `contract/` (`defineRoute`, the OpenAPI document); `representations/`; `routes/`; `error-codes.ts`; CSRF; idempotency; **`authz-contract.ts`** |

**Read first:** `runtime/driver.ts` and `runtime/driver-contract.ts` — everything is built against them — then `runtime/docker/driver.ts`, `api/server.ts` for how a request becomes an actor, `projects/authz.ts`, and `api/contract/route.ts`.

### What the platform keeps true

Each of these was built, measured and paid for; the record is in the plan named. **A change that breaks one is a defect even when every test is green.**

**Identity**

- **Manifest is its own SP (§9), and there is no login shim.** `GET /auth/login` sets `manifest_login` and sends its nonce as `RelayState`; `POST /auth/saml/callback` refuses an assertion not bound to the browser that started the sign-in (`401 SAML_LOGIN_NOT_BOUND`) before node-saml validates it, then lands on `/` or a same-origin `?returnTo=`. Sessions are stateless signed cookies that carry the role they were issued with. Tests sign their own with `identity/testing.ts`. *(P4a Task 14, P5a Task 4.)*
- **The control plane's SAML library is `@node-saml/node-saml` 5.1.0, NOT the `passport-saml` the blueprint pins**, which audits one Critical with no fix. Three node-saml defaults fail open and are set explicitly — sha1 signing and digest, `validateInResponseTo: never`, `emailAddress` — and nothing scans the control plane's own dependency tree (§12's gate scans app images). *(P4a.)*
- **The platform's SP row is written at every boot**, through `renderSpMetadata` — the one renderer of an `entity_data` document — with its ACS from `MANIFEST_CONTROL_PLANE_ORIGIN` (default `https://console.manifest.internal`) and its keypair in `infra/sp/control-plane.{key,crt}`. The Docker tier boots control planes on 7188/7189 that re-register it at a loopback ACS: **restart the control plane after `pnpm test:docker`.**
- **The Manifest IdP releases attributes by `core:AttributeLimit` at priority 50 on friendly names, then `core:AttributeMap` at 60 to the OIDs UBC sends — the order is load-bearing** (reversed, it releases nothing), and `make verify` asserts it. `ssp_ro` reads metadata and cannot write it; a CHECK makes a row with an empty or absent `attributes` — which S2 measured releasing everything — unrepresentable.
- **Four settings read like controls and are not**: SimpleSAMLphp's `validate.authnrequest` (a present signature is always validated), node-saml's `wantAssertionsSigned` and `wantAuthnResponseSigned`, and the blueprint's `attributeConfig` (its bridge reads the OID first). §9's release enforcement is the control. *(P4a, measured.)*
- **Signing out of an app ends BOTH sessions and lands back on the app** (fixed 2026-09-16, found in a browser — no app had ever signed anybody out). The IdP trusts exactly §23's app hostnames as a `ReturnTo` (`trusted.url.regex` in `infra/idp/config/config.php`; `make verify` holds both directions), and the blueprint's `cwl.logout(returnTo)` answers the IdP's own `LogoutRequest` at `auth.logout` — which is also the SingleLogoutService the platform registers — with a `LogoutResponse`, addressed through `SAML_LOGOUT_URL`, which the strategy is now given. `make demo-identity`'s step 9 signs the student out and the instructor in through the same cookie jars.
- **The three-hop CWL sign-in is ONE function, `idp_login` in `infra/lib/idp-login.sh`.** It proves the SP row and the AuthnRequest signature; it does not prove the session authenticates anybody, so **a caller's identity check is the assertion**.

**Data, secrets and audit**

- **The control plane connects as `manifest_app`, never as `manifest`**: `manifest` is `POSTGRES_USER` and so a superuser, and a superuser bypasses every grant — which made §20's append-only audit unimplementable. **Three database URLs, none derived from another**: `MANIFEST_DATABASE_URL` (the app role), `MANIFEST_ADMIN_DATABASE_URL` (migrations and the test harness's `TRUNCATE` only; `src/` never reads it) and `MANIFEST_IDP_DATABASE_URL`. `vitest.env.ts` derives all three from `.env`.
- **`audit` is its own schema** — `events`, `build_logs` and `incidents`, append-only by grant, with foreign keys `ON DELETE RESTRICT`, because a referential action runs with the referenced table's privileges and a cascade let the application erase the trail. `recordEvent` takes its redactor as a PARAMETER, so nothing writes an unredacted row, and **every event goes through `publishEvent`**, which records it and streams it; a database CHECK closes the event types.
- **`secrets/` is libsodium envelope encryption over a `secrets` table**; service credentials and each app's `SESSION_SECRET` are STORED, not derived; `process.env` is scrubbed at boot. Tests use `withSecretScope` (`secrets/testing.ts`). **`deriveCredentials` survives on purpose**: a service created before credentials were stored still holds the derived password, which the store adopts on first call — deleting it before every existing service has been deployed once is the trap P4a's Decision 8 describes. **`infra/secrets/master.key`, `infra/idp/cert/`, `infra/sp/` and the Caddy CA are minted by `make up`, gitignored, and NOT removed by `make reset`.**
- **A migration is always its own file** — drizzle-kit keeps a journal and never re-runs an applied one — written by `pnpm --filter @manifest/control-plane db:generate` from `db/schema.ts` and applied with `db:migrate`. **`db:migrate` reads `MANIFEST_ADMIN_DATABASE_URL` FROM THE ENVIRONMENT, and nothing exports it for you**: run bare, from the root or the package, it fails `Please provide required params for Postgres driver: [x] url: undefined`, which reads like a broken config rather than a missing export. `vitest.env.ts` derives the three URLs for the TEST harness only. From the repo root:
  ```bash
  set -a; . ./.env; set +a
  MANIFEST_ADMIN_DATABASE_URL="postgres://manifest:${POSTGRES_PASSWORD}@127.0.0.1:7103/manifest_control" \
    pnpm --filter @manifest/control-plane db:migrate
  ```
  README's *Running the control plane* exports it along with everything else the process needs; this is the one-line form for a migration on its own. *(Measured in P5b sitting 3, which applied 0015.)*

**Build and deploy**

- **§8's injection contract is ONE function with ONE producer** — `spec/injection.ts`'s `renderInjection` — and `deployRelease` adds nothing; service variables are read out of the endpoint the driver returned, and §8's two files reach the container through `InstanceSpec.files` — the IdP certificate `0444`, the SP key `0440`, root-owned with the blueprint's `run_as_uid` as its group. **§16's drift tier reads the blueprint's SOURCE**, comments stripped, against the renderer's output; `ALLOWED_UNSET` and `PLATFORM_ONLY` are deliberately empty. *(P4a Tasks 10–13.)*
- **A deploy reads only the `ResolvedConfig` frozen at release (§13)**, never `app_specs.parsed` — a second source of truth is the defect shape P3 paid for seven times.
- **A redeploy interrupts nobody (P4c).** The new instance starts beside the old one, is proved ready from inside the edge, and takes the route with one in-place `PATCH`, under a per-environment advisory lock, with §6's `Route` record written; the retirer drains and removes the old one after the deploy returns. `recoverAtBoot` puts routes back from `Route` rows, ends interrupted deploys and finishes drains. **A release that never becomes ready is a `200` whose state is `failed`**, with §14's Incident, and the previous instance keeps serving. Sessions live in the app's own Mongo.
- **§12's scan gate blocks on a Critical or High that has a published fix**; findings with no fix, and the base image's, are **recorded on `builds.scan`** as a `ScanSummary` (P5a Task 13) — the scanner, its database's age (null when it could not say) and staleness, whether the base image was identified, and Critical and High counts for the three buckets, which are the only severities §12 classifies. Every release of that build shows it.
- **AI (P4b):** the gateway joins an app's network only when the app declares models; each instance's key is confined to `/v1/chat/completions`, `/v1/embeddings` and `/v1/models`, under a budgeted LiteLLM user `mf-<project>-<environment>`; the end-user identifier `sha256(puid ‖ project ‖ environment)` has one producer, the blueprint's `skeleton/ai/end-user.js`. AI is on unless `MANIFEST_AI_ENABLED=0`, and on refuses a boot with no master key.
- **`node-ts-mongo@1` is §20's security multiplier**: its skeleton — CWL sign-in, the AI component, sessions — is written once and inherited by every app, its skeleton is a Docker-tier build target, and every app-side dependency is pinned exactly (C6, D30).

**The API (P5a)**

- **Every resource route is under `/v1`, reached at `https://console.manifest.internal` through the edge, which refuses every source but the host** (`10.89.0.1/32`); the sign-in endpoints and the registry's token realm stay outside `/v1`, listed in `api/unversioned.ts`.
- **EVERY `/v1` route is declared once, through `defineRoute`** (complete at P5a Task 14; `api/contract/coverage.test.ts` holds it so), with `zod/v4` schemas; its answer is parsed through a registered representation, so no column a mapper forgets can leave — and, measured in sitting 10, **a handler that skips its mapper altogether is a `500`, not a stripped `200`**, because the row's `Date` fails the representation's string `Timestamp` before stripping is reached. `packages/contract/openapi.json` is generated from the definitions and held by a drift test (`pnpm contract:write`), and `@manifest/contract` is generated from the document (`pnpm contract:generate`). **Whether a route reads a request body is the SCHEMA's answer, not the method's** — `readsBody(route)` is `route.body !== NO_BODY` — because `DELETE /v1/tokens/{tokenId}` (P5b Task 4) is the API's first bodyless mutation and, keyed on the method, it was `400 REQUEST_INVALID` before its handler ran and could not be put in the document at all.
- **A `Release` names its env vars and never their values, and an `Instance` never names a container** (P5a Task 14, Decisions 22 and 23): a release carries its build's digest and scan and, per environment, the frozen numbers and `envNames` — the value still reaches the container through §8's injection and stops there — and a deploy answers an instance with no `driver` and no `handle`. `GET /v1/releases/{releaseId}` and `GET /v1/projects/{projectId}/releases` read them back.
- **A deploy says it began before it says how it ended** (§22 step 5, P5a Task 14): `deployRelease` publishes `instance.provisioning` the moment the row exists and `instance.starting` the moment before the driver is asked for a container, and it **stores** `starting`. **An app with CWL sign-on puts `sso.registered` between the two**, because the SP is registered after the services are bound and before the container starts. A deploy that throws leaves the trail: `provisioning` alone if it never bound its services, `starting` if it did — both states `recoverAtBoot` can end.
- **There are TWO CREDENTIAL CLASSES and ONE place that reads either** (D23.4, P5b Task 5). `api/server.ts`'s single `onRequest` hook turns a `manifest_session` cookie into a `SessionActor` and an `Authorization: Bearer` into a `TokenActor`; **no route reads a cookie or a header**, which is what makes D24's central refusal possible at all. A request carrying BOTH is `400 CREDENTIAL_AMBIGUOUS`, refused before either is read. `Actor` is a **discriminated union on `credential`**, so a route D24 reserves to a person calls `requireSession(request)` and a token gets `403 TOKEN_CREDENTIAL_REFUSED` — `/v1/me`, `/v1/fleet`, `POST /v1/projects` and all three token routes. **That is a `tsc` error rather than a remembered check only where the handler reads a session FIELD**: `POST /v1/projects` reads none, so its refusal is deliberate and measured (sitting 3, F10). **A token's authority is the token's, not its minter's**: `assertCapability` checks its scope first — any other project is the STRANGER's `404`, never `403`, so it is no more an enumeration oracle than a stranger — then its own capability set. **A token therefore outlives its minter's membership**; revoking the token is what stops it. `GET /v1/projects` answers a token exactly its one project, scoped in the route because no capability check runs there at all.
- **A SESSION-bearing mutation or stream upgrade must carry the console's `Origin`** (`403 CSRF_ORIGIN_REFUSED`) — **and a bearer request must not**, because CSRF is a browser attack and a token is not sent automatically by one. `assertSameOrigin` keys on the COOKIE (`carriesSession`), so it exempted a token with no change at all when the class was added. **Every mutation carries an `Idempotency-Key`** (D23.6); **every code a client can receive is in `api/error-codes.ts`**, held to the source in both directions.
- **A token is `mft_<id>_<secret>`, minted only in an interactive session, and its secret is returned exactly once** (D24, P5b Tasks 3–4). Only a SHA-256 of the secret is stored; the id is the row's, so verification is one indexed lookup. The mint response is the **one place in this API that returns a credential**, and the read schema has **no `secret` field at all** rather than an optional one. A mint is refused any of `PRIVILEGED` by name (`400 TOKEN_CAPABILITY_FORBIDDEN`), refused anything the minter does not hold themselves (`403`), and bounded at 365 days. **Every bad token — unknown, wrong secret, revoked, expired, malformed — gets the same `401`**, so a caller cannot enumerate ids or read the state of a credential they do not hold. Only the minter may revoke; everyone else gets the `404` a token id that does not exist gets.
- **§13's authorization is `projects/authz.ts`**: a stranger gets `404 NOT_FOUND`, a member without the capability `403 FORBIDDEN`. **`api/authz-contract.ts` covers every registered route and asserts each refusal's code — and since P5b Task 11 it runs NINE actors, not five**: the five people (`owner`, `collaborator`, `stranger`, `admin`, `anonymous`) and four agents (`token-capable`, `token-incapable`, `token-other-project`, `token-privileged`), 40 route cases, **361 tests**. `Expectation` is `'pass' | RefusalStatus | { status, code }` — the bare status still maps through `REFUSAL_CODE`, so no row written before that change moved, but a `403` that is `TOKEN_ACTION_PENDING` rather than `FORBIDDEN` must say so, and with the privileged rows asserting a bare `403` **nine cases pass while D24's loop cannot start**. **Completeness for the actor dimension is `tsc`**, not a runtime check: `Record<Actor, Expectation>` makes a row missing a token expectation a compile error. The deploy route has TWO rows — staging asserts `release:deploy` and production `release:promote`, which is the only place either the token rule or a collaborator's inability to promote is exercised. **D24's four privileged capabilities are named ONCE** as `PRIVILEGED` (P5b Task 2), which §20 requires be held to its own step-up list **by a test rather than a convention** — `projects/privileged.test.ts` is that test, and it names the four as literals so it cannot agree with the constant it checks. It is typed over `PrivilegedCapability = Capability | 'secret:read'`, a **superset**: `secret:read` is in D24's list and deliberately NOT a `Capability`, because no route reads a secret in Phase 1 and a capability nothing grants and nothing checks is the no-caller shape §9 names four times. **Promoting to production is its own capability, `release:promote`** — an owner and a platform admin hold it, a collaborator does not — **asserted by the deploy route when the environment's `kind` is production, and BEFORE §13's launch gate**, so a collaborator is refused without the project's readiness ever being consulted. `release:deploy` still covers sandbox and staging and is not privileged, which is what makes D24's rule statable at all.
- **D24's CENTRAL REFUSAL EXISTS, and it is two layers that cannot do each other's half** (P5b Task 6). `assertCapability`'s token branch runs **three checks in this order** — scope, then `isPrivileged(capability)`, then the token's own capability set — and the order is the security property: scope first so a token cannot learn another tenant's project exists, and the privileged rule **before** the token's own set because D24 says *"regardless of how it was minted"*. It throws `TokenCapabilityRefusedError`, which carries what was refused and nothing about the request; **the ONE wrapper in `api/contract/route.ts` that runs for every `/v1` route** is holding the request, so it records the `PendingAction` and answers `403 TOKEN_ACTION_PENDING` with that row `$ref`'d into the error envelope, so an agent can find the thing it must wait for (D23.7). **The catch is OUTSIDE `app.idempotent`**: caught inside, the 403 caches under `(key, userId, route)` and the confirmed retry — which reuses its `Idempotency-Key`, exactly as D23.6's own hint instructs — replays a cached refusal for ever, while every test minting a fresh key per request stays green. **The wrapper does not run for the event stream**, which `routes/events.ts` registers with `app.route` directly; that is harmless while the stream's only capability is `project:read`, and `mapError` fails closed with an operator line if it ever stops being. An identical ask **reuses its pending row** rather than filling a person's queue, matched on token, method, concrete path and a **key-sorted** SHA-256 of the body; **the body itself is never stored**, because a person reads that row on a screen.
- **AND A PERSON ANSWERS THE QUESTION, WHICH IS WHAT CLOSES D24'S LOOP** (P5b Task 7). `POST /v1/pending-actions/{id}/confirm` and `.../reject` are **interactive only** — a token confirming its own pending action would be a loop with no human in it — and the person answering must hold the capability **themselves**: a collaborator who may not manage members is `403 FORBIDDEN`, a stranger `404`. **Confirming does not replay the request.** It grants that EXACT request — this token, this method, this concrete path, this key-sorted body hash — **one retry**, which the agent makes itself through its normal route with its normal validation. The wrapper resolves the confirmed row and hands `assertCapability` a `grant`; the grant **returns** rather than falling through to the token's own capability set, because no token the platform can mint holds a privileged capability, and `consumed_at` is stamped **after** the handler resolves so a transient failure does not burn a person's decision. **"Exactly once" describes the ACTION, not the ANSWER**: the confirmed retry's `2xx` is stored under its `Idempotency-Key` and replays for ever without reaching the handler — not an escalation, and a reader who assumes otherwise mis-reads `consumed_at`. A retry after a rejection is `403 TOKEN_ACTION_REJECTED` carrying the person's own reason, so an agent stops rather than loops. **An expired question cannot be answered**, and an expired confirmation cannot be spent.
- **§26'S QUEUE IS A READ, AND THE TWO CREDENTIAL CLASSES SEE DIFFERENT SETS** (P5b Task 8). `GET /v1/projects/{projectId}/pending-actions` and `GET /v1/pending-actions/{pendingActionId}`. **A session that may read the project reads the PROJECT's queue** — it is `project:read`, so a collaborator watches it even though *answering* needs the capability the question is about — **and a token reads only the questions IT asked**, because a token's authority is its own and one agent enumerating another agent's requests is a read D24 grants nobody. The rule is stated ONCE, as `pendingActionsFor`'s `tokenId` parameter, and both routes apply it; a row the caller may not see is `404`, never `403`, for §13's enumeration reason. Every state is listed, not only `pending`, and **the body is never carried** — only `bodySha256`. `waitingSeconds` is computed by the platform (§26's headline number), from `createdAt` to `resolvedAt ?? now`.
- **A NEW PRIVILEGED ROUTE INHERITS D24'S REFUSAL WITHOUT DOING ANYTHING, AND THAT IS NOW MEASURED** (P5b Task 8). `DELETE /v1/projects/{projectId}/members/{userId}` is the first privileged route written after Task 6 made the rule central: it calls `assertCapability(…, 'members:manage')` and does nothing else about tokens, and an agent asking is answered `403 TOKEN_ACTION_PENDING` with a row a person confirms. **Assert that by CODE** — `403 FORBIDDEN` is also a `403`, and a status-only assertion passes against a route on which D24's loop cannot start. It answers **`200` with `MemberList`** (`SuccessStatus` is `200 | 201 | 202`; a bodyless response is machinery nothing yet needs), is **idempotent** — removing a non-member is not an error, because the caller can already read the membership, unlike `DELETE /v1/tokens/{tokenId}` where the `404` hides which ids exist — and **refuses the last owner** (`409 PROJECT_LAST_OWNER`), with the guard inside the DELETE's own predicate so two owners removing each other cannot both win.
- **A QUESTION NOBODY ANSWERS EXPIRES, AND THE DATABASE REFUSES A SECOND OPEN ASK** (§6, P5b Task 10). `tokens/expiry.ts`'s `expirePendingActions(db, now, scope?)` moves a `pending` row past its own `expiresAt` to `expired` and never touches one a person decided; `src/index.ts` calls it at boot beside `recoverAtBoot` and puts the count on the boot line, and **`boot.docker.test.ts` is the only test that fails if that caller goes** — the unit tier stays green, which is the whole risk of the task. **It is not the control that stops a lapsed question being answered**: `answerable` and `resolutionFor` both compare the TIMESTAMP, so a row the sweep has not reached is already unanswerable, and what the sweep fixes is the stored state §26's queue displays. **It does not run on a timer** — named in P5b's *What this plan does not build* — so a long-running process can show a stale `pending`. Migration **0018** adds a PARTIAL unique index over `(requested_by_token, method, path, bodySha256) WHERE state = 'pending'`, so five concurrent identical asks make ONE row (sitting 5's F10, which measured five); `recordPendingAction` tolerates the race with `onConflictDoNothing` and hands the loser the winner's row, and **only the caller that wrote the row publishes the event**. **The two halves depend on each other in one direction**: the index's predicate turns a stale `pending` row into a permanent block on the same question, so the sweep ALSO runs scoped to that one token immediately before the insert. `Token` carries a computed `expired`, and it is NOT `revokedAt !== null` — a clock and a person are different answers to why a credential stopped.
- **EVERY REQUEST A TOKEN MAKES IS RATE-LIMITED, FROM THE TOKEN'S OWN ROW** (§20, P5b Task 9). `delegated_tokens.rate_limit` is **requests a minute** (600 by default), and that unit is now in the published contract rather than nowhere. The limit is taken in the ONE `onRequest` hook — **after** the token is verified, so nobody can exhaust a real token's window by sending its id with a wrong secret, and **before** any route, so none can forget it — and `RATE_LIMITED` is therefore in `EVERY_ROUTE` in `api/contract/document.ts`, not on each route's `errors:`. **A session is deliberately NOT limited**; `GET /v1/slugs/{slug}` keeps its own per-user limiter (P5a Task 9), a different control with the same code. `createRateLimiter` is one line over `createKeyedRateLimiter`, whose `take(key, limit)` reads the limit per call — one window implementation, two surfaces.

- **Every test of the token refusal writes its token STRAIGHT TO THE STORE holding a privileged capability, and that is not a state a real token is ever in.** The mint route refuses one, so the only realistic token is one minted **without** it — and P5b sitting 4 measured that all 31 tests that existed stayed green through a reordering that answers every real token a dead-end `403 FORBIDDEN` and stops D24's loop from ever starting. **When a fixture can write a row no route would, check which of the two states your control is actually in.**
- **The stream carries EITHER credential class, and the client could not until P5b Task 12.** `subscribe`'s `SubscribeOptions` had only `session`, so an agent could start a build through the generated client and had nothing to watch it end on — while the route had accepted a bearer all along, because the upgrade authorizes `project:read` like any other read. A token subscription sends the bearer and **no `Origin`**, for the reason `createManifestClient` states: `assertSameOrigin` returns early unless the request carries the session cookie, and claiming the console's origin from an agent would say something untrue. Passing both is refused in the client, where the mistake is — on an upgrade a `400 CREDENTIAL_AMBIGUOUS` reaches a WebSocket client as close 1006 and no status.
- **One event stream per project**, `WS /v1/projects/:projectId/events`, authorized before it upgrades — **and in the contract** (P5a Task 12): `openapi.json` documents it as `streamProjectEvents` with `x-manifest-websocket`, every frame is a `StreamFrame`, and `@manifest/contract`'s `subscribe` opens it. **Every event type's `machineDetail` is a strict schema in `observability/event-schemas.ts`, and `recordEvent` refuses a detail that is not its type's** (`EVENT_DETAIL_INVALID`, naming the path) — the same schemas are the document's `EventFrame`, so a key a call site adds without adding it there is refused, not streamed. **A new event type is now four edits**: `EVENT_TYPES`, the database CHECK (a migration), `EVENT_DETAIL_SCHEMAS` and `observability/testing.ts`'s `EXAMPLE_DETAILS`. `api/stream-contract.test.ts` parses every frame a whole delivery lifecycle publishes and replays.
- **§13's first-launch checklist is COMPUTED, never stored** (P5a Task 15): `launch/readiness.ts` builds it from what the project has — the domain, IAM registration, the privacy assessment, the rehearsal, scans, admin approval, and a load rehearsal only for a `large_course` or `public` audience. **Scans is the one item P5a computes**; every other says `not_built` and names the plan that builds it, and `ready` is `false` throughout Phase 1, honestly. `GET /v1/projects/{projectId}/launch-readiness` answers it and the production deploy's `409` carries **the same bytes** — `mapError` parses the checklist through its representation, because zod emits an object's keys in SCHEMA order and a hand-built body does not (sitting 11 finding 1). `api/errors.ts`'s `ErrorEnvelope` now DERIVES from `api/representations/errors.ts`'s schema instead of restating it.
- **The first administrator is made out of band, and role changes are audited** (§20, P5a Task 16). `scripts/admin-grant.sh grant|revoke <puid> "<reason>"` runs one transaction as the database OWNER inside the Postgres container: no control-plane route changes a platform role and no delegated token ever will (D24). It refuses a person who has never signed in and an empty reason, records nothing for a no-op, and appends to **`audit.role_changes`** (migration 0013, append-only by grant). **A session carries the role it was issued with, so the change reaches a person when they SIGN IN AGAIN.** The IdP's third test user, `operator` / `operator` (`opr000001`), is the one `make demo-journey` promotes. **`GET /v1/fleet` is §26's fleet, administrators only** — `403` for everyone else, not `404`: there is no tenant's resource to hide.
- **One slug function, `checkSlug`**, answers `GET /v1/slugs/{slug}` and project creation with the same code, message and hint.
- **A build answers `202` and ends on the stream** (Rich's R6, P5a Task 13): `POST /v1/projects/{projectId}/builds` records the build and `build.started` and returns it `running`; a `BuildRunner` built at boot — the control plane's second background work, after the retirer — runs it, and `build.succeeded` or `build.failed` says how it ended. **`recoverAtBoot`'s pass 0 fails every `pending` or `running` build** with `BUILD_INTERRUPTED` and publishes it, so ONE control plane runs against a database. A replayed `Idempotency-Key` answers the recorded `202` and starts nothing; `GET /v1/builds/{buildId}` has the present state, and `GET /v1/projects/{projectId}/builds` the newest 50.
- **A blueprint is read whole at load, and a broken one refuses the boot, naming its file** (P5a Task 10): `loadBlueprints` reads each `skeleton/`, starter and knowledge pack as bounded UTF-8 text, and refuses a starter whose `manifest.yaml` fails §7, pins another blueprint, or asks for what its blueprint cannot deliver. **The proof app is `node-ts-mongo@1`'s first starter**, `blueprints/node-ts-mongo/starters/proof-app/` — it was `fixtures/proof-app/`. `GET /v1/blueprints` never carries the base image or build internals.
- **A project is created in ONE order** (P5a Decision 29, Task 11): blueprint and starter exist → `checkSlug` → the seed rendered (skeleton, the starter over it, the manifest's `name` spliced to the slug byte for byte) and the model catalogue read only if it declares a model → project, owner and three environments in one transaction → the repository, **and the project deleted if that fails** → the spec validated and stored → `project.created`, `repository.seeded`, `spec.validated`, **last**, because `audit.events` RESTRICTs the delete. `audience` is required (§24).

### What it deliberately does not do yet

Each is named in its plan's *What this plan does not build*, and none is an accident:

- **A sign-in under way at the IdP when a route moves fails once** — `passport-ubcshib` 0.1.6 drops passport-saml's `cacheProvider`, so the request id lives in the old container. Rich: tolerate it. *(P4c.)*
- **An edge configuration reload can reset about one request in 300 per admin change** (P4c R1), and **closes every app's proxied WebSocket** — only the console sets `stream_close_delay` (§8).
- **Two releases share one database for up to two minutes** during a redeploy — a knowledge-pack rule, checked by nothing. *(P4c R8.)*
- **An AI app whose gateway vanishes under a pooled connection makes a person wait 611 s** — the toolkit exposes no timeout. *(P4b finding 181.)*
- **Nothing notices an edge restart while the control plane runs** — that is Phase 4's reconciler; restart the control plane after `docker restart manifest-caddy` or `pnpm test:docker`.
- **§10's per-user AI budget is validated, not enforced**, in Phase 1.
- **`egress.allow` may still name a platform surface** — decided in §12, enforced by nothing until the roadmap's tracked hardening item.
- **A `POST /v1/projects` for a slug whose repository outlived its project answers `SOURCE_GIT_FAILED` with git's raw output, host path included** — `pnpm test` and `make reset` leave `.manifest/repos` behind. Since P5a Task 11 it leaves no project; the demos and the journey clear their OWN slug's orphan first (`clear_orphan_repository`). A distinct code, and a message without the path, are not built. *(P4b finding 178's other half.)*
- **An app accepts an UNSIGNED `LogoutRequest`** — passport-saml 3.2.4 checks a signature only when one is present — so a crafted link can sign somebody out of an app; the plain `GET` of `auth.logout` already could. **`make up` does not re-bind the IdP's single-file config mounts** after a `git pull` or `git checkout` replaces `config.php` or `authsources.php` (§4). Both named, not fixed.
- **THE CONSOLE EXISTS AND IS SERVED, and as of P5c sitting 6 (2026-09-19) §22 STEPS 1 TO 5 AND 7 ARE CLICKABLE, AND STEP 6 AS FAR AS THE SIGN-IN — sign in, create a project, watch its stream, build it and read the log as it is written, release it, deploy it to staging, open the running app and sign in INSIDE it. **Step 6's *write a note; ask the LLM* is NOT part of this**; it is `make demo-ai`'s and Task 14's.** **Sitting 6 added §22 step 7 — §13's first-launch checklist with every item's state, reason, owner and the plan that builds it — §26's fleet for an administrator, and D24's delegated tokens minted once, listed and revoked.** What it still does not have is **§26's queue (Task 11)**, which is the last screen: confirming and rejecting an agent's question are still `curl`. *The paragraph below was written at sitting 3 and its first sentence is kept because the rest of it is still true.* `https://console.manifest.internal` is a `reverse_proxy` to a host process on 7104 (§21's inventory) for every path that is not `/v1/*` or `/auth/*`; the placeholder `respond` is gone. **What a person could do at sitting 3 was sign in with CWL and see who the platform thinks they are** — name, PUID, email and platform role, from `GET /v1/me`. `/fleet` and the project's `queue` and `tokens` tabs still render *"the `<name>` screen is built by a later task of P5c"*. **Nothing starts it for you**: `vite dev`/`vite preview` on 7104 is a developer's host process, `make up` does not run it, and with 7104 free the origin answers **502** — which `make doctor` and `make verify` both tolerate by design (sitting 3, F3). **No production deploy, no custom domain.** **Delegated tokens are BUILT** (P5b, executed 2026-09-18): a token is minted, listed and revoked in an interactive session, an agent holding one authenticates with it scoped to one project and one capability set, D24's privileged four are refused centrally with a `PendingAction` a person confirms or rejects, a confirmation grants that exact request one retry, §26's queue is readable, every request a token makes is rate-limited from its own row, a question nobody answers is swept to `expired` and a second open ask for the same one is refused by the database, and §16's matrix asserts all of it across four token actors. **`make demo-token` runs the whole loop end to end through the edge** and is step 9 of the offline acceptance. **What is NOT built is a person operating that loop**: confirming and rejecting are `curl` until P5c's Task 11 makes them a screen. A project owner cannot revoke a collaborator's token — only the minter can.
- **NOTHING SWEEPS PENDING ACTIONS ON A TIMER** (P5b Task 10). The sweep runs at boot and, scoped to one token, before a new question is recorded — which is what the partial unique index needs. So a control plane up for a week can show §26's queue a `pending` row whose life ran out days ago. **A display staleness, not a refusal one**: `answerable` refuses a lapsed row `409 PENDING_ACTION_RESOLVED` on the timestamp, so the lie self-corrects the moment anybody acts on it. **P5c HAS NOW DECIDED IT, AND THE ANSWER IS NO** (its Decision 8, 2026-09-18): `PendingAction.expiresAt` is in the representation, so the queue SCREEN renders a lapsed question as lapsed — with no confirm button — from the timestamp rather than from the stored state, and a timer would be a third piece of background work to correct a display that can correct itself. **Decided in the plan, not yet built**; P5c Task 11 carries the control.

**Which spec sections matter, by topic:** §7 the `manifest.yaml` contract · §9 identity ·
§10 AI access · §11 execution model and the `Driver` interface · §12 networking,
secrets, the builder, supply chain · §13 releases · §16 testing tiers · §20 security
architecture · §21 local topology · §22 the public API · §23 hostnames · §25
blueprints. Decisions are **D1–D32** in §4; constraints **C1–C6** in §3.

---

## 4. The machine, and what it will do to you

**This section is the one that saves you a morning.** Every item was paid for by a
spike. It was previously stranded inside a superseded handoff; it lives here now.

### Laravel Valet owns things you will want

- **Valet owns the `.test` TLD, port 53, and ports 80 and 443.** A Homebrew dnsmasq
  2.91 runs as `nobody` on `127.0.0.1:53` answering `address=/.test/127.0.0.1`, and
  the nginx on 80/443 is Valet's. **Never touch any of it** — Rich needs it, and
  other UBC developers run it too.
- **This is why the zone is `*.manifest.internal`**, not `*.manifest.test`. ICANN
  reserved `.internal` in July 2024 for exactly this.
- **The resolver file is scoped to `manifest.internal`, never all of `.internal`** —
  Docker's own `host.docker.internal` lives in that TLD.
- **Caddy binds `127.0.0.2`**, a loopback alias, so Valet keeps `127.0.0.1:443`. The
  alias **does not survive a reboot**; `can't assign requested address` means it is
  gone. **`make up` re-adds it, and that is not always enough** (measured 2026-09-14):
  starting Docker Desktop restarts `manifest-caddy` itself before `make up` can add the
  alias, the port forward fails, and Docker never retries it. The container reports
  healthy from inside, so `make up` and `make doctor` both pass; `make verify` fails
  every host→edge check while every container→edge check passes.
  `docker restart manifest-caddy` fixes it. RUNBOOK's *Known gaps* has the detail.

### The toolchain, and what executing P2 put on this machine

- **Node is 24, not 22.** nvm has only `v24.12.0`; there is no Node 22 on this
  machine. P2's plan originally pinned 22 for no reason that survived checking — the
  spec names no Node version, no spike treated it as a variable, and the only evidence
  was `passport-ubcshib`'s `">=22.0.0"`, which is a floor. **Repinned to 24**
  (2026-08-31, Rich's call). Nothing was tried on 24 and found wanting.
- **The app-side base image is still `node:22-alpine`** and is a *separate* decision:
  it is what faculty apps run in, S1 recorded its digest and mirrored it into the
  local registry, and P1 references it in three places including the offline test.
- **`pnpm` was added via `corepack enable pnpm`** — pnpm 11.24.0, a shim in
  `~/.nvm/versions/node/v24.12.0/bin/`. User-owned, **no `sudo`**, reversible with
  `corepack disable pnpm`. This is the only host change P2's execution made.
- **pnpm 11 blocks dependency install scripts by default**, as a hard error, so
  `pnpm test` will not run until they are allowed. The key is `allowBuilds` in
  `pnpm-workspace.yaml`; pnpm 10's `onlyBuiltDependencies` is still *read back* by
  `pnpm config get` but has no effect, which makes hand-writing it look like a
  mystery. Use `pnpm approve-builds <pkg>`.

### What is a container, and what is actually on this machine

**Almost nothing Manifest runs is installed on the Mac.** This is worth stating
plainly because every list of "absent" images in this project reads like a missing
dependency and is not one. §21's inventory is the authority; this is its summary.

**Host-resident, and only these:**

| | Why it cannot be a container |
|---|---|
| **Ollama** | Metal GPU access is unavailable from a container |
| **The control plane** (Node, 7100) | It needs the Docker socket, which §12 forbids mounting into *workload* containers. Running it on the host sidesteps the question and iterates faster. It **cannot reach container IPs** on Docker Desktop (S1), so health checks go through the edge or a published port |
| **Admin UI (7101), `manifest-mock` (7102), reference console (7104)** | Vite dev servers |

**Everything else is a container**: Caddy, Postgres, the registry, Verdaccio,
LiteLLM, the Manifest IdP, both dnsmasq processes, the egress proxy, the builder, and
the Syft/Grype scanners. So:

- **Caddy is never `brew install`ed.** It is a **custom `xcaddy` build** (§20), because
  S7 established that **Coraza pins the Caddy version**. `make seed` builds that image.
  `caddy: ABSENT` from a host-tool check means nothing at all.
- **Syft and Grype are transient per build** (§21: *"Scanner + SBOM — transient, per
  build"*). P3 Task 12 runs each as a throwaway container against the Docker socket.
- **The Manifest IdP is ours and is built from scratch** — `infra/idp/Dockerfile`,
  `FROM php:8.3-apache` plus `composer create-project simplesamlphp/simplesamlphp:^2.0`,
  its own `manifest_idp` database, on **port 7122 deliberately not 6122**. It has **no
  dependency on `/Users/rich/Developer/docker-simple-saml`** running, or existing.
  That repository is read-only to us and stays clean; what S2 took from it was
  knowledge — `pdo_pgsql` needs `libpq-dev`, `database.*` and `store.sql.*` are
  different subsystems, one `INSERT` into `saml20_sp_remote` registers an SP — not code.

**The images `make seed` must therefore fetch or build include** `caddy:2.11.4` and
its builder, `anchore/syft`, `anchore/grype`, `php:8.3-apache` and `composer:2` —
none of which are on this machine today. Seed is the one step that needs the network,
which is why P1's **offline** acceptance can only run after a successful seed.

### Rules of engagement

- **`sudo` cannot prompt from a tool call.** You get
  `sudo: a terminal is required to read the password`. Bundle privileged steps into
  one script and ask Rich to run `! sudo bash <path>` in his terminal. **Ask before
  anything needing `sudo`** — standing instruction.
- **The machine must end up exactly as it started.** Snapshot before you change
  anything. Every spike has met this bar and Rich has confirmed each teardown.
- **Pre-existing containers that must survive**: `docker-simple-saml-saml-idp-1`,
  `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **The Bash tool's shell is zsh, and zsh ties `path` to `$PATH`.** A loop written
  `for path in /v1/models /key/info` empties `$PATH` for the rest of the command, so
  `docker`, `curl` and `python3` all become *command not found* partway through —
  measured 2026-09-14, when it leaked a LiteLLM key minted before the loop. Name loop
  variables anything else.
- **Work on a copy.** `docker-simple-saml` and `ubc-genai-toolkit` are read-only to
  you unless told otherwise; both are currently clean and must stay that way.
- **`git checkout <path>` restores from the INDEX, so on an uncommitted file it destroys
  your work, not your experiment.** Measured 2026-09-15: reverting one three-line negative
  control in `runtime/docker/driver.ts` reverted all 200 lines of the task with it, because
  the task had not been committed. **Commit the task BEFORE breaking anything to watch a
  control fail** — the restore is then exact, and `git status` proves it.

### Numbers

- Ports in use by other things: **6122** (`docker-simple-saml`), **27017** (mongodb),
  **6333/6334** (qdrant), **8081** (mongo-express), **11434** (Ollama), plus 80/443/53.
  The **7100–7199** block was entirely free.
- Docker VM memory is **8.32 GB decimal / 7.75 GiB binary** — passes or fails §21's
  "≥8 GB" floor *depending on the unit*, which is why the spec now states the unit.
- Host: 36 GiB RAM, 12 cores, ~163 GiB free. **macOS 26.6.2 (build 25G83)** — the
  machine was updated; §4 said 26.5.2 until 2026-09-04. arm64, Docker Engine 29.7.2,
  which serves **API 1.55, minimum 1.40** (so P3's deliberate `v1.44` pin is inside
  the window).
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`,
  no `xargs -r`, no `readlink -f`. A script that needs Homebrew bash 5 is a C1 defect.

### Things that will cost you a morning

- **A `REVOKE` against a SUPERUSER is a no-op that reads exactly like a control.**
  `manifest` is `POSTGRES_USER`, so Postgres created it as a superuser and it bypasses
  every privilege check: measured 2026-09-09, `REVOKE UPDATE, DELETE ON t FROM manifest`
  → `REVOKE`, then `UPDATE 1`, `DELETE 1`. The control plane therefore connects as
  **`manifest_app`** (`infra/lib/ensure-app-role.sh`, run by `make up`), and so does
  `pnpm test` — a grant is only observable from the role it constrains. **The README's
  export block now has THREE database URLs**: the app's, `MANIFEST_ADMIN_DATABASE_URL`
  for `db:migrate` and the harness's `TRUNCATE`, and the IdP's.
- **A foreign key's `ON DELETE CASCADE` runs with the REFERENCED table's privileges**,
  not the caller's — so it walks straight through a grant on the referencing table. With
  `audit.events` correctly refusing `UPDATE`, `DELETE` and `TRUNCATE`, deleting the
  project removed its audit rows anyway. `audit.events` is `ON DELETE RESTRICT`.
- **`--local=/manifest.internal/` is mandatory** on dnsmasq. Without it AAAA returns
  **SERVFAIL** instead of NODATA, and both musl and glibc treat SERVFAIL on either
  half of a dual-stack lookup as total failure. The symptom is
  `curl: (6) Could not resolve host` **while `dig +short` returns the correct A
  record.** The single most misleading failure in the project so far.
- **`--server=127.0.0.11` is mandatory.** Without it `--no-resolv` makes dnsmasq
  authoritative for everything and containers lose Docker service names *and*
  external resolution.
- **`--address` is global to a dnsmasq *process*.** Verified. That is why there are
  two dnsmasq containers rather than one with two listeners.
- **On Docker Desktop, `--dns` sets the *upstream*** for Docker's embedded resolver
  rather than replacing it. `/etc/resolv.conf` still says `nameserver 127.0.0.11`.
  Good news — service names survive. Do not conclude `--dns` is ignored.
- **Caddy admin API: `PUT` inserts, `POST` appends** — and appending puts your route
  behind the wildcard whose `terminal: true` swallows it.
- **A host process cannot reach container IPs** on Docker Desktop, so health checks
  go through the edge or a published port.
- **`localhost` resolves to `::1` and times out** in build tooling. Use `127.0.0.1`.
- **Restarting Caddy discards all runtime routes.** Route *changes* under load are
  safe: 0 failures in 400 requests across 12 add/remove cycles.
- **User-namespace remapping silently does nothing** on Docker Desktop. Every other
  §12 hardening flag genuinely enforces.
- **LiteLLM serves admin and proxy traffic on ONE port.** There is no admin port to
  firewall; confinement is per-key `allowed_routes`.
- **A LiteLLM key minted with `models: []` reaches EVERY model, not none.** Measured
  2026-09-14 on 1.98.0: it listed all three catalogue entries and embedded with a model it was
  never given, while the same key with `['default-chat']` was refused the other with 403.
  `ai/keys.ts` refuses an empty list.
- **`make up` does not apply an edit to `infra/litellm/config.yaml`.** It is a single-file
  `:ro` bind mount LiteLLM reads once at start, and compose sees no service change — the shape
  the Caddyfile had. `docker restart manifest-litellm` applies it, in ~10 s. Measured 2026-09-14.
- **`/key/delete` accepts the hashed `token` that `/user/info` reports**, so a key nobody saw —
  one `/user/new` auto-created — can still be removed. Measured 2026-09-14.
- **LiteLLM checks a key when a request STARTS.** A streaming completion whose key was deleted 7 s
  in ran on to a normal finish — 961 of its 1,003 characters after the delete — while a new request
  with that key got 401. Measured 2026-09-14 on 1.98.0. Revoking a key cannot cut off a stream
  already under way; it only refuses the next request.
- **Most Ollama models on this machine are *thinking* models**, and that breaks
  streaming silently: zero content frames, no error, at any token budget.
- **`node src/index.ts` does not work here**, even though Node 24 strips TypeScript
  types natively. The source uses NodeNext `.js` specifiers and Node resolves them
  **literally**, so it looks for `src/api/index.js` and does not find it. Compile
  with `tsc` and run `dist/index.js`. `pnpm --filter @manifest/control-plane dev`
  does both.
- **`pnpm test` and `pnpm --filter … test` are not the same command.** The filtered
  form runs with the *package* directory as its working directory; the root form does
  not. Any cwd-relative path in a test passes under one and `ENOENT`s under the other.
  **`pnpm test` from the repo root is the one that counts** — it is what CLAUDE.md
  requires before a commit.
- **`node --experimental-strip-types` cannot run this repo's TypeScript either**, and
  for a *different* reason from the one above: strip-only mode rejects **parameter
  properties**, and `EngineError`, `ScanError`, `BuildGateError` and `ConfigError` all
  use them — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. So a throwaway `node -e` script that
  imports a `.ts` file to poke at it does not work. Write a scratch **test** instead,
  or drive the thing through `docker`/`curl` directly.
- **A `sed`/`python .replace()` negative control silently matches nothing after
  Prettier has reformatted its target — and every test then passes.** That reads as
  *"the control cannot fail"* and means *"the control never ran"*; it happened on
  2026-09-06 while proving a scan rule, and it is the same shape as every other
  could-not-fail check this project has paid for. **Assert the pattern matched before
  writing the file.** A `git diff` after the edit is the other cheap proof.
- **Vitest strips types; it does not check them.** A file can pass every one of its
  tests and have four `tsc` errors. `pnpm typecheck` (every package — P5a Task 7)
  is the only gate that sees them, and this repo's `exactOptionalPropertyTypes` makes
  that class common: `hint: cond ? x : undefined` is a type error, conditional spread
  is the fix.
- **`fileParallelism` is a ROOT-level Vitest option.** Setting it in a package's
  `vitest.config.ts` has no effect on a workspace run, and the symptom is a suite that
  fails a *different* number of tests on each run.
- **A shell PIPELINE takes its exit status from the LAST command**, so
  `git archive … | tar -x` reports success when `git` dies. Measured 2026-09-07:
  `git --git-dir=file://… archive HEAD` exits **128** and the pipeline exits **0**,
  which made every failed build-context export produce an empty directory and a
  clean bill of health. `set -o pipefail` is not available in `execFile('sh', …)`
  by default — run the two commands separately.
- **BusyBox `wget` honours `http_proxy` and does not support `NO_PROXY` at all.**
  On BusyBox v1.37.0 a container health check of its own `127.0.0.1` is sent to the
  egress proxy and comes back `403 Filtered`. `wget -Y off` is the switch. This
  silently marked every deployed app `unhealthy` while it was serving perfectly.
- **`request.log.error` under `Fastify({ logger: false })` writes nothing** — it
  exists and accepts the call. Same trap as `app.log.info` on the boot line. Use
  `console.error` for anything an operator must be able to see.
- **An unqualified image name is DOCKER HUB to the daemon.** `local/chem-labs@sha…`
  resolves as `docker.io/local/chem-labs` and 401s. Record the repository the build
  produced; never re-derive it from a slug.
- **`docker network rm` fails while ANY container is still attached**, and the app
  networks always have two: `ensureAppNetwork` attaches `manifest-caddy` and
  `manifest-dns-containers` to every one of them by design. `make reset` only worked
  because `compose down` ran first and stopped them — correctness by accident of
  ordering, with `|| true` hiding the failure. It now disconnects them explicitly.
  Measured 2026-09-07: five app networks survived a cleanup that reported success.
- **`docker rm` without `-v` orphans the container's anonymous volumes**, and
  `mongodb/mongodb-community-server` declares **two** volumes while the driver binds
  only `/data/db`. `moby/buildkit` likewise declares one the ephemeral builder does
  not bind — harmless while the process lives, because the driver deletes with
  `v=true` in a `finally`, but one empty volume per build leaks if the control plane
  is killed mid-build. **`docker volume ls -f dangling=true` is NOT a safe prune
  list**: it includes *named* volumes that merely have no container attached, so it
  lists `manifest-caddy-data` — the trusted CA — and other people's volumes. List and
  date them, then remove by id.
- **`registry garbage-collect` on a RUNNING registry corrupts it.** It deletes the
  manifest blob and leaves the tag and revision links, after which every `docker
  push` of the same content reports success **with the correct digest** while the
  registry answers 404. Stop or restart the registry around a GC.
- **This `registry:2` does not split a comma-joined `Accept` header**, and mirrored
  base images are **OCI** manifests. Pass separate `-H 'Accept: …'` flags including
  `application/vnd.oci.image.manifest.v1+json`, or you get a 404 that reads exactly
  like a missing image: `OCI manifest found, but accept header does not support OCI
  manifests`.
- **npm's `replace-registry-host` defaults to `npmjs`**, so a mirror redirect only
  applies to lockfiles whose `resolved` URLs name registry.npmjs.org. Any other host
  is fetched directly, past the mirror. `replace-registry-host=always` is what D13
  actually means.
- **`pnpm test` TRUNCATES the control plane's §6 tables** — `vitest.global-setup.ts`
  does it once per run, deliberately, so a run never inherits the last one's rows.
  It also means running the suite wipes whatever `make demo` created. **So does ONE file**:
  `pnpm exec vitest run --project unit <file>` runs the same `globalSetup`, and measured
  2026-09-16 (P5a sitting 1) it emptied `projects`, `users`, `instances`, `routes` and `secrets`
  for a test that touches no database — which would have failed the next measurement, a sign-in
  that needed the demo's project. Run anything that needs a demo's rows BEFORE any Vitest run.
- **The Manifest IdP could not issue an assertion, and `make verify` was 34/0.**
  Measured 2026-09-07: the image ships only `saml20-idp-hosted.php.dist` and an empty
  `cert/`, so `/module.php/saml/idp/metadata` answered **500** —
  *"Could not find any default metadata entities in set [saml20-idp-hosted]"*. Verify
  checked that the IdP served a page, that `pdo_pgsql` was present and that a row
  round-tripped through the metadata handler; none of that touches signing. **P4a
  Task 1 fixes it.** The general lesson is the one this project keeps re-learning: a
  check that does not complete the operation proves the operation can start.
- **SimpleSAMLphp 2.x's endpoint paths are not 1.x's, and `passport-ubcshib`
  hardcodes 1.x's.** `UBC_CONFIG.LOCAL` carries
  `/simplesaml/saml2/idp/SSOService.php`; 2.x serves
  `/module.php/saml/idp/singleSignOnService`, `…/singleLogout` and `…/metadata`
  (read off the running container's `routes.yml`). This is why §8 makes
  `SAML_ENTRY_POINT` mandatory, and a 404 from the IdP reads as "the IdP is down".
- **SimpleSAMLphp validates any AuthnRequest signature that is PRESENT**, whether or
  not the SP's row says `validate.authnrequest`. So an app that signs and a row with no
  `certData` is refused with *"Missing certificate in metadata"* — which reads as a
  missing registration rather than a missing key — and, the other way round, the
  `validate.authnrequest` flag can be deleted without any wrong-key test noticing. Only
  an SP that does **not** sign can show that flag doing anything. Measured 2026-09-09.
- **The IdP's error page never says why.** `showerrors` is off, as it must be on a
  deployed IdP, so an uncaught exception renders as "Unhandled exception" and the reason
  exists only in the container log. A *titled* error (metadata not found, invalid
  certificate signature) does put its title in `<title>`, which is why some assertions
  against the page body work and others silently cannot. Read `docker logs manifest-idp`
  — and count occurrences before and after, or a line from an earlier run stands in for
  a refusal that never happened.
- **`core:AttributeLimit` is not in SimpleSAMLphp's default chain**, so a metadata
  row's `attributes` list is advisory — S2 measured three declared and thirteen
  released. An empty list is also treated as "no limit". Both fail **open**, silently,
  and both were live here until P4a Task 2.
- **The OpenAI SDK cannot be forced through an HTTP proxy by any environment setting.**
  Measured 2026-09-07 against three mechanisms: `http_proxy` is ignored; undici's
  `setGlobalDispatcher(new ProxyAgent(…))` fixes global `fetch` and **not** the SDK;
  a patched `http.globalAgent` is bypassed too. The SDK bundles `node-fetch` and
  supplies its own `agentkeepalive` agent, and its only supported override is the
  `httpAgent` constructor option — which `ubc-genai-toolkit-llm` does not expose.
  So an app on an `--internal` network cannot reach LiteLLM through the egress proxy.
- **Fastify runs root-level hooks for the not-found handler too**, and an unmatched
  route has no `routeOptions.config` to opt out with. A `preHandler` that throws will
  turn every 404 into whatever it throws. Guard on
  `request.routeOptions.url === undefined`.

- **SimpleSAMLphp 2.x enables only `core`, `admin` and `saml`.** Every D6 test user is
  defined with `exampleauth:UserPass`, so until 2026-09-08 every SSO request answered
  **500** — *"The module 'exampleauth' is not enabled"* — while `make verify` said
  43/0. `config.php` must `array_merge` into the dist's `module.enable`, never replace
  it, or `core`, `admin` and `saml` go with it.
- **`config.php.dist` already ships `50 => core:AttributeLimit`**, and our `config.php`
  merges *over* the dist, so the filter has been live since P1. What was missing was
  the OID map. A plan that says otherwise was written against the file we wrote rather
  than the file that runs.
- **`core:AttributeLimit` compares the SP row's list against the attribute KEYS as
  they stand at its priority.** Measured, all four combinations: auth source emitting
  OIDs + a row declaring friendly names releases **nothing**; friendly + friendly
  releases the two declared; OID + OID also works; and an **empty or absent** list
  releases **everything**. That last one is S2's fail-open and is why there is a
  `CHECK` constraint.
- **`jsonb_array_length(NULL)` is NULL and `NULL > 0` is NULL — which a CHECK
  ACCEPTS.** A constraint written without `COALESCE` rejects `"attributes": []` and
  waves through a row with no `attributes` key at all, and AttributeLimit treats those
  two identically.
- **`bin/initMDSPdo.php` issues `CREATE TABLE` through `database.*`** — the same
  credentials the request path reads metadata with. Making that user read-only makes
  the container restart-loop on `permission denied for schema public`. `SSP_DB_INIT`
  scopes the owning role to that one command.
- **`make up` could not apply a Caddyfile edit.** The file is bind-mounted and read
  once at container start, and compose sees no service change when only content
  changed. `infra/lib/ensure-caddy-config.sh` now reloads the edge, **conditional on a
  hash** kept in the edge's own volume — `caddy reload` replaces the whole config and
  an unconditional reload would drop the driver's runtime routes on every `make up`.
- **`mv`-ing a bind-mounted DIRECTORY leaves the running container on the old inode.**
  A negative control that moves one aside and runs `make up` changes nothing; the
  container has to be force-recreated. Commenting the mount out of `compose.yaml`
  *does* work, because that changes the service definition.
- **The container rootfs is READ-ONLY (§12), and the daemon refuses to write into it**
  — `container rootfs is marked read-only`. A **volume** path on the same container is
  accepted, and `:ro` on that volume is refused too (`mounted volume is marked
  read-only`). That is why `InstanceSpec.files` is backed by a per-instance volume at
  `/manifest`, mounted read-write, with **file ownership** carrying the protection.
- **`CapDrop: ALL` takes `CAP_DAC_OVERRIDE` with it, so root inside a container cannot
  read past permission bits.** Measured 2026-09-08: a `0400` file owned by uid 10001
  was unreadable by root — `stat` fine, `cat` silent. Anything the app must read has to
  be reachable by ownership or group, never by privilege.
- **`destroyInstance` takes the CONTAINER name (`appContainer(instanceName(…))`), not
  the instance name.** Passing the wrong one destroys nothing, and `ensureInstance` is
  idempotent by name — so a stale container survives and every later run silently
  redeploys nothing and tests the first image it ever built.
- **`passport-ubcshib` exports `Strategy`, not `UBCStrategy`.** It is CommonJS ending
  `module.exports = { Strategy: UBCStrategy, … }`, so a named import is `undefined` and
  `new undefined(...)` throws at construction.
- **`AuthState` comes out of an HTML attribute and carries a query string**, so it
  arrives with `&amp;`. Posting it undecoded means SimpleSAMLphp cannot match the
  pending authentication and the SAML flow loops rather than failing.
- **`passport-saml` is npm-DEPRECATED and carries a critical signature-verification
  advisory (GHSA-4mxg-3p6v-xgq3) at range `*`**, with `@xmldom/xmldom@0.7.13`
  underneath it. `@node-saml/passport-saml@5.1.0` audits clean. §12's scan gate now
  blocks only on findings that **have a published fix** (Rich, 2026-09-08) — and it
  still has teeth: the xmldom highs blocked until an npm `override` to 0.8.15.
- **Two libsodium seals of one value differ even when the data key is SHARED**, so
  "the ciphertext differs" proves nothing about per-secret keys. The nonce is random
  and `crypto_box_seal` draws an ephemeral keypair per call, so both `ciphertext` and
  `wrappedKey` change either way. Measured 2026-09-08 by hoisting the data key out of
  `sealSecret`: the test written to catch exactly that stayed green. The observable
  consequence of reuse is that one envelope's wrapped key opens **another's**
  ciphertext — assert that instead.
- **An APPLIED drizzle migration is never re-run**, because `drizzle/meta/_journal.json`
  records it by tag. Editing a migration file that has already run changes nothing on
  any existing database and everything on a fresh one, so the two diverge silently.
  New SQL needs a new migration. `drizzle-kit generate` also names the file itself, so
  a plan naming `0001_something.sql` is naming a file that will not exist.
- **`drizzle-kit migrate` needs `MANIFEST_DATABASE_URL` exported**, which `.env` does
  NOT contain — `.env` carries `POSTGRES_PASSWORD` and the URL is derived from it
  (`vitest.env.ts` does this for tests). README's *Running the control plane* has the
  two-line export; without it the failure is `Please provide required params for
  Postgres driver: [x] url: undefined`, which reads like a broken config file.
- **macOS `openssl` cannot emit a raw X25519 key**, and libsodium wants the bare 32
  bytes. `openssl pkey -outform DER | tail -c 32` works for both halves because RFC 8410
  fixes the prefix lengths (48 DER bytes private, 44 public). **Length proves nothing
  about correctness** — a wrong extraction still yields 32 bytes — so seal and open with
  the file's own two halves before trusting it. `infra/lib/ensure-master-key.sh` does it
  this way and it was verified against libsodium on 2026-09-08.
- **Verdaccio caches a tarball when it is DOWNLOADED.** `npm install
  --package-lock-only` resolves metadata and downloads nothing, so a warm step that
  uses it leaves the mirror holding package documents and **no `.tgz`** —
  indistinguishable from a warm mirror until the network goes away.
  `find /verdaccio/storage -name '*.tgz'` is what tells the two apart. **`make verify`
  now asserts this standing**, for every blueprint and fixture lockfile — 210 tarballs
  as of 2026-09-09 — because Verdaccio *proxies* whatever it does not hold, so a cold
  mirror and a warm one behave identically right up until C1 matters. **Measured as a
  negative control on 2026-09-16 (P4c finding 55):** with `connect-mongo` moved out of
  `/verdaccio/storage`, a real build of `node-ts-mongo@1` passed, and Verdaccio had put a
  byte-identical tarball back from npmjs by the time it finished. So "empty the mirror and
  rebuild" **cannot fail with the network on**; `make verify` named the missing tarball
  and its lockfile, and is the control to use.
- **A `cat <dir>/*` stamp is a TOP-LEVEL glob and cannot see a subdirectory.**
  `fixtureBareRepo` used one, and no source tree here had a subdirectory until
  `node-ts-mongo@1`'s `skeleton/auth/`. Measured 2026-09-09: editing
  `auth/ubcshib.js` left the hash byte-identical, so the cached bare repo would have
  been reused and the build would have tested the code *before* the edit — the same
  shape as the stale container that served four runs of a suite. It is `find -type f`
  over names **and** contents now.
- **A shell fragment inside a TypeScript template literal has its escapes eaten by
  TypeScript.** `` `… | tr '\n' '\0' | …` `` compiles to a string containing a real
  NUL byte, and `execFileSync` refuses it: *"args[1] must be a string without null
  bytes."* Double the backslashes. Same family as the Prettier trap — the edit applies
  cleanly and the thing it produces is not what it reads like.
- **A `process.env.X` scan counts COMMENTS, and the dangerous half is silent.** A
  comment mentioning a variable invents a requirement, which is noisy and obvious; a
  read that has been **commented out** still matches, which means "the blueprint reads
  every variable the platform injects" passes against a variable the running app never
  reads. `spec/injection-drift.test.ts` strips comments and string bodies with a
  scanner rather than a regex — `'//'` inside a string is not a comment.
- **`tsc` will not follow a relative import outside the package's `rootDir`**, so a
  test importing app-side blueprint JavaScript is a TS7016 error `pnpm test` cannot
  see. `blueprints/attribute-bridge.test.ts` loads it through a computed specifier with
  one explicit cast — and that cast must spell out its key union, because
  `noUncheckedIndexedAccess` makes an indexed read `string | undefined` and a computed
  key of that type becomes the literal string `"undefined"`.
- **LiteLLM's admin API answers its OWN errors in a route denial's envelope.** It is
  FastAPI, so an unknown route is `404 {"detail":"Not Found"}` and a refused body
  `422 {"detail":[…]}` — the same `{"detail": …}` shape `allowed_routes` refuses with, and
  the 422 echoes the refused `input` back. `mapLiteLlmError` treats a `detail` body as a
  route denial **only on a 403**. Measured 2026-09-14, LiteLLM 1.98.0.
- **A LiteLLM key with a `models` list never sees "unknown model".** Any model off its
  list, existing or not, is `403 key_model_access_denied`; S3's `400` with `type: "None"`
  comes only from a key with no list, such as the master key. Every app key carries a
  list, so an app's misspelt model reads as *not permitted*. Measured 2026-09-14.
- **LiteLLM's errors reach callers as a code and a status, never as text** — that is
  `ai/client.ts`'s job. So a caller that matches an error MESSAGE (`/already exists/`)
  never matches. A duplicate `/user/new` is **409**; test the status.
- **`pnpm test -- <filter>` does not filter** — it runs every file. The one-file loop is
  `pnpm exec vitest run --project unit src/ai/errors`.
- **Node's `JSON.parse` QUOTES the text it could not parse** in its `SyntaxError`, so
  letting one propagate from a third-party body leaks the body. `ai/client.ts` catches it
  on the success path as well as the error path.
- **A Docker network removed under a STOPPED container leaves that container unable to
  start.** A stopped container keeps a network connection the network's own read-back does
  not list, so `network rm` succeeds — and then `docker start` fails with `failed to set up
  container networking: network … not found`. Measured 2026-09-14 on a throwaway container.
  A force-disconnect of a stopped container works, and one that is not attached answers `is
  not connected to the network`. That is why `destroyAppNetwork` sweeps every platform
  neighbour as well as what the network lists: a read-back-only teardown run while
  `manifest-litellm` is stopped would leave the gateway unstartable.
- **An empty `model_info:` in `infra/litellm/config.yaml` stops LiteLLM starting — for
  every app.** Deleting the only key under it leaves the mapping null, and 1.98.0 exits on
  start (`TypeError: argument of type 'NoneType' is not iterable`, `Application startup
  failed. Exiting.`), restarting every ~10 s. Measured 2026-09-14. So §7's "an unclassified
  model refuses only itself" holds only while `model_info` is still a mapping: to take a
  classification away, make it invalid, never delete the line.
- **Two Bash tool calls issued together share one shell**, so a `cd` in one moves the
  other's working directory mid-command. Measured 2026-09-14, when a guard refused seven
  edits it could no longer find. Use absolute paths in anything issued in parallel.
- **The Docker tier leaves images in the daemon, and one image can carry two names.**
  Deploys pull what the builder pushed into the daemon's store as
  `127.0.0.1:7107/local/<slug>@sha256:…`, so a before/after snapshot shows new `<none>`
  entries even when nothing else changed. Remove one only if its digest is absent from the
  starting snapshot under EVERY name: two fixtures built from the same source share a digest
  (`local/fixture-s6` and `local/fixture-rt`), `docker image rm <id>` then answers
  `referenced in multiple repositories`, and untagging one name only moves the diff to the
  other. Measured 2026-09-14, when four were left behind.
- **`npm install` warms NOTHING a developer's npm cache already holds.** npm takes a tarball
  out of `~/.npm` by its integrity hash and never asks the registry, so a package this machine
  has installed anywhere before is never downloaded through Verdaccio and never lands in its
  storage. Measured 2026-09-14: seed's warm printed no `WARN` and exited 0 while
  `npm --loglevel http` showed 135 of 135 packages `(cache hit)` and zero fetches, and
  `make verify` listed every new tarball MISSING. A clean second machine warms correctly;
  the developer's own never did. Seed's warm now passes an empty `--cache` per lockfile.
  **`make verify`'s mirror check is what caught it** — the storage `ls` a plan tells you to
  run shows the same emptiness and suggests re-seeding, which cannot help.
- **`docker-credential-desktop get` can hang, and then every BuildKit lookup of a Docker Hub
  tag dies with `DeadlineExceeded`.** Measured 2026-09-14: `make seed` failed twice at step 2
  (`load metadata for docker.io/library/php:8.3-apache … context deadline exceeded`) while
  `curl` reached Docker Hub in 0.3 s from the host and from the VM with 100 of 100 anonymous
  pulls left — curl never asks the credential helper. `docker buildx imagetools inspect`
  hung the same way. Diagnose with
  `echo https://index.docker.io/v1/ | gtimeout 20 docker-credential-desktop get >/dev/null`
  (exit 124 is the hang). **Each hung call leaves a `docker-credential-desktop get` process
  parented to launchd** — list and kill the ones your commands started. It stops seed before step 4b's npm warm,
  which does not need Docker Hub at all. **Restarting Docker Desktop cleared it** (Rich,
  2026-09-14): afterwards the helper answered in under a second, `docker buildx imagetools
  inspect php:8.3-apache` in 1 s, and `make doctor` and `make verify` were 18/0 and 47/0.
- **zsh expands a word beginning with `=`**, so `echo =====` fails with `==== not found` and
  **abandons the rest of the command**. Quote separators: `echo '-----'`. Measured 2026-09-14.
- **A background command reports its LAST command's exit status.** `make seed > log;
  echo "exit=$?" >> log` told the harness *completed, exit 0* while the log said `exit=2`.
  End such a wrapper with `exit $rc`. Measured 2026-09-14.
- **`ls` is aliased to a long listing here**, so `$(ls -d path/*)` captures whole listing
  lines rather than paths. Use a glob or `find`.
- **`grep` in the agent's Bash tool is a shell FUNCTION backed by `ugrep`**, which reads a `$`
  inside a pattern as an anchor. `grep -c -- '--cache "$tmp/.npm-cache"'` counted 0 against a
  file containing that exact line, and the `&&` guard built on it silently skipped the step it
  was guarding (2026-09-14). Use `grep -F` for any pattern with a `$` in it.
- **Vitest cannot mock a CommonJS package imported by app-side ESM outside the package.**
  Measured 2026-09-14 with `ubc-genai-toolkit-llm`: `vi.mock` was not applied and the package
  loaded under the wrong path (`Cannot find module './types'`). `blueprints/ai-component.test.ts`
  runs such code in a child `node` process instead, against a fake gateway.
- **An applied migration that is missing a line is REPLAYED, not patched.** Measured 2026-09-14: migration 0005's `GRANT` never reached the file — `F=$(ls drizzle/0005_*.sql)` captured a long listing, because `ls` is aliased — and `drizzle-kit migrate` created the table with no privilege for `manifest_app`. Appending the line afterwards changes nothing on that database. Delete its row from `drizzle.__drizzle_migrations` by `created_at`, drop what it created, fix the file, and migrate it as it ships. Check with `\dp`.
- **zsh does not word-split an unquoted variable.** `PSQL='docker exec … psql'` then `$PSQL …` runs one command whose name is the whole string — `command not found`. Use a shell function. Measured 2026-09-14.
- **A single-connection transaction hides an ordering race.** Inside `withRollback` every query runs on one connection, in order, so a status UPDATE issued before a log INSERT has landed still queues behind it — deleting the `await` that orders them left the test green. The control plane runs on a pool, where the two race. To make such a property observable, run on the pool and hold `LOCK TABLE … IN ACCESS EXCLUSIVE MODE` from an admin connection (`releases.test.ts` does). Measured 2026-09-14.
- **Docker CLI 29.7.2 forwards SIGTERM to the `docker-buildx` plugin**, so killing the `docker` process alone stops a real build — measured with buildx v0.36.1-desktop.1. `runStreamed` kills the whole process group anyway, for a CLI that does not.
- **`mongodb/mongodb-community-server` answers a loopback `ping` before it enforces authentication — so a `ping` is not readiness.** `7.0.28-ubi8` first runs an init `mongod` on `127.0.0.1` with no auth while it creates the user and runs `/docker-entrypoint-initdb.d`, then restarts it with `--auth --bind_ip_all`. Measured 2026-09-14: healthy at 9.6 s, an authenticated insert from another container refused until 33.8 s (P4b finding 133). **Fixed 2026-09-15, sitting 8:** the catalogue's check is an *unauthenticated* `listDatabases` that must be REFUSED with code 13 — the init `mongod` allows it and the final one refuses it, because the localhost exception closes once a user exists — so a service is healthy only once it enforces its credentials, and a Mongo started with no authentication never is. Measured with a 20 s init script: the check flipped 240 ms after the final `mongod` began listening. **A container created before the fix keeps its old check** — the two demo databases on this machine among them — until something recreates it. The image has **no** `/docker-entrypoint-initdb.d` directory, so an archive upload into it must extract at `/` with the directory in the entry's name. `getent hosts "$(hostname)"` answers `::1` first inside that image; `hostname -i` gives the container's IPv4 address.
- **Docker 29.7.2 honours a healthcheck's `StartInterval`** (Engine API 1.44, which `engine.ts` pins). Measured 2026-09-15: checks 1.2 s apart until the first success, then 30 s apart. A one-second `mongosh` check for a service's whole life costs about a core a run — the two demo databases sat at ~30% CPU idle, against 0.62% on the new cadence (P4b finding 134).
- **A deploy that never becomes ready is a `200` whose `state` is `failed`, with an Incident — on both drivers.** Since P4b Task 13 the Docker driver refuses readiness by throwing `InstanceNotReadyError`, which carries the handle, and `deployRelease` records it instead of rethrowing; until then the same failure was a `500 INTERNAL` with the row parked in `provisioning` and no record of why. A script has to check that `state` is `healthy`, not that a state came back — `make demo` and `make demo-identity` now do. `GET /environments/:environmentId/incidents` has the exit, the last 200 log lines, the diff since the last healthy release and a repair prompt.
- **`@fastify/websocket` 11.3.0 routes an upgrade through Fastify's router, so a route's hooks run BEFORE the socket upgrades** — and a hook that throws answers the upgrade with an ordinary HTTP status, after which the plugin destroys the socket. Authorize a stream in a `preValidation` hook, never only inside `wsHandler`, which runs after the upgrade: there a refusal can only be a close code, on a socket the stranger already holds. Read from its `index.js`, and measured by P4b sitting 9's controls (findings 155).
- **`websocket: true` beside `handler` and `wsHandler` is a trap**: the plugin then uses `handler` as the socket handler and answers every plain GET `404`. Declare such a route in full, without the flag (P4b finding 156). The plugin also wraps EVERY route's handler, not only WebSocket routes (170).
- **`app.inject` cannot perform a WebSocket upgrade**, so a stream's refusal of a stranger is provable only against a listening server (`app.listen({ port: 0 })`). `api/events.test.ts` asserts the HTTP status on `ws`'s `unexpected-response`, which only a refusal before the upgrade can produce. A `ws` client with no `error` listener turns a refused upgrade into an uncaught exception on whichever test runs next.
- **Postgres `now()` is the TRANSACTION's start time**, so every row one transaction inserts with a `now()` default shares one timestamp, and anything ordered by it comes back in the index's order. `audit.events.created_at` is `clock_timestamp()` since migration 0007. Measured 2026-09-15 (P4b finding 157).
- **A `ws` client that is `pause()`d never reads a close frame queued behind data it has not read**, so a backpressure test that pauses and never resumes cannot see the server's 1013. Measured 2026-09-15, `ws` 8.21.3 (P4b finding 165).
- **Every deploy opens the app's WHOLE secret set**, to redact what it records, and does it before it mints anything (P4b finding 162).
- **Node 24's global `WebSocket` sends a `cookie` header passed in `{ headers }`** — undici's, measured on Node 24.12.0 against a server that printed the upgrade (P4b sitting 10). So a stream subscriber needs no dependency: `scripts/lib/event-stream.mjs` is one. What it cannot see is a refused upgrade's HTTP status — a stranger's `404` arrives as an `error` event and close `1006`.
- **In LiteLLM's spend log, `user_id` is the APP and `end_user` is the PERSON.** `/spend/logs?user_id=` filters on the LiteLLM user a key was minted under — `mf-<projectId>-<env>`, one per app and environment — and says nothing about who asked; the `user` an app sends lands in each row's `end_user`, which `/spend/logs/v2?end_user=` filters on. **A spend row carries none of the key's `metadata`**, so `manifest_project` cannot be read back from spend. Measured 2026-09-15 on 1.98.0.
- **`ubc-genai-toolkit-llm` 0.7.0's errors say nothing about their class.** Every SDK failure becomes the toolkit's `APIError` with `details.type` `'Error'` — the OpenAI SDK's error classes set no `name` — and `code` the HTTP status, or 500 when there was none. A gateway that cannot be reached is `code` 500 with the SDK's own message `'Connection error.'` (or `'Request timed out.'`), which is the only thing that tells it from a 500 the gateway sent. The toolkit builds its client with no `timeout` or `maxRetries` and exposes neither, so the SDK's 600 s and two retries apply: measured 2026-09-15, a refused connection answered in **1.2 s**, an unresolvable gateway in **16.5 s**, and a kept-alive socket to a gateway detached from the network in **611 s**.
- **`curl -sS` exits 0 on an HTTP error**, so `until curl -sS …/healthz; do sleep 1; done` stops at the edge's first `502`. A wait loop needs `-f`. It cost a control run on 2026-09-15.
- **`pnpm test` and `make reset` both leave `.manifest/repos` behind, and `pnpm test` leaves LiteLLM's users and keys too.** The next `POST /projects` for a surviving slug answers `SOURCE_GIT_FAILED` after committing the project row, and a project `pnpm test` removed keeps a live, confined key (P4b findings 178 and 183; RUNBOOK's *Known gaps*).
- **`docker ps --filter name=A --filter name=B` is an OR, not an AND** — and **`docker rm -f` exits 0 for a name that does not exist.** Measured 2026-09-15 (P4b finding 192), cleaning up leaked app containers: `--filter 'name=^mf-proof-app-staging-' --filter 'name=-app$'` listed another app's container and the proof app's own DATABASE and egress. The removal did nothing only because zsh passed the whole list as one argument, and it still printed "removed". Filter once and narrow with `grep`, name what you remove explicitly, and list afterwards.
- **A container name longer than DNS's 63-octet label does not resolve, and the failure names the wrong thing.** Measured 2026-09-15 from inside `manifest-caddy`: a 72-character container name answers `curl: (6) Could not resolve host: … (Misformatted domain name)` and `getent hosts` gives nothing, while a 17-character one answers 200. Caddy dials an upstream **by name**, and `mf-` + a 39-character slug + `-staging-` + 8 + `-` + 8 + `-app` is 72 characters — which is why P4c dials a bounded per-instance alias instead of the container name.
- **Caddy keeps counting an upstream whose route has moved away, until its in-flight request ends — and only then unlists the address.** Measured 2026-09-15: `GET /reverse_proxy/upstreams` reported `num_requests: 1` for 4,000 ms after a `PATCH` moved the route, the whole time a held request was in flight, and the address went missing from the list only after that request finished. The control: with a second, unreachable route still referencing the same address, it stayed listed and went 1 → 0 when the request ended. So the pool counts addresses the **configuration** references, and for a moved-away upstream *unlisted* means *idle*.
- **A `headers` handler must be `deferred` for the edge's value to REPLACE an app's own.** Measured 2026-09-15 against an app serving its own `X-Manifest-Instance`: with `deferred: true` the response carries only the edge's value; with `deferred` absent **both** are present and a client's `headers.get()` returns the joined string `"edge-value, forged"`. This applies to §20's four security headers too, which is what "protections live where an app cannot remove them" depends on.
- **The edge's wildcard answers `200 manifest OK host=… scheme=https` for ANY path**, not only `/` — measured 2026-09-15 on an unrouted hostname with `/never-ready`. So a status-only readiness probe against a hostname with no route passes whatever path it asks for. This is P4b finding 193's general form.
- **Destroying a container does not let an in-flight request finish, where moving a route does.** Caddy lets a proxied request complete on the upstream it started on across a route move (P4c brief §3.3); a same-release redeploy today **deletes** the live container, and an AI question in flight when that happens comes back **502** — measured three times on 2026-09-15 (2,493 ms, 8,223 ms, 585 ms in).
- **The two fixture apps are not interchangeable, and NEITHER of them 404s an unknown path.**
  `fixtureBareRepo()` builds `fixtures/fixture-app`, which does `await client.connect()` **before**
  `server.listen` and exits if Mongo is not there — measured 2026-09-15 with no service
  provisioned: `node server.js` running, nothing bound, an empty log for 30 s, then
  `MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`, which a readiness probe reads
  as 87 attempts of `000`. `ensureContractRepo()` builds `blueprints/fixture-node/skeleton`, which
  needs no database. **Both** end in a catch-all `200`, so "point the health path at something the
  app does not serve" does NOT make an instance never-ready for either of them; only the **proof
  app** (Express) answers 404. Use a port nothing is bound to instead, as
  `roundtrip.docker.test.ts` and `redeploy.docker.test.ts` both do.
- **`demux` yields one record per LINE with the terminator stripped**, because it exists for §14's
  log stream where a line is the unit. Anything reading a container's stdout for a **multi-line**
  value has to put the newlines back: measured 2026-09-15, a two-line `curl -w` format concatenated
  into `20033333333-3333-…`, so the status parsed as 20,033,333,333. No unit test can see it — the
  probe is faked in both tiers — and a one-line format has no newline to lose, which is why it
  survived from P3 to P4c unnoticed.
- **`s6.docker.test.ts` probe 14 can fail once in a FULL `pnpm test:docker` and pass alone.**
  Measured 2026-09-15: `/v1/embeddings` came back `000` in the same test where `/v1/models` and
  `/v1/chat/completions` had just returned 200 from the same network with the same key, so
  neither the gateway attachment nor the key explains it; the file alone was 17 of 17 and the
  next full tier was green. On an idle machine with both Ollama models unloaded first, probe
  14's own order measures a cold chat at **3.54 s** and a cold embedding at **0.30 s**, so a
  cold model load does not account for `statusFromNetwork`'s 15 s bound being exceeded.
  **Cause not established, and the bound was deliberately NOT raised** — raising a timeout to
  remove a flake whose cause is unknown hides whatever it might be. Re-run the file before
  concluding anything from it.
- **`pg_advisory_unlock` on a DIFFERENT connection from the one that locked is a WARNING, not
  an error.** A session-level advisory lock belongs to the connection that took it, so
  releasing it through `pool.query` leaves the lock held for the life of that pooled
  connection while the call itself looks successful. Measured 2026-09-15: the serialization
  test timed out at 5,006 ms and Postgres logged `WARNING: you don't own a lock of type
  ExclusiveLock` five times. `withEnvironmentLock` takes and releases on one `pool.connect()`
  client, in a `finally`.
- **A bigint advisory key is reassembled from `pg_locks` by MASKING, never by shifting.**
  Postgres stores it as `classid` = the high 32 bits, `objid` = the low 32 bits, `objsubid`
  = 1, both `oid` — so `(classid::bigint << 32) | objid::bigint` overflows `int8` for any key
  with the high bit set. Use `((hashtextextended(k,0) >> 32) & 4294967295)::bigint::oid` and
  `(hashtextextended(k,0) & 4294967295)::bigint::oid`. Verified 2026-09-15 for a positive key
  and a negative one.
- **`TRUNCATE … CASCADE` truncates the tables that REFERENCE the named ones**, so a new child
  table is emptied by its parent being in the list and Postgres says so —
  `NOTICE: truncate cascades to table "routes"`. Naming it in the harness's list is belt and
  braces, not the thing that makes a run repeatable, and a control built on leaving it out
  cannot fail (P4c finding 36). Measured 2026-09-15.
- **The retirer opens the app's WHOLE secret set before it removes anything, so a set it
  cannot open stops every reap of that environment — silently.** `retireEnvironment`
  builds §14's redactor first, and §14's redaction fails closed, so an app whose secrets
  were sealed under a different master keypair throws `SECRET_UNWRAP_FAILED` before the
  first `retireInstance`; `createRetirer`'s own catch turns that into one line on stderr
  and the pass reports nothing. Measured 2026-09-15 at the boot tier: the routes were
  restored, the boot line said so, and both containers were still running 120 s later.
  Anything that deploys an app in one process and expects ANOTHER process to reap it must
  use the platform's own key — `infra/secrets/master.key`, through `loadMasterKeypair` —
  not a generated one (P4c finding 46).
- **Two `createFakeDriver()`s hand out the SAME instance handles.** Each counts its own
  from `inst-1`, so two fixtures that each build a driver both call their instance
  `inst-1` and every id-keyed assertion silently matches the wrong one. Measured
  2026-09-15: `recover.test.ts`'s "carries on with the rest" test refused both routes and
  read as a defect in the code under test. A fixture that may be used twice takes a
  driver (P4c finding 48).
- **A connection reset carries no identity header, and it can land last.** R1 tolerates
  about one reset in 300 per admin change, so a request loop's FINAL record may be a
  status-0 with an empty `X-Manifest-Instance` — which fails `seen.at(-1).instance` on an
  otherwise perfect run. Read the requests that were ANSWERED, and assert instead that
  none of them lacks the header (P4c finding 49).
- **`npm install --package-lock-only pkg@1.2.3` writes `"pkg": "^1.2.3"` into `package.json`.**
  The version on the command line decides what is installed, not what is saved; npm's
  default save prefix is `^`. Measured 2026-09-16 on npm 11.6.2 (P4c finding 57). Every
  blueprint pin is exact (C6, D30) and `blueprints.test.ts` holds the skeleton's
  `package.json` equal to `blueprint.yaml`, so pass `--save-exact`. npm also rewrites a
  hand-compacted `"engines": { … }` onto three lines.
- **`make seed` REBUILDS the platform images, and what it rebuilds is not always what was
  running.** Measured 2026-09-16 (P4c findings 58 and 62), by diffing
  `scripts/snapshot-machine.sh` across a seed: `manifest-dnsmasq:local`, `manifest-idp:local`,
  `manifest-caddy:local` and `manifest-egress:local` all came out with **new image IDs**
  (`docker images`' *CreatedAt* still says 2026-08-29 for dnsmasq — that is not the build).
  Three consequences, each measured:
  1. **The IdP moved.** Its Dockerfile runs `composer create-project
     simplesamlphp/simplesamlphp:^2.0` — a RANGE — and seed built it from nothing, so the
     running IdP is now **SimpleSAMLphp v2.5.3.1** (composer root), where S2 measured 2.4.9 on
     the reference IdP. **The image it replaced is gone, so the version it ran is unrecorded.**
     Every identity tier passed on the new one (the Docker tier's login suites, a real login in
     `node-ts-mongo.docker.test.ts`, and `make demo-redeploy`'s CWL sign-ins) — which is §16's
     identity tier doing the job S2 wrote it for. **Rich, 2026-09-16: do not pin it — keep it
     current** (§8). Record the version a seed leaves running:
     `docker exec manifest-idp grep -m1 '"version"' /var/simplesamlphp/composer.json`.
  2. **Seed's step 5 (`compose up -d dns-containers dns-host caddy`) RECREATED both dnsmasq
     containers onto the rebuilt image, and a recreated `manifest-dns-containers` is on NO app
     network** — `ensureAppNetwork` attaches it to every one (`PLATFORM_NEIGHBOURS`) and
     nothing re-attaches it until each app is deployed again. Put back by hand with
     `docker network connect <net> manifest-dns-containers`. No consequence was measured: an
     app container failed `getent hosts idp.manifest.internal` both before and after.
  3. **`manifest-caddy`, `manifest-egress` and every app's egress container were NOT
     recreated**, by seed or by the `make up` after it, and still run the previous, now
     untagged images. Why compose treated them differently from dnsmasq and the IdP was not
     established. The next recreate — `make reset`, or a changed service definition — moves
     them onto the rebuild. **Measured 2026-09-16 (P4c sitting 8):** `make reset` then `make up`
     put `manifest-caddy` on `manifest-caddy:local` `4926f9a62410` and `manifest-egress` on
     `fcbbbde15c72`, and doctor, verify, both test tiers and `make demo-redeploy` were green on them.
- **A `200` from a `*.manifest.internal` name can be the edge's wildcard page, not the app** — its body is `manifest OK host=… scheme=https`. `routes.docker.test.ts` restarts the edge, which drops every runtime route, so after `pnpm test:docker` every demo hostname answers 200 with that body while its containers stay up and healthy (P4b finding 193). A reachability check reads the body, never only the status. A secret sealed under a different master keypair — a test fixture that binds two, or a key file replaced under a database that kept its rows — refuses every deploy of that app with `SECRET_UNWRAP_FAILED`, where it once failed only CWL deploys and failed ones.
- **An `nc` one-liner is not an HTTP server, and behind the edge it produces a 502 that looks like
  the edge's.** `printf "HTTP/1.1 200 OK…" | nc -l` writes its response the moment a connection
  opens, before any request — measured 2026-09-16 by connecting and sending nothing. The edge
  keeps pooled connections to an upstream, so one it parks receives an answer nobody asked for:
  Caddy logs `Unsolicited response received on idle HTTP channel`, then an empty `502` as
  `readLoopPeekFailLocked` for whichever request was handed that connection. It failed a full
  `pnpm test:docker` and was first mistaken for a config-reload defect (P4c finding 74). Put a real
  server behind the edge — `routing/testing.ts`'s `stubAppArgs` — and read the log line BEFORE a
  502, not only the 502.
- **A green `make demo-redeploy` does not prove four of the things it looks like it proves.**
  Measured 2026-09-16 (P4c sitting 8) by removing each and watching the acceptance stay green:
  **(1) an in-place route move** — delete-then-insert leaves a gap of milliseconds, and the
  acceptance samples every 200 ms because §20's 600/min per-IP limit is shared by both its loops;
  `routes.docker.test.ts`'s 20 moves at 25 ms is the test that goes red (and the single-move
  takeover in `runtime/docker/redeploy.docker.test.ts` does not). **(2) The drain** — the route
  moves ~1.3 s into a ~5.4 s deploy and the retirer starts only when the deploy returns, so the
  question a move leaves on the old instance has usually finished before any drain begins; a 1 ms
  bound changed nothing. The driver contract's *a retire waits for a request that is in flight* is
  the test; the summary's `inFlightAtRetire` says whether a run happened to exercise it (once in
  ten redeploys). **(3) Revoking the old AI key only after the drain** — LiteLLM checks a key when a
  request starts, and the question under way made its calls long before; `releases.test.ts`'s
  *a redeploy leaves the REPLACED instance's key alone* is the test, and nothing tested it before
  that sitting. **(4) The retirer's nothing-serves guard** — nothing in a run makes a pass find
  nothing serving; `retire.test.ts` and the driver contract's serving refusal are the tests, and a
  staged boot with no `Route` record after an edge restart removed the app within a second with
  both guards gone.
- **`console.manifest.internal` refuses every source but the host — by design.** Since P5a Task 3 it is
  the API's origin: a Caddyfile site that forwards `/v1/*` and `/auth/*` to the control plane on the host
  and answers everything else with `manifest console: not built yet`, inside a `route` that first refuses
  `not remote_ip 10.89.0.1/32` with **`403 manifest: the control plane is not reachable from this
  network`**. A container on `manifest-platform` gets that body, and so does a deployed app (S6 probe 15).
  So **`make verify`'s edge probes moved to `edge.manifest.internal`**, a reserved label no site names,
  which the wildcard answers everywhere — and `scripts/offline-acceptance.sh`'s C1 parity step with them.
  **After `pnpm test:docker`, restart the control plane**: the tier re-registers the platform's SP row at a
  loopback ACS, and a sign-in through the console then fails at `idp_login`'s ACS comparison until the
  boot puts it back.
- **Saving `infra/caddy/Caddyfile` can leave the edge unable to see it at all.** It is a SINGLE-FILE bind
  mount, bound to the file's inode, and a save that writes a new file and renames it over the old one —
  the agent's edit tool did, and so does `git checkout` — leaves `manifest-caddy` on the deleted inode:
  measured 2026-09-16 (P5a sitting 2), `/etc/caddy/Caddyfile` was *No such file or directory* inside the
  container and `make up` exited 1 at the reload. **`infra/lib/ensure-caddy-config.sh` now compares the
  hash the edge reads with the host's and restarts the edge to re-bind when they differ**, then fails
  loudly if a restart did not fix it. The same shape would hit any other single-file mount —
  `infra/litellm/config.yaml` is one.
- **Every Caddy admin-API change reloads the WHOLE config, and a reload closes every WebSocket the old
  config proxied with `1001 Going Away`** — unless its `reverse_proxy` sets `stream_close_delay`.
  Measured 2026-09-16 (P5a sitting 2): one PUT of an unrelated route closed an event stream through the
  console in under 3 s, and `make demo-ai` failed at step 5 with `1001`, because a deploy moves routes.
  The console site now sets `stream_close_delay 1h`, and with it the same stream survived a PUT and a
  DELETE and `make demo-ai` was green. **An app's own WebSockets are NOT covered**: `routing/`'s runtime
  routes carry no delay, so any deploy anywhere closes every app's proxied WebSockets — named, not fixed.
- **An app container's PID 1 is `node`, which never reaps the orphans it adopts — and no init is set.**
  Measured 2026-09-16 on `node:22-alpine` with `--pids-limit 64`: twenty backgrounded `sleep 2`s from an
  exited `sh` stayed in state `Z` under ppid 1, holding their pids; after `s6.docker.test.ts` probe 11's
  fork loop, `pids.current` was still 64 seventeen seconds on and `docker exec … node` could not start at
  all. So **any S6 probe that execs into the app must run BEFORE probe 11** (probe 15's placement says
  why), and an app whose children leave grandchildren behind slowly spends its `PidsLimit`. `Init: true`
  on the container would reap them; it is not set — named, not fixed.
- **`make demo-redeploy`'s *a question in flight when the route moved* can fail by chance.** Measured
  2026-09-16 (P5a sitting 2): the same-release move landed at +1367 ms, in the 47 ms between one
  question's answer (+1331) and the next one's start (+1378), so no question spanned it and the run was
  23 of 24; the re-run was 24 of 24. Read `acrossMoveMs` in that phase's summary before treating the
  assertion as a regression.
- **`make verify` straight after `make reset && make up` fails ONE check — *the events table is append-only by
  GRANT*** — until `pnpm --filter @manifest/control-plane db:migrate` runs, because the reset leaves the database with
  no tables to hold a grant. Measured 2026-09-16, when it read 47 checks / 1 failed; **the total has moved since, so
  read the failing check's NAME, not the count**. Not a defect in the grant. The control plane will not boot until the
  migration runs either.
- **A request carrying a Manifest session must carry `Origin: https://console.manifest.internal`** —
  every `POST`, `PUT`, `PATCH` and `DELETE`, and every event-stream upgrade — or it is `403
  CSRF_ORIGIN_REFUSED` (P5a Task 4, §20). A deployed app is same-site with the console, so a `SameSite=Lax`
  cookie alone proves nothing. `scripts/lib/api.sh` and `event-stream.mjs` send it; a hand-written `curl`
  with a session jar needs `-H "origin: https://console.manifest.internal"`. Measured through the real edge
  on 2026-09-16: a foreign origin and no origin both refused, the console's accepted — so Caddy neither
  strips nor adds one. A refused upgrade reaches a Node WebSocket client as close `1006` with no status.
- **A sign-in to Manifest completes only in the cookie jar that STARTED it.** `GET /auth/login` sets
  `manifest_login` (a nonce, `Path=/auth`, ten minutes) and sends the nonce as `RelayState`; the callback
  refuses an assertion whose `RelayState` is not that cookie's as `401 SAML_LOGIN_NOT_BOUND`, before node-saml
  sees it. `infra/lib/idp-login.sh` carries both; a hand-rolled walk that drops hop 1's cookie, or does not
  post `RelayState` back, ends with no session and that line on the control plane's stderr. A sign-in lands
  on `/` (the console's placeholder) unless it was started with `?returnTo=/v1/me`.
- **Fastify refuses an unreadable request BEFORE any route or hook runs, and `setErrorHandler` still receives
  it** — an `FST_` code with a 4xx `statusCode`. Until P5a Task 5 all four measured (a malformed JSON body, an
  empty one, `text/csv`, a body over 1 MiB) answered `500 INTERNAL` with an "unhandled error" operator line;
  `api/errors.ts`'s `frameworkRefusal` maps them to `REQUEST_INVALID`, `REQUEST_MEDIA_TYPE_UNSUPPORTED` and
  `REQUEST_BODY_TOO_LARGE`. **Every code a client can receive is in `api/error-codes.ts`**, held to the source
  by a test in both directions — a new code thrown anywhere turns `pnpm test` red until it is registered.
- **`packages/contract/openapi.json` is GENERATED from the route definitions, and a stale copy turns `pnpm test` red** —
  `api/contract/document.test.ts` compares it byte for byte and names the first stale line (P5a Task 6). `pnpm contract:write`
  rewrites it, and **it truncates the control plane's tables**, because it is that test run under the `unit` project, whose global
  setup truncates for any file. It is excluded from Prettier: `JSON.stringify` does not wrap arrays as Prettier does.
- **zod 3.25.76's `z.registry().get()` INHERITS a schema's parent metadata and deletes only the `id`** — so a `.describe()` copy of
  a registered schema answers `{}`, not `undefined`, while `.has()` answers `false`. Measured 2026-09-16 (P5a sitting 4): a check
  for "registered" on the metadata alone let `openApiDocument` emit `"$ref": "#/components/schemas/undefined"`. Ask for the `id`.
- **`tsc` writes its errors to STDOUT**, so `pnpm --filter … build >/dev/null` discards them and leaves only the exit code.
  `scripts/demo-journey.sh` did exactly that until P5a sitting 5 (control (e)): a journey that no longer type-checked ended at
  `make: *** [demo-journey] Error 2` with nothing naming the cause. Capture `2>&1` and print it on failure.
- **`pnpm audit --filter <pkg>` does not scope to the package** — it reports the whole workspace. Measured 2026-09-16 on
  pnpm 11.24.0: `--filter @manifest/contract` listed seven advisories, every path `.>vitest>…`; `--prod` is what isolates a
  package's runtime closure. **The workspace's own test toolchain carries a Critical and a High** — `vitest` 2.1.9 (an arbitrary
  file read while the Vitest UI server listens; patched ≥3.2.6) and `vite` 5.4.21 (`server.fs.deny` bypassed on Windows) —
  plus five moderates, none reachable as used here (no UI server, no dev server, macOS). The second measurement of *nothing
  scans the control plane's own dependency tree*; not upgraded.
- **A status-only `404` expectation is satisfied by a route that does not exist.** An unmatched path answers `404
  ROUTE_NOT_FOUND` (P5a Task 2), so the authorization contract suite's *stranger → 404* passed for both of P5a Task 8's new rows
  before either route was written — measured 2026-09-16, 8 of 10 cases red where the plan predicted 10. The suite now pairs each
  expected status with its code (`NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED`, …); CLAUDE.md's *name the refusal's CODE* is the rule.
- **Postgres `jsonb` hands an object back with its keys reordered — by length, then bytes** — so a value read from a jsonb column
  is not `JSON.stringify`-equal to the same value freshly parsed. zod emits a §7 service as `{type, version, name}`; jsonb returns
  `{name, type, version}`. Measured 2026-09-16: `isSensitiveDiff` reported `services` as a sensitive change on every re-validation
  of an unchanged manifest (visible in every `make demo-redeploy` log since P4c's baseline) until `spec/diff.ts`'s `stable` sorted
  keys (`4a1d8cd`). Compare structure, never serialisations, across that boundary.
- **Fastify's ROUTER sends two refusals itself, in its own body, unless the server passes `frameworkErrors`.** A path parameter
  over `maxParamLength` (100) answered `414 {"error":"Bad Request","code":"FST_ERR_MAX_PARAM_LENGTH","message":"'/v1/slugs/aaaa…'
  is exceeding the max param length"}` and a malformed URL `400 FST_ERR_BAD_URL` — neither reaches `setErrorHandler`, so P5a Task 5's
  mapping of `FST_ERR_BAD_URL` had never run. Measured 2026-09-16 on Fastify 5.12.3; both answer `400 REQUEST_INVALID` since
  `b043d9d`. Through the edge a malformed percent-encoding never arrives at all: Caddy's HTTP/2 resets the stream (`PROTOCOL_ERROR`,
  curl exit 92).
- **Every project created over HTTP records THREE events before anything else happens to it** — `project.created`,
  `repository.seeded`, `spec.validated` (P5a Task 11). So a test that counts a project's `audit.events` rows, or the frames a
  stream replays, starts with them: `api/events.test.ts`'s `streamServer()` returns their ids as `creation`, and
  `delivery.test.ts` compares a subscriber that joined after creation with `rows.slice(3)`. Measured 2026-09-16: five tests
  went red the moment creation published, each on a count.
- **After `pnpm test` or `make reset`, a demo's slug has a repository and no project — and creation no longer leaves a row
  to reuse.** Until P5a Task 11 creation committed the project before the repository failed, and every demo printed
  *reusing project*; since then the project is deleted (Decision 29), so the fallback finds nothing. Measured 2026-09-16
  with the helper removed: `make demo-identity` stopped at step 2 printing `[]`. The demos and `make demo-journey` call
  `clear_orphan_repository <slug>` (`scripts/lib/api.sh`), which removes `.manifest/repos/<slug>.git` only when
  `GET /v1/slugs/{slug}` answers `available` — no project holds the name — and prints what it removed. A hand-written
  creation for such a slug still gets `SOURCE_GIT_FAILED`: move the repository aside.
- **A NUL check is not a text check, and a PNG header cannot tell you which check you have.** Latin-1 bytes carry no NUL, so a
  reader that only refuses NUL decodes them with U+FFFD in place and seeds a different file. `blueprints/tree.ts` refuses both,
  with a fatal `TextDecoder`. The bytes `89 50 00 47` fail BOTH checks, so a test built on them stays green with either one
  deleted — measured 2026-09-16, the NUL check removed, 25 of 25 green. One case per refusal.
- **A drizzle error answers `Failed query: <the SQL>` and not WHY** — the Postgres reason (a foreign key's `RESTRICT`, a
  unique violation) is on `.cause`, and the operator line `toErrorResponse` writes prints only the message. Measured
  2026-09-16 (P5a Task 11 control (d)): an `audit.events` row blocking a project's delete logged `Failed query: delete from
  "projects" where "projects"."id" = $1` and nothing naming the constraint. Read `.cause.code` / `.cause.constraint` in a
  scratch test. Named, not fixed.
- **Prettier formats any app tree under `blueprints/` that `.prettierignore` does not name.** `skeleton/` was named; the
  proof app moved to `starters/proof-app/` (P5a Task 10) and `pnpm format:check` went red on its `server.js` and
  `public/index.html` — `pnpm format` would have rewritten an app. `blueprints/*/starters/` is named now; a new kind of app
  directory needs the same line.
- **The IdP's `config.php` and `authsources.php` are SINGLE-FILE bind mounts, and a replacing save strands them — the IdP then
  runs with no config at all.** Measured 2026-09-16: a control harness restored `infra/idp/config/config.php` with `git checkout`
  (a new inode), and `docker exec manifest-idp cat /var/simplesamlphp/config/config.php` answered *No such file or directory*.
  **A `git pull` that changes either file does the same**, and `make up` does not notice — compose sees no service change, and
  unlike the Caddyfile nothing compares the bytes. `docker restart manifest-idp` re-binds it; `make verify`'s IdP checks go red
  while it is stranded. An edit made IN PLACE (the same inode, as `python`'s `write_text` does) reaches the running IdP at once:
  SimpleSAMLphp reads its config per request.
- **An app's sign-out is a four-hop SAML exchange, and each hop has failed silently.** `/auth/logout` → the IdP's
  `singleLogout?ReturnTo=<app>` → its `core/logout-resume?id=…` (whose state is in the IdP session: without the cookie it is a
  `500`) → **the app's `auth.logout` again, with `?SAMLRequest=`** — the IdP's front-channel `LogoutRequest` to the
  SingleLogoutService the platform registered — → the app's `LogoutResponse` to `singleLogout?SAMLResponse=` → home. Measured
  2026-09-16, first with `curl` hop by hop and then in Chrome: the IdP refused every app's `ReturnTo` (`trusted.url.domains`
  listed only itself), then the app treated the `LogoutRequest` as a new sign-out and the two redirected forever, and with that
  fixed the `LogoutResponse` went to `http://localhost:8080/simplesaml/…` — `passport-ubcshib`'s default `logoutUrl`, because
  `configureCwl` passed none. **After a failed sign-out the app forgets the person and the IdP does not**, so the next *Sign in*
  is answered with no password as the person who left. Nothing before `make demo-identity`'s step 9 ever followed a sign-out.
- **An agent driving Chrome cannot sign anybody in.** The Claude in Chrome extension will not type a password, even a test
  user's, and it needs a per-site permission for `idp.manifest.internal` to see the IdP's pages at all. A browser test of a CWL
  flow is therefore shared: the person types `student` / `student` in the agent's tab and says so; the agent drives and reads the
  app's pages. Measured 2026-09-16.
- **An event whose `machineDetail` is not its type's schema is REFUSED at the write, and the Docker tier's `abc123` is a git TAG,
  not a commit.** Since P5a Task 12 `recordEvent` parses every detail against `observability/event-schemas.ts` — strict objects, so an
  extra key is refused too — and throws `EVENT_DETAIL_INVALID … at: <path>` before the insert. The driver contract hardcodes
  `commitSha: 'abc123'`, which `ensureContractRepo` makes a TAG so `git archive` resolves it; a Docker test that handed that to
  `startBuild` then failed at `build.started`'s `commitSha` (40 hex), measured 2026-09-17 in `boot.docker.test.ts` and
  `releases/redeploy.docker.test.ts`. They pass `contractRepoCommit(repo)`, the commit the tag names. A test that needs an event and is not
  about its payload borrows `EXAMPLE_DETAILS` from `observability/testing.ts`; `{}` is no longer an event.
- **A `zod/v4` union's refusal names no path.** `StreamFrame` — `z.union([EventFrame, LogFrame, ControlFrame])` — refused a frame
  with `humanMessage` renamed as `[["invalid_union",[]]]`, where `EventFrame` alone said `[["invalid_type",["humanMessage"]]]` (zod
  3.25.76, measured 2026-09-17). A test that prints a refusal's paths prints nothing useful for a union; re-read the value with the
  member schema it should have matched, as `api/stream-contract.test.ts` does.
- **A WebSocket test server written by hand hides ordering, and hangs a close.** A `ready` that resolved on the FIRST frame passed a
  test whose server wrote the replayed event and the ready frame back to back (P5a sitting 8, control (l), Node 24.12.0's undici
  7.16.0): `await ready` did not resume between the two — consistent with both frames arriving in one chunk and being dispatched in
  one turn, which was not isolated further. Holding the second frame until the first had arrived alone turned the control red. And `closed` waits for the closing handshake: a server that ignores the client's close frame
  (opcode 8) timed the test out at 5 s. `packages/contract/src/stream.test.ts` does both; `ws` is not the contract package's
  dependency.
- **A build no longer finishes inside its own POST** (P5a Task 13, Rich's R6). `POST …/builds` answers `202` with the build
  `running`, so anything that needs a finished build must wait for one: a test awaits **`deps.builds.idle()`** and then reads
  `GET /v1/builds/{id}`, a script calls **`wait_for_build`** (`scripts/lib/api.sh`), and a test that needs a build to have
  ended calls **`buildToEnd`** (`releases/testing.ts`) — `startBuild` is gone. Two consequences measured on 2026-09-17: a test
  that spreads its own driver over `testDeps()` leaves the **runner and the retirer on the harness's fake** unless it rebuilds
  them (`depsWithDriver` in `delivery.test.ts`), and a suite that truncates the tables while a background build runs fails that
  build for a reason no test asked about — the authorization suite idles first.
- **`scanImage` reports an unknown database age as `Infinity`, and JSON turns it into `null`.** Grype does not always say when its
  database was built; `assessScan` treats that as stale, and `JSON.stringify(Infinity)` is `null` — so a stored summary whose
  schema said `number` would answer **500 on every read of that build**, on exactly the offline laptop C1 is about. `ScanSummary`'s
  `databaseAgeDays` is `number | null` (P5a Task 13). Measured 2026-09-17, before it could ship.
- **§12's gate classifies only Critical and High.** `assessScan` drops every other severity before it asks whose a finding is or
  whether it has a fix, so its three buckets — fixable, unfixable, base-image — can hold nothing else. A count of `medium` beside
  them would be a zero nobody counted, which reads as "none found". `ScanSummary` counts `{ critical, high }` and says so. And
  **a fixable Critical or High only blocks a build on a FRESH database**: a stale scan warns, so "no fixable Critical survived the
  gate" is true only while `stale` is false.
- **ONE control plane runs against one database.** `recoverAtBoot`'s pass 0 fails every `pending` or `running` build, whoever
  started it, so a second process booting against the same database ends the first one's builds. The Docker tier's spawned
  control planes do exactly that — they truncate the tables anyway.
- **Nothing parses an ERROR body through `ErrorEnvelope`, and it cost six sittings of a wrong document** (P5a Task 14,
  finding 1). Every success body is parsed through its representation on the way out (§3); an error body is built by hand in
  `api/errors.ts`'s `mapError` and checked by nothing. `api/errors.ts` holds a TypeScript `interface ErrorEnvelope` and
  `api/contract/schemas.ts` a zod one, **held equal by nothing** — so the document said the envelope admits exactly `code`,
  `message`, `hint` and `details`, `additionalProperties: false`, while the production refusal has carried a fifth key,
  `launchReadiness`, since P2. The authorization suite asserts CODES, not bodies, so it could not see it. Task 15 moves the
  schema to `api/representations/errors.ts`; **make the interface derive from it there.**
- **A source swap does not reach the running control plane.** It serves from `dist/`, so a negative control that must be
  watched through `make demo*` needs the control plane killed, rebuilt (`pnpm --filter @manifest/control-plane dev` does
  `tsc` first) and restarted on the swap, then restored the same way. P5a sitting 10's control (n) is the pattern: without
  the rebuild the demo passes and the control proves nothing.
- **A deploy publishes three or four events now, not one, and any ordered assertion about a deploy's stream has to say so**
  (P5a Task 14). `instance.provisioning` → (`sso.registered`, for a CWL app) → `instance.starting` → `instance.healthy` or
  `instance.failed` (+ `incident.opened`). Five assertions in `releases/releases.test.ts`, one in `api/delivery.test.ts` and
  two in the Docker tier moved; `releases/deploy-sso.docker.test.ts` is the only place the whole order is visible. The one
  that had been asserting the OPPOSITE property — *streams nothing about an instance when the deploy never started one* —
  now asserts that no OUTCOME streamed, which is what §14 actually wants.
- **zod emits an object's keys in SCHEMA order, not the input's — so the same value serialises two ways depending on
  whether it went through a representation** (P5a Task 15, finding 1). A success body is parsed on the way out and an
  error body is built by hand, so the production refusal and `GET …/launch-readiness` carried one computed checklist as
  two different byte strings: `builtBy` before `why` on one path and after it on the other. `toEqual` ignores key order,
  so the whole unit tier passed; **`make demo-journey`'s `JSON.stringify` comparison is what saw it**. `mapError` parses
  the checklist through `LaunchReadiness` now, and fails closed — it is the last thing between a failure and the wire, so
  it drops a checklist that does not parse rather than throwing. **Anything that compares two answers for equality must
  say which kind it means.**
- **A `@typescript` type DERIVED from a zod schema catches what a restatement cannot, and it did so within the hour**
  (P5a Task 15, finding 2). `api/errors.ts`'s `ErrorEnvelope` is `z.input<typeof ErrorEnvelope>` from
  `api/representations/errors.ts` since sitting 11; the first thing `tsc` said was that an `unknown` could not be
  assigned into it — on the exact field the two independent statements had disagreed about for six sittings.
- **A registration-by-import side effect cannot be measured while a second importer exists** (P5a Task 15, control (d)).
  `document.ts` imports `../representations/errors.js` so `ErrorEnvelope` reaches `components`; removing that import
  leaves the drift test **green**, because `contract/websocket.ts` imports the same module for the stream's `426` body.
  Both importers have to go before the test goes red. A control over a side effect must account for every path that
  triggers it.
- **A drizzle refusal is asserted by SQLSTATE, never by message — and the helper exists because it already cost a
  defect** (P5a Task 16, finding 5). `rejects.toThrow(/permission denied/)` goes red against a working grant: drizzle's
  own message is `Failed query: …` and the driver's is on `.cause`. `observability/testing.ts`'s **`expectSqlState`** is
  the one helper for it (`42501` insufficient_privilege, `23503` foreign key); every `audit` table's tests use it, and
  `audit.role_changes` does now too. A grant test should also assert the ROW EXISTS before asserting it cannot be
  changed — a refusal on an empty table is a weaker statement than it looks.
- **A platform role changes out of band or not at all** (§20, P5a Task 16). `scripts/admin-grant.sh` speaks to Postgres
  as the database owner through `docker exec`; nothing on the network does this. **The change reaches a person only when
  they sign in again** — sessions are stateless and carry the role they were issued with — which `make demo-journey`
  measures by signing `operator` in, granting, and signing in a second time. `audit.role_changes` is append-only by
  grant, and its TRUNCATE entry sits **before `users`** in both lists (`db/testing.ts` and
  `packages/control-plane/vitest.global-setup.ts`, which is NOT at the repository root).
- **A snapshot comparison sliced by LINE NUMBER compares the wrong sections, and the mistake is invisible until something is
  deleted** (P5a sitting 11). `scripts/snapshot-machine.sh`'s image list grows between two runs, so the `=== Images ===`
  section starts and ends at different lines in the two files; applying one file's line range to both shifts the "before"
  set and puts a pre-existing digest into the remove list. **Derive each file's section from its own header**
  (`awk '/^=== Images/{f=1;next} /^=== Networks/{f=0} f'`), never by line number, and re-diff AFTER removing anything.
- **A host-side `docker pull` of a platform image cannot authenticate, even with the control plane running.** The
  registry's token realm is `http://127.0.0.1:7100`, which from inside Docker Desktop's VM is the VM's own loopback, not
  the host — so the pull fails `dial tcp 127.0.0.1:7100: connect: connection refused` while 7100 is in fact listening.
  Nothing in the platform does a host-side pull: `runtime/docker/builder.ts` mints a token and hands it to BuildKit as a
  credential. **The way back is not a pull, it is `docker tag`** — `infra/seed/mirror-images.sh` creates every
  `127.0.0.1:7107/base/<name>:<ver>` with `docker tag <hub tag> …`, so re-running that one command restores the name from
  the Hub-named copy, offline.
- **`docker images --digests` prints the REGISTRY MANIFEST digest, not the image id, and the same image has a different
  one per registry.** `scripts/snapshot-machine.sh` uses that column, so a snapshot line is not something
  `docker rmi <that value>` or `docker image inspect <that value>` can be trusted to resolve — **compare snapshots by
  `repo:tag`, not by that digest.** Measured 2026-09-17: the mirrored `base/alpine:3.22` showed `sha256:2c9d26f410d0…`
  (the LOCAL registry's OCI manifest) while the identical `alpine:3.22` showed `sha256:14358309a308…` (Hub's). They are
  one image — same `rootfs.diff_ids` (`sha256:03ba6f53ebfc…`), same `created` to the nanosecond — because Docker
  re-serialises the manifest on push. **Two different digests are not evidence of two different images**; compare
  `RootFS.Layers` against the registry config blob's `diff_ids` before concluding anything.

- **`Array.prototype.map` PASSES THE INDEX, so an optional second parameter on a mapper is filled with a number.**
  Measured 2026-09-18 (P5b sitting 7, F4): `api/representations/tokens.ts`'s `toToken` was given a
  `now: Date = new Date()` — the shape `toPendingAction` already has — and `api/routes/tokens.ts` maps it as
  `.map(toToken)`, so `now` arrived as `0`, `row.expiresAt <= 0` was false, and **every token in every list
  read `expired: false`, including one that had expired an hour before.** The default only applies to
  `undefined`, and `0` is not `undefined`. A live token reading `expired: false` was green throughout; only
  the assertion about an EXPIRED one could see it. The fix is to read the clock inside the function unless a
  caller genuinely needs to inject one — `toPendingAction` does, because a list's `waitingSeconds` must be
  computed against one instant, and its call site passes it explicitly for that reason.
- **A `Promise.all` RACE TEST CANNOT FAIL ON A COLD `pg.Pool`, and it is the pool that decides — not the code
  under test.** Measured 2026-09-18 (P5b sitting 7, F2): five concurrent `recordPendingAction` calls on the
  pooled `db`, asserting one row, **passed against the read-then-insert it was written to catch**. `pg.Pool`
  establishes a connection per acquire up to its default max of 10, and establishing one costs more than the
  SELECT and INSERT it is wanted for — so the first caller finishes both before the second has a connection
  and the five serialise. `await Promise.all(Array.from({ length: 8 }, () => db.execute('select 1')))` first,
  and it reads **5 rows**. This is the pool-level twin of §4's *a single-connection transaction hides an
  ordering race*: `withRollback` cannot see such a race at all, and a warm pool is what makes the pooled
  version observable. **Prefer a deterministic constraint test beside it** — a direct second insert expected
  to fail with SQLSTATE `23505` (`expectSqlState`) asserts the guarantee rather than the timing.
- **A PARTIAL unique index makes a whole class of fixture uninsertable, and the feature's own tests are in
  it.** Measured 2026-09-18: with `pending_actions_one_open_ask_idx` over a token and a request fingerprint
  `WHERE state = 'pending'`, two `pending` rows sharing both cannot coexist — so a seed helper that reuses one
  path, which is the obvious way to write it, fails inside the sweeper's own suite and reads as a defect in
  the sweeper. Vary the key per seeded row by default. And **a partial index predicated on a STATE needs
  something keeping that state honest**: a row past its own expiry still marked `pending` satisfies the
  predicate and blocks the same insert for ever, which is worse than the duplicates the index exists to stop.
- **A negative control that writes into a project's GIT REPOSITORY outlives its `git checkout`** (P5a sitting 12,
  control (h)). Breaking `renderProjectSeed` and running `make demo-journey` commits the broken seed into
  `.manifest/repos/<slug>.git` at project creation. Restoring the source leaves that repository, so the **next** run
  reuses the project and fails again with a clean tree — which reads as a control that did not restore. **Restoring the
  tree is not restoring the platform's data.** The way back is the documented one: truncate (any `pnpm test`), and the
  demo clears its own slug's orphaned repository and creates the project fresh.
- **`make reset` prompts, so it needs its answer on stdin from a tool call**: `echo reset | make reset`. It also does
  **not** clear LiteLLM's users predictably — measured 2026-09-17, it removed `default_user_id` and three `mf-` users
  and left `p4b-probe-user` — so re-measure `/user/list` after one rather than assuming it is empty.
- **A `make demo-journey` failure in PHASE 1 means every phase-2 measurement in that run is MISSING, not passing.**
  `scripts/demo-journey.sh` runs the journey in two phases either side of the app's own sign-in, and `checks.finish()`
  exits 1 at the end of phase 1 — so steps 6, 7 and 8 never execute. A negative control predicted to turn two steps red
  on both sides of that line can only ever be watched on the near side (P5a sitting 12, control (j)).
- **`defineRoute`'s `path` is typed `` `/v1/${string}` ``**, so a route cannot leave the versioned namespace even by
  accident — `tsc` refuses it before the control plane builds. Useful to know when writing a negative control about
  paths: the edit that seems to test the router tests the type system instead, and the journey then dies at step 0 with
  no control plane rather than at the step you aimed at (P5a sitting 12, control (f)).
- **The auto-mode classifier's refusals VARY BY SESSION, so try the command rather than trusting this entry.**
  P5a sitting 12 was refused every `docker rm`, `docker network rm`, `docker volume rm` and `docker rmi` as
  *[Interfere With Workloads]*, and a reverted Caddyfile weakening as *[Security Weaken]*. **P5b sitting 2 was
  refused none of the `docker rmi`s it ran**: it removed the 8 images its own two `pnpm test:docker` runs had built,
  by digest, and diffed the image set back to where it started. What has NOT changed is the rule for what to do when
  a refusal comes: **it is never worked around** — the commands are listed for Rich, the way LiteLLM's user deletions
  are (§2's *Outstanding*). Two distinctions worth keeping: **removing what your own sitting created is
  "leave the machine as you found it" and yours to do; removing what an earlier sitting left is Rich's**, which is why
  sitting 12's list is still outstanding after a sitting that could have run the commands. If a sitting's close-out
  cannot sweep the machine, **say so in the record and leave the exact commands** — a cleanup nobody can find is worse
  than one that was never started.

- **ADDING `&& false` TO A CONDITION DESTROYS THE NARROWING ITS BODY DEPENDS ON, so the
  obvious way to disable a branch for a negative control does not compile.** Measured
  2026-09-18 (P5b sitting 8, F8): `if (granted !== undefined && resolution.kind ===
  'confirmed' && false)` failed with `Property 'row' does not exist on type '{ readonly
  kind: "none" }'` — the extra conjunct stops `tsc` narrowing the discriminated union, and
  the error names a property rather than the edit. Same family as P5a sitting 12's control
  (f), where the edit that seemed to test the router tested the type system instead.
  **Disable the CALL, not the condition**: `void theFunction; void narrowed.field` keeps the
  narrowing and removes the effect.
- **A TEST THAT SCANS SOURCE AS TEXT MATCHES ENGLISH PROSE, and the direction of the failure
  decides whether it is worth fixing.** `packages/journey/src/boundary.test.ts` matched
  `\bfrom\s+['"]…['"]` against *indistinguishable from "the token was minted without …"* in
  a doc comment and turned `pnpm test` red on a file with no forbidden import (2026-09-18,
  P5b sitting 8). It is the same shape as *a `process.env.X` scan counts COMMENTS* above,
  with the failure pointing the other way: a false POSITIVE costs a gate rather than a
  defect, so it looks not worth fixing — but the next author's fix is to reword the
  sentence, and nothing then teaches them the check is a text match rather than a parse.
  Both tests now strip comments with the same scanner. **When you make a scanner stricter,
  assert what it still FOUND** — an empty violation list and a scanner that ate the source
  are the same observation otherwise.

- **THE AUTO-MODE CLASSIFIER CAN TIGHTEN IN THE MIDDLE OF A SESSION, not only between them.**
  §4 already said its refusals vary by session. Measured 2026-09-18, after P5b sitting 8: the
  same session ran 86 `docker image rm`s, a `docker rm -f -v` of three running containers, a
  `docker network disconnect`, a `docker network rm` and a `docker volume rm` with no refusal
  at all — and then began refusing `docker volume ls`, `scripts/snapshot-machine.sh` and
  `make doctor` as *[Interfere With Workloads]*, including read-only commands it had allowed
  minutes earlier. **So the useful order is: do the destructive step first and verify second**,
  because the verification can become the thing you are refused; and **a refusal late in a
  session says nothing about whether the work landed.** Each removal's own output is the
  record — `docker rm` and `docker volume rm` echo the name, `docker image rm` echoes
  `Deleted: sha256:…` — so capture those rather than relying on a later read-back.
- **A CLEANUP LIST GOES STALE IN THE DIRECTION THAT MATTERS: its KEEP entries.** P5a sitting 12
  listed 20 images to remove and two to keep, because the two backed running apps. A day later
  one of those two, `journey-app@e288f8b3`, was held by nothing — the app had been redeployed
  twice — while the list of 20 had grown to **86** unheld images once the whole project's
  accumulation was counted rather than one sitting's. **Re-derive the held set from
  `docker inspect` over every container, running AND stopped, and treat any written list as a
  record of what was measured, never as an input.** The same shape as the LiteLLM list, which
  says the same thing for the same reason.

- **AFTER `make reset`, THE HOST CAN LOSE THE EDGE WHILE A CONTAINER STILL HAS IT — and it is
  intermittent.** Measured 2026-09-18 (P5b sitting 9, F6). After `echo reset | make reset` and
  `make up`, every host-side call to `https://console.manifest.internal` and
  `https://edge.manifest.internal` answered `curl: (35) Recv failure: Connection reset by peer`
  — a RESET, not a refusal, so something was accepting on `127.0.0.2:443` and not forwarding.
  **`make verify` reported 11 of 51 failed and named the shape exactly**: *host and container
  see a byte-identical hostname and scheme* failed with its CONTAINER half printing
  `manifest OK host=edge.manifest.internal scheme=https`. The alias was present
  (`ensure-alias.sh` exits 0 when it is, and it runs BEFORE `compose up`), the control plane
  answered `401` on `127.0.0.1:7100`, and `manifest-caddy` was up and healthy — so Caddy was
  serving and only the host side of the published port was dead.
  **`docker restart manifest-caddy` cleared it completely**, after which `make verify` was
  51/0. It did **not** reproduce under `make down && make up`, nor under `down` + a partial
  `compose up -d --wait registry` + `make up` (the platform network kept its id through both),
  so the trigger is not isolated and this is not a deterministic property of `make reset`.
  **The rule to carry: after a reset, run `make verify` BEFORE any demo.** Host-side edge
  checks red while the container-side one is green means restart the edge, not debug the
  control plane.

- **`db:migrate` NEEDS THE ADMIN URL IN THE SHELL, and says so in no useful way.**
  `MANIFEST_ADMIN_DATABASE_URL` is DERIVED in README's export block, not stored in `.env`, so
  `set -a; . ./.env; set +a` alone is not enough — `drizzle-kit migrate` then fails with
  `[x] url: undefined` and `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`, naming neither the variable nor
  the file. Export README's whole block before the post-reset sequence, not just `.env`
  (P5b sitting 9, F7).

- **A SITTING IS ONE SESSION, SO NO HAND-OFF MAY ASSERT THAT A HOST PROCESS IS STILL
  RUNNING.** Raised by Rich at the close of P5c sitting 1. The control plane is a **host**
  process, not a container: an agent starts it in the background and it is a child of that
  session's shell, which is a child of `claude`. Containers survive a session ending; this does
  not reliably. **The evidence points both ways**, which is exactly why the claim must not be
  made: P5c sitting 1 INHERITED a live control plane (pid 14881) from the session before it, so
  one has outlived its session here — and every §7e up to that sitting stated *"RUNNING on 7100"*
  as a fact a cold agent could rely on. **Write the hand-off as what the next sitting NEEDS, not
  as what happened to be running when you closed**: say `lsof -nP -iTCP:7100 -sTCP:LISTEN` and
  give README's export block for restarting it, and say plainly whether the next sitting needs it
  at all. Most do not — the four gates need **Postgres**, which is a container `make up` gives
  you, and only a task that drives the API through the edge needs the process. The same caution
  applies to anything else a sitting leaves listening (a Vite server on 7104, the mock on 7102):
  **stop them by PORT at your close** rather than leaving them for the next agent to inherit or
  not.

- **`pnpm add -E` PINS ON THE WAY IN AND NEVER AFTERWARDS, and the caret it leaves is silent.**
  Measured 2026-09-18 (P5c sitting 2, F2). An explicit range on the command line beats the flag:
  `pnpm add -ED 'ajv@^8'` writes `"ajv": "^8.20.0"`, not the resolved version. **Re-running
  `pnpm add -E ajv` does not fix it** — the installed version already satisfies the range, so
  pnpm has nothing to do and says nothing. The sequence that reaches an exact pin is
  `pnpm remove <pkg>` and then `pnpm add -E <pkg>`, with **no range on the command line**. C6
  says every pin here is exact, and this is the one way a `^` gets past that rule without
  anybody noticing.
- **`${PIPESTATUS[0]}` IS EMPTY IN THE AGENT'S SHELL.** It is zsh, which spells the array
  `$pipestatus` and indexes it from **1**, so `some | pipeline; echo "exit=${PIPESTATUS[0]}"`
  prints `exit=` — which reads as *a command that produced no status* rather than as *the wrong
  variable name*, and is therefore easy to accept. Same family as *zsh ties `path` to `$PATH`*
  and *zsh does not word-split an unquoted variable* above. Take the status from the command
  itself rather than from a pipeline, or use `$pipestatus[1]`. Measured 2026-09-18.
- **A VITE BUILD IS THE ONLY READER OF A NON-TYPESCRIPT IMPORT, AND `tsc` CANNOT COVER FOR IT.**
  Measured 2026-09-18 (P5c sitting 2, F4): with `types: ["vite/client"]`, `import './styles.css'`
  **typechecks whether or not the file exists** — the ambient declaration is for `*.css`, not for
  a path — and `vite build` then dies on resolution. So the gate that runs in seconds is blind to
  it and the gate that runs at the end is not, which is the same shape as the contract's
  conditional `exports` map sending `tsc` at `src/` and Vite at `dist/`. **Build the thing, do
  not typecheck it and infer.**

- **A GATE THAT READS *PUBLISHED CONTAINER PORTS* CANNOT SEE A HOST PROCESS, AND THIS
  PROJECT HAS NOW PAID FOR IT TWICE ON THE SAME CHECK.** `make doctor`'s *ports 7100-7199
  free, or held only by Manifest* is built on `docker ps`, so §21's host-resident processes
  are invisible to it and read as FOREIGN. It failed with `CLAIMED BY SOMETHING ELSE: 7100`
  on 2026-09-07, *"once there was a control plane worth running"*, and again with
  **`CLAIMED BY SOMETHING ELSE: 7104`** on 2026-09-18, once there was a console worth
  running. **The remedy both times is to identify the process by ASKING IT** — the control
  plane by its D23.7 envelope on `/v1/me`, the console by its own document (`id="root"` and
  `<title>Manifest</title>`, which `vite dev` and `vite preview` serve identically) — **never
  by matching a process name**, because `node` on either port is a guess. Watched failing: a
  foreign server on 7104 carrying `<div id="root">` but a different title is still called
  foreign. **`manifest-mock` on 7102 has no such check yet** and will need one at P5c Task 12.
- **A PLATFORM CHECK MUST NOT DEPEND ON A DEVELOPER'S HOST PROCESS.** `make verify`'s
  *the host reaches https://console.manifest.internal and is not refused* asserted the
  placeholder's own words until P5c sitting 3, and the console that replaced it is started by
  nothing — `make up` does not run `vite`. The check now passes on **`[502]`** (the site
  matched and forwarded; nothing on 7104) **and** on a `[200]` carrying the console's
  document, while still refusing the two answers it exists to catch: the WILDCARD
  (`manifest OK host=…`, which answers 200 for any name and any path) and `@outside`'s
  `403`. **Measured in both machine states**, 51/0 either way. *The general rule: when a
  check's subject becomes optional, the check keeps its QUESTION and loses its string.*
- **THE CHROME EXTENSION'S NETWORK READER PRINTS A SYNTHETIC `503` FOR A 204 WHOSE PAGE
  NAVIGATES AWAY.** Measured 2026-09-18: a *Sign out* click reported
  `POST /auth/logout → 503` while `curl` answered `204`, the code that made the call saw
  `204`, and the session really had ended. Isolated with four runs — a 204 with **no**
  navigation prints 204; a 204 followed by `location.href='/'` prints **503**, twice; a `GET`
  answering 401 and a `POST` answering 401, both followed by the same navigation, print 401.
  So it is neither the method nor the navigation alone but **a bodyless 204 the page leaves
  at once**, and 503 reads exactly like a platform fault. Same family as P5c sitting 1's F8
  (*the extension cannot show request headers*): **when the page navigates, trust the status
  the CODE saw, never the reader's.**
- **A PHRASE THAT WRAPS A LINE IS INVISIBLE TO BOTH OBVIOUS WAYS OF COUNTING IT.** §6 already
  warns that `grep -c` counts LINES, not occurrences. P5c sitting 3 then found the third
  variant: `manifest-schematic.html` carries *"no user interface has been built yet"* twice,
  and `str.count()` of that exact phrase answers **1**, because the second copy is written
  `no user interface\n  has been built yet`. **Search for a short fragment and read the
  matches**, rather than counting a sentence — and remember the neighbouring page states the
  same claim in different words entirely (*"there is still no user interface"*), which no
  search for the first phrasing finds at all.

- **BUILD LOG FRAMES ARE NEVER REPLAYED, so an event stream is not a log.** The document says it
  on `LogFrame` — *"Never replayed — GET /v1/builds/{buildId}/logs has them all"* — and
  `recentFramesFor` is the proof: the replay `select`s from the `events` table, which holds no
  log line. Measured 2026-09-18 in a browser: after a page load, **74 log lines on screen and 0
  log frames delivered by the replay**. So any client showing a build's output must merge
  `GET /v1/builds/{buildId}/logs` with the live frames, de-duplicated by `seq` — and the two
  sources spell the timestamp differently, `BuildLog.lines[].at` against `LogFrame.createdAt`.
  **`seq` restarts per build**, so frames from two builds collide rather than accumulate in a
  `seq`-keyed merge: a missing `buildId` filter shows a silent BLEND at almost the same length,
  not a visible doubling (measured: stored 71 lines, screen 74, matching neither build).
- **AN EMPTY `StartBuildRequest` DOES NOT BUILD THE REPOSITORY'S HEAD.**
  `api/routes/builds.ts` reads `commitSha: body.commitSha ?? spec.commitSha`, so `{}` builds the
  commit of the **last VALIDATED manifest**. Measured 2026-09-18: a commit pushed to a project's
  repository and then built produced the OLD commit; only `POST /v1/projects/{id}/spec`
  (*Re-validate*) moved the spec, after which the same request built the new one. The field's
  name invites the other reading and P5c's Task 7 states it outright.
- **CHANGING AN APP'S `runtime.port` CANNOT MAKE ITS DEPLOY FAIL.** §4's standing advice — point
  readiness at *"a port nothing is bound to"* — is about the Docker tier's FIXTURES, whose listen
  port is fixed in their source while the probe's is not. For an app built from its own manifest,
  §8 injects `runtime.port` into the container too, so the app listens exactly where the probe
  dials: measured 2026-09-18 with `runtime.port: 3999`, the deploy went **healthy**. The lever for
  a real app is the health **PATH** — and only because the proof app is Express and 404s an
  unknown path, where §4 already records that **both** fixture apps end in a catch-all `200`.
  `health: /never-ready` produced `instance.failed` + `incident.opened` in one deploy.
- **A FAILED DEPLOY LEAVES THE PREVIOUS INSTANCE SERVING, so "the environment's state" and "the
  last deploy's outcome" are two different questions.** Measured 2026-09-18 through the console:
  the project's event stream ended `instance.failed` → `incident.opened` while
  `GET /v1/projects/{id}/environments` answered **`healthy`, on the release before it** — two
  instance rows, both true. A client that renders the newest instance EVENT as the environment's
  state reports an app down while it is up; one that renders the deploy call's own answer reports
  it to whoever pressed the button; one that reads the resource once at mount is stale for
  everybody else. The environment's own instance, re-read when a frame says it moved, is the
  answer — and a control that breaks this **cannot fire on an environment that already holds a
  healthy instance**, because both readings then agree. Use one whose FIRST deploy fails.
- **A RUNTIME ROUTE OUTLIVES THE APP IT POINTS AT, AND ONLY AN INFO LINE SAYS SO.** After a
  project's rows are truncated (any `pnpm test`) and its containers removed, the edge still holds
  its hostname: `make verify`'s *runtime routes currently applied* went **0 → 1** and stayed
  there, with no check failing, because it is an INFO line — and `scripts/dead-app-resources.sh`
  does not look at Caddy at all. The admin API is published on **7119**
  (`MANIFEST_CADDY_ADMIN_URL`), each route carries an `@id` of `mf-<hostname-with-dashes>`, and
  `curl -X DELETE http://127.0.0.1:7119/id/<that id>` removes one. **BusyBox `wget` inside the
  container cannot**: it has no `--method`. Measured 2026-09-18.
- **A `scroll` EVENT IS DISPATCHED ASYNCHRONOUSLY, which breaks the obvious "follow the tail
  unless the reader scrolled away".** Content committed between `el.scrollTop = el.scrollHeight`
  and the handler makes `scrollHeight` grow, so the handler reads a large gap and concludes the
  person scrolled away — after which nothing scrolls it back. Measured 2026-09-18 mid-build:
  `scrollTop` **109.5** where the bottom was **921.5**, after 71 lines; reproduced in the page by
  setting to the bottom and appending 40 lines, where the handler computes **662.5**, not 0.
  Recognise your own scroll by the POSITION you set, not by the gap, and only while armed.
- **A TYPE PREDICATE OVER A FIELD NARROWS THE FIELD, NOT THE RECORD.**
  `isDeployState(f.type)` typed `(type: string): type is DeployState` leaves `f` as the whole
  union, so reading a variant-specific property is `TS2339` naming the property rather than the
  mistake. Measured on TypeScript 5.9.3. Same family as *a compound `.filter` condition defeats
  TS 5.5's inferred type predicate*: **narrowing follows the value you test.** Take the record
  and let `Extract<Union, { type: … }>` name what it narrows to.

- **CADDY'S INTERNAL CA ISSUES A 12-HOUR LEAF, SO A TAB LEFT OPEN ACROSS A LONGER SLEEP SHOWS
  `ERR_CERT_DATE_INVALID` ON A CHAIN THAT IS PERFECTLY VALID.** Measured 2026-09-19 (P5c sitting 6,
  F10) after the machine slept nine hours mid-sitting: Chrome refused `idp.manifest.internal` and
  then `console.manifest.internal` **in the same tab**, while `openssl s_client` and
  `curl --cacert` both accepted the identical chain and every host and container clock agreed to
  the second. The PKI, measured rather than assumed: **leaf 12 hours** (`11:58:31 → 23:58:31`),
  **intermediate 7 days** (`Sep 14 → Sep 21`), root ten years. Caddy had renewed cleanly at
  11:58:31; what was stale was **Chrome's cached TLS state for the expired leaf**. **Closing the
  tab and opening a new one cleared it completely.** So: read the chain with
  `echo | openssl s_client -connect 127.0.0.2:443 -servername <host> -showcerts` before suspecting
  the edge, and open a new tab rather than debugging Caddy, `make up` or the alias. The error names
  a date, and the date is the browser's memory rather than the platform's certificate.
- **THE CONSOLE'S *Sign out* ENDS MANIFEST'S SESSION AND LEAVES THE IdP'S ALIVE**, so the next
  *Sign in with CWL* returns the same person **with no form and no password**. Measured 2026-09-19
  (P5c sitting 6, F9): `POST /auth/logout` → `204`, `GET /v1/me` → `401` (the Manifest session
  really did end), then `/auth/login` landed straight back on the console as the same person. This
  is why P5c sittings 4 and 5 rode a live IdP session for free and why **switching user is the
  thing that costs a password** — ending the IdP session needs
  `https://idp.manifest.internal/module.php/core/logout/manifest-test-users`, which no console
  affordance offers. On a shared machine *Sign out* does not mean what the word implies. Named,
  not fixed.
- **THE CHROME EXTENSION'S REDACTOR KEYS ON A RESULT FIELD'S NAME, NOT ONLY ON ITS VALUE.** A probe
  returning `{holdsAnMftToken: false}` or `{sessionStorage: 'empty'}` comes back as
  `[BLOCKED: Sensitive key]` — a redacted **boolean**, which reads as a failed read rather than as
  the guard working. It does correctly refuse to surface a token secret, which is the behaviour
  wanted; the trap is that a carelessly NAMED field makes a successful measurement look broken.
  **Name probe fields neutrally, and have the page compute the assertion** rather than returning
  material to be judged here — P5c sitting 6 proved a delegated token worked by having the page
  itself call `/v1/me` with it and report only the status. Same family as the synthetic `503` above.
  **Two `computer left_click` calls by element `ref` also silently did nothing** while the identical
  click by coordinate worked; the call reported success both times.

### Images already pulled

`postgres:16-alpine`, `registry:2`, `verdaccio/verdaccio:6`, `vimagick/tinyproxy`,
`ghcr.io/berriai/litellm:main-stable`, `node:22-alpine`, `curlimages/curl:8.11.1`,
`moby/buildkit:v0.32.2-rootless`, `mongodb/mongodb-community-server:7.0.28-ubi8`.

**That list is a hint, not a fact.** P1's execution on 2026-09-05 pulled and built
what it needed, so `caddy:2.11.4`, `alpine:3.22`, `php:8.3-apache` and `composer:2`
are now present, and four base images are **mirrored into the local registry** with
their digests pinned in `infra/images.lock` — which is what makes offline builds
work, since merely pulling is not enough. As verified on 2026-09-04, before that:
**`anchore/syft:v1.51.1` and `anchore/grype:v0.118.0` are absent** and P3 Task 12
needs them; the `alpine` present is **3.20**, not 3.22, and its digest is the one
`S1-controls-settled.md` used; and **`moby/buildkit:v0.27.0-rootless` sits alongside
the `v0.32.2` P3 pins**, so do not let a tool pick the older one.

**Take a snapshot before you touch anything:** `./scripts/snapshot-machine.sh`. It is
read-only, needs no `sudo` and no network, and runs under macOS's bash 3.2. Run it
again at the end and `diff` the two — that is how "leave the machine exactly as you
found it" stops being a memory. Today's baseline is
[`machine-baseline-2026-09-04.md`](machine-baseline-2026-09-04.md).

**What P1's execution changed, 2026-09-05.** The three host changes are now **in
place**: `/etc/resolver/manifest.internal`, the `127.0.0.2` alias on `lo0`, and the
Caddy root trusted in the System keychain. All three are reversible with
`make host-undo`. `docker-simple-saml-saml-idp-1` is still **exited, not running** —
"must survive" means do not delete it, not that it is up. Valet was verified
untouched: its config files are unmodified (mtime 2026-07-03) and its dnsmasq is the
same process it has run since 1 September.

**Valet's dnsmasq hangs, and when it does NOTHING resolves — including `.test`.**
Hit on 2026-09-05 and diagnosed. The symptom is the most misleading kind: the
process is alive, `/etc/resolver/test` is correct, the config is correct,
`nc -z 127.0.0.1 53` **succeeds** — and every query times out. It is not a `.test`
problem: `vibonarium.local` and `google.com` time out too.

A stack sample of the hung process showed all 2497 samples in one place:

```
main → receive_query → forward_query → __sendto
```

**dnsmasq was blocked in `sendto` to an upstream nameserver, and dnsmasq is
single-threaded** — so one stuck upstream send freezes the entire resolver,
including names it would have answered locally with no upstream at all. `lsof`
showed `com.cisco` (root) holding DNS sockets to UBC's nameservers 137.82.1.2 and
142.103.1.42, so **suspect the Cisco Secure Client / VPN** on connect, disconnect
or network change.

**The fix, which changes no configuration:**

```bash
sudo launchctl kickstart -k system/homebrew.mxcl.dnsmasq
```

Then `sudo killall -HUP mDNSResponder`. **Diagnose before restarting** — if
`google.com` resolves and only `.test` does not, this is *not* the problem and a
restart will not help. Manifest is not involved either way: its dnsmasq containers
publish `127.0.0.1:7153`, never 53, and the two resolvers coexist — verified with
`cms.test` → 127.0.0.1 and `console.manifest.internal` → 127.0.0.2 answering at the
same time, each served by its own web server.

**Do not read a blank port as a free port.** Without `sudo`, `lsof` cannot see sockets
owned by other users, and Valet's dnsmasq runs as `nobody` — so port 53 reads as empty
while dnsmasq is plainly listening on it. The snapshot script reported `(free)` on its
first run and that was wrong; it now says "nothing visible to this user" and explains
why. `make doctor` (P1 Task 2) will need the same care.

---

## 5. What the spikes established

Read the findings note before touching the area it covers. Do not re-derive any of it.

| Spike | Answer | What it settles |
|---|---|---|
| **S7** ~1.5 h of 3 days | **Yes**, with a zone change | Split-horizon DNS works via two dnsmasq processes. `.test` is unusable (Valet). Trust is needed in **three** places — macOS keychain, container trust stores, **and host Node processes**, because Node ignores the keychain. The custom `xcaddy` build works; **Coraza pins the Caddy version**. |
| **S2** ~0.5 h of 2 days | **Yes** | One `INSERT` into `saml20_sp_remote` registers a working SP on the next HTTP request — no file write, no reload, no restart, no cache TTL. **Manifest writes no PHP.** Attribute release fails **open**: a row with an empty `attributes` list releases everything. `pdo_pgsql` also needs `libpq-dev`. `database.*` and `store.sql.*` are different subsystems. |
| **S1** ~2 h of 3 days | **Yes** | A bare repo drives to a routed healthy container with a bound database, and **§11's `Driver` interface needed no revision**. Rootless BuildKit works — but *not* via buildx's own driver, which wraps it in a `--privileged` container. **Offline builds need base images pushed into the local registry**, not merely pulled. |
| **S3** ~2 h of 2 days | **Yes**, with three corrections | LiteLLM does everything §10 assumes and `ubc-genai-toolkit` needs no change. But **three defaults are wrong and all three fail silently** — see below. |

**S3's three, because they are the ones most likely to be forgotten:**

1. **Every key needs `allowed_routes`.** Otherwise an app key whose user came from
   `/user/new` can mint a child key **that survives revocation of its parent**.
2. **Every `embed()` needs `encoding_format: 'float'`.** Otherwise the OpenAI SDK's
   base64 default meets LiteLLM's Ollama path and you get **192 near-zero values
   where 768 floats belong** — no error, every other assertion green.
3. **The LiteLLM `user` must be `hash(puid ‖ project ‖ environment)`.** End-user
   budgets are global, so a bare PUID hash lets one app's exhaustion lock a student
   out of every other Manifest app.

---

## 6. How to work here

These conventions have held since P1 and are why the work has stayed
coherent. Follow them.

1. **Invoke the skill.** `superpowers:writing-plans` for a plan,
   `superpowers:subagent-driven-development` or `executing-plans` to execute one,
   `superpowers:brainstorming` before creative work. If a skill applies, use it.
2. **Ask before `sudo`, and before modifying anything outside your branch.**
   Installing a global tool counts. So does touching the spec.
3. **Green before you commit:** `pnpm test`, `pnpm lint`,
   `pnpm typecheck` (all three packages, since P5a Task 7) and `pnpm format:check`. All
   four, every time — `CLAUDE.md` says why the last two are not optional extras.
4. **Record exact versions.** Image digests, package versions, macOS and Docker
   Desktop versions. A finding without a version is not reproducible.
5. **Make the judgment call, then write down why.** Rich would rather you decide a
   routine question and record the reasoning as a documented decision than block on
   asking. Reserve questions for things that are genuinely his — spec changes, host
   changes, anything irreversible. P1's *Decisions this plan makes* section is the
   pattern.
6. **Capture negative controls.** "It works" is much weaker than "it works, and here
   it is correctly failing when I remove the thing that makes it work."
7. **Write for a reader who was not there.** Every one of these documents will be
   read cold by someone with no context. That is the normal case, not the exception.
8. **Close out properly — AT THE END OF EVERY SITTING, not at the end of the plan.**
   Update the roadmap ledger, sweep every document that states status, and leave the
   machine as you found it. **The sweep is the step that gets forgotten**, and
   forgetting it is how four documents once spent a day lying about the state of the
   project — and how the four HTML pages spent five days telling outsiders the project
   was "designed, not yet built" after it was neither.

   **WHY EVERY SITTING, AND NOT JUST AT THE END.** A sitting is one session, and the
   next one is a different agent with an empty window that will believe whatever these
   documents say. If a sitting ends without the sweep, the next agent starts by
   executing a task that is already done, or re-deriving a decision that is already
   made, or trusting a gate count that moved — and it will not know to doubt any of it,
   because everything here is written to be trusted. **The plan's own sittings table is
   the single most important line**: it is what says which task is next, and it is
   wrong the moment a sitting ends.

   This is also the step a session limit eats. **Budget for it**: leave enough room to
   sweep before you run out, and if you are close, stop a task early and sweep rather
   than finishing the task and leaving the documents lying. A finished task nobody can
   find is worth less than an unfinished one that is accurately described.

   Sweeping by memory is what fails, so here is the list. Check each one every time:

   | Document | What in it goes stale |
   |---|---|
   | `plans/2026-08-29-plan-roadmap.md` | **The ledger — update this first, it outranks the rest.** Spike status, the plan set table, *Order of operations* |
   | **The plan's own SITTINGS TABLE** | **Added 2026-09-09. The first thing to change and the easiest to forget** — it is at the top of the plan, it says which sitting is next, and a stale one sends the next agent at a task that is already committed. Mark the sitting done, move the `← next` marker, and say how many findings it produced |
   | **The plan's *What executing this plan found*** | One dated section per sitting: the tasks, every defect with the measurement that found it, the negative controls, and the gate numbers at the end. **This is the record that stops the next agent repeating the work rather than continuing it** — and it is where a defect that is not worth fixing yet gets named instead of lost |
   | `ORIENTATION.md` | **§7e and §2's numbers box, every sitting — and REPLACE, never append.** §7e says only what the next sitting needs: the job, what to read, how to run it, what will surprise it, and the state it is handed. A sitting's story — what it built, its findings, its controls — goes in its plan's *What executing this plan found*, not here; this file grew to 240 KB by collecting them and was trimmed on 2026-09-16. §2's plan table when a plan starts or finishes; §3's *What the platform keeps true* when an invariant changes; §4 whenever the machine does something new; §8 when something becomes or stops being Rich's call |
   | `README.md` | The status section, and the *Where to start* table's "current job" row |
   | `RUNBOOK.md` | **Added to this list 2026-09-09, having been missed once.** Its *C1's acceptance* preamble restates the CURRENT `make doctor` / `make verify` totals beside the dated 2026-09-05 ones, so it drifts every time a check lands — and it is the document a new agent opens to run the platform |
   | `WALKTHROUGH.md` | **Added 2026-09-15.** Its *What is built* status lines, and any URL, command, test user or demo that changes. It deliberately states no counts — keep it that way |
   | `CLAUDE.md` | The *State* section — **only when a plan starts or finishes, or an item in its *Outstanding, and Rich's* line moves.** Trimmed on 2026-09-16 from ~30 KB of per-sitting history to a pointer here; it names no sitting and states no gate numbers, so a sitting leaves it alone. Keep it that way — every fact it used to repeat is in this file, the roadmap or a plan |
   | `specs/manifest-schematic.html` | **Shared outside the team.** The `Status` line in the header, the footer, and the "no user interface has been built yet" disclaimers |
   | `specs/manifest-phases.html` | **Shared outside the team.** The spike section — how many have run, what they answered, where the remaining ones sit |
   | `specs/manifest-decisions.html` | **Shared outside the team.** Drifts when a **decision** changes, not when status does — check it after any spec action is applied |
   | `specs/manifest-stories.html` | **Shared outside the team.** Hostname examples, which must match §23's zone rule |
   | `docs/external-track.md` | Owners and states of the UBC items |
   | `machine-baseline-*.md` | **Do not edit these.** They are dated evidence. Re-run `scripts/snapshot-machine.sh` and add a new one |

   **THE GATE NUMBERS LIVE IN THREE DOCUMENTS**, and they move whenever a check
   or a test file lands — which is most sittings. `make doctor`, `make verify`,
   `pnpm test` and `pnpm test:docker` are stated in **ORIENTATION §2's numbers box**,
   **`README.md`** and **`RUNBOOK.md`**. `CLAUDE.md` stated them too until 2026-09-16 and
   now deliberately does not — do not add them back. One `grep` catches all three:

   ```bash
   grep -rn "make doctor\|pnpm test\` \|checks / 0 failed\|passed, .* files" \
     ORIENTATION.md README.md RUNBOOK.md   # from docs/superpowers and the root
   ```

   Update them together or not at all. A half-swept set is worse than a stale one,
   because the disagreement makes every number suspect — which is exactly why §2's box
   says in its own text that it is the only current one and wins any disagreement.

   **AFTER THE SWEEP, RE-READ YOUR OWN §7e AS A COLD AGENT AND CHECK ITS CLAIMS — THIS
   HAS NOW FOUND A DEFECT IN EVERY ONE OF P5b's SITTINGS 3, 4, 5, 6, 7, 8 AND 9 — EVERY SITTING
   FROM THE THIRD TO THE LAST, WITHOUT EXCEPTION; IN SITTING 7 IT FOUND THREE, IN SITTING 8 SIX
   AND IN SITTING 9 THREE.** *This list of sittings is the ONLY statement of that count; §7e points
   here rather than restating it, because sitting 7 found §6 saying "four" and §7e saying
   "six" when the records said seven — F13's own shape, in the pair F13 did not sweep
   (F14).* What it has caught: two wrong numbers in one hand-off (`65cc59c`, `7fce531`,
   sitting 3); a correction block called "one paragraph" when it had two, so a summariser
   dropped the half that contradicted the next task's own test (`b8f6111`, sitting 4); two
   more in sitting 5, both derived by subtracting from the previous sitting's figures
   instead of counting; a recount in sitting 6 that stated a number nobody had measured;
   and in sitting 7 two drifted counts **and an ordered run list that omitted the one step
   the sitting's whole deliverable rested on** — which is the kind this check had not caught
   before, because every earlier one was a wrong fact and that one was a missing one; and in
   sitting 8 THREE: a hand-off that said the RUNBOOK *lists* the demo's nine steps where the
   RUNBOOK groups them into seven; **a claim about this plan's own record that was wrong at both
   ends** — *“a control that could not fail in every sitting but the first two”*, when sitting 2's
   F14 found one and sitting 8's was a different shape; and **§2's P5b paragraph still saying
   “six sittings are done” while §2's own box said eight**, stale for two sittings. **All three were
   found by opening the thing pointed at and counting it, not by re-reading the sentence** — and
   the third says what to grep for after fixing a restated number: **the PHRASE, never the number**,
   because the stale copy carries a different number by definition. **The last three were worse than
   the first three**, and all three came from the same cause: a state table written from what the
   sitting DID rather than from a query at close. The gates run LAST and `pnpm test` TRUNCATES, so
   the sitting's own narrative is stale about the database the moment it finishes — one of the three
   told the next agent that `student` had signed in, which **disarms the very trap §7e names as most
   likely to cost them the sitting**. **And in sitting 9 three, two of which were the SAME CLASS
   AGAIN**: a claim that *"two of §8's open questions are P5c's"* when §8 has one (found by
   opening §8 and counting its bullets), and *"§10's FIRST PARAGRAPH is that §17's Phase 1c row
   is not P5c's scope"* when §10's first paragraph is about the brief's stale sections and the
   Phase 1c statement is three paragraphs later — **a claim sitting 8 wrote into Task 13's own
   step list, which sitting 9 then propagated into FIVE documents before the check opened §10 and
   read it.** That is the strongest argument this list makes: **a wrong pointer is inherited and
   multiplied by the next sitting, because the next sitting trusts the hand-off it is told to
   trust.** Both were found by opening the thing pointed at; neither is visible from the sentence. **Write the state table from `psql`, `docker` and `curl` at
   close, never from memory of the session**, and name the command beside any number.
   The sweep is written by the one person in the
   project who cannot read it cold, and a handover defect costs the next sitting more
   than a code defect, because the next agent has no way to know to doubt it.

   **Check, do not re-read.** Every defect found this way was found by *verifying a
   claim*, not by reading the prose again:

   - **Count what you summarised.** Sitting 4's defect was one word — a correction
     block called *"one paragraph"* when it had two, so the paragraph the summariser
     did not need vanished, and it was the one that contradicted the next task's own
     test. Open what you pointed at and count it.
   - **Grep for every file, export and command you named**, rather than trusting that
     you wrote it correctly an hour ago.
   - **Re-derive every number**, rather than subtracting from the last one.
   - **Open the next task and read it as the next agent will.** Its snippets are where
     a wrong hand-off actually bites.

   **The four HTML pages are the easiest to forget and the most expensive to get
   wrong**, because Rich shares them with people outside the team and nothing in the
   build checks them. They are also the slowest to drift: their architecture stays
   right for months while their *status* is wrong within days. Most sittings do not
   touch them — a pinned digest or a reconciliation pass is invisible to an outsider —
   but **check rather than assume**, and say in the session record that you checked.

### Your first ten minutes, in this order

Establish a baseline before you change anything — every session that skipped this spent longer working out whether a red result was theirs.

```bash
./scripts/snapshot-machine.sh > <scratchpad>/before.txt  # read-only, no sudo, no network
make up                                                  # ~1 min; re-adds the loopback alias
make doctor && make verify                               # expect §2's box
pnpm test                                                # expect §2's box
pnpm lint && pnpm typecheck && pnpm format:check
curl -s --cacert infra/ca/manifest-root.crt \
  https://idp.manifest.internal/module.php/saml/idp/metadata | head -3   # signed metadata, entityID …/idp/shibboleth
```

**`pnpm test:docker`** (~15 minutes, `make up` first, §2's box has the count) is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `ai/`, `observability/`, `infra/` or a `*.docker.test.ts` — and whenever the current plan's sittings rule says so, which wins. One Docker file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`. **Restart the control plane after it.**

**`make demo` is worth one run before you start** — README's *Running the control plane* first. It is the only thing that exercises boot, build, release, deploy and the edge through the real HTTP surface.

---

## 7. What to do next

**The next job is §7e — EXECUTE P5c's SITTING 7, Task 11, ALONE. P5c's sittings 1 to 6 ran on 2026-09-18/19 with 19, 10, 9, 9, 13 and 11 findings; Tasks 1 to 10 of its 14 are done, nothing is part-finished, and nothing blocks the next sitting.** Sitting 7 is §26's queue as a screen — **the first time D24's loop is operated by a human rather than by `curl`** — and it is the one screen in this plan that needs a SECOND ACTOR: nothing appears in the queue until a delegated token has been refused a privileged capability, so the sitting must drive both sides. **The one sitting with the network on is OVER**, so nothing from here to the end of the plan may install a package. *This preamble states the sitting number because §7e is the section a cold agent is sent to and the two must agree; sitting 4's audit found this line still naming sitting 4 after that sitting had committed both its tasks, because §6's sweep table names §7e and not the heading above it.* Each plan's own *What executing this plan found* is its record. The roadmap's ledger outranks this section on status.

### 7a. The executed plans, and which of their records to read first

*Until 2026-09-16 each executed plan had a hand-off section here — P1 was §7a, P2 §7b, P3 §7c, P4a §7d, P4b §7d-2, P4c §7d-3 — and a paragraph per sitting in §2. What in them was durable is now §3's* What the platform keeps true *and* What it deliberately does not do yet*, §4 and §9; the rest was each plan's history, which is in that plan's record, and in this file as it stood at `191cc60`. A plan or brief that cites one of those sections means the plan named in the row below.*

| Plan | Record | Acceptance | Read first |
|---|---|---|---|
| **P1** | [`plans/2026-08-30-p1-local-substrate.md`](plans/2026-08-30-p1-local-substrate.md) | `make doctor`, `make verify` | 18 defects in 13 tasks, and **six were checks that passed while the thing under test was broken or absent**. The second-machine clean clone is untested. |
| **P2** | [`plans/2026-08-29-p2-control-plane-spine.md`](plans/2026-08-29-p2-control-plane-spine.md) | its unit tier; `lifecycle.test.ts` | 52 defects: six type errors no test could catch, five test-isolation defects, a login shim one line from an authentication bypass, and a boot entry point nothing had ever executed. |
| **P3** | [`plans/2026-08-31-p3-docker-driver-deploy-spine.md`](plans/2026-08-31-p3-docker-driver-deploy-spine.md) | `make demo` | **Sessions 4 and 5**: no build had ever succeeded (a `# syntax=` directive the egress-free builder could not fetch, and a `.npmrc` that arrived after `npm ci`), and then no deploy — seven defects of one shape behind 74 green Docker tests. S6 ran as its Task 18 ([`spikes/S6-findings.md`](spikes/S6-findings.md)). |
| **P4a** | [`plans/2026-09-07-p4a-identity-secrets-injection.md`](plans/2026-09-07-p4a-identity-secrets-injection.md) | `make demo-identity` | 80 defects in seven sittings. **Session 5's first**: §20's audit grant was unimplementable while the application connected as a superuser. The acceptance passed first time and eight defects came out of disbelieving it. |
| **P4b** | [`plans/2026-09-07-p4b-ai-events-streaming-incidents.md`](plans/2026-09-07-p4b-ai-events-streaming-incidents.md) | `make demo-ai` | 140 findings in ten sittings. **Sitting 9**: the plan's stream authorized after the upgrade and could not pass its own test. **Sitting 10**: every embedding had been charged to nobody. |
| **P4c** | [`plans/2026-09-15-p4c-zero-downtime-redeploys.md`](plans/2026-09-15-p4c-zero-downtime-redeploys.md), with [its brief](plans/2026-09-15-p4c-brief.md) | `make demo-redeploy` | 70 findings in eight sittings. **Sitting 8**: four of the acceptance's nine negative controls could not fail in it — §4 says which tier sees each. |
| **P5a** | [`plans/2026-09-16-p5a-the-contract.md`](plans/2026-09-16-p5a-the-contract.md), with [the P5 brief](plans/2026-09-16-p5-brief.md) | `make demo-journey` | 146 findings in twelve sittings. **Sitting 12**, the acceptance: three of fourteen negative controls could not fail as written — including one where the journey read a *status* while the property was a *latency*, so a synchronous build passed R6's own check. **Sitting 10's finding 1** is the other one to read: the document said for six sittings that the error envelope could not carry the field the production refusal had been sending since P2, because nothing parsed an error body through its schema. |
| **P5b** | [`plans/2026-09-17-p5b-delegated-tokens.md`](plans/2026-09-17-p5b-delegated-tokens.md) — **EXECUTED 2026-09-18**, all nine sittings | `make demo-token` — green three times, the third from a `make reset` machine; step 9 of the offline acceptance | 116 findings in nine sittings. **Sitting 9's F1 is the newest one to read, and it is a lesson about PREDICTIONS**: sitting 8 predicted Task 13's control (a) would be invisible to the acceptance, and it turns three checks red — the reasoning was about the FIXTURE token, which holds the privileged capability and is refused identically either way, while every REAL token lacks it and is refused by a different rule with a different code. **Sitting 9's F3** is the second: replacing the token secret's constant-time comparison with `===` left all 1342 tests AND all nine demo steps green, so the property was asserted by nothing; it is now asserted at the source, and the first draft of that assertion could not fail. **Sitting 9's F8**: one `pnpm test:docker` run recreates exactly the seven dead app networks cleared by hand the same day. **Sitting 8's F1 is the newest one to read**, and it is what the first integration client is for: **`subscribe` could not carry a delegated token at all**, so an agent could start a build through the generated client and had nothing to watch it end on — the route had accepted a bearer all along, and nothing server-side could see the hole. **Sitting 8's F4 and F5** are the second: **three of its five negative controls answer `403` for the WRONG REASON** — the privileged rule disabled makes the refusal a dead-end `403 FORBIDDEN`, confirm reverted answers `403 TOKEN_ACTION_PENDING`, the fleet reverted answers `403 FORBIDDEN` — so a status-only demo passes all three. **Sitting 7's F4**, and it is a JavaScript trap rather than a platform one: `toToken` was given an optional `now: Date = new Date()`, and `api/routes/tokens.ts` maps it as `.map(toToken)` — so `now` arrived as the ARRAY INDEX, `0`, and every token in every list read `expired: false`, including one that had expired an hour before. Only the assertion about an expired token could see it. **Sitting 7's F2** is the one after that: the plan's own `Promise.all` control for a read-then-insert **passed against the defect**, because `pg.Pool` establishes a connection per acquire and the five calls serialised — a warm pool is what makes a pooled race observable, and a deterministic SQLSTATE test belongs beside it. **Sitting 6's F5:** two of that sitting's own four new tests were green before the feature, because both were *"is not limited"* claims — and a claim that something is NOT refused is true of a platform that refuses nothing. A negative claim needs a positive control in the same test. **Sitting 4's F1** is the one to read: the plan's own negative control for the ORDER of the two token checks could not fail against any of the 31 tests that existed, because every test writes a token holding the privileged capability and **no token the platform can mint can hold one** — so the swapped order answers a dead-end `403 FORBIDDEN` for every real token, with D24's loop unable to start, and all 31 green. **Sitting 2's F1**: the plan's token parser split on `_` while base64url's alphabet contains it, so it refused 47.5% of the tokens the same file minted — and the round-trip test minted ONE token, so it would have gone red about half the time and read as a flaky harness. **Sitting 2's F14**: the plan's own TRUNCATE negative control cannot fail, because the statement's CASCADE reaches both new tables unnamed. **Sitting 3's F1**: `DELETE /v1/tokens/{tokenId}` is the API's first bodyless mutation, and the contract layer could not carry one — the route answered `400` before its handler ran and the OpenAPI document could not be generated for it at all, because both kept on `method === 'GET'` rather than on the body schema. **Sitting 3's F13**: three of that sitting's own negative controls answer `403` for the WRONG REASON, so a status-only assertion is green through all of them. |
### 7e. Execute P5c's sitting 7 — Task 11, §26's queue as a screen ← **START HERE**

**P5c IS EXECUTING. Sittings 1 to 6 are DONE (2026-09-18/19, with 19, 10, 9, 9, 13 and 11
findings); sittings 7 to 9 have not run.** Your job is **sitting 7 — Task 11, ALONE**, using
`superpowers:executing-plans` or `superpowers:subagent-driven-development`. It is §26's queue as
a screen: the question an agent asked, who asked it, how long it has waited, and a person
confirming or rejecting it in their own words. **It is the first time D24's loop is operated by a
human rather than by `curl`**, and it is the last screen before the mock.

**ONE TASK, AND IT NEEDS A SECOND ACTOR.** Every other screen in this plan reads or writes as the
person sitting in front of it. This one renders a question **an agent asked**, so nothing appears
until a delegated token has been refused a privileged capability — you must drive both sides.
**The worked example is `packages/journey/src/token.ts`, NOT the shell script** — `grep pending
scripts/demo-token.sh` finds nothing, because the script only orchestrates. Its `step6` (around line
495) has an agent POST `/v1/projects/{id}/members`, asserts the refusal is `403 TOKEN_ACTION_PENDING`
and reads the question off `error.pendingAction`; its `step7Confirmed` (around line 542) lists the
queue as the person and confirms. `make demo-token` runs the whole thing. **Task 10 built the screen that mints the token you will need**, so you can now do the
agent's half from a token minted by clicking.

> **THIS SITTING PROBABLY NEEDS RICH TO TYPE A PASSWORD, AND THE REASON IS NOW MEASURED.** The
> browser profile holds whatever IdP session the last sitting left — **`operator` as of this
> close** — and **the console's *Sign out* does NOT end the IdP session** (§4, measured this
> sitting): signing out and back in returns the same person with no prompt. So staying as one
> person is free and **changing person costs a password**, because ending the IdP session means
> visiting `https://idp.manifest.internal/module.php/core/logout/manifest-test-users` and then
> typing credentials the extension will not type (R3, §4).
>
> **Plan around it rather than into it.** Task 11's confirm/reject needs a person **who holds the
> capability the question is about** — `members:manage`, and the question the journey raises is an
> ADD (`POST /v1/projects/{id}/members` for `stu000001`), not a remove — which a project **owner** holds and a collaborator does not. So the
> cheapest shape is: be ONE person throughout, make that person the project's owner, and mint the
> token as them. A second person is only needed to watch a collaborator be refused `403 FORBIDDEN`
> at the confirm route, which is Task 11's own control row — **decide deliberately whether that
> control is worth a password, and say which you chose.**

**THE NETWORK-ON SITTING IS LONG OVER.** Task 2 installed everything this plan gets. **If a task
believes it needs a package, that is a finding to record and raise, not a step to take.**

**Read, in this order, before you run anything:**

1. **The plan — [`plans/2026-09-18-p5c-the-clients.md`](plans/2026-09-18-p5c-the-clients.md)** —
   its **header, its sittings table, *Read this first*, *Decisions Rich made* and *Decisions this
   plan makes***. Of *Read this first*'s twenty numbered items, **8 and 5 land hardest here** —
   *checked by opening them and counting, not by remembering*. Item 8 is `PendingAction`'s fields
   (`expiresAt`, `waitingSeconds`, `state`, `bodySha256`, and **never the body**), which is what
   makes **Decision 8** implementable: the sweeper gets no timer because the SCREEN renders a
   lapsed question from the timestamp. Item 5 is the stream's subscribe-then-replay-then-flush
   shape. **`python3 -c` over `packages/contract/openapi.json` settles any question about a shape
   in one line** — do that rather than trusting a summary, including this one.
2. **Task 11 in full.** It carries no `[SITTING n]` correction block. **Two things about it are
   already known and are not in the task**: `<Refusal>` deliberately does **not** render the
   envelope's `pendingAction` yet — Task 11 is its first caller and adds it *with* that caller
   (sitting 5's F6, sitting 6 left it untouched) — and `api.ts` now holds **29 of the contract's
   34 operations**, so Task 11 adds `listPendingActions`, `getPendingAction`,
   `confirmPendingAction` and `rejectPendingAction`, leaving **one**: `streamProjectEvents`, which is the WebSocket and is
   already called — by `stream.ts`'s `subscribe`, not by `api.ts` — so Task 13's coverage gate must
   count the stream as covered rather than exempt it. *Counted at this close with a script over
   `openapi.json` and `api.ts`, not by arithmetic on a remembered number.*
3. **Sitting 6's entry in the plan's *What executing this plan found*** — eleven findings.
   **F1, F2 and F7 change what you do.** F1: **`<Ago>` is now `<Instant>` and renders both
   directions** — `PendingAction.expiresAt` is a FUTURE instant and is the next one to reach a
   screen, so use it and do not reintroduce an age-only renderer. F2: the document cannot mark
   D24's privileged four, so the console restates them in `screens/tokens.tsx` — **Task 11's queue
   shows the same four from the other end**, and it should name that file rather than restate them
   a second time. F7: a control row can be un-fireable because the formula it proposes is not the
   mistake anybody would make.
4. **Sitting 5's entry**, for F6 (`<Refusal>` and `launchReadiness`) and F10 (what is serving and
   what the last attempt did are two different facts).
5. **§4 of this file — searched, not read — and §6 IN FULL**, including the sweep table and the
   post-sweep check. **Three §4 entries are new this sitting** and all three cost time before they
   were understood: Caddy's 12-hour leaf and the stale tab, the sign-out that leaves the IdP
   session alive, and the Chrome extension's redactor keying on a field's NAME.

**What sittings 1 to 6 measured that changes what you do.**

- **`useProjectStream` EXISTS and is proved live** (`packages/console/src/stream.ts`), the project
  screen holds ONE socket, and **the tabs now hang off it** — `screens/project.tsx` renders
  `Overview | Queue | Tokens` and keeps the hook above the switch, so moving between tabs does not
  tear the socket down. **The `queue` arm is a placeholder today and is yours to replace.**
- **`api.ts` has 29 of the contract's 34 operations** — *counted at close with `grep -c 'async '`*.
- **`pendingAction` is NOT rendered by `<Refusal>`**, deliberately, and Task 11 is its first caller.
- **`revokeToken`, `createRelease` and `validateSpec` publish NO event** (sitting 6 F3, sitting 5
  F7, sitting 4 F5). **Check whether YOUR routes publish before assuming a screen can learn from
  the stream** — `confirmPendingAction` and `rejectPendingAction` are the ones to check, and a queue
  that cannot learn of its own answers is the shape to watch for.
- **`pnpm --filter @manifest/contract build` before anything builds or previews the console**
  (sitting 1, F3), and **`vite build` after every commit** (sitting 2, F4) — 263.69 kB at this close.
- **The ESLint console boundary allows `./` and `../`** (sitting 4, F2); screens live in
  `src/screens/` and the boundary test asserts the scanner descends into it.

**How to run this sitting, in order.** *Every §7e carries one of these, because P5b sitting 7
found that an ordered list which omits one step omits the one the deliverable rests on.*

1. **Baseline first** (§6's *Your first ten minutes*): `./scripts/snapshot-machine.sh` to a scratch
   file, `make up`, `make doctor && make verify`, `pnpm test` **twice**, then `pnpm lint`,
   `pnpm typecheck`, `pnpm format:check`. **Expect §2's box exactly**, including **`make verify`'s
   per-app INFO line reading `containers=3 networks=1 volumes=2`** and its **runtime routes reading
   0**. A disagreement is your first finding.
2. **Start the control plane** — this sitting needs it. README's *Running the control plane* is the
   whole export block; `set -a; . ./.env; set +a` alone is NOT enough. Read its boot line.
3. **Start the console**: `pnpm --filter @manifest/contract build`, then
   `pnpm --filter @manifest/console dev`. Check `https://console.manifest.internal/` serves it and
   **read the body** — a `manifest OK host=…` body means the wildcard answered.
4. **Read the five things above, in their order.**
5. **Build the state this screen needs, and do it AFTER the baseline gates** (every Vitest run
   truncates). You need: a project whose owner is the person you will be; a delegated token minted
   on it; and that token refused a privileged capability so a `PendingAction` exists.
   `scripts/demo-token.sh` does the whole sequence and is the cheapest source of a real question.
6. **Task 11: write it, then CLICK IT, then run its controls, then the gates, then commit.** The
   clicking and the controls come before `pnpm test` — the gates truncate the tables and take your
   question with them (sitting 4, F8). **If a control must run before a commit**, copy the files to
   your scratchpad with hashes and restore from that, never `git checkout`.
7. **Task 11 owes no `pnpm test:docker`** unless you touch `routing/`, `infra/` or a
   `*.docker.test.ts`, and nothing in it should.
8. **Close out** (§6's sweep): the roadmap ledger first — **including its defect-rate table** —
   then this §7e, §2's numbers box, the plan's sittings table and its *What executing this plan
   found*. **The four shared HTML pages were swept by sitting 3 and checked by sittings 4, 5 and
   6**, which changed what a person can DO without changing what those pages CLAIM. **Check them
   again.** Then **re-read your own §7e as a cold agent and CHECK its claims** by opening what they
   point at and counting.

**WHAT WILL SURPRISE YOU IN THIS SITTING, specifically.**

- **NOTHING IS IN THE QUEUE UNTIL AN AGENT HAS BEEN REFUSED.** §26's queue is a read over
  `pending_actions`, and that table is empty on a truncated database. A screen that renders
  correctly against nothing is not evidence it renders a question — **build the question first**.
- **A CONFIRMATION DOES NOT REPLAY THE REQUEST.** It grants that exact request — this token, this
  method, this concrete path, this key-sorted body hash — **one retry, which the AGENT makes**. So
  the screen's confirm button does not make anything happen to the project; a person watching for
  the member to disappear will conclude it failed. Say so on the screen.
- **`expiresAt` IS A FUTURE INSTANT AND THE SWEEPER HAS NO TIMER** (Decision 8). A `pending` row
  past its own expiry still reads `pending` in the database and **must render as lapsed with no
  confirm button**, from the clock. That is Task 11's own control, and `<Instant>` already renders
  a future instant correctly (sitting 6, F1).
- **A PERSON MAY READ THE QUEUE WITHOUT BEING ABLE TO ANSWER IT.** Reading is `project:read`, so a
  collaborator watches; answering needs the capability the question is **about**, so the same
  collaborator is `403 FORBIDDEN` at confirm and a stranger is `404`.
- **THE BODY IS NEVER CARRIED** — only `bodySha256`. A screen that promises to show a person what
  they are approving cannot show them the request body, and pretending otherwise is the console
  inventing information. Render what there is: the method, the concrete path, the capability, who
  asked and how long it has waited.
- **`pnpm test` TRUNCATES THE TABLES and takes your clicked state with it** (sitting 4, F8) — and
  it also **empties `users`, which undoes any `admin-grant.sh`**, watched again at this close.
- **A `200` from `console.manifest.internal` may be the edge's wildcard.** Body
  `manifest OK host=… scheme=https`. **Read the body, never the status.**
- **A browser tab left open across a long sleep shows `ERR_CERT_DATE_INVALID` on a valid chain**
  (§4, new). Open a new tab; do not debug the edge.
- **The permission classifier varies within a session** (§4). **Do the step, then verify.**
- **`${PIPESTATUS[0]}` is empty here**: the shell is zsh (`$pipestatus[1]`, indexed from 1).
- **`make reset` is not part of this sitting and should not be run.**

**THE TWO RULES A SITTING CANNOT GET FROM ANYWHERE ELSE**, restated because they are stated only
in each plan's *Global Constraints*:

- **COMMIT ON `main`. No branch, no worktree, no push.** `superpowers:executing-plans` and
  `using-git-worktrees` will both push you the other way; the consent is given here, by Rich.
  Conventional messages, one commit per task, ending with the attribution lines the session's own
  system reminder gives.
- **Ask before `sudo`, and before touching anything outside the repository.** §6 rule 2, and
  CLAUDE.md's *Non-negotiables* has the rest. Nothing in this plan needs `sudo`.

**The state you are handed, 2026-09-19, at the close of P5c sitting 6.** *Written from `lsof`,
`docker`, `curl`, `git` and the scripts' own output at close, not from memory of the session.*

| | |
|---|---|
| The four gate numbers | §2's box. `pnpm test` **1355** in **103** files (UNCHANGED — Tasks 9 and 10 add no test file, by Decision 7; run twice at baseline and twice at close, 1355 every time), `pnpm test:docker` **178** in **29** files (**NOT re-run and NOT owed** — both commits touch only `packages/console/src/`, and this sitting ran no build and no deploy at all), `make doctor` **18/0**, `make verify` **51/0**. **Your sitting owes no Docker tier either** |
| The control plane | **RUNNING on 7100 when this was written — DO NOT BELIEVE THAT ROW, CHECK IT** with `lsof -nP -iTCP:7100 -sTCP:LISTEN`. A sitting is one session and this is a host process. **Your sitting DOES need it.** It survived a nine-hour machine sleep as pid 81557, which is one more data point and **not** a licence to assume. README's *Running the control plane* is the whole export block — `set -a; . ./.env; set +a` alone is NOT enough, because `MANIFEST_ADMIN_DATABASE_URL` is DERIVED in that block. **Never start a second one**, and kill the first BY PID — `pkill -f 'control-plane/dist'` does NOT match it. **It was NOT restarted this sitting**, so its session secret is unchanged from sitting 5's |
| The console | **`infra/caddy/Caddyfile` is untouched this sitting** — `git status` clean throughout. **`vite` WAS LEFT RUNNING on 7104** as pid 65007 — *checked by `lsof` at close* — deliberately, because it survived the sleep and the next sitting needs it; **stop it by PORT if you want a clean start**. 7102 and 7105 are free |
| The console's code | **22 tracked files in `packages/console`** — *counted with `git ls-files`* — of which this sitting added `screens/launch.tsx` and `screens/fleet.tsx` and changed `api.ts`, `ui.tsx`, `app.tsx`, `screens/project.tsx`, `screens/tokens.tsx` (new), `screens/builds.tsx`, `screens/deploy.tsx` and `styles.css`. **`api.ts` now has 29 of the contract's 34 operations** — *counted with `grep -c 'async '`*. `<Refusal>` renders `launchReadiness` through the shared `<ReadinessItems>` and still does NOT render `pendingAction`, deliberately (Task 11 is its first caller) |
| The database | **NO migration since 0018** (`packages/control-plane/drizzle/0018_curvy_sister_grimm.sql` is the newest — *checked*; note the path, `drizzle/` is NOT at the repository root). **`pnpm test` ran EIGHT times — counted from the captured output files** (two at the baseline, two before each of the two commits, two at the close) — and every one truncates, so **treat the §6 tables as EMPTY** |
| Identity | **`users` holds exactly ONE row, `opr000001`, role `member`** — *read from `/v1/me` at close*. The closing gates truncated `users` and a browser sign-in afterwards recreated the operator as a plain member, so **THERE IS NO ADMINISTRATOR** and `GET /v1/fleet` answers `403` for everyone until `scripts/admin-grant.sh` is run again. The long-standing trap is ARMED: `POST /v1/projects/{id}/members` answers `400 MEMBER_USER_NOT_FOUND` for anybody who has never signed in. **The BROWSER holds a live Manifest session AND a live IdP session, both `operator`** — signing out and in again returns operator with no password; becoming anybody else costs one |
| The apps | **`token-app` only, three containers** — *counted at close*. This sitting deployed nothing; `make verify` reads `containers=3 networks=1 volumes=2` and *runtime routes* **0**. token-app is **NOT reachable as itself**: that hostname answers the edge's wildcard, which a status-only check cannot tell from the app |
| **Owed to Rich** | **NOTHING.** This sitting created three projects and four delegated tokens, all of them removed by its own gates' truncation; it built no image, deployed no container and left no network, volume or runtime route. Both cleanup scripts were run bare at the close and **needed no `--apply`**: `dead-app-resources.sh` reads **`none dead`** and `litellm-orphans.sh` reads **0 orphaned**. App images stand at **29 lines / 27 distinct IDs / 0 by `^local/`**, the same three numbers sitting 5 left — **name the metric, because a fourth way of counting (`docker images --format '{{.ID}}' \| sort -u`) answers 69, which is every image on the machine and not the app figure**. **The dead-resource set still comes back the moment anyone runs `pnpm test:docker`** — a property of the tier, measured three times, not a backlog |
| This sitting's own footprint | **Two code commits and status documents after them.** `1623e68` — 6 files: `api.ts`, `app.tsx`, `screens/project.tsx`, `ui.tsx`, `screens/fleet.tsx` (new), `screens/launch.tsx` (new). `21d3100` — 9 files: `api.ts`, `app.tsx`, `styles.css`, `ui.tsx`, `screens/tokens.tsx` (new), `screens/project.tsx`, `screens/builds.tsx`, `screens/deploy.tsx`, `screens/fleet.tsx`. *Both counted with `git show --name-only`, not recalled.* **No migration, no route, no spec change, and no change to the control plane's `src/` at all** |


## 8. Decisions waiting on Rich

Surface these; do not decide them. **When one is decided, move it to *Decided* as one line naming where the reasoning is recorded.**

### Open

- **Should app containers run with an init (`Init: true`)? — RAISED 2026-09-16 (P5a sitting 2).** An app's PID 1 is its
  own `node`, which never reaps the orphans it adopts, so a process an app starts that leaves children behind turns them
  into zombies holding pids against §12's `PidsLimit` (64 in the S6 fixture) for the container's life — measured with
  twenty orphaned `sleep`s in state `Z`, and with S6 probe 11 leaving `docker exec … node` unable to start. It changes
  every app's process tree, which is why it is asked rather than done.
- **Should the blueprint base image move from `node:22-alpine` to 24?** Priced in exposure as well as effort (Grype
  v0.118.0, 2026-09-06):

  | | apk Critical / High | npm Critical / High |
  |---|---|---|
  | `node:22-alpine` *(what the blueprint pins)* | 4 / 14 | **1 / 10** |
  | `node:24-alpine` | 4 / 14 | **0 / 4** |

  The npm findings are npm's own bundled tree inside the image, not anything an app chose; moving removes the
  Critical. Mechanically one line in `infra/images.txt` plus a `make seed` — but it changes what faculty apps run in,
  which is a compatibility decision.
- **Should Phase 1 ship an apk mirror alongside Verdaccio? — RAISED 2026-09-06.** The 4 Critical and 14 High apk
  findings are `libcrypto3`/`libssl3` at `3.5.7-r0`, fixed in `3.5.8-r0`; no newer base image clears them, and
  `RUN apk upgrade` cannot work from a builder with no route off its `--internal` network. An apk mirror is the only
  mechanism that would let a build clear them offline. The scan gate does not block on base-image findings, but
  "ship on day one with four Criticals in the base image" is a decision rather than an accident.
- **SimpleSAMLphp's session store connects as the superuser `manifest`** (found 2026-09-14). §9 says that store has
  "its own credentials"; `infra/idp/config/config.php` gives it the superuser the control plane writes SP rows with.
  The spec is right and the implementation is not; not fixed.
- **The long-term fix for `passport-ubcshib` is UBC's.** `@node-saml/passport-saml@5.1.0` audits clean, and moving to
  it is the "strictly safer for every consumer" change C6 permits. It does not block Manifest — but somebody should
  tell the owners of the six UBC applications that depend on a library with a critical signature-verification
  advisory. If it is fixed upstream, ship it as **0.2.0** so apps on `^0.1.6` adopt deliberately; its other gaps are
  the unreachable MACE entry and missing OID entries for `uid` and `eduPersonPrincipalName`.
- **Does LiteLLM's embedding `encoding_format` bug affect a commercial provider, or only the Ollama path?** Unmeasured
  — only Ollama was reachable offline. Cheap to settle the first time anyone has a provider key.
- **Starting the UBC external track (C4)** — the trigger fired 2026-09-15; see §2 and `docs/external-track.md`.

### Decided — do not re-raise

- **An APP route DOES need `stream_close_delay`, and now carries it** (2026-09-18) — **RAISED 2026-09-16, and closed by the measurement Rich asked for** (P5c R2). P5c Task 1's M8 held a WebSocket open through a runtime route shaped exactly as `buildRoute` shapes one, then inserted an unrelated route: **without the field `CLOSED code=1001`, 2 ms after the reload; with it `SURVIVED 17971 ms`, still open.** So one app's deploy, anywhere on the platform, was disconnecting every WebSocket every OTHER app held. `routing/caddy.ts`'s `buildRoute` now sets `stream_close_delay: 3_600_000_000_000` — **nanoseconds, because `"1h"` is a different type the admin API refuses** — matching the hour the console's own site has carried since P5a, and `routing/caddy.test.ts` asserts the VALUE (a `toBeDefined()` would pass on a route the edge rejects). **What the hour costs is recorded rather than hidden**: a stream opened on an old config keeps the old handler, and so the old upstream, alive for up to that long — bounded in practice by §11's retire drain, after which the container is gone and the connection breaks anyway. **No spec change was needed.** *Worth reading for a second reason:* **the plan's own snippet for this measurement would have answered it BACKWARDS** — it drives the admin API with node's `fetch`, which undici gives `Origin: ''` and Caddy refuses `403`, and it checked neither `r.ok` nor `r.status`, so it would have reported `SURVIVED` on a reload that never happened. P5c sitting 1's F1, and [`spikes/p5c-baseline/`](spikes/p5c-baseline/README.md).
- **The edge's `@outside` refusal is proved in both directions** (2026-09-17) — **closed without ever weakening the running edge**, and no longer Rich's. `make verify`'s gateway check reads the Caddyfile on disk and was watched going red with the rule removed; `routing/edge-source-refusal.docker.test.ts` proves the causal link against a throwaway Caddy on every `pnpm test:docker`. The documented manual procedure is **superseded — do not run it**: it is the only option that leaves the real edge weakened for a window and needs the control plane restarted afterwards. §2's *Outstanding* has the detail.
- **P5b's four spec actions** (2026-09-17) — **ALL FOUR APPROVED AND APPLIED**: §6's `DelegatedToken` gains `name`, `token_hash` and `revoked_at` and `PendingAction` gains `expires_at` and `consumed_at`; §20 records that Phase 1 sessions are stateless **and what that costs** (a role change reaches a person at next sign-in; a session cannot be revoked before it expires), with the store still the design and the divergence the reason to build it; §20 records that step-up lands with the routes it protects while the privileged set is named and tested from Phase 1c; and **D24's "create projects" is reconciled in BOTH places it appeared** — D24's own rationale column and §20's credential table — in favour of the scope rule. `manifest-decisions.html` carried the same claim in plain language and was corrected with them. P5b's *Spec actions*; the spec commit is named in the roadmap.
- **`egress.allow` may not name a platform surface** (2026-09-16) — §12 applied; enforcing it is the roadmap's tracked hardening item, after P5a. Only the implementation is open.
- **P5a's R6–R9** (2026-09-16) — builds answer `202`; `openapi-typescript` + `openapi-fetch`; twelve sittings; spec actions applied first. P5a's *Decisions Rich made*.
- **P5's five** (2026-09-16) — starters; P5a/P5b/P5c; one console origin through the edge with §23's reserved labels and a slug check; a `/v1` prefix; no acceptance on a second machine. The P5 brief's §5; spec `1d88846`, `ecf5f29`, `5065c13`.
- **§12's scan gate blocks only on a Critical or High with a published fix** (2026-09-08) — §12, `build/scan.ts`.
- **P4a's and P4b's spec actions** (2026-09-14 and 2026-09-15), among them §10's per-user AI budget validated not enforced in Phase 1, §14's stream as built with no app-output tailing, and §10's agent-key row from Phase 3 — the roadmap and each plan's *Spec actions*.
- **Zero-downtime redeploys required, as P4c, before P5** (2026-09-14) — executed; P4c's *Decisions Rich made*.
- **A sign-in under way when a route moves may fail once** — tolerated (P4c).
- **The Manifest IdP's SimpleSAMLphp is kept current, not pinned** (2026-09-16) — a sitting that runs `make seed` records the version it left running; P4c finding 62.
- **Task 12's entropy redaction rule** (2026-09-14) — P4b Task 12.
- **Where the service-binding wire lands** (2026-09-06) — P3 Task 15; platform bindings apply after the app's own `env`.
- **The external track starts once the local proof works end to end** (2026-09-05) — that trigger has fired; starting it is the open item above.
- **`make doctor` asserts the host tools the control plane spawns** (2026-09-09); **P3's six spec actions** (2026-09-07, `53ecb1d`); **the §11/§23 hostname rule — the environment lives in the zone** (2026-08-31); **`make up` re-adds the `127.0.0.2` alias** (P1); **the hung Docker credential helper** (2026-09-14, cleared by restarting Docker Desktop).

---

## 9. Lessons — each one was paid for

These are about *how to work here*, and they are in the roadmap too, which is the
maintained copy.

- **Integration is where the false greens sit, and units cannot reveal them.** Two of
  the three worst discoveries in this project arrived the first time something ran end
  to end: P3's Task 15 found that **no build had ever succeeded**, and its Task 17
  found that **no deploy had ever succeeded either** — through seven defects of one
  shape, *the test constructs the value correctly and the running system re-derives it
  wrongly*. Both were invisible behind a fully green suite of 74 Docker tests, because
  a test hands the driver what it built while the control plane rebuilds it from a
  slug. **Schedule the end-to-end task early and drive it through the real entry
  point**, not through a harness.
- **A module with no call site is not built.** `waitForReady` and `edgeProbe` shipped
  in P3 Task 14 with passing tests and nothing called them until Task 17;
  `isSensitiveDiff` shipped in P2 and nothing called it for a whole plan. This is the
  same defect as the unwired boot entry point, and it has now happened three times.
  Every task should name its caller, not just its module.
- **Diagnosability is a feature, and its absence hides other defects.** A failed build
  recorded no reason at all (`void error`), and an unexpected 500 left no trace
  anywhere because the handler logged through a logger the server was built without.
  Fixing both took minutes and immediately named four further defects that had been
  invisible.
- **A plan is not verified until it runs, and the gap is not small.** P2's written
  self-review found seven defects. Then executing just **four of its twenty-one
  tasks** found **five more**, and not one was findable on paper: a package manager
  that makes an un-named build script a hard error, a lint config whose glob dialect
  silently has no extglob, a linter that does not honour the `_` convention the
  plan's own code assumed, a negative control aimed at a target that could not fail,
  and an unguarded table index that turned drift into a crash in an unrelated test.
  **Five defects in four tasks.** P3's own self-review then found **seven** more,
  the worst being that no task wired the Docker driver into the boot entry point — so
  its `make demo`, the plan's entire acceptance, would have passed against the fake
  driver. **Acted on 2026-09-04**: plan-writing stops until P3 has executed. Treat
  "the plan is written" as a hypothesis, and execute the cheapest representative
  slice early rather than banking a large unexecuted stack.
- **A green result is not evidence a control is in force.** S1's first build appeared
  to succeed while silently using the public npm registry instead of the mirror.
  Only checking the mirror's storage caught it.
- **Some defects are invisible to every test that could be written.** Executing P2's
  Tasks 12–21 produced 27 defects; **six were type errors** that `pnpm test` cannot
  see, because Vitest strips types without checking them, and **five were test
  isolation** — the suite passed or failed on the order Vitest happened to pick, and
  three suites had been green only because the database happened to be empty. Neither
  class is findable by reading a plan, and neither is findable by running its tests.
  The gates are the plan: run all four, and run the suite twice.
- **A guard whose enabling condition is written twice is a guard.** P2's
  `/auth/dev-login` passed `devAuthEnabled: true` as a literal because the route was
  only registered when the shim was on. Removing that single registration guard made
  the endpoint mint **real sessions** — a complete authentication bypass, one line
  from live, and it read correctly in review. The same shape produced an IDOR in
  `GET /builds/:id`. Two independent reads of one setting cost nothing.
- **Assert the shape of the answer, not that an answer arrived.** S3 ran six toolkit
  checks and all six passed; one was returning 192 numbers where 768 belonged, almost
  all zero, with no error anywhere. "It returned a vector" and "it returned the right
  vector" are different claims.
- **Treat a briefing document as evidence, not fact.** `START-HERE.md` stated that
  `/etc/resolver/test` pointed at a dead nameserver. It did not, and that one wrong
  premise forced the zone change.
- **A document that restates a number drifts from it.** ORIENTATION §2's *Code* row
  carried `make doctor` 14, `make verify` 31, `pnpm test` 224 and then 332, and
  `pnpm test:docker` 48 — **five stale figures at once**, four releases behind, while
  §3 and §7c of the same file had them right. A new agent's first act is to run the
  gates and compare, so the cost lands on exactly the person with the least context.
  Fixed structurally on 2026-09-07 rather than by correcting the numbers: **§2 now has
  one box, measured and dated, and every other mention points at it.**
- **Briefings go stale in days.** A handoff was sending its reader to a finished spike
  one day after it was written, and three of twelve "already pulled" images vanished
  between sessions. Anything stating current status needs an owner and a date — which
  is why the ledger exists and why this file says which of its sections decay.
- **Handoff chains strand durable knowledge.** The machine landmines in §4 spent a day
  behind a SUPERSEDED banner because they lived in a dated handoff. Durable content
  belongs in a durable document; only *what to do next* belongs in a handoff.
- **Prefer ownership-adjusted risk.** S2's risk was priced as existential and was not,
  because `docker-simple-saml` is ours. Ask what a "no" costs *given what we control*
  before ranking a risk.
- **Run the plan self-review; record what it caught.** P1's found five defects, the
  worst being a verification script that used `apk add` — which needs the network, so
  the offline acceptance test would have failed on its own harness. Writing down what
  the review caught stops the next reader mistaking a fix for a mistake.
- **Spikes came in far under their timeboxes** (~1.5 h, ~0.5 h, ~2 h, ~2 h against 3,
  2, 3 and 2 days). Do not re-plan the schedule on that: all four were the tractable
  ones, and the estimate that matters — C4's turnaround — is still unmeasured.
