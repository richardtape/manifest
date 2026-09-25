import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertOwnerOnly } from './custody.js'
import { generateMasterKeypair } from './envelope.js'
import { loadMasterKeypair } from './store.js'
import { masterKeyFileContent } from './testing.js'

/**
 * `SecretError` and the other classes this file sees all carry `code`; a thrown value
 * without one (an `ENOENT` from `stat`, say) reads as its message, so a test expecting a
 * code can never be satisfied by the wrong failure.
 */
const codeOf = async (p: Promise<unknown>) =>
  p.then(
    () => 'accepted',
    (e: { code?: string; message?: string }) => e.code ?? `no code: ${e.message}`,
  )

describe('the custody class the master key and the App key share (§20)', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'custody-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('accepts a key only its owner can read — the positive control', async () => {
    const f = join(dir, 'k')
    await writeFile(f, 'x')
    await chmod(f, 0o600)
    expect(await codeOf(assertOwnerOnly(f, 'SECRET_GITHUB_APP_KEY_PERMISSIONS'))).toBe(
      'accepted',
    )
    await chmod(f, 0o400)
    expect(await codeOf(assertOwnerOnly(f, 'SECRET_GITHUB_APP_KEY_PERMISSIONS'))).toBe(
      'accepted',
    )
  })

  // Labelled in OCTAL: `%o` formats as an object, so a red run read 'mode 416' for 0o640.
  it.each(
    [0o640, 0o604, 0o644, 0o660, 0o606, 0o610, 0o601].map((m) => [m.toString(8), m]),
  )('refuses mode %s, naming the code it was given', async (_octal, mode) => {
    const f = join(dir, 'k')
    await writeFile(f, 'x')
    await chmod(f, mode)
    expect(await codeOf(assertOwnerOnly(f, 'SECRET_GITHUB_APP_KEY_PERMISSIONS'))).toBe(
      'SECRET_GITHUB_APP_KEY_PERMISSIONS',
    )
    expect(await codeOf(assertOwnerOnly(f, 'SECRET_MASTER_KEY_PERMISSIONS'))).toBe(
      'SECRET_MASTER_KEY_PERMISSIONS',
    )
  })

  it('names the file and the fix, so the operator is sent to the right key', async () => {
    const f = join(dir, 'k')
    await writeFile(f, 'x')
    await chmod(f, 0o644)
    await expect(assertOwnerOnly(f, 'SECRET_MASTER_KEY_PERMISSIONS')).rejects.toThrow(
      `'${f}' is mode 644`,
    )
    await expect(assertOwnerOnly(f, 'SECRET_MASTER_KEY_PERMISSIONS')).rejects.toThrow(
      `chmod 600 '${f}'`,
    )
  })

  // *Another owner* cannot be made without `sudo`, so that half of the rule is asserted by
  // reading the code (`s.uid !== process.getuid()`), and the D5 plan's record says so.
})

describe('the master key is held to that class at load (§20, the D5 plan’s Decision 5)', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'custody-master-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('loads an owner-only master key and refuses the same key once its group can read it', async () => {
    const path = join(dir, 'master.key')
    await writeFile(path, masterKeyFileContent(await generateMasterKeypair()), 'utf8')
    await chmod(path, 0o600)
    expect(await codeOf(loadMasterKeypair(path))).toBe('accepted')
    await chmod(path, 0o640)
    expect(await codeOf(loadMasterKeypair(path))).toBe('SECRET_MASTER_KEY_PERMISSIONS')
  })

  it('still answers a MISSING key as unreadable, with the `make up` hint, not as a permission', async () => {
    const path = join(dir, 'absent.key')
    expect(await codeOf(loadMasterKeypair(path))).toBe('SECRET_MASTER_KEY_UNREADABLE')
    await expect(loadMasterKeypair(path)).rejects.toThrow('make up')
  })
})
