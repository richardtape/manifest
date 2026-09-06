import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { requireLockfile, runMandatoryGates, scanForSecrets } from './gates.js'

const blueprint = { lockfile: 'package-lock.json', name: 'fixture-node', version: '1.0.0' }

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mf-gate-'))
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}

describe('the secret gate (§12, pattern-based, never degrades offline)', () => {
  it('finds an AWS access key id', async () => {
    const findings = await scanForSecrets(
      fixture({ 'src/app.js': 'const k = "AKIAIOSFODNN7EXAMPLE"' }),
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.gate).toBe('secret')
    expect(findings[0]!.path).toBe('src/app.js')
    expect(findings[0]!.line).toBe(1)
  })

  it('finds a private key block and a GitHub token', async () => {
    const dir = fixture({
      'deploy.pem': '-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----\n',
      '.env.local': 'GITHUB_TOKEN=ghp_0123456789abcdefghijklmnopqrstuvwxyz\n',
    })
    const findings = await scanForSecrets(dir)
    expect(findings.map((f) => f.path).sort()).toEqual(['.env.local', 'deploy.pem'])
  })

  it('never reports the message text itself as the secret', async () => {
    const findings = await scanForSecrets(fixture({ 'a.js': 'AKIAIOSFODNN7EXAMPLE' }))
    // §14 redaction at capture: an Event carrying the matched secret would put it
    // straight into the log pipeline the gate exists to keep it out of.
    expect(findings[0]!.message).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })

  it('passes a clean tree', async () => {
    expect(await scanForSecrets(fixture({ 'src/app.js': 'export const x = 1\n' }))).toEqual([])
  })

  it("skips node_modules, which is neither the app's code nor its responsibility", async () => {
    const dir = fixture({ 'node_modules/pkg/k.js': 'AKIAIOSFODNN7EXAMPLE' })
    expect(await scanForSecrets(dir)).toEqual([])
  })

  /**
   * A FALSE POSITIVE HERE BLOCKS EVERY BUILD, which makes it worse than a missed
   * pattern: the gate cannot be waived by an app (§12), so there is no way past it.
   * The blueprint skeleton is the closest thing this repository has to real app
   * code — a lockfile of base64 integrity hashes, which is where an eight-character
   * prefix pattern like `AIza…` would fire by chance.
   */
  it('passes the blueprint skeleton, which is real committed code', async () => {
    const skeleton = fileURLToPath(
      new URL('../../../../blueprints/fixture-node/skeleton/', import.meta.url),
    )
    expect(await scanForSecrets(skeleton)).toEqual([])
  })
})

describe('the lockfile gate (§12: "committed lockfiles are required; builds fail without one")', () => {
  it("passes when the blueprint's lockfile is present", async () => {
    const dir = fixture({ 'package.json': '{}', 'package-lock.json': '{}' })
    expect(await requireLockfile(dir, blueprint)).toEqual([])
  })

  it('blocks when it is missing, and says which file', async () => {
    const findings = await requireLockfile(fixture({ 'package.json': '{}' }), blueprint)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.gate).toBe('lockfile')
    expect(findings[0]!.severity).toBe('block')
    expect(findings[0]!.message).toContain('package-lock.json')
  })
})

describe('the mandatory gate runner', () => {
  it('reports every failing gate at once rather than the first', async () => {
    const dir = fixture({ 'package.json': '{}', 'src/a.js': 'AKIAIOSFODNN7EXAMPLE' })
    const findings = await runMandatoryGates(dir, blueprint)
    expect(findings.map((f) => f.gate).sort()).toEqual(['lockfile', 'secret'])
  })

  // The whole point of §12's sentence. There is no options parameter to add a
  // waiver to, and this test is what stops one being added.
  it('takes no options — a gate an app can waive is not a gate', () => {
    expect(runMandatoryGates.length).toBe(2)
  })
})
