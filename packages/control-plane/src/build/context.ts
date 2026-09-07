import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
  /**
   * A `# syntax=` directive makes BuildKit fetch an external frontend image from
   * Docker Hub BEFORE it parses the rest of the file. §12 puts the builder on an
   * internal network with no egress, so the build dies with `failed to resolve
   * source metadata for docker.io/docker/dockerfile:1 … dial tcp` — measured
   * 2026-09-06, and fatal to C1 and to this plan's own offline acceptance.
   *
   * Refused here rather than left to fail during the build, because the build-time
   * failure names DNS and Docker Hub and never mentions the blueprint.
   */
  const syntax = /^[ \t]*#[ \t]*syntax[ \t]*=/im.exec(rendered)
  if (syntax !== null) {
    throw new BuildContextError(
      'BLUEPRINT_EXTERNAL_FRONTEND',
      'the blueprint Dockerfile declares an external BuildKit frontend with a ' +
        '`# syntax=` directive',
      'The builder has no egress (§12), so the frontend cannot be fetched and every ' +
        "build fails offline. Remove the directive: BuildKit's built-in frontend " +
        'handles everything a blueprint needs.',
    )
  }
  /**
   * D13: the build's package registry is the PLATFORM's, and `.npmrc` is how the
   * builder is told. `npm ci` reads it from the working directory, so a Dockerfile
   * that installs before copying it gets the PUBLIC registry — measured 2026-09-06,
   * `npm error … request to https://registry.npmjs.org/whatwg-url/…`, which is S1's
   * silently-wrong build arriving by a different route. Offline it fails loudly;
   * with the network up it SUCCEEDS against the wrong registry, which is worse.
   */
  const install = /^\s*RUN\b[^\n]*\bnpm\s+(ci|install|i)\b/im.exec(rendered)
  if (install !== null) {
    const copiesNpmrc = /^\s*COPY\b[^\n]*(^|\s)\.npmrc(\s|$)/im.exec(
      rendered.slice(0, install.index),
    )
    if (copiesNpmrc === null) {
      throw new BuildContextError(
        'BLUEPRINT_NPMRC_AFTER_INSTALL',
        'the blueprint Dockerfile runs an npm install before it copies `.npmrc`',
        'D13 points the build at the platform mirror through `.npmrc`, and npm reads ' +
          'it from the working directory. Copy it alongside package.json and the ' +
          'lockfile, above the install step.',
      )
    }
  }
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

/**
 * Exported because the driver needs `runtime.base_image` to hand `scanImage` a
 * `baseImageRef` — without it the scan attributes every base-image finding to the
 * app and blocks every build on findings no app can fix (defect 45).
 */
export async function loadBlueprintDescriptor(
  blueprintDir: string,
): Promise<BlueprintDescriptor> {
  return loadDescriptor(blueprintDir)
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
/**
 * The commit's own author/commit time, in Unix seconds — BuildKit's
 * `SOURCE_DATE_EPOCH`.
 *
 * A property of the source, so the same source builds to the same digest and a
 * rebuild months later still does. `Date.now()` would satisfy nothing: §13 binds
 * an approval to a digest, and P2's driver contract asserts the determinism
 * directly.
 */
export async function sourceDateEpoch(
  repoPath: string,
  commitSha: string,
): Promise<number> {
  const { stdout } = await run('git', [
    `--git-dir=${repoPath}`,
    'show',
    '-s',
    '--format=%ct',
    commitSha,
  ]).catch((error: Error) => {
    throw new BuildContextError(
      'SOURCE_TIMESTAMP_UNREADABLE',
      `cannot read the commit time of ${commitSha} in ${repoPath}: ${error.message}`,
      "The commit must exist in the project's bare repository.",
    )
  })
  const epoch = Number.parseInt(stdout.trim(), 10)
  if (!Number.isFinite(epoch)) {
    throw new BuildContextError(
      'SOURCE_TIMESTAMP_UNREADABLE',
      `git reported a non-numeric commit time for ${commitSha}: '${stdout.trim()}'`,
      'This is `git show -s --format=%ct`, which returns Unix seconds.',
    )
  }
  return epoch
}

export async function assembleContext(input: ContextInput): Promise<string> {
  const dir = join(input.workDir, 'context')
  await mkdir(dir, { recursive: true })
  // `git archive` reads a bare repository at a commit without a working tree, which
  // is what D5's local driver gives us.
  //
  // TWO PROCESSES, NOT A PIPE, and this is a correctness fix rather than a style
  // one. `git archive … | tar -x` takes its exit status from TAR, so every way
  // `git archive` can fail — a path that is not a repository, a commit that is not
  // in it, a corrupt object — produced an EMPTY context and reported success.
  // `SOURCE_EXPORT_FAILED` below could not fire, and the failure surfaced instead
  // as whichever §12 gate noticed first: `make demo` on 2026-09-07 reported
  // "package-lock.json is missing" for a repository whose HEAD plainly has one.
  // Measured: `git --git-dir=file://… archive HEAD` exits 128 while
  // `sh -c 'git … | tar …'` exits 0.
  const tarball = join(input.workDir, 'source.tar')
  await run('git', [
    `--git-dir=${input.repoPath}`,
    'archive',
    '--format=tar',
    '-o',
    tarball,
    input.commitSha,
  ]).catch((error: Error) => {
    throw new BuildContextError(
      'SOURCE_EXPORT_FAILED',
      `cannot export ${input.commitSha} from ${input.repoPath}: ${error.message}`,
      "The commit must exist in the project's bare repository, and `repoPath` is a " +
        'FILESYSTEM PATH, not the `file://` URL a builder is handed. ' +
        '`git --git-dir=<repo> cat-file -t <sha>` is the same question asked directly.',
    )
  })
  await run('tar', ['-x', '-f', tarball, '-C', dir]).catch((error: Error) => {
    throw new BuildContextError(
      'SOURCE_EXPORT_FAILED',
      `cannot unpack the export of ${input.commitSha}: ${error.message}`,
      'The archive git produced could not be read.',
    )
  })
  await rm(tarball, { force: true })

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
