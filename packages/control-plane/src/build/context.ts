import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { parse as parseYaml } from 'yaml'
import { descriptorSchema, type BlueprintDescriptor } from '../blueprints/index.js'

const run = promisify(execFile)

/** §20, D23.7: a stable code and a hint beside every message. */
export class BuildContextError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string,
  ) {
    super(message)
    this.name = 'BuildContextError'
  }
}

export interface ContextInput {
  repoPath: string
  commitSha: string
  /** The blueprint's directory: supplies the Dockerfile template and .npmrc (D13). */
  blueprintDir: string
  workDir: string
}

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g

/**
 * The blueprint ships a `Dockerfile.tmpl`, not a `Dockerfile` — `blueprint.yaml`
 * names it under `dockerfile:` and it carries `{{BASE_IMAGE}}` and `{{RUN_AS_UID}}`.
 * Copying it verbatim produces a Dockerfile whose `FROM` line is the literal text
 * `{{BASE_IMAGE}}`, and the build fails inside BuildKit with an invalid-reference
 * error that names nothing about blueprints.
 *
 * An UNKNOWN placeholder is refused rather than left in place, for the same reason:
 * silently shipping `{{DATABASE_URL}}` to the daemon turns a blueprint authoring
 * mistake into a build error three layers away.
 */
export function renderDockerfile(
  template: string,
  values: Record<string, string>,
): string {
  const unresolved: string[] = []
  const rendered = template.replace(PLACEHOLDER, (match, key: string) => {
    const value = values[key]
    if (value === undefined) {
      unresolved.push(key)
      return match
    }
    return value
  })
  if (unresolved.length > 0) {
    throw new BuildContextError(
      'BLUEPRINT_TEMPLATE_UNRESOLVED',
      `the blueprint Dockerfile has placeholders nothing supplies: ${[...new Set(unresolved)].join(', ')}`,
      'Every {{PLACEHOLDER}} in a blueprint Dockerfile must be one build/context.ts knows how ' +
        `to fill. It currently supplies: ${Object.keys(values).join(', ')}.`,
    )
  }
  return rendered
}

async function loadDescriptor(blueprintDir: string): Promise<BlueprintDescriptor> {
  const text = await readFile(join(blueprintDir, 'blueprint.yaml'), 'utf8').catch(() => {
    throw new BuildContextError(
      'BLUEPRINT_DESCRIPTOR_MISSING',
      `no blueprint.yaml in ${blueprintDir}`,
      "The build definition is the blueprint's (D13). Check MANIFEST_BLUEPRINTS_ROOT and that " +
        'the project pins a blueprint that exists.',
    )
  })
  return descriptorSchema.parse(parseYaml(text))
}

/**
 * D13: the app never supplies a build definition. The blueprint's files are written
 * AFTER the app's tree is exported, so a committed `Dockerfile` is overwritten
 * rather than honoured and a committed `.npmrc` cannot redirect the build at the
 * public npm registry.
 *
 * S1 lost a build to this ordering in the other direction: `.npmrc` copied after
 * `npm install` meant the first build silently used the PUBLIC registry while
 * appearing to succeed, and only inspecting the mirror's storage caught it.
 */
export async function assembleContext(input: ContextInput): Promise<string> {
  const dir = join(input.workDir, 'context')
  await mkdir(dir, { recursive: true })
  // `git archive` reads a bare repository at a commit without a working tree, which
  // is what D5's local driver gives us.
  await run('sh', [
    '-c',
    `git --git-dir=${JSON.stringify(input.repoPath)} archive ${JSON.stringify(input.commitSha)} | tar -x -C ${JSON.stringify(dir)}`,
  ]).catch((error: Error) => {
    throw new BuildContextError(
      'SOURCE_EXPORT_FAILED',
      `cannot export ${input.commitSha} from ${input.repoPath}: ${error.message}`,
      "The commit must exist in the project's bare repository. `git --git-dir=<repo> " +
        'cat-file -t <sha>` is the same question asked directly.',
    )
  })

  const descriptor = await loadDescriptor(input.blueprintDir)
  const template = await readFile(
    join(input.blueprintDir, descriptor.dockerfile),
    'utf8',
  ).catch(() => {
    throw new BuildContextError(
      'BLUEPRINT_DOCKERFILE_MISSING',
      `blueprint.yaml names ${descriptor.dockerfile}, which is not in ${input.blueprintDir}`,
      'The `dockerfile:` field is a path relative to the blueprint directory.',
    )
  })
  await writeFile(
    join(dir, 'Dockerfile'),
    renderDockerfile(template, {
      BASE_IMAGE: descriptor.runtime.base_image,
      RUN_AS_UID: String(descriptor.runtime.run_as_uid),
    }),
  )

  for (const file of ['.npmrc', '.dockerignore']) {
    await copyFile(join(input.blueprintDir, file), join(dir, file)).catch(
      (error: NodeJS.ErrnoException) => {
        // Both are optional per blueprint; anything other than "absent" is real.
        if (error.code !== 'ENOENT') throw error
      },
    )
  }
  return dir
}
