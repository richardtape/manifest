# The administrator's console — a design, and what designing it found

*Written 2026-09-27 by the admin console's design session, **before anything is drawn**, against
contract **v1.3.0** (54 operations, 78 schemas) at `577ad91`, the design system in
[`design/system/`](./design/system), and `manifest-mock`. Everything below is read from the spec,
the contract or the code; where it is a decision rather than a reading, §11 says which options it
rejected and what changing course would cost.*

**What this is.** The written design for **P11** (the roadmap's *Admin console*) — its first part:
the console's design, the design-system components it needs, and a **live prototype,
`packages/admin-ui`, driven against `manifest-mock` through `@manifest/contract`**. The plan that
builds it is written from this document once Rich has read it. **What it is not:** a change to the
API. Every gap the console meets is reported in §10 with the shape it would need, and none is
assumed to exist.

**Settled with Rich before this was written (2026-09-27):**

| Question | Answer |
|---|---|
| Does the console get real design effort, against §26's *"rudimentary… not a product surface"*? | **Yes.** §26's *Scope* changed in `577ad91`; the interface design brief's §13 carries the wording |
| A static prototype like the faculty one, or a live one? | **Live** — `packages/admin-ui`, against the mock, through the generated client |
| §26's non-repudiation rule is not built (A1). How urgent is it? | **Open** — ORIENTATION §8 |

**Read with:** [the handover](./design-handover.md) (regenerated in `577ad91` — the brief's §5 is
this job's brief), the faculty product's [`design/README.md`](./design/README.md), and its
[rationale](./2026-09-19-faculty-interface-design-rationale.md), whose §8 is the format §10 follows.

---

## 1. The reader, and the one rule that inverts

The administrator is technical, uses this daily or weekly, and spends most of the job **unblocking
other people**. The platform routes a specific, enumerable set of actions through their judgement
(§26: C4, D9, D14, D19, D24, D27, D29), which is why *the number of people waiting on an
administrator* is the platform's central operational metric.

**C3 inverts.** A faculty member must never be shown infrastructure; an administrator is shown what
the platform actually did — the digest, the exit reason, the failed check verbatim, the diff, the
refusal's `code`. That is why these are two products and not one with a role switch.

**Everything else is inherited, unchanged:**

| Inherited from the faculty product | How it shows up here |
|---|---|
| **Five states, one set of colours** (`20-states.md`) | The same tokens. The platform's own enum sits beside the state's word, in mono |
| **Motion means a machine is moving; stillness plus a number means a person has it** | Every age in the queue is still and counts upward. Nothing measured in days animates |
| **Name the owner of every wait** | Every queue row names who holds it: *us*, *UBC IAM*, *the Privacy Office*, *the project's owner*, *whoever minted the token* |
| **Every refusal says what is still true** | *"Nothing was recorded, and the release is untouched. Take a new preview."* |
| **Two facts, never one** | The fleet's environment cells: what serves, and what the last attempt did |
| **An admission ends with an offer** | Every gap in §10 that a screen meets renders as one — never as an empty panel |

**What changes is the vocabulary table.** `10-language.md`'s two columns — *Never* and *Always* —
become three, because the console keeps the platform's word and adds the plain one beside it:

| The platform says | The faculty product says | The console says |
|---|---|---|
| `healthy` | Answering | **Steady** · `healthy` |
| `failed` (an instance) | It never answered | **Needs you** · `failed` · the `failedCheck`, verbatim |
| an image digest | the version from 18 September, 9:00am | `sha256:9b2c…1d0e` — full on focus, copyable |
| `mongodb` | a place to keep things | `mongodb@7` |
| `RELEASE_REESCALATED` | *(a sentence)* | the `code`, then its `message`, then its `hint` |

**Three rules follow, and go into the system's own documents (§9):**

1. **Mono is the default for any machine value** — ids, digests, hostnames, paths, codes, attribute
   names. The faculty product allows mono in three places; here it is most of a screen.
2. **`InverseSurface` keeps its one meaning** — raw machine *output*: an incident's log tail, a
   build log. It does not become the console's emphasis, or every screen would be dark and the
   signal would die.
3. **The sentence shapes survive the vocabulary.** A console sentence may name a container, and it
   still says what is still true, names the owner, and explains a rule where it bites.

---

## 2. Where it lives, and how you move around it

**A top bar, not the rail.** `AppBar` — marked superseded for the faculty product and *"kept for a
surface that genuinely has no rail"* — is un-superseded for this one. It carries the mark, **the
screens as tabs**, and the person with their role: *Rich Tape · platform administrator*. The role is
always on screen, because anything done here may be done on someone else's project.

**Three tabs now: Queue · Fleet · Health.** People, Spend and Audit join when their APIs exist
(§8). The Queue tab carries the oldest age, not a count: **Queue · 3d 4h**.

**1440 wide, like the faculty artboards, and keyboard-first**: `j`/`k` move through the queue,
`Enter` opens an item, `Esc` closes it, `/` focuses the filter. Every item and every project has a
URL, so a link can be pasted into the team's chat and land on the same thing.

A project opens as **its own page** (§6), reached from the fleet or from any queue item.

---

## 3. The queue — the primary screen

### 3.1 The headline

Three numbers, in this order and at this size:

1. **Oldest waiting on us — 3 days, 4 hours.** `page-title` size, `waiting` ink, **still**,
   updating by the minute (seconds would be theatre for a wait measured in days). §26: *"a queue
   that is merely long is working and a queue that is stale is not."*
2. **6 people waiting on an administrator** — distinct people, not items: §26's central metric.
3. **9 items** — last and smallest.

Empty: **Nobody is waiting on us.** The steady state, and the only one in `steady` ink.

### 3.2 Two bands, by who holds the wait

- **Waiting on us** — what an administrator decides. The headline counts only this band.
- **Waiting on someone else, and we should know** — UBC IAM, the Privacy Office, a project's owner,
  or the person who minted a token. Their ages are shown and not headlined: chasing UBC IAM after
  three weeks is our job, but the three weeks are not our staleness.

Each band is sorted **oldest first**. Kind is a filter, never a grouping: a queue grouped by kind
hides its oldest item in whichever group is scrolled past.

**Every row is amber, and red is kept for breakage.** A queue item is normal work, and *"stuck until
you act"* is true of every row by definition — so a red row would carry no information and the
board would read as an alarm. Staleness is carried by the headline. Red is reserved for something
broken or about to break for a person: a failed instance, a certificate close to expiry, a refused
decision.

### 3.3 A row

```
3d 4h   RELEASE APPROVAL   reading-responses   Approve release for production — first launch
        Instructor One made it · 3 days ago     sha256:9b2c…1d0e · scan clean · 2 sensitive fields     Waiting on us
```

**Age** (tabular, still) · **kind** (overline) · **project** (mono slug) · **what is being asked**,
one sentence · **by whom, and when** · **what changes if it is granted** — which may be mono, since
C3 is inverted · **a diff marker** where there is one · **who holds the wait**.

### 3.4 The kinds, and what the API can back

| Kind | Appears when | Holds the wait | Age from | Today |
|---|---|---|---|---|
| **Release approval — first launch** | `getLaunchReadiness`: `launched: false`, every blocking item met except `admin-approval` | us | **nothing records the asking** — shown as *up to*, from staging's last deploy (A3) | by fan-out (A2) |
| **Release approval — re-escalation** | `reescalated: true` | us | the same (A3) | by fan-out |
| **An agent's question** | `listPendingActions`, `state: pending` | whoever minted the token — **not nameable** (A8) | `createdAt` ✅; lapses at `expiresAt` | by fan-out |
| **IAM registration** | its record is `draft` (us) · `submitted` or `change_requested` (UBC IAM) | as named | `updatedAt` only (A3) | by fan-out |
| **Privacy assessment** | its record is `draft` (the owner) · `submitted` (the Privacy Office) | as named | `updatedAt` only (A3) | by fan-out |
| **Verified domain to attach** | — | us | — | **not modelled** (A4) |
| **Audience upgrade** | — | us | — | **not modelled** (A4) |
| **Launch-item override** | — | us | — | **not modelled** (A4) |

**The live prototype builds the first five and nothing else.** The last three appear only in
`QueueRow`'s preview in the design system, as static examples, so the design is on record without a
fixture that pretends an endpoint exists — the faculty prototype's lesson about speculative screens,
applied before the fact.

**A project with no IAM or PIA record is not a queue item.** Every unlaunched project needs both, but
nothing records that its owner has asked for either (A3), and 300 rows of *"not started"* would bury
the queue. They belong on the project's page and on Health.

### 3.5 The decision pane

Selecting a row opens it beside the queue; the queue stays visible, so the next item is one key away.

**A release approval** — the best-backed flow in the console, and the most consequential:

- **The facts**: project, release (mono id), digest, who made it (A8), the scan in full — fixable,
  unfixable and base-image counts, the database's age, and `stale` said in words when it is true —
  and the launch checklist, with every item's raw `id`.
- **The preview is taken on an explicit click, not on opening.** *"Take the preview — a stored copy
  of exactly what your decision will record. A language model writes its summary; it is kept for 30
  minutes."* Opening an item to look at it should not call a model, start a clock or leave a row
  attributed to you.
- **The diff** (`DiffView`): every change to `manifest.yaml` as `path: from → to`; the sensitive
  fields that re-escalated it, flagged; the platform's own security note for each; the model's
  summary **with its `summarySource` said honestly** — `unavailable` reads *"The model didn't
  answer. The diff beside it is the control."*; one exposure sentence per change, never for
  `auth.attributes`; the reviewer's `not_performed`, stated; and the `coverage` line verbatim.
- **The decision** — `ObservedAction` (§4): approve or reject, with a reason. Step-up happens on
  submit; `STEP_UP_REQUIRED` sends the administrator round and back to **the same preview**, by its
  id in the URL, as the reference console already does.
- **Refusals say what is still true.** `APPROVAL_PREVIEW_STALE`: *"Something moved since you read
  the preview. Nothing was recorded, and the release is untouched. Take a new one."*
- **The project's recent events**, from its stream's replay, as `EventLine`s.

**An agent's question — reject only, never confirm.** It shows the ask verbatim (`summary`,
`method`, `path`, `bodySha256`), the token (name, capabilities, rate limit, last used) and when it
lapses: *"lapses in 6 hours — then the agent is told no."* §26 says the person who minted the token
decides. The API lets an administrator confirm it too (A6), and an administrator saying *yes* to
someone else's agent is exactly the insider risk §3.5 names — so the console offers only the safe
direction, a rejection with a reason, for a runaway agent.

**An IAM registration or a privacy assessment** — a `FactList` of what is recorded, and the form
that records the next state. **The state control offers only the states §9's arrows allow from
here**, so `LAUNCH_TRANSITION_INVALID` is prevented by design and still handled if it arrives.
Registered and requested attributes are shown side by side, because the difference is the change
request.

### 3.6 How it stays current

**The queue is re-assembled every 60 seconds and when the window regains focus**; ages tick on the
client from their timestamps. Not WebSockets: one per project is not a design (A5). The page says
when it was assembled and what it cost — *"Assembled 40 seconds ago from 25 reads"* — which puts
A2's price in front of the people who could remove it.

---

## 4. The observed decision

§26: *"An admin action taken on another person's project additionally requires a reason string,
which is stored with the audit entry and shown to the project owner in their event stream."* So an
administrator's action is observed, and the console makes that felt rather than decorative.

**`ObservedAction`** is one composite, used for every decision the console offers:

1. **The action stays disabled until a reason is written.**
2. **Beside the reason: *What Instructor One will see*** — the line as it will land in the owner's
   own product, rendered with the faculty product's components: the administrator's name, the
   sentence, and the reason quoted with the system's single left rule — the one it already keeps for
   a person's verbatim words.
3. **After it is done, it says where the reason went.**

**It says only what is true today — read from the event publishers on 2026-09-27.** Every decision
the console offers already writes an event whose sentence **names the person** (the authoring API
plan's sitting 9 made them): *"Rich Tape did not approve this release: …"*, *"Rich Tape recorded
this app's UBC IAM registration as submitted (ticket …)."* What differs is the reason:

| Decision | Where the reason goes today | *What the owner will see* |
|---|---|---|
| **Reject a release** | Required; in the sentence, and on the owner's checklist | The whole sentence, reason included |
| **Approve a release** | Optional; kept on the approval record, **not** in the sentence | *"Rich Tape approved this release for production."* — and the reason on the record, which they can open |
| **Reject an agent's question** | Required; told to the agent word for word, **and** in the sentence | The sentence, reason included — so the reason is written for two readers, and the field says so |
| **Record an IAM registration or a PIA** | **Nowhere** — the operations take none | The sentence, naming the administrator — not why |

**Where the API has no field, the console does not collect words it would then drop.** The field
renders disabled with an admission:

> **Manifest can't record a reason here yet.** Instructor One will see that you recorded this — not
> why.

That is A1, felt by the one person able to report it every time they meet it.

---

## 5. Fleet

A dense table (`DataTable`) of `listFleet`: **project** (mono slug, and the owner's name beneath) ·
**audience** (scale and burst) · **sandbox**, **staging**, **production** — each a state chip with its
raw enum, the last deploy's age, and a marker when an incident followed it · **serving digest**
(`MachineValue`, production's when there is one) · **blueprint**, marked when a newer major exists in
`listBlueprints` · **created**.

**Filters** (`FilterBar`): owner, audience scale, blueprint, *has an incident*, *in production*, and
text over slug and owner — all held in the URL. **Sorted** by any column; by default the most
recent deploy first. A row opens the project's page.

`TwoFacts`' rule holds in a cell: what serves is the chip, and what the last attempt did is the
incident marker beside it. The API does not make those one fact (the faculty review's F6), and the
fleet gives only the latest incident's time (A7, A9).

---

## 6. The project, as an administrator sees it

Everything the API answers an administrator about one project, on one page: environments (with
`TwoFacts` each), releases (digests and scans), the launch checklist in its console form (the same
items, raw ids beside the words), the launch records, members, tokens (last used, revoked,
expiry), pending actions, and **the event stream, live** — one socket for the one open project is
fine.

**It offers no owner's actions.** The API lets an administrator deploy, add a member, set a secret or
commit on any project (A1), and every one of those, done by an administrator on someone else's app,
is the insider risk §3.5 names. **Until A1 is built, the console offers none of them**; each needs an
`ObservedAction` whose reason goes somewhere. The page is where an administrator *looks*.

---

## 7. Health and risk

Four panels, each derived by fan-out and each stating what it cannot see:

- **Certificates expiring within 90 days** — each project's `IamRegistration.certExpiresAt`. Amber
  within 90 days, **red within 14**. D20: *an unnoticed expiry silently kills login for a live course
  app.* Cannot see: uploaded custom-domain certificates (D28, not modelled).
- **Incidents** — the fleet's `latestIncidentAt` per environment, newest first. Cannot see: whether
  one is still open (A9), or any incident but the latest.
- **Scans** — the release serving each environment, where its scan is `stale` or has fixable
  findings.
- **Superseded blueprints** — projects pinned to a major older than `listBlueprints`' newest.
- **Cannot see at all:** policies a driver reports it cannot enforce — §12's `capabilities()` has no
  operation (A12).

---

## 8. People, Spend and Audit — not designed, and why

**People** — members and tokens can be gathered project by project, but there is no user read, no
*last seen* (the `users` table has no such column), no other person's platform role, and
`audit.role_changes` is unreadable (A10). **Spend** — no operation at all; D8's per-user
attribution exists only inside LiteLLM (A11). **Audit** — events carry no actor field (a name, when
there is one, is inside the sentence), cannot be read across projects and cannot be filtered (A5);
drawing a filter by actor would be drawing a column that does not exist.

Designing these now would mean inventing their data. They join the bar when their APIs exist, and
§10 says what each needs. **What that costs:** the console answers *"which of 300 students spent the
budget"* and *"who did this"* not at all until then.

---

## 9. What this adds to the design system

**One system, two products.** Everything goes into the shared system in
[`design/system/`](./design/system) with the discipline the faculty components have — a
`README.md` carrying the reasoning, a `preview.html` that mounts the real export, tokens for every
new value, `index.d.ts` for every prop — and the gallery is regenerated. A component the faculty
product could use is written for both (`EventLine`, `MachineValue`); one that only the console uses
says so in its README.

| Component | What it is |
|---|---|
| `AppBar` *(extended, un-superseded here)* | Gains `tabs` with an optional per-tab `meta` — the queue's age — and a role beside the person |
| `DataTable` | A real `<table>`: `th scope`, `aria-sort`, a sticky header, 36px rows, tabular numerals, mono columns, a row that is a real link |
| `FilterBar` | Facet menus, active filters as removable chips, a text filter, *Clear all*; its state lives in the URL |
| `QueueRow` | §3.3's row. Its preview carries all eight kinds, including the three with no API |
| `WaitHeadline` | §3.1's three numbers, and the empty state |
| `DiffView` | An `ApprovalDiff`: changes, sensitive fields, security notes, summary and its source, exposures, review, coverage |
| `ObservedAction` | §4: reason, *what the owner will see*, the action — and the variant that admits it cannot record a reason |
| `EventLine` | *when · who · type · sentence* — one event. The faculty product needs it too |
| `MachineValue` | Mono, truncated in the middle (the prefix and the last four), full on focus and to a screen reader, with copy |
| `FactList` | A dense `<dl>` for a record's machine facts |
| `StateChip` *(extended)* | Gains `raw`: the platform's enum, in mono, after the word — C3's inversion in one prop |

**Tokens.** Diff tints and marks that are **not** the state colours — in this console red means
*needs you* and green means *steady*, and a removed line is neither; a `data` type style (13px,
tabular numerals) and a `mono-data` one; a dense row height. Each is contrast-checked against the
ground its usage note names, as every existing token is.

**Documents.** The system's `README.md` gains *The operations surface*; `10-language.md` the
three-column table in §1; `20-states.md` a paragraph on how the console renders the five states —
the raw enum beside the word, queue rows amber, red kept for breakage.

**How a React 19 app loads it — measured, not assumed.** `bundle.js` is a classic script that reads
`window.React` once, as it loads, and uses exactly one React API, `createElement`, with no hooks. On
2026-09-27, with React **19.3.0** (the reference console's copy) set on `window` first, the bundle
loaded all eighteen exports and `StateChip`, `TwoFacts` and `Button` rendered to the expected
markup through `react-dom/server` — three, not eighteen; the plan's first sitting renders every
preview in a browser. So `admin-ui` sets `window.React` in a module imported before the
bundle, and **the system needs no ES-module build** — it keeps one artefact that the gallery, the
faculty prototype and the console all load.

**Noticed, and left alone:** `tokens.json` still carries `speculative-hatch-a` and `-b`, though the
component that used them was removed on 2026-09-26. That is the faculty design's call.

---

## 10. What designing this found — the API

**None of these is assumed to exist, and none is built by this work.** Each says what it costs the
console today and the shape that would close it.

**A1 — §26's non-repudiation rule is not built, and it is not only a console gap.** An
administrator acting on someone else's project must give a reason, stored with the audit entry and
shown to the owner. Read from the code on 2026-09-27:

- **An administrator may do anything an owner may, anywhere.** `PLATFORM_ADMIN` holds every owner
  capability on every project (`projects/authz.ts`): deploy, add a member, commit, set a secret,
  record a launch record, confirm an agent's question.
- **No operation requires an administrator's reason.** `approveRelease`'s is optional and is kept
  on the record, not in the event's sentence; the launch records and `confirmPendingAction` take
  none. Only the two rejections carry one, because a refusal needs words whoever makes it.
- **Who acted is half-recorded.** Since the authoring API plan's sitting 9 most sentences name the
  person — release decisions, launch records, answering an agent, a commit, minting a token. But a
  deploy's events name nobody (*"Preparing … in staging."*), **adding or removing a member and
  revoking a token write no event at all**, and the name lives only in the sentence: `audit.events`
  has no actor column (`db/schema.ts` deferred it to *"P4b or P5"*, and neither added it), so it
  cannot be filtered.
- **Nothing says the person was acting as an administrator.** *"Rich Tape committed 1 change to
  main"* reads the same whether Rich Tape is a collaborator or a platform administrator the owner
  has never met.

It is live today, through the API and the reference console. *Worth considering:* a `Manifest-Admin-Reason` header on every mutating operation — a header rather than a
body field, so sixteen request schemas do not each grow the same property — **required**
(`422 ADMIN_REASON_REQUIRED`) when the actor is a platform administrator with no membership of the
project; stored with an actor on the event; quoted in the event's sentence, which says *as a
platform administrator*; and an event for the three actions that write none. ORIENTATION §8 carries
the question of when.

**A2 — There is no queue.** Nothing reads across projects except `listFleet`. The queue is
assembled from **3N+1 reads** — the fleet, then each project's pending actions, launch readiness and
launch records — plus N WebSockets to keep it live. *Worth considering:* `GET /v1/admin/queue`,
admin-scoped under D31, answering items of `{ id, kind, projectId, projectSlug, askedBy, askedAt,
heldBy, summary, grantEffect, subject }` oldest first, with `oldestAskedAt` and `peopleWaiting`
beside them — the headline, computed where the data is.

**A3 — Nothing records that anyone asked.** Of the queue's sources, only `PendingAction` has an
asked-at. An owner's production deploy refused for `admin-approval` or `RELEASE_REESCALATED` writes
nothing, so **the queue's headline number cannot be computed for its most important item**; the
console shows an upper bound from staging's last deploy and says *up to*. The two launch records
carry `updatedAt` and nothing about when they entered their state — the faculty review's F3 on the
administrator's side. *Worth considering:* an approval request recorded when that refusal happens;
`stateEnteredAt` on both records.

**A4 — Three of §26's seven sources are not modelled.** `Domain` (D28) has no operation or
schema; an audience upgrade has neither a request nor a verb to grant it (the faculty review's F8);
and `LaunchReadinessItem` has no notion of an override.

**A5 — Events cannot answer "who did this" or "across what".** No actor field (A1), no read across
projects, no filter, and no read at all except a per-project WebSocket's replay. §26's Audit screen
(*"filterable by actor, project and action"*) has no data beneath it. *Worth considering:* an
`actor` on `EventFrame`, and a paged, filtered `GET /v1/admin/events`.

**A6 — An administrator may answer another person's agent's question.** §26 lists it as *decided by
the requesting user*; `confirmPendingAction` checks only that the person holds the capability
themselves, which `PLATFORM_ADMIN` always does, and asks step-up and no reason. The console offers
reject only (§3.5). Either the API or §26 should say which is meant.

**A7 — The fleet is short of the fleet screen.** Besides its own note (department, custom domains,
AI spend), it is an unpaginated array, it has no `launchedAt` (`Project` has one), and each
environment carries the serving state and the latest incident's time but not what the last attempt
did.

**A8 — The queue cannot name who it is waiting on.** `Token` records no minter, so the owner of an
agent's question — the person §26 says decides it — cannot be named. `Release.createdBy` is an id
with no name, where `Approval` and `ApprovalPreview` carry `decidedByName` and `createdByName`; the
console can name the release's author only by finding them in the project's members.

**A9 — Incidents have no lifecycle**, so *"open incidents"* — in both the fleet and Health — cannot
be answered. There is only the latest one's time.

**A10 — People has no read.** No list of users, no *last seen*, no other person's platform role, and
`audit.role_changes` — which does carry an actor and a reason — is not exposed.

**A11 — Spend has no read.** D8's attribution lives only in LiteLLM.

**A12 — Two of Health's five panels have nothing behind them**: a driver's `capabilities()` and
custom-domain certificates.

**Found on the way, not about the API:**

- **T1 — The handover was three versions stale** (1.0.0, 34 operations) and its generator hard-coded
  *"the absence of `PATCH` and `PUT`"* after a `PUT` existed. Fixed in `577ad91`.
- **T2 — The mock is single-project and stateless**: every per-project read answers the same fixture
  for any id, and the fleet holds one project with one environment. A queue cannot be shown on it as
  it stands (§11, decision 13).

**What the API already does well for this console.** The stored approval preview is complete: an
administrator reads exactly what will be recorded, re-read rather than recomputed, bound to a digest
and refused if anything moved. `PendingAction.waitingSeconds` and `expiresAt` are exactly what a
queue row needs. And the launch records' state machine refuses an impossible transition itself.

---

## 11. Decisions this design makes

| # | Decision | Rejected | Cost of changing course |
|---|---|---|---|
| 1 | **A top bar, not the rail** (§2) | `SideNav`: it costs 240px of a screen that needs width for diffs and tables, and it would make the two products look identical when someone who is both an owner and an administrator must know which one they are acting as. An icon-only rail: a word survives being small and an icon does not | One component |
| 2 | **Three tabs now** | Six, with admissions behind three — dead tabs in a daily tool are noise | Trivial |
| 3 | **Queue rows amber; red kept for breakage** (§3.2) | A red *Needs you* on every row — true of all of them, so informative about none | A token |
| 4 | **Two bands, by who holds the wait** | One list; grouping by kind | Layout only |
| 5 | **An approval's age is an upper bound, labelled *up to*** (A3) | Leaving approvals out of the headline — dishonest the other way; showing the release's age as *waited* | One function |
| 6 | **The preview is taken on a click** (§3.5) | Taking it on opening, as the reference console does — a model call, a clock and an attributed row for looking | One handler |
| 7 | **Agents' questions: reject only** (A6) | Both answers, which the API allows | Small |
| 8 | **No owner's actions from the console until A1** (§6) | Everything the API allows an administrator | Per action |
| 9 | **A reason is collected only where it is stored** (§4) | Collecting it everywhere and dropping it where the API has no field | Per kind |
| 10 | **Poll every 60 seconds, and on focus** (§3.6) | A WebSocket per project | One module |
| 11 | **The three unmodelled kinds only in `QueueRow`'s preview** | Fixtures for them inside `admin-ui` | — |
| 12 | **The design system is loaded from `design/system/`, React on `window` first** (§9) | Promoting it to a workspace package now (moves files the faculty design owns); rewriting it as TSX in `admin-ui` (the drift a system exists to stop) | An import path |
| 13 | **The mock gains an admin fixture set, keyed on the project id, with `mock-app`'s answers unchanged** | A fixture layer inside `admin-ui`, which bypasses the mock's validation against the contract — the check that keeps a fixture honest | Fixtures only |
| 14 | **A certificate is red within 14 days** | §26 names only the 90-day window | A constant |
| 15 | **This document lives beside the faculty rationale**, not in `specs/` | `specs/`, which holds the approved platform spec: a second design there makes *"the spec"* ambiguous | A move |

---

## 12. What this does not cover

- **Serving the console through the edge, signed in for real.** The prototype runs against the mock
  on 7101 (§21 reserves it for *"Admin UI (Vite)"*). A hostname, the edge route, the session and the
  CSRF origin are the plan's to place — after the prototype, not before.
- **Building any of §10.** A1 first, and when is Rich's (ORIENTATION §8).
- **The platform's own maintenance** — `make doctor`, the vulnerability database, the machine
  cleanups. Refreshing the vulnerability database from a console is a plan already placed after the
  authoring API.
- **Narrow screens.** 1440 desktop, like the faculty design.

## 13. What the plan will do

The plan is written after Rich has read this, in the house style, with its sittings approved by him.
The shape it will propose: **the measurements and the mock's admin fixtures first**; then **the
design-system additions**, each with its preview; then **`admin-ui`'s skeleton** — the package, D22's
import boundary copied from the reference console, the system loaded, the bar, the router, the
generated client against the mock — and the queue's assembly; then **the queue and the approval
pane**; then **the other panes and `ObservedAction`**; then **the fleet and the project's page**;
then **Health**; and last **the acceptance** — the queue clicked by a person against the mock,
negative controls that are made to fail, and a whole-branch review.

**It starts after the authoring API plan's sitting 10 closes.** A new workspace package moves
`pnpm test`'s count, and that sitting's acceptance asserts it exactly.
