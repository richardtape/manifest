import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { JOURNEY, OUTSIDE_THE_JOURNEY } from './coverage.js'

const DOCUMENT = new URL('../../contract/openapi.json', import.meta.url)

async function operationIds(): Promise<string[]> {
  const document = JSON.parse(await readFile(DOCUMENT, 'utf8')) as {
    paths: Record<string, Record<string, { operationId?: string }>>
  }
  return Object.values(document.paths).flatMap((item) =>
    Object.values(item).flatMap((o) =>
      typeof o === 'object' && o !== null && typeof o.operationId === 'string'
        ? [o.operationId]
        : [],
    ),
  )
}

/**
 * THE JOURNEY IS A GATE (the authoring API plan's Task 11, Decision 19): §22's end-to-end path
 * against the published document, both ways — the converse of the console's coverage gate, for
 * the whole path rather than one client.
 */
describe('the journey covers the API, and the API covers the journey (Decision 19)', () => {
  it('names no operation the document lacks', async () => {
    const known = new Set(await operationIds())
    const unknown = JOURNEY.flatMap((s) =>
      s.operations.filter((id) => !known.has(id)).map((id) => `${s.step}: ${id}`),
    )
    expect(unknown).toEqual([])
    expect(Object.keys(OUTSIDE_THE_JOURNEY).filter((id) => !known.has(id))).toEqual([])
  })

  it('places every operation the document has in a step — or says why it is not one', async () => {
    const ids = await operationIds()
    // A document that was not read has no operations and so none unplaced. Say which.
    expect(ids.length, 'no operations were read from the document').toBeGreaterThan(50)
    const placed = new Set(JOURNEY.flatMap((s) => s.operations))
    const unplaced = ids.filter((id) => !placed.has(id) && !(id in OUTSIDE_THE_JOURNEY))
    expect(unplaced).toEqual([])
    // And nothing both placed and set aside: one statement per operation.
    expect(Object.keys(OUTSIDE_THE_JOURNEY).filter((id) => placed.has(id))).toEqual([])
  })

  it('gives every step an operation or a plan that will serve it', () => {
    const empty = JOURNEY.filter(
      (s) => s.operations.length === 0 && s.later === undefined,
    )
    expect(empty.map((s) => s.step)).toEqual([])
    // The positive half: the steps that are later are named, so the rule above has cases.
    expect(JOURNEY.filter((s) => s.later !== undefined).length).toBeGreaterThan(0)
  })
})
