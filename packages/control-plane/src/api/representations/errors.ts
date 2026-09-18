import { z } from 'zod/v4'
import {
  ErrorCodeSchema,
  ManifestErrorSchema,
  representation,
} from '../contract/schemas.js'
import { LaunchReadiness } from './launch.js'
import { PendingAction } from './pending-actions.js'

/**
 * THE shape of every failure the API answers with — the one statement of it (P5a Task 15).
 *
 * It lives here rather than in `contract/schemas.ts` so it can name `LaunchReadiness`
 * without a cycle, and `api/errors.ts` derives its TypeScript `ErrorEnvelope` from this
 * schema rather than restating it. That restatement is what let the document say, from
 * P5a sitting 4 to sitting 10, that the envelope admits exactly four keys while the
 * production refusal had been sending a fifth since P2 (sitting 10 finding 1): a success
 * body is parsed through its representation on the way out and a wrong shape is a 500
 * (Decision 2), but an error body is built by hand in `mapError` and parsed by nothing.
 */
export const ErrorEnvelope = representation(
  'ErrorEnvelope',
  z.object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string().describe('For a person. Never parse it; switch on `code`.'),
      hint: z.string().optional().describe('What to do about it.'),
      details: z.array(ManifestErrorSchema).optional(),
      launchReadiness: LaunchReadiness.optional().describe(
        'On RELEASE_PRODUCTION_GATE_UNAVAILABLE: what a first launch still needs (§13).',
      ),
      /**
       * D24 (P5b Task 6, Decision 8). A `$ref` to the same representation §26's queue
       * answers with, for the reason `launchReadiness` is one: an agent refused a
       * privileged action must be able to find the thing it waits on from the refusal
       * itself, and a 403 that says only "no" fails D23.7.
       *
       * OPTIONAL, and it can be absent on a `TOKEN_ACTION_PENDING`: `mapError` fails
       * closed, so a refusal that could not be recorded — or one raised outside the route
       * wrapper — is still a refusal, just one without a question attached. The operator
       * hears about that on stderr.
       */
      pendingAction: PendingAction.optional().describe(
        'On TOKEN_ACTION_PENDING: the question a person must answer before this request can succeed (D24).',
      ),
    }),
  }),
)

/**
 * The envelope as TypeScript, DERIVED from the schema above — never written twice.
 * `z.input` rather than `z.output`: `mapError` builds the value, so it is the schema's
 * input side that describes what a hand-built body must satisfy.
 */
export type ErrorEnvelopeShape = z.input<typeof ErrorEnvelope>
