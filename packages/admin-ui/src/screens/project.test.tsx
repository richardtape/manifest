import {
  ManifestApiError,
  subscribe,
  type EventFrame,
  type Schemas,
  type StreamFrame,
} from '@manifest/contract'
import { createMockServer, fixtures } from '@manifest/mock'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from '../api.js'
import { askedWords, type ProjectRead } from '../project-state.js'
import {
  ProjectView,
  readProject,
  rejectQuestion,
  type ProjectViewProps,
} from './project.js'

/**
 * ONE PROJECT'S PAGE, DRAWN FROM THE DEMO FLEET'S OWN ANSWERS — `readProject` through the console's
 * client, and the project's replay through `subscribe` — and an agent's question rejected against it.
 */
type Server = ReturnType<typeof createMockServer>

async function serve(): Promise<{ server: Server; origin: string }> {
  const server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  return { server, origin: `http://127.0.0.1:${port}` }
}
const close = (server: Server) => new Promise((resolve) => server.close(resolve))

async function replay(origin: string, projectId: string): Promise<StreamFrame[]> {
  const frames: StreamFrame[] = []
  const sub = subscribe({
    origin,
    session: 'mock-session',
    projectId,
    onFrame: (f) => frames.push(f),
  })
  await sub.ready
  sub.close()
  return frames
}

let shared: { server: Server; origin: string }
const reads: Record<string, ProjectRead> = {}
let bioFrames: StreamFrame[]

beforeAll(async () => {
  shared = await serve()
  const api = createApi({ origin: shared.origin, session: 'mock-session' })
  const fleet = await api.listFleet()
  for (const slug of ['bio-201-scheduler', 'cpsc-110-help', 'econ-101-polls'])
    reads[slug] = await readProject(api, fleet.find((p) => p.slug === slug)!.id)
  bioFrames = await replay(shared.origin, reads['bio-201-scheduler']!.project.id)
})

afterAll(async () => {
  await close(shared.server)
})

const render = (slug: string, over: Partial<ProjectViewProps> = {}) =>
  renderToStaticMarkup(
    <ProjectView
      read={reads[slug]!}
      me={fixtures.OPERATOR_ME}
      now={new Date()}
      frames={slug === 'bio-201-scheduler' ? bioFrames : []}
      stream="live"
      reasons={{}}
      acts={{}}
      {...over}
    />,
  )

const bioQuestion = () => reads['bio-201-scheduler']!.pendingActions[0]!
const REJECT_DISABLED =
  '<button class="mf-btn mf-btn--ghostDanger mf-btn--sm" type="button" disabled="">Reject for them</button>'
const REJECT_ENABLED =
  '<button class="mf-btn mf-btn--ghostDanger mf-btn--sm" type="button">Reject for them</button>'

describe('bio-201-scheduler’s page', () => {
  it('says the data is high — what serves production declares — not the very-high of its newest release', () => {
    const html = render('bio-201-scheduler')
    expect(html).toContain('<span class="mfa-mono">high</span> data')
    expect(html).not.toContain('<span class="mfa-mono">very-high</span> data')
  })

  it('names the operator who renamed it as a platform administrator, the reason in the left-rule quote', () => {
    const html = render('bio-201-scheduler')
    expect(html).toContain(
      '<span class="mfa-ev__who mfa-ev__who--admin">Operator One · as a platform administrator</span>',
    )
    expect(html).toContain(
      '<blockquote class="mfa-quote mfa-ev__reason">The course code changed this term — the department asked.</blockquote>',
    )
    expect(html).toContain('<span class="mfa-ev__type">project.renamed</span>')
  })

  it('names who minted the lab-group agent, from the members', () => {
    expect(render('bio-201-scheduler')).toMatch(
      /<td[^>]*>‘lab-group agent’<\/td>.*?<td[^>]*>Noor Aziz<\/td><\/tr>/,
    )
  })

  it('shows the launch checklist in its console form — the raw ids, blocking or not — and each record’s holder', () => {
    const html = render('bio-201-scheduler')
    expect(html).toContain('code-review')
    expect(html).toContain('admin-approval')
    expect(html).toContain('<strong>Active</strong> since ')
    expect(html).toContain('<strong>Approved</strong> since ')
    expect(html).toContain(
      `href="/projects/${reads['bio-201-scheduler']!.project.id}/records"`,
    )
  })

  it('offers Reject on the waiting question, which needs a reason — the field written for two readers', () => {
    const html = render('bio-201-scheduler')
    expect(html).toContain(
      '<strong>An agent asked to make the person whose CWL login is dpatel a collaborator of this project.</strong>',
    )
    expect(html).toContain(
      'Written for two readers: the agent is told it, and the project’s people see it.',
    )
    expect(html).toContain(REJECT_DISABLED)
    const reasons = { [bioQuestion().id]: 'Ask Dr. Moreno first.' }
    expect(render('bio-201-scheduler', { reasons })).toContain(REJECT_ENABLED)
  })

  it('disables Reject while the rejection is in flight (Review Focus 2)', () => {
    const id = bioQuestion().id
    const html = render('bio-201-scheduler', {
      reasons: { [id]: 'Ask Dr. Moreno first.' },
      acts: { [id]: { at: 'sending' } },
    })
    expect(html).toContain(REJECT_DISABLED)
    expect(html).not.toContain(REJECT_ENABLED)
  })

  it('shows a refusal by its code, and a rejection done as such', () => {
    const id = bioQuestion().id
    const error = new ManifestApiError(
      409,
      {
        error: {
          code: 'PENDING_ACTION_RESOLVED',
          message: 'this pending action was already rejected',
          requestId: 'req-1',
        },
      },
      'rejectPendingAction',
    )
    expect(
      render('bio-201-scheduler', { acts: { [id]: { at: 'refused', error } } }),
    ).toContain('<code class="refusal__code">PENDING_ACTION_RESOLVED</code>')
    const answered: Schemas['PendingAction'] = {
      ...bioQuestion(),
      state: 'rejected',
      reason: 'Ask Dr. Moreno first.',
    }
    const done = render('bio-201-scheduler', {
      read: { ...reads['bio-201-scheduler']!, pendingActions: [answered] },
      acts: { [id]: { at: 'done', answered } },
    })
    expect(done).toContain('Refused for them')
    expect(done).toContain('<q>Ask Dr. Moreno first.</q>')
    expect(done).not.toContain('Reject for them')
  })

  it('offers no owner’s action — Reject is the page’s one button', () => {
    const buttons = render('bio-201-scheduler').match(
      /<button class="mf-btn[^"]*"[^>]*>[^<]*</g,
    )
    expect(buttons).toEqual([REJECT_DISABLED.replace('</button>', '<')])
  })
})

describe('a set and its Incidents', () => {
  it('lists cpsc-110-help’s four production instances — two serving, the failed one and its retired partner', () => {
    const html = render('cpsc-110-help')
    expect(html).toContain('2 of 2 serving')
    expect(
      html.match(/mf-is-steady"><span class="mf-chip__dot"><\/span>Healthy/g),
    ).not.toBeNull()
    expect(html).toContain('>Failed</span><code>failed</code>')
    expect(html).toContain('>Retired</span><code>gone</code>')
  })

  it('reads econ-101-polls’ production: 1 of 2 serving, replacing given up — its log tail in the inverse surface', () => {
    const html = render('econ-101-polls')
    expect(html).toContain('1 of 2 serving')
    expect(html).toContain('Stopped, not replaced · ')
    expect(html).toContain(
      'It stopped, and replacing it gave up</span><code>exit_stopped</code>',
    )
    expect(html).toContain('<div class="mf-inverse__inset">')
  })
})

describe('rejecting an agent’s question', () => {
  it('sends the reason as the body AND as §26’s header — the agent told it, the people reading it beside the operator’s name', async () => {
    const { server, origin } = await serve()
    try {
      const api = createApi({ origin, session: 'mock-session' })
      const bio = (await api.listFleet()).find((p) => p.slug === 'bio-201-scheduler')!
      const [action] = await api.listPendingActions(bio.id)
      const answered = await rejectQuestion(
        { origin, session: 'mock-session' },
        action!.id,
        'Ask Dr. Moreno first.',
        api.newKey(),
      )
      expect([answered.state, answered.reason]).toEqual([
        'rejected',
        'Ask Dr. Moreno first.',
      ])
      const frames = await replay(origin, bio.id)
      const event = frames.find(
        (f): f is EventFrame =>
          f.kind === 'event' && f.type === 'pending_action.rejected',
      )!
      expect(event.actor).toEqual({
        name: 'Operator One',
        asAdministrator: true,
        reason: 'Ask Dr. Moreno first.',
        token: null,
      })
      // The sentence the page previews is the platform's.
      expect(event.humanMessage).toContain(
        `Operator One refused an agent's request to ${askedWords(action!)}: Ask Dr. Moreno first.`,
      )
    } finally {
      await close(server)
    }
  })
})
