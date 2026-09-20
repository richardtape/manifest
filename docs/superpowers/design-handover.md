# Manifest — design handover

> **This file is GENERATED and self-contained.** It exists so a design agent with no access
> to the Manifest repository has everything it needs in one place. **Do not edit it** —
> edit its sources and regenerate with `node scripts/design-handover.mjs`.
>
> | | |
> |---|---|
> | Generated | 2026-09-19, from commit `45e5b9d` |
> | Sources | `docs/superpowers/plans/2026-09-19-interface-design-brief.md`, `packages/contract/openapi.json` (v1.0.0), `packages/mock/src/fixtures.ts` |
> | Contents | the design brief (part 1), the API surface (2), every object shape (3), every refusal code (4), every event type (5), and realistic fixture data (6) |
>
> **Part 1 is the brief and is the part to read first.** Parts 2–6 are reference: skim them,
> then come back when you need a specific shape or a real value.

---

# Part 1 — The design brief

# Interface design brief — the two surfaces people actually use

*Written 2026-09-19 for a design agent with no prior context. Everything here is read from the
spec or the code at `8d90e15`, not imagined. **Two surfaces are described and they are different
products**; §12 says whether to give them to one agent or two. Read §11 before deciding anything
visual — it names a constraint that may decide your whole direction.*

> **ONE THING TO KNOW UP FRONT.** Rich decided on 2026-09-19 that **both** surfaces get real
> design effort. The spec currently says the admin console is *"rudimentary and deliberately
> so… not a product surface"* (§26, *Scope*). **That one paragraph needs a spec action, proposed
> in §13 and not yet applied.** Nothing else in the spec contradicts this brief, and §22's
> reference console is deliberately unaffected — see §2.

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

## 13. Spec action — PROPOSED, NOT APPLIED

**One paragraph.** §26's *Scope* currently reads:

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

**Do not apply this without Rich's explicit approval.** It is in ORIENTATION §8.


---

# Part 2 — The API surface

**34 operations** at version **1.0.0**, by verb: 23 GET, 9 POST, 2 DELETE.

**Note the absence of `PATCH` and `PUT`.** Nothing in this API is editable — not a
project's name, not its audience, not a quota. That is a real constraint on what an
"edit settings" screen could do today, and it is discussed in the brief's §7.

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
| events | GET | `/v1/projects/{projectId}/events` | `streamProjectEvents` | The project’s event stream (WebSocket) |
| identity | GET | `/v1/me` | `getMe` | The signed-in person |
| launch | GET | `/v1/projects/{projectId}/launch-readiness` | `getLaunchReadiness` | What a first production launch still needs |
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
| tokens | GET | `/v1/projects/{projectId}/tokens` | `listTokens` | A project’s delegated tokens |
| tokens | POST | `/v1/projects/{projectId}/tokens` | `mintToken` | Mint a delegated token |
| tokens | DELETE | `/v1/tokens/{tokenId}` | `revokeToken` | Revoke a delegated token |

---

# Part 3 — Every object shape

**52 schemas.** These are the real published shapes: what a screen
can show is bounded by what is here.

#### `AddMemberRequest`

| Field | Type | Required | Notes |
|---|---|---|---|
| `puid` | string | yes | The person’s ubcEduCwlPuid. They must have signed in once. |
| `role` | `owner` · `collaborator` | yes |  |

#### `Audience`

| Field | Type | Required | Notes |
|---|---|---|---|
| `scale` | `solo` · `class` · `large_course` · `public` | yes |  |
| `burst` | `steady` · `synchronised` | yes |  |
| `justification` | string | null | yes |  |
| `setBy` | string (uuid) | yes |  |
| `setAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |

#### `AudienceInput`

| Field | Type | Required | Notes |
|---|---|---|---|
| `scale` | `solo` · `class` · `large_course` · `public` | yes | §24: how many people. |
| `burst` | `steady` · `synchronised` | yes | §24: do they all arrive at once. |
| `justification` | string | — |  |

#### `Blueprint`

A blueprint as a client chooses one: what it provides and the starters it offers. Never its base image or build internals.

| Field | Type | Required | Notes |
|---|---|---|---|
| `ref` | string | yes | `name@major` — what a project pins (§25). |
| `name` | string | yes |  |
| `majorVersion` | integer | yes |  |
| `language` | string | yes |  |
| `defaultPort` | integer | yes |  |
| `healthPath` | string | yes |  |
| `schemaVersions` | integer[] | yes |  |
| `provides` | object | yes |  |
| `starters` | object[] | yes | §25: what `POST /v1/projects` accepts as `starter` for this blueprint. |

#### `BlueprintList`

#### `Build`

A build of one commit (§13). It answers `running` when it starts, and ends as `succeeded` or `failed` on the project’s stream (R6).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `projectId` | string (uuid) | yes |  |
| `commitSha` | string | yes |  |
| `status` | `pending` · `running` · `succeeded` · `failed` | yes |  |
| `imageDigest` | string | null | yes | `sha256:…` once the build has succeeded; the image a release names. |
| `error` | string | null | yes | Why a failed build failed, in words its author can act on (§14). |
| `scan` | [ScanSummary] | null | yes | Null until the build succeeds, and for a build from before scans were recorded. |
| `createdAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |

#### `BuildList`

#### `BuildLog`

§14’s build log, as stored.

| Field | Type | Required | Notes |
|---|---|---|---|
| `buildId` | string (uuid) | yes |  |
| `lines` | object[] | yes |  |

#### `ControlFrame`

Ends the replay: everything after it is live.

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `control` | yes |  |
| `id` | string | yes |  |
| `projectId` | string (uuid) | yes |  |
| `type` | `manifest.stream.ready` | yes |  |

#### `CreateProjectRequest`

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes | Checked by the same function as GET /v1/slugs/{slug} (§23). |
| `blueprint` | string | yes | `name@major`, from GET /v1/blueprints. |
| `starter` | string | — | One the blueprint offers. Without one: the skeleton and a minimal manifest. |
| `audience` | [AudienceInput] | yes |  |

#### `CreateReleaseRequest`

| Field | Type | Required | Notes |
|---|---|---|---|
| `buildId` | string (uuid) | yes |  |
| `summary` | string | — |  |

#### `CreatedProject`

§22 steps 2–3: the project, its environments, and the validation of the manifest its first commit carries.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `slug` | string | yes | The project’s name, and the first label of every hostname it has (§23). |
| `blueprint` | string | yes | `name@major` (§25). |
| `starter` | string | null | yes | The starter the first commit was seeded from (§25); null for the skeleton alone. |
| `owner` | [UserSummary] | yes |  |
| `audience` | [Audience] | null | yes |  |
| `createdAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |
| `environments` | [Environment][] | yes |  |
| `spec` | [SpecValidation] | yes |  |

#### `DeployRequest`

| Field | Type | Required | Notes |
|---|---|---|---|
| `releaseId` | string (uuid) | yes |  |

#### `EmptyRequest`

#### `Environment`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `projectId` | string (uuid) | yes |  |
| `kind` | `sandbox` · `staging` · `production` | yes |  |
| `hostname` | string | yes | §23: `<slug>.<zone for this kind>`. Permanent. |
| `url` | string (uri) | yes |  |
| `instance` | [Instance] | null | yes | The instance the hostname reaches (§6 Route); for an app deployed before P4c, its newest instance. Null before any deploy. |

#### `EnvironmentList`

#### `ErrorCode`

Every code the API answers with (api/error-codes.ts). Stable: a client switches on it (§20).

One of: `AI_BACKEND_UNAVAILABLE` · `AI_CATALOGUE_DISABLED` · `AI_CATALOGUE_EMPTY` · `AI_KEY_EXPIRED` · `AI_KEY_REVOKED` · `AI_MODEL_NOT_PERMITTED` · `AI_MODEL_UNKNOWN` · `AI_PROJECT_BUDGET_EXCEEDED` · `AI_ROUTE_NOT_PERMITTED` · `AI_UNMAPPED` · `AI_USER_BUDGET_EXCEEDED` · `BLUEPRINT_NOT_FOUND` · `CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED` · `CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH` · `CONFIG_INVALID` · `CONFIG_LITELLM_MASTER_KEY_REQUIRED` · `CONFIG_MASTER_SECRET_REQUIRED` · `CREDENTIAL_AMBIGUOUS` · `CSRF_ORIGIN_REFUSED` · `EVENTS_UPGRADE_REQUIRED` · `FORBIDDEN` · `IDEMPOTENCY_KEY_REQUIRED` · `IDEMPOTENCY_KEY_REUSED` · `INTERNAL` · `MEMBER_USER_NOT_FOUND` · `NOT_FOUND` · `PENDING_ACTION_RESOLVED` · `PROJECT_LAST_OWNER` · `RATE_LIMITED` · `RELEASE_AI_BUDGET_MISSING` · `RELEASE_AI_DISABLED` · `RELEASE_BLUEPRINT_NOT_FOUND` · `RELEASE_BUILD_NOT_DEPLOYABLE` · `RELEASE_BUILD_NOT_FOUND` · `RELEASE_DIGEST_MISSING` · `RELEASE_ENVIRONMENT_NOT_FOUND` · `RELEASE_IMAGE_REPOSITORY_MISSING` · `RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER` · `RELEASE_MODEL_CLASSIFICATION_TOO_LOW` · `RELEASE_MODEL_NOT_IN_CATALOGUE` · `RELEASE_MODEL_UNCLASSIFIED` · `RELEASE_NOT_FOUND` · `RELEASE_PRODUCTION_GATE_UNAVAILABLE` · `RELEASE_PROJECT_NOT_FOUND` · `REQUEST_BODY_TOO_LARGE` · `REQUEST_INVALID` · `REQUEST_MEDIA_TYPE_UNSUPPORTED` · `ROUTE_NOT_FOUND` · `SAML_ASSERTION_REJECTED` · `SAML_LOGIN_NOT_BOUND` · `SAML_LOGOUT_REJECTED` · `SAML_NO_PUID` · `SAML_USER_UPSERT_FAILED` · `SLUG_INVALID` · `SLUG_RESERVED` · `SLUG_TAKEN` · `SOURCE_FOREIGN_REPO` · `SOURCE_GIT_FAILED` · `SOURCE_INVALID_SLUG` · `SOURCE_PATH_ESCAPE` · `SPEC_INVALID` · `SPEC_NOT_FOUND` · `STARTER_NOT_FOUND` · `TOKEN_ACTION_PENDING` · `TOKEN_ACTION_REJECTED` · `TOKEN_CAPABILITY_FORBIDDEN` · `TOKEN_CREDENTIAL_REFUSED` · `UNAUTHENTICATED`

#### `ErrorEnvelope`

| Field | Type | Required | Notes |
|---|---|---|---|
| `error` | object | yes |  |

#### `EventFrame`

An audit Event, as recorded (§20) and redacted at capture (§14). Switch on `type`; each type has one `machineDetail` shape. Replayed on reconnect.

21 variants: object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object | object

#### `Fleet`

§26’s fleet, administrators only. Not yet: department, custom domains, AI spend this month.

#### `Incident`

A failed deploy, as §14 records it: how it ended, what the platform checked, what the app printed, and what changed since it last worked.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `instanceId` | string (uuid) | yes |  |
| `releaseId` | string (uuid) | yes |  |
| `exitReason` | string | yes |  |
| `logTail` | string | yes | The last 200 lines, redacted at capture (§14). |
| `failedCheck` | string | yes |  |
| `diffSinceHealthy` | string | yes |  |
| `createdAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |
| `prompt` | string | yes | §14: shaped to be handed straight to an agent as a repair request. |

#### `IncidentList`

One environment’s Incidents, newest first.

| Field | Type | Required | Notes |
|---|---|---|---|
| `environmentId` | string (uuid) | yes |  |
| `incidents` | [Incident][] | yes |  |

#### `Instance`

A running (or once-running) copy of a release in one environment (§11). Never its driver or handle.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `environmentId` | string (uuid) | yes |  |
| `releaseId` | string (uuid) | yes |  |
| `kind` | `web` · `worker` · `cron` | yes |  |
| `state` | `pending` · `building` · `provisioning` · `starting` · `healthy` · `failed` · `hibernated` · `waking` · `destroying` · `gone` | yes |  |
| `lastSeenAt` | string (date-time) | null | yes |  |

#### `KnowledgePack`

D25: the files that teach an agent to write a valid manifest.yaml and wire the blueprint, versioned with it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `blueprint` | string | yes |  |
| `files` | object[] | yes |  |

#### `LaunchReadiness`

§13’s first-launch checklist, computed from what exists. Read-only in Phase 1; Phase 2 gates on it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | string (uuid) | yes |  |
| `ready` | boolean | yes |  |
| `candidateReleaseId` | string (uuid) | null | yes |  |
| `items` | [LaunchReadinessItem][] | yes |  |

#### `LaunchReadinessItem`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `domain` · `iam-registration` · `privacy-assessment` · `rehearsal` · `scans` · `admin-approval` · `load-rehearsal` | yes |  |
| `title` | string | yes |  |
| `owner` | string | yes |  |
| `blocking` | boolean | yes |  |
| `state` | `met` · `unmet` · `not_built` | yes | `not_built`: Manifest does not track this yet; `builtBy` names the plan. |
| `why` | string | yes |  |
| `builtBy` | string | — |  |

#### `LogFrame`

One line of a build’s output, as it is written. Never replayed — GET /v1/builds/{buildId}/logs has them all.

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `log` | yes |  |
| `id` | string | yes | `<buildId>:<seq>`. |
| `projectId` | string (uuid) | yes |  |
| `buildId` | string (uuid) | yes |  |
| `seq` | integer | yes |  |
| `stream` | `stdout` · `stderr` | yes |  |
| `text` | string | yes | Redacted at capture (§14). |
| `createdAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |

#### `ManifestError`

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | [ManifestErrorCode] | yes |  |
| `path` | string | yes | Where in manifest.yaml, dotted: `services.0.type`. |
| `message` | string | yes |  |
| `hint` | string | — |  |

#### `ManifestErrorCode`

A code inside `details`: §7 schema, §7 policy, or §25 blueprint compatibility.

One of: `BLUEPRINT_AI_UNSUPPORTED` · `BLUEPRINT_AUTH_UNSUPPORTED` · `BLUEPRINT_SCHEMA_VERSION_UNSUPPORTED` · `BLUEPRINT_SERVICE_UNSUPPORTED` · `SPEC_AI_BUDGET_REQUIRED` · `SPEC_AI_DISABLED` · `SPEC_ATTRIBUTE_NOT_REGISTERED` · `SPEC_ATTRIBUTE_NOT_WHITELISTED` · `SPEC_BUILD_BLOCK_FORBIDDEN` · `SPEC_ENV_NAME_RESERVED` · `SPEC_INVALID_BLUEPRINT_REF` · `SPEC_INVALID_SLUG` · `SPEC_INVALID_VALUE` · `SPEC_MODEL_CLASSIFICATION_TOO_LOW` · `SPEC_MODEL_UNCLASSIFIED` · `SPEC_MODEL_UNKNOWN` · `SPEC_NAME_SLUG_MISMATCH` · `SPEC_PATH_EXPECTED` · `SPEC_QUOTA_EXCEEDED` · `SPEC_RESERVED_BLOCK_NOT_EMPTY` · `SPEC_SERVICE_TYPE_UNKNOWN` · `SPEC_UNKNOWN_KEY` · `SPEC_YAML_PARSE_FAILED`

#### `Me`

The person the session belongs to.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `puid` | string | yes | The person's ubcEduCwlPuid (§9). |
| `displayName` | string | yes |  |
| `email` | string | yes |  |
| `role` | `admin` · `member` | yes | The platform role THIS SESSION is authorized as. |

#### `Member`

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | yes |  |
| `puid` | string | yes |  |
| `displayName` | string | yes |  |
| `email` | string | yes |  |
| `role` | `owner` · `collaborator` | yes |  |

#### `MemberList`

#### `MintTokenRequest`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | A person’s label for it, so a list of tokens is reviewable. |
| `capabilities` | `project:read` · `project:write` · `project:delete` · `members:manage` · `build:create` · `release:create` · `release:deploy` · `release:promote` · `release:approve` · `quota:set` · `secret:read`[] | yes | The explicit set this token may use (D24). None of members:manage, release:promote, quota:set or secret:read: those are refused to a delegated token however it was minted. |
| `expiresInDays` | integer | yes | How long the token lives, in days. D24: a token has an expiry, and at most 365 days of one. |

#### `MintedToken`

A newly minted delegated token, with its secret. The only time the secret exists.

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | [Token] | yes |  |
| `secret` | string | yes | The token, in full: `mft_<id>_<secret>`. Shown ONCE. Store it now — the platform keeps only a hash and cannot show it again. |

#### `PendingAction`

D24: a delegated token asked for one of the privileged four. A person confirms or rejects it; a confirmation grants that one request a single retry.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `projectId` | string (uuid) | yes |  |
| `tokenId` | string (uuid) | yes |  |
| `action` | string | yes | The privileged capability that was refused — one of D24’s four. |
| `state` | `pending` · `confirmed` · `rejected` · `expired` | yes |  |
| `method` | string | yes |  |
| `path` | string | yes |  |
| `bodySha256` | string | yes | SHA-256 of the canonical request body, so a client can match its own. |
| `summary` | string | yes | What was asked for, for the person who answers. |
| `expiresAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |
| `createdAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |
| `resolvedAt` | string (date-time) | null | yes |  |
| `waitingSeconds` | integer | yes | Seconds between the question being asked and it being answered — or, while it is still pending, now. |
| `reason` | string | null | yes |  |
| `consumedAt` | string (date-time) | null | yes |  |

#### `PendingActionList`

The questions agents have put to the people who own this project, newest first (§26).

#### `Project`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `slug` | string | yes | The project’s name, and the first label of every hostname it has (§23). |
| `blueprint` | string | yes | `name@major` (§25). |
| `starter` | string | null | yes | The starter the first commit was seeded from (§25); null for the skeleton alone. |
| `owner` | [UserSummary] | yes |  |
| `audience` | [Audience] | null | yes |  |
| `createdAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |
| `environments` | [Environment][] | — | Present with `?expand=environments` (D23.1). |

#### `ProjectList`

#### `RejectPendingActionRequest`

A person’s refusal of a pending action, in their own words.

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | yes | Why this is refused. The agent is told, verbatim. |

#### `Release`

Immutable: a build, a spec and the configuration resolved for every environment (§13).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `projectId` | string (uuid) | yes |  |
| `buildId` | string (uuid) | yes |  |
| `appSpecId` | string (uuid) | yes |  |
| `imageDigest` | string | yes | What an approval binds to (§13). |
| `summary` | string | null | yes |  |
| `createdBy` | string (uuid) | yes |  |
| `createdAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |
| `scan` | [ScanSummary] | null | yes | §12: its build’s scan, recorded on the Release. |
| `config` | object | yes |  |

#### `ReleaseList`

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

D9. Reported, not yet enforced (P6).

| Field | Type | Required | Notes |
|---|---|---|---|
| `sensitive` | boolean | yes |  |
| `fields` | string[] | yes |  |

#### `SlugCheck`

§23: exactly what project creation will answer — advisory, since creation checks again.

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes |  |
| `available` | boolean | yes |  |
| `reasons` | object[] | — | Present when `available` is false: every reason that applies. |

#### `Spec`

| Field | Type | Required | Notes |
|---|---|---|---|
| `appSpecId` | string (uuid) | yes |  |
| `commitSha` | string | yes |  |
| `spec` | object | yes | manifest.yaml v1 as parsed and validated (§7). Its own JSON Schema is not published in P5a. |

#### `SpecValidation`

| Field | Type | Required | Notes |
|---|---|---|---|
| `appSpecId` | string (uuid) | yes |  |
| `commitSha` | string | yes |  |
| `valid` | boolean | yes |  |
| `errors` | [ManifestError][] | yes |  |
| `sensitiveDiff` | [SensitiveDiff] | yes |  |

#### `StartBuildRequest`

| Field | Type | Required | Notes |
|---|---|---|---|
| `commitSha` | string | — | A full commit id. Defaults to the commit of the newest validated spec. |

#### `StreamFrame`

Every message on WS /v1/projects/{projectId}/events is one of these, as JSON. Switch on `kind`, then `type`.

3 variants: [EventFrame] | [LogFrame] | [ControlFrame]

#### `Token`

A delegated token (D24), scoped to one project and a capability set. Its secret is shown once, when it is minted, and is never readable again.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `projectId` | string (uuid) | yes |  |
| `name` | string | yes |  |
| `capabilities` | string[] | yes |  |
| `rateLimit` | integer | yes | Requests a minute this token may make, enforced in the control plane (§20, P5b Task 9). Past it, every route answers 429 RATE_LIMITED with Retry-After. |
| `expiresAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |
| `expired` | boolean | yes | Whether this token is past its own expiresAt. Computed by the platform; a revoked token that has not expired is not expired. |
| `revokedAt` | string (date-time) | null | yes |  |
| `lastUsedAt` | string (date-time) | null | yes |  |
| `createdAt` | string (date-time) | yes | An instant, ISO 8601 in UTC. |

#### `TokenList`

#### `UserSummary`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | yes |  |
| `displayName` | string | yes |  |

#### `ValidateSpecRequest`

| Field | Type | Required | Notes |
|---|---|---|---|
| `commitSha` | string | — | Defaults to the repository’s HEAD. |

---

# Part 4 — Every refusal code

**68 codes.** Every error carries a stable `code`, a `message` written for a
person, and a `hint` saying what to do about it. The contract says of the message:
*"For a person. Never parse it; switch on `code`."*

Two carry extra structure a design should use: `RELEASE_PRODUCTION_GATE_UNAVAILABLE` carries the
whole launch checklist, and `TOKEN_ACTION_PENDING` carries the question a human must answer.

`AI_BACKEND_UNAVAILABLE` · `AI_CATALOGUE_DISABLED` · `AI_CATALOGUE_EMPTY` · `AI_KEY_EXPIRED` · `AI_KEY_REVOKED` · `AI_MODEL_NOT_PERMITTED` · `AI_MODEL_UNKNOWN` · `AI_PROJECT_BUDGET_EXCEEDED` · `AI_ROUTE_NOT_PERMITTED` · `AI_UNMAPPED` · `AI_USER_BUDGET_EXCEEDED` · `BLUEPRINT_NOT_FOUND` · `CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED` · `CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH` · `CONFIG_INVALID` · `CONFIG_LITELLM_MASTER_KEY_REQUIRED` · `CONFIG_MASTER_SECRET_REQUIRED` · `CREDENTIAL_AMBIGUOUS` · `CSRF_ORIGIN_REFUSED` · `EVENTS_UPGRADE_REQUIRED` · `FORBIDDEN` · `IDEMPOTENCY_KEY_REQUIRED` · `IDEMPOTENCY_KEY_REUSED` · `INTERNAL` · `MEMBER_USER_NOT_FOUND` · `NOT_FOUND` · `PENDING_ACTION_RESOLVED` · `PROJECT_LAST_OWNER` · `RATE_LIMITED` · `RELEASE_AI_BUDGET_MISSING` · `RELEASE_AI_DISABLED` · `RELEASE_BLUEPRINT_NOT_FOUND` · `RELEASE_BUILD_NOT_DEPLOYABLE` · `RELEASE_BUILD_NOT_FOUND` · `RELEASE_DIGEST_MISSING` · `RELEASE_ENVIRONMENT_NOT_FOUND` · `RELEASE_IMAGE_REPOSITORY_MISSING` · `RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER` · `RELEASE_MODEL_CLASSIFICATION_TOO_LOW` · `RELEASE_MODEL_NOT_IN_CATALOGUE` · `RELEASE_MODEL_UNCLASSIFIED` · `RELEASE_NOT_FOUND` · `RELEASE_PRODUCTION_GATE_UNAVAILABLE` · `RELEASE_PROJECT_NOT_FOUND` · `REQUEST_BODY_TOO_LARGE` · `REQUEST_INVALID` · `REQUEST_MEDIA_TYPE_UNSUPPORTED` · `ROUTE_NOT_FOUND` · `SAML_ASSERTION_REJECTED` · `SAML_LOGIN_NOT_BOUND` · `SAML_LOGOUT_REJECTED` · `SAML_NO_PUID` · `SAML_USER_UPSERT_FAILED` · `SLUG_INVALID` · `SLUG_RESERVED` · `SLUG_TAKEN` · `SOURCE_FOREIGN_REPO` · `SOURCE_GIT_FAILED` · `SOURCE_INVALID_SLUG` · `SOURCE_PATH_ESCAPE` · `SPEC_INVALID` · `SPEC_NOT_FOUND` · `STARTER_NOT_FOUND` · `TOKEN_ACTION_PENDING` · `TOKEN_ACTION_REJECTED` · `TOKEN_CAPABILITY_FORBIDDEN` · `TOKEN_CREDENTIAL_REFUSED` · `UNAUTHENTICATED`

---

# Part 5 — Every event type

**21 types.** Each one arrives on the project's live WebSocket and carries a
faculty-legible sentence alongside its machine detail. **Use the sentence** — it was written
for exactly this.

`ai.key_rotated` · `build.failed` · `build.started` · `build.succeeded` · `incident.opened` · `instance.failed` · `instance.healthy` · `instance.provisioning` · `instance.retire_failed` · `instance.retired` · `instance.retiring` · `instance.starting` · `pending_action.confirmed` · `pending_action.created` · `pending_action.rejected` · `project.created` · `repository.seeded` · `spec.validated` · `sso.acs_changed` · `sso.registered` · `token.minted`

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
}

/** What `?expand=environments` adds (D23.1) — the project screen always asks for it. */
export const PROJECT_EXPANDED: Schemas['Project'] = {
  ...PROJECT,
  environments: ENVIRONMENTS,
}

export const PROJECTS: Schemas['ProjectList'] = [PROJECT]

export const SPEC_VALIDATION: Schemas['SpecValidation'] = {
  appSpecId: APP_SPEC_ID,
  commitSha: COMMIT,
  valid: true,
  errors: [],
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
  auth: { provider: 'cwl' as const, attributes: ['puid', 'displayName', 'email'] },
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
 * §13's checklist, COMPUTED and never stored. `ready` is `false` throughout Phase 1,
 * honestly: `scans` is the one item P5a computes and every other says `not_built` and names
 * the plan that builds it.
 */
export const LAUNCH_READINESS: Schemas['LaunchReadiness'] = {
  projectId: PROJECT_ID,
  ready: false,
  candidateReleaseId: RELEASE_ID,
  items: [
    {
      id: 'domain',
      title: 'A domain name',
      owner: 'the platform team',
      blocking: true,
      state: 'not_built',
      why: 'Custom domains are not built in Phase 1.',
      builtBy: 'Phase 2',
    },
    {
      id: 'scans',
      title: 'No fixable Critical or High findings',
      owner: 'the project',
      blocking: true,
      state: 'met',
      why: 'The candidate release’s scan found no fixable Critical or High.',
    },
    {
      id: 'privacy-assessment',
      title: 'A privacy impact assessment',
      owner: 'the faculty member',
      blocking: true,
      state: 'not_built',
      why: 'The PIA workflow is the external track.',
      builtBy: 'the UBC external track',
    },
  ],
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
]
```
