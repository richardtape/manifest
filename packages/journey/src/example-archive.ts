import {
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type ManifestClient,
} from '@manifest/contract'

export type Ending =
  | { done: true; state: string }
  /** Send the person's browser here; they sign in again, come back, and ask again. */
  | { done: false; stepUpAt: string }
  | { done: false; refused: string; next: string }

const stepUp = (returnTo: string): Ending => ({
  done: false,
  stepUpAt: `/auth/step-up?returnTo=${encodeURIComponent(returnTo)}`,
})

/**
 * Switch an app off for everyone, keeping its code, data and secrets — at the end of a course.
 * The owner's or an administrator's, signed in again within ten minutes (step-up); never a
 * token's. Its tokens are revoked and its agent sessions end with it. BROWSER CODE, like every
 * function here: `page` is the page's own client — `createManifestClient({ origin:
 * location.origin })` — which carries no credential, because the person's browser sends their
 * cookie and `Origin` itself. Your server never does this with the person's cookie.
 */
export async function switchOff(
  page: ManifestClient,
  projectId: string,
  returnTo: string,
): Promise<Ending> {
  try {
    const project = unwrap(
      await page.POST('/v1/projects/{projectId}/archive', {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: {},
      }),
      'archiveProject',
    )
    return { done: true, state: project.state }
  } catch (error) {
    if (error instanceof ManifestApiError && error.code === 'STEP_UP_REQUIRED')
      return stepUp(returnTo)
    throw error
  }
}

/** Bring it back: nothing starts until its next deploy. No step-up — it takes nothing away. */
export async function bringBack(
  page: ManifestClient,
  projectId: string,
): Promise<Ending> {
  const project = unwrap(
    await page.POST('/v1/projects/{projectId}/restore', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {},
    }),
    'restoreProject',
  )
  return { done: true, state: project.state }
}

/**
 * Delete an app that never launched — a trial, or a mistake — for good: its repository, data,
 * secrets and model budgets destroyed, its slug free again. A launched app is never deleted by
 * its owner: switch it off instead. A delete that stops part way is FINISHED by sending the
 * same request again — the same Idempotency-Key — and never restored.
 */
export async function deleteForGood(
  page: ManifestClient,
  projectId: string,
  returnTo: string,
): Promise<Ending> {
  const key = idempotencyKey()
  for (let attempt = 1; ; attempt++) {
    try {
      const deleted = unwrap(
        // A bodyless DELETE: the generated client sends no Content-Type, as the API requires.
        await page.DELETE('/v1/projects/{projectId}', {
          params: { path: { projectId }, header: { 'Idempotency-Key': key } },
        }),
        'deleteProject',
      )
      return { done: true, state: deleted.state }
    } catch (error) {
      if (!(error instanceof ManifestApiError)) throw error
      if (error.code === 'STEP_UP_REQUIRED') return stepUp(returnTo)
      if (error.code === 'PROJECT_TEARDOWN_INCOMPLETE' && attempt < 3) continue
      if (error.code === 'PROJECT_TEARDOWN_INCOMPLETE')
        return {
          done: false,
          refused: error.code,
          next: 'It keeps stopping at the same step: tell a platform administrator. Do not restore it.',
        }
      if (error.code === 'PROJECT_LAUNCHED_NOT_DELETABLE')
        return {
          done: false,
          refused: error.code,
          next: 'It has been to production, so it is kept. Switch it off instead (archiveProject).',
        }
      throw error
    }
  }
}
