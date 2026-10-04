## Spec actions

**ONE, DRAFTED 2026-10-03 FOR THE U1 CLASSIFICATION PLAN, AND REVISED THE SAME NIGHT TO A FRESH REVIEW (see *Revised to the review*,
at the end). NOT DECIDED, NOT APPLIED.**

- Rich decides it before the plan's first sitting. It is applied only after he has read the words.
- **Apply it only after the gateway plan's acceptance.** That plan's sitting 3 holds its whole-branch review against the spec, and
  should read the spec its code was built to. E5 rewrites a sentence that the gateway plan's Spec action 1 applied tonight
  (`b416a8f`).
- **A spec action is not finished when the spec changes**: the shared HTML pages restate it, and are swept with it.

*Where the line numbers come from:*
- the spec, `docs/superpowers/specs/2026-08-29-manifest-platform-design.md`, as of `b416a8f` (2026-10-03 20:05), clean;
- the code, as read at `940718e` through `42cf080`. A peer session is editing `packages/control-plane/src/ai/`, so re-read those lines
  before relying on them.

### 1. §7, §10, §16, §20, §26 and D17: `data.classification` becomes UBC's U1 levels

**Why.** Rich decided the shape at 21:48 PDT on 2026-10-03 (`../2026-09-30-decisions.md`, its 21:48 entry, `940718e`):

- *"Can we not just use the same names from the ISS U1? Very high risk forces on prem models only."* So the levels are `low |
  medium | high | very-high`.
- *"Keep them as aliases"*, with fixed meanings: `public` = `low`, `internal` = `medium`, `confidential` = `very-high`. The mapping
  never widens. It is additive (contract 1.7.0).
- On High Risk reaching OpenAI: *"it's been deemed okay as long as ZDR is enabled (which it is for our org on open ai)"*.
- On `llama3` on AWS Bedrock: *"high, like OpenAI"*. This is his call and is unverified here.

At 22:08 (the same file, its 22:08 entry):
- `MANIFEST_CAPABLE_MODEL` became `ubc-ai-gateway/gpt-6-luna`.
- `MANIFEST_GATEWAY_MODELS` became `ubc-qwen-27b=ubc-ai-gateway/qwen3.8-27b@confidential` alone.
- `llama3` cannot be added yet because it is unpriced.
- `qwen3.6-35b-a3b` cannot be added because *"the gateway falls back to gpt-6-luna"*. This is the concrete case of a gateway-side
  fallback that S1's rule must see.

U1 (https://cio.ubc.ca/information-security/policy-standards-resources/U1, *"Standard Last Revised: 2026-03"*) rates *"student name"*,
*"Student ID or Employee ID"* and *"student grades"* High Risk. Very High is SIN, government ID, bank account, PHI, passwords and keys,
biometric and genetic data, and date of birth. The spec today defines none of its three classes, and its D17 reason and Story 04 put
student personal information on premises.

**What changes on disk, exactly.** This is the review's I7, written for S2 (i) and S3 (a) as recommended:
- **The aliases need no migration.** `config.yaml`'s `internal` and `confidential` values, Rich's `@confidential`, and every frozen
  release and stored spec keep their strings and are read as their levels.
- **`config.yaml` is unchanged under S2 (i).** Under S2 (iii), three of its values become `high`.
- **The LiteLLM database rows the platform registers (the capable model, the gateway's models) are re-created only when a level
  actually changes**, once `registration.ts:237` compares `canonicalLevel` on both sides. The first such boot is the one after Rich
  sets `MANIFEST_CAPABLE_MODEL_CLASSIFICATION=high`: `default-chat-large`'s row, once.
- Left as a string comparison, `:237` would re-create every alias-registered row at the first boot, merely for its name.

#### The sub-decisions, each with one recommendation

| # | The question | Recommended | The alternatives, and what they cost |
|---|---|---|---|
| **S1** | Does §7 write the rule for the top two levels, covering **everything that may answer a name**? | **Yes** (E3): *`very-high` only when everything that may answer it runs on UBC's hardware; `high` only when everything that may answer it either runs on UBC's hardware or keeps none of what it is sent (zero data retention). Everything that may answer it is the vendor behind any gateway and every model a gateway may fall back to; the administrator attests it.* This is Rich's ZDR ground made a rule, and it sees `qwen3.6-35b-a3b`'s fallback to `gpt-6-luna`: that model may be `high`, never `very-high`. | D17's reason alone, with no rule. By the letter of today's words, *"UBC's AI Gateway is the platform's upstream provider"* (l.539) and does not store prompts, so **any** model it serves could be called `high`, a non-ZDR vendor included. |
| **S2** | Which names are `high` now? | **(i) only what Rich decided.** The gateway's OpenAI models, by `@high` in `MANIFEST_GATEWAY_MODELS`; the capable model while it is one of them (S3); `llama3` on Bedrock once the gateway prices it. On a laptop, `default-chat`, `default-chat-reasoning` and `default-embed` are Ollama on `host.docker.internal:11434` (`config.yaml:20-21, 57-58, 77-78`), the same daemon as `default-chat-onprem`, and route nowhere. **At UBC nothing names their provider:** *"may route off-prem"* (l.509, l.512) is a label for a deployment nobody has chosen, and where UBC hosts Manifest is undecided. So they stay `medium` (their alias `internal`, untouched), and the spec says their level is the administrator's attestation, under S1's rule, for whichever provider UBC names. | **(iii)** the laptop's three at `high` in `config.yaml` (local Ollama meets S1's rule), with the same spec words. **(i) costs, and (iii) avoids:** a `high` app has **no embedding model and no small chat model**, only `default-chat-large` (network) and `default-chat-onprem`. That is the limit `confidential` apps have today, but under U1 most CWL apps are `high`, so it reaches most apps; Story 04's app (*"searches the course readings"*) cannot embed. (iii) goes beyond the 21:48 words. |
| **S3** | (a) What is the capable model's level, and (b) is it capped? It may be pointed *"directly"* (l.518): `providers.ts` routes `openai/<model>` with `OPENAI_API_KEY`, a backup whose retention nobody has attested. | **(a) A platform setting of its own**, `MANIFEST_CAPABLE_MODEL_CLASSIFICATION`, defaulting to `medium` (today's `internal`; no change until set). Rich sets `high` (`gpt-6-luna` through the gateway), which is the attestation. **(b) No cap:** any level under S1's rule, like every other entry. A capable model on UBC's GPUs (external-track item 11's option A) could be `very-high`, and would then serve `very-high` apps. | (a) Hard-coded `high` at `capable.ts:40`: wrong the day it is repointed to a non-ZDR route. An `@level` suffix on `MANIFEST_CAPABLE_MODEL` changes an existing setting's grammar. (b) Cap at `high`: refuse `very-high` at config load. Simpler to read, but it blocks option A without a spec change. |
| **S4** | **Does a `high` project's building agent get the capable model by default?** | **Yes.** While the capable model is `high`, D17 itself allows it. Whenever it is lower (S3's default `medium`), the builder setting's exception covers **every project whose level is above the capable model's**. The reason is Spec action 10's: the agent works on the code, not the data. | The exception for `very-high` only. A `high` project's agent then loses the capable model whenever the capable model is below `high`. That fails closed, but it means building with the small model. |
| **S5** | What is the default level of an app that declares none? | **`medium`**: today's `internal` under its alias, so there is no change in behaviour. E2 tells owners that any personal information means `high`, and the plan makes the blueprint's and the front-end's agents declare a level every time. | **`high`.** It is right for the typical CWL app, and E2's own guidance says so. **Its true costs under S2 (i):** (1) intake is defined by the default level (l.1056-1058), and `MANIFEST_INTAKE_MODEL` defaults to `default-chat` (`config.ts:443`), which is `medium`, so **intake pauses** until it is pointed at a `high` model; (2) an undeclared app listing `default-chat` or `default-embed` stops validating; (3) every launched app that declares no level changes its stored default from `internal` to `high`, a sensitive-field change that re-escalates its next production release (`diff.ts:183`; D9). No real faculty app exists yet, so (3) is nearly free now. |
| **S6** | Does the platform answer in U1's names, with an alias read back as its level? | **Yes**: one vocabulary for every reader. `manifest.yaml` in git keeps what its author wrote. **This is a behaviour change:** `getSpec` (`project-reads.ts:749` returns the stored `parsed`) and the release representations (`representations/releases.ts:138`; `openapi.json:20385, 20532, 20679`, each a plain `string`) answer `medium` where they answered `internal`, for old rows too once canonicalized at read. The front-end compares no values; it keys off `INCIDENT_LOG_CONFIDENTIAL` and model names. | Echo what was written. Answers then mix vocabularies, and every reader needs the alias table. |
| **S7** | What does the §7 example manifest declare? It collects `mail`, `givenName` and `sn` (l.387), so it is `high` under U1. | **`high`.** Under S2 (i), its `ai.models` (l.392) becomes `[default-chat-large, default-chat-onprem]`, because no embedding model is approved for `high`. Under S2 (iii), its models stay. | Keep `internal`/`medium`. The spec's own example would then teach a mis-classification. |
| **S8** | Story 04, *Reading responses* | **Under S2 (i), keep the refusal and change only its reason** (shared pages, below). `default-chat` is still not offered to a `high` app. | Under S2 (iii), no model is refused to a `high` app, so the beat becomes a check that is shown (words below). Its `class="snag"`, the tag's `class="stop"` and Week 2's *"the second refusal"* then change too. |
| **S9** *(the review's I2)* | **May a delegated token read staging's and production's Incident log tails of a `high` project?** Today student personal information is `confidential` by D17's reason and Story 04, and its tails are refused to a token (`releases.ts:1249-1257`). Under U1 that data is `high`. A token is by design a bring-your-own-agent credential (spec l.142, *"a third-party agent on a user's own machine holding a delegated token"*; D24, l.220), so its agent's model is unattested. | **(b) Refuse them for every project at `high` or above**, whatever the capable model's level or the builder setting. Code at `releases.ts:1249-1257`: `actor.credential === 'token' && environment.kind !== 'sandbox' && rank(await environmentFloor(...)) >= rank('high')`. This is S1's rule applied to the one reader the platform cannot attest. **Cost:** the front-end's repair loop is answered `403 INCIDENT_LOG_CONFIDENTIAL` on staging and production for most real apps. It already says so to the person (`manifest-app/packages/server/src/platform/instances.ts:108-112`; `build/round.ts:705-709`), and reads the sandbox's freely. The code keeps its name; its description changes. | **(a) As first drafted:** refused only when the level is above the capable model's and the builder setting is `capable`. With the capable model at `high`, that means `very-high` only, so **`high` tails are answered to tokens**. **(c)** Refused while the builder setting is `capable` and the level is `high` or above: today's trigger extended, but with the setting at `on-premise` the tails are answered again, for a reason unrelated to who reads them. |
| **S10** *(the review's I3)* | **Does "very-high forces on-prem" cover the agent that BUILDS a `very-high` app?** Rich, 2026-10-03 21:48: *"Very high risk forces on prem models only."* Rich, 2026-09-28, Spec action 10's ground (`plans/2026-09-27-front-end-enablement.md:184-187`): *"when it becomes confidential we need to switch to the on-prem models. It's okay to use the larger models to BUILD the app, but if the app needs AI, then we should switch to use the on-prem model for the AI within the created app."* and *"We can use the default large models for sensitive apps now, but if we need to change it to the on prem models, then we can adjust."* | **(a) No: Spec action 10 stands.** `MANIFEST_AGENT_BUILDER_MODELS` stays `.default('capable')` (`config.ts:413`). The 21:48 sentence answered which models a level's **data** may reach. Spec action 10 is about the agent writing **code**, and Rich's own 09-28 words keep that open (*"now … then we can adjust"*). What reaches OpenAI is the code and the person's description of the app; never the app's data, and never staging's or production's tails (S9). | **(b) Yes:** `config.ts:413` becomes `.default('on-premise')`, and E6 says *"no by default"*. At the next boot every `very-high` session holding the capable model is narrowed or ended (`index.ts:503-530`), and a `very-high` app is built by `default-chat-onprem` or `ubc-qwen-27b`, the small models Rich accepted for *"the AI within the created app"*. |
| **S11** *(the review's I1, for running apps)* | **When a model's level is lowered** (a provider's zero retention lapses), what happens to a **running** app whose key holds it? E3's words fix the catalogue (a lowered entry is never kept higher), and agent sessions are narrowed at boot. An app's key keeps its deployed models until its next deploy, which re-checks D17 (`release.ts:1093-1105`). | **(a) Take effect: at boot, after the catalogue, every serving instance's key loses each model now ranked below its frozen level.** A key that would be left with none is **revoked**, never narrowed to an empty list, because LiteLLM reads `models: []` as every model (`ai/keys.ts:137-141`). Each change emits an event to the project's people and an operator line. It is new code, a sweep like `narrowSessionsHoldingMore`. **Cost:** that app's AI stops answering for that model until its owner changes models or level. | **(b) Refuse loudly but leave running:** an operator line and an event name every such instance until it is redeployed. **(c) As today:** the deploy-time re-check only. Under (b) and (c), High data keeps reaching a provider that no longer meets S1's rule. |

#### Proposed: fourteen edits (E1 to E14), written for the recommendations

- **E1, §7 schema example.**
  - **l.405.** Current: `  classification: internal        # public | internal | confidential`. New:
    `  classification: high            # low | medium | high | very-high (UBC's U1 levels, below); default medium`
  - **l.392, under S2 (i) only.** Current: `  models: [default-chat, default-embed]   # logical names only`. New:
    `  models: [default-chat-large, default-chat-onprem]   # logical names only; each approved for high`

- **E2, §7, a new subsection immediately before l.503's `### Classification gates model routing (D17)`:**

  > ### Data classification: UBC's U1 levels
  >
  > **`data.classification` names the most sensitive information the app keeps or sends to a model, in the four levels of UBC's
  > Information Security Standard U1, *Security Classification of UBC Electronic Information and Services* (§2.1), by U1's own
  > names:**
  >
  > - `low`: information that would cause minimal harm if disclosed, or may be freely disclosed, such as what is on a public website,
  >   the work contact details of faculty and staff, or research that is neither personal nor proprietary.
  > - `medium`: information no law or regulation protects that could still harm UBC or others if released, such as material held
  >   under a non-disclosure agreement, confidential financial records or proprietary research.
  > - `high`: information law or regulation protects whose disclosure could cause moderate harm, such as personal information under
  >   FIPPA: student names, student and employee IDs, grades, full-face photographs and home addresses.
  > - `very-high`: protected information whose disclosure could cause significant harm: Social Insurance Numbers, government identity
  >   documents, bank account information, personal health information, passwords and keys, biometric and personally identifiable
  >   genetic data, and dates of birth.
  >
  > **An app that keeps any personal information is therefore `high` at least**, because U1 puts FIPPA's personal information there
  > (§2.1.3). A person's work contact details are not personal information under FIPPA, which is why U1 puts faculty and staff contacts
  > at Low. An app that declares no level is `medium`. U1 makes the information's steward the one who classifies, and allows a higher
  > level than its table gives but never a lower one (§4.1). Manifest asks the app's owner to declare the level. It checks the
  > declaration against the models the app may call (D17), never against the data, which it cannot see, and the privacy assessment
  > (§9) is where UBC reviews both.
  >
  > **Manifest's earlier names are aliases, valid forever, each with one fixed meaning: `public` is `low`, `internal` is `medium`,
  > `confidential` is `very-high`.** An alias never comes to mean anything wider. It is accepted wherever a level is (`manifest.yaml`,
  > a catalogue entry's `max_classification`, a platform setting) and compared as the level it names, so writing one for the other is
  > not a change (*Sensitive fields*). The platform answers and documents in U1's names.

- **E3, §7, the catalogue, l.505-513.** The block becomes:

  ```
  default-chat-onprem              max_classification: very-high
  default-chat                     max_classification: medium     # may route off-prem; its level the administrator's attestation, below
  default-chat-onprem-reasoning    max_classification: very-high
  default-chat-large               max_classification: (a platform setting, §26 — medium unless set)   # the capable model — a commercial provider, through UBC's AI Gateway or directly, off-prem
  default-chat-reasoning           max_classification: medium     # as default-chat
  default-embed                    max_classification: medium     # as default-chat
  ```

  *(Under S2 (iii), the three `medium` lines read `high`. The two on-premise lines keep `confidential` in `config.yaml`, which is the
  alias, unmigrated.)*

  A new paragraph follows it, after l.514:

  > **What an entry may be is fixed by everything that may answer it: the vendor behind any gateway, and every model a gateway may fall
  > back to.** An entry is `very-high` only when everything that may answer it runs on UBC's hardware. It is `high` only when
  > everything that may answer it either runs on UBC's hardware or keeps none of what it is sent (zero data retention). The platform
  > can see none of this, and the administrator attests it, for every entry and for whichever provider UBC points a name at. An entry
  > may carry an alias; it is the level it names.
  >
  > **A lowered level takes effect, or the entry is withdrawn. The platform never keeps an entry at a level above the one it is now
  > given.** If the lowered entry cannot be registered, it leaves the catalogue, and its refusal names the setting. At the next boot,
  > every agent session and every running app's key loses each model its project's level no longer allows. A key left with none is
  > revoked, and each loss is an event to the project's people.

  *(The last sentence of the second paragraph is S11 (a). Under S11 (b), it reads: "…every agent session loses each model its
  project's level no longer allows, and every running app whose key still holds one is named in an event to its people and an
  operator line until it is redeployed.")*

- **E4, §7, l.519-520.** Current: *"Whether data of a given classification may reach a provider outside Canada is the Privacy Office's
  to say (§9); the name's `max_classification` is what the platform enforces meanwhile, and a `confidential` app's own AI never leaves
  on-premise hardware."* New:

  > *"Whether information of a given level may reach a provider outside Canada is the Privacy Office's to say (§9). Meanwhile the
  > platform enforces each name's `max_classification`; the capable model's is a platform setting (§26), given under the rule above.
  > A `very-high` app's own AI never leaves on-premise hardware."*

- **E5, §7, l.543-545 (the AI Gateway's models).** Current: *"each at the `max_classification` the administrator gives it —
  `confidential` only for a model that runs on UBC's hardware with no fallback off it, which the platform cannot see and the
  administrator attests. A model the platform cannot price is refused, except a `confidential` one, which is charged the on-premise
  model's synthetic price so budgets bind."* New:

  > *"each at the `max_classification` the administrator gives it, under the rule above: `very-high` only when everything that may
  > answer it runs on UBC's hardware, and `high` only when everything that may answer it runs there or keeps none of what it is sent,
  > the gateway's own fallbacks included, which the platform cannot see and the administrator attests. A model the platform cannot
  > price is refused, except a `very-high` one, which is charged the on-premise model's synthetic price so budgets bind."*

- **E6, §7, l.522-529 (Spec action 10's building agent, and the Incident tails).** Current, whole: *"**The agent that BUILDS an app is
  governed by a platform setting of its own (§26)**: whether an agent session on a `confidential` project may call the capable model
  as well as the on-premise models — **yes by default**, because writing an app is the work a small model cannot do. Set to on-premise
  only, every such session gets the on-premise models alone. Whenever a project's classification or this setting withdraws a model
  from a live agent session, the session is narrowed in place: its key keeps the models the project still allows and loses the rest
  at once, the session goes on, and its event says what was withdrawn. A session left with nothing it may use is ended. The app's own
  `ai.models` stays on-premise either way. **While the setting allows it, a delegated token on a `confidential` project is refused
  staging's and production's Incident log tails**, which can carry the input of the people the classification protects."* New, for
  S4 (yes), S9 (b) and S10 (a):

  > *"**The agent that BUILDS an app is governed by a platform setting of its own (§26)**: whether an agent session on a project
  > whose level is above the capable model's may call the capable model as well as the models D17 allows the project. The answer is
  > **yes by default**, because writing an app is the work a small model cannot do, and the agent works on the code rather than the
  > data. Set to D17 alone (its value is `on-premise`, named when only on-premise models stood above the capable model), every such
  > session gets only the models D17 allows the project. Whenever a project's level, the capable model's level or this setting
  > withdraws a model from a live agent session, the session is narrowed in place: its key keeps the models the project still allows
  > and loses the rest at once, the session goes on, and its event says what was withdrawn. A session left with nothing it may use is
  > ended. The app's own `ai.models` is held to its level either way. **A delegated token is refused staging's and production's
  > Incident log tails on a project at `high` or above.** The level here is the strictest of the project's and of every release that
  > has run in that environment. A token is the credential of an agent the platform cannot see (D24), so no administrator has
  > attested the model it hands those tails to, and they carry real people's input."*

  - Under **S9 (a)**, the last two sentences read: *"**While the setting allows it, a delegated token on a project whose level is
    above the capable model's is refused staging's and production's Incident log tails**, which can carry the input of the people the
    level protects. This assumes a token's agent sends what it reads only to the platform's own models."* The assumption sentence is
    what (a) rests on, and D24's bring-your-own agent breaks it.
  - Under **S10 (b)**, *"yes by default, because…data"* becomes *"no by default: Very High Risk forces on-premise models only, for
    the agent that builds the app as for the app; an administrator may allow it"*.

  **Why the refusal cannot fail open for `high`.** Under (b), the condition names a level, `high`, compared by rank, which no setting
  moves. Under (a), it is the same condition that grants the exception, and it holds only on the stated assumption about the token's
  holder.

- **E7, §7, l.548-550.** Current: *"An app declaring `data.classification: confidential` may therefore resolve only to on-premise model
  groups."* New:

  > *"An app declaring `data.classification: very-high`, or its alias `confidential`, may therefore resolve only to models everything
  > behind which runs on UBC's hardware, and one declaring `high` only to models everything behind which runs there or keeps none of
  > what it is sent."*

  The sentence after it (*"This is checked at spec validation…"*) is unchanged.

- **E8, D17, l.213, the *why* column.** It is a table cell, so the applier keeps it on one line. Current: *"A BC public body sending
  student personal information to a US model provider is a FIPPA problem, and the pre-review design was one YAML line away from it by
  accident. Both fields already existed; linking them is nearly free."* New:

  > *"UBC rates its information in four levels (U1, §7), and the level decides which models may receive it. Very High Risk
  > information, such as health, identity and financial records and passwords, never reaches a model off UBC's own hardware. High Risk
  > information, student personal information among it, reaches a commercial model only when every provider that may answer it keeps
  > none of it: zero data retention, on a UBC determination Rich reported on 2026-10-03 (*"it's been deemed okay as long as ZDR is
  > enabled"*), not yet on the record. Whether that suffices for an app is the Privacy Office's last word (§9). The pre-review design
  > was one YAML line away from sending any of it anywhere by accident. Both fields already existed; linking them is nearly free."*

  The *what* column is unchanged.

- **E9, §10, l.1037-1038.** Current: *"and, on a `confidential` project while the builder setting allows it (§7, §26), the capable
  model too."* New:

  > *"and, on a project whose level is above the capable model's while the builder setting allows it (§7, §26), the capable model
  > too."*

- **E10, §10, intake, l.1056-1061. The bold markers stay as they are.** Current: *"**it must be a model D17 allows for §7's default
  classification, `internal`: a catalogue entry whose `max_classification` is `internal` or `confidential`.** … if the entry loses its
  classification, or is lowered to `public`, intake pauses"*. New:

  > *"**it must be a model D17 allows for §7's default level, `medium`: a catalogue entry whose `max_classification` is `medium`,
  > `high` or `very-high`.** … if the entry loses its level, or is lowered to `low`, intake pauses"*

- **E11, §26, *Platform settings*, l.2973-2976.** Current: *"and the capable model's provider and model, and its fallback, the AI
  Gateway's address and the catalogue entries it answers (§7), and whether a `confidential` project's building agent may call it
  (§7), whose change is one too."* New:

  > *"and the capable model's provider, model and level, and its fallback, the AI Gateway's address and the catalogue entries it
  > answers (§7), and whether the building agent of a project above the capable model's level may call it (§7), each of whose changes
  > is a change to the model catalogue too, with its step-up."*

- **E12, §16, the security regression tier, l.1794.** Current: *"a `confidential` app cannot resolve an off-premise model"*. New:

  > *"a `very-high` app (or `confidential`, its alias) cannot resolve an off-premise model"*

- **E13, §20, the risk table, l.2143.** Current: *"D17 classification-constrained model routing; LiteLLM log retention policy"*. New:

  > *"D17 classification-constrained model routing, in U1's levels: `high` only to models everything behind which runs on UBC's
  > hardware or keeps none of what it is sent; LiteLLM log retention policy"*

- **E14, the public hint, `packages/control-plane/src/spec/policy.ts:213-215`.** This is not spec text, but it is public refusal text
  and states a law nobody here has checked. Current:

  > `` `"${model}" is approved up to ${entry.maxClassification} data and this app declares ` + `${spec.data.classification}. Choose an
  > on-premise model, or lower data.classification ` + 'if it is overstated. A BC public body may not send personal information to a
  > model running outside Canada.' ``

  New (each value printed through `canonicalLevel`, S6):

  > `` `"${model}" is approved for ${level(entry.maxClassification)} data at most, and this app declares
  > ${level(spec.data.classification)}. Choose a model approved for ${level(spec.data.classification)} data, or lower
  > data.classification if it overstates the app's data: the levels are UBC's own (Information Security Standard U1). Which models
  > may receive each level is the platform's catalogue to say, and whether an app may use them, the Privacy Office's.` ``

**Unchanged, checked:**
- l.451-453 and l.477-479: sensitive fields and validation compare by rank;
- l.535: the fallback must be at least the capable model's level, and `very-high` ≥ any;
- l.546: *"`default-chat` and the on-premise model a laptop runs stay local"*, still true under either S2 option;
- l.809 and l.812: the PIA table;
- l.1763: the hooks table.

*Options for the action as a whole:*
- **(a) as proposed, with S1 to S11 as recommended** (recommended);
- **(b) as proposed, with S2 (iii)**, which keeps embeddings and the small model for `high` apps on a laptop;
- **(c) definitions and aliases only (E1, E2, E8), with the catalogue at today's values.** Rich's ZDR ground would then be recorded
  but not enacted. It is the smallest change, and it contradicts his decision for High.

#### Shared pages

`manifest-phases.html` has no mention (checked by grep, 2026-10-03).

- **`manifest-decisions.html:136`** (D17's *what*): *"How sensitive an app's data is decides which AI models it is allowed to use."*
  becomes:

  > *"How sensitive an app's data is, on UBC's own four-level scale, decides which AI models it is allowed to use."*

- **`manifest-decisions.html:137`** (D17's *why*): *"A BC public body sending student personal information to a model running in the
  United States is a privacy problem."* becomes:

  > *"UBC rates its information in four levels, and the level decides which AI models may receive it: the most sensitive, such as
  > health, identity and financial records and passwords, never reaches a model off UBC's own hardware, and student personal
  > information reaches a commercial model only when the provider keeps none of it, with UBC's Privacy Office having the last word on
  > each app."*

  In the same paragraph, *"by default it may use the more capable model even for a sensitive app"* becomes *"by default it may use
  the more capable model even for an app whose data that model may not receive"*. Under S10 (b), it becomes *"for the most sensitive
  apps it is confined to UBC's own hardware too"*. The rest is unchanged.

- **`manifest-stories.html:197`:** `<li class="stop">confidential data</li>` becomes `<li class="stop">high-risk data</li>`. The class
  stays under S2 (i); under S2 (iii) it changes to `hi`.

- **`manifest-stories.html:205-210`** (Story 04's first beat). Current: *"Week 1 — the first refusal. They mark the data as
  confidential, correctly — it is student work with names attached. Manifest immediately narrows the list of AI models the app may
  use to those running on UBC hardware. The faster, cheaper option is simply not offered. The reason is shown, not just the
  restriction: a BC public body may not send student personal information to a model running in another country."*

  New, under **S2 (i)**, which keeps the refusal, its heading, its `class="snag"` and Week 2's *"the second refusal"*:

  > *"Week 1 — the first refusal. They mark the data as high risk, correctly: it is student work with names attached, which UBC's own
  > standard rates High. Manifest immediately narrows the list of AI models the app may use to those approved for it: the ones running
  > on UBC hardware, and a commercial one whose provider keeps nothing it is sent. The faster, cheaper option is simply not offered.
  > **The reason is shown, not just the restriction**: UBC's own classification, and where each model sends what it is given."*

  Under **S2 (iii)**, the beat becomes *"Week 1 — the first check"* (`class="snag"` changes to a plain beat, and Week 2's heading
  changes to *"the first refusal"*):

  > *"They mark the data as high risk, correctly: it is student work with names attached, which UBC's own standard rates High.
  > Manifest checks every AI model the app uses against that. Each is approved for it, because each either runs on UBC hardware or
  > goes to a provider that keeps nothing it is sent. Had the work been Very High Risk, such as health records, only the models on UBC
  > hardware would have been offered."*

  **Note for Rich, under S2 (i):** the story's app *"searches the course readings"*, which needs an embedding model, and none is
  approved for `high` under S2 (i). This is the same as the story under today's `confidential`; it is not new.

- **`manifest-stories.html:298-303`** (Story 06: *"Only UBC-hosted models are used"*). **Unchanged.** It is a choice that story's
  privacy assessment makes for a public, unauthenticated app, not the platform's rule.

- **`manifest-schematic.html:1073`:** *"and never for a confidential app's own AI"* becomes *"and never for the own AI of an app
  holding UBC's most sensitive, Very High Risk, data"*.
  - l.1074-1075 (*"by default it may help build such an app … and an administrator can confine building to UBC's hardware too"*) is
    unchanged under S10 (a). Under S10 (b) it becomes *"and the agent that builds such an app is confined to UBC's hardware too"*.
  - l.1078 (*"the most sensitive data never leaves UBC's own hardware"*) stays true.

- **Checked and unchanged** (they concern personal information generally, not the levels): `manifest-schematic.html:419, 482, 880,
  1097`; `manifest-decisions.html:96-97, 131, 147`; `manifest-stories.html:70, 175, 362, 369`.

#### What the plan will then build

This is a starting list for the plan-writer, not the plan. `src/` means `packages/control-plane/src/`; `FE` means
`~/Developer/manifest-app`.

1. **The levels, with the aliases kept IN the rank table:** `src/spec/schema.ts:8-16`.
   - `LEVELS = ['low','medium','high','very-high']`.
   - The aliases map `public→low`, `internal→medium`, `confidential→very-high`.
   - `CLASSIFICATION_RANK` holds **all seven**: `low: 0, medium: 1, high: 2, 'very-high': 3, public: 0, internal: 1,
     confidential: 3`. So any read the plan misses still ranks an alias at its level, as defence in depth (the review's I6).
   - The trap is a partial edit that appends `high: 2, 'very-high': 3` and leaves `confidential: 2`, which reads `confidential` as
     `high` and widens it to OpenAI. A test asserts `RANK[alias] === RANK[ALIASES[alias]]` for each alias.
   - `canonicalLevel(value)` uses `Object.hasOwn`, never `in` (which finds `toString`; `catalogue.ts:99-106` warns). It is used for
     output and for equality.
   - `:259-264`: the enum accepts all seven names, transforms to the canonical name, and defaults to `medium`. Its `.describe()`
     cites U1 and the aliases; this is public text, held by `docs.test.ts`.
2. **Every read of a stored level:**
   - `src/ai/models.ts:57-60` (`asClassification`), `:83`, `:101-105`, `:132`;
   - `src/ai/catalogue.ts:104-110`;
   - `src/spec/diff.ts:183, 227, 250` (equality by `canonicalLevel`, or a rename from `internal` to `medium` re-escalates);
   - `:553-556` (the sentence, in U1 names);
   - `src/spec/resolve.ts:129` (freeze the canonical name);
   - `src/releases/release.ts:1097-1103`;
   - `src/spec/policy.ts:163, 207, 211-215` (E14);
   - `src/ai/intake.ts:62-70`;
   - **S6's reads:** `src/api/representations/releases.ts:138` and `src/api/routes/project-reads.ts:749` (`getSpec`).
3. **The literal and condition sites:**
   - `src/ai/models.ts:37`: the builder exception becomes *rank(floor) > rank(the capable model's level) && builder === 'capable'*
     (S4).
   - **`src/api/routes/releases.ts:1249-1257`**: S9's condition. Its message at `:1257` and its description at `:1208` change too.
   - `src/launch/assessment.ts`:
     - `:93-94`: `capitalised` gives "Very-high"; write "Very high".
     - `:97`: on-premise is `very-high`.
     - `:198-199`: a `high` model's sentence names zero retention.
     - `:207, 267, 360, 381, 390`.
   - `src/ai/gateway-models.ts:134-135`: the unpriced pin applies to `very-high`, aliases included.
   - `src/config.ts:47, 56`: `@(public|internal|confidential)` accepts all seven names.
   - `src/ai/models.ts:48`: `DEFAULT_CLASSIFICATION = 'medium'`.
4. **The capable model's level (S3):**
   - `src/ai/capable.ts:40` (`CAPABLE_CLASSIFICATION = 'internal'`) becomes `MANIFEST_CAPABLE_MODEL_CLASSIFICATION` in `config.ts`,
     default `medium`, accepting all seven names. With no cap, per S3 (b) recommended.
   - Its registration passes it (`capable.ts:119`), and `capableFloor` uses it (`:165-169`).
   - `.env.example` gains its commented line.
5. **Registration, the review's I1 and I7:**
   - `src/ai/registration.ts:237` compares `canonicalLevel` on both sides, so an alias row is never re-created for its name.
   - **`refuseKeeping` (`registration.ts:207-215`) never keeps an owned deployment whose level ranks above `r.classification`.** It
     removes it, as it removes an unpriced one, and the refusal says so.
   - `:60-63`: the comment on `unpriced` says `very-high`.
   - **Negative control:** lower a gateway model `@high` to `@medium` while its re-registration is refused as unpriced (LiteLLM
     restarted offline, `registration.ts:91-93`). A `high` app must then be refused it with `SPEC_MODEL_CLASSIFICATION_TOO_LOW`, and
     a `high` project's session narrowed. Restore `refuseKeeping`'s old filter and the test goes red.
6. **S11 (a):** a boot sweep after the catalogue, beside `narrowSessionsHoldingMore` (`index.ts:503-530`). Each serving instance's
   app key loses every model now ranked below its frozen level, through LiteLLM's key update. A key left with none is revoked, never
   set to `models: []` (`ai/keys.ts:137-141`). Each change is an event and an operator line.
7. **The catalogue:** under S2 (i), `infra/litellm/config.yaml` is unchanged. Under (iii), `:29, 63, 83` become `high`. Either way
   `:45, 73` stay `confidential`, the alias, which exercises the alias path in every demo.
8. **Words:**
   - `src/ai/sessions.ts:439, 653`;
   - `src/observability/event-schemas.ts:853, 868`;
   - `src/api/error-codes.ts:753`, the `INCIDENT_LOG_CONFIDENTIAL` summary (the code keeps its name);
   - `src/api/representations/incidents.ts:30` and `agents.ts:105`;
   - `src/releases/summary.ts:87`;
   - `src/config.ts:404-410, 590`;
   - the examples in `src/api/routes/releases.ts:273-429, 490-569`, `project-reads.ts:717` and `launch-examples.ts:388-401, 470`;
   - `packages/console/src/screens/approvals.tsx:222`.
   - Comments: `src/ai/models.ts:10-25, 114`; `src/ai/gateway-models.ts:24-25, 36, 81`; `src/observability/output.ts:11`;
     `src/index.ts:569`; `src/api/spec-validation.ts:167`.
9. **The authorization contract and tests:**
   - `src/api/authz-contract.ts:121, 288, 2247, 2577`: the confidential-Incidents row gains a `high` sibling (S9) and an alias
     sibling;
   - `src/api/testing.ts:313`: a hand-written union.
10. **Contract 1.6.0 → 1.7.0** (`packages/contract/package.json:3`, `openapi.json:5`, `:1788`):
    - the `ManifestYaml` enum (`openapi.json:18610-18619`) holds seven values with default `medium`;
    - the `INCIDENT_LOG_CONFIDENTIAL` texts (`:886, 11150, 17447, 21807`);
    - `contract:generate` and `docs:write`, which regenerate `docs/api/reference/manifest-yaml.md:43`;
    - hand-written: `docs/api/agents.md:21, 23, 28, 127` and `docs/api/frontend.md:34, 37, 96`.
11. **Mock**, in the same commit as the contract (contract and mock are typecheck-clean as a unit): `packages/mock/src/fixtures.ts:
    856-903, 1314, 1400` and `server.ts:98-102, 456-463`.
12. **Blueprint:**
    - `starters/proof-app/manifest.yaml:55-64` becomes `medium` (it stores no identifier), with its comment;
    - `README.md:62`;
    - `agents/AGENTS.md:208-211`: declare `data.classification` every time, from U1's table; any personal information means `high`.
13. **An FE-n ask to the front-end's live session at the contract commit:**
    - `packages/server/src/agents/lead.ts:42, 54, 125, 243-245` (`very-high` means on premises only; declare a level always);
    - `packages/server/src/build/round.ts:590-591, 666, 705-709, 1471, 1602`;
    - `packages/server/src/api/progress.ts:181, 289-291`;
    - `packages/server/src/api/round-state.ts:27`;
    - `packages/server/src/platform/instances.ts:40-48, 108-112` (S9 (b) widens when its `403` arrives);
    - `packages/web/src/words.ts:396-453`;
    - `packages/web/src/screens/building/needs.tsx:185`.
14. **Rich's `.env`:**
    - `MANIFEST_CAPABLE_MODEL_CLASSIFICATION=high` (`gpt-6-luna` through the gateway, ZDR per Rich);
    - `MANIFEST_GATEWAY_MODELS` keeps `ubc-qwen-27b=…@confidential` (the alias, which is right: UBC hardware, no gateway fallback
      seen);
    - an OpenAI gateway model added later takes `@high`; Bedrock's `llama3` takes `@high` once the gateway prices it (his call,
      unverified); `qwen3.6-35b-a3b` takes `@high` at most, because of its fallback to `gpt-6-luna`.
15. **Negative controls, each seen red,** besides item 5's:
    - **the aliases never widen (I6):**
      - an app declaring `confidential` is refused a `high` entry, at validation and at the deploy of an old frozen release;
      - an entry at `internal` does not satisfy a `high` app;
      - an entry at `confidential` does satisfy a `very-high` app;
      - an old frozen `confidential` release still floors `very-high` (remove the alias from `asClassification`, and the floor
        drops);
    - **S9:** with a `high` project and the capable model at `high`, its staging tail is `403 INCIDENT_LOG_CONFIDENTIAL` to a token
      and `200` to a session. Revert the condition to `=== 'confidential'`, and it goes red;
    - a rename from `internal` to `medium` is not sensitive;
    - a `very-high` app is refused a `high` model;
    - a `high` app is refused a `medium` entry;
    - **S11 (a):** lower a model while an app holding it serves; its key loses it, and a key left with none is revoked, not
      `models: []`.
16. **Documents:**
    - ORIENTATION §8's open bullet (`:1999-2006`) becomes *may U1 High reach a provider with zero data retention, and is Rich's
      reported determination on the record*;
    - `docs/external-track.md` item 11 is updated;
    - a new external-track item: U1 §3.2.4, under which Manifest is likely a Very High Risk Electronic Service needing a Security
      Threat Risk Assessment and a Shared Responsibility Model (§4.2.3). The track stays deferred;
    - **the gateway plan's *What this plan does not build*** gains the `high` half of its gateway-fallback limit (Decision 7 covers
      `confidential` only). That is the coordinator's edit, not this action's.

*Read but not verified:*
- whether a `config.yaml` `model_info` change takes effect on a LiteLLM restart without touching its database (this matters only
  under S2 (iii));
- that LiteLLM's key update accepts a narrowed `models` list on an app key, as `narrowAgentKey` does for agent keys (S11 (a)).

---

#### Revised to the review

The review is `u1-spec-action-review.md`, 2026-10-03: approve with fixes.

| Finding | Where it landed |
|---|---|
| **C1**: *"its provider"* let any gateway model be `high`; no fallback clause for `high` | S1's rule, and E3's first paragraph: *everything that may answer it, the vendor behind any gateway and every model a gateway may fall back to*. Used in E5, E7, E8 and E13 alike. 22:08's `qwen3.6-35b-a3b` → `gpt-6-luna` fallback is the worked case (S1, item 14). The gateway plan's limit is item 16. |
| **I1**: `refuseKeeping` keeps the old, higher level | E3's second paragraph (*"A lowered level takes effect, or the entry is withdrawn"*); item 5 (`registration.ts:207-215`, `:237`) with its negative control; running app keys surfaced as **S11**, item 6. |
| **I2**: tokens and `high` Incident tails | **S9**, recommended (b); E6's tail sentences, with (a)'s words and its token-holder assumption stated; item 3; item 15's control. |
| **I3**: "Very high risk forces on prem models only" against Spec action 10 | **S10**, both of Rich's sentences quoted exactly, recommended (a) with its reason; (b)'s words in E6 and the shared pages. |
| **I4**: E3 said `high` while S3 defaulted to `medium`; the cap was unsurfaced | E3's line now reads *"(a platform setting, §26 — medium unless set)"*; E4 no longer caps; S3 (b) surfaces the cap, recommended no cap; item 4. |
| **I5**: S2 went beyond 21:48; *"may route off-prem"* is a label | S2 restated: (i), only Rich's models, recommended, with what `default-chat` is on a laptop and at UBC; (iii) offered with its cost; E3's comments; S7 and S8 made to follow S2. |
| **I6**: a four-key rank table fails open | Item 1: all seven names in the rank table, the partial-edit trap, a test of the invariant, `Object.hasOwn`; item 15's alias controls. |
| **I7**: "no migration" was inaccurate | *What changes on disk, exactly*, under *Why*; item 5's `:237`; item 7. |
| **I8**: S5 misstated the cost of `high` | S5's alternatives: intake pauses under S2 (i), undeclared `default-chat` apps stop validating, and launched apps re-escalate. |
| **I9**: a third withdrawal trigger; *"on-premise only"* contradicted itself | E6: *"a project's level, the capable model's level or this setting"*; *"Set to D17 alone (its value is `on-premise`…)"*. |
| **Minor 1**: E8 overclaimed, misattributed, and is a table cell | E8 and `decisions.html:137`: *"never reaches a model off UBC's own hardware"*; *"on a UBC determination Rich reported … not yet on the record"*; one line. |
| **Minor 2**: E2's derivation and the steward | E2 derives from U1 §2.1.3 and names FIPPA's business-contact exclusion; *"Manifest asks the app's owner to declare"*, leaving who the steward is to UBC. |
| **Minor 3**: E13 omitted on-premise | E13 uses S1's two-part rule. |
| **Minor 4**: values change; a third site; `getSpec` | S6 names it a behaviour change and `openapi.json:20679`; item 2 adds `representations/releases.ts:138` and `project-reads.ts:749`. |
| **Minor 5**: unnamed sites | Items 2, 3, 5, 8, 9, 10, 11 and 13 add every site listed, including the front-end's four missing ones; error codes is `:753`, not `:749`. |
| **Minor 6**: cold-reader problems | E3's note moved out of the quote; E6 quoted whole; E10's bold kept; E14's real placeholders; l.387 and l.392; l.546 with its reason; E11's step-up. |
| **Minor 7**: Story 04's orphaned "second refusal" and its classes | Under S2 (i), the refusal, heading and classes stay. Under (iii), the class and Week 2 changes are given. |
| **Minor 8**: when to apply | The header: only after the gateway plan's acceptance. |
