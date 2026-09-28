import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { environments, instances, type Db } from '../../db/index.js'
import {
  OUTPUT_DEFAULTS,
  OutputError,
  makeRedactor,
  readRecentOutput,
  type RecentOutput,
} from '../../observability/index.js'
import {
  assertCapability,
  AuthorizationError,
  instancesOf,
  servingInstanceOf,
} from '../../projects/index.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import {
  InstanceList,
  InstanceOutput,
  OutputQuery,
  toInstance,
} from '../representations/instances.js'

const EnvironmentParams = z.strictObject({ environmentId: PATH.environmentId })
const InstanceParams = z.strictObject({ instanceId: PATH.instanceId })

// Captured from a run of `api/instances.test.ts`'s shape on the fake driver, 2026-09-27: a
// healthy staging deploy, then a second that failed; and the first instance's last three lines,
// its session secret redacted. The OUTPUT example reads `sandbox` since FE-24's code (sitting 10):
// a staging instance's output is refused (§14), so an example of a read of one would document an
// answer the route never gives.
const EXAMPLE_LIST: z.input<typeof InstanceList> = {
  environmentId: 'df060503-98c8-4d67-ad08-f3ca0e7373ef',
  instances: [
    {
      id: 'd5201f1e-4d56-4088-9530-cc4c1a0a50fa',
      environmentId: 'df060503-98c8-4d67-ad08-f3ca0e7373ef',
      releaseId: '5ec6bd7a-22c6-45f8-a439-8fe6d8ee84da',
      kind: 'web',
      state: 'failed',
      lastSeenAt: '2026-09-27T16:34:54.739Z',
      serving: false,
    },
    {
      id: '3124947b-b928-4e66-be25-59a427f96569',
      environmentId: 'df060503-98c8-4d67-ad08-f3ca0e7373ef',
      releaseId: '165db6ac-7e38-43a3-a869-275bb9ccbf76',
      kind: 'web',
      state: 'healthy',
      lastSeenAt: '2026-09-27T16:34:54.691Z',
      serving: true,
    },
  ],
  truncated: false,
}
const EXAMPLE_OUTPUT: z.input<typeof InstanceOutput> = {
  instanceId: '3124947b-b928-4e66-be25-59a427f96569',
  environmentId: 'df060503-98c8-4d67-ad08-f3ca0e7373ef',
  environmentKind: 'sandbox',
  readAt: '2026-09-27T16:34:54.701Z',
  lines: [
    {
      at: '2026-09-27T16:34:54.698Z',
      stamped: true,
      stream: 'stdout',
      text: 'GET /healthz 200 — session store connected with [REDACTED]',
    },
    {
      at: '2026-09-27T16:34:54.698Z',
      stamped: true,
      stream: 'stderr',
      text: 'Error: MONGODB_URI is not set',
    },
    {
      at: '2026-09-27T16:34:54.698Z',
      stamped: true,
      stream: 'stdout',
      text: 'listening on 3000',
    },
  ],
  truncated: {
    lines: true,
    bytes: false,
  },
  failure: null,
}

/** At most this many instances in one answer (Decision 4). */
const INSTANCES_LISTED = 50

/**
 * The states an instance the hostname reaches can be in. **A failed instance never serves**,
 * whatever `servingInstanceOf` answers: its fallback for an environment with no Route record
 * is the newest instance of ANY state — P6b Task 6's lesson, which `candidateFor` holds too.
 */
const SERVING_STATES = new Set(['healthy', 'hibernated', 'waking'])

/** The instance and the environment it runs in — found by the INSTANCE's id alone. */
async function instanceWithEnvironment(db: Db, instanceId: string) {
  const [found] = await db
    .select({ instance: instances, environment: environments })
    .from(instances)
    .innerJoin(environments, eq(instances.environmentId, environments.id))
    .where(eq(instances.id, instanceId))
  return found
}

const toInstanceOutput = (
  found: NonNullable<Awaited<ReturnType<typeof instanceWithEnvironment>>>,
  kind: 'sandbox' | 'staging',
  out: RecentOutput,
  readAt: Date,
): z.input<typeof InstanceOutput> => ({
  instanceId: found.instance.id,
  environmentId: found.environment.id,
  environmentKind: kind,
  readAt: readAt.toISOString(),
  lines: out.lines.map((line) => ({
    at: line.at.toISOString(),
    stamped: line.stamped,
    stream: line.stream,
    text: line.text,
  })),
  truncated: out.truncated,
  failure: out.failure,
})

/**
 * §14's bounded read of a running app's output, and the list that names which instance to
 * read (the front-end enablement plan's Task 3; §14 applied 2026-09-26).
 */
export const instanceRoutes = [
  defineRoute({
    operationId: 'listInstances',
    method: 'GET',
    path: '/v1/environments/{environmentId}/instances',
    tag: 'delivery',
    summary: 'An environment’s instances',
    description:
      '§11: the environment’s instances, the one seen most recently first — at most 50 — each marked whether the hostname reaches it now. A failed instance stays listed after it is replaced, so an agent can find it and read its Incident; a running one’s last lines are `getInstanceOutput`.',
    params: EnvironmentParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The instances.', schema: InstanceList },
    errors: ['NOT_FOUND'],
    examples: { response: EXAMPLE_LIST },
    handler: async ({ deps, actor, params }) => {
      const [environment] = await deps.db
        .select()
        .from(environments)
        .where(eq(environments.id, params.environmentId))
      if (environment === undefined)
        throw new AuthorizationError(
          'NOT_FOUND',
          `no environment '${params.environmentId}'`,
        )
      await assertCapability(deps.db, actor, environment.projectId, 'project:read')
      const { rows, truncated } = await instancesOf(
        deps.db,
        environment,
        INSTANCES_LISTED,
      )
      const serving = await servingInstanceOf(deps.db, environment)
      return {
        environmentId: environment.id,
        instances: rows.map((row) => ({
          ...toInstance(row),
          serving: row.id === serving?.id && SERVING_STATES.has(row.state),
        })),
        truncated,
      }
    },
  }),
  defineRoute({
    operationId: 'getInstanceOutput',
    method: 'GET',
    path: '/v1/instances/{instanceId}/output',
    tag: 'delivery',
    summary: 'A running instance’s recent output',
    description:
      '§14: the last lines a sandbox instance printed, oldest first — read on request and never streamed or kept, bounded in lines (`lines`, 200 by default, at most 1000) and in bytes (256 KiB in all, each line cut at 4 KiB), and redacted at read with the rules that redact an Incident’s log tail. **Never staging or production**: both serve real people, so each is refused by its own code, and an Incident is the only window onto either. Decided by the environment’s kind, so a laptop’s staging is refused too.',
    params: InstanceParams,
    query: OutputQuery,
    body: NO_BODY,
    success: { status: 200, description: 'The output.', schema: InstanceOutput },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'INSTANCE_OUTPUT_PRODUCTION',
      'INSTANCE_OUTPUT_STAGING',
      'INSTANCE_OUTPUT_UNAVAILABLE',
    ],
    examples: { response: EXAMPLE_OUTPUT },
    handler: async ({ deps, actor, params, query }) => {
      // By the instance id alone: the project is its environment's, never the request's.
      const found = await instanceWithEnvironment(deps.db, params.instanceId)
      if (found === undefined)
        throw new AuthorizationError('NOT_FOUND', `no instance '${params.instanceId}'`)
      await assertCapability(deps.db, actor, found.environment.projectId, 'output:read')
      const kind = found.environment.kind
      // §14: production is never readable — decided from the ROW, before the driver is asked
      // (Decision 6). `403`, not `404`: every other read says the instance exists.
      if (kind === 'production')
        throw new OutputError(
          'INSTANCE_OUTPUT_PRODUCTION',
          'a production instance’s output is not readable (§14); its Incident’s log tail is the only window onto it',
        )
      // FE-24 (sitting 10; §14 as Spec action 6 left it): staging serves real people too, so it is
      // refused the same way, by its own code — by the KIND, never the IdP, so a laptop's staging
      // (the fake sign-in, §21) is refused exactly as UBC's will be.
      if (kind === 'staging')
        throw new OutputError(
          'INSTANCE_OUTPUT_STAGING',
          'a staging instance’s output is not readable (§14): staging serves real people; its Incident’s log tail is the only window onto it',
        )
      const { instance } = found
      const unavailable = (): OutputError =>
        new OutputError(
          'INSTANCE_OUTPUT_UNAVAILABLE',
          `instance '${instance.id}' is not running — it never started, or it no longer runs — so there is no output to read; if it failed, its Incident has its last lines`,
        )
      if (
        instance.handle === null ||
        instance.state === 'destroying' ||
        instance.state === 'gone'
      )
        throw unavailable()
      // THE DRIVER, not the row (the whole-branch review's I3): a failed deploy removes its
      // container once its Incident is captured, and the row keeps its handle and `failed` — so
      // only the driver knows there is nothing left to read. Both drivers answer `gone`.
      if ((await deps.driver.status(instance.handle)).state === 'gone')
        throw unavailable()
      const redact = makeRedactor(
        await deps.appSecrets.secretValues(deps.db, {
          projectId: found.environment.projectId,
          environmentKind: kind,
        }),
      )
      const out = await readRecentOutput(
        deps.driver,
        instance.handle,
        { ...OUTPUT_DEFAULTS, lines: query.lines ?? OUTPUT_DEFAULTS.lines },
        redact,
      )
      return toInstanceOutput(found, kind, out, new Date())
    },
  }),
]
