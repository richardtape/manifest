# Spec actions for FE-46, FE-47 and FE-5 — the Manifest team's step, a change to a live registration, and a question that says what it asks

> **DRAFTED 2026-10-01, OVERNIGHT, BY `manifest-9f`.** Rich started this platform session for document work only. The faculty
> front-end's overnight coordinator, `manifest-app-3a`, delegated the drafting to it under the arrangement Rich made. The planning
> session (`manifest-60`) normally drafts spec actions, and it had ended. **NONE IS APPLIED. Applying one is Rich's word**, given
> after he has read its words. The four shared HTML pages are then swept with it. **Where they go in the plan order is his too**
> (*Placement*, at the end).
>
> **What they rest on.** Rich confirmed FE-46, FE-47 and FE-5, option (a) each, on 2026-10-01 at 19:56 PDT (*"i approved"*), in the
> launch path plan's sitting 9 (`manifest-6d`). He said each is *"a spec action for the planning session before it is a task"*. His
> words, and the three as he confirmed them, are in [`../2026-09-30-decisions.md`](../2026-09-30-decisions.md), its *2026-10-01,
> evening* section. The front-end's full texts are `~/Developer/manifest-app/docs/api-findings.md`, FE-46, FE-47 and FE-5. They
> were read, not edited. **Every *Today* below was read from the code at `df62a72`** (contract `1.5.0`, 72 operations). The spec's
> words are quoted from `specs/2026-08-29-manifest-platform-design.md` as it stands at `df62a72`, with its line numbers.
>
> **Each takes the house shape of the launch path plan's *Spec actions*.** In order:
> - why it exists, and what the code does today;
> - the decisions this draft made itself, and why;
> - what is Rich's to decide;
> - the proposed words, and the options;
> - what a plan would then build;
> - the shared pages it moves.
>
> In the proposed words, bold is the spec's own emphasis, not a diff marker, and ⟶ separates the current words from the
> proposed ones.

## What Rich decides

1. **Spec action 1, FE-46: apply it as worded**, and make two choices inside it:
   - whether the Manifest team may hand a send back unsubmitted (recommended: **yes**);
   - whether every gap in the assessment must be answered (recommended: **yes**).
2. **Spec action 2, FE-47: how the record says a change is with the team.** Recommended: **(a)**, the state `sent`, recording
   where the record was sent from. That is the pattern Rich chose for `change_requested`. Or **(a′)**, a state of its own.
3. **Spec action 3, FE-5: apply it as worded.**
4. **Where they go in the plan order.** Recommended: **one small plan of their own, right after the launch path closes and before
   *faculty-ready***.

Spec action 2 builds on 1: it is 1's send, made from `active`. Spec action 3 stands alone.

---

## 1. FE-46 — §6, §9, §13, §21, §26, §27 and D24: the owner sends each launch record to the Manifest team, which submits it to UBC; the team is emailed; the assessment's gaps are answered

**Why.** The front-end's F5b design session (`manifest-app-d9`) relayed Rich's words, and he confirmed them on 2026-10-01 at 19:56
PDT:
- *"Sent to LTIC. And then submitted to PRISM by LTIC."* All three records go through LTIC, the team that runs Manifest. LTIC
  submits the assessment to PRISM and the registrations to UBC IAM.
- *"It emails us and we fill out the appropriate forms."* The platform tells LTIC, not the front-end's server.
- Of the sign-off request: *"Yes, and email it too."*

**Today** (`df62a72`):
- **The owner's *"I've sent it"* moves a record `draft → submitted`.** The operations are `submitIamRegistration` and
  `submitPrivacyAssessment`. They need `launch:submit`, from a session only: they are person-only, held by the owner, a
  collaborator or an administrator. The move stamps `submitted_at` with a day the person names (`launch/records.ts:557-668`,
  `:674-729`).
- **Every reader takes `submitted` to mean *with UBC*:**
  - the operations' own summaries, such as *"Say a registration request was sent to UBC IAM"* (`api/routes/launch.ts:366`, `:420`);
  - the checklist's *waiting since* (`launch/readiness.ts:468-471`, `:899-911`);
  - the queue's items, such as *"…was sent to UBC IAM on …: record UBC IAM's answer when it comes"* (`launch/queue.ts:190-199`,
    `:239`).
- **UBC's order gates that move**, by `LAUNCH_PIA_NOT_APPROVED` and `LAUNCH_STAGING_NOT_REGISTERED` (`launch/records.ts:579-611`).
- **Nothing emails anybody.** The control plane has no mail client: there is no `smtp`, `nodemailer` or Mailpit under
  `packages/control-plane/src`. Mailpit, §21's tenth container on 7111/7112, is where the front-end's server sends its mail.
- **The assessment's gaps are bare strings** (`launch/assessment.ts:33-39`). The send carries `sentAt`, `reference` and
  `draftGeneratedAt`, and nothing else (`launch/records.ts:452-465`).

**Decisions this draft makes.** Each is routine, so it is made here and written down. Each is cheap to change before the plan is
written.

1. **The new state is `sent`.** FE-46: *"the names are the platform's to choose"*.
   - **`submitted` keeps its meaning: with UBC.** So no description of `submitted` changes meaning, and neither does any queue
     item or any row already `submitted`.
   - Only the owner's action moves, from `→ submitted` to `→ sent`. The team's record takes `sent → submitted`.
   - On a row left from before the change, `submitted_by` names the owner rather than the administrator who recorded the
     submission. No reader tells the two apart, and the laptop holds no real record.
2. **The spec calls the team *the Manifest team***, which is §19's own name for it, and says once, in §9, that at UBC it is LTIC.
3. **The send is made in Manifest, so its moment is the send itself.** Today's `sentAt` is a day the person names, with its checks.
   It moves to the administrator's record of the team's submission. That is when somebody does something outside Manifest.
4. **UBC's order gates the owner's send**, as it gates *"I've sent it"* today.
   - **The team's record that it submitted what was sent is an administrator's record, and is never refused for order.** This is
     Spec action 9's rule for UBC's answers, carried to the step before them.
   - What the record records was already held to the order when it was sent.
5. **One address, set as deployment configuration**, like the platform domain. **Not a §26 platform setting**:
   - where the team's work arrives is an operational fact of a deployment;
   - a setting would need its own audit and its own screen;
   - making it a setting later costs a settings row and moving the value into it.
6. **The email carries nothing a person wrote**: not the draft, not the owner's answers, not a sign-off request's note.
   - An email leaves the platform's access control: a relay, mailboxes, forwarding. The console is where reading is authorised
     and audited.
   - The email says which app, what was sent or asked, and by whom, and links to the item.
   - FE-46 left this to the platform: *"if the platform prefers them read in the console"*. The sign-off request's note is already
     settled. FE-46 as Rich confirmed it, in the decisions record, emails LTIC *"when `approval.requested` is published (never the
     note)"*.
7. **An email that cannot be delivered never undoes or refuses the send.** It is logged with an operator line.
   - The record and the queue are the source of truth; the email is only how the team hears of it.
   - CLAUDE.md names a swallowed failure as this codebase's most productive defect, so the failure must never be silent.
8. **The record keeps the state each send left: `sent_from`** (`draft` \| `change_requested` \| `expired`, while the record is
   `sent`; null otherwise). This is the pattern Rich chose for `change_requested` on 2026-10-01 (Spec action 10).
   - A registration is sent from three states (`SUBMIT_ARROWS`, `launch/transitions.ts:103-106`).
   - Where a send handed back by the team returns to depends on which state it left (under (i), below).
   - So does how a launched app's checklist reads the record. A lapsed registration that went back to `draft` would read as
     registered, because that item reads `registered_at` and, among the states, only `expired` (`launch/readiness.ts:507-518`).
     Today's code already has this hole one step later (*Found while drafting*, at the end of this action).
   - An assessment is only ever sent from `draft`, so it needs no such column.

**Rich's, inside it.** Each comes with a recommendation.

- **(i) May the team hand a send back unsubmitted?** FE-46 does not say.
  - **The gap.** Without a way back, a send the team cannot submit has no route back except an email outside the record. Two
    examples: a gap answered with nothing the team can use, or the wrong draft.
  - **Recommended: yes — back to the state it was sent from** (`sent_from`, decision 8). For an assessment that is `draft`; for a
    registration it is `draft`, `change_requested` or `expired`. It is an administrator's record (`launch:record`, person-only),
    and the owner then sends again. The reason travels as UBC's questions do today, outside the record (FE-46's *Not asked
    here*).
  - *Or:* no arrow back. The team sorts it out with the owner by email and submits. The record then keeps what the owner sent
    rather than what was submitted.
- **(ii) Must every gap be answered before the assessment is sent?**
  - **Recommended: yes**, and an answer may say it does not apply. A send with a gap unanswered sends the team back to the owner
    by email, which is what FE-46 exists to end.
  - *Or:* answers are optional, and the email says how many are missing.

**Proposed: twelve edits.**

1. **§6, `IamRegistration`** (l.338). The state list *"`state` (`draft` \| `submitted` \| `active` \| `change_requested` \|
   `expired`)"* ⟶ *"`state` (`draft` \| `sent` \| `submitted` \| `active` \| `change_requested` \| `expired`), `sent_from` (`draft`
   \| `change_requested` \| `expired` — while `sent`: the state it was sent from, and where it returns if the team hands it back;
   null otherwise)"*. And *"…`external_ticket_ref`,
   `submitted_at`, `submitted_by`, `generated_package` — one per environment that signs people in against UBC"* ⟶
   *"…`external_ticket_ref`, `sent_at`, `sent_by`, `submitted_at`, `submitted_by`, `generated_package` — one per environment that
   signs people in against UBC. `sent_at` and `sent_by` are the owner's send to the Manifest team; `submitted_at` is the day the
   team submitted it to UBC IAM, and `submitted_by` the administrator who recorded that"*. (Spec action 2 adds a field and a
   value to the same row. *The two rows, composed*, at the end of action 2, gives the final text.)
2. **§6, `PrivacyAssessment`** (l.339). *"`state` (`draft` \| `submitted` \| `approved`), `reviewer`, `approved_at`,
   `external_ticket_ref` (the PIA number), `submitted_at`, `submitted_by`"* ⟶ *"`state` (`draft` \| `sent` \| `submitted` \|
   `approved`), `reviewer`, `approved_at`, `external_ticket_ref` (the PIA number), `sent_at`, `sent_by`, `gap_answers` (each gap's
   id and the owner's answer, as sent), `submitted_at`, `submitted_by`"*.
3. **§9, *Production*** (l.752-756). *"`IamRegistration` tracks state (`draft → submitted → active`, plus `change_requested` and
   `expired`) against an external ticket reference. **The owner moves it to `submitted`** — *I've sent it* — with the day they
   sent it, which is how Manifest can say how long it has waited; **UBC's answers are an administrator's record**. The same holds
   for a `PrivacyAssessment`."* ⟶

   > *"`IamRegistration` tracks state (`draft → sent → submitted → active`, plus `change_requested` and `expired`) against an
   > external ticket reference. **The owner sends it to the Manifest team from Manifest** — at UBC, LTIC, the team that runs it —
   > and it moves to `sent`; **the team submits it to UBC IAM and records that it has**, with UBC's reference and the day, and it
   > moves to `submitted`; **UBC's answers are an administrator's record**. The same holds for a `PrivacyAssessment`, which the
   > team submits to the Privacy Office, through PRISM. Each step is dated, which is how Manifest can say who has it and for how
   > long."*

   The paragraph's last sentence (*"A registration no reviewer has registered gates nothing…"*) is unchanged. *"Through PRISM"*
   is Rich's word, relayed; drop it if the spec should not name UBC's system.
4. **§9, *Production*** (l.760-763). *"What UBC decides — a registration `active`, an assessment `approved` — is an administrator's
   record of UBC's answer, and is never refused for order."* ⟶ *"What UBC decides — a registration `active`, an assessment
   `approved` — is an administrator's record of UBC's answer, and is never refused for order; **nor is the team's record that it
   submitted what the owner sent**, which was held to the order when it was sent."* Spec action 9's sentence, *"The production
   registration is sent only once the staging registration is `active`"*, stays: *sent* is now the owner's send to the team, and
   that send is what is gated.
5. **§9, *Privacy Impact Assessment*** (l.794-798). After *"…rather than leaving it out."*, add:

   > *"**Each gap has a stable id, and the owner answers every one when they send the assessment** — an answer may say it does not
   > apply. The answers are kept on the record beside the draft as it was sent, and shown to administrators, who carry them into
   > the Privacy Office's form. A front-end may suggest an answer from what it knows of the app; what is kept is what the owner
   > sent."*

   Under (ii)'s other option, *"answers every one"* ⟶ *"answers what they can"*, and *"— an answer may say it does not apply"* is
   dropped. In both versions, *"`PrivacyAssessment` tracks `draft → submitted → approved`"* ⟶ *"`PrivacyAssessment` tracks
   `draft → sent → submitted → approved`"*.
6. **§9, *Toward automated submission*** (l.802-803). *"Today Manifest **drafts and tracks**; a person submits, and colleagues at
   UBC IAM and the Privacy Office review."* ⟶ *"Today Manifest **drafts and tracks**; the owner sends, a person on the Manifest
   team submits, and colleagues at UBC IAM and the Privacy Office review."* The section's *"submitted by a human, with a ticket
   reference pasted in"* stays true.
7. **§13** (l.1589-1590). *"Each of the three is drafted by Manifest and sent by the owner, and each says, while it waits, how long
   it has waited."* ⟶ *"Each of the three is drafted by Manifest, sent by the owner to the Manifest team, and submitted by the team
   to UBC, and each says, while it waits, **who has it and for how long** — the team from the day the owner sent it, UBC from the
   day the team submitted it."*
8. **§26, the queue's table** (l.2897-2898). Two rows.
   - *"| IAM registration to submit or amend | `IamRegistration` (D19) | admin + UBC IAM |"* ⟶ *"| IAM registration to submit or
     amend | `IamRegistration` (D19): `sent` — the owner sent it, for the team to submit to UBC IAM; `submitted`, or a change
     request filed — with UBC IAM, for its answer to be recorded | admin + UBC IAM |"*.
   - *"| Privacy assessment to review | `PrivacyAssessment` | owner, then Privacy Office |"* ⟶ *"| Privacy assessment to submit |
     `PrivacyAssessment` (D19): `sent` — the owner sent it with their answers, for the team to submit to the Privacy Office;
     `submitted` — with the Office, for its answer to be recorded | admin + Privacy Office |"*.
9. **§26, a paragraph** after *"…and a queue that is stale is not."* (l.2906):

   > *"**The Manifest team is told, not left to look.** When an owner sends a launch record (§9), or asks for a release's sign-off
   > (§13), Manifest emails the team's address — one address, set as deployment configuration — saying which app, what was sent
   > or asked, and by whom, with a link to the item in the admin console. The email carries nothing a person wrote: not the draft,
   > not the owner's answers, not a sign-off request's note. Those are read in the console, where reading is authorised and
   > audited. An email that cannot be delivered is logged and changes nothing else: the queue is the record, and the email is how
   > the team hears of it."*
10. **§21, Mailpit's row** (l.2142). *"The laptop's mail sink: the faculty front-end's server, and later the platform's own
    notices, send to it."* ⟶ *"The laptop's mail sink: the faculty front-end's server, and the platform's own emails to the
    Manifest team (§26), send to it."*
11. **D24** (l.220), the person-only sentence. *"recording UBC's IAM registration or Privacy Office assessment, or saying that a
    request to either was sent (§9)"* ⟶ *"recording UBC's IAM registration or Privacy Office assessment, or sending a request for
    either to the Manifest team (§9)"*. Nothing else in the sentence moves: *"three of them are records that a named person
    decided"* still holds, because a send is a named person's act.
12. **§27, *What forking does inherit*** (l.3015). *"The owner still reviews, signs and submits their own"* ⟶ *"The owner still
    reviews, signs and sends their own"*.

**How it composes with the spec actions already applied.** Edit 11 replaces Spec action 3's clause in D24. Spec action 8's
rehearsal clause is untouched. Spec action 9's ordering words stay, read as the owner's send (edit 4).

**Options.** These are FE-46's own:
- **(a) as proposed.** Recommended; it is Rich's choice as confirmed.
- **(b) the owner's send read as *sent to LTIC*, and an administrator's ticket as *now with UBC*, with no new state.** Rejected by
  Rich: it is a state read from a field, and the queue and the stream would still say UBC has the record.
- **(c) the front-end waits.** Rejected by Rich.

**What a plan would then build.** None of this is decided here. It is listed so that the cost is visible.
- **`db/`:** `sent` added to two Postgres enums (`ALTER TYPE … ADD VALUE`); `sent_at` and `sent_by` on both tables; `sent_from` on
  registrations; the assessment's answers, as sent.
- **`launch/transitions.ts`:** `draft → sent`, and the same from `change_requested` and `expired`; `sent → submitted`; and under
  (i), `sent →` the state in `sent_from`. `SUBMIT_ARROWS` (`:103-106`) becomes the send's arrows.
- **`launch/records.ts`:** the send, with its gates moved unchanged; the administrator's record of the submission, with the day and
  UBC's reference; and the answers, checked against the draft's gap ids.
- **`launch/assessment.ts`:** a stable id for each gap.
- **`launch/readiness.ts` and `launch/queue.ts`:** who has a record, and since when; the queue's kinds for a record the team
  holds. A launched app's checklist reads a registration that is being sent again after it lapsed as lapsed — `sent` from
  `expired`, and then `submitted` — until UBC registers it again (*Found while drafting*, below).
- **The platform's first mail client.** An SMTP client, with the team's address and the relay as configuration, and Mailpit on the
  laptop (offline, C1). `make doctor` and `make verify` check it. It sends from the same places that publish the events it follows.
- **The contract.** Two operations change meaning, or are renamed; `SubmitLaunchRecordRequest` gains the answers; two enums gain a
  value. That is a version bump, and the faculty front-end is told before it lands.
- **The other clients and the acceptance:** the mock's launch stages (`MANIFEST_MOCK_RECORDS` gains a stage); the console's
  *Launch records* and *Queue*; the guide *Launching*; and **`make demo-launch`**. The launch path's sitting 12 is about to make that
  demo the acceptance of today's shape.
- **Events:** one when a record is sent, and one when the team submits it. The existing `…submitted` events move to the team's
  record.

**Shared pages.**
- **`manifest-decisions.html`.**
  - **D19:** *"The owner says when each was sent, so Manifest can say how long it has waited."* ⟶ *"The owner sends each to the
    Manifest team, which submits it to UBC, so Manifest can say who has each and for how long."*
  - **D24:** *"(or that a request was sent to them)"* ⟶ *"(or sending a request to them, through the Manifest team)"*.
- **`manifest-phases.html`.**
  - **Stage 2:** *"A faculty member sends the documents Manifest drafts for them in the university's order … — and sees how long
    each has waited"* ⟶ *"A faculty member sends the documents Manifest drafts for them to the Manifest team, which submits them in
    the university's order … — and sees who has each and how long it has waited; the team is emailed whenever something is sent or
    a sign-off is asked for"*.
  - Its *What waits*, *"Today Manifest drafts both documents and a person submits them"*, stays true. Check it.
- **`manifest-schematic.html`:** the going-live mock-up's *"With the Privacy Office since 6 May"* describes a record after the
  team's submission, so it stays true. Check it.
- **`manifest-stories.html`:** *"it drafts both documents …, submits them, tracks them"* is truer than before. Check it; it should
  not change.

**Found while drafting: a defect in today's code.** It was found BY READING, and is unmeasured, because this session runs no Vitest.
- **The path.** A launched app's production registration lapses, and an administrator records it `expired`. Its owner then says
  they sent it again, and `submitIamRegistration` moves it `expired → submitted` (`SUBMIT_ARROWS` allows it). The update sets
  state, `submitted_at`, `submitted_by` and the reference, and keeps `registered_at` (`launch/records.ts:633-645`). An
  administrator's `recordIamRegistration` can make the same move (`IAM_ARROWS`, `launch/transitions.ts:46`), and it keeps
  `registered_at` too (`launch/records.ts:226-229`). Nothing in the control plane clears it.
- **What the checklist then reads.** The launched-app checklist item, `liveRegistrationItem`, is unmet for a null `registered_at`
  and for `expired`, and for nothing else among the states (`launch/readiness.ts:507-518`). So once the registration is re-sent, it
  reads **`met`** for any release that asks for nothing more (`:520-545`).
- **The consequence.** A launched app whose registration has lapsed deploys to production self-serve again from the day its owner
  says they re-sent it, before UBC has registered anything. That contradicts the item's own words: *"nothing reaches production
  until UBC IAM registers it again and an administrator records it 'active'"*.
- **No test reaches the path.** In `launch/readiness.test.ts`, `'expired'` appears only in a type (l.148).
- **Who it is for.** The launch path plan's sitting 12, whose whole-branch review covers Task 9, should measure it: a test that
  goes red first. Or FE-46's plan, which rewrites this arrow; its *What a plan would then build* names the fix.
- **Not for the spec.** The spec is not in question. §9's certificate lifecycle and D20 already treat a lapsed registration as one
  to re-register.

---

## 2. FE-47 — §6, §9, §13 and §26: after launch, the owner asks for a change to a live registration, through the Manifest team

**Why.** Rich's word, relayed by `manifest-app-d9` (*"File FE-47, as FE-46"*), confirmed on 2026-10-01 at 19:56 PDT. A change after
launch may need one more sign-in detail, which is a CWL attribute. It goes to LTIC, which files it with UBC IAM as a change request.

**Today** (`df62a72`):
- **An owner has no write on an `active` registration.**
  - `draftIamRegistration` drafts only from `draft`, `change_requested` or `expired`, and refuses the rest with `409
    LAUNCH_RECORD_SUBMITTED` (`launch/records.ts:748`, `:994-995`).
  - The send moves a record only from those three (`launch/transitions.ts:103-106`).
- **Only an administrator files a change request**, with `recordIamRegistration` to `change_requested` and `requestedAttributes`
  (`launch/records.ts:75-94`; `change_requested_from: active`, Spec action 10). Nothing tells them that an owner wants one.
- **Every build that asks for the new attribute fails meanwhile, the sandbox's included.** `assertAttributesRegistered` checks each
  build against production's `registered_attributes` once `registered_at` is set, and names a change request on file
  (`releases/build.ts:325-360`).
- **A launched app's registration is judged by what UBC registered, not by its state.** For a launched app, the checklist item
  reads `registered_at` and `registered_attributes`; among the states it reads only `expired` (`launch/readiness.ts:493-545`). So a
  live registration that leaves `active` while a change is asked for does not stop a release that asks for nothing more. That is
  right for a change. It is wrong for a lapsed registration sent again: action 1's *Found while drafting*.

**Decisions this draft makes:**
1. **It is FE-46's send, made from `active`.** It uses the same capability (`launch:submit`, person-only), the same gates, the same
   email, the same *waiting since* and the same queue.
2. **It applies to either registration.** Staging's is `active` too once it is registered, so the words need not say production.
3. **The change's package is drafted from the newest valid manifest**, as staging's is (FE-47), and it replaces the stored package.
   What UBC registered stays in its own columns (`entity_id`, `acs_url`, `registered_attributes`, `registered_at`), so nothing
   registered is lost.
4. **The build's check stays as it is** (FE-47's *Not asked here*). It keys on `registered_at`, so the state moving neither loosens
   it nor tightens it.

**Decide: how the record says a change is with the team.**
- **(a) `sent`, recording where it was sent from.** Recommended.
  - **The move:** `active → sent`, and `active` becomes a fourth value of action 1's `sent_from`.
  - **The state says who has it:** the team.
  - **The column says what the team does next.** From `active`, the team files a change request: `sent → change_requested`, with
    `change_requested_from: active`, as an administrator files one today. From anything else, the team submits: `sent →
    submitted`.
  - **This is the shape Rich chose for `change_requested` on 2026-10-01** (*"(a) Record the origin"*, Spec action 10): one state
    for each holder, the origin recorded beside it, and no enum value a client must learn twice.
- **(a′) a state of its own, `change_sent`**, with `sent_from` keeping its three values. Nothing about a change is read from the
  column. But it is a second *with the team* state, which every client must handle: the front-end, the mock and the console. That
  is the cost Rich declined for `change_requested`.
- *(b) no path, and (c) the front-end's server emailing LTIC with nothing recorded, were both rejected by Rich.*

**Not asked, and worth asking.** Neither blocks the words.
- **Does a change go in UBC's order too, with staging's registration changed and tried before production's?**
  - As (a) is worded, a change to production's registration is gated as every send is: the assessment approved with its
    reference, and staging's registration `active`. Staging's need not change first.
  - This has the shape of §8's open question *"does a re-submission wait for UBC's order too?"*, and it is UBC's to say.
- **Does a new attribute need the privacy assessment amended?**
  - A new attribute is new personal information collected: §9's first PIA row is derived from `auth.attributes`.
  - Nothing here re-opens the assessment.
  - It is a question for the Privacy Office, on the external track, beside FE-24's questions.

**Proposed: four edits.**
1. **§6, `IamRegistration`.** Under (a), two changes to the row:
   - `sent_from` gains `active`;
   - the row gains `requested_attributes`, which the code has had since P6b and the row never listed. FE-47 makes it the owner's to
     set.

   Found while drafting: the row also omits `registered_at` and `recorded_by`. They are left to a reconciliation, because neither
   is this action's.
2. **§9, *Production***, the paragraph *"**Attribute drift is a build-time failure…**"* (l.765-769). After *"…long before a student
   would have hit a broken login."*, add:

   > *"**The owner asks for the change from Manifest**: from an `active` registration they send the attributes wanted, with a
   > package drafted for them from the newest valid manifest, to the Manifest team, which files the change request with UBC IAM.
   > The registration says who has it and for how long, as a first one does, and the build keeps failing until UBC has registered
   > them."*
3. **§13, *Gate*, item 2** (l.1602-1605). *"…additionally requires an IAM change request to reach `active` before the release can
   deploy (§9)."* ⟶ *"…additionally requires an IAM change request — which the owner asks for, through the Manifest team (§9) — to
   reach `active` before the release can deploy."*
4. **§26, the IAM row**, as action 1's edit 8 words it, gains: *"`sent` from `active` — a change for the team to file with UBC
   IAM"*.

**The two rows, composed** — if action 1 is applied, and action 2 as (a). Each is one line in §6's table, so each is given here as
one line, ready to paste:

```text
| **IamRegistration** | `id`, `project_id`, `environment` (`staging` \| `production`), `entity_id`, `acs_url`, `slo_url`, `cert_fingerprint`, `cert_expires_at`, `registered_attributes`, `requested_attributes` (what a change request asks UBC IAM for), `state` (`draft` \| `sent` \| `submitted` \| `active` \| `change_requested` \| `expired`), `sent_from` (`draft` \| `change_requested` \| `expired` \| `active` — while `sent`: the state it was sent from, and where it returns if the team hands it back; `active` is a change asked of a live registration, which the team files as a change request; null otherwise), `change_requested_from` (`submitted` \| `active` — while `change_requested`: whether UBC asked the owner for changes, or a change request was filed with UBC; null otherwise), `external_ticket_ref`, `sent_at`, `sent_by`, `submitted_at`, `submitted_by`, `generated_package` — one per environment that signs people in against UBC. `sent_at` and `sent_by` are the owner's send to the Manifest team; `submitted_at` is the day the team submitted it to UBC IAM, and `submitted_by` the administrator who recorded that |
| **PrivacyAssessment** | `id`, `project_id`, `generated_draft`, `state` (`draft` \| `sent` \| `submitted` \| `approved`), `reviewer`, `approved_at`, `external_ticket_ref` (the PIA number), `sent_at`, `sent_by`, `gap_answers` (each gap's id and the owner's answer, as sent), `submitted_at`, `submitted_by` |
```

One consequential phrase in the composed row: `change_requested_from`'s *"an administrator filed a change request with UBC"* becomes
*"a change request was filed with UBC"*. Under (a), the owner may be the one who asked, and the team files it.

**What a plan would then build:**
- `DRAFTABLE` gains `active` (`launch/records.ts:748`);
- the send's arrows gain `active → sent`, and the team's record gains `sent → change_requested` (from `sent_from: active` only);
- `sent_from`'s enum gains `active`;
- the send carries the attributes wanted, checked against the drafted package's;
- the queue's item for a change to file;
- the mock, the console, the guide, and the demo's change leg.

**Shared pages.**
- `manifest-schematic.html`: *"Approval is asked for again only when the app starts asking for … more personal information about
  students"* stays true. Check whether it should also say that UBC's registration goes back through the team. Recommended:
  unchanged.
- `manifest-decisions.html`: D16, and D27's *"Changing it afterwards means going back through that registration"*, stay true. Check
  them.
- `manifest-phases.html` and `manifest-stories.html`: check them.

---

## 3. FE-5 — §6 and D24: a question an agent raises says what it is asking

**Why.** Rich carried FE-5 with FE-47 (*"Build it honest, carry FE-5 now"*) and confirmed option (a) on 2026-10-01 at 19:56 PDT:
the question carries the specific object it would act on, taken from the request and never a secret.

**Today** (`df62a72`):
- **A `PendingAction`'s `payload` is a fingerprint**: the method, the concrete path, `bodySha256`, and the route definition's own
  `summary` (`tokens/pending.ts:60-73`; the column's type, `db/schema.ts:516-521`).
  - So a person asked to confirm reads *"Add or change a member"* or *"Deploy a release to an environment"*. They do not read who,
    or which release.
  - The event says the same: *"An agent asked to add or change a member…"* (`tokens/pending.ts:211`).
- **Three operations can raise one**:
  - `addMember` and `removeMember`, with `members:manage` (`api/routes/project-reads.ts:403-414`, `:535-550`);
  - `deploy` to production, with `release:promote` (`api/routes/releases.ts:1067-1082`).

  `quota:set` and `secret:read`, the rest of D24's four, have no route a token can reach.
- **A launch record never raises one.**
  - `launch:submit` and `launch:record` are person-only (`projects/authz.ts:202-209`), and their routes take a session alone. So a
    token is refused outright (`403 TOKEN_CREDENTIAL_REFUSED`), and is never given a question.
  - So FE-5's *"for a launch record, which one"* has no case under D24 as it stands. The general rule below covers any later
    operation that raises one.
- **§6 names `payload` but says nothing of what it holds.** **§26 already asks for more**: *"Each item shows what is being asked, by
  whom, what changes if it is granted"* (l.2903). This action is where the pending action meets §26.

**Decisions this draft makes:**
1. **The object is drawn from the same request the confirmation is bound to**, through its hash. What a person reads is what the
   retry does.
2. **A person is shown as the request named them, and by name when the platform knows them.**
   - `addMember` names a person by PUID, CWL login or email (`api/representations/members.ts:44-60`).
   - `removeMember` names them by a user id in its path.
   - An id alone answers nobody's question.
3. **"Never a secret" means never a field the operation declares secret.** No privileged operation takes one in its body today. The
   rule is for the next one that does.
4. **The event may name the object too, because it is not the body.** The event's rule stays: it *"carries NEITHER the body nor its
   hash"* (`tokens/pending.ts:190`).

**Proposed: two edits.**
1. **§6, `PendingAction`** (l.342). After *"…are one decision at two moments"*, add:

   > *"**`payload` is what was asked, never the request itself**: the method and the concrete path, a hash of the body so a client
   > can match its own request, the operation's summary, and **the specific thing it would act on, taken from the request and never
   > a secret** — for adding or changing a member, the person as the request named them and the role; for removing one, who; for a
   > deploy, which release and which environment. A person asked to confirm reads exactly what the retry would do."*
2. **D24** (l.220). *"requesting one of those creates a **pending action** a human confirms interactively."* ⟶ *"requesting one of
   those creates a **pending action**, saying exactly what it would do and to what, that a human confirms interactively."*

**Options:**
- **(a) as proposed.** Recommended; it is Rich's choice.
- **(b) publish the canonical form only** (FE-5's (b)). That helps only an agent the front-end itself runs. It can be a sentence in
  the guide beside (a), and needs no spec words.

**What a plan would then build.** It is small: about a sitting.
- `fingerprintOf` (`tokens/pending.ts:60-73`) takes the object from the route. That is a per-route function from params and body to
  the object, which the route definition declares beside its `summary`.
- The payload's type, and the contract's `PendingAction` schema, gain `object`. The change is additive.
- The console's and the mock's questions show it, and the event's sentence names it.

**Shared pages.**
- `manifest-decisions.html` **D24**: *"those queue up for a person to confirm"* ⟶ *"those queue up for a person to confirm, each
  saying exactly what it would do"*. Recommended.
- `manifest-stories.html`'s Day 10 (*"They read it, click it, and it proceeds"*) stays true. Check it.
- The schematic's confirmation (*"I have opened a confirmation in your browser"*) stays true. Check it.

---

## Placement — Rich's

FE-46, FE-47 and FE-5 are in no plan.
- **(a) A small plan of their own, right after the launch path closes and before *faculty-ready*.** Recommended.
  - FE-46 and FE-47 reshape what the launch path has just built: the records' states, the queue, the mock's launch stages,
    *Launching* and `make demo-launch`. A plan written now starts from that plan's fresh acceptance, in the same files.
  - Two of the front-end's sittings wait on it: F5b's sends, and F6b's moment 17.
  - *Cost:* *faculty-ready* starts later, by this plan's length. Its contract version (`1.6.0`, its Decision 1) becomes the one
    after this plan's.
- **(b) After *faculty-ready*, before FE-32.** Rich's order of 2026-09-30 stays as it is. The front-end's two sittings wait longer,
  and build against the mock meanwhile.
- **(c) FE-5 into *faculty-ready*'s sitting 2, and FE-46 and FE-47 as in (a) or (b).** That sitting changes the envelope and bumps
  the contract once. FE-5 is additive, small, and independent of the other two.

**Not the launch path's sitting 12, in any case.** Its Task 15 is the acceptance, alone and last.
