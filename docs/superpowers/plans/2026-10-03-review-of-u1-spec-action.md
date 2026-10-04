# Review: the U1 classification spec action (draft `u1-spec-action-draft.md`)

**Verdict: APPROVE WITH FIXES.** I checked every "Current:" quote against the spec, and every one is verbatim. The structure is sound,
and the control-plane sites the draft names cover every read I could find that fails open. The fixes are: one Critical (a loophole in
the attestation rule that every edit relies on), and nine Importants. Most of the Importants are decisions that belong to Rich but are
presented as settled, or premises that are wrong.

Read-only review, 2026-10-03, HEAD `a1fad27` (its only change since `940718e` is a test file and `ai/testing.ts`, so every line number
below holds). Spec at `b416a8f`, clean.

---

## Critical

### C1. The `high` rule reads "its provider", and the spec calls UBC's AI Gateway the provider. Any model the gateway serves qualifies.
*Draft l.33 (S1), l.90-91 (E3's paragraph), l.110-111 (E5), l.139 (E7), l.149 (E8), l.183 (E13).*

- E3 says `high` *"only when it does, or when its provider keeps none of what it is sent"*. E5 says *"one whose provider keeps nothing
  it is sent"*.
- The spec's own sentence, applied tonight at spec l.539, is *"UBC's AI Gateway is the platform's upstream provider"*. From
  Manifest's side, the provider of every `ubc-ai-gateway/<model>` entry is the gateway.
- Rich's 20:42 answer was *"No, prompts aren't stored"* at the gateway (question doc l.22-23). So, by the letter of E3/E5, every
  model the gateway serves can be attested `high`, whatever vendor sits behind it.
- That includes a vendor with no ZDR: the gateway plan's own test fixture is `ubc-vertex=ubc-ai-gateway/claude-x@…`
  (`plans/2026-10-03-ubc-ai-gateway.md:1124`).
- Rich's 21:48 ground is narrower. It is the OpenAI organisation's ZDR, plus Bedrock by his call.
- The rule also says nothing about a **gateway-side fallback** for `high`. The `very-high` clause and the gateway plan's Decision 7
  (`ubc-ai-gateway.md:390`) both exclude a fallback off UBC hardware. A `high` OpenAI entry that the gateway falls back to a retaining
  vendor would carry U1 High data there.

**Fix.** Use this wording in E3, E5, E7, E8 and E13 alike: *"`high` only when it runs on UBC's hardware with no fallback off it, or
when every provider that may answer it — the vendor behind any gateway, and any model the gateway may fall back to — keeps none of what
it is sent (zero data retention)"*. Then add the gateway-fallback limit to the gateway plan's *What this plan does not build* list for
`high` too.

---

## Important

### I1. A refused re-registration keeps the old, HIGHER level, so lowering a level can fail open. S3 extends this to the capable model.
*Draft l.35 (S3), l.285-287 (item 4), l.336-338 (read but not verified).*

- `ai/registration.ts:237` compares `model_info.max_classification === r.classification`. Any change of level re-registers.
- When the re-registration is refused, `refuseKeeping` (`registration.ts:207-215`) **keeps the working registration**
  (`ours.filter(priced)`), and that registration still carries its old level.
- A refusal is a realistic case: `registration.ts:91-93` says LiteLLM prices `gpt-6-*` only from the list it downloads at its own
  start with the network on. If LiteLLM was restarted offline, the new registration is unpriced and refused.
- So when an administrator lowers `@high` to `@medium` after a provider's ZDR lapses (draft l.337 names exactly this case), the entry
  can stay `high` in the catalogue. Only an operator line says so.
- With S3, the same happens to `MANIFEST_CAPABLE_MODEL_CLASSIFICATION`. `capableFloor` (`capable.ts:165-169`) then takes the kept
  `high`. `agentModelsFor` and D17 validation keep allowing `high` apps.

**Fix.** Add a build item: on a refusal, never keep an owned deployment whose level ranks above the setting's. Remove it, or keep it
only at the lower level. Add a negative control: lower a gateway model's level while the new registration is refused as unpriced, and
`high` apps must lose it. The draft's l.336-338 note should name this, not only the running-key limit.

### I2. The incident-log protection for student personal information is withdrawn. That is Rich's call, not a corollary.
*Draft l.36 (S4), l.121-133 (E6 and "Why this cannot fail open").*

- E6 refuses staging and production Incident tails to a delegated token only while the project's level is above the capable model's.
  With Rich's `.env` at `high` (item 11), `high` projects' tails are **answered** to tokens.
- Under today's written meaning (D17's reason, spec l.213; Story 04), student personal information is `confidential`, and its tails
  are refused (`releases.ts:1249-1257`). Under the new scheme that data is `high`, so its tails become readable by any delegated token.
- E6 justifies this as *"D17 already lets that input reach it"*. That holds only for Manifest's own models.
- A delegated token is by design a **bring-your-own-agent** credential. Spec l.142 names *"a third-party agent on a user's own machine
  holding a delegated token"*, and D24 at l.220 says *"This is what makes 'bring your own agent' (§1) safe"*. That agent's own model
  provider is unattested.
- The control cannot fail open against its own condition, but the condition itself is a new policy.

**Fix.** Make this an explicit sub-decision (S9). Options:
- (a) as drafted;
- (b) also refuse tails to tokens for every project at `high` or above, whatever the capable model's level (fails safe; costs
  self-repair for `high` apps);
- (c) refuse only while builder is `capable`, as now.

Under any option, E6's "cannot fail open" paragraph should state the token-holder assumption.

### I3. "Very high risk forces on prem models only" is not reconciled with the builder exception for very-high projects.
*Draft l.36 (S4), E6, `manifest-schematic.html:1073-1075`.*

- Rich's 21:48 words are absolute: *"Very high risk forces on prem models only."*
- The draft keeps, by default, a `very-high` project's **building agent** calling the capable model (OpenAI). That puts the project's
  code and the person's description of it off premises.
- The question doc raised exactly this (l.430-432, *Not Rich's alone* 2). The draft treats the very-high exception as given. Even
  S4's alternative is *"`very-high` only, word for word as today"*.
- Spec action 10 (2026-09-28) predates the 21:48 sentence, so which governs is Rich's to say.

**Fix.** Add the question to S4, or as S10: *"Does 'very-high forces on-prem' cover the building agent? (a) No: Spec action 10 stands
(recommended, with reason). (b) Yes: `MANIFEST_AGENT_BUILDER_MODELS` defaults to `on-premise` for very-high."*

### I4. E3 puts `default-chat-large` at `high` in the spec. S3 defaults it to `medium`, so the spec and the code disagree.
*Draft l.35 (S3), l.83 (E3), l.102 (E4), l.285-286.*

- E3's catalogue line reads `default-chat-large max_classification: high`.
- S3 makes the level a setting defaulting to `medium`, and E4 says *"high at most"*.
- A cold reader, or the plan-writer, cannot tell which is the design.

**Fix.** E3's line should read `max_classification: (a platform setting, §26 — medium unless set; high at most)`. Alternatively,
default S3 to `high` and say why. Also say in S3 whether a `very-high` value is refused (E4 implies it is), and add that refusal to
item 4. E4's cap is a new design choice that none of S1-S8 surfaces.

### I5. S2 (ii) goes beyond the 21:48 decision, and its premise about `default-chat` is a label, not a fact.
*Draft l.34 (S2), l.80-85 (E3), l.288-289 (item 5).*

- Rich's 21:48 decision puts **OpenAI and Bedrock's llama3** at `high`. S2 (ii) also raises `default-chat`, `default-chat-reasoning`
  and `default-embed`.
- Its supporting quote, *"as long as the app isn't very high risk data, using the off-prem models should be fine"*, is from the 20:42
  entry, about the gateway's OpenAI models (question doc l.14-20).
- Check 6: **`default-chat` does not route off-prem today.** `config.yaml:20-21`, `:57-58` and `:77-78` are Ollama on
  `host.docker.internal:11434`, the same daemon as `default-chat-onprem`. Spec l.546 says *"`default-chat` and the on-premise model a
  laptop runs stay local"*.
- *"May route off-prem"* (l.509, l.512) is the spec's label for an unchosen UBC deployment. So `high` on these three is an attestation
  about a provider nobody has named.
- E3's new comment *"may route off-prem, to a provider that keeps nothing it is sent"* writes that promise into the spec.

**Fix.** Keep S2 as Rich's choice, but restate the premise. Also offer (iii): `high` in `config.yaml`'s bootstrap set (local Ollama
qualifies under S1's rule), and in the spec, *"its level is the administrator's attestation for whichever provider UBC points it at
(S1's rule)"* rather than a fixed `high`.

### I6. The design narrows the rank table to four names, so every read the plan misses fails OPEN, not closed.
*Draft l.260-273 (items 1-2).*

- The draft makes `CLASSIFICATION_RANK` cover only the four U1 names and canonicalizes at every listed read.
- With a four-key table, any stored alias the plan misses ranks as `undefined`. In the `<` checks, `x < undefined` is `false`, so the
  check passes:
  - `policy.ts:207`: the model is allowed;
  - `release.ts:1097`: an old frozen `confidential` release passes D17 at deploy;
  - `capable.ts:197`: the fallback check passes.
- The draft names these sites, and I found no unnamed fail-open site (Check 3, below). The design still makes the next omission a
  privacy failure.
- **Fix.** Keep all seven names in the rank table, each alias at its level's rank (`public`=0, `internal`=1, `confidential`=3), as
  defence in depth. Keep `canonicalLevel` for output and equality.
- The opposite trap is worse: a partial edit that appends `high: 2, very-high: 3` and leaves `confidential: 2` reads `confidential`
  as `high` and widens it to OpenAI.
- **Add the controls item 12 lacks:**
  - an app declaring `confidential` (the alias) is refused a `high` entry, at validation and at deploy of an old frozen release;
  - a catalogue entry at `internal` does not satisfy a `high` app;
  - an entry at `confidential` does satisfy a `very-high` app.

  These are the never-widening rule's own controls. Item 12 tests only the U1 names.

### I7. "No LiteLLM database or config migration" (draft l.20) is not what the draft builds.
- S2 (ii) edits `config.yaml:29, 63, 83`. That is a value change, not an alias migration, but it is a config change.
- `registration.ts:237`'s string equality means every platform-registered row at an alias is re-created with its canonical name at
  the next boot. That covers the capable model at `internal`, and gateway models at `@internal` or `@confidential` from the gateway
  plan's sitting 2 close. It is a database rewrite, and the draft names no `registration.ts` site at all.

**Fix.** Either compare `canonicalLevel` on both sides at `:237`, so nothing is rewritten unless the level changes, or keep the rewrite
and say so. Restate l.20 precisely: *"the aliases need no migration; S2 raises three `config.yaml` values; registration rewrites rows
only if …"*.

### I8. S5's comparison misstates the cost of `high` as the default.
*Draft l.37 (S5), l.206-207 (option b).*

- The draft's cost for (b) is *"the intake model must then be `high`"*. Under S2 (ii), the draft's own recommendation, the intake
  model `default-chat` **is** `high`, so that cost is zero on the laptop.
- The real costs of (b) are not named:
  1. every launched app that declares no level changes its stored default from `internal` to `high`, a sensitive-field change that
     re-escalates its next production release (D9; `diff.ts:183`);
  2. an undeclared app listing a `medium`-only entry (the capable model at S3's default) stops validating.
- No real faculty app exists yet, so (b) is nearly free now. E2 itself says CWL apps are High, so a `medium` default contradicts the
  platform's own guidance for the majority case.
- The recommendation may still be `medium`, but Rich should see the true costs.

### I9. S2, S3 and E6 assume a setting's value. The withdrawal trigger and the setting's name do not follow.
- E6's kept text (l.524-527) says a model is withdrawn when *"a project's classification or this setting"* changes. With S3, the
  **capable model's level** is a third trigger: lowering it with builder `on-premise` withdraws the model from `high` projects.
- *"Set to on-premise only, every such session gets only what D17 allows"* (draft l.122-123) contradicts itself. For a `high` project
  with the capable model at `medium`, D17 allows off-prem `high` entries.
- The code value is `'on-premise'` (`ai/models.ts:16`, `config.ts:413`). Either rename it in the spec's words (*"D17 only"*), or
  record that it no longer means on-premise below `very-high`.

---

## Minor

1. **E8 overclaims and misattributes.**
   - *"Very High Risk information … never leaves UBC's own hardware"* is broader than D17. `egress.allow` can send it anywhere
     allowed, and production hosting is undecided (`assessment.ts` gap: *"Where UBC will host the app in production is not decided
     yet"*). The same applies to `manifest-decisions.html:137`'s new text. Say *"never reaches a model off UBC's own hardware"*.
   - *"which is Rich's ground"*: Rich reported a determination by someone else (*"it's been deemed okay as long as ZDR is enabled"*).
     Say *"on a UBC determination Rich reported, 2026-10-03, not yet on the record"*.
   - E8 is a table cell, so the applier must keep it on one line.
2. **E2's derivation.** *"So an app that keeps any personal information declares `high` at least"* is attributed to §4.1, which
   allows a higher level. It actually follows from U1 §2.1.3 (*"Personal Information, which must be protected under … FIPPA"*). A
   reader will otherwise think it contradicts E2's own `low` bullet (faculty and staff work contacts). FIPPA's definition excludes
   business contact information: say so in one clause. Also, *"for an app its owner"* settles who the U1 steward is, which the
   question doc (l.440-441) left as UBC's to say.
3. **E13** says *"`high` only to a provider with zero data retention"*, which omits on-premise. Use S1's two-part rule.
4. **S6 and Check 4: formally additive, but values change.**
   - `ManifestYaml` is referenced by no route (`grep 'schemas/ManifestYaml'` finds no hit), and every release representation types
     `classification` as `string`. That is `openapi.json:20385`, `:20532` **and `:20679`**; the draft names two.
   - But S6 changes the values existing reads return for unchanged input. `getSpec` returns the stored `parsed` (`project-reads.ts`;
     `specs.ts:17-21` points its reader to `ManifestYaml`), so it flips `internal` to `medium` for new validations and stays mixed for
     old rows.
   - The front-end does not compare values. It keys off `INCIDENT_LOG_CONFIDENTIAL` (`manifest-app/.../platform/instances.ts:108-112`)
     and model names (`round.ts:593`).
   - Name this as a behaviour change. Canonicalize at read in `api/representations/releases.ts:138` and in `getSpec`, or S6 is half
     done.
5. **Sites the draft does not name (none fails open under the draft's design):**
   - Every place that must change, as the plan-writer's list:
     - `ai/registration.ts:60-63, 237` (I1, I7);
     - `api/representations/releases.ts:138`;
     - `api/routes/project-reads.ts:717` (example);
     - `api/routes/releases.ts:490-569` (more examples), `:1208` (description), `:1257` (message);
     - `api/representations/incidents.ts:30`;
     - `api/representations/agents.ts:105`;
     - `api/error-codes.ts:753`: the description, not `:749`;
     - `api/authz-contract.ts:121, 288, 2247, 2577`: the confidential-Incidents row needs a `high`-at-capable-`medium` sibling;
     - `api/testing.ts:313`: a hand-written union;
     - `spec/diff.ts:553-556` (the sentence);
     - `launch/assessment.ts:93-94` (`capitalised` gives "Very-high"), `:360`, `:381`;
     - `packages/console/src/screens/approvals.tsx:222`;
     - the mock's `fixtures.ts:1314, 1400` PIA text;
     - `docs/api/agents.md:23, 28`;
     - `docs/api/frontend.md:34, 37`.
   - Comments only: `ai/models.ts:10-25, 114`; `ai/gateway-models.ts:24-25, 36, 81`; `observability/output.ts:11`;
     `index.ts:569`; `api/spec-validation.ts:167`.
   - In the front-end, the draft dropped two sites the question doc listed (`platform/instances.ts:40-48, 112`;
     `web/src/screens/building/needs.tsx:185`). It also misses `agents/lead.ts:42, 54, 243-245` and `build/round.ts:666, 705-709`.
   - `asClassification` uses `in`, which also finds `toString`; `canonicalLevel` must use `Object.hasOwn`, as `catalogue.ts:99-106`
     warns.
6. **Cold-reader problems:**
   - E3's parenthesis note sits inside the proposed blockquote. Move it out.
   - E6's *"[l.524-527's narrowing sentences unchanged]"*: l.524 begins mid-sentence. Quote the first and last words of the kept span.
   - E10's "Current" drops the spec's `**…**` bold (spec l.1056-1058). Say whether the bold stays.
   - E14 writes `${max}` and `${class}` for `${entry.maxClassification}` and `${spec.data.classification}`.
   - S2 and S7 cite l.389 for `givenName, sn`. They are at **l.387**, and `ai.models` is at l.392.
   - *"l.546;"* under *Unchanged, checked* gives no reason.
   - E11's *"whose change is one too"* now grammatically covers only the builder setting. Say whether changing the capable model's
     level takes the catalogue's step-up (§20).
7. **Story 04 (S8):**
   - Renaming Week 1 to *"the first check"* orphans Week 2's *"the second refusal"* (`manifest-stories.html:211`).
   - `class="snag"` (l.205) and `class="stop"` (l.197, *"high-risk data"*) mark a beat that is no longer a refusal. Change both.
8. **When to apply.** The gateway plan's sitting 3 holds its whole-branch review against the spec. Say the spec action applies only
   after the gateway plan's acceptance, so that review reads the spec its code was built to. E5 rewrites the sentence Spec action 1
   applied tonight (`b416a8f`).

---

## The checks, answered

1. **"Current:" quotes:**
   - All verbatim: E1 l.405, E3 l.505-513, E4 l.519-520, E5 l.543-545, E6 l.522-529, E7 l.548-549, E8 l.213, E9 l.1037-1038, E11
     l.2973-2976, E12 l.1794 and E13 l.2143.
   - E10 omits the bold markers (Minor 6). E14 matches `policy.ts:213-215` in substance, with paraphrased placeholders.
   - E2's anchor (l.503) and E3's (l.514) are correct.
   - The shared-page quotes (`decisions.html:136-137`, `stories.html:197, 205-210, 298-303`, `schematic.html:1073-1078`) match.
2. **Fidelity to Rich's 21:48 decision:**
   - The alias meanings, never-widening and contract 1.7.0 all match.
   - Beyond it: C1 (any gateway model can be `high`), I5 (three more names at `high`), and the E4 cap (I4).
   - Rich's, though presented as settled: I2, I3 and the E2 steward clause.
   - The "no migration" claim is inaccurate (I7).
3. **Fail-open paths:**
   - Every stored-level read I found is in the draft's items 2-3: `models.ts:57-60, 83, 101-105, 132`; `release.ts:1097`;
     `diff.ts:183/250`; `catalogue.ts:104-110`; `releases.ts:1253`; `assessment.ts:97, 207`; `gateway-models.ts:135`;
     `models.ts:37`; `intake.ts:64`.
   - The unnamed fail-open paths are registration's kept higher level (I1) and the four-key rank design (I6).
   - The front-end has no classification literal comparisons.
4. **Contract:** formally additive; values change (Minor 4). The front-end is safe.
5. **Contradictions:**
   - E5 against Decision 7 and Spec action 1: only C1's missing fallback clause for `high`.
   - The §9 PIA and D9 are consistent.
   - Spec action 10 is in tension with Rich's newest words (I3).
6. **S2 and S3 premises:**
   - S2: `default-chat` is local Ollama and routes nowhere off-prem today (I5).
   - S3's premises are true: `capable.ts:40` is hard-coded `'internal'`; `providers.ts:8-9, 96` route `openai/<model>` directly with
     `OPENAI_API_KEY`, kept as a backup.
7. **Cold-reader problems:** see Minor 6 and 7, and I4 and I9.
