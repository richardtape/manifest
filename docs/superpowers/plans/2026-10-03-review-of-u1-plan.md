# Review: the U1 classification plan (`docs/superpowers/plans/2026-10-03-u1-classification.md`, `b2bb975`)

Fresh read-only review, 2026-10-03, at HEAD `8377c1b`. No code has changed since the plan's read point `bae220f`: the commits between
are docs and `scripts/ci-acceptance.sh`. Every file:line below was read at HEAD. The front-end was read at `6bbbede`, read only.

## Verdict: APPROVE WITH FIXES

The plan follows Rich's 21:48 and 22:21 decisions. I found no task that goes beyond them or against them:

- the aliases are in the rank table at their level (`public`=0, `internal`=1, `confidential`=3) and never widen;
- S2 leaves `config.yaml` alone;
- S3 is a setting, default `medium`, with no cap;
- S4/S10 keep the builder at `capable`;
- S5 is `medium`;
- S9 is one rank condition with no builder term;
- S11 revokes rather than sending `[]`.

Its read of the code is mostly accurate. The problems are in the task ORDER, in tests it does not name, and in controls that cannot go red:

- **One Critical.** Task 2 cannot pass its own four gates, and from Task 2 until Task 4 it turns off a decided behaviour across a
  sitting boundary.
- **Seven Importants.**
- **Fourteen Minors.**

---

## Critical

### C1. Task 2 makes the floors and the catalogue answer canonical levels, but three `=== 'confidential'` readers of those values change only in Tasks 3, 4 and 5. Task 2 cannot commit green, and S4's builder exception is OFF from sitting 1 to sitting 2.

**Evidence (HEAD):**

- **Task 2 changes the floors' return type.** `classificationFloor` and `environmentFloor` become `Promise<Level>` (plan, Task 2 *Interfaces*).
- **`api/routes/releases.ts:1253`** (S9's site, which Task 5 changes): `(await environmentFloor(deps.db, environment)) === 'confidential'`.
  - Against a `Level`, `tsc` raises TS2367 ("no overlap"), so **`pnpm typecheck` is red at Task 2**.
  - Under Vitest, with types stripped, the comparison is always false. So **`api/incidents.test.ts:123-195` (its refusing cases) and the
    authorization contract's last row (`authz-contract.ts:2244-2262`) go red**: a token is answered a `confidential` project's tails.
- **`ai/models.ts:37`** (Task 4's site): `const building = floor === 'confidential' && builder === 'capable'`.
  - `floor` is typed with the seven names, so `tsc` stays silent. At runtime, `classificationFloor` now answers `'very-high'`, so
    `building` is never true.
  - **`api/agents.test.ts:1166-1170` goes red**: a confidential project's session no longer holds `default-chat-large`.
  - Worse, the Global Constraints say to restart the control plane from `.env` after sitting 1's tier. That boot's
    `narrowSessionsHoldingMore('every')` (`index.ts:511-532`) would narrow every very-high project's live agent session. Its event tells
    the project's people *"the platform now keeps a confidential project's building agent on-premise"* (`sessions.ts:640-654`). That is
    false.
- **`launch/assessment.ts:97, :207`** (Task 3's sites): `staysOnPremise` is `=== 'confidential'`. The catalogue is now canonical
  (`very-high`), so between the Task 2 and Task 3 commits every privacy-assessment draft says the on-premise model "may leave UBC".
- **Task 2 also breaks tests the plan never names:**
  - `api/agents.test.ts:1063` reads *"because the project is now confidential"*; `sessions.ts:650` now prints `very-high`.
  - `ai/capable.test.ts:211` expects `maxClassification: 'internal'`.
  - `api/agents.test.ts:303` and `:853` filter `m.maxClassification === 'internal'`, which now matches nothing.
    - **`:303` stays GREEN for the wrong reason.** The catalogue it builds is now EMPTY, so `AGENT_NO_MODEL_FOR_CLASSIFICATION` comes
      from "no models at all", not from "no model approved for confidential".
    - `:853`, `internalOnlyCatalogue()`, empties every narrowing test built on it.
- **Sitting 1's Docker tier goes red** at:
  - `ai/ai-path.docker.test.ts:267` (`toBe('internal')`);
  - `ai/ai-path.docker.test.ts:274-276` (the canonical catalogue compared with `config.yaml`'s raw strings: all five shipped entries);
  - `ai/capable.docker.test.ts:181-185`.

**Fix:**

- **Task 2 carries the mechanical rename at every reader of the values it canonicalizes**, behaviour unchanged:
  - `models.ts:37` becomes `floor === 'very-high'`;
  - `releases.ts:1253` becomes `=== 'very-high'`;
  - `assessment.ts:97, :207` read through `toLevel`.
- Tasks 3, 4 and 5 then make the decided changes from those lines. Their controls already say `=== 'very-high'`, which only makes sense
  if this is done.
- Name each moving expectation in Task 2's *Expectations that move*:
  - `agents.test.ts:303`, `:853` and `:1063`;
  - `capable.test.ts:211`;
  - `ai-path.docker.test.ts:267` and `:274` (compare `canonicalLevel(from.model_info?.max_classification)`);
  - `capable.docker.test.ts:183`.
- Rewrite the two `=== 'internal'` filters as `=== 'medium'`. Add a negative check to `:303`: the internal-only catalogue is non-empty.

---

## Important

### I1. The acceptance never proves S11 through the real entry point. Unit tests, a harness Docker case and a "ran, failed nothing" boot line are all it has.

- `make demo-levels` (Task 7, phases 0-6) has no phase for a lowered level reaching a running app's key.
- Task 6's Docker case calls `withdrawLoweredAppModels` directly.
- `boot.docker.test.ts`'s new `appKeysWithdrawn toMatchObject({ failed: 0 })` passes when the sweep narrows nothing.
- The Goal promises *"taken off every running app's key at the next boot"*. CLAUDE.md: *"Drive the real entry point"*. The memory file
  *The demo is the deliverable* says to name the breadth traded.
- **Fix:** add a `boot.docker.test.ts` case. Its fixture holds an instance with a REAL minted key, whose release is frozen `high`, and one
  of whose models has a LiteLLM row of the test's own at `medium`. The booted `index.ts` must report `appKeysWithdrawn: { narrowed: 1 }`,
  and the key must be refused that model with `403 key_model_access_denied`. That drives the boot, not a harness. If no edge-level phase
  is feasible offline, say so in *What this plan does not build*, with its cost.

### I2. The app-key sweep is not idempotent. Every boot re-narrows the same key and re-sends `ai.models_withdrawn` to the project's people.

- The sweep in Task 6 recomputes `withdrawn` from the release's FROZEN `ai.models`, never from what the key holds now. `mintAppKey`
  minted the key with exactly those models (`releases/release.ts:315, :395, :628-634`).
- So after boot N narrows a key, boot N+1 finds the same `withdrawn` again. It sends `/key/update` again, publishes the event again and
  writes the operator line again. This repeats at every restart until the app is redeployed.
- Rich restarts the control plane after every test run.
- The agent sweep avoids this because it updates the session row's `models`. The app key has no stored record of what it holds.
- **Fix:** take the key's current `models` from LiteLLM (`/key/info` by value), or record the narrowed set beside the instance's key
  secret. Then withdraw only models the key still holds. Add a unit test: *a second sweep changes nothing and records nothing*.

### I3. Negative controls that cannot go red, and acceptance checks that cannot catch the defect they name.

- **Task 7 control (e)** sets `MANIFEST_AGENT_BUILDER_MODELS=on-premise` and predicts phase 4's capable half goes red.
  - *What Rich does* 3 sets the capable model to `high` before sitting 3. A `high` project's agent then gets `default-chat-large` BY RANK,
    whatever the setting. Task 4's own test says so: *"a high project gets it either way"*. So the control stays green.
  - The same fact means phase 4 proves D17's rank, not S4's builder exception.
  - **Fix:** run phase 4's builder half on a `very-high` project. Gate control (e) on the capable model ranking below the phase's project.
  - Run (e)'s phase-5 half (S9 does not depend on the builder) whether or not the capable model is listed.
- **Task 7 phase 2** (*"the alias never widens"*) dry-runs `confidential` against `default-chat` (medium).
  - That check passes with the trap the plan names: `confidential: 2`, which reads it as `high`. So it cannot catch it.
  - **Fix:** when the capable model is listed at `high`, also dry-run `confidential` + `[default-chat-large]` and expect a refusal.
  - Add control (f) to `levels-controls.sh`: `CLASSIFICATION_RANK.confidential = 2`, seen red there.
- **Task 4 control (d)** passes `capableModelAtBoot` a literal `'medium'` and predicts red at *"the floor moves with the setting"* and at
  the boot-line case.
  - That unit test calls `ensureCapableFallback` directly.
  - No test sends the level through `capableModelAtBoot` or `platformModelsAtBoot`.
  - `boot.docker.test.ts` boots with `MANIFEST_CAPABLE_MODEL` unset (Global Constraints).
  - So the control cannot fail, and the thread `.env` → `index.ts` → registration level is unproved.
  - `ensureCapableModel`'s and `ensureCapableFallback`'s new parameters default to `DEFAULT_LEVEL`, so omitting the level at
    `capable.ts:305` or `:319` still compiles.
  - **Fix:**
    - add a `gateway-models.test.ts` case: `platformModelsAtBoot(…, { capableClassification: 'high' })` registers
      `max_classification: 'high'`;
    - make both parameters REQUIRED;
    - have `demo-levels.sh` assert the `/model/info` row's level equals the setting. It already reads `/model/info`.

### I4. Task 6's STOP measurement is the right kind of check, but incomplete. Two claims rest on things it never measures.

- **What it does measure, and why that is right.** Narrowing an APP key by VALUE is the premise.
  - `narrowAgentKey`'s `[M3]` measured `/key/update` by ALIAS, on agent keys (`ai/agent-keys.ts:197-234`), at the pinned
    `ghcr.io/berriai/litellm@sha256:20b5044b…` (`infra/images.lock`).
  - "Empty is every model" was measured for `/key/generate` (`ai/keys.ts:137-141`, 2026-09-14) and is `[M7]` for agent keys. The sweep
    never sends `[]`, so that premise only argues for revocation, which is safe either way.
- **Unmeasured 1: does `/key/update` by value leave an app key's other bounds alone?** App keys carry:
  - `allowed_routes`, which is their confinement;
  - `metadata` (`manifest_project`, `manifest_environment`, `manifest_slug`), which joins spend;
  - `user_id`.

  `[M3]` saw the cap, life and routes kept on AGENT keys. Nothing has been seen for app keys updated by value.
- **Unmeasured 2: the fake's unknown-key answer.** The fake's `404 not_found_error` is described *"as … Step 1's measurement"*, which
  never asks about an unknown key.
- **Unmeasured 3: the hash path.** Decision 8's fallback option, *"update by the key's hash, if Step 1 measures that it works"*, is not
  in Step 1.
- **Fix.** Step 1 also:
  - reads `/key/info` before and after, and asserts `allowed_routes`, `metadata`, `user_id` and `max_budget` are unchanged;
  - probes `/key/update` with an unknown value and records the status and type;
  - records whether `{ key: <token hash> }` is accepted.

  Also, the sweep should read a FRESH catalogue (`loadModelCatalogue(llm)`), not the 60-second TTL cache (Minor M8).

### I5. Once Rich sets the capable model to `high`, Docker tests and the gateway's own acceptance read his live LiteLLM row and go red. The plan's regression list omits `make demo-gateway`.

- `ai/ai-path.docker.test.ts:263-267` asserts that the SHARED LiteLLM's `default-chat-large` is `'internal'`.
  - After *What Rich does* 3 that row is `high`.
  - Whether it is present when that file runs depends on order: `boot.docker.test.ts` and `capable.docker.test.ts` remove it, but only
    if they run first.
  - So every later tier can be red for a reason no task names.
- The gateway plan's acceptance, Task 6 phase 1 (*"each gateway name at … its classification"*, and the capable model's), is being written
  now. It will likely hard-code today's values.
- Task 7 Step 2's *"every other demo stays green"* list leaves out `make demo-gateway`, the newest one.
- **Fix:**
  - `ai-path.docker.test.ts:267` accepts any canonical level, or the level `MANIFEST_CAPABLE_MODEL_CLASSIFICATION` names.
  - Task 4 greps `scripts/demo-gateway.sh` and its journey for `max_classification` and classification literals, and compares by level.
  - Add `make demo-gateway` to Task 7 Step 2.

### I6. Rich's half of the acceptance never shows him the one new sentence the Privacy Office will read: what a `high` model is.

- Phase 6 and Step 4 assess a `high` app whose `ai.models` is `[default-chat-onprem]` only. Rich reads *"High — …"* and the on-premise
  line, which has only changed its words.
- The zero-retention sentence (`keepsNothing`, Review Focus 6's `high` half) is proved only by a unit test.
- **Fix:** when `CAPABLE=listed` at `high`, phase 3's `high` commit declares `[default-chat-large, default-chat-onprem]`. That is the
  spec's own S7 example (E1 l.392). Phase 6 and Rich then read both sentences.

### I7. The token rule moves at Task 2 with no test of it there, and Task 5's predictions assume Task 2 kept it working.

- This follows from C1. Once C1's fix makes `releases.ts:1253` read `=== 'very-high'` at Task 2, Task 5's Step 2 prediction (*"the
  capable half … answers 200 too (=== 'confidential')"*) is wrong. It should read `=== 'very-high'`.
- Task 5's control (c) (`>=` written `>`) also turns red:
  - the authorization contract's *high project* row;
  - the *frozen high, lowered to medium* case.

  The plan predicts *"the high case only"*.
- **Fix:** restate Task 5 Step 2 and control (c)'s predictions from the code as Task 2 leaves it.

---

## Minor

- **M1. Published text S6 misses** (*"documents in U1's names"*):
  - `api/error-codes.ts:852, :854` (`INTAKE_MODEL_UNAVAILABLE`) and `api/routes/intake.ts:48` still say *"approved for internal data"*;
  - `launch/assessment.ts:267` prints the stored ceiling raw (*"Manifest treats it as internal"* for an old row);
  - `docs/superpowers/RUNBOOK.md:299` (*"any word but public, internal or confidential refuses the boot"*) is false after Task 4, and so
    is `:316-329`'s builder text.

  Add them to Tasks 3 and 4.
- **M2. The Decision 2 overclaim.** It says *"every NEW … frozen release holds the level"*. In fact `createRelease` resolves the build's
  STORED `parsed` (`api/routes/releases.ts:344-357`), so a new release of a build validated before Task 1 freezes the alias. The rank
  table and `levelName` make this safe; the sentence should say so.
- **M3. Task 3 control (a) predicts red at `assessment.test.ts:219`.** Under Decision 10 that test's `CATALOGUE` (`:38-40`) keeps the
  alias `confidential`, so `=== 'confidential'` still matches and `:219` stays green. Only the very-high-app case goes red (its spec
  passes through `manifestSchema.parse`). Phase 6 / control (d) is the real check.
- **M4. Task 6 control (c) cannot be run as written.** It lives in `boot.docker.test.ts`, and the plan says that file runs only in the
  tier. Say: run that one Docker file alone, before the tier, with nothing else running.
- **M5. Task 5's mock changes have no test.** They add `level` and `MANIFEST_MOCK_LEVEL`. Add a case beside `scripted.test.ts:359`:
  `serve({ level: 'high' })` gives a 403 by code, `serve({ level: 'medium' })` gives a 200. The front-end runs this mock.
- **M6. Review Focus 3 promises *"a high project's agent loses it at boot"*.** The agent sweep leaves on the key a model the catalogue
  no longer serves, and LiteLLM refuses it. The outcome fails closed but is not what the plan says, and no test checks it. Item 5 of the
  spec action asked for that half too.
- **M7. The FE NOTICE should also say FE-46/47/5's breaks move to `1.8.0`.** The front-end's `docs/api-findings.md:72` and `:1696` name
  `1.7.0` for them, and the FE plan's `:1052` ties its F5b Task 5 to *"the break of 1.7.0"*. Its code keys nothing off the version
  (checked).
- **M8. The sweep reads the TTL-cached catalogue.** `index.ts:482` admits a request can cache a stale one for 60 s after `listen`. Use
  `loadModelCatalogue(llm)`.
- **M9. *What Rich does* 3: the network matters at LiteLLM's start, not the control plane's.** The condition is LiteLLM's last start
  (`registration.ts:91-93`; `unpricedReason`: *"restart LiteLLM with the network on … then this control plane"*).
- **M10. Task 0 is inconsistent about the file count.** Step 6 says *"the five files"* and Step 7 commits *"the six paths"*.
- **M11. The goal says *"on either driver"*, but Task 7 runs one.** The faculty-ready acceptance ran each driver.
- **M12. S11's two decided texts differ.** S11's row says *"its frozen level"*; E3's words say *"its project's level"*. The plan follows
  S11 (frozen) silently. Record which, so Task 0's applier and the reviewer do not flag it.
- **M13. The blueprint comment should say why `medium` holds.** The starter asks for `givenName` and `sn` (it greets students by name;
  `proof-app/manifest.yaml:20-28`). The comment should say the names are neither KEPT nor sent to a model (E2's test: *"keeps or sends
  to a model"*). Agents copy this file.
- **M14. Test snippets a cold agent must adapt:**
  - `assessment.test.ts`'s `input` is a function (`:42`), so `{ ...input, … }` spreads nothing;
  - `diff.test.ts`'s `DEFAULTS` is block-scoped (`:163`, `:374`);
  - Task 4 and Task 6's tests are comments, not code.

---

## FAIL-OPEN sweep (Check 2): every classification literal or rank site at HEAD, and its status

**Changed by a task (with C1's ordering fix):**

| Area | Sites | Task |
|---|---|---|
| Schema | `spec/schema.ts:8-16`, `:258-264` | T1 |
| Floors | `ai/models.ts:48`, `:57-60`, `:83`, `:101`, `:132` | T2 |
| Builder exception | `ai/models.ts:37` | T4 (rename at T2) |
| Catalogue | `ai/catalogue.ts:98-113` | T2 |
| Sensitive diff | `spec/diff.ts:183`, `:227`, `:250`, `:553-556` | T2 |
| S6 answers | `api/routes/project-reads.ts:717`, `:749`; `api/representations/releases.ts:138` | T2 |
| Examples | `api/routes/releases.ts:273-569` | T2 |
| Journey | `packages/journey/src/frontend.ts:1104` | T2 |
| D17 refusals | `spec/policy.ts:211-215`; `releases/release.ts:1102-1103` | T3 |
| Privacy assessment | `launch/assessment.ts:94`, `:97`, `:197-199`, `:207`, `:381`, `:390` | T3 (rename at T2) |
| Intake | `ai/intake.ts:64-68` | T3 |
| Capable model | `ai/capable.ts:40`, `:119`, `:159-205` | T4 |
| Registration | `ai/registration.ts:237`, `:207-216` | T4 |
| Gateway models | `ai/gateway-models.ts:135` | T4 |
| Gateway grammar | `config.ts:46-47`, `:55` | T4 |
| Token rule | `api/routes/releases.ts:1253` | T5 (rename at T2) |
| Tests and fixtures | `api/testing.ts:313`; `api/authz-contract.ts:2577` | T5 |
| Mock | `packages/mock/src/server.ts:456`, `:709`, `:730`, `:1197` | T5 |

**Safe without an edit (rank through the seven-name table, or input only):**

- `spec/policy.ts:163`, `:207`;
- `releases/release.ts:1097-1098`;
- `ai/capable.ts:197` (the floor is the max of the catalogue's level and the setting, so a defaulted parameter cannot lower it);
- `ai/sessions.ts:215`, `:783`;
- `spec/resolve.ts:129`;
- `api/spec-validation.ts:78` (its reader, the sensitive diff, goes through `levelName` at T2);
- `packages/journey/src/launch.ts:1687` and `authoring.ts:165-173` (inputs; the diff still flags `internal` → `confidential`);
- `sso/testing.ts:205` and `boot.docker.test.ts:500` (inputs);
- `packages/contract/src/schema.d.ts:5350` (regenerated);
- `packages/console/src/screens/approvals.tsx:222` (renders `toRelease`).

**No task changes these, and none proves them** (all in C1, I5 or M1):

- `ai/sessions.ts:650`;
- `api/agents.test.ts:303`, `:853`, `:1063`, `:1166-1170`;
- `ai/capable.test.ts:211`;
- `ai/ai-path.docker.test.ts:267`, `:274-276`;
- `ai/capable.docker.test.ts:181-185`;
- `launch/assessment.ts:267`;
- `api/error-codes.ts:852-854`;
- `api/routes/intake.ts:48`;
- `RUNBOOK.md:299`.

**The question raised in the plan (whether the spec action missed more journeys like `frontend.ts:1104`):** I found no other journey or
script that asserts an answered classification value. `scripts/` and `infra/` hold none, `infra/litellm/manifest_guard.py` included. The
class the spec action missed is the TESTS that assert answered values: the Docker catalogue checks, and the agents tests' string filters.

**Other checks:**

- **Contract.** `1.6.0 → 1.7.0` is a minor under `packages/contract/README.md`'s *Versions*:
  - the enum only grows;
  - the default moves to an equal level;
  - S6 changes VALUES of two string fields (getSpec's untyped `spec`, the release's `classification: string`), stated as a behaviour
    change, as 1.6.0 did.
- **The front-end.** It compares no classification value. It keys off `INCIDENT_LOG_CONFIDENTIAL`
  (`platform/instances.ts:108-112`) and model names (`build/round.ts:590-596`). The NOTICE is adequate, apart from M7.
