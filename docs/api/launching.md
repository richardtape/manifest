# Launching

How an app reaches production. Three records go to UBC, in UBC’s order: the privacy assessment, then the staging registration, then the production registration. Manifest drafts each one, a person sends it and says so, and an administrator records UBC’s answer. Then come a rehearsal of the CWL sign-in, an administrator’s sign-off, and the deploy — and, once launched, the releases that follow. This guide is for a developer building the launch screens, and for an agent that must know what it may do here and what it must leave to a person.

## The checklist

`getLaunchReadiness` answers the checklist, **computed from what exists and never stored**, from the moment a project exists: each item with its owner, whether it blocks a launch, and its state — `met`, `unmet` with `why` saying what to do, or `not_built` when Manifest does not track it yet. A production deploy is refused `409` with this exact checklist until every blocking item is met.

An item that waits carries **`since`**: the moment its owner sent a record to the Manifest team, while the team holds it; the day it went to UBC, once UBC does; or the moment somebody asked an administrator to sign the release off. A record UBC has answered carries the day it was met. The item's `owner` and `why` name who has it — the record's `state` is how a client tells (`sent` is the Manifest team; `submitted`, or `change_requested` from `active`, is UBC), never the words. Count a wait in **Vancouver days**: a record sent today is stamped at noon in Vancouver, which can be hours ahead of now.

<!-- example: example-launch -->

```ts
import { createManifestClient, unwrap } from '@manifest/contract'

/**
 * What a first production launch still needs, computed from what exists and never stored:
 * each blocking item that is not met, with who owns it and what to do.
 */
export async function whatALaunchNeeds(
  origin: string,
  token: string,
  projectId: string,
): Promise<{ ready: boolean; todo: { title: string; owner: string; why: string }[] }> {
  const client = createManifestClient({ origin, token })
  const readiness = unwrap(
    await client.GET('/v1/projects/{projectId}/launch-readiness', {
      params: { path: { projectId } },
    }),
    'getLaunchReadiness',
  )
  return {
    ready: readiness.ready,
    todo: readiness.items
      .filter((item) => item.blocking && item.state !== 'met')
      .map((item) => ({ title: item.title, owner: item.owner, why: item.why })),
  }
}
```

<!-- /example -->

## The three records, in UBC’s order

`getLaunchRecords` answers all three: `privacyAssessment`, `stagingRegistration` and `iamRegistration` (production’s) — each `null` until something is recorded. UBC takes them one after another. **The owner sends each to the Manifest team** — at UBC, the people who run Manifest — who submit it to UBC, and Manifest holds UBC’s order when the owner sends one:

1. **The privacy assessment**, to the UBC Privacy Office. It comes first; nothing waits for it.
2. **The staging registration**, to UBC IAM — once the assessment is approved, because it carries the assessment’s reference, the PIA number. Until then either registration’s send is refused `409 LAUNCH_PIA_NOT_APPROVED`.
3. **The production registration**, to UBC IAM — once staging is registered and the app has been tested there. Until then it is refused `409 LAUNCH_STAGING_NOT_REGISTERED`.

Each takes weeks, so start in the first week: a draft never stops a build, and what gates a production release is only a registration UBC has registered.

### Drafting

- **`draftPrivacyAssessment`** writes the assessment’s six questions — what the app collects, where it is stored, where it flows, how long it is kept and how it is disposed of, who is accountable, and where it is hosted — as `facts` (each with `source`, where Manifest read it) and `gaps`: what only the owner can add, such as what the app keeps in its own database. Each gap is `{ id, text }`, and its `id` (`collected.app-data`, `hosting.production`) stays the same when the app is drafted again, so an answer kept for a gap still fits it. Its `text` is the whole draft, to paste into the Privacy Office’s form.
- **`draftIamRegistration`** (`staging` or `production`) writes the **package** a person sends UBC IAM: the environment’s entity id, its sign-in (`acsUrl`) and sign-out (`sloUrl`) addresses, the certificate it signs with (`pem`, `fingerprint`, `expiresAt` — the public half; no answer ever carries a private key), every attribute with its `purpose`, the lines that read it (`usedAt`) and a `justification`, the `contacts`, the PIA number (`privacyAssessmentReference`) and the metadata in UBC’s structure (`metadataXml`). An attribute the app asks for and never reads is `unused`.
- **Read the `warnings` first** — an attribute to remove, a PIA number not recorded yet — fix what they name, and draft again.
- **What each is drawn from**: the assessment and production’s registration from **the release serving staging** — so draft them once the release you will launch serves staging, and the checklist says when production’s draft or the assessment’s no longer matches it — and staging’s registration from the **newest valid manifest**, because staging is where the app is still changing. Production’s drawn with nothing serving staging comes from the newest valid manifest too, and its `warnings` say so. Draft as often as you like until it is sent; after that a record is kept as it was sent, and drafting again is refused `409 LAUNCH_RECORD_SUBMITTED` — while the Manifest team holds it (`sent`), until the team hands it back; once UBC holds it, a registration until UBC asks its owner for changes or it lapses, the assessment until the Privacy Office sends it back. **A registration UBC has registered (`active`) is drafted again as a change** — [A change to a live registration](#a-change-to-a-live-registration), below. An app that signs nobody in, or that signs people in and asks for no attribute, has nothing to register: `409 LAUNCH_NOT_CWL` (and validation refuses the second at `auth.attributes`, `SPEC_CWL_NO_ATTRIBUTES`).

### Sending it to the Manifest team

Once a person has read a draft, they send it to the Manifest team from Manifest — **`sendPrivacyAssessment`**, or **`sendIamRegistration`** for an environment. It is sent now: the record is `sent`, with `sentAt` (the moment), `sentBy`, and for a registration `sentFrom` (where it was sent from — a draft, UBC IAM’s questions to its owner, a lapse, or the live registration a change is asked of). The team is emailed: which app, which record, who sent it and when, and a link to the record — never the draft, an answer or an attribute. **Always send `draftGeneratedAt`**, the `generatedAt` of the draft the person read: a draft made again since is refused `409 LAUNCH_DRAFT_CHANGED`, and nothing is sent.

**The privacy assessment carries an answer to every gap** — `answers: [{ gapId, answer }]`, one per gap of the draft, by its `id`. *“Does not apply”* is an answer; a blank one is not. An answer is at most 2,000 characters, and there are at most 64 — more is refused by the request’s own limits, `400 REQUEST_INVALID`. A gap without an answer, a blank one, a gap answered twice, or an id the draft does not have (a draft made since, whose gaps changed) is refused `400 LAUNCH_GAP_ANSWERS_INVALID`, and its message names every gap at fault. The answers are kept on the record as `gapAnswers`, in the draft’s order — what the team carries into the Privacy Office’s form — and a later send replaces them.

The refusals, each with what to do in its remedy: `409 LAUNCH_DRAFT_REQUIRED` (nothing drafted yet), `409 LAUNCH_TRANSITION_INVALID` (already sent, with UBC, or decided), `409 LAUNCH_PIA_NOT_APPROVED` and `409 LAUNCH_STAGING_NOT_REGISTERED` (UBC’s order), `409 LAUNCH_DRAFT_STALE` (a registration drafted before the assessment’s PIA number — draft it again), and `400 LAUNCH_GAP_ANSWERS_INVALID` (the assessment’s answers).

**A person sends it, in their own session** — the project’s owner, a collaborator or a platform administrator (`launch:submit`); a token is refused `403 TOKEN_CREDENTIAL_REFUSED`. So this is browser code — the page’s own client, carrying no credential, because the browser sends the person’s cookie and `Origin` itself.

<!-- example: example-launch-path -->

```ts
import {
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type ManifestClient,
} from '@manifest/contract'

/** A refusal said as what to do next: its code, and the remedy the API gives with it. */
export type Refused = { done: false; refused: string; next: string }

const refusedBy = (error: unknown): Refused => {
  if (error instanceof ManifestApiError)
    return {
      done: false,
      refused: error.code,
      next: error.envelope?.error.hint ?? error.message,
    }
  throw error
}

/**
 * Draft the privacy assessment — the first of the three records, in UBC's order. A person's client,
 * or an agent's on a token holding `launch:draft`: drafting sends nothing anywhere. What comes back is
 * what to read before sending it, and the questions only the owner can answer — each by its gap's `id`,
 * which stays the same when the app is drafted again, so an answer kept for it still fits.
 */
export async function draftTheAssessment(
  client: ManifestClient,
  projectId: string,
): Promise<{ generatedAt: string; forYouToAdd: { gapId: string; asks: string }[] }> {
  const assessment = unwrap(
    await client.POST(
      '/v1/projects/{projectId}/launch-records/privacy-assessment/draft',
      {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      },
    ),
    'draftPrivacyAssessment',
  )
  const draft = assessment.draft!
  return {
    generatedAt: draft.generatedAt,
    forYouToAdd: draft.sections.flatMap((s) =>
      s.gaps.map((gap) => ({ gapId: gap.id, asks: `${s.title}: ${gap.text}` })),
    ),
  }
}

/**
 * Draft one environment's registration with UBC IAM — the package a person sends. Its `warnings` are
 * what to fix first (an attribute the app never reads, a missing PIA number); fix them and draft again.
 */
export async function draftARegistration(
  client: ManifestClient,
  projectId: string,
  environment: 'staging' | 'production',
): Promise<{ generatedAt: string; warnings: string[]; unread: string[] }> {
  const registration = unwrap(
    await client.POST(
      '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/draft',
      {
        params: {
          path: { projectId, environment },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      },
    ),
    'draftIamRegistration',
  )
  const sent = registration.package!
  return {
    generatedAt: sent.generatedAt,
    warnings: sent.warnings,
    unread: sent.attributes.filter((a) => a.unused).map((a) => a.name),
  }
}

/**
 * Send it to the Manifest team — who submit it to UBC, or hand it back with what to change. BROWSER CODE:
 * only a person sends it, in their own session, so `page` is the page's own client —
 * `createManifestClient({ origin: location.origin })` — which carries no credential, because the person's
 * browser sends their cookie and `Origin` itself. **Always name the draft read** (`draftGeneratedAt`): a
 * draft made again since is refused, never sent. **The privacy assessment carries an answer to every gap**,
 * by its id — *"does not apply"* is an answer; a gap left out is refused, naming it.
 */
export async function sendIt(
  page: ManifestClient,
  projectId: string,
  record: 'privacy-assessment' | 'staging' | 'production',
  sent: { draftGeneratedAt: string; answers?: { gapId: string; answer: string }[] },
): Promise<{ done: true; sentAt: string } | Refused> {
  const params = { header: { 'Idempotency-Key': idempotencyKey() } }
  try {
    const answer =
      record === 'privacy-assessment'
        ? unwrap(
            await page.POST(
              '/v1/projects/{projectId}/launch-records/privacy-assessment/send',
              {
                params: { ...params, path: { projectId } },
                body: {
                  draftGeneratedAt: sent.draftGeneratedAt,
                  answers: sent.answers ?? [],
                },
              },
            ),
            'sendPrivacyAssessment',
          )
        : unwrap(
            await page.POST(
              '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/send',
              {
                params: { ...params, path: { projectId, environment: record } },
                body: { draftGeneratedAt: sent.draftGeneratedAt },
              },
            ),
            'sendIamRegistration',
          )
    return { done: true, sentAt: answer.sentAt! }
  } catch (error) {
    // UBC's order is held here: `LAUNCH_PIA_NOT_APPROVED`, `LAUNCH_STAGING_NOT_REGISTERED` — each
    // with what to send first — and every gap answered: `LAUNCH_GAP_ANSWERS_INVALID`.
    return refusedBy(error)
  }
}

/**
 * The Manifest team submitted it to UBC — an administrator's record, in their own session, of the day
 * the team sent it (today when absent) and UBC's reference: IAM's ticket, or the PIA number. BROWSER CODE,
 * the administrator's page. Only what its owner sent the team is submitted.
 */
export async function teamSubmitted(
  admin: ManifestClient,
  projectId: string,
  record: 'privacy-assessment' | 'staging' | 'production',
  submitted: { reference: string; sentAt?: string },
): Promise<{ done: true; submittedAt: string } | Refused> {
  const params = { header: { 'Idempotency-Key': idempotencyKey() } }
  try {
    const answer =
      record === 'privacy-assessment'
        ? unwrap(
            await admin.POST(
              '/v1/projects/{projectId}/launch-records/privacy-assessment/submission',
              { params: { ...params, path: { projectId } }, body: submitted },
            ),
            'submitPrivacyAssessment',
          )
        : unwrap(
            await admin.POST(
              '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/submission',
              {
                params: { ...params, path: { projectId, environment: record } },
                body: submitted,
              },
            ),
            'submitIamRegistration',
          )
    return { done: true, submittedAt: answer.submittedAt! }
  } catch (error) {
    // `LAUNCH_TRANSITION_INVALID` when the team does not hold it; `LAUNCH_SENT_AT_INVALID` for a day
    // that cannot be true.
    return refusedBy(error)
  }
}

/**
 * Ask an administrator to sign off the release serving staging. A person's client, or an agent's on a
 * token holding `approval:request` — asking decides nothing. The note is for administrators alone.
 */
export async function askForSignOff(
  client: ManifestClient,
  releaseId: string,
  note?: string,
): Promise<{ done: true; askedAt: string; open: boolean } | Refused> {
  try {
    const request = unwrap(
      await client.POST('/v1/releases/{releaseId}/approval-request', {
        params: { path: { releaseId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: note === undefined ? {} : { note },
      }),
      'requestApproval',
    )
    return { done: true, askedAt: request.createdAt, open: request.open }
  } catch (error) {
    // Nothing to ask for (`APPROVAL_NOT_NEEDED`), or a rejection, final for that release.
    return refusedBy(error)
  }
}

/**
 * What waits on the administrators, oldest first — an administrator's own session only. BROWSER CODE,
 * as `sendIt` is.
 */
export async function whatWaitsOnUs(
  page: ManifestClient,
): Promise<{ oldestSince: string | null; items: { kind: string; project: string }[] }> {
  const queue = unwrap(await page.GET('/v1/queue'), 'listQueue')
  return {
    oldestSince: queue.oldestSince,
    items: queue.items.map((i) => ({ kind: i.kind, project: i.project.slug })),
  }
}
```

<!-- /example -->

### The Manifest team’s step

The Manifest team submits what an owner sent it to UBC — the assessment to the Privacy Office, through PRISM; a registration to UBC IAM — and a platform administrator records it, in their own session (`launch:record`; anybody else is `403 FORBIDDEN`, a token `403 TOKEN_CREDENTIAL_REFUSED`):

- **`submitPrivacyAssessment`**, or **`submitIamRegistration`** for an environment, with the day the team sent it (`sentAt`, a Vancouver day, today if left out) and UBC’s `reference` — IAM’s ticket, or the PIA number. The record is then `submitted`, with `submittedAt` (that day, at noon in Vancouver) and `submittedBy` (the administrator), and the checklist counts the wait for UBC from that day. **A change to a live registration** (sent from `active`) is filed as a change request instead: `change_requested`, `changeRequestedFrom: active`, and `iam_registration.submitted` says `changeRequest: true`. A day after today, or before the owner sent it to the team, is refused `400 LAUNCH_SENT_AT_INVALID`. **It is never refused for UBC’s order**: that was held when the owner sent it.
- **`returnPrivacyAssessment`**, or **`returnIamRegistration`**, hands it back to its owner, unsubmitted — the assessment to `draft`, a registration to the state it was sent from — a change, to `active`, with nothing requested any more. Why travels outside the record, as UBC’s questions do. The owner sends it again when it is ready, and the next send replaces the last one’s `sentAt` and answers.

Only a record with the team (`sent`) is submitted or handed back: any other is `409 LAUNCH_TRANSITION_INVALID`. And the administrator’s record routes below never move a record into or out of `sent`.

### UBC’s answer

A platform administrator records what UBC said, with its ticket, in their own session: `recordIamRegistration` (naming the `environment`) and `recordPrivacyAssessment` — a registration `active`, an assessment `approved` with its PIA number, or either sent back. A registration that is `change_requested` says whose move it is in **`changeRequestedFrom`**:

- `submitted` — UBC IAM asked about the request the owner sent: draft it again, and send the new draft to the Manifest team.
- `active` — the Manifest team filed a change to a live registration with UBC IAM (or an administrator recorded one filed directly): UBC holds it, and releases are checked against what it registered until it registers the change. Record UBC's answer through `submitted`, then `active` with what it now registers; `requestedAttributes` is cleared.

## The rehearsal

**Rehearse the sign-in** (`runRehearsal`): the candidate release is deployed to production’s public listener, with its CWL registration shaped as production’s, for as long as one sign-in takes; then it is taken down again, and the result recorded. It proves the registration’s *shape* — never that UBC has accepted it. Afterwards production’s hostname reaches nothing of the app’s, and `getEnvironment` reads the rehearsal’s instance as `gone` (or `failed`, when the candidate never started). The project’s owner, a collaborator or a platform administrator runs it, in their own session, after signing in again within ten minutes (`403 STEP_UP_REQUIRED` otherwise). One runs at a time per project (`409 REHEARSAL_RUNNING`). If it cannot take itself down, nothing is recorded and it answers `500 REHEARSAL_TEARDOWN_FAILED`: run it again.

## Signing it off

Once the release you will launch serves staging, **ask an administrator to sign it off** (`requestApproval`). The request waits in the administrators’ queue, and the checklist’s `admin-approval` item says who asked and since when. The `note` is for administrators alone — it is never in the answer or an event. Asking again answers the request already made. A request stays open until an administrator approves or rejects the release, or another release serves staging — then ask about that one; if this release serves staging again, its request waits again from when it was asked.

It is refused `409 APPROVAL_NOT_NEEDED` when nothing needs approving, `409 RELEASE_REJECTED` once an administrator has rejected the release — final for that release: change the app, release it, deploy it to staging and ask about the new one — and `409 RELEASE_NOT_STAGED` for any release but the one serving staging, with the checklist naming that one.

An administrator then takes a **stored preview** of the release (`createApprovalPreview`) — the exact change it makes, the security notes and a summary — reads it, and approves or rejects the release **naming that preview** (`approveRelease`, `rejectRelease`), after signing in again. The approval is bound to the release’s exact image; a later rebuild is a new image the approval does not cover.

## For administrators: the queue

`listQueue` answers everything waiting on an administrator, **oldest first**, in an administrator’s own session only (`403 FORBIDDEN` for anybody else). `oldestSince` is the oldest item’s wait; `truncated` says more than 200 wait. Each item names its `project`, who asked or sent it, `since`, a `summary`, and what to do by its `kind`:

- `release-approval` — a sign-off request, with the owner’s `note`: read the release’s preview and approve or reject it.
- `iam-registration-to-submit` — a registration its owner sent to the Manifest team (`environment` says which): submit it to UBC IAM and record that you have (`submitIamRegistration`), or hand it back (`returnIamRegistration`).
- `iam-change-to-file` — a change to a live registration its owner sent to the Manifest team, naming what it asks for: file it with UBC IAM as a change request and record that you have (`submitIamRegistration`), or hand it back.
- `privacy-assessment-to-submit` — the privacy assessment its owner sent to the Manifest team, every gap answered: submit it to the Privacy Office and record that you have (`submitPrivacyAssessment`), or hand it back (`returnPrivacyAssessment`).
- `iam-registration` — a registration with UBC IAM (`environment` says which): record UBC IAM’s answer when it comes.
- `iam-change-request` — a change to a live registration filed with UBC IAM: record UBC IAM’s answer when it comes.
- `privacy-assessment` — an assessment with the Privacy Office: record its answer, with the PIA number, when it comes.

The three the Manifest team holds wait **since the owner sent them** and name the sender; the three with UBC wait since the day they went to UBC, and still name the person who sent them — `requestedBy` is who asked, never the administrator who recorded the team's step. Items of the same moment come in the order above. Switch on `kind`, never on `summary`.

An archived project’s items are not in the queue.

## A first launch, in order

1. **Draft the privacy assessment**, answer each of its gaps, and send it to the Manifest team, who submit it to the UBC Privacy Office. An administrator records the submission, and then the approval, with its PIA number.
2. **Deploy to staging.** Draft the staging registration — it now carries the PIA number — and send it to the Manifest team, who submit it to UBC IAM. An administrator records it active. Test the app at staging.
3. **Draft the production registration**, and send it to the Manifest team the same way. An administrator records it active.
4. **Rehearse the sign-in.**
5. **Ask an administrator to sign the release off**; they approve it from a stored preview.
6. **Deploy to production** (`deploy`, to the production environment), by a person who has signed in again. Production deploys only the release that is serving staging.

## After the first launch

A launched app’s releases are **self-serve**: a release that is serving staging deploys to production with no administrator — unless its manifest changes one of the seven **sensitive fields**: `services`, `auth.attributes`, `egress.allow`, `resources`, `data.classification`, `ai.models` and `blueprint` — what it connects to, what it learns about the people who sign in, where it may reach, what it runs on, what data it holds, which models it asks, and what it is built from. Then it **re-escalates**: the checklist asks for an administrator’s approval again, from a new stored preview — ask for it with `requestApproval`, as before a first launch. A commit’s dry run already tells you whether it would: **`spec.sensitiveSinceApproved`** names the sensitive fields a release of it would change against the release last approved for production — the comparison the deploy makes, so an addition and its own removal cancel, and a value the blueprint already supplied, written out, is no change. An empty list means no administrator; null means nothing has been approved yet, so the first launch’s approval reviews it all. (`spec.sensitiveDiff` is the change since the newest valid manifest, commit by commit — read `sensitiveSinceApproved` to say whether an administrator will look.)

### A change to a live registration

A launched app that comes to need another attribute — or a new sign-in or sign-out address — asks UBC IAM for a **change** to its live registration, through the Manifest team. Until UBC registers the change, its build is refused `SPEC_ATTRIBUTE_NOT_REGISTERED` naming where the change is, and the release serving production stays covered by what UBC registered:

1. **Change `manifest.yaml`** and validate it. A build of it is refused; the refusal's hint says to ask for the change from Manifest.
2. **Draft the registration again** (`draftIamRegistration`, the environment's). From `active` it is drawn from the **newest valid manifest**, whichever environment — the release serving staging cannot ask for what UBC has not registered — and its `warnings` say so. The record keeps what UBC registered; only the `package` is new.
3. **Send it to the Manifest team** (`sendIamRegistration`, naming the draft read). The record is `sent`, `sentFrom: active`, and `requestedAttributes` is what the package asks for; `registeredAttributes` is still what UBC registered. A package that asks for exactly what UBC registered — the same attributes at the same ACS and SLO — is refused `409 LAUNCH_CHANGE_EMPTY`.
4. **The Manifest team files it** with UBC IAM as a change request (`submitIamRegistration`): `change_requested` from `active` — or hands it back, live again, nothing requested. The queue shows `iam-change-to-file`, then `iam-change-request`.
5. **UBC’s answer** is recorded by an administrator, through `submitted`, then `active` with what UBC now registers. The build succeeds.

A change UBC holds is UBC’s to answer: drafting it again is refused `409 LAUNCH_RECORD_SUBMITTED`, and a second send `409 LAUNCH_TRANSITION_INVALID`.

## What an agent may do here, and what it may not

- **May:** read the checklist, the launch records and the approval; **draft** the three records (`launch:draft`), so its person reads and sends them; **ask an administrator to sign a release off** (`approval:request`) — asking decides nothing; deploy to sandbox and staging; and *ask* for a production deploy.
- **Asking for a production deploy** is answered `403 TOKEN_ACTION_PENDING`: an owner of the project — a person who could deploy it themselves — confirms that one request, after signing in again, and the agent sends the identical request again — the same method, path and body, whatever its `Idempotency-Key` — which is let through once. *For an AI agent* has the loop.
- **May not, ever:** send a record to the Manifest team (`launch:submit`), run the rehearsal (`launch:rehearse`), record the team’s step or UBC’s decisions (`launch:record`), take a preview, or approve or reject a release. Sending a record is its owner’s own act; the rehearsal puts an unapproved release on production’s public listener while its sign-in runs; and each of the others is a person’s own record of what they decided — so a person does each, in their own session, and a token is refused it outright (`403 TOKEN_CREDENTIAL_REFUSED`).
