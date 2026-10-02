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
 * what to read before sending it, and the questions only the owner can answer.
 */
export async function draftTheAssessment(
  client: ManifestClient,
  projectId: string,
): Promise<{ generatedAt: string; forYouToAdd: string[] }> {
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
    forYouToAdd: draft.sections.flatMap((s) => s.gaps.map((gap) => `${s.title}: ${gap}`)),
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
 * *"I've sent it"* — the person says the draft went, on a day and with the ticket they were given.
 * BROWSER CODE: only the person who sent it can say so, in their own session, so `page` is the page's
 * own client — `createManifestClient({ origin: location.origin })` — which carries no credential,
 * because the person's browser sends their cookie and `Origin` itself. **Always name the draft read**
 * (`draftGeneratedAt`): a draft made again since is refused, never recorded as what was sent.
 */
export async function sayItWasSent(
  page: ManifestClient,
  projectId: string,
  record: 'privacy-assessment' | 'staging' | 'production',
  sent: { draftGeneratedAt: string; sentAt?: string; reference?: string },
): Promise<{ done: true; submittedAt: string } | Refused> {
  const params = { header: { 'Idempotency-Key': idempotencyKey() } }
  try {
    const answer =
      record === 'privacy-assessment'
        ? unwrap(
            await page.POST(
              '/v1/projects/{projectId}/launch-records/privacy-assessment/submission',
              { params: { ...params, path: { projectId } }, body: sent },
            ),
            'submitPrivacyAssessment',
          )
        : unwrap(
            await page.POST(
              '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/submission',
              {
                params: { ...params, path: { projectId, environment: record } },
                body: sent,
              },
            ),
            'submitIamRegistration',
          )
    return { done: true, submittedAt: answer.submittedAt! }
  } catch (error) {
    // UBC's order is held here: `LAUNCH_PIA_NOT_APPROVED`, `LAUNCH_STAGING_NOT_REGISTERED` — each
    // with what to send first.
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
 * as `sayItWasSent` is.
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
