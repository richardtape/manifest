/**
 * EVERY SETTING THE PLATFORM HAS, AND WHERE IT IS SET (the refreshed design's §7a, decision 24) — read
 * only. No operation reads a setting but the blueprints (`listBlueprints`), so every other row's value is
 * an admission, never a value: a console that showed one would be inventing it. What the operator most
 * needs is *where it is set*, because today that is five different places.
 *
 * `key` is what the platform reads, so `settings.test.ts` holds each to its source: an environment
 * variable to `packages/control-plane/src/config.ts` or `.env.example`, a database default to the
 * schema, a constant to its file, a model to the catalogue — a renamed variable turns the test red
 * rather than this screen wrong.
 */
export type SettingKind =
  /** An environment variable the control plane reads at start. */
  | 'env'
  /** A column default or a table in the platform's database (`db/schema.ts`). */
  | 'database'
  /** A logical model in the AI catalogue (`infra/litellm/config.yaml`, or registered at start). */
  | 'model'
  /** A constant in the control plane's code: a decision, not a setting. */
  | 'code'
  /** A file in this repository, changed by a reviewed commit. */
  | 'file'

export interface Setting {
  section: SectionId
  label: string
  key: string
  kind: SettingKind
  /** Where it is set, in words. */
  where: string
  /** The repository path the key is read from or set in (the test reads it), for every kind but `env`. */
  file?: string
  /** What can be done about it, here or elsewhere. */
  action: string
}

export type SectionId =
  | 'quotas'
  | 'models'
  | 'budgets'
  | 'blueprints'
  | 'scanning'
  | 'signin'
  | 'source'
  | 'addresses'
  | 'email'
  | 'limits'
  | 'admins'

export const SECTIONS: readonly {
  id: SectionId
  label: string
  title: string
  note: string
  foot?: string
}[] = [
  {
    id: 'quotas',
    label: 'Quotas',
    title: 'Quotas for new apps',
    note: 'The ceiling a new app is created with: what its manifest may ask for, and what its AI may spend in a month.',
    foot: 'An existing app keeps its own quota, and a validated manifest is never checked again against a later one.',
  },
  {
    id: 'models',
    label: 'AI models',
    title: 'AI models',
    note: 'The logical models an app may name, each cleared for data up to a level; the capable model, its provider and its fallback; and what the building agent may call.',
    foot: 'An entry with no valid level is never defaulted and never resolvable. No operation changes the catalogue yet.',
  },
  {
    id: 'budgets',
    label: 'AI budgets',
    title: 'AI budgets',
    note: 'What an agent may spend in a month and in one session, and the bounds on an intake key.',
  },
  {
    id: 'blueprints',
    label: 'Blueprints',
    title: 'Blueprints',
    note: 'What an app is built from: its Dockerfile, base image, skeleton and starters. A project pins one major version.',
    foot: 'Read from the platform. A blueprint is changed by a reviewed commit to this repository, never from a browser.',
  },
  {
    id: 'scanning',
    label: 'Security scanning',
    title: 'Security scanning',
    note: 'Every build is scanned. A clean result from a stale database is not evidence there is nothing to find.',
    foot: 'Past seven days a build still deploys to sandbox and staging with a warning, and every production launch is refused until the database is refreshed.',
  },
  {
    id: 'signin',
    label: 'Sign-in',
    title: 'Sign-in',
    note: 'Who the platform asks when a person or an app signs in with CWL.',
    foot: 'When UBC grants staging access, the IdP’s address and the rehearsal account change, and no code does.',
  },
  {
    id: 'source',
    label: 'Source code',
    title: 'Source code',
    note: 'Where an app’s code lives. The driver is chosen when the control plane starts.',
    foot: 'The GitHub settings are used only when the driver is github. Switching drivers changes where every new app’s code is kept.',
  },
  {
    id: 'addresses',
    label: 'Addresses',
    title: 'Addresses',
    note: 'The zone each environment’s hostname is made in. A hostname is permanent once made.',
  },
  {
    id: 'email',
    label: 'Email',
    title: 'Email',
    note: 'Where the Manifest team is told of a launch record, and who the platform writes as.',
  },
  {
    id: 'limits',
    label: 'Time limits',
    title: 'Time limits',
    note: 'How long the platform waits for things — shown so an administrator knows the clocks the queue runs on.',
    foot: 'The last two are decisions in the code, not settings.',
  },
  {
    id: 'admins',
    label: 'Administrators',
    title: 'Administrators',
    note: 'Who holds the platform administrator role.',
    foot: 'Granted and revoked on the host, which records who and why. The console never grants the role: a stolen administrator’s session must not be able to make another administrator.',
  },
]

const ENV = 'The control plane’s environment'
const ON_THE_HOST = 'Changed on the host, then a restart'
const A_COMMIT = 'A reviewed commit changes it'
const NOT_A_SETTING = 'Not a setting'

const env = (section: SectionId, label: string, key: string): Setting => ({
  section,
  label,
  key,
  kind: 'env',
  where: ENV,
  action: ON_THE_HOST,
})

export const SETTINGS: readonly Setting[] = [
  // Quotas — projects.quota's database default.
  ...(
    [
      ['CPU', 'max_cpu'],
      ['Memory', 'max_memory'],
      ['Services', 'max_services'],
      ['AI spend a month', 'ai_monthly_usd'],
    ] as const
  ).map(([label, key]): Setting => ({
    section: 'quotas',
    label,
    key: `projects.quota.${key}`,
    kind: 'database',
    where: 'The database’s default for a new project',
    file: 'packages/control-plane/src/db/schema.ts',
    action: A_COMMIT,
  })),
  // AI models.
  ...(
    [
      ['Chat', 'default-chat'],
      ['Chat with reasoning', 'default-chat-reasoning'],
      ['Chat, kept on the host', 'default-chat-onprem'],
      ['Chat with reasoning, kept on the host', 'default-chat-onprem-reasoning'],
      ['Embeddings', 'default-embed'],
    ] as const
  ).map(([label, key]): Setting => ({
    section: 'models',
    label,
    key,
    kind: 'model',
    where: 'The AI catalogue, a file on the host',
    file: 'infra/litellm/config.yaml',
    action: A_COMMIT,
  })),
  {
    section: 'models',
    label: 'The capable model',
    key: 'default-chat-large',
    kind: 'model',
    where: 'Registered when the control plane starts, from the settings below',
    file: 'packages/control-plane/src/ai/capable.ts',
    action: ON_THE_HOST,
  },
  env('models', 'The capable model’s provider and model', 'MANIFEST_CAPABLE_MODEL'),
  env('models', 'The capable model’s level', 'MANIFEST_CAPABLE_MODEL_CLASSIFICATION'),
  env('models', 'The capable model’s fallback', 'MANIFEST_CAPABLE_MODEL_FALLBACK'),
  env('models', 'UBC’s AI Gateway', 'MANIFEST_UBC_AI_GATEWAY_URL'),
  env('models', 'The gateway’s key', 'UBC_AI_GATEWAY_API_KEY'),
  env('models', 'The gateway’s models', 'MANIFEST_GATEWAY_MODELS'),
  env('models', 'What the building agent may call', 'MANIFEST_AGENT_BUILDER_MODELS'),
  env('models', 'The intake model', 'MANIFEST_INTAKE_MODEL'),
  // AI budgets.
  env('budgets', 'An agent’s month', 'MANIFEST_AGENT_MONTHLY_USD'),
  env('budgets', 'One agent session', 'MANIFEST_AGENT_SESSION_CAP_USD'),
  env('budgets', 'An intake key’s cap', 'MANIFEST_INTAKE_KEY_CAP_USD'),
  env('budgets', 'An intake key’s life', 'MANIFEST_INTAKE_KEY_MINUTES'),
  env('budgets', 'Intake keys a person may start in a day', 'MANIFEST_INTAKE_DAILY_KEYS'),
  env('budgets', 'The platform’s intake month', 'MANIFEST_INTAKE_MONTHLY_USD'),
  // Security scanning.
  {
    section: 'scanning',
    label: 'The vulnerability database',
    key: 'make refresh-vulndb',
    kind: 'file',
    where: 'A Docker volume on the host, refreshed with the network on',
    file: 'Makefile',
    action: 'Refreshed on the host',
  },
  {
    section: 'scanning',
    label: 'The scanner',
    key: 'anchore/grype',
    kind: 'file',
    where: 'The image lock',
    file: 'infra/images.lock',
    action: A_COMMIT,
  },
  {
    section: 'scanning',
    label: 'Fresh for',
    key: 'STALENESS_THRESHOLD_DAYS',
    kind: 'code',
    where: 'The code',
    file: 'packages/control-plane/src/build/scan.ts',
    action: NOT_A_SETTING,
  },
  // Sign-in.
  env('signin', 'The identity provider', 'MANIFEST_IDP_BASE_URL'),
  env('signin', 'The identity provider’s entity ID', 'MANIFEST_IDP_ENTITY_ID'),
  env('signin', 'The rehearsal account', 'MANIFEST_REHEARSAL_USER'),
  env('signin', 'The rehearsal password', 'MANIFEST_REHEARSAL_PASSWORD'),
  env('signin', 'The Service Provider entity base', 'MANIFEST_SP_ENTITY_BASE'),
  // Source code.
  env('source', 'The driver', 'MANIFEST_SOURCE_DRIVER'),
  env('source', 'The GitHub organisation', 'MANIFEST_GITHUB_ORG'),
  env('source', 'The GitHub App', 'MANIFEST_GITHUB_APP_ID'),
  env('source', 'The App’s installation', 'MANIFEST_GITHUB_INSTALLATION_ID'),
  env('source', 'The App’s private key', 'MANIFEST_GITHUB_APP_KEY'),
  env('source', 'The webhook secret', 'MANIFEST_GITHUB_WEBHOOK_SECRET'),
  // Addresses.
  env('addresses', 'Sandbox', 'MANIFEST_ZONE_SANDBOX'),
  env('addresses', 'Staging', 'MANIFEST_ZONE_STAGING'),
  env('addresses', 'Production', 'MANIFEST_ZONE_PRODUCTION'),
  // Email.
  env('email', 'The Manifest team’s address', 'MANIFEST_TEAM_EMAIL'),
  env('email', 'Who the platform writes as', 'MANIFEST_MAIL_FROM'),
  env('email', 'The mail server', 'MANIFEST_SMTP_URL'),
  env(
    'email',
    'The support contacts a registration package names',
    'MANIFEST_LAUNCH_CONTACTS',
  ),
  // Time limits.
  env('limits', 'Waiting for an app to answer', 'MANIFEST_READINESS_TIMEOUT_MS'),
  env('limits', 'Draining an old version', 'MANIFEST_DRAIN_TIMEOUT_MS'),
  env('limits', 'Watching a production set', 'MANIFEST_SET_WATCH_SECONDS'),
  {
    section: 'limits',
    label: 'An agent’s question lapses',
    key: 'PENDING_ACTION_TTL_MS',
    kind: 'code',
    where: 'The code',
    file: 'packages/control-plane/src/tokens/pending.ts',
    action: NOT_A_SETTING,
  },
  {
    section: 'limits',
    label: 'An approval preview holds',
    key: 'PREVIEW_TTL_MS',
    kind: 'code',
    where: 'The code',
    file: 'packages/control-plane/src/releases/preview.ts',
    action: NOT_A_SETTING,
  },
  // Administrators.
  env(
    'admins',
    'The administrators reconciled at every sign-in, by PUID',
    'MANIFEST_ADMIN_PUIDS',
  ),
  {
    section: 'admins',
    label: 'Who holds the role, granted by whom and why',
    key: 'role_changes',
    kind: 'database',
    where: 'The platform’s audit log, written by scripts/admin-grant.sh on the host',
    file: 'packages/control-plane/src/db/schema.ts',
    action: 'Never from a browser',
  },
]

/** The value every row but a blueprint shows: no operation reads it. */
export const CANNOT_READ = 'Manifest can’t read this yet.'
