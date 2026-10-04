import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROUTE_DEFINITIONS } from '../routes/index.js'
import { UNVERSIONED } from '../unversioned.js'
import { CONTRACT_VERSION, openApiDocument } from './document.js'

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

  it('versions the document and @manifest/contract together (Decision 8)', async () => {
    const pkg = JSON.parse(
      await readFile(
        fileURLToPath(new URL('../../../../contract/package.json', import.meta.url)),
        'utf8',
      ),
    ) as { version: string }
    expect(pkg.version).toBe(CONTRACT_VERSION)
  })

  it('documents the event stream, and names the frame schema every message is (P5a Task 12)', () => {
    const document = openApiDocument(ROUTE_DEFINITIONS) as {
      paths: Record<string, { get?: Record<string, unknown> }>
      components: { schemas: Record<string, unknown> }
      tags: { name: string }[]
    }
    const stream = document.paths['/v1/projects/{projectId}/events']?.get
    expect(stream?.['x-manifest-websocket']).toMatchObject({
      frame: { $ref: '#/components/schemas/StreamFrame' },
      replay: 50,
      ready: 'manifest.stream.ready',
    })
    expect(stream?.operationId).toBe('streamProjectEvents')
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining(['StreamFrame', 'EventFrame', 'LogFrame', 'ControlFrame']),
    )
    expect(document.tags.map((t) => t.name)).toContain('events')
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

/**
 * §26 AS SPEC ACTION 5 WORDED IT (the faculty-ready plan's Task 15): an administrator who is a COLLABORATOR
 * gives a reason for what a collaborator may not do. The contract's own words — the header on the 24
 * operations that can ask, and `EventActor.asAdministrator` — are what a client is written from, so they
 * must say who is asked; and a header sent when none is asked is part of the request, never "ignored"
 * (sitting 6's F10). The plan's whole-branch review found both still stating Task 10's rule.
 */
describe('the published words of §26’s reason say who is asked (Task 15)', () => {
  const document = openApiDocument(ROUTE_DEFINITIONS) as {
    paths: Record<
      string,
      Record<string, { parameters?: { name: string; description?: string }[] }>
    >
    components: {
      schemas: Record<
        string,
        { description?: string; properties?: Record<string, { description?: string }> }
      >
    }
  }
  const headers = Object.values(document.paths)
    .flatMap((operations) => Object.values(operations))
    .flatMap((operation) => operation.parameters ?? [])
    .filter((p) => p.name === 'Manifest-Admin-Reason')

  it('the Manifest-Admin-Reason header names the collaborator beyond their role, and is never "ignored"', () => {
    expect(headers.length).toBeGreaterThan(0)
    for (const header of headers) {
      expect(header.description).toMatch(/collaborator/)
      expect(header.description).not.toMatch(/ignored/)
      expect(header.description).toMatch(/Idempotency-Key/)
    }
  })

  it('EventActor.asAdministrator — and EventActor itself — are true for a collaborator acting beyond their role', () => {
    const actor = document.components.schemas.EventActor
    expect(actor?.properties?.asAdministrator?.description).toMatch(/collaborator/)
    expect(actor?.description).toMatch(/collaborator/)
  })
})
