import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const userRole = pgEnum('user_role', ['admin', 'member'])
export const memberRole = pgEnum('member_role', ['owner', 'collaborator'])
export const environmentKind = pgEnum('environment_kind', [
  'sandbox',
  'staging',
  'production',
])
export const buildStatus = pgEnum('build_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
])
export const instanceKind = pgEnum('instance_kind', ['web', 'worker', 'cron'])
export const instanceState = pgEnum('instance_state', [
  'pending',
  'building',
  'provisioning',
  'starting',
  'healthy',
  'failed',
  'hibernated',
  'waking',
  'destroying',
  'gone',
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  ubcCwlPuid: text('ubc_cwl_puid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: userRole('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    blueprintRef: text('blueprint_ref').notNull(),
    // §25 (P5a Task 11): the starter the first commit was seeded from — provenance a
    // console and an administrator both ask for. Null for a skeleton-only project.
    starter: text('starter'),
    // { max_cpu, max_memory, max_services, ai_monthly_usd } — §6
    quota: jsonb('quota').notNull().default({
      max_cpu: 2,
      max_memory: '2Gi',
      max_services: 3,
      ai_monthly_usd: 50,
    }),
    // Human-set, shapes production capacity only (§24, D29). Asked at creation since P5a
    // Task 11; null for a project created before it.
    audience: jsonb('audience'),
    visibility: text('visibility').notNull().default('private'),
    published: boolean('published').notNull().default(false),
    forkedFrom: uuid('forked_from'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * WHEN THIS APP FIRST WENT TO PRODUCTION (P6b Decision 1) — written once, by the first
     * `purpose: 'launch'` production deploy that became healthy, and never cleared. D9 turns
     * on it: before it, a production deploy needs §13's whole checklist; after it, a release
     * is self-serve unless it changes a sensitive field. It is also the fact §9's *"the slug
     * is immutable after production launch"* reads, the day a rename exists.
     */
    launchedAt: timestamp('launched_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('projects_slug_key').on(t.slug)],
)

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: memberRole('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
)

export const appSpecs = pgTable('app_specs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  commitSha: text('commit_sha').notNull(),
  parsed: jsonb('parsed').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  valid: boolean('valid').notNull(),
  errors: jsonb('errors').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const builds = pgTable('builds', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  commitSha: text('commit_sha').notNull(),
  appSpecId: uuid('app_spec_id')
    .notNull()
    .references(() => appSpecs.id),
  imageDigest: text('image_digest'),
  /**
   * The repository half of the image reference, AS THE BUILD PRODUCED IT —
   * `127.0.0.1:7107/local/chem-labs`, host and all.
   *
   * `deployRelease` used to re-derive it as `local/<slug>` from the environment
   * hostname. An unqualified name is Docker Hub to the daemon, so every deploy
   * through the control plane died with `failed to resolve reference
   * "docker.io/local/fixture-app@sha256:…": 401 Unauthorized`. §13 binds an
   * approval to a digest, and a digest is only half an image reference — the
   * other half has to be recorded, not reconstructed. Measured by `make demo`,
   * 2026-09-07.
   */
  imageRepository: text('image_repository'),
  status: buildStatus('status').notNull().default('pending'),
  logsRef: text('logs_ref'),
  /**
   * WHY a failed build failed. §14 makes a failure a recorded row rather than an
   * exception precisely so a faculty member can see it — and until this column
   * existed the row said `failed` and nothing else: `startBuild` caught the error
   * and discarded it (`void error`), and `logsRef` names a log store that does not
   * exist yet. Found by `make demo` on 2026-09-07, where the only way to learn why
   * a build had failed was to re-run it by hand outside the platform.
   */
  error: text('error'),
  /**
   * §12's scan of the image, as `ScanSummary` (§6 `Build.scan`, P5a Task 13). Null for a
   * build that has not succeeded, and for every build before this column — the scan was
   * printed to the operator's terminal and kept nowhere until then.
   */
  scan: jsonb('scan'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** A Release is immutable: Build + AppSpec + resolved config (§13). */
export const releases = pgTable('releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  buildId: uuid('build_id')
    .notNull()
    .references(() => builds.id),
  appSpecId: uuid('app_spec_id')
    .notNull()
    .references(() => appSpecs.id),
  resolvedConfig: jsonb('resolved_config').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const environments = pgTable(
  'environments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: environmentKind('kind').notNull(),
    policy: jsonb('policy').notNull().default({}),
    hostname: text('hostname').notNull(),
  },
  (t) => [uniqueIndex('environments_project_kind_key').on(t.projectId, t.kind)],
)

export const instances = pgTable(
  'instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id),
    driver: text('driver').notNull(),
    kind: instanceKind('kind').notNull().default('web'),
    state: instanceState('state').notNull().default('pending'),
    handle: text('handle'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [index('instances_environment_idx').on(t.environmentId)],
)

/** §23's two listeners, as `routing/hostnames.ts` names them. */
export const routeListener = pgEnum('route_listener', ['internal', 'public'])
/** §6's Route kind. Only `canonical` is written in Phase 1; custom domains are Phase 2. */
export const routeKind = pgEnum('route_kind', ['canonical', 'custom'])

/**
 * §6's `Route`, and the platform's record of WHICH INSTANCE SERVES a hostname (P4c).
 *
 * Nothing recorded it before. `GET /v1/environments/:id` answered with the instance row
 * whose `last_seen_at` was newest, which is the newest DEPLOY — including one that
 * failed — and the edge's own configuration was the only place the answer existed.
 * The control plane's boot re-applies the edge's routes from these rows (§12), which
 * is what makes a restart of the edge recoverable without a redeploy.
 *
 * `ON DELETE cascade`, unlike `audit.events`' restrict: a route is not an audit
 * record, and when an instance row goes its route goes with it. §20's argument for
 * restrict is about a trail that must outlive its subject; this is the opposite — a
 * route that outlived its instance would be a hostname dialling a container that is
 * gone, which is the 502 P4c exists to remove.
 *
 * Unique on `hostname` alone: one hostname reaches one instance, and that uniqueness
 * is what makes the takeover an UPDATE rather than a second row nothing can choose
 * between.
 */
export const routes = pgTable(
  'routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => instances.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    listener: routeListener('listener').notNull(),
    kind: routeKind('kind').notNull().default('canonical'),
  },
  (t) => [uniqueIndex('routes_hostname_key').on(t.hostname)],
)

export const serviceInstances = pgTable('service_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  environmentId: uuid('environment_id')
    .notNull()
    .references(() => environments.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  version: text('version').notNull(),
  name: text('name').notNull(),
  handle: text('handle'),
  credentialsSecretId: uuid('credentials_secret_id'),
})

/**
 * D23.6 — clients retry and users double-click. The response is stored so a replay
 * returns the original result rather than creating a second project.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    route: text('route').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.key, t.userId, t.route] })],
)

/**
 * §6's Secret. `ciphertext` holds the whole SecretEnvelope as JSON — the
 * wrapped data key travels with the payload, because a wrapped key in a
 * separate column is a wrapped key that can be restored from a different
 * backup than its ciphertext.
 *
 * `environment_kind` is a column rather than a reference to `environments`
 * deliberately: §11's "a sandbox never receives staging or production secrets"
 * is a property of the KIND, and a secret must be storable for an environment
 * kind before that environment row exists.
 */
export const secrets = pgTable(
  'secrets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    environmentKind: environmentKind('environment_kind').notNull(),
    name: text('name').notNull(),
    ciphertext: jsonb('ciphertext').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('secrets_scope_name_key').on(t.projectId, t.environmentKind, t.name),
  ],
)

export const pendingActionState = pgEnum('pending_action_state', [
  'pending',
  'confirmed',
  'rejected',
  'expired',
])

/**
 * §6's `DelegatedToken` (D24): a credential an agent holds, scoped to ONE project and an
 * explicit capability set, revocable and expiring.
 *
 * `capabilities` is `string[]` and not `Capability[]` because `db/` must not import
 * `projects/` — the dependency runs the other way, and the authorization module is what
 * turns these strings into capabilities (P5b Task 5). The set is validated where it is
 * written, at Task 4's mint route.
 */
export const delegatedTokens = pgTable(
  'delegated_tokens',
  {
    /**
     * THE TOKEN NAMES THIS ROW. The plaintext is `mft_<id without dashes>_<secret>`, so
     * the id is not an implementation detail — `tokens/repository.ts` requires it from
     * the caller rather than defaulting to `defaultRandom()`, because a row no plaintext
     * names is a credential nothing can present. The default stands only as a safety net.
     */
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** D24: scoped to ONE project (P5b Decision 3). */
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** A person's label for it, so a list of tokens is reviewable. */
    name: text('name').notNull(),
    /** sha256 of the secret, hex. THE SECRET IS NEVER STORED (P5b Decision 1). */
    tokenHash: text('token_hash').notNull().unique(),
    /** The explicit set D24 asks for. Never one of PRIVILEGED — Task 4 refuses it. */
    capabilities: jsonb('capabilities').notNull().$type<string[]>(),
    /** §20's per-token limit, generalising P5a Task 9's limiter (P5b Task 9). */
    rateLimit: integer('rate_limit').notNull().default(600),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('delegated_tokens_user_idx').on(t.userId)],
)

/**
 * §6's `PendingAction` (D24): the record that a delegated token asked for something
 * privileged, which a human confirms or rejects in an interactive session (§26's queue).
 *
 * NOTE THE TWO REFERENTIAL ACTIONS TOGETHER. `requested_by_token` is `restrict` so that
 * revoking a token cannot erase the record of what it asked for; `delegated_tokens`
 * cascades from `users` and `projects`. So the first code that deletes a user or a
 * project will be refused while a pending action survives — deliberately, and there is
 * no such route today (nothing deletes a project; `project:delete` has no caller). The
 * plan that adds one resolves the record's fate explicitly rather than by cascade.
 */
export const pendingActions = pgTable(
  'pending_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    requestedByToken: uuid('requested_by_token')
      .notNull()
      .references(() => delegatedTokens.id, { onDelete: 'restrict' }),
    /** The capability that was refused — one of `PRIVILEGED`. */
    action: text('action').notNull(),
    /**
     * What was asked for: method, path and a sha256 of the canonical body. NOT the body
     * itself — a refused request can carry anything, and this row is read by a person in
     * a queue (§26). The fingerprint is what Task 7 matches a retry against.
     */
    payload: jsonb('payload').notNull().$type<{
      method: string
      path: string
      bodySha256: string
      summary: string
    }>(),
    state: pendingActionState('state').notNull().default('pending'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /**
     * Why a person said no, in their own words (Task 7). STORED rather than only
     * published as an event, because the refusal a retry gets carries it: D23.7's whole
     * argument is that an agent corrects itself from the answer rather than retrying, and
     * "no, not this term" is the only thing that tells it to stop asking. Null for a
     * pending or a confirmed row — a confirmation needs no explanation.
     */
    reason: text('reason'),
    /** Task 10: an unanswered request does not wait for ever. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Decision 7: confirmed-and-used, without a fifth state. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pending_actions_project_state_idx').on(t.projectId, t.state),
    /**
     * Task 7: EVERY request a delegated token makes reads this table, looking for an
     * answer a person gave to this exact request. That lookup is unconditional on
     * purpose — gating it on the route's own `errors:` list would be a second statement
     * of "this capability is privileged", and a new privileged route that forgot the
     * entry would be refused for ever with no way to confirm, which is the accident D24
     * says centrality exists to prevent. The index is what makes the unconditional read
     * cheap: it is scoped to one token's own rows, never a scan.
     */
    index('pending_actions_token_idx').on(t.requestedByToken),
    /**
     * Task 10: ONE OPEN ASK PER TOKEN AND QUESTION, enforced here and not in the
     * application.
     *
     * `recordPendingAction`'s reuse lookup was a read-then-insert, and P5b sitting 5
     * measured what that costs: five CONCURRENT identical asks created five rows, which
     * defeats the only thing the lookup exists for — an agent retrying on a 403 must not
     * fill a person's queue with one question asked forty times — for exactly the agent
     * that retries in parallel, which is what a retry loop does.
     *
     * **PARTIAL, on `state = 'pending'`**, because a question that expired or was
     * answered must be askable again: a blanket unique on the fingerprint would refuse
     * an agent's next ask for ever. That predicate is why this index could not land with
     * sitting 5 — it is only safe once `state` reliably reflects expiry, which
     * `tokens/expiry.ts` and `recordPendingAction`'s own scoped sweep make true.
     */
    uniqueIndex('pending_actions_one_open_ask_idx')
      .on(
        t.requestedByToken,
        sql`(${t.payload}->>'method')`,
        sql`(${t.payload}->>'path')`,
        sql`(${t.payload}->>'bodySha256')`,
      )
      .where(sql`${t.state} = 'pending'`),
  ],
)

/** §9: `draft → submitted → active`, plus `change_requested` and `expired` (D19, D20). */
export const iamRegistrationState = pgEnum('iam_registration_state', [
  'draft',
  'submitted',
  'active',
  'change_requested',
  'expired',
])

/**
 * §9: `draft → submitted → approved`. Three, and deliberately no rejection state — a
 * refused PIA goes back to `draft` with the reviewer's note, which is what the Privacy
 * Office actually does.
 */
export const privacyAssessmentState = pgEnum('privacy_assessment_state', [
  'draft',
  'submitted',
  'approved',
])

/**
 * §6's `IamRegistration`. **P6a tracks it; P8 GENERATES what it carries** (R1) — so
 * `entity_id`, `acs_url`, `slo_url` and `registered_attributes` are recorded by an
 * administrator from what UBC IAM actually registered, not derived here. §9: the entityID
 * "is fixed at registration and stored on the IamRegistration rather than recomputed",
 * which is also why **the project slug is immutable after production launch**.
 */
export const iamRegistrations = pgTable(
  'iam_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // ONE per project (§9: one registration per production app).
    projectId: uuid('project_id')
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: 'cascade' }),
    entityId: text('entity_id').notNull(),
    acsUrl: text('acs_url').notNull(),
    sloUrl: text('slo_url').notNull(),
    certFingerprint: text('cert_fingerprint'),
    /** D20: an unnoticed expiry silently kills login for a live course app mid-term. */
    certExpiresAt: timestamp('cert_expires_at', { withTimezone: true }),
    /**
     * WHAT UBC IAM ACTUALLY REGISTERED. §7's last production clause compares a release's
     * `auth.attributes` against this and fails the BUILD (P6a Task 13). `string[]`, not a
     * typed union, because `db/` must not import `spec/` — the dependency runs the other
     * way and the list is validated where it is written.
     */
    registeredAttributes: jsonb('registered_attributes').notNull().$type<string[]>(),
    state: iamRegistrationState('state').notNull().default('draft'),
    /** §15's submission-state hook: "a human submits and pastes a ticket reference". */
    externalTicketRef: text('external_ticket_ref'),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * §9 measured the fail-open case and it is not theoretical: SimpleSAMLphp treats an
     * empty attribute list and a missing one identically and releases EVERYTHING. The same
     * emptiness here would make Task 13's subset check vacuously true — every set is a
     * superset of nothing — so **the database refuses the half-written row**, exactly as
     * §9 asks registration to.
     */
    check(
      'iam_registrations_attributes_present',
      sql`jsonb_array_length(${t.registeredAttributes}) > 0`,
    ),
  ],
)

/** §6's `PrivacyAssessment`. P6a tracks it; P8 generates the draft (R1). */
export const privacyAssessments = pgTable('privacy_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  /** P8's output. Null here, always, and the column exists so P8 adds no migration. */
  generatedDraft: jsonb('generated_draft'),
  state: privacyAssessmentState('state').notNull().default('draft'),
  reviewer: text('reviewer'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  externalTicketRef: text('external_ticket_ref'),
  recordedBy: uuid('recorded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const approvalDecision = pgEnum('approval_decision', ['approved', 'rejected'])

/**
 * §6's `Approval`, and §13's *Integrity of the gate*: "a non-repudiable record: actor,
 * timestamp, and the exact diff shown at decision time."
 *
 * **IT BINDS A DIGEST, NOT A TAG, AND NOT ONLY A RELEASE ID.** §13: "Binding to a tag would
 * let a later push silently replace approved content." The release id alone would be a
 * binding to a row whose build could be rebuilt — so `image_digest` is stored here, on the
 * approval, and P6a Task 15 verifies it against the build immediately before deploying.
 * Decision 11: a new build is a new digest and therefore has no approval.
 *
 * NO UNIQUE CONSTRAINT ON release_id. A release can be approved, rejected, and approved
 * again — the queue is a history and §13 wants the record, not the latest answer. What
 * reads it takes the newest row by `decided_at`.
 */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    decision: approvalDecision('decision').notNull(),
    decidedBy: uuid('decided_by')
      .notNull()
      .references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    /** THE BINDING. Verified before anything starts (§13, P6a Task 15). */
    imageDigest: text('image_digest').notNull(),
    /** Why, in the administrator's own words. Required on a rejection; optional otherwise. */
    reason: text('reason'),
    /** Decision 6: the RENDERED diff, at decision time. Never a reference recomputed later. */
    diffSnapshot: jsonb('diff_snapshot').notNull().$type<{
      imageDigest: string
      changes: { path: string; from: string; to: string; summary: string }[]
      services: string[]
      attributes: string[]
      resources: Record<string, string | number | null>
      /** Decision 7: null when the model could not be reached. NOT an empty string. */
      summary: string | null
      summarySource: 'llm' | 'unavailable' | 'no-previous-release'
      /**
       * R4: the reviewer's verdict at decision time, `describeVerdict`'s one line in
       * `detail`. `not_performed` until one lands. The three states are `launch/review.ts`'s
       * `ReviewVerdict` union, written out because `db/` imports nothing above it.
       */
      review: {
        state: 'not_performed' | 'clean' | 'findings'
        reviewer: string
        detail: string
      }
    }>(),
  },
  (t) => [
    index('approvals_release_idx').on(t.releaseId),
    /**
     * The same shape `role_changes_reason_present` already uses (migration 0013), and it
     * is here for the same reason: a refusal a person or an agent is told about, with no
     * words in it, is a refusal nobody can act on (D23.7).
     */
    check(
      'approvals_rejection_has_reason',
      sql`${t.decision} <> 'rejected' OR length(trim(coalesce(${t.reason}, ''))) > 0`,
    ),
  ],
)

/**
 * D21's PRE-PRODUCTION REHEARSAL, as R2 redefines it for a laptop (P6a Task 14).
 *
 * D21 asks for a run against UBC's staging IdP before anything is public; C1 puts that IdP
 * out of reach of this machine, so Manifest runs a LOCAL, PRODUCTION-SHAPED one and says
 * so in the checklist. §9's real-Shibboleth run remains an external-track obligation and
 * nothing here discharges it.
 *
 * **IT RECORDS WHAT IT WAS RUN AGAINST, and that is what makes it re-runnable and
 * invalidatable** (Decision 10): a rehearsal passed in week one must not certify a
 * registration that changed in week six. The three stored values are compared with what
 * the candidate release would register NOW, and a difference makes the checklist item
 * `unmet` with a reason rather than silently stale.
 *
 * INSERT ONLY, like `approvals` and for the same reason: a rehearsal is evidence, and the
 * history of what was rehearsed is worth more than the latest answer. What reads it takes
 * the newest row by `ran_at`.
 */
export const rehearsals = pgTable(
  'rehearsals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    passed: boolean('passed').notNull(),
    /** WHAT IT WAS RUN AGAINST — Decision 10's three values, as REGISTERED. */
    entityId: text('entity_id').notNull(),
    acsUrl: text('acs_url').notNull(),
    attributes: jsonb('attributes').notNull().$type<string[]>(),
    /**
     * THE EVIDENCE. §13's items are `met` by a MEASUREMENT here, not by a checkbox, so the
     * row carries what was actually observed: the instance that served, the listener it
     * was reached on, the status the sign-in ended on, the attributes the assertion
     * actually released, and the reason when it did not pass.
     *
     * **NEVER the assertion itself and never a NameID** — §14 redacts at capture, and
     * attribute NAMES are what a person needs to compare a release with a registration.
     */
    evidence: jsonb('evidence').notNull().$type<{
      instanceId: string | null
      hostname: string
      listener: 'internal' | 'public'
      signInStatus: number | null
      attributesReleased: string[]
      reason: string
    }>(),
    ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
    ranBy: uuid('ran_by').references(() => users.id),
  },
  (t) => [
    index('rehearsals_project_idx').on(t.projectId),
    /**
     * §9's fail-open rule, one table further out: a registration with no attribute list
     * releases EVERYTHING (S2 measured it), so a rehearsal that recorded an empty list as
     * what it was run against would be certifying that registration. `deriveSpEntity`
     * refuses it too; this is the database saying the same thing, the way migration 0019
     * does for `iam_registrations`.
     */
    check('rehearsals_attributes_present', sql`jsonb_array_length(${t.attributes}) > 0`),
  ],
)

/**
 * §20's audit log lives in its own SCHEMA, and that is the control rather than a
 * filing decision.
 *
 * §20: *"The `events` table is append-only **by grant**, not by convention: the
 * application role holds no `UPDATE` or `DELETE` privilege on it."* The
 * application role — `manifest_app`, created by `infra/lib/ensure-app-role.sh`
 * — is granted `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public`,
 * with `ALTER DEFAULT PRIVILEGES` so future migrations are covered too. A table
 * sitting in `public` would therefore be writable the moment it was created, and
 * the only way to keep it append-only would be to revoke it again by name — in
 * every script that grants, for ever, by memory.
 *
 * Nothing in this repository grants anything on `audit`. The migration that
 * creates the table grants exactly SELECT and INSERT, and `make verify` proves
 * an UPDATE is refused by attempting one.
 */
export const audit = pgSchema('audit')

/**
 * §5's Event, with §5's columns: `id`, `project_id`, `subject`, `type`,
 * `machine_detail`, `human_message`, `created_at`.
 *
 * `subject` is what the event is ABOUT — `sp:chem-labs:staging`, `instance:abc`
 * — as an opaque string rather than a foreign key, because an Event outlives the
 * thing it describes. §14's whole argument is that the audit trail is most
 * valuable exactly when the instance is gone.
 *
 * There is no `actor` column. §5's Event row does not have one and P4a writes no
 * event with a human actor; §23's audit screen wants to filter by actor, so P4b
 * or P5 will add one. Adding it now would mean shipping a column every writer
 * leaves null, which reads as "we do not know who did this" rather than "nobody
 * did".
 */
export const events = audit.table(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * RESTRICT, and every other table here cascades — measured, not stylistic.
     *
     * A referential action runs with the REFERENCED table's privileges, not the
     * caller's, so `ON DELETE CASCADE` here is a hole straight through §20: with
     * the grant working exactly as intended — `UPDATE`, `DELETE` and `TRUNCATE` on
     * `audit.events` all refused — `manifest_app` deleted the project and took its
     * audit rows with it. `events_after_project_delete` came back 0.
     *
     * Nothing in the control plane deletes a project, so RESTRICT costs nothing
     * today. It makes the first code that wants to decide what happens to the audit
     * trail, rather than inherit an answer silently.
     */
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    subject: text('subject').notNull(),
    type: text('type').notNull(),
    machineDetail: jsonb('machine_detail').notNull(),
    humanMessage: text('human_message').notNull(),
    /**
     * `clock_timestamp()`, NOT `now()` (P4b Task 14, migration 0007). `now()` is the
     * TRANSACTION's start time, so every event one transaction writes carried the same
     * instant — and the stream's replay, ordered by this column, returned them in
     * whatever order the index held. `clock_timestamp()` is the moment of the insert.
     */
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    /**
     * The closed set, enforced by the database as well as by `observability/`'s
     * `EVENT_TYPES` (P4b Task 15). Written out HERE rather than imported, on purpose:
     * a constraint generated from the list it guards is one read of the rule, not two.
     * `events.test.ts` reads this constraint back out of Postgres and compares.
     */
    check(
      'events_type_known',
      sql`${t.type} IN ('sso.registered', 'sso.acs_changed', 'build.started', 'build.succeeded', 'build.failed', 'instance.provisioning', 'instance.starting', 'instance.healthy', 'instance.failed', 'incident.opened', 'ai.key_rotated', 'instance.retiring', 'instance.retired', 'instance.retire_failed', 'project.created', 'repository.seeded', 'spec.validated', 'token.minted', 'pending_action.created', 'pending_action.confirmed', 'pending_action.rejected', 'iam_registration.recorded', 'privacy_assessment.recorded', 'rehearsal.completed', 'release.approved', 'release.approval_rejected', 'project.launched')`,
    ),
  ],
)

/**
 * §14's build log — the store `builds.logs_ref` has named since P3 wrote it (P4b
 * Task 11). One row per line, redacted before it is written (`observability/`).
 *
 * In the `audit` schema for the same reason `events` is: §20's append-only rule
 * applies to the other thing a faculty member is shown, and a table in `public` is
 * writable the moment it exists (see `audit` above). The migration grants exactly
 * SELECT and INSERT.
 *
 * No separate tail index. The tail query is `WHERE build_id = $1 ORDER BY seq DESC
 * LIMIT n`, and the primary key is already a btree on `(build_id, seq)`, which
 * Postgres scans backwards — measured with EXPLAIN when the table was created, and
 * recorded in P4b's record. A second index on the same columns is write cost on
 * every line of every build for nothing.
 */
export const buildLogs = audit.table(
  'build_logs',
  {
    /**
     * RESTRICT, for the reason `events.project_id` is: a referential action runs
     * with the REFERENCED table's privileges, so CASCADE would let `DELETE FROM
     * builds` erase a log `manifest_app` cannot delete a line of. Nothing deletes a
     * build today.
     */
    buildId: uuid('build_id')
      .notNull()
      .references(() => builds.id, { onDelete: 'restrict' }),
    /** Assigned by the writer, in the order the driver reported the lines. */
    seq: integer('seq').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    stream: text('stream', { enum: ['stdout', 'stderr'] }).notNull(),
    text: text('text').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.buildId, t.seq] }),
    // `text(…, { enum })` types the column and creates nothing in the database, so
    // the enum is a TypeScript promise until this constraint makes it a rule.
    check('build_logs_stream_known', sql`${t.stream} IN ('stdout', 'stderr')`),
  ],
)

/**
 * §14's Incident, with §6's columns (P4b Task 13): what a failed deploy looked like,
 * assembled so it can be handed straight back to an agent as a repair prompt.
 *
 * In the `audit` schema, append-only by grant, for the reason `events` and
 * `build_logs` are: it is what an app's owner is shown about a failure, and a record
 * that can be edited after the fact is not a record (§20). The migration grants exactly
 * SELECT and INSERT.
 *
 * EVERY COLUMN IS NOT NULL. `diff_since_healthy` carries the sentence saying there has
 * never been a healthy release, and `log_tail` the sentence saying the log could not be
 * read — a null becomes an empty panel, which reads as "nothing changed" or "it printed
 * nothing", and both would be false.
 */
export const incidents = audit.table(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * RESTRICT, for the reason `build_logs.build_id` is: a referential action runs with
     * the REFERENCED table's privileges, so CASCADE would let `DELETE FROM instances` —
     * or anything that cascades into it, such as deleting an environment — erase an
     * Incident `manifest_app` cannot delete a row of.
     */
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => instances.id, { onDelete: 'restrict' }),
    exitReason: text('exit_reason').notNull(),
    logTail: text('log_tail').notNull(),
    failedCheck: text('failed_check').notNull(),
    diffSinceHealthy: text('diff_since_healthy').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Postgres does not index a foreign key's referencing column by itself, and the
  // environment's incident list joins on it.
  (t) => [index('incidents_instance_idx').on(t.instanceId)],
)

/**
 * §20: "Role changes are audited" (P5a Task 16). In the `audit` schema, append-only BY
 * GRANT like `events`: the migration grants `manifest_app` SELECT and INSERT only, and
 * the one writer — scripts/admin-grant.sh — runs as the database owner, out of band.
 *
 * Not a row in `audit.events`: that table's `project_id` is NOT NULL, and a platform role
 * belongs to no project. `actor` is TEXT, not a users FK, because the first grant has no
 * administrator to attribute it to — it is `bootstrap:<os user>@<host>`.
 */
export const roleChanges = audit.table(
  'role_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    fromRole: userRole('from_role').notNull(),
    toRole: userRole('to_role').notNull(),
    actor: text('actor').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [check('role_changes_reason_present', sql`length(trim(${t.reason})) > 0`)],
)
