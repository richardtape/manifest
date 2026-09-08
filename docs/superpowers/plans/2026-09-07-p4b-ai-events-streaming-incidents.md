# P4b — AI, Events, Streaming and Incidents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The proof app asks a question and gets an answer — through a virtual key the control plane minted for that app and environment, confined to three routes, charged to a budget, with the student identified by a hash that cannot lock them out of any other Manifest app — and when something breaks, a faculty member sees a sentence rather than a stack trace, streamed live.

**Architecture:** Four seams, in dependency order. **`ai/`** is the LiteLLM admin client: one place that mints keys, and `allowed_routes` is a constant in it rather than a parameter. **The catalogue** (D17) stops being a hardcoded array in a route handler and becomes a read of `/model/info`, which is the only surface carrying `max_classification`. **`observability/` grows up** — P4a shipped the `events` table, the append-only grant, the exact-match redactor and two call sites; P4b adds build-log capture, the heuristic half of redaction, §14's `Incident`, and `WS /projects/:projectId/events`, which authorizes *before* it upgrades so that §16's authorization contract suite can cover it like any other route. On top sits the blueprint's AI component and the proof app's second half.

**Tech Stack:** TypeScript on Node 24, Fastify 5.12.3 with `@fastify/websocket` 11.3.0 (`ws` 8.21.3), Drizzle over Postgres 16, Vitest, LiteLLM **1.98.0** pinned by digest, `ubc-genai-toolkit-llm` 0.7.0 over the `openai` SDK 4.x, Ollama on the host, and the same custom Caddy 2.11.4 edge P1 built.

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§10** (AI access) and **§14** (observability, incidents, redaction at capture) in full, plus §6 (the `Event`, `Incident` and `AgentSession` rows), §7's D17 classification gate, §8's AI rows, §12 (east-west isolation, egress), §16 (the AI-path regression, security-regression and authorization tiers), §20 (audit integrity, machine-actionable errors), §22 (D23.2 — one event stream per project, never polling) and §25 (blueprints).

**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — P4's scope, and gaps 2 and 6.

**Predecessor:** [`2026-09-07-p4a-identity-secrets-injection.md`](./2026-09-07-p4a-identity-secrets-injection.md). Its *What this plan does not build* section is P4b's brief and this plan is written from it. Read P3's *Sessions 4 and 5* as well; between them they establish that no build and then no deploy in this platform had ever succeeded, both invisible behind a fully green test suite.

---

## Read this first: this plan was written before P4a ran

**The roadmap's *Order of operations* step 7 says P4b stays unwritten until P4a has executed**, and gives the reason: banking a second unexecuted plan is what the 2026-09-04 decision forbids, and writing P4b against an *imagined* P4a is what cost P3 eight defects when it was reconciled against a real P2.

**Rich asked for it now (2026-09-07), so it is written now.** That reason has not gone away, so it is answered rather than ignored:

- **Task 1 is a reconciliation pass** against the executed P4a, with a named checklist of every P4a symbol, file and table this plan consumes. It is not optional and it is not a formality. P3's equivalent pass took one sitting and found eight defects, two of which would have silently reverted P2's own fixes.
- **Every seam this plan inherits from P4a is listed in Task 1 with the exact name P4a promises**, so the check is a `grep` and a signature comparison rather than a re-read of 3,000 lines.
- **Where P4a's own text is ambiguous, this plan says so at the point of use** rather than picking silently. There are three such places and Task 1 names all three.

**Treat "the plan is written" as a hypothesis.** The measured rate across P1, P2 and P3 is 1.4 → 2.7 → 4.3 defects per task, and it rose every time the work stopped being pure functions. P4b is not pure functions.

---

## Findings this plan is built from

P4b has no research left in it. Every value below was measured, and the measurements are dated.

| Source | What it settles for P4b |
|---|---|
| [`S3-findings.md`](../spikes/S3-findings.md) | Almost all of `ai/`. Budgets bind only with a synthetic per-token cost and overshoot by ~one request; `budget_duration` aligns to a calendar boundary so `1mo` is required and `30d` is not a rolling window; `/user/new` + spend roll-up works as §10 assumes; the end-user budget is **global across apps**, so `user` must be `hash(puid ‖ project ‖ env)`; `encoding_format: 'float'` is mandatory on every `embed()`; a thinking model streams **zero content frames** with no error; revocation is 0.11 s; **there is no admin port** and `allowed_routes` is the control; an unconfined key mints a child that **outlives its parent**; request/response logging is off by default and the switch is `store_prompts_in_spend_logs` in YAML; and Evidence 13's error-envelope table. **Tasks 2–9, 15.** |
| [`S6-findings.md`](../spikes/S6-findings.md) | The probe matrix P4b's network change must not weaken, and its own note that *"LiteLLM's `allowed_routes` probe is P4's"*. **Tasks 2 and 7.** |
| **P4a's measurements, 2026-09-07** | `ubc-genai-toolkit-llm@0.7.0` reproduces all three S3 findings; **the toolkit cannot be forced through the egress proxy** by any environment-level mechanism, because the OpenAI SDK v4 bundles `node-fetch` with its own `agentkeepalive` agent and the toolkit exposes no `httpAgent`. **Tasks 7 and 9.** |
| **Measured 2026-09-07, for this plan** | The section below. Ten facts, one of them a specification that cannot be implemented as written. |

### What was measured for this plan, on 2026-09-07

Probed against the running platform (`make up`, nine platform containers healthy) before any task was written, because the house rule is that **no step may stand in for a spike result**. Every probe was read-only; nothing was created, and the machine was left exactly as found.

**M1. `/model/info` carries `max_classification`, and it round-trips verbatim from `config.yaml`.** This is what makes D17 implementable with one source of truth:

```
$ curl -s -H "Authorization: Bearer $LITELLM_MASTER_KEY" http://127.0.0.1:7106/model/info
default-chat        |max_classification= internal    |mode= None      |db_model= False
default-chat-onprem |max_classification= confidential|mode= None      |db_model= False
default-embed       |max_classification= internal    |mode= embedding |db_model= False
```

**But `model_info` carries 115 keys per entry.** A catalogue reader projects three of them and passes the projection around; handing the raw object to `checkPolicy` would put every per-token cost and every `api_base` inside a validation context.

**M2. `mode` is `null` for a chat model, not `"chat"`.** Read the middle column above. A catalogue reader that selects chat models with `mode === 'chat'` gets an **empty catalogue**, every spec then fails validation with `SPEC_MODEL_UNKNOWN`, and the symptom reads as a LiteLLM outage rather than a filter bug. Only `default-embed` names its mode, because §21's `config.yaml` sets `mode: embedding` on that entry alone.

**M3. `/v1/models` — the only model route a confined key may call — carries neither `max_classification` nor `mode`:**

```json
{"data":[{"id":"default-chat","object":"model","created":1677610602,"owned_by":"openai"}, …]}
```

So the catalogue read is a **control-plane operation with the master key**, and an application cannot check its own classification even if it wanted to. That is D17 working as designed — the gate is at spec validation — but it means the read cannot be delegated to the app or to the blueprint.

**M4. All three bootstrap entries report `db_model: false`** while `STORE_MODEL_IN_DB` is `True` in `infra/compose.yaml`. The two are consistent: the flag governs models **added through the admin API**, and S3's Evidence 7 finding stands — a config-file deployment cannot be deleted through that API. `/model/info` returns both kinds in one list, which is precisely why reading it is the right single source rather than reading `config.yaml`.

**M5. The LiteLLM image is a moving tag and is not pinned anywhere.** The running container is `sha256:20b5044b619055374061a6d5b7b08754cad75aeabbf82ddf4f69cc0cf80ddaf4` — **exactly S3's digest** — and carries `litellm-1.98.0.dist-info`, so S3's error table and P4a's re-measurement both still describe the running system. But:

```
$ grep -c litellm infra/images.txt infra/images.lock
infra/images.txt:0
infra/images.lock:0
$ grep image: -A0 infra/compose.yaml | grep litellm
    image: ghcr.io/berriai/litellm:main-stable
```

§16 requires the error mapping be *"pinned to the LiteLLM version in §21's inventory"*. Nothing pins it. A `make seed` on a second machine — the one thing P1 never tested — installs whatever `main-stable` points at that day, and Task 4's mapping is asserted against 1.98.0. **Task 2 fixes it.**

**M6. `@fastify/websocket@11.3.0` installs clean under pnpm 11.** Checked because pnpm 11 makes an un-named dependency build script a **hard error** (ORIENTATION §4):

```
@fastify/websocket 11.3.0  scripts: lint, test, lint:fix, test:unit, test:typescript   (no install/postinstall)
  ws            8.21.3     scripts: lint, test, integration                            (no install/postinstall)
  duplexify      4.1.3     scripts: test
  fastify-plugin 6.0.0     scripts: lint, test, …
ws peerDependencies: bufferutil ^4.0.1, utf-8-validate >=5.0.2 — BOTH optional
```

`bufferutil` and `utf-8-validate` are the native accelerators and they are **optional peer dependencies**, which pnpm does not install by default. So the whole closure is script-free. Built against `fastify ^5`; the workspace runs fastify **5.12.3**.

**M7. Dual-homing a platform container onto an `--internal` app network is not a new mechanism — it is already load-bearing.** `ensureEgressProxy` creates the per-app proxy with `NetworkMode: <app network>` and then:

```ts
// egress.ts — "DUAL-HOMED, and this is the one container that is."
await engine.post('/networks/manifest-platform/connect', { Container: name })
```

and every app reaches it by name from inside an internal network on every P3 deploy. `ensureAppNetwork` does the same in the other direction for `manifest-caddy` and `manifest-dns-containers`, and `attachPlatformNeighbours` **reads the network back** after connecting because the POST cannot report success. So attaching `manifest-litellm` needs no spike: it is the mechanism P3 already exercises, with the verification already written.

**M8. The per-app egress allowlist already permits LiteLLM, so after Task 7 there are two paths to it.** `PLATFORM_EGRESS_BASELINE` in `runtime/docker/egress.ts` contains `^manifest-litellm$`, and `proxyEnvironment` sets `NO_PROXY: 'localhost,127.0.0.1'` and nothing else. So a proxy-honouring client reaches LiteLLM **through** the forced proxy and the OpenAI SDK reaches it **directly** on the app network. Both work, and `allowed_routes` holds on both — which is §12's own argument for why the per-key control is stronger than the port rule it replaced.

**M9. `ubc-genai-toolkit-llm@0.7.0` is still the published version**, and its dependency closure is `@anthropic-ai/sdk ^0.95.2`, `ollama ^0.5.14`, `openai ^4.89.0`, `ubc-genai-toolkit-core ^0.1.0`, `zod ^3.25.0`, `zod-to-json-schema ^3.24.5`. Two provider SDKs the platform never uses land in every faculty app's image and in Verdaccio's warm set. Not a blocker; it is why Task 9 checks the offline build rather than assuming it.

**M10. `ai.budget.per_user_monthly_usd` cannot be enforced at this LiteLLM version, and §10 implies it can.** This is the finding that changed a task. LiteLLM's per-end-user budget lives on a **customer** row:

```
POST /customer/new   { user_id, max_budget, budget_duration, budget_id, … }
POST /customer/update{ user_id, max_budget, budget_id, … }
```

and end-user rows **auto-create on first use with no budget** (S3 Evidence 5). There is no proxy-level or per-key default: `max_end_user_budget`, `end_user_budget` and `default_internal_user_params` are all **absent from LiteLLM 1.98.0's OpenAPI document** (grepped, 1.28 MB, three misses). So setting a per-user budget requires an explicit call naming `sha256(puid ‖ project ‖ environment)` — a string that exists only at request time, **inside the app**, whose key is confined to three routes and correctly 403s on `/customer/new`, and which §12 forbids from reaching the control plane API.

**Consequence:** P4b ships the **project** budget (measured to bind, S3 Evidence 4) and the **namespaced end-user identifier** (which is what prevents S3's cross-app lockout, the actual harm). It does **not** enforce the per-user budget, because doing so needs a lazy customer-registration path driven by spend logs — which is a reconciler, and §11's reconciliation loop is Phase 4 (D10). Named in *What this plan does not build*, with a spec action against §10.

---

## Decisions this plan makes, and why

Fifteen questions were open when this plan was written. Each is settled here, because a plan that defers one is a plan that cannot be executed.

**1. This plan was written before P4a executed, and Task 1 is the answer.** See *Read this first*. The reconciliation is a task with a checklist, not an instruction to be careful. **Cost of changing course:** none — if P4a's execution moves a seam, Task 1 is where this plan is edited, and every later task names the P4a symbol it consumes so the edit is local.

**2. P4b pins LiteLLM's image, and that is P1-shaped work inside a TypeScript plan.** M5. The same call P4a made about the IdP in its Decision 2: the plan that depends on a version owns pinning it, because a P1 amendment splits one deliverable across two plans and that is how a seam gets forgotten. *Rejected:* asserting the version in a test and leaving `main-stable` floating — that converts a routine `make seed` on a new machine into a red suite with no explanation, which makes the untested second-machine clone worse rather than better.

**3. The model catalogue is read from `/model/info`, projected to three fields, and fails closed.** M1, M3. *Rejected:* `/v1/models`, which carries neither field (M3); and keeping the hardcoded array in `api/routes/projects.ts`, which is two sources of truth for D17 — the §8 failure one level up. **An entry with no `max_classification` is refused, never defaulted.** P4a paid a whole task for `core:AttributeLimit` failing open; a defaulted classification here would silently let a `confidential` app resolve an off-premise model, which is the one failure §7 calls *"a privacy incident at runtime"*.

**4. A chat model is `mode !== 'embedding'`, never `mode === 'chat'`.** M2 — measured, both chat entries return `null`. Getting this backwards produces an empty catalogue, and an empty catalogue fails every spec with `SPEC_MODEL_UNKNOWN`, which reads as a LiteLLM outage rather than a filter bug.

**5. `manifest-litellm` joins an app network only when that app declares `ai.models`.** P4a's note said to add it to `PLATFORM_NEIGHBOURS`. *Rejected on two counts:* `attachPlatformNeighbours` throws when a named container is missing, so every app network — including every app with no AI at all — would then depend on LiteLLM being up; and §12's least privilege says an app that declared no models has no business holding a route to the model gateway. `ensureAppNetwork` gains an `extraNeighbours` parameter instead, and `ensureInstance` passes `['manifest-litellm']` only when the resolved config has models. The mechanism itself needs no probe (M7).

**6. `resolveConfig` gains an `ai` block.** `ResolvedConfig` carries no `ai` today, so `deployRelease` — which reads `release.resolvedConfig` — cannot see the models or the budget without re-parsing the AppSpec at deploy time. **Re-deriving a value the release already fixed is the exact defect shape that produced seven of P3 Session 5's twenty-one defects.** §13 makes a Release immutable — Build + AppSpec + resolved config — and the resolved config is what a deploy reads. It also means an in-flight spec edit cannot change the key a redeploy mints.

**7. The project budget goes on the LiteLLM *user*; the key carries no budget.** §10 says so and S3 Evidence 3 measured it: app keys rotate every deploy, and a budget on the key resets with it, so a monthly ceiling on the key is not a monthly ceiling. `budget_duration: '1mo'` — **never `30d`**, which S3 measured as aligning to a calendar boundary rather than rolling, with `7d` behaving as one day.

**8. `allowed_routes` is a constant in `ai/keys.ts`, not a parameter.** Every key Manifest mints passes through one function, and no caller can weaken it. *Rejected:* a default parameter. A default is one keystroke from being overridden and reads as correct in review — which is precisely the shape of P2's `devAuthEnabled: true`, one line from a live authentication bypass. S3 measured what the weakened form buys an attacker: a key that mints a child surviving its parent's revocation.

**9. The LiteLLM error mapping reads the envelope *and* the message, and a test pins it to 1.98.0.** S3 Evidence 13: a route denial arrives as `{"detail": …}` with **no `type` at all**, while key-over-budget and end-user-over-budget share `429` + `budget_exceeded` and differ only in the message text. So the mapper tries `error.type`, falls back to `detail`, and disambiguates the two budget cases on a message substring. That is brittle by construction, which is why Task 2's tier re-measures every row against the running proxy and why Decision 2 pins the image.

**10. A LiteLLM error body never reaches an `Event`.** §14 and §20: the revocation body carries the masked key **and the full key hash**. The mapper produces a Manifest code and a faculty-legible sentence; the raw body reaches `machine_detail` only through P4a's redactor, and the app's current key **and its hash** are added to that app's secret set for exactly this reason.

**11. Build logs are stored in Postgres, in their own table.** `builds.logs_ref` has named a store that does not exist since P3 wrote it, and P3's own column comment says so. *Rejected:* a file per build on the host (the control plane must not own a log directory `make reset` has to know about, and the driver's containers cannot see it anyway), and streaming from the daemon on demand (the ephemeral builder is deleted with `v=true` in a `finally`, so its logs are gone before anyone asks). A `build_logs` table, append-only by the same grant `events` uses.

**12. `WS /projects/:projectId/events` authorizes before it upgrades.** The route registers an ordinary HTTP handler **and** a `wsHandler`. `app.inject` cannot perform a WebSocket upgrade, so a socket-only route is a route §16's authorization contract suite structurally cannot cover — and that suite's drift guard fails the build on any uncovered route, which would tempt whoever hits it into writing an exemption. Instead the HTTP handler runs `assertCapability` and answers **426 Upgrade Required** to an authorized actor's plain GET, so the suite exercises the stream as owner, collaborator, stranger, admin and anonymous exactly like every other route — and a stranger gets `404` before a socket exists at all.

**13. An `Incident` is written by the deploy path, not by a watcher.** §11's reconciliation loop is Phase 4 (D10), so there is no periodic anything in Phase 1. `deployRelease` already observes the `starting → failed` transition and already has the instance handle, the failing check and the release; that is the one moment P4b actually has, and it is the moment a faculty member's deploy visibly breaks. A crash **loop** needs the reconciler and is named in *What this plan does not build* rather than half-built.

**14. The acceptance asserts the shape of the answer, not that an answer arrived.** S3 ran six toolkit checks, all six passed, and one returned 192 numbers where 768 belonged. So `make demo-ai` asserts a **non-empty content string from a streamed completion** (a thinking model yields zero content frames with no error, at any token budget) and **dimension 768** from an embedding. "It returned a vector" and "it returned the right vector" are different claims.

**15. The end-user identifier is computed by the app and never by the control plane.** `sha256(puid ‖ project ‖ environment)` — P4a's proof app already computes it, deliberately, so that P4b passes it through rather than migrating what an app stores about people. The control plane never sees a request-time PUID. *Rejected:* computing it centrally, which would need a second producer of that string, which is Session 5's shape again.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec or from a dated measurement.

- **Four gates, all clean before every commit**, run from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm --filter @manifest/control-plane typecheck`, `pnpm format:check`. `pnpm test` and `pnpm --filter … test` are different commands with different working directories, and that difference has been a defect three times. **Run `pnpm test` twice** — a suite that is not repeatable has a state leak.
- **`pnpm test:docker` too**, for every task touching `infra/`, `runtime/docker/`, `services/`, `ai/` or `observability/`. It needs `make up`, takes ~5 minutes, and **fails rather than skips** when asked to run.
- **Vitest strips types; it does not check them.** `exactOptionalPropertyTypes` is on. `hint: cond ? x : undefined` is a type error — conditional spread is the fix. Sixteen instances of this class have been found across P2 and P3.
- **Never edit the spec.** It is approved design. Record a proposed change in *Spec actions proposed by this plan*.
- **Ask before `sudo`.** It cannot prompt from a tool call. Bundle privileged steps into one script and ask Rich to run `! sudo bash <path>`.
- **macOS ships bash 3.2 and a BSD userland.** No associative arrays, no `mapfile`, no `xargs -r`, no `readlink -f`.
- **The zone is `*.manifest.internal`.** Never `.test` — Valet owns that TLD and ports 53/80/443.
- **Ports 7100–7199 only.** LiteLLM is published on **7106**; Caddy on 80/443 of the `127.0.0.2` alias is the sole exception.
- **Everything binds `127.0.0.1` explicitly**, never `localhost` — it resolves to `::1` and times out in build tooling.
- **Base images are pinned by digest and blueprint dependencies by exact version** (C6, D30). `descriptorSchema` already refuses anything but `x.y.z` in `pinned_dependencies`.
- **`request.log.error` writes nothing** under `Fastify({ logger: false })`. Use `console.error` for anything an operator must see.
- **Never accept a check you have not watched fail.** Every task ends by breaking what it built and naming the test that goes red.
- **Every task names its caller.** A module with no call site is not built — three instances so far, twice with passing tests.
- **Every denial in the §16 security tier is paired with a positive control**, and an unpairable control is **reported as unpaired rather than omitted** (spec action applied 2026-09-07).
- **Leave the machine as you found it.** `./scripts/snapshot-machine.sh` before and after; `diff` the two.
- **Commit after every task**, conventional messages (`feat:`, `fix:`, `chore:`, `test:`).
- **Test fixtures named in a snippet and not defined are local to that test file** — `fakeEngine`, `failingDriver`, `fakeDriverWithLogs`, `releaseThatReached`, `collectFrames`, `ownerSocket`, `closeCodeOf`, `waitUntil`, `specWithAi`, `aiContext`. Write each beside the test that uses it; none is a shared helper and none belongs in `src/`. This is P4a's convention and it is stated here so nobody goes hunting for one.

**What P4b does not create.** No `IamRegistration` or `PrivacyAssessment` rows, no `LaunchReadiness` gate, no approvals, no sandboxes, no `AgentSession`, no reconciler, no per-app metrics. Those are P6's and Phase 3's; see *What this plan does not build*. `POST /projects/:projectId/spec` keeps computing `isSensitiveDiff` and enforcing nothing, and `deployRelease` keeps refusing production with its §13 checklist. Growing a half-gate here is explicitly out of scope.

---
## File Structure

```
infra/
├── images.txt                          MODIFIED: ghcr.io/berriai/litellm:main-stable
├── compose.yaml                        MODIFIED: litellm pinned to its lock digest
└── litellm/config.yaml                 UNCHANGED — read, not edited (M4)

blueprints/node-ts-mongo/               P4a's blueprint, growing its AI half
├── blueprint.yaml                      MODIFIED: provides.ai true, three pinned deps
├── skeleton/package.json               MODIFIED: ubc-genai-toolkit-llm 0.7.0
├── skeleton/ai/llm.js                  NEW: the toolkit wired per §8, float-encoded
└── agents/AGENTS.md                    MODIFIED: the three AI obligations

fixtures/proof-app/                     P4a's proof app, growing its LLM half
├── server.js                           MODIFIED: /ask replaces P4a's stub
└── manifest.yaml                       MODIFIED: ai.models + ai.budget

packages/control-plane/
├── drizzle/0002_*.sql                  build_logs, incidents, and their grants
└── src/
    ├── config.ts                       MODIFIED: litellm settings
    ├── index.ts                        MODIFIED: the ai deps, wired into boot
    ├── db/schema.ts                    MODIFIED: buildLogs, incidents
    ├── ai/                             NEW
    │   ├── client.ts                   the LiteLLM admin transport, master key
    │   ├── errors.ts                   S3 Evidence 13's table, as one mapper
    │   ├── catalogue.ts                D17's catalogue from /model/info
    │   ├── keys.ts                     mintAppKey / rotateAppKey / revokeAppKey
    │   └── index.ts
    ├── observability/                  P4a created it; P4b grows it
    │   ├── redact.ts                   MODIFIED: entropy + pattern heuristics
    │   ├── build-logs.ts               NEW: the store builds.logs_ref names
    │   ├── incidents.ts                NEW: §14's Incident, as a repair prompt
    │   ├── bus.ts                      NEW: in-process fan-out, per project
    │   └── index.ts                    MODIFIED
    ├── spec/
    │   ├── resolve.ts                  MODIFIED: ResolvedConfig gains `ai`
    │   ├── injection.ts                MODIFIED: the AI rows render (Decision 12 of P4a, reversed)
    │   └── diff.ts                     MODIFIED: describeDiff, for the Incident
    ├── releases/release.ts             MODIFIED: key rotation, injection, incident
    ├── runtime/docker/networks.ts      MODIFIED: extraNeighbours
    ├── runtime/docker/driver.ts        MODIFIED: passes them when ai.models is declared
    └── api/
        ├── server.ts                   MODIFIED: @fastify/websocket, ai deps
        ├── routes/events.ts            NEW: WS /projects/:projectId/events
        ├── routes/projects.ts          MODIFIED: catalogue replaces the array
        └── authz-contract.ts           MODIFIED: the events route's five actors
```

**New configuration**, fixed here so every task agrees:

| Setting | Default | Why |
|---|---|---|
| `MANIFEST_LITELLM_URL` | `http://127.0.0.1:7106` | What the **control plane** calls LiteLLM. A host process on the published port. |
| `MANIFEST_LITELLM_INTERNAL_URL` | `http://manifest-litellm:4000/v1` | What an **app** calls it — service name on the app network, and it carries `/v1` because that is what `LLM_ENDPOINT` is. Two settings, never one derived from the other: `registryUrl`/`registryInternalUrl` is the same pair and its note says why. |
| `MANIFEST_LITELLM_MASTER_KEY` | none — **required outside development** | Mints and revokes keys. Guarded exactly like `MANIFEST_MASTER_SECRET`: optional in the schema, required outside development, generated-with-a-warning never — a generated master key cannot talk to LiteLLM at all, so this one **throws in development too** when a call is attempted. |
| `MANIFEST_AI_ENABLED` | `1` | Lets `pnpm test` run the non-Docker tier with no LiteLLM. **Not a kill switch for the confinement** — it gates whether the catalogue is fetched, never whether `allowed_routes` is set. |

---

## Task 1: Reconcile this plan against the executed P4a

**Files:**
- Modify: this plan, wherever a seam has moved.
- Test: the four gates, plus `pnpm test:docker`.

**Interfaces:**
- Consumes: everything P4a produced.
- Produces: a plan whose every named symbol exists, and a written record of what moved.

**Why this is Task 1.** P3 was written against an imagined P2 and reconciled against a real one before execution; that pass found **eight defects**, two of which would have silently reverted P2's own fixes, and one of which sat on the single assertion P3's self-review had already flagged as its worst. This plan has the same exposure and one more: **P4a itself may have changed during execution**, because P4a's tasks were instructed to fix the plan as they went.

**Do not skip a row because it "obviously landed".** The point of the checklist is that a moved seam is cheap here and expensive in Task 8.

- [ ] **Step 1: Confirm P4a executed and is green**

```bash
git log --oneline -25 | grep -i 'p4a\|proof app\|injection contract\|dev shim'
make doctor && make verify
pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check
make up && pnpm test:docker
```

Expected: all green. **If P4a has not executed, stop and say so** — every task below consumes something it builds, and executing this plan first is not a shortcut, it is a rewrite.

- [ ] **Step 2: Check every symbol this plan consumes, by name**

Each row is one `grep`. Record the actual signature next to the expected one; where they differ, edit this plan at the task named in the last column **before** starting it.

| P4a promises | Check | Used by |
|---|---|---|
| `renderInjection(ctx)` and `INJECTION_VARIABLES` in `src/spec/injection.ts` | `grep -n 'export const INJECTION_VARIABLES\|export function renderInjection' packages/control-plane/src/spec/injection.ts` | Task 8 |
| `INJECTION_AI_UNSUPPORTED` thrown for a spec with `ai.models` | `grep -rn 'INJECTION_AI_UNSUPPORTED' packages/control-plane/src` | Task 8 **deletes this** |
| The six AI rows present in `INJECTION_VARIABLES` with `requiredIn: 'if-ai'` | `grep -n "LLM_PROVIDER\|EMBEDDINGS_MODEL" packages/control-plane/src/spec/injection.ts` | Task 8 |
| `InjectionContext` — does it take `spec`, `resolved`, or both? | `grep -n -A 12 'interface InjectionContext' packages/control-plane/src/spec/injection.ts` | **Ambiguity 1**, below |
| `recordEvent(db, input, redactor)` and `EVENT_TYPES` in `src/observability/events.ts` | `grep -n 'export function recordEvent\|EVENT_TYPES' packages/control-plane/src/observability/events.ts` | Tasks 10, 12, 14 |
| `makeRedactor(secretValues)` in `src/observability/redact.ts` | `grep -n 'export function makeRedactor' packages/control-plane/src/observability/redact.ts` | Task 11 |
| The `events` table and its `manifest_audit_owner` grant | `docker exec manifest-postgres psql -U manifest -d manifest_control -c '\dp events'` — **not a host `psql`**, which this machine may not have | Tasks 11, 13, 15 |
| `putSecret` / `getSecret` / `secretValuesFor` in `src/secrets/store.ts` | `grep -n 'export async function putSecret\|secretValuesFor' packages/control-plane/src/secrets/store.ts` | Tasks 6, 11 |
| `deployRelease(db, driver, config, deps, input, healthWait?)` — the **deps** parameter | `grep -n -A 8 'export async function deployRelease' packages/control-plane/src/releases/release.ts` | Tasks 6, 8, 13 |
| `ServerDeps` — which fields P4a added | `grep -n -A 12 'export interface ServerDeps' packages/control-plane/src/api/server.ts` | Tasks 5, 13 |
| `testSessionCookie(user, secret)` in `src/identity/testing.ts` | `grep -n 'export function testSessionCookie' packages/control-plane/src/identity/testing.ts` | Task 13's authz entries |
| `blueprints/node-ts-mongo/` with `provides.ai: false` | `grep -n 'ai:' blueprints/node-ts-mongo/blueprint.yaml` | Task 9 |
| The drift test and its `ALLOWED_UNSET` / `PLATFORM_ONLY` sets | `grep -n 'ALLOWED_UNSET\|PLATFORM_ONLY\|fullContext' packages/control-plane/src/spec/injection-drift.test.ts` | Task 9 |
| The seed's mirror warm list derived from blueprint lockfiles | `grep -n 'lock' infra/seed/seed.sh` | Task 9 |
| `fixtures/proof-app/server.js` and its AI stub | `grep -n 'stub\|P4b' fixtures/proof-app/server.js` | Task 15 |
| `scripts/demo-identity.sh` and `make demo-identity` | `grep -n 'demo-identity' Makefile` | Task 16 |
| `POST /auth/dev-login` is **gone** | `grep -rn 'dev-login' packages/control-plane/src` | Task 13's authz entries |

- [ ] **Step 3: Settle the three places P4a is ambiguous**

Read the code, not the plan, and write the answer into this plan at the task named.

1. **Does `renderInjection` read `spec.ai` or `resolved.ai`?** P4a's Task 10 test builds a spec (`withModels([…])`) and its Task 11 call site passes `spec: parsedSpec`. **Decision 6 changes this to `resolved.ai`**, and Task 8 carries the change. If P4a's `InjectionContext` has no `spec` field at all, Task 8 gets simpler, not harder — note which.
2. **Where does `parsedSpec` come from in `deployRelease`?** P4a's Task 11 uses the name without showing the load. If it re-parses the AppSpec, Decision 6 replaces that read; if it does not exist, Task 8 adds `resolved.ai` and nothing else. **Either way, `deployRelease` must not parse a spec at deploy time after Task 8.**
3. **Is `recordEvent`'s redactor a parameter or a bound dependency?** P4a's signature says parameter; its Task 8 Step 5 call sites pass a bare `redact`. Tasks 10, 12 and 14 add three more call sites, and if every one has to build a redactor first, the redactor is the thing to bind. Record which, then keep it consistent.

- [ ] **Step 4: Write down what moved**

Append to this plan's *What executing this plan found*, dated, one line per divergence, in the form *"P4a's X is actually Y; Task N edited."* An empty list is a valid answer and is itself worth recording — it is the first time in this project a plan has reconciled clean.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-09-07-p4b-ai-events-streaming-incidents.md
git commit -m "docs: reconcile P4b against the executed P4a"
```

---

## Task 2: Pin LiteLLM, and re-measure S3's error table against the pinned version

**Files:**
- Modify: `infra/images.txt`, `infra/compose.yaml`, `scripts/doctor.sh`
- Test: `scripts/doctor.sh` — one new check

**Interfaces:**
- Consumes: nothing.
- Produces: `ghcr.io/berriai/litellm:main-stable` in `infra/images.lock`, and `manifest-litellm` running that digest; the shell constant `LITELLM_DIGEST` is **not** introduced — `images.lock` is already the one place digests live.

**Why this is second, and why it is shell.** M5: the tag is moving and unpinned, while §16 requires the error mapping be pinned to a version. Tasks 4 and 15 assert against LiteLLM **1.98.0**'s envelopes. Pinning is four lines; discovering the drift is a session, and it would be discovered on somebody else's machine.

- [ ] **Step 1: Write the failing check**

Append to `scripts/doctor.sh`, in the images section:

```bash
litellm_is_pinned() {
  # §16 pins the AI error mapping to "the LiteLLM version in §21's inventory".
  # `main-stable` is a MOVING TAG: measured 2026-09-07, it was absent from
  # images.txt and images.lock entirely, so `make seed` on a second machine
  # installs whatever it points at that day and Task 4's mapping — which reads
  # `detail` for a route denial and matches a MESSAGE SUBSTRING to tell a key
  # budget from an end-user budget — is asserted against a version nobody chose.
  grep -q '^ghcr.io/berriai/litellm:main-stable[[:space:]]' infra/images.lock \
    || { echo "litellm is not in infra/images.lock — run make seed"; return 1; }
  local want have
  want=$(awk '$1=="ghcr.io/berriai/litellm:main-stable"{print $2}' infra/images.lock)
  have=$(docker inspect manifest-litellm --format '{{.Image}}' 2>/dev/null || echo none)
  echo "litellm.lock=$want running=$have"
  [ "$want" = "$have" ]
}
check "the running LiteLLM is the digest infra/images.lock pins"  litellm_is_pinned
```

- [ ] **Step 2: Run it and watch it fail**

Run: `make doctor 2>&1 | grep -A2 'digest infra/images.lock pins'`

Expected: FAIL, `litellm is not in infra/images.lock`. **Watch the message**, not the exit status — a `grep` against a file with no matching line and a `grep` against a missing file both return 1, and only one of them is this defect.

- [ ] **Step 3: Add the tag and re-seed**

`infra/images.txt`, with the comment that says why it is here rather than in the list above it:

```
# NOT a base image and not mirrored into the local registry — nothing does
# `FROM` it. It is in this list for the one thing that buys: a DIGEST in
# infra/images.lock. §16 pins the AI error mapping to a LiteLLM version, and
# `main-stable` moves. Measured 2026-09-07: the running container was
# sha256:20b5044b… / litellm-1.98.0, exactly S3's digest, by luck rather than
# by configuration.
ghcr.io/berriai/litellm:main-stable
```

Then pin the compose reference to the lock, the way the other pinned services already read it:

```yaml
  litellm:
    image: ghcr.io/berriai/litellm:main-stable@${LITELLM_DIGEST:?run make seed}
```

and have `make seed` export `LITELLM_DIGEST` from `infra/images.lock` into `.env`, next to the other seed-written values. **Check `infra/seed/mirror-images.sh` first**: if it pushes every line of `images.txt` into the local registry, this tag must be excluded there — nothing pulls LiteLLM `FROM` anything, and mirroring a 2 GB proxy image into the registry is a slow no-op.

- [ ] **Step 4: Run seed and the check**

```bash
make seed && make up && make doctor 2>&1 | grep -A2 'digest infra/images.lock pins'
```

Expected: PASS, and the digest printed is `sha256:20b5044b619055374061a6d5b7b08754cad75aeabbf82ddf4f69cc0cf80ddaf4` unless upstream moved between 2026-09-07 and the run. **If it differs, stop and re-run Task 4's mapping tests before continuing** — that is the whole point of this task, and a different digest means S3's error table is a hypothesis again.

- [ ] **Step 5: The negative control**

```bash
# Edit infra/images.lock's litellm line to a digest of one wrong character.
# Expected: the doctor check RED, printing both digests. Then restore it.
# A check that reads the file it was written from cannot fail; this one reads
# the file and asks the DAEMON, which is why it can.
```

- [ ] **Step 6: Commit** — `chore: pin LiteLLM by digest, so §16's error mapping has a version`

---
## Task 3: §16's AI-path regression tier, before any `ai/` module exists

**Files:**
- Modify: `packages/control-plane/src/runtime/docker/s6.docker.test.ts` (probes 13 and 14 — the two its own header defers to P4)
- Create: `packages/control-plane/src/ai/ai-path.docker.test.ts`
- Create: `packages/control-plane/src/ai/testing.ts`
- Modify: `packages/control-plane/package.json` (a devDependency on the toolkit)

**Interfaces:**
- Consumes: `attachPlatformNeighbours`, `appNetwork` and `EngineClient` — all exported by P3 already; `describeDocker` from `docker-tier.js`.
- Produces: `mintProbeKey(opts)` and `deleteProbeKey(key)` in `ai/testing.ts`, and §16's **AI-path regression** tier as a permanent Docker suite.

**This is the end-to-end task, and it is third on purpose.** P3's two worst sessions were its last two, both because something ran together for the first time. P4a put a complete SAML login at Task 3 for the same reason. For P4b the unknown is not the toolkit — P4a measured that from the host on 2026-09-07 — it is **whether an application container on an `--internal` network can reach LiteLLM at all, and whether the confinement holds from there.** Everything Tasks 5–9 build is a way of producing that key and that route automatically. If they do not work by hand, nothing downstream can.

**`s6.docker.test.ts`'s own header asks for this**, verbatim: *"**app -> LiteLLM's admin routes** is enforced per key with `allowed_routes` (§10, §12, S3) and keys are P4's. P4 adds it here, with the negative control S3 names: a key minted without `allowed_routes`."* So the probes go in that file, not a new one.

**One thing about these probes is the opposite of every other S6 probe, and getting it wrong makes them useless.** S6's `exitCode()` helper reads the **exit code and never the output**, because a denied request's error page contains the same words a success does. That is right for a network denial and **wrong here**: `allowed_routes` denies at the application layer, so the TCP connection succeeds, `curl` exits **0**, and a probe reading the exit code passes identically on `200` and on `403`. These two probes assert `%{http_code}`.

- [ ] **Step 1: Write the key helpers**

`packages/control-plane/src/ai/testing.ts` — test-only, and it mints through `fetch` from the host because the control plane is a host process on the published port:

```ts
/**
 * Probe keys for the AI-path tier. NOT `ai/keys.ts` — that is Task 6, and this
 * tier exists to establish what Task 6 must produce before it produces it.
 *
 * `/user/new` FIRST, and it is load-bearing for the NEGATIVE control rather than
 * for the positive one. S3 measured that a key whose `user_id` was auto-created by
 * `/key/generate` is refused on `/key/generate` with `401 … Your role=unknown`, so
 * an unconfined key under an auto-created user would look confined — the escalation
 * control would "pass" while proving nothing. The capability comes from the user
 * row, which is exactly why §10's own table (Manifest calls `/user/new`) is what
 * creates the exposure `allowed_routes` closes.
 */
const LITELLM = process.env.MANIFEST_LITELLM_URL ?? 'http://127.0.0.1:7106'
const MASTER = process.env.LITELLM_MASTER_KEY ?? ''

async function admin(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${LITELLM}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${MASTER}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`)
  return JSON.parse(text) as Record<string, unknown>
}

export async function ensureProbeUser(userId: string): Promise<void> {
  try {
    await admin('/user/new', { user_id: userId, max_budget: 5, budget_duration: '1mo' })
  } catch (error) {
    // Already exists is the desired end state. Any other failure must surface:
    // swallowing it would make every probe below fail for an unrelated reason.
    if (!String(error).includes('already exists')) throw error
  }
}

export async function mintProbeKey(opts: {
  userId: string
  confined: boolean
}): Promise<string> {
  const body: Record<string, unknown> = {
    key_alias: `p4b-probe-${opts.confined ? 'confined' : 'open'}-${Date.now()}`,
    user_id: opts.userId,
    models: ['default-chat', 'default-embed'],
  }
  // The ONE difference between the two keys in the matched pair. S3 minted exactly
  // this pair under the same user and measured the escalation on the open one.
  if (opts.confined) {
    body.allowed_routes = ['/v1/chat/completions', '/v1/embeddings', '/v1/models']
  }
  const created = await admin('/key/generate', body)
  return created.key as string
}

export async function deleteProbeKey(key: string): Promise<void> {
  await admin('/key/delete', { keys: [key] })
}
```

- [ ] **Step 2: Write the two S6 probes**

Append inside `s6.docker.test.ts`'s `describeDocker` body, after probe 12:

```ts
/**
 * The state probes 13 and 14 share, declared in the suite's `beforeAll` beside
 * the existing `driver`/`image`/`service` fixtures. `engine` is built directly
 * rather than reached through the Driver — the Driver interface deliberately
 * exposes no engine, and `resolveSocketPath` is already imported by this file.
 */
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const PROBE_USER = 'p4b-probe-user'
let confinedKey: string
let openKey: string
// in beforeAll:
//   await ensureProbeUser(PROBE_USER)
//   confinedKey = await mintProbeKey({ userId: PROBE_USER, confined: true })
//   openKey = await mintProbeKey({ userId: PROBE_USER, confined: false })

/**
 * The HTTP STATUS, not the exit code. `allowed_routes` denies at the application
 * layer: the connection succeeds and `curl` exits 0 whether the answer is 200 or
 * 403, so S6's `exitCode()` helper — right for every network denial above — would
 * pass on both. This is the inverse of the trap recorded beside `exitCode`.
 */
async function statusFromNetwork(
  network: string,
  key: string,
  method: 'GET' | 'POST',
  path: string,
  body?: string,
): Promise<number> {
  const { stdout } = await run('docker', [
    'run', '--rm', '--network', network, '--dns', '10.89.0.53', PROBE,
    '-sS', '-m', '15', '-o', '/dev/null', '-w', '%{http_code}',
    '-X', method,
    '-H', `Authorization: Bearer ${key}`,
    '-H', 'Content-Type: application/json',
    ...(body ? ['-d', body] : []),
    `http://manifest-litellm:4000${path}`,
  ])
  return Number(stdout.trim())
}

const CHAT = JSON.stringify({
  model: 'default-chat',
  messages: [{ role: 'user', content: 'Say OK' }],
  max_tokens: 5,
})
const EMBED = JSON.stringify({
  model: 'default-embed',
  input: 'manifest',
  encoding_format: 'float',
})

it('13. an app that declares no ai.models cannot reach LiteLLM at all', async () => {
  // Decision 5's whole justification, asserted rather than argued. fixture-s6
  // declares no models, so `manifest-litellm` is not on its network and the name
  // does not resolve. 000 is curl's "no response" — it never got a status.
  const before = await statusFromNetwork(APP_NET, 'sk-irrelevant', 'GET', '/v1/models')
  expect(before).toBe(0)

  // THE POSITIVE CONTROL, and it is the same probe from the same container: attach
  // the neighbour Task 7 attaches for a declaring app, and the identical request
  // answers. Without this pair, `000` is indistinguishable from "curl is missing",
  // "LiteLLM is down" and "the timeout is too short" — S6's first run produced
  // exactly that and it is why the tier requires pairing.
  await attachPlatformNeighbours(engine, APP_NET, ['manifest-litellm'])
  const after = await statusFromNetwork(APP_NET, confinedKey, 'GET', '/v1/models')
  expect(after).toBe(200)
  record('13', `no route without ai.models (${before})`, `attached -> ${after}`)
})

it('14. a confined key reaches the three proxy routes and NO admin route', async () => {
  // Runs after 13, which attached the neighbour. Order matters and vitest runs
  // `it`s in file order within a describe; the attach is idempotent anyway.
  expect(await statusFromNetwork(APP_NET, confinedKey, 'GET', '/v1/models')).toBe(200)
  expect(await statusFromNetwork(APP_NET, confinedKey, 'POST', '/v1/chat/completions', CHAT)).toBe(200)
  expect(await statusFromNetwork(APP_NET, confinedKey, 'POST', '/v1/embeddings', EMBED)).toBe(200)

  for (const path of ['/key/generate', '/model/info', '/spend/logs', '/key/info']) {
    const status = await statusFromNetwork(APP_NET, confinedKey, path === '/key/generate' ? 'POST' : 'GET', path, path === '/key/generate' ? '{}' : undefined)
    expect(status, `${path} was not refused`).toBe(403)
  }

  // THE MATCHED PAIR S3 NAMES, and the reason `allowed_routes` is not optional:
  // the same user, the same models, the same everything, minus the confinement.
  const openStatus = await statusFromNetwork(APP_NET, openKey, 'POST', '/key/generate', JSON.stringify({ key_alias: `orphan-${Date.now()}` }))
  expect(openStatus, 'the unconfined key did NOT mint — the pair proves nothing').toBe(200)
  record('14', 'confined: 4 admin routes 403', `unconfined mints a child: ${openStatus}`)
})
```

- [ ] **Step 3: Restore S6's topology, and assert the restore**

In the same file's `afterAll`, before the existing teardown:

```ts
// S6's measured matrix ran WITHOUT LiteLLM on this network, and probe 13's own
// assertion depends on that being the starting state. Leaving it attached would
// make a second run of probe 13 pass for the wrong reason on its first line.
await engine.post(`/networks/${APP_NET}/disconnect`, {
  Container: 'manifest-litellm',
  Force: true,
})
const net = await engine.get<{ Containers?: Record<string, { Name: string }> }>(`/networks/${APP_NET}`)
expect(Object.values(net?.Containers ?? {}).map((c) => c.Name)).not.toContain('manifest-litellm')
await deleteProbeKey(confinedKey)
await deleteProbeKey(openKey)
```

- [ ] **Step 4: Run them and watch them fail**

Run: `make up && pnpm test:docker -- s6`

Expected: probe 13's first line already passes (`000`), and **that is the failure mode to be suspicious of**. Watch probe 13's *second* line and probe 14 fail with `000` everywhere until `attachPlatformNeighbours` is called with `manifest-litellm`. Record the numbers.

- [ ] **Step 5: The toolkit tier**

```bash
pnpm --filter @manifest/control-plane add -D ubc-genai-toolkit-llm@0.7.0
```

`packages/control-plane/src/ai/ai-path.docker.test.ts` — this half runs from the **host**, because the toolkit's behaviour is a property of the SDK and not of the network, and the network half is already covered above:

```ts
/**
 * §16's AI-path regression tier. Every assertion here is a finding that PASSED
 * SILENTLY before somebody looked at the number: S3 ran six toolkit checks, all
 * six green, and one of them returned 192 values where 768 belonged.
 */
describeDocker('AI-path regression (§16, S3 Evidence 8 and 9)', () => {
  /**
   * The toolkit, configured exactly as §8's contract configures it in an app —
   * `provider: 'openai'` (there is no `openai-compat`), the LiteLLM endpoint, and
   * LOGICAL model names. `LLMConfig.logger` and `debug` are optional, so this is
   * the whole configuration.
   */
  const makeToolkit = () =>
    new LLMModule({
      provider: 'openai',
      apiKey: MASTER,
      endpoint: `${LITELLM}/v1`,
      defaultModel: 'default-chat',
      embeddingModel: 'default-embed',
    })

  it('runs against an EXACT toolkit version, recorded here', async () => {
    // C6 and the roadmap: "a caret range would let the contract drift underneath
    // the test that exists to catch drift". At this point the blueprint has no AI
    // half yet, so only the control plane's own devDependency can be checked;
    // **Task 10 adds the other side of this comparison**, asserting that the
    // blueprint's `pinned_dependencies` names the same version. Until then a
    // one-sided check is honest and a two-sided one would be a forward reference.
    const installed = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { devDependencies: Record<string, string> }
    expect(installed.devDependencies['ubc-genai-toolkit-llm']).toBe('0.7.0')
  })

  it('embeds at 768 dimensions WITH encoding_format float, and 192 without', async () => {
    // `embed` returns an EmbeddingResponse — `{ embeddings: number[][], model, … }`
    // — NOT a bare array. Read off ubc-genai-toolkit-llm's own types.d.ts, because
    // a plan that guesses a library's return shape is a plan that fails at step 4.
    const llm = makeToolkit()
    const good = await llm.embed(['manifest'], { encoding_format: 'float' })
    expect(good.embeddings[0]).toHaveLength(768)
    expect(good.embeddings[0]!.slice(0, 3).every((v) => v === 0)).toBe(false)

    // THE DEFECT, asserted as a defect. The OpenAI SDK >= 4.75 defaults
    // encoding_format to base64 and decodes with toFloat32Array; LiteLLM's Ollama
    // path returns a plain float list; 768 floats coerced to bytes read back as
    // 192 near-zero float32s, with no error anywhere. Asserting the WRONG value
    // here is what makes the right one meaningful — if this line ever fails,
    // LiteLLM or the SDK changed and the blueprint's obligation may have moved.
    const bad = await llm.embed(['manifest'])
    expect(bad.embeddings[0]).toHaveLength(192)
    expect(bad.embeddings[0]!.slice(0, 3)).toEqual([0, 0, 0])
  })

  it('streams NON-EMPTY content, which a thinking model does not', async () => {
    // S3 Evidence 9: qwen3.5:4b emitted 1677 SSE frames and ZERO content frames
    // at max_tokens 2000 on "count 1 to 5". The toolkit reads delta.content only,
    // so the app sees an empty string and no error. `default-chat` is pinned to
    // ministral-3 in infra/litellm/config.yaml for exactly this reason, and
    // infra/models.txt says so.
    //
    // `streamConversation(messages, callback, options)` — there is no
    // `streamMessage`. The method list is sendMessage, sendConversation,
    // sendStructuredConversation, streamConversation, embed, createConversation,
    // getAvailableModels, getProviderName.
    const chunks: string[] = []
    const response = await makeToolkit().streamConversation(
      [{ role: 'user', content: 'Count 1 to 5, digits only.' }],
      (chunk: string) => chunks.push(chunk),
    )
    expect(chunks.length, 'zero content frames — is default-chat a thinking model?').toBeGreaterThan(0)
    expect(response.content.trim()).not.toBe('')
  })
})
```

- [ ] **Step 6: Run everything**

```bash
pnpm test && pnpm test && make up && pnpm test:docker
```

- [ ] **Step 7: The negative controls**

```bash
# a) Mint the probe key with allowed_routes omitted and run probe 14 with it.
#    Expected: the four admin routes answer 200/403-for-other-reasons rather than
#    403, and probe 14 RED on the first one. This is the control that proves the
#    confinement is doing the work rather than LiteLLM being unreachable.
# b) Skip ensureProbeUser and mint the OPEN key under an auto-created user.
#    Expected: the matched pair's last line RED with 401 "Your role=unknown" —
#    i.e. the negative control silently becoming a second positive. Watch it.
# c) Change probe 14 to read `curl`'s exit code instead of %{http_code}.
#    Expected: every admin-route assertion PASSES on a broken confinement. This
#    is the trap in the helper's comment, and it is worth seeing once.
# d) Remove the `--dns 10.89.0.53` flag from statusFromNetwork.
#    Expected: 000 everywhere, including the positive control — which is what
#    tells you a run of all-000 is a resolver fault, not a denial.
```

- [ ] **Step 8: Commit** — `test: §16's AI-path tier, and the two S6 probes S6 deferred to P4`

---
## Task 4: `ai/errors.ts` — S3's error table as one mapper, and the body that must never escape

**Files:**
- Create: `packages/control-plane/src/ai/errors.ts`, `errors.test.ts`
- Modify: `packages/control-plane/src/ai/ai-path.docker.test.ts` (provoke each row against the running proxy)

**Interfaces:**
- Consumes: nothing — pure, which is what puts it in §16's unit tier.
- Produces:
  - `class AiError extends Error` with `readonly code: string`, `readonly hint: string`, `readonly status: number`, `readonly detail: Record<string, string | number>`
  - `mapLiteLlmError(status: number, body: unknown): AiError`
  - `AI_CODES` — the closed set, exported so Task 13's incidents and Task 15's events name them rather than restating strings

**Why this is its own task and comes before the client.** §20 requires *"the control plane maps LiteLLM failures to its own codes rather than passing the body through"*, and §14 gives the reason: **the key-revocation body carries the masked key and the full key hash.** Guaranteeing "the body never escapes" by *construction* — a mapper whose output is built from named fields only — is a different and much stronger claim than guaranteeing it by filtering afterwards.

**The envelope is not uniform, and that is the whole difficulty.** S3 Evidence 13, measured against LiteLLM 1.98.0:

| Condition | HTTP | `type` | Envelope |
|---|---|---|---|
| Key over budget | 429 | `budget_exceeded` | `{"error":{…}}` |
| **End user over budget** | 429 | `budget_exceeded` | `{"error":{…}}` |
| Model not allowed for key | 403 | `key_model_access_denied` | `{"error":{…}}` |
| **Route not allowed for key** | 403 | *(none)* | **`{"detail": "…"}`** |
| Key revoked | 401 | `token_not_found_in_db` | `{"error":{…}}` |
| Key expired (TTL) | 401 | `expired_key` | `{"error":{…}}` |
| Unknown logical model | 400 | **`"None"` — the string** | `{"error":{…}}` |
| Backend unreachable | 500 | `null` | `{"error":{…}}` |

Two rows are the reason this is not a lookup table. A **route denial has no `type` and a different envelope entirely**, so a mapper that reads `error.type` treats §12's most important control as an unstructured failure. And **key-over-budget and end-user-over-budget are indistinguishable by code** — same status, same `type` — while needing different faculty-legible messages: *"this app has spent its monthly budget"* and *"this student has"* are different problems with different fixes.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { AI_CODES, AiError, mapLiteLlmError } from './errors.js'

// Bodies recorded from LiteLLM 1.98.0 (S3 Evidence 13, re-measured 2026-09-07).
// Trimmed only where a field is irrelevant; the SHAPES are verbatim.
const KEY_BUDGET = { error: { message: 'Budget has been exceeded! Current cost: 51.2, Max budget: 50.0. Key=sk-...Xm0w', type: 'budget_exceeded', param: null, code: '429' } }
const USER_BUDGET = { error: { message: 'ExceededBudget: End User=9f2c… over budget. Current cost: 2.1, Max budget: 2.0', type: 'budget_exceeded', param: null, code: '429' } }
const ROUTE_DENIED = { detail: 'Virtual key is not allowed to call this route. Only allowed routes: [\'/v1/chat/completions\'] Tried to call route: /key/generate' }
const REVOKED = { error: { message: 'Authentication Error, Invalid proxy server token passed. Received API Key = sk-...Xm0w, Key Hash (Token) =1badf2fea768945550f4327759f5c9ba0c3e', type: 'token_not_found_in_db', param: 'key', code: '401' } }
const EXPIRED = { error: { message: 'Authentication Error - Expired Key. Key Expiry time 2026-08-30 20:28:19', type: 'expired_key', param: 'sk-...HEaQ', code: '401' } }
const MODEL_UNKNOWN = { error: { message: 'model not found', type: 'None', param: null, code: '400' } }
const BACKEND = { error: { message: 'litellm.APIConnectionError: All connection attempts failed', type: null, param: null, code: '500' } }
const MODEL_DENIED = { error: { message: 'key not allowed to access model', type: 'key_model_access_denied', param: null, code: '403' } }

describe('LiteLLM error mapping (§20, S3 Evidence 13, pinned to 1.98.0)', () => {
  it('tells a key budget from an END USER budget, which share a status AND a type', () => {
    // The only difference is the message. This is brittle by construction and the
    // Docker tier below re-measures it — but a wrong answer here tells a faculty
    // member their app is out of money when one student is, which is a support
    // ticket aimed at the wrong person.
    expect(mapLiteLlmError(429, KEY_BUDGET).code).toBe(AI_CODES.PROJECT_BUDGET_EXCEEDED)
    expect(mapLiteLlmError(429, USER_BUDGET).code).toBe(AI_CODES.USER_BUDGET_EXCEEDED)
  })

  it('maps a route denial, which arrives with NO type and a different envelope', () => {
    // §12's most important AI control. A mapper that reads error.type alone sees
    // an unstructured 403 here and reports "something went wrong".
    const mapped = mapLiteLlmError(403, ROUTE_DENIED)
    expect(mapped.code).toBe(AI_CODES.ROUTE_NOT_PERMITTED)
    expect(mapped.hint).toMatch(/allowed_routes/)
  })

  it('never lets the key hash out of the revocation body', () => {
    // §14: "LiteLLM's key-revocation error contains the masked key AND the full
    // key hash, so it must never be surfaced verbatim in an Event." Asserted on
    // the WHOLE mapped error, not on `message` — a hash in `detail` is exactly as
    // leaked as one in `message`, and this is the assertion that makes the
    // build-it-from-named-fields design worth having.
    const mapped = mapLiteLlmError(401, REVOKED)
    expect(mapped.code).toBe(AI_CODES.KEY_REVOKED)
    expect(JSON.stringify(mapped)).not.toContain('1badf2fea768945550f4327759f5c9ba')
    expect(JSON.stringify(mapped)).not.toContain('sk-')
  })

  it('maps expiry, an unknown model, a denied model and a dead backend', () => {
    expect(mapLiteLlmError(401, EXPIRED).code).toBe(AI_CODES.KEY_EXPIRED)
    // `type` is the STRING "None", not null and not absent. A truthiness check
    // treats it as a real type and falls through to the unmapped branch.
    expect(mapLiteLlmError(400, MODEL_UNKNOWN).code).toBe(AI_CODES.MODEL_UNKNOWN)
    expect(mapLiteLlmError(403, MODEL_DENIED).code).toBe(AI_CODES.MODEL_NOT_PERMITTED)
    expect(mapLiteLlmError(500, BACKEND).code).toBe(AI_CODES.BACKEND_UNAVAILABLE)
  })

  it('falls back without carrying the body, whatever the body is', () => {
    const mapped = mapLiteLlmError(418, { error: { message: 'CANARY-SECRET-VALUE', type: 'teapot' } })
    expect(mapped.code).toBe(AI_CODES.UNMAPPED)
    expect(JSON.stringify(mapped)).not.toContain('CANARY-SECRET-VALUE')
    // The status survives, because an operator needs SOMETHING. A code and a
    // status are enough to find the request in LiteLLM's own logs.
    expect(mapped.detail.status).toBe(418)
  })

  it('carries a faculty-legible message and a hint for every code it can produce', () => {
    // §14's first bullet, asserted across the closed set rather than per case —
    // a new code added without a message is the kind of gap that ships. Built
    // through the constructor rather than by reading the module's tables, so
    // MESSAGES and HINTS stay private.
    for (const code of Object.values(AI_CODES)) {
      const error = new AiError(code, 500, { status: 500 })
      expect(error.message, `${code} has no faculty-legible message`).toBeTruthy()
      expect(error.hint, `${code} has no hint`).toBeTruthy()
      // It must not name the gateway, a key or a status: the person reading it
      // did not choose LiteLLM and cannot act on its name (D23.7's hint is the
      // machine-actionable half, and it may).
      expect(error.message).not.toMatch(/litellm|sk-|bearer|http/i)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm test -- ai/errors`

- [ ] **Step 3: Implement the mapper**

```ts
export const AI_CODES = {
  PROJECT_BUDGET_EXCEEDED: 'AI_PROJECT_BUDGET_EXCEEDED',
  USER_BUDGET_EXCEEDED: 'AI_USER_BUDGET_EXCEEDED',
  MODEL_NOT_PERMITTED: 'AI_MODEL_NOT_PERMITTED',
  ROUTE_NOT_PERMITTED: 'AI_ROUTE_NOT_PERMITTED',
  KEY_REVOKED: 'AI_KEY_REVOKED',
  KEY_EXPIRED: 'AI_KEY_EXPIRED',
  MODEL_UNKNOWN: 'AI_MODEL_UNKNOWN',
  BACKEND_UNAVAILABLE: 'AI_BACKEND_UNAVAILABLE',
  UNMAPPED: 'AI_UNMAPPED',
} as const

/**
 * The faculty-legible half (§14). Deliberately says nothing about LiteLLM, keys or
 * HTTP: the person reading it did not choose the gateway and cannot act on its
 * name. The machine-actionable half is the CODE, which is what an agent corrects
 * itself against (D23.7).
 */
const MESSAGES: Record<string, string> = {
  [AI_CODES.PROJECT_BUDGET_EXCEEDED]: 'This app has used all of its AI budget for the month.',
  [AI_CODES.USER_BUDGET_EXCEEDED]: 'This person has used all of their AI allowance for the month.',
  [AI_CODES.MODEL_NOT_PERMITTED]: 'This app is not permitted to use the model it asked for.',
  [AI_CODES.ROUTE_NOT_PERMITTED]: 'This app tried to do something with AI that apps are not allowed to do.',
  [AI_CODES.KEY_REVOKED]: 'This app’s AI access was withdrawn. Deploying again issues new access.',
  [AI_CODES.KEY_EXPIRED]: 'This app’s AI access has expired. Deploying again issues new access.',
  [AI_CODES.MODEL_UNKNOWN]: 'This app asked for a model the platform does not offer.',
  [AI_CODES.BACKEND_UNAVAILABLE]: 'The AI service is not answering right now.',
  [AI_CODES.UNMAPPED]: 'The AI service refused this request for a reason the platform does not recognise.',
}

const HINTS: Record<string, string> = {
  [AI_CODES.PROJECT_BUDGET_EXCEEDED]: 'Raise ai.budget.project_monthly_usd in manifest.yaml, within the project quota, and deploy again.',
  [AI_CODES.USER_BUDGET_EXCEEDED]: 'Per-person allowances are not enforced by this version of the platform; if you are seeing this, an administrator set one directly on the gateway.',
  [AI_CODES.MODEL_NOT_PERMITTED]: 'Declare the model in ai.models. A model above the app’s data.classification is refused at validation (D17).',
  [AI_CODES.ROUTE_NOT_PERMITTED]: 'Apps may call chat completions, embeddings and the model list, and nothing else — every key carries allowed_routes (§10). This is a bug in the app, not a permission to grant.',
  [AI_CODES.KEY_REVOKED]: 'Redeploy the environment. Keys are rotated on every deploy (§10).',
  [AI_CODES.KEY_EXPIRED]: 'Redeploy the environment.',
  [AI_CODES.MODEL_UNKNOWN]: 'Use a logical model name from the platform catalogue, never a vendor model id.',
  [AI_CODES.BACKEND_UNAVAILABLE]: 'Check `make doctor`. If the platform is up, the model host (Ollama, locally) is not answering.',
  [AI_CODES.UNMAPPED]: 'Record the status and look the request up in the gateway’s own logs. If this recurs, the gateway version has moved and §16’s mapping needs re-measuring.',
}

export class AiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly detail: Record<string, string | number>,
  ) {
    super(MESSAGES[code] ?? MESSAGES[AI_CODES.UNMAPPED]!)
    this.name = 'AiError'
  }
  get hint(): string {
    return HINTS[this.code] ?? HINTS[AI_CODES.UNMAPPED]!
  }
}

export function mapLiteLlmError(status: number, body: unknown): AiError {
  const b = (body ?? {}) as { error?: { type?: unknown; message?: unknown }; detail?: unknown }
  const type = typeof b.error?.type === 'string' ? b.error.type : undefined
  const message = typeof b.error?.message === 'string' ? b.error.message : ''

  // FIRST, because a route denial has no `error` object at all: it is
  // `{"detail": "…"}`. Reading error.type first and falling through would put
  // §12's key confinement in the unmapped bucket.
  if (b.detail !== undefined && b.error === undefined) {
    return new AiError(AI_CODES.ROUTE_NOT_PERMITTED, status, { status })
  }

  if (type === 'budget_exceeded') {
    // The ONLY discriminator LiteLLM 1.98.0 offers. S3 recorded both strings.
    return new AiError(
      /End User=/.test(message)
        ? AI_CODES.USER_BUDGET_EXCEEDED
        : AI_CODES.PROJECT_BUDGET_EXCEEDED,
      status,
      { status },
    )
  }

  const byType: Record<string, string> = {
    key_model_access_denied: AI_CODES.MODEL_NOT_PERMITTED,
    token_not_found_in_db: AI_CODES.KEY_REVOKED,
    expired_key: AI_CODES.KEY_EXPIRED,
  }
  if (type !== undefined && byType[type]) return new AiError(byType[type]!, status, { status })

  // `"None"` is a STRING here, not null — so a `type` is present and matches
  // nothing. Fall to the status, which is what actually identifies this row.
  if (status === 400) return new AiError(AI_CODES.MODEL_UNKNOWN, status, { status })
  if (status >= 500) return new AiError(AI_CODES.BACKEND_UNAVAILABLE, status, { status })
  return new AiError(AI_CODES.UNMAPPED, status, { status })
}
```

**`detail` is `{ status }` and nothing else.** That is not laziness: it is the construction that makes "the body never escapes" true by shape rather than by review.

- [ ] **Step 4: Provoke every row against the running proxy**

Append to `ai/ai-path.docker.test.ts`. **This is what makes the recorded bodies above evidence rather than folklore**, and it is what re-measures them when Task 2's pin moves:

```ts
/**
 * One request as an app would make it. Defined here rather than reused from
 * `ai/client.ts`, deliberately: the client MAPS errors, and this test needs the
 * raw status and body to check that the mapping is still right.
 */
const call = (key: string, method: 'GET' | 'POST', path: string, body?: unknown) =>
  fetch(`${LITELLM}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

it('every mapped condition is still the shape LiteLLM 1.98.0 produces', async () => {
  const confined = await mintProbeKey({ userId: PROBE_USER, confined: true })
  const cases: [string, () => Promise<Response>][] = [
    [AI_CODES.ROUTE_NOT_PERMITTED, () => call(confined, 'POST', '/key/generate', {})],
    [AI_CODES.MODEL_UNKNOWN, () => call(confined, 'POST', '/v1/chat/completions', { model: 'no-such-model', messages: [{ role: 'user', content: 'x' }] })],
    [AI_CODES.KEY_REVOKED, async () => { await deleteProbeKey(confined); return call(confined, 'GET', '/v1/models') }],
  ]
  for (const [expected, run] of cases) {
    const res = await run()
    const mapped = mapLiteLlmError(res.status, await res.json())
    expect(mapped.code, `${expected} drifted: ${res.status}`).toBe(expected)
  }
})
```

The budget rows are **deliberately not provoked here**: reaching a budget takes S3's synthetic-cost setup and a stream of requests, and S3 already measured both strings. They are asserted against the recorded bodies in Step 1 and named in *What this plan does not build* as the two rows this tier takes on trust.

- [ ] **Step 5: The negative controls**

```bash
# a) Reorder the mapper so `error.type` is read before the `detail` branch.
#    Expected: the route-denial test RED with AI_UNMAPPED — §12's key
#    confinement reported as "something went wrong".
# b) Match the budget cases on status alone, dropping the /End User=/ test.
#    Expected: the first test RED on USER_BUDGET.
# c) Add `message` to AiError.detail.
#    Expected: the key-hash test RED, printing the hash. Watch it print.
# d) Change `type === 'None'` handling to treat any non-empty type as mapped.
#    Expected: the unknown-model test RED with AI_UNMAPPED.
```

- [ ] **Step 6: Commit** — `feat: map LiteLLM's failures to Manifest codes, and never pass the body through`

---
## Task 5: `ai/client.ts` — the LiteLLM admin transport

**Files:**
- Create: `packages/control-plane/src/ai/client.ts`, `client.test.ts`, `index.ts`
- Modify: `packages/control-plane/src/config.ts`, `config.test.ts`, `.env.example`, `packages/control-plane/vitest.env.ts`

**Interfaces:**
- Consumes: `mapLiteLlmError`, `AiError` (Task 4).
- Produces:
  - `interface LiteLlmClient { get<T>(path: string, query?: Record<string, string>): Promise<T>; post<T>(path: string, body: unknown): Promise<T> }`
  - `createLiteLlmClient(opts: { baseUrl: string; masterKey: string; timeoutMs?: number }): LiteLlmClient`
  - `class AiConfigError extends Error` with code `AI_MASTER_KEY_MISSING`
- Config: `config.litellm = { url, internalUrl, masterKey, enabled }`

**Why a transport of its own, twenty lines long.** Every LiteLLM call in the platform goes through one place that (a) attaches the master key, (b) has a timeout, and (c) turns a non-2xx into an `AiError` rather than a raw body. Without (c), Task 4's mapper is a module with no call site — the defect this project has shipped three times — and the first caller to write `if (!res.ok) throw new Error(await res.text())` puts the key hash back into an exception message.

**`fetch`, not `undici` directly and not the OpenAI SDK.** The control plane talks to LiteLLM's **admin** API, which is ordinary JSON over HTTP on the published port; the SDK is the *app's* concern and P4a measured that it cannot be proxied. Node 24's global `fetch` needs no dependency and no agent.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_CODES } from './errors.js'
import { AiConfigError, createLiteLlmClient } from './client.js'

const client = () => createLiteLlmClient({ baseUrl: 'http://litellm.test', masterKey: 'sk-master', timeoutMs: 50 })

describe('the LiteLLM admin transport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the master key and parses the body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(client().post('/key/generate', { a: 1 })).resolves.toEqual({ ok: 1 })
    const [, init] = fetchMock.mock.calls[0]!
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer sk-master' })
  })

  it('turns a non-2xx into an AiError and never into the raw body', async () => {
    // The whole reason this module exists rather than a bare fetch at each site.
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { message: 'Key Hash (Token) =1badf2fe', type: 'token_not_found_in_db' } }), { status: 401 }))
    const error = await client().get('/key/info').catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe(AI_CODES.KEY_REVOKED)
    expect(JSON.stringify(error)).not.toContain('1badf2fe')
  })

  it('maps a body that is not JSON at all, rather than throwing a parse error', async () => {
    // A 502 from something in front of LiteLLM returns HTML. A JSON.parse throw
    // here would surface as a SyntaxError with the page in its message — a
    // different way for a third-party body to escape.
    vi.stubGlobal('fetch', async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    const error = await client().get('/model/info').catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe(AI_CODES.BACKEND_UNAVAILABLE)
    expect(JSON.stringify(error)).not.toContain('html')
  })

  it('times out rather than hanging a deploy', async () => {
    // deployRelease calls this. Without a timeout, an unresponsive gateway makes
    // a deploy hang until the readiness timeout rather than fail with a reason.
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const error = await client().get('/model/info').catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe(AI_CODES.BACKEND_UNAVAILABLE)
  })

  it('refuses to be built without a master key, in EVERY environment', async () => {
    // Unlike MANIFEST_MASTER_SECRET, a generated value is not a degraded mode
    // here — it is a value LiteLLM will reject on every call, so the failure
    // would arrive as an authentication error at deploy time rather than as a
    // configuration error at boot. Fail where the mistake was made.
    expect(() => createLiteLlmClient({ baseUrl: 'http://litellm.test', masterKey: '' })).toThrow(AiConfigError)
  })
})
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm test -- ai/client`

- [ ] **Step 3: Implement it**, and add the configuration

`config.ts` gains four settings and one interface field. `MANIFEST_LITELLM_MASTER_KEY` is optional in the schema and **required outside development** — the same two independent reads of one setting that `MANIFEST_MASTER_SECRET` and `MANIFEST_BUILD_CREDENTIAL_SECRET` already use, and for the reason the roadmap's lesson gives: *"a guard whose enabling condition is written twice is a guard"*. In development it may be absent, and `createLiteLlmClient` then throws at the first call rather than at boot, which is what `MANIFEST_AI_ENABLED=0` exists to avoid for the non-Docker tier.

```ts
  MANIFEST_LITELLM_URL: z.string().min(1).default('http://127.0.0.1:7106'),
  // NOT derived from the one above. `registryUrl`/`registryInternalUrl` is the
  // same pair and carries the same warning: these two are what the CONTROL PLANE
  // and what an APP call the same service, they are not interchangeable, and
  // nothing fails loudly if they are swapped — an app handed the loopback URL
  // gets ECONNREFUSED from inside its own network.
  MANIFEST_LITELLM_INTERNAL_URL: z.string().min(1).default('http://manifest-litellm:4000/v1'),
  MANIFEST_LITELLM_MASTER_KEY: z.string().min(1).optional(),
  MANIFEST_AI_ENABLED: z.enum(['0', '1']).default('1'),
```

- [ ] **Step 4: Update the three other places configuration is constructed**

P4a's self-review caught this exact class: *"`MANIFEST_IDP_DATABASE_URL` breaks three callers, not one."* The same three:

```bash
grep -rn 'MANIFEST_DATABASE_URL' packages/control-plane/vitest.env.ts \
  packages/control-plane/src/api/testing.ts .env.example
```

Each constructs configuration and each needs the new keys. **Add them before running the suite**, or the whole suite fails for a reason unrelated to this task.

- [ ] **Step 5: Run everything, twice** — `pnpm test && pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck`

- [ ] **Step 6: The negative controls**

```bash
# a) Remove the try/catch around JSON.parse of an error body.
#    Expected: the non-JSON test RED with a SyntaxError carrying the HTML.
# b) Drop the AbortSignal.
#    Expected: the timeout test hangs — kill it after 30s. A hanging test is the
#    symptom of the defect, which is why the assertion is a code and not a timing.
# c) Set MANIFEST_LITELLM_MASTER_KEY='' and MANIFEST_ENV=staging, then loadConfig.
#    Expected: CONFIG_LITELLM_MASTER_KEY_REQUIRED at boot, not at first call.
```

- [ ] **Step 7: Commit** — `feat: the LiteLLM admin transport, with one place that maps its failures`

---

## Task 6: `ai/catalogue.ts` — D17's catalogue, read from `/model/info`, failing closed

**Files:**
- Create: `packages/control-plane/src/ai/catalogue.ts`, `catalogue.test.ts`
- Modify: `packages/control-plane/src/ai/index.ts`, `src/api/routes/projects.ts`, `src/api/server.ts`, `src/index.ts`
- Test: `packages/control-plane/src/api/projects.test.ts`, `src/ai/ai-path.docker.test.ts`

**Interfaces:**
- Consumes: `LiteLlmClient` (Task 5).
- Produces:
  - `interface ModelEntry { name: string; maxClassification: Classification; kind: 'chat' | 'embedding' }`
  - `loadModelCatalogue(client: LiteLlmClient): Promise<ModelEntry[]>`
  - `createCatalogueCache(client, ttlMs?): { get(): Promise<ModelEntry[]> }` — **what `ServerDeps` holds**
  - `class CatalogueError extends Error` with codes `AI_CATALOGUE_UNCLASSIFIED` and `AI_CATALOGUE_EMPTY`

**This task deletes a hardcoded array, and that is the point.** `api/routes/projects.ts` currently carries:

```ts
    modelCatalogue: [
      { name: 'default-chat-onprem', maxClassification: 'confidential' as const },
      { name: 'default-chat', maxClassification: 'internal' as const },
      { name: 'default-embed', maxClassification: 'internal' as const },
    ],
```

That is a second source of truth for D17 — the §8 failure one level up, and D17 is the check that stops *"a privacy incident at runtime"*. `checkPolicy` already takes the catalogue as an argument, so **this is a call site, not a new check.**

**Three measured facts shape it** (M1–M4): `max_classification` round-trips through `/model/info` verbatim; the response carries **115 keys per entry**, so it is projected rather than passed on; a chat model's `mode` is **`null`, not `"chat"`**; and `/v1/models` — the only model route an app key may call — carries neither field, so this read belongs to the control plane and the master key.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { CatalogueError, createCatalogueCache, loadModelCatalogue } from './catalogue.js'

/** Trimmed from a real /model/info, 2026-09-07. The real one has 115 keys per entry. */
const RESPONSE = {
  data: [
    { model_name: 'default-chat', model_info: { max_classification: 'internal', mode: null, db_model: false, id: 'cf16', input_cost_per_token: 1e-6 } },
    { model_name: 'default-chat-onprem', model_info: { max_classification: 'confidential', mode: null, db_model: false, id: '86ec' } },
    { model_name: 'default-embed', model_info: { max_classification: 'internal', mode: 'embedding', db_model: false, id: '450e' } },
  ],
}
const clientReturning = (body: unknown) => ({ get: vi.fn(async () => body), post: vi.fn() })

describe('D17 model catalogue', () => {
  it('reads max_classification and calls a null-mode entry a CHAT model', async () => {
    // Measured 2026-09-07: both chat entries return mode: null. `mode === 'chat'`
    // yields an EMPTY catalogue, every spec then fails SPEC_MODEL_UNKNOWN, and the
    // symptom reads as a LiteLLM outage rather than a filter bug.
    const entries = await loadModelCatalogue(clientReturning(RESPONSE))
    expect(entries).toEqual([
      { name: 'default-chat', maxClassification: 'internal', kind: 'chat' },
      { name: 'default-chat-onprem', maxClassification: 'confidential', kind: 'chat' },
      { name: 'default-embed', maxClassification: 'internal', kind: 'embedding' },
    ])
  })

  it('projects THREE fields and carries nothing else', async () => {
    // The real response holds every api_base and every per-token cost. Handing
    // that object to checkPolicy would put the provider topology inside a
    // validation context, and from there into an error hint.
    const [entry] = await loadModelCatalogue(clientReturning(RESPONSE))
    expect(Object.keys(entry!).sort()).toEqual(['kind', 'maxClassification', 'name'])
  })

  it('REFUSES an entry with no max_classification rather than defaulting one', async () => {
    // Fail closed. P4a spent a task on `core:AttributeLimit` failing open; a
    // defaulted classification here lets a `confidential` app resolve an
    // off-premise model, which §7 calls "a privacy incident at runtime".
    const body = { data: [{ model_name: 'rogue', model_info: { mode: null } }] }
    await expect(loadModelCatalogue(clientReturning(body))).rejects.toThrow(/AI_CATALOGUE_UNCLASSIFIED/)
  })

  it('refuses an empty catalogue rather than returning one', async () => {
    // An empty catalogue is indistinguishable from "no models are permitted" and
    // makes every spec fail with a message blaming the faculty member.
    await expect(loadModelCatalogue(clientReturning({ data: [] }))).rejects.toThrow(/AI_CATALOGUE_EMPTY/)
  })

  it('caches, and does not cache a failure', async () => {
    // Validation happens on every spec push; a fetch per push is a fetch per
    // keystroke in a console. But caching a transient failure would keep an app
    // un-deployable after the gateway came back.
    const client = { get: vi.fn().mockResolvedValueOnce(RESPONSE), post: vi.fn() }
    const cache = createCatalogueCache(client as never, 60_000)
    await cache.get()
    await cache.get()
    expect(client.get).toHaveBeenCalledTimes(1)

    const flaky = { get: vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(RESPONSE), post: vi.fn() }
    const second = createCatalogueCache(flaky as never, 60_000)
    await expect(second.get()).rejects.toThrow()
    await expect(second.get()).resolves.toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm test -- ai/catalogue`

- [ ] **Step 3: Implement it**

```ts
interface ModelInfoResponse {
  data: { model_name: string; model_info?: { max_classification?: unknown; mode?: unknown } }[]
}

export async function loadModelCatalogue(client: LiteLlmClient): Promise<ModelEntry[]> {
  const body = await client.get<ModelInfoResponse>('/model/info')
  const entries = (body.data ?? []).map((row) => {
    const classification = row.model_info?.max_classification
    if (typeof classification !== 'string' || !(classification in CLASSIFICATION_RANK)) {
      throw new CatalogueError(
        'AI_CATALOGUE_UNCLASSIFIED',
        `the model '${row.model_name}' carries no max_classification`,
        'Every catalogue entry needs `model_info.max_classification` (D17). Add it in ' +
          'infra/litellm/config.yaml, or on the model in the admin API. The platform ' +
          'refuses to guess: a wrong guess sends personal information off-premise.',
      )
    }
    return {
      name: row.model_name,
      maxClassification: classification as Classification,
      // NOT `mode === 'chat'`. Measured 2026-09-07: chat entries return null.
      kind: row.model_info?.mode === 'embedding' ? ('embedding' as const) : ('chat' as const),
    }
  })
  if (entries.length === 0) {
    throw new CatalogueError(
      'AI_CATALOGUE_EMPTY',
      'the model catalogue is empty',
      'LiteLLM returned no models. Check `make doctor`; if the platform is up, ' +
        'infra/litellm/config.yaml declares the bootstrap set and `make up` loads it. ' +
        'An empty catalogue is refused rather than returned, because returning it ' +
        'fails every spec with a message that blames the faculty member.',
    )
  }
  return entries
}
```

- [ ] **Step 4: Name the caller, and delete the array**

`api/routes/projects.ts`'s `validationContext` becomes `async` and takes the catalogue, `ServerDeps` gains `catalogue: { get(): Promise<ModelEntry[]> }`, and `src/index.ts` builds it from the client. **The hardcoded array is deleted, not commented out.**

```bash
grep -rn "default-chat-onprem" packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts'
```

Expected: **no results.** A second producer of the catalogue is D17 with two answers.

- [ ] **Step 5: The Docker-tier assertion**

Append to `ai/ai-path.docker.test.ts`:

```ts
it('the running catalogue matches infra/litellm/config.yaml', async () => {
  // Reads BOTH SIDES rather than a hand-written expectation: the file P1 ships
  // and the answer the running proxy gives. `model_info` survives the round trip
  // (measured 2026-09-07) and this is what keeps that true.
  // `yaml` is already a dependency — `spec/` parses manifest.yaml with it.
  const declared = parseYaml(await readFile(join(REPO_ROOT, 'infra/litellm/config.yaml'), 'utf8')) as {
    model_list: { model_name: string; model_info?: { max_classification?: string } }[]
  }
  const live = await loadModelCatalogue(createLiteLlmClient({ baseUrl: LITELLM, masterKey: MASTER }))
  expect(live.map((m) => m.name).sort()).toEqual(declared.model_list.map((m) => m.model_name).sort())
  for (const entry of live) {
    const from = declared.model_list.find((m) => m.model_name === entry.name)!
    expect(entry.maxClassification).toBe(from.model_info?.max_classification)
  }
})
```

- [ ] **Step 6: Run everything** — `pnpm test && pnpm test && make up && pnpm test:docker`

- [ ] **Step 7: The negative controls**

```bash
# a) Change the kind test to `mode === 'chat'`.
#    Expected: every entry becomes 'embedding' and the first test RED. Then check
#    what a spec push does with that catalogue — SPEC_MODEL_UNKNOWN on a model
#    that plainly exists, which is the symptom to recognise.
# b) Delete `max_classification` from default-chat in infra/litellm/config.yaml,
#    `make up`, and run the Docker assertion.
#    Expected: AI_CATALOGUE_UNCLASSIFIED. Restore the file.
# c) Default the classification to 'public' instead of throwing, then validate a
#    manifest with data.classification: confidential and ai.models: [default-chat].
#    Expected: it VALIDATES. That is the failure this task exists to prevent —
#    watch it pass, then put the throw back.
```

- [ ] **Step 8: Commit** — `feat: D17's catalogue is read from LiteLLM, not restated in a route`

---
## Task 7: `ai/keys.ts` — one place that mints, and `allowed_routes` is not a parameter

**Files:**
- Create: `packages/control-plane/src/ai/keys.ts`, `keys.test.ts`
- Modify: `packages/control-plane/src/ai/index.ts`, `src/spec/policy.ts`, `src/spec/policy.test.ts`

**Interfaces:**
- Consumes: `LiteLlmClient` (Task 5); `putSecret` / `getSecret` from P4a's `secrets/`.
- Produces:
  - `AI_ALLOWED_ROUTES: readonly string[]` — the constant, exported so a test can assert the minted key carried it
  - `aiUserId(projectId: string, kind: EnvironmentKind): string`
  - `ensureAiUser(client, { projectId, kind, monthlyUsd }): Promise<string>`
  - `rotateAppKey(db, client, keys, { projectId, projectSlug, kind, models, monthlyUsd }): Promise<string>` — mints the new key, stores it, revokes the previous one, returns the new key
  - `createAiKeyService(client, keys): { rotateAppKey(db, input): Promise<string> }` — the **bound** form `deployRelease` receives, so `releases/` never holds the master key. **`db` stays a per-call argument**, because it may be a transaction; `client` and `keys` are process-wide and are bound. This mirrors P4a's `createSsoRegistrar(pool, keys)`.

**There is deliberately no `revokeAppKey`.** §10 says a key is *"rotated every deploy, revoked on archive"*, and **Phase 1 has no archive operation** — nothing destroys an environment through the API. A `revokeAppKey` with no caller would be the fourth instance of the defect this project has hit three times. Rotation already revokes the key it replaces, which is the half that exists. Named in *What this plan does not build*.

**The one rule this module exists to make unbreakable.** S3 measured that an app key under a `/user/new` user can mint a child key that **answers 200 after its parent is revoked and answers 401** — and that §10's own table, followed literally, is what creates that capability. `allowed_routes` closes it. So it is a module constant and **not a parameter with a default**: a default is one keystroke from being overridden and reads as correct in review, which is exactly how P2's `/auth/dev-login` came one line from a live authentication bypass.

**Budgets go on the user, not the key** (§10, S3 Evidence 3). App keys rotate every deploy; a monthly ceiling that resets on every deploy is not a monthly ceiling. `budget_duration: '1mo'` — **never `30d`**, which S3 measured as aligning to a calendar boundary, with `7d` behaving as one day.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { withRollback } from '../db/testing.js'
import { AI_ALLOWED_ROUTES, aiUserId, ensureAiUser, rotateAppKey } from './keys.js'

const fakeClient = () => {
  const calls: { path: string; body: unknown }[] = []
  return {
    calls,
    get: vi.fn(),
    post: vi.fn(async (path: string, body: unknown) => {
      calls.push({ path, body })
      if (path === '/key/generate') return { key: `sk-${calls.length}` }
      if (path === '/key/delete') return { deleted_keys: [(body as { keys: string[] }).keys[0]] }
      return {}
    }),
  }
}

describe('app key lifecycle (§10, S3 Evidence 11)', () => {
  it('mints every key with allowed_routes, and no caller can widen it', async () => {
    await withRollback(async (db, { projectId, keys }) => {
      const client = fakeClient()
      await rotateAppKey(db, client as never, keys, {
        projectId, projectSlug: 'chem-labs', kind: 'staging',
        models: ['default-chat'], monthlyUsd: 25,
      })
      const generate = client.calls.find((c) => c.path === '/key/generate')!.body as Record<string, unknown>
      expect(generate.allowed_routes).toEqual(AI_ALLOWED_ROUTES)
      expect(AI_ALLOWED_ROUTES).toEqual(['/v1/chat/completions', '/v1/embeddings', '/v1/models'])
      // The signature is the assertion: there is no way to ask for more.
      expect(Object.keys(generate)).not.toContain('permissions')
    })
  })

  it('puts the budget on the USER and not on the key', async () => {
    // S3 Evidence 3. A key budget resets when the key rotates, which is every
    // deploy — so a monthly ceiling on the key is not a monthly ceiling.
    await withRollback(async (db, { projectId, keys }) => {
      const client = fakeClient()
      await ensureAiUser(client as never, { projectId, kind: 'staging', monthlyUsd: 25 })
      const user = client.calls.find((c) => c.path === '/user/new')!.body as Record<string, unknown>
      expect(user).toMatchObject({ max_budget: 25, budget_duration: '1mo' })
      await rotateAppKey(db, client as never, keys, { projectId, projectSlug: 'chem-labs', kind: 'staging', models: ['default-chat'], monthlyUsd: 25 })
      const generate = client.calls.find((c) => c.path === '/key/generate')!.body as Record<string, unknown>
      expect(generate.max_budget).toBeUndefined()
      expect(generate.budget_duration).toBeUndefined()
    })
  })

  it('never uses 30d, in any call', () => {
    // S3: `budget_duration` aligns to a CALENDAR boundary, so `30d` is not a
    // rolling 30 days and `7d` behaved as one day. Asserted across the module's
    // source rather than per call site, because the next caller is the risk.
    expect(readFileSync(new URL('./keys.ts', import.meta.url), 'utf8')).not.toMatch(/['"]\d+d['"]/)
  })

  it('revokes the PREVIOUS key when it mints a new one', async () => {
    // §10: "rotated every deploy". Without the revoke, every deploy leaves a live
    // key behind and an app archived after ten deploys has ten working keys.
    await withRollback(async (db, { projectId, keys }) => {
      const client = fakeClient()
      const args = { projectId, projectSlug: 'chem-labs', kind: 'staging' as const, models: ['default-chat'], monthlyUsd: 25 }
      const first = await rotateAppKey(db, client as never, keys, args)
      const second = await rotateAppKey(db, client as never, keys, args)
      expect(second).not.toBe(first)
      expect(client.calls.filter((c) => c.path === '/key/delete').map((c) => (c.body as { keys: string[] }).keys[0])).toEqual([first])
    })
  })

  it('stores the new key BEFORE revoking the old one', async () => {
    // Ordering, asserted rather than assumed. Revoking first leaves a window in
    // which a running instance holds a dead key and the new one is not yet
    // persisted — and if the mint then fails, the app has no working key at all
    // and nothing recorded to recover from.
    await withRollback(async (db, { projectId, keys }) => {
      const order: string[] = []
      const client = fakeClient()
      client.post = vi.fn(async (path: string) => { order.push(path); return path === '/key/generate' ? { key: 'sk-x' } : {} }) as never
      await rotateAppKey(db, client as never, keys, { projectId, projectSlug: 'chem-labs', kind: 'staging', models: ['default-chat'], monthlyUsd: 25 })
      await rotateAppKey(db, client as never, keys, { projectId, projectSlug: 'chem-labs', kind: 'staging', models: ['default-chat'], monthlyUsd: 25 })
      expect(order.filter((p) => p !== '/user/new' && p !== '/user/update')).toEqual(['/key/generate', '/key/generate', '/key/delete'])
    })
  })

  it('refuses a spec that declares models with a zero budget', () => {
    // `ai.budget.project_monthly_usd` DEFAULTS TO 0 in §7's schema, and a LiteLLM
    // user with max_budget 0 refuses every request. Without this check an app
    // that declared a model deploys healthy and 429s on its first question, with
    // the faculty member told their budget is exhausted before they used any.
    const errors = checkPolicy(specWith({ ai: { models: ['default-chat'], budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 } } }), ctx())
    expect(errors.map((e) => e.code)).toContain('SPEC_AI_BUDGET_REQUIRED')
  })
})
```

- [ ] **Step 2: Run it and watch it fail** — `pnpm test -- ai/keys` and `pnpm test -- spec/policy`

- [ ] **Step 3: Implement it**

```ts
/**
 * §10, and NOT a parameter. Every key Manifest mints is confined to these three
 * routes. S3's matched pair: two keys under the same LiteLLM user, identical but
 * for this list — the unconfined one minted a child key that answered 200 after
 * its parent was deleted and answered 401.
 */
export const AI_ALLOWED_ROUTES = [
  '/v1/chat/completions',
  '/v1/embeddings',
  '/v1/models',
] as const

/**
 * Keyed on the project UUID, never the slug. A slug is a rename away from being a
 * different string, and the LiteLLM user carries the app's monthly spend — losing
 * it silently resets the budget to zero spent.
 */
export function aiUserId(projectId: string, kind: EnvironmentKind): string {
  return `mf-${projectId}-${kind}`
}

export async function ensureAiUser(
  client: LiteLlmClient,
  input: { projectId: string; kind: EnvironmentKind; monthlyUsd: number },
): Promise<string> {
  const userId = aiUserId(input.projectId, input.kind)
  const budget = { max_budget: input.monthlyUsd, budget_duration: '1mo' }
  try {
    await client.post('/user/new', { user_id: userId, ...budget })
  } catch (error) {
    // Already present is the desired end state — but the budget may have CHANGED
    // in manifest.yaml since, and a create-only path would leave last month's
    // ceiling in force for ever.
    if (!/already exists/i.test(String(error))) throw error
    await client.post('/user/update', { user_id: userId, ...budget })
  }
  return userId
}
```

`rotateAppKey` then: `ensureAiUser` → `/key/generate` with `AI_ALLOWED_ROUTES`, `models`, `user_id`, and `metadata: { manifest_project: projectId, manifest_environment: kind, manifest_slug: projectSlug }` (S3 Evidence 2 measured `metadata` round-tripping, which is what lets spend be joined to Manifest's own entities with no side table) → `putSecret(db, { projectId, environmentKind: kind, name: 'LLM_API_KEY', value: key }, keys)` → `/key/delete` on the previous stored value, if any.

`spec/policy.ts` gains `SPEC_AI_BUDGET_REQUIRED` to `POLICY_CODES`, checked when `spec.ai.models.length > 0`.

- [ ] **Step 4: There is no production caller yet, and that is deliberate**

Tasks 6 and 7 both ship modules whose only callers are tests, exactly as P4a's Tasks 6–8 did. **Task 9 is the task that gives this one a caller**, and its acceptance is a `grep`. Do not wire it here — a half-wired `deployRelease` between two tasks is a worse place to debug than an unwired one.

- [ ] **Step 5: Run everything, twice** — `pnpm test && pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck`

- [ ] **Step 6: The negative controls**

```bash
# a) Make allowed_routes a parameter defaulting to AI_ALLOWED_ROUTES, and pass []
#    from the test. Expected: the first test RED — and then run Task 3's probe 14
#    with such a key to watch /key/generate answer 200. Put it back.
# b) Delete the /key/delete call.
#    Expected: the revoke test RED. Then check LiteLLM: `GET /key/info` on the
#    first key still answers 200, which is the leak in its live form.
# c) Move the putSecret call after the /key/delete call.
#    Expected: the ordering test RED.
# d) Change '1mo' to '30d'.
#    Expected: the "never uses 30d" test RED. It reads the SOURCE, so it also
#    catches a second call site added later that never runs in a test.
```

- [ ] **Step 7: Commit** — `feat: app keys, confined by construction, with the budget on the user`

---

## Task 8: LiteLLM joins an app network — only for an app that declares models

**Files:**
- Modify: `packages/control-plane/src/runtime/docker/networks.ts`, `networks.docker.test.ts`, `src/runtime/docker/driver.ts`
- Test: `packages/control-plane/src/runtime/docker/networks.test.ts`, `s6.docker.test.ts`

**Interfaces:**
- Consumes: `InstanceSpec` — which gains one field.
- Produces:
  - `ensureAppNetwork(engine, slug, kind, extraNeighbours?: readonly string[]): Promise<string>`
  - `destroyAppNetwork` disconnecting **whatever is attached**, not a fixed list
  - `InstanceSpec.needsAiGateway: boolean`

**Why an app reaches LiteLLM directly rather than through the forced proxy.** P4a measured it against three mechanisms: `http_proxy` is ignored by the OpenAI SDK, `undici`'s global dispatcher fixes global `fetch` and **not** the SDK, and a patched `http.globalAgent` is bypassed too — the SDK bundles `node-fetch` with its own `agentkeepalive` agent, its only override is the `httpAgent` constructor option, and `ubc-genai-toolkit-llm` does not expose one. **C6 forbids a toolkit change being a prerequisite**, so the route has to exist at the network layer.

**Why conditionally.** P4a's note said to add `manifest-litellm` to `PLATFORM_NEIGHBOURS`. Two reasons not to (Decision 5): `attachPlatformNeighbours` **throws when a named container is missing**, so every app network — including that of an app with no AI at all — would then require LiteLLM to be running; and §12's least privilege says an app that declared no models has no business holding a route to the model gateway. Task 3's probe 13 is the assertion that it does not.

**And there is a defect to fix while here.** `destroyAppNetwork` disconnects the containers in `PLATFORM_NEIGHBOURS` and then deletes the network. A conditionally attached `manifest-litellm` is not in that list, so `docker network rm` would fail — and ORIENTATION §4 records exactly what that looks like: *"five app networks survived a cleanup that reported success."* The fix is to read the network back and disconnect what is actually there, which is strictly better than any list.

- [ ] **Step 1: Write the failing tests**

```ts
describe('the AI gateway is a conditional neighbour', () => {
  it('attaches manifest-litellm only when asked', async () => {
    const engine = fakeEngine()
    await ensureAppNetwork(engine, 'chem-labs', 'staging')
    expect(engine.connected('mf-chem-labs-staging')).toEqual(['manifest-caddy', 'manifest-dns-containers'])

    await ensureAppNetwork(engine, 'bio-tools', 'staging', ['manifest-litellm'])
    expect(engine.connected('mf-bio-tools-staging')).toContain('manifest-litellm')
  })

  it('destroyAppNetwork disconnects what is ATTACHED, not what is listed', async () => {
    // ORIENTATION §4: `docker network rm` fails while any container is attached,
    // and the previous cleanup reported success while five app networks survived.
    // A conditional neighbour is not in PLATFORM_NEIGHBOURS, so a list-driven
    // teardown reintroduces that defect for exactly the AI apps.
    const engine = fakeEngine()
    await ensureAppNetwork(engine, 'bio-tools', 'staging', ['manifest-litellm'])
    await destroyAppNetwork(engine, 'bio-tools', 'staging')
    expect(engine.deleted).toContain('mf-bio-tools-staging')
    expect(engine.connected('mf-bio-tools-staging')).toEqual([])
  })
})
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm test -- runtime/docker/networks`

- [ ] **Step 3: Implement**, and thread the flag

`ensureAppNetwork` gains `extraNeighbours: readonly string[] = []` and passes `[...PLATFORM_NEIGHBOURS, ...extraNeighbours]` to `attachPlatformNeighbours`, which already reads the network back and throws on a silent no-op. `InstanceSpec` gains `needsAiGateway: boolean`, `ensureInstance` passes `spec.needsAiGateway ? ['manifest-litellm'] : []`, and `destroyAppNetwork` becomes:

```ts
const net = await engine.get<{ Containers?: Record<string, { Name: string }> }>(`/networks/${name}`)
for (const container of Object.values(net?.Containers ?? {})) {
  await engine.post(`/networks/${name}/disconnect`, { Container: container.Name, Force: true })
}
await engine.del(`/networks/${name}`)
```

**`ensureService` also calls `ensureAppNetwork`** and must keep passing nothing: a Mongo container has no business reaching the model gateway, and the app's own `ensureInstance` attaches it a moment later anyway.

- [ ] **Step 4: The fake driver moves with the interface**

`InstanceSpec` is P2's shared type, so `fake-driver.ts` and `driver-contract.ts` see the new field. **Add a contract-suite assertion rather than only a type**: a driver that ignores `needsAiGateway` is a driver whose AI apps cannot reach the gateway, and the contract suite is what keeps the abstraction honest.

- [ ] **Step 5: Re-run S6 in full**

```bash
make up && pnpm test:docker -- s6
```

**Expected: 14 probes, every denial still denied.** P4a's note says to re-run this tier rather than assume it still holds, because attaching a platform container to an app network changes the topology S6 measured. **Read probes 1–12's output, not just the exit status** — the interesting question is whether anything that was previously unreachable is now reachable *through* LiteLLM's presence.

- [ ] **Step 6: The negative controls**

```bash
# a) Attach manifest-litellm unconditionally in ensureAppNetwork, then `make down`
#    the litellm container and deploy fixture-app.
#    Expected: PLATFORM_NEIGHBOUR_NOT_ATTACHED on an app with no AI at all. This
#    is the coupling Decision 5 rejects, in its live form.
# b) Restore destroyAppNetwork's fixed list and run `make reset` after deploying
#    an AI app. Expected: the network survives and the command reports success —
#    ORIENTATION §4's measured failure, reproduced deliberately.
# c) Have ensureInstance always pass []. Expected: Task 3 probe 13's positive
#    control RED, and the proof app's /ask times out in Task 16.
```

- [ ] **Step 7: Commit** — `feat: the AI gateway joins an app network only when the app declares models`

---
## Task 9: §8's AI rows render — and this is the task that gives Tasks 6, 7 and 8 a caller

**Files:**
- Modify: `packages/control-plane/src/spec/resolve.ts`, `resolve.test.ts`
- Modify: `packages/control-plane/src/spec/injection.ts`, `injection.test.ts`
- Modify: `packages/control-plane/src/releases/release.ts`, `releases.test.ts`
- Modify: `packages/control-plane/src/api/server.ts`, `src/index.ts`
- Test: `packages/control-plane/src/runtime/docker/roundtrip.docker.test.ts`

**Interfaces:**
- Consumes: `rotateAppKey` (Task 7), `createCatalogueCache` (Task 6), `needsAiGateway` (Task 8), `renderInjection` (P4a).
- Produces:
  - `ResolvedConfig.ai: { models: string[]; budget: { projectMonthlyUsd: number; perUserMonthlyUsd: number } }`
  - `InjectionContext.ai?: { endpoint: string; apiKey: string; defaultChatModel?: string; embeddingModel?: string }`
  - `renderInjection` emitting the six AI rows; **`INJECTION_AI_UNSUPPORTED` is deleted**
  - `deployRelease` rotating the app key and passing `needsAiGateway`

**This is the caller task, exactly as P4a's Task 9 was.** Tasks 6, 7 and 8 ship modules whose only callers are tests. `waitForReady` and `edgeProbe` shipped in P3 Task 14 and nothing called them until Task 17; `isSensitiveDiff` shipped in P2 and waited a whole plan. **Its acceptance is a `grep`**, not a test.

**`ResolvedConfig` gains `ai` and that is Decision 6.** `deployRelease` reads `release.resolvedConfig`; today that carries no `ai` at all, so minting a key would mean re-parsing the AppSpec at deploy time. **Re-deriving a value the release already fixed is the shape that produced seven of P3 Session 5's twenty-one defects** — a blueprint directory, a repository path, an image repository, a port, each correct in the test and wrong in the running system. §13 makes a Release immutable; the resolved config is what a deploy reads. It also means a spec edit between release and redeploy cannot change the key that gets minted.

**`renderInjection` stays pure.** The context carries the *resolved* endpoint, key and model names; the caller does the resolving against the catalogue. A renderer that fetched a catalogue would be a renderer that cannot run in §16's unit tier.

- [ ] **Step 1: Write the failing tests**

```ts
describe('§8 AI rows', () => {
  it('renders the six rows for an app that declares a chat and an embedding model', () => {
    const env = renderInjection(aiContext())
    expect(env.LLM_PROVIDER).toBe('openai')       // §8: there is NO `openai-compat` provider
    expect(env.LLM_ENDPOINT).toBe('http://manifest-litellm:4000/v1')
    expect(env.LLM_API_KEY).toMatch(/^sk-/)
    expect(env.LLM_DEFAULT_MODEL).toBe('default-chat')
    expect(env.EMBEDDINGS_PROVIDER).toBe('openai')
    expect(env.EMBEDDINGS_MODEL).toBe('default-embed')
  })

  it('gives the app the IN-NETWORK endpoint, never the control plane’s loopback', () => {
    // The pair that is not interchangeable and fails silently when swapped: an
    // app handed http://127.0.0.1:7106 gets ECONNREFUSED from inside its own
    // `--internal` network, and the symptom is "the AI is down".
    expect(renderInjection(aiContext()).LLM_ENDPOINT).not.toContain('127.0.0.1')
  })

  it('omits LLM_DEFAULT_MODEL when the app declared no chat model', () => {
    // §8's last AI row is "if declared". An app may legitimately want embeddings
    // only, and an empty LLM_DEFAULT_MODEL is worse than an absent one — the
    // toolkit sends the empty string and LiteLLM answers 400 "model not found".
    const env = renderInjection(aiContext({ defaultChatModel: undefined, embeddingModel: 'default-embed' }))
    expect(env).not.toHaveProperty('LLM_DEFAULT_MODEL')
    expect(env.EMBEDDINGS_MODEL).toBe('default-embed')
  })

  it('renders NO AI row for an app that declares no models', () => {
    const env = renderInjection(baseContext())
    for (const name of INJECTION_VARIABLES.filter((v) => v.requiredIn === 'if-ai')) {
      expect(env, `${name.name} leaked into a non-AI app`).not.toHaveProperty(name.name)
    }
  })

  it('REFUSES to render when models are declared and no key was minted', () => {
    // P4a's INJECTION_AI_UNSUPPORTED is deleted, and this replaces it. The
    // meaning changes — "P4b does not exist" becomes "the caller did not mint a
    // key" — and the property that matters is unchanged: a variable rendered
    // empty is worse than a refusal, because the app starts, looks healthy, and
    // fails on its first question.
    expect(() => renderInjection({ ...aiContext(), ai: undefined })).toThrow(/INJECTION_AI_KEY_MISSING/)
  })
})

describe('resolveConfig carries the AI declaration', () => {
  it('records models and budget on the resolved config', () => {
    const resolved = resolveConfig(specWithAi(), 'staging', DEFAULTS)
    expect(resolved.ai).toEqual({
      models: ['default-chat', 'default-embed'],
      budget: { projectMonthlyUsd: 25, perUserMonthlyUsd: 1 },
    })
  })
})

describe('deployRelease mints and injects', () => {
  it('rotates the key BEFORE the instance starts, and injects what it minted', async () => {
    const order: string[] = []
    const ai = { rotateAppKey: async (_db: Db) => { order.push('key'); return 'sk-minted' } }
    const driver = createFakeDriver({ onEnsureInstance: (spec) => { order.push('instance'); seen = spec } })
    await deployRelease(db, driver, config, { ...deps, ai }, input)
    expect(order).toEqual(['key', 'instance'])
    // Not "a key was minted" — the key the CONTAINER received. Every one of
    // Session 5's seven defects was a value correct in the test and wrong in the
    // running system, because the test handed the driver what it built.
    expect(seen.env.LLM_API_KEY).toBe('sk-minted')
    expect(seen.needsAiGateway).toBe(true)
  })

  it('mints nothing, and asks for no gateway, when the app declares no models', async () => {
    // fixture-app is such an app and P3's whole Docker tier deploys it. An
    // unconditional mint would put a LiteLLM user and a live key behind every app
    // on the platform, and would make the zero-budget refusal from Task 7 fire on
    // a spec that is perfectly valid.
    const calls: string[] = []
    const ai = { rotateAppKey: async (_db: Db) => { calls.push('key'); return 'sk-x' } }
    await deployRelease(db, createFakeDriver({ onEnsureInstance: (s) => { seen = s } }), config, { ...deps, ai }, noAiInput)
    expect(calls).toEqual([])
    expect(seen.needsAiGateway).toBe(false)
  })
})
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm test -- spec/injection spec/resolve releases`

- [ ] **Step 3: Implement**

`INJECTION_VARIABLES`' six AI rows lose their `P4b.` notes and gain a precise `when`:

```ts
  { name: 'LLM_PROVIDER', requiredIn: 'if-ai', when: 'ai.models',
    note: "`openai` — LiteLLM is OpenAI-compatible and there is NO `openai-compat` provider: ProviderType is 'openai' | 'anthropic' | 'ollama' | 'ubc-llm-sandbox'." },
  { name: 'LLM_ENDPOINT', requiredIn: 'if-ai', when: 'ai.models',
    note: 'The IN-NETWORK URL. The toolkit cannot be forced through the egress proxy (P4a, three mechanisms), so the app reaches manifest-litellm directly on its own network.' },
  { name: 'LLM_API_KEY', requiredIn: 'if-ai', when: 'ai.models',
    note: 'Rotated on every deploy; the previous key is revoked (§10).' },
  { name: 'LLM_DEFAULT_MODEL', requiredIn: 'if-ai', when: 'ai.models.chat' },
  { name: 'EMBEDDINGS_PROVIDER', requiredIn: 'if-ai', when: 'ai.models.embedding' },
  { name: 'EMBEDDINGS_MODEL', requiredIn: 'if-ai', when: 'ai.models.embedding' },
```

- [ ] **Step 4: Wire the call site**

`ServerDeps` gains `ai` (the bound `createAiKeyService`) and `catalogue`; `src/index.ts` builds both from `createLiteLlmClient(config.litellm)`. In `deployRelease`, before `ensureInstance`:

```ts
// BEFORE the container starts, for the same reason P4a registers the SP first:
// an app that comes up and asks a question with no key gets a 401 on its first
// request, which is a race nobody reproduces on demand.
let ai: InjectionContext['ai']
if (resolved.ai.models.length > 0) {
  const catalogue = await deps.catalogue.get()
  const declared = resolved.ai.models.map((name) => {
    const entry = catalogue.find((m) => m.name === name)
    if (!entry) {
      // The catalogue moved between validation and deploy. Refuse rather than
      // inject a name LiteLLM will 400 on, and say which model.
      throw new ReleaseError('RELEASE_MODEL_NOT_IN_CATALOGUE', `the model '${name}' is no longer offered`)
    }
    return entry
  })
  const apiKey = await deps.ai.rotateAppKey(db, {
    projectId: environment.projectId, projectSlug, kind: environment.kind,
    models: resolved.ai.models, monthlyUsd: resolved.ai.budget.projectMonthlyUsd,
  })
  ai = {
    endpoint: config.litellm.internalUrl,
    apiKey,
    ...(declared.find((m) => m.kind === 'chat') ? { defaultChatModel: declared.find((m) => m.kind === 'chat')!.name } : {}),
    ...(declared.find((m) => m.kind === 'embedding') ? { embeddingModel: declared.find((m) => m.kind === 'embedding')!.name } : {}),
  }
}
```

**Conditional spread, not `x ?? undefined`.** `exactOptionalPropertyTypes` is on and `defaultChatModel: X | undefined` is not assignable to an optional `defaultChatModel?: string` — sixteen instances of this class across P2 and P3, none of them visible to any test.

- [ ] **Step 5: The grep that is this task's real acceptance**

```bash
grep -rn 'rotateAppKey\|catalogue.get\|needsAiGateway' \
  packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts' | grep -v '/ai/\|/runtime/docker/networks'
```

Expected: at least one line in `releases/release.ts` per name, and one in `api/server.ts` or `src/index.ts` for the deps. **An empty result means this task did not happen**, whatever the tests say.

```bash
grep -rn 'LLM_ENDPOINT\|LLM_API_KEY\|LLM_DEFAULT_MODEL' \
  packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts'
```

Expected: `spec/injection.ts` **only**. Any second producer is Session 5 waiting to happen.

- [ ] **Step 6: Run everything** — `pnpm test && pnpm test && make up && pnpm test:docker`

- [ ] **Step 7: The negative controls**

```bash
# a) Move rotateAppKey after ensureInstance. Expected: the ordering test RED.
#    Then delete the call entirely: RED with ['instance']. Both, because "called
#    late" and "not called" are different defects and this project has shipped the
#    second three times.
# b) Inject config.litellm.url instead of internalUrl. Expected: the loopback
#    test RED — and in the Docker tier, an app that starts healthy and whose
#    /ask returns ECONNREFUSED, which is the failure this pair exists to prevent.
# c) Render LLM_DEFAULT_MODEL as '' when no chat model is declared.
#    Expected: the omission test RED.
# d) Keep INJECTION_AI_UNSUPPORTED and flip the blueprint's provides.ai anyway.
#    Expected: every AI deploy throws at render. This is P4a Decision 12 working
#    as designed; watch it, then delete the refusal.
```

- [ ] **Step 8: Commit** — `feat: §8's AI rows render, and deployRelease mints the key that fills them`

---
## Task 10: `node-ts-mongo@1` grows its AI half

**Files:**
- Modify: `blueprints/node-ts-mongo/blueprint.yaml`, `skeleton/package.json`, `skeleton/package-lock.json`, `agents/AGENTS.md`
- Create: `blueprints/node-ts-mongo/skeleton/ai/llm.js`
- Modify: `packages/control-plane/src/blueprints/blueprints.test.ts`, `src/spec/injection-drift.test.ts`
- Modify: `infra/seed/seed.sh` (only if P4a's derivation did not land — Task 1 settles this)

**Interfaces:**
- Consumes: Task 9's rendered variables — the skeleton reads exactly those names.
- Produces: `node-ts-mongo@1` with `provides.ai: true` and `ubc-genai-toolkit-llm` in `pinned_dependencies`; `ask(question, puid)`, `askStreaming(...)`, `embed(texts)` and `endUserId(puid)` from `skeleton/ai/llm.js`.

**§20 calls the blueprint *"a security multiplier"***: whatever is here is replicated into every application, so the two obligations S3 measured are written **once**, in code, rather than becoming knowledge-pack advice an agent may or may not follow.

**Both of the blueprint's existing refusals still apply** and neither is negotiable: no `# syntax=` directive in `Dockerfile.tmpl` (BuildKit fetches a frontend from Docker Hub before reading line two, and §12's builder has no egress), and `.npmrc` copied **with** the lockfile rather than after it (`npm ci` reads it from the working directory, and arriving later makes D13's mirror inert *in a way that succeeds while the network is up*).

**Flipping `provides.ai` to `true` is additive.** It permits more, so no existing app breaks and it is not a major-version bump — P4a's Decision 12 says so, and this is the flip it named.

- [ ] **Step 1: Write the failing tests**

```ts
it('node-ts-mongo@1 now supports ai, and pins the toolkit exactly', async () => {
  const d = (await loadBlueprints(BLUEPRINTS_ROOT)).resolve('node-ts-mongo@1')!
  expect(d.provides.ai).toBe(true)
  // C6/D30: an exact version, never a range. §16's drift tier asserts against the
  // pinned one, and a caret would let the contract drift underneath the test that
  // exists to catch drift. `descriptorSchema` already refuses anything but x.y.z.
  expect(d.pinned_dependencies).toMatchObject({ 'ubc-genai-toolkit-llm': '0.7.0' })

  // THE OTHER SIDE of the comparison Task 3 could only make one-sidedly, because
  // the blueprint had no AI half then. §16's AI-path tier runs against the
  // control plane's devDependency; if that and the blueprint's pin diverge, the
  // tier is asserting the behaviour of a version no application installs.
  const installed = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { devDependencies: Record<string, string> }
  expect(installed.devDependencies['ubc-genai-toolkit-llm']).toBe(
    d.pinned_dependencies!['ubc-genai-toolkit-llm'],
  )
})

it('the skeleton passes encoding_format on EVERY embed call', async () => {
  // Read as SOURCE, not as behaviour. S3's finding is that the WRONG call
  // succeeds: 192 near-zero values instead of 768, no error, every other
  // assertion green. A behavioural test catches the call it happens to make;
  // this catches the one somebody adds next year.
  const source = await readFile(join(pathOf('node-ts-mongo@1'), 'skeleton/ai/llm.js'), 'utf8')
  const embedCalls = source.match(/[.]embed[(]/g) ?? []
  const withFormat = source.match(/encoding_format: 'float'/g) ?? []
  expect(embedCalls.length).toBeGreaterThan(0)
  expect(withFormat.length, 'an embed() without encoding_format float').toBe(embedCalls.length)
})

it('the skeleton namespaces the end-user id, never a bare PUID hash', async () => {
  // S3 Evidence 6: LiteLLM keys the end-user budget on that string GLOBALLY, so a
  // bare hash means a student who exhausts one course tool's allowance is refused
  // by EVERY Manifest application. The app computes it; §10 says what it is.
  const source = await readFile(join(pathOf('node-ts-mongo@1'), 'skeleton/ai/llm.js'), 'utf8')
  expect(source).toMatch(/MANIFEST_PROJECT_SLUG/)
  expect(source).toMatch(/MANIFEST_ENV/)
})
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm test -- blueprints`

- [ ] **Step 3: The descriptor and the dependency**

```yaml
provides:
  services: [mongo]
  auth_providers: [cwl, none]
  # Flipped from false by P4b. ADDITIVE — it permits more, so no app breaks and
  # this is not a major-version bump (P4a Decision 12).
  ai: true

pinned_dependencies:
  express: 4.21.2
  express-session: 1.18.1
  passport: 0.7.0
  passport-ubcshib: 0.1.6
  mongodb: 6.12.0
  # Its closure carries @anthropic-ai/sdk, ollama and openai — two provider SDKs
  # this platform never uses, in every faculty app's image and in Verdaccio's
  # warm set. Measured 2026-09-07 and accepted: C6 says Manifest adapts to the
  # toolkit rather than reshaping it, and Step 6 CHECKS the offline build rather
  # than assuming it.
  ubc-genai-toolkit-llm: 0.7.0
```

- [ ] **Step 4: The AI component**

`skeleton/ai/llm.js`. Every value comes from §8's contract and **none has a fallback**, for the reason P4a's `ubcshib.js` gives: a fallback here reintroduces the fail-open default one level up.

```js
// THE AI COMPONENT. §20: "the blueprint is a security multiplier" — what is here
// is replicated into every application, so the two things S3 measured are done
// once, in code, rather than left as advice in the knowledge pack.
//
// BOTH FAILURES ARE SILENT. Neither raises an error, and every other assertion
// in a caller stays green while they happen.
import { LLMModule } from 'ubc-genai-toolkit-llm'
import { createHash } from 'node:crypto'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(name + ' is required and was not injected (section 8)')
  return value
}

const llm = new LLMModule({
  // Section 8: `openai`. There is NO `openai-compat` provider — ProviderType is
  // 'openai' | 'anthropic' | 'ollama' | 'ubc-llm-sandbox', and
  // openai-compat-mapping.ts is a shared internal module, not a provider.
  provider: required('LLM_PROVIDER'),
  apiKey: required('LLM_API_KEY'),
  endpoint: required('LLM_ENDPOINT'),
  defaultModel: required('LLM_DEFAULT_MODEL'),
  // Optional: an app may declare a chat model and no embedding model. Conditional
  // rather than `?? undefined`, so the key is absent rather than present-and-empty.
  ...(process.env.EMBEDDINGS_MODEL ? { embeddingModel: process.env.EMBEDDINGS_MODEL } : {}),
})

/**
 * Section 10, and it is NOT a bare hash of the PUID.
 *
 * LiteLLM keys the end-user budget on this string GLOBALLY rather than per key
 * (S3 Evidence 6), so an un-namespaced hash means a student who exhausts their
 * allowance in one course tool is refused by every other Manifest application —
 * an ordinary day's use turning into a cross-app outage.
 */
export function endUserId(ubcEduCwlPuid) {
  const namespace = process.env.MANIFEST_PROJECT_SLUG + ' ' + process.env.MANIFEST_ENV
  return createHash('sha256').update(ubcEduCwlPuid + ' ' + namespace).digest('hex')
}

/** One question, attributed to one person. */
export async function ask(question, ubcEduCwlPuid) {
  const response = await llm.sendMessage(question, { user: endUserId(ubcEduCwlPuid) })
  return response.content
}

/** Streamed, for anything a person watches arrive. */
export async function askStreaming(question, ubcEduCwlPuid, onChunk) {
  return llm.streamConversation([{ role: 'user', content: question }], onChunk, {
    user: endUserId(ubcEduCwlPuid),
  })
}

/**
 * MANDATORY: encoding_format 'float'.
 *
 * The OpenAI SDK >= 4.75 defaults it to base64 and then decodes the reply with
 * toFloat32Array. LiteLLM's Ollama path ignores the field and returns a plain
 * float list, so 768 floats are coerced to 768 BYTES and read back as 192
 * float32s, almost all zero — with no error, and with every other assertion in
 * the caller still passing (S3 Evidence 8; reproduced on 0.7.0 by P4a).
 *
 * Returns the vectors. `embed` resolves to an EmbeddingResponse — an object with
 * `embeddings`, `model` and `usage` — not to a bare array.
 */
export async function embed(texts) {
  const response = await llm.embed(texts, { encoding_format: 'float' })
  return response.embeddings
}
```

- [ ] **Step 5: The knowledge pack**

`agents/AGENTS.md` gains an **AI** section: three things an agent must never do, each with its consequence, and one it must always do.

1. **Never call `embed()` without `encoding_format: 'float'`** — import the blueprint's `embed()`. Calling the toolkit directly returns 192 near-zero values in place of 768, silently.
2. **Never pass a bare PUID, or a bare hash of one, as the LiteLLM `user`** — use `endUserId()`. A bare hash makes one app's exhausted budget lock a student out of every Manifest app.
3. **Never put a vendor model id in `ai.models`** — logical names only, and a model whose `max_classification` is below the app's `data.classification` is refused at validation (D17), not at runtime.

And: **always declare `ai.budget.project_monthly_usd`.** It defaults to 0, and a zero budget refuses every request; Task 7 makes that a validation error rather than a runtime surprise, and the message says so.

- [ ] **Step 6: Build it offline, and check the mirror rather than the exit code**

```bash
make up && pnpm test:docker -- roundtrip
```

**If `npm ci` fails, the seed's warm list did not reach the toolkit.** Check Verdaccio's storage — this is how S1's silently-wrong build was caught, because an exit code of 0 with the public registry behind it looks identical to a correct build:

```bash
docker exec manifest-verdaccio ls /verdaccio/storage/ | grep -i genai
docker exec manifest-verdaccio ls /verdaccio/storage/openai/
```

Empty means re-run `make seed`. P4a's Task 3 derives the warm list from the blueprint lockfiles, so adding the dependency and regenerating `package-lock.json` should be all that is needed. **If the list is still the hardcoded three, that is a P4a divergence and belongs in Task 1's record before it is fixed here.**

- [ ] **Step 7: Let the drift test do its job**

P4a's `injection-drift.test.ts` compares the blueprint's actual `process.env` reads against `renderInjection`'s output. `skeleton/ai/llm.js` now reads six new names, so **`fullContext()` must declare both a chat and an embedding model** or the first assertion goes red naming all six. **That redness is the tier working** — fix the context, never the expectation.

- [ ] **Step 8: The negative controls**

```bash
# a) Remove encoding_format from embed(). Expected: the source test RED. Then
#    deploy and call it: dim 192, no error, and the app perfectly healthy.
#    Watch both — the second is what the first exists to prevent.
# b) Change endUserId to hash the PUID alone. Expected: the namespacing test RED.
#    The runtime consequence needs two apps and a spent budget, which is exactly
#    why the assertion is on the source.
# c) Add `# syntax=docker/dockerfile:1` to Dockerfile.tmpl. Expected:
#    renderDockerfile refuses it BY NAME — not a build failure naming DNS and
#    Docker Hub, which is what it looked like the first time.
# d) Flip provides.ai back to false and deploy the proof app. Expected:
#    checkBlueprintCompatibility refuses with section 25's clear message, at
#    validation rather than at deploy.
```

- [ ] **Step 9: Commit** — `feat: node-ts-mongo@1 gains its AI component, with both silent failures closed`

---
## Task 11: Build logs are captured, streamed line by line, and stored

**Files:**
- Create: `packages/control-plane/src/observability/build-logs.ts`, `build-logs.test.ts`
- Modify: `packages/control-plane/drizzle/0002_build_logs_and_incidents.sql`, `src/db/schema.ts`
- Modify: `packages/control-plane/src/runtime/driver.ts`, `fake-driver.ts`, `driver-contract.ts`
- Modify: `packages/control-plane/src/runtime/docker/builder.ts`, `driver.ts`
- Modify: `packages/control-plane/src/releases/build.ts`, `src/api/routes/delivery.ts`

**Interfaces:**
- Consumes: `makeRedactor` (P4a).
- Produces:
  - `Driver.buildImage(src, spec, opts?: { onLog?: (line: LogLine) => void }): Promise<ImageRef>` — one optional argument, so no existing caller changes
  - `appendBuildLog(db, buildId, lines: LogLine[], redactor): Promise<void>`
  - `readBuildLog(db, buildId, opts?: { tail?: number }): Promise<LogLine[]>`
  - `GET /builds/:buildId/logs`

**`builds.logs_ref` has named a store that does not exist since P3 wrote it**, and P3's own column comment says so: *"`logsRef` names a log store that does not exist yet"*. Until it does, §14's *"build and deploy logs stream over WebSocket"* has nothing to stream, and a faculty member whose build failed can read one sentence — which P3 measured as the state where *"the only way to learn why a build had failed was to re-run it by hand outside the platform"*.

**Line by line, not on completion.** `withEphemeralBuilder` collects the whole log with `execFile` and returns it at the end, and a front-end that receives nothing for two minutes and then everything at once is not a stream. `execFile` becomes `spawn` with a line splitter. **This is the only part of the task with any risk in it**, so it is asserted directly: a test counts callbacks *during* a build, not after.

**Redacted at capture** (§14, and it names build logs explicitly). The build environment holds the minted registry JWT and the build credential; those go into the redactor's secret set before the first line is written, not after.

- [ ] **Step 1: Write the failing tests**

```ts
describe('build logs', () => {
  it('stores lines and reads back the tail in order', async () => {
    await withRollback(async (db, { buildId }) => {
      await appendBuildLog(db, buildId, [
        { at: new Date(), stream: 'stdout', text: 'step 1' },
        { at: new Date(), stream: 'stderr', text: 'step 2' },
      ], (v) => v)
      const tail = await readBuildLog(db, buildId, { tail: 1 })
      // The LAST line, not the first. A tail that returns the head is the kind of
      // defect that looks right until a build fails on its 400th line.
      expect(tail.map((l) => l.text)).toEqual(['step 2'])
    })
  })

  it('redacts at capture, so the unredacted form is never persisted', async () => {
    // Section 14: "redacted at capture, never at display". The build environment
    // holds a minted registry JWT; a `docker login` echo or a buildkit debug line
    // puts it into the log.
    await withRollback(async (db, { buildId }) => {
      const redact = makeRedactor(['eyJhbGciOiJSUzI1NiJ9.CANARY'])
      await appendBuildLog(db, buildId, [
        { at: new Date(), stream: 'stderr', text: 'auth: Bearer eyJhbGciOiJSUzI1NiJ9.CANARY' },
      ], redact)
      const rows = await db.select().from(buildLogs)
      expect(JSON.stringify(rows)).not.toContain('CANARY')
      expect(JSON.stringify(rows)).toContain('[REDACTED]')
    })
  })

  it('is append-only by GRANT, like events', async () => {
    // Section 20's rule applied to the other thing a faculty member is shown.
    // The table is owned by manifest_audit_owner, which P4a created, and the
    // application role is granted SELECT and INSERT only. A REVOKE against an
    // owner is a no-op that reads exactly like a control.
    await withRollback(async (db, { buildId }) => {
      await appendBuildLog(db, buildId, [{ at: new Date(), stream: 'stdout', text: 'x' }], (v) => v)
      await expect(db.execute(sql`UPDATE build_logs SET text = 'y'`)).rejects.toThrow(/permission denied/i)
      await expect(db.execute(sql`DELETE FROM build_logs`)).rejects.toThrow(/permission denied/i)
    })
  })

  it('a failed build keeps its log', async () => {
    // The case that matters. P3 measured the alternative: `startBuild` caught the
    // error and discarded it, the row said `failed` and nothing else, and the
    // only way to learn why was to re-run the build by hand outside the platform.
    const driver = failingDriver('npm ci exited 1')
    const build = await startBuild(db, driver, input)
    expect(build.status).toBe('failed')
    expect((await readBuildLog(db, build.id)).length).toBeGreaterThan(0)
  })
})
```

And in the **driver contract suite**, so every driver has to do it:

```ts
it('reports build progress through onLog BEFORE it resolves', async () => {
  // Not "logs exist afterwards" — that is what execFile already gave us and it
  // is not a stream. A front-end that receives nothing for two minutes and then
  // everything at once has not received a stream.
  const seen: string[] = []
  let resolved = false
  const promise = driver.buildImage(src, spec, { onLog: (l) => seen.push(l.text) })
  promise.then(() => { resolved = true })
  await waitUntil(() => seen.length > 0)
  expect(resolved, 'every line arrived after the build finished').toBe(false)
  await promise
})
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm test -- observability/build-logs runtime/`

- [ ] **Step 3: The migration**

```sql
CREATE TABLE build_logs (
  build_id uuid NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  seq      integer NOT NULL,
  at       timestamptz NOT NULL DEFAULT now(),
  stream   text NOT NULL CHECK (stream IN ('stdout','stderr')),
  text     text NOT NULL,
  PRIMARY KEY (build_id, seq)
);

-- Section 20's append-only rule, and the same trap P4a's self-review caught on
-- `events`: REVOKE against the OWNER of a table does nothing, because an owner's
-- privileges cannot be revoked from itself. Ownership moves first, and
-- manifest_audit_owner already exists from P4a's 0001 migration.
ALTER TABLE build_logs OWNER TO manifest_audit_owner;
REVOKE ALL ON build_logs FROM manifest;
GRANT SELECT, INSERT ON build_logs TO manifest;

-- The tail query is `ORDER BY seq DESC LIMIT n`, and it runs while a build is
-- still writing. Without this the plan is a sort of the whole build.
CREATE INDEX build_logs_tail_idx ON build_logs (build_id, seq DESC);
```

- [ ] **Step 4: Make the builder stream**

In `runtime/docker/builder.ts`, `runBuildxBuild`'s `execFile` becomes `spawn`, with a line splitter over `stdout` and `stderr` and a buffer for the partial trailing line:

```ts
// spawn, not execFile: execFile buffers everything and hands it over at exit,
// which is a report and not a stream. BuildKit writes its progress to STDERR,
// so a splitter on stdout alone receives almost nothing — and would look like a
// silent build rather than a wrong pipe.
const child = spawn(command, args, { env })
let out = ''
const split = (chunk: string, stream: 'stdout' | 'stderr') => {
  out += chunk
  const lines = out.split('\n')
  out = lines.pop() ?? ''
  for (const text of lines) onLog?.({ at: new Date(), stream, text })
}
```

Keep collecting the full text as well — Task 13's `Incident` wants a tail and Step 1's failed-build test reads it back after the fact.

- [ ] **Step 5: Name the caller**

`startBuild` passes `onLog` and writes through `appendBuildLog`, **in both the success and the failure path** — the failure path is the one that matters, and it is the one a `try`/`catch` most easily skips. Add `GET /builds/:buildId/logs` to `delivery.ts`, authorized exactly like `GET /builds/:buildId` (P2 measured what happens when it is not: an IDOR answering 200), and add it to `authz-contract.ts`'s `ROUTES` or the drift guard fails the build.

```bash
grep -rn 'appendBuildLog\|readBuildLog' packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts' | grep -v '/observability/'
```

Expected: `releases/build.ts` and `api/routes/delivery.ts`.

- [ ] **Step 6: Run everything** — `pnpm test && pnpm test && make up && pnpm test:docker`

- [ ] **Step 7: The negative controls**

```bash
# a) Put execFile back. Expected: the contract-suite streaming test RED —
#    `resolved` is true before the first line arrives.
# b) Split only stdout. Expected: a build that produces almost no lines at all,
#    which reads as "quiet build" rather than "wrong pipe". Watch the count.
# c) Move appendBuildLog out of the catch in startBuild. Expected: the
#    failed-build test RED with zero lines — P3's exact defect, reproduced.
# d) Restore `manifest` as build_logs' owner, keeping the REVOKE. Expected: the
#    append-only test RED, because the UPDATE succeeds.
```

- [ ] **Step 8: Commit** — `feat: build logs are captured line by line, redacted, and stored`

---

## Task 12: Redaction grows its heuristic half

**Files:**
- Modify: `packages/control-plane/src/observability/redact.ts`, `redact.test.ts`

**Interfaces:**
- Consumes: nothing new — P4a's `makeRedactor(secretValues)` keeps its signature.
- Produces: the same function, now also matching entropy and pattern heuristics.

**§14 in full:** *"Redaction matches every value in the app's own secret set (an exact, high-confidence match), plus entropy and pattern heuristics for tokens and credential-bearing URLs."* P4a shipped the first clause because it owned the secret set; this is the second. §14 also states the limit plainly, and this task does not pretend otherwise: *"This is defence in depth, not a guarantee: heuristics miss things."*

**The risk here is the opposite of the risk in the exact-match half.** An over-eager heuristic redacts a stack trace into `[REDACTED] at [REDACTED]:[REDACTED]`, which destroys the diagnosability §14 exists to provide and which P3 measured the cost of directly. So every pattern below is anchored on something a secret has and prose does not, and there is a test asserting that an ordinary failing build log survives intact.

- [ ] **Step 1: Write the failing tests**

```ts
describe('redaction heuristics (section 14)', () => {
  const redact = makeRedactor([])   // NO known secrets: heuristics only

  it('redacts the credential in a URL and keeps the rest of the URL', () => {
    // "credential-bearing URLs", section 14's own phrase. The host and database
    // are what makes the line diagnosable and they are not the secret.
    expect(redact('mongodb://app:s3cr3tP4ss@mf-chem-labs-staging-db:27017/chem_labs'))
      .toBe('mongodb://app:[REDACTED]@mf-chem-labs-staging-db:27017/chem_labs')
  })

  it('redacts a LiteLLM key, a bearer token and a JWT', () => {
    expect(redact('key=sk-aG31FbBZgAFKj15VGwkhvQ')).toBe('key=[REDACTED]')
    expect(redact('Authorization: Bearer abcdef0123456789abcdef')).toBe('Authorization: Bearer [REDACTED]')
    expect(redact('t=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln')).toBe('t=[REDACTED]')
  })

  it('redacts a PEM private key block, header to footer', () => {
    // A key is many lines, and a line-by-line redactor leaves the body behind.
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQ\n-----END PRIVATE KEY-----'
    expect(redact(`sp key:\n${pem}\ndone`)).toBe('sp key:\n[REDACTED]\ndone')
  })

  it('redacts a long high-entropy run and NOT a long ordinary word', () => {
    expect(redact('token 9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e')).toContain('[REDACTED]')
    // The control. Without it, "entropy heuristic" means "redact anything long".
    expect(redact('antidisestablishmentarianism internationalisation')).toBe(
      'antidisestablishmentarianism internationalisation',
    )
  })

  it('leaves an ordinary failing build log completely intact', () => {
    // THE ASSERTION THAT MAKES THIS SAFE TO SHIP. Section 14 exists so a faculty
    // member can see what broke; a heuristic that eats a stack trace destroys
    // exactly that, and P3 measured what an unreadable failure costs — fixing
    // two diagnosability defects immediately named four more.
    const log = [
      'npm error code ELIFECYCLE',
      'npm error path /app',
      '  at Module._compile (node:internal/modules/cjs/loader:1364:14)',
      "Error: Cannot find module 'mongodb'",
      '#12 [4/6] RUN npm ci --omit=dev',
    ].join('\n')
    expect(redact(log)).toBe(log)
  })

  it('still redacts a known secret that no heuristic would catch', () => {
    // The exact-match half must survive this task. "hunter2" has low entropy, no
    // prefix and no pattern; it is redacted because the app's secret set says so.
    expect(makeRedactor(['hunter2'])('password is hunter2')).toBe('password is [REDACTED]')
  })

  it('is idempotent', () => {
    // recordEvent redacts, and an Incident built from redacted logs is redacted
    // again. A second pass that mangles [REDACTED] would corrupt stored rows.
    const once = redact('key=sk-aG31FbBZgAFKj15VGwkhvQ')
    expect(redact(once)).toBe(once)
  })
})
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm test -- observability/redact`

- [ ] **Step 3: Implement, patterns before entropy**

```ts
/**
 * Ordered. Each pattern is anchored on something a SECRET has and prose does
 * not — a scheme with credentials, a known key prefix, a PEM armour, a JWT's
 * three dot-separated base64url segments. The entropy rule runs last and only on
 * what the patterns left, because it is the only rule that can be wrong about
 * ordinary text.
 */
const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED]'],
  // The password only. The host and database are what make the line diagnosable.
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@]+)(@)/gi, '$1[REDACTED]$3'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[REDACTED]'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, '[REDACTED]'],
  [/(\bBearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[REDACTED]'],
]

/**
 * Shannon entropy per character. 3.0 bits is above English prose (~2.3 on runs
 * this short) and below base64/hex of the same length. The LENGTH FLOOR does most
 * of the work: a 24-character unbroken run of mixed case, digits and symbols is
 * not a word, and words are what the control test protects.
 */
const CANDIDATE = /\b[A-Za-z0-9+/_=-]{24,}\b/g
```

**`[REDACTED]` itself must not be a candidate**, which is what the idempotence test asserts — it is 10 characters, below the floor, so this holds by construction rather than by a special case. Say so in a comment, because the next person to lower the floor needs to know what it is holding up.

- [ ] **Step 4: Run them and watch them pass.**

- [ ] **Step 5: The negative controls**

```bash
# a) Drop the length floor to 8. Expected: the ordinary-build-log test RED, with
#    `ELIFECYCLE` and `loader:1364:14` redacted. This is the failure mode that
#    matters and it is invisible until somebody needs to read a log.
# b) Run the entropy rule BEFORE the URL pattern. Expected: the URL test RED —
#    the whole host gets eaten because the password and host together are one
#    long run.
# c) Delete the PEM rule. Expected: the PEM test RED with the key BODY intact
#    and only the armour lines gone, which is the shape a line-based redactor
#    leaves behind.
# d) Pass a known secret of 'a' with the heuristics on. Expected: P4a's
#    short-secret floor still refuses it — this task must not have weakened it.
```

- [ ] **Step 6: Commit** — `feat: redaction gains its entropy and pattern half, without eating a stack trace`

---

## Task 13: `Incident` — the failure, shaped as a repair prompt

**Files:**
- Create: `packages/control-plane/src/observability/incidents.ts`, `incidents.test.ts`
- Modify: `packages/control-plane/drizzle/0002_build_logs_and_incidents.sql`, `src/db/schema.ts`
- Modify: `packages/control-plane/src/spec/diff.ts`, `diff.test.ts`
- Modify: `packages/control-plane/src/releases/release.ts`
- Modify: `packages/control-plane/src/api/routes/delivery.ts`, `src/api/authz-contract.ts`

**Interfaces:**
- Consumes: `makeRedactor` (P4a, Task 12), `Driver.logs`, `Driver.status`.
- Produces:
  - `captureIncident(db, driver, { instanceId, environmentId, releaseId }, redactor): Promise<Incident>`
  - `incidentPrompt(incident, context): string` — §14's repair prompt
  - `describeDiff(before: ManifestSpec, after: ManifestSpec): SpecChange[]` in `spec/diff.ts`
  - `GET /environments/:environmentId/incidents`

**§14 specifies four fields and one purpose**, and the purpose is the part most likely to be dropped: *"The `Incident` is deliberately shaped to be handed **straight back to an AI agent as a repair prompt**… This closes the loop from 'AI builds it' to 'AI keeps it running' and costs almost nothing, since the data is captured regardless."* A row with four columns and no `incidentPrompt` is the near half; the prompt is what §14 is actually asking for, and it is twenty lines.

**Where it is written, and why not by a watcher (Decision 13).** §11's reconciliation loop is Phase 4 (D10), so Phase 1 has no periodic anything. `deployRelease` already observes `starting → failed`, already holds the instance handle and the release, and is the moment a faculty member's deploy visibly breaks. A crash **loop** genuinely needs the reconciler and is named in *What this plan does not build*.

**`describeDiff` is not `isSensitiveDiff`.** That one answers *"does this need an approval?"* and returns seven field names (D9). This one answers *"what changed since the app last worked?"* and returns readable changes. They share `spec/diff.ts` because they share the ordering-insensitive comparison helpers — reordering a list is not a change of intent — and P2 paid for that once already, when a plain `JSON.stringify` on `services` escalated a release for a swap that changed nothing.

- [ ] **Step 1: Write the failing tests**

```ts
describe('incidents (section 14)', () => {
  it('captures the exit reason, the failing check and 200 lines of log', async () => {
    await withRollback(async (db, fixture) => {
      const driver = fakeDriverWithLogs(300)   // more than the tail, deliberately
      const incident = await captureIncident(db, driver, fixture, (v) => v)
      expect(incident.logTail.split('\n')).toHaveLength(200)
      // The LAST 200, not the first. A head is what a naive limit gives you and
      // it is the half that never contains the error.
      expect(incident.logTail).toContain('line 300')
      expect(incident.logTail).not.toContain('line 1\n')
      expect(incident.failedCheck).toBe('readiness: GET /healthz through the edge')
      expect(incident.exitReason).toBeTruthy()
    })
  })

  it('redacts the log tail at capture', async () => {
    // Section 14 names Incident.log_tail first in the list of things redacted at
    // capture. An app that logs its own connection string on a failed start is
    // the ordinary case, not the exotic one.
    await withRollback(async (db, fixture) => {
      const driver = fakeDriverWithLogs(5, 'connect failed mongodb://app:hunter2@db:27017/x')
      const incident = await captureIncident(db, driver, fixture, makeRedactor(['hunter2']))
      expect(incident.logTail).not.toContain('hunter2')
      const [row] = await db.select().from(incidents)
      expect(JSON.stringify(row)).not.toContain('hunter2')
    })
  })

  it('diffs against the last HEALTHY release, not the previous one', async () => {
    // "the diff since the last healthy release", section 14. The previous release
    // may itself have failed, and diffing against a failure tells a faculty
    // member nothing about what they broke.
    await withRollback(async (db, fixture) => {
      const healthy = await releaseThatReached('healthy', { services: [] })
      await releaseThatReached('failed', { services: [{ type: 'mongo', version: '7', name: 'db' }] })
      const incident = await captureIncident(db, driver, fixture, (v) => v)
      expect(incident.diffSinceHealthy).toContain('services')
      expect(incident.diffSinceHealthy).toContain(healthy.id)
    })
  })

  it('says so plainly when there has never been a healthy release', async () => {
    // The FIRST deploy is the likeliest one to fail, and it has nothing to diff
    // against. An empty string here reads as "nothing changed", which is the
    // opposite of the truth.
    await withRollback(async (db, fixture) => {
      const incident = await captureIncident(db, freshDriver, fixture, (v) => v)
      expect(incident.diffSinceHealthy).toMatch(/never (been )?healthy/i)
    })
  })

  it('produces a repair prompt an agent can act on', async () => {
    // Section 14's actual requirement. Asserted on CONTENT rather than on
    // length: a prompt without the log tail or without the failing check cannot
    // be acted on, and both are the fields that get dropped when a template is
    // tidied.
    const prompt = incidentPrompt(incident, { slug: 'chem-labs', environmentKind: 'staging' })
    expect(prompt).toContain('chem-labs')
    expect(prompt).toContain(incident.failedCheck)
    expect(prompt).toContain(incident.logTail.split('\n').at(-1)!)
    expect(prompt).toContain(incident.diffSinceHealthy)
    // And it must not contain an instruction to do anything outside the app —
    // the prompt goes to an agent with a delegated token (D24) in Phase 3.
    expect(prompt).toMatch(/manifest\.yaml|application code/i)
  })
})

describe('describeDiff', () => {
  it('reads as a change, not as a JSON dump', () => {
    const changes = describeDiff(before, after)
    expect(changes).toContainEqual({
      path: 'services', from: 'none', to: 'mongo 7 (db)',
      summary: 'added a mongo database called db',
    })
  })

  it('ignores a reordering, like isSensitiveDiff does', () => {
    // P2 paid for this once: a plain JSON.stringify on `services` escalated a
    // release to approval for swapping two entries, which changed nothing.
    expect(describeDiff(withServices([a, b]), withServices([b, a]))).toEqual([])
  })
})
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm test -- observability/incidents spec/diff`

- [ ] **Step 3: The migration and the table**

```sql
CREATE TABLE incidents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id         uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  exit_reason         text NOT NULL,
  log_tail            text NOT NULL,
  failed_check        text NOT NULL,
  diff_since_healthy  text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Append-only, like events and build_logs, and for the same reason: an incident
-- is what an app's owner is shown about a failure, and a record that can be
-- edited after the fact is not a record (section 20).
ALTER TABLE incidents OWNER TO manifest_audit_owner;
REVOKE ALL ON incidents FROM manifest;
GRANT SELECT, INSERT ON incidents TO manifest;
```

**Every column is `NOT NULL`.** `diff_since_healthy` carries the sentence about there never having been a healthy release rather than a null; a nullable column here becomes an empty panel in a UI and reads as "nothing changed".

- [ ] **Step 4: The repair prompt**

```ts
/**
 * Section 14: the Incident is "deliberately shaped to be handed straight back to
 * an AI agent as a repair prompt". This is that shape, and it is the part of the
 * requirement that would otherwise be quietly dropped — the table alone is the
 * near half.
 *
 * It says what broke, what the platform checked, what the app printed, and what
 * changed since it last worked. It does NOT suggest a fix: the agent has the
 * repository and this does not.
 */
export function incidentPrompt(
  incident: Incident,
  ctx: { slug: string; environmentKind: string },
): string {
  return [
    `The application "${ctx.slug}" failed to start in its ${ctx.environmentKind} environment.`,
    '',
    `What the platform checked: ${incident.failedCheck}`,
    `How it ended: ${incident.exitReason}`,
    '',
    'What changed since the last time it started successfully:',
    incident.diffSinceHealthy,
    '',
    'The last lines the application printed:',
    incident.logTail,
    '',
    'Change the application code or manifest.yaml so that this check passes, and',
    'explain the change in one sentence a non-engineer can read.',
  ].join('\n')
}
```

- [ ] **Step 5: Name the caller**

In `deployRelease`, where the state machine already resolves `starting -> failed`:

```ts
// The one moment Phase 1 actually has (Decision 13). A crash LOOP needs the
// reconciler, which is Phase 4 (D10); a deploy that never reached healthy is
// right here, with the handle, the release and the failing check all in hand.
if (next === 'failed') {
  await captureIncident(db, driver, {
    instanceId: row.id, environmentId: environment.id, releaseId: release.id,
  }, redactor)
}
```

Add `GET /environments/:environmentId/incidents`, authorized like the other environment routes, **and add it to `authz-contract.ts`** — the drift guard fails the build for an uncovered route, and that is the point of it.

```bash
grep -rn 'captureIncident\|incidentPrompt' packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts' | grep -v '/observability/'
```

Expected: `releases/release.ts` and `api/routes/delivery.ts`.

- [ ] **Step 6: Run everything** — `pnpm test && pnpm test && make up && pnpm test:docker`

- [ ] **Step 7: The negative controls**

```bash
# a) Take the FIRST 200 log lines instead of the last. Expected: the tail test
#    RED. Then read the captured incident from a real failed deploy: it contains
#    the image pull and nothing about the failure.
# b) Diff against the previous release rather than the last healthy one, then
#    fail two deploys in a row. Expected: the third incident's diff is empty and
#    the "what changed" section is a lie.
# c) Pass the identity function as the redactor. Expected: the redaction test RED
#    with the connection string in the row.
# d) Delete incidentPrompt and keep the table. Expected: the prompt test RED —
#    and note that NOTHING ELSE fails, which is exactly why section 14's purpose
#    clause needs its own assertion.
```

- [ ] **Step 8: Commit** — `feat: a failed deploy produces an Incident shaped as a repair prompt`

---
## Task 14: `WS /projects/:projectId/events` — one stream per project, authorized before it upgrades

**Files:**
- Create: `packages/control-plane/src/observability/bus.ts`, `bus.test.ts`
- Create: `packages/control-plane/src/api/routes/events.ts`, `events.test.ts`
- Modify: `packages/control-plane/src/api/server.ts`, `src/index.ts`, `src/api/authz-contract.ts`, `package.json`

**Interfaces:**
- Consumes: `assertCapability` (P2), `recordEvent`'s row shape (P4a), `readBuildLog` (Task 11).
- Produces:
  - `type StreamFrame` — the union defined below, with `kind: 'event' | 'log' | 'control'`
  - `interface EventBus { publish(frame: StreamFrame): void; subscribe(projectId: string, listener: (f: StreamFrame) => void): () => void }`
  - `createEventBus(): EventBus`
  - `recentFramesFor(db, projectId, limit): Promise<StreamFrame[]>` — the replay, read from the append-only `events` table newest-first and returned oldest-first
  - `MAX_BUFFERED_BYTES = 1_048_576` — one megabyte, past which a socket is closed with 1013 rather than buffered
  - `WS /projects/:projectId/events`, and `GET` on the same URL answering **426** to an authorized actor

**The frame and the guard, defined once here because five code blocks below use them:**

```ts
/** What travels over the socket. `kind` is what a client switches on. */
export type StreamFrame =
  | { kind: 'event'; id: string; projectId: string; subject: string; type: string
      humanMessage: string; machineDetail: unknown; createdAt: string }
  | { kind: 'log'; id: string; projectId: string; buildId: string
      stream: 'stdout' | 'stderr'; text: string; createdAt: string }
  | { kind: 'control'; id: string; projectId: string; type: 'manifest.stream.ready' }

/**
 * ONE authorization, called from both halves of the route. Written as a function
 * rather than inlined twice because the two halves must not be able to disagree —
 * a guarded HTTP handler beside an unguarded socket handler passes the whole
 * authorization contract suite and leaks every event.
 */
async function authorizeStream(deps: ServerDeps, request: FastifyRequest) {
  const actor = requireActor(request)
  const { projectId } = request.params as { projectId: string }
  // `read` is the capability the project routes already use; a stream carries
  // nothing a GET on the project does not.
  await assertCapability(deps.db, actor, projectId, 'read')
  return actor
}
```

**D23.2, verbatim:** *"One event stream per project, not polling. Build logs, instance state transitions, incidents and approval decisions all flow over `WS /projects/:id/events`. A polling API bakes in an assumption about UI shape; a stream lets a chat interface, a dashboard, a CLI or a notification bot all react to the same source."* Approval decisions are P6's and are the one item on that list P4b does not emit.

**The route authorizes before it upgrades, and that is Decision 12.** `app.inject` cannot perform a WebSocket upgrade, so a socket-only route is one §16's authorization contract suite structurally cannot cover — and that suite's drift guard *fails the build* on an uncovered route, which would tempt whoever hits it into writing an exemption into the one tier that exists because *"IDOR is the likeliest bug class in a multi-tenant control plane"*. A plain `GET` therefore runs the same `assertCapability` and answers `426 Upgrade Required` when it passes, so the suite exercises the stream as all five actors and a stranger gets `404` before a socket exists.

**Two frame kinds, deliberately.** `event` frames are rows from the append-only `events` table. `log` frames are build-log lines, which are durable in `build_logs` and would flood `events` if written there — a two-minute build is hundreds of lines and §6's `Event` is an audit record, not a transport.

**Measured for this task** (M6): `@fastify/websocket@11.3.0` depends on `ws@8.21.3`, `duplexify` and `fastify-plugin@6`, and **nothing in that closure declares an install or postinstall script** — which matters because pnpm 11 makes an un-named dependency build script a hard error. `ws`'s native accelerators `bufferutil` and `utf-8-validate` are *optional* peer dependencies and pnpm does not install them. Its `wsHandler` signature, read from the package's own `types/index.d.ts`, is `(this: FastifyInstance, socket: WebSocket, request: FastifyRequest) => void | Promise<any>` — **the raw socket, not v8's `connection.socket`.**

- [ ] **Step 1: Install and write the failing bus tests**

```bash
pnpm --filter @manifest/control-plane add @fastify/websocket@11.3.0
pnpm --filter @manifest/control-plane add -D ws@8.21.3 @types/ws
```

```ts
/**
 * One well-formed frame. Defined once because six assertions below need one and
 * a spread of an undefined `rest` is the kind of sketch that reads fine and does
 * not run.
 */
const frame = (id: string, over: Partial<StreamFrame> = {}): StreamFrame => ({
  kind: 'event',
  id,
  projectId: 'p',
  subject: 'build:1',
  type: 'build.started',
  humanMessage: 'Building.',
  machineDetail: {},
  createdAt: new Date().toISOString(),
  ...over,
})

describe('the event bus', () => {
  it('delivers only to subscribers of that project', () => {
    // Tenant isolation at the transport, not only at the route. Two independent
    // reads of one rule is the shape the roadmap's lesson asks for, and the
    // route's own check is the other one.
    const bus = createEventBus()
    const a: string[] = []
    const b: string[] = []
    bus.subscribe('project-a', (f) => a.push(f.id))
    bus.subscribe('project-b', (f) => b.push(f.id))
    bus.publish(frame('1', { projectId: 'project-a' }))
    expect(a).toEqual(['1'])
    expect(b).toEqual([])
  })

  it('unsubscribes, and a thrown listener does not stop the others', () => {
    // One socket that dies mid-send must not take the fan-out with it. Without
    // this, a browser tab closing during a build stops the build's log reaching
    // every other viewer — and the symptom is "the stream randomly stops".
    const bus = createEventBus()
    const seen: string[] = []
    bus.subscribe('p', () => { throw new Error('socket gone') })
    const off = bus.subscribe('p', (f) => seen.push(f.id))
    expect(() => bus.publish(frame('1'))).not.toThrow()
    expect(seen).toEqual(['1'])
    off()
    bus.publish(frame('2'))
    expect(seen).toEqual(['1'])
  })
})
```

- [ ] **Step 2: Write the failing route tests**

These need a **real listening server**: `app.inject` cannot upgrade, which is the whole reason the HTTP half exists.

```ts
describe('WS /projects/:projectId/events', () => {
  it('answers 426 to a plain GET from an authorized actor', async () => {
    // What makes this route coverable by the authorization contract suite.
    const res = await app.inject({
      method: 'GET', url: `/projects/${projectId}/events`,
      cookies: testSessionCookie(owner, secret),
    })
    expect(res.statusCode).toBe(426)
    expect(res.json().error.code).toBe('EVENTS_UPGRADE_REQUIRED')
  })

  it('gives a stranger 404 before any socket exists', async () => {
    // Section 13: a stranger gets NOT_FOUND, never 403 — answering 403 confirms
    // the project exists and turns the id space into an enumeration oracle.
    const res = await app.inject({
      method: 'GET', url: `/projects/${projectId}/events`,
      cookies: testSessionCookie(stranger, secret),
    })
    expect(res.statusCode).toBe(404)
  })

  it('refuses the UPGRADE itself for a stranger, not only the GET', async () => {
    // The assertion that matters, and the one app.inject cannot make. A route
    // whose HTTP half is guarded and whose socket half is not is a route that
    // passes the whole contract suite and leaks every event.
    await app.listen({ port: 0, host: '127.0.0.1' })
    const url = `ws://127.0.0.1:${app.server.address().port}/projects/${projectId}/events`
    const socket = new WebSocket(url, { headers: { cookie: testSessionCookie(stranger, secret) } })
    const code = await new Promise((resolve) => {
      socket.on('unexpected-response', (_req, res) => resolve(res.statusCode))
      socket.on('close', (c) => resolve(c))
    })
    expect(code).toBe(404)
  })

  it('replays recent events, marks the boundary, then streams live', async () => {
    // A client that connects during a build must see what it missed. Without the
    // boundary frame it cannot tell a replayed failure from a new one, and
    // without the replay a two-minute build shows nothing until it ends.
    await recordEvent(db, { projectId, subject: 's', type: 'build.started', machineDetail: {}, humanMessage: 'Building.' }, (v) => v)
    const frames = await collectFrames(ownerSocket(), 3, () => {
      bus.publish(frame('2', { projectId, type: 'build.succeeded', humanMessage: 'Built.' }))
    })
    expect(frames.map((f) => f.type)).toEqual([
      'build.started', 'manifest.stream.ready', 'build.succeeded',
    ])
  })

  it('does not deliver an event from another project', async () => {
    const frames = await collectFrames(ownerSocket(), 1, () => {
      bus.publish(frame('a', { projectId: otherProjectId, type: 'build.succeeded' }))
      bus.publish(frame('b', { projectId, type: 'build.failed' }))
    })
    expect(frames.map((f) => f.projectId)).toEqual([projectId])
  })

  it('closes a socket that cannot keep up rather than growing without bound', async () => {
    // A stream with no backpressure is a memory leak with a URL. `ws` reports
    // bufferedAmount; past the cap the socket is closed with 1013 (Try Again
    // Later) and the client reconnects, which replays from the table.
    const socket = ownerSocket()
    socket.pause?.()
    for (let i = 0; i < 20_000; i++) {
      bus.publish({
        kind: 'log', id: String(i), projectId, buildId: 'b1',
        stream: 'stdout', text: 'x'.repeat(500), createdAt: new Date().toISOString(),
      })
    }
    await expect(closeCodeOf(socket)).resolves.toBe(1013)
  })
})
```

- [ ] **Step 3: Run them and watch them fail** — `pnpm test -- api/routes/events observability/bus`

- [ ] **Step 4: Implement the route**

```ts
await app.register(websocket)

app.get<{ Params: { projectId: string } }>(
  '/projects/:projectId/events',
  {
    websocket: true,
    // The HTTP half. It runs for a plain GET; wsHandler runs for an upgrade, and
    // BOTH go through this function's authorization because it is called first.
    handler: async (request, reply) => {
      await authorizeStream(deps, request)
      return reply.code(426).send({
        error: {
          code: 'EVENTS_UPGRADE_REQUIRED',
          message: 'this endpoint is a WebSocket stream',
          hint: 'Connect with a WebSocket client: ws(s)://<host>/projects/<id>/events. D23.2 — one stream per project, never polling.',
        },
      })
    },
    wsHandler: async (socket, request) => {
      // v11 hands over the RAW WebSocket. v8's `connection.socket` is gone, and
      // the difference is a runtime TypeError on `.socket.on` rather than a type
      // error, because the parameter is typed either way.
      let actor
      try {
        actor = await authorizeStream(deps, request)
      } catch {
        // The socket is already upgraded by the time this runs, so a refusal is
        // a CLOSE with a reason rather than a status. The plain-GET half above
        // is what gives a client a status, and what the contract suite reads.
        // 4404 is in the application range (4000-4999); 1008 would also do, but
        // an application code lets a client tell "you may not" from "I broke".
        socket.close(4404, 'not found')
        return
      }

      // SUBSCRIBE FIRST. See Step 4's note: the ordering is the correctness of
      // the whole thing.
      const buffered: StreamFrame[] = []
      let live = false
      const send = (f: StreamFrame) => {
        if (!live) { buffered.push(f); return }
        // A stream with no backpressure is a memory leak with a URL.
        if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
          socket.close(1013, 'too slow')   // Try Again Later; the client reconnects
          return
        }
        socket.send(JSON.stringify(f))
      }
      const unsubscribe = bus.subscribe(projectId, send)
      socket.on('close', unsubscribe)

      const recent = await recentFramesFor(deps.db, projectId, 50)
      const sent = new Set<string>()
      for (const f of recent) { sent.add(f.id); socket.send(JSON.stringify(f)) }
      socket.send(JSON.stringify({ kind: 'control', id: 'ready', projectId, type: 'manifest.stream.ready' }))
      live = true
      for (const f of buffered) if (!sent.has(f.id)) send(f)
    },
  },
)
```

**Subscribe first, then replay, then flush.** The ordering is the correctness of the whole thing: replaying before subscribing loses every event published in between, and subscribing after replaying duplicates the overlap. Subscribe into a buffer, read the last 50 rows from `events`, send them, send `manifest.stream.ready`, then flush the buffer skipping ids already sent.

- [ ] **Step 5: Cover it in the authorization contract suite**

```ts
  {
    method: 'GET',
    url: '/projects/:projectId/events',
    request: (f) => ({ url: `/projects/${f.projectId}/events` }),
    // `pass` means "not an authorization failure", and 426 is not one. The
    // suite's own helper asserts `< 400` for `pass`, so this needs the explicit
    // expectation rather than the default — a route that answered 200 here would
    // also pass, and 200 on an upgrade endpoint means the guard ran and the
    // stream did not.
    expect: { owner: 426, collaborator: 426, stranger: 404, admin: 426, anonymous: 401 },
  },
```

If `Expectation` has no numeric case for 426, widen the type here rather than weakening the row to `'pass'`.

- [ ] **Step 6: Run everything, twice** — `pnpm test && pnpm test && pnpm lint && pnpm --filter @manifest/control-plane typecheck && pnpm format:check`

- [ ] **Step 7: The negative controls**

```bash
# a) Delete the authorizeStream call from wsHandler and keep it in handler.
#    Expected: the "refuses the UPGRADE" test RED — a stranger receives every
#    frame while the whole authorization contract suite stays green. This is the
#    single most important control in the task; watch it.
# b) Replay before subscribing. Expected: the replay/boundary test flakes rather
#    than failing cleanly, which is the signature of the defect. Publish inside
#    the replay window to make it deterministic.
# c) Remove the bufferedAmount cap. Expected: the backpressure test hangs and
#    heap use climbs. Kill it after 30s.
# d) Publish build-log lines as `event` frames written to the `events` table.
#    Expected: a single fixture build writes hundreds of audit rows. Read the
#    table and count them.
```

- [ ] **Step 8: Commit** — `feat: one event stream per project, authorized before it upgrades`

---

## Task 15: The event call sites — and this is the task that makes the stream carry anything

**Files:**
- Modify: `packages/control-plane/src/releases/build.ts`, `release.ts`, `src/observability/incidents.ts`, `src/ai/keys.ts`
- Modify: `packages/control-plane/src/api/server.ts`, `src/index.ts`
- Test: `packages/control-plane/src/releases/releases.test.ts`, `src/runtime/docker/roundtrip.docker.test.ts`

**Interfaces:**
- Consumes: `recordEvent` (P4a), `createEventBus` (Task 14), `appendBuildLog` (Task 11).
- Produces: `EVENT_TYPES` extended with the seven types P4b writes, and a `publishEvent(db, bus, input, redactor)` helper that does **both** — records the durable row and publishes the frame.

**This task exists because of the roadmap's second lesson**, and it is deliberately small. P4a shipped `recordEvent` with two call sites; Task 14 shipped a stream with nothing publishing to it. **Its acceptance is a `grep`.**

**One helper, not two calls at each site.** A site that records without publishing is a silent stream; a site that publishes without recording is an event that vanishes on reconnect, because the replay reads the table. Writing them separately at seven call sites is seven chances to do one and not the other, and both failures are invisible in a passing test.

- [ ] **Step 1: Write the failing tests**

```ts
describe('what the stream carries', () => {
  it('emits build.started, build.succeeded and the log lines between them', async () => {
    const frames = collect(bus, projectId)
    const build = await startBuild(db, driver, input)
    expect(frames.filter((f) => f.kind === 'event').map((f) => f.type)).toEqual([
      'build.started', 'build.succeeded',
    ])
    expect(frames.some((f) => f.kind === 'log')).toBe(true)
    // Durable as well as streamed: a client that connects after the build must
    // still see what happened, and the replay reads the TABLE.
    const rows = await db.select().from(events).where(eq(events.projectId, projectId))
    expect(rows.map((r) => r.type)).toEqual(['build.started', 'build.succeeded'])
  })

  it('emits build.failed with a faculty-legible message, not an exit code', async () => {
    // Section 14's first bullet: "Your app couldn't start — it's asking for a
    // database it hasn't declared", not `exit code 1`. P3 measured the
    // alternative: the row said `failed` and nothing else.
    const build = await startBuild(db, failingDriver('npm ci exited 1'), input)
    const [row] = await db.select().from(events).where(eq(events.type, 'build.failed'))
    expect(row.humanMessage).toMatch(/could not be built/i)
    expect(row.humanMessage).not.toMatch(/exit code|ELIFECYCLE|stack/i)
  })

  it('emits instance.healthy and instance.failed, and incident.opened with the failure', async () => {
    await deployRelease(db, driver, config, deps, input)
    expect(typesFor(projectId)).toContain('instance.healthy')
    const failed = await deployRelease(db, brokenDriver, config, deps, input).catch(() => null)
    expect(typesFor(projectId)).toEqual(expect.arrayContaining(['instance.failed', 'incident.opened']))
  })

  it('emits ai.key_rotated without the key', async () => {
    // An audit record of a credential change is worth having; the credential is
    // not. Asserted on the whole row, because a key in machine_detail is exactly
    // as leaked as one in human_message.
    await rotateAppKey(db, client, keys, args)
    const [row] = await db.select().from(events).where(eq(events.type, 'ai.key_rotated'))
    expect(JSON.stringify(row)).not.toMatch(/sk-/)
  })

  it('never publishes a frame it did not record', async () => {
    // The property the single helper exists to guarantee. Asserted by counting
    // rather than by reading the source, so a future direct bus.publish is caught.
    const frames = collect(bus, projectId)
    await runTheWholeLifecycle()
    const rows = await db.select().from(events).where(eq(events.projectId, projectId))
    expect(frames.filter((f) => f.kind === 'event')).toHaveLength(rows.length)
  })
})
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm test -- releases observability`

- [ ] **Step 3: The seven types, as a closed set**

```ts
export const EVENT_TYPES = [
  'sso.registered',      // P4a
  'sso.acs_changed',     // P4a
  'build.started',
  'build.succeeded',
  'build.failed',
  'instance.healthy',
  'instance.failed',
  'incident.opened',
  'ai.key_rotated',
] as const
```

**Closed, and a database `CHECK` enforces it** — the same two independent reads P4a used for the IdP's attribute list. A free-text type is a stream a client cannot switch on.

- [ ] **Step 4: The grep that is this task's real acceptance**

```bash
grep -rn 'publishEvent\|recordEvent' packages/control-plane/src --include='*.ts' \
  | grep -v '\.test\.ts' | grep -v '/observability/'
```

Expected: `sso/registration.ts` (P4a's two), `releases/build.ts` (three), `releases/release.ts` (two), `observability/incidents.ts` (one) and `ai/keys.ts` (one). **Nine lines. Fewer means a type in the closed set has no writer**, which is the defect this project has hit three times.

```bash
grep -rn 'bus.publish' packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts'
```

Expected: `observability/events.ts` (inside `publishEvent`) and the build-log path **only**. A third site is an event that vanishes on reconnect.

- [ ] **Step 5: Run everything** — `pnpm test && pnpm test && make up && pnpm test:docker`

- [ ] **Step 6: The negative controls**

```bash
# a) Replace one publishEvent with a bare recordEvent. Expected: the counting
#    test RED. Then watch a build from a connected client: the row is written
#    and the client sees nothing until it reconnects.
# b) Put the LiteLLM key into ai.key_rotated's machine_detail. Expected: the
#    key test RED — and note that the redactor does NOT save you here, because
#    the key was minted this instant and is not yet in the app's secret set at
#    the moment the event is written. Ordering matters; putSecret runs first.
# c) Set build.failed's human_message to the raw error. Expected: the legibility
#    test RED with a stack trace in a faculty-facing field.
```

- [ ] **Step 7: Commit** — `feat: builds, deploys, incidents and key rotations reach the stream`

---

## Task 16: The proof app answers a question — P4b's acceptance

**Files:**
- Modify: `fixtures/proof-app/server.js`, `manifest.yaml`, `package.json`, `package-lock.json`, `public/index.html`
- Create: `scripts/demo-ai.sh`
- Modify: `Makefile`, `scripts/offline-acceptance.sh`, `docs/superpowers/RUNBOOK.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `make demo-ai`, and §16's proof app **complete** — CWL sign-in, a per-user note, an LLM answer.

**Roadmap gap 6, finished.** P4a built the login and Mongo halves and left the AI half a stub that says so. This replaces the stub. The proof app is the one that goes to UBC on the external track, *"which is a good reason for it to be honest rather than minimal"* — its `manifest.yaml` is the first real input to P8's IAM registration package and PIA draft, and it now has to declare a data classification a reviewer will read against the models it uses.

**This task fires the external-track trigger, and that is Rich's to act on, not this plan's.** ORIENTATION §8: the C4 conversation with UBC IAM starts *"once the local proof of concept works end to end"*, and the trigger the decision names is the **full** proof app — CWL login, a Mongo write, an LLM answer. Step 8 raises it. **Do not start the external track; say that the trigger has fired.**

- [ ] **Step 1: Declare the AI half**

`fixtures/proof-app/manifest.yaml`:

```yaml
ai:
  models: [default-chat, default-embed]
  budget:
    # Declared, and non-zero: a zero budget refuses every request and Task 7
    # makes that a validation error rather than a runtime surprise.
    project_monthly_usd: 10
    # Declared because section 7 has the field and a reviewer will ask. NOT
    # enforced by this version of the platform — see "What this plan does not
    # build": LiteLLM 1.98.0 has no per-key or proxy-level end-user budget, and
    # customer rows auto-create with no budget at request time.
    per_user_monthly_usd: 1

data:
  # `internal` and not `confidential`, deliberately, and the PIA draft will say
  # why: the app stores a note a person wrote about themselves, keyed on a hash
  # of their CWL PUID. `default-chat` is approved to `internal` (D17), so a
  # confidential declaration would REFUSE it at validation — which is the gate
  # working, and worth seeing once in the negative controls below.
  classification: internal
  retention_days: 365
```

- [ ] **Step 2: Replace the stub**

`server.js` gains one route, and it uses the blueprint's component rather than the toolkit directly — which is the §20 argument in practice, and what the knowledge pack tells an agent to do:

```js
// The AI half. It imports the BLUEPRINT's component, not the toolkit: that is
// where `encoding_format: 'float'` and the namespaced end-user id live, and
// section 20's "the blueprint is a security multiplier" is only true while apps
// actually use it.
import { ask, endUserId } from './ai/llm.js'

app.post('/ask', requireSignIn, async (req, res) => {
  // The PUID comes from the SESSION, never from the request body. An app that
  // takes an end-user identifier from its own client lets one student spend
  // another's allowance, and the identifier is also the budget key (section 10).
  const answer = await ask(req.body.question, req.user.ubcEduCwlPuid)
  res.json({ answer, attributedTo: endUserId(req.user.ubcEduCwlPuid).slice(0, 8) })
})
```

- [ ] **Step 3: Write `scripts/demo-ai.sh`**

A **thin wrapper**, like `demo.sh` and `demo-identity.sh`: the logic under test lives in the Docker-tier suites, and a demo that reimplements any of it drifts into proving something else. It drives the real HTTP API with `curl` and a cookie jar:

1. log in to Manifest with the real SAML flow
2. create the project, push the proof app, validate the manifest at that commit
3. build, release, deploy to staging — **watching `WS /projects/:id/events`** with a background subscriber, so the stream is exercised by the demo rather than only by a test
4. sign in to the deployed app as `student`, through the edge, over TLS with the platform CA
5. `POST /ask` and assert a **non-empty answer string**
6. assert the spend row: `GET /spend/logs?user_id=…` shows the request attributed to `sha256(puid ‖ project ‖ environment)` and **not** to a bare PUID hash
7. assert the event stream captured `build.started` … `instance.healthy`

**Step 5 asserts the shape of the answer** (Decision 14). S3 ran six checks, all green, and one returned 192 numbers where 768 belonged. An empty string from a streamed completion is the same class of pass.

- [ ] **Step 4: Run it and watch it fail**

Run: `make up && make demo-ai`

Expected: FAIL somewhere. **Record where.** A first end-to-end run has never yet passed in this project, and the two times it did not, it turned out that no build and then no deploy had ever succeeded.

- [ ] **Step 5: Make it pass, then run it again from nothing**

```bash
make reset && make up && make demo-identity && make demo-ai
```

The second run is what proves nothing depended on state the first run happened to leave. **`make reset` must not leave a LiteLLM user or key behind** — check, because a user row surviving a reset carries last month's spend into a fresh platform and the budget test then passes for the wrong reason:

```bash
curl -s -H "Authorization: Bearer $LITELLM_MASTER_KEY" 'http://127.0.0.1:7106/user/list' | grep -c mf-
```

If it is non-zero after a reset, add the revocation to `make reset` in this task — it is the same shape as the app networks that survived a cleanup reporting success.

- [ ] **Step 6: Offline**

Disabling Wi-Fi cuts the agent off too, so this is Rich's to run. `scripts/offline-acceptance.sh` exists for exactly that, and this task adds `make demo-ai` to it. **Ask before assuming it passed.** The interesting question offline is whether Ollama answers, since it is a host application and not a container.

- [ ] **Step 7: The negative controls, and they are the acceptance**

```bash
# a) Remove `ai.models` from the proof app's manifest and redeploy.
#    Expected: /ask fails at startup with "LLM_API_KEY is required and was not
#    injected", NOT at the first question. The refusal is the point.
# b) Set data.classification: confidential and revalidate.
#    Expected: SPEC_MODEL_CLASSIFICATION_TOO_LOW naming default-chat, at
#    validation. That is D17 working and it is the whole reason Task 6 fails
#    closed on a missing max_classification.
# c) Take the PUID from the request body instead of the session, and ask as one
#    student while naming another. Expected: the spend row is attributed to the
#    named student. Watch it, then put it back.
# d) Point LLM_ENDPOINT at the control plane's loopback URL.
#    Expected: /ask returns a connection error from inside the app's own
#    `--internal` network — the two-URLs-that-are-not-interchangeable failure,
#    in the form it would actually arrive in.
# e) Detach manifest-litellm from the app network mid-run.
#    Expected: /ask fails and the platform reports AI_BACKEND_UNAVAILABLE with a
#    faculty-legible sentence, not a stack trace.
```

- [ ] **Step 8: Update every document that states status, and raise the trigger**

The close-out list is in ORIENTATION §6 and **the sweep is the step that gets forgotten**: the roadmap ledger **first** (it outranks the rest), then ORIENTATION §2 and §7, `README.md`, `CLAUDE.md`, `RUNBOOK.md`, and the four HTML pages that are shared outside the team — `manifest-schematic.html`, `manifest-phases.html`, `manifest-decisions.html` and `manifest-stories.html`. Re-run `scripts/snapshot-machine.sh` and add a new dated baseline; **do not edit the old ones.**

Then, in one sentence to Rich and nowhere else: **the trigger named in ORIENTATION §8 has fired** — the local proof of concept runs end to end, CWL login through to an LLM answer, so the C4 external track can start when he chooses. `docs/external-track.md` carries the five items. **Do not start it.**

- [ ] **Step 9: Commit**

```bash
git add fixtures/proof-app scripts/demo-ai.sh Makefile docs/
git commit -m "feat: the proof app answers a question, attributed to one person

Section 16's proof app, complete: CWL sign-in, a per-user note, and an LLM
answer through a key confined to three routes.

The acceptance is not that an answer arrived — S3 ran six checks, all green,
and one returned 192 numbers where 768 belonged. It is that the answer is a
non-empty string from a streamed completion, and that the spend row is
attributed to sha256(puid, project, environment) rather than to a bare PUID
hash, which is what stops one app's exhausted budget locking a student out of
every other Manifest app."
```

---
## What executing this plan found

*Empty until it runs.* Task 1 Step 4 writes the reconciliation record here first — one line per P4a divergence, in the form *"P4a's X is actually Y; Task N edited."* **An empty reconciliation list is a valid answer and is itself worth recording**: it would be the first time in this project a plan reconciled clean.

Then one section per sitting, in P3's format: the tasks executed, the defects found with the measurement that found each, and the gate numbers at the end. The measured rate across P1, P2 and P3 is 1.4 → 2.7 → 4.3 defects per task and it never fell with practice.

---

## What this plan does not build

Everything below is named because the spec asks for it and silence would read as an oversight. Each says where it stops and why.

**Three things §10 specifies that Phase 1 cannot enforce.**

- **The per-user budget.** `ai.budget.per_user_monthly_usd` is validated against the project quota and **not enforced**, and the reason is measured (M10): LiteLLM 1.98.0 has no per-key or proxy-level default end-user budget — `max_end_user_budget`, `end_user_budget` and `default_internal_user_params` are all absent from its OpenAPI document — and end-user rows auto-create with no budget. Applying one needs an explicit `/customer/new` naming `sha256(puid ‖ project ‖ environment)`, a string that exists only at request time inside the app, whose key is confined to three routes and correctly 403s on `/customer/new`, and which §12 forbids from reaching the control plane. The only mechanism that fits is **lazy registration driven by spend logs**, which is a reconciler, and §11's reconciliation loop is Phase 4 (D10). **What P4b does ship is the part that prevents the actual harm S3 found**: the namespaced end-user identifier, so one app's exhausted allowance can never lock a student out of another. Spec action raised.
- **Agent keys and their `duration` TTL.** §10's middle row and S3 Evidence 10's *"set both"*. **Nothing mints an agent key before Phase 3**, because an `AgentSession` has nothing to attach to until sandboxes exist (§15 says so directly). `ai/keys.ts` therefore has no TTL path: a `duration` parameter with no caller would be the fourth instance of the defect this project has hit three times, and S3 has already measured that the mechanism works — `duration: "70s"` gives 200 immediately and 401 after 71 s. Phase 3 supplies the caller.
- **"Revoked on archive."** There is no archive operation in Phase 1 — nothing destroys an environment through the API — so `rotateAppKey` revoking the key it replaces is the whole of the lifecycle that has a caller. A `revokeAppKey` sitting unused is the same defect as above.

**Four things §14 asks for that stop deliberately short.**

- **Crash-loop detection.** §14's `Incident` covers *"a crash loop or failed health check"*. P4b writes an Incident for a deploy that never reached healthy, which is the moment `deployRelease` actually observes (Decision 13). Detecting a container that starts, dies and restarts needs something watching over time — §11's reconciliation loop, Phase 4 (D10). Building a poller here would be a second scheduler for the reconciler to replace.
- **Live tailing of a running application's logs.** `Driver.logs(id, { follow: true })` exists and nothing calls it with `follow`. D23.2's list for the stream is *"build logs, instance state transitions, incidents and approval decisions"*, and application stdout is not on it. **§14's phrase "build and deploy logs" and D23.2's list do not obviously agree**, so this is raised as a spec action rather than resolved by choosing one.
- **Approval decisions on the stream.** The fourth item in D23.2's list. Approvals are P6's, and `POST /projects/:projectId/spec` keeps computing `isSensitiveDiff` and enforcing nothing exactly as P3 left it. **P4b must not grow a half-gate there.**
- **Per-app metrics** — §14's *"request count, error rate, p95 latency, memory, AI spend"*. AI spend is now *reachable*, through `/spend/logs?user_id=`, and nothing surfaces it: there is no route, no aggregation and no place to put it until P5's contract exists. The other four need a metrics path nothing in Phase 1 has.

**Two limits inside what is built, stated so nobody mistakes them for coverage.**

- **The two budget rows of the error table are asserted from recorded bodies, not provoked.** Task 4's Docker tier provokes route-denial, unknown-model and revoked-key against the running proxy; reaching a budget needs S3's synthetic-cost setup and a stream of requests. Both strings are S3's, measured, and Task 2's digest pin is what keeps them meaningful.
- **The event bus is in-process.** One control-plane process serves the platform today, so a `Map` of listeners is the whole implementation. A second process would need Postgres `LISTEN`/`NOTIFY`, and the seam is `createEventBus()` — one function, one file. Nothing else changes.

**P5's**, unchanged: the generated OpenAPI document, `manifest-mock`, the versioned client, `console/` with its import boundary, delegated tokens and `PendingAction` (D24), the knowledge pack API (D25), and the read-only `LaunchReadiness` view.

**P6's**, unchanged: the `LaunchReadiness` **gate**, sensitive-diff escalation, approvals with step-up re-auth, `IamRegistration` and `PrivacyAssessment` as tracked objects, gate integrity.

**Still open from P4a**, and P4b does not close them: secret rotation as an *operation* (`rewrapSecret` exists; no route, no restart), and **D20's 90-day certificate alert** (`expiresAt` is recorded; nothing evaluates it, because there is no scheduler until Phase 4).

**Not this plan either:** the second-machine clean clone (still untested — `RUNBOOK.md`'s *Known gaps*), the `node:22-alpine` → 24 decision (Rich's, ORIENTATION §8), and an apk mirror (raised 2026-09-06, undecided).

---

## What the self-review caught

Run after the plan was complete, reading the spec and the running platform with fresh eyes. Recorded so the next reader does not mistake a deliberate fix for a mistake.

1. **The toolkit's API was written from memory and two of three names were wrong.** There is no `streamMessage` — it is `streamConversation(messages, callback, options)` — and `embed()` resolves to an `EmbeddingResponse` (`{ embeddings, model, usage }`), not to a bare array. Read off `ubc-genai-toolkit-llm`'s own `dist/*.d.ts` and fixed in Tasks 3 and 10. This is the failure mode S3 warned about one level up: the plan would have compiled in the reader's head and failed at step 4.
2. **`@fastify/websocket`'s handler signature was verified rather than assumed.** v11 passes the **raw `WebSocket`** — `(this, socket, request)` — and v8's `connection.socket` is gone. The difference is a runtime `TypeError` rather than a type error, because the parameter is typed either way.
3. **Task 3 called `engineFor(driver)`, which exists nowhere.** The `Driver` interface deliberately exposes no engine. Replaced with `createEngineClient({ socketPath: resolveSocketPath() })`, which that file already imports.
4. **Task 3 asserted a blueprint pin that Task 10 introduces** — a test that cannot pass at its own step 4. Narrowed to the control plane's own devDependency, with the blueprint half added in Task 10 where the pin lands.
5. **The bound key service's signature disagreed with its call site.** `createAiKeyService(client, keys)` cannot store a secret without a `db`, and `db` may be a transaction, so it stays a per-call argument: `rotateAppKey(db, input)`. This is the class P4a's own self-review found three times.
6. **`revokeAppKey` had no caller**, and the plan's own Global Constraints forbid exactly that. §10's *"revoked on archive"* has no archive operation in Phase 1, so the function was removed and the gap named rather than shipped as a fourth uncalled module.
7. **Task 4's test read a module-private `MESSAGES` table.** Rewritten to build errors through the constructor, so the tables stay private and the assertion is on behaviour.
8. **Task 14 used `StreamFrame` and `authorizeStream` in five code blocks without defining either.** Both are now defined once, at the top of the task — and writing `authorizeStream` as a shared function is itself the fix for the defect its own negative control (a) describes.
9. **Task 1's checklist assumed a host `psql`.** This machine may not have one; changed to `docker exec manifest-postgres psql`.
10. **A zero AI budget would deploy healthy and refuse every request.** `ai.budget.project_monthly_usd` **defaults to 0** in §7's schema, and a LiteLLM user with `max_budget: 0` refuses everything — so an app that declared a model would come up green and 429 on its first question, telling a faculty member their budget was exhausted before they had used any. Added `SPEC_AI_BUDGET_REQUIRED` to Task 7, at validation.
11. **A conditionally attached LiteLLM would have made app networks undeletable.** `destroyAppNetwork` disconnects the containers in `PLATFORM_NEIGHBOURS` and then deletes the network; a neighbour outside that list is still attached, and `docker network rm` fails while any container is. ORIENTATION §4 records what that looks like: *"five app networks survived a cleanup that reported success."* Task 8 now reads the network back and disconnects what is actually there.
12. **`ai.budget.per_user_monthly_usd` cannot be implemented at this LiteLLM version**, found by reading LiteLLM 1.98.0's own OpenAPI document rather than S3's prose. It changed Task 16's manifest, added a paragraph to *What this plan does not build*, and raised a spec action. This is the finding the measurement pass exists for.
13. **The LiteLLM image is a moving tag and nothing pins it**, while §16 requires the error mapping be pinned to a version. It became Task 2, and it is the reason Task 2 is second rather than last.
14. **§14 and D23.2 do not agree about what streams.** §14 says *"build and deploy logs stream over WebSocket"*; D23.2 lists *"build logs, instance state transitions, incidents and approval decisions"*. P4b implements D23.2's list and raises the disagreement rather than choosing quietly.

---

## Spec actions proposed by this plan

**Not applied.** The spec is approved design and changing it is Rich's call; this is the record, in the same form the spikes, P3 and P4a used.

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| §10, the **End user** row | *"`ai.budget.per_user_monthly_usd`"* as the budget source | Add: **this is not enforceable at LiteLLM 1.98.0 and is validated rather than applied in Phase 1.** End-user (customer) rows auto-create with no budget; `/customer/new` requires the end-user id in advance; and `max_end_user_budget` does not exist in the admin API (measured 2026-09-07 against the running proxy's own OpenAPI document). Applying it needs lazy customer registration driven by spend logs — a reconciler, and therefore Phase 4 (D10). The **namespacing** rule in the same section is what prevents S3's cross-app lockout and is enforced from Phase 1. | §10 reads as though the field binds. It does not, and the gap is invisible: an app declares a per-user allowance, the platform accepts it, and no student is ever limited. Naming it next to the row is the difference between a known limit and a silent one. |
| §21, *Platform inventory*, the LiteLLM row | the image, unversioned | Record that LiteLLM is deployed **by digest**, recorded in `infra/images.lock`, and that `ghcr.io/berriai/litellm:main-stable` is a moving tag. | §16 pins the AI error mapping *"to the LiteLLM version in §21's inventory"*, and the inventory named no version while the deployment named a moving tag. Measured 2026-09-07: the running container happened to be exactly S3's digest, by luck rather than by configuration, and a `make seed` on a second machine would not have been. |
| §14, *Observability*, second bullet | *"Build and deploy logs stream over WebSocket to the front-end."* | Align with D23.2's list: the stream carries **build logs, instance state transitions, incidents and approval decisions**. Live tailing of a *running application's* stdout is a separate capability and is not v1. | The two sentences describe different features and an implementer has to pick one. D23.2 is the more specific and is the one the API is designed around; §14's phrasing implies application log tailing, which nothing in Phase 1 provides and which has its own privacy surface (§14's own redaction argument applies to it hardest). |
| §10, the **Agent key** row | *"dies with the sandbox — and carries a `duration` TTL"* | Note that this row binds from **Phase 3**: an `AgentSession` has nothing to attach to before sandboxes exist (§15), so no agent key is minted in Phase 1 and the TTL is a Phase 3 obligation rather than a Phase 1 gap. | Otherwise the row reads as unimplemented in every Phase 1 review, and the alternative — shipping a TTL parameter with no caller — is the defect the roadmap's second lesson names. |
| §7, *Classification gates model routing (D17)* | describes the catalogue's `max_classification` | Add the measured mechanics: the catalogue is read from **`/model/info` with the master key**, `max_classification` round-trips verbatim from `config.yaml`, and a **chat** model is identified by `mode !== 'embedding'` — LiteLLM 1.98.0 returns `mode: null` for chat entries, not `"chat"`. `/v1/models`, the only model route an app key may call, carries neither field. | D17 is the check that turns a privacy incident into a build-time message, and it depends entirely on where the classification is read from. The `mode: null` detail is the one that silently produces an *empty* catalogue, which fails every spec with a message blaming the faculty member. |
| §7, `ai.budget.project_monthly_usd` | defaults to 0 | Note that a declared `ai.models` with a zero project budget is **refused at validation**: LiteLLM refuses every request against a `max_budget` of 0, so the app would deploy healthy and fail its first question. | The schema default and the gateway's behaviour combine into a failure that looks like an exhausted budget on day one. Cheap to state, and the alternative is a support ticket that reads as a platform fault. |

**And one thing deliberately NOT proposed.** Attaching `manifest-litellm` to an app network only when the app declares `ai.models` looks like it needs a §12 change and does not: §12's east-west list already reads *"app or sandbox → LiteLLM's admin **routes**. **Not a port rule.**"*, and a conditional attachment is **stronger** than that text, not weaker — an app with no declaration has no route to the gateway at all. P4a raised the unconditional form and reached the same conclusion for the same reason. It does change what S6 measured, which is why Task 8 re-runs that tier in full rather than assuming it still holds.
