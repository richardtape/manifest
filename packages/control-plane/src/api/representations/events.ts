import { z } from 'zod/v4'
import {
  EVENT_DETAIL_SCHEMAS,
  EVENT_TYPES,
  STREAM_READY,
  type EventType,
} from '../../observability/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'

/**
 * WS /v1/projects/{projectId}/events's messages (D23.2, P5a Task 12). Not parsed on the
 * way out — the stream sends what `observability/bus.ts` produces — so
 * `api/stream-contract.test.ts` parses every frame a whole delivery lifecycle publishes and
 * replays through these, and `recordEvent` enforces each `machineDetail` where it is written.
 */
const eventFrameOf = <T extends EventType>(type: T) =>
  z.object({
    kind: z.literal('event'),
    id: Uuid,
    projectId: Uuid,
    subject: z
      .string()
      .describe('What the event is about — `build:<id>`, `instance:<id>`. Opaque.'),
    type: z.literal(type),
    humanMessage: z.string().describe('For a person (§14). Never parse it.'),
    machineDetail: EVENT_DETAIL_SCHEMAS[type],
    createdAt: Timestamp,
  })

type EventFrameSchema = ReturnType<typeof eventFrameOf<EventType>>

export const EventFrame = representation(
  'EventFrame',
  z
    .discriminatedUnion(
      'type',
      EVENT_TYPES.map((type) => eventFrameOf(type)) as unknown as [
        EventFrameSchema,
        ...EventFrameSchema[],
      ],
    )
    .describe(
      'An audit Event, as recorded (§20) and redacted at capture (§14). Switch on `type`; each type has one `machineDetail` shape. Replayed on reconnect.',
    ),
)

export const LogFrame = representation(
  'LogFrame',
  z
    .object({
      kind: z.literal('log'),
      id: z.string().describe('`<buildId>:<seq>`.'),
      projectId: Uuid,
      buildId: Uuid,
      seq: z.number().int().nonnegative(),
      stream: z.enum(['stdout', 'stderr']),
      text: z.string().describe('Redacted at capture (§14).'),
      createdAt: Timestamp,
    })
    .describe(
      'One line of a build’s output, as it is written. Never replayed — GET /v1/builds/{buildId}/logs has them all.',
    ),
)

export const ControlFrame = representation(
  'ControlFrame',
  z
    .object({
      kind: z.literal('control'),
      id: z.string(),
      projectId: Uuid,
      type: z.literal(STREAM_READY),
    })
    .describe('Ends the replay: everything after it is live.'),
)

export const StreamFrame = representation(
  'StreamFrame',
  z
    .union([EventFrame, LogFrame, ControlFrame])
    .describe(
      'Every message on WS /v1/projects/{projectId}/events is one of these, as JSON. Switch on `kind`, then `type`.',
    ),
)
