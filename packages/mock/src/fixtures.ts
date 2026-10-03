import type { Schemas } from '@manifest/contract'

/**
 * Hand-written and held honest by two independent things (Decision 10): `tsc` against the
 * generated types, and `ajv` against the document in `validate.test.ts`. Neither alone is
 * enough — `tsc` cannot see `additionalProperties: false`, a `format` or a `pattern`, and
 * every representation in this document carries them.
 *
 * THE IDS ARE REAL UUIDs. The document's uuid `pattern` refuses `"project-1"`, and a
 * fixture that fails it fails in a way that reads like a mock defect rather than a fixture
 * one. The timestamps are FIXED INSTANTS, not `new Date()`: a fixture whose value changes
 * per run cannot be asserted against — with ONE exception, which `HOURS_FROM_NOW` below
 * states and justifies: a DEADLINE means nothing except relative to now, and a fixed one
 * had already lapsed by the time a person opened the screen it exists for.
 *
 * WHAT IS NOT HERE IS AS DELIBERATE AS WHAT IS. There is no fixture for anything the
 * platform does not send — the mock's whole exposure is that it is a fixture that can lie
 * (Decision 10), and a client developed against an invented field breaks on the real API
 * with every gate green.
 */

const ISO = '2026-09-18T09:00:00.000Z'
const COMMIT = '5f3c1b8e2a4d6f7c9b0e1a2d3c4b5a6978e9f0a1'

export const USER_ID = '11111111-1111-4111-8111-111111111111'
export const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
export const SANDBOX_ID = '33333333-3333-4333-8333-333333333331'
export const STAGING_ID = '33333333-3333-4333-8333-333333333332'
export const PRODUCTION_ID = '33333333-3333-4333-8333-333333333333'
export const BUILD_ID = '44444444-4444-4444-8444-444444444444'
export const RELEASE_ID = '55555555-5555-4555-8555-555555555555'
export const INSTANCE_ID = '66666666-6666-4666-8666-666666666666'
/** The sandbox's two (Task 13, FE-27): the one its hostname reaches, and an earlier failed one. */
export const SANDBOX_INSTANCE_ID = '66666666-6666-4666-8666-666666666661'
export const SANDBOX_FAILED_INSTANCE_ID = '66666666-6666-4666-8666-666666666662'
export const TOKEN_ID = '77777777-7777-4777-8777-777777777777'
export const PENDING_ACTION_ID = '88888888-8888-4888-8888-888888888881'
export const CONFIRMED_ACTION_ID = '88888888-8888-4888-8888-888888888882'
export const REJECTED_ACTION_ID = '88888888-8888-4888-8888-888888888883'
export const LAPSED_ACTION_ID = '88888888-8888-4888-8888-888888888884'
export const INCIDENT_ID = '99999999-9999-4999-8999-999999999999'
export const APP_SPEC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const COLLEAGUE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const APPROVAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
export const APPROVAL_PREVIEW_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
export const WITHHELD_PREVIEW_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
export const UNAVAILABLE_PREVIEW_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3'
/** Instructor One's agent sessions on `mock-app` (Task 13): one running, one ended. */
export const AGENT_SESSION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
export const ENDED_AGENT_SESSION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
/** The one intake session the mock starts and ends (Task 13; FE-1's key). */
export const INTAKE_SESSION_ID = 'ffffffff-ffff-4fff-8fff-fffffffffff1'

export const ME: Schemas['Me'] = {
  id: USER_ID,
  puid: 'ins000001',
  displayName: 'Instructor One',
  email: 'instructor@example.test',
  role: 'member',
  // An instructor: faculty, so they may build. `MANIFEST_MOCK_MAY_BUILD=0` answers false.
  mayBuild: true,
}

/** `MANIFEST_MOCK_ROLE=admin` is what makes §26's fleet reachable (Task 9's affordance). */
export const ADMIN_ME: Schemas['Me'] = { ...ME, role: 'admin' }

/**
 * `owner` IS `UserSummary`, WHICH IS `{ id, displayName }` AND NOTHING ELSE. The plan's own
 * snippet gave it a `puid` and was `TS2353`; it would have failed the Ajv check too
 * (measured at the close of sitting 7, and again here).
 *
 * `Audience` requires FIVE fields — `scale`, `burst`, `justification`, `setBy`, `setAt` —
 * and `setBy` is a `uuid`, not a display name.
 */
export const AUDIENCE: Schemas['Audience'] = {
  scale: 'class',
  burst: 'synchronised',
  justification: 'one lab section, all submitting in the same hour',
  setBy: USER_ID,
  setAt: ISO,
}

const ENVIRONMENT = (
  id: string,
  kind: Schemas['Environment']['kind'],
  instance: Schemas['Environment']['instance'],
): Schemas['Environment'] => ({
  id,
  projectId: PROJECT_ID,
  kind,
  hostname:
    kind === 'production'
      ? 'mock-app.manifest.internal'
      : `mock-app.${kind}.manifest.internal`,
  url:
    kind === 'production'
      ? 'https://mock-app.manifest.internal'
      : `https://mock-app.${kind}.manifest.internal`,
  instance,
})

/**
 * §11's states as the console renders them. `lastSeenAt` is `null` until the instance has
 * been probed — a deploy's answer carries no reading yet.
 */
export const INSTANCE: Schemas['Instance'] = {
  id: INSTANCE_ID,
  environmentId: STAGING_ID,
  releaseId: RELEASE_ID,
  kind: 'web',
  state: 'healthy',
  lastSeenAt: ISO,
  // FE-38: when the deploy made it — never null, so unlike `lastSeenAt` a failed attempt has one too.
  createdAt: '2026-09-18T09:01:00.000Z',
}

/**
 * `MANIFEST_MOCK_FAIL=1`'s ending. **A deploy that never becomes ready is a `200` whose
 * `state` is `failed`** (P4b Task 13) — so the mock must answer 200 here too, or a client
 * that switches on the HTTP status passes against the mock and fails against the platform.
 */
export const FAILED_INSTANCE: Schemas['Instance'] = {
  ...INSTANCE,
  state: 'failed',
  lastSeenAt: null,
}

/**
 * THE SANDBOX RUNS TOO (Task 13, sitting 10): since FE-24's code only a SANDBOX instance's output
 * is readable, so the mock's project needs one for `getInstanceOutput` to answer anything — the
 * release staging runs, deployed to the sandbox first, as an agent would.
 */
export const SANDBOX_INSTANCE: Schemas['Instance'] = {
  ...INSTANCE,
  id: SANDBOX_INSTANCE_ID,
  environmentId: SANDBOX_ID,
}

/**
 * PRODUCTION'S OWN INSTANCE (FE-40 (1), the launch path plan's Task 13): what a production deploy
 * answers once the mock's checklist is ready (`MANIFEST_MOCK_RECORDS=approved`) — never staging's.
 */
export const PRODUCTION_INSTANCE_ID = '66666666-6666-4666-8666-666666666663'
export const PRODUCTION_INSTANCE: Schemas['Instance'] = {
  ...INSTANCE,
  id: PRODUCTION_INSTANCE_ID,
  environmentId: PRODUCTION_ID,
}

/** `MANIFEST_MOCK_FAIL=1`'s ending of a SANDBOX deploy — the same rule as `FAILED_INSTANCE`. */
export const FAILED_SANDBOX_INSTANCE: Schemas['Instance'] = {
  ...SANDBOX_INSTANCE,
  state: 'failed',
  lastSeenAt: null,
}

export const ENVIRONMENTS: Schemas['EnvironmentList'] = [
  ENVIRONMENT(SANDBOX_ID, 'sandbox', SANDBOX_INSTANCE),
  ENVIRONMENT(STAGING_ID, 'staging', INSTANCE),
  ENVIRONMENT(PRODUCTION_ID, 'production', null),
]

export const STAGING: Schemas['Environment'] = ENVIRONMENTS[1]!

/**
 * EACH ENVIRONMENT'S OWN INSTANCES (FE-27): what `listInstances` answers, keyed on the environment
 * asked — agreeing with `ENVIRONMENTS`, whose `instance` is the one each hostname reaches. The
 * sandbox keeps an EARLIER failed attempt beside the one serving (§11: a failed instance stays
 * listed after it is replaced); production has never run.
 */
export const INSTANCE_LISTS: Record<string, Schemas['InstanceList']> = {
  [SANDBOX_ID]: {
    environmentId: SANDBOX_ID,
    instances: [
      { ...SANDBOX_INSTANCE, serving: true },
      {
        ...SANDBOX_INSTANCE,
        id: SANDBOX_FAILED_INSTANCE_ID,
        state: 'failed',
        lastSeenAt: '2026-09-18T08:40:00.000Z',
        createdAt: '2026-09-18T09:00:30.000Z',
        serving: false,
      },
    ],
    truncated: false,
  },
  [STAGING_ID]: {
    environmentId: STAGING_ID,
    instances: [{ ...INSTANCE, serving: true }],
    truncated: false,
  },
  [PRODUCTION_ID]: { environmentId: PRODUCTION_ID, instances: [], truncated: false },
}

/**
 * THE SANDBOX INSTANCE'S LAST LINES (Task 13): one the platform redacted — its session secret —
 * and one cut at §14's 4 KiB, which ends in the platform's own marker, so a screen built here
 * shows both before it meets the platform. Oldest first; `readAt` is the reader's, set per request.
 */
export const OUTPUT: Omit<Schemas['InstanceOutput'], 'readAt'> = {
  instanceId: SANDBOX_INSTANCE_ID,
  environmentId: SANDBOX_ID,
  environmentKind: 'sandbox',
  lines: [
    { at: ISO, stamped: true, stream: 'stdout', text: 'listening on 3000' },
    {
      at: ISO,
      stamped: true,
      stream: 'stdout',
      text: 'GET /healthz 200 — session store connected with [REDACTED]',
    },
    {
      at: ISO,
      stamped: true,
      stream: 'stderr',
      text: `payload ${'x'.repeat(40)}…[cut: 6122 bytes]`,
    },
    {
      at: ISO,
      stamped: true,
      stream: 'stdout',
      text: 'POST /posts 201 — a student posted',
    },
  ],
  truncated: { lines: false, bytes: false },
  failure: null,
}

export const PROJECT: Schemas['Project'] = {
  id: PROJECT_ID,
  slug: 'mock-app',
  // What people read — deliberately not the slug, so a client that shows one for the other is seen.
  name: 'Mock course app',
  blueprint: 'node-ts-mongo@1',
  starter: 'proof-app',
  owner: { id: ME.id, displayName: ME.displayName },
  audience: AUDIENCE,
  createdAt: ISO,
  launchedAt: null,
  // §11: an ordinary project, never switched off (the front-end enablement plan's Task 11).
  state: 'active',
  archivedAt: null,
  // D5's DRIVER 2, on a FREE organisation (the D5 plan's Task 12): GitHub would not protect a
  // private repository's main there, so the console's warning is what a front-end developer
  // sees against the mock — the case that must never be hidden.
  repository: {
    provider: 'github',
    fullName: 'manifest-apps/mock-app',
    webUrl: 'https://github.com/manifest-apps/mock-app',
    mainProtected: false,
    protectionDetail:
      'Upgrade to GitHub Pro or make this repository public to enable this feature.',
    visibility: 'private',
  },
}

/** What `?expand=environments` adds (D23.1) — the project screen always asks for it. */
export const PROJECT_EXPANDED: Schemas['Project'] = {
  ...PROJECT,
  environments: ENVIRONMENTS,
}

export const PROJECTS: Schemas['ProjectList'] = [PROJECT]

/**
 * The proof-app starter's manifest sets `ai.budget.per_user_monthly_usd: 1`, so its validation
 * is valid AND carries the platform's warning (Spec action 4) — in the platform's words, so a
 * front end built against the mock shows warnings where the platform will send them.
 */
export const SPEC_VALIDATION: Schemas['SpecValidation'] = {
  appSpecId: APP_SPEC_ID,
  commitSha: COMMIT,
  valid: true,
  errors: [],
  warnings: [
    {
      code: 'SPEC_FIELD_NOT_ENFORCED',
      path: 'ai.budget.per_user_monthly_usd',
      message:
        '$1/month per person is validated and recorded with the release, and not enforced: no single person is limited by it yet',
      hint: 'Nothing to fix. What limits the app’s AI spending today is ai.budget.project_monthly_usd; keep this value if you mean it — it applies once Manifest enforces it.',
    },
  ],
  sensitiveDiff: { sensitive: false, fields: [] },
}

export const CREATED_PROJECT: Schemas['CreatedProject'] = {
  ...PROJECT,
  environments: ENVIRONMENTS,
  spec: SPEC_VALIDATION,
}

export const SPEC: Schemas['Spec'] = {
  appSpecId: APP_SPEC_ID,
  commitSha: COMMIT,
  spec: {
    schemaVersion: 1,
    name: 'mock-app',
    blueprint: 'node-ts-mongo@1',
    runtime: { port: 3000, health: '/healthz' },
    auth: { provider: 'cwl' },
  },
}

export const SLUG_AVAILABLE: Schemas['SlugCheck'] = { slug: 'free-name', available: true }

export const SLUG_TAKEN: Schemas['SlugCheck'] = {
  slug: 'mock-app',
  available: false,
  reasons: [
    {
      code: 'SLUG_TAKEN',
      message: 'a project already has this slug',
      hint: 'Pick another slug, or ask its owner to add you.',
    },
  ],
}

export const BLUEPRINT: Schemas['Blueprint'] = {
  ref: 'node-ts-mongo@1',
  name: 'node-ts-mongo',
  majorVersion: 1,
  language: 'javascript',
  defaultPort: 3000,
  healthPath: '/healthz',
  schemaVersions: [1],
  provides: { services: ['mongodb'], authProviders: ['cwl', 'none'], ai: true },
  starters: [
    {
      name: 'proof-app',
      summary: 'A note-taking app with CWL sign-in and an AI answer.',
    },
  ],
}

export const BLUEPRINTS: Schemas['BlueprintList'] = [BLUEPRINT]

export const KNOWLEDGE_PACK: Schemas['KnowledgePack'] = {
  blueprint: 'node-ts-mongo@1',
  files: [
    {
      path: 'AGENTS.md',
      mediaType: 'text/markdown',
      // The REAL hex SHA-256 of `content` as UTF-8, computed rather than invented: the
      // document constrains only the pattern `^[0-9a-f]{64}$`, so a made-up 64 hex
      // characters would pass Ajv and lie about what the field means. D25's whole point is
      // that an agent can check the pack it was given.
      sha256: '4d317e4afc0985b29e61c8110f1b1e4c8070073bf21c8319e86a3bc89161b889',
      content: '# Writing a manifest.yaml for node-ts-mongo@1\n',
    },
  ],
}

export const SCAN: Schemas['ScanSummary'] = {
  scanner: 'grype v0.118.0',
  scannedAt: ISO,
  databaseAgeDays: 3,
  stale: false,
  baseImageKnown: true,
  fixable: { critical: 0, high: 0 },
  unfixable: { critical: 0, high: 2 },
  baseImage: { critical: 4, high: 14 },
  unfixableFindings: [
    { id: 'GHSA-xxxx-yyyy-zzzz', severity: 'High', package: 'example@1.0.0' },
  ],
}

/**
 * THE BUILD AS IT IS WHEN `POST …/builds` ANSWERS `202`: `running`, with no digest
 * (Rich's R6, P5a Task 13). Its own answer is never final.
 */
export const BUILD_RUNNING: Schemas['Build'] = {
  id: BUILD_ID,
  projectId: PROJECT_ID,
  commitSha: COMMIT,
  status: 'running',
  imageDigest: null,
  error: null,
  scan: null,
  createdAt: ISO,
}

export const BUILD: Schemas['Build'] = {
  ...BUILD_RUNNING,
  status: 'succeeded',
  imageDigest: 'sha256:9b2c1d0e3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4',
  scan: SCAN,
}

export const BUILDS: Schemas['BuildList'] = [BUILD]

/**
 * ONE LINE PER `seq`, SHARED BY THE READ AND THE STREAM. `script.ts` sends these as
 * `LogFrame`s and `BUILD_LOG` carries the first two as already-stored lines, so a console
 * merging `getBuildLog` with the live frames by `seq` sees ONE log rather than two
 * spellings of the same line — which is what the platform gives it, and what the first
 * browser walk of this mock did not (both halves said `#1` and disagreed about the rest).
 */
export const LOG_LINES = [
  '#1 [internal] load build definition from Dockerfile',
  '#1 transferring dockerfile: 892B done',
  '#1 DONE 0.1s',
  '#2 [internal] load metadata for 127.0.0.1:7107/base/node:22-alpine',
  '#2 DONE 0.3s',
  '#3 [1/8] FROM 127.0.0.1:7107/base/node:22-alpine',
  '#3 DONE 0.0s',
  '#4 [internal] load build context',
  '#4 transferring context: 41.2kB done',
  '#5 [2/8] WORKDIR /app',
  '#6 [3/8] COPY package.json package-lock.json ./',
  '#7 [4/8] RUN npm ci --omit=dev',
  '#7 added 135 packages in 6s',
  '#7 DONE 6.4s',
  '#8 [5/8] COPY . .',
  '#9 [6/8] RUN addgroup -g 10001 app && adduser -D -u 10001 -G app app',
  '#10 [7/8] USER 10001',
  '#11 exporting to image',
  '#12 pushing layers to 127.0.0.1:7107/local/mock-app',
  '#12 DONE 2.1s',
]

/**
 * `BuildLog` IS THE ONLY SOURCE OF LINES WRITTEN BEFORE A SOCKET OPENED: `LogFrame` is
 * never replayed (P5c sitting 5, F1). A mock whose stream replayed log lines would be
 * scripting something the platform cannot do, so this read carries them and `script.ts`
 * sends only the ones written after the subscription.
 */
export const BUILD_LOG: Schemas['BuildLog'] = {
  buildId: BUILD_ID,
  lines: LOG_LINES.slice(0, 2).map((text, i) => ({
    seq: i + 1,
    stream: 'stdout' as const,
    text,
    at: ISO,
  })),
}

const ENV_CONFIG = {
  port: 3000,
  health: '/healthz',
  resources: { cpu: 1, memory: '512Mi', pids: 64, disk: '1Gi' },
  services: [{ type: 'mongodb', version: '7.0', name: 'db' }],
  egressAllow: [],
  classification: 'low',
  // §9's FRIENDLY NAMES, the ones `sso/attributes.ts` maps to OIDs — the Manifest IdP
  // releases those seven and nothing else, so a fixture asking for `displayName` described
  // an app whose sign-in could never carry it (P6a sitting 10).
  auth: { provider: 'cwl' as const, attributes: ['ubcEduCwlPuid', 'mail', 'givenName'] },
  ai: { models: ['default-chat'] },
  envNames: ['MONGODB_URI', 'SESSION_SECRET', 'SAML_ENTRY_POINT'],
}

/**
 * A RELEASE NAMES ITS ENV VARS AND NEVER THEIR VALUES (P5a Decision 22). `envNames` is the
 * whole of what a client may see; the values reach the container through §8's injection and
 * stop there.
 */
export const RELEASE: Schemas['Release'] = {
  id: RELEASE_ID,
  projectId: PROJECT_ID,
  buildId: BUILD_ID,
  appSpecId: APP_SPEC_ID,
  imageDigest: BUILD.imageDigest as string,
  summary: 'first release',
  createdBy: USER_ID,
  createdAt: ISO,
  scan: SCAN,
  config: { sandbox: ENV_CONFIG, staging: ENV_CONFIG, production: ENV_CONFIG },
}

export const RELEASES: Schemas['ReleaseList'] = [RELEASE]

/**
 * §13's approval (P6a Task 10), as a console screen reads it at decision time.
 *
 * **THE SUMMARY IS THE MODEL'S ONE SENTENCE PER CHANGE** (the D5 plan's Task 13): what the
 * screen now lays out under each change line, labelled as the model's — the layout a
 * front-end developer must build. The two states that have NO summary, and that the obvious
 * layout has nowhere to put, are `WITHHELD_APPROVAL_PREVIEW` and `UNAVAILABLE_APPROVAL_PREVIEW`
 * below: validated against the document like every fixture, and never a blank space.
 *
 * THE DIFF AN ADMINISTRATOR READS, ONCE (P6b Task 9): the preview carries it and the approval
 * COPIES it, which is the platform's rule — so the mock's two fixtures share one object rather
 * than two literals that could drift into a preview and a record that disagree.
 */
const APPROVAL_DIFF: Schemas['ApprovalDiff'] = {
  imageDigest: BUILD.imageDigest as string,
  changes: [
    {
      path: 'resources.memory',
      from: '256Mi',
      to: '512Mi',
      summary: 'raised the memory limit from 256Mi to 512Mi',
    },
  ],
  services: ['mongodb@7.0'],
  attributes: ['givenName', 'mail', 'ubcEduCwlPuid'],
  resources: { cpu: 1, memory: '512Mi', disk: '1Gi', pids: 64 },
  summary:
    'The app can hold twice as much in memory, which raises its cost and how much a fault in it can take down with it.',
  summarySource: 'llm',
  summaryWithheldBecause: null,
  summaryExposures: [
    {
      path: 'resources.memory',
      sentence:
        'The app can hold twice as much in memory, which raises its cost and how much a fault in it can take down with it.',
    },
  ],
  // `NullReviewer`'s reason VERBATIM (`launch/review.ts`), which is what `describeVerdict`
  // stores for `not_performed` — the screen renders this sentence as the platform's own,
  // so a paraphrase here would teach a front-end developer a sentence the platform never says.
  review: {
    state: 'not_performed',
    reviewer: 'none',
    detail:
      'No code reviewer is configured. Manifest reviews manifest.yaml, not code; the ' +
      'controls that make that tolerable are containment — default-deny egress, network ' +
      'isolation, least privilege and edge protections.',
  },
  // R4(d) (P6b Task 8). The memory change above IS one of §7's sensitive fields, so this
  // approval names what it was compared with, the field and its note — the note and the
  // coverage sentence VERBATIM from `spec/diff.ts`'s `SECURITY_NOTES` and
  // `releases/approval.ts`'s `COVERAGE_LIMIT`, for the reason the reviewer's is above.
  baselineReleaseId: '88888888-8888-4888-8888-888888888881',
  sensitiveFields: ['resources'],
  security: [
    {
      field: 'resources',
      note: 'More CPU, memory, processes or disk: cost and blast radius rather than data.',
    },
  ],
  coverage:
    'An administrator sees a first launch and any release that changes a sensitive field. ' +
    'A release that changes none reaches production without an administrator, and its code is ' +
    'reviewed by nothing (an accepted risk); containment is the control.',
}

/**
 * P6b Task 9's preview — what the approvals screen renders BEFORE the decision. The mock keeps
 * no state (P5c Decision 9), so every take and every read answers this one; its `createdAt` is
 * the fixtures' fixed instant and its `expiresAt` thirty minutes later.
 */
export const APPROVAL_PREVIEW: Schemas['ApprovalPreview'] = {
  id: APPROVAL_PREVIEW_ID,
  releaseId: RELEASE_ID,
  projectId: PROJECT_ID,
  createdBy: USER_ID,
  createdByName: ME.displayName,
  createdAt: ISO,
  expiresAt: new Date(Date.parse(ISO) + 30 * 60 * 1000).toISOString(),
  imageDigest: BUILD.imageDigest as string,
  diff: APPROVAL_DIFF,
}

/**
 * THE MODEL'S ANSWER, WITHHELD (the D5 plan's Task 13): it stated a decision, so the platform
 * stored no summary and named the rule — in `summary.ts`'s `checkExposure` words, verbatim —
 * and never the model's sentence. The screen says so where the summary would be.
 */
export const WITHHELD_APPROVAL_PREVIEW: Schemas['ApprovalPreview'] = {
  ...APPROVAL_PREVIEW,
  id: WITHHELD_PREVIEW_ID,
  diff: {
    ...APPROVAL_DIFF,
    summary: null,
    summarySource: 'withheld',
    summaryWithheldBecause:
      'a sentence states or suggests a decision, a verdict or an approval, which is the administrator’s and the record’s, never the model’s',
    summaryExposures: null,
  },
}

/**
 * Decision 7's state: the model could not be reached. Until the D5 plan's Task 13 this was
 * the served preview, and the reason for it still stands — it is the one a screen is most
 * likely to render wrongly — so it stays in the validated table.
 */
export const UNAVAILABLE_APPROVAL_PREVIEW: Schemas['ApprovalPreview'] = {
  ...APPROVAL_PREVIEW,
  id: UNAVAILABLE_PREVIEW_ID,
  diff: {
    ...APPROVAL_DIFF,
    summary: null,
    summarySource: 'unavailable',
    summaryWithheldBecause: null,
    summaryExposures: null,
  },
}

export const APPROVAL: Schemas['Approval'] = {
  id: APPROVAL_ID,
  releaseId: RELEASE_ID,
  projectId: PROJECT_ID,
  decision: 'approved',
  decidedBy: USER_ID,
  decidedByName: ME.displayName,
  decidedAt: ISO,
  imageDigest: BUILD.imageDigest as string,
  reason: 'the scan is clean and the egress list matches the ticket',
  diff: APPROVAL_DIFF,
  previewId: APPROVAL_PREVIEW_ID,
}

export const INCIDENTS: Schemas['IncidentList'] = {
  environmentId: STAGING_ID,
  incidents: [
    {
      id: INCIDENT_ID,
      instanceId: INSTANCE_ID,
      releaseId: RELEASE_ID,
      exitReason: 'the readiness probe never answered 200',
      logTail: 'Error: connect ECONNREFUSED 127.0.0.1:27017\n',
      failedCheck: 'GET /healthz from inside the edge',
      diffSinceHealthy: 'runtime.health: /healthz → /never-ready',
      createdAt: ISO,
      prompt:
        'The app did not answer its health path. Check runtime.health in manifest.yaml.',
    },
  ],
}

/**
 * §13's checklist, COMPUTED and never stored — THE PLATFORM'S SEVEN ITEMS, in its order and
 * in its words (`launch/readiness.ts`), describing the same moment every other fixture here
 * does: UBC IAM's registration is `active`, the PIA is still `submitted`, the rehearsal
 * passed, the scan is clean and the release is approved. So `ready` is `false` for exactly
 * ONE reason, and a console built against this sees a real action to render on the one
 * item that needs one.
 *
 * **IT CARRIES ALL THREE ITEM STATES, AND BOTH VALUES OF `blocking`.** `met` for what the
 * platform computed or an administrator recorded, `unmet` with NO `builtBy` for the PIA,
 * and `not_built` WITH one for `code-review` — the one NON-blocking item (D33), which a
 * screen must render as harmless rather than as the reason production is refused.
 *
 * This was a three-item illustrative list until P6a Task 17, with `domain` `not_built` here
 * and `met` on the platform; its own comment named Task 17 to reconcile it.
 */
export const LAUNCH_READINESS: Schemas['LaunchReadiness'] = {
  projectId: PROJECT_ID,
  // NOT LAUNCHED, like `PROJECT` (`launchedAt: null`): the first launch's checklist, so the
  // three D9.2 fields read as P6b defines them before a launch (P6b Task 6).
  launched: false,
  ready: false,
  candidateReleaseId: RELEASE_ID,
  baselineReleaseId: null,
  sensitiveFields: [],
  reescalated: false,
  items: [
    {
      id: 'domain',
      title: 'Where the app will live',
      owner: 'project owner',
      blocking: true,
      state: 'met',
      why: 'Canonical hostname only — no action. A custom domain is not offered yet, and for a CWL app one must be chosen before IAM registration, because the registration carries it.',
      since: null,
    },
    {
      id: 'iam-registration',
      title: 'Registered with UBC IAM',
      owner: 'UBC IAM, recorded by a platform administrator',
      blocking: true,
      state: 'met',
      why: 'Registered as https://manifest.internal/sp/mock-app/production, active (ticket IAM-2026-0412), releasing 4 attribute(s).',
      // Met since UBC registered it — `IAM_REGISTRATION.registeredAt` (the launch path plan's Task 9).
      since: '2026-09-15T00:00:00.000Z',
    },
    {
      id: 'privacy-assessment',
      title: 'Privacy Impact Assessment approved',
      owner: 'UBC Privacy Office, recorded by a platform administrator',
      blocking: true,
      state: 'unmet',
      // Waiting on the Privacy Office since the day it was RE-sent — `PRIVACY_ASSESSMENT.submittedAt` —
      // in `launch/readiness.ts`'s words for a dated submission (the launch path plan's Task 9).
      why: "It was sent to the UBC Privacy Office on September 18, 2026. The assessment is 'submitted' (ticket PIA-2026-0088) and must be 'approved' before anything goes to production.",
      since: '2026-09-18T19:00:00.000Z',
    },
    {
      id: 'rehearsal',
      title: 'Pre-production rehearsal passed',
      owner: 'Manifest',
      blocking: true,
      state: 'met',
      why: "A production-shaped rehearsal passed on 2026-09-20: the app was deployed to its production hostname on the public listener, its Service Provider was registered with production values, and one CWL sign-in completed releasing 3 attribute(s). This proves the SHAPE of the registration — the entityID, the ACS URL, the attribute release and the certificate all work together. It proves nothing about UBC's acceptance of it: the Manifest IdP is not real Shibboleth, and a sign-in against UBC's own staging IdP is not part of this rehearsal.",
      since: null,
    },
    {
      id: 'scans',
      title: 'Dependency and secret scans clean',
      owner: 'Manifest',
      blocking: true,
      state: 'met',
      why: 'Its secret and lockfile gates passed and no finding it introduced has a published fix. 0 finding(s) with no published fix are recorded on the release.',
      since: null,
    },
    {
      id: 'admin-approval',
      title: 'Release approved by a platform administrator',
      owner: 'platform admin',
      blocking: true,
      state: 'met',
      why: 'Approved by an administrator on 2026-09-20, bound to image digest sha256:9b2c1d0e3f4a…',
      since: null,
    },
    {
      id: 'code-review',
      title: 'Code reviewed for safety',
      owner: 'Manifest',
      blocking: false,
      state: 'not_built',
      builtBy: 'a tracked hardening item (SemgrepReviewer), not a plan',
      why: 'Nothing reviews the code the agent wrote. Manifest reviews manifest.yaml, not code, and that risk is still accepted: the controls that make it tolerable are containment — default-deny egress, network isolation, least privilege and edge protections. A reviewer interface exists with no implementation behind it, so this item does not block a launch.',
      since: null,
    },
  ],
}

/**
 * A LAUNCHED app's checklist for a SELF-SERVE release (P6b Task 6; the D5 plan's Task 14, F15):
 * nothing sensitive changed since the last approved release, so `admin-approval` is met without
 * an administrator — and the console offers NO link to an approval nobody will make. The
 * `admin-approval` item's title and `why` are `launch/readiness.ts`'s `releaseApprovalItem`
 * words, verbatim, and so is the PIA's, which is approved because a launched app's was.
 */
export const SELF_SERVE_READINESS: Schemas['LaunchReadiness'] = {
  ...LAUNCH_READINESS,
  launched: true,
  ready: true,
  baselineReleaseId: '88888888-8888-4888-8888-888888888881',
  sensitiveFields: [],
  reescalated: false,
  items: LAUNCH_READINESS.items.map((i) =>
    i.id === 'privacy-assessment'
      ? {
          ...i,
          state: 'met' as const,
          why: 'Approved by the UBC Privacy Office on 2026-09-21 (ticket PIA-2026-0088).',
          since: '2026-09-21T00:00:00.000Z',
        }
      : i.id === 'admin-approval'
        ? {
            ...i,
            title:
              'Release approved by a platform administrator — only when a sensitive field changed',
            state: 'met' as const,
            why: 'No sensitive field changed since the last approved release, so this release goes to production self-serve. Its code is not reviewed: that is an accepted risk, and containment is its control.',
            since: null,
          }
        : i,
  ),
}

export const MEMBERS: Schemas['MemberList'] = [
  {
    userId: USER_ID,
    puid: 'ins000001',
    cwlLogin: 'instructor',
    displayName: 'Instructor One',
    email: 'instructor@example.test',
    role: 'owner',
  },
]

/**
 * The person `addMember` adds: a FACULTY colleague, because only a person who may build is added
 * (FE-39). `MANIFEST_MOCK_MAY_BUILD=0` refuses the add instead, naming `REFUSED_MEMBER_NAME`.
 */
export const MEMBER: Schemas['Member'] = {
  userId: COLLEAGUE_ID,
  puid: 'col000001',
  cwlLogin: 'colleague',
  displayName: 'Colleague One',
  email: 'colleague@example.test',
  role: 'collaborator',
}

/** Who `addMember`'s `409 MEMBER_MAY_NOT_BUILD` names under `MANIFEST_MOCK_MAY_BUILD=0`: a student. */
export const REFUSED_MEMBER_NAME = 'Student One'

/** `addMember` answers the one member; `removeMember` answers the whole list (P5b Task 8). */
export const MEMBERS_WITH_COLLEAGUE: Schemas['MemberList'] = [...MEMBERS, MEMBER]

export const TOKEN: Schemas['Token'] = {
  id: TOKEN_ID,
  projectId: PROJECT_ID,
  name: 'the agent that builds this app',
  // Minted by the mock's own person (`ME`), so a client comparing with `getMe`'s id finds it theirs
  // to revoke — as `revokeToken` here assumes.
  mintedBy: USER_ID,
  // THE READ SCHEMA CANNOT CHECK THESE AND THE MINT REQUEST'S CAN. `Token.capabilities` is
  // a bare `array<string>` in the document while `MintTokenRequest.capabilities` is a closed
  // enum of eleven — so `build:run`, which this fixture said until it was checked by hand,
  // is refused by neither `tsc` nor Ajv. `validate.test.ts` holds it to the mint enum
  // instead; the gap itself is a finding about the API (P5c sitting 8).
  capabilities: ['project:read', 'build:create', 'release:deploy'],
  rateLimit: 600,
  expiresAt: '2026-12-18T09:00:00.000Z',
  expired: false,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: ISO,
}

export const TOKENS: Schemas['TokenList'] = [TOKEN]

export const REVOKED_TOKEN: Schemas['Token'] = { ...TOKEN, revokedAt: ISO }

/**
 * THE ONE ANSWER IN THIS API THAT CARRIES A CREDENTIAL, and the read schema has no `secret`
 * field at all (P5b Decision 11) — so a console that showed it twice could not, and this
 * fixture is the only place `secret` appears.
 */
export const MINTED_TOKEN: Schemas['MintedToken'] = {
  token: TOKEN,
  secret: `mft_${TOKEN_ID}_ZmFrZS1zZWNyZXQtZm9yLXRoZS1tb2NrLW9ubHk`,
}

/**
 * AN AGENT OR INTAKE KEY'S TIMES ARE COUNTED FROM NOW, AT EACH REQUEST (FE-27): a key is valid
 * for its life from when it was started, and a client that holds a key to its `expiresAt` — the
 * faculty front-end does — refused every key the document's fixed, past instants described. So
 * these are FUNCTIONS of the moment asked, the `HOURS_FROM_NOW` rule below taken one step further:
 * computed per request rather than once at load, so a mock left running all day stays honest.
 */
const at = (now: number, minutes: number): string =>
  new Date(now + minutes * 60_000).toISOString()

/** The key an agent or intake session answers once — never a real one. */
export const MOCK_MODEL_KEY = 'sk-mock-not-a-real-key'
/** Where a key is used: the document's example, the laptop's LiteLLM. */
export const MODEL_BASE_URL = 'http://127.0.0.1:7106/v1'
const AGENT_MODELS = [
  'default-chat',
  'default-chat-onprem',
  'default-chat-large',
  'default-embed',
]
/**
 * A `confidential` project's, while the platform lets its building agent use the capable model (§7,
 * Spec action 10; the front-end enablement plan's Task 14a) — the on-premise models, then the capable one.
 */
const CONFIDENTIAL_AGENT_MODELS = [
  'default-chat-onprem',
  'default-chat-onprem-reasoning',
  'default-chat-large',
]

/** The models `mock-app`'s agent sessions hold: `MANIFEST_MOCK_CONFIDENTIAL=1` makes them the confidential list. */
export const agentModels = (confidential: boolean): string[] =>
  confidential ? CONFIDENTIAL_AGENT_MODELS : AGENT_MODELS

/** What the gateway says when it cannot say what was spent — the platform's own words. */
export const SPEND_UNKNOWN =
  'the model gateway did not answer, so what it has spent is not known right now'

export function agentSession(
  now: number,
  fields: Partial<Schemas['AgentSession']> & { id: string },
): Schemas['AgentSession'] {
  return {
    projectId: PROJECT_ID,
    name: 'Build the bulletin board',
    person: { id: ME.id, name: ME.displayName },
    via: null,
    models: AGENT_MODELS,
    capUsd: 2,
    expiresAt: at(now, 55),
    state: 'active',
    endedAt: null,
    endReason: null,
    spentUsd: 0.4,
    spentUnavailable: null,
    createdAt: at(now, -5),
    ...fields,
  }
}

/** `mock-app`'s sessions, newest first: one running, one ended an hour ago. */
export function agentSessions(
  now: number,
  spend: 'known' | 'unavailable',
  confidential = false,
): Schemas['AgentSessionList'] {
  const unknown =
    spend === 'unavailable' ? { spentUsd: null, spentUnavailable: SPEND_UNKNOWN } : {}
  const models = agentModels(confidential)
  return {
    sessions: [
      agentSession(now, { id: AGENT_SESSION_ID, models, ...unknown }),
      agentSession(now, {
        id: ENDED_AGENT_SESSION_ID,
        models,
        name: 'Fix the sign-in page',
        state: 'ended',
        endedAt: at(now, -60),
        endReason: 'ended',
        expiresAt: at(now, -30),
        createdAt: at(now, -90),
        spentUsd: 0.25,
        ...unknown,
      }),
    ],
    truncated: false,
  }
}

/** Instructor One's month: $10, of which $0.65 is spent — or all of it, or unreadable. */
export function agentBudget(
  now: number,
  state: 'ok' | 'exhausted' | 'unavailable',
): Schemas['AgentBudget'] {
  const date = new Date(now)
  const resetsAt = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  ).toISOString()
  if (state === 'unavailable')
    return {
      monthlyUsd: 10,
      spentUsd: null,
      remainingUsd: null,
      resetsAt: null,
      unavailable: SPEND_UNKNOWN,
    }
  const spentUsd = state === 'exhausted' ? 10 : 0.65
  return {
    monthlyUsd: 10,
    spentUsd,
    remainingUsd: Math.round((10 - spentUsd) * 1e6) / 1e6,
    resetsAt,
    unavailable: null,
  }
}

/** The intake session: the platform's intake model, $0.25 of the platform's money, 30 minutes. */
export function intakeSession(
  now: number,
  fields: Partial<Schemas['IntakeSession']> = {},
): Schemas['IntakeSession'] {
  return {
    id: INTAKE_SESSION_ID,
    model: 'default-chat',
    capUsd: 0.25,
    expiresAt: at(now, 30),
    state: 'active',
    endedAt: null,
    createdAt: at(now, 0),
    ...fields,
  }
}

/**
 * A DEADLINE IS THE ONE FIXTURE VALUE THAT MUST NOT BE A FIXED INSTANT, and this file's own
 * rule says the opposite for every other one. Measured in a browser on 2026-09-19: with a
 * fixed `expiresAt`, the queue's only `pending` row had already lapsed by the wall clock, so
 * Decision 8's `displayState` correctly rendered it **expired with no buttons** — and a
 * front-end developer driving the mock could never reach the screen's whole point. The
 * INSTANTS stay fixed (a value that changes per run cannot be asserted); the DEADLINE is
 * computed, because its meaning is entirely relative to now.
 */
const HOURS_FROM_NOW = (hours: number): string =>
  new Date(Date.now() + hours * 3_600_000).toISOString()

export const PENDING_ACTION: Schemas['PendingAction'] = {
  id: PENDING_ACTION_ID,
  projectId: PROJECT_ID,
  tokenId: TOKEN_ID,
  action: 'members:manage',
  state: 'pending',
  method: 'POST',
  path: `/v1/projects/${PROJECT_ID}/members`,
  bodySha256: '0aa6131a7f3b5c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f',
  summary: 'add a member to this project',
  expiresAt: HOURS_FROM_NOW(24),
  createdAt: ISO,
  resolvedAt: null,
  waitingSeconds: 42,
  reason: null,
  consumedAt: null,
}

/** Confirmed and NOT yet retried — the state whose only reader is the *Check* button. */
export const CONFIRMED_ACTION: Schemas['PendingAction'] = {
  ...PENDING_ACTION,
  id: CONFIRMED_ACTION_ID,
  state: 'confirmed',
  resolvedAt: ISO,
  waitingSeconds: 42,
}

export const REJECTED_ACTION: Schemas['PendingAction'] = {
  ...PENDING_ACTION,
  id: REJECTED_ACTION_ID,
  state: 'rejected',
  resolvedAt: ISO,
  reason: 'that student is not on this course',
}

/**
 * A row still stored `pending` whose life ran out — Decision 8's whole case. The screen
 * renders it `expired` with no buttons FROM THE TIMESTAMP, without the boot sweeper having
 * run, which is why this plan gave the sweeper no timer.
 */
export const LAPSED_ACTION: Schemas['PendingAction'] = {
  ...PENDING_ACTION,
  id: LAPSED_ACTION_ID,
  // The same ASK as the others, with a different body: the first draft made this one
  // `quota:set` and left the members path under it, which is a row no agent could have
  // produced — Phase 1 has no quota route at all, so nothing can be refused for that
  // capability. A mock is only useful while every row is one the platform could have written.
  bodySha256: '1bb7242b8f4c6d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70',
  expiresAt: HOURS_FROM_NOW(-2),
}

/** All four states at once, which is what a person answering the queue has to read. */
export const PENDING_ACTIONS: Schemas['PendingActionList'] = [
  PENDING_ACTION,
  CONFIRMED_ACTION,
  REJECTED_ACTION,
  LAPSED_ACTION,
]

export const FLEET: Schemas['Fleet'] = [
  {
    id: PROJECT_ID,
    slug: 'mock-app',
    // The launch path plan's Task 12 (M3): its name, and that it is switched on.
    name: 'Mock course app',
    state: 'active',
    archivedAt: null,
    blueprint: 'node-ts-mongo@1',
    starter: 'proof-app',
    owner: {
      id: USER_ID,
      displayName: 'Instructor One',
      email: 'instructor@example.test',
    },
    audience: AUDIENCE,
    createdAt: ISO,
    slugReserved: false,
    environments: [
      {
        kind: 'staging',
        hostname: 'mock-app.staging.manifest.internal',
        state: 'healthy',
        releaseId: RELEASE_ID,
        imageDigest: BUILD.imageDigest,
        lastDeployAt: ISO,
        latestIncidentAt: null,
      },
    ],
  },
]

/**
 * WHAT `validate.test.ts` READS: `[the schema's name in the document, the value]`. A fixture
 * that is not in this table is not checked — so a value the routing table answers with and
 * this table does not name is exactly the mock lying that Decision 10 is about.
 *
 * `server.ts` names the same schema per route and validates on the way OUT as well, so the
 * two are checked from both ends.
 */
/**
 * WHAT EACH ENVIRONMENT REGISTERS WITH (the launch path plan's Task 13): its certificate — the PUBLIC
 * half Manifest minted for it once (D20), a real X.509 certificate made for this mock with the
 * platform's own `openssl` arguments and its private key discarded at once: no private key exists
 * anywhere in this package — and its SP metadata in UBC's structure, rendered by the platform's own
 * `assemblePackage` from these values. Generated once, 2026-10-01; a change to the renderer is
 * caught by nothing here, only by the next generation.
 */
const CERTIFICATES: Record<
  'staging' | 'production',
  Schemas['RegistrationPackage']['certificate']
> = {
  staging: {
    pem: '-----BEGIN CERTIFICATE-----\nMIIFeTCCA2GgAwIBAgIUfZzzWNbuaSLgMHCAZ6jFZ1+PEUgwDQYJKoZIhvcNAQEL\nBQAwLjEZMBcGA1UEAwwQbW9jay1hcHAtc3RhZ2luZzERMA8GA1UECgwITWFuaWZl\nc3QwHhcNMjYwOTA1MTYxMjAwWhcNMjgwOTA0MTYxMjAwWjAuMRkwFwYDVQQDDBBt\nb2NrLWFwcC1zdGFnaW5nMREwDwYDVQQKDAhNYW5pZmVzdDCCAiIwDQYJKoZIhvcN\nAQEBBQADggIPADCCAgoCggIBAOteWwg7mNldInbWoZyzEo0U0NE4/W150C5fNam5\nRnyKSEta9aYpHo6InAfZEfgs9GmM4/5msmgWh3fCaISKO8BFo6XBM48X97r8G/Mn\n34MOuOhV+m/k5l+qpB1Kw+0huQmM1oeCfjUu9qu1mLVRE0Y5G5NlA0F6IdGVgPAE\nKA+Z4guf4FAJeJxHKifbCu2MgKAm0p5EsPpSG0YuJsO9sWdj5P9PPZYGWY6s6B2P\nO6558+LmtEpOuJdtxrd/FLcnJ4Spdvvilt9TtqEveq1mRJFqSRtXZy+daz7zLM7i\n6Ls/oYWmJhlCp1ajnY1iENwOK2v0mK0VOMlYFLfTYdS5mVbbuPxksJwVbrPZqIXj\nqSbH7gesZc7FeQqPo6GAjpviXkIUNkNkVK4hpgfubNt6KtGhiC8rEmsQCOIB9v6r\nWbvSE+kkUwjqjEvWJ1qFJnmNcepny6ATbCQ3WYhKFoFMxXXpmZPP2szQojDmJfrR\njq1zTQmCYfLt3sQpSMk4IEh0RR/QqpFvYeBkK2ot4RX0bQ9wUGSoNHY1bx8drZzw\nPhUDuCoY06EvGK2EKRihkPuraQ/0+F9mX7HT9leIWm/U6D/puzKaQUHtxH0rGL0n\n+wpmwhJiThXexGKTeXzLJLzPQ5U6yMHce4ge39ZWH1HKeSgegLXzZQE2vCnliqbA\ncHLlAgMBAAGjgY4wgYswHQYDVR0OBBYEFNrElTAxGEjsxeqcpXkF+4VEQQoxMB8G\nA1UdIwQYMBaAFNrElTAxGEjsxeqcpXkF+4VEQQoxMA8GA1UdEwEB/wQFMAMBAf8w\nOAYDVR0RBDEwL4YtaHR0cHM6Ly9tYW5pZmVzdC5pbnRlcm5hbC9zcC9tb2NrLWFw\ncC9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCbK15feT7yCdYd2iTfqYQoxKpO\naCxXqUJdnYeEz/gCiBQGutgFL3wEtPlXweym+prJF4vZdgGUCFFdauexlw/gYdD7\no4a3YHGUgfBkyR7iTNYnhNuVfFSPJFgFh4CSJi/HsuJPv7k9NDj0BGojDEXcxVLf\nduP99SM8i+m77io5PAu8t6R14idh08RNBMTrvU9d/3ywEV98eTO9MUxjMBlZMMwP\nIMFhH24rCc9OnBl529IFqk+/TXCQRV0v4o0X+4FjZx0oX6QUVg0gaxymWS5FypM/\nwNkRIYs5UeSwN3kJmzBYSabAB+UJokYaEn2HKgfWpR8l6kfTNRKa5qpWyOJDiWsG\nrql/nexpP+/5TYcJmHUBR6q/l60Z19MCw1WVVx3GIjK7oFTuwJwD6NpkvGumgkvQ\njgsJLm1CgNVCcTyT63WovY/RVSoeVEsTr8R4qKnG0mf472CTWiULoFefOXRj181m\nr23xO0xQKpXHYZfIkzDsMQOMl+d+ofwfYg5EWFCeZURVvV1FmoHYv2n131nPYV/J\ntZavkSoZX3Wuvc99IqWMlNNoDzIxmmPzfJfI26W8MXUTNWghvUkXReLOWavZLSfq\n0tlaINpO0nnJ71Y3IDFqD7MJtfY5p19n1PX36J2xy8BhUJH+f9D1bTkeSQ2sX6bl\nXYczz7vBkVi70pCuNg==\n-----END CERTIFICATE-----\n',
    fingerprint:
      'B0:39:FD:F9:7F:AD:3C:71:79:46:70:F3:BF:A7:90:A6:AF:F0:C5:CF:11:78:A5:2E:50:46:CE:3C:08:48:70:10',
    expiresAt: '2028-09-04T16:12:00.000Z',
  },
  production: {
    pem: '-----BEGIN CERTIFICATE-----\nMIIFgjCCA2qgAwIBAgIUA/B74ZTBhTIidSvC8MUPgJT731MwDQYJKoZIhvcNAQEL\nBQAwMTEcMBoGA1UEAwwTbW9jay1hcHAtcHJvZHVjdGlvbjERMA8GA1UECgwITWFu\naWZlc3QwHhcNMjYwOTA5MTYxMjAwWhcNMjgwOTA4MTYxMjAwWjAxMRwwGgYDVQQD\nDBNtb2NrLWFwcC1wcm9kdWN0aW9uMREwDwYDVQQKDAhNYW5pZmVzdDCCAiIwDQYJ\nKoZIhvcNAQEBBQADggIPADCCAgoCggIBAJLxmInw3065Yaku2d9JzO5YgC1QntSP\nfNOvIvHi+CZeO6gtPlu94zYToTSH2K5xNFGKCYinm+J/EY7SDxYqW6SzELRSn42I\nlKPt9eO+QYi83LJIsn8Eg44IAmLRJ676goLm/0Bu3kG5j1JDmkt/zQytoVjHIfim\no21kfyuqLUM9GrCQ/87mqLZCs9snHZMp8XOslnp7XA4fGqXE8kdkNjeoetl2mH85\nJHTIkzGGW6yaTDKYPOz98ttp1jlKc9he2TBz27/eAQPnveTc+ywglhC0fZlFJjIa\nHMRYv/n52UujSfomJXlN8Dc0w3u8zNnkF7HSxu1I1SZ8xSpAQVo5ZfDDakKCZySg\ndda3kpCM6AH0BQ5JgPFSLk3PhVKlj8xby86SpxpfePlPyJSoVWu9+2bkXlqGSRty\nbuGuNaufDiPuvsAY5YzEqpG6xBRrgiKxDuxjQfx3NFby3mbXSJXn07n05HTQ5y3a\n6nAepnn1XrZV8YGrmPN9s6e43+exkeIGAIx2PeHO8LwbU57w7wKB+fAtRnQ8vt4n\nbtM9JhSIvsyiJRDdW3UZJ6Pyq9YuN+bL880TwCju0ToT06rYrTy6cUchvYBHj+5n\ncAsT28+M84Y9FOShkbWcqMu6KdHlZjRAs96jMqqJFtgzsh4bRAfvTJhpzGIZ2aam\nDyJsGJuaBgzRAgMBAAGjgZEwgY4wHQYDVR0OBBYEFFSNAJTYfflhIhUzPp20b6Be\nwuAdMB8GA1UdIwQYMBaAFFSNAJTYfflhIhUzPp20b6BewuAdMA8GA1UdEwEB/wQF\nMAMBAf8wOwYDVR0RBDQwMoYwaHR0cHM6Ly9tYW5pZmVzdC5pbnRlcm5hbC9zcC9t\nb2NrLWFwcC9wcm9kdWN0aW9uMA0GCSqGSIb3DQEBCwUAA4ICAQBpWpjSWJJezwsN\nZuNR/XPlLDE3idvZP+wJpI/dou03Ux+say5Y1WpIyxeqfV39y4pQUZALhTjqi+gW\n2pJJZS9oIZBPy+4UV1vVDdwU0USFN6gNw7oun1EdBgu5JsAfr93Vb4DV8kdWa9mY\nwjbahIyDPzzyYsvOT2BnMlbvbE2jZJpZ9EKVwt1aSy28STJrpUZwmMXTgtQf8T0w\nA77QbMYIaj1VuCOIgBBxljEbknjLTwYT6VwaKSEZ/ibJzOpxYpeZKc31eTtSLH1l\n/NR0TxLcHMTIVssdThUtNDkfidHSnbo0BjNydVili6V+3CUPgXB2ZvjKo/bQuyZL\nZBttgekYaLRcIVbAu/QtJX7zfygcFELQ/mIoKanVkuaFxqCJUpyUY8mjKLsDXd4i\nBZG1NOLOAYIxDjFszeV8koMHLTg8yCLm1WPPPr/rebB5XFKy29HPKuwA1V2olKLF\naYK3VTbAqJ5VfupEVws2+sOT+dSUTwswu/vKwdPiItCGYOTaWSjkU/pO5FIidrFF\nq6B5DF4T10vEtBmwrlWPXXI1opfNszA8ZTggzf+05lX824JEY7zyPvhpyY2YCu7n\nKqWhnDy+EGgnJ+jti5G92YjijHt2uoHg7II7efuZzv9kBhoBIsljf7iwvv+a8g9z\nrHYIp5isqzER8M6JN2fq07D9Z8IqDg==\n-----END CERTIFICATE-----\n',
    fingerprint:
      '5E:69:65:97:1F:3C:6C:7A:95:EB:96:D1:06:22:D1:51:5B:DA:CF:03:25:AC:4B:3A:4B:09:27:18:42:47:70:D7',
    expiresAt: '2028-09-08T16:12:00.000Z',
  },
}

const METADATA_XML: Record<'staging' | 'production', string> = {
  staging:
    '<?xml version="1.0" encoding="UTF-8"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="_fed270105fc87a1667db5022e5f0eafc" entityID="https://manifest.internal/sp/mock-app/staging">\n\n  <md:Extensions>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha384"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n  </md:Extensions>\n\n  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <md:KeyDescriptor use="signing">\n      <ds:KeyInfo>\n        <ds:KeyName>mock-app.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=mock-app-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFeTCCA2GgAwIBAgIUfZzzWNbuaSLgMHCAZ6jFZ1+PEUgwDQYJKoZIhvcNAQEL\nBQAwLjEZMBcGA1UEAwwQbW9jay1hcHAtc3RhZ2luZzERMA8GA1UECgwITWFuaWZl\nc3QwHhcNMjYwOTA1MTYxMjAwWhcNMjgwOTA0MTYxMjAwWjAuMRkwFwYDVQQDDBBt\nb2NrLWFwcC1zdGFnaW5nMREwDwYDVQQKDAhNYW5pZmVzdDCCAiIwDQYJKoZIhvcN\nAQEBBQADggIPADCCAgoCggIBAOteWwg7mNldInbWoZyzEo0U0NE4/W150C5fNam5\nRnyKSEta9aYpHo6InAfZEfgs9GmM4/5msmgWh3fCaISKO8BFo6XBM48X97r8G/Mn\n34MOuOhV+m/k5l+qpB1Kw+0huQmM1oeCfjUu9qu1mLVRE0Y5G5NlA0F6IdGVgPAE\nKA+Z4guf4FAJeJxHKifbCu2MgKAm0p5EsPpSG0YuJsO9sWdj5P9PPZYGWY6s6B2P\nO6558+LmtEpOuJdtxrd/FLcnJ4Spdvvilt9TtqEveq1mRJFqSRtXZy+daz7zLM7i\n6Ls/oYWmJhlCp1ajnY1iENwOK2v0mK0VOMlYFLfTYdS5mVbbuPxksJwVbrPZqIXj\nqSbH7gesZc7FeQqPo6GAjpviXkIUNkNkVK4hpgfubNt6KtGhiC8rEmsQCOIB9v6r\nWbvSE+kkUwjqjEvWJ1qFJnmNcepny6ATbCQ3WYhKFoFMxXXpmZPP2szQojDmJfrR\njq1zTQmCYfLt3sQpSMk4IEh0RR/QqpFvYeBkK2ot4RX0bQ9wUGSoNHY1bx8drZzw\nPhUDuCoY06EvGK2EKRihkPuraQ/0+F9mX7HT9leIWm/U6D/puzKaQUHtxH0rGL0n\n+wpmwhJiThXexGKTeXzLJLzPQ5U6yMHce4ge39ZWH1HKeSgegLXzZQE2vCnliqbA\ncHLlAgMBAAGjgY4wgYswHQYDVR0OBBYEFNrElTAxGEjsxeqcpXkF+4VEQQoxMB8G\nA1UdIwQYMBaAFNrElTAxGEjsxeqcpXkF+4VEQQoxMA8GA1UdEwEB/wQFMAMBAf8w\nOAYDVR0RBDEwL4YtaHR0cHM6Ly9tYW5pZmVzdC5pbnRlcm5hbC9zcC9tb2NrLWFw\ncC9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCbK15feT7yCdYd2iTfqYQoxKpO\naCxXqUJdnYeEz/gCiBQGutgFL3wEtPlXweym+prJF4vZdgGUCFFdauexlw/gYdD7\no4a3YHGUgfBkyR7iTNYnhNuVfFSPJFgFh4CSJi/HsuJPv7k9NDj0BGojDEXcxVLf\nduP99SM8i+m77io5PAu8t6R14idh08RNBMTrvU9d/3ywEV98eTO9MUxjMBlZMMwP\nIMFhH24rCc9OnBl529IFqk+/TXCQRV0v4o0X+4FjZx0oX6QUVg0gaxymWS5FypM/\nwNkRIYs5UeSwN3kJmzBYSabAB+UJokYaEn2HKgfWpR8l6kfTNRKa5qpWyOJDiWsG\nrql/nexpP+/5TYcJmHUBR6q/l60Z19MCw1WVVx3GIjK7oFTuwJwD6NpkvGumgkvQ\njgsJLm1CgNVCcTyT63WovY/RVSoeVEsTr8R4qKnG0mf472CTWiULoFefOXRj181m\nr23xO0xQKpXHYZfIkzDsMQOMl+d+ofwfYg5EWFCeZURVvV1FmoHYv2n131nPYV/J\ntZavkSoZX3Wuvc99IqWMlNNoDzIxmmPzfJfI26W8MXUTNWghvUkXReLOWavZLSfq\n0tlaINpO0nnJ71Y3IDFqD7MJtfY5p19n1PX36J2xy8BhUJH+f9D1bTkeSQ2sX6bl\nXYczz7vBkVi70pCuNg==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n    </md:KeyDescriptor>\n\n    <md:KeyDescriptor use="encryption">\n      <ds:KeyInfo>\n        <ds:KeyName>mock-app.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=mock-app-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFeTCCA2GgAwIBAgIUfZzzWNbuaSLgMHCAZ6jFZ1+PEUgwDQYJKoZIhvcNAQEL\nBQAwLjEZMBcGA1UEAwwQbW9jay1hcHAtc3RhZ2luZzERMA8GA1UECgwITWFuaWZl\nc3QwHhcNMjYwOTA1MTYxMjAwWhcNMjgwOTA0MTYxMjAwWjAuMRkwFwYDVQQDDBBt\nb2NrLWFwcC1zdGFnaW5nMREwDwYDVQQKDAhNYW5pZmVzdDCCAiIwDQYJKoZIhvcN\nAQEBBQADggIPADCCAgoCggIBAOteWwg7mNldInbWoZyzEo0U0NE4/W150C5fNam5\nRnyKSEta9aYpHo6InAfZEfgs9GmM4/5msmgWh3fCaISKO8BFo6XBM48X97r8G/Mn\n34MOuOhV+m/k5l+qpB1Kw+0huQmM1oeCfjUu9qu1mLVRE0Y5G5NlA0F6IdGVgPAE\nKA+Z4guf4FAJeJxHKifbCu2MgKAm0p5EsPpSG0YuJsO9sWdj5P9PPZYGWY6s6B2P\nO6558+LmtEpOuJdtxrd/FLcnJ4Spdvvilt9TtqEveq1mRJFqSRtXZy+daz7zLM7i\n6Ls/oYWmJhlCp1ajnY1iENwOK2v0mK0VOMlYFLfTYdS5mVbbuPxksJwVbrPZqIXj\nqSbH7gesZc7FeQqPo6GAjpviXkIUNkNkVK4hpgfubNt6KtGhiC8rEmsQCOIB9v6r\nWbvSE+kkUwjqjEvWJ1qFJnmNcepny6ATbCQ3WYhKFoFMxXXpmZPP2szQojDmJfrR\njq1zTQmCYfLt3sQpSMk4IEh0RR/QqpFvYeBkK2ot4RX0bQ9wUGSoNHY1bx8drZzw\nPhUDuCoY06EvGK2EKRihkPuraQ/0+F9mX7HT9leIWm/U6D/puzKaQUHtxH0rGL0n\n+wpmwhJiThXexGKTeXzLJLzPQ5U6yMHce4ge39ZWH1HKeSgegLXzZQE2vCnliqbA\ncHLlAgMBAAGjgY4wgYswHQYDVR0OBBYEFNrElTAxGEjsxeqcpXkF+4VEQQoxMB8G\nA1UdIwQYMBaAFNrElTAxGEjsxeqcpXkF+4VEQQoxMA8GA1UdEwEB/wQFMAMBAf8w\nOAYDVR0RBDEwL4YtaHR0cHM6Ly9tYW5pZmVzdC5pbnRlcm5hbC9zcC9tb2NrLWFw\ncC9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCbK15feT7yCdYd2iTfqYQoxKpO\naCxXqUJdnYeEz/gCiBQGutgFL3wEtPlXweym+prJF4vZdgGUCFFdauexlw/gYdD7\no4a3YHGUgfBkyR7iTNYnhNuVfFSPJFgFh4CSJi/HsuJPv7k9NDj0BGojDEXcxVLf\nduP99SM8i+m77io5PAu8t6R14idh08RNBMTrvU9d/3ywEV98eTO9MUxjMBlZMMwP\nIMFhH24rCc9OnBl529IFqk+/TXCQRV0v4o0X+4FjZx0oX6QUVg0gaxymWS5FypM/\nwNkRIYs5UeSwN3kJmzBYSabAB+UJokYaEn2HKgfWpR8l6kfTNRKa5qpWyOJDiWsG\nrql/nexpP+/5TYcJmHUBR6q/l60Z19MCw1WVVx3GIjK7oFTuwJwD6NpkvGumgkvQ\njgsJLm1CgNVCcTyT63WovY/RVSoeVEsTr8R4qKnG0mf472CTWiULoFefOXRj181m\nr23xO0xQKpXHYZfIkzDsMQOMl+d+ofwfYg5EWFCeZURVvV1FmoHYv2n131nPYV/J\ntZavkSoZX3Wuvc99IqWMlNNoDzIxmmPzfJfI26W8MXUTNWghvUkXReLOWavZLSfq\n0tlaINpO0nnJ71Y3IDFqD7MJtfY5p19n1PX36J2xy8BhUJH+f9D1bTkeSQ2sX6bl\nXYczz7vBkVi70pCuNg==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>\n    </md:KeyDescriptor>\n\n    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://mock-app.staging.manifest.internal/auth/logout"/>\n\n    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://mock-app.staging.manifest.internal/auth/ubcshib/callback" index="1" isDefault="true"/>\n  </md:SPSSODescriptor>\n\n  <md:Organization>\n    <md:OrganizationName>University of British Columbia</md:OrganizationName>\n    <md:OrganizationDisplayName>University of British Columbia</md:OrganizationDisplayName>\n    <md:OrganizationURL>https://www.ubc.ca</md:OrganizationURL>\n  </md:Organization>\n\n  <md:ContactPerson contactType="technical">\n    <md:EmailAddress>instructor@example.test</md:EmailAddress>\n  </md:ContactPerson>\n  <md:ContactPerson contactType="support">\n    <md:EmailAddress>manifest-support@example.test</md:EmailAddress>\n  </md:ContactPerson>\n\n</md:EntityDescriptor>\n',
  production:
    '<?xml version="1.0" encoding="UTF-8"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="_3b700bfeaaa6bfb2f34fa61185a2e526" entityID="https://manifest.internal/sp/mock-app/production">\n\n  <md:Extensions>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha384"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n  </md:Extensions>\n\n  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <md:KeyDescriptor use="signing">\n      <ds:KeyInfo>\n        <ds:KeyName>mock-app.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=mock-app-production</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFgjCCA2qgAwIBAgIUA/B74ZTBhTIidSvC8MUPgJT731MwDQYJKoZIhvcNAQEL\nBQAwMTEcMBoGA1UEAwwTbW9jay1hcHAtcHJvZHVjdGlvbjERMA8GA1UECgwITWFu\naWZlc3QwHhcNMjYwOTA5MTYxMjAwWhcNMjgwOTA4MTYxMjAwWjAxMRwwGgYDVQQD\nDBNtb2NrLWFwcC1wcm9kdWN0aW9uMREwDwYDVQQKDAhNYW5pZmVzdDCCAiIwDQYJ\nKoZIhvcNAQEBBQADggIPADCCAgoCggIBAJLxmInw3065Yaku2d9JzO5YgC1QntSP\nfNOvIvHi+CZeO6gtPlu94zYToTSH2K5xNFGKCYinm+J/EY7SDxYqW6SzELRSn42I\nlKPt9eO+QYi83LJIsn8Eg44IAmLRJ676goLm/0Bu3kG5j1JDmkt/zQytoVjHIfim\no21kfyuqLUM9GrCQ/87mqLZCs9snHZMp8XOslnp7XA4fGqXE8kdkNjeoetl2mH85\nJHTIkzGGW6yaTDKYPOz98ttp1jlKc9he2TBz27/eAQPnveTc+ywglhC0fZlFJjIa\nHMRYv/n52UujSfomJXlN8Dc0w3u8zNnkF7HSxu1I1SZ8xSpAQVo5ZfDDakKCZySg\ndda3kpCM6AH0BQ5JgPFSLk3PhVKlj8xby86SpxpfePlPyJSoVWu9+2bkXlqGSRty\nbuGuNaufDiPuvsAY5YzEqpG6xBRrgiKxDuxjQfx3NFby3mbXSJXn07n05HTQ5y3a\n6nAepnn1XrZV8YGrmPN9s6e43+exkeIGAIx2PeHO8LwbU57w7wKB+fAtRnQ8vt4n\nbtM9JhSIvsyiJRDdW3UZJ6Pyq9YuN+bL880TwCju0ToT06rYrTy6cUchvYBHj+5n\ncAsT28+M84Y9FOShkbWcqMu6KdHlZjRAs96jMqqJFtgzsh4bRAfvTJhpzGIZ2aam\nDyJsGJuaBgzRAgMBAAGjgZEwgY4wHQYDVR0OBBYEFFSNAJTYfflhIhUzPp20b6Be\nwuAdMB8GA1UdIwQYMBaAFFSNAJTYfflhIhUzPp20b6BewuAdMA8GA1UdEwEB/wQF\nMAMBAf8wOwYDVR0RBDQwMoYwaHR0cHM6Ly9tYW5pZmVzdC5pbnRlcm5hbC9zcC9t\nb2NrLWFwcC9wcm9kdWN0aW9uMA0GCSqGSIb3DQEBCwUAA4ICAQBpWpjSWJJezwsN\nZuNR/XPlLDE3idvZP+wJpI/dou03Ux+say5Y1WpIyxeqfV39y4pQUZALhTjqi+gW\n2pJJZS9oIZBPy+4UV1vVDdwU0USFN6gNw7oun1EdBgu5JsAfr93Vb4DV8kdWa9mY\nwjbahIyDPzzyYsvOT2BnMlbvbE2jZJpZ9EKVwt1aSy28STJrpUZwmMXTgtQf8T0w\nA77QbMYIaj1VuCOIgBBxljEbknjLTwYT6VwaKSEZ/ibJzOpxYpeZKc31eTtSLH1l\n/NR0TxLcHMTIVssdThUtNDkfidHSnbo0BjNydVili6V+3CUPgXB2ZvjKo/bQuyZL\nZBttgekYaLRcIVbAu/QtJX7zfygcFELQ/mIoKanVkuaFxqCJUpyUY8mjKLsDXd4i\nBZG1NOLOAYIxDjFszeV8koMHLTg8yCLm1WPPPr/rebB5XFKy29HPKuwA1V2olKLF\naYK3VTbAqJ5VfupEVws2+sOT+dSUTwswu/vKwdPiItCGYOTaWSjkU/pO5FIidrFF\nq6B5DF4T10vEtBmwrlWPXXI1opfNszA8ZTggzf+05lX824JEY7zyPvhpyY2YCu7n\nKqWhnDy+EGgnJ+jti5G92YjijHt2uoHg7II7efuZzv9kBhoBIsljf7iwvv+a8g9z\nrHYIp5isqzER8M6JN2fq07D9Z8IqDg==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n    </md:KeyDescriptor>\n\n    <md:KeyDescriptor use="encryption">\n      <ds:KeyInfo>\n        <ds:KeyName>mock-app.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=mock-app-production</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFgjCCA2qgAwIBAgIUA/B74ZTBhTIidSvC8MUPgJT731MwDQYJKoZIhvcNAQEL\nBQAwMTEcMBoGA1UEAwwTbW9jay1hcHAtcHJvZHVjdGlvbjERMA8GA1UECgwITWFu\naWZlc3QwHhcNMjYwOTA5MTYxMjAwWhcNMjgwOTA4MTYxMjAwWjAxMRwwGgYDVQQD\nDBNtb2NrLWFwcC1wcm9kdWN0aW9uMREwDwYDVQQKDAhNYW5pZmVzdDCCAiIwDQYJ\nKoZIhvcNAQEBBQADggIPADCCAgoCggIBAJLxmInw3065Yaku2d9JzO5YgC1QntSP\nfNOvIvHi+CZeO6gtPlu94zYToTSH2K5xNFGKCYinm+J/EY7SDxYqW6SzELRSn42I\nlKPt9eO+QYi83LJIsn8Eg44IAmLRJ676goLm/0Bu3kG5j1JDmkt/zQytoVjHIfim\no21kfyuqLUM9GrCQ/87mqLZCs9snHZMp8XOslnp7XA4fGqXE8kdkNjeoetl2mH85\nJHTIkzGGW6yaTDKYPOz98ttp1jlKc9he2TBz27/eAQPnveTc+ywglhC0fZlFJjIa\nHMRYv/n52UujSfomJXlN8Dc0w3u8zNnkF7HSxu1I1SZ8xSpAQVo5ZfDDakKCZySg\ndda3kpCM6AH0BQ5JgPFSLk3PhVKlj8xby86SpxpfePlPyJSoVWu9+2bkXlqGSRty\nbuGuNaufDiPuvsAY5YzEqpG6xBRrgiKxDuxjQfx3NFby3mbXSJXn07n05HTQ5y3a\n6nAepnn1XrZV8YGrmPN9s6e43+exkeIGAIx2PeHO8LwbU57w7wKB+fAtRnQ8vt4n\nbtM9JhSIvsyiJRDdW3UZJ6Pyq9YuN+bL880TwCju0ToT06rYrTy6cUchvYBHj+5n\ncAsT28+M84Y9FOShkbWcqMu6KdHlZjRAs96jMqqJFtgzsh4bRAfvTJhpzGIZ2aam\nDyJsGJuaBgzRAgMBAAGjgZEwgY4wHQYDVR0OBBYEFFSNAJTYfflhIhUzPp20b6Be\nwuAdMB8GA1UdIwQYMBaAFFSNAJTYfflhIhUzPp20b6BewuAdMA8GA1UdEwEB/wQF\nMAMBAf8wOwYDVR0RBDQwMoYwaHR0cHM6Ly9tYW5pZmVzdC5pbnRlcm5hbC9zcC9t\nb2NrLWFwcC9wcm9kdWN0aW9uMA0GCSqGSIb3DQEBCwUAA4ICAQBpWpjSWJJezwsN\nZuNR/XPlLDE3idvZP+wJpI/dou03Ux+say5Y1WpIyxeqfV39y4pQUZALhTjqi+gW\n2pJJZS9oIZBPy+4UV1vVDdwU0USFN6gNw7oun1EdBgu5JsAfr93Vb4DV8kdWa9mY\nwjbahIyDPzzyYsvOT2BnMlbvbE2jZJpZ9EKVwt1aSy28STJrpUZwmMXTgtQf8T0w\nA77QbMYIaj1VuCOIgBBxljEbknjLTwYT6VwaKSEZ/ibJzOpxYpeZKc31eTtSLH1l\n/NR0TxLcHMTIVssdThUtNDkfidHSnbo0BjNydVili6V+3CUPgXB2ZvjKo/bQuyZL\nZBttgekYaLRcIVbAu/QtJX7zfygcFELQ/mIoKanVkuaFxqCJUpyUY8mjKLsDXd4i\nBZG1NOLOAYIxDjFszeV8koMHLTg8yCLm1WPPPr/rebB5XFKy29HPKuwA1V2olKLF\naYK3VTbAqJ5VfupEVws2+sOT+dSUTwswu/vKwdPiItCGYOTaWSjkU/pO5FIidrFF\nq6B5DF4T10vEtBmwrlWPXXI1opfNszA8ZTggzf+05lX824JEY7zyPvhpyY2YCu7n\nKqWhnDy+EGgnJ+jti5G92YjijHt2uoHg7II7efuZzv9kBhoBIsljf7iwvv+a8g9z\nrHYIp5isqzER8M6JN2fq07D9Z8IqDg==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>\n    </md:KeyDescriptor>\n\n    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://mock-app.manifest.internal/auth/logout"/>\n\n    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://mock-app.manifest.internal/auth/ubcshib/callback" index="1" isDefault="true"/>\n  </md:SPSSODescriptor>\n\n  <md:Organization>\n    <md:OrganizationName>University of British Columbia</md:OrganizationName>\n    <md:OrganizationDisplayName>University of British Columbia</md:OrganizationDisplayName>\n    <md:OrganizationURL>https://www.ubc.ca</md:OrganizationURL>\n  </md:Organization>\n\n  <md:ContactPerson contactType="technical">\n    <md:EmailAddress>instructor@example.test</md:EmailAddress>\n  </md:ContactPerson>\n  <md:ContactPerson contactType="support">\n    <md:EmailAddress>manifest-support@example.test</md:EmailAddress>\n  </md:ContactPerson>\n\n</md:EntityDescriptor>\n',
}

/** Who a package names: the project's owner as its technical contact, and the platform's support. */
const PACKAGE_CONTACTS: Schemas['RegistrationPackage']['contacts'] = {
  technical: [
    {
      name: 'Instructor One',
      email: 'instructor@example.test',
    },
  ],
  support: [
    {
      name: 'Manifest support',
      email: 'manifest-support@example.test',
    },
  ],
}

/**
 * THE ATTRIBUTES, JUSTIFIED BY WHERE THE APP READS THEM — the platform's sentences, verbatim. When the
 * registrations were SENT the app greeted people by their first name; at the release serving staging
 * now it no longer does, so a package drafted from it says `givenName` is asked for and unread.
 */
const ATTRIBUTES_READ: Schemas['RegistrationPackage']['attributes'] = [
  {
    name: 'ubcEduCwlPuid',
    oid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
    purpose:
      'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s.',
    usedAt: [
      {
        path: 'server.js',
        line: 41,
      },
    ],
    justification:
      'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s. The app reads it in server.js:41.',
    unused: false,
  },
  {
    name: 'mail',
    oid: 'urn:oid:0.9.2342.19200300.100.1.3',
    purpose: 'The person’s email address, so the app can show it or write to them.',
    usedAt: [
      {
        path: 'public/app.js',
        line: 12,
      },
    ],
    justification:
      'The person’s email address, so the app can show it or write to them. The app shows it to the person in the browser, in public/app.js:12.',
    unused: false,
  },
  {
    name: 'givenName',
    oid: 'urn:oid:2.5.4.42',
    purpose:
      'The person’s first name, so the app can greet them and show who wrote what.',
    usedAt: [
      {
        path: 'public/app.js',
        line: 13,
      },
    ],
    justification:
      'The person’s first name, so the app can greet them and show who wrote what. The app shows it to the person in the browser, in public/app.js:13.',
    unused: false,
  },
]

const ATTRIBUTES_UNREAD: Schemas['RegistrationPackage']['attributes'] = [
  {
    name: 'ubcEduCwlPuid',
    oid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
    purpose:
      'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s.',
    usedAt: [
      {
        path: 'server.js',
        line: 41,
      },
    ],
    justification:
      'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s. The app reads it in server.js:41.',
    unused: false,
  },
  {
    name: 'mail',
    oid: 'urn:oid:0.9.2342.19200300.100.1.3',
    purpose: 'The person’s email address, so the app can show it or write to them.',
    usedAt: [
      {
        path: 'public/app.js',
        line: 12,
      },
    ],
    justification:
      'The person’s email address, so the app can show it or write to them. The app shows it to the person in the browser, in public/app.js:12.',
    unused: false,
  },
  {
    name: 'givenName',
    oid: 'urn:oid:2.5.4.42',
    purpose:
      'The person’s first name, so the app can greet them and show who wrote what.',
    usedAt: [],
    justification:
      'The app asks for it and does not read it anywhere Manifest looked — remove it from `auth.attributes` before you send this.',
    unused: true,
  },
]

/** A draft's warnings, in the platform's words: the unread attribute, then the missing PIA number. */
const UNREAD_WARNING =
  'The app asks for givenName and does not read it anywhere Manifest looked. Remove it from auth.attributes, validate the manifest and draft this again before you send it — UBC IAM asks why an app needs each attribute.'
const NO_PIA_NUMBER_WARNING =
  'The privacy assessment’s PIA number is not recorded yet, and UBC IAM asks for it. Once an administrator records the assessment approved with its number, draft this again so the package carries it.'

/**
 * THE PRIVACY ASSESSMENT AS IT WAS SENT AGAIN ON 18 SEPTEMBER — the platform's own `assembleAssessment`,
 * run over this mock's manifest (the release's three attributes, its database, `default-chat`, no
 * retention declared), its owner and the Docker driver. Generated once, 2026-10-01.
 */
const ASSESSMENT_DRAFT_SENT: Schemas['PrivacyAssessmentDraft'] = {
  ...{
    project: {
      slug: 'mock-app',
      name: 'Mock course app',
    },
    generatedAt: '2026-09-18T16:30:00.000Z',
    fromCommit: '5f3c1b8e2a4d6f7c9b0e1a2d3c4b5a6978e9f0a1',
    sections: [
      {
        id: 'collected',
        title: 'What personal information the app collects',
        facts: [
          {
            label: 'ubcEduCwlPuid',
            value:
              'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s.',
            source: 'manifest.yaml: auth.attributes',
          },
          {
            label: 'mail',
            value: 'The person’s email address, so the app can show it or write to them.',
            source: 'manifest.yaml: auth.attributes',
          },
          {
            label: 'givenName',
            value:
              'The person’s first name, so the app can greet them and show who wrote what.',
            source: 'manifest.yaml: auth.attributes',
          },
        ],
        gaps: [
          'What the app keeps in its own database — the records it stores about the people who use it, beyond what CWL releases. Manifest cannot see inside the app’s data: describe it here.',
        ],
      },
      {
        id: 'stored',
        title: 'Where it is stored',
        facts: [
          {
            label: 'db',
            value:
              'A mongodb database, version 7.0, which Manifest runs for the app — one in each environment.',
            source: 'manifest.yaml: services',
          },
          {
            label: 'Sandbox',
            value:
              'Where the app is built and tried: its own copy of each database, never backed up.',
            source: 'Manifest’s environments',
          },
          {
            label: 'Staging',
            value:
              'Where the app is tested before launch: its own copy of each database, never backed up.',
            source: 'Manifest’s environments',
          },
          {
            label: 'Production',
            value:
              'Where people use the app: its own copy of each database, not backed up on this platform yet.',
            source: 'Manifest’s environments',
          },
          {
            label: 'Incident logs',
            value:
              'When a deploy of the app fails, Manifest keeps the last 200 lines of the app’s output with the Incident, with secrets removed. They can include what the app printed about the people using it.',
            source: 'the platform',
          },
        ],
        gaps: [
          'Whether this assessment covers the app’s use at staging by real people — colleagues and students signing in to test it — or staging needs cover of its own, is a question for the Privacy Office that is not yet answered: ask it.',
        ],
      },
      {
        id: 'flows',
        title: 'Where it flows',
        facts: [
          {
            label: 'Classification',
            value: 'Low — every AI model the app uses must be approved for low data.',
            source: 'manifest.yaml: data.classification',
          },
          {
            label: 'Outside connections',
            value:
              'The app may connect to nothing outside the platform: every other address is refused.',
            source: 'manifest.yaml: egress.allow',
          },
          {
            label: 'default-chat',
            value:
              'Approved for internal data at most: it may be answered by a provider off-premise, so what the app sends it may leave UBC.',
            source: 'manifest.yaml: ai.models; the model catalogue',
          },
        ],
        gaps: [],
      },
      {
        id: 'retention',
        title: 'How long it is kept, and how it is disposed of',
        facts: [
          {
            label: 'How long',
            value: 'The manifest gives no retention period.',
            source: 'manifest.yaml: data.retention_days',
          },
          {
            label: 'Deletion',
            value:
              'Manifest deletes nothing it keeps for the app on a schedule — neither its databases nor its Incident logs. A project that never launched can be deleted, which destroys its databases; one that has launched cannot be deleted yet.',
            source: 'the platform',
          },
        ],
        gaps: [
          'No retention declared — add data.retention_days to manifest.yaml, with how long the app must keep its data.',
          'How the app’s data is disposed of when the app is retired follows UBC’s sunset procedure, which the Privacy Office has not set out yet: say what should happen to it.',
        ],
      },
      {
        id: 'accountable',
        title: 'Who is accountable',
        facts: [
          {
            label: 'Owner',
            value: 'Instructor One <instructor@example.test>',
            source: 'the project’s members',
          },
          {
            label: 'Platform contact',
            value: 'Manifest support <manifest-support@example.test>',
            source: 'the platform’s contacts',
          },
        ],
        gaps: [
          'Who responds if the app’s data is breached, and how the people affected are told, is not yet set at UBC — the Privacy Office’s procedure is still to come: say who answers for this app meanwhile.',
        ],
      },
      {
        id: 'hosting',
        title: 'Hosting and jurisdiction',
        facts: [
          {
            label: 'Where the app runs',
            value:
              'In containers on the machine Manifest runs on, under its Docker driver.',
            source: 'the platform’s runtime driver',
          },
          {
            label: 'Where its code is kept',
            value: 'In a repository on the machine Manifest runs on.',
            source: 'the project’s repository',
          },
          {
            label: 'default-chat',
            value: 'Approved for internal data at most.',
            source: 'the model catalogue',
          },
        ],
        gaps: [
          'Where UBC will host the app in production is not decided yet: UBC has not chosen the infrastructure Manifest runs on there.',
          'Whether the app’s low data may reach an AI provider outside Canada is the Privacy Office’s to say: default-chat may be answered off-premise.',
        ],
      },
    ],
    warnings: [],
  },
  text: 'Privacy impact assessment — draft\nMock course app (mock-app)\nDrafted by Manifest on September 18, 2026, from commit 5f3c1b8e2a4d.\n\n1. What personal information the app collects\n  - ubcEduCwlPuid: Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s. (from manifest.yaml: auth.attributes)\n  - mail: The person’s email address, so the app can show it or write to them. (from manifest.yaml: auth.attributes)\n  - givenName: The person’s first name, so the app can greet them and show who wrote what. (from manifest.yaml: auth.attributes)\n  For you to add:\n  - What the app keeps in its own database — the records it stores about the people who use it, beyond what CWL releases. Manifest cannot see inside the app’s data: describe it here.\n\n2. Where it is stored\n  - db: A mongodb database, version 7.0, which Manifest runs for the app — one in each environment. (from manifest.yaml: services)\n  - Sandbox: Where the app is built and tried: its own copy of each database, never backed up. (from Manifest’s environments)\n  - Staging: Where the app is tested before launch: its own copy of each database, never backed up. (from Manifest’s environments)\n  - Production: Where people use the app: its own copy of each database, not backed up on this platform yet. (from Manifest’s environments)\n  - Incident logs: When a deploy of the app fails, Manifest keeps the last 200 lines of the app’s output with the Incident, with secrets removed. They can include what the app printed about the people using it. (from the platform)\n  For you to add:\n  - Whether this assessment covers the app’s use at staging by real people — colleagues and students signing in to test it — or staging needs cover of its own, is a question for the Privacy Office that is not yet answered: ask it.\n\n3. Where it flows\n  - Classification: Low — every AI model the app uses must be approved for low data. (from manifest.yaml: data.classification)\n  - Outside connections: The app may connect to nothing outside the platform: every other address is refused. (from manifest.yaml: egress.allow)\n  - default-chat: Approved for internal data at most: it may be answered by a provider off-premise, so what the app sends it may leave UBC. (from manifest.yaml: ai.models; the model catalogue)\n\n4. How long it is kept, and how it is disposed of\n  - How long: The manifest gives no retention period. (from manifest.yaml: data.retention_days)\n  - Deletion: Manifest deletes nothing it keeps for the app on a schedule — neither its databases nor its Incident logs. A project that never launched can be deleted, which destroys its databases; one that has launched cannot be deleted yet. (from the platform)\n  For you to add:\n  - No retention declared — add data.retention_days to manifest.yaml, with how long the app must keep its data.\n  - How the app’s data is disposed of when the app is retired follows UBC’s sunset procedure, which the Privacy Office has not set out yet: say what should happen to it.\n\n5. Who is accountable\n  - Owner: Instructor One <instructor@example.test> (from the project’s members)\n  - Platform contact: Manifest support <manifest-support@example.test> (from the platform’s contacts)\n  For you to add:\n  - Who responds if the app’s data is breached, and how the people affected are told, is not yet set at UBC — the Privacy Office’s procedure is still to come: say who answers for this app meanwhile.\n\n6. Hosting and jurisdiction\n  - Where the app runs: In containers on the machine Manifest runs on, under its Docker driver. (from the platform’s runtime driver)\n  - Where its code is kept: In a repository on the machine Manifest runs on. (from the project’s repository)\n  - default-chat: Approved for internal data at most. (from the model catalogue)\n  For you to add:\n  - Where UBC will host the app in production is not decided yet: UBC has not chosen the infrastructure Manifest runs on there.\n  - Whether the app’s low data may reach an AI provider outside Canada is the Privacy Office’s to say: default-chat may be answered off-premise.\n',
}

/** The commit the SENT packages were drawn from — before the app stopped greeting people by name. */
const SENT_COMMIT = '3e1d0c9b8a7f6e5d4c3b2a1908f7e6d5c4b3a291'

const HOSTS = {
  staging: 'mock-app.staging.manifest.internal',
  production: 'mock-app.manifest.internal',
} as const

/** `sso/entity.ts`'s shapes for `mock-app` — the ACS is the blueprint's default path. */
export const ENTITY = (environment: 'staging' | 'production') => ({
  entityId: `https://manifest.internal/sp/mock-app/${environment}`,
  acsUrl: `https://${HOSTS[environment]}/auth/ubcshib/callback`,
  sloUrl: `https://${HOSTS[environment]}/auth/logout`,
})

/**
 * A REGISTRATION'S PACKAGE AT ONE STAGE OF UBC'S ORDER, as `draftIamRegistration` assembles it:
 * `sent` — what went to UBC IAM, drawn from `SENT_COMMIT` and carrying the PIA number; `drafted` —
 * drawn from the release serving staging before the assessment was approved, so it carries no PIA
 * number and says so; `assessed` — the same draft once the assessment is approved, carrying it.
 */
export function registrationPackage(
  environment: 'staging' | 'production',
  stage: 'sent' | 'drafted' | 'assessed',
  generatedAt: string,
): Schemas['RegistrationPackage'] {
  return {
    environment,
    generatedAt,
    fromCommit: stage === 'sent' ? SENT_COMMIT : COMMIT,
    ...ENTITY(environment),
    certificate: CERTIFICATES[environment],
    attributes: stage === 'sent' ? ATTRIBUTES_READ : ATTRIBUTES_UNREAD,
    usedAtTruncated: false,
    contacts: PACKAGE_CONTACTS,
    privacyAssessmentReference: stage === 'drafted' ? null : 'PIA-2026-0088',
    metadataXml: METADATA_XML[environment],
    warnings:
      stage === 'sent'
        ? []
        : stage === 'drafted'
          ? [UNREAD_WARNING, NO_PIA_NUMBER_WARNING]
          : [UNREAD_WARNING],
  }
}

/** *"September 18, 2026"* — the platform's `vancouverDayInWords`, which the draft's text carries. */
const platformDayInWords = (at: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeZone: 'America/Vancouver',
  }).format(new Date(at))

/** The assessment drafted at another moment: the same rows, its text saying when it was drafted. */
export function assessmentDraft(generatedAt: string): Schemas['PrivacyAssessmentDraft'] {
  return {
    ...ASSESSMENT_DRAFT_SENT,
    generatedAt,
    text: ASSESSMENT_DRAFT_SENT.text.replace(
      /^Drafted by Manifest on .*?, from commit/m,
      `Drafted by Manifest on ${platformDayInWords(generatedAt)}, from commit`,
    ),
  }
}

/**
 * §9's two external records (P6a Task 6). **BOTH PRESENT AND BOTH PART-WAY THROUGH**, so a
 * front-end developer sees the states that actually need rendering: a registration UBC IAM
 * has accepted, and a PIA still with the Privacy Office. A fixture with both `approved`
 * would show the console's easy case and hide the one the screen exists for.
 */
export const IAM_REGISTRATION: Schemas['IamRegistration'] = {
  id: '99999999-9999-4999-8999-999999999991',
  projectId: PROJECT_ID,
  environment: 'production',
  // THE MOCK'S OWN PROJECT (`mock-app`), in `sso/entity.ts`'s shapes. These said
  // `chem-labs` — a slug no other fixture uses — so the records screen named one app and
  // the project screen above it another.
  ...ENTITY('production'),
  // THE CERTIFICATE UBC REGISTERED IS THE ONE THAT WAS SENT — the package's (Task 13).
  certFingerprint: CERTIFICATES.production.fingerprint,
  certExpiresAt: CERTIFICATES.production.expiresAt,
  // UBC registered ONE MORE than the release asks for, which is legal — `iam-registration`
  // is met when the request is a SUBSET — and is the case a screen must not render as a
  // mismatch.
  registeredAttributes: ['givenName', 'mail', 'sn', 'ubcEduCwlPuid'],
  // P6b Task 7: no change request outstanding, and registered once — an `active` record's shape.
  requestedAttributes: null,
  registeredAt: '2026-09-15T00:00:00.000Z',
  state: 'active',
  // The launch path plan's Task 12: set only while `change_requested`.
  changeRequestedFrom: null,
  externalTicketRef: 'IAM-2026-0412',
  // The launch path plan's Task 9: when its owner said it was sent, and who — after staging was
  // registered, IN UBC'S ORDER (see `PRIVACY_ASSESSMENT`).
  submittedAt: '2026-09-10T19:00:00.000Z',
  submittedBy: { id: USER_ID, displayName: 'Instructor One' },
  // WHAT WAS SENT (the launch path plan's Tasks 10 and 13): the platform keeps the package a person
  // sent, drafted the morning of the day they sent it.
  package: registrationPackage('production', 'sent', '2026-09-10T16:30:00.000Z'),
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
}

/**
 * The STAGING registration (the launch path plan's Task 9) — `active`, because UBC registers staging
 * before production is sent, and production's above is registered.
 */
export const STAGING_REGISTRATION: Schemas['IamRegistration'] = {
  id: '99999999-9999-4999-8999-999999999993',
  projectId: PROJECT_ID,
  environment: 'staging',
  ...ENTITY('staging'),
  certFingerprint: CERTIFICATES.staging.fingerprint,
  certExpiresAt: CERTIFICATES.staging.expiresAt,
  registeredAttributes: ['givenName', 'mail', 'sn', 'ubcEduCwlPuid'],
  requestedAttributes: null,
  registeredAt: '2026-09-09T00:00:00.000Z',
  state: 'active',
  changeRequestedFrom: null,
  externalTicketRef: 'IAM-2026-0398',
  // Sent the day after the assessment was approved — the order the platform gates the owner in.
  submittedAt: '2026-09-06T19:00:00.000Z',
  submittedBy: { id: USER_ID, displayName: 'Instructor One' },
  package: registrationPackage('staging', 'sent', '2026-09-06T16:30:00.000Z'),
  createdAt: '2026-09-05T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z',
}

/**
 * STILL WITH THE PRIVACY OFFICE — AND SENT AGAIN, IN UBC'S ORDER (the launch path plan's Task 9, the
 * whole-branch review's I5). Approved on 2026-09-05 with its PIA number, which is what let both
 * registrations go (staging on the 6th, production on the 10th); then reopened — a change to what the
 * app collects — and sent again on the 18th. So it is `submitted`, its approval cleared, and the
 * checklist's item is the one `unmet` with no `builtBy`, as this fixture has always shown.
 */
export const PRIVACY_ASSESSMENT: Schemas['PrivacyAssessment'] = {
  id: '99999999-9999-4999-8999-999999999992',
  projectId: PROJECT_ID,
  state: 'submitted',
  reviewer: 'UBC Privacy Office',
  approvedAt: null,
  externalTicketRef: 'PIA-2026-0088',
  submittedAt: '2026-09-18T19:00:00.000Z',
  submittedBy: { id: USER_ID, displayName: 'Instructor One' },
  // WHAT WAS SENT AGAIN on the 18th (the launch path plan's Tasks 11 and 13): the platform keeps the
  // draft a person sent.
  draft: ASSESSMENT_DRAFT_SENT,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
}

export const LAUNCH_RECORDS: Schemas['LaunchRecords'] = {
  projectId: PROJECT_ID,
  iamRegistration: IAM_REGISTRATION,
  stagingRegistration: STAGING_REGISTRATION,
  privacyAssessment: PRIVACY_ASSESSMENT,
}

/**
 * D21's rehearsal (P6a Task 14). **IT PASSED, AND IT CARRIES ITS EVIDENCE** — a front-end
 * developer building the launch screen needs the shape of what a passing rehearsal actually
 * says, because the screen's job is to show the measurement rather than a tick: the
 * listener it ran on, the status the sign-in ended on, and the attributes the assertion
 * released against the ones the registration lists.
 */
export const REHEARSAL: Schemas['Rehearsal'] = {
  id: '99999999-9999-4999-8999-999999999993',
  projectId: PROJECT_ID,
  releaseId: RELEASE.id,
  passed: true,
  entityId: ENTITY('production').entityId,
  acsUrl: ENTITY('production').acsUrl,
  // What the Service Provider REGISTRATION listed — the release's request, not UBC's list.
  attributes: ['givenName', 'mail', 'ubcEduCwlPuid'],
  evidence: {
    instanceId: INSTANCE.id,
    hostname: 'mock-app.manifest.internal',
    listener: 'public',
    signInStatus: 200,
    attributesReleased: ['givenName', 'mail', 'ubcEduCwlPuid'],
    reason:
      'the sign-in completed: the app answered 200 at its registered ACS and the assertion carried 3 attribute(s)',
  },
  ranAt: '2026-09-20T00:00:00.000Z',
}

/**
 * THE PLATFORM'S ANSWER TO A COMMIT THAT DELETES OR EMPTIES manifest.yaml, word for word (the
 * authoring API plan's Task 11) — measured from the control plane's validator, and pinned on its
 * side by `api/source-commit.test.ts`'s *"the envelope the mock plays"*. A change to either
 * wording must change both. The one invalid manifest this mock can know without a validator.
 */
export const EMPTIED_MANIFEST: Schemas['ErrorEnvelope'] = {
  error: {
    code: 'SPEC_INVALID',
    message: 'the manifest.yaml in this commit is not valid',
    hint: 'Fix each path `details` lists in manifest.yaml, then commit or push again.',
    details: [
      {
        code: 'SPEC_INVALID_VALUE',
        path: '',
        message: 'Expected object, received null',
        hint: 'Check the type and permitted values of this field in the ManifestYaml schema.',
      },
    ],
    // Contract 1.6.0 (FE-30): required. When the mock PLAYS this refusal it sends the request's
    // own id, as the platform does; this one is only the fixture's.
    requestId: '0b7c1a52-3f0e-4d21-9a6e-2c3d4e5f6a7b',
  },
}

export const FIXTURES: [string, unknown][] = [
  ['Me', ME],
  ['Me', ADMIN_ME],
  ['Project', PROJECT],
  ['Project', PROJECT_EXPANDED],
  ['ProjectList', PROJECTS],
  ['CreatedProject', CREATED_PROJECT],
  ['SlugCheck', SLUG_AVAILABLE],
  ['SlugCheck', SLUG_TAKEN],
  ['Blueprint', BLUEPRINT],
  ['BlueprintList', BLUEPRINTS],
  ['KnowledgePack', KNOWLEDGE_PACK],
  ['Spec', SPEC],
  ['SpecValidation', SPEC_VALIDATION],
  ['Environment', STAGING],
  ['EnvironmentList', ENVIRONMENTS],
  ['Instance', INSTANCE],
  ['Instance', FAILED_INSTANCE],
  ['Instance', SANDBOX_INSTANCE],
  ['Instance', FAILED_SANDBOX_INSTANCE],
  ...Object.values(INSTANCE_LISTS).map((l): [string, unknown] => ['InstanceList', l]),
  ['InstanceOutput', { ...OUTPUT, readAt: ISO }],
  ['AgentSessionList', agentSessions(Date.parse(ISO), 'known')],
  ['AgentSessionList', agentSessions(Date.parse(ISO), 'unavailable')],
  ['AgentBudget', agentBudget(Date.parse(ISO), 'ok')],
  ['AgentBudget', agentBudget(Date.parse(ISO), 'exhausted')],
  ['AgentBudget', agentBudget(Date.parse(ISO), 'unavailable')],
  ['IntakeSession', intakeSession(Date.parse(ISO))],
  ['Build', BUILD],
  ['Build', BUILD_RUNNING],
  ['BuildList', BUILDS],
  ['BuildLog', BUILD_LOG],
  ['Release', RELEASE],
  ['ReleaseList', RELEASES],
  ['IncidentList', INCIDENTS],
  ['LaunchReadiness', LAUNCH_READINESS],
  ['LaunchReadiness', SELF_SERVE_READINESS],
  ['Member', MEMBER],
  ['MemberList', MEMBERS],
  ['MemberList', MEMBERS_WITH_COLLEAGUE],
  ['Token', TOKEN],
  ['Token', REVOKED_TOKEN],
  ['TokenList', TOKENS],
  ['MintedToken', MINTED_TOKEN],
  ['PendingAction', PENDING_ACTION],
  ['PendingAction', CONFIRMED_ACTION],
  ['PendingAction', REJECTED_ACTION],
  ['PendingAction', LAPSED_ACTION],
  ['PendingActionList', PENDING_ACTIONS],
  ['Fleet', FLEET],
  ['IamRegistration', IAM_REGISTRATION],
  // The launch path plan's Task 13: the staging registration (unchecked here until then), production's
  // own instance, and a package and a draft at each stage they are built at.
  ['IamRegistration', STAGING_REGISTRATION],
  ['Instance', PRODUCTION_INSTANCE],
  ['RegistrationPackage', registrationPackage('staging', 'drafted', ISO)],
  ['RegistrationPackage', registrationPackage('production', 'assessed', ISO)],
  ['PrivacyAssessmentDraft', assessmentDraft(ISO)],
  ['PrivacyAssessment', PRIVACY_ASSESSMENT],
  ['LaunchRecords', LAUNCH_RECORDS],
  ['Rehearsal', REHEARSAL],
  // MISSING UNTIL P6a TASK 17: `server.ts` answers three operations with this fixture and
  // this table never named it, so Ajv checked it only on the way OUT of a request — which is
  // exactly the check this table exists to make without one.
  ['Approval', APPROVAL],
  ['ApprovalPreview', APPROVAL_PREVIEW],
  ['ApprovalPreview', WITHHELD_APPROVAL_PREVIEW],
  ['ApprovalPreview', UNAVAILABLE_APPROVAL_PREVIEW],
  ['ErrorEnvelope', EMPTIED_MANIFEST],
]
