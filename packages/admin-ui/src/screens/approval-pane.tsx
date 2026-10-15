import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import type { Schemas, StreamFrame } from '@manifest/contract'
import type { Api } from '../api'
import {
  draftReasonKey,
  goneWords,
  paneAfter,
  reasonDraft,
  type ApprovalPane as Pane,
  type Verb,
} from '../approval-state'
import type { QueueItem } from '../queue-state'
import { Refusal } from '../refusal'
import {
  askedThrough,
  decidedAfter,
  eventsNewestFirst,
  useProjectStream,
} from '../stream'
import {
  Button,
  DiffView,
  EventLine,
  FactList,
  MachineValue,
  ObservedAction,
} from '../system'
import { ageShort, ageWords, clockInWords, dayInWords } from '../time'
import { ItemHead } from './item-head'

const RECENT_EVENTS = 8

function sec(title: string | null, children: ReactNode) {
  return (
    <section className="mfa-sec">
      {title === null ? null : <h3 className="mfa-sec__title">{title}</h3>}
      {children}
    </section>
  )
}
const para = (text: ReactNode) => <p className="mfa-sec__body">{text}</p>

function result(
  kind: 'steady' | 'neutral' | 'stepup',
  title: string,
  lines: ReactNode[],
) {
  return (
    <div className={`mfa-result mfa-result--${kind}`} role="status">
      <p className="mfa-result__title">{title}</p>
      {lines.map((line, i) => (
        <p key={i} className="mfa-result__body">
          {line}
        </p>
      ))}
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The scan in full (the design's §3.5): what this build introduced, fixable or not, and the base image's own. */
function scanWords(scan: Schemas['Release']['scan']): string {
  if (scan === null) return 'Not scanned'
  const age =
    scan.databaseAgeDays === null
      ? 'database of unknown age'
      : `database ${plural(Math.floor(scan.databaseAgeDays), 'day')} old`
  const counts = (c: { critical: number; high: number }) =>
    `${c.critical} critical, ${c.high} high`
  const base = scan.baseImageKnown ? counts(scan.baseImage) : 'not identified'
  return `${scan.scanner} · ${age} · introduced, fixable: ${counts(scan.fixable)} · introduced, no fix: ${counts(scan.unfixable)} · base image: ${base}`
}

const MARK: Record<string, string> = { met: 'met', unmet: 'unmet', not_built: 'notbuilt' }

function checklist(items: Schemas['LaunchReadiness']['items']) {
  return (
    <ul className="mfa-check">
      {items.map((c) => (
        <li key={c.id}>
          <span
            className={`mfa-check__mark mfa-check__mark--${MARK[c.state] ?? 'notbuilt'}`}
            role="img"
            aria-label={c.state}
          />
          <span className="mfa-check__id">{c.id}</span>
          <span className="mfa-check__why">
            {`${c.title}.${c.state === 'met' ? '' : ` ${c.why}`}${
              c.since === null ? '' : ` Since ${dayInWords(c.since)}.`
            }`}
          </span>
        </li>
      ))}
    </ul>
  )
}

export interface ApprovalPaneViewProps {
  releaseId: string
  /** The queue item, as last read — null when the pane was opened by its URL for a release not in the queue. */
  item: QueueItem | null
  me: Schemas['Me']
  now: Date
  pane: Pane
  release: Schemas['Release'] | null
  readiness: Schemas['LaunchReadiness'] | null
  members: Schemas['MemberList'] | null
  frames: StreamFrame[]
  stream: 'connecting' | 'live' | 'closed'
  closeCode?: number | undefined
  /** A read of the release's facts that failed. */
  readError?: unknown
  reason: string
  previewIndex: number
  onTakePreview?: () => void
  onDecide?: (verb: Verb) => void
  onRetry?: () => void
  onReason?: (reason: string) => void
  onPreviewIndex?: (index: number) => void
}

/**
 * THE RELEASE APPROVAL PANE, DRAWN (the design's §3.5): the request — who asked, when, through which
 * token (the project's stream), the owner's note quoted; the release and its scan; the checklist by raw
 * id; the stored preview and its diff, taken on a click; the decision, observed; and the project's
 * recent events. Every state of `approval-state.ts` has its drawing here.
 */
export function ApprovalPaneView(props: ApprovalPaneViewProps) {
  const { item, pane, release, readiness, members, now } = props
  const owner =
    members?.find((m) => m.role === 'owner')?.displayName ??
    item?.requestedBy?.displayName ??
    'the project’s owner'
  const preview =
    pane.at === 'previewed' ||
    pane.at === 'deciding' ||
    pane.at === 'stepping-up' ||
    (pane.at === 'refused' && pane.preview !== null)
      ? pane.preview
      : null

  // ── The request ──
  let request: ReactNode = null
  if (item !== null) {
    const who = item.requestedBy?.displayName ?? 'Someone'
    const age = ageWords(item.since, now)
    const through = askedThrough(props.frames, props.releaseId)
    request = sec(
      'The request',
      <>
        {para(
          through !== null && through.token !== null
            ? `An agent on ${who}’s token, ‘${through.token}’, asked ${age} ago.`
            : `${who} asked ${age} ago.`,
        )}
        {item.note === null ? null : (
          <blockquote className="mfa-quote">{item.note}</blockquote>
        )}
      </>,
    )
  }

  // ── The release ──
  const maker =
    release === null
      ? null
      : (members?.find((m) => m.userId === release.createdBy)?.displayName ??
        'someone no longer on the project')
  const facts =
    release === null ? (
      para('Reading the release…')
    ) : (
      <FactList
        rows={[
          {
            label: 'Release',
            value: <MachineValue value={release.id} label="release id" />,
          },
          {
            label: 'Image',
            value: <MachineValue value={release.imageDigest} label="image digest" />,
          },
          {
            label: 'Made by',
            value: `${maker}, ${ageWords(release.createdAt, now)} ago`,
          },
          release.summary !== null && {
            label: 'What it changes',
            value: release.summary,
          },
          readiness !== null && {
            label: readiness.launched ? 'Launched' : 'First launch',
            value: readiness.launched
              ? `Yes. A release goes to production self-serve unless it changes a sensitive field${
                  readiness.sensitiveFields.length === 0
                    ? '.'
                    : `, and this one changes ${readiness.sensitiveFields.join(' and ')}.`
                }`
              : 'Nothing of this app is in production yet.',
          },
          { label: 'Scan', value: scanWords(release.scan), mono: true },
          release.scan?.stale === true && {
            label: 'Scan database',
            value:
              'More than 7 days old, or of unknown age: a clean result is not evidence there is nothing to find.',
          },
        ]}
      />
    )

  // ── What the decision will record ──
  let record: ReactNode = null
  if (pane.at !== 'decided' && pane.at !== 'gone-elsewhere')
    record = sec(
      'What your decision will record',
      preview !== null ? (
        <>
          <div className="mfa-diff__meta">
            Preview
            <MachineValue value={preview.id} label="preview id" />
            {`taken by ${preview.createdByName} at ${clockInWords(preview.createdAt)} · valid until ${clockInWords(preview.expiresAt)}`}
          </div>
          <DiffView diff={preview.diff} />
        </>
      ) : (
        <>
          {para(
            'A stored copy of exactly what your decision will record. A language model writes its summary; it is kept for 30 minutes. Looking at this item has recorded nothing yet.',
          )}
          <div>
            <Button
              kind="secondary"
              size="sm"
              disabled={pane.at === 'previewing'}
              onClick={() => props.onTakePreview?.()}
            >
              {pane.at === 'previewing' ? 'Taking the preview…' : 'Take the preview'}
            </Button>
          </div>
        </>
      ),
    )

  // ── Decide ──
  let decide: ReactNode
  switch (pane.at) {
    case 'reading':
    case 'previewing':
      decide = para(
        'Take the preview first. Approve and reject both name it, and the record copies its diff.',
      )
      break
    case 'previewed':
    case 'deciding': {
      const busy = pane.at === 'deciding'
      decide = (
        <ObservedAction
          id={`reason-${props.releaseId}`}
          owner={owner}
          reason={props.reason}
          onReason={(v) => props.onReason?.(v)}
          placeholder={`Why, in words ${owner} can act on.`}
          hint={`Approving: a reason is optional, and kept on the approval record. Rejecting: required, and ${owner} reads it.`}
          seeLabel={`What ${owner} will see`}
          previews={[
            {
              label: 'If you approve',
              type: 'release.approved',
              lead: `${props.me.displayName} approved this release for production.`,
              reasonIn: 'record',
            },
            {
              label: 'If you reject',
              type: 'release.approval_rejected',
              lead: `${props.me.displayName} did not approve this release:`,
              reasonIn: 'sentence',
              after: `A rejection is final for this release. ${owner} also reads it on the launch checklist.`,
            },
          ]}
          previewIndex={props.previewIndex}
          onPreviewIndex={(i) => props.onPreviewIndex?.(i)}
          actions={[
            {
              label: 'Approve for production',
              kind: 'primary',
              disabled: busy,
              onClick: () => props.onDecide?.('approve'),
            },
            {
              label: 'Reject',
              kind: 'ghostDanger',
              needsReason: true,
              disabled: busy,
              onClick: () => props.onDecide?.('reject'),
            },
          ]}
          note="Deciding asks you to sign in again when your last sign-in is not recent. You come back to this preview, your reason kept."
        />
      )
      break
    }
    case 'stepping-up':
      decide = result('stepup', 'Sign in again to decide', [
        <>
          The platform answered <code className="mfa-mono">STEP_UP_REQUIRED</code>.
          Deciding a release needs a recent CWL sign-in. Taking you there now: you come
          back to this same preview, your reason kept, and nothing is recorded until you
          decide.
        </>,
      ])
      break
    case 'decided': {
      const a = pane.approval
      decide =
        a.decision === 'approved'
          ? result('steady', 'Approved for production', [
              <>
                {`Recorded at ${clockInWords(a.decidedAt)}, bound to `}
                <MachineValue value={a.imageDigest} label="digest" />
                {'. It binds this digest and nothing else.'}
              </>,
              `${owner} reads “${a.decidedByName} approved this release for production.”${
                a.reason === null ? '' : ' Your reason is on the approval record.'
              }`,
            ])
          : result('neutral', 'Not approved. That is final for this release.', [
              `${owner} reads “${a.decidedByName} did not approve this release: ${a.reason ?? ''}”, and sees it on the launch checklist. Nothing that is running changed.`,
            ])
      break
    }
    case 'gone-elsewhere':
      decide = result('neutral', goneWords(pane.approval), [
        pane.approval === null
          ? 'Nobody is asking for it to be signed off now.'
          : 'It is no longer waiting on us.',
        ...(pane.approval === null || pane.approval.reason === null
          ? []
          : [`Their reason: “${pane.approval.reason}”`]),
      ])
      break
    case 'refused':
      decide = (
        <>
          <Refusal error={pane.error} />
          {para(pane.message)}
          <div className="mfa-obs__actions">
            {pane.retry !== null ? (
              <Button kind="primary" size="sm" onClick={() => props.onRetry?.()}>
                Try again
              </Button>
            ) : (
              <Button kind="secondary" size="sm" onClick={() => props.onTakePreview?.()}>
                Take a new preview
              </Button>
            )}
          </div>
        </>
      )
      break
  }

  // ── The project's recent events ──
  const events = eventsNewestFirst(props.frames, RECENT_EVENTS)
  const slug = item?.project.slug ?? 'this project'
  const eventsBody =
    events.length === 0 ? (
      para(
        props.stream === 'connecting'
          ? 'Reading the project’s events…'
          : props.stream === 'closed'
            ? `The project’s events stopped (close ${props.closeCode ?? 'with no code'}).`
            : 'No events yet.',
      )
    ) : (
      <>
        {props.stream === 'closed'
          ? para(
              `The project’s events stopped (close ${props.closeCode ?? 'with no code'}).`,
            )
          : null}
        <ul className="mfa-events">
          {events.map((e) => (
            <EventLine
              key={e.id}
              when={`${ageShort(e.createdAt, now)} ago`}
              type={e.type}
              text={e.humanMessage}
              who={e.actor?.name}
              asAdmin={e.actor?.asAdministrator}
              reason={e.actor?.reason}
            />
          ))}
        </ul>
      </>
    )

  return (
    <>
      {item !== null ? (
        <ItemHead item={item} now={now} />
      ) : (
        <header className="mfa-pane__head">
          <div className="mfa-pane__top">
            <span className="mfa-over">Release approval</span>
          </div>
          <h2 className="mfa-pane__ask">
            <MachineValue value={props.releaseId} label="release id" />
          </h2>
        </header>
      )}
      <Refusal error={props.readError} />
      {request}
      {sec('The release', facts)}
      {readiness === null
        ? null
        : sec(
            readiness.launched ? 'The self-serve check' : 'The launch checklist',
            checklist(readiness.items),
          )}
      {record}
      {sec('Decide', decide)}
      {sec(`Recent events in ${slug}`, eventsBody)}
    </>
  )
}

const sessionStore = () => {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

export interface ApprovalPaneProps {
  api: Api
  me: Schemas['Me']
  releaseId: string
  item: QueueItem | null
  /** The queue's last read no longer lists it (Review Focus 4). */
  left: boolean
  /** The preview named in the URL — the step-up's return. */
  preview: string | undefined
  now: Date
}

/**
 * THE RELEASE APPROVAL PANE: its reads (the release, then its project's checklist and people), ONE
 * socket on its project's stream while it is open (Decision 18), the preview on a click or read back
 * by its id after the step-up, the decision sent once per state under the key the reducer chose, and
 * what became of it when it left the queue — read from `getApproval`, never from a refusal.
 */
export function ApprovalPane(props: ApprovalPaneProps) {
  const { api, releaseId, item } = props
  const [pane, dispatch] = useReducer(paneAfter, { at: 'reading' } as Pane)
  const [release, setRelease] = useState<Schemas['Release'] | null>(null)
  const [readiness, setReadiness] = useState<Schemas['LaunchReadiness'] | null>(null)
  const [members, setMembers] = useState<Schemas['MemberList'] | null>(null)
  const [readError, setReadError] = useState<unknown>(undefined)
  const [reason, setReason] = useState('')
  const [previewIndex, setPreviewIndex] = useState(0)
  const projectId = item?.project.id ?? release?.projectId ?? null
  const { frames, status, closeCode } = useProjectStream(projectId)

  // The facts: the release names its project, whose checklist and people follow.
  useEffect(() => {
    let live = true
    api
      .getRelease(releaseId)
      .then(async (r) => {
        if (!live) return
        setRelease(r)
        const [checks, people] = await Promise.all([
          api.getLaunchReadiness(r.projectId),
          api.listMembers(r.projectId),
        ])
        if (!live) return
        setReadiness(checks)
        setMembers(people)
      })
      .catch((e: unknown) => live && setReadError(e))
    return () => {
      live = false
    }
  }, [api, releaseId])

  // The step-up's return: the preview by its id, and the reason typed before leaving.
  const restoring = props.preview
  useEffect(() => {
    if (restoring === undefined) return
    let live = true
    api.getApprovalPreview(releaseId, restoring).then(
      (p) => {
        if (!live) return
        setReason(reasonDraft(sessionStore(), draftReasonKey(releaseId, p.id)).read())
        dispatch({ type: 'previewed', preview: p })
      },
      (e: unknown) => live && dispatch({ type: 'failed', error: e }),
    )
    return () => {
      live = false
    }
  }, [api, releaseId, restoring])

  // The decision: sent ONCE for each entry into `deciding` (StrictMode runs an effect twice), under
  // the key the reducer chose — the same key again on a retry after no answer.
  const sentFor = useRef<Pane | null>(null)
  useEffect(() => {
    if (pane.at !== 'deciding' || sentFor.current === pane) return
    sentFor.current = pane
    const said = reason.trim()
    const call =
      pane.verb === 'approve'
        ? api.approveRelease(
            releaseId,
            said === ''
              ? { previewId: pane.preview.id }
              : { previewId: pane.preview.id, reason: said },
            pane.key,
          )
        : api.rejectRelease(
            releaseId,
            { previewId: pane.preview.id, reason: said },
            pane.key,
          )
    call.then(
      (approval) => {
        reasonDraft(sessionStore(), draftReasonKey(releaseId, pane.preview.id)).clear()
        dispatch({ type: 'decided', approval })
      },
      (e: unknown) => dispatch({ type: 'failed', error: e }),
    )
  }, [api, pane, reason, releaseId])

  // The step-up: a full-page round trip back to this preview; the reason is already in storage.
  useEffect(() => {
    if (pane.at === 'stepping-up') window.location.assign(pane.to)
  }, [pane])

  // Decided elsewhere (Review Focus 4): the queue's read dropped it, or the stream carried another
  // administrator's decision — then what became of it is read from `getApproval`, once.
  const elsewhere =
    props.left || (item !== null && decidedAfter(frames, releaseId, item.since))
  // The ref asks once per trigger; the cleanup gives the ask back with the answer it cancels — React's
  // StrictMode runs an effect, cleans it up and runs it again, and a ref left set would let the second
  // run ask nothing while the first run's answer is dropped: a pane that never says what became of it.
  const askedOnce = useRef(false)
  useEffect(() => {
    if (!elsewhere || askedOnce.current) return
    askedOnce.current = true
    let live = true
    api.getApproval(releaseId).then(
      (approval) => live && dispatch({ type: 'gone', approval }),
      (e: unknown) => live && setReadError(e),
    )
    return () => {
      live = false
      askedOnce.current = false
    }
  }, [api, elsewhere, releaseId])

  const takePreview = () => {
    dispatch({ type: 'take-preview' })
    api.createApprovalPreview(releaseId, api.newKey()).then(
      (p) => {
        // A new preview keeps what was typed, now under its own key.
        reasonDraft(sessionStore(), draftReasonKey(releaseId, p.id)).write(reason)
        dispatch({ type: 'previewed', preview: p })
      },
      (e: unknown) => dispatch({ type: 'failed', error: e }),
    )
  }

  const onReason = (v: string) => {
    setReason(v)
    if (pane.at === 'previewed')
      reasonDraft(sessionStore(), draftReasonKey(releaseId, pane.preview.id)).write(v)
  }

  return (
    <ApprovalPaneView
      releaseId={releaseId}
      item={item}
      me={props.me}
      now={props.now}
      pane={pane}
      release={release}
      readiness={readiness}
      members={members}
      frames={frames}
      stream={status}
      closeCode={closeCode}
      readError={readError}
      reason={reason}
      previewIndex={previewIndex}
      onTakePreview={takePreview}
      onDecide={(verb) => dispatch({ type: 'decide', verb, key: api.newKey() })}
      onRetry={() => {
        if (pane.at === 'refused' && pane.retry !== null)
          dispatch({ type: 'decide', verb: pane.retry.verb, key: api.newKey() })
      }}
      onReason={onReason}
      onPreviewIndex={setPreviewIndex}
    />
  )
}
