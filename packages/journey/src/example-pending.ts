import {
  createManifestClient,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

/**
 * A privileged request from a token — production, reading a secret, a quota, members — is
 * answered `403 TOKEN_ACTION_PENDING`, and the envelope carries the question a person must
 * answer. This is the question, or undefined for any other refusal.
 */
export function pendingActionOf(error: unknown): Schemas['PendingAction'] | undefined {
  if (!(error instanceof ManifestApiError) || error.code !== 'TOKEN_ACTION_PENDING')
    return undefined
  return error.envelope?.error.pendingAction
}

/**
 * Wait for the person, then say what to do. `confirmed` lets the identical request — the same
 * method, path and body, from this token — through ONCE, whatever its Idempotency-Key; `rejected` is final and
 * `pendingAction.reason` says why; `expired` means it ended unanswered — nobody answered in time,
 * or this token was revoked first. Never retry a pending request on a loop: it asks the person
 * again.
 */
export async function waitForAPerson(
  origin: string,
  token: string,
  pendingActionId: string,
  options: { everyMs: number; forMs: number },
): Promise<Schemas['PendingAction']> {
  const client = createManifestClient({ origin, token })
  const until = Date.now() + options.forMs
  for (;;) {
    const action = unwrap(
      await client.GET('/v1/pending-actions/{pendingActionId}', {
        params: { path: { pendingActionId } },
      }),
      'getPendingAction',
    )
    if (action.state !== 'pending' || Date.now() >= until) return action
    await new Promise((resolve) => setTimeout(resolve, options.everyMs))
  }
}
