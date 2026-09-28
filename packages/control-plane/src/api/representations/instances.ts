import { z } from 'zod/v4'
import { instanceKind, instanceState, type instances } from '../../db/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

export const Instance = representation(
  'Instance',
  z
    .object({
      id: Uuid.describe('The instance.'),
      environmentId: Uuid.describe('The environment it runs in.'),
      releaseId: Uuid.describe('The release it runs (`getRelease`).'),
      kind: z
        .enum(instanceKind.enumValues)
        .describe(
          'What kind of process it is; `web`, which answers requests, is the only kind the platform runs today.',
        ),
      // §11's machine, read from the database's own enum rather than restated, so a
      // state a migration adds is a state the contract names.
      state: z
        .enum(instanceState.enumValues)
        .describe(
          'Where it is in its life (§11): `provisioning` and `starting` on the way up, `healthy` when it serves, `failed` when it never did, and `destroying` then `gone` once replaced.',
        ),
      lastSeenAt: Timestamp.nullable().describe(
        'When the platform last saw it running; null before it started.',
      ),
    })
    .describe(
      'A running (or once-running) copy of a release in one environment (§11). Never its driver or handle.',
    ),
)

/** Decision 23: `driver` and `handle` are the platform's, and never leave. */
export function toInstance(row: typeof instances.$inferSelect): z.input<typeof Instance> {
  return {
    id: row.id,
    environmentId: row.environmentId,
    releaseId: row.releaseId,
    kind: row.kind,
    state: row.state,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  }
}

export const InstanceSummary = representation(
  'InstanceSummary',
  Instance.extend({
    serving: z
      .boolean()
      .describe(
        'Whether the environment’s hostname reaches this instance now. At most one instance of an environment serves, and a failed one never does.',
      ),
  }).describe('An instance, and whether it is the one serving.'),
)

export const InstanceList = representation(
  'InstanceList',
  z
    .object({
      environmentId: Uuid.describe('The environment.'),
      instances: z
        .array(InstanceSummary)
        .describe(
          'The environment’s instances, the one seen most recently first — at most 50. A failed instance stays listed after it is replaced, so an agent can read why it failed (`listIncidents`).',
        ),
      truncated: z
        .boolean()
        .describe(
          'True when the environment has had more than 50 instances and only the 50 seen most recently are listed.',
        ),
    })
    .describe('An environment’s instances (§11), newest first.'),
)

const OutputLine = z
  .object({
    at: Timestamp.describe(
      'When the line was printed, as the runtime recorded it — or, when `stamped` is false, when Manifest read it.',
    ),
    stamped: z.boolean().describe('Whether `at` is the runtime’s own time for the line.'),
    stream: z
      .enum(['stdout', 'stderr'])
      .describe('Which of the app’s two outputs it printed to.'),
    text: z
      .string()
      .describe(
        'The line, redacted. A line longer than 4 KiB is cut and ends `…[cut: N bytes]`.',
      ),
  })
  .describe('One line the app printed.')

export const InstanceOutput = representation(
  'InstanceOutput',
  z
    .object({
      instanceId: Uuid.describe('The instance.'),
      environmentId: Uuid.describe('The environment it runs in.'),
      environmentKind: z
        .enum(['sandbox', 'staging'])
        .describe(
          'Only a sandbox instance’s output is readable (§14): a staging instance is refused `INSTANCE_OUTPUT_STAGING`, so this reads `sandbox`. `staging` stays in the list so a client written against an earlier version still compiles.',
        ),
      readAt: Timestamp.describe(
        'When Manifest read it. Nothing is kept: read again to see newer lines.',
      ),
      lines: z
        .array(OutputLine)
        .describe(
          'The last lines the app printed, oldest first — redacted at read with the rules that redact an Incident’s log tail. At most `lines`, and fewer when a line the runtime stored in pieces began before the window.',
        ),
      truncated: z
        .object({
          lines: z.boolean().describe('The app printed more lines than were read.'),
          bytes: z
            .boolean()
            .describe(
              'The lines read were more than 256 KiB together, and the oldest were dropped.',
            ),
        })
        .describe('Which bound the answer met.'),
      failure: z
        .string()
        .nullable()
        .describe(
          'Why reading stopped early, when it did — an error’s code or name, never its message. The lines before it are still answered.',
        ),
    })
    .describe(
      'A running instance’s recent output (§14): read on request, never streamed, never stored — in the sandbox only.',
    ),
)

export const OutputQuery = z.strictObject({
  lines: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('How many of the last lines to read: 200 by default, at most 1000.'),
})
