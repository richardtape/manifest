# Before Faculty Use It For Real — Implementation Plan

> **WRITTEN 2026-09-30, IN PARALLEL WITH THE LAUNCH PATH PLAN'S SITTING 5, AT RICH'S WORD** (*"Now, in parallel"*,
> answering *"When should the next plan be written?"*). Its scope is Rich's, decided the same afternoon in the planning session
> `manifest-00` (*Decided by Rich*, below — each in his words). **Every fact in *Read this first* was read from the code at
> `50425de` while the launch path plan's sitting 5 had uncommitted edits in `ai/`, `db/`, `observability/`, `projects/`,
> `tokens/` and `api/`** — so line numbers there WILL have moved by the time this plan runs, and Task 1 re-measures each one
> marked *(T1: M<n>)* into `spikes/faculty-ready-baseline/`. **Four spec actions are drafted below; none is applied; no task a
> spec action changes runs before Rich has read and decided its words.** **APPROVED by Rich, 2026-09-30** (*"plan looks good"*), seven sittings as proposed. **The execution method is his, chosen when the plan starts** (*"I'll decide on implementation strategy at the time. Probably not subagent driven though."*): ask him at sitting 1's open. **Approving the plan approves no spec action**: each of the four is read and decided before the sitting that builds it.
>
> **AMENDED 2026-10-02, AT RICH'S WORD** (*"add them to the faculty-ready plan"*): **FE-51 and FE-52 join as Tasks 12 and 13**, in
> sittings 2 and 4. The faculty front-end's F6b sitting 1 measured both on 7100, and the platform session `manifest-96` checked them in
> the code (*Read this first* 18–19). **They are numbered in the order they were added, not the order they run.** Task 11 is still the
> acceptance, alone and last, and the plan still has seven sittings. Neither needs a spec action.
>
> **AMENDED AGAIN THE SAME NIGHT, AT SITTING 1'S OPEN** (Rich, through the question tool: F7, FE-49 and FE-50, *"All into
> faculty-ready"*). **FE-50 joins Task 12**, because it rewrites the same remedy text as FE-51. **FE-49 joins Task 13.** **F7 is Task 14,
> in sitting 2.** The plan now has 14 tasks in seven sittings. None of the three needs a spec action. The same message placed FE-46,
> FE-47 and FE-5 AFTER this plan, and chose inline execution (*Decided by Rich*).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native) or superpowers:subagent-driven-development, **whichever Rich chooses at sitting 1's open** (2026-09-30: *"Probably not subagent driven though"*). Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9, which both of those skills will push you against.

**Goal:** Close what stands between the platform and a real faculty member's first day. **A faculty app on a sibling host cannot plant a session** in a colleague's browser (FE-28, widened to the login and step-up cookies). **Every answer carries a request id, and every refusal leaves an operator line** a support report can be matched to (FE-30). **A refusal about a limit says whose, how much and when it lifts, as fields** (FE-29). **The platform's test blueprint is not offered to people** (FE-31). **A provider's `422` reaches the client as a `422`, never `200 null`** (F8). **Faculty apps run on `node:24-alpine`**, **with an init that reaps orphans**, and **the IdP's session store stops using the Postgres superuser**. And **an administrator acting on another person's project gives a reason, which the project's people see** (§26's non-repudiation, which nothing enforces today). **A name reused on a reset machine is refused for what it is**, never answered with a race that did not happen (F7). **An agent's question ends when its token does**, so nobody is told *confirmed* for a request that nothing can retry (FE-52). **The refusal that asks the question names what the platform matches**, the request and not its key (FE-51), and **who may answer it** (FE-50). **A token says who minted it** (FE-49).

It is proved by `make demo-faculty-ready`, on either driver, through `@manifest/contract`. A person clicks it too.

**Architecture:** Twelve small, independent changes, and one medium one. They are grouped so that each contract-touching sitting bumps nothing twice.
- **The contract goes to `1.6.0` ONCE**, at Task 3, the first schema change. Everything after it stays `1.6.0`.
- **The request id is Fastify's own `request.id`**, generated as a UUID. It is set as a header in `onRequest`, carried into every refusal body by ONE `sendRefusal` helper, and logged by the same helper.
- **The cookie names are chosen per origin scheme**: `__Host-` on `https`, the plain name on loopback `http` (the Docker tier and the mock), so no `http` test origin loses its session.
- **The administrator's reason is one request header**, enforced in `registerRoutes`. It is carried into every event the request publishes by an `AsyncLocalStorage` context, and stored on `audit.events` in three new columns.
- **The `422` fix is a second hook in the same LiteLLM guard.** The `node:24` move is `images.txt`, `make seed` and a digest in two blueprint descriptors. `Init` is one line in `hardenedHostConfig`. The IdP store's role follows `ssp_ro`'s precedent in `ensure-idp-sql.sh`.
- **FE-51 and FE-50 are text.** **F7 is driver 2's existing refusal, moved into driver 1.** **FE-49 is one field.** **FE-52 reuses what the archive already does**: `expirePendingActions(tx, EVERY_QUESTION, { tokenId })`, run on the two other paths that revoke a token. A question's life is also capped at its token's expiry. One event, `pending_action.expired`, is published only when a person's act ended the question, never when the clock did.

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0 (host), Fastify 5.12.3, Drizzle over Postgres 16, `zod/v4` for the API, Vitest 2.1. LiteLLM **1.98.0** (`infra/images.lock:9`, pinned by digest). SimpleSAMLphp **v2.5.3.1** (`manifest-idp`). Docker Desktop **29.7.2** (`docker info`: `InitBinary=docker-init`). **No new external package.**

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read these sections:
- **§20**: *Machine-actionable errors* and *Credential classes (D24)*;
- **§22**: D23.7 and D23.8 (the sign-in endpoints sit outside the versioned contract);
- **§25**: the descriptor;
- **§12**: *Container hardening* (the list at l.1420);
- **§9**: *Registration hardening*, for the IdP's two roles;
- **§21**: the Postgres row;
- **§26**: *Non-repudiation*;
- **§6**: the `Event`, `DelegatedToken` and `ProjectMember` rows;
- **§7**: *Classification gates model routing*, its last three paragraphs.

**The four spec actions below change §26, §6, §25, §20 and §12.**

**Roadmap:** *The faculty front-end's message*, FE-28 to FE-32 (confirmed by Rich 2026-09-30), and ORIENTATION §8's older *Open* items that Rich placed here the same day.

**Predecessor:** [`2026-09-29-launch-path.md`](./2026-09-29-launch-path.md). **This plan starts only after its sitting 12 closes.** Its *What this plan does not build* is an input list; the items this plan takes are named in *Decided by Rich*.

**Also landed before this plan (out of plan, at Rich's word 2026-09-30):** Mailpit (§21's tenth container, 7111/7112). **It moves `make doctor` and `make verify`**, so read the current gate numbers from `scripts/ci-acceptance.sh`'s `EXPECT_` lines, which are their one statement since the 2026-09-30 document trim.

**Successor:** FE-32, *an agent can add a dependency*: an operation that resolves a `package-lock.json` through the platform's mirror (Rich, 2026-09-30: *"(a) Faculty-ready → FE-32 → vuln DB"*). Then the vulnerability database in the console.

---

## How this plan is to be executed — sittings, one per session

**One sitting per session, with a check-in at each boundary.** This plan commits after every task.

> **SEVEN SITTINGS, PROPOSED.** Task 1 is first and alone. The three envelope changes share sitting 2, so the contract moves
> once. The cookie rename is alone, because it reaches every client and the sibling repository. The two Docker-heavy
> infrastructure changes pair up, and so do the two that need Rich's hands (the network for `make seed`, a key in `.env`). §26's
> reason is alone and LAST, by Rich's word (*"its own sitting, last in the plan"*), so it never holds the small ones. The
> acceptance is alone and last. *Offered, and not recommended:* **six** — Tasks 7 and 9 inside sitting 4 — which puts three
> changes that each restart a container into one session's Docker tier.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Spec action needed first | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements**: `__Host-` cookies over `http` and through curl; Fastify's ids on every refusal path; LiteLLM's post-call hooks against a `422`, **streamed and not**, in a THROWAWAY LiteLLM; `Init` beside `ReadonlyRootfs` and `CapDrop ALL`; §26's reachable mutations; the gate numbers | No | — | |
| 2 | 2, 3, 4, 12, 14 | **FE-31, FE-30, FE-29**: fixtures unlisted; a request id on every answer and every refusal logged; a limit's facts as fields — **contract `1.6.0`**. **FE-51 and FE-50** (Task 12, after Task 4): the pending-action hint names what is matched and who answers. **F7** (Task 14): driver 1 refuses a create over a repository already on the machine | Yes — `blueprints/`, `source/` | **2** (§25), **3** (§20) | |
| 3 | 5 | **FE-28, widened**: `__Host-` session, login and step-up cookies on https; the plain names on loopback http; every client and script; the sibling repository told first | Yes — `identity/` | — | |
| 4 | 6, 8, 13 | **F8**: a `422` answers `422`, streamed too. **`Init: true`**: an init reaps an app's orphans. **FE-52 and FE-49** (Task 13): a revoked or expired token's questions expire, and a person's act that ends them says so; a token names its minter | Yes — `ai/`, `infra/`, `runtime/`, `observability/` | **4** (§12) for Task 8 | |
| 5 | 7, 9 | **`node:24-alpine`** for the blueprints (`make seed`, the network, at Rich's yes). **The IdP store's own role** (a key Rich adds to `.env`) | Yes — `build/`, `blueprints/`, `infra/` | — | |
| 6 | 10 | **§26's administrator reason**: enforced centrally, stored with the actor, shown to the project's people | Yes — `projects/`, `observability/`, `api/` | **1** (§26, §6) | |
| 7 | 11 | **The acceptance**: `make demo-faculty-ready` on either driver, three times on each; every other demo; the offline acceptance's new step; **a clicked half**; the plan's one whole-branch review. **Alone, and last** | Yes, if any code changes | — | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. **The four gates**, from the repository root: `pnpm test` (twice, alone), `pnpm lint`, `pnpm typecheck` and `pnpm format:check`. Add **`pnpm test:docker`** whenever the table says it is owed. **The test budget is LEAN** (ORIENTATION §8 *Decided*): no open run on an unchanged tree, single files while fixing, and the whole suite twice on the FINAL tree at the close.
2. **A dated entry in *What executing this plan found*.** It lists every defect with the measurement that found it, and every negative control, including which could not fail and why. It ends with the gate numbers and the machine, queried at the close.
3. **This plan's sittings table.** Mark the sitting done and move the `← next` marker. State no findings count here.
4. **The close-out sweep in ORIENTATION §6.** The gate numbers live in `scripts/ci-acceptance.sh`'s `EXPECT_` lines (the one statement since 2026-09-30); the other documents point at them.

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Moving task boundaries is Task 1's job. **If a measurement breaks the split, say so to Rich before sitting 2.** Three rules survive any re-cut:
- Task 1 stays first and alone.
- Task 11 stays alone and last.
- No task that a spec action changes runs before Rich has decided that spec action.

---

## Decided by Rich — build them, do not re-open them

**Each was said by Rich on 2026-09-30, in the planning session `manifest-00`, answering a question put with its context, its options and a recommendation.** The session's record is `docs/superpowers/2026-09-30-decisions.md` (written at the boundary after the launch path plan's sitting 5; until then, that session's scratchpad).

- **WHAT FOLLOWS THE LAUNCH PATH** — *"(a) Faculty-ready → FE-32 → vuln DB (Recommended)"*: this plan, then FE-32 as its own plan, then the vulnerability database in the console. It replaces his 2026-09-29 placement *"FE-30 and FE-28 in a sitting of their own after it"*.
- **FE-29, FE-31 AND FE-32 CONFIRMED** — *"Confirm all three (Recommended)"*, each option (a). FE-28 and FE-30 were his already (2026-09-29). **FE-32 is the NEXT plan, not this one.**
- **FE-28 — THE PACKAGE** — *"Package (Recommended)"*:
  - `__Host-` names on https origins, and the plain name only on loopback http;
  - **`manifest_login` and `manifest_stepup` also `__Host-`, with `Path=/`** (the login-CSRF route by cookie tossing);
  - contract **`1.6.0`, a minor, with the break stated**. The cookie is issued by the sign-in endpoints, which D23.8 puts outside the versioned contract; `/v1`'s `securitySchemes.session` documents its name and changes with it;
  - clearing a `__Host-` cookie carries `Secure`.
- **FE-31 — FILTER THE LIST** — *"Filter the list (Recommended)"*: `listed: false` on `fixture-node`; `listBlueprints` omits it; it still resolves, so the demos and every existing project keep building.
- **F8 — "(b) next plan; (a) meanwhile (Recommended)"**: a hook in `manifest_guard.py` turns LiteLLM's `null` into the provider's `422`. It is measured first, and documented as a refusal until it lands.
- **THE 401/403/404 FALLBACK — "Confirm (Recommended)"**: only `400`, `413` and `422` go back to the client. This plan changes nothing there, and its Docker case must keep asserting it.
- **LITELLM'S LEAKS — "All four leaks (Recommended)"**, a TRACKED item for **before production**, and NOT in this plan: `x-litellm-model-api-base`, `x-litellm-model-name`, the body's underlying `model`, and `llm_provider-*`. Keep `x-litellm-attempted-fallbacks`.
- **§26'S ADMINISTRATOR REASON — "The design (Recommended)", "its own sitting, last in the plan"**:
  - **Who:** a platform administrator who is **not a member** of the project, using an **owner's** capability.
  - **Exempt:** the administrator's own duties (`release:approve`, `launch:record`, `quota:set`), and an administrator who is a member.
  - **How it is carried:** a `Manifest-Admin-Reason` header, enforced centrally, refused `400 ADMIN_REASON_REQUIRED`, and inside the idempotency fingerprint.
  - **Tokens:** asked **once at a token's mint**.
  - **Where it is stored:** `audit.events` gains `actor_user_id`, `acted_as_admin` and `reason`.
  - **Where it is shown:** the project's stream. Deploy, build and validate start naming who acted. The reason is redacted and capped at 500 characters.
  - **A spec action for §26's words** (Spec action 1).
- **`node:24-alpine`, `Init: true`, THE IdP STORE'S OWN CREDENTIALS** — Rich chose all three for this plan (*"Which older §8 items join the next plan?"*: all four offered).
- **THE EXTERNAL TRACK IS DEFERRED** — *"We can defer this. I have to get all of this working first locally. And then show demos."* Nothing in this plan raises it.
- **FE-51 AND FE-52 JOIN THIS PLAN** — Rich, 2026-10-02: *"add them to the faculty-ready plan"*. This answered `manifest-96`'s report of the faculty front-end's F6b sitting 1 measurements, which the code had confirmed. **Their designs are this plan's Decisions 16 and 17, not his**: re-open either only if Task 1's `[M7]` breaks a premise. The front-end's write-ups are in `~/Developer/manifest-app/docs/api-findings.md`, under *FE-51* and *FE-52*.
- **AT SITTING 1'S OPEN, 2026-10-02** (through the question tool; recorded in `../2026-09-30-decisions.md`):
  - **FE-46, FE-47 AND FE-5:** *"After faculty-ready"*, the draft's option (b). His 2026-09-30 order stands: this plan, then those three, then FE-32. Their spec actions stay drafted (`2026-10-01-fe46-fe47-fe5-spec-actions.md`). **Nothing of them is built here.**
  - **THE EXECUTION METHOD:** *"Inline (Recommended)"*, `superpowers:executing-plans`.
  - **F7, FE-49 AND FE-50:** *"All into faculty-ready"*. FE-50 joins Task 12, FE-49 joins Task 13, and F7 is Task 14. Their designs are Decisions 16–18.
- **Carried from earlier plans, still binding:**
  - D24's privileged four, and the person-only class;
  - step-up for production deploys, approvals, member management and production secrets;
  - every refusal asserts its code;
  - a model key is answered once and never stored;
  - **the front-end is told before any commit to `packages/contract` or `packages/mock`.**

---

## What Rich does, and when

1. **Review this plan, and approve or re-cut its seven sittings.**
2. **Read and decide the four spec actions**, each before the sitting that builds it: **2 and 3 before sitting 2; 4 before sitting 4; 1 before sitting 6.**
3. **The network, and his yes, at sitting 5** for `make seed` to pull `node:24-alpine`, which mirrors it into the local registry.
4. **One key in `.env` at sitting 5**: `SSP_STORE_PASSWORD`. Task 9 prints the exact line to add (`openssl rand -hex 24`); `make doctor` fails until it is there.
5. **`make refresh-vulndb`** if it is past due when sitting 7 runs, because the acceptance launches.
6. **The clicked half, sitting 7**:
   - he signs in on `console.` and `app.`, and his browser shows the `__Host-` cookie;
   - he is shown a refusal's reference;
   - as `operator`, he acts on `instructor`'s project and is asked for a reason;
   - as `instructor`, he reads it.

   **He types every password.**

---

## Read this first — what this plan knows from the code

*Read at `50425de` on 2026-09-30 by two read-only surveys and the planning session. Task 1 re-measures each (T1: M<n>).*

**FE-28 — the cookies.**
1. `identity/session.ts:3` has `SESSION_COOKIE = 'manifest_session'`. Its options come from one helper, `api/routes/auth.ts:92-103` `sessionCookie(maxAge, origin)`: `httpOnly`, `sameSite: 'lax'`, `secure: origin.startsWith('https://')` and `path: '/'`.
   - It is **set** at sign-in (`auth.ts:317`) and at step-up's re-sign (`:252`).
   - It is **read** by the credential hook (`api/server.ts:268`), CSRF's `carriesSession` (`api/csrf.ts:35`), the step-up callback (`auth.ts:214`) and `POST /auth/logout` (`:483`).
   - It is **cleared** at `:461` and `:486` with `{ path: '/' }` and **no `Secure`**, which a browser refuses for a `__Host-` name, silently (T1: M1).
2. **The same literal is hard-coded** in `api/contract/document.ts:416` (`securitySchemes.session.name`), and so in `openapi.json`. It is **exported** by `packages/contract/src/client.ts:5` (used by `stream.ts:82`).
3. **Everything else that names it** (about 107 lines in 26 files):
   - **The mock** has its own constant (`packages/mock/src/server.ts:54`), and its login sets `manifest_session=mock-session`.
   - **The demo scripts** (`scripts/demo-{journey,token,production,releases,github,authoring,frontend}.sh`) read `$6=="manifest_session"` from curl jars, and so does `scripts/lib/event-stream.mjs:19`.
   - **The tests:** `api/projects.test.ts` (38 lines), `api/auth.test.ts` (16), `api/logout.test.ts` (9), `api/csrf.test.ts`, `identity/saml.docker.test.ts:352-525`, and `api/testing.ts:148-153`, which types a jar as `Record<typeof SESSION_COOKIE, string>`.
   - **The sibling repository `~/Developer/manifest-app`:** its server's `whoIs` (`packages/server/src/identity.ts`, which refuses two `manifest_session` cookies), its tests, and its five `check-*.sh` scripts.
4. **`http` origins cannot hold a `__Host-` cookie.**
   - The Docker tier boots control planes at `http://127.0.0.1:7189` and `http://localhost:7189` (`identity/saml.docker.test.ts:193-198`).
   - `auth.test.ts:363-378` pins *"a loopback http origin sets no Secure"*.
   - The mock serves `http://127.0.0.1:7102`, and the front-end's mock mode is `http://127.0.0.1:7105` (T1: M1).
5. **`manifest_login` (`identity/login-state.ts:8`) and `manifest_stepup` (`identity/step-up.ts:15`) are `Path=/auth`**, and the login cookie is unsigned `nonce.base64(returnTo)`.
   - A sibling `<slug>.manifest.internal` can set one with `Domain=manifest.internal; Path=/auth`, carrying its own nonce.
   - It can then auto-post its own assertion to the CSRF-exempt ACS (`auth.ts:185`), and the victim is signed in as the attacker. That is FE-28's harm, by the other door.
   - **A `__Host-` cookie must be `Path=/`**, so both move to `/`.

**FE-30 — the request id.**

6. `api/server.ts:208` builds `Fastify({ logger: false, frameworkErrors })` with no `genReqId`. Fastify's default is a per-process counter (`req-1`), which is useless as a reference. `request.id` exists even for `frameworkErrors` (`fastify.js:647`). Keep `requestIdHeader` off, so no client can put an id into the log.
7. **Every place a refusal leaves** (T1: M2):
   - `setErrorHandler`, including its early 401 branch (`server.ts:346-360`);
   - `frameworkErrors` (`:215-219`), where **hooks do not run**, so it must set the header itself;
   - `setNotFoundHandler` (`:399-410`);
   - webhooks' local `refuse` (`routes/webhooks.ts:91-94`);
   - SLO's local `refusal` (`routes/auth.ts:360-370`);
   - the HTML refusal page (`api/auth-page.ts:43-76`).

   **Fastify's error path deletes only `content-type` and `content-length`**, so a header set in `onRequest` survives everything but `frameworkErrors`.
8. **The operation is not visible to the error handler.** `registerRoutes` (`api/contract/route.ts:204-215`) passes no `config`, and `operationId` lives in closures (`:282`). Add `config: { operationId }`, and read `request.routeOptions.config.operationId`.
9. **The envelope** is `api/representations/errors.ts:21-61`, and in `openapi.json` its `error` object has **`additionalProperties: false`**, so `requestId` is declared before anything sends it.
   - `toErrorResponse` (`api/errors.ts:149`) has no request.
   - Only two tests pin a whole envelope: `api/auth-page.test.ts:60` and `api/source-commit.test.ts:301`.
   - `requestId` already means the SAML AuthnRequest id in `api/auth.test.ts:149-447`, so do not collide with it in helpers.

**FE-29 — a refusal's facts.**

10. All five codes are `AgentSessionError(code, message)` with no payload (`ai/sessions.ts:51-59`), mapped at `api/errors.ts:730-735`.

| Code | Thrown | Facts at hand |
|---|---|---|
| `AGENT_BUDGET_EXHAUSTED` | `ai/sessions.ts:~201` | `monthly` and `spentUsd`; `personSpend` already returns `resetsAt` (nullable; `ai/agent-keys.ts:246-292`), not destructured |
| `INTAKE_BUDGET_EXHAUSTED` | `ai/intake.ts:73-80` | `intakeSpend` returns `resetsAt`, **discarded**; `deps.intake.monthlyUsd` |
| `INTAKE_DAILY_LIMIT_REACHED` | `ai/intake.ts:111-116` | `deps.intake.dailyKeys`, counted in SQL at `:104` over `date_trunc('day', now() at time zone 'America/Vancouver')` |
| `AGENT_SESSION_ALREADY_STARTED` | `api/routes/agents.ts:211-225` | the stored `session.id` and `session.name` |
| `INTAKE_SESSION_ALREADY_STARTED` | `api/routes/intake.ts:66-78` | `session.id` only — **an `IntakeSession` has no name** |

**FE-31 — the list.**

11. `blueprints/registry.ts:96-157` loads every directory under `MANIFEST_BLUEPRINTS_ROOT`, and `list()` returns them all. `listBlueprints` (`api/routes/blueprints.ts:70`) maps `list()`.
    - `api/blueprints.test.ts:24` expects `['fixture-node@1', 'node-ts-mongo@1']`.
    - **The mock already lists only `node-ts-mongo@1`** (`mock/src/fixtures.ts:307`).
    - **`fixture-node@1` is in published EXAMPLES**: `routes/blueprints.ts:40-50`, `fleet.ts:31,71`, `lifecycle.ts:56`, `project-reads.ts:87,114,188,593`, `projects.ts:169,176,490`, `builds.ts:246`, and `observability/examples.ts:38,106`.
    - About 60 test files, `make demo` (`scripts/demo.sh:73,108`) and `make demo-frontend` (`journey/src/frontend.ts:98,492`) create projects from it, and they must keep working.

**F8 — the `422`.**

12. `infra/litellm/config.yaml:86` sets `drop_params: true`. LiteLLM's OpenAI provider retries a `422` once without the dropped parameters (`llms/openai/openai.py:861`; the stream at `:1041/:1081`). A second `422` leaves the loop without a `return`, and the proxy answers `200` with a body of `null`.
    - The **global** setting wins over a deployment's.
    - Only OpenAI-compatible deployments are affected: the capable model, not `ollama_chat`.
    - The provider's own `422` is swallowed, so **any fix can only send a fixed message**.
13. **Two hooks can see the `None`** (T1: M3):
    - **(A)** `async_post_call_success_deployment_hook` (`utils.py:1798`), per attempt. A raise there is a failed attempt, which the existing guard then refuses to fall back from.
    - **(B)** `ProxyLogging.post_call_success_hook` (`proxy/utils.py:2331`, a plain `CustomLogger`'s `async_post_call_success_hook` at `:2420-2427`), whose exceptions are **re-raised** to `_handle_llm_api_exception`.
    - **BOTH SKIP STREAMS** (`utils.py:1763` returns early). **The faculty front-end streams every call** (its F5 sitting 2), so what a STREAMED `422` answers today is this plan's first question.
    - The pinning test is `ai/fallback-guard.docker.test.ts:361-381`, `KNOWN (F8)`: `200`, text `'null'`, no fallback header, two stub hits. `REFUSED = [400, 413]` is at `:65`.
    - **Never touch the running `manifest-litellm` to measure**: build a throwaway from the pinned digest.

**`node:24-alpine`.**

14. `infra/images.txt:4` and `images.lock:3` pin `node:22-alpine`.
    - **The blueprints pin the REGISTRY's single-arch digest, not the lock's**: `blueprints/node-ts-mongo/blueprint.yaml:22-27` and `blueprints/fixture-node/blueprint.yaml:19-22`, each `base_image: manifest-registry:5000/base/node@sha256:1ef15d33…`.
    - `node-ts-mongo/agents/AGENTS.md:7` says *"Node 22 on Alpine"*, and so does the example at `api/routes/blueprints.ts:134`.
    - `packages/github-fake/Dockerfile:2`, `build/scan.docker.test.ts:54-82` (its finding counts measured on 22) and `routing/testing.ts:43` use `node:22-alpine` **by tag, offline**, so 22 stays in `images.txt` beside 24.
    - **`doctor.sh:415` and `verify.sh:1156` check the REPOSITORY `base/node`, not the tag**, so a missing `24-alpine` passes both.
    - The skeletons' `engines` say `>=22.0.0`, which is compatible. node:24 ships npm 11, which reads the lockfiles' `lockfileVersion: 3`.

**`Init`.**

15. `runtime/docker/hardening.ts:17-40` `hardenedHostConfig` has no `Init`, and it is used only by `instances.ts:253-265`. Services and egress are separate and out of scope.
    - `hardening.test.ts:13-26` asserts fields one by one.
    - `s6.docker.test.ts:452-459` orders probe 15 before 11 **because orphans are never reaped**; probe 11 is at `:546-570`.
    - **With an init, SIGTERM reaches Node as a non-PID-1 process**:
      - a hibernation's `stop?t=10` (`instances.ts:327`) ends in under a second;
      - the recorded exit code becomes `143` (`instances.ts:378` feeds §14's exit reason) (T1: M4).

**The IdP store.**

16. `infra/idp/config/config.php:85-87` has `store.sql.username => 'manifest'`, and `manifest` has `rolsuper=t`.
    - SimpleSAMLphp's `SQLStore.php` creates its own tables on first use (`simplesamlphp_tableversion` and `simplesamlphp_kvstore`), and needs only SELECT, INSERT, UPDATE and DELETE afterwards.
    - **Today both tables are in `public`, owned by `manifest`, and `ssp_ro` can read the session store** through its blanket SELECT.
    - The precedents are `infra/lib/ensure-idp-sql.sh` (`ssp_ro`, its password through `PGOPTIONS`) and `ensure-app-role.sh`, both run by `make up` after `compose up --wait`.
    - `verify.sh`'s `DELETE FROM simplesamlphp_kvstore` must then name the schema.
    - `doctor.sh:~479`'s `.env` check fails until the new key is in `.env`.

**§26.**

17. `projects/authz.ts:433-444`: `PLATFORM_ADMIN = [...OWNER, 'release:approve', 'launch:record', 'quota:set']`, returned first for any administrator. **`assertCapability` skips the membership lookup for an administrator** (`:633-640`: `projectRole = admin ? null : membershipOf(…)`), so *"is this another person's project?"* is not computed today.
    - **`audit.events` has no actor column** (`db/schema.ts:990-1066`; `:999-1004` deferred it to *"P4b or P5"*). Its columns are `id, project_id, subject, type, machine_detail, human_message, created_at`: append-only by grant, types in a CHECK.
    - The precedent for a reason is `audit.role_changes` (`:1141-1159`): `actor text` and `reason text NOT NULL`, with `check(length(trim(reason)) > 0)`.
    - **Publishes, naming the actor:** `updateProject`, `createCommit`, `setAppSecret`/`clearAppSecret`, `addMember`/`removeMember`, `mintToken`, `archiveProject`/`restoreProject`/`deleteProject`, `runRehearsal`, `startAgentSession`, `confirmPendingAction`/`rejectPendingAction`, and the two approval decisions.
    - **Publishes, naming nobody:** `deploy` (`releases/release.ts:442-452`), `startBuild` (`releases/build.ts:137-150`), `validateSpec` (`api/spec-validation.ts:134-143`), and `endAgentSession`'s ender (only in `machineDetail`).
    - **No event at all:** `createRelease` and `createApprovalPreview`.
    - `revokeToken` is minter-only.
    - An administrator can mint a token on a project they are not a member of (`mintToken` needs `project:write`).

**INHERITED FROM THE LAUNCH PATH PLAN'S SITTING 12 (2026-10-02 — its last; the plan is EXECUTED).** Its *Sitting 12* is the record.
- **The advisory locks are on pools of their own** (its F1 and F4): `db/client.ts`'s `lockPool` (environment locks) and `outerLockPool` (project
  and rehearsal locks, which hold an environment lock inside). Before them, ten or more environments deadlocked a restarted control plane at
  boot. Anything new that holds a lock or a connection while it waits for another must not share a pool with what it waits for.
- **A lapse ends a registration** (its F3): entering `expired` clears `registered_at`; a change request filed from `active` keeps it.
- **F7 — TASK 14 SINCE 2026-10-02's SITTING 1 OPEN** (Rich: *"All into faculty-ready"*; first recorded at his *"record that as a better error message needed"*): a person creating a
  project whose slug an ORPHAN bare repository still holds (left by a truncation or `make reset`) is answered `409 SOURCE_CONFLICT` *"main
  moved while this commit was being made"* on driver 1 — a race that did not happen, and nothing they can act on. Driver 2 answers
  `SOURCE_REPOSITORY_EXISTS`. A real faculty member meets it on the first day a name is reused on a reset machine. Rich places it.
- **`make demo-launch`** exists on either driver (RUNBOOK); this plan's acceptance runs beside it, and its `DEMO_LAUNCH_SLUG` override is
  `launchpath-*` only. Four minors were deferred by that plan's review (M1 instances left `destroying`; M3–M5 the demo's own) — its record.

**FE-51 AND FE-52 — ADDED 2026-10-02.** `manifest-96` read them from the code at `d5c76d5`. The faculty front-end's F6b sitting 1
(`manifest-app-30`) measured them on 7100, contract `1.5.0`. Task 1 re-reads each (T1: M7).

18. **FE-51 — the hint names a key that the platform does not match.**
    - A confirmed question is matched by `tokens/pending.ts`'s `resolutionFor()` (`:282-309`) on the token, the `method`, the `path` and
      `bodySha256`. **No key is involved.** The confirm route's own description agrees (`api/routes/pending-actions.ts:282`: *"same token,
      method, path and body"*).
    - **The wording that names the key** (*"same body, same Idempotency-Key"*):
      - `TOKEN_ACTION_PENDING`'s hint (`api/errors.ts:391`);
      - its remedy (`api/error-codes.ts:268`), which is published into `openapi.json` and `docs/api/reference/{errors,operations}.md`;
      - `journey/src/example-pending.ts:21`, which is generated into `docs/api/agents.md:88`;
      - the hand-written guide line `docs/api/agents.md:59`;
      - `journey/src/token.ts:653`'s step label.

      **The mock carries no such hint** (grep of `packages/mock/src`).
    - **Measured:** after a confirm, a retry under a NEW key passed (`201`, `consumedAt` set), and the ORIGINAL key afterwards opened a NEW
      pending action. A refused request stores nothing under its key (`api/idempotency.ts:73-77`: a handler that throws stores nothing),
      so the original key is not bound to the `403` either.
19. **FE-52 — a revoked token's question stays open, and a yes to it does nothing.**
    - **Three paths revoke a token, and only one expires its questions.**
      - The archive does: `releases/lifecycle.ts:435-436` runs `revokeTokensOf`, then `expirePendingActions(tx, EVERY_QUESTION,
        { projectId })` (the front-end enablement plan's Decision 28).
      - `revokeToken` does not (`api/routes/tokens.ts:333-367`, `revokeToken(deps.db, …)` with no transaction).
      - A member's removal does not (`api/routes/project-reads.ts:590-598`, `revokeTokensOfMember` inside the removal's transaction).
    - **A token that EXPIRES leaves its questions open too.** A question lives `PENDING_ACTION_TTL_MS`, 24 hours (`tokens/pending.ts:23`,
      `:153`), whatever its token's own `expiresAt`.
    - **The confirm route never asks whether the token is still a credential.** It checks the row's `state` and the row's own expiry
      (`pending-actions.ts:113-126`). The rule it skips is stated once, in `stillACredential` (`tokens/actor.ts:75-84`): a token that is
      revoked, expired, or whose project is not active is no credential.
    - **Measured:** an owner confirming a revoked token's question is answered `STEP_UP_REQUIRED`, then `200 confirmed`. The token's
      retry is `401 UNAUTHENTICATED`, and `consumedAt` stays `null`. **No event says that a token was revoked.**
    - **`expirePendingActions` publishes no event, deliberately** (`tokens/expiry.ts:25-30`): expiry is a clock passing, and has no actor.
      A revoke, a removal and an archive each do have an actor.
    - **What the spec already says:** §6's `PendingAction.state` already includes `expired`, and §11 already says an archive expires its
      project's pending actions. **The spec names no `pending_action.*` event** (grep), so a new one needs no spec action.
    - **What the front-end does meanwhile** (its F6b Decision 16): its *Agents* card asks only about a question whose token is active, and
      its own *[Revoke]* rejects that token's waiting questions first. **What is left:** a token revoked anywhere else keeps its question
      in the front-end's band for up to 24 hours.
20. **FE-50 and FE-49 — who answers, and whose token.** Placed at sitting 1's open.
    - **FE-50:** the remedy (`api/error-codes.ts:268`) and `docs/api/authentication.md:50` say *"the person who minted it confirms"*. The
      confirm route asks `assertCapability(deps.db, actor, row.projectId, action)` (`api/routes/pending-actions.ts:90`): anyone who holds
      that capability on the project, which is an owner or an administrator, and never a collaborator. The front-end measured it in F6b
      sitting 1: a collaborator cannot answer even their own agent's question.
    - **FE-49:** `Token` (`api/representations/tokens.ts`) has no field naming its minter, yet only the minter may revoke it
      (`api/routes/tokens.ts:345`, `row.userId !== actor.userId`, answered `404`). So a client cannot tell which tokens a person may revoke. The
      contract names a person in two shapes: `createdBy: Uuid` (`representations/releases.ts:75`) and `requestedBy: { id, displayName }`
      (`:402`).
21. **F7 — a create over a repository already on the machine.** Placed at sitting 1's open.
    - **Driver 1** (`source/local-driver.ts:219-265`) runs `git init --bare` on the slug's path whether or not it exists. git re-initialises
      an existing repository silently. The seed is then pushed with `base: null` onto a `main` that already has history, and the create
      is answered `409 SOURCE_CONFLICT`, *"main moved while this commit was being made"*.
    - **Driver 2** (`source/github/driver.ts:838-843`) refuses first: `existsSync(mirror)` answers `SOURCE_REPOSITORY_EXISTS`, *"never reused or
      removed by a create"*. That code's remedy (`api/error-codes.ts:689-692`) names GitHub and a mirror, not driver 1's repository.
    - **The driver contract** (`source/driver-contract.ts`) is the suite both drivers run.

**The contract.** It is **`1.5.0`** in three places, held equal by `api/contract/document.test.ts:56-63`. Additive changes bump the minor (`document.ts:20-61`). The launch path plan takes no bump, so **this plan's Task 3 makes it `1.6.0`**, once.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.6.0`, AT TASK 3**, the first schema change. Tasks 4, 5, 10, 12 and 13 add to it. *Rejected:* a bump per task, which would make four versions the sibling repository has to adopt in a week.
2. **THE REQUEST ID IS A UUID FROM `genReqId`**, the `x-request-id` header on EVERY answer, and `error.requestId` **required** in the envelope. A client can rely on it, and the mock sends one.
   - *Rejected:* an optional field, since a support report must never lack it.
   - *Rejected:* a short code, which the front-end already makes (its reference) and records beside ours.
   - **`requestIdHeader` stays off.**
3. **EVERY REFUSAL GOES THROUGH ONE `sendRefusal(request, reply, status, error)`** in `api/refusal.ts`. It merges `requestId`, writes the operator line, and sends. The error handler, the 401 branch, `frameworkErrors`, the not-found handler, webhooks' `refuse`, SLO's `refusal` and the HTML page call it. *Why:* six hand-built refusals are six places to forget the id.
4. **THE OPERATOR LINE IS ONE JSON LINE PER REFUSAL** on stderr: `{ level: 'warn', msg: 'refused', requestId, at, method, operation, status, code }`. `level: 'error'` is used for 500s, which keep their existing stack line.
   - **Never the message, the hint, a body, a header or a URL's query**: a message may carry a slug or a person's words.
   - `operation` is the route's `operationId`, or `${method} ${routeOptions.url ?? 'unmatched'}`.
5. **A LIMIT'S FACTS ARE `error.limit`**: `{ scope: 'person' | 'platform', period: 'day' | 'month', resetsAt: string | null, amountUsd?: number, count?: number }`.
   - `count` is for the daily limit, a count of sessions; `amountUsd` is for the two budgets.
   - `resetsAt` is **nullable**, because LiteLLM's can be.
   - **The daily `resetsAt` is computed in the SAME SQL statement as the count**, so one clock decides both (BC's clock-change legislation against Node's tz data; ORIENTATION §8).

   **A started session's facts are `error.session`**: `{ id: string, name: string | null }`, where `name` is `null` for an intake session.
6. **FE-31 IS A DESCRIPTOR FIELD, `listed`**, default `true`. `fixture-node` says `false`; `listBlueprints` filters; `resolve`, `getBlueprint` and the build path are untouched. **The published examples move to `node-ts-mongo@1`**, so no example teaches a client an unlisted blueprint.
7. **COOKIE NAMES BY ORIGIN SCHEME**, from one function, `cookieNames(origin)` in `identity/cookie-names.ts`:
   - `https` gives `{ session: '__Host-manifest_session', login: '__Host-manifest_login', stepUp: '__Host-manifest_stepup' }`;
   - `http` gives the plain names.

   Every setter, reader and clearer asks it, from `originOf(request)`, the origin the request arrived on (the front-end enablement plan's Task 8). **The login and step-up cookies move to `Path=/`.** **Every clear carries `secure` when the origin is https.**
   - **`@manifest/contract` exports `sessionCookieFor(baseUrl)`** beside a deprecated `SESSION_COOKIE`; the stream helper uses it.
   - **The mock keeps its plain name**, because it is http only. The same rule, applied, changes nothing there, and the front-end's mock mode is untouched.
   - *Rejected:* refusing http origins, which ends the Docker tier's sign-in cases.
   - *Rejected:* a `__Secure-` prefix, which still admits `Domain=`.
8. **A LEFTOVER PLAIN `manifest_session` ON AN HTTPS ORIGIN IS IGNORED**, never ambiguous. The reader reads only the scheme's name, so a browser holding both after the rename is signed out once, not refused.
9. **F8's FIX IS A SECOND HOOK IN THE SAME GUARD**, chosen by Task 1's `[M3]`:
   - **Branch A:** a success deployment hook, if a raise there reaches the client as `422`, because it rides the existing fallback refusal.
   - **Branch B:** the proxy's post-call hook, raising `ProxyException(type='invalid_request_error', code=422)`.
   - **A STREAMED `422` is fixed too, or the sitting stops and asks Rich**: the front-end streams every call.
10. **`node:24-alpine` IS ADDED BESIDE `node:22-alpine`**, never replacing it. The blueprints' `base_image` moves to 24's registry digest, read after `make seed`. The blueprint major version stays `@1`, since no real faculty app exists. Each app's next build moves to 24, and a rollback keeps 22's image.
11. **`Init: true` ON APP CONTAINERS ONLY** (`hardenedHostConfig`). Services and egress are unchanged. An exit code of `143` after a stop is recorded as a stop, never a crash, if `[M4]` finds it would be otherwise.
12. **THE IdP STORE IS A ROLE THAT OWNS A SCHEMA**: `ssp_store` owns `ssp_store`, with `ALTER ROLE ssp_store SET search_path = ssp_store`, so SimpleSAMLphp's own DDL creates its tables there.
    - The old `public` tables are dropped by the ensure script, once. **Everyone signs in to the IdP again**, and that is said in the sitting's record.
    - `ssp_ro` has no grant on the new schema.
    - *Adjacent and NOT in scope:* `MANIFEST_IDP_DATABASE_URL`'s superuser (the control plane's SP-row writes). It is named in *What this plan does not build*.
13. **§26's CONTEXT IS AN `AsyncLocalStorage`** (`observability/acting.ts`), entered in `registerRoutes`' preHandler after the actor is known. `publish()` reads it, so every event the request causes, including a build's later ones, carries the actor.
    - *Rejected:* threading an actor through about 25 call chains.
    - *Rejected:* stamping only the route's first event, because it is the build that did the thing.
    - **The reason is shown on events whose `acted_as_admin` is true.**
14. **§26 APPLIES TO MUTATIONS ONLY.** A read is not an action. `GET`s are exempt, so an administrator's look at a project needs no reason.
15. **§26's REFUSAL IS DECLARED BY ONE FUNCTION**, `refusedWithoutAdminReason(route)`, beside `refusedWhenArchived` (`authz.ts:667-674`): every mutating route whose capability is an owner's.
16. **FE-51: THE CODE IS RIGHT, AND THE WORDS MOVE TO MATCH IT** (added 2026-10-02). The hint, the remedy and the guides say: *"once they
    have, send the identical request again from this token — the same method, path and body; the confirmation lets it through exactly
    once, whatever its Idempotency-Key"*. The final wording is the task's, within that meaning.
    - **FE-50 rides with it** (sitting 1's open). The same words say who answers: *"a person who could do it themselves (an owner, or
      for `quota:set` an administrator) confirms or rejects it in the console"*, never *"the person who minted it"*. **The words follow
      the code**, because a collaborator who minted the token does not hold the four capabilities, and D24's point is that a person who
      COULD do the thing decides. *Rejected:* changing the code to the minter only. That would make a collaborator's agent's question
      unanswerable.
    - *Why:* a person confirms what they were shown, which is the request. The body's hash is what binds the confirmation to it.
    - *Rejected:* (b), binding the confirmation to the original key too. That needs the key stored on the row (a migration), adds no
      protection, since only the same token can spend the confirmation, and turns a lost key into a question asked twice.
    - *Cost to change course:* text only.
17. **FE-52: A TOKEN'S QUESTIONS END WHEN THE TOKEN DOES, AND A PERSON'S ACT THAT ENDS THEM SAYS SO** (added 2026-10-02). Three parts,
    each reusing a mechanism that already exists.
    - **Revoking expires.** `revokeToken` and a member's removal call `expirePendingActions(tx, EVERY_QUESTION, { tokenId })` for each
      token they revoke, **in the same transaction as the revoke**. This is the archive's rule, Decision 28 of the front-end enablement
      plan, applied to the other two paths. `revokeToken`'s revoke moves into a transaction for it.
    - **Expiry is capped.** A question's `expiresAt` becomes `min(now + PENDING_ACTION_TTL_MS, the token's expiresAt)` when it is asked.
      The existing sweep and the confirm route's expiry check (`409 PENDING_ACTION_RESOLVED`, `expired`) then cover a token that runs
      out, with no new check.
    - **One event, `pending_action.expired`**: `{ pendingActionId, tokenId, action, cause: 'token_revoked' | 'member_removed' |
      'project_archived', by }`. Its sentence names the person, and the event is **published after the commit**, one per question, by
      the three paths that have an actor. The archive's path gains it too, so the rule is one rule.
      - **The clock sweep stays silent**, for `tokens/expiry.ts:25-30`'s reason: expiry has no actor. A front-end tells a token that ran
        out from `listTokens`' `expiresAt`.
    - *A confirm that commits before the revoke* leaves a `confirmed` row that nothing can spend. **Left as it is**: the person decided
      while the token was live, and the `UPDATE`'s `state = 'pending'` clause makes the two writers' order the only answer.
    - *Rejected:* (a) a read-side check only, `stillACredential` at confirm and list. The stored state would still read `pending`, which
      `tokens/expiry.ts:14-16` says §26's queue must not, and the front-end's band would still get no event.
    - *Rejected:* (b) the front-end's `token.revoked` event. Every client would then have to work out which questions died; the
      question's own event is what the band already listens for.
    - *Rejected:* (c) leaving it.
    - *Cost:* a new event type is one contract addition under `1.6.0`, one `audit.events` CHECK migration, and the front-end told
      before the commit.
    - **FE-49 rides with it** (sitting 1's open): `Token` gains **`mintedBy: Uuid`**, *"who minted it; only they may revoke it"*. It is
      the shape `createdBy` already uses, and what a client compares with `getMe`'s `id`. *Rejected:* `{ id, displayName }`, which costs
      a join on every list for a name the client already has for its own person.
18. **F7: DRIVER 1 REFUSES AS DRIVER 2 DOES** (added at sitting 1's open). `createRepository` checks `existsSync(path)` BEFORE `git
    init`, and throws `SOURCE_REPOSITORY_EXISTS` with a message naming the slug and *"on this machine"*. The remedy's meaning widens to
    *"a repository of that name already exists, on GitHub or on this machine"*. **The repository is never re-initialised, reused or
    removed**, which is driver 2's Decision 16 carried across. The case goes in the driver contract, so both drivers are held to it.
    - *Rejected:* removing a leftover repository on create. Its history may be the only copy of somebody's work after a truncation.
    - *Cost to change course:* one check, and one case in the driver contract.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec, or from a dated measurement.

- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm format:check`. Run **`pnpm test` twice** on a sitting's final tree. Never with `--filter`.
- **`pnpm test:docker`** (~20 min; needs `make up` and the chat model warm; **fails rather than skips**) is owed by any change to `runtime/`, `routing/`, `services/`, `build/`, `releases/`, `identity/`, `sso/`, `secrets/`, `projects/`, `blueprints/`, `spec/`, `ai/`, `observability/`, `launch/`, `source/`, `infra/`, or any `*.docker.test.ts`.
  - **Run it in the background, never beside a Vitest run.**
  - Then restart the control plane, run the three cleanup scripts, and run `make verify`.
  - **Count `docker network ls -q | wc -l` before it.**
  - **Run it from a shell where `MANIFEST_SOURCE_DRIVER` and every `MANIFEST_GITHUB_*` is unset** (`.env` carries driver 2).
- **One file**, from the repository root: `pnpm exec vitest run --project unit src/<path>`. **Never two Vitest processes at once.**
- **`pnpm test` TRUNCATES the control plane's tables**, and so do one file and `pnpm contract:write`.
- **Vitest strips types.** `pnpm typecheck` is the only gate that sees a type, and `exactOptionalPropertyTypes` is on.
- **A route or envelope change is four commands, in order**: the definition, `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write`. The generated files are never edited by hand.
- **A migration is `pnpm --filter @manifest/control-plane db:generate`, then READ what it wrote**, then APPLY it before the unit tier. Drizzle rewrites `audit.events`'s CHECK itself. A backfill is `db:generate --custom`.
- **PUBLISHED TEXT CITES NO SECTION, DECISION OR PLAN** (Rich, 2026-09-30: *"we don't need to see in the API docs … section or plan
  numbers. They're irrelevant to the person reading the docs"*): every route, field, schema, tag, error and event description, and
  every guide, says what is true now in its own words: no `§n`, `Dnn` or `Cn`, no plan, sitting or `FE-n`, no maintainer notes.
  The launch path plan's sitting 10 removed the old ones and widened `api/contract/docs.test.ts` to hold it; this plan's new text
  (the cookie names, `requestId`, `limit`, `session`, `ADMIN_REASON_REQUIRED`, `EventFrame.actor`) must pass it. **Code comments
  are not covered**: a later plan of their own (Rich).
- **EVERY REFUSAL ASSERTS ITS CODE** (`refusal()` from `api/testing.ts`). This plan adds `400 ADMIN_REASON_REQUIRED` (Task 10), with its meaning and remedy in `api/error-codes.ts`.
- **A REFUSAL TEST NEEDS A POSITIVE CONTROL IN THE SAME FILE**, and so does a negative claim.
- **Never accept a check you have not watched fail.** Each task ends by breaking what it built after committing, **predicting** what goes red, then restoring.
- **Every task names its CALLER.**
- **AN OPERATOR LINE NEVER CARRIES** a cookie, a token, a key, a secret, a request body, a message, a hint, a `note` or a reason. A test asserts it by grepping the captured stderr.
- **The faculty front-end links `packages/contract` and runs `packages/mock` from THIS working tree.** Before a commit touching either: `ListAgents`, message its live `manifest-app-…` session, and commit after its reply or a fair wait. **Task 5 changes its code too.** It must be told the new cookie names and `sessionCookieFor` BEFORE the commit, and given time to adopt.
- **COMMIT ON `main`, STAGE YOUR OWN PATHS BY NAME**; never `git add -A`, `.` or `commit -a`. Run `git status` before each commit.
- **Config files are single-file bind mounts** (`infra/litellm/`, the IdP's `config.php`). Edit in place, restart the container, and read it back with `docker exec … cat` (ORIENTATION §4 trap 18).
- **Never touch the running `manifest-litellm` to measure.** A throwaway from the pinned digest, on its own port and network, removed afterwards.
- **These four containers must survive:** `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`. **`caddy-data` must never be destroyed.**
- **Never edit the spec** without Rich's word on the spec action. **Never touch Laravel Valet.** **Ask before `sudo`**; no task needs it.
- **macOS: bash 3.2 and a BSD userland; the tool shell is zsh.** Run multi-line probes with `bash <file>`.
- **`request.log` writes nothing**; use `console.error`. **`.map(fn)` passes the ARRAY INDEX.** A swallowed `.catch(() => undefined)` is this codebase's most productive defect.
- **`$SCRATCH` is your session's scratchpad, and you must set it.**
- **Leave the machine as you found it**: `scripts/snapshot-machine.sh` at the start and the end, and the three cleanup scripts, bare, then with `--apply`.

---

## Review Focus

**The six failure modes most likely to bite a person, that no task's happy path exercises.** Each has its test in the owning task.

1. **A sign-out that silently stops working.** A `__Host-` cookie cleared without `Secure` stays in the browser. Expected: **after `POST /auth/logout` and after an SLO, the browser holds no `__Host-manifest_session`**, asserted on the `Set-Cookie` of the clear (`Secure`, `Path=/`, `Max-Age=0` or a past `Expires`, no `Domain`), on BOTH origins. Owned by Task 5's *a clear carries Secure on https*.
2. **A tossed cookie still honoured.** A `manifest_session` or `manifest_login` set with `Domain=manifest.internal` by a sibling host. Expected: **the https origin reads only `__Host-` names, so the tossed cookie changes nothing**:
   - a request carrying a valid tossed plain session and no `__Host-` one is `401 UNAUTHENTICATED`;
   - a tossed `manifest_login` with the attacker's nonce makes the ACS refuse the assertion.

   Owned by Task 5's *a plain-named session on an https origin is not a session* and *the ACS reads only the __Host- login cookie*.
3. **A refusal without its reference.** A `frameworkErrors` refusal (a malformed JSON body), a not-found, a webhook refusal, an SLO refusal, a 401, and a refusal rendered as an HTML page. Expected: **each carries `x-request-id`, the JSON body's `error.requestId` equals it, the page shows it, and the operator line holds it.** Owned by Task 3's *every refusal path carries the id*, which is table-driven over all six.
4. **An administrator's reason that is required where it must not be, or skipped where it must be.**
   - Required where it must not be: an administrator who is a MEMBER; an administrator's own duty (approve, record); a `GET`.
   - Skipped where it must be: a non-member administrator's deploy, commit, secret, member change, archive or token mint.
   - An idempotent replay with a different reason.

   Expected: the first set succeeds without the header; the second is `400 ADMIN_REASON_REQUIRED` without it and succeeds with it; **a replay with a different reason is `409 IDEMPOTENCY_KEY_REUSED`**. Owned by Task 10's matrix.
5. **A streamed `422` that looks like success.** The front-end streams every call. Expected: **a streamed request the provider refuses `422` ends with an error the client sees**, never an empty stream that closes cleanly. Owned by Task 6's *a streamed 422 is a refusal*, or its stop to Rich.
6. **A confirmation nobody can spend** (added 2026-10-02). An agent's token is revoked by its minter, by the minter's removal, or by an
   archive, or it simply runs out, while its question waits. Expected: **the question reads `expired` at once, a person's confirm is
   `409 PENDING_ACTION_RESOLVED`, and the project's stream carries one `pending_action.expired` naming who acted.** No event is
   published when the clock ended it. Owned by Task 13's matrix.

---

## File Structure

```
packages/control-plane/src/api/
  refusal.ts                  NEW (T3) sendRefusal(request, reply, status, error) — requestId, the operator line, the send
  server.ts                   MOD (T3) genReqId; onRequest x-request-id; every refusal through sendRefusal
  contract/route.ts           MOD (T3, T10) config.operationId; T10: the admin-reason preHandler and its declaration
  contract/document.ts        MOD (T3, T5) CONTRACT_VERSION 1.6.0 (T3); securitySchemes.session names both (T5)
  representations/errors.ts   MOD (T3, T4) requestId (required); limit; session
  errors.ts                   MOD (T3, T4, T10, T12) toErrorResponse gains facts; ADMIN_REASON_REQUIRED; T12: TOKEN_ACTION_PENDING's hint
  error-codes.ts              MOD (T4, T10, T12) remedies point at the fields; ADMIN_REASON_REQUIRED; T12: its remedy
  routes/webhooks.ts, routes/auth.ts, auth-page.ts   MOD (T3) refusals through sendRefusal; T5: cookie names
  routes/blueprints.ts        MOD (T2) listBlueprints filters listed; examples move to node-ts-mongo@1
  csrf.ts                     MOD (T5) carriesSession by the origin's name
  idempotency.ts              MOD (T10) the admin reason in the fingerprint
  routes/tokens.ts            MOD (T13) revoke and expire in one transaction; the event after the commit
  representations/tokens.ts   MOD (T13) Token.mintedBy (FE-49)
  routes/project-reads.ts     MOD (T13) a removal expires its revoked tokens' questions; the event after the commit
packages/control-plane/src/identity/
  cookie-names.ts             NEW (T5) cookieNames(origin)
  session.ts, login-state.ts, step-up.ts   MOD (T5) names from cookieNames; Path=/
packages/control-plane/src/ai/
  sessions.ts, intake.ts      MOD (T4) the facts on each refusal
packages/control-plane/src/blueprints/
  descriptor.ts, registry.ts  MOD (T2) listed
packages/control-plane/src/runtime/docker/
  hardening.ts                MOD (T8) Init: true
packages/control-plane/src/observability/
  acting.ts                   NEW (T10) the AsyncLocalStorage acting context
  events.ts, event-schemas.ts MOD (T10) publish reads it; EventFrame.actor; T13: pending_action.expired
packages/control-plane/src/tokens/
  expiry.ts                   MOD (T13) expirePendingActions answers its rows; publishQuestionsEnded
  pending.ts                  MOD (T13) a question's expiresAt capped at its token's
packages/control-plane/src/source/
  local-driver.ts             MOD (T14) a create over an existing repository is SOURCE_REPOSITORY_EXISTS
  driver-contract.ts          MOD (T14) the case both drivers run
packages/control-plane/src/releases/
  lifecycle.ts                MOD (T13) the archive publishes pending_action.expired after its commit
packages/control-plane/src/projects/
  authz.ts                    MOD (T10) membership for administrators; adminActingOnOthers; refusedWithoutAdminReason
packages/control-plane/src/db/schema.ts + drizzle/   MOD (T10) audit.events actor_user_id, acted_as_admin, reason; T13: the type CHECK
blueprints/fixture-node/blueprint.yaml               MOD (T2 listed: false; T7 base_image)
blueprints/node-ts-mongo/blueprint.yaml, agents/AGENTS.md   MOD (T7) node:24's digest; "Node 24"
infra/litellm/manifest_guard.py                      MOD (T6) the 422 hook
infra/images.txt, images.lock                        MOD (T7) node:24-alpine beside 22
infra/idp/config/config.php, infra/compose.yaml, infra/lib/ensure-idp-sql.sh, .env.example   MOD (T9) ssp_store
scripts/doctor.sh, scripts/verify.sh                 MOD (T7 tag-level base check; T9 the store role's checks)
scripts/demo-*.sh, scripts/lib/event-stream.mjs      MOD (T5) cookie names from the jar by prefix
packages/contract/src/client.ts, stream.ts, index.ts MOD (T5) sessionCookieFor(baseUrl)
packages/mock/src/                                   MOD (T3 requestId + header; T4 facts; T5 unchanged names, asserted)
packages/console/src/                                MOD (T3 the reference shown; T10 the admin reason field)
packages/journey/src/faculty-ready.ts                NEW (T11) make demo-faculty-ready's phases
packages/journey/src/token.ts, example-pending.ts    MOD (T12 the retry under a new key; the words. T13 a revoked token's question)
scripts/demo-faculty-ready.sh                        NEW (T11); ci-acceptance.sh, offline-acceptance.sh, Makefile MOD (T11)
docs/api/conventions.md, authentication.md, frontend.md, agents.md, events.md   MOD (T3, T4, T5, T10, T12, T13; T12: FE-50's sentence)
docs/superpowers/spikes/faculty-ready-baseline/      NEW (T1)
```

---

## Task 1: Measure what this plan rests on

**ALONE, AND FIRST.** Nothing under `packages/` changes. The record is `docs/superpowers/spikes/faculty-ready-baseline/README.md`, one section per measurement with its raw answer, plus `results-task1-<date>.txt`.

**Files:**
- Create: `docs/superpowers/spikes/faculty-ready-baseline/README.md`, `results-task1-<date>.txt`, `probes/`

- [ ] **Step 1: `[M1]` `__Host-` cookies.** Through the edge (`https://console.manifest.internal`) and on a throwaway `http://127.0.0.1:<port>` Fastify in `$SCRATCH`, set and clear:
  - `__Host-x=1; Secure; Path=/`;
  - `__Host-x=1; Path=/` (no Secure);
  - `__Host-x=1; Secure; Path=/; Domain=manifest.internal`;
  - a clear without `Secure`.

  Record what curl 8.7.1 keeps in its jar for each, and what headless Chrome keeps (`Network.getAllCookies`). **Expected:** the browser refuses all but the first, and refuses the Secure-less clear. **If curl keeps a cookie Chrome refuses, record it**: the demo scripts' controls must use the browser's answer, not curl's.
- [ ] **Step 2: `[M2]` The id on every refusal path.** In a scratch copy of the server's build (never the running control plane), add `genReqId: () => randomUUID()` and an `onRequest` header. Hit each path in *Read this first* 7 and record whether `x-request-id` is present on each answer. **Expected:** absent only on `frameworkErrors`.
- [ ] **Step 3: `[M3]` LiteLLM against a `422`, in a THROWAWAY.**
  1. Run the pinned image (`infra/images.lock:9`) as `f8-probe` on its own network and port, 7197, with a copy of `config.yaml` whose one deployment points at a stub answering `422` twice (the stub from `ai/fallback-guard.docker.test.ts:56`).
  2. Record, **non-streamed and streamed**, the status, the body and every header.
  3. Then add, one at a time, a guard copy with **(A)** `async_post_call_success_deployment_hook` raising when `response is None`, and **(B)** `async_post_call_success_hook` raising `ProxyException(message=…, type='invalid_request_error', param=None, code=422)`.
  4. Record each branch's answer, both ways.
  5. **Then find the streaming hook that sees an empty stream** (`async_post_call_streaming_iterator_hook`, `custom_logger.py`), and record whether a raise there reaches the client as an error event or a non-200.
  6. Remove `f8-probe` and its network.

  **This decides Task 6's branch. If neither branch nor the streaming hook can make a streamed `422` a refusal, STOP and put it to Rich before sitting 4.**
- [ ] **Step 4: `[M4]` `Init` in the hardened shape.**
  1. `docker run` a throwaway from the same image the Docker tier's stub uses (`node:22-alpine`, by tag), with `--init --cap-drop ALL --read-only --security-opt no-new-privileges --pids-limit 64`.
  2. Record `/proc/1/comm` (expected `docker-init`), that twenty orphaned `sleep`s are reaped (`pids.current` back to baseline), the wall time of `docker stop -t 10`, and the exit code.
  3. Read `instances.ts:~378`'s mapping of an exit code to §14's reason, and say what `143` becomes.
- [ ] **Step 5: `[M5]` §26's surface.** From `api/contract/`'s route definitions, list every MUTATING operation whose capability is in `OWNER`, and every one whose capability is an administrator's own. Count them: the survey says about 25. Record which publish no event and which name nobody. **This is Task 10's matrix.**
- [ ] **Step 6: `[M6]` The gate numbers** from `scripts/ci-acceptance.sh`'s `EXPECT_` lines, and `pnpm test` once on the unchanged tree.
- [ ] **Step 7: `[M7]` FE-51, FE-52, FE-50, FE-49 and F7's premises, from the code at HEAD** (added 2026-10-02). Re-read *Read this first*
  18–21 and record each line as it now stands:
  - the hint's and the remedy's lines;
  - **every path that revokes a token** (grep `revokedAt: new Date()` and `revokeToken`), and whether each one expires its questions;
  - where `recordPendingAction`'s caller can read the token's `expiresAt` (`tokens/actor.ts`'s actor carries it);
  - whether a new event type needs an `audit.events` CHECK migration;
  - whether anything in `packages/mock` or `packages/console` switches exhaustively over the event types;
  - which unit test file holds the pending flow;
  - FE-50's two sentences and the confirm's `assertCapability`; FE-49's `Token` fields and the revoke's minter check;
  - F7: driver 1's create over an existing path, and whether the driver contract already has a case for it.

  **No new measurement on 7100**: the front-end's of 2026-10-02 stands unless the code under it has moved. If a premise is broken, say
  so to Rich before sitting 2.
- [ ] **Step 8: Commit** the spike directory by name.
  ```bash
  git commit -m "docs(faculty-ready): Task 1 — the measurements (cookies, request ids, LiteLLM's 422 streamed and not, Init, §26's surface)"
  ```

---

## Task 2: FE-31 — the test blueprint is not offered to people

**Spec action 2 first.**

**Files:**
- Modify: `packages/control-plane/src/blueprints/descriptor.ts` — `listed: z.boolean().default(true)`
- Modify: `blueprints/fixture-node/blueprint.yaml` — `listed: false`, with a comment naming FE-31
- Modify: `packages/control-plane/src/api/routes/blueprints.ts:70` — filter; its examples (`:40-50`) move to `node-ts-mongo@1`
- Modify: the other published examples in *Read this first* 11 (examples only)
- Test: `packages/control-plane/src/api/blueprints.test.ts`, `src/blueprints/blueprints.test.ts`

**Interfaces:** Produces `Descriptor.listed: boolean`. `listBlueprints` answers only `listed` blueprints. `resolve`, `getBlueprint` and `pathOf` are unchanged.

- [ ] **Step 1: The failing tests.**
  ```ts
  it('listBlueprints offers only blueprints meant for people (FE-31)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/blueprints', headers: sessionFor(ctx, 'bio_prof') })
    expect(res.json().blueprints.map((b: { ref: string }) => b.ref)).toEqual(['node-ts-mongo@1'])
  })
  it('an unlisted blueprint still resolves — the demos and every existing project keep building', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/blueprints/fixture-node@1', headers: sessionFor(ctx, 'bio_prof') })
    expect(res.statusCode).toBe(200)
    expect(res.json().ref).toBe('fixture-node@1')
  })
  ```
  The second is the positive control: a filter in `resolve` instead of `list` turns it red.
- [ ] **Step 2: Run — predict red** at the first `toEqual` (the list holds both).
- [ ] **Step 3: Implement.** Add the descriptor field, the YAML line, and the filter: `deps.blueprints.list().filter((b) => b.descriptor.listed).map(toBlueprint)`. **Not `.map(toBlueprint)` over a filtered index**; see *Global Constraints*.
- [ ] **Step 4: The examples.** Move each listed example to `node-ts-mongo@1`, then run `pnpm contract:write`, `contract:generate` and `docs:write`. **No version bump for examples alone**: `document.test.ts`'s rule counts schema changes.
- [ ] **Step 5: Commit**, then run the **negative control**: filter on `!listed`. **Predict red**: the first test, with `['fixture-node@1']`.

---

## Task 3: FE-30 — a request id on every answer, and every refusal logged

**Spec action 3 first.** **This task makes the contract `1.6.0`.**

**Files:**
- Create: `packages/control-plane/src/api/refusal.ts`
- Modify: `api/server.ts` (`:208` `genReqId`; `onRequest` header; the error handler, its 401 branch, `frameworkErrors`, the not-found handler, all through `sendRefusal`)
- Modify: `api/routes/webhooks.ts:91-94`, `api/routes/auth.ts:360-370`, `api/auth-page.ts:43-76` (the reference on the page)
- Modify: `api/contract/route.ts:204-215` (`config: { operationId }`), `api/contract/document.ts:61` (`1.6.0`), `packages/contract/package.json:3`
- Modify: `api/representations/errors.ts` (`requestId: z.string().uuid()`, required)
- Modify: `packages/contract/src/errors.ts:11-30` (`ManifestApiError.requestId`, from the body, else the header — the only id on `UNPARSEABLE`)
- Modify: `packages/mock/src/server.ts:821-835` (`envelope()` adds a UUID; every answer carries the header), `mock/src/fixtures.ts:1104`
- Modify: `packages/console/src/ui.tsx:72-110` (the reference shown under a refusal)
- Modify: `docs/api/conventions.md:18-32`
- Test: `packages/control-plane/src/api/refusal.test.ts` (NEW), `api/auth-page.test.ts:60`, `api/source-commit.test.ts:301`

**Interfaces:**
- Produces `sendRefusal(request: FastifyRequest, reply: FastifyReply, status: number, error: ErrorBody): FastifyReply`.
- Produces `x-request-id` on every answer, `ErrorEnvelope.error.requestId: string` (required), and `ManifestApiError.requestId: string | null`.
- Consumes `toErrorResponse`, which still returns `{ status, body }`.

- [ ] **Step 1: The failing tests**, table-driven over the six paths.
  ```ts
  const captured: string[] = []
  beforeEach(() => { captured.length = 0; vi.spyOn(console, 'error').mockImplementation((line) => { captured.push(String(line)) }) })

  it.each([
    ['a contract refusal',  { method: 'GET',  url: '/v1/projects/00000000-0000-0000-0000-000000000000' }, 'NOT_FOUND'],
    ['a 401',               { method: 'GET',  url: '/v1/me', noCredential: true }, 'UNAUTHENTICATED'],
    ['a framework error',   { method: 'POST', url: '/v1/projects', rawBody: '{not json' }, 'REQUEST_INVALID'],
    ['an unmatched route',  { method: 'GET',  url: '/v1/no-such-thing' }, 'ROUTE_NOT_FOUND'],
    ['a webhook refusal',   { method: 'POST', url: '/webhooks/github', unsigned: true }, 'WEBHOOK_SIGNATURE_MISSING'],
    ['an SLO refusal',      { method: 'GET',  url: '/auth/logout?SAMLRequest=garbage' }, 'SAML_LOGOUT_REJECTED'],
  ])('%s carries x-request-id, the same id in the body, and one operator line', async (_name, req, code) => {
    const res = await send(ctx, req)
    const id = res.headers['x-request-id'] as string
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.json().error).toMatchObject({ code, requestId: id })
    const lines = captured.filter((l) => l.includes(id)).map((l) => JSON.parse(l))
    expect(lines).toEqual([expect.objectContaining({ msg: 'refused', requestId: id, code, status: res.statusCode })])
    expect(captured.join('\n')).not.toMatch(/manifest_session|Bearer |mfst_/)   // no credential in the log
  })
  it('a success carries the header too, and writes no line', async () => { /* GET /v1/me with a session → 200, header, captured empty */ })
  it('two requests get two ids', async () => { /* distinct */ })
  it('a client-sent x-request-id is ignored', async () => { /* the answer's id is not the one sent */ })
  ```
  **The codes above are in `api/error-codes.ts` at `50425de`**; Task 1's `[M2]` confirms which each path actually answers (a malformed body may be answered by `frameworkErrors` or by the route's own parse). An HTML-page case asserts the id is in the page's text.
- [ ] **Step 2: Run — predict red** on every row, at `toMatch` (no header).
- [ ] **Step 3: Implement.**
  ```ts
  // api/refusal.ts
  export function sendRefusal(request: FastifyRequest, reply: FastifyReply, status: number, error: ErrorBody): FastifyReply {
    const requestId = request.id
    const operation = (request.routeOptions?.config as { operationId?: string } | undefined)?.operationId
      ?? `${request.method} ${request.routeOptions?.url ?? 'unmatched'}`
    console.error(JSON.stringify({ level: status >= 500 ? 'error' : 'warn', msg: 'refused', requestId,
      at: new Date().toISOString(), method: request.method, operation, status, code: error.code }))
    reply.header('x-request-id', requestId)   // frameworkErrors: no onRequest ran
    const body = { error: { ...error, requestId } }
    return wantsRefusalPage(request) ? sendRefusalPage(reply, status, body.error) : reply.status(status).send(body)
  }
  ```
  - `genReqId: () => randomUUID()`, and `app.addHook('onRequest', async (req, reply) => { reply.header('x-request-id', req.id) })`.
  - Keep the 500 branch's existing stack line **after** `sendRefusal`'s line, so both carry the same `requestId`.
  - Run `pnpm contract:write`, `contract:generate` and `docs:write`. The contract is **`1.6.0`**.
- [ ] **Step 4: The mock, the client, the console.** The mock's `validate.test.ts` parses every fixture against the document, so a fixture without `requestId` is red until it has one. **Message the front-end's live session before the commit** (`packages/contract` and `packages/mock` move), naming `requestId`, `x-request-id` and `1.6.0`.
- [ ] **Step 5: Commit**, then run the **negative controls**:
  - **(a)** Drop the header line from `sendRefusal`. Predict red: only the framework-error row, because `onRequest` covered the rest. That proves why the line is there.
  - **(b)** Return the body without `requestId` from the not-found handler. Predict red: its row, at `toMatchObject`.

---

## Task 4: FE-29 — a refusal's facts as fields

**Spec action 3** (the same words as Task 3).

**Files:**
- Modify: `ai/sessions.ts:51-59` (`AgentSessionError` gains `facts?: { limit?: Limit; session?: StartedSession }`), `:~201`
- Modify: `ai/intake.ts:73-80` (keep `resetsAt`), `:104-116` (one SQL statement answers the count AND the next midnight, Vancouver)
- Modify: `api/routes/agents.ts:211-225`, `api/routes/intake.ts:66-78`
- Modify: `api/errors.ts:730-735` (parse the facts through their schemas, fail closed with an operator line, as `launchReadiness` does at `:236-290`)
- Modify: `api/representations/errors.ts` (`limit`, `session`), `api/error-codes.ts:666-715` (remedies point at the fields)
- Modify: `packages/mock/src/server.ts:480,534,540,1051,1059`, `packages/journey/src/example-agent-session.ts:85`, `example-intake.ts:48`, `packages/console/src/api.ts:846,891`, `docs/api/conventions.md:30-31`
- Test: `api/agents.test.ts`, `api/intake.test.ts`

**Interfaces:** Produces:
- `Limit = { scope: 'person' | 'platform'; period: 'day' | 'month'; resetsAt: string | null; amountUsd?: number; count?: number }`
- `StartedSession = { id: string; name: string | null }`

- [ ] **Step 1: The failing tests.**
  ```ts
  it('INTAKE_DAILY_LIMIT_REACHED says the count and when it lifts, by the database clock', async () => {
    // start dailyKeys intake sessions for one person, then one more
    const body = refusal(res)   // asserts the code
    expect(body.error.limit).toEqual({ scope: 'person', period: 'day', count: deps.intake.dailyKeys, resetsAt: expect.any(String) })
    const { rows } = await db.execute(sql`select (date_trunc('day', now() at time zone 'America/Vancouver') + interval '1 day') at time zone 'America/Vancouver' as next`)
    expect(new Date(body.error.limit.resetsAt).toISOString()).toBe(new Date(rows[0].next).toISOString())
  })
  it('AGENT_BUDGET_EXHAUSTED says the month, the amount and the reset LiteLLM reports', async () => { /* fakeLiteLlm budget_reset_at */ })
  it('a reset LiteLLM does not report is null, not absent', async () => { /* fakeLiteLlm 404 user → resetsAt: null */ })
  it('AGENT_SESSION_ALREADY_STARTED names the session the first start made', async () => { /* error.session = { id, name } */ })
  it('INTAKE_SESSION_ALREADY_STARTED names it, with a null name', async () => { /* { id, name: null } */ })
  ```
- [ ] **Step 2: Run — predict red** at each `toEqual` (fields absent).
- [ ] **Step 3: Implement.** Carry the facts on the error; map them in `api/errors.ts` through `Limit` and `StartedSession`. **A facts object that fails its schema is DROPPED with an operator line, never a 500.** Then run `contract:write`, `contract:generate` and `docs:write`, still `1.6.0`.
- [ ] **Step 4: The mock and the examples.** Tell the front-end (its F5b's limit cards can read `resetsAt` instead of its copy of the rules).
- [ ] **Step 5: Commit**, then run the **negative controls**: **(a)** drop `resetsAt` in `api/errors.ts`'s mapping. **Predict red** at the daily test's `toEqual` (`resetsAt` missing) and at *a reset LiteLLM does not report is null* (`undefined` is not `null`). **(b)** Compute the daily `resetsAt` in JavaScript (now plus 24 hours) instead of in the counting statement. **Predict red** at the database-clock equality, because now plus 24 hours is not the next Vancouver midnight; a control that stays green means the test compares the wrong thing, so chase it.

---

## Task 5: FE-28 — `__Host-` cookies, and the login door closed

**No spec action**: the spec names no cookie (§20), and D23.8 puts the sign-in endpoints outside the versioned contract.

**Files:**
- Create: `packages/control-plane/src/identity/cookie-names.ts`
- Modify: `identity/session.ts:3`, `identity/login-state.ts:8`, `identity/step-up.ts:15` (the names come from `cookieNames`; the constants stay for the http names)
- Modify: `api/routes/auth.ts` (every set, read and clear by `cookieNames(originOf(request))`; the login and step-up cookies at `Path=/`; clears carry `secure` on https), `api/server.ts:268`, `api/csrf.ts:35`
- Modify: `api/contract/document.ts:416` (`securitySchemes.session`: *"`__Host-manifest_session` on an https origin; `manifest_session` on loopback http"*)
- Modify: `packages/contract/src/client.ts:5` (`sessionCookieFor(baseUrl)`; `SESSION_COOKIE` kept and marked deprecated), `stream.ts:82`, `index.ts:1`, `README.md:51`
- Modify: `scripts/demo-*.sh`, `scripts/lib/event-stream.mjs:19` (read the jar's `__Host-manifest_session`, since they go through the edge)
- Modify: `api/testing.ts:148-153`, `identity/testing.ts` (jars keyed by the name the origin uses)
- Modify: `docs/api/authentication.md:7`, `frontend.md:9,656`, `RUNBOOK.md:411,1308,1822`
- Test: `api/auth.test.ts`, `api/logout.test.ts`, `api/csrf.test.ts`, `identity/saml.docker.test.ts`

**Interfaces:**
- Produces `cookieNames(origin: string): { session: string; login: string; stepUp: string }`.
- Produces `sessionCookieFor(baseUrl: string): string` in `@manifest/contract`.

- [ ] **Step 1: Tell the faculty front-end's live session FIRST**, before any code. Name:
  - the three new names;
  - `Path=/` for the login cookie;
  - `sessionCookieFor`;
  - that its mock mode is unchanged (http);
  - that its `whoIs`, its tests' jars, its `check-*.sh` and its Node sign-in must read `__Host-manifest_session` and carry `__Host-manifest_login` across the three hops.

  Agree when it adopts. Its adoption is ITS commit, in ITS repository.
- [ ] **Step 2: The failing tests.**
  ```ts
  it('an https origin sets __Host-manifest_session: Secure, Path=/, no Domain', async () => { /* sign in on https://console… → Set-Cookie parsed */ })
  it('a loopback http origin keeps manifest_session, not Secure', async () => { /* auth.test.ts:363-378 extended */ })
  it('a clear on https carries Secure — or the browser keeps the session (Review Focus 1)', async () => {
    const clear = setCookieOf(await logout(ctx, 'https://console.manifest.internal'), '__Host-manifest_session')
    expect(clear).toMatchObject({ secure: true, path: '/', maxAge: 0 })
    expect(clear.domain).toBeUndefined()
  })
  it('a plain-named session on an https origin is not a session (Review Focus 2)', async () => {
    const res = await get(ctx, '/v1/me', { origin: 'https://console.manifest.internal', cookie: `manifest_session=${validSession}` })
    expect(refusal(res).error.code).toBe('UNAUTHENTICATED')
  })
  it('the ACS reads only the __Host- login cookie: a tossed plain one with the attacker\'s nonce is refused', async () => { /* … */ })
  it('POSITIVE CONTROL: the __Host- session on https is a session', async () => { /* 200 */ })
  ```
- [ ] **Step 3: Run — predict red** at the names.
- [ ] **Step 4: Implement** `cookieNames`:
  ```ts
  export function cookieNames(origin: string) {
    const secure = origin.startsWith('https://')
    return secure
      ? { session: '__Host-manifest_session', login: '__Host-manifest_login', stepUp: '__Host-manifest_stepup' }
      : { session: SESSION_COOKIE, login: LOGIN_COOKIE, stepUp: STEP_UP_COOKIE }
  }
  ```
  Then:
  - replace every literal use;
  - move `Path=/auth` to `Path=/` on both short-lived cookies;
  - add `secure` to every clear on https;
  - update the four client packages and the scripts;
  - run `contract:write`, `contract:generate` and `docs:write`, still `1.6.0`, stating the break in `document.ts`'s version comment.
- [ ] **Step 5: `pnpm test:docker`'s `identity/saml.docker.test.ts` alone**. Its http control planes keep the plain name, so it should stay green; its https leg (`app.`) should read `__Host-`. Then the whole tier at the close.
- [ ] **Step 6: Through the edge, by hand.** Run `make demo-journey` and `make demo-token` (both sign in through `console.`), then `make demo-frontend` (`app.`). Each must be green on the new names.
- [ ] **Step 7: Commit**, after the front-end's reply. Then run the **negative controls**:
  - **(a)** Drop `secure` from the https clear. Predict red: Review Focus 1's test.
  - **(b)** Read `manifest_session` on https as well. Predict red: Review Focus 2's test.
  - **(c)** Leave the login cookie at `Path=/auth` with the `__Host-` name. Predict red: the ACS test, because the browser model in `api/testing.ts` refuses a `__Host-` cookie that is not `Path=/`. **If that model does not enforce it, this control CANNOT FAIL in the unit tier; record that, and prove it in headless Chrome at Task 11.**

---

## Task 6: F8 — a provider's `422` reaches the client as a `422`

**Its branch is `[M3]`'s.**

**Files:**
- Modify: `infra/litellm/manifest_guard.py` (a second hook, per `[M3]`; it may be a second class registered beside the first)
- Modify: `infra/litellm/config.yaml:91` (`callbacks` lists both, if two instances)
- Modify: `packages/control-plane/src/ai/fallback-guard.docker.test.ts:361-381` (the `KNOWN (F8)` case becomes the fixed case; a NEW streamed case), `:65` (`REFUSED = [400, 413, 422]`)
- Modify: `packages/journey/src/example-agent-session.ts:97`, `frontend.ts` (the wording); then `pnpm docs:write`. Keep `journey/src/examples.test.ts:376`'s null tolerance for old gateways.
- Modify: ORIENTATION §8 (*Open* to *Decided*), TRAPS (the F8 entry)

- [ ] **Step 1: The failing Docker cases.**
  ```ts
  it('a provider\'s 422 answers 422 with the provider\'s refusal type, and never falls back (F8, fixed)', async () => {
    const res = await chat({ model: CAPABLE, stub: 422 })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { type: 'invalid_request_error', code: '422' } })
    expect(res.headers.get('x-litellm-attempted-fallbacks')).toBeNull()
    expect(stubHits(422)).toBe(2)   // drop_params' own retry, then nothing
  })
  it('a STREAMED 422 is a refusal the client sees (Review Focus 5)', async () => { /* per [M3]'s answer */ })
  it('POSITIVE CONTROL: a 503 still falls back, and a 401 still falls back (Rich, 2026-09-30: "Confirm")', async () => { /* … */ })
  ```
- [ ] **Step 2: Run — predict red** at `toBe(422)` (`200`).
- [ ] **Step 3: Implement the measured branch**, writing the file in place (trap 18), restarting `manifest-litellm`, and comparing sha256 inside and out.
- [ ] **Step 4: Commit**, then run the **negative control**: return `None` from the new hook instead of raising. Predict red: both new cases.

---

## Task 7: `node:24-alpine` for faculty apps

**The network, at Rich's yes.**

**Files:**
- Modify: `infra/images.txt` (add `node:24-alpine` beside `node:22-alpine`), `infra/images.lock` (by `make seed`'s lock step)
- Modify: `blueprints/node-ts-mongo/blueprint.yaml:22-27`, `blueprints/fixture-node/blueprint.yaml:19-22` (`base_image` is 24's REGISTRY digest), `fixture-node/Dockerfile.tmpl:38` (the comment)
- Modify: `blueprints/node-ts-mongo/agents/AGENTS.md:7` (*"Node 24 on Alpine"*), `api/routes/blueprints.ts:134` (the example), `packages/mock/src/fixtures.ts:390-392`
- Modify: `scripts/doctor.sh:415`, `scripts/verify.sh:1156-1157` (a TAG-level check that `base/node:24-alpine` is in the registry)
- Modify: RUNBOOK:515, ORIENTATION §8 (*Open* to *Decided*), TRAPS:666/:1530

- [ ] **Step 1: The failing check.** Extend `doctor.sh` to assert `base/node` tag `24-alpine`, read from `manifest-registry`'s `_manifests/tags/24-alpine/current/link`. **Run it: red.**
- [ ] **Step 2: `make seed`, with the network, at Rich's yes.** Record the pull, the mirror, the registry's single-arch digest for `24-alpine`, and the time.
- [ ] **Step 3: Move both descriptors to the digest**; update the knowledge pack and the example; run `contract:write` and `docs:write`.
- [ ] **Step 4: Measure what moved.**
  - Grype on the new base (npm and apk Critical/High, against 2026-09-06's 22 figures).
  - Two builds of one commit give ONE digest.
  - An offline build through the builder, including `npm ci` against Verdaccio.
  - `make demo`, `make demo-identity` (a real CWL sign-in inside an app on 24) and `make demo-ai`.
- [ ] **Step 5: Commit**, then run the **negative control**: point `node-ts-mongo`'s `base_image` at a digest the registry lacks. **Predict**: the new doctor check stays green (it reads the TAG), and `make demo`'s build fails at `FROM`; quote the build's recorded reason in the record. That split is the point: doctor proves the tag is mirrored, the build proves the descriptor names it.

---

## Task 8: `Init: true` — an init reaps an app's orphans

**Spec action 4 first.**

**Files:**
- Modify: `packages/control-plane/src/runtime/docker/hardening.ts:17-40` (`Init: true`, with a comment citing §12 and `[M4]`)
- Modify: `instances.ts:~378`, only if `[M4]` shows `143` is read as a crash
- Test: `runtime/docker/hardening.test.ts:13-26`, `hardening.docker.test.ts:~82-89`, `s6.docker.test.ts:546-570` (probe 11: orphans reaped; the ordering note at `:452-459` updated)

- [ ] **Step 1: The failing tests.**
  - `expect(hardenedHostConfig(input).Init).toBe(true)`.
  - Docker: `/proc/1/comm` is `docker-init`.
  - Probe 11: after twenty orphaned `sleep`s exit, `pids.current` returns to its baseline within 2 s.
- [ ] **Step 2: Run — predict red.**
- [ ] **Step 3: Implement.** Re-run `make demo-redeploy` (a retire is a kill; a hibernation is a stop, now sub-second).
- [ ] **Step 4: Commit**, then run the **negative control**: remove the line. Predict red: all three.

---

## Task 9: The IdP's session store gets its own role

**Rich adds one key to `.env`.**

**Files:**
- Modify: `infra/lib/ensure-idp-sql.sh` (idempotent: `CREATE ROLE ssp_store LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE` with its password through `PGOPTIONS`; `CREATE SCHEMA IF NOT EXISTS ssp_store AUTHORIZATION ssp_store`; `ALTER ROLE ssp_store SET search_path = ssp_store`; `REVOKE ALL ON SCHEMA public FROM ssp_store`; drop the old `public.simplesamlphp_kvstore` and `public.simplesamlphp_tableversion` once, saying so)
- Modify: `infra/idp/config/config.php:85-87` (`ssp_store`, `getenv('SSP_STORE_PASSWORD')`), the entrypoint's wrong comment
- Modify: `infra/compose.yaml:271-291` (`SSP_STORE_PASSWORD` into the IdP), `.env.example:23`, `packages/control-plane/src/secrets/scrub.ts:19` (+ `scrub.test.ts:48`)
- Modify: `scripts/verify.sh` (the schema-qualified `DELETE`; a new check: `ssp_store` cannot SELECT `public.saml20_sp_remote`, and `ssp_ro` cannot SELECT `ssp_store.simplesamlphp_kvstore`), `scripts/doctor.sh` (the `.env` key)
- Modify: RUNBOOK, ORIENTATION §8 (*Open* to *Decided*)

- [ ] **Step 1: The failing checks.** Add both `verify.sh` checks and run them: **red**, because `ssp_ro` reads the kvstore today.
- [ ] **Step 2: Rich adds the key.** Print, never write: `SSP_STORE_PASSWORD=<openssl rand -hex 24's output>` for him to add to `.env`. Wait for him.
- [ ] **Step 3: Implement.**
  1. Write `config.php` in place.
  2. Run `make up`.
  3. Sign in once through the IdP (the store's first use creates its tables in `ssp_store`).
  4. `\dt ssp_store.*` shows both tables, owned by `ssp_store`.
- [ ] **Step 4: `make verify`** is green, with its count up by the checks added. Run `make demo-identity`.
- [ ] **Step 5: Commit**, then run the **negative control**: put `store.sql.username` back to `manifest`. Predict red: the new check that the kvstore's owner is `ssp_store`, because the tables would be created in `public` again. **Restore, and drop the `public` copies.**

---

## Task 10: §26 — an administrator acting on another person's project gives a reason

**Spec action 1 first.** **Alone, sitting 6.** If it runs long, stop after Step 6 and finish in a sitting 6a. The steps commit separately.

**Files:**
- Create: `packages/control-plane/src/observability/acting.ts` — `actingContext: AsyncLocalStorage<Acting>`, `Acting = { userId: string; asAdmin: boolean; reason: string | null }`
- Modify: `projects/authz.ts:633-640` (membership computed for administrators too), `:667-674` (`refusedWithoutAdminReason(route)` beside `refusedWhenArchived`), and `ADMIN_DUTIES = ['release:approve', 'launch:record', 'quota:set']`
- Modify: `api/contract/route.ts` (a preHandler after the actor: a mutating route, a session actor who is an administrator and not a member, and a capability not in `ADMIN_DUTIES`, requires `manifest-admin-reason`, trimmed to 1–500 characters, else `400 ADMIN_REASON_REQUIRED`; then `actingContext.enterWith(…)`), and the declaration
- Modify: `api/idempotency.ts` (`hashOf` includes the header), `api/routes/tokens.ts` (`mintToken`: the same rule)
- Modify: `db/schema.ts:990-1066` + a migration (`audit.events.actor_user_id uuid null REFERENCES users`, `acted_as_admin boolean NOT NULL DEFAULT false`, `reason text null`, and `CHECK (NOT acted_as_admin OR length(trim(reason)) > 0)`)
- Modify: `observability/events.ts` (`publish` reads `actingContext`; the sentence gains *", as a platform administrator — reason: '…'"* when `acted_as_admin`; the reason goes through `makeRedactor`), `observability/event-schemas.ts` / `api/representations/events.ts` (`EventFrame.actor: { name: string; asAdministrator: boolean; reason: string | null } | null`)
- Modify: `releases/release.ts:442-452`, `releases/build.ts:137-150`, `api/spec-validation.ts:134-143` (sentences name who acted, from the context)
- Modify: `api/error-codes.ts`, `api/errors.ts` (`ADMIN_REASON_REQUIRED`: *"An administrator acting on a project they are not a member of gives a reason (§26)."* — remedy: *"Send it in the Manifest-Admin-Reason header."*)
- Modify: `packages/console/src/` (a reason field when the signed-in person is an administrator and not a member, sent as the header on mutations), `packages/mock/src/` (the example refusal), `docs/api/conventions.md`, `events.md`
- Test: `api/admin-reason.test.ts` (NEW, the matrix), `observability/events.test.ts`, `api/idempotency.test.ts`

**Interfaces:**
- Produces the header `Manifest-Admin-Reason`, `400 ADMIN_REASON_REQUIRED`, `EventFrame.actor`, and `actingContext`.
- Consumes `[M5]`'s list of operations.

- [ ] **Step 1: The matrix** (Review Focus 4). Rows are `[M5]`'s mutating operations. Columns:
  - non-member administrator without the header → `ADMIN_REASON_REQUIRED`;
  - the same with it → success;
  - member administrator without it → success;
  - owner without it → success;
  - an administrator's own duty without it → success.

  Plus:
  - a `GET` by a non-member administrator without it → success;
  - a replay of one idempotency key with a different reason → `409 IDEMPOTENCY_KEY_REUSED`;
  - a token an administrator minted with a reason acts without being asked.
- [ ] **Step 2: Run — predict red** on every *"without the header → refused"* cell.
- [ ] **Step 3: Implement** authz, the preHandler, the declaration, idempotency, and the mint. `contract:write`, still `1.6.0`.
- [ ] **Step 4: The audit columns.** The migration, read and applied, then a test:
  ```ts
  it('the owner\'s stream shows who acted, as an administrator, and why (§26)', async () => {
    // opr000001 (admin, not a member) deploys bio_prof's staging with the header 'Student reported a broken page'
    const frame = await nextEvent(ctx, 'instance.provisioning')
    expect(frame.actor).toEqual({ name: 'Test Operator', asAdministrator: true, reason: 'Student reported a broken page' })
    expect(frame.message).toMatch(/as a platform administrator — reason: 'Student reported a broken page'/)
    const row = await db.select().from(auditEvents).where(eq(auditEvents.id, frame.id))
    expect(row[0]).toMatchObject({ actedAsAdmin: true, reason: 'Student reported a broken page' })
    // Decision 13: an event the deploy publishes LATER, outside the request, still names who started it
    const later = await nextEvent(ctx, 'instance.healthy')
    expect(later.actor).toEqual(frame.actor)
  })
  ```
  Plus: a reason holding something secret-shaped is redacted in both the row and the frame; one of 501 characters is refused `ADMIN_REASON_REQUIRED` with a hint naming the limit; and **POSITIVE CONTROL:** the owner's own deploy has `asAdministrator: false, reason: null`.
- [ ] **Step 5: The sentences** of deploy, build and validate name the actor, with a test each.
- [ ] **Step 6: Commit** (steps 1–5).
- [ ] **Step 7: The console and the mock.** The reason field; the mock's example; the guides. **Tell the front-end** (`1.6.0` grows `EventFrame.actor`).
- [ ] **Step 8: Commit**, then run the **negative controls**:
  - **(a)** Compute membership as today (null for administrators). Predict red: the matrix's *"member administrator without it"* column.
  - **(b)** Drop the header from `hashOf`. Predict red: the replay row.
  - **(c)** Publish without reading the context. Predict red: the stream test at `frame.actor`.

---

## Task 11: The acceptance — `make demo-faculty-ready`, and a person clicking it

**Alone, and last.**

**Files:**
- Create: `packages/journey/src/faculty-ready.ts`, `scripts/demo-faculty-ready.sh`
- Modify: `Makefile`, `scripts/ci-acceptance.sh` (a step; the `EXPECT_` lines), `scripts/offline-acceptance.sh` (a new step)

- [ ] **Step 1: The phases**, each ending `every check passed`, on either driver.
  1. **Sign-in through the edge.** The jar holds `__Host-manifest_session` (Secure, `Path=/`, no Domain) on `console.` and on `app.`. A tossed `manifest_session` with `Domain=manifest.internal` changes nothing.
  2. **A refusal carries `x-request-id` equal to `error.requestId`**, and the control plane's output holds one line with that id and code. The demo reads the log file `cp-start.sh` writes; where it cannot, it says so, and the Docker case is the witness.
  3. **`listBlueprints`** has no `fixture-node@1`; `getBlueprint('fixture-node@1')` answers.
  4. **An agent start replayed** answers `AGENT_SESSION_ALREADY_STARTED` with `error.session.id`.
  5. **The app container's PID 1 is `docker-init`** (`docker exec … cat /proc/1/comm`).
  6. **`operator`** (an administrator, not a member) deploys `instructor`'s staging:
     - without the header → `ADMIN_REASON_REQUIRED`;
     - with it → success;
     - `instructor`'s stream shows the actor and the reason.
  7. **An agent's question ends with its token** (Task 13; added 2026-10-02):
     - a token asks for a privileged action, and its minter revokes it;
     - `getPendingAction` reads `expired`;
     - `instructor`'s confirm is `409 PENDING_ACTION_RESOLVED`;
     - the stream carried one `pending_action.expired`, `cause: 'token_revoked'`, naming `instructor`.
- [ ] **Step 2: Green three times on each driver** (fresh, re-use, from `make reset`), and every other demo, and `make ci-acceptance`.
- [ ] **Step 3: The negative controls**, each seen red and restored: one per phase.
- [ ] **Step 4: The clicked half.** Stage everything; ask Rich once; he types the passwords. **In headless Chrome FIRST** (Task 5's control (c)): the browser refuses a `__Host-` cookie at `Path=/auth`.
- [ ] **Step 5: The plan's one whole-branch review**, beside the Docker tier; one fix wave.
- [ ] **Step 6: Close out**: the ledger, ORIENTATION §7e's next job (FE-32's plan to write), and the front-end told.

---

## Task 12: FE-51 and FE-50 — the pending-action hint names what the platform matches, and who answers

**Added 2026-10-02 at Rich's word. It runs in sitting 2, after Task 4**: Task 3 has by then moved `errors.ts` through `sendRefusal`,
and Task 4 has rewritten `error-codes.ts`'s remedies, so this is one more text change to files that sitting already has open.
Decision 16. **FE-50 joined at sitting 1's open**: the same remedy also says who answers.

**Files:**
- Modify: `packages/control-plane/src/api/errors.ts:391` (the hint) and `api/error-codes.ts:268` (the remedy); then `pnpm contract:write`, `contract:generate` and `docs:write`
- Modify: `packages/journey/src/example-pending.ts:21` (generated into `docs/api/agents.md`) and `docs/api/agents.md:59` (hand-written)
- Modify (FE-50): `docs/api/authentication.md:50` (*"a question the person who minted it confirms"*), and every other sentence `[M7]` finds that names the minter as the one who answers
- Modify: `packages/journey/src/token.ts:653`: the step's label, and the step itself, which now retries under a NEW key
- Test: the pending flow's unit file, named by `[M7]`

- [ ] **Step 1: The tests.**
  - **A pin, green from the start, and said to be one:** after a confirm, the retry under a DIFFERENT `Idempotency-Key` is `201` and
    sets `consumedAt`.
  - **The red one:** the refusal's `hint`, and the remedy in `error-codes.ts`, describe the retry by method, path and body, and do not
    tell the agent to reuse a key. Assert the meaning against the words in Decision 16, not an exact sentence.
  - **FE-50, a pin and a red:** the pin is that a collaborator who minted the token is refused the confirm (`403 FORBIDDEN`), and an
    owner who did not mint it confirms it (`200`). The red is that the remedy does not say *"minted"* about who answers.
- [ ] **Step 2: Run, and predict red** at the hint assertion only.
- [ ] **Step 3: Implement the words**, then run the four contract commands. **Through the edge:** `make demo-token`, whose step now
  retries under a new key; that proves the guide's claim on the real entry point.
- [ ] **Step 4: Tell the front-end before the commit.** `openapi.json`'s remedy text changes; `packages/mock` does not.
- [ ] **Step 5: Commit**, then run the **negative control**: put the old hint back, and predict red at the hint assertion. Restore.
  ```bash
  git commit -m "fix(tokens): the pending-action hint names what is matched and who answers — the request, not its key (FE-51); a person who could do it (FE-50)"
  ```

---

## Task 13: FE-52 and FE-49 — an agent's question ends when its token does, and a token names its minter

**Added 2026-10-02 at Rich's word. It runs in sitting 4, after Task 8.** The Docker tier is owed there already, and this task adds
`observability/` and `releases/` to it. Decision 17. **FE-49 joined at sitting 1's open**: `Token.mintedBy`, in the same contract change.

**Files:**
- Modify: `packages/control-plane/src/tokens/expiry.ts`: `expirePendingActions` answers the rows it expired (id, token, action, summary
  and project), not a count, and the boot sweep at `index.ts:451` counts them. It also gains `publishQuestionsEnded(deps, rows,
  { cause, by })`, called after a commit and never inside one.
- Modify: `tokens/pending.ts:153`: `expiresAt` is capped at the token's own; the caller passes it (`[M7]` says from where)
- Modify: `api/routes/tokens.ts:333-367`: the revoke and the expiry in ONE transaction, and the publish after the commit, beside
  `closeToken`
- Modify: `api/routes/project-reads.ts:590-598`: the expiry inside the removal's transaction, for each revoked id, and the publish after
  the commit
- Modify: `releases/lifecycle.ts:435-436`: the archive already expires; it now publishes, after its commit
- Modify: `observability/event-schemas.ts` (`pending_action.expired`), its example if the map has one, and the migration for
  `audit.events`' CHECK; then the four contract commands
- Modify: `docs/api/agents.md` and `docs/api/events.md` (a question can end without an answer, and how a client learns it);
  `packages/mock` and `packages/console` only if `[M7]` finds an exhaustive switch
- Modify (FE-49): `api/representations/tokens.ts` (`mintedBy: Uuid`, *"who minted it; only they may revoke it"*, in `Token` and so in
  the mint's answer) and `toToken`; `packages/mock/src` (its token fixtures carry it); `docs/api/authentication.md` (who may revoke)
- Test: the pending flow's unit file, `tokens/expiry.test.ts`, and the removal's and the archive's tests; `api/tokens.test.ts` for `mintedBy`

- [ ] **Step 1: The failing tests, as one matrix.** For each of **revoke**, **removal** and **archive**, from a token with one question
  `pending`:
  - after the act, `getPendingAction` reads `expired`;
  - a confirm is `409 PENDING_ACTION_RESOLVED`;
  - exactly one `pending_action.expired` was published, with that `cause` and `by`, and its sentence names the person.

  **Expiry:** a token minted to expire in an hour asks; its question's `expiresAt` equals the token's. After that moment, the sweep
  moves the question to `expired` and publishes nothing.

  **FE-49:** `listTokens` and `mintToken` answer `mintedBy` equal to the minter's `getMe().id`; a token minted by somebody else names
  them.

  **Positive controls, in the same file:**
  - a live token's question still confirms (`200`), and its retry is `201`;
  - a question already `confirmed` before the revoke stays `confirmed`, and no event is published for it.
- [ ] **Step 2: Run, and predict.**
  - **Red:** revoke's and removal's `expired`, all three events, and the cap.
  - **Green, and say why:** the archive's `expired`, which Decision 28 of the front-end enablement plan already built; only its event
    is new.
- [ ] **Step 3: Implement.** The expiry goes inside each transaction, and the publish follows each commit, for the reason the streams
  close after it: an event that announces a rollback is false.
- [ ] **Step 4: The four contract commands, then tell the front-end BEFORE the commit.** Its watch stream gains an event type, and its
  F6b Decision 16 workaround (*[Revoke]* rejects first) can go when it chooses. Keep `packages/contract` and `packages/mock`
  typecheck-clean together in the working tree.
- [ ] **Step 5: Through the edge.** `make demo-token` gains a step: a second token asks, its minter revokes it, the question reads
  `expired`, and a confirm is `409 PENDING_ACTION_RESOLVED`. Run `make demo-frontend`, whose archive now publishes the event.
- [ ] **Step 6: Commit**, then run the **negative controls**, each seen red and restored:
  - **(a)** remove the expiry from `revokeToken`'s transaction. Predict red: the matrix's revoke row, and Step 5's demo step.
  - **(b)** remove the cap. Predict red: the expiry case.
  - **(c)** skip `publishQuestionsEnded`. Predict red: the three event assertions, and nothing else.
  ```bash
  git commit -m "fix(tokens): a token's questions end when it does — revoked, removed or archived, with an event; a question never outlives its token (FE-52); a token names its minter (FE-49)"
  ```

---

## Task 14: F7 — driver 1 refuses a create over a repository already on the machine

**Added at sitting 1's open (2026-10-02, Rich: *"All into faculty-ready"*). It runs in sitting 2**, whose Docker tier is owed already and
now also covers `source/`. Decision 18.

**Files:**
- Modify: `packages/control-plane/src/source/local-driver.ts:219-229` (`existsSync(path)` before `git init`; the `SourceError`)
- Modify: `api/error-codes.ts:689-692` (`SOURCE_REPOSITORY_EXISTS`'s meaning: on GitHub, or on this machine; the remedy unchanged in intent); the four contract commands
- Test: `source/driver-contract.ts` (one case, run by both drivers)

- [ ] **Step 1: The failing case, in the driver contract.** Create `chem-labs`, then create `chem-labs` again:
  - **Expected:** `SOURCE_REPOSITORY_EXISTS`;
  - the first repository's `headCommit` is unchanged;
  - nothing was pushed to it.

  Also a positive control: a create of a NEW slug beside it still succeeds.
- [ ] **Step 2: Run, and predict.** Red on driver 1, at the code (`SOURCE_CONFLICT`). **Green on driver 2**, which already refuses, and
  say why: its Decision 16.
- [ ] **Step 3: Implement**, then the four contract commands, since the remedy text is published.
- [ ] **Step 4: Through the edge, on driver 1.** After a truncation (sitting 2's own Vitest leaves one), create a project over a slug whose
  bare repository is still on disk, and quote the answer: `409 SOURCE_REPOSITORY_EXISTS`, naming the slug.
- [ ] **Step 5: Commit**, then run the **negative control**: remove the check, and predict red at the driver-1 case only. Restore.
  ```bash
  git commit -m "fix(source): driver 1 refuses a create over a repository already on this machine — SOURCE_REPOSITORY_EXISTS, never a false SOURCE_CONFLICT (F7)"
  ```

---

## What this plan does not build

- **FE-32**, *an agent can add a dependency*. It is the next plan (Rich, 2026-09-30).
- **LiteLLM's four leaks**: `x-litellm-model-api-base`, `x-litellm-model-name`, the body's underlying `model`, and `llm_provider-*`. They are tracked for **before production** (Rich, 2026-09-30).
- **`MANIFEST_IDP_DATABASE_URL`'s superuser**: the control plane writes SP rows to the IdP's metadata database as `manifest`. It is the same shape as Task 9, a least-privilege role, and is named here so it is not forgotten.
- **An administrator's reason on a READ**: §26 names *actions* (Decision 14).
- **A cross-project stream of administrators' actions**, which is the admin console's (§26).
- **Everything in ORIENTATION §8 *Open* that Rich left open on 2026-09-30**: the licence, an apk mirror, UBC's shared LiteLLM, `passport-ubcshib` upstream, the embedding bug, the `app`-origin sign-out, and the driver-1 hook's cost.

---

## Spec actions

**FOUR, DRAFTED 2026-09-30 WITH THIS PLAN. None is applied.** Each is decided by Rich before the sitting that builds it, and applied only after he has read the words.

### 1. §26 and §6 — the administrator's reason: who, how it is carried, where it is kept (before sitting 6)

**Why.** Rich decided the design on 2026-09-30 (*"The design (Recommended)"*). §26's paragraph says a reason is required for *"an admin action taken on another person's project"*, but not how it travels, what counts, or where it is kept, and §6's `Event` row has no actor.

**Proposed**, two edits:
- **§26, *Non-repudiation***, the paragraph becomes:
  > *"Every administrative action is audited with its actor. **An administrator who is not a member of a project and uses an
  > owner's capability on it** — deploying, committing, setting a secret, adding or removing a person, renaming, archiving,
  > restoring or deleting, running the rehearsal, starting an agent session, answering someone's agent, minting a token —
  > **additionally gives a reason, sent with the request** (the `Manifest-Admin-Reason` header), and is refused without one. The
  > reason is stored with the audit entry beside the actor, and shown to the project's people in their event stream. An
  > administrator's own duties — approving or rejecting a release, and recording UBC's answers (§9) — are theirs by definition,
  > already name them, and need no reason beyond what their own records ask; an administrator who is a member of the project acts
  > as a member; a read is not an action. A token an administrator mints on another person's project is minted with a reason, and
  > its later actions name the token. §3.5 lists insider risk as a real threat with a stated need for non-repudiation; this is
  > where that is discharged."*
- **§6, `Event`**: `id`, `project_id`, `subject`, `type`, `machine_detail`, `human_message`, **`actor_user_id`, `acted_as_admin`, `reason`**, `created_at`.

*Options:*
- **(a) as proposed** (recommended; Rich's design);
- **(b) no exemptions** — approvals and records need a reason too;
- **(c) a body field**, not a header.

**Shared pages:** `manifest-decisions.html` D31 (*"administration is a role"*, if it describes audit) and the schematic's admin lines. **Check both.**

### 2. §25 — a blueprint for the platform's own tests is not listed (before sitting 2)

**Proposed:** in §25's descriptor example, after `major_version`, add:

```yaml
listed: true                      # false: the platform's own test fixture; listBlueprints omits it, and it still resolves
```

After the example, add: *"**A blueprint the platform keeps for its own tests declares `listed: false`**: it is never offered to a person or an agent choosing where to start, and a project already made from it keeps building."*

*Options:*
- **(a)** (recommended);
- **(b)** a setting that stops the fixture loading — Rich rejected it on 2026-09-30.

**Shared pages:** none name the fixture. **Check.**

### 3. §20 — every answer carries a request id; a limit's refusal carries its facts (before sitting 2)

**Proposed:** §20, *Machine-actionable errors*, after *"…extended to clients that are programs."*, add:

> *"**Every answer carries a request id** (`x-request-id`), and every refusal carries it in its body too, so a person's support
> report meets the platform's own line for that request: every refusal is logged with its id, its time, the operation and its
> code — never its message. **A refusal about a limit carries the limit as fields** — whose it is, over what period, how much,
> and when it lifts — and a refusal that names something already started carries its id, so a client acts on fields rather
> than parsing a sentence."*

*Options:*
- **(a)** (recommended);
- **(b)** the id only on 5xx (FE-30's option (b)).

**Shared pages:** `manifest-decisions.html` D23, if it lists what an error carries. **Check.**

### 4. §12 — an app's container runs an init (before sitting 4)

**Proposed:** §12's hardening list, after *"resource ceilings including `pids`…"*, add:

> *"- **an init as PID 1 in every app container**, so a process the app starts and abandons is reaped rather than left holding
> one of the container's `pids` (measured: twenty orphaned `sleep`s held twenty, P5a sitting 2)"*

*Options:*
- **(a)** (recommended);
- **(b)** every container, services and egress included — they run no app code.

**Shared pages:** none describe container internals. **Check.**

---

## What the self-review caught

1. **The mock is http only.** A rename by fiat would have broken the front-end's mock mode, which is why the names are chosen by scheme (Decision 7) and the mock's are asserted unchanged.
2. **`requestId` already means the SAML AuthnRequest id** in `api/auth.test.ts`. The new test file uses `id` and `x-request-id` in its helpers, never a `requestId` variable at that scope.
3. **An intake session has no name.** FE-29's `{ id, name }` is `{ id, name: null }` there (Decision 5), and the schema says so.
4. **A streamed `422` is the case the front-end meets.** Both hooks the survey found skip streams, so Task 1 measures the streamed case first, and Task 6 stops rather than shipping a fix that misses it.
5. **§26's context outlives the request.** Events a build publishes after its `202` still carry the administrator who started it. That is Decision 13's choice, not an accident, and the stream test asserts a LATER event of the same build carries it.

---

## Asked by the faculty front-end before this plan runs — answered 2026-10-01, overnight (`manifest-9f`)

**Where the questions came from.** The front-end's adoption note asked this plan seven questions:
`~/Developer/manifest-app/docs/research/2026-10-01-faculty-ready-adoption.md`, *Open questions* 1–7. These are the answers sent to its
coordinator, `manifest-app-3a`. They were read from this plan and from the code at `df62a72`, and every citation was checked.

**How to read them.** Where the plan does not say, the answer says so and RECOMMENDS. **Each recommendation is the executing sitting's to
keep or change**, and the sitting tells the front-end which at Task 1's close.

1. **Which cookie name does the platform read on a request sent straight to `http://127.0.0.1:7100`?** **The plan doesn't say.**
   - **What the server would read.** Decision 7 reads `cookieNames(originOf(request))`. For a `Host` that names no configured origin,
     `originOf` falls back to the FIRST one, the console's `https` origin (`api/origins.ts:6`, `:18-21`; `config.ts:598`). So the server
     would read `__Host-manifest_session` there, and Decision 8 ignores a plain one.
   - **What the client would send.** Task 5 gives `sessionCookieFor(baseUrl)` no body. If it follows Decision 7's scheme rule, it answers
     the plain name for `http://127.0.0.1:7100`. The client and the server would then disagree.
   - **Who that breaks.** The front-end's `whoIs` replays a session straight to 7100 (its `packages/server/src/config.ts:44`). It would
     be refused `401`.
   - **Today, a direct session-bearing mutation is already refused there by CSRF.** The client sends `Origin: http://127.0.0.1:7100`
     (`packages/contract/src/client.ts:46`, `:58`), and the server expects the console's origin (`api/server.ts:339`). Only reads work.
   - **Recommended: the front-end's server asks through the edge**, at `https://app.manifest.internal/v1/me`, where the `Host` and the
     scheme agree. That is §21's control-plane row (*"Clients reach it through the edge … never on this port"*), and it is what
     `journey/src/frontend.ts:166`, `:205` already does.
   - **What Task 5 should add:** a test that pins the name the fallback reads; and `sessionCookieFor`'s doc should say it names the cookie
     for an origin the platform serves.
2. **`ManifestApiError`'s constructor.**
   - **Today** it is `(status, envelope, operation)` (`packages/contract/src/errors.ts:18`).
   - **What Task 3 adds:** `requestId: string | null`, *"from the body, else the header"*. It does not say how the value arrives.
   - **Recommended: an optional fourth parameter, defaulting to `null`.** Every existing construction then still compiles: the front-end's
     nineteen in its tests, `client.ts:85`, and two in `journey/src/examples.test.ts`.
3. **Is `Manifest-Admin-Reason` optional or required?** **The plan doesn't say how the header is declared.** Task 10 enforces it
   centrally.
   - **Today**, the one header parameter, `Idempotency-Key`, is `required: true` on every mutation (`api/contract/document.ts:294-302`).
     That makes it required in the generated client's types.
   - **Recommended: declare it `required: false`.** The header is required only of an administrator who is not a member. A required
     declaration would force it on every mutation's call site, the console's included.
   - **Task 10's file list should name `document.ts`.** It does not.
4. **How does a streamed `422` arrive after Task 6?** **The plan leaves the shape to Task 1's `[M3]`**: *"A STREAMED `422` is fixed too,
   or the sitting stops and asks Rich"* (Decision 9).
   - Only a measurement can say whether it arrives as a non-200 before the body, or as an error event mid-stream.
   - **Today**, a streamed `400` is answered before any stream begins (`ai/fallback-guard.docker.test.ts:348-359`). A `422` is answered
     `200` with `null` (`:372-381`, F8).
   - **The sitting tells the front-end `[M3]`'s recorded answer at Task 1's close.**
5. **Where does `requestId` go in the mock's envelope?** Task 3 says only *"`envelope()` adds a UUID"*.
   - **Today**, the mock writes `code` and `message`, then `hint`, `details` and `launchReadiness` when present
     (`packages/mock/src/server.ts:993-1009`).
   - **The platform's sketch** in Task 3 is `{ error: { ...error, requestId } }`, which puts `requestId` LAST.
   - **Recommended: the mock appends it last too**, so the two agree and `"code":"…","message"` stays adjacent. The front-end was also
     told that its substring check is brittle, and that parsing the body is the honest check.
6. **Whose server holds 7105 at Task 11's clicked half?** **The plan doesn't say.**
   - What Rich clicks there — a refusal's reference, and a reason asked of an administrator — are the reference console's features
     (Tasks 3 and 10).
   - 7105 is the front-end's port (`infra/caddy/Caddyfile:117-121`).
   - **Recommended: the reference console's `preview` on 7105, lent by the front-end's session and returned after**, as the front-end
     enablement plan's clicked half was (that plan's Task 15, Step 4).
   - If Rich wants the front-end's own server in the walk, its steps 3–5 must land first.
7. **Is there a window between Task 5's commit and 7100's restart?** **The plan doesn't name one, and its order leaves none.**
   - **Step 1** tells the front-end and *"agree[s] when it adopts"*.
   - **Step 6** runs `make demo-journey`, `demo-token` and `demo-frontend` through the edge on the new names. That needs 7100 restarted on
     Task 5's code BEFORE the commit: the control plane runs `tsc`, then `node dist/index.js`.
   - **Step 7** commits *"after the front-end's reply"*.
   - **So the front-end's edge-mode adoption must land before Step 6's restart.** Its mock mode is untouched throughout.
   - Every restart also signs everybody out: `cp-start.sh` makes a new `MANIFEST_SESSION_SECRET`.
   - **Recommended: Step 1's message names the restart as the moment, and the sitting announces the restart when it comes.**

---

## What executing this plan found

*Empty until sitting 1.*
