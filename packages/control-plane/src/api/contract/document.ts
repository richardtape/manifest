import { z } from 'zod/v4'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { refusedWhenArchived, type Capability } from '../../projects/index.js'
import { manifestSchema } from '../../spec/index.js'
import {
  ERROR_CODE_LIST,
  ERROR_CODES,
  MANIFEST_ERROR_CODE_LIST,
  MANIFEST_ERRORS,
  type ErrorCode,
} from '../error-codes.js'
// Registers ErrorEnvelope, which every operation's `default` response names by id — and
// which no route declares as a success schema, so nothing else imports it (P5a Task 15).
import '../representations/errors.js'
import { UNVERSIONED } from '../unversioned.js'
import { readsBody, type AnyRoute } from './route.js'
import { component, ref, representations, requests } from './schemas.js'
import { STREAM_PATH, streamPathItem } from './websocket.js'

/**
 * `@manifest/contract`'s version too; a test holds them equal from P5a Task 7 (Decision 8).
 *
 * **`1.0.0` SINCE P5c TASK 13 (2026-09-19).** P5a Decision 8 reserved exactly this:
 * *"The major version is the path. P5c sets `1.0.0` when the console has proved the
 * contract."* It has — D22's reference console drives §22's whole journey through nothing
 * but this document's generated client, and `packages/console/src/coverage.test.ts` holds
 * every one of its operations to having a caller. From here an ADDITIVE change bumps the
 * minor; a BREAKING one is a new path prefix served beside `/v1`, never an edit to it
 * (D23.8).
 *
 * **`1.1.0` SINCE P6b TASK 2 (2026-09-23)**, and the bump is late: P6a added seven
 * operations (approve, reject, the approval, the launch records and the rehearsal) under
 * `1.0.0` without one (P6b *Read this first* 11). This bump covers those seven and every
 * additive change P6b makes, once, because nothing is published between tasks.
 *
 * **`1.2.0` SINCE THE D5 PLAN'S TASK 2 (2026-09-24)**, one task earlier than that plan was
 * written to expect: every route's `errors:` list is printed into its operation's `default`
 * response, and `startBuild` now answers `SOURCE_COMMIT_NOT_FOUND` (the plan's sitting 1,
 * F8). The `ErrorCode` enum gains it and `SOURCE_PROVIDER_MISMATCH`, and loses
 * `SOURCE_FOREIGN_REPO`, which no driver can raise once a reference carries no path — a
 * code no server sends breaks no reader. This bump covers every additive change the D5
 * plan makes, once, because nothing is published between its tasks (P6b Decision 15).
 *
 * **`1.3.0` SINCE THE AUTHORING API PLAN'S TASK 2 (2026-09-25)**, as that plan predicted:
 * `ApprovalDiff.changes[]` gains `added` and `removed` (F7). This bump covers every additive
 * change the authoring API plan makes, once, because nothing is published between its tasks.
 *
 * **`1.4.0` SINCE THE FRONT-END ENABLEMENT PLAN'S TASK 3 (2026-09-27)**, as that plan predicted:
 * `listInstances` and `getInstanceOutput` (§14's bounded read), the `output:read` capability
 * and two `OutputError` codes. This bump covers every additive change that plan makes, once,
 * because nothing is published between its tasks.
 *
 * Three files carry it and two tests hold them together: this constant,
 * `packages/contract/openapi.json`'s `info.version` (GENERATED — `pnpm contract:write`,
 * never edited) and `packages/contract/package.json`.
 */
export const CONTRACT_VERSION = '1.4.0'

type JsonSchema = Record<string, unknown>

/**
 * WHAT EACH TAG GROUPS, for a reader choosing where to start (the authoring API plan's Task 9;
 * the independent linter's `tag-description`). Keyed by every tag a route or the stream uses,
 * and `docs.test.ts` refuses a tag without a sentence here — a new tag is a new line.
 */
const TAG_DESCRIPTIONS: Record<string, string> = {
  agents:
    'Model keys for an agent working outside Manifest (§10): a session on one project, charged to the person the agent works for, capped and short-lived — and that person’s monthly agent budget; and the intake session a person describing a new app is given before it exists, which the platform pays for.',
  administration:
    'Operations for the platform’s administrators — today, every project on the platform at a glance (§26).',
  blueprints:
    'The blueprints an app is built from (§25): what each provides, its starters, and the knowledge pack an agent reads before writing code.',
  delivery:
    'From a commit to a running app (§11–§13): build it, release the build, deploy the release, and — for production — the approval an administrator gives. Incidents say why an instance failed.',
  docs: 'This documentation, served: the guides for a person writing a client and for an AI agent, the reference generated from this document, and the document itself.',
  events:
    'The project’s event stream (D23.2): every audit event and build log line, live, over a WebSocket.',
  identity: 'Who the caller is: the person behind the session, and their platform role.',
  launch:
    'A first production launch (§9, §13): the checklist computed from what exists, the external records UBC’s IAM and Privacy Office decisions are kept in, and the sign-in rehearsal.',
  'pending-actions':
    'D24’s questions: a delegated token that asks for a privileged action waits here until a person confirms or rejects it.',
  projects:
    'A project, its three environments, its members, and the validation of its manifest.yaml (§6, §7, §23).',
  secrets:
    'The values of an app’s declared secrets, per environment — set and cleared, and never read back (§20).',
  source:
    'The project’s code: read a tree, a file, the history and one commit, and commit changes against the commit read (§20’s git driver).',
  tokens:
    'Delegated tokens (D24): a person mints one for an agent, scoped to one project and a list of capabilities, and revokes it.',
}

/** Codes EVERY `/v1` operation can answer, and every mutation besides. */
const EVERY_ROUTE: readonly ErrorCode[] = [
  'UNAUTHENTICATED',
  'REQUEST_INVALID',
  'INTERNAL',
  /**
   * §20's per-token limit is taken in the ONE credential hook, before any route runs
   * (P5b Task 9) — so every operation can answer it to a delegated token, and listing it
   * per route would be forty entries that mean "the hook ran". A session is not limited
   * here; `GET /v1/slugs/{slug}` keeps its own per-user limiter and names this code in
   * its own `errors:` as well, which is a different control with the same answer.
   */
  'RATE_LIMITED',
]
const EVERY_MUTATION: readonly ErrorCode[] = [
  'CSRF_ORIGIN_REFUSED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  // Fastify's own refusals of a body it cannot read, before any route runs (P5a Task 5).
  'REQUEST_MEDIA_TYPE_UNSUPPORTED',
  'REQUEST_BODY_TOO_LARGE',
]

/**
 * §11's ARCHIVED STATE, DERIVED (the whole-branch review's I1): `409 PROJECT_ARCHIVED` on every
 * operation asserting a capability an archived project refuses — by `refusedWhenArchived`, the
 * predicate `assertCapability` refuses by — so no route lists it by hand, and a new route that
 * declares its `capability` declares this too. `authz-contract.ts` archives its fixture and holds the
 * operations that answer it to exactly these. (`mintToken` and `startAgentSession` refuse it a second
 * time under the project row, `holdActiveProject`; each asserts a capability that is refused anyway.)
 */
function refusedArchived(route: AnyRoute): readonly ErrorCode[] {
  const asserted: readonly Capability[] =
    route.capability === undefined
      ? []
      : typeof route.capability === 'string'
        ? [route.capability]
        : route.capability
  return asserted.some(refusedWhenArchived) ? ['PROJECT_ARCHIVED'] : []
}

/** zod stamps each emitted schema with its own `$schema` and `$id`; a component carries neither. */
function strip(schema: JsonSchema): JsonSchema {
  const { $schema: _schema, $id: _id, ...rest } = schema
  return rest
}

function components(): Record<string, JsonSchema> {
  const out = z.toJSONSchema(representations, {
    io: 'output',
    uri: component,
    unrepresentable: 'throw',
  }).schemas
  const inp = z.toJSONSchema(requests, {
    io: 'input',
    uri: component,
    unrepresentable: 'throw',
  }).schemas
  const both = Object.keys(out).filter((id) => id in inp)
  if (both.length > 0) {
    throw new Error(
      `registered as a representation AND a request: ${both.join(', ')} (P5a Decision 5)`,
    )
  }
  const all = { ...out, ...inp } as Record<string, JsonSchema>
  // Each code's MEANING beside the enum itself (Decision 14), where a reference renderer and a
  // generated client both look — `x-enumDescriptions` is an extension, so the generated
  // `ErrorCode` union is unchanged, where a `oneOf` of `const`s would change `schema.d.ts`.
  all.ErrorCode = {
    ...all.ErrorCode,
    'x-enumDescriptions': Object.fromEntries(
      ERROR_CODE_LIST.map((code) => [code, ERROR_CODES[code].summary]),
    ),
  }
  all.ManifestYaml = manifestYamlSchema()
  all.ManifestErrorCode = {
    ...all.ManifestErrorCode,
    'x-enumDescriptions': Object.fromEntries(
      MANIFEST_ERROR_CODE_LIST.map((code) => [code, MANIFEST_ERRORS[code].summary]),
    ),
  }
  return Object.fromEntries(
    Object.keys(all)
      .sort()
      .map((id) => [id, strip(all[id]!)]),
  )
}

/**
 * `manifest.yaml` AS A JSON SCHEMA, for an agent WRITING one (the authoring API plan's Task 9,
 * Step 4, by Task 1's `[M7]` rule): §7's own zod schema, emitted by `zod-to-json-schema`
 * (3.25.2, reading zod 3's API as `spec/` is written) — no port to zod/v4, whose emitter drops
 * the same rule this one does. `jsonSchema7` because the emitter has no 2020-12 target and the
 * schema uses nothing that differs; `$refStrategy: 'none'` so every field is inline; `$schema`
 * dropped, as every component's is.
 *
 * **IT IS DOCUMENTATION FOR THE FILE, NOT THE VALIDATOR.** The platform validates with §7's own
 * code, and a JSON Schema cannot say everything §7 does: the policy (a slug that matches the
 * project, a model in the catalogue, a quota) lives in `spec/policy.ts`. The one cross-field
 * rule the emitter drops SILENTLY — an `env` entry carries a `value` or `secret: true`, never
 * both and never neither — is restated here by hand on every `env` item, and
 * `manifest-yaml.test.ts` holds the result to zod's verdict over a corpus, refusing any
 * disagreement.
 */
export function manifestYamlSchema(): JsonSchema {
  const { $schema: _schema, ...emitted } = zodToJsonSchema(manifestSchema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as JsonSchema
  let restated = 0
  const restate = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(restate)
      return
    }
    const schema = node as JsonSchema
    const keys = Object.keys((schema.properties ?? {}) as JsonSchema).sort()
    if (keys.join() === 'name,secret,value') {
      // `(secret === true) !== (value !== undefined)`, as JSON Schema: a value (with `secret`
      // absent or false), or `secret: true` with no value.
      schema.oneOf = [
        {
          description: 'A value, written in the file.',
          required: ['value'],
          properties: {
            secret: { const: false, description: 'Absent, or `false`, beside a value.' },
          },
        },
        {
          description: 'A secret, held by Manifest and set with `setAppSecret`.',
          required: ['secret'],
          properties: {
            secret: { const: true, description: 'Exactly `true`, with no value.' },
          },
          not: { required: ['value'] },
        },
      ]
      restated += 1
    }
    Object.values(schema).forEach(restate)
  }
  restate(emitted)
  // The top-level `env`, and staging's and production's overrides: a fourth would be a new
  // place an env entry can go, and a first-time reader of this function should hear of it.
  if (restated !== 3) {
    throw new Error(`restated the env rule on ${restated} items; expected 3`)
  }
  return {
    ...emitted,
    description:
      'manifest.yaml, schema version 1 (§7), as a JSON Schema — DOCUMENTATION FOR THE FILE, for whoever writes it. The platform validates with its own code: `validateSpec` and a commit answer each problem as a `ManifestError` with a path, and some rules are not expressible here — the name must equal the project’s slug, a model must be in the catalogue and approved for `data.classification`, and what is asked for must fit the project’s quota.',
  }
}

/**
 * EVERY ERROR CODE'S STATUS, MEANING AND REMEDY, as one table a client can look a code up in
 * (Decision 14) — the enum says what a code IS; this says what to DO. Sorted, so the drift
 * test compares bytes. The codes inside `details` get their own table: they have no status,
 * because every one of them arrives inside a `422 SPEC_INVALID`.
 */
function errorTables(): Record<string, JsonSchema> {
  return {
    'x-manifest-errors': Object.fromEntries(
      ERROR_CODE_LIST.map((code) => {
        const { status, summary, remedy } = ERROR_CODES[code]
        return [code, { status, summary, remedy }]
      }),
    ),
    'x-manifest-spec-errors': Object.fromEntries(
      MANIFEST_ERROR_CODE_LIST.map((code) => [code, { ...MANIFEST_ERRORS[code] }]),
    ),
  }
}

function parameters(route: AnyRoute): JsonSchema[] {
  const list: JsonSchema[] = []
  const add = (where: 'path' | 'query', object: z.ZodObject): void => {
    const schema = z.toJSONSchema(object, { io: 'input', unrepresentable: 'throw' }) as {
      properties?: Record<string, JsonSchema>
      required?: string[]
    }
    for (const name of Object.keys(schema.properties ?? {}).sort()) {
      const property = strip(schema.properties![name]!)
      // OpenAPI reads a parameter's description off the PARAMETER (the authoring API plan's
      // Task 5): on its schema alone, a reference generator shows the parameter undescribed.
      const { description } = property as { description?: unknown }
      list.push({
        name,
        in: where,
        ...(typeof description === 'string' ? { description } : {}),
        required: where === 'path' || (schema.required ?? []).includes(name),
        schema: property,
      })
    }
  }
  add('path', route.params)
  add('query', route.query)
  if (route.method !== 'GET') {
    list.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'D23.6. One per user action, reused across retries of THAT action.',
      schema: { type: 'string', minLength: 8 },
    })
  }
  return list
}

/**
 * §16 *Contract*: the OpenAPI 3.1 document, generated from the route definitions and
 * nothing else. Deterministic — paths, methods, parameters and components sorted — so the
 * drift test compares bytes.
 */
export function openApiDocument(routes: readonly AnyRoute[]): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {}
  const ordered = [...routes].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  )
  for (const route of ordered) {
    const codes = [
      ...new Set([
        ...EVERY_ROUTE,
        ...(route.method === 'GET' ? [] : EVERY_MUTATION),
        ...refusedArchived(route),
        ...route.errors,
      ]),
    ].sort()
    const operation: JsonSchema = {
      operationId: route.operationId,
      tags: [route.tag],
      summary: route.summary,
      description: route.description,
      // A session-only operation says so where a client looks first (F17); every other one
      // takes the document's global `security` — either credential.
      ...(route.credential === 'session' ? { security: [{ session: [] }] } : {}),
      parameters: parameters(route),
      ...(readsBody(route)
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: ref(requests, route.body, `${route.operationId}'s body`),
                  ...(route.examples.request === undefined
                    ? {}
                    : { example: route.examples.request }),
                },
              },
            },
          }
        : {}),
      responses: {
        [String(route.success.status)]: {
          description: route.success.description,
          content: {
            'application/json': {
              schema: ref(
                representations,
                route.success.schema,
                `${route.operationId}'s response`,
              ),
              example: route.examples.response,
            },
          },
        },
        default: {
          description: `An error, in the D23.7 envelope; \`x-manifest-errors\` gives each code's meaning and remedy. This operation can answer: ${codes.join(', ')}.`,
          content: {
            'application/json': { schema: { $ref: component('ErrorEnvelope') } },
          },
        },
      },
      'x-manifest-error-codes': codes,
    }
    ;(paths[route.path] ??= {})[route.method.toLowerCase()] = operation
  }
  // D23.2's stream: documented, never defined — it upgrades, and defineRoute answers JSON
  // (P5a Decision 34). Its path sorts among the others'.
  paths[STREAM_PATH] = streamPathItem() as Record<string, JsonSchema>
  const sortedPaths = Object.fromEntries(
    Object.keys(paths)
      .sort((a, b) => a.localeCompare(b))
      .map((path) => [path, paths[path]!]),
  )

  return {
    openapi: '3.1.0',
    info: {
      title: 'Manifest',
      version: CONTRACT_VERSION,
      description:
        "Manifest's public API (§22). Generated from the control plane's route definitions; do not edit. " +
        'Resource routes are under /v1 (D23.8); a breaking change is a new prefix beside it. Response ' +
        'objects may gain fields under /v1 — a client ignores fields it does not know. Every mutation ' +
        'carries an Idempotency-Key, and a session-bearing mutation carries Origin (§20).',
    },
    servers: [
      {
        url: 'https://console.manifest.internal',
        description:
          'The laptop platform (§21). The console and the API share this origin.',
      },
    ],
    // EITHER credential (F17): an OpenAPI `security` list is alternatives, each object one way.
    security: [{ session: [] }, { delegatedToken: [] }],
    tags: [...new Set([...routes.map((r) => r.tag), 'events'])].sort().map((name) => ({
      name,
      ...(TAG_DESCRIPTIONS[name] === undefined
        ? {}
        : { description: TAG_DESCRIPTIONS[name] }),
    })),
    paths: sortedPaths,
    components: {
      securitySchemes: {
        session: {
          type: 'apiKey',
          in: 'cookie',
          name: 'manifest_session',
          description:
            'A person, signed in with CWL at /auth/login in a browser (§9). It carries their platform role and expires on its own; a mutation made with it must carry `Origin` (§20). Some operations take nothing else — their `security` names this scheme alone — and a few need it stepped up within the last ten minutes (`STEP_UP_REQUIRED`, §20).',
        },
        delegatedToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'mft_<id>_<secret>',
          description:
            'A delegated token (D24): `Authorization: Bearer mft_<id>_<secret>`, for an agent or a script. A person mints it in their own session for ONE project (`mintToken`), and it is shown once. It acts as that person, on that project, with the capabilities it was minted with, until it expires or is revoked (`revokeToken`). Send it with no session cookie — both at once is `400 CREDENTIAL_AMBIGUOUS` — and no `Origin` is needed. An operation whose `security` names the session alone refuses it `403 TOKEN_CREDENTIAL_REFUSED`; one of D24’s privileged actions answers `403 TOKEN_ACTION_PENDING` until a person confirms that one request.',
        },
      },
      schemas: components(),
    },
    'x-manifest-unversioned': UNVERSIONED.map((u) => ({ ...u })),
    ...errorTables(),
  }
}
