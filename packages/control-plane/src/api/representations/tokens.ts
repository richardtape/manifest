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
      /**
       * COMPUTED, NEVER STORED (Task 10) — the same rule `LaunchReadiness` follows (P5a
       * Task 15). A stored flag would need something to write it and would be wrong
       * between the moment a token expires and the moment that something ran; this is
       * `expiresAt` compared with now, by the platform rather than by every client.
       *
       * It is NOT "this token no longer works": a revoked token does not work either,
       * and `revokedAt` says so separately, because a clock and a person are different
       * answers to why a credential stopped.
       */
      expired: z
        .boolean()
        .describe(
          'Whether this token is past its own expiresAt. Computed by the platform; a revoked token that has not expired is not expired.',
        ),
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
     * EVERY capability the platform names, including the six a token may never hold —
     * D24's privileged four and its person-only two (P6b Task 2) — so asking for one of
     * those is refused as `TOKEN_CAPABILITY_FORBIDDEN`, naming it, rather than as
     * `REQUEST_INVALID`, which would make them indistinguishable from a typo (D23.7: an
     * agent must be able to correct itself).
     */
    capabilities: z
      .array(z.enum(PRIVILEGED_CAPABILITIES))
      .min(1)
      .describe(
        'The explicit set this token may use (D24). None of members:manage, release:promote, quota:set or secret:read: those are refused to a delegated token however it was minted. Nor release:approve or launch:record, which are person-only and refused outright.',
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

/**
 * **NO `now` PARAMETER, and that is deliberate** — `api/routes/tokens.ts` maps this over
 * a list as `.map(toToken)`, and `Array.prototype.map` passes the INDEX as the second
 * argument. Measured 2026-09-18, one minute after adding one: `now` arrived as `0`, the
 * comparison below became `Date <= 0`, and every token in every list read
 * `expired: false` — including one that expired an hour ago. Only the assertion about
 * the EXPIRED token could see it; `expired: false` on a live token was green throughout.
 *
 * `toPendingAction` does take a `now`, because a list's `waitingSeconds` must be computed
 * against ONE instant or two rows in one response disagree about the present; its own
 * call site passes it explicitly for that reason. A boolean that could flip between two
 * rows microseconds apart needs no such care, so this one reads the clock itself.
 */
export function toToken(row: typeof delegatedTokens.$inferSelect): z.input<typeof Token> {
  const now = new Date()
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    capabilities: row.capabilities,
    rateLimit: row.rateLimit,
    expiresAt: row.expiresAt.toISOString(),
    // `<=`, matching `tokens/actor.ts`'s own refusal of an expired token and the
    // sweeper's boundary: a token at exactly its expiry cannot authenticate, so a list
    // that called it live would disagree with the front door about the same row.
    expired: row.expiresAt <= now,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
