import {
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type ManifestClient,
} from '@manifest/contract'

/** A refusal said as what to do next: its code, and the remedy the API gives with it. */
export type Refused = { done: false; refused: string; next: string }

const refusedBy = (error: unknown): Refused => {
  if (error instanceof ManifestApiError)
    return {
      done: false,
      refused: error.code,
      next: error.envelope?.error.hint ?? error.message,
    }
  throw error
}

/**
 * Draft the privacy assessment — the first of the three records, in UBC's order. A person's client,
 * or an agent's on a token holding `launch:draft`: drafting sends nothing anywhere. What comes back is
 * what to read before sending it, and the questions only the owner can answer — each by its gap's `id`,
 * which stays the same when the app is drafted again, so an answer kept for it still fits.
 */
export async function draftTheAssessment(
  client: ManifestClient,
  projectId: string,
): Promise<{ generatedAt: string; forYouToAdd: { gapId: string; asks: string }[] }> {
  const assessment = unwrap(
    await client.POST(
      '/v1/projects/{projectId}/launch-records/privacy-assessment/draft',
      {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      },
    ),
    'draftPrivacyAssessment',
  )
  const draft = assessment.draft!
  return {
    generatedAt: draft.generatedAt,
    forYouToAdd: draft.sections.flatMap((s) =>
      s.gaps.map((gap) => ({ gapId: gap.id, asks: `${s.title}: ${gap.text}` })),
    ),
  }
}

/**
 * Draft one environment's registration with UBC IAM — the package a person sends. Its `warnings` are
 * what to fix first (an attribute the app never reads, a missing PIA number); fix them and draft again.
 */
export async function draftARegistration(
  client: ManifestClient,
  projectId: string,
  environment: 'staging' | 'production',
): Promise<{ generatedAt: string; warnings: string[]; unread: string[] }> {
  const registration = unwrap(
    await client.POST(
      '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/draft',
      {
        params: {
          path: { projectId, environment },
          header: { 'Idempotency-Key': idempotencyKey() },
        },
      },
    ),
    'draftIamRegistration',
  )
  const sent = registration.package!
  return {
    generatedAt: sent.generatedAt,
    warnings: sent.warnings,
    unread: sent.attributes.filter((a) => a.unused).map((a) => a.name),
  }
}

/**
 * Send it to the Manifest team — who submit it to UBC, or hand it back with what to change. BROWSER CODE:
 * only a person sends it, in their own session, so `page` is the page's own client —
 * `createManifestClient({ origin: location.origin })` — which carries no credential, because the person's
 * browser sends their cookie and `Origin` itself. **Always name the draft read** (`draftGeneratedAt`): a
 * draft made again since is refused, never sent. **The privacy assessment carries an answer to every gap**,
 * by its id — *"does not apply"* is an answer; a gap left out is refused, naming it.
 */
export async function sendIt(
  page: ManifestClient,
  projectId: string,
  record: 'privacy-assessment' | 'staging' | 'production',
  sent: { draftGeneratedAt: string; answers?: { gapId: string; answer: string }[] },
): Promise<{ done: true; sentAt: string } | Refused> {
  const params = { header: { 'Idempotency-Key': idempotencyKey() } }
  try {
    const answer =
      record === 'privacy-assessment'
        ? unwrap(
            await page.POST(
              '/v1/projects/{projectId}/launch-records/privacy-assessment/send',
              {
                params: { ...params, path: { projectId } },
                body: {
                  draftGeneratedAt: sent.draftGeneratedAt,
                  answers: sent.answers ?? [],
                },
              },
            ),
            'sendPrivacyAssessment',
          )
        : unwrap(
            await page.POST(
              '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/send',
              {
                params: { ...params, path: { projectId, environment: record } },
                body: { draftGeneratedAt: sent.draftGeneratedAt },
              },
            ),
            'sendIamRegistration',
          )
    return { done: true, sentAt: answer.sentAt! }
  } catch (error) {
    // UBC's order is held here: `LAUNCH_PIA_NOT_APPROVED`, `LAUNCH_STAGING_NOT_REGISTERED` — each
    // with what to send first — and every gap answered: `LAUNCH_GAP_ANSWERS_INVALID`.
    return refusedBy(error)
  }
}

/**
 * The Manifest team submitted it to UBC — an administrator's record, in their own session, of the day
 * the team sent it (today when absent) and UBC's reference: IAM's ticket, or the PIA number. BROWSER CODE,
 * the administrator's page. Only what its owner sent the team is submitted.
 */
export async function teamSubmitted(
  admin: ManifestClient,
  projectId: string,
  record: 'privacy-assessment' | 'staging' | 'production',
  submitted: { reference: string; sentAt?: string },
): Promise<{ done: true; submittedAt: string } | Refused> {
  const params = { header: { 'Idempotency-Key': idempotencyKey() } }
  try {
    const answer =
      record === 'privacy-assessment'
        ? unwrap(
            await admin.POST(
              '/v1/projects/{projectId}/launch-records/privacy-assessment/submission',
              { params: { ...params, path: { projectId } }, body: submitted },
            ),
            'submitPrivacyAssessment',
          )
        : unwrap(
            await admin.POST(
              '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/submission',
              {
                params: { ...params, path: { projectId, environment: record } },
                body: submitted,
              },
            ),
            'submitIamRegistration',
          )
    return { done: true, submittedAt: answer.submittedAt! }
  } catch (error) {
    // `LAUNCH_TRANSITION_INVALID` when the team does not hold it; `LAUNCH_SENT_AT_INVALID` for a day
    // that cannot be true.
    return refusedBy(error)
  }
}

/**
 * Ask an administrator to sign off the release serving staging. A person's client, or an agent's on a
 * token holding `approval:request` — asking decides nothing. The note is for administrators alone.
 */
export async function askForSignOff(
  client: ManifestClient,
  releaseId: string,
  note?: string,
): Promise<{ done: true; askedAt: string; open: boolean } | Refused> {
  try {
    const request = unwrap(
      await client.POST('/v1/releases/{releaseId}/approval-request', {
        params: { path: { releaseId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: note === undefined ? {} : { note },
      }),
      'requestApproval',
    )
    return { done: true, askedAt: request.createdAt, open: request.open }
  } catch (error) {
    // Nothing to ask for (`APPROVAL_NOT_NEEDED`), or a rejection, final for that release.
    return refusedBy(error)
  }
}

/**
 * What waits on the administrators, oldest first — an administrator's own session only. BROWSER CODE,
 * as `sendIt` is.
 */
export async function whatWaitsOnUs(
  page: ManifestClient,
): Promise<{ oldestSince: string | null; items: { kind: string; project: string }[] }> {
  const queue = unwrap(await page.GET('/v1/queue'), 'listQueue')
  return {
    oldestSince: queue.oldestSince,
    items: queue.items.map((i) => ({ kind: i.kind, project: i.project.slug })),
  }
}
