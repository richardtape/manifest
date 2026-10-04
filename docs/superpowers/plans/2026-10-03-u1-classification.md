# Manifest's Data Classes as UBC's U1 Levels — Implementation Plan

> **WRITTEN 2026-10-03, 22:25–23:00 PDT, DOCUMENTS ONLY**, by a fresh platform session Rich started for it, at the word of the
> coordinator `manifest-af`. **Rich decided the shape at 21:48 and the spec action — every sub-decision as recommended — at 22:21**
> (`../2026-09-30-decisions.md`, both entries; *Decided by Rich*, below). **Every fact in *Read this first* was read from the code at
> `bae220f`**, after the UBC AI Gateway plan's Tasks 2–4 landed (`3c05c7f` … `75ed30b`), so `ai/registration.ts`, `ai/gateway-models.ts`
> and `ai/providers.ts` are as that plan's sitting 2 left them. Line numbers WILL move: every task re-reads its own lines before it
> edits them.
> **APPROVED — Rich, 23:22 PDT, with its fresh review's fixes, applied by `manifest-17` 23:24–23:46 PDT** (`../2026-09-30-decisions.md`,
> its 23:22 entry, through `manifest-af`). The review is [`2026-10-03-review-of-u1-plan.md`](./2026-10-03-review-of-u1-plan.md) (`8acd55d`):
> *"approve with fixes"* — C1, I1–I7, M1–M14. Every fix is built into the tasks below and marked there with the review's id; *The fresh
> review's fixes, and where each landed* (at the end) lists each. **C1 re-cut Tasks 1–3**: Task 1 now makes every reader that compares
> against an old name LEVEL-SAFE, behaviour unchanged, and stores nothing canonical; Task 2 then switches what is stored and answered
> (Decision 13). No code changed between `bae220f` and the review's HEAD; `manifest-af` checks that C1's reorder landed.

> **For agentic workers:** REQUIRED SUB-SKILL: **superpowers:executing-plans (inline, a fresh session per sitting)** — this project's
> pattern since the gateway plan, unless Rich chooses otherwise at approval. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Commit on `main`; no branch, no worktree, no push** — ORIENTATION §6 rule 9, which that skill will push you against.

**Goal:** Manifest's data classes become **UBC's four U1 levels — `low | medium | high | very-high`** — everywhere a level is
written, compared, stored or answered. Manifest's three earlier names stay valid for ever, as aliases with one fixed meaning each
(`public` = `low`, `internal` = `medium`, `confidential` = `very-high`). The platform answers in U1's names. The capable model's level
becomes a setting (default `medium`; Rich sets `high`). A delegated token is refused staging's and production's Incident log tails on
every project at `high` or above. A level that is lowered takes effect: never kept higher at registration, and taken off every running
app's key at the next boot, with a key left holding nothing revoked.

It is proved by **`make demo-levels`** — offline, on either driver, a step of `make ci-acceptance` — and by **Rich reading a `high`
app's privacy assessment draft in the console**.

**Architecture:**
- **ONE RANK TABLE OF SEVEN NAMES** (`spec/schema.ts`): the four levels at ranks 0–3, and each alias at its level's rank. Every
  comparison in the platform already goes through `CLASSIFICATION_RANK`, so a stored alias ranks right even where a read is missed —
  the next omission fails closed, not open (the spec action's review, I6).
- **CANONICAL WHERE A NAME ENTERS** — the manifest schema's `transform`, `loadModelCatalogue`, `loadConfig` (the gateway's entries and
  the new capable-model level) and the floors' reads of frozen releases — and **NAMED BY `levelName` WHERE A PERSON READS ONE** (the
  refusal hint, the privacy assessment, the diff, the events). `getSpec` and the release representation canonicalize OLD rows at read
  (S6). Nothing in a database is migrated: an alias stored tonight means the same level for ever.
- **THE CAPABLE MODEL'S LEVEL** is `MANIFEST_CAPABLE_MODEL_CLASSIFICATION`, threaded from `loadConfig` through `platformModelsAtBoot`
  into its registration and its fallback's check. **Registration compares levels, not strings** (`registration.ts:237`), so no row is
  re-created for its name, and **a refused re-registration never keeps a deployment above the level it was asked for** (I1).
- **THE TOKEN RULE** is one condition in `listIncidents` (`releases.ts:1249-1257`): `token`, not the sandbox, and the environment's
  floor ranked `high` or above. The builder setting no longer enters it (S9).
- **A BOOT SWEEP OF APP KEYS** (`ai/app-key-sweep.ts`, new; S11), beside the agent sessions' (`narrowSessionsHoldingMore`): each
  instance key whose models now include one ranked below its release's frozen level is narrowed by value at LiteLLM, or revoked when
  nothing it may use is left — each an `ai.models_withdrawn` event and an operator line.

**Tech Stack:** TypeScript 5.9.3 on Node 24.12.0 (host), Fastify 5.12.3, Vitest 2.1, zod 3 (`^3.24.1`) with `zod-to-json-schema`
3.25.2, drizzle-kit (a migration for the new event type's CHECK). LiteLLM **1.102.0** since `32e9b7a` (the gateway plan's F32 re-pin, 2026-10-03 ~23:40), pinned by digest (`infra/images.lock`) — the earlier measurements this plan cites (an empty `models` list is every model; `/key/update` by alias) were made on 1.98.0, and Task 6 Step 1 measures on whatever runs. Docker
Desktop 29.7.2. **No new package.**

**Spec:** [`../specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md), **as the U1 spec action
changes it** — [`2026-10-03-u1-spec-action.md`](./2026-10-03-u1-spec-action.md), DECIDED 22:21, applied by this plan's Task 0 unless it
already is. Read §7 (the new *Data classification: UBC's U1 levels*; the catalogue and its two new paragraphs; the building agent and the
Incident tails), §10 (intake), §16 (the regression tier), §20 (the risk table), §26 (*Platform settings*) and D17. The spec action's own
*What the plan will then build* is this plan's starting list; every item of it is a task below or a line of *What this plan does not
build*.

**Roadmap:** Rich's 21:48 decision (*"Can we not just use the same names from the ISS U1? Very high risk forces on prem models only"*)
and its PLACEMENT, *"Right after the gateway plan"*.

**Predecessor:** [`2026-10-03-ubc-ai-gateway.md`](./2026-10-03-ubc-ai-gateway.md). **This plan starts only after that plan's sitting 3 —
its acceptance — closes**, because the spec action is applied after it (22:21) and Task 0 is this plan's first step.

**Successor:** [`2026-10-03-fe46-fe47-fe5.md`](./2026-10-03-fe46-fe47-fe5.md) (approved). **It inherits contract `1.7.0`, so its own bump
becomes `1.7.0 → 1.8.0`** — its Decision 1 and every `1.7.0` in it (ten lines at writing: 50, 92, 300, 546, 628, 641, 793, 804, 812, 1052).
That edit is the coordinator's at this plan's approval sweep, not a task here (Decision 3).

---

## How this plan is to be executed — sittings, one per session

**One sitting per session, with a check-in at each boundary.** This plan commits after every task.

| Sitting | Tasks | What it delivers | `pnpm test:docker` owed? | Spec action needed first | Status |
|---|---|---|---|---|---|
| 1 | 0, 1, 2, 3 | **The spec action applied** (Task 0, if it is not already). **The vocabulary, and every reader made level-safe** — one rank table of seven, the enum ACCEPTING seven and storing what is written, the four `=== 'confidential'` readers compared by level, **contract `1.7.0`**, the front-end's NOTICE; no existing input's answer changes (Task 1, *C1*). **Stored and answered as the level** — the transform, the default `medium`, the canonical floors and catalogue, the diff by level, S6's answers, the level in a person's words (Task 2). **D17's words**: the refusal hint (E14), the deploy-time refusal, a `high` model's zero-retention sentence, intake, the blueprint and the guides (Task 3) | **Yes** — `ai/` (Tasks 1–2) and `releases/` (Task 3): once, at the close, in the background; and Task 2's two Docker files alone before its commit (*C1*) | **The U1 spec action** — DECIDED 22:21; **APPLIED by Task 0, `ad35ef9`** | ✅ **DONE 2026-10-04** (13:47–15:49, `manifest-41`): Task 0 `ad35ef9`, Task 1 `7f36c5b` (contract `1.7.0`), Task 2 `59bd934`, Task 3 `c04e1f3`, F7 `58afe04` — *What executing this plan found*, *Sitting 1* |
| 2 | 4, 5 — **stop point** — 6 | **The capable model's level** as a setting, the builder exception by S4, registration by level and never kept above it, the gateway's `very-high` pin (Task 4). **The token rule** (Task 5, S9). **The app-key sweep** (Task 6, S11) — its Docker case first, because it measures what it rests on | **Yes** — `ai/`, and Task 6's new Docker file: once, at the close; and `boot.docker.test.ts` ALONE before it (Task 6's real-entry-point case, *I1*, *M4*) | — | ← **next** |
| 2b | 6 — **only if sitting 2 runs out of room at its stop point** | As sitting 2's last task | Yes — `ai/` | — | |
| 3 | 7 | **The acceptance**: `make demo-levels` three times, its controls seen red, every other demo still green, `make ci-acceptance`, the plan's one whole-branch review, and Rich reading a `high` app's privacy assessment in the console | Yes, if any code changes | — | |

**EVERY SITTING ENDS THE SAME WAY, and none of these four steps is optional:**

1. **The four gates**, from the repository root: `pnpm test` (twice, alone, on the final tree), `pnpm lint`, `pnpm typecheck` and
   `pnpm format:check`. Add **`pnpm test:docker`** when the table says it is owed. **The test budget is LEAN** (ORIENTATION §8
   *Decided*): no open run on an unchanged tree, single files while fixing, the whole suite twice at the close.
2. **A dated entry in *What executing this plan found*.** Every defect with the measurement that found it; every negative control,
   including which could not fail and why. It ends with the gate numbers and the machine, queried at the close.
3. **This plan's sittings table.** Mark the sitting done and move the `← next` marker. State no findings count here.
4. **The close-out sweep in ORIENTATION §6.** The gate numbers live in `scripts/ci-acceptance.sh`'s `EXPECT_` lines (their one
   statement): Task 5 adds authorization-contract rows and Tasks 1–6 add unit tests, so `EXPECT_TESTS` and `EXPECT_FILES` move —
   **count them, never subtract**.

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Five rules survive any re-cut:
- Task 0 is first. No task's code is written before the spec says what it builds.
- **No task stores or answers a U1 name while any reader still compares a level against an OLD name's string** (*C1*). Task 1 makes
  every such reader level-safe in the same commit that first lets a U1 name be written; Task 2 is the first to store one for an old
  input. **The builder exception (S4/Spec action 10) and the token rule (S9's predecessor) hold at EVERY commit, so nothing is off across
  a sitting boundary**, and each task passes its own four gates, `pnpm typecheck` included, on its own tree.
- Task 1 is the contract's one bump; every later task that changes `packages/contract` rides on it.
- Task 6's Docker case runs ALONE before its code is written (its Step 1): if it measures that LiteLLM will not narrow an app key by
  its value, Task 6 STOPS there (Decision 8).
- Task 7 stays alone and last.

---

## Decided by Rich — build them, do not re-open them

**At 21:48 PDT on 2026-10-03** (`../2026-09-30-decisions.md`, its 21:48 entry), through the question tool, on the question
[`2026-10-03-u1-classification-question.md`](./2026-10-03-u1-classification-question.md):
- **THE SHAPE**: *"Can we not just use the same names from the ISS U1? Very high risk forces on prem models only."* The classes become
  U1's own names, `low | medium | high | very-high`, and `very-high` means on-premise models only.
- **THE SOURCE OF "HIGH MAY REACH OPENAI"**: *"it's been deemed okay as long as ZDR is enabled (which it is for our org on open ai)"*.
- **TODAY'S THREE NAMES — "Keep them as aliases" (Recommended)**: fixed meanings, `public` = `low`, `internal` = `medium`, `confidential`
  = `very-high`. The mapping never widens. Additive, so contract `1.7.0`, with no LiteLLM database or config migration. New manifests,
  the front-end and the docs use U1's names. *Rejected:* a clean rename (breaking: D23.8's new prefix).
- **`llama3` ON AWS BEDROCK — "high, like OpenAI"**: his call, unverified here. Not this plan's to add (it is unpriced; *What this plan
  does not build*).
- **PLACEMENT — "Right after the gateway plan" (Recommended)**: a spec action, then this plan, before FE-46/47/5.

**At 22:21 PDT** (its 22:21 entry), THE U1 SPEC ACTION, DECIDED — **APPLIED 2026-10-04 13:57 by Task 0 (`ad35ef9`), at Rich's 13:53 word,
E3's last sentence in his 13:53 words (the frozen level)** — *"applied after the UBC AI Gateway plan's acceptance,
before the U1 plan's first sitting"*. Through the question tool, each as recommended:
- **S10 — "No, the building agent may use it"**: Spec action 10 stands; `MANIFEST_AGENT_BUILDER_MODELS` stays default `capable`
  (`config.ts:413`). The 21:48 rule is about where a `very-high` app's DATA may go; the building agent sends the code and the person's
  description, never the app's data or its logs.
- **S9 — "Refuse at high and above"**: `rank(level) >= rank('high')` refuses a delegated token staging's and production's Incident log
  tails, **whatever the capable model's level** (`releases.ts:1249-1257`). A token's model is unattested. The front-end's repair loop
  reads the sandbox's freely.
- **S2 — "Only what you decided"**: the gateway's OpenAI models (`@high`), the capable model while it is one of them, and `llama3` once
  the gateway prices it. `default-chat`, `-reasoning` and `-embed` stay `medium` until an administrator attests their provider. **The
  cost, accepted: a `high` app has no embedding model and no small chat model.**
- **THE OTHER EIGHT — "All as recommended"**:
  - **S1** — `high` only if every provider that may answer (the vendor behind the gateway and any gateway fallback included) runs on
    UBC hardware or keeps nothing (ZDR), as the administrator attests; `very-high` only if all of them run on UBC hardware.
  - **S3** — the capable model's level is a setting of its own, default `medium`, set by Rich to `high`. **No cap** (S3 (b)).
  - **S4** — a `high` project's building agent gets the capable model.
  - **S5** — an undeclared app is `medium`.
  - **S6** — the platform answers in U1's names.
  - **S7** — the spec's example app is `high`.
  - **S8** — Story 04 keeps its refusal, with a new reason.
  - **S11** — a lowered level takes effect at boot, and a key left with none is revoked.

**At 23:22 PDT** (its 23:22 entry), THIS PLAN — *"Approve with the fixes" (Recommended)*: approved once `manifest-17` applies every fix
of its fresh review, documents only, each marked with the review's id, and `manifest-af` checks that C1's reorder landed. It runs right
after the UBC AI Gateway plan, before FE-46/47/5. *Rejected:* a second review after the fixes; reading the review first.

**The spec action's banner (`bae220f`)**: *"E14, `policy.ts:213-215`'s public hint, is CODE: it is the U1 plan's to change, in a task
with its test, never by whoever applies the spec words."* It is Task 3's.

**Carried from earlier plans, still binding:**
- **An unclassified catalogue entry is EXCLUDED, never defaulted** (`catalogue.ts:98-110`, finding 47): a default is failing open.
- **LiteLLM reads an empty `models` list as EVERY model** (`ai/keys.ts:137-141`, measured 2026-09-14): a key is never narrowed to `[]`;
  it is revoked instead.
- **Spec action 10's builder exception and its narrowing** (`ai/models.ts:25-44`, `ai/sessions.ts:760-840`): a session is narrowed in
  place, and ended only when nothing it may use is left.
- **The gateway plan's Decision 7**: a gateway model's classification is the setting's, never defaulted — and now, by S1, its level is
  the administrator's attestation for EVERYTHING that may answer it.
- **A model key is answered once and never stored. Every refusal asserts its code. The front-end is told before any commit to
  `packages/contract` or `packages/mock`.**

---

## What Rich does, and when

1. **Approve this plan**, after the coordinator's fresh review, and choose how it is executed.
2. **Before sitting 1 — the go to apply the spec action** (Task 0), if it is not applied by then: the coordinator asks him and applies
   it, or this sitting applies it at his word. **Nothing to decide**: the words were decided at 22:21.
3. **At sitting 2's close — `MANIFEST_CAPABLE_MODEL_CLASSIFICATION=high` in `.env`** (S3: *"set by him to `high`"*). Not a secret, so
   the agent may append it at his word, by `printf` reading no other value. **Then a control-plane restart** — the one boot that
   re-registers `default-chat-large` at `high`. **What matters is that LiteLLM's LAST START had the network on** (*M9*): LiteLLM prices
   `gpt-6-*` only from the list it fetches at its own start (`registration.ts:91-93`; `unpricedReason`: *"restart LiteLLM with the network
   on … then this control plane"*). If it did not, the re-registration is refused and, with Task 4's fix, the working `medium` one KEPT
   (it is below `high`), so `high` apps cannot use it until LiteLLM is restarted online and then the control plane. The boot line's
   `capableModel` reads `registered`, then `unchanged` at every boot after, and its `capableClassification` reads `high`.
   **From then on the shared LiteLLM's `default-chat-large` row is `high`** (*I5*): Task 2 makes `ai-path.docker.test.ts` accept any
   level there, and Task 4 makes `make demo-gateway` compare by level, so neither goes red for it.
4. **At sitting 3 — the person's half of the acceptance**: he signs in to the console (or lets the agent stage a headless sign-in, as
   his standing yes allows on `manifest.internal`), opens `make demo-levels`' project's *Records*, drafts the privacy assessment, and
   reads its *Classification* line and its models' lines (Task 7, Step 4).
5. **Nothing else.** The front-end's changes are its own session's (the ask, Task 1 and Task 5); `llama3`, `qwen3.6-35b-a3b` and any
   new `@high` gateway entry are `.env` lines he writes when the gateway prices them, not this plan's.

---

## Read this first — what this plan knows from the code

*Read at `bae220f` on 2026-10-03 (22:30–22:50 PDT). `src/` is `packages/control-plane/src/`; FE is `~/Developer/manifest-app`
(read only, at `6bbbede`).*

1. **The rank table and the enum.** `spec/schema.ts:8-16`: `CLASSIFICATIONS = ['public','internal','confidential']`,
   `CLASSIFICATION_RANK` 0/1/2. `:258-264`: `z.enum(CLASSIFICATIONS).default('internal')` and its `.describe()`, which is PUBLIC TEXT —
   `api/contract/document.ts:232-235` emits the schema as `ManifestYaml` through `zod-to-json-schema` (`$refStrategy: 'none'`,
   `jsonSchema7`), and `docs.test.ts` holds every description to the published-text rules. `spec/schema.test.ts:19` asserts the default
   `'internal'`.
2. **Every comparison is BY RANK** through `CLASSIFICATION_RANK` — `spec/policy.ts:163, 207`; `releases/release.ts:1097-1098`;
   `ai/models.ts:41, 105, 137`; `ai/capable.ts:159, 197`; `ai/intake.ts:64` (`CLASSIFICATION_RANK.internal`) — so all seven names in the
   table make every one of them right for a stored alias with no edit.
3. **The reads that are NOT by rank:**
   - `ai/models.ts:57-60`, `asClassification`: **`value in CLASSIFICATION_RANK`**, which also finds `toString`;
   - `ai/catalogue.ts:104-113` reads `model_info.max_classification` by `Object.hasOwn` — right — and keeps the string as stored;
   - `spec/diff.ts:183` (`before.classification !== after.classification`), `:227`, `:250` and `:553-556` (`valueChange`, `:474-482`,
     compares `before === after`): **string equality**, so `internal` → `medium` would be a SENSITIVE change (D9: a production release
     re-escalates). `api/spec-validation.ts:78` diffs a new spec against the PREVIOUS stored `parsed` row, which may hold an alias;
   - `ai/registration.ts:237`: `only!.model_info?.max_classification === r.classification` — **string equality**, so every row registered
     at an alias would be re-created at its level's name at the next boot (the review's I7).
4. **The literal sites:**
   - `ai/models.ts:37` — `building = floor === 'confidential' && builder === 'capable'` (the builder exception);
   - `api/routes/releases.ts:1249-1254` — `actor.credential === 'token' && environment.kind !== 'sandbox' && deps.config.agent.builderModels
     === 'capable' && (await environmentFloor(...)) === 'confidential'` (S9's site), its message `:1256-1257`, its description `:1208`;
   - `launch/assessment.ts:97` (`staysOnPremise = ceiling === 'confidential'`) and `:207`;
   - `ai/gateway-models.ts:134-135` — the unpriced pin for `e.classification === 'confidential'`;
   - `api/testing.ts:313` — a hand-written `'public' | 'internal' | 'confidential'` union;
   - `api/authz-contract.ts:2577` — the fixture's `makeConfidential` writes `{ classification: 'confidential' }`.
5. **The capable model's level is hard-coded.** `ai/capable.ts:36-40`: `CAPABLE_CLASSIFICATION: Classification = 'internal'` (Rich,
   2026-09-27). `:119` passes it to `ensureRegistered`; `capableFloor` (`:165-169`) is the max of the catalogue's entry and it; `unfit`
   (`:197-205`) refuses a fallback below that floor. `ensureCapableModel(client, setting, gateway?)` (`:80-84`);
   `capableModelAtBoot(client, setting, fallback, gateway)` (`:296`); `platformModelsAtBoot(client, { gatewayModels, capableModel,
   capableFallback }, gateway)` (`ai/gateway-models.ts:202-219`), called by `index.ts:489-500`. `capable.test.ts:48` expects a create body
   with `max_classification: 'internal'`; `:551` expects `"below 'internal'"`.
6. **`refuseKeeping` keeps every PRICED deployment, whatever its level** (`ai/registration.ts:207-216`). Its three callers:
   `registration.ts:229-230` (`ensureRegistered`'s `refuse`), `ai/capable.ts:102-107` (a setting `resolveSetting` refused) and
   `ai/gateway-models.ts:123-128` (the same, per entry). So a level LOWERED while its re-registration is refused — LiteLLM restarted
   offline prices `gpt-6-*` at `0` (`registration.ts:91-93`) — keeps the old, higher level in the catalogue (the review's I1).
7. **The gateway's entries.** `config.ts:46-47`: `GATEWAY_MODEL_ENTRY` ends `@(public|internal|confidential)$`; `:53-54`'s form text says
   the same. Tonight's `.env` (22:08) holds `ubc-qwen-27b=ubc-ai-gateway/qwen3.8-27b@confidential`, and LiteLLM's row for it carries
   `max_classification: 'confidential'`; the capable model's row carries `'internal'`. **Under Task 4's level comparison both are
   `unchanged` at the next boot** — the only row re-created is the capable model's, once, when Rich sets `high`.
8. **The builder setting.** `config.ts:413`: `MANIFEST_AGENT_BUILDER_MODELS: z.enum(['capable','on-premise']).default('capable')`. Its words
   (`config.ts:404-412`, `.env.example:166`, `ai/models.ts:9-31`, `ai/sessions.ts:439, 636-657`, `observability/event-schemas.ts:853, 868`,
   `api/representations/agents.ts:105`) all say *"a confidential project's building agent"*.
9. **The Incident tail's tests.** `api/incidents.test.ts:123-195`: four cases on a `confidential` project. **`:150-158`, *"answers the
   token when the builder is kept on-premise"*, INVERTS under S9** — the builder term leaves the condition. Its helpers `incidentIn`
   (`:24-74`) and `declared` (`:77-88`) type the level as `'internal' | 'confidential'`. `api/authz-contract.ts:119-124, 288-292,
   2244-2262, 2571-2582`: the confidential-Incidents row is the LAST row, and `makeConfidential` is written once (*"ONLY the last row calls
   it"*).
10. **S6's two answers read stored rows raw.** `getSpec` (`api/routes/project-reads.ts:732-751`) answers `spec: latest.parsed`;
    `toRelease` (`api/representations/releases.ts:121-145`) answers `classification: c.classification` from the frozen config. Both
    publish `classification` as a plain `string` (`openapi.json`'s release representations), so values change and no schema does.
    **`packages/journey/src/frontend.ts:1104-1105` asserts `release.config.staging.classification === 'confidential'`** — `make
    demo-frontend` goes RED under S6 unless Task 2 changes it to `'very-high'`. No other journey reads a classification value
    (`launch.ts:1691` and `frontend.ts:766` read only `sensitiveDiff.fields`). The console's `approvals.tsx:222` renders
    `production.classification` as answered, so it shows U1's names with no console change.
11. **The published examples say `internal`**: `api/routes/releases.ts:273, 284, 295, 407, 418, 429, 490, 501, 512, 547, 558, 569`;
    `api/routes/project-reads.ts:717`; `api/routes/launch-examples.ts:388-401` and `:477`'s PIA text.
12. **The privacy assessment** (`launch/assessment.ts`): `capitalised` (`:93-94`) would print `Very-high`; `staysOnPremise` (`:97`);
    `modelFlow` (`:190-200`) has two sentences, *"Approved for confidential data: it runs on on-premise hardware…"* and *"Approved for
    ${max} data at most: it may be answered by a provider off-premise…"*; `flows` (`:203-220`); `hosting` (`:355-395`, `:360`'s
    `offPremise` filter, `:381`, `:390-391`'s gap). Its test literals: `launch/assessment.test.ts:38-40, 202, 213, 219, 235, 354, 357`.
13. **D17's two refusals.** `spec/policy.ts:207-217` (E14's hint: *"…A BC public body may not send personal information to a model
    running outside Canada."*) and `releases/release.ts:1093-1105` (`RELEASE_MODEL_CLASSIFICATION_TOO_LOW`, its message naming
    `${entry.maxClassification}` and `${resolved.classification}` raw). No test, demo or journey asserts either sentence (grepped
    `"BC public body\|approved up to\|may not process"` across `packages/`: `policy.ts` alone).
14. **Intake** (`ai/intake.ts:60-70`): refused unless its model ranks at least `CLASSIFICATION_RANK.internal`; its message says *"approved
    for internal data"*. `MANIFEST_INTAKE_MODEL` defaults to `default-chat` (`config.ts:443`), at `internal` in `config.yaml:29` — so S5's
    `medium` default changes nothing for intake.
15. **App keys.** `mintAppKey` (`ai/keys.ts:133-168`) mints with NO alias; each instance's key is a secret named
    `app:llmApiKey:<instanceId>` (`:182-195`), revoked by VALUE and deleted at retirement (`revokeInstanceKey`, `:215-229`); an
    environment-level `app:llmApiKey` is P4b's legacy (`:237-258`). `narrowAgentKey` (`ai/agent-keys.ts:215-234`) narrows by ALIAS with
    `/key/update`; **nothing narrows an app key**, and the fake (`ai/testing.ts:489-505`) finds a key for `/key/update` by alias only.
    **Unmeasured** (the spec action's *Read but not verified*): that the pinned LiteLLM's `/key/update` narrows an app key named by its
    VALUE — Task 6's Step 1 measures it.
16. **A new event type is five edits**: `observability/events.ts`'s list (`:40-56`, `:185-200`), `event-schemas.ts`, `examples.ts`,
    `db/schema.ts:1196`'s `events_type_known` CHECK, and a drizzle migration that drops and re-adds that CHECK (`drizzle/0048_*.sql`'s
    pattern). Event payloads are published (`agent_session.narrowed` appears 4 times in `openapi.json`). `publishEvent(db, bus, { projectId,
    subject, type, machineDetail, humanMessage }, redactor)` is the call (`releases/release.ts:970-984`).
17. **The boot.** `index.ts:489-500` (the platform's models), `:511-532` (`narrowSessionsHoldingMore`, every session), `:545-575` (the
    boot line, read back by `boot.docker.test.ts`). `masterKeypair` (`:205`), `llm` (`:219`), `bus` (`:236`).
18. **The mock.** `packages/mock/src/fixtures.ts:459`: the release fixture's `classification: 'low'` — **a U1 name since P5c
    (`01225cb`)**, when it was a value the platform never answered. `:1310-1315` and `:1400`: the PIA's *"Low — every AI model the app
    uses must be approved for low data"* and *"default-chat: Approved for internal data at most…"*. `:856-867`: `CONFIDENTIAL_AGENT_MODELS`
    and the exported `agentModels(confidential: boolean)`. `server.ts:98-102, 456-463, 709, 730, 1197`: the `confidential` option
    (`MANIFEST_MOCK_CONFIDENTIAL=1`) and its Incident refusal. **The front-end runs the mock from this working tree** (memory: keep contract
    and mock typecheck-clean as a unit).
19. **The configuration and the fixtures.** `infra/litellm/config.yaml:29, 63, 83` are `internal`; `:45, 73` are `confidential` —
    unchanged under S2 (i), and the alias path every demo exercises. `fixtures/frontend-app/manifest.yaml:38` is `confidential`;
    `fixtures/bulletin-board/manifest.yaml:40` and `fixtures/launch-path-app/manifest.yaml:40` are `internal`;
    `blueprints/node-ts-mongo/starters/proof-app/manifest.yaml:55-64` is `internal` with a comment naming D17's `default-chat` refusal;
    `blueprints/node-ts-mongo/agents/AGENTS.md:209-211` says a model *"approved below your app's `data.classification` is refused"*.
20. **74 literal `classification: '<alias>'` sites in 29 files across `packages/`** (`grep -rn "classification: 'internal'\|…'confidential'\|
    …'public'"`), 13 of them `*.docker.test.ts`. Decision 1 is why none changes.
21. **The guides.** `docs/api/agents.md:21, 23, 28, 127, 129, 133` and `docs/api/frontend.md:32-37, 96, 317` describe a `confidential`
    project's agent and its Incidents. `.env.example:166, 172, 173, 178`.
22. **The front-end's sites** (read only, `6bbbede`): `packages/server/src/platform/instances.ts:40-48, 108-112` (a `403
    INCIDENT_LOG_CONFIDENTIAL` read as `'confidential'`); `agents/lead.ts:42, 54, 125, 243-245`; `build/round.ts:590-591, 666, 705-709,
    1471, 1602`; `api/progress.ts:181, 289-291`; `api/round-state.ts:27`; `api/sensitive.ts:10`; `web/src/words.ts:310, 396-453`;
    `web/src/screens/building/needs.tsx:185`. **It compares no classification value** (the review's Check 3); it keys off the refusal's
    code and model names.
23. **FE-46/47/5's plan** bumps the contract to `1.7.0` at its Task 2 (ten lines name it, Successor, above); its assessment gap ids
    (`flows.classification`, `hosting.offshore-ai`, …, its Decision 8) are ids, not words, so Task 3's words do not move them.

*Added with the fresh review's fixes (23:24–, read at `a0b8cdc`; no code changed since `bae220f`):*

24. **THE TESTS THAT ASSERT AN ANSWERED VALUE — the class the spec action's list missed** (*C1*; the review's fail-open sweep):
    - `api/agents.test.ts:1158-1170` COMMITS `classification: confidential` through validation, then expects the session to hold
      `default-chat-large`. **So the schema's transform alone flips the floor to `'very-high'`** (`asClassification`'s `in` accepts it)
      and turns `models.ts:37`'s `=== 'confidential'` off — which is why Task 1 must make that reader level-safe before ANY value is
      stored canonical, not Task 2 as the review first placed it.
    - `api/agents.test.ts:1063` (*"because the project is now confidential"*, printed from the floor by `sessions.ts:650`); `:1299`
      (*"the platform now keeps a confidential project's building agent on-premise"*, `sessions.ts:654`);
    - `api/agents.test.ts:303` and `:853` (`internalOnlyCatalogue()`) filter `m.maxClassification === 'internal'` — against a canonical
      catalogue they match NOTHING, and `:303` then stays GREEN for the wrong reason (an empty catalogue);
    - `ai/capable.test.ts:211` (`maxClassification: 'internal'` from the catalogue), `:517` (*"classified 'public'"*), `:551` (*"below
      'internal'"*), `:48` (the create body's `max_classification: 'internal'`);
    - `ai/ai-path.docker.test.ts:263-267` (the SHARED LiteLLM's `default-chat-large` is `'internal'`) and `:274-276` (each shipped entry's
      catalogue level `toBe` `config.yaml`'s raw string); `ai/capable.docker.test.ts:181-185`;
    - `launch/assessment.test.ts:202, 213, 219, 235, 354, 357` (its `SPEC` passes through `manifestSchema.parse`; its `CATALOGUE`,
      `:38-40`, is handed in directly with the aliases); its `input` is a FUNCTION (`:43`), `input({ … })`;
    - `packages/mock/src/scripted.test.ts:359-…` (the confidential mock's Incident refusal); `spec/diff.test.ts`'s `DEFAULTS` is declared
      inside two blocks (`:163`, `:374`), not at module level.
25. **`make demo-gateway` asserts levels by string** (*I5*): `scripts/demo-gateway.sh:258` expects `default-chat-large`'s row at
    `"internal"`; `:247` compares `max_classification === cls` raw; `:260-261`'s entry regex ends `@(\w+)$`, which does not match
    `very-high`; `packages/journey/src/gateway.ts:495` filters `m.classification === 'confidential'`. The gateway plan's sitting 3 is
    committing this now — Task 4 re-reads both files at its HEAD.
26. **`createRelease` freezes the BUILD's stored `parsed`** (`api/routes/releases.ts:344-357`, *M2*): a release of a build validated
    before Task 2 freezes the alias, after Task 2 too. The seven-name rank table and `levelName` make that safe.
27. **Published words still in the old names** (*M1*): `api/error-codes.ts:852, 854` (`INTAKE_MODEL_UNAVAILABLE`) and
    `api/routes/intake.ts:48` (*"approved for internal data"*); `launch/assessment.ts:267` prints the stored ceiling raw (*"Manifest treats
    it as internal"*); `docs/superpowers/RUNBOOK.md:299` (*"any word but public, internal or confidential refuses the boot"*) and
    `:316-329` (the builder setting's words).
28. **The fake has no `/key/info`** (`ai/testing.ts:528-…`, its `get`); the admin's `GET /key/info?key=<value>` is how the gateway plan
    read a key's spend (F13). Task 6 reads a key's CURRENT models that way (*I2*), and its Step 1 measures the answer.

---

## Decisions this plan makes, and why

1. **ONE TYPE OF SEVEN NAMES, WIDE ON PURPOSE.** `Classification` stays the type of every stored, configured and compared level — now
   the seven names; `Level` (the four) is what `canonicalLevel` and `toLevel` answer. The schema's `transform` is typed to answer
   `Classification`, so `ManifestSpec`, `ResolvedConfig` and `ModelEntry` keep it.
   - *Why:* the 74 literal sites (Read this first 20) keep compiling and keep EXERCISING the alias path in every test and demo, which is
     what the spec action's item 7 wants from `config.yaml`; and the rank table, not the type, is the guard (I6).
   - *Rejected:* narrowing `ManifestSpec['data']['classification']` to `Level` — 74 edits in 29 files (13 of them Docker files) for no
     runtime change, and an alias then unrepresentable exactly where the defence in depth expects one.
   - *To change course:* a later type-only pass; nothing at runtime moves.
2. **CANONICAL WHERE A NAME ENTERS; RANKED EVERYWHERE; `levelName` WHERE A PERSON READS.** The entry points: the schema's transform (so
   every `appSpecs.parsed` validated from Task 2 on holds the level — **but not every new release** (*M2*): `createRelease` freezes the
   BUILD's stored `parsed` (`api/routes/releases.ts:344-357`, `spec/resolve.ts:129`), so a new release of a build validated before Task 2
   freezes the alias. That is safe, not canonical: every reader ranks it through the seven-name table and names it through `levelName`),
   `loadModelCatalogue`, `loadConfig` (gateway entries, the capable
   level), `asLevel` in the floors, and S6's two answers (`getSpec`, `toRelease`) for OLD rows. Every sentence a person reads names the
   level. *Rejected:* canonicalizing only at output — every string comparison (Read this first 3) would still need it.
3. **THE CONTRACT GOES `1.6.0 → 1.7.0` ONCE, AT TASK 1**, the enum's change; Tasks 2–6 ride on it (the examples, the descriptions, the
   new event type), because nothing is published between its tasks. **A minor**: the enum only gains values, and the default moves to
   an equal level. **The behaviour change is stated** in the version's paragraph (`document.ts`) and the front-end's NOTICE: answers now
   carry U1's names for old rows too (S6), and a token is refused `high` projects' tails (S9). The release representation's
   `classification` stays `string` (no enum is added: a client ignores what it does not know). **FE-46/47/5's plan then bumps `1.7.0 →
   1.8.0`** — the coordinator's edit. *Rejected:* `2.0.0` (the front-end would read every operation as moved).
4. **THE BUILDER EXCEPTION IS `builder === 'capable'`** (`ai/models.ts:37`). S4: with the setting `capable`, a project above the capable
   model's level gets it too; at or below that level, the rank filter already includes it. So the capable model is in every session's
   models whenever the catalogue lists it classified and the setting is `capable` — exactly what `floor === 'confidential' && …` gave
   while the capable model was `internal`. *Rejected:* `rank(floor) > rank(capableLevel) && …`, which needs the capable model's level
   threaded into a function that already has the catalogue and answers the same set. *Cost to change course:* one line. Its test proves
   the equivalence at every level. **Until Task 4 the line is Task 1's level-safe `toLevel(floor) === 'very-high' && builder ===
   'capable'`** (Decision 13), so the exception is never off between the two.
5. **`MANIFEST_CAPABLE_MODEL_CLASSIFICATION`** (S3): any of the seven names, canonicalized; empty or absent is `medium`; anything else
   a `ConfigError` `CONFIG_INVALID` naming the setting — the published code, as the gateway plan's F19 did for its own settings. **No
   cap** (S3 (b)): `very-high` is accepted, for a capable model on UBC's GPUs. It reaches `ensureRegistered` as the registration's
   classification and `capableFloor` as its minimum, so the fallback's check moves with it.
6. **A REFUSAL NEVER KEEPS A DEPLOYMENT ABOVE THE LEVEL ASKED FOR** (I1). `refuseKeeping` takes the registration's level as a REQUIRED
   argument, so the compiler finds all three callers; it keeps a priced deployment only when its stored level ranks at or below it, and
   REMOVES the rest. **The consequence, recorded:** an entry lowered while its re-registration is refused leaves the catalogue, so a
   `high` app that names it is refused `SPEC_MODEL_UNKNOWN`, not `SPEC_MODEL_CLASSIFICATION_TOO_LOW` as the spec action's item 5 first
   expected, and every key holding it is answered LiteLLM's unknown-model refusal. It fails closed. *Rejected:* keeping it at the lower
   level — that is the very registration LiteLLM just refused.
7. **S9 IS ONE CONDITION**: `actor.credential === 'token' && environment.kind !== 'sandbox' && CLASSIFICATION_RANK[await
   environmentFloor(deps.db, environment)] >= CLASSIFICATION_RANK.high`. **`INCIDENT_LOG_CONFIDENTIAL` keeps its name** (the front-end
   keys off it, Read this first 22); its summary, the route's description and the message say *high or above*.
8. **S11 IS A BOOT SWEEP OF INSTANCE KEYS** (`ai/app-key-sweep.ts`), straight after the agent sessions' sweep.
   - **Which keys:** every instance whose state is not `gone` with an `app:llmApiKey:<instanceId>` secret — a failed instance's key is
     still live until its retirement. **P4b's environment-level keys are COUNTED, named in one operator line and not checked** (none can
     exist on a machine `pnpm test` has truncated since P4c; at UBC none ever existed).
   - **Which level: the release's FROZEN level for that environment** (S11's row: *"its frozen level"*) — what the key was minted for,
     because a raise of the project's manifest reaches a running app only at its next deploy (D9, as today), and that deploy mints a new
     key. **The spec says so since Task 0** (2026-10-04, `ad35ef9`): Rich, asked the wording point at 13:53, chose *"Name the frozen level"*,
     so E3 reads *"…every running app's key [loses] each model the level of the release it runs no longer allows"* where the 22:21 draft
     said *"its project's level"* (*M12*; the decisions file's 13:53 entry).
   - **What it withdraws:** the agent sweep's own rule, over what the key HOLDS NOW (*I2*) — read by `GET /key/info?key=<value>` with the
     master key, never recomputed from the release's frozen `ai.models` — each held model the catalogue SERVES (classified or not) that is
     not classified at or above that level. A model the catalogue no longer serves stays on the key (LiteLLM refuses it). **So a second
     boot finds nothing to withdraw, and records nothing**: the agent sweep is idempotent by the session row's `models`; an app key has no
     row, so LiteLLM's own record is the one read. A key LiteLLM no longer holds (`404`) has nothing to withdraw.
   - **Against a FRESH catalogue** (*M8*): `loadModelCatalogue(llm)`, never the 60-second cache a request may have filled between `listen`
     and the sweep (`index.ts:482`).
   - **How:** `/key/update { key: <value>, models: kept }` — or, when nothing kept is allowed, `revokeInstanceKey`, never `models: []`.
   - **Each change:** an `ai.models_withdrawn` event to the project's people, and an operator line. **A release whose frozen level is
     unreadable is NAMED and skipped** — never assumed, in either direction.
   - **THE STOP:** Step 1 measures, on the running LiteLLM, that `/key/update` by VALUE narrows an app key **and leaves its other bounds
     alone** — `allowed_routes` (its confinement), `metadata` (the spend join), `user_id`, `max_budget` — read by `/key/info` before and
     after (*I4*). It also records LiteLLM's answer to an unknown value, and whether `{ key: <the token hash /key/info answers> }` is
     accepted. If the narrowing fails, or a bound moves, Task 6 stops and the coordinator puts Rich two options at code level — update by
     the hash, IF Step 1 measured that it works and keeps the bounds; or REVOKE any key holding a lowered model (stricter: the app's AI
     stops until its owner redeploys).
9. **THE MOCK GAINS A `level` OPTION BESIDE `confidential`** (`MANIFEST_MOCK_LEVEL`), and `agentModels(confidential: boolean)` keeps its
   signature: the front-end imports and runs the mock from this tree, so its exports only grow. `confidential: true` means `very-high`.
10. **FIXTURES AND THE DEMOS' MANIFESTS KEEP THEIR ALIASES** (`config.yaml`, `fixtures/*/manifest.yaml`, every test literal): they are the
    alias path, exercised by every run. **The blueprint's starter moves to `medium`**, and AGENTS.md tells an agent to declare a level
    every time from U1's table: agents copy the blueprint, and new manifests use U1's names (21:48).
11. **THE ACCEPTANCE IS `make demo-levels`**, offline, on either driver, a step of `make ci-acceptance` and the next step of
    `scripts/offline-acceptance.sh`. It needs no capable model; one phase reports whether the capable model is offered and asserts it
    only when the catalogue lists it. *Rejected:* folding its checks into `make demo-launch` — that journey is a launch, and a failure
    there would read as a launch defect.
12. **WORDS.** A value is written `very-high`; a person reads *very high* (U1's *"Very High Risk"*), so the privacy assessment's
    sentence-start word is *Very high*, never `capitalised('very-high')`'s *Very-high*. Published text names *UBC's Information Security
    Standard U1*, which passes `docs.test.ts` (its patterns are `§n`, `Dnn`, `Cn`, `R1-9`, `Fn`, `FE-n`, plan words — not `U1`). **One helper
    holds both forms** (`spec/schema.ts`, Task 1): `levelName` answers the VALUE (`very-high` — for a diff's `from`/`to`, a refusal's hint
    the author copies into `manifest.yaml`), `levelWords` the PROSE (`very high` — for an event, the privacy assessment).
13. **THE ORDER: LEVEL-SAFE READERS FIRST, THEN THE SWITCH** (*C1*). The review found that Task 2, as first cut, switched the floors and
    the catalogue to U1's names while `releases.ts:1253`, `models.ts:37` and `assessment.ts:97, :207` still compared against
    `'confidential'` until Tasks 3–5: `pnpm typecheck` red at Task 2 (TS2367), the token rule and the builder exception off across sitting
    1's close, and that boot's sweep narrowing every very-high session with a false sentence. **It is earlier than that**: Task 1's
    schema transform alone stores a newly committed `confidential` as `'very-high'`, which `asClassification`'s `in` accepts — so
    `api/agents.test.ts:1166-1170` goes red at Task 1 (Read this first 24). So:
    - **Task 1** stores what is written (no transform; the default stays `internal`), widens the enum and the rank table, and makes EVERY
      reader that compares against an old name level-safe — `toLevel(x) === 'very-high'` at `models.ts:37`, `releases.ts:1253`,
      `assessment.ts:97, :207` and `gateway-models.ts:135` — behaviour unchanged for every existing input, and right for a U1 name written
      now. Its tests are the new name's: a project declaring `very-high` keeps the builder exception and refuses tokens its tails.
    - **Task 2** is the switch: the transform, the default `medium`, the canonical floors and catalogue, the diff by level, S6's answers,
      and every sentence that prints a level in U1's words — with every moving expectation named and its red predicted.
    - **Tasks 3, 4 and 5** change behaviour FROM Task 1's level-safe lines, never from `'confidential'`.
    - *Rejected:* the review's own fix (the renames at Task 2) — it leaves Task 1's transform switching values first. *Rejected:* one task
      for Tasks 1 and 2 — a commit too large for one reviewer to reject a part of.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **THE ALIASES NEVER WIDEN.** `public` = `low`, `internal` = `medium`, `confidential` = `very-high`, for ever, in the rank table, in
  `LEVEL_ALIASES` and in every sentence. **`confidential` is never `high`.**
- **NEVER `in` AGAINST THE RANK TABLE** — `Object.hasOwn`, or `canonicalLevel`. `in` finds `toString`.
- **Four gates, all clean before every commit**, from the repository root: `pnpm test`, `pnpm lint`, `pnpm typecheck` and
  `pnpm format:check`. Run **`pnpm test` twice** on a sitting's final tree. Never with `--filter`.
- **`pnpm test:docker`** (~20 min; `make up` and the chat model warm first; it fails rather than skips): owed by sittings 1 and 2, once
  each, at the close, **in the background, never beside a Vitest run**, from a shell where `MANIFEST_SOURCE_DRIVER`, every
  `MANIFEST_GITHUB_*`, `MANIFEST_CAPABLE_MODEL`, `MANIFEST_CAPABLE_MODEL_CLASSIFICATION` and `MANIFEST_GATEWAY_MODELS` are unset. Count
  `docker network ls -q | wc -l` before it. Afterwards: restart the control plane from `.env`, the three cleanup scripts, `make verify`.
- **One file**, from the repository root: `pnpm exec vitest run --project unit src/<path>`; one Docker file:
  `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/<path>`. **Never two Vitest processes at once. `pnpm test`, ONE test
  file and `pnpm contract:write` all TRUNCATE the control plane's tables.**
- **Vitest strips types.** `pnpm typecheck` is the only gate that sees a type; `exactOptionalPropertyTypes` is on. **A named export that
  does not exist yet is `undefined`, not an import error** — so a new test can be green before its feature; Step 2 of every task predicts
  WHERE it goes red, and a test green before its code is a defect in the test.
- **A route, representation, event or error-text change is four commands, in order**: the definition, `pnpm contract:write`,
  `pnpm contract:generate`, `pnpm docs:write`. Generated files (`packages/contract/openapi.json`, `src/schema.d.ts`,
  `docs/api/reference/`, `llms.txt`) are never edited by hand.
- **PUBLISHED TEXT CITES NO SECTION, DECISION OR PLAN** (Rich, 2026-09-30): every `.describe()`, error summary and guide line passes
  `api/contract/docs.test.ts`. A runtime message or hint may name D17, as today's do; a published description may not.
- **A REFUSAL TEST NEEDS A POSITIVE CONTROL IN THE SAME TEST, and asserts the refusal's CODE.** **Never accept a check you have not
  watched fail**: each task ends by breaking what it built after committing, **predicting** what goes red, then restoring by `git
  checkout <path>` (proving the break applied — read the `git diff` — before trusting a green).
- **Every task names its CALLER.** A module with no caller is not built.
- **An operator line never carries a key, a request body or a provider's message.** `console.error`: this server runs `logger: false`.
- **The faculty front-end links `packages/contract` and runs `packages/mock` from THIS working tree.** Contract and mock change in ONE
  commit, typecheck-clean together (`pnpm typecheck` covers both). Before each such commit: `ListAgents`, message its live
  `manifest-app-…` session (the NOTICE, Task 1; a short line at each later contract commit), and commit after its reply or a fair wait.
  **Never edit `~/Developer/manifest-app`.**
- **COMMIT ON `main`, STAGE YOUR OWN PATHS BY NAME**; never `git add -A`, `.` or `commit -a`. Run `git status` before each commit and
  account for every path — other sessions commit on `main` while you work.
- **Run `date` before writing any time** into a record or a message.
- **Never edit the spec** without Rich's word (Task 0 is that word, applied). **Never touch Laravel Valet.** **Ask before `sudo`**; no
  task needs it.
- **macOS: bash 3.2 and a BSD userland; the tool shell is zsh.** Multi-line probes go in a file run with `bash <file>`.
- **These four containers must survive:** `docker-simple-saml-saml-idp-1`, `qdrant-local-dev`, `mongodb`, `mongo-express`.
- **Leave the machine as you found it**: `scripts/snapshot-machine.sh` at the start and the end, and the three cleanup scripts, bare,
  then `--apply`.

---

## Review Focus

**The six failure modes most likely to bite a person, that no task's happy path exercises.** Each has its test in the owning task.

1. **An alias read as a WIDER level** — `confidential` ranked `high` by a partial edit, or a stored alias ranked `undefined` (and
   `x < undefined` is `false`, so the check passes). Expected: **`confidential` ranks `very-high` everywhere, and a `very-high` app is
   refused every `high` entry** — at validation, at the deploy of an old frozen release, and in an agent session's models. Owned by
   Task 1 (*ranks EVERY alias exactly at its level*), Task 2 (*an old frozen confidential release still floors very-high*) and Task 3
   (*the aliases never widen at validation and at deploy*).
2. **A rename that is not a change, treated as one.** An old row says `internal`, a new commit says `medium`: compared as strings, the
   next production release re-escalates for approval (D9), and every LiteLLM row registered at an alias is re-created at boot. Expected:
   **neither.** Owned by Task 2 (*a rename from an alias to its level is NOT sensitive*) and Task 4 (*an alias row is unchanged at its
   level*).
3. **A level lowered, and the higher one kept** — the gateway's zero retention lapses, the administrator writes `@medium`, and LiteLLM
   (restarted offline) refuses the re-registration as unpriced: today the old `high` row stays and `high` apps keep sending to it.
   Expected: **the entry leaves the catalogue; a `high` app is refused it (`SPEC_MODEL_UNKNOWN`); a NEW session is never given it; a LIVE
   session's key keeps the name, which LiteLLM no longer serves and refuses** — the agent sweep withdraws only names the catalogue still
   serves (*M6*: fail-closed, and not *"loses it at boot"*, as this line first said). Owned by Task 4, which asserts the new-session half;
   the live-key half rests on LiteLLM refusing a name with no deployment, the agent sweep's rule since the launch path plan's Task 7.
4. **A token reading real people's input** — a `high` project's staging tail answered to a delegated token because the builder setting
   is `on-premise` or the capable model is `high`. Expected: **`403 INCIDENT_LOG_CONFIDENTIAL` at `high` and above, whatever either
   setting; `200` to the person; `200` on the sandbox; `200` to a token on a `medium` project.** Owned by Task 5.
5. **A running app keeping a model now approved below its data** — and the naive fix, a key narrowed to `models: []`, which LiteLLM reads
   as EVERY model. Expected: **the model is taken off the key at the next boot; a key left with nothing allowed is revoked; nothing
   is ever set to `[]`; a second boot finds nothing more to do.** Owned by Task 6 — its unit cases, and its `boot.docker.test.ts` case
   through the booted entry point (*I1*, *I2*).
6. **The privacy assessment telling the Privacy Office the wrong thing** — a `high` model described as staying on premises, a `very-high`
   one as *"may leave UBC"*, or *Very-high* printed. Expected: **a `very-high` model stays on premises; a `high` one may leave UBC to a
   provider that keeps nothing it is sent; the level is printed as a person reads it.** Owned by Task 1 (the level-safe on-premise
   test), Task 2 (the words) and Task 3 (the `high` sentence); seen by Rich at Task 7 (*I6*).

---

## File Structure

```
packages/control-plane/src/spec/
  schema.ts               MOD (T1) LEVELS, Level, LEVEL_ALIASES, CLASSIFICATIONS (7), CLASSIFICATION_RANK (7), DEFAULT_LEVEL, toLevel,
                          canonicalLevel, levelName, levelWords; the enum accepting seven, as written. (T2) the transform, the
                          default medium, specInLevels
  index.ts                MOD (T1, T2) the new exports
  levels.test.ts          NEW (T1) the invariant, the seven names, the transform, the default. (T2) specInLevels
  schema.test.ts          MOD (T2) :19's default reads 'medium'
  diff.ts, diff.test.ts   MOD (T2) both views and describeDiff by level
  policy.ts, policy.test.ts   MOD (T3) E14's hint and message in levels; the aliases-never-widen cases
packages/control-plane/src/ai/
  models.ts, models.test.ts   MOD (T1) :37 level-safe; asClassification by Object.hasOwn. (T2) asLevel, DEFAULT_LEVEL.
                          (T4) builder === 'capable'; words
  ai-path.docker.test.ts  MOD (T2) :267 any level; :274-276 by canonicalLevel (C1, I5)
  api/agents.test.ts      MOD (T2) :303, :853 filters 'medium', non-empty; :1063's words. (T4) :1299's words
  catalogue.ts, catalogue.test.ts   MOD (T2) an entry's level, canonical at read
  intake.ts               MOD (T3) CLASSIFICATION_RANK.medium; its message (and error-codes.ts:852-854, routes/intake.ts:48 — M1)
  capable.ts, capable.test.ts   MOD (T4) the level as a parameter; capableFloor; CAPABLE_CLASSIFICATION removed
  registration.ts, registration.test.ts (or capable.test.ts)   MOD (T4) :237 by level; refuseKeeping(…, level, …)
  gateway-models.ts, gateway-models.test.ts   MOD (T1) the very-high pin, level-safe. (T4) refuseKeeping's level; platformModelsAtBoot's setting
  sessions.ts             MOD (T2) :650's floor in words. (T4) the builder clause's words
  capable.docker.test.ts  MOD (T4) registered at 'high'; an 'internal' row unchanged at 'medium'
  app-key-sweep.ts        NEW (T6) withdrawLoweredAppModels, appKeysAtBoot
  app-key-sweep.test.ts   NEW (T6)
  app-key-sweep.docker.test.ts   NEW (T6) the measurement (Step 1), then the sweep against the running LiteLLM
  testing.ts              MOD (T6) the fake's /key/update finds a key by its value too
  index.ts                MOD (T6) the exports
packages/control-plane/src/
  config.ts, config.test.ts   MOD (T4) GATEWAY_MODEL_ENTRY's seven names; MANIFEST_CAPABLE_MODEL_CLASSIFICATION; the builder's words
  index.ts                MOD (T4) the capable level to the boot; the boot line. (T6) appKeysAtBoot; the boot line
  releases/release.ts     MOD (T3) RELEASE_MODEL_CLASSIFICATION_TOO_LOW's message in levels
  launch/assessment.ts, assessment.test.ts   MOD (T1) :97, :207 level-safe. (T2) the levels in a person's words, :267. (T3) high's zero retention
  api/representations/releases.ts   MOD (T2) classification as its level
  api/routes/project-reads.ts       MOD (T2) getSpec in levels; its example
  api/routes/releases.ts            MOD (T1) :1253 level-safe. (T2) the examples. (T5) S9's condition, description and message
  api/routes/launch-examples.ts     MOD (T2) the PIA example's words
  api/levels.test.ts                NEW (T2) S6's two answers for an old row
  api/error-codes.ts                MOD (T5) INCIDENT_LOG_CONFIDENTIAL's summary
  api/representations/incidents.ts, agents.ts   MOD (T5) incidents' prompt description. (T4) agents' endReason description
  api/incidents.test.ts             MOD (T1) the level helpers; a very-high case. (T5) :150's case inverted; high, medium and alias cases
  api/authz-contract.ts             MOD (T5) declareLevel; a high row and the alias row, last
  api/testing.ts                    MOD (T5) :313's union → Classification
  api/contract/document.ts          MOD (T1) CONTRACT_VERSION 1.7.0 and its paragraph
  api/contract/manifest-yaml.test.ts   MOD (T1) the published enum, default and description
  observability/events.ts, event-schemas.ts, examples.ts   MOD (T4) the agent events' words. (T6) ai.models_withdrawn
  db/schema.ts            MOD (T6) events_type_known gains ai.models_withdrawn
packages/control-plane/drizzle/   NEW (T6) the CHECK's migration, generated
packages/contract/ (generated), packages/contract/package.json   MOD (T1) 1.7.0; regenerated at T2–T6
packages/mock/src/fixtures.ts, server.ts   MOD (T2) the PIA fixture's words. (T5) the `level` option and the refusal at high
packages/mock/src/scripted.test.ts         MOD (T5) MANIFEST_MOCK_LEVEL's refusal and its positive control (M5)
scripts/demo-gateway.sh, packages/journey/src/gateway.ts   MOD (T4) levels compared as levels (I5)
packages/journey/src/frontend.ts   MOD (T2) :1104's 'confidential' → 'very-high'
packages/journey/src/levels.ts     NEW (T7)
scripts/demo-levels.sh, scripts/levels-controls.sh   NEW (T7); Makefile, scripts/ci-acceptance.sh, scripts/offline-acceptance.sh MOD (T7)
blueprints/node-ts-mongo/starters/proof-app/manifest.yaml, its README.md, blueprints/node-ts-mongo/agents/AGENTS.md   MOD (T3)
docs/api/agents.md, docs/api/frontend.md   MOD (T3) declaring a level. (T4) the building agent. (T5) the Incident rule
.env.example                       MOD (T4) MANIFEST_CAPABLE_MODEL_CLASSIFICATION; :166, :172, :173, :178's words
docs/superpowers/RUNBOOK.md        MOD (T4) the capable model's level. (T6) the sweep's line. (T7) make demo-levels
docs/superpowers/specs/2026-08-29-manifest-platform-design.md, specs/manifest-*.html   MOD (T0 only — the decided words)
```
**Not touched:** `infra/litellm/config.yaml` (S2 (i)) — `scripts/demo-gateway.sh` IS touched now, by Task 4 (*I5*); `fixtures/*/manifest.yaml` (Decision 10); the 74 test literals (Decision 1);
`packages/console/` (it renders what it is answered); `~/Developer/manifest-app`.

---

## Task 0: The decided spec action's words, applied (sitting 1, first — documents only)

**Its caller is every later task**: no task builds what the spec does not say. Decided at 22:21; the words are
[`2026-10-03-u1-spec-action.md`](./2026-10-03-u1-spec-action.md)'s, **as recommended**: S2 (i), S9 (b), S10 (a), S11 (a) — never the
alternatives' words printed beside them.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-29-manifest-platform-design.md` (E1–E13), `docs/superpowers/specs/manifest-decisions.html`,
  `manifest-stories.html`, `manifest-schematic.html` (the action's *Shared pages*), and the action's own banner

- [ ] **Step 1: Is it applied already?** `grep -n 'very-high' docs/superpowers/specs/2026-08-29-manifest-platform-design.md | head`, and
  read the spec action's banner. Any hit in §7 with an APPLIED banner: record its commit in this plan's record and go to Task 1.
- [ ] **Step 2: The gateway's acceptance closed?** Its sittings table's sitting 3 reads DONE. If not, STOP: the 22:21 decision applies
  the words only after it. Tell the coordinator.
- [ ] **Step 3: The word to apply.** `ListAgents`; if a coordinator is live, ask it (it puts the go to Rich and may apply the words
  itself, as `manifest-af` applied the gateway's Spec action 1); otherwise ask Rich with the question tool: *"Apply the U1 spec action
  now, as decided at 22:21?"* Nothing else is asked — the words are decided.
- [ ] **Step 4: Every "Current:" quote, re-found.** The action's line numbers are the spec at `b416a8f`. For each of E1, E3–E13 and each
  shared-page quote, `grep -nF '<a distinctive phrase of the quote>' <file>` and read the whole quoted span: **each must match word for
  word**, or STOP and tell the coordinator which moved (a later edit to the spec is not this task's to merge).
- [ ] **Step 5: Apply, exactly.** E1 (both lines, l.392 under S2 (i)); E2 (the new subsection, before *Classification gates model
  routing (D17)*); E3 (the block, then its two paragraphs — the second's last sentence S11 (a)'s); E4; E5; E6 (the S4/S9 (b)/S10 (a)
  words, whole); E7; **E8 on ONE line** (a table cell); E9; E10 (its bold markers kept); E11; E12; E13. Shared pages:
  `manifest-decisions.html:136`, `:137` and its *"by default it may use…"* sentence; `manifest-stories.html:197` (`class="stop"` stays)
  and `:205-210` (S2 (i)'s words); `manifest-schematic.html:1073`. **E3's second paragraph says *"its project's level"***; Task 6's
  sweep uses each instance's FROZEN level (Decision 8, *M12*). Apply the decided words as they are; the reading is recorded there. `manifest-phases.html`: `grep -n 'confidential\|classification'` —
  expect no mention, and record it.
- [ ] **Step 6: Check, do not re-read.** `grep -c` each old phrase (expect `0`) and each new one (expect `1`); `git diff --stat` lists the
  FOUR files — the spec, `manifest-decisions.html`, `manifest-stories.html`, `manifest-schematic.html` — and nothing else (*M10*). **If the classifier refuses an edit to the spec or a shared page, stop and ask; never work around it**
  (memory: a refused spec edit cleared on retry after Rich allowed it in chat).
- [ ] **Step 7: The action's banner**: *"APPLIED <date, time from `date`> by `<session>`, at Rich's word (<where it was given>)"*. Commit
  the FIVE paths by name — the four, and the action's own file (*M10*):
  ```bash
  git commit -m "docs(spec): UBC's U1 levels — §7, §10, §16, §20, §26 and D17 as the U1 spec action decided (22:21), and the shared pages (U1 plan Task 0)"
  ```

---

## Task 1: The vocabulary, and every reader made level-safe — one rank table of seven, the enum accepting seven (contract `1.7.0`)

**Re-cut by the fresh review's *C1*** (Decision 13). **This task changes no answer any EXISTING input produces**: the enum and the rank
table grow, a manifest may now be written in U1's names and is stored AS WRITTEN, the default stays `internal`, and every reader that
compares a level against an old name's string compares by level instead — so a project written `very-high` today is treated exactly as
one written `confidential`. Task 2 is the switch.

**Its callers**: `manifestSchema` (every validation); `CLASSIFICATION_RANK`'s readers (Read this first 2); and the four literal readers
(Read this first 4) — `agentModelsFor` (every agent session), `listIncidents`' safeguard, the privacy assessment, `ensureGatewayModels`.

**Files:**
- Modify: `src/spec/schema.ts:8-16, :258-264`, `src/spec/index.ts:7-9`
- Modify (level-safe, behaviour unchanged): `src/ai/models.ts:37, :57-60`, `src/api/routes/releases.ts:1253`,
  `src/launch/assessment.ts:97, :207`, `src/ai/gateway-models.ts:134-135`
- Create: `src/spec/levels.test.ts`; Modify: `src/ai/models.test.ts`, `src/api/incidents.test.ts`, `src/launch/assessment.test.ts`,
  `src/ai/gateway-models.test.ts`
- Modify: `src/api/contract/document.ts` (`CONTRACT_VERSION`, its paragraph), `src/api/contract/manifest-yaml.test.ts`,
  `packages/contract/package.json:3`; regenerated: `packages/contract/openapi.json`, `src/schema.d.ts`, `docs/api/reference/`, `llms.txt`

**Interfaces:**
- Produces (from `spec/index.ts`):
  - `LEVELS: readonly ['low','medium','high','very-high']`; `type Level`;
  - `LEVEL_ALIASES: { public: 'low'; internal: 'medium'; confidential: 'very-high' }`;
  - `CLASSIFICATIONS` — the seven names, levels first; `type Classification` — the seven;
  - `CLASSIFICATION_RANK: Record<Classification, number>` — the seven;
  - `DEFAULT_LEVEL: Level` (`'medium'`; the schema's default only from Task 2);
  - `toLevel(name: Classification): Level`;
  - `canonicalLevel(value: unknown): Level | undefined`;
  - `levelName(value: unknown): string` — the level's VALUE (`very-high`), or the value as written when it is none;
  - `levelWords(value: unknown): string` — the level as a person reads it (`very high`), or the value as written (Decision 12).

- [ ] **Step 1: The failing tests.** `src/spec/levels.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import {
    CLASSIFICATION_RANK,
    CLASSIFICATIONS,
    LEVEL_ALIASES,
    LEVELS,
    canonicalLevel,
    levelName,
    levelWords,
    manifestSchema,
  } from './index.js'

  const minimal = {
    manifest: 1,
    name: 'chem-lab-scheduler',
    blueprint: 'node-ts-mongo@2',
    runtime: { port: 3000 },
  }
  const declaring = (classification?: string) =>
    manifestSchema.safeParse({
      ...minimal,
      ...(classification === undefined ? {} : { data: { classification } }),
    })

  describe('UBC’s U1 levels, and Manifest’s earlier names as aliases (U1 plan Task 1)', () => {
    it('ranks the four levels low < medium < high < very-high', () => {
      expect(LEVELS.map((l) => CLASSIFICATION_RANK[l])).toEqual([0, 1, 2, 3])
    })

    it('ranks EVERY alias exactly at its level — the aliases never widen (Review Focus 1)', () => {
      expect(LEVEL_ALIASES).toEqual({ public: 'low', internal: 'medium', confidential: 'very-high' })
      for (const [alias, level] of Object.entries(LEVEL_ALIASES)) {
        expect(CLASSIFICATION_RANK[alias as keyof typeof LEVEL_ALIASES], alias).toBe(CLASSIFICATION_RANK[level])
      }
      // The partial edit this guards: `confidential: 2` left in place reads it as `high`, which reaches OpenAI.
      expect(CLASSIFICATION_RANK.confidential).toBeGreaterThan(CLASSIFICATION_RANK.high)
    })

    it('holds the seven names and nothing else — no prototype name is a level', () => {
      const seven = ['confidential', 'high', 'internal', 'low', 'medium', 'public', 'very-high']
      expect([...CLASSIFICATIONS].sort()).toEqual(seven)
      expect(Object.keys(CLASSIFICATION_RANK).sort()).toEqual(seven)
      for (const value of [
        'toString', 'constructor', '__proto__', 'hasOwnProperty',
        'High', 'very_high', 'restricted', '', 2, null, undefined,
      ]) {
        expect(canonicalLevel(value), String(value)).toBeUndefined()
      }
    })

    it('answers each name’s level as a value and in words, and keeps an unknown value as written', () => {
      const seven = ['low', 'medium', 'high', 'very-high', 'public', 'internal', 'confidential']
      expect(seven.map((v) => canonicalLevel(v))).toEqual(
        ['low', 'medium', 'high', 'very-high', 'low', 'medium', 'very-high'],
      )
      expect(levelName('confidential')).toBe('very-high')
      expect(levelWords('confidential')).toBe('very high')
      expect(levelWords('internal')).toBe('medium')
      expect(levelName('secret')).toBe('secret')
      expect(levelWords('secret')).toBe('secret')
    })

    it('accepts all seven names in manifest.yaml, and refuses any other — high accepted in the same test', () => {
      for (const v of ['low', 'medium', 'high', 'very-high', 'public', 'internal', 'confidential']) {
        expect(declaring(v).success, v).toBe(true)
      }
      for (const v of ['restricted', 'High', 'very_high', 'personal', 'secret']) {
        expect(declaring(v).success, v).toBe(false)
      }
    })

    it('stores what is WRITTEN until Task 2 — internal stays internal, and the default is still internal', () => {
      const written = declaring('internal')
      expect(written.success && written.data.data.classification).toBe('internal')
      const absent = declaring(undefined)
      expect(absent.success && absent.data.data.classification).toBe('internal')
    })
  })
  ```
  *(The last case is Task 1's own boundary: Task 2 replaces it with the stored-level cases, and its red there is predicted.)*

  **The level-safe readers, each tested with the NEW name** — the old name's tests stay as they are and must stay green:
  - `src/ai/models.test.ts`, in *agentModelsFor — the building agent's setting*:
    ```ts
    it('a project written very-high — the U1 name — keeps the builder exception, as confidential does (U1 plan Task 1, C1)', async () => {
      const catalogue = await withCapable()
      for (const floor of ['very-high', 'confidential'] as const) {
        expect(agentModelsFor(catalogue, floor, 'capable'), floor).toContain(CAPABLE_MODEL_NAME)
        expect(agentModelsFor(catalogue, floor, 'on-premise'), floor).not.toContain(CAPABLE_MODEL_NAME)
      }
    })
    ```
  - `src/api/incidents.test.ts` (its `declared` and `incidentIn` typed `Classification`):
    ```ts
    it('refuses a token the tails of a project written very-high — the U1 name — as of one written confidential (U1 plan Task 1, C1)', async () => {
      await withSetting('capable', async (ctx) => {
        await incidentIn(ctx, ctx.stagingEnvironmentId)
        await declared(ctx, 'very-high')
        expect(refusal(await read(ctx, ctx.stagingEnvironmentId, { bearer: await reader(ctx) }))).toEqual({
          status: 403,
          code: 'INCIDENT_LOG_CONFIDENTIAL',
        })
        expect(tailOf(await read(ctx, ctx.stagingEnvironmentId, {}))).toEqual([LOG_TAIL])
      })
    })
    ```
  - `src/launch/assessment.test.ts`:
    ```ts
    it('a very-high app’s rule is on-premise hardware, written in the U1 name (U1 plan Task 1, C1)', () => {
      const spec = manifestSchema.parse({ ...BARE_INPUT, data: { classification: 'very-high' } })
      const flows = section(assembleAssessment(input({ spec })), 'flows')
      expect(valueOf(flows, 'Classification')?.value).toMatch(/must run on on-premise hardware\.$/)
    })
    it('a catalogue entry at very-high stays on premises in the words (U1 plan Task 1, C1)', () => {
      const catalogue: ModelEntry[] = [{ name: 'default-chat-onprem', maxClassification: 'very-high', kind: 'chat' }]
      const flows = section(assembleAssessment(input({ catalogue })), 'flows')
      expect(valueOf(flows, 'default-chat-onprem')?.value).toMatch(/runs on on-premise hardware/)
    })
    ```
    *(`BARE_INPUT` is `BARE`'s input object (`assessment.test.ts:65-70`) — lift it to a constant; `input` is a FUNCTION, `input({ … })`
    (*M14*); `valueOf` and `section` are the file's own.)*
  - `src/ai/gateway-models.test.ts` (the gateway plan's `GW`):
    ```ts
    it('pins an unpriced very-high entry — the U1 name — at the stand-in’s price, as confidential (U1 plan Task 1, C1)', async () => {
      for (const level of ['very-high', 'confidential'] as const) {
        const lite = fakeLiteLlm()
        lite.price('openai/qwen-x', 0)
        const r = await ensureGatewayModels(
          lite,
          [{ name: 'ubc-onprem', setting: 'ubc-ai-gateway/qwen-x', classification: level }],
          GW,
        )
        expect(r.models[0]?.state, level).toBe('registered')
        const d = [...lite.deployments.values()].find((x) => x.modelName === 'ubc-onprem')!
        expect([d.inputCostPerToken, d.outputCostPerToken], level).toEqual([1e-6, 3e-6])
      }
    })
    ```
  `src/api/contract/manifest-yaml.test.ts` gains:
  ```ts
  it('publishes data.classification as the seven names, its description naming U1 and the aliases (U1 plan Task 1)', () => {
    const doc = manifestYamlSchema() as {
      properties: { data: { properties: { classification: Record<string, unknown> } } }
    }
    const node = doc.properties.data.properties.classification
    expect(node.enum).toEqual(['low', 'medium', 'high', 'very-high', 'public', 'internal', 'confidential'])
    expect(node.default).toBe('internal')
    expect(String(node.description)).toContain('U1')
    expect(String(node.description)).toMatch(/`confidential` is `very-high`/)
  })
  ```
- [ ] **Step 2: Run — predict red**, one file at a time:
  - `levels.test.ts`: every case red — `LEVELS` and `LEVEL_ALIASES` are `undefined` (Vitest strips types; the import is no error), so the
    first `.map` throws — except *stores what is WRITTEN*, which is GREEN today and must STAY green through this task (that is its job);
  - `models.test.ts`: red at `'very-high'` (`floor === 'confidential'` is false for it) and green at `'confidential'`;
  - `incidents.test.ts`: red — `declared(ctx, 'very-high')` is stored, but `environmentFloor` reads it through `in`, answers
    `'very-high'`, and `=== 'confidential'` answers the token `200`;
  - `assessment.test.ts`: the spec case red at `manifestSchema.parse` (`very-high` refused by the three-name enum); the catalogue case red
    at the words (*"may leave UBC"*);
  - `gateway-models.test.ts`: red at `'very-high'` (refused as unpriced), green at `'confidential'`;
  - `manifest-yaml.test.ts`: red at `node.enum` (three values).
- [ ] **Step 3: Implement — the vocabulary.** `src/spec/schema.ts`, replacing `:8-16`:
  ```ts
  /** UBC's U1 levels (Information Security Standard U1, §2.1), least sensitive first (§7). */
  export const LEVELS = ['low', 'medium', 'high', 'very-high'] as const
  export type Level = (typeof LEVELS)[number]

  /**
   * MANIFEST'S EARLIER NAMES, ALIASES FOR EVER, EACH WITH ONE FIXED MEANING (Rich, 2026-10-03, 21:48: "Keep them as
   * aliases"). An alias NEVER comes to mean anything wider: `confidential` is `very-high`, so a confidential app stays on
   * premises.
   */
  export const LEVEL_ALIASES = {
    public: 'low',
    internal: 'medium',
    confidential: 'very-high',
  } as const satisfies Record<string, Level>

  /** Every name accepted wherever a level is — the four levels, then the three aliases. */
  export const CLASSIFICATIONS = [...LEVELS, 'public', 'internal', 'confidential'] as const
  export type Classification = (typeof CLASSIFICATIONS)[number]

  /**
   * low < medium < high < very-high (D17) — AND EVERY ALIAS AT ITS LEVEL'S RANK (the U1 spec action's review, I6), so a read
   * that never canonicalizes still ranks a stored alias right, and the next read a change misses fails CLOSED. `levels.test.ts`
   * holds RANK[alias] === RANK[its level]: the trap is a partial edit that appends the U1 names and leaves `confidential: 2`,
   * which reads it as `high` and sends it to a commercial model.
   */
  export const CLASSIFICATION_RANK: Record<Classification, number> = {
    low: 0,
    medium: 1,
    high: 2,
    'very-high': 3,
    public: 0,
    internal: 1,
    confidential: 3,
  }

  /** §7's level for an app that declares none (S5): `medium`, today's `internal` — the schema's default from Task 2. */
  export const DEFAULT_LEVEL: Level = 'medium'

  /** The level a known name means. */
  export const toLevel = (name: Classification): Level =>
    Object.hasOwn(LEVEL_ALIASES, name)
      ? LEVEL_ALIASES[name as keyof typeof LEVEL_ALIASES]
      : (name as Level)

  /**
   * The level a stored or written value means; `undefined` for anything that is not one of the seven names. An OWN key of
   * the rank table — never `in`, which finds `toString` (`ai/catalogue.ts`'s warning, finding 47).
   */
  export const canonicalLevel = (value: unknown): Level | undefined =>
    typeof value === 'string' && Object.hasOwn(CLASSIFICATION_RANK, value)
      ? toLevel(value as Classification)
      : undefined

  /** A level as a VALUE a person may copy into manifest.yaml (`very-high`), or the value as written when it is none. */
  export const levelName = (value: unknown): string => canonicalLevel(value) ?? String(value)

  /** A level as a person READS it — U1's own "Very High Risk", so `very high`, never the hyphen — or the value as written. */
  const LEVEL_WORDS: Record<Level, string> = { low: 'low', medium: 'medium', high: 'high', 'very-high': 'very high' }
  export const levelWords = (value: unknown): string => {
    const level = canonicalLevel(value)
    return level === undefined ? String(value) : LEVEL_WORDS[level]
  }
  ```
  The field (`:258-264`) — **no transform, and the default unchanged**, in this task:
  ```ts
  classification: z
    .enum(CLASSIFICATIONS)
    .default('internal')
    .describe(
      'How sensitive the app’s data is, in UBC’s four levels (Information Security Standard U1): `low`, `medium`, `high` or `very-high` — what every model in `ai.models` must be approved for. Any personal information, such as students’ names, ID numbers or grades, is `high` at least, and `very-high` data reaches only models on UBC’s own hardware. The earlier names are still accepted, each meaning one level: `public` is `low`, `internal` is `medium`, `confidential` is `very-high`. `internal` when absent.',
    ),
  ```
  `src/spec/index.ts`: export `LEVELS`, `LEVEL_ALIASES`, `CLASSIFICATIONS`, `DEFAULT_LEVEL`, `toLevel`, `canonicalLevel`, `levelName`,
  `levelWords` beside `CLASSIFICATION_RANK`, and `type Level` beside `Classification`.
- [ ] **Step 4: Implement — every reader level-safe, behaviour unchanged** (*C1*):
  - `ai/models.ts:37`: `const building = toLevel(floor) === 'very-high' && builder === 'capable'` (Task 4 makes it S4's);
  - `ai/models.ts:57-60`: `asClassification` by `Object.hasOwn(CLASSIFICATION_RANK, value)`, still answering the value as stored (Task 2
    makes it the level) — `in` found `toString`;
  - `api/routes/releases.ts:1253`: `toLevel(await environmentFloor(deps.db, environment)) === 'very-high'` (Task 5 makes it S9's);
  - `launch/assessment.ts:97`: `const staysOnPremise = (ceiling: Classification) => toLevel(ceiling) === 'very-high'`; `:207`:
    `staysOnPremise(ceiling)`;
  - `ai/gateway-models.ts:134-135`: `toLevel(e.classification) === 'very-high'`.

  Then `grep -rn "=== 'confidential'\|=== 'internal'\|=== 'public'" packages/control-plane/src --include='*.ts' | grep -v '\.test\.ts'`
  answers NOTHING. Any line it finds is a reader this list missed: make it level-safe here, and record it.
- [ ] **Step 5: Run each file — green.** Then **read the emitted node** (`manifestYamlSchema().properties.data`): if the path differs from
  the test's, the test follows the emitted document.
- [ ] **Step 6: The contract.** `src/api/contract/document.ts`: `CONTRACT_VERSION = '1.7.0'`, and a paragraph after `1.6.0`'s:
  ```ts
   * **`1.7.0` SINCE THE U1 PLAN'S TASK 1 (<Task 1's commit date, from `date`>)**: `data.classification` takes UBC's four U1
   * levels — `low`, `medium`, `high`, `very-high` — beside the three earlier names, which stay valid for ever as aliases (`public`
   * is `low`, `internal` is `medium`, `confidential` is `very-high`). **The behaviour change, stated, as Tasks 2–6 land on this one
   * bump:** the default becomes `medium` (`internal`'s level); the platform ANSWERS in U1's names — `getSpec`'s
   * `data.classification` and every release's frozen `classification` read `medium` where they read `internal`, old rows too; a
   * delegated token is refused staging's and production's Incidents on every project at `high` or above
   * (`INCIDENT_LOG_CONFIDENTIAL`), whatever the building agent's setting; and `ai.models_withdrawn` is a new event. A client that
   * compares a classification must compare the level, never the string. Nothing is published between this plan's tasks.
  ```
  `packages/contract/package.json:3`: `"version": "1.7.0"`. Then `pnpm contract:write` (TRUNCATES), `pnpm contract:generate`,
  `pnpm docs:write`. `git diff --stat packages/contract docs/api` names `openapi.json`, `src/schema.d.ts`,
  `docs/api/reference/manifest-yaml.md` and `llms.txt`, and nothing it should not.
- [ ] **Step 7: The mock and the four gates.** `pnpm typecheck` covers `packages/mock`: the enum only grew, so nothing there moves
  (`grep -n "ManifestYaml" packages/mock/src` to be sure). Then all four gates — **every pre-existing test green, unedited** (this task
  changes no existing answer): a red one is a reader Step 4 missed.
- [ ] **Step 8: THE NOTICE to the front-end, before the commit.** `ListAgents`; message its live `manifest-app-…` session:
  > *"Contract 1.7.0 lands in the next commit (the U1 plan, Task 1). `ManifestYaml`'s `data.classification` now accepts UBC's U1 levels —
  > low | medium | high | very-high — and still the old three, each an alias with one meaning (public=low, internal=medium,
  > confidential=very-high). Coming in the next commits, all on 1.7.0: the default becomes medium; the platform ANSWERS in U1's names
  > (getSpec and a release's classification read `medium` where they read `internal`, old rows too); a token is refused staging's and
  > production's Incidents on any project at `high` or above, whatever the builder setting (still 403 INCIDENT_LOG_CONFIDENTIAL); a new
  > event, ai.models_withdrawn; the mock gains MANIFEST_MOCK_LEVEL beside MANIFEST_MOCK_CONFIDENTIAL. Nothing you compare changes: you key
  > off the code and model names. **Your docs/api-findings.md:72 and :1696 name 1.7.0 for FE-46/47/5's breaks, and the FE-46/47/5 plan's
  > :1052 ties your F5b Task 5 to 'the break of 1.7.0': those breaks now arrive as 1.8.0** (the coordinator moves that plan's number;
  > your code keys nothing off the version). THE ASK (yours to schedule, by your own plan): your agents and words in U1's names —
  > lead.ts:42, 54, 125, 243-245 (very-high means on premises only; declare a level every time; any personal information is high),
  > build/round.ts:590-591, 666, 705-709, 1471, 1602, api/progress.ts:181, 289-291, api/round-state.ts:27, platform/instances.ts:40-48,
  > 108-112 (the 403 now arrives for high projects too), web/src/words.ts:396-453, screens/building/needs.tsx:185. Hold Vitest and Docker
  > on your side until I say FREE?"*

  Commit after its reply or a fair wait (and FREE it after). *M7: the 1.8.0 sentence.*
- [ ] **Step 9: Commit by name**, then **the negative controls**, each committed first, broken, seen red where predicted, restored:
  - **(a)** `CLASSIFICATION_RANK.confidential` set to `2`: predict red at *ranks EVERY alias exactly at its level* only;
  - **(b)** `canonicalLevel` written with `in`: predict red at *no prototype name is a level* (`toString`);
  - **(c)** `releases.ts:1253` back to `=== 'confidential'`: predict red at the incidents *written very-high* case ONLY — every
    `confidential` case stays green, which is why that case exists;
  - **(d)** `assessment.ts:97` back to `=== 'confidential'`: predict red at the two *very-high* assessment cases only; **`:219` stays
    GREEN** — its `CATALOGUE` keeps the alias `confidential` (Decision 10), so the string still matches (*M3*). Recorded as the alias path
    doing its job, not as a control that cannot fail: the *very-high* cases are what see it.
  ```bash
  git commit -m "feat(spec): UBC's U1 levels accepted beside the old three, ranked at their level, and every reader compared by level — no answer changes yet; contract 1.7.0 (U1 plan Task 1, C1)"
  ```

---

## Task 2: The switch — stored and answered as the level, in U1's words (S5, S6)

**Re-cut by *C1*** (Decision 13): this is the FIRST task to store or answer a U1 name for an old input, and it lands only after Task 1
made every reader level-safe — so the builder exception and the token rule hold through it. **It changes answers, not rules**: no
refusal moves; every moving expectation below is a value or a sentence, named with its predicted red.

**Its callers**: `manifestSchema` (every validation now stores the level); the floors (`classificationFloor`, `environmentFloor` — every
agent session, the Incident safeguard); the catalogue (every validation, deploy, session, assessment); the sensitive diff (every
validation and production deploy); `getSpec` and `toRelease` (every read of a spec or release); the narrowing sentence
(`sessions.ts:650`); the privacy assessment.

**Files:**
- Modify: `src/spec/schema.ts:258-264` (the transform, the default, the description's last sentence; `specInLevels`), `src/spec/index.ts`;
  `src/ai/models.ts:47-60, 76-105, 117-140`; `src/ai/catalogue.ts:98-115`; `src/ai/capable.ts:159-169` (`capableFloor` from the level);
  `src/ai/sessions.ts:640-654` (the floor in words); `src/spec/diff.ts:220-260, 553-556`; `src/launch/assessment.ts:93-94, 190-220,
  :267, 355-395` (the level in words); `src/api/representations/releases.ts:138`; `src/api/routes/project-reads.ts:717, 745-750`;
  `src/api/routes/releases.ts` (the twelve examples); `src/api/routes/launch-examples.ts:388-401, 477`;
  `packages/mock/src/fixtures.ts:1310-1315, 1400`; `packages/journey/src/frontend.ts:1104-1105`
- Test: `src/spec/levels.test.ts`, `src/spec/schema.test.ts:19`, `src/api/contract/manifest-yaml.test.ts`, `src/spec/diff.test.ts`,
  `src/ai/models.test.ts`, `src/ai/catalogue.test.ts`, `src/ai/capable.test.ts:211, :517, :551`, `src/api/agents.test.ts:303, :853,
  :1063`, `src/launch/assessment.test.ts:202, 213, 219, 235, 354, 357`; Create: `src/api/levels.test.ts`
- Docker expectations (*C1*, *I5*): `src/ai/ai-path.docker.test.ts:263-267, :274-276`, `src/ai/capable.docker.test.ts:181-185`

**Interfaces:**
- Consumes: Task 1's `toLevel`, `canonicalLevel`, `levelName`, `levelWords`, `DEFAULT_LEVEL`, `Level`.
- Produces:
  - `classificationFloor(db, projectId): Promise<Level>` and `environmentFloor(db, environment): Promise<Level>` — canonical;
  - `ModelEntry.maxClassification` holds a canonical value (its type stays `Classification`, Decision 1);
  - `specInLevels(parsed: unknown): Record<string, unknown>` (`spec/schema.ts`).

- [ ] **Step 1: The failing tests.**
  `src/spec/levels.test.ts` — Task 1's *stores what is WRITTEN* case is REPLACED by:
  ```ts
  it('stores the LEVEL — an alias as what it means (S6; U1 plan Task 2)', () => {
    const cases: [string, string][] = [
      ['low', 'low'], ['medium', 'medium'], ['high', 'high'], ['very-high', 'very-high'],
      ['public', 'low'], ['internal', 'medium'], ['confidential', 'very-high'],
    ]
    for (const [written, stored] of cases) {
      const r = declaring(written)
      expect(r.success, written).toBe(true)
      if (r.success) expect(r.data.data.classification, written).toBe(stored)
    }
  })
  it('defaults an undeclared app to medium — internal’s level, so nothing changes (S5)', () => {
    const r = declaring(undefined)
    expect(r.success && r.data.data.classification).toBe('medium')
  })
  it('specInLevels answers a stored spec with its level, and leaves everything else as stored', () => {
    expect(specInLevels({ name: 'x', data: { classification: 'internal', retention_days: 30 } })).toEqual({
      name: 'x',
      data: { classification: 'medium', retention_days: 30 },
    })
    expect(specInLevels({ data: { classification: 'secret' } })).toEqual({ data: { classification: 'secret' } })
    expect(specInLevels({ name: 'y' })).toEqual({ name: 'y' })
  })
  ```
  `src/ai/models.test.ts` (its `spec` and `servingProduction` helpers):
  ```ts
  describe('the floors answer a stored name as its LEVEL (U1 plan Task 2)', () => {
    it('reads an old manifest’s alias as its level, and a U1 name as itself — medium when none', async () => {
      await withProject(async (tx, ctx) => {
        expect(await classificationFloor(tx, ctx.projectId)).toBe('medium')
        await spec(tx, ctx.projectId, { classification: 'confidential', valid: true, at: '2026-01-01T00:00:00Z' })
        expect(await classificationFloor(tx, ctx.projectId)).toBe('very-high')
        await spec(tx, ctx.projectId, { classification: 'high', valid: true, at: '2026-01-02T00:00:00Z' })
        expect(await classificationFloor(tx, ctx.projectId)).toBe('high')
      })
    })
    it('an old frozen confidential release floors very-high above a high manifest — the alias never widens (Review Focus 1)', async () => {
      await withProject(async (tx, ctx) => {
        await servingProduction(tx, ctx, 'confidential')
        await spec(tx, ctx.projectId, { classification: 'high', valid: true, at: '2026-02-01T00:00:00Z' })
        expect(await classificationFloor(tx, ctx.projectId)).toBe('very-high')
      })
    })
    it('a stored value that names no level — toString included — is none: the default stands', async () => {
      await withProject(async (tx, ctx) => {
        await spec(tx, ctx.projectId, {
          classification: 'toString' as Classification, valid: true, at: '2026-01-01T00:00:00Z',
        })
        expect(await classificationFloor(tx, ctx.projectId)).toBe('medium')
      })
    })
  })
  ```
  `src/ai/catalogue.test.ts`:
  ```ts
  it('lists each entry at its LEVEL — config.yaml’s alias as what it means (U1 plan Task 2)', async () => {
    const client = { get: vi.fn(async () => RESPONSE) } as unknown as LiteLlmClient
    const snapshot = await loadModelCatalogue(client)
    expect(snapshot.models.map((m) => [m.name, m.maxClassification])).toEqual([
      ['default-chat', 'medium'],
      ['default-chat-onprem', 'very-high'],
      ['default-embed', 'medium'],
    ])
  })
  it('lists a U1 name as itself, and still excludes toString and a typo', async () => {
    const body = {
      data: [
        { model_name: 'gw-high', model_info: { max_classification: 'high', mode: null, id: 'a' } },
        { model_name: 'rogue', model_info: { max_classification: 'toString', mode: null, id: 'b' } },
        { model_name: 'typo', model_info: { max_classification: 'High', mode: null, id: 'c' } },
      ],
    }
    const client = { get: vi.fn(async () => body) } as unknown as LiteLlmClient
    const snapshot = await loadModelCatalogue(client)
    expect(snapshot.models).toEqual([{ name: 'gw-high', maxClassification: 'high', kind: 'chat' }])
    expect(snapshot.unclassified).toEqual(['rogue', 'typo'])
  })
  ```
  `src/spec/diff.test.ts` — **its `DEFAULTS` is declared inside two blocks (`:163`, `:374`), so this describe declares its own, with the
  same value** (*M14*):
  ```ts
  describe('a level compared as a level (U1 plan Task 2; Review Focus 2)', () => {
    const DEFAULTS = { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' } // `:163`'s
    /** A spec as an OLD row holds it — its alias kept — as `api/spec-validation.ts:78` reads it back. */
    const stored = (classification: string): ManifestSpec =>
      ({ ...base(), data: { ...base().data, classification } }) as ManifestSpec

    it('a rename from an alias to its level is NOT sensitive — internal → medium re-escalates nothing', () => {
      expect(isSensitiveDiff(stored('internal'), base({ data: { classification: 'medium' } }))).toEqual({
        sensitive: false,
        fields: [],
      })
      expect(isSensitiveDiff(stored('confidential'), base({ data: { classification: 'very-high' } })).sensitive).toBe(false)
    })
    it('a real change of level IS sensitive, in either direction — the positive control', () => {
      expect(isSensitiveDiff(stored('internal'), base({ data: { classification: 'high' } })).fields).toEqual([
        'data.classification',
      ])
      expect(isSensitiveDiff(stored('confidential'), base({ data: { classification: 'high' } })).fields).toEqual([
        'data.classification',
      ])
    })
    it('a frozen release’s alias equals the same level in a new spec', () => {
      const release = sensitiveViewOfRelease(
        { ...resolveConfig(base(), 'production', DEFAULTS), classification: 'internal' } as ResolvedConfig,
        'node-ts-mongo@2',
      )
      expect(sensitiveFieldsBetween(release, sensitiveViewOfSpec(base()))).toEqual([])
    })
    it('describes a change of level in U1’s names', () => {
      const before = { ...resolveConfig(base(), 'production', DEFAULTS), classification: 'internal' } as ResolvedConfig
      const after = resolveConfig(base({ data: { classification: 'high' } }), 'production', DEFAULTS)
      expect(describeDiff(before, after).filter((c) => c.path === 'data.classification')).toEqual([
        { path: 'data.classification', from: 'medium', to: 'high', summary: 'now declares high data instead of medium' },
      ])
      expect(
        describeDiff(before, { ...before, classification: 'medium' }).filter((c) => c.path === 'data.classification'),
      ).toEqual([])
    })
  })
  ```
  *(`resolveConfig(spec, kind, defaults)`, `resolve.ts:106-109`; `describeDiff(before, after)`, `diff.ts:496-499`.)*

  `src/api/levels.test.ts` (new; `withProjectServer` from `api/testing.ts`, as `api/incidents.test.ts` uses it):
  ```ts
  describe('the platform answers in U1’s names — old rows too (S6; U1 plan Task 2)', () => {
    it('getSpec answers an old row’s alias as its level', async () => {
      await withProjectServer(async (ctx) => {
        await ctx.db.insert(appSpecs).values({
          projectId: ctx.projectId,
          commitSha: ctx.commitSha,
          parsed: { manifest: 1, name: 'x', data: { classification: 'internal', retention_days: 365 } },
          schemaVersion: 1,
          valid: true,
          createdAt: new Date(Date.now() + 1000),
        })
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/v1/projects/${ctx.projectId}/spec`,
          cookies: ctx.ownerCookies,
        })
        expect(res.statusCode, res.body).toBe(200)
        expect((res.json() as { spec: { data: { classification: string } } }).spec.data.classification).toBe('medium')
      })
    })
    it('a release frozen confidential is answered very-high in every environment', async () => {
      await withProjectServer(async (ctx) => {
        const releaseId = await frozenRelease(ctx, 'confidential')
        const res = await ctx.app.inject({ method: 'GET', url: `/v1/releases/${releaseId}`, cookies: ctx.ownerCookies })
        expect(res.statusCode, res.body).toBe(200)
        const config = (res.json() as { config: Record<string, { classification: string }> }).config
        expect(Object.values(config).map((c) => c.classification)).toEqual(['very-high', 'very-high', 'very-high'])
      })
    })
  })
  ```
  `frozenRelease(ctx, classification)` writes a build and a release whose `resolvedConfig` is each environment's full frozen config —
  `resolveConfig(manifestSchema.parse(minimal), kind, { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' })` for each kind, then `classification`
  overridden — because `toRelease` reads every field of it (the insert shape: `incidents.test.ts:24-74`).

  **EXPECTATIONS THAT MOVE, each with its predicted red** (*C1*, Read this first 24) — edit each, and watch each go red BEFORE Step 3 by
  running its file:
  - `spec/schema.test.ts:19` → `'medium'` (red: `'internal'`); `manifest-yaml.test.ts`'s `node.default` → `'medium'` (red: `'internal'`);
  - `ai/models.test.ts:163-198`: *"…internal when there is none"* → *medium*, and its floors `'internal'` → `'medium'`, `'public'` →
    `'low'`, `'confidential'` → `'very-high'` (red at each: the floor answered as stored);
  - `ai/catalogue.test.ts`: any case asserting `RESPONSE`'s `'internal'` / `'confidential'` → `'medium'` / `'very-high'`;
  - `ai/capable.test.ts:211` → `maxClassification: 'medium'`; `:517` → *"classified 'low'"*; `:551` → *"below 'medium'"* (red: the
    catalogue's value, and `capableFloor`'s start, answered as stored). `:48` (the create body's `'internal'`) does NOT move here: the
    registration still writes `CAPABLE_CLASSIFICATION` until Task 4;
  - `api/agents.test.ts:303` and `:853` (`internalOnlyCatalogue()`): the filter → `m.maxClassification === 'medium'`, **and each gains
    `expect(models.length).toBeGreaterThan(0)` on the filtered list** — without the filter's edit the catalogue is EMPTY and `:303`
    stays GREEN for the wrong reason (*C1*): the new assertion is what goes red;
  - `api/agents.test.ts:1063` → *"…because the project is now very high; …"* (red: `sessions.ts:650` prints the canonical floor through
    `levelWords`);
  - `api/agents.test.ts:1166-1170` — **must STAY GREEN** (the committed `confidential` now floors `'very-high'`; Task 1's level-safe
    exception keeps `default-chat-large`). Red here means Task 1's rename is missing;
  - `launch/assessment.test.ts:202` → *"Medium — every AI model the app uses must be approved for medium data."*; `:213` → *"Approved for
    medium data at most: …"*; `:219` → *"Approved for very high data: it runs on on-premise hardware, so what the app sends it stays
    there."*; `:235` → *"Medium — Manifest’s default, …approved for medium data."*; `:354` → *"Approved for medium data at most."*; `:357` →
    *"Approved for very high data at most."* (red at each: the words print the stored name);
  - **Docker** (run in Step 5): `ai/ai-path.docker.test.ts:267` → `expect(LEVELS).toContain(entry.maxClassification)` — ANY canonical
    level, because the shared LiteLLM's row is whatever the running control plane registered, `high` once Rich sets it (*I5*; the tier's
    shell has the setting unset by rule, so it cannot name it); `:274-276` → `toBe(canonicalLevel(from.model_info?.max_classification))`;
    `ai/capable.docker.test.ts:183` → `'medium'`.
- [ ] **Step 2: Run — predict red**, file by file: the new cases at the values answered as stored (`'internal'`, `'confidential'`,
  `'toString'`), the diff at *NOT sensitive* and at `from: 'internal'`, `specInLevels` (`undefined` is not a function), `api/levels.test.ts`
  at `'internal'` and `'confidential'`; and each moved expectation as listed.
- [ ] **Step 3: Implement.**
  - **`spec/schema.ts`** — the field becomes:
    ```ts
    classification: z
      .enum(CLASSIFICATIONS)
      .default(DEFAULT_LEVEL)
      // THE LEVEL, NEVER THE ALIAS (S6): what is stored says what it means. The OUTPUT type stays the seven names on
      // purpose (the U1 plan's Decision 1): every reader ranks through CLASSIFICATION_RANK, which holds all seven.
      .transform((name): Classification => toLevel(name))
      .describe(/* Task 1's words, its last sentence now: "`medium` when absent." */),
    ```
    and `specInLevels`:
    ```ts
    /** A stored `parsed` manifest as the platform answers it (S6): `data.classification` as its level; everything else as stored. */
    export function specInLevels(parsed: unknown): Record<string, unknown> {
      const spec = (parsed ?? {}) as Record<string, unknown>
      const data = spec.data as Record<string, unknown> | undefined
      const level = canonicalLevel(data?.classification)
      return data === undefined || level === undefined ? spec : { ...spec, data: { ...data, classification: level } }
    }
    ```
    If the description is not on the emitted `classification` node (an effect's description may land elsewhere), move `.describe()`
    onto the inner `z.enum(…)`; `manifest-yaml.test.ts` decides.
  - **`ai/models.ts`**: `DEFAULT_CLASSIFICATION` becomes `DEFAULT_LEVEL` (imported); `asClassification` becomes `const asLevel = (value:
    unknown): Level | undefined => canonicalLevel(value)`; the floors answer `Promise<Level>`; `:37` keeps Task 1's level-safe line.
  - **`ai/catalogue.ts:98-115`**: `const level = canonicalLevel(row.model_info?.max_classification)`; unclassified when `undefined`;
    `maxClassification: level`.
  - **`ai/capable.ts:165-169`**: `capableFloor` reduces from `toLevel(CAPABLE_CLASSIFICATION)` (Task 4 replaces the constant), so its
    refusal names `'medium'`, never `'internal'`.
  - **`ai/sessions.ts:640-654`**: `the project is now ${levelWords(floor)}` — its second clause (the builder) is Task 4's words.
  - **`spec/diff.ts`**: `sensitiveViewOfSpec` (`:227`) and `sensitiveViewOfRelease` (`:250`) set `classification: levelName(…)`;
    `describeDiff`'s `valueChange('data.classification', …)` (`:552-557`) passes `levelName(before.classification)` and
    `levelName(after.classification)`, and its summary names them.
  - **`launch/assessment.ts`**: `capitalised` (`:93-94`) is replaced by `Words(value)` — `levelWords` with its first letter upper-cased —
    and every printed level goes through `levelWords`: `modelFlow`'s two sentences (*"Approved for very high data: it runs on…"*,
    *"Approved for ${levelWords(max)} data at most: it may be answered…"*), `flows`' fact and rule, `hosting` (`:381`) and its gap
    (`:390`), and **`:267`** (*"Manifest treats it as ${levelWords(…)}"*, *M1*). Task 3 adds the `high` sentence.
  - **`api/routes/project-reads.ts:749`**: `spec: specInLevels(latest.parsed)`; its example (`:717`) `classification: 'medium'`.
  - **`api/representations/releases.ts:138`**: `classification: levelName(c.classification)`.
  - **`api/routes/releases.ts`**: the twelve examples' `classification: 'internal'` → `'medium'`.
  - **`api/routes/launch-examples.ts:388-401, 477`** and **`packages/mock/src/fixtures.ts:1310-1315, 1400`**: the PIA's words as the
    assessment now prints them — the mock's *Low* line is already right; its *"default-chat: Approved for internal data at most…"*
    (twice) reads *medium*. Contract and mock in the SAME commit.
  - **`packages/journey/src/frontend.ts:1104-1105`**: `=== 'very-high'` (its check's words: *"the release is frozen very-high (the
    manifest says confidential, its alias)"*).
- [ ] **Step 4: Run each unit file — green**, one at a time; then `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write`, and
  the four gates.
- [ ] **Step 5: The two Docker files whose expectations this task moves, ALONE, before the commit** (*C1*; never beside Vitest):
  `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/ai/ai-path.docker.test.ts`, then the same for
  `src/ai/capable.docker.test.ts`. Green, or the edit is wrong. The whole tier runs once at the sitting's close.
- [ ] **Step 6: Commit by name** — one line to the front-end's session first (*"the switch: getSpec and releases answer levels; the
  default is medium; the mock's PIA says medium"*) — then **the negative controls**:
  - **(a)** `asLevel` back to Task 1's `Object.hasOwn(…) ? value : undefined` (answering the stored name): predict red at the three new
    floor cases and at `agents.test.ts:1063` — and **`agents.test.ts:1166-1170` stays GREEN** (Task 1's level-safe exception reads either
    name): recorded as the order working;
  - **(b)** `sensitiveViewOfSpec`'s `levelName` removed: predict red at *a rename … is NOT sensitive* only — the positive control stays
    green;
  - **(c)** `getSpec`'s `specInLevels` removed: predict red at *getSpec answers an old row's alias as its level* only;
  - **(d)** `agents.test.ts:303`'s filter left at `'internal'`: predict red at its new non-empty assertion only.
  ```bash
  git commit -m "feat(spec,ai): the switch — stored and answered as the level, in U1's words; old rows too; default medium (U1 plan Task 2, S5, S6, C1)"
  ```

---

## Task 3: D17 in U1's words — the refusal hint (E14), the deploy-time refusal, a `high` model's zero-retention sentence, intake, the blueprint and the guides

**Its callers**: `checkPolicy` (every validation), `deployRelease`'s D17 re-check (every deploy), `draftPrivacyAssessment` (the owner's
launch errand), `startIntakeSession` (every intake). And every agent that writes a `manifest.yaml`: the blueprint's starter and
AGENTS.md, and the two guides.

**Files:**
- Modify: `src/spec/policy.ts:207-217`, `src/releases/release.ts:1093-1105`, `src/launch/assessment.ts:190-200` (the `high` sentence;
  the level words are Task 2's, *C1*), `src/ai/intake.ts:60-70`, `src/api/error-codes.ts:852, 854` and `src/api/routes/intake.ts:48`
  (*M1*: *"approved for internal data"* → *medium*)
- Modify: `blueprints/node-ts-mongo/starters/proof-app/manifest.yaml:55-64` and its `README.md:62, 83-84`,
  `blueprints/node-ts-mongo/agents/AGENTS.md:209-211`, `docs/api/agents.md`, `docs/api/frontend.md`
- Test: `src/spec/policy.test.ts`, `src/launch/assessment.test.ts`, `src/releases/releases.test.ts` (the deploy-time case beside
  `:2970`'s), `src/ai/intake.test.ts`

**Interfaces:**
- Consumes: Task 1's `levelName`, `toLevel`; Task 2's canonical catalogue and `levelWords` in the assessment.
- Produces: nothing new; the words of four refusals and one document.

- [ ] **Step 1: The failing tests.** `src/spec/policy.test.ts` (its `ctx` holds `default-chat-onprem` at `confidential` and
  `default-chat`/`default-embed` at `internal` — aliases, deliberately):
  ```ts
  describe('D17 in UBC’s U1 levels (U1 plan Task 3)', () => {
    const ctxWithHigh: ValidationContext = {
      ...ctx,
      modelCatalogue: [...ctx.modelCatalogue, { name: 'gw-high', maxClassification: 'high' }],
    }
    const declaring = (level: string, models: string) =>
      yaml(`ai:\n  models: [${models}]\n  budget:\n    project_monthly_usd: 10\ndata:\n  classification: ${level}`)

    it('the aliases never widen: confidential is refused a high entry; very-high too (Review Focus 1)', () => {
      expect(errorCodes(declaring('confidential', 'gw-high'), ctxWithHigh)).toEqual(['SPEC_MODEL_CLASSIFICATION_TOO_LOW'])
      expect(errorCodes(declaring('very-high', 'gw-high'), ctxWithHigh)).toEqual(['SPEC_MODEL_CLASSIFICATION_TOO_LOW'])
      // The positive control: the same entry is valid for a high app, and an on-premise one for a very-high app.
      expect(errorCodes(declaring('high', 'gw-high'), ctxWithHigh)).toEqual([])
      expect(errorCodes(declaring('confidential', 'default-chat-onprem'), ctxWithHigh)).toEqual([])
    })
    it('an entry at internal does not satisfy a high app; one at confidential satisfies a very-high app', () => {
      expect(errorCodes(declaring('high', 'default-chat'))).toEqual(['SPEC_MODEL_CLASSIFICATION_TOO_LOW'])
      expect(errorCodes(declaring('very-high', 'default-chat-onprem'))).toEqual([])
    })
    it('an undeclared app still validates default-chat — medium is internal’s level (S5)', () => {
      expect(errorCodes(yaml(`ai:\n  models: [default-chat]\n  budget:\n    project_monthly_usd: 10`))).toEqual([])
    })
    it('the refusal speaks in levels, names U1, and states no law (E14)', () => {
      const r = validateSpec(declaring('confidential', 'default-chat'), ctx)
      expect(r.valid).toBe(false)
      const error = r.valid ? undefined : r.errors.find((e) => e.code === 'SPEC_MODEL_CLASSIFICATION_TOO_LOW')
      expect(error?.message).toBe('"default-chat" may not process very-high data')
      expect(error?.hint).toBe(
        '"default-chat" is approved for medium data at most, and this app declares very-high. Choose a model approved ' +
          'for very-high data, or lower data.classification if it overstates the app’s data: the levels are UBC’s own ' +
          '(Information Security Standard U1). Which models may receive each level is the platform’s catalogue to say, ' +
          'and whether an app may use them, the Privacy Office’s.',
      )
      expect(error?.hint).not.toMatch(/BC public body|outside Canada|internal|confidential/)
    })
  })
  ```
  `src/releases/releases.test.ts`, beside the case at `:2970` (*"Approved for `internal` when validated; `public` only now"*): the same
  refusal for a release frozen `confidential` whose model is now `high` — `RELEASE_MODEL_CLASSIFICATION_TOO_LOW`, its message
  *"the model '<name>' is now approved only up to high data, and this app declares very-high (D17)"* — and its positive control, the same
  release deployed while the model is `very-high`. *(Copy the existing case's setup: it lowers a catalogue entry between validation and
  deploy.)*

  `src/launch/assessment.test.ts` — the level words moved at Task 2; this task adds the `high` model's sentence (Review Focus 6). Its
  `input` is a FUNCTION (`:43`) taking overrides, and `section` and `valueOf` are its own (*M14*):
  ```ts
  const highSpec = (models: string[]) =>
    manifestSchema.parse({
      manifest: 1,
      name: 'lp-sample',
      blueprint: 'node-ts-mongo@1',
      runtime: { port: 3000 },
      ai: { models },
      data: { classification: 'high', retention_days: 180 },
    })
  it('a very-high app’s rule is on-premise hardware, printed as a person reads it (Review Focus 6)', () => {
    const spec = manifestSchema.parse({ ...BARE_INPUT, data: { classification: 'confidential' } })
    const flows = section(assembleAssessment(input({ spec })), 'flows')
    expect(valueOf(flows, 'Classification')?.value).toBe(
      'Very high — every AI model the app uses must run on on-premise hardware.',
    )
  })
  it('a high model may leave UBC to a provider that keeps nothing — the zero-retention sentence (Review Focus 6)', () => {
    const flows = section(
      assembleAssessment(
        input({
          spec: highSpec(['gw-high']),
          catalogue: [...CATALOGUE, { name: 'gw-high', maxClassification: 'high', kind: 'chat' }],
        }),
      ),
      'flows',
    )
    expect(valueOf(flows, 'gw-high')?.value).toBe(
      'Approved for high data at most: it may be answered by a provider off-premise that keeps none of what it is sent ' +
        '(zero data retention), as the platform’s administrator attests, so what the app sends it may leave UBC but is not kept there.',
    )
    expect(valueOf(flows, 'Classification')?.value).toBe(
      'High — every AI model the app uses must be approved for high data.',
    )
  })
  ```
  *(`BARE_INPUT` is Task 1's constant, `BARE`'s input object.)*

  `src/ai/intake.test.ts`: the refusal's message names *medium* — `INTAKE_MODEL_UNAVAILABLE`, its message containing *"approved for
  medium data"* — with an entry lowered to `public` (the alias, so `low`); and its positive control at `internal`. The code's published
  summary and remedy (`error-codes.ts:852, 854`) and the intake route's description (`routes/intake.ts:48`) say *medium* too; the
  contract's regeneration carries them (*M1*).
- [ ] **Step 2: Run — predict red**: `policy.test.ts` red at the hint (its message is already canonical since Task 2, so *"may not process
  very-high data"* is GREEN) — and green at the four rank cases, which Tasks 1–2 already made right: **if the two "never widen" cases
  are red here, a rank is wrong; stop and read it**; `assessment.test.ts` red at the `high` model's sentence only (the very-high case is
  green since Task 2 — it is here as Review Focus 6's statement); `releases.test.ts` red at the message only if Task 2 left it raw;
  `intake.test.ts` red at *medium*.
- [ ] **Step 3: Implement.**
  - **`spec/policy.ts:207-217`** (E14), each value through `levelName`:
    ```ts
    if (CLASSIFICATION_RANK[entry.maxClassification] < appRank) {
      const declared = levelName(spec.data.classification)
      errors.push({
        code: POLICY_CODES.MODEL_CLASSIFICATION_TOO_LOW,
        path: `ai.models.${i}`,
        message: `"${model}" may not process ${declared} data`,
        hint:
          `"${model}" is approved for ${levelName(entry.maxClassification)} data at most, and this app declares ` +
          `${declared}. Choose a model approved for ${declared} data, or lower data.classification if it overstates ` +
          'the app’s data: the levels are UBC’s own (Information Security Standard U1). Which models may receive each ' +
          'level is the platform’s catalogue to say, and whether an app may use them, the Privacy Office’s.',
      })
    }
    ```
  - **`releases/release.ts:1102-1103`**: `` `the model '${name}' is now approved only up to ${levelName(entry.maxClassification)} data, ` +
    `and this app declares ${levelName(resolved.classification)} (D17)` ``.
  - **`launch/assessment.ts`** — beside Task 1's `staysOnPremise`:
    ```ts
    /** Approved for `high`: on premises, or at a provider that keeps none of what it is sent (§7's rule, attested). */
    const keepsNothing = (ceiling: Classification) => toLevel(ceiling) === 'high'
    ```
    `modelFlow`'s value gains a branch after `staysOnPremise`'s: `keepsNothing` → the zero-retention sentence the test names.
  - **`ai/intake.ts:64-68`**: `CLASSIFICATION_RANK.medium`, and *"…not a catalogue model approved for medium data…"*;
    **`api/error-codes.ts:852, 854`** and **`api/routes/intake.ts:48`** the same (*M1*).
  - **The blueprint.** `proof-app/manifest.yaml:55-64`:
    ```yaml
    data:
      # UBC's U1 level (Information Security Standard U1): the most sensitive information the app KEEPS or SENDS TO A
      # MODEL. The notes are course work, not personal records, and the app stores no UBC identifier at all — a note is
      # keyed on sha256(puid ‖ project ‖ environment). It asks CWL for givenName and sn to greet people by name, and
      # neither is kept nor sent to a model: it shows them and forgets them. So `medium`. An app that KEEPS a student's
      # name, ID or grades, or sends one to a model, is `high`, and `high` refuses `default-chat` at validation
      # (SPEC_MODEL_CLASSIFICATION_TOO_LOW): the gate working, as `make demo-ai`'s negative control (b) shows with
      # `confidential`.
      classification: medium
    ```
    The starter's `README.md:62` says `data.classification: medium`, and `:83-84` *"D17 approves both to `medium` — so a `high` or
    `very-high` declaration refuses them at validation"*. `AGENTS.md:209-211` gains, after rule 3: *"4. **Declare `data.classification` every time**, from UBC's four levels: `low` (public
    information), `medium` (internal, not personal), `high` (any personal information — students' names, ID numbers, grades) or
    `very-high` (health, government ID, financial records, passwords; on-premise models only). A model approved below it is refused when
    the manifest is validated."* **Its skeleton is read once, at boot** (TRAPS: a blueprint control without a restart cannot fail).
  - **The guides** — `docs/api/agents.md` and `docs/api/frontend.md`: wherever they teach writing `data.classification`, U1's four levels
    and the aliases in one sentence; *"a `confidential` app's `ai.models` must name on-premise models"* → *"a `very-high` app's (or
    `confidential`, its earlier name)"*. **The building agent's and the Incidents' sentences are Tasks 4's and 5's** — leave them.
  **The comment's claim, checked at writing** (*M13*): `proof-app/server.js:137-150` uses `givenName` and `sn` only to answer
  `/api/me`'s `displayName`; a note (`:155-160`) keeps the owner's HASH, the text and a time; a question sends the note's text and the
  hash (`:257-284`). Re-read those lines before committing: if the starter has come to keep or send a name, the comment is wrong and the
  starter is `high`; then tell the coordinator, because `high` refuses its `default-chat` and `default-embed`.
- [ ] **Step 4: Run each file — green**; then `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write` (the intake texts), the
  four gates. One line to the front-end's session before committing (*"intake's texts say medium"*).
- [ ] **Step 5: Commit by name**, then **the negative controls**:
  - **(a)** `keepsNothing` answering `false`: predict red at *a high model may leave UBC to a provider that keeps nothing* only. (The
    `staysOnPremise` control is Task 1's (d), with *M3*'s corrected prediction.)
  - **(b)** E14's old hint restored: predict red at *the refusal speaks in levels* only;
  - **(c)** the deploy-time message's `levelName` removed: predict red at its `releases.test.ts` case only.
  ```bash
  git commit -m "feat(spec,launch): D17 in UBC's U1 words — the refusal names the levels and states no law (E14), the assessment says very high stays on premises and high keeps nothing; the blueprint declares a level (U1 plan Task 3)"
  ```

---

## Task 4: The capable model's level as a setting, the builder exception by S4, and registration by level — never kept above it

**Its callers**: `index.ts`'s boot → `platformModelsAtBoot` → `gatewayModelsAtBoot`, `capableModelAtBoot` → `ensureCapableModel`,
`ensureCapableFallback`; and `agentModelsFor` (every agent session's models; `narrowSessionsHoldingMore` at every boot and raise).

**Files:**
- Modify: `src/config.ts:46-54, :355-376, :404-413, :580-600, :880-905`, `src/config.test.ts`
- Modify: `src/ai/capable.ts:36-40, 80-125, 159-205, 296-…`, `src/ai/registration.ts:60-66, 203-242`, `src/ai/gateway-models.ts:114-155,
  202-219`, `src/ai/models.ts:9-45`, `src/ai/sessions.ts:439, 636-657`, `src/index.ts:489-500, 565-572`
- Modify: `src/observability/event-schemas.ts:853, 868`, `src/api/representations/agents.ts:105`, `src/releases/summary.ts:85-88` and
  `src/api/spec-validation.ts:163-170` (comments), `.env.example:166, 172, 173, 178`,
  `docs/api/agents.md:21, 23, 28, 129`, `docs/api/frontend.md:34, 37, 96`, `docs/superpowers/RUNBOOK.md` (*The capable model*; `:299`
  and `:316-329`, *M1*)
- Modify (*I5*): `scripts/demo-gateway.sh:244-270` and `packages/journey/src/gateway.ts:495` — levels compared as levels
- Test: `src/ai/capable.test.ts` (with `:48` and every `ensureCapableFallback` / `ensureCapableModel` call given its now-required level),
  `src/ai/gateway-models.test.ts`, `src/ai/models.test.ts`, `src/config.test.ts`, `src/api/agents.test.ts:1299`,
  `src/ai/capable.docker.test.ts`

**Interfaces:**
- Consumes: Task 1's `CLASSIFICATIONS`, `toLevel`, `canonicalLevel`, `DEFAULT_LEVEL`; Task 2's canonical catalogue.
- Produces:
  - `config.litellm.capableClassification: Level` (from `MANIFEST_CAPABLE_MODEL_CLASSIFICATION`, default `'medium'`);
  - `config.litellm.gatewayModels[].classification` canonical (`Level`);
  - `ensureCapableModel(client, setting, gateway: Gateway | undefined, classification: Classification)` — the level REQUIRED (*I3*): a
    default would let `capable.ts:305` drop it and still compile;
  - `ensureCapableFallback(client, setting, classification: Classification)` — REQUIRED, for `capable.ts:319`'s same reason;
  - `capableModelAtBoot(client, setting, fallback, gateway, classification: Classification)` — REQUIRED;
  - `platformModelsAtBoot(client, { gatewayModels, capableModel, capableFallback, capableClassification }, gateway)`;
  - `refuseKeeping(client, ours, model, classification: Classification, reason)` — the level REQUIRED;
  - `agentModelsFor(catalogue, floor, builder)` — unchanged signature; the exception is `builder === 'capable'`.

- [ ] **Step 1: The failing tests.** `src/config.test.ts`:
  ```ts
  describe('MANIFEST_CAPABLE_MODEL_CLASSIFICATION (S3; U1 plan Task 4)', () => {
    it('is medium when absent or empty, and takes any of the seven names as its level', () => {
      expect(loadConfig({ ...base }).litellm.capableClassification).toBe('medium')
      expect(loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_CLASSIFICATION: '' }).litellm.capableClassification).toBe('medium')
      expect(loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_CLASSIFICATION: 'high' }).litellm.capableClassification).toBe('high')
      expect(loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_CLASSIFICATION: 'confidential' }).litellm.capableClassification).toBe('very-high')
    })
    it('refuses anything else by CONFIG_INVALID, naming the setting — never defaulted', () => {
      for (const value of ['High', 'restricted', 'zdr']) {
        expect(() => loadConfig({ ...base, MANIFEST_CAPABLE_MODEL_CLASSIFICATION: value }), value).toThrow(
          expect.objectContaining({ code: 'CONFIG_INVALID', message: expect.stringContaining('MANIFEST_CAPABLE_MODEL_CLASSIFICATION') }),
        )
      }
    })
  })
  describe('MANIFEST_GATEWAY_MODELS in U1’s names (U1 plan Task 4)', () => {
    it('takes each of the seven names after the last @, as its level', () => {
      expect(
        loadConfig({
          ...base,
          MANIFEST_GATEWAY_MODELS:
            'gw-a=ubc-ai-gateway/gpt-x@high, gw-b=ubc-ai-gateway/q@confidential, gw-c=ubc-ai-gateway/v@2025@very-high',
        }).litellm.gatewayModels.map((e) => [e.name, e.setting, e.classification]),
      ).toEqual([
        ['gw-a', 'ubc-ai-gateway/gpt-x', 'high'],
        ['gw-b', 'ubc-ai-gateway/q', 'very-high'],
        ['gw-c', 'ubc-ai-gateway/v@2025', 'very-high'],
      ])
    })
    it('still refuses an entry with no level, or a name that is none', () => {
      for (const entry of ['gw=ubc-ai-gateway/x', 'gw=ubc-ai-gateway/x@restricted', 'gw=ubc-ai-gateway/x@High']) {
        expect(() => loadConfig({ ...base, MANIFEST_GATEWAY_MODELS: entry }), entry).toThrow(
          expect.objectContaining({ code: 'CONFIG_INVALID' }),
        )
      }
    })
  })
  ```
  `src/ai/models.test.ts`:
  ```ts
  describe('the builder exception by S4 — the capable model at EVERY level above its own (U1 plan Task 4)', () => {
    const at = (capable: Classification): CatalogueSnapshot => ({
      models: [
        { name: 'default-chat', maxClassification: 'medium', kind: 'chat' },
        { name: 'default-chat-onprem', maxClassification: 'very-high', kind: 'chat' },
        { name: CAPABLE_MODEL_NAME, maxClassification: capable, kind: 'chat' },
      ],
      unclassified: [],
    })
    it('with the capable model at medium, a high project’s agent gets it while the setting is capable — and not on-premise', () => {
      expect(agentModelsFor(at('medium'), 'high', 'capable')).toEqual(['default-chat-onprem', CAPABLE_MODEL_NAME])
      expect(agentModelsFor(at('medium'), 'high', 'on-premise')).toEqual(['default-chat-onprem'])
    })
    it('with the capable model at high, a high project gets it either way — D17 allows it — and very-high only by the setting', () => {
      expect(agentModelsFor(at('high'), 'high', 'on-premise')).toEqual(['default-chat-onprem', CAPABLE_MODEL_NAME])
      expect(agentModelsFor(at('high'), 'very-high', 'on-premise')).toEqual(['default-chat-onprem'])
      expect(agentModelsFor(at('high'), 'very-high', 'capable')).toEqual(['default-chat-onprem', CAPABLE_MODEL_NAME])
    })
    it('never adds default-chat above medium — the exception is one model wide', () => {
      for (const floor of ['high', 'very-high'] as const) {
        expect(agentModelsFor(at('medium'), floor, 'capable')).not.toContain('default-chat')
      }
    })
  })
  ```
  `src/ai/capable.test.ts` (its `SETTING`, `capable(lite)`, `entry(lite, name, modelInfo)` and `withCapable()`; a fake deployment's
  level is `modelInfo.max_classification`, as `gateway-models.test.ts:55` reads it):
  ```ts
  describe('the capable model’s level is the setting’s (S3; U1 plan Task 4)', () => {
    it('registers the capable model at the level it is given', async () => {
      const lite = fakeLiteLlm()
      expect(await ensureCapableModel(lite, SETTING, undefined, 'high')).toEqual({ state: 'registered', model: SETTING })
      expect(capable(lite).map((d) => d.modelInfo.max_classification)).toEqual(['high'])
    })
    it('an alias row is UNCHANGED at its level — nothing re-created for its name (Review Focus 2)', async () => {
      const lite = fakeLiteLlm()
      await ensureCapableModel(lite, SETTING, undefined, 'internal') // as tonight's row was registered
      const before = lite.calls.length
      expect(await ensureCapableModel(lite, SETTING, undefined, 'medium')).toEqual({ state: 'unchanged', model: SETTING })
      expect(lite.calls.slice(before).filter((c) => c.path === '/model/new')).toEqual([])
      // The positive control: a real change of level registers.
      expect((await ensureCapableModel(lite, SETTING, undefined, 'high')).state).toBe('registered')
    })
    it('a fallback below the capable model’s level is refused — the floor moves with the setting', async () => {
      const lite = await withCapable()
      await entry(lite, 'probe-medium-chat', { max_classification: 'medium' })
      const refused = await ensureCapableFallback(lite, 'probe-medium-chat', 'high')
      expect(refused.state).toBe('refused')
      expect(refused.reason).toContain("below 'high'")
      expect((await ensureCapableFallback(lite, 'probe-medium-chat', 'medium')).state).toBe('set')
    })
  })
  ```
  **Expectations that move here** (each red before Step 3): `capable.test.ts:48`'s create body → `max_classification: 'medium'` (red:
  `'internal'`, the constant); every `ensureCapableModel(lite, x)` and `ensureCapableFallback(lite, x)` call in the file and in
  `capable.docker.test.ts` gains its level — `pnpm typecheck` lists them once the parameters are required (*I3*); **`api/agents.test.ts:1299`**
  → *"…because the platform no longer lets the agent that builds a project at this level use the capable model — its setting, or the
  capable model's level, changed; …"* (red: the old clause). *(`:551` moved at Task 2.)*

  `src/ai/gateway-models.test.ts` (with Task 3 of the gateway plan's `GW`):
  ```ts
  it('a level LOWERED while its re-registration is refused leaves the catalogue — never kept higher (I1; Review Focus 3)', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/gpt-x', 1e-6)
    await ensureGatewayModels(lite, [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'high' }], GW)
    expect((await loadModelCatalogue(lite)).models.find((m) => m.name === 'gw-zdr')?.maxClassification).toBe('high')
    lite.price('openai/gpt-x', 0) // LiteLLM restarted offline: it prices gpt-* at 0 (registration.ts:91-93)
    const r = await ensureGatewayModels(lite, [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'medium' }], GW)
    expect(r.models).toEqual([expect.objectContaining({ name: 'gw-zdr', state: 'refused' })])
    const after = await loadModelCatalogue(lite)
    expect(after.models.map((m) => m.name)).not.toContain('gw-zdr')
    // A high app is refused it — unknown now, which fails closed (Decision 6).
    expect(errorCodes(highAppUsing('gw-zdr'), validationContextFor(after))).toEqual(['SPEC_MODEL_UNKNOWN'])
  })
  it('a refusal KEEPS a working registration at or below the level asked for — the positive control', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/gpt-y', 1e-6)
    await ensureGatewayModels(lite, [{ name: 'gw-y', setting: 'ubc-ai-gateway/gpt-y', classification: 'medium' }], GW)
    lite.price('openai/gpt-y', 0)
    const r = await ensureGatewayModels(lite, [{ name: 'gw-y', setting: 'ubc-ai-gateway/gpt-y', classification: 'high' }], GW)
    expect(r.models[0]?.state).toBe('refused')
    expect((await loadModelCatalogue(lite)).models.find((m) => m.name === 'gw-y')?.maxClassification).toBe('medium')
  })
  it('a new high session is never given the removed entry; a live one is not narrowed for it — LiteLLM no longer serves it (M6)', async () => {
    const lite = fakeLiteLlm()
    lite.price('openai/gpt-x', 1e-6)
    await ensureGatewayModels(lite, [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'high' }], GW)
    expect(agentModelsFor(await loadModelCatalogue(lite), 'high', 'capable')).toContain('gw-zdr')
    lite.price('openai/gpt-x', 0)
    await ensureGatewayModels(lite, [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'medium' }], GW)
    const after = await loadModelCatalogue(lite)
    expect(agentModelsFor(after, 'high', 'capable')).not.toContain('gw-zdr')
    // The agent sweep's rule: only a name the catalogue still SERVES is withdrawn from a live key.
    expect([...after.models.map((m) => m.name), ...after.unclassified]).not.toContain('gw-zdr')
  })
  it('platformModelsAtBoot registers the capable model at MANIFEST_CAPABLE_MODEL_CLASSIFICATION’s level — the boot’s thread (I3)', async () => {
    const lite = fakeLiteLlm()
    await platformModelsAtBoot(
      lite,
      { gatewayModels: [], capableModel: SETTING, capableFallback: 'default-chat-onprem', capableClassification: 'high' },
      GW,
    )
    const listed = (await loadModelCatalogue(lite)).models.find((m) => m.name === CAPABLE_MODEL_NAME)
    expect(listed?.maxClassification).toBe('high')
  })
  ```
  *(The first case's `lite.price('openai/gpt-x', 1e-6)` goes before its first `ensureGatewayModels`. `SETTING` is a setting the fake
  prices — `capable.test.ts`'s own. The helpers, written out:*
  ```ts
  const highAppUsing = (model: string) =>
    `manifest: 1\nname: chem-lab-scheduler\nblueprint: node-ts-mongo@2\nruntime:\n  port: 3000\nai:\n  models: [${model}]\n` +
    `  budget:\n    project_monthly_usd: 10\ndata:\n  classification: high\n`
  const validationContextFor = (s: CatalogueSnapshot): ValidationContext => ({
    projectSlug: 'chem-lab-scheduler',
    attributeWhitelist: ['ubcEduCwlPuid'],
    serviceCatalogue: [],
    modelCatalogue: s.models,
    unclassifiedModels: s.unclassified,
    aiEnabled: true,
    quota: { maxCpu: 2, maxMemoryMi: 2048, maxServices: 3, aiMonthlyUsd: 100 },
    projectBlueprint: 'node-ts-mongo@2',
  })
  const errorCodes = (text: string, c: ValidationContext) => {
    const r = validateSpec(text, c)
    return r.valid ? [] : r.errors.map((e) => e.code)
  }
  ```
  *The `very-high` stand-in pin is Task 1's case.)*
- [ ] **Step 2: Run — predict red**: `config.test.ts` at `capableClassification` (`undefined`) and at `@high` (refused by the old
  regex); `models.test.ts` at *high project … while the setting is capable* (Task 1's exception fires only at `very-high`);
  `capable.test.ts` at the level (`'internal'` registered — the constant) and *UNCHANGED* (`'registered'`: string compare);
  `gateway-models.test.ts` at *leaves the catalogue* (kept at `high`) and at *platformModelsAtBoot* (`'internal'`: the constant; and a
  type error until its settings take `capableClassification`); *a new high session … (M6)* red at its last line until the I1 removal
  lands. `pnpm typecheck` red at every caller of the two now-required parameters until each passes a level.
- [ ] **Step 3: Implement.**
  - **`config.ts`**: `GATEWAY_MODEL_ENTRY`'s tail becomes `@(low|medium|high|very-high|public|internal|confidential)$` and its form text
    `<name>=ubc-ai-gateway/<model>@<level>, comma-separated — a level is low, medium, high or very-high (UBC's U1), or an earlier name`;
    each entry's `classification: toLevel(…)`. A new setting beside the capable model's:
    ```ts
    /**
     * THE CAPABLE MODEL'S U1 LEVEL (§7, §26 as the U1 spec action amended them; S3 — Rich, 2026-10-03, 22:21): the most sensitive
     * data `default-chat-large` may receive, which is the administrator's attestation of EVERYTHING that may answer it — the
     * vendor behind the gateway and any gateway fallback included. `medium` by default (`internal`, its old hard-coded level);
     * Rich sets `high` for `gpt-6-luna` through UBC's gateway, with zero data retention. No cap: a capable model on UBC's own
     * hardware may be `very-high`. EMPTY IS UNSET. Anything but the seven names is refused, never defaulted.
     */
    MANIFEST_CAPABLE_MODEL_CLASSIFICATION: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(CLASSIFICATIONS).default(DEFAULT_LEVEL),
    ),
    ```
    mapped into `litellm.capableClassification: toLevel(raw.MANIFEST_CAPABLE_MODEL_CLASSIFICATION)`. **Check how `loadConfig` turns a zod
    enum failure into a `ConfigError`** (the existing `MANIFEST_AGENT_BUILDER_MODELS` test, `config.test.ts:191`, is the pattern) — the
    message must name the setting. The builder setting's comment (`:404-412`) in U1's words: *"the agent that BUILDS an app whose level
    is above the capable model's"*.
  - **`ai/capable.ts`**: `CAPABLE_CLASSIFICATION` removed; `ensureCapableModel(client, setting, gateway, classification)` — the level
    REQUIRED (*I3*) — passes it to `ensureRegistered` and to `refuseKeeping` (`:102-107`); `capableFloor(snapshot, classification)` reduces
    from `toLevel(classification)` (Task 2 made it start from the constant's level); `ensureCapableFallback(client, setting,
    classification)` — REQUIRED — and `unfit` take it;
    `capableModelAtBoot(client, setting, fallback, gateway, classification)` passes it to both. Its comment (`:36-40`) goes, with a line
    where `capableModelAtBoot` reads the level: *"the level is MANIFEST_CAPABLE_MODEL_CLASSIFICATION's (S3), never this file's"*.
  - **`ai/registration.ts`**: `:237` becomes `canonicalLevel(only!.model_info?.max_classification) === toLevel(r.classification)`;
    `refuseKeeping`:
    ```ts
    export async function refuseKeeping(
      client: LiteLlmClient,
      ours: Deployment[],
      model: string,
      classification: Classification,
      reason: (kept: Deployment[]) => string,
    ): Promise<RegistrationResult> {
      // NEVER KEPT ABOVE THE LEVEL ASKED FOR (the U1 spec action's review, I1): a lowered level whose re-registration was
      // refused must not leave the old, higher one serving — an entry at a level it no longer has fails OPEN.
      const ceiling = CLASSIFICATION_RANK[classification]
      const atOrBelow = (d: Deployment) => {
        const level = canonicalLevel(d.model_info?.max_classification)
        return level !== undefined && CLASSIFICATION_RANK[level] <= ceiling
      }
      const kept = ours.filter((d) => priced(d) && atOrBelow(d))
      for (const d of ours.filter((x) => !kept.includes(x))) await remove(client, idOf(d))
      return { state: 'refused', model, reason: reason(kept) }
    }
    ```
    and `ensureRegistered`'s `refuse` passes `r.classification`. `:60-63`'s comment on `unpriced` says *a `very-high` gateway model*.
  - **`ai/gateway-models.ts`**: `:134-135` → `toLevel(e.classification) === 'very-high'`; `:123-128` passes `e.classification` to
    `refuseKeeping`; `platformModelsAtBoot`'s settings gain `capableClassification: Classification`, passed to `capableModelAtBoot`. Its
    comments (`:24-25, 36, 81`) say `very-high` (and *"`confidential`, its alias"* once).
  - **`ai/models.ts:37`**: Task 1's `toLevel(floor) === 'very-high' && builder === 'capable'` becomes `const building = builder ===
    'capable'`, with its comment rewritten for S4: *"…the capable model to a project
    ABOVE its level while the builder setting is `capable` — at or below its level D17 already allows it — so whenever the setting is
    `capable`, the capable model is in every session's models while the catalogue lists it classified."* `:9-31` in U1's words.
  - **`index.ts`**: `platformModelsAtBoot(…, { …, capableClassification: config.litellm.capableClassification }, gateway)`; the boot line
    gains `capableClassification` beside `capableModel`; `:569-571`'s comment.
  - **The words** (S4, S10, I9 — three triggers): `ai/sessions.ts:439`'s `models_withdrawn` and `withdrawnBecause`'s second clause →
    *"the platform no longer lets the agent that builds a project at this level use the capable model — its setting, or the capable
    model's level, changed"*; `event-schemas.ts:853, 868` and `representations/agents.ts:105` the same; `.env.example:166` (the builder,
    in U1's words), `:172` (*"registered at boot as `default-chat-large` at MANIFEST_CAPABLE_MODEL_CLASSIFICATION's level"*), `:173`
    (*"at least the capable model's level"*), `:178` (`@<level>`), and a new line after `:172`:
    ```
    # MANIFEST_CAPABLE_MODEL_CLASSIFICATION=medium     # the capable model's UBC U1 level — low|medium|high|very-high (or an earlier name) — the administrator's attestation of everything that may answer it, the gateway's vendor and its fallbacks included; `high` only with zero data retention; default medium
    ```
    Two comments in U1's words: `releases/summary.ts:85-88` (its model carries `max_classification: confidential` — *"`very-high`, by its
    earlier name"*) and `api/spec-validation.ts:163-170` (*"a launch of a `very-high` release while `main` says `medium`"*); and
    `config.ts:590`'s `agent` comment. `docs/api/agents.md:21, 23, 28, 129` and `docs/api/frontend.md:34, 37, 96`: *"on a `confidential`
    project"* → *"on a project above the capable model's level"*; *"internal or public"* → *"at or below its level"*. RUNBOOK's *The
    capable model*: the setting, its default, Rich's `high`, and that the one boot that re-registers it needs LiteLLM's last start to have
    had the network (*M9*); **RUNBOOK `:299`** (*"any word but public, internal or confidential refuses the boot"* → the seven names) and
    **`:316-329`** (the builder setting, in S4's words) (*M1*).
  - **`make demo-gateway` compares levels as levels** (*I5*) — re-read both files at HEAD first (the gateway plan's sitting 3 is
    committing them): `scripts/demo-gateway.sh`'s `atGateway` compares `canon(d.model_info?.max_classification) === canon(cls)` with a
    seven-name map of its own (`const LEVEL = { public: 'low', internal: 'medium', confidential: 'very-high' }; const canon = (v) =>
    LEVEL[v] ?? v`); the capable model's expected level is `canon(process.env.MANIFEST_CAPABLE_MODEL_CLASSIFICATION || 'medium')`, never
    the literal `"internal"` (`:258`); the entry regex ends `@([a-z-]+)$` (`:261`), so `very-high` parses; and
    `packages/journey/src/gateway.ts:495`'s filter keeps an entry whose level is `very-high` by the same map (the journey imports no
    control-plane code). `grep -n "max_classification\|'internal'\|'confidential'\|\"internal\"" scripts/demo-gateway.sh
    packages/journey/src/gateway.ts` answers nothing else that compares a level by its string.
- [ ] **Step 4: Run each unit file — green.** Then the **Docker case**, `capable.docker.test.ts` (after `startingClear`, on the real
  LiteLLM): register the capable model at `'high'` (the file's existing setting) and read `/model/info`'s `max_classification: 'high'`;
  then a row registered at `'internal'` is `unchanged` at `'medium'` — **the real LiteLLM round-trips `max_classification` as given**,
  which is what `:237`'s comparison relies on. One file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker
  src/ai/capable.docker.test.ts`. Then `pnpm contract:write`, `contract:generate`, `docs:write` (the event and agent descriptions), the
  four gates; one line to the front-end.
- [ ] **Step 5: Commit by name**, then **the negative controls**:
  - **(a)** `refuseKeeping`'s `atOrBelow` removed: predict red at *leaves the catalogue* only — the positive control stays green;
  - **(b)** `:237` back to string equality: predict red at *an alias row is UNCHANGED* only;
  - **(c)** `building` back to Task 1's `toLevel(floor) === 'very-high' && builder === 'capable'`: predict red at *with the capable model at
    medium, a high project's agent gets it while the setting is capable* only — the `very-high` cases are green under both lines;
  - **(d)** `platformModelsAtBoot` passing the literal `'medium'` to `capableModelAtBoot` instead of `settings.capableClassification`:
    predict red at *platformModelsAtBoot registers the capable model at … level* only (*I3*: the first draft's control predicted red at a
    case that never went through the boot path, so it could not fail);
  - **(e)** the level argument removed from `capableModelAtBoot`'s call to `ensureCapableFallback` (`capable.ts:319`): predict `pnpm
    typecheck` RED (TS2554, an argument missing) — the required parameter is the control a default could not be (*I3*). Task 7's
    `demo-levels.sh` reads the live row's level against the setting, end to end.
  ```bash
  git commit -m "feat(ai): the capable model's U1 level is a setting (default medium); the builder exception at every level above it; registration by level, never kept above the level asked for (U1 plan Task 4)"
  ```

**Rich's `.env` line is at the sitting's close, not here** (*What Rich does* 3).

---

## Task 5: A delegated token is refused `high` projects' staging and production Incident tails (S9)

**Its caller**: `listIncidents` (`api/routes/releases.ts:1201-…`), decided before anything is read. **Stop point after this task**:
sitting 2 continues to Task 6 only with room for its Docker measurement, its migration and the tier.

**Files:**
- Modify: `src/api/routes/releases.ts:1208, 1241-1258`, `src/api/error-codes.ts:745-757`, `src/api/representations/incidents.ts:30`,
  `src/observability/output.ts:10-11` (comment)
- Modify: `src/api/incidents.test.ts`, `src/api/authz-contract.ts:119-124, 288-292, 2244-2262, 2571-2582`, `src/api/testing.ts:313`
- Modify: `packages/mock/src/server.ts:98-102, 456-463, 709, 730, 1197`, `packages/mock/src/fixtures.ts:856-867` (a doc line only),
  `packages/mock/src/scripted.test.ts` (beside `:359`, *M5*)
- Modify: `docs/api/agents.md:127, 133`, `docs/api/frontend.md:317`

**Interfaces:**
- Consumes: Task 2's canonical `environmentFloor`; Task 1's `CLASSIFICATION_RANK`.
- Produces: the mock's `MockOptions.level?: Level` and `MANIFEST_MOCK_LEVEL`; `confidential: true` ≡ `level: 'very-high'`.

- [ ] **Step 1: The failing tests.** `src/api/incidents.test.ts`: `incidentIn` and `declared` type their level as `Classification`. The
  case at `:150-158` INVERTS, and three cases join:
  ```ts
  it('refuses the token whatever the builder setting — a token’s model is unattested (S9)', async () => {
    await withSetting('on-premise', async (ctx) => {
      await incidentIn(ctx, ctx.stagingEnvironmentId)
      await confidential(ctx)
      expect(refusal(await read(ctx, ctx.stagingEnvironmentId, { bearer: await reader(ctx) }))).toEqual({
        status: 403,
        code: 'INCIDENT_LOG_CONFIDENTIAL',
      })
      // The person still reads it.
      expect(tailOf(await read(ctx, ctx.stagingEnvironmentId, {}))).toEqual([LOG_TAIL])
    })
  })
  it('refuses a token a HIGH project’s staging and production tails, under either setting (Review Focus 4)', async () => {
    for (const setting of ['capable', 'on-premise'] as const) {
      await withSetting(setting, async (ctx) => {
        for (const env of [ctx.sandboxEnvironmentId, ctx.stagingEnvironmentId, ctx.productionEnvironmentId]) {
          await incidentIn(ctx, env)
        }
        await declared(ctx, 'high')
        const token = await reader(ctx)
        for (const env of [ctx.stagingEnvironmentId, ctx.productionEnvironmentId]) {
          expect(refusal(await read(ctx, env, { bearer: token })), `${setting} ${env}`).toEqual({
            status: 403,
            code: 'INCIDENT_LOG_CONFIDENTIAL',
          })
          expect(tailOf(await read(ctx, env, {})), env).toEqual([LOG_TAIL])
        }
        expect(tailOf(await read(ctx, ctx.sandboxEnvironmentId, { bearer: token }))).toEqual([LOG_TAIL])
      })
    }
  })
  it('answers the token on a medium project — and on internal, its alias — the positive control', async () => {
    await withSetting('capable', async (ctx) => {
      await incidentIn(ctx, ctx.stagingEnvironmentId)
      await declared(ctx, 'medium')
      const token = await reader(ctx)
      expect(tailOf(await read(ctx, ctx.stagingEnvironmentId, { bearer: token }))).toEqual([LOG_TAIL])
      await declared(ctx, 'internal', 2000)
      expect(tailOf(await read(ctx, ctx.stagingEnvironmentId, { bearer: token }))).toEqual([LOG_TAIL])
    })
  })
  it('refuses a token staging’s tails of a release frozen high after a commit lowers the manifest to medium', async () => {
    await withSetting('capable', async (ctx) => {
      await incidentIn(ctx, ctx.stagingEnvironmentId, 'high')
      await declared(ctx, 'medium', 2000)
      expect(refusal(await read(ctx, ctx.stagingEnvironmentId, { bearer: await reader(ctx) }))).toEqual({
        status: 403,
        code: 'INCIDENT_LOG_CONFIDENTIAL',
      })
    })
  })
  ```
  `src/api/authz-contract.ts`: `makeConfidential` becomes `declareLevel(level: Classification): Promise<void>` — a newer valid manifest at
  `Date.now() + 1000 × (n + 1)` for its n-th call, so a later row's level is the newest. The last row splits in two, both LAST, in this
  order: **`'a high project — a token is refused its Incidents, whatever the builder setting'`** (`await f.declareLevel('high')`), then
  **`'a very-high project, by its earlier name confidential'`** (`await f.declareLevel('confidential')`); each expects the old row's
  answers (`token-capable` and `token-privileged` → `CONFIDENTIAL_INCIDENTS`). The doc comments (`:119-124`, `:288-292`, `:2244-2249`)
  say *high or above*. `src/api/testing.ts:313`'s union → `Classification`.
  `packages/mock/src/scripted.test.ts`, beside `:359`'s confidential case (*M5* — the front-end runs this mock):
  ```ts
  it('MANIFEST_MOCK_LEVEL=high refuses a token staging’s and production’s Incidents by code; medium answers them (U1 plan Task 5)', async () => {
    const incidents = (at: string, env: string) => fetch(`${at}/v1/environments/${env}/incidents`, { headers: BEARER })
    const medium = await serve({ level: 'medium' })
    expect((await incidents(medium, f.STAGING_ID)).status).toBe(200) // the positive control
    const high = await serve({ level: 'high' })
    for (const env of [f.STAGING_ID, f.PRODUCTION_ID]) {
      const refused = await incidents(high, env)
      expect(refused.status, env).toBe(403)
      expect(await codeOf(refused), env).toBe('INCIDENT_LOG_CONFIDENTIAL')
    }
    expect((await incidents(high, f.SANDBOX_ID)).status).toBe(200)
  })
  ```
  *(`serve`, `BEARER`, `codeOf` and `f` are the file's own, as `:359-…` uses them; `f.SANDBOX_ID` is the fixture's sandbox environment
  (`fixtures.ts:27`).)*
- [ ] **Step 2: Run — predict red, FROM THE CODE AS TASK 1 LEFT IT** (*I7*): the condition is `token && !sandbox && builderModels ===
  'capable' && toLevel(floor) === 'very-high'`. So:
  - the inverted case (*whatever the builder setting*, a `confidential` project under `on-premise`) answers `200` — the builder term;
  - both halves of the `high` case answer `200` — `capable`'s because `high` is not `very-high`, `on-premise`'s for both reasons;
  - *frozen high, lowered to medium* answers `200` (`high` is not `very-high`);
  - the authz row *a high project* is red at `token-capable` and `token-privileged`; the row *a very-high project, by its earlier name* is
    GREEN already — Task 1's line refuses `very-high` under the harness's default `capable` — a true green, kept as the alias's row;
  - the *medium* positive control is green already (a real green: medium was never refused);
  - the mock's case red at `serve({ level: 'high' })` (the option is ignored, so `200`).
- [ ] **Step 3: Implement.** `api/routes/releases.ts:1241-1258`:
  ```ts
  // THE SAFEGUARD (§7 as the U1 spec action amended it; S9 — Rich, 2026-10-03, 22:21: "Refuse at high and above"), decided BEFORE
  // anything is read: a delegated token is the credential of an agent the platform cannot see, so no administrator has attested the
  // model it hands these tails to, and staging's and production's carry real people's input. At `high` and above, WHATEVER the builder
  // setting or the capable model's level. By the environment's KIND, as the output read decides, and by `environmentFloor`: the
  // project's level and every release that has run HERE — so a commit lowering the manifest does not unlock the Incidents of the
  // release before it.
  if (
    actor.credential === 'token' &&
    environment.kind !== 'sandbox' &&
    CLASSIFICATION_RANK[await environmentFloor(deps.db, environment)] >= CLASSIFICATION_RANK.high
  )
    throw new OutputError(
      'INCIDENT_LOG_CONFIDENTIAL',
      `the ${environment.kind} Incidents of a project whose data is high or very high are not answered to a delegated token; a person reads them in their own session`,
    )
  ```
  The description (`:1208`): *"…A delegated token is refused the staging and production Incidents of a project whose data is `high` or
  `very-high` (`INCIDENT_LOG_CONFIDENTIAL`); a session reads them, and any token reads the sandbox's."* `error-codes.ts`'s summary: *"A
  project's staging and production Incidents are not answered to a delegated token when its data is `high` or `very-high`: their log
  tails can carry the input of the real people the level protects, and redaction does not remove names or student numbers."* (its remedy
  unchanged). `representations/incidents.ts:30`: *"…except a `high` or `very-high` project's staging or production Incident: …"*.
  **The mock** (`server.ts`): an option `level?: Level` (env `MANIFEST_MOCK_LEVEL`, one of the four levels, else ignored), and `const
  atHigh = options.confidential === true || (options.level !== undefined && CLASSIFICATION_RANK[options.level] >= CLASSIFICATION_RANK.high)`
  — copy the four-name rank into the mock rather than importing the control plane (the mock imports only `@manifest/contract`); the
  refusal and `agentModels(atHigh)` read `atHigh`; the message is the platform's new one. `agentModels`' signature does not change
  (Decision 9). **The guides**: `agents.md:127, 133` and `frontend.md:317` — *"the project is `high` or `very-high`"*, with no builder
  clause.
- [ ] **Step 4: Run each file — green**; `pnpm contract:write`, `contract:generate`, `docs:write`; the four gates. **Message the front-end**
  before the commit: *"S9 lands: INCIDENT_LOG_CONFIDENTIAL now for every high project's staging and production, whatever the builder
  setting; MANIFEST_MOCK_LEVEL=high in the mock gives it. Your instances.ts:108-112 reads it as before."*
- [ ] **Step 5: Commit by name**, then **the negative controls**:
  - **(a)** the condition back to Task 1's `toLevel(…) === 'very-high'` (with no builder term): predict red at both halves of the `high`
    case, at *frozen high, lowered to medium*, and at the authz row *a high project*; GREEN at the alias row (confidential IS very-high)
    and at the inverted case — that is why each exists;
  - **(b)** the builder term restored (`&& deps.config.agent.builderModels === 'capable'`): predict red at the inverted case and the
    `on-premise` half of the `high` case only;
  - **(c)** `>=` written `>`: predict red at both halves of the `high` case, at *frozen high, lowered to medium*, and at the authz row *a
    high project* (*I7*: the first draft said *"the high case only"*) — `very-high` still ranks above `high`, so the alias row and the
    inverted case stay green;
  - **(d)** the mock's `atHigh` reading `options.confidential` alone: predict red at the mock's `high` case only.
  ```bash
  git commit -m "feat(api): a delegated token is refused the staging and production Incidents of every project at high or above, whatever the builder setting (U1 plan Task 5, S9)"
  ```

---

## Task 6: A lowered level takes effect on running apps — their keys narrowed at boot, or revoked (S11)

**Its caller**: `index.ts`'s boot, **straight after `narrowSessionsHoldingMore`** (`:511-532`), through `appKeysAtBoot`. **Not before the
catalogue**: the sweep reads, FRESH, the catalogue the boot's own registrations just made (*M8*). **Proved through the real entry point**
by `boot.docker.test.ts`'s booted `dist/index.js` (*I1*), not only by a harness.

**Files:**
- Create: `src/ai/app-key-sweep.ts`, `src/ai/app-key-sweep.test.ts`, `src/ai/app-key-sweep.docker.test.ts`
- Modify: `src/ai/testing.ts` (the fake's `/key/update` by value, and `GET /key/info?key=`), `src/ai/sessions.ts:632` (export
  `inWords`), `src/ai/index.ts` (exports), `src/index.ts` (the call, the boot line)
- Modify: `src/boot.docker.test.ts` (the pre-boot fixture gains a real key to narrow; the boot line's `appKeysWithdrawn`, *I1*)
- Modify: `src/observability/events.ts`, `event-schemas.ts`, `examples.ts`, `src/db/schema.ts:1196`; Create: the migration (generated)
- Modify: `docs/superpowers/RUNBOOK.md` (one paragraph: what the boot line's `appKeysWithdrawn` means, and what an owner does)

**Interfaces:**
- Consumes: Task 2's `canonicalLevel`; `loadModelCatalogue` (`ai/catalogue.ts`); `getSecret` (`secrets/store.ts`); `revokeInstanceKey`,
  `instanceKeySecretName`, `LLM_API_KEY_SECRET` (`ai/keys.ts`); `publishEvent` (`observability/bus.ts`), `makeRedactor`
  (`observability/redact.ts`); `inWords` (`ai/sessions.ts`, exported).
- Produces:
  - `interface AppKeySweepDeps { db: Db; bus: EventBus; llm: LiteLlmClient; keys: MasterKeypair }` — no catalogue cache (*M8*);
  - `interface AppKeySweep { narrowed: string[]; revoked: string[]; failed: string[]; legacy: number }` — instance ids, and the count
    of P4b's environment-level keys;
  - `withdrawLoweredAppModels(deps: AppKeySweepDeps): Promise<AppKeySweep>`;
  - `heldModels(llm: LiteLlmClient, key: string): Promise<string[] | undefined>` — `GET /key/info?key=<value>`'s `info.models`;
    `undefined` when LiteLLM answers `404` (it holds no such key) (*I2*);
  - `countLegacyKeys(db: Pick<Db, 'select'>): Promise<number>` — `count()` over `secrets` where `name = LLM_API_KEY_SECRET`;
  - `appKeysAtBoot(deps): Promise<{ narrowed: number; revoked: number; failed: number } | 'failed'>` — never throws;
  - the event `ai.models_withdrawn`: `{ instanceId, environment, withdrawn: string[] (min 1), models: string[], revoked: boolean }`.

- [ ] **Step 1: MEASURE FIRST — the Docker case, run ALONE before any code** (Decision 8's stop, extended by *I4*).
  `app-key-sweep.docker.test.ts`, against the running LiteLLM (the file's own LiteLLM user, removed after; nothing else touched):
  ```ts
  import { randomUUID } from 'node:crypto'
  import { expect, it } from 'vitest'
  import { describeDocker } from '../runtime/testing.js'
  import { createLiteLlmClient } from './client.js'
  import { AiError } from './errors.js'
  import { deleteAppUsers, discardAppKey, mintAppKey } from './keys.js'
  import { litellmMasterKey, litellmUrl } from './testing.js'

  /** One model call, answered RAW — `ai/agent-keys.docker.test.ts:20-39`'s, with the route a parameter. */
  async function call(key: string, route: '/v1/chat/completions' | '/v1/embeddings', model: string) {
    const body =
      route === '/v1/embeddings'
        ? { model, input: 'ok' }
        : { model, max_tokens: 8, messages: [{ role: 'user', content: 'Answer with the single word ok.' }] }
    const res = await fetch(`${litellmUrl()}${route}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: { type?: unknown } }
    return { status: res.status, ...(typeof json.error?.type === 'string' ? { type: json.error.type } : {}) }
  }

  type KeyInfo = { key?: string; info?: Record<string, unknown> }
  const BOUNDS = ['allowed_routes', 'metadata', 'user_id', 'max_budget'] as const

  describeDocker('app keys narrowed at boot, against the running gateway (U1 plan Task 6)', () => {
    it('the pinned LiteLLM narrows an APP key named by its VALUE, and keeps its other bounds — the premise of S11’s sweep (I4)', { timeout: 120_000 }, async () => {
      const client = createLiteLlmClient({ baseUrl: litellmUrl(), masterKey: litellmMasterKey() })
      const projectId = randomUUID()
      const key = await mintAppKey(client, {
        projectId,
        projectSlug: `sweep-${projectId.slice(0, 8)}`,
        kind: 'staging',
        models: ['default-chat', 'default-embed'],
        monthlyUsd: 1,
      })
      try {
        const before = await client.get<KeyInfo>('/key/info', { key })
        expect(before.info?.models).toEqual(['default-chat', 'default-embed'])
        expect((await call(key, '/v1/embeddings', 'default-embed')).status).toBe(200) // held before the narrowing

        await client.post('/key/update', { key, models: ['default-chat'] })

        expect(await call(key, '/v1/embeddings', 'default-embed')).toEqual({ status: 403, type: 'key_model_access_denied' })
        expect((await call(key, '/v1/chat/completions', 'default-chat')).status).toBe(200) // the kept model answers
        const after = await client.get<KeyInfo>('/key/info', { key })
        expect(after.info?.models).toEqual(['default-chat'])
        for (const bound of BOUNDS) expect(after.info?.[bound], bound).toEqual(before.info?.[bound]) // I4: nothing else moved

        // I4's two records — neither asserted, both written into the plan's record:
        const unknown = await client
          .post('/key/update', { key: `sk-not-a-key-${projectId.slice(0, 8)}`, models: ['default-chat'] })
          .then(() => ({ status: 200 }))
          .catch((e: unknown) => (e instanceof AiError ? { status: e.status, code: e.code } : { status: -1 }))
        const hash = before.key // the token hash /key/info answers
        const byHash = await client
          .post('/key/update', { key: hash, models: ['default-chat'] })
          .then(() => 'accepted')
          .catch((e: unknown) => (e instanceof AiError ? `refused ${e.status}` : 'threw'))
        console.log(JSON.stringify({ measured: 'U1 Task 6 Step 1', unknownKey: unknown, updateByHash: byHash }))
      } finally {
        await discardAppKey(client, key)
        await deleteAppUsers(client, projectId)
      }
    })
  })
  ```
  *(`deleteAppUsers` is `ai/keys.ts:89`'s. The refused call is decided before any model loads; the two answered ones need `default-chat`
  and `default-embed` warm, as the tier does. `client.get(path, query)` and the `AiError` fields are `ai/client.ts`'s and
  `ai/errors.ts`'s — read them first; the logged line carries no key.)* Run:
  `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/ai/app-key-sweep.docker.test.ts`.
  **Red at the `403`, at `/key/update` itself, or at any BOUND: STOP.** Record the status and `error.type` and which bound moved (never a
  key), and tell the coordinator: Decision 8's two options go to Rich. **Green: continue.** Record the measurement either way — and the
  logged `unknownKey` and `updateByHash`: the fake's unknown-key answer (Step 4) is built from the first, and Decision 8's hash option
  stands only if the second reads `accepted`.

- [ ] **Step 2: The failing unit tests** (*M14*: code, not comments). `app-key-sweep.test.ts`:
  ```ts
  import { eq } from 'drizzle-orm'
  import { describe, expect, it, vi } from 'vitest'
  import { appSpecs, builds, environments, events, instances, releases, secrets, type Db } from '../db/index.js'
  import { withProject } from '../db/testing.js'
  import { createEventBus } from '../observability/bus.js'
  import { generateMasterKeypair } from '../secrets/envelope.js'
  import { putSecret } from '../secrets/store.js'
  import { appKeysAtBoot, withdrawLoweredAppModels } from './app-key-sweep.js'
  import { instanceKeySecretName, LLM_API_KEY_SECRET } from './keys.js'
  import { fakeLiteLlm, type FakeLiteLlm } from './testing.js'

  /**
   * An instance in `kind` whose release is frozen at `level` with `models`, holding a REAL fake key minted with them, recorded as
   * its secret — what `deployRelease` leaves behind. One per kind per project (an environment is unique by both). The fake's
   * catalogue is seeded by the caller.
   */
  async function running(
    tx: Db,
    ctx: { projectId: string; ownerId: string },
    lite: FakeLiteLlm,
    keys: Awaited<ReturnType<typeof generateMasterKeypair>>,
    frozen: { level: string; models: string[] },
    kind: 'staging' | 'production' = 'staging',
  ): Promise<{ instanceId: string; key: string }> {
    const [spec] = await tx.insert(appSpecs)
      .values({ projectId: ctx.projectId, commitSha: 'a'.repeat(40), parsed: {}, schemaVersion: 1, valid: true }).returning()
    const [build] = await tx.insert(builds)
      .values({ projectId: ctx.projectId, commitSha: 'a'.repeat(40), appSpecId: spec!.id, status: 'succeeded' }).returning()
    const [release] = await tx.insert(releases).values({
      projectId: ctx.projectId,
      buildId: build!.id,
      appSpecId: spec!.id,
      resolvedConfig: { [kind]: { classification: frozen.level, ai: { models: frozen.models } } },
      createdBy: ctx.ownerId,
    }).returning()
    const [env] = await tx.insert(environments)
      .values({ projectId: ctx.projectId, kind, hostname: `${ctx.projectId.slice(0, 8)}.${kind}.example` })
      .returning()
    const [instance] = await tx.insert(instances)
      .values({ environmentId: env!.id, releaseId: release!.id, driver: 'fake', state: 'healthy' }).returning()
    await lite.post('/user/new', { user_id: `app-${ctx.projectId}` })
    const { key } = await lite.post<{ key: string }>('/key/generate', {
      user_id: `app-${ctx.projectId}`, key_alias: `app-${instance!.id}`, models: frozen.models,
    })
    await putSecret(tx, {
      projectId: ctx.projectId, environmentKind: kind, name: instanceKeySecretName(instance!.id), value: key,
    }, keys)
    return { instanceId: instance!.id, key }
  }

  /** The catalogue the sweep reads FRESH (M8): `name → level`, seeded as config entries. */
  const catalogue = (lite: FakeLiteLlm, levels: Record<string, string>) => {
    for (const [name, level] of Object.entries(levels)) lite.seedEntry(name, { max_classification: level })
  }
  const heldBy = (lite: FakeLiteLlm, key: string) => lite.keys.get(key)?.models
  const sweptEvents = (tx: Db) => tx.select().from(events).where(eq(events.type, 'ai.models_withdrawn'))

  describe('withdrawLoweredAppModels — a lowered level takes effect on running apps (S11; U1 plan Task 6)', () => {
    it('narrows a key holding a model now ranked below its release’s level, by value, and records why', async () => {
      await withProject(async (tx, ctx) => {
        const lite = fakeLiteLlm(); const keys = await generateMasterKeypair()
        catalogue(lite, { 'gw-zdr': 'medium', 'default-chat-onprem': 'very-high' }) // gw-zdr lowered from high
        const { instanceId, key } = await running(tx, ctx, lite, keys, { level: 'high', models: ['gw-zdr', 'default-chat-onprem'] })
        const r = await withdrawLoweredAppModels({ db: tx, bus: createEventBus(), llm: lite, keys })
        expect(r).toEqual({ narrowed: [instanceId], revoked: [], failed: [], legacy: 0 })
        expect(heldBy(lite, key)).toEqual(['default-chat-onprem'])
        const [event] = await sweptEvents(tx)
        expect(event?.machineDetail).toEqual({
          instanceId, environment: 'staging', withdrawn: ['gw-zdr'], models: ['default-chat-onprem'], revoked: false,
        })
        expect(event?.humanMessage).toContain('gw-zdr')
        expect(JSON.stringify(event)).not.toContain(key)
      })
    })
    it('a SECOND sweep changes nothing and records nothing — idempotent by what the key holds now (I2)', async () => {
      await withProject(async (tx, ctx) => {
        const lite = fakeLiteLlm(); const keys = await generateMasterKeypair()
        catalogue(lite, { 'gw-zdr': 'medium', 'default-chat-onprem': 'very-high' })
        await running(tx, ctx, lite, keys, { level: 'high', models: ['gw-zdr', 'default-chat-onprem'] })
        const deps = { db: tx, bus: createEventBus(), llm: lite, keys }
        await withdrawLoweredAppModels(deps)
        const updates = () => lite.calls.filter((c) => c.path === '/key/update').length
        const before = updates()
        expect(await withdrawLoweredAppModels(deps)).toEqual({ narrowed: [], revoked: [], failed: [], legacy: 0 })
        expect(updates()).toBe(before)
        expect(await sweptEvents(tx)).toHaveLength(1)
      })
    })
    it('REVOKES a key left with nothing it may use — never models: [] (Review Focus 5)', async () => {
      await withProject(async (tx, ctx) => {
        const lite = fakeLiteLlm(); const keys = await generateMasterKeypair()
        catalogue(lite, { 'gw-zdr': 'medium' })
        const { instanceId, key } = await running(tx, ctx, lite, keys, { level: 'high', models: ['gw-zdr'] })
        const r = await withdrawLoweredAppModels({ db: tx, bus: createEventBus(), llm: lite, keys })
        expect(r.revoked).toEqual([instanceId])
        expect(lite.keys.has(key)).toBe(false)
        expect(await tx.select().from(secrets).where(eq(secrets.name, instanceKeySecretName(instanceId)))).toEqual([])
        expect(lite.calls.some((c) => c.path === '/key/update' && JSON.stringify(c.body).includes('"models":[]'))).toBe(false)
        expect((await sweptEvents(tx))[0]?.machineDetail).toMatchObject({ revoked: true, models: [] })
      })
    })
    it('reads a frozen alias as its level: confidential keeps an on-premise model and loses a high one', async () => {
      await withProject(async (tx, ctx) => {
        const lite = fakeLiteLlm(); const keys = await generateMasterKeypair()
        catalogue(lite, { 'gw-high': 'high', 'default-chat-onprem': 'confidential' })
        const { key } = await running(tx, ctx, lite, keys, { level: 'confidential', models: ['gw-high', 'default-chat-onprem'] })
        await withdrawLoweredAppModels({ db: tx, bus: createEventBus(), llm: lite, keys })
        expect(heldBy(lite, key)).toEqual(['default-chat-onprem'])
      })
    })
    it('changes nothing when every model is still allowed — and a model the catalogue no longer serves stays on the key', async () => {
      await withProject(async (tx, ctx) => {
        const lite = fakeLiteLlm(); const keys = await generateMasterKeypair()
        catalogue(lite, { 'default-chat': 'internal' })
        const { key } = await running(tx, ctx, lite, keys, { level: 'medium', models: ['default-chat', 'gone-model'] })
        expect(await withdrawLoweredAppModels({ db: tx, bus: createEventBus(), llm: lite, keys }))
          .toEqual({ narrowed: [], revoked: [], failed: [], legacy: 0 })
        expect(heldBy(lite, key)).toEqual(['default-chat', 'gone-model'])
        expect(await sweptEvents(tx)).toEqual([])
      })
    })
    it('names and skips an instance whose release has no readable level — never assumed', async () => {
      await withProject(async (tx, ctx) => {
        const lite = fakeLiteLlm(); const keys = await generateMasterKeypair()
        catalogue(lite, { 'default-chat': 'internal' })
        const line = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const { instanceId, key } = await running(tx, ctx, lite, keys, { level: 'secret', models: ['default-chat'] })
        const r = await withdrawLoweredAppModels({ db: tx, bus: createEventBus(), llm: lite, keys })
        expect(r.failed).toEqual([instanceId])
        expect(heldBy(lite, key)).toEqual(['default-chat'])
        expect(line.mock.calls.flat().join('\n')).toContain(instanceId)
        line.mockRestore()
      })
    })
    it('counts P4b’s environment-level keys, names them in one line, and checks none', async () => {
      await withProject(async (tx, ctx) => {
        const lite = fakeLiteLlm(); const keys = await generateMasterKeypair()
        await putSecret(tx, { projectId: ctx.projectId, environmentKind: 'staging', name: LLM_API_KEY_SECRET, value: 'sk-legacy' }, keys)
        const line = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        expect((await withdrawLoweredAppModels({ db: tx, bus: createEventBus(), llm: lite, keys })).legacy).toBe(1)
        expect(line).toHaveBeenCalledTimes(1)
        line.mockRestore()
      })
    })
    it('a gateway that refuses one key is that key’s line, and the sweep goes on to the next', async () => {
      await withProject(async (tx, ctx) => {
        const lite = fakeLiteLlm(); const keys = await generateMasterKeypair()
        catalogue(lite, { 'gw-zdr': 'medium', 'default-chat-onprem': 'very-high' })
        const first = await running(tx, ctx, lite, keys, { level: 'high', models: ['gw-zdr', 'default-chat-onprem'] })
        const second = await running(tx, ctx, lite, keys, { level: 'high', models: ['gw-zdr', 'default-chat-onprem'] }, 'production')
        lite.failNext('/key/update', 500)
        const line = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const r = await withdrawLoweredAppModels({ db: tx, bus: createEventBus(), llm: lite, keys })
        expect(new Set([...r.failed, ...r.narrowed])).toEqual(new Set([first.instanceId, second.instanceId]))
        expect(r.failed).toHaveLength(1)
        line.mockRestore()
      })
    })
  })
  it('appKeysAtBoot is never fatal: a gateway that does not answer is one line and "failed"', async () => {
    const lite = fakeLiteLlm()
    lite.failNext('/model/info', 0)
    const line = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await appKeysAtBoot({ db: {} as Db, bus: createEventBus(), llm: lite, keys: await generateMasterKeypair() })).toBe('failed')
    expect(line).toHaveBeenCalledTimes(1)
    line.mockRestore()
  })
  ```
  **The fake's names, checked before this file is written** — `lite.post('/user/new')`, `lite.keys`, `lite.calls`, and a way to seed a
  CONFIG entry at a level and to fail one call: `ai/testing.ts` has `failures` (`:319`) and seeds config entries (`:282-292`); use the
  names it exports (`seedEntry` and `failNext` above stand for them — rename to the real ones, or add the two smallest helpers there), and
  the `events` table's columns as `db/schema.ts` names them.
- [ ] **Step 3: Run — predict red** at the import (`withdrawLoweredAppModels` is `undefined`).
- [ ] **Step 4: Implement.**
  - **`ai/testing.ts`**: `/key/update` finds a key by `key` (its value) as well as by alias, answering an unknown value as Step 1
    recorded; `GET /key/info` with `query.key` answers `{ key: 'hash-of-<alias>', info: { models, user_id, max_budget, metadata } }`, or
    `404 not_found_error` for an unknown value (Step 1's answer, if it differs, wins).
  - **`ai/app-key-sweep.ts`**:
    ```ts
    /**
     * A LOWERED LEVEL TAKES EFFECT ON RUNNING APPS (§7 as the U1 spec action amended it; S11 — Rich, 2026-10-03, 22:21). A model's
     * level is lowered when everything that may answer it no longer meets the rule its old level needed — a provider's zero
     * retention lapsing — and the catalogue then refuses it to new validations and deploys (D17, twice). A key a RUNNING instance
     * already holds would still reach it. So at every boot, after the boot's own registrations and the agent sessions' sweep, each
     * instance's key loses every model it HOLDS that its release's frozen level no longer allows — or, when nothing it may use is
     * left, is REVOKED: LiteLLM reads `models: []` as every model (`ai/keys.ts:137-141`). What a key holds is LiteLLM's own record
     * (`/key/info`), so a second boot finds nothing to do (the review's I2). The catalogue is read FRESH (M8). Each change is an
     * `ai.models_withdrawn` event to the project's people and an operator line. The rule is the agent sweep's (`ai/sessions.ts`): a
     * model the catalogue SERVES and does not allow is withdrawn; one it no longer serves stays, and LiteLLM refuses it.
     */
    export async function withdrawLoweredAppModels(deps: AppKeySweepDeps): Promise<AppKeySweep> {
      const snapshot = await loadModelCatalogue(deps.llm)
      const served = new Set([...snapshot.models.map((m) => m.name), ...snapshot.unclassified])
      const rows = await deps.db
        .select({ instance: instances, environment: environments, release: releases, slug: projects.slug })
        .from(instances)
        .innerJoin(environments, eq(instances.environmentId, environments.id))
        .innerJoin(releases, eq(instances.releaseId, releases.id))
        .innerJoin(projects, eq(environments.projectId, projects.id))
        .where(ne(instances.state, 'gone'))
      const result: AppKeySweep = { narrowed: [], revoked: [], failed: [], legacy: 0 }
      for (const { instance, environment, release, slug } of rows) {
        const scope = { projectId: environment.projectId, kind: environment.kind, instanceId: instance.id }
        try {
          const key = await getSecret(
            deps.db,
            { projectId: scope.projectId, environmentKind: scope.kind, name: instanceKeySecretName(instance.id) },
            deps.keys,
          )
          if (key === undefined) continue
          const frozen = (release.resolvedConfig as Record<string, { classification?: unknown } | undefined>)[environment.kind]
          const level = canonicalLevel(frozen?.classification)
          if (level === undefined) {
            console.error(`app key sweep: instance ${instance.id} (${slug}, ${environment.kind}): its release names no level the platform reads, so its AI key was not checked; redeploy it`)
            result.failed.push(instance.id)
            continue
          }
          const held = await heldModels(deps.llm, key)
          if (held === undefined) continue // LiteLLM holds no such key: nothing to withdraw
          const allowed = (m: string) => snapshot.models.some(
            (e) => e.name === m && CLASSIFICATION_RANK[e.maxClassification] >= CLASSIFICATION_RANK[level],
          )
          const withdrawn = held.filter((m) => served.has(m) && !allowed(m))
          if (withdrawn.length === 0) continue
          const kept = held.filter((m) => !withdrawn.includes(m))
          const revoked = !kept.some(allowed)
          if (revoked) await revokeInstanceKey(deps.db, deps.llm, deps.keys, scope)
          else await deps.llm.post('/key/update', { key, models: kept })
          await publishEvent(deps.db, deps.bus, {
            projectId: environment.projectId,
            subject: `instance:${instance.id}`,
            type: 'ai.models_withdrawn',
            machineDetail: { instanceId: instance.id, environment: environment.kind, withdrawn, models: revoked ? [] : kept, revoked },
            humanMessage: revoked
              ? `${slug} in ${environment.kind} may no longer call ${inWords(withdrawn)}: each is now approved only below its ${levelWords(level)} data, and nothing it declared is still allowed, so its AI key was revoked. Change ai.models or data.classification, then deploy again.`
              : `${slug} in ${environment.kind} may no longer call ${inWords(withdrawn)}: each is now approved only below its ${levelWords(level)} data. Its AI key keeps ${inWords(kept)}.`,
          }, makeRedactor([key]))
          ;(revoked ? result.revoked : result.narrowed).push(instance.id)
        } catch (error) {
          console.error(`app key sweep: instance ${instance.id} (${slug}, ${environment.kind}): its AI key could not be narrowed or revoked; it may still reach a model its data's level no longer allows, until the next boot: ${String(error)}`)
          result.failed.push(instance.id)
        }
      }
      result.legacy = await countLegacyKeys(deps.db)
      if (result.legacy > 0) console.error(`app key sweep: ${result.legacy} environment-level AI key(s) from before per-instance keys were not checked; redeploy those apps`)
      return result
    }
    ```
    `heldModels` reads `GET /key/info` with `{ key }` and answers `info.models` (an array of strings), `undefined` on an `AiError` `404`,
    and THROWS anything else. `appKeysAtBoot` is `gatewayModelsAtBoot`'s shape: one `[boot]` summary line when anything was narrowed or
    revoked, one line and `'failed'` for a throw, never fatal.
  - **The event**: `observability/events.ts` (`'ai.models_withdrawn'` after `'ai.key_rotated'`, with its comment), `event-schemas.ts`
    (its strict object, each field described, *"A running app's AI key lost models now approved only below its data's level — or was
    revoked, when nothing it declared is still allowed. The key itself is never in an event."*), `examples.ts`, `db/schema.ts:1196`'s
    CHECK list; then `pnpm --filter @manifest/control-plane db:generate` and **read the generated SQL**: it drops and re-adds
    `events_type_known` (0048's pattern), nothing else. `db:migrate` needs RUNBOOK's whole export block (trap 13). `docs/api/events.md`'s
    table is regenerated by `pnpm docs:write`.
  - **`index.ts`**: after `agentSessionsWithdrawn`, `const appKeysWithdrawn = !catalogue.enabled || litellm === undefined ? 'disabled' :
    await appKeysAtBoot({ db, bus, llm: litellm, keys: masterKeypair })`, and the boot line gains `appKeysWithdrawn`.
- [ ] **Step 5: Run the unit file — green.** Then `pnpm contract:write`, `contract:generate`, `docs:write` (the event); the four gates;
  one line to the front-end (*"a new event, ai.models_withdrawn, on 1.7.0"*).
- [ ] **Step 6: THROUGH THE REAL ENTRY POINT** (*I1*). `boot.docker.test.ts`'s pre-boot fixture (`:470-520`, beside the three agent
  sessions) gains one more running instance: an environment of the fixture's project, a release whose `resolvedConfig.staging` is `{
  classification: 'high', ai: { models: ['default-chat-onprem', 'default-chat'] } }` — `default-chat` is `internal` in `config.yaml`, so
  it is the model a `high` level no longer allows, and no LiteLLM row of the test's own is needed — an instance in state `healthy`, and
  a REAL key: `mintAppKey` against the running LiteLLM with those two models, recorded by `storeInstanceKey` with the master keypair the
  spawned control plane loads (`loadMasterKeypair(<its secretsMasterKeyPath>)`, as the file's other secrets are written). After the boot:
  ```ts
  expect(boot.appKeysWithdrawn).toMatchObject({ narrowed: 1, failed: 0 })
  const held = await adminClient.get<{ info?: { models?: string[] } }>('/key/info', { key: sweptKey })
  expect(held.info?.models).toEqual(['default-chat-onprem'])
  expect(await call(sweptKey, '/v1/chat/completions', 'default-chat')).toEqual({ status: 403, type: 'key_model_access_denied' })
  ```
  (`call` as Step 1's; the type `boot` gains `appKeysWithdrawn: unknown`; the key and its LiteLLM user removed in the file's `afterAll`.)
  **If the fixture's other instances hold keys, they must count nothing** — their releases' levels allow every model they hold; read
  the fixture first, and if one would be narrowed, `narrowed: 1` is wrong and the record says why. **Run this ONE Docker file ALONE,
  before the tier, with nothing else running** (*M4*): `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker
  src/boot.docker.test.ts` — it builds and spawns `dist/index.js`, so `pnpm --filter @manifest/control-plane build` first if the tier's
  global setup is what builds it (read `vitest` config's docker project).
- [ ] **Step 7: Commit by name** (the migration and `meta/` included, by name), then **the negative controls**:
  - **(a)** the revoke branch replaced by `/key/update` with `kept` (which is `[]`): predict red at *REVOKES … never models: []* only;
  - **(b)** `withdrawn` computed from the release's frozen `ai.models` instead of `heldModels` (the first draft): predict red at *a SECOND
    sweep changes nothing* only (*I2*);
  - **(c)** `level` read RAW (`frozen?.classification as Classification`, no `canonicalLevel`): predict GREEN at the alias case — the rank
    table holds `confidential` at `very-high`'s rank (I6's defence in depth, seen working) — and red at *no readable level*: `'secret'`
    passes the `undefined` check, ranks `undefined`, every served model reads as not allowed, and the key is REVOKED unnamed instead of
    named and skipped. **Recorded as the table doing its job, not as a control that cannot fail**;
  - **(d)** the `appKeysAtBoot` call removed from `index.ts`: predict red at Step 6's `boot.docker.test.ts` case (`appKeysWithdrawn`
    `undefined`, and the key still holding `default-chat`) — run that file ALONE (*M4*).
  ```bash
  git commit -m "feat(ai): a lowered level takes effect on running apps — each instance key narrowed at boot to what its data's level allows, or revoked; ai.models_withdrawn (U1 plan Task 6, S11)"
  ```

---

## Task 7: The acceptance — `make demo-levels`, and a person reading a `high` app's privacy assessment

**Alone, and last.** Offline, on EACH driver — the control plane restarted on `local`, then on `github` — as the faculty-ready acceptance
ran (*M11*); it touches no source but its own projects'. Its caller is the
`Makefile`, and `make ci-acceptance`'s new step.

**Files:**
- Create: `packages/journey/src/levels.ts`, `scripts/demo-levels.sh` (the sign-in prelude of `scripts/demo-faculty-ready.sh`, copied),
  `scripts/levels-controls.sh` (restore-safe: each control applied, run, restored by `trap`, in the faculty-ready plan's controls'
  pattern)
- Modify: `Makefile` (`demo-levels: up`, `.PHONY`), `scripts/ci-acceptance.sh` (a step), `scripts/offline-acceptance.sh` (its next step),
  `docs/superpowers/RUNBOOK.md` (*make demo-levels*), ORIENTATION §2's table (a row)

- [ ] **Step 1: The phases**, each ending `every check passed` (copy `faculty-ready.ts`'s structure: `checks.step`, `checks.ok` with the
  answer shown on failure, `refusal(res, status, code)`):
  0. **Sign in**; a fresh project (`levels-<run>`), from the blueprint.
  1. **D17 at `high`, in U1's words** — a DRY-RUN commit (`POST /v1/projects/{projectId}/commits`, `dryRun: true`, as `authoring.ts:495`)
     of a manifest declaring `classification: high` and `ai.models: [default-chat]`: `422 SPEC_INVALID`; a detail at `ai.models.0` with
     code `SPEC_MODEL_CLASSIFICATION_TOO_LOW`; its hint contains *"approved for medium data at most"* and *"(Information Security Standard
     U1)"*, and NOT *"BC public body"*.
     **The capable model, read once for the phases below:** `demo-levels.sh` reads LiteLLM's `/model/info` with the master key (as
     `demo-gateway.sh` does) and passes `CAPABLE=listed|absent` and `CAPABLE_LEVEL` — the row's `max_classification` through a
     seven-name map — and `CAPABLE_SETTING_LEVEL`, `.env`'s `MANIFEST_CAPABLE_MODEL_CLASSIFICATION` through the same map (`medium` when
     absent). **Listed, the two must be equal** — the thread `.env` → `index.ts` → registration, end to end (*I3*).
  2. **The alias never widens** — a dry run declaring `confidential` and `ai.models: [default-chat-onprem]` is valid; one declaring
     `confidential` and `[default-chat]` is refused with a message naming *very-high*. **When the capable model is listed at `high`**: a
     dry run declaring `confidential` and `[default-chat-large]` is refused too — and `high` with `[default-chat-large]` is valid, its
     positive control (*I3*). Otherwise the phase prints that half NOT RUN.
  3. **Stored as the level, answered in U1's names** — commit (not a dry run) the manifest at `internal` with `[default-chat]`: valid;
     `getSpec` answers `data.classification: 'medium'`. Then commit `medium` with the same models: its `sensitiveDiff.fields` does NOT
     contain `data.classification` (a rename is not a change). Then commit `high` — with `[default-chat-large, default-chat-onprem]`
     when the capable model is listed at `high` (the spec's own S7 example, E1 l.392; *I6*), else `[default-chat-onprem]`: valid;
     `getSpec` answers `'high'`, and its `sensitiveDiff.fields` DOES contain `data.classification` — the positive control.
  4. **The agents' models** (`startAgentSession`):
     - **the `high` project's** session holds `default-chat-onprem` and NOT `default-chat`; when listed at `high` it holds
       `default-chat-large` — **by RANK**, which is D17, not the builder exception;
     - **a second project of the run, `levels-vh-<run>`, committed `very-high` with `[default-chat-onprem]`** — above the capable model
       at either of its levels — holds `default-chat-onprem`, NOT `default-chat`, and, when the capable model is listed,
       `default-chat-large` **only by the builder exception** (S4/S10, the setting `capable`) (*I3*: the first draft's `high` project
       got it by rank, so the builder control could not fail there). Absent: that half prints NOT RUN.

     Each session is ended at the phase's end.
  5. **A token is refused the tails** — a delegated token with `project:read`: `listIncidents` on staging → `403
     INCIDENT_LOG_CONFIDENTIAL` (the refusal is decided before anything is read, so no Incident need exist); on the sandbox → `200`; the
     person's session on staging → `200`.
  6. **The privacy assessment** — `draftPrivacyAssessment` on the `high` project: the *flows* section's *Classification* fact reads
     *"High — every AI model the app uses must be approved for high data."*; `default-chat-onprem`'s fact reads *"Approved for very high
     data: it runs on on-premise hardware, so what the app sends it stays there."*; and, when listed at `high`, `default-chat-large`'s
     fact is the zero-retention sentence (Task 3) — the one new sentence the Privacy Office will read (*I6*).
- [ ] **Step 2: Green three times** (a fresh project each run, then re-use), and from a `make reset` machine once. **Every other demo stays
  green** where it was last green — above all **`make demo-frontend`** (Task 2 changed its assertion), **`make demo-gateway`** (Task 4
  made it compare levels; network on, the key set — *I5*), `make demo-launch`, `make demo-ai`, `make demo-token` and `make
  demo-faculty-ready` — then `make ci-acceptance` with its new step, its `EXPECT_` lines re-counted. **Three times on EACH driver**
  (*M11*).
- [ ] **Step 3: The negative controls**, in `scripts/levels-controls.sh` (for Rich if the classifier refuses a restart). Each is seen red
  where predicted, and restored:
  - **(a)** S9's condition back to Task 1's `toLevel(…) === 'very-high'` (the control plane restarted on the edited tree): phase 5
    answers `200` (the project is `high`);
  - **(b)** BOTH of S6's paths removed — the schema's transform and `getSpec`'s `specInLevels`: phase 3's `getSpec` answers
    `'internal'`. **Either one alone stays green** — for a new row the transform stores the level and `specInLevels` reads one, so each
    covers the other: that is the design, and the record says so rather than calling it a control that cannot fail. Task 2's unit
    controls (b) and (c) see each alone;
  - **(b2)** `sensitiveViewOfSpec`'s `levelName` removed: phase 3's rename commit lists `data.classification` — red only if the
    transform is ALSO removed (the stored previous row is then `internal`); alone it stays green, for the same reason. Record which;
  - **(c)** E14's old hint: phase 1's hint checks;
  - **(d)** `staysOnPremise` back to `=== 'confidential'`: phase 6's on-premise fact;
  - **(e)** `MANIFEST_AGENT_BUILDER_MODELS=on-premise`: **when `CAPABLE=listed`**, phase 4's `very-high` project's capable half goes red
    — the capable model ranks below `very-high` at either of its levels, so only the builder exception gave it (*I3*); its `high`
    project's half stays GREEN when the capable model is `high` (by rank), recorded as D17, not a control that cannot fail. **Whether
    or not it is listed**, phase 5 stays GREEN under (e) — S9's point: the builder setting no longer decides the tails;
  - **(f)** `CLASSIFICATION_RANK.confidential = 2` — the partial-edit trap — **with the schema's transform also removed** (only when the
    capable model is listed at `high`): phase 2's `confidential` + `[default-chat-large]` dry run is answered VALID. **The rank edit alone
    stays GREEN through every entry point**: the transform stores `confidential` as `very-high` before anything ranks it, and the
    catalogue and the floors canonicalize too — the table is the defence in depth behind them, and Task 1's unit control (a) is what sees
    it alone. Recorded as such (*I3*).
- [ ] **Step 4: The person.** Rich signs in to the console (or a staged headless sign-in, his standing yes on `manifest.internal`), opens
  the run's `high` project's *Records*, drafts the privacy assessment, and reads its *Where it flows* section: *High*, the on-premise
  model's line and — the capable model at `high` — **its zero-retention sentence** (*I6*).
  **He types every password**, or the agent stages it as that yes allows.
- [ ] **Step 5: The plan's one whole-branch review**, beside the Docker tier if code changed, then one fix wave.
- [ ] **Step 6: Close out**:
  - the ledger; this plan's sittings table; ORIENTATION §7e (next: FE-46/47/5, starting from contract `1.7.0`), §3's *What the platform
    keeps true* (the levels, the aliases, the token rule, the sweep), §8 (*Open*'s classification bullet becomes *"may U1 High reach a
    provider with zero data retention, and is Rich's reported determination on the record"*);
  - `docs/external-track.md` item 11 updated, and a new item: **U1 §3.2.4** — Manifest is likely a Very High Risk Electronic Service,
    needing a Security Threat Risk Assessment and a Shared Responsibility Model (§4.2.3); the track stays deferred;
  - TRAPS: what Task 6's Step 1 measured; any new trap;
  - the front-end told; the coordinator told.

---

## What this plan does not build

- **Renaming the stored values.** Every `internal` and `confidential` in LiteLLM's rows, `config.yaml`, frozen releases and stored specs
  keeps its string and is read as its level (Decision 2; *"no LiteLLM database or config migration"*, 21:48).
- **Raising `default-chat`, `default-chat-reasoning` or `default-embed` to `high`** (S2 (i)). **The cost, accepted by Rich: a `high` app
  has no embedding model and no small chat model** — only `default-chat-onprem`, its `-reasoning` sibling, `default-chat-large` while it
  is `high`, and any `@high` or `@very-high` gateway entry. Story 04's app (*"searches the course readings"*) cannot embed at `high`.
- **New gateway entries.** `llama3` on Bedrock (`@high`, Rich's call, unverified) and `qwen3.6-35b-a3b` (`@high` at most, because the
  gateway falls back to `gpt-6-luna`) wait until the gateway prices them; each is an `.env` line, not code.
- **A gateway-side fallback check.** The platform cannot see the gateway's router; a `high` entry rests on the administrator's
  attestation of everything that may answer it (S1). **The gateway plan's *What this plan does not build* gains the `high` half of that
  limit** — the coordinator's edit (the spec action's item 16).
- **A cap on the capable model's level** (S3 (b)): `very-high` is accepted.
- **Changing the building agent's default** (S10 (a)): `MANIFEST_AGENT_BUILDER_MODELS` stays `capable`.
- **A per-request check of a running key.** S11 takes effect at BOOT; between a lowered level and the next boot a running key keeps it.
  Levels change only at boot (registration) or by an administrator's LiteLLM restart, which is followed by a control-plane restart
  (RUNBOOK).
- **P4b's environment-level app keys** — counted and named by the sweep, not checked (Decision 8).
- **S11 as a phase of `make demo-levels`** (*I1*). It is proved through the real entry point by `boot.docker.test.ts` (Task 6, Step 6): a
  booted `dist/index.js` narrows a real key in LiteLLM and the key is refused. A demo phase would have to lower a model's level and restart
  the control plane mid-run — a control's shape, not a journey's. **The cost:** the acceptance a person watches never shows a running
  app losing a model; the Docker tier shows it at every run, and RUNBOOK says what the boot line's `appKeysWithdrawn` means.
- **The front-end's words.** Its session's, from the ask (Task 1's NOTICE); this plan never edits `~/Developer/manifest-app`.
- **Who classifies.** U1 §4.1 puts it on the information's steward; Manifest asks the app's owner to declare (E2), and whether the
  steward is the faculty member, the department or UBC is UBC's to say. The PIA is where UBC reviews it.
- **ORIENTATION, the roadmap, CLAUDE.md, the decisions file** — the coordinator places this plan at its sweep.

---

## What the self-review caught

- **`make demo-frontend` would have gone red at S6** — `journey/src/frontend.ts:1104` asserts a release's frozen `'confidential'`, and
  Task 2 makes the release answer `'very-high'`. The spec action's list named no journey; Task 2 now changes it.
- **The spec action's item 5 expected `SPEC_MODEL_CLASSIFICATION_TOO_LOW`** for a `high` app after a lowered, refused re-registration.
  Removing the entry (the review's I1 fix) makes it `SPEC_MODEL_UNKNOWN` — still a refusal, and fail-closed. Decision 6 records it, and
  Task 4's test asserts the real code.
- **FE-46/47/5 also takes `1.7.0`** (ten lines). This plan, placed before it, takes the number; that plan becomes `1.8.0`.
- **The builder exception needs no new parameter**: with the setting `capable`, S4's rule is *always include the capable model*, because
  below its level the rank already includes it (Decision 4). The spec action's item 3 condition gives the same set.
- **The type stays seven names wide** (Decision 1) — 74 test literals in 29 files, 13 of them Docker files, would otherwise churn for no
  runtime change.
- **The mock has said `classification: 'low'` since P5c** — a U1 name the platform never answered then, right by accident now.
- **The existing Incident test *"answers the token when the builder is kept on-premise"* inverts** under S9 — named in Task 5, so the
  executor does not read its red as a regression.
- **Task 6's premise is unmeasured** — that `/key/update` narrows a key named by its value. It is measured first, alone, with a declared
  stop.

---

## The fresh review's fixes, and where each landed

*Applied 2026-10-03 by `manifest-17`, documents only, from [`2026-10-03-review-of-u1-plan.md`](./2026-10-03-review-of-u1-plan.md) (`8acd55d`),
at Rich's 23:22 approval. No code changed between the plan's read point `bae220f` and the review's HEAD; every `file:line` the review
cites was opened before it was built in. Each is marked in place with its id.*

| Id | The fix | Where |
|---|---|---|
| **C1** | No task switches a value while a reader compares against `'confidential'`. **Re-cut, one step further than the review's fix**: Task 1's transform already stored a committed `confidential` as `very-high` (`agents.test.ts:1166-1170`), so the level-safe readers land IN Task 1 and the transform moves to Task 2; every moving expectation is named with its red | Decision 13; the sittings table and its fifth rule; Tasks 1 and 2 (whole); Read this first 24; Decision 4's last sentence; Tasks 3–5's predictions from Task 1's lines |
| **I1** | S11 through the real entry point | Task 6 Step 6 (`boot.docker.test.ts`, a real key narrowed by the booted `dist/index.js`); Review Focus 5; *What this plan does not build* (no demo phase, its cost) |
| **I2** | The sweep idempotent: what the key HOLDS, from `/key/info` by value | Decision 8; Task 6 (`heldModels`, the fake's `/key/info`, *a SECOND sweep changes nothing*, control (b)); Read this first 28 |
| **I3** | Controls that could not fail: the builder control on a `very-high` project; phase 2's capable-model dry run; control (f); the level REQUIRED; `platformModelsAtBoot`'s case; the live row's level against the setting | Task 4 (Interfaces, tests, controls (d), (e)); Task 7 (phases 1, 2, 4; controls (e), (f)) |
| **I4** | Step 1 also measures the other bounds, an unknown key, and the hash path | Decision 8 (THE STOP); Task 6 Step 1 |
| **I5** | Rich's `high` row: `ai-path.docker.test.ts` accepts any level; `make demo-gateway` compares levels; it joins Task 7's list | *What Rich does* 3; Read this first 25; Task 2 (Docker expectations); Task 4 (`demo-gateway.sh`, `gateway.ts`); Task 7 Step 2 |
| **I6** | Rich reads the `high` model's zero-retention sentence | Task 7 phases 3 and 6, Step 4; Review Focus 6 |
| **I7** | Task 5's predictions restated from Task 1's line | Task 5 Step 2 and controls (a)–(c) |
| **M1** | Published words still in the old names | Read this first 27; Task 2 (`assessment.ts:267`); Task 3 (intake's three texts); Task 4 (RUNBOOK `:299`, `:316-329`) |
| **M2** | Decision 2's overclaim about new releases | Decision 2; Read this first 26 |
| **M3** | The `staysOnPremise` control's prediction | Task 1 control (d) (`:219` stays green, by the alias); Task 3 control (a) replaced |
| **M4** | `boot.docker.test.ts` run alone, before the tier | Task 6 Steps 6 and 7 (d); the sittings table |
| **M5** | The mock's `level` option tested | Task 5 (`scripted.test.ts`, control (d)) |
| **M6** | Review Focus 3 said what does not happen | Review Focus 3; Task 4 (*a new high session is never given the removed entry*) |
| **M7** | The NOTICE says FE-46/47/5's breaks move to `1.8.0` | Task 1 Step 8 |
| **M8** | The sweep reads a fresh catalogue | Decision 8; Task 6 (no catalogue dep; `loadModelCatalogue(llm)`) |
| **M9** | The network at LiteLLM's last start | *What Rich does* 3; Task 4's RUNBOOK line |
| **M10** | Task 0's file count | Task 0 Steps 6 and 7 |
| **M11** | Both drivers | Task 7's preamble and Step 2 |
| **M12** | Frozen level, not the project's, recorded | Decision 8; Task 0 Step 5 |
| **M13** | Why `medium` holds for the starter | Task 3 (the comment, and `server.js:137-160` checked) |
| **M14** | Snippets a cold agent could not run | Task 2 (`DEFAULTS` literal), Task 3 (`input({ … })`), Task 4 and Task 6 (tests as code) |

**Not taken as written, and why** — sent to `manifest-af` with the hash:
- **C1's own fix** (the renames at Task 2) would still have let Task 1's transform switch stored values first. The re-cut above is the
  review's rule applied one task earlier.
- **I3's control (f)** cannot go red through any entry point with the rank edit alone: the transform canonicalizes before anything ranks
  the alias. It is kept as *rank edit + transform removed*, and Task 1's unit control (a) is what holds the rank by itself.

---

## What executing this plan found

*Each sitting adds a dated entry here: its tasks; every defect, with the measurement that found it; every negative control, and which
could not fail and why; the gate numbers and the machine, queried at the close.*

### Sitting 1 — 2026-10-04, 13:47–15:49 PDT (`manifest-41`, which `ListAgents` later named `mac-lan-rustling-stallman`): Tasks 0–3

**Opened** at Rich's *"proceed with the next sitting for the platform"*, HEAD `9ba4833`, no coordinator and no faculty front-end session live
(`ListAgents`, 13:48 and 14:17), so everything went to Rich directly and this session ran the hold flag. **Three questions at 13:53**, through
the question tool (the decisions file's 13:53 entry): the spec action *"Apply it now"*; E3's wording point (§7e's first cold-start item)
*"Name the frozen level"*; the project-less app containers *"You try it first"* — `manifest-af`'s 23:12 script, run here and ALLOWED: 22 → 12
networks, 30 → 0 `mf-` containers, the four protected containers running.

**Task 0** (`ad35ef9`, decisions entry `7867f61`): every quoted passage of E1, E3–E13 and the shared pages re-found word for word (three
were line-wrapped, read whole); applied by a script that asserted each old text occurred exactly once and read E2, E3, E6 and E8 from the
action's own quote blocks; every old phrase then `grep -c` 0 and every new one 1; `manifest-phases.html` has no mention. **E3's last sentence
is Rich's 13:53 words**, not the 22:21 draft's (*"…every agent session loses each model its project's level no longer allows, and every
running app's key each model the level of the release it runs no longer allows"*), so the spec says what Task 6 builds; Decision 8 and *Decided
by Rich* now say so. The classifier allowed every spec and shared-page edit and read.

**Task 1** (`7f36c5b`): the seven-name rank table (`confidential` at 3), `canonicalLevel`, `levelName`, `levelWords`, the enum accepting
seven and storing what is written, the four readers by level (`models.ts:37`, `releases.ts`'s token rule, `assessment.ts`'s
`staysOnPremise` twice, `gateway-models.ts`'s very-high pin), `asClassification` by `Object.hasOwn`; contract **`1.7.0`**. Every new case red
first at its predicted line (`levels.test.ts` 5 of 6 — *stores what is WRITTEN* green, as it must be; one each in models, incidents,
gateway-models, manifest-yaml; two in assessment); the grep for `=== '<old name>'` outside tests found no reader the plan missed. **The
whole suite on Task 1's tree: 204 files, 3338 passed, every pre-existing test unedited** — the check that no answer moved.

**Task 2** (`59bd934`): the switch — the schema's `transform` and default `medium` (the description lands on the emitted node, so no move to
the inner enum), `specInLevels`, the floors and the catalogue canonical, the diff's two views and `describeDiff` by `levelName`, S6's two
answers, `sessions.ts`'s sentence through `levelWords`, the assessment through `levelWords`/`Words`, the twelve release examples, the PIA
example and the mock's PIA words (`Approved for medium data at most`), `frontend.ts`'s journey check (`very-high`). Every moved expectation
red first as predicted; **`agents.test.ts`'s *keeps a session its project still allows* (the committed `confidential`) stayed GREEN
throughout** — Task 1's level-safe exception doing its job. The two moved Docker files alone: 8/8 and 8/8 (after F1). **The whole suite:
205 files, 3349 passed and 1 timed out** — `source/github/driver.test.ts`'s *refuses to commit a secret* at 5021 ms, load ~3.4; alone 81/81 (a
5 s timeout under load, TRAPS' known shape, not this change).

**Task 3** (`c04e1f3`): E14's hint in levels, naming U1 and stating no law; the deploy-time refusal through `levelName`; `keepsNothing` and
the `high` model's zero-retention sentence; intake at `medium` (its message, `INTAKE_MODEL_UNAVAILABLE`'s summary and remedy, the route's
description — M1); the starter at `medium` with the plan's comment (its claim checked: `server.js:143-144` uses `givenName` and `sn` only for
`/api/me`'s `displayName`; a note keeps the owner's hash, the text and a time, `:157-160`); AGENTS.md's rule 4; the guides' two places that
name a level (`agents.md`'s raise example, `frontend.md`'s session paragraph and the `very-high` app's `ai.models`). Reds first: policy at the
hint only (the four rank cases green, as Tasks 1–2 made them), assessment at the `high` sentence only, intake at *medium*, releases at the
frozen alias in the message.

**What executing it found**

1. **F1 — two Docker files went red whenever 7100 had registered a gateway model, whatever this plan changed.**
   `ai/ai-path.docker.test.ts`'s *the running catalogue matches infra/litellm/config.yaml* and `ai/capable.docker.test.ts`'s *…unset removes
   it* compared the shared LiteLLM's model NAMES with `config.yaml`; 7100, running from Rich's `.env` since the gateway plan's close, registers
   `ubc-qwen-27b` (a `manifest-gateway-` id), so both read one name too many (measured at Task 2 Step 5: `+ "ubc-qwen-27b"`). The capable file's
   own fail-closed case then REMOVES 7100's gateway and capable registrations, which is why a second run is green and the red is order-
   dependent. Both now leave out every `manifest-gateway-` id (`gateway-models.ts`'s `ID_PREFIX`, read from `/model/info`) and hold each such
   entry to a level; proved by restarting 7100 from `.env` (`gateway-controls.sh start real`: `ubc-qwen-27b registered`) and running both again
   with it present: 8/8 and 8/8. Latent since the gateway plan's Task 3; folded into Task 2's commit.
2. **F2 — the plan's own diff test could not pass for a reason that had nothing to do with levels.** *A frozen release's alias equals the same
   level in a new spec* compared `resolveConfig(base(), …, DEFAULTS)` (resources from the defaults) with `sensitiveViewOfSpec(base())`
   (resources as written: none) and answered `['resources']`. The file's own rule is that the two adapters agree only when a spec sets every
   limit; the test now does (`base({ resources: DEFAULTS })`) and gained its positive control (a `high` spec IS a change).
3. **F3 — a moved expectation the plan's list missed: `capable.docker.test.ts`'s fallback refusal** expected *"classified 'public'"*; the
   catalogue now answers the level, so it reads *"classified 'low'"* (the unit file's twin was in the list; the Docker one was not).
4. **F4 — another: `assessment.test.ts`'s undeclared-classification GAP** (*"Manifest treats it as internal"*), which the plan listed as code
   (`:267`, *M1*) but not as a test line; it reads *medium*.
5. **F5 — Task 2's control (a) was predicted red at `agents.test.ts:1063`, and it stays green — correctly.** With `asLevel` answering the
   stored name, the sentence still says *very high*, because `levelWords` canonicalizes any name; the FLOOR is held by `models.test.ts`'s five
   floor cases, which went red. Worked out before recording (a green control is a question): not a hole, two tests holding two things.
6. **F6 — Task 3 named `src/ai/intake.test.ts`, which does not exist**; intake's refusals are tested in `src/api/intake.test.ts`, where the new
   case went.
7. **F7 — the plan's new non-empty assertion at `agents.test.ts:303` ran INSIDE the server's catalogue getter**, so its red (Task 2's control
   (d)) read as `500 INTERNAL`, not as the assertion. Red for the right reason, reading wrong: moved out of the server, asserted before it
   starts (`58afe04`; broken again after, its red now reads *expected 0 to be greater than 0*).

*Smaller, not counted:* Task 1 Step 6's `git diff --stat` list omitted `operations.md` and the console's `llms.txt`, both of which print the
version; the first try at Task 2's control (d) did not apply (prettier had re-wrapped the line) and read 42/42 — re-run with the break proven
by `git diff`, then red.

**Negative controls — each committed first, broken, run, restored by `git checkout`, the break proven by `git diff`:**
- Task 1: (a) `confidential: 2` → red at *ranks EVERY alias* only; (b) `canonicalLevel` by `in` → red at *no prototype name* (`toString`)
  only; (c) the token rule back to `=== 'confidential'` → red at the incidents *written very-high* case only, every `confidential` case green;
  (d) `staysOnPremise` back to the string → red at the two *very-high* assessment cases only, the old `default-chat-onprem`/`confidential` case
  GREEN (*M3*: the alias path, as predicted).
- Task 2: (a) `asLevel` answering the stored name → red at the three `classificationFloor` cases and two new ones; the `toString` case green
  (it falls to the default either way) and `agents.test.ts` 42/42 (F5); (b) `sensitiveViewOfSpec`'s `levelName` removed → red at *a rename …
  is NOT sensitive* only; (e, added) `sensitiveViewOfRelease`'s removed → red at *a frozen release's alias equals* only; (c) `getSpec`'s
  `specInLevels` bypassed → red at its case only; (d) `:303`'s filter left at `internal` → red at that case only.
- Task 3: (a) `keepsNothing` false → red at the zero-retention case only; (b) E14's old hint → red at *the refusal speaks in levels* only; (c)
  the deploy-time `levelName` removed → red at its releases case only.

**The front-end's NOTICE was not delivered**: no `manifest-app-*` session was live at Task 1's commit or after (ListAgents 14:17, 15:48). It is
in ORIENTATION §7e, where the front-end's own ORIENTATION sends its next session.

**The gates at the close:** `pnpm test` twice on the final tree (`58afe04`) — **3358/3358, 205 files**, 945 s and 925 s, load 2.5–4.0; `EXPECT_TESTS` 3326 → **3358**, `EXPECT_FILES` 203 → **205** (counted: Task 1 +12 and one file, Task 2 +12 and one file, Task 3 +8 — the script's comment names each); `pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean. **`pnpm test:docker`**: the whole tier ONCE on `c04e1f3`, in the background, 14:51–15:13, **286/286, 42 files, 1324 s** — §2's number unmoved (no new Docker test this sitting; Task 2's two moved files had already run alone, 8/8 and 8/8); 12 networks at its start, 19 at its end. `make verify` **67**/0/0 and `make doctor` **22**/0/0 after it (`EXPECT_VERIFY`, `EXPECT_DOCTOR` unmoved). The four whole-suite runs of the sitting: Task 1's 3338/204, Task 2's 3349 + 1 timeout (above), and the close's two.

**The machine at the close, queried at 15:47 PDT:** 7100 is PID 57205, restarted from `.env` on REAL GitHub at 15:45 (`gateway-controls.sh start real`: `capableModel registered`, `capableFallback set`, `ubc-qwen-27b registered`, `secretsScrubbed` 16 — it had restarted the same way at 14:24 for F1); its tables hold TWO FIXTURE PROJECTS and their two users (`fixture-…`, `other-…`, 15:46 — the F7 control's single-file run; no container, no repository on GitHub), which the next `pnpm test` truncates. **LiteLLM 1.102.0** (`sha256:32cfd7a4…`), last started 2026-10-04 00:14 PDT (the gateway plan's online acceptance). **12 Docker networks, 0 `mf-` containers, 39 volumes**; the three cleanup scripts bare, then `--apply`, after the tier (7 networks + 1 volume; 7 LiteLLM orphans — `p4b-probe-user`, `mf-platform-intake` and five truncated projects' budgets; 21 app images) — all ALLOWED. The four protected containers running; `.env` untouched (mtime 2026-10-03 23:04); the hold flag FREE. `scripts/snapshot-machine.sh` before (13:54) and after (15:47): the same containers, the edge restarted by the tier, the dead app images gone, HEAD and the dirty count as committed.
