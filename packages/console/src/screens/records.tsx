import { useRef, useState, type FormEvent } from 'react'
import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { Field, Instant, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * §9's TWO EXTERNAL RECORDS — what UBC IAM and the UBC Privacy Office said about this app —
 * read by anyone who may read the project and written by a platform administrator (R1, P6a
 * Tasks 6 and 17).
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
  const requested = useAsync(async () => {
    const readiness = await api.getLaunchReadiness(projectId)
    if (readiness.candidateReleaseId === null) return null
    const release = await api.getRelease(readiness.candidateReleaseId)
    return release.config.production.auth
  }, [projectId])

  return (
    <>
      <Panel title="UBC IAM registration">
        <Refusal error={records.error} />
        {records.value !== undefined && (
          <IamRecord record={records.value.iamRegistration} />
        )}
        {isAdmin && records.value !== undefined && (
          <IamForm
            api={api}
            projectId={projectId}
            current={records.value.iamRegistration}
            requested={requested.value}
            requestedError={requested.error}
            onRecorded={records.reload}
          />
        )}
      </Panel>
      <Panel title="Privacy Impact Assessment">
        {records.value !== undefined && (
          <PiaRecord record={records.value.privacyAssessment} />
        )}
        {isAdmin && records.value !== undefined && (
          <PiaForm
            api={api}
            projectId={projectId}
            current={records.value.privacyAssessment}
            onRecorded={records.reload}
          />
        )}
      </Panel>
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
        {[...record.registeredAttributes].sort().join(', ')}
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
  current,
  requested,
  requestedError,
  onRecorded,
}: {
  api: Api
  projectId: string
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
        . A production release may request only what UBC registered (§7, §9).
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
