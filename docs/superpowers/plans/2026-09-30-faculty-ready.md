# Before Faculty Use It For Real — Implementation Plan

> **WRITTEN 2026-09-30, IN PARALLEL WITH THE LAUNCH PATH PLAN'S SITTING 5, AT RICH'S WORD** (*"Now, in parallel"*,
> answering *"When should the next plan be written?"*). Its scope is Rich's, decided the same afternoon in the planning session
> `manifest-00` (*Decided by Rich*, below — each in his words). **Every fact in *Read this first* was read from the code at
> `50425de` while the launch path plan's sitting 5 had uncommitted edits in `ai/`, `db/`, `observability/`, `projects/`,
> `tokens/` and `api/`** — so line numbers there WILL have moved by the time this plan runs, and Task 1 re-measures each one
> marked *(T1: M<n>)* into `spikes/faculty-ready-baseline/`. **Four spec actions are drafted below; none is applied; no task a
> spec action changes runs before Rich has read and decided its words.** **APPROVED by Rich, 2026-09-30** (*"plan looks good"*), seven sittings as proposed. **The execution method is his, chosen when the plan starts** (*"I'll decide on implementation strategy at the time. Probably not subagent driven though."*): ask him at sitting 1's open. **Approving the plan approves no spec action**: each of the four is read and decided before the sitting that builds it.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native) or superpowers:subagent-driven-development, **whichever Rich chooses at sitting 1's open** (2026-09-30: *"Probably not subagent driven though"*). Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9, which both of those skills will push you against.

**Goal:** Close what stands between the platform and a real faculty member's first day. **A faculty app on a sibling host cannot plant a session** in a colleague's browser (FE-28, widened to the login and step-up cookies). **Every answer carries a request id, and every refusal leaves an operator line** a support report can be matched to (FE-30). **A refusal about a limit says whose, how much and when it lifts, as fields** (FE-29). **The platform's test blueprint is not offered to people** (FE-31). **A provider's `422` reaches the client as a `422`, never `200 null`** (F8). **Faculty apps run on `node:24-alpine`**, **with an init that reaps orphans**, and **the IdP's session store stops using the Postgres superuser**. And **an administrator acting on another person's project gives a reason, which the project's people see** (§26's non-repudiation, which nothing enforces today).

It is proved by `make demo-faculty-ready`, on either driver, through `@manifest/contract`. A person clicks it too.

**Architecture:** Nine small, independent changes, and one medium one. They are grouped so that each contract-touching sitting bumps nothing twice.
- **The contract goes to `1.6.0` ONCE**, at Task 3, the first schema change. Everything after it stays `1.6.0`.
- **The request id is Fastify's own `request.id`**, generated as a UUID. It is set as a header in `onRequest`, carried into every refusal body by ONE `sendRefusal` helper, and logged by the same helper.
- **The cookie names are chosen per origin scheme**: `__Host-` on `https`, the plain name on loopback `http` (the Docker tier and the mock), so no `http` test origin loses its session.
- **The administrator's reason is one request header**, enforced in `registerRoutes`. It is carried into every event the request publishes by an `AsyncLocalStorage` context, and stored on `audit.events` in three new columns.
- **The `422` fix is a second hook in the same LiteLLM guard.** The `node:24` move is `images.txt`, `make seed` and a digest in two blueprint descriptors. `Init` is one line in `hardenedHostConfig`. The IdP store's role follows `ssp_ro`'s precedent in `ensure-idp-sql.sh`.

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
| 2 | 2, 3, 4 | **FE-31, FE-30, FE-29**: fixtures unlisted; a request id on every answer and every refusal logged; a limit's facts as fields — **contract `1.6.0`** | Yes — `blueprints/` | **2** (§25), **3** (§20) | |
| 3 | 5 | **FE-28, widened**: `__Host-` session, login and step-up cookies on https; the plain names on loopback http; every client and script; the sibling repository told first | Yes — `identity/` | — | |
| 4 | 6, 8 | **F8**: a `422` answers `422`, streamed too. **`Init: true`**: an init reaps an app's orphans | Yes — `ai/`, `infra/`, `runtime/` | **4** (§12) for Task 8 | |
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

**The contract.** It is **`1.5.0`** in three places, held equal by `api/contract/document.test.ts:56-63`. Additive changes bump the minor (`document.ts:20-61`). The launch path plan takes no bump, so **this plan's Task 3 makes it `1.6.0`**, once.

---

## Decisions this plan makes, and why

1. **ONE CONTRACT BUMP, `1.6.0`, AT TASK 3**, the first schema change. Tasks 4, 5 and 10 add to it. *Rejected:* a bump per task, which would make four versions the sibling repository has to adopt in a week.
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

**The five failure modes most likely to bite a person, that no task's happy path exercises.** Each has its test in the owning task.

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

---

## File Structure

```
packages/control-plane/src/api/
  refusal.ts                  NEW (T3) sendRefusal(request, reply, status, error) — requestId, the operator line, the send
  server.ts                   MOD (T3) genReqId; onRequest x-request-id; every refusal through sendRefusal
  contract/route.ts           MOD (T3, T10) config.operationId; T10: the admin-reason preHandler and its declaration
  contract/document.ts        MOD (T3, T5) CONTRACT_VERSION 1.6.0 (T3); securitySchemes.session names both (T5)
  representations/errors.ts   MOD (T3, T4) requestId (required); limit; session
  errors.ts                   MOD (T3, T4, T10) toErrorResponse gains facts; ADMIN_REASON_REQUIRED
  error-codes.ts              MOD (T4, T10) remedies point at the fields; ADMIN_REASON_REQUIRED
  routes/webhooks.ts, routes/auth.ts, auth-page.ts   MOD (T3) refusals through sendRefusal; T5: cookie names
  routes/blueprints.ts        MOD (T2) listBlueprints filters listed; examples move to node-ts-mongo@1
  csrf.ts                     MOD (T5) carriesSession by the origin's name
  idempotency.ts              MOD (T10) the admin reason in the fingerprint
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
  events.ts, event-schemas.ts MOD (T10) publish reads it; EventFrame.actor
packages/control-plane/src/projects/
  authz.ts                    MOD (T10) membership for administrators; adminActingOnOthers; refusedWithoutAdminReason
packages/control-plane/src/db/schema.ts + drizzle/   MOD (T10) audit.events actor_user_id, acted_as_admin, reason
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
scripts/demo-faculty-ready.sh                        NEW (T11); ci-acceptance.sh, offline-acceptance.sh, Makefile MOD (T11)
docs/api/conventions.md, authentication.md, frontend.md, agents.md, events.md   MOD (T3, T4, T5, T10)
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
- [ ] **Step 7: Commit** the spike directory by name.
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
- [ ] **Step 2: Green three times on each driver** (fresh, re-use, from `make reset`), and every other demo, and `make ci-acceptance`.
- [ ] **Step 3: The negative controls**, each seen red and restored: one per phase.
- [ ] **Step 4: The clicked half.** Stage everything; ask Rich once; he types the passwords. **In headless Chrome FIRST** (Task 5's control (c)): the browser refuses a `__Host-` cookie at `Path=/auth`.
- [ ] **Step 5: The plan's one whole-branch review**, beside the Docker tier; one fix wave.
- [ ] **Step 6: Close out**: the ledger, ORIENTATION §7e's next job (FE-32's plan to write), and the front-end told.

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

## What executing this plan found

*Empty until sitting 1.*
