import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadReservedLabels } from './reserved-labels.js'

const REAL = fileURLToPath(new URL('../../../../infra/reserved-labels', import.meta.url))

async function dirWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mf-reserved-'))
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text)
  return dir
}

describe('§23’s reserved labels, as data (P5a Task 9)', () => {
  it('loads the list the repository holds — six groups, and chem is Chemistry', async () => {
    const reserved = await loadReservedLabels(REAL)
    expect(reserved.size).toBe(755)
    expect(reserved.groups).toHaveLength(6)
    expect(reserved.lookup('chem')).toMatchObject({ group: 'ubc-academic' })
    expect(reserved.lookup('chem')!.standsFor).toContain('Chemistry')
    expect(reserved.lookup('idp')).toMatchObject({ group: 'manifest' })
    expect(reserved.lookup('chem-labs')).toBeUndefined()
  })

  it('refuses a directory holding no list', async () => {
    await expect(loadReservedLabels(await dirWith({}))).rejects.toMatchObject({
      code: 'RESERVED_LABELS_MISSING',
    })
  })

  it('refuses a label no slug could be', async () => {
    const dir = await dirWith({
      'a.yaml': 'group: g\nreason: r\nlabels:\n  Bad_Label: "x"\n',
    })
    await expect(loadReservedLabels(dir)).rejects.toMatchObject({
      code: 'RESERVED_LABEL_INVALID',
    })
  })

  it('refuses a label in two places', async () => {
    const dir = await dirWith({
      'a.yaml': 'group: one\nreason: r\nlabels:\n  demo: "x"\n',
      'b.yaml': 'groups:\n  - group: two\n    reason: r\n    labels:\n      demo: "y"\n',
    })
    await expect(loadReservedLabels(dir)).rejects.toMatchObject({
      code: 'RESERVED_LABEL_DUPLICATE',
    })
  })

  it('refuses a label that does not say what it stands for', async () => {
    const dir = await dirWith({ 'a.yaml': 'group: g\nreason: r\nlabels:\n  demo: ""\n' })
    await expect(loadReservedLabels(dir)).rejects.toMatchObject({
      code: 'RESERVED_LABEL_UNEXPLAINED',
    })
  })

  it('refuses a file of neither shape', async () => {
    const dir = await dirWith({ 'a.yaml': 'labels:\n  - demo\n' })
    await expect(loadReservedLabels(dir)).rejects.toMatchObject({
      code: 'RESERVED_LABELS_SHAPE',
    })
  })
})
