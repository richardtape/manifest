import { X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  applyGrantPolicy,
  issueBuildCredential,
  mintRegistryToken,
  parseScopeStrings,
  verifyBuildCredential,
} from './registry-auth.js'
import { testIssuer } from './testing.js'

const { keyPem, certPem } = testIssuer()
const SECRET = 's'.repeat(32)

const decode = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as {
    iss: string
    aud: string
    sub: string
    exp: number
    nbf: number
    jti: string
    access: { type: string; name: string; actions: string[] }[]
  }

describe('scope parsing (the shape Docker actually sends)', () => {
  // ONE field, space-separated, not repeated parameters. Observed from both
  // `docker push` (client_id=containerd-client) and buildx (client_id=buildkit-client).
  it('splits one space-separated scope field into several grants', () => {
    expect(
      parseScopeStrings([
        'repository:local/chem-labs:pull repository:base/alpine:pull,push',
      ]),
    ).toEqual([
      { type: 'repository', name: 'local/chem-labs', actions: ['pull'] },
      { type: 'repository', name: 'base/alpine', actions: ['pull', 'push'] },
    ])
  })

  it('keeps a multi-segment repository path intact', () => {
    expect(parseScopeStrings(['repository:local/a/b/c:push'])[0]!.name).toBe(
      'local/a/b/c',
    )
  })
})

describe('the grant policy (§13)', () => {
  it('grants what was asked on this build own repository', () => {
    expect(
      applyGrantPolicy('local/chem-labs', [
        { type: 'repository', name: 'local/chem-labs', actions: ['pull', 'push'] },
      ]),
    ).toEqual([
      { type: 'repository', name: 'local/chem-labs', actions: ['pull', 'push'] },
    ])
  })

  // THE CONTROL. §13: only the builder may push, and only to its own path.
  it('grants NOTHING on another project repository', () => {
    expect(
      applyGrantPolicy('local/chem-labs', [
        { type: 'repository', name: 'local/other-app', actions: ['pull', 'push'] },
      ]),
    ).toEqual([{ type: 'repository', name: 'local/other-app', actions: [] }])
  })

  // buildx asks for pull,push on base images it only reads. Trim rather than refuse:
  // refusing breaks every build, granting push lets one build replace the base image
  // every other app on the platform is built from.
  it('trims base images to pull, and the build still works', () => {
    expect(
      applyGrantPolicy('local/chem-labs', [
        { type: 'repository', name: 'base/node', actions: ['pull', 'push'] },
      ]),
    ).toEqual([{ type: 'repository', name: 'base/node', actions: ['pull'] }])
  })

  it('grants nothing for a non-repository scope such as registry:catalog', () => {
    expect(
      applyGrantPolicy('local/chem-labs', [
        { type: 'registry', name: 'catalog', actions: ['*'] },
      ]),
    ).toEqual([{ type: 'registry', name: 'catalog', actions: [] }])
  })
})

describe('the minted token', () => {
  it('carries the claims registry:2 validates, and the certificate in x5c', () => {
    const token = mintRegistryToken(keyPem, certPem, {
      issuer: 'manifest-control-plane',
      service: 'manifest-registry',
      subject: 'build-1',
      access: [
        { type: 'repository', name: 'local/chem-labs', actions: ['pull', 'push'] },
      ],
    })
    const header = JSON.parse(
      Buffer.from(token.split('.')[0]!, 'base64url').toString(),
    ) as { alg: string; x5c: string[] }
    expect(header.alg).toBe('RS256')
    expect(header.x5c).toHaveLength(1)
    expect(() => new X509Certificate(Buffer.from(header.x5c[0]!, 'base64'))).not.toThrow()

    const claims = decode(token)
    expect(claims.iss).toBe('manifest-control-plane')
    expect(claims.aud).toBe('manifest-registry')
    expect(claims.access[0]!.name).toBe('local/chem-labs')
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(600)
    expect(claims.jti).toMatch(/[0-9a-f-]{36}/)
  })
})

describe('the build credential the token endpoint verifies', () => {
  const cred = (repository: string, expiresAt: number) =>
    issueBuildCredential(SECRET, { repository, buildId: 'b1', expiresAt })

  it('round-trips and names the repository the build may push to', () => {
    const c = cred('local/chem-labs', Date.now() + 60_000)
    expect(c.username).toBe('local/chem-labs')
    expect(verifyBuildCredential(SECRET, c.username, c.password)).toEqual({
      repository: 'local/chem-labs',
    })
  })

  it('refuses a credential presented for a different repository', () => {
    const c = cred('local/chem-labs', Date.now() + 60_000)
    expect(verifyBuildCredential(SECRET, 'local/other-app', c.password)).toBeUndefined()
  })

  it('refuses an expired credential', () => {
    const c = cred('local/chem-labs', Date.now() - 1)
    expect(verifyBuildCredential(SECRET, c.username, c.password)).toBeUndefined()
  })

  it('refuses a credential signed with a different secret', () => {
    const c = cred('local/chem-labs', Date.now() + 60_000)
    expect(verifyBuildCredential('t'.repeat(32), c.username, c.password)).toBeUndefined()
  })
})
