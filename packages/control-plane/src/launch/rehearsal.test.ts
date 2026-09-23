import { describe, expect, it } from 'vitest'
import { appSpecs, builds, environments, rehearsals, releases } from '../db/index.js'
import { withProject } from '../db/testing.js'
import {
  RehearsalError,
  rehearsalCovers,
  rehearsalItem,
  runRehearsal,
} from './rehearsal.js'
import type { RehearsalDeps } from './rehearsal.js'

/**
 * D21's rehearsal as R2 redefines it (P6a Task 14) — the parts that can be measured
 * without Docker, an IdP or a deployed app.
 *
 * **WHAT IS DELIBERATELY NOT HERE, AND WHERE IT IS INSTEAD.** `runRehearsal`'s happy path
 * deploys a real image, registers a real Service Provider and completes a real CWL
 * sign-in; a unit-tier version of that would be three fakes agreeing with each other,
 * which is the shape §16's tiers exist to avoid. It is in
 * `releases/production.docker.test.ts` (where a rehearsal that CANNOT sign in is recorded
 * as failed, against a real deploy and a real registration) and in the live drive this
 * sitting recorded. What is here is the checklist item — the thing a person reads and the
 * gate refuses on — and Decision 10's comparison.
 */
const CANDIDATE = {
  hostname: 'chem-labs.manifest.internal',
  auth: {
    provider: 'cwl' as const,
    attributes: ['ubcEduCwlPuid', 'mail'],
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
  },
}

const ACS = `https://${CANDIDATE.hostname}${CANDIDATE.auth.callback}`

/** A row as `runRehearsal` writes one, with only what a test varies passed in. */
const rowFor = (overrides: {
  projectId: string
  passed: boolean
  acsUrl?: string
  attributes?: string[]
  reason?: string
  releaseId: string
}) => ({
  projectId: overrides.projectId,
  releaseId: overrides.releaseId,
  passed: overrides.passed,
  entityId: 'https://manifest.internal/sp/chem-labs/production',
  acsUrl: overrides.acsUrl ?? ACS,
  attributes: overrides.attributes ?? ['ubcEduCwlPuid', 'mail'],
  evidence: {
    instanceId: null,
    hostname: CANDIDATE.hostname,
    listener: 'public' as const,
    signInStatus: overrides.passed ? 200 : 403,
    attributesReleased: overrides.passed ? ['ubcEduCwlPuid', 'mail'] : [],
    reason: overrides.reason ?? 'the sign-in completed',
  },
})

/** A project with a release, so a rehearsal row has something to point at. */
async function withCandidate(
  fn: (
    db: Parameters<Parameters<typeof withProject>[0]>[0],
    ctx: { projectId: string; releaseId: string },
  ) => Promise<void>,
): Promise<void> {
  await withProject(async (db, { projectId, ownerId }) => {
    // §23's three environments, which `createProject` writes for every real project — the
    // rehearsal reads the production one, and a fixture without it refuses for the wrong
    // reason (measured while writing this file: `NOT_FOUND`, not `REHEARSAL_NO_CANDIDATE`).
    await db.insert(environments).values(
      (['sandbox', 'staging', 'production'] as const).map((kind) => ({
        projectId,
        kind,
        hostname:
          kind === 'production'
            ? CANDIDATE.hostname
            : `chem-labs.${kind}.manifest.internal`,
      })),
    )
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
    const [build] = await db
      .insert(builds)
      .values({
        projectId,
        appSpecId: spec!.id,
        commitSha: 'a'.repeat(40),
        status: 'succeeded',
        imageDigest: `sha256:${'a'.repeat(64)}`,
        imageRepository: 'local/chem-labs',
      })
      .returning()
    const [release] = await db
      .insert(releases)
      .values({
        projectId,
        buildId: build!.id,
        appSpecId: spec!.id,
        createdBy: ownerId,
        resolvedConfig: {},
      })
      .returning()
    await fn(db, { projectId, releaseId: release!.id })
  })
}

describe('Decision 10 — does this rehearsal still certify what would be registered now?', () => {
  it('covers a candidate that would register exactly what it was run against', () => {
    // THE POSITIVE CONTROL. Every case below says `rehearsalCovers` answered false; a
    // function that always did would pass all of them, and this is the pair.
    expect(
      rehearsalCovers(
        { acsUrl: ACS, attributes: ['ubcEduCwlPuid', 'mail'] },
        { acsUrl: ACS, attributes: ['ubcEduCwlPuid', 'mail'] },
      ),
    ).toBe(true)
  })

  it('does not care about the ORDER of the attributes — a reorder is not a change of intent', () => {
    expect(
      rehearsalCovers(
        { acsUrl: ACS, attributes: ['mail', 'ubcEduCwlPuid'] },
        { acsUrl: ACS, attributes: ['ubcEduCwlPuid', 'mail'] },
      ),
    ).toBe(true)
  })

  it('does not cover a candidate asking for an attribute it was not run against', () => {
    expect(
      rehearsalCovers(
        { acsUrl: ACS, attributes: ['ubcEduCwlPuid', 'mail'] },
        { acsUrl: ACS, attributes: ['ubcEduCwlPuid', 'mail', 'sn'] },
      ),
    ).toBe(false)
  })

  it('does not cover a candidate whose ACS URL moved', () => {
    expect(
      rehearsalCovers(
        { acsUrl: ACS, attributes: ['ubcEduCwlPuid', 'mail'] },
        {
          acsUrl: 'https://chem-labs.manifest.internal/auth/saml/callback',
          attributes: ['ubcEduCwlPuid', 'mail'],
        },
      ),
    ).toBe(false)
  })
})

describe('§13’s rehearsal item, met by a measurement (R2)', () => {
  it('is met, and SAYS IT PROVES THE SHAPE AND NOT UBC’S ACCEPTANCE', async () => {
    /**
     * **R2 MADE A SENTENCE A CONDITION, SO THE SENTENCE GETS A TEST** (the plan's control
     * (d), which predicts that deleting it turns nothing else red). The next person to
     * read this checklist is deciding whether an application may go in front of students,
     * and the difference between *"the registration's shape works"* and *"UBC accepted
     * this registration"* is the difference between a rehearsal and a launch approval.
     */
    await withCandidate(async (db, { projectId, releaseId }) => {
      await db.insert(rehearsals).values(rowFor({ projectId, releaseId, passed: true }))
      const item = await rehearsalItem(db, projectId, CANDIDATE)
      expect(item.state).toBe('met')
      expect(item.why).toContain('SHAPE of the registration')
      expect(item.why).toContain('proves nothing about UBC')
      // Plain words: the console renders `why` as text, so markdown arrives as literal
      // asterisks in front of a person (P6a sitting 11, seen clicking).
      expect(item.why).not.toContain('**')
      expect(item.why).toContain('external-track obligation')
      // And it names the MEASUREMENT rather than asserting a tick: the listener it ran on
      // and how many attributes the assertion actually released.
      expect(item.why).toContain('public listener')
      expect(item.why).toContain('2 attribute(s)')
    })
  })

  it('is unmet when nobody has run one', async () => {
    await withCandidate(async (db, { projectId }) => {
      const item = await rehearsalItem(db, projectId, CANDIDATE)
      expect({ state: item.state, blocking: item.blocking }).toEqual({
        state: 'unmet',
        blocking: true,
      })
      expect(item.why).toContain('Nobody has run it')
    })
  })

  it('is unmet when the newest rehearsal did not pass, in the evidence’s own words', async () => {
    await withCandidate(async (db, { projectId, releaseId }) => {
      await db.insert(rehearsals).values(
        rowFor({
          projectId,
          releaseId,
          passed: false,
          reason: 'the app did not offer a CWL login form: it answered 404 at /login',
        }),
      )
      const item = await rehearsalItem(db, projectId, CANDIDATE)
      expect(item.state).toBe('unmet')
      expect(item.why).toContain('did not offer a CWL login form')
    })
  })

  it('is unmet when the release now asks for an attribute the rehearsal never released (Decision 10)', async () => {
    await withCandidate(async (db, { projectId, releaseId }) => {
      await db.insert(rehearsals).values(rowFor({ projectId, releaseId, passed: true }))
      const item = await rehearsalItem(db, projectId, {
        ...CANDIDATE,
        auth: { ...CANDIDATE.auth, attributes: ['ubcEduCwlPuid', 'mail', 'sn'] },
      })
      expect(item.state).toBe('unmet')
      // It names BOTH halves, because "run it again" with no reason reads as a flake.
      expect(item.why).toContain('mail, ubcEduCwlPuid')
      expect(item.why).toContain('mail, sn, ubcEduCwlPuid')
    })
  })

  it('takes the NEWEST rehearsal, not the first — a failure after a pass is the answer', async () => {
    await withCandidate(async (db, { projectId, releaseId }) => {
      await db.insert(rehearsals).values({
        ...rowFor({ projectId, releaseId, passed: true }),
        ranAt: new Date('2026-09-01T00:00:00Z'),
      })
      await db.insert(rehearsals).values({
        ...rowFor({
          projectId,
          releaseId,
          passed: false,
          reason: 'the instance is not healthy in production',
        }),
        ranAt: new Date('2026-09-02T00:00:00Z'),
      })
      const item = await rehearsalItem(db, projectId, CANDIDATE)
      expect(item.state).toBe('unmet')
      expect(item.why).toContain('not healthy in production')
    })
  })

  it('is met with “signs nobody in” for an app with no CWL, whatever has been run', async () => {
    /**
     * `[M9]`'s finding, and R4(c)'s trap in a different costume: an app with
     * `auth.provider: none` registers no Service Provider, so there is nothing to
     * rehearse — and an item that stayed `unmet` would make every non-CWL app
     * permanently unlaunchable. The ROUTE refuses (`REHEARSAL_NOT_CWL`); the CHECKLIST
     * says there is nothing to do.
     */
    await withCandidate(async (db, { projectId }) => {
      const item = await rehearsalItem(db, projectId, {
        ...CANDIDATE,
        auth: { ...CANDIDATE.auth, provider: 'none', attributes: [] },
      })
      expect(item.state).toBe('met')
      expect(item.why).toContain('signs nobody in')
    })
  })

  it('is unmet when nothing is serving staging — there is no candidate to rehearse', async () => {
    await withCandidate(async (db, { projectId }) => {
      const item = await rehearsalItem(db, projectId, undefined)
      expect(item.state).toBe('unmet')
      expect(item.why).toContain('Nothing is serving in staging')
    })
  })
})

/**
 * Deps whose every member THROWS. `runRehearsal`'s refusals happen before it deploys or
 * signs in, and a stub that answered would let a refusal pass for the wrong reason — this
 * way, reaching the deploy fails the test with a sentence saying so.
 */
const refusingDeps = (db: RehearsalDeps['db']): RehearsalDeps =>
  ({
    db,
    get driver(): never {
      throw new Error(
        'runRehearsal reached the DRIVER, and this case should refuse first',
      )
    },
    get config(): never {
      throw new Error('runRehearsal reached CONFIG, and this case should refuse first')
    },
    get deploy(): never {
      throw new Error(
        'runRehearsal reached the DEPLOY, and this case should refuse first',
      )
    },
    signIn: {
      signIn: () => {
        throw new Error(
          'runRehearsal reached the SIGN-IN, and this case should refuse first',
        )
      },
    },
    get bus(): never {
      throw new Error('runRehearsal reached the BUS, and this case should refuse first')
    },
  }) as unknown as RehearsalDeps

describe('runRehearsal refuses before it deploys anything', () => {
  it('refuses when nothing is serving staging: REHEARSAL_NO_CANDIDATE', async () => {
    await withCandidate(async (db, { projectId }) => {
      // The project has a RELEASE and no instance — which is the common case, and the one
      // a person hits by pressing the button too early.
      await expect(
        runRehearsal(refusingDeps(db), projectId, { userId: '', puid: 'opr000001' }),
      ).rejects.toMatchObject({ code: 'REHEARSAL_NO_CANDIDATE' })
    })
  })

  it('a project that does not exist is a FAULT here, not a refusal — the route 404s first', async () => {
    // `assertCapability` in the route answers `404` for a project that does not exist or
    // that the actor may not see, so this branch is unreachable through the API. It
    // throws a plain Error — an `INTERNAL` — rather than a coded `RehearsalError`,
    // because a registered wire code nothing can produce is what `error-codes.test.ts`
    // refuses. Asserted so that a future coded refusal here is a deliberate change.
    await withCandidate(async (db) => {
      const error = await runRehearsal(
        refusingDeps(db),
        '00000000-0000-0000-0000-000000000000',
        { userId: '', puid: 'opr000001' },
      ).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(RehearsalError)
    })
  })
})
