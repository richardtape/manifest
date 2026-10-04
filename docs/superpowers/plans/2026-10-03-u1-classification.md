# Manifest's Data Classes as UBC's U1 Levels — Implementation Plan

> **WRITTEN 2026-10-03, 22:25–23:00 PDT, DOCUMENTS ONLY**, by a fresh platform session Rich started for it, at the word of the
> coordinator `manifest-af`. **Rich decided the shape at 21:48 and the spec action — every sub-decision as recommended — at 22:21**
> (`../2026-09-30-decisions.md`, both entries; *Decided by Rich*, below). **Every fact in *Read this first* was read from the code at
> `bae220f`**, after the UBC AI Gateway plan's Tasks 2–4 landed (`3c05c7f` … `75ed30b`), so `ai/registration.ts`, `ai/gateway-models.ts`
> and `ai/providers.ts` are as that plan's sitting 2 left them. Line numbers WILL move: every task re-reads its own lines before it
> edits them.
> **NOT YET APPROVED.** The coordinator runs a fresh read-only review first; then Rich approves it and chooses how it is executed.

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
3.25.2, drizzle-kit (a migration for the new event type's CHECK). LiteLLM **1.98.0**, pinned by digest (`infra/images.lock`). Docker
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
| 1 | 0, 1, 2, 3 | **The spec action applied** (Task 0, if it is not already). **The levels and their aliases** — one rank table of seven, the enum, **contract `1.7.0`**, the front-end's NOTICE (Task 1). **Every stored level read as its level, and answered in U1's names** (Task 2, S6). **D17's words**: the refusal hint (E14), the deploy-time refusal, the privacy assessment, intake, the blueprint and the guides (Task 3) | **Yes** — `ai/` (Task 2's catalogue and floors) and `releases/` (Task 3's deploy-time message): once, at the close, in the background | **The U1 spec action** — DECIDED 22:21; Task 0 applies it | ← **next** |
| 2 | 4, 5 — **stop point** — 6 | **The capable model's level** as a setting, the builder exception by S4, registration by level and never kept above it, the gateway's `very-high` pin (Task 4). **The token rule** (Task 5, S9). **The app-key sweep** (Task 6, S11) — its Docker case first, because it measures what it rests on | **Yes** — `ai/`, and Task 6's new Docker file: once, at the close | — | |
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

**THIS TABLE IS A SCHEDULE, NOT A CONTRACT.** Four rules survive any re-cut:
- Task 0 is first. No task's code is written before the spec says what it builds.
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

**At 22:21 PDT** (its 22:21 entry), THE U1 SPEC ACTION, DECIDED, NOT APPLIED — *"applied after the UBC AI Gateway plan's acceptance,
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
   the agent may append it at his word, by `printf` reading no other value. **Then a control-plane restart with the network ON** — the
   one boot that re-registers `default-chat-large` at `high` needs LiteLLM to price `gpt-6-luna` (`registration.ts:91-93`); offline it
   is refused, and with Task 4's fix the working `medium` registration is then KEPT (it is below `high`), so `high` apps simply cannot
   use it until a networked boot. The boot line's `capableModel` reads `registered`, then `unchanged` at every boot after.
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
    **Unmeasured** (the spec action's *Read but not verified*): that LiteLLM 1.98.0's `/key/update` narrows an app key named by its
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
   every NEW `appSpecs.parsed` and frozen release holds the level — `spec/resolve.ts:129` freezes the parsed value, so it needs no
   edit), `loadModelCatalogue`, `loadConfig` (gateway entries, the capable
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
   the equivalence at every level.
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
   - **What it withdraws:** the agent sweep's own rule — each model the catalogue SERVES (classified or not) that is not classified at or
     above the release's frozen level for that environment. A model the catalogue no longer serves stays on the key (LiteLLM refuses it).
   - **How:** `/key/update { key: <value>, models: kept }` — or, when nothing kept is allowed, `revokeInstanceKey`, never `models: []`.
   - **Each change:** an `ai.models_withdrawn` event to the project's people, and an operator line. **A release whose frozen level is
     unreadable is NAMED and skipped** — never assumed, in either direction.
   - **THE STOP:** Step 1 measures, on the running LiteLLM, that `/key/update` by VALUE narrows an app key. If it does not, Task 6 stops
     and the coordinator puts Rich two options at code level — update by the key's hash (`token`), if Step 1 measures that it works; or
     REVOKE any key holding a lowered model (stricter: the app's AI stops until its owner redeploys).
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
    Standard U1*, which passes `docs.test.ts` (its patterns are `§n`, `Dnn`, `Cn`, `R1-9`, `Fn`, `FE-n`, plan words — not `U1`).

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
   Expected: **the entry leaves the catalogue; a `high` app is refused it; a `high` project's agent loses it at boot.** Owned by Task 4.
4. **A token reading real people's input** — a `high` project's staging tail answered to a delegated token because the builder setting
   is `on-premise` or the capable model is `high`. Expected: **`403 INCIDENT_LOG_CONFIDENTIAL` at `high` and above, whatever either
   setting; `200` to the person; `200` on the sandbox; `200` to a token on a `medium` project.** Owned by Task 5.
5. **A running app keeping a model now approved below its data** — and the naive fix, a key narrowed to `models: []`, which LiteLLM reads
   as EVERY model. Expected: **the model is taken off the key at the next boot; a key left with nothing allowed is revoked; nothing
   is ever set to `[]`.** Owned by Task 6.
6. **The privacy assessment telling the Privacy Office the wrong thing** — a `high` model described as staying on premises, a `very-high`
   one as *"may leave UBC"*, or *Very-high* printed. Expected: **a `very-high` model stays on premises; a `high` one may leave UBC to a
   provider that keeps nothing it is sent; the level is printed as a person reads it.** Owned by Task 3.

---

## File Structure

```
packages/control-plane/src/spec/
  schema.ts               MOD (T1) LEVELS, Level, LEVEL_ALIASES, CLASSIFICATIONS (7), CLASSIFICATION_RANK (7), DEFAULT_LEVEL, toLevel,
                          canonicalLevel, levelName; the enum, its transform and description. (T2) specInLevels
  index.ts                MOD (T1, T2) the new exports
  levels.test.ts          NEW (T1) the invariant, the seven names, the transform, the default. (T2) specInLevels
  schema.test.ts          MOD (T1) :19's default reads 'medium'
  diff.ts, diff.test.ts   MOD (T2) both views and describeDiff by level
  policy.ts, policy.test.ts   MOD (T3) E14's hint and message in levels; the aliases-never-widen cases
packages/control-plane/src/ai/
  models.ts, models.test.ts   MOD (T2) asLevel, DEFAULT_LEVEL. (T4) builder === 'capable'; words
  catalogue.ts, catalogue.test.ts   MOD (T2) an entry's level, canonical at read
  intake.ts               MOD (T3) CLASSIFICATION_RANK.medium; its message
  capable.ts, capable.test.ts   MOD (T4) the level as a parameter; capableFloor; CAPABLE_CLASSIFICATION removed
  registration.ts, registration.test.ts (or capable.test.ts)   MOD (T4) :237 by level; refuseKeeping(…, level, …)
  gateway-models.ts, gateway-models.test.ts   MOD (T4) the very-high pin; refuseKeeping's level; platformModelsAtBoot's setting
  sessions.ts             MOD (T4) the withdrawal words
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
  launch/assessment.ts, assessment.test.ts   MOD (T3) the levels in a person's words; very-high on premises; high's zero retention
  api/representations/releases.ts   MOD (T2) classification as its level
  api/routes/project-reads.ts       MOD (T2) getSpec in levels; its example
  api/routes/releases.ts            MOD (T2) the examples. (T5) S9's condition, description and message
  api/routes/launch-examples.ts     MOD (T3) the PIA example's words
  api/levels.test.ts                NEW (T2) S6's two answers for an old row
  api/error-codes.ts                MOD (T5) INCIDENT_LOG_CONFIDENTIAL's summary
  api/representations/incidents.ts, agents.ts   MOD (T5) incidents' prompt description. (T4) agents' endReason description
  api/incidents.test.ts             MOD (T5) the level helpers; :150's case inverted; high, medium and alias cases
  api/authz-contract.ts             MOD (T5) declareLevel; a high row and the alias row, last
  api/testing.ts                    MOD (T5) :313's union → Classification
  api/contract/document.ts          MOD (T1) CONTRACT_VERSION 1.7.0 and its paragraph
  api/contract/manifest-yaml.test.ts   MOD (T1) the published enum, default and description
  observability/events.ts, event-schemas.ts, examples.ts   MOD (T4) the agent events' words. (T6) ai.models_withdrawn
  db/schema.ts            MOD (T6) events_type_known gains ai.models_withdrawn
packages/control-plane/drizzle/   NEW (T6) the CHECK's migration, generated
packages/contract/ (generated), packages/contract/package.json   MOD (T1) 1.7.0; regenerated at T2–T6
packages/mock/src/fixtures.ts, server.ts   MOD (T3) the PIA fixture's words. (T5) the `level` option and the refusal at high
packages/journey/src/frontend.ts   MOD (T2) :1104's 'confidential' → 'very-high'
packages/journey/src/levels.ts     NEW (T7)
scripts/demo-levels.sh, scripts/levels-controls.sh   NEW (T7); Makefile, scripts/ci-acceptance.sh, scripts/offline-acceptance.sh MOD (T7)
blueprints/node-ts-mongo/starters/proof-app/manifest.yaml, its README.md, blueprints/node-ts-mongo/agents/AGENTS.md   MOD (T3)
docs/api/agents.md, docs/api/frontend.md   MOD (T3) declaring a level. (T4) the building agent. (T5) the Incident rule
.env.example                       MOD (T4) MANIFEST_CAPABLE_MODEL_CLASSIFICATION; :166, :172, :173, :178's words
docs/superpowers/RUNBOOK.md        MOD (T4) the capable model's level. (T6) the sweep's line. (T7) make demo-levels
docs/superpowers/specs/2026-08-29-manifest-platform-design.md, specs/manifest-*.html   MOD (T0 only — the decided words)
```
**Not touched:** `infra/litellm/config.yaml` (S2 (i)); `fixtures/*/manifest.yaml` (Decision 10); the 74 test literals (Decision 1);
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
  and `:205-210` (S2 (i)'s words); `manifest-schematic.html:1073`. `manifest-phases.html`: `grep -n 'confidential\|classification'` —
  expect no mention, and record it.
- [ ] **Step 6: Check, do not re-read.** `grep -c` each old phrase (expect `0`) and each new one (expect `1`); `git diff --stat` lists the
  five files and nothing else. **If the classifier refuses an edit to the spec or a shared page, stop and ask; never work around it**
  (memory: a refused spec edit cleared on retry after Rich allowed it in chat).
- [ ] **Step 7: The action's banner**: *"APPLIED <date, time from `date`> by `<session>`, at Rich's word (<where it was given>)"*. Commit
  the six paths by name:
  ```bash
  git commit -m "docs(spec): UBC's U1 levels — §7, §10, §16, §20, §26 and D17 as the U1 spec action decided (22:21), and the shared pages (U1 plan Task 0)"
  ```

---

## Task 1: The four levels and their aliases — one rank table of seven, one enum (contract `1.7.0`)

**Its caller is every read of a level**: `manifestSchema` (every validation), and `CLASSIFICATION_RANK`'s eleven readers (Read this
first 2). Nothing else changes behaviour here except what a manifest may say and what it stores.

**Files:**
- Modify: `src/spec/schema.ts:8-16, :258-264`, `src/spec/index.ts:7-9`, `src/spec/schema.test.ts:19`
- Create: `src/spec/levels.test.ts`
- Modify: `src/api/contract/document.ts` (`CONTRACT_VERSION`, its paragraph), `src/api/contract/manifest-yaml.test.ts`,
  `packages/contract/package.json:3`; regenerated: `packages/contract/openapi.json`, `src/schema.d.ts`, `docs/api/reference/`, `llms.txt`

**Interfaces:**
- Produces (from `spec/index.ts`):
  - `LEVELS: readonly ['low','medium','high','very-high']`; `type Level`;
  - `LEVEL_ALIASES: { public: 'low'; internal: 'medium'; confidential: 'very-high' }`;
  - `CLASSIFICATIONS` — the seven names, levels first; `type Classification` — the seven;
  - `CLASSIFICATION_RANK: Record<Classification, number>` — the seven;
  - `DEFAULT_LEVEL: Level` (`'medium'`);
  - `toLevel(name: Classification): Level`;
  - `canonicalLevel(value: unknown): Level | undefined`;
  - `levelName(value: unknown): string` — the level, or the value as written when it is none.

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
      expect(LEVEL_ALIASES).toEqual({
        public: 'low',
        internal: 'medium',
        confidential: 'very-high',
      })
      for (const [alias, level] of Object.entries(LEVEL_ALIASES)) {
        expect(CLASSIFICATION_RANK[alias as keyof typeof LEVEL_ALIASES], alias).toBe(
          CLASSIFICATION_RANK[level],
        )
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

    it('answers each name’s level, and levelName keeps an unknown value as written', () => {
      expect(
        ['low', 'medium', 'high', 'very-high', 'public', 'internal', 'confidential'].map(canonicalLevel),
      ).toEqual(['low', 'medium', 'high', 'very-high', 'low', 'medium', 'very-high'])
      expect(levelName('confidential')).toBe('very-high')
      expect(levelName('secret')).toBe('secret')
    })

    it('accepts all seven in manifest.yaml and STORES THE LEVEL — an alias as what it means (S6)', () => {
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

    it('defaults an undeclared app to medium — today’s internal, so nothing changes (S5)', () => {
      const r = declaring(undefined)
      expect(r.success && r.data.data.classification).toBe('medium')
    })

    it('refuses any other name — and accepts high in the same test', () => {
      for (const v of ['restricted', 'High', 'very_high', 'personal', 'secret']) {
        expect(declaring(v).success, v).toBe(false)
      }
      expect(declaring('high').success).toBe(true)
    })
  })
  ```
  `src/api/contract/manifest-yaml.test.ts` gains:
  ```ts
  it('publishes data.classification as the seven names, default medium, its description naming U1 and the aliases (U1 plan Task 1)', () => {
    const doc = manifestYamlSchema() as {
      properties: { data: { properties: { classification: Record<string, unknown> } } }
    }
    const node = doc.properties.data.properties.classification
    expect(node.enum).toEqual(['low', 'medium', 'high', 'very-high', 'public', 'internal', 'confidential'])
    expect(node.default).toBe('medium')
    expect(String(node.description)).toContain('U1')
    expect(String(node.description)).toMatch(/`confidential` is `very-high`/)
  })
  ```
  `src/spec/schema.test.ts:19` becomes `expect(result.data.data.classification).toBe('medium')`.
- [ ] **Step 2: Run — predict red.** `pnpm exec vitest run --project unit src/spec/levels.test.ts`: every case red — `LEVELS` and
  `LEVEL_ALIASES` are `undefined` (Vitest strips types; the import is no error), so the first `.map` throws. `manifest-yaml.test.ts`: red
  at `node.enum` (three values). `schema.test.ts:19`: red (`'internal'`).
- [ ] **Step 3: Implement.** `src/spec/schema.ts`, replacing `:8-16`:
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

  /** §7's level for an app that declares none (S5): `medium`, today's `internal`. */
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

  /** A level in a sentence a person reads: the level a name means, or the value as written when it is none. */
  export const levelName = (value: unknown): string => canonicalLevel(value) ?? String(value)
  ```
  The field (`:258-264`):
  ```ts
  classification: z
    .enum(CLASSIFICATIONS)
    .default(DEFAULT_LEVEL)
    // THE LEVEL, NEVER THE ALIAS (S6): what is stored says what it means. The OUTPUT type stays the seven names on
    // purpose (the U1 plan's Decision 1): every reader ranks through CLASSIFICATION_RANK, which holds all seven.
    .transform((name): Classification => toLevel(name))
    .describe(
      'How sensitive the app’s data is, in UBC’s four levels (Information Security Standard U1): `low`, `medium`, `high` or `very-high` — what every model in `ai.models` must be approved for. Any personal information, such as students’ names, ID numbers or grades, is `high` at least, and `very-high` data reaches only models on UBC’s own hardware. `medium` when absent. The earlier names are still accepted, each meaning one level: `public` is `low`, `internal` is `medium`, `confidential` is `very-high`.',
    ),
  ```
  `src/spec/index.ts`: export `LEVELS`, `LEVEL_ALIASES`, `CLASSIFICATIONS`, `DEFAULT_LEVEL`, `toLevel`, `canonicalLevel`, `levelName` beside
  `CLASSIFICATION_RANK`, and `type Level` beside `Classification`.
- [ ] **Step 4: Run the three files — green.** Then **read the emitted node** (`manifestYamlSchema().properties.data`): `zod-to-json-schema`
  3.25.2 emits a transform's INPUT by default. **If the description is not on the `classification` node** (an effect's description may
  land elsewhere), move `.describe()` onto the inner `z.enum(…)` and re-run; the test decides, not this step's expectation.
- [ ] **Step 5: The contract.** `src/api/contract/document.ts`: `CONTRACT_VERSION = '1.7.0'`, and a paragraph after `1.6.0`'s:
  ```ts
   * **`1.7.0` SINCE THE U1 PLAN'S TASK 1 (<Task 1's commit date, from `date`>)**: `data.classification` takes UBC's four U1 levels — `low`, `medium`,
   * `high`, `very-high` — beside the three earlier names, which stay valid for ever as aliases (`public` is `low`, `internal` is
   * `medium`, `confidential` is `very-high`); the default is `medium`, which is `internal`'s level. **The behaviour change,
   * stated:** the platform ANSWERS in U1's names — `getSpec`'s `data.classification` and every release's frozen
   * `classification` read `medium` where they read `internal`, for old rows too — and a delegated token is refused staging's
   * and production's Incidents on every project at `high` or above (`INCIDENT_LOG_CONFIDENTIAL`), whatever the building
   * agent's setting. A client that compares a classification must compare the level, never the string. Tasks 2–6 ride on this
   * one bump — the answers in U1's names, the words, the token rule, `ai.models_withdrawn` — because nothing is published
   * between its tasks.
  ```
  `packages/contract/package.json:3`: `"version": "1.7.0"`. Then `pnpm contract:write` (TRUNCATES), `pnpm contract:generate`,
  `pnpm docs:write`. `git diff --stat packages/contract docs/api` names `openapi.json`, `src/schema.d.ts`,
  `docs/api/reference/manifest-yaml.md` and `llms.txt`, and nothing it should not.
- [ ] **Step 6: The mock and the four gates.** `pnpm typecheck` covers `packages/mock`: if any fixture types against `ManifestYaml`'s
  enum (`grep -n "ManifestYaml" packages/mock/src`), it gains nothing — the enum only grew. Then all four gates.
- [ ] **Step 7: THE NOTICE to the front-end, before the commit.** `ListAgents`; message its live `manifest-app-…` session:
  > *"Contract 1.7.0 lands in the next commit (the U1 plan, Task 1). `ManifestYaml`'s `data.classification` now takes UBC's U1 levels —
  > low | medium | high | very-high — and still the old three, each an alias with one meaning (public=low, internal=medium,
  > confidential=very-high); default medium. Coming in the next commits, all on 1.7.0: the platform ANSWERS in U1's names (getSpec and a
  > release's classification read `medium` where they read `internal`, old rows too); a token is refused staging's and production's
  > Incidents on any project at `high` or above, whatever the builder setting (still 403 INCIDENT_LOG_CONFIDENTIAL); the mock gains
  > MANIFEST_MOCK_LEVEL beside MANIFEST_MOCK_CONFIDENTIAL. Nothing you compare changes: you key off the code and model names. THE ASK
  > (yours to schedule, by your own plan): your agents and words in U1's names — lead.ts:42, 54, 125, 243-245 (very-high means on
  > premises only; declare a level every time; any personal information is high), build/round.ts:590-591, 666, 705-709, 1471, 1602,
  > api/progress.ts:181, 289-291, api/round-state.ts:27, platform/instances.ts:40-48, 108-112 (the 403 now arrives for high projects
  > too), web/src/words.ts:396-453, screens/building/needs.tsx:185. Hold Vitest and Docker on your side until I say FREE?"*

  Commit after its reply or a fair wait (and FREE it after).
- [ ] **Step 8: Commit by name**, then **the negative controls**, each committed first, broken, seen red where predicted, restored:
  - **(a)** `CLASSIFICATION_RANK.confidential` set to `2`: predict red at *ranks EVERY alias exactly at its level* only;
  - **(b)** the transform removed: predict red at *STORES THE LEVEL* (`public` stored as `public`), and nowhere else in this file;
  - **(c)** `canonicalLevel` written with `in`: predict red at *no prototype name is a level* (`toString`).
  ```bash
  git commit -m "feat(spec): UBC's U1 levels — low|medium|high|very-high, the old three as aliases ranked at their level, stored as the level; contract 1.7.0 (U1 plan Task 1)"
  ```

---

## Task 2: Every stored level read as its level, and answered in U1's names (S6)

**Its callers**: the floors (`classificationFloor`, `environmentFloor` — every agent session, the Incident safeguard), the catalogue
(every validation, deploy, session and assessment), the sensitive diff (every validation and production deploy), `getSpec` and
`toRelease` (every read of a spec or release). After this task, a stored alias is ranked, compared and answered as its level.

**Files:**
- Modify: `src/ai/models.ts:47-60, 76-105, 117-140`; `src/ai/catalogue.ts:98-115`; `src/spec/diff.ts:220-260, 553-556`;
  `src/spec/schema.ts` (`specInLevels`), `src/spec/index.ts`; `src/api/representations/releases.ts:138`;
  `src/api/routes/project-reads.ts:717, 745-750`; `src/api/routes/releases.ts` (the twelve examples, Read this first 11);
  `packages/journey/src/frontend.ts:1104-1105`
- Test: `src/ai/models.test.ts`, `src/ai/catalogue.test.ts`, `src/spec/diff.test.ts`, `src/spec/levels.test.ts`; Create:
  `src/api/levels.test.ts`

**Interfaces:**
- Consumes: Task 1's `canonicalLevel`, `levelName`, `DEFAULT_LEVEL`, `Level`.
- Produces:
  - `classificationFloor(db, projectId): Promise<Level>` and `environmentFloor(db, environment): Promise<Level>` — canonical;
  - `ModelEntry.maxClassification` holds a canonical value (its type stays `Classification`, Decision 1);
  - `specInLevels(parsed: unknown): Record<string, unknown>` (`spec/schema.ts`) — a stored `parsed` with `data.classification` as its
    level, everything else as stored.

- [ ] **Step 1: The failing tests.** `src/ai/models.test.ts` (its `spec` and `servingProduction` helpers):
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
  **Expectations that move, named:** `models.test.ts:163-185` (*"…internal when there is none"*: `'internal'` → `'medium'`, `'public'` →
  `'low'`, `'confidential'` → `'very-high'`; the title says *medium*), `:186-198` and `:199-…` the same way — the floor is now the level.

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
  Any existing case asserting `maxClassification: 'internal'` or `'confidential'` from `RESPONSE` moves to `'medium'` / `'very-high'`
  (name each in the record).

  `src/spec/diff.test.ts`:
  ```ts
  describe('a level compared as a level (U1 plan Task 2; Review Focus 2)', () => {
    /** A spec as an OLD row holds it — parsed before Task 1, its alias kept — as `api/spec-validation.ts:78` reads it back. */
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
      const before = {
        ...resolveConfig(base(), 'production', DEFAULTS),
        classification: 'internal',
      } as ResolvedConfig
      const after = resolveConfig(base({ data: { classification: 'high' } }), 'production', DEFAULTS)
      const changes = describeDiff(before, after).filter((c) => c.path === 'data.classification')
      expect(changes).toEqual([
        { path: 'data.classification', from: 'medium', to: 'high', summary: 'now declares high data instead of medium' },
      ])
      expect(
        describeDiff({ ...before, classification: 'internal' }, { ...before, classification: 'medium' }).filter(
          (c) => c.path === 'data.classification',
        ),
      ).toEqual([])
    })
  })
  ```
  *(`DEFAULTS` is `diff.test.ts`'s own resource defaults, as its `:165` and `:410` pass them: `resolveConfig(spec, kind, defaults)`
  (`resolve.ts:106-109`); `describeDiff(before, after)` (`diff.ts:496-499`).)*

  `src/spec/levels.test.ts` gains:
  ```ts
  it('specInLevels answers a stored spec with its level, and leaves everything else as stored', () => {
    expect(specInLevels({ name: 'x', data: { classification: 'internal', retention_days: 30 } })).toEqual({
      name: 'x',
      data: { classification: 'medium', retention_days: 30 },
    })
    expect(specInLevels({ data: { classification: 'secret' } })).toEqual({ data: { classification: 'secret' } })
    expect(specInLevels({ name: 'y' })).toEqual({ name: 'y' })
  })
  ```
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
        // A release whose resolvedConfig was frozen before Task 1 — written directly, as `incidents.test.ts:24-74` does.
        const releaseId = await frozenRelease(ctx, 'confidential')
        const res = await ctx.app.inject({
          method: 'GET',
          url: `/v1/releases/${releaseId}`,
          cookies: ctx.ownerCookies,
        })
        expect(res.statusCode, res.body).toBe(200)
        const config = (res.json() as { config: Record<string, { classification: string }> }).config
        expect(Object.values(config).map((c) => c.classification)).toEqual(['very-high', 'very-high', 'very-high'])
      })
    })
  })
  ```
  `frozenRelease(ctx, classification)` writes a build and a release whose `resolvedConfig` is each environment's full frozen config
  with that `classification` — **copy the shape from a real release** (`resolveConfig(manifestSchema.parse(minimal), kind, defaults)`
  for each kind, with the resource defaults `diff.test.ts` uses, then override `classification`), because `toRelease` reads every field
  of it.
- [ ] **Step 2: Run — predict red.** `models.test.ts`: the new cases red at `'internal'` / `'confidential'` / `'toString'` answered as
  stored. `catalogue.test.ts`: red at `['default-chat', 'internal']`. `diff.test.ts`: red at *NOT sensitive* (`['data.classification']`)
  and at the description (`from: 'internal'`). `levels.test.ts`: red at `specInLevels` (`undefined` is not a function). `api/levels.test.ts`:
  red at `'internal'` and `'confidential'`.
- [ ] **Step 3: Implement.**
  - **`ai/models.ts`**: `DEFAULT_CLASSIFICATION` becomes `DEFAULT_LEVEL` (imported); `asClassification` becomes
    `const asLevel = (value: unknown): Level | undefined => canonicalLevel(value)`; `classificationFloor` and `environmentFloor` answer
    `Promise<Level>`; the comparisons stay by rank.
  - **`ai/catalogue.ts:98-115`**: `const level = canonicalLevel(row.model_info?.max_classification)`; unclassified when `undefined`;
    `maxClassification: level`. Keep the comment's `Object.hasOwn` reasoning, now `canonicalLevel`'s.
  - **`spec/diff.ts`**: `sensitiveViewOfSpec` (`:227`) and `sensitiveViewOfRelease` (`:250`) set `classification:
    levelName(…)` — so `:183`'s comparison is of levels; `describeDiff`'s `valueChange('data.classification', …)` (`:552-557`) passes
    `levelName(before.classification)` and `levelName(after.classification)`, and its summary names them.
  - **`spec/schema.ts`**: 
    ```ts
    /** A stored `parsed` manifest as the platform answers it (S6): `data.classification` as its level; everything else as stored. */
    export function specInLevels(parsed: unknown): Record<string, unknown> {
      const spec = (parsed ?? {}) as Record<string, unknown>
      const data = spec.data as Record<string, unknown> | undefined
      const level = canonicalLevel(data?.classification)
      return data === undefined || level === undefined ? spec : { ...spec, data: { ...data, classification: level } }
    }
    ```
  - **`api/routes/project-reads.ts:749`**: `spec: specInLevels(latest.parsed)`; its example (`:717`) `classification: 'medium'`.
  - **`api/representations/releases.ts:138`**: `classification: levelName(c.classification)`.
  - **`api/routes/releases.ts`**: the twelve examples' `classification: 'internal'` → `'medium'`.
  - **`packages/journey/src/frontend.ts:1104-1105`**: `=== 'very-high'` (its check's words: *"the release is frozen very-high (the
    manifest says confidential, its alias)"*).
- [ ] **Step 4: Run each file — green**, one at a time. Then `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write` (the
  examples moved), and the four gates. Message the front-end's session one line (*"1.7.0's examples now say medium; getSpec and releases
  answer levels"*) before committing.
- [ ] **Step 5: Commit by name**, then **the negative controls**:
  - **(a)** `asLevel` back to `value in CLASSIFICATION_RANK ? value : undefined`: predict red at *toString … the default stands* and at
    the alias cases (`'confidential'` answered as stored);
  - **(b)** `sensitiveViewOfSpec`'s `levelName` removed: predict red at *a rename … is NOT sensitive* only — the positive control stays
    green;
  - **(c)** `getSpec`'s `specInLevels` removed: predict red at *getSpec answers an old row's alias as its level* only.
  ```bash
  git commit -m "feat(spec,ai): every stored level read and compared as its level, and answered in U1's names — old rows too (U1 plan Task 2, S6)"
  ```

---

## Task 3: D17 in U1's words — the refusal hint (E14), the deploy-time refusal, the privacy assessment, intake, the blueprint and the guides

**Its callers**: `checkPolicy` (every validation), `deployRelease`'s D17 re-check (every deploy), `draftPrivacyAssessment` (the owner's
launch errand), `startIntakeSession` (every intake). And every agent that writes a `manifest.yaml`: the blueprint's starter and
AGENTS.md, and the two guides.

**Files:**
- Modify: `src/spec/policy.ts:207-217`, `src/releases/release.ts:1093-1105`, `src/launch/assessment.ts:93-97, 190-220, 355-395`,
  `src/ai/intake.ts:60-70`, `src/api/routes/launch-examples.ts:388-401, 477`, `packages/mock/src/fixtures.ts:1310-1315, 1400`
- Modify: `blueprints/node-ts-mongo/starters/proof-app/manifest.yaml:55-64` and its `README.md:62, 83-84`,
  `blueprints/node-ts-mongo/agents/AGENTS.md:209-211`, `docs/api/agents.md`, `docs/api/frontend.md`
- Test: `src/spec/policy.test.ts`, `src/launch/assessment.test.ts`, `src/releases/releases.test.ts` (the deploy-time case beside
  `:2970`'s), `src/ai/intake.test.ts`

**Interfaces:**
- Consumes: Task 1's `levelName`, `canonicalLevel`; Task 2's canonical catalogue.
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

  `src/launch/assessment.test.ts` — the expectations that move, and two new cases. With `CATALOGUE` (`:38-40`, aliases kept):
  - `:202` → `'Medium — every AI model the app uses must be approved for medium data.'`;
  - `:213` → `'Approved for medium data at most: it may be answered by a provider off-premise, so what the app sends it may leave UBC.'`;
  - `:219` → `'Approved for very high data: it runs on on-premise hardware, so what the app sends it stays there.'`;
  - `:235` → `'Medium — Manifest’s default, because the manifest does not say: every AI model the app uses must be approved for medium data.'`;
  - `:354` → `'Approved for medium data at most.'`; `:357` → `'Approved for very high data at most.'`.
  ```ts
  it('a very-high app’s rule is on-premise hardware, printed as a person reads it (Review Focus 6)', () => {
    const draft = assess({ ...input, spec: specDeclaring('confidential') })
    expect(fact(draft, 'flows', 'Classification')?.value).toBe(
      'Very high — every AI model the app uses must run on on-premise hardware.',
    )
  })
  it('a high model may leave UBC to a provider that keeps nothing — the zero-retention sentence', () => {
    const draft = assess({
      ...input,
      spec: specDeclaring('high', ['gw-high']),
      catalogue: [...CATALOGUE, { name: 'gw-high', maxClassification: 'high', kind: 'chat' }],
    })
    expect(fact(draft, 'flows', 'gw-high')?.value).toBe(
      'Approved for high data at most: it may be answered by a provider off-premise that keeps none of what it is sent ' +
        '(zero data retention), as the platform’s administrator attests, so what the app sends it may leave UBC but is not kept there.',
    )
    expect(fact(draft, 'flows', 'Classification')?.value).toBe(
      'High — every AI model the app uses must be approved for high data.',
    )
  })
  ```
  *(`assess`, `input`, `specDeclaring` and `fact` are this file's own helpers, or the shapes it already builds by hand — read
  `assessment.test.ts:1-60` and use what it has; add a one-line `fact` finder if it has none.)*

  `src/ai/intake.test.ts`: the refusal's message names *medium* — `INTAKE_MODEL_UNAVAILABLE`, its message containing *"approved for
  medium data"* — with an entry lowered to `public` (the alias, so `low`); and its positive control at `internal`.
- [ ] **Step 2: Run — predict red**: `policy.test.ts` red at the message/hint (and green at the four rank cases, which Tasks 1–2 already
  made right — **if the two "never widen" cases were red here, a rank is wrong: stop and read it**); `assessment.test.ts` red at every
  moved string; `releases.test.ts` red at the message; `intake.test.ts` red at *medium*.
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
  - **`launch/assessment.ts`**: replace `capitalised` and `staysOnPremise` (`:93-97`):
    ```ts
    /** A level as a person reads it — U1's own words ("Very High Risk"), never the value's hyphen. */
    const LEVEL_WORDS: Record<Level, string> = { low: 'low', medium: 'medium', high: 'high', 'very-high': 'very high' }
    const words = (value: Classification): string => LEVEL_WORDS[toLevel(value)]
    const Words = (value: Classification): string => {
      const w = words(value)
      return `${w.charAt(0).toUpperCase()}${w.slice(1)}`
    }
    /** Approved for `very-high` data means on-premise only (§7: such an app resolves to nothing else). */
    const staysOnPremise = (ceiling: Classification) => toLevel(ceiling) === 'very-high'
    /** Approved for `high`: on premises, or a provider that keeps none of what it is sent (§7's rule, attested). */
    const keepsNothing = (ceiling: Classification) => toLevel(ceiling) === 'high'
    ```
    `modelFlow`'s value: `staysOnPremise` → *"Approved for very high data: it runs on on-premise hardware, so what the app sends it
    stays there."*; `keepsNothing` → the zero-retention sentence the test names; otherwise *"Approved for ${words(max)} data at most: it
    may be answered by a provider off-premise, so what the app sends it may leave UBC."* `flows`' rule (`:207`): `staysOnPremise(ceiling)`
    → *on-premise hardware*; otherwise *approved for ${words(ceiling)} data*; its fact `` `${Words(ceiling)} — ${rule}` ``. `hosting`
    (`:381`): `` `Approved for ${words(e.maxClassification)} data at most.` ``; its gap (`:390`): `` `Whether the app’s ${words(…)} data
    may reach…` ``.
  - **`ai/intake.ts:64-68`**: `CLASSIFICATION_RANK.medium`, and *"…not a catalogue model approved for medium data…"*.
  - **`api/routes/launch-examples.ts:388-401, 477`** and **`packages/mock/src/fixtures.ts:1310-1315, 1400`**: the same words — the mock's
    *Low* line is already right; its *"default-chat: Approved for internal data at most…"* (twice) reads *medium*. Contract and mock in
    the SAME commit.
  - **The blueprint.** `proof-app/manifest.yaml:55-64`:
    ```yaml
    data:
      # UBC's U1 level (Information Security Standard U1): the most sensitive information the app keeps or sends to a
      # model. The notes are course work, not personal records, and the app stores no UBC identifier at all — a note is
      # keyed on sha256(puid ‖ project ‖ environment) — so `medium`. Any personal information (a student's name, ID or
      # grades) would make it `high`, and `high` refuses `default-chat` at validation (SPEC_MODEL_CLASSIFICATION_TOO_LOW):
      # the gate working, as `make demo-ai`'s negative control (b) shows with `confidential`.
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
- [ ] **Step 4: Run each file — green**; then `pnpm contract:write`, `pnpm contract:generate`, `pnpm docs:write` (the PIA example), the
  four gates. One line to the front-end's session before committing (*"the mock's PIA fixture now says medium"*).
- [ ] **Step 5: Commit by name**, then **the negative controls**:
  - **(a)** `staysOnPremise` back to `=== 'confidential'`: predict red at *a very-high app's rule is on-premise hardware* and at `:219`'s
    moved string (a canonical `very-high` from the catalogue no longer matches);
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
  `docs/api/agents.md:21, 23, 28, 129`, `docs/api/frontend.md:34, 37, 96`, `docs/superpowers/RUNBOOK.md` (*The capable model*)
- Test: `src/ai/capable.test.ts`, `src/ai/gateway-models.test.ts`, `src/ai/models.test.ts`, `src/config.test.ts`,
  `src/ai/capable.docker.test.ts`

**Interfaces:**
- Consumes: Task 1's `CLASSIFICATIONS`, `toLevel`, `canonicalLevel`, `DEFAULT_LEVEL`; Task 2's canonical catalogue.
- Produces:
  - `config.litellm.capableClassification: Level` (from `MANIFEST_CAPABLE_MODEL_CLASSIFICATION`, default `'medium'`);
  - `config.litellm.gatewayModels[].classification` canonical (`Level`);
  - `ensureCapableModel(client, setting, gateway?, classification: Classification = DEFAULT_LEVEL)`;
  - `ensureCapableFallback(client, setting, classification: Classification = DEFAULT_LEVEL)`;
  - `capableModelAtBoot(client, setting, fallback, gateway, classification: Classification)` — REQUIRED here, so the boot cannot miss it;
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
  `src/ai/capable.test.ts` (with its `fakeLiteLlm`):
  ```ts
  it('registers the capable model at the level it is given (S3)', async () => {
    /* ensureCapableModel(lite, 'openai/gpt-6-luna', undefined, 'high') → 'registered'; /model/info's model_info.max_classification 'high' */
  })
  it('an alias row is UNCHANGED at its level — no row is re-created for its name (I7; Review Focus 2)', async () => {
    /* register at 'internal' (as tonight's rows were), then ensureCapableModel(…, 'medium') → state 'unchanged', and the fake
       saw no /model/new; then (…, 'high') → 'registered' — the positive control */
  })
  it('a fallback below the capable model’s level is refused — the floor moves with the setting', async () => {
    /* a 'medium' entry named as the fallback: ensureCapableFallback(lite, 'probe-medium-chat', 'high') → refused,
       its reason containing "below 'high'"; the same with 'medium' → set */
  })
  ```
  `:48`'s expected create body moves to `max_classification: 'medium'` (the default); `:551`'s `"below 'internal'"` → `"below 'medium'"`.

  `src/ai/gateway-models.test.ts` (with Task 3 of the gateway plan's `GW`):
  ```ts
  it('a level LOWERED while its re-registration is refused leaves the catalogue — never kept higher (I1; Review Focus 3)', async () => {
    const lite = fakeLiteLlm()
    await ensureGatewayModels(lite, [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'high' }], GW)
    expect((await loadModelCatalogue(lite)).models.find((m) => m.name === 'gw-zdr')?.maxClassification).toBe('high')
    lite.price('openai/gpt-x', 0) // LiteLLM restarted offline: it prices gpt-* at 0 (registration.ts:91-93)
    const r = await ensureGatewayModels(lite, [{ name: 'gw-zdr', setting: 'ubc-ai-gateway/gpt-x', classification: 'medium' }], GW)
    expect(r.models).toEqual([expect.objectContaining({ name: 'gw-zdr', state: 'refused' })])
    const after = await loadModelCatalogue(lite)
    expect(after.models.map((m) => m.name)).not.toContain('gw-zdr')
    // A high app is refused it — unknown now, which fails closed (Decision 6).
    const ctx = { ...validationContextFor(after) }
    expect(errorCodes(highAppUsing('gw-zdr'), ctx)).toEqual(['SPEC_MODEL_UNKNOWN'])
  })
  it('a refusal KEEPS a working registration at or below the level asked for — the positive control', async () => {
    /* registered at 'medium'; re-asked at 'high' while unpriced → refused, and gw-x still listed at 'medium' */
  })
  it('an unpriced very-high entry — confidential, its alias, included — is pinned at the stand-in’s price', async () => {
    /* the gateway plan's case, once with 'very-high' and once with 'confidential': both registered at 1e-6/3e-6 */
  })
  ```
  *(`validationContextFor` and `highAppUsing` are two-line helpers in the test: the `ValidationContext` from a snapshot, and
  `yaml(...)`'s text with `data.classification: high` and that model — copy `policy.test.ts:4-31`'s shapes.)*
- [ ] **Step 2: Run — predict red**: `config.test.ts` at `capableClassification` (`undefined`) and at `@high` (refused by the old
  regex); `models.test.ts` at *high project … while the setting is capable* (the old exception fires only at `confidential`);
  `capable.test.ts` at the level (`'internal'` registered) and *UNCHANGED* (`'registered'`: string compare); `gateway-models.test.ts` at
  *leaves the catalogue* (kept at `high`) and at the `very-high` pin (refused unpriced).
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
  - **`ai/capable.ts`**: `CAPABLE_CLASSIFICATION` removed; `ensureCapableModel(client, setting, gateway?, classification = DEFAULT_LEVEL)`
    passes `classification` to `ensureRegistered` and to `refuseKeeping` (`:102-107`); `capableFloor(snapshot, classification)` reduces
    from `toLevel(classification)`; `ensureCapableFallback(client, setting, classification = DEFAULT_LEVEL)` and `unfit` take it;
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
  - **`ai/models.ts:37`**: `const building = builder === 'capable'`, with its comment rewritten for S4: *"…the capable model to a project
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
    project"* → *"on a project above the capable model's level"*; *"internal or public"* → *"at or below its level"*. RUNBOOK's *The capable model*: the setting, its default,
    Rich's `high`, and that the one boot that re-registers it needs the network.
- [ ] **Step 4: Run each unit file — green.** Then the **Docker case**, `capable.docker.test.ts` (after `startingClear`, on the real
  LiteLLM): register the capable model at `'high'` (the file's existing setting) and read `/model/info`'s `max_classification: 'high'`;
  then a row registered at `'internal'` is `unchanged` at `'medium'` — **the real LiteLLM round-trips `max_classification` as given**,
  which is what `:237`'s comparison relies on. One file: `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker
  src/ai/capable.docker.test.ts`. Then `pnpm contract:write`, `contract:generate`, `docs:write` (the event and agent descriptions), the
  four gates; one line to the front-end.
- [ ] **Step 5: Commit by name**, then **the negative controls**:
  - **(a)** `refuseKeeping`'s `atOrBelow` removed: predict red at *leaves the catalogue* only — the positive control stays green;
  - **(b)** `:237` back to string equality: predict red at *an alias row is UNCHANGED* only;
  - **(c)** `building` back to `floor === 'very-high' && builder === 'capable'`: predict red at *a high project's agent gets it while the
    setting is capable* only;
  - **(d)** `capableModelAtBoot` given the literal `'medium'` instead of the setting: predict red at *the floor moves with the setting*
    through the boot path, and the boot-line case.
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
- Modify: `packages/mock/src/server.ts:98-102, 456-463, 709, 730, 1197`, `packages/mock/src/fixtures.ts:856-867` (a doc line only)
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
- [ ] **Step 2: Run — predict red**: the inverted case and the `on-premise` half of the `high` case answer `200` (the builder term); the
  `capable` half of the `high` case answers `200` too (`=== 'confidential'`); the alias positive control is green already (a real
  green: medium was never refused). The two authz rows red at `token-capable`.
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
  - **(a)** the condition back to `=== 'very-high'`: predict red at both halves of the `high` case and at the authz row *a high project*;
    green at the alias row (confidential IS very-high) — that is why both rows exist;
  - **(b)** the builder term restored (`&& deps.config.agent.builderModels === 'capable'`): predict red at the inverted case and the
    `on-premise` half only;
  - **(c)** `>=` written `>`: predict red at the `high` case only.
  ```bash
  git commit -m "feat(api): a delegated token is refused the staging and production Incidents of every project at high or above, whatever the builder setting (U1 plan Task 5, S9)"
  ```

---

## Task 6: A lowered level takes effect on running apps — their keys narrowed at boot, or revoked (S11)

**Its caller**: `index.ts`'s boot, **straight after `narrowSessionsHoldingMore`** (`:511-532`), through `appKeysAtBoot`. **Not before the
catalogue**: the sweep reads the catalogue the boot's own registrations just made.

**Files:**
- Create: `src/ai/app-key-sweep.ts`, `src/ai/app-key-sweep.test.ts`, `src/ai/app-key-sweep.docker.test.ts`
- Modify: `src/ai/testing.ts:489-505` (the fake's `/key/update` by value), `src/ai/index.ts` (exports), `src/index.ts` (the call, the
  boot line)
- Modify: `src/observability/events.ts`, `event-schemas.ts`, `examples.ts`, `src/db/schema.ts:1196`; Create: the migration (generated)
- Modify: `docs/superpowers/RUNBOOK.md` (one paragraph: what the boot line's `appKeysWithdrawn` means, and what an owner does)

**Interfaces:**
- Consumes: Task 2's `canonicalLevel`, the canonical catalogue; `getSecret`, `revokeInstanceKey`, `instanceKeySecretName`,
  `LLM_API_KEY_SECRET` (`ai/keys.ts`); `publishEvent`, `makeRedactor`.
- Produces:
  - `interface AppKeySweep { narrowed: string[]; revoked: string[]; failed: string[]; legacy: number }` — instance ids, and the count
    of P4b's environment-level keys;
  - `withdrawLoweredAppModels(deps: AppKeySweepDeps): Promise<AppKeySweep>`;
  - `countLegacyKeys(db: Pick<Db, 'select'>): Promise<number>` — the secrets named exactly `LLM_API_KEY_SECRET` (`app:llmApiKey`), by
    `count()` over `secrets` where `name = LLM_API_KEY_SECRET`;
  - `interface AppKeySweepDeps { db: Db; bus: EventBus; llm: LiteLlmClient; keys: MasterKeypair; catalogue: { get(): Promise<CatalogueSnapshot> } }`;
  - `appKeysAtBoot(deps): Promise<{ narrowed: number; revoked: number; failed: number } | 'failed'>` — never throws;
  - the event `ai.models_withdrawn`: `{ instanceId, environment, withdrawn: string[] (min 1), models: string[], revoked: boolean }`.

- [ ] **Step 1: MEASURE FIRST — the Docker case, run ALONE before any code** (Decision 8's stop). `app-key-sweep.docker.test.ts`, its
  first case, against the running LiteLLM (the file's own users, cleaned up after; nothing else touched):
  ```ts
  describeDocker('app keys narrowed at boot, against the running gateway (U1 plan Task 6)', () => {
    it('LiteLLM 1.98.0 narrows an APP key named by its VALUE — the premise of S11’s sweep', { timeout: 120_000 }, async () => {
      const client = createLiteLlmClient({ baseUrl: litellmUrl(), masterKey: litellmMasterKey() })
      const projectId = randomUUID()
      const key = await mintAppKey(client, {
        projectId,
        projectSlug: `sweep-${projectId.slice(0, 8)}`,
        kind: 'staging',
        models: ['default-chat', 'default-chat-onprem'],
        monthlyUsd: 1,
      })
      try {
        expect((await chat(key, 'default-chat-onprem')).status).not.toBe(403) // held before the narrowing
        await client.post('/key/update', { key, models: ['default-chat'] })
        expect(await chat(key, 'default-chat-onprem')).toEqual({ status: 403, type: 'key_model_access_denied' })
        expect((await chat(key, 'default-chat')).status).toBe(200) // the positive control: the kept model answers
      } finally {
        await discardAppKey(client, key)
        await deleteAppUsers(client, projectId)
      }
    })
  })
  ```
  *(`describeDocker` from `runtime/testing.js`; `createLiteLlmClient`; `litellmUrl` and `litellmMasterKey` from `ai/testing.js`; and
  `chat(key, model)` copied from `ai/agent-keys.docker.test.ts:20-39`, which answers `{ status, type? }` raw — the way that file measured
  `narrowAgentKey`. `deleteAppUsers` (`ai/keys.ts:89`) removes the LiteLLM user `mintAppKey` created. The refused call is decided before
  any model is loaded; the kept one needs `default-chat` warm, as the tier does.)* Run:
  `MANIFEST_TEST_DOCKER=1 pnpm exec vitest run --project docker src/ai/app-key-sweep.docker.test.ts`. **Red at the `403` (the update
  answered `2xx` and narrowed nothing) or at `/key/update` itself: STOP.** Record the status and `error.type` (never a key) and tell the
  coordinator: Decision 8's two options go to Rich. **Green: continue.** Record the measurement either way.
- [ ] **Step 2: The failing unit tests.** `app-key-sweep.test.ts`, with `withProject`, a `fakeLiteLlm` whose `/key/update` now finds a key
  by `key` as well as by alias (Step 4), and a catalogue stub:
  ```ts
  describe('withdrawLoweredAppModels — a lowered level takes effect on running apps (S11; U1 plan Task 6)', () => {
    it('narrows a key holding a model now ranked below its release’s level, by value, and records why', async () => {
      /* an instance in staging, its release frozen 'high' with ai.models [gw-zdr, default-chat-onprem], its key recorded;
         the catalogue: gw-zdr at 'medium' (lowered), default-chat-onprem at 'very-high'.
         → narrowed: [instanceId]; the fake's key holds ['default-chat-onprem']; one ai.models_withdrawn event
           { withdrawn: ['gw-zdr'], models: ['default-chat-onprem'], revoked: false }; its humanMessage names gw-zdr and 'high'. */
    })
    it('REVOKES a key left with nothing it may use — never models: [] (Review Focus 5)', async () => {
      /* frozen 'high', ai.models ['gw-zdr'], gw-zdr lowered to 'medium' → revoked: [instanceId]; the fake holds no such key;
         the instance's secret is gone; the event says revoked: true, models: []; and NO /key/update was sent with models: [] */
    })
    it('reads a frozen alias as its level: confidential keeps an on-premise model and loses a high one', async () => {
      /* frozen 'confidential', ai.models [gw-high, default-chat-onprem], gw-high at 'high' → narrowed to ['default-chat-onprem'] */
    })
    it('changes nothing when every model is still allowed — and a model the catalogue no longer serves stays on the key', async () => {
      /* frozen 'medium', ai.models ['default-chat', 'gone-model']; default-chat at 'medium'; gone-model not served
         → nothing narrowed, revoked or recorded — the positive control */
    })
    it('names and skips an instance whose release has no readable level — never assumed', async () => {
      /* resolvedConfig.staging.classification 'secret' → failed: [instanceId]; one operator line naming the instance; key untouched */
    })
    it('counts P4b’s environment-level keys, names them in one line, and checks none', async () => {
      /* a secret named exactly 'app:llmApiKey' → legacy: 1, one line, nothing else */
    })
    it('a gateway that refuses one key is that key’s line, and the sweep goes on to the next', async () => {
      /* two instances; the fake fails /key/update once → failed: [first], narrowed: [second] */
    })
  })
  it('appKeysAtBoot is never fatal: a gateway that does not answer is one line and "failed"', async () => {})
  ```
- [ ] **Step 3: Run — predict red** at the import (`withdrawLoweredAppModels` is `undefined`).
- [ ] **Step 4: Implement.**
  - **`ai/testing.ts`** (`/key/update`): `const k = typeof body.key === 'string' ? keys.get(body.key) : [...keys.values()].find((x) =>
    x.alias === String(body.key_alias))` — as 1.98.0 answers (Step 1's measurement), an unknown key `404 not_found_error`.
  - **`ai/app-key-sweep.ts`**:
    ```ts
    /**
     * A LOWERED LEVEL TAKES EFFECT ON RUNNING APPS (§7 as the U1 spec action amended it; S11 — Rich, 2026-10-03, 22:21). A model's
     * level is lowered when everything that may answer it no longer meets the rule its old level needed — a provider's zero
     * retention lapsing — and the catalogue then refuses it to new validations and deploys (D17, twice). A key a RUNNING instance
     * already holds would still reach it. So at every boot, after the catalogue is the one this process serves and after the agent
     * sessions' sweep, each instance's key loses every model its release's frozen level no longer allows — or, when nothing it may
     * use is left, is REVOKED: LiteLLM reads `models: []` as every model (`ai/keys.ts:137-141`). Each change is an
     * `ai.models_withdrawn` event to the project's people and an operator line. The rule is the agent sweep's (`ai/sessions.ts`): a
     * model the catalogue SERVES and does not allow is withdrawn; one it no longer serves stays, and LiteLLM refuses it.
     */
    export async function withdrawLoweredAppModels(deps: AppKeySweepDeps): Promise<AppKeySweep> {
      const snapshot = await deps.catalogue.get()
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
          const key = await getSecret(deps.db, { projectId: scope.projectId, environmentKind: scope.kind,
            name: instanceKeySecretName(instance.id) }, deps.keys)
          if (key === undefined) continue
          const frozen = (release.resolvedConfig as Record<string, { classification?: unknown; ai?: { models?: string[] } }>)[
            environment.kind
          ]
          const level = canonicalLevel(frozen?.classification)
          if (level === undefined) {
            console.error(`app key sweep: instance ${instance.id} (${slug}, ${environment.kind}): its release names no level the platform reads, so its AI key was not checked; redeploy it`)
            result.failed.push(instance.id)
            continue
          }
          const models = frozen?.ai?.models ?? []
          const allowed = (m: string) => snapshot.models.some(
            (e) => e.name === m && CLASSIFICATION_RANK[e.maxClassification] >= CLASSIFICATION_RANK[level],
          )
          const withdrawn = models.filter((m) => served.has(m) && !allowed(m))
          if (withdrawn.length === 0) continue
          const kept = models.filter((m) => !withdrawn.includes(m))
          const revoked = !kept.some(allowed)
          if (revoked) await revokeInstanceKey(deps.db, deps.llm, deps.keys, scope)
          else await deps.llm.post('/key/update', { key, models: kept })
          await publishEvent(deps.db, deps.bus, {
            projectId: environment.projectId,
            subject: `instance:${instance.id}`,
            type: 'ai.models_withdrawn',
            machineDetail: { instanceId: instance.id, environment: environment.kind, withdrawn,
              models: revoked ? [] : kept, revoked },
            humanMessage: revoked
              ? `${slug} in ${environment.kind} may no longer call ${inWords(withdrawn)}: each is now approved only below its ${level} data, and nothing it declared is still allowed, so its AI key was revoked. Change ai.models or data.classification, then deploy again.`
              : `${slug} in ${environment.kind} may no longer call ${inWords(withdrawn)}: each is now approved only below its ${level} data. Its AI key keeps ${inWords(kept)}.`,
          }, makeRedactor([key]))
          ;(revoked ? result.revoked : result.narrowed).push(instance.id)
        } catch (error) {
          console.error(`app key sweep: instance ${instance.id} (${slug}, ${environment.kind}): its AI key could not be narrowed or revoked; it may still reach a model its data's level no longer allows, until the next boot: ${String(error)}`)
          result.failed.push(instance.id)
        }
      }
      result.legacy = await countLegacyKeys(deps.db) // secrets named exactly LLM_API_KEY_SECRET
      if (result.legacy > 0) console.error(`app key sweep: ${result.legacy} environment-level AI key(s) from before per-instance keys were not checked; redeploy those apps`)
      return result
    }
    ```
    `inWords` is `ai/sessions.ts:632`'s — export it from there rather than copying it. `appKeysAtBoot` is `gatewayModelsAtBoot`'s
    shape: one `[boot]` summary line when anything was narrowed or revoked, one line and `'failed'` for a throw, never fatal.
  - **The event**: `observability/events.ts` (`'ai.models_withdrawn'` after `'ai.key_rotated'`, with its comment), `event-schemas.ts`
    (its strict object, each field described, *"A running app's AI key lost models now approved only below its data's level — or was
    revoked, when nothing it declared is still allowed. The key itself is never in an event."*), `examples.ts`, `db/schema.ts:1196`'s
    CHECK list; then `pnpm --filter @manifest/control-plane db:generate` and **read the generated SQL**: it drops and re-adds
    `events_type_known` (0048's pattern), nothing else. `db:migrate` needs RUNBOOK's whole export block (trap 13).
  - **`index.ts`**: after `agentSessionsWithdrawn`, `const appKeysWithdrawn = !catalogue.enabled || litellm === undefined ? 'disabled' :
    await appKeysAtBoot({ db, bus, llm: litellm, keys: masterKeypair, catalogue })`, and the boot line gains `appKeysWithdrawn`.
- [ ] **Step 5: Run the unit file — green.** Then the Docker file's second case: a real instance key minted with two models, its secret
  recorded under a throwaway instance row whose release is frozen `high`, one of its models given a `medium` LiteLLM entry of the
  file's own (`/model/new`, cleaned up), `withdrawLoweredAppModels` run — the key is refused that model (`403
  key_model_access_denied`) and answered the other. Then `pnpm contract:write`, `contract:generate`, `docs:write` (the event); the four
  gates; one line to the front-end (*"a new event, ai.models_withdrawn, on 1.7.0"*).
- [ ] **Step 6: Commit by name** (the migration and `meta/` included, by name), then **the negative controls**:
  - **(a)** the revoke branch replaced by `/key/update` with `kept` (which is `[]`): predict red at *REVOKES … never models: []* — the fake
    holds the key with `models: []`;
  - **(b)** `level` read RAW (`frozen?.classification as Classification`, no `canonicalLevel`): predict GREEN at the alias case — the rank
    table holds `confidential` at `very-high`'s rank (I6's defence in depth, seen working) — and red at *no readable level*: `'secret'`
    passes the `undefined` check, ranks `undefined`, every served model reads as not allowed, and the key is REVOKED unnamed instead of
    named and skipped. **Record the green as the table doing its job, not as a control that cannot fail**;
  - **(c)** the `appKeysAtBoot` call removed from `index.ts`: predict red at `boot.docker.test.ts`'s boot-line case — **add the assertion
    first**, one line beside `:637`'s `agentSessionsWithdrawn` (`expect(boot.appKeysWithdrawn).toMatchObject({ failed: 0 })` — the
    sweep RAN and failed nothing; its other counts depend on what that test's boot finds), or the call has no test. That file is a Docker file: it runs in the sitting's tier, not alone.
  ```bash
  git commit -m "feat(ai): a lowered level takes effect on running apps — each instance key narrowed at boot to what its data's level allows, or revoked; ai.models_withdrawn (U1 plan Task 6, S11)"
  ```

---

## Task 7: The acceptance — `make demo-levels`, and a person reading a `high` app's privacy assessment

**Alone, and last.** Offline, on whichever driver the control plane runs (it touches no source but its own project's). Its caller is the
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
  2. **The alias never widens** — a dry run declaring `confidential` and `ai.models: [default-chat-onprem]` is valid; one declaring
     `confidential` and `[default-chat]` is refused with a message naming *very-high*.
  3. **Stored as the level, answered in U1's names** — commit (not a dry run) the manifest at `internal` with `[default-chat]`: valid;
     `getSpec` answers `data.classification: 'medium'`. Then commit `medium` with the same models: its `sensitiveDiff.fields` does NOT
     contain `data.classification` (a rename is not a change). Then commit `high` with `[default-chat-onprem]`: valid; `getSpec` answers
     `'high'`, and its `sensitiveDiff.fields` DOES contain `data.classification` — the positive control.
  4. **A `high` project's agent session** (`startAgentSession`): its `models` contain `default-chat-onprem` and NOT `default-chat`. The
     capable model's half: `demo-levels.sh` reads LiteLLM's `/model/info` with the master key (as `demo-gateway.sh` does) and passes
     `CAPABLE=listed` or `CAPABLE=absent`. Listed: the session holds `default-chat-large` (the builder setting `capable`). Absent: the
     phase prints `the capable model is not configured — its half NOT RUN`, and the run still passes. The session is ended at the
     phase's end.
  5. **A token is refused the tails** — a delegated token with `project:read`: `listIncidents` on staging → `403
     INCIDENT_LOG_CONFIDENTIAL` (the refusal is decided before anything is read, so no Incident need exist); on the sandbox → `200`; the
     person's session on staging → `200`.
  6. **The privacy assessment** — `draftPrivacyAssessment`: the *flows* section's *Classification* fact reads *"High — every AI model the
     app uses must be approved for high data."*; `default-chat-onprem`'s fact reads *"Approved for very high data: it runs on on-premise
     hardware, so what the app sends it stays there."*
- [ ] **Step 2: Green three times** (a fresh project each run, then re-use), and from a `make reset` machine once. **Every other demo stays
  green** where it was last green — above all **`make demo-frontend`** (Task 2 changed its assertion), `make demo-launch`, `make demo-ai`,
  `make demo-token` and `make demo-faculty-ready` — then `make ci-acceptance` with its new step, its `EXPECT_` lines re-counted.
- [ ] **Step 3: The negative controls**, in `scripts/levels-controls.sh` (for Rich if the classifier refuses a restart). Each is seen red
  where predicted, and restored:
  - **(a)** S9's condition back to `=== 'very-high'` (the control plane restarted on the edited tree): phase 5 answers `200`;
  - **(b)** BOTH of S6's paths removed — the schema's transform and `getSpec`'s `specInLevels`: phase 3's `getSpec` answers
    `'internal'`. **Either one alone stays green** — for a new row the transform stores the level and `specInLevels` reads one, so each
    covers the other: that is the design, and the record says so rather than calling it a control that cannot fail. Task 2's unit
    controls (b) and (c) see each alone;
  - **(b2)** `sensitiveViewOfSpec`'s `levelName` removed: phase 3's rename commit lists `data.classification` — red only if the
    transform is ALSO removed (the stored previous row is then `internal`); alone it stays green, for the same reason. Record which;
  - **(c)** E14's old hint: phase 1's hint checks;
  - **(d)** `staysOnPremise` back to `=== 'confidential'`: phase 6's on-premise fact;
  - **(e)** `MANIFEST_AGENT_BUILDER_MODELS=on-premise` (only when `CAPABLE=listed`): phase 4's capable-model half goes red — and phase 5
    stays GREEN, which is S9's point (the builder setting no longer decides the tails).
- [ ] **Step 4: The person.** Rich signs in to the console (or a staged headless sign-in, his standing yes on `manifest.internal`), opens
  the run's project's *Records*, drafts the privacy assessment, and reads its *Where it flows* section: *High*, and the model's line.
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

## What executing this plan found

*Each sitting adds a dated entry here: its tasks; every defect, with the measurement that found it; every negative control, and which
could not fail and why; the gate numbers and the machine, queried at the close.*
