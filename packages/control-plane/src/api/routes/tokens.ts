import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { endSessionsOf } from '../../ai/index.js'
import { projectMembers } from '../../db/index.js'
import { makeRedactor, publishEvent } from '../../observability/index.js'
import {
  assertCapability,
  AuthorizationError,
  capabilitiesFor,
  holdActiveProject,
  isPersonOnly,
  isPrivileged,
  membershipOf,
  personName,
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
import { PATH } from '../contract/schemas.js'
import { BadRequestError, TokenAlreadyMintedError } from '../errors.js'
import {
  MintedToken,
  MintTokenRequest,
  Token,
  TokenList,
  toToken,
} from '../representations/tokens.js'

const ProjectParams = z.strictObject({ projectId: PATH.projectId })
const TokenParams = z.strictObject({ tokenId: PATH.tokenId })

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
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/tokens',
    tag: 'tokens',
    summary: 'Mint a delegated token',
    description:
      'Mints a credential for an agent, scoped to this project and an explicit set of capabilities, with an expiry. The secret is in this answer only, so store it now: `listTokens` never shows it, and a retry with the same Idempotency-Key answers `409 TOKEN_ALREADY_MINTED` naming the token — revoke it and mint again if the answer was lost. A token may never hold `members:manage`, `release:promote`, `quota:set` or `secret:read`, nor the person-only `release:approve`, `launch:record`, `launch:submit`, `launch:rehearse` or `project:delete` (`400 TOKEN_CAPABILITY_FORBIDDEN`), nor more than the minter holds (`403 FORBIDDEN`).',
    params: ProjectParams,
    query: NO_QUERY,
    body: MintTokenRequest,
    success: {
      status: 201,
      description: 'The token, and its secret — the only time the secret exists.',
      schema: MintedToken,
    },
    capability: 'project:write',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CAPABILITY_FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'TOKEN_ALREADY_MINTED',
    ],
    // SHOWN ONCE (D24; the authoring API plan's Task 12, Rich's option (a)): the idempotency
    // record keeps the token WITHOUT its secret, and a retry is told which token it minted.
    // A record written before migration 0032 held the secret too; 0032 scrubbed it, and this
    // reads `token` alone from either.
    withholdOnReplay: {
      stored: ({ token }) => ({ token }),
      refuse: (stored) => {
        const token = (stored as { token?: { id?: unknown; name?: unknown } } | null)
          ?.token
        if (typeof token?.id !== 'string' || typeof token.name !== 'string') {
          // A record with no token is the platform's defect — an honest 500, never a replay.
          return new Error('a mint’s idempotency record holds no token to name')
        }
        return new TokenAlreadyMintedError({ id: token.id, name: token.name })
      },
    },
    examples: {
      request: {
        name: 'claude-code',
        capabilities: ['project:read', 'source:write'],
        expiresInDays: 1,
      },
      response: {
        token: {
          id: '606cabe3-f4b5-4cd3-9202-a3a6df8f89a4',
          projectId: '483eefec-c89d-4ecb-aac1-997aadf0dc5d',
          name: 'claude-code',
          capabilities: ['project:read', 'source:write'],
          rateLimit: 600,
          expiresAt: '2026-09-27T21:49:41.998Z',
          expired: false,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: '2026-09-26T21:49:41.998Z',
        },
        secret:
          'mft_606cabe3f4b54cd39202a3a6df8f89a4_F662m-ioPZ05YzFtHcpQ3fI12oCwPRNz_4_EAXUtrZ8',
      },
    },
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

      // 2b. The PERSON-ONLY set (P6b Task 2, Decision 14; `project:delete` and, since the launch
      //     path plan's Task 6b, `launch:rehearse`), refused the same way and for a stricter
      //     reason: these are not questions a person confirms for an agent — each is a person's
      //     to do. The central rule in `assertCapability` refuses a token holding one however it
      //     was minted; this makes the row impossible.
      const personOnly = body.capabilities.filter((capability) =>
        isPersonOnly(capability),
      )
      if (personOnly.length > 0) {
        throw new BadRequestError(
          'TOKEN_CAPABILITY_FORBIDDEN',
          `a delegated token may never hold ${personOnly.join(', ')} — a person does each, in their own session (D24)`,
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
      // THE PROJECT, HELD FOR THE INSERT (the front-end enablement plan's Task 11): an archive that
      // landed between step 1 and here would revoke every token but this one, which would then
      // commit — alive again after a restore, when archive's rule is that tokens stay revoked.
      // Held, the archive's state change waits for this commit and its teardown revokes the
      // token; or it committed first, and the mint is refused `PROJECT_ARCHIVED`.
      const row = await deps.db.transaction(async (tx) => {
        await holdActiveProject(tx, params.projectId)
        // AND THE MINTER'S PLACE ON IT, FOR THE SAME REASON (Spec action 2; the launch path plan's
        // Task 8, its review's I1): a removal that landed between step 1 and here revoked every token
        // of theirs but this one, which would then commit live for up to a year — and nothing could
        // revoke it: the removal repeated answers "not a member", and only its minter may revoke a
        // token. `FOR SHARE` conflicts with the removal's DELETE, so either the removal waits for this
        // commit — and its `revokeTokensOfMember` revokes the token — or it committed first, and the
        // mint is refused as a stranger is. An ADMINISTRATOR mints without membership (§13), so none
        // is refused for having none; a membership they hold is held all the same.
        const [member] = await tx
          .select({ role: projectMembers.role })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, params.projectId),
              eq(projectMembers.userId, actor.userId),
            ),
          )
          .for('share')
        if (member === undefined && actor.platformRole !== 'admin') {
          throw new AuthorizationError('NOT_FOUND', `no project '${params.projectId}'`)
        }
        return createToken(tx, {
          id,
          userId: actor.userId,
          projectId: params.projectId,
          name: body.name,
          tokenHash: minted.tokenHash,
          capabilities: [...body.capabilities],
          expiresAt: new Date(Date.now() + body.expiresInDays * DAY_MS),
        })
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
          humanMessage: `${await personName(deps.db, actor.userId)} created a delegated token, '${row.name}', which can ${row.capabilities.join(', ')} until ${row.expiresAt.toISOString().slice(0, 10)}.`,
        },
        makeRedactor([]),
      )

      return { token: toToken(row), secret: minted.plaintext }
    },
  }),
  defineRoute({
    operationId: 'listTokens',
    credential: 'session',
    method: 'GET',
    path: '/v1/projects/{projectId}/tokens',
    tag: 'tokens',
    summary: 'A project’s delegated tokens',
    description:
      'Every delegated token scoped to this project, newest first, revoked and expired ones included, so a person can review everything that has been able to act here. No secret is in it.',
    params: ProjectParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The project’s tokens, newest first.',
      schema: TokenList,
    },
    capability: 'project:read',
    errors: ['NOT_FOUND', 'TOKEN_CREDENTIAL_REFUSED'],
    examples: {
      response: [
        {
          id: '09ca0c4f-541c-433c-90b1-8f921ba88ff1',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          name: 'authz',
          capabilities: ['project:read'],
          rateLimit: 600,
          expiresAt: '2026-10-26T21:51:55.029Z',
          expired: false,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: '2026-09-26T21:51:55.029Z',
        },
        {
          id: '91ffc307-1602-457a-9965-6581d2f365d5',
          projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
          name: 'authz',
          capabilities: ['project:read'],
          rateLimit: 600,
          expiresAt: '2026-10-26T21:51:55.024Z',
          expired: false,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: '2026-09-26T21:51:55.024Z',
        },
      ],
    },
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
    credential: 'session',
    method: 'DELETE',
    path: '/v1/tokens/{tokenId}',
    tag: 'tokens',
    summary: 'Revoke a delegated token',
    description:
      'Stops the token authenticating from the next request, closes every event stream it holds open (`4401`), and ends every agent session it started. Only its minter may revoke it; anyone else is answered `404 NOT_FOUND`, as for an id that does not exist. Revoking twice is idempotent. If ending its sessions fails (`503 AI_CATALOGUE_DISABLED`, or a `500`), the token is already revoked: repeat the request.',
    params: TokenParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The token, with its revocation stamped.',
      schema: Token,
    },
    errors: ['NOT_FOUND', 'TOKEN_CREDENTIAL_REFUSED', 'AI_CATALOGUE_DISABLED'],
    examples: {
      response: {
        id: 'd526fd4f-2528-45d9-9e45-c374393d8cec',
        projectId: '29f9e50b-1ded-4f9e-ab2e-085a4f560188',
        name: 'authz-fixture',
        capabilities: ['project:read'],
        rateLimit: 600,
        expiresAt: '2026-10-26T21:51:47.658Z',
        expired: false,
        revokedAt: '2026-09-26T21:51:55.051Z',
        lastUsedAt: null,
        createdAt: '2026-09-26T21:51:47.658Z',
      },
    },
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      // The row is read FIRST because the repository deliberately answers `false` for
      // "not yours", "not there" and "already revoked" alike; only a caller that has seen
      // the row can tell a 404 from an idempotent second revoke.
      //
      // ONLY THE MINTER. A project owner revoking a collaborator's token is not built — FE-11's
      // option (b), which Rich did not choose: `revokeToken` keys on `userId`, and widening it is a
      // repository change plus a rule about who may revoke whose. What an owner CAN do is remove the
      // person, which revokes every token they minted on the project (Spec action 2; the launch path
      // plan's Task 8) — so a token no longer outlives its minter's membership.
      const row = await tokenById(deps.db, params.tokenId)
      if (row === undefined || row.userId !== actor.userId) {
        throw new AuthorizationError('NOT_FOUND', `no token '${params.tokenId}'`)
      }
      await revokeToken(deps.db, params.tokenId, actor.userId)
      // EVERY EVENT STREAM IT HOLDS OPEN, `4401` (the launch path plan's Task 5, FE-33) — after the
      // revoke has committed, and BEFORE the sessions below: ending a session needs the model gateway
      // and can answer `503`, closing a stream needs nothing, and an outage must never leave a revoked
      // token listening. On a retry it finds nothing left to close.
      deps.streams.closeToken(params.tokenId)
      // THEN EVERY AGENT SESSION IT STARTED (the front-end enablement plan's Task 10, Decision 25):
      // a model key never outlives the credential that asked for it. REACHED ON A RETRY TOO — the
      // token is already revoked then, and this is how the sessions a failed first attempt could
      // not end get ended: `endSessionsOf` answers a 500 naming what is still live, never a
      // swallowed catch, and ends only what is still live on the next call.
      await endSessionsOf(deps, { tokenId: params.tokenId }, 'token_revoked', {
        userId: actor.userId,
        tokenId: null,
      })
      const revoked = await tokenById(deps.db, params.tokenId)
      if (revoked === undefined) {
        throw new AuthorizationError('NOT_FOUND', `no token '${params.tokenId}'`)
      }
      return toToken(revoked)
    },
  }),
]
