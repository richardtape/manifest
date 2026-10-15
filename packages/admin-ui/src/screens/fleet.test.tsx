import type { Schemas } from '@manifest/contract'
import { createMockServer } from '@manifest/mock'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from '../api.js'
import { DEFAULT_SORT, NO_FILTER, type FleetFilter } from '../fleet-state.js'
import { FleetView, type FleetViewProps } from './fleet.js'

/** THE FLEET, DRAWN FROM THE DEMO FLEET'S OWN ANSWERS — `listFleet` and `listBlueprints` through the console's client. */
let server: ReturnType<typeof createMockServer>
let base: FleetViewProps

beforeAll(async () => {
  server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const api = createApi({ origin: `http://127.0.0.1:${port}`, session: 'mock-session' })
  const [fleet, blueprints] = await Promise.all([api.listFleet(), api.listBlueprints()])
  base = { fleet, blueprints, filter: NO_FILTER, sort: DEFAULT_SORT, now: new Date() }
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const render = (over: Partial<FleetViewProps> = {}) =>
  renderToStaticMarkup(<FleetView {...base} {...over} />)
const filtered = (over: Partial<FleetFilter>) => ({ filter: { ...NO_FILTER, ...over } })
const idOf = (fleet: Schemas['Fleet'], slug: string) =>
  fleet.find((p) => p.slug === slug)!.id

describe('the fleet', () => {
  it('says what the fleet does not carry yet, in words — no gap code', () => {
    expect(render()).toContain(
      'The fleet doesn’t carry an app’s data level, department, domains or this month’s AI spend yet.',
    )
  })

  it('counts every app and the archived one it hides: “14 apps · 1 archived, hidden”', () => {
    const html = render()
    expect(html).toContain('14 apps · 1 archived, hidden')
    expect(html).not.toContain('hist-105-archive')
  })

  it('counts what a filter leaves', () => {
    expect(render(filtered({ inProduction: true }))).toContain(
      '6 of 14 apps · 1 archived, hidden',
    )
    const archived = render(filtered({ archived: true }))
    expect(archived).toContain('1 of 14 apps')
    expect(archived).toContain('hist-105-archive')
    expect(archived).toContain('archived on ')
  })

  it('is a striped table, each app a link to its page — followed in-app by the shell’s listener', () => {
    const html = render()
    expect(html).toContain('<table class="mfa-table mfa-table--striped">')
    const econ = idOf(base.fleet, 'econ-101-polls')
    expect(html).toContain(
      `<a class="mfa-slugbtn" href="/projects/${econ}">econ-101-polls</a>`,
    )
  })

  it('draws econ-101-polls’ production as its state, its set of two and the Incident after its last deploy', () => {
    const html = render(filtered({ text: 'econ-101-polls' }))
    expect(html).toContain('<span class="mfa-env mfa-env--steady">')
    expect(html).toContain('<span class="mfa-env__n" title="2 instances">· 2</span>')
    expect(html).toMatch(/<span class="mfa-env__inc">failed \d+m ago<\/span>/)
  })

  it('draws an environment never deployed as such', () => {
    expect(render(filtered({ text: 'mus-100-listening' }))).toContain(
      '<span class="mfa-env mfa-env--none"><span class="mfa-env__dot"></span>not deployed</span>',
    )
  })

  it('marks the sorted column, the most recent deploy first by default', () => {
    expect(render()).toContain('aria-sort="descending"')
    expect(render({ sort: { key: 'slug', dir: 'asc' } })).toMatch(
      /<th scope="col" aria-sort="ascending"><button type="button" class="mfa-th"><span>App<\/span>/,
    )
  })

  it('says a filter that leaves nothing', () => {
    expect(render(filtered({ text: 'no such app' }))).toContain(
      'No app matches the filter.',
    )
  })
})
