import { generateKeyPairSync, verify } from 'node:crypto'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appJwt, loadAppKey } from './app-auth.js'

describe("the App's JWT (GitHub: RS256, iss = App ID, exp within ten minutes)", () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const now = new Date('2026-09-24T12:00:00Z')

  it('is a compact RS256 JWS that the PUBLIC key verifies', () => {
    const [h, p, s] = appJwt({ appId: '1000001', key: privateKey, now }).split('.')
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${h}.${p}`),
        publicKey,
        Buffer.from(s!, 'base64url'),
      ),
    ).toBe(true)
  })

  it('backdates iat by 60 s for clock drift and expires in 9 minutes, under GitHub’s 10', () => {
    const [, p] = appJwt({ appId: '1000001', key: privateKey, now }).split('.')
    const claims = JSON.parse(Buffer.from(p!, 'base64url').toString())
    expect(claims).toEqual({
      iss: '1000001',
      iat: now.getTime() / 1000 - 60,
      exp: now.getTime() / 1000 + 540,
    })
  })

  it('does not verify under a different key — the negative control', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
    const [h, p, s] = appJwt({ appId: '1000001', key: privateKey, now }).split('.')
    expect(
      verify('RSA-SHA256', Buffer.from(`${h}.${p}`), other, Buffer.from(s!, 'base64url')),
    ).toBe(false)
  })
})

describe("the App's key is loaded in the master key's custody class (§20, Decision 5)", () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'app-key-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const codeOf = async (p: Promise<unknown>) =>
    p.then(
      () => 'accepted',
      (e: { code?: string; message?: string }) => e.code ?? `no code: ${e.message}`,
    )
  const pem = (type: 'rsa' | 'ec') =>
    (type === 'rsa'
      ? generateKeyPairSync('rsa', { modulusLength: 2048 })
      : generateKeyPairSync('ec', { namedCurve: 'P-256' })
    ).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  async function keyFile(content: string, mode: number): Promise<string> {
    const f = join(dir, 'github-app.pem')
    await writeFile(f, content)
    await chmod(f, mode)
    return f
  }

  it('loads an owner-only RSA key — the positive control — and signs with it', async () => {
    const key = await loadAppKey(await keyFile(pem('rsa'), 0o600))
    expect(key.asymmetricKeyType).toBe('rsa')
    expect(key.type).toBe('private')
    expect(appJwt({ appId: '1', key }).split('.')).toHaveLength(3)
  })

  it('refuses the same key once its group can read it, by the custody code', async () => {
    expect(await codeOf(loadAppKey(await keyFile(pem('rsa'), 0o640)))).toBe(
      'SECRET_GITHUB_APP_KEY_PERMISSIONS',
    )
  })

  it('refuses a missing key, naming where it should be and who puts it there', async () => {
    const missing = join(dir, 'absent.pem')
    expect(await codeOf(loadAppKey(missing))).toBe('SOURCE_GITHUB_KEY_UNREADABLE')
    await expect(loadAppKey(missing)).rejects.toThrow(`'${missing}'`)
    await expect(loadAppKey(missing)).rejects.toThrow('make up')
  })

  it('refuses a file that is not a private key, and a key that is not RSA', async () => {
    expect(await codeOf(loadAppKey(await keyFile('not a key\n', 0o600)))).toBe(
      'SOURCE_GITHUB_KEY_UNREADABLE',
    )
    expect(await codeOf(loadAppKey(await keyFile(pem('ec'), 0o600)))).toBe(
      'SOURCE_GITHUB_KEY_UNREADABLE',
    )
  })

  it('never puts the key’s text in its refusal', async () => {
    const text = pem('ec')
    const refused = await loadAppKey(await keyFile(text, 0o600)).catch(
      (e: Error) => e.message,
    )
    const body = text.split('\n')[1]!
    expect(refused).toContain('RSA')
    expect(refused).not.toContain(body)
  })
})
