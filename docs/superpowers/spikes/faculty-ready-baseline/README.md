# faculty-ready baseline — Task 1's measurements

**Taken on 2026-10-02, late evening, by `manifest-96`** in the faculty-ready plan's sitting 1
([`../../plans/2026-09-30-faculty-ready.md`](../../plans/2026-09-30-faculty-ready.md), Task 1). **HEAD was `b32ce14`**, whose code is
`d5c76d5`'s: no file under `packages/`, `scripts/`, `infra/` or `blueprints/` changed between them.

**The machine:** macOS 26.6.2 (25G83), Docker Desktop 29.7.2 (`InitBinary=docker-init`), Node 24.12.0, Google Chrome 154.0.8037.93,
curl 8.7.1 (SecureTransport), and LiteLLM 1.98.0 (`ghcr.io/berriai/litellm@sha256:20b5044b…`, `infra/images.lock`).

**The record:**
- every raw answer is in [`results-task1-2026-10-02.txt`](results-task1-2026-10-02.txt);
- every probe is in [`probes/`](probes/), and each one says how to run it;
- each probe ran against throwaways: a server on 7195/7196, headless Chrome on 7194 with its own profile, a LiteLLM on 7197 with its own
  network, a stub on 7198, and `node:22-alpine` containers. **Every one was removed, and nothing touched 7100, `manifest-litellm` or the
  control database.**

**Does any measurement break the plan's split? No.** Two premises move, and both moves are recorded here for the task that owns them:
1. **`[M1]`: loopback `http` CAN hold a `__Host-` cookie**, in both clients measured. This changes Task 5's premise, not its
   decision.
2. **`[M3]`: a streamed `422` is a `500` today, not a quiet empty stream**, and one guard fixes both kinds of request. This changes
   Task 6's premise, and settles its branch.

---

## [M1] `__Host-` cookies — Task 5

**Method.** A throwaway server (`probes/m1-server.mjs`) answers `GET /set?c=<a Set-Cookie value>` with exactly that header.
- **The https origin** is `https://probe.manifest.internal:7196`: a self-signed certificate, with the name mapped to 127.0.0.1.
- **The loopback origins** are `http://127.0.0.1:7195` and `http://localhost:7195`.
- **The clients:** headless Chrome over CDP (`probes/m1-chrome.mjs`, `Network.getAllCookies`), and curl's jar (`probes/m1-curl.sh`), each
  starting every case from an empty jar.
- **The real edge** is `https://console.manifest.internal`. Chrome set cookies there with `document.cookie`, on a `/v1` page; the console's
  own `/` answers `502` with its static server down.

| Case | https | `http://127.0.0.1` | `http://localhost` |
|---|---|---|---|
| `__Host-x=1; Secure; Path=/` | **kept** | **kept** | **kept** |
| `__Host-x=1; Path=/` (no `Secure`) | refused | refused | refused |
| `__Host-x=1; Secure; Path=/; Domain=manifest.internal` | refused | refused | refused |
| `__Host-x=1; Secure; Path=/auth` | refused | refused | refused |
| `manifest_session=1; Path=/` (the control) | kept | kept | kept |
| a clear **without** `Secure` (`__Host-x=; Path=/; Max-Age=0`) | **the cookie stays** | **stays** | **stays** |
| a clear **with** `Secure` | cleared | cleared | cleared |

**Chrome and curl agree on every row.** curl also **sends** the `Secure` `__Host-x` back over loopback `http`
(`cookie: __Host-x=1`, on both names).

**Tossing, from a sibling host** (`https://evil.manifest.internal`, as a faculty app would):
- a plain `manifest_session=tossed; Domain=manifest.internal; Path=/` is **kept for `.manifest.internal` and sent to
  `console.manifest.internal`**, by Chrome and by curl (`cookie: manifest_session=tossed`). This is FE-28's harm, measured;
- a `__Host-manifest_session` with `Domain=` is **refused**;
- a plain `manifest_login=tossed; Domain=manifest.internal; Path=/auth` is **kept and would be sent to `/auth/acs`**. This is the login-CSRF
  door, measured.

**On the real edge** (`document.cookie`): `__Host-e1; Secure; Path=/` is kept; without `Secure`, and at `Path=/auth`, it is refused. A clear
without `Secure` leaves it, and a clear with `Secure` removes it.

**What it means.**
- **Review Focus 1 holds:** a sign-out whose clear lacks `Secure` silently leaves a `__Host-` session in BOTH clients, on every origin.
- **Task 11 Step 4's expectation holds:** the browser refuses a `__Host-` cookie at `Path=/auth`, so the login and step-up cookies must move
  to `Path=/` (Read this first 5).
- **Read this first 4 is wrong for loopback.** *"`http` origins cannot hold a `__Host-` cookie"* is false for `127.0.0.1` and `localhost`,
  in Chrome 154 and curl 8.7.1, because both treat loopback as a secure context. **Decision 7 (names by origin scheme) still works
  unchanged; the measurement only removes its necessity on loopback.**
  - **Recommended: keep Decision 7.** The mock and the front-end's mock mode stay untouched (its whole point), and Firefox and Safari were
    not measured.
  - *The alternative* (one `__Host-` name everywhere, `Secure` always) changes the mock and the sibling repository, and rests on two
    clients. It is Task 5's to weigh, at Rich's word, since it reverses a decision he approved.
  - Either way, **Task 5's tests must not claim that an `http` origin refuses a `__Host-` cookie.** That is not what clients do.

## [M2] The request id on every refusal path — Task 3

**Method (a ruling; see the plan's record).** The plan said *"a scratch copy of the server's build"*. The probe instead builds the server
**in-process**: `testDeps()` and `buildServer()`, with every database URL pointed at a port nothing listens on, so no request could read or
write a database.
- It adds `onRequest(reply.header('x-request-id', request.id))` after the build, and `app.inject`s each path.
- `vitest` is stubbed so the harness loads outside a test run, which also means there is no global setup and no truncation
  (`probes/m2-no-vitest.mjs`).
- **For presence, it is equivalent:** `genReqId` changes the id's value, not whether a header survives. Ids read `req-1`, `req-2`…,
  Fastify's per-process counter, as Read this first 6 says.

| Path | Status | `x-request-id` |
|---|---|---|
| **the control**: not a refusal (`GET /auth/login`, the redirect to the IdP) | 302 | present |
| `setErrorHandler`'s early 401 (`GET /v1/me`, no credential) | 401 | present |
| `frameworkErrors`: a path parameter over 100 characters | 400 `REQUEST_INVALID` | **absent** |
| `frameworkErrors`: a malformed URL (`/v1/slugs/%E0%A4%A`) | 400 `REQUEST_INVALID` | **absent** |
| `setNotFoundHandler` | 404 `ROUTE_NOT_FOUND` | present |
| `setErrorHandler`: a malformed JSON body (`POST /v1/projects`, with a key and an Origin) | 400 `REQUEST_INVALID` | present |
| webhooks' local `refuse` (driver 1: `WEBHOOKS_NOT_CONFIGURED`) | 404 | present |
| SLO's local refusal, JSON | 400 `SAML_LOGOUT_REJECTED` | present |
| SLO's local refusal as the HTML page (`Accept: text/html`) | 400, `text/html` | present |
| a mutation without an `Idempotency-Key` | 400 `IDEMPOTENCY_KEY_REQUIRED` | present |
| **a 500 thrown INSIDE the credential hook** (a well-formed bearer; the database unreachable) | 500 `INTERNAL` | **absent** |

**What it means.**
- **As predicted, `frameworkErrors` must set the header itself** (Read this first 7).
- **NEW: an error thrown inside an EARLIER `onRequest` hook skips a header hook registered after it.** Here that was the credential hook's
  500 on a database failure. So Task 3 must do one of two things:
  - set the header **inside `sendRefusal` itself**, which Decision 3 already routes every refusal through (recommended: one place, whatever
    the hook order);
  - or register the header hook **before** the credential hook.

  Its table-driven test needs this row: *a refusal raised by the credential hook carries the id*.
- **Not a defect, but noted:** with the database down, a well-formed bearer answers `500 INTERNAL` and not `401`. The outage is not
  swallowed into *"your token is invalid"*.

## [M3] LiteLLM against a provider's `422` — Task 6

**Method.** The pinned image, as `f8-probe` on its own network (`fr-m3-net`), published on 127.0.0.1:7197, with no database
(`probes/m3/run.sh`).
- **One deployment**, `openai/probe-underlying`, at a host stub on 7198 that answers EVERY call `422` (`probes/m3/stub.mjs`).
- **Production's settings:** `drop_params: true` and the guard as a callback (`probes/m3/config.yaml`).
- **For each guard:** one non-streamed and one streamed request, recording the status, the headers, the body and the stub's hit count.

| Guard | Non-streamed | Streamed |
|---|---|---|
| **today's** (`guard-0-today.py`, a copy of `infra/litellm/manifest_guard.py`) | **`200`, body `null`** (F8) | **`500`**, `"'async for' requires an object with __aiter__ method, got NoneType"` |
| **(A)** `async_post_call_success_deployment_hook` raising on `None` | `422`, LiteLLM's own text: *"litellm.UnprocessableEntityError: … Received Model Group=probe-chat\nAvailable Model Group Fallbacks=None"* | `500`, as today (the hook is not called on a stream) |
| **(B)** `async_post_call_success_hook` raising `ProxyException(code=422)` | **`422`**, `{"message":"the provider refused this request as malformed","type":"invalid_request_error","param":null,"code":"422"}` | `500`, as today |
| **(C)** `async_post_call_streaming_iterator_hook`, raising when the stream yields nothing | `200 null` | `500`. **The stream object itself is `None`**, so iterating it fails before the check |
| **(D)** (B), plus the streaming iterator hook raising `ProxyException(code=422)` when `response is None`, BEFORE iterating | `422` | **`500`**, with the refusal's own message and `"code":"500"` |
| **(E)** (D), with **`refusal.status_code = 422`** set on the `ProxyException` | **`422`** | **`422`**, a JSON body before any stream, the same as the non-streamed body |

**The stub was hit exactly twice in every case:** the call, then `drop_params`' own retry. That is Task 6 Step 1's `stubHits(422) = 2`.

**Why (D) answers `500`.** LiteLLM's streaming path takes the status from `getattr(e, "status_code", 500)`. That is the first-chunk handler
of `litellm/proxy/common_request_processing.py`, in `create_streaming_response`. `ProxyException` carries only `code`, so the status has to be
set on it.

**What it means.**
- **Decision 9's branch is (B), extended as (E).** It is the proxy's post-call success hook, plus the streaming iterator hook that checks
  for NO stream before it iterates, each raising a `ProxyException(type='invalid_request_error', code=422)` with `status_code = 422`.
  `probes/m3/guard-E.py` is that guard.
- **(A) is rejected:** it misses the stream, and its body carries LiteLLM's debug text (*"Received Model Group=… Available Model Group
  Fallbacks=…"*).
- **Review Focus 5's premise moves.** Today a streamed `422` is not *"an empty stream that closes cleanly"*. It is a `500` before any stream
  begins, and its message is LiteLLM's internal Python error. The client sees a failure, the wrong one. After (E), it sees the provider's
  refusal as a `422`, before any stream, as a non-streamed request does. **The plan's stop condition does not fire.**
- **Not measured here:** the same with a FALLBACK configured, which is how the capable model runs. This probe's deployment has none
  (*"Available Model Group Fallbacks=None"*). `ai/fallback-guard.docker.test.ts`'s F8 case has the fallback, and is Task 6's witness that a
  `422` still never falls back.
- **The tracked leak, seen again:** `x-litellm-model-name: openai/probe-underlying` is on today's `200 null` and on every streamed answer.
  That is one of the four leaks Rich placed *before production* (2026-09-30), not this plan's.

## [M4] `Init` in the hardened shape — Task 8

**Method** (`probes/m4-init.sh`). `node:22-alpine` (the registry digest `sha256:1ef15d33…`) runs with `--cap-drop ALL --read-only
--security-opt no-new-privileges --pids-limit 64`, and **`node` as PID 1**, as in an app container. Twenty orphans are made as
`s6.docker.test.ts`'s probe 11 makes them: `sleep 3 &` in an exec'd shell that then exits. The same container then runs without `--init`,
as the control.

| | With `--init` | Without (today's app shape) |
|---|---|---|
| `/proc/1/comm` | **`docker-init`** | `node` |
| `pids.current`: baseline, just after the orphans, 6 s later | 9 → 29 → **9** | 8 → 28 → **28** |
| zombies 6 s later | **0** | **20** |
| `docker stop -t 10` | **0.15 s**, exit **143** | **10.19 s**, exit **137** (SIGKILL) |

**What it means.**
- **The init reaps:** twenty orphans held twenty pids for the container's life without it, and none with it. That is Spec action 4's
  claim, measured again.
- **`143` is never read as a crash.**
  - An exit code is only ever quoted in an Incident's `exitReason` (`observability/incidents.ts:163-164`). An Incident is captured only
    when a release's instance fails its checks (`releases/release.ts:897`), never on a stop.
  - The platform's stop is `POST /containers/{id}/stop?t=10` (`runtime/docker/instances.ts:327`).
  - So Decision 11's contingency (*"recorded as a stop … if `[M4]` finds it would be otherwise"*) is not needed, and
    `instances.ts:~378` needs no change.
- **NEW, and good news for Task 8: today every app stop waits the full 10 s and ends in SIGKILL.** `node` as PID 1 ignores `SIGTERM`. With
  the init it ends in 0.15 s on `SIGTERM`, which `docker-init` forwards. So a retire and a hibernation become sub-second (Task 8 Step 3),
  and an app's `SIGTERM` handler starts being called at all.

## [M5] §26's surface — Task 10's matrix

**Method** (`probes/m5-surface.py`). Each operation's `method` and `capability` are read from the route definitions in
`api/routes/*.ts`, and the capability is classified against `projects/authz.ts:452-493` (`OWNER`, `COLLABORATOR`, `PLATFORM_ADMIN`).

**71 operations, 33 of them mutating:**
- **22 mutate with an OWNER capability.** A non-member administrator would need a reason for each:
  - `startAgentSession`, `endAgentSession`, `startBuild`;
  - `draftIamRegistration`, `draftPrivacyAssessment`, `submitIamRegistration`, `submitPrivacyAssessment`, `runRehearsal`;
  - `archiveProject`, `restoreProject`, `deleteProject`;
  - `addMember`, `removeMember`;
  - `validateSpec`, `updateProject`, `createRelease`, `requestApproval`, `deploy` (`release:deploy|release:promote`);
  - `setAppSecret`, `clearAppSecret`, `createCommit`, `mintToken`.
- **2 more decide their capability per request:** `confirmPendingAction` and `rejectPendingAction` take the question's own capability. That
  is an owner's, except `quota:set`, which is an administrator's own.
  - **So Task 10's matrix is 24.** The survey said *"about 25"*.
- **5 are an administrator's own, and exempt:** `recordIamRegistration`, `recordPrivacyAssessment`, `approveRelease`, `rejectRelease` and
  `createApprovalPreview`.
- **4 are outside the matrix:** `createProject`, `startIntakeSession` and `endIntakeSession` act outside a project, and `revokeToken` is
  minter-only.
- **No event at all:** `createRelease` and `createApprovalPreview` (no `release.created` type exists).
- **An event that names nobody:**
  - `deploy`: `instance.provisioning`, *"Preparing <slug> in <env>."*;
  - `startBuild`: `build.started`, *"Building <slug> at commit …"*;
  - `validateSpec`: `spec.validated`.

  This matches Read this first 17.
- **A question for Task 10, not answered here:** is an administrator confirming a `quota:set` question on another person's project acting on
  their own duty (exempt) or on the owner's (reason required)? Decision 14's reading would make it exempt.

## [M6] The gate numbers

- **From `scripts/ci-acceptance.sh`'s `EXPECT_` lines:** `EXPECT_TESTS=3197`, `EXPECT_FILES=196`, `EXPECT_DOCTOR=21`, `EXPECT_VERIFY=64`.
- **From ORIENTATION §2's row:** `pnpm test:docker` is 271 tests in 42 files.
- **`pnpm test` was NOT run** (a ruling; see the plan's record). The code is byte-identical to `d5c76d5`'s, whose close ran it twice, at
  3197 in 196. The lean test budget (ORIENTATION §8 *Decided*) forbids an open run on an unchanged tree. A run would also have truncated Rich's
  live `f6b-measure-1`.

## [M7] FE-51, FE-52, FE-50, FE-49 and F7's premises, at HEAD

**Every line cited in *Read this first* 18–21 was read at `b32ce14`, and holds.** Re-read in this sitting:
- `api/errors.ts:391`, `api/error-codes.ts:268`;
- `tokens/pending.ts:23`, `:153`, `:282-309`;
- `api/routes/pending-actions.ts:90`, `:113-126`, `:282`;
- `api/routes/tokens.ts:333-367`, `:345`;
- `api/routes/project-reads.ts:590-598`, `releases/lifecycle.ts:435-436`;
- `tokens/expiry.ts:25-30`, `tokens/actor.ts:75-84`, `api/idempotency.ts:73-77`;
- `docs/api/authentication.md:50`;
- `source/local-driver.ts:219-265`, `source/github/driver.ts:838-843`, `api/error-codes.ts:689-692`.

**What else Task 1 was asked:**
- **Three writers revoke a token**, all in `tokens/repository.ts`: `:86` (`revokeTokensOf`, the archive's), `:110` (`revokeTokensOfMember`, a
  removal's) and `:152` (`revokeToken`, the route's). Only the archive's caller expires the token's questions.
- **`recordPendingAction` has ONE caller**, the route wrapper at `api/contract/route.ts:344`, where the actor is at hand. A token actor
  carries `expiresAt` in epoch ms (`tokens/actor.ts`), so Decision 17's cap needs no new read.
  `api/authz-contract.ts:2467` also calls it, but that is a test harness.
- **A new event type needs a migration:** `audit.events`' CHECK `events_type_known` lists every type (`db/schema.ts:1166-1169`).
- **NEW, for Task 13: the console's queue names the `pending_action.*` types it re-reads on, one by one, deliberately**
  (`packages/console/src/screens/queue.tsx:81-86`: *"`startsWith('pending_action.')` would silently adopt a fourth type nobody had looked
  at"*). **`pending_action.expired` must be added there**, or the console's queue does not refresh when a question expires. Nothing in
  `packages/mock` switches over event types.
- **The pending flow's unit files:** `tokens/pending.test.ts`, `tokens/expiry.test.ts`, `api/tokens.test.ts`, and the confirm route's in
  `api/delegation.test.ts`.
- **F7: the driver contract has no case for a second create of one slug** (`source/driver-contract.ts`). Task 14's case is new.
