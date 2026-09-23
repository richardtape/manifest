import { randomUUID } from 'node:crypto'
import { z } from 'zod/v4'
import { makeRedactor, publishEvent } from '../../observability/index.js'
import {
  assertCapability,
  AuthorizationError,
  capabilitiesFor,
  isPersonOnly,
  isPrivileged,
  membershipOf,
  type PrivilegedCapability,
} from '../../projects/index.js'
import {
  createToken,
  mintToken,
  revokeToken,
  tokenById,
  tokensForProject,
} from '../../tokens/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { BadRequestError } from '../errors.js'
import {
  MintedToken,
  MintTokenRequest,
  Token,
  TokenList,
  toToken,
} from '../representations/tokens.js'

const ProjectParams = z.strictObject({ projectId: z.uuid() })
const TokenParams = z.strictObject({ tokenId: z.uuid() })

const DAY_MS = 86_400_000

/**
 * D24's delegated tokens: minted, listed and revoked (P5b Task 4).
 *
 * **EVERY ROUTE HERE IS INTERACTIVE ONLY (D24).** A token cannot mint a token — that
 * would make one leaked credential a credential factory, and D24's sentence is "minted by
 * the user in an interactive session". Since Task 5 that is a TYPE ERROR rather than this
 * paragraph: each handler calls `requireSession`, and the fields it goes on to read do not
 * exist on a token actor, so reverting one does not weaken a check — it stops compiling.
 *
 * Their caller is `packages/journey`'s token phase and `scripts/demo-token.sh` (Task 12);
 * until then `api/tokens.test.ts` drives them through `app.inject`, and that gap is
 * deliberate rather than overlooked.
 */
export const tokenRoutes = [
  defineRoute({
    operationId: 'mintToken',
    method: 'POST',
    path: '/v1/projects/{projectId}/tokens',
    tag: 'tokens',
    summary: 'Mint a delegated token',
    description:
      'D24: a credential an agent holds, scoped to this project and to an explicit capability set, with an expiry. The secret is in the response and nowhere else — the platform stores only a hash of it and cannot show it again. A token may never hold members:manage, release:promote, quota:set or secret:read, nor release:approve or launch:record, which are person-only: a person does them, and no confirmation grants them. And never more than the person minting it holds themselves.',
    params: ProjectParams,
    query: NO_QUERY,
    body: MintTokenRequest,
    success: {
      status: 201,
      description: 'The token, and its secret — the only time the secret exists.',
      schema: MintedToken,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CAPABILITY_FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
    ],
    handler: async ({ deps, request, params, body }) => {
      const actor = requireSession(request)
      // 1. Who may mint at all. NOT_FOUND to a stranger, FORBIDDEN to a member without it.
      await assertCapability(deps.db, actor, params.projectId, 'project:write')

      // 2. D24's forbidden four, refused BEFORE anything is written. Defence in depth:
      //    Task 6's central rule is the control that holds however a token was minted;
      //    this makes the ROW impossible as well as the request, and it is what lets the
      //    refusal name the capability while the request is still in hand.
      const forbidden = body.capabilities.filter((capability) => isPrivileged(capability))
      if (forbidden.length > 0) {
        throw new BadRequestError(
          'TOKEN_CAPABILITY_FORBIDDEN',
          `a delegated token may never hold ${forbidden.join(', ')} (D24)`,
          'A human confirms these in an interactive session. Mint the token without them; the agent will be told what to ask for.',
        )
      }

      // 2b. D24's PERSON-ONLY two (P6b Task 2, Decision 14), refused the same way and for a
      //     stricter reason: these are not questions a person confirms for an agent — each
      //     is a record that a named person decided. The central rule in `assertCapability`
      //     refuses a token holding one however it was minted; this makes the row impossible.
      const personOnly = body.capabilities.filter((capability) =>
        isPersonOnly(capability),
      )
      if (personOnly.length > 0) {
        throw new BadRequestError(
          'TOKEN_CAPABILITY_FORBIDDEN',
          `a delegated token may never hold ${personOnly.join(', ')} — each is a record that a named person decided (D24)`,
          'A person does these in the console, in their own session. Mint the token without them; no confirmation can grant them to an agent.',
        )
      }

      // 3. No more than the minter holds themselves. Without this a token is a
      //    privilege-escalation primitive rather than a delegation of one: a collaborator
      //    who cannot delete a project could mint something that can.
      //
      //    `PrivilegedCapability` is a superset of `Capability`, and step 2 has already
      //    removed every member that is not one — `secret:read` is the only difference and
      //    it is privileged — so the cast below is sound rather than convenient.
      const held = capabilitiesFor(
        actor.platformRole === 'admin'
          ? null
          : await membershipOf(deps.db, actor.userId, params.projectId),
        actor.platformRole,
      )
      const beyond = (body.capabilities as readonly PrivilegedCapability[]).filter(
        (capability) =>
          !held.has(capability as Exclude<PrivilegedCapability, 'secret:read'>),
      )
      if (beyond.length > 0) {
        throw new AuthorizationError(
          'FORBIDDEN',
          `a token cannot be given ${beyond.join(', ')}, which you do not hold yourself`,
        )
      }

      // 4. The id FIRST, because the plaintext embeds it: `mft_<id>_<secret>` names the
      //    row it is stored as, and a row created with the column's default is a
      //    credential nothing can present (sitting 2, F7).
      const id = randomUUID()
      const minted = mintToken(id)
      const row = await createToken(deps.db, {
        id,
        userId: actor.userId,
        projectId: params.projectId,
        name: body.name,
        tokenHash: minted.tokenHash,
        capabilities: [...body.capabilities],
        expiresAt: new Date(Date.now() + body.expiresInDays * DAY_MS),
      })

      // 5. §14: the event names the token and its holder, and carries NEITHER the secret
      //    NOR the hash. `observability/redact.ts` only redacts a secret behind the word
      //    `Bearer` (`[M9]`), so nothing here may rely on it to catch a mistake.
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: params.projectId,
          subject: `token:${row.id}`,
          type: 'token.minted',
          machineDetail: {
            tokenId: row.id,
            capabilities: row.capabilities,
            expiresAt: row.expiresAt.toISOString(),
          },
          humanMessage: `${actor.puid} created a delegated token, '${row.name}', which can ${row.capabilities.join(', ')} until ${row.expiresAt.toISOString().slice(0, 10)}.`,
        },
        makeRedactor([]),
      )

      return { token: toToken(row), secret: minted.plaintext }
    },
  }),
  defineRoute({
    operationId: 'listTokens',
    method: 'GET',
    path: '/v1/projects/{projectId}/tokens',
    tag: 'tokens',
    summary: 'A project’s delegated tokens',
    description:
      'Every token scoped to this project, newest first, including the revoked and the expired — §20 asks for a list a person can review, and one that showed only the live ones would answer "what has been able to act here" in the present tense alone. No secret is in it.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The project’s tokens, newest first.',
      schema: TokenList,
    },
    errors: ['NOT_FOUND', 'TOKEN_CREDENTIAL_REFUSED'],
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      // A READ, not a write: nothing here is credential material — the secret was never
      // stored and the hash is not in `Token` — and anyone who can see the project's
      // builds can already see what made them.
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return (await tokensForProject(deps.db, params.projectId)).map(toToken)
    },
  }),
  defineRoute({
    operationId: 'revokeToken',
    method: 'DELETE',
    path: '/v1/tokens/{tokenId}',
    tag: 'tokens',
    summary: 'Revoke a delegated token',
    description:
      'Stops the token authenticating, from the next request onwards. Only the person who minted it may revoke it, and anyone else is answered 404 — the same answer a token id that does not exist gets, so the route cannot be used to discover which ids do. Revoking twice is idempotent.',
    params: TokenParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The token, with its revocation stamped.',
      schema: Token,
    },
    errors: ['NOT_FOUND', 'TOKEN_CREDENTIAL_REFUSED'],
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      // The row is read FIRST because the repository deliberately answers `false` for
      // "not yours", "not there" and "already revoked" alike; only a caller that has seen
      // the row can tell a 404 from an idempotent second revoke.
      //
      // ONLY THE MINTER. A project owner revoking a collaborator's token is not built in
      // Phase 1 — `revokeToken` keys on `userId`, and widening it is a repository change
      // plus a rule about who may revoke whose, which belongs with the console that would
      // show the list (P5c). Until then a token outlives its minter's membership, which is
      // recorded in the sitting's findings rather than left to be discovered.
      const row = await tokenById(deps.db, params.tokenId)
      if (row === undefined || row.userId !== actor.userId) {
        throw new AuthorizationError('NOT_FOUND', `no token '${params.tokenId}'`)
      }
      await revokeToken(deps.db, params.tokenId, actor.userId)
      const revoked = await tokenById(deps.db, params.tokenId)
      if (revoked === undefined) {
        throw new AuthorizationError('NOT_FOUND', `no token '${params.tokenId}'`)
      }
      return toToken(revoked)
    },
  }),
]
