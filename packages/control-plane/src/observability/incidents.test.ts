import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  appSpecs,
  builds,
  environments,
  incidents,
  instances,
  releases,
  type Db,
} from '../db/index.js'
import { withProject } from '../db/testing.js'
import { manifestSchema, resolveConfig } from '../spec/index.js'
import {
  INCIDENT_LOG_LINES,
  captureIncident,
  incidentPrompt,
  listIncidents,
  makeRedactor,
  type IncidentSource,
} from './index.js'
import { expectSqlState } from './testing.js'

const IDENTITY = (value: unknown): unknown => value
const DEFAULTS = { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' }
const CHECK =
  'readiness: GET /healthz at https://x through the edge — HTTP 502 (12 attempts)'

/** A release's frozen config, the way `POST …/releases` freezes one: all three kinds. */
function frozen(extra: Record<string, unknown> = {}) {
  const spec = manifestSchema.parse({
    manifest: 1,
    name: 'incident-fixture',
    blueprint: 'fixture-node@1',
    runtime: { port: 3000 },
    ...extra,
  })
  return {
    sandbox: resolveConfig(spec, 'sandbox', DEFAULTS),
    staging: resolveConfig(spec, 'staging', DEFAULTS),
    production: resolveConfig(spec, 'production', DEFAULTS),
  }
}

interface Fixture {
  environmentId: string
  /** A release built from a commit of `char` × 40, frozen from a manifest with `extra`. */
  release(char: string, extra?: Record<string, unknown>): Promise<string>
  /** An instance of the release in the fixture environment, with handle `inst-<n>`. */
  instance(
    releaseId: string,
    state: 'healthy' | 'failed',
    lastSeenAt?: Date,
  ): Promise<string>
}

/**
 * A rolled-back transaction holding a staging environment, and builders for releases
 * and instances in it. Local to this file (P4b's convention, and pre-flight 102:
 * `withRollback` passes no fixture). An `instances` row needs a release, a release a
 * build, and a build an AppSpec.
 */
async function withEnvironment(fn: (db: Db, f: Fixture) => Promise<void>): Promise<void> {
  await withProject(async (db, { projectId, ownerId }) => {
    const [environment] = await db
      .insert(environments)
      .values({
        projectId,
        kind: 'staging',
        hostname: 'incident-fixture.staging.manifest.internal',
      })
      .returning()
    const [spec] = await db
      .insert(appSpecs)
      .values({
        projectId,
        commitSha: 'a'.repeat(40),
        parsed: {},
        schemaVersion: 1,
        valid: true,
      })
      .returning()
    let handles = 0
    await fn(db, {
      environmentId: environment!.id,
      async release(char, extra = {}) {
        const [build] = await db
          .insert(builds)
          .values({
            projectId,
            commitSha: char.repeat(40),
            appSpecId: spec!.id,
            status: 'succeeded',
            imageDigest: `sha256:${'b'.repeat(64)}`,
          })
          .returning()
        const [release] = await db
          .insert(releases)
          .values({
            projectId,
            buildId: build!.id,
            appSpecId: spec!.id,
            createdBy: ownerId,
            resolvedConfig: frozen(extra),
          })
          .returning()
        return release!.id
      },
      async instance(releaseId, state, lastSeenAt = new Date()) {
        handles += 1
        const [row] = await db
          .insert(instances)
          .values({
            environmentId: environment!.id,
            releaseId,
            driver: 'fake',
            state,
            handle: `inst-${handles}`,
            lastSeenAt,
          })
          .returning()
        return row!.id
      },
    })
  })
}

const numbered = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`)

/** A driver's two answers, scripted. It IGNORES the tail it is asked for, as a driver may. */
function source(
  opts: {
    lines?: string[]
    state?: string
    exitCode?: number
    message?: string
    statusFails?: boolean
    logsFailAfter?: number
  } = {},
): { src: IncidentSource; asked: { id: string; tail?: number }[] } {
  const asked: { id: string; tail?: number }[] = []
  const reset = () =>
    Object.assign(new Error('the socket said hunter2'), { code: 'ECONNRESET' })
  const src: IncidentSource = {
    async status() {
      if (opts.statusFails === true) throw reset()
      return {
        state: opts.state ?? 'failed',
        ...(opts.exitCode === undefined ? {} : { exitCode: opts.exitCode }),
        ...(opts.message === undefined ? {} : { message: opts.message }),
      }
    },
    async *logs(id, logOpts) {
      asked.push({ id, ...logOpts })
      const lines = opts.lines ?? []
      for (let i = 0; i < lines.length; i += 1) {
        if (opts.logsFailAfter === i) throw reset()
        yield { text: lines[i]! }
      }
      if (opts.logsFailAfter !== undefined && opts.logsFailAfter >= lines.length)
        throw reset()
    },
  }
  return { src, asked }
}

describe('incidents (§14)', () => {
  it('captures the exit reason, the failing check and the LAST 200 lines of log', async () => {
    await withEnvironment(async (db, f) => {
      const instanceId = await f.instance(await f.release('a'), 'failed')
      const { src, asked } = source({ lines: numbered(300), exitCode: 3 })
      const incident = await captureIncident(
        db,
        src,
        { instanceId, failedCheck: CHECK },
        IDENTITY,
      )

      // Asked for the tail, by the handle the ROW records — and kept only the last 200
      // of the 300 the source sent anyway. A head is what a naive limit gives you, and
      // it is the half that never contains the error.
      expect(asked).toEqual([{ id: 'inst-1', tail: INCIDENT_LOG_LINES }])
      const lines = incident.logTail.split('\n')
      expect(lines).toHaveLength(200)
      expect(lines[0]).toBe('line 101')
      expect(lines.at(-1)).toBe('line 300')
      expect(incident.exitReason).toBe('the process exited with code 3')
      expect(incident.failedCheck).toBe(CHECK)
      expect(incident.instanceId).toBe(instanceId)
    })
  })

  it('redacts every field at capture, with the secret set it is given', async () => {
    // `hunter2` is a value only the EXACT-MATCH half can catch — short, lower case,
    // outside a URL — and this line proves it. Since Task 12 a credential-bearing URL
    // is redacted with no secret set at all, so the canary the plan printed would pass
    // with an empty set and prove nothing about whether the app's own reached here.
    expect(makeRedactor([])('password hunter2 rejected')).toBe(
      'password hunter2 rejected',
    )
    await withEnvironment(async (db, f) => {
      const instanceId = await f.instance(await f.release('a'), 'failed')
      const { src } = source({
        lines: ['boot', 'connect failed: password hunter2 rejected'],
        exitCode: 1,
        message: 'the runtime said hunter2',
      })
      const incident = await captureIncident(
        db,
        src,
        { instanceId, failedCheck: 'health: GET /healthz?token=hunter2' },
        makeRedactor(['hunter2']),
      )
      // The stored ROW, not the return value: a redactor applied on the way out would
      // pass a read-back test and persist the secret.
      const [row] = await db.select().from(incidents).where(eq(incidents.id, incident.id))
      expect(JSON.stringify(row)).not.toContain('hunter2')
      expect(row!.logTail).toContain('[REDACTED]')
      expect(row!.exitReason).toContain('[REDACTED]')
      expect(row!.failedCheck).toContain('[REDACTED]')
    })
  })

  it('diffs against the last HEALTHY release, not the previous one', async () => {
    // "the diff since the last healthy release", §14. The previous release may itself
    // have failed, and diffing against a failure tells a faculty member nothing about
    // what they broke.
    await withEnvironment(async (db, f) => {
      const older = await f.release('0')
      await f.instance(older, 'healthy', new Date('2026-09-01T00:00:00Z'))
      const healthy = await f.release('a')
      await f.instance(healthy, 'healthy', new Date('2026-09-02T00:00:00Z'))
      const mongo = { services: [{ type: 'mongo', version: '7', name: 'db' }] }
      const previous = await f.release('b', mongo)
      await f.instance(previous, 'failed', new Date('2026-09-03T00:00:00Z'))
      const failing = await f.instance(await f.release('c', mongo), 'failed')

      const { src } = source({ exitCode: 1 })
      const incident = await captureIncident(
        db,
        src,
        { instanceId: failing, failedCheck: CHECK },
        IDENTITY,
      )
      expect(incident.diffSinceHealthy).toBe(
        [
          `Compared with release ${healthy}, the last release that was healthy in staging:`,
          '- the code changed: commit aaaaaaa → ccccccc',
          '- services: added a mongo database called db',
        ].join('\n'),
      )
      expect(incident.diffSinceHealthy).not.toContain(previous)
      expect(incident.diffSinceHealthy).not.toContain(older)
    })
  })

  it('says plainly when the same release was healthy before, and when the manifest did not change', async () => {
    await withEnvironment(async (db, f) => {
      const release = await f.release('a')
      await f.instance(release, 'healthy', new Date('2026-09-01T00:00:00Z'))
      const again = await f.instance(release, 'failed')
      const { src } = source({ exitCode: 1 })
      const same = await captureIncident(
        db,
        src,
        { instanceId: again, failedCheck: CHECK },
        IDENTITY,
      )
      expect(same.diffSinceHealthy).toBe(
        `Compared with release ${release}, the last release that was healthy in staging:\n` +
          '- this is that same release: its code and manifest.yaml have not changed since it was last healthy',
      )

      const codeOnly = await f.instance(await f.release('d'), 'failed')
      const incident = await captureIncident(
        db,
        src,
        { instanceId: codeOnly, failedCheck: CHECK },
        IDENTITY,
      )
      expect(incident.diffSinceHealthy.split('\n').slice(1)).toEqual([
        '- the code changed: commit aaaaaaa → ddddddd',
        '- manifest.yaml: nothing the app runs with changed',
      ])
    })
  })

  it('says so plainly when there has never been a healthy release', async () => {
    // The FIRST deploy is the likeliest to fail, and it has nothing to diff against.
    // An empty string here reads as "nothing changed", the opposite of the truth.
    await withEnvironment(async (db, f) => {
      await f.instance(await f.release('a'), 'failed')
      const instanceId = await f.instance(await f.release('b'), 'failed')
      const { src } = source({ exitCode: 1 })
      const incident = await captureIncident(
        db,
        src,
        { instanceId, failedCheck: CHECK },
        IDENTITY,
      )
      expect(incident.diffSinceHealthy).toBe(
        'This app has never been healthy in staging, so there is no working release to compare this one with.',
      )
    })
  })

  it('records what it could not read, rather than recording nothing', async () => {
    await withEnvironment(async (db, f) => {
      const instanceId = await f.instance(await f.release('a'), 'failed')
      const broken = source({
        statusFails: true,
        lines: ['boot', 'half a'],
        logsFailAfter: 2,
      })
      const incident = await captureIncident(
        db,
        broken.src,
        { instanceId, failedCheck: CHECK },
        IDENTITY,
      )
      // The error's CODE, never its message — the message said `hunter2`.
      expect(incident.exitReason).toBe(
        "the platform could not read the instance's state (ECONNRESET)",
      )
      expect(incident.logTail).toBe(
        "boot\nhalf a\n(the platform could not read the application's log past this point: ECONNRESET)",
      )
      expect(JSON.stringify(incident)).not.toContain('hunter2')

      const silent = await captureIncident(
        db,
        source({ state: 'starting', logsFailAfter: 0 }).src,
        { instanceId, failedCheck: CHECK },
        IDENTITY,
      )
      expect(silent.exitReason).toBe(
        'the process is still running, and the platform reports it as starting',
      )
      expect(silent.logTail).toBe(
        "(the platform could not read the application's log: ECONNRESET)",
      )

      const quiet = await captureIncident(
        db,
        source({ exitCode: 0 }).src,
        { instanceId, failedCheck: CHECK },
        IDENTITY,
      )
      expect(quiet.logTail).toBe('(the application printed nothing)')
    })
  })

  it('refuses an instance the driver never created', async () => {
    await withEnvironment(async (db, f) => {
      const [row] = await db
        .insert(instances)
        .values({
          environmentId: f.environmentId,
          releaseId: await f.release('a'),
          driver: 'fake',
          state: 'provisioning',
        })
        .returning()
      await expect(
        captureIncident(
          db,
          source().src,
          { instanceId: row!.id, failedCheck: CHECK },
          IDENTITY,
        ),
      ).rejects.toMatchObject({ code: 'INCIDENT_INSTANCE_NOT_STARTED' })
    })
  })

  it('lists an environment’s incidents newest first, with the release each happened to', async () => {
    await withEnvironment(async (db, f) => {
      const first = await f.release('a')
      const second = await f.release('b')
      const a = await f.instance(first, 'failed')
      const b = await f.instance(second, 'failed')
      // Explicit times: every insert in one transaction shares now().
      await db
        .insert(incidents)
        .values([
          row(a, 'old', new Date('2026-09-01T00:00:00Z')),
          row(b, 'new', new Date('2026-09-02T00:00:00Z')),
        ])
      const listed = await listIncidents(db, f.environmentId)
      expect(listed.map((i) => [i.exitReason, i.releaseId])).toEqual([
        ['new', second],
        ['old', first],
      ])
      expect(await listIncidents(db, f.environmentId, { limit: 1 })).toHaveLength(1)
    })
  })

  it('produces a repair prompt an agent can act on', () => {
    // §14's actual requirement. Asserted on CONTENT rather than on length: a prompt
    // without the log tail or the failing check cannot be acted on, and those are the
    // fields that get dropped when a template is tidied.
    const incident = {
      exitReason: 'the process exited with code 3',
      failedCheck: CHECK,
      logTail: 'boot\nError: MONGODB_URI is not set',
      diffSinceHealthy:
        'Compared with release r1:\n- services: removed the mongo database called db',
    }
    const prompt = incidentPrompt(incident, {
      slug: 'chem-labs',
      environmentKind: 'staging',
    })
    expect(prompt).toContain('"chem-labs"')
    expect(prompt).toContain('staging')
    expect(prompt).toContain(incident.failedCheck)
    expect(prompt).toContain(incident.exitReason)
    expect(prompt).toContain('Error: MONGODB_URI is not set')
    expect(prompt).toContain(incident.diffSinceHealthy)
    // And it asks for a change inside the app — the prompt goes to an agent with a
    // delegated token (D24) in Phase 3.
    expect(prompt).toMatch(/application code or manifest\.yaml/)
  })
})

function row(instanceId: string, exitReason: string, createdAt: Date) {
  return {
    instanceId,
    exitReason,
    logTail: '(the application printed nothing)',
    failedCheck: CHECK,
    diffSinceHealthy: 'This app has never been healthy in staging.',
    createdAt,
  }
}

describe('incident integrity (§20)', () => {
  // `audit.incidents` is in the `audit` schema and `manifest_app` holds SELECT and
  // INSERT on it — nothing else. ONE transaction per refusal: the first refused
  // statement aborts the transaction, and a second would fail with 25P02 whether or
  // not its own grant were in place.
  const refusals: [string, (instanceId: string) => ReturnType<typeof sql>, string][] = [
    ['UPDATE', () => sql`UPDATE audit.incidents SET log_tail = 'y'`, '42501'],
    ['DELETE', () => sql`DELETE FROM audit.incidents`, '42501'],
    ['TRUNCATE', () => sql`TRUNCATE audit.incidents`, '42501'],
    // The route around the grant that naming the verbs does not close: a referential
    // action runs with the REFERENCED table's privileges, so ON DELETE CASCADE would
    // let `DELETE FROM instances` erase the Incident.
    [
      'a delete of the instance it belongs to',
      (instanceId) => sql`DELETE FROM instances WHERE id = ${instanceId}`,
      '23503',
    ],
  ]

  for (const [what, statement, code] of refusals) {
    it(`refuses ${what}`, async () => {
      await withEnvironment(async (db, f) => {
        const instanceId = await f.instance(await f.release('a'), 'failed')
        await db.insert(incidents).values(row(instanceId, 'x', new Date()))
        await expectSqlState(db.execute(statement(instanceId)), code)
      })
    })
  }
})
