import { z } from 'zod/v4'
import type { delegatedTokens } from '../../db/index.js'
import { PRIVILEGED_CAPABILITIES } from '../../projects/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'

/**
 * A token as anyone may read it afterwards. THERE IS NO `secret` FIELD — not an optional
 * one (Decision 11): a representation that CAN carry a credential eventually does.
 */
export const Token = representation(
  'Token',
  z
    .object({
      id: Uuid,
      projectId: Uuid,
      name: z.string(),
      /**
       * `string[]`, not the capability enum the REQUEST uses, and deliberately so. A row
       * is written once and read for as long as it lives, so a capability later renamed
       * or removed would turn every read of an old token into a 500 through the response
       * contract — and `tokens/testing.ts` writes rows directly, which is how Task 6 mints
       * a token holding a privileged capability that the mint route refuses. What the API
       * ACCEPTS is narrow; what it can ANSWER about a row already stored is not.
       */
      capabilities: z.array(z.string()),
      rateLimit: z
        .int()
        .describe(
          'Requests a minute this token may make, enforced in the control plane (§20, P5b Task 9). Past it, every route answers 429 RATE_LIMITED with Retry-After.',
        ),
      expiresAt: Timestamp,
      revokedAt: Timestamp.nullable(),
      lastUsedAt: Timestamp.nullable(),
      createdAt: Timestamp,
    })
    .describe(
      'A delegated token (D24), scoped to one project and a capability set. Its secret is shown once, when it is minted, and is never readable again.',
    ),
)

export const TokenList = representation('TokenList', z.array(Token))

/**
 * The mint response, and the ONE place in this API that returns a credential. A separate
 * schema from `Token` so that the field cannot leak into a read by someone adding an
 * optional property later.
 */
export const MintedToken = representation(
  'MintedToken',
  z
    .object({
      token: Token,
      secret: z
        .string()
        .describe(
          'The token, in full: `mft_<id>_<secret>`. Shown ONCE. Store it now — the platform keeps only a hash and cannot show it again.',
        ),
    })
    .describe(
      'A newly minted delegated token, with its secret. The only time the secret exists.',
    ),
)

/** §20's bound on how long an agent's credential may live, in days. */
export const MAX_TOKEN_DAYS = 365

export const MintTokenRequest = request(
  'MintTokenRequest',
  z.strictObject({
    name: z
      .string()
      .min(1)
      .max(64)
      .describe('A person’s label for it, so a list of tokens is reviewable.'),
    /**
     * EVERY capability the platform names, including the four a token may never hold —
     * so asking for one of those is refused as `TOKEN_CAPABILITY_FORBIDDEN`, naming it,
     * rather than as `REQUEST_INVALID`, which would make D24's forbidden four
     * indistinguishable from a typo (D23.7: an agent must be able to correct itself).
     */
    capabilities: z
      .array(z.enum(PRIVILEGED_CAPABILITIES))
      .min(1)
      .describe(
        'The explicit set this token may use (D24). None of members:manage, release:promote, quota:set or secret:read: those are refused to a delegated token however it was minted.',
      ),
    expiresInDays: z
      .int()
      .min(1)
      .max(MAX_TOKEN_DAYS)
      .describe(
        `How long the token lives, in days. D24: a token has an expiry, and at most ${MAX_TOKEN_DAYS} days of one.`,
      ),
  }),
)

export function toToken(row: typeof delegatedTokens.$inferSelect): z.input<typeof Token> {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    capabilities: row.capabilities,
    rateLimit: row.rateLimit,
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
