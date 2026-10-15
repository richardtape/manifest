import type { Schemas } from '@manifest/contract'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { itemKey } from '../queue-state.js'
import { QueueView, type QueueViewProps } from './queue.js'

// 12:00 in Vancouver.
const NOW = new Date('2026-10-15T19:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

let n = 0
const item = (
  kind: Schemas['QueueItem']['kind'],
  since: string,
  slug: string,
  who: string | null,
  extra: Partial<Schemas['QueueItem']> = {},
): Schemas['QueueItem'] => ({
  kind,
  since,
  summary: `${slug} asks for something.`,
  note: null,
  environment: null,
  project: {
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    slug,
    name: slug.toUpperCase(),
  },
  subjectId: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  requestedBy: who === null ? null : { id: who, displayName: who },
  ...extra,
})

const RR = item(
  'release-approval',
  ago(3 * DAY + 4 * HOUR),
  'reading-responses',
  'Instructor One',
  {
    note: 'The class starts on Monday.',
  },
)
const PHYS = item('iam-registration-to-submit', ago(DAY), 'phys-101-labs', 'Jordan Lee', {
  environment: 'production',
})
const UBC = item('privacy-assessment', ago(23 * DAY), 'mock-app', 'Instructor One')
const STATS = item('iam-registration', ago(4 * DAY), 'stats-sim', 'Leo Park', {
  environment: 'staging',
})

const QUEUE: Schemas['Queue'] = {
  items: [UBC, STATS, RR, PHYS],
  oldestSince: UBC.since,
  truncated: false,
}

const render = (props: Partial<QueueViewProps> = {}) =>
  renderToStaticMarkup(
    <QueueView
      queue={QUEUE}
      now={NOW}
      readAt={NOW}
      filter={{ text: '', kinds: [] }}
      selected={null}
      {...props}
    />,
  )

describe('the queue, drawn', () => {
  it('headlines the oldest wait on us — 3 days, 4 hours, not UBC’s 23 days — then the people, then the items', () => {
    const html = render()
    expect(html).toContain('Oldest waiting on us')
    expect(html).toContain('<div class="mfa-head__age">3 days, 4 hours</div>')
    expect(html).not.toContain('23 days')
    expect(html).toContain(
      '<span class="mfa-head__n">2</span><span class="mfa-head__l">people waiting on an administrator</span>',
    )
    expect(html).toContain(
      '<span class="mfa-head__n">4</span><span class="mfa-head__l">items · 2 on us, 2 with UBC</span>',
    )
    expect(html).toContain('Release approval, reading-responses.')
  })

  it('says "Nobody is waiting on us." in steady when our band is empty, UBC’s waits notwithstanding', () => {
    const html = render({
      queue: { items: [UBC], oldestSince: UBC.since, truncated: false },
    })
    expect(html).toContain('mfa-head mfa-head--empty')
    expect(html).toContain('Nobody is waiting on us.')
    expect(html).not.toContain('Oldest waiting on us')
  })

  it('says when only the oldest 200 are shown', () => {
    expect(render()).not.toContain('Only the oldest 200 are shown')
    expect(render({ queue: { ...QUEUE, truncated: true } })).toContain(
      'Only the oldest 200 are shown',
    )
  })

  it('says when it was read, and that it reads again every 60 seconds', () => {
    expect(render()).toContain('Read just now · again every 60 seconds')
    expect(render({ readAt: new Date(NOW.getTime() - 40_000) })).toContain(
      'Read 40 seconds ago · again every 60 seconds',
    )
  })

  it('puts each item in its band, oldest first, under the band’s own heading', () => {
    const html = render()
    expect(html).toContain('<h2 class="mfa-band__title">Waiting on us</h2>')
    expect(html).toContain('The headline counts these.')
    expect(html).toContain('<h2 class="mfa-band__title">Waiting on UBC</h2>')
    expect(html).toContain('Ours to chase and record.')
    const at = (s: string) => html.indexOf(s)
    expect(at('reading-responses')).toBeLessThan(at('phys-101-labs')) // our band, oldest first
    expect(at('phys-101-labs')).toBeLessThan(at('mock-app')) // our band before UBC's
    expect(at('mock-app')).toBeLessThan(at('stats-sim')) // UBC's, oldest first
  })

  it('draws every row amber — the drawing’s row, never red — with its age, kind, slug, sentence and holder', () => {
    const html = render()
    expect(html.match(/<button type="button" class="mfa-row"/g)).toHaveLength(4)
    expect(html).not.toMatch(/attention|mf-is-|--red|danger/)
    expect(html).toContain('<span class="mfa-row__agev">3d 4h</span>')
    expect(html).toContain('<span class="mfa-row__kind">Release approval</span>')
    expect(html).toContain('<span class="mfa-row__slug">reading-responses</span>')
    expect(html).toContain(
      '<span class="mfa-row__ask">reading-responses asks for something.</span>',
    )
    expect(html).toContain(
      '<span class="mfa-row__m mfa-row__m--holder">Waiting on us</span>',
    )
    expect(html).toContain(
      '<span class="mfa-row__m mfa-row__m--holder">With the Privacy Office</span>',
    )
    expect(html).toContain(
      '<span class="mfa-row__m mfa-row__m--holder">With UBC IAM</span>',
    )
    expect(html).toContain('<span class="mfa-row__m mfa-row__m--mono">staging</span>')
  })

  it('marks a note only on the row that has one', () => {
    const html = render()
    expect(html.match(/✎ a note/g)).toHaveLength(1)
    const rr = html.slice(
      html.indexOf('reading-responses'),
      html.indexOf('phys-101-labs'),
    )
    expect(rr).toContain('<span class="mfa-row__m mfa-row__m--flag">✎ a note</span>')
  })

  it('names who asked and the day, in Vancouver, and someone when nobody is recorded', () => {
    const html = render({
      queue: {
        items: [RR, { ...PHYS, requestedBy: null }],
        oldestSince: RR.since,
        truncated: false,
      },
    })
    expect(html).toContain('Instructor One asked on October 12, 2026')
    expect(html).toContain('Someone sent it on October 14, 2026')
  })

  it('marks the selected row, and gives every row an id the keyboard can focus', () => {
    const html = render({ selected: itemKey(PHYS) })
    expect(html).toContain(
      `<button type="button" class="mfa-row mfa-row--on" aria-current="true" id="row-${itemKey(PHYS)}">`,
    )
    expect(html.match(/class="mfa-row mfa-row--on"/g)).toHaveLength(1)
  })

  it('filters by the text and the kinds, says what it leaves, and never regroups', () => {
    const slug = (s: string) => `<span class="mfa-row__slug">${s}</span>`
    const html = render({ filter: { text: 'stats', kinds: [] } })
    expect(html).not.toContain(slug('reading-responses'))
    expect(html).toContain(slug('stats-sim'))
    expect(html).toContain('Nothing here matches the filter.')
    expect(html).toContain('1 of 4 · j and k move')
    // The headline is the queue's, never the filter's.
    expect(html).toContain('<div class="mfa-head__age">3 days, 4 hours</div>')
    const kinds = render({ filter: { text: '', kinds: ['release-approval'] } })
    expect(kinds).toContain(slug('reading-responses'))
    expect(kinds).not.toContain(slug('stats-sim'))
    expect(kinds).toContain('aria-pressed="true">Release approvals</button>')
    expect(kinds).toContain('aria-pressed="false">With UBC</button>')
  })

  it('asks for a choice when nothing is selected', () => {
    expect(render()).toContain('Choose an item to see what it asks, and decide it.')
  })
})
