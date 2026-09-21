import {
  createManifestClient,
  idempotencyKey,
  unwrap,
  type Schemas,
} from '@manifest/contract'

/**
 * THE ONE PLACE THE CONSOLE CALLS THE API (D22, Decision 6). Components call these
 * functions and never hold the client, which is what makes three things checkable at once:
 * coverage.test.ts reads this file to answer "is the API complete?"; api.test.ts drives
 * these functions against manifest-mock in Node with no DOM; and `origin` is a parameter,
 * so the browser passes its own and a test passes the mock's.
 *
 * EVERY MUTATION TAKES ITS `Idempotency-Key` FROM THE CALLER (D23.6). The key is made once
 * per user ACTION with `newKey()` and reused if that action is retried — a key made here,
 * per call, would defeat the whole control.
 *
 * `unwrap` throws a `ManifestApiError` carrying D23.7's envelope; `<Refusal>` is the one
 * thing that renders it.
 */
export interface ApiOptions {
  origin: string
  /** For a NODE caller only. A browser sends its own cookie and its own Origin. */
  session?: string
}

export type Api = ReturnType<typeof createApi>

/**
 * D23.6's header in the one shape `openapi-fetch` takes. Added by Task 5 rather than by
 * Task 4, which had no mutation to call it: `pnpm lint` refuses a dead local outright
 * (`'key' is assigned a value but never used`), and the control-plane override that
 * forgives a `_` prefix is scoped to `packages/control-plane/src/**` and does not reach
 * here. A helper with no call site is not built — this plan's Global Constraints, and the
 * lesson ORIENTATION §9 names four times.
 */
const key = (k: string) => ({ header: { 'Idempotency-Key': k } })

export function createApi(options: ApiOptions) {
  const client = createManifestClient(options)

  return {
    /** The idempotency key for one user action; hold it and reuse it on a retry. */
    newKey: idempotencyKey,

    async getMe(): Promise<Schemas['Me']> {
      return unwrap(await client.GET('/v1/me'), 'getMe')
    },

    async listProjects(): Promise<Schemas['ProjectList']> {
      return unwrap(await client.GET('/v1/projects'), 'listProjects')
    },

    /**
     * THE KEY IS AN ARGUMENT, NOT MADE HERE (D23.6): the create form makes one when it is
     * first submitted and reuses it if the person clicks again, so a double-click cannot
     * create two projects. A key made inside this function would be a new key per call,
     * which is the defect the header exists to prevent.
     */
    async createProject(
      body: Schemas['CreateProjectRequest'],
      idempotency: string,
    ): Promise<Schemas['CreatedProject']> {
      return unwrap(
        await client.POST('/v1/projects', { params: key(idempotency), body }),
        'createProject',
      )
    },

    async checkSlug(slug: string): Promise<Schemas['SlugCheck']> {
      return unwrap(
        await client.GET('/v1/slugs/{slug}', { params: { path: { slug } } }),
        'checkSlug',
      )
    },

    async listBlueprints(): Promise<Schemas['BlueprintList']> {
      return unwrap(await client.GET('/v1/blueprints'), 'listBlueprints')
    },

    async getBlueprint(blueprintRef: string): Promise<Schemas['Blueprint']> {
      return unwrap(
        await client.GET('/v1/blueprints/{blueprintRef}', {
          params: { path: { blueprintRef } },
        }),
        'getBlueprint',
      )
    },

    async getKnowledgePack(blueprintRef: string): Promise<Schemas['KnowledgePack']> {
      return unwrap(
        await client.GET('/v1/blueprints/{blueprintRef}/knowledge-pack', {
          params: { path: { blueprintRef } },
        }),
        'getKnowledgePack',
      )
    },

    /**
     * `?expand=environments` is D23.1's one expansion, and the project screen always wants
     * it: §23's three hostnames are what a person came to see.
     */
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

    async getEnvironment(environmentId: string): Promise<Schemas['Environment']> {
      return unwrap(
        await client.GET('/v1/environments/{environmentId}', {
          params: { path: { environmentId } },
        }),
        'getEnvironment',
      )
    },

    async getSpec(projectId: string): Promise<Schemas['Spec']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/spec', {
          params: { path: { projectId } },
        }),
        'getSpec',
      )
    },

    /** Re-reads `manifest.yaml` at the repository's HEAD and validates it (§7). */
    async validateSpec(
      projectId: string,
      idempotency: string,
    ): Promise<Schemas['SpecValidation']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/spec', {
          params: { path: { projectId }, ...key(idempotency) },
          body: {},
        }),
        'validateSpec',
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

    /**
     * `400 MEMBER_USER_NOT_FOUND` for anybody who has never signed in — the honest
     * behaviour, and what `<Refusal>` shows. §13's `members:manage` is D24's privileged
     * capability, so an AGENT asking this is the question Task 11's queue renders.
     */
    async addMember(
      projectId: string,
      body: Schemas['AddMemberRequest'],
      idempotency: string,
    ): Promise<Schemas['Member']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/members', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'addMember',
      )
    },

    async removeMember(
      projectId: string,
      userId: string,
      idempotency: string,
    ): Promise<Schemas['MemberList']> {
      return unwrap(
        await client.DELETE('/v1/projects/{projectId}/members/{userId}', {
          params: { path: { projectId, userId }, ...key(idempotency) },
        }),
        'removeMember',
      )
    },

    /**
     * ANSWERS `202` WITH THE BUILD `running` — THE ANSWER THAT ARRIVED IS NOT THE ANSWER
     * (Rich's R6, P5a Task 13). The build ENDS as a `build.succeeded` or `build.failed`
     * event on the project's stream; nothing here waits for it and no caller may treat
     * this reply's `status` as final.
     *
     * `StartBuildRequest` is `{ commitSha?: string }` with nothing required — but `{}` does
     * NOT mean the repository's HEAD: the route reads `body.commitSha ?? spec.commitSha`,
     * so it builds the commit of the last VALIDATED manifest. Measured, because the field's
     * name invites the other reading and the plan states it (Task 7's correction block).
     */
    async startBuild(
      projectId: string,
      body: Schemas['StartBuildRequest'],
      idempotency: string,
    ): Promise<Schemas['Build']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/builds', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'startBuild',
      )
    },

    /** The newest 50 (P5a Task 13). */
    async listBuilds(projectId: string): Promise<Schemas['BuildList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/builds', {
          params: { path: { projectId } },
        }),
        'listBuilds',
      )
    },

    async getBuild(buildId: string): Promise<Schemas['Build']> {
      return unwrap(
        await client.GET('/v1/builds/{buildId}', { params: { path: { buildId } } }),
        'getBuild',
      )
    },

    /**
     * THE ONLY SOURCE OF LINES WRITTEN BEFORE THE SOCKET OPENED. `LogFrame` says so in the
     * document — *"Never replayed — GET /v1/builds/{buildId}/logs has them all"* — and
     * `recentFramesFor` confirms it: the replay reads the `events` table, which holds no
     * log line at all. So a screen opened mid-build that consumes only the stream shows a
     * log starting in the middle, and this read is what makes it whole.
     *
     * `tail` is the LAST n lines and is OPTIONAL (`required: false` in the document); the
     * stream carries everything written after the socket opened. `exactOptionalPropertyTypes`
     * is why the query is spread conditionally rather than passed as `undefined`.
     */
    async getBuildLog(buildId: string, tail?: number): Promise<Schemas['BuildLog']> {
      return unwrap(
        await client.GET('/v1/builds/{buildId}/logs', {
          params: {
            path: { buildId },
            ...(tail === undefined ? {} : { query: { tail } }),
          },
        }),
        'getBuildLog',
      )
    },

    /** `CreateReleaseRequest` is `{ buildId, summary? }`; `buildId` is required. */
    async createRelease(
      projectId: string,
      body: Schemas['CreateReleaseRequest'],
      idempotency: string,
    ): Promise<Schemas['Release']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/releases', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'createRelease',
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

    /**
     * ANSWERS ONCE THE INSTANCE SERVES OR HAS FAILED (D23.9's stated exception, P4c R3), so
     * this call can take tens of seconds and carries NO timeout: abandoning it in the client
     * would abandon a deploy that is still happening. **A deploy that never becomes ready is
     * a `200` whose `state` is `failed`**, with an Incident, and the previous instance keeps
     * serving (P4b Task 13) — so a caller switches on `Instance.state` and NEVER on the HTTP
     * status. `DeployRequest` is `{ releaseId }`, required.
     *
     * Only `listEnvironments` and `getEnvironment` above are shared with Task 6; this task
     * adds exactly this function and `listIncidents`.
     */
    async deploy(
      environmentId: string,
      body: Schemas['DeployRequest'],
      idempotency: string,
    ): Promise<Schemas['Instance']> {
      return unwrap(
        await client.POST('/v1/environments/{environmentId}/deploy', {
          params: { path: { environmentId }, ...key(idempotency) },
          body,
        }),
        'deploy',
      )
    },

    /** §14's Incident, shaped as a repair prompt: why it exited, which check failed, the diff since the last healthy release and the log tail. */
    async listIncidents(environmentId: string): Promise<Schemas['IncidentList']> {
      return unwrap(
        await client.GET('/v1/environments/{environmentId}/incidents', {
          params: { path: { environmentId } },
        }),
        'listIncidents',
      )
    },

    /**
     * §13's first-launch checklist, COMPUTED and never stored (P5a Task 15). `ready` is
     * `false` throughout Phase 1, honestly: every item but `scans` answers `not_built` and
     * names in `builtBy` the plan that builds it.
     *
     * THE PRODUCTION DEPLOY'S `409` CARRIES THE SAME BYTES. `mapError` parses the checklist
     * through this same representation, because zod emits an object's keys in SCHEMA order
     * and a hand-built body does not (P5a sitting 11, finding 1). So the screen and the
     * refusal must render through ONE component, and a difference between them is a finding
     * rather than a rendering detail.
     */
    async getLaunchReadiness(projectId: string): Promise<Schemas['LaunchReadiness']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/launch-readiness', {
          params: { path: { projectId } },
        }),
        'getLaunchReadiness',
      )
    },

    /**
     * §9's two external records as an administrator last recorded them — `null` for one
     * nobody has recorded. **Readable by anyone who may read the project** (`project:read`,
     * P6a Task 6): an owner must be able to see what UBC IAM and the Privacy Office said
     * about their app, because the checklist's `why` names those records and a person told
     * *"the registration is 'submitted'"* will want to see the ticket.
     */
    async getLaunchRecords(projectId: string): Promise<Schemas['LaunchRecords']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/launch-records', {
          params: { path: { projectId } },
        }),
        'getLaunchRecords',
      )
    },

    /**
     * WHAT UBC IAM SAID, recorded by a platform administrator in a browser (R1, Decision 4).
     * The state is reached along §9's arrows from wherever the record is — a first write
     * straight into `active` is refused `409 LAUNCH_TRANSITION_INVALID` — and the console
     * does not restate which arrows exist: it offers every state and renders the refusal.
     * `registeredAttributes` is what the TICKET lists, never what the app asks for.
     */
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

    /** The same shape over §9's three PIA states (`draft → submitted → approved`). */
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

    /**
     * D21's rehearsal as R2 redefines it: the candidate is deployed to its PRODUCTION
     * hostname on the public listener, its Service Provider registered with production
     * values, and one real CWL sign-in completed against the Manifest IdP. **~6 s against the
     * platform and instant against the mock**, so the caller shows a pending state.
     *
     * **`passed: false` IS A `200`** — a measurement that came out badly is not a request
     * error, and `evidence.reason` says which hop failed. A caller that switched on the HTTP
     * status would report a failed rehearsal as a success. BODYLESS, like `revokeToken`.
     */
    async runRehearsal(
      projectId: string,
      idempotency: string,
    ): Promise<Schemas['Rehearsal']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/rehearsal', {
          params: { path: { projectId }, ...key(idempotency) },
        }),
        'runRehearsal',
      )
    },

    /**
     * §13's APPROVAL. Interactive only, a platform administrator only, and behind §20's
     * step-up: a session that has not re-proved itself in the last ten minutes is refused
     * `403 STEP_UP_REQUIRED`, whose `<Refusal>` is the link that does it (P6a Tasks 9, 10).
     * It binds the BUILD's immutable digest and answers `201` with the diff it was made on.
     *
     * **THAT DIFF EXISTS ONLY FROM THIS CALL ON.** `buildDiffSnapshot` runs inside it, and
     * `getApproval` is `404` until somebody decides — so no client can show an administrator
     * the diff BEFORE they decide (P6a sitting 10). `reason` is optional here.
     */
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

    /** The same four guards; the reason is REQUIRED, because a refusal with no words in it
     *  is one nobody can act on (D23.7). */
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

    /**
     * The NEWEST decision, with the diff it was made on — readable by anyone who may read
     * the project, so an owner sees why their release was rejected in the administrator's
     * own words. **`404 NOT_FOUND` when nobody has decided**, which is also what a release
     * this person may not see answers; the screen reads the release first to tell them apart.
     */
    async getApproval(releaseId: string): Promise<Schemas['Approval']> {
      return unwrap(
        await client.GET('/v1/releases/{releaseId}/approval', {
          params: { path: { releaseId } },
        }),
        'getApproval',
      )
    },

    /** §26's fleet, administrators only — a non-administrator is `403`, not `404`: there is
     *  no tenant's resource to hide (P5a Task 16). */
    async listFleet(): Promise<Schemas['Fleet']> {
      return unwrap(await client.GET('/v1/fleet'), 'listFleet')
    },

    /**
     * THE ONE CALL IN THIS API THAT RETURNS A CREDENTIAL. `MintedToken.secret` exists on
     * this response and on no read schema at all (P5b Decision 11) — so the console shows
     * it once and can never fetch it again.
     *
     * Refused `400 TOKEN_CAPABILITY_FORBIDDEN` for any of D24's privileged four by name,
     * `403` for anything the minter does not hold themselves, and bounded at 365 days.
     */
    async mintToken(
      projectId: string,
      body: Schemas['MintTokenRequest'],
      idempotency: string,
    ): Promise<Schemas['MintedToken']> {
      return unwrap(
        await client.POST('/v1/projects/{projectId}/tokens', {
          params: { path: { projectId }, ...key(idempotency) },
          body,
        }),
        'mintToken',
      )
    },

    /** The PROJECT's tokens, not the caller's: a token a collaborator minted is here too. */
    async listTokens(projectId: string): Promise<Schemas['TokenList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/tokens', {
          params: { path: { projectId } },
        }),
        'listTokens',
      )
    },

    /**
     * Only the MINTER may revoke; everyone else gets the `404` an unknown id gets, so the
     * refusal cannot be used to learn which token ids exist.
     *
     * THE API'S FIRST BODYLESS MUTATION (P5b Task 3), which the contract layer could not
     * carry until `readsBody(route)` keyed on the schema rather than on the method.
     */
    async revokeToken(tokenId: string, idempotency: string): Promise<Schemas['Token']> {
      return unwrap(
        await client.DELETE('/v1/tokens/{tokenId}', {
          params: { path: { tokenId }, ...key(idempotency) },
        }),
        'revokeToken',
      )
    },

    /**
     * §26's queue. A SESSION that may read the project sees EVERY question on it; a TOKEN
     * sees only the ones it asked (P5b Task 8) — and the console is always the first, so
     * this call always returns the project's whole queue. Newest first
     * (`orderBy(desc(createdAt))`), every state and not only `pending`.
     */
    async listPendingActions(projectId: string): Promise<Schemas['PendingActionList']> {
      return unwrap(
        await client.GET('/v1/projects/{projectId}/pending-actions', {
          params: { path: { projectId } },
        }),
        'listPendingActions',
      )
    },

    /**
     * ONE question, re-read. ITS CALLER IS THE *Check* BUTTON ON A CONFIRMED ROW, and the
     * reason that button exists is a gap: `consumeAction` publishes NO event
     * (`tokens/pending.ts` has exactly two `publishEvent` calls, in `recordPendingAction`
     * and `resolveAction`), and neither does `addMember` — so the one fact a person most
     * wants after confirming, *has the agent spent its retry yet*, cannot arrive on the
     * stream. D23.2 forbids polling, so the console asks once, when a person asks it to.
     */
    async getPendingAction(pendingActionId: string): Promise<Schemas['PendingAction']> {
      return unwrap(
        await client.GET('/v1/pending-actions/{pendingActionId}', {
          params: { path: { pendingActionId } },
        }),
        'getPendingAction',
      )
    },

    /**
     * INTERACTIVE ONLY, and the person must hold the capability THEMSELVES — a
     * collaborator who may not manage members is `403 FORBIDDEN`, a stranger `404`, and an
     * agent confirming its own question `403 TOKEN_CREDENTIAL_REFUSED` (a loop with no
     * human in it is not D24's loop).
     *
     * **CONFIRMING DOES NOT REPLAY THE REQUEST.** It grants that EXACT request — this
     * token, this method, this concrete path, this key-sorted body hash — ONE retry, which
     * the agent then makes itself. So nothing happens to the project when this returns,
     * and the screen has to say so.
     *
     * `body: {}` IS REQUIRED AND `tsc` REFUSES THE CALL WITHOUT IT. The document gives
     * this route a required `EmptyRequest` body, exactly as `validateSpec` has — measured
     * at the close of sitting 6 by pasting this task's snippets in and compiling them
     * (`TS2345 … Property 'body' is missing`), which is the only one of the four that
     * failed.
     */
    async confirmPendingAction(
      pendingActionId: string,
      idempotency: string,
    ): Promise<Schemas['PendingAction']> {
      return unwrap(
        await client.POST('/v1/pending-actions/{pendingActionId}/confirm', {
          params: { path: { pendingActionId }, ...key(idempotency) },
          body: {},
        }),
        'confirmPendingAction',
      )
    },

    /**
     * In the person's own words, which the agent is then told VERBATIM
     * (`403 TOKEN_ACTION_REJECTED`, whose `pendingAction.reason` carries the sentence) so
     * it stops rather than loops. `reason` is required, 1–500 characters.
     */
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
  } as const
}
