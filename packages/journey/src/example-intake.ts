import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
} from '@manifest/contract'

export type Describing =
  | {
      started: true
      intakeSessionId: string
      key: string
      baseUrl: string
      model: string
    }
  | { started: false; code: string; why: string }

/**
 * A person describing an app they have not created yet: a key for the platform's intake model,
 * which the platform pays for — cents and minutes, a few a day — started from the person's own
 * signed-in session, never a token. Use it to understand what they asked for and to propose
 * slugs (`checkSlug`); once the project exists, the work continues under an agent session.
 */
export async function startDescribing(
  origin: string,
  session: string,
): Promise<Describing> {
  const client = createManifestClient({ origin, session })
  try {
    const started = unwrap(
      await client.POST('/v1/intake-sessions', {
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
      return { started: false, code: error.code, why: error.message }
    throw error
  }
}

/** End it when the description is done; its key stops working from the next call. */
export async function stopDescribing(
  origin: string,
  session: string,
  intakeSessionId: string,
): Promise<string> {
  const client = createManifestClient({ origin, session })
  const ended = unwrap(
    await client.DELETE('/v1/intake-sessions/{intakeSessionId}', {
      params: {
        path: { intakeSessionId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'endIntakeSession',
  )
  return ended.state
}
