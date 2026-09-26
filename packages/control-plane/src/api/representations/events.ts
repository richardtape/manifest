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
    kind: z.literal('event').describe('An audit event.'),
    id: Uuid.describe(
      'The event’s id; a replay after a reconnect repeats it, so a client can drop what it has seen.',
    ),
    projectId: Uuid.describe('The project the event belongs to.'),
    subject: z
      .string()
      .describe('What the event is about — `build:<id>`, `instance:<id>`. Opaque.'),
    type: z
      .literal(type)
      .describe('What happened. Switch on it: each type has one `machineDetail` shape.'),
    humanMessage: z.string().describe('For a person (§14). Never parse it.'),
    machineDetail: EVENT_DETAIL_SCHEMAS[type],
    createdAt: Timestamp.describe('When it was recorded.'),
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
      kind: z.literal('log').describe('A line of a build’s output.'),
      id: z.string().describe('`<buildId>:<seq>`.'),
      projectId: Uuid.describe('The project the build belongs to.'),
      buildId: Uuid.describe('The build writing it (`getBuild`).'),
      seq: z
        .number()
        .int()
        .nonnegative()
        .describe(
          'Its position in the build’s log, from 0 — `getBuildLog` answers the same numbers.',
        ),
      stream: z
        .enum(['stdout', 'stderr'])
        .describe('Which of the build’s outputs wrote it.'),
      text: z.string().describe('Redacted at capture (§14).'),
      createdAt: Timestamp.describe('When it was written.'),
    })
    .describe(
      'One line of a build’s output, as it is written. Never replayed — GET /v1/builds/{buildId}/logs has them all.',
    ),
)

export const ControlFrame = representation(
  'ControlFrame',
  z
    .object({
      kind: z.literal('control').describe('A message about the stream itself.'),
      id: z.string().describe('An id for this message; opaque.'),
      projectId: Uuid.describe('The project the stream is for.'),
      type: z
        .literal(STREAM_READY)
        .describe('The replay is over: every message after this one is live.'),
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
