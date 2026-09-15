# P4b — AI, Events, Streaming and Incidents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The proof app asks a question and gets an answer — through a virtual key the control plane minted for that app and environment, confined to three routes, charged to a budget, with the student identified by a hash that cannot lock them out of any other Manifest app — and when something breaks, a faculty member sees a sentence rather than a stack trace, streamed live.

**Architecture:** Four seams, in dependency order. **`ai/`** is the LiteLLM admin client: one place that mints keys, and `allowed_routes` is a constant in it rather than a parameter. **The catalogue** (D17) stops being a hardcoded array in a route handler and becomes a read of `/model/info`, which is the only surface carrying `max_classification`. **`observability/` grows up** — P4a shipped the `events` table, the append-only grant, the exact-match redactor and two call sites; P4b adds build-log capture, the heuristic half of redaction, §14's `Incident`, and `WS /projects/:projectId/events`, which authorizes *before* it upgrades so that §16's authorization contract suite can cover it like any other route. On top sits the blueprint's AI component and the proof app's second half.

**Tech Stack:** TypeScript on Node 24, Fastify 5.12.3 with `@fastify/websocket` 11.3.0 (`ws` 8.21.3), Drizzle over Postgres 16, Vitest, LiteLLM **1.98.0** pinned by digest, `ubc-genai-toolkit-llm` 0.7.0 over the `openai` SDK 4.x, Ollama on the host, and the same custom Caddy 2.11.4 edge P1 built.

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md) — **§10** (AI access) and **§14** (observability, incidents, redaction at capture) in full, plus §6 (the `Event`, `Incident` and `AgentSession` rows), §7's D17 classification gate, §8's AI rows, §12 (east-west isolation, egress), §16 (the AI-path regression, security-regression and authorization tiers), §20 (audit integrity, machine-actionable errors), §22 (D23.2 — one event stream per project, never polling) and §25 (blueprints).

**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — P4's scope, and gaps 2 and 6.

**Predecessor:** [`2026-09-07-p4a-identity-secrets-injection.md`](./2026-09-07-p4a-identity-secrets-injection.md). Its *What this plan does not build* section is P4b's brief and this plan is written from it. Read P3's *Sessions 4 and 5* as well; between them they establish that no build and then no deploy in this platform had ever succeeded, both invisible behind a fully green test suite.

---

## How this plan is to be executed — TEN SITTINGS, one per session

**SITTINGS 1 TO 7 ARE COMPLETE. SITTING 8 — TASK 13, §14's `Incident` — IS NEXT: Docker-tier work, and no network.** Sitting 7 (Tasks 11–12, 2026-09-14) produced **16 findings**: a build's output reaches `audit.build_logs` line by line while it runs, redacted, and redaction has its heuristic half — and **migration 0005 applied without its grant**, because a `$(ls …)` captured an aliased listing, and was replayed from the file as it ships. Two of its 27 negative controls came out green, and each forced a test that goes red. **Its Docker tier ended 130 of 131: a Mongo service is reported ready before it accepts the app's credentials (finding 133), measured and not fixed — settle it before Task 13.** **It wrote a note at the top of Task 13 — read it first.** Sitting 6 (Task 10, 2026-09-14) produced **14 findings**: `node-ts-mongo@1` provides AI, its component is proved on the wire against the real toolkit, and **seed's npm warm turned out to be inert on any machine whose npm cache already held a package** — fixed in `infra/seed/seed.sh`, and caught only by `make verify`. It wrote one note at the top of Task 11, and **a pre-flight read the same evening wrote eighteen corrections at the tops of Tasks 11 and 12 — Task 12 as printed fails two of its own tests and would redact every image digest in a build log.** Sitting 5 (Tasks 8–9, 2026-09-14) produced **11 findings**, built Rich's key decision and both §7 decisions, and made the decision its hand-off named — a release that declares models, deployed with AI switched off, is refused with `RELEASE_AI_DISABLED`. It wrote four corrections at the top of Task 10, all resolved in sitting 6, and one at the top of Task 15, which is still to be read before Task 15. Before it, a pre-flight read of Tasks 8 and 9 wrote **fifteen corrections and a note** at their tops, all resolved. **Rich then decided, the same day, that no live AI call may fail because a deploy revoked its key, and that redeploys must become zero-downtime for the whole app in a plan of their own** — the interim Task 9 builds is the *DECIDED* block at the top of Task 9. **He also settled two §7 spec actions that change Task 6's and Task 7's committed code** — the *SPEC DECISIONS* block, also at the top of Task 9. Sitting 4 (Tasks 6–7, 2026-09-14) produced **12 findings** and made the decision its hand-off named — AI is on unless `MANIFEST_AI_ENABLED=0`, and on means a boot with no LiteLLM master key is refused; read its entry in *What executing this plan found* before Task 9, which inherits that decision and the two bound services it has to wire. Sitting 1 (Tasks 1–2,
2026-09-09) produced 10 findings; a restore session on 2026-09-14 fixed §12's scan and wrote
five corrections into Task 3; sitting 2 (Task 3, 2026-09-14) resolved those five and produced
six more — **one of them a correction to Task 7's own code**; sitting 3 (Tasks 4–5, 2026-09-14)
produced eleven — **a second correction to Task 7, which as written throws on every redeploy of
an AI app, and one to Task 9**; and a pre-flight read of Tasks 6 and 7 the same day wrote eight
more at the top of those tasks. Read *What executing this plan found* before starting it: Task 1's reconciliation corrected two migrations that would have
failed on their first statement, and Task 2 pinned LiteLLM to the version S3 measured
**hours after upstream moved the tag**.

Agreed with Rich on 2026-09-09, after the same pattern carried P4a's last twelve tasks
through seven sittings without a session limit ever landing mid-task. One sitting per
session, with a check-in at each boundary. This plan commits after every task, so a
stop *between* tasks is recoverable; a stop *inside* one is not. **"Sitting", not
"phase"** — this project uses *Phase 1/2/4+* for the §17 product roadmap, and confusing
the two sends a reader to the wrong document.

**Ten rather than eight**, which is what sixteen tasks at P4a's average would give.
Three tasks are deliberately alone, and each has a reason that is not its size:

| Sitting | Tasks | What it delivers | Status |
|---|---|---|---|
| 1 ✅ | 1–2 | The reconciliation pass against the executed P4a (**six divergences**), then LiteLLM pinned by digest with S3's error table re-measured against the pinned version. **Nothing ships and everything depends on both.** Task 1's size is unbounded by design — P3's equivalent found eight defects — so it is paired only with the other task that has no dependencies | ✅ **done 2026-09-09, 10 findings** |
| 2 ✅ | 3 | §16's AI-path regression tier, **before any `ai/` module exists**. **Alone**: it is the largest task in the plan and it builds `mintProbeKey`/`deleteProbeKey`, the harness every later sitting is measured against. A tier written after the module tests the module's own assumptions | ✅ **done 2026-09-14, 6 findings** — plus the 5 pre-flight corrections, all resolved |
| 3 ✅ | 4–5 | `ai/errors.ts`, then `ai/client.ts` — S3's error table as one mapper, then the transport that uses it. 5 consumes 4 and nothing else does yet | ✅ **done 2026-09-14, 11 findings** — the 3 pre-flight corrections resolved, and corrections written into **Tasks 7 and 9** |
| 4 ✅ | 6–7 | `ai/catalogue.ts` and `ai/keys.ts` — D17's catalogue read from `/model/info`, and the one place that mints a key with `allowed_routes` as a constant. Siblings: both consume Task 5's client and neither consumes the other | ✅ **done 2026-09-14, 12 findings** — the pre-flight's 8 corrections resolved, and the boot decision (38) made: `MANIFEST_AI_ENABLED` |
| 5 ✅ | 8–9 | LiteLLM joins an app network, then §8's AI rows render. **This is the sitting where Tasks 6, 7 and 8 get a caller** — the plan says so in Task 9's own title. *A module with no call site is not built*: P3 built `waitForReady` and `edgeProbe` in its Task 14 and nothing called them until Task 17, and P4a hit the same shape with `ServiceBinding.credentials` | ✅ **done 2026-09-14, 11 findings** — the pre-flight's 15 corrections resolved; Rich's key decision and both §7 decisions built; Task 9 committed in four parts; and the AI-off decision made: `RELEASE_AI_DISABLED` |
| 6 ✅ | 10 | `node-ts-mongo@1` grows its AI half — `provides.ai: true`, `ubc-genai-toolkit-llm` pinned, `ask`/`askStreaming`/`embed`/`endUserId`. **Alone, and it is the one sitting that NEEDS THE NETWORK ON**: it adds a dependency, regenerates the lockfile and needs `make seed` to warm Verdaccio from it. P4a's sitting 5 was alone for exactly this reason. Step 6 checks Verdaccio's storage rather than `npm ci`'s exit code, because a build against the public registry looks identical to a correct one | ✅ **done 2026-09-14, 14 findings** — the 4 corrections resolved, the fourth itself wrong; the mirror warmed through a fixed seed step, `make verify` 47/0 at 245 tarballs |
| 7 ✅ | 11–12 | Build logs captured, streamed line by line and stored — and then the heuristic half of redaction, which is what has to cover them. Paired because the logs are the thing redaction exists to protect, and building either alone invites proving it against the other's absence | ✅ **done 2026-09-14, 16 findings** — the pre-flight's 18 corrections resolved; a migration that applied without its grant, replayed; 27 negative controls, two of which forced a new test |
| **8 ← next** | **13** | §14's `Incident` — the failure shaped as a repair prompt. **Alone**: it consumes Task 12's redactor plus `Driver.logs` and `Driver.status`, and it can only be proved against containers that have really failed, which is slow Docker-tier work | **No network needed. A note from sitting 7 is at the top of Task 13 — read it first; hand-off in ORIENTATION §7d-2** |
| 9 | 14–15 | `WS /projects/:projectId/events`, then the call sites that make it carry anything. **Never split these.** Task 15's own title is *"the task that makes the stream carry anything"* — a stream with no publisher is the call-site defect again, and it would sit green for a whole session | |
| 10 | 16 | P4b's acceptance: the proof app answers a question, and §16's proof app is complete. **Alone, for the reason P4a's Task 15 was alone** — the first end-to-end run is where this project's worst defects have always been. P4a's passed at the first attempt and still produced eight defects, every one of them from refusing to believe it. **It also fires the external-track trigger, which is Rich's to act on** | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. the four gates from *Global Constraints*, plus `pnpm test:docker` where the sitting
   touched `infra/`, `runtime/`, `services/`, `sso/`, `secrets/`, `observability/`,
   `ai/` or `blueprints/`;
2. a dated entry in *What executing this plan found* below — the tasks, every defect
   with the measurement that found it, the negative controls, and the gate numbers;
3. **the sittings table above, updated** — mark the sitting done, move the `← next`
   marker, and record how many findings it produced. This is the line that tells the
   next agent which task to start, and it is wrong the moment a sitting ends;
4. **the close-out sweep in ORIENTATION §6**, which is a checklist of every document
   that states status — the ledger first, and note that the four gate numbers are
   stated in four separate documents and have to move together.

**The next sitting is a different agent with an empty window.** Everything here is
written to be trusted, so a sitting that ends unswept does not produce a confused
agent — it produces a confident one working from a false premise. **Budget session
capacity for the sweep**, and if it is tight, stop a task early and sweep rather than
finishing the task and leaving the documents lying. **Run `pnpm test`
twice** — a suite that is not repeatable has a state leak — and run the acceptance
scripts twice too, which is a P4a Task 15 lesson: `make demo-identity` passed on its
first run and failed on its second.

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Task 1 may move task boundaries — that is
its job — and if it does, re-cut the sittings before starting sitting 2 and say so in
the session record. The one rule that survives any re-cut: **Task 16 stays alone, and
Tasks 14 and 15 stay together.**

### What sitting 1 must reconcile that this plan could not know

P4b was written on 2026-09-07. **P4a's Task 15 ran on 2026-09-09 and changed four
things this plan names**, so they are listed here rather than left for Tasks 10 and 16
to discover:

1. **`fixtures/proof-app/package.json` and `package-lock.json` DO NOT EXIST.** Task 16's
   *Files* block modifies both. The proof app deliberately carries no dependency
   manifest of its own: `scripts/demo-identity.sh` copies `node-ts-mongo@1`'s skeleton
   first and lays the app over it, so the pinned set stays the blueprint's single copy.
   Adding `ubc-genai-toolkit-llm` is therefore a **blueprint** change (Task 10), and
   Task 16 must not reintroduce a second copy of §12's pinned list.
2. **`endUserId` already exists, in `fixtures/proof-app/identity.js`.** Task 10 puts
   `endUserId` in `skeleton/ai/llm.js`. Those are two producers of one string unless
   Task 16 makes the proof app import the blueprint's — and
   `packages/control-plane/src/blueprints/proof-app-identity.test.ts` pins the formula
   from the platform side. **`sha256(puid + ' ' + MANIFEST_PROJECT_SLUG + ' ' + MANIFEST_ENV)`,
   space-separated, in that order.** P4b passes it through; it does not recompute it.
3. **The three-hop CWL login is one function, `idp_login` in `infra/lib/idp-login.sh`.**
   `scripts/demo-ai.sh` must source it, not carry a second copy of the walk —
   `demo.sh` and `demo-identity.sh` both source it already. Note what
   it does *not* do: it discards the ACS response, so it proves the SP row and the
   signature and **not** that a session authenticates anybody — the caller's identity
   check is the assertion. A control that stopped at `idp_login` came out falsely green
   (P4a defect 77).
4. **`scripts/offline-acceptance.sh` already has a step 6** that runs
   `make demo-identity`. Task 16 adds `make demo-ai`; it must **append** rather than
   replace, and `RUNBOOK.md` already documents `make demo-identity` beside `make demo`.
   *(P4a defect 70 was a second `trap` that replaced the first and unregistered a file
   four lines after registering it. The same shape.)*

One more, not from Task 15 but worth carrying into sitting 1: **every redeploy leaves
the previous release's container running** — eleven deploys produced eleven healthy
containers. Reaping is Phase 4's, and P4b redeploys a lot. `RUNBOOK.md`'s *Known gaps*
has the workaround.

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
| **`audit.events`** — its own SCHEMA, granted `SELECT, INSERT` to **`manifest_app`**. There is no `manifest_audit_owner` role and no `REVOKE` | `docker exec manifest-postgres psql -U manifest -d manifest_control -c '\dp audit.events'` — **not a host `psql`**, which this machine may not have, and **not `\dp events`**, which searches `public`, finds nothing and reads as "the table is missing" | Tasks 11, 13, 15 — **all three were wrong and are now corrected** |
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

- [ ] **Step 3: Verify the three places P4a WAS ambiguous, which were fixed in P4a on 2026-09-07**

All three were found while writing this plan and settled in P4a itself rather than
left for its executor — which is what ORIENTATION means by *"self-contained by
construction; if it is not, that is a defect in the plan, so fix it there."* **Read
the code and confirm the executor kept them**, because a task may have moved one:

1. ~~**`InjectionContext` is fully typed**, including `spec: ManifestSpec` and `resolved: ResolvedConfig`.~~ **CORRECTED 2026-09-09: `InjectionContext` HAS NO `spec` FIELD.** Its eight fields are `resolved`, `environmentKind`, `hostname`, `projectSlug`, `idp`, `spEntity?`, `secrets`, `services`. P4a went further than Decision 6 anticipated: rather than adding `resolved.ai` *beside* a `spec`, it removed the `spec` entirely, because §13 freezes the config at release time and reading `app_specs.parsed` back out is a second source of truth — the defect shape P3 paid for seven times (P4a Session 6, defect 48). **Task 9's code is already right** — it reads `resolved.ai` throughout — so this corrects the prose, not the task.
2. ~~**`parsedSpec` is the release's own AppSpec row**, loaded in `deployRelease` via `release.appSpecId`.~~ **CORRECTED 2026-09-09: `deployRelease` NEVER LOADS THE AppSpec ROW.** `appSpecs` is not queried anywhere in `releases/release.ts`; `appSpecId` is written when a Release is created and never read back. Same root cause as item 1 — the renderer reads only the frozen config. **A P4b task that adds a `parsedSpec` load would be reintroducing the second producer P4a deleted.**
3. **`recordEvent`'s redactor is a parameter** — confirmed: `recordEvent(db: Db, input: EventInput, redact: Redactor)`. **One correction to the line below it:** `secretValuesFor` returns `Promise<Map<string, string>>` and `makeRedactor` takes `Iterable<string>`, so the call is `makeRedactor((await secretValuesFor(db, { projectId, environmentKind }, keys)).values())` — **`.values()` is not optional.** A `Map` is iterable, but it yields `[key, value]` pairs, so omitting it builds a redactor over arrays rather than secrets. `sso/registration.ts:97` is the working call site to copy. **Task 15's `publishEvent` keeps it a parameter** — a bound redactor is a `recordEvent` that can write an unredacted row when the binding is wrong.

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

**PRE-FLIGHT, 2026-09-14 — five things this task's text gets wrong, found by reading the repo before sitting 2.** **All five were resolved in sitting 2 (2026-09-14)** — see *What executing this plan found*. Sitting 1 reconciled P4b against P4a; this task's seams are P3's and the test harness's, and nothing had checked them. Fix each as you reach it and record it in *What executing this plan found*:

1. **`LITELLM_MASTER_KEY` does not reach a test process.** `packages/control-plane/vitest.env.ts` derives only the three database URLs from `.env`, so Step 1's `process.env.LITELLM_MASTER_KEY ?? ''` is an empty bearer and `beforeAll` dies on `/user/new -> 401`. Loud, not silent. **Derive it in `vitest.env.ts`** beside the database URLs, so one file reads `.env` for tests rather than a second reader in `ai/testing.ts`. Watch `secrets/scrub.ts`: it deletes that name from `process.env` at boot, so a test that boots the server in the same worker removes it.
2. **`s6.docker.test.ts` imports neither `createEngineClient` nor `attachPlatformNeighbours`.** Self-review item 3 says the first is already imported; it is not — the file imports only `resolveSocketPath` from `./engine.js`. Both exist, in `runtime/docker/engine.ts` and `runtime/docker/networks.ts`, and `attachPlatformNeighbours(engine, network, names)` matches Step 2's call.
3. **Probe 14 leaks a LiteLLM key on every run.** The unconfined key mints `orphan-<timestamp>` to prove the escalation, `-o /dev/null` discards the response, and Step 3 deletes only the two probe keys. Clean it up in `afterAll`, or the tier accumulates live keys under `p4b-probe-user` — and negative control (a) mints more.
4. **`ubc-genai-toolkit-llm` is in no lockfile anywhere.** Step 5's `pnpm add` resolves from public npm (there is no `.npmrc`), so the network must be on for that step.
5. **Probe 13's comment says Task 7 attaches the neighbour; it is Task 8.**

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

**EXECUTED 2026-09-14, sitting 3. The code below is the plan's original, kept as the record.** The committed `ai/errors.ts` has two guards this text lacks — a `detail` body is a route denial only on a **403**, and a 400 is an unknown model only when its `type` is `"None"` — and Step 4 provokes **four** rows, one of them with the master key, because an app key never sees `AI_MODEL_UNKNOWN`. *What executing this plan found*, sitting 3, has the measurements.

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

**PRE-FLIGHT, 2026-09-14 — three things this task's text gets wrong, found by reading the repo after sitting 2.** **All three were resolved in sitting 3 (2026-09-14)** — see *What executing this plan found*. The code below is the plan's original; the committed client also refuses a non-JSON *success* body without quoting it, and `loadConfig` treats an empty key as absent. Task 5 was written before sitting 2 put a LiteLLM master key into the test harness, and its *Files* block touches `.env.example` and `vitest.env.ts` without knowing what they now hold. Fix each as you reach it and record it in *What executing this plan found*:

1. **The boot scrub would leave the new secret in the environment.** `secrets/scrub.ts`'s `SECRET_ENV_NAMES` lists `LITELLM_MASTER_KEY` but not `MANIFEST_LITELLM_MASTER_KEY`, and this task never mentions the scrub — so the control plane would boot with the master key still in `process.env`, where every child process it spawns (`git` in `build/context.ts` among them) inherits it. Add the name to `SECRET_ENV_NAMES` and to the list `scrub.test.ts` asserts, whose own comment warns about exactly this.
2. **Adding the key to `.env.example` turns `make doctor` red on every existing machine.** `check_env_file` fails when `.env` lacks any key `.env.example` declares, and `make seed` never rewrites an existing `.env` — so this machine's `.env` would be missing it the moment the task lands.
3. **It would store one secret under two names.** LiteLLM reads `LITELLM_MASTER_KEY` from `.env` (`infra/compose.yaml`), and sitting 2's `ensureLitellmMasterKey()` in `vitest.env.ts` already derives that for the AI-path tier. A second stored copy drifts from the first the first time either is changed.

**Recommended for 2 and 3 together: follow `MANIFEST_DATABASE_URL`'s pattern.** `.env.example` stores each raw secret once, and the control plane's `MANIFEST_`-named setting is *derived* from it where it is used — README's export block builds `MANIFEST_DATABASE_URL` from `MANIFEST_APP_PASSWORD`, and `vitest.env.ts` does the same for the suite. So keep `MANIFEST_LITELLM_MASTER_KEY` in `config.ts` as written, **do not add it to `.env.example`**, add `export MANIFEST_LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}"` beside README's database export, and have `ensureLitellmMasterKey()` set it from the same `.env` value. One stored secret, a second name only at the point of use, and doctor stays green. If you choose otherwise, record why.

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

**EXECUTED 2026-09-14, sitting 4 (commit `d7a729f`). The text below is the plan's original, kept as the record.** What the committed code does that this text does not: the catalogue is awaited **before** project creation writes anything (finding 45); a disabled catalogue exists and a spec declaring models under it is refused with `SPEC_AI_DISABLED` (decision 38); `AiError` and `CatalogueError` leave the API as **503** (finding 51); the unit tier's catalogue is `declaredCatalogue()`, read from `infra/litellm/config.yaml` through the real projection (37). Controls (b) and (c) cannot produce their stated results as worded — findings 49 and 47.

**PRE-FLIGHT, 2026-09-14 — five things this task's text gets wrong and one it leaves unsaid, found by reading it against the repo after sitting 3.** Numbered as in *What executing this plan found* (*Before sitting 4*). Fix each as you reach it and record it there:

- **35. Step 1's `clientReturning` fake does not typecheck.** Measured with a scratch file and `tsc`: `TS2345 … The types returned by 'get(...)' are incompatible … Type 'unknown' is not assignable to type 'T'`, because `LiteLlmClient.get` is generic. Vitest strips types, so the tests pass and `pnpm --filter @manifest/control-plane typecheck` fails. Cast it — `as unknown as LiteLlmClient` — as the cache test already does with `as never`.
- **36. Step 5's Docker snippet uses `LITELLM`, `MASTER`, `parseYaml`, `REPO_ROOT` and `join`, and `ai-path.docker.test.ts` defines none of them** — the third time (findings 20, 27). Use `litellmUrl()` and `litellmMasterKey()` from `./testing.js`, `parse` from `yaml`, and `REPO_ROOT` from `../runtime/testing.js`.
- **37. `ServerDeps.catalogue` has no producer in `api/testing.ts`**, which is not in the *Files* block — and every API test builds its server with `testDeps`. It needs a catalogue there. **Mind Step 4's acceptance grep**: it excludes `\.test\.ts` only, so a fixture array naming `default-chat-onprem` in `api/testing.ts` makes the grep report a second producer. Either keep the fixture in a `*.test.ts` file or exclude `testing.ts` too, and say which.
- **38. This task, not Task 9, is the first to build the LiteLLM client at BOOT** — Step 4 builds the catalogue in `src/index.ts` "from the client". `createLiteLlmClient` throws `AiConfigError` on an empty key, and `boot.docker.test.ts` and `identity/saml.docker.test.ts` both spawn `dist/index.js` with `MANIFEST_ENV: 'development'` and **no `MANIFEST_LITELLM_MASTER_KEY`** (checked). As written, both Docker tests die at boot. **Decide and record** what a development boot without the key does — `MANIFEST_AI_ENABLED` exists for this and has no reader yet — keeping two things true: a disabled catalogue must not call `loadModelCatalogue` (which refuses an empty result), and a spec declaring `ai.models` must still be refused with a code that names the cause rather than blaming the faculty member. Task 9's correction then inherits the choice.
- **39. `validationContext` has two call sites** — `api/routes/projects.ts` lines 112 and 230 (project creation and `POST …/spec`). Both must `await` once it is async.
- **40. Not a defect — the import this task leaves unsaid.** `Classification` **is** exported from `spec/index.ts` — import it from there, never from `spec/schema.ts`; the §5 boundary test fails the build on the deep path.

`pnpm test -- ai/catalogue` does not filter (finding 34): use `pnpm exec vitest run --project unit src/ai/catalogue`.

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

**EXECUTED 2026-09-14, sitting 4. The text below is the plan's original, kept as the record.** All five corrections above are in the committed code. What it does beyond them: `rotateAppKey` **refuses an empty model list**, which LiteLLM reads as every model (finding 48); the key is stored as **`app:llmApiKey`**, P4a's namespace, not `LLM_API_KEY` (53); the ordering test reads the secret store at the moment of the revoke, because Step 1's version cannot see the ordering it is named for (52); and `ai/keys.docker.test.ts` rotates against the running gateway, because the three measured rules this module rests on are invisible to a fake (54).

**Files:**
- Create: `packages/control-plane/src/ai/keys.ts`, `keys.test.ts`
- Modify: `packages/control-plane/src/ai/index.ts`, `src/spec/policy.ts`, `src/spec/policy.test.ts`

**CORRECTION FROM SITTING 2 (2026-09-14) — `/user/new` mints a key unless told not to.** LiteLLM 1.98.0's `NewUserRequest.auto_create_key` **defaults to `true`** (its own `/openapi.json`), and measured: `/user/new` for `p4b-probe-user` answered with a key whose `allowed_routes` was `[]` and `models` `[]` — unconfined, every model. `ensureAiUser` below posts `{ user_id: userId, ...budget }`, so as written **every app's LiteLLM user would hold an unconfined key beside the confined one this task mints** — the §12 escalation `allowed_routes` exists to close, created by the call that sets up the budget. Pass `auto_create_key: false`, and assert in `keys.test.ts` that the `/user/new` body carries it. `ai/testing.ts`'s `ensureProbeUser` already does.

**SECOND CORRECTION, FROM SITTING 3 (2026-09-14) — `ensureAiUser` cannot see "already exists", so every redeploy throws.** Step 3 catches the duplicate with `/already exists/i.test(String(error))`. Task 5's client turns every non-2xx into an `AiError` built from a code and the status and nothing else — that is its whole point (§14) — so `String(error)` is `AiError: The AI service refused this request for a reason the platform does not recognise.` and the test never matches: **the first deploy of an AI app creates the LiteLLM user and every later deploy throws.** Measured against LiteLLM 1.98.0: a duplicate `/user/new` answers **409** with `type: internal_server_error`, and `AiError.status` carries it (`errors.test.ts` asserts that the status of an unmapped failure survives). Catch on `error instanceof AiError && error.status === 409`. **Add the test this task's list does not have:** `fakeClient` returns `{}` for `/user/new` and never rejects, which is exactly why the defect is invisible to it — give one case a client whose `/user/new` rejects with `mapLiteLlmError(409, …)` and assert that `/user/update` follows.

**PRE-FLIGHT, 2026-09-14 — three more things this task's text gets wrong, found by reading it against the repo after sitting 3.** Numbered as in *What executing this plan found* (*Before sitting 4*):

- **41. The tests use `withRollback(async (db, { projectId, keys }) => …)`, and `withRollback` passes ONE argument** — `fn: (tx: Db) => Promise<void>` in `db/testing.ts`. Five of the six tests would throw destructuring `undefined` before asserting anything. The fixture that supplies `projectId` and `keys` is **`withSecretScope`** in `secrets/testing.ts` (`tx, { projectId, ownerId, keys, masterSecret }`), which ORIENTATION §7d already names for anything secret-scoped.
- **42. The zero-budget test is written inside `keys.test.ts`** with `checkPolicy`, `specWith` and `ctx`, none of which that file imports or defines — and the `30d` test uses `readFileSync` without importing it. The budget check lives in `spec/policy.ts`; put its test in **`spec/policy.test.ts`**, which already has `ctx`, `yaml()` and `errorCodes()`.
- **43. Revoking a key LiteLLM no longer holds is a 404, and `rotateAppKey` would fail the deploy on it.** Measured against LiteLLM 1.98.0: `POST /key/delete {"keys":["sk-…-does-not-exist"]}` → `404 {"error":{"message":"{'error': 'No keys found'}","type":"internal_server_error",…}}`. `rotateAppKey` mints and stores the new key and then revokes the stored previous one, so anything that loses a key LiteLLM held while `secrets` still names it — a LiteLLM database reset, a manual delete — fails that deploy after a live key has already been minted and stored. Treat `error instanceof AiError && error.status === 404` on the revoke as already revoked, and add the test: a fake client whose `/key/delete` rejects with `mapLiteLlmError(404, …)`, and the rotation still returns the new key.

**Two seams landed exactly as this task assumes:** `SecretScope` is `{ projectId, environmentKind, name }`, matching Step 3's `putSecret` call, and `spec/schema.ts` defaults `ai.budget.project_monthly_usd` and `per_user_monthly_usd` to `0`, which is what the zero-budget check exists for.

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

**PRE-FLIGHT, 2026-09-14 — seven things this task's text gets wrong, found by reading it against the repo after sitting 4.** Numbered as in *What executing this plan found* (*Before sitting 5*). Fix each as you reach it and record it there:

- **56. Step 1's test names the network `mf-chem-labs-staging`; `appNetwork()` names it `mf-chem-labs-staging-net`** (`runtime/docker/names.ts`). As written the first assertion fails, and the destroy test's `toEqual([])` passes on a network nothing ever attached to. Use `appNetwork(slug, kind)`. **`networks.test.ts` does not exist, and nothing in the unit tier fakes an `EngineClient`**: the local `fakeEngine` must answer `GET /networks/{name}` with a `Containers` map of `{ Name }`, because `attachPlatformNeighbours` reads the network back and throws `PLATFORM_NEIGHBOUR_NOT_ATTACHED` when it does not.
- **57. A required `InstanceSpec.needsAiGateway` breaks eight construction sites, and the *Files* block names three.** Keep it required — an optional flag that defaults to "no gateway" fails silently for exactly the apps that need one — and add it at `releases/release.ts` (the one production site), `runtime/driver-contract.ts`'s `spec()`, `sso/testing.ts`, and the Docker tests `driver`, `roundtrip`, `node-ts-mongo`, `instances` and `s6`. `tsc` finds them; Vitest does not.
- **58. Step 4's contract-suite assertion cannot be written.** The `Driver` interface exposes no network and the fake driver has none, so a suite shared by both cannot observe whether the flag was honoured. The contract suite's `spec()` states `needsAiGateway: false`, and the assertion goes in the Docker tier: `ensureInstance` with `true` puts `manifest-litellm` in the network's read-back, and with `false` does not.
- **59. Probe 13's positive control attaches `manifest-litellm` by hand** — `attachPlatformNeighbours(engine, APP_NET, ['manifest-litellm'])` in `s6.docker.test.ts` — so it never exercises `ensureInstance`, and **negative control (c), "have ensureInstance always pass []", cannot turn it red**. Replace the hand attach with the probe's own instance re-ensured with `needsAiGateway: true` — `ensureInstance` is idempotent by name, so the pairing stays the same request from the same container — and (c) becomes live. The `afterAll` disconnect stays.
- **60. Control (a) says to `make down` the litellm container, and `make down` stops the whole platform.** Use `docker stop manifest-litellm`. The refusal it expects is real — measured on a throwaway network and a created-but-never-started container: the connect succeeds and the network's read-back does not list the container — but **the stopped container keeps the connection and joins that app network when it starts.** Disconnect it before `docker start manifest-litellm`.
- **61. Control (b) cannot happen as worded: `make reset` does not call `destroyAppNetwork`.** The Makefile's `reset` loops every `mf-` network and disconnects whatever `docker network inspect` lists — which is already "whatever is attached". `destroyAppNetwork` **has no production caller at all**: its callers are three Docker tests (`services`, `instances`, `egress`), none of which attaches LiteLLM. The fix is still right and cheap; its control is a Docker test that attaches an extra neighbour and then calls `destroyAppNetwork`.
- **62. Step 5's `pnpm test:docker -- s6` runs the whole tier** (finding 34's shape). The one-file run is `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/runtime/docker/s6`. Read every test's output rather than counting to 14 — the file numbers its probes with lettered pairs (5b, 7b, 10b) between them.

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

**READ THE FIVE BLOCKS BELOW IN ORDER, AND WHERE THEY DISAGREE THE LATER ONE WINS (2026-09-14).** Rich's *DECIDED* block replaces `rotateAppKey` with `mintAppKey`, `commitAppKey` and `discardAppKey`. So wherever an earlier block, the *Interfaces* list or the plan's original steps say `rotateAppKey`, read those three: mint before `ensureInstance`, commit after health passes, discard on failure. Sitting 4's empty-models refusal moves with `mintAppKey`. The fifth block, *SPEC DECISIONS*, changes Task 6's catalogue and Task 7's budget check to match §7 as amended.

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

**CORRECTION FROM SITTING 3 (2026-09-14) — `createLiteLlmClient(config.litellm)` does not typecheck.** Task 5 fixed both shapes: `config.litellm` is `{ url, internalUrl, masterKey?, enabled }`, and `createLiteLlmClient` takes `{ baseUrl, masterKey: string, timeoutMs? }` and **throws `AiConfigError` at construction when the key is empty**. So Step 4 must map the fields — `createLiteLlmClient({ baseUrl: config.litellm.url, masterKey: config.litellm.masterKey ?? '' })` — and it must decide what a development boot with no key does, because as written that line throws at boot. `loadConfig` already refuses a missing key outside development; README's export block supplies it for a developer; `MANIFEST_AI_ENABLED=0` is the obvious condition for not building the client at all. **Task 6 meets this first** — its Step 4 builds the catalogue in `src/index.ts` from the client, so the choice is made there (pre-flight 38) and this task inherits it. **Whichever was chosen, check the Docker tests that construct a development config with no key** — `boot.docker.test.ts`, `identity/saml.docker.test.ts` and `releases/deploy-sso.docker.test.ts`. `MANIFEST_LITELLM_MASTER_KEY` is deliberately **not** in `.env.example` (sitting 3).

**CORRECTION FROM SITTING 4 (2026-09-14) — half of Step 4's wiring already exists, and `rotateAppKey` refuses what LiteLLM reads as every model.** Five things this task's text does not know:

- **`ServerDeps.catalogue`, and its construction in `src/index.ts`, already exist** (Task 6). So does the client: `src/index.ts` builds `litellm` — `createLiteLlmClient({ baseUrl: config.litellm.url, masterKey: config.litellm.masterKey ?? '' })` when `MANIFEST_AI_ENABLED=1`, and `undefined` when it is `0` (decision 38, in *What executing this plan found*, sitting 4). Step 4 adds only `ai`, from `createAiKeyService(litellm, masterKeypair)`. **Do not build a second client.**
- **`deps.catalogue.get()` rejects when AI is off** — a disabled catalogue refuses to be read rather than answering `[]`. Step 4's `await deps.catalogue.get()` must read `deps.catalogue.enabled` first.
- **Decide, and record: a release that declares models, redeployed with AI switched off.** Validation now refuses such a spec with `SPEC_AI_DISABLED`, but a release validated before the switch still exists and can be redeployed, and there is no client for `deps.ai` to use. It must fail with a code that names the setting — not a `TypeError` on `undefined`, and never a `renderInjection` with no key.
- **`rotateAppKey` throws on an empty `models` list** (finding 48: LiteLLM reads `models: []` on a key as every model). Step 4's `if (resolved.ai.models.length > 0)` is therefore load-bearing rather than an optimisation — keep the mint inside it, and keep the *mints nothing when the app declares no models* test.
- **`api/testing.ts` needs an `ai` producer**, and the unit tier has no LiteLLM: a stub that throws, as `sso`'s does, is the house pattern. And **`ModelEntry.kind` has had no reader until this task** (finding 46) — Step 4's `declared.find((m) => m.kind === 'chat')` is its first, so the test that proves `kind` is one that deploys a chat-and-embedding app and reads the injected `LLM_DEFAULT_MODEL` and `EMBEDDINGS_MODEL` back.

**PRE-FLIGHT, 2026-09-14 — eight more things this task's text gets wrong, and a note, found by reading it against the repo after sitting 4.** Numbered as in *What executing this plan found* (*Before sitting 5*). Sitting 4's correction above still stands:

- **63. `ResolvedConfig.ai` already exists** — P4a Task 10 added it as `ManifestSpec['ai']`, carried through unchanged: `{ models, budget: { project_monthly_usd, per_user_monthly_usd } }`. This task's *Produces* renames the budget to camelCase and its `resolveConfig` test expects camelCase, while §13 freezes resolved configs as JSON — so renaming breaks every release frozen since. **`resolve.ts` needs no change.** Assert the existing shape, and read `resolved.ai.budget.project_monthly_usd` in Step 4.
- **64. A release frozen before P4a Task 10 has no `ai` key at all**, and Step 4's `resolved.ai.models.length` is a `TypeError` on its redeploy. `renderInjection` already reads `resolved.ai?.models ?? []` for exactly this reason; Step 4 must too.
- **65. `InjectionVariable.when` is a closed union** — `'auth.provider=cwl' | 'services.mongo' | 'services.qdrant' | 'ai.models'` — so Step 3's `'ai.models.chat'` and `'ai.models.embedding'` fail `tsc`. Extend it. `spec/injection-drift.test.ts` does not read `when` (checked).
- **66. Two existing tests assert `INJECTION_AI_UNSUPPORTED`** — *refuses to render an AI row, naming P4b* and *is an InjectionError, with a code that survives a message edit*, in `spec/injection.test.ts` — and both go red when Step 3 deletes it. Rewrite them for `INJECTION_AI_KEY_MISSING`; do not delete them. **`aiContext()` and `baseContext()` do not exist**: that file's helpers are `ctx({ spec })` and `withModels([...])`. And `{ ...aiContext(), ai: undefined }` is a type error under `exactOptionalPropertyTypes` — omit the key by destructuring.
- **67. `createFakeDriver({ onEnsureInstance })` does not exist** — `FakeDriverOptions` is `{ failInstances?, capabilities? }`. `releases.test.ts` already records the spec by wrapping the driver: `const recording: Driver = { ...driver, ensureInstance: (spec) => { seen.push(spec); return driver.ensureInstance(spec) } }`.
- **68. `deployRelease` is handed `DeployDeps`, never `ServerDeps`, and the deploy route builds it by hand** — `api/routes/delivery.ts` passes `{ secrets, appSecrets, sso, blueprints }`. Step 4's "`ServerDeps` gains `ai`" alone never reaches `deployRelease`. `DeployDeps` gains `ai` and `catalogue`, and all three places that build one pass them: the route, `releases.test.ts`'s `deployDeps` fixture, and `releases/deploy-sso.docker.test.ts`. Neither `delivery.ts` nor `deploy-sso` is in the *Files* block.
- **69. No app that declares models can reach a deploy through the build route before Task 10.** `checkBlueprintCompatibility`, called only from the build route in `api/routes/delivery.ts`, refuses `ai.models` with `BLUEPRINT_AI_UNSUPPORTED`, and `fixture-node` and `node-ts-mongo` both declare `provides.ai: false`. `startBuild` does not check, so `releases.test.ts` can build one at the unit tier. **`roundtrip.docker.test.ts` can prove only the no-AI path in this task**; the injected key end to end is Task 16's. Record that, rather than let a Docker test that never deploys an AI app read as coverage.
- **70. Both of Step 5's greps are wrong before this task starts.** The first already finds `api/routes/projects.ts` (`catalogue.get()`, Task 6), and after Task 8 it finds `needsAiGateway` in `runtime/` — so a non-empty result proves nothing. Read the file the criterion names: `grep -n 'mintAppKey\|commitAppKey\|discardAppKey\|catalogue\.\(enabled\|get\)\|needsAiGateway' packages/control-plane/src/releases/release.ts` is **empty today** and must show every name — the three key calls are the *DECIDED* block's split of `rotateAppKey`. The second already matches `ai/keys.ts` (`LLM_API_KEY_SECRET` contains `LLM_API_KEY`), so "`spec/injection.ts` only" is false today. Match whole words — `grep -rnw 'LLM_ENDPOINT\|LLM_API_KEY\|LLM_DEFAULT_MODEL' packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts'` — which today finds `spec/injection.ts` and one comment at `config.ts:191`; after this task every line that is not a comment must still be in `spec/injection.ts`.
- **71. DECIDED 2026-09-14 by Rich: not acceptable.** As written, `rotateAppKey` mints, stores and revokes in one call before `ensureInstance`, so the live app's AI calls fail from the revoke until the edge route moves. What replaces it is the block below.

**DECIDED 2026-09-14 (Rich) — no live AI call may fail because a deploy revoked its key; and redeploys are to become zero-downtime for the whole app, in a plan of their own, later.** What this task builds meanwhile, approved as written here:

- **Split Task 7's `rotateAppKey` into three.** `mintAppKey(client, input)` ensures the user and mints a confined key, and stores and revokes nothing — the empty-models refusal moves with it. `commitAppKey(db, client, keys, { projectId, kind, key })` stores the key as `app:llmApiKey` and then revokes the previous one, keeping the 404 tolerance. `discardAppKey(client, key)` revokes a minted key that was never committed. `createAiKeyService` binds all three, and `rotateAppKey` goes, so there is one path. Task 7's tests move with them: the store-before-revoke test becomes a `commitAppKey` test, and `ai/keys.docker.test.ts` mints, commits and discards against the gateway.
- **`deployRelease` commits only after the instance is healthy.** Mint before `ensureInstance`, because the container needs the key in its environment. Commit after `waitForHealth` passes. If the instance fails — `ensureInstance` throws, or health does not pass — discard the new key: the stored key is then still the old one, and the old container still holds a valid key. A discard that itself fails must not mask the deploy's failure; record it and rethrow the original.
- **Why after health is enough for now.** Measured 2026-09-14 on LiteLLM 1.98.0: a key is checked when a request STARTS — a streaming completion whose key was deleted 7 s in finished normally, 961 of its 1,003 characters after the delete, while a new request with that key answered 401. By the time health passes, `DockerDriver.ensureInstance` has already moved the edge route to the new container and reached it through the edge. What is left is a request that reached the OLD container before the route moved and only starts its AI call after health passes. **Named, not closed:** the zero-downtime plan's drain closes it.
- **`ensureInstance` replaces a container whose spec changed** (finding 72). The Docker driver reuses a container by name and changes nothing about it, environment included — so a redeploy of the SAME release, such as a retry after a failed health check, would commit a key the reused container never received and revoke the one it holds. The driver writes a hash of the container's environment as a label at create: the same name with the same hash reuses (the wake path), and a different hash replaces. A hash of an environment carrying a key is safe as a label; the environment itself is not. **The fake driver already replaces the spec on reuse** (`existing.spec = spec`), so the two drivers disagree today and nothing tests it (finding 73). The contract suite cannot observe an environment, so the check is a Docker-tier test: re-ensure one name with a changed environment and read it back from inside the container.
- **Sitting 5 now carries more than its table says** — Task 8, Task 9's original scope, the key split and the driver change. If that will not fit one session, say so at the check-in and re-cut, rather than end inside a task. The table is a schedule, not a contract.

**SPEC DECISIONS 2026-09-14 (Rich) — §7 now says two things Tasks 6 and 7 do not do, and this task is where they are built.** The spec was amended the same day: §7's *Logical model names*, *Validation* and *Classification gates model routing (D17)*.

- **An unclassified model is refused on its own, not with the whole catalogue.** Task 6's `loadModelCatalogue` throws `AI_CATALOGUE_UNCLASSIFIED` at the first entry with no valid `max_classification`, which makes every validation on the platform a 503 (finding 50). Instead it returns the classified entries **and the names of the unclassified ones**; `ValidationContext` carries both; and `checkPolicy` refuses a declared model on that list with a new code, `SPEC_MODEL_UNCLASSIFIED`, at `ai.models.N`, whose hint names the platform's configuration and an administrator rather than the manifest. `AI_CATALOGUE_UNCLASSIFIED` is deleted; `AI_CATALOGUE_EMPTY` stays, for a gateway that returns no rows at all. At deploy, a declared model that has become unclassified since validation is a `ReleaseError` with its own code, beside Step 4's `RELEASE_MODEL_NOT_IN_CATALOGUE`. Task 6's refusal tests become exclusion tests, and its Docker negative control (b) now expects `SPEC_MODEL_UNCLASSIFIED` for an app that declares `default-chat` and a normal validation for one that does not.
- **Read the catalogue only for a spec that declares models.** *Sitting 4's call, recorded so it can be overruled:* §7 now promises that an app declaring no model validates and deploys as normal, and today `modelPolicy()` awaits the catalogue for every validation — so a gateway outage still refuses every project creation, and so does an empty catalogue. Parse first; read the catalogue only when `ai.models` is non-empty.
- **An omitted project budget is defaulted, not refused.** When `ai.models` is non-empty and `ai.budget.project_monthly_usd` is **omitted**, validation sets it to the project's `quota.ai_monthly_usd`, and the stored spec — so every release frozen from it — carries that number. An **explicit** `0` is still refused, with `SPEC_AI_BUDGET_REQUIRED`'s message saying so; *that reading of Rich's choice is sitting 4's, flagged to him.* It needs omission to be visible: `spec/schema.ts` gives `project_monthly_usd` a `.default(0)`, so an omitted budget and a written `0` parse identically today. Drop that default, fill the value in `validateSpec` — which already has `ctx.quota.aiMonthlyUsd` — and keep the quota check reading the filled value. `per_user_monthly_usd` is unchanged; it is not enforced (M10). Task 7's policy tests move with it: *refuses declared models with the schema default of a zero project budget* becomes a test that the quota is filled in, and the AI-switched-off case no longer expects the budget code for an omitted budget.
- **Nothing tells the faculty member that a default was applied**, in Phase 1. The stored spec and `GET /projects/:id/spec` show the number; P5's contract is where a validation notice belongs. Named, not built.
- **This makes sitting 5 heavier again.** Say so at the check-in and re-cut if it will not fit.

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

**CORRECTIONS FROM SITTING 5 (2026-09-14) — four things this task's text does not know, because Task 9 has now run.** Read them before Step 1:

- **`LLM_DEFAULT_MODEL` is ABSENT, not empty, for an app that declares no chat model** — §8's "if declared", as `renderInjection` now renders it (and `EMBEDDINGS_PROVIDER`/`EMBEDDINGS_MODEL` are absent for an app with no embedding model). Step 4's `defaultModel: required('LLM_DEFAULT_MODEL')` therefore throws at startup for an embeddings-only app. Read it conditionally, exactly as the step already reads `EMBEDDINGS_MODEL`, and have `ask`/`askStreaming` refuse clearly when there is no chat model.
- **Step 7's `fullContext()` needs an `ai` block, not only models.** `renderInjection` now refuses a context that declares models and supplies no key (`INJECTION_AI_KEY_MISSING`), and refuses one that names a model the release did not declare (`INJECTION_AI_MODEL_UNDECLARED`). Give it `ai: { endpoint, apiKey, defaultChatModel, embeddingModel }` with names from its own `ai.models` — `spec/injection.test.ts`'s `aiCtx` is the shape.
- **Step 5's budget line is out of date with §7 as amended (2026-09-14).** An OMITTED `ai.budget.project_monthly_usd` is now filled with the project's AI quota at validation; only a budget WRITTEN as 0 is refused. The knowledge pack should say that — "declare a budget, or leave it out to use the project's quota; never write 0" — not "always declare it".
- **Step 6's `pnpm test:docker -- roundtrip` runs the whole tier** (finding 34). The one-file run is `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/runtime/docker/roundtrip`. And note what it can prove: `roundtrip.docker.test.ts` builds its `InstanceSpec` by hand with `needsAiGateway: false` and no key, so it proves the BUILD with the toolkit in the lockfile, not an AI call — that is Task 16's.

**RESOLVED IN SITTING 6 (2026-09-14) — all four, and the fourth was itself wrong.** `roundtrip.docker.test.ts` builds `fixture-node@1` and never touches this blueprint; the test that builds `node-ts-mongo@1`'s skeleton through §12's gates is `src/runtime/docker/node-ts-mongo.docker.test.ts` (finding 87). Step 4's code as printed below also fails its own Step 7 and cannot construct a client for an embeddings-only app (88–91), and both Step 1 source tests pass against a comment (92): what shipped is `skeleton/ai/llm.js` and `skeleton/ai/end-user.js`, and sitting 6's record says why each differs.

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

**A NOTE FROM SITTING 6 (2026-09-14), before Step 3.** Step 3's `spawn(command, args, { env })` does not say what `env` is, and the answer is load-bearing: it must stay exactly what `runBuildxBuild` passes today, `{ ...process.env, DOCKER_CONFIG: configDir }`. That throwaway config is where the build's scoped registry token lives — `config.json` carries `{ auths: { [registryHost]: { registrytoken } } }` — so `process.env` alone drops the token the build pushes with; it also carries no `credsStore`, so the developer's `credsStore: desktop` never enters the build's path. That helper was hanging on this machine on 2026-09-14 and killed `make seed` at step 2 (finding 95), while the Docker tier's builds were untouched. **Keep the `cli-plugins` symlink as well**: the function's own comment says why.

**CORRECTIONS FROM A PRE-FLIGHT READ (2026-09-14) — thirteen, all measured against the repository as sitting 6 left it (numbers 101–113 in *What executing this plan found*). Read them before Step 1.**

- **101 — The migration is a NEW file, 0005, and drizzle-kit names it.** `0002_…` is applied (`0002_cultured_the_spike`); the journal holds 0000–0004, and an applied migration is never re-run (ORIENTATION §4). Define `buildLogs = audit.table('build_logs', …)` in `db/schema.ts`, run `drizzle-kit generate`, and append the `GRANT` by hand after a `--> statement-breakpoint`, as `0004_true_titania.sql` does. `CREATE SCHEMA audit` and `GRANT USAGE ON SCHEMA audit TO manifest_app` already exist — do not repeat them.
- **102 — Step 1's fixture does not exist.** `withRollback(fn)` passes one argument, `(tx)`; `withProject` passes `{ projectId, ownerId }`; nothing passes a `buildId`. A build row needs an `app_specs` row first (`builds.app_spec_id` is NOT NULL, and `app_specs` requires `commit_sha`, `parsed`, `schema_version` and `valid`). Write a local `withBuild` on top of `withProject`.
- **103 — Step 1's append-only test cannot pass for the right reason, three ways.** The table is `audit.build_logs`, so an unqualified `build_logs` fails with `42P01`; `rejects.toThrow(/permission denied/i)` never matches, because drizzle wraps the driver error as `Failed query: …` — use `events.test.ts`'s `expectSqlState(promise, '42501')`; and the UPDATE and the DELETE share one transaction, where the first refusal aborts it — one `withProject` per statement, as `events.test.ts` does. Assert `TRUNCATE` is refused too.
- **104 — Control (d) targets lines Task 1 deleted** (the owner transfer and the `REVOKE`). Its replacement: as the admin role, `GRANT UPDATE, DELETE ON audit.build_logs TO manifest_app`, run the append-only test and watch it go RED, then `REVOKE` exactly that and re-run it green.
- **105 — `startBuild` holds no secret to redact with.** The registry JWT is minted INSIDE `DockerDriver.buildImage` (`mintRegistryToken`; RS256, `registry-auth.ts:71`) and never leaves it, and there is no "build credential" any more — that driver's own comment records the HMAC credential being replaced. So the driver redacts its own token out of every line before `onLog`, by exact match (it holds the value), and the Docker tier asserts no line carries it; `startBuild` then applies `makeRedactor([])`, which is a pass-through until Task 12 gives it heuristics (and see 117).
- **106 — Step 4's line splitter is wrong as printed.** One partial-line buffer is shared by stdout and stderr, so a stdout fragment is glued onto the next stderr chunk; the trailing partial line is never flushed on exit; and that same buffer is what Step 4 says to keep as the full log. One buffer per stream, flush both on `close`, and a separate bounded tail for the error message and Task 13.
- **107 — `spawn` drops what `execFile` enforces.** `runBuildxBuild`'s build call carries `timeout: input.timeoutMs` — 900 000 ms, and `DEFAULT_BUILD_LIMITS` notes that BuildKit has no timeout of its own — `maxBuffer: 32 MiB`, and a rejection built as `EngineError('BUILD_FAILED', stderr || stdout)`. Carry the timeout (spawn's `timeout` or a timer), settle on `close` with the exit code, handle `error`, and keep the failure message. Only the `build` call needs `spawn`; `buildx create` prints no progress. (The prose above says `withEphemeralBuilder` holds the `execFile`; it is `runBuildxBuild`.)
- **108 — Ordering and `seq` are unspecified, and per-line writes race.** `onLog` is synchronous; one `appendBuildLog` per line fires concurrent inserts against `PRIMARY KEY (build_id, seq)`, and an append-only table cannot repair a collision. Assign `seq` from a counter in `startBuild`, write through one serial queue, and AWAIT that queue before the success UPDATE and inside the catch — or the failed-build test reads back before its lines land. A write that fails must surface, never `.catch(() => undefined)`.
- **109 — A failure before buildx has no lines at all.** `assembleContext` and `runMandatoryGates` throw before the builder exists, so a secret-gate or lockfile refusal writes nothing, and Step 1 proves the property only against `failingDriver`. Have the catch in `startBuild` append the recorded error as a final `stderr` line, and test it with a driver that throws before logging.
- **110 — The streaming contract test fails against the FAKE as written.** `createFakeDriver`'s `buildImage` contains no `await`, so a fake that calls `onLog` and returns resolves in the same tick, and `promise.then(() => resolved = true)` runs before `waitUntil` first yields. Make the fake yield between its line and its return (`await new Promise((r) => setImmediate(r))`) — fix the fake, never the test. `waitUntil` exists nowhere in `src/`; define it inside `driver-contract.ts`, which is shared suite code rather than a test file.
- **111 — Nobody can read a build's log while it runs.** `POST /projects/:projectId/builds` awaits the whole build inside `app.idempotent` and returns the build's id only at the end, so `GET /builds/:buildId/logs` is after-the-fact. Do not describe it as a live tail; live delivery is Task 14's stream, and Task 15 must publish from `onLog`, not from the table.
- **112 — Step 2's `pnpm test -- observability/build-logs runtime/` runs every file** (finding 34). The loop is `pnpm exec vitest run --project unit src/observability/build-logs src/runtime`.
- **113 — Name the table in the harness's two `TABLES` lists** (`vitest.global-setup.ts` and `db/testing.ts`), beside `audit.events`. `TRUNCATE … CASCADE` would reach it through the foreign key anyway, but both lists name `audit.events` explicitly and say why, and nothing in production deletes a build or a project — so the `RESTRICT` blocks no current path.


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
    // §20's rule applied to the other thing a faculty member is shown.
    // The table is in the `audit` SCHEMA and `manifest_app` — the least-
    // privilege role the control plane and this suite both connect as — is
    // granted SELECT and INSERT only. There is no owner transfer and no
    // REVOKE: a REVOKE against a SUPERUSER is a no-op that reads exactly like
    // a control, which P4a measured before rebuilding the role model.
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
CREATE TABLE "audit"."build_logs" (
  -- ON DELETE RESTRICT, not CASCADE. CORRECTED 2026-09-09 by Task 1: a
  -- referential action runs with the REFERENCED table's privileges, so a
  -- cascade here lets the application delete rows from a table it holds only
  -- SELECT and INSERT on, simply by deleting the build. That is the
  -- append-only grant bypassed through the front door, and it is the hole P4a
  -- closed on `audit.events` for exactly this reason (its FK is `restrict`,
  -- measured live: `confdeltype = 'r'`).
  build_id uuid NOT NULL REFERENCES builds(id) ON DELETE RESTRICT,
  seq      integer NOT NULL,
  at       timestamptz NOT NULL DEFAULT now(),
  stream   text NOT NULL CHECK (stream IN ('stdout','stderr')),
  text     text NOT NULL,
  PRIMARY KEY (build_id, seq)
);

-- §20's append-only rule. CORRECTED 2026-09-09 by Task 1: this said
-- `ALTER TABLE build_logs OWNER TO manifest_audit_owner; REVOKE ALL ... FROM
-- manifest; GRANT SELECT, INSERT ... TO manifest`, and every line of it was
-- wrong. **There is no `manifest_audit_owner` role** — P4a did not create one,
-- so the migration would have failed on its first statement. And the grants
-- named `manifest`, which is POSTGRES_USER and therefore a SUPERUSER: a
-- superuser bypasses every privilege check, so that REVOKE is the no-op that
-- reads exactly like a control and does nothing. P4a MEASURED it — `REVOKE
-- UPDATE, DELETE` followed by `UPDATE 1`, `DELETE 1` — and rebuilt the role
-- model rather than ship it.
--
-- What P4a actually shipped (migration 0004) is what this follows: the table
-- lives in the `audit` SCHEMA, no ownership moves, there is nothing to revoke,
-- and the application role is granted exactly two verbs. Every blanket grant in
-- this database is scoped `IN SCHEMA public`, so nothing reaches `audit` by
-- accident. `GRANT USAGE ON SCHEMA audit TO manifest_app` is already in place.
GRANT SELECT, INSERT ON "audit"."build_logs" TO manifest_app;

-- The tail query is `ORDER BY seq DESC LIMIT n`, and it runs while a build is
-- still writing. Without this the plan is a sort of the whole build.
CREATE INDEX build_logs_tail_idx ON "audit"."build_logs" (build_id, seq DESC);
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

**CORRECTIONS FROM A PRE-FLIGHT READ (2026-09-14) — five, four of them measured by running Step 3's rules exactly as printed (numbers 114–118). Step 3 cannot ship as written. Read them before Step 1.**

- **114 — Step 3's rules fail two of Step 1's seven tests.** The ordinary failing build log comes back as `node:[REDACTED]:1364:14` — `internal/modules/cjs/loader` is 27 characters with entropy above 3.0, because `/` is in `CANDIDATE`'s class — and the control word `antidisestablishmentarianism` (28 characters, entropy 3.34) is redacted. The fix is a redesign of what counts as a candidate, not a threshold nudged until these two samples pass.
- **115 — Against REAL output the entropy rule eats what makes a log diagnosable.** It altered 21 of 138 lines of a real BuildKit run (sitting 6's `make seed` log): every `sha256:` layer, manifest and config digest. On constructed samples it also redacts an image reference's `@sha256:` digest — what §13 binds an approval to — a 40-hex commit SHA, a UUID, a container name (`mf-proof-app-staging-1b83e8f0-app`), an npm `sha512-` integrity value, and a module path (`app/node_modules/ubc-genai-toolkit-llm/dist/index`). Step 1's "ordinary failing build log" contains none of those shapes, which is why it looked safe.

  **DECIDED — Rich, 2026-09-14: the pre-flight's recommendation, refined by measurement. It REPLACES Step 3's `CANDIDATE` and entropy rule; the five patterns stay as printed and run first.** The recommendation as first written — exclude `/`-runs, pure hex, UUIDs and digest prefixes — was measured before it was adopted, and it still failed Step 1's word control, redacted a container name, `ERR_PNPM_OUTDATED_LOCKFILE` and `SOURCE_DATE_EPOCH=…`, and altered 130 lines of this repository's own documents. Two refinements closed every one, measured in Node so the regex semantics are JavaScript's:

  ```ts
  /**
   * A digest or integrity value is ONE token, slashes included, and is never a
   * secret: it is an identifier, and §13 binds approvals to it. Otherwise a token is
   * a run of [A-Za-z0-9+_-] with at most two trailing '=' (base64 padding) — so '/',
   * '.', ':' and an INTERIOR '=' all end a token. That keeps a path, a hostname and
   * the NAME in NAME=value out of the candidate set, and leaves only the value to judge.
   */
  const TOKEN = /sha(?:1|256|384|512)[:-][A-Za-z0-9+/=]+|[A-Za-z0-9+_-]+={0,2}/g

  /**
   * Secret-shaped: 24+ characters without padding; upper case AND lower case AND a
   * digit — random base64 and base62 have all three, while words, paths, container
   * names, SCREAMING_SNAKE codes and hex do not; not hex and not a UUID; and Shannon
   * entropy above 3.0 bits per character. `[REDACTED]` is 10 characters and can never
   * be a candidate, which is what makes a second pass a no-op.
   */
  function secretShaped(token: string): boolean {
    if (/^sha(?:1|256|384|512)[:-]/.test(token)) return false
    const run = token.replace(/=+$/, '')
    if (run.length < 24) return false
    if (!(/[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run))) return false
    if (/^[0-9a-f]+$/i.test(run) || UUID.test(run)) return false
    return shannonEntropy(run) > 3.0
  }
  // after the patterns: text.replace(TOKEN, (t) => (secretShaped(t) ? REDACTED : t))
  ```

  **What it gives up**, on 1,000 random values of each shape: it redacts 88% of 44-character base64 (32 random bytes), 67% of 24-character base64, 99.7% of 40-character base62 and 100% of base64url — **and 0% of hex, by design.** Every secret the platform generates is hex (`secrets/store.ts`, `config.ts`) and sits in its app's secret set, so the exact-match half redacts it; §14 already says heuristics miss things. **What it keeps**: 0 lines altered across sitting 6's two seed logs, both Docker-tier logs, ORIENTATION, RUNBOOK and the spec; 0 of 16 constructed samples — digests, both slashed `sha512-` values, a commit SHA, upper- and lower-case UUIDs, a container name, module and mixed-case paths, SSO's entity ID and ACS URL, three `NAME=value` assignments and a GHSA id; and in P4a's and P4b's plans only the example credentials their own tests quote (`hunter2`, `s3cr3tP4ss`, the `sk-`, bearer, JWT, PEM and canary samples), every one through the five patterns. Step 1's seven tests pass, and a second pass is a no-op.

  **Step 1 changes with it.** The high-entropy positive must be mixed-case base64 — `token Zq8Lr2Vx9Tn4Wm7Ks1Hd6Pg3Jb5Yc0Fe` is redacted, while the pure hex Step 1 prints is now correctly KEPT; add that `API_TOKEN=Zq8Lr2Vx9Tn4Wm7Ks1Hd6Pg3Jb5Yc0Fe` becomes `API_TOKEN=[REDACTED]`; and put real lines into the diagnosability test — a BuildKit `exporting manifest sha256:…` line, a `FROM …@sha256:…` line, an npm `"integrity": "sha512-…/…=="` line, `SOURCE_DATE_EPOCH=…`, a container name and SSO's entity ID and ACS URL — so the property is held against the shapes real logs carry, not only the five lines Step 1 prints. 118's controls are then re-predicted against this rule.
- **116 — It changes what SSO registration persists, and two DOCKER tests catch it.** `sso/registration.ts` is `makeRedactor`'s only production caller. Under Step 3's rules `https://manifest.internal/sp/chem-labs/staging` becomes `https://manifest.[REDACTED]`, and an ACS URL loses everything after `manifest.` — so `sso.acs_changed`'s `from` and `to`, which §9 alerts on, both read `[REDACTED]`. `registration.docker.test.ts:152` and `deploy-sso.docker.test.ts:199` go RED, and only in the Docker tier, which this task's *Files* block does not name: **Task 12 ends with `pnpm test:docker`.** The certificate fingerprint is safe — Node's `fingerprint256` is colon-separated.
- **117 — `makeRedactor([])` never reaches a heuristic.** `if (needles.length === 0) return (value) => value` returns before anything else, and every test in Step 1 builds its redactor that way. Remove the early return and run the heuristics inside `walk`'s string branch, so they apply at every depth of `machine_detail`. The existing *is a no-op when the app has no secrets yet* still passes on its input; its name stops being true.
- **118 — Three of Step 5's four controls predict the wrong failure.** (a) A floor of 8 does not redact `ELIFECYCLE` (entropy 2.45) or `loader:1364:14` (`:` splits it); what goes RED is the URL host and `Authorization`. (b) Entropy before the URL rule does not eat the host — `:` and `@` break the run; what goes RED is the `sk-` key. (c) Deleting the PEM rule leaves the block entirely intact, not "the body with the armour gone". Re-predict each against the rules that ship, and run `pnpm exec vitest run --project unit src/observability/redact` for Step 2 rather than `pnpm test --` (finding 34).

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

**A NOTE FROM SITTING 7 (2026-09-14), before Step 1.** Not a pre-flight read of this task — six facts sitting 7 established, measured, that this task's text predates. Read them with sitting 7's entry in *What executing this plan found*.

- **The migration is a new `0006`, named by drizzle-kit** — not `0002_build_logs_and_incidents.sql`, whose name the *Files* block still carries. Task 11 wrote `0005_loud_carlie_cooper.sql` exactly that way: define the table with `audit.table(…)` in `db/schema.ts`, run `drizzle-kit generate`, append the `GRANT SELECT, INSERT` after a `--> statement-breakpoint`. **Append with a glob, never `$(ls …)`** — `ls` is aliased to a long listing here, and sitting 7's grant silently never reached its migration, which then applied without it (finding 119).
- **Step 1's fixture is pre-flight 102's defect again**: `withRollback` passes one argument, so `withRollback(async (db, fixture) => …)` has no `fixture`. An `instances` row needs a project, an environment and a release, so write a local fixture on top of `withProject`, as `build-logs.test.ts`'s `withBuild` does.
- **Step 1's redaction test no longer proves the exact-match half.** Its canary, `mongodb://app:hunter2@db:27017/x`, is a credential-bearing URL, and since Task 12 `makeRedactor([])` redacts that password with no secret set at all. Control (c) still goes red — the identity function redacts nothing — but to prove the app's own secret set reaches the Incident, the canary must be a value no heuristic matches: short, lower-case or hex, outside a URL, as `redact.test.ts`'s `hunter2` is.
- **`expectSqlState` lives in `observability/testing.ts`** now, shared by the `events` and `build_logs` tests; the append-only tests for `audit.incidents` should use it, one transaction per refusal, and include `TRUNCATE` and a delete of the referenced `instances` row (`23503`).
- **Name `audit.incidents` in both harness `TABLES` lists** (`vitest.global-setup.ts`, `db/testing.ts`), beside `audit.events` and `audit.build_logs`.
- **Step 2's `pnpm test -- observability/incidents spec/diff` runs every file** (finding 34). The loop is `pnpm exec vitest run --project unit src/observability/incidents src/spec/diff`.

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
CREATE TABLE "audit"."incidents" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT, for the reason `audit.build_logs` records: a cascade runs with
  -- the referenced table's privileges and erases an append-only table.
  instance_id         uuid NOT NULL REFERENCES instances(id) ON DELETE RESTRICT,
  exit_reason         text NOT NULL,
  log_tail            text NOT NULL,
  failed_check        text NOT NULL,
  diff_since_healthy  text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Append-only, like `audit.events` and `audit.build_logs`, and for the same
-- reason: an incident is what an app's owner is shown about a failure, and a
-- record that can be edited after the fact is not a record (§20).
--
-- CORRECTED 2026-09-09 by Task 1, for the reason Task 11's migration records at
-- length: `manifest_audit_owner` does not exist, and a grant naming `manifest`
-- constrains a superuser, which constrains nothing. The table goes in the
-- `audit` schema, like `audit.events` and `audit.build_logs`.
GRANT SELECT, INSERT ON "audit"."incidents" TO manifest_app;
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

**CORRECTION FROM SITTING 5 (2026-09-14) — `rotateAppKey` no longer exists.** Rich's decision split it into `mintAppKey`, `commitAppKey` and `discardAppKey` (Task 9), so Step 1's `ai.key_rotated` test cannot call it. A rotation is COMPLETE at `commitAppKey`, which runs only after the instance is healthy — that is where `ai.key_rotated` belongs, recorded without the key. A minted key that is discarded never became the app's key, so whether a discard deserves an event of its own is this task's call to make and record; if it does, it carries no key either. `deployRelease` already prints a failed discard to stderr, without the key.

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

### Sitting 1, Task 1 — the reconciliation pass (2026-09-09). 6 divergences, 2 of them fatal and 1 a live hole in §20.

**It did not reconcile clean.** Eighteen checklist rows, plus the three places P4a was
ambiguous. Thirteen rows landed exactly as promised; six things did not — **two would
have failed a migration on its first statement, and one would have shipped a working
migration with §20's append-only control quietly bypassable.**

**The one to read is divergence 2.** P4b was written against a §20 design that P4a
*measured and rejected during execution*, and it carried that design into two real
`CREATE TABLE` blocks. Nothing about it looks wrong on the page — it is P4a's own
self-review reasoning, quoted almost verbatim — which is exactly why the checklist is a
`grep` against the running database rather than a re-read of the plan.

| # | P4a's X is actually Y | Edited |
|---|---|---|
| 1 | **`InjectionContext` has NO `spec` field.** Step 3 said it was "fully typed… including `spec: ManifestSpec` and `resolved: ResolvedConfig`", and Decision 6 assumed the AI read would move *between the two*. P4a went further: it removed `spec` outright, because §13 freezes the config at release time and reading `app_specs.parsed` back out is a second source of truth — P3's most expensive shape, seven times over. Its eight fields are `resolved`, `environmentKind`, `hostname`, `projectSlug`, `idp`, `spEntity?`, `secrets`, `services`. **Task 9's code was already right** (it reads `resolved.ai` throughout); only the prose was stale | Task 1 Step 3 |
| 2 | **THERE IS NO `manifest_audit_owner` ROLE, and §20's control is a SCHEMA.** `grep -rn manifest_audit_owner packages/ infra/` returns nothing. P4a's migration 0004 creates an `audit` schema, puts `events` in it, transfers no ownership and issues **no `REVOKE`** — because there is nothing to revoke: every blanket grant in this database is scoped `IN SCHEMA public`, so nothing reaches `audit` by accident. The whole control is `GRANT USAGE ON SCHEMA audit` + `GRANT SELECT, INSERT ON audit.events`, to **`manifest_app`**. **P4b's Tasks 11 and 13 each did `ALTER TABLE … OWNER TO manifest_audit_owner; REVOKE ALL … FROM manifest; GRANT … TO manifest`** — which fails on statement one for a role that does not exist, and whose grants name `manifest`, a SUPERUSER whose privileges cannot be constrained at all. **That is the exact no-op P4a measured** (`REVOKE UPDATE, DELETE`, then `UPDATE 1`, `DELETE 1`) before rebuilding the role model to make §20 implementable. Both migrations are rewritten to 0004's pattern | Tasks 11, 13 |
| 3 | **The checklist's own command was wrong.** `\dp events` searches `public`, so it returns nothing against a table that is in `audit` — **a check that reads as "the table is missing" when the table is fine.** Now `\dp audit.events`. Measured: `manifest=arwdDxt/manifest`, `manifest_app=ar/manifest` — `ar` is SELECT and INSERT, and that is §20 | Task 1 Step 2 |
| 4 | **`deployRelease` NEVER LOADS THE AppSpec ROW.** Step 3 said `parsedSpec` was "loaded in `deployRelease` via `release.appSpecId`". `appSpecs` is not queried anywhere in `releases/release.ts`; `appSpecId` is written when a Release is created and never read back. Same root cause as divergence 1 — and **a P4b task that adds such a load would be reintroducing the producer P4a deleted** | Task 1 Step 3 |
| 6 | **Both new audit tables used `ON DELETE CASCADE`, which bypasses the append-only grant.** A referential action runs with the **referenced** table's privileges, so `DELETE FROM builds` would have deleted rows from `audit.build_logs` — a table the application holds only `SELECT, INSERT` on — and `DELETE FROM instances` the same for `audit.incidents`. **§20's control, defeated through the front door.** P4a closed exactly this on `audit.events`, whose FK is `restrict`; measured live, `confdeltype = 'r'`. Both are now `ON DELETE RESTRICT` | Tasks 11, 13 |
| 5 | **`makeRedactor(await secretValuesFor(…))` is missing `.values()`.** `secretValuesFor` returns `Promise<Map<string, string>>`; `makeRedactor` takes `Iterable<string>`. A `Map` *is* iterable — it yields `[key, value]` pairs — so the line as written builds a redactor over arrays rather than secrets, and every needle silently stops matching. `sso/registration.ts:97` is the working call site | Task 1 Step 3 |

**Thirteen rows landed exactly as promised**, and they are worth naming so the next
reader does not re-check them: `renderInjection` / `INJECTION_VARIABLES`;
`INJECTION_AI_UNSUPPORTED` (present at `injection.ts:263`, Task 8 deletes it); the six
AI rows with `requiredIn: 'if-ai'`; `recordEvent(db, input, redact)` and `EVENT_TYPES`;
`makeRedactor(secretValues: Iterable<string>)`; `putSecret` / `getSecret` /
`secretValuesFor`; `deployRelease(db, driver, config, deps, input, healthWait?)`;
`testSessionCookie(user, secret)`; `provides.ai: false`; the drift test's `fullContext()`
with `ALLOWED_UNSET` and `PLATFORM_ONLY` both **empty**; the seed warming from
`blueprints/*/skeleton/package.json` and `fixtures/*/package.json`; the proof app's 501
AI stub; and `make demo-identity`. **`POST /auth/dev-login` is gone** — the only
surviving mention is `api/auth.test.ts:329`, which is the negative control asserting its
absence.

**Two shapes recorded rather than edited**, because they are additions P4b makes rather
than assumptions it got wrong:

- **`DeployDeps` has four fields** — `secrets`, `appSecrets`, `sso`, `blueprints` — and
  **`ServerDeps` has nine**, including `samlSp`, which P4a's Task 14 added. Tasks 5, 6,
  8 and 13 add to both; neither is the three-field object the plan was drafted against.
- **Any new migration must be its own file.** drizzle-kit keeps a journal and an applied
  migration is never re-run, so Tasks 11 and 13 write `0005_*.sql` and `0006_*.sql`
  rather than extending 0004. Not a divergence — a platform fact P4b never states, and
  it is cheap here.

**The four items in *What sitting 1 must reconcile* are confirmed**, having been found
while agreeing the sitting split: `fixtures/proof-app/` has no `package.json` or
`package-lock.json` (the seed's `[ -f "$manifest" ] || continue` skips it cleanly, and
its dependencies are warmed through the blueprint skeleton instead), `endUserId` exists
in `fixtures/proof-app/identity.js`, `idp_login` is one shared function in
`infra/lib/idp-login.sh`, and `scripts/offline-acceptance.sh` already has a step 6.

**Gates at the start of the sitting**, which is Step 1's answer: `make doctor` **17/0**,
`make verify` **47/0**, `pnpm test` **525** (56 files), `pnpm test:docker` **116**
(22 files), lint / typecheck / `format:check` clean, and both acceptances green —
`make demo` and `make demo-identity`, the latter also from a `make reset` machine.
P4a is executed and green, so Task 1's stop condition did not fire.

### Sitting 1, Task 2 — pinning LiteLLM (2026-09-09). 4 defects, and the tag moved while we watched.

**M5 proved itself before the check that proves it was written.** The plan says
`ghcr.io/berriai/litellm:main-stable` is a moving tag that nothing pins. Measured
2026-09-07 it was `sha256:20b5044b` — litellm **1.98.0**, image built 08-22, and S3's
error table was measured against it. Measured again on **2026-09-09, two days later**,
it was `sha256:a3715fa7`, built that morning. **The upstream rebuild landed roughly two
hours before this task started.**

**Rich's call: pin `20b5044b`, the version S3 measured.** §16 pins the AI error mapping
to a version, and Tasks 4 and 15 assert against 1.98.0's envelopes — the `detail` shape
of a route denial, and the message substring that separates a key budget from an
end-user budget. Adopting an unmeasured build would have made all of that a hypothesis
again, with no Task 4 yet to re-measure it. Moving to a current LiteLLM is now a
deliberate act with those tests in hand.

**The reference in `images.txt` is a DIGEST, not a tag** — the only line in that file
that is. A tag cannot pin a version whose tag has already moved.

| # | Defect | Measured against |
|---|---|---|
| 7 | **The pin made `make seed` depend on its own output.** `compose.yaml` used `${LITELLM_DIGEST:?…}` and the digest is written by `mirror-images.sh`, which is seed's step 4 — but seed's step 2 is `$COMPOSE build`, and Compose interpolates the whole file before it builds anything. `make seed` died at step 2/6 with *"required variable LITELLM_DIGEST is missing a value"*, **on a clean clone as well as here**. | Running it. The fallback is an all-zero digest, set in `infra/lib/common.sh` and the Makefile from the same one source: it lets the build interpolate, and it cannot be pulled, so `up` still fails loudly if the lock is genuinely absent. What proves the RUNNING container matches the lock is `make doctor`, which asks the daemon rather than the file |
| 8 | **Pinning it broke a sibling check.** `check_registry_has_bases` iterates every line of `images.txt` and asserts each is in the local registry. LiteLLM is deliberately **not** mirrored — nothing does `FROM` a running service, and pushing ~2 GB there is a slow no-op — so adding the line turned that check red. | `make doctor`: 18 checks, **1 failed**, immediately after the new check first passed. Excluded by name, with the reason at the exclusion. A pin that reddens an unrelated gate is how a gate gets weakened later |
| 9 | **THE NEGATIVE CONTROL CAME OUT GREEN, and it was the control that was wrong.** Corrupting one character of the lock's digest left the check passing. Because `images.txt` now holds a digest reference, the lock line carries the digest **twice** — field 1 is `ghcr.io/berriai/litellm@sha256:…` and field 2 is `sha256:…` — and the edit hit field 1 while the check reads field 2. | Caught by reading the printed values rather than the exit status: the check reported `lock=…ddaf4` when the file said `…ddaf5`, which is the tell. Re-applied to field 2: **RED, printing both digests.** Second time in two sittings that a control was falsely green — P4a's defect 77 was the first |
| 10 | **Task 2's own text contradicts itself about `LITELLM_DIGEST`.** Its *Interfaces* block says the constant is **not** introduced, *"`images.lock` is already the one place digests live"*; Step 3 says to *"have `make seed` export `LITELLM_DIGEST` … into `.env`"*. | Read while implementing. Resolved toward the Interfaces block's intent: the variable is **derived at use** from `images.lock` by `common.sh` and the Makefile, and **never written into `.env`** — a copy there is a second source that drifts the first time somebody re-seeds without re-running whatever wrote it. One file remains the source of truth |

**The negative control, watched red and reverted.**

| Control | Result |
|---|---|
| one character changed in `images.lock`'s digest **field 2** | **RED**, printing `lock=…ddaf5 running=…ddaf4`. Applied to field 1 first, where it was **GREEN** — defect 9 |

**State at the end of the task:** `make doctor` **18/0** — the new check is doctor's
eighteenth — `make verify` **47/0**, `make seed` green, `make up` green, LiteLLM running
`sha256:20b5044b` and answering `{"status":"healthy","db":"connected"}`. Sitting 1 is
complete. **Sitting 2 is Task 3, alone: §16's AI-path regression tier.**

### Before sitting 2 — restoring the platform after a reboot (2026-09-14). 2 defects, 1 fixed, and 5 corrections to Task 3's text.

**No task ran.** Five days after sitting 1 the machine had rebooted (up since about 2026-09-10), Docker Desktop was stopped and the `127.0.0.2` alias was gone. This session brought the platform back and measured it against ORIENTATION §2's box before starting Task 3 — and the box did not hold. macOS 26.6.2, Docker Engine 29.7.2, Ollama 0.34.0, Grype v0.118.0.

| # | Defect | Measured against |
|---|---|---|
| 11 | **`make up` does not recover the edge when Docker Desktop starts first.** Starting Docker Desktop restarted `manifest-caddy` itself (`restart: unless-stopped`) 2.6 s after its engine came up, before the alias existed. The port forward failed with `bind: can't assign requested address` and Docker Desktop never retried it, so all three of Caddy's host ports stayed unpublished — including `127.0.0.1:7119`, whose address was never missing. `make up` then added the alias, left the running container alone and printed `platform up`; `make doctor` said 18/0 with one warning that blamed CA trust for an `ECONNREFUSED`. **Not fixed:** the fix belongs in `make up`, and its negative control needs the alias removed, which is `sudo` | `make verify`: **9 failed**, every one host→edge, while every container→edge check passed. `docker port manifest-caddy` printed nothing, and `com.docker.backend.log` carried the bind error. `docker restart manifest-caddy` → three ports published, host `200`, doctor 18/0/0, verify 47/0. RUNBOOK *Known gaps* has the entry |
| 12 | **§12's scan refused any vulnerability database more than five days old, so every build failed.** Grype validates the database's age itself — `validate-age: true`, `max-allowed-built-age: 120h` by default — and the scanner's environment set only `GRYPE_DB_AUTO_UPDATE=false`. §12 says a stale database *"warns rather than blocks"*, and `assessScan` records staleness past 7 days; that path was unreachable. `make doctor` called the database fresh, because `grype db status` does not validate age. **Fixed:** `SCANNER_ENV` in `build/scan.ts` carries `GRYPE_DB_VALIDATE_AGE=false` | `pnpm test:docker`: **13 failed, 33 skipped, 70 passed**, every failure `SCAN_FAILED … built 5 days ago (max allowed age is 5 days)` or a cascade of it, on a database built 2026-09-09T06:31Z |

**The negative control, and the proof on the real condition.** The new test in `scan.docker.test.ts` forces `GRYPE_DB_MAX_ALLOWED_BUILT_AGE=1s`, so it fails on a database of any age rather than only on a stale machine. Without the line it was **RED**, `max allowed age is 1 second` — though its first run was RED for an unreadable reason, because the message printed stderr's first 400 characters and a Syft warning filled them; it now prints Grype's `ERROR` lines. With the line, GREEN. Then, **before refreshing**, all 47 tests in the six failing files passed on the same 5.5-day-old database. Only after that was the database refreshed — schema v6.1.9, built 2026-09-14T06:38:38Z — and the full tier re-run on it, which also shows the newer data blocks nothing.

**One false green of this session's own:** the first background run of the gates printed the Docker tier's result through a summary loop, so the command exited 0 on 13 failures. Caught by reading the count rather than the status.

**Five corrections to Task 3's text (13–17)** are written at the top of Task 3 rather than here, where the agent executing it will meet them: `LITELLM_MASTER_KEY` never reaches a test process; `s6.docker.test.ts` imports neither `createEngineClient` nor `attachPlatformNeighbours`; probe 14 leaks a LiteLLM key per run; the toolkit is in no lockfile; and probe 13's comment names Task 7 for Task 8's work.

**Gates at the end:** `make doctor` **18/0/0**, `make verify` **47/0/0**, `pnpm test` **525** (56 files — twice before the fix, once after), `pnpm test:docker` **117** (22 files; the new one is the 117th), lint / typecheck / `format:check` clean. **Sitting 2 is still Task 3, alone.**

### Sitting 2, Task 3 — §16's AI-path regression tier (2026-09-14). 6 findings, one of them in Task 7's code.

**Task 3 is done, and the tier exists before any `ai/` module does.** `ai/testing.ts` mints probe keys through LiteLLM's admin API; `s6.docker.test.ts` gains the two probes its own header deferred to P4; `ai/ai-path.docker.test.ts` runs the toolkit from the host; `ubc-genai-toolkit-llm` is pinned at exactly 0.7.0. Versions: LiteLLM 1.98.0 (`sha256:20b5044b`), `curlimages/curl:8.11.1`, pnpm 11.24.0, Docker Engine 29.7.2, macOS 26.6.2.

**What it measured.** Probe 13: from `fixture-s6`'s network, `GET /v1/models` → `000` with LiteLLM unattached, and `200` from the same container once `attachPlatformNeighbours` put `manifest-litellm` on it. Probe 14: a confined key gets `200` on `/v1/models`, `/v1/chat/completions` and `/v1/embeddings`, and `403` on `/key/generate`, `/model/info`, `/spend/logs` and `/key/info`; the matched unconfined key — same user, same models — mints a child key, `200`. The toolkit tier: 768 dimensions with `encoding_format: 'float'`, 192 near-zero values without, and non-empty streamed content from `default-chat`.

**The five pre-flight corrections (13–17) are all resolved.** 13: `vitest.env.ts`'s `ensureLitellmMasterKey()` derives the key from `.env` — assigning only when there is a value, because `process.env.X = undefined` stores the string `"undefined"` — and `ai/testing.ts` reads it when it mints, not at import. 14: both imports added. 15: probe 14's child key carries a known alias and `afterAll` deletes it by `key_aliases`; `p4b-probe-user` held **0 keys** after every run, the full tier included. 16: installed with `-E`, and pnpm reported *"Lockfile passes supply-chain policies"*. 17: the comment names Task 8.

| # | Finding | Measured against |
|---|---|---|
| 18 | **Step 2's `statusFromNetwork` threw on exactly the value probe 13 asserts.** curl prints `000` **and** exits non-zero when nothing answers, and `execFile` rejects on a non-zero exit, so `const { stdout } = await run(…)` could never return `000`. It now reads stdout on rejection too, and throws if that is not three digits — a harness failure, not a denial | Reading `s6.docker.test.ts`'s `run`; then the RED run, where probe 13's first line passed at `0` |
| 19 | **LiteLLM's `/user/new` mints an UNCONFINED key unless told not to — and Task 7's code calls it that way.** `NewUserRequest.auto_create_key` defaults to `true`. Task 7's `ensureAiUser` posts `{ user_id, ...budget }`, so every app's LiteLLM user would hold an unconfined key beside the confined one: the escalation `allowed_routes` exists to close. `ensureProbeUser` passes `auto_create_key: false`, **the correction is written at the top of Task 7**, and the stray key this measurement created was deleted | `/openapi.json`; `/user/info?user_id=p4b-probe-user` → 1 key, `allowed_routes: []`, `models: []`; 0 after `/key/delete` |
| 20 | **Step 5's test used `MASTER` and `LITELLM`, which Step 1 defines as module-private constants** — a `ReferenceError` at the first test. `ai/testing.ts` exports `litellmUrl()` and `litellmMasterKey()` instead | Reading the two code blocks against each other |
| 21 | **Negative control (c) cannot produce its stated result.** Reading curl's exit code into `expect(status).toBe(403)` fails on every route, confined or not — it never "passes on a broken confinement". The claim underneath it is right, so it was measured directly | A confined key from the platform network: `/v1/models` → http 200, **curl exit 0**; `/key/info` → http 403, **curl exit 0** |
| 22 | **Negative control (d)'s expectation is wrong: without `--dns 10.89.0.53` both probes stay GREEN.** Docker's embedded resolver finds `manifest-litellm` once it is attached, so the resolver is not what gives `000` its meaning — the before/after pairing is. `--dns` stays, because probes 2–8 resolve that way | The control run: probe 13 `0` → `200`; probe 14's eight assertions as with the flag |
| 23 | **S6's teardown leaves both app networks behind.** `mf-fixture-s6-staging-net` (created 2026-09-10) and `mf-fixture-s6nb-staging-net` survive every run with `manifest-caddy` and `manifest-dns-containers` still attached: `docker network rm` fails while a neighbour is attached, and `.catch(() => undefined)` swallows it. P3's, not this task's — named, not fixed. ORIENTATION §4's *"five app networks survived a cleanup that reported success"* is the same shape | `docker network inspect` after the runs |

**Negative controls, each on a copy of the file restored byte-for-byte after its run:**

| Control | Result |
|---|---|
| the attach removed (Step 4's RED run) | **RED** — probe 13 `expected +0 to be 200`; probe 14 the same on its first line |
| (a) the "confined" key minted without `allowed_routes` | **RED** — `/key/generate was not refused: expected 200 to be 403` |
| (b) no `/user/new`, so the open key's user does not exist | **RED** — the child mint answered **401**: without the user row the negative control silently becomes a second positive. It left no user row behind (`/user/info` → 404) |
| (c) exit code instead of status | measured directly — finding 21 |
| (d) no `--dns 10.89.0.53` | **GREEN** — finding 22 |

**One mistake of this session's own.** Control (c)'s first attempt used `path` as a shell loop variable. The Bash tool's shell is zsh, where `path` is tied to `$PATH`, so `docker`, `curl` and `python3` vanished mid-command and a key minted before the loop leaked. It was deleted, and ORIENTATION §4 now carries the trap.

**Gates at the end:** `pnpm test` **525** (56 files, twice), `pnpm test:docker` **122** (23 files, ~415 s), lint / typecheck / `format:check` clean. `make doctor` 18/0 and `make verify` 47/0, from the `make up` at the start of the session — nothing in `infra/` changed. **Sitting 3 — Tasks 4 and 5 — is next.**

### Sitting 3, Tasks 4 and 5 — the error mapper and the admin transport (2026-09-14). 11 findings, two of them corrections to later tasks.

**Both tasks are done.** `ai/errors.ts` maps LiteLLM's failures to nine Manifest codes and carries nothing but the status; `ai/client.ts` is the one place the control plane calls LiteLLM's admin API; `config.litellm` exists; the boot scrub removes the new name. Commits `146db98` and `534fd8a`. Versions: LiteLLM 1.98.0 (`sha256:20b5044b`), Node 24.12.0, pnpm 11.24.0, Docker Engine 29.7.2, macOS 26.6.2.

**The finding to read is 28.** Task 7's code cannot work through Task 5's client, and as written it fails every redeploy of an AI app. Nothing in Task 7's own test list could see it, because its fake client never rejects.

| # | Finding | Measured against |
|---|---|---|
| 24 | **The mapper called every `{"detail": …}` body a route denial.** FastAPI raises its own errors in that envelope, and Task 5 points the mapper at the ADMIN API: an unknown route is `404 {"detail":"Not Found"}` and a refused body `422 {"detail":[…]}` — which also echoes the refused `input` back. Mapped as written, an operator's typo reaches a faculty member as *"this app tried to do something apps are not allowed to do"*, with a hint calling it a bug in their app. A route denial is now a `detail` body **on a 403** | `curl` with the master key against the running proxy; then the plan's verbatim mapper against the new test — **RED**, `expected 'AI_ROUTE_NOT_PERMITTED' to be 'AI_UNMAPPED'`. The Docker tier re-provokes all three admin envelopes |
| 25 | **The mapper called every 400 an unknown model.** It is now a 400 whose `type` is the string `"None"` — which is also what negative control (d) presupposed and the plan's code never checked | Reading; the verbatim mapper **RED** on a plain-text 400. The `"None"` row is re-provoked live |
| 26 | **An app key never sees `AI_MODEL_UNKNOWN`.** Step 4 provoked it with a confined key limited to `default-chat` and `default-embed`, and LiteLLM refuses a model off a key's list before it asks whether the model exists — `403 key_model_access_denied`, not S3's 400. Every app key carries a `models` list (Task 7), so a misspelt model reaches an app as `AI_MODEL_NOT_PERMITTED`. The tier now provokes that row with the confined key and `AI_MODEL_UNKNOWN` with the master key, the one key it holds that has no list — **four rows provoked, not three** | `ai-path.docker.test.ts`: `AI_MODEL_UNKNOWN drifted: LiteLLM answered 403 type=key_model_access_denied` |
| 27 | **Step 4's snippet used `LITELLM` and `PROBE_USER`, which `ai-path.docker.test.ts` does not define** — finding 20 again — never called `ensureProbeUser`, and deleted its key only when every case passed. It uses sitting 2's exported helpers and deletes in a `finally` | Reading; then `p4b-probe-user` held **0 keys** after the RED run above, which failed mid-loop |
| 28 | **Task 7's `ensureAiUser` cannot recognise an existing user.** It matches `/already exists/` against `String(error)`, and Task 5's client exists so that no LiteLLM text reaches an error: `String(error)` is `AiError: The AI service refused this request for a reason the platform does not recognise.` So the first deploy of an AI app creates the user and **every later deploy throws**. The duplicate answers **409** with `type: internal_server_error`, and the status survives the mapper by design. **The correction is at the top of Task 7** | `POST /user/new` for the existing `p4b-probe-user` with `auto_create_key: false` → `409 {"error":{"message":"{'error': 'User with id p4b-probe-user already exists'}","type":"internal_server_error",…}}`; 0 keys and `max_budget` 5.0 afterwards, so nothing was created |
| 29 | **Negative control (a) as worded cannot fail.** Moving the `detail` branch after the type reads leaves the suite GREEN, because no earlier branch catches a 403 with no `error` object. Deleting the branch is the control that works | Both run — see the controls table |
| 30 | **Task 5 contradicts itself about when a missing key fails.** Step 3 says *"at the first call"*; its own test says at construction. The test wins. **So Task 9's `createLiteLlmClient(config.litellm)` cannot typecheck** — the config carries `url` and an optional `masterKey`, the client takes `baseUrl` and a required one. **The correction is at the top of Task 9** | Reading, against the committed `config.ts` and `client.ts` |
| 31 | **An empty master key failed a DEVELOPMENT boot.** Pre-flight correction 2's recommended route is README's `export MANIFEST_LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY}"`, which expands to `''` when `.env` lacks the line — and the plan's `z.string().min(1).optional()` refuses `''` as `CONFIG_INVALID` in every environment, including the one that does not need the key. Empty is now absent: development boots, staging gets `CONFIG_LITELLM_MASTER_KEY_REQUIRED`, which is what the plan's own control (c) expected | Control (c2): `invalid configuration — MANIFEST_LITELLM_MASTER_KEY: String must contain at least 1 character(s)` |
| 32 | **A non-JSON SUCCESS body was a second way for a third-party body to escape.** The plan covered a non-JSON error body. Node's `JSON.parse` quotes the text it could not parse, so a 200 carrying a proxy's page throws a `SyntaxError` containing that page. It is now `AI_UNMAPPED` with the status | Control (a): both non-JSON tests **RED** |
| 33 | **Step 4 named the wrong three files.** `vitest.env.ts`, `api/testing.ts` and `.env.example` needed nothing, because every new setting defaults or is optional in development. What broke was **three tests in `config.test.ts` that load a production config** — RED on the new guard's own message, which is the guard watched working. They now supply the key | The focused run after implementing: 3 failed, each `MANIFEST_LITELLM_MASTER_KEY is required when MANIFEST_ENV is 'production'` |
| 34 | **`pnpm test -- ai/errors` does not filter** — it ran all 57 files. The one-file loop is `pnpm exec vitest run --project unit src/ai/errors` | Step 2's first run |

**The three pre-flight corrections are resolved.** 1: `MANIFEST_LITELLM_MASTER_KEY` is in `SECRET_ENV_NAMES` and in the list `scrub.test.ts` asserts, watched RED first. 2 and 3: it is not in `.env.example`, and README's export block derives it from `LITELLM_MASTER_KEY`. **One departure from the recommendation, deliberately:** `vitest.env.ts` does not set `MANIFEST_LITELLM_MASTER_KEY` as well. Nothing in the suite reads that name — `ai/testing.ts` reads `LITELLM_MASTER_KEY`, the name LiteLLM itself holds — and a second name with no reader is the drift correction 3 warns about. Task 9 is the first thing that would read it in a test, and it is the place to add it if it needs it.

**Decisions made here, so nobody re-derives them.** `timeoutMs` defaults to 10 s. A request that gets no response is `AI_BACKEND_UNAVAILABLE` with status 0 and `reason: 'timeout' | 'unreachable'` — two fixed words, because undici's error carries an address and nothing from outside the module reaches an `AiError`'s fields. The master key is required outside development **unconditionally**, not only when `MANIFEST_AI_ENABLED=1`: the flag gates the catalogue read and must not become a second condition on a guard. The new guard runs **last**, so every earlier guard still names its own setting first.

**Negative controls.** Each was applied by a script that refused to run unless its pattern matched exactly once, and restored the file byte-for-byte afterwards — both scripts reported `True`.

| Control | Result |
|---|---|
| **Task 4** — the plan's verbatim mapper, against the new tests | **RED** on exactly the two new cases (24, 25); the other 7 green |
| (a1) the `detail` branch moved after the type reads — the plan's wording | **GREEN** — finding 29 |
| (a2) the `detail` branch deleted | **RED** — `expected 'AI_UNMAPPED' to be 'AI_ROUTE_NOT_PERMITTED'` |
| (b) the budget case without `/End User=/` | **RED** — `expected 'AI_PROJECT_BUDGET_EXCEEDED' to be 'AI_USER_BUDGET_EXCEEDED'` |
| (c) `message` added to `AiError.detail` | **RED** — the serialised error contains the key hash |
| (d) any non-empty `type` treated as mapped | **RED** — `expected 'AI_UNMAPPED' to be 'AI_MODEL_UNKNOWN'` |
| (e) the 403 guard removed, run against the LIVE proxy | **RED** — `an admin 404 mapped to an app fault` |
| **Task 5** (a) no `try` around `JSON.parse` | **RED** — both non-JSON tests |
| (b) no `AbortSignal` | **RED** — `Test timed out in 5000ms`. Vitest's default timeout ends the hang the plan said to kill by hand after 30 s |
| (c1) no `CONFIG_LITELLM_MASTER_KEY_REQUIRED` guard | **RED** — a staging config without the key loads |
| (c2) `''` not treated as absent | **RED** — finding 31 |
| (d) no construction-time key check | **RED** — `expected function to throw an error, but it didn't` |
| (f) a non-2xx thrown as the raw response text | **RED** — the key-hash test and the non-JSON error test |

**Gates at the end:** `pnpm test` **547** (58 files, twice), `pnpm test:docker` **124** (23 files, ~412 s), lint / typecheck / `format:check` clean. `make doctor` 18/0/0 and `make verify` 47/0/0, measured at the start of the sitting — nothing in `infra/` changed. `p4b-probe-user` held **0 keys** at the end. The before/after machine snapshot differs only in `manifest-caddy`'s uptime — `routes.docker.test.ts:144` restarts it by design — and after the tier its three ports were published and `make verify` was **47/0/0** again. **Sitting 4 — Tasks 6 and 7 — is next**, and Task 7 now carries two corrections at its top; Task 9 carries one.

### Before sitting 4 — a pre-flight read of Tasks 6 and 7 (2026-09-14). 8 corrections and a note, written at the top of the two tasks.

**No task ran.** The same pattern as the reads before sittings 2 and 3: Tasks 6 and 7 read against the repository as sitting 3 left it, with every claim that could be measured measured. Nothing was created — the one live probe deletes a key that does not exist, and the type check used a scratch file deleted in the same command (`git status` clean after).

| # | Correction | Measured against |
|---|---|---|
| 35 | Task 6's `clientReturning` fake does not typecheck against the generic `LiteLlmClient.get` | A scratch file under `src/ai/` and `tsc --noEmit`: **TS2345**, `Type 'unknown' is not assignable to type 'T'` |
| 36 | Task 6 Step 5 uses `LITELLM`, `MASTER`, `parseYaml`, `REPO_ROOT`, `join` — undefined in `ai-path.docker.test.ts`. **Third instance** after 20 and 27 | Reading the file |
| 37 | `ServerDeps.catalogue` has no producer in `api/testing.ts`, and Step 4's acceptance grep would flag a fixture there | `api/testing.ts` returns the `ServerDeps` every API test builds; the grep excludes only `.test.ts` |
| 38 | **Task 6 is the first task to build the LiteLLM client at boot**, and both boot Docker tests start a development control plane with no master key — so the decision Task 9's correction describes lands in Task 6 | `grep LITELLM` in `boot.docker.test.ts` and `identity/saml.docker.test.ts`: nothing; both pass `MANIFEST_ENV: 'development'` |
| 39 | `validationContext` has two call sites, both of which must `await` | `api/routes/projects.ts` lines 112 and 230 |
| 40 | *A note, not a defect:* where `Classification` comes from, given the §5 boundary — it is exported from `spec/index.ts` | `spec/index.ts`'s exports, checked by the script that wrote this |
| 41 | Task 7's tests call `withRollback` with a context it does not pass; the fixture is `withSecretScope` | `db/testing.ts`: `withRollback(fn: (tx: Db) => Promise<void>)`; `secrets/testing.ts`: `withSecretScope(fn: (tx, { projectId, ownerId, keys, masterSecret }) => …)` |
| 42 | Task 7's zero-budget test is in the wrong file, with three undefined helpers; `readFileSync` is not imported | `spec/policy.test.ts` defines `ctx`, `yaml()`, `errorCodes()` |
| 43 | **Revoking a key LiteLLM no longer holds answers 404, and `rotateAppKey` would fail the deploy on it** after minting and storing a live key | `POST /key/delete` for a non-existent key with the master key → `404`, `No keys found`, `type: internal_server_error` |

**Landed as promised:** `SecretScope`'s three fields, and the two `ai.budget` defaults of `0`.

**The decision sitting 4 must make is 38's**, and it is not a routine one to leave implicit: what a development control plane does at boot with no LiteLLM master key. ORIENTATION §7d-2's sitting-4 hand-off states it with the constraints either answer has to meet.

### Sitting 4, Tasks 6 and 7 — the catalogue and the key minter (2026-09-14). 12 findings, and the boot decision.

**Both tasks are done.** `ai/catalogue.ts` reads D17's catalogue from `/model/info` with the master key, projects three fields, refuses an unclassified or empty catalogue, and caches reads but never failures; the model array in `api/routes/projects.ts` is deleted and validation reads `deps.catalogue`. `ai/keys.ts` is the one place a key is minted: `AI_ALLOWED_ROUTES` is a frozen constant, the budget sits on a LiteLLM user created with `auto_create_key: false`, a 409 and a 404 are read by status, and `spec/policy.ts` gains `SPEC_AI_BUDGET_REQUIRED`. Commits `d7a729f` and `b4109df`. Versions: LiteLLM 1.98.0 (`sha256:20b5044b`), Node 24.12.0, pnpm 11.24.0, Docker Engine 29.7.2, macOS 26.6.2.

**Decision 38 — what a development control plane does at boot with no LiteLLM master key.** **An explicit switch.** `MANIFEST_AI_ENABLED=1`, the default, builds the admin client in `src/index.ts`, early and before the driver touches Docker, so a missing key **refuses the boot in development too** with `AI_MASTER_KEY_MISSING` and a message naming both remedies. `MANIFEST_AI_ENABLED=0` builds no client; `disabledCatalogue()` says `enabled: false` and its `get()` **rejects** with `AI_CATALOGUE_DISABLED` rather than resolving to `[]`; the route passes `aiEnabled: false`, a now-required field of `ValidationContext`, and `checkPolicy` refuses a declared model once, at `ai.models`, with `SPEC_AI_DISABLED`, whose hint names the setting. Nothing is fetched at boot, so boot does not depend on LiteLLM answering. The boot line reports `ai`. **Rejected:** (i) *no key in development means AI off* — a second, silent way to switch AI off, which overrides a developer who left the flag at 1 expecting AI; (ii) *the boot tests pass the key and nothing reads the flag* — the flag stays unread and the unit tier has no way to say "off"; (iii) *a disabled catalogue resolves to `[]`* — every declared model then fails `SPEC_MODEL_UNKNOWN` with "Available models: ", blaming the manifest for a platform setting. **Cost of changing course:** the flag is read in one place in `src/index.ts` and checked in `modelPolicy()`; `aiEnabled` is one field. `boot.docker.test.ts` now boots ON with the key and asserts `ai: 'enabled'`; `identity/saml.docker.test.ts` boots OFF. **Task 9 inherits it**: `src/index.ts` already holds `litellm` — the client, or `undefined` when AI is off.

**The finding to read is 48.** To LiteLLM, a key minted with an empty `models` list is not confined to nothing — it reaches every model. Task 9 decides when a key is minted, and must not mint one for an app that declared none; `rotateAppKey` now refuses rather than trusting it to.

| # | Finding | Measured against |
|---|---|---|
| 44 | **Task 6's `toThrow(/AI_CATALOGUE_…/)` assertions are RED against Task 6's own `CatalogueError`**: the code is a property and the message does not contain it. Asserted as `toMatchObject({ code })`; the message stays free of the code because it reaches a client's error envelope beside it | The first run against the plan's constructor: `expected [Function] to throw error matching /AI_CATALOGUE_UNCLASSIFIED/ but got 'the model 'rogue' carries no max_cl…'` |
| 45 | **`POST /projects` creates the project row and the repository before it validates**, so Step 4's awaited catalogue, read where `validationContext` was, turned a gateway failure into a project with no spec whose retry collides with its own slug. `modelPolicy()` is awaited first in both handlers, and the test retries the same slug | Control (e), the read moved back after creation: `expected [ { …(10) } ] to have a length of +0 but got 1` |
| 46 | **Negative control (a)'s second half cannot happen yet.** Nothing reads `kind` until Task 9 — `checkPolicy` uses the name and the classification — so a spec push against an all-`embedding` catalogue still validates; `SPEC_MODEL_UNKNOWN` is what an empty catalogue gives, not a misread `mode` | Control (a): the catalogue test RED, all 16 projects tests GREEN |
| 47 | **Negative control (c) is backwards as worded.** §7 has three classifications — `public` 0, `internal` 1, `confidential` 2 — so defaulting to `'public'` makes D17 *refuse* the confidential app. The fail-open default is the top rank | (c1) `'public'` → `{"valid":false,"codes":["SPEC_MODEL_CLASSIFICATION_TOO_LOW"]}`; (c2) `'confidential'` → `{"valid":true}`; the refusal tests RED in both |
| 48 | **A key minted with `models: []` reaches EVERY model**, not none. `rotateAppKey` refuses an empty list before anything is created, not even the user | A throwaway user and two keys, both with `allowed_routes`: `models: []` → `/v1/models` lists all three and `/v1/embeddings` on `default-embed` → 200; `['default-chat']` → one model listed, embeddings → **403**. Both keys and the user deleted; `/user/info` → 404 |
| 49 | **`make up` does not apply an edit to `infra/litellm/config.yaml`**, which control (b) relied on. The file is a single-file `:ro` bind mount read once at start, and compose sees no service change — the shape the Caddyfile had until `ensure-caddy-config.sh`. `docker restart manifest-litellm` applies it. Named, not fixed | Control (b): `/model/info` unchanged after `make up` (exit 0); `default-chat` → `None` after the restart, ready in **10.1 s** |
| 50 | **Fail-closed has a platform-wide blast radius, named rather than changed.** Validation reads the whole catalogue, so one unclassified entry makes every project creation a 503, with or without AI. Dropping the bad entry instead would report an operator's typo to a faculty member as `SPEC_MODEL_UNKNOWN`, which Decision 3 exists to prevent | Control (b), unit tier against the edited file: **12 of 16** projects tests RED, `expected 503 to be 201` |
| 51 | **A thrown `AiError` or `CatalogueError` left the API as `500 INTERNAL`** — nothing mapped either, so a gateway outage during a spec push told an agent nothing it could correct itself with (D23.7). `api/errors.ts` maps both to **503** with their code and hint; both are built to be shown | Control (h): `expected 500 to be 503` |
| 52 | **Task 7's ordering test cannot see the ordering it is named for.** It asserts the order of admin calls, and storing the key is not an admin call. The committed test reads the secret store at the instant `/key/delete` is sent | The plan's test, verbatim in substance, against the store-after-revoke mutation: **GREEN** (`1 passed`); the committed test against the same mutation: `expected [ 'sk-1' ] to deeply equal [ 'sk-2' ]` |
| 53 | **The plan stores the key as `LLM_API_KEY`; P4a's app secrets use an `app:` namespace** — §8's `SESSION_SECRET` is `app:sessionSecret`. It is `app:llmApiKey`. Nothing else reads the name: `rotateAppKey` returns the key, and the redactor reads values | `secrets/store.ts`'s `SESSION_SECRET_NAME` |
| 54 | **Task 7 had no test that could see the three measured rules it rests on** — `auto_create_key` (19), the 409 (28), the 404 (43) — because every one of them is invisible to a fake. `ai/keys.docker.test.ts` rotates three times against the running gateway and reads it back: one live key, the budget updated to the new value, the first key 401, the third working after the second was deleted by hand, and `/key/generate` refused | Controls (a-live), (b-live), (e-live) below — each RED on the gateway, each leaving **0** `mf-` users |
| 55 | **`/key/delete` accepts the hashed `token` that `/user/info` reports**, which is what lets a teardown remove a key it never saw — the auto-created one in (e-live) | A throwaway user: the 64-character token → `200`, `deleted_keys` 1, 0 keys left; the alias delete afterwards → 404 |

**The eight pre-flight corrections are resolved.** 35: cast `as unknown as LiteLlmClient`. 36: Step 5 uses `litellmUrl()`, `litellmMasterKey()` and `LITELLM_CONFIG`, now exported by `ai/testing.ts` so the path has one producer. 37: **neither offered option** — `declaredCatalogue()` reads `infra/litellm/config.yaml` through the real projection, so `api/testing.ts` names no model and Step 4's grep stays as written and empty. 38: decided, above. 39: `modelPolicy()` awaited in both handlers; `validationContext` stays synchronous. 40: `Classification` from `spec/index.js`. 41: `withSecretScope`. 42: the budget tests are in `spec/policy.test.ts`, and three existing policy tests that declared models with no budget now declare one. 43: a 404 on the revoke is already-revoked.

**Decisions made here, so nobody re-derives them.** The catalogue caches for **60 s** and freezes what it returns. `AI_ALLOWED_ROUTES` is `Object.freeze`d as well as `readonly`. The budget refusal fires with AI switched off too — the manifest is wrong either way — so an app declaring models with no budget under `MANIFEST_AI_ENABLED=0` gets both codes. **Two limits, named:** a `putSecret` failure after a mint leaves one confined key in LiteLLM that nothing records; and a revoke failing with anything but 404 fails the deploy after the new key is stored, leaving the previous key live and no longer named in `secrets`. Both keys are confined to three routes, bound by the user's budget and carry `metadata.manifest_project`, and 55 means they are deletable; reaping them is the reconciler's (Phase 4). **One departure from the plan's order:** Task 7's tests and code were drafted together while Task 6's Docker tier ran, so Step 2's red run is not recorded as a run — instead every test in `keys.test.ts` was watched RED against a mutation of the line it guards.

**Negative controls.** Every edit was applied by a script that refused to run unless its pattern matched exactly once, and restored the file byte-for-byte, checked by hash.

| Control | Result |
|---|---|
| **Task 6** (a) `kind` read as `mode === 'chat'` | **RED** — the projection test; the route stays GREEN (46) |
| (b) `max_classification` deleted from `default-chat`, gateway restarted | **RED** — `the model 'default-chat' carries no max_classification`; also 49, 50. Restored and restarted; `/model/info` back to internal / confidential / internal |
| (c1) default to `'public'` / (c2) to `'confidential'` | **RED** on the refusal tests both times; the confidential manifest REFUSED under c1 and VALIDATES under c2 (47) |
| (e) the read after the project row and repository | **RED** — 45 |
| (f) no `SPEC_AI_DISABLED` guard | **RED** — `expected [ 'SPEC_MODEL_UNKNOWN' ] to deeply equal [ 'SPEC_AI_DISABLED' ]`, hint `Available models: .` |
| (g) the route reads a disabled catalogue | **RED** — `expected 503 to be 201` |
| (h) no 503 branch | **RED** — 51 |
| (i) a failed read left in flight | **RED** — `promise rejected "Error: down" instead of resolving`; the TTL test 1 read, not 2 |
| (j) AI on, no master key, a real development boot | **RED** — exited 1, `AI_MASTER_KEY_MISSING`, the message naming `MANIFEST_AI_ENABLED=0`; no boot line |
| **Task 7** (a) the mint sends `allowed_routes: []` | **RED** — `expected [] to deeply equal [ '/v1/chat/completions', …(2) ]` |
| (a-live) the same, on the gateway | **RED** — `/key/generate` with the app key `expected 200 to be 403`; the child key it minted deleted by alias |
| (b) / (b-live) no `/key/delete` | **RED** — three unit tests; live, the user held **2** keys |
| (c) the key stored after the revoke | **RED** — 52 |
| (d) the budget window `30d` | **RED** — the source test and both budget-body tests |
| (e) / (e-live) no `auto_create_key: false` | **RED** — the `/user/new` body; live, **2** keys, the auto-created one removed by hashed token |
| (f) no 409 handling / (f2) the plan's own `/already exists/` text match | **RED** both — `promise rejected "AiError: The AI service refused this requ…"`: finding 28, reproduced against the plan's code |
| (g) no 404 handling on the revoke | **RED** |
| (h) an empty model list allowed through | **RED** — `promise resolved "'sk-1'" instead of rejecting` |
| (p) no `SPEC_AI_BUDGET_REQUIRED` | **RED** — three policy tests |

**Checked, and unchanged:** the four HTML pages — no status line on them describes anything this sitting changed.

**Gates at the end:** `pnpm test` **579** (60 files, twice), `pnpm test:docker` **126** (24 files, ~417 s), lint / typecheck / `format:check` clean. `make doctor` 18/0 and `make verify` 47/0 at the end of the sitting. `p4b-probe-user` held **0 keys** and LiteLLM **0** `mf-` users. The before/after machine snapshot: differs only in the clock, free disk (150 → 148 GiB), `manifest-caddy`'s uptime — `routes.docker.test.ts` restarts it by design — `manifest-litellm`'s, which control (b) restarted and which came back on its original catalogue, and HEAD; nothing else in the snapshot changed. **Sitting 5 — Tasks 8 and 9 — is next**, and Task 9 carries a correction from this sitting at its top.

### Before sitting 5 — a pre-flight read of Tasks 8 and 9 (2026-09-14). 15 corrections and a note, written at the top of the two tasks.

**No task ran.** The same pattern as the reads before sittings 2, 3 and 4: Tasks 8 and 9 read against the repository as sitting 4 left it, with every claim that could be measured measured. **It was nearly skipped.** Sitting 4 closed out with a hand-off and a correction to Task 9 covering only what sitting 4 had itself changed; Rich asked whether ORIENTATION alone was enough for the next agent, and a two-minute check found Task 9's first test using a fake-driver option that does not exist — which is what prompted this read. Nothing outlived its command: one throwaway Docker network and one container, both removed and checked gone.

| # | Correction | Measured against |
|---|---|---|
| 56 | Task 8's test names the network without `-net`, and there is no unit-tier fake `EngineClient` | `names.ts`: `` `${MF_PREFIX}${slug}-${kind}-net` ``; `networks.test.ts` absent |
| 57 | A required `needsAiGateway` breaks eight `InstanceSpec` construction sites; the *Files* block names three | `grep -rn "healthPath:"` — `release.ts`, `driver-contract.ts`, `sso/testing.ts` and five Docker tests |
| 58 | Task 8's contract-suite assertion cannot observe a network through the `Driver` interface | `driver-contract.ts`'s `spec()`; `DriverCapabilities`; the fake driver's `ensureInstance` |
| 59 | Probe 13's positive control attaches LiteLLM by hand, so control (c) cannot fail | `s6.docker.test.ts`: `attachPlatformNeighbours(engine, APP_NET, ['manifest-litellm'])` in probe 13 |
| 60 | Control (a)'s `make down` stops the platform; a stopped container keeps a connection it was refused | A throwaway `--internal` network and a created, never-started `alpine:3.22`: `network connect` → ok; the network's `Containers` → empty; the container's own `Networks` → lists it. Both removed |
| 61 | `make reset` never calls `destroyAppNetwork`, which has no production caller | `Makefile` `reset`: disconnects whatever `docker network inspect` lists; callers of `destroyAppNetwork` are three Docker tests |
| 62 | `pnpm test:docker -- s6` runs the whole tier; "14 probes" undercounts the file | Finding 34; `s6.docker.test.ts`'s lettered probes 5b, 7b, 10b |
| 63 | `ResolvedConfig.ai` already exists, snake_case, and is frozen into every release since P4a Task 10 | `spec/resolve.ts`: `ai: ManifestSpec['ai']`, `ai: { models: [...], budget: { ...spec.ai.budget } }` |
| 64 | A release frozen before P4a Task 10 has no `ai`; `resolved.ai.models` throws on its redeploy | `spec/injection.ts`: `resolved.ai?.models ?? []`, and its comment saying why |
| 65 | `InjectionVariable.when` is a closed union that refuses Step 3's new values | `spec/injection.ts`'s `InjectionVariable`; `injection-drift.test.ts` does not read `when` |
| 66 | Two existing tests assert the code Step 3 deletes; `aiContext`/`baseContext` do not exist | `spec/injection.test.ts`: both `INJECTION_AI_UNSUPPORTED` tests; helpers `ctx`, `withModels` |
| 67 | `createFakeDriver({ onEnsureInstance })` does not exist | `runtime/fake-driver.ts`: `FakeDriverOptions { failInstances?, capabilities? }`; the wrap pattern in `releases.test.ts` |
| 68 | `deployRelease` takes `DeployDeps`, built by hand in three places; `ServerDeps.ai` never reaches it | `api/routes/delivery.ts`'s `deployRelease` call; `releases.test.ts`'s `deployDeps`; `deploy-sso.docker.test.ts` |
| 69 | No app declaring models can be built through the route before Task 10 | `blueprints/compatibility.ts` (`BLUEPRINT_AI_UNSUPPORTED`), called only from `delivery.ts`; both blueprints `provides.ai: false`; `startBuild` does not check |
| 70 | Both Step 5 greps fail their expectation today | Run 2026-09-14: grep 1 → `api/routes/projects.ts:48`; `release.ts`-only form → empty; grep 2 → `ai/keys.ts` ×2 and `config.ts:191`; `-w` form → `injection.ts` and `config.ts:191` |
| 71 | *A note:* the previous key is revoked before the new container is routed | `rotateAppKey` (one call: mint, store, revoke); `DockerDriver.ensureInstance`: pull, create, `applyRoute`, then `waitForReady` |

**The decision sitting 5 must make:** sitting 4's — a release that declares models, redeployed with AI switched off. **71 was decided the same day, by Rich** — below.

**Decided after the read (Rich, 2026-09-14): no live AI call may fail because a deploy revoked its key, and redeploys are to become zero-downtime for the whole app — in a plan of their own, later.** He was offered three scopes: the whole app now, AI calls only, or the whole app later with Task 9 fixed meanwhile, and chose the last; he then approved the interim that is now at the top of Task 9. Deciding it measured one fact and found four more:

| # | Finding | Measured against |
|---|---|---|
| 72 | **A redeploy of the SAME release reuses its container unchanged, environment included**, so rotating on every deploy would revoke the key a running container holds and never give it the new one | `runtime/docker/instances.ts`'s `ensureInstanceContainer`: an existing container is started and returned; nothing is recreated |
| 73 | **The fake driver and the Docker driver disagree about that reuse** — the fake replaces the spec — and no contract test sees it | `runtime/fake-driver.ts`: `existing.spec = spec`; `driver-contract.ts`'s idempotency test passes the same `spec()` twice |
| 74 | **Every redeploy is a window of 502s for the whole app, not only for AI.** The driver moves the edge route to the new container before it answers, and `applyRoute` deletes the route before re-adding it | `DockerDriver.ensureInstance`: `applyRoute`, then `waitForReady`; `routing/routes.ts`: `deleteRoute`, then `putRoute` |
| 75 | **Retiring an old instance through `destroyInstance` would take the live app offline**: the route is removed by hostname, and the new instance shares it | `DockerDriver.destroyInstance`: `removeRoute(options.routing, options.hostnameFor(kind, slug), kind)`; `routeIdFor(hostname)` |

**The measurement.** LiteLLM 1.98.0 checks a key when a request starts. A throwaway key confined to `default-chat` was deleted **6.98 s** into a streaming completion; the stream ran on to `finish_reason: length` at **24.2 s**, with **961 of its 1,003 content characters after the delete**, and a new request with the deleted key answered **401**. The user and key were deleted; `/user/info` → 404.

**Where each half lives.** The interim is at the top of Task 9. Findings 74 and 75, with the measurement, are the inputs to the zero-downtime plan, recorded in the roadmap and in ORIENTATION §8; where it goes in the order is Rich's.

### After sitting 4 — two §7 spec actions settled (Rich, 2026-09-14)

**Applied to the spec the same day, in one commit.** Rich asked for each held §7 action as a question with options and a recommendation; the D17 action held two decisions, so there were three:

| Question | Options offered | Rich's answer |
|---|---|---|
| A catalogue entry with no valid `max_classification` | refuse only that model *(recommended)*; refuse the whole catalogue, as Task 6 built; treat it as public-only | **refuse only that model** |
| How much of the catalogue read §7 records | the design facts *(recommended)*; the requirement only; nothing | **the design facts** — `/model/info` with the master key, no classification on `/v1/models`, `mode: null` for a chat entry on 1.98.0 |
| A declared model with a zero project budget | refuse at validation, as Task 7 built *(recommended)*; default it; allow it with a warning | **default it** — to the project's AI quota |

**Two calls sitting 4 made in writing the answers into §7, flagged to Rich:** an explicit `0` is still refused, so only an **omitted** budget is defaulted; and the default is applied by validation, so the stored spec and every release frozen from it carry a concrete number. **And one it recommends in the plan rather than the spec:** read the catalogue only for a spec that declares models, since otherwise a gateway outage still refuses apps that declare none. All of it is the *SPEC DECISIONS* block at the top of Task 9. The spec commit is `d337c8a`; `manifest-decisions.html`'s D17 card was checked and still holds — it states the decision, not these mechanics.

### Sitting 5, Tasks 8 and 9 — the gateway on the network, and the key a deploy mints (2026-09-14). 11 findings, and the decision the hand-off named.

**Both tasks are done, in five commits.** Task 8: `InstanceSpec.needsAiGateway` is required, the Docker driver attaches `manifest-litellm` to an app's network only when it is true, S6 probe 13's positive control goes through `ensureInstance`, and `destroyAppNetwork` disconnects what the network lists and sweeps every platform neighbour (`118c08f`). Task 9, in four parts so a session limit could not land inside it: the key split into `mintAppKey`, `commitAppKey` and `discardAppKey` (`80fd25e`); the Docker driver replacing a container whose environment changed (`a2a6df7`); §7 as amended — an unclassified model refuses only itself, the catalogue is read only for a manifest that declares a model, and an omitted budget is the project's quota (`0eff443`); and §8's AI rows, rendered from the key `deployRelease` mints before the instance starts and commits only after health (`88906bf`). Versions: LiteLLM 1.98.0 (`sha256:20b5044b`), Node 24.12.0, pnpm 11.24.0, Docker Engine 29.7.2, macOS 26.6.2.

**What is still not proved end to end:** no app that declares models has been deployed through the real driver. Both blueprints still say `provides.ai: false` until Task 10, so the build route refuses `ai.models` (pre-flight 69); Task 8's flag is proved at the driver, Task 9's key at the unit tier and against the live gateway, and the whole path is Task 16's.

**The decision the hand-off named — what `deployRelease` does with a release that declares models when AI is switched off.** **Refused, before the instance row, the services or the Service Provider exist, with `RELEASE_AI_DISABLED`, whose message names `MANIFEST_AI_ENABLED=0`.** The setting is read TWICE, independently — `deps.catalogue.enabled` and the new `deps.ai.enabled` — and one test switches off each half alone. Behind that, `disabledAiKeyService()` refuses every step naming the setting, so a guard removed by mistake fails loudly rather than as a `TypeError` or an app rendered with an empty `LLM_API_KEY`; control (f) watched that backstop catch it. **Rejected:** (i) *deploy with the AI rows left out* — the app starts healthy and fails its first question, the "rendered empty" failure §8's refusal exists for; (ii) *refuse only at render* — `INJECTION_AI_KEY_MISSING` would fire after the services, the SP and the instance row existed; (iii) *one read of the setting* — the shape of P2's `devAuthEnabled: true`. **Cost of changing course:** one function, `modelsForDeploy`, and one field on `AiKeyService`.

**Decisions made here, so nobody re-derives them.**

| Decision | Why, and what was rejected |
|---|---|
| **Task 9 committed in four parts** — the key split, the container replacement, §7's two decisions, then the wiring | Rich's *DECIDED* and *SPEC DECISIONS* blocks made Task 9 three tasks' worth; each part has its own gates, controls and commit, so a session limit could not land inside it |
| **`deployRelease` re-reads the catalogue at deploy** and refuses `RELEASE_MODEL_NOT_IN_CATALOGUE`, `RELEASE_MODEL_UNCLASSIFIED`, `RELEASE_MODEL_CLASSIFICATION_TOO_LOW` and `RELEASE_AI_BUDGET_MISSING`, all before anything is written or minted | The catalogue can move between validation and deploy, and a release is redeployable long after. The classification re-check is this sitting's addition: a model whose approval was LOWERED since validation would otherwise be handed data above it through a redeploy — §7's "privacy incident at runtime" |
| **The key is committed AFTER the row records `healthy`**; a commit that fails surfaces its error and discards nothing | Before the row, a failed commit would park the instance in `provisioning`, which nothing moves. Discarding would take down the key the healthy instance holds |
| **A discard that fails is printed to stderr without the key, and the deploy's own error is what the caller gets** | Rich's block: a discard failure must not mask the deploy's. The leftover key is confined, budgeted, tagged and deletable (55); named in *What this plan does not build* |
| **`renderInjection` refuses three shapes, not one**: models with no key or an empty one (`INJECTION_AI_KEY_MISSING`), a key for an app with no models (`INJECTION_AI_UNEXPECTED`), and a model name the release did not declare (`INJECTION_AI_MODEL_UNDECLARED`) | The same pair P4a wrote for `spEntity`. The key is minted for the declared models only, so any other name is a 403 on the app's first question |
| **The environment hash covers the whole `Env` the container is created with** — the rendered variables and the proxy's — sorted, as the `manifest.env-sha256` label | Order is not a change: a spurious replacement restarts a container for nothing. A container created before the label has no hash and is replaced once, on its next ensure |
| **An omitted budget is filled only for a manifest that declares a model**; an app with none keeps no budget at all | §7 defaults a budget where it means something. Filling 0 everywhere would invent a number for apps that are never minted a key |
| **The route decides whether to read the catalogue with `declaresModels(yamlText)`**, a yes-or-no predicate exported from `spec/` | `validateSpec` is synchronous and stays the one parse whose result is stored; making it async to take a catalogue provider would have changed every caller for one boolean |
| **An unclassified catalogue entry is reported on stderr** | Nothing fails any more, so without it an administrator's typo is visible only to the faculty member whose manifest names that model |
| **`destroyAppNetwork` sweeps every platform neighbour as well as what the network lists** | 77 and 78 below |
| **`releases/deploy-sso.docker.test.ts` runs with AI switched off** (`disabledAiKeyService()`, `disabledCatalogue()`) | That app declares no model, and a fake key service in a Docker test would be the one place AI "works" without a gateway |

**The finding to read is 86**, because it is a gateway fact every future operator can hit: an empty `model_info:` in `infra/litellm/config.yaml` does not refuse one model — it stops LiteLLM starting, for every app.

| # | Finding | Measured against |
|---|---|---|
| 76 | **Task 8's teardown test passed against the list-driven `destroyAppNetwork`**: it attached the gateway through the extras it was not testing, so with no attach there was nothing to tear down. Rewritten to attach by hand | First run against the old code: 3 attach tests RED, the destroy test GREEN; after the rewrite, control (b-unit) RED |
| 77 | **A network removed under a STOPPED container leaves that container unable to start.** The read-back lists running containers only, so a read-back-only teardown run while `manifest-litellm` is stopped strands it. `destroyAppNetwork` also sweeps `PLATFORM_NEIGHBOURS` and `AI_GATEWAY_NEIGHBOUR` | A throwaway `--internal` network and a created, never-started `alpine:3.22`: connect → 0; the network lists 0 containers; `network rm` → 0; `docker start` → 1, `failed to set up container networking: network mf-p4b-probe-net not found`. Removed |
| 78 | **A force-disconnect of a stopped container works, and disconnecting one that is not attached answers `is not connected to the network`** — the two facts the sweep rests on | The same shape: force-disconnect → 0, the container then starts → 0; a disconnect from a network it never joined → 1, `container … is not connected to the network`. Removed |
| 79 | **Negative control (a), live, as worded, would have stranded `manifest-litellm`** (60 + 77). Run after the sweep existed, it showed the sweep working live | `always-attach` with the gateway stopped: `PLATFORM_NEIGHBOUR_NOT_ATTACHED … missing manifest-litellm`, 8 skipped; the stopped gateway's networks afterwards: `manifest-platform` only; restarted healthy in ~12 s |
| 80 | **`ensureAppNetwork` adds and never removes**, so an app that stops declaring models keeps its route to the gateway, and its last key stays live. Named, not built — detaching mid-deploy would cut off the previous release's still-running container. P4c's retire step | The code; *What this plan does not build* |
| 81 | **Two Bash tool calls issued together share one shell's working directory**: a `cd` in one moved the other mid-command. The insertion loop's match-count guard refused all seven files, and nothing was written | The loop's output: `REFUSED … : 0 matches`, seven times; `git diff --stat` unchanged |
| 82 | **Rich's block specifies a commit as "store it, then revoke the previous key"** — which, for a commit repeated with the same key (a retry), revokes the key the healthy instance was just given. `commitAppKey` never revokes the key it commits | Control `revoke-own-key`: `never revokes the key it is committing` RED |
| 83 | **The plan's loopback-endpoint test sat on `renderInjection`, which only echoes its context**, so control (b) — `config.litellm.url` injected in `deployRelease` — could not turn it red. Moved to `releases.test.ts` | Control `loopback-endpoint`: `expected 'http://127.0.0.1:7106' to be 'http://manifest-litellm:4000/v1'` |
| 84 | **Finding 45's test — a catalogue outage refuses project creation and leaves nothing — can no longer run**: creation never reads the catalogue, because the manifest it seeds declares no model. Deleted; its property is kept on the spec push, where a 503 stores no spec row | Control `route-reads-always`: both outage tests `expected 503 to be 201` |
| 85 | **The API test for a stored default budget built its manifest by dropping lines containing `budget`**, which left `project_monthly_usd: 10` behind. Caught by the test's own precondition, before it could pass for the wrong reason | First run: `expected 'manifest: 1…' not to contain 'project_monthly_usd'` |
| 86 | **Deleting the only key under `model_info:` stops LiteLLM 1.98.0 starting.** The mapping becomes null, the proxy exits on start, and Docker restarts it every ~10 s — the gateway is down for every app. §7's "an unclassified model refuses only itself" holds for a `model_info` that is still a mapping. The first run of the live control was RED because the gateway was dead, not because of the classification, and was re-run with an invalid value instead | `docker logs -t manifest-litellm`: `TypeError: argument of type 'NoneType' is not iterable`, `Application startup failed. Exiting.` at 02:17:29, :40 and :50; health `starting` for 120 s; restored file → healthy in ~12 s |

**The fifteen pre-flight corrections are resolved.** 56: `appNetwork()`, and a local fake `EngineClient` that reads back. 57: `needsAiGateway` required, at all eight sites. 58: no contract assertion; the Docker tier asserts it. 59: probe 13's positive control re-ensures the instance through the driver, and control (c) is live. 60: `docker stop`, and the stopped container's connection is swept (77). 61: `destroyAppNetwork`'s control is a Docker test. 62: the one-file command. 63: `resolve.ts` unchanged; snake_case read — **and its frozen shape was NOT asserted at close-out, though 63 said to.** A re-read after the sweep found it: `deployRelease` mints from `resolved.ai.models` and `resolved.ai.budget.project_monthly_usd`, every `releases.test.ts` config is built by hand, so a rename in `resolveConfig` would have left every test green while every deploy minted a key with no budget. Two tests now pin it in `spec/resolve.test.ts` — the snake_case budget, filled from the quota, in every environment, and a copy rather than the spec's own arrays — RED under a camelCase rename and under shared arrays. 64: `resolved.ai?.models ?? []`, with a test. 65: `when` extended. 66: both tests rewritten for `INJECTION_AI_KEY_MISSING`. 67: the driver wrapped. 68: `DeployDeps` gains `ai` and `catalogue` at all three sites. 69: recorded — `roundtrip.docker.test.ts` proves the no-AI path only. 70: both greps rewritten and run (below). 71: decided by Rich and built.

**Step 5's acceptance, run.** `grep -n 'mintAppKey\|commitAppKey\|discardAppKey\|catalogue\.\(enabled\|get\)\|needsAiGateway' releases/release.ts` → lines 389, 462, 504, 533, 550 — every name — and `discardAppKey` at 601. `grep -rnw 'LLM_ENDPOINT\|LLM_API_KEY\|LLM_DEFAULT_MODEL'` outside tests → every non-comment line in `spec/injection.ts`; the other four hits (`config.ts:191`, `release.ts:528`, `instances.ts:120`, `keys.ts:232`) are comments. The deps: `src/index.ts:177–178` builds `ai`, `api/routes/delivery.ts:233–234` passes it.
**Negative controls.** Every mutation was applied by a script that refused unless its pattern matched exactly once, and restored the file byte-for-byte, checked by sha256.

| Control | Result |
|---|---|
| **Task 8** — `ensureAppNetwork` ignores its extras | **RED** — the three attach tests |
| (b, unit) `destroyAppNetwork` restored to its fixed list | **RED** — the teardown test, once 76 was fixed |
| the teardown sweeps no stopped neighbour | **RED** — `expected [ Array(1) ] to deeply equal []`: a stranded gateway |
| (b, live) the fixed list, on the daemon | **RED** — `403 … has active endpoints (name:"manifest-litellm")`; the network it left was removed by the restored run |
| (c) the driver never asks for the gateway | **RED** — probe 13 `expected [ 'manifest-dns-containers', …(4) ] to include 'manifest-litellm'`, and probe 14 with no route |
| (a, live) the gateway on EVERY network, with `manifest-litellm` stopped | **RED** — `PLATFORM_NEIGHBOUR_NOT_ATTACHED … missing manifest-litellm`, 8 skipped; 79 |
| **Task 9, the key split** — the commit revokes before it stores | **RED** — 2 tests |
| the commit revokes the key it is committing | **RED** — 82 |
| the commit never revokes the previous key | **RED** — 3 unit tests; live, `expected [ … ] to have a length of 1 but got 2` |
| discarding does nothing | **RED** — 3 unit tests; live, `expected 200 to be 401` |
| **Task 9, the container** — reuse on the name alone (finding 72 restored) | **RED** — the Docker test: a changed environment kept the same container id |
| the hash depends on the order of the environment | **RED** — the unit test |
| the hash never written as a label | **RED** — the Docker test: the wake path got a new container |
| **Task 9, §7** — an unclassified entry refuses the whole catalogue again | **RED** — both exclusion tests |
| policy ignores the unclassified list | **RED** — `expected [ 'SPEC_MODEL_UNKNOWN' ] to deeply equal [ 'SPEC_MODEL_UNCLASSIFIED' ]`, at the unit tier and the route |
| the route reads the catalogue for every manifest | **RED** — both outage tests, `expected 503 to be 201` |
| `validateSpec` fills no budget | **RED** — 3 tests: `expected a valid spec, got SPEC_AI_BUDGET_REQUIRED` |
| the schema's `.default(0)` restored | **RED** — 4 tests, including `invents no budget …`: `expected +0 to be undefined` |
| a budget written as 0 accepted | **RED** — 3 tests |
| (Task 6's b, re-expected) `default-chat`'s classification deleted | **INVALID** — the gateway would not start (86); every live test failed for that reason |
| the same, with the classification made invalid (`confidental`) | **RED** — the gateway healthy in ~12 s reporting `default-chat confidental`; live, `expected [ 'default-chat' ] to deeply equal []`; at the unit tier, the same manifest `SPEC_MODEL_UNCLASSIFIED` where `SPEC_MODEL_CLASSIFICATION_TOO_LOW` was expected. Restored by hash, restarted, back to internal / confidential / internal, 6 of 6 GREEN |
| **Task 9, the wiring** — (a) committed straight after the mint, the old rotation's order | **RED** — 4 tests: `expected [ 'mint', 'commit sk-minted-1', … ]` |
| (a) no mint at all | **RED** — 5 tests: `INJECTION_AI_KEY_MISSING` |
| committed when health failed | **RED** — the discard test |
| no discard when the instance throws | **RED** — 2 tests, one `expected '' to contain 'could not be discarded'` |
| a failing discard replaces the deploy's error | **RED** — `… but got 'the gateway is down'` |
| (b) the control plane's loopback URL handed to the app | **RED** — 83 |
| AI switched off read once, from the catalogue | **RED** — and caught by the key service's own backstop: `expected Error: AI is switched off … to be an instance of ReleaseError` |
| the chat model taken by position, not by kind | **RED** — `expected 'default-embed' to be 'default-chat'` |
| no classification re-check at deploy | **RED** — `promise resolved … instead of rejecting` |
| the gateway never asked for | **RED** — `expected false to be true` |
| (d) P4a's `INJECTION_AI_UNSUPPORTED` kept | **RED** — 5 tests: every AI deploy throws at render |
| (c) `LLM_DEFAULT_MODEL` rendered empty | **RED** — `… to not have property "LLM_DEFAULT_MODEL"` |

**Checked, and unchanged:** the four HTML pages — no status line on them describes anything this sitting changed, and `manifest-decisions.html`'s D17 card states the decision rather than the deploy-time re-check.

**Gates at the end:** `pnpm test` **619** (61 files, twice), `pnpm test:docker` **128 (24 files, ~407 s)**, lint / typecheck / `format:check` clean, `make doctor` **18/0** and `make verify` **47/0**. LiteLLM: `p4b-probe-user` holds **0 keys** and there are **0** `mf-` users. The before/after machine snapshot differs only in the clock, free disk (148 → 146 GiB), container uptimes — `manifest-caddy`, which `routes.docker.test.ts` restarts by design, and `manifest-litellm`, which this sitting's controls restarted and which came back on its original catalogue — and HEAD. **Getting there meant removing four images the Docker tier had pulled into the daemon, by digest:** `local/blueprint-ntm` (`fa98a221`), `local/chem-labs` (`916658eb`), and two that each carried TWO names — `local/fixture-s6` and `local/fixture-rt` (`1de8cb60`), `local/saml-unsigned` and `local/saml-probe` (`ace665c1`), where removing one name only moves the diff to the other. Check that a digest is absent from the starting snapshot under EVERY name before deleting it. **Sitting 6 — Task 10 — is next, and it needs the network on**; it carries four corrections from this sitting at its top.

### Sitting 6, Task 10 — the blueprint's AI half (2026-09-14). 14 findings, and a mirror warm that had never worked on this machine.

**Task 10 is done, in two commits** — the seed fix (`229345b`), then the task (`db9c6a1`). `node-ts-mongo@1` says `provides.ai: true` and pins `ubc-genai-toolkit-llm@0.7.0` — the version the control plane's devDependency pins, and a test holds the two equal. `skeleton/ai/llm.js` exports `ask`, `askStreaming`, `embed`, `configureAi` and `AI_ENABLED`, and re-exports `endUserId` from `skeleton/ai/end-user.js`; `server.js` imports the component for every app, configures it at startup when the platform injected AI rows, and reports `ai` on `/`. The skeleton's lockfile gained 35 entries and changed none; every `resolved` URL still names registry.npmjs.org. The knowledge pack has an AI section. `infra/seed/seed.sh`'s warm step uses an empty npm cache. Versions: the toolkit 0.7.0, `openai` 4.104.0, `@anthropic-ai/sdk` 0.95.2, `ollama` 0.5.18, `zod` 3.25.76; Node 24.12.0 and npm 11.6.2 on the host, Node 22.23.2 and npm 10.9.8 in `node:22-alpine`; LiteLLM 1.98.0 (`sha256:20b5044b`), Docker Engine 29.7.2, macOS 26.6.2.

**What is proved, and at which tier.** *On the wire, against the real toolkit:* `blueprints/ai-component.test.ts` runs the component in a child `node` process against a fake OpenAI-compatible gateway that answers embeddings the way LiteLLM's Ollama path does, and asserts the request BODIES — `user` is §10's namespaced id, `encoding_format` is `float`, the key and the model are the injected ones — and the shapes that come back, with a positive control proving the same fake hands 192 dimensions to the toolkit called without the option. *In the Docker tier:* `node-ts-mongo.docker.test.ts` built the skeleton with the toolkit through §12's gates — `npm ci` from the mirror inside the egress-free builder, then the scan gate — in 17 s, and the deployed container answered `/` with `ai: false`. `server.js` imports the component statically, so that answer is the evidence the toolkit links on the image's Node 22 from the mirror's closure. **Still not proved:** a live AI call from a deployed app — Task 16's.

**Decisions made here, so nobody re-derives them.**

| Decision | Why, and what was rejected |
|---|---|
| **`server.js` imports `ai/llm.js` for every app** and calls `configureAi()` at startup when `LLM_API_KEY` was injected; `/` reports `ai` | A component nothing imports cannot be seen to load — a link error in the image would first surface at Task 16's first question. *Rejected:* leaving it unimported (the call-site defect), and configuring at import (it would crash every app that declared no models) |
| **One client per model kind** | The toolkit's OpenAI provider refuses to construct without a default model (90), and §8 leaves `LLM_DEFAULT_MODEL` absent for an embeddings-only app. The embeddings client's default model is the embedding model — never a chat model guessed for the app — and it is where `EMBEDDINGS_PROVIDER` is read (89) |
| **`endUserId` in its own module**, `ai/end-user.js`, re-exported by `llm.js`, byte-identical to `fixtures/proof-app/identity.js` including its refusal of a partial namespace | Importable and testable without loading three SDKs — `identity.js` is separate for the same reason. Two producers until Task 16 makes the proof app import it; `proof-app-identity.test.ts` holds them to each other over every input that varies, and to the formula written out |
| **The wire test is a child `node` process**, not an import into Vitest | Vitest could neither mock nor load the CommonJS toolkit from app-side ESM (93). The child loads it exactly as the container does |
| **The source obligations are checked by PARSING the skeleton** with the `typescript` compiler API: every `.embed(` call carries `encoding_format: 'float'` and every chat call a `user: endUserId(…)`, in every `.js` file | The plan's regex counts pass against a comment (92); the parse reads each call's own arguments |
| **`make seed` was not completed; seed's warm step was run on its own**, extracted verbatim from `seed.sh` by `sed` | Step 2 failed twice on a Docker Desktop fault unrelated to this task (95), and every platform image already existed. `make verify`'s mirror check is what said the warm worked |
| **Seed's warm passes `--cache "$tmp/.npm-cache"`** — an empty cache per lockfile, deleted with its temp directory | 96: without it the warm is inert on any machine that has installed a package before |

| # | Finding | Measured against |
|---|---|---|
| 87 | **Correction 4 names the wrong test.** `roundtrip.docker.test.ts` builds `fixture-node@1` and never touches this blueprint; the build of `node-ts-mongo@1`'s skeleton is `node-ts-mongo.docker.test.ts` | `roundtrip.docker.test.ts:171`: `blueprintRef: 'fixture-node@1'` |
| 88 | **Step 4's `required(name)` reads `process.env[name]`**, the form §16's drift tier deliberately does not match — so all six AI rows read as injected and unread | The drift test's first red run with `fullContext()` declaring both kinds: `LLM_PROVIDER, LLM_ENDPOINT, LLM_API_KEY, LLM_DEFAULT_MODEL, EMBEDDINGS_PROVIDER, EMBEDDINGS_MODEL`; control (e) |
| 89 | **Step 4 never reads `EMBEDDINGS_PROVIDER` at all** — a §8 row rendered and read by nothing, which the drift tier's second direction exists to catch | The step's code; the same red run |
| 90 | **The toolkit's OpenAI provider refuses to construct without a default model**, so correction 1's conditional read is not enough: no single `LLMModule` can serve an embeddings-only app | `llm-module.js`: `ConfigurationError('defaultModel is required for OpenAI provider')`; control (f) |
| 91 | **Step 4's `endUserId` hashes `undefined undefined` when the namespace is missing** — a stable, wrong key shared across environments — where the proof app's refuses | The step's code against `fixtures/proof-app/identity.js`; control (b) |
| 92 | **Both of Step 1's source tests pass against a comment.** With the option stripped from `embed()` and a comment quoting it, the regex counts come out one call and one literal; the namespacing test matches the two names wherever they appear | A string computation over `llm.js`: `[1, 1]`, the plan form passes; control (a2) against the parse → RED |
| 93 | **Vitest can neither mock nor load the CommonJS toolkit imported by app-side ESM outside the package**: `vi.mock` was not applied and the package loaded under the wrong path | A throwaway probe: `Cannot find module './types'`, require stack `…/manifest/ubc-genai-toolkit-llm`. Deleted |
| 94 | **Step 1 names `BLUEPRINTS_ROOT` and `pathOf`, which `blueprints.test.ts` does not have, and Step 3's YAML pins `express` 4.21.2 and `express-session` 1.18.1**, which P4a replaced with 4.22.2 and 1.19.0 — followed literally, Step 3 reddens *agrees with its own skeleton package.json* | The test file; `blueprint.yaml` |
| 95 | **`make seed` failed at step 2, twice: `docker-credential-desktop get` hangs, so BuildKit's metadata lookups for Docker Hub tags die with `DeadlineExceeded`** — before step 4b's npm warm, which needs no Docker Hub. Each hung call leaves a helper process parented to launchd. **Cleared the same evening by Rich restarting Docker Desktop** — the helper then answered in under a second and the lookup in 1 s; RUNBOOK's *Known gaps* | `load metadata for docker.io/library/php:8.3-apache … context deadline exceeded`, and `caddy:2.11.4`, `composer:2`; curl to Docker Hub 0.3 s from the host and the VM with 100 of 100 pulls left; the helper under `gtimeout 20` → 124; five leftover processes from this session's commands, killed and checked gone |
| 96 | **Seed's warm was inert for any package already in the developer's npm cache** — npm takes the tarball out of `~/.npm` by integrity and never asks Verdaccio — and it printed no `WARN` and exited 0. **Fixed.** Step 6's remedy, re-seeding, would have repeated the inert warm | `npm --loglevel http`: 135 of 135 `(cache hit)`, zero fetches; storage 117 `.tgz` before and after; `make verify` MISSING for every new entry. With `--cache`: 4 s, 152 `.tgz`, `245 pinned tarballs … 0 missing`, 47/0 |
| 97 | **Control (d) says `checkBlueprintCompatibility` refuses "at validation"**; it runs at the build route, `api/routes/delivery.ts` (P2 Task 19) | The function's callers |
| 98 | **zsh expands a word beginning with `=`**: `echo =====` failed with `==== not found` and abandoned the rest of every command it was in | The tool output; ORIENTATION §4 |
| 99 | **A background command reports its LAST command's exit status**: seed's wrapper ended `echo "exit=$?"`, so the harness said *completed, exit 0* for a run whose log said `exit=2` | The notification against the log; §4 |
| 100 | **`grep` in the agent's shell is a `ugrep`-backed function that reads `$` as an anchor**, so a guard counted 0 matches for a line that was there, and its `&&` silently skipped the warm it guarded | `grep -c -- '--cache "$tmp/.npm-cache"'` → 0 against `seed.sh:69`; `grep -cF` → 1; `type grep`; §4 |

**Negative controls.** Every mutation was applied by a script that refused unless its pattern matched exactly once, and restored the file byte-for-byte, checked by sha256.

| Control | Result |
|---|---|
| (a) `embed()` without `encoding_format` | **RED** — the parse, and on the wire `expected 192 to be 768` in two tests: S3's silent failure itself, at the unit tier |
| (a2) the same, with a comment quoting the option | **RED** — the same three tests; the plan's regex form would have passed (92) |
| (b) `endUserId` hashes the PUID alone | **RED** — the agreement test (`stu000001 proof-app sandbox: expected 'd7197d4a…' to be 'ce0cd9ee…'`), and the `user` on both chat paths |
| (b2) `ask()` passes the raw PUID | **RED** — the parse and the wire |
| (c) `# syntax=docker/dockerfile:1` prepended to `Dockerfile.tmpl` | **RED** — `context.test.ts`'s two node-ts-mongo tests, `BuildContextError: the blueprint Dock…`: refused by name before any build |
| (d) `provides.ai` back to `false` | **RED** — both descriptor tests; the build route's check refuses `ai.models` again |
| (e) one AI row read through a computed name | **RED** — the drift tier: `… reads none of them: LLM_API_KEY` |
| (f) `LLM_DEFAULT_MODEL` read as required | **RED** — the embeddings-only app: `LLM_DEFAULT_MODEL is required and was…` |
| seed's warm with no empty cache | **RED** — observed before the fix: 0 of 35 new tarballs, `make verify` FAIL. With it, 35 of 35 and 47/0 |
| **UNPAIRED:** `configureAi()` removed from `server.js`'s startup | Not run as a mutation: the only test that boots `server.js` injects no AI rows, so the line is never reached. Task 16's first AI deploy is its first observer |
| **NOT RUN:** (a)'s live half — deploy, then call it | Task 16's. S3 measured it live, and (a) shows the same 192 against a fake of LiteLLM's Ollama path |

**Checked, and unchanged:** the four HTML pages — `manifest-phases.html` still says "the AI half is what remains", which stays true until Task 16. **Not measured:** whether a NAMED import of the toolkit works on Node 22 — a probe through a symlink inside a Docker Desktop bind mount could not resolve the package — so the component uses the default import, `auth/ubcshib.js`'s pattern, which the Docker tier proved.

**Gates at the end:** `pnpm test` **632** (62 files, twice), `pnpm test:docker` **128** (24 files, ~415 s), lint / typecheck / `format:check` clean, `make doctor` **18/0** and `make verify` **47/0** — 245 pinned tarballs, 0 missing. **The first full run was 127 of 128, and it is recorded rather than re-run away.** `driver.docker.test.ts`'s *builds the same source to the same digest* timed out: one `fixture-node@1` build stalled for about eight minutes — the test ran 509 s against its 120 s limit, and the tier took 1,000 s against its usual ~407. Nothing was left behind, `make doctor` called the scanner database fresh, the Docker VM had 779 GB free, and the same file alone passed in 93 s with that test at 27 s; the second full run passed it at 28 s. No cause was found, and nothing this sitting changed reaches that fixture. **The machine at the end** differs from its start-of-session snapshot in the clock, free disk (146 → 144 GiB: the mirror's 35 new tarballs and the build cache), container uptimes (`manifest-caddy`, which `routes.docker.test.ts` restarts by design) and HEAD — **and in two image tags that cannot be put back.** The failed `make seed`'s step 2 rebuilt `manifest-dnsmasq:local` and `manifest-egress:local` before it died, so both tags now name rebuilds of the same Dockerfiles (`6e88ee08`, `d9e478b6`); the images they replaced are gone from the store, the running containers are untouched (the egress container already ran an image older than its tag before this session), and `compose up --dry-run` recreates nothing. The Docker tier's four images were removed by digest, including the second names `fixture-rt` and `saml-probe` that share two of them. LiteLLM: `p4b-probe-user` holds **0 keys** and there are **0** `mf-` users. **Sitting 7 — Tasks 11 and 12 — is next, and it needs no network.**

### Before sitting 7 — a pre-flight read of Tasks 11 and 12 (2026-09-14). 18 corrections, written at the top of the two tasks.

**No task ran.** The same pattern as the reads before sittings 2 to 5, done the same evening sitting 6 closed, at Rich's request, after he restarted Docker Desktop and the hung credential helper was measured cleared. Tasks 11 and 12 were read against the repository as sitting 6 left it (`40e25ad`), and every claim that could be measured was: Task 12's rules were run exactly as printed — against its own tests, its predicted controls, sitting 6's real BuildKit logs and the values SSO registration persists. Nothing was created on the platform; the only files touched were throwaway scripts in the session scratchpad.

| # | Correction | Measured against |
|---|---|---|
| 101 | Task 11's migration names applied migration 0002; a new one is 0005 and drizzle-kit names it | `drizzle/` and `_journal.json` (0000–0004); `0004_true_titania.sql` |
| 102 | `withRollback(async (db, { buildId }))` does not exist, and a build needs an `app_specs` row | `db/testing.ts`; `db/schema.ts` NOT NULL columns |
| 103 | The append-only test: unqualified table, a message match drizzle defeats, two refusals in one transaction | `events.test.ts`'s `expectSqlState` and its note; `0004`'s `audit` schema |
| 104 | Control (d) targets the owner/REVOKE lines Task 1 deleted | Task 11's corrected migration text |
| 105 | `startBuild` holds no secret; the registry JWT is minted and kept inside the Docker driver | `runtime/docker/driver.ts` `buildImage`; `registry-auth.ts:71`; `releases/build.ts` |
| 106 | Step 4's splitter shares a buffer across streams, never flushes, and doubles as the full log | The snippet |
| 107 | `spawn` drops `execFile`'s 900 s timeout, 32 MiB buffer and `BUILD_FAILED` message | `builder.ts` `runBuildxBuild`; `DEFAULT_BUILD_LIMITS` |
| 108 | Per-line async appends race on `(build_id, seq)` and can land after the status update | `onLog`'s synchronous signature; the migration's primary key |
| 109 | A gate or context failure writes zero lines; Step 1 proves the property only against a fake | `buildImage`: `assembleContext` and `runMandatoryGates` precede the builder |
| 110 | The streaming contract test fails against the fake, and `waitUntil` does not exist | `fake-driver.ts` `buildImage` (no `await`); `grep -rn waitUntil src` → nothing |
| 111 | The build POST returns the id only after the build, so no client can read a live log | `api/routes/delivery.ts`: `startBuild` awaited inside `app.idempotent` |
| 112 | Step 2's `pnpm test --` filter runs every file | Finding 34 |
| 113 | The harness's two `TABLES` lists should name the new audit table | `vitest.global-setup.ts`, `db/testing.ts`; no production delete of a project or build |
| 114 | Task 12's rules fail two of its own seven tests | The rules run as printed: `node:[REDACTED]:1364:14`; `antidisestablishmentarianism` entropy 3.34 |
| 115 | The entropy rule redacts digests, SHAs, UUIDs, container names, integrity values and module paths — **decided by Rich the same evening: the measured refinement at the top of Task 12** | Sitting 6's seed logs: 21 of 138 and 20 of 137 lines altered; constructed samples |
| 116 | It would redact SSO's persisted entity IDs and ACS URLs, and two Docker tests catch it | `sso/registration.ts`'s two events; `registration.docker.test.ts:152`, `deploy-sso.docker.test.ts:199` |
| 117 | `makeRedactor([])` returns before any heuristic runs | `redact.ts`: `if (needles.length === 0) return (value) => value` |
| 118 | Three of Task 12's four controls predict the wrong failure | The rules run with each mutation: (a) RED on URL and `Authorization`, (b) RED on the `sk-` key, (c) the PEM block untouched |

**Decided the same evening, by Rich: 115 — the recommended entropy rule, refined by measurement.** The recommendation as first written was measured before it was adopted and still failed Step 1's word control and altered 130 lines of the repository's own documents; the refinement passed every corpus. The rule, what it gives up and what it keeps are at the top of Task 12, and sitting 7 has no decision left to make.

**Checked, and not a correction:** `releases/` may import `observability/` through its `index` (the module-boundary test allows any module's public entry); the certificate fingerprint an SSO event stores is colon-separated and is never a candidate; nothing in production deletes a project or a build, so `audit.build_logs`'s `RESTRICT` blocks no current path.

### Sitting 7, Tasks 11 and 12 — build logs, and the redaction that covers them (2026-09-14). 16 findings, a migration that applied without its grant, and a Mongo readiness race that is not this sitting's.

**Both tasks are done, in two commits** — Task 11 (`dec743f`), then Task 12 (`db570e7`). A build's output now reaches `audit.build_logs` line by line, redacted, while the build runs: `runtime/docker/builder.ts`'s build goes through `runStreamed` instead of `execFile`, `Driver.buildImage` takes an optional `onLog`, `observability/build-logs.ts` writes through one queue that owns the sequence number, `startBuild` writes on both paths and makes a failure's reason the log's last line, and `GET /builds/:buildId/logs` serves it, authorized like the build. Then `observability/redact.ts` gained §14's second clause — five patterns and Rich's entropy rule — on every string at every depth, including for an empty secret set. The pre-flight's 18 corrections are resolved. Versions: Postgres 16 (`postgres:16-alpine`), drizzle-orm 0.45.2, drizzle-kit 0.31.10, Node 24.12.0, Docker Engine 29.7.2 with buildx v0.36.1-desktop.1, `moby/buildkit:v0.32.2-rootless`, LiteLLM 1.98.0 (`sha256:20b5044b`), macOS 26.6.2.

**What is proved, and at which tier.** *Unit, no Docker:* `runStreamed` driven with `sh` — a line arrives more than 700 ms before the process exits, one partial-line buffer per stream, the last line flushed, a canary split across two pipe reads redacted, a bounded tail, a timeout, and a process-group kill that a grandchild cannot outlive; the writer lands 250 lines in order and surfaces a failed insert as `23503`; `audit.build_logs` refuses UPDATE, DELETE and TRUNCATE (`42501`) and a delete of its build (`23503`); `startBuild` stores the log before the row says succeeded — proved on the POOL, against a table lock — keeps a failed build's log with its reason last, and logs a refusal that happened before any builder existed; the route hides a build's log from a stranger; the fake driver streams through the contract; and redaction holds against the shapes real logs carry. *Docker tier:* a real BuildKit build reports its `RUN … && sleep 3` step more than two seconds before it resolves, from stderr, with the registry token echoed into that step and redacted there; a real 120 s build is stopped by an 8 s timeout; the Docker driver passes the contract's streaming test; and pre-flight 116's exposure is closed — `registration.docker.test.ts` and `deploy-sso.docker.test.ts` pass with the heuristics on. *Measured rather than tested:* the entropy rule against real logs and this repository's documents (below). **Not proved:** a client receiving lines while a build runs — `POST …/builds` returns only when the build does (pre-flight 111), so that is Task 14's stream, published from `onLog` by Task 15.

**Measured before Task 12 shipped**, in Node against a draft and then by the shipped code's tests: **0 lines altered** in sitting 6's two real `make seed` logs (139 and 138 lines, 80 and 77 of them BuildKit's), ORIENTATION, RUNBOOK and the spec; in P4a's and P4b's plans only the example credentials their own tests quote (3 and 9 lines). On 1,000 random values of each shape it redacted **90.0%** of 44-character base64, **67.6%** of 24-character base64, **99.8%** of base64url and **0.0%** of hex — the pre-flight's figures, by design.

**Decisions made here, so nobody re-derives them.**

| Decision | Why, and what was rejected |
|---|---|
| **The splitter is its own exported function, `runStreamed`**, tested with `sh` in the unit tier | Each property has a failure a real BuildKit run rarely shows — BuildKit writes almost everything to stderr in whole lines — so a shared buffer, a lost last line or an unredacted token would pass the Docker tier on an ordinary day. *Rejected:* testing only through a real build |
| **The writer owns `seq` and one queue** (`createBuildLogWriter`), not `startBuild` as pre-flight 108 said | The counter and the queue are properties of the store, and a second writer would need both. Lines queued while an insert is in flight go out together. A failed insert stops the writer and is rethrown by `flush`; later lines are dropped rather than stored around a hole |
| **The registry token is removed in `runBuildxBuild`**, before `onLog` and before the tail that becomes `builds.error` | The lowest point that holds it (pre-flight 105). It also closed a hole the pre-flight did not name (129) |
| **`builds.error` carries a 40-line redacted tail**, and `runBuildxBuild` no longer returns `log` | The whole log is in the store; nothing read `log` (`grep`), and a field called `log` holding a tail would lie |
| **No separate tail index** | The `(build_id, seq)` primary key serves the tail as a backward index scan (121) |
| **The timeout kills the process group** (`detached: true`, `process.kill(-pid)`), with a 5 s SIGKILL grace | A grandchild sharing the pipes keeps `close` from arriving. Docker CLI 29.7.2 happens to forward SIGTERM to buildx (128), so this is defence in depth; the cost is that a Ctrl-C in the control plane's terminal no longer reaches an in-flight build |
| **`GET /builds/:buildId/logs` authorizes before it validates `?tail=`** (1–10000) | A stranger must learn nothing from a 400 that a 404 hides |
| **`expectSqlState` moved to `observability/testing.ts`** | Shared by the `events` and `build_logs` tests: the one helper whose subtlety has already cost a defect |
| **The five patterns stay as printed except one: a URL credential's password holds no `/`** | Finding 130. Rich settled the entropy rule and left the patterns as printed; this corrects a pattern measured wrong, so it is recorded rather than asked |
| **A jwt.io-shaped JWT is in the JWT test** | The only sample on which pattern-before-entropy order is observable (132) |

| # | Finding | Measured against |
|---|---|---|
| 119 | **Migration 0005 applied WITHOUT its grant.** `F=$(ls drizzle/0005_*.sql)` captured a long listing line — `ls` is aliased here (§4) — so `cat >> "$F"` failed, and `drizzle-kit migrate` created `audit.build_logs` with no privilege for `manifest_app`. Appending the grant afterwards would have changed nothing on this database while a fresh one got it. Replayed instead: the migrations row (`created_at 1789447460612`) deleted and the empty table dropped, the grant appended through a glob, and the file migrated as it ships | `\dp audit.build_logs`: empty, then `manifest_app=ar/manifest` |
| 120 | **zsh does not word-split an unquoted variable**: `$PSQL` holding `docker exec … psql …` ran as one command name, so the replay's guard failed on its first read and changed nothing. **It then struck twice more**: a `docker image rm $refs` removed nothing, and a `docker pause $DBS` meant to test 133's trigger paused nothing, so that experiment measured nothing. A function, an array or `${=var}` works | `command not found: docker exec manifest-postgres psql …`; `No such container: mf-fixture-app-staging-db mf-proof-app-staging-db` |
| 121 | **The plan's tail index is redundant.** At 100,000 lines over 50 builds, in a rolled-back transaction, `ORDER BY seq DESC LIMIT 50` for one build is `Index Scan Backward using build_logs_build_id_seq_pk` | `EXPLAIN (COSTS OFF)` |
| 122 | **drizzle-kit 0.31.10 writes the CHECK with a fully-qualified `"audit"."build_logs"."stream"` inside CREATE TABLE**, and Postgres 16 accepts it | `pg_get_constraintdef`: `CHECK ((stream = ANY (ARRAY['stdout'::text, 'stderr'::text])))` |
| 123 | **The contract's streaming test cannot see a report-at-exit Docker driver**: the Syft/Grype scan runs after buildx, so lines handed over when buildx exits still arrive before `buildImage` resolves. The property is held at the builder, in both tiers | Control (a) against `driver.docker.test.ts`: GREEN, as predicted |
| 124 | **A secret with a trailing newline matched no line**, because redaction runs per line — found writing the Docker test, whose token comes from `mint-token.mjs` on stdout. Each line of a secret is now its own needle, with `makeRedactor`'s 6-character floor | The unit test; control (j) |
| 125 | **`let error` inside `startBuild`'s `catch (error)`**: TS2448 and TS2492, and a transform failure that took down all three test files importing `releases/` | `tsc`; the transform error |
| 126 | **The stranger row for the new route passed before the route existed** — 404 is also what an absent route answers. The owner and collaborator rows are what went red, and the delivery test asserts the owner's 200 for the same reason | The first red run |
| 127 | **A missing `flush` before the success update was unobservable**: inside `withRollback` one connection runs its queries in order, so the UPDATE queues behind the INSERT whether or not `startBuild` waits, and the API test's pool race was hidden by timing. Paired by a test on the pool with `LOCK TABLE audit.build_logs IN ACCESS EXCLUSIVE MODE` held for a second from an admin connection | Control (c2): GREEN against both tests, then RED against the lock test — `expected 8 to be greater than or equal to 900` |
| 128 | **Docker CLI 29.7.2 forwards SIGTERM to the buildx plugin**: killing `docker` alone stopped a real 120 s build at its 8 s timeout. Three comments that said otherwise were corrected | Control (f) against `builder.docker.test.ts`: GREEN; against the `sh` test: RED (timed out) |
| 129 | **`builds.error` carried every byte of buildx's stderr, unredacted** (`stderr \|\| stdout \|\| error.message`) — anything the registry token appeared in went into a column | `builder.ts` before this task |
| 130 | **The printed URL-credential pattern reads `4873/` as the password in npm's scoped-package URL**, `GET http://manifest-verdaccio:4873/@anthropic-ai%2fsdk` — the shape of every 404 for a scoped dependency, and the toolkit's closure has scoped dependencies. `[^\s@/]+` — userinfo holds no `/` (RFC 3986) — keeps the URL, still redacts both real credentials, and alters nothing else in the corpus | The two rules side by side in Node; control (u) |
| 131 | **Control (a) as re-predicted by pre-flight 118 still names the wrong line.** 118 measured the PRINTED rule; under the rule that ships, a floor of 8 alters exactly one line of the diagnosability test — the advisory id `GHSA-4mxg-3p6v-xgq3` | Control (a) |
| 132 | **Pattern-before-entropy order is unobservable against every sample the plan prints** — each is short or hex — so control (b) first came out GREEN. A jwt.io-shaped token, whose payload and signature are 24+ characters, is `t=[REDACTED]` patterns-first and `t=eyJhbGciOiJIUzI1NiJ9.[REDACTED].[REDACTED]` entropy-first; it is now in the JWT test | Control (b), before and after |
| 133 | **A Mongo service is reported ready 24 s or more before it accepts the app's credentials** — a platform defect since P3, not this sitting's code: nothing on its path imports `observability/`. `ensureServiceContainer` returns when Docker reports the container healthy, and the catalogue's health test is a loopback `ping`, which — as the catalogue's own comment says — Mongo serves before authentication. The image's `docker-entrypoint.py` runs an init `mongod` bound to `127.0.0.1` with no auth, creates the user, shuts down, and restarts as `mongod --auth --bind_ip_all`; the loopback ping passes during init. So `deployRelease` can start an app whose first database write is refused. It surfaced as `services.docker.test.ts` — 1 of 131 in the tier, then failing alone in 2 of 2 runs — while the machine was loaded (134). A rerun is not evidence either way: twenty minutes after failing alone 2 of 2, the file passed 2 of 2 in 26 s with nothing changed. (The run meant to confirm load as the trigger was itself invalid — zsh did not split `$DBS`, so `docker pause` failed and nothing was paused; 120.) **Not fixed, deliberately**: a candidate health test that pings the container's own IPv4 address (`hostname -i`, because `getent hosts "$(hostname)"` answers `::1` first) went healthy after authentication once, and once never went healthy in 200 s for a reason not found. Hurrying a change to every app's database check is the wrong way to spend the end of a sitting; it is sitting 8's, before Task 13 | A fresh service with the catalogue's health test: HEALTHY at 9.64 s, an authenticated insert from another container FAILED at 9.64 s and 18.86 s, OK at 33.8 s. With a 20 s init script: HEALTHY while the insert FAILED, OK 31 s later |
| 134 | **Every idle Mongo service burns about a core on its health check.** It runs `mongosh` — a Node process — every second, at 90–113% CPU a run, so the two demo app databases this machine keeps running sat at 69% and 39%. That load widened 133's window today. Named, not fixed: the one-second interval is P3's, and Docker API 1.44's `StartInterval` would let a fast start-up check coexist with a slow steady-state one | `docker top` and `docker stats` on `mf-fixture-app-staging-db` and `mf-proof-app-staging-db` |

**Negative controls — 27, every file mutation applied by a script that refused unless each pattern matched exactly once, restored byte-for-byte, and the working tree's diff hashed before and after.**

| Control | Result |
|---|---|
| (a) lines reported at exit, not as they arrive | **RED** — unit (`expected 0 to be greater than 700`) and Docker (`expected 116 to be greater than 2000`); **GREEN, as predicted**, against the Docker contract suite (123) |
| (b) stdout only | **RED** — unit (`expected [] to have a length of 1`) and Docker (`expected 0 to be greater than 5`) |
| (b2) one buffer for both streams | **RED** — `[ 'stderr', 'out-aerr-a' ]`: pre-flight 106's defect, reproduced |
| (b3) no flush on close | **RED** — the last line lost |
| (c) no reason line in `startBuild`'s catch | **RED** — both failed-build tests; the refusal before the builder leaves `[]` |
| (c2) no `flush` before the success update | **GREEN** against the transaction and API tests (127); **RED** against the pool-and-lock test |
| (d) `GRANT UPDATE, DELETE, TRUNCATE` to `manifest_app` | **RED** ×3; `REVOKE` → green, ACL back to `manifest_app=ar` |
| (e) the foreign key made `ON DELETE CASCADE` | **RED**; RESTRICT restored (`confdeltype = r`) → green |
| (f) kill only the spawned process | **RED** with `sh` (timed out); **GREEN** against a real build (128) |
| (g) no token redaction | **RED** — unit, and Docker: `expected '#5 [2/2] RUN echo 5cd565b4-…' to contain '[REDACTED]'` |
| (h) the fake resolves in the tick it was called | **RED** — `every line arrived after the build finished` |
| (i) the logs route skips authorization | **RED** — the delivery test and the contract's stranger row, `expected 200 to be 404` |
| (j) secrets not split per line | **RED** |
| (k) the writer drops its failure | **RED** — `the query was expected to fail and did not` |
| (l) the tail newest-first | **RED** — `[ 'step 3', 'step 2' ]` |
| Task 12 (a) floor 24 → 8 | **RED** — `GHSA-4mxg-3p6v-xgq3` eaten (131) |
| Task 12 (b) entropy before patterns | **RED** — `t=eyJhbGciOiJIUzI1NiJ9.[REDACTED].[RE…` (132) |
| Task 12 (c) the PEM rule deleted | **RED** — the block entirely intact, as pre-flight 118 said; idempotence red with it |
| Task 12 (u) the printed URL rule | **RED** — the scoped npm 404 (130) |
| Task 12 (e) the early return for an empty secret set | **RED** — all six heuristic tests (pre-flight 117) |
| Task 12 (d) the short-secret floor lowered to 1 | **RED** — `[REDACTED] c[REDACTED]t n[REDACTED]me…` |

**Checked, and unchanged:** the four HTML pages — `manifest-phases.html` still says "the AI half is what remains", true until Task 16; `RUNBOOK.md`, which states no test counts and whose doctor and verify totals did not move; and `docs/external-track.md`, whose trigger is Task 16.

**Gates at the end:** `pnpm test` **671** (63 files, twice), `pnpm test:docker` **130 of 131** (24 files, 905 s on a loaded machine) — the one failure is 133, and Task 11's own run was **131 of 131** in 439 s, lint / typecheck / `format:check` clean, `make doctor` **18/0** and `make verify` **47/0**. **The machine at the end** differs from its start-of-session snapshot in the clock, free disk (153 → 151 GiB), container uptimes (`manifest-caddy`, which `routes.docker.test.ts` restarts by design) and HEAD. The Docker tier's images were removed after each run, by every name each carried — `local/blueprint-ntm`, `local/fixture-s6` with `local/fixture-rt`, `local/saml-unsigned` with `local/saml-probe`, and `local/chem-labs` — and the two demo app databases an invalid experiment meant to pause were never touched. LiteLLM: `p4b-probe-user` holds **0 keys** and there are **0** `mf-` users. `make doctor` and `make verify` ran after the Docker tier, 245 pinned tarballs, 0 missing. **Sitting 8 — Task 13, §14's `Incident` — is next; a note from this sitting is at the top of Task 13.**

Then one section per sitting, in P3's format: the tasks executed, the defects found with the measurement that found each, and the gate numbers at the end. The measured rate across P1, P2 and P3 is 1.4 → 2.7 → 4.3 defects per task and it never fell with practice.

---

## What this plan does not build

Everything below is named because the spec asks for it and silence would read as an oversight. Each says where it stops and why.

**Three things §10 specifies that Phase 1 cannot enforce.**

- **The per-user budget.** `ai.budget.per_user_monthly_usd` is validated against the project quota and **not enforced**, and the reason is measured (M10): LiteLLM 1.98.0 has no per-key or proxy-level default end-user budget — `max_end_user_budget`, `end_user_budget` and `default_internal_user_params` are all absent from its OpenAPI document — and end-user rows auto-create with no budget. Applying one needs an explicit `/customer/new` naming `sha256(puid ‖ project ‖ environment)`, a string that exists only at request time inside the app, whose key is confined to three routes and correctly 403s on `/customer/new`, and which §12 forbids from reaching the control plane. The only mechanism that fits is **lazy registration driven by spend logs**, which is a reconciler, and §11's reconciliation loop is Phase 4 (D10). **What P4b does ship is the part that prevents the actual harm S3 found**: the namespaced end-user identifier, so one app's exhausted allowance can never lock a student out of another. Spec action raised.
- **Agent keys and their `duration` TTL.** §10's middle row and S3 Evidence 10's *"set both"*. **Nothing mints an agent key before Phase 3**, because an `AgentSession` has nothing to attach to until sandboxes exist (§15 says so directly). `ai/keys.ts` therefore has no TTL path: a `duration` parameter with no caller would be the fourth instance of the defect this project has hit three times, and S3 has already measured that the mechanism works — `duration: "70s"` gives 200 immediately and 401 after 71 s. Phase 3 supplies the caller.
- **"Revoked on archive."** There is no archive operation in Phase 1 — nothing destroys an environment through the API — so `commitAppKey` revoking the key it replaces, and `discardAppKey` revoking one that was never committed, are the whole of the lifecycle that has a caller (split from `rotateAppKey` in sitting 5, Rich's decision of 2026-09-14). A `revokeAppKey` sitting unused is the same defect as above.

**Two things sitting 5 left named rather than built** — both belong with the zero-downtime redeploy plan, P4c, which retires old instances:

- **An app that stops declaring models keeps its route to the gateway, and its last key stays live.** `ensureAppNetwork` adds neighbours and never removes one, and a deploy with no models mints nothing and so revokes nothing. Detaching on that deploy would cut the previous release's container — still running, since nothing retires it — off from its models mid-deploy. The detach and the revoke belong beside P4c's retire step.
- **A minted key can outlive a failed deploy.** A discard that itself fails (the gateway is down at the moment the instance fails), and a commit that fails after the instance is healthy, each leave one key live that `secrets` does not name. Each is confined to three routes, bound by the app's budget, tagged with `metadata.manifest_project`, deletable by its hashed token (finding 55), and reported on stderr without its value; reaping them is the reconciler's (Phase 4, D10).

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

**One applied 2026-09-14, with Rich's approval: the §21 LiteLLM row**, because Task 2 had already pinned the digest. **The other five are held until the tasks that implement them have run** — Tasks 6, 7, 9 and 14 — because plan-time findings have moved during execution before. **Tasks 6 and 7 ran on 2026-09-14 (sitting 4), and Rich settled both of their §7 rows the same day. Both are applied**, in one spec commit, and two of his three answers differ from what was built. The mechanics went in as proposed; an unclassified catalogue entry refuses only the model that names it, not the whole catalogue; and an omitted project budget is defaulted to the project's AI quota instead of refused. The code those need is the *SPEC DECISIONS* block at the top of Task 9. Two of them are product decisions for Rich at that point: the per-user budget §10 cannot enforce, and what streams over WebSocket. The table is the original proposal, kept as the record.

| Section | Current text | Proposed change | Why |
|---|---|---|---|
| §10, the **End user** row | *"`ai.budget.per_user_monthly_usd`"* as the budget source | Add: **this is not enforceable at LiteLLM 1.98.0 and is validated rather than applied in Phase 1.** End-user (customer) rows auto-create with no budget; `/customer/new` requires the end-user id in advance; and `max_end_user_budget` does not exist in the admin API (measured 2026-09-07 against the running proxy's own OpenAPI document). Applying it needs lazy customer registration driven by spend logs — a reconciler, and therefore Phase 4 (D10). The **namespacing** rule in the same section is what prevents S3's cross-app lockout and is enforced from Phase 1. | §10 reads as though the field binds. It does not, and the gap is invisible: an app declares a per-user allowance, the platform accepts it, and no student is ever limited. Naming it next to the row is the difference between a known limit and a silent one. |
| §21, *Platform inventory*, the LiteLLM row | the image, unversioned | Record that LiteLLM is deployed **by digest**, recorded in `infra/images.lock`, and that `ghcr.io/berriai/litellm:main-stable` is a moving tag. | §16 pins the AI error mapping *"to the LiteLLM version in §21's inventory"*, and the inventory named no version while the deployment named a moving tag. Measured 2026-09-07: the running container happened to be exactly S3's digest, by luck rather than by configuration, and a `make seed` on a second machine would not have been. |
| §14, *Observability*, second bullet | *"Build and deploy logs stream over WebSocket to the front-end."* | Align with D23.2's list: the stream carries **build logs, instance state transitions, incidents and approval decisions**. Live tailing of a *running application's* stdout is a separate capability and is not v1. | The two sentences describe different features and an implementer has to pick one. D23.2 is the more specific and is the one the API is designed around; §14's phrasing implies application log tailing, which nothing in Phase 1 provides and which has its own privacy surface (§14's own redaction argument applies to it hardest). |
| §10, the **Agent key** row | *"dies with the sandbox — and carries a `duration` TTL"* | Note that this row binds from **Phase 3**: an `AgentSession` has nothing to attach to before sandboxes exist (§15), so no agent key is minted in Phase 1 and the TTL is a Phase 3 obligation rather than a Phase 1 gap. | Otherwise the row reads as unimplemented in every Phase 1 review, and the alternative — shipping a TTL parameter with no caller — is the defect the roadmap's second lesson names. |
| §7, *Classification gates model routing (D17)* | describes the catalogue's `max_classification` | Add the measured mechanics: the catalogue is read from **`/model/info` with the master key**, `max_classification` round-trips verbatim from `config.yaml`, and a **chat** model is identified by `mode !== 'embedding'` — LiteLLM 1.98.0 returns `mode: null` for chat entries, not `"chat"`. `/v1/models`, the only model route an app key may call, carries neither field. | D17 is the check that turns a privacy incident into a build-time message, and it depends entirely on where the classification is read from. The `mode: null` detail is the one that silently produces an *empty* catalogue, which fails every spec with a message blaming the faculty member. |
| §7, `ai.budget.project_monthly_usd` | defaults to 0 | Note that a declared `ai.models` with a zero project budget is **refused at validation**: LiteLLM refuses every request against a `max_budget` of 0, so the app would deploy healthy and fail its first question. | The schema default and the gateway's behaviour combine into a failure that looks like an exhausted budget on day one. Cheap to state, and the alternative is a support ticket that reads as a platform fault. |
| §11, *Execution model*, and §13's deploy | nothing on redeploy continuity | **Decided 2026-09-14 by Rich; the wording is to be written with its plan, P4c, which he placed straight after P4b — and §17's Phase 1 table would gain it between 1b and 1c:** a redeploy does not interrupt the app. The new instance is ready before the edge route moves, the move is atomic, the old instance drains, and only then are its AI key revoked and its container retired. | Measured the same day: every redeploy 502s the whole app while the new container starts (finding 74), and a key revoked at mint time fails the old instance's AI calls. Rich: not acceptable. |

**And one thing deliberately NOT proposed.** Attaching `manifest-litellm` to an app network only when the app declares `ai.models` looks like it needs a §12 change and does not: §12's east-west list already reads *"app or sandbox → LiteLLM's admin **routes**. **Not a port rule.**"*, and a conditional attachment is **stronger** than that text, not weaker — an app with no declaration has no route to the gateway at all. P4a raised the unconditional form and reached the same conclusion for the same reason. It does change what S6 measured, which is why Task 8 re-runs that tier in full rather than assuming it still holds.
