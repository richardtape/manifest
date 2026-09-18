import { randomUUID } from 'node:crypto'
import type { Db } from '../db/index.js'
import { createToken, type DelegatedToken } from './repository.js'
import { mintToken } from './token.js'

/**
 * A usable token, written straight to the store.
 *
 * IT BYPASSES TASK 4'S MINT ROUTE ON PURPOSE. That route refuses a privileged
 * capability, and Task 6 has to authenticate a token that holds one — D24's "however it
 * was minted" is only testable with a fixture that can write what no route would. It is
 * also how a test gets an expired or a revoked token without waiting.
 */
export async function mintTestToken(
  db: Db,
  input: {
    userId: string
    projectId: string
    capabilities: string[]
    name?: string
    rateLimit?: number
    expiresAt?: Date
  },
): Promise<{ plaintext: string; row: DelegatedToken }> {
  const id = randomUUID()
  const minted = mintToken(id)
  const row = await createToken(db, {
    id,
    userId: input.userId,
    projectId: input.projectId,
    name: input.name ?? 'test',
    tokenHash: minted.tokenHash,
    capabilities: input.capabilities,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 86_400_000),
    ...(input.rateLimit === undefined ? {} : { rateLimit: input.rateLimit }),
  })
  return { plaintext: minted.plaintext, row }
}
