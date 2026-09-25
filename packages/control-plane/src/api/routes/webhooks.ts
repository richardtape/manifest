import { and, count, eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { appSpecs, webhookDeliveries } from '../../db/index.js'
import { projectForRepository, repositoryOf } from '../../projects/index.js'
import type { ServerDeps } from '../server.js'
import { validateAndRecord } from '../spec-validation.js'
import { verifySignature } from '../webhook-signature.js'

/**
 * `POST /webhooks/github` — GITHUB'S DELIVERIES (D5 driver 2; the D5 plan's Task 9). Its
 * caller is GitHub, never a Manifest client, and its credential is the delivery's HMAC
 * signature (§20: *"Webhook payloads verified by HMAC before any processing"*). Unversioned
 * (`api/unversioned.ts` says why), and reached at `127.0.0.1:7100` directly — as the edge
 * itself reaches the control plane — never through the edge, which forwards only `/v1/*` and
 * `/auth/*` (Decision 8).
 *
 * THE ORDER IS THE CONTROL (Decision 9): the body's size (Fastify, this plugin's own limit) →
 * exactly one `X-Hub-Signature-256` → its shape → the HMAC over the RAW bytes → **only then**
 * parse → record the delivery ONCE → act. A delivery is processed OFF the request, one at a
 * time across the process (`deps.sourceSync`): GitHub gives a delivery ten seconds, and a sync
 * is a fetch, a scan and a validation (Decision 10). **A push is synced and validated, never
 * built.**
 *
 * **Refusals are REPLIED, not thrown**: `server.ts`'s error handler answers any error whose
 * status is `401` as the generic `UNAUTHENTICATED`, and four refusals collapsing into one code
 * is exactly how deleting the absent-signature branch would leave every test green.
 */

const REFUSALS = {
  missing: {
    code: 'WEBHOOK_SIGNATURE_MISSING',
    message: 'the delivery carries no X-Hub-Signature-256',
    hint: 'GitHub signs every delivery when the App has a webhook secret; an unsigned request is not from GitHub. The legacy SHA-1 X-Hub-Signature is never accepted on its own.',
  },
  malformed: {
    code: 'WEBHOOK_SIGNATURE_MALFORMED',
    message:
      'X-Hub-Signature-256 is not exactly one sha256= and 64 lowercase hex characters',
  },
  invalid: {
    code: 'WEBHOOK_SIGNATURE_INVALID',
    message:
      'X-Hub-Signature-256 does not match this body under the App’s webhook secret',
    hint: 'The App’s webhook secret and the control plane’s (MANIFEST_GITHUB_WEBHOOK_SECRET) must be the same.',
  },
} as const

interface GithubPayload {
  action?: unknown
  /** A push's branch — read AFTER verification, to know that `main` moved (Important 2). */
  ref?: unknown
  repository?: { full_name?: unknown }
}

export interface WebhookRouteDeps {
  server: ServerDeps
  /** `undefined` on driver 1, which receives no webhooks — every delivery is then `404`. */
  secret: Buffer | undefined
}

export const webhookRoutes =
  ({ server: deps, secret }: WebhookRouteDeps): FastifyPluginAsync =>
  async (app) => {
    // A RAW body, in THIS plugin only (the plan's Read this first 7): the HMAC is over the
    // bytes GitHub sent, and a re-serialised object is not those bytes. Every other route
    // keeps the parsed JSON and the API's 1 MiB limit.
    //
    // **EVERY inherited parser goes, not only JSON's** (sitting 5, measured): the root server
    // parses `application/x-www-form-urlencoded` for the registry token realm, this plugin
    // inherited it, and a form-encoded delivery — a content type a GitHub App's webhook can be
    // registered with — reached the handler as an OBJECT and crashed the HMAC: `500 INTERNAL`.
    // `[M9]` measured `415` on a bare Fastify, which has no such parser. Now exactly one
    // content type is read here, and anything else is Fastify's `415`, before any check.
    app.removeAllContentTypeParsers()
    app.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_r, body, done) => done(null, body),
    )

    app.post(
      '/webhooks/github',
      {
        // Decision 8: the receiver reads four fields; a 413 costs a webhook's latency and
        // nothing else, because the next sync from any read fetches the same commits.
        bodyLimit: 5 * 1024 * 1024,
        // Read this first 19: GitHub sends no Origin and no Idempotency-Key.
        config: { csrf: 'exempt', idempotency: 'exempt' },
      },
      async (request, reply) => {
        const refuse = (
          status: number,
          error: { code: string; message: string; hint?: string },
        ) => reply.status(status).send({ error })
        if (secret === undefined) {
          return refuse(404, {
            code: 'WEBHOOKS_NOT_CONFIGURED',
            message:
              'this control plane runs the local source driver, which receives no webhooks',
            hint: 'Restart it with MANIFEST_SOURCE_DRIVER=github to receive GitHub’s deliveries.',
          })
        }
        const body = request.body as Buffer
        const verdict = verifySignature(
          secret,
          body,
          request.headers['x-hub-signature-256'],
        )
        if (verdict !== 'valid') return refuse(401, REFUSALS[verdict])
        // ── nothing above this line reads the body's CONTENT ──
        let payload: GithubPayload
        try {
          payload = JSON.parse(body.toString('utf8')) as GithubPayload
        } catch {
          return refuse(400, {
            code: 'WEBHOOK_PAYLOAD_INVALID',
            message: 'the signed body is not JSON',
          })
        }
        const deliveryId = request.headers['x-github-delivery']
        const event = request.headers['x-github-event']
        if (
          typeof deliveryId !== 'string' ||
          !/^[0-9a-f-]{36}$/.test(deliveryId) ||
          typeof event !== 'string' ||
          payload === null ||
          typeof payload !== 'object'
        ) {
          return refuse(400, {
            code: 'WEBHOOK_PAYLOAD_INVALID',
            message:
              'a delivery needs X-GitHub-Delivery, X-GitHub-Event and a JSON object',
          })
        }
        // ONCE (Decision 10): a repeat of an id already recorded changes nothing.
        const recorded = await deps.db
          .insert(webhookDeliveries)
          .values({ deliveryId, event })
          .onConflictDoNothing()
          .returning({ deliveryId: webhookDeliveries.deliveryId })
        if (recorded.length === 0) return reply.status(200).send({ duplicate: true })
        if (event === 'ping') return reply.status(200).send({ pong: true })
        const fullName = payload.repository?.full_name
        const project =
          typeof fullName === 'string'
            ? await projectForRepository(deps.db, 'github', fullName)
            : undefined
        if (project === undefined) {
          return reply.status(202).send({ ignored: 'unknown repository' })
        }
        if (
          event === 'push' ||
          (event === 'repository' && payload.action === 'publicized')
        ) {
          deps.sourceSync.enqueue(`webhook ${event} ${project.slug} ${deliveryId}`, () =>
            processDelivery(deps, project, event, payload.ref === 'refs/heads/main'),
          )
          return reply.status(202).send({ queued: true })
        }
        return reply.status(202).send({ ignored: event })
      },
    )
  }

/**
 * OFF THE REQUEST, one job at a time: the sync — which reports every branch that moved to the
 * ONE observer (Decision 11), so this does not publish `repository.pushed` itself — and, for a
 * push whose `main` moved on GitHub, a validation of GitHub's new `main`. **A rewrite moves
 * GitHub's `main` too**: the mirror's history refused it, and `headCommit` answers it, so it is
 * validated like any other head (`[M14]`: what moved is the SHADOW's `main`).
 */
async function processDelivery(
  deps: ServerDeps,
  project: { id: string; slug: string; quota: unknown },
  event: string,
  mainPushed: boolean,
): Promise<void> {
  const repo = await repositoryOf(deps, project)
  const advance = await deps.source.sync(repo)
  if (event !== 'push') return
  const main =
    advance.updated.find((u) => u.ref === 'refs/heads/main')?.to ??
    advance.rewritten.find((r) => r.ref === 'refs/heads/main')?.upstream
  if (main !== undefined) {
    await validateAndRecord(deps, project, main)
    return
  }
  // A READ'S SYNC CAN TAKE A PUSH'S ADVANCE BEFORE ITS DELIVERY LANDS (the plan's final review,
  // Important 2; sitting 5's F9): the console asking for HEAD in the seconds after a push, and
  // this sync then moves nothing. `main` moved on GitHub all the same, so GitHub's `main` NOW
  // is validated unless it already has been — NOW, not the payload's `after`, because a late
  // delivery of an older push must never record an older commit as the newest validation.
  if (!mainPushed) return
  const head = await deps.source.headCommit(repo)
  const [recorded] = await deps.db
    .select({ n: count() })
    .from(appSpecs)
    .where(and(eq(appSpecs.projectId, project.id), eq(appSpecs.commitSha, head)))
  if (recorded!.n === 0) await validateAndRecord(deps, project, head)
}
