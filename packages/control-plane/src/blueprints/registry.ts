import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { descriptorSchema, type BlueprintDescriptor } from './descriptor.js'

export interface BlueprintRegistry {
  list(): BlueprintDescriptor[]
  /** Resolves a "name@major" reference, exactly as manifest.yaml pins it. */
  resolve(ref: string): BlueprintDescriptor | undefined
  /** Absolute path to a blueprint's directory — the builder needs it for the Dockerfile. */
  pathOf(ref: string): string | undefined
}

export async function loadBlueprints(root: string): Promise<BlueprintRegistry> {
  const entries = await readdir(root, { withFileTypes: true })
  const byRef = new Map<string, { descriptor: BlueprintDescriptor; dir: string }>()

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const text = await readFile(join(dir, 'blueprint.yaml'), 'utf8')
    const descriptor = descriptorSchema.parse(parseYaml(text))
    byRef.set(`${descriptor.blueprint}@${descriptor.major_version}`, { descriptor, dir })
  }

  return {
    list: () => [...byRef.values()].map((v) => v.descriptor),
    resolve: (ref) => byRef.get(ref)?.descriptor,
    pathOf: (ref) => byRef.get(ref)?.dir,
  }
}
