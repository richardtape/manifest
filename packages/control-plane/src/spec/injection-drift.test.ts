import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { loadBlueprints } from '../blueprints/index.js'
import { manifestSchema } from './schema.js'
import { resolveConfig, type EnvironmentKind } from './resolve.js'
import {
  INJECTION_CONTRACT_VERSION,
  INJECTION_VARIABLES,
  renderInjection,
  type InjectionContext,
} from './injection.js'

const run = promisify(execFile)

/**
 * §16's *injection-contract drift* tier.
 *
 * §16: "The §8 table is asserted against the blueprint: every variable the
 * blueprint reads is injected, and `SAML_ENVIRONMENT` is never absent. This is
 * what keeps §8 honest — it was wrong once, from being written against memory of
 * the libraries rather than against them."
 *
 * SO IT READS THE BLUEPRINT'S SOURCE, not a list. A drift test that compares
 * `INJECTION_VARIABLES` against a hand-written expectation asserts that somebody
 * updated two files, which is the failure it exists to prevent — and it is
 * exactly how Task 10's own negative control came out green (defect 46).
 *
 * BOTH DIRECTIONS, for the same reason. Reading only one of the two lists
 * asserts nothing about the other: a variable the blueprint reads and nothing
 * injects is an app that cannot start, and a variable injected and read by
 * nothing is a §8 row that has quietly died while the table still promises it.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const BLUEPRINTS_ROOT = join(REPO_ROOT, 'blueprints')
const SKELETON = join(BLUEPRINTS_ROOT, 'node-ts-mongo/skeleton')

/**
 * `process.env.NAME` and `process.env['NAME']`, which are the two forms the
 * skeleton is allowed to use. A helper doing `process.env[name]` is deliberately
 * NOT matched: it would hide every name from this comparison, which is why
 * `server.js` and `auth/ubcshib.js` each open with one literal block.
 */
const ENV_READ = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\['([A-Z][A-Z0-9_]*)'\])/g

/**
 * Comments and string bodies removed, so only EXECUTABLE reads are counted.
 *
 * Found by this test on its first run, and the visible half was the harmless
 * half: the blueprint's own comments say "read as a literal `process.env.NAME`",
 * and the raw regex reported `NAME` and `X` as variables nothing injects. The
 * half that matters is the other direction — a read that has been COMMENTED OUT
 * still matches, so "the blueprint reads every required-in-all variable" would
 * pass against a variable the running app never reads. That is silent, and it is
 * the exact failure this tier exists to catch.
 *
 * String bodies go too, and for the same class of reason: a URL in a string
 * would otherwise have its `//` read as the start of a comment and swallow the
 * rest of the line. Written as a scanner rather than a regex because the two
 * states are not regular — `'//'` inside a string is not a comment, and `'`
 * inside a comment does not open one.
 */
function executableSource(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const two = text.slice(i, i + 2)
    if (two === '//') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (two === '/*') {
      i += 2
      while (i < text.length && text.slice(i, i + 2) !== '*/') i++
      i += 2
      continue
    }
    const ch = text[i]!
    if (ch === "'" || ch === '"' || ch === '`') {
      // Kept as an empty pair, so `process.env['NAME']` still parses as a read
      // while the CONTENTS of every other string are discarded.
      const quote = ch
      let body = ''
      i++
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') {
          body += text.slice(i, i + 2)
          i += 2
          continue
        }
        body += text[i]
        i++
      }
      i++
      out += quote + body + quote
      continue
    }
    out += ch
    i++
  }
  return out
}

async function jsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    // RECURSIVE. `auth/ubcshib.js` is where every SAML row is read, and a
    // top-level-only walk would have found none of them and passed.
    if (entry.isDirectory()) out.push(...(await jsFiles(full)))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

/** Every variable the blueprint's own source reads, with the file that reads it. */
async function variablesReadBy(dir: string): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  for (const file of await jsFiles(dir)) {
    const text = executableSource(await readFile(file, 'utf8'))
    for (const match of text.matchAll(ENV_READ)) {
      const name = match[1] ?? match[2]!
      if (!found.has(name)) found.set(name, file.replace(`${REPO_ROOT}`, ''))
    }
  }
  return found
}

const DEFAULTS = { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' }

const yaml = `
manifest: 1
name: chem-labs
blueprint: node-ts-mongo@1
runtime:
  port: 3000
  health: /healthz
services:
  - { type: mongo, version: '7', name: db }
auth:
  provider: cwl
  attributes: [ubcEduCwlPuid, mail]
`

/**
 * A CWL app with a mongo service, in STAGING.
 *
 * Staging deliberately: it is the kind where every row §8 marks required is
 * present. Sandbox omits `SAML_PRIVATE_KEY_PATH`, which §8 itself marks optional
 * there, so rendering sandbox would report that row as drift.
 */
function fullContext(kind: EnvironmentKind = 'staging'): InjectionContext {
  const spec = manifestSchema.parse(parse(yaml))
  const hostname =
    kind === 'production'
      ? 'chem-labs.manifest.internal'
      : `chem-labs.${kind}.manifest.internal`
  return {
    resolved: resolveConfig(spec, kind, DEFAULTS),
    environmentKind: kind,
    hostname,
    projectSlug: 'chem-labs',
    idp: {
      entityId: 'https://idp.manifest.internal/idp/shibboleth',
      baseUrl: 'https://idp.manifest.internal',
      spEntityBase: 'https://manifest.internal',
    },
    spEntity: {
      entityId: `https://manifest.internal/sp/chem-labs/${kind}`,
      acsUrl: `https://${hostname}${spec.auth.callback}`,
      sloUrl: `https://${hostname}${spec.auth.logout}`,
      attributes: [...spec.auth.attributes],
    },
    secrets: { sessionSecret: 'd'.repeat(48) },
    services: [
      { type: 'mongo', endpoint: 'mongodb://app:pw@mf-svc-db:27017/chem_labs_staging' },
    ],
  }
}

/**
 * Variables the blueprint may read that the platform does not inject.
 *
 * DELIBERATELY EMPTY. Every entry here is an exemption, and an exemption is how a
 * missing injection stops being visible — `MONGODB_DB_NAME` was specified in §8,
 * injected by nobody, and read with a fallback for as long as it took somebody
 * to notice. Adding a name here needs a reason written next to it.
 */
const ALLOWED_UNSET = new Set<string>([])

/**
 * §8 rows the blueprint is not expected to read.
 *
 * ALSO DELIBERATELY EMPTY, and that is a stronger claim than it looks: it means
 * `node-ts-mongo@1` genuinely consumes every variable §8 marks required in all
 * environments, including `SAML_IDP_METADATA_URL`, whose library default points
 * at the container's own loopback (§21).
 */
const PLATFORM_ONLY = new Set<string>([])

/**
 * One file out of a package tarball, taken from the PLATFORM'S mirror.
 *
 * Verdaccio holds the exact `.tgz` the builder installs, so this reads the
 * artefact rather than a copy of it. `--registry` is not used because npm would
 * consult a cache; the tarball is fetched and unpacked directly.
 */
async function pinnedLibrarySource(
  name: string,
  version: string,
  path: string,
): Promise<string> {
  const url = `http://127.0.0.1:7108/${name}/-/${name}-${version}.tgz`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `${url} answered ${response.status}. This suite needs \`make up\` — the ` +
        "platform's package mirror is where the pinned artefact lives.",
    )
  }
  const dir = await mkdtemp(join(tmpdir(), 'mf-pinned-'))
  try {
    const tgz = join(dir, 'pkg.tgz')
    await writeFile(tgz, Buffer.from(await response.arrayBuffer()))
    const { stdout } = await run('tar', ['-xzOf', tgz, path])
    return stdout
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('injection-contract drift (§16)', () => {
  it('injects every variable the blueprint skeleton reads', async () => {
    const read = await variablesReadBy(SKELETON)
    const rendered = new Set(Object.keys(renderInjection(fullContext())))
    const missing = [...read.entries()].filter(
      ([name]) => !rendered.has(name) && !ALLOWED_UNSET.has(name),
    )
    // The message names the FILE, because "MONGODB_DB_NAME missing" without a
    // location sends the reader to the wrong module.
    expect(
      missing,
      `the blueprint reads these and nothing injects them:\n${missing
        .map(([name, file]) => `  ${name}  (${file})`)
        .join('\n')}`,
    ).toEqual([])
  })

  it('the blueprint reads every variable the platform injects', async () => {
    /**
     * THE OTHER DIRECTION, and it is not redundant: a variable injected and read
     * by nothing is a §8 row that has quietly died while the table still
     * promises it.
     *
     * Compared against what `renderInjection` RENDERS, not against the table's
     * `requiredIn` column, and that is the load-bearing choice. A comparison
     * whose expected side is a hand-maintained list gets *smaller* when somebody
     * edits the list — so deleting a row would weaken the test rather than fail
     * it, which is defect 46's shape exactly. The renderer's output cannot be
     * weakened that way. `fullContext()` declares no app-level `env:`, so
     * everything rendered here is the platform's.
     */
    const read = await variablesReadBy(SKELETON)
    const rendered = Object.keys(renderInjection(fullContext()))
    const unread = rendered.filter((n) => !read.has(n) && !PLATFORM_ONLY.has(n))
    expect(
      unread,
      `the platform injects these and the blueprint reads none of them: ${unread.join(', ')}`,
    ).toEqual([])

    // And §8's own "Required in: all" column, which is the weaker statement of
    // the same thing — kept because it is the column a reader of §8 checks.
    const required = INJECTION_VARIABLES.filter((v) => v.requiredIn === 'all').map(
      (v) => v.name,
    )
    expect(required.filter((n) => !read.has(n) && !PLATFORM_ONLY.has(n))).toEqual([])
  })

  it('reads the staging-and-production row too, and allows it to be absent', async () => {
    // `SAML_PRIVATE_KEY_PATH` is the one §8 row that is required outside sandbox
    // and optional inside it, so neither direction above covers it: the first
    // would not notice its absence and the second does not ask for it. The
    // blueprint must read it, and must not require it.
    const read = await variablesReadBy(SKELETON)
    expect(read.has('SAML_PRIVATE_KEY_PATH')).toBe(true)
    expect(renderInjection(fullContext('staging'))).toHaveProperty(
      'SAML_PRIVATE_KEY_PATH',
    )
    expect(renderInjection(fullContext('sandbox'))).not.toHaveProperty(
      'SAML_PRIVATE_KEY_PATH',
    )
  })

  it('SAML_ENVIRONMENT is never absent, in any environment kind', () => {
    for (const kind of ['sandbox', 'staging', 'production'] as const) {
      expect(renderInjection(fullContext(kind))).toHaveProperty('SAML_ENVIRONMENT')
    }
  })

  it('asserts against the PINNED version of passport-ubcshib, not whatever is installed', async () => {
    /**
     * C6, and the roadmap's reason: "a caret range would let the contract drift
     * underneath the test that exists to catch drift". The two names §8 says the
     * LIBRARY itself reads are checked against its source at the pinned version.
     *
     * FROM THE PLATFORM'S OWN MIRROR, which is the artefact `npm ci` installs
     * inside the builder — not a clone on this developer's disk, which can be at
     * any state, and not `node_modules`, which the blueprint skeleton does not
     * have. It needs `make up`, exactly as the `db/` and `sso/` suites do.
     */
    const registry = await loadBlueprints(BLUEPRINTS_ROOT)
    const descriptor = registry.resolve('node-ts-mongo@1')!
    const version = descriptor.pinned_dependencies?.['passport-ubcshib']
    expect(version).toBe('0.1.6')

    const source = await pinnedLibrarySource(
      'passport-ubcshib',
      version!,
      'package/index.js',
    )
    // §8: SAML_ENVIRONMENT defaults to 'STAGING' at two sites, and SAML_LOGOUT_URL
    // is read from env rather than from options. Both claims are checked here
    // against the library rather than remembered — §8 "was wrong once, from being
    // written against memory of the libraries rather than against them".
    expect(source).toContain('process.env.SAML_ENVIRONMENT')
    expect(source).toContain('process.env.SAML_LOGOUT_URL')
    // And the fail-open default itself, which is the reason the row exists.
    expect(source).toMatch(/process\.env\.SAML_ENVIRONMENT\s*\|\|\s*'STAGING'/)
  })

  it("every blueprint's declared contract version is one this module renders", async () => {
    // A blueprint pinning another version is reading a different contract from
    // the one `renderInjection` produces, and nothing else would say so. Every
    // blueprint on disk, enumerated — a check that names one of two blueprints
    // is a check that cannot see the other.
    const registry = await loadBlueprints(BLUEPRINTS_ROOT)
    expect(registry.list().length).toBeGreaterThan(1)
    for (const descriptor of registry.list()) {
      expect(descriptor.injection.contract, descriptor.blueprint).toBe(
        INJECTION_CONTRACT_VERSION,
      )
    }
  })
})
