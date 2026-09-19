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
| 4 | 5–6 | **My projects, and creating one** — the slug check while it is typed, the blueprint and starter catalogue, §24's audience (§22 step 2) — and **the project screen with its live event stream** (§22 step 3) | ← **next** |
| 5 | 7–8 | **A build whose log lines arrive as they are written** (§22 step 4) and **a deploy to staging whose instance states arrive the same way**, with the app's URL to click and an Incident when it fails (§22 steps 5–6). **Both streaming screens; the sitting Rich was warned is the heavy one** | |
| 6 | 9–10 | **Request production** — `LaunchReadiness` with its blocked items and why (§22 step 7) — **the fleet** (§26, admin only), and **delegated tokens**: minted once, listed, revoked | |
| 7 | 11 | **§26's queue as a screen**: the question an agent asked, who asked it, how long it has waited, confirmed or rejected by a person in their own words. **The first time D24's loop is operated by a human rather than by `curl`** | |
| 8 | 12–13 | **`manifest-mock`** — the contract served from fixtures with scripted streams, validated against the document, and the console driven against it with no platform — and **the CI acceptance script**, the operation-coverage gate and `@manifest/contract` `1.0.0` | |
| 9 | 14 | **The acceptance**: the journey clicked by a person and run headlessly by the script, over one contract, with its negative controls. **Alone, and last** | |

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
