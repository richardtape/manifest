import { useRef, useState, type FormEvent } from 'react'
import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import {
  assessmentActions,
  dayInWords,
  registrationActions,
  sentLine,
  vancouverDay,
  type OwnerActions,
} from '../launch-records-state'
import { Field, Instant, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * THE THREE LAUNCH RECORDS, IN UBC'S ORDER (the launch path plan's Task 13): the privacy assessment
 * first; once it is approved, the staging registration, carrying its PIA number; once staging is
 * registered and tested, production's. **Each has two halves.**
 *
 * **THE OWNER'S HALF** (Tasks 9–11): Manifest drafts what is sent — the registration's package, the
 * assessment's six questions — and the person reads it, sends it, and says so with the day and the
 * ticket (*"I've sent it"*), after which the record says how long it has waited. The buttons shown are
 * `registrationActions`' and `assessmentActions`' choice, and the platform refuses any other move in
 * its own words — an affordance, never a control.
 *
 * **THE ADMINISTRATOR'S HALF**, below it: what UBC IAM and the Privacy Office ANSWERED, written by a
 * platform administrator (R1, P6a Tasks 6 and 17).
 *
 * **A FORM THAT WRITES EXTERNAL STATE, AND SAYS SO.** Nothing here asks UBC anything: the
 * administrator transcribes a decision somebody else made, and the ticket reference is how a
 * reader later finds that decision. §15's row is *"a human submits and pastes a ticket
 * reference"*, so the reference is asked for first and is required by this form even where
 * the API leaves it optional.
 *
 * **THE STATE IS OFFERED IN FULL AND THE PLATFORM SAYS WHICH MOVES ARE LEGAL.** §9's arrows
 * live in `launch/transitions.ts`, and a console that offered only the legal next states
 * would be a second copy of that table — the D22 finding P5c recorded for D24's privileged
 * four, arriving here for a state machine. So every state is offered and an illegal move is
 * answered `409 LAUNCH_TRANSITION_INVALID`, rendered by `<Refusal>` in the platform's words.
 */
export function Records({
  api,
  projectId,
  isAdmin,
}: {
  api: Api
  projectId: string
  isAdmin: boolean
}) {
  const records = useAsync(() => api.getLaunchRecords(projectId), [projectId])
  // WHAT THE APP ASKS FOR, shown BESIDE the registered list and never poured into it. The
  // candidate is the release serving staging (§13), read the way the checklist reads it.
  const candidate = useAsync(async () => {
    const readiness = await api.getLaunchReadiness(projectId)
    if (readiness.candidateReleaseId === null) return null
    return (await api.getRelease(readiness.candidateReleaseId)).config
  }, [projectId])
  const value = records.value

  return (
    <>
      <p className="hint">
        UBC’s order: the privacy assessment first; once it is approved, the staging
        registration, which carries its PIA number; once staging is registered and tested,
        the production registration. Manifest drafts each one — you read it, send it, and
        say here that you sent it.
      </p>
      <Refusal error={records.error} />
      <Panel title="1. Privacy Impact Assessment">
        {value !== undefined && (
          <>
            <PiaRecord record={value.privacyAssessment} />
            <AssessmentOwner
              api={api}
              projectId={projectId}
              record={value.privacyAssessment}
              onChanged={records.reload}
            />
            {isAdmin && (
              <PiaForm
                api={api}
                projectId={projectId}
                current={value.privacyAssessment}
                onRecorded={records.reload}
              />
            )}
          </>
        )}
      </Panel>
      {(['staging', 'production'] as const).map((environment, i) => {
        const record =
          value === undefined
            ? undefined
            : environment === 'staging'
              ? value.stagingRegistration
              : value.iamRegistration
        return (
          <Panel
            key={environment}
            title={`${i + 2}. UBC IAM registration — ${environment}`}
          >
            {record !== undefined && (
              <>
                <IamRecord record={record} />
                <RegistrationOwner
                  api={api}
                  projectId={projectId}
                  environment={environment}
                  record={record}
                  onChanged={records.reload}
                />
                {isAdmin && (
                  <IamForm
                    api={api}
                    projectId={projectId}
                    environment={environment}
                    current={record}
                    requested={
                      candidate.value === undefined
                        ? undefined
                        : candidate.value === null
                          ? null
                          : candidate.value[environment].auth
                    }
                    requestedError={candidate.error}
                    onRecorded={records.reload}
                  />
                )}
              </>
            )}
          </Panel>
        )
      })}
    </>
  )
}

function IamRecord({ record }: { record: Schemas['IamRegistration'] | null }) {
  if (record === null)
    return <p className="hint">Nothing has been recorded for this project yet.</p>
  return (
    <>
      <Field label="State">
        <Pill tone={record.state === 'active' ? 'good' : 'plain'}>{record.state}</Pill>{' '}
        recorded <Instant at={record.updatedAt} />
      </Field>
      <SentField
        submittedAt={record.submittedAt}
        submittedBy={record.submittedBy}
        waiting={record.state === 'submitted' || record.state === 'change_requested'}
      />
      {/*
        WHOSE MOVE A CHANGE REQUEST IS (the launch path plan's Task 12): UBC IAM asking about a
        request the owner sent is the owner's to answer; a change an administrator filed on a live
        registration waits on UBC.
      */}
      {record.changeRequestedFrom !== null && (
        <Field label="Change requested">
          {record.changeRequestedFrom === 'submitted'
            ? 'UBC IAM asked for changes to the request that was sent — draft it again and send it.'
            : 'An administrator asked UBC IAM for a change to this live registration — UBC is considering it.'}
        </Field>
      )}
      <Field label="Ticket">
        {record.externalTicketRef === null ? (
          'none'
        ) : (
          <code>{record.externalTicketRef}</code>
        )}
      </Field>
      <Field label="Entity ID">
        <code>{record.entityId}</code>
      </Field>
      <Field label="ACS">
        <code>{record.acsUrl}</code>
      </Field>
      <Field label="SLO">
        <code>{record.sloUrl}</code>
      </Field>
      {/*
       * WHAT UBC REGISTERED AND WHAT A CHANGE REQUEST ASKS FOR, SIDE BY SIDE and never merged
       * (P6b Task 7). The first is what every production release is checked against; the
       * second is only a question UBC has not answered yet (§9, `[M9]`).
       */}
      <Field label="Registered attributes">
        {record.registeredAttributes.length === 0
          ? 'none yet'
          : [...record.registeredAttributes].sort().join(', ')}
      </Field>
      <Field label="Requested attributes">
        {record.requestedAttributes === null ? (
          'no change request on file'
        ) : (
          <>
            {[...record.requestedAttributes].sort().join(', ')}{' '}
            <span className="hint">— asked for, not yet registered</span>
          </>
        )}
      </Field>
      <Field label="Registered since">
        {record.registeredAt === null ? (
          'UBC IAM has not registered it yet'
        ) : (
          <Instant at={record.registeredAt} />
        )}
      </Field>
      <Field label="Certificate">
        {record.certFingerprint === null ? (
          'no fingerprint recorded'
        ) : (
          <code>{record.certFingerprint}</code>
        )}
        {/* D20: an unnoticed expiry silently kills login for a live course app. */}
        {record.certExpiresAt !== null && (
          <>
            {' '}
            expires <Instant at={record.certExpiresAt} />
          </>
        )}
      </Field>
    </>
  )
}

function PiaRecord({ record }: { record: Schemas['PrivacyAssessment'] | null }) {
  if (record === null)
    return <p className="hint">Nothing has been recorded for this project yet.</p>
  return (
    <>
      <Field label="State">
        <Pill tone={record.state === 'approved' ? 'good' : 'plain'}>{record.state}</Pill>{' '}
        recorded <Instant at={record.updatedAt} />
      </Field>
      <Field label="Ticket">
        {record.externalTicketRef === null ? (
          'none'
        ) : (
          <code>{record.externalTicketRef}</code>
        )}
      </Field>
      <SentField
        submittedAt={record.submittedAt}
        submittedBy={record.submittedBy}
        waiting={record.state === 'submitted'}
      />
      <Field label="Reviewer">{record.reviewer ?? 'not recorded'}</Field>
      {record.approvedAt !== null && (
        <Field label="Approved">
          <Instant at={record.approvedAt} />
        </Field>
      )}
    </>
  )
}

const IAM_STATES: Schemas['RecordIamRegistrationRequest']['state'][] = [
  'draft',
  'submitted',
  'active',
  'change_requested',
  'expired',
]
const PIA_STATES: Schemas['RecordPrivacyAssessmentRequest']['state'][] = [
  'draft',
  'submitted',
  'approved',
]

/** A comma- or whitespace-separated list, as a person types one; empties dropped. */
const listOf = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')

/**
 * THE ATTRIBUTE FIELD IS WHAT UBC REGISTERED, AND IT IS NEVER PREFILLED FROM THE APP.
 * `iam-registration` is `met` only when the candidate's attributes are a SUBSET of this list
 * (P6a sitting 8, F9), and a list copied from `manifest.yaml` would make that subset check
 * true for every project — the same fail-open S2 measured at the IdP. So the app's request
 * is shown BESIDE the field, labelled *requested*, and the field holds only what a previous
 * record already said UBC registered, or nothing.
 */
function IamForm({
  api,
  projectId,
  environment,
  current,
  requested,
  requestedError,
  onRecorded,
}: {
  api: Api
  projectId: string
  environment: 'staging' | 'production'
  current: Schemas['IamRegistration'] | null
  requested: Schemas['Release']['config']['production']['auth'] | null | undefined
  requestedError: unknown
  onRecorded: () => void
}) {
  const [ticket, setTicket] = useState(current?.externalTicketRef ?? '')
  const [state, setState] = useState<Schemas['RecordIamRegistrationRequest']['state']>(
    current?.state ?? 'draft',
  )
  const [entityId, setEntityId] = useState(current?.entityId ?? '')
  const [acsUrl, setAcsUrl] = useState(current?.acsUrl ?? '')
  const [sloUrl, setSloUrl] = useState(current?.sloUrl ?? '')
  const [attributes, setAttributes] = useState(
    current === null ? '' : current.registeredAttributes.join(', '),
  )
  const [requestedList, setRequestedList] = useState(
    current?.requestedAttributes?.join(', ') ?? '',
  )
  // §9's change request is the registration's own `change_requested` state (P6b Task 7), and
  // `submitted` carries it forward — the only two states in which asking is what is recorded.
  const asking = state === 'change_requested' || state === 'submitted'
  const [fingerprint, setFingerprint] = useState(current?.certFingerprint ?? '')
  const [expires, setExpires] = useState(current?.certExpiresAt?.slice(0, 10) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const attemptKey = useRef<string | undefined>(undefined)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    attemptKey.current ??= api.newKey()
    try {
      await api.recordIamRegistration(
        projectId,
        {
          // WHICH REGISTRATION (the launch path plan's Task 9): the body names it; absent is production.
          environment,
          state,
          externalTicketRef: ticket,
          entityId,
          acsUrl,
          sloUrl,
          registeredAttributes: listOf(attributes),
          ...(asking && listOf(requestedList).length > 0
            ? { requestedAttributes: listOf(requestedList) }
            : {}),
          // OPTIONAL IN THE DOCUMENT, so absent rather than empty
          // (`exactOptionalPropertyTypes`): an empty string is a value the schema refuses.
          ...(fingerprint === '' ? {} : { certFingerprint: fingerprint }),
          ...(expires === '' ? {} : { certExpiresAt: `${expires}T00:00:00.000Z` }),
        },
        attemptKey.current,
      )
      attemptKey.current = undefined
      onRecorded()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="record-form" onSubmit={(e) => void submit(e)}>
      <h3>Record what UBC IAM said</h3>
      <Field label="Ticket reference">
        <input
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          placeholder="the ticket UBC IAM's decision is on"
          required
        />
      </Field>
      <Field label="State">
        <select
          value={state}
          onChange={(e) =>
            setState(e.target.value as Schemas['RecordIamRegistrationRequest']['state'])
          }
        >
          {IAM_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>{' '}
        <span className="hint">
          the state the ticket shows — a move §9 does not allow is refused, with the
          reason
        </span>
      </Field>
      <Field label="Entity ID">
        <input value={entityId} onChange={(e) => setEntityId(e.target.value)} required />
      </Field>
      <Field label="ACS URL">
        <input value={acsUrl} onChange={(e) => setAcsUrl(e.target.value)} required />
      </Field>
      <Field label="SLO URL">
        <input value={sloUrl} onChange={(e) => setSloUrl(e.target.value)} required />
      </Field>
      <Field label="Registered attributes">
        <input
          value={attributes}
          onChange={(e) => setAttributes(e.target.value)}
          placeholder="exactly as the ticket lists them"
          required
        />
      </Field>
      {asking && (
        <Field label="Requested attributes">
          <input
            value={requestedList}
            onChange={(e) => setRequestedList(e.target.value)}
            placeholder="what the change request asks UBC IAM for"
          />{' '}
          <span className="hint">
            once UBC has registered this app, the registered list above stays as UBC has
            it until it registers the change — record it <code>active</code> then
          </span>
        </Field>
      )}
      <p className="hint">
        <strong>Requested</strong> by the release serving staging, for comparison only:{' '}
        {requested === undefined ? (
          '…'
        ) : requested === null ? (
          'nothing is serving staging yet'
        ) : requested.provider === 'none' ? (
          'this app signs nobody in'
        ) : (
          <code>{[...requested.attributes].sort().join(', ')}</code>
        )}
        .{' '}
        {/*
          ONLY PRODUCTION'S REGISTERED ROW GATES A BUILD (`releases/build.ts`): a staging release is
          not checked against what UBC registered for staging (the whole-branch review's finding 6 —
          this sentence said so of both environments).
        */}
        {environment === 'production'
          ? 'A production release may request only what UBC registered.'
          : 'A staging release is not checked against this list; a production release is checked against production’s.'}
      </p>
      <Refusal error={requestedError} />
      <Field label="Certificate fingerprint">
        <input
          value={fingerprint}
          onChange={(e) => setFingerprint(e.target.value)}
          placeholder="optional"
        />
      </Field>
      <Field label="Certificate expires">
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </Field>
      <button type="submit" disabled={busy}>
        {busy ? 'recording…' : 'Record'}
      </button>
      <Refusal error={error} />
    </form>
  )
}

function PiaForm({
  api,
  projectId,
  current,
  onRecorded,
}: {
  api: Api
  projectId: string
  current: Schemas['PrivacyAssessment'] | null
  onRecorded: () => void
}) {
  const [ticket, setTicket] = useState(current?.externalTicketRef ?? '')
  const [state, setState] = useState<Schemas['RecordPrivacyAssessmentRequest']['state']>(
    current?.state ?? 'draft',
  )
  const [reviewer, setReviewer] = useState(current?.reviewer ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const attemptKey = useRef<string | undefined>(undefined)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    attemptKey.current ??= api.newKey()
    try {
      await api.recordPrivacyAssessment(
        projectId,
        {
          state,
          externalTicketRef: ticket,
          ...(reviewer === '' ? {} : { reviewer }),
        },
        attemptKey.current,
      )
      attemptKey.current = undefined
      onRecorded()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="record-form" onSubmit={(e) => void submit(e)}>
      <h3>Record what the Privacy Office said</h3>
      <Field label="Ticket reference">
        <input
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          placeholder="the ticket the assessment is on"
          required
        />
      </Field>
      <Field label="State">
        <select
          value={state}
          onChange={(e) =>
            setState(e.target.value as Schemas['RecordPrivacyAssessmentRequest']['state'])
          }
        >
          {PIA_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reviewer">
        <input
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="optional — who at the Privacy Office decided"
        />
      </Field>
      <button type="submit" disabled={busy}>
        {busy ? 'recording…' : 'Record'}
      </button>
      <Refusal error={error} />
    </form>
  )
}

/** WHEN IT WAS SENT, AND HOW LONG IT HAS WAITED — or nothing, for a record nobody has sent. */
function SentField({
  submittedAt,
  submittedBy,
  waiting,
}: {
  submittedAt: string | null
  submittedBy: { displayName: string } | null
  /** Whether UBC still holds it — only then is the wait counted. */
  waiting: boolean
}) {
  if (submittedAt === null) return null
  return (
    <Field label="Sent">
      {sentLine(submittedAt, new Date(), waiting)}
      {submittedBy !== null && (
        <span className="hint"> — said by {submittedBy.displayName}</span>
      )}
    </Field>
  )
}

/** The owner's status, and the button that drafts — first, or again. */
function DraftButton({
  actions,
  newKey,
  draft,
}: {
  actions: OwnerActions
  /** `api.newKey`: one key per press, reused only if that press is retried (D23.6). */
  newKey: () => string
  draft: (key: string) => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const attemptKey = useRef<string | undefined>(undefined)
  async function run() {
    setBusy(true)
    setError(undefined)
    attemptKey.current ??= newKey()
    try {
      await draft(attemptKey.current)
      attemptKey.current = undefined
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <p>
        <strong>{actions.status}</strong>
      </p>
      {actions.draft !== null && (
        <p>
          <button type="button" disabled={busy} onClick={() => void run()}>
            {busy
              ? 'drafting…'
              : actions.draft === 'first'
                ? 'Draft it'
                : 'Draft it again'}
          </button>{' '}
          <span className="hint">
            Manifest fills in what it knows from the release serving staging — nothing is
            sent anywhere.
          </span>
        </p>
      )}
      <Refusal error={error} />
    </>
  )
}

/**
 * THE OWNER'S HALF OF ONE REGISTRATION (Tasks 9–10): the status, *Draft it*, the package — and *I've
 * sent it* once there is a draft to have sent.
 */
function RegistrationOwner({
  api,
  projectId,
  environment,
  record,
  onChanged,
}: {
  api: Api
  projectId: string
  environment: 'staging' | 'production'
  record: Schemas['IamRegistration'] | null
  onChanged: () => void
}) {
  const actions = registrationActions(record)
  const sent = record?.package ?? null
  return (
    <div className="owner">
      <h3>What you send UBC IAM</h3>
      <DraftButton
        actions={actions}
        newKey={api.newKey}
        draft={async (key) => {
          await api.draftIamRegistration(projectId, environment, key)
          onChanged()
        }}
      />
      {sent !== null && <PackageView pkg={sent} />}
      {actions.send && sent !== null && (
        <SendForm
          to="UBC IAM"
          reference="UBC IAM’s ticket, e.g. IAM-2026-0412"
          draftGeneratedAt={sent.generatedAt}
          newKey={api.newKey}
          send={(body, key) =>
            api.submitIamRegistration(projectId, environment, body, key)
          }
          onSent={onChanged}
        />
      )}
    </div>
  )
}

/** The owner's half of the assessment (Tasks 9 and 11) — the same shape, FIRST in UBC's order. */
function AssessmentOwner({
  api,
  projectId,
  record,
  onChanged,
}: {
  api: Api
  projectId: string
  record: Schemas['PrivacyAssessment'] | null
  onChanged: () => void
}) {
  const actions = assessmentActions(record)
  const draft = record?.draft ?? null
  return (
    <div className="owner">
      <h3>What you send the UBC Privacy Office</h3>
      <DraftButton
        actions={actions}
        newKey={api.newKey}
        draft={async (key) => {
          await api.draftPrivacyAssessment(projectId, key)
          onChanged()
        }}
      />
      {draft !== null && <AssessmentDraftView draft={draft} />}
      {actions.send && draft !== null && (
        <SendForm
          to="the UBC Privacy Office"
          reference="the Privacy Office’s reference, if it gave one"
          draftGeneratedAt={draft.generatedAt}
          newKey={api.newKey}
          send={(body, key) => api.submitPrivacyAssessment(projectId, body, key)}
          onSent={onChanged}
        />
      )}
    </div>
  )
}

/**
 * A REGISTRATION PACKAGE, AS A PERSON READS IT BEFORE SENDING IT (Task 10): what to fix first (the
 * warnings), where the app signs people in, the certificate it signs with — its public half; no
 * answer ever carries a private key — every attribute with why the app needs it, the contacts and the
 * PIA number, and the metadata to paste.
 */
function PackageView({ pkg }: { pkg: Schemas['RegistrationPackage'] }) {
  return (
    <div className="package">
      <Field label="Drafted">
        {dayInWords(pkg.generatedAt)}, from commit{' '}
        <code>{pkg.fromCommit.slice(0, 12)}</code>
      </Field>
      <BeforeYouSend warnings={pkg.warnings} />
      <Field label="Entity ID">
        <code>{pkg.entityId}</code>
      </Field>
      <Field label="Sign-in (ACS)">
        <code>{pkg.acsUrl}</code>
      </Field>
      <Field label="Sign-out (SLO)">
        <code>{pkg.sloUrl}</code>
      </Field>
      <Field label="Certificate">
        <code>{pkg.certificate.fingerprint}</code>{' '}
        <span className="hint">expires {dayInWords(pkg.certificate.expiresAt)}</span>
      </Field>
      <Field label="Attributes">
        <ul className="attributes">
          {pkg.attributes.map((a) => (
            <li key={a.name}>
              <code>{a.name}</code>{' '}
              {a.unused && <Pill tone="bad">the app does not read it</Pill>}{' '}
              {a.justification}
            </li>
          ))}
        </ul>
      </Field>
      <Field label="Technical contacts">{contacts(pkg.contacts.technical)}</Field>
      <Field label="Support contacts">{contacts(pkg.contacts.support)}</Field>
      <Field label="PIA number">
        {pkg.privacyAssessmentReference === null ? (
          'not recorded yet'
        ) : (
          <code>{pkg.privacyAssessmentReference}</code>
        )}
      </Field>
      <CopyBlock label="SP metadata, in UBC’s structure" text={pkg.metadataXml} />
    </div>
  )
}

const contacts = (people: readonly { name: string; email: string }[]) =>
  people.length === 0
    ? 'none — the draft says who to add'
    : people.map((p) => `${p.name} <${p.email}>`).join(', ')

/**
 * THE ASSESSMENT'S DRAFT (Task 11): six questions, each with what Manifest knows and WHERE it read it,
 * and what only the owner can add — a to-do, and said when there is nothing to add, so an empty list
 * never reads as one the screen forgot. Then the whole draft as text for the Privacy Office's form.
 */
function AssessmentDraftView({ draft }: { draft: Schemas['PrivacyAssessmentDraft'] }) {
  return (
    <div className="package">
      <Field label="Drafted">
        {dayInWords(draft.generatedAt)}, from commit{' '}
        <code>{draft.fromCommit.slice(0, 12)}</code>
      </Field>
      <BeforeYouSend warnings={draft.warnings} />
      <ol className="sections">
        {draft.sections.map((section) => (
          <li key={section.id}>
            <strong>{section.title}</strong>
            <ul>
              {section.facts.map((fact, i) => (
                <li key={i}>
                  {fact.label}: {fact.value}{' '}
                  <span className="hint">— from {fact.source}</span>
                </li>
              ))}
            </ul>
            {section.gaps.length === 0 ? (
              <p className="hint">Nothing for you to add here.</p>
            ) : (
              <>
                <em>For you to add:</em>
                <ul className="gaps">
                  {section.gaps.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ol>
      <CopyBlock label="The whole draft, as text to paste" text={draft.text} />
    </div>
  )
}

function BeforeYouSend({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null
  return (
    <ul className="reasons warnings">
      {warnings.map((w, i) => (
        <li key={i}>
          <Pill tone="plain">before you send it</Pill> {w}
        </li>
      ))}
    </ul>
  )
}

/** A long text with *Copy*: the clipboard, or — where the browser refuses it — the text to select. */
function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState<'yes' | 'refused' | undefined>(undefined)
  return (
    <div className="copy">
      <span className="label">{label}</span>{' '}
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard.writeText(text).then(
            () => setCopied('yes'),
            () => setCopied('refused'),
          )
        }
      >
        Copy
      </button>{' '}
      {copied === 'yes' && <span className="hint">copied</span>}
      {copied === 'refused' && (
        <span className="hint">the browser refused — select the text and copy it</span>
      )}
      <pre>{text}</pre>
    </div>
  )
}

/**
 * *I'VE SENT IT* (Task 9): the day it went — today unless the person says otherwise, never before the
 * draft existed nor after today, in Vancouver — and the ticket they were given. **It always names the
 * draft read** (`draftGeneratedAt`), so a draft made again since is refused rather than recorded as
 * what was sent.
 */
function SendForm({
  to,
  reference,
  draftGeneratedAt,
  newKey,
  send,
  onSent,
}: {
  to: string
  reference: string
  draftGeneratedAt: string
  newKey: () => string
  send: (
    body: Schemas['SubmitLaunchRecordRequest'],
    key: string,
  ) => Promise<{ submittedAt: string | null }>
  onSent: () => void
}) {
  const today = vancouverDay(new Date())
  const [day, setDay] = useState(today)
  const [ticket, setTicket] = useState('')
  // WHAT WAS RECORDED, from the answer itself — the screen re-reads the record too, but a reader
  // should not have to find the change to know the press took.
  const [recorded, setRecorded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const attemptKey = useRef<string | undefined>(undefined)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    attemptKey.current ??= newKey()
    try {
      const answer = await send(
        {
          sentAt: day,
          draftGeneratedAt,
          ...(ticket.trim() === '' ? {} : { reference: ticket.trim() }),
        },
        attemptKey.current,
      )
      attemptKey.current = undefined
      setRecorded(answer.submittedAt)
      onSent()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="record-form" onSubmit={(e) => void submit(e)}>
      <h3>I’ve sent it</h3>
      <p className="hint">
        Once you have sent this draft to {to}, say so — Manifest then shows how long it
        has waited, and an administrator records the answer here.
      </p>
      <Field label="Sent on">
        <input
          type="date"
          value={day}
          min={vancouverDay(draftGeneratedAt)}
          max={today}
          onChange={(e) => setDay(e.target.value)}
          required
        />
      </Field>
      <Field label="Ticket">
        <input
          value={ticket}
          maxLength={128}
          onChange={(e) => setTicket(e.target.value)}
          placeholder={reference}
        />
      </Field>
      <button type="submit" disabled={busy}>
        {busy ? 'saying so…' : 'I’ve sent it'}
      </button>{' '}
      {recorded !== null && (
        <span className="ok">Recorded. {sentLine(recorded, new Date())}.</span>
      )}
      <Refusal error={error} />
    </form>
  )
}
