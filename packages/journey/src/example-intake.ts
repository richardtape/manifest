import {
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type ManifestClient,
} from '@manifest/contract'

export type Describing =
  | {
      started: true
      intakeSessionId: string
      key: string
      baseUrl: string
      model: string
    }
  | { started: false; code: string; why: string; until: string | null }

/**
 * A person describing an app they have not created yet: a key for the platform's intake model,
 * which the platform pays for — cents and minutes, a few a day. BROWSER CODE: it acts as the
 * person, so it runs in their browser on the page's own client — `createManifestClient({ origin:
 * location.origin })`, which carries no credential, because the browser sends the person's cookie
 * and `Origin` itself. Never a token, and never your server replaying the cookie. If your server
 * runs the intake agent, hand it the key over your own channel, as you hand it a token. Use the
 * key to understand what the person asked for and to propose slugs (`checkSlug`); once the
 * project exists, the work continues under an agent session.
 */
export async function startDescribing(page: ManifestClient): Promise<Describing> {
  try {
    const started = unwrap(
      await page.POST('/v1/intake-sessions', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
      }),
      'startIntakeSession',
    )
    return {
      started: true,
      intakeSessionId: started.session.id,
      key: started.key,
      baseUrl: started.baseUrl,
      // One model, the platform's: use the name it answers.
      model: started.session.model,
    }
  } catch (error) {
    // Paused — for this person until tomorrow, or for everyone until the month resets. Say so.
    if (
      error instanceof ManifestApiError &&
      (error.code === 'INTAKE_DAILY_LIMIT_REACHED' ||
        error.code === 'INTAKE_BUDGET_EXHAUSTED')
    )
      // The platform's own sentence, for a person — not the client's "… failed with 409 …".
      return {
        started: false,
        code: error.code,
        why: error.envelope?.error.message ?? error.message,
        // When it lifts — tomorrow in Vancouver, or the month's reset — from the refusal's `limit`.
        until: error.envelope?.error.limit?.resetsAt ?? null,
      }
    throw error
  }
}

/** End it when the description is done; its key stops working from the next call. */
export async function stopDescribing(
  page: ManifestClient,
  intakeSessionId: string,
): Promise<string> {
  const ended = unwrap(
    await page.DELETE('/v1/intake-sessions/{intakeSessionId}', {
      params: {
        path: { intakeSessionId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'endIntakeSession',
  )
  return ended.state
}
