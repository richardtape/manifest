# Decision question: map Manifest's data classes onto UBC's U1 risk levels?

*Draft, 2026-10-03. Nothing in the repository was changed. Line numbers are as of the working tree on 2026-10-03 (spec
`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`, called "the spec" below; HEAD `e4d9681`).*

**The question in one line:** Manifest has three data classes (`public | internal | confidential`) that mean nothing written down.
UBC's standard U1 has four risk levels. You said High Risk data may go to OpenAI and Very High may not. Do we (a) fold High into
`internal`, (b) fold High into `confidential`, (c) add a fourth class so the two map one to one, or (d) leave the classes undefined?

---

## What Rich said

From `docs/superpowers/2026-09-30-decisions.md:848-854`, the entry beginning "And at 20:42 PDT". It is about the gateway's OpenAI models
(`gpt-6-luna`, `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.4-mini`: provider `openai`, OpenAI's public API, organisation `ubc-ltic-incubator`):

> "there's a difference between high risk and very high risk data at UBC. High Risk data should be fine hitting the OpenAI (which is
> off-prem) via the API. However, VERY high risk data is not. Details here:
> https://cio.ubc.ca/information-security/policy-standards-resources/U1 — So as long as the app isn't very high risk data, using the
> off-prem models should be fine."

On `llama3` (provider `bedrock`, AWS): *"Same as OpenAI question before"*. On prompt retention at the gateway: *"No, prompts aren't
stored"*.

The coordinator replied the same evening (`decisions.md:860-864`): the spec maps its classes to no U1 level; §7 and D17 stand as written;
the off-prem models take `internal` for now; the mapping is a spec question, to be drafted with U1 read. ORIENTATION line 1938 records
this as open.

---

## What U1 says

**Source:** https://cio.ubc.ca/information-security/policy-standards-resources/U1. Its title is *"U1, Security Classification of UBC
Electronic Information and Services"*. It is an *"Information Security Standard"*, *"Standard Last Revised: 2026-03"*, *"Page last
updated on April 1, 2026"*. It is issued *"under the authority of Policy SC14"*. I fetched it on 2026-10-03 and read the full HTML,
not a summary.

**§2.1, how UBC Electronic Information is classified.** The definitions, examples and impact below are quoted word for word from the
standard:

| U1 level | Definition | Examples | Potential impact of loss |
|---|---|---|---|
| **2.1.1 Low Risk** | "would cause minimal harm if disclosed, or may be freely disclosed" | "names and work contact information of UBC faculty and staff members"; "information that is posted on our public website"; "research information of a non-personal, non-proprietary nature" | "Minor embarrassment, minor operational disruptions" |
| **2.1.2 Medium Risk** | "not protected by law or industry regulation from unauthorized access, use or destruction, but could cause harm to UBC or others if released to unauthorized individuals" | "proprietary information received from a third party under a non-disclosure agreement"; "restricted circulation library journals"; "confidential financial information and records"; "information that could allow somebody to harm the security of individuals, systems or facilities"; "research information of a non-personal, proprietary nature" | "Reputational and financial impact, loss of priority of publication, loss of access to journals and other copyrighted materials" |
| **2.1.3 High Risk** | "must be protected by law or industry regulation from unauthorized access, use or destruction, and could cause moderate harm if disclosed" | "Personal Information, which must be protected under the BC Freedom of Information and Protection of Privacy Act (FIPPA), including: full face photographic images; student name; Student ID or Employee ID; student grades; home address"; "Payment Card Industry (PCI) Information … (e.g., credit card numbers, names, expiry dates or PINs)" | "Moderate harm to one or more individuals, identity theft, impact to University reputation or operations, financial loss, such as regulatory fines and increased credit card transaction fees" |
| **2.1.4 Very High Risk** | "must be protected by law or industry regulation from unauthorized access, use or destruction, and could cause significant harm if disclosed" | "Social Insurance Number (SIN)"; "official government identity card (e.g., Passport ID, Driver's License No.)"; "bank account information (e.g., direct deposit details)"; "Personal Health Information (PHI)"; "passphrases/passwords, keys"; "biometric data"; "personally identifiable genetic data"; "date of birth (DoB)" | "Significant harm to one or more individuals, identity theft, severe impact to University reputation or operations, financial loss, such as regulatory fines or damages from litigation" |

**Other clauses that bear on this question:**

- **§2.2:** *"The classification of information may change over time."*
- **§4.1:** *"The Information Steward/Owner is responsible for determining the information security risk classification … information
  may be classified at a higher level than indicated above, but not at a lower level."*
- **§3, Electronic Service risk classification.** U1 also classifies services, not only information. It lists *"volume of High or Very
  High Risk Information"* as a factor (§3.1.4). Under §3.2.4, a **Very High Risk Electronic Service** includes systems that
  *"transact or store … High and Very High Risk Information of most members of internal Constituents (student, faculty, staff,
  alumni)"*. Under §4.2.3, for such a service the Administrative Head of Unit must *"have documented assurance of compliance … usually
  attained by sourcing Security Threat Risk Assessments"* and a *"Shared Responsibility Model"*.

**The linked page, *Case Studies in Risk Classification*:**
https://cio.ubc.ca/information-security/policy-standards-resources/U1/gui-case-studies-risk-classification. It is an *"Information
Security Guideline"*, *"Guideline Last Revised: 2024-02"*. It defines no new levels. Two of its cases settle points used below:

- **CS2:** *"High Risk Information — Access Control Systems frequently store student names, but no further Very High Risk Information
  such as government IDs."*
- **CS3:** *"Personal Health Information is Very High Risk information."*

**What U1 does not say.** U1 says nothing about where information may be processed: nothing on premises against off premises, on
providers, on countries, or on AI. It only defines the levels. So the permission in your sentence, that High Risk may reach OpenAI
through the API, does not come from U1. It must come from somewhere else, and I could not find where (see *What I could not verify*).

**The fact that decides option (a):** U1 rates **student name, student or employee ID, grades and full-face photos as High Risk, not
Very High**. Every CWL app that stores anything about a student holds High Risk information, unless it de-identifies people the way
the proof app does.

---

## Where Manifest uses the classification

### What the spec and the shared pages say the classes mean

- **Nowhere does anything define the three classes.** The spec gives only the enum, at line 405 (`classification: internal  # public |
  internal | confidential`). The schema's public description is only *"How sensitive the app's data is"*
  (`packages/control-plane/src/spec/schema.ts:259-264`). The faculty front-end gives its agent no rule for choosing a class
  (`~/Developer/manifest-app/packages/server/src/agents/lead.ts:125` only says what a `confidential` app may use).
- **In practice, written meaning puts student personal information in `confidential`:**
  - **D17's reason** (spec line 213): *"A BC public body sending student personal information to a US model provider is a FIPPA
    problem."* The plain-language page says the same: `docs/superpowers/specs/manifest-decisions.html:137`.
  - **Story 04** (`docs/superpowers/specs/manifest-stories.html:205-210`): *"They mark the data as confidential, correctly — it is
    student work with names attached … a BC public body may not send student personal information to a model running in another
    country."*
  - **The proof app** (`blueprints/node-ts-mongo/starters/proof-app/manifest.yaml:55-64`): *"The notes are course work, not personal
    records … `internal` and not `confidential`"*.
  - **A refusal's public hint** (`packages/control-plane/src/spec/policy.ts:213-215`): *"A BC public body may not send personal
    information to a model running outside Canada."*
- **The Privacy Office's open question** is ORIENTATION §8 *Open*, `docs/superpowers/ORIENTATION.md:1999-2006`, *"MAY `internal` DATA
  REACH A MODEL PROVIDER OUTSIDE CANADA?"*. It is also `docs/external-track.md` item 11, line 72. That item says *"a provider with no
  residency guarantee is `public` at most and not recommended"*. Rich's capable-model decision of 2026-09-27 (`internal`;
  ORIENTATION:2207) has already moved past that line.

### Spec: where the classification is used

| Line | What it says |
|---|---|
| 213 | D17: `data.classification` constrains which logical models an app may use |
| 405 | the field, with default `internal` |
| 451-453 | `data.classification` is a sensitive field (D9 re-escalation) |
| 477-478 | validation refuses a model whose `max_classification` is lower than the app's; refuses an unclassified entry |
| 505-513 | the catalogue: `*-onprem*` entries are `confidential`; `default-chat`, `default-chat-large`, `default-chat-reasoning` and `default-embed` are `internal` ("may route off-prem") |
| 519-520 | *"Whether data of a given classification may reach a provider outside Canada is the Privacy Office's to say (§9); the name's `max_classification` is what the platform enforces meanwhile, and a `confidential` app's own AI never leaves on-premise hardware."* |
| 522-529 | the builder setting: a `confidential` project's building agent may call the capable model by default; its staging and production Incident logs are refused to a delegated token while that is allowed |
| 535 | the capable model's fallback must be classified at least as high as the capable model |
| 543 | an AI Gateway model may be `confidential` *"only for a model that runs on UBC's hardware with no fallback off it"* |
| 548-550 | *"An app declaring `data.classification: confidential` may therefore resolve only to on-premise model groups."* |
| 552-556 | an unclassified entry is never defaulted and never resolvable |
| 809, 812 | §9 PIA: *where it flows* and *hosting and jurisdiction* come from `data.classification` and `max_classification` |
| 1034-1038 | §10: an agent session's models follow D17 for the project's floor, plus the capable model on `confidential` |
| 1056-1061 | §10: the intake model must be approved for `internal` |
| 1763 | §15 hook: *"FIPPA-driven placement constraints"* (placement unenforced) |
| 1794 | security regression tier: *"a `confidential` app cannot resolve an off-premise model"* |
| 2143 | risk table: *"Personal information reaching an off-premise model — D17 …"* |
| 2975-2976 | §26: the builder setting is a platform setting |

### Code: the enforcement points (control plane, `packages/control-plane/src/`)

**Comparisons by rank.** These handle a new class with no change:

| File:line | What it enforces |
|---|---|
| `spec/schema.ts:8-16` | `CLASSIFICATIONS = ['public','internal','confidential']`; `CLASSIFICATION_RANK` 0/1/2 |
| `spec/schema.ts:259-264` | the field: `z.enum(CLASSIFICATIONS).default('internal')`, plus its public description |
| `spec/policy.ts:163, 207-217` | **D17 at validation**: `SPEC_MODEL_CLASSIFICATION_TOO_LOW`, with the hint at 213-215 |
| `releases/release.ts:1093-1105` | **D17 again at deploy**: `RELEASE_MODEL_CLASSIFICATION_TOO_LOW` (catches a model lowered since validation) |
| `ai/catalogue.ts:98-115` | reads `model_info.max_classification` from LiteLLM; any value that is not a key of the rank table is **unclassified and refused**, never defaulted |
| `ai/models.ts:31-44` | `agentModelsFor`: the agent's models are every entry ranked at or above the floor |
| `ai/models.ts:48, 72-106` | `classificationFloor`: the newest valid manifest's class (default `internal`), never below production's frozen release |
| `ai/models.ts:117-140` | `environmentFloor`: the strictest class of any release that ran in that environment |
| `ai/intake.ts:62-70` | intake pauses unless its model is ranked at least `internal` |
| `ai/capable.ts:30` (32 in the working tree; a peer session is editing `capable.ts` right now, gateway plan) | `CAPABLE_CLASSIFICATION: Classification = 'internal'`, **hard-coded**; Rich, 2026-09-27 |
| `ai/capable.ts:288-327` (295-334 in the working tree) | the fallback must rank at least the capable model |
| `ai/sessions.ts:636-657, 776` | narrows a live agent session when the floor rises |

**Comparisons by the literal `'confidential'`.** These must change if a class is added, and one of them **fails open** if it is
missed:

| File:line | Today | If a class is added and this line is not touched |
|---|---|---|
| `launch/assessment.ts:97` | `staysOnPremise = ceiling === 'confidential'`, which drives the PIA's *"stays there"* against *"may leave UBC"* (lines 197-199, 360, 390) | wrong words in the privacy assessment |
| `launch/assessment.ts:207` | the rule *"must run on on-premise hardware"* is said only for `confidential` | wrong words |
| `ai/models.ts:37` | `building = floor === 'confidential' && builder === 'capable'`, the builder exception | **fails closed**: the new class's agent gets no capable model |
| `api/routes/releases.ts:1249-1257` | `INCIDENT_LOG_CONFIDENTIAL` when `environmentFloor(...) === 'confidential'` | **FAILS OPEN**: the new class's staging and production log tails go to a delegated token, and on to the capable model |
| `ai/sessions.ts:439, 653`; `observability/event-schemas.ts:853, 868`; `api/error-codes.ts` | sentences naming "a confidential project's building agent" | wrong words |
| `api/testing.ts:313` | a hand-written `'public' \| 'internal' \| 'confidential'` union | test helper only |

### Config, contract, mock and front-end

- **`infra/litellm/config.yaml`:** `default-chat` :29, `default-chat-reasoning` :63 and `default-embed` :83 are `internal`.
  `default-chat-onprem` :45 and `default-chat-onprem-reasoning` :73 are `confidential`. The catalogue is held in LiteLLM's database
  (`STORE_MODEL_IN_DB`); these entries are the bootstrap set.
- **The gateway plan** (`docs/superpowers/plans/2026-10-03-ubc-ai-gateway.md`, in progress): `MANIFEST_GATEWAY_MODELS=<name>=<gateway
  model>@<classification>,…` (lines 54-55, 151). Decision 7 (line 388) says *"`confidential` only for a model on UBC's hardware"*. The
  on-premise gateway models' classes are deferred to sitting 2's close (`decisions.md:864`).
- **Contract** (`packages/contract`, version 1.6.0): the `ManifestYaml` enum is at `openapi.json:18610-18619` and
  `src/schema.d.ts:5346-5350`. Release representations type `classification` as a plain `string` (`openapi.json:20385`, `:20532`), so
  they do not break. `INCIDENT_LOG_CONFIDENTIAL` is described at `openapi.json:886, 11150, 17447, 21807`.
- **Mock:** `packages/mock/src/fixtures.ts:856-903` and `server.ts:98-102, 456-463` model the confidential option.
- **Faculty front-end** (`~/Developer/manifest-app`, read only):
  - `packages/server/src/agents/lead.ts:125` (*"An app whose data is confidential asks only default-chat-onprem"*);
  - `packages/web/src/words.ts:396-453`;
  - `packages/server/src/build/round.ts:590-591, 1471, 1602`;
  - `packages/server/src/api/progress.ts:181, 289-291`;
  - `packages/server/src/platform/instances.ts:40-48, 112`;
  - `packages/web/src/screens/building/needs.tsx:185`.

---

## The options

**Common to every option.** The hint at `policy.ts:215` (*"A BC public body may not send personal information to a model running
outside Canada"*) and Story 04's matching sentence state a legal prohibition that nobody here has checked (see *What I could not
verify*). Under (a) or (c), the platform's own catalogue would contradict them. Whichever option you choose, I would change that
hint so it says no law: *"Whether information of this class may reach a provider outside Canada is the Privacy Office's to say; this
platform keeps it on UBC's hardware."* That is a text change in public refusal text.

### (a) public = Low, internal = Medium + High, confidential = Very High

**Spec words:**

- **New paragraph after the YAML block** (between lines 415 and 417):
  > **`data.classification` is UBC's risk classification (Information Security Standard U1, §2.1) of the most sensitive information
  > the app keeps or sends to a model.** `public` is U1's Low Risk. `internal` is its Medium and High Risk; High includes FIPPA
  > personal information such as student names, student and employee IDs, grades, full-face photographs and home addresses.
  > `confidential` is its Very High Risk: Social Insurance Numbers, government identity documents, bank account information, personal
  > health information, passwords and keys, biometric and identifiable genetic data, and dates of birth. U1 makes the information's
  > steward, for an app its owner, the one who classifies, and allows a higher class but never a lower one (§4.1).
- **D17's reason** (line 213). Current: *"A BC public body sending student personal information to a US model provider is a FIPPA
  problem, and the pre-review design was one YAML line away from it by accident."* Proposed:
  > UBC's U1 standard separates High Risk information, student personal information among it, from Very High Risk. Rich judged on
  > 2026-10-03 that High may reach a commercial provider through UBC's AI Gateway and Very High may not; the Privacy Office has the
  > last word (§9). The pre-review design was one YAML line away from sending Very High Risk information anywhere by accident.
- **Lines 519-520 and 548-550** stay as written; they remain true.
- **Pages to rewrite:** `manifest-decisions.html:137` (D17's reason), and **Story 04** (`manifest-stories.html:205-210`). Under (a),
  "student work with names attached" is `internal`, so the story's first refusal never happens. The story needs a Very High example,
  such as health records.

**Code:** no behaviour change. Only text: `spec/schema.ts:263` (the description, which is public text in `openapi.json:18618`) and the
`policy.ts:215` hint.

**What it closes:** your sentence holds as stated, with no code and nothing to migrate. The off-prem models stay `max_classification:
internal`, which now means "up to High".

**What it leaves open:**

- **It reverses D17's reason, not just its wording.** Today's written meaning puts student personal information off OpenAI. Under (a)
  it goes to OpenAI.
- **The default class `internal`** (`schema.ts:261`, `models.ts:48`, intake at spec lines 1056-1058) **would presume High Risk data
  fit for an off-premise provider.** An app that never declares a class gets that by default.
- Medium and High can no longer be told apart. The day the Privacy Office says "not High", every class has to be redefined.

**Privacy implication, stated plainly:** **under (a), an `internal` app that stores students' names, student numbers or grades may
send them to OpenAI's API, and to AWS Bedrock.** Its building agent and intake may too.

- For **production**, the per-app PIA still catches it. §9 blocks a launch until the assessment is approved, and its draft already says
  *"it may be answered by a provider off-premise, so what the app sends it may leave UBC"* (`assessment.ts:199`, `:390`).
- **Staging is not caught.** Staging signs real people in with staging CWL (Spec action 6; `external-track.md` item 13), before any PIA
  is approved.

**Cost to change course later:**

- Back to (b): the words change back, but every app that declared `internal` while holding personal information must re-declare. On a
  launched app that is a sensitive-field change and re-escalates under D9.
- **Nothing already sent can be recalled.**

### (b) public = Low, internal = Medium, confidential = High + Very High

**Spec words:**

- **The same new paragraph,** with the middle replaced:
  > `internal` is its Medium Risk. `confidential` is its High and Very High Risk: every kind of FIPPA personal information, from a
  > student's name or number upward, as well as payment cards, health, identity and financial information.
- **D17's reason** (line 213): unchanged, because it is true under (b). Optionally add *"(`confidential` is U1's High and Very High
  Risk, §7)"*.
- **Story 04:** unchanged.

**Code:** none. Optionally, the `schema.ts:263` description, to cite U1.

**What it closes:**

- It writes down what the documents already assume (D17, Story 04, the proof app), with no code.
- It gives faculty a rule to classify by: UBC's own table.

**What it leaves open:**

- **It contradicts your sentence for High.** An app holding students' names cannot use OpenAI for its own AI. Only `internal` (Medium)
  apps can.
- Your sentence then becomes a Privacy Office question, with no place in the classes to put a "yes".

**Privacy implication:** the most conservative option. The OpenAI and Bedrock models stay limited to information that no law
protects. A `confidential` project's building agent still calls the capable model by default (Spec action 10; spec lines 522-529);
that is unchanged and still owed to the Privacy Office (`external-track.md` item 11).

**Cost to change course later:** to allow High off-premise later you need (c) anyway. By then every `confidential` app must be
re-examined to find the Very High ones before anything is raised; see (c1) for why. That costs nothing now, while no real faculty
app exists, and grows with each app.

### (c) a fourth class, so Manifest's four classes are U1's four levels

There are two ways to add it. They differ in **which existing word moves**, and that decides whether any existing declaration
quietly widens.

**(c2), recommended: a new class in the middle.** `public` = Low, `internal` = Medium, **`personal` = High (new)**, `confidential` =
Very High.

- `confidential` keeps its meaning: on premises, Very High.
- The off-prem models stay `internal` until the Privacy Office answers whether High may reach them. Then each is raised to `personal`:
  one value per model.
- *The name is yours to choose.* `personal` is plain to a faculty member, though U1's High also covers payment-card data, which no
  Manifest app handles. `protected` and `sensitive` are the alternatives.

**Spec words (c2):**

- **Line 405:** `classification: internal  # public | internal | personal | confidential  (U1: Low | Medium | High | Very High)`.
- **New paragraph after the YAML block** (between lines 415 and 417):
  > **`data.classification` is UBC's risk classification (Information Security Standard U1, §2.1) of the most sensitive information
  > the app keeps or sends to a model, one class for each U1 level.** `public` is Low Risk. `internal` is Medium Risk: information no
  > law protects that could still cause harm, such as proprietary research or material held under a non-disclosure agreement.
  > `personal` is High Risk: FIPPA personal information such as student names, student and employee IDs, grades, full-face
  > photographs and home addresses. `confidential` is Very High Risk: Social Insurance Numbers, government identity documents, bank
  > account information, personal health information, passwords and keys, biometric and identifiable genetic data, and dates of
  > birth. U1 makes the information's steward, for an app its owner, the one who classifies, and allows a higher class but never a
  > lower one (§4.1).
- **D17's reason** (line 213), proposed:
  > UBC's U1 standard rates student personal information High Risk and health, identity and financial information Very High.
  > Manifest's four classes are U1's four levels, so an owner classifies by UBC's own table, and which class a model is approved for
  > is the catalogue's to say. Very High never leaves UBC's hardware; High reaches a provider outside Canada only at a classification
  > an administrator gives it, and the Privacy Office has the last word (§9). The pre-review design was one YAML line away from
  > sending either anywhere by accident. Both fields already existed; linking them is nearly free.
- **Lines 519-520,** proposed:
  > …the name's `max_classification` is what the platform enforces meanwhile: the off-premise names at `internal` until it answers
  > whether U1's High Risk may reach them, then `personal`. A `confidential` app's own AI never leaves on-premise hardware.
- **Lines 522-523 and §10 line 1037:** replace *"on a `confidential` project"* with *"on a project whose classification is above the
  capable model's"*. That covers `personal` today and only `confidential` once the capable model is raised.
- **Lines 505-513, 543, 548-550 and 1794:** unchanged; they stay true.
- **Pages:**
  - Story 04 changes *"confidential, correctly"* to *"personal, correctly"*. Its refusal beat holds only while the off-prem models
    are approved to `internal`.
  - `manifest-decisions.html:137` follows D17's reason.
  - `manifest-schematic.html:1073` (*"never for a confidential app's own AI"*) stays true.

**Code (c2):**

- **Add the class:** `spec/schema.ts:8` (`'personal'` between `internal` and `confidential`); `:12-16` (rank: `personal: 2`,
  `confidential: 3`; ranks are only compared and never stored); `:263` (the description).
- **Rank comparisons** need no change: `policy.ts`, `release.ts`, `catalogue.ts`, `intake.ts`, `capable.ts`, `models.ts:41`, `:105`,
  `:137`.
- **The builder exception, `ai/models.ts:37`.** It becomes "the floor is above the capable model's class", or simply `builder ===
  'capable'`: when the floor is at or below the capable model's class, the rank filter already includes it. Either way, no class
  literal is left. **A sub-decision for you:** whether a `personal` project's building agent gets the capable model by default, as a
  `confidential` one does today. Recommended yes, for Spec action 10's reason: the agent sees code, not data.
- **The Incident logs, `api/routes/releases.ts:1253`. Must change, or it fails open.** It becomes: refuse while `builder ===
  'capable'` and the environment's floor ranks above the capable model's `max_classification`. Today that is `personal` and
  `confidential`; after the raise, only `confidential`.
- **Unchanged:** `launch/assessment.ts:97, 207`, because `confidential` still means on premises.
- **Wording:** `ai/sessions.ts:439, 653`; `observability/event-schemas.ts:853, 868`; the `INCIDENT_LOG_CONFIDENTIAL` description (the
  code's name stays; it becomes a slight misnomer); `policy.ts:215`; `api/testing.ts:313`.
- **Config:** no change to `infra/litellm/config.yaml` now. The raise later is `CAPABLE_CLASSIFICATION` in `capable.ts` (`'internal'` to `'personal'`, or make
  it a setting) and `@personal` in `MANIFEST_GATEWAY_MODELS`.
- **Tests:** new `personal` cases. The 14 test files that mention `confidential` keep their meaning.
- **Contract:** the enum value at `openapi.json:18610-18619` and `schema.d.ts:5350` makes 1.6.0 → 1.7.0. I judge this additive; I did
  not check the contract's own versioning rule.
- **Mock:** an option beside the existing `confidential` one.
- **Front-end:** an FE-n ask, sent to its live session at the contract commit: `lead.ts:125` gains a `personal` line, and the
  FE-36 sentences in `words.ts:396-453` handle the new class.

**What (c2) closes:**

- The classes map one to one onto U1, so a faculty member classifies by UBC's table (U1 §4.1 makes the owner the classifier).
- Every written statement stays true: D17, Story 04 with one word changed, the proof app, and spec lines 520 and 548.
- Your sentence becomes **one value per model** rather than a redefinition.
- **No existing declaration widens:** a `confidential` app keeps the on-premise meaning. An app moves to `personal` only by
  re-declaring, which is a sensitive-field change that re-escalates on a launched app (D9). That is the control you want there.

**What (c2) leaves open:** whether High may actually reach OpenAI or Bedrock. That is the Privacy Office's question, now with a
precise place for the answer.

**(c1), not recommended: a new class on top.** `public` = Low, `internal` = Medium, `confidential` = High, **`restricted` = Very High
(new)**. It does the same job, but:

- `confidential` changes meaning. Every on-prem entry moves to `restricted` (`config.yaml:45, 73`; spec lines 508, 510, 520, 543,
  548, 1794). So do the gateway plan's Decision 7, `assessment.ts:97, 198, 207`, and `INCIDENT_LOG_CONFIDENTIAL`.
- **The day the off-prem models are raised to `confidential`, every app that declared `confidential` gains OpenAI access silently,**
  including any that holds Very High data. Each would have to be re-examined first.
- It touches more lines and carries a migration hazard (c2) does not.

**Privacy implication of (c), both variants:** nothing changes until a model is raised. Raising is then an explicit, audited catalogue
change (§26), not a reinterpretation of every app's declaration.

**Cost to change course later:**

- To get (a)'s behaviour: raise the off-prem models to `personal`.
- To get (b)'s behaviour: leave them at `internal`.
- **To go back to three classes:** remove the enum value, which breaks the contract (2.0.0), and re-declare every `personal` app.
  **This is the one-way door,** so choose it deliberately.

### (d) Leave the classes undefined, and record your sentence as guidance for the Privacy Office

**Spec words:** none. Your sentence joins ORIENTATION §8's open bullet (lines 1999-2006) and `external-track.md` item 11 as Rich's
position: *"High Risk (U1) may reach OpenAI or Bedrock through UBC's AI Gateway; Very High may not."*

**Code:** none.

**What it closes:** nothing in the platform. It records your view where the Privacy Office question already lives.

**What it leaves open:**

- Faculty still have no definition to classify by, and the schema's description says only *"how sensitive"*.
- `internal` means "may reach OpenAI" while nothing says what it may contain.
- The Story 04 and D17 reading (student personal information is `confidential`) stays unwritten, and the front-end's agent never
  learns it.

**Privacy implication:** the same as today. Whether student personal information reaches OpenAI depends on how each owner reads
three undefined words.

**Cost to change course later:** none now. Every later option costs what it costs today, plus re-examining the apps declared in the
meantime.

---

## Recommendation

**(c2): four classes, one for each U1 level, with `personal` = High added below `confidential` = Very High. The off-premise models
stay `internal` until the Privacy Office answers. Then each is raised to `personal`, one value at a time.**

**Why:**

1. **It is the only option that keeps every written statement true and still gives your sentence somewhere to land.**
   - (a) enacts your sentence by quietly reversing D17's reason. It also makes the default class carry student personal information
     to OpenAI, starting with staging's real people, before any PIA.
   - (b) contradicts your sentence.
   - (d) defines nothing.
2. **U1 itself makes the owner the classifier (§4.1).** A one-to-one map lets Manifest say "use UBC's table" with no Manifest-specific
   lumping for faculty, the front-end's agent or a PIA reviewer to learn.
3. **No existing declaration changes meaning.** That is why (c2) is preferred over (c1). It also makes it cheapest now: no real
   faculty app exists yet, and A1 ("production instances by audience") is in the queue.

**It costs:**

- a contract minor version (1.7.0) and an FE-n ask;
- about ten control-plane sites, of which `api/routes/releases.ts:1253` is the one that must not be missed;
- spec lines 213, 405, a new paragraph, 519-520, 522-523 and 1037;
- the four shared HTML pages swept with it.

Spec actions are applied only with your approval; nothing here is drafted as applied.

**Timing with the gateway plan:** an unknown class string is refused, not defaulted (`catalogue.ts:104-110`). So do not give
`MANIFEST_GATEWAY_MODELS` the value `@personal` before the code exists. Give the on-prem gateway models `confidential` at sitting 2's
close as Decision 7 says; (c2) leaves that correct.

**If you want zero code now:** (b)'s definitions are the fallback, with (c2) done before the first real faculty app. The cost of that
delay is re-examining every `confidential` app declared in between.

---

## Not Rich's alone

1. **Whether U1 High Risk information (FIPPA personal information: student names, IDs, grades) may be sent to OpenAI's API, or to AWS
   Bedrock, through UBC's AI Gateway.** This is ORIENTATION §8's open question (lines 1999-2006) made sharper: it names a U1 level
   instead of "internal". It is FIPPA's and the Privacy Office's question (spec line 519 already says so). Your sentence may reflect a
   UBC position, for example the gateway's approved use. **If it does, citing that document turns it from a judgement into a fact on
   the record**, and a raise under (c2) can follow. Put it beside `external-track.md` item 11.
2. **Whether the building agent of a `personal` or `confidential` project should call the capable model by default** (Spec action 10;
   `external-track.md` item 11 already asks this for `confidential`). Under your own sentence, a Very High project's code and
   description reaching OpenAI is worth asking about.
3. **Staging's real people** (`external-track.md` item 13). Any option that lets High reach an off-prem model lets it happen in
   staging before a PIA is approved.
4. **NEW, and on no list I found: U1 §3 classifies Manifest itself.** At UBC scale, a platform that *"transact[s] or store[s] … High
   and Very High Risk Information of most members of internal Constituents"* is a **Very High Risk Electronic Service** (§3.2.4).
   §4.2.3 then requires a Security Threat Risk Assessment and a Shared Responsibility Model. Neither "STRA", "SRM" nor "U1" appears in
   `docs/external-track.md` or the spec. This is for UBC Information Security (information.security@ubc.ca, U1 §1.4) and belongs on
   the external track. Rich deferred that track on 2026-09-30, so this is a note, not an urgency.
5. **Who classifies.** U1 §4.1 puts it on the *"Information Steward/Owner"*. Whether that is the faculty member, their department or
   UBC for an app on Manifest is UBC's to say. The PIA reviewer may reclassify an app whatever Manifest's map says.

---

## What I could not verify

- **Where your permission comes from.** U1 defines levels and says nothing about providers, countries or AI. I found no UBC document
  saying High Risk may reach OpenAI through the API. I fetched only U1 and its linked case-study page, not UBC's generative-AI
  guidance, the AI Gateway's terms, or the U1 glossary.
- **Where OpenAI and Bedrock process and keep data.** Nothing I read records Canadian residency or zero data retention for OpenAI
  organisation `ubc-ltic-incubator`, or the region of Bedrock's `llama3`. The gateway itself does not store prompts (Rich, 20:42), but
  OpenAI's own retention is unrecorded. `[M4]` measured that `/v1/responses` stores answers by default; Manifest's keys cannot reach
  that route.
- **What FIPPA says today about disclosure outside Canada.** D17's reason, Story 04 and `policy.ts:215` state it as a prohibition. My
  unverified recollection is that BC's 2021 amendments replaced the old data-residency rule with conditions, which would make it a
  Privacy Office judgement, not a ban. I did not check, and nothing here should rely on it.
- **The contract's versioning rule.** I assume adding an enum value is a minor bump.
- **The laptop's LiteLLM database rows.** I did not check whether the DB-held rows would need touching under (c1). (c2) needs none.
- **The front-end's full use of the class.** I read only grep hits in `~/Developer/manifest-app`; there may be more.
