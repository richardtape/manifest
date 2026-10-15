# The administrator's console — a design, and what designing it found

*Written 2026-09-27 by the admin console's design session, **before anything is drawn**, against
contract **v1.3.0** (54 operations, 78 schemas) at `577ad91`, the design system in
[`design/system/`](./design/system), and `manifest-mock`. Everything below is read from the spec,
the contract or the code; where it is a decision rather than a reading, §11 says which options it
rejected and what changing course would cost.*

> **REFRESHED 2026-10-14, ~19:20–19:50 PDT (read from the clock), by `manifest-p11-plan`** (the third coordinated run's job P11P, at Rich's ask of
> ~18:47 — *"the more stylized version of the console … demos need to start showing what the operator experience is going to look
> like"* — and his answer *"Plan + review now, build after approval"*, `3011e11`), **against contract `1.9.0`** (76 operations, 104
> schemas; `packages/contract/openapi.json` at manifest `dbd2ec2`) **and B's drafted `1.10.0`** (the load rehearsal plan's Task 5, FE-62
> in it, `517b8a9`). **§0 is what moved**; every section after it is updated in place where the API moved under it, and each finding in
> §10 now carries its status. The 2026-09-27 reading is at `e1712d8`. **The plan is written**:
> [`plans/2026-10-14-p11-admin-console.md`](./plans/2026-10-14-p11-admin-console.md) — `packages/admin-ui`, against the mock, built in a
> git worktree — **awaiting its fresh review and Rich's approval**.

**What this is.** The written design for **P11** (the roadmap's *Admin console*): the console's
design, the design-system components it needs, and what the API cannot yet answer. **It is drawn as a
clickable mockup** — [`design/admin-console.html`](./design/admin-console.html), published at
<https://claude.ai/artifact/N8qj84CVbvJ7f2L6xKfQ25>, its files and their provenance in
[`design/admin/README.md`](./design/admin/README.md). **`packages/admin-ui` is not built**; until 2026-10-14 no plan was written either
(Rich, 2026-09-27: *"We're just trying to get some sense of a design"*) — §13 now points at the plan. **What it is not:** a change to
the API. Every gap the console meets is reported in §10 with the shape it would need, and none is assumed to exist.

---

## 0. What moved since the design was drawn — contract 1.3.0 → 1.9.0, and B's 1.10.0

*Read from `openapi.json` at `dbd2ec2` (1.9.0: 76 operations) and the code it was generated from, 2026-10-14. Seven plans landed between
the two readings — the faculty front-end's enablement, the launch path, faculty-ready, the UBC AI Gateway, the U1 levels, the Manifest
team's step (FE-46/47/5) and A1 — and five of them changed what this console reads.*

| What the console needs | At 1.3.0 (2026-09-27) | At 1.9.0 (2026-10-14) | What it changes here |
|---|---|---|---|
| **The queue** | Nothing read across projects but `listFleet`: the queue assembled from 3N+1 reads and N sockets (A2) | **`listQueue` — `GET /v1/queue`**, administrators only (the launch path plan's Task 12; the team's three kinds since FE-46/47/5): seven `kind`s, oldest first, each with `since`, `requestedBy`, one `summary` sentence and the owner's `note`; `oldestSince`; `truncated` past 200 | **One read.** §3 is rebuilt on it. A2 is closed but for two remainders (A15, A16) |
| **When anyone asked** | Nothing recorded the asking (A3): an approval's age was an upper bound, labelled *up to* | **`requestApproval`** records an `ApprovalRequest` (`approval.requested`, with who and through which token); the launch records carry `sentAt`/`sentBy` and `submittedAt`/`submittedBy`; every checklist item has `since` | **No more *up to*.** Every age is a recorded instant (A3 closed; §11 decision 5 retired) |
| **The Manifest team's step** | Not modelled: an owner's record went from `draft` straight to UBC | A record the owner **sends** to the team (`sent`, every gap of the assessment answered); the team **submits** it to UBC with a reference (`submitIamRegistration`, `submitPrivacyAssessment`) or **hands it back** (`return…`); a change to a live registration is filed as a change request; the team is emailed | §3.4's kinds and §3.5's panes: *submit or hand back* is the administrator's commonest decision |
| **§26's reason** | Not built (A1): an administrator could do anything an owner could, silently | **`Manifest-Admin-Reason`** on 24 operations, refused `400 ADMIN_REASON_REQUIRED` for an administrator acting with an owner's capability their place does not give them; **`EventActor`** — `name`, `asAdministrator`, `reason`, `token` — on every event; `member.added` and `member.removed` written (faculty-ready, contract 1.6.0) | A1 closed but for one remainder (revoking a token still writes no event of its own). §4 and §6 read the actor |
| **Instances** | One instance per environment | **A1**: production runs its audience's count (`class` 2, `large_course` and `public` 3); `Environment.instances[]`; **`listInstances`** (each `serving` or not, at most 50) and `getInstanceOutput`; `Fleet.environments[].instances` (how many the hostname reaches) | §5's cell says *2 of 2*; §6 shows the set |
| **Incidents** | The latest one's time, per environment (A9) | **`listIncidents`** per environment, newest first, each with **`cause`** — `deploy`, `exit` (a serving member stopped and was replaced) or `exit_stopped` (replacing gave up) — its log tail, failed check and diff; `instance.exited` events; B's 1.10.0 puts `cause` on `incident.opened` too (FE-62) | §6 and §7 read them; still no open/closed (A9 remains) |
| **Data levels** | `public`/`internal`/`confidential` | **UBC's U1 levels** — `low`, `medium`, `high`, `very-high` (the old three aliases); a token refused a `high` project's staging and production Incidents (an administrator's session reads them) | The level belongs on the fleet and the project's page — and **the fleet does not carry it** (A17) |
| **Tokens and agents' questions** | `Token` had no minter (A8); an administrator could confirm anyone's agent (A6) | `Token.mintedBy` (an id); the minter named by `EventActor`; §26 now lists *answering someone's agent* among the owner's capabilities that need the reason — the API and §26 agree (A6 resolved). **`revokeToken` answers anyone but the minter `404`** | Agents' questions are not in `listQueue` (they are the minter's — §26) and move to the project's page; an administrator cannot stop someone else's token (A14) |
| **The load rehearsal (B, 1.10.0, drafted)** | — | `runLoadRehearsal` (`202`), `getLoadRehearsal`, `listLoadRehearsals`; `load_rehearsal.completed`; `LOAD_REHEARSAL_RUNNING` on a staging deploy; **`LOAD_REHEARSAL_BUSY` — one run at a time, platform-wide, naming no other project**; the checklist's `load-rehearsal` item met by a measurement | §6 shows a project's runs once 1.10.0 lands; nothing tells an administrator which project holds the one slot (A18) |
| **Settings** | No read or write (A13) | Still none — and **§26 now lists more**: the agent budget's default and any one person's, the intake model and its bounds, the capable model's provider, model, level and fallback, the AI Gateway's address and the catalogue entries it answers, and the builder exception (§7, §10) | §7a keeps its form; only the blueprints have a read |
| **The mock** | One project, stateless (T2) | Still one project (`mock-app`), scripted by `MANIFEST_MOCK_*` options; `MANIFEST_MOCK_QUEUE=full` adds four queue items **on projects the mock does not hold** (their links answer `404`) | The plan's first build task is a multi-project demo fleet in the mock (§11 decision 13, revised) |

**Settled with Rich before this was written (2026-09-27):**

| Question | Answer |
|---|---|
| Does the console get real design effort, against §26's *"rudimentary… not a product surface"*? | **Yes.** §26's *Scope* changed in `577ad91`; the interface design brief's §13 carries the wording |
| A static prototype like the faculty one, or a live one? | **Live** — `packages/admin-ui`, against the mock, through the generated client — and then, the same day, **a mockup first and no plan**: *"We're just trying to get some sense of a design"* |
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

**The rail, like the faculty product** (Rich, 2026-09-27, after seeing the first mockup with a top
bar: *"I prefer the left hand side menu rather than the tabs at the top"*). `ConsoleRail` is
`SideNav`'s sibling — its classes, its UBC blue, its three signals for the active item — carrying
an **Operations** overline that says which product this is, **Queue · Fleet · Health**, then
**Settings** pinned above the person, and the person with their role: *Rich Tape · platform
administrator*. The role is always on screen, because anything done here may be done on someone
else's project. People, Spend and Audit join the rail when their APIs exist (§8).

**The Queue item carries no time** (Rich, the same day: *"I don't like the time being part of the
queue menu item"*). The oldest age is the queue screen's headline and nowhere else.

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

**At 1.9.0 (refreshed):** every age is a recorded instant — an item's `since` — so the *up to* of the first drawing is gone (A3 is
closed). **The first number is computed by the console from the *waiting on us* band's own `since`s, not read from `Queue.oldestSince`**,
which is the oldest of ALL the items, UBC's waits included (A15): a privacy assessment three weeks with the Privacy Office would
otherwise headline as our staleness — exactly what §3.2 exists to prevent. The second counts distinct `requestedBy.id`s in the same
band (an item with nobody recorded counts as one person, *"someone"*). When `truncated` is true the numbers are said to be of the
oldest 200.

### 3.2 Two bands, by who holds the wait

- **Waiting on us** — what an administrator decides. The headline counts only this band.
- **Waiting on someone else, and we should know** — UBC IAM, the Privacy Office, a project's owner,
  or the person who minted a token. Their ages are shown and not headlined: chasing UBC IAM after
  three weeks is our job, but the three weeks are not our staleness.

Each band is sorted **oldest first**. Kind is a filter, never a grouping: a queue grouped by kind
hides its oldest item in whichever group is scrolled past.

**At 1.9.0 the bands are `listQueue`'s kinds, split by who holds the wait** — no fan-out:

| Band | `kind` | What it asks |
|---|---|---|
| **Waiting on us** | `release-approval` | A release someone asked an administrator to sign off for production (`requestApproval`), with their note |
| | `iam-registration-to-submit` | A staging or production registration its owner sent to the Manifest team: submit it to UBC IAM, or hand it back |
| | `iam-change-to-file` | A change to a LIVE registration its owner sent: file it with UBC IAM as a change request, or hand it back |
| | `privacy-assessment-to-submit` | A privacy assessment its owner sent, every gap answered: submit it to the Privacy Office, or hand it back |
| **Waiting on UBC — ours to chase and record** | `iam-registration` | A registration with UBC IAM: record its answer when it comes |
| | `iam-change-request` | A change request filed with UBC IAM: record its answer |
| | `privacy-assessment` | An assessment with the Privacy Office: record its answer |

The second band's heading changes from *Waiting on someone else* to **Waiting on UBC**, because that is now exactly who: a project's
owner holds nothing in `listQueue` (a record UBC IAM sent back with questions is the owner's to answer, and is not listed), and an
agent's question is its minter's (§3.4).

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

**At 1.9.0 a row is what one `QueueItem` carries, and no more**: age from `since`; the `kind`'s overline; `project.slug` in mono with
`project.name` beside it; the environment, for a registration; the platform's own `summary` sentence; `requestedBy.displayName` and the
day; **a note marker** when the owner wrote one (the note itself is read in the pane — it was written for this reader, and a row is too
small to quote it fairly); and the holder. **What a grant changes — the digest, the scan, the sensitive fields — is the pane's**, read when
the row is opened (`getRelease`, `getLaunchReadiness`): the row stays one read, and the pane reads what it shows. The first drawing's
*sha256 · scan clean · 2 sensitive fields* line on the row is dropped rather than fanned out for (§11 decision 21).

```
3d 4h   RELEASE APPROVAL   reading-responses  Reading responses                                   ✎ a note
        Instructor One asked on 11 October: approve the release serving staging for its first launch       Waiting on us
```

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

**At 1.9.0 the table above is history; the kinds are `listQueue`'s seven (§3.2), every one backed by the one read:**

| Kind (`listQueue`) | Holds the wait | Age from (`since`) | Decided by |
|---|---|---|---|
| `release-approval` | us | the `ApprovalRequest` — when the owner (or their agent) asked | `approveRelease` / `rejectRelease`, from a stored preview, stepped up |
| `iam-registration-to-submit` | us | the owner's send (`sentAt`) | `submitIamRegistration` (UBC IAM's reference, the day) or `returnIamRegistration` |
| `iam-change-to-file` | us | the owner's send | `submitIamRegistration` — filed as a change request — or `returnIamRegistration` |
| `privacy-assessment-to-submit` | us | the owner's send | `submitPrivacyAssessment` (the PRISM reference, the day) or `returnPrivacyAssessment` |
| `iam-registration` | UBC IAM | the team's submission | `recordIamRegistration` — UBC's answer, along the allowed moves |
| `iam-change-request` | UBC IAM | the filing | `recordIamRegistration` |
| `privacy-assessment` | the Privacy Office | the team's submission | `recordPrivacyAssessment` |
| *An agent's question* | its minter | — | **Not in the queue** — §26 lists it *"because it is the same mechanism"*, decided by the person who minted the token; the console shows it on the project's page (§6). No read lists them across projects (A16) |
| *Domain to attach · audience upgrade · launch override* | — | — | **Still not modelled** (A4): only in `QueueRow`'s preview, as before |

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

**At 1.9.0 these are two panes, by band:**

- **With the Manifest team (`…-to-submit`, `iam-change-to-file`)** — the record as its owner sent it: for a registration, the
  `RegistrationPackage` (entity ID, ACS and SLO, the certificate's fingerprint and expiry, every attribute with its OID, purpose,
  where the code uses it and whether it is unused, the contacts, the metadata XML and the drafter's warnings); for an assessment, the
  `PrivacyAssessmentDraft`'s six sections with every gap and **the owner's answer to it, by the gap's id**; who sent it and when.
  **Two decisions: Submit** — UBC's `reference` (required) and the day it was sent (today in Vancouver unless changed; never after
  today or before the owner's send — `LAUNCH_SENT_AT_INVALID`); for a change to a live registration the button says **File the change
  request** and the pane shows registered and requested attributes side by side — **or Hand back**, which returns the record to the
  state it was sent from (`sentFrom`). *Why* it came back travels outside the record (the API keeps no reason for it), so the pane says
  so beside the button: *"Tell Instructor One why — Manifest doesn't keep a reason for a hand-back."* (§4).
- **With UBC (`iam-registration`, `iam-change-request`, `privacy-assessment`)** — what was submitted and when, the reference, and the
  form that records UBC's answer, offering only the moves the record's state allows — the platform's table
  (`launch/transitions.ts:38-58`; `sent` has no arrow — only the team's submission or hand-back moves it), which the published document
  states in words on `recordIamRegistration`'s and
  `recordPrivacyAssessment`'s `state`: a registration `submitted` → `active` (the registered attributes, the certificate and the ticket)
  or `change_requested` (UBC's questions, for the owner); `active` → `change_requested` or `expired`; `change_requested` → `submitted` or
  `expired`; `expired` → `submitted`; an assessment `submitted` → `approved` (its reviewer) or back to `draft` when the Privacy Office
  refuses it; `approved` → `draft`. The console restates the table, and a test holds it to the document's sentence, so a rule changed
  on the platform turns the console's test red rather than its form wrong. A move the platform refuses still arrives as `409
  LAUNCH_TRANSITION_INVALID`, naming the moves allowed, and the pane re-reads the record. **The form sends what the operation requires**
  (the fresh review's C1, 2026-10-14): `recordIamRegistration` requires `entityId`, `acsUrl`, `sloUrl`, `registeredAttributes` and `state`,
  takes production's registration when `environment` is absent, and upserts the four facts from the body — so the pane always sends
  `environment` from the queue item and the record's own facts, and the attributes are editable only for `active`. **A change UBC granted is
  two writes** (A20): there is no arrow from `change_requested` to `active`, so it is recorded `submitted`, then `active` — one decision,
  two keys, and the pane resumes a failed second write rather than repeating the first.

**An agent's question is no longer a queue pane** (§3.4) — it is the project page's (§6), still **reject only**: the API now lets an
administrator confirm one with §26's reason (A6 resolved), and the console still offers only the safe direction (§11 decision 7).

### 3.6 How it stays current

**The queue is re-assembled every 60 seconds and when the window regains focus**; ages tick on the
client from their timestamps. Not WebSockets: one per project is not a design (A5). The page says
when it was assembled and what it cost — *"Assembled 40 seconds ago from 25 reads"* — which puts
A2's price in front of the people who could remove it.

**At 1.9.0 it is one read**, so the line says *"Read 40 seconds ago · again every 60 seconds"*. A pane left open across a re-read keeps
its own subject: an item that leaves the queue while it is open (another administrator decided it) does not vanish under the reader —
the pane re-reads its subject and says what became of it, by whom, from the record (`getApproval`'s `decidedByName`, a record's
`submittedBy`).

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

**At 1.9.0 (refreshed) — §26 settled what this table guessed at.** Its *Non-repudiation* now says that **an administrator's own duties —
approving or rejecting a release, recording UBC's answers, setting a project's quota — are theirs by definition, already name them, and
need no reason beyond what their own records ask**; the reason (`Manifest-Admin-Reason`) is for an administrator using an **owner's**
capability their place on the project does not give them. So the admission above was wrong in kind, not just early: a recorded
registration is not missing a reason, it never needed one. The table becomes:

| Decision (the console offers) | Reason | *What Instructor One will see* (the event's sentence and `actor`) |
|---|---|---|
| **Approve a release** | Optional, on the approval record (`ApproveReleaseRequest.reason`) — not in the sentence | *"Rich Tape approved this release for production."* — `actor.asAdministrator: false`, because approving is the role's own duty |
| **Reject a release** | **Required** (`RejectReleaseRequest.reason`), in the sentence and on the owner's checklist | The whole sentence, reason included |
| **Submit to UBC / file the change request** | None asked: the record's `reference` and day are what it keeps | *"Rich Tape recorded that the Manifest team submitted this app's production registration to UBC IAM on October 14, 2026 (ticket IAM-2026-0612)."* — or *"… filed a change request for this app's production registration with UBC IAM …"* (`launch/records.ts:928-930`) |
| **Hand back** | **None kept** — the operation takes no body | *"Rich Tape handed this app's production registration back to its owner, unsubmitted."* (`:1035`). **The console says so beside the button** and does not collect words it would drop (§4's rule, kept): *"Tell Instructor One why yourself — Manifest doesn't keep a reason for a hand-back."* A gap only if the team wants the reason recorded; noted, not filed (§10, A19) |
| **Record UBC's answer** | None asked | *"Rich Tape recorded this app's production UBC IAM registration as active (ticket IAM-2026-0612)."* (`:355-357`) |
| **Reject an agent's question** (the project's page) | **Required**, told to the agent word for word and in the sentence; and **`Manifest-Admin-Reason` too** when the administrator is no member — the console sends the one reason as both, and the field says it is written for two readers | The sentence, reason included, and `actor.asAdministrator: true` with the reason |

**What the console still does not offer** is every *owner's* action on someone else's project (§6) — now possible through the API with a
reason, and still the insider risk §3.5 names (§11 decision 8, revisited). An administrator who must act as an owner does it in the
reference console, which carries the reason (`packages/console/src/admin-reason.ts`).

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

**At 1.9.0 (refreshed):** an environment cell gains **how many instances the hostname reaches** (`Fleet.environments[].instances`) —
*healthy · 2* for a launched `class` app, *healthy · 3* for a `large_course` one, A1's sets made visible where an operator scans for them;
the audience column already says which count is right. **An archived project** (`state: archived`, `archivedAt`) is a row in muted ink
with *archived* in mono and is filtered out by default (a filter brings it back); `slugReserved` marks a deleted project's name still
held. **What the fleet still lacks** for this screen: `launchedAt` (A7 — the project has it, the fleet row does not, so *in production
since* costs a read per row and is not shown), **the data's U1 level** (A17 — the one column an administrator needs to know which apps
hold student data, and it is on no fleet read; the project's page reads it from the serving release's `config`), and pagination (A7).

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

**At 1.9.0 (refreshed) — what the page reads, section by section:**

| Section | Read | What it shows |
|---|---|---|
| **The head** | `getProject` | Name, slug, owner, blueprint and starter, audience (scale, burst, who set it and when), `launchedAt`, archived or not — and **the data's U1 level**, from the serving release's `config.<environment>.classification` (`getRelease`), because no project read carries it (A17) |
| **Environments** | `listEnvironments` and, per environment, `listInstances` | `TwoFacts` per environment: what serves, and what the last attempt did; **the set** — every instance with its `state` in words and raw, `serving` or not, `lastSeenAt`, and the release it runs; a failed member stays listed after its replacement, as the API keeps it |
| **Incidents** | `listIncidents` per environment | Newest first, **by `cause`** — *a deploy failed*, *a serving instance stopped and was replaced*, *it stopped and replacing gave up* — with the failed check, the diff since healthy, and the log tail in `InverseSurface`. An administrator's session reads a `high` project's staging and production Incidents (a token is refused them) |
| **Releases** | `listReleases`, `getRelease` | Each release's digest (`MachineValue`), who made it (A8: an id, named from the members when it can be), its scan in full, and which environment serves it |
| **The launch** | `getLaunchReadiness`, `getLaunchRecords` | The checklist in its console form — the raw `id` beside the words, `blocking`, `state`, `since`; the three records with who has each and since when. **From 1.10.0** (B's Task 5): the newest load rehearsals (`listLoadRehearsals`) with their result — built only if the operations are in the document when the page is built |
| **People and agents** | `listMembers`, `listTokens`, `listPendingActions`, `listAgentSessions` | Members and roles; tokens with capabilities, rate limit, expiry, last use, revoked, and **who minted each** (`mintedBy`, named from the members); agents' questions — pending ones with *reject* (§3.5), answered ones read-only; agent sessions |
| **Events, live** | `streamProjectEvents` (one socket, for the open page) | `EventLine`s from the replay, then live — **the actor's name, and when `asAdministrator` is true, *as a platform administrator* and the reason quoted with the system's left rule** |

**It still offers no owner's actions** (§11 decision 8, revisited): A1 is built — an administrator acting as an owner now gives a reason the
project's people read — but the console's job is the queue and *looking*. The one action on the page is rejecting an agent's question, the
safe direction. **And it cannot stop someone else's agent**: `revokeToken` answers anyone but the token's minter `404` (A14), so the only
administrator's stops for a runaway token on another person's project are owner's capabilities taken with a reason, in the reference
console: removing the token's minter from the project (their tokens are revoked with them — `member.removed`'s `tokensRevoked`) or
archiving the project. Both do far more than stop one token.

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

**At 1.9.0 (refreshed):**

- **Incidents** are read, not inferred: for each environment whose `latestIncidentAt` is within the window (the fleet narrows the
  fan-out), `listIncidents` — newest first, each with its `cause`. The panel leads with **`exit_stopped`** (a serving instance stopped
  and replacing gave up: production is short of its count until someone acts) in `attention` ink, then `exit` (stopped and replaced —
  worth knowing, not alarming), then `deploy` (a failed deploy; what serves is untouched). It still cannot say whether one is *open*
  (A9) — it says *"since"* and lets the fleet's serving state speak for now.
- **Certificates** read each project's `getLaunchRecords` — both registrations now (staging's too), each `certExpiresAt`. Amber within 90
  days, red within 14 (decision 14).
- **Scans** read the serving release of each environment (`getRelease`); `stale` and fixable findings as before — and the newest scan's
  `databaseAgeDays` stated as what it is: the age of the database *that scan used*, not the database's age now, which no operation reads
  (A13).
- **The page says what it cost**: *"Read 2 minutes ago from 31 reads"* — Health is the one screen still built by fan-out, and saying so
  keeps A9 and A13's price in view.

---

## 7a. Settings

*Added 2026-09-27 at Rich's request, after the first mockup.* **The spec's own line decides what is
here:** a platform administrator *"approves releases, sets quotas, manages blueprints and the model
catalogue, sees the whole fleet"* (§13's roles). **None of it has an operation** (A13), so every
value below was read from where the platform actually keeps it on 2026-09-27.

**The rule: show every setting and where it is set; change only what an administrator should change
from a browser.** Each row is a `SettingRow` — the setting, its key in mono, its value, *where it is
set*, and what can be done here. *Where it is set* is the column an operator most needs, because
today the answer is five different places.

| Section | What it holds, read from | Changed here? |
|---|---|---|
| **Quotas for new apps** | CPU 2, memory `2Gi`, 3 services, $50 of AI a month — `projects.quota`'s database default (`db/schema.ts`) | **Yes.** Changing a quota is one of the four actions that need step-up (§20); it applies to apps created afterwards, and a validated manifest is never re-checked against a later quota (§7) |
| **AI models** | The five logical models and each one's `max_classification` — `infra/litellm/config.yaml`, all served by `qwen3.5:4b` or `nomic-embed-text` on the host | **A model's clearance, yes.** An app declaring more is refused at its next validation (D17); nothing running changes |
| **Blueprints** | `node-ts-mongo@1` current, `@0` superseded — `listBlueprints` | No: a reviewed commit to this repository changes a blueprint |
| **Security scanning** | The vulnerability database's build time and how many days it stays fresh (§12's seven) | *Refresh* is offered and **admits it cannot run here yet**: it needs the network, and doing it from the console is a plan already placed |
| **Sign-in** | `MANIFEST_IDP_BASE_URL`, the rehearsal account (shown as *set*, never its value), UBC's staging IdP as **Waiting on UBC IAM** | No — and this section says which two settings change when UBC grants staging access |
| **Source code** | `MANIFEST_SOURCE_DRIVER`, the GitHub organisation, App and installation, the key and webhook secret as *set* | No: switching drivers is a restart and a host decision |
| **Addresses** | The three zones | No: a hostname is permanent once made (D26) |
| **Time limits** | The readiness and drain timeouts, an agent's question's 24 hours, a preview's 30 minutes | No: the last two are decisions in code, shown because the queue runs on them |
| **Administrators** | Who holds the role, since when, granted by whom, and why — `audit.role_changes` | **Never** (§11, decision 19) |

**A change is observed too.** Changing a quota or a clearance uses `ObservedAction`, headed *In the
audit log* rather than an owner's activity: a reason is required (§11, decision 20), the sentence
the change would record is shown before it is saved, and a quota asks for step-up on save.

**At 1.9.0 (refreshed): still no read or write (A13) — and §26 now names more settings than this table**: the monthly agent budget's
default and any one person's; the intake model (a catalogue change, with its step-up) and intake's bounds — a key's cap and life, the keys
a person may start in a day, the platform's monthly intake budget; the capable model's provider, model and level and its fallback, the AI
Gateway's address and the catalogue entries it answers; and whether the building agent of a project above the capable model's level may
call it. On this laptop those live in `.env` (`MANIFEST_CAPABLE_MODEL`, `MANIFEST_CAPABLE_MODEL_CLASSIFICATION`, `MANIFEST_GATEWAY_MODELS`,
`MANIFEST_AGENT_BUILDER_MODELS`, …), `infra/litellm/config.yaml` and column defaults. **The built console shows this screen read-only**:
the blueprints from `listBlueprints` (the one read there is), and for every other setting its name, its key in mono and *where it is
set* — facts about the platform, not values — with the value's cell an admission: *"Manifest can't read this yet."* Nothing on it
changes anything. A mockup that shows values (as the 2026-09-27 drawing does, read from where the platform kept them that day) is a
drawing; a console that shows them would be inventing them.

---

## 8. People, Spend and Audit — not designed, and why

**People** — members and tokens can be gathered project by project, but there is no user read, no
*last seen* (the `users` table has no such column), no other person's platform role, and
`audit.role_changes` is unreadable (A10). **Spend** — no operation at all; D8's per-user
attribution exists only inside LiteLLM (A11). **Audit** — events carry no actor field (a name, when
there is one, is inside the sentence), cannot be read across projects and cannot be filtered (A5);
drawing a filter by actor would be drawing a column that does not exist.

Designing these now would mean inventing their data. They join the rail when their APIs exist, and
§10 says what each needs. **What that costs:** the console answers *"which of 300 students spent the
budget"* and *"who did this"* not at all until then.

**At 1.9.0 (refreshed): still not designed.** Events now carry an `actor` (A5's first half, closed by faculty-ready), so *"who did this"*
is answerable **for one project at a time** on its page (§6) — but there is still no read across projects and no filter, so Audit has
nothing beneath it; People and Spend are unchanged (A10, A11). `getAgentBudget` answers the signed-in person's own budget only.

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
| `ConsoleRail` | `SideNav`'s sibling: its classes and colour, the *Operations* overline, the screens, Settings above the person, and the person's role |
| `DataTable` | A real `<table>`: `th scope`, `aria-sort`, a sticky header, 36px rows, tabular numerals, mono columns, a row that is a real link — and `striped` for a long table |
| `SettingRow` | One setting: its name and key, its value, where it is set, and what can be done about it here, with an editor beneath it while it changes |
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
tabular numerals) and a `mono-data` one; a dense row height; and `row-stripe`, a long table's
alternate row. Filters and the search field take `radius-sm`, not the pill. Each is contrast-checked against the
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

**At 2026-10-14 (refreshed) — the system has two copies, and the console builds on its own port.** The faculty front-end copied the
system on 2026-09-27 (manifest-app `packages/ui/reference/SOURCE.md`: *"Copied 2026-09-27 from manifest@3c38199"*), ported its
components to React 19 TSX held **markup-identical to `bundle.js` by a parity test** (`packages/ui/src/parity.test.tsx` evaluates the
bundle in a `node:vm` context under its own React and compares `renderToStaticMarkup` output), and has since **owned its stylesheets**
(*"fix it at source … we control the whole plane"*, Rich, F1 sitting 5). Measured 2026-10-14: its `bundle.js` is byte-identical to this
repository's, while its `tokens.css` differs from `design/system/tokens.css` in 119 lines and its `components.css` from `bundle.css` in
1,226. **So nothing in the faculty product loads `design/system/` any more**, and "one system, two products" is two copies of one
starting point (T3). This changes how `admin-ui` should load the system — §11 decision 12 is revisited: **`admin-ui` ports the
components it uses into TSX, held markup-identical to their references by the same kind of parity test** — the six shared components it
composes (`StateChip`, `Button`, `TwoFacts`, `InverseSurface`, `SegmentedControl`, `Choice`) against `design/system/components/bundle.js`,
and the fourteen operations components against `design/admin/components.js`, the mockup's own, which stays their reference. The
stylesheets are imported from `design/` as they are (tokens, `bundle.css`, `admin/components.css`), so the mockup and the console keep one
look. **The design system's own documents** (`README.md`'s *The operations surface*, the three-column vocabulary in `10-language.md`, the
console's paragraph in `20-states.md`, a README and `preview.html` per new component, the gallery regenerated) **stay this design's
proposal, not the build's work**: a parity test against the mockup's file holds the console to the drawing Rich changed, which is what
those documents would otherwise do; writing them is a design session's job when the faculty and operations systems are reconciled (T3).

---

## 10. What designing this found — the API

**None of these is assumed to exist, and none is built by this work.** Each says what it costs the
console today and the shape that would close it.

**THEIR STATUS AT 1.9.0 (refreshed 2026-10-14)** — the findings below are kept as they were written on 2026-09-27, and this table says
what has happened to each since. **A14–A21 are new** (A20 and A21 added by the plan's revision to its fresh review, `14cffdc`). None is
built by P11, which changes no contract.

| # | Status at 1.9.0 | What closed it, or what is left |
|---|---|---|
| **A1** | **CLOSED, but one remainder** | The faculty-ready plan (contract 1.6.0): `Manifest-Admin-Reason` on 24 operations, `400 ADMIN_REASON_REQUIRED`; `EventActor` on every event — `name`, `asAdministrator`, `reason`, `token`; `member.added`/`member.removed` written. §26 now says an administrator's own duties need no reason. **Left:** revoking a token still writes no event of its own (`token.minted` is the only `token.*` type; a revoke shows only as its side effects — a question `expired` with `cause: token_revoked`, a session `ended`) |
| **A2** | **CLOSED** by `listQueue` (the launch path plan's Task 12; the team's kinds by FE-46/47/5) | Two remainders, filed as A15 and A16 |
| **A3** | **CLOSED** | `ApprovalRequest` (`requestApproval`), the records' `sentAt`/`submittedAt`, each checklist item's `since`, each queue item's `since` |
| **A4** | **OPEN** | `Domain` (D28), an audience upgrade and a launch-item override are still unmodelled — the checklist's `domain` item is `met` by the canonical hostname alone (*"A custom domain is not offered yet"*, `launch/readiness.ts:219-225`), and `updateProject` changes only the name |
| **A5** | **HALF CLOSED** | The actor is on every event. **Left:** no read across projects, no filter, no read at all but a project's socket replay — Audit has nothing beneath it |
| **A6** | **RESOLVED by §26** | §26 lists *answering someone's agent* among the owner's capabilities that need the reason, and `confirmPendingAction` takes it. The console still offers reject only (decision 7) |
| **A7** | **PARTLY** | The fleet's environments carry `instances` (A1). **Left:** no `launchedAt`, no pagination, no department, domains or spend, and not what the last attempt did |
| **A8** | **PARTLY** | `Token.mintedBy` (an id) and `pending_action.created`'s `tokenMintedBy`; the minter is named in `EventActor.name`. **Left:** `Token.mintedBy` and `Release.createdBy` are ids with no name — the console names them from the project's members, and a person no longer a member is *"someone no longer on the project"* |
| **A9** | **PARTLY** | `listIncidents` per environment, each with `cause` (A1); 1.10.0 puts `cause` on `incident.opened` (FE-62). **Left:** no lifecycle — *open* cannot be answered |
| **A10** | **OPEN** | People: no read of users, last seen, others' platform roles, or `audit.role_changes` |
| **A11** | **OPEN** | Spend: `getAgentBudget` is the signed-in person's own; nothing reads anyone else's or a project's |
| **A12** | **OPEN** | `capabilities()` and custom-domain certificates |
| **A13** | **OPEN, and wider** | §26's settings list grew (§7a) and none has a read or a write. `quota:set` is still a capability no route uses |
| **A14** | **NEW** | **An administrator cannot revoke someone else's token.** `revokeToken`: *"Only its minter may revoke it; anyone else is answered `404 NOT_FOUND`"*. For a runaway agent on another person's project the administrator's stops are removing its minter from the project or archiving it — each an owner's capability taken with a reason, each far wider than one token. *Worth considering:* `revokeToken` for a platform administrator, with `Manifest-Admin-Reason`, writing a `token.revoked` event (which would also close A1's remainder) |
| **A15** | **NEW** | **`Queue.oldestSince` counts waits UBC holds.** It is *"the age of the oldest item"* — so a privacy assessment three weeks with the Privacy Office headlines as the administrators' staleness, which §26's *"a queue that is stale"* is not about. The console computes its headline from its own band's `since`s (§3.1). *Worth considering:* `oldestOnUsSince` beside it, or `heldBy` on each item (`us` / `ubc-iam` / `privacy-office`) so a client need not restate the kind → holder table |
| **A16** | **NEW** | **Agents' questions have no read across projects.** They are not in `listQueue` (rightly — §26: they are the minter's), so *"which agents are waiting on someone, platform-wide"* is a fan-out of `listPendingActions` over every project. The console does not build it; the project's page lists a project's |
| **A17** | **NEW** | **The fleet carries no data level.** `Fleet` has no `classification` and neither does `Project`; the level is per release, in `Release.config.<environment>.classification`. Which apps hold U1 `high` or `very-high` data is the first thing an operator filters by, and costs a read per project. *Worth considering:* the serving release's level on each fleet environment |
| **A18** | **NEW, at 1.10.0 (drafted)** | **Nothing says which project holds the one load rehearsal slot.** B's `LOAD_REHEARSAL_BUSY` deliberately names no other project to an owner — right for an owner — and no administrator's read says which run holds it. *Worth considering:* the running row on `listFleet` or a Health read |
| **A19** | **NEW, minor** | **A hand-back keeps no reason.** `returnIamRegistration` and `returnPrivacyAssessment` take no body; *"why it came back travels outside the record"*. The console says so beside the button (§4). Filed for the team to decide whether it wants one kept, not as a defect |
| **A20** | **NEW** (found after the plan's first draft; confirmed by its fresh review) | **Recording that UBC GRANTED a change request takes two writes.** `IAM_ARROWS.change_requested` is `['submitted', 'expired']` (`launch/transitions.ts:47`): there is no arrow to `active`. So a granted change is `change_requested → submitted → active`. The first write **re-stamps `submittedAt`** (`launch/records.ts:263-269`), so the queue item turns from `iam-change-request` into `iam-registration` with its `since` reset to that day (`queue.ts:290`) — if the second write never lands, the weeks UBC held it vanish from the queue and it reads as freshly submitted. `registeredAt` is kept (`records.ts:249-253`), so the registration stays in force and production is not interrupted between the writes (`readiness.ts:552`). Its event reads *"… recorded this app's production UBC IAM registration as submitted"* for what was UBC's answer. *Worth considering:* an arrow `change_requested → active` for a change filed from `active` (`changeRequestedFrom: 'active'`), which is UBC's answer to that change |
| **A21** | **NEW** (the plan's fresh review, I4) | **Nothing reads through which token a sign-off was asked.** `QueueItem` carries no token; no operation reads an `ApprovalRequest` (`requestApproval` is POST only; `getApproval` reads the decision); `approval.requested`'s `machineDetail.viaToken` is a boolean. The token's name is only the event's `actor.token`, on the project's stream. The console opens the stream to show it. *Worth considering:* `viaToken: { id, name } \| null` on `QueueItem` (or on a read of the open request) |

**And found on the way, not about the API (refreshed):** **T2 still stands** — the mock is one project, scripted by options, and keeps
no state but its idempotency record; `MANIFEST_MOCK_QUEUE=full`'s four extra items sit on projects it does not hold. The plan's first
build task answers it. **T3 — the design system has two copies** (§9, refreshed). **T4 — a fixture id is used twice in the mock**:
`OPERATOR_ID` (`fixtures.ts`, the faculty-ready plan's Task 10's administrator) and the `course-forum` project of
`MANIFEST_MOCK_QUEUE=full` (`launch.ts`'s `otherProjectsItems`) are both `12121212-1212-4212-8212-121212121212` — harmless while the
mock holds neither as the other kind, and exactly what a multi-project demo fleet must not repeat.

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

**A13 — Settings has no read or write.** §13 says an administrator sets quotas and manages blueprints
and the model catalogue. `quota:set` is a capability every administrator holds (`projects/authz.ts`)
and **no route uses it**; the default quota is a database column default, changed by a migration;
the catalogue is `infra/litellm/config.yaml`; host configuration is environment variables that
nothing reads back. *Worth considering:* `GET /v1/admin/settings`, answering each setting with its
value (a secret as *set* or *not set*), where it is set, and whether it can be changed here; and
`PUT` for the two that can — the default quota, behind step-up, and a catalogue entry's clearance —
each recording an actor and a reason.

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
| 1 | **The rail** (§2) — **Rich's call, 2026-09-27**, reversing this design's first choice of a top bar | The top bar, chosen first for width and so the two products would not look alike. What the rail costs, and how it is paid: 240px, so the queue's list narrows to 480px and the decision pane stacks its two columns in a narrow container; and the likeness, answered by the *Operations* overline and the role under the person's name | One component |
| 2 | **Four rail items now: Queue, Fleet, Health, Settings** | Seven, with admissions behind three — dead items in a daily tool are noise | Trivial |
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
| 16 | **Filters take `radius-sm`, not a pill** (Rich, 2026-09-27) | The pill of the first mockup | A token |
| 17 | **A long table is striped, subtly** (Rich, 2026-09-27) — `DataTable`'s `striped`, in a new `row-stripe` token between the card and the page, and quieter than hover so the row under the cursor still stands out. The stripe replaces the row rules. **A short table is not striped** — the administrators' list, the catalogue | Striping every table: on five rows it is noise | A prop |
| 18 | **Settings shows every setting and says where it is set, and changes only what an administrator should change from a browser** (§7a) — quotas and a model's clearance | Making everything editable: the source driver, the IdP's address and the zones are host decisions a browser should not make; showing only what is editable, which hides the configuration an operator most needs to read | Per row |
| 19 | **The administrator role is never granted from the console** | Granting it here: a stolen administrator's session could then make another. It stays with `scripts/admin-grant.sh` on the host | — |
| 20 | **A platform-wide change asks a reason too**, kept with the change | Only §26's rule, which is about someone else's project: a change to every app's quota is everyone's project | Per setting |

**Revisited at 1.9.0 (2026-10-14), and added:**

| # | Decision | Rejected | Cost of changing course |
|---|---|---|---|
| 5 | **RETIRED.** Every age is a recorded `since` (A3 closed); nothing is *up to* | — | — |
| 7 | **KEPT: agents' questions, reject only** — now on the project's page, not the queue. The API now allows a confirm with §26's reason (A6 resolved); an administrator saying *yes* to someone else's agent is still the insider risk §3.5 names | Confirm with a reason | Small |
| 8 | **KEPT, with its reason changed: no owner's actions in the console.** A1 is built, so the old reason (*"until A1"*) is gone; the reason now is the console's job — the queue and looking — and that every owner's action on someone else's app is the insider risk §3.5 names. They stay in the reference console, which carries the reason | Offering interventions (archive, remove a member) with `ObservedAction` | Per action — each a pane and its reason |
| 12 | **REVERSED: `admin-ui` ports the components it uses into TSX, held markup-identical to their references by a parity test** (§9, refreshed) — the faculty front-end's measured route since 2026-09-27; the stylesheets imported from `design/` as they are | Loading `bundle.js` as a classic script with React on `window` (the first decision): it makes an ungated file — `pnpm lint` ignores `docs/superpowers/design/**` by Rich's rule of 2026-09-27 — part of a shipped product, and a window global is an import the D22 boundary test cannot see | A parity test per component; a component's markup changes in two places |
| 13 | **REVISED: the mock gains a DEMO FLEET behind its own option (`MANIFEST_MOCK_FLEET=demo`)** — a dozen projects across every state the console draws, and **state for an administrator's decisions on them** (an approved release leaves the queue; a submitted registration moves to the UBC band), held per mock process and lost on restart. `mock-app` and every default answer unchanged | Stateless fixtures (P5c Decision 9) for the fleet too — an approval that does not take is the one thing a demo of the operator's work cannot show; a fixture layer inside `admin-ui` (bypasses the mock's validation against the contract) | A module in `packages/mock`; the option scopes it |
| 21 | **A queue row is one `QueueItem`; the pane reads what it shows** (§3.3) | Fanning out per row for the digest, scan and sensitive fields | A read per row |
| 22 | **The queue's headline is computed from the *waiting on us* band**, not read from `oldestSince` (A15) | `oldestSince`, which counts UBC's waits | One function |
| 23 | **The record-answer form offers only the platform's allowed moves, restated and held to the published sentence by a test** (§3.5) | Every state, leaving `LAUNCH_TRANSITION_INVALID` to say no | A table and its test |
| 24 | **Settings is read-only and shows where each setting is set, never a value it cannot read** (§7a, refreshed) | The mockup's values; leaving Settings out of the rail | — |
| 25 | **Built against the mock; served through the edge on the real platform by a later plan (P11b)** — the clicked half is on the demo fleet | Serving it through the edge now: a route on `console.manifest.internal` under `/admin` is an `infra/` change (the Docker tier owed) and the team's email's links would move with it | A Caddy route, Vite's `base`, and two links in `mail/team.ts` |

---

## 12. What this does not cover

- **Serving the console through the edge, signed in for real.** A built prototype would run against
  the mock on 7101 (§21 reserves it for *"Admin UI (Vite)"*). A hostname, the edge route, the session and the
  CSRF origin are the plan's to place — after the prototype, not before.
- **Building any of §10.** A1 first, and when is Rich's (ORIENTATION §8).
- **The platform's own maintenance** — `make doctor`, the vulnerability database, the machine
  cleanups. Refreshing the vulnerability database from a console is a plan already placed after the
  authoring API.
- **Narrow screens.** 1440 desktop, like the faculty design.

**At 2026-10-14 (refreshed):** the first bullet is now **P11b's** — P11 builds against the mock and is clicked there (§11 decision 25); a
path on the console's origin (`/admin/…`, served from 7101 by a Caddy route above the console's catch-all) needs no new origin, no CSRF
change and no SAML change (`safeReturnTo` accepts any same-origin path, `identity/login-state.ts:24`), and moves the team's email links
(`mail/team.ts`). The second is unchanged.

## 13. What a plan would do, if one is wanted

**WRITTEN 2026-10-14** — [`plans/2026-10-14-p11-admin-console.md`](./plans/2026-10-14-p11-admin-console.md), at Rich's *"Plan + review
now, build after approval"* (`3011e11`); its shape follows the paragraph below, with the demo fleet in the mock first and the design
system ported (decision 12, reversed). The paragraph is kept as it was written.

**None is written** (Rich, 2026-09-27): the mockup is the deliverable for now. If the console is
later built for real, the plan's shape would be: **the measurements and the mock's admin fixtures first**; then **the
design-system additions**, each with its preview; then **`admin-ui`'s skeleton** — the package, D22's
import boundary copied from the reference console, the system loaded, the rail, the router, the
generated client against the mock — and the queue's assembly; then **the queue and the approval
pane**; then **the other panes and `ObservedAction`**; then **the fleet and the project's page**;
then **Health**; and last **the acceptance** — the queue clicked by a person against the mock,
negative controls that are made to fail, and a whole-branch review.

**It would start after the authoring API plan's sitting 10 closes.** A new workspace package moves
`pnpm test`'s count, and that sitting's acceptance asserts it exactly. **The mockup's components are
the head start**: they are written in `bundle.js`'s idiom so they move into the shared system as they
are, and the page's composition is what `admin-ui` would build against the mock.
