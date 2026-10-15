import {
  ManifestApiError,
  subscribe,
  type Schemas,
  type StreamFrame,
} from '@manifest/contract'
import { createMockServer, fixtures } from '@manifest/mock'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from '../api.js'
import type { ApprovalPane } from '../approval-state.js'
import { ApprovalPaneView, type ApprovalPaneViewProps } from './approval-pane.js'

/**
 * THE RELEASE APPROVAL PANE, DRAWN FROM THE DEMO FLEET'S OWN ANSWERS — `reading-responses`' sign-off:
 * its queue item, its release, its checklist, its people, a preview the fleet stored and the project's
 * replay, each read through the console's own client (so every object is the contract's shape, checked
 * on the way out by the mock), then the pane drawn in each of its states.
 */
type Server = ReturnType<typeof createMockServer>
let server: Server
let base: Omit<ApprovalPaneViewProps, 'pane'>
let preview: Schemas['ApprovalPreview']

beforeAll(async () => {
  server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const origin = `http://127.0.0.1:${port}`
  const api = createApi({ origin, session: 'mock-session' })
  const queue = await api.listQueue()
  const item = queue.items.find(
    (i) => i.kind === 'release-approval' && i.project.slug === 'reading-responses',
  )!
  const [release, readiness, members] = await Promise.all([
    api.getRelease(item.subjectId),
    api.getLaunchReadiness(item.project.id),
    api.listMembers(item.project.id),
  ])
  preview = await api.createApprovalPreview(item.subjectId, api.newKey())
  const frames: StreamFrame[] = []
  const sub = subscribe({
    origin,
    session: 'mock-session',
    projectId: item.project.id,
    onFrame: (f) => frames.push(f),
  })
  await sub.ready
  sub.close()
  base = {
    releaseId: item.subjectId,
    item,
    me: fixtures.OPERATOR_ME,
    // After the mock was made: its ages are its creation (t0, to the second) less each age, so a
    // `now` taken before t0 reads an item asked 3 days, 4 hours ago as 3 days, 3 hours.
    now: new Date(),
    release,
    readiness,
    members,
    frames,
    stream: 'live',
    reason: '',
    previewIndex: 0,
  }
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const render = (pane: ApprovalPane, props: Partial<ApprovalPaneViewProps> = {}) =>
  renderToStaticMarkup(<ApprovalPaneView {...base} pane={pane} {...props} />)

const APPROVE_DISABLED =
  '<button class="mf-btn mf-btn--primary mf-btn--sm" type="button" disabled="">Approve for production</button>'
const APPROVE_ENABLED =
  '<button class="mf-btn mf-btn--primary mf-btn--sm" type="button">Approve for production</button>'
const REJECT_DISABLED =
  '<button class="mf-btn mf-btn--ghostDanger mf-btn--sm" type="button" disabled="">Reject</button>'
const REJECT_ENABLED =
  '<button class="mf-btn mf-btn--ghostDanger mf-btn--sm" type="button">Reject</button>'

describe('the request', () => {
  it('quotes the owner’s note with the system’s left rule', () => {
    expect(render({ at: 'reading' })).toContain(
      '<blockquote class="mfa-quote">The class starts on Monday — the egress change is the only new thing.</blockquote>',
    )
  })

  it('names the token it was asked through, read from the project’s stream', () => {
    const html = render({ at: 'reading' })
    expect(html).toMatch(
      /An agent on Instructor One’s token, ‘the agent that builds this app’, asked 3 days, 4 hours ago\./,
    )
  })

  it('says no token when the stream holds no request for the release — not said, never guessed', () => {
    const html = render({ at: 'reading' }, { frames: [] })
    expect(html).toContain('Instructor One asked 3 days, 4 hours ago.')
    expect(html).not.toContain('token,')
  })
})

describe('the release and its checklist', () => {
  it('shows the release’s id and digest as machine values, who made it by name, and the scan', () => {
    const html = render({ at: 'reading' })
    expect(html).toContain(base.releaseId)
    expect(html).toContain(base.release!.imageDigest)
    expect(html).toMatch(/Instructor One, \d+ days?(, \d+ hours?)? ago/)
    expect(html).toContain(base.release!.scan!.scanner)
  })

  it('says someone no longer on the project when its maker is not a member', () => {
    expect(render({ at: 'reading' }, { members: [] })).toContain(
      'someone no longer on the project',
    )
  })

  it('lists every checklist item by its raw id beside its words', () => {
    const html = render({ at: 'reading' })
    for (const i of base.readiness!.items)
      expect(html).toContain(`<span class="mfa-check__id">${i.id}</span>`)
    expect(html).toContain('The self-serve check') // reading-responses is launched
  })
})

describe('the preview and the decision', () => {
  it('offers the preview on a click, and no decision before it', () => {
    const html = render({ at: 'reading' })
    expect(html).toContain('>Take the preview</button>')
    expect(html).toContain(
      'A language model writes its summary; it is kept for 30 minutes.',
    )
    expect(html).not.toContain('Approve for production</button>')
  })

  it('shows the stored preview’s diff, and says honestly when the model did not answer', () => {
    const unavailable = {
      ...preview,
      diff: { ...preview.diff, summary: null, summarySource: 'unavailable' as const },
    }
    const html = render({ at: 'previewed', preview: unavailable })
    expect(html).toContain(preview.id)
    expect(html).toContain('taken by Operator One at')
    expect(html).toContain('The model didn’t answer.')
  })

  it('shows What Instructor One will see: Operator One’s own sentence', () => {
    const html = render({ at: 'previewed', preview })
    expect(html).toContain('What Instructor One will see')
    expect(html).toContain('Operator One approved this release for production.')
  })

  it('disables Reject until a reason is written; Approve needs none', () => {
    const empty = render({ at: 'previewed', preview })
    expect(empty).toContain(APPROVE_ENABLED)
    expect(empty).toContain(REJECT_DISABLED)
    const written = render({ at: 'previewed', preview }, { reason: 'Not in the PIA.' })
    expect(written).toContain(REJECT_ENABLED)
  })

  it('disables both while a decision is in flight (Review Focus 2)', () => {
    const html = render(
      { at: 'deciding', preview, verb: 'approve', key: 'k1' },
      { reason: 'Fine.' },
    )
    expect(html).toContain(APPROVE_DISABLED)
    expect(html).toContain(REJECT_DISABLED)
  })

  it('says it is taking the operator to sign in again, to this same preview', () => {
    const html = render({ at: 'stepping-up', preview, to: '/auth/step-up?returnTo=x' })
    expect(html).toContain('Sign in again to decide')
    expect(html).toContain('STEP_UP_REQUIRED')
  })
})

describe('what became of it', () => {
  const approval = (
    by: string,
    decision: 'approved' | 'rejected',
  ): Schemas['Approval'] => ({
    id: '9c8d7e6f-5a4b-4c3d-8e2f-1a0b9c8d7e6f',
    releaseId: base.releaseId,
    projectId: preview.projectId,
    decision,
    decidedBy: '13131313-1313-4313-8313-131313131313',
    decidedByName: by,
    decidedAt: '2026-10-14T20:00:00Z',
    imageDigest: preview.imageDigest,
    reason: decision === 'rejected' ? 'Not in the PIA.' : null,
    diff: preview.diff,
    previewId: preview.id,
  })

  it('says your approval, bound to its digest, and what the owner reads', () => {
    const html = render({
      at: 'decided',
      approval: approval('Operator One', 'approved'),
      byYou: true,
    })
    expect(html).toContain('Approved for production')
    expect(html).toContain(
      'Instructor One reads “Operator One approved this release for production.”',
    )
    expect(html).not.toContain('Approve for production</button>')
  })

  it('says your rejection is final, with the reason the owner reads', () => {
    const html = render({
      at: 'decided',
      approval: approval('Operator One', 'rejected'),
      byYou: true,
    })
    expect(html).toContain('Not approved. That is final for this release.')
    expect(html).toContain('Operator One did not approve this release: Not in the PIA.')
  })

  it('says who else decided it, and offers no second decision (Review Focus 4)', () => {
    const html = render({
      at: 'gone-elsewhere',
      approval: approval('Operator Two', 'approved'),
    })
    expect(html).toContain('Operator Two approved this on October 14, 2026.')
    expect(html).not.toContain('Approve for production</button>')
    expect(html).not.toContain('Take the preview</button>')
  })

  it('says a stale preview, the refusal’s code, and offers a new preview — never a retry', () => {
    const error = new ManifestApiError(
      409,
      {
        error: {
          code: 'APPROVAL_PREVIEW_STALE',
          message: 'changed since this preview',
          requestId: 'req-9',
        },
      },
      'approveRelease',
    )
    const html = render({
      at: 'refused',
      preview,
      code: 'APPROVAL_PREVIEW_STALE',
      message:
        'Something moved since you read the preview. Nothing was recorded, and the release is untouched. Take a new one.',
      error,
      retry: null,
    })
    expect(html).toContain('<code class="refusal__code">APPROVAL_PREVIEW_STALE</code>')
    expect(html).toContain('Something moved since you read the preview.')
    expect(html).toContain('>Take a new preview</button>')
    expect(html).not.toContain('>Try again</button>')
  })

  it('offers the same decision again after no answer', () => {
    const html = render({
      at: 'refused',
      preview,
      code: 'NO_ANSWER',
      message: 'x',
      error: new TypeError('fetch failed'),
      retry: { verb: 'approve', key: 'k1' },
    })
    expect(html).toContain('>Try again</button>')
  })
})

describe('the project’s recent events', () => {
  it('lists the replay newest first, naming who acted and the token', () => {
    const html = render({ at: 'reading' })
    expect(html).toContain('Recent events in reading-responses')
    expect(html).toContain('<span class="mfa-ev__type">approval.requested</span>')
    const newest = html.indexOf('approval.requested')
    const older = html.indexOf('build.succeeded')
    expect(newest).toBeGreaterThan(-1)
    expect(newest).toBeLessThan(older)
  })

  it('says it is still reading them while the stream connects', () => {
    expect(render({ at: 'reading' }, { frames: [], stream: 'connecting' })).toContain(
      'Reading the project’s events…',
    )
  })
})
