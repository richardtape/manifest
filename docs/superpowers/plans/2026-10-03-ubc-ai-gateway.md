# UBC's AI Gateway as Manifest's Upstream Provider — Implementation Plan

> **WRITTEN 2026-10-03, ~15:35–16:00 PDT, BY `manifest-b7`, AT RICH'S WORD**, relayed by the coordinator `manifest-94`. Rich decided
> the shape, the placement and the writer at **15:28** (`../2026-09-30-decisions.md`, its 15:28 entry): *"As the upstream provider"*,
> *"Right after faculty-ready"*, *"A fresh platform session now"*. **He answered this plan's two questions at 15:42**, through
> `manifest-94`, each as recommended (*Decided by Rich*, below). **Every fact in *Read this first* was read from the code at `d1e7eae`**
> while `manifest-9d` held the faculty-ready plan's sitting 5b (`ORIENTATION.md`, `TRAPS.md`, `external-track.md` and that plan
> uncommitted). Line numbers WILL have moved by the time this runs, and Task 1 re-reads each one marked *(T1: M<n>)*.
> **Two spec actions are drafted below, and neither is applied.** No task that a spec action changes runs before Rich has read and
> decided its words. **NOT YET APPROVED AS A WHOLE.**

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native) or superpowers:subagent-driven-development,
> **whichever Rich chooses at sitting 1's open**. Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9, which both of those skills will push you against.

**Goal:** With `UBC_AI_GATEWAY_API_KEY` in `.env` and the network on, **`default-chat-large` is answered by UBC's AI Gateway**
(`https://ai-gateway.apps.ltic.ubc.ca`, a LiteLLM proxy LTIC runs), not by OpenAI directly. That holds for chat, streamed or not,
and for the Responses API with a tool. **Every call is charged to the person who asked**, at a price that binds their budgets.
- **The gateway's real models join Manifest's catalogue under names of their own**, each at the classification Rich gives it.
- **The gateway's key reaches LiteLLM alone.** It is never printed, never stored in a database row, and never sent anywhere but the
  gateway.
- **Nothing offline changes.** `default-chat`, the on-premise stand-ins and the capable model's fallback stay on the laptop's Ollama.

It is proved by **`make demo-gateway`**, run with the network on and the key set, and by a person watching the gateway's own spend move.

**Architecture:** **Manifest keeps its own LiteLLM** (per-person keys, budgets, the fallback guard), and names the gateway as
its *provider*.
- **A setting that begins `ubc-ai-gateway/`** names a model the gateway serves. ONE function, `ai/providers.ts`'s
  `resolveSetting`, turns it into LiteLLM's `litellm_params`:
  - `model: 'openai/<name>'`;
  - `api_base` from `MANIFEST_UBC_AI_GATEWAY_URL`;
  - **`api_key: 'os.environ/UBC_AI_GATEWAY_API_KEY'` — a REFERENCE** that LiteLLM resolves from its own environment, so neither the
    control plane nor LiteLLM's database ever holds the key.

  Every other setting passes through unchanged, so `openai/gpt-6-luna` still reaches OpenAI directly.
- **`ai/capable.ts`'s registration machinery moves into `ai/registration.ts`**, parameterised by name and classification. The capable
  model and the new **`MANIFEST_GATEWAY_MODELS`** (`<name>=ubc-ai-gateway/<model>@<classification>,…`) both go through it, at every
  boot, through `/model/new`. Its price rule is unchanged, with one addition: a `confidential` gateway model LiteLLM cannot price is
  pinned at the on-premise stand-in's synthetic price.
- **The fallback guard learns the gateway's own failures**, but only if Task 1 measures that they arrive as `400` (Task 4's branch).
- **Agent keys gain `/v1/responses`**, but only if Task 1 measures that the gateway's capable model refuses tools on chat completions
  (Task 5, Spec action 2).

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0 (host), Fastify 5.12.3, Vitest 2.1. LiteLLM **1.98.0**, pinned by digest (the
`ghcr.io/berriai/litellm` line of `infra/images.lock`). The gateway's own LiteLLM version is measured by Task 1 (`[M1]`). Docker Desktop
29.7.2. **No new package.** The gateway itself is UBC's; nothing here deploys or configures it.

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md). Read these sections:
- **§7**, *Classification gates model routing (D17)*: the catalogue (l.505–513), the capable model, its builder setting and its fallback
  (l.516–535);
- **§10**, *AI access*: `allowed_routes` (l.1001–1009), the agent key (l.1019–1034);
- **§21**, the LiteLLM row (l.2163);
- **§26**, *Platform settings* (l.2959–2966);
- **D7** (Manifest builds no gateway of its own).

**The two spec actions below change §7, §21, §26 and §10.**

**Roadmap:** Rich's 15:28 decision (§8 *Open*'s *"should Manifest at UBC use UBC's existing LiteLLM?"*, now DECIDED: keep our own, name
UBC's as its provider). S5's unapplied spec row on the Responses API (`spikes/S5-findings.md`, *Spec actions*, its last row).

**Predecessor:** [`2026-09-30-faculty-ready.md`](./2026-09-30-faculty-ready.md). **This plan starts only after that plan's sitting 7 (its
acceptance) closes.**

**Successor:** [`2026-10-03-fe46-fe47-fe5.md`](./2026-10-03-fe46-fe47-fe5.md) (approved). **If Task 5 runs, the contract it inherits is
`1.6.1`, not `1.6.0`** (Decision 9). Then A1, B, FE-32, Phase 3, A2, the vulnerability database and FE-45 (ORIENTATION §8 *Decided*).
**Phase 3 inherits Task 5**: its harness reaches the capable model on `/v1/responses` through an agent key.

---

## How this plan is to be executed — sittings, one per session

**One sitting per session, with a check-in at each boundary.** This plan commits after every task.

> **THREE SITTINGS, PROPOSED.** Task 1 is first and alone, because it needs the network and Rich's key, and its answers pick the branches
> of Tasks 4 and 5. Tasks 2–5 share sitting 2, so the Docker tier runs once. The acceptance is alone and last.
> *Offered, and not recommended:* **four**, with Task 5 in a sitting of its own. That only makes sense if Task 1 lands Task 4 on Branch B
> and both are large.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Spec action needed first | Status |
|---|---|---|---|---|---|
| 1 | 1 | **The measurements** (the network on, Rich's key): the gateway's models; chat, streamed and not, through both hops; `/v1/responses` through both hops, with a tool; the error shapes the guard meets; the price Manifest's LiteLLM records; where the key goes; each model's classification, in Rich's words | No | — | ← **next** (after faculty-ready's sitting 7) |
| 2 | 2, 3, 4, 5 | **The capable model through the gateway**, the key by reference only. **The gateway's own models**, from one setting. **The guard**, if `[M5]` needs it. **Agent keys reach `/v1/responses`**, if `[M4]` needs it — contract `1.6.1` | Yes — `ai/`, `infra/`, `secrets/` | **1** (§7, §21, §26) before Tasks 2–3; **2** (§10) before Task 5 | |
| 3 | 6 | **The acceptance**: `make demo-gateway` three times, its controls seen red, every other demo still green, the plan's one whole-branch review, and Rich watching the gateway's spend move. **Alone, and last** | Yes, if any code changes | — | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. **The four gates**, from the repository root: `pnpm test` (twice, alone, on the final tree), `pnpm lint`, `pnpm typecheck` and
   `pnpm format:check`. Add **`pnpm test:docker`** when the table says it is owed. **The test budget is LEAN** (ORIENTATION §8
   *Decided*): no open run on an unchanged tree, single files while fixing.
2. **A dated entry in *What executing this plan found*.** It lists every defect with the measurement that found it, and every negative
   control, including which could not fail and why. It ends with the gate numbers and the machine, queried at the close.
3. **This plan's sittings table.** Mark the sitting done and move the `← next` marker. State no findings count here.
4. **The close-out sweep in ORIENTATION §6.** The gate numbers live in `scripts/ci-acceptance.sh`'s `EXPECT_` lines (their one statement).

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Moving task boundaries is Task 1's job. **If a measurement breaks the split, say so to Rich
before sitting 2.** Three rules survive any re-cut:
- Task 1 stays first and alone.
- Task 6 stays alone and last.
- No task that a spec action changes runs before Rich has decided that spec action.

---

## Decided by Rich — build them, do not re-open them

**At 15:28 PDT on 2026-10-03** (`../2026-09-30-decisions.md`, its 15:28 entry), through the question tool:
- **THE SHAPE — "As the upstream provider (Recommended)"**:
  - Manifest keeps its own LiteLLM (per-person keys, budgets, the guard).
  - It routes the capable model, and real on-prem models, through the UBC AI Gateway, **with one key Rich generates** (held in `.env`,
    referenced, never printed).
  - `default-chat` stays local, as the offline floor (C1).
  - This DECIDES §8's open *"should Manifest at UBC use UBC's existing LiteLLM?"*: keep our own, and name UBC's as its provider.
  - *Rejected:* replacing Manifest's LiteLLM with UBC's.
- **WHEN — "Right after faculty-ready (Recommended)"**: a small plan of its own, before FE-46/47/5. The order after faculty-ready is now
  this plan → FE-46/47/5 → A1 → B → FE-32 → Phase 3 → A2 → the vulnerability database → FE-45.
- **WHO WRITES IT — "A fresh platform session now (Recommended)"**: documents only. Rich creates the key and adds it to `.env` before
  sitting 1.

**At 15:42 PDT**, answering this plan's two questions (through `manifest-94`, which checked each premise against the code first):
- **Q1, HOW THE GATEWAY'S REAL MODELS ENTER THE CATALOGUE — "New names from one setting (Recommended)"**:
  - **`MANIFEST_GATEWAY_MODELS=<name>=<gateway model>@<classification>,…`**, registered at boot and removed when unset.
  - **`default-chat-onprem` stays Ollama**, the capable model's fallback and the offline floor for `confidential` apps.
  - *Rejected:* (b) repointing `default-chat-onprem` while a setting is set. With the network off, the capable model, its fallback and
    every `confidential` app's AI would then fail together. *Rejected:* (c) the capable model only, now.
- **Q2, `/v1/responses` ON AGENT KEYS — "Yes, in this plan, if measured (Recommended)"**:
  - Agent keys gain `/v1/responses`, **CONDITIONAL on Task 1 measuring that the gateway's capable model refuses tools on chat
    completions**, with a drafted §10 spec action (Spec action 2).
  - App and intake keys keep their three routes.
  - Task 1 also measures the stored-response routes, and how `allowed_routes` matches.
  - *Rejected:* (b) leaving it to Phase 3.
- **THE ROUTINE CALLS** this plan put beside the questions *"stand as described"*: Decisions 1–8 below.

**Carried from earlier plans, still binding:**
- **The capable model is registered through the admin API, never a `config.yaml` line.** It is pinned at the price LiteLLM itself reports,
  and **a model LiteLLM cannot price is refused, never offered at `$0`** (the front-end enablement plan's Task 12a, its review's I1).
- **Its fallback answers a provider that FAILED, and never a request the provider refused as malformed** (`400`, `413`, `422`). A `401`,
  `403` or `404` is the platform's credential failing, and falls back (Spec action 6; Rich 2026-09-30: *"Confirm"*).
- **LiteLLM's four leaks** (`x-litellm-model-api-base`, `x-litellm-model-name`, the body's underlying `model`, `llm_provider-*`) are
  TRACKED for **before production**. Through the gateway they name the gateway, which this plan records and does not fix.
- **A model key is answered once and never stored. Every refusal asserts its code.** The front-end is told before any commit to
  `packages/contract` or `packages/mock`.

---

## What Rich does, and when

1. **Review this plan**, approve or re-cut its three sittings, and choose the execution method at sitting 1's open.
2. **The key. DONE 2026-10-03, ~15:40 PDT**: Rich generated a VIRTUAL key on the gateway and added `UBC_AI_GATEWAY_API_KEY` to `.env`
   (`manifest-94`'s message, 15:42). `.env.example` already carries its commented line (`20c65ca`, by `manifest-94` at his request), so
   **no task adds it again**.
3. **At sitting 1**:
   - **The network on.**
   - **For each model `[M1]` lists, where it runs** (a commercial provider, or UBC's own hardware such as Pickerel) **and the
     classification he gives it.** Only a model on UBC's hardware may be `confidential` (Decision 7).
   - **As the gateway's administrator, three facts the platform cannot see** (`[M9]`):
     - whether the gateway retains prompts (its `store_prompts_in_spend_logs`);
     - whether any model there has a gateway-side fallback, and to what;
     - the virtual key's own budget, rate limits and model list.
   - **Optional: a second virtual key with a tiny budget** (e.g. `$0.0001`), named for the measurement and deleted after it, so `[M5]`
     can measure what the gateway answers when ITS budget for Manifest is spent. Without it, `[M5]` records that case as unmeasured.
4. **Read and decide Spec action 1 before sitting 2.** Read and decide **Spec action 2** before sitting 2, too, **if** `[M4]` says Task 5
   runs.
5. **At sitting 2's close**:
   - his `.env` lines: `MANIFEST_CAPABLE_MODEL=ubc-ai-gateway/<the model he picks from [M1]>` and
     `MANIFEST_GATEWAY_MODELS=<names he chooses>`;
   - `make up`, so LiteLLM is created with the key;
   - a control plane restart (a restore-safe script if the classifier refuses the agent).
   - **Recommended, his call:** remove `OPENAI_API_KEY` from `.env` once the gateway serves, so no direct OpenAI key exists on the
     laptop. It also closes `[M7]`'s cross-provider case, whatever that measures.
6. **Sitting 3**:
   - he runs `make demo-gateway` (or lets the session run it) with the network on;
   - he watches his key's spend move in the gateway's own admin UI;
   - if the faculty front-end runs against 7100 by then, he builds an app on `app.manifest.internal` and sees it answered.

---

## Read this first — what this plan knows from the code

*Read at `d1e7eae` on 2026-10-03 by `manifest-b7`. Task 1 re-reads each (T1: M<n>).*

1. **The capable model is registered with no address and no key.**
   - `ai/capable.ts:121-144`'s `create` sends `litellm_params: { model: setting, ...price }`.
   - `:171-175` says the provider's key is LiteLLM's environment alone.
   - `capable.test.ts:46` asserts no create body matches `/api_key/i`. **That assertion's meaning changes here**: a gateway registration
     names a REFERENCE (`os.environ/UBC_AI_GATEWAY_API_KEY`), and a direct one still names none.
2. **"Unchanged" compares the model string, not the address** (`capable.ts:200-209`: `modelOf(only) === setting`, the classification,
   pinned, priced).
   - A repoint from `openai/x` direct to the gateway's `x` expands to the SAME `openai/x`. Compared as today, it would read
     `unchanged` and keep calling OpenAI directly (*Review Focus* 5).
   - `/model/info` lists each deployment's `api_base` (`catalogue.ts:64-67`, measured 2026-09-07). *(T1: M3 — and how it shows `api_key`.)*
3. **The price rule** (`capable.ts:60-76`, `:223-243`):
   - registered once as the setting says, to read the price LiteLLM gives it;
   - then re-registered PINNED at that price;
   - a model LiteLLM prices at `0` is refused.
   - `gpt-6-*` is priced only by the list LiteLLM downloads at its own start with the network on (RUNBOOK, *The capable model*, step 2).
4. **The settings.** `config.ts:298-319` holds `MANIFEST_CAPABLE_MODEL` (empty is unset) and `MANIFEST_CAPABLE_MODEL_FALLBACK`
   (`default-chat-onprem` by default, empty is none). They are mapped at `:788-793`, typed at `:505-508`, and booted at
   `index.ts:477-484`, straight after `listen`. The boot line carries `capableModel` and `capableFallback` (`index.ts:546-549`).
5. **The scrub runs after `loadConfig`** (`index.ts:63`): `scrubSecretEnv()` removes `secrets/scrub.ts:6-32`'s names and returns them.
   `scrub.test.ts:33-61` holds the list. **A new secret in `.env` is a new line in both** (TRAPS: *RUNBOOK'S `set -a; . ./.env` EXPORTS
   ALL OF `.env`*).
6. **The provider key's one route into LiteLLM** is `infra/compose.yaml:229-235`: `OPENAI_API_KEY: ${OPENAI_API_KEY:-}`.
   - LiteLLM reads its environment only when the container is CREATED: `make up`, not `docker restart` (TRAPS).
   - **With no key, LiteLLM refuses a chat `500`, not `401`** (TRAPS).
7. **The on-premise stand-ins** are config-file deployments, which the admin API cannot delete (S3 Evidence 7). `infra/litellm/config.yaml:37-45`
   is `default-chat-onprem` and `:65-73` is `-reasoning`: `ollama_chat/qwen3.8:27b`, `confidential`, at the SYNTHETIC `$1` / `$3` a million
   tokens (`:23-27`: *"load-bearing … without it no budget is ever reachable"*).
8. **D17 for an agent takes every classified entry at or above the project's floor** (`ai/models.ts:32-45`). A gateway entry the
   catalogue lists therefore reaches agent keys with no code here, and a `confidential` one reaches a `confidential` project's.
9. **Every key's routes:**
   - `ai/keys.ts:21-25`: `AI_ALLOWED_ROUTES` is `/v1/chat/completions`, `/v1/embeddings`, `/v1/models`, frozen.
   - `ai/agent-keys.ts:92-128`'s `mintCappedKey` mints BOTH the agent key and the intake key with it (`:118`).
   - `narrowAgentKey` (`:215-234`) sends `models` only, so a key's routes survive a narrowing. *(T1: M4.)*
   - **§10 l.1001**: *"Every key Manifest mints carries `allowed_routes`, restricting it to"* those three.
10. **S5 measured** (`spikes/S5-findings.md:89-93`, `:350-352`): gpt-6-luna refuses function tools on `/v1/chat/completions`, even with
    `reasoning_effort: "none"`, and only `/v1/responses` accepts them. **So a tool-calling agent on a Manifest agent key cannot use
    `default-chat-large` today.** S5 ran on a key minted outside the platform.
11. **The fallback guard** (`infra/litellm/manifest_guard.py:81`) refuses a fallback after a provider's `400`, `413` or `422`.
    - **Its known limit at `:48-50`, *"a provider may answer its OWN failure — a billing one, say — with 400"*, was unreachable with
      OpenAI. The gateway is a LiteLLM, and LiteLLM answers a key over its budget with a `400`** *(T1: M5)*. So a gateway that has spent
      Manifest's budget would make every capable call a `400` to its caller, with no fallback (*Review Focus* 2).
    - The guard reads `status_code`, then the class (`:106-110`). *(T1: M5 — what else the exception carries.)*
12. **The agent session's answer names the three routes**: `api/representations/agents.ts:136`, `baseUrl`'s description,
    *"(`/chat/completions`, `/embeddings`, `/models`)"*. `:270` is the intake session's and stays.
13. **The fake LiteLLM keeps no address or key** (`ai/testing.ts:180-201`, `:410-436`): `/model/info` answers `litellm_params.model` and
    a pinned price only (`:519-535`). `FAKE_PROVIDERS` (`:271`) holds `openai`.
14. **The stub provider** (`ai/testing.ts:654-720`) counts hits by path and logs nothing. **A probe deployment there names no `api_key`**
    (`fallback-guard.docker.test.ts:67-120`), so LiteLLM's OpenAI provider likely sends LiteLLM's own `OPENAI_API_KEY` to the stub.
    *(T1: M7 — inferred, not measured. It is the same mechanism that could send that key to the gateway.)*
15. **The Docker tier's control planes boot without `MANIFEST_CAPABLE_MODEL` and REMOVE the capable model** (TRAPS). They will remove
    every gateway model too, by the same design. Restart the control plane with `.env` afterwards.
16. **The gateway, measured by `manifest-94` at ~15:2x**: `/health/liveliness` answers `200 "I'm alive!"`, `/v1/models` answers `401`
    without a key, and the address resolves to `142.103.94.46` / `.47`.
17. **The spec**:
    - §7's catalogue comment for `default-chat-large` reads *"a commercial provider, off-prem"* (l.511).
    - §7 l.517 reads *"a commercial provider's today"*.
    - §21's row reads *"a commercial provider reached through the same LiteLLM with the network on"*.
    - §26 l.2961-2962 reads *"the capable model's provider and model, and its fallback"*.
    - **Shared pages:** `manifest-schematic.html:1072` (*"a commercial provider's for now"*) and `manifest-decisions.html:137` (D17's why).
      `manifest-phases.html` and `manifest-stories.html` mention none of it (checked with `grep`).

---

## Decisions this plan makes, and why

1. **THE SETTING FORM IS `ubc-ai-gateway/<the gateway's model name>`**, one string in the settings that exist. A repoint stays one `.env`
   line, and the setting says where it goes.
   - *Rejected:* a separate `MANIFEST_CAPABLE_MODEL_PROVIDER`. Two settings can disagree.
   - *Rejected:* a raw `api_base` setting. It puts the gateway's address in every model setting.
   - *To change course:* `resolveSetting` is the one place.
2. **LiteLLM'S `openai/` PROVIDER, NOT `litellm_proxy/`.** The guard's statuses (`manifest_guard.py:15-18`) and F8's `422` (`:58-66`, the
   OpenAI provider's retry loop) were measured on LiteLLM's OpenAI provider, and S5 measured `openai/` answering `/v1/responses` natively.
   **Task 1 tries `litellm_proxy/` only if `openai/` fails a check**, and then this decision is re-made in its record.
3. **THE KEY TRAVELS AS `os.environ/UBC_AI_GATEWAY_API_KEY`.**
   - `infra/compose.yaml` hands the value to LiteLLM alone.
   - The control plane scrubs it at boot, and reads it ONCE, in `loadConfig`, only to know whether it is set (`keyInEnv`).
   - *Rejected:* sending the key in `/model/new`. LiteLLM would store it, salted, in its database, and the control plane would hold it.
4. **THE BOOT REFUSES A GATEWAY REGISTRATION WHEN `.env` CARRIED NO KEY.** It writes one operator line naming the setting, and keeps the
   working model (`capable.ts`'s `refuse`). It cannot see LiteLLM's environment, so *"in `.env` but LiteLLM not re-created"* is
   `make up`'s job and RUNBOOK's check. **If `[M7]` measures that an unresolved reference makes LiteLLM send another key, Task 2 adds a
   counted `make verify` check** that LiteLLM's environment carries the key whenever `.env` does (`EXPECT_VERIFY` +1).
5. **THE GATEWAY'S ADDRESS IS `MANIFEST_UBC_AI_GATEWAY_URL`**, defaulting to `https://ai-gateway.apps.ltic.ubc.ca/v1` (`[M2]` confirms the
   `/v1`). It is not a secret; the control plane sends it in each registration.
6. **PRICES.**
   - A gateway model is priced by LiteLLM's own map **for the gateway's model name**, then pinned, as the capable model is today.
   - **An alias LiteLLM cannot price is REFUSED**, and the fix is at the gateway: Rich, its administrator, exposes the model under its
     vendor name. *Rejected:* a price in the setting. It is the platform inventing a commercial price (I1).
   - **A `confidential` gateway model LiteLLM cannot price is pinned at the on-premise stand-in's synthetic price**, read at boot from
     `default-chat-onprem`'s config entry, so no second constant exists. Its rationale is `config.yaml:23-27`'s: an on-premise model has
     no per-token price, and `$0` binds no budget.
   - *To change course:* `ai/registration.ts`'s `unpriced` field.
7. **A GATEWAY MODEL'S CLASSIFICATION IS THE SETTING'S, NEVER DEFAULTED** (§7: an unclassified entry is never resolvable).
   - Rich gives each one at sitting 1 (`[M1]`).
   - **`confidential` only for a model on UBC's hardware with no gateway-side fallback off it** (`[M9]`). The platform cannot see the
     gateway's fallbacks, so that is an accepted limit, recorded in *What this plan does not build*.
8. **`MANIFEST_GATEWAY_MODELS` TAKES GATEWAY SETTINGS ONLY**, under names it owns:
   - it never takes `default-chat-large`, nor a name `config.yaml` already holds;
   - its deployments carry ids beginning `manifest-gateway-`, so its cleanup never touches the capable model or a config entry.

   **`MANIFEST_CAPABLE_MODEL_FALLBACK` may name one of them** (it takes any catalogue name), but RUNBOOK says the cost: a gateway
   fallback fails with the network off, where `default-chat-onprem` answers.
9. **IF TASK 5 RUNS, THE CONTRACT GOES `1.6.0 → 1.6.1`**, a patch. Only `baseUrl`'s description changes, and no schema. The three files
   and their two tests move together (`api/contract/document.ts:57-78`). The front-end is told before the commit, and FE-46/47/5's plan
   then starts from `1.6.1` (its `1.7.0` bump is unchanged).
10. **THE ACCEPTANCE NEEDS THE NETWORK AND THE KEY, SO IT IS IN NO OFFLINE OR CI STEP.** `make demo-gateway` prints `NOT RUN` and exits
    `2` when the gateway is not configured, because a skipped acceptance is not a passed one. Every Docker case in this plan uses the stub,
    never the gateway.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec, or from a dated measurement.

- **NEVER PRINT THE GATEWAY'S KEY, and never put it on a command line.**
  - **A probe** exports it inside a `bash` script (`set -a; . ./.env; set +a`).
  - **`curl`** reads it from a config on stdin: `printf 'header = "Authorization: Bearer %s"\n' "$UBC_AI_GATEWAY_API_KEY" | curl -K - …`.
    `printf` is a builtin, so the key never reaches `ps`.
  - **`docker run`** takes `-e UBC_AI_GATEWAY_API_KEY` with no value.
  - **NEVER** `docker inspect` LiteLLM, `env` or `printenv` in it, `echo` the variable, or `set -x` a script that has loaded `.env`.
  - **Check that it is present** with `docker exec manifest-litellm sh -c '[ -n "$UBC_AI_GATEWAY_API_KEY" ] && echo set'`.
  - **Check that it is absent from a file or a log** with a COUNT, the value read from the environment:
    `perl -ne '$n++ if index($_, $ENV{UBC_AI_GATEWAY_API_KEY}) >= 0; END { print $n+0, "\n" }'`.
  - **Every captured body is redacted before it is written**, by `probes/redact.pl`: the key's value, then any
    `sk-[A-Za-z0-9._-]{4,}`, replaced. A LiteLLM's `401` echoes the start and end of the key it was sent.
- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm typecheck` and
  `pnpm format:check`. Run **`pnpm test` twice** on a sitting's final tree. Never with `--filter`.
- **`pnpm test:docker`** (~20–23 min; needs `make up` and the chat model warm; **fails rather than skips**):
  - **Owed by this plan's `ai/`, `infra/` and `secrets/` changes.**
  - **Run it in the background, never beside a Vitest run.** Count `docker network ls -q | wc -l` before it.
  - **Run it from a shell where `MANIFEST_SOURCE_DRIVER`, every `MANIFEST_GITHUB_*`, `MANIFEST_CAPABLE_MODEL` and
    `MANIFEST_GATEWAY_MODELS` are unset.**
  - **It removes the capable model and every gateway model.** Afterwards, restart the control plane with `.env`, run the three cleanup
    scripts, then `make verify`.
- **One file**, from the repository root: `pnpm exec vitest run --project unit src/<path>`. **Never two Vitest processes at once.**
  **`pnpm test` TRUNCATES the control plane's tables.**
- **Vitest strips types.** `pnpm typecheck` is the only gate that sees a type, and `exactOptionalPropertyTypes` is on.
- **A route or representation change is four commands, in order**: the definition, `pnpm contract:write`, `pnpm contract:generate`,
  `pnpm docs:write`. Generated files are never edited by hand.
- **PUBLISHED TEXT CITES NO SECTION, DECISION OR PLAN** (Rich, 2026-09-30). Task 5's description, and `docs/api/agents.md`'s new
  paragraph, must pass `api/contract/docs.test.ts`.
- **A REFUSAL TEST NEEDS A POSITIVE CONTROL IN THE SAME FILE.** **Never accept a check you have not watched fail.** Each task ends by
  breaking what it built after committing, **predicting** what goes red, then restoring.
- **Every task names its CALLER.** A module with no caller is not built.
- **An operator line never carries a key, a reference's resolved value, a request body or a provider's message.** A `[boot]` line names
  the setting and its words; a test greps the captured stderr for the stub's key (`True`) and finds none.
- **Never touch the running `manifest-litellm` to MEASURE.** Use a throwaway from the pinned digest, on its own network and ports, with
  its own Postgres, removed afterwards (the faculty-ready plan's `f8-probe` pattern). **The Docker tier drives the running one**, as
  `fallback-guard.docker.test.ts` does, against the stub, and cleans up what it registers.
- **Config files are single-file bind mounts** (`infra/litellm/`). Edit in place, restart the container, and read it back with
  `docker exec … sha256sum` (ORIENTATION §4 trap 18).
- **The faculty front-end links `packages/contract` and runs `packages/mock` from THIS working tree.** Before Task 5's commit, run
  `ListAgents`, message its live `manifest-app-…` session, and commit after its reply or a fair wait.
- **COMMIT ON `main`, STAGE YOUR OWN PATHS BY NAME**; never `git add -A`, `.` or `commit -a`. Run `git status` before each commit.
- **Run `date` before writing any time** into a record or a message.
- **Never edit the spec** without Rich's word on the spec action. **Never touch Laravel Valet.** **Ask before `sudo`**; no task needs it.
- **macOS: bash 3.2 and a BSD userland; the tool shell is zsh.** Run multi-line probes with `bash <file>`. **`$SCRATCH` is your session's
  scratchpad, and you must set it.**
- **These four containers must survive:** `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **Leave the machine as you found it**: `scripts/snapshot-machine.sh` at the start and the end, and the three cleanup scripts, bare,
  then `--apply`.

---

## Review Focus

**The five failure modes most likely to bite a person, that no task's happy path exercises.** Each has its test in the owning task.

1. **The gateway's key sent to the wrong party, or written down.**
   - A reference that resolves to nothing could make LiteLLM fall back to its `OPENAI_API_KEY` and send OpenAI's key to the gateway.
   - A row, a log, a boot line or a test's failure message could hold the value.

   Expected: **the key reaches the gateway and nothing else, and no file or line holds it.** Owned by Task 2:
   - *refuses a gateway setting when `.env` carried no key*;
   - the Docker case *the reference resolves per call, and the stub never sees LiteLLM's `OPENAI_API_KEY`*;
   - `[M7]`'s counts, kept as Task 6's phase 5.
2. **A gateway failure of its own answered to the caller as THEIR malformed request.** Two cases: a model the gateway's administrator
   removed, and the gateway's budget for Manifest spent. Either may be a `400`, so the guard refuses the fallback, and the agent is told
   *"Budget has been exceeded"* about a budget that is not theirs.
   Expected: **the on-premise fallback answers**, or, if the two cannot be told apart, Rich has chosen what the caller sees. Owned by
   Task 4's branch.
3. **A `confidential` app's data reaching an off-premise model through the gateway.** This could come from an entry classified
   `confidential` that is not on UBC's hardware, or from a gateway-side fallback.
   Expected: **an entry's classification is the setting's, never defaulted; an entry without one is refused at config load.** Owned by
   Task 3's config tests. The gateway-side fallback is Rich's statement (`[M9]`), recorded as an accepted limit.
4. **A capable model at `$0`.** A gateway alias LiteLLM's map does not know would spend nothing, and no budget would bind.
   Expected: **refused, the working model kept, one operator line**. A `confidential` one is pinned at the stand-in's price. Owned by
   Tasks 2 and 3.
5. **A repoint from OpenAI-direct to the gateway that changes nothing.** `openai/gpt-6-luna` and `ubc-ai-gateway/gpt-6-luna` expand to
   the same model string.
   Expected: **the address decides `unchanged` too, so the repoint registers the gateway's deployment before the direct one goes.** Owned
   by Task 2's *repoints from direct to the gateway's same model*.

---

## File Structure

```
packages/control-plane/src/ai/
  providers.ts            NEW (T2) GATEWAY_PREFIX, GATEWAY_KEY_ENV, gatewayKeyRef, Gateway, ProviderParams, resolveSetting
  providers.test.ts       NEW (T2)
  registration.ts         NEW (T3) ensureRegistered + the helpers moved from capable.ts (create, priced, pinned, removeIfSaved, …)
  capable.ts              MOD (T2) resolveSetting; the address in `unchanged`; the Gateway param. (T3) its body on ensureRegistered
  capable.test.ts         MOD (T2) the gateway cases; the direct "names no key" case kept
  gateway-models.ts       NEW (T3) ensureGatewayModels, gatewayModelsAtBoot, standInPrice
  gateway-models.test.ts  NEW (T3)
  agent-keys.ts           MOD (T5) AGENT_ALLOWED_ROUTES; CappedKeyInput.routes
  agent-keys.test.ts      MOD (T5)
  testing.ts              MOD (T2) the fake keeps api_base/api_key; the stub's `authorized(path)`. (T4) the stub's gateway-failure paths
  capable.docker.test.ts  MOD (T2) the gateway registration against the stub. (T3) a confidential gateway model at the stand-in's price
  fallback-guard.docker.test.ts  MOD (T4, Branch B only) the gateway's own 400s fall back; a malformed 400 still does not
  agent-keys.docker.test.ts      MOD (T5) an agent key reaches /v1/responses; an intake key is refused it
  index.ts                MOD (T2, T3) the Gateway built from config; gatewayModelsAtBoot after capableModelAtBoot; the boot line
packages/control-plane/src/config.ts, config.test.ts   MOD (T2) MANIFEST_UBC_AI_GATEWAY_URL, keyInEnv. (T3) MANIFEST_GATEWAY_MODELS
packages/control-plane/src/secrets/scrub.ts, scrub.test.ts   MOD (T2) UBC_AI_GATEWAY_API_KEY
packages/control-plane/src/api/representations/agents.ts     MOD (T5) baseUrl names /responses
packages/control-plane/src/api/contract/document.ts          MOD (T5) 1.6.1
packages/contract/ (generated), packages/contract/package.json   MOD (T5)
infra/compose.yaml                     MOD (T2) UBC_AI_GATEWAY_API_KEY to LiteLLM alone
infra/litellm/manifest_guard.py        MOD (T4, Branch B only)
scripts/verify.sh, scripts/ci-acceptance.sh   MOD (T2, only if [M7] says so) LiteLLM holds the key when .env does; EXPECT_VERIFY
packages/journey/src/gateway.ts        NEW (T6) make demo-gateway's phases
scripts/demo-gateway.sh, scripts/gateway-controls.sh   NEW (T6); Makefile MOD (T6)
docs/api/agents.md                     MOD (T5) a tool-calling agent uses /responses
docs/superpowers/RUNBOOK.md            MOD (T2, T3, T6) *The capable model* through the gateway; the gateway's models; make demo-gateway
docs/superpowers/TRAPS.md, ORIENTATION.md   MOD (each sitting's close) what was measured; §3's capable-model paragraph; §8
docs/superpowers/spikes/gateway-baseline/   NEW (T1) README.md, results-task1-<date>.txt, probes/
```
**Not touched:** `.env.example` (`20c65ca` has the line), `infra/litellm/config.yaml` (Q1 (a) keeps every config entry), and the faculty
front-end's repository.

---

## Task 1: Measure what this plan rests on

**ALONE, AND FIRST. The network on, and Rich's key in `.env`.** Nothing under `packages/` changes.
- **The record:** `docs/superpowers/spikes/gateway-baseline/README.md` (one section per measurement, its raw answer redacted), plus
  `results-task1-<date>.txt`.
- **The throwaway:**
  - `gw-probe-pg` (`postgres:16-alpine`, the image `infra/compose.yaml:120` runs) and `gw-probe` (LiteLLM from the pinned digest);
  - on their own network `gw-probe-net`, and on ports **7197** (LiteLLM) and **7198** (the host stub) — check both are free first;
  - `STORE_MODEL_IN_DB=True`; a scratch master key and salt key;
  - `infra/litellm/manifest_guard.py` mounted read-only, with a probe config naming it in `callbacks`;
  - `-e UBC_AI_GATEWAY_API_KEY` and **`OPENAI_API_KEY=sk-canary-<random>`**, so a key sent to the wrong party is recognisable and is not
    Rich's;
  - `extra_hosts: host.docker.internal:host-gateway`.
  - **Removed at the end with its network and volume.**

**Files:**
- Create: `docs/superpowers/spikes/gateway-baseline/README.md`, `results-task1-<date>.txt`, `probes/` (`up.sh`, `down.sh`, `redact.pl`,
  `stub.mjs`, `probe-config.yaml`, one script per measurement)

- [ ] **Step 1: `[M1]` The gateway's models, and the key's own limits.** Direct to the gateway, with the key by `curl -K -`:
  1. `GET /v1/models`: every id.
  2. `GET /model/info` (and `/v1/model/info`): whatever this key may read — `mode`, prices, whether `litellm_params` or `api_base` show.
  3. `GET /key/info`: ONLY `max_budget`, `spend`, `budget_duration`, `rpm_limit`, `tpm_limit` and `models`, cut out with `jq`. Its other
     fields name the key.
  4. The gateway's LiteLLM version: the `x-litellm-version` header, if it sends one.

  **Then Rich, for each model** (*What Rich does* 3): where it runs, and its classification.
- [ ] **Step 2: `[M2]` Hop 2 alone, direct to the gateway**, for the capable model's candidate and for one on-premise candidate:
  1. a chat completion and a STREAMED one: status, the body's `model`, `usage`, every header (redacted);
  2. `x-litellm-response-cost` if sent;
  3. `/chat/completions` against `/v1/chat/completions`, which settles Decision 5's `/v1`;
  4. **the capable candidate with a function tool on chat completions**, with `reasoning_effort` unset and then `"none"` (S5's case):
     is it refused?
- [ ] **Step 3: `[M3]` Both hops, through `gw-probe`.** `POST /model/new` with
  `{ model_name: 'probe-capable', litellm_params: { model: 'openai/<capable>', api_base: <gateway>, api_key: 'os.environ/UBC_AI_GATEWAY_API_KEY' }, model_info: { id: 'probe-gw-1', max_classification: 'internal' } }`.
  Record:
  1. the answer;
  2. `/model/info`'s `litellm_params` for it — **is `api_key` shown, hidden, or shown as the reference? Is `api_base` shown?**;
  3. `input_cost_per_token` and `output_cost_per_token` — **LiteLLM's price for the gateway's model name**;
  4. the same for each on-premise candidate (`0` is expected);
  5. **the `LiteLLM_ProxyModelTable` row**, by COUNT only: occurrences of the key's value in `pg_dump --data-only -t
     '"LiteLLM_ProxyModelTable"'` (expected `0`), and whether the reference string appears in clear or salted;
  6. a chat and a streamed chat on a scratch key (models `[probe-capable]`, the agent key's routes): status, frames, and the spend on
     the key against `usage × the price` (`[M3]`'s rows are what Tasks 2 and 3 pin);
  7. **then the same registration as `litellm_proxy/<capable>`**, priced and called, recorded beside `openai/`'s, for Decision 2.
- [ ] **Step 4: `[M4]` `/v1/responses` through both hops.** Use a scratch key whose `allowed_routes` is the agent key's three routes plus
  `/v1/responses`.
  1. `POST /v1/responses` on `probe-capable`, with one function tool and a prompt that requires it: status, output item types (a
     `function_call` expected), streamed and not.
  2. **Does hop 1 call the gateway's `/v1/responses` natively, or bridge to chat completions?** Register a second deployment whose
     `api_base` is the host stub, and record the PATH the stub was called on.
  3. **The stored-response routes:** a follow-up with `previous_response_id`, and `GET /v1/responses/{id}`. Does each answer through
     hop 1 with that key? Which routes must `allowed_routes` list for each?
  4. **How `allowed_routes` matches:** with only `/v1/responses` listed, are `/responses` (no `v1`), `/v1/responses/{id}` and
     `/v1/responses/{id}/input_items` refused or admitted?
  5. **An intake-shaped key** (the three routes only) on `/v1/responses`: the status, `type` and `code` of the refusal.
  6. **`/v1/responses` on `default-chat`** (Ollama, through `host.docker.internal`): does LiteLLM bridge it offline? Task 5's Docker case
     rests on this answer.
  7. **Does `narrowAgentKey`'s `/key/update { models }` keep a key's `allowed_routes`?** Narrow the scratch key and re-read `/key/info`.

  **THIS DECIDES TASK 5.** Task 5 runs only if Step 2.4 measured the capable candidate refusing tools on chat completions (Rich, Q2).
  If it accepts them there, record that and drop Task 5, with Spec action 2 marked *not needed*.
- [ ] **Step 5: `[M5]` The error shapes, through both hops, as the client sees each AND as the guard reads it.** Give `gw-probe` a
  `general` fallback, `probe-capable → probe-ok` (a stub deployment answering `ok`), so the real guard decides. Add a copy of the guard,
  `probes/guard-inspect.py`, that prints only the exception's class, `status_code`, `type`, `code` and `param` attributes (never its
  message). The cases:
  - **(a)** a malformed request (`max_tokens: -1`, or a message with an invalid role) → the gateway's `400`;
  - **(b)** a `422` from the gateway — find what, if anything, makes the gateway answer `422`, and record it if nothing does;
  - **(c)** a model the gateway does not serve (`openai/no-such-model-<run>`);
  - **(d)** a wrong key (`os.environ/PROBE_WRONG_KEY` set to `sk-canary-wrong`) → `401` expected;
  - **(e)** the gateway's budget for the key spent — on Rich's tiny-budget key (*What Rich does* 3), or `unmeasured`;
  - **(f)** the key's rate limit at the gateway, ONLY if `[M1]`'s `rpm_limit` is small enough to reach in a few calls. Otherwise
    `unmeasured`; never hammer UBC's gateway;
  - **(g)** the gateway unreachable (`api_base: http://127.0.0.1:9/v1`).

  For each, record: the status, `type` and `code` the client sees; whether `x-litellm-attempted-fallbacks` is set; and the guard's
  printed attributes. **THIS DECIDES TASK 4's BRANCH:**
  - **A:** (c) and (e) arrive as non-malformed statuses;
  - **B:** they arrive as `400` with an attribute that tells them apart from (a);
  - **C:** they cannot be told apart from (a). **STOP and put it to Rich before sitting 2.**
- [ ] **Step 6: `[M6]` The gateway's view of a call.** With `api_base` at the host stub, record which top-level body FIELDS and header
  NAMES hop 1 forwards (never values). Above all, whether an app's end-user `user` (§10's namespaced hash) and LiteLLM's
  `metadata` / trace headers reach the provider. This is what UBC's gateway would see of Manifest's callers. **For the privacy record,
  beside ORIENTATION §8 *Open*'s *"MAY `internal` DATA REACH A MODEL PROVIDER OUTSIDE CANADA?"*.**
- [ ] **Step 7: `[M7]` Where the key goes.** On `gw-probe`, with `OPENAI_API_KEY=sk-canary-…` in its environment:
  1. a deployment whose `api_key` is `os.environ/PROBE_UNSET`, an `api_base` at the stub, and a call. **Which bearer reaches the stub?**
     The stub records only one of `canary` / `literal-reference` / `empty` / `other`, never the value. **`canary` means an unresolved
     reference sends another provider's key: Decision 4's `make verify` check is then built in Task 2.**
  2. the same with no `api_key` at all (Read this first 14's inference): `canary` expected;
  3. `docker logs gw-probe` and the probe's own files: the COUNT of the key's value (expected `0` everywhere).
- [ ] **Step 8: `[M8]` What the platform's gates read today**: the `EXPECT_` lines, and `make doctor` / `make verify` once. **No
  `pnpm test` on an unchanged tree** (the lean budget).
- [ ] **Step 9: `[M9]` Rich's statements, in his words**: each model's location and classification (Step 1); the gateway's prompt
  retention; any gateway-side fallback; the key's limits as he set them.
- [ ] **Step 10: Tear down** `gw-probe`, `gw-probe-pg`, `gw-probe-net`, the probe volume and the stub. Then count again: no `gw-probe*`
  container, network or volume is left.
- [ ] **Step 11: Commit** the spike directory by name. If a measurement breaks the split or a premise, tell `manifest-94` before
  sitting 2.
  ```bash
  git add docs/superpowers/spikes/gateway-baseline
  git commit -m "docs(gateway): Task 1 — the UBC AI Gateway measured through both hops (models, chat, streams, /v1/responses, errors, price, the key)"
  ```

---

## Task 2: The capable model through the gateway — the key by reference only

**Spec action 1 decided first.** This task's caller is `index.ts`'s boot (`capableModelAtBoot`).

**Files:**
- Create: `packages/control-plane/src/ai/providers.ts`, `providers.test.ts`
- Modify: `ai/capable.ts` (`create`, the `unchanged` test, `ensureCapableModel`'s and `capableModelAtBoot`'s signatures, `unservedReason`'s
  wording), `ai/capable.test.ts`, `ai/testing.ts` (the fake keeps `api_base` / `api_key`; the stub's `authorized`),
  `ai/capable.docker.test.ts`, `config.ts`, `config.test.ts`, `secrets/scrub.ts`, `secrets/scrub.test.ts`, `index.ts`,
  `infra/compose.yaml:229-235`, `docs/superpowers/RUNBOOK.md` (*The capable model*). Also `scripts/verify.sh` and
  `scripts/ci-acceptance.sh`, ONLY if `[M7]` read `canary`.

**Interfaces:**
- Produces: `GATEWAY_PREFIX = 'ubc-ai-gateway/'`, `GATEWAY_KEY_ENV = 'UBC_AI_GATEWAY_API_KEY'`, `gatewayKeyRef(envName?) → string`,
  `interface Gateway { url: string; keyRef: string; keyInEnv: boolean }`, `interface ProviderParams { model: string; api_base?: string;
  api_key?: string }`, `resolveSetting(settingName, setting, gateway?) → { params } | { refused: string }`.
- Produces: `ensureCapableModel(client, setting, gateway?)` and `capableModelAtBoot(client, setting, fallbackSetting, gateway)`.
- Produces: `config.ubcAiGateway: { url: string; keyInEnv: boolean }`.

- [ ] **Step 1: The failing unit tests.** `providers.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import { gatewayKeyRef, resolveSetting, type Gateway } from './providers.js'

  const GW: Gateway = { url: 'https://gw.example/v1', keyRef: gatewayKeyRef(), keyInEnv: true }

  describe('where a model setting is answered', () => {
    it('passes a LiteLLM model string through unchanged — OpenAI direct still works', () => {
      expect(resolveSetting('MANIFEST_CAPABLE_MODEL', 'openai/gpt-6-luna', GW)).toEqual({
        params: { model: 'openai/gpt-6-luna' },
      })
    })
    it('sends a ubc-ai-gateway setting to the gateway, naming its key by REFERENCE only', () => {
      expect(resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/gpt-6-luna', GW)).toEqual({
        params: {
          model: 'openai/gpt-6-luna',
          api_base: 'https://gw.example/v1',
          api_key: 'os.environ/UBC_AI_GATEWAY_API_KEY',
        },
      })
    })
    it('refuses a gateway setting when .env carried no key — and names the setting, never a value', () => {
      const r = resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/gpt-6-luna', { ...GW, keyInEnv: false })
      expect(r).toEqual({ refused: expect.stringContaining('UBC_AI_GATEWAY_API_KEY is not in .env') })
    })
    it('refuses the prefix with no model after it, and a gateway setting with no gateway configured', () => {
      expect(resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/', GW)).toHaveProperty('refused')
      expect(resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/x', undefined)).toHaveProperty('refused')
    })
  })
  ```
  And in `capable.test.ts`, beside the existing cases (`GW` as above):
  ```ts
  it('registers a ubc-ai-gateway setting at the gateway’s address, the key by reference — never a value', async () => {
    const lite = fakeLiteLlm()
    expect(await ensureCapableModel(lite, 'ubc-ai-gateway/gpt-6-luna', GW)).toEqual({
      state: 'registered',
      model: 'ubc-ai-gateway/gpt-6-luna',
    })
    for (const create of lite.calls.filter((c) => c.path === '/model/new')) {
      expect(create.body).toMatchObject({
        litellm_params: {
          model: 'openai/gpt-6-luna',
          api_base: GW.url,
          api_key: 'os.environ/UBC_AI_GATEWAY_API_KEY',
        },
      })
    }
  })
  it('repoints from OpenAI direct to the gateway’s same model — the address differs, so it is not unchanged (Review Focus 5)', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, 'openai/gpt-6-luna', GW)
    expect(await ensureCapableModel(lite, 'ubc-ai-gateway/gpt-6-luna', GW)).toEqual({
      state: 'registered',
      model: 'ubc-ai-gateway/gpt-6-luna',
    })
    const [only, ...rest] = capable(lite)
    expect(rest).toHaveLength(0)
    expect(only!.apiBase).toBe(GW.url)
  })
  it('refuses a gateway setting when .env carried no key, and KEEPS the working model (Review Focus 1)', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, 'openai/gpt-6-luna', GW)
    const r = await ensureCapableModel(lite, 'ubc-ai-gateway/gpt-6-luna', { ...GW, keyInEnv: false })
    expect(r.state).toBe('refused')
    expect(r.reason).toContain('UBC_AI_GATEWAY_API_KEY is not in .env')
    expect(capable(lite).map((d) => d.model)).toEqual(['openai/gpt-6-luna'])
  })
  it('refuses a gateway model LiteLLM cannot price — an alias — and never registers it at $0 (Review Focus 4)', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/ubc-luna-alias', 0)
    const r = await ensureCapableModel(lite, 'ubc-ai-gateway/ubc-luna-alias', GW)
    expect(r.state).toBe('refused')
    expect(capable(lite)).toHaveLength(0)
  })
  ```
  The existing *"registers default-chat-large at internal from the setting, naming no key"* case **stays** for a direct setting. It still
  asserts no `api_key` at all. `config.test.ts`:
  - `MANIFEST_UBC_AI_GATEWAY_URL` defaults to `https://ai-gateway.apps.ltic.ubc.ca/v1` (or `[M2]`'s form);
  - `keyInEnv` is `true` for a set key and `false` for an absent or empty one;
  - **`JSON.stringify(loadConfig(env))` does not contain the key's value.**

  `scrub.test.ts`: `'UBC_AI_GATEWAY_API_KEY'` joins the list, with its comment.
- [ ] **Step 2: Run — predict red.** `providers.test.ts` fails to import. The new `capable.test.ts` cases fail at the `api_base` match
  and at `apiBase` (the fake has none). `scrub.test.ts` fails at `toContain`.
- [ ] **Step 3: Implement.**
  - **`ai/providers.ts`**:
    ```ts
    /**
     * WHERE A MODEL SETTING IS ANSWERED. A setting that begins `ubc-ai-gateway/` names a model UBC's AI Gateway serves —
     * a LiteLLM proxy LTIC runs — and LiteLLM reaches it at the gateway's address with the gateway's key. THE KEY TRAVELS AS A
     * REFERENCE, `os.environ/<name>`, which LiteLLM resolves from its OWN environment per call ([M3]), so neither this process
     * nor LiteLLM's database ever holds the value. Every other setting is a LiteLLM model string, passed through unchanged.
     * `openai/` because every behaviour of the fallback guard and F8 was measured on LiteLLM's OpenAI provider (Decision 2).
     */
    export const GATEWAY_PREFIX = 'ubc-ai-gateway/'
    /** The key's NAME in LiteLLM's environment — `infra/compose.yaml` hands it to LiteLLM alone. Never its value. */
    export const GATEWAY_KEY_ENV = 'UBC_AI_GATEWAY_API_KEY'
    export const gatewayKeyRef = (envName: string = GATEWAY_KEY_ENV): string => `os.environ/${envName}`

    export interface Gateway {
      /** `MANIFEST_UBC_AI_GATEWAY_URL`: where LiteLLM reaches it, `/v1` included. */
      url: string
      /** What a registration names as its key: `gatewayKeyRef()` in production; a test names a harmless variable. */
      keyRef: string
      /** Whether `.env` carried a non-empty key when this process started. The value is never kept. */
      keyInEnv: boolean
    }
    export interface ProviderParams {
      model: string
      api_base?: string
      api_key?: string
    }
    export type Resolved = { params: ProviderParams } | { refused: string }

    export const viaGateway = (setting: string): boolean => setting.startsWith(GATEWAY_PREFIX)

    export function resolveSetting(settingName: string, setting: string, gateway?: Gateway): Resolved {
      if (!viaGateway(setting)) return { params: { model: setting } }
      const name = setting.slice(GATEWAY_PREFIX.length)
      if (name === '') return { refused: `${settingName} names UBC's AI Gateway but no model on it` }
      if (gateway === undefined) {
        return { refused: `${settingName} names '${setting}', and this control plane has no AI Gateway configured` }
      }
      if (!gateway.keyInEnv) {
        return {
          refused:
            `${settingName} names '${setting}', but ${GATEWAY_KEY_ENV} is not in .env, so LiteLLM would reach the ` +
            'gateway with no key of its own — add it to .env, run `make up` so LiteLLM is created with it, then ' +
            'restart this control plane',
        }
      }
      return { params: { model: `openai/${name}`, api_base: gateway.url, api_key: gateway.keyRef } }
    }
    ```
  - **`ai/capable.ts`**:
    - `Deployment.litellm_params` gains `api_base?: unknown`, and `apiBaseOf(d)` mirrors `modelOf`.
    - `create(client, params: ProviderParams, price?)` sends `litellm_params: { ...params, ...price }`.
    - `ensureCapableModel(client, setting, gateway?)` resolves first. A `refused` goes through the existing `refuse(() => reason +
      unavailable(kept))`, so the working model is kept.
    - The `unchanged` test becomes `modelOf(only) === params.model && apiBaseOf(only) === params.api_base && …` (the rest unchanged).
    - `unservedReason` says *"`openai/<model>` direct, or `ubc-ai-gateway/<model>`"*.
    - `capableModelAtBoot` takes and passes `gateway`.
    - **The fallback half is untouched**: it names catalogue entries, never providers.
  - **`config.ts`**:
    - `MANIFEST_UBC_AI_GATEWAY_URL: z.string().url().default('https://ai-gateway.apps.ltic.ubc.ca/v1')`.
    - `UBC_AI_GATEWAY_API_KEY: z.string().optional()`, with the comment *"read ONLY to know whether it is set — never kept; the scrub
      removes it next"*.
    - The config gains `ubcAiGateway: { url, keyInEnv: (raw.UBC_AI_GATEWAY_API_KEY ?? '') !== '' }`.
  - **`index.ts`**: `const gateway: Gateway = { ...config.ubcAiGateway, keyRef: gatewayKeyRef() }`, passed to `capableModelAtBoot`.
  - **`secrets/scrub.ts`**: `'UBC_AI_GATEWAY_API_KEY'`, with the comment *"UBC's AI Gateway's key (the UBC AI Gateway plan's Task 2):
    LiteLLM's alone, by infra/compose.yaml; `set -a` exports it here, where only loadConfig reads whether it is set"*.
  - **`infra/compose.yaml`**: under `OPENAI_API_KEY`, `UBC_AI_GATEWAY_API_KEY: ${UBC_AI_GATEWAY_API_KEY:-}`, with the comment *"UBC's
    AI Gateway's key: HERE AND NOWHERE ELSE. A registration names it as `os.environ/UBC_AI_GATEWAY_API_KEY`; LiteLLM resolves it per
    call. Changing it needs `make up`."*
  - **`ai/testing.ts`**: the fake's `FakeDeployment` gains `apiBase?` and `apiKey?`, kept from `/model/new` and listed by `/model/info`
    the way `[M3]` measured LiteLLM to list them. `startStubProvider(port, { bearer? })` gains `authorized(path)`: a count of hits whose
    `Authorization` equals `Bearer <bearer>`. **The stub never stores a header's value.**
- [ ] **Step 4: Run the unit files — green.** `providers.test.ts`, `capable.test.ts`, `config.test.ts`, `scrub.test.ts`, one at a time.
  **Every existing `capable.test.ts` case is green unchanged**: that is the proof `openai/…` direct still works.
- [ ] **Step 5: The Docker case** (`capable.docker.test.ts`). It runs against the stub and never the gateway:
  ```ts
  it('a ubc-ai-gateway model is reached at the gateway’s address with the key LiteLLM resolves from its OWN environment, per call (Task 2)', async () => {
    // The reference names a variable LiteLLM's container already holds and that is no secret — `STORE_MODEL_IN_DB`, "True" —
    // so the stub can be shown the resolved bearer without any key reaching this test. Production names UBC_AI_GATEWAY_API_KEY.
    const stub = await startStubProvider(GW_STUB_PORT, { bearer: 'True' })
    try {
      const gateway = { url: `${STUB_HOST}:${GW_STUB_PORT}/gw/ok/v1`, keyRef: gatewayKeyRef('STORE_MODEL_IN_DB'), keyInEnv: true }
      expect(await ensureCapableModel(client, `ubc-ai-gateway/${PRICED_NAME}`, gateway)).toMatchObject({ state: 'registered' })
      const res = await chat(await keyFor(CAPABLE_MODEL_NAME))
      expect(res.status).toBe(200)
      expect(stub.hits('/gw/ok/v1/chat/completions')).toBe(1)
      expect(stub.authorized('/gw/ok/v1/chat/completions')).toBe(1)
    } finally {
      await leaveNone(client)
      await stub.close()
    }
  })
  ```
  `PRICED_NAME` is `gpt-5.6-luna`, the bundled-priced model `PRICED` already uses, so the tier passes offline. **If `[M7]` read
  `canary`**, add a second case: a reference to an UNSET variable, and the stub's `authorized` for LiteLLM's `OPENAI_API_KEY` must be
  `0`. That case is red until `make verify`'s check exists, and stays as the witness.
- [ ] **Step 6: RUNBOOK's *The capable model***: the gateway form, the `make up`, the `[ -n ]` check, and *"remove `OPENAI_API_KEY`
  once the gateway serves"* (Rich's call).
- [ ] **Step 7: Commit by name**, then **the negative controls**, each predicted, seen red, and restored:
  - **(a)** `unchanged` back to comparing the model string alone: predict red at *repoints from OpenAI direct*;
  - **(b)** `keyInEnv` forced `true`: predict red at *refuses … when .env carried no key*;
  - **(c)** `api_key: gateway.keyRef` dropped from `resolveSetting`: predict red at the provider and capable unit cases, and the Docker
    case's `authorized`.
  ```bash
  git commit -m "feat(ai): the capable model through UBC's AI Gateway — ubc-ai-gateway/<model>, the key by reference only (gateway plan Task 2)"
  ```

---

## Task 3: The gateway's own models, from one setting (Rich's Q1)

**Spec action 1 decided first.** This task's caller is `index.ts`'s boot, straight after `capableModelAtBoot`, because the capable
model's fallback may name one of them.

**Files:**
- Create: `ai/registration.ts`, `ai/gateway-models.ts`, `ai/gateway-models.test.ts`
- Modify: `ai/capable.ts` (its registration body moves to `registration.ts`), `config.ts`, `config.test.ts`, `index.ts` (the boot call
  and the boot line's `gatewayModels`), `ai/capable.docker.test.ts` (one case), `docs/superpowers/RUNBOOK.md`

**Interfaces:**
- Consumes: Task 2's `resolveSetting`, `Gateway`, `ProviderParams`.
- Produces:
  - `interface Registration { name; owns(d): boolean; idPrefix; settingName; setting; params: ProviderParams; classification;
    unpriced?: Price }`;
  - `ensureRegistered(client, r) → { state: 'registered'|'unchanged'|'refused'; model: string; reason?: string }`;
  - `interface GatewayModel { name: string; setting: string; classification: Classification }`;
  - `ensureGatewayModels(client, entries, gateway?) → { models: { name; state; reason? }[] }`;
  - `gatewayModelsAtBoot(client, entries, gateway)`;
  - `config.litellm.gatewayModels: GatewayModel[]`.

- [ ] **Step 1: The refactor, under the existing tests.** Move `Deployment`, `idOf`, `modelOf`, `apiBaseOf`, `positive`, `priced`,
  `pinned`, `removeIfSaved`, `answered`, `create`, `unavailable`, `unpricedReason`, `unservedReason` and the body of
  `ensureCapableModel` after its `setting === undefined` branch into `registration.ts`'s `ensureRegistered`. Substitute
  `r.name` for `CAPABLE_MODEL_NAME`, `r.settingName` for `CAPABLE_MODEL_SETTING`, `r.owns` for the name filter, and
  `${r.idPrefix}${randomUUID()}` for the id. `ensureCapableModel` keeps its removal branch and calls `ensureRegistered` with
  `{ name: CAPABLE_MODEL_NAME, owns: (d) => d.model_name === CAPABLE_MODEL_NAME, idPrefix: 'manifest-capable-', … }`.
  **Run `capable.test.ts`: every case green, none edited.** That is the refactor's only test, so commit it alone.
  ```bash
  git commit -m "refactor(ai): the capable model's registration as ensureRegistered, by name and classification (gateway plan Task 3)"
  ```
- [ ] **Step 2: The failing tests.** `config.test.ts`:
  - `MANIFEST_GATEWAY_MODELS='ubc-onprem=ubc-ai-gateway/qwen-x@confidential, ubc-mini=ubc-ai-gateway/gpt-6-mini@internal'` parses to two
    entries;
  - `''` parses to `[]`;
  - **each of these is a `ConfigError` `CONFIG_GATEWAY_MODELS_INVALID` naming the entry**, never defaulted: no `@`; `@restricted`;
    `openai/x` (not a gateway setting); the name `default-chat-large`; a name twice; `Bad_Name`.

  `gateway-models.test.ts` (with Task 2's `GW`):
  ```ts
  it('registers each entry at its own classification, at the gateway’s address', async () => { /* both entries listed by /model/info,
     max_classification as set, litellm_params.api_base GW.url, ids beginning manifest-gateway- */ })
  it('pins an unpriced CONFIDENTIAL entry at default-chat-onprem’s price — and refuses an unpriced internal one (Review Focus 4)', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/qwen-x', 0)
    lite.price('openai/alias-y', 0)
    const r = await ensureGatewayModels(lite, [
      { name: 'ubc-onprem', setting: 'ubc-ai-gateway/qwen-x', classification: 'confidential' },
      { name: 'ubc-alias', setting: 'ubc-ai-gateway/alias-y', classification: 'internal' },
    ], GW)
    expect(r.models).toEqual([
      { name: 'ubc-onprem', state: 'registered', model: 'ubc-ai-gateway/qwen-x' },
      expect.objectContaining({ name: 'ubc-alias', state: 'refused' }),
    ])
    const onprem = [...lite.deployments.values()].find((d) => d.modelName === 'ubc-onprem')!
    expect([onprem.inputCostPerToken, onprem.outputCostPerToken]).toEqual([1e-6, 3e-6])   // config.yaml:42-43
  })
  it('refuses a name the catalogue already holds — default-chat-onprem stays Ollama — and registers nothing for it', async () => {})
  it('removes an entry the setting no longer lists, and never touches the capable model or a config entry', async () => {})
  it('removes every manifest-gateway- deployment when the setting is empty', async () => {})
  it('a confidential project’s agent gets the confidential entry; an internal entry is never given to it', async () => {
    /* agentModelsFor(await loadModelCatalogue(lite), 'confidential', 'on-premise') contains 'ubc-onprem', not 'ubc-mini' */
  })
  it('at boot: one operator line per refused entry naming MANIFEST_GATEWAY_MODELS and the entry, never fatal; a gateway that does not answer is one line', async () => {})
  ```
- [ ] **Step 3: Run — predict red** at the import of `gateway-models.js`, and at `config.test.ts`'s parse.
- [ ] **Step 4: Implement.**
  - **`config.ts`**: `MANIFEST_GATEWAY_MODELS: z.string().default('')`, then `parseGatewayModels(raw)`. It splits on `,`, trims, and
    skips empties. Each entry must match `^([a-z0-9][a-z0-9-]{0,62})=(ubc-ai-gateway\/[^@\s,]+)@(public|internal|confidential)$`. It
    refuses duplicates and `default-chat-large` with `throw new ConfigError('CONFIG_GATEWAY_MODELS_INVALID', …)`, in
    `config.ts:681`'s pattern, naming the entry and the expected form.
  - **`registration.ts`** gains `unpriced?: Price`. When LiteLLM prices the first registration at `0` and `r.unpriced` is set, the
    pinned re-registration uses `r.unpriced`. Otherwise the existing refusal stands.
  - **`gateway-models.ts`**:
    - `ID_PREFIX = 'manifest-gateway-'`.
    - `standInPrice(client)` reads `/model/info`'s config entry (`model_info.db_model === false`) named `default-chat-onprem` and
      answers its two prices, or `undefined`.
    - `ensureGatewayModels` first removes every `manifest-gateway-` deployment whose name the setting no longer lists. For each entry
      it then:
      1. refuses a name a deployment it does not own already holds;
      2. resolves the setting (Task 2), refusing as `resolveSetting` says;
      3. calls `ensureRegistered` with `owns: (d) => d.model_name === e.name && idOf(d).startsWith(ID_PREFIX)` and, for a
         `confidential` entry, `unpriced: await standInPrice(client)`.
    - `gatewayModelsAtBoot` is `capableModelAtBoot`'s shape: one `[boot] a gateway model (MANIFEST_GATEWAY_MODELS) '<name>' …` line
      per refusal, a thrown outage as one line, never fatal. It answers `{ name, state }[]` or `'failed'`.
  - **`index.ts`**: after `capableModelAtBoot`, `gatewayModelsAtBoot(litellm, config.litellm.gatewayModels, gateway)`. With AI off,
    `'disabled'`. The boot line gains `gatewayModels`.
- [ ] **Step 5: Run the unit files — green.** Then the **Docker case** (`capable.docker.test.ts`): a `confidential` entry at the stub's
  `/gw/ok/v1`, model `openai/probe-onprem-<run>` (unpriced), is registered at `1e-6` / `3e-6`. A key holding only it is charged
  `usage × those` (`spendOf`, as the Task 12b case does). Then the entry is removed with the setting empty, and `LiteLLM_ProxyModelTable`
  holds no `manifest-gateway-` row.
- [ ] **Step 6: RUNBOOK**: a *UBC's AI Gateway's models* subsection covering the setting's form, the names Rich chose, the price rule, the
  `confidential` rule (Decision 7), and **"naming one as `MANIFEST_CAPABLE_MODEL_FALLBACK` loses the offline fallback"**.
- [ ] **Step 7: Commit by name**, then **the negative controls**:
  - **(a)** `unpriced` ignored: predict red at *pins an unpriced CONFIDENTIAL entry*;
  - **(b)** the foreign-name check removed: predict red at *refuses a name the catalogue already holds* (a second `default-chat-onprem`
    deployment appears);
  - **(c)** the `ID_PREFIX` filter removed from the cleanup: predict red at *never touches the capable model*.
  ```bash
  git commit -m "feat(ai): UBC's AI Gateway's models in the catalogue — MANIFEST_GATEWAY_MODELS, each at its own classification (gateway plan Task 3)"
  ```

---

## Task 4: The guard and the gateway's own failures — `[M5]`'s branch

**Its branch is `[M5]`'s.** Its caller is LiteLLM, through `config.yaml`'s `callbacks`.
- **Branch A** (the gateway's own failures arrive as non-malformed statuses): **no code changes.** The Docker case below is written
  anyway, as the witness that they fall back.
- **Branch B** (they arrive as `400` with an attribute `[M5]` named): the guard allows the fallback for exactly those values.
- **Branch C** (they cannot be told apart): **this task does not start until Rich has chosen**, through `manifest-94`. The choices:
  - (i) accept it: a caller is told the gateway's `400`, and no fallback answers;
  - (ii) match the message text `[M5]` recorded, which is brittle across gateway versions;
  - (iii) something `[M5]` suggests.

**Files:**
- Modify (Branch B): `infra/litellm/manifest_guard.py` (one set and one test beside `MALFORMED_STATUSES`; its header's *known limits*
  paragraph)
- Modify: `ai/testing.ts` (the stub answers a `/gwfail/<kind>/v1` path in the shape `[M5]` recorded for (c) and (e)),
  `ai/fallback-guard.docker.test.ts` (two cases)

- [ ] **Step 1: The failing Docker cases** (on Branch A they are green at once, which IS the witness; say so in the record):
  ```ts
  it('the GATEWAY’s own failure — a model it no longer serves, its budget for the platform spent — is answered by the fallback (Review Focus 2)', async () => {
    for (const kind of ['model', 'budget'] as const) {
      const res = await chat({ primary: probe(`gwfail-${kind}`) })
      expect(res.status, kind).toBe(200)
      expect(res.headers.get('x-litellm-attempted-fallbacks'), kind).toBe('1')
    }
  })
  it('POSITIVE CONTROL: a malformed request’s 400 is still the caller’s, with no fallback', async () => {
    const res = await chat({ primary: probe('s400-after-gw') })
    expect(res.status).toBe(400)
    expect(res.headers.get('x-litellm-attempted-fallbacks')).toBeNull()
  })
  ```
- [ ] **Step 2: Run — predict red** (Branch B) at the first `toBe(200)`, as `400`.
- [ ] **Step 3: Implement (Branch B)**, in the file in place:
  ```python
  # THE GATEWAY'S OWN FAILURES (the UBC AI Gateway plan's Task 4, [M5]). UBC's AI Gateway is itself a LiteLLM, and it answers
  # some failures that are ITS, not the caller's, with 400 — <[M5]'s list>. They are the provider failing, so they fall back.
  GATEWAY_FAILURES = frozenset({<[M5]'s values>})

  def _gateway_failure(failure):
      for attr in (<[M5]'s attribute(s)>,):
          value = getattr(failure, attr, None)
          if isinstance(value, str) and value in GATEWAY_FAILURES:
              return True
      return False
  ```
  `refused = status in MALFORMED_STATUSES and not _gateway_failure(failure)`. The header's *known limits* bullet 2 now says which `400`s
  are recognised. Restart `manifest-litellm`, and compare `sha256sum` inside and out.
- [ ] **Step 4: Commit, then the negative control**: `_gateway_failure` returns `False`. Predict red at the first case only, with the
  positive control still green.
  ```bash
  git commit -m "fix(litellm): the guard lets the gateway's own 400s fall back — a model it dropped, its budget spent (gateway plan Task 4)"
  ```

---

## Task 5: An agent key reaches the Responses API (Rich's Q2) — only if `[M4]` measured it needed

**It runs only if Task 1 Step 2.4 measured the capable candidate refusing tools on chat completions. Spec action 2 is decided first.**
Its callers are `startAgentSession` (`ai/sessions.ts`, through `mintAgentKey`) and `startIntakeSession` (through `mintIntakeKey`), which
must NOT gain the route.

**Files:**
- Modify: `ai/agent-keys.ts` (`AGENT_ALLOWED_ROUTES`; `CappedKeyInput.routes`; the two mints), `ai/agent-keys.test.ts`,
  `ai/agent-keys.docker.test.ts`, `api/representations/agents.ts:136`, `api/contract/document.ts` (`1.6.1`), `packages/contract/package.json`,
  the generated files (four commands), `docs/api/agents.md`
- The front-end told BEFORE the commit (Global Constraints).

**Interfaces:**
- Produces: `AGENT_ALLOWED_ROUTES: readonly string[]`, which is `AI_ALLOWED_ROUTES` plus `/v1/responses` plus whatever `[M4]` Steps 3–4
  showed a harness needs (e.g. `/v1/responses/{id}`, in the form `[M4]` measured `allowed_routes` to match).
- Produces: `CappedKeyInput.routes: readonly string[]`.

- [ ] **Step 1: The failing tests.** `agent-keys.test.ts`:
  ```ts
  it('mints an AGENT key with the Responses API beside the three routes — and an INTAKE key with the three alone', async () => {
    const lite = fakeLiteLlm()
    await mintAgentKey(lite, { /* … as the existing case */ })
    await mintIntakeKey(lite, { /* … */ })
    const [agent, intake] = lite.calls.filter((c) => c.path === '/key/generate').map((c) => c.body as { allowed_routes: string[] })
    expect(agent!.allowed_routes).toEqual([...AGENT_ALLOWED_ROUTES])
    expect(agent!.allowed_routes).toContain('/v1/responses')
    expect(intake!.allowed_routes).toEqual([...AI_ALLOWED_ROUTES])
    expect(intake!.allowed_routes).not.toContain('/v1/responses')
  })
  ```
  `agent-keys.docker.test.ts`, on `default-chat`, offline, as `[M4]` Step 6 measured LiteLLM to bridge it:
  ```ts
  it('an agent key is answered on /v1/responses; an intake key is refused it with LiteLLM’s route refusal', async () => {
    const agent = await respond(agentKey, 'default-chat')
    expect(agent.status).toBe(200)
    const intake = await respond(intakeKey, 'default-chat')
    expect([intake.status, intake.type]).toEqual([/* [M4] Step 5's status and type */])
  })
  ```
- [ ] **Step 2: Run — predict red** at `toContain('/v1/responses')`, and at the Docker case's `200`.
- [ ] **Step 3: Implement.** In `agent-keys.ts`:
  ```ts
  /**
   * AN AGENT KEY ALSO REACHES THE RESPONSES API (§10 as Spec action 2 of the UBC AI Gateway plan amends it): the capable model answers
   * a tool-calling agent only there (S5; the gateway plan's [M4]). App and intake keys keep the three routes.
   */
  export const AGENT_ALLOWED_ROUTES: readonly string[] = Object.freeze([...AI_ALLOWED_ROUTES, '/v1/responses' /* , [M4]'s */])
  ```
  `CappedKeyInput` gains `routes: readonly string[]`, and `mintCappedKey` sends `allowed_routes: [...input.routes]`. `mintAgentKey` passes
  `AGENT_ALLOWED_ROUTES`, and `mintIntakeKey` passes `AI_ALLOWED_ROUTES`. `agents.ts:136`: *"Where the key is used: an OpenAI-compatible
  API (`/chat/completions`, `/responses`, `/embeddings`, `/models`). An agent that calls tools on the capable model uses `/responses`."*
  Then:
  - `CONTRACT_VERSION = '1.6.1'`, with a comment paragraph in `document.ts`'s pattern stating the change (a description only);
  - `packages/contract/package.json`;
  - the four commands.

  `docs/api/agents.md` gains one paragraph saying the same in its own words.
- [ ] **Step 4: Run** the unit file, `api/contract/docs.test.ts`, and the contract's version tests: green.
- [ ] **Step 5: Tell the front-end** (`ListAgents`; its live `manifest-app-…`): `1.6.1`, a description only, nothing to adopt. **Then
  commit by name**, and run **the negative control**: `mintAgentKey` passes `AI_ALLOWED_ROUTES`. Predict red at both new cases.
  ```bash
  git commit -m "feat(ai): agent keys reach /v1/responses — the capable model calls tools only there; contract 1.6.1 (gateway plan Task 5)"
  ```

---

## Task 6: The acceptance — `make demo-gateway`, and a person watching the gateway

**Alone, and last. It needs the network and the key**, so it is in no offline or CI step (Decision 10). Its caller is the `Makefile`.

**Files:**
- Create: `packages/journey/src/gateway.ts`, `scripts/demo-gateway.sh` (the sign-in prelude of `scripts/demo-launch.sh`, copied),
  `scripts/gateway-controls.sh` (restore-safe: stop, start with a changed setting, run, restore by `trap`, in
  `.superpowers/sdd/2026-09-30-faculty-ready/s5-edge-proof.sh`'s pattern)
- Modify: `Makefile` (`demo-gateway: up` and `.PHONY`), `docs/superpowers/RUNBOOK.md` (*make demo-gateway*), ORIENTATION §2's table (a
  row)

- [ ] **Step 1: The phases**, each ending `every check passed`, on whichever driver the control plane runs (it touches no source):
  0. **Configured?** LiteLLM's `/model/info` (master key) shows `default-chat-large`'s `api_base` equal to the gateway's address and at
     least one `manifest-gateway-` entry. Otherwise it prints `NOT RUN — the gateway is not configured (RUNBOOK, UBC's AI Gateway)` and
     exits `2`.
  1. **The catalogue:** `default-chat-large` and each gateway name at the gateway's address and its classification. `default-chat` and
     `default-chat-onprem` still at `http://host.docker.internal:11434`.
  2. **An `internal` project's agent session** (`startAgentSession`, as `launch.ts:1662`):
     - its models hold `default-chat-large` and the `internal`-or-above gateway names;
     - a chat on `default-chat-large` answers `200` with content;
     - a STREAMED one ends `[DONE]` with content frames;
     - `getAgentBudget`'s spent rose by `usage × the pinned price`, within a cent.
  3. **The Responses API with a tool** (only if Task 5 ran): `POST {baseUrl}/responses` with one function tool and a prompt that
     requires it answers `200` with a `function_call` output item, streamed and not.
  4. **A `confidential` project's session** (the builder setting `capable`): its models hold the `confidential` gateway names and
     `default-chat-large`, and NOT `default-chat`. A call to a `confidential` gateway name answers `200`, charged at the stand-in's price.
  5. **The key, by COUNT** (Global Constraints): `0` occurrences in `docker logs manifest-litellm`, in the control plane's log, and in
     the journey's own output.
  6. Both sessions ended.
- [ ] **Step 2: Green three times** (a fresh project each run, then re-use). **Every other demo stays green** where it was last green,
  above all `make demo-frontend` and `make demo-launch`, which read `default-chat-onprem`. Then `make ci-acceptance`, whose steps never
  touch the gateway.
- [ ] **Step 3: The negative controls**, in `scripts/gateway-controls.sh` for Rich if the classifier refuses the restarts. Each is seen
  red where predicted and restored:
  - **(a)** `MANIFEST_UBC_AI_GATEWAY_URL=http://127.0.0.1:9/v1`: phase 2's chat is answered by `default-chat-onprem`
    (`x-litellm-attempted-fallbacks: 1`, the model `ollama_chat/qwen3.8:27b`). The check *"answered by the gateway"* goes red, which
    stands in for the network being off.
  - **(b)** the control plane started with `UBC_AI_GATEWAY_API_KEY=` empty: the boot line's `capableModel` reads `refused`, with the
    one line, and phase 0 reads `NOT RUN`.
  - **(c)** a malformed request on `default-chat-large` (`max_tokens: -1`): the gateway's `400` reaches the caller, with no
    `x-litellm-attempted-fallbacks`.
  - **(d)** `MANIFEST_GATEWAY_MODELS` emptied: the entries are gone from `/model/info`, and phase 4 goes red.
- [ ] **Step 4: The person.** Rich runs phase 2 while his gateway admin UI is open, and **his key's spend moves by the same call**. If
  the faculty front-end runs against 7100 by then, he builds a small app on `app.manifest.internal`, and its agent session's capable
  calls are the gateway's. **He types every password** (or a staged headless sign-in, as his standing yes allows on `manifest.internal`).
- [ ] **Step 5: The plan's one whole-branch review**, beside the Docker tier, then one fix wave.
- [ ] **Step 6: Close out**:
  - the ledger;
  - ORIENTATION §7e (next: FE-46/47/5's plan) and §8 (the gateway as provider, *Decided*, built; *Open*'s Canada question gains `[M6]`
    and `[M9]`);
  - TRAPS (what `[M3]`–`[M7]` measured);
  - the front-end told;
  - `manifest-94` told.

---

## What this plan does not build

- **Replacing Manifest's LiteLLM with UBC's** (rejected by Rich, 15:28). Manifest never holds the gateway's master key.
- **A gateway-side fallback check.** The platform cannot see the gateway's router. Whether a gateway model falls back off UBC's hardware
  is Rich's statement (`[M9]`), and a `confidential` entry rests on it (Decision 7).
- **Repointing `default-chat-onprem` or `default-chat` at the gateway** (Rich's Q1). The stand-ins stay the offline floor. At UBC,
  production's own `config.yaml` points its on-premise entries at the gateway; that is the production configuration's work (A1 or later).
- **A price in a setting.** An alias LiteLLM cannot price is fixed at the gateway (Decision 6).
- **LiteLLM's four leaks** (tracked for before production). Through the gateway, `x-litellm-model-api-base` names the gateway to every
  app; that is recorded here and not fixed.
- **Embeddings through the gateway.** `default-embed` stays Ollama. An embedding model on the gateway could be a `MANIFEST_GATEWAY_MODELS`
  entry, but the catalogue's `kind` reads `mode: embedding`, which this plan never sets. A later line if Rich wants one.
- **The gateway's own spend in Manifest's console.** Manifest's budgets bind on Manifest's LiteLLM; the gateway's spend for the key is
  Rich's to read there.
- **ORIENTATION §8 *Open*'s embedding `encoding_format` bug** (*"cheap to settle the first time anyone has a provider key"*). Task 1 may
  settle it in passing if the gateway serves an embedding model; it is not owed.

---

## Spec actions

**TWO, DRAFTED 2026-10-03 WITH THIS PLAN. NEITHER IS APPLIED.** Each is decided by Rich before the sitting that builds it, and applied
only after he has read the words. **A spec action is not finished when the spec changes**: the shared HTML pages restate it, and are
swept with it.

### 1. §7, §21 and §26 — UBC's AI Gateway as the platform's upstream provider (before sitting 2)

**Why.** Rich decided it at 15:28 (*"As the upstream provider"*), and decided the shape of its models at 15:42 (Q1 (a)). The spec still
says the capable model is *"a commercial provider's"*, reached *"through the same LiteLLM"*, and names no way to add the gateway's models.

**Proposed**, five edits:
- **§7, the catalogue block** — `default-chat-large`'s comment: *"# the capable model — a commercial provider, off-prem"* becomes
  *"# the capable model — a commercial provider through UBC's AI Gateway, off-prem"*.
- **§7, the capable model's paragraph**, its second sentence: *"Which model answers it is a platform setting (§26) — a commercial
  provider's today — so repointing it changes no app, key or manifest."* becomes:
  > *"Which model answers it is a platform setting (§26) — a commercial provider's, reached through **UBC's AI Gateway**, a LiteLLM proxy
  > LTIC runs on UBC infrastructure — so repointing it changes no app, key or manifest."*
- **§7, a new paragraph after *"Its fallback is the on-premise model."*'s**:
  > *"**UBC's AI Gateway is the platform's upstream provider, not its gateway.** Manifest's own LiteLLM keeps every key it mints, every
  > budget and every guard (§10, D7), and reaches the AI Gateway with ONE platform credential that only it holds — referenced from its own
  > environment, never stored with a model, and never seen by the control plane. Besides the capable model, an administrator may add
  > models the AI Gateway serves to the catalogue under logical names of their own (§26), each at the `max_classification` the
  > administrator gives it — `confidential` only for a model that runs on UBC's hardware with no fallback off it, which the platform
  > cannot see and the administrator attests. A model the platform cannot price is refused, except an on-premise one, which is charged
  > the on-premise model's synthetic price so budgets bind. Every such entry needs the network; `default-chat` and the on-premise model
  > a laptop runs stay local, so nothing offline depends on the AI Gateway (C1)."*
- **§21, the LiteLLM row**: *"The capable model, when configured, is a commercial provider reached through the same LiteLLM with the
  network on"* becomes *"The capable model, when configured, is a commercial provider reached through UBC's AI Gateway — this LiteLLM's
  upstream provider, with one credential only it holds — with the network on"*.
- **§26, *Platform settings***: *"and the capable model's provider and model, and its fallback,"* becomes *"and the capable model's
  provider and model, and its fallback, the AI Gateway's address and the catalogue entries it answers (§7),"*.

*Options:*
- **(a) as proposed** (recommended);
- **(b) without the price sentence**, leaving price to the plan. A reader of §7 would then not know a gateway model can be refused for
  its price.
- **(c) a D-row of its own** (a new decision, D35, in the decisions table) instead of a paragraph in §7.

**Shared pages.** `manifest-schematic.html:1072`: *"a commercial provider's for now"* becomes *"a commercial provider's, through UBC's
own AI Gateway, for now"*. `manifest-decisions.html:137` (D17's why) speaks of a model in the United States, so check it; it is
unchanged unless (c). `manifest-phases.html` and `manifest-stories.html`: no mention (checked).

### 2. §10 — an agent key also reaches the Responses API (before sitting 2; ONLY IF `[M4]` MEASURES IT NEEDED)

**Why.** Rich's Q2 (*"Yes, in this plan, if measured"*). S5 measured that the capable model answers a tool-calling agent only on
`/v1/responses` (`spikes/S5-findings.md:89-93`), and §10 confines every key to three routes. S5's own spec row (its *Spec actions*,
last row) proposed naming the Responses API, and this is that row, made exact.

**Proposed**, one edit:
- **§10**, *"**Every key Manifest mints carries `allowed_routes`**, restricting it to `/v1/chat/completions`, `/v1/embeddings` and
  `/v1/models`."* becomes:
  > *"**Every key Manifest mints carries `allowed_routes`**, restricting it to `/v1/chat/completions`, `/v1/embeddings` and `/v1/models`
  > — and an **agent** key also to the Responses API (`/v1/responses`<, and [M4]'s routes>), because the capable model answers a
  > tool-calling agent only there. App and intake keys keep the three."*

  §10 l.1075's *"whose key `allowed_routes` confines to three routes"* is the app key's, and stays.

*Options:*
- **(a) as proposed** (recommended);
- **(b) every key**: an app could then call tools on the capable model too. Nothing asks for it, and it widens what every app key may do.

**Shared pages.** None mentions a key's routes (`grep` of the four pages, 2026-10-03). Check again when applying.

---

## What the self-review caught

- **The key's mechanics.** The first draft had the Docker case's stub record the `Authorization` header. A probe deployment that names no
  key may carry LiteLLM's real `OPENAI_API_KEY` there (Read this first 14). So the stub now records only whether the header matched a
  harmless expected value, and the case resolves a non-secret variable already in LiteLLM's container (`STORE_MODEL_IN_DB`).
- **A `401` from a LiteLLM echoes part of the key it was sent**, so every captured body goes through `redact.pl`. `[M5]`'s wrong-key case
  uses a canary, never Rich's key.
- **The repoint direct → gateway** expands to the same model string. It became *Review Focus* 5 and Task 2's first capable case.
- **`keyInEnv` from the scrub's removed list** would count an EMPTY `.env` line as set, because the scrub removes defined variables.
  `loadConfig` therefore reads the variable once and keeps only `!== ''`.
- **Task 5's Docker case cannot use the gateway** (the tier is offline). It rests on `[M4]` Step 6, LiteLLM bridging `/v1/responses` for
  `default-chat`. If that measures *no*, the case moves to `make demo-gateway`'s phase 3 alone, and the record says so.

---

## What executing this plan found

*Nothing yet. Each sitting adds a dated entry: every defect with the measurement that found it, every negative control (and which could
not fail, and why), the gate numbers and the machine at the close.*
