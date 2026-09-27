# Manifest — design handover

> **This file is GENERATED and self-contained.** It exists so a design agent with no access
> to the Manifest repository has everything it needs in one place. **Do not edit it** —
> edit its sources and regenerate with `node scripts/design-handover.mjs`.
>
> | | |
> |---|---|
> | Generated | 2026-09-27, from commit `7dd8a0d` |
> | Sources | `docs/superpowers/plans/2026-09-19-interface-design-brief.md`, `packages/contract/openapi.json` (v1.3.0), `packages/mock/src/fixtures.ts` |
> | Contents | the design brief (part 1), the API surface (2), every object shape (3), every refusal code (4), every event type (5), and realistic fixture data (6) |
>
> **Part 1 is the brief and is the part to read first.** Parts 2–6 are reference: skim them,
> then come back when you need a specific shape or a real value.
>
> **Part 1 is dated; Parts 2–6 are not.** The brief was written against an earlier contract, and
> where its prose states a count — operations, schemas, refusal codes, event types — **the
> numbers generated below are the current ones**: 54 operations, 78 schemas.

---

# Part 1 — The design brief

# Interface design brief — the two surfaces people actually use

*Written 2026-09-19 for a design agent with no prior context. Everything here is read from the
spec or the code at `8d90e15`, not imagined. **Two surfaces are described and they are different
products**; §12 says whether to give them to one agent or two. Read §11 before deciding anything
visual — it names a constraint that may decide your whole direction.*

> **ONE THING TO KNOW UP FRONT.** Rich decided on 2026-09-19 that **both** surfaces get real
> design effort. The spec used to say the admin console is *"rudimentary and deliberately
> so… not a product surface"* (§26, *Scope*). **§13's spec action changed that one paragraph —
> approved by Rich and applied 2026-09-27.** Nothing else in the spec contradicts this brief, and
> §22's reference console is deliberately unaffected — see §2.

---

## 1. What Manifest is, in the terms a designer needs

A faculty member at UBC describes an application in plain language, an AI agent builds it, and
Manifest deploys it — authenticated with UBC's CWL single sign-on, running on UBC infrastructure —
**without the faculty member ever seeing a container or a YAML file.**

That last clause is a hard constraint, not an aspiration. It is **C3** in the spec, and it is the
single most important rule in this document:

> **A faculty member must never be shown infrastructure.** No containers, no YAML, no exit codes,
> no digests where a word would do, no "deployment failed: 1". §14 puts it as a requirement on
> every event the platform emits: *"Your app couldn't start — it's asking for a database it hasn't
> declared", not `exit code 1`.*

An operator, by contrast, needs exactly that detail exposed. **This is why these are two products
and not one with a role switch.**

---

## 2. Three surfaces exist. You are designing two of them.

| | What it is | Your job? |
|---|---|---|
| **`packages/console`** — the reference console | Already built and working. §22's *"executable proof that the public API is complete and sufficient"*. Deliberately **plain**: no design system, no branding, system fonts. It exists so that a missing API endpoint becomes a build failure | **No.** Leave it alone. It is a test instrument, not a product |
| **The faculty product** | The real experience. §22: *"The real experience is the separate front-end project's job."* It will live at `app.manifest.internal` | **Yes — §4** |
| **The admin console** | §26. An operations tool for the team running the platform. Its primary screen is a queue | **Yes — §5** |

**Use the reference console as a functional reference and never as a visual one.** It shows you
what the API can do and what the journey feels like in sequence. Every choice it makes about
appearance is explicitly disclaimed by the spec.

---

## 3. The two people

**The faculty member.** A teaching or research academic. Not a developer. They have an idea for a
course tool — a rubric helper, a lab booking page, a reading-response collector. They are
time-poor, they are doing this around teaching, and **they will meet this platform perhaps six
times a year.** They will not learn a mental model. Every screen must re-explain itself.

They also carry a real anxiety the design must address: this thing is going to be used by their
students, and if it breaks in week eight during an assessment, that is their problem in front of
200 people.

**The platform administrator.** A member of the team running Manifest. Technical. Uses it daily or
weekly. Their job is mostly **unblocking other people** — and the platform is deliberately built
so that a specific, enumerable set of actions requires their judgement. §26 puts the consequence
plainly: *"the number of people waiting on an administrator is the platform's central operational
metric rather than an afterthought."*

---

## 4. Surface one — the faculty product

### 4.1 The journey, which is the spine

§22 defines it, and it has been driven end to end by a real person in a browser:

1. **Sign in** with CWL
2. **Create a project** — a name, a blueprint, a starter, and *who it is for*
3. **Watch it provision** — repository created, `manifest.yaml` validated
4. **Build it** — build logs stream live, line by line
5. **Deploy to staging** — instance states arrive live
6. **Open the running app**, sign in to it with CWL, use it
7. **Request production** — and see what a first launch still needs, with reasons
8. **Manage it** — members, delegated tokens for an agent, the queue of questions an agent asked

**Steps 3, 4 and 5 are live.** Events arrive on a WebSocket with no reload. A build's log lines
appear as they are written. An instance moves `provisioning → starting → healthy` in front of you.
**This is the most emotionally important part of the product** — it is the moment an idea becomes a
real thing at a real address — and it is also where the interface is most likely to feel broken if
it is designed as a page that refreshes.

### 4.2 The objects, and every state they can be in

Read from the published contract; these are the real enums.

| Object | States |
|---|---|
| **Build** | `pending` · `running` · `succeeded` · `failed` |
| **Instance** (a running copy of an app) | `pending` · `building` · `provisioning` · `starting` · `healthy` · `failed` · `hibernated` · `waking` · `destroying` · `gone` |
| **Pending action** (a question an agent asked) | `pending` · `confirmed` · `rejected` · `expired` |
| **Launch readiness item** | `met` · `unmet` · `not_built` |

**Three environments exist for every project from the moment it is created** — `sandbox`,
`staging`, `production` — each with its own permanent address.

**A hard-won detail worth designing for:** *what is serving* and *what the last attempt did* are
two different facts. A failed deploy is a real state, and while it fails **the previous version
keeps serving**. An interface that shows one number will be wrong half the time. This was found
the expensive way.

### 4.3 The launch checklist — the most distinctive screen in the product

Going to production for the first time is **a checklist, not a button**. Seven possible items,
each with a state, a plain-English reason, an owner, and — for things not built yet — the honest
admission that Manifest cannot do it yet:

`domain` · `iam-registration` · `privacy-assessment` · `rehearsal` · `scans` · `admin-approval` ·
`load-rehearsal`

**Two of these have multi-week lead times** — registration with UBC's identity team, and a Privacy
Impact Assessment. The spec is emphatic about the design consequence:

> *Manifest surfaces them the moment a project is created — not at the point the owner asks to go
> live. **A faculty member should never discover the existence of a PIA on the day they wanted to
> launch.***

So this is not only a screen you reach at the end. **Its state has to be visible from the
beginning**, and that is a real design problem: how do you show someone, in week one, that
something they do not yet care about will block them in week twelve — without making week one feel
like bureaucracy?

### 4.4 Things that are slow, and need honest waiting

A build takes minutes. A deploy takes up to ninety seconds. An IAM registration takes **weeks**. A
PIA takes **weeks**. These are not spinners. The interface needs a vocabulary for *"this is
progressing and you may leave"*, distinct from *"this is waiting on a person"*, distinct from
*"this is stuck and you should act"*.

### 4.5 Moments that need particular care

- **A delegated token's secret is shown exactly once**, and is unrecoverable after. It is the
  credential a faculty member gives to an AI agent.
- **Privileged actions require re-authentication** — signing in again, in the moment, even though
  you are already signed in. Four actions need it: approving a release, reading a secret, changing
  a quota, changing who is on a project.
- **Four things an agent may never do on its own.** When an agent asks, it is refused and **a
  question appears for a human** — who confirms or rejects it *in their own words*, and the
  rejection reaches the agent verbatim. This loop is real and clicked. It is unusual and it needs
  explaining on screen, not in documentation.
- **Destructive and irreversible things**: revoking a token an agent is using, removing a
  collaborator, and — after a production launch — the fact that **the project's name can never
  change**, because it has been registered externally.

---

## 5. Surface two — the admin console

### 5.1 The primary screen is the queue, not the fleet

This is §26's central claim and it should drive the whole design. Every queue item is derived from
something that already exists:

| Waiting on | Decided by |
|---|---|
| A release awaiting approval | admin |
| An agent's request needing confirmation | the person who minted the token |
| An IAM registration to submit or amend | admin, then UBC IAM |
| A privacy assessment to review | owner, then the Privacy Office |
| A verified domain awaiting attach | admin |
| An audience upgrade request | admin |
| A launch item needing an override | admin, recorded as an override |

**Each item shows: what is being asked, by whom, what changes if it is granted, the diff where
there is one, and how long it has waited.** And the headline number is not the queue's length:

> *"The console's headline health number is **the age of the oldest item**, because a queue that is
> merely long is working and a queue that is stale is not."*

That sentence is a design instruction. Build the screen around it.

### 5.2 The other screens

- **Fleet** — every app: owner and department, environments and state, current release, audience
  tier, domains, last deploy, open incidents, AI spend this month.
- **People** — every user, role, projects owned or collaborated on, last seen, outstanding tokens.
- **Spend** — AI spend by project **and by end user**. It answers *"which of 300 students spent the
  budget"*.
- **Health and risk** — open incidents; certificates expiring within 90 days; policies the
  infrastructure reports it cannot enforce; failed security scans; apps on a superseded blueprint.
- **Audit** — an append-only log, filterable by actor, project and action.

### 5.3 One rule with a visible consequence

**An administrator acting on someone else's project must give a reason**, and that reason is
stored in the audit log *and shown to the project owner in their event stream*. So an admin action
is not a quiet operation — the design should make it feel observed, because it is.

---

## 6. The language rules, which both surfaces share

**Every error the platform returns carries three things**: a stable machine `code`, a `message`
for a person, and a `hint` saying what to do about it. There are **68 codes**. The contract says of
the message: *"For a person. Never parse it; switch on `code`."*

Two error responses carry extra structure worth designing for specifically:

- A refused production deploy carries **the whole launch checklist** in the error — so the refusal
  and the checklist screen are the same information and should look like it.
- A refused agent action carries **the pending question** — so the agent's client, and the
  human's queue, are looking at one object.

**There are 21 event types**, and every event carries a faculty-legible sentence alongside its
machine detail. Use the sentence. It was written for this. *(Counted three ways on 2026-09-19 —
the source array, the published contract's 21 `anyOf` members, and its distinct type literals. An
earlier plan says 22; it is wrong and has been corrected.)*

---

## 7. What is real, and what you would be inventing

**Real, published, and drivable today:** 34 API operations, 52 schemas, the whole delivery journey
in §4.1. A contract at version 1.0.0.

**Not built, and you should know before you design it:** the API can *deploy* an app but cannot
*create* one. There is no way to write code or change `manifest.yaml` through it — **zero `PATCH`
or `PUT` operations in the entire API**, and no repository reference anywhere. So *"describe your
app and an AI builds it"* — the actual promise in §1 — **has no API behind it yet**.

This is an opportunity as much as a caveat. A design exploration of the authoring experience is a
genuinely useful input to the decisions that brief has left open
([`2026-09-19-authoring-api-brief.md`](./2026-09-19-authoring-api-brief.md)). **Label speculative
work as speculative**, keep it separate from the delivery journey, and say what API it would need.

---

## 8. How to run the real thing, with no platform

**`manifest-mock` serves all 34 operations from fixtures, with a scripted WebSocket** — real build
log lines arriving one at a time, real instance-state transitions — in a single `node:http`
process. No Docker, no database, no control plane. The RUNBOOK section is *Running
`manifest-mock`*.

**Design against it.** A front end was driven through the whole journey against it in a browser
with nothing else running. This is the difference between designing from a screenshot and
designing from the thing.

Its honest limits are documented in the RUNBOOK's *What it does NOT prove* list — read it. One
known gap: of three refusal codes for the project-name check, the fixtures carry one.

---

## 9. Accessibility is a legal requirement, not a nicety

UBC is a public body in British Columbia. §15 records an **automated WCAG accessibility gate
before public launch** as *a legal requirement for UBC*. Design to it from the start; retrofitting
contrast, focus order and form labelling into a finished visual system is the expensive path.

---

## 10. What you are NOT deciding

- **Information architecture of the API.** Resources, names and shapes are published and versioned
  at 1.0.0. If a screen needs something the API lacks, **that is a finding worth reporting** — it
  is exactly what this platform's reference console exists to surface — but do not assume it.
- **Whether a rule exists.** The privileged-four rule, the launch checklist, the one-time secret,
  the re-authentication — these are settled security decisions. Design how they are *experienced*,
  not whether they apply.
- **The reference console's appearance** (§2).

---

## 11. The constraint that may decide your visual direction

**UBC has a mandated Common Look and Feel, and this project has already vendored it.**
`infra/idp/modules/ubc-clf-7/` holds CLF **7.0.5** — six asset files fetched from `cdn.ubc.ca`,
with their checksums and licences recorded — and the practice sign-in page already wears it, so
that people can see what a real CWL sign-in will look like before approvals exist.

A faculty-facing UBC service will very likely have to wear it too. **Establish early whether CLF is
mandatory for these two surfaces**, because the answer is the difference between designing a visual
system and applying one. The admin console, being internal, may have more freedom than the faculty
product.

---

## 12. One agent or two?

**Recommended: two efforts, sequenced, with one shared vocabulary.**

They differ on every axis a designer cares about — different users, opposite relationships to
infrastructure (§1's C3 hides it; §5 exposes it), different frequency of use, different phases of
delivery. One agent holding both will tend to average them, and the average is wrong for both.

**But the vocabulary must be shared**: state names, refusal language, how an event reads as a
sentence, how waiting is expressed. **Do the faculty surface first and derive the vocabulary
there**, because §14's *faculty-legible* bar is the harder one; the operations tool then inherits
it rather than inventing a second dialect.

---

## 13. Spec action — ✅ APPROVED BY RICH AND APPLIED 2026-09-27

**Applied in this wording**, drafted by the admin console's design session from the intent below
(this section had stated the intent and no replacement text):

> *"An operations tool for the team running the platform: a queue, tables, filters, and the
> actions the API exposes, on the same public API as every other client (D31). It is designed with
> the same care as the faculty product and shares its vocabulary — the same states, and the same
> way of naming who a wait belongs to — while showing its reader exactly the infrastructure detail
> C3 keeps from a faculty member. It does **not** inherit `console/`'s deliberately plain quality
> bar: that bar is what keeps the reference console a reliable proof that the API is complete
> (§22), and it stays there."*

`manifest-schematic.html` §10 restated the old sentence (*"deliberately plain: tables, filters, and
a queue"*) and moved with it; the other three shared pages do not describe the console's quality.

**One paragraph.** §26's *Scope* read, until then:

> *"Rudimentary and deliberately so: tables, filters, a queue, and the actions the API already
> exposes. It is an operations tool for the team running the platform, not a product surface, and
> it inherits `console/`'s quality bar (§22) for the same reason."*

Rich decided on 2026-09-19 that the admin console gets real design effort, which that sentence
forbids. The proposed change keeps everything true about its *purpose* — an operations tool, on
the same public API, built around the queue — and removes only the claim that it inherits the
reference console's deliberately-plain quality bar.

**§22 is deliberately NOT changed.** The reference console stays plain: it is the proof that the
API is complete, and the moment it becomes a product surface it stops being a reliable instrument.
**§26's D31 framing, its queue table and its non-repudiation rule are unchanged too.**

Rich approved it on 2026-09-27 (*"Apply the spec action"*); ORIENTATION §8 records it under
*Decided*.


---

# Part 2 — The API surface

**54 operations** at version **1.3.0**, by verb: 34 GET, 16 POST, 3 DELETE, 1 PUT.

**Only one of them edits a stored thing in place** — `PUT /v1/environments/{environmentId}/secrets/{name}` (`setAppSecret`). A project's name, its audience and a quota are still not editable, which
is a real constraint on what an "edit settings" screen could do today. The brief's §7 was
written when there were none.

| Area | Method | Path | Operation | What it does |
|---|---|---|---|---|
| administration | GET | `/v1/fleet` | `listFleet` | Every app on the platform |
| blueprints | GET | `/v1/blueprints` | `listBlueprints` | The blueprint catalogue |
| blueprints | GET | `/v1/blueprints/{blueprintRef}` | `getBlueprint` | A blueprint |
| blueprints | GET | `/v1/blueprints/{blueprintRef}/knowledge-pack` | `getKnowledgePack` | A blueprint’s knowledge pack |
| delivery | GET | `/v1/builds/{buildId}` | `getBuild` | A build |
| delivery | GET | `/v1/builds/{buildId}/logs` | `getBuildLog` | A build’s log |
| delivery | POST | `/v1/environments/{environmentId}/deploy` | `deploy` | Deploy a release to an environment |
| delivery | GET | `/v1/environments/{environmentId}/incidents` | `listIncidents` | An environment’s incidents |
| delivery | GET | `/v1/projects/{projectId}/builds` | `listBuilds` | A project’s builds |
| delivery | POST | `/v1/projects/{projectId}/builds` | `startBuild` | Build the project |
| delivery | GET | `/v1/projects/{projectId}/releases` | `listReleases` | A project’s releases |
| delivery | POST | `/v1/projects/{projectId}/releases` | `createRelease` | Release a build |
| delivery | GET | `/v1/releases/{releaseId}` | `getRelease` | A release |
| delivery | GET | `/v1/releases/{releaseId}/approval` | `getApproval` | The latest decision about a release |
| delivery | POST | `/v1/releases/{releaseId}/approval-preview` | `createApprovalPreview` | Take the preview an administrator reads before deciding |
| delivery | GET | `/v1/releases/{releaseId}/approval-previews/{previewId}` | `getApprovalPreview` | Re-read a stored preview |
| delivery | POST | `/v1/releases/{releaseId}/approve` | `approveRelease` | Approve a release for production |
| delivery | POST | `/v1/releases/{releaseId}/reject` | `rejectRelease` | Decline to approve a release for production |
| docs | GET | `/v1/docs` | `listDocs` | The API’s documentation |
| docs | GET | `/v1/docs/{slug}` | `getDoc` | A page of the documentation |
| docs | GET | `/v1/openapi.json` | `getOpenApiDocument` | This OpenAPI document |
| events | GET | `/v1/projects/{projectId}/events` | `streamProjectEvents` | The project’s event stream (WebSocket) |
| identity | GET | `/v1/me` | `getMe` | The signed-in person |
| launch | GET | `/v1/projects/{projectId}/launch-readiness` | `getLaunchReadiness` | What a production release still needs |
| launch | GET | `/v1/projects/{projectId}/launch-records` | `getLaunchRecords` | The IAM registration and the privacy assessment, as recorded |
| launch | POST | `/v1/projects/{projectId}/launch-records/iam-registration` | `recordIamRegistration` | Record what UBC IAM registered |
| launch | POST | `/v1/projects/{projectId}/launch-records/privacy-assessment` | `recordPrivacyAssessment` | Record what the Privacy Office said |
| launch | POST | `/v1/projects/{projectId}/rehearsal` | `runRehearsal` | Run the pre-production rehearsal |
| pending-actions | GET | `/v1/pending-actions/{pendingActionId}` | `getPendingAction` | One pending action |
| pending-actions | POST | `/v1/pending-actions/{pendingActionId}/confirm` | `confirmPendingAction` | Confirm a pending action |
| pending-actions | POST | `/v1/pending-actions/{pendingActionId}/reject` | `rejectPendingAction` | Reject a pending action |
| pending-actions | GET | `/v1/projects/{projectId}/pending-actions` | `listPendingActions` | The questions agents are waiting on |
| projects | GET | `/v1/environments/{environmentId}` | `getEnvironment` | An environment, and what it serves |
| projects | GET | `/v1/projects` | `listProjects` | The projects I am a member of |
| projects | POST | `/v1/projects` | `createProject` | Create a project |
| projects | GET | `/v1/projects/{projectId}` | `getProject` | A project |
| projects | GET | `/v1/projects/{projectId}/environments` | `listEnvironments` | A project’s environments |
| projects | GET | `/v1/projects/{projectId}/members` | `listMembers` | Who is a member of a project |
| projects | POST | `/v1/projects/{projectId}/members` | `addMember` | Add or change a member |
| projects | DELETE | `/v1/projects/{projectId}/members/{userId}` | `removeMember` | Remove a member |
| projects | GET | `/v1/projects/{projectId}/spec` | `getSpec` | The project’s newest valid manifest |
| projects | POST | `/v1/projects/{projectId}/spec` | `validateSpec` | Validate manifest.yaml at a commit |
| projects | GET | `/v1/slugs/{slug}` | `checkSlug` | Would this project name work? |
| secrets | GET | `/v1/environments/{environmentId}/secrets` | `listAppSecrets` | The app’s secrets in an environment — names only |
| secrets | DELETE | `/v1/environments/{environmentId}/secrets/{name}` | `clearAppSecret` | Clear the value of one of the app’s secrets |
| secrets | PUT | `/v1/environments/{environmentId}/secrets/{name}` | `setAppSecret` | Set the value of one of the app’s secrets |
| source | GET | `/v1/projects/{projectId}/commits` | `listCommits` | The history of the project’s repository |
| source | POST | `/v1/projects/{projectId}/commits` | `createCommit` | Commit changes to main |
| source | GET | `/v1/projects/{projectId}/commits/{commitSha}` | `getCommit` | One commit, and what it changed |
| source | GET | `/v1/projects/{projectId}/file` | `getFile` | Read one text file of the project’s repository |
| source | GET | `/v1/projects/{projectId}/tree` | `getTree` | List the files of the project’s repository |
| tokens | GET | `/v1/projects/{projectId}/tokens` | `listTokens` | A project’s delegated tokens |
| tokens | POST | `/v1/projects/{projectId}/tokens` | `mintToken` | Mint a delegated token |
| tokens | DELETE | `/v1/tokens/{tokenId}` | `revokeToken` | Revoke a delegated token |

---

# Part 3 — Every object shape

**78 schemas.** These are the real published shapes: what a screen
can show is bounded by what is here.

#### `AddMemberRequest`

Who to add, and as what. Adding someone who is already a member changes their role.

| Field | Type | Required | Notes |
|---|---|---|---|
| `puid` | string | yes | The person’s ubcEduCwlPuid. They must have signed in once. |
| `role` | `owner` · `collaborator` | yes | The role to grant: `owner` or `collaborator`. |

#### `AppSecretList`

An environment’s app secrets, by name: which are declared and which are set.

| Field | Type | Required | Notes |
|---|---|---|---|
| `environmentId` | string (uuid) | yes | The environment. |
| `environmentKind` | `sandbox` · `staging` · `production` | yes | Which of the three it is. Production’s values are set only by a person who has stepped up. |
| `secrets` | [AppSecretStatus][] | yes | Every name declared or set, sorted. A declared name with `set: false` stops the next deploy of this environment (`RELEASE_SECRET_NOT_SET`). |

#### `AppSecretStatus`

One secret’s name in one environment, and whether it has a value — never the value.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | The variable’s name, as manifest.yaml’s `env` declares it: an upper-case letter, then upper-case letters, digits and underscores, at most 128 characters. |
| `declared` | boolean | yes | Whether the environment’s newest valid manifest.yaml declares this name with `secret: true`. Only a declared name reaches the app. |
| `set` | boolean | yes | Whether a value is stored. The value itself is never answered by any operation. |
| `updatedAt` | string (date-time) | null | yes | When the value last changed, or was first set; null when none is. |

#### `Approval`

One decision about one release, kept for ever (§13).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The decision. |
| `releaseId` | string (uuid) | yes | The release decided on. |
| `projectId` | string (uuid) | yes | Its project. |
| `decision` | `approved` · `rejected` | yes | What the administrator decided; a rejection is final for this release. |
| `decidedBy` | string (uuid) | yes | Who decided. |
| `decidedByName` | string | yes | The display name of the person who decided — the owner meets a decision before anyone else, and a user id tells them nothing. |
| `decidedAt` | string (date-time) | yes | When. |
| `imageDigest` | string | yes | What this approval binds to (§13). |
| `reason` | string | null | yes | Required on a rejection: a refusal with no words is one nobody can act on (D23.7). |
| `diff` | [ApprovalDiff] | yes |  |
| `previewId` | string (uuid) | null | yes | The stored preview the administrator read, whose diff this record COPIES. Null only for a decision made before previews existed. |

#### `ApprovalDiff`

The exact diff shown at decision time (§13).

| Field | Type | Required | Notes |
|---|---|---|---|
| `imageDigest` | string | yes | The image this approval binds to — the same value as the approval’s. |
| `changes` | object[] | yes | Every change to manifest.yaml since the release it is compared with, in the file’s own vocabulary. |
| `services` | string[] | yes | `type@version`, sorted — what this release asks the platform to run. |
| `attributes` | string[] | yes | The CWL attributes this release requests, sorted (§7). |
| `resources` | object | yes | The production limits this release would run under. |
| `summary` | string | null | yes | The AI-written plain-English summary of what changed. **Null is a state, not an error**: an approval gate that fails closed on a language model being down is an outage, not a control. `summarySource` says why. |
| `summarySource` | `llm` · `unavailable` · `no-previous-release` · `no-changes` · `withheld` · `not-modelled` | yes | `llm`: the model wrote it. `unavailable`: it could not be produced, and the diff beside it is the control. `no-previous-release`: this is a first launch, so there is nothing to diff. `no-changes`: nothing in manifest.yaml changed, and the summary is the platform’s fixed sentence — no model wrote it. `withheld`: the model answered, and its answer broke the schema it was given or stated a decision, so it is not shown — `summaryWithheldBecause` names the rule, and the diff, the security notes and the reviewer’s verdict are the record. `not-modelled`: every change is one no model describes — a change to the CWL attributes, whose change line is the record — so no model was asked; this is by design, not an outage. |
| `summaryWithheldBecause` | string | null | yes | Which rule a `withheld` answer broke, in the platform’s words — never the model’s text, which could carry an app’s own words. Null for every other `summarySource`. |
| `summaryExposures` | object[] | null | yes | One sentence per change, in `changes`’ order, written by a language model: what that change could expose. **Never for a change to `auth.attributes`**: a model read those wrong — a removed attribute as one the app now receives, `sn` as a student number — so the change line alone is the record, and such a change has no entry here. The model is given the changes and the security notes only — never the verdict — and fills a schema with no place for one. The change lines are the record; these are the model’s reading of them, and a reading can get a fact wrong. Null unless `summarySource` is `llm`, and for a record made before it existed, whose `summary` is one string. |
| `baselineReleaseId` | string (uuid) | null | yes | The last approved release this one was compared with (§13 D9.2) — null for a first launch, and for a record made before subsequent releases were compared. |
| `sensitiveFields` | `services` · `auth.attributes` · `egress.allow` · `resources` · `data.classification` · `ai.models` · `blueprint`[] | yes | Which of §7’s sensitive fields changed since that release — what re-escalated it to an administrator. Empty for a first launch. |
| `security` | object[] | yes | What each changed field means for security and privacy, in the platform’s own words — present whether or not the model answered. |
| `coverage` | string | null | yes | D33’s coverage limit, stated in the record: an administrator sees a first launch and a re-escalation, never a self-serve release, and nothing reviews code. Null only for a record made before it was stated. |
| `review` | object | yes | The code reviewer’s verdict at decision time (D33, §15). `not_performed` until a reviewer is configured — an honest absence rather than a stub that purports to have reviewed. |

#### `ApprovalPreview`

§13’s exact diff, shown BEFORE the decision: approve and reject name it, the platform recomputes its facts and refuses if they moved (`APPROVAL_PREVIEW_STALE`), and the record copies its summary and verdict rather than asking the model again.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The preview — what `approveRelease` and `rejectRelease` name as `previewId`. |
| `releaseId` | string (uuid) | yes | The release it is of. |
| `projectId` | string (uuid) | yes | Its project. |
| `createdBy` | string (uuid) | yes | Who took it. |
| `createdByName` | string | yes | Who took it, by name. |
| `createdAt` | string (date-time) | yes | When it was taken. |
| `expiresAt` | string (date-time) | yes | Thirty minutes after it was taken. A decision naming it after this is refused `APPROVAL_PREVIEW_EXPIRED`; take a new one. |
| `imageDigest` | string | yes | The digest the preview was taken over (§13). |
| `diff` | [ApprovalDiff] | yes |  |

#### `ApproveReleaseRequest`

An administrator’s approval, naming the preview they read.

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | — | Why, in the administrator’s words; optional on an approval. |
| `previewId` | string (uuid) | — | The preview the administrator read (`POST /v1/releases/{releaseId}/approval-preview`). Optional in this schema and REQUIRED by the operation: without it the answer is `400 APPROVAL_PREVIEW_REQUIRED`. |

#### `Audience`

Who the app is for, as its owner answered at creation (§24, D29). A large or public audience adds a load rehearsal to the launch checklist.

| Field | Type | Required | Notes |
|---|---|---|---|
| `scale` | `solo` · `class` · `large_course` · `public` | yes | §24: how many people the app is for. |
| `burst` | `steady` · `synchronised` | yes | §24: whether they arrive steadily, or all at once — a class starting a lab together. |
| `justification` | string | null | yes | Why, in the owner’s words; null when none was given. |
| `setBy` | string (uuid) | yes | Who answered. |
| `setAt` | string (date-time) | yes | When they answered. |

#### `AudienceInput`

§24’s two questions about who the app is for, answered by a person at creation.

| Field | Type | Required | Notes |
|---|---|---|---|
| `scale` | `solo` · `class` · `large_course` · `public` | yes | §24: how many people. |
| `burst` | `steady` · `synchronised` | yes | §24: do they all arrive at once. |
| `justification` | string | — | Why, in a sentence or two — shown to an administrator for a large or public app. |

#### `Blueprint`

A blueprint as a client chooses one: what it provides and the starters it offers. Never its base image or build internals.

| Field | Type | Required | Notes |
|---|---|---|---|
| `ref` | string | yes | `name@major` — what a project pins (§25). |
| `name` | string | yes | The blueprint’s name. |
| `majorVersion` | integer | yes | Its major version — the `@major` a project pins. |
| `language` | string | yes | What an app on it is written in. |
| `defaultPort` | integer | yes | The port its apps listen on unless `runtime.port` says otherwise. |
| `healthPath` | string | yes | The health path its skeleton answers. |
| `schemaVersions` | integer[] | yes | The `manifest:` schema versions it understands. |
| `provides` | object | yes | What an app on it may declare in manifest.yaml (§25). |
| `starters` | object[] | yes | §25: what `POST /v1/projects` accepts as `starter` for this blueprint. |

#### `BlueprintList`

Every blueprint a project can be created from.

#### `Build`

A build of one commit (§13). It answers `running` when it starts, and ends as `succeeded` or `failed` on the project’s stream.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The build — what `getBuild`, `getBuildLog` and `createRelease` name. |
| `projectId` | string (uuid) | yes | Its project. |
| `commitSha` | string | yes | The commit built, whose own manifest.yaml it was built with. |
| `status` | `pending` · `running` · `succeeded` · `failed` | yes | `running` from the moment it is started, then `succeeded` or `failed` — the stream says which as it happens. `pending` is not answered today. |
| `imageDigest` | string | null | yes | `sha256:…` once the build has succeeded; the image a release names. |
| `error` | string | null | yes | Why a failed build failed, in words its author can act on (§14). |
| `scan` | [ScanSummary] | null | yes | Null until the build succeeds, and for a build from before scans were recorded. |
| `createdAt` | string (date-time) | yes | When it was started. |

#### `BuildList`

A project’s newest builds, newest first.

#### `BuildLog`

§14’s build log, as stored.

| Field | Type | Required | Notes |
|---|---|---|---|
| `buildId` | string (uuid) | yes | The build. |
| `lines` | object[] | yes | Every line, in order. |

#### `CommitDetail`

One commit and every file it changed against its first parent, with patches.

| Field | Type | Required | Notes |
|---|---|---|---|
| `commitSha` | string | yes | A full 40-character commit id. |
| `parents` | string[] | yes | Its parents, first parent first; empty for the first commit. |
| `subject` | string | yes | The first line of the commit message. |
| `message` | string | yes | The whole commit message, cut at 4096 characters. |
| `messageTruncated` | boolean | yes | True when `message` was cut. |
| `authorName` | string | yes | The author git recorded. For a commit made through the API this is the person's name; for any other push it is whatever the pusher's git said, and is not verified. |
| `authoredAt` | string (date-time) | yes | When git says the commit was authored, in UTC. |
| `madeThrough` | object | null | yes | Who made this commit through Manifest, from the platform’s own record — a person, or a person’s agent through a delegated token. Null for a commit pushed any other way, whose author is only what the pusher’s git said. |
| `changes` | object[] | yes | Every file the commit changed, by path. |
| `patchesTruncated` | boolean | yes | True when some `patch` is null because the 256 KiB budget was spent. |

#### `CommitList`

A page of the branch’s history, following first parents, newest first.

| Field | Type | Required | Notes |
|---|---|---|---|
| `ref` | string | yes | A branch name, or a full 40-character commit id. Defaults to `main`. |
| `commits` | [CommitSummary][] | yes | Newest first. |
| `next` | string | null | yes | Pass as `cursor` for the next page; null on the last page. |

#### `CommitOutcome`

The commit made — or, for a dry run, the one that would have been.

| Field | Type | Required | Notes |
|---|---|---|---|
| `dryRun` | boolean | yes | True when nothing was written. |
| `commitSha` | string | null | yes | The new commit on `main`; null for a dry run. |
| `parent` | string | yes | The commit this one follows — the request’s `baseCommit`. |
| `changes` | object[] | yes | What changed, by path. A write that left a file as it was is not listed. |
| `spec` | object | yes | The new commit's manifest.yaml — always valid, because an invalid one is refused `SPEC_INVALID` before anything is written. |

#### `CommitSummary`

One commit on the branch — who, when and why, without its changes.

| Field | Type | Required | Notes |
|---|---|---|---|
| `commitSha` | string | yes | A full 40-character commit id. |
| `parents` | string[] | yes | Its parents, first parent first; empty for the first commit. |
| `subject` | string | yes | The first line of the commit message. |
| `message` | string | yes | The whole commit message, cut at 4096 characters. |
| `messageTruncated` | boolean | yes | True when `message` was cut. |
| `authorName` | string | yes | The author git recorded. For a commit made through the API this is the person's name; for any other push it is whatever the pusher's git said, and is not verified. |
| `authoredAt` | string (date-time) | yes | When git says the commit was authored, in UTC. |
| `madeThrough` | object | null | yes | Who made this commit through Manifest, from the platform’s own record — a person, or a person’s agent through a delegated token. Null for a commit pushed any other way, whose author is only what the pusher’s git said. |

#### `ControlFrame`

Ends the replay: everything after it is live.

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `control` | yes | A message about the stream itself. |
| `id` | string | yes | An id for this message; opaque. |
| `projectId` | string (uuid) | yes | The project the stream is for. |
| `type` | `manifest.stream.ready` | yes | The replay is over: every message after this one is live. |

#### `CreateCommitRequest`

Changes to make on `main`, computed from `baseCommit`: whole-file writes and deletions of text files.

| Field | Type | Required | Notes |
|---|---|---|---|
| `baseCommit` | string | yes | The commit these changes were computed from — `commitSha` from the tree or file you read. `main` must still be exactly this commit, or the request is refused `SOURCE_CONFLICT`. |
| `message` | string | yes | The commit message. Its first line is its subject. |
| `changes` | object | object[] | yes | At most 500 writes and deletions, each naming a different path. |
| `dryRun` | boolean | — | Run every check the commit would, write nothing, and answer what would have happened. |

#### `CreateProjectRequest`

A new project: its name, its blueprint, an optional starter, and who it is for.

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes | Checked by the same function as GET /v1/slugs/{slug} (§23). |
| `blueprint` | string | yes | `name@major`, from GET /v1/blueprints. |
| `starter` | string | — | One the blueprint offers. Without one: the skeleton and a minimal manifest. |
| `audience` | [AudienceInput] | yes |  |

#### `CreateReleaseRequest`

The build to freeze into a release, with a line saying what it changes.

| Field | Type | Required | Notes |
|---|---|---|---|
| `buildId` | string (uuid) | yes | A build that succeeded (`listBuilds`). |
| `summary` | string | — | What this release changes, for the people who read it. |

#### `CreatedProject`

§22 steps 2–3: the project, its environments, and the validation of the manifest its first commit carries.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The project — what every project-scoped path names. |
| `slug` | string | yes | The project’s name, and the first label of every hostname it has (§23). |
| `blueprint` | string | yes | `name@major` (§25). |
| `starter` | string | null | yes | The starter the first commit was seeded from (§25); null for the skeleton alone. |
| `owner` | [UserSummary] | yes |  |
| `audience` | [Audience] | null | yes | Who it is for (§24); null for a project created before the question was asked. |
| `createdAt` | string (date-time) | yes | When it was created. |
| `launchedAt` | string (date-time) | null | yes | When it first went to production (§13 D9) — null until then; never cleared. |
| `repository` | [RepositoryLink] | yes |  |
| `environments` | [Environment][] | yes | Its three environments, none deployed yet. |
| `spec` | [SpecValidation] | yes |  |

#### `DeployRequest`

Which release to deploy.

| Field | Type | Required | Notes |
|---|---|---|---|
| `releaseId` | string (uuid) | yes | The release to deploy to the environment in the path. |

#### `DocIndex`

The API’s documentation: every page Manifest serves, for a person and for an agent.

| Field | Type | Required | Notes |
|---|---|---|---|
| `pages` | object[] | yes | Every page, the index first, then the guides, then the generated reference. |

#### `DocPage`

One page of the API’s documentation, as the platform serves it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes | The page’s name in `getDoc`: its path under the documentation without `.md`, `/` as `-` — `reference-errors` is `reference/errors.md`. |
| `title` | string | yes | The page’s title — its first heading. |
| `markdown` | string | yes | The page, as Markdown. Its links name other pages by their file, as `authoring.md` — `getDoc` reads each by its slug. |

#### `EmptyRequest`

A mutation that takes no fields still sends a JSON object: `{}`, with `Content-Type: application/json`.

#### `Environment`

One of a project’s three environments (§11): where a release is deployed, and what is serving there now.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The environment — what `deploy`, `listIncidents` and the secrets operations name. |
| `projectId` | string (uuid) | yes | Its project. |
| `kind` | `sandbox` · `staging` · `production` | yes | Which of the three: `sandbox`, `staging` or `production` (§11). |
| `hostname` | string | yes | §23: `<slug>.<zone for this kind>`. Permanent. |
| `url` | string (uri) | yes | Where the app answers in this environment, once it is deployed. |
| `instance` | [Instance] | null | yes | The instance the hostname reaches (§6 Route). Null before any deploy. |

#### `EnvironmentList`

A project’s three environments: sandbox, staging and production.

#### `ErrorCode`

Every code the API answers with, in `error.code`. Stable: a client switches on it (§20). `x-enumDescriptions` gives each code’s meaning, and the top-level `x-manifest-errors` its status and remedy.

One of: `AI_BACKEND_UNAVAILABLE` · `AI_CATALOGUE_DISABLED` · `AI_CATALOGUE_EMPTY` · `AI_KEY_EXPIRED` · `AI_KEY_REVOKED` · `AI_MODEL_NOT_PERMITTED` · `AI_MODEL_UNKNOWN` · `AI_PROJECT_BUDGET_EXCEEDED` · `AI_ROUTE_NOT_PERMITTED` · `AI_UNMAPPED` · `AI_USER_BUDGET_EXCEEDED` · `APPROVAL_PREVIEW_EXPIRED` · `APPROVAL_PREVIEW_REQUIRED` · `APPROVAL_PREVIEW_STALE` · `BLUEPRINT_NOT_FOUND` · `CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED` · `CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH` · `CONFIG_GITHUB_FAKE_OUTSIDE_DEVELOPMENT` · `CONFIG_GITHUB_INSECURE_URL` · `CONFIG_INVALID` · `CONFIG_LITELLM_MASTER_KEY_REQUIRED` · `CONFIG_MASTER_SECRET_REQUIRED` · `CREDENTIAL_AMBIGUOUS` · `CSRF_ORIGIN_REFUSED` · `DOC_NOT_FOUND` · `EVENTS_UPGRADE_REQUIRED` · `FORBIDDEN` · `IDEMPOTENCY_KEY_REQUIRED` · `IDEMPOTENCY_KEY_REUSED` · `INTERNAL` · `LAUNCH_RECORD_INVALID` · `LAUNCH_TRANSITION_INVALID` · `MEMBER_USER_NOT_FOUND` · `NOT_FOUND` · `PENDING_ACTION_RESOLVED` · `PROJECT_LAST_OWNER` · `RATE_LIMITED` · `REHEARSAL_DEPLOY_FAILED` · `REHEARSAL_LAUNCHED` · `REHEARSAL_NOT_CWL` · `REHEARSAL_NO_CANDIDATE` · `RELEASE_AI_BUDGET_MISSING` · `RELEASE_AI_DISABLED` · `RELEASE_BLUEPRINT_NOT_FOUND` · `RELEASE_BUILD_NOT_DEPLOYABLE` · `RELEASE_BUILD_NOT_FOUND` · `RELEASE_DIGEST_MISSING` · `RELEASE_DIGEST_NOT_APPROVED` · `RELEASE_ENVIRONMENT_NOT_FOUND` · `RELEASE_IMAGE_REPOSITORY_MISSING` · `RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER` · `RELEASE_MODEL_CLASSIFICATION_TOO_LOW` · `RELEASE_MODEL_NOT_IN_CATALOGUE` · `RELEASE_MODEL_UNCLASSIFIED` · `RELEASE_NOT_FOUND` · `RELEASE_NOT_STAGED` · `RELEASE_PRODUCTION_GATE_UNAVAILABLE` · `RELEASE_PROJECT_NOT_FOUND` · `RELEASE_REESCALATED` · `RELEASE_SECRET_NOT_SET` · `REQUEST_BODY_TOO_LARGE` · `REQUEST_INVALID` · `REQUEST_MEDIA_TYPE_UNSUPPORTED` · `ROUTE_NOT_FOUND` · `SAML_ASSERTION_REJECTED` · `SAML_LOGIN_NOT_BOUND` · `SAML_LOGOUT_REJECTED` · `SAML_NO_PUID` · `SAML_STEP_UP_NO_SESSION` · `SAML_STEP_UP_WRONG_USER` · `SAML_USER_UPSERT_FAILED` · `SECRET_NAME_RESERVED` · `SLUG_INVALID` · `SLUG_RESERVED` · `SLUG_TAKEN` · `SOURCE_COMMIT_NOT_FOUND` · `SOURCE_CONFLICT` · `SOURCE_FILE_NOT_TEXT` · `SOURCE_FILE_TOO_LARGE` · `SOURCE_GITHUB_KEY_UNREADABLE` · `SOURCE_GITHUB_REFUSED` · `SOURCE_GIT_FAILED` · `SOURCE_INVALID_SLUG` · `SOURCE_NOTHING_TO_COMMIT` · `SOURCE_PATH_CONFLICT` · `SOURCE_PATH_ESCAPE` · `SOURCE_PATH_NOT_A_FILE` · `SOURCE_PATH_NOT_FOUND` · `SOURCE_PROVIDER_MISMATCH` · `SOURCE_REF_NOT_FOUND` · `SOURCE_REPOSITORY_EXISTS` · `SOURCE_REPOSITORY_NOT_PRIVATE` · `SOURCE_REPOSITORY_PUBLIC` · `SOURCE_SECRET_DETECTED` · `SOURCE_UNREACHABLE` · `SPEC_INVALID` · `SPEC_NOT_FOUND` · `STARTER_NOT_FOUND` · `STEP_UP_REQUIRED` · `TOKEN_ACTION_PENDING` · `TOKEN_ACTION_REJECTED` · `TOKEN_ALREADY_MINTED` · `TOKEN_CAPABILITY_FORBIDDEN` · `TOKEN_CREDENTIAL_REFUSED` · `TOKEN_PERSON_ONLY` · `UNAUTHENTICATED` · `WEBHOOKS_NOT_CONFIGURED` · `WEBHOOK_PAYLOAD_INVALID` · `WEBHOOK_SIGNATURE_INVALID` · `WEBHOOK_SIGNATURE_MALFORMED` · `WEBHOOK_SIGNATURE_MISSING`

#### `ErrorEnvelope`

Every error the API answers, in one shape (D23.7): a stable code to switch on, a message for a person, and — where there is one — a hint and the details to act on.

| Field | Type | Required | Notes |
|---|---|---|---|
| `error` | object | yes | What went wrong: switch on `code`; `x-manifest-errors` gives its remedy. |

#### `EventFrame`

An audit Event, as recorded (§20) and redacted at capture (§14). Switch on `type`; each type has one `machineDetail` shape. Replayed on reconnect.

37 variants: object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object

#### `Fleet`

§26’s fleet, administrators only. Not yet: department, custom domains, AI spend this month.

#### `IamRegistration`

What UBC IAM registered for the app’s production CWL sign-in (§9), as an administrator recorded it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The record. |
| `projectId` | string (uuid) | yes | Its project. |
| `entityId` | string | yes | §9: fixed at registration and stored here rather than recomputed — which is also why a project slug is immutable after production launch. |
| `acsUrl` | string | yes | The assertion consumer URL registered — where sign-ins are sent. |
| `sloUrl` | string | yes | The single-logout URL registered. |
| `certFingerprint` | string | null | yes | The fingerprint of the signing certificate registered; null when none was recorded. |
| `certExpiresAt` | string (date-time) | null | yes | D20: an unnoticed expiry silently kills login for a live course app. |
| `registeredAttributes` | string[] | yes | WHAT UBC IAM ACTUALLY REGISTERED. A production build fails when a release asks for an attribute that is not in here (§7). Once registered, it changes only on a record that reaches `active` — a change UBC has not registered yet is `requestedAttributes`. |
| `requestedAttributes` | string[] | null | yes | What an outstanding CHANGE REQUEST asks UBC IAM for (§9) — the registration’s own `change_requested` state is the change request. Null when none is outstanding; cleared when the registration is recorded `active` again. |
| `registeredAt` | string (date-time) | null | yes | When UBC IAM last registered this Service Provider — set when the record reaches `active`. Null until the first time; a launched app’s releases need it (§13, D9). |
| `state` | `draft` · `submitted` · `active` · `change_requested` · `expired` | yes | Along §9’s states: `draft`, `submitted` to UBC IAM, `active` once registered, `change_requested` while a change is with UBC IAM, and `expired`. |
| `externalTicketRef` | string | null | yes | UBC IAM’s own reference for the request; null when none was recorded. |
| `updatedAt` | string (date-time) | yes | When the record last changed. |

#### `Incident`

A failed deploy, as §14 records it: how it ended, what the platform checked, what the app printed, and what changed since it last worked.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The Incident. |
| `instanceId` | string (uuid) | yes | The instance that failed. |
| `releaseId` | string (uuid) | yes | The release it ran (`getRelease`). |
| `exitReason` | string | yes | How it ended — its exit, or that it never answered its health check. |
| `logTail` | string | yes | The last 200 lines, redacted at capture (§14). |
| `failedCheck` | string | yes | Which check the platform ran and what it got back (§11). |
| `diffSinceHealthy` | string | yes | What changed in manifest.yaml since the last release that was healthy here — often the cause. |
| `createdAt` | string (date-time) | yes | When it was recorded. |
| `prompt` | string | yes | §14: shaped to be handed straight to an agent as a repair request. |

#### `IncidentList`

One environment’s Incidents, newest first.

| Field | Type | Required | Notes |
|---|---|---|---|
| `environmentId` | string (uuid) | yes | The environment. |
| `incidents` | [Incident][] | yes | Newest first. |

#### `Instance`

A running (or once-running) copy of a release in one environment (§11). Never its driver or handle.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The instance. |
| `environmentId` | string (uuid) | yes | The environment it runs in. |
| `releaseId` | string (uuid) | yes | The release it runs (`getRelease`). |
| `kind` | `web` · `worker` · `cron` | yes | What kind of process it is; `web`, which answers requests, is the only kind the platform runs today. |
| `state` | `pending` · `building` · `provisioning` · `starting` · `healthy` · `failed` · `hibernated` · `waking` · `destroying` · `gone` | yes | Where it is in its life (§11): `provisioning` and `starting` on the way up, `healthy` when it serves, `failed` when it never did, and `destroying` then `gone` once replaced. |
| `lastSeenAt` | string (date-time) | null | yes | When the platform last saw it running; null before it started. |

#### `KnowledgePack`

D25: the files that teach an agent to write a valid manifest.yaml and wire the blueprint, versioned with it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `blueprint` | string | yes | The blueprint it belongs to, `name@major`. |
| `files` | object[] | yes | Every file in the pack; read them all before writing code. |

#### `LaunchReadiness`

§13’s checklist, computed from what exists — a first launch’s, or once launched the self-serve check (D9). A production deploy is refused with this exact value until every blocking item is met.

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | string (uuid) | yes | The project. |
| `launched` | boolean | yes | Which of D9’s two clauses this is: false, the first launch’s checklist; true, a launched app’s, where a release goes to production self-serve unless it changes a sensitive field (§13). |
| `ready` | boolean | yes | Whether every blocking item is met — a production deploy is refused until it is. |
| `candidateReleaseId` | string (uuid) | null | yes | The release serving staging — what production would run; null when nothing serves staging. |
| `baselineReleaseId` | string (uuid) | null | yes | The last approved release the candidate is compared with (D9.2); null before launch, or when nothing else is approved. |
| `sensitiveFields` | `services` · `auth.attributes` · `egress.allow` · `resources` · `data.classification` · `ai.models` · `blueprint`[] | yes | §7’s fields the candidate changes since that release; empty before launch. |
| `reescalated` | boolean | yes | An administrator’s approval is what this release is waiting for — a sensitive change, not rejected, and nothing else unmet (§13 D9.2). |
| `items` | [LaunchReadinessItem][] | yes | Every item, met or not. |

#### `LaunchReadinessItem`

One item of the launch checklist (§13), computed from what exists.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `domain` · `iam-registration` · `privacy-assessment` · `rehearsal` · `scans` · `admin-approval` · `load-rehearsal` · `code-review` | yes | Which item — stable, for a client to switch on. |
| `title` | string | yes | The item, for a person. |
| `owner` | string | yes | Who meets it: the project’s owner, Manifest itself, or UBC recorded by an administrator. |
| `blocking` | boolean | yes | Whether this item gates production. `ready` is every BLOCKING item being met; a non-blocking item is shown and never refuses a launch (D33: `code-review`). |
| `state` | `met` · `unmet` · `not_built` | yes | `met`: satisfied. `unmet`: tracked and not satisfied — `why` says what to do. `not_built`: Manifest does not track it yet, and `builtBy` says what will. |
| `why` | string | yes | Why it matters, and — when it is unmet — what meets it. |
| `builtBy` | string | — | For a `not_built` item: what will build it. Absent otherwise. |

#### `LaunchRecords`

The two external records a first production launch waits on (§9).

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | string (uuid) | yes | The project. |
| `iamRegistration` | [IamRegistration] | null | yes | What UBC IAM registered; null until an administrator records something. |
| `privacyAssessment` | [PrivacyAssessment] | null | yes | What the Privacy Office said; null until an administrator records something. |

#### `LogFrame`

One line of a build’s output, as it is written. Never replayed — GET /v1/builds/{buildId}/logs has them all.

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `log` | yes | A line of a build’s output. |
| `id` | string | yes | `<buildId>:<seq>`. |
| `projectId` | string (uuid) | yes | The project the build belongs to. |
| `buildId` | string (uuid) | yes | The build writing it (`getBuild`). |
| `seq` | integer | yes | Its position in the build’s log, from 0 — `getBuildLog` answers the same numbers. |
| `stream` | `stdout` · `stderr` | yes | Which of the build’s outputs wrote it. |
| `text` | string | yes | Redacted at capture (§14). |
| `createdAt` | string (date-time) | yes | When it was written. |

#### `ManifestError`

One thing wrong with manifest.yaml (§7, §25), inside `details` of a `422 SPEC_INVALID` or a spec validation. Switch on `code`; show `message` and `hint` to a person.

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | [ManifestErrorCode] | yes |  |
| `path` | string | yes | Where in manifest.yaml, dotted: `services.0.type`. |
| `message` | string | yes | What is wrong at `path`, naming the value — for a person to read. |
| `hint` | string | — | How to correct it, when there is one sentence to say: the permitted values, or the setting to ask about. |

#### `ManifestErrorCode`

A code inside `details` of a `422 SPEC_INVALID`: a breach of §7’s schema or policy, or of §25’s blueprint compatibility. `x-enumDescriptions` gives each code’s meaning, and the top-level `x-manifest-spec-errors` its remedy.

One of: `BLUEPRINT_AI_UNSUPPORTED` · `BLUEPRINT_AUTH_UNSUPPORTED` · `BLUEPRINT_SCHEMA_VERSION_UNSUPPORTED` · `BLUEPRINT_SERVICE_UNSUPPORTED` · `SPEC_AI_BUDGET_REQUIRED` · `SPEC_AI_DISABLED` · `SPEC_ATTRIBUTE_NOT_REGISTERED` · `SPEC_ATTRIBUTE_NOT_WHITELISTED` · `SPEC_BLUEPRINT_NOT_PINNED` · `SPEC_BUILD_BLOCK_FORBIDDEN` · `SPEC_ENV_NAME_RESERVED` · `SPEC_FIELD_NOT_ENFORCED` · `SPEC_INVALID_BLUEPRINT_REF` · `SPEC_INVALID_SLUG` · `SPEC_INVALID_VALUE` · `SPEC_MODEL_CLASSIFICATION_TOO_LOW` · `SPEC_MODEL_UNCLASSIFIED` · `SPEC_MODEL_UNKNOWN` · `SPEC_NAME_SLUG_MISMATCH` · `SPEC_PATH_EXPECTED` · `SPEC_QUOTA_EXCEEDED` · `SPEC_RESERVED_BLOCK_NOT_EMPTY` · `SPEC_SERVICE_TYPE_UNKNOWN` · `SPEC_UNKNOWN_KEY` · `SPEC_YAML_PARSE_FAILED`

#### `ManifestYaml`

manifest.yaml, schema version 1 (§7), as a JSON Schema — DOCUMENTATION FOR THE FILE, for whoever writes it. The platform validates with its own code: `validateSpec` and a commit answer each problem as a `ManifestError` with a path, and some rules are not expressible here — the name must equal the project’s slug, a model must be in the catalogue and approved for `data.classification`, and what is asked for must fit the project’s quota.

| Field | Type | Required | Notes |
|---|---|---|---|
| `manifest` | `1` | yes | The schema version: `1`. |
| `name` | string | yes | The project’s slug, exactly (§23): 3 to 39 lower-case letters, digits and hyphens, starting with a letter. |
| `blueprint` | string | yes | The project’s blueprint and its major version, `name@major` — the project’s own pin (§25). A commit cannot change it. |
| `description` | string | — | What the app is for, in a sentence or two. |
| `runtime` | object | yes | How the app runs. |
| `resources` | object | — | What the app may use. Unset fields take the blueprint’s defaults; the total is bounded by the project’s quota. |
| `services` | object[] | — | The backing services the app needs; may be empty. |
| `auth` | object | — | Who may use the app, and what it learns about them (§9). |
| `ai` | object | — | The AI the app uses, through the platform’s gateway (§10). |
| `env` | object | object[] | — | Environment variables the app is given, beside the ones the platform sets (§8). |
| `egress` | object | — | Where the app may connect to outside the platform. |
| `data` | object | — | What the app’s data is (§15). |
| `integrations` | object[] | — | Reserved (§15): must be empty, or absent, in schema version 1. |
| `jobs` | object[] | — | Reserved (§15): must be empty, or absent, in schema version 1. |
| `checks` | object[] | — | Reserved (§15): must be empty, or absent, in schema version 1. |
| `environments` | object | — | Per-environment overrides of `resources` and `env` only. Sandbox takes the top level as written. |

#### `Me`

The person the session belongs to.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The person’s user id on this platform — what `listMembers` calls `userId`. |
| `puid` | string | yes | The person's ubcEduCwlPuid (§9). |
| `displayName` | string | yes | Their name, as CWL gave it. |
| `email` | string | yes | Their address, as CWL gave it. |
| `role` | `admin` · `member` | yes | The platform role THIS SESSION is authorized as. |

#### `Member`

A person who may work on the project, and their role on it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | yes | The person’s user id — what `removeMember` names. |
| `puid` | string | yes | Their ubcEduCwlPuid (§9) — what `addMember` names. |
| `displayName` | string | yes | Their name, as CWL gave it. |
| `email` | string | yes | Their address, as CWL gave it. |
| `role` | `owner` · `collaborator` | yes | `owner` may do everything on the project; `collaborator` the same except managing members, deleting the project and promoting a release to production (§13). |

#### `MemberList`

Everyone who may work on the project; every project has an owner.

#### `MintTokenRequest`

A delegated token to mint: a label, what it may do, and how long it lives.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | A person’s label for it, so a list of tokens is reviewable. |
| `capabilities` | `project:read` · `project:write` · `project:delete` · `source:write` · `secret:write` · `members:manage` · `build:create` · `release:create` · `release:deploy` · `release:promote` · `release:approve` · `launch:record` · `quota:set` · `secret:read`[] | yes | The explicit set this token may use (D24). None of members:manage, release:promote, quota:set or secret:read: those are refused to a delegated token however it was minted. Nor release:approve or launch:record, which are person-only and refused outright. |
| `expiresInDays` | integer | yes | How long the token lives, in days. D24: a token has an expiry, and at most 365 days of one. |

#### `MintedToken`

A newly minted delegated token, with its secret. The only time the secret exists.

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | [Token] | yes |  |
| `secret` | string | yes | The token, in full: `mft_<id>_<secret>` — what an agent sends as `Authorization: Bearer`. Store it now: it is in this answer and nowhere else. `listTokens` never shows it, and a retry of this mint with the same Idempotency-Key answers `409 TOKEN_ALREADY_MINTED` naming the token, never the secret again. |

#### `OpenApiDocument`

This API’s OpenAPI 3.1 document — the one the platform publishes, generated from its own route definitions when it starts, so what is served is what is published.

#### `PendingAction`

D24: a delegated token asked for one of the privileged four. A person confirms or rejects it; a confirmation grants that one request a single retry.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The question — what `confirmPendingAction` and `rejectPendingAction` name. |
| `projectId` | string (uuid) | yes | The project it was asked on. |
| `tokenId` | string (uuid) | yes | The delegated token that asked (`listTokens`). |
| `action` | string | yes | The privileged capability that was refused — one of D24’s four. |
| `state` | `pending` · `confirmed` · `rejected` · `expired` | yes | `pending` until a person answers; `confirmed` grants the identical request one retry; `rejected` is final; `expired` when nobody answered in time. |
| `method` | string | yes | The HTTP method the token used. |
| `path` | string | yes | The path it asked for. |
| `bodySha256` | string | yes | SHA-256 of the canonical request body, so a client can match its own. |
| `summary` | string | yes | What was asked for, for the person who answers. |
| `expiresAt` | string (date-time) | yes | When the question lapses unanswered. |
| `createdAt` | string (date-time) | yes | When the token asked. |
| `resolvedAt` | string (date-time) | null | yes | When a person answered; null while it is pending. |
| `waitingSeconds` | integer | yes | Seconds between the question being asked and it being answered — or, while it is still pending, now. |
| `reason` | string | null | yes | A rejection’s reason, in the person’s words — what the agent is told; null otherwise. |
| `consumedAt` | string (date-time) | null | yes | When the confirmed retry was made, spending the confirmation; null until then. |

#### `PendingActionList`

The questions agents have put to the people who own this project, newest first (§26).

#### `PrivacyAssessment`

What UBC’s Privacy Office said of the app’s privacy impact assessment (§9), as an administrator recorded it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The record. |
| `projectId` | string (uuid) | yes | Its project. |
| `state` | `draft` · `submitted` · `approved` | yes | Along §9’s states: `draft`, `submitted` to the Privacy Office, `approved`. A refused assessment goes back to `draft`. |
| `reviewer` | string | null | yes | Who at the Privacy Office reviewed it; null until recorded. |
| `approvedAt` | string (date-time) | null | yes | When it was approved; null until it is. |
| `externalTicketRef` | string | null | yes | The Privacy Office’s own reference; null when none was recorded. |
| `updatedAt` | string (date-time) | yes | When the record last changed. |

#### `Project`

A project: one app, its code, its three environments and who works on it (§6).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The project — what every project-scoped path names. |
| `slug` | string | yes | The project’s name, and the first label of every hostname it has (§23). |
| `blueprint` | string | yes | `name@major` (§25). |
| `starter` | string | null | yes | The starter the first commit was seeded from (§25); null for the skeleton alone. |
| `owner` | [UserSummary] | yes |  |
| `audience` | [Audience] | null | yes | Who it is for (§24); null for a project created before the question was asked. |
| `createdAt` | string (date-time) | yes | When it was created. |
| `launchedAt` | string (date-time) | null | yes | When it first went to production (§13 D9) — null until then; never cleared. |
| `repository` | [RepositoryLink] | yes |  |
| `environments` | [Environment][] | — | Present with `?expand=environments` (D23.1). |

#### `ProjectList`

Every project the caller is a member of — every project, for an administrator.

#### `RecordIamRegistrationRequest`

What UBC IAM registered for the app’s production sign-in, as an administrator records it from the ticket (§9).

| Field | Type | Required | Notes |
|---|---|---|---|
| `entityId` | string | yes | The entityID UBC IAM registered — fixed once registered. |
| `acsUrl` | string | yes | The assertion consumer URL registered. |
| `sloUrl` | string | yes | The single-logout URL registered. |
| `registeredAttributes` | string[] | yes | Exactly the attributes UBC IAM registered, as the ticket lists them. Once registered, a record that does not reach `active` must repeat them unchanged. |
| `requestedAttributes` | string[] | — | What a change request asks for; required when a registration goes from `active` to `change_requested`. |
| `state` | `draft` · `submitted` · `active` · `change_requested` · `expired` | yes | The state this record should now be in. It is reached along §9’s arrows from wherever it is — a first write into `active` is refused exactly as a later one is. |
| `externalTicketRef` | string | — | UBC IAM’s ticket reference, pasted in. |
| `certFingerprint` | string | — | The fingerprint of the signing certificate registered. |
| `certExpiresAt` | string (date-time) | — | When that certificate expires (D20). |

#### `RecordPrivacyAssessmentRequest`

What the Privacy Office said, as an administrator records it (§9).

| Field | Type | Required | Notes |
|---|---|---|---|
| `state` | `draft` · `submitted` · `approved` | yes | The state this record should now be in, reached along §9’s arrows. |
| `reviewer` | string | — | Who at the Privacy Office reviewed it. |
| `externalTicketRef` | string | — | The Privacy Office’s reference, pasted in. |

#### `Rehearsal`

A LOCAL, production-shaped rehearsal of the app’s CWL sign-in (D21): it proves the SHAPE of the registration, and never UBC’s acceptance of it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The rehearsal. |
| `projectId` | string (uuid) | yes | Its project. |
| `releaseId` | string (uuid) | yes | The candidate release rehearsed — the one serving staging. |
| `passed` | boolean | yes | Whether a production-shaped CWL sign-in worked. |
| `entityId` | string | yes | The entityID the Service Provider was registered under when this ran — read off the registration, never recomputed. |
| `acsUrl` | string | yes | Where the sign-in’s assertion was sent. |
| `attributes` | string[] | yes | The attributes the registration listed when it ran, compared with what the candidate release would register now. |
| `evidence` | object | yes | What the rehearsal saw — measured, not assumed. |
| `ranAt` | string | yes | When it ran, ISO 8601 in UTC. |

#### `RejectPendingActionRequest`

A person’s refusal of a pending action, in their own words.

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | yes | Why this is refused. The agent is told, verbatim. |

#### `RejectReleaseRequest`

An administrator’s rejection, naming the preview they read. It is final for the release.

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | yes | Why, in the administrator’s words — required: a refusal with no words is one nobody can act on. |
| `previewId` | string (uuid) | — | The preview the administrator read (`POST /v1/releases/{releaseId}/approval-preview`). Optional in this schema and REQUIRED by the operation: without it the answer is `400 APPROVAL_PREVIEW_REQUIRED`. |

#### `Release`

Immutable: a build, a spec and the configuration resolved for every environment (§13).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The release — what `deploy` names. |
| `projectId` | string (uuid) | yes | Its project. |
| `buildId` | string (uuid) | yes | The build it froze. |
| `appSpecId` | string (uuid) | yes | The validation of manifest.yaml it froze — its build’s commit’s. |
| `imageDigest` | string | yes | What an approval binds to (§13). |
| `summary` | string | null | yes | What it changes, in its author’s words; null when none was given. |
| `createdBy` | string (uuid) | yes | Who made it. |
| `createdAt` | string (date-time) | yes | When it was made. |
| `scan` | [ScanSummary] | null | yes | §12: its build’s scan, recorded on the Release. |
| `config` | object | yes | What it runs as in each environment, resolved when it was made. |

#### `ReleaseList`

A project’s newest releases, newest first.

#### `RepositoryLink`

Where the project’s code lives (D5), and whether `main` is protected there.

| Field | Type | Required | Notes |
|---|---|---|---|
| `provider` | `local` · `github` | yes | Which of D5’s drivers holds it: a repository on this machine, or GitHub. |
| `fullName` | string | yes | The slug on this machine; `<org>/<slug>` on GitHub, as GitHub names it. |
| `webUrl` | string | null | yes | Where a person opens it; null on this machine, where a path is not an address. |
| `mainProtected` | boolean | yes | Whether a person’s force-push or deletion of `main` is refused where the code lives. |
| `protectionDetail` | string | null | yes | The host’s own words when it would not protect `main`; null when it did. |
| `visibility` | `private` · `public` | null | yes | What Manifest last read of the repository’s visibility on GitHub: `private`, or `public` — and nothing is built from a repository last read public until a read says it is private again. Null on this machine, where a repository has no visibility, and before GitHub has been read. |

#### `ScanSummary`

§12’s scan of the image a build produced (§6 `Build.scan`).

| Field | Type | Required | Notes |
|---|---|---|---|
| `scanner` | string | yes | The scanner and its version — `fake` from the in-memory driver. |
| `scannedAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |
| `databaseAgeDays` | number | null | yes | How old the vulnerability database was, in days; null when the scanner could not say, and then `stale` is true. |
| `stale` | boolean | yes | A clean result from a stale database is not evidence there is nothing to find (§12). |
| `baseImageKnown` | boolean | yes | False when the base image was not identified: every finding was attributed to the build, so `baseImage` counted nothing. |
| `fixable` | object | yes | Introduced by this build, with a published fix. On a fresh database a build with any is refused (§12). |
| `unfixable` | object | yes | Introduced by this build, with no published fix: recorded, not blocking (§12). |
| `baseImage` | object | yes | The base image’s own — the blueprint’s to fix (§20). |
| `unfixableFindings` | object[] | yes | The unfixable findings by id, at most 50; `unfixable` counts them all. |

#### `SensitiveDiff`

D9: which of §7’s sensitive fields this manifest changes against the project’s newest VALID one. Reported here, and enforced at a launched app’s production deploy, where such a change needs an administrator’s approval (§13).

| Field | Type | Required | Notes |
|---|---|---|---|
| `sensitive` | boolean | yes | Whether any of §7’s sensitive fields changed. |
| `fields` | string[] | yes | Which of them changed — `services`, `auth.attributes`, `egress.allow` and so on. |

#### `SetAppSecretRequest`

The value to store under the name in the path.

| Field | Type | Required | Notes |
|---|---|---|---|
| `value` | string | yes | The value, as text: at least 6 characters (a shorter one could not be redacted from the app’s Incidents), at most 16384 bytes of UTF-8, well-formed, with no NUL. Takes effect at the next deploy of this environment; it is never answered back. |

#### `SlugCheck`

§23: exactly what project creation will answer — advisory, since creation checks again.

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes | The name checked, as sent. |
| `available` | boolean | yes | Whether `createProject` would accept it now. |
| `reasons` | object[] | — | Present when `available` is false: every reason that applies. |

#### `SourceFile`

One text file at one commit, whole.

| Field | Type | Required | Notes |
|---|---|---|---|
| `ref` | string | yes | A branch name, or a full 40-character commit id. Defaults to `main`. |
| `commitSha` | string | yes | The commit the file was read at. |
| `path` | string | yes | The file’s path from the repository root. |
| `content` | string | yes | The file’s text, exactly — UTF-8, at most 1 MiB. |
| `size` | integer | yes | The file’s size in bytes. |
| `mode` | string | yes | `100644`, or `100755` for an executable file — kept when the file is changed. |
| `blobSha` | string | yes | git's id for this content; equal ids mean equal bytes. |

#### `SourceTree`

Every path in the repository at one commit — the files an API client can read and write.

| Field | Type | Required | Notes |
|---|---|---|---|
| `ref` | string | yes | A branch name, or a full 40-character commit id. Defaults to `main`. |
| `commitSha` | string | yes | The commit the ref resolved to — what this listing is OF. Send it as `baseCommit` when committing changes computed from it. |
| `entries` | object[] | yes | Every entry of the tree, sorted by path. |
| `truncated` | boolean | yes | True when the tree has more than 10,000 entries and only the first 10,000, by path, are listed. |

#### `Spec`

The project’s newest recorded validation of manifest.yaml, parsed (§7), when it is valid — an invalid one is answered `422 SPEC_INVALID` instead. Its commit is the one a build names when it names none.

| Field | Type | Required | Notes |
|---|---|---|---|
| `appSpecId` | string (uuid) | yes | The recorded validation this is. |
| `commitSha` | string | yes | The commit whose manifest.yaml it is. |
| `spec` | object | yes | manifest.yaml v1 as parsed and validated (§7), every default filled in. `ManifestYaml` in this document describes each field. |

#### `SpecValidation`

One validation of manifest.yaml at one commit (§7), recorded — valid or not — and announced as `spec.validated`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `appSpecId` | string (uuid) | yes | The validation, as recorded. |
| `commitSha` | string | yes | The commit whose manifest.yaml was validated. |
| `valid` | boolean | yes | Whether it is valid; a build of this commit needs it to be. |
| `errors` | [ManifestError][] | yes | Every problem, each with its path and code; empty when `valid`. |
| `warnings` | [ManifestError][] | yes | What the validation says WITHOUT refusing — a field validated and recorded but not enforced yet (`SPEC_FIELD_NOT_ENFORCED`). Never a reason `valid` is false; empty for a manifest that did not parse. Show them where the errors are shown. |
| `sensitiveDiff` | [SensitiveDiff] | yes |  |

#### `StartBuildRequest`

Which commit to build.

| Field | Type | Required | Notes |
|---|---|---|---|
| `commitSha` | string | — | The full id of the commit to build. Without it, the commit of the project’s newest recorded validation — which need not be `main`’s head: name the commit you mean. |

#### `StreamFrame`

Every message on WS /v1/projects/{projectId}/events is one of these, as JSON. Switch on `kind`, then `type`.

3 variants: [EventFrame] | [LogFrame] | [ControlFrame]

#### `Token`

A delegated token (D24), scoped to one project and a capability set. Its secret is shown once, when it is minted, and is never readable again.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | The token — what `revokeToken` names, and the `<id>` in its secret. |
| `projectId` | string (uuid) | yes | The one project it may act on. |
| `name` | string | yes | The label its minter gave it. |
| `capabilities` | string[] | yes | What it may do on that project (D24); nothing else. |
| `rateLimit` | integer | yes | Requests a minute this token may make, enforced in the control plane (§20). Past it, every route answers 429 RATE_LIMITED with Retry-After. |
| `expiresAt` | string (date-time) | yes | When it stops working. |
| `expired` | boolean | yes | Whether this token is past its own expiresAt. Computed by the platform; a revoked token that has not expired is not expired. |
| `revokedAt` | string (date-time) | null | yes | When a person revoked it; null while it is not revoked. A revoked token is refused `UNAUTHENTICATED`. |
| `lastUsedAt` | string (date-time) | null | yes | When it last authenticated a request; null if never. |
| `createdAt` | string (date-time) | yes | When it was minted. |

#### `TokenList`

The project’s delegated tokens — revoked and expired ones included.

#### `UserSummary`

A person, by name.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes | Their user id. |
| `displayName` | string | yes | Their name, as CWL gave it. |

#### `ValidateSpecRequest`

Which commit’s manifest.yaml to validate; `{}` validates `main`’s head.

| Field | Type | Required | Notes |
|---|---|---|---|
| `commitSha` | string | — | Defaults to the repository’s HEAD. |

---

# Part 4 — Every refusal code

**111 codes.** Every error carries a stable `code`, a `message` written for a
person, and a `hint` saying what to do about it. The contract says of the message:
*"For a person. Never parse it; switch on `code`."*

Two carry extra structure a design should use: `RELEASE_PRODUCTION_GATE_UNAVAILABLE` carries the
whole launch checklist, and `TOKEN_ACTION_PENDING` carries the question a human must answer.

`AI_BACKEND_UNAVAILABLE` · `AI_CATALOGUE_DISABLED` · `AI_CATALOGUE_EMPTY` · `AI_KEY_EXPIRED` · `AI_KEY_REVOKED` · `AI_MODEL_NOT_PERMITTED` · `AI_MODEL_UNKNOWN` · `AI_PROJECT_BUDGET_EXCEEDED` · `AI_ROUTE_NOT_PERMITTED` · `AI_UNMAPPED` · `AI_USER_BUDGET_EXCEEDED` · `APPROVAL_PREVIEW_EXPIRED` · `APPROVAL_PREVIEW_REQUIRED` · `APPROVAL_PREVIEW_STALE` · `BLUEPRINT_NOT_FOUND` · `CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED` · `CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH` · `CONFIG_GITHUB_FAKE_OUTSIDE_DEVELOPMENT` · `CONFIG_GITHUB_INSECURE_URL` · `CONFIG_INVALID` · `CONFIG_LITELLM_MASTER_KEY_REQUIRED` · `CONFIG_MASTER_SECRET_REQUIRED` · `CREDENTIAL_AMBIGUOUS` · `CSRF_ORIGIN_REFUSED` · `DOC_NOT_FOUND` · `EVENTS_UPGRADE_REQUIRED` · `FORBIDDEN` · `IDEMPOTENCY_KEY_REQUIRED` · `IDEMPOTENCY_KEY_REUSED` · `INTERNAL` · `LAUNCH_RECORD_INVALID` · `LAUNCH_TRANSITION_INVALID` · `MEMBER_USER_NOT_FOUND` · `NOT_FOUND` · `PENDING_ACTION_RESOLVED` · `PROJECT_LAST_OWNER` · `RATE_LIMITED` · `REHEARSAL_DEPLOY_FAILED` · `REHEARSAL_LAUNCHED` · `REHEARSAL_NOT_CWL` · `REHEARSAL_NO_CANDIDATE` · `RELEASE_AI_BUDGET_MISSING` · `RELEASE_AI_DISABLED` · `RELEASE_BLUEPRINT_NOT_FOUND` · `RELEASE_BUILD_NOT_DEPLOYABLE` · `RELEASE_BUILD_NOT_FOUND` · `RELEASE_DIGEST_MISSING` · `RELEASE_DIGEST_NOT_APPROVED` · `RELEASE_ENVIRONMENT_NOT_FOUND` · `RELEASE_IMAGE_REPOSITORY_MISSING` · `RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER` · `RELEASE_MODEL_CLASSIFICATION_TOO_LOW` · `RELEASE_MODEL_NOT_IN_CATALOGUE` · `RELEASE_MODEL_UNCLASSIFIED` · `RELEASE_NOT_FOUND` · `RELEASE_NOT_STAGED` · `RELEASE_PRODUCTION_GATE_UNAVAILABLE` · `RELEASE_PROJECT_NOT_FOUND` · `RELEASE_REESCALATED` · `RELEASE_SECRET_NOT_SET` · `REQUEST_BODY_TOO_LARGE` · `REQUEST_INVALID` · `REQUEST_MEDIA_TYPE_UNSUPPORTED` · `ROUTE_NOT_FOUND` · `SAML_ASSERTION_REJECTED` · `SAML_LOGIN_NOT_BOUND` · `SAML_LOGOUT_REJECTED` · `SAML_NO_PUID` · `SAML_STEP_UP_NO_SESSION` · `SAML_STEP_UP_WRONG_USER` · `SAML_USER_UPSERT_FAILED` · `SECRET_NAME_RESERVED` · `SLUG_INVALID` · `SLUG_RESERVED` · `SLUG_TAKEN` · `SOURCE_COMMIT_NOT_FOUND` · `SOURCE_CONFLICT` · `SOURCE_FILE_NOT_TEXT` · `SOURCE_FILE_TOO_LARGE` · `SOURCE_GITHUB_KEY_UNREADABLE` · `SOURCE_GITHUB_REFUSED` · `SOURCE_GIT_FAILED` · `SOURCE_INVALID_SLUG` · `SOURCE_NOTHING_TO_COMMIT` · `SOURCE_PATH_CONFLICT` · `SOURCE_PATH_ESCAPE` · `SOURCE_PATH_NOT_A_FILE` · `SOURCE_PATH_NOT_FOUND` · `SOURCE_PROVIDER_MISMATCH` · `SOURCE_REF_NOT_FOUND` · `SOURCE_REPOSITORY_EXISTS` · `SOURCE_REPOSITORY_NOT_PRIVATE` · `SOURCE_REPOSITORY_PUBLIC` · `SOURCE_SECRET_DETECTED` · `SOURCE_UNREACHABLE` · `SPEC_INVALID` · `SPEC_NOT_FOUND` · `STARTER_NOT_FOUND` · `STEP_UP_REQUIRED` · `TOKEN_ACTION_PENDING` · `TOKEN_ACTION_REJECTED` · `TOKEN_ALREADY_MINTED` · `TOKEN_CAPABILITY_FORBIDDEN` · `TOKEN_CREDENTIAL_REFUSED` · `TOKEN_PERSON_ONLY` · `UNAUTHENTICATED` · `WEBHOOKS_NOT_CONFIGURED` · `WEBHOOK_PAYLOAD_INVALID` · `WEBHOOK_SIGNATURE_INVALID` · `WEBHOOK_SIGNATURE_MALFORMED` · `WEBHOOK_SIGNATURE_MISSING`

---

# Part 5 — Every event type

**37 types.** Each one arrives on the project's live WebSocket and carries a
faculty-legible sentence alongside its machine detail. **Use the sentence** — it was written
for exactly this.

`ai.key_rotated` · `app_secret.cleared` · `app_secret.set` · `build.failed` · `build.started` · `build.succeeded` · `iam_registration.recorded` · `incident.opened` · `instance.failed` · `instance.healthy` · `instance.provisioning` · `instance.retire_failed` · `instance.retired` · `instance.retiring` · `instance.starting` · `pending_action.confirmed` · `pending_action.created` · `pending_action.rejected` · `privacy_assessment.recorded` · `project.created` · `project.launched` · `rehearsal.completed` · `release.approval_rejected` · `release.approved` · `repository.committed` · `repository.history_rewritten` · `repository.protection_unavailable` · `repository.pushed` · `repository.scan_incomplete` · `repository.secret_detected` · `repository.secret_refused` · `repository.seeded` · `repository.visibility_enforced` · `spec.validated` · `sso.acs_changed` · `sso.registered` · `token.minted`

---

# Part 6 — Realistic fixture data

This is the data `manifest-mock` serves. It is hand-written, and held honest by two
independent things: the TypeScript compiler against the generated types, and a JSON Schema
validator against the published contract. **The ids are real UUIDs and the timestamps are
fixed instants**, both deliberately.

**Use these values in a prototype** rather than inventing your own: a design built on a shape
the API does not produce breaks on contact with the real thing, and that is the failure this
whole handover exists to prevent.

```typescript
import type { Schemas } from '@manifest/contract'

/**
 * Hand-written and held honest by two independent things (Decision 10): `tsc` against the
 * generated types, and `ajv` against the document in `validate.test.ts`. Neither alone is
 * enough — `tsc` cannot see `additionalProperties: false`, a `format` or a `pattern`, and
 * every representation in this document carries them.
 *
 * THE IDS ARE REAL UUIDs. The document's uuid `pattern` refuses `"project-1"`, and a
 * fixture that fails it fails in a way that reads like a mock defect rather than a fixture
 * one. The timestamps are FIXED INSTANTS, not `new Date()`: a fixture whose value changes
 * per run cannot be asserted against — with ONE exception, which `HOURS_FROM_NOW` below
 * states and justifies: a DEADLINE means nothing except relative to now, and a fixed one
 * had already lapsed by the time a person opened the screen it exists for.
 *
 * WHAT IS NOT HERE IS AS DELIBERATE AS WHAT IS. There is no fixture for anything the
 * platform does not send — the mock's whole exposure is that it is a fixture that can lie
 * (Decision 10), and a client developed against an invented field breaks on the real API
 * with every gate green.
 */

const ISO = '2026-09-18T09:00:00.000Z'
const COMMIT = '5f3c1b8e2a4d6f7c9b0e1a2d3c4b5a6978e9f0a1'

export const USER_ID = '11111111-1111-4111-8111-111111111111'
export const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
export const SANDBOX_ID = '33333333-3333-4333-8333-333333333331'
export const STAGING_ID = '33333333-3333-4333-8333-333333333332'
export const PRODUCTION_ID = '33333333-3333-4333-8333-333333333333'
export const BUILD_ID = '44444444-4444-4444-8444-444444444444'
export const RELEASE_ID = '55555555-5555-4555-8555-555555555555'
export const INSTANCE_ID = '66666666-6666-4666-8666-666666666666'
export const TOKEN_ID = '77777777-7777-4777-8777-777777777777'
export const PENDING_ACTION_ID = '88888888-8888-4888-8888-888888888881'
export const CONFIRMED_ACTION_ID = '88888888-8888-4888-8888-888888888882'
export const REJECTED_ACTION_ID = '88888888-8888-4888-8888-888888888883'
export const LAPSED_ACTION_ID = '88888888-8888-4888-8888-888888888884'
export const INCIDENT_ID = '99999999-9999-4999-8999-999999999999'
export const APP_SPEC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const STUDENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const APPROVAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
export const APPROVAL_PREVIEW_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
export const WITHHELD_PREVIEW_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
export const UNAVAILABLE_PREVIEW_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3'

export const ME: Schemas['Me'] = {
  id: USER_ID,
  puid: 'ins000001',
  displayName: 'Instructor One',
  email: 'instructor@example.test',
  role: 'member',
}

/** `MANIFEST_MOCK_ROLE=admin` is what makes §26's fleet reachable (Task 9's affordance). */
export const ADMIN_ME: Schemas['Me'] = { ...ME, role: 'admin' }

/**
 * `owner` IS `UserSummary`, WHICH IS `{ id, displayName }` AND NOTHING ELSE. The plan's own
 * snippet gave it a `puid` and was `TS2353`; it would have failed the Ajv check too
 * (measured at the close of sitting 7, and again here).
 *
 * `Audience` requires FIVE fields — `scale`, `burst`, `justification`, `setBy`, `setAt` —
 * and `setBy` is a `uuid`, not a display name.
 */
export const AUDIENCE: Schemas['Audience'] = {
  scale: 'class',
  burst: 'synchronised',
  justification: 'one lab section, all submitting in the same hour',
  setBy: USER_ID,
  setAt: ISO,
}

const ENVIRONMENT = (
  id: string,
  kind: Schemas['Environment']['kind'],
  instance: Schemas['Environment']['instance'],
): Schemas['Environment'] => ({
  id,
  projectId: PROJECT_ID,
  kind,
  hostname:
    kind === 'production'
      ? 'mock-app.manifest.internal'
      : `mock-app.${kind}.manifest.internal`,
  url:
    kind === 'production'
      ? 'https://mock-app.manifest.internal'
      : `https://mock-app.${kind}.manifest.internal`,
  instance,
})

/**
 * §11's states as the console renders them. `lastSeenAt` is `null` until the instance has
 * been probed — a deploy's answer carries no reading yet.
 */
export const INSTANCE: Schemas['Instance'] = {
  id: INSTANCE_ID,
  environmentId: STAGING_ID,
  releaseId: RELEASE_ID,
  kind: 'web',
  state: 'healthy',
  lastSeenAt: ISO,
}

/**
 * `MANIFEST_MOCK_FAIL=1`'s ending. **A deploy that never becomes ready is a `200` whose
 * `state` is `failed`** (P4b Task 13) — so the mock must answer 200 here too, or a client
 * that switches on the HTTP status passes against the mock and fails against the platform.
 */
export const FAILED_INSTANCE: Schemas['Instance'] = {
  ...INSTANCE,
  state: 'failed',
  lastSeenAt: null,
}

export const ENVIRONMENTS: Schemas['EnvironmentList'] = [
  ENVIRONMENT(SANDBOX_ID, 'sandbox', null),
  ENVIRONMENT(STAGING_ID, 'staging', INSTANCE),
  ENVIRONMENT(PRODUCTION_ID, 'production', null),
]

export const STAGING: Schemas['Environment'] = ENVIRONMENTS[1]!

export const PROJECT: Schemas['Project'] = {
  id: PROJECT_ID,
  slug: 'mock-app',
  blueprint: 'node-ts-mongo@1',
  starter: 'proof-app',
  owner: { id: ME.id, displayName: ME.displayName },
  audience: AUDIENCE,
  createdAt: ISO,
  launchedAt: null,
  // D5's DRIVER 2, on a FREE organisation (the D5 plan's Task 12): GitHub would not protect a
  // private repository's main there, so the console's warning is what a front-end developer
  // sees against the mock — the case that must never be hidden.
  repository: {
    provider: 'github',
    fullName: 'manifest-apps/mock-app',
    webUrl: 'https://github.com/manifest-apps/mock-app',
    mainProtected: false,
    protectionDetail:
      'Upgrade to GitHub Pro or make this repository public to enable this feature.',
    visibility: 'private',
  },
}

/** What `?expand=environments` adds (D23.1) — the project screen always asks for it. */
export const PROJECT_EXPANDED: Schemas['Project'] = {
  ...PROJECT,
  environments: ENVIRONMENTS,
}

export const PROJECTS: Schemas['ProjectList'] = [PROJECT]

/**
 * The proof-app starter's manifest sets `ai.budget.per_user_monthly_usd: 1`, so its validation
 * is valid AND carries the platform's warning (Spec action 4) — in the platform's words, so a
 * front end built against the mock shows warnings where the platform will send them.
 */
export const SPEC_VALIDATION: Schemas['SpecValidation'] = {
  appSpecId: APP_SPEC_ID,
  commitSha: COMMIT,
  valid: true,
  errors: [],
  warnings: [
    {
      code: 'SPEC_FIELD_NOT_ENFORCED',
      path: 'ai.budget.per_user_monthly_usd',
      message:
        '$1/month per person is validated and recorded with the release, and not enforced before Phase 4 (§10): no single person is limited by it yet',
      hint: 'Nothing to fix. What limits the app’s AI spending today is ai.budget.project_monthly_usd; keep this value if you mean it — it applies once Manifest enforces it.',
    },
  ],
  sensitiveDiff: { sensitive: false, fields: [] },
}

export const CREATED_PROJECT: Schemas['CreatedProject'] = {
  ...PROJECT,
  environments: ENVIRONMENTS,
  spec: SPEC_VALIDATION,
}

export const SPEC: Schemas['Spec'] = {
  appSpecId: APP_SPEC_ID,
  commitSha: COMMIT,
  spec: {
    schemaVersion: 1,
    name: 'mock-app',
    blueprint: 'node-ts-mongo@1',
    runtime: { port: 3000, health: '/healthz' },
    auth: { provider: 'cwl' },
  },
}

export const SLUG_AVAILABLE: Schemas['SlugCheck'] = { slug: 'free-name', available: true }

export const SLUG_TAKEN: Schemas['SlugCheck'] = {
  slug: 'mock-app',
  available: false,
  reasons: [
    {
      code: 'SLUG_TAKEN',
      message: 'a project already has this name',
      hint: 'Pick another name, or ask its owner to add you.',
    },
  ],
}

export const BLUEPRINT: Schemas['Blueprint'] = {
  ref: 'node-ts-mongo@1',
  name: 'node-ts-mongo',
  majorVersion: 1,
  language: 'javascript',
  defaultPort: 3000,
  healthPath: '/healthz',
  schemaVersions: [1],
  provides: { services: ['mongodb'], authProviders: ['cwl', 'none'], ai: true },
  starters: [
    {
      name: 'proof-app',
      summary: 'A note-taking app with CWL sign-in and an AI answer.',
    },
  ],
}

export const BLUEPRINTS: Schemas['BlueprintList'] = [BLUEPRINT]

export const KNOWLEDGE_PACK: Schemas['KnowledgePack'] = {
  blueprint: 'node-ts-mongo@1',
  files: [
    {
      path: 'AGENTS.md',
      mediaType: 'text/markdown',
      // The REAL hex SHA-256 of `content` as UTF-8, computed rather than invented: the
      // document constrains only the pattern `^[0-9a-f]{64}$`, so a made-up 64 hex
      // characters would pass Ajv and lie about what the field means. D25's whole point is
      // that an agent can check the pack it was given.
      sha256: '4d317e4afc0985b29e61c8110f1b1e4c8070073bf21c8319e86a3bc89161b889',
      content: '# Writing a manifest.yaml for node-ts-mongo@1\n',
    },
  ],
}

export const SCAN: Schemas['ScanSummary'] = {
  scanner: 'grype v0.118.0',
  scannedAt: ISO,
  databaseAgeDays: 3,
  stale: false,
  baseImageKnown: true,
  fixable: { critical: 0, high: 0 },
  unfixable: { critical: 0, high: 2 },
  baseImage: { critical: 4, high: 14 },
  unfixableFindings: [
    { id: 'GHSA-xxxx-yyyy-zzzz', severity: 'High', package: 'example@1.0.0' },
  ],
}

/**
 * THE BUILD AS IT IS WHEN `POST …/builds` ANSWERS `202`: `running`, with no digest
 * (Rich's R6, P5a Task 13). Its own answer is never final.
 */
export const BUILD_RUNNING: Schemas['Build'] = {
  id: BUILD_ID,
  projectId: PROJECT_ID,
  commitSha: COMMIT,
  status: 'running',
  imageDigest: null,
  error: null,
  scan: null,
  createdAt: ISO,
}

export const BUILD: Schemas['Build'] = {
  ...BUILD_RUNNING,
  status: 'succeeded',
  imageDigest: 'sha256:9b2c1d0e3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4',
  scan: SCAN,
}

export const BUILDS: Schemas['BuildList'] = [BUILD]

/**
 * ONE LINE PER `seq`, SHARED BY THE READ AND THE STREAM. `script.ts` sends these as
 * `LogFrame`s and `BUILD_LOG` carries the first two as already-stored lines, so a console
 * merging `getBuildLog` with the live frames by `seq` sees ONE log rather than two
 * spellings of the same line — which is what the platform gives it, and what the first
 * browser walk of this mock did not (both halves said `#1` and disagreed about the rest).
 */
export const LOG_LINES = [
  '#1 [internal] load build definition from Dockerfile',
  '#1 transferring dockerfile: 892B done',
  '#1 DONE 0.1s',
  '#2 [internal] load metadata for 127.0.0.1:7107/base/node:22-alpine',
  '#2 DONE 0.3s',
  '#3 [1/8] FROM 127.0.0.1:7107/base/node:22-alpine',
  '#3 DONE 0.0s',
  '#4 [internal] load build context',
  '#4 transferring context: 41.2kB done',
  '#5 [2/8] WORKDIR /app',
  '#6 [3/8] COPY package.json package-lock.json ./',
  '#7 [4/8] RUN npm ci --omit=dev',
  '#7 added 135 packages in 6s',
  '#7 DONE 6.4s',
  '#8 [5/8] COPY . .',
  '#9 [6/8] RUN addgroup -g 10001 app && adduser -D -u 10001 -G app app',
  '#10 [7/8] USER 10001',
  '#11 exporting to image',
  '#12 pushing layers to 127.0.0.1:7107/local/mock-app',
  '#12 DONE 2.1s',
]

/**
 * `BuildLog` IS THE ONLY SOURCE OF LINES WRITTEN BEFORE A SOCKET OPENED: `LogFrame` is
 * never replayed (P5c sitting 5, F1). A mock whose stream replayed log lines would be
 * scripting something the platform cannot do, so this read carries them and `script.ts`
 * sends only the ones written after the subscription.
 */
export const BUILD_LOG: Schemas['BuildLog'] = {
  buildId: BUILD_ID,
  lines: LOG_LINES.slice(0, 2).map((text, i) => ({
    seq: i + 1,
    stream: 'stdout' as const,
    text,
    at: ISO,
  })),
}

const ENV_CONFIG = {
  port: 3000,
  health: '/healthz',
  resources: { cpu: 1, memory: '512Mi', pids: 64, disk: '1Gi' },
  services: [{ type: 'mongodb', version: '7.0', name: 'db' }],
  egressAllow: [],
  classification: 'low',
  // §9's FRIENDLY NAMES, the ones `sso/attributes.ts` maps to OIDs — the Manifest IdP
  // releases those seven and nothing else, so a fixture asking for `displayName` described
  // an app whose sign-in could never carry it (P6a sitting 10).
  auth: { provider: 'cwl' as const, attributes: ['ubcEduCwlPuid', 'mail', 'givenName'] },
  ai: { models: ['default-chat'] },
  envNames: ['MONGODB_URI', 'SESSION_SECRET', 'SAML_ENTRY_POINT'],
}

/**
 * A RELEASE NAMES ITS ENV VARS AND NEVER THEIR VALUES (P5a Decision 22). `envNames` is the
 * whole of what a client may see; the values reach the container through §8's injection and
 * stop there.
 */
export const RELEASE: Schemas['Release'] = {
  id: RELEASE_ID,
  projectId: PROJECT_ID,
  buildId: BUILD_ID,
  appSpecId: APP_SPEC_ID,
  imageDigest: BUILD.imageDigest as string,
  summary: 'first release',
  createdBy: USER_ID,
  createdAt: ISO,
  scan: SCAN,
  config: { sandbox: ENV_CONFIG, staging: ENV_CONFIG, production: ENV_CONFIG },
}

export const RELEASES: Schemas['ReleaseList'] = [RELEASE]

/**
 * §13's approval (P6a Task 10), as a console screen reads it at decision time.
 *
 * **THE SUMMARY IS THE MODEL'S ONE SENTENCE PER CHANGE** (the D5 plan's Task 13): what the
 * screen now lays out under each change line, labelled as the model's — the layout a
 * front-end developer must build. The two states that have NO summary, and that the obvious
 * layout has nowhere to put, are `WITHHELD_APPROVAL_PREVIEW` and `UNAVAILABLE_APPROVAL_PREVIEW`
 * below: validated against the document like every fixture, and never a blank space.
 *
 * THE DIFF AN ADMINISTRATOR READS, ONCE (P6b Task 9): the preview carries it and the approval
 * COPIES it, which is the platform's rule — so the mock's two fixtures share one object rather
 * than two literals that could drift into a preview and a record that disagree.
 */
const APPROVAL_DIFF: Schemas['ApprovalDiff'] = {
  imageDigest: BUILD.imageDigest as string,
  changes: [
    {
      path: 'resources.memory',
      from: '256Mi',
      to: '512Mi',
      summary: 'raised the memory limit from 256Mi to 512Mi',
    },
  ],
  services: ['mongodb@7.0'],
  attributes: ['givenName', 'mail', 'ubcEduCwlPuid'],
  resources: { cpu: 1, memory: '512Mi', disk: '1Gi', pids: 64 },
  summary:
    'The app can hold twice as much in memory, which raises its cost and how much a fault in it can take down with it.',
  summarySource: 'llm',
  summaryWithheldBecause: null,
  summaryExposures: [
    {
      path: 'resources.memory',
      sentence:
        'The app can hold twice as much in memory, which raises its cost and how much a fault in it can take down with it.',
    },
  ],
  // `NullReviewer`'s reason VERBATIM (`launch/review.ts`), which is what `describeVerdict`
  // stores for `not_performed` — the screen renders this sentence as the platform's own,
  // so a paraphrase here would teach a front-end developer a sentence the platform never says.
  review: {
    state: 'not_performed',
    reviewer: 'none',
    detail:
      'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the ' +
      'controls that make that tolerable are containment — default-deny egress, network ' +
      'isolation, least privilege and edge protections (§20).',
  },
  // R4(d) (P6b Task 8). The memory change above IS one of §7's sensitive fields, so this
  // approval names what it was compared with, the field and its note — the note and the
  // coverage sentence VERBATIM from `spec/diff.ts`'s `SECURITY_NOTES` and
  // `releases/approval.ts`'s `COVERAGE_LIMIT`, for the reason the reviewer's is above.
  baselineReleaseId: '88888888-8888-4888-8888-888888888881',
  sensitiveFields: ['resources'],
  security: [
    {
      field: 'resources',
      note: 'More CPU, memory, processes or disk: cost and blast radius rather than data.',
    },
  ],
  coverage:
    'An administrator sees a first launch and any release that changes a sensitive field (§7). ' +
    'A release that changes none reaches production without an administrator, and its code is ' +
    'reviewed by nothing (§13’s residual risk); containment is the control (§20).',
}

/**
 * P6b Task 9's preview — what the approvals screen renders BEFORE the decision. The mock keeps
 * no state (P5c Decision 9), so every take and every read answers this one; its `createdAt` is
 * the fixtures' fixed instant and its `expiresAt` thirty minutes later.
 */
export const APPROVAL_PREVIEW: Schemas['ApprovalPreview'] = {
  id: APPROVAL_PREVIEW_ID,
  releaseId: RELEASE_ID,
  projectId: PROJECT_ID,
  createdBy: USER_ID,
  createdByName: ME.displayName,
  createdAt: ISO,
  expiresAt: new Date(Date.parse(ISO) + 30 * 60 * 1000).toISOString(),
  imageDigest: BUILD.imageDigest as string,
  diff: APPROVAL_DIFF,
}

/**
 * THE MODEL'S ANSWER, WITHHELD (the D5 plan's Task 13): it stated a decision, so the platform
 * stored no summary and named the rule — in `summary.ts`'s `checkExposure` words, verbatim —
 * and never the model's sentence. The screen says so where the summary would be.
 */
export const WITHHELD_APPROVAL_PREVIEW: Schemas['ApprovalPreview'] = {
  ...APPROVAL_PREVIEW,
  id: WITHHELD_PREVIEW_ID,
  diff: {
    ...APPROVAL_DIFF,
    summary: null,
    summarySource: 'withheld',
    summaryWithheldBecause:
      'a sentence states or suggests a decision, a verdict or an approval, which is the administrator’s and the record’s, never the model’s',
    summaryExposures: null,
  },
}

/**
 * Decision 7's state: the model could not be reached. Until the D5 plan's Task 13 this was
 * the served preview, and the reason for it still stands — it is the one a screen is most
 * likely to render wrongly — so it stays in the validated table.
 */
export const UNAVAILABLE_APPROVAL_PREVIEW: Schemas['ApprovalPreview'] = {
  ...APPROVAL_PREVIEW,
  id: UNAVAILABLE_PREVIEW_ID,
  diff: {
    ...APPROVAL_DIFF,
    summary: null,
    summarySource: 'unavailable',
    summaryWithheldBecause: null,
    summaryExposures: null,
  },
}

export const APPROVAL: Schemas['Approval'] = {
  id: APPROVAL_ID,
  releaseId: RELEASE_ID,
  projectId: PROJECT_ID,
  decision: 'approved',
  decidedBy: USER_ID,
  decidedByName: ME.displayName,
  decidedAt: ISO,
  imageDigest: BUILD.imageDigest as string,
  reason: 'the scan is clean and the egress list matches the ticket',
  diff: APPROVAL_DIFF,
  previewId: APPROVAL_PREVIEW_ID,
}

export const INCIDENTS: Schemas['IncidentList'] = {
  environmentId: STAGING_ID,
  incidents: [
    {
      id: INCIDENT_ID,
      instanceId: INSTANCE_ID,
      releaseId: RELEASE_ID,
      exitReason: 'the readiness probe never answered 200',
      logTail: 'Error: connect ECONNREFUSED 127.0.0.1:27017\n',
      failedCheck: 'GET /healthz from inside the edge',
      diffSinceHealthy: 'runtime.health: /healthz → /never-ready',
      createdAt: ISO,
      prompt:
        'The app did not answer its health path. Check runtime.health in manifest.yaml.',
    },
  ],
}

/**
 * §13's checklist, COMPUTED and never stored — THE PLATFORM'S SEVEN ITEMS, in its order and
 * in its words (`launch/readiness.ts`), describing the same moment every other fixture here
 * does: UBC IAM's registration is `active`, the PIA is still `submitted`, the rehearsal
 * passed, the scan is clean and the release is approved. So `ready` is `false` for exactly
 * ONE reason, and a console built against this sees a real action to render on the one
 * item that needs one.
 *
 * **IT CARRIES ALL THREE ITEM STATES, AND BOTH VALUES OF `blocking`.** `met` for what the
 * platform computed or an administrator recorded, `unmet` with NO `builtBy` for the PIA,
 * and `not_built` WITH one for `code-review` — the one NON-blocking item (D33), which a
 * screen must render as harmless rather than as the reason production is refused.
 *
 * This was a three-item illustrative list until P6a Task 17, with `domain` `not_built` here
 * and `met` on the platform; its own comment named Task 17 to reconcile it.
 */
export const LAUNCH_READINESS: Schemas['LaunchReadiness'] = {
  projectId: PROJECT_ID,
  // NOT LAUNCHED, like `PROJECT` (`launchedAt: null`): the first launch's checklist, so the
  // three D9.2 fields read as P6b defines them before a launch (P6b Task 6).
  launched: false,
  ready: false,
  candidateReleaseId: RELEASE_ID,
  baselineReleaseId: null,
  sensitiveFields: [],
  reescalated: false,
  items: [
    {
      id: 'domain',
      title: 'Where the app will live',
      owner: 'project owner',
      blocking: true,
      state: 'met',
      why: 'Canonical hostname only — no action. A custom domain is Phase 2 (§23), and for a CWL app it must be chosen before IAM registration, because the registration carries it.',
    },
    {
      id: 'iam-registration',
      title: 'Registered with UBC IAM',
      owner: 'UBC IAM, recorded by a platform administrator (§9)',
      blocking: true,
      state: 'met',
      why: 'Registered as https://manifest.internal/sp/mock-app/production, active (ticket IAM-2026-0412), releasing 4 attribute(s).',
    },
    {
      id: 'privacy-assessment',
      title: 'Privacy Impact Assessment approved',
      owner: 'UBC Privacy Office, recorded by a platform administrator (§9)',
      blocking: true,
      state: 'unmet',
      why: "The assessment is 'submitted' (ticket PIA-2026-0088) and must be 'approved' before anything goes to production (§9).",
    },
    {
      id: 'rehearsal',
      title: 'Pre-production rehearsal passed',
      owner: 'Manifest',
      blocking: true,
      state: 'met',
      why: "A production-shaped rehearsal passed on 2026-09-20: the app was deployed to its production hostname on the public listener, its Service Provider was registered with production values, and one CWL sign-in completed releasing 3 attribute(s). This proves the SHAPE of the registration — the entityID, the ACS URL, the attribute release and the certificate all work together. It proves nothing about UBC's acceptance of it: the Manifest IdP is not real Shibboleth (D6), and the run against UBC's staging IdP that D21 describes remains an external-track obligation (§9).",
    },
    {
      id: 'scans',
      title: 'Dependency and secret scans clean',
      owner: 'Manifest',
      blocking: true,
      state: 'met',
      why: 'Its secret and lockfile gates passed and no finding it introduced has a published fix. 0 finding(s) with no published fix are recorded on the release (§12).',
    },
    {
      id: 'admin-approval',
      title: 'Release approved by a platform administrator',
      owner: 'platform admin',
      blocking: true,
      state: 'met',
      why: 'Approved by an administrator on 2026-09-20, bound to image digest sha256:9b2c1d0e3f4a…',
    },
    {
      id: 'code-review',
      title: 'Code reviewed for safety',
      owner: 'Manifest',
      blocking: false,
      state: 'not_built',
      builtBy: 'a tracked hardening item (SemgrepReviewer), not a plan',
      why: 'Nothing reviews the code the agent wrote. Manifest reviews manifest.yaml, not code (§13), and that risk is still accepted: the controls that make it tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20). A reviewer interface exists with no implementation behind it (D33, §15), so this item does not block a launch.',
    },
  ],
}

/**
 * A LAUNCHED app's checklist for a SELF-SERVE release (P6b Task 6; the D5 plan's Task 14, F15):
 * nothing sensitive changed since the last approved release, so `admin-approval` is met without
 * an administrator — and the console offers NO link to an approval nobody will make. The
 * `admin-approval` item's title and `why` are `launch/readiness.ts`'s `releaseApprovalItem`
 * words, verbatim, and so is the PIA's, which is approved because a launched app's was.
 */
export const SELF_SERVE_READINESS: Schemas['LaunchReadiness'] = {
  ...LAUNCH_READINESS,
  launched: true,
  ready: true,
  baselineReleaseId: '88888888-8888-4888-8888-888888888881',
  sensitiveFields: [],
  reescalated: false,
  items: LAUNCH_READINESS.items.map((i) =>
    i.id === 'privacy-assessment'
      ? {
          ...i,
          state: 'met' as const,
          why: 'Approved by the UBC Privacy Office on 2026-09-21 (ticket PIA-2026-0088).',
        }
      : i.id === 'admin-approval'
        ? {
            ...i,
            title:
              'Release approved by a platform administrator — only when a sensitive field changed (D9)',
            state: 'met' as const,
            why: 'No sensitive field (§7) changed since the last approved release, so this release goes to production self-serve (D9). Its code is not reviewed: that is §13’s residual risk, and containment is its control (§20).',
          }
        : i,
  ),
}

export const MEMBERS: Schemas['MemberList'] = [
  {
    userId: USER_ID,
    puid: 'ins000001',
    displayName: 'Instructor One',
    email: 'instructor@example.test',
    role: 'owner',
  },
]

export const MEMBER: Schemas['Member'] = {
  userId: STUDENT_ID,
  puid: 'stu000001',
  displayName: 'Student One',
  email: 'student@example.test',
  role: 'collaborator',
}

/** `addMember` answers the one member; `removeMember` answers the whole list (P5b Task 8). */
export const MEMBERS_WITH_STUDENT: Schemas['MemberList'] = [...MEMBERS, MEMBER]

export const TOKEN: Schemas['Token'] = {
  id: TOKEN_ID,
  projectId: PROJECT_ID,
  name: 'the agent that builds this app',
  // THE READ SCHEMA CANNOT CHECK THESE AND THE MINT REQUEST'S CAN. `Token.capabilities` is
  // a bare `array<string>` in the document while `MintTokenRequest.capabilities` is a closed
  // enum of eleven — so `build:run`, which this fixture said until it was checked by hand,
  // is refused by neither `tsc` nor Ajv. `validate.test.ts` holds it to the mint enum
  // instead; the gap itself is a finding about the API (P5c sitting 8).
  capabilities: ['project:read', 'build:create', 'release:deploy'],
  rateLimit: 600,
  expiresAt: '2026-12-18T09:00:00.000Z',
  expired: false,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: ISO,
}

export const TOKENS: Schemas['TokenList'] = [TOKEN]

export const REVOKED_TOKEN: Schemas['Token'] = { ...TOKEN, revokedAt: ISO }

/**
 * THE ONE ANSWER IN THIS API THAT CARRIES A CREDENTIAL, and the read schema has no `secret`
 * field at all (P5b Decision 11) — so a console that showed it twice could not, and this
 * fixture is the only place `secret` appears.
 */
export const MINTED_TOKEN: Schemas['MintedToken'] = {
  token: TOKEN,
  secret: `mft_${TOKEN_ID}_ZmFrZS1zZWNyZXQtZm9yLXRoZS1tb2NrLW9ubHk`,
}

/**
 * A DEADLINE IS THE ONE FIXTURE VALUE THAT MUST NOT BE A FIXED INSTANT, and this file's own
 * rule says the opposite for every other one. Measured in a browser on 2026-09-19: with a
 * fixed `expiresAt`, the queue's only `pending` row had already lapsed by the wall clock, so
 * Decision 8's `displayState` correctly rendered it **expired with no buttons** — and a
 * front-end developer driving the mock could never reach the screen's whole point. The
 * INSTANTS stay fixed (a value that changes per run cannot be asserted); the DEADLINE is
 * computed, because its meaning is entirely relative to now.
 */
const HOURS_FROM_NOW = (hours: number): string =>
  new Date(Date.now() + hours * 3_600_000).toISOString()

export const PENDING_ACTION: Schemas['PendingAction'] = {
  id: PENDING_ACTION_ID,
  projectId: PROJECT_ID,
  tokenId: TOKEN_ID,
  action: 'members:manage',
  state: 'pending',
  method: 'POST',
  path: `/v1/projects/${PROJECT_ID}/members`,
  bodySha256: '0aa6131a7f3b5c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f',
  summary: 'add a member to this project',
  expiresAt: HOURS_FROM_NOW(24),
  createdAt: ISO,
  resolvedAt: null,
  waitingSeconds: 42,
  reason: null,
  consumedAt: null,
}

/** Confirmed and NOT yet retried — the state whose only reader is the *Check* button. */
export const CONFIRMED_ACTION: Schemas['PendingAction'] = {
  ...PENDING_ACTION,
  id: CONFIRMED_ACTION_ID,
  state: 'confirmed',
  resolvedAt: ISO,
  waitingSeconds: 42,
}

export const REJECTED_ACTION: Schemas['PendingAction'] = {
  ...PENDING_ACTION,
  id: REJECTED_ACTION_ID,
  state: 'rejected',
  resolvedAt: ISO,
  reason: 'that student is not on this course',
}

/**
 * A row still stored `pending` whose life ran out — Decision 8's whole case. The screen
 * renders it `expired` with no buttons FROM THE TIMESTAMP, without the boot sweeper having
 * run, which is why this plan gave the sweeper no timer.
 */
export const LAPSED_ACTION: Schemas['PendingAction'] = {
  ...PENDING_ACTION,
  id: LAPSED_ACTION_ID,
  // The same ASK as the others, with a different body: the first draft made this one
  // `quota:set` and left the members path under it, which is a row no agent could have
  // produced — Phase 1 has no quota route at all, so nothing can be refused for that
  // capability. A mock is only useful while every row is one the platform could have written.
  bodySha256: '1bb7242b8f4c6d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70',
  expiresAt: HOURS_FROM_NOW(-2),
}

/** All four states at once, which is what a person answering the queue has to read. */
export const PENDING_ACTIONS: Schemas['PendingActionList'] = [
  PENDING_ACTION,
  CONFIRMED_ACTION,
  REJECTED_ACTION,
  LAPSED_ACTION,
]

export const FLEET: Schemas['Fleet'] = [
  {
    id: PROJECT_ID,
    slug: 'mock-app',
    blueprint: 'node-ts-mongo@1',
    starter: 'proof-app',
    owner: {
      id: USER_ID,
      displayName: 'Instructor One',
      email: 'instructor@example.test',
    },
    audience: AUDIENCE,
    createdAt: ISO,
    slugReserved: false,
    environments: [
      {
        kind: 'staging',
        hostname: 'mock-app.staging.manifest.internal',
        state: 'healthy',
        releaseId: RELEASE_ID,
        imageDigest: BUILD.imageDigest,
        lastDeployAt: ISO,
        latestIncidentAt: null,
      },
    ],
  },
]

/**
 * WHAT `validate.test.ts` READS: `[the schema's name in the document, the value]`. A fixture
 * that is not in this table is not checked — so a value the routing table answers with and
 * this table does not name is exactly the mock lying that Decision 10 is about.
 *
 * `server.ts` names the same schema per route and validates on the way OUT as well, so the
 * two are checked from both ends.
 */
/**
 * §9's two external records (P6a Task 6). **BOTH PRESENT AND BOTH PART-WAY THROUGH**, so a
 * front-end developer sees the states that actually need rendering: a registration UBC IAM
 * has accepted, and a PIA still with the Privacy Office. A fixture with both `approved`
 * would show the console's easy case and hide the one the screen exists for.
 */
export const IAM_REGISTRATION: Schemas['IamRegistration'] = {
  id: '99999999-9999-4999-8999-999999999991',
  projectId: PROJECT_ID,
  // THE MOCK'S OWN PROJECT (`mock-app`), in `sso/entity.ts`'s shapes. These said
  // `chem-labs` — a slug no other fixture uses — so the records screen named one app and
  // the project screen above it another.
  entityId: 'https://manifest.internal/sp/mock-app/production',
  acsUrl: 'https://mock-app.manifest.internal/auth/callback',
  sloUrl: 'https://mock-app.manifest.internal/auth/logout',
  certFingerprint: 'AB:CD:EF:01:23:45',
  certExpiresAt: '2027-03-01T00:00:00.000Z',
  // UBC registered ONE MORE than the release asks for, which is legal — `iam-registration`
  // is met when the request is a SUBSET — and is the case a screen must not render as a
  // mismatch.
  registeredAttributes: ['givenName', 'mail', 'sn', 'ubcEduCwlPuid'],
  // P6b Task 7: no change request outstanding, and registered once — an `active` record's shape.
  requestedAttributes: null,
  registeredAt: '2026-09-15T00:00:00.000Z',
  state: 'active',
  externalTicketRef: 'IAM-2026-0412',
  updatedAt: '2026-09-20T00:00:00.000Z',
}

export const PRIVACY_ASSESSMENT: Schemas['PrivacyAssessment'] = {
  id: '99999999-9999-4999-8999-999999999992',
  projectId: PROJECT_ID,
  state: 'submitted',
  reviewer: 'UBC Privacy Office',
  approvedAt: null,
  externalTicketRef: 'PIA-2026-0088',
  updatedAt: '2026-09-20T00:00:00.000Z',
}

export const LAUNCH_RECORDS: Schemas['LaunchRecords'] = {
  projectId: PROJECT_ID,
  iamRegistration: IAM_REGISTRATION,
  privacyAssessment: PRIVACY_ASSESSMENT,
}

/**
 * D21's rehearsal (P6a Task 14). **IT PASSED, AND IT CARRIES ITS EVIDENCE** — a front-end
 * developer building the launch screen needs the shape of what a passing rehearsal actually
 * says, because the screen's job is to show the measurement rather than a tick: the
 * listener it ran on, the status the sign-in ended on, and the attributes the assertion
 * released against the ones the registration lists.
 */
export const REHEARSAL: Schemas['Rehearsal'] = {
  id: '99999999-9999-4999-8999-999999999993',
  projectId: PROJECT_ID,
  releaseId: RELEASE.id,
  passed: true,
  entityId: 'https://manifest.internal/sp/mock-app/production',
  acsUrl: 'https://mock-app.manifest.internal/auth/callback',
  // What the Service Provider REGISTRATION listed — the release's request, not UBC's list.
  attributes: ['givenName', 'mail', 'ubcEduCwlPuid'],
  evidence: {
    instanceId: INSTANCE.id,
    hostname: 'mock-app.manifest.internal',
    listener: 'public',
    signInStatus: 200,
    attributesReleased: ['givenName', 'mail', 'ubcEduCwlPuid'],
    reason:
      'the sign-in completed: the app answered 200 at its registered ACS and the assertion carried 3 attribute(s)',
  },
  ranAt: '2026-09-20T00:00:00.000Z',
}

/**
 * THE PLATFORM'S ANSWER TO A COMMIT THAT DELETES OR EMPTIES manifest.yaml, word for word (the
 * authoring API plan's Task 11) — measured from the control plane's validator, and pinned on its
 * side by `api/source-commit.test.ts`'s *"the envelope the mock plays"*. A change to either
 * wording must change both. The one invalid manifest this mock can know without a validator.
 */
export const EMPTIED_MANIFEST: Schemas['ErrorEnvelope'] = {
  error: {
    code: 'SPEC_INVALID',
    message: 'the manifest.yaml in this commit is not valid',
    hint: 'Fix each path `details` lists in manifest.yaml, then commit or push again.',
    details: [
      {
        code: 'SPEC_INVALID_VALUE',
        path: '',
        message: 'Expected object, received null',
        hint: 'Check the type and permitted values of this field in §7 of the platform design.',
      },
    ],
  },
}

export const FIXTURES: [string, unknown][] = [
  ['Me', ME],
  ['Me', ADMIN_ME],
  ['Project', PROJECT],
  ['Project', PROJECT_EXPANDED],
  ['ProjectList', PROJECTS],
  ['CreatedProject', CREATED_PROJECT],
  ['SlugCheck', SLUG_AVAILABLE],
  ['SlugCheck', SLUG_TAKEN],
  ['Blueprint', BLUEPRINT],
  ['BlueprintList', BLUEPRINTS],
  ['KnowledgePack', KNOWLEDGE_PACK],
  ['Spec', SPEC],
  ['SpecValidation', SPEC_VALIDATION],
  ['Environment', STAGING],
  ['EnvironmentList', ENVIRONMENTS],
  ['Instance', INSTANCE],
  ['Instance', FAILED_INSTANCE],
  ['Build', BUILD],
  ['Build', BUILD_RUNNING],
  ['BuildList', BUILDS],
  ['BuildLog', BUILD_LOG],
  ['Release', RELEASE],
  ['ReleaseList', RELEASES],
  ['IncidentList', INCIDENTS],
  ['LaunchReadiness', LAUNCH_READINESS],
  ['LaunchReadiness', SELF_SERVE_READINESS],
  ['Member', MEMBER],
  ['MemberList', MEMBERS],
  ['MemberList', MEMBERS_WITH_STUDENT],
  ['Token', TOKEN],
  ['Token', REVOKED_TOKEN],
  ['TokenList', TOKENS],
  ['MintedToken', MINTED_TOKEN],
  ['PendingAction', PENDING_ACTION],
  ['PendingAction', CONFIRMED_ACTION],
  ['PendingAction', REJECTED_ACTION],
  ['PendingAction', LAPSED_ACTION],
  ['PendingActionList', PENDING_ACTIONS],
  ['Fleet', FLEET],
  ['IamRegistration', IAM_REGISTRATION],
  ['PrivacyAssessment', PRIVACY_ASSESSMENT],
  ['LaunchRecords', LAUNCH_RECORDS],
  ['Rehearsal', REHEARSAL],
  // MISSING UNTIL P6a TASK 17: `server.ts` answers three operations with this fixture and
  // this table never named it, so Ajv checked it only on the way OUT of a request — which is
  // exactly the check this table exists to make without one.
  ['Approval', APPROVAL],
  ['ApprovalPreview', APPROVAL_PREVIEW],
  ['ApprovalPreview', WITHHELD_APPROVAL_PREVIEW],
  ['ApprovalPreview', UNAVAILABLE_APPROVAL_PREVIEW],
  ['ErrorEnvelope', EMPTIED_MANIFEST],
]
```
