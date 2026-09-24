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
export const TOKEN_ID = '77777777-7777-4777-8777-777777777777'
export const PENDING_ACTION_ID = '88888888-8888-4888-8888-888888888881'
export const CONFIRMED_ACTION_ID = '88888888-8888-4888-8888-888888888882'
export const REJECTED_ACTION_ID = '88888888-8888-4888-8888-888888888883'
export const LAPSED_ACTION_ID = '88888888-8888-4888-8888-888888888884'
export const INCIDENT_ID = '99999999-9999-4999-8999-999999999999'
export const APP_SPEC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const STUDENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const APPROVAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

export const ME: Schemas['Me'] = {
  id: USER_ID,
  puid: 'ins000001',
  displayName: 'Instructor One',
  email: 'instructor@example.test',
  role: 'member',
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

export const ENVIRONMENTS: Schemas['EnvironmentList'] = [
  ENVIRONMENT(SANDBOX_ID, 'sandbox', null),
  ENVIRONMENT(STAGING_ID, 'staging', INSTANCE),
  ENVIRONMENT(PRODUCTION_ID, 'production', null),
]

export const STAGING: Schemas['Environment'] = ENVIRONMENTS[1]!

export const PROJECT: Schemas['Project'] = {
  id: PROJECT_ID,
  slug: 'mock-app',
  blueprint: 'node-ts-mongo@1',
  starter: 'proof-app',
  owner: { id: ME.id, displayName: ME.displayName },
  audience: AUDIENCE,
  createdAt: ISO,
  launchedAt: null,
}

/** What `?expand=environments` adds (D23.1) — the project screen always asks for it. */
export const PROJECT_EXPANDED: Schemas['Project'] = {
  ...PROJECT,
  environments: ENVIRONMENTS,
}

export const PROJECTS: Schemas['ProjectList'] = [PROJECT]

export const SPEC_VALIDATION: Schemas['SpecValidation'] = {
  appSpecId: APP_SPEC_ID,
  commitSha: COMMIT,
  valid: true,
  errors: [],
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
      message: 'a project already has this name',
      hint: 'Pick another name, or ask its owner to add you.',
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
 * **THE DIFF IS POPULATED AND THE SUMMARY IS NOT.** `summarySource: 'unavailable'` is the
 * state Decision 7 exists for — a model that could not be reached — and it is the one a
 * screen is most likely to render wrongly, because the obvious layout has nowhere to put
 * "there is no summary, and the diff beside it is the control". A fixture that always had
 * a summary would hide that.
 */
export const APPROVAL: Schemas['Approval'] = {
  id: APPROVAL_ID,
  releaseId: RELEASE_ID,
  projectId: PROJECT_ID,
  decision: 'approved',
  decidedBy: USER_ID,
  decidedAt: ISO,
  imageDigest: BUILD.imageDigest as string,
  reason: 'the scan is clean and the egress list matches the ticket',
  diff: {
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
    summary: null,
    summarySource: 'unavailable',
    // `NullReviewer`'s reason VERBATIM (`launch/review.ts`), which is what `describeVerdict`
    // stores for `not_performed` — the screen renders this sentence as the platform's own,
    // so a paraphrase here would teach a front-end developer a sentence the platform never says.
    review: {
      state: 'not_performed',
      reviewer: 'none',
      detail:
        'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the ' +
        'controls that make that tolerable are containment — default-deny egress, network ' +
        'isolation, least privilege and edge protections (§20).',
    },
  },
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
      why: 'Canonical hostname only — no action. A custom domain is Phase 2 (§23), and for a CWL app it must be chosen before IAM registration, because the registration carries it.',
    },
    {
      id: 'iam-registration',
      title: 'Registered with UBC IAM',
      owner: 'UBC IAM, recorded by a platform administrator (§9)',
      blocking: true,
      state: 'met',
      why: 'Registered as https://manifest.internal/sp/mock-app/production, active (ticket IAM-2026-0412), releasing 4 attribute(s).',
    },
    {
      id: 'privacy-assessment',
      title: 'Privacy Impact Assessment approved',
      owner: 'UBC Privacy Office, recorded by a platform administrator (§9)',
      blocking: true,
      state: 'unmet',
      why: "The assessment is 'submitted' (ticket PIA-2026-0088) and must be 'approved' before a first production launch (§9).",
    },
    {
      id: 'rehearsal',
      title: 'Pre-production rehearsal passed',
      owner: 'Manifest',
      blocking: true,
      state: 'met',
      why: "A production-shaped rehearsal passed on 2026-09-20: the app was deployed to its production hostname on the public listener, its Service Provider was registered with production values, and one CWL sign-in completed releasing 3 attribute(s). This proves the SHAPE of the registration — the entityID, the ACS URL, the attribute release and the certificate all work together. It proves nothing about UBC's acceptance of it: the Manifest IdP is not real Shibboleth (D6), and the run against UBC's staging IdP that D21 describes remains an external-track obligation (§9).",
    },
    {
      id: 'scans',
      title: 'Dependency and secret scans clean',
      owner: 'Manifest',
      blocking: true,
      state: 'met',
      why: 'Its secret and lockfile gates passed and no finding it introduced has a published fix. 0 finding(s) with no published fix are recorded on the release (§12).',
    },
    {
      id: 'admin-approval',
      title: 'Release approved by a platform administrator',
      owner: 'platform admin',
      blocking: true,
      state: 'met',
      why: 'Approved by an administrator on 2026-09-20, bound to image digest sha256:9b2c1d0e3f4a…',
    },
    {
      id: 'code-review',
      title: 'Code reviewed for safety',
      owner: 'Manifest',
      blocking: false,
      state: 'not_built',
      builtBy: 'a tracked hardening item (SemgrepReviewer), not a plan',
      why: 'Nothing reviews the code the agent wrote. Manifest reviews manifest.yaml, not code (§13), and that risk is still accepted: the controls that make it tolerable are containment — default-deny egress, network isolation, least privilege and edge protections (§20). A reviewer interface exists with no implementation behind it (D33, §15), so this item does not block a launch.',
    },
  ],
}

export const MEMBERS: Schemas['MemberList'] = [
  {
    userId: USER_ID,
    puid: 'ins000001',
    displayName: 'Instructor One',
    email: 'instructor@example.test',
    role: 'owner',
  },
]

export const MEMBER: Schemas['Member'] = {
  userId: STUDENT_ID,
  puid: 'stu000001',
  displayName: 'Student One',
  email: 'student@example.test',
  role: 'collaborator',
}

/** `addMember` answers the one member; `removeMember` answers the whole list (P5b Task 8). */
export const MEMBERS_WITH_STUDENT: Schemas['MemberList'] = [...MEMBERS, MEMBER]

export const TOKEN: Schemas['Token'] = {
  id: TOKEN_ID,
  projectId: PROJECT_ID,
  name: 'the agent that builds this app',
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
 * §9's two external records (P6a Task 6). **BOTH PRESENT AND BOTH PART-WAY THROUGH**, so a
 * front-end developer sees the states that actually need rendering: a registration UBC IAM
 * has accepted, and a PIA still with the Privacy Office. A fixture with both `approved`
 * would show the console's easy case and hide the one the screen exists for.
 */
export const IAM_REGISTRATION: Schemas['IamRegistration'] = {
  id: '99999999-9999-4999-8999-999999999991',
  projectId: PROJECT_ID,
  // THE MOCK'S OWN PROJECT (`mock-app`), in `sso/entity.ts`'s shapes. These said
  // `chem-labs` — a slug no other fixture uses — so the records screen named one app and
  // the project screen above it another.
  entityId: 'https://manifest.internal/sp/mock-app/production',
  acsUrl: 'https://mock-app.manifest.internal/auth/callback',
  sloUrl: 'https://mock-app.manifest.internal/auth/logout',
  certFingerprint: 'AB:CD:EF:01:23:45',
  certExpiresAt: '2027-03-01T00:00:00.000Z',
  // UBC registered ONE MORE than the release asks for, which is legal — `iam-registration`
  // is met when the request is a SUBSET — and is the case a screen must not render as a
  // mismatch.
  registeredAttributes: ['givenName', 'mail', 'sn', 'ubcEduCwlPuid'],
  state: 'active',
  externalTicketRef: 'IAM-2026-0412',
  updatedAt: '2026-09-20T00:00:00.000Z',
}

export const PRIVACY_ASSESSMENT: Schemas['PrivacyAssessment'] = {
  id: '99999999-9999-4999-8999-999999999992',
  projectId: PROJECT_ID,
  state: 'submitted',
  reviewer: 'UBC Privacy Office',
  approvedAt: null,
  externalTicketRef: 'PIA-2026-0088',
  updatedAt: '2026-09-20T00:00:00.000Z',
}

export const LAUNCH_RECORDS: Schemas['LaunchRecords'] = {
  projectId: PROJECT_ID,
  iamRegistration: IAM_REGISTRATION,
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
  entityId: 'https://manifest.internal/sp/mock-app/production',
  acsUrl: 'https://mock-app.manifest.internal/auth/callback',
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
  ['Build', BUILD],
  ['Build', BUILD_RUNNING],
  ['BuildList', BUILDS],
  ['BuildLog', BUILD_LOG],
  ['Release', RELEASE],
  ['ReleaseList', RELEASES],
  ['IncidentList', INCIDENTS],
  ['LaunchReadiness', LAUNCH_READINESS],
  ['Member', MEMBER],
  ['MemberList', MEMBERS],
  ['MemberList', MEMBERS_WITH_STUDENT],
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
  ['PrivacyAssessment', PRIVACY_ASSESSMENT],
  ['LaunchRecords', LAUNCH_RECORDS],
  ['Rehearsal', REHEARSAL],
  // MISSING UNTIL P6a TASK 17: `server.ts` answers three operations with this fixture and
  // this table never named it, so Ajv checked it only on the way OUT of a request — which is
  // exactly the check this table exists to make without one.
  ['Approval', APPROVAL],
]
