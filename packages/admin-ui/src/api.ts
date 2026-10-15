import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

/**
 * THE ONE PLACE THE ADMINISTRATOR'S CONSOLE CALLS THE API (§26, D22, D31) — the reference console's
 * frame (`packages/console/src/api.ts`), cut to the operations this console reads and decides with.
 * A screen calls these functions and never holds the client; `origin` is a parameter, so the
 * browser passes its own and a test passes the mock's.
 *
 * EVERY MUTATION TAKES ITS `Idempotency-Key` FROM THE CALLER (D23.6): made once per operator ACTION
 * with `newKey()` and reused if that action is retried — a key made here, per call, would let a
 * double-click or a retry after a lost answer record a second decision.
 *
 * `unwrap` throws a `ManifestApiError` carrying D23.7's envelope; `<Refusal>` renders it.
 */
export interface ApiOptions {
  origin: string
  /** For a NODE caller only. A browser sends its own cookie and its own Origin. */
  session?: string
  /**
   * §26's reason, sent as `Manifest-Admin-Reason` (percent-encoded UTF-8) on every non-GET when it
   * answers one. Of this console's operations only `rejectPendingAction` carries the header; an
   * administrator's own duties — a sign-off, the team's step, UBC's answer — do not.
   */
  adminReason?: () => string | null
}

export type Api = ReturnType<typeof createApi>

/** D23.6's header in the one shape `openapi-fetch` takes. */
const key = (k: string) => ({ header: { 'Idempotency-Key': k } })

export function createApi(options: ApiOptions) {
  const client = createManifestClient(options)
  const reasonOf = options.adminReason
  if (reasonOf !== undefined)
    client.use({
      onRequest({ request }) {
        const reason = request.method === 'GET' ? null : reasonOf()?.trim()
        if (reason !== null && reason !== undefined && reason !== '')
          request.headers.set('Manifest-Admin-Reason', encodeURIComponent(reason))
        return request
      },
    })

  return {
    /** The idempotency key for one operator action; hold it and reuse it on a retry. */
    newKey: idempotencyKey,

    async getMe(): Promise<Schemas['Me']> {
      return unwrap(await client.GET('/v1/me'), 'getMe')
    },

    /** §26's queue: everything waiting on an administrator, oldest first, at most 200. */
    async listQueue(): Promise<Schemas['Queue']> {
      return unwrap(await client.GET('/v1/queue'), 'listQueue')
    },

    async listFleet(): Promise<Schemas['Fleet']> {
      return unwrap(await client.GET('/v1/fleet'), 'listFleet')
    },

    async listBlueprints(): Promise<Schemas['BlueprintList']> {
      return unwrap(await client.GET('/v1/blueprints'), 'listBlueprints')
    },

    async getProject(projectId: string): Promise<Schemas['Project']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}', {
          params: { path: { projectId }, query: { expand: 'environments' } },
        }),
        'getProject',
      )
    },

    async listEnvironments(projectId: string): Promise<Schemas['EnvironmentList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/environments', {
          params: { path: { projectId } },
        }),
        'listEnvironments',
      )
    },

    async listInstances(environmentId: string): Promise<Schemas['InstanceList']> {
      return unwrap(
        await client.GET('/v1/environments/{environmentId}/instances', {
          params: { path: { environmentId } },
        }),
        'listInstances',
      )
    },

    async listIncidents(environmentId: string): Promise<Schemas['IncidentList']> {
      return unwrap(
        await client.GET('/v1/environments/{environmentId}/incidents', {
          params: { path: { environmentId } },
        }),
        'listIncidents',
      )
    },

    async listReleases(projectId: string): Promise<Schemas['ReleaseList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/releases', {
          params: { path: { projectId } },
        }),
        'listReleases',
      )
    },

    async getRelease(releaseId: string): Promise<Schemas['Release']> {
      return unwrap(
        await client.GET('/v1/releases/{releaseId}', { params: { path: { releaseId } } }),
        'getRelease',
      )
    },

    async getLaunchReadiness(projectId: string): Promise<Schemas['LaunchReadiness']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/launch-readiness', {
          params: { path: { projectId } },
        }),
        'getLaunchReadiness',
      )
    },

    async getLaunchRecords(projectId: string): Promise<Schemas['LaunchRecords']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/launch-records', {
          params: { path: { projectId } },
        }),
        'getLaunchRecords',
      )
    },

    async listMembers(projectId: string): Promise<Schemas['MemberList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/members', {
          params: { path: { projectId } },
        }),
        'listMembers',
      )
    },

    async listTokens(projectId: string): Promise<Schemas['TokenList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/tokens', {
          params: { path: { projectId } },
        }),
        'listTokens',
      )
    },

    async listPendingActions(projectId: string): Promise<Schemas['PendingActionList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/pending-actions', {
          params: { path: { projectId } },
        }),
        'listPendingActions',
      )
    },

    async listAgentSessions(projectId: string): Promise<Schemas['AgentSessionList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/agent-sessions', {
          params: { path: { projectId } },
        }),
        'listAgentSessions',
      )
    },

    /**
     * THE NEWEST DECISION ON A RELEASE, OR `null` WHEN NOBODY HAS DECIDED. The platform answers that
     * case `404 NOT_FOUND`, which is not a failure for a console about to decide it — and only that
     * case: every other refusal (an ended session's `401`, a `5xx`) is thrown, so it reaches
     * `<Refusal>` or the sign-in round trip rather than reading as "nobody has decided".
     */
    async getApproval(releaseId: string): Promise<Schemas['Approval'] | null> {
      try {
        return unwrap(
          await client.GET('/v1/releases/{releaseId}/approval', {
            params: { path: { releaseId } },
          }),
          'getApproval',
        )
      } catch (error) {
        if (
          error instanceof ManifestApiError &&
          error.status === 404 &&
          error.code === 'NOT_FOUND'
        )
          return null
        throw error
      }
    },

    async createApprovalPreview(
      releaseId: string,
      idempotency: string,
    ): Promise<Schemas['ApprovalPreview']> {
      return unwrap(
        await client.POST('/v1/releases/{releaseId}/approval-preview', {
          params: { path: { releaseId }, ...key(idempotency) },
        }),
        'createApprovalPreview',
      )
    },

    async getApprovalPreview(
      releaseId: string,
      previewId: string,
    ): Promise<Schemas['ApprovalPreview']> {
      return unwrap(
        await client.GET('/v1/releases/{releaseId}/approval-previews/{previewId}', {
          params: { path: { releaseId, previewId } },
        }),
        'getApprovalPreview',
      )
    },

    async approveRelease(
      releaseId: string,
      body: Schemas['ApproveReleaseRequest'],
      idempotency: string,
    ): Promise<Schemas['Approval']> {
      return unwrap(
        await client.POST('/v1/releases/{releaseId}/approve', {
          params: { path: { releaseId }, ...key(idempotency) },
          body,
        }),
        'approveRelease',
      )
    },

    async rejectRelease(
      releaseId: string,
      body: Schemas['RejectReleaseRequest'],
      idempotency: string,
    ): Promise<Schemas['Approval']> {
      return unwrap(
        await client.POST('/v1/releases/{releaseId}/reject', {
          params: { path: { releaseId }, ...key(idempotency) },
          body,
        }),
        'rejectRelease',
      )
    },

    /** The Manifest team's step: a registration sent to it goes on to UBC IAM, with UBC's reference. */
    async submitIamRegistration(
      projectId: string,
      environment: 'staging' | 'production',
      body: Schemas['RecordSubmissionRequest'],
      idempotency: string,
    ): Promise<Schemas['IamRegistration']> {
      return unwrap(
        await client.POST(
          '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/submission',
          { params: { path: { projectId, environment }, ...key(idempotency) }, body },
        ),
        'submitIamRegistration',
      )
    },

    /** Bodyless: why it came back travels outside the record. */
    async returnIamRegistration(
      projectId: string,
      environment: 'staging' | 'production',
      idempotency: string,
    ): Promise<Schemas['IamRegistration']> {
      return unwrap(
        await client.POST(
          '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/return',
          { params: { path: { projectId, environment }, ...key(idempotency) } },
        ),
        'returnIamRegistration',
      )
    },

    async submitPrivacyAssessment(
      projectId: string,
      body: Schemas['RecordSubmissionRequest'],
      idempotency: string,
    ): Promise<Schemas['PrivacyAssessment']> {
      return unwrap(
        await client.POST(
          '/v1/projects/{projectId}/launch-records/privacy-assessment/submission',
          { params: { path: { projectId }, ...key(idempotency) }, body },
        ),
        'submitPrivacyAssessment',
      )
    },

    async returnPrivacyAssessment(
      projectId: string,
      idempotency: string,
    ): Promise<Schemas['PrivacyAssessment']> {
      return unwrap(
        await client.POST(
          '/v1/projects/{projectId}/launch-records/privacy-assessment/return',
          { params: { path: { projectId }, ...key(idempotency) } },
        ),
        'returnPrivacyAssessment',
      )
    },

    /** UBC's answer, recorded: the body is what the operation REQUIRES (the plan's C1). */
    async recordIamRegistration(
      projectId: string,
      body: Schemas['RecordIamRegistrationRequest'],
      idempotency: string,
    ): Promise<Schemas['IamRegistration']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/launch-records/iam-registration', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'recordIamRegistration',
      )
    },

    async recordPrivacyAssessment(
      projectId: string,
      body: Schemas['RecordPrivacyAssessmentRequest'],
      idempotency: string,
    ): Promise<Schemas['PrivacyAssessment']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/launch-records/privacy-assessment', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'recordPrivacyAssessment',
      )
    },

    /** An agent's question, rejected — the one owner's-side act this console has (Decision 10). */
    async rejectPendingAction(
      pendingActionId: string,
      body: Schemas['RejectPendingActionRequest'],
      idempotency: string,
    ): Promise<Schemas['PendingAction']> {
      return unwrap(
        await client.POST('/v1/pending-actions/{pendingActionId}/reject', {
          params: { path: { pendingActionId }, ...key(idempotency) },
          body,
        }),
        'rejectPendingAction',
      )
    },
  }
}
