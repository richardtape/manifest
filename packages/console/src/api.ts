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
  } as const
}
