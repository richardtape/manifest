# UBC's AI Gateway as Manifest's Upstream Provider — Implementation Plan

> **WRITTEN 2026-10-03, ~15:35–16:00 PDT, BY `manifest-b7`, AT RICH'S WORD**, relayed by the coordinator `manifest-94`. Rich decided
> the shape, the placement and the writer at **15:28** (`../2026-09-30-decisions.md`, its 15:28 entry): *"As the upstream provider"*,
> *"Right after faculty-ready"*, *"A fresh platform session now"*. **He answered this plan's two questions at 15:42**, through
> `manifest-94`, each as recommended (*Decided by Rich*, below). **Every fact in *Read this first* was read from the code at `d1e7eae`**
> while `manifest-9d` held the faculty-ready plan's sitting 5b (`ORIENTATION.md`, `TRAPS.md`, `external-track.md` and that plan
> uncommitted). Line numbers WILL have moved by the time this runs, and Task 1 re-reads each one marked *(T1: M<n>)*.
> **Two spec actions are drafted below. Spec action 1 is APPLIED (Rich, 2026-10-03, 20:03 PDT: as proposed, its price sentence reading "a `confidential` one" for "an on-premise one"); Spec action 2 is not.** No task that a spec action changes runs before Rich has read and
> decided its words. At 15:57 PDT Rich sent the plan to a quick fresh review first (a read-only agent of `manifest-94`), and chose
> **INLINE execution, a fresh session per sitting** (`superpowers:executing-plans`).

> **APPROVED — Rich, 2026-10-03, 16:13 PDT**, through the question tool, on the fresh review
> ([`2026-10-03-review-of-ubc-ai-gateway-plan.md`](./2026-10-03-review-of-ubc-ai-gateway-plan.md)): ***"Approve with the fixes
> (Recommended)"*** — approved once a fresh session applied the review's fixes, before sitting 1. **Applied 2026-10-03, 16:22–16:40
> PDT (from the clock), by `manifest-cd`**, every fix the review lists, built into the tasks below and each marked with the review's id (*C1*, *I1*–*I10*,
> *M1*–*M11*), **except the one Rich declined: *"Keep it as a backup"*** (over the review's *"required removal at sitting 2's
> close"*) — **`OPENAI_API_KEY` stays in `.env` and in LiteLLM's environment**, and removing it is no step of this plan. His other
> answers of 16:13 are built in: the `.env` line commented now and uncommented only after sitting 1 scrubs it (Task 0); the virtual
> key's ceiling set before sitting 2 — **set by Rich at 16:23 PDT: a 20 USD budget that resets monthly, and a 90-day expiry, about
> 2027-01-01** (`../2026-09-30-decisions.md`, its 16:23 entry). Read *Decisions* 4, 11 and 12 first: they are where the fixes
> changed the plan's shape.

> **EXECUTED 2026-10-04, 01:20 PDT** — three sittings (`manifest-ec`, `manifest-61`, `manifest-be`, coordinated by `manifest-af`); Task 5
> dropped, **Task 6a added** (LiteLLM re-pinned to 1.102.0 — F32); three spec actions (1 and 3 applied, 2 not needed). *What executing this
> plan found* is the record.

> **For agentic workers:** REQUIRED SUB-SKILL: **superpowers:executing-plans (inline)** — Rich, 2026-10-03, 15:57: inline, **a fresh
> session per sitting**. Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9, which that skill will push you against.

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
    control plane nor LiteLLM's database ever holds the key;
  - **a `timeout`** from `[M2]`'s measured latencies, so a black-holed gateway falls back in seconds, not LiteLLM's 600 (*M10*).

  Every other setting passes through unchanged, so `openai/gpt-6-luna` still reaches OpenAI directly with `OPENAI_API_KEY`, which
  stays as a backup (Rich, 16:13).
- **The boot FAILS CLOSED** (*C1*): when `.env` carried no gateway key it REMOVES every gateway registration rather than keeping it,
  because a keyless gateway registration can only fail silently or send another provider's key to UBC (Decision 4). `make verify`
  compares a FINGERPRINT of the key in LiteLLM's environment with `.env`'s, and `make doctor` warns ahead of the key's expiry
  (Decisions 4 and 11).
- **`ai/capable.ts`'s registration machinery moves into `ai/registration.ts`**, parameterised by name and classification. The capable
  model and the new **`MANIFEST_GATEWAY_MODELS`** (`<name>=ubc-ai-gateway/<model>@<classification>,…`) both go through it, at every
  boot, through `/model/new`. Its price rule is unchanged, with one addition: a `confidential` gateway model LiteLLM cannot price is
  pinned at the on-premise stand-in's synthetic price.
- **The fallback guard learns the gateway's own failures**, but only if Task 1 measures that they arrive as `400` (Task 4's branch).
- **Agent keys gain `/v1/responses`**, but only if Task 1 measures that the gateway's capable model refuses tools on chat completions
  through both hops (Task 5, Spec action 2).
- **The gateway's key is scrubbed from the control plane's environment FIRST** (Task 0, sitting 1, *I1*), before its `.env` line —
  commented by `manifest-94` at 16:14 — is uncommented.

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

**Successor:** [`2026-10-03-fe46-fe47-fe5.md`](./2026-10-03-fe46-fe47-fe5.md) (approved). **Task 5 DROPPED at sitting 1, so the contract
it inherits is `1.6.0`** (Decision 9 does not apply). Then A1, B, FE-32, Phase 3, A2, the vulnerability database and FE-45 (ORIENTATION §8
*Decided*). **Phase 3 does NOT inherit Task 5** — the capable model takes tools on chat completions through both hops (`[M4]`.8). **It
inherits Rich's binding rule instead** (the decisions file, 20:52): when Phase 3 first gives any Manifest key `/v1/responses`, its plan
forces `store: false` OR refuses `GET /v1/responses/{id}` and `…/input_items`, with a test that one key cannot read another's answer —
because responses are stored by default and every Manifest key reaches the gateway on ONE upstream key (`[M4]`'s STOP, `[M4c]`).

---

## How this plan is to be executed — sittings, one per session

**One sitting per session, with a check-in at each boundary.** This plan commits after every task.

> **THREE SITTINGS, FOUR IF SITTING 2 SPLITS.** Sitting 1 is Task 0 (the key scrubbed, then its `.env` line uncommented, *I1*) and
> then Task 1, because Task 1 needs the network and Rich's key, and its answers pick the branches of Tasks 4 and 5. Tasks 2–5 share
> sitting 2, so the Docker tier runs once — **with a declared STOP POINT after Task 3** (*M11*): if Task 1 lands Task 4 on Branch B
> AND Task 5 runs, sitting 2 ends after Task 3 and **sitting 2b** takes Tasks 4 and 5, each sitting running the Docker tier once at
> its close (one more ~20–23 min run is the price of fitting in a session); otherwise sitting 2 continues past the stop point if the
> session has room, and splits there if it does not. The acceptance is alone and last.
>
> **SITTING 1 SETTLED IT (2026-10-03):** Task 5 is DROPPED (`[M4]`.8 — the capable model takes tools on chat completions through both
> hops) and Task 4 writes no guard code (Rich, 21:17: Branch C (i)), so the forced split cannot happen. **Sitting 2 is Tasks 2, 3 and 4**,
> and splits at its stop point only if the session runs out.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Spec action needed first | Status |
|---|---|---|---|---|---|
| 1 | 0, 1 | **The key scrubbed, then uncommented** (Task 0: one name in `secrets/scrub.ts` and its test, the four gates, a commit, THEN the `.env` line). **The measurements** (the network on, Rich's key and his tiny-budget probe key): the gateway's models, the key's ceiling and expiry; chat, streamed and not, through both hops; `/v1/responses` through both hops, with a tool, its spend and its stored responses; the error shapes the guard meets, streamed too; the price Manifest's LiteLLM records against the gateway's own charge; where the key goes in four cases on both providers; each model's classification, in Rich's words | **Not the tier — ONE file**: Task 0's scrub name is executed by one Docker case only, `boot.docker.test.ts` (its `:135` asserts `secretsScrubbed >= 3`; grepped 2026-10-03), so that file runs alone, as the lean budget rules for a change one Docker file executes. The four gates, `pnpm test` twice, are owed by Task 0 | — | ✅ **DONE 2026-10-03** (19:59–21:17 PDT, `manifest-ec`): Task 0 `90bca1e`, Task 1 `ec8a755` — *What executing this plan found*, *Sitting 1* |
| 2 | 2, 3 — **stop point** — 4 (**Task 5 DROPPED**) | **The capable model through the gateway**, the key by reference only, failing closed. **The gateway's own models**, from one setting. **Task 4: no guard code** (Rich, 21:17: Branch C (i)) — its witness Docker cases only. *Contract stays `1.6.0`.* | Yes — `ai/`, `infra/` | **1** (§7, §21, §26) — **APPLIED 20:03**; **2** — **NOT NEEDED** (`[M4]`.8) | ✅ **DONE 2026-10-03** (21:27–23:10 PDT, `manifest-61`): Task 2 `3c05c7f` (+ `75ed30b`), Task 3 `475dfcb` + `13f351c`, Task 4 `a1fad27` + `f439fc6` (F5) — *What executing this plan found*, *Sitting 2*; the tier owed and run |
| 2b | 4 — **only if sitting 2 runs out of room at its stop point** | As sitting 2's last task | Yes — `ai/` | — | **NOT NEEDED** — sitting 2 took Task 4 |
| 3 | 6, **6a** (added: F32) | **The acceptance**: `make demo-gateway` three times, its controls seen red, every other demo still green, the plan's one whole-branch review, and Rich watching the gateway's spend move — compared by a DIRECT call's `x-litellm-key-spend` (the key's own `/key/info` answers `403`, `[M1]`; and since sitting 2's F5 strip, Manifest's answers no longer carry the gateway's `llm_provider-x-litellm-key-spend`), not by eye. **Task 6a: LiteLLM re-pinned to 1.102.0** — a streamed call charged its provider's usage (F32; Rich, 23:31 and 23:40) | Yes — run TWICE: the whole tier on 1.102.0, then the fix pass's three files alone | **3** (§21, §10's dated sentence) — **APPLIED** `b0bd6a7` (Rich, 23:47) | ✅ **DONE 2026-10-04** (23:10–01:20, `manifest-be`): Task 6 `239c69d`, Task 6a `32e9b7a`, the fix pass `a84c856` + `6565a10` — *What executing this plan found*, *Sitting 3*. **THE PLAN IS EXECUTED** |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. **The four gates**, from the repository root: `pnpm test` (twice, alone, on the final tree), `pnpm lint`, `pnpm typecheck` and
   `pnpm format:check`. Add **`pnpm test:docker`** when the table says it is owed. **The test budget is LEAN** (ORIENTATION §8
   *Decided*): no open run on an unchanged tree, single files while fixing.
2. **A dated entry in *What executing this plan found*.** It lists every defect with the measurement that found it, and every negative
   control, including which could not fail and why. It ends with the gate numbers and the machine, queried at the close.
3. **This plan's sittings table.** Mark the sitting done and move the `← next` marker. State no findings count here.
4. **The close-out sweep in ORIENTATION §6.** The gate numbers live in `scripts/ci-acceptance.sh`'s `EXPECT_` lines (their one statement).

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Moving task boundaries is Task 1's job. **If a measurement breaks the split, say so to Rich
before sitting 2.** Four rules survive any re-cut:
- Task 0 is first, and its commit lands before the `.env` line is uncommented.
- Task 1 follows it, alone: no other task's code is written in sitting 1.
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

**At 15:57 PDT** (its 15:57 entry): *"Quick review first (Recommended)"* and *"Inline, a fresh session per sitting (Recommended)"*.

**At 16:13 PDT**, on the fresh review (its 16:13 entry), through the question tool:
- **THE PLAN — *"Approve with the fixes (Recommended)"***: approved once a fresh session applied the review's fixes (done; the header).
- **`OPENAI_API_KEY` — *"Keep it as a backup"*** (over the recommended *"required removal at sitting 2's close"*). It stays in `.env`
  and in LiteLLM's environment. **No step of this plan removes it or asks Rich to.** The review's other *C1* fixes — fail closed,
  `[M7]`'s four cases, the fingerprint — still apply, and matter MORE because the key stays (Decision 4).
- **THE KEY IN `.env` NOW — *"Comment out the .env line (Recommended)"***: `manifest-94` prefixed `UBC_AI_GATEWAY_API_KEY=` with `# `
  at 16:14 without reading its value. **Task 0 adds the scrub entry and its test, commits, and THEN uncomments the line** — a Rich-step,
  or an agent's `sed` that reads no value. *Over:* a scrub-list change at once (it would have voided faculty-ready sitting 5b's final
  gates).
- **THE VIRTUAL KEY'S CEILING — *"Yes, before sitting 2 (Recommended)"***: Rich sets a max budget and a budget duration on the key in
  the gateway's admin UI, and the figure is recorded.

**At 16:23 PDT** (its 16:23 entry; relayed by `manifest-94`): **the ceiling is SET — a 20 USD budget that resets monthly, and a
90-day EXPIRY, about 2027-01-01.** The Rich-step before sitting 2 is done; `[M1]`.3 reads both back. Two consequences, both built
below: a $20 monthly cap makes the gateway's own budget-exhausted answer (`[M5]`(e)) a REAL case on this laptop, so measuring it is
REQUIRED, on a separate tiny-budget key; and an expired key answers `401`, which the guard falls back from silently — the same shape
as *C1* — so `make doctor` warns ahead of the expiry (Decision 11).

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

1. **Review this plan — DONE: APPROVED at 16:13 with the fixes** (the header), which `manifest-cd` applied. **The execution method is
   chosen: inline, a fresh session per sitting** (15:57). Re-cutting the sittings remains his at any boundary.
2. **The key. DONE 2026-10-03, ~15:40 PDT**: Rich generated a VIRTUAL key on the gateway and added `UBC_AI_GATEWAY_API_KEY` to `.env`
   (`manifest-94`'s message, 15:42). `.env.example` already carries its commented line (`20c65ca`, by `manifest-94` at his request), so
   **no task adds that line again** (Tasks 2 and 3 add the OTHER settings' lines, *M6*). **Its `.env` line is COMMENTED since 16:14**
   (*I1*); Task 0 uncomments it. **Its ceiling: DONE 16:23** — 20 USD a month, expiring about 2027-01-01 (*Decided by Rich*).
3. **At sitting 1**:
   - **The network on.**
   - **After Task 0's commit, the `.env` line uncommented** — by him, or by the agent's `sed` that reads no value, at his word.
   - **For each model `[M1]` lists, where it runs** (a commercial provider, or UBC's own hardware such as Pickerel) **and the
     classification he gives it.** Only a model on UBC's hardware may be `confidential` (Decision 7).
   - **As the gateway's administrator, three facts the platform cannot see** (`[M9]`):
     - whether the gateway retains prompts (its `store_prompts_in_spend_logs`);
     - whether any model there has a gateway-side fallback, and to what;
     - the virtual key's own rate limits and model list (its budget and expiry are set — `[M1]`.3 reads them back).
   - **REQUIRED (*I9*; `manifest-94`, 16:23): a second virtual key, the PROBE key** — a tiny budget (e.g. `$0.0001`) and a model list of
     exactly ONE model the gateway serves, named for the measurement (e.g. `manifest-gw-probe-<date>`). **He writes it to a file OUTSIDE
     the repository and outside `.env`** — the path the sitting names, one line `GW_PROBE_KEY=<value>`, `chmod 600` — so no scrub entry is
     needed and no control-plane start can export it. `[M5]` measures (c)'s second form on it, then spends its budget to measure (e).
     **The file is removed at Task 1's Step 10, and he deletes the key at the gateway** after it. The real key's $20 is never spent to measure.
   - **`UBC_AI_GATEWAY_KEY_EXPIRES=<YYYY-MM-DD>` in `.env`** (Decision 11), from `[M1]`.3's reading — not a secret, so the agent may
     append it at his word.
4. **Read and decide Spec action 1 before sitting 2.** Read and decide **Spec action 2** before sitting 2, too, **if** `[M4]` says Task 5
   runs.
5. **At sitting 2's close**:
   - his `.env` lines: `MANIFEST_CAPABLE_MODEL=ubc-ai-gateway/<the model he picks from [M1]>` and
     `MANIFEST_GATEWAY_MODELS=<names he chooses>`;
   - `make up`, so LiteLLM is created with the key;
   - a control plane restart (a restore-safe script if the classifier refuses the agent).
   - **`OPENAI_API_KEY` STAYS** (Rich, 16:13: *"Keep it as a backup"*). A direct `openai/…` setting still uses it; the fail-closed boot
     (Decision 4) and `[M7]`'s measurement are what keep it from the gateway.
6. **Sitting 3**:
   - he runs `make demo-gateway` (or lets the session run it) with the network on;
   - he watches his key's spend move in the gateway's own admin UI — while phase 2 compares the same move by `/key/info`, not by eye
     (*I8*);
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
   ALL OF `.env`*). **`UBC_AI_GATEWAY_API_KEY` IS NOT IN THE LIST TODAY** (the review's *I1*, checked at `e8a2266`): a restart from
   `.env` would export it into `runtime/docker/builder.ts:441` and `source/scan-commits.ts:145`, which both spawn with
   `{...process.env}`. **That is why `.env`'s line is commented since 16:14, and why Task 0 comes first.** The Docker tier's only scrub
   assertion is `boot.docker.test.ts:135`, `expect(boot.secretsScrubbed).toBeGreaterThanOrEqual(3)`, which a new name cannot move.
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
14. **The stub provider** (`ai/testing.ts:654-720`) counts hits by path and logs nothing. **Every probe deployment that reaches it today
    NAMES a key that is not a key** — *corrected by the review's M1; the first draft said they named none*:
    `fallback-guard.docker.test.ts:179` sends `api_key: 'probe-not-a-key'`, and `capable.docker.test.ts:118` (`unreachableCapable`)
    `'sk-probe-not-a-key'`. The one keyless deployment, `capable.docker.test.ts:309`, is `ollama_chat` at `127.0.0.1:9`, where nothing
    listens. **So no current probe sends `OPENAI_API_KEY` to the stub — but the mechanism is live**: LiteLLM's `openai/` provider very
    likely reads `api_key or … get_secret("OPENAI_API_KEY")`, so any future `openai/` deployment with no key, an EMPTY one, or a
    reference that resolves to nothing would send it. *(T1: M7 — four cases, measured.)* **Rule for this plan: every deployment aimed
    at a stub names a literal canary `api_key`, or `os.environ/MANIFEST_STUB_BEARER`** (*I3*; Task 2).
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

*Added 2026-10-03 by `manifest-cd`, applying the review — each read at `e8a2266`:*

18. **The capable model's fallback is set INSIDE `capableModelAtBoot`** (`capable.ts:454-458`, after `ensureCapableModel`), and
    `unfit` (`:302-312`) refuses a fallback name *"not in the model catalogue"*. A gateway model registered AFTER it could never be the
    fallback on a fresh registration (*I5*). **So `gatewayModelsAtBoot` runs BEFORE `capableModelAtBoot`** (Task 3).
19. **The fake LiteLLM seeds a config entry's INPUT price only** (`ai/testing.ts:282-292`), and `outputCostOf` (`:329-331`) reads `0`
    for an `ollama_chat/` model with none (*M2*). Task 3's stand-in price reads both, so Task 3 changes the seeding.
20. **`capable.docker.test.ts`'s own helpers** (`:84-150`): `leaveNone`, `startingClear` (asserted clear of the REAL capable model before
    a case registers its own — the file's rule), `unreachableCapable`, `chat(key)`, `spendOf(client, key)`; keys are minted inline with
    `client.post('/key/generate', …)` (`:254`). **There is no `keyFor`, `STUB_HOST` or `GW_STUB_PORT`** (*M3*). **Port 7199 is
    `fallback-guard.docker.test.ts:48`'s stub**; no code uses **7193** (`grep` of `packages/*/src`, `scripts`, `infra`, `Makefile`).
21. **`config.ts:688-706` refuses a plain-`http` GitHub URL off loopback** (`CONFIG_GITHUB_INSECURE_URL`: *"a GitHub installation token
    may cross only loopback in plaintext"*), and `:304-307` is the *empty is unset* pattern (`z.preprocess((value) => (value === '' ?
    undefined : value), …)`). The gateway's URL takes both (*I10*).
22. **The capable model's pinned price omits cache reads** (`capable.ts:228-234`: input and output only), while S5 found 97% of the
    capable model's tokens were cache reads at about a tenth of the input price (`spikes/S5-findings.md:354-355`) (*I8*).
23. **`make doctor` counts a warning check** (`scripts/lib/check.sh:27-38`: `check_warn` adds to `CHECKS_RUN` and never fails the run),
    sources `.env` inside a check (`scripts/doctor.sh:335-336`), and warns on the vulnerability database's age (`:480-505`) — the
    pattern Decision 11 copies. Its `.env` check (`:507-519`) compares `.env` with `.env.example`'s UNCOMMENTED keys, so a new
    `.env.example` line stays commented.
24. **`default-chat` is priced synthetically** (`infra/litellm/config.yaml:26-27`, $1 / $3 a million), so a Docker case on it can
    assert spend exactly — Task 5's does (*I7*).

---

## Decisions this plan makes, and why

1. **THE SETTING FORM IS `ubc-ai-gateway/<the gateway's model name>`**, one string in the settings that exist. A repoint stays one `.env`
   line, and the setting says where it goes.
   - *Rejected:* a separate `MANIFEST_CAPABLE_MODEL_PROVIDER`. Two settings can disagree.
   - *Rejected:* a raw `api_base` setting. It puts the gateway's address in every model setting.
   - *To change course:* `resolveSetting` is the one place.
2. **LiteLLM'S `openai/` PROVIDER, NOT `litellm_proxy/`.** The guard's statuses (`manifest_guard.py:15-18`) and F8's `422` (`:58-66`, the
   OpenAI provider's retry loop) were measured on LiteLLM's OpenAI provider, and S5 measured `openai/` answering `/v1/responses` natively.
   **Task 1 tries `litellm_proxy/` only if `openai/` fails a check**, and then this decision is re-made in its record — **with one
   exception (*C1*): `[M7]` measures BOTH providers.** `litellm_proxy/` falls back to `LITELLM_PROXY_API_KEY`, which LiteLLM's
   environment does not hold, so an unresolved reference there may send NO key where `openai/` sends `OPENAI_API_KEY`. **If `[M7]`
   reads `canary` on `openai/` and not on `litellm_proxy/`, that weighs for `litellm_proxy/`**, against the guard's and F8's
   measurements having been made on `openai/`; Task 1's record re-makes this decision with both in view, and says what moving would
   cost (`[M5]` re-measured on `litellm_proxy/`).
3. **THE KEY TRAVELS AS `os.environ/UBC_AI_GATEWAY_API_KEY`.**
   - `infra/compose.yaml` hands the value to LiteLLM alone.
   - The control plane scrubs it at boot, and reads it ONCE, in `loadConfig`, only to know whether it is set (`keyInEnv`).
   - *Rejected:* sending the key in `/model/new`. LiteLLM would store it, salted, in its database, and the control plane would hold it.
4. **THE BOOT FAILS CLOSED WHEN `.env` CARRIED NO KEY** (*C1*; rewritten 2026-10-03 from *"refuses, and keeps the working model"*).
   - **It REMOVES every gateway registration** — every capable-model deployment that names an `api_base` (a direct one never does), and
     every `manifest-gateway-` entry — with one operator line per setting naming it and the missing key. **A DIRECT registration (`openai/…` with no `api_base`)
     is kept**: that is OpenAI's key going to OpenAI, which Rich keeps as a backup.
   - **Why not keep it, as the first draft did:** a gateway registration with no key can only (i) answer `401`, which the guard falls
     back from SILENTLY (`manifest_guard.py:11-13`), or (ii) if `[M7]` reads `canary`, send `OPENAI_API_KEY` to UBC's gateway. The
     first draft kept it because `capable.ts:211-216`'s `refuse` keeps every priced deployment. Rich kept `OPENAI_API_KEY` (16:13), so
     (ii) stays live for as long as this code runs.
   - **Unconditional, whatever `[M7]` reads.** *The review put it "on `canary`"; this plan makes it unconditional* (a routine call,
     `manifest-cd`): case (i) alone is reason enough, and an unconditional rule cannot be disarmed by a measurement on one LiteLLM
     version. *Cost of the other way:* one `if` in Task 2's `ensureCapableModel` and Task 3's `ensureGatewayModels`.
   - **The control plane cannot see LiteLLM's environment**, so *"in `.env` but LiteLLM not re-created"* and *"rotated in `.env`,
     stale in LiteLLM"* are **`make verify`'s: a counted check, built UNCONDITIONALLY in Task 2** (`EXPECT_VERIFY` +1), that compares a
     FINGERPRINT of `UBC_AI_GATEWAY_API_KEY` inside `manifest-litellm` with `.env`'s — never presence alone (*C1*). It prints only a
     verdict — `not configured` or `matches` (PASS); `absent from LiteLLM`, `differs` or `LiteLLM holds a key .env does not` (FAIL,
     each naming `make up`) — never a value or a hash. *The first draft built it only if `[M7]` read `canary`; a stale key is a silent fallback either way.*
   - **What it cannot do, recorded:** the window between `.env` gaining the key and `make up` — the boot registers, LiteLLM has no such
     variable. RUNBOOK's order (`make up`, THEN restart) closes it, and `make verify` reads red throughout it; `[M7]`'s case 1 says what
     a call in that window sends (if `canary`, `OPENAI_API_KEY` reaches UBC's gateway — RUNBOOK says so beside the order).
5. **THE GATEWAY'S ADDRESS IS `MANIFEST_UBC_AI_GATEWAY_URL`**, defaulting to `https://ai-gateway.apps.ltic.ubc.ca/v1` (`[M2]` confirms the
   `/v1`). It is not a secret; the control plane sends it in each registration. **Empty is unset** (the default), and **plain `http`
   is refused off loopback** with `ConfigError('CONFIG_UBC_AI_GATEWAY_INSECURE_URL')`, in `config.ts:688-706`'s pattern for the GitHub
   URLs — the bearer key would otherwise cross the network in clear (*I10*). Loopback `http` stays allowed, for Task 6's control (a).
   **Corrected at sitting 2 (F19; the coordinator accepted it, 2026-10-03):** the code is the published `CONFIG_INVALID`, with a message
   naming `MANIFEST_UBC_AI_GATEWAY_URL` and the fix — a `ConfigError` code is a value of the published `ErrorCode` enum, so a new one
   would have changed the contract this plan holds at `1.6.0`. Task 3's `CONFIG_GATEWAY_MODELS_INVALID` the same.
6. **PRICES.**
   - A gateway model is priced by LiteLLM's own map **for the gateway's model name**, then pinned, as the capable model is today.
   - **An alias LiteLLM cannot price is REFUSED**, and the fix is at the gateway: Rich, its administrator, exposes the model under its
     vendor name. *Rejected:* a price in the setting. It is the platform inventing a commercial price (I1).
   - **A `confidential` gateway model LiteLLM cannot price is pinned at the on-premise stand-in's synthetic price**, read at boot from
     `default-chat-onprem`'s config entry, so no second constant exists. Its rationale is `config.yaml:23-27`'s: an on-premise model has
     no per-token price, and `$0` binds no budget.
   - **Cache reads (*I8*).** The pin today carries input and output prices only (Read this first 22). **If `[M3]`.6 measures the
     gateway's model reporting `cached_tokens` and LiteLLM's map giving it a `cache_read_input_token_cost`, the pin carries that too**
     (Task 2), so a cache-heavy agent session is charged what the gateway charges and not several times it. If LiteLLM's map has no
     such price, the pin stays at two, and the record says how far Manifest's charge sat above the gateway's (`[M3]`.6).
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
11. **THE KEY'S EXPIRY IS WARNED, NOT DISCOVERED** (added 2026-10-03 by `manifest-cd`, at `manifest-94`'s suggestion; a routine call).
    Rich's key expires about 2027-01-01 (16:23), and an expired key answers `401`, which the guard falls back from silently — every
    capable call moving to the on-prem model with no operator line, *C1*'s shape.
    - **The date lives in `.env` as `UBC_AI_GATEWAY_KEY_EXPIRES=<YYYY-MM-DD>`** — not a secret — written at sitting 1 from `[M1]`.3's
      reading of `/key/info`'s `expires`.
    - **`make doctor` gains one `check_warn`** (Task 2; `EXPECT_DOCTOR` +1, because a warning check is still counted), in the
      vulnerability database's pattern (Read this first 23): no gateway key in `.env` → PASS, *"no UBC AI Gateway key"*; a key and no
      expiry line → WARN, *"its expiry is unknown"*; **within 14 days of the date, or past it → WARN** naming the date and the fix (rotate
      it in the gateway's admin UI, `.env`, `make up`, restart); otherwise PASS naming the date. Offline it works unchanged.
    - **`make demo-gateway`'s phase 0 compares the line with `/key/info`'s `expires`** (the network is on there) and fails on a mismatch,
      so a rotation that forgot the line is caught where it can be.
    - **Why 14 days:** a rotation is Rich's, in another system, and needs `make up` and a restart after it; the vulnerability database's
      seven days is a refresh an agent can run. *Rejected:* `make doctor` reading `/key/info` itself — it would handle the key and need
      the network, and offline it could not fail. *To change course:* the one check in `scripts/doctor.sh`.
12. **A GATEWAY DEPLOYMENT CARRIES A `timeout`** (*M10*), `GATEWAY_TIMEOUT_S` in `ai/providers.ts`, set by Task 2 from `[M2]`'s measured
    latencies with headroom, the figure and its source written beside the constant. LiteLLM's default would let a black-holed route
    hold a caller up to 600 s before the fallback answers. **Too short cuts off a long legitimate answer** — so `[M2]` times the capable
    candidate's longest plausible non-streamed answer, and a streamed call is bounded by `stream_timeout` only if `[M3]` measures
    LiteLLM 1.98.0 honouring it. *To change course:* the one constant.
    **Set at sitting 2 (F21; the coordinator accepted it):** `GATEWAY_TIMEOUT_S = 60` WITH `GATEWAY_NUM_RETRIES = 0`, both in
    `litellm_params` (F12: the timeout is per attempt and LiteLLM retries twice). The trade-off is beside the constant: a non-streamed
    answer past ~5,000 tokens is cut and the fallback answers; one transient 5xx goes straight to the fallback.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec, or from a dated measurement.

- **NEVER PRINT THE GATEWAY'S KEY, and never put it on a command line.**
  - **A probe** exports it inside a `bash` script (`set -a; . ./.env; set +a`).
  - **`curl`** reads it from a config on stdin: `printf 'header = "Authorization: Bearer %s"\n' "$UBC_AI_GATEWAY_API_KEY" | curl -K - …`.
    `printf` is a builtin, so the key never reaches `ps`.
  - **`docker run`** takes `-e UBC_AI_GATEWAY_API_KEY` with no value.
  - **A FINGERPRINT is compared, never printed** (`make verify`'s check, Decision 4): each side hashed inside its own process, and only
    a verdict (`matches`, `differs`, …) written out.
  - **A ROW is checked DECRYPTED, by verdict** (*I4*): LiteLLM encrypts every `litellm_params` value with its salt key, so a clear-text
    count of a database dump reads `0` whether or not the key is there. Decrypt inside the LiteLLM container, with LiteLLM's own
    helper and its own salt key, and print only `equals the reference` or `other`.
  - **NEVER** `docker inspect` LiteLLM, `env` or `printenv` in it, `echo` the variable, or `set -x` a script that has loaded `.env`.
  - **Check that it is present** with `docker exec manifest-litellm sh -c '[ -n "$UBC_AI_GATEWAY_API_KEY" ] && echo set'`.
  - **Check that it is absent from a file or a log** with a COUNT, the value read from the environment:
    `perl -ne '$n++ if index($_, $ENV{UBC_AI_GATEWAY_API_KEY}) >= 0; END { print $n+0, "\n" }'`.
  - **Every captured body is redacted before it is written**, by `probes/redact.pl`: the key's value and the probe key's, then any
    `sk-[A-Za-z0-9._-]{4,}`, replaced. A LiteLLM's `401` echoes the start and end of the key it was sent — `[M5]`(d) records the exact
    fragment form and where it lands (*M4*).
- **Four gates, all clean before every commit**, from the **repository root**: `pnpm test`, `pnpm lint`, `pnpm typecheck` and
  `pnpm format:check`. Run **`pnpm test` twice** on a sitting's final tree. Never with `--filter`.
- **`pnpm test:docker`** (~20–23 min; needs `make up` and the chat model warm; **fails rather than skips**):
  - **Owed by this plan's `ai/` and `infra/` changes** (sittings 2, 2b and, if code changes, 3). Task 0's one `secrets/` name owes ONE
    file, `boot.docker.test.ts`, run alone — not the tier (the sittings table, by grep, as the lean budget asks).
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
  the setting and its words; a test greps the captured stderr for the stub's bearer (`probe-not-a-key`) and finds none.
- **EVERY DEPLOYMENT AIMED AT A STUB NAMES ITS KEY** (*I3*): a literal canary (`sk-canary-<run>`, or `probe-not-a-key`) or
  `os.environ/MANIFEST_STUB_BEARER` (Task 2's harmless variable) — **never** no `api_key`, an empty one, `gatewayKeyRef()`, or a reference
  to a variable that is unset or boolean-looking (`"True"`). In `gw-probe`, which holds the REAL gateway key, a stub-bound deployment
  that named `gatewayKeyRef()` would hand it to the stub; in `manifest-litellm`, a keyless `openai/` one would hand over Rich's
  `OPENAI_API_KEY`. `[M7]` is the one place that names unresolved references on purpose, and only in `gw-probe`, whose `OPENAI_API_KEY`
  is a canary.
- **The probe key's file** (*What Rich does* 3) is read only by `set -a; . <file>` inside a probe script, never `cat`, and removed at
  Task 1's Step 10.
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

**The six failure modes most likely to bite a person, that no task's happy path exercises** (the sixth added with the review's fixes).
Each has its test or check in the owning task.

1. **The gateway's key sent to the wrong party, or written down.**
   - A reference that resolves to nothing could make LiteLLM fall back to its `OPENAI_API_KEY` and send OpenAI's key to the gateway.
   - A row, a log, a boot line or a test's failure message could hold the value.

   - And the reverse (*C1*): **`OPENAI_API_KEY`, which Rich keeps as a backup, sent to UBC's gateway** by a gateway registration whose
     reference resolved to nothing — and the gateway's `401` then hidden by the fallback.

   Expected: **the key reaches the gateway and nothing else, no other key reaches the gateway, and no file or line holds either.**
   Owned by Task 0 (the scrub) and Task 2:
   - *refuses a gateway setting when `.env` carried no key, and REMOVES the gateway registration — fails closed*;
   - the Docker case *the reference resolves per call* (the stub sees `MANIFEST_STUB_BEARER`'s value, and that alone);
   - `make verify`'s fingerprint check;
   - `[M7]`'s four cases on both providers, and its counts, kept as Task 6's phase 5 (decrypted rows, *I4*).
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
6. **A gateway key that stops working, unnoticed** (added with the review's fixes): expired (Rich's expires about 2027-01-01), rotated
   at the gateway but stale in LiteLLM, or its $20 a month spent. Each is a `401` or a `400` the caller never sees as such: the first two
   fall back silently to the on-prem model, and the third is `[M5]`(e).
   Expected: **an operator is told before or as it happens.** Owned by Decision 11's `make doctor` warning (expiry), Decision 4's
   fingerprint in `make verify` (rotation), Task 4's branch (budget), and Task 6's phase 2, which fails when a reply came from the
   fallback.

---

## File Structure

```
packages/control-plane/src/ai/
  providers.ts            NEW (T2) GATEWAY_PREFIX, GATEWAY_KEY_ENV, GATEWAY_TIMEOUT_S, gatewayKeyRef, Gateway, ProviderParams, resolveSetting
  providers.test.ts       NEW (T2)
  registration.ts         NEW (T3) ensureRegistered + the helpers moved from capable.ts (create, priced, pinned, removeIfSaved, …)
  capable.ts              MOD (T2) resolveSetting; the address in `unchanged`; the Gateway param; FAIL CLOSED. (T3) its body on ensureRegistered
  capable.test.ts         MOD (T2) the gateway cases; the direct "names no key" case kept
  gateway-models.ts       NEW (T3) ensureGatewayModels, gatewayModelsAtBoot, standInPrice
  gateway-models.test.ts  NEW (T3)
  agent-keys.ts           MOD (T5) AGENT_ALLOWED_ROUTES; CappedKeyInput.routes
  agent-keys.test.ts      MOD (T5)
  testing.ts              MOD (T2) the fake keeps api_base/api_key; the stub's `authorized(path)`. (T3) config entries' OUTPUT price (M2).
                          (T4) the stub's gateway-failure paths
  capable.docker.test.ts  MOD (T2) the gateway registration against the stub, on 7193. (T3) a confidential gateway model at the stand-in's price
  fallback-guard.docker.test.ts  MOD (T4, Branch B only) the gateway's own 400s fall back; a malformed 400 still does not
  agent-keys.docker.test.ts      MOD (T5) an agent key reaches /v1/responses, charged; an intake key is refused it
  index.ts                MOD (T2, T3) the Gateway built from config; gatewayModelsAtBoot BEFORE capableModelAtBoot (I5); the boot line
packages/control-plane/src/config.ts, config.test.ts   MOD (T2) MANIFEST_UBC_AI_GATEWAY_URL (https off loopback), keyInEnv. (T3) MANIFEST_GATEWAY_MODELS
packages/control-plane/src/secrets/scrub.ts, scrub.test.ts   MOD (T0, sitting 1 — I1) UBC_AI_GATEWAY_API_KEY
packages/control-plane/src/api/representations/agents.ts     MOD (T5) baseUrl names /responses
packages/control-plane/src/api/contract/document.ts          MOD (T5) 1.6.1
packages/contract/ (generated), packages/contract/package.json   MOD (T5)
infra/compose.yaml                     MOD (T2) UBC_AI_GATEWAY_API_KEY to LiteLLM alone; MANIFEST_STUB_BEARER (I2)
infra/litellm/manifest_guard.py        MOD (T4, Branch B only)
scripts/verify.sh, scripts/ci-acceptance.sh   MOD (T2, unconditionally — C1) LiteLLM's key's fingerprint equals .env's; EXPECT_VERIFY +1
scripts/doctor.sh, scripts/ci-acceptance.sh   MOD (T2) the key's expiry, warned 14 days ahead (Decision 11); EXPECT_DOCTOR +1
.env.example                           MOD (T2) MANIFEST_UBC_AI_GATEWAY_URL, UBC_AI_GATEWAY_KEY_EXPIRES, :172's example. (T3) MANIFEST_GATEWAY_MODELS (M6)
packages/journey/src/gateway.ts        NEW (T6) make demo-gateway's phases
scripts/demo-gateway.sh, scripts/gateway-controls.sh   NEW (T6); Makefile MOD (T6)
docs/api/agents.md                     MOD (T5) a tool-calling agent uses /responses
docs/superpowers/RUNBOOK.md            MOD (T2, T3, T6) *The capable model* through the gateway; the gateway's models; make demo-gateway
docs/superpowers/TRAPS.md, ORIENTATION.md   MOD (each sitting's close) what was measured; §3's capable-model paragraph; §8
docs/superpowers/spikes/gateway-baseline/   NEW (T1) README.md, results-task1-<date>.txt, probes/
docs/superpowers/plans/2026-10-03-fe46-fe47-fe5.md   MOD (T5's close, only if T5 runs) it starts from 1.6.1 (M7)
```
**Not touched:** `.env.example`'s `UBC_AI_GATEWAY_API_KEY` line (`20c65ca` has it — its OTHER lines are *M6*'s), `infra/litellm/config.yaml`
(Q1 (a) keeps every config entry), and the faculty front-end's repository.

---

## Task 0: The gateway's key scrubbed, THEN its `.env` line uncommented (sitting 1, first — the review's *I1*)

**Rich's 16:13 answer, built** (*Decided by Rich*). Today the key is in no scrub list (Read this first 5), so a control plane started
from `.env` with the line live would hand it to every `docker build` and every secret scan it spawns. Its caller is `index.ts:63`'s
`scrubSecretEnv()`, at every boot — the call exists; this task adds a name to what it removes. *Moved here from Task 2, where the first
draft had it.*

**Files:**
- Modify: `packages/control-plane/src/secrets/scrub.ts`, `packages/control-plane/src/secrets/scrub.test.ts`

- [ ] **Step 1: The failing test.** `scrub.test.ts`'s *covers every secret-bearing variable this repo's .env actually sets* list
  (`:33-61`) gains `'UBC_AI_GATEWAY_API_KEY'`.
- [ ] **Step 2: Run — predict red** at that case only: `pnpm exec vitest run --project unit src/secrets/scrub.test.ts` (from the
  repository root, so `--project` resolves).
- [ ] **Step 3: Implement.** `secrets/scrub.ts`, after `'OPENAI_API_KEY'`: `'UBC_AI_GATEWAY_API_KEY'`, with the comment *"UBC's AI
  Gateway's key (the UBC AI Gateway plan's Task 0): LiteLLM's alone, by infra/compose.yaml; `set -a` exports it here, where only
  loadConfig reads whether it is set"*. Run the file — green.
- [ ] **Step 4: The four gates, then commit by name.** `pnpm test` (TWICE, alone; read `uptime` before believing a timeout), `pnpm
  lint`, `pnpm typecheck`, `pnpm format:check`. **These two runs ARE the sitting's close runs**: Task 1 changes nothing under
  `packages/`, so the tree they ran on is the final tree (the lean budget: no open run on an unchanged tree). **Then the ONE Docker file
  that executes the scrub list**, alone, after `make up`, never beside Vitest: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project
  docker src/boot.docker.test.ts` (from the repository root) — not the tier (the sittings table says why). Step 6 restarts the control
  plane after it anyway.
  ```bash
  git add packages/control-plane/src/secrets/scrub.ts packages/control-plane/src/secrets/scrub.test.ts
  git commit -m "fix(secrets): scrub UBC_AI_GATEWAY_API_KEY at boot, before its .env line is live (gateway plan Task 0; the review's I1)"
  ```
- [ ] **Step 5: The negative control**: the name removed from `scrub.ts` → predict red at the one case; restore with `git checkout
  packages/control-plane/src/secrets/scrub.ts`, green again.
- [ ] **Step 6: The real boot, then the line.** In order:
  1. Restart the control plane from `.env` (RUNBOOK's *Running the control plane*; `dev` is `tsc` then `node dist/index.js`, so it
     runs the commit) and record the boot line's `secretsScrubbed` — **N**.
  2. **Uncomment the line**: Rich, or the agent at his word with a `sed` that reads no value —
     `sed -i '' 's/^# UBC_AI_GATEWAY_API_KEY=/UBC_AI_GATEWAY_API_KEY=/' .env` — then `grep -c '^UBC_AI_GATEWAY_API_KEY=' .env` reads `1`.
     Never `cat`, `grep` without `-c`, or open `.env` in a tool that prints it.
  3. Restart again: **`secretsScrubbed` reads N + 1** — the real process removed the key, which no test tier can show
     (`boot.docker.test.ts:135` asserts only `>= 3`). Record both numbers in the sitting's entry.
  4. `make doctor` still reads 0 failed: `.env` gaining a key `.env.example` holds commented is no failure (Read this first 23).

---

## Task 1: Measure what this plan rests on

**ALONE, AFTER TASK 0. The network on, Rich's key in `.env` (uncommented by Task 0), and his probe key in its own file.** Nothing under
`packages/` changes.
- **The record:** `docs/superpowers/spikes/gateway-baseline/README.md` (one section per measurement, its raw answer redacted), plus
  `results-task1-<date>.txt`.
- **The throwaway:**
  - `gw-probe-pg` (`postgres:16-alpine`, the image `infra/compose.yaml:120` runs) and `gw-probe` (LiteLLM from the pinned digest);
  - on their own network `gw-probe-net`, and on ports **7197** (LiteLLM) and **7198** (the host stub) — check both are free first;
  - `STORE_MODEL_IN_DB=True`; a scratch master key and salt key;
  - `infra/litellm/manifest_guard.py` mounted read-only, with a probe config naming it in `callbacks`;
  - `-e UBC_AI_GATEWAY_API_KEY` and **`OPENAI_API_KEY=sk-canary-<random>`**, so a key sent to the wrong party is recognisable and is not
    Rich's;
  - **`-e GW_PROBE_KEY`** (Rich's probe key, loaded from its own file by the up script, never `.env`), **`PROBE_EMPTY=`** (set but empty,
    as Task 2's compose line `${…:-}` leaves an absent key) and **`MANIFEST_STUB_BEARER=probe-not-a-key`** (Task 2's harmless variable),
    for `[M5]` and `[M7]`;
  - `extra_hosts: host.docker.internal:host-gateway`.
  - **Every deployment it registers that is aimed at the stub names a literal canary key** (Global Constraints, *I3*), save `[M7]`'s.
  - **Removed at the end with its network and volume.**

**Files:**
- Create: `docs/superpowers/spikes/gateway-baseline/README.md`, `results-task1-<date>.txt`, `probes/` (`up.sh`, `down.sh`, `redact.pl`,
  `stub.mjs`, `probe-config.yaml`, one script per measurement)

- [ ] **Step 1: `[M1]` The gateway's models, and the key's own limits.** Direct to the gateway, with the key by `curl -K -`:
  1. `GET /v1/models`: every id.
  2. `GET /model/info` (and `/v1/model/info`): whatever this key may read — `mode`, prices, and **whether** `litellm_params` or
     `api_base` show. **The record and the commit hold only PRESENT or ABSENT for those two, never their values** (*M9*): they are
     LTIC's upstream addresses, UBC's infrastructure, not this repository's to publish. Raw answers stay in `$SCRATCH`, deleted at Step 10.
  3. `GET /key/info`: ONLY `max_budget`, `spend`, `budget_duration`, `budget_reset_at`, **`expires`**, `rpm_limit`, `tpm_limit` and
     `models`, cut out with `jq`. Its other fields name the key. **Compare with Rich's 16:23 ceiling** (20 USD, monthly; expiring about
     2027-01-01) and record any difference. **`expires` becomes `.env`'s `UBC_AI_GATEWAY_KEY_EXPIRES`** (Decision 11; *What Rich does* 3).
     If this key cannot read its own `/key/info`, say so: Decision 11's line is then Rich's reading of his admin UI, and Task 6's
     `/key/info` comparisons become his, by eye, recorded as such.
  4. The gateway's LiteLLM version: the `x-litellm-version` header, if it sends one.

  **Then Rich, for each model** (*What Rich does* 3): where it runs, and its classification.
- [ ] **Step 2: `[M2]` Hop 2 alone, direct to the gateway**, for the capable model's candidate and for one on-premise candidate:
  1. a chat completion and a STREAMED one: status, the body's `model`, `usage`, every header (redacted);
  2. `x-litellm-response-cost` if sent;
  3. `/chat/completions` against `/v1/chat/completions`, which settles Decision 5's `/v1`;
  4. **the capable candidate with a function tool on chat completions**, with `reasoning_effort` unset and then `"none"` (S5's case):
     is it refused? *(Hop 2 alone. `[M4]`.8 repeats it through both hops, which is what decides Task 5 — M9.)*
  5. **Latency, for Decision 12's `timeout`** (*M10*): the wall time of the capable candidate's non-streamed answer to a prompt asking
     for ~1,500 words, three times, and the time to a streamed answer's first frame. Record the longest; Task 2 sets
     `GATEWAY_TIMEOUT_S` above it with the headroom it names.
- [ ] **Step 3: `[M3]` Both hops, through `gw-probe`.** `POST /model/new` with
  `{ model_name: 'probe-capable', litellm_params: { model: 'openai/<capable>', api_base: <gateway>, api_key: 'os.environ/UBC_AI_GATEWAY_API_KEY' }, model_info: { id: 'probe-gw-1', max_classification: 'internal' } }`.
  Record:
  1. the answer;
  2. `/model/info`'s `litellm_params` for it — **is `api_key` shown, hidden, or shown as the reference? Is `api_base` shown?**;
  3. `input_cost_per_token` and `output_cost_per_token` — **LiteLLM's price for the gateway's model name**;
  4. the same for each on-premise candidate (`0` is expected);
  5. **the `LiteLLM_ProxyModelTable` row, DECRYPTED, by verdict** (*I4* — a clear-text count of `pg_dump` reads `0` either way, because
     LiteLLM encrypts every `litellm_params` value with the salt key). Inside `gw-probe`, a short Python run with LiteLLM's own decrypt
     helper (name it in the record, from the pinned image's source) and the scratch salt key reads the row's `api_key` and prints ONLY
     `equals the reference` (the string `os.environ/UBC_AI_GATEWAY_API_KEY`) or `other`. Expected: `equals the reference` — the value
     never stored. **Keep the snippet in `probes/`: Task 6's phase 5 runs it against `manifest-litellm`.** Also record whether the
     clear-text dump holds the reference string (it should not, if every value is encrypted);
  6. a chat and a streamed chat on a scratch key (models `[probe-capable]`, the agent key's routes): status, frames, and the spend on
     the key against `usage × the price` (`[M3]`'s rows are what Tasks 2 and 3 pin). **Then the cache (*I8*): one prompt over the
     provider's caching threshold (e.g. ~2,000 tokens of fixed preamble), sent twice.** For each call record `usage`'s
     `prompt_tokens_details.cached_tokens`, Manifest's spend change on the scratch key, the gateway's `x-litellm-response-cost` header
     if hop 1 passes it (or `[M2]`'s, direct), and the gateway key's `/key/info` `spend` change; and whether LiteLLM's map gives the
     model a `cache_read_input_token_cost` (Decision 6). **The ratio of Manifest's charge to the gateway's, for the second call, is the
     number Decision 6 rests on**;
  7. **then the same registration as `litellm_proxy/<capable>`**, priced and called, recorded beside `openai/`'s, for Decision 2;
  8. **TLS** (*M10*): that `gw-probe` reached `https://ai-gateway.apps.ltic.ubc.ca` with certificate verification ON — no `ssl_verify`
     in any `litellm_params`, no environment override. If it fails, STOP and tell `manifest-94`: never turn verification off to pass;
  9. **`stream_timeout`** (Decision 12): register a deployment at the stub's `/slow/` path (frames after a delay) with `stream_timeout:
     2` and a literal canary key; record whether LiteLLM 1.98.0 gives up at ~2 s.
- [ ] **Step 4: `[M4]` `/v1/responses` through both hops.** Use a scratch key whose `allowed_routes` is the agent key's three routes plus
  `/v1/responses`.
  1. `POST /v1/responses` on `probe-capable`, with one function tool and a prompt that requires it: status, output item types (a
     `function_call` expected), streamed and not. **And what it is charged** (*I7*): the scratch key's spend change against `usage`'s
     `input_tokens` / `output_tokens` × the pinned price, streamed and not. If LiteLLM 1.98.0 charges `aresponses` at `$0`, or ignores
     the pinned price, opening the route would let agents spend past their budgets: **STOP and tell `manifest-94` before sitting 2.**
  2. **Does hop 1 call the gateway's `/v1/responses` natively, or bridge to chat completions?** Register a second deployment whose
     `api_base` is the host stub and whose `api_key` is a literal canary (*I3*), and record the PATH the stub was called on.
  3. **The stored-response routes:** a follow-up with `previous_response_id`, and `GET /v1/responses/{id}`. Does each answer through
     hop 1 with that key? Which routes must `allowed_routes` list for each? **Is a response STORED by default** (*I7*): the response's
     own `store` field when the request sends none, and whether `GET /v1/responses/{id}` then finds it — at hop 1, and at the gateway.
     **And from ANOTHER key** (*I7*): a second scratch key, same routes, asks `GET /v1/responses/{id}` for the first key's id. Record
     the status; **anything but a refusal is one agent reading another's conversation — STOP and tell `manifest-94`.**
  4. **How `allowed_routes` matches:** with only `/v1/responses` listed, are `/responses` (no `v1`), `/v1/responses/{id}` and
     `/v1/responses/{id}/input_items` refused or admitted?
  5. **An intake-shaped key** (the three routes only) on `/v1/responses`: the status, `type` and `code` of the refusal.
  6. **`/v1/responses` on `default-chat`** (Ollama, through `host.docker.internal`): does LiteLLM bridge it offline? Task 5's Docker case
     rests on this answer.
  7. **Does `narrowAgentKey`'s `/key/update { models }` keep a key's `allowed_routes`?** Narrow the scratch key and re-read `/key/info`.
  8. **`[M2]`.4 through both hops** (*M9*): `probe-capable` with a function tool on `/v1/chat/completions`, `reasoning_effort` unset and
     then `"none"`, on the scratch key — what an agent on a Manifest key would see.

  **THIS DECIDES TASK 5.** Task 5 runs only if **Step 4.8** measured the capable candidate refusing tools on chat completions through
  both hops (Rich, Q2); `[M2]`.4, hop 2 alone, is recorded beside it to say which hop refuses. If it accepts them, record that and drop
  Task 5, with Spec action 2 marked *not needed*.
- [ ] **Step 5: `[M5]` The error shapes, through both hops, as the client sees each AND as the guard reads it.** Give `gw-probe` a
  `general` fallback, `probe-capable → probe-ok` (a stub deployment answering `ok`), so the real guard decides. Add a copy of the guard,
  `probes/guard-inspect.py`, that prints only the exception's class, `status_code`, `type`, `code` and `param` attributes (never its
  message). The cases:
  - **(a)** a malformed request (`max_tokens: -1`, or a message with an invalid role) → the gateway's `400`;
  - **(b)** a `422` from the gateway — find what, if anything, makes the gateway answer `422`, and record it if nothing does;
  - **(c) BOTH WAYS** (*I9* — a refused model may answer `401`, a removed one `400` *"Invalid model name"*):
    - **(c-i)** a model the gateway does not serve (`openai/no-such-model-<run>`), on the real key;
    - **(c-ii)** a model the gateway SERVES that the key may not use: on Rich's probe key (`os.environ/GW_PROBE_KEY`), a model outside its
      one-model list — **measured FIRST, before (e) spends that key's budget**, so the two answers cannot mix;
  - **(d)** a wrong key (`os.environ/PROBE_WRONG_KEY` set to `sk-canary-wrong`) → `401` expected. **Record the fragment of the canary
    the `401` echoes, and every place it lands** (*M4*): `docker logs gw-probe`, the probe's own files, and LiteLLM's error and spend
    tables (each by COUNT of the fragment, after decrypting where Step 3.5 found encryption). Task 6's phase 5 counts the real key's
    fragment in the same places;
  - **(e) REQUIRED** (*I9*; `manifest-94`, 16:23 — Rich's $20 a month makes it a real case): the gateway's budget for a key spent, on
    Rich's PROBE key after (c-ii) — calls on its one model until the gateway refuses, then the case. **Never on the real key**;
  - **(f)** the key's rate limit at the gateway, ONLY if `[M1]`'s `rpm_limit` is small enough to reach in a few calls. Otherwise
    `unmeasured`; never hammer UBC's gateway;
  - **(g)** the gateway unreachable (`api_base: http://127.0.0.1:9/v1`).

  **(a), (c-i), (c-ii), (e) and (g) are each measured STREAMED as well** (*I9*): `stream: true`, recording the status (or the first
  frame's error), whether a fallback answered, and whether the failure arrives before or after the first frame — a stream that has
  started cannot fall back.

  For each, record: the status, `type` and `code` the client sees; whether `x-litellm-attempted-fallbacks` is set; and the guard's
  printed attributes. **THIS DECIDES TASK 4's BRANCH** — (c) meaning BOTH (c-i) and (c-ii), and (e) is measured, never assumed:
  - **A:** (c) and (e) arrive as non-malformed statuses;
  - **B:** they arrive as `400` with an attribute that tells them apart from (a);
  - **C:** they cannot be told apart from (a). **STOP and put it to Rich before sitting 2.** *(The first draft let (e) be `unmeasured`,
    which left Branch A–C no answer for it; it is now required.)*
- [ ] **Step 6: `[M6]` The gateway's view of a call.** With `api_base` at the host stub and a literal canary `api_key` (*I3*), record
  which top-level body FIELDS and header NAMES hop 1 forwards (never values). Above all, whether an app's end-user `user` (§10's namespaced hash) and LiteLLM's
  `metadata` / trace headers reach the provider. This is what UBC's gateway would see of Manifest's callers. **For the privacy record,
  beside ORIENTATION §8 *Open*'s *"MAY `internal` DATA REACH A MODEL PROVIDER OUTSIDE CANADA?"*.**
- [ ] **Step 7: `[M7]` Where the key goes — FOUR CASES ON BOTH PROVIDERS** (*C1*, *I2*). On `gw-probe`, with
  `OPENAI_API_KEY=sk-canary-…` in its environment, each a deployment with its `api_base` at the stub and one call. **Which bearer
  reaches the stub?** The stub records only one of `canary` / `literal-reference` / `empty` / `none` / `True` / `other`, never the value.
  1. `api_key: 'os.environ/PROBE_UNSET'` — a variable that does not exist;
  2. `api_key: 'os.environ/PROBE_EMPTY'` — set but EMPTY, which is what Task 2's compose line `${UBC_AI_GATEWAY_API_KEY:-}` gives
     LiteLLM when `.env` has no key, and falsy in LiteLLM's `api_key or … get_secret("OPENAI_API_KEY")` chain;
  3. `api_key: 'os.environ/STORE_MODEL_IN_DB'` — the string `"True"`, which `get_secret` very likely turns into a boolean (the first
     draft's Docker case used it as a stand-in bearer, *I2*);
  4. no `api_key` at all;

  **each on `openai/` AND on `litellm_proxy/`** — eight calls. `litellm_proxy/` falls back to `LITELLM_PROXY_API_KEY`, which
  `gw-probe` does not hold, so its answers may differ; Decision 2 weighs them. **Then `os.environ/MANIFEST_STUB_BEARER` on `openai/`**:
  `other`, and the stub's `authorized` count for `probe-not-a-key` is `1` — the stand-in Task 2's Docker case rests on, shown to resolve
  as a plain string. **A `canary` in any case is recorded as the mechanism Decision 4's fail-closed boot guards against**; it changes
  no task, because the boot fails closed and `make verify` compares fingerprints whatever this reads.
  5. `docker logs gw-probe` and the probe's own files: the COUNT of the key's value (expected `0` everywhere).
- [ ] **Step 8: `[M8]` What the platform's gates read today**: the `EXPECT_` lines, and `make doctor` / `make verify` once. **No
  `pnpm test` on an unchanged tree** (the lean budget).
- [ ] **Step 9: `[M9]` Rich's statements, in his words**: each model's location and classification (Step 1); the gateway's prompt
  retention; any gateway-side fallback; the key's limits as he set them (16:23: 20 USD a month, a 90-day expiry), beside `[M1]`.3's
  reading. **Then `.env`'s `UBC_AI_GATEWAY_KEY_EXPIRES`** (Decision 11), from `[M1]`.3's `expires`, at his word.
- [ ] **Step 10: Tear down** `gw-probe`, `gw-probe-pg`, `gw-probe-net`, the probe volume and the stub, **the probe key's file**
  (`rm`, then `test ! -e`), and the raw answers in `$SCRATCH`. Then count again: no `gw-probe*` container, network or volume is left.
  **Tell Rich the probe key can be deleted at the gateway**, and record when he has.
- [ ] **Step 11: Commit** the spike directory by name. If a measurement breaks the split or a premise, tell `manifest-94` before
  sitting 2.
  ```bash
  git add docs/superpowers/spikes/gateway-baseline
  git commit -m "docs(gateway): Task 1 — the UBC AI Gateway measured through both hops (models, chat, streams, /v1/responses, errors, price, the key)"
  ```

---

## Task 2: The capable model through the gateway — the key by reference only, failing closed

**Spec action 1 decided first.** This task's callers are `index.ts`'s boot (`capableModelAtBoot`), `make verify` and `make doctor`.
*The scrub entry the first draft had here is Task 0's (*I1*).*

**Files:**
- Create: `packages/control-plane/src/ai/providers.ts`, `providers.test.ts`
- Modify: `ai/capable.ts` (`create`, the `unchanged` test, the fail-closed removal, `ensureCapableModel`'s and `capableModelAtBoot`'s
  signatures, `unservedReason`'s wording), `ai/capable.test.ts`, `ai/testing.ts` (the fake keeps `api_base` / `api_key`; the stub's
  `bearer` and `authorized`), `ai/capable.docker.test.ts`, `config.ts`, `config.test.ts`, `index.ts`, `infra/compose.yaml:229-235`,
  **`scripts/verify.sh` and `scripts/doctor.sh` and `scripts/ci-acceptance.sh` — UNCONDITIONALLY** (Decisions 4 and 11), **`.env.example`**
  (*M6*), `docs/superpowers/RUNBOOK.md` (*The capable model*).

**Interfaces:**
- Produces: `GATEWAY_PREFIX = 'ubc-ai-gateway/'`, `GATEWAY_KEY_ENV = 'UBC_AI_GATEWAY_API_KEY'`, `GATEWAY_TIMEOUT_S` (`[M2]`.5's figure),
  `gatewayKeyRef(envName?) → string`, `interface Gateway { url: string; keyRef: string; keyInEnv: boolean }`,
  `interface ProviderParams { model: string; api_base?: string; api_key?: string; timeout?: number }`,
  `resolveSetting(settingName, setting, gateway?) → { params } | { refused: string; failClosed?: true }`.
- Produces: `ensureCapableModel(client, setting, gateway?)` and `capableModelAtBoot(client, setting, fallbackSetting, gateway)`.
- Produces: `config.ubcAiGateway: { url: string; keyInEnv: boolean }`.

- [ ] **Step 1: The failing unit tests.** `providers.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import { GATEWAY_TIMEOUT_S, gatewayKeyRef, resolveSetting, type Gateway } from './providers.js'

  const GW: Gateway = { url: 'https://gw.example/v1', keyRef: gatewayKeyRef(), keyInEnv: true }

  describe('where a model setting is answered', () => {
    it('passes a LiteLLM model string through unchanged — OpenAI direct still works', () => {
      expect(resolveSetting('MANIFEST_CAPABLE_MODEL', 'openai/gpt-6-luna', GW)).toEqual({
        params: { model: 'openai/gpt-6-luna' },
      })
    })
    it('sends a ubc-ai-gateway setting to the gateway, naming its key by REFERENCE only, with a timeout', () => {
      expect(resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/gpt-6-luna', GW)).toEqual({
        params: {
          model: 'openai/gpt-6-luna',
          api_base: 'https://gw.example/v1',
          api_key: 'os.environ/UBC_AI_GATEWAY_API_KEY',
          timeout: GATEWAY_TIMEOUT_S,
        },
      })
    })
    it('refuses a gateway setting when .env carried no key — FAILING CLOSED — and names the setting, never a value', () => {
      const r = resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/gpt-6-luna', { ...GW, keyInEnv: false })
      expect(r).toEqual({ refused: expect.stringContaining('UBC_AI_GATEWAY_API_KEY is not in .env'), failClosed: true })
    })
    it('refuses the prefix with no model after it, and a gateway setting with no gateway configured — neither fails closed', () => {
      expect(resolveSetting('MANIFEST_CAPABLE_MODEL', 'ubc-ai-gateway/', GW)).not.toHaveProperty('failClosed')
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
          timeout: GATEWAY_TIMEOUT_S,
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
  it('POSITIVE CONTROL: a gateway setting with no key in .env still KEEPS a DIRECT working model — OpenAI’s key to OpenAI', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, 'openai/gpt-6-luna', GW)
    const r = await ensureCapableModel(lite, 'ubc-ai-gateway/gpt-6-luna', { ...GW, keyInEnv: false })
    expect(r.state).toBe('refused')
    expect(r.reason).toContain('UBC_AI_GATEWAY_API_KEY is not in .env')
    expect(capable(lite).map((d) => d.model)).toEqual(['openai/gpt-6-luna'])
  })
  it('FAILS CLOSED: a gateway registration is REMOVED, never kept, when .env no longer carries the key (Review Focus 1, C1)', async () => {
    const lite = fakeLiteLlm()
    await ensureCapableModel(lite, 'ubc-ai-gateway/gpt-6-luna', GW)
    expect(capable(lite)).toHaveLength(1)
    const r = await ensureCapableModel(lite, 'ubc-ai-gateway/gpt-6-luna', { ...GW, keyInEnv: false })
    expect(r.state).toBe('refused')
    expect(r.reason).toContain('UBC_AI_GATEWAY_API_KEY is not in .env')
    expect(capable(lite)).toHaveLength(0)
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
  asserts no `api_key` at all. **If `[M3]`.6 found a `cache_read_input_token_cost` in LiteLLM's map for the chosen model** (Decision 6,
  *I8*): one more case — *the pin carries the cache-read price LiteLLM gives* — and the fake answers that field. `config.test.ts`:
  - `MANIFEST_UBC_AI_GATEWAY_URL` defaults to `https://ai-gateway.apps.ltic.ubc.ca/v1` (or `[M2]`'s form), **and so does `''`** (*I10*);
  - **`http://gw.example/v1` is a `ConfigError` `CONFIG_UBC_AI_GATEWAY_INSECURE_URL`**; `http://127.0.0.1:9/v1` and
    `http://localhost:9/v1` are accepted (a POSITIVE CONTROL in the same file);
  - `keyInEnv` is `true` for a set key and `false` for an absent or empty one;
  - **`JSON.stringify(loadConfig(env))` does not contain the key's value.**
- [ ] **Step 2: Run — predict red.** `providers.test.ts` fails to import. The new `capable.test.ts` cases fail at the `api_base` match,
  at `apiBase` (the fake has none) and at *FAILS CLOSED*'s `toHaveLength(0)` (today's `refuse` keeps a priced deployment). The URL cases
  fail at the missing `ConfigError`.
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
    /**
     * How long LiteLLM waits for the gateway before the fallback answers (Decision 12): without it a black-holed route holds a
     * caller up to LiteLLM's 600 s. <[M2].5's longest measured answer, the headroom, and the date — written here by Task 2.>
     */
    export const GATEWAY_TIMEOUT_S = /* [M2].5 */ 0
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
      timeout?: number
    }
    /**
     * `failClosed`: the caller REMOVES every gateway registration it owns rather than keeping it (Decision 4) — a gateway
     * registration with no key can only fail silently, or send LiteLLM's other provider key to UBC.
     */
    export type Resolved = { params: ProviderParams } | { refused: string; failClosed?: true }

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
            `${settingName} names '${setting}', but ${GATEWAY_KEY_ENV} is not in .env, so every gateway registration is ` +
            'removed rather than kept — LiteLLM would reach the gateway with no key of its own — add it to .env, run ' +
            '`make up` so LiteLLM is created with it, then restart this control plane',
          failClosed: true,
        }
      }
      return {
        params: { model: `openai/${name}`, api_base: gateway.url, api_key: gateway.keyRef, timeout: GATEWAY_TIMEOUT_S },
      }
    }
    ```
    **`GATEWAY_TIMEOUT_S` is never committed as `0`**: Step 3 writes `[M2]`.5's figure and its comment before Step 4 runs.
  - **`ai/capable.ts`**:
    - `Deployment.litellm_params` gains `api_base?: unknown`, and `apiBaseOf(d)` mirrors `modelOf`.
    - `create(client, params: ProviderParams, price?)` sends `litellm_params: { ...params, ...price }`.
    - `ensureCapableModel(client, setting, gateway?)` resolves first. **A `refused` with `failClosed`** first removes every capable
      deployment that names an `api_base` — a gateway registration; a direct one (`resolveSetting`'s pass-through) never names one —
      and then goes through the existing `refuse(() => reason + unavailable(kept))`, so a DIRECT working model is kept. Any other
      `refused` goes through `refuse` unchanged.
    - The `unchanged` test becomes `modelOf(only) === params.model && apiBaseOf(only) === params.api_base && …` (the rest unchanged).
    - `unservedReason` says *"`openai/<model>` direct, or `ubc-ai-gateway/<model>`"*.
    - `capableModelAtBoot` takes and passes `gateway`.
    - **The fallback half is untouched**: it names catalogue entries, never providers.
    - **If `[M3]`.6 found a cache-read price** (Decision 6): the pinned re-registration carries `cache_read_input_token_cost` as LiteLLM
      gave it, beside the two it pins today.
  - **`config.ts`**:
    - `MANIFEST_UBC_AI_GATEWAY_URL: z.preprocess((value) => (value === '' ? undefined : value), z.string().url().default('https://ai-gateway.apps.ltic.ubc.ca/v1'))`
      — `:304-307`'s *empty is unset* pattern (*I10*).
    - **Plain `http` off loopback refused** (*I10*), beside `:688-706`'s GitHub loop and in its words: `throw new
      ConfigError('CONFIG_UBC_AI_GATEWAY_INSECURE_URL', \`MANIFEST_UBC_AI_GATEWAY_URL is '${value}': the gateway's key may cross only
      loopback in plaintext; use https\`)` unless the host is `127.0.0.1`, `localhost` or `[::1]`.
    - `UBC_AI_GATEWAY_API_KEY: z.string().optional()`, with the comment *"read ONLY to know whether it is set — never kept; the scrub
      removes it next (Task 0)"*.
    - The config gains `ubcAiGateway: { url, keyInEnv: (raw.UBC_AI_GATEWAY_API_KEY ?? '') !== '' }`.
  - **`index.ts`**: `const gateway: Gateway = { ...config.ubcAiGateway, keyRef: gatewayKeyRef() }`, passed to `capableModelAtBoot`.
  - **`infra/compose.yaml`**, under `OPENAI_API_KEY`:
    - `UBC_AI_GATEWAY_API_KEY: ${UBC_AI_GATEWAY_API_KEY:-}`, with the comment *"UBC's AI Gateway's key: HERE AND NOWHERE ELSE. A
      registration names it as `os.environ/UBC_AI_GATEWAY_API_KEY`; LiteLLM resolves it per call. Changing it needs `make up`."*
    - **`MANIFEST_STUB_BEARER: probe-not-a-key`** (*I2*), with the comment *"NOT A SECRET: the bearer the Docker tier's stub cases
      reference as `os.environ/MANIFEST_STUB_BEARER`, so a case shows a reference resolving per call with no key reaching a test or a
      stub."*
    - **Correct the `OPENAI_API_KEY` comment**, which says the control plane registers `default-chat-large` *"naming no api_key"*: true
      now of a direct setting only.
  - **`ai/testing.ts`**: the fake's `FakeDeployment` gains `apiBase?` and `apiKey?`, kept from `/model/new` and listed by `/model/info`
    the way `[M3]` measured LiteLLM to list them. `startStubProvider(port, { bearer? })` gains `authorized(path)`: a count of hits whose
    `Authorization` equals `Bearer <bearer>`. **The stub never stores a header's value.**
  - **`scripts/verify.sh`** — Decision 4's check, counted, UNCONDITIONAL: `check "LiteLLM holds the UBC AI Gateway key .env holds"`. In
    a function, in a subshell that sources `${MANIFEST_ENV_FILE:-.env}` (as `doctor.sh:335-336` sources `.env`; the override is for
    control (e)): hash `.env`'s value with `printf %s "$…" | shasum -a
    256` (`printf` is a builtin), and LiteLLM's inside the container with Python's `hashlib` over `os.environ.get(…, '')`; compare
    the two in shell variables and echo ONLY `not configured` (both empty — PASS), `matches` (PASS), `absent from LiteLLM — run make
    up` or `differs — run make up` or `LiteLLM holds a key .env does not — run make up` (FAIL). **Never echo either hash.** First
    check the image runs `python3` (`docker exec manifest-litellm python3 -c 'print(1)'`).
  - **`scripts/doctor.sh`** — Decision 11's `check_warn "the UBC AI Gateway key is not near its expiry"`, in `scanner_db_age`'s pattern
    (BSD `date -j -f '%Y-%m-%d'`), sourcing `${MANIFEST_ENV_FILE:-.env}` in its own subshell, reading `UBC_AI_GATEWAY_API_KEY` only
    as `[ -n … ]`.
  - **`scripts/ci-acceptance.sh`**: `EXPECT_VERIFY` +1 and `EXPECT_DOCTOR` +1, each with its dated comment in the file's pattern
    (`:211-216`), **after** measuring both counts with the checks in.
  - **`.env.example`** (*M6*), commented like `:174-175` (doctor compares UNCOMMENTED keys, Read this first 23):
    `# MANIFEST_UBC_AI_GATEWAY_URL=https://ai-gateway.apps.ltic.ubc.ca/v1` and `# UBC_AI_GATEWAY_KEY_EXPIRES=<YYYY-MM-DD>`, each with
    its one-line comment; and `:172`'s `MANIFEST_CAPABLE_MODEL` comment names the second form, *"or `ubc-ai-gateway/<model>` through
    UBC's AI Gateway"*.
- [ ] **Step 4: Run the unit files — green.** `providers.test.ts`, `capable.test.ts`, `config.test.ts`, one at a time.
  **Every existing `capable.test.ts` case is green unchanged**: that is the proof `openai/…` direct still works.
- [ ] **Step 5: `make up`, then the Docker case** (`capable.docker.test.ts`). `make up` first, so LiteLLM is re-created with
  `MANIFEST_STUB_BEARER` (`docker exec manifest-litellm sh -c '[ "$MANIFEST_STUB_BEARER" = probe-not-a-key ] && echo set'`). It runs
  against the stub and never the gateway, with the file's own helpers (Read this first 20; *M3*):
  ```ts
  /** Task 2's stub: inside the 7100–7199 block and used by no code (7199 is fallback-guard.docker.test.ts's) — check it is free. */
  const GW_STUB_PORT = 7193
  const GW_STUB = `http://host.docker.internal:${GW_STUB_PORT}`

  it('a ubc-ai-gateway model is reached at the gateway’s address with the key LiteLLM resolves from its OWN environment, per call (Task 2)', async () => {
    // The reference names MANIFEST_STUB_BEARER — infra/compose.yaml gives LiteLLM the plain string `probe-not-a-key`, no secret and
    // nothing `get_secret` reads as a boolean ([M7]) — so the stub is shown the resolved bearer and no key reaches this test or the
    // stub. Production names UBC_AI_GATEWAY_API_KEY.
    await startingClear(client)
    const stub = await startStubProvider(GW_STUB_PORT, { bearer: 'probe-not-a-key' })
    try {
      const gateway = { url: `${GW_STUB}/gw/ok/v1`, keyRef: gatewayKeyRef('MANIFEST_STUB_BEARER'), keyInEnv: true }
      const setting = `ubc-ai-gateway/${PRICED.slice('openai/'.length)}`
      expect(await ensureCapableModel(client, setting, gateway)).toMatchObject({ state: 'registered' })
      const user = `gw-task2-${randomUUID()}`
      const { key } = await client.post<{ key: string }>('/key/generate', {
        user_id: user,
        key_alias: `${user}-key`,
        models: [CAPABLE_MODEL_NAME],
        allowed_routes: ['/v1/chat/completions'],
      })
      const res = await chat(key)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-litellm-attempted-fallbacks')).toBeNull()
      expect(stub.hits('/gw/ok/v1/chat/completions')).toBe(1)
      expect(stub.authorized('/gw/ok/v1/chat/completions')).toBe(1)
    } finally {
      await leaveNone(client)
      await stub.close()
    }
  })
  ```
  `PRICED` is `openai/gpt-5.6-luna` (`:31`), the bundled-priced model, so the tier passes offline. Mint the key as the Task 12b case
  does (`:254-262`), with whatever that case also sends (`max_budget`, its cleanup). **No second, "unset reference" case** (*I2*): a
  reference to an unset variable would make LiteLLM send Rich's real `OPENAI_API_KEY` to the host stub on every Docker-tier run.
  `[M7]` measured that in `gw-probe`, whose `OPENAI_API_KEY` was a canary; the tier never repeats it.
- [ ] **Step 6: RUNBOOK's *The capable model***: the gateway form; the order — the key in `.env`, `make up`, THEN restart; the `[ -n ]`
  check; **the fail-closed boot** and its one line; `make verify`'s fingerprint line and what each verdict means; `make doctor`'s expiry
  warning and the rotation (the gateway's admin UI, `.env`'s two lines, `make up`, restart); and **`OPENAI_API_KEY` stays, as a backup**
  (Rich, 16:13) — what a direct `openai/…` setting uses.
- [ ] **Step 7: Commit by name**, then **the negative controls**, each predicted, seen red, and restored:
  - **(a)** `unchanged` back to comparing the model string alone: predict red at *repoints from OpenAI direct*;
  - **(b)** `keyInEnv` forced `true`: predict red at *refuses … when .env carried no key* in `providers.test.ts`, and at both
    `capable.test.ts` keyless cases;
  - **(b2)** the fail-closed removal skipped (`failClosed` ignored): predict red at *FAILS CLOSED* only, the POSITIVE CONTROL green;
  - **(c)** `api_key: gateway.keyRef` dropped from `resolveSetting`: predict red at the provider and capable unit cases. **AT THE UNIT
    TIER ONLY** (*I2*): with it dropped, the Docker case's deployment would carry no key, and LiteLLM would send Rich's real
    `OPENAI_API_KEY` to the host stub. Never run the Docker case under this control;
  - **(d)** the insecure-URL refusal removed: predict red at `http://gw.example/v1`'s `ConfigError`, the loopback cases green;
  - **(e)** `make verify`'s check, by a restore-safe script (Rich's to run if the classifier refuses it): `docker exec` cannot change a
    running container's environment, so the control runs the check's function against a SCRATCH `.env` copy whose key is a different
    canary — `differs` (FAIL) — then against one with no key while LiteLLM has none — `not configured` (PASS);
  - **(f)** `make doctor`'s expiry check against a scratch `.env` copy with `UBC_AI_GATEWAY_KEY_EXPIRES` set to tomorrow: WARN; a year
    out: PASS; absent with a key present: WARN *"unknown"*.
  ```bash
  git commit -m "feat(ai): the capable model through UBC's AI Gateway — ubc-ai-gateway/<model>, the key by reference only, failing closed (gateway plan Task 2)"
  ```

---

## Task 3: The gateway's own models, from one setting (Rich's Q1)

**Spec action 1 decided first.** This task's caller is `index.ts`'s boot, **straight BEFORE `capableModelAtBoot`** (*I5*), because the
capable model's fallback may name one of them, and `capableModelAtBoot` sets that fallback (`capable.ts:454-458`), refusing a name not
yet in the catalogue (Read this first 18). *The first draft ran it after, so a fresh registration could never be the fallback.*

**Files:**
- Create: `ai/registration.ts`, `ai/gateway-models.ts`, `ai/gateway-models.test.ts`
- Modify: `ai/capable.ts` (its registration body moves to `registration.ts`), `config.ts`, `config.test.ts`, `index.ts` (the boot call
  and the boot line's `gatewayModels`), **`ai/testing.ts`** (the fake seeds a config entry's OUTPUT price too, *M2*),
  `ai/capable.docker.test.ts` (one case), **`.env.example`** (*M6*), `docs/superpowers/RUNBOOK.md`

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
  `{ name: CAPABLE_MODEL_NAME, owns: (d) => d.model_name === CAPABLE_MODEL_NAME, idPrefix: 'manifest-capable-', … }`. **Task 2's
  resolve and fail-closed branch stay in `ensureCapableModel`, before `ensureRegistered`**, which takes resolved `params`.
  **Run `capable.test.ts`: every case green, none edited.** That is the refactor's only test, so commit it alone.
  ```bash
  git commit -m "refactor(ai): the capable model's registration as ensureRegistered, by name and classification (gateway plan Task 3)"
  ```
- [ ] **Step 2: The failing tests.** `config.test.ts`:
  - `MANIFEST_GATEWAY_MODELS='ubc-onprem=ubc-ai-gateway/qwen-x@confidential, ubc-mini=ubc-ai-gateway/gpt-6-mini@internal'` parses to two
    entries;
  - `''` parses to `[]`;
  - **a model id holding `@` splits on the LAST `@`** (*M5* — Vertex-style ids carry one):
    `'ubc-vertex=ubc-ai-gateway/claude-x@20250101@internal'` parses to the setting `ubc-ai-gateway/claude-x@20250101` at `internal`;
  - **each of these is a `ConfigError` `CONFIG_GATEWAY_MODELS_INVALID` naming the entry**, never defaulted: no `@`; `@restricted`;
    `openai/x` (not a gateway setting); the name `default-chat-large`; a name twice; `Bad_Name`; `x=ubc-ai-gateway/m@` (nothing
    after the last `@`).

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
  // M2: green only once the fake seeds a config entry's output price (testing.ts:282-292 seeds the input alone, and outputCostOf,
  // :329-331, reads 0 for an ollama_chat/ model) — Step 4 changes the seeding; no other case's expectation moves (check it).
  it('FAILS CLOSED: every manifest-gateway- deployment is REMOVED when .env no longer carries the key (Decision 4, C1)', async () => {
    /* registered with GW; then ensureGatewayModels(lite, sameEntries, { ...GW, keyInEnv: false }) → each entry 'refused' naming
       UBC_AI_GATEWAY_API_KEY, and no manifest-gateway- deployment left; the capable model and every config entry untouched */
  })
  it('refuses a name the catalogue already holds — default-chat-onprem stays Ollama — and registers nothing for it', async () => {})
  it('removes an entry the setting no longer lists, and never touches the capable model or a config entry', async () => {})
  it('removes every manifest-gateway- deployment when the setting is empty', async () => {})
  it('a confidential project’s agent gets the confidential entry; an internal entry is never given to it', async () => {
    /* agentModelsFor(await loadModelCatalogue(lite), 'confidential', 'on-premise') contains 'ubc-onprem', not 'ubc-mini' */
  })
  it('at boot: one operator line per refused entry naming MANIFEST_GATEWAY_MODELS and the entry, never fatal; a gateway that does not answer is one line', async () => {})
  it('at boot, gateway models are registered BEFORE the capable model’s fallback is set — so the fallback may name one (I5)', async () => {
    /* a fresh fake; boot with MANIFEST_GATEWAY_MODELS 'ubc-onprem=…@confidential' and the fallback 'ubc-onprem' → capableFallback
       'registered', not refused as "not in the model catalogue" */
  })
  ```
- [ ] **Step 3: Run — predict red** at the import of `gateway-models.js`, and at `config.test.ts`'s parse.
- [ ] **Step 4: Implement.**
  - **`config.ts`**: `MANIFEST_GATEWAY_MODELS: z.string().default('')`, then `parseGatewayModels(raw)`. It splits on `,`, trims, and
    skips empties. Each entry must match `^([a-z0-9][a-z0-9-]{0,62})=(ubc-ai-gateway\/[^\s,]+)@(public|internal|confidential)$` — the
    greedy setting group backtracks to the LAST `@`, so a model id may hold one (*M5*). It
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
      2. resolves the setting (Task 2), refusing as `resolveSetting` says — **and on `failClosed`, removes that entry's
         `manifest-gateway-` deployments** rather than keeping them (Decision 4);
      3. calls `ensureRegistered` with `owns: (d) => d.model_name === e.name && idOf(d).startsWith(ID_PREFIX)` and, for a
         `confidential` entry, `unpriced: await standInPrice(client)`.
    - `gatewayModelsAtBoot` is `capableModelAtBoot`'s shape: one `[boot] a gateway model (MANIFEST_GATEWAY_MODELS) '<name>' …` line
      per refusal, a thrown outage as one line, never fatal. It answers `{ name, state }[]` or `'failed'`.
  - **`index.ts`**: **BEFORE `capableModelAtBoot`** (*I5*), `gatewayModelsAtBoot(litellm, config.litellm.gatewayModels, gateway)`. Its
    failure is one line and never stops the capable model's boot. With AI off, `'disabled'`. The boot line gains `gatewayModels`.
  - **`ai/testing.ts`** (*M2*): the config seeding (`:282-292`) reads `output_cost_per_token` beside `input_cost_per_token`, so
    `/model/info` answers a config entry's output price as LiteLLM does. Run every `ai/*.test.ts` that reads a config entry's price
    afterwards, one at a time; a case whose expectation moves is named in the record.
  - **`.env.example`** (*M6*): `# MANIFEST_GATEWAY_MODELS=<name>=ubc-ai-gateway/<model>@<classification>,…`, commented, after the capable
    model's lines, with its one-line comment (registered at boot, removed when unset; needs the network; no fallback).
- [ ] **Step 5: Run the unit files — green.** Then the **Docker case** (`capable.docker.test.ts`, after `startingClear`): a `confidential`
  entry at the stub's `/gw/ok/v1` on Task 2's `GW_STUB_PORT`, **its gateway's `keyRef` `gatewayKeyRef('MANIFEST_STUB_BEARER')`, never
  the default** (*I3*), model `openai/probe-onprem-<run>` (unpriced), is registered at `1e-6` / `3e-6`; the stub's `authorized` count is
  the call's. A key holding only it is charged
  `usage × those` (`spendOf`, as the Task 12b case does). Then the entry is removed with the setting empty, and `LiteLLM_ProxyModelTable`
  holds no `manifest-gateway-` row.
- [ ] **Step 6: RUNBOOK**: a *UBC's AI Gateway's models* subsection covering the setting's form, the names Rich chose, the price rule, the
  `confidential` rule (Decision 7), **"naming one as `MANIFEST_CAPABLE_MODEL_FALLBACK` loses the offline fallback"**, and (*M10*)
  **"a `MANIFEST_GATEWAY_MODELS` entry has NO fallback: with the network off, a call to it fails — an app or agent that needs to work
  offline names `default-chat` or `default-chat-onprem`"**.
- [ ] **Step 7: Commit by name**, then **the negative controls**:
  - **(a)** `unpriced` ignored: predict red at *pins an unpriced CONFIDENTIAL entry*;
  - **(b)** the foreign-name check removed: predict red at *refuses a name the catalogue already holds* (a second `default-chat-onprem`
    deployment appears);
  - **(c)** the `ID_PREFIX` filter removed from the cleanup: predict red at *never touches the capable model*;
  - **(d)** `gatewayModelsAtBoot` moved back after `capableModelAtBoot`: predict red at *registered BEFORE the capable model's fallback*;
  - **(e)** the `failClosed` removal skipped: predict red at *FAILS CLOSED* only.
  ```bash
  git commit -m "feat(ai): UBC's AI Gateway's models in the catalogue — MANIFEST_GATEWAY_MODELS, each at its own classification (gateway plan Task 3)"
  ```

---

## Task 4: The guard and the gateway's own failures — `[M5]`'s branch

> **DECIDED AT SITTING 1 — NO GUARD CODE.** `[M5]` measured (`spikes/gateway-baseline/README.md`): a served model the key may not use
> answers **`403`**, a wrong key **`401`**, the key's budget spent **`429` `budget_exceeded`**, the gateway unreachable **`500`** — each
> non-malformed, each falling back (Branch A) — and **a model the gateway does not serve answers `400 invalid_request_error`**, told from a
> malformed request by nothing but `param=None` (Branch C). **Rich, 21:17 (the decisions file): (i), *accept it*** — over a boot probe, a
> `make verify`-only probe and message matching. So (c-i) stays a LOUD `400` to callers, with no fallback, until an administrator fixes
> the setting. **This task therefore writes no guard code and no probe**: Steps 2–4's Branch B do not run. It keeps Step 1's WITNESS
> Docker cases, rewritten to the cases that fall back — **(c-ii) `403` and (e) `429`**, in the shapes `[M5]` recorded (and (d) `401` and
> (g) `500` if the stub's existing shapes cover them) — **plus the malformed positive control**; `model-unserved` is NOT among the
> fall-back kinds (it is refused like a malformed request, by Rich's choice). On Branch A they are green at once, which IS the witness:
> commit them, then break the guard's status check and watch them go red.

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
- Modify: `ai/testing.ts` (the stub answers a `/gwfail/<kind>/v1` path in the shape `[M5]` recorded for (c-i), (c-ii) and (e) —
  **each MEASURED, never invented**; the first draft's `budget` shape would have been, because (e) was optional, *I9*),
  `ai/fallback-guard.docker.test.ts` (two cases, and a streamed one if `[M5]`'s streamed answers differ)

- [ ] **Step 1: The failing Docker cases** (on Branch A they are green at once, which IS the witness; say so in the record):
  ```ts
  it('the GATEWAY’s own failure — a model it no longer serves, its budget for the platform spent — is answered by the fallback (Review Focus 2)', async () => {
    for (const kind of ['model-unserved', 'model-not-on-key', 'budget'] as const) {   // [M5] (c-i), (c-ii), (e)
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

## Task 5: An agent key reaches the Responses API (Rich's Q2) — only if `[M4]` measured it needed — **DROPPED AT SITTING 1**

> **DROPPED (2026-10-03, sitting 1).** `[M4]`.8 measured the capable model, `gpt-6-luna` through UBC's gateway, ACCEPTING a function tool
> on `/v1/chat/completions` through both hops (`finish_reason: tool_calls`, `reasoning_effort` unset and `"none"`) — S5's refusal does not
> reproduce there. So nothing below runs, Spec action 2 is NOT NEEDED, and the contract stays `1.6.0`. **What replaces it for Phase 3 is
> Rich's binding rule (the decisions file, 20:52)** — see the header's *Successor*. Kept as written, for the record.

**It runs only if Task 1 Step 4.8 measured the capable candidate refusing tools on chat completions THROUGH BOTH HOPS** (*M9*; Step 2.4
is hop 2 alone), **and Step 4.1 measured `/v1/responses` charged at the pinned price** (*I7*). **Spec action 2 is decided first.**
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
  it('an agent key is answered on /v1/responses, and CHARGED for it; an intake key is refused it with LiteLLM’s route refusal', async () => {
    const agent = await respond(agentKey, 'default-chat')
    expect(agent.status).toBe(200)
    // I7: the route is opened only if it binds budgets. default-chat's synthetic $1 / $3 a million (config.yaml:26-27) makes the
    // charge exact; spendOf polls as capable.docker.test.ts's does (the spend lands ~10 s later).
    const { input_tokens, output_tokens } = agent.body.usage
    expect(await spendOf(client, agentKey)).toBeCloseTo(input_tokens * 1e-6 + output_tokens * 3e-6, 12)
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
- [ ] **Step 6: The successor starts from `1.6.1`** (*M7*). `2026-10-03-fe46-fe47-fe5.md` names only `1.7.0` (at `e8a2266`: l.50,
  l.300 and l.641 — re-read them, they will have moved). Add, at each, that it starts from `1.6.1` (this plan's Task 5), its `1.7.0`
  bump unchanged; commit that file by name, alone. If Task 5 does not run, the file is untouched and still right.
  ```bash
  git commit -m "feat(ai): agent keys reach /v1/responses — the capable model calls tools only there; contract 1.6.1 (gateway plan Task 5)"
  ```

---

## Task 6: The acceptance — `make demo-gateway`, and a person watching the gateway

**Alone, and last. It needs the network and the key**, so it is in no offline or CI step (Decision 10). Its caller is the `Makefile`.

> **SITTING 2 CHANGED FOUR OF THIS TASK'S CHECKS — read its record first** (F20, F26; and sitting 1's F4, F10): phase 2's *no
> `x-litellm-attempted-fallbacks` header* is `'0'` on a primary's answer; its *spent rose by `usage × the pinned price`* is, for a model the
> gateway prices (`gpt-6-luna`), the GATEWAY's reported cost (`x-litellm-response-cost`) — the pin binds only for `ubc-qwen-27b`; its
> gateway-side spend can no longer be read from Manifest's answers (F5 strips `llm_provider-x-litellm-key-*`) — read it from a direct call
> to the gateway or Rich's admin UI; and phase 0's expiry cannot come from the key's own `/key/info` (`403`). Phase 3 does not run.

**Files:**
- Create: `packages/journey/src/gateway.ts`, `scripts/demo-gateway.sh` (the sign-in prelude of `scripts/demo-launch.sh`, copied),
  `scripts/gateway-controls.sh` (restore-safe: stop, start with a changed setting, run, restore by `trap`, in
  `.superpowers/sdd/2026-09-30-faculty-ready/s5-edge-proof.sh`'s pattern)
- Modify: `Makefile` (`demo-gateway: up` and `.PHONY`), `docs/superpowers/RUNBOOK.md` (*make demo-gateway*), ORIENTATION §2's table (a
  row)

- [ ] **Step 1: The phases**, each ending `every check passed`, on whichever driver the control plane runs (it touches no source):
  0. **Configured?** LiteLLM's `/model/info` (master key) shows `default-chat-large`'s `api_base` equal to the gateway's address and at
     least one `manifest-gateway-` entry. Otherwise it prints `NOT RUN — the gateway is not configured (RUNBOOK, UBC's AI Gateway)` and
     exits `2`. **Then, configured:** `make verify`'s fingerprint check passes (`matches`), and **`.env`'s `UBC_AI_GATEWAY_KEY_EXPIRES`
     equals the date of the gateway's `/key/info` `expires`** (Decision 11) — a mismatch FAILS, naming both dates, never the key.
     `demo-gateway.sh` also reads the key's gateway-side `spend` here (`curl -K -`, `jq` to that one field) for phase 2's comparison.
  1. **The catalogue:** `default-chat-large` and each gateway name at the gateway's address and its classification. `default-chat` and
     `default-chat-onprem` still at `http://host.docker.internal:11434`.
  2. **An `internal` project's agent session** (`startAgentSession`, as `launch.ts:1662`):
     - its models hold `default-chat-large` and the `internal`-or-above gateway names;
     - a chat on `default-chat-large` answers `200` with content, **ANSWERED BY THE GATEWAY** (*I6*): no
       `x-litellm-attempted-fallbacks` header, and the body's `model` is not `qwen3.8:27b` (nor any `default-chat-onprem` model) — a
       fallback's reply is also a `200`, and spend rises for it too;
     - a STREAMED one ends `[DONE]` with content frames, with the same two checks on its response and frames;
     - **`getAgentBudget`'s spent rose by EXACTLY `usage × the pinned price`** (*I6*): greater than `0`, and equal at 12 decimal places,
       as `capable.docker.test.ts:280`'s `toBeCloseTo(…, 12)` — polled as `spendOf` polls, since the write lands ~10 s later. *The first
       draft's "within a cent" passed at spend `0`: one call costs ~$0.0001.* If Decision 6 pinned a cache-read price, `usage`'s
       `cached_tokens` are charged at it;
     - **the gateway's own charge, compared, not by eye** (*I8*): after phases 2–4, `demo-gateway.sh` reads the key's gateway-side
       `spend` again (polled up to 60 s; nothing else may use the key during the run) — it ROSE, and the ratio of Manifest's charges
       for the run's gateway calls to that rise lies in the band `[M3]`.6 measured and recorded. **Manifest charging LESS than the
       gateway FAILS**, unless `[M3]`.6 recorded why: a budget that binds late. If `[M1]`.3 found the key cannot read its own
       `/key/info`, this check is Rich's at Step 4, by his admin UI, recorded as such.
  3. **The Responses API with a tool** (only if Task 5 ran): `POST {baseUrl}/responses` with one function tool and a prompt that
     requires it answers `200` with a `function_call` output item, streamed and not — **and the agent's spent rose by exactly its
     `usage` × the pinned price, as phase 2's** (*I7*).
  4. **A `confidential` project's session** (the builder setting `capable`): its models hold the `confidential` gateway names and
     `default-chat-large`, and NOT `default-chat`. A call to a `confidential` gateway name answers `200`, charged at the stand-in's price.
  5. **The key, by COUNT and by DECRYPTED ROW** (Global Constraints):
     - `0` occurrences of its value in `docker logs manifest-litellm`, in the control plane's log, and in the journey's own output;
     - **`0` occurrences of the FRAGMENT a `401` echoes** (*M4*), in the form `[M5]`(d) measured, in the same three and in every table
       `[M5]`(d) found the canary's fragment landing in — counted, never printed;
     - **every gateway deployment's stored `api_key` DECRYPTS to the reference** (*I4*): Task 1's `[M3]`.5 snippet, run inside
       `manifest-litellm` with its own salt key, prints `equals the reference` for each `manifest-gateway-` row and the capable model's,
       and never `other`. *The first draft counted the clear-text key in a dump of an encrypted column: `0` whatever was stored.*
  6. Both sessions ended.
- [ ] **Step 2: Green three times** (a fresh project each run, then re-use). **Every other demo stays green** where it was last green,
  above all `make demo-frontend` and `make demo-launch`, which read `default-chat-onprem`. Then `make ci-acceptance`, whose steps never
  touch the gateway.
- [ ] **Step 3: The negative controls**, in `scripts/gateway-controls.sh` for Rich if the classifier refuses the restarts. Each is seen
  red where predicted and restored:
  - **(a)** `MANIFEST_UBC_AI_GATEWAY_URL=http://127.0.0.1:9/v1` (loopback `http`, which Decision 5 allows): phase 2's chat is answered
    by `default-chat-onprem` (`x-litellm-attempted-fallbacks: 1`, the model `ollama_chat/qwen3.8:27b`). **Phase 2's *answered by the
    gateway* check goes red there** — it now exists (*I6*) — which stands in for the network being off.
  - **(b)** the control plane started with `UBC_AI_GATEWAY_API_KEY=` empty — **re-predicted under the fail-closed boot** (*I6*, *C1*;
    the first draft predicted `NOT RUN` while its own Decision 4 kept the registration): the boot line's `capableModel` reads
    `refused` and each `gatewayModels` entry `refused`, one line each naming the missing key; **`/model/info` holds NO deployment at
    the gateway's address**; and phase 0 reads `NOT RUN` and exits `2`. Restored, the next boot registers them again and phase 0 passes.
  - **(b2)** a fail-closed boot with a DIRECT working model in place (`MANIFEST_CAPABLE_MODEL=openai/<model>` registered first, then
    the gateway setting with the key empty): `default-chat-large` stays, direct — the POSITIVE CONTROL for (b).
  - **(c)** a malformed request on `default-chat-large` (`max_tokens: -1`): the gateway's `400` reaches the caller, with no
    `x-litellm-attempted-fallbacks`.
  - **(d)** `MANIFEST_GATEWAY_MODELS` emptied: the entries are gone from `/model/info`, and phase 4 goes red.
  - **(e)** `UBC_AI_GATEWAY_KEY_EXPIRES` one day off, in a scratch `.env` copy (`MANIFEST_ENV_FILE`): phase 0 FAILS naming both dates,
    and `make doctor` against the same copy reads as Decision 11 says for that date.
- [ ] **Step 4: The person.** Rich runs phase 2 while his gateway admin UI is open, and **his key's spend moves by the same call** —
  the person's half of what phase 2 compares by `/key/info` (*I8*). If
  the faculty front-end runs against 7100 by then, he builds a small app on `app.manifest.internal`, and its agent session's capable
  calls are the gateway's. **He types every password** (or a staged headless sign-in, as his standing yes allows on `manifest.internal`).
- [ ] **Step 5: The plan's one whole-branch review**, beside the Docker tier, then one fix wave.
- [ ] **Step 6: Close out**:
  - the ledger;
  - ORIENTATION §7e (next: FE-46/47/5's plan) and §8 (the gateway as provider, *Decided*, built; *Open*'s Canada question gains `[M6]`
    and `[M9]`);
  - TRAPS (what `[M3]`–`[M7]` measured);
  - ORIENTATION §2's *Outstanding*: **the next offline acceptance runs WITH the gateway lines in `.env`** (*M10*) — each gateway entry
    fails offline by design, and `default-chat` and `default-chat-onprem` must still answer; and the key's rotation (about
    2027-01-01) now named by `make doctor`'s warning;
  - the front-end told;
  - `manifest-94` told.

---

## Task 6a: A streamed call charged its provider's usage — LiteLLM re-pinned to 1.102.0 (sitting 3, F32; Rich, 23:31 and 23:40)

*Added by sitting 3 (`manifest-be`), 2026-10-03, after `make demo-gateway`'s first run read Manifest's charge ÷ the gateway's rise =
0.788. Rich, 23:31 (the decisions file): "Fix it in this plan tonight"; 23:40: "Re-pin to 1.102.0, with a stop rule".*

**THE MEASUREMENT.** The run's stream was recorded by Manifest's LiteLLM as 14 prompt + 1 completion tokens (`LiteLLM_SpendLogs`,
`$0.0000019`); the same call direct to the gateway is 13 + 4 (`$0.0000033`, its own usage frame and spend), and the non-streamed call
matched to the digit. In throwaways from the pinned digest (`.superpowers/sdd/…/s3-probe/`, torn down each run, the key counted 0):
- hop 1 SENDS `stream_options: {include_usage: true}` to the provider, whether or not the client asked (the stub saw it);
- a usage in a frame of its OWN (`choices: []`, OpenAI's shape) is charged right — 5 + 1;
- a usage on a frame that ALSO carries a choice is dropped and the local count charged — the stub's finish-frame shape (14 + 1 for
  5 + 1) and **the gateway's own shape, measured direct: after the finish frame, a frame with ONE empty choice beside the usage and its
  `cost`** (14 + 1 for the stub's 5 + 1 at `$0.000777`; 14 + 1 for the real gateway's 13 + 4).

**THE DROP POINT** (LiteLLM 1.98.0, `litellm_core_utils/streaming_handler.py`, traced): `chunk_creator` KEEPS the provider's usage on that
chunk; `__anext__` (`:2054–:2070`) stores a copy in `self.chunks` and strips the outgoing chunk's usage; the end-of-stream assembly then
charges its own count. **No CustomLogger hook in 1.98.0 sees the provider's figure** — the guard's iterator hook receives the stripped
chunk, the success event only the computed 14 + 1 — so the guard could not correct it (the coordinator's stop rule, 23:31).

**THE FIX: re-pin to LiteLLM 1.102.0** (`ghcr.io/berriai/litellm:v1.102.0`, `sha256:32cfd7a427f6470033b4dcc9e75dfbea2aa32dbc298b0b511a40e962ce818362`,
built 2026-09-20 — the version the gateway itself runs). Measured in a throwaway: the gateway's shape charged the reported cost
(`$0.000777`), the real gateway's stream 13 + 4 (`$0.0000033`, the gateway's own charge), OpenAI's shape still 5 + 1; the guard loads.
- `infra/images.txt`'s pin and a dated comment; `infra/images.lock` regenerated by the seed's own step, `bash infra/seed/mirror-images.sh`
  (a dry run first: only LiteLLM's line moved); `make up` recreates `manifest-litellm`. `infra/lib/common.sh` reads the digest from the
  lock and `make doctor`'s `litellm_is_pinned` compares the daemon with it — neither needed an edit.
- LiteLLM's database dumped before the re-pin, for the stop rule's rollback.
- **The test, RED first**: `ai/testing.ts`'s stub streams the gateway's measured shape at a first segment `gwshape/`;
  `fallback-guard.docker.test.ts`'s *F32: a STREAM in UBC's gateway's shape is charged the cost the provider reported* — red on 1.98.0
  (`0.000015` for `0.000777`), green on 1.102.0 — beside its POSITIVE CONTROL in OpenAI's shape (`5 × 1e-6 + 1 × 1e-6`), green on both.
- **The stop rule** (Rich, 23:40): the whole Docker tier on 1.102.0; if it shows the guard broken (fallback refusals, the F5 strip, the
  422 handling, anything), the pin goes back to 1.98.0 (one line, `make up`, the dump restored) and F32 becomes a plan of its own.
- **Spec action 3** (below): §21's row names the version.

---

## What this plan does not build

- **Replacing Manifest's LiteLLM with UBC's** (rejected by Rich, 15:28). Manifest never holds the gateway's master key.
- **Removing `OPENAI_API_KEY`** (Rich, 16:13: *"Keep it as a backup"*). It stays in `.env` and LiteLLM's environment, and a direct
  `openai/…` setting still uses it. What keeps it from UBC's gateway is Decision 4's fail-closed boot and `[M7]`'s measurement, not
  its absence.
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

**TWO, DRAFTED 2026-10-03 WITH THIS PLAN. SPEC ACTION 1 IS APPLIED (Rich, 20:03 PDT); SPEC ACTION 2 IS NOT.** Each is decided by Rich before the sitting that builds it, and applied
only after he has read the words. **A spec action is not finished when the spec changes**: the shared HTML pages restate it, and are
swept with it.

### 1. §7, §21 and §26 — UBC's AI Gateway as the platform's upstream provider (before sitting 2) — ✅ APPLIED 2026-10-03

> **DECIDED by Rich, 2026-10-03, 20:03 PDT**, through the question tool (`../2026-09-30-decisions.md`, its 20:03 entry): ***"As proposed, 'confidential' wording"*** — option (a), with ONE change the coordinator `manifest-af` found and put to him: the new §7 paragraph's price sentence reads *"A model the platform cannot price is refused, except a `confidential` one, which is charged the on-premise model's synthetic price so budgets bind"*, not *"except an on-premise one"* — because Decision 6 and Task 3 (`unpriced` pinned only for a `confidential` entry; its test refuses an unpriced `internal` one) see a model's classification, never where it runs. **Applied by `manifest-af` at his word** (*"manifest-af, now"*): the spec's five places and `manifest-schematic.html:1072-1073`; `manifest-decisions.html`'s D17, `manifest-phases.html` and `manifest-stories.html` checked, unchanged. The words below are the DRAFT as it was.

**Why.** Rich decided it at 15:28 (*"As the upstream provider"*), and decided the shape of its models at 15:42 (Q1 (a)). The spec still
says the capable model is *"a commercial provider's"*, reached *"through the same LiteLLM"*, and names no way to add the gateway's models.

**Proposed**, five edits:
- **§7, the catalogue block** — `default-chat-large`'s comment: *"# the capable model — a commercial provider, off-prem"* becomes
  *"# the capable model — a commercial provider, through UBC's AI Gateway or directly, off-prem"*.
- **§7, the capable model's paragraph**, its second sentence: *"Which model answers it is a platform setting (§26) — a commercial
  provider's today — so repointing it changes no app, key or manifest."* becomes:
  > *"Which model answers it is a platform setting (§26) — a commercial provider's, reached through **UBC's AI Gateway**, a LiteLLM proxy
  > LTIC runs on UBC infrastructure, or directly where an administrator sets it so — so repointing it changes no app, key or
  > manifest."*

  *(Reworded with the review's M8: the first draft read as if the gateway were the only route, while a direct `openai/…` setting stays
  supported and Rich keeps `OPENAI_API_KEY` as its backup.)*
- **§7, a new paragraph after *"Its fallback is the on-premise model."*'s**:
  > *"**UBC's AI Gateway is the platform's upstream provider, not its gateway.** Manifest's own LiteLLM keeps every key it mints, every
  > budget and every guard (§10, D7), and reaches the AI Gateway with ONE platform credential that only it holds — referenced from its own
  > environment, never stored with a model, and never kept by the control plane, which removes the AI Gateway's models rather than
  > leave them without it. Besides the capable model, an administrator may add models the AI Gateway serves to the catalogue under
  > logical names of their own (§26), each at the `max_classification` the
  > administrator gives it — `confidential` only for a model that runs on UBC's hardware with no fallback off it, which the platform
  > cannot see and the administrator attests. A model the platform cannot price is refused, except an on-premise one, which is charged
  > the on-premise model's synthetic price so budgets bind. Every such entry needs the network; `default-chat` and the on-premise model
  > a laptop runs stay local, so nothing offline depends on the AI Gateway (C1)."*

  *(M8: "never kept", not "never seen" — `loadConfig` reads whether the credential is set, and the scrub removes it at once; the first
  draft's "never seen" was false of the code Task 2 builds. The clause after it is Decision 4's fail-closed boot.)*
- **§21, the LiteLLM row**: *"The capable model, when configured, is a commercial provider reached through the same LiteLLM with the
  network on"* becomes *"The capable model, when configured, is a commercial provider reached through the same LiteLLM — by way of
  UBC's AI Gateway, this LiteLLM's upstream provider, with one credential only it holds, or directly — with the network on"*.
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

### 2. §10 — an agent key also reaches the Responses API (before sitting 2; ONLY IF `[M4]`.8 MEASURES IT NEEDED, THROUGH BOTH HOPS) — **NOT NEEDED**

> **NOT NEEDED (2026-10-03, sitting 1):** `[M4]`.8 measured tools accepted on chat completions through both hops, so Task 5 dropped and
> §10 keeps its three routes. Not put to Rich; kept as drafted, for the record.

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

### 3. §21 (and §10's dated sentence) — LiteLLM 1.102.0 (sitting 3, Task 6a; Rich approved the change in substance at 23:40) — **PROPOSED, for his words**

§21's LiteLLM row (spec line 2175) names the pinned version. Today: *"Deployed **by digest**, recorded in `infra/images.lock` — litellm
1.98.0, `sha256:20b5044b…` — because `ghcr.io/berriai/litellm:main-stable` is a moving tag (it moved between 2026-09-07 and 2026-09-09)."*
**Proposed:** *"Deployed **by digest**, recorded in `infra/images.lock` — litellm 1.102.0, `sha256:32cfd7a4…`, re-pinned from 1.98.0 on
2026-10-03 because 1.98.0 charged a streamed call by its own count of the visible text rather than the provider's reported usage, so a
model's hidden and reasoning tokens went uncharged — because `ghcr.io/berriai/litellm:main-stable` is a moving tag (it moved between
2026-09-07 and 2026-09-09)."* The row's next sentence (*"This is the version §16 pins the AI error mapping to."*) stays: the Docker
tier's `ai-path` cases re-prove the mapping on 1.102.0.

§10's per-user budget paragraph (l.1082) states 1.98.0 as THE pin: *"At the LiteLLM version §21 pins (1.98.0), …"* — **proposed:** *"At
LiteLLM 1.98.0, the version §21 pinned when this was measured (2026-09-07), …"* (not re-measured on 1.102.0; the paragraph's claim —
validated, not enforced — is unchanged). §7's l.438 (*"Measured on LiteLLM 1.98.0 (2026-09-07)"*) is dated history and stays; §16
(l.1746) names no version.

---

## What the self-review caught

- **The key's mechanics.** The first draft had the Docker case's stub record the `Authorization` header. A deployment aimed at the stub
  that named no key, or an unresolved one, could carry LiteLLM's real `OPENAI_API_KEY` there (Read this first 14). So the stub records
  only whether the header matched a harmless expected value. *Corrected by the fresh review (M1, I2):* this bullet first said the
  existing probes name no key — they name `probe-not-a-key` and `sk-probe-not-a-key` — and the case first resolved `STORE_MODEL_IN_DB`,
  whose `"True"` LiteLLM very likely reads as a boolean, which would have sent the real key after all. It now resolves
  `MANIFEST_STUB_BEARER`, a plain non-secret string `infra/compose.yaml` gives LiteLLM (Task 2).
- **A `401` from a LiteLLM echoes part of the key it was sent**, so every captured body goes through `redact.pl`. `[M5]`'s wrong-key case
  uses a canary, never Rich's key.
- **The repoint direct → gateway** expands to the same model string. It became *Review Focus* 5 and Task 2's first capable case.
- **`keyInEnv` from the scrub's removed list** would count an EMPTY `.env` line as set, because the scrub removes defined variables.
  `loadConfig` therefore reads the variable once and keeps only `!== ''`.
- **Task 5's Docker case cannot use the gateway** (the tier is offline). It rests on `[M4]` Step 6, LiteLLM bridging `/v1/responses` for
  `default-chat`. If that measures *no*, the case moves to `make demo-gateway`'s phase 3 alone, and the record says so.

---

## The fresh review's fixes, and where each landed

*Applied 2026-10-03 by `manifest-cd`, from [`2026-10-03-review-of-ubc-ai-gateway-plan.md`](./2026-10-03-review-of-ubc-ai-gateway-plan.md),
whose `file:line` premises were spot-checked against the code at `e8a2266` before building them in (every one opened held). Each is
marked in place with its id.*

| Id | The fix | Where |
|---|---|---|
| **C1** | Fail closed; `[M7]`'s four cases on both providers; a fingerprint, not presence. ~~Removing `OPENAI_API_KEY`~~ — **declined by Rich, 16:13** | Decisions 2 and 4 (unconditional — a routine call, recorded there); Architecture; Task 1 Step 7; Task 2; Task 3 Step 4; Review Focus 1 |
| **I1** | The scrub entry and its test move to sitting 1, before the line is uncommented | **Task 0** (new); sittings table; Read this first 5 |
| **I2** | A non-boolean, non-secret stand-in bearer; `"True"` into `[M7]`; control (c) at the unit tier; no "unset reference" Docker case | Task 2 (compose's `MANIFEST_STUB_BEARER`, Step 5, Step 7 (c)); Task 1 Step 7 |
| **I3** | Every stub-bound deployment names a canary or the harmless reference | Global Constraints; Task 1 (throwaway, Steps 4.2, 6); Task 3 Step 5 |
| **I4** | Rows checked DECRYPTED, by verdict | Global Constraints; Task 1 Step 3.5; Task 6 phase 5 |
| **I5** | `gatewayModelsAtBoot` BEFORE `capableModelAtBoot` | Task 3 (caller, a test, Step 4, control (d)); Read this first 18 |
| **I6** | "Answered by the gateway" asserted; spend exact, never "within a cent"; control (b) re-predicted | Task 6 phase 2, Step 3 (a), (b), (b2) |
| **I7** | `/v1/responses`' spend, `store`, and another key's read measured; Task 5 and phase 3 assert spend | Task 1 Step 4.1, 4.3; Task 5; Task 6 phase 3 |
| **I8** | The cache measured against the gateway's own charge; a cache-read pin if LiteLLM has one; the ceiling (DONE, 16:23); `/key/info` compared | Decision 6; Task 1 Steps 1.3, 3.6; Task 2; Task 6 phases 0 and 2 |
| **I9** | Streamed error shapes; (e) REQUIRED on a probe key; (c) both ways | *What Rich does* 3; Task 1 Step 5; Task 4 |
| **I10** | `http` refused off loopback; empty is unset | Decision 5; Task 2 (config, tests, control (d)) |
| **M1** | Read this first 14 and the self-review corrected | Read this first 14; *What the self-review caught* |
| **M2** | The fake seeds a config entry's output price | Task 3 (Files, Step 2, Step 4); Read this first 19 |
| **M3** | The Docker case on the file's real helpers, `startingClear`, port 7193 | Task 2 Step 5; Read this first 20 |
| **M4** | The `401`'s echoed fragment: where it lands, and counted | Global Constraints; Task 1 Step 5 (d); Task 6 phase 5 |
| **M5** | Split a gateway model entry on its LAST `@` | Task 3 (Step 2, Step 4) |
| **M6** | `.env.example`'s new lines and `:172`'s example | Task 2 Step 3; Task 3 Step 4; File Structure |
| **M7** | FE-46/47/5's plan starts from `1.6.1` | Task 5 Step 6 |
| **M8** | Spec action 1: "never kept"; the direct route still named | Spec action 1 |
| **M9** | LTIC's addresses committed as present/absent only; Task 5's trigger through both hops | Task 1 Steps 1.2, 2.4, 4.8; Task 5 |
| **M10** | A `timeout`; TLS verified; gateway entries fail offline (RUNBOOK); the next offline acceptance with the gateway lines | Decision 12; Task 1 Steps 2.5, 3.8, 3.9; Task 3 Step 6; Task 6 Step 6 |
| **M11** | A stop point after Task 3; sitting 2b if Branch B and Task 5 both run | The sittings section |
| *(16:23)* | The key's 90-day expiry warned ahead (`manifest-94`'s suggestion; decided here) | **Decision 11**; Task 1 Steps 1.3, 9; Task 2; Task 6 phase 0, control (e); Review Focus 6 |

---

## What executing this plan found

*Each sitting adds a dated entry: every defect with the measurement that found it, every negative control (and which could not fail,
and why), the gate numbers and the machine at the close.*

### Sitting 1 — 2026-10-03, 19:58–21:20 PDT (`manifest-ec`, coordinated by `manifest-af`): Tasks 0 and 1

**Task 0 — `90bca1e`.** `UBC_AI_GATEWAY_API_KEY` named in `secrets/scrub.ts` and in `scrub.test.ts`'s list. The test was RED at exactly its one
case before the name (*"expected [ … ] to include 'UBC_AI_GATEWAY_API_KEY'"*), green after. **The four gates:** `pnpm test` twice, alone —
**3289/3289, 201 files**, 978 s and 963 s (load 3.3–4.5) — and `pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean;
`boot.docker.test.ts` alone, after the platform was already up, **7/7** (56 s). **The negative control** (the name removed after the
commit): 1 failed at the one case, restored 4/4. **The real boot** (`s7-cp.sh real`, RUNBOOK's start block): **`secretsScrubbed` 15** with
the line commented (20:34:00), the line uncommented by the plan's `sed` at Rich's 19:58 word (`grep -c` → 1), **16** after it (20:34:25) —
the real process removed the key, which no test tier shows. The key's value in both boot logs and the migrate log: **0**. `make doctor`
21/0/0, `make verify` 66/0/0. **These two `pnpm test` runs are the sitting's close runs**: nothing under `packages/` changed after them.
7100 was then F5b's, 20:35:46–21:17.

**Task 1 — `ec8a755`**: [`../spikes/gateway-baseline/README.md`](../spikes/gateway-baseline/README.md) is the record, one section per
measurement; this entry is its findings. **No key's value was printed or written** (counted 0 in every file the sitting wrote); the
gateway's upstream addresses and OpenAI organisation are recorded as a class only (M9).

1. **F1 Task 5 DROPS** (`[M4]`.8). Through both hops, `gpt-6-luna` on `/v1/chat/completions` with a function tool answers
   `finish_reason: tool_calls`, `reasoning_effort` unset and `"none"` (hop 2 alone the same, `[M2]`.4). S5's refusal (`S5-findings.md:89-93`)
   does not reproduce on UBC's gateway. *Read this first* 10's premise is wrong for this provider. Spec action 2 NOT NEEDED; contract `1.6.0`.
2. **F2 THE STOP: one Manifest key reads another's stored response** (`[M4]`.3). Responses are stored by default (`store: true`); hop 1
   forwards `GET /v1/responses/{id}` to the provider with the DEPLOYMENT's key, and every Manifest key reaches the gateway on one key — so
   a second scratch key read the first's response (`200`), and a key listing only `/v1/responses` read `…/input_items` (the prompt):
   **`allowed_routes` matches by prefix**. Nothing open today is exposed (every key holds the three routes; Task 5 dropped). **Rich, 20:52:
   *"Yes, a binding Phase 3 rule"*** — when Phase 3 first gives any Manifest key `/v1/responses`, its plan forces `store: false` OR refuses
   `GET /v1/responses/{id}` and `…/input_items`, with a test that one key cannot read another's answer (ORIENTATION §8, TRAPS, the roadmap).
3. **F3 The same at UBC's gateway itself** (`[M4c]`, Rich's ask, 20:48:32): the PROBE key — another team, one other model — read the real
   key's stored response and its `input_items` (`200` each); the real key's `DELETE` then answered `200`, its `GET` `404`. A response id is
   all any virtual key there needs. A fact for Rich as the gateway's administrator.
4. **F4 Hop 1 charges what the gateway REPORTS, not its own pin** (`[M3]`.6, 6c, 6d). LiteLLM 1.98.0 prices a call from the provider's
   `llm_provider-x-litellm-response-cost` header when one is sent (`cost_calculator.py:1698-1712`): a pin at 10× the map's price still
   charged the gateway's `$0.00003124`, cache creation and cache reads included (the ratio Decision 6 rests on is **1.0**). When the gateway
   sends none (`qwen3.8-27b`), the pin binds (`$0.000149` = 59×1e-6 + 30×3e-6; unpinned, `$0`). **What Task 2's pin then means:** for a
   model the gateway prices, the pin is never read and the person pays UBC's price; for one it does not, the pin is the whole price —
   Decision 6's `confidential` synthetic pin works as written, and its cache-read row is moot.
5. **F5 UBC's key's budget, spend and upstream reach every hop-1 caller** (`[M3]`.6, `[M5]`(e)). LiteLLM forwards every provider header as
   `llm_provider-{header}` (`get_headers.py:7-38`), so every Manifest app and agent reads `llm_provider-x-litellm-key-max-budget: 30.0`,
   `…-key-spend` and the gateway's upstream address; **and with no fallback the gateway's budget `429` reaches the caller verbatim**, with
   the key's alias and its `sk-...` last-4 fragment. The same headers carry F4's cost, so stripping them before costing moves billing. Options
   (README, *For sitting 2*): strip in the guard file AFTER costing (recommended), strip at the edge (console and agents only), or accept
   until *before production*. **Put to Rich before sitting 2.**
6. **F6 Task 4's branch: A for every case but (c-i)** (`[M5]`). (c-ii) `403`, (d) `401`, (e) `429`, (g) `500` fall back; (a) is refused,
   correctly; **(c-i), a model the gateway does not serve, is `400 invalid_request_error`, told from (a) only by `param=None`** — Branch C.
   **Rich, 21:17: (i) *accept it*** — no guard code, no probe; Task 4 keeps its witness cases (its heading says how).
7. **F7 The gateway's budget refusal is `429 budget_exceeded`, not `400`** (`[M5]`(e)) — so `manifest_guard.py:48-50`'s known limit (*"a
   provider may answer its OWN failure — a billing one, say — with 400"*) does not bite on UBC's gateway; the guard reads `RateLimitError`
   429 and falls back, plain and streamed.
8. **F8 Every unresolved, empty or absent `api_key` sends `OPENAI_API_KEY` — on BOTH providers** (`[M7]`): `os.environ/PROBE_UNSET`,
   `os.environ/PROBE_EMPTY` (what `${…:-}` gives) and no key at all each reached the stub as gw-probe's canary, on `openai/` and on
   `litellm_proxy/` alike. Decision 4's mechanism is LIVE, and **Decision 2's hoped-for difference does not exist** — `openai/` stands.
   `os.environ/MANIFEST_STUB_BEARER` resolves as a plain string (Task 2's stand-in works).
9. **F9 A reference that resolves to a BOOLEAN poisons LiteLLM's router** (`[M7]`, found by its case 3). `get_secret` turns `"True"` into
   `True`, `LiteLLM_Params` refuses it at every reload (*"Input should be a valid string … input_type=bool"*), and **every later `/model/new`
   answers `500` *"saved to the database, but … not live"*** — eleven registrations stayed dead until BOTH such rows were deleted, then went
   live within ~60 s. In `manifest-litellm` that would silently block every later capable-model or gateway registration. TRAPS.
10. **F10 The key's ceiling is 30 USD, not 20** (`x-litellm-key-max-budget: 30.0`; Rich, 20:56: *"The platform key has $30 budget. Expires Jan
    1, 2027 at 3:23 PM. No rpm/tpm limits. All models."*) — the 16:23 figure is superseded. **A gateway key cannot read its own
    `/key/info`** (`403`, *"Only allowed to call routes: ['llm_api_routes']"*), so `UBC_AI_GATEWAY_KEY_EXPIRES=2027-01-01` is Rich's reading
    (appended at 20:57) and **Task 6's `/key/info` comparisons become the answers' `x-litellm-key-spend` header**.
11. **F11 The gateway HAS a fallback** (`[M5]`): its own `400`s quote its router, *"Fallbacks=[{'qwen3.6-35b-a3b': ['gpt-6-luna']}]"* — on-prem
    to off-prem — though the key's page shows none. While it stands `qwen3.6-35b-a3b` cannot be `confidential` (Decision 7). Rich, 21:12:
    *"Don't worry about the fallback that's currently set I can sort that later, it's not a blocker for us here."*
12. **F12 Decision 12's `timeout` is per ATTEMPT, and LiteLLM retries twice** (`[M3]`.9): `timeout: 2` at a stalled stub answered `408`
    after ~10.8 s (3 attempts), streamed or not; `stream_timeout: 2` bounds only a stream; with `num_retries: 0` beside it, ~2.05 s. So
    Task 2 sets `GATEWAY_TIMEOUT_S` and the retries together. The longest legitimate answer: `[M2]`'s **35.2 s** (~3,000 tokens); a stream's
    first frame after **13.0 s** (reasoning first).
13. **F13 A scratch key's `allowed_routes` refuse its own `/key/info`** (`[M3]`.6): the plan's spend reading through the key itself read
    `null`; read through the admin (`/key/info?key=`) or the answers' `x-litellm-key-spend`. `/key/update { models }` KEEPS
    `allowed_routes` (`[M4]`.7, re-measured that way).
14. **F14 The gateway shows every virtual key its `litellm_params`**, an `api_base` for three self-hosted models (`[M1]`), and names each
    answer's upstream in `x-litellm-model-api-base`. Recorded as present/absent and as a class; a fact for Rich as its administrator.
15. **F15 Hop 1 forwards only `model` and `messages`** (`[M6]`): neither the end-user hash (`user`), nor key or request metadata, nor any
    trace header reached the provider. UBC's gateway sees one key and the messages, and cannot attribute a call to a person or an app.
16. **F16 The PROBE key's budget was `$0.10`, not `$0.01`, and the gateway's prompt cache charged twelve identical 32k-token calls
    `$0.0000118` each after the first** (`[M5]`(e)) — (e) needed unique prefixes and then Rich lowering the budget to `$0.01` (21:12); measured
    in three calls, never hammering. Both keys' facts are read from response headers, since neither key reads `/key/info`.
17. **F17 Four of my probes were broken by my own bodies** — a brace expansion (`m3.sh` step 7: `422`), a backslash-laden default (`m5.sh`
    a–d: every case `400 "Invalid JSON payload"`), a `jq --argjson` with a leading comma (`m3b.sh` 6c), and a copied script resolving
    `lib.sh` beside itself. **Each read as the provider's refusal until its body was read**; each was re-run and the record says which.
18. **F18 The redactor's first version let the gateway's upstream addresses and OpenAI organisation into the results file**
    (`x-litellm-model-api-base`, `llm_provider-*`) — caught before any commit by reading the file; `redact.pl` now classes upstreams, keeps the
    gateway's own address and the cost numbers, and drops organisation, project, request ids, cookies and response ids.

**Negative controls.** Task 0's (above), red at the one case. Task 1 is measurement; its controls are the canaries: `OPENAI_API_KEY` a
canary in gw-probe (F8 is it firing), the stub's digest classes for both keys (never fired), the real key's value counted in every file
(0), and `decrypt-verdict.py`'s `other` branch (`[M3]`.5 read `equals the reference`).

**Rich's words this sitting** (the decisions file, clock times): 19:58 (the 7100 order; the `sed`; the expiry from `/key/info`), 20:27, 20:42,
20:52, 20:56, 21:12, 21:17 — each quoted where it is used above and in the README.

**The gates at the close:** no new `pnpm test` (the lean budget; Task 0's two runs above are the close runs, nothing under `packages/` changed
since). `pnpm lint` and `pnpm format:check` clean with the spike committed. `EXPECT_TESTS=3289`, `EXPECT_FILES=201`, `EXPECT_DOCTOR=21`,
`EXPECT_VERIFY=66` — unmoved. `pnpm test:docker`'s count unmoved (only `boot.docker.test.ts` ran).

**The machine at the close, queried at 21:18 PDT:** 7100 is PID 81128 (started 20:34:31, real GitHub), holding F5b's rows (4 users, 1
project: `f5b-measure-1`, LAUNCHED — a real private repository in `Manifest-local-dev`, Rich's). `.env`: the gateway key's line live (1),
none commented, `UBC_AI_GATEWAY_KEY_EXPIRES=2027-01-01` (1), mode 600. **28 Docker networks** (25 at the start; `dead-app-resources.sh`
reads 0 dead — F5b's), 48 `mf-` containers, 0 `gw-probe*`, 7197/7198 free; the probe key's file gone. The cleanup scripts bare, then:
`app-images.sh --apply` (5 dead daemon copies — 4 older `f5b-measure-1` builds and 1 `boot-recover`; re-run reads 0); **`litellm-orphans.sh`
NOT applied** — its one orphan is `instructor`'s agent budget, F5b's (`manifest-af`'s call, 21:17); `dead-app-resources.sh` 0 dead (13 orphan
mirrors named, Rich's). The four protected containers running. Free disk 61 GiB. `platform-window` FREE.

### Sitting 2 — 2026-10-03, 21:27–23:10 PDT (`manifest-61`, coordinated by `manifest-af`): Tasks 2, 3 and 4

**Task 2 — `3c05c7f`** (and `75ed30b`, the trade-off beside the constant). `ai/providers.ts` (`resolveSetting`, `Gateway`, `GATEWAY_TIMEOUT_S`,
`GATEWAY_NUM_RETRIES`); `ensureCapableModel(client, setting, gateway?)` resolves first, compares the ADDRESS in `unchanged`, and on
`failClosed` removes every capable deployment that names an `api_base` before the existing refusal keeps a direct one; `config.ubcAiGateway`
(`MANIFEST_UBC_AI_GATEWAY_URL`, empty is unset; `keyInEnv`); `index.ts` builds the `Gateway`; `infra/compose.yaml` hands LiteLLM
`UBC_AI_GATEWAY_API_KEY` and `MANIFEST_STUB_BEARER: probe-not-a-key`; `make verify`'s fingerprint check (`EXPECT_VERIFY` 66 → 67) and
`make doctor`'s expiry warning (`EXPECT_DOCTOR` 21 → 22); `.env.example`'s two lines and the capable model's second form; RUNBOOK's
*Through UBC's AI Gateway*. The new unit cases red at the expected lines first (`providers.js` absent, then every gateway case `refused`
because today's code sent `ubc-ai-gateway/…` as a provider string), then green; every existing `capable.test.ts` case green unchanged.
**`make up` ran at 21:36** (Step 5): LiteLLM holds both variables, the key's value counted 0 in the `make up` log and in `docker logs
manifest-litellm`. The Docker case: the stub on 7193 saw one call carrying the bearer LiteLLM resolved from ITS environment;
`/model/info` lists the gateway's `api_base` and no `api_key` at all.

**Task 3 — `475dfcb` (the refactor, `capable.test.ts` 48/48 unedited) and `13f351c`.** `ai/registration.ts`'s `ensureRegistered` (with
`unpriced`); `ai/gateway-models.ts` (`ensureGatewayModels`, `standInPrice`, `gatewayModelsAtBoot`, `platformModelsAtBoot`);
`MANIFEST_GATEWAY_MODELS` parsed in `config.ts`; the boot line's `gatewayModels`; the fake seeds a config entry's output price (M2 — no other
`ai/` case's expectation moved; `config.test.ts`'s *defaults the LiteLLM settings* gained `gatewayModels: []`, by design). The Docker case
against the running LiteLLM: a `confidential` entry at `openai/probe-onprem-<run>` (which LiteLLM prices `0`) registered at `1e-6` / `3e-6`,
`max_classification: confidential`, an id beginning `manifest-gateway-`, no `api_key` listed; a key holding only it was charged exactly
`usage × those`; removed with the setting empty, and no row of its name left in `LiteLLM_ProxyModelTable`.

**Task 4 — `a1fad27` (the witness, no guard code — Rich, 21:17) and `f439fc6` (F5, Rich, 21:25).** The stub's `/gwfail/budget/v1` (the gateway's
own `429 budget_exceeded` body from `[M5]`(e)) and `/gwfail/model-not-on-key/v1` (see F25); both fall back, and a malformed `400` asked after
them is still the caller's — green at once, which on Branch A is the witness. F5: see F26–F27.

**What this sitting found** (each with the measurement that found it):

1. **F19 A `ConfigError` code is a value of the published `ErrorCode` enum** — `api/error-codes.test.ts` scans every `new ConfigError(…)` and
   the registry is the contract's enum — so Decision 5's `CONFIG_UBC_AI_GATEWAY_INSECURE_URL` and Task 3's `CONFIG_GATEWAY_MODELS_INVALID`
   would each have changed the contract the plan holds at `1.6.0`. **Both are the published `CONFIG_INVALID`**, with a message naming the
   setting (and the entry), and the tests assert the message. **A sitting decision, accepted by the coordinator** (22:0x); Decision 5 is
   marked. TRAPS.
2. **F20 `x-litellm-attempted-fallbacks` reads `'0'` on an answer the primary gave, not no header** (LiteLLM 1.98.0): the plan's Docker case
   asserted `toBeNull()`, never measured, and was red on a healthy call; it asserts `'0'`. TRAPS.
3. **F21 `GATEWAY_TIMEOUT_S = 60`, `GATEWAY_NUM_RETRIES = 0`** — a sitting decision, accepted by the coordinator: F12 measured the timeout per
   attempt with two retries, and `[M2]`'s longest answer was 35.2 s. The trade-off, beside the constant: at ~85 tokens a second a
   NON-streamed answer past ~5,000 tokens is cut and the on-premise fallback answers; a stream waits only for its start (13.0 s measured;
   that a healthy stream longer than 60 s is never cut is not measured); one transient gateway 5xx goes straight to the fallback.
   `ProviderParams` gained `num_retries`; Decision 12 is marked.
4. **F22 The plan's Task 3 control (c) — the `ID_PREFIX` filter removed — throws rather than testing what it names**: the cleanup's first
   `/model/delete` of a config entry is refused `400`, as LiteLLM's is, so 10 of 12 cases go red for that one reason. Run as written, then
   as **(c′)** — any DB-held deployment the setting does not list removed — red at exactly *never touches the capable model* and *FAILS
   CLOSED*'s capable-untouched check.
5. **F23 `ensureRegistered(client, r)` could not keep `capable.test.ts` unedited**: its *changes nothing* case counts ONE `/model/info` a call,
   and a registration that re-read its own deployments made two. `ensureRegistered(client, r, ours)` takes what the caller already read.
6. **F24 The boot's order lived in `index.ts`, which no unit test runs** — so control (d) could not fail anywhere but the Docker tier.
   `platformModelsAtBoot` (in `gateway-models.ts`) holds it and `index.ts` calls it; control (d) went red at *registered BEFORE the capable
   model's fallback* AND at *a gateway-models step that fails never stops the capable model's* — unpredicted, its cause read: that case's
   one-shot `/model/info` failure lands on whichever step reads first.
7. **F25 `[M5]`(c-ii)'s body was never recorded** (only `APIError 403`), so the plan's *"each MEASURED, never invented"* had no shape for the
   stub. Measured at 21:5x on the RUNNING `manifest-litellm` with a throwaway key (deleted, `200`): LiteLLM 1.98.0 answers it `403
   {"error":{"type":"key_model_access_denied","param":"model","code":"403",…}}`, streamed or not. The Global Constraint says measure in a
   throwaway LiteLLM — a read of its own refusal, nothing registered — recorded, not hidden. The guard decides by status alone.
8. **F26 F5's mechanism in 1.98.0, read in the pinned image**: a request's headers are re-read from `_hidden_params["additional_headers"]` AFTER
   the post-call success hook, so the guard REMOVES `llm_provider-x-litellm-key-*` and `llm_provider-x-litellm-model-api-base` there; a
   STREAM's are built before any hook sees it and the only later hook sets with `update`, so a stream's are EMPTIED (the names reach the
   caller, valueless); **a failure forwards no upstream header at all** — measured as a Docker case first: a refused `400` and a `429` with no
   fallback carried no `llm_provider-*` header — so no failure-path strip was built (it would have no observable effect), and a witness case
   goes red if an upgrade starts forwarding them. `llm_provider-x-litellm-response-cost` is kept; the non-streamed case, on a key of its own,
   was charged the stub's reported `0.000777` after the strip (the pin would charge `6e-6`). TRAPS.
9. **F27 NOT covered, recorded for *before production*** (beside LiteLLM's four tracked leaks): the BODY of a failure — the gateway's budget
   `429` reaches a caller with no fallback verbatim, its key's alias and `sk-...` last four — and LiteLLM's own `x-litellm-*` headers. No
   hook rewrites a body without widening F5 (the coordinator's word: do not).
10. **F28 LiteLLM 1.98.0 prices none of the gateway's self-hosted models** (its map read in a throwaway, network on, 4,472 entries):
    `openai/gpt-6-luna`, `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.4-mini` priced; `llama3`, `qwen3.8-27b`, `qwen3.6-35b-a3b`, `phi3.5` not. So
    an entry for any of the four registers only at `confidential` (pinned at the stand-in's `$1 / $3`), and `qwen3.6-35b-a3b` and `llama3`
    cannot be registered at all today (Decision 6's fix is the gateway's). Put to Rich with his `MANIFEST_GATEWAY_MODELS`. TRAPS.
11. **F29 The stub never streamed**: an `ok` path answered JSON to a `stream: true` request. It answers SSE now (a role frame, `ok`, the
    finish, usage, `[DONE]`) — no existing case sent a streamed request to an `ok` path, so none moved.
12. **F30 The plan's Interfaces had `capableModelAtBoot(…, gateway)` required**, which would have edited every existing boot case; it is
    optional (`index.ts` always passes it). And `GatewayModel`'s shape is stated twice, structurally (config.ts's parse, `gateway-models.ts`),
    because no production module imports `config.ts` and `config.ts` imports no `ai/` module.
13. **F31 The Docker tier ran out of Docker Desktop's address pools** (TRAPS, *DOCKER DESKTOP RUNS OUT OF NETWORKS AT ~31*): 28 networks at
    its start — 16 `mf-` networks held by LIVE containers, F5b's three among them, none dead — and ~6 subnets free where it needs 7, so five
    files went red on `POST /networks/create failed (400): all predefined address pools have been fully subnetted` (51 times): 24 failed and
    17 skipped, in `runtime/docker/driver`, `runtime/docker/networks`, `runtime/docker/egress`, `releases/app-secrets` and
    `sso/login`. Predicted before the run, and handled as TRAPS says: `dead-app-resources.sh --apply` (the tier's own five), then
    `driver` + `networks` alone **40/40** (203 s) and the other three alone **16/16** (82 s). Removing the live apps' containers, or
    widening the pools, is Rich's.

**Negative controls**, each predicted, seen red, restored (`git diff` empty; the guard's written through its inode, LiteLLM restarted, the
container's copy read back equal to HEAD's):
- **Task 2:** (a) `unchanged` by the model string alone → red at *repoints from OpenAI direct* only; (b) `keyInEnv` forced true → red at
  providers' *refuses … no key*, capable's POSITIVE CONTROL, *FAILS CLOSED* and the boot's keyless case; (b2) the fail-closed removal
  skipped → *FAILS CLOSED* and the boot's keyless case, the POSITIVE CONTROL green; (c) `api_key` dropped (unit tier only, I2) → the two
  *sends/registers … by reference* cases; (d) the insecure-URL refusal removed → its case only; (e) `make verify`'s check against scratch
  files — a canary key `differs`, no key while LiteLLM holds one `LiteLLM holds a key … does not`, the real `.env` `matches`, and before the
  `make up` `absent from LiteLLM` and `not configured`; (f) `make doctor`'s — tomorrow WARN, a year PASS, no expiry WARN *unknown*, three
  days past WARN *EXPIRED*, `next-year` WARN *not a date*, no key PASS; (c2) the Docker case with the stub expecting another bearer → red at
  `authorized` 0, `hits` 1.
- **Task 3:** (a) `unpriced` ignored → *pins an unpriced CONFIDENTIAL entry* only; (b) the foreign-name check removed → *refuses a name the
  catalogue already holds* only; (c) and (c′), F22; (d), F24; (e) the fail-closed removal skipped → *FAILS CLOSED* only.
- **Task 4:** the guard told 403 and 429 are malformed → red at exactly the two witness cases and the existing `403` and `429` (4/24);
  (f5a) the success hook's removal skipped → the non-streamed F5 case only (`''`, not `null` — the headers hook then empties them); (f5b)
  the headers hook returning nothing → the streamed case only (`'30.0'`).

**Rich's words this sitting** (the decisions file): **21:25** (F5: *"Strip after costing, else record"*), **22:08** (through the question tool, each as
recommended: `MANIFEST_CAPABLE_MODEL=ubc-ai-gateway/gpt-6-luna`; `MANIFEST_GATEWAY_MODELS=ubc-qwen-27b=ubc-ai-gateway/qwen3.8-27b@confidential`;
the agent writes them) — and the coordinator's acceptances of F19 and F21. **The two lines were written at 23:04, just before the restart, by `sed`/`printf` reading no
value** (a `0600` backup taken, exactly those two names differing, the backup deleted at the close); `.env` mode `600`.

**After the restart (23:04, `s2-cp.sh real` — RUNBOOK's block, real GitHub as found):** the ready line read `capableModel: registered`,
`capableFallback: set`, `gatewayModels: [{ubc-qwen-27b, registered}]`, `secretsScrubbed: 16`, no `[boot]` line; the key's value 0 in the boot
and migrate logs. `/model/info`: `default-chat-large` = `openai/gpt-6-luna` at `https://ai-gateway.apps.ltic.ubc.ca/v1`, `internal`, pinned
`1e-7` / `5e-7`, timeout 60, retries 0, no `api_key` listed, its fallback `default-chat-onprem`; `ubc-qwen-27b` = `openai/qwen3.8-27b` at the
same address, `confidential`, pinned `1e-6` / `3e-6` (the stand-in's), an id `manifest-gateway-…`. **One call on each through Manifest's
LiteLLM** (a throwaway key, deleted): both `200`, `x-litellm-model-api-base` the gateway's address, the forwarded `llm_provider-x-litellm-version`
`1.102.0` (the gateway's), `x-litellm-attempted-fallbacks: 0` — and **0 `llm_provider-x-litellm-key-*` headers on the REAL gateway's answers**
(F5 against the gateway itself, not only the stub). `default-chat-large`: 10 prompt tokens, charged `1e-06` (the gateway's price);
`ubc-qwen-27b`: 55 + 1 (a reasoning token), charged `5.8e-05` = 55 × 1e-6 + 1 × 3e-6 — the pin, as F4 says for a model the gateway does not
price.

**The gates at the close:** `pnpm test` twice, alone, on the final tree — **3323/3323, 203 files**, 982 s and 948 s (load 3.4–5.5) —
`EXPECT_TESTS` 3289 → 3323 and `EXPECT_FILES` 201 → 203 (+34: `providers.test.ts` 6 and `gateway-models.test.ts` 12, new; `capable.test.ts` 8;
`config.test.ts` 8); `pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean. **`pnpm test:docker` once** (22:38–22:58, 1218 s): 240 passed, 24
failed and 17 skipped in the five files F31 names, every one on the address pools; those five alone 40/40 and 16/16 — so **281 tests, all green,
42 files** (273 + 8: `capable.docker.test.ts` 2, `fallback-guard.docker.test.ts` 6). `make doctor` **22**/0/0 (`EXPECT_DOCTOR` 21 → 22) and
`make verify` **67**/0/0, `matches` (`EXPECT_VERIFY` 66 → 67), both after the restart.

**The machine at the close, queried at 23:06 PDT:** 7100 is PID 69387 (restarted at 23:08 after a single-file test run the RUNBOOK edit owed, its
ready line reading `unchanged` for the capable model, its fallback and `ubc-qwen-27b` — the boot is idempotent; real GitHub), with Rich's two lines; F5b's rows truncated
by the close's `pnpm test` (`f5b-measure-1`, a real repository in `Manifest-local-dev`, is unowned; its 9 containers and 3 networks still run —
Rich's). **28 Docker networks** (28 at the start, the same names), **48 `mf-` containers** (the same names), 86 volumes (the same), 0 `gw-probe*`;
`manifest-litellm` re-created by `make up` at 21:36 (it holds the gateway key and `MANIFEST_STUB_BEARER`). The cleanup scripts bare, then
`--apply`: `dead-app-resources` the tier's five dead networks and then the re-run's two; `litellm-orphans` three users with no live key
(`mf-platform-intake`, `p4b-probe-user`, F5b's person budget — 8 held users survived); `app-images` 15 dead images (re-run reads 0). The four
protected containers running. Free disk 63 GiB. `platform-window` FREE.

### Sitting 3 — 2026-10-03, 23:10 → 2026-10-04, 01:20 PDT (`manifest-be`, coordinated by `manifest-af`): Task 6, and Task 6a

**Before it:** Rich removed the 48 project-less `mf-` containers by a script he ran (the decisions file, 23:13; 28 networks → 12). 7100 was
restarted on DRIVER 1 for the acceptance (the coordinator's word, 23:1x: two demo projects on real GitHub would be two real repositories), and is
restored to real GitHub at the close.

**Task 6 — `239c69d`.** `make demo-gateway` (`scripts/demo-gateway.sh`, `packages/journey/src/gateway.ts`), `scripts/gateway-controls.sh`,
`scripts/lib/gateway.sh` (verify's fingerprint and doctor's expiry checks MOVED there verbatim and sourced by all three),
`scripts/lib/litellm-decrypt-verdict.py`, the `Makefile` target, RUNBOOK's *make demo-gateway*, ORIENTATION §2's row. **Its first run (23:22, on
1.98.0) went green through phases 0, 1, 2 and 4 and RED at the gateway-side comparison — 0.788 — which was F32.** **The five controls**
(23:30–23:32, on 1.98.0), each PREDICTED AND SEEN, 7100 restored from `.env` by the script's trap: (a) `127.0.0.1:9` — step 2 red at
`attempted-fallbacks 1`, the api-base `host.docker.internal:11434`, the model `ollama_chat/qwen3.8:27b`; (b) the key empty — the ready line's
`capableModel` and `ubc-qwen-27b` `refused`, nothing at the gateway, `NOT RUN` exit 2, and restored, registered again and steps 0–1 green; (b2) a
direct `openai/gpt-6-luna` registered, then KEPT by the keyless boot; (d) `MANIFEST_GATEWAY_MODELS` empty — no `manifest-gateway-` entry, step 1
red; (e) yesterday's expiry — step 0 FAILS naming it and `make doctor` WARNS *EXPIRED*, and a date one day off PASSES (no machine can tell —
Rich's, by eye). Control (c) runs in every run (step 2: the provider's `400`, no fallback).

**Task 6a — `32e9b7a`** (the re-pin, with its Docker case red first), and the fix pass after the review — **`a84c856`** (§16's mapping) and
**`6565a10`** (the review's I1–I3). Spec action 3 applied — **`b0bd6a7`**.

**What this sitting found** (each with the measurement that found it):

1. **F32 A STREAMED call was charged by LiteLLM 1.98.0's own count of the visible text, not the provider's usage** — Task 6a, above. The run's
   stream was recorded 14 + 1 (`$0.0000019`) where the gateway charged 13 + 4 (`$0.0000033`); the non-streamed call matched. The drop point
   (traced in throwaways): a usage on a chunk that also carries a choice — **the gateway's own shape, measured direct: after the finish frame, a
   frame with ONE empty choice beside the usage and its `cost`** — is stored and then never read; only a `choices: []` frame's usage was
   charged. No 1.98.0 hook sees the provider's figure. **Rich, 23:31: "Fix it in this plan tonight"; 23:40: "Re-pin to 1.102.0, with a stop
   rule".** On 1.102.0 the gateway's shape is charged the reported cost, and the real gateway's stream 13 + 4. TRAPS.
2. **F33 §16's AI error mapping drifted on ONE row on 1.102.0** — the tier's first run, 282/283 (23:45–00:07, 1299 s): an unknown model is
   `400 invalid_request_error`, where 1.98.0 said `type: "None"`, so it mapped `AI_UNMAPPED`. Reachable only by a key with no model list (every
   app key is refused an off-list model `403` first). The GUARD was whole (fallback-guard 29/29), so the stop rule did not fire. **Rich, 00:01:
   "Fix forward on 1.102.0"** — `ai/errors.ts` reads LiteLLM's own words ANCHORED at the message's start (`/<route>: Invalid model name passed in
   model=`), so a provider's 400 quoting them (the gateway's `[M5]`(c-i)) stays the provider's; `errors.test.ts` red first on the recorded body.
3. **F34 `OPENAI_API_KEY` could still reach UBC's gateway** (the whole-branch review's I2): the fail-closed removal ran only for a gateway
   SETTING, so a DIRECT setting LiteLLM refused (unpriced) kept the gateway registration as "the working model", its reference then empty
   (`[M7]`); its operator line named it `'openai/…' is kept`; and `make verify` read "not configured" PASS with gateway deployments still in the
   catalogue (a key removed and `make up` run, the control plane not restarted). Fixed: `ensureCapableModel` removes every gateway deployment
   whenever `.env` carried no key, whatever the setting; a kept one is named `ubc-ai-gateway/…`; verify's "not configured" FAILS while the
   catalogue lists one (`s3-verify-control.sh`: 2 at the gateway → rc 1; an empty catalogue → rc 0; the real `.env` → `matches`).
4. **F35 A fallback the guard ALLOWED wrote no line** (the review's I3): the gateway's budget spent (`429`) or a revoked key (`401`) moved every
   capable call to the on-premise model silently. Fixed: ONE line per allowed fallback — the status, the class, the trace, never the message.
5. **F36 An EXPLICIT reported cost of `0.0` is charged `$0`** (the review's I1, measured): a stub reporting `0.0` (plain header, and `cost: 0` in
   the gateway's stream shape) was charged `$0` on 1.102.0 — and `cost_calculator.get_response_cost_from_hidden_params` is the same code on
   1.98.0. **UBC's gateway does not send one**: through 1.102.0 its unpriced `qwen3.8-27b` was charged the pin, plain `$0.000158` (59 + 33) and
   streamed `$0.000161` (59 + 34). Recorded, not built; the stub models the gateway's real shape (`/gwunpriced/`), two Docker witnesses hold the
   pin, and the demo's phase 4 now streams the gateway's own model every run. TRAPS.
6. **F37 The plan's Task 6 asked for checks the measurements had already made impossible**: phase 0's `.env` expiry against `/key/info` (the key
   cannot read it, F10 — now doctor's check plus Rich by eye), phase 2's "no `attempted-fallbacks` header" (F20 — `0`), the gateway-side spend
   through `llm_provider-x-litellm-key-spend` (stripped by F5 — read from a `$0` direct call instead), phase 2's "spent rose by usage × the pin" for
   a model the gateway prices (F4 — the reported cost, the same numbers for `gpt-6-luna`), and control (d) red at phase 4 (red at phase 1 first:
   the catalogue). Each is a ruling in the ledger.
7. **F38 The gateway writes a key's spend in batches**, so two equal reads of `x-litellm-key-spend` 15 s apart are not proof it has settled — a
   call's spend landed after such a pair (`s3-probe-spend.log`). The demo polls until the rise it expects arrives, bounded at 120 s. TRAPS.

**The whole-branch review** (a fresh `opus` agent, `b5e48ed..32e9b7a`, code-scoped): **"With fixes"** — 0 Critical; I1–I4 Important, each
taken in ONE fix pass, red first (I4 was this sitting's own acceptance on 1.102.0, done below). **Deferred minors** (the ledger): M1 the demo's
fingerprint check sits partly outside `holds` (unreachable — `NOT RUN` precedes it); M2 `ensureRegistered`'s `unchanged` ignores timeout, retries
and the pin; M3 `gateway-controls.sh` restores on `$DRIVER`, not the driver found, and control (e)'s `.env` copy survives an interrupt (0600);
M4 comments still describing 1.98.0's internals (the guard's F5 header, the decrypt script); M5 Decision 12's bound held by no Docker case on
1.102.0; M6 `llm_provider-openai-organization`/`-project`/`-set-cookie` still reach callers (the tracked leak); M7 a priced `confidential`
gateway entry is almost certainly commercial; M8 the headers hook's fixed parameters; M9 the rollback should restore the dump (taken).

**Negative controls.** Task 6's five, above. F32: the same Docker case red on 1.98.0 (`0.000015` for `0.000777`) and green on 1.102.0, the test
unchanged, beside a positive control in OpenAI's shape green on both. F33, F34 and F35: each test red before its fix (F33 `AI_UNMAPPED`; F34 one
gateway deployment left, and the kept one named `openai…`; F35 `[]`). F36's witnesses are green by design; the first stub shape (an explicit
`0.0`) was red on both, which is the record that they can fail.

**Rich's words this sitting** (the decisions file): **23:13** (he removed the 48 project-less `mf-` containers by a script he ran); **23:31**
(F32: *"Fix it in this plan tonight"*); **23:40** (*"Re-pin to 1.102.0, with a stop rule"*); **23:47** (Spec action 3's words — §21 *"Two
sentences"*, §10 *"As proposed"* — applied only once the tier was green); **00:01** (F33: *"Fix forward on 1.102.0"*). **The clicked half
(Task 6 Step 4; the 00:30 entry):** Rich ran `make demo-gateway` himself with the gateway's admin UI open — *"I ran it separately, and yes the
figures matched with the figures the script produced"* — a FOURTH green run on the final tree. Step 5, the key's expiry, rests on his 20:56
reading of the same UI (*"Expires Jan 1, 2027 at 3:23 PM"*), which `.env`'s `2027-01-01`, as the demo prints it, agrees with — not a fresh
look tonight. **Building an app on `app.manifest.internal` was NOT RUN**: the faculty front-end was in mock mode, not on 7100.

**The gates at the close:** `pnpm test` twice on the final tree — **3326/3326, 203 files**, 944 s (inside `make ci-acceptance`) and 972 s
(alone), load 3.3–4.4 — `EXPECT_TESTS` 3323 → **3326** (+3: `errors.test.ts` 1, `capable.test.ts` 2), `EXPECT_FILES` 203; `pnpm lint`, `pnpm
typecheck`, `pnpm format:check` clean. **`pnpm test:docker`**: the whole tier ONCE on LiteLLM 1.102.0 (23:45–00:07, 1299 s, on `32e9b7a`) —
282/283, the one red F33 — then the fix pass's three Docker files alone, 48/48 (fallback-guard 32, capable 8, ai-path 8): **286 tests, 42
files, all green** (§2's row; 12 networks at its start, 19 at its end, no address-pool refusal). **`make ci-acceptance`** (00:3x–00:58, driver 1,
1.102.0): 0 failed, 1 moved (`pnpm test`, the +3 above), 1 not run (`demo-github`, driver 1) — `demo-journey`, `-token`, `-production`,
`-releases`, `-authoring`, `-frontend`, `-launch` and `-faculty-ready` PASS, so every other demo is green on the re-pin. **`make demo-gateway`**:
green three times on the final tree (00:20, fresh 100 s; re-use 73 s, 64 s) and a fourth, Rich's. `make doctor` **22**/0/0 and `make verify`
**67**/0/0 after the restore to real GitHub (`EXPECT_DOCTOR`, `EXPECT_VERIFY` unmoved).

**The machine at the close, queried at 01:16 PDT:** 7100 is PID 20897, restored to REAL GitHub from `.env` (`gateway-controls.sh start real`;
ready line `capableModel`, `capableFallback` and `ubc-qwen-27b` `unchanged`, `secretsScrubbed` 16) — its tables empty (0 projects, 0 users: the
close's `pnpm test`). **LiteLLM runs 1.102.0** (`sha256:32cfd7a4…`, tagged `v1.102.0` — the pulled tag IS the pin); **the 1.98.0 image is kept,
untagged** (`20b5044b`), for a rollback; LiteLLM's pre-re-pin database dump DELETED at the close. `.env` UNTOUCHED this sitting (mtime
2026-10-03 23:04:20, sitting 2's lines; mode 600; no backup was taken because nothing wrote it). **22 Docker networks** (10 `mf-`), **30
`mf-` containers** — `make ci-acceptance`'s demo apps, project-less since the close's `pnpm test`; the 48 the sitting started with were Rich's
to remove (23:13) — 69 volumes, 0 `s3p-*`/`gw-probe*`. The cleanup scripts bare, then `--apply`, at each stage: after the tier
(`dead-app-resources` 7 networks + 1 volume, `litellm-orphans` 11, `app-images` 25) and at the close (1 volume, 3 orphaned budgets —
two persons' and `mf-platform-intake` — 4 held kept, 5 images). The four protected containers running. Free disk 60 GiB. `platform-window`
FREE. `make demo-gateway`'s two projects were truncated with the rest; its next run is fresh.
