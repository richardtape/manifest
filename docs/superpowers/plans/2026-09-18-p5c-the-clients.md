# P5c — The Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A faculty member drives §22's whole journey by clicking, in a browser, at `https://console.manifest.internal` — sign in with CWL, create a project from a blueprint and a starter, watch it provision, build it and read its logs as they are written, deploy it to staging, open the running app, ask for production and see what a first launch still needs — through a console that imports **nothing but the generated client**; a front-end developer drives the same contract with no platform running, against `manifest-mock`; and one script proves the whole thing headlessly.

**Architecture:** Two new workspace packages and one script. `packages/console` is a plain React + Vite client served by a host process on 7104, which the edge forwards to on the console's own origin — so its session cookie, its CSRF origin and the API are one origin with no CORS. **Every call it makes to the API is a function in one file, `src/api.ts`**, over `@manifest/contract`; components call those functions and never the client, which is what makes three things checkable at once — the import boundary, the operation-coverage gate (D22's *"is the API complete?"* as a build failure), and a Node test of the console's calls against the mock with no DOM. `packages/mock` is a `node:http` server over the same `openapi.json`, serving fixtures typed by the generated types and validated against the document, with a scripted WebSocket that replays a build's log lines and a deploy's state transitions. `scripts/ci-acceptance.sh` runs the headless half — the four gates with their counts asserted, then the three demos that drive the contract — and the clicked half is a person's, because an agent driving Chrome cannot type a password.

**Tech Stack:** TypeScript on Node 24.12.0, **React 19 + Vite 7** (D11's stack, versions taken current at install — see Decision 2), `ws` 8.21.3 (already pinned in this workspace) for the mock's stream, **`ajv` with its 2020-12 dialect** for validating the mock against an OpenAPI 3.1 document, Vitest 2.1, the custom Caddy 2.11.4 edge, `@manifest/contract` generated from `packages/contract/openapi.json`. **This plan's Task 2 is the one sitting with the network on**; nothing after it installs anything.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§22** in full (the reference console D22, the journey it drives, the CI half, D23's eight principles); **§16**'s *Acceptance*, *Contract* and *API completeness* tiers; **§21** *The front-end in the local topology* and the platform inventory's 7102/7104 rows; **§26** *The primary screen is the queue*; **§17**'s 1c row and its *demo*; **§23** for hostnames and the slug check; **§24** for the audience question; **§13** for `LaunchReadiness`; **D11**, **D22**, **D23**, **D24**, **D25**, **D29**, **D31**.

**Brief:** [`2026-09-16-p5-brief.md`](./2026-09-16-p5-brief.md) — **§10, *What P5c INHERITS*, and its subsection *The one thing to get right first*.** §5's decisions and §3's measurements still hold. **§2 and §4 of that brief are STALE for this plan and say so in their own headings** — they were written before P5a and P5b executed, so §2.1's *"18 routes a client could use"* and §4's gap list describe an API that no longer exists. Use them for the arguments they make, never for the facts they state. **§8's traps are live and every one of them applies here.**

**Predecessors:** [`2026-09-16-p5a-the-contract.md`](./2026-09-16-p5a-the-contract.md) (executed 2026-09-17, 146 findings) and [`2026-09-17-p5b-delegated-tokens.md`](./2026-09-17-p5b-delegated-tokens.md) (executed 2026-09-18, 116 findings). **Read both plans' *What this plan does not build*** — between them they name this plan's whole scope — **and P5b's sittings 8 and 9**, the two that produced a client and then proved one.

**Roadmap:** the **P5c** row in [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md).

---

## How this plan is to be executed — NINE SITTINGS, one per session

**The pattern that carried P4a's last twelve tasks, all of P4b, all of P4c, all twelve of P5a and all nine of P5b: one sitting per session, with a check-in at each boundary**, so a session limit can never land mid-task. **Executing two sittings in one session is not a shortcut** — it is how a limit lands inside a task. This plan commits after every task; a stop *between* tasks is recoverable, a stop *inside* one is not. **"Sitting", not "phase"** — this project uses *Phase 1c* and *Phase 2* for §17's product roadmap.

**Rich agreed nine sittings on 2026-09-18, choosing the leaner of three splits** (eleven and thirteen were the alternatives). He was told what the lean split costs and took it: **sitting 5 carries both streaming screens**, and the streaming screens are where this project's defects have historically been (P4b sitting 9, the stream that authorized after the upgrade; P5a sitting 2, the reload that closed every socket). **If sitting 5 runs long, stop after Task 7 and sweep** — §6 rule 8 is worth more than finishing a task.

| Sitting | Tasks | What it delivers | Status |
|---|---|---|---|
| 1 | 1 | **The measurements this plan rests on**, before any code: whether the edge serves a host process on 7104 on the console's origin, what a real browser sends through it, whether a WebSocket upgrade survives that hop, whether a new package is even seen by the four gates, and **whether an app's own WebSocket is cut by another app's deploy** — the measurement §8's open question has never had. **Alone, and first** | **DONE 2026-09-18 — 19 findings.** All ten measurements ran; no task boundary moved. **§8's question is ANSWERED and CLOSED: the socket IS cut, and `buildRoute` now carries `stream_close_delay`.** `[M<n>]` correction blocks on Tasks 1, 2, 4, 13 and 14 |
| 2 | 2–3 | **`packages/console` and `packages/mock` exist and all four gates see them** — the one sitting with the network on — and **the console's import boundary**, watched failing before a single screen exists | **DONE 2026-09-18 — 10 findings.** React 19.3.0 + Vite 8.3.0, `ws` 8.21.3, `ajv` 8.20.0 with `ajv-formats` 3.0.1, every version exact, `pnpm audit --prod` clean. **NOTHING AFTER THIS SITTING MAY INSTALL A PACKAGE.** Both of the task's own step orders were wrong and are corrected in place |
| 3 | 4 | **The console is served at `console.manifest.internal`, signs a person in with CWL and knows who they are** (§22 step 1): the Caddyfile's placeholder replaced, the shell, the router, the error surface, and the one file allowed to name `fetch` | **DONE 2026-09-18 — 9 findings.** §22 step 1 CLICKED: Rich typed `instructor` and the header read **Test Instructor `ins000001`**. **The plan's claim that no gate sees the Caddyfile's console line is WRONG — `make doctor` AND `make verify` both went red** and both are fixed (F3). `signOut` never checked its answer (F4). `<Ago>` is the one shared bit still uncalled; **Task 6 owes it a caller** |
| 4 | 5–6 | **My projects, and creating one** — the slug check while it is typed, the blueprint and starter catalogue, §24's audience (§22 step 2) — and **the project screen with its live event stream** (§22 step 3) | **DONE 2026-09-18 — 9 findings.** §22 steps 2 AND 3 CLICKED. The stream's liveness was PROVED (a `token.minted` published from a terminal arrived in the open tab; the same event on another project did not). **Two of the plan's own controls could not fail** — the idempotency row names the wrong consequence, and `stream_close_delay` did not fire, measured two ways (F7). `<Ago>` has its caller |
| 5 | 7–8 | **A build whose log lines arrive as they are written** (§22 step 4) and **a deploy to staging whose instance states arrive the same way**, with the app's URL to click and an Incident when it fails (§22 steps 5–6). **Both streaming screens; the sitting Rich was warned is the heavy one** | **DONE 2026-09-18/19 — 13 findings.** §22 STEPS 4 AND 5 CLICKED, AND STEP 6 AS FAR AS THE SIGN-IN (its *write a note; ask the LLM* half is `make demo-ai`'s and Task 14's): a build watched line by line, a release, a deploy to staging with four states live, the app opened and signed in to with CWL, and a redeploy that interrupted nobody (14 consecutive `200`s from the app's own tab). **The stream alone is not the log** — `LogFrame` is never replayed, so `getBuildLog` is load-bearing and the task never mentions it. **Three of the plan's claims were wrong** (`<Refusal>` and `launchReadiness`; `{}` is not the repository's HEAD; control row 3 cannot fail) and Task 8's row 1 needed an environment whose FIRST deploy fails |
| 6 | 9–10 | **Request production** — `LaunchReadiness` with its blocked items and why (§22 step 7) — **the fleet** (§26, admin only), and **delegated tokens**: minted once, listed, revoked | **DONE 2026-09-19 — 12 findings** (F12 found after the close, by Rich driving the console by hand). **§22 STEP 7 CLICKED, and an administrator read the fleet. The checklist's two paths measured **byte-identical** and now share one renderer. **`<Ago>` lied about every future instant** — a 30-day token read `expires 0s ago` with all four gates green — and is now the direction-aware `<Instant>`. The D22 finding §7e predicted is CONFIRMED: the document cannot mark D24's privileged four. Two of the plan's own control rows are weaker than they read |
| 7 | 11 | **§26's queue as a screen**: the question an agent asked, who asked it, how long it has waited, confirmed or rejected by a person in their own words. **The first time D24's loop is operated by a human rather than by `curl`** | **DONE 2026-09-19 — 8 findings.** D24's loop CLICKED end to end: a token minted by clicking, the agent refused `403 TOKEN_ACTION_PENDING`, the question on screen **576 ms later with no reload**, confirmed, the agent's own retry with the same key **201**, a FRESH key making a new question instead, a rejection's sentence reaching the agent verbatim, one question left waiting. **The plan and §7e were both wrong that Task 11 gives `<Refusal>`'s `pendingAction` a caller — it can never have one** (F1). `consumeAction` and `addMember` publish nothing (F3), which is what earns `getPendingAction` its caller |
| 8 | 12–13 | **`manifest-mock`** — the contract served from fixtures with scripted streams, validated against the document, and the console driven against it with no platform — and **the CI acceptance script**, the operation-coverage gate and `@manifest/contract` `1.0.0` | **DONE 2026-09-19 — 11 findings.** All 34 operations served from fixtures, the console's WHOLE data layer driven against them in Node, and the journey walked in a BROWSER with no platform running. D22's coverage gate is green with `DELIBERATELY_UNCALLED` **empty**, and was watched failing three ways; `make ci-acceptance` was run for real and both headless journeys are green over the **1.0.0** contract. **`make doctor` failed `CLAIMED BY SOMETHING ELSE: 7102` — the THIRD time on that check, predicted by name in `doctor.sh`'s own comment** (F9). A token fixture named a capability that does not exist and **neither `tsc` nor Ajv can see that** (F1); a fixed DEADLINE made the queue screen unreachable (F6) |
| 9 | 14 | **The acceptance**: the journey clicked by a person and run headlessly by the script, over one contract, with its negative controls. **Alone, and last** | **DONE 2026-09-19 — 16 findings. P5c IS EXECUTED, AND SO IS PHASE 1c.** `make ci-acceptance` ran THREE times, all `0 failed, 0 moved`, and **§22's journey was CLICKED, all sixteen rows** (R3: the agent drove and read every page, Rich typed every password; 50-frame GIF). Step 4's decision applied — a TENTH offline step, the console's preflight. **F11: signing out of a deployed app lands on a raw JSON `404`** — Manifest's own SLO URL answers `POST` only while SAML's logout binding sends `GET`, and every gate is green through it. **Step 1's premise was overturned** — it asks for three machine states and the script normalises all three into one; the runs take 228 s, not the ~15 min budgeted. Five of six controls measured; **(b)'s clicked half is the one that was not**. **F11 WAS THEN FIXED on Rich's instruction (`b23674b`), which is the sixteenth finding**: single logout works end to end, and F16 — the first fix passing every test while still broken, because the redirect binding's values are URI components and not form fields — is the one to carry forward |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. the four gates from *Global Constraints*, plus `pnpm test:docker` for every sitting that touched `routing/`, `infra/` or a `*.docker.test.ts` — **which for this plan is only the sittings that change the Caddyfile (3) or app routes (1, if its measurement leads to a change)**, because the console and the mock are new packages the control plane does not import;
2. a dated entry in *What executing this plan found* — the tasks, every defect with the measurement that found it, the negative controls, and the gate numbers;
3. **the sittings table above, updated** — mark the sitting done, move the `← next` marker, say how many findings it produced;
4. **the close-out sweep in ORIENTATION §6**, whose first line is the roadmap ledger. The gate numbers are stated in three documents — ORIENTATION §2's box, `README.md` and `RUNBOOK.md` — and move together. **§6's post-sweep check has found a defect in every P5b sitting from the third onwards; run it by opening what you pointed at and counting it, never by re-reading the sentence.**

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Task 1 may move task boundaries — that is its job — and if it does, re-cut the sittings before starting sitting 2 and say so in the session record. Three rules survive any re-cut: **Task 1 stays first and alone**, **Task 2 stays the only sitting with the network on** (nothing after it installs a package), and **Task 14 stays alone and last**.

---

## Read this first — what this plan knows that the brief does not

Read from the code and the executed plans on 2026-09-18, while this plan was written. **Every item is a fact about the platform as it stands, not a prediction**, and Task 1 re-measures the ones marked *(T1)*.

1. **The API is 34 operations and the console can plausibly call every one of them.** `packages/contract/openapi.json` declares, under `/v1`: `getMe`, `listProjects`, `createProject`, `getProject`, `checkSlug`, `listBlueprints`, `getBlueprint`, `getKnowledgePack`, `getSpec`, `validateSpec`, `listEnvironments`, `getEnvironment`, `deploy`, `startBuild`, `listBuilds`, `getBuild`, `getBuildLog`, `createRelease`, `listReleases`, `getRelease`, `listIncidents`, `getLaunchReadiness`, `listMembers`, `addMember`, `removeMember`, `mintToken`, `listTokens`, `revokeToken`, `listPendingActions`, `getPendingAction`, `confirmPendingAction`, `rejectPendingAction`, `listFleet`, and the stream `streamProjectEvents`. **There is no operation a session cannot use** — `listFleet` is administrators only, which is a role, not a second client (D31). That is what makes Task 13's coverage gate able to start with an **empty** exemption list. *(T1: M7 re-counts them.)*
2. **Thirteen operations carry a header or query parameter the generated types make mandatory.** `Idempotency-Key` on all ten mutations (`createProject`, `startBuild`, `createRelease`, `validateSpec`, `deploy`, `addMember`, `removeMember`, `mintToken`, `revokeToken`, `confirmPendingAction`, `rejectPendingAction` — eleven, in fact), `?expand=environments` on `getProject`, `?tail=` on `getBuildLog`. **The client does not add the idempotency key and must not**: D23.6's whole point is that a *retry* reuses it, so `idempotencyKey()` is called once per user action at the call site. *(T1: M7.)*
3. **`createManifestClient` sets NO headers in a browser** — `client.ts`'s `inBrowser` branch is empty — because the browser sends its own cookie and its own `Origin`. So the console constructs it with `{ origin: window.location.origin }` and nothing else, and **a Node test of the same data layer gets the headers, which is a difference to hold in mind when a test passes and a click does not.** *(T1: M2 reads what a real browser sent.)*
4. **`subscribe` already works in a browser**: `stream.ts` branches on `document` and uses `new WebSocket(url)`, letting the browser supply `Origin` and the cookie. The route requires that `Origin` on an upgrade that carries the session cookie (`assertSameOrigin`, P5a Task 4), and browsers always send it. *(T1 measures it rather than trusting the specification.)*
5. **The stream is subscribe-then-replay-then-flush, and it sends a `control` frame as the boundary.** `api/routes/events.ts` holds frames published during the replay, sends the replay, sends `readyFrame`, then flushes the held ones minus any the replay carried. `subscribe`'s `ready` promise resolves as that control frame is handed to `onFrame`. **A client that falls behind is closed with `1013`** and is told to reconnect and be replayed; `REPLAY_LIMIT` bounds what it gets back.
6. **Every project created over HTTP already has three events before anything else happens to it** — `project.created`, `repository.seeded`, `spec.validated` (P5a Task 11). A console that subscribes after creation sees them in the replay, which is exactly what §22 step 3 wants to render.
7. **There are 22 event types** (`observability/events.ts`), and each one's `machineDetail` is a strict schema in the document's `EventFrame` union. **A `zod/v4` union's refusal names no path**, so a console that parses a frame and fails learns nothing useful — it should switch on `frame.kind` and then `frame.type` and render `humanMessage`, which §14 wrote for exactly this.
8. **`PendingAction` carries `expiresAt`, `waitingSeconds`, `state` and `bodySha256`, and never the body** (P5b Task 8) — so the queue screen can show a lapsed question as lapsed **without** the sweeper having run. That is what makes Decision 8 below implementable rather than a rationalisation.
9. **Two endpoints the console needs are outside `/v1` and therefore outside the generated client**, by D23.8, and both are listed with their reasons in `api/unversioned.ts`: `GET /auth/login` (a browser navigation, whose URL the IdP completes) and `POST /auth/logout` (the registered SLO URL). `GET /auth/login?returnTo=<path>` accepts a same-origin path — `safeReturnTo`'s regex is `^\/(?!\/)[^\s\\]{0,511}$` — stores it in the `manifest_login` cookie, and the callback redirects there. **So the console's own routes are legitimate return targets, which is what makes signing in from a deep link land back on that page.** *(T1: M6.)*
10. **`POST /auth/logout` is NOT exempt from the origin check** (only `POST /auth/saml/callback` is, P5a Decision 15), and it answers `204` with no body. A browser `fetch` sends the origin itself.
11. **The control plane binds `127.0.0.1:7100` and the edge reaches it as `host.docker.internal:7100`** — that is the existing `reverse_proxy` in the console site. So a Vite server on `127.0.0.1:7104` is reachable the same way, and nothing has to bind `0.0.0.0`. *(T1 measures it with a trivial server, before Vite exists.)*
12. **The Caddyfile's console site already carries `stream_close_delay 1h`** on the `/v1/*` and `/auth/*` proxy, so **the console's own event stream survives an edge reload** — which every deploy causes. **App routes carry nothing**, which is §8's open question and Rich's R2. *(T1: M8 — the one measurement here that is Rich's rather than the plan's.)*
13. **`packages/contract`'s only runtime import is `openapi-fetch`.** `dist/index.js` re-exports three modules and `schema.js` is a types-only export erased by `verbatimModuleSyntax`, so there is no Node builtin in the graph a browser bundle would choke on. **`dist/` does contain compiled test files** (`client.test.js` imports `openapi-typescript` and `vitest`), which nothing in the entry graph reaches — do not be alarmed by them, and do not import from `dist` directly. *(T1: M5.)*
14. **A new package is NOT picked up by `pnpm test`.** `vitest.workspace.ts`'s third project, `packages`, lists two explicit globs — `packages/contract/src/**/*.test.ts` and `packages/journey/src/**/*.test.ts`. A test file in a third package runs under no project at all and is **silently not run**, which reads exactly like a passing suite. *(T1 measures it; Task 2 fixes it and watches the fix.)*
15. **`pnpm typecheck` is `pnpm -r typecheck`**, so a package with no `typecheck` script is silently skipped, and `tsc` is the only gate that sees a whole class of error here.
16. **Prettier owns `packages/` and nothing else**, and `.prettierignore` already names the two generated files. A new package under `packages/` is formatted by `pnpm format` and checked by `pnpm format:check` with no configuration — but `.html`, `.css` and `.tsx` are all Prettier's, so **write them formatted or the gate goes red on files no test touches**.
17. **`packages/journey/src/boundary.test.ts` is the import boundary to copy, not the one P5a Task 7 describes.** It strips comments with a scanner (`'//'` inside a string is not a comment), asserts what it still FOUND so a scanner that ate the source cannot pass with an empty violation list, counts the files it read imports from, and has a test of the stripper itself. It was made this way after it matched English prose in a doc comment and turned `pnpm test` red on a file with no forbidden import (P5b sitting 8, F3).
18. **The eslint boundary rule is a `regex` pattern, not a `group` glob**, because ESLint 9's gitignore dialect cannot express *"only these"* — `eslint.config.js` says so at length for the control plane's module boundary, which is why that one is a test instead. Copy the journey's `no-restricted-imports` block, which works.
19. **`scripts/demo-journey.sh` and `scripts/demo-token.sh` are the two headless drivers of the contract already**, and both follow P5a Decision 38's split: signing in is `infra/lib/idp-login.sh` (outside the contract by D23.8), and everything the API does is TypeScript in `packages/journey` that imports nothing but `@manifest/contract`. **The CI script orchestrates these rather than replacing them**, which is why Task 13 is small.
20. **`scripts/offline-acceptance.sh` has nine steps** and is Rich's to run with the network off. The CI script and it are the two headless drivers of the same platform; read it before designing the CI one (the brief's §10 says so in terms).

---

## Decisions Rich made, 2026-09-18

**Do not re-open any of these.**

**R1. Nine sittings, the lean split.** Offered eleven (recommended), nine and thirteen; he took nine, which merges the two streaming screens into sitting 5 and the mock with the CI script into sitting 8. The risk was stated when he chose: sitting 5 is the heavy one. *Rejected: eleven, which gave builds and deploys a sitting each.*

**R2. §8's `stream_close_delay` question is answered by a MEASUREMENT in Task 1, not by reasoning.** The console's own stream is safe — its site sets an hour — so P5c does not force the question the way §7e supposed; what the absence breaks is an app that holds its own WebSocket to its users, and no Phase 1 app does. **Task 1's M8 deploys a stub app that holds a socket through a runtime route and then causes an unrelated config reload.** If the socket is cut, this plan sets the field on app routes in `routing/` and records the value; if it is not, §8's item is closed as *measured, and not a problem in Phase 1*, with the measurement. Either way the four-plan-old *not measured* note ends. *Rejected:* setting the field on every app route now, on reasoning — it changes every app's route and an old handler then outlives its config by that long; and leaving it open for a fourth plan running.

**R3. The clicked half of the acceptance is SHARED, and it is recorded.** An agent driving Chrome cannot type a password (ORIENTATION §4, measured 2026-09-16) — the extension refuses even a test user's, and it needs a per-site permission for `idp.manifest.internal` to see the IdP's pages at all. So in Task 14 the agent drives Chrome and reads every page, Rich types `student` / `instructor` in the agent's tab at each CWL sign-in and says so, and the run is recorded as a GIF. **The plan also carries the checklist in full** so Rich can run it alone afterwards. *Rejected:* a checklist Rich runs alone with the agent never seeing a page, and a shared run with no recording.

*Settled before this plan and not to be re-opened either:* P5 is three plans, each written after the one before executes (P5 R2); the console and the API share one origin behind the edge at `console.manifest.internal` (P5 R3); the contract is versioned by a `/v1` path prefix (P5 R4); **P5c's acceptance does NOT depend on a second machine or a clean clone** (P5 R5 — it stays in RUNBOOK's *Known gaps*); a project is created from a blueprint and a starter (P5 R1); a deploy returns once the new instance serves (P4c R3); builds answer `202` and end on the stream (P5a R6); sessions stay stateless and step-up re-authentication lands with the routes it protects (P5b R1, R2).

---

## Decisions this plan makes, and why

Fifteen questions below Rich's line. Each says what it rejected and what changing course would cost.

**Decision 1. The two packages are `packages/console` and `packages/mock`.** §5's module map writes them as `console/` and `mock/`, and that map is conceptual: `contract/` is `packages/contract` and has been since P5a. Workspace packages get the four gates, `pnpm -r typecheck` and Prettier for free. *Rejected:* top-level directories, which would need their own lint, typecheck and format wiring for no gain. *Changing course* is a `git mv` and four config lines.

**Decision 2. React 19 + Vite 7, versions taken current at install rather than pinned to a remembered number.** D11's stack is React + Vite and §26 says the admin console inherits `console/`'s shape, so this choice is the one Phase 2 lives with. **No version is written into this plan**, because a pin with no evidence behind it is how P2 came to specify Node 22 on a machine that has only 24: Task 2 installs what the registry offers on the day, records the exact versions and the `pnpm audit` of the closure, and pins them exactly in `package.json`. *Rejected:* **no framework at all** — three of this console's screens are lists that grow from a socket, and hand-rolled DOM diffing for those is more code than React is, with the admin UI then inheriting a shape D11 does not describe; **Next.js or Remix** — both are servers, and the console must be a static client of the published API or it is no longer proof that the API is sufficient. *Changing course* after Task 4 means rewriting every screen.

**Decision 3. No router dependency — about forty lines over `history.pushState` and `popstate`.** The console has six routes (`/`, `/projects/:id`, `/projects/:id/queue`, `/projects/:id/tokens`, `/blueprints`, `/fleet`). A router library is a supply-chain surface (§20) and a second thing to learn for a client whose quality bar is *"plain but presentable"*. Real paths, not a hash, because `safeReturnTo` accepts a same-origin path and a hash never reaches the server — which is what lets a deep link survive a sign-in. *Rejected:* `react-router` — its own history model, its own testing story, and a dependency whose version the admin UI then inherits; a hash router, which would make `?returnTo=` useless.

**Decision 4. The console is served by a host process on 7104, exactly as §21's inventory says, and the Caddyfile's placeholder `respond` becomes a `reverse_proxy`.** `vite dev` for developing it (HMR), `vite preview` for the acceptance and for `make demo-console` — the same port, the same Caddyfile line, and the acceptance therefore runs against a real production build. **No spec action is needed**, because §21 already places it there. *Rejected:* **Caddy serving a bind-mounted `dist/`** — it is a `compose.yaml` change, which recreates `manifest-caddy` and drops every runtime route with it, and it diverges from §21's inventory for nothing gained; **a container for the console**, which spends one of C1's nine on a development client.

**Decision 5. The console reaches the API through `@manifest/contract` and nothing else — EXCEPT the two sign-in endpoints, which live in exactly one file.** `GET /auth/login` is a browser navigation and `POST /auth/logout` is one `fetch`; both are outside `/v1` by D23.8 and both are listed with their reasons in the control plane's own `api/unversioned.ts`. This is P5a Decision 38's split — *signing in is the browser's and the IdP's business* — applied to a browser instead of a shell script. **`src/auth.ts` is the only file in the console allowed to name `fetch` or a `/auth/` path, and Task 3's test asserts it**, because the import boundary cannot see a `fetch`: a screen that quietly called `fetch('/v1/projects')` would pass every import check ever written. *Rejected:* putting the two endpoints in the generated client — they are deliberately unversioned and `UNVERSIONED` exists to say so; leaving the rule to review, which is what the boundary test exists not to do.

**Decision 6. One data layer: every API call the console makes is a function in `src/api.ts`, and no component ever holds the client.** `createApi({ origin, session? })` returns a frozen object of named functions. Three checkable things fall out of it, and no other arrangement gives all three: **(a)** Task 13's coverage gate reads one file to answer D22's question; **(b)** the console's calls are testable in Node against `manifest-mock` with no DOM (Decision 7); **(c)** `origin` is a parameter, so the same layer serves the browser (`window.location.origin`) and a test (`http://127.0.0.1:7102`). *Rejected:* calling `client.GET` from each component — the coverage gate would then be a scan of every `.tsx` file, which is the shape that matched English prose and turned a gate red (P5b sitting 8, F3); a data-fetching library, which is Decision 2's rejection again.

**Decision 7. The console has NO DOM test tier.** Its screens are proved by a person clicking them (Task 14) and its **calls** are proved in Node against the mock (`api.test.ts`). *Rejected:* jsdom plus `@testing-library/react` — two more dependencies, a fourth vitest project and a test tier for a client whose stated job is to prove the API rather than to be correct itself, when **Rich's steer is explicit that the clicked journey matters more than breadth of coverage**. Stated here so the acceptance does not discover it: **a refactor of a screen can break the clicked demo with every gate green**, and the only thing that catches it is Task 14 being re-run.

**Decision 8. The pending-action sweeper does NOT get a timer.** This is the decision P5b deliberately left to *"the plan that builds the queue as a screen"*. The screen renders a question's state from `expiresAt` against the clock, not from the stored `state` — `PendingAction.expiresAt` is in the representation (*Read this first* 8) — so a row the boot-time sweep has not reached **displays as expired and offers no confirm button**, and `answerable` already refuses it `409 PENDING_ACTION_RESOLVED` on the same timestamp. A third piece of background work, on a timer this codebase has no precedent for, to correct a display the display can correct itself, is the no-caller shape ORIENTATION §9 names four times. **Task 11 writes the control**: a `pending` row past its own `expiresAt` renders as expired with no button, and deleting the clock comparison turns that test red. *Rejected:* a timer in `src/index.ts` — it would make the stored state honest for a screen that does not need it, and put a repeating write on a control plane that has two background workers today; *changing course* is one `setInterval` beside `recoverAtBoot` if Phase 2's admin console wants swept state for a different reason.

**Decision 9. `manifest-mock` is a plain `node:http` server with `ws` for the stream, serving fixtures typed by the generated types and validated against `openapi.json` by `ajv` on its 2020-12 dialect.** Types alone are not enough — `tsc` cannot see `additionalProperties: false`, a `format`, or a `pattern`, and every representation in this document carries them. **OpenAPI 3.1 is JSON Schema 2020-12**, so it is `ajv/dist/2020`, not the default export; the default draft-07 `Ajv` refuses the document's schemas and the failure reads like a malformed document. *Rejected:* **Prism or another OpenAPI mock server** — a large dependency whose behaviour becomes a thing to learn and pin, and it cannot script the WebSocket §21 requires the mock to have; **`ws` replaced by a hand-rolled upgrade handler** — the RFC 6455 handshake and framing are not worth writing when the workspace already pins `ws` 8.21.3.

**Decision 10. The mock's fixtures are hand-written TypeScript typed as `Schemas['Project']` and friends, not captured from a running platform.** They are held honest by two things rather than by their provenance: `tsc` on the generated types, and `ajv` against the document — and Task 12's own test drives the **console's data layer** against the mock, so a fixture the console cannot consume fails a test rather than a demo. *Rejected:* capturing real responses and redacting them — better fidelity on values, but it makes the mock depend on a running platform to be regenerated, which is exactly the dependency the mock exists to remove; recorded in *What this plan does not build* as the thing to do if a fixture is ever found lying.

**Decision 11. The CI acceptance script is `scripts/ci-acceptance.sh`, and this plan writes NO CI workflow file.** Nothing can run one: the journey needs Docker Desktop, Ollama with two models, a trusted CA in the macOS keychain and a loopback alias (C1, §21). **A workflow file that no runner executes is a module with no call site** — the defect shape this project has shipped four times. The script is the caller; RUNBOOK documents it; the day a runner exists the workflow is three lines that invoke it. *Rejected:* a GitHub Actions workflow now, and a "contract-only" workflow that runs the packages tier on a Linux runner — the second is defensible and is named in *What this plan does not build* rather than built, because no runner exists to prove it either.

**Decision 12. The CI script asserts test COUNTS, never exit codes alone.** `vitest run <path>` against a path that matches no file prints `No test files found` and exits 1 — and a summary-only filter swallows that line, leaving a result that looks exactly like *nothing failed* (P5b sitting 9, F5). Every tier the script runs has its expected count read from `ORIENTATION.md`'s box **at the time the script is written**, and a mismatch is reported as a number-that-moved rather than a failure, because a test added on purpose must not fail CI.

**Decision 13. `make demo-console` is a new target, beside the five that exist.** It starts `vite preview` on 7104, checks the edge serves it, prints the URL and the clicked checklist, and stops the server on exit. It signs nobody in — that is the person's part. *Rejected:* folding it into `make demo-journey`, whose red run would then be ambiguous about which client broke (P5b Decision 10's reasoning, applied again).

**Decision 14. `@manifest/contract` and the document's `info.version` go to `1.0.0` in Task 13, together, held equal by the test P5a Task 6 wrote.** P5a Decision 8 reserved exactly this: *"P5c sets `1.0.0` when the console has proved the contract."* It happens in Task 13 rather than Task 14 so the acceptance runs against the version that ships.

**Decision 15. The operation-coverage gate starts with an EMPTY exemption list.** `coverage.test.ts` reads every operation out of `packages/contract/openapi.json` and every call out of `src/api.ts` (plus the stream and the two unversioned endpoints from `src/auth.ts`) and requires each operation to have a caller **or an entry in `DELIBERATELY_UNCALLED` stating why**. All 34 are callable by a session (*Read this first* 1), so the list starts empty the way `ALLOWED_UNSET` and `PLATFORM_ONLY` do in the injection-drift tier. **This does not inflate the screens**: the gate is on the data layer, and an operation can earn its caller through a small affordance — a *re-validate* button, a members panel, a knowledge-pack link — rather than a screen of its own. If a sitting cannot justify one, it adds it to the list with a reason; it never weakens the gate.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec or from a dated measurement.

- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`. **Run `pnpm test` twice** — a suite that is not repeatable has a state leak.
- **`pnpm test:docker`** for every task that touches `routing/`, `infra/` or a `*.docker.test.ts` — **Tasks 1 (only if M8 leads to a change) and 4 (the Caddyfile) in this plan**. It needs `make up`, takes ~13 minutes, and **fails rather than skips** when asked to run. **Restart the control plane afterwards.**
- **`pnpm test -- <filter>` does not filter.** One unit file: `pnpm exec vitest run --project unit src/<path>`; one packages file: `pnpm exec vitest run --project packages packages/<pkg>/src/<path>`; one Docker file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>` — all from the repository root.
- **Vitest strips types; it does not check them.** `exactOptionalPropertyTypes` is on: `hint: cond ? x : undefined` is a type error, and a conditional spread is the fix. **A generated client is mostly types, so `tsc` over the console is the only check that it fits the contract at all.**
- **`pnpm test` TRUNCATES the control plane's tables** — so does one file, and so does `pnpm contract:write`. Run anything that needs a demo's rows **before** any Vitest run.
- **A route change is three files, in order**: the definition, then `pnpm contract:write`, then `pnpm contract:generate`. **`packages/contract/openapi.json` is generated — never edit it.** *This plan changes no route*, which is the point: if it needs one, that is a finding about the API's completeness and it goes in the record (D22).
- **No new dependency after Task 2.** Task 2 is the network-on sitting; if a later task believes it needs a package, **that is a finding to record and raise, not a step to take**.
- **The console imports only `@manifest/contract`, `react`, `react-dom`, `node:` builtins and its own `./` files** — and `src/auth.ts` is the only file that may name `fetch` or a `/auth/` path (Decision 5). Both halves are enforced, by ESLint **and** by a test, and each was watched failing.
- **Every mutation carries an `Idempotency-Key`** (D23.6), made once per user action with `idempotencyKey()` and **reused on a retry of that action**.
- **A session-bearing mutation or stream upgrade must carry `Origin: https://console.manifest.internal`** — in a browser the browser does it, which is why the console must be served from that origin and never from `127.0.0.1:7104` directly.
- **The console never polls** (D23.2). Everything that changes arrives on `WS /v1/projects/:projectId/events`; a screen re-reads a resource only when a frame says it changed.
- **Ask before `sudo`.** It cannot prompt from a tool call. Nothing in this plan needs it.
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`; `sed -i` takes an argument: `sed -i ''`.
- **The zone is `*.manifest.internal`**, ports **7100–7199**, and everything binds `127.0.0.1` explicitly — never `localhost`, which resolves to `::1` and times out in build tooling.
- **Never touch Valet**, and these four containers must survive: `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **`infra/caddy/Caddyfile` is a SINGLE-FILE bind mount.** A save that writes a new file and renames it over the old one — which the agent's edit tool does, and so does `git checkout` — leaves `manifest-caddy` on the deleted inode. `infra/lib/ensure-caddy-config.sh` compares hashes and restarts the edge to re-bind, but **after any Caddyfile edit run `make up` and read its output**, and after any `git checkout` of it, `docker restart manifest-caddy`.
- **`request.log.error` writes nothing** under `Fastify({ logger: false })`. Use `console.error`, and never put a token, a secret, a cookie or a session value in it (§14).
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built — **after committing the task** — and naming the test that goes red, with the assertion quoted. `git checkout <path>` restores from the INDEX, so an uncommitted task is destroyed by the restore rather than the experiment.
- **Every task names its caller.** A module with no call site is not built; it has shipped four times here.
- **Commit after every task**, on `main` — no branch, no worktree, no push — with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), ending with the attribution line the session's own system reminder gives.
- **`$SCRATCH` IS YOUR OWN SESSION'S SCRATCHPAD DIRECTORY, AND YOU MUST SET IT** before running any snippet below that uses it — Task 1's snapshots, its `index.html` probe and its cookie jar all do. Your harness gives you the path; export it once, at the top of the sitting, and **check it took**:
  ```bash
  export SCRATCH=<your session's scratchpad directory>
  [ -d "$SCRATCH" ] || { echo 'SCRATCH is not a directory — every snippet below will write to /'; exit 1; }
  ```
  **An unset `$SCRATCH` does not fail loudly**: `> "$SCRATCH/before.txt"` becomes `> /before.txt`, which is a permission error at best and a file in the filesystem root at worst. Nothing in this plan writes a temporary file into the repository.
- **EVERY SERVER A TASK STARTS IS STOPPED BY PORT AT THE END OF THE SITTING** — 7102 (the mock), 7104 (the console, `dev` or `preview`), and Task 1's two throwaways on 7104 and 7105. **`kill %1` cannot do it**: each Bash tool call is its own shell with no job table, so a job-number kill in a later call reports *no such job* while the process keeps listening. The form that works, and that reads back:
  ```bash
  for PORT in 7102 7104 7105; do
    PIDS="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t || true)"
    [ -n "$PIDS" ] && kill $PIDS && echo "stopped $PORT ($PIDS)"
  done
  lsof -nP -iTCP:7102 -iTCP:7104 -iTCP:7105 -sTCP:LISTEN || echo 'all three free'
  ```
  **Never kill 7100** — that is the control plane, and the state table says whether it should be running.
- **Leave the machine as you found it.** `./scripts/snapshot-machine.sh` at the start of a sitting, the same at the end, and `diff` them. **Removing what your own sitting created is yours; removing what an earlier sitting left is Rich's** — list the exact commands and hand them over.

**What this plan does not create.** No route, no migration, no spec change (Task 1's M8 may produce one — see *Spec actions*), no admin console (§26's `admin-ui/` is Phase 2), no MCP server (Phase 3), no production promotion, no CI workflow file (Decision 11), no DOM test tier (Decision 7).

---

## File Structure

```
packages/console/                       NEW — the reference console (D22)
├── package.json                        @manifest/console: dev / build / preview / typecheck
├── index.html                          Vite's entry document
├── vite.config.ts                      port 7104 on 127.0.0.1, allowedHosts, HMR through the edge
├── tsconfig.json                       extends ../../tsconfig.base.json, jsx: react-jsx
└── src/
    ├── main.tsx                        mounts <App/>; the only file that touches the DOM root
    ├── app.tsx                         the shell: header, nav, the router's switch, the refusal surface
    ├── router.ts                       ~40 lines over pushState/popstate (Decision 3)
    ├── auth.ts                         THE ONLY file allowed to name fetch or /auth/ (Decision 5)
    ├── api.ts                          THE data layer: one function per operation (Decision 6)
    ├── stream.ts                       useProjectStream(): frames and status over subscribe()
    ├── ui.tsx                          <Panel> <Field> <Refusal> <Ago> <Pill> — no design system (§22)
    ├── styles.css                      §22's whole quality bar: system fonts, one column,
    │                                   ~80 lines. Imported once, by main.tsx
    ├── screens/
    │   ├── projects.tsx                my projects; create one (§22 step 2)
    │   ├── blueprints.tsx              the catalogue and a blueprint's knowledge pack (D25)
    │   ├── project.tsx                 overview, spec, members, the live event feed (§22 step 3)
    │   ├── builds.tsx                  builds and their log lines (§22 step 4)
    │   ├── deploy.tsx                  environments, deploy, instance states, incidents (§22 steps 5–6)
    │   ├── launch.tsx                  LaunchReadiness (§22 step 7)
    │   ├── tokens.tsx                  mint once, list, revoke (D24)
    │   ├── queue.tsx                   §26's queue: confirm and reject
    │   └── fleet.tsx                   §26's fleet, administrators only
    ├── boundary.test.ts                imports, and the one-file fetch rule — both watched failing
    ├── coverage.test.ts                D22's question as a gate: every operation has a caller
    └── api.test.ts                     the data layer against manifest-mock, in Node, no DOM

packages/mock/                          NEW — manifest-mock (§5, §16, §21)
├── package.json                        @manifest/mock: dev / build / typecheck
├── tsconfig.json
└── src/
    ├── main.ts                         the entry point: listens on 127.0.0.1:7102
    ├── server.ts                       createMockServer(): node:http + ws, the routing table
    ├── fixtures.ts                     every response, typed as the contract's own schemas
    ├── script.ts                       the scripted stream: a build's logs, then a deploy's states
    └── validate.test.ts                ajv/2020 over openapi.json: every fixture AND every response

infra/caddy/Caddyfile                   MODIFIED (Task 4): the placeholder respond → reverse_proxy 7104
packages/control-plane/src/routing/     MODIFIED (Task 1, only if M8 measures the cut)
vitest.workspace.ts                     MODIFIED (Task 2): the `packages` project sees two more packages
eslint.config.js                        MODIFIED (Task 3): the console's import boundary
.prettierignore                         MODIFIED (Task 2) if Vite's output lands anywhere Prettier reads
Makefile                                MODIFIED (Task 13): demo-console, ci-acceptance
scripts/ci-acceptance.sh                NEW (Task 13)
scripts/demo-console.sh                 NEW (Task 13)
docs/superpowers/RUNBOOK.md             MODIFIED (Tasks 4, 12, 13): how to run the console, the mock, CI
docs/superpowers/WALKTHROUGH.md         MODIFIED (Task 14): the clicked journey
```

---

## The fixtures and helpers every snippet below uses

**Named once here so no task re-derives them.** Anything a snippet names and does not import is defined in this section or in the task that introduces it.

**In the console (`packages/console/src`):**

- **`createApi(options)`** — Decision 6's data layer, written in Task 4 and extended by every task after it. `options` is `{ origin: string; session?: string }`; in the browser the caller passes `{ origin: window.location.origin }` and nothing else.
- **`useAsync(fn, deps)`** — a five-line hook returning `{ value, error, reload }`, written in Task 4's `ui.tsx`. Every screen reads through it so that a `ManifestApiError` reaches one renderer.
- **`<Refusal error={e}/>`** — the one place a refusal is rendered: `code`, `message`, `hint`, and the two typed extras the envelope can carry (`launchReadiness`, `pendingAction`). Written in Task 4.
- **`useProjectStream(projectId)`** — written in Task 6, returns `{ frames, status }` where `status` is `'connecting' | 'live' | 'closed'`. Every later screen consumes it rather than subscribing again: **one stream per project** (D23.2).

**In the tests:**

- **`executableSource(text)`** — the comment stripper. **Copy it verbatim from `packages/journey/src/boundary.test.ts`**, including its doc comment, into `packages/console/src/boundary.test.ts`. Do not write a new one and do not import it across packages: the journey's copy is a test file, and a test file is not a module either package should depend on.
- **`withMock(fn)`** — written in Task 12's `api.test.ts`: starts `createMockServer()` on port 0, hands `fn` the origin, and closes it in a `finally`.

**Test users** (the Manifest IdP's three, `infra/idp/config/authsources.php`): `student` / `student` (`stu000001`), `instructor` / `instructor` (`ins000001`), `operator` / `operator` (`opr000001`). **The operator is the one `make demo-journey` promotes to administrator**, and a platform role reaches a person only when they sign in again.

**THE TRAP THAT WILL COST A SITTING IF IT IS NOT DISARMED:** `POST /v1/projects/{id}/members` answers **`400 MEMBER_USER_NOT_FOUND`** for anybody who has never signed in, and **`pnpm test` empties `users` on every run**. Anything that adds a member — Task 11's queue, Task 14's acceptance — must sign the student in first, exactly as `scripts/demo-token.sh` does.

---

## Task 1: Measure what this plan rests on — before any of it is built

> ### [M8] Correction block — EXECUTED 2026-09-18. Step 9's snippet could not have measured what it exists to measure.
>
> *Two paragraphs. This task is DONE; the block is kept because the defect is a reusable lesson
> and because anyone re-running M8 from the snippet below would repeat it. Full record in
> [`spikes/p5c-baseline/`](../spikes/p5c-baseline/README.md).*
>
> **Step 9's snippet causes the unrelated config change with node's `fetch`, which the Caddy
> admin API REFUSES.** undici appends `Origin: ''` to every non-GET request; the admin listener
> binds a wildcard host whose allowed-origin list is empty, so it answers **`403 "client is not
> allowed to access from origin ''"`** — which is why `routing/caddy.ts`'s own `adminRequest`
> uses `node:http` and documents this at length. The snippet's `.then(() => console.log("unrelated
> route inserted"))` checks **neither `r.ok` nor `r.status`**, so it would have printed that line
> on a `403`, reached its timeout, printed **`SURVIVED 20s, still open`**, and closed §8's
> four-plan-old question as *"not a problem in Phase 1"* — **the opposite of the truth** — on a
> config reload **that never happened**.
>
> **The correction is not "use `curl`". It is: assert the admin call's status, and refuse to
> report a survival unless a reload is known to have happened.** The client used for the real
> measurement exits `3` with `MEASUREMENT INVALID` in both cases. **The answer, measured in both
> directions against a route shaped as `buildRoute` shapes one: WITHOUT the field
> `CLOSED code=1001` 2 ms after the unrelated insert; WITH it `SURVIVED 17971 ms`, still open.**
> So §8's item closes *with* the value: `buildRoute` now sets
> `stream_close_delay: 3_600_000_000_000` (nanoseconds — `"1h"` is a different type the admin API
> refuses), matching the hour the console's own site has carried since P5a.

**ALONE, AND FIRST.** Every plan since P4b has opened with a measurement sitting, and P5b's
found eleven things that moved five of its own tasks. **This task writes no console code.**
Its output is a findings file and, where a measurement contradicts this plan, a correction
block at the top of the task it contradicts.

**Files:**
- Create: `docs/superpowers/spikes/p5c-baseline/README.md`
- Create: `docs/superpowers/spikes/p5c-baseline/results-task1-<date>.txt` — every command and its raw answer
- Modify: this plan — a `[M<n>]` correction block at the top of any task a measurement moves
- Modify (only if **M8** measures the cut): `packages/control-plane/src/routing/caddy.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the four gate numbers as they stand today; a yes/no on each of M2–M10; and **R2's
  answer**, which decides whether `buildRoute` gains a field.

- [ ] **Step 1: Snapshot the machine, and take the baseline**

```bash
cd /Users/rich/Developer/manifest
export SCRATCH=<your session's scratchpad directory>      # Global Constraints: it is NOT set for you
[ -d "$SCRATCH" ] || echo 'SCRATCH is unset — every line below would write to /'
./scripts/snapshot-machine.sh > "$SCRATCH/before.txt"     # read-only, no sudo, no network
make up                                                    # ~1 min; re-adds the 127.0.0.2 alias
make doctor && make verify
pnpm test                                                  # twice; a suite that is not repeatable has a state leak
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
```

**Record all four numbers with the command beside each** — `pnpm test` as *N passed, M files*,
`make doctor` and `make verify` as *checks / failed*. **Expect ORIENTATION §2's box exactly**;
a number that disagrees is signal before you write code, not after. **`make verify`'s *per-app
resources* INFO line is not a check** — more networks than apps means the Docker tier's dead
ones, which are Rich's.

**`make verify` BEFORE anything else if the machine was reset**: after a reset the host can lose
the edge while a container still has it, intermittently, and the remedy is
`docker restart manifest-caddy` (P5b sitting 9, F6).

- [ ] **Step 2: M1 — does the edge serve a host process on 7104 on the console's origin?**

The Caddyfile's console site answers everything that is not `/v1/*` or `/auth/*` with a
placeholder. Replace that one line, temporarily, and measure — **then put it back**.

```bash
# A trivial host server on the port §21 reserves for the console.
# Background it so it OUTLIVES this tool call — use your harness's background mode if it has
# one, since a child of a shell that has exited is not something a later call can find by job
# number. Step 11 stops it by PORT, which works either way.
(cd "$SCRATCH" && printf 'hello from 7104\n' > index.html && \
  node -e 'const h=require("node:http"),f=require("node:fs");h.createServer((q,s)=>{s.writeHead(200,{"content-type":"text/html"});s.end(f.readFileSync("index.html"))}).listen(7104,"127.0.0.1",()=>console.log("7104 up"))' &)

# Edit infra/caddy/Caddyfile: inside the console site's `route` block, replace
#   respond "manifest console: not built yet — P5c serves it here. The API is under /v1/." 200
# with
#   reverse_proxy host.docker.internal:7104
make up            # ensure-caddy-config.sh compares hashes and reloads; read its output

curl -sS https://console.manifest.internal/            # expect: hello from 7104
curl -sS https://console.manifest.internal/v1/me       # expect: 401 UNAUTHENTICATED — the API still wins
curl -sS https://console.manifest.internal/any/deep/path  # what does a host server answer for an SPA path?
```

**Record:** whether a host process bound to **`127.0.0.1`** (not `0.0.0.0`) is reachable as
`host.docker.internal:7104` from the edge — the control plane is bound the same way, so the
expected answer is yes, and a no changes Decision 4. **Then restore the Caddyfile and run
`make up` again**, and confirm the placeholder is back:
`curl -sS https://console.manifest.internal/ | head -c 60`.

- [ ] **Step 3: M2 — what a REAL BROWSER sends through that hop, with nobody signed in**

No password is needed for this, which is what makes it worth doing in sitting 1. With the
temporary `reverse_proxy` from Step 2 in place, serve this page from `$SCRATCH/index.html`
and open `https://console.manifest.internal/` in Chrome:

```html
<!doctype html>
<meta charset="utf-8" />
<title>M2</title>
<pre id="out"></pre>
<script type="module">
  const out = document.getElementById('out')
  const say = (s) => { out.textContent += s + '\n'; console.log('[M2]', s) }
  const r = await fetch('/v1/me')
  say(`GET /v1/me -> ${r.status} ${JSON.stringify(await r.json())}`)
  const m = await fetch('/v1/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({
      slug: 'm2-probe',
      blueprint: 'node-ts-mongo@1',
      audience: { scale: 'solo', burst: 'steady' },
    }),
  })
  say(`POST /v1/projects -> ${m.status} ${JSON.stringify(await m.json())}`)
  const ws = new WebSocket(`wss://${location.host}/v1/projects/00000000-0000-0000-0000-000000000000/events`)
  ws.onclose = (e) => say(`ws close ${e.code} ${e.reason}`)
  ws.onopen = () => say('ws open')
</script>
```

**What each answer means, and record all three:**

- `GET /v1/me` → **`401 UNAUTHENTICATED`** proves the browser's request reached the control
  plane through the edge on the console's origin. Anything else — Caddy's empty 502, or the
  `403` body *"manifest: the control plane is not reachable from this network"* — means the
  hop is not what this plan assumes.
- `POST /v1/projects` → **`401`**, not `403 CSRF_ORIGIN_REFUSED`: with no session cookie the
  origin check does not run (`assertSameOrigin` keys on the cookie). **What this measures is
  that the browser sent `Origin` at all** — read it in Chrome's Network tab and record the
  literal value. Everything in Task 4 onwards depends on the browser supplying it.
- the WebSocket → a close code. **`1006` with no status is what a refused upgrade looks like
  to a browser** (a WebSocket client is shown no HTTP status), and an anonymous upgrade is
  refused. Record the code; `4404` would mean it upgraded first, which would contradict
  *Read this first* 4.

**Then close the tab, stop the 7104 server, restore the Caddyfile, `make up`.**

- [ ] **Step 4: M3 — does a WebSocket UPGRADE survive the `host.docker.internal` hop?**

M2's upgrade was refused by the route, which proves the request arrived — but Vite's HMR (and,
in Task 12, the mock's scripted stream) needs an upgrade to reach a **host process on 7104**.
With the temporary `reverse_proxy` in place, run a WebSocket server on 7104 and connect through
the edge.

**STOP STEP 2's HTTP SERVER FIRST.** 7104 holds one listener, and starting a second is
`EADDRINUSE` — which, from a backgrounded process whose output you are not watching, looks
exactly like a measurement that produced nothing:

```bash
PORT_PID="$(lsof -nP -iTCP:7104 -sTCP:LISTEN -t || true)"
[ -n "$PORT_PID" ] && kill $PORT_PID && echo "stopped the Step 2 server ($PORT_PID)"

# `ws` is already in this workspace (control-plane devDependency, 8.21.3). The file must live
# under packages/control-plane for the bare specifier to resolve, and is deleted in Step 11.
cat > packages/control-plane/p5c-m3.mjs <<'EOF'
import { WebSocketServer } from 'ws'
const wss = new WebSocketServer({ host: '127.0.0.1', port: 7104 })
wss.on('connection', (s) => { s.send('hello'); })
console.log('ws server on 7104')
EOF
node packages/control-plane/p5c-m3.mjs &

NODE_EXTRA_CA_CERTS=infra/ca/manifest-root.crt node -e '
const ws = new WebSocket("wss://console.manifest.internal/")
ws.onmessage = (m) => { console.log("MESSAGE", m.data); process.exit(0) }
ws.onclose = (e) => { console.log("CLOSE", e.code); process.exit(1) }
setTimeout(() => { console.log("TIMEOUT"); process.exit(2) }, 5000)'
```

**Record:** `MESSAGE hello` means an upgrade reaches a host process through the edge on this
origin, and Vite's HMR can work through it. A close or a timeout means **Task 2 must set
`server.hmr: false`** and say so — record which.

- [ ] **Step 5: M4 — is a new package seen by the four gates at all?**

*Read this first* 14 says `vitest.workspace.ts`'s `packages` project lists two explicit globs.
Measure it rather than reading it:

```bash
mkdir -p packages/m4-probe/src
cat > packages/m4-probe/src/probe.test.ts <<'EOF'
import { expect, it } from 'vitest'
it('is a test that must be seen to fail', () => { expect(1).toBe(2) })
EOF
cat > packages/m4-probe/package.json <<'EOF'
{ "name": "@manifest/m4-probe", "version": "0.0.0", "private": true, "type": "module" }
EOF
pnpm test 2>&1 | tail -5     # does the deliberately failing test run?
pnpm lint 2>&1 | tail -5     # does ESLint read the new package?
pnpm typecheck 2>&1 | tail -5  # is a package with no `typecheck` script skipped silently?
pnpm format:check 2>&1 | tail -5
rm -rf packages/m4-probe && git status --short   # must be clean
```

**Record each of the four separately.** A `pnpm test` that stays green with a `expect(1).toBe(2)`
in the tree is the finding this measurement exists for: **a test nobody runs looks exactly like
a test that passes.** Task 2's whole deliverable is making all four see the new packages, and
this is the measurement its control is watched against.

- [ ] **Step 6: M5 — can a browser bundle consume `@manifest/contract`?**

```bash
pnpm --filter @manifest/contract build
node -e '
const fs=require("node:fs");
const graph=["index.js","client.js","errors.js","stream.js"];
for (const f of graph) {
  const src=fs.readFileSync("packages/contract/dist/"+f,"utf8");
  for (const m of src.matchAll(/from\s+[\x27"]([^\x27"]+)[\x27"]/g)) console.log(f, "->", m[1]);
}'
```

**Record every specifier.** The expected set is `./client.js`, `./errors.js`, `./stream.js` and
`openapi-fetch`. **A `node:` builtin anywhere in that graph would have to be polyfilled or
shimmed by Vite**, which would be a finding about the contract package rather than about the
console. `dist/` also holds compiled **test** files that import `vitest` and
`openapi-typescript` — they are not in the entry graph and must not be imported.

- [ ] **Step 7: M6 — what `?returnTo=` does, and what the console must serve**

```bash
curl -sS -i -c "$SCRATCH/login.jar" \
  'https://console.manifest.internal/auth/login?returnTo=/projects/deep/path' | head -20
grep manifest_login "$SCRATCH/login.jar"
```

**Record:** the `302` to the IdP, and the `manifest_login` cookie. Decode its return path —
`node -e 'const v=process.argv[1];console.log(Buffer.from(v.slice(v.indexOf(".")+1),"base64url").toString())' <cookie-value>`
— and confirm it is `/projects/deep/path` rather than `/`. **This is what decides whether the
console's router may use real paths (Decision 3).** If it is `/`, `safeReturnTo` has refused the
path and Task 4 must carry the route in a query string on `/` instead.

- [ ] **Step 8: M7 — which operations require which extra parameters**

```bash
node -e '
const d=require("./packages/contract/openapi.json");
let ops=0;
for (const [p,o] of Object.entries(d.paths))
  for (const [m,op] of Object.entries(o)) {
    if (!["get","post","put","patch","delete"].includes(m)) continue;
    ops++;
    const ps=(op.parameters??[]).filter(x=>x.in!=="path").map(x=>`${x.in}:${x.name}`);
    if (ps.length) console.log(m.toUpperCase(), p, ps.join(" "));
  }
console.log("operations:", ops);'
```

**Record the operation count and the parameter list.** This plan was written against **34
operations** (33 paths plus `streamProjectEvents`) and eleven `Idempotency-Key` headers. **A
different count means a route moved since 2026-09-18** and Task 13's coverage gate must be
rebuilt against what is there, not against this number.

- [ ] **Step 9: M8 — R2's measurement: is an app's WebSocket cut by an unrelated config reload?**

**This is the measurement §8's question has never had**, and Rich's R2 makes the answer decide
whether this plan changes `routing/`. It needs no app: what is under test is a **runtime route**
written the way `buildRoute` writes one.

```bash
# A WebSocket upstream on a spare platform port.
cat > packages/control-plane/p5c-m8.mjs <<'EOF'
import { WebSocketServer } from 'ws'
const wss = new WebSocketServer({ host: '127.0.0.1', port: 7105 })
wss.on('connection', (s) => setInterval(() => s.readyState === 1 && s.send('tick'), 1000))
console.log('ws upstream on 7105')
EOF
node packages/control-plane/p5c-m8.mjs &

# The route under test, shaped as routing/caddy.ts's buildRoute shapes one — and WITHOUT
# stream_close_delay, which is exactly what an app route carries today.
ROUTE='{"@id":"p5c-ws-probe","match":[{"host":["p5c-ws-probe.manifest.internal"]}],
  "handle":[{"handler":"reverse_proxy","upstreams":[{"dial":"host.docker.internal:7105"}]}]}'
curl -sS -X PUT -H 'content-type: application/json' \
  -d "$ROUTE" http://127.0.0.1:7119/config/apps/http/servers/srv0/routes/0

# Hold a socket open through the edge, then cause an UNRELATED config change, the way any
# deploy anywhere on the platform does.
NODE_EXTRA_CA_CERTS=infra/ca/manifest-root.crt node -e '
const ws = new WebSocket("wss://p5c-ws-probe.manifest.internal/");
let ticks = 0;
ws.onmessage = () => { if (++ticks === 2) {
  const body = JSON.stringify({"@id":"p5c-unrelated","match":[{"host":["p5c-unrelated.manifest.internal"]}],"handle":[{"handler":"static_response","body":"x"}]});
  fetch("http://127.0.0.1:7119/config/apps/http/servers/srv0/routes/0",
    {method:"PUT",headers:{"content-type":"application/json"},body}).then(()=>console.log("unrelated route inserted"));
}};
ws.onclose = (e) => { console.log("CLOSED", e.code, JSON.stringify(e.reason)); process.exit(0) };
setTimeout(() => { console.log("SURVIVED 20s, still open"); process.exit(0) }, 20000)'
```

**Then repeat the whole thing with `"stream_close_delay":3600000000000` added to the
`reverse_proxy` handler** — Caddy's JSON durations are **nanoseconds**, so an hour is
`3600000000000` and a value written as `"1h"` is a different type the admin API refuses.

**The pair is the measurement.** `CLOSED 1001` without the field and `SURVIVED` with it is the
cut, proved in both directions — P5a sitting 2 measured exactly this on the console's site. Then:

- **If it is cut:** add `stream_close_delay` to `buildRoute`'s `reverse_proxy` handler with the
  value recorded, extend `routing/caddy.test.ts` to assert it is present, run
  `pnpm test:docker`, and record it as **§8's item CLOSED with a measurement**.
- **If it survives:** change nothing, and record §8's item as **measured, and not a problem in
  Phase 1**, with this output as the evidence and the reason (an app route on this Caddy build
  is not closed by an unrelated reload).

**Clean up both routes and read back that they are gone:**

```bash
curl -sS -X DELETE http://127.0.0.1:7119/id/p5c-ws-probe
curl -sS -X DELETE http://127.0.0.1:7119/id/p5c-unrelated
curl -sS http://127.0.0.1:7119/id/p5c-ws-probe          # expect: unknown object ID
curl -sS http://127.0.0.1:7119/config/apps/http/servers/srv0/routes | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log((JSON.parse(s)??[]).map(r=>r["@id"]).join(", ")))'
```

**A route left behind is a change to a running edge.** Read the list back; do not assume the
DELETE worked because it exited 0.

- [ ] **Step 10: M9 — can a 2020-12 validator read this document at all?**

Decision 9 rests on it, and `ajv` is not installed until Task 2 — so measure with what is here:

```bash
node -e '
const d=require("./packages/contract/openapi.json");
console.log("openapi", d.openapi, "info.version", d.info.version);
const s=JSON.stringify(d.components.schemas);
for (const kw of ["prefixItems","unevaluatedProperties","dependentSchemas","$dynamicRef","contentMediaType","additionalProperties","const","anyOf","format","pattern"])
  console.log(kw, (s.match(new RegExp("\\\\\""+kw.replace("$","\\\\$")+"\\\\\"","g"))??[]).length);'
```

**Record the counts.** `openapi 3.1.0` means the schemas are **JSON Schema 2020-12**, which is
`ajv/dist/2020` and not the default export; a draft-07 `Ajv` refuses them with an error that
reads like a malformed document. The keyword counts say whether anything exotic is in play.
**If `$dynamicRef` or `unevaluatedProperties` appear, record it** — Task 12 then has a
compilation problem to solve before it writes a fixture.

- [ ] **Step 11: Put the machine back, and write it all down**

```bash
rm -f packages/control-plane/p5c-m3.mjs packages/control-plane/p5c-m8.mjs
# BY PID, NEVER BY JOB NUMBER. Each Bash tool call is its own shell, so `kill %1` in a later
# call has no job table to read and reports "no such job" while the server keeps listening —
# and this step is the one that decides whether the machine was left as it was found.
for PORT in 7104 7105; do
  PIDS="$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t || true)"
  [ -n "$PIDS" ] && kill $PIDS && echo "stopped $PORT ($PIDS)"
done
lsof -nP -iTCP:7104 -iTCP:7105 -sTCP:LISTEN || echo 'both ports free'
git status --short                       # MUST be empty apart from the findings file
git diff --stat infra/caddy/Caddyfile    # MUST be empty — the placeholder is back
curl -sS https://console.manifest.internal/ | head -c 60   # the placeholder, byte for byte
./scripts/snapshot-machine.sh > "$SCRATCH/after.txt"
diff "$SCRATCH/before.txt" "$SCRATCH/after.txt"
```

Write `docs/superpowers/spikes/p5c-baseline/README.md` with **one section per measurement**: the
command, the raw answer, and what it means for which task. **Where a measurement contradicts
this plan, add a `[M<n>]` correction block at the top of the task it contradicts** — that is how
P5b's sitting 1 moved five of its own tasks, and a finding recorded only in the spike file is a
finding the next agent will not read.

- [ ] **Step 12: Commit**

```bash
git add docs/superpowers/spikes/p5c-baseline docs/superpowers/plans/2026-09-18-p5c-the-clients.md
# plus packages/control-plane/src/routing/caddy.ts and its test, if and only if M8 measured the cut
git commit -m "docs(p5c): task 1 — the measurements this plan rests on"
```

**The negative controls for this task are the measurements themselves**: M4 is watched with a
deliberately failing test, M8 is a paired positive and negative control, and M1's restoration is
proved by re-reading the placeholder rather than by having edited the file back.

---

## Task 2: `packages/console` and `packages/mock` exist, and all four gates see them

> **EXECUTED 2026-09-18 (sitting 2). Two of its steps are in the wrong order and one of its
> files does not build — see *Sitting 2* in *What executing this plan found* (F1, F4).**
> **Step 2 cannot run before Step 3**: `pnpm --filter @manifest/console add` answers *"No
> projects matched the filters"* until the package manifests exist, so the minimal manifests
> are written first and `pnpm add -E` fills in the versions. **Step 6's `main.tsx` imports
> `./styles.css`, which Step 10 then fails to build** because Task 4 was to write that file;
> a minimal `styles.css` is created here instead.

> ### [M4][M5][M9] Correction block — four things sitting 1 measured that change this task
>
> *FIVE paragraphs — four numbered points AND a final unnumbered one carrying the
> before-measurement this task's own control is watched against; do not summarise away the
> last. Written 2026-09-18 by P5c sitting 1; evidence in
> [`spikes/p5c-baseline/`](../spikes/p5c-baseline/README.md).*
>
> **1. Install `ajv-formats` as well as `ajv` (M9/F4), and this is the last task that can.**
> Decision 9 names only `ajv`. The document carries **185 format assertions** — `uuid` ×141, `date-time` ×43,
> `uri` ×1 (counted across the whole document; **158** of them sit inside `components.schemas`, where `uuid` is ×114 — the two scopes give different totals, so state which one you mean) — and Ajv v8 implements none of them itself: under `strict: true` an unknown format
> **throws**, otherwise the assertion is **silently ignored**, which is the dangerous one. Both
> are already in the pnpm store transitively (`ajv@8.20.0`, `ajv-formats@3.0.1`) but are declared
> by **no** `package.json`, and pnpm's strict `node_modules` means `packages/mock` cannot resolve
> a transitive dependency. Declare both explicitly and **pin 8.x deliberately** — `ajv@6.15.0` is
> also on this machine (ESLint's, draft-07), and it is the exact failure Decision 9 warns reads
> like a malformed document.
>
> **2. The console's Vite config needs `server.allowedHosts` (M1/F7), and does NOT need
> `server.hmr: false` (M3).** The edge **preserves `Host: console.manifest.internal`** rather
> than rewriting it to the upstream, and Vite's dev server rejects unknown hosts. The plan's
> HMR fallback branch is not taken: a WebSocket upgrade reaches a host process on 7104 through
> the edge, measured from both a Node client and a real browser, with the path intact.
>
> **3. Run `pnpm --filter @manifest/contract build` before anything builds or previews the
> console (M5/F3).** `packages/contract`'s `exports` map is conditional and the two conditions
> point at different trees — `"types": "./src/index.ts"` (source) and `"default":
> "./dist/index.js"` (built). The console therefore **typechecks against source and bundles
> `dist/`**, so a stale `dist/` ships silently: `tsc` is green because it never reads `dist/`,
> Vite is green because it never reads `src/`.
>
> **4. This task legitimately changes `pnpm-lock.yaml` (M4/F6)** — adding a package under
> `packages/` rewrites it, and that belongs in the commit. (In sitting 1 the same edit was an
> accident of the probe and was reverted.)
>
> **The before-measurement this task's control is watched against (M4).** With a
> `packages/m4-probe` containing `expect(1).toBe(2)`: `pnpm test` **exit 0, 1344 passed in 101
> files — identical to baseline, the file never collected** (`grep -c m4-probe` of the output:
> 0); `pnpm lint` **exit 1**; `pnpm typecheck` **discovers it and silently skips it** (`Scope: 3
> of 4` → `Scope: 4 of 5`, same three packages ran `tsc` — a package with no `typecheck` script
> says nothing); `pnpm format:check` **exit 1**. So **two gates see a new package for free, one
> needs a `typecheck` script, and one needs a glob in `vitest.workspace.ts`.**

**THE ONE SITTING WITH THE NETWORK ON.** Nothing after this task installs a package; if a later
task believes it needs one, that is a finding to record and raise (Global Constraints).

**Files:**
- Create: `packages/console/package.json`, `packages/console/tsconfig.json`, `packages/console/vite.config.ts`, `packages/console/index.html`, `packages/console/src/main.tsx`, `packages/console/src/app.tsx`
- Create: `packages/mock/package.json`, `packages/mock/tsconfig.json`, `packages/mock/src/main.ts`, `packages/mock/src/server.ts`
- Modify: `vitest.workspace.ts` — the `packages` project's globs
- Modify: `pnpm-workspace.yaml` — only if `pnpm approve-builds` says a new dependency wants an install script
- Modify: `.prettierignore` — only if a build output lands where Prettier reads

**Interfaces:**
- Consumes: Task 1's M4 (which gates are blind to a new package) and M5 (that the contract bundles).
- Produces: `@manifest/console` and `@manifest/mock` as workspace packages with `build`,
  `typecheck` and (console) `dev` / `preview` scripts; `createMockServer(): http.Server` as a
  stub that Task 12 fills in.

- [ ] **Step 1: Write the failing test first — the gate that cannot see a package**

Task 1's M4 measured which of the four gates are blind. Put a real test in the new package
**before** the workspace is taught about it, so the fix is watched:

```bash
mkdir -p packages/console/src packages/mock/src
cat > packages/console/src/boundary.test.ts <<'EOF'
import { expect, it } from 'vitest'

// Task 3 replaces this file with the real import boundary. It exists now, deliberately
// failing, so that "pnpm test does not see a new package" is watched being fixed rather
// than assumed — M4 measured that a failing test in an unlisted package is silently green.
it('is seen by pnpm test', () => {
  expect('this package is in vitest.workspace.ts').toBe('not yet')
})
EOF
pnpm test 2>&1 | tail -3
```

**Expected: green.** `pnpm test` passes with a failing test in the tree, because
`vitest.workspace.ts`'s `packages` project names `packages/contract` and `packages/journey` and
nothing else.

- [ ] **Step 2: Install the dependencies — the network-on step**

```bash
pnpm --filter @manifest/console add -E react react-dom
pnpm --filter @manifest/console add -ED vite @vitejs/plugin-react @types/react @types/react-dom
pnpm --filter @manifest/mock add -E ws
pnpm --filter @manifest/mock add -ED ajv @types/ws
```

**`-E` is exact**, which is what makes the versions reproducible and what C6's spirit asks for;
`pnpm add` writes the version it actually installed, so **this plan names no version number and
does not have to**. Then:

```bash
pnpm approve-builds          # pnpm 11 makes an un-named install script a HARD ERROR
node -e 'for (const p of ["console","mock"]) { const j=require(`./packages/${p}/package.json`); console.log(p, JSON.stringify({...j.dependencies,...j.devDependencies},null,1)) }'
pnpm audit --prod            # the closure that ships; record the result, gate on nothing
```

**Record every exact version and the `pnpm audit --prod` output in the session record.** A
finding without a version is not reproducible. **`pnpm audit --filter <pkg>` does not scope to a
package** — it reports the whole workspace — so `--prod` is what isolates a runtime closure
(P5a sitting 6). **Nothing scans the control plane's own dependency tree** and this task does not
change that; it is ORIENTATION §8's standing item.

- [ ] **Step 3: The two package manifests**

```jsonc
// packages/console/package.json — the version strings are whatever `pnpm add -E` wrote
{
  "name": "@manifest/console",
  "version": "0.1.0",
  "description": "D22's reference console: the executable proof that the public API is complete and sufficient. Not the product.",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@manifest/contract": "workspace:*",
    "react": "<as installed>",
    "react-dom": "<as installed>"
  },
  "devDependencies": {
    "@types/react": "<as installed>",
    "@types/react-dom": "<as installed>",
    "@vitejs/plugin-react": "<as installed>",
    "vite": "<as installed>"
  }
}
```

```jsonc
// packages/mock/package.json
{
  "name": "@manifest/mock",
  "version": "0.1.0",
  "description": "manifest-mock: the published contract served from fixtures, so a front-end team needs no platform (§16, §21).",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm run build && node dist/main.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "@manifest/contract": "workspace:*",
    "ws": "<as installed — match the control plane's 8.21.3 if pnpm offers a choice>"
  },
  "devDependencies": { "ajv": "<as installed>", "@types/ws": "<as installed>" }
}
```

**`build` on the console is `tsc --noEmit && vite build`, in that order**, because Vite strips
types exactly as Vitest does: without the `tsc` half, a console that no longer fits the generated
contract builds cleanly and fails in a browser.

- [ ] **Step 4: The two tsconfigs**

```jsonc
// packages/console/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true,
    "moduleResolution": "Bundler",
    "module": "ESNext"
  },
  "include": ["src", "vite.config.ts"]
}
```

**`moduleResolution: "Bundler"` overrides the base's `NodeNext` deliberately**, and it is the one
place in this repository that does: Vite resolves bare specifiers and extensionless relative
imports the way a bundler does, and `NodeNext` would demand a `.js` suffix on every local import
in a file Node never runs. **`lib` must name `DOM`**, or `document`, `window` and `WebSocket` are
type errors — and `@manifest/contract`'s own `inBrowser` checks compile against them.

```jsonc
// packages/mock/tsconfig.json — plain Node, exactly like packages/journey's
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "types": ["node"] },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 5: The Vite config, on §21's port**

```ts
// packages/console/vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * §21's inventory puts the reference console on 7104 as a host process, served at
 * `console.manifest.internal` THROUGH CADDY, on the same origin as the API — so the session
 * cookie, §20's CSRF origin and the control plane's own SAML return URL are one origin with
 * no CORS. Nothing here is reached at `127.0.0.1:7104` by a person: a mutation made from
 * that origin carries the wrong `Origin` and is refused `403 CSRF_ORIGIN_REFUSED`.
 *
 * `host: '127.0.0.1'` and not `0.0.0.0`: the edge reaches a host process as
 * `host.docker.internal:7104` on Docker Desktop, which is how it already reaches the control
 * plane on 7100 (Task 1, M1).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 7104,
    strictPort: true,
    // Vite refuses a request whose Host header it does not know — "Blocked request. This
    // host is not allowed." — and every request arrives from Caddy with the console's
    // hostname. Without this line the console is a blank page and the reason is in Vite's
    // terminal, not the browser's.
    allowedHosts: ['console.manifest.internal'],
    // Task 1's M3 measured whether an upgrade survives the edge hop. HMR's socket is opened
    // by the page, so it must be told the public port and scheme rather than 7104/ws.
    hmr: { protocol: 'wss', host: 'console.manifest.internal', clientPort: 443 },
  },
  preview: {
    host: '127.0.0.1',
    port: 7104,
    strictPort: true,
    allowedHosts: ['console.manifest.internal'],
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
```

**If M3 measured that an upgrade does NOT survive the hop, replace the `hmr` line with
`hmr: false` and write the measurement above it.** A dev server whose HMR socket fails retries
forever and fills the browser console with noise that reads like a broken console.

- [ ] **Step 6: The smallest console that is a console**

```html
<!-- packages/console/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Manifest</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// packages/console/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
// §22's quality bar, in one file: system fonts, one column, ~80 lines of plain CSS. NOT a
// design system and not branding — "coherent enough to walk a pilot faculty member through,
// obviously not polished enough that anyone mistakes its choices for product decisions".
// Task 4 writes it. The boundary test DOES read this import — it is a module specifier like
// any other — and allows it because `./styles.css` resolves inside src/. Prettier owns the
// file itself, because it lives under packages/.
import './styles.css'

const root = document.getElementById('root')
if (root === null) throw new Error('index.html has no #root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```tsx
// packages/console/src/app.tsx — Task 4 replaces this with the shell
export function App() {
  return <p>Manifest console</p>
}
```

- [ ] **Step 7: The mock's stub, with its caller**

A module with no call site is not built (ORIENTATION §9, four times). `main.ts` is
`createMockServer`'s caller from the first commit:

```ts
// packages/mock/src/server.ts
import { createServer, type Server } from 'node:http'

/**
 * manifest-mock (§5, §16, §21): the published contract served from fixtures, so a front-end
 * developer needs one process rather than nine containers plus a language model.
 *
 * Task 12 fills in the routing table, the fixtures and the scripted stream. It answers 501
 * until then, DELIBERATELY: a mock that answers a plausible 200 to everything is the
 * stand-in that produces a real-looking failure (P4c finding 74).
 */
export function createMockServer(): Server {
  return createServer((request, response) => {
    response.writeHead(501, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        error: {
          code: 'INTERNAL',
          message: `manifest-mock does not serve ${request.method} ${request.url} yet`,
          hint: 'P5c Task 12 fills in the routing table. Until then this server exists to be started, not to be used.',
        },
      }),
    )
  })
}
```

```ts
// packages/mock/src/main.ts
import { createMockServer } from './server.js'

const PORT = Number(process.env.MANIFEST_MOCK_PORT ?? 7102)
createMockServer().listen(PORT, '127.0.0.1', () => {
  console.log(`manifest-mock on http://127.0.0.1:${PORT}`)
})
```

- [ ] **Step 8: Teach the workspace about both packages — and watch the failing test appear**

```ts
// vitest.workspace.ts — in the third project only
    test: {
      name: 'packages',
      root: '.',
      include: [
        'packages/contract/src/**/*.test.ts',
        'packages/journey/src/**/*.test.ts',
        // P5c Task 2. A package not named here runs under NO project: its tests are
        // silently not run, which reads exactly like a suite that passes (Task 1, M4).
        'packages/console/src/**/*.test.ts',
        'packages/mock/src/**/*.test.ts',
      ],
    },
```

```bash
pnpm test 2>&1 | tail -5
```

**Expected: RED**, on `packages/console/src/boundary.test.ts` — *expected 'this package is in
vitest.workspace.ts' to be 'not yet'*. **That is the control for this task**: the gate now sees
a package it could not see in Step 1. Record the assertion verbatim in the session record.

- [ ] **Step 9: Make it green the honest way**

Replace the placeholder assertion with one that states what is now true:

```ts
// packages/console/src/boundary.test.ts — Task 3 replaces this file entirely
import { expect, it } from 'vitest'

it('is seen by pnpm test', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 10: All four gates, and the three that were blind**

```bash
pnpm test && pnpm test           # twice
pnpm lint
pnpm typecheck                   # must now RUN for both packages — a package with no
                                 # `typecheck` script is skipped SILENTLY by `pnpm -r`
pnpm format:check
pnpm --filter @manifest/console build
pnpm --filter @manifest/mock build && node packages/mock/dist/main.js &
curl -sS http://127.0.0.1:7102/v1/me    # expect the deliberate 501 envelope
# By PID, not by job number: a later Bash tool call is a different shell with no job table
# (Task 1, Step 11). Leaving 7102 listening is a machine this sitting did not leave as it
# found it, and the next `pnpm --filter @manifest/mock dev` fails EADDRINUSE.
MOCK_PID="$(lsof -nP -iTCP:7102 -sTCP:LISTEN -t || true)"; [ -n "$MOCK_PID" ] && kill $MOCK_PID
```

**Assert each gate saw the new packages, do not assume it:** `pnpm typecheck` prints one line
per package it ran — count them. **`pnpm format:check` is the one most likely to go red on files
no test touches**: Prettier owns `packages/` and that now includes `.tsx`, `.html` and any CSS.
Run `pnpm format` once and commit what it changes.

- [ ] **Step 11: Commit**

```bash
git add packages/console packages/mock vitest.workspace.ts package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(console,mock): two workspace packages the four gates can see"
```

**Negative control, watched after the commit:** remove the two new globs from
`vitest.workspace.ts`, put `expect(1).toBe(2)` back in `boundary.test.ts`, and run `pnpm test`.
**Expected: green — which is the defect.** Restore both (`git checkout` is safe here, because
the task is committed) and confirm `pnpm test` is red, then fix the assertion back and confirm
green. **Name the assertion in the record**, not the mechanism.

---

## Task 3: The console's import boundary — and the one file allowed to call `fetch`

> **EXECUTED 2026-09-18 (sitting 2). It cannot go green as written — see *Sitting 2* in
> *What executing this plan found* (F5, F6, F7).** **Step 4 predicts one red test and two go
> red**: the import test's *"imports were read from fewer than two files"* also fails,
> because `main.tsx` is the only console file with an import and React 19's automatic JSX
> runtime means `app.tsx` needs none — and **Step 5's `auth.ts` does not fix it**, because it
> has no imports and no caller. `app.tsx` calls `signIn` and `signOut`, which is this plan's
> own *every task names its caller* rule and the repair at once. **Step 3's `fetch` pattern
> also misses a template literal**, which is how `auth.ts` itself names `/auth/login`; the
> backtick is in the character class now. **TASK 4 SHOULD TIGHTEN** the *"scanner read no
> imports at all"* control from `react` back to `@manifest/contract` once `api.ts` exists.

**This task exists before any screen does**, because a boundary added after the screens is a
boundary that has never refused anything. D22: *"If the console needs something the API does not
expose, the API is incomplete — and that is discovered in Phase 1, while it is cheap."*

**Files:**
- Create: `packages/console/src/boundary.test.ts` (replacing Task 2's placeholder)
- Modify: `eslint.config.js` — a second `no-restricted-imports` block, for the console

**Interfaces:**
- Consumes: `packages/journey/src/boundary.test.ts`'s `executableSource`, copied verbatim.
- Produces: two enforced rules every later task is written against — **imports**
  (`@manifest/contract`, `react`, `react-dom`, `node:`, `./`) and **`fetch`** (`src/auth.ts`
  only).

- [ ] **Step 1: The ESLint half, copied from the journey's**

```js
// eslint.config.js — a new block, after the journey's
  {
    // §22 and §16 API completeness (D22, P5c Task 3): the console is a client of the
    // contract and may import nothing else — plus React, which renders it, and its own
    // files. The TEST in packages/console/src/boundary.test.ts is the other half, and it
    // covers what a lint rule cannot: a `fetch` that reaches the API without importing
    // anything at all. Each was watched failing.
    //
    // `regex`, not `group`: ESLint 9's gitignore dialect cannot say "only these" — the
    // control plane's module-boundary note above has the measurement.
    files: ['packages/console/src/**/*.ts', 'packages/console/src/**/*.tsx'],
    ignores: ['packages/console/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!@manifest/contract$|react$|react-dom(/.*)?$|node:|\\./)',
              message:
                'The console may import only @manifest/contract, react, react-dom, node: builtins and its own ./ files (D22, §22).',
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 2: Watch the lint rule refuse something**

```bash
printf "import { z } from 'zod'\nexport const x = z\n" > packages/console/src/probe.ts
pnpm lint 2>&1 | grep -A 2 probe.ts
```

**Expected: `no-restricted-imports` naming the message above.** Then
`rm packages/console/src/probe.ts` and confirm `pnpm lint` is clean. **A rule that has never
refused anything is a rule nobody has tested.**

- [ ] **Step 3: Write the test half**

**Copy `executableSource` verbatim from `packages/journey/src/boundary.test.ts`**, doc comment
included, then write the two checks over it:

```ts
// packages/console/src/boundary.test.ts
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/** COMMENTS OUT, STRING BODIES KEPT — copied verbatim from packages/journey/src/boundary.test.ts,
 *  whose doc comment says why it is a scanner and not a regex. Copied rather than imported:
 *  that file is a test file, and a test file is not a module another package depends on. */
function executableSource(text: string): string {
  /* …the journey's implementation, unchanged… */
}

/** Every non-test source file under src/, recursively — the console has subdirectories where
 *  the journey does not, and a scanner that reads one level would silently skip screens/. */
async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)))
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

describe('the console’s imports (D22, §22, §16 API completeness)', () => {
  it('are @manifest/contract, react, node: builtins and its own files — nothing else', async () => {
    const violations: string[] = []
    const allowed: string[] = []
    const filesRead = new Set<string>()
    for (const file of await sourceFiles(SRC)) {
      const text = executableSource(await readFile(file, 'utf8'))
      for (const m of text.matchAll(
        /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g,
      )) {
        const spec = m[1]!
        filesRead.add(relative(SRC, file))
        if (
          spec === '@manifest/contract' ||
          spec === 'react' ||
          spec === 'react-dom' ||
          spec.startsWith('react-dom/') ||
          spec.startsWith('node:')
        ) {
          allowed.push(spec)
          continue
        }
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const target = resolve(dirname(file), spec)
          if (target.startsWith(resolve(SRC))) {
            allowed.push(spec)
            continue
          }
        }
        violations.push(`${relative(SRC, file)}: ${spec}`)
      }
    }
    expect(violations).toEqual([])
    // A scanner that ate the source reports no violations AND no imports; these two say
    // which it was (P5b sitting 8, F3).
    expect(allowed, 'the scanner read no imports at all').toContain('@manifest/contract')
    expect(filesRead.size, 'imports were read from fewer than two files').toBeGreaterThan(1)
  })

  /**
   * THE HALF A LINT RULE CANNOT SEE (Decision 5). A screen that called
   * `fetch('/v1/projects')` imports nothing and passes every import check ever written —
   * and it would be a client of the API that is not a client of the CONTRACT, which is the
   * one thing D22 exists to prevent. Two endpoints are legitimately outside the contract by
   * D23.8 and are listed with their reasons in the control plane's own api/unversioned.ts;
   * they live in src/auth.ts and nowhere else.
   */
  it('reaches the API through the contract — except auth.ts, which owns the two unversioned endpoints', async () => {
    const offenders: string[] = []
    let authSaw = 0
    for (const file of await sourceFiles(SRC)) {
      const name = relative(SRC, file)
      const text = executableSource(await readFile(file, 'utf8'))
      const hits = [...text.matchAll(/\bfetch\s*\(|['"]\/auth\//g)].length
      if (name === 'auth.ts') authSaw = hits
      else if (hits > 0) offenders.push(`${name}: ${hits}`)
    }
    expect(offenders).toEqual([])
    // The positive control: auth.ts must still contain both, or this test is asserting
    // nothing at all and would stay green if the whole rule were deleted.
    expect(authSaw, 'auth.ts names neither fetch nor /auth/ — did the scanner read it?').toBeGreaterThan(1)
  })

  /** The stripper's own two claims, because everything above rests on them. */
  it('reads imports and not the sentences that look like them', () => {
    const source = executableSource(
      [
        '/** a project, distinguishable from "the one the API returns". */',
        "import { unwrap } from '@manifest/contract'",
        "// import { readFile } from 'node:fs/promises'",
        "const origin = 'https://console.manifest.internal' // not a comment inside the string",
      ].join('\n'),
    )
    const found = [
      ...source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g),
    ].map((m) => m[1])
    expect(found).toEqual(['@manifest/contract'])
    expect(source, 'a string body must survive intact').toContain(
      'https://console.manifest.internal',
    )
  })
})
```

- [ ] **Step 4: Run it — and expect the second test to be RED**

```bash
pnpm exec vitest run --project packages packages/console/src/boundary.test.ts
```

**Expected: the `fetch` test fails**, because `src/auth.ts` does not exist yet and `authSaw` is
`0`. **That is correct and it is the point**: the positive control fires before the thing it
guards exists. Task 4 writes `auth.ts` and turns it green. **Do not weaken the assertion to
`>= 0` to get a green commit** — commit this task with the file written and the test red only if
Task 4 lands in the same sitting; otherwise write the minimal `auth.ts` now (Step 5).

- [ ] **Step 5: The minimal `auth.ts`, so the boundary has something to protect**

```ts
// packages/console/src/auth.ts
/**
 * THE ONLY FILE IN THE CONSOLE THAT MAY NAME `fetch` OR A `/auth/` PATH (D22, Decision 5).
 *
 * Signing in is the browser's and the IdP's business, not the versioned API's — D23.8, and
 * the control plane's own `api/unversioned.ts` lists both of these endpoints with the
 * reason each is outside `/v1`:
 *
 *   GET  /auth/login    a browser-mediated sign-in whose URL the Manifest IdP completes (§9)
 *   POST /auth/logout   the SLO URL registered beside the ACS (§9)
 *
 * Everything else the console does goes through `api.ts` and `@manifest/contract`.
 * `boundary.test.ts` asserts both halves of that sentence.
 */

/** Leaves the page. `returnTo` is a same-origin PATH; the callback lands back on it. */
export function signIn(returnTo: string = location.pathname + location.search): void {
  window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
}

/**
 * Ends the session and reloads. `POST /auth/logout` is NOT exempt from §20's origin check —
 * only the SAML callback is — and a browser sends `Origin` itself, which is why the console
 * must be reached at `console.manifest.internal` and never at `127.0.0.1:7104`.
 */
export async function signOut(): Promise<void> {
  await fetch('/auth/logout', { method: 'POST' })
  window.location.href = '/'
}
```

```bash
pnpm exec vitest run --project packages packages/console/src/boundary.test.ts   # green
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
```

- [ ] **Step 6: Commit, then watch all three controls fail**

```bash
git add packages/console/src/boundary.test.ts packages/console/src/auth.ts eslint.config.js
git commit -m "test(console): the import boundary, and the one file allowed to call fetch"
```

| Break | What must go red, by name |
|---|---|
| add `import { z } from 'zod'` to `src/app.tsx` | `pnpm lint` — `no-restricted-imports`; **and** boundary test 1 — *`expected [ 'app.tsx: zod' ] to deeply equal []`*. **Two independent reads of one rule** (ORIENTATION §9) |
| add `await fetch('/v1/projects')` to `src/app.tsx` | boundary test 2 — *`expected [ 'app.tsx: 1' ] to deeply equal []`*. **`pnpm lint` stays green**, which is exactly why this test exists |
| delete the two `/auth/` lines from `src/auth.ts` | boundary test 2's positive control — *auth.ts names neither fetch nor /auth/*. **Without it, deleting the rule's subject leaves the rule green** |
| make `executableSource` return `''` | test 1's *the scanner read no imports at all*, and test 3's both assertions |

**Restore after each and prove the tree is clean** (`git status --short`). `git checkout <path>`
restores from the INDEX, which is exact now that the task is committed.

---

## Task 4: The console is served at `console.manifest.internal`, and signs a person in with CWL

> ### [M1][M2][M6] Correction block — what sitting 1 measured about this exact hop
>
> *FIVE paragraphs — four numbered points AND a final unnumbered one on editing the
> Caddyfile safely; do not summarise away the last. Written 2026-09-18 by P5c sitting 1; evidence in
> [`spikes/p5c-baseline/`](../spikes/p5c-baseline/README.md). Nothing here changes the task's
> shape — all three of its assumptions held — but two details are new and one is a trap.*
>
> **1. Everything this task assumes about the hop is MEASURED, not inferred.** With the
> placeholder replaced by `reverse_proxy host.docker.internal:7104`: a host process bound to
> **`127.0.0.1`** answers through the edge; `/v1/*` still reaches the control plane (`401
> UNAUTHENTICATED`); a real browser's `Origin` arrives as **`https://console.manifest.internal`**
> — scheme and host, no trailing slash, no port — **passed through the edge unchanged**; and a
> WebSocket upgrade reaches 7104 with `Host` and path intact, carrying that same `Origin`.
> **Deep paths arrive unchanged, so Decision 3's real-path router is correct** — but the edge does
> **no SPA fallback**, so whatever serves the console must do it (`vite preview` does).
>
> **2. `?returnTo=` keeps a deep path, with the refusal watched too (M6).**
> `returnTo=/projects/deep/path` round-trips through the `manifest_login` cookie intact;
> `returnTo=//evil.example.com/x` is refused and falls back to `/`. **The fallback this task was
> told it might need — carrying the route in a query string on `/` — is NOT needed.**
>
> **3. The trap: `manifest_login` has `Max-Age=600`.** A sign-in left sitting on the IdP page
> longer than ten minutes **FAILS — it does not fall back to `/`.** *(Corrected by sitting 3,
> F2, read from `api/routes/auth.ts`: this sentence said "loses its return path and lands on
> `/`", and so do sitting 1's M6 and every §7e that repeated it.)* **The one cookie carries
> BOTH the return path and the binding nonce**, so when it expires the callback's
> `readLoginCookie` returns `undefined` and the assertion is refused
> **`401 SAML_LOGIN_NOT_BOUND`**, before node-saml ever sees it. The remedy is to start the
> sign-in again. That is invisible when an agent drives the form in two seconds and very
> visible in **Task 14's shared run, where a human is typing the password** — a refusal page,
> not a wrong landing page. Its other properties, for the record: `Path=/auth`, `HttpOnly`,
> `Secure`, `SameSite=None` (the IdP POSTs the assertion back cross-site).
>
> **4. THIS TASK IS THE ONE THAT MAKES THE FOUR SHARED HTML PAGES LIE.** Sitting 1 checked them
> and they are still accurate, because it wrote no console code: `manifest-schematic.html` says
> in two places *"no user interface has been built yet"* (once under **02 — Start to finish**,
> once in its closing note) and `manifest-phases.html` carries the same claim. **When this task
> serves a real console at `console.manifest.internal`, all three statements become false** —
> and these are the pages Rich shares outside the team, which nothing in the build checks.
> Sweep them in **this** sitting's close-out, not later (ORIENTATION §6).
>
> **Editing the Caddyfile (measured, and it is a bind-mount trap).** It is a **single-file bind
> mount**: an edit that writes a new file and renames it over the old one leaves `manifest-caddy`
> on the deleted inode. Sitting 1 edited it **inode-preserving** (open `r+`, `ftruncate`, write)
> and confirmed the inode was unchanged (`48091939`) before and after, then ran `make up` and
> **re-read the served bytes** rather than trusting the edit. Do the same here, and prove the
> restore by reading, never by having edited it back.

**§22 step 1, clicked.** This task replaces the Caddyfile's placeholder, builds the shell — the
router, the data layer, the refusal surface — and ends with a person signing in with CWL in a
browser and seeing their own name.

**Files:**
- Modify: `infra/caddy/Caddyfile` — the console site's `respond` line
- Create: `packages/console/src/api.ts`, `packages/console/src/router.ts`, `packages/console/src/ui.tsx`
- Modify: `packages/console/src/app.tsx`, `packages/console/src/auth.ts`
- Modify: `docs/superpowers/RUNBOOK.md` — how to start the console

**Interfaces:**
- Consumes: `signIn` / `signOut` (Task 3), `createManifestClient` and `unwrap` from `@manifest/contract`.
- Produces, for every later task:
  - `createApi({ origin, session? }): Api` — the data layer, with `getMe()` on it.
  - `useRoute(): Route` and `navigate(path: string): void` — the router.
  - `useAsync<T>(fn, deps): { value?: T; error?: unknown; loading: boolean; reload(): void }`.
  - `<Refusal error={unknown}/>`, `<Panel title>`, `<Field label>`, `<Ago at={string}/>`, `<Pill tone>`.

- [ ] **Step 1: The Caddyfile — one line, and the `pnpm test:docker` it owes**

```caddyfile
	route {
		@outside not remote_ip 10.89.0.1/32
		respond @outside "manifest: the control plane is not reachable from this network" 403
		@api path /v1/* /auth/*
		reverse_proxy @api host.docker.internal:7100 {
			stream_close_delay 1h
		}
		# P5c Task 4: the reference console, a host process on 7104 (§21's inventory), on the
		# SAME ORIGIN as the API — so the session cookie, §20's CSRF origin and the control
		# plane's SAML return URL are one HTTPS origin with no CORS. `vite dev` while working
		# on it, `vite preview` for the acceptance; `make demo-console` starts the second.
		# A 502 here means nothing is listening on 7104, not that the edge is broken.
		reverse_proxy host.docker.internal:7104
	}
```

```bash
make up            # ensure-caddy-config.sh hashes the file and reloads; READ its output
curl -sS -o /dev/null -w '%{http_code}\n' https://console.manifest.internal/    # 502 with nothing on 7104
curl -sS https://console.manifest.internal/v1/me                                # still 401 UNAUTHENTICATED
```

**The `/v1` and `/auth` matcher must stay ABOVE the console's `reverse_proxy`**, inside the same
`route` block: Caddy sorts handlers outside a `route` block and would otherwise put the catch-all
first. **The Caddyfile is a single-file bind mount** — if `make up` reports the edge cannot read
it, `docker restart manifest-caddy` re-binds the inode (§4).

**This task owes `pnpm test:docker`** (~13 min, `make up` first) because it changes `infra/`.
**Restart the control plane afterwards.**

- [ ] **Step 2: The data layer — one function per operation (Decision 6)**

```ts
// packages/console/src/api.ts
import {
  createManifestClient,
  idempotencyKey,
  unwrap,
  type Schemas,
} from '@manifest/contract'

/**
 * THE ONE PLACE THE CONSOLE CALLS THE API (D22, Decision 6). Components call these
 * functions and never hold the client, which is what makes three things checkable at once:
 * coverage.test.ts reads this file to answer "is the API complete?"; api.test.ts drives
 * these functions against manifest-mock in Node with no DOM; and `origin` is a parameter,
 * so the browser passes its own and a test passes the mock's.
 *
 * EVERY MUTATION TAKES ITS `Idempotency-Key` FROM THE CALLER (D23.6). The key is made once
 * per user ACTION with `idempotencyKey()` and reused if that action is retried — a key made
 * here, per call, would defeat the whole control.
 *
 * `unwrap` throws a `ManifestApiError` carrying D23.7's envelope; `<Refusal>` is the one
 * thing that renders it.
 */
export interface ApiOptions {
  origin: string
  /** For a NODE caller only. A browser sends its own cookie and its own Origin. */
  session?: string
}

export type Api = ReturnType<typeof createApi>

export function createApi(options: ApiOptions) {
  const client = createManifestClient(options)
  // [SITTING 3] `const key = (k: string) => ({ header: { 'Idempotency-Key': k } })` stood
  // here and DOES NOT PASS `pnpm lint` at this task: nothing calls it, and the `_`-prefix
  // forgiveness in eslint.config.js is scoped to packages/control-plane. TASK 5 ADDS IT
  // with the first mutation. `newKey` below is fine — a member of the returned object, not
  // a dead local.

  return {
    /** The idempotency key for one user action; hold it and reuse it on a retry. */
    newKey: idempotencyKey,

    async getMe(): Promise<Schemas['Me']> {
      return unwrap(await client.GET('/v1/me'), 'getMe')
    },
  } as const
}
```

**Every later task adds functions here and nowhere else.** The shape never varies: one `await
client.<METHOD>(<literal path>)`, wrapped in `unwrap` with the operation's name as the second
argument — which is what puts the operation id into the error message a person sees, and what
Task 13's coverage gate reads.

- [ ] **Step 3: The router — forty lines, no dependency (Decision 3)**

```ts
// packages/console/src/router.ts
import { useEffect, useState, type MouseEvent } from 'react'

/**
 * Real paths over pushState, not a hash (Decision 3). `GET /auth/login?returnTo=<path>`
 * accepts a same-origin path and the callback lands back on it (`safeReturnTo`), so a deep
 * link survives a sign-in — which a hash, never sent to the server, could not do.
 */
export type Route =
  | { name: 'projects' }
  | { name: 'blueprints' }
  | { name: 'fleet' }
  | { name: 'project'; projectId: string; tab: 'overview' | 'queue' | 'tokens' }
  | { name: 'unknown'; path: string }

export function parse(path: string): Route {
  const parts = path.split('/').filter((p) => p !== '')
  if (parts.length === 0) return { name: 'projects' }
  if (parts[0] === 'blueprints' && parts.length === 1) return { name: 'blueprints' }
  if (parts[0] === 'fleet' && parts.length === 1) return { name: 'fleet' }
  if (parts[0] === 'projects' && parts[1] !== undefined) {
    const tab = parts[2]
    if (tab === undefined || tab === 'queue' || tab === 'tokens')
      return { name: 'project', projectId: parts[1], tab: tab ?? 'overview' }
  }
  return { name: 'unknown', path }
}

export function navigate(path: string): void {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return parse(path)
}

/** An in-app link: a real anchor, so middle-click and copy-link work, with the navigation
 *  intercepted for the plain left click. */
export function href(path: string): {
  href: string
  onClick: (e: MouseEvent) => void
} {
  return {
    href: path,
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(path)
    },
  }
}
```

**`vite preview` and `vite dev` both serve `index.html` for an unknown path** (Vite's default
`appType: 'spa'`), which is what makes `/projects/<id>` reloadable. **Task 1's M6 measured that
`?returnTo=/projects/deep/path` survives**; if it did not, this router carries the route in a
query string on `/` instead and this step says so.

- [ ] **Step 4: The refusal surface and the four shared bits**

```tsx
// packages/console/src/ui.tsx
import { useCallback, useEffect, useState } from 'react'
import { ManifestApiError } from '@manifest/contract'

/** Every screen reads through this, so every refusal reaches one renderer. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ value?: T; error?: unknown; loading: boolean }>({
    loading: true,
  })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (value) => live && setState({ value, loading: false }),
      (error: unknown) => live && setState({ error, loading: false }),
    )
    return () => {
      live = false
    }
    // The caller owns `deps`. There is no react-hooks ESLint plugin in this workspace —
    // do NOT write an eslint-disable for a rule that is not installed: ESLint 9 says
    // nothing about it, so the comment reads as a suppressed warning that never existed.
  }, [...deps, tick])
  return { ...state, reload }
}

/**
 * D23.7: errors are machine-actionable — a stable code and a remediation hint — and this is
 * the one place the console renders one. It shows the CODE as well as the message, because
 * the code is what a person can quote and what every test in this project asserts; and it
 * renders the two typed extras the envelope can carry, so `RELEASE_PRODUCTION_GATE_UNAVAILABLE`
 * shows what a first launch still needs and `TOKEN_ACTION_PENDING` shows the question.
 */
export function Refusal({ error }: { error: unknown }) {
  if (error === undefined || error === null) return null
  if (!(error instanceof ManifestApiError)) {
    return (
      <p className="refusal">
        <strong>Something went wrong.</strong> {String(error)}
      </p>
    )
  }
  const envelope = error.envelope?.error
  return (
    <div className="refusal">
      <p>
        <code>{error.code}</code> — {envelope?.message ?? `HTTP ${error.status}`}
      </p>
      {envelope?.hint !== undefined && <p className="hint">{envelope.hint}</p>}
      {envelope?.details !== undefined && (
        <ul>
          {envelope.details.map((d, i) => (
            <li key={i}>
              <code>{d.path}</code> {d.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="field">
      <span className="label">{label}</span> {children}
    </p>
  )
}

export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

/** "4 minutes ago", from an ISO instant. §26's headline number is an AGE, so the console
 *  has one renderer for it rather than a `Date` subtraction per screen. */
export function Ago({ at }: { at: string }) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 1000))
  const text =
    seconds < 60
      ? `${seconds}s ago`
      : seconds < 3600
        ? `${Math.round(seconds / 60)}m ago`
        : `${Math.round(seconds / 3600)}h ago`
  return <time dateTime={at}>{text}</time>
}
```

**`details[].path` and `.message` come from `ManifestError`** in the document — check the field
names against `packages/contract/openapi.json` before writing this, because `tsc` will not
tell you until the build and a wrong key renders `undefined` silently.

- [ ] **Step 5: The shell**

```tsx
// packages/console/src/app.tsx
import { createApi } from './api'
import { signIn, signOut } from './auth'
import { href, useRoute } from './router'
import { Refusal, useAsync } from './ui'

/**
 * §22's reference console. QUALITY BAR, from §22: plain but presentable — no design system,
 * no branding, system fonts, minimal CSS. Coherent enough to walk a pilot faculty member
 * through, obviously not polished enough that anyone mistakes its choices for product
 * decisions. The real experience is the separate front-end project's job.
 *
 * ONE ORIGIN: the API is same-origin with this page (§21), so the client is built with
 * `window.location.origin` and the browser supplies the cookie and §20's `Origin` itself.
 */
const api = createApi({ origin: window.location.origin })

export function App() {
  const me = useAsync(() => api.getMe(), [])
  const route = useRoute()

  if (me.loading) return <main className="shell">…</main>

  // 401 is not an error to display; it is the sign-in screen.
  if (me.error !== undefined && (me.error as { status?: number }).status === 401) {
    return (
      <main className="shell signin">
        <h1>Manifest</h1>
        <p>Sign in with your CWL to continue.</p>
        <button onClick={() => signIn()}>Sign in with CWL</button>
      </main>
    )
  }
  if (me.error !== undefined)
    return (
      <main className="shell">
        <Refusal error={me.error} />
      </main>
    )

  const person = me.value!
  return (
    <>
      <header className="shell-header">
        <a {...href('/')}>Manifest</a>
        <nav>
          <a {...href('/')}>Projects</a>
          <a {...href('/blueprints')}>Blueprints</a>
          {person.role === 'admin' && <a {...href('/fleet')}>Fleet</a>}
        </nav>
        <span>
          {person.displayName} <code>{person.puid}</code>
          {person.role === 'admin' && ' · administrator'}
        </span>
        <button onClick={() => void signOut()}>Sign out</button>
      </header>
      <main className="shell">
        <Screen route={route} api={api} />
      </main>
    </>
  )
}

/** Task 5 onwards replace each arm. Until then an honest placeholder, never a blank page. */
function Screen({ route }: { route: ReturnType<typeof useRoute>; api: ReturnType<typeof createApi> }) {
  return <p>Signed in. {route.name} is built by a later task of P5c.</p>
}
```

**`person.role === 'admin'` hides the Fleet link and hides NOTHING else**: `GET /v1/fleet`
answers a non-administrator `403`, not `404` — there is no tenant's resource to hide — so this
is an affordance, never a control. Say so in the code, because a reader will otherwise assume
the console is enforcing something.

- [ ] **Step 6: Run it, and sign in — the shared step**

```bash
pnpm --filter @manifest/contract build     # the console imports dist/
pnpm --filter @manifest/console dev &
curl -sS -o /dev/null -w '%{http_code}\n' https://console.manifest.internal/    # 200
```

Then in Chrome, at `https://console.manifest.internal/`:

1. the sign-in screen appears (nobody is signed in — `GET /v1/me` answered `401`);
2. click **Sign in with CWL** → the Manifest IdP's page at `idp.manifest.internal`;
3. **Rich types `instructor` / `instructor`** — an agent driving Chrome cannot (ORIENTATION §4);
4. the browser lands back on `/`, the header shows **ins000001**, and **Sign out** returns to
   the sign-in screen.

**Read the Network tab for two things and record both:** the `manifest_session` cookie's
attributes (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`), and the `Origin` header on
`POST /auth/logout`. **If the sign-in lands on `/` when it was started from a deep link**, M6's
measurement was wrong and the router carries the route in a query string instead.

- [ ] **Step 7: RUNBOOK, gates, commit**

Add a *Running the reference console* section to `RUNBOOK.md`: `make up`, the control plane,
then `pnpm --filter @manifest/console dev`, and **that it is reached at
`https://console.manifest.internal` and never at `127.0.0.1:7104`**, because a mutation from that
origin is refused `403 CSRF_ORIGIN_REFUSED` and the reason is invisible from the browser.

```bash
pnpm test && pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
pnpm test:docker          # this task changed infra/ — then restart the control plane
git add infra/caddy/Caddyfile packages/console docs/superpowers/RUNBOOK.md
git commit -m "feat(console): served at console.manifest.internal, and a CWL sign-in"
```

| Break | What must go red, by name |
|---|---|
| point the Caddyfile's console `reverse_proxy` at `host.docker.internal:7105` | the browser: `502` — **watched**. ***"And nothing else" WAS WRONG*** (sitting 3, F3): **`make doctor` and `make verify` BOTH see this line**, and both went red the first time they ran after the change — `CLAIMED BY SOMETHING ELSE: 7104`, and a console check that asserted the placeholder's own words. Both were repaired in sitting 3 |
| `createApi({ origin: 'https://idp.manifest.internal' })` | the browser: `GET /v1/me` fails and the sign-in screen never resolves. Names the console's dependence on one origin |
| remove `stream_close_delay 1h` from the `/v1` proxy | **nothing, yet** — the console holds no socket until Task 6. Recorded here as a control that CANNOT FAIL at this task and is re-watched at Task 6, rather than claimed now |

**The third row is the discipline this project pays for**: a control listed without saying it
cannot fail yet is a control someone later believes was watched.

---

## Task 5: My projects, and creating one — the slug check while it is typed

**§22 step 2, clicked**, and the first screen with a mutation on it.

**Files:**
- Create: `packages/console/src/screens/projects.tsx`, `packages/console/src/screens/blueprints.tsx`
- Modify: `packages/console/src/api.ts`, `packages/console/src/app.tsx`

**Interfaces:**
- Consumes: `createApi`, `useAsync`, `<Refusal>`, `href`, `navigate` (Task 4).
- Produces on `Api`: `listProjects`, `createProject`, `checkSlug`, `listBlueprints`,
  `getBlueprint`, `getKnowledgePack`.

- [ ] **Step 1: The six functions**

```ts
// packages/console/src/api.ts — inside createApi's returned object
    async listProjects(): Promise<Schemas['ProjectList']> {
      return unwrap(await client.GET('/v1/projects'), 'listProjects')
    },

    async createProject(
      body: Schemas['CreateProjectRequest'],
      idempotency: string,
    ): Promise<Schemas['CreatedProject']> {
      return unwrap(
        await client.POST('/v1/projects', { params: key(idempotency), body }),
        'createProject',
      )
    },

    async checkSlug(slug: string): Promise<Schemas['SlugCheck']> {
      return unwrap(
        await client.GET('/v1/slugs/{slug}', { params: { path: { slug } } }),
        'checkSlug',
      )
    },

    async listBlueprints(): Promise<Schemas['BlueprintList']> {
      return unwrap(await client.GET('/v1/blueprints'), 'listBlueprints')
    },

    async getBlueprint(blueprintRef: string): Promise<Schemas['Blueprint']> {
      return unwrap(
        await client.GET('/v1/blueprints/{blueprintRef}', {
          params: { path: { blueprintRef } },
        }),
        'getBlueprint',
      )
    },

    async getKnowledgePack(blueprintRef: string): Promise<Schemas['KnowledgePack']> {
      return unwrap(
        await client.GET('/v1/blueprints/{blueprintRef}/knowledge-pack', {
          params: { path: { blueprintRef } },
        }),
        'getKnowledgePack',
      )
    },
```

**`createProject` takes the idempotency key as an argument, not from inside.** The create form
makes one key when it is first submitted and **reuses it if the person clicks again** — which is
D23.6's actual purpose ("clients retry, and users double-click"), and a key made inside this
function would make a double-click create two projects.

- [ ] **Step 2: The projects screen, with the slug checked as it is typed**

```tsx
// packages/console/src/screens/projects.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { href, navigate } from '../router'
import { Field, Panel, Refusal, useAsync } from '../ui'

export function Projects({ api }: { api: Api }) {
  const projects = useAsync(() => api.listProjects(), [])
  return (
    <>
      <Panel title="My projects">
        {projects.error !== undefined && <Refusal error={projects.error} />}
        {projects.value?.length === 0 && <p>No projects yet. Create one below.</p>}
        <ul>
          {(projects.value ?? []).map((p) => (
            <li key={p.id}>
              <a {...href(`/projects/${p.id}`)}>{p.slug}</a> — {p.blueprint}
              {p.starter !== null && ` · ${p.starter}`}
            </li>
          ))}
        </ul>
      </Panel>
      <CreateProject api={api} onCreated={(id) => navigate(`/projects/${id}`)} />
    </>
  )
}

/**
 * §22 step 2: a name, a blueprint and a starter, and who it is for (§24).
 *
 * THE NAME IS CHECKED WHILE IT IS TYPED — `GET /v1/slugs/{slug}` exists for exactly this
 * (§23, P5a Task 9), and it answers `available` plus the REASONS a name is refused, so the
 * console never restates the slug rule. It is debounced at 300 ms because that route carries
 * its own per-user rate limit (P5a Task 9) and a check per keystroke would spend it.
 */
function CreateProject({ api, onCreated }: { api: Api; onCreated: (id: string) => void }) {
  const [slug, setSlug] = useState('')
  const [blueprint, setBlueprint] = useState('')
  const [starter, setStarter] = useState('')
  const [scale, setScale] = useState<Schemas['AudienceInput']['scale']>('class')
  const [burst, setBurst] = useState<Schemas['AudienceInput']['burst']>('steady')
  const [justification, setJustification] = useState('')
  const [check, setCheck] = useState<Schemas['SlugCheck'] | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)

  const blueprints = useAsync(() => api.listBlueprints(), [])
  const chosen = useMemo(
    () => blueprints.value?.find((b) => b.ref === blueprint),
    [blueprints.value, blueprint],
  )

  // ONE key per user action (D23.6): made on the first submit and reused on a retry, so a
  // double-click cannot create two projects. Cleared only once a create SUCCEEDS.
  const attemptKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (slug === '') {
      setCheck(undefined)
      return
    }
    const timer = setTimeout(() => {
      api.checkSlug(slug).then(setCheck, () => setCheck(undefined))
    }, 300)
    return () => clearTimeout(timer)
  }, [slug, api])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    attemptKey.current ??= api.newKey()
    try {
      const created = await api.createProject(
        {
          slug,
          blueprint,
          ...(starter === '' ? {} : { starter }),
          audience: {
            scale,
            burst,
            ...(justification === '' ? {} : { justification }),
          },
        },
        attemptKey.current,
      )
      attemptKey.current = undefined
      onCreated(created.id)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Create a project">
      <form onSubmit={submit}>
        <Field label="Name">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
          {check !== undefined && (
            <span className={check.available ? 'ok' : 'no'}>
              {check.available
                ? `${check.slug} is available`
                : (check.reasons ?? []).join('; ')}
            </span>
          )}
        </Field>
        <Field label="Blueprint">
          <select
            value={blueprint}
            onChange={(e) => {
              setBlueprint(e.target.value)
              setStarter('')
            }}
            required
          >
            <option value="">choose…</option>
            {(blueprints.value ?? []).map((b) => (
              <option key={b.ref} value={b.ref}>
                {b.name} ({b.ref})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starter">
          <select value={starter} onChange={(e) => setStarter(e.target.value)}>
            <option value="">just the skeleton</option>
            {(chosen?.starters ?? []).map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} — {s.summary}
              </option>
            ))}
          </select>
        </Field>
        {/* §24, D29: asked of a HUMAN, and only ever at creation — no agent can state it. */}
        <Field label="Who is it for">
          <select value={scale} onChange={(e) => setScale(e.target.value as typeof scale)}>
            <option value="solo">just me</option>
            <option value="class">a class</option>
            <option value="large_course">a large course</option>
            <option value="public">the public</option>
          </select>
          <select value={burst} onChange={(e) => setBurst(e.target.value as typeof burst)}>
            <option value="steady">arriving over days</option>
            <option value="synchronised">all at once</option>
          </select>
        </Field>
        <Field label="Why">
          <input value={justification} onChange={(e) => setJustification(e.target.value)} />
        </Field>
        <button disabled={busy || check?.available !== true}>Create</button>
      </form>
      <Refusal error={error} />
    </Panel>
  )
}
```

**Read `Blueprint.starters`' item fields out of `packages/contract/openapi.json` before writing
the `<option>`** — this snippet assumes `{ name, summary }` and `tsc` will name it if that is
wrong. **That is the loop D22 exists to create**: if a starter has no human-readable summary,
the API is missing something a console needs, and **that is a finding, not a reason to invent a
field**.

- [ ] **Step 3: The blueprint catalogue and its knowledge pack (D25)**

A small screen at `/blueprints`: the list, and for the chosen one its `provides`,
`schemaVersions` and starters — plus a **Knowledge pack** disclosure that calls
`getKnowledgePack` and shows each file's path and first lines. **D25's whole argument is that a
third-party agent on someone's laptop can read it over the API**, and this screen is what proves
the route has a caller that is not a test.

- [ ] **Step 4: Wire both into the shell's `Screen`, and click it**

In Chrome, signed in as the instructor:
1. `/` lists projects — **or says there are none, which is the truth after any `pnpm test`**;
2. type `journey-app` → *not available* with the reason; type `p5c-console` → *is available*;
3. type `edge` → refused as a **reserved label** (§23), with its reason;
4. choose `node-ts-mongo@1` and the `proof-app` starter, *a class*, *all at once*;
5. **Create** → it lands on `/projects/<id>`;
6. **click Create twice, fast, on a fresh form** → one project, because the key is reused.

- [ ] **Step 5: Gates, commit, controls**

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add packages/console && git commit -m "feat(console): my projects, and creating one (§22 step 2)"
```

| Break | What must go red, by name |
|---|---|
| `attemptKey.current = api.newKey()` on every submit | the browser: a double-click creates **two** projects. **No test sees it** — recorded as a property the clicked half owns |
| delete the `checkSlug` debounce's `clearTimeout` | nothing visible; the route's own rate limit is spent faster. Recorded as **not observable** rather than listed as a control |
| `blueprint: 'node-ts-mongo'` (no major version) | the API: `400`, with the code in `<Refusal>`. **This is the control worth watching** — it proves the refusal surface renders a real envelope rather than "something went wrong" |

---

## Task 6: The project screen, and the live event stream

**§22 step 3 — *watch provisioning: repository created, `manifest.yaml` validated*.** This is the
first screen that holds a socket, and **the console never polls** (D23.2).

> **[SITTING 3] THIS TASK OWES `<Ago>` ITS FIRST CALLER.** Task 4 wrote the five shared bits
> in `ui.tsx` and gave `<Panel>`, `<Field>` and `<Pill>` callers in its own commit (F7); the
> shell had no instant to render, so **`<Ago>` is the one module in this console that still
> has no call site** — the shape ORIENTATION §9 names four times. The event feed below is
> where it belongs. **Also re-watch the plan's Task 4 control that could not fail there**:
> removing `stream_close_delay 1h` from the Caddyfile's `/v1` proxy does nothing until this
> task holds a socket, and Task 4's record says so rather than claiming it was watched.
>
> **[SITTING 4] `<Ago>` HAS ITS CALLER, AND THAT SECOND CONTROL STILL HAS NOT BEEN WATCHED —
> now for the second task running.** Sitting 4 held a socket and ran it: with the field
> removed and the RUNNING config verified to contain zero occurrences of it, the console's
> stream stayed `live` through a full Caddyfile reload AND through the admin-API route
> change a deploy makes, and the socket was proved still alive afterwards. `srv0` is the
> only server and it holds `console.manifest.internal`, so the change hit the same server.
> **This is in tension with P5a sitting 2 and this plan's own M8, and the difference was
> deliberately not guessed at** (sitting 4's F7). **Nothing in it argues for removing the
> field.** Whoever needs this control should drive it as M8 did — an app's own socket
> through a RUNTIME route, which is where the field was genuinely absent — not through the
> console site. Do not write it down as watched until it has gone red.

**Files:**
- Create: `packages/console/src/stream.ts`, `packages/console/src/screens/project.tsx`
- Modify: `packages/console/src/api.ts`, `packages/console/src/app.tsx`

**Interfaces:**
- Consumes: `subscribe` from `@manifest/contract`; `useAsync`, `<Panel>`, `<Ago>`.
- Produces: `useProjectStream(projectId): { frames: StreamFrame[]; status: 'connecting' | 'live' | 'closed'; closeCode?: number }` — **every later screen consumes this one subscription**, and on `Api`: `getProject`, `getSpec`, `validateSpec`, `listEnvironments`, `getEnvironment`, `listMembers`, `addMember`, `removeMember`.

- [ ] **Step 1: One stream per project**

```ts
// packages/console/src/stream.ts
import { useEffect, useState } from 'react'
import { subscribe, type StreamFrame } from '@manifest/contract'

/**
 * D23.2: ONE event stream per project, never polling. Build logs, instance state
 * transitions, incidents and D24's pending actions all arrive here, so every screen on a
 * project consumes THIS hook rather than opening a second socket.
 *
 * The browser supplies the cookie and §20's `Origin` itself — `subscribe`'s browser branch
 * is `new WebSocket(url)` with neither — and a refused upgrade reaches a browser as close
 * **1006 with no status**, because a WebSocket client is never shown an HTTP status. So
 * `closeCode` is all the diagnosis there is, and the screen says so rather than spinning.
 *
 * `1013` is the server saying this client fell behind: RECONNECT, and the replay returns
 * what was missed (api/routes/events.ts). That is the one close code worth retrying, and it
 * is retried once — a reconnect loop against a struggling control plane makes it worse.
 */
export function useProjectStream(projectId: string) {
  const [frames, setFrames] = useState<StreamFrame[]>([])
  const [status, setStatus] = useState<'connecting' | 'live' | 'closed'>('connecting')
  const [closeCode, setCloseCode] = useState<number | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setFrames([])
    setStatus('connecting')
    const sub = subscribe({
      origin: window.location.origin,
      projectId,
      onFrame: (frame) => setFrames((f) => [...f, frame]),
    })
    sub.ready.then(
      () => setStatus('live'),
      () => undefined, // `closed` reports it; a rejection handled twice is noise
    )
    sub.closed.then(({ code }) => {
      setStatus('closed')
      setCloseCode(code)
      if (code === 1013 && attempt === 0) setAttempt(1)
    })
    return () => sub.close()
  }, [projectId, attempt])

  return { frames, status, closeCode }
}
```

**`sub.ready` resolves on the `control` frame, AFTER the replay** — so `status === 'live'` means
the whole replay is already in `frames`, and a screen that renders a count before that is
rendering a partial history. **The three creation events are always in the replay** (P5a Task 11:
`project.created`, `repository.seeded`, `spec.validated`), which is exactly what §22 step 3 asks
this screen to show.

- [ ] **Step 2: The project screen**

The overview panel: slug, blueprint, starter, owner, audience, the three environments with their
hostnames, and `spec.valid` with its errors if not. The **Activity** panel renders
`frames.filter(f => f.kind === 'event')` newest first, each as its `humanMessage` with an
`<Ago>` — **never a parsed `machineDetail`**, because §14 wrote `humanMessage` for a person and a
`zod/v4` union's refusal names no path if a frame is parsed and does not match.

A **Members** panel calls `listMembers`, `addMember` (a PUID and a role) and `removeMember`.
**`addMember` answers `400 MEMBER_USER_NOT_FOUND` for anybody who has never signed in**, and
`<Refusal>` shows that code and its hint — which is the honest behaviour, and is what makes
Task 11's queue demonstrable at all.

A **Spec** panel shows `getSpec` and a **Re-validate** button calling `validateSpec` — the caller
`validateSpec` needs for Task 13's coverage gate, and a real affordance: it is how a person sees
whether an edited `manifest.yaml` is valid.

- [ ] **Step 3: Click it, with the stream visible**

1. open `/projects/<the project Task 5 created>`;
2. the Activity panel already shows **three events** from the replay — *project created*,
   *repository seeded*, *spec validated* — and the status says **live**;
3. in another terminal `bash scripts/admin-grant.sh` is *not* what to use — instead run
   `make demo-token` in a second terminal against a different project and confirm **this**
   project's stream shows nothing (one stream per project, and it is scoped);
4. leave the tab open for two minutes and confirm the socket stays **live** — the console
   site's `stream_close_delay 1h` is what makes that true across any deploy anywhere.

- [ ] **Step 4: Gates, commit, controls**

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
git add packages/console && git commit -m "feat(console): the project screen and its live event stream (§22 step 3)"
```

| Break | What must go red, by name |
|---|---|
| remove `stream_close_delay 1h` from the Caddyfile's console site, `make up`, then deploy anything | the open tab: status **closed**, `closeCode` **1001**. **This is Task 4's third control, now watchable** — and it is the measurement P5a sitting 2 made for the API, re-made for a client that holds the socket |
| `subscribe({ ... })` given a `projectId` the person may not read | status **closed**, `closeCode` **1006** — no status, which is what the hook's comment says and what a person is shown |
| return `[]` from `onFrame`'s setter | the Activity panel is empty **and the status is still live** — the two are independent, which is why the screen shows both |

---

## Task 7: A build, with its log lines arriving as they are written

**§22 step 4.** A build answers `202` and ends on the stream (Rich's R6, P5a Task 13) — so this
screen is the first place in the console where **an answer that arrived is not the answer**.

> **[SITTING 4] STEP 2'S `liveBuild` SNIPPET DOES NOT TYPECHECK, AND IT IS NOT A TYPO —
> MEASURED, NOT PREDICTED.** Pasted verbatim into `packages/console/src` on TypeScript
> **5.9.3**, `tsc --noEmit` answers **`error TS2339: Property 'seq' does not exist on type
> '{ kind: "event"; … } | …21 more…'`**, twice, on the `.sort((a, b) => a.seq - b.seq)` line.
> TS 5.5+ infers a type predicate from `.filter((f) => f.kind === 'log')`, **but not from the
> COMPOUND condition the snippet uses** — the `&& f.buildId === buildId` clause defeats the
> inference, so `lines` stays `StreamFrame[]` and `seq` is not on every member. **The fix is
> one explicit predicate, and it was verified clean:**
>
> ```ts
> .filter((f): f is LogFrame => f.kind === 'log' && f.buildId === buildId)
> ```
>
> `LogFrame` is exported from `@manifest/contract` — add it to the type import. The `ended`
> `find` below is FINE as written and needs no predicate: narrowing inside the `&&` chain
> works, and its result is only ever tested for truthiness. **This is the same family as
> sitting 4's F4** (`addMember` answering a `Member`, not a `MemberList`): the generated types
> are the thing that catches a client's mistake, so run `pnpm --filter @manifest/console
> typecheck` as you write rather than at the end.
>
> **Two request bodies, read from the document so you do not have to guess:**
> `StartBuildRequest` is `{ commitSha?: string }` with **nothing required** — `{}` is valid and
> means the repository's HEAD — and `CreateReleaseRequest` is `{ buildId, summary? }` with
> `buildId` **required**.

**Files:**
- Create: `packages/console/src/screens/builds.tsx`
- Modify: `packages/console/src/api.ts`, `packages/console/src/screens/project.tsx`

**Interfaces:**
- Consumes: `useProjectStream` (Task 6).
- Produces on `Api`: `startBuild`, `listBuilds`, `getBuild`, `getBuildLog`, `createRelease`,
  `listReleases`, `getRelease`.

- [ ] **Step 1: The seven functions**

```ts
// packages/console/src/api.ts — inside createApi's returned object
    async startBuild(
      projectId: string,
      body: Schemas['StartBuildRequest'],
      idempotency: string,
    ): Promise<Schemas['Build']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/builds', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'startBuild',
      )
    },

    async listBuilds(projectId: string): Promise<Schemas['BuildList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/builds', {
          params: { path: { projectId } },
        }),
        'listBuilds',
      )
    },

    async getBuild(buildId: string): Promise<Schemas['Build']> {
      return unwrap(
        await client.GET('/v1/builds/{buildId}', { params: { path: { buildId } } }),
        'getBuild',
      )
    },

    /** `tail` is the LAST n lines; the stream carries the rest as they are written. */
    async getBuildLog(buildId: string, tail?: number): Promise<Schemas['BuildLog']> {
      return unwrap(
        await client.GET('/v1/builds/{buildId}/logs', {
          params: { path: { buildId }, ...(tail === undefined ? {} : { query: { tail } }) },
        }),
        'getBuildLog',
      )
    },

    async createRelease(
      projectId: string,
      body: Schemas['CreateReleaseRequest'],
      idempotency: string,
    ): Promise<Schemas['Release']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/releases', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'createRelease',
      )
    },

    async listReleases(projectId: string): Promise<Schemas['ReleaseList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/releases', {
          params: { path: { projectId } },
        }),
        'listReleases',
      )
    },

    async getRelease(releaseId: string): Promise<Schemas['Release']> {
      return unwrap(
        await client.GET('/v1/releases/{releaseId}', { params: { path: { releaseId } } }),
        'getRelease',
      )
    },
```

- [ ] **Step 2: The screen — a build that ENDS on the stream, not in a response**

```tsx
// packages/console/src/screens/builds.tsx — the load-bearing part
/**
 * §22 step 4, and D23.9: `POST …/builds` answers **202** with the build `running`. So the
 * state this screen shows after the click is `running` and it MUST NOT be believed to be
 * final: the build's end arrives as a `build.succeeded` or `build.failed` EVENT, and its
 * log lines arrive as `log` frames in between (P5a Task 13, P4b Task 15).
 *
 * THE CONSOLE NEVER POLLS (D23.2). The only re-read here is one `getBuild` when a terminal
 * event for THIS build arrives, because the event carries the outcome and the resource
 * carries the digest and the scan.
 */
function liveBuild(frames: StreamFrame[], buildId: string) {
  const lines = frames
    .filter((f) => f.kind === 'log' && f.buildId === buildId)
    .sort((a, b) => a.seq - b.seq)
  const ended = frames.find(
    (f) =>
      f.kind === 'event' &&
      (f.type === 'build.succeeded' || f.type === 'build.failed') &&
      f.subject === `build:${buildId}`,
  )
  return { lines, ended }
}
```

The panel shows, for the newest build: its `status` as a `<Pill>`, its `commitSha`, its
`imageDigest` once there is one, **its `scan`** — the scanner, the database's age (**`null`
means the scanner could not say, and `assessScan` treats that as stale**), whether the base image
was identified, and the Critical/High counts for the three buckets — and a `<pre>` of the log
lines that **auto-scrolls only while it is already at the bottom**, so a person reading back
through a failure is not dragged away.

**`log` frames carry `seq`, and they are sorted by it rather than by arrival.** `demux` yields
one record per line with the terminator stripped, and the stream's replay-then-flush ordering is
by publication, not by sequence.

- [ ] **Step 3: Click it**

1. on the project screen, **Build** → the panel appears at once, `running`;
2. log lines arrive **while it runs** — that is the check; a `<pre>` that fills only at the end
   means the frames are being collected and not rendered;
3. it ends `succeeded` **without the page being reloaded**;
4. **Release this build** → a `Release` appears with the build's digest and its scan.

**A first build of `node-ts-mongo@1` takes minutes**, and the builder's own timeout is 900 s.
Watch a whole one at least once in this sitting: the point of the screen is the middle, not the
ends.

- [ ] **Step 4: Gates, commit, controls**

| Break | What must go red, by name |
|---|---|
| filter log frames by `f.buildId === buildId` removed | the screen shows **another build's lines** in this build's log. Visible only with two builds in one project — say so, and make a second build to watch it |
| treat the `202`'s `status` as final (drop the `ended` lookup) | the build shows **`running` for ever** while the platform finished it. **This is R6's whole shape** and P5a sitting 12 measured its twin: a check that read a status where the property was a latency |
| sort log lines by arrival instead of `seq` | lines interleave out of order **only when a replay and live frames overlap** — reproduce it by opening the screen mid-build, not at the start |

---

## Task 8: Deploy to staging — instance states live, the app's URL, and an Incident when it fails

**§22 step 5, and the handoff to step 6** (the person opens the running app and signs in *inside*
it, which is the app's own UI and not the console's).

> **[SITTING 4] TWO OF STEP 1'S FOUR FUNCTIONS ALREADY EXIST — DO NOT PASTE THEM AGAIN.**
> `listEnvironments` and `getEnvironment` are in `api.ts` already: **Task 6's own *Interfaces*
> line produces them**, and sitting 4 wrote them there because the project screen renders §23's
> three hostnames. The plan lists them under BOTH tasks, which is a duplicate in the plan
> rather than a decision. Pasting Step 1 whole gives you two `listEnvironments` keys in one
> object literal — **`tsc` says `TS1117` and ESLint says `no-dupe-keys`**, so it fails loudly
> rather than silently, but it costs you the detour. **Task 8 adds exactly two functions:
> `deploy` and `listIncidents`.** Its snippets for those two are correct as written.
>
> `DeployRequest` is `{ releaseId }`, required — read from the document.

**Files:**
- Create: `packages/console/src/screens/deploy.tsx`
- Modify: `packages/console/src/api.ts`, `packages/console/src/screens/project.tsx`

**Interfaces:**
- Consumes: `useProjectStream`, `Api.listReleases` (Task 7).
- Produces on `Api`: `deploy`, `listEnvironments`, `getEnvironment`, `listIncidents`.

- [ ] **Step 1: The four functions**

```ts
// packages/console/src/api.ts
    async deploy(
      environmentId: string,
      body: Schemas['DeployRequest'],
      idempotency: string,
    ): Promise<Schemas['Instance']> {
      return unwrap(
        await client.POST('/v1/environments/{environmentId}/deploy', {
          params: { path: { environmentId }, ...key(idempotency) },
          body,
        }),
        'deploy',
      )
    },

    async listEnvironments(projectId: string): Promise<Schemas['EnvironmentList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/environments', {
          params: { path: { projectId } },
        }),
        'listEnvironments',
      )
    },

    async getEnvironment(environmentId: string): Promise<Schemas['Environment']> {
      return unwrap(
        await client.GET('/v1/environments/{environmentId}', {
          params: { path: { environmentId } },
        }),
        'getEnvironment',
      )
    },

    async listIncidents(environmentId: string): Promise<Schemas['IncidentList']> {
      return unwrap(
        await client.GET('/v1/environments/{environmentId}/incidents', {
          params: { path: { environmentId } },
        }),
        'listIncidents',
      )
    },
```

- [ ] **Step 2: The screen, and the three things it must get right**

**(a) A deploy answers once the instance serves or has failed** (D23.9's stated exception, P4c
R3) — so the button is disabled for the length of the call, and the call can take tens of
seconds. **A timeout in the console would abandon a deploy that is still happening**; there is
none, and the screen says *deploying…* with the states arriving live beneath it.

**(b) A DEPLOY THAT NEVER BECOMES READY IS A `200` WHOSE `state` IS `failed`** (P4b Task 13),
with an Incident, and the previous instance keeps serving. **So the screen switches on
`instance.state`, never on the HTTP status** — this is the single most repeated defect shape in
this project, and the console is the newest place to make it.

**(c) The states arrive as events, in an order that is three or four long**: `instance.provisioning`
→ (`sso.registered`, for an app with CWL sign-on) → `instance.starting` → `instance.healthy` or
`instance.failed` (+ `incident.opened`). Render them as a list as they arrive, not as a
progress bar with a guessed number of steps.

Each environment panel shows `hostname`, its `url` as **a link a person clicks for §22 step 6**,
and its current `instance`'s state. When an `incident.opened` event arrives, the Incidents panel
reads `listIncidents` and shows `exitReason`, `failedCheck`, `diffSinceHealthy` and the
`logTail` — §14's Incident exists to make a failure diagnosable, and a console that shows only
*failed* wastes it.

**Production is in the list and its deploy button refuses**: `409
RELEASE_PRODUCTION_GATE_UNAVAILABLE`, whose envelope carries `launchReadiness` — which
`<Refusal>` already renders and Task 9 gives a screen of its own. **Leave the button there**;
hiding it would make the console teach something the platform does not do.

- [ ] **Step 3: Click it**

1. **Deploy to staging** with the release from Task 7 → states arrive live, ending `healthy`;
2. the staging URL is a link; **open it and sign in inside the app with CWL** (§22 step 6 — the
   app's own UI, and Rich types the password);
3. **Deploy to production** → refused, and `<Refusal>` shows the checklist inside the envelope;
4. deploy the same release to staging **again** → P4c's redeploy, and nothing the person is
   doing in the app is interrupted.

- [ ] **Step 4: Gates, commit, controls**

| Break | What must go red, by name |
|---|---|
| switch on the HTTP status instead of `instance.state` | a failed deploy shows as **succeeded**, with an Incident in the panel beneath it contradicting it. **The most important control in this task** |
| drop `instance.failed` from the states the screen renders | a failed deploy shows `starting` for ever — the same shape as Task 7's, and both are the *answer arrived ≠ the answer* family |
| render `<a href={env.url}>` from `env.hostname` instead | the link is **relative** and navigates inside the console. Trivial, and it is the shape §23 keeps naming: a URL re-derived rather than read |

---

## Task 9: Request production, and the fleet

**§22 step 7 — *see `LaunchReadiness` with its blocked items and why*** — and §26's fleet, which
is what an administrator is for (D31).

**Files:**
- Create: `packages/console/src/screens/launch.tsx`, `packages/console/src/screens/fleet.tsx`
- Modify: `packages/console/src/api.ts`, `packages/console/src/app.tsx`

**Interfaces:**
- Produces on `Api`: `getLaunchReadiness`, `listFleet`.

- [ ] **Step 1: The two functions**

```ts
// packages/console/src/api.ts
    async getLaunchReadiness(projectId: string): Promise<Schemas['LaunchReadiness']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/launch-readiness', {
          params: { path: { projectId } },
        }),
        'getLaunchReadiness',
      )
    },

    /** §26's fleet, administrators only — a non-administrator is `403`, not `404`: there is
     *  no tenant's resource to hide (P5a Task 16). */
    async listFleet(): Promise<Schemas['Fleet']> {
      return unwrap(await client.GET('/v1/fleet'), 'listFleet')
    },
```

- [ ] **Step 2: The launch screen, which must be HONEST about Phase 1**

Each `LaunchReadinessItem` renders `title`, `state`, `owner`, **`why`**, and `blocking`. **`ready`
is `false` throughout Phase 1, honestly** (P5a Task 15): every item except *scans* says
`not_built` and names the plan that builds it, in `builtBy`. **The screen shows `builtBy` when
it is there** — that is the difference between *"this is broken"* and *"this arrives in Phase 2"*,
and it is the sentence a pilot faculty member will actually ask about.

**The same bytes appear in two places** and a person will compare them: the production deploy's
`409` carries this checklist in its envelope, and `mapError` parses it through the same
representation so the two agree key for key (P5a sitting 11, finding 1 — zod emits an object's
keys in schema order and a hand-built body does not). **Render the two through one component**,
so a difference is visible rather than plausible.

- [ ] **Step 3: The fleet, and the role that is not a control**

The fleet table shows, per project: slug, owner, blueprint, environments and their states,
current release digest, audience, open incidents. **The columns §26 names that do not exist yet
— department, custom domains, AI spend this month — are not invented**: the screen says which
are Phase 2's, the way the launch screen does.

**The Fleet link is hidden for a non-administrator and the route is not.** Navigate to `/fleet`
as the instructor and watch `<Refusal>` render `403 FORBIDDEN` — **that is the control**, and it
is what proves the console holds no authority of its own.

- [ ] **Step 4: Click it**

1. as the instructor, `/projects/<id>` → **Request production** → the checklist, every item with
   its `why`, `ready: false`;
2. as the instructor, navigate to `/fleet` by typing the URL → **`403 FORBIDDEN`**, rendered;
3. `bash scripts/admin-grant.sh grant opr000001 "P5c's console reads the fleet (§26)"`, then sign
   in as `operator` **twice** — a session carries the role it was issued with, so the first
   sign-in is not enough (P5a Task 16) — and the Fleet link appears and the table loads.

**Record what the second sign-in cost in clicks**, because that is a real finding about the
platform's ergonomics that only a console can produce.

- [ ] **Step 5: Gates, commit, controls**

| Break | What must go red, by name |
|---|---|
| hide the `/fleet` ROUTE for a non-administrator instead of the link | nothing visible — **and that is the finding**: the console would then look like it is enforcing something. Restore, and keep the refusal visible |
| render `state` without `why` | the screen says `not_built` with no reason. No test sees it; it is what the clicked half is for |
| read `ready` from `items.every(i => !i.blocking)` instead of the field | **green today and wrong in Phase 2** — the platform computes `ready`, and a client that recomputes it is a second source of truth (the defect shape P3 paid for seven times) |

---

## Task 10: Delegated tokens — minted once, listed, revoked

**D24, and the screen that makes P5b's credential class usable by a person.**

**Files:**
- Create: `packages/console/src/screens/tokens.tsx`
- Modify: `packages/console/src/api.ts`, `packages/console/src/app.tsx`

**Interfaces:**
- Produces on `Api`: `mintToken`, `listTokens`, `revokeToken`.

- [ ] **Step 1: The three functions**

```ts
// packages/console/src/api.ts
    /** THE ONE CALL IN THIS API THAT RETURNS A CREDENTIAL. `MintedToken.secret` exists on
     *  this response and on no read schema at all (P5b Decision 11) — so the console shows
     *  it once and can never fetch it again. */
    async mintToken(
      projectId: string,
      body: Schemas['MintTokenRequest'],
      idempotency: string,
    ): Promise<Schemas['MintedToken']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/tokens', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'mintToken',
      )
    },

    async listTokens(projectId: string): Promise<Schemas['TokenList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/tokens', {
          params: { path: { projectId } },
        }),
        'listTokens',
      )
    },

    /** Only the MINTER may revoke; everyone else gets the `404` an unknown id gets. */
    async revokeToken(tokenId: string, idempotency: string): Promise<Schemas['Token']> {
      return unwrap(
        await client.DELETE('/v1/tokens/{tokenId}', {
          params: { path: { tokenId }, ...key(idempotency) },
        }),
        'revokeToken',
      )
    },
```

- [ ] **Step 2: The screen, and the four things D24 makes true**

**(a) The secret is shown exactly once.** The mint response is the only place it exists; after
the panel is dismissed it is gone. The screen says so **before** the person clicks mint, not
after, and offers a copy button. **Never put it in `localStorage`, in a URL, or in a
`console.log`** — §14, and an operator line with a credential in it is the defect this project
names four times.

**(b) The privileged four are not offerable.** The capability checkboxes come from the
document's own enum (`MintTokenRequest.capabilities`), and `members:manage`, `release:promote`,
`quota:set` and `secret:read` are rendered **disabled, with the reason** — *"D24: a delegated
token never carries this, however it is minted. An agent that asks is answered with a question a
person confirms."* The platform refuses them anyway (`400 TOKEN_CAPABILITY_FORBIDDEN`), which is
the control; the console explains rather than enforces.

**(c) `expired` is a computed field and is NOT `revokedAt !== null`** (P5b Task 10). A clock and
a person are different answers to why a credential stopped, and the list shows which: *expired*,
*revoked by you*, or *active*.

**(d) A minter's own token list is the project's.** `listTokens` is project-scoped; a token a
collaborator minted is visible, and **only its minter may revoke it** — so the revoke button is
shown for every row and its `404` is rendered when it is not yours. **Do not hide the button by
guessing who the minter is**: the console has no field for it, and guessing is the console
inventing authority.

- [ ] **Step 3: Click it**

1. `/projects/<id>/tokens` → **Mint** with `project:read`, `build:create`, `release:create`,
   `release:deploy`, 30 days → the secret appears **once**;
2. reload the page → the secret is gone and the token is in the list, `active`;
3. try to tick `members:manage` → disabled, with the reason;
4. **Revoke** → the row says *revoked*, and `expired` stays `false` — the two are different;
5. paste the secret into a terminal and use it: `curl -H "authorization: Bearer <secret>"
   https://console.manifest.internal/v1/me` → **`403 TOKEN_CREDENTIAL_REFUSED`**, because `/v1/me`
   is interactive-only. **That is the right refusal and it is worth seeing**: the token works,
   and that route is not for it.

- [ ] **Step 4: Gates, commit, controls**

| Break | What must go red, by name |
|---|---|
| keep the secret in component state after the panel closes | nothing — **and it is a real leak**. Recorded as a property no test holds; the code comment is the only guard, which is why it is written as one |
| render `expired: revokedAt !== null` | a revoked-but-not-expired token reads *expired*. **P5b sitting 7's F4 is the twin**: `.map(toToken)` passed the array index as `now` and every token read `expired: false` |
| remove the `disabled` from the privileged four and mint one | the API refuses `400 TOKEN_CAPABILITY_FORBIDDEN`, rendered by `<Refusal>`. **The control is the platform's, not the console's**, and watching it here is what proves that |

---

## Task 11: §26's queue as a screen — the first time D24's loop is operated by a human

**The sitting this plan exists for as much as any.** `make demo-token` drives D24's whole loop
with `curl`; this is a person seeing an agent's question, reading what it would do, and deciding.

> **[SITTING 6] ONE OF STEP 1'S FOUR SNIPPETS DOES NOT COMPILE, AND IT IS `confirmPendingAction`.**
> Measured at the close of sitting 6 by pasting all four into `packages/console/src/api.ts`
> verbatim and running `tsc --noEmit`: three are clean and that one is
> **`TS2345 … Property 'body' is missing in type … but required in type '{ body: {} & …}'`**.
> `POST …/confirm` takes a **required** `EmptyRequest` body in the document — `requestBody.required`
> is `true` with schema `EmptyRequest` — so the call needs `body: {}`, exactly as `validateSpec`
> already passes it. **Add the one line:**
> ```ts
>         await client.POST('/v1/pending-actions/{pendingActionId}/confirm', {
>           params: { path: { pendingActionId }, ...key(idempotency) },
>           body: {},          // ← REQUIRED: EmptyRequest, and tsc refuses the call without it
>         }),
> ```
> With it, `tsc --noEmit` is clean; the fix was verified and then reverted, so the tree you are
> handed is untouched. **`rejectPendingAction` is fine** — it passes `body` already — and the two
> GETs take none. Every schema name Step 1 uses exists and matches the document
> (`PendingActionList`, `PendingAction`, `RejectPendingActionRequest`), and `Idempotency-Key` is
> required on confirm and reject and **not** on the two reads. *Sitting 5's audit recorded the
> opposite result for Tasks 9 and 10 — all five of their snippets compiled — so do not assume
> either way; this one was tested.*

**Files:**
- Create: `packages/console/src/screens/queue.tsx`
- Modify: `packages/console/src/api.ts`, `packages/console/src/screens/project.tsx`

**Interfaces:**
- Produces on `Api`: `listPendingActions`, `getPendingAction`, `confirmPendingAction`,
  `rejectPendingAction`.

- [ ] **Step 1: The four functions**

```ts
// packages/console/src/api.ts
    /** §26's queue. A SESSION that may read the project sees every question; a TOKEN sees
     *  only the ones it asked (P5b Task 8) — the console is always the first. */
    async listPendingActions(projectId: string): Promise<Schemas['PendingActionList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/pending-actions', {
          params: { path: { projectId } },
        }),
        'listPendingActions',
      )
    },

    async getPendingAction(pendingActionId: string): Promise<Schemas['PendingAction']> {
      return unwrap(
        await client.GET('/v1/pending-actions/{pendingActionId}', {
          params: { path: { pendingActionId } },
        }),
        'getPendingAction',
      )
    },

    /** INTERACTIVE ONLY, and the person must hold the capability THEMSELVES — a collaborator
     *  who may not manage members is `403 FORBIDDEN`, a stranger `404`. Confirming does not
     *  replay the request: it grants that EXACT request ONE retry, which the agent makes
     *  itself (P5b Decision 6). */
    async confirmPendingAction(
      pendingActionId: string,
      idempotency: string,
    ): Promise<Schemas['PendingAction']> {
      return unwrap(
        await client.POST('/v1/pending-actions/{pendingActionId}/confirm', {
          params: { path: { pendingActionId }, ...key(idempotency) },
        }),
        'confirmPendingAction',
      )
    },

    /** In the person's own words, which the agent is then told verbatim
     *  (`403 TOKEN_ACTION_REJECTED`) so it stops rather than loops. */
    async rejectPendingAction(
      pendingActionId: string,
      body: Schemas['RejectPendingActionRequest'],
      idempotency: string,
    ): Promise<Schemas['PendingAction']> {
      return unwrap(
        await client.POST('/v1/pending-actions/{pendingActionId}/reject', {
          params: { path: { pendingActionId }, ...key(idempotency) },
          body,
        }),
        'rejectPendingAction',
      )
    },
```

- [ ] **Step 2: The screen §26 describes**

§26: *"Each item shows what is being asked, by whom, what changes if it is granted, the diff
where there is one, and **how long it has waited**. The console's headline health number is the
age of the oldest item, because a queue that is merely long is working and a queue that is stale
is not."*

So the screen shows, per row: `action`, `summary`, `method` and `path`, the **token** that asked
(its id and, from `listTokens`, its name), `<Ago at={createdAt}/>`, and
**`waitingSeconds` as the platform computed it** — never a subtraction of two timestamps in the
console, because the platform publishes that number for exactly this screen (P5b Task 8). The
**headline is the age of the oldest `pending` row**, at the top, as §26 asks.

**`bodySha256` is shown and the body is not, because the body is not stored** — a person reading
a question on a screen gets the summary the platform wrote, and the hash is there so the agent's
retry can be shown to be the same request.

**DECISION 8'S CONTROL LIVES HERE.** A row's displayed state is computed:

```tsx
/**
 * THE SWEEPER DOES NOT RUN ON A TIMER, AND THIS SCREEN DOES NOT NEED IT TO (Decision 8).
 * `expirePendingActions` runs at boot and, scoped to one token, before a new question is
 * recorded — so a control plane up for a week can hold a `pending` row whose life ran out
 * days ago. It is a DISPLAY staleness and never a refusal one: `answerable` refuses a
 * lapsed row `409 PENDING_ACTION_RESOLVED` on the TIMESTAMP, not on the stored state.
 *
 * So the screen reads the timestamp too, and a lapsed question renders as expired with no
 * buttons. A timer would make the stored state honest for a screen that can be honest
 * without one — a third piece of background work for a display, which is the no-caller
 * shape ORIENTATION §9 names four times.
 */
function displayState(row: Schemas['PendingAction'], now: number): string {
  if (row.state === 'pending' && Date.parse(row.expiresAt) <= now) return 'expired'
  return row.state
}
```

**Confirm and reject are only offered for `displayState(row) === 'pending'`.**

**The queue updates from the stream, not from polling**: `pending_action.created`,
`.confirmed` and `.rejected` are event types (P5b), so the screen re-reads
`listPendingActions` when one arrives for this project and never on a timer.

- [ ] **Step 3: Click the whole loop — the sitting's deliverable**

**Disarm the trap first**: `POST /v1/projects/{id}/members` answers `400 MEMBER_USER_NOT_FOUND`
for anybody who has never signed in, and `pnpm test` empties `users`. **Sign `student` in once**
(in a private window, or use `scripts/demo-token.sh`'s own sign-in) before anything below.

1. mint a token in the console (Task 10) with `project:read` and `build:create` — **not**
   `members:manage`, which cannot be minted;
2. in a terminal, have the agent ask:
   ```bash
   curl -sS -X POST https://console.manifest.internal/v1/projects/<id>/members \
     -H "authorization: Bearer <secret>" -H 'content-type: application/json' \
     -H "idempotency-key: $(uuidgen | tr 'A-Z' 'a-z')" \
     -d '{"puid":"stu000001","role":"collaborator"}'
   ```
   → **`403 TOKEN_ACTION_PENDING`**, with the pending action `$ref`'d into the envelope;
3. **the console's queue shows it within a second**, from the stream — the question, the token,
   the age;
4. **Confirm** it;
5. the agent **retries with the SAME `idempotency-key`** — D23.6's own hint says to — and it
   succeeds **once**, `201`;
6. the agent retries again with a **fresh** key → a **new question** in the queue;
7. **Reject** that one with a reason in your own words → the agent is answered **`403
   TOKEN_ACTION_REJECTED`** carrying the reason verbatim;
8. leave one question unanswered and confirm it is still `pending` — it is what Task 10's expiry
   is for.

**Record how long step 3 took to appear.** *"The queue updates live"* and *"the queue updated"*
are different claims (ORIENTATION §9), and only one of them is a stream.

- [ ] **Step 4: Gates, commit, controls**

| Break | What must go red, by name |
|---|---|
| `displayState` returns `row.state` unchanged | a question past its `expiresAt` renders **pending with a Confirm button**, and confirming it is `409 PENDING_ACTION_RESOLVED` — a button that cannot work. **This is Decision 8's control**; make it watchable by minting a question and moving the row's `expires_at` back with `psql` |
| re-read the queue on a `setInterval` instead of on the event | **green, and it is the wrong shape** (D23.2). Watch it by disconnecting the socket: the interval keeps working, which is how you know the stream was not what updated it |
| confirm with a fresh idempotency key on the agent's retry | the retry creates a **second question** rather than succeeding — the grant is for that exact request, and the key is part of the agent's side, not the console's. Worth watching because it is the step a reader most often gets backwards |

---

## Task 12: `manifest-mock` — the contract from fixtures, with scripted streams

> ### [SITTING 7] Correction block — STEP 2'S FIXTURE DOES NOT COMPILE, IN TWO PLACES
>
> *Measured at the close of sitting 7 by pasting Step 2's `ME` and `PROJECT` verbatim into
> `packages/mock/src/` and running `pnpm --filter @manifest/mock typecheck`. `ME` is clean;
> `PROJECT` produces two errors, and both are shapes the snippet invents.*
>
> **1. `owner` has no `puid`.** `Project.owner` is `$ref: UserSummary`, and `UserSummary` is
> **`{ id, displayName }`** — both required, `additionalProperties: false`. The snippet writes
> `owner: { id: ME.id, puid: ME.puid, displayName: ME.displayName }`, which is
> **`TS2353 … 'puid' does not exist in type '{ id: string; displayName: string; }'`** and would
> fail the Ajv check too. *Step 2's own prose says "Check `owner`'s fields against `UserSummary`
> in the document before writing it" — so the task anticipated this and its own snippet still got
> it wrong. Drop `puid`.*
>
> **2. `audience` needs FIVE fields, not three.** `Audience` requires
> **`scale, burst, justification, setBy, setAt`**. The snippet gives the first three:
> **`TS2739 … is missing the following properties …: setBy, setAt`**. `setBy` is a string and
> `setAt` an ISO instant; `Project.audience` is `anyOf: [Audience, null]`, so `null` is also
> valid and is what a project created before §24 existed carries.
>
> **Two more things counted rather than estimated, both of which save a guess:**
>
> - **28 of the document's 52 schemas are 2xx response schemas** — the ones the routing table can
>   answer with, and therefore the natural size of `FIXTURES`. They are `Blueprint`,
>   `BlueprintList`, `Build`, `BuildList`, `BuildLog`, `CreatedProject`, `Environment`,
>   `EnvironmentList`, `Fleet`, `IncidentList`, `Instance`, `KnowledgePack`, `LaunchReadiness`,
>   `Me`, `Member`, `MemberList`, `MintedToken`, `PendingAction`, `PendingActionList`, `Project`,
>   `ProjectList`, `Release`, `ReleaseList`, `SlugCheck`, `Spec`, `SpecValidation`, `Token`,
>   `TokenList`. Step 2's comment lists fixture CONSTANT names, not schema names; the `FIXTURES`
>   table needs the schema names above, because `validate.test.ts` throws
>   *"the document has no schema …"* for anything else. Step 1's
>   `expect(FIXTURES.length).toBeGreaterThan(10)` is satisfiable with room to spare.
> - **`packages/console/src/api.test.ts` MAY import `@manifest/mock`, and neither half of the
>   import boundary will stop it.** *Checked, because the obvious worry is that it would and the
>   obvious fix would be to weaken the boundary.* `boundary.test.ts`'s scanner skips any file
>   ending `.test.ts`, and `eslint.config.js` carries
>   `ignores: ['packages/console/src/**/*.test.ts']` on the same rule. **Do not weaken either.**
>
> *`packages/mock` is NOT empty*: sitting 2 left `package.json`, `tsconfig.json`, `src/main.ts`
> and `src/server.ts`, and `createMockServer` already answers **`501` to everything on purpose**
> — its comment says a mock answering a plausible `200` to everything is the stand-in that
> produces a real-looking failure (P4c finding 74). **That `501` is what your first test should
> watch stop being.**

**§21: *"Front-end developers are not required to run the platform"*** — one process, not nine
containers plus a language model. **§16's Contract tier: *`manifest-mock` is validated against
the same document*, so a front-end built against the mock cannot compile against a contract the
real API does not serve.**

**Files:**
- Modify: `packages/mock/src/server.ts` (Task 2's stub)
- Create: `packages/mock/src/fixtures.ts`, `packages/mock/src/script.ts`, `packages/mock/src/validate.test.ts`
- Create: `packages/console/src/api.test.ts`
- Modify: `docs/superpowers/RUNBOOK.md`

**Interfaces:**
- Consumes: `Schemas` from `@manifest/contract`; `packages/contract/openapi.json`; `createApi` (Tasks 4–11).
- Produces: `createMockServer(): Server` — the same signature Task 2's stub has, so filling it
  in changes no caller — and `withMock(fn)` for the console's test. **Everything configurable
  is an environment variable** (`MANIFEST_MOCK_PORT`, `MANIFEST_MOCK_ROLE`,
  `MANIFEST_MOCK_FAIL`), because the mock's callers are a shell and a test, not a program.

- [ ] **Step 1: Write the validation test FIRST, against the stub**

```ts
// packages/mock/src/validate.test.ts
import { readFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
// AJV IS COMMONJS AND ITS ESM DEFAULT EXPORT IS INTEROPPED. Under Vitest's ESM loader the
// import above may land as `{ default: Ajv2020 }` rather than the class — the symptom is
// `Ajv2020 is not a constructor`, which reads like a missing dependency. If it does, the
// form is `const Ajv = (Ajv2020 as unknown as { default: typeof Ajv2020 }).default ?? Ajv2020`.
// Measure it on the first run rather than writing the defensive form blind.
import { FIXTURES } from './fixtures.js'

/**
 * §16's Contract tier. OPENAPI 3.1 IS JSON SCHEMA 2020-12, so this is `ajv/dist/2020` and
 * not ajv's default export: a draft-07 `Ajv` refuses these schemas with an error that reads
 * like a malformed document rather than like the wrong dialect (Task 1, M9).
 *
 * `strict: false` because an OpenAPI schema object carries keywords JSON Schema does not
 * define (`example`, `description` on a `$ref` sibling); `strict: true` rejects the
 * DOCUMENT, not the data, which would be a gate that fails for the wrong reason.
 */
async function validator() {
  const document = JSON.parse(
    await readFile(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
  ) as { components: { schemas: Record<string, unknown> } }
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  for (const [name, schema] of Object.entries(document.components.schemas)) {
    ajv.addSchema(schema as object, `#/components/schemas/${name}`)
  }
  return (name: string, value: unknown) => {
    const validate = ajv.getSchema(`#/components/schemas/${name}`)
    if (validate === undefined) throw new Error(`the document has no schema ${name}`)
    return { ok: validate(value) === true, errors: validate.errors }
  }
}

describe('manifest-mock serves the published contract', () => {
  it('validates every fixture against the document it claims to serve', async () => {
    const check = await validator()
    const failures: string[] = []
    for (const [name, value] of FIXTURES) {
      const { ok, errors } = check(name, value)
      if (!ok) failures.push(`${name}: ${JSON.stringify(errors)}`)
    }
    expect(failures).toEqual([])
    // A fixture table that is empty validates perfectly. Assert it was read.
    expect(FIXTURES.length, 'no fixtures were checked').toBeGreaterThan(10)
  })

  it('refuses a fixture the document would refuse — the scanner’s own control', async () => {
    const check = await validator()
    // `Me` requires `role`; the document says `additionalProperties: false`.
    expect(check('Me', { id: 'x', puid: 'p', displayName: 'd', email: 'e' }).ok).toBe(false)
    expect(check('Me', { id: 'x', puid: 'p', displayName: 'd', email: 'e', role: 'member', extra: 1 }).ok)
      .toBe(false)
  })
})
```

**The second test is the one that matters** and it is written first for the reason P5b sitting 9
paid for: **`expect(failures).toEqual([])` passes vacuously** against a validator that always
says yes, an empty fixture table, or a schema map that never loaded. The positive control is in
the same file, which is the structure sitting 8's F3 prescribed and sitting 9's F4 proved
necessary — *a first draft of an assertion that could not fail was caught by its own control.*

```bash
pnpm exec vitest run --project packages packages/mock/src/validate.test.ts
```

**Expected: RED** — `./fixtures.js` does not exist. That is the failing test this task starts from.

- [ ] **Step 2: The fixtures, typed by the contract's own types**

```ts
// packages/mock/src/fixtures.ts
import type { Schemas } from '@manifest/contract'

/**
 * Hand-written and held honest by two independent things (Decision 10): `tsc` against the
 * generated types, and `ajv` against the document in validate.test.ts. Neither alone is
 * enough — `tsc` cannot see `additionalProperties: false`, a `format` or a `pattern`, and
 * every representation in this document carries them.
 *
 * THE IDS ARE REAL UUIDs. The document's uuid `pattern` refuses `"project-1"`, and a
 * fixture that fails it fails in a way that reads like a mock defect rather than a fixture
 * one. The timestamps are fixed instants, not `new Date()`: a fixture whose value changes
 * per run cannot be asserted against.
 */
export const ME: Schemas['Me'] = {
  id: '11111111-1111-4111-8111-111111111111',
  puid: 'ins000001',
  displayName: 'Instructor One',
  email: 'instructor@example.test',
  role: 'member',
}

export const PROJECT: Schemas['Project'] = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'mock-app',
  blueprint: 'node-ts-mongo@1',
  starter: 'proof-app',
  owner: { id: ME.id, puid: ME.puid, displayName: ME.displayName },
  audience: { scale: 'class', burst: 'synchronised', justification: 'a mock' },
  createdAt: '2026-09-18T09:00:00.000Z',
}

/* …one per schema the routing table answers with: ENVIRONMENTS, BUILD, BUILD_LOG, RELEASE,
   INSTANCE, INCIDENTS, LAUNCH_READINESS, MEMBERS, TOKEN, MINTED_TOKEN, PENDING_ACTIONS,
   BLUEPRINTS, KNOWLEDGE_PACK, SLUG_AVAILABLE, SLUG_TAKEN, FLEET. Each is typed exactly as
   above, and each is added to FIXTURES below — a fixture not in that table is not checked. */

/** The table validate.test.ts reads: [schema name in the document, the value]. */
export const FIXTURES: [string, unknown][] = [
  ['Me', ME],
  ['Project', PROJECT],
  // …one row per fixture above
]
```

**Check `owner`'s fields against `UserSummary` in the document before writing it.** This is the
loop D22 exists to create: a field the console needs and the representation lacks is a finding
about the API, and **it is recorded rather than invented**.

- [ ] **Step 3: The routing table**

```ts
// packages/mock/src/server.ts — the shape
type Route = { method: string; pattern: RegExp; answer: (m: RegExpMatchArray) => unknown }

/**
 * ONE ENTRY PER OPERATION IN THE DOCUMENT, in the document's own order, so a reader can
 * diff the two. An operation with no entry answers 501 with the envelope Task 2 wrote —
 * DELIBERATELY, because a mock that answers a plausible 200 to everything is the stand-in
 * that produces a real-looking failure (P4c finding 74, the `nc` app).
 */
```

**What it must also do, and each is a rule the real platform has:**

- **`GET /auth/login?returnTo=` sets a fake `manifest_session` cookie and `302`s straight to
  `returnTo`.** There is no IdP here, and a mock that made a person sign in would defeat its own
  purpose. **`POST /auth/logout` clears it and answers `204`.** These two, and only these two, are
  the mock's unversioned surface — matching the console's `auth.ts` exactly.
- **A request with no session cookie is `401 UNAUTHENTICATED`**, with the envelope, so the
  console's sign-in screen is reachable against the mock.
- **A mutation with no `Idempotency-Key` is `400 REQUEST_INVALID`** (D23.6), because a console
  that forgot one must fail against the mock exactly as it fails against the platform.
- **A mutation replaying a key it has seen answers the FIRST response**, from an in-process map.
- **`GET /v1/fleet` is `403 FORBIDDEN`** unless `MANIFEST_MOCK_ROLE=admin`, so both sides of
  Task 9's affordance can be driven with no platform.
- **Every response body is validated against the document before it is sent**, in-process, and a
  body that fails is a `500` naming the schema — a mock that lies is worse than one that is down.

- [ ] **Step 4: The scripted stream (§21: *"including scripted WebSocket streams for build logs,
      deploy transitions and incidents"*)**

```ts
// packages/mock/src/script.ts — the shape
/**
 * The mock's `WS /v1/projects/:projectId/events`, over `ws`. It replays three creation
 * events, sends the CONTROL frame — the boundary `subscribe`'s `ready` resolves on, and the
 * reason the order here must match api/routes/events.ts's subscribe-replay-flush — and then
 * plays a scripted build and deploy on a timer:
 *
 *   build.started → 20 log frames, 150 ms apart, ascending `seq`
 *   → build.succeeded → instance.provisioning → sso.registered → instance.starting
 *   → instance.healthy
 *
 * The timings are what make the console's streaming screens developable with no platform:
 * a front-end developer sees lines arrive, not a block appear. `MANIFEST_MOCK_FAIL=1` plays
 * the other ending — instance.failed + incident.opened — because a client that has never
 * rendered a failure has not been tested.
 */
```

**Every frame it sends is validated against `StreamFrame` before it goes out**, by the same
validator — the frames are the half of the contract OpenAPI cannot describe, and they are where
a mock most easily drifts.

- [ ] **Step 5: The console's data layer, against the mock, in Node**

```ts
// packages/console/src/api.test.ts
import { createMockServer } from '../../mock/src/server.js'   // ← see the note below
import { describe, expect, it } from 'vitest'
import { createApi } from './api'

/** Starts the mock on an ephemeral port, hands `fn` its origin, and always closes it. */
async function withMock<T>(fn: (origin: string) => Promise<T>): Promise<T> {
  const server = createMockServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  try {
    return await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((r) => server.close(r))
  }
}

describe('the console’s data layer against manifest-mock', () => {
  it('reads who is signed in', async () => {
    await withMock(async (origin) => {
      const api = createApi({ origin, session: 'mock-session' })
      expect((await api.getMe()).puid).toBe('ins000001')
    })
  })

  it('carries an Idempotency-Key on every mutation — the mock refuses one without', async () => {
    /* …one case per mutation… */
  })
})
```

**THE IMPORT ABOVE CROSSES A PACKAGE BOUNDARY AND `boundary.test.ts` ALLOWS IT** — the boundary
reads only non-test files, exactly as the journey's does. **But `tsc` will not follow a relative
import outside `packages/console`'s `rootDir`** (§4, TS7016): add `@manifest/mock` as a
`devDependency` of the console in **this** task and import it as `@manifest/mock` rather than by
path. **That is a dependency addition after Task 2's network sitting** — it is a workspace link,
not a registry install, so it needs no network; **record it as a deliberate exception with this
reason**, because Global Constraints forbid the general case.

- [ ] **Step 6: Drive the console against the mock, in a browser**

```bash
pnpm --filter @manifest/mock build && node packages/mock/dist/main.js &
# Vite proxies /v1 and /auth to the mock when MANIFEST_MOCK is set — add this to vite.config.ts:
#   server: { proxy: process.env.MANIFEST_MOCK === undefined ? undefined
#     : { '/v1': 'http://127.0.0.1:7102', '/auth': 'http://127.0.0.1:7102' } }
MANIFEST_MOCK=1 pnpm --filter @manifest/console dev
```

Open **`http://127.0.0.1:7104`** — *this* is the one time the console is reached there rather
than through the edge, because there is no platform and no CSRF origin to satisfy. **Walk the
whole journey against the mock** and record which screens work and which do not. A screen that
cannot be driven against the mock is either a missing fixture or a console that is doing
something the contract does not describe — **both are findings, and the second is the more
interesting one.**

- [ ] **Step 7: RUNBOOK, gates, commit, controls**

RUNBOOK gains *Running `manifest-mock`*: one command, no platform, what it does and does not
prove. **State the limit in the document**: a green run against the mock is never evidence about
the platform (the brief's §8), and the mock's own fixtures are hand-written.

| Break | What must go red, by name |
|---|---|
| change `ME.role` to `"administrator"` | `validate.test.ts` — *Me: …enum…*. **The control that proves the validator is connected to the fixtures** |
| make `validator()` return `{ ok: true }` always | the second test — *expected true to be false*, twice. **Without it the first test passes against anything** |
| empty the `FIXTURES` table | the first test's `toBeGreaterThan(10)` — *no fixtures were checked* |
| drop the control frame from `script.ts` | the console against the mock: status **connecting** for ever. `subscribe`'s `ready` resolves on that frame and on nothing else |

---

## Task 13: The CI acceptance script, the coverage gate, and `@manifest/contract` 1.0.0

> ### [M7][M5] Correction block — the coverage gate's arithmetic, and a build the CI script owes
>
> *Two paragraphs. Written 2026-09-18 by P5c sitting 1; evidence in
> [`spikes/p5c-baseline/`](../spikes/p5c-baseline/README.md).*
>
> **1. The stream is ONE OF the 34 operations, not a 35th (M7/F5).** Task 1 Step 8 describes the
> total as *"34 operations (33 paths plus `streamProjectEvents`)"*. Measured: **`streamProjectEvents`
> is in `d.paths`** as `GET /v1/projects/{projectId}/events`. It is **34 paths, one of which is the
> stream.** Decision 15 says the gate reads every operation from `openapi.json` *"plus the stream
> and the two unversioned endpoints"* — read literally against the wrong decomposition, the gate
> demands a **35th** caller and can never balance. **Enumerate from `d.paths` only — 34, stream
> included — and add ONLY the two genuinely unversioned `/auth/` endpoints from `src/auth.ts`.**
> The control plane's own `coverage.test.ts` is consistent with this: the stream is *"documented
> and never defined"* — absent from the route **definitions**, present in the **document**.
> The count itself is confirmed: **34 operations, eleven `Idempotency-Key` headers, two query
> parameters** (`getBuildLog`'s `tail`, `getProject`'s `expand`). No route has moved.
>
> **2. `scripts/ci-acceptance.sh` must run `pnpm --filter @manifest/contract build` before the
> acceptance (M5/F3).** `packages/contract`'s `exports` map sends `tsc` to `src/` and Vite to
> `dist/`, so a stale `dist/` ships silently with every gate green. This bites hardest in **this**
> task, because Decision 14 bumps the version to `1.0.0` here — that changes `dist/`, and the
> acceptance must run against the built version that ships, not the previous one.

**Files:**
- Create: `scripts/ci-acceptance.sh`, `scripts/demo-console.sh`, `packages/console/src/coverage.test.ts`
- Modify: `Makefile`, `packages/contract/package.json`, `packages/control-plane/src/api/contract/document.ts` (the version), `packages/contract/openapi.json` (generated), `docs/superpowers/RUNBOOK.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `make ci-acceptance`, `make demo-console`, and D22's question as a gate.

- [ ] **Step 1: The coverage gate — D22's question as a build failure**

```ts
// packages/console/src/coverage.test.ts
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

/**
 * D22: *"If the console needs something the API does not expose, the API is incomplete."*
 * This is the converse, and it is the claim §16's *API completeness* tier exists to make
 * checkable: every operation the published contract declares has a CALLER in the console.
 *
 * It reads ONE file — src/api.ts — which is the whole reason Decision 6 put every call
 * there. Scanning the screens instead would be a text match over prose and JSX, which is
 * the shape that turned a gate red on a file with no forbidden import (P5b sitting 8, F3).
 */
const DELIBERATELY_UNCALLED: Record<string, string> = {
  // Deliberately empty, like ALLOWED_UNSET and PLATFORM_ONLY in the injection-drift tier.
  // An operation that lands here needs a REASON a reader can check, not a shrug — and
  // adding one is a decision about the API's completeness, recorded in the session record.
}

it('every operation in the published contract has a caller in the console (D22)', async () => {
  const document = JSON.parse(
    await readFile(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
  ) as { paths: Record<string, Record<string, { operationId?: string }>> }
  const source = await readFile(new URL('./api.ts', import.meta.url), 'utf8')
  const auth = await readFile(new URL('./auth.ts', import.meta.url), 'utf8')

  const uncalled: string[] = []
  let checked = 0
  for (const [path, operations] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const id = operation.operationId
      if (id === undefined) continue
      checked++
      if (id in DELIBERATELY_UNCALLED) continue
      // The stream is `subscribe`, not a client method, and it is called from stream.ts.
      const called =
        id === 'streamProjectEvents'
          ? /\bsubscribe\s*\(/.test(await readFile(new URL('./stream.ts', import.meta.url), 'utf8'))
          : new RegExp(`client\\.${method.toUpperCase()}\\(\\s*['"]${path.replace(/[{}]/g, '\\$&')}['"]`).test(source)
      if (!called) uncalled.push(`${method.toUpperCase()} ${path} (${id})`)
    }
  }
  expect(uncalled).toEqual([])
  // A document that failed to parse, or a path table that came back empty, validates
  // perfectly against an empty list. Assert what was READ (P5b sitting 8, F3).
  expect(checked, 'no operations were read from the document').toBeGreaterThan(30)
  // And that auth.ts still owns the two unversioned endpoints the client cannot carry.
  expect(auth).toContain('/auth/login')
  expect(auth).toContain('/auth/logout')
})
```

**If this test is red, the honest fixes are two**: add the caller, or add the operation to
`DELIBERATELY_UNCALLED` **with a reason**. **Weakening the regex is not one of them.**

> **[SITTING 7] IT WILL NOT BE RED. IT PASSES THE MOMENT YOU WRITE IT, SO WATCH IT FAIL ON
> PURPOSE.** *Measured at the close of sitting 7 by running this step's exact logic — the same
> regex, the same `streamProjectEvents` branch — over today's `api.ts`, `stream.ts` and
> `auth.ts`: **`uncalled` is empty, `checked` is 34**, and both `auth.ts` assertions hold.*
> Task 11 gave the last four operations their callers, so D22's question is already answered
> *yes* and this gate is green on arrival. **A gate that has never been red is a gate nobody has
> seen work** (§6 rule 6, and the reason three of this plan's own control rows turned out to be
> un-fireable). Comment out ONE call in `api.ts` — `listFleet` is the cheapest, one line, no
> caller to break — watch this test name exactly `GET /v1/fleet (listFleet)`, and restore. Do it
> **after** the task is committed, so `git checkout` restores from the index rather than
> destroying the task (§4).

- [ ] **Step 2: `make demo-console`**

`scripts/demo-console.sh`, modelled on `scripts/demo-token.sh`'s preamble:

- builds `@manifest/contract` and `@manifest/console` — **`tsc` writes its errors to STDOUT**, so
  capture `2>&1` and print them on failure (P5a sitting 5's control (e));
- asserts the control plane answers **`UNAUTHENTICATED`** through the edge — *the answer, not
  that an answer arrived*: a stopped control plane is Caddy's empty `502` and a refused source is
  a `403` with a body of its own, and `curl -o /dev/null` passes both;
- starts `vite preview` on 7104 and **waits for `https://console.manifest.internal/` to answer
  `200` with the console's HTML**, not with the edge's wildcard page — *`manifest OK host=…`* is
  what an unrouted name answers, and a status-only check passes against it (P4b finding 193);
- prints the clicked checklist (Task 14's, verbatim) and the URL;
- **traps and kills the preview server on exit**, and says so.

- [ ] **Step 3: `scripts/ci-acceptance.sh`**

```bash
#!/usr/bin/env bash
# 1c's acceptance, the HEADLESS half: §22's journey driven over the published contract with
# no browser automation at all (§22, *The CI half comes free*). The clicked half is a
# person's — an agent driving Chrome cannot type a password (ORIENTATION §4) — and
# docs/superpowers/WALKTHROUGH.md carries its checklist.
#
# THERE IS NO CI WORKFLOW FILE, deliberately (P5c Decision 11): nothing can run this but a
# Mac with Docker Desktop, Ollama with two models, a trusted CA and the 127.0.0.2 alias. A
# workflow no runner executes is a module with no call site. This script is the caller.
set -euo pipefail
```

It runs, in order, **each step reporting rather than exiting so a red run is a measurement**
(P4c Decision 26):

1. `make doctor` and `make verify` — **and `make verify` BEFORE any demo if the machine was
   just reset**, because after a reset the host can lose the edge while a container still has
   it, and the remedy is `docker restart manifest-caddy` (P5b sitting 9, F6);
2. `pnpm lint`, `pnpm typecheck`, `pnpm format:check`;
3. `pnpm test` — **and it asserts the COUNT**, not the exit code (Decision 12). A filtered or
   mis-pathed vitest run prints `No test files found` and exits 1, and a summary-only filter
   swallows that line (P5b sitting 9, F5). The expected counts are read from ORIENTATION §2's box
   **on the day this script is written**, and a mismatch prints
   `counts moved: expected N, got M — update ORIENTATION §2 and this script together`;
4. `pnpm --filter @manifest/console build` and `pnpm --filter @manifest/mock build` — the
   contract's `tsc` half is what proves the console still fits the document;
5. `make demo-journey` — §22's journey on a **session**;
6. `make demo-token` — D24's loop on a **delegated token**, which is why P5b came first;
7. a summary: each step, its outcome, and the one-line reason for any failure.

**`pnpm test` TRUNCATES the control plane's tables**, so step 3 runs **before** steps 5 and 6 and
the script says so in a comment. Running it the other way round empties the database the demos
just filled, and the demos then recreate their projects — slower, and it hides which step made
the machine what it is.

- [ ] **Step 4: `1.0.0`**

```bash
# packages/contract/package.json: "version": "1.0.0"
# and the document's info.version, which api/contract/document.ts sets
pnpm contract:write        # regenerates openapi.json — and TRUNCATES the tables
pnpm contract:generate
pnpm test                  # the equality test P5a Task 6 wrote holds the two together
```

P5a Decision 8: *"The major version is the path. P5c sets `1.0.0` when the console has proved the
contract."* **It has, by Task 11.** From here an additive change bumps the minor and a breaking
one is a new path prefix served beside `/v1`, never an edit to it (D23.8).

- [ ] **Step 5: Makefile, RUNBOOK, gates, commit**

```make
demo-console: up  ## P5c: serve the reference console and print the clicked checklist.
	@bash scripts/demo-console.sh

ci-acceptance: up  ## 1c's acceptance, headless: the gates and both journeys over one contract.
	@bash scripts/ci-acceptance.sh
```

| Break | What must go red, by name |
|---|---|
| remove one `client.GET(...)` from `api.ts` | `coverage.test.ts` — *expected [ 'GET /v1/… (listX)' ] to deeply equal []* |
| point `coverage.test.ts` at a document path that does not exist | its `readFile` throws. **Then point it at an EMPTY `{"paths":{}}`** and watch *no operations were read from the document* — the vacuous-pass control |
| make `ci-acceptance.sh` compare exit codes instead of counts | run it with one test file renamed away: **green**, with 40 fewer tests. Decision 12's control, and P5b sitting 9's F5 in a new place |

---

## Task 14: The acceptance — the journey clicked by a person and run headlessly by the script

> ### [M2][M6] Correction block — two things about driving Chrome that R3 does not cover
>
> *Two paragraphs. Written 2026-09-18 by P5c sitting 1, which drove Chrome for M2 and M3;
> evidence in [`spikes/p5c-baseline/`](../spikes/p5c-baseline/README.md).*
>
> **1. The extension cannot show you a request header (M2/F8).** `read_network_requests` returns
> URL, method and status — **not headers**. Sitting 1 needed the literal `Origin` and got it by
> POSTing to a path served by an upstream it controlled, which logged the header byte-for-byte.
> **Do not plan any check in this acceptance around reading a header out of DevTools**; if a
> literal request header matters, echo it from something you own, or assert it server-side.
>
> **2. Budget the CWL sign-ins against a ten-minute clock (M6).** `manifest_login` carries
> **`Max-Age=600`**, so a sign-in that sits on the IdP page longer than ten minutes **loses its
> `returnTo` path and lands on `/`**. R3's shared run has Rich typing a password at each CWL
> prompt while the agent narrates — which is exactly the arrangement that can exceed ten minutes
> between the redirect and the POST back. **Have the page open and Rich ready before triggering
> the redirect**, and if a deep link lands on `/` instead of the expected screen, suspect this
> before suspecting the router.

**ALONE, AND LAST.** §17's 1c demo: *"the §1 journey, clickable, run twice over one contract"*.
§16's Acceptance tier: *"by a human in the reference console, and headlessly in CI by a script
using the same generated client. Two independent clients over one contract."*

**Files:**
- Modify: `docs/superpowers/WALKTHROUGH.md` — the clicked journey, in full
- Modify: `docs/superpowers/RUNBOOK.md` — `make demo-console`, `make ci-acceptance`
- Modify: this plan — *What executing this plan found*, the final sitting
- Modify: `scripts/offline-acceptance.sh` — **a tenth step, if and only if Step 5 decides it**

- [ ] **Step 1: Run the headless half, three times, from three machine states**

Exactly as P5b's Task 13 did, because the three states find different things:

| Run | From |
|---|---|
| 1 | the machine as this sitting's baseline left it |
| 2 | the same machine again — the **re-use** path, where every project already exists |
| 3 | `echo reset | make reset`, `make up`, **`make verify`**, README's export block, `db:migrate`, the control plane, then the script |

**`make reset` prompts**, so it needs its answer on stdin from a tool call. **Export README's
WHOLE block before `db:migrate`**, not just `.env`: `MANIFEST_ADMIN_DATABASE_URL` is derived
there, not stored, and without it `drizzle-kit migrate` fails `[x] url: undefined` and names
neither the variable nor the file (P5b sitting 9, F7).

**Record the check counts and the wall time for each run.** A run that is 63 where the last was
64 is a *measurement*, not noise: name which check is missing and why (the create path has one
the re-use path does not).

- [ ] **Step 2: Run the clicked half with Rich — R3's shared session**

**The agent drives Chrome and reads every page. Rich types every password.** Record it as a GIF
(`mcp__claude-in-chrome__gif_creator`), naming the file for what it shows. The extension needs a
per-site permission for `idp.manifest.internal` before it can see the IdP's pages at all — ask
for it before starting, not mid-run.

**The checklist, and it goes into `WALKTHROUGH.md` verbatim so Rich can run it alone:**

| # | Click | What must be true |
|---|---|---|
| 1 | open `https://console.manifest.internal/` | the sign-in screen, not a blank page and not a 502 |
| 2 | **Sign in with CWL** → *(Rich types `instructor`/`instructor`)* | lands back on `/`; the header shows **Instructor One** and `ins000001` |
| 3 | type a name in **Create a project** | the availability answer changes **as you type**; `edge` is refused as a reserved label, with the reason |
| 4 | choose `node-ts-mongo@1` + `proof-app`, *a class*, *all at once*, **Create** | lands on the project, and **Activity already shows three events** — created, seeded, validated — from the replay |
| 5 | **Build** | the state is `running` **at once**, and **log lines arrive while it runs** |
| 6 | wait | it ends `succeeded` **with no reload**, and the scan summary is shown |
| 7 | **Release this build**, then **Deploy to staging** | instance states arrive live: provisioning → sso.registered → starting → healthy |
| 8 | click the staging URL → *(Rich types `student`/`student` inside the app)* | §22 step 6: the app knows who; **write a note**; **ask the LLM** and get an answer |
| 9 | back in the console, **Request production** | `LaunchReadiness`: `ready: false`, every item with its `why`, and `builtBy` naming the plan that builds it |
| 10 | **Tokens** → mint one for the agent | the secret is shown **once**; reload and it is gone; the privileged four cannot be ticked |
| 11 | in a terminal, the agent asks to add `stu000001` as a member | `403 TOKEN_ACTION_PENDING` |
| 12 | **Queue** | the question is there **within a second**, with its age and the token that asked |
| 13 | **Confirm** | the agent's retry with the **same** key succeeds `201`, **once** |
| 14 | the agent asks again with a **fresh** key, and you **Reject** with a reason | the agent is answered `403 TOKEN_ACTION_REJECTED` **carrying your words** |
| 15 | navigate to `/fleet` | `403 FORBIDDEN`, rendered — the console holds no authority of its own |
| 16 | **Sign out** | back to the sign-in screen |

**Step 8 is the one that proves §22's journey is whole**, and steps 11–14 are the first time
D24's loop has been operated by a person rather than by `curl`.

- [ ] **Step 3: The negative controls, watched and restored**

**Every control names the assertion that must go red, not the mechanism** — P5a sitting 12 found
three of fourteen that could not fail, and P5b sitting 9 found a prediction that a control would
be invisible which was **wrong in the direction that mattered**. **So measure each; do not
reason about it.** Commit the task first: `git checkout <path>` restores from the index, and on
an uncommitted file it destroys the work rather than the experiment.

| | Break | Predicted: in the clicked half | Predicted: in the tier |
|---|---|---|---|
| a | `api.ts`'s `getMe` calls `/v1/fleet` instead | step 2 — the header never loads | `coverage.test.ts` 1 red, `api.test.ts` 1 red |
| b | `stream_close_delay 1h` removed from the console's Caddyfile site, then a deploy | step 5 or 7 — the stream goes **closed 1001** mid-build | **nothing** — no test reads that line. *Stated in advance as invisible to the tier* |
| c | `coverage.test.ts`'s `DELIBERATELY_UNCALLED` given every operation | **nothing at all** — the clicked journey is unchanged | `coverage.test.ts` **green**, which is the defect. Its `checked > 30` assertion does not see it: **name this one as a gate that can be disarmed by its own exemption list**, which is the honest limit of Decision 15 |
| d | the mock's `ME` fixture given a `role` the enum lacks | nothing (the platform run does not touch the mock) | `validate.test.ts` 1 red |
| e | `displayState` in `queue.tsx` returns `row.state` unchanged | step 12 — an expired question offers a **Confirm** that answers `409` | **nothing** — Decision 8's control is a clicked one. *Stated in advance* |
| f | the console's `createApi` given `origin: 'http://127.0.0.1:7104'` | every mutation is `403 CSRF_ORIGIN_REFUSED`, rendered | `api.test.ts` **green** — it passes an explicit origin. **The difference between the browser and Node that *Read this first* 3 names** |

**Two of these six are predicted invisible to the tier and one is predicted invisible to both.**
**Measure all six anyway** — sitting 8 of P5b predicted one invisible and was wrong because it
reasoned about the fixture rather than the real credential, and the cost of checking is one run.

- [ ] **Step 4: Decide the tenth step of the offline acceptance**

`scripts/offline-acceptance.sh` has nine steps and each one proves something the others do not.
**Ask what a tenth would add that step 8 (`make demo-journey`) and step 9 (`make demo-token`) do
not already prove offline.** The console is a static bundle and the mock is a local process:
neither reaches the network at all once `pnpm install` has run, and both are already covered by
the `tsc` half of their builds.

**The answer this plan expects is a tenth step that runs `make demo-console`'s PREFLIGHT only** —
that the console builds offline from the checked-in contract and the edge serves it — because
that is the one claim about the console that is falsifiable without a person. **Decide it with
the measurement in hand and record the reasoning either way**; a step added because the list
looked short is worse than no step.

- [ ] **Step 5: Sweep, and close the plan out**

The full §6 checklist, and this plan is the last one of Phase 1c — so the sweep is bigger than a
sitting's:

- the **roadmap ledger** first: P5c executed, its findings count, and **§17's 1c question
  answered** — *is the API complete?* — with what the console found;
- the **plan's sittings table**, and its *What executing this plan found*;
- **ORIENTATION §2's box** (the four gate numbers, which moved), **§2's plan table**, **§3's
  *What the platform keeps true*** (the console, the mock, the boundary, the coverage gate),
  **§7e — which becomes the NEXT plan's brief, not this one's** — and **§8**, where R2's
  measurement closes or closes-out the `stream_close_delay` item;
- **`README.md`** (status, the *Where to start* table's current-job row), **`RUNBOOK.md`** (its
  gate totals, `make demo-console`, `make ci-acceptance`, running the mock), **`WALKTHROUGH.md`**
  (the clicked journey, and its *What is built* lines), **`CLAUDE.md`**'s *State*;
- **the four HTML pages**, which are shared outside the team and which **this plan changes more
  than any plan since P3**: `manifest-schematic.html`'s *"no user interface has been built yet"*
  disclaimers are **false the moment Task 4 lands**, and `manifest-phases.html`'s phase section
  moves. **They are the easiest to forget and the most expensive to get wrong.**
- **then re-read your own §7e as a cold agent and CHECK its claims** by opening what it points at
  and counting. That check has found a defect in every P5b sitting from the third onwards.

---

## What this plan does not build

Named because the spec asks for it, or because someone will look for it.

**Phase 2's, and §26 says so.**
- **`admin-ui/` — the ADMIN console.** §26's queue, fleet, people, spend, health and audit
  screens are an operations tool for the team running the platform, and §17 lands them in
  Phase 2. **This plan builds the project owner's queue**, which is where D24's confirmations
  live (*"the requesting user, in their queue"*), and nothing cross-tenant beyond the read-only
  fleet P5a already shipped. **The import boundary that binds `console/` binds `admin-ui/`**
  (D31), and Task 3's is the one to copy.
- **The `LaunchReadiness` GATE.** 1c ships the read-only view (§17); the gate that blocks on it,
  approvals with step-up re-authentication, `IamRegistration` and `PrivacyAssessment` as
  entities, custom domains, production promotion and the audience tiers' effects are Phase 2's.
  **Every item the console shows as `not_built` names the plan that builds it, in `builtBy`** —
  so the screen is the list.
- **Editing a project's audience after creation.** §24 asks the question at creation and D29
  makes it human-only; changing it is Phase 2's, and no route exists to call.

**Phase 3's.**
- **`mcp/` — the third reference client** (§22). *"Console (human), CI script (automation) and
  MCP (agent) are three independent clients over one contract."* Two of the three land here; the
  third lands with sandboxes, and **it inherits Task 3's boundary and Task 13's coverage gate
  unchanged**, which is what building them as tests rather than as conventions bought.
- **A chat pane in the console**, against the same API.

**Deliberately not attempted, and still open.**
- **NO DOM TEST TIER** (Decision 7). The console's screens are proved by a person clicking them
  and its calls by a Node test against the mock. **So a refactor of a screen can break the
  clicked journey with all four gates green**, and the only thing that catches it is re-running
  Task 14. Stated here rather than discovered: the fix, if it is ever wanted, is `jsdom` plus
  `@testing-library/react` and a fourth vitest project.
- **NO CI WORKFLOW FILE** (Decision 11). Nothing can run one: the journey needs Docker Desktop,
  Ollama with two models, a trusted CA in the macOS keychain and a loopback alias. **A
  contract-only workflow** — `pnpm install`, `typecheck`, `lint`, `vitest --project packages`,
  the mock's validation — **would run on an ordinary Linux runner and is the one worth adding
  the day a runner exists.** It is named rather than built because no runner exists to prove it
  either, and an unproved workflow is the no-caller shape again.
- **The mock's fixtures are hand-written, not captured** (Decision 10). They are held by `tsc`
  and by `ajv` against the document, which catches shape and format drift but not a *value* that
  no real platform would produce. **If a fixture is ever found lying, capture is the fix**: a
  flag on the journey that records each response, redacted.
- **The mock serves one project and one of everything.** Multi-tenant fixtures, pagination and
  an error-injection mode are what a front-end team will ask for second; the first thing they
  need is the journey, and this plan builds that.
- **The console does not render `machineDetail`.** Every event is shown as its `humanMessage`
  (§14 wrote it for a person) plus its type. Rendering 22 typed payloads is a screen per event
  type and a `zod/v4` union whose refusal names no path.
- **Nothing scans the control plane's own dependency tree** (ORIENTATION §8), and **this plan
  adds React, Vite and their closures to the workspace** — recorded by Task 2's `pnpm audit
  --prod`, gated on by nothing. The workspace's test toolchain already carries a Critical and a
  High (`vitest` 2.1.9, `vite` 5.4.21), neither reachable as used here.
- **The console holds no state of its own** (D23.5) — no saved filters, no collapsed panels,
  nothing in `localStorage`. If one is ever wanted, it is the client's and never the server's.
- **The second-machine clean clone** — out of 1c's acceptance by P5 R5, still in RUNBOOK's
  *Known gaps*.
- **The offline acceptance** is Rich's to run; whether it gains a tenth step is Task 14's Step 4.

---

## Spec actions

**None are needed to start.** §21's inventory already places the reference console on 7104 as a
host process served at `console.manifest.internal` through Caddy, which is exactly what Decision 4
builds; §22, §26, D22 and D31 describe the console this plan writes.

**One may be produced by Task 1, and it is Rich's** (CLAUDE.md: *never edit the spec; record the
proposed change and ask*):

1. **§12 / §11 — an app's route carries `stream_close_delay`.** *Proposed only if Task 1's M8
   measures the cut.* §8's open question has never been measured; R2 makes the measurement the
   decision. If an app route's proxied WebSocket is closed by an unrelated configuration reload,
   the field belongs on `buildRoute`'s `reverse_proxy` handler and the spec should say what the
   edge guarantees a proxied stream across a reload — *"a route change closes no stream for
   `<value>`"* — because that is a property an app author would otherwise have to discover.
   **If it is not cut, no spec action**: §8's item is closed with the measurement and the
   reason, and that is recorded in ORIENTATION §8's *Decided*.

**Two claims in the spec become TRUE with this plan and should be checked rather than changed**,
which is a sweep item and not a spec action: §16's *API completeness* tier (*"`console/` imports
nothing but `contract/`. A violation fails the build"*) is true from Task 3, and §16's *Contract*
tier (*"`manifest-mock` is validated against the same document"*) from Task 12. **Both were
aspirational until now**, and the four HTML pages shared outside the team say so in their own
words — `manifest-schematic.html`'s *"no user interface has been built yet"* is **false the
moment Task 4 lands**.

---

## What the self-review caught

*Written after the plan, before it executes — the record of what a fresh read found, so the next
reader does not mistake a fix for a mistake.*

1. **The whole console referred to CSS classes and no file defined them.** `ui.tsx` and every
   screen name `panel`, `field`, `refusal`, `hint`, `pill` and `shell`, and the File Structure
   had no stylesheet at all — so §22's *"plain but presentable"* quality bar, which is the one
   thing the spec says about how this console should LOOK, was specified nowhere. Added
   `src/styles.css`, imported once by `main.tsx`, with its size and its purpose stated.
2. **`router.ts` used `React.MouseEvent` and imported only two hooks.** With
   `verbatimModuleSyntax` and no `React` namespace import, that is a `tsc` error in a file no
   test imports — so it would have surfaced as a build failure in Task 4 rather than as a typo.
   Now `import { ..., type MouseEvent } from 'react'`.
3. **`ui.tsx` carried an `eslint-disable-next-line react-hooks/exhaustive-deps` for a plugin this
   workspace does not install.** ESLint 9 says nothing about a disable comment for an unknown
   rule, so it would have sat there for ever reading as a suppressed warning that never existed
   — the same family as P4c's *four settings that read like controls and are not*. Replaced with
   a comment that says why the deps are the caller's.
4. **`import './styles.css'` IS read by the boundary test**, and the first draft of its comment
   said it was not. It passes — `./styles.css` resolves inside `src/` — but a comment that
   misstates which rule applies is exactly how the next author "fixes" a gate by rewording
   something (P5b sitting 8's F3, in reverse). Corrected to say the test reads it and why it is
   allowed.
5. **Task 12 declared `createMockServer(options?)` while Task 2 wrote `createMockServer()`.** A
   signature that changes between the task that creates it and the task that fills it in is the
   type-consistency defect this review exists to catch. Settled on the no-argument form, with
   everything configurable as an environment variable, because the mock's callers are a shell
   and a test.
6. **`ajv`'s ESM default export may arrive interopped**, and the snippet constructed it directly.
   `Ajv2020 is not a constructor` reads like a missing dependency. Named in the file, with the
   form to use **if** it happens and an instruction to measure rather than write the defensive
   version blind.
7. **Task 1's browser probe posted `blueprintRef` and a string `audience`.** The contract's
   `CreateProjectRequest` is `{ slug, blueprint, starter?, audience: { scale, burst } }`. The
   probe would still have measured what it was for — the `401` arrives before body validation —
   but a snippet in this plan that does not match the contract is a snippet someone copies.
   Corrected against `openapi.json`.
8. **Task 4 listed a control that cannot fail at Task 4** — removing `stream_close_delay` from
   the console's site, when nothing holds a socket until Task 6. Left in place and **labelled as
   unable to fail yet, with the task that can watch it**, rather than deleted: a control listed
   without that label is a control the next reader believes was watched. P4c measured five of its
   own plan's controls unable to fail and P5a three of fourteen; this is the first one this plan
   can see from the page.
9. **The presentational JSX is deliberately not written in full, and the API calls are.** Tasks
   6 and 8–11 give the data layer, the hooks and the load-bearing logic (`liveBuild`,
   `displayState`, `useProjectStream`) as code, and describe the panels around them in prose.
   That is a departure from *"code blocks required for code steps"* and it is deliberate: §22's
   quality bar is *plain*, the JSX is the part an executor can write correctly from a
   description, and **every line that touches the contract — which is the part that can be wrong
   in a way `tsc` cannot see — is written out.** Stated so the executor knows the omission is a
   decision and not an oversight.
10. **Task 12's `api.test.ts` imports across a package boundary, which `tsc` refuses.** A
    relative import outside `rootDir` is TS7016 and `pnpm test` cannot see it (§4). Task 12 now
    adds `@manifest/mock` as a `devDependency` of the console — a workspace link needing no
    network — and **names it as a deliberate exception to Global Constraints' *no new dependency
    after Task 2***, because a constraint quietly broken is worse than one argued with.
11. **The coverage gate can be disarmed by its own exemption list, and Task 14 now says so.**
    `DELIBERATELY_UNCALLED` starts empty, but filling it with every operation leaves
    `coverage.test.ts` green with a console that calls nothing — and the `checked > 30`
    assertion does not see it. That is control (c) in Task 14's table, **predicted green and
    named as the honest limit of Decision 15**, rather than discovered by the acceptance.

---

## What executing this plan found

*One dated section per sitting: the tasks, every defect with the measurement that found it, the
negative controls, and the gate numbers at the end. Written for a reader who was not there.*

### Sitting 1 — Task 1, the measurements — 2026-09-18 — 19 findings

**All ten measurements ran (the baseline plus M1–M9). No task boundary moved, so the nine-sitting
split stands.** Nine of the twenty *Read this first* items carry a `(T1: M<n>)` marker; **all
nine were re-checked and all nine held.** The full record, with every raw command and answer, is
[`spikes/p5c-baseline/`](../spikes/p5c-baseline/README.md). `[M<n>]` correction blocks were added
to **Tasks 1, 2, 4, 13 and 14**.

**The headline: §8's `stream_close_delay` question is ANSWERED and CLOSED, and the plan's own
snippet for answering it would have answered it backwards.**

#### The findings

**F1 — Step 9's M8 snippet could not have measured what it exists to measure, and would have
closed Rich's four-plan-old question the WRONG way.** It causes the unrelated config reload with
node's `fetch`. undici appends `Origin: ''` to every non-GET request, and Caddy's admin listener
binds a wildcard host whose allowed-origin list is empty, so it answers `403 "client is not
allowed to access from origin ''"` — re-measured here, and documented at length in
`routing/caddy.ts`, which is why the control plane's own `adminRequest` uses `node:http`. The
snippet's `.then(() => console.log("unrelated route inserted"))` checks **neither `r.ok` nor
`r.status`**, so it prints that line on a `403`. The run would then have reached its timeout,
printed `SURVIVED 20s, still open`, and closed §8 as *"measured, and not a problem in Phase 1"* —
**on a config reload that never happened.** *The correction is not "use curl": it is to assert
the admin call's status and refuse to report a survival unless a reload is known to have
happened.* Both guards are in the client that took the real measurement, which exits `3` with
`MEASUREMENT INVALID` rather than reporting anything.

**F2 — the socket IS cut, measured in both directions, and `buildRoute` now carries the field.**
Against a route shaped as `buildRoute` shapes one (not the snippet's bare `reverse_proxy` — the
question is about what the *platform* writes): without the field, `CLOSED code=1001` **2 ms**
after an unrelated route was inserted; with `stream_close_delay: 3_600_000_000_000`, `SURVIVED
17971 ms`, still open. So one app's deploy, anywhere on the platform, was disconnecting every
WebSocket every other app held. `routing/caddy.ts` now sets the field and
`routing/caddy.test.ts` asserts it. **§8's item closes with the value.**

**F3 — `packages/contract`'s `exports` map sends `tsc` and Vite to DIFFERENT TREES.** It declares
`{ "types": "./src/index.ts", "default": "./dist/index.js" }`, so the console will **typecheck
against source and bundle `dist/`**. A stale `dist/` therefore ships with every gate green — `tsc`
never reads `dist/`, Vite never reads `src/`, and nothing reports the divergence. Lands on Tasks
2, 4 and 13; sharpest in 13, where Decision 14's `1.0.0` bump changes `dist/`.

**F4 — Decision 9 needs `ajv-formats`, and Task 2 is the ONLY sitting that may install it.** The
document carries **185 format assertions** (`uuid` ×141, `date-time` ×43, `uri` ×1 (counted across the whole document; **158** of them sit inside `components.schemas`, where `uuid` is ×114 — the two scopes give different totals, so state which one you mean)) and Ajv v8 implements none
itself: under `strict: true` an unknown format throws, otherwise **the assertion is silently
ignored** — and the silent one is the dangerous one. Both packages are in the pnpm store
transitively but declared by no `package.json`, and pnpm's strict `node_modules` means
`packages/mock` cannot resolve a transitive dependency. `ajv@6.15.0` (ESLint's, draft-07) is also
present, which is exactly the trap Decision 9 warns reads like a malformed document.

**F5 — "34 operations (33 paths plus `streamProjectEvents`)" is wrong, and it is Task 13's
arithmetic.** `streamProjectEvents` **is** one of the 34 paths (`GET
/v1/projects/{projectId}/events`, in `d.paths`). Decision 15 defines the coverage gate as every
operation in the document *"plus the stream"*; read against the wrong decomposition the gate
demands a 35th caller and can never balance. The **count** is confirmed correct — 34 operations,
eleven `Idempotency-Key` headers, two query parameters — so no route has moved.

**F6 — the M4 probe rewrites `pnpm-lock.yaml`, and Step 5's cleanup line does not restore it.**
The step ends `rm -rf packages/m4-probe && git status --short  # must be clean`. It is not clean:
any `pnpm` command run while the probe exists adds `+  packages/m4-probe: {}`. Restored with
`git checkout pnpm-lock.yaml`. In Task 2 the same edit is legitimate and belongs in the commit.

**F7 — the edge PRESERVES `Host: console.manifest.internal`** rather than rewriting it to the
upstream, and Vite's dev server rejects unknown hosts. **Task 2/4 must set `server.allowedHosts`.**

**F8 — the Chrome extension cannot show a request header.** `read_network_requests` returns URL,
method and status only. The plan's M2 says to read the literal `Origin` in the Network tab; it
was obtained instead by POSTing to a path served by an upstream this sitting controlled, which
logged the header byte-for-byte: **`Origin: https://console.manifest.internal`** — scheme and
host, no trailing slash, no port, and **passed through the edge unchanged**. *Method rule for
every later browser sitting, Task 14 included: if a literal request header matters, echo it from
something you own, or assert it server-side.*

**F9 — ORIENTATION §2's numbers box contradicts §2's own `Outstanding` bullet.** The box says
`make verify`'s per-app line "reads `containers=3 networks=8 volumes=3` today"; the bullet says it
"should now read `containers=3 networks=1 volumes=2`" after Rich cleared the dead resources. The
machine read **`1` and `2`** at this sitting's baseline, so the bullet was right and the box was
stale. Swept. *(It read `8`/`3` again after `pnpm test:docker`, exactly as both passages predict.)*

**F10 — a gate that passes on a new package proves nothing until you make it fail.** `pnpm lint`
exited 0 on the M4 probe, which reads as "ESLint sees the package and it is clean" but is
indistinguishable from "ESLint never looked". A bait file with a deliberate `any` settled it —
`pnpm lint` exit 1, `@typescript-eslint/no-explicit-any`. The same ambiguity would have been
recorded as a fact without the bait.

**F11 — the browser sends `Origin` on the WebSocket UPGRADE, measured end to end for the first
time.** *Read this first* 4 asserted it from the specification and from the route's code; M3
measured it through the edge: `UPGRADE host=console.manifest.internal
origin=https://console.manifest.internal path=/hmr-probe`. `assertSameOrigin` on
`WS /v1/projects/:id/events` will get what it requires.

**F12 — `manifest_login` carries `Max-Age=600`, and that is a trap for Task 14's SHARED run.** A
sign-in left sitting on the IdP page longer than **ten minutes** loses its `returnTo` path and
lands on `/`. Invisible when an agent drives a form in two seconds; very visible when R3 has Rich
typing a password at each CWL prompt.

**F13 — Task 2 does NOT need `server.hmr: false`.** The plan carries that as a branch to take if
an upgrade could not reach 7104. It reaches it, from both a Node client and a real browser, with
`Host` and path intact. The branch is not taken.

**F14 — the edge does no SPA fallback.** Deep paths arrive at the upstream unchanged (good — it
is what makes Decision 3's real-path router correct), but the trivial probe server only answered
them because it served `index.html` for every path. `vite preview` does its own fallback, so this
is a note for Task 4 rather than a change to any decision.

**F15 — `pgrep -f "vitest.*docker"` does not match a running Docker tier, and this sitting paid
for it.** The tier's argv is `node …/vitest 1`, with no "docker" in it, so a "has it finished?"
check answers **no** while it is still running. Acting on that answer, this sitting started a
**second concurrent `pnpm test:docker`** — two tiers sharing one database and one edge, each
truncating and restarting under the other. Both runs were discarded and the tier re-run once,
cleanly, for the number recorded below. *Use `ps aux | grep [v]itest`, or wait for the harness's
own completion notification, which is the only reliable signal.*

**F16 — the post-sweep check caught this sitting's own number, wrong in five documents at
once.** §6's *"open what you pointed at and count it"* was run at close and re-derived the format
figures instead of re-reading the sentence. **It had been written as "158 formats — `uuid` ×141,
`date-time` ×43, `uri` ×1", which cannot be true: 141 + 43 + 1 = 185.** The two numbers come from
two different scopes — `components.schemas` has **158** format assertions (`uuid` ×**114**), the
whole document has **185** (`uuid` ×141) — and the sentence had spliced the total from one to the
breakdown from the other. By the time the check ran it had already been copied into ORIENTATION
§7e, the plan's Task 2 correction block, the plan's own record, the roadmap's P5c row and the
spike README. **All five now state 185 with both scopes named**, because the fix for a restated
number is to say which scope it counts. *This is the F13-shaped defect §6 describes — a wrong
number inherited and multiplied — caught inside one sitting instead of by the next one, and it is
the reason the check is worth the ten minutes.*

**F17 — two of this sitting's five correction blocks miscounted themselves, which is the
sitting-4 defect exactly.** P5b sitting 4's defect was *"a correction block called 'one
paragraph' when it had two, so the paragraph the summariser did not need vanished — and it was
the one that contradicted the next task's own test"*. Here, Task 2's block said *"Four
paragraphs"* and had **five**, and Task 4's said *"Three"* and had **five**; in both cases the
uncounted paragraph was the LAST one — Task 2's before-measurement (the figures its own control
is watched against) and Task 4's Caddyfile bind-mount procedure. Both now state **FIVE** and say
in terms *"do not summarise away the last"*. Found by counting the items in each block, not by
re-reading the preamble.

**F18 — `safeReturnTo` was watched refusing, not just accepting.** `returnTo=/projects/deep/path`
round-trips intact; `returnTo=//evil.example.com/x` falls back to `/`. A measurement that only
showed the path being kept would not have shown the mechanism was in force.

**F19 — the hand-off asserted a live host process, and a sitting is one session. Raised by
Rich after the close.** §7e's state table said *"The control plane: RUNNING on 7100, pid 53829"*
as a fact the next agent could rely on — and the control plane is a **host** process started in
the background by this session, not a container. Containers survive a session ending; a child of
the session's shell does not reliably. **The evidence points both ways, which is the point**:
this sitting INHERITED a live control plane (pid 14881) from the session before it, so one has
outlived its session on this machine — and every §7e from P5b onwards has stated *"RUNNING on
7100"* the same way, so this is an inherited defect rather than a new one. **The fix is to write
the hand-off as what the next sitting NEEDS rather than as what happened to be running**: §7e now
says *check with `lsof`*, gives README's export block for restarting, and says plainly that
**sitting 2 does not need it at all** — Tasks 2 and 3 create packages, wire the gates and write
the boundary test, and the only server involved is the mock on 7102 that the sitting starts
itself; the four gates need **Postgres**, which is a container. Recorded durably in §4, because
it is a property of the machine and the one-sitting-per-session model, not of this plan.

#### The negative controls

The plan says this task's negative controls **are** the measurements, and four were run as pairs:

| Control | Watched |
|---|---|
| **M4** — a new package's test is silently not run | `expect(1).toBe(2)` in the tree; `pnpm test` **exit 0**, 1344/101, identical to baseline, `grep -c m4-probe` of the output **0** |
| **M4** — is `pnpm lint`'s green real? | a deliberate `any` bait file turned it **exit 1** (F10) |
| **M8** — the pair that makes it a measurement | **without** the field `CLOSED 1001` @2 ms; **with** it `SURVIVED 17971 ms` |
| **M6** — is the return-path check in force? | a legitimate deep path **kept**, a protocol-relative URL **refused** to `/` |
| **`stream_close_delay` assertion, (a)** | field removed → `expected undefined to be 3600000000000`, 1 failed / 10 passed |
| **`stream_close_delay` assertion, (b)** | value written as `'1h'` (the Caddyfile spelling the admin API refuses) → `expected '1h' to be 3600000000000` |
| **M1's restoration** | proved by **re-reading the placeholder through the edge**, plus `git diff --stat` empty and a byte-for-byte `diff` against a pristine copy — never by having edited it back |
| **M8's route cleanup** | both routes `DELETE`d and **read back** (`unknown object ID` each), not trusted to their exit codes |

Control (b) is the one worth keeping: a test asserting only `toBeDefined()` would have passed on a
route the edge refuses outright.

#### Gate numbers at the end of this sitting

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 1344 in 101 files | **1345 in 101 files** — up exactly 1, the `stream_close_delay` assertion. Run twice, both 1345 |
| `pnpm test:docker` | 178 in 29 files | **178 in 29 files** — unchanged; the assertion is a unit test |
| `make doctor` | 18/0 | **18/0** |
| `make verify` | 51/0 | **51/0** |

`pnpm lint`, `pnpm typecheck` (3 of 4 workspace projects) and `pnpm format:check` all clean.

#### Documents checked and deliberately NOT changed

*§6 asks that this be said rather than assumed.* **The four shared HTML pages were opened and
are still accurate**, because this sitting wrote no console code: `manifest-schematic.html` says
*"no user interface has been built yet"* in two places and `manifest-phases.html` in one, and all
three remain true. **Task 4 is what makes them false** — a note to that effect is now in Task 4's
own correction block, where the sitting that serves the console will see it.
`manifest-decisions.html` and `manifest-stories.html` mention neither P5c nor a UI disclaimer.
**`WALKTHROUGH.md` was opened and left alone**: its *What works today* describes user-visible
behaviour, and nothing user-visible moved — the console's origin still answers the placeholder.

#### The machine

Snapshotted before and after. The Caddyfile is byte-for-byte its committed self, **proved by
re-reading what the edge serves**; both throwaway servers stopped **by port**; both scratch
`.mjs` files deleted; both probe routes deleted and read back; `pnpm-lock.yaml` restored; the
control plane rebuilt and restarted, because it serves from `dist/` and a source change does not
reach it. **`pnpm test:docker` regenerated the seven dead app networks and one volume**, exactly
as ORIENTATION §2 predicts — `bash scripts/dead-app-resources.sh` and
`bash scripts/litellm-orphans.sh` were run bare at the close and their output handed to Rich.

**Postscript, same day:** Rich ran both with `--apply`, and they were **re-measured clear
afterwards rather than assumed** — `dead-app-resources.sh` reads `none dead` (0 networks, 0
volumes, token-app's one network and two volumes correctly KEPT) and `litellm-orphans.sh` reads
**0 orphaned**, with the one held user surviving. `make verify`'s per-app meter went back to
`containers=3 networks=1 volumes=2`. **So this sitting measured the full cycle in one sitting**:
clear at its baseline, seven networks and one volume regenerated by its own `pnpm test:docker`,
and clear again at its close. *The figures above are what this sitting LEFT and deliberately do
not move; this postscript is what happened next.* **23 `local/*` app image layers remain, which
neither script covers.**

### Sitting 2 — Tasks 2 and 3, the one sitting with the network on — 2026-09-18 — 10 findings

**`packages/console` and `packages/mock` exist, all four gates read them, and the console's
import boundary refuses two different things before a single screen exists.** Both tasks
committed; every control watched in both directions. **Nothing after this sitting may install
a package** — if a later task believes it needs one, that is a finding to record and raise.

**The versions, because a finding without a version is not reproducible** (§6 rule 4, and
Decision 2: current at install, never a remembered number). `@manifest/console` —
**react 19.3.0**, **react-dom 19.3.0**, **@types/react 19.3.0**, **@types/react-dom 19.3.0**,
**@vitejs/plugin-react 6.1.1**, **vite 8.3.0**. `@manifest/mock` — **ws 8.21.3**,
**@types/ws 8.18.1**, **ajv 8.20.0**, **ajv-formats 3.0.1**. All exact. `ws` resolved to the
control plane's own pin without being asked. **`pnpm audit --prod`: no known vulnerabilities**
— the seven the whole workspace reports (1 critical, 1 high, 5 moderate) are the pre-existing
`vitest`/`vite` dev-toolchain advisories ORIENTATION §4 records, and this sitting added none.
`pnpm approve-builds` was not needed: no new dependency has an install script.

#### The findings

**F1 — Task 2's Step 2 cannot run, because it installs into packages Step 3 creates.**
`pnpm --filter @manifest/console add -E react react-dom` answers **`No projects matched the
filters in "/Users/rich/Developer/manifest"`** and installs nothing. Measured by running the
step exactly as written before doing anything else. The order has to be: minimal manifests
first, then `pnpm add -E`, which is also what makes Step 3's `"<as installed>"` placeholders
reachable at all — `pnpm add` is what writes the version, so nothing in the plan ever needed
to name one.

**F2 — `pnpm add -E` does not re-pin a dependency that is already present with a range, and
the caret it leaves is silent.** `pnpm --filter @manifest/mock add -ED 'ajv@^8' 'ajv-formats@^3'`
wrote **`"ajv": "^8.20.0"`**: an explicit range on the command line beats `-E`. Re-running
`add -ED ajv ajv-formats` with no range **left the caret exactly where it was**, because the
installed version already satisfied it and pnpm had nothing to do. It took `pnpm remove`
followed by `add -ED` to reach `"ajv": "8.20.0"`. **C6 says every pin is exact**, so this is
the sequence that gets there — and the failure mode is a `^` nobody looks at again.

**F3 — the plan's *Tech Stack* line says Vite 7; the registry offered Vite 8.3.0, and
Decision 2 is why that is correct.** Decision 2 says in terms that no version is written into
this plan, because a pin with no evidence behind it is how P2 came to specify Node 22 on a
machine that has only 24 — and then the header names a major version anyway. **The decision
wins and the header is the remembered number it warns about.** React 19 was accurate. Nothing
was tried on Vite 7 and found wanting; the console builds, and `@vitejs/plugin-react` 6.1.1 is
the matching plugin.

**F4 — `main.tsx`'s `import './styles.css'` breaks `vite build`, and the gate that would
catch it never reads it.** Task 2's Step 6 writes that import with a comment saying Task 4
writes the file, and Step 10 then builds the console. Measured *after* creating a minimal
stylesheet, by holding it aside again: **`tsc --noEmit` passes** — `vite/client`'s types
declare `*.css` as a module whether or not the file exists — **and `vite build` dies.** This
is sitting 1's F3 one level down: `tsc` is green because it never reads the thing, and the
build is the only reader. A minimal `styles.css` is committed here; Task 4 fills it in.

**F5 — Task 3's `fetch` pattern cannot see the construct `auth.ts` itself uses.** The plan's
regex is `/\bfetch\s*\(|['"]\/auth\//g` — single and double quotes only — and `signIn` names
the path in a **template literal**: `` `/auth/login?returnTo=${…}` ``. So `authSaw` counted 2
(the `fetch(` and `'/auth/logout'`) where 3 was intended, and, the half that matters, **a
screen navigating with ``location.href = `/auth/…` `` would evade the rule entirely** — there
is no `fetch(` in that line to catch it. The backtick is in the character class now.

**F6 — Task 3 cannot go green as written, and Step 5's `auth.ts` does not fix it.** Step 4
predicts one red test (the `fetch` positive control, because `auth.ts` does not exist).
**Two go red.** The import test's *`imports were read from fewer than two files: expected 1 to
be greater than 1`* fails too, because `main.tsx` is the only console file with an import —
under React 19's automatic JSX runtime `app.tsx` needs none. Step 5's `auth.ts` has no imports
**and no caller**, so it leaves that assertion red. The repair is this plan's own Global
Constraint — *every task names its caller*, a module with no call site is not built
(ORIENTATION §9, four times) — so `app.tsx` calls `signIn` and `signOut` from the first
commit. **The control was pointing at a real defect in the plan, not at itself.**

**F7 — the boundary's *"the scanner read no imports at all"* control cannot name
`@manifest/contract` in this sitting, and the weaker claim is written down rather than
hidden.** The plan and the journey's copy both assert `allowed` contains `@manifest/contract`;
no console file imports it until Task 4 writes `api.ts`, so the assertion would fail for a
reason that has nothing to do with the boundary. It asserts `react` instead, **with a comment
in the test telling Task 4 to tighten it back** — `react` only proves the scanner read
something, where the contract is the import D22 is actually about.

**F8 — the negative control's exit code was contaminated by an unrelated flake, and the grep
is what settled it.** With the two globs removed, Task 2's control predicts `pnpm test`
**green — which is the defect**. It exited **1**: `src/api/delegation.test.ts > removing a
member > lets an owner go once somebody else owns the project` **timed out at 5000 ms** in a
run that took **192 s** against the usual ~107 s, with the machine loaded by this sitting's
own builds. The control's own claim held and was read from the right place —
**`grep -c 'console/src/boundary'` of the output was `0`, the file never collected** — and the
same test passed on the next run and on all four closing runs, so it is load, not a state
leak. ***Assert the shape of the answer: a control whose signal is a whole suite's exit code
borrows every flake in that suite.*** The restore direction was watched too: globs back, the
same broken assertion collected and red (*`expected 1 to be 2`*), then fixed and green.

**F9 — `${PIPESTATUS[0]}` is empty in this shell.** The Bash tool's shell is **zsh**, which
spells it `$pipestatus[1]` and indexes from 1, so `cmd | tail; echo "exit=${PIPESTATUS[0]}"`
prints `exit=` — which reads as a command that produced no status rather than as the wrong
variable. Same family as §4's *zsh ties `path` to `$PATH`* and *zsh does not word-split an
unquoted variable*. Take the status from the command itself, or do not pipe.

**F10 — a gate that exits 0 on a new package is ambiguous, and BOTH of the two that "see a
package for free" were.** Sitting 1's F10 says this of `pnpm lint`; it is equally true of
`pnpm format:check`, and of `tsc` on a tsconfig nothing in this repository has used before.
Three baits settled all three: an `any` in `packages/mock` → `@typescript-eslint/no-explicit-any`;
a misformatted `.tsx`, `.css` and `.html` together → **Prettier named all three**, which is
the check that matters because those file types are touched by no test; and a deliberate
`TS2322` appended to `packages/console/src/boundary.test.ts` → `tsc` named it. That last one
was worth the minute: the console's tsconfig overrides the base with `moduleResolution:
"Bundler"` and `types: ["vite/client"]` — **it does not name the `node` types package** — while
that test file imports three `node:` builtins, and the concern was that `tsc` was passing
because it was not reading the file. It reads it.

#### The post-sweep check — five wrong facts, all in this sitting's own hand-off

*§6 says to re-read your own §7e as a cold agent and CHECK its claims by opening what they point
at and counting. It has now found a defect in every P5b sitting from the third onwards and in
both P5c sittings.* **Five here, and every one was found by running a command rather than by
re-reading the sentence:**

1. **"the console has 8 files" — it has 9** (`git ls-files packages/console`). Written from what
   the Task 2 commit added, before Task 3 added `auth.ts`.
2. **"`styles.css` is an eight-line placeholder" — it is 18** (`wc -l`). Recalled, not counted.
3. **"`drizzle/0018_…` is the newest" — the path is
   `packages/control-plane/drizzle/`**, and `ls drizzle/*.sql` answers *no matches found*. This
   one was **inherited verbatim from sitting 1's §7e**, which is §6's own warning about a wrong
   pointer being multiplied by the sitting that trusts it.
4. **"`pnpm test` ran six times in this sitting" — it ran FOURTEEN**, counted from the captured
   output files. The number had been estimated from memory of the session, which is exactly what
   §6 says not to do.
5. **"23 `local/*` app image layers" — the metric is wrong and reads as ZERO.** The images are
   tagged **`127.0.0.1:7107/local/*`**, so `docker images | grep '^local/'` answers **0**. The
   count of 23 is right; the name is not, and this check briefly concluded there were none. Also
   inherited — ORIENTATION §2 spells it `local/*` too, and both now say which pattern to grep.

**Two claims were checked and HELD**, which is worth recording because a check that only ever
finds errors is not being run honestly: *Read this first* does have exactly **twenty** numbered
items, and `manifest-schematic.html` does say *"no user interface has been built yet"* in
**two** places with `manifest-phases.html` saying it in **one** — a first `grep -c` answered
`1` and `0`, because it counts LINES and those files are long-line HTML. *Counting occurrences
and counting lines are different questions, and `grep -c` answers the one you did not ask.*

#### The negative controls

| Control | Watched |
|---|---|
| **Task 2 — `pnpm test` is blind to a new package** | a failing test in the tree: **exit 0, 1345 passed in 101 files, identical to baseline**, `grep -c` of the output **0**. Reproduced this sitting's own numbers, not sitting 1's |
| **Task 2 — the globs are what fix it** | globs added → **RED**, *`expected 'this package is in vitest.workspace.ts' to be 'not yet'`*, 102 files |
| **Task 2 — after the commit, both directions** | globs removed → the file **not collected** (grep `0`; the suite's own exit 1 was F8's unrelated flake); globs restored → same broken assertion **red**, *`expected 1 to be 2`*; assertion fixed → **green** |
| **Task 2 — `pnpm lint` really reads the new packages** | an `any` bait → **exit 1**, `@typescript-eslint/no-explicit-any` |
| **Task 2 — `pnpm format:check` really reads them** | `.ts` bait → exit 1; then `.tsx`, `.css` and `.html` baits → **all three named** |
| **Task 2 — `styles.css` is load-bearing** | held aside → `tsc --noEmit` **passes**, `vite build` **fails** (F4) |
| **Task 3 — the lint half refuses** | `import { z } from 'zod'` in `probe.ts` → *`'zod' import is restricted from being used by a pattern. The console may import only @manifest/contract, react, react-dom, node: builtins and its own ./ files (D22, §22)`* |
| **Task 3 (a) — a forbidden import, read twice** | `zod` in `app.tsx` → `pnpm lint` names the message **and** boundary test 1 says *`expected [ 'app.tsx: zod' ] to deeply equal []`* |
| **Task 3 (b) — the half a lint rule cannot see** | `fetch('/v1/projects')` in `app.tsx` → **`pnpm lint` exit 0, still green**, boundary test 2 *`expected [ 'app.tsx: 1' ] to deeply equal []`*. This is the whole reason the test exists |
| **Task 3 (c) — the positive control** | both subjects removed from `auth.ts` → *`auth.ts names neither fetch nor /auth/ — did the scanner read it?: expected 0 to be greater than 1`*. Without it, deleting the rule's subject leaves the rule green |
| **Task 3 (d) — the stripper** | `executableSource` returns `''` → **all three tests red**, one more than the plan predicted: *`the scanner read no imports at all: expected [] to include 'react'`*, the auth positive control, and the stripper's own *`expected [] to deeply equal [ '@manifest/contract' ]`* |
| **`tsc` reads the console's test file** | a deliberate `TS2322` → `src/boundary.test.ts(176,7): error TS2322` |

Control (b) is the one to keep: `pnpm lint` is green through it, and a reviewer reading only
the lint gate would have signed off a console that reaches the API outside the contract.

#### Gate numbers at the end of this sitting

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 1345 in 101 files | **1348 in 102 files** — up 3 in 1 file, all of them `packages/console/src/boundary.test.ts`'s three. Run twice at close, both 1348 |
| `pnpm test:docker` | 178 in 29 files | **not run, and NOT OWED** — this sitting touched no `routing/`, `infra/` or `*.docker.test.ts`, and the plan says only sittings 1 and 3 owe it. **178/29 is inherited from sitting 1, not re-measured here** |
| `make doctor` | 18/0 | **18/0** |
| `make verify` | 51/0 | **51/0**, per-app meter **`containers=3 networks=1 volumes=2`** — unchanged, because no Docker tier ran |

`pnpm lint` and `pnpm format:check` clean. **`pnpm typecheck` is `Scope: 5 of 6` where it was
`3 of 4`, and FIVE packages ran `tsc` where three did** — counted from its output, which is
the assertion Task 2 exists to make.

#### Documents checked and deliberately NOT changed

*§6 asks that this be said rather than assumed.* **The four shared HTML pages were opened and
are still accurate.** `manifest-schematic.html` says *"no user interface has been built yet"*
in two places and `manifest-phases.html` in one, and **all three are still true**: this sitting
wrote console code but nothing serves it — `https://console.manifest.internal` still answers
the placeholder, and **Task 4 is what makes those sentences false**, as sitting 1's record
already warns in Task 4's own correction block. `manifest-decisions.html` and
`manifest-stories.html` mention neither P5c nor a UI disclaimer. **`WALKTHROUGH.md` was opened
and left alone** for the same reason: its *What works today* describes user-visible behaviour,
and nothing user-visible moved.

#### The machine

Snapshotted before and after; **the only differences are the timestamp, the host's own mDNS
name, container uptimes and `git HEAD`** — no container, image, network or volume changed,
because this sitting ran no Docker tier and started nothing that outlived a command. Ports
**7102, 7104 and 7105 are free**, checked by `lsof` at close; the mock was started once for
Step 10's smoke test (it answered the deliberate `501` envelope) and stopped **by port**.
**Nothing is owed to Rich**: `scripts/dead-app-resources.sh` reads **`none dead`** — 0
networks, 0 volumes, token-app's one network and two volumes correctly KEPT — and
`scripts/litellm-orphans.sh` reads **0 orphaned**, the one held user surviving. Both were run
bare. *This is the first sitting in a long while to owe nothing, and the reason is worth
keeping: the dead set is regenerated by `pnpm test:docker`, and this sitting did not run one.*
**23 app images still stand, which neither script covers** — and **name the metric**: they are tagged `127.0.0.1:7107/local/*`, so a `grep '^local/'` answers 0 and reads as *none*. **Nothing listens
on 7100** — *checked by `lsof` at close, not at the baseline, where it was never looked at
because nothing in Tasks 2 or 3 needs it* — and nothing here started a control plane.

### Sitting 3 — Task 4, the console served and a CWL sign-in — 2026-09-18 — 9 findings

**§22 step 1 is CLICKED.** `https://console.manifest.internal` serves the reference console;
Rich typed `instructor` / `instructor` at the Manifest IdP and the header came back
**Test Instructor `ins000001`**, with the *You* panel showing the email and the `member` role
that `GET /v1/me` returned and nothing inferred. The Caddyfile's placeholder is gone for good.
Committed as `bfc7aab`.

**Every assumption Task 1 measured held.** The edge serves a host process on 7104 on the
console's origin, `/v1/*` still reaches the control plane, deep paths arrive unchanged and
Vite's own SPA fallback covers them, and `allowedHosts` was needed exactly as M1 said.

#### The findings

**F1 — the plan's own `api.ts` snippet does not pass `pnpm lint`.** Step 2 writes
`const key = (k: string) => ({ header: { 'Idempotency-Key': k } })` beside a `createApi`
whose only operation is `getMe`, so nothing calls it. Measured by writing the file exactly
as the plan has it: **`29:9 error 'key' is assigned a value but never used
@typescript-eslint/no-unused-vars`**. The control-plane override that forgives a `_` prefix
is scoped to `packages/control-plane/src/**`, so it does not reach the console. It is
omitted here, which is also this plan's own Global Constraint — *a helper with no call site
is not built* — and **Task 5 adds it with the first mutation**, which is where D23.6's key
acquires a caller anyway.

**F2 — the `Max-Age=600` consequence is stated too softly in three places, and the real one
is a refusal.** Task 4's correction block ¶3, sitting 1's M6 and ORIENTATION §7e all say a
sign-in left at the IdP for more than ten minutes *"loses its `returnTo` and lands on `/`"*.
Read from `api/routes/auth.ts`: the callback does `readLoginCookie(...)` and, if the cookie
is **absent**, throws `SamlError('SAML_LOGIN_NOT_BOUND')` **before node-saml sees the
assertion** — the same cookie carries the binding nonce and the return path, so an expired
one fails the whole sign-in **`401`**, it does not degrade to `/`. It matters where it was
raised: **Task 14's shared run, where a human is typing the password**. The symptom a person
will see is a refusal page, not a wrong landing page, and the remedy is to start the sign-in
again.

**F3 — THE PLAN'S CONTROL TABLE IS WRONG ABOUT ITS OWN COVERAGE, AND IT IS WRONG IN THE
DIRECTION THAT COSTS A SITTING.** Row 1 says pointing the console `reverse_proxy` elsewhere
turns the browser `502` *"**And nothing else** — no test sees the Caddyfile's console line,
which is the honest statement of this task's coverage and the reason the clicked half
exists."* **Two of the four platform gates see it**, and both went red the first time they
were run after the change:

- **`make doctor` — `18 checks, 1 failed`**: *ports 7100-7199 free, or held only by
  Manifest* → **`CLAIMED BY SOMETHING ELSE: 7104`**. It reads PUBLISHED CONTAINER ports, and
  §21 puts the console on the host.
- **`make verify` — `51 checks, 1 failed`**: *the host reaches https://console.manifest.internal
  and is not refused* → the check asserted the placeholder's own words,
  `case "$out" in "manifest console: not built yet"*"[200]")`.

**The first is the identical defect to one this project already fixed, seven plans ago.**
`doctor.sh` carries a comment dated 2026-09-07 explaining that `make doctor` failed with
*"CLAIMED BY SOMETHING ELSE: 7100"* during the platform's own documented flow, *"once there
was a control plane worth running"*, and that the remedy is to **identify it by ASKING IT,
not by matching a process name**. The same remedy is applied to 7104: `console_is_ours()`
asks `127.0.0.1:7104` and requires the console's own document — `id="root"` **and**
`<title>Manifest</title>`, both of which come from `packages/console/index.html` and are
therefore the same under `vite dev` and `vite preview`.

**The second had to keep its question while losing its string.** The check exists to tell
three answers apart — the console site answering, the WILDCARD answering
(`manifest OK host=…`, which returns 200 for any name and any path), and `@outside` refusing
the host — and the placeholder text was merely how it did that. It must also **pass whether
or not the console is running**, because `make verify` is a platform check and `vite dev` is
a developer's host process that `make up` does not start. It now accepts `[502]` (the site
matched and forwarded, nothing on 7104) and a `[200]` carrying the console's document, and
refuses the other two.

**`PORT_CONSOLE=7104` is now in `infra/lib/common.sh`** beside `PORT_CONTROL_PLANE`.
**The mock on 7102 will need the same and deliberately does not have it**: nothing runs
`manifest-mock` until Task 12, and a check for a process nothing starts is the no-caller
shape. Task 12 owes it, keyed on whatever the mock then answers.

**F4 — `signOut` did not check its answer, which is this codebase's most productive defect
shape.** Sitting 2's `auth.ts` is `await fetch('/auth/logout', { method: 'POST' }); window.location.href = '/'`.
A refused sign-out therefore reloads the page, `getMe` succeeds, and **the person is still
signed in with nothing saying so** — ORIENTATION §4's swallowed catch, in the one file the
console is allowed to call `fetch` from. Fixed, and **`response.ok` would not have been
enough** (F5). `packages/console/src/auth.test.ts` is six tests in Node with no DOM —
Decision 7's *"the console's CALLS are proved in Node"* half — and both directions were
watched.

**F5 — reached at `127.0.0.1:7104` the console answers its own API calls, 200, with
`index.html`.** Measured: `GET /v1/me` on 7104 is **`200 text/html`** (Vite's SPA fallback)
and `POST /auth/logout` is **404** (the fallback is GET-only). So on that origin there is no
edge, no control plane and no refusal — **`403 CSRF_ORIGIN_REFUSED` is not what you get**,
which is what the first draft of RUNBOOK's new section claimed and what the console's own
`vite.config.ts` comment implies. What a person actually sees is
**`Something went wrong. SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`**
— visible, because `<Refusal>` renders a non-`ManifestApiError` too, which is that branch
earning its place against a real scenario rather than a contrived one. RUNBOOK now says what
was measured. *Two consequences for later tasks:* `response.ok` is the wrong check anywhere
in this console, and `<Refusal>` renders `String(error)`, so an error whose message carries a
response body would put that body on the page — ORIENTATION §4 records exactly that trap for
`JSON.parse` in `ai/client.ts`.

**F6 — the extension's network reader prints a synthetic `503` for a 204 whose page navigates
away, and 503 reads exactly like a platform fault.** The first *Sign out* click reported
**`POST /auth/logout → 503`**. The platform was fine: `curl` answered `204` with and without
an `Origin`, and the sign-out had worked (`/v1/me` was `401` afterwards). Four measurements
isolate it — **the status the CODE saw was correct in every one**:

| From the page | Code saw | The reader printed |
|---|---|---|
| `POST /auth/logout` (204), **no navigation** | 204 | **204** |
| `POST /auth/logout` (204), then `location.href='/'` | 204 | **503** (twice) |
| `GET /v1/me` (401), then `location.href='/'` | 401 | 401 |
| `POST /v1/projects` (401), then `location.href='/'` | 401 | 401 |

So it is neither "POST" nor "navigation" alone: it is a **bodyless 204 whose page leaves at
once**. Same family as sitting 1's F8 (*the extension cannot show request headers*), and the
rule is the same — **when the page navigates, read the status the code saw, never the
reader's**. Task 14 clicks *Sign out* and will meet this.

**F7 — `<Panel>`, `<Field>`, `<Pill>` and `<Ago>` are four modules with no call site, and
three of them now have one.** The plan produces all five shared bits in Task 4 and first
calls `<Panel>`/`<Field>` in Task 5, `<Ago>` in Task 6 and `<Pill>` in Task 8 — so as
written this task ships four uncalled modules, against its own Global Constraint and the
lesson ORIENTATION §9 names four times. The repair is sitting 2's own (F6, `auth.ts` given a
caller in its first commit): the shell renders a **You** panel of what `GET /v1/me` returned,
which is §22 step 1's actual deliverable and gives `<Panel>`, `<Field>` and `<Pill>` callers.
**`<Ago>` is left uncalled and SAID SO** — in the code, here, and in §7e — because the shell
has no instant to render and inventing one would be worse than naming it. **Its first caller
is Task 6.**

**F8 — the plan's `me.error` cast is weaker than the type it already has.** Step 5 writes
`(me.error as { status?: number }).status === 401`. `unwrap` throws a `ManifestApiError`,
which is exported from `@manifest/contract` and which the console already imports, so the
branch is `me.error instanceof ManifestApiError && me.error.status === 401`. The cast reads
`.status` off anything — a `TypeError` from a blocked cross-origin fetch has none, so both
spellings happen to behave the same here, which is exactly why the weaker one would survive
review. Watched: with the origin pointed at the IdP, the sign-in screen is gone and
`<Refusal>` shows **`Something went wrong. TypeError: Failed to fetch`**.

**F9 — the four shared HTML pages now lie, and this sitting is the one that made them.**
`manifest-schematic.html` says *"no user interface has been built yet"* in **two** places and
`manifest-phases.html` in **one**; all three were true at sitting 2's close and are false now.
Swept in this sitting's close-out, as Task 4's correction block ¶4 instructed. *Counted by
occurrence, not by `grep -c`, which counts LINES and would answer 1 and 0 on long-line HTML
— sitting 2's post-sweep check made exactly that mistake.*

#### The negative controls

| Control | Watched |
|---|---|
| **The Caddyfile line is what serves the console** (the plan's row 1) | pointed at a dead `7105`, `make up`, → `/` **502** while `/v1/me` stayed **401**. Restored; host and container hashes agree, inode `48091939` throughout |
| **The console catch-all must stay BELOW `@api`** — *a claim the plan asserts and nobody had measured* | a bare `reverse_proxy host.docker.internal:7104` inserted above the `@api` matcher, inside the same `route` block → **`GET /v1/me` answered `200 text/html`**: the whole API vanished behind the console and a status-only check reads it as healthy. Restored to the byte (`d832a952…`) |
| **The origin the client is built with** (the plan's row 2) | `createApi({ origin: 'https://idp.manifest.internal' })` → the sign-in screen never appears and `<Refusal>` shows `TypeError: Failed to fetch`. Restored, and the sign-in screen came back |
| **`stream_close_delay` on the `/v1` proxy** (the plan's row 3) | **NOT WATCHED, AND IT CANNOT BE AT THIS TASK** — the console holds no socket until Task 6. Recorded as the plan asks, rather than claimed |
| **`signOut` asserts 204** | guard removed → **5 of 6 red**, the 204 positive control still green. Then the *obvious wrong fix*, `!response.ok`, → **exactly 1 red**: *refuses a 200, which an `ok` check would have accepted* — the case F5 measured on 7104 |
| **The boundary's tightened positive control** | contract imports made invisible to the scanner, so `violations` stayed **empty** → *`the scanner read no imports at all: expected [ 'react', './api', './auth', …(8) ] to include '@manifest/contract'`*. This is the console ceasing to be a client of the contract with every other check green — sitting 2's F7, discharged |
| **`console_is_ours` identifies the CONSOLE, not the port** | a foreign server on 7104 carrying `<div id="root">` but `<title>Something Else</title>` → `make doctor` **1 failed**, `CLAIMED BY SOMETHING ELSE: 7104` |
| **The rewritten `verify` check cannot pass for the wrong reason** | the classifier **extracted verbatim from `verify.sh`** (so the harness cannot drift) and driven against five **measured** bodies: console document + `[200]` **PASS**, ` [502]` **PASS**, `manifest OK host=edge.manifest.internal scheme=https remote=10.89.0.1 [200]` **FAIL**, `manifest: the control plane is not reachable from this network [403]` **FAIL**, `hello [200]` **FAIL** |
| **Both gates survive the console being DOWN** | `make doctor` **18/0** and `make verify` **51/0** measured twice: once with `vite dev` on 7104, once with 7104 free. `make verify` must not depend on a developer's host process |

#### Gate numbers at the end of this sitting

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 1348 in 102 files | **1354 in 103 files** — up 6 in 1 file, all of them `packages/console/src/auth.test.ts`. Run twice at close, both 1354 |
| `pnpm test:docker` | 178 in 29 files *(carried from sitting 1)* | see below — **this sitting OWED it** (it changed `infra/`) |
| `make doctor` | 18/0 | **18/0**, re-measured with the console running and with 7104 free |
| `make verify` | 51/0 | **51/0**, both states; per-app meter `containers=3 networks=1 volumes=2` before the Docker tier |

`pnpm lint`, `pnpm typecheck` (`Scope: 5 of 6`) and `pnpm format:check` clean. **`format:check`
caught the new test file** and nothing else did — `.test.ts` is Prettier's like any other file
under `packages/`.

#### The post-sweep check — three wrong numbers, all in this sitting's own hand-off

*§6 says to re-read your own §7e as a cold agent and CHECK its claims by opening what they
point at and counting. It has now found a defect in every P5b sitting from the third onwards
and in all three P5c sittings.* **Three here, and every one was found by running a command:**

1. **"23 `local/*` app images" — wrong, and THE FIRST CORRECTION WAS WRONG TOO.** The 23 was
   **inherited verbatim from sitting 2's §7e**, and *this sitting's own Docker tier built four
   more* — so the sentence was true when written, copied forward, and false by the time it was
   copied: §6's warning about a wrong pointer being multiplied, in the direction that is not a
   typo but DECAY. The first repair said **29**, from `docker images | grep -c '/local/'`. Then
   the machine snapshot showed only **four** new image lines, which did not reconcile — and
   counting three ways settled it: **29 lines** (five repos have several `<none>` entries, so
   lines ≠ images), **28** rows in `snapshot-machine.sh`'s list, and **27 distinct image IDs**.
   **Three metrics, three answers, one machine** — exactly what §2's *Outstanding* note already
   records for `docker system df` (46) against `docker images -q | wc -l` (53). It now says
   **27 by distinct image ID** and names all three. *The lesson is not "count images"; it is
   that a number which does not reconcile with a second measurement is not yet a number.*
2. **"`pnpm test` ran four times" — it ran SIX**, counted from the captured output files
   (`test1`, `test2`, `t4a`, `t4b`, `g1`, `g2`), plus one `pnpm test:docker`. Estimated from
   memory of the session, which is exactly what §6 says not to do — and the identical defect to
   sitting 2's own post-sweep item 4.
3. **"seven files under `packages/console/src/`" — eight.** `git show --name-only` on the task
   commit lists `api.ts`, `app.tsx`, `auth.test.ts`, `auth.ts`, `boundary.test.ts`, `router.ts`,
   `styles.css`, `ui.tsx`. The total of 13 changed files was right; the breakdown was not, which
   is the kind of error that survives a sanity check on the total.

**A FIFTH DEFECT, found when Rich asked a follow-up question the next morning and the check was
re-run against §2 rather than §7e**: ORIENTATION §2's P5c paragraph still read *"14 tasks in nine
agreed sittings, of which **TWO ARE DONE** — how many is stated in this file ONCE, in the box at
the very top"* — **a sentence stating a count while claiming not to**, stale for the whole of this
sitting even though the box above it was swept correctly. **This is the SAME defect, in the SAME
file, that P5b sitting 8's post-sweep check found in the P5b paragraph** (*"six sittings are done"*
against a box saying eight), and the rule written down then — *grep for the PHRASE, never the
number* — is what found it now. The number is gone from that sentence rather than corrected, which
is the only repair that does not decay.

**Four claims were checked and HELD**, which is worth recording because a check that only ever
finds errors is not being run honestly: `git ls-files packages/console` really is **13**;
`packages/control-plane/drizzle/0018_curvy_sister_grimm.sql` really is the newest migration and
the path really is not the repository root; **7104, 7102 and 7105 are free** and 7100 is
listening, by `lsof`; and the app containers really are **`token-app` only, exactly three**.

#### Documents checked and deliberately NOT changed

*§6 asks that this be said rather than assumed.* **`manifest-decisions.html` and
`manifest-stories.html` were opened and left alone**: the first states D22 as a *decision*
("this project builds its own basic web console early, deliberately restricted…"), which this
sitting carries out rather than contradicts, and the second's only console mention is a story
beat about a person who never opens it. **`manifest-schematic.html` and `manifest-phases.html`
WERE changed** — three disclaimers and two status lines — because this sitting is the one that
made them false. *No spec change, and none needed: §21 already places the console on 7104.*

#### The machine

Snapshotted before and after. **What this sitting changed and did not put back is entirely the
Docker tier's doing**, and it is owed to Rich: **seven dead app networks, one dead volume and
one LiteLLM orphan** (`p4b-probe-user`), named in §7e and re-derived by the two scripts run bare
at close. **This is the third measured time `pnpm test:docker` regenerates exactly that set**
(P5b sitting 9 and P5c sitting 1 were the first two), so it is a property of the tier rather
than a backlog. `make verify`'s per-app meter reads **`containers=3 networks=8 volumes=3`**,
which is the expected reading after a tier run and not a fault. **App images went 23 → 29** by the lines metric
(27 by distinct image ID), which neither script covers.

**CLEARED THE SAME DAY.** Rich ran both scripts with `--apply` at this sitting's close and they
were **re-measured by the scripts themselves**: `dead-app-resources.sh` **`none dead`** — 0
networks, 0 volumes, token-app's one network and two volumes correctly KEPT — and
`litellm-orphans.sh` **0 orphaned**, its one held user surviving. `make verify` was **51/0**
afterwards with the per-app meter back to **`containers=3 networks=1 volumes=2`**, and
token-app's three containers were up and healthy, so the applies removed nothing they should
not have. *The set returns on the next Docker-tier run; that is the property, not the status.* **Every server this sitting started was stopped by PORT**: `vite`
on 7104 (three times — once for the browser work, once for the classifier's truth table, once
after the impostor) and the throwaway impostor server, all confirmed gone by `lsof`. **The
control plane on 7100 was left running** and was restarted after the Docker tier, which
re-registers the platform's SP row at a loopback ACS — but §7e tells the next sitting to check
that with `lsof` rather than believe it, because a sitting is one session.

### Sitting 4 — Tasks 5 and 6, my projects and the project screen — 2026-09-18 — 9 findings

*Both commits and every measurement above are 2026-09-18; the close-out sweep and the
closing gates below crossed midnight and are **2026-09-19**. Dated apart because this
project's rule is that a finding without a date is not reproducible, and because the next
sitting reads the machine state, not the narrative.*

**§22 STEPS 2 AND 3 ARE CLICKED.** A person signed in with CWL creates a project by typing a
name, choosing `node-ts-mongo@1` and the `proof-app` starter and answering §24's audience
question — with the name checked while it is typed, and every refusal rendered as the API's
own code, message and hint — and then lands on a project screen whose Activity panel holds a
live socket carrying the three events every project already has. Committed as `f56409b` and
`10c9c30`.

**The stream is LIVE, and that was proved rather than assumed.** `status: 'live'` only says a
`control` frame arrived, so it is not evidence a post-replay frame reaches the screen: a
`token.minted` published from a terminal appeared in the open tab at `0s ago` with no reload
and no poll, and the same event on ANOTHER project did **not** appear — one stream per
project, correctly scoped (the plan's Step 3 item 3, proved with a mint rather than a whole
`make demo-token`, for the same claim at a fraction of the cost).

#### The findings

**F1 — `SlugCheck.reasons` is an array of OBJECTS, and the plan's snippet renders
`[object Object]` where `tsc` cannot see it.** Step 2 writes
`(check.reasons ?? []).join('; ')`. `reasons` is `{ code, message, hint }[]` (§23's
`SlugReason`), and `Array.prototype.join` accepts any array — so this typechecks, lints,
formats and builds, and puts `[object Object]` on the screen the first time anybody types a
taken name. **Measured against the real API before the screen was written**: for `edge`,
`JSON.stringify(reasons.join("; "))` is literally `"[object Object]"`. It is the same family
as §4's *a `200` from a `*.manifest.internal` name can be the edge's wildcard* — an answer
arrived and its SHAPE was never asserted. Every reason is now rendered as its own code,
message and hint, which is also what §23 means by *the console never restates the slug rule*.

**F2 — the ESLint boundary regex allowed `./` and not `../`, so the console's first
subdirectory made every screen an error while the boundary TEST stayed green.**
`^(?!@manifest/contract$|react$|react-dom(/.*)?$|node:|\./)` — `\./` requires a `.` then a
`/`, which `'../api'` is not. Measured by writing `screens/projects.tsx` exactly as the plan
has it: **5 errors, `'../api' import is restricted from being used by a pattern`**, on the
two new files only. `boundary.test.ts` has allowed `./` and `../` since Task 3 and resolves
the target to check it lands under `src/` — **so the two halves of one rule disagreed, and
the test was the half that was right.** Widened to `\.{1,2}/`, and the widening was watched
not to weaken anything: an `import … from '../../../control-plane/src/spec/index.js'` in a
screen leaves **`pnpm lint` exit 0** and turns boundary test 1 red. That is sitting 2's
control (b) again — the lint gate green, the test red — and it is why the containment check
lives in the test.

**F3 — NOTHING ASSERTED THAT THE BOUNDARY SCANNER DESCENDS, and this task is the one that
made it matter.** `sourceFiles` recurses, and its doc comment says why — *"a scanner that
reads one level would silently skip screens/"* — but that was a comment, not a check.
**Measured: with the recursion replaced by `continue`, all three tests in the file stayed
GREEN** while every file under `src/screens/` went unread — no import checked, no `fetch`
checked, for the whole of the console a person actually uses, and for every screen the six
remaining tasks add. It is sitting 2's F7 one level up: *a scanner that read nothing and a
boundary that is held look identical from the outside.* A fourth test now asserts that at
least one scanned file lives in a subdirectory, watched red (*`the scanner read no file in
any subdirectory of src/ — did it stop recursing?: expected [] to not deeply equal []`*) and
green.

**F4 — `addMember` answers a `Member`, not a `MemberList`.** Named by `tsc` the moment the
function was written (`TS2740: … is missing the following properties from type '…[]': length,
pop, push, concat, and 35 more`). Worth recording only because it is **the D22 loop working
as designed**: the console is the first client to call this route, and the generated types
caught the mismatch before a screen rendered `.map` over an object. `removeMember` really
does answer a `MemberList` and `validateSpec` a `SpecValidation`, both checked in the
document rather than assumed.

**F5 — `POST /v1/projects/{projectId}/spec` PUBLISHES NO EVENT, where creation publishes
`spec.validated`.** Found by clicking *Re-validate* with the stream open and watching the
Activity panel not move, then reading `api/routes/project-reads.ts`: the handler inserts an
`app_specs` row and returns, with no `publishEvent` — while `api/routes/projects.ts:261`
publishes `spec.validated` at creation, the same event type about the same fact.
**So a re-validation is invisible to a console that never polls (D23.2).** This screen reads
the result from the response, so the person who pressed the button sees it; a second person
watching the same project sees nothing, and neither does any other client. **Recorded as a
finding about the API, not fixed** — this plan changes no route, and Global Constraints say a
route this plan needs is a finding about the API's completeness (D22). It is cheap to fix
(one `publishEvent` beside the insert) and it belongs to whoever next opens that file.

**F6 — A CADDYFILE COMMENT IS NOT A CONFIG CHANGE, and `make up` says it reloaded anyway.**
Trying to force an edge reload with a socket open, a comment was appended to the Caddyfile
and `make up` printed **`Caddyfile changed — reloading the edge`** — its hash is over the
FILE — while the edge logged **`"config is unchanged"`** and did nothing, because the
Caddyfile adapter strips comments and the adapted JSON was byte-identical. Two different
notions of *changed*, and the script's is the one a person reads. Anything that needs a real
reload has to change the adapted config; a response header did.

**F7 — THE PLAN'S TASK 6 CONTROL ROW 1 DID NOT FIRE, MEASURED TWO WAYS, AND THE RUNNING
CONFIG WAS VERIFIED.** With `stream_close_delay 1h` removed from the console site's `/v1/*`
proxy, an open console stream **stayed `live`** through (a) a full Caddyfile reload via
`make up` — a genuine one, `"servers shutting down with eternal grace period"`, not F6's
no-op — and (b) a `PUT` of a route into `srv0` followed by a `DELETE`, which is the exact
mechanism `routing/caddy.ts` uses on a deploy and the one P5a sitting 2 and P5c sitting 1's
M8 both measured. **Three things were checked rather than assumed**: the running config held
**0** occurrences of `stream_close_delay` and did carry the probe header, so the edit was
live; **`srv0` is the ONLY server and it holds `console.manifest.internal`**, so the route
change hit the same server the stream is proxied by; and the socket was proved still ALIVE
afterwards by publishing a `token.minted` and watching it arrive. The hook only reconnects on
`1013`, so a `1001` would have left `status` stuck on `closed` — it never left `live`.

**This is in tension with two earlier measurements and the difference is NOT isolated.** M8
watched an APP's socket close `1001` two milliseconds after an unrelated route insert, and
P5a sitting 2 watched the console's own stream close in under three seconds. **Nothing here
argues for removing the field** — M8 stands on its own evidence, in both directions — but
Task 4's row 1 **still has not been watched**, now for a second task running, and the honest
statement is that this route does not watch it rather than that it was watched. The
`"eternal grace period"` line is the obvious suspect and was deliberately not chased: raising
it would be a guess, and this project's rule is to name what was measured. **Whoever needs
this control next should drive it as M8 did** — an app's own socket through a runtime route,
which is where the field is genuinely absent — rather than through the console site.

**F8 — THE GATES DESTROY THE CLICKED STATE, and the run order is the whole of the remedy.**
`pnpm test` at Task 6's gate truncated the tables and took all four projects created by
clicking with it, so the open tab's next navigation answered `NOT_FOUND` in three panels.
ORIENTATION §4 says exactly this and the clicking had correctly been done first; what was not
anticipated is that **the CONTROLS come after the commit, and so after the gates** — every
one of them then needs the state rebuilt. Rebuilt here with one scripted `POST /v1/projects`.
*It paid for itself:* the dead project gave the plan's control row 2 for free and honestly —
a `projectId` the person may not read → **`closed 1006 — refused, or the connection
dropped`**, with `<Refusal>` showing `NOT_FOUND` in the other three panels.

**F9 — THE CLICKED HALF NEEDED NO PASSWORD, AND THAT MUST NOT BE PLANNED ON.** R3 says an
agent driving Chrome cannot type one and the run is therefore shared. Chrome still held a
live SimpleSAMLphp session from sitting 3, so *Sign in with CWL* completed with no prompt —
twice, including after `pnpm test` had deleted the user row and the second sign-in recreated
it. **The IdP session survives across sittings in the browser profile**, which is worth
knowing for Task 14's scheduling; but it is a property of one profile at one moment, and a
cleared profile, a different browser or a lapsed IdP session puts Rich back in the loop. Plan
for R3; be pleased when it is not needed.

#### The negative controls

| Control | Watched |
|---|---|
| **The screens are inside the boundary's reach** | `import { z } from 'zod'` in `screens/projects.tsx` → boundary test 1 red, *`expected [ 'screens/projects.tsx: zod' ] to deeply equal []`*. Restored, green |
| **The scanner descends** (F3, new) | recursion → `continue` → **3 of 3 green** with `screens/` unread; with the fourth assertion, red: *`the scanner read no file in any subdirectory of src/ — did it stop recursing?`*. Restored, 4 green |
| **Widening the lint regex did not widen the boundary** (F2) | `'../../../control-plane/src/spec/index.js'` in a screen → **`pnpm lint` exit 0, zero `no-restricted-imports`**, boundary test 1 red. The lint gate is green through it, which is why the test holds containment |
| **A blueprint ref with no major version** (the plan's Task 5 row 3) | `POST /v1/projects` with `blueprint: 'node-ts-mongo'` → **`400 BLUEPRINT_NOT_FOUND — no blueprint 'node-ts-mongo'`**, hint *`Available: fixture-node@1, node-ts-mongo@1`*. The plan predicted `400` and was right. A reserved slug is **`409`**, measured beside it |
| **The idempotency key's reuse** (the plan's Task 5 row 1) | **COULD NOT FAIL AS THE PLAN STATES IT.** `attemptKey.current = api.newKey()` on every submit, then Create double-clicked on a fresh form → **ONE project**, no refusal shown, because the create navigates away on the first answer. `slug` is UNIQUE, so two projects are impossible by construction. What the key actually buys was then measured directly: the same key twice → **`201` twice with the SAME id**; different keys → **`201` then `409 SLUG_TAKEN`**, a refusal naming the person's own project. *The key prevents a spurious refusal, not a duplicate project* — and the plan's row named the wrong consequence |
| **`stream_close_delay` on the console site** (the plan's Task 6 row 1) | **DID NOT FIRE — see F7.** Removed from the running config (verified: 0 occurrences), reload forced two ways including the deploy's own admin-API route change, socket proved alive afterwards. Restored: 1 occurrence back, probe header gone, Caddyfile byte-identical (`d832a952…`, inode `48091939` throughout) |
| **A `projectId` the person may not read** (the plan's Task 6 row 2) | **`closed 1006 — refused, or the connection dropped`**, with `NOT_FOUND` in the Project, Manifest and Members panels. A WebSocket client is shown no HTTP status, which is what the hook's comment says and what the person is shown |
| **`onFrame` keeps nothing** (the plan's Task 6 row 3) | Activity reads *“Nothing has happened to this project yet.”* while the status pill still reads **`live`** — the two are independent, which is why the screen shows both. Restored: the three creation events back |
| **`<Refusal>` on a real envelope, on this screen** | adding `stu000001`, who has never signed in → **`MEMBER_USER_NOT_FOUND — no user with PUID 'stu000001' has ever signed in`** with its hint. The trap the plan names in *The fixtures and helpers*, armed and rendered |

#### Gate numbers at the end of this sitting

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 1354 in 103 files | **1355 in 103 files** — up 1, F3's fourth boundary assertion. No new FILE: Tasks 5 and 6 add no test file, by Decision 7 |
| `pnpm test:docker` | 178 in 29 files | **not run, and not owed.** Neither commit touches `routing/`, `infra/` or a `*.docker.test.ts` — the Caddyfile was changed only as F7's control and restored byte-identical before either commit |
| `make doctor` | 18/0 | see *The machine* |
| `make verify` | 51/0 | see *The machine* |

`pnpm lint`, `pnpm typecheck` (`Scope: 5 of 6`) and `pnpm format:check` clean. **The baseline
for those three was measured on a CLEAN TREE rather than inferred**: the first background run
overlapped the first file written, so the tree was stashed (`git stash push -u`), all three
re-run — **0, 0, 0** — and the stash popped. `pnpm test` ran **twice** at baseline, 1354 both
times. **`vite build` was run after every commit**, because sitting 2's F4 established that
`tsc` is blind to a whole class of thing the build sees: 27 modules, then 244.74 kB.

#### The post-sweep check — one wrong pointer, and nine claims that held

*§6 says to re-read your own §7e as a cold agent and CHECK its claims by opening what they
point at and counting. It has found a defect in every P5b sitting from the third onwards and
in all four P5c sittings.* **One here, and it is the class §6 warns is worst — a wrong POINTER,
which the next sitting inherits and multiplies:**

1. **"Of *Read this first*'s twenty numbered items, 5, 6, 7 and 19 land hardest here" — two of
   the four are wrong.** Opened and read: **item 6** is the three creation events, which is
   Task 6's material and already done, and **item 19** is the two headless demo drivers, which
   is Task 13's. The item that actually bites Task 7 first is **2** — the generated types make
   `?tail=` mandatory on `getBuildLog` and an `Idempotency-Key` mandatory on `startBuild`,
   `deploy` and `createRelease`, so the data layer will not compile without them — and **12**,
   the console site's own `stream_close_delay`, belongs there too after F7. Corrected to
   **2, 5, 7 and 12**, with the wrong draft named in §7e itself so the next reader can see the
   check ran. *Found by opening the list; invisible from the sentence.*

**Nine claims were checked and HELD**, which is worth recording because a check that only ever
finds errors is not being run honestly: the plan's sittings table really does carry four
`DONE 2026-09-18` rows reading **19, 10, 9 and 9**; `api.ts` really has **15** `async`
operations against the document's **34**; **every export of `ui.tsx` now has a caller outside
it** — `Ago` has 3, the fewest — and `useProjectStream` has 1; the Caddyfile really is
`d832a952…` at inode `48091939` and clean in `git`; `pnpm test` really ran **six** times,
counted from the captured output files; `0018_curvy_sister_grimm.sql` really is the newest
migration; there really are **3** `mf-` containers; `git ls-files packages/console` really
answers **17**; and the two commits really are **7** and **5** files.

**A trap worth naming, because it nearly produced a tenth "finding":** the first run of the
caller check used `grep -r --include=*.tsx`, and zsh answered `no matches found: --include=*.tsx`
for every symbol, printing **`0 caller(s)`** six times. *A search that ate its own arguments and
a real zero are the same observation* — the identical shape to this sitting's own F3, and to
ORIENTATION §4's note that `grep` here is a shell function backed by `ugrep`. Re-run without the
glob it reads 11, 26, 10, 18, 3, 9.

**A second one, caught in this very check:** the edit that was to add this section asserted its
anchor appeared once. **It appears FOUR times** — every sitting's record has a *Documents
checked* heading — so the assertion fired, the section was not written, and the `git commit`
on the next line ran anyway and shipped a message describing a section that did not exist.
*An `&&` chain does not protect the command on the NEXT line*, and a commit message is not
evidence of a commit's contents. Fixed by anchoring on the line number and amending.


#### The cold-agent audit — asked after the sweep, and it found seven more

*Rich asked whether "read ORIENTATION.md and proceed with the next sitting" would be enough for
a cold agent to run sitting 5. Answering it properly meant reading §7e as that agent, then
opening Tasks 7 and 8 and testing their snippets — which is a stronger check than §6's, because
§6 verifies what the hand-off SAYS and this verifies what the next sitting will HIT.* **The same
question produced P5b sitting 7's F14 and F15. It found seven here, two of them in the plan
itself:**

1. **Task 7's `liveBuild` snippet does not typecheck, and it is not a typo.** Pasted verbatim on
   TypeScript **5.9.3**: `error TS2339: Property 'seq' does not exist on type '{ kind: "event"; … }
   | …21 more…'`, twice. TS 5.5+ infers a type predicate from `.filter((f) => f.kind === 'log')`
   — **but not from the COMPOUND condition the snippet uses**, because the `&& f.buildId ===
   buildId` clause defeats the inference. Fix verified clean: `.filter((f): f is LogFrame => …)`,
   with `LogFrame` imported from the contract. **A `[SITTING 4]` block at the top of Task 7 now
   carries it**, with the two request-body shapes read out of the document.
2. **Task 8's Step 1 re-adds two functions that already exist.** `listEnvironments` and
   `getEnvironment` are produced by **Task 6's own *Interfaces* line** and were written in this
   sitting; Task 8 lists them again. Pasting its Step 1 whole is `TS1117` plus ESLint's
   `no-dupe-keys` — loud, not silent, but a detour. Task 8 adds exactly `deploy` and
   `listIncidents`, and a `[SITTING 4]` block says so.
3. **§7's own header still said "EXECUTE P5c's SITTING 4, Tasks 5 and 6" — after this sitting
   had committed both.** §6's sweep replaced §7e and left the section header above it, and
   **that is the exact failure §6 names**: *a stale one sends the next agent at a task that is
   already committed.* The sweep table says "§7e and §2's numbers box" and does not mention §7's
   own preamble, which is how it survived.
4. **README's status paragraph said P5c had "nine agreed sittings, and none of them has run" and
   "the next job is executing its sitting 1" — four sittings stale**, while README's own *Where
   to start* table two paragraphs later was swept correctly every time. It even carried a
   disclaimer pointing elsewhere for the count, *and then stated the count anyway* — the identical
   shape sitting 3's post-sweep check found in ORIENTATION §2.
5. **The roadmap's P5b row ended "the next job is its sitting 2" — three sittings stale.** A
   FINISHED plan's row carrying a forward pointer decays by construction, because nothing in the
   close-out ever revisits a finished row.
6. **§7e's own gloss of *Read this first* item 2 was wrong, and this sitting wrote it.** It said
   the generated types make `?tail=` mandatory on `getBuildLog`. **`tail` is `required: False`**,
   and so is `?expand=`; only `Idempotency-Key` is required. The plan's item 2 opens *"Thirteen
   operations carry a header or query parameter the generated types make mandatory"* and then
   lists optional ones, and restating that sentence inherited its looseness — §9's *a document
   that restates a number drifts from it*, one hop further out.
7. **§7e's run list put the gates before the clicking.** Sitting 4's own F8 is that `pnpm test`
   truncates and takes the clicked project with it, and the list still said *write it, gates,
   commit*, with the controls after. For a sitting that BUILDS and DEPLOYS that is worse than it
   was here: the containers survive the truncation and become dead app resources. Reordered to
   *write → click → controls → gates → commit*, per task.

**Both decaying pointers (4 and 5) were repaired by REMOVING the number rather than correcting
it**, and each now says in place what it used to claim and for how long — the repair sitting 3
settled on, because a corrected number decays again on the next sitting and a pointer to where
the number lives does not. **§7e also gained a section it did not have**: what a REAL build and
deploy need, which nothing in P5c has done before — the `{"driver":"docker"}` boot line (on
`fake` the whole sitting passes while building nothing), that a first `node-ts-mongo@1` build
takes minutes against a 900 s builder timeout, that the project must carry the `proof-app`
starter or Task 8's step 3.2 has no CWL sign-in to demonstrate, that a deploy mints a LiteLLM
user and moves `make verify`'s per-app meter, and that `make demo` is the way to tell a broken
machine from a broken screen before debugging the screen.


#### Documents checked and deliberately NOT changed

*§6 asks that this be said rather than assumed.* **`manifest-decisions.html` and
`manifest-stories.html` were opened and left alone** — the first states D22 as a *decision*
(*"a basic web console early, deliberately restricted so that it can only use what the public
interface offers"*), which this sitting carries out rather than contradicts, and the second's
only console mention is a story beat. **`manifest-schematic.html` and `manifest-phases.html`
WERE changed** — three sentences — because what a person can DO at the console changed, and
both said only that it *signs people in*. **`CLAUDE.md` was left alone deliberately**: no plan
started or finished, no item in its *Outstanding, and Rich's* line moved, and it states no
sitting and no gate numbers by design. **`docs/external-track.md`** — no UBC item moved.
*No spec change, and none needed.*

#### The machine

Snapshotted before and after, and **the diff is uptimes and timestamps and nothing else** — no
container, network, volume or image added or removed. This sitting ran **no Docker tier, no
build and no deploy**, so it regenerated none of the dead-resource set the tier is now measured
three times putting back: `make verify`'s per-app meter reads **`containers=3 networks=1
volumes=2`** and both scripts were run bare at close, reading **`none dead`** (0 networks, 0
volumes, token-app's one network and two volumes correctly KEPT) and **0 orphaned** (its one
held LiteLLM user surviving). App images stand at **27 by distinct image ID** — *re-derived at
close and reconciled across all three metrics: `docker images | grep -c '/local/'` **29** (it
counts LINES; five repos have several `<none>` entries), `snapshot-machine.sh`'s list **28**,
`docker images --format '{{.ID}}' | sort -u` **27**, and `grep '^local/'` **0**, because they
are tagged `127.0.0.1:7107/local/*`.* **NOTHING IS OWED TO RICH.**

**Five bare repositories this sitting created were removed at its close** — `p5c-console`,
`p5c-doubleclick`, `p5c-idem-same`, `p5c-idem-diff` and `p5c-s4-controls` — using
`clear_orphan_repository`, whose rule is the CONTRACT's rather than the filesystem's: it
removes `.manifest/repos/<slug>.git` only when `GET /v1/slugs/{slug}` answers `available`, so
no project could still hold the name. The three that pre-date this sitting — `journey-app`,
`proof-app`, `token-app` — were untouched. *Removing what your own sitting created is yours.*
**Every server this sitting started was stopped BY PORT**: `vite` on 7104, confirmed gone by
`lsof`, with 7102 and 7105 confirmed free too. **The control plane on 7100 was left running**
and was NOT restarted, because no Docker tier ran and so the platform's SP row was never
re-registered at a loopback ACS — but §7e tells the next sitting to check that with `lsof`
rather than believe it, because a sitting is one session.

### Sitting 5 — Tasks 7 and 8, the two streaming screens — 2026-09-18/19 — 13 findings

*The work ran on 2026-09-18 and the close-out crossed midnight into 2026-09-19, as sitting 4's
did. Dated apart because a finding without a date is not reproducible.*

**§22 STEPS 4 AND 5 ARE CLICKED, AND STEP 6 AS FAR AS THE SIGN-IN, and this is the first sitting
of P5c to drive a real build and a real deploy.** *Step 6 reads in full "Open the running app;
log in with CWL inside it; write a note; ask the LLM" — the note and the question were NOT
exercised, and are what `make demo-ai` covers and what Task 14's acceptance owes. Caught by the
post-sweep check, against the spec rather than against the plan's paraphrase.* A signed-in person presses *Build* and watches BuildKit's output arrive
line by line while it runs; the build ends `succeeded` with no reload, carrying its image
digest and §12's scan; they release it, deploy it to staging watching four states arrive live,
open the app's own URL and **sign in to the running application with CWL**. Committed as
`4b464d1` and `abe9e72`. No migration, no route, no spec change.

**A redeploy interrupted nobody, watched from a browser for the first time.** With the app open
and signed in in a second tab, a redeploy of the same release answered **14 consecutive `200`s
as the same person** from the app's own origin. P4c has always been proved by a script; this is
the same property seen from the client a person actually uses.

#### The findings

**F1 — THE STREAM ALONE IS NOT THE LOG: `LogFrame` IS NEVER REPLAYED, and Task 7 never mentions
the read that makes the screen whole.** The document says it on `LogFrame` itself — *"Never
replayed — GET /v1/builds/{buildId}/logs has them all"* — and `recentFramesFor` is the proof:
the replay `select`s from the `events` table, which holds no log line. So a screen that consumes
only the socket shows a build's log **starting from the moment it connected**, and after a
reload shows nothing at all. **Measured in the browser: 74 log lines on screen after a page
load, against 0 log frames delivered by the replay** (7 event rows). The screen therefore merges
`getBuildLog` with the live frames and de-duplicates by `seq`. The task's *Interfaces* line does
produce `getBuildLog`, but its Step 2 snippet — the one that says what the screen IS — derives
the log from `frames` alone, so pasting it gives a panel that looks right for the one person
watching a build start and is empty for everybody else.

**F2 — TASK 7'S CONTROL ROW 3 CANNOT FAIL, TWO WAYS OVER.** The row predicts that sorting log
lines by arrival instead of `seq` interleaves them *"only when a replay and live frames
overlap"*. **That overlap cannot happen** — F1: the replay carries no log frame. And the weaker
version is not observable either: **with the `.sort()` removed, the rendered log was still
byte-for-byte in the stored log's order**, because the `Map` is filled from the stored read
(`seq` 0…70, in order) and then from live frames, which are published in `seq` order too. The
case the sort exists for is visible in the same measurement: `?tail=20` answers `seq` 51–70, so
a caller passing a tail would insert 51–70 first and 0–50 behind them. **Nothing passes `tail`,
so the sort is defensive and currently unfalsifiable** — kept, and said so here rather than left
looking like a watched control.

**F3 — THE AUTO-SCROLL DISABLED ITSELF UNDER EXACTLY THE CONDITION IT EXISTS FOR.** The obvious
implementation — scroll to the bottom on new content, and stop when the reader scrolls away —
stops following after the first few lines. **Measured mid-build: `scrollTop` 109.5 where the
bottom was 921.5, with 71 lines present.** The cause is that a `scroll` event is dispatched
ASYNCHRONOUSLY: lines committed between `scrollTop = scrollHeight` and the handler make
`scrollHeight` grow, and the handler then reads a large gap and concludes the person scrolled
away — after which nothing ever scrolls it back. **Reproduced directly in the page**: set to the
bottom (921.5), append 40 lines, and what the handler would compute is **662.5**, not 0. Our own
scroll is now recognised by the POSITION we set rather than by the gap, and only while armed, so
a person scrolling back down re-enables the follow. Both halves watched: the gap held at 0 while
spans grew 65 → 74, and `scrollTop` held at 0 while spans grew 44 → 71.

**F4 — TASK 7'S CONTROL ROW 1 IS MUCH WEAKER THAN IT READS, because `seq` RESTARTS PER BUILD.**
The row predicts *"the screen shows another build's lines in this build's log"*, which sounds
like a visible doubling. It is not: `mergeLines` keys by `seq`, and two builds' frames therefore
COLLIDE rather than accumulate. **Measured with the filter removed and two builds run in one
session: the newest build's stored log is 71 lines, the screen showed 74, and the rendered text
matched NEITHER build.** A silent blend, at almost the same length — and on two builds of the
same source, almost the same text. **The count is not the tell; comparing the screen against
`getBuildLog` is**, which is how it was watched here and how the next person should watch it.

**F5 — `{}` ON `startBuild` DOES NOT BUILD THE REPOSITORY'S HEAD.** `api/routes/builds.ts` reads
`commitSha: body.commitSha ?? spec.commitSha`, so an empty body builds **the commit of the last
VALIDATED manifest**. Measured: a commit pushed to the project's repository and then built from
the console produced the OLD commit; only *Re-validate* moved the spec, after which the same
button built the new one. The plan's `[SITTING 4]` block states the other reading in terms
(*"`{}` is valid and means the repository's HEAD"*), and the field's name invites it. The screen
now says what it does, and a person is told to Re-validate first.

**F6 — `<Refusal>` NEVER RENDERED `launchReadiness`, THOUGH ITS OWN DOC COMMENT SAID IT DID —
AND THE PLAN BELIEVED THE COMMENT.** Task 4 wrote *"it renders the two typed extras the envelope
can carry, so `RELEASE_PRODUCTION_GATE_UNAVAILABLE` shows what a first launch still needs"* and
rendered neither; Task 8's Step 2 then says *"which `<Refusal>` already renders"*. **Measured:
the production refusal's envelope carries `launchReadiness` with 6 items and the screen rendered
0.** Nothing caught it for two sittings because no envelope carrying one had ever reached a
screen. All six now render with their state, reason, owner and the plan that builds them —
`not_built` shown as `not_built`, because rendering it as *unmet* would be the console inventing
a judgement the API did not make. **The envelope's other typed extra, `pendingAction`, is
deliberately still not rendered**: nothing can produce one until Task 11, and a renderer with no
call site is not built.

**F7 — `createRelease` PUBLISHES NO EVENT**, the second instance of sitting 4's F5 shape
(`POST …/projects/{id}/spec`). `releases/release.ts`'s `createRelease` has no `publishEvent`;
the file's first is in the deploy path. **So a release is invisible to a console that never
polls (D23.2)**, and the Deploy panel could not learn that there was something new to deploy —
found by releasing a build and watching the release list stay empty. Fixed on the console's side
only, and the distinction is the same as sitting 4's: **the person who pressed the button is in
this tab, so the Builds panel tells the Deploy panel; a SECOND person watching the same project
is told nothing, and neither is any other client.** Recorded as a finding about the API, not
fixed — this plan changes no route.

**F8 — A TYPE PREDICATE OVER A FIELD NARROWS THE FIELD, NOT THE RECORD.** `isDeployState(f.type)`
typed `(type: string): type is DeployState` leaves `f` as the whole 21-member `EventFrame` union,
so `f.machineDetail.environmentId` is **`TS2339: Property 'environmentId' does not exist on type
'{ entityId: string; … } | …17 more…'`** (TypeScript 5.9.3). It is the same family as sitting 4's
audit finding about `liveBuild`'s compound `.filter`, one level out: **narrowing follows the
value you test, and testing a field tells the compiler nothing about the object.** The predicate
takes the frame and `Extract` names what it narrows to.

**F9 — CHANGING `runtime.port` CANNOT MAKE A DEPLOY FAIL, so the documented trick does not apply
to a real app.** ORIENTATION §4 says to point readiness at *"a port nothing is bound to"*, as the
Docker tier does. **Measured: with `runtime.port: 3999` the deploy went `healthy`** — because §8
injects that same port into the container, so the app listens exactly where the probe dials. The
tier's trick works because a FIXTURE's listen port is fixed in its source while the probe's is
not. For an app built from its manifest the lever is the health **PATH**, and only because the
proof app is Express and 404s an unknown path: §4 already records that **both** fixture apps end
in a catch-all `200` and could not show this at all. `health: /never-ready` produced the failure
in one deploy.

**F10 — WHAT IS SERVING AND WHAT THE LAST ATTEMPT DID ARE TWO DIFFERENT FACTS, and the screen got
it wrong in BOTH directions before it was measured.** A deploy that never becomes ready is a
`200` whose `state` is `failed` **and the previous instance keeps serving** (P4b Task 13).
Measured: the screen's own stream ended `instance.failed` → `incident.opened` while
`GET /v1/projects/{id}/environments` answered **`healthy`, on the PREVIOUS release** — two
instance rows, both true. So a pill driven from the newest EVENT says the app is down when it is
up; one driven from the deploy call's answer says the same to the one person who pressed the
button; and one read once at mount is stale for everyone else — **watched reading `starting`
while the platform said `healthy`**, after a reload landed mid-deploy. The pill is now the
ENVIRONMENT's own instance, re-read when a frame says it moved — which is D23.2's rule in its own
words, *"a screen re-reads a resource only when a frame says it changed"* — with the attempt's
outcome beside it. The two cases now read differently and correctly: **sandbox `failed` with
nothing serving, staging `healthy` with *"the last deploy failed; the release before it is still
serving"***.

**F11 — TASK 8'S CONTROL ROW 1, THE ONE THE PLAN CALLS THE MOST IMPORTANT, COULD NOT FIRE ON THE
ENVIRONMENT IT WAS FIRST RUN AGAINST.** With the pill reading the environment (F10), believing
the HTTP call instead makes no difference on an environment that already holds a healthy
instance: both answers are `healthy`, because a failed deploy leaves the healthy one serving. **It
fires only on an environment whose FIRST deploy fails**, where there is no previous instance —
watched on `sandbox`: pill **`healthy`** with the control in, platform **`failed`**, and **one
Incident panel directly beneath it contradicting it**, which is the plan's own wording. Anyone
re-running this control must use an environment that has never deployed.

**F12 — THE CLASSIFIER ALLOWED BOTH CLEANUP APPLIES, which ORIENTATION and the standing split
both say it refuses.** `bash scripts/dead-app-resources.sh --apply` removed two networks and
three volumes, and `bash scripts/litellm-orphans.sh --apply` deleted two orphaned users and their
keys — in the same session, with no refusal. §2's *Outstanding* says an agent *"still cannot run
the delete"* and the script itself prints that it cannot. **The rule §4 already states is the one
that held: try the command rather than trusting the note.** Recorded so the next sitting attempts
its own cleanup rather than handing Rich work it could do; the split stays documented because a
refusal is still the likelier outcome, and the scripts re-derive either way.

**F13 — A RUNTIME ROUTE OUTLIVES THE APP IT POINTS AT, AND ONLY `make verify`'s INFO LINE SAYS
SO.** After the throwaway project's rows were truncated by `pnpm test` and its containers removed,
the edge still held `p5c-build-app.staging.manifest.internal` pointing at a container that no
longer exists. **`make verify`'s *runtime routes currently applied* went 0 → 1 and stayed there**;
no check fails, because it is an INFO line, and `dead-app-resources.sh` does not look at Caddy at
all. Removed with `curl -X DELETE http://127.0.0.1:7119/id/mf-p5c-build-app-staging-manifest-internal`
(`200`), after which it read 0 again. **BusyBox `wget` inside the container cannot do it** — it
has no `--method` — and the admin API is published on **7119**, which `config.ts` names as
`MANIFEST_CADDY_ADMIN_URL`. Worth knowing for any sitting that deploys an app and then truncates.

#### The negative controls

| Control | Watched |
|---|---|
| **Task 7 row 2 — the `202`'s status treated as final** | `ended = undefined` → the Builds panel read **`running` for 30 s straight** (12 samples, 2.5 s apart) while the platform had finished. **Its sharpest form is that the ACTIVITY panel on the same screen read `build.succeeded` at the same moment** — two panels, one socket, contradicting each other. Restored → `succeeded` |
| **Task 7 row 1 — the `buildId` filter** | removed, two builds run in ONE session → newest build's stored log **71** lines, screen **74**, matching **neither** build (F4). Restored → 71 on screen, matching the stored log exactly |
| **Task 7 row 3 — sorting by arrival** | **COULD NOT FAIL (F2).** `.sort()` removed → the screen was still in perfect order, because the replay carries no log frame and nothing passes `tail` |
| **Task 8 row 1 — believe the HTTP status** | **could not fire on `staging`** (F11), then watched on `sandbox`, whose first deploy failed: pill **`healthy`**, platform **`failed`**, **1 Incident beneath it**. Restored → `failed`, matching |
| **Task 8 row 2 — drop `instance.failed`** | states jumped `instance.starting` → `incident.opened` with **no failure state at all**, the *"last deploy failed"* note vanished, and the pill read **`healthy`** — the only thing left disagreeing was the Incident panel. Restored |
| **Task 8 row 3 — `href` from `hostname`** | `href="p5c-build-app.staging.manifest.internal"` resolved to **`https://console.manifest.internal/projects/p5c-build-app.staging.manifest.internal`** — relative, navigating inside the console. Restored |
| **A deploy that cannot become ready** (the positive control F9/F10 rest on) | `health: /never-ready` → `instance.failed` + `incident.opened`, Incident naming *`readiness: GET /never-ready on mf-i-…:3000 from the edge — the edge last answered 404 after 87 attempt(s)`*, with a real `diffSinceHealthy` naming both control commits |
| **`getBuildLog` is load-bearing** (F1) | page reloaded after a build → **74 log lines on screen, 0 log frames in the replay**. Without the merge the panel is empty for anyone who did not watch the build live |

**Every control was applied AFTER its task was committed except Task 8's three**, which had to run
before `pnpm test` truncated the clicked project. Those three were restored from a hashed copy in
the session scratchpad rather than by `git checkout`, which would have destroyed the uncommitted
task (§4). The tree was diffed against that copy afterwards and every difference was an intended
fix; `grep -rn 'NEGATIVE CONTROL' packages/console/src` answers **none**.

#### Gate numbers at the end of this sitting

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 1355 in 103 files | **1355 in 103 files** — unchanged, and no new test FILE: Tasks 7 and 8 add none, by Decision 7 (no DOM test tier). Run twice at the baseline and twice at the close, 1355 every time |
| `pnpm test:docker` | 178 in 29 files | **not run, and NOT owed** — both commits touch only `packages/console/src/`, no `routing/`, `infra/` or `*.docker.test.ts`. **But this sitting ran real builds and real deploys, which is Docker all the same**; that residue is accounted for below |
| `make doctor` | 18/0 | **18/0** |
| `make verify` | 51/0 | **51/0** |

`pnpm lint`, `pnpm typecheck` (`Scope: 5 of 6`) and `pnpm format:check` clean before both commits.
**`vite build` was run after every change**, per sitting 2's F4: 255.13 kB at the end.

#### The machine

Snapshotted before and after, and **the diff is the timestamp, container uptimes and the git HEAD
— nothing else.** This sitting created a project, five app containers, two networks, three
volumes, four app images, two LiteLLM users, one bare repository and one runtime route, **and
removed every one of them itself** (F12: the classifier allowed both `--apply`s). Re-measured
afterwards by the scripts: `make verify`'s per-app meter reads **`containers=3 networks=1
volumes=2`** and *runtime routes* **0**, both exactly as the sitting found them; `litellm-orphans.sh`
reads **0 orphaned** with its one held user surviving; `dead-app-resources.sh` reads **none dead**.
App images stand at **29 lines / 27 distinct IDs / 0 by `^local/`** — the same three numbers
sitting 4 left, because all four images this sitting built were removed by digest. **NOTHING IS
OWED TO RICH.**

**The control plane was restarted at the START of this sitting**, by PID, so that its boot line
could be read: it says `{"driver":"docker"}`, which §7e names as the one failure that looks like
success. Its session secret is a random value persisted in the session's scratchpad rather than
regenerated per start, so a mid-sitting restart does not sign the browser out. **It was left
running on 7100** — but a sitting is one session, so check with `lsof` rather than believing it.
`vite` on 7104 was stopped by port at the close, confirmed by `lsof`, with 7102 and 7105 free.

#### The post-sweep check — one overstated claim, in six documents, and twelve that held

*§6 says to re-read your own §7e as a cold agent and CHECK its claims by opening what they point
at and counting. It has found a defect in every P5b sitting from the third onwards and in all
five P5c sittings.* **One here, and it is the class that spreads: a claim written from the PLAN's
paraphrase of the spec rather than from the spec:**

1. **"§22 STEPS 4, 5 AND 6 ARE CLICKED" OVERSTATES STEP 6, and it had already reached six
   documents.** Opened §22's own list in the spec: step 6 is **"Open the running app; log in with
   CWL *inside* it; write a note; ask the LLM."** The sign-in was done and **the note and the
   question were not** — they are what `make demo-ai` covers and what Task 14's acceptance owes.
   The plan's own Task 8 scopes step 6 to the sign-in (*"open it and sign in inside the app with
   CWL (§22 step 6 — the app's own UI…)"*), which is why the claim read as true: **the paraphrase
   was accurate about the task and wrong about the step it named.** Narrowed in ORIENTATION's top
   box, §2's P5c paragraph, §3's console entry, README's *Where to start* row, the roadmap ledger
   and this record — each now saying in place which half was not exercised. **The two commit
   messages still carry the wide claim and cannot be changed; this entry is the correction.**

**Twelve claims were checked and HELD**, which is worth recording because a check that only ever
finds errors is not being run honestly: `api.ts` really has **24** `async` operations against the
document's **34**; `git ls-files packages/console` really answers **19**; the two commits really
are **4** and **6** files; `0018_curvy_sister_grimm.sql` really is the newest migration; there
really are **3** `mf-` containers and all three are token-app's; *Read this first* items **1, 2
and 8** really say what §7e claims they say; `Idempotency-Key` really is required on `mintToken`
and `revokeToken` and **not** on `listTokens`, `getLaunchReadiness` or `listFleet`; Task 9 really
produces `getLaunchReadiness` and `listFleet` and Task 10 `mintToken`, `listTokens` and
`revokeToken`; `24 + 2 + 3 = 29`, leaving **5**; `mintToken` really publishes `token.minted`
(`api/routes/tokens.ts:137`); `pnpm test` really ran **five** times, counted from the captured
output files; the third test user really is `operator` / `operator` (`opr000001`); and **Task 9's
click steps really need no build, release or deploy**, which is the claim that would have cost the
next sitting a wasted build if it were wrong.

**A trap worth naming.** The first attempt to narrow the two shared HTML pages asserted its anchor
appeared once and **failed**, because the sentences WRAP across source lines and the search had
been done on a whitespace-collapsed print. It is §4's own note — *a phrase that wraps a line is
invisible to both obvious ways of counting it* — hit while sweeping the very pages that note was
written about. Anchor on the raw lines, with their breaks.

#### The cold-agent audit — asked after the sweep, and it found five more

*Rich asked, as he did after sitting 4, whether "read ORIENTATION.md and proceed with the next
sitting" would be enough for a cold agent to run sitting 6. Answering it properly means reading
§7e as that agent and then opening Tasks 9 and 10 and TESTING them — a stronger check than §6's,
because §6 verifies what the hand-off says and this verifies what the next sitting will hit. The
same question produced seven findings after sitting 4 and P5b sitting 7's F14/F15. Five here:*

1. **SITTING 6 NEEDS RICH TO TYPE A PASSWORD, AND NOTHING SAID SO.** Task 9's clicked half needs
   an `operator` session; the browser profile holds an **`instructor`** IdP session that sittings
   4 and 5 both rode for free, and switching user means ending it and typing `operator` /
   `operator` at the IdP's form, which the extension will not do (R3). **Sittings 4 and 5 needed
   no password only because they stayed the same person** — this is the first sitting since 3
   that changes user, and F9 of sitting 4 warned the free ride was *"a property of one profile at
   one moment, not a rule"*. §7e now carries it as a blockquote at the top, so it is scheduled
   rather than discovered at Step 4.3.
2. **BUT THE HEADLESS HALF NEEDS NOBODY, AND THERE IS A WORKED EXAMPLE NOBODY WAS POINTED AT.**
   `scripts/demo-journey.sh` lines **117–124** already run Task 9's whole grant sequence:
   `idp_login` as `operator`, `admin-grant.sh grant opr000001`, **`rm -f` both jars**, then
   `idp_login` again — the jar removal being what makes the second sign-in issue a session
   carrying the new role. **Tested this sitting**: `bash scripts/admin-grant.sh` runs from an
   agent session with no classifier refusal, and against a never-signed-in PUID it fails
   `ERROR: no user with PUID opr000001 has ever signed in; they must sign in once first` — the
   ordering trap proved rather than predicted.
3. **TASK 10 ASKS FOR SOMETHING THE DOCUMENT CANNOT GIVE IT.** Step 2(b) says the capability
   checkboxes come from *"the document's own enum (`MintTokenRequest.capabilities`)"* and that
   D24's privileged four are *"rendered disabled, with the reason"*. **The enum holds all eleven
   capabilities and marks none of them privileged**; the four are named only in the schema's
   prose `description`. So the console must **restate a platform rule**, which this plan forbids
   elsewhere and which the control plane itself holds with a test that names the four as literals
   (`projects/privileged.test.ts`). A D22 finding waiting to be recorded, with the two honest
   options named in §7e. *Found by opening the schema, not by reading the task.*
4. **ALL FIVE OF TASKS 9 AND 10's `api.ts` SNIPPETS TYPECHECK CLEAN**, pasted verbatim into
   `packages/console/src/api.ts` with `tsc --noEmit` — and every schema name they use exists and
   matches the document's response (`Fleet`, `LaunchReadiness`, `MintTokenRequest`, `MintedToken`,
   `TokenList`, `Token`). **Worth recording as a negative result**: sitting 4's audit found Task
   7's `liveBuild` did not compile, so the next agent would reasonably expect breakage here and
   should not go looking for it. `Idempotency-Key` is required on `mintToken` and `revokeToken`
   and **not** on `listTokens`, `getLaunchReadiness` or `listFleet`, all read from the document.
5. **§7e SAID NO BUILD IS NEEDED WITHOUT SAYING WHAT THAT MAKES THE SCREEN SHOW.** Read out of
   `launch/readiness.ts`: with nothing serving staging, `scans` renders **`unmet`** — *"Nothing is
   serving in staging yet, so there is no release to launch. Deploy to staging first."* That is
   the honest answer and not a fault, but an agent expecting the `met` branch with a real scan on
   it would go hunting. Named, with what seeing the other branch would cost.

**A sixth item is a convenience rather than a defect**, and is now in §7e: README's control-plane
block regenerates `MANIFEST_SESSION_SECRET` with `openssl rand -hex 32` on every start, so
restarting the control plane signs the browser out. Sitting 5 wrote the value once into its
session scratchpad and sourced it from there, and a mid-sitting restart then cost no sign-ins.

### Sitting 6 — Tasks 9 and 10, request production, the fleet and delegated tokens — 2026-09-19 — 11 findings

**§22 STEP 7 IS CLICKED, AND D24'S CREDENTIAL CLASS IS NOW OPERABLE BY A PERSON.** A signed-in
person reads §13's first-launch checklist with every item's state, reason, owner and the plan
that builds it; mints a delegated token and is shown its secret exactly once; lists it, revokes
it, and watches the platform refuse a privileged capability. An administrator, granted out of
band, reads §26's fleet. Committed as `1623e68` and `21d3100`. No migration, no route, no spec
change, no build and no deploy.

*Seven checklist items, not six.* The project was created with a `large_course` audience
deliberately, which is what makes §24's load-rehearsal item appear — sitting 5's production
refusal carried six.

#### The findings

**F1 — `<Ago>` CLAMPED EVERY FUTURE INSTANT TO ZERO, SO THE FIRST TOKEN THIS CONSOLE EVER MINTED
RENDERED `expires 0s ago`.** `Math.max(0, now - at)` is correct for an age and silently wrong for
a deadline. **Measured in the browser**: a token expiring in thirty days rendered `expires 0s
ago` — which reads as *already expired* — immediately beside a pill correctly reading `active`,
so the row contradicted itself. **`tsc`, ESLint, Prettier and all 1355 tests were green through
it**, and no gate here can ever see it: `expiresAt` and `createdAt` are both `string`, and
nothing distinguishes a past instant from a future one. It is now one direction-aware
`<Instant>` (`in 30d` / `2m ago`) rather than an `Ago` and an `Until`, **because two components
would put the choice back on the caller and the caller choosing wrongly is the defect**. Fourteen
call sites renamed, `tsc` finding every one. Task 11's `PendingAction.expiresAt` is the next
future instant to reach a screen.

**F2 — THE DOCUMENT CANNOT MARK D24'S PRIVILEGED FOUR, SO THE CONSOLE RESTATES A PLATFORM RULE.**
§7e predicted this and opening the schema confirms it: `MintTokenRequest.capabilities` is a flat
enum of all eleven capabilities, marks none of them privileged, and names the four only in its
prose `description`, which no client can read at runtime. Of the two honest options §7e named,
this sitting took *restate, with a comment saying it is a restatement and why*, because offering
four checkboxes that can never work is a worse screen. **The eleven ARE held to the document by
`tsc` in both directions** — `everyCapability` refuses a list that is missing one and a typo
alike, **watched failing both ways** (`Argument of type '[…ten…]' is not assignable to parameter
of type 'never'`, and `TS2820 … Did you mean "quota:set"?`), with the file restored
byte-identically afterwards. **The four are not held by anything**, and the fix belongs to the
document — `x-manifest-privileged` on the enum, or two enums — which this plan may not make.

**F3 — `revokeToken` PUBLISHES NO EVENT**, the third instance of the shape after sitting 4's F5
(`validateSpec`) and sitting 5's F7 (`createRelease`). `api/routes/tokens.ts` has exactly one
`publishEvent`, in the mint handler. So a revocation made in another tab, or by another person,
cannot reach a console that never polls (D23.2); this screen reloads its own list locally and a
second watcher is told nothing. Recorded as a finding about the API, not fixed.

**F4 — THE PRODUCTION GATE THROWS BEFORE THE RELEASE IS LOOKED UP, SO THE `409` NEEDS NO BUILD —
BUT THE CONSOLE CANNOT REACH IT ON A FRESH PROJECT.** Read out of `api/routes/releases.ts`: the
deploy handler asserts `release:promote`, then throws `ProductionGateError` for any production
environment, and only then calls `deployRelease`. **Measured with a releaseId that does not
exist**: `409 RELEASE_PRODUCTION_GATE_UNAVAILABLE` carrying the whole checklist. But the Deploy
panel disables its button while `releaseId === ''`, which is every project with no releases — so
the refusal is unreachable by clicking until something has been built. **That is what the Launch
panel earns its place by fixing**, rather than duplicating.

**F5 — THE TWO PATHS ARE BYTE-IDENTICAL, RE-MEASURED RATHER THAN ASSUMED.** P5a sitting 11 paid
for this (zod emits an object's keys in schema order and a hand-built body does not), and it
still holds: `json.dumps` of the production refusal's `launchReadiness` and of `GET
/v1/projects/{id}/launch-readiness` compared **equal, separator for separator**. Both now render
through one `<ReadinessItems>`, so a future divergence would be a finding about the platform
rather than about a second loop in the console.

**F6 — `Fleet` CARRIES AN INSTANT WHERE TASK 9 ASKS FOR A COUNT.** Step 3 says the table shows
*"open incidents"*. The schema answers `latestIncidentAt` per environment, and **there is no
open/closed state on an Incident anywhere in Phase 1** — so *"1 open"* would be a number the
platform never computed. Rendered as what it is, an instant. The same paragraph's three genuinely
absent columns (department, custom domains, AI spend) are named on screen as Phase 2's, which the
schema's own description already says.

**F7 — TASK 9'S CONTROL ROW 3 CANNOT FIRE, TWO WAYS OVER.** The row proposes reading `ready` from
`items.every(i => !i.blocking)`. **(a)** On the real payload all seven items are `blocking: true`,
so that expression is `false` and `ready` is `false` — the two agree, and the substitution changes
nothing visible. **(b)** More importantly it is not the mistake a client would actually make: the
platform computes `items.filter(i => i.blocking).every(i => i.state === 'met')`
(`launch/readiness.ts:147`), and the plausible careless re-derivation is *that* formula, which
would agree for ever until the platform's definition moved. The row is kept and `ready` is read
from the field, but **this is a control that was never able to fail**, in the family of sitting
5's F2.

**F8 — A CONTROL'S OWN SLOPPINESS CAN MASQUERADE AS A GATE CATCHING IT.** Task 9's row 2 (render
`state` without `why`) was applied by deleting a JSX block, and `pnpm format:check` went red —
which reads exactly like *a gate saw the missing reasons*. It had not: **tidying the leftover
blank line left all four gates green** on a checklist showing seven items as `not_built` with no
reason, owner or `builtBy` at all. Decision 7's *no DOM test tier* is why, and it is the honest
statement of this screen's coverage. **Always ask why a gate went red, never just that it did.**

**F9 — THE CONSOLE'S SIGN-OUT ENDS MANIFEST'S SESSION AND LEAVES THE IdP'S ALIVE.** Measured:
`POST /auth/logout` answered `204`, `GET /v1/me` then answered `401` — so the Manifest session
genuinely ended — and navigating to `/auth/login` landed **straight back on the console signed in
as the same person, with no IdP form and no password**. This is why sittings 4 and 5 rode a live
session for free, and on a shared machine it means *Sign out* does not do what a person reading
the word expects. Not fixed: §9's SLO is the IdP's business and the console has no affordance for
it. **Named, and it is what makes switching user cost a password.**

**F10 — CADDY'S INTERNAL PKI ISSUES A 12-HOUR LEAF, AND A TAB LEFT OPEN ACROSS A LONGER SLEEP
SHOWS `ERR_CERT_DATE_INVALID` ON A CHAIN THAT IS ENTIRELY VALID.** The machine slept nine hours
mid-sitting. On waking, Chrome refused `idp.manifest.internal` and then `console.manifest.internal`
in the same tab, while `openssl s_client` and `curl --cacert` both accepted the identical chain.
**Measured**: leaf `Sep 19 11:58:31 → 23:58:31` (**12 hours exactly**), intermediate `Sep 14
18:55 → Sep 21 18:55` (**7 days**), root to 2036; host and container clocks agreed to the second;
Caddy's log showed a clean renewal at 11:58:31. **Closing the tab and opening a new one cleared it
completely** — it was Chrome's cached TLS state for the expired leaf, not the edge. **Diagnose with
`openssl s_client` before suspecting Caddy, and open a new tab rather than debugging the platform.**

**F11 — THE CHROME EXTENSION'S REDACTOR KEYS ON A RESULT FIELD'S *NAME*, NOT ONLY ITS VALUE.** A
measurement returning `{holdsAnMftToken: false}` or `{sessionStorage: 'empty'}` comes back as
`[BLOCKED: Sensitive key]`, which reads as a failed read rather than as a redaction — and the
value it hid was a boolean. It correctly refused to show the token secret itself, which is the
behaviour working; the trap is that **a carelessly NAMED field makes a successful measurement look
broken**. Name probe fields neutrally, and have the page compute the assertion rather than
returning material to be assessed here. Same family as sitting 3's synthetic `503`. *Two clicks by
element `ref` also silently did nothing while the identical click by coordinate worked — noted for
the next sitting that drives Chrome.*

#### The negative controls

| Control | Watched |
|---|---|
| **Task 9 row 1 — hide the `/fleet` ROUTE rather than the link** | Watched in **both halves without a second password**. The route left open: `/fleet` typed by hand as the instructor rendered **`FORBIDDEN — the fleet is a platform administrator's read (§26)`** with its hint, and no Fleet link in the nav. What hiding it would look like: `/projects/<id>/queue`, which has no screen, renders the console's own *"built by Task 11 of P5c"* sentence with **0 refusals** — the platform's answer never reaches the person. **That is the finding the row predicts**, and the refusal stays visible |
| **Task 9 row 2 — render `state` without `why`** | Seven items rendered as `not_built — blocking` with **no reason, owner or `builtBy`**, and **all four gates green** once the edit's own blank line was tidied (F8). Restored by `git checkout`; tree clean |
| **Task 9 row 3 — recompute `ready` from the items** | **COULD NOT FIRE, TWO WAYS (F7).** Both formulas answer `false` on the real payload, and the formula the row proposes is not the one a careless client would write |
| **Task 10 row 1 — keep the secret after the panel closes** | Nothing goes red, exactly as the plan says; the comment is the only guard. Its POSITIVE half was measured instead: after dismissing and reloading, `localStorage` holds **0 keys**, `sessionStorage` 0, the URL is clean and the rendered text is clean — the secret lives in component state and nowhere else |
| **Task 10 row 2 — `expired: revokedAt !== null`** | Run against the only state that can show it, a token **revoked and not expired**: the pill read **`expired`** while the platform answered `expired: false`, on a row simultaneously saying **`expires in 30d`**. Restored; pill back to `revoked` |
| **Task 10 row 3 — mint a privileged capability** | Run **without touching the source**, by clearing `disabled` in the DOM as a curious person would: `400 TOKEN_CAPABILITY_FORBIDDEN — a delegated token may never hold members:manage (D24)` rendered by `<Refusal>`, and **no token created** (the project's list held only the two already minted). **The control is the platform's, which is the whole point** |
| **The capability list is held to the document** (F2, new) | `tsc` watched failing **both** ways — one capability removed → *`is not assignable to parameter of type 'never'`*; one misspelt → *`TS2820 … Did you mean "quota:set"?`*. File restored byte-identically, hash checked |
| **A delegated token really authenticates** (positive) | The screen's own secret, used by the page so it was never read here: `GET /v1/projects` → **`200` with exactly one project**, its own; `GET /v1/me` → **`403 TOKEN_CREDENTIAL_REFUSED`**, *"this action is only available in an interactive session (D24)"*. Authenticated, and refused that route — the right refusal |
| **Revocation bites, and only the minter may revoke** | A second token, minted by `curl`: `200` before revoking, **`401 UNAUTHENTICATED`** after — the same `401` an unknown, expired or malformed token gets. The student, signed in separately, revoking the instructor's token → **`404 NOT_FOUND`**, never `403` |
| **A platform role reaches a person only at the next sign-in** | The operator's session from *before* `admin-grant.sh` still read `role: member` and **`403`** on the fleet; jars removed and signed in again, `role: admin` and the fleet returned. Then, at the close, the gates' `pnpm test` truncated `users` and a fresh browser sign-in read `member` again with no Fleet link — the documented trap, seen from the console |

**Every control ran AFTER its task was committed**, so `git checkout` restored exactly and
`git status` proved it; the tree was clean after each. `grep -rn 'NEGATIVE CONTROL'
packages/console/src` answers none.

#### Gate numbers at the end of this sitting

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 1355 in 103 files | **1355 in 103 files** — unchanged, and no new test FILE: Tasks 9 and 10 add none, by Decision 7. Run twice at the baseline and twice at the close, 1355 every time |
| `pnpm test:docker` | 178 in 29 files | **not run, and NOT owed** — both commits touch only `packages/console/src/`, and unlike sitting 5 this sitting ran no build and no deploy |
| `make doctor` | 18/0 | **18/0** |
| `make verify` | 51/0 | **51/0**, per-app `containers=3 networks=1 volumes=2`, runtime routes **0** — all exactly as found |

`pnpm lint`, `pnpm typecheck` (`Scope: 5 of 6`) and `pnpm format:check` clean before both commits
and at the close. **`vite build` after every change** (sitting 2's F4): 263.69 kB at the end, up
from 255.13 kB.

#### The machine

Snapshotted before and after, and **the diff is the timestamp, the hostname, container uptimes and
one gigabyte of free disk — nothing else**. No app was created or destroyed, because neither task
builds or deploys. Both cleanup scripts were run bare at the close and **needed no `--apply`**:
`dead-app-resources.sh` reads **`none dead`, 0 networks and 0 volumes**, and `litellm-orphans.sh`
reads **0 orphaned**. App images stand at **29 lines / 27 distinct IDs / 0 by `^local/`** — the
same three numbers sitting 5 left, because nothing was built. **NOTHING IS OWED TO RICH.**

*A counting trap worth naming*: `docker images --format '{{.ID}}' | sort -u | wc -l` answers **69**,
which is every image on the machine and **not** the app-image figure sitting 5 recorded. The app
images are the ones tagged `127.0.0.1:7107/local/*`; the distinct-ID count among **those** is 27.
This is a fourth way of counting the same thing, and it was very nearly written into this record as
a movement that had not happened.

**The hostname changed between the two snapshots** — `Richs-MBP.localdomain` → `host169-126.vpn.ubc.ca`
— because the machine joined the UBC VPN during the sleep. Nothing broke, and §4's Cisco/dnsmasq
note did not fire, but it is the first time a snapshot diff has shown it.

**The control plane and `vite` both survived a nine-hour sleep** (pids 81557 and 65007, unchanged
across it). That is one more data point for §4's rule and does **not** license the next sitting to
assume it: check with `lsof`.


##### F12 — added after the close, 2026-09-19, found by Rich driving the console by hand

**THE LOG REACHING `DONE` IS NOT THE END OF THE BUILD, AND THE SCREEN SAID NOTHING ABOUT THE
TEN SECONDS AFTER IT.** Rich built `rich-is-testing`, watched BuildKit print `#12 DONE`, pressed
*Release this build* and was answered **`409 RELEASE_BUILD_NOT_DEPLOYABLE — build '…' is
'running' with digest 'none'`**. **The platform was right.** `scanImage` runs INSIDE
`driver.buildImage`, after BuildKit returns, and takes **no `onLog`** — so §12's Syft and Grype
containers emit no log line and no event, and the build row stays `running` with
`imageDigest: null` for the whole scan.

**Measured twice**, from `audit.build_logs`' last row to the `build.succeeded` event:

| build | last log line → `build.succeeded` | total |
|---|---|---|
| `ffcb2849` (Rich's) | **11.29 s** | 14.39 s |
| `44cb5ab7` (reproduction) | **9.70 s** | 12.82 s |

So for about ten seconds a wall of log text ends in **DONE** while a small grey pill says
`running`, and the log is much the louder of the two. **Pressing Release in that window is the
reasonable thing for a person to do**, which is why this is a screen defect and not a user error.

**The fix explains rather than enforces, and the button stays enabled.** The difference from
`screens/tokens.tsx`'s privileged four is deliberate and is written into the code: a privileged
capability can NEVER be minted, so `disabled` there is an honest permanent statement; a `running`
build becomes releasable in seconds, so disabling on it would be a transient claim that **sticks
if a stream frame is ever missed** — the exact failure sitting 5's F10 records for a pill driven
by an event rather than by the resource. The hint reads from `shown`, the re-read `getBuild`,
never from the log.

**Watched both ways on a real build**, sampled every 1.2 s: `#12 DONE` at 4 s with the pill
`running` and the hint present, still both at 12 s; then the pill `succeeded`, the hint gone and
the Image field beside it. Committed as `5d4c785`.

**THERE IS NO API GAP HERE, and telling the two apart is the point.** Rich asked whether a route
exists to say when a build is ready to release: `GET /v1/builds/{buildId}` already answers
`status` and `imageDigest`, and `build.succeeded` is the push form. The console had both and was
not using them to say anything. **What IS a platform finding is that the scan window is invisible
to every client** — no log line, no event, nothing — so any client written against this API will
make the same mistake. Emitting scanner progress means threading `onLog` into `scanImage` from
`runtime/docker/`, which owes `pnpm test:docker`; **recorded for whoever next opens §12, not done
here.**

### Sitting 7 — Task 11, §26's queue as a screen — 2026-09-19 — 8 findings

**D24'S LOOP IS OPERATED BY A PERSON FOR THE FIRST TIME.** Everything P5b built was driven by
`curl` and by `packages/journey`; this sitting put a human in it. On a project `queue-app`
created by clicking, a delegated token was minted **by clicking** and its secret taken through
the console's own *Copy* button; an agent holding it asked to add a member and was refused
`403 TOKEN_ACTION_PENDING`; **the question reached the open queue 576 ms later with no reload
and no navigation**; a person confirmed it; the agent's own retry, with the same
`Idempotency-Key` D23.6 tells it to reuse, answered **`201`**; a retry with a **fresh** key made
a **new question** rather than succeeding; a second question was rejected in the person's own
words and that sentence reached the agent **verbatim** as `403 TOKEN_ACTION_REJECTED`; and a
third was left waiting. Committed as `aec8b90`. **No migration, no route, no spec change, no
build, no deploy, and no Docker tier owed.**

*All four `PendingAction` states were on screen at once* — `pending` with its two buttons,
`expired` with none, `rejected` carrying the person's sentence, and `confirmed` carrying
whether the agent had spent its retry.

#### The findings

**F1 — `<Refusal>`'s `pendingAction` CAN NEVER HAVE A CALLER IN THIS CONSOLE, AND BOTH THE PLAN
AND ORIENTATION §7e SAY TASK 11 IS IT.** `ui.tsx` has carried *"Task 11 adds it with its
caller"* since Task 4, and §7e repeats it as a thing already known. It is wrong, and the reason
is structural rather than a matter of sequencing. Traced rather than assumed: `api/errors.ts`
puts `pendingAction` on exactly two envelopes, `TOKEN_ACTION_PENDING` and
`TOKEN_ACTION_REJECTED`; both are raised by `api/contract/route.ts`'s wrapper; the wrapper
reaches them only through `TokenCapabilityRefusedError`, which `projects/authz.ts` throws
**inside `if (actor.credential === 'token')`** and nowhere else. The console holds a session and
only a session — `createApi` has no token option at all (Decision 6) — so no refusal it can ever
receive carries the field. **Building the renderer would have been the no-caller shape
ORIENTATION §9 names four times, wearing the comment that exists to prevent it.** Not built;
`ui.tsx` now states the impossibility with its trace. *The agent's half of D24's loop reads that
field in the AGENT's client, which `packages/journey/src/token.ts` already does.*

**F2 — `consumeAction` PUBLISHES NO EVENT, AND NEITHER DOES `addMember` — THE FOURTH AND FIFTH
INSTANCES OF THE SHAPE.** After `validateSpec` (sitting 4 F5), `createRelease` (sitting 5 F7) and
`revokeToken` (sitting 6 F3). `tokens/pending.ts` has exactly two `publishEvent` calls, in
`recordPendingAction` and `resolveAction`; `consumeAction` only stamps `consumed_at`, and
`api/routes/project-reads.ts` has none at all. So **the one fact a person most wants after
confirming — *has the agent spent its one retry?* — cannot arrive on the stream**, and D23.2
forbids the timer that would otherwise fetch it. That is what gives `getPendingAction` a real
caller: a *Check* button on a confirmed row, pressed when a person wants to know. Watched
working: *"granted — waiting for the agent to make its one retry"* before the retry, *"granted,
and the agent spent its one retry 3s ago"* after it. **Recorded as a finding about the API, not
fixed.**

**F3 — THE THREE `pending_action.*` EVENTS REALLY DO PUBLISH, CHECKED RATHER THAN ASSUMED.**
§7e told this sitting to check before assuming a screen can learn from the stream, because three
screens before it had found the opposite. Here the answer is yes: `recordPendingAction` publishes
`pending_action.created` and `resolveAction` publishes `.confirmed` or `.rejected`. **This is the
first screen in P5c whose own writes reach every other watcher**, and the only one that needs no
local-reload workaround — the reload it does keep is for the case where the socket is closed, not
for the platform's silence.

**F4 — A `403 CSRF_ORIGIN_REFUSED` STOOD IN FOR A CAPABILITY REFUSAL, IN EXACTLY THE PLACE THIS
PROJECT ASSERTS 403s.** Proving the read/answer split, `O='-H origin:…'` then `curl … $O …` was
written — and **zsh does not word-split an unquoted variable** (§4, already documented). The
header never went, and the collaborator's confirm and the stranger's confirm **both answered
`403`**, which is the exact status the collaborator's refusal was predicted to have. A
status-only assertion would have passed, concluding the collaborator was refused for lacking
`members:manage`. With the header inline the real answers are **`403 FORBIDDEN — role
'collaborator' may not 'members:manage'`** and **`404 NOT_FOUND`**. *The zsh trap is old; what is
new is that it lands as a plausible 403 rather than as an error, which is why CLAUDE.md's
**name the refusal's CODE** is the rule that saved it.*

**F5 — `<Instant>`'s UNIT BOUNDARY MAKES TWO IDENTICAL DEADLINES READ DIFFERENTLY.** Two questions
asked 34 seconds apart, both with the same 24-hour TTL, rendered **`expires in 1d`** and
**`expires in 24h`** on adjacent rows: `magnitude < 86400` selects hours, so 86,400 s exactly is
`1d` and 86,366 s is `24h`. Neither is wrong and a person reading the two could reasonably infer
a difference that does not exist. **Not fixed** — every threshold has a boundary and moving this
one only moves the artefact — but named, because `<Instant>` is now on fourteen call sites and
this is the first time two of them have been adjacent.

**F6 — `PendingActionResolvedError`'s HINT ASSUMES A PERSON ANSWERED, AND THE SAME ERROR CARRIES
`expired`.** Watched during F8's control: the refusal rendered
**`PENDING_ACTION_RESOLVED — this pending action was already expired`** above the hint
*"Reload the queue: somebody has already answered this one."* The message is right and the hint
is wrong — nobody answered it; its life ran out. A small thing, and it is the sentence a person
reads when the screen and the platform disagree, which is the worst moment to be told something
untrue. **Recorded, not fixed** (it is a control-plane string and this plan changes no route).

**F7 — THE REUSE FINGERPRINT DOES NOT INCLUDE THE `Idempotency-Key`, WHICH IS WHY THE PLAN'S OWN
STEP ORDER WORKS.** `recordPendingAction` matches on token, method, concrete path and a
key-sorted body hash — **not** the key — so an identical ask with a *fresh* key while the first
question is still `pending` **reuses that row** and creates nothing. The plan's step 6 (*"the
agent retries again with a fresh key → a new question"*) is therefore true only because step 4
has already moved the first row to `confirmed`, taking it out of the partial unique index's
`WHERE state = 'pending'` predicate. Measured both ways: a fresh key with a **different** body
(`{role: 'owner'}`) made a new question while the first was pending, and a fresh key with the
**same** body made a new question only after the first was confirmed. **Anyone reordering these
steps will conclude the grant leaked.**

**F8 — MINTING BY CLICKING AND *Copy* IS A WORKING PATH FOR AN AGENT'S CREDENTIAL, WHICH MATTERS
BECAUSE OF THE EXTENSION'S REDACTOR.** Sitting 6's F11 records that the Chrome extension blocks a
result field whose NAME looks sensitive, so a secret cannot be read off a page into an agent's
hands. `navigator.clipboard.writeText` plus `pbpaste` is the path that works: the console's own
*Copy* button put a well-formed 80-byte `mft_<uuid>_<secret>` on the clipboard, a terminal picked
it up, and **the token authenticated and answered `GET /v1/projects` with exactly its one
project**. The secret was never read into this session — only its masked shape and its behaviour.
*This is how a future sitting gets a clicked credential to a terminal without either reading it
or minting a second one by script.*

#### The negative controls

| Control | Watched |
|---|---|
| **Row 1 — `displayState` returns `row.state` unchanged** (Decision 8's control) | **FIRED.** A question's `expires_at` was moved two hours into the past with `psql`, leaving it stored `pending`. Intact: it rendered **`expired` with NO buttons** while a genuinely pending row beside it kept Confirm and Reject. Reverted: it rendered **`pending` with a Confirm button**, and pressing it answered **`409 PENDING_ACTION_RESOLVED — this pending action was already expired`** — a button that cannot work, exactly as the row predicts. Restored from a hashed scratchpad copy (the task was not yet committed) and the hash re-checked `OK` |
| **Row 2 — re-read on a `setInterval` instead of on the event** | **FIRED, the way the row says to watch it.** `window.WebSocket` was wrapped to capture instances, the project screen remounted to make a new socket, and that socket closed. A **fourth** question was then created (`403 TOKEN_ACTION_PENDING`, confirmed present in `pending_actions`) and the screen still showed **3 rows 18 s later** — against **576 ms** with the socket live. There is no timer; the stream is the mechanism |
| **Row 3 — a fresh idempotency key on the agent's retry** | **FIRED, inline as part of the loop rather than as a break.** After the confirmed retry spent the grant, the same request with a fresh key answered `403 TOKEN_ACTION_PENDING` with a **new** question id carrying the **same** body hash `0aa6131a…`. The grant is for the request, once — see F7 for why this only works in this order |
| **A person may read without being able to answer** (positive + refusals, by CODE) | The student, made a collaborator by the agent's own confirmed retry, **read the queue `200`** and was refused at confirm **`403 FORBIDDEN — role 'collaborator' may not 'members:manage'`**; the instructor, a stranger, got **`404 NOT_FOUND`** at both. *Both refusals were first measured as `403 CSRF_ORIGIN_REFUSED` — see F4* |
| **The clicked token really is a delegated token** (positive) | Used from a terminal, never read into this session: `GET /v1/projects` → **`200` with exactly one project**, its own |
| **The confirmation is not a replay** (positive) | After confirming, the project's membership was unchanged and the row read *"granted — waiting for the agent to make its one retry"*; it changed only when the AGENT retried, and `consumedAt` moved only then |

**The Decision 8 control ran before the commit, deliberately**, because `pnpm test` truncates
`pending_actions` and would have taken the question with it (sitting 4's F8). The files were
copied to the session scratchpad with `shasum -a 256` first and restored from those copies, never
by `git checkout`, which on an uncommitted file destroys the work rather than the experiment (§4).
`grep -rn 'NEGATIVE CONTROL' packages/console/src` answers none; `git status` was clean before the
commit.

#### Gate numbers at the end of this sitting

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 1355 in 103 files | **1355 in 103 files** — unchanged, and no new test FILE: Task 11 adds none, by Decision 7 (the console has no DOM test tier). Run twice at the baseline and twice before the commit, 1355 every time |
| `pnpm test:docker` | 178 in 29 files | **not run, and NOT owed** — the one commit touches only `packages/console/src/`, and this sitting ran no build and no deploy |
| `make doctor` | 18/0 | **18/0** |
| `make verify` | 51/0 | **51/0**, per-app `containers=3 networks=1 volumes=2`, runtime routes **0** — exactly as found |

`pnpm lint`, `pnpm typecheck` (`Scope: 5 of 6`) and `pnpm format:check` clean before the commit.
**`vite build` after the change** (sitting 2's F4): **268.93 kB**, up from 263.69 kB.

**`api.ts` now calls 33 of the contract's 34 operations** — *counted with a script that matches
each operation's method and path against the file, not by adding four to a remembered 29*. The
one remaining is `streamProjectEvents`, the WebSocket, which `stream.ts`'s `subscribe` calls, so
**Task 13's coverage gate must count the stream as covered rather than exempt it** and
`DELIBERATELY_UNCALLED` can still start empty (Decision 15).

#### The machine

Snapshotted before and after: **the diff is the timestamp and the git HEAD, and nothing else.**
No image, container, network or volume changed, because `queue-app` was created but never built
or deployed. The one thing this sitting left was `.manifest/repos/queue-app.git`, created at
12:14 by the project creation and orphaned by the gates' truncation — **removed by this session,
because it is its own**; the three repositories that predate it were left alone. Both cleanup
scripts were run bare at the close and **needed no `--apply`**: `dead-app-resources.sh` reads
**`none dead`, 0 networks and 0 volumes**, and `litellm-orphans.sh` reads **0 orphaned** with the
one held user left alone. **NOTHING IS OWED TO RICH.**

*A counting trap avoided*: `curl http://127.0.0.1:7119/config/apps/http/servers/` counted **3**
routes and read like three stale runtime routes. It is not that number — it counts the
Caddyfile's own static routes too. **`make verify`'s *runtime routes currently applied* is the
meter**, and it reads **0**.

#### The post-sweep check — three defects, all in this sitting's own §7e

§6's rule held again, and for the eighth consecutive sitting from P5b's third. **All three were
found by opening the thing pointed at and counting it, never by re-reading the sentence.**

1. **"Task 12 carries a `[SITTING 1]` correction block about `ajv`" — FALSE.** Task 12 carries
   **no** correction block at all. The `ajv` correction landed on **Task 2** (`[M4][M5][M9]`,
   whose item 1 is *"Install `ajv-formats` as well as `ajv` (M9/F4), and this is the last task
   that can"*), and it was honoured: `packages/mock/package.json` declares `ajv` **8.20.0** and
   `ajv-formats` **3.0.1**, both exact. **Task 13 is the one with a block**, `[M7][M5]`, and it is
   about the coverage gate's arithmetic — the very thing sitting 8 must get right. Sending the
   next agent to read a block that does not exist would have cost them the one that does.
2. **"`packages/mock` is otherwise empty" — FALSE.** `git ls-files` shows four files, and
   `src/server.ts`'s `createMockServer` already **answers `501` to everything, deliberately**,
   with a comment saying a mock that answers a plausible `200` to everything is the stand-in that
   produces a real-looking failure (P4c finding 74). Task 12 therefore extends an existing caller
   rather than starting from nothing, and that `501` is what sitting 8's first test should watch
   stop being.
3. **"`scripts/offline-acceptance.sh` has nine steps" — right, but not countable the obvious
   way.** Counting its `=== n.` headings answers **10**: they run **0 to 9**, with step 0 the
   precondition. Named in §7e rather than left to be re-derived, because Task 13's script
   orchestrates that one and Decision 12 makes it assert counts.

*The first two are the class §6 warns is worst — a wrong pointer, which the next sitting inherits
and multiplies because it is told to trust the hand-off. Both were in sentences that read
perfectly.*

#### The cold-agent audit for sitting 8 — two snippets that do not compile, and a gate that is green

*Run at the very end of sitting 7, the way sitting 6 ran one for sitting 7. The question it
answers is not "is the plan good" but "will a cold agent reading only ORIENTATION get this right".
Everything below was measured, not read.*

- **Task 12 Step 2's `PROJECT` fixture fails `tsc` twice**, pasted verbatim into
  `packages/mock/src/` and compiled: `TS2353 … 'puid' does not exist in type
  '{ id: string; displayName: string; }'` (`Project.owner` is `UserSummary`, which is two fields)
  and `TS2739 … missing … setBy, setAt` (`Audience` requires five). `ME` is clean. **Both would
  also fail the Ajv check Step 1 writes**, so the task's own gate catches them — a sitting late,
  after the fixtures are written. Recorded as a `[SITTING 7]` block at the top of Task 12.
- **Task 13 Step 1's coverage gate passes the moment it is written.** Its exact logic — the same
  regex, the same `streamProjectEvents` branch — run over today's `api.ts`, `stream.ts` and
  `auth.ts` reports **`uncalled: []`, `checked: 34`**, and both `auth.ts` assertions hold. The
  step's prose says *"If this test is red…"*, which will mislead. **A gate nobody has watched fail
  is not a gate**, and this plan has already produced three control rows that could not fire, so
  the block names the single call to comment out (`listFleet`) and the exact line the failure
  should print.
- **`packages/console/src/api.test.ts` may import `@manifest/mock`.** Checked because the obvious
  worry is that the import boundary refuses it and the obvious repair would be to weaken the
  boundary: `boundary.test.ts`'s scanner skips `*.test.ts` and `eslint.config.js` carries
  `ignores: ['packages/console/src/**/*.test.ts']` on the same rule.
- **28 of the document's 52 schemas are 2xx response schemas**, enumerated in the block — the real
  size of `FIXTURES`, where Step 2's comment lists fixture CONSTANT names rather than the document
  schema names `validate.test.ts` looks up.
- **The version bump has three edits and two tests holding them together**:
  `api/contract/document.ts`'s `CONTRACT_VERSION` (`'0.1.0'` today, line 12), then
  `pnpm contract:write` for `openapi.json`'s `info.version`, then
  `packages/contract/package.json`. `document.test.ts` asserts the package equals
  `CONTRACT_VERSION` and `packages/contract/src/client.test.ts` asserts the package equals the
  document.
- **The console's `preview` script and its 7104 port both already exist** (`vite.config.ts` sets
  `preview.port` and `allowedHosts` as well as `server`'s), so `make demo-console` starts a server
  that is already configured for the edge.

**Consistency, checked mechanically across the documents a cold agent meets**: six independent
statements of how far P5c has got all read *seven done, sitting 8 next*; the sittings table has
exactly seven `DONE` rows and one `← next`; the four gate numbers are identical in ORIENTATION §2,
`README.md` and `RUNBOOK.md`, and `CLAUDE.md` states none, as §6 requires.

### Sitting 8 — Tasks 12 and 13, `manifest-mock` and the CI script — 2026-09-19 — 11 findings

**A FRONT-END DEVELOPER NEEDS NO PLATFORM, AND 1c's ACCEPTANCE RUNS HEADLESS.**
`packages/mock` serves all 34 operations of the published contract from hand-written
fixtures with a scripted WebSocket, in one `node:http` process — no Docker, no Postgres, no
control plane, no language model. The console was driven against it **in a browser** through
Vite's proxy, the whole journey: signed in with no IdP, read the project, watched twenty log
lines arrive, watched the build stay `running` through §12's silent scan and then go
`succeeded`, read the deploy panel and §14's Incident, read §26's queue with all four states
on screen, minted-token list, and the fleet's `403` carrying the hint that says how to see
the other side. `packages/console/src/api.test.ts` drives the console's **whole data layer**
against it in Node with no DOM. Committed as `01225cb`.

`packages/console/src/coverage.test.ts` is §16's *API completeness* tier: **all 34
operations have a caller, `DELIBERATELY_UNCALLED` is empty**, and it was watched failing
three ways. `scripts/ci-acceptance.sh` and `scripts/demo-console.sh` are the acceptance's
two halves, `@manifest/contract` is **1.0.0**, and `make ci-acceptance` was run for real.
Committed as `58107aa`.

**`make doctor` then failed `CLAIMED BY SOMETHING ELSE: 7102` — the third time on that one
check — and `doctor.sh`'s own comment had named this task as the one that must fix it
(F9).** Fixed and watched failing; committed separately.

#### The findings

**F1 — `build:run` IS NOT A CAPABILITY, AND NEITHER `tsc` NOR AJV CAN SEE THAT.** The
`TOKEN` fixture listed `['project:read', 'build:run', 'release:deploy']` and every gate was
green. The real capability is **`build:create`**. The reason nothing caught it is an
asymmetry in the document: **`MintTokenRequest.capabilities` is a closed enum of eleven**
(`project:read`, `project:write`, `project:delete`, `members:manage`, `build:create`,
`release:create`, `release:deploy`, `release:promote`, `release:approve`, `quota:set`,
`secret:read`) **while `Token.capabilities` — the READ schema — is a bare
`{type: 'array', items: {type: 'string'}}`**. So the request side is checked and the answer
side is not, in both directions: `tsc` types it `string[]`, and Ajv validates it against
`string`. `validate.test.ts` now holds every token fixture to the MINT enum by hand.
**This is a finding about the API, recorded and not fixed** — it is the second instance of
the shape sitting 6 found (the document cannot mark D24's privileged four either, so the
console restates them), and the fix is a route change this plan does not make.

**F2 — ONE SOURCE FILE, TWO MODULE RESOLUTIONS, AND THE CORRECT AJV IMPORT IS DIFFERENT IN
EACH.** `@manifest/mock`'s `exports` map points at its TypeScript source, so
`packages/mock`'s own `tsc` (`moduleResolution: NodeNext`) and `packages/console`'s
(`Bundler`, because `api.test.ts` imports the mock) both compile `validate.ts`. Measured,
both directions:

| form | NodeNext (the mock) | Bundler (the console) |
|---|---|---|
| `import Ajv2020 from 'ajv/dist/2020.js'` | `TS2351 … 'typeof import("…/2020")' has no construct signatures` | fine — it is the class |
| `Ajv2020Module.default` | fine | `TS2339 Property 'default' does not exist on type 'typeof Ajv2020'` |
| **`import { Ajv2020 } from …`** | **fine** | **fine** |

Node's own ESM loader constructs the bare default happily, which is why the plan's snippet
predicted the opposite trap — a RUNTIME *`Ajv2020 is not a constructor`* — and offered a
cast for it. **The named import is right in both worlds and needs no cast**, because ajv's
CommonJS sets `exports.Ajv2020` and `module.exports.Ajv2020` as well as `module.exports`.
`ajv-formats` has no named export, so it takes the one cast in the package, with the
measurement beside it. **The general rule: a package whose `exports` map serves TypeScript
source is compiled by every consumer's compiler settings, not by its own.**

**F3 — THE PLAN'S OWN BREAK ROW 1 IS CAUGHT BY `tsc`, SO IT DOES NOT DEMONSTRATE WHAT AJV
ADDS.** *"change `ME.role` to `"administrator"`"* was watched turning `validate.test.ts` red
— *`Me: /role must be equal to one of the allowed values`* — and then `pnpm --filter
@manifest/mock typecheck` was run on the same broken file and answered
*`TS2322: Type '"administrator"' is not assignable to type '"admin" | "member"'`*. Both
gates catch it, so the row proves the validator is **connected to the fixtures** and nothing
more. What Ajv adds over `tsc` is the half `tsc` is structurally blind to — `format`,
`pattern` and `additionalProperties: false` — and that is what the file's own control
asserts instead: `id: 'project-1'` is a perfectly good `string` to TypeScript and is refused
by the document two ways. **A control has to break something only ONE gate can see, or it is
measuring the wrong gate.**

**F4 — THE PLAN SAYS A MISSING `Idempotency-Key` IS `400 REQUEST_INVALID`. IT IS NOT.** The
platform answers **`400 IDEMPOTENCY_KEY_REQUIRED`**, a code of its own that is in the
published document, from `api/server.ts`'s `preHandler` — **and it refuses a key shorter
than eight characters**, which the plan does not mention at all. A mock answering the plan's
code would be a fixture lying about a refusal a client switches on. The mock mirrors
`api/idempotency.ts` on the other two rules too: a repeated key with the same body and route
replays the FIRST response, and the same key with a DIFFERENT body is
`409 IDEMPOTENCY_KEY_REUSED`.

**F5 — A FIXTURE ANSWERED FOR EVERY ID LIES ABOUT WHICH RESOURCE IT BELONGS TO, AND ONLY A
BROWSER SHOWED IT.** `listIncidents` returned the one `INCIDENTS` fixture whatever
environment was asked for, so §14's Incident — whose own `environmentId` is **staging** —
rendered on screen under **sandbox**, beside the words *never deployed*. Every test passed:
the fixture validates, and `api.test.ts` asked for staging. The routing table now keys on its
path parameter and answers an empty list for any other environment, which also exercises the
console's empty-incident path. **`getPendingAction` had the same shape** (below), so it is
not a one-off: **a mock that ignores its path parameters is a mock that answers the right
schema about the wrong thing.**

**F6 — A FIXED INSTANT IS RIGHT FOR A TIMESTAMP AND WRONG FOR A DEADLINE.** The plan's own
fixture rule — *"fixed instants, not `new Date()`: a fixture whose value changes per run
cannot be asserted against"* — is right, and applying it to `PendingAction.expiresAt` made
the queue screen unreachable: measured in a browser, the only `pending` row had already
lapsed by the wall clock, so Decision 8's `displayState` correctly rendered it **expired,
with no buttons**, and a front-end developer driving the mock could never reach the screen
the mock exists to develop. The deadline is now computed relative to now; every other
instant stays fixed. The queue also carries all four states deliberately, including a row
still stored `pending` whose life has run out — which is Decision 8's control, reproducible
with no platform.

**F7 — THE STORED LOG AND THE STREAMED LOG MUST SHARE ONE `seq` SPACE.** `getBuildLog`'s
first two lines and the scripted stream's first two frames were written independently, so
both claimed `seq: 1` and `seq: 2` with different text, and the console's `seq`-keyed merge
showed one of each — *"#1 [internal] load build definition"* from the read and *"#1
transferring dockerfile"* from the stream. Not a doubling, which would be visible: **a
silent blend at almost the right length**, the same shape §4 already records for a missing
`buildId` filter. One `LOG_LINES` array now feeds both.

**F8 — A MOCK WHOSE BUILD ENDS WHEN ITS LOG DOES CANNOT TEACH SITTING 6's F12, WHICH IS THE
WHOLE REASON FOR SCRIPTING THE SILENCE.** The script had the ten-second scan window from the
start, but `GET /v1/builds/{id}` answered the finished `BUILD` fixture throughout — so on
screen the pill read `succeeded` while the log was still arriving, which is the exact
opposite of the platform. The mock now sets `buildSucceedsAt` when a subscription starts
playing and answers `running` with no digest until that instant, so the http half and the
stream half agree the way the platform's two readers of one build row do. **Watched in a
browser**: pill `running`, *"Scan — not scanned"*, and the console's own hint *"this build
is `running` and has no image yet, so a release will be refused"* for ten seconds after the
log reached `DONE`, then `succeeded` with the digest and §12's scan.

**F9 — `make doctor` FAILED `CLAIMED BY SOMETHING ELSE: 7102`, THE THIRD TIME ON THAT ONE
CHECK, AND `doctor.sh` HAD PREDICTED IT BY NAME AND NAMED THIS TASK.** The comment above
`console_is_ours` read: *"THE MOCK ON 7102 WILL NEED THE SAME and deliberately does not have
it yet … Task 12 adds it, keyed on whatever the mock then answers."* Task 12 did not, and
the first real `make ci-acceptance` run — with the mock left listening from the browser walk
— failed on it. After 7100 (2026-09-07) and 7104 (2026-09-18) this is the same defect a
third time: **`manifest_own_ports` reads PUBLISHED CONTAINER PORTS, so §21's host-resident
processes are invisible to it and read as foreign.** `mock_is_ours` asks the mock for a path
the DOCUMENT DOES NOT DECLARE, which it answers `404` with its own name in the message —
**`/v1/me` would not do, because the mock answers that with the same `UNAUTHENTICATED`
envelope the control plane does and the two would be indistinguishable.** Watched both ways:
a throwaway server on 7102 answering a plausible `404 ROUTE_NOT_FOUND` envelope is still
called foreign, and the real mock is recognised (18/0 either way).

**F10 — `getPendingAction` IGNORED ITS PATH PARAMETER, AND THE TEST DOCUMENTED THE LIE.**
It answered `CONFIRMED_ACTION` for any id — so `api.test.ts` asserted that asking for the
**pending** row's id returns `confirmed`, and that assertion passed. Keying the route on its
id turned the test red, which is how it was found. The test now asks for BOTH ids and
asserts they differ; a mock ignoring the parameter cannot satisfy it. *F5's twin, found by a
change rather than by a browser.*

**F11 — `packages/mock`'s TEST FILES ARE NOT TYPECHECKED, AND THE CONSOLE'S ARE.** Its
`tsconfig.json` carries `"exclude": ["src/**/*.test.ts"]` — correctly, since it emits to
`dist/` and `packages/contract` shows what happens without it (compiled test files shipped
in `dist/`) — so `pnpm typecheck` never sees `validate.test.ts` or `server.test.ts`, while
`packages/console`'s `noEmit: true` config includes its tests and does. **This is why the
Ajv interop lives in `validate.ts` rather than in the test**, as the plan drafted it: the
risky typed code is in the half a compiler reads. Named rather than changed — giving the
mock a second tsconfig for tests is machinery for one package. *Same family as §4's
`packages/journey` note.*

#### The negative controls

| Control | Watched |
|---|---|
| `validator()` always returns `{ ok: true }` | **FIRED.** `validate.test.ts`'s own control: *expected true to be false*. Without it the first test passes against anything |
| Empty the `FIXTURES` table | **FIRED.** *no fixtures were checked: expected 0 to be greater than 10* |
| `ME.role = "administrator"` | **FIRED**, and `tsc` caught it too — see F3. It proves the validator is connected to the fixtures and nothing more |
| Drop the CONTROL frame from the scripted stream | **FIRED.** `api.test.ts`'s *subscribes, is replayed, and is told when the replay ends* **timed out at 5000 ms** — `subscribe`'s `ready` resolves on that frame and on nothing else, which is *"status connecting for ever"* seen from Node |
| Remove one operation from `ANSWERS` | **FIRED.** `server.test.ts`: *expected [ 'listBlueprints' ] to deeply equal []* |
| Answer a body that is not its schema (`getMe` → `{id:'not-a-uuid', puid:'p'}`) | **FIRED.** The mock answered **500** naming the schema and every failure: *manifest-mock built a body that is not a Me: / must have required property 'displayName'; … /id must match pattern …; /id must match format "uuid"*. The outgoing validation is connected |
| **Comment out `listFleet` in `api.ts`** (Task 13's, §7e's named control) | **FIRED**, printing exactly the predicted line: *expected [ 'GET /v1/fleet (listFleet)' ] to deeply equal []*. **The gate had never been red before this** |
| Point `coverage.test.ts` at an EMPTY `{"paths":{}}` | **FIRED.** *no operations were read from the document: expected 0 to be greater than 30* — the vacuous-pass control |
| Break the stream's caller (`subscribe(` → `(0, subscribe)(`) | **FIRED.** *GET /v1/projects/{projectId}/events (streamProjectEvents)* — the stream is COUNTED, not exempt |
| **Decision 12: exit code vs count**, with `packages/mock/src/server.test.ts` renamed away | **FIRED.** `pnpm test` **exited 0** with **1369 tests in 106 files** against 1376 in 107 — a script keying on the exit code reports PASS; the count check reports MOVED. P5b sitting 9's F5, in a new place |
| A FOREIGN server on 7102 answering a plausible `404` envelope | **FIRED.** `make doctor` **1 failed**, *CLAIMED BY SOMETHING ELSE: 7102*; the real mock restored it to 18/0. F9's control, both directions |

Every break was made **after** its task was committed, and restored with `git checkout` from
the index (§4). `git status` was clean between each; the one exception is noted in F1, where
the fixture was copied to the scratchpad with `shasum -a 256` first because the task was not
yet committed, and the hash re-checked after the restore.

#### Gate numbers at the end of this sitting

| Gate | Before | After |
|---|---|---|
| `pnpm test` | 1355 in 103 files | **1376 in 107 files** — up 21 and four files: `packages/mock/src/validate.test.ts` (4), `packages/mock/src/server.test.ts` (7), `packages/console/src/api.test.ts` (8) and `packages/console/src/coverage.test.ts` (2). Run twice at the baseline (1355), twice after Task 12 (1374) and twice after Task 13 (1376) |
| `pnpm test:docker` | 178 in 29 files | see the sitting's own line below — **OWED and RUN**, because F9's repair touches `infra/lib/common.sh` and `routing/edge-source-refusal.docker.test.ts` reads that file |
| `make doctor` | 18/0 | **18/0** — and it went to **1 failed** in between, which is F9 |
| `make verify` | 51/0 | **51/0** |
| `make ci-acceptance` | did not exist | **run**: `make demo-journey` and `make demo-token` both green over the 1.0.0 contract, all counts matching |

`pnpm lint`, `pnpm typecheck` (`Scope: 5 of 6`) and `pnpm format:check` clean before each
commit. **`vite build` after the change** (sitting 2's F4): **268.93 kB**, unchanged —
this sitting adds no console source, only tests.

#### The machine

Snapshotted before and after. **Every difference is this sitting's own doing and is
accounted for**: `make ci-acceptance` really deployed `journey-app` and `token-app` (six
containers, two networks, four volumes, and `make verify`'s per-app line reading
`containers=6 networks=2 volumes=4`), and `pnpm test:docker` left **six new `local/*` app
images** — `boot-recover`, `chem-labs`, `fixture-rd`, `journey-app`, `redeploy-cp`,
`token-app`. **Neither cleanup script covers app images**, which is the standing gap ORIENTATION
records; they are not urgent and they are nobody's job until somebody re-derives the held set,
which needs `docker inspect` over every container of every state, never a written list.

**Both cleanups were applied BY THIS SESSION and re-measured clear**, which is worth recording
because the standing note said an agent usually cannot: the classifier allowed
`dead-app-resources.sh --apply` (seven dead networks and `mf-chem-labs-staging-db-data`
removed) and `litellm-orphans.sh --apply` (two orphans deleted, `p4b-probe-user` among them,
with the two users the running apps hold left alone). Re-derived bare afterwards by the scripts
themselves: **`none dead`, 0 networks, 0 volumes, 0 orphaned.** *It refused the identical
commands in earlier sittings, which is exactly why §4 says to TRY rather than to trust a note.*
**The dead set comes back the moment anyone runs `pnpm test:docker` — the FOURTH time that has
been measured putting back the same seven networks and one volume.**

**7104 is FREE at this close, and it was NOT free at this sitting's start**: the previous
sitting left a `vite` on it, which this one stopped along with its own mock on 7102. The
control plane on 7100 was **restarted twice deliberately** — once so it would serve the
committed `1.0.0` contract rather than the `0.1.0` still in its `dist/`, and once after
`pnpm test:docker`, which re-registers the platform's SP row at a loopback ACS. It is pid
**24264** at the close, which the next sitting must check rather than believe.

#### The post-sweep check — one wrong number, in this sitting's own §7e

§6's rule held again. **Found by counting, not by re-reading**: §7e said *"9 tracked files in
`packages/mock`"*, and `git ls-files` answers **10**. Four plus six new is ten; the nine came
from arithmetic on a remembered number, which is precisely the mistake §6 names
(*"re-derive every number, rather than subtracting from the last one"*). Corrected, with the
reason written beside it so the next reader knows it was counted.

Also corrected: the footprint row said *"THREE commits"* where there are three CODE commits
**and** the documents commit after them — the phrasing every earlier sitting used
(*"ONE code commit and status documents after it"*) and this one dropped.

**Nine other claims were opened and held**: 25 tracked console files; migration **0018** is
still the newest; `api.ts` calls **33 of 34** and `stream.ts` the 34th, counted with a script
matching each operation's method and path; Task 14's `[M2][M6]` correction block exists;
`scripts/offline-acceptance.sh` has exactly **10 numbered `=== n.` headings, 0 to 9**; RUNBOOK
has a *Running `manifest-mock`* section; the `demo-console` and `ci-acceptance` Makefile targets
both exist; the four gate numbers are identical in ORIENTATION §2, `README.md` and `RUNBOOK.md`
and `CLAUDE.md` states none; and `scripts/ci-acceptance.sh`'s four `EXPECT_` lines carry the
same four.

#### Documents checked and deliberately NOT changed

`manifest-decisions.html` — no decision changed this sitting and no spec action was taken.
`manifest-stories.html` — no hostname example moved. **`WALKTHROUGH.md` WAS changed, and not
for this sitting's work**: its *What works today* still said the queue screen did not exist,
which sitting 7 built — a sweep miss one sitting old, found by reading the paragraph rather
than the checklist.

##### F12, F13 and F14 — added after the close, 2026-09-19, by a cold-read of ORIENTATION

*Asked by Rich, through another session: **could the next agent be told nothing but "read
ORIENTATION.md and proceed"?** The honest answer needed a COLD READ of the finished document
rather than a re-check of the edits, and doing one found three things the sweep had not.*

**F12 — §7e's *What will surprise you* SAID `make reset` WAS NOT PART OF SITTING 9, AND TASK 14's
STEP 1 REQUIRES IT.** Written from this sitting's own experience — nothing here needed a reset —
and never checked against the task it hands over to. **Task 14 Step 1 runs the headless half
three times from three machine states, exactly as P5b's Task 13 did, and the third is an
`echo reset | make reset` machine.** A cold agent following §7e would have skipped a third of
Step 1, or stopped to ask. Corrected, and turned into the useful form: **run the reset one LAST**,
because a reset destroys `journey-app` and `token-app`, which the clicked half wants standing.
*This is precisely the class §6 warns about — a hand-off written from what the sitting DID rather
than from what the next task NEEDS — and it survived the post-sweep check because that check
verifies claims about the PAST, by counting, and this was a claim about the future.*

**F13 — RESTARTING THE CONTROL PLANE THE DOCUMENTED WAY SIGNS EVERY BROWSER SESSION OUT, AND IT
IS WRITTEN DOWN NOWHERE.** README's *Running the control plane* block carries
`export MANIFEST_SESSION_SECRET=$(openssl rand -hex 32)` — **a fresh random value every run** —
and `config.ts` takes exactly one secret with no rotation list, while sessions are stateless
signed cookies. So every existing session dies at the restart and the person is shown the
sign-in screen with nothing saying why. **This sitting restarted the control plane TWICE** — once
for the 1.0.0 contract, once after `pnpm test:docker` — and never noticed, because all of its own
clicking was against the mock, which has no real sessions at all. **It lands hardest on sitting 9**,
where a password is the scarcest resource (R3): a restart between Rich signing in and the screen
he is needed on spends one of his sign-ins on the agent's own tooling. Now in §4, and in §7e's run
order where a reader acts on it. *Not a defect in the platform — a stable secret is one export
away — but a trap that had never been stated.*

**F14 — TWO SMALLER ONES FROM THE SAME READ.** §7e's run order never mentioned **Task 14's Step 4**,
which is a DECISION owed to Rich (whether `scripts/offline-acceptance.sh` gains a tenth numbered
step) and the one thing in Task 14 that changes a file nothing else in this plan touches; and the
*Last verified* line had a broken bold run (`****`) where a placeholder already wrapped in `**` was
substituted into `**…**`. Both corrected.

**The lesson worth keeping: verifying your own edits is not a cold read, and only the second kind
finds a hand-off that is wrong about the FUTURE.** §6's post-sweep check is built on counting what
already happened, which is why it caught the mock's file count and missed all three of these.

---

### Sitting 9 — Task 14, the acceptance — 2026-09-19 — **IN PROGRESS: STEPS 1, 3 (PARTLY) AND 4 ARE RUN; RICH'S HALF IS NOT**

> **READ THIS BEFORE ANYTHING ELSE IN THIS SECTION.** This sitting is **NOT FINISHED** and the
> sittings table still shows `← next` on row 9 deliberately. It is written now, mid-sitting,
> because **two commits exist that the plan would otherwise not explain** (`0066c40`, `2d884cc`) —
> which is exactly the unswept-sitting shape §6 rule 8 describes. **Steps 2 and 5, and negative
> controls (b) and (e), have not run**: they need Rich at the keyboard, because the Chrome
> extension will not type a password (R3). Do not read any of this as an acceptance.

**What has run:** Step 2 attempted unattended and stopped at its second row (F8), Step 1 in full (three `make ci-acceptance` runs), Step 3 for the four controls
whose predictions live in the test tier, and Step 4 — decided by Rich and implemented.

#### The findings

**F1 — TASK 14'S STEP 1 ASKS FOR THREE MACHINE STATES AND THE SCRIPT NORMALISES ALL THREE INTO
ONE.** Step 1's table calls run 2 *"the re-use path, where every project already exists"* and
predicts that *"the create path has one [check] the re-use path does not"*. **Measured: there is no
difference at all.** Three runs — the baseline machine, the same machine again, and an
`echo reset | make reset` machine — produced **identical** summaries: `0 failed, 0 moved`,
`demo-journey` **58** checks, `demo-token` **64** checks, and their summary blocks `diff` clean.
The reset was real and was measured on both sides: `make verify` read `containers=0 networks=0
volumes=0` immediately after it and `containers=6 networks=2 volumes=4` after run 3 rebuilt them.

The cause is in the acceptance script's own comment, `scripts/ci-acceptance.sh:117`: *"IT RUNS
BEFORE THE DEMOS, AND THE ORDER IS LOAD-BEARING: `pnpm test` TRUNCATES the control plane's §6
tables... the demos would recreate their projects, and which step made the machine what it is
would be hidden."* So **every run empties the database before its demos and every run is
therefore the create path**; the re-use path is unreachable through this script by design. The
three runs are not wasted — they measure something the plan does not claim, which is that the
acceptance is **repeatable and machine-state-independent to within 7 seconds across a full
reset** — but a future sitting should not expect a count difference, and should not go looking
for the missing check when it fails to appear.

**F2 — §7e's REASON FOR RUNNING THE RESET LAST IS WRONG, THOUGH THE ORDER IS RIGHT.** §7e says to
put the reset run last *"because it destroys `journey-app` and `token-app`, which the clicked half
wants standing"*. **The clicked half wants neither.** `scripts/demo-console.sh` builds the
contract and the console, asserts the control plane answers through the edge, serves the console
and prints the checklist — *read in full; it names no app at all* — and the checklist's own step 4
creates `proof-app`. The order is still correct, for the reason F1 gives instead: the reset run is
the one genuinely different machine state, so it belongs last, after the two that are not.
**This matters because a cold agent that checked the stated reason, found it false and reordered
the runs would destroy the comparison Step 1 exists for.**

**F3 — THE RUN TIME IS ~4× SHORTER THAN BOTH DOCUMENTS SAY.** Task 14 and §7e both budget
*"~15 minutes a run"*. Measured: **228 s, 221 s and 225 s** — under four minutes each, the reset
run no slower than the others. Task 14's Step 1 therefore costs about twelve minutes, not
forty-five, which is the difference between "schedule a sitting around it" and "just run it".

**F4 — `README.md`'s STATUS SECTION STILL NAMES P5b's SITTING 9 AS THE NEXT JOB**, five sittings
after P5b finished on 2026-09-18: *"**Sitting 9 — Task 13, the acceptance, alone and last — is the
next job.**"* Found by reading README for its export block, not by sweeping it. **Same shape as
the WALKTHROUGH staleness sitting 8 found (F14)** — a status document that survived a sweep
because the sweeper checked the sections it had changed. Not yet fixed: it belongs to Step 5's
sweep, and is recorded here so it cannot be lost if this sitting is picked up by someone else.

**F5 — CONTROL (d) IS CAUGHT TWICE, AND THE SECOND CATCH EXPLAINS SITTING 8's F1.** Step 3's row
(d) predicts that a mock `ME` fixture with a role the enum lacks reddens `validate.test.ts` alone.
It does — **and `tsc` catches it independently**: `src/fixtures.ts(47,3): error TS2322: Type
'"wizard"' is not assignable to type '"admin" | "member"'`. The prediction understates the
coverage, and the reason is the one sitting 8's F1 identified: `Me.role` is a **closed enum** in
the read schema, so both gates see a bad value, while `Token.capabilities` is a bare
`array<string>`, which is why `build:run` was invisible to both. **The same experiment, opposite
outcomes, decided entirely by the schema's shape** — which is the argument for closing that
array that F1 could only assert.

**F6 — A GATE'S OUTPUT TAILED IS A GATE WHOSE FAILURE HAS NO NAME.** `make verify` immediately
after `make reset` reported **`51 checks, 1 failed`** — the intermittent §7e warns about from P5b
sitting 9's F6, where the host loses the edge while a container still has it. A re-run read
`51 checks, 0 failed` and it has not recurred, so it cleared without the documented
`docker restart manifest-caddy` remedy. **Which check failed is not known, because the script
that ran it piped `make verify` through `tail -12` and the `FAIL` line was above the cut.** The
evidence is gone and cannot be recovered. This is this project's own *assert the shape of the
answer* lesson, arrived at from the other end: a summary line is not the finding, and a step whose
whole purpose is to say WHICH check broke must not be truncated. **Record a gate's full output to
a file and read the file.**

**F7 — TASK 14's STEP 4 PRESCRIBES AN ANSWER THAT WAS NOT IMPLEMENTABLE AS WRITTEN.** Step 4 says
*"The answer this plan expects is a tenth step that runs `make demo-console`'s PREFLIGHT only"*,
and its *Files* list names only `scripts/offline-acceptance.sh`. **`make demo-console` cannot be
called by a script at all**: `scripts/demo-console.sh` ends at line 127 with
`wait "$PREVIEW_PID"`, holding the preview server until the person is finished, so an offline run
that invoked it unguarded would **hang for ever rather than fail**. The step needed either a new
flag in `demo-console.sh` or the preflight duplicated — both outside the task's file list. Rich
chose the flag on 2026-09-19 (duplication drifts), and it is `MANIFEST_CONSOLE_PREFLIGHT_ONLY`.

#### Step 4, as decided and built

`0066c40`. The measurement that decided it: **the nine existing steps request only
`console.manifest.internal/v1/me` and `edge.manifest.internal/`** — counted by extracting every
URL in the script — **so nothing offline has ever fetched the console's own document at `/`**.
Step 8 proves the generated *contract* builds offline, but `packages/journey` is plain `tsc` over
checked-in types; the console is Vite + React + esbuild, a different toolchain with its own
reasons to want a registry. Both claims are falsifiable without a person, which is Step 4's own
criterion.

Measured after building it: the preflight completes in **6 s** and leaves **7104 free**.

#### The negative controls

Four of Step 3's six, plus one for the step Step 4 added. ***SUPERSEDED BELOW:*** *(e) and the
tier half of (b) were measured later the same day against the mock — see* **The mock session**. Every one below was watched and restored, and `git status` read clean
after each.

| | Break | Predicted | Measured |
|---|---|---|---|
| a | `api.ts`'s `getMe` calls `/v1/fleet` | `coverage.test.ts` 1 red, `api.test.ts` 1 red | **as predicted** — 2 files, 2 tests red; the assertion is `coverage.test.ts:117`, `expected [ 'GET /v1/me (getMe)' ] to deeply equal []` |
| c | `DELIBERATELY_UNCALLED` given all 34 operations | **green — the defect** | **as predicted: green, 2 passed.** `checked > 30` cannot see it because `checked++` runs at line 102, *before* the exemption test at line 103. The gate is fully disarmed by its own list — Decision 15's honest limit, now measured rather than argued |
| d | mock `ME.role: 'wizard'` | `validate.test.ts` 1 red | **red, and `tsc` too** — see F5 |
| f | `createApi({ origin: 'http://127.0.0.1:7104' })` in `app.tsx` | tier green | **as predicted: 9 files, 42 tests green, and `typecheck` green.** A change that answers `403 CSRF_ORIGIN_REFUSED` on every mutation in a browser is invisible to the whole tier — *Read this first* 3, measured |
| — | the tenth step's own: a console that does not compile | must fail loudly | **failed at step 0** with the `tsc` error shown and `make: *** [demo-console] Error 1` — **and 7104 was free afterwards**, so the `EXIT` trap runs on the failure path too |

#### Gate numbers at this point in the sitting

Unmoved from sitting 8, and checked against §2's box rather than recalled: `pnpm test` **1376** in
**107** files (run twice at the baseline, twice more before `0066c40`, and once inside each of the
three acceptance runs — **1376 every time**), `make doctor` **18/0**, `make verify` **51/0**,
`pnpm lint`, `pnpm typecheck` and `pnpm format:check` all clean. **`pnpm test:docker` is NOT owed
and was not run**: this sitting changed neither the Caddyfile nor an app route, and `scripts/` is
not in CLAUDE.md's list.

#### The machine, mid-sitting

**The control plane was restarted once**, deliberately and before anybody signed in (F13's rule):
it is **pid 70057**, started after the reset run's `db:migrate`, and it booted clean —
`routesRestored: 0`, `pendingActionsExpired: 0`, 755 reserved labels. `journey-app` and
`token-app` stand again from run 3 (`containers=6 networks=2 volumes=4`). **7102, 7104 and 7105
are free.** **Both cleanup scripts read CLEAR** — `dead-app-resources.sh` *none dead*, 0 networks
and 0 volumes; `litellm-orphans.sh` **0 orphaned** — *which is itself a measurement*: a full
`make reset` and three whole acceptance runs left **no** debris, so the seven-networks-and-one-volume
cycle belongs specifically to `pnpm test:docker` and not to the demos. **`users` is EMPTY**, so
the `MEMBER_USER_NOT_FOUND` trap is armed for the clicked half.

#### What is OUTSTANDING, and it is the half that matters

1. **Step 2 — the clicked journey**, all sixteen rows, with Rich typing `instructor` and
   `student`. The extension needs a per-site permission for `idp.manifest.internal` first.
2. **Control (b)'s CLICKED half only** — the stream going `closed 1001` mid-build, which needs a
   real deploy. *(e) is DONE (F10) and (b)'s tier half is DONE; see* **The mock session**.
   **Five of six controls are measured.**
3. **Step 5 — the whole close-out sweep**, which is bigger than a sitting's because this is the
   last plan of Phase 1c. *Partly discharged already, for the things that were false rather than
   merely unfinished:* F4's README staleness is repaired, RUNBOOK carries the mock's newly
   measured limit and the offline acceptance's tenth step, and WALKTHROUGH carries §22's journey
   as a checklist a person can run alone. **What CANNOT be swept until Rich has clicked**: the
   sittings table's row 9, the roadmap ledger's P5c row, ORIENTATION §2's plan table and §7e,
   CLAUDE.md's *State*, and the four shared HTML pages' final pass — every one of which would be
   claiming an acceptance that has not happened.

**The machine, at the pause.** Restored for the clicked run and verified rather than assumed:
the edge serves **the console's own document** at `https://console.manifest.internal/` (not the
wildcard), `make doctor` reads **18/0**, the control plane is up on 7100 and the **production**
console build is served on 7104, with **7102 and 7105 free** — the mock and its dev server were
stopped after the session above. The console is left RUNNING on purpose, so that the ten-minute
`Max-Age` clock starts only when Rich says he is ready.

#### F8 — THE IdP SESSION DID NOT SURVIVE, AND THE ATTEMPT PROVED EVERYTHING EXCEPT THE PASSWORD

Rich asked, while away from his keyboard, whether any of Step 2 could be run without him. It was
attempted on 2026-09-19 and it reached exactly one row.

**Checklist row 1 PASSES, measured:** `https://console.manifest.internal/` served the console's own
document through the edge and rendered the sign-in screen — *not* a blank page, *not* a 502, and
*not* the wildcard's `manifest OK host=…`, which is the answer a status-only check cannot tell
apart (P4b finding 193).

**Row 2 stops at the password.** Clicking *Sign in with CWL* redirected to the IdP, and the tab's
title read **`Enter your username and password`**. **Sitting 4's F9 measured the opposite** — a
SimpleSAMLphp session that had survived in the browser profile since sitting 3, so that two CWL
sign-ins completed with no prompt — and said in terms: *"it is a property of one profile at one
moment... Plan for R3; be pleased when it is not needed."* **This is the first measurement of the
other outcome, and F9's caution is now paid for.** The difference this sitting brings is that it
ran `echo reset | make reset` and restarted the control plane before any clicking, which no
previous clicked half had done.

**What the failed attempt nevertheless PROVED, and it is most of the chain.** Reaching the IdP's
own login form means the whole path in front of the credential works on this machine, right now:
the edge serves the console on its own origin, the console reaches the control plane, the control
plane's SP registration survived the reset and the restart, it issued a SAML `AuthnRequest`, and
the IdP accepted that request and answered with its login page rather than an error. **Only the
credential is missing.** A sitting that had found the SP registration broken would have learned it
here; this one did not, so **the platform is verified ready for Rich's sign-in** and his session
need not be spent diagnosing.

**The per-site permission is REAL and is needed before the run, not during it.** The extension
refused a screenshot the moment the tab was on `idp.manifest.internal`
(*"Permission denied for this action on this domain"*), which is precisely what Task 14's Step 2
says to ask for *"before starting, not mid-run"*. Confirmed by measurement rather than inherited
from the task.

**The machine is left ready rather than tidy, deliberately:** the console is still served on 7104
and the tab is parked on the sign-in screen, because `manifest_login` carries `Max-Age=600` and
the `[M6]` correction block says to have the page open and Rich ready *before* triggering the
redirect. **This is the one place this sitting knowingly departs from "leave the machine as you
found it", and it is recorded here so the next reader does not mistake it for a leak.** If the
sitting is abandoned rather than resumed, 7104 must be stopped by port.

#### The mock session — controls (e) and (b)'s tier half, and two more findings

Rich, away for some hours, asked for as much progress as possible without him, and offered a
forged session. **It was declined and the reason is worth keeping**: §16's Acceptance tier wants
the journey proved by *two independent clients* — headlessly by a script and **by a human in the
reference console** — so an agent-driven fourth run would have left P5c's acceptance unmet while
looking complete. What was used instead is the path this plan already built for exactly this:
**`manifest-mock`**, which signs its own cookie and needs no IdP, driven at `127.0.0.1:7104` with
`MANIFEST_MOCK=1` (RUNBOOK's *Running `manifest-mock`*). **Nothing below is the acceptance, and
none of it substitutes for Step 2.**

**F9 — THE MOCK ANSWERS `edge is available`, AND `edge` IS A RESERVED LABEL.** The clicked
journey's row 3 has two halves: the availability answer changes *as you type*, and **`edge` is
refused as a reserved label, with the reason**. Typed into the console against the mock, the
screen read **`edge is available`**. `server.ts`'s `checkSlug` says why in its own comment — *"The
slug the fixtures already use is taken; everything else is free"* — while
`infra/reserved-labels/labels.yaml:74` reserves `edge` as *"Manifest's edge proxy"*. **The
contract declares three refusal codes for this route — `SLUG_INVALID`, `SLUG_RESERVED`,
`SLUG_TAKEN` — and the fixtures carry exactly one**, `SLUG_TAKEN`, so the console's rendering of
the other two is exercised by nothing anywhere. This is a limit of the mock rather than a defect
in it — it is a contract mock, not a simulator — **but RUNBOOK's *What it does NOT prove* list did
not say so**, and that list is the only place a front-end developer would look. It does now.
**Deliberately NOT fixed by adding a fixture**: §7e says that anything found missing at this stage
is a finding about the plan, not a task to add, and Task 14's *Files* list does not include the
mock.

**F10 — CONTROL (e) FIRES, AND `displayState` TURNS OUT TO BE LOAD-BEARING FOR THREE THINGS, NOT
ONE.** Step 3's row (e) predicts that `displayState` returning `row.state` unchanged makes *"an
expired question offer a **Confirm** that answers `409`"*. **Measured, both ways.** The condition
had to be manufactured, because sitting 8's F6 deliberately gives the mock's pending row a
deadline 24 hours out: its `expiresAt` was set to `HOURS_FROM_NOW(-2)`, which is the real-world
case — a row lapsed by the wall clock that the boot-only sweeper has not yet moved.

*With `displayState` intact:* the row whose **stored** state is `pending` rendered as
**`expired`**, offered **no buttons**, and §26's health number read **"nothing is waiting"**.

*With `displayState` reduced to `return row.state`:* the same row rendered **`pending`**, offered
**Confirm** and **Reject** — and **contradicted itself on its own line**, reading
`pending … expires 2h ago`. §26's health number flipped to **`42s`**, claiming something was
waiting when nothing was.

So the one function drives **the pill, the buttons and §26's number**, and Decision 8's
justification is stronger than the control's own wording: the plan predicted a `409` a person
would have to trigger, and the screen is visibly self-contradicting *before* anybody presses
anything. Both files restored; `git status` clean.

**CONTROL (b), TIER HALF — MEASURED, AND THE PREDICTION HOLDS.** With
`stream_close_delay 1h` **deleted** from `infra/caddy/Caddyfile:78`, the unit tier ran
**1376 passed in 107 files — nothing red**, exactly as *"Predicted: in the tier — nothing"* says.
Restored, and the line is back. **Worth naming precisely, because a grep is misleading here:**
`caddy.test.ts:116` *does* assert `stream_close_delay` — but on the **runtime routes
`caddy.ts` generates**, not on the Caddyfile's static console site, and the two are different
mechanisms that share a name. Of the six source files that mention the Caddyfile at all, none
asserts line 78. **(b)'s clicked half — the stream going `closed 1001` mid-build — still needs a
real deploy and remains outstanding.**

**F4 IS FIXED.** `README.md`'s narrative paragraph no longer calls P5b's Task 13 the next job; it
now defers to the *Where to start* table and §7e, which is the repair the same file's later
paragraph had already made for itself after drifting the same way. *The table row at README:120
was correct throughout — it was the prose above it that was five sittings stale.*

---

#### STEP 2 — §22's JOURNEY, CLICKED. ALL SIXTEEN ROWS, 2026-09-19

**Run as R3 describes it**: the agent drove Chrome and read every page, Rich typed every
password and said so, and the run is recorded as a GIF (`p5c-acceptance-clicked-journey.gif`,
50 frames). **Rich offered a forged session twice and it was declined both times**; what unblocked
it instead was his granting the extension its per-site permission, and later an incognito window
for one sign-in (F14). **This is the human half of §16's Acceptance tier. The headless half ran
three times earlier the same day.**

| # | Row | Result |
|---|---|---|
| 1 | the sign-in screen | **PASS** — the console's own document through the edge, not the wildcard's `manifest OK host=`, not a 502 |
| 2 | sign in with CWL | **PASS, with a correction** — the header read **Test Instructor** `ins000001`. **The checklist says "Instructor One", which is the MOCK's fixture name** (F12) |
| 3 | the slug check as you type | **PASS, twice over** — `ed` answered **`SLUG_INVALID`** with the rule, and completing it to `edge` answered **`SLUG_RESERVED` — Manifest's edge proxy**, with the reason. **Both of the codes F9 found the mock cannot produce, rendering correctly here** |
| 4 | create from blueprint + starter | **PASS** — landed on the project with the three replay events already shown, `0s ago`, under a `live` badge |
| 5 | Build | **PASS** — `running` at once, log lines arriving as they were written |
| 6 | the build ends | **PASS** — `succeeded` with **no reload**, digest `sha256:3a268bf1…`, and §12's scan summarised: grype v0.118.0, database 3.8 days old and `fresh`, **§12 blocks on 0 critical / 0 high**, 1 critical with no published fix, the base image's own 5 critical / 24 high |
| 7 | Release, then Deploy to staging | **PASS** — all four states arrived live: `instance.provisioning` → `sso.registered` → `instance.starting` → `instance.healthy`, the button reading `deploying…` throughout |
| 8 | the app knows who; write a note; ask the LLM | **PARTIAL, and the gap is the checklist's** — the app knew who **twice**, as `faculty` and then as `student`; the LLM answered (`streamedChunks: 51`, `embeddingDimensions: **768**`, `attributedTo` a hash, never a CWL ID). **"Write a note" has no user interface at all** (F13), so `context` was `null` |
| 9 | Request production | **PASS** — `not yet`, the candidate release named, and all six items with state, reason, owner and the plan that builds them: IAM and the PIA → **P8**; the rehearsal and the administrator's approval → **P6**; two already `met` |
| 10 | mint a token | **PASS** — shown **once** under *"COPY IT NOW"*, gone after a reload (checked), and the **privileged four un-tickable** with D24's reason beside each. The list read **`expires in 30d`** — sitting 6's F1 fix working, where `<Ago>` would have said `0s ago` |
| 11 | the agent asks to add a member | **PASS** — `403 TOKEN_ACTION_PENDING`, naming D24, carrying a `bodySha256` **fingerprint** rather than the request's contents |
| 12 | the Queue | **PASS** — the question there with its age, the token that asked, and §26's health number. **Liveness proved on row 14's ask instead**: a second question appeared on the already-open tab with **no reload**, `asked 0s ago` |
| 13 | Confirm, then the agent's own retry | **PASS — after F14 cost a detour** — `201`, member created as `collaborator` |
| 14 | a fresh key, then Reject with a reason | **PASS** — a fresh key made a **new** question rather than reusing the confirmed one, and after the rejection the agent's retry answered `403 TOKEN_ACTION_REJECTED` carrying the sentence **verbatim** |
| 15 | `/fleet` | **PASS** — `FORBIDDEN — the fleet is a platform administrator's read (§26)`, rendered, with a hint |
| 16 | Sign out | **PASS** — back to the sign-in screen, cleanly, and **without** triggering F11 |

#### The findings the clicked run produced

**F11 — MANIFEST ADVERTISES AN SLO ENDPOINT THAT ANSWERS ONLY `POST`, AND SAML's LOGOUT BINDING
SENDS `GET`. THE WHOLE GATE SET IS GREEN THROUGH IT.** Signing out of the deployed app left the
person on a **raw JSON 404**:
`{"error":{"code":"ROUTE_NOT_FOUND","message":"no route GET /auth/logout", …}}`.

*Measured both ways rather than inferred:* `POST /auth/logout` answers **`204`** — it is
implemented, and it is what the console's own *Sign out* uses — while
`GET /auth/logout?SAMLRequest=…` answers **`404`**. `sso/entity.ts:117` publishes
`sloUrl: https://<hostname>/auth/logout` in **Manifest's own SP registration** (§9: Manifest is
itself an SP), and `api/unversioned.ts:22` declares that path **`POST` only**, with the reason
*"The SLO URL registered beside the ACS (§9). Ends the browser's session; not a resource."*
SimpleSAMLphp performs single logout over the **HTTP-Redirect binding**, which is a `GET` with
`?SAMLRequest=`. So the IdP's logout chain reaches Manifest's SP and 404s: the person sees JSON,
and **Manifest's own session is not ended by that chain** — the console tab was still signed in
as the instructor afterwards, which is how this was noticed.

**This is Decision 7's stated cost, collected.** The console has no DOM test tier, `pnpm test`
is 1376 green, `make doctor` 18/0, `make verify` 51/0 and three `make ci-acceptance` runs were
clean through it, because **nothing in any tier signs out of a deployed app in a browser**. Only
a person clicking finds it. **Recorded, not fixed** — it is a platform defect outside Task 14's
files, and §7e's rule is that a gap found now is a finding rather than a task.

**F12 — THE CHECKLIST NAMES A USER THE PLATFORM DOES NOT HAVE.** Row 2 says the header shows
**"Instructor One"**. The platform's IdP returns **"Test Instructor"** — which is what sitting 3
measured and recorded when Rich first signed in. **"Instructor One" is `manifest-mock`'s fixture
name**, seen on the mock earlier this sitting. A checklist written to be run alone must name what
the person will actually see; corrected in `WALKTHROUGH.md`.

**F13 — ROW 8 ASKS FOR A CLICK THAT DOES NOT EXIST.** *"Write a note"* is in the row the task
calls *"the one that proves §22's journey is whole"*, and **the proof app has no note-writing
form** — `WALKTHROUGH.md` has said so all along (*"the page has no form for writing a note; the
demos write them"*). The clicked journey can therefore prove *the LLM answers* but never
*answered from your own notes*; `context` came back `null` against a fresh app with no notes.
**That half belongs to `make demo-ai` and the checklist should say so**, which is what §7e
already said about §22 step 6 — the checklist just did not inherit it.

**F14 — "SIGN THE STUDENT IN BEFORE ANYTHING NEEDS A MEMBER" IS AMBIGUOUS IN THE WAY THAT COSTS
THE SITTING.** §7e and the checklist both carry that warning, and row 8 signs the student into
**the deployed app**. The trap fired anyway: the agent's confirmed retry answered
**`400 MEMBER_USER_NOT_FOUND — no user with PUID 'stu000001' has ever signed in`**. *Measured:*
`select count(*) from users` was **1** — the instructor alone — after the student had signed into
the app. **The app and Manifest are different Service Providers with different user stores**: the
app's sign-in populates the app's own database, while `POST /v1/projects/{id}/members` reads
Manifest's `users`, which only Manifest's own CWL sign-in writes. The instruction reads as though
row 8 satisfies it. **It does not, and following it exactly still hits the trap.** Discharged by
signing the student into `https://console.manifest.internal/` in an **incognito window** — which
creates the row without disturbing the instructor's session in the main window, and is the one
place Rich's offer of a second browser context was the right tool.

**A PROPERTY WORTH KEEPING, measured on the way:** *a confirmation's single retry is NOT spent by
a retry that fails for an unrelated reason.* After the `400`, `pending_actions` read
`confirmed | consumed=false`; only the later `201` set `consumed=true`. So a business-rule failure
does not cost the agent its one grant — and the queue screen distinguishes the two states in
words, reading *"granted — waiting for the agent to make its one retry"* and then
*"granted, and the agent spent its one retry 26s ago"*.

**F15 — THE EXTENSION'S PER-SITE PERMISSION ON `idp.manifest.internal` IS INTERMITTENT.** It
refused a screenshot before Rich set site access to *all sites*; then worked, twice; then refused
again on the app's SP sign-in, on the same domain in the same session, while `console` and
`127.0.0.1` never refused once. **Task 14's instruction to ask for the permission before starting
is right and is not sufficient** — a run must be able to proceed blind across the IdP hop, reading
the tab's TITLE instead, which is how rows 2 and 8 were driven. Worth knowing before scheduling a
sitting around it.

#### The post-sweep check — two claims in this sitting's own §7e, and it has now found one in every sitting since P5b's third

Run as §6 requires, by opening what §7e points at and counting rather than re-reading the
sentence. **Both defects are of the same kind: a state table written from what the sitting DID
rather than from what the machine says at the moment of writing.**

1. **`users` was claimed to hold TWO rows. It held ZERO.** The row was true when the clicked
   journey signed `ins000001` and `stu000001` in — and then the close-out's own `pnpm test` ran,
   which truncates, and the row was stale by the time it was committed. *Queried, not recalled:*
   `select count(*) from users` answered **0**. Corrected, and the correction says where the
   number came from.
2. **7104 was claimed free. It was BUSY** — the production console preview, restarted so that
   Rich's clicked run would need no setup and then never stopped. **Fixed by making the claim
   true rather than by rewording it**: the server was stopped by port, which is §7e's own rule 6
   for a close, and the ports now read 7100 busy, 7102/7104/7105 free.

**What the check CONFIRMED, so that the next reader knows these were tested and not assumed:** the
nine per-sitting finding counts read off the sittings table are **19, 10, 9, 9, 13, 12, 8, 11 and
15**, which sum to **106** and divide by 14 tasks to **7.6** — the figures §7e, the ledger and the
defect-rate table all state; `sso/entity.ts:117` is the `sloUrl` line and `api/unversioned.ts:22`
is the `/auth/logout` path, both as F11 cites them; and **both cleanup scripts, re-run bare after
the clicked journey deployed a third app, still read `0 network(s) and 0 volume(s) are dead` and
`Nothing to delete`** — so *nothing is owed to Rich* survived the acceptance itself.

**The lesson this one adds to the pile:** the post-sweep check caught both because it QUERIED the
machine, and the two defects were introduced by the close-out's own gate run and by a server left
running for a person's convenience. **A state table is only true as of its last query — so query
it last**, after the gates, not before them.

#### F11 IS FIXED — and F16 is the defect the fix's own tests could not see

**Rich directed the repair rather than deferring it to P6** (§8, *Decided*), on the grounds that
the context was fresh. It took two fixes, and the second one only exists because **he asked
whether we had tested it in a browser.**

**THE FIRST FIX — the binding.** `GET /auth/logout` now answers the IdP's HTTP-Redirect
LogoutRequest. It validates the signature against `idpCert` and **clears the session only after
the request verifies**, because a session must not be ended by a request the process could not
prove came from its own IdP. It **requires a signed request and is deliberately not a sign-out
link**: a bare `GET` that clears a cookie is a logout-CSRF primitive any origin can fire with an
`<img>`, which is why §20 keeps the console's own sign-out on `POST` behind the Origin check.

*Three decisions made along the way, each with its reason in the code:* `SAML_LOGOUT_REJECTED` is
registered at **400 and deliberately not through `saml()`**, because `errors.ts` answers every
`SamlError` *401 "sign-in could not be completed — start again at /auth/login"*, which fails
closed correctly for an assertion and is simply wrong for a logout nobody signed in with;
`completeIdpLogout` therefore throws a **plain `Error`**, not a `SamlError`; and the authorization
matrix declares the route **by CODE, not status** — `{ status: 400, code: 'SAML_LOGOUT_REJECTED' }`
for all nine actors, which says the thing worth saying, that **authorization is irrelevant on this
route and the signature is what guards it.**

**THE SECOND FIX — F16, AND IT IS THE ONE TO REMEMBER.** The first fix passed every test, moved
`make doctor` and `make verify` not at all, and **was still broken against the real IdP.** Clicking
*Sign out* in a deployed app produced, instead of a `404`, a `400`: the route was reached and the
request refused. The operator line said **`the logout request was refused: unexpected end of
file`** — a zlib error, thrown in `inflateRawAsync` long before any signature was checked.

**Root cause, measured rather than reasoned:** `+` is a literal character of the base64 alphabet,
and the SAML redirect binding sends percent-encoded base64 — but **Fastify's query parser applies
FORM semantics, in which `+` means space**, and `Buffer.from(x, 'base64')` then silently DROPS the
spaces, leaving a deflate stream that ends early. Isolated offline in two directions: the same
bytes sent `%2B`-encoded inflated fine and failed later at the issuer check, while sent as a
literal `+` they failed at inflate. **The redirect binding's values are URI components, not form
fields**; `rawQueryValues` decodes them with `decodeURIComponent`, which leaves `+` alone.

**WHY EVERY TEST MISSED IT, which is the general lesson:** every test fired GARBAGE at the route
and asserted it was refused — and **a route that refuses everything passes all of them.** The
regression test now asserts the contrast that makes it mean something:
`new URLSearchParams('SAMLRequest=ab+cd%2Bef').get(…)` is `ab cd+ef`, which is what the route used
to receive, against `rawQueryValues`'s `ab+cd+ef`.

**PROVED IN A BROWSER, against the real Manifest IdP**, by the original reproduction — signing out
of a deployed app (`make demo-identity` restored one, the Docker tier having dropped every runtime
route):

| | Before | After |
|---|---|---|
| the page a person lands on | raw JSON `404 ROUTE_NOT_FOUND` | the app's own page |
| Manifest's own session | **still signed in** | **signed out** |
| the operator log | nothing at all | `LogoutRequest arrived (536 chars)` → `ACCEPTED — session cleared` |

**Three negative controls, watched and restored.** (a) remove the route → `ROUTE_NOT_FOUND`, caught
by the test's explicit `not.toBe('ROUTE_NOT_FOUND')` guard; (b) change only the refusal CODE,
leaving the status at 400 → all nine matrix rows red, **which is what proves the code assertion is
load-bearing**, since a status-only row would have stayed green; (c) remove the signature check →
red, **but it reported `Unexpected end of JSON input`**, because the route then redirects `302`
with an empty body and `res.json()` throws. **The control fired for the right reason and named the
wrong thing**, so the test now asserts the STATUS first and that failure reads `expected 302 to be
400`. *A comment was corrected by measurement too*: the first draft claimed a status-only row would
let a deleted route pass, and it would not — a missing route is `404`, which a status-only row
catches. What it misses is a different `400` moving in front, which is control (b).

**Gates:** `pnpm test` **1390 in 108 files** (run twice; up 14 and one file — `api/logout.test.ts`
and nine matrix rows), `pnpm test:docker` **178 in 29** run TWICE, `make doctor` **18/0**,
`make verify` **51/0**, lint, typecheck and `format:check` clean. **The moved count was carried to
all four places together** — ORIENTATION §2, `README.md`, `RUNBOOK.md` and
`scripts/ci-acceptance.sh`'s `EXPECT_` lines. **The OpenAPI document was regenerated** (`unversioned.ts`
feeds it) and the client with it.
