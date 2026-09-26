import type { FastifyRequest } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { environments } from '../../db/index.js'
import { makeRedactor, publishEvent, type Redactor } from '../../observability/index.js'
import {
  actorPhrase,
  assertCapability,
  assertStepUp,
  AuthorizationError,
  type Actor,
  type Capability,
} from '../../projects/index.js'
import {
  appSecretStatuses,
  clearAppSecret,
  type AppEnvScope,
  type AppSecretState,
} from '../../secrets/index.js'
import { RESERVED_ENV_NAMES, resolveEnv } from '../../spec/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { BadRequestError } from '../errors.js'
import type { ServerDeps } from '../server.js'
import { newestValidSpec } from '../spec-validation.js'
import {
  AppSecretList,
  AppSecretStatus,
  SecretName,
  SetAppSecretRequest,
} from '../representations/secrets.js'

/**
 * AN APP'S DECLARED SECRETS (the authoring API plan's Task 8, Decision 13): the values of the
 * `env` entries `manifest.yaml` marks `secret: true`, set WRITE-ONLY per environment. Three
 * operations — list the names, set one, clear one — and **none answers a value**. A value takes
 * effect at the next deploy, which refuses a release that declares a name with no value
 * (`RELEASE_SECRET_NOT_SET`).
 *
 * **WHO MAY SET ONE (§20 and D24, Spec action 2, option (a)):** `secret:write` — owner,
 * collaborator, administrator, and a token minted holding it — for sandbox and staging. **A
 * production value only in an interactive session with step-up**: a token is refused outright
 * (`TOKEN_CREDENTIAL_REFUSED`), never offered a pending action, and a person who has not re-proved
 * themselves in the last ten minutes is asked to (`STEP_UP_REQUIRED`).
 */

const EnvironmentId = z.uuid().describe('The environment whose secrets these are.')
const EnvironmentParams = z.strictObject({ environmentId: EnvironmentId })
const SecretParams = z.strictObject({ environmentId: EnvironmentId, name: SecretName })

type Environment = typeof environments.$inferSelect

/**
 * The environment, and its project FROM THE ROW — never from the request (P2's IDOR lesson) —
 * then the capability, so a stranger is answered `404` for every environment id alike.
 */
async function environmentFor(
  deps: ServerDeps,
  actor: Actor,
  environmentId: string,
  capability: Capability,
): Promise<Environment> {
  const [row] = await deps.db
    .select()
    .from(environments)
    .where(eq(environments.id, environmentId))
  if (row === undefined)
    throw new AuthorizationError('NOT_FOUND', `no environment '${environmentId}'`)
  await assertCapability(deps.db, actor, row.projectId, capability)
  return row
}

/**
 * A write's checks, in order: the capability (a stranger learns nothing), then — for
 * PRODUCTION only — an interactive session, then its step-up, and last the name. Sandbox and
 * staging ask neither of a person nor of a token: that is D24's build loop.
 */
async function writableEnvironment(
  deps: ServerDeps,
  request: FastifyRequest,
  actor: Actor,
  environmentId: string,
  name: string,
): Promise<Environment> {
  const environment = await environmentFor(deps, actor, environmentId, 'secret:write')
  if (environment.kind === 'production')
    assertStepUp(requireSession(request), 'secret:write')
  if (RESERVED_ENV_NAMES.has(name))
    throw new BadRequestError(
      'SECRET_NAME_RESERVED',
      `${name} is set by the platform for every app (§8), and the platform's value always wins, so it cannot be an app secret`,
      'Choose another name, and declare it in manifest.yaml’s env with secret: true.',
    )
  return environment
}

const scopeOf = (environment: Environment): AppEnvScope => ({
  projectId: environment.projectId,
  environmentKind: environment.kind,
})

/**
 * The names this environment's newest VALID manifest declares `secret: true` — resolved for its
 * kind (`resolveEnv`, the one producer), so a production override is production's alone.
 */
async function declaredIn(deps: ServerDeps, environment: Environment): Promise<string[]> {
  const spec = await newestValidSpec(deps.db, environment.projectId)
  if (spec === undefined) return []
  return resolveEnv(spec, environment.kind)
    .filter((e) => e.secret === true)
    .map((e) => e.name)
}

const toStatus = (state: AppSecretState): z.input<typeof AppSecretStatus> => ({
  name: state.name,
  declared: state.declared,
  set: state.set,
  updatedAt: state.updatedAt === null ? null : state.updatedAt.toISOString(),
})

/** One name's state, as the list would answer it. */
async function statusOf(deps: ServerDeps, environment: Environment, name: string) {
  const all = await appSecretStatuses(
    deps.db,
    scopeOf(environment),
    await declaredIn(deps, environment),
  )
  return toStatus(
    all.find((s) => s.name === name) ?? {
      name,
      declared: false,
      set: false,
      updatedAt: null,
    },
  )
}

/** `app_secret.set` / `app_secret.cleared`: the name, where, and who — NEVER THE VALUE. */
async function publishChange(
  deps: ServerDeps,
  environment: Environment,
  actor: Actor,
  change: { type: 'app_secret.set' | 'app_secret.cleared'; name: string },
  redact: Redactor,
): Promise<void> {
  const who = await actorPhrase(deps.db, actor)
  const sentence =
    change.type === 'app_secret.set'
      ? `${who} set ${change.name} for ${environment.kind}; it takes effect at the next deploy.`
      : `${who} cleared ${change.name} for ${environment.kind}; a release that declares it will not deploy there until it is set again.`
  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId: environment.projectId,
      // §23: the hostname's first label is the slug.
      subject: `secret:${environment.hostname.split('.')[0]!}:${environment.kind}:${change.name}`,
      type: change.type,
      machineDetail: {
        environmentKind: environment.kind,
        name: change.name,
        via: actor.credential,
        userId: actor.userId,
        tokenId: actor.credential === 'token' ? actor.tokenId : null,
      },
      humanMessage: sentence,
    },
    redact,
  )
}

export const secretRoutes = [
  defineRoute({
    operationId: 'listAppSecrets',
    method: 'GET',
    path: '/v1/environments/{environmentId}/secrets',
    tag: 'secrets',
    summary: 'The app’s secrets in an environment — names only',
    description:
      'Every name the environment’s newest valid manifest.yaml declares with `secret: true` (its `environments.<kind>.env` override applied), and every name that has a value, sorted — each with whether it is declared, whether a value is set, and when that value last changed. No operation answers a value. A declared name with `set: false` stops the next deploy of this environment with `RELEASE_SECRET_NOT_SET`.',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The names.', schema: AppSecretList },
    errors: ['NOT_FOUND', 'FORBIDDEN'],
    examples: {
      response: {
        environmentId: 'baa38785-0be9-4861-a518-054ce19780a8',
        environmentKind: 'staging',
        secrets: [
          { name: 'BOARD_ADMIN_CODE', declared: true, set: false, updatedAt: null },
          { name: 'SIS_API_KEY', declared: true, set: false, updatedAt: null },
        ],
      },
    },
    handler: async ({ deps, actor, params }) => {
      const environment = await environmentFor(
        deps,
        actor,
        params.environmentId,
        'project:read',
      )
      const states = await appSecretStatuses(
        deps.db,
        scopeOf(environment),
        await declaredIn(deps, environment),
      )
      return {
        environmentId: environment.id,
        environmentKind: environment.kind,
        secrets: states.map(toStatus),
      }
    },
  }),
  defineRoute({
    operationId: 'setAppSecret',
    method: 'PUT',
    path: '/v1/environments/{environmentId}/secrets/{name}',
    tag: 'secrets',
    summary: 'Set the value of one of the app’s secrets',
    description:
      'Stores the value for this environment, write-only: it is never answered back, and it reaches the app at the NEXT deploy of this environment — setting it redeploys nothing. A value may be set before manifest.yaml declares the name, and only a declared name is ever given to the app. A delegated token may set sandbox and staging values; a production value is set only in an interactive session that has stepped up in the last ten minutes, and a token asking is refused.',
    params: SecretParams,
    query: NO_QUERY,
    body: SetAppSecretRequest,
    success: {
      status: 200,
      description: 'The name’s state — never its value.',
      schema: AppSecretStatus,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'STEP_UP_REQUIRED',
      'SECRET_NAME_RESERVED',
    ],
    examples: {
      request: { value: 'stream-contract-value' },
      response: {
        name: 'STREAM_CONTRACT_KEY',
        declared: false,
        set: true,
        updatedAt: '2026-09-26T21:50:44.115Z',
      },
    },
    handler: async ({ deps, request, actor, params, body }) => {
      const environment = await writableEnvironment(
        deps,
        request,
        actor,
        params.environmentId,
        params.name,
      )
      await deps.appSecrets.setEnvSecret(
        deps.db,
        scopeOf(environment),
        params.name,
        body.value,
      )
      // Redacted WITH the value, though nothing here carries it: the trail is append-only, so
      // a future sentence that did would be permanent.
      await publishChange(
        deps,
        environment,
        actor,
        { type: 'app_secret.set', name: params.name },
        makeRedactor([body.value]),
      )
      return statusOf(deps, environment, params.name)
    },
  }),
  defineRoute({
    operationId: 'clearAppSecret',
    method: 'DELETE',
    path: '/v1/environments/{environmentId}/secrets/{name}',
    tag: 'secrets',
    summary: 'Clear the value of one of the app’s secrets',
    description:
      'Removes the stored value for this environment. Idempotent: clearing a name with no value answers the same state. While manifest.yaml still declares the name, the next deploy of this environment is refused with `RELEASE_SECRET_NOT_SET`; an instance already running keeps the value it was started with. Production asks what setting does: an interactive session that has stepped up.',
    params: SecretParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The name’s state, with no value set.',
      schema: AppSecretStatus,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'STEP_UP_REQUIRED',
      'SECRET_NAME_RESERVED',
    ],
    examples: {
      response: {
        name: 'STREAM_CONTRACT_KEY',
        declared: false,
        set: false,
        updatedAt: null,
      },
    },
    handler: async ({ deps, request, actor, params }) => {
      const environment = await writableEnvironment(
        deps,
        request,
        actor,
        params.environmentId,
        params.name,
      )
      if (await clearAppSecret(deps.db, scopeOf(environment), params.name))
        await publishChange(
          deps,
          environment,
          actor,
          { type: 'app_secret.cleared', name: params.name },
          makeRedactor([]),
        )
      return statusOf(deps, environment, params.name)
    },
  }),
]
