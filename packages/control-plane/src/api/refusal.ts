import type { FastifyReply, FastifyRequest } from 'fastify'
import { sendRefusalPage, wantsRefusalPage } from './auth-page.js'
import type { ErrorBody } from './errors.js'

/**
 * FE-30 (the faculty-ready plan's Task 3, Decision 3; §20 *Machine-actionable errors*): EVERY
 * REFUSAL LEAVES THROUGH HERE — the error handler and its 401, `frameworkErrors`, the not-found
 * handler, the webhook receiver's and single logout's own refusals, and the page a browser is
 * shown. Six hand-built refusals were six places to forget the id.
 *
 * It does three things, in this order:
 * - writes ONE operator line (Decision 4): the request's id, its time, the method, the operation
 *   and the code. **Never the message, the hint, a body, a header or a URL's query** — a message
 *   may quote a slug or a person's words. `console.error`, not `request.log`, which writes nothing
 *   under `logger: false` (ORIENTATION §9);
 * - sets `x-request-id` ITSELF, because two paths never reach the `onRequest` hook that sets it
 *   on every other answer: `frameworkErrors` runs no hooks, and a refusal thrown inside an earlier
 *   `onRequest` hook skips the hooks after it (Task 1's `[M2]`, measured on the credential hook);
 * - sends the envelope with `requestId` merged in — or, to a browser navigating `/auth/*`, the
 *   page (FE-17), which shows the same id to the person.
 */
export function sendRefusal(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  error: ErrorBody,
): FastifyReply {
  const requestId = request.id
  console.error(
    JSON.stringify({
      level: status >= 500 ? 'error' : 'warn',
      msg: 'refused',
      requestId,
      at: new Date().toISOString(),
      method: request.method,
      operation: operationOf(request),
      status,
      code: error.code,
    }),
  )
  reply.header('x-request-id', requestId)
  const body = { error: { ...error, requestId } }
  return wantsRefusalPage(request)
    ? sendRefusalPage(reply, status, body.error)
    : reply.status(status).send(body)
}

/**
 * The route's `operationId` when the contract registered it (`registerRoutes` puts it in the
 * route's `config`); otherwise the method and the route's PATTERN — never the URL a caller sent,
 * which can carry a query — or `unmatched` when nothing matched.
 */
function operationOf(request: FastifyRequest): string {
  const options = request.routeOptions as
    { url?: string | undefined; config?: { operationId?: string } } | undefined
  return (
    options?.config?.operationId ?? `${request.method} ${options?.url ?? 'unmatched'}`
  )
}
