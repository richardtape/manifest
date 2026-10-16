import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appSpecs,
  db,
  events,
  instances,
  loadRehearsals,
  projects,
  tryWithRehearsalLock,
  users,
} from '../db/index.js'
import { registerBackgroundWork, resetDatabase } from '../db/testing.js'
import { createFakeDriver, type FakeDriver, type InstanceSpec } from '../runtime/index.js'
import { createProject, type StoredAudience } from '../projects/index.js'
import { testAudience, testReservedLabels } from '../projects/testing.js'
import { loadConfig } from '../config.js'
import { createAppSecrets, generateMasterKeypair } from '../secrets/index.js'
import { createServiceCredentials } from '../services/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { declaredCatalogue } from '../ai/testing.js'
import { createEventBus } from '../observability/index.js'
import { buildToEnd } from '../releases/testing.js'
import {
  createRelease,
  createRetirer,
  deployRelease,
  deployReleaseSet,
  type DeployDeps,
} from '../releases/index.js'
import { candidateFor } from './candidate.js'
import type { LoadGenerator, LoadReport, LoadTarget } from './load.js'
import {
  runLoadRehearsal,
  takeDownLeftLoadRehearsals,
  type LoadRehearsalDeps,
} from './load-run.js'

/**
 * §24'S LOAD REHEARSAL, RUN (the load rehearsal plan's Task 4) — against the fake driver behind a call-recording wrapper
 * (the fake keeps no call list — *Read this first* 22) and a fake generator. `load.docker.test.ts` runs one for real.
 *
 * **COMMITTED, NOT ROLLED BACK**, as `releases/watch.test.ts` is: the run is background work with its own locks and
 * pools, and the one-running index is the platform's — each test starts from `resetDatabase`.
 *
 * Staging's resources and production's DIFFER here (512 Mi against 1 Gi), so the shape a deploy was given is read off
 * the specs the driver was handed — B sitting 1's F4: with the blueprint's defaults the two are equal and nothing
 * could tell them apart.
 */
const BLUEPRINTS_ROOT = fileURLToPath(new URL('../../../../blueprints', import.meta.url))

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_IDP_DATABASE_URL: 'postgres://unused-idp',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

const bus = createEventBus()

const STAGING_MI = 512
const PRODUCTION_MI = 1024

const one = (kind: 'sandbox' | 'staging' | 'production') => ({
  environmentKind: kind,
  port: 3000,
  health: '/healthz',
  resources: {
    cpu: kind === 'production' ? 1 : 0.5,
    memory: kind === 'production' ? '1Gi' : '512Mi',
    pids: 256,
    disk: '2Gi',
  },
  env: [],
  services: [],
  egressAllow: [],
  classification: 'internal' as const,
  auth: {
    provider: 'none' as const,
    attributes: [] as string[],
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
  },
  ai: {
    models: [] as string[],
    budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 },
  },
})
const RESOLVED = {
  sandbox: one('sandbox'),
  staging: one('staging'),
  production: one('production'),
}

let base: Omit<DeployDeps, 'retirer'>
beforeAll(async () => {
  const keys = await generateMasterKeypair()
  base = {
    secrets: createServiceCredentials(keys, config.masterSecret),
    appSecrets: createAppSecrets(keys),
    blueprints: await loadBlueprints(BLUEPRINTS_ROOT),
    sso: {
      registerServiceProvider: () => {
        throw new Error('no app in this file signs anyone in')
      },
      idpSigningCertificate: () => {
        throw new Error('no app in this file signs anyone in')
      },
    },
    ai: {
      enabled: true,
      mintAppKey: () => {
        throw new Error('no test in this file mints an AI key')
      },
      discardAppKey: () => {
        throw new Error('no test in this file discards an AI key')
      },
      storeInstanceKey: () => {
        throw new Error('no test in this file stores an instance key')
      },
      revokeInstanceKey: () => Promise.resolve(false),
      revokeLegacyAppKey: () => Promise.resolve(false),
    },
    catalogue: declaredCatalogue(),
    bus,
  }
})

beforeEach(resetDatabase)
afterEach(() => {
  vi.restoreAllMocks()
})

// --- the recording driver --------------------------------------------------------------------------------------------

/**
 * The fake driver, every call this file reads recorded in order: each `ensureInstances` as its count and the memory
 * each member was given (the SHAPE), each read of what serves, each exemption. And — on the first ensure after
 * `arm()` — the run's row as it is at that moment, so *"the row first"* is a line in the order.
 */
function recording(fake: FakeDriver) {
  const calls: string[] = []
  let armed = false
  let ensureFails: ((specs: readonly InstanceSpec[]) => boolean) | undefined
  const driver: FakeDriver = {
    ...fake,
    async ensureInstances(specs) {
      if (armed) {
        armed = false
        const rows = await db.select({ state: loadRehearsals.state }).from(loadRehearsals)
        calls.push(`row: ${rows.map((r) => r.state).join(',') || 'none'}`)
      }
      calls.push(`ensure ${specs.length} × ${specs[0]?.resources.memoryMi} Mi`)
      if (ensureFails?.(specs) === true) throw new Error('the daemon went away')
      return fake.ensureInstances(specs)
    },
    async servingInstances(hostname) {
      calls.push('serving')
      return fake.servingInstances(hostname)
    },
    async setRateLimitExemption(hostname, address) {
      calls.push(`exempt ${address ?? 'none'}`)
      return fake.setRateLimitExemption(hostname, address)
    },
  }
  return {
    driver,
    calls,
    arm: () => {
      armed = true
    },
    failEnsure: (when: (specs: readonly InstanceSpec[]) => boolean) => {
      ensureFails = when
    },
    /** The order without the watch's own reads of what serves. */
    order: () => calls.filter((call) => call !== 'serving'),
  }
}

// --- the fake generator ----------------------------------------------------------------------------------------------

const ADDRESS = '10.89.0.99'

/** A clean run of the phases asked: every request answered, quick, each phase at its rate. */
function cleanReport(
  target: LoadTarget,
  phases: { name: string; rps: number; seconds: number }[],
): LoadReport {
  const reports = phases.map((phase) => ({
    name: phase.name as LoadReport['phases'][number]['name'],
    asked: phase.rps,
    achieved: phase.rps + 0.01,
    requests: phase.rps * phase.seconds,
    answered: phase.rps * phase.seconds,
    statusCounts: { '200': phase.rps * phase.seconds },
    p50Ms: 2,
    p95Ms: 8,
    p99Ms: 15,
  }))
  const requests = reports.reduce((sum, p) => sum + p.requests, 0)
  const each = Math.floor(requests / target.paths.length)
  const byPath = Object.fromEntries(
    target.paths.map((path, i) => [
      path,
      { '200': i === 0 ? requests - each * (target.paths.length - 1) : each },
    ]),
  )
  return {
    phases: reports,
    p50Ms: 2,
    p95Ms: 8,
    p99Ms: 15,
    requests,
    answered: requests,
    timeouts: 0,
    achievedRps: 55,
    answeredRatio: 1,
    byPath,
    durationMs: 360_000,
  }
}

/**
 * vegeta's container as the run sees it: `start` answers an address, `go` begins the load — which runs `during`, then
 * ends as the test says — and `removeLeft` ends `done` rejected, as removing the real container does. Every call is
 * pushed onto the driver's own call list, so the two interleave in one order.
 */
function fakeGenerator(
  calls: string[],
  opts: {
    during?: () => Promise<void>
    /** `done` rejects with this instead of a report. */
    fails?: Error
    /** `go` itself fails. */
    goFails?: Error
    /** The load never ends by itself: only `removeLeft`, or `end()`, ends it. */
    hangs?: boolean
    report?: (
      target: LoadTarget,
      phases: { name: string; rps: number; seconds: number }[],
    ) => LoadReport
  } = {},
) {
  const removed: string[] = []
  const labelled: string[] = []
  let settle: ((error?: Error) => void) | undefined
  let wentAhead: () => void = () => {}
  const went = new Promise<void>((resolve) => {
    wentAhead = resolve
  })
  const generator: LoadGenerator = {
    async start(target, phases, labels) {
      calls.push('generator.start')
      labelled.push(labels.loadRehearsalId)
      let resolveDone: (report: LoadReport) => void = () => {}
      let rejectDone: (error: Error) => void = () => {}
      const done = new Promise<LoadReport>((resolve, reject) => {
        resolveDone = resolve
        rejectDone = reject
      })
      settle = (error) =>
        error === undefined
          ? resolveDone((opts.report ?? cleanReport)(target, phases))
          : rejectDone(error)
      return {
        address: ADDRESS,
        async go() {
          calls.push('generator.go')
          if (opts.goFails !== undefined) throw opts.goFails
          wentAhead()
          void (async () => {
            await opts.during?.()
            if (opts.hangs === true) return
            settle?.(opts.fails)
          })()
        },
        done,
      }
    },
    async removeLeft(id) {
      calls.push('generator.removeLeft')
      removed.push(id)
      settle?.(new Error('the load generator’s container was removed'))
      return 1
    },
  }
  return {
    generator,
    removed,
    /** The run id each container was labelled with — what the boot removes it by. */
    labelled,
    /** Resolves once `go()` has been called and the load is under way. */
    went,
    /** Ends a hanging load, rejected — as a dead process's generator would never report. */
    end: () => settle?.(new Error('ended by the test')),
  }
}

// --- the fixture -----------------------------------------------------------------------------------------------------

type Scale = StoredAudience['scale']
type Burst = StoredAudience['burst']

/** A project of `scale` and `burst`, its release built and SERVING STAGING — the candidate — at staging's own shape. */
async function staged(
  fake: FakeDriver,
  opts: { scale?: Scale; burst?: Burst; slug?: string; deploy?: boolean } = {},
) {
  const slug = opts.slug ?? 'big-course'
  const [user] = await db
    .insert(users)
    .values({
      ubcCwlPuid: `puid-${slug}`,
      email: `${slug}@ubc.ca`,
      displayName: slug,
      role: 'member',
    })
    .returning()
  const { project, environments } = await createProject(
    db,
    config,
    await testReservedLabels(),
    {
      slug,
      ownerId: user!.id,
      blueprintRef: 'fixture-node@1',
      starter: null,
      audience: {
        ...testAudience(user!.id),
        scale: opts.scale ?? 'large_course',
        burst: opts.burst ?? 'synchronised',
      },
    },
  )
  const [appSpec] = await db
    .insert(appSpecs)
    .values({
      projectId: project.id,
      commitSha: 'a'.repeat(40),
      parsed: {},
      schemaVersion: 1,
      valid: true,
    })
    .returning()
  const build = await buildToEnd(
    { db, driver: fake, bus },
    {
      projectId: project.id,
      projectSlug: project.slug,
      appSpecId: appSpec!.id,
      commitSha: appSpec!.commitSha,
      blueprintRef: project.blueprintRef,
      repoPath: `/tmp/${slug}.git`,
    },
  )
  const release = await createRelease(db, {
    projectId: project.id,
    buildId: build.id,
    appSpecId: appSpec!.id,
    createdBy: user!.id,
    resolvedConfig: RESOLVED,
  })
  const retirer = createRetirer({
    db,
    driver: fake,
    ai: base.ai,
    appSecrets: base.appSecrets,
    bus,
    drainMs: 0,
  })
  registerBackgroundWork(retirer.idle)
  const deploy: DeployDeps = { ...base, retirer }
  const staging = environments.find((e) => e.kind === 'staging')!
  const production = environments.find((e) => e.kind === 'production')!
  let before: string | undefined
  if (opts.deploy !== false) {
    const set = await deployReleaseSet(db, fake, config, deploy, {
      releaseId: release.id,
      environmentId: staging.id,
    })
    expect(set.instances.map((m) => m.state)).toEqual(['healthy'])
    before = set.instances[0]!.id
    await retirer.idle()
  }
  return { user: user!, project, release, staging, production, deploy, retirer, before }
}

/** The run's deps over `driver`, with the watch reading every 5 ms. */
function depsFor(
  f: Awaited<ReturnType<typeof staged>>,
  driver: FakeDriver,
  generator: LoadGenerator,
): LoadRehearsalDeps {
  return { db, driver, config, deploy: f.deploy, generator, watchIntervalMs: 5 }
}

/** What serves staging now: each member's id, state and the memory its spec gave it. */
async function stagingNow(fake: FakeDriver, hostname: string, environmentId: string) {
  const serving = await fake.servingInstances(hostname)
  const rows = await db
    .select()
    .from(instances)
    .where(eq(instances.environmentId, environmentId))
    .orderBy(asc(instances.createdAt), asc(instances.id))
  return serving.map((handle) => {
    const row = rows.find((r) => r.handle === handle)
    return { id: row?.id, state: row?.state }
  })
}

const rowOf = async (id: string) =>
  (await db.select().from(loadRehearsals).where(eq(loadRehearsals.id, id)))[0]!

/** Every `load_rehearsal.completed` published for a run — ONE per finished row (Decision 11). */
const completedOf = async (id: string) =>
  db
    .select()
    .from(events)
    .where(
      and(
        eq(events.type, 'load_rehearsal.completed'),
        eq(events.subject, `load-rehearsal:${id}`),
      ),
    )

// --- the run ---------------------------------------------------------------------------------------------------------

describe('runLoadRehearsal — grant, read back, load, watch, judge, record, take down', () => {
  it('writes the row FIRST, grants staging production’s shape, reads it back, exempts the generator, loads, clears the exemption, and gives staging back — in that order', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const rec = recording(fake)
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const gen = fakeGenerator(rec.calls, { during: () => gate })
    rec.arm()

    const { row, done } = await runLoadRehearsal(depsFor(f, rec.driver, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    // ANSWERED AT ONCE, `running` — before any load.
    expect(row.state).toBe('running')
    expect(rec.calls).not.toContain('generator.go')
    await gen.went
    release()
    const ended = await done

    expect(rec.order()).toEqual([
      'row: running',
      `ensure 3 × ${PRODUCTION_MI} Mi`,
      'generator.start',
      `exempt ${ADDRESS}`,
      'generator.go',
      'exempt none',
      `ensure 1 × ${STAGING_MI} Mi`,
    ])
    expect(ended.state).toBe('passed')
    expect(ended.takenDownAt).not.toBeNull()
    expect(ended.finishedAt).not.toBeNull()
    expect(ended.generatorAddress).toBe(ADDRESS)
    expect(gen.labelled).toEqual([row.id])
    expect(ended.scale).toBe('large_course')
    expect(ended.burst).toBe('synchronised')
    expect(ended.profile.phases).toEqual([
      { name: 'arrive', rps: 75, seconds: 60 },
      { name: 'sustain', rps: 50, seconds: 300 },
    ])
    expect(ended.profile.paths).toEqual(['/', '/healthz'])
    // GRANTED IS WHAT WAS READ BACK: three members, at production's resources.
    expect(ended.granted).toMatchObject({
      count: 3,
      resources: { environment: 'production', memory: '1Gi', cpu: 1 },
    })
    expect(ended.granted!.instanceIds).toHaveLength(3)
    expect(ended.evidence).toMatchObject({
      requests: 19500,
      answered: 19500,
      answeredRatio: 1,
      p95Ms: 8,
      instanceExits: 0,
      outOfMemory: false,
      unhealthy: false,
    })
    expect(ended.evidence!.reason).toContain('every instance stayed healthy')
    // STAGING BACK IN ITS OWN SHAPE: one member, healthy, and none of the three; no exemption left.
    const now = await stagingNow(fake, f.staging.hostname, f.staging.id)
    expect(now).toHaveLength(1)
    expect(now[0]!.state).toBe('healthy')
    expect(ended.granted!.instanceIds).not.toContain(now[0]!.id)
    expect(fake.rateLimitExemption(f.staging.hostname)).toBeNull()
    // ONE `load_rehearsal.completed`, from the run, naming who ran it and how it went (Task 5, Decision 11).
    const completed = await completedOf(row.id)
    expect(completed.map((event) => event.machineDetail)).toEqual([
      {
        loadRehearsalId: row.id,
        releaseId: f.release.id,
        state: 'passed',
        p95Ms: 8,
        answeredRatio: 1,
        reason: ended.evidence!.reason,
      },
    ])
    expect(completed[0]!.humanMessage).toBe(
      `big-course ran the load rehearsal and it passed: ${ended.evidence!.reason}.`,
    )
  })

  it('reads the candidate while staging serves N — the same release before, during (its first member crashed too) and after', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const seen: (string | undefined)[] = []
    const gen = fakeGenerator([], {
      during: async () => {
        seen.push((await candidateFor(db, f.project.id))?.release.id)
        const first = (await fake.servingInstances(f.staging.hostname))[0]!
        fake.crash(first) // running, its health check failing: the set's first is no longer healthy
        seen.push((await candidateFor(db, f.project.id))?.release.id)
      },
    })
    seen.push((await candidateFor(db, f.project.id))?.release.id)
    const { done } = await runLoadRehearsal(depsFor(f, fake, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    const ended = await done
    seen.push((await candidateFor(db, f.project.id))?.release.id)
    expect(seen).toEqual([f.release.id, f.release.id, f.release.id, f.release.id])
    // And the crash was seen: running, not healthy.
    expect(ended.state).toBe('failed')
    expect(ended.evidence!.reason).toBe('an instance was unhealthy during the run')
  })
})

describe('the grant read back (Review Focus 0)', () => {
  it('a grant ANSWERED failed is a failed run with the Incident’s line — no exemption, no load, staging still its own one instance', async () => {
    let failGrant = false
    const fake = createFakeDriver({
      neverReady: (spec) => failGrant && spec.resources.memoryMi === PRODUCTION_MI,
    })
    const f = await staged(fake)
    const rec = recording(fake)
    const gen = fakeGenerator(rec.calls)
    failGrant = true
    const { done } = await runLoadRehearsal(depsFor(f, rec.driver, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    const ended = await done
    failGrant = false

    expect(ended.state).toBe('failed')
    // The Incident's line: the fake's readiness refusal, as the deploy recorded it.
    expect(ended.evidence!.reason).toBe(
      "production's shape could not start on staging: readiness: the fake driver was asked for a spec it never " +
        'makes ready (/healthz) — nothing was loaded, so nothing was measured',
    )
    expect(rec.calls.some((call) => call.startsWith('exempt'))).toBe(false)
    expect(rec.calls.some((call) => call.startsWith('generator'))).toBe(false)
    // What was read back serving is what is recorded: staging's own one instance, from before the run.
    expect(ended.granted).toMatchObject({ count: 1, instanceIds: [f.before] })
    expect(await stagingNow(fake, f.staging.hostname, f.staging.id)).toEqual([
      { id: f.before, state: 'healthy' },
    ])
    // Nothing to give back: the take-down did not redeploy what the grant could not.
    expect(rec.order().filter((call) => call.startsWith('ensure'))).toEqual([
      `ensure 3 × ${PRODUCTION_MI} Mi`,
    ])
  })

  it('a take-down ANSWERED failed is teardown_failed — the granted set still serving — and the next staging deploy is not refused and gives staging back', async () => {
    let failOwn = false
    const fake = createFakeDriver({
      neverReady: (spec) => failOwn && spec.resources.memoryMi === STAGING_MI,
    })
    const f = await staged(fake)
    failOwn = true
    const gen = fakeGenerator([])
    const { done } = await runLoadRehearsal(depsFor(f, fake, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    const ended = await done
    failOwn = false

    expect(ended.state).toBe('teardown_failed')
    expect(ended.takenDownAt).toBeNull()
    expect(ended.evidence!.reason).toMatch(
      /^staging could not be given back its own shape/,
    )
    // ITS JUDGEMENT KEPT, and a pass — but a teardown_failed row never meets anything.
    expect(ended.evidence!.judged).toMatchObject({ passed: true })
    expect(await fake.servingInstances(f.staging.hostname)).toHaveLength(3)

    const back = await deployRelease(db, fake, config, f.deploy, {
      releaseId: f.release.id,
      environmentId: f.staging.id,
    })
    expect(back.state).toBe('healthy')
    expect(await fake.servingInstances(f.staging.hostname)).toEqual([back.handle])
  })
})

describe('the take-down, every way (Review Focus 1)', () => {
  it('a generator that fails is a failed run — its words recorded — and staging is still given back', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const rec = recording(fake)
    const gen = fakeGenerator(rec.calls, {
      fails: new Error('the load generator failed: vegeta could not resolve the target'),
    })
    const { done } = await runLoadRehearsal(depsFor(f, rec.driver, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    const ended = await done
    expect(ended.state).toBe('failed')
    expect(ended.evidence!.reason).toBe(
      'the load could not be measured: the load generator failed: vegeta could not resolve the target',
    )
    expect(rec.order().slice(-2)).toEqual(['exempt none', `ensure 1 × ${STAGING_MI} Mi`])
    expect(await stagingNow(fake, f.staging.hostname, f.staging.id)).toHaveLength(1)
    expect(fake.rateLimitExemption(f.staging.hostname)).toBeNull()
  })

  it('a go() that fails clears the exemption, THEN removes the waiting generator — and gives staging back', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const rec = recording(fake)
    const gen = fakeGenerator(rec.calls, { goFails: new Error('touch exited 1') })
    const { done } = await runLoadRehearsal(depsFor(f, rec.driver, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    const ended = await done
    expect(ended.state).toBe('failed')
    expect(ended.evidence!.reason).toBe('the load could not be measured: touch exited 1')
    const order = rec.order()
    expect(order.slice(order.indexOf('generator.go'))).toEqual([
      'generator.go',
      'exempt none',
      'generator.removeLeft',
      `ensure 1 × ${STAGING_MI} Mi`,
    ])
    expect(gen.removed).toEqual([ended.id])
  })

  it('a take-down that THROWS is teardown_failed, even when the judgement passed', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const rec = recording(fake)
    const gen = fakeGenerator(rec.calls)
    rec.failEnsure((specs) => specs[0]?.resources.memoryMi === STAGING_MI)
    const { done } = await runLoadRehearsal(depsFor(f, rec.driver, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    const ended = await done
    expect(ended.state).toBe('teardown_failed')
    expect(ended.evidence!.reason).toMatch(
      /^staging could not be given back its own shape: the daemon went away/,
    )
    expect(ended.evidence!.judged).toEqual({
      passed: true,
      reason: expect.stringContaining('every instance stayed healthy'),
    })
    expect(await fake.servingInstances(f.staging.hostname)).toHaveLength(3)
  })

  it('an instance that runs out of memory under the load fails the run, naming it — and staging is given back', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const gen = fakeGenerator([], {
      during: async () => {
        const second = (await fake.servingInstances(f.staging.hostname))[1]!
        fake.crash(second, 137, { outOfMemory: true })
      },
    })
    const { done } = await runLoadRehearsal(depsFor(f, fake, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    const ended = await done
    expect(ended.state).toBe('failed')
    expect(ended.evidence).toMatchObject({
      reason: 'an instance ran out of memory during the run',
      outOfMemory: true,
      instanceExits: 1,
    })
    expect(await stagingNow(fake, f.staging.hostname, f.staging.id)).toHaveLength(1)
  })

  it('a set the edge stops serving mid-run (the app switched off) stops the generator, and the archived app’s staging is left to the archive — abandoned', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const rec = recording(fake)
    const gen = fakeGenerator(rec.calls, {
      hangs: true,
      during: async () => {
        // An archive, as far as this run can see it: the project switched off, its name answering nothing of the app's.
        await db
          .update(projects)
          .set({ state: 'archived' })
          .where(eq(projects.id, f.project.id))
        await fake.switchOff(f.staging.hostname, 'staging')
      },
    })
    const { done } = await runLoadRehearsal(depsFor(f, rec.driver, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    const ended = await done
    expect(gen.removed).toEqual([ended.id])
    expect(ended.state).toBe('abandoned')
    expect(ended.evidence!.reason).toMatch(
      /^the app was switched off while its load rehearsal ran/,
    )
    // Nothing redeployed onto an archived app's staging.
    expect(rec.order().filter((call) => call.startsWith('ensure'))).toEqual([
      `ensure 3 × ${PRODUCTION_MI} Mi`,
    ])
  })
})

describe('one at a time — a database invariant (Decision 6)', () => {
  it('refuses another project’s run with LOAD_REHEARSAL_BUSY — by the index’s conflict — naming no other project, and deploys nothing', async () => {
    const fake = createFakeDriver()
    const other = await staged(fake, { slug: 'other-course' })
    await db.insert(loadRehearsals).values({
      projectId: other.project.id,
      environmentId: other.staging.id,
      releaseId: other.release.id,
      imageDigest: 'sha256:x',
      scale: 'large_course',
      burst: 'steady',
      profile: {
        phases: [],
        paths: ['/'],
        timeoutMs: 1,
        pass: config.loadRehearsal.pass,
      },
    })
    const f = await staged(fake)
    const rec = recording(fake)
    const refused = await runLoadRehearsal(
      depsFor(f, rec.driver, fakeGenerator(rec.calls).generator),
      {
        projectId: f.project.id,
        actor: { id: f.user.id },
      },
    ).catch((error: unknown) => error)
    expect(refused).toMatchObject({ code: 'LOAD_REHEARSAL_BUSY' })
    expect((refused as Error).message).not.toContain('other-course')
    expect(rec.calls).toEqual([])
    expect(
      await db
        .select()
        .from(loadRehearsals)
        .where(eq(loadRehearsals.projectId, f.project.id)),
    ).toEqual([])
  })

  it('refuses this project’s second run with LOAD_REHEARSAL_RUNNING — and a positive control: with nothing running, it starts', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const gen = fakeGenerator([], { hangs: true })
    const first = await runLoadRehearsal(depsFor(f, fake, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    expect(first.row.state).toBe('running')
    const refused = await runLoadRehearsal(
      depsFor(f, fake, fakeGenerator([]).generator),
      {
        projectId: f.project.id,
        actor: { id: f.user.id },
      },
    ).catch((error: unknown) => error)
    expect(refused).toMatchObject({ code: 'LOAD_REHEARSAL_RUNNING' })
    await gen.went
    gen.end()
    expect((await first.done).state).toBe('failed')
  })

  it('refuses while D21’s rehearsal holds the project’s rehearsal lock — REHEARSAL_RUNNING, nothing inserted', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const refused = await tryWithRehearsalLock(f.project.id, () =>
      runLoadRehearsal(depsFor(f, fake, fakeGenerator([]).generator), {
        projectId: f.project.id,
        actor: { id: f.user.id },
      }).catch((error: unknown) => error),
    )
    expect(refused).toMatchObject({ code: 'REHEARSAL_RUNNING' })
    expect(await db.select().from(loadRehearsals)).toEqual([])
  })

  it('refuses a class app (LOAD_REHEARSAL_NOT_NEEDED) and an app with nothing serving staging (REHEARSAL_NO_CANDIDATE) before writing anything', async () => {
    const fake = createFakeDriver()
    const classApp = await staged(fake, { slug: 'one-class', scale: 'class' })
    expect(
      await runLoadRehearsal(depsFor(classApp, fake, fakeGenerator([]).generator), {
        projectId: classApp.project.id,
        actor: { id: classApp.user.id },
      }).catch((error: unknown) => error),
    ).toMatchObject({ code: 'LOAD_REHEARSAL_NOT_NEEDED' })
    const notServing = await staged(fake, { slug: 'not-yet', deploy: false })
    expect(
      await runLoadRehearsal(depsFor(notServing, fake, fakeGenerator([]).generator), {
        projectId: notServing.project.id,
        actor: { id: notServing.user.id },
      }).catch((error: unknown) => error),
    ).toMatchObject({ code: 'REHEARSAL_NO_CANDIDATE' })
    expect(await db.select().from(loadRehearsals)).toEqual([])
  })
})

describe('the shape is narrow', () => {
  it('refuses the grant’s purpose and a run’s id anywhere but staging, and a grant that names no run', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const deploy = (input: Partial<Parameters<typeof deployRelease>[4]>) =>
      deployRelease(db, fake, config, f.deploy, {
        releaseId: f.release.id,
        environmentId: f.production.id,
        ...input,
      }).catch((error: unknown) => (error as Error).message)
    expect(await deploy({ purpose: 'load-rehearsal', loadRehearsalId: 'lr' })).toBe(
      "a load rehearsal grants STAGING production's shape, never production",
    )
    expect(await deploy({ loadRehearsalId: 'lr' })).toMatch(
      /^a load rehearsal's deploys are staging's/,
    )
    expect(
      await deploy({ environmentId: f.staging.id, purpose: 'load-rehearsal' }),
    ).toMatch(/names its run/)
    // Nothing started for any of them.
    expect(
      await db
        .select()
        .from(instances)
        .where(and(eq(instances.environmentId, f.production.id))),
    ).toEqual([])
  })
})

// --- the boot's half -------------------------------------------------------------------------------------------------

describe('staging is the run’s while it lasts (Task 5, Decision 6; Review Focus 7)', () => {
  it('refuses a staging deploy that names no run, and one that names another — LOAD_REHEARSAL_RUNNING, nothing started — while the run’s own pass; after it, one passes', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const rec = recording(fake)
    const gen = fakeGenerator(rec.calls, { hangs: true })
    const { done } = await runLoadRehearsal(depsFor(f, rec.driver, gen.generator), {
      projectId: f.project.id,
      actor: { id: f.user.id },
    })
    await gen.went
    const stagingRows = async () =>
      (await db.select().from(instances).where(eq(instances.environmentId, f.staging.id)))
        .length
    const before = await stagingRows()
    for (const loadRehearsalId of [undefined, randomUUID()])
      await expect(
        deployReleaseSet(db, fake, config, f.deploy, {
          releaseId: f.release.id,
          environmentId: f.staging.id,
          ...(loadRehearsalId === undefined ? {} : { loadRehearsalId }),
        }),
        String(loadRehearsalId),
      ).rejects.toMatchObject({ name: 'ReleaseError', code: 'LOAD_REHEARSAL_RUNNING' })
    expect(await stagingRows()).toBe(before)

    // The run's own take-down passed (it carries the row's id): staging is back in its own shape.
    gen.end()
    const ended = await done
    expect(ended.state).toBe('failed')
    expect(await stagingNow(fake, f.staging.hostname, f.staging.id)).toHaveLength(1)
    // The positive control: with no run holding staging, a deploy that names none passes.
    const after = await deployReleaseSet(db, fake, config, f.deploy, {
      releaseId: f.release.id,
      environmentId: f.staging.id,
    })
    expect(after.instances.map((member) => member.state)).toEqual(['healthy'])
    await f.retirer.idle()
  })
})

describe('takeDownLeftLoadRehearsals — the boot’s pass 2⅞ (Decision 13)', () => {
  it('ends a run a stopped process left — its generator removed, the exemption cleared, staging given back, the row abandoned, one operator line', async () => {
    const fake = createFakeDriver()
    const f = await staged(fake)
    const rec = recording(fake)
    // A RUN STOPPED MID-WAY, not a row written by hand: granted, exempting, loading — and never ending by itself.
    const stopped = fakeGenerator(rec.calls, { hangs: true })
    const { row, done } = await runLoadRehearsal(
      depsFor(f, rec.driver, stopped.generator),
      {
        projectId: f.project.id,
        actor: { id: f.user.id },
      },
    )
    await stopped.went
    expect(fake.rateLimitExemption(f.staging.hostname)).toBe(ADDRESS)
    expect(await fake.servingInstances(f.staging.hostname)).toHaveLength(3)

    // THE NEXT BOOT. Its generator is a fresh one, as the next process's is.
    const boot = fakeGenerator(rec.calls)
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line))
    const report = await takeDownLeftLoadRehearsals({
      db,
      driver: rec.driver,
      config,
      deploy: f.deploy,
      generator: boot.generator,
    })
    expect(report).toEqual({ abandoned: [row.id], failed: [] })
    expect(boot.removed).toEqual([row.id])
    expect(fake.rateLimitExemption(f.staging.hostname)).toBeNull()
    expect(await stagingNow(fake, f.staging.hostname, f.staging.id)).toHaveLength(1)
    const ended = await rowOf(row.id)
    expect(ended.state).toBe('abandoned')
    expect(ended.takenDownAt).not.toBeNull()
    expect(lines.filter((line) => line.includes('[boot] load rehearsal'))).toEqual([
      `[boot] load rehearsal ${row.id} of ${f.staging.hostname} was left running: abandoned, staging given back`,
    ])

    // The stopped run, ended for the test's sake: the row the boot ended stays as the boot wrote it.
    stopped.end()
    expect((await done).state).toBe('abandoned')
    // ONE `load_rehearsal.completed` — the boot's, nobody acting — and the stopped run's own end publishes none.
    const completed = await completedOf(row.id)
    expect(completed).toHaveLength(1)
    expect(completed[0]).toMatchObject({
      actorUserId: null,
      machineDetail: {
        loadRehearsalId: row.id,
        state: 'abandoned',
        p95Ms: null,
        answeredRatio: null,
      },
    })
    expect(completed[0]!.humanMessage).toMatch(
      /^The load rehearsal big-course ran was not finished: /,
    )
  })

  it('finds nothing to do when no run is left', async () => {
    const fake = createFakeDriver()
    const gen = fakeGenerator([])
    const f = await staged(fake)
    expect(
      await takeDownLeftLoadRehearsals({
        db,
        driver: fake,
        config,
        deploy: f.deploy,
        generator: gen.generator,
      }),
    ).toEqual({ abandoned: [], failed: [] })
    expect(gen.removed).toEqual([])
  })
})
