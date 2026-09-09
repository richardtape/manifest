import {
  boolean,
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
    // { max_cpu, max_memory, max_services, ai_monthly_usd } — §6
    quota: jsonb('quota').notNull().default({
      max_cpu: 2,
      max_memory: '2Gi',
      max_services: 3,
      ai_monthly_usd: 50,
    }),
    // Human-set, shapes production capacity only (§24, D29). Null until asked in P5.
    audience: jsonb('audience'),
    visibility: text('visibility').notNull().default('private'),
    published: boolean('published').notNull().default(false),
    forkedFrom: uuid('forked_from'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
export const events = audit.table('events', {
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
