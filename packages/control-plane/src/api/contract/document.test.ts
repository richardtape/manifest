import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROUTE_DEFINITIONS } from '../routes/index.js'
import { UNVERSIONED } from '../unversioned.js'
import { openApiDocument } from './document.js'

const DOCUMENT = fileURLToPath(
  new URL('../../../../contract/openapi.json', import.meta.url),
)

describe('the OpenAPI document (§16 Contract, D23.8)', () => {
  /**
   * THE DRIFT TEST, and the WRITER (P5a Decision 7). With MANIFEST_CONTRACT_WRITE=1 —
   * `pnpm contract:write` — it writes the document and passes; without, it compares. A CLI
   * would import db/client.ts, which throws without a database URL.
   *
   * THE PRICE: it runs under the unit project, whose global setup truncates the control
   * plane's tables — so `pnpm contract:write` empties them exactly as `pnpm test` does,
   * though it only writes a file. Run it where `pnpm test` would be run anyway.
   */
  it('is exactly what the route definitions generate', async () => {
    const generated = `${JSON.stringify(openApiDocument(ROUTE_DEFINITIONS), null, 2)}\n`
    if (process.env.MANIFEST_CONTRACT_WRITE === '1') {
      await writeFile(DOCUMENT, generated)
      return
    }
    const checkedIn = await readFile(DOCUMENT, 'utf8').catch(() => '(missing)')
    const firstDifference = checkedIn
      .split('\n')
      .findIndex((line, i) => line !== generated.split('\n')[i])
    expect(
      checkedIn === generated,
      `packages/contract/openapi.json is stale from line ${firstDifference + 1} — run \`pnpm contract:write\` and commit it`,
    ).toBe(true)
  })

  it('names every operation once, and every path parameter in its schema', () => {
    const ids = ROUTE_DEFINITIONS.map((r) => r.operationId)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
    for (const route of ROUTE_DEFINITIONS) {
      const inPath = [...route.path.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)]
        .map((m) => m[1])
        .sort()
      expect(Object.keys(route.params.shape).sort(), route.operationId).toEqual(inPath)
    }
  })

  it('lists the unversioned endpoints with their reasons, rather than omitting them', () => {
    const document = openApiDocument(ROUTE_DEFINITIONS) as {
      'x-manifest-unversioned': unknown[]
    }
    expect(document['x-manifest-unversioned']).toEqual(UNVERSIONED.map((u) => ({ ...u })))
  })

  it('refuses a representation that is not registered', () => {
    const [first] = ROUTE_DEFINITIONS
    const unregistered = {
      ...first!,
      success: { ...first!.success, schema: first!.success.schema.describe('a copy') },
    }
    expect(() => openApiDocument([unregistered])).toThrow(/not registered/)
  })
})
