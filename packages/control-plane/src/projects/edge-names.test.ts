import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadReservedLabels } from './reserved-labels.js'

const reserved = await loadReservedLabels(
  fileURLToPath(new URL('../../../../infra/reserved-labels', import.meta.url)),
)
const CADDYFILE = new URL('../../../../infra/caddy/Caddyfile', import.meta.url)

/**
 * §23: "a test that fails when the edge serves a platform name the list does not
 * contain". The edge's named sites are the platform's own names; each must be reserved,
 * in the group that says Manifest serves it, or a project could take it and be shadowed.
 */
describe('the edge serves no platform name the reserved list lacks (§23)', () => {
  it('every named site in the Caddyfile is a label in the `manifest` group', async () => {
    const text = await readFile(CADDYFILE, 'utf8')
    const sites = [...text.matchAll(/^([a-z0-9*.,\s-]+?)\s*\{\s*$/gm)]
      .flatMap((m) => m[1]!.split(','))
      .map((s) => s.trim())
      .filter((s) => s.endsWith('.manifest.internal') && !s.startsWith('*'))
    // Not vacuous: idp and console are there today, and a regex that matched nothing
    // would pass every assertion below.
    expect(sites).toEqual(
      expect.arrayContaining(['idp.manifest.internal', 'console.manifest.internal']),
    )
    expect(
      sites
        .map((s) => s.split('.')[0]!)
        .filter((label) => reserved.lookup(label)?.group !== 'manifest'),
    ).toEqual([])
  })

  it('reserves the names §23 says the platform serves or will serve, and the probe `make verify` uses', () => {
    for (const label of ['idp', 'console', 'app', 'admin', 'api', 'mock']) {
      expect(reserved.lookup(label)?.group, label).toBe('manifest')
    }
    expect(
      reserved.lookup('edge'),
      'make verify probes edge.manifest.internal (P5a Task 3)',
    ).toBeDefined()
  })
})
