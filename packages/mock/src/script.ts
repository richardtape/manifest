import type { StreamFrame } from '@manifest/contract'
import {
  BUILD,
  BUILD_ID,
  INSTANCE_ID,
  INCIDENT_ID,
  LOG_LINES,
  PROJECT_ID,
  RELEASE_ID,
  STAGING_ID,
} from './fixtures.js'

/**
 * §21: *"including scripted WebSocket streams for build logs, deploy transitions and
 * incidents"*. This is what makes the console's two streaming screens developable with no
 * platform: a front-end developer sees lines ARRIVE, not a block appear.
 *
 * THREE PROPERTIES OF THE REAL STREAM ARE SCRIPTED HERE BECAUSE A CLIENT THAT NEVER MEETS
 * THEM BREAKS ON THE PLATFORM:
 *
 * 1. **Subscribe, then replay, then flush.** `api/routes/events.ts` sends the replay, then
 *    the CONTROL frame, then anything that arrived meanwhile. `subscribe`'s `ready`
 *    resolves on that control frame and on NOTHING else, so a mock that omits it leaves
 *    every client stuck at `connecting` for ever.
 * 2. **`LogFrame` IS NEVER REPLAYED** (P5c sitting 5, F1). The document says so and
 *    `recentFramesFor` proves it: the replay selects from the `events` table, which holds
 *    no log line. So the replay below carries the three creation events and no log frame —
 *    a mock that replayed logs would be scripting something the platform cannot do, and a
 *    client built against it would drop its `getBuildLog` read and show a log starting in
 *    the middle.
 * 3. **A BUILD'S LAST TEN SECONDS ARE SILENT** (P5c sitting 6, F12). §12's Syft and Grype
 *    run INSIDE `driver.buildImage` after BuildKit returns and take no `onLog`, so the log
 *    ends `DONE` while the build is still `running` with no digest — measured at 11.29 s
 *    and 9.70 s. A mock whose build ended the moment the log did would teach a client to
 *    press *Release* into a `409 RELEASE_BUILD_NOT_DEPLOYABLE`, which is the exact mistake
 *    a person made by clicking. `SCAN_SILENCE_MS` is that window, and it is a default
 *    rather than a constant so a test need not wait ten seconds for it.
 *
 * WHAT IS NOT SCRIPTED IS AS DELIBERATE AS WHAT IS: `consumeAction` and `addMember`
 * publish NO event (P5c sitting 7, F2), so nothing here invents one. A mock that sends a
 * frame the platform never sends is the fixture that lies (Decision 10).
 */

export const SCAN_SILENCE_MS = 10_000

const ISO = '2026-09-18T09:00:00.000Z'
const COMMIT = '5f3c1b8e2a4d6f7c9b0e1a2d3c4b5a6978e9f0a1'

/** Event ids are uuids like everything else; the stream's own `id` is what de-duplicates. */
const eventId = (n: number): string =>
  `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, '0')}`

/** A frame and how long after the previous one it is sent. */
export interface ScriptedFrame {
  afterMs: number
  frame: StreamFrame
}

/**
 * THE REPLAY: the three events every project created over HTTP already has before anything
 * else happens to it (P5a Task 11). A console that subscribes after creation sees exactly
 * these, which is what §22 step 3 renders.
 */
export const REPLAY: StreamFrame[] = [
  {
    kind: 'event',
    id: eventId(1),
    projectId: PROJECT_ID,
    subject: `project:${PROJECT_ID}`,
    type: 'project.created',
    humanMessage: 'mock-app was created from node-ts-mongo@1.',
    machineDetail: {
      slug: 'mock-app',
      blueprint: 'node-ts-mongo@1',
      starter: 'proof-app',
      audience: { scale: 'class', burst: 'synchronised' },
    },
    createdAt: ISO,
  },
  {
    kind: 'event',
    id: eventId(2),
    projectId: PROJECT_ID,
    subject: `project:${PROJECT_ID}`,
    type: 'repository.seeded',
    humanMessage: 'The repository was seeded with the proof-app starter.',
    machineDetail: { commitSha: COMMIT, files: 24, starter: 'proof-app' },
    createdAt: ISO,
  },
  {
    kind: 'event',
    id: eventId(3),
    projectId: PROJECT_ID,
    subject: `project:${PROJECT_ID}`,
    type: 'spec.validated',
    humanMessage: 'manifest.yaml is valid.',
    machineDetail: {
      appSpecId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      commitSha: COMMIT,
      valid: true,
      errorCount: 0,
    },
    createdAt: ISO,
  },
]

/** The boundary `subscribe`'s `ready` resolves on. Everything after it is live. */
export const READY: StreamFrame = {
  kind: 'control',
  id: 'manifest.stream.ready',
  projectId: PROJECT_ID,
  type: 'manifest.stream.ready',
}

const logFrame = (seq: number, text: string): StreamFrame => ({
  kind: 'log',
  id: eventId(100 + seq),
  projectId: PROJECT_ID,
  buildId: BUILD_ID,
  seq,
  stream: 'stdout',
  text,
  createdAt: ISO,
})

const instanceFrame = (
  n: number,
  type: 'instance.provisioning' | 'instance.starting' | 'instance.healthy',
  state: 'provisioning' | 'starting' | 'healthy',
  humanMessage: string,
): StreamFrame => ({
  kind: 'event',
  id: eventId(n),
  projectId: PROJECT_ID,
  subject: `instance:${INSTANCE_ID}`,
  type,
  humanMessage,
  machineDetail: {
    instanceId: INSTANCE_ID,
    releaseId: RELEASE_ID,
    environmentId: STAGING_ID,
    environment: 'staging',
    state,
  },
  createdAt: ISO,
})

/**
 * A build, then a deploy. `fail` plays the other ending — `instance.failed` +
 * `incident.opened` — because a client that has never rendered a failure has not been
 * tested, and a failed deploy is a `200` whose state is `failed` with the PREVIOUS instance
 * still serving (P5c sitting 5, F10).
 */
export function scripted(
  options: { fail?: boolean; scanSilenceMs?: number } = {},
): ScriptedFrame[] {
  const scan = options.scanSilenceMs ?? SCAN_SILENCE_MS
  const frames: ScriptedFrame[] = [
    {
      afterMs: 1_000,
      frame: {
        kind: 'event',
        id: eventId(10),
        projectId: PROJECT_ID,
        subject: `build:${BUILD_ID}`,
        type: 'build.started',
        humanMessage: 'Building mock-app.',
        machineDetail: {
          buildId: BUILD_ID,
          commitSha: COMMIT,
          blueprintRef: 'node-ts-mongo@1',
        },
        createdAt: ISO,
      },
    },
  ]

  LOG_LINES.forEach((text, i) => {
    frames.push({ afterMs: 150, frame: logFrame(i + 1, text) })
  })

  frames.push({
    // THE SILENT WINDOW. The log's last word above is `DONE`; nothing is sent for this
    // long while §12's scan runs, and only then does the build end.
    afterMs: scan,
    frame: {
      kind: 'event',
      id: eventId(11),
      projectId: PROJECT_ID,
      subject: `build:${BUILD_ID}`,
      type: 'build.succeeded',
      humanMessage: 'The build succeeded and was scanned.',
      machineDetail: {
        buildId: BUILD_ID,
        imageDigest: BUILD.imageDigest,
        imageRepository: '127.0.0.1:7107/local/mock-app',
      },
      createdAt: ISO,
    },
  })

  frames.push({
    afterMs: 2_000,
    frame: instanceFrame(
      12,
      'instance.provisioning',
      'provisioning',
      'Provisioning mock-app in staging.',
    ),
  })
  frames.push({
    // An app with CWL sign-on registers its SP between provisioning and starting (P5a
    // Task 14), which is a frame a client must not be surprised by.
    afterMs: 800,
    frame: {
      kind: 'event',
      id: eventId(13),
      projectId: PROJECT_ID,
      subject: `instance:${INSTANCE_ID}`,
      type: 'sso.registered',
      humanMessage: 'Registered mock-app with the Manifest IdP.',
      machineDetail: {
        entityId: 'https://mock-app.staging.manifest.internal/auth/metadata',
        acsUrl: 'https://mock-app.staging.manifest.internal/auth/callback',
        attributes: ['ubcEduCwlPuid', 'displayName', 'mail'],
        certificateFingerprint: 'ab:cd:ef:01:23:45:67:89',
        changed: true,
      },
      createdAt: ISO,
    },
  })
  frames.push({
    afterMs: 800,
    frame: instanceFrame(14, 'instance.starting', 'starting', 'Starting mock-app.'),
  })

  if (options.fail === true) {
    frames.push({
      afterMs: 3_000,
      frame: {
        kind: 'event',
        id: eventId(15),
        projectId: PROJECT_ID,
        subject: `instance:${INSTANCE_ID}`,
        type: 'instance.failed',
        humanMessage:
          'mock-app never became ready, so the previous release keeps serving.',
        machineDetail: {
          instanceId: INSTANCE_ID,
          releaseId: RELEASE_ID,
          environmentId: STAGING_ID,
          environment: 'staging',
          state: 'failed',
          failedCheck: 'GET /healthz from inside the edge',
        },
        createdAt: ISO,
      },
    })
    frames.push({
      afterMs: 200,
      frame: {
        kind: 'event',
        id: eventId(16),
        projectId: PROJECT_ID,
        subject: `instance:${INSTANCE_ID}`,
        type: 'incident.opened',
        humanMessage: 'An Incident was opened for the failed deploy.',
        machineDetail: {
          incidentId: INCIDENT_ID,
          instanceId: INSTANCE_ID,
          releaseId: RELEASE_ID,
          environment: 'staging',
        },
        createdAt: ISO,
      },
    })
  } else {
    frames.push({
      afterMs: 3_000,
      frame: instanceFrame(
        15,
        'instance.healthy',
        'healthy',
        'mock-app is serving at https://mock-app.staging.manifest.internal.',
      ),
    })
  }

  return frames
}
