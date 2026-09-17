import { BLUEPRINT_CODES } from '../blueprints/index.js'
import { POLICY_CODES, SPEC_CODES } from '../spec/index.js'

/**
 * §20's *Machine-actionable errors* and D23.7: EVERY code a client can receive, once,
 * with the status it is answered with (P5a Task 5).
 *
 * Held to the source by `error-codes.test.ts`, in both directions: a code thrown through
 * a class the API answers as itself and not listed here is red, and a code listed here
 * that nothing throws is red. `ErrorCode` is a union, so a route's `errors:` list
 * (Task 6) is checked by tsc. The contract publishes the list as an enum.
 *
 * ONE STATUS PER CODE. A client switches on the code, so a code answered with two
 * statuses is two answers wearing one name — `SPEC_INVALID` was 422 from one route and
 * 400 from another until this registry was written.
 *
 * A FAMILY is where the code comes from: a class `toErrorResponse` maps, or `api` for
 * the literals and fixed-code classes in `api/` itself.
 */
export type ErrorFamily =
  | 'api'
  | 'AuthorizationError'
  | 'BadRequestError'
  | 'ProjectError'
  | 'ReleaseError'
  | 'SourceError'
  | 'ConfigError'
  | 'SamlError'
  | 'AiError'
  | 'CatalogueError'

interface Entry {
  status: number
  families: readonly ErrorFamily[]
  summary: string
}

const api = (status: number, summary: string): Entry => ({
  status,
  families: ['api'],
  summary,
})
const bad = (summary: string): Entry => ({
  status: 400,
  families: ['BadRequestError'],
  summary,
})
const release = (summary: string): Entry => ({
  status: 409,
  families: ['ReleaseError'],
  summary,
})
const source = (summary: string): Entry => ({
  status: 409,
  families: ['SourceError'],
  summary,
})
const config = (summary: string): Entry => ({
  status: 409,
  families: ['ConfigError'],
  summary,
})
const saml = (summary: string): Entry => ({
  status: 401,
  families: ['SamlError'],
  summary,
})
const ai = (summary: string): Entry => ({ status: 503, families: ['AiError'], summary })

export const ERROR_CODES = {
  // api/ — the envelope's own answers
  UNAUTHENTICATED: api(401, 'The request carries no valid session.'),
  INTERNAL: api(
    500,
    'The control plane failed; its operator log has the reason. Nothing the client sent explains it.',
  ),
  REQUEST_INVALID: api(
    400,
    'A field in the request is missing or malformed, or the body could not be read at all; the message says which.',
  ),
  REQUEST_BODY_TOO_LARGE: api(413, 'The request body is larger than the API accepts.'),
  REQUEST_MEDIA_TYPE_UNSUPPORTED: api(
    415,
    'The request body is a content type the route does not read.',
  ),
  ROUTE_NOT_FOUND: api(
    404,
    'No route has this method and path. Resource routes are under /v1/.',
  ),
  IDEMPOTENCY_KEY_REUSED: api(
    409,
    'This Idempotency-Key was used on this route with a different body.',
  ),
  CSRF_ORIGIN_REFUSED: api(
    403,
    'A request carrying a session did not come from the console’s origin.',
  ),
  EVENTS_UPGRADE_REQUIRED: api(
    426,
    'The event stream is a WebSocket; a plain GET cannot read it.',
  ),
  SPEC_INVALID: api(
    422,
    'manifest.yaml at this commit is not valid; `details` lists each error with its path.',
  ),
  RELEASE_PRODUCTION_GATE_UNAVAILABLE: {
    status: 409,
    families: ['api', 'ReleaseError'],
    summary:
      'A first production launch is a checklist (§13, D19); the body carries LaunchReadiness.',
  },

  // projects/authz.ts
  NOT_FOUND: {
    status: 404,
    families: ['AuthorizationError'],
    summary: 'No such resource — or one the caller has no business knowing exists.',
  },
  FORBIDDEN: {
    status: 403,
    families: ['AuthorizationError'],
    summary: 'A member of the project whose role does not hold this capability.',
  },

  // BadRequestError — every one of these is 400
  IDEMPOTENCY_KEY_REQUIRED: bad(
    'A mutation arrived without an Idempotency-Key of at least 8 characters (D23.6).',
  ),
  BLUEPRINT_NOT_FOUND: bad('No blueprint with this reference is in the registry.'),
  BUILD_INVALID_INPUT: bad('The build request body is malformed.'),
  BUILD_LOG_INVALID_QUERY: bad('`tail` is not a whole number from 1 to 10000.'),
  DEPLOY_INVALID_INPUT: bad('The deploy request body is malformed.'),
  MEMBER_INVALID_INPUT: bad('The member request body is malformed.'),
  MEMBER_USER_NOT_FOUND: bad('No user with this PUID has ever signed in.'),
  PROJECT_INVALID_INPUT: bad('The project request body is malformed.'),
  PROJECT_NOT_FOUND: bad('No project with this id.'),
  RELEASE_INVALID_INPUT: bad('The release request body is malformed.'),
  SPEC_INVALID_INPUT: bad('The spec request body is malformed.'),
  SPEC_NOT_FOUND: bad('The project has no validated spec yet.'),

  // projects/repository.ts
  PROJECT_INVALID_SLUG: {
    status: 409,
    families: ['ProjectError'],
    summary: 'The slug breaks §7’s rule.',
  },
  PROJECT_SLUG_TAKEN: {
    status: 409,
    families: ['ProjectError'],
    summary: 'Another project holds this slug.',
  },

  // releases/ — every one is 409
  RELEASE_AI_BUDGET_MISSING: release('The release declares models and no AI budget.'),
  RELEASE_AI_DISABLED: release(
    'The release declares models and AI is switched off on this control plane.',
  ),
  RELEASE_BLUEPRINT_NOT_FOUND: release(
    'The project’s blueprint is no longer in the registry.',
  ),
  RELEASE_BUILD_NOT_DEPLOYABLE: release(
    'The build did not succeed, so nothing can be released from it.',
  ),
  RELEASE_BUILD_NOT_FOUND: release('No build with this id.'),
  RELEASE_DIGEST_MISSING: release('The release’s build recorded no digest.'),
  RELEASE_ENVIRONMENT_NOT_FOUND: release('No environment with this id.'),
  RELEASE_IMAGE_REPOSITORY_MISSING: release(
    'The build recorded a digest and no repository; rebuild it.',
  ),
  RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER: release(
    'A laptop-built image cannot reach a remote driver (§13).',
  ),
  RELEASE_MODEL_CLASSIFICATION_TOO_LOW: release(
    'A declared model is not approved for the app’s data classification (D17).',
  ),
  RELEASE_MODEL_NOT_IN_CATALOGUE: release(
    'A declared model is no longer in the catalogue.',
  ),
  RELEASE_MODEL_UNCLASSIFIED: release(
    'A declared model has no classification in the catalogue.',
  ),
  RELEASE_NOT_FOUND: release('No release with this id.'),
  RELEASE_PROJECT_NOT_FOUND: release(
    'The environment names a project that does not exist.',
  ),

  // source/ — every one is 409
  SOURCE_FOREIGN_REPO: source('The repository reference was not made by this driver.'),
  SOURCE_GIT_FAILED: source('git failed; the message names the operation.'),
  SOURCE_INVALID_SLUG: source('The slug cannot name a repository.'),
  SOURCE_PATH_ESCAPE: source('The slug resolves outside the repository root.'),

  // config.ts — mapped by toErrorResponse, raised at boot
  CONFIG_INVALID: config('A setting failed validation.'),
  CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED: config(
    'MANIFEST_BUILD_CREDENTIAL_SECRET is required outside development.',
  ),
  CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH: config(
    'A loopback origin names a port the control plane does not listen on.',
  ),
  CONFIG_LITELLM_MASTER_KEY_REQUIRED: config(
    'MANIFEST_LITELLM_MASTER_KEY is required outside development.',
  ),
  CONFIG_MASTER_SECRET_REQUIRED: config(
    'MANIFEST_MASTER_SECRET is required outside development.',
  ),

  // identity/saml.ts and the callback — every one is 401, and the envelope names no detail
  SAML_ASSERTION_REJECTED: saml('The assertion was refused; the operator log says why.'),
  SAML_NO_PUID: saml('The assertion released no ubcEduCwlPuid.'),
  SAML_USER_UPSERT_FAILED: saml('The user could not be recorded.'),
  SAML_LOGIN_NOT_BOUND: saml(
    'The assertion answers a sign-in this browser did not start.',
  ),

  // ai/ — every one is 503, and carries nothing from the gateway (§14)
  AI_PROJECT_BUDGET_EXCEEDED: ai('The app has used its AI budget for the month.'),
  AI_USER_BUDGET_EXCEEDED: ai('The person has used their AI allowance for the month.'),
  AI_MODEL_NOT_PERMITTED: ai('The app’s key does not reach the model it asked for.'),
  AI_ROUTE_NOT_PERMITTED: ai('The app’s key does not reach that gateway route.'),
  AI_KEY_REVOKED: ai('The app’s key was revoked.'),
  AI_KEY_EXPIRED: ai('The app’s key expired.'),
  AI_MODEL_UNKNOWN: ai('The gateway does not know the model.'),
  AI_BACKEND_UNAVAILABLE: ai('The gateway could not be reached.'),
  AI_UNMAPPED: ai('The gateway answered with a failure this platform does not map.'),
  AI_CATALOGUE_EMPTY: {
    status: 503,
    families: ['CatalogueError'],
    summary: 'The gateway returned an empty model catalogue.',
  },
  AI_CATALOGUE_DISABLED: {
    status: 503,
    families: ['CatalogueError'],
    summary: 'AI is switched off on this control plane.',
  },
} as const satisfies Record<string, Entry>

export type ErrorCode = keyof typeof ERROR_CODES

export const ERROR_CODE_LIST = Object.keys(ERROR_CODES).sort() as readonly ErrorCode[]

/** The codes inside `details` (a `ManifestError[]`): §7's schema, its policy, and §25's compatibility check. */
export const MANIFEST_ERROR_CODE_LIST: readonly string[] = [
  ...Object.values(SPEC_CODES),
  ...Object.values(POLICY_CODES),
  ...Object.values(BLUEPRINT_CODES),
].sort()
