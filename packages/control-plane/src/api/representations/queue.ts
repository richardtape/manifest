import { z } from 'zod/v4'
import { QUEUE_KINDS, QUEUE_LIMIT, type Queue as QueueRead } from '../../launch/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

/**
 * THE ADMINISTRATORS' QUEUE, as a client reads it (Spec action 5; the launch path plan's Task 12).
 * PUBLISHED TEXT: no section, decision or plan numbers in these descriptions.
 */
export const QueueItem = representation(
  'QueueItem',
  z
    .object({
      kind: z
        .enum(QUEUE_KINDS)
        .describe(
          'What waits: `release-approval` — someone asked for the release serving staging to be approved (`requestApproval`); `iam-registration` — a registration sent to UBC IAM, whose answer an administrator records; `iam-change-request` — a change request an administrator filed with UBC IAM; `privacy-assessment` — an assessment sent to the Privacy Office, whose answer an administrator records.',
        ),
      project: z
        .object({
          id: Uuid.describe('The project.'),
          slug: z.string().describe('Its slug, which its hostnames are made from.'),
          name: z.string().describe('Its name, as its owner gave it.'),
          state: z
            .enum(['active', 'archived'])
            .describe(
              'Whether it is switched on. An archived project’s records still wait on UBC.',
            ),
        })
        .describe('The app it is about.'),
      subjectId: Uuid.describe(
        'What it is about: the release for `release-approval`, the registration or the assessment otherwise.',
      ),
      environment: z
        .enum(['staging', 'production'])
        .nullable()
        .describe('Which registration, for a registration’s item; null otherwise.'),
      requestedBy: z
        .object({
          id: Uuid.describe('Their user id.'),
          displayName: z.string().describe('Their name.'),
        })
        .nullable()
        .describe(
          'Who asked, or who said it was sent; null when nobody was recorded doing so.',
        ),
      since: Timestamp.describe(
        'Since when it has waited: when it was asked for, or when it was sent to UBC.',
      ),
      summary: z.string().describe('What waits, in one sentence for a person.'),
      note: z
        .string()
        .nullable()
        .describe(
          'What the person who asked for sign-off wrote to the administrators; null for anything else, or when they wrote nothing.',
        ),
    })
    .describe('One thing waiting on a platform administrator.'),
)

export const Queue = representation(
  'Queue',
  z
    .object({
      items: z
        .array(QueueItem)
        .describe(`Everything waiting, oldest first — at most ${QUEUE_LIMIT}.`),
      oldestSince: Timestamp.nullable().describe(
        'When the oldest item began waiting — the queue’s headline: a queue that is long is working, and one that is old is not. Null when nothing waits.',
      ),
      truncated: z
        .boolean()
        .describe(
          `True when more than ${QUEUE_LIMIT} wait, and only the oldest are here.`,
        ),
    })
    .describe(
      'Everything waiting on a platform administrator, oldest first: a release someone asked them to sign off, and the registrations and privacy assessments with UBC whose answers they record.',
    ),
)

export function toQueue(queue: QueueRead): z.input<typeof Queue> {
  return {
    items: queue.items.map((i) => ({ ...i, since: i.since.toISOString() })),
    oldestSince: queue.oldestSince?.toISOString() ?? null,
    truncated: queue.truncated,
  }
}
