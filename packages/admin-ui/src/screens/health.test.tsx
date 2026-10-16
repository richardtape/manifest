import { createMockServer } from '@manifest/mock'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from '../api.js'
import type { HealthRead } from '../health-state.js'
import { CANNOT_SEE, HealthView, readHealth } from './health.js'

/** HEALTH, DRAWN FROM THE DEMO FLEET'S OWN ANSWERS — read through the screen's own fan-out. */
let server: ReturnType<typeof createMockServer>
let read: HealthRead
let at: Date

beforeAll(async () => {
  server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const api = createApi({ origin: `http://127.0.0.1:${port}`, session: 'mock-session' })
  at = new Date()
  read = await readHealth(api, at)
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const render = (now = new Date()) =>
  renderToStaticMarkup(<HealthView read={read} at={at} now={now} />)
const idOf = (slug: string) => read.fleet.find((p) => p.slug === slug)!.id

describe('Health and risk', () => {
  it('draws the five panels, each saying what it read and what it cannot see', () => {
    const html = render()
    for (const title of [
      'Certificates expiring within 90 days',
      'Incidents, by cause',
      'Scans that prove less than they look',
      'Pinned to an older blueprint',
      'Policies a driver says it cannot enforce',
    ])
      expect(html).toContain(`<h2 class="mfa-panel__title">${title}</h2>`)
    for (const sentence of Object.values(CANNOT_SEE))
      expect(html).toContain(`<p class="mfa-panel__foot">${sentence}</p>`)
  })

  it('says what it cost — the reads counted', () => {
    expect(render()).toContain(`Read just now from ${read.reads} reads. `)
    expect(render(new Date(at.getTime() + 2 * 60_000 + 5_000))).toContain(
      `Read 2 minutes ago from ${read.reads} reads. `,
    )
  })

  it('draws math-oh-queue’s certificate red with what it would stop, and bio-201-scheduler’s amber', () => {
    const html = render()
    expect(html).toContain('<span class="mfa-days mfa-days--red">11 days</span>')
    expect(html).toContain('<span class="mfa-days mfa-days--amber">60 days</span>')
    expect(html).toContain(
      'If it expires, nobody can sign in to this live app. Renewing it is a change request to UBC IAM.',
    )
    expect(html.indexOf('math-oh-queue')).toBeLessThan(html.indexOf('bio-201-scheduler'))
  })

  it('leads the Incidents with econ-101-polls’ replacing given up, in attention ink, its log tail shown', () => {
    const html = render()
    const panel = html.slice(html.indexOf('Incidents, by cause'))
    expect(panel.indexOf('exit_stopped')).toBeLessThan(panel.indexOf('<code>exit</code>'))
    expect(panel).toContain(
      '<span class="mf-chip mf-is-attention"><span class="mf-chip__dot"></span>It stopped, and replacing it gave up</span><code>exit_stopped</code>',
    )
    expect(panel).toContain('<div class="mf-inverse__inset">')
  })

  it('names stats-sim’s stale scan, and says the empty blueprint panel in words', () => {
    const html = render()
    expect(html).toContain(
      '<span class="mf-chip mf-is-waiting"><span class="mf-chip__dot"></span>Stale database</span><code>stale: true</code>',
    )
    expect(html).toContain('Scanned against a database 9 days old.')
    expect(html).toContain('Every app is on its blueprint’s newest major.')
  })

  it('links each app to its page, followed in-app by the shell’s listener', () => {
    expect(render()).toContain(`href="/projects/${idOf('econ-101-polls')}"`)
  })
})
