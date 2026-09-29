# The launch path plan's measurements — Task 1, 2026-09-29

**What this is.** The record of [the launch path plan](../../plans/2026-09-29-launch-path.md)'s Task 1: one section per
measurement, what was predicted, the raw answer (every command's full output is in
[`results-task1-2026-09-29.txt`](results-task1-2026-09-29.txt)), and what it confirms or corrects in the plan. Every probe is
in [`probes/`](probes/). **It also records the control plane's FIRST RUN AGAINST REAL GITHUB.** Rich asked for it — *"I want to
see apps created through the platform end up on real GitHub"* — and gave his yes and the network in the plan's first message.

**The machine.** macOS 26 (Darwin 25.6.0); Node 24.12.0; Docker Desktop as ORIENTATION §4 records; the control plane at `0904ad5`
(its `src/` unchanged since `c5f1493`); LiteLLM **1.98.0** (`infra/images.lock:9`, `sha256:20b5044b…`); the GitHub App
`Manifest (local dev)` (id `5068172`, installation `164652178`) on the free organisation `Manifest-local-dev`. Load 5.2–6.8
throughout.

**Nothing under `packages/` changed.** No Vitest ran — any Vitest run truncates the control plane's tables, and a real repository
outlives its row.

---

## `[M10]` The baseline — Step 0

`make doctor` **20 checks, 0 failed, 0 warnings**; `make verify` **61, 0, 0** — ORIENTATION §2's box, unmoved. `pnpm test` and
`pnpm test:docker` not re-run: the tree is unchanged since `11f2526`, where they read **2826 in 180** and **248 in 41** (the LEAN
budget). The contract: **`1.4.0`, 66 operations, 55 paths, 90 schemas, 128 error codes, 46 event types**; **40 migrations**, the
newest `0039_harsh_jack_power`. *Read this first* 24–26 — **confirmed**.

## `[M1]` The control plane on the REAL App — Step 1

**Predicted: every step green. It was — and it is the first time.** In order:

- **The organisation was empty** (`total_count=0`), and api.github.com answered in 0.22 s.
- **The restart.** The driver-1 control plane (PID 63494) stopped, and `cp-start.sh` (sitting 11a's, unchanged) started from Rich's
  `.env`. The boot line read `"source":"github","github":"api.github.com","githubOrg":"Manifest-local-dev"`, with no credential
  in the log (`grep -c 'ghs_\|BEGIN\|sk-'` → 0).
- **The front-end's two driver-1 projects answer `409 SOURCE_PROVIDER_MISMATCH`**, in words that name the restart that fixes it.
  Read-only.
- **`lp-real-a`, created through the platform, is a real private repository** — `createProject` in **8 s**, from the `proof-app`
  starter:
  - GitHub reads `private=true visibility=private`, `main` at the platform's seed sha `3c23875`, author and committer
    `Manifest <manifest@manifest.internal>`;
  - `mainProtected: false`, with GitHub's own words (*"Upgrade to GitHub Pro or make this repository public to enable this
    feature."*) — through the driver's **per-repository admin token**, never exercised before;
  - `repository.protection_unavailable` on the stream, in Manifest's own sentence.
- **Reads through the platform** — tree, file and history — each ~1 s through the `contents: read` token, never exercised before.
- **A commit through the authoring API lands on github.com**: `createCommit` in **5 s** → `cec7653`, which is then GitHub's `main`.
- **Built from the mirror and deployed**: the build `succeeded` in **19 s**, the sandbox deploy was `healthy` in **9 s**, and
  `https://lp-real-a.sandbox.manifest.internal/` answers the proof app's own page — not the edge's wildcard.
- **Deleted, for real**: `lp-real-scratch` was created (9 s; GitHub `200`), then deleted after a step-up (`200`, `state:
  deleted`, 1 s). **GitHub then answers `404 Not Found`, and the mirror is gone** — the per-repository admin token's `DELETE`,
  never exercised before. The slug was taken AGAIN (`201`; GitHub accepted the name) and deleted again.
- **After**: the organisation holds exactly `lp-real-a`. GitHub's timings: token mints 313–448 ms; REST reads 350–1101 ms.

**What it found:**

- **F1 — the real App's driver adopts the FAKE's orphaned mirrors.** The boot's `"sourceRepositoriesPrepared":2` counts
  `frontend-github.git` and `frontend-scratch-github.git`. Both are mirrors of the FAKE (`manifest.webUrl`
  `http://127.0.0.1:7110/…`) with no row, left by the last plan's `demo-frontend` driver-2 runs, and the real driver rewrote their
  hooks as its own. Harmless today (the hook refuses every push), **but nothing on disk or in a row tells a fake-made repository
  from a real one** — *Read this first* 14's case, now seen. **Task 2 gains it** (`[M1]` there).
- **F2 — GitHub shows the PERSON as each API commit's author**: *"Test Instructor <02f94aa7-…@users.manifest.internal>"*, with
  Manifest as committer. **A person's display name leaves the platform for GitHub with every commit made through the API** — into a
  private repository in UBC's own organisation at UBC. It is the privacy assessment's to name (a *where it flows* fact), so **Task
  11 gains it**. On the laptop it goes to Rich's free organisation.
- **F3 — `.env.example:78`'s *"nothing deletes"* is wrong**, now measured live: deleting a never-launched project deleted its
  repository on GitHub. Task 2 already corrects it.
- **F4 — `scripts/lib/api.sh`'s `api` can never send a bodyless `DELETE`.** It always sends `content-type: application/json`,
  and the platform refuses a bodyless request so marked `400 REQUEST_INVALID` (P5b's rule — the platform's behaviour is right).
  Found when the probe's first two deletes were refused. **Task 2 gains it**: `content-type` only with a body.
- **Not measured**: Step 1(h), a push on github.com the platform did not make — Rich's hands, asked at the sitting's close; a
  failed create and a fake-made project on the real App (Task 2's unit tests, against the fake).

## `[M3]` LiteLLM 1.98.0 narrowing a live key — Step 2

**Predicted: `/key/update` narrows a live key, perhaps only by its hashed token; the withdrawn model refused, perhaps after a
cache delay.** Measured:

- `/key/update { key_alias, models: ['default-embed'] }` — **by the ALIAS alone** — answers `200`, the key's `models` now
  `['default-embed']`.
- **20 ms later, the same key's chat on `default-chat` is refused `403 key_model_access_denied`** (*"This key can only access
  models=['default-embed']"*), and its embedding still answers `200`.
- `/key/list` agrees.

**F5 — Decision 23 holds exactly, by the simpler route: the alias the platform already derives, no hashed token, no cache
window.** Task 7 needs no `/key/list`, and Spec action 1's option (a) needs no bound. The probe's key and user were removed.

## `[M4]` An open stream after a revoke — Step 3

**Predicted: FE-33's measurement repeats. It did.** On `lp-real-a`:

- a token (`project:read`) opened the stream and read its replay and ready frame;
- the person revoked it (`200`) and renamed the project;
- **the token's socket was still open 30 s later, and had received `project.renamed`.**
- A new upgrade with the revoked token closed `1006`, and a `GET` of the same URL answered `401 UNAUTHENTICATED`.

**F6 — FE-33 reproduced on this machine.** Task 5 stands as written.

## `[M5]` The capable model's fallback, by the provider's error — Step 4

**(a) Which errors a `general` fallback answers.** A stub OpenAI-shaped provider on the host answered each status, and thirteen
probe models, each with a `general` fallback to `default-chat`, were called through one probe key. **Predicted from
`router.py:6279-6531`: every error falls back, `400` included.**

- **Measured: `400`, `401`, `403`, `404`, `408`, `429`, `500`, `502` and `503`, the 5-second timeout and a refused connection
  ALL answered `200` from `ollama_chat/qwen3.5:4b`**, with `x-litellm-attempted-fallbacks: 1`.
- The healthy probe answered itself (`attempted-fallbacks: 0`).

**F7 — confirmed: LiteLLM 1.98.0's `general` fallback answers every provider error, a client's malformed request included.**

- **F8 — NEW: a provider's `422` reaches the client as HTTP `200` with a body of literal `null`** — no fallback header, no error,
  19 ms. The stub saw the request TWICE. Measured on both runs. **A client reads success with nothing in it.** This is LiteLLM's,
  on the path the capable model uses, and **Task 6 gains it** (`[M5]` there).

**(b) Whether a hook can see the original error.** A probe LiteLLM from the same pinned image (`127.0.0.1:7197`, no database)
loaded `t1-probe_hook.py` as a callback.

- **The hook runs on the fallback deployment's call, with `fallback_depth: 1`.** The failed call's `exception_type`
  (`BadRequestError`, `ServiceUnavailableError`) is in `metadata.previous_models`.
- **F9 — `previous_models` is the ROUTER's list, shared across requests** (it holds at most four entries; `log_retry` pops the
  oldest). The second request's hook saw the first request's `BadRequestError` too. **Each entry carries `litellm_trace_id`, and
  the fallback call carries its own**, so a guard can pick ITS request's failure — `mine = ['BadRequestError']` for the 400,
  `['ServiceUnavailableError']` for the 503. With no entry of its own (evicted under load), a guard must ALLOW the fallback.
- **F10 — the guard works.** With the hook refusing a fallback whose own error is a client error, **the `400` primary reaches the
  client as HTTP `400`**. The body is the provider's own message (*"the stub refused this request with 400"*), with LiteLLM's
  fallback debug text appended. **The `503` primary still falls back, `200`.**

**So Task 6 is Branch G, and Spec action 6's option (a) applies** — Rich decides it before sitting 4. Everything was removed: the
probe container, the stub, and every probe model, fallback, key and user (the platform's LiteLLM reads 0 named `probe`).

## `[M6]` The structure UBC IAM receives — Step 5

**`saml-metadata-generator`'s `generateMetadata`, run from a COPY** (`probes/t1-smg-run.ts`) with the tool's own defaults and a
throwaway 2048-bit certificate, wrote [`probes/ubc-structure.xml`](probes/ubc-structure.xml). It is well-formed (`xmllint
--noout`).

- **Namespaces**: `md`, `ds` and `alg` on the `EntityDescriptor`, and `init` inline on one element.
- **Order**:
  1. `md:Extensions` — `alg:DigestMethod` ×3 (sha256, sha384, sha512) and `alg:SigningMethod` ×4 (rsa-sha256/384/512,
     ecdsa-sha256).
  2. `md:SPSSODescriptor` (`protocolSupportEnumeration` SAML 2.0, 1.1 and 1.0), holding in order:
     - `md:Extensions` — `init:RequestInitiator` at `/Shibboleth.sso/Login`;
     - `md:KeyDescriptor use="signing"` — `ds:KeyName` (the hostname), and `ds:X509Data` with `X509SubjectName` and
       `X509Certificate` in 64-character lines;
     - `md:KeyDescriptor use="encryption"` — the same, plus `md:EncryptionMethod` ×3 (aes128-gcm, aes256-gcm, aes256-cbc);
     - `md:SingleLogoutService` ×3 and `md:ManageNameIDService` ×3;
     - `md:AssertionConsumerService` ×6 (index 1 HTTP-POST `isDefault`) — **every one a Shibboleth daemon path**.
  3. `md:Organization` — Name, DisplayName, URL.
  4. `md:ContactPerson contactType="technical"` — `EmailAddress` only.
- **No `NameIDFormat`, no `AttributeConsumingService`, no `RequestedAttribute`** — UBC asks for attributes on its own form.
- **F11 — the tool's `entityID` is the app's URL**, not §9's `https://{platform-domain}/sp/{slug}/{environment}`, and its `ID`
  is `Math.random`. Both confirm Decision 12: reuse the structure, never the code.
- **No XML parser is a direct dependency of `packages/control-plane`.**

**Task 10's renderer** (`[M6]` there) keeps:
- the namespaces, the top `Extensions` with the tool's default algorithm lists, and both KeyDescriptors with the encryption
  methods;
- `Organization`, and `ContactPerson` technical, with `support` beside it;
- **one** SLO (HTTP-Redirect, the app's `auth.logout`) and **one** ACS (HTTP-POST at the app's `auth.callback`, index 1,
  `isDefault`).

It drops `RequestInitiator` and `ManageNameIDService`, and declares SAML 2.0 alone (`passport-ubcshib` speaks nothing else).
`ubc-structure.xml` is its structure fixture.

## `[M9]` Where the blueprint's code reads each attribute — Step 6

The skeleton's passport user is `{ profile, user: bridge(profile) }` (`auth/ubcshib.js:136`), so app code reads
`req.user.user.<friendlyName>` or `user.<friendlyName>` — the bridge's seven friendly names. **Predicted: every read is
`.<name>`. Confirmed**, outside the blueprint's `auth/`:

| Name | Reads | Where |
|---|---|---|
| `ubcEduCwlPuid` | 6 | the proof app's `server.js` (`req.user.user.ubcEduCwlPuid`, `user.ubcEduCwlPuid`) |
| `mail` | 1 | **the proof app's BROWSER code** — `public/app.js:25`, `me.attributes?.mail` |
| `givenName` | 3 | the proof app, `bulletin-board`, `frontend-app` |
| `sn` | 3 | the same three |
| `eduPersonAffiliation` | 2 | the proof app, `bulletin-board` |
| `eduPersonPrincipalName`, `uid` | 0 | — |

**F12 — a read can be in client JavaScript an app serves** (`public/`), reached through the app's own `/me`. So Decision 14's
search includes `.html`, `.js` and `.mjs` under `public/`, and the justification says *"shown in the browser"* when it is only
there. Task 10 gains it.

## `[M8]` The launch records today — Step 7

On `lp-real-a`:

- **(a)** `getLaunchRecords` → both `null`; `getLaunchReadiness` → `ready=false`, with `iam-registration` and
  `privacy-assessment` `unmet` (*"Nothing has been recorded for this project yet — an administrator…"*). `rehearsal`, `scans`
  and `admin-approval` are `unmet` — nothing serves staging — and `code-review` is `not_built`, non-blocking.
- **(b)** The OWNER's `recordIamRegistration` → **`403 FORBIDDEN`**, *"role 'owner' may not 'launch:record'"*.
  - **F13 — its hint says *"Ask a project owner to grant you the role this action needs"***. It says that TO the owner, about a
    capability only an administrator holds. **Task 9 gains it**: a platform-admin-only capability's refusal names an
    administrator.
- **(c)** `operator` was made an administrator exactly as `demo-production.sh` does (`admin-grant.sh`; the role change audited).
  It recorded a `draft` listing `ubcEduCwlPuid` alone, and **the owner's next SANDBOX build FAILED `SPEC_ATTRIBUTE_NOT_REGISTERED`**
  — *"manifest.yaml asks for 4 CWL attribute(s) UBC IAM did not register for 'lp-real-a': eduPersonAffiliation, givenName, mail,
  sn."* **F14 — *Read this first* 7, measured: a draft gates every build, the sandbox's included.**
- **(d) The positive control**: the record went `submitted`, then `active` with all five (ticket `PROBE-T1`), and **the same build
  `succeeded`**.

**F15 — the build check's tests live in `releases/build-attributes.test.ts`**, which Task 9's *Files* does not name (it names
`build.test.ts`). Corrected there. And a grep finds one mention of the CHECK Task 9 changes, in a comment
(`launch/records.test.ts:148`), so Step 8's prediction — no test turns red — stands for now.

**`lp-real-a` is left with an `active` production registration** (a probe's, ticket `PROBE-T1`) and **`operator` is an
administrator** — both until the next Vitest run truncates them.

## The seams' predictions — Step 8

Written down before sitting 2, from the plan:

- **Task 4** first moves `openapi.json`, and the contract becomes **`1.5.0`**, taken once.
- **Six** new event types, and **eight** migrations, `0040`–`0047`.
- Task 9's CHECK change turns **no** existing test red.
- Task 3's drain turns no test red, and `api/delivery.test.ts`'s deadlock rate goes to **0 of 8**.

A wrong one is a finding at the sitting that meets it.

## The probes' own defects

**F16 — four defects in the PROBES, each caught by reading the answer rather than trusting the exit status, and none reaching a
record**:
- a create with no starter ended `set -e` silently in a command substitution, and created nothing;
- the first two deletes carried `content-type` with no body (F4's cause);
- a summariser used a top-level `return` in `node -e`;
- the first Step 7 script's requests all answered `REQUEST_INVALID` through a quoting fault that was never isolated — replaced by
  plain `curl`, whose first call recorded the administrator's draft (the precondition of 7(c)).

## What changed in the plan

`[M<n>]` blocks at the head of Tasks 2 (F1, F4), 6 (F7–F10, and F8's `422`), 7 (F5), 9 (F13, F14, F15), 10 (F11, F12) and 11
(F2). **No task boundary moves**: the twelve-sitting split stands, and Spec action 6 is now needed before sitting 4 (Branch G).
