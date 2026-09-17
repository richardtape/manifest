import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { manifestSchema } from '../spec/index.js'
import { checkBlueprintCompatibility } from './compatibility.js'
import { descriptorSchema, type BlueprintDescriptor } from './descriptor.js'
import { BlueprintLoadError, readTextTree } from './tree.js'

/** D25: one file of a knowledge pack, with the digest a client checks what arrived against. */
export interface KnowledgePackFile {
  path: string
  mediaType: 'text/markdown' | 'text/plain'
  sha256: string
  content: string
}

export interface LoadedStarter {
  name: string
  summary: string
  files: Readonly<Record<string, string>>
}

export interface BlueprintRegistry {
  list(): BlueprintDescriptor[]
  /** Resolves a "name@major" reference, exactly as manifest.yaml pins it. */
  resolve(ref: string): BlueprintDescriptor | undefined
  /** Absolute path to a blueprint's directory — the builder needs it for the Dockerfile. */
  pathOf(ref: string): string | undefined
  /** `skeleton/`, as text (P5a Task 10). */
  skeleton(ref: string): Readonly<Record<string, string>> | undefined
  /** §25: a starter this blueprint offers, validated when the registry loaded. */
  starter(ref: string, name: string): LoadedStarter | undefined
  /** D25: the knowledge pack, served over the API and versioned with the blueprint. */
  knowledgePack(ref: string): readonly KnowledgePackFile[] | undefined
}

/** §25: a starter holds an app's own code, not a dependency tree. */
const STARTER_LIMITS = { maxFiles: 200, maxBytes: 5 * 1024 * 1024 }
/** The skeleton carries a lockfile, which is most of its weight. */
const SKELETON_LIMITS = { maxFiles: 200, maxBytes: 5 * 1024 * 1024 }
const PACK_LIMITS = { maxFiles: 50, maxBytes: 1024 * 1024 }

async function loadStarter(
  dir: string,
  descriptor: BlueprintDescriptor,
  entry: { name: string; path: string; summary: string },
): Promise<LoadedStarter> {
  const ref = `${descriptor.blueprint}@${descriptor.major_version}`
  if (entry.path !== `./starters/${entry.name}/`) {
    throw new BlueprintLoadError(
      'BLUEPRINT_STARTER_PATH',
      `${ref}: starter '${entry.name}' names path ${entry.path}, not ./starters/${entry.name}/`,
    )
  }
  const files = await readTextTree(
    join(dir, entry.path),
    STARTER_LIMITS,
    `${ref} starter ${entry.name}`,
  )
  const text = files['manifest.yaml']
  if (text === undefined) {
    throw new BlueprintLoadError(
      'BLUEPRINT_STARTER_INVALID',
      `${ref}: starter '${entry.name}' has no manifest.yaml, and a starter declares what its app needs (§25)`,
    )
  }
  // §25: "validated when the blueprint is loaded — its manifest.yaml against §7 and against
  // the blueprint's own descriptor — so a starter that cannot pass validation is never
  // offered." The CATALOGUE is checked at creation: LiteLLM is not a boot dependency of this.
  const parsed = manifestSchema.safeParse(parseYaml(text))
  if (!parsed.success) {
    throw new BlueprintLoadError(
      'BLUEPRINT_STARTER_INVALID',
      `${ref}: starter '${entry.name}'s manifest.yaml is not a valid manifest: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    )
  }
  // Checked against THIS descriptor, so the starter must pin this blueprint: a starter
  // pinning another would be validated against one blueprint and built by another.
  if (parsed.data.blueprint !== ref) {
    throw new BlueprintLoadError(
      'BLUEPRINT_STARTER_INVALID',
      `${ref}: starter '${entry.name}'s manifest.yaml pins ${parsed.data.blueprint}, not the blueprint that offers it`,
    )
  }
  const incompatible = checkBlueprintCompatibility(parsed.data, descriptor)
  if (incompatible.length > 0) {
    throw new BlueprintLoadError(
      'BLUEPRINT_STARTER_INVALID',
      `${ref}: starter '${entry.name}' asks for what ${ref} cannot deliver: ${incompatible.map((e) => e.message).join('; ')}`,
    )
  }
  return { name: entry.name, summary: entry.summary, files }
}

export async function loadBlueprints(root: string): Promise<BlueprintRegistry> {
  const entries = await readdir(root, { withFileTypes: true })
  const byRef = new Map<
    string,
    {
      descriptor: BlueprintDescriptor
      dir: string
      skeleton: Record<string, string>
      starters: Map<string, LoadedStarter>
      pack: KnowledgePackFile[]
    }
  >()

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const text = await readFile(join(dir, 'blueprint.yaml'), 'utf8')
    const descriptor = descriptorSchema.parse(parseYaml(text))
    const ref = `${descriptor.blueprint}@${descriptor.major_version}`
    const skeleton = await readTextTree(
      join(dir, 'skeleton'),
      SKELETON_LIMITS,
      `${ref} skeleton`,
    )
    const starters = new Map<string, LoadedStarter>()
    for (const starter of descriptor.starters ?? []) {
      starters.set(starter.name, await loadStarter(dir, descriptor, starter))
    }
    const packFiles = await readTextTree(
      join(dir, descriptor.knowledge_pack),
      PACK_LIMITS,
      `${ref} knowledge pack`,
    )
    const pack = Object.entries(packFiles).map(([path, content]) => ({
      path,
      mediaType: path.endsWith('.md')
        ? ('text/markdown' as const)
        : ('text/plain' as const),
      sha256: createHash('sha256').update(content).digest('hex'),
      content,
    }))
    byRef.set(ref, { descriptor, dir, skeleton, starters, pack })
  }

  return {
    list: () => [...byRef.values()].map((v) => v.descriptor),
    resolve: (ref) => byRef.get(ref)?.descriptor,
    pathOf: (ref) => byRef.get(ref)?.dir,
    skeleton: (ref) => byRef.get(ref)?.skeleton,
    starter: (ref, name) => byRef.get(ref)?.starters.get(name),
    knowledgePack: (ref) => byRef.get(ref)?.pack,
  }
}
