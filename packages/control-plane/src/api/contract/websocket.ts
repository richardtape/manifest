import {
  MAX_BUFFERED_BYTES,
  REPLAY_LIMIT,
  STREAM_READY,
} from '../../observability/index.js'
import type { ErrorCode } from '../error-codes.js'
import { ErrorEnvelope } from '../representations/errors.js'
import { StreamFrame } from '../representations/events.js'
import { ref, representations } from './schemas.js'

/** The stream's path as the document writes it; Fastify's is `/v1/projects/:projectId/events`. */
export const STREAM_PATH = '/v1/projects/{projectId}/events'

/** What `api/routes/events.ts` can answer before an upgrade, typed so `tsc` holds each to the registry. */
const STREAM_ERROR_CODES: readonly ErrorCode[] = [
  'CSRF_ORIGIN_REFUSED',
  'EVENTS_UPGRADE_REQUIRED',
  'INTERNAL',
  'NOT_FOUND',
  'UNAUTHENTICATED',
]

/**
 * D23.2's stream, in the one document (P5a Decision 34). OpenAPI describes the handshake —
 * its path, its parameter, the 426 a plain GET gets — and `x-manifest-websocket` describes
 * the conversation: every message is a StreamFrame, a new connection is replayed the newest
 * REPLAY_LIMIT events and then the ready frame, and these close codes end it.
 *
 * The close codes are `api/routes/events.ts`'s, plus the two a client meets through the
 * edge: 1001, when an edge reload outlives `stream_close_delay` (P5a sitting 2), and 1006,
 * which is how a browser or undici reports an upgrade refused with an HTTP status.
 */
export function streamPathItem(): Record<string, unknown> {
  const envelope = {
    'application/json': { schema: ref(representations, ErrorEnvelope, 'the envelope') },
  }
  return {
    get: {
      operationId: 'streamProjectEvents',
      tags: ['events'],
      summary: 'The project’s event stream (WebSocket)',
      description:
        'Upgrade to a WebSocket. Builds, their log lines, instance state transitions, incidents and every other audit event for this project, as StreamFrames: the newest events first as a replay, then the ready frame, then live. A session-bearing upgrade must carry Origin (§20). A plain GET answers 426.',
      parameters: [
        {
          name: 'projectId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '101': {
          description: 'Switching Protocols. Every message is one StreamFrame, as JSON.',
        },
        '426': {
          description:
            'This endpoint is a WebSocket; a plain GET is answered EVENTS_UPGRADE_REQUIRED.',
          content: envelope,
        },
        default: {
          description:
            'Refused before the upgrade, in the D23.7 envelope: UNAUTHENTICATED, NOT_FOUND (a stranger, or no such project), CSRF_ORIGIN_REFUSED, INTERNAL.',
          content: envelope,
        },
      },
      'x-manifest-error-codes': STREAM_ERROR_CODES,
      'x-manifest-websocket': {
        frame: ref(representations, StreamFrame, 'the stream’s frame'),
        replay: REPLAY_LIMIT,
        ready: STREAM_READY,
        maxBufferedBytes: MAX_BUFFERED_BYTES,
        closeCodes: {
          '1001':
            'The edge reloaded and its grace period ran out. Reconnect: the replay carries every event since.',
          '1006':
            'The upgrade was refused with an HTTP status — UNAUTHENTICATED, NOT_FOUND or CSRF_ORIGIN_REFUSED — or the connection dropped. A WebSocket client is shown no status; a plain GET of the same URL with the same session answers UNAUTHENTICATED or NOT_FOUND as the upgrade did (a GET is not origin-checked).',
          '1011': 'The stream could not be opened; the operator log says why. Reconnect.',
          '1013':
            'The client fell behind (more than maxBufferedBytes queued). Reconnect to be replayed.',
          '4403': 'The upgrade carried a session from another origin.',
          '4404': 'Not found — or not yours.',
        },
      },
    },
  }
}
