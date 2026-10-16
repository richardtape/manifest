import { createMockServer } from '@manifest/mock'
import type { Schemas } from '@manifest/contract'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from '../api.js'
import { CANNOT_READ, SECTIONS, SETTINGS } from '../settings.js'
import { SettingsView } from './settings.js'

/** SETTINGS, DRAWN — the blueprints from the mock's `listBlueprints`, every other value an admission. */
let server: ReturnType<typeof createMockServer>
let blueprints: Schemas['BlueprintList']

beforeAll(async () => {
  server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const api = createApi({ origin: `http://127.0.0.1:${port}`, session: 'mock-session' })
  blueprints = await api.listBlueprints()
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const VALUE = /<div class="mfa-set__value">(.*?)<\/div><div class="mfa-set__src">/g
const ADMISSION = `<span class="mfa-set__value--plain">${CANNOT_READ}</span>`

describe('Settings', () => {
  it('reads the blueprints — node-ts-mongo@1, current, its starters', () => {
    const html = renderToStaticMarkup(<SettingsView blueprints={blueprints} />)
    expect(blueprints.map((b) => b.ref)).toEqual(['node-ts-mongo@1'])
    expect(html).toContain('<code class="mfa-set__key">node-ts-mongo@1</code>')
    expect(html).toContain('Current</span><code>current</code>')
  })

  it('renders no value it cannot read — every row but a blueprint’s is the admission', () => {
    const html = renderToStaticMarkup(<SettingsView blueprints={blueprints} />)
    const values = [...html.matchAll(VALUE)].map((m) => m[1])
    expect(values).toHaveLength(SETTINGS.length + blueprints.length)
    expect(values.filter((v) => v === ADMISSION)).toHaveLength(SETTINGS.length)
    expect(
      values.filter((v) => v !== ADMISSION).every((v) => v!.includes('starters:')),
    ).toBe(true)
  })

  it('names every setting by its key and where it is set, in its section', () => {
    const html = renderToStaticMarkup(<SettingsView blueprints={blueprints} />)
    for (const s of SETTINGS)
      expect(html).toContain(`<code class="mfa-set__key">${s.key}</code>`)
    for (const s of SECTIONS) {
      expect(html).toContain(`id="set-h-${s.id}">${s.title}</h2>`)
      expect(html).toMatch(
        new RegExp(`<button type="button"( aria-current="true")?>${s.label}</button>`),
      )
    }
  })

  it('marks a superseded blueprint as such', () => {
    const older: Schemas['Blueprint'] = {
      ...blueprints[0]!,
      ref: 'node-ts-mongo@0',
      majorVersion: 0,
    }
    const html = renderToStaticMarkup(
      <SettingsView blueprints={[...blueprints, older]} />,
    )
    expect(html).toContain('Superseded by node-ts-mongo@1</span><code>superseded</code>')
  })
})
