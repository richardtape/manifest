import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  assertCapability,
  isPersonOnly,
  PERSON_ONLY,
  PersonOnlyRefusedError,
  PRIVILEGED,
  type TokenActor,
} from './authz.js'

/**
 * §20 and D24's row (applied 2026-09-22): approving a release, and recording UBC's IAM
 * registration or Privacy Office assessment — and, since Spec action 3 (applied 2026-09-27; the
 * front-end enablement plan's Task 11, Decision 30), archiving or deleting a project (§11), whose
 * capability is `project:delete`. LITERALS, so this file cannot agree with the constant whatever
 * it says — `privileged.test.ts`'s rule for D24's four.
 */
const D24_PERSON_ONLY = ['release:approve', 'launch:record', 'project:delete'] as const

const token = (overrides: Partial<TokenActor> = {}): TokenActor => ({
  credential: 'token',
  userId: randomUUID(),
  tokenId: randomUUID(),
  projectId: 'p-1',
  capabilities: new Set([
    'project:read',
    'release:approve',
    'launch:record',
    'project:delete',
  ]),
  rateLimit: 60,
  ...overrides,
})

describe('the person-only class (D24, §20)', () => {
  it('is exactly the three, and nothing has been quietly added', () => {
    expect([...PERSON_ONLY].sort()).toEqual([...D24_PERSON_ONLY].sort())
  })

  it('is DISJOINT from the privileged four — a person-only action never becomes a pending action', () => {
    for (const c of PERSON_ONLY) expect(PRIVILEGED.has(c)).toBe(false)
    for (const c of D24_PERSON_ONLY) expect(isPersonOnly(c)).toBe(true)
    expect(isPersonOnly('release:promote')).toBe(false)
  })

  it('refuses a token HOLDING a person-only capability — however it was minted', async () => {
    // `db` is never read: the token branch refuses before the project is looked up.
    await expect(
      assertCapability(undefined as never, token(), 'p-1', 'release:approve'),
    ).rejects.toBeInstanceOf(PersonOnlyRefusedError)
    await expect(
      assertCapability(undefined as never, token(), 'p-1', 'launch:record'),
    ).rejects.toBeInstanceOf(PersonOnlyRefusedError)
    // §11: archiving and deleting a project take an app away from its students (Spec action 3).
    await expect(
      assertCapability(undefined as never, token(), 'p-1', 'project:delete'),
    ).rejects.toBeInstanceOf(PersonOnlyRefusedError)
  })

  it('refuses it even with a GRANT — no confirmation can make a token a person', async () => {
    await expect(
      assertCapability(
        undefined as never,
        token({ grant: 'release:approve' }),
        'p-1',
        'release:approve',
      ),
    ).rejects.toBeInstanceOf(PersonOnlyRefusedError)
  })

  it('keeps scope FIRST: another project is NOT_FOUND, not a person-only refusal', async () => {
    await expect(
      assertCapability(
        undefined as never,
        token({ projectId: 'p-2' }),
        'p-1',
        'release:approve',
      ),
    ).rejects.toMatchObject({ name: 'AuthorizationError', code: 'NOT_FOUND' })
  })

  it('the positive control: the same token may still do what it holds that is not person-only', async () => {
    await expect(
      assertCapability(undefined as never, token(), 'p-1', 'project:read'),
    ).resolves.toBeUndefined()
  })
})
