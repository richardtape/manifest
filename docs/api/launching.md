# Launching

How an app reaches production. Three records go to UBC, in UBC’s order: the privacy assessment, then the staging registration, then the production registration. Manifest drafts each one, a person sends it and says so, and an administrator records UBC’s answer. Then come a rehearsal of the CWL sign-in, an administrator’s sign-off, and the deploy — and, once launched, the releases that follow. This guide is for a developer building the launch screens, and for an agent that must know what it may do here and what it must leave to a person.

## The checklist

`getLaunchReadiness` answers the checklist, **computed from what exists and never stored**, from the moment a project exists: each item with its owner, whether it blocks a launch, and its state — `met`, `unmet` with `why` saying what to do, or `not_built` when Manifest does not track it yet. A production deploy is refused `409` with this exact checklist until every blocking item is met.

An item that waits carries **`since`**: the day a record went to UBC, or the moment somebody asked an administrator to sign the release off; a record UBC has answered carries the day it was met. Count a wait in **Vancouver days**: a record sent today is stamped at noon in Vancouver, which can be hours ahead of now.

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

`getLaunchRecords` answers all three: `privacyAssessment`, `stagingRegistration` and `iamRegistration` (production’s) — each `null` until something is recorded. UBC takes them one after another, and Manifest holds that order when a person says one was sent:

1. **The privacy assessment**, to the UBC Privacy Office. It comes first; nothing waits for it.
2. **The staging registration**, to UBC IAM — once the assessment is approved, because it carries the assessment’s reference, the PIA number. Until then either registration’s send is refused `409 LAUNCH_PIA_NOT_APPROVED`.
3. **The production registration**, to UBC IAM — once staging is registered and the app has been tested there. Until then it is refused `409 LAUNCH_STAGING_NOT_REGISTERED`.

Each takes weeks, so start in the first week: a draft never stops a build, and what gates a production release is only a registration UBC has registered.

### Drafting

- **`draftPrivacyAssessment`** writes the assessment’s six questions — what the app collects, where it is stored, where it flows, how long it is kept and how it is disposed of, who is accountable, and where it is hosted — as `facts` (each with `source`, where Manifest read it) and `gaps`: what only the owner can add, such as what the app keeps in its own database. Its `text` is the whole draft, to paste into the Privacy Office’s form.
- **`draftIamRegistration`** (`staging` or `production`) writes the **package** a person sends UBC IAM: the environment’s entity id, its sign-in (`acsUrl`) and sign-out (`sloUrl`) addresses, the certificate it signs with (`pem`, `fingerprint`, `expiresAt` — the public half; no answer ever carries a private key), every attribute with its `purpose`, the lines that read it (`usedAt`) and a `justification`, the `contacts`, the PIA number (`privacyAssessmentReference`) and the metadata in UBC’s structure (`metadataXml`). An attribute the app asks for and never reads is `unused`.
- **Read the `warnings` first** — an attribute to remove, a PIA number not recorded yet — fix what they name, and draft again.
- **What each is drawn from**: the assessment and production’s registration from **the release serving staging** — so draft them once the release you will launch serves staging, and the checklist says when production’s draft or the assessment’s no longer matches it — and staging’s registration from the **newest valid manifest**, because staging is where the app is still changing. Production’s drawn with nothing serving staging comes from the newest valid manifest too, and its `warnings` say so. Draft as often as you like until it is sent; after that a record is kept as it was sent, and drafting again is refused `409 LAUNCH_RECORD_SUBMITTED` — a registration until UBC asks for changes or it lapses, the assessment until the Privacy Office sends it back. An app that signs nobody in has nothing to register: `409 LAUNCH_NOT_CWL`.

### Saying it was sent

Once a person has sent a draft, they say so — **`submitPrivacyAssessment`**, or **`submitIamRegistration`** for an environment — with the day they sent it (`sentAt`, a Vancouver day, today if left out) and the ticket they were given (`reference`). **Always send `draftGeneratedAt`**, the `generatedAt` of the draft the person read: a draft made again since is refused `409 LAUNCH_DRAFT_CHANGED`, and nothing is recorded. The record is then `submitted`, with `submittedAt` and `submittedBy`, and the checklist counts the wait from that day.

The refusals, each with what to do in its remedy: `409 LAUNCH_DRAFT_REQUIRED` (nothing drafted yet), `409 LAUNCH_TRANSITION_INVALID` (already sent, or decided), `409 LAUNCH_PIA_NOT_APPROVED` and `409 LAUNCH_STAGING_NOT_REGISTERED` (UBC’s order), `409 LAUNCH_DRAFT_STALE` (a registration drafted before the assessment’s PIA number — draft it again), and `400 LAUNCH_SENT_AT_INVALID` (a day still to come, or before the draft was made).

**A person says it, in their own session** — the project’s owner, a collaborator or a platform administrator (`launch:submit`); a token is refused `403 TOKEN_CREDENTIAL_REFUSED`. So this is browser code — the page’s own client, carrying no credential, because the browser sends the person’s cookie and `Origin` itself.

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
 * what to read before sending it, and the questions only the owner can answer.
 */
export async function draftTheAssessment(
  client: ManifestClient,
  projectId: string,
): Promise<{ generatedAt: string; forYouToAdd: string[] }> {
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
    forYouToAdd: draft.sections.flatMap((s) => s.gaps.map((gap) => `${s.title}: ${gap}`)),
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
 * *"I've sent it"* — the person says the draft went, on a day and with the ticket they were given.
 * BROWSER CODE: only the person who sent it can say so, in their own session, so `page` is the page's
 * own client — `createManifestClient({ origin: location.origin })` — which carries no credential,
 * because the person's browser sends their cookie and `Origin` itself. **Always name the draft read**
 * (`draftGeneratedAt`): a draft made again since is refused, never recorded as what was sent.
 */
export async function sayItWasSent(
  page: ManifestClient,
  projectId: string,
  record: 'privacy-assessment' | 'staging' | 'production',
  sent: { draftGeneratedAt: string; sentAt?: string; reference?: string },
): Promise<{ done: true; submittedAt: string } | Refused> {
  const params = { header: { 'Idempotency-Key': idempotencyKey() } }
  try {
    const answer =
      record === 'privacy-assessment'
        ? unwrap(
            await page.POST(
              '/v1/projects/{projectId}/launch-records/privacy-assessment/submission',
              { params: { ...params, path: { projectId } }, body: sent },
            ),
            'submitPrivacyAssessment',
          )
        : unwrap(
            await page.POST(
              '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/submission',
              {
                params: { ...params, path: { projectId, environment: record } },
                body: sent,
              },
            ),
            'submitIamRegistration',
          )
    return { done: true, submittedAt: answer.submittedAt! }
  } catch (error) {
    // UBC's order is held here: `LAUNCH_PIA_NOT_APPROVED`, `LAUNCH_STAGING_NOT_REGISTERED` — each
    // with what to send first.
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
 * as `sayItWasSent` is.
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

### UBC’s answer

A platform administrator records what UBC said, with its ticket, in their own session: `recordIamRegistration` (naming the `environment`) and `recordPrivacyAssessment` — a registration `active`, an assessment `approved` with its PIA number, or either sent back. A registration that is `change_requested` says whose move it is in **`changeRequestedFrom`**:

- `submitted` — UBC IAM asked about the request the owner sent: draft it again, send the new draft, and say so.
- `active` — an administrator asked UBC IAM for a change to a live registration: UBC holds it, and releases are checked against what it registered until it registers the change.

## The rehearsal

**Rehearse the sign-in** (`runRehearsal`): the candidate release is deployed to production’s public listener, with its CWL registration shaped as production’s, for as long as one sign-in takes; then it is taken down again, and the result recorded. It proves the registration’s *shape* — never that UBC has accepted it. Afterwards production’s hostname reaches nothing of the app’s, and `getEnvironment` reads the rehearsal’s instance as `gone` (or `failed`, when the candidate never started). The project’s owner, a collaborator or a platform administrator runs it, in their own session, after signing in again within ten minutes (`403 STEP_UP_REQUIRED` otherwise). One runs at a time per project (`409 REHEARSAL_RUNNING`). If it cannot take itself down, nothing is recorded and it answers `500 REHEARSAL_TEARDOWN_FAILED`: run it again.

## Signing it off

Once the release you will launch serves staging, **ask an administrator to sign it off** (`requestApproval`). The request waits in the administrators’ queue, and the checklist’s `admin-approval` item says who asked and since when. The `note` is for administrators alone — it is never in the answer or an event. Asking again answers the request already made. A request stays open until an administrator approves or rejects the release, or another release serves staging — then ask about that one; if this release serves staging again, its request waits again from when it was asked.

It is refused `409 APPROVAL_NOT_NEEDED` when nothing needs approving, `409 RELEASE_REJECTED` once an administrator has rejected the release — final for that release: change the app, release it, deploy it to staging and ask about the new one — and `409 RELEASE_NOT_STAGED` for any release but the one serving staging, with the checklist naming that one.

An administrator then takes a **stored preview** of the release (`createApprovalPreview`) — the exact change it makes, the security notes and a summary — reads it, and approves or rejects the release **naming that preview** (`approveRelease`, `rejectRelease`), after signing in again. The approval is bound to the release’s exact image; a later rebuild is a new image the approval does not cover.

## For administrators: the queue

`listQueue` answers everything waiting on an administrator, **oldest first**, in an administrator’s own session only (`403 FORBIDDEN` for anybody else). `oldestSince` is the oldest item’s wait; `truncated` says more than 200 wait. Each item names its `project`, who asked or sent it, `since`, a `summary`, and what to do by its `kind`:

- `release-approval` — a sign-off request, with the owner’s `note`: read the release’s preview and approve or reject it.
- `iam-registration` — a registration with UBC IAM (`environment` says which): record UBC IAM’s answer when it comes.
- `iam-change-request` — a change to a live registration an administrator filed with UBC IAM: record UBC IAM’s answer when it comes.
- `privacy-assessment` — an assessment with the Privacy Office: record its answer, with the PIA number, when it comes.

An archived project’s items are not in the queue.

## A first launch, in order

1. **Draft the privacy assessment**, fill in its gaps, send it to the UBC Privacy Office, and say so. An administrator records it approved, with its PIA number.
2. **Deploy to staging.** Draft the staging registration — it now carries the PIA number — send it to UBC IAM, and say so. An administrator records it active. Test the app at staging.
3. **Draft the production registration**, send it, and say so. An administrator records it active.
4. **Rehearse the sign-in.**
5. **Ask an administrator to sign the release off**; they approve it from a stored preview.
6. **Deploy to production** (`deploy`, to the production environment), by a person who has signed in again. Production deploys only the release that is serving staging.

## After the first launch

A launched app’s releases are **self-serve**: a release that is serving staging deploys to production with no administrator — unless its manifest changes one of the seven **sensitive fields**: `services`, `auth.attributes`, `egress.allow`, `resources`, `data.classification`, `ai.models` and `blueprint` — what it connects to, what it learns about the people who sign in, where it may reach, what it runs on, what data it holds, which models it asks, and what it is built from. Then it **re-escalates**: the checklist asks for an administrator’s approval again, from a new stored preview — ask for it with `requestApproval`, as before a first launch. A commit’s dry run already tells you whether it would (`spec.sensitiveDiff`).

## What an agent may do here, and what it may not

- **May:** read the checklist, the launch records and the approval; **draft** the three records (`launch:draft`), so its person reads and sends them; **ask an administrator to sign a release off** (`approval:request`) — asking decides nothing; deploy to sandbox and staging; and *ask* for a production deploy.
- **Asking for a production deploy** is answered `403 TOKEN_ACTION_PENDING`: an owner of the project — a person who could deploy it themselves — confirms that one request, after signing in again, and the agent sends the identical request again — the same method, path and body, whatever its `Idempotency-Key` — which is let through once. *For an AI agent* has the loop.
- **May not, ever:** say a record was sent (`launch:submit`), run the rehearsal (`launch:rehearse`), record UBC’s decisions (`launch:record`), take a preview, or approve or reject a release. Saying a record was sent is the sender’s own word; the rehearsal puts an unapproved release on production’s public listener while its sign-in runs; and each of the others is a person’s own record of what they decided — so a person does each, in their own session, and a token is refused it outright (`403 TOKEN_CREDENTIAL_REFUSED`).
