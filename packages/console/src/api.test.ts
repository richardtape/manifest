import { createMockServer, fixtures } from '@manifest/mock'
import { subscribe, type StreamFrame } from '@manifest/contract'
import { describe, expect, it } from 'vitest'
import { createApi } from './api.js'

/**
 * DECISION 7 SAYS THE CONSOLE HAS NO DOM TEST TIER, AND THIS IS WHY THAT IS TENABLE: its
 * screens are proved by a person clicking them (Task 14), and its CALLS — the whole of
 * `api.ts`, which is the only place the console touches the API — are proved here, in Node,
 * against `manifest-mock`.
 *
 * THIS IS ALSO THE MOCK'S OWN ACCEPTANCE (Decision 10). Hand-written fixtures are held
 * honest by three things and this is the third: `tsc` on the generated types, `ajv` against
 * the document, and **a fixture the console cannot consume fails a TEST rather than a
 * demo**. Every function on `createApi` is called below for exactly that reason — a fixture
 * that parses and is missing the field a screen reads would otherwise be found by a person
 * clicking.
 *
 * `createApi({ origin, session })` IS THE NODE SHAPE. In a browser the console passes
 * `{ origin: window.location.origin }` and nothing else, because the browser sends its own
 * cookie and its own `Origin`; here `@manifest/contract`'s non-browser branch sends both as
 * headers. That difference is why a test can pass while a click does not, and it is the one
 * thing this tier cannot see.
 *
 * IMPORTING `@manifest/mock` ACROSS THE PACKAGE BOUNDARY IS ALLOWED AND NEITHER HALF OF THE
 * BOUNDARY STOPS IT: `boundary.test.ts`'s scanner skips any file ending `.test.ts`, and
 * `eslint.config.js` carries `ignores: ['packages/console/src/**\/*.test.ts']` on the same
 * rule. Checked rather than assumed, because the obvious repair for a refusal here would be
 * to weaken the boundary.
 */
async function withMock<T>(
  fn: (origin: string) => Promise<T>,
  options: Parameters<typeof createMockServer>[0] = {},
): Promise<T> {
  const server = createMockServer({ scanSilenceMs: 50, ...options })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  try {
    return await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

const api = (origin: string) => createApi({ origin, session: 'mock-session' })

const {
  BUILD_ID,
  CONFIRMED_ACTION_ID,
  PENDING_ACTION_ID,
  PROJECT_ID,
  RELEASE_ID,
  STAGING_ID,
  STUDENT_ID,
  TOKEN_ID,
} = fixtures

describe('the console’s data layer against manifest-mock', () => {
  it('reads who is signed in', async () => {
    await withMock(async (origin) => {
      expect((await api(origin).getMe()).puid).toBe('ins000001')
    })
  })

  /**
   * EVERY READ THE CONSOLE MAKES, CONSUMED. Each assertion names a field a screen actually
   * renders, so a fixture missing one fails here rather than in a browser. A bare
   * `expect(x).toBeDefined()` would pass against any body at all, which is this project's
   * *assert the shape of the answer* rule (ORIENTATION §9).
   */
  it('consumes every read the console makes', async () => {
    await withMock(async (origin) => {
      const a = api(origin)

      expect((await a.listProjects())[0]?.slug).toBe('mock-app')
      const project = await a.getProject(PROJECT_ID)
      // `?expand=environments` is D23.1's one expansion and the project screen depends on
      // it: §23's three hostnames are what a person came to see.
      expect(project.environments?.map((e) => e.kind)).toEqual([
        'sandbox',
        'staging',
        'production',
      ])
      expect((await a.checkSlug('mock-app')).available).toBe(false)
      expect((await a.checkSlug('free-name')).available).toBe(true)

      expect((await a.listBlueprints())[0]?.ref).toBe('node-ts-mongo@1')
      expect((await a.getBlueprint('node-ts-mongo@1')).starters[0]?.name).toBe(
        'proof-app',
      )
      expect((await a.getKnowledgePack('node-ts-mongo@1')).files[0]?.path).toBe(
        'AGENTS.md',
      )

      expect((await a.getSpec(PROJECT_ID)).commitSha).toHaveLength(40)
      expect((await a.listEnvironments(PROJECT_ID))[1]?.instance?.state).toBe('healthy')
      expect((await a.getEnvironment(STAGING_ID)).url).toBe(
        'https://mock-app.staging.manifest.internal',
      )
      expect((await a.listMembers(PROJECT_ID))[0]?.role).toBe('owner')

      expect((await a.listBuilds(PROJECT_ID))[0]?.status).toBe('succeeded')
      const build = await a.getBuild(BUILD_ID)
      expect(build.imageDigest).toMatch(/^sha256:/)
      // §12's scan is on the build and every release of it shows the same summary.
      expect(build.scan?.fixable).toEqual({ critical: 0, high: 0 })
      expect((await a.getBuildLog(BUILD_ID)).lines).toHaveLength(2)
      // `tail` is the LAST n lines, and it is optional.
      expect((await a.getBuildLog(BUILD_ID, 1)).lines[0]?.seq).toBe(2)

      expect((await a.listReleases(PROJECT_ID))[0]?.id).toBe(RELEASE_ID)
      // A RELEASE NAMES ITS ENV VARS AND NEVER THEIR VALUES (P5a Decision 22).
      expect((await a.getRelease(RELEASE_ID)).config.staging.envNames).toContain(
        'SESSION_SECRET',
      )
      expect((await a.listIncidents(STAGING_ID)).incidents[0]?.failedCheck).toContain(
        '/healthz',
      )

      const readiness = await a.getLaunchReadiness(PROJECT_ID)
      expect(readiness.ready).toBe(false)
      // Every item carries why it is in that state and which plan builds it (§13).
      expect(readiness.items.every((i) => i.why.length > 0)).toBe(true)
      // §13's DECISION, as the approval screen renders it (P6a Task 18): the digest it binds,
      // the diff it was made on — and the summary's SOURCE, because a null summary is a state
      // with three meanings and the screen writes a sentence for each rather than a blank.
      const approval = await a.getApproval(RELEASE_ID)
      expect(approval.imageDigest).toBe(approval.diff.imageDigest)
      expect(approval.diff.summary).toBeNull()
      expect(approval.diff.summarySource).toBe('unavailable')
      // R4(b): the verdict is shown even when nothing reviewed anything, in the PLATFORM's
      // words — `NullReviewer`'s reason, which the fixture now carries verbatim.
      expect(approval.diff.review.state).toBe('not_performed')
      expect(approval.diff.review.detail).toMatch(/^No code reviewer is configured\./)

      // THE PLATFORM'S SEVEN, IN ITS ORDER (P6a Task 17) — the launch panel attaches its
      // actions by these ids, so a fixture naming others would leave every action unrendered
      // while the list still looked complete. And ONE of them does not block (D33).
      expect(readiness.items.map((i) => i.id)).toEqual([
        'domain',
        'iam-registration',
        'privacy-assessment',
        'rehearsal',
        'scans',
        'admin-approval',
        'code-review',
      ])
      expect(readiness.items.filter((i) => !i.blocking).map((i) => i.id)).toEqual([
        'code-review',
      ])

      // §9's two records, as the records screen renders them: the state, the TICKET — the
      // point of the object (§15) — and the registered list.
      const records = await a.getLaunchRecords(PROJECT_ID)
      expect(records.iamRegistration?.state).toBe('active')
      expect(records.iamRegistration?.externalTicketRef).toBe('IAM-2026-0412')
      expect(records.privacyAssessment?.state).toBe('submitted')
      // …and what the release REQUESTS, which the screen shows BESIDE the registered list
      // and never pours into it. A SUBSET, as `iam-registration: met` requires — a fixture
      // where it was not would render a `met` item beside a list that contradicts it.
      const requested = (await a.getRelease(RELEASE_ID)).config.production.auth.attributes
      expect(
        requested.filter(
          (x) => !records.iamRegistration!.registeredAttributes.includes(x),
        ),
      ).toEqual([])

      expect((await a.listTokens(PROJECT_ID))[0]?.capabilities).toContain('build:create')
      const queue = await a.listPendingActions(PROJECT_ID)
      // All four states, because that is what a person answering the queue has to read —
      // and the lapsed one is still STORED `pending`, which Decision 8's screen renders as
      // expired from the timestamp without the sweeper having run.
      expect(queue.map((q) => q.state)).toEqual([
        'pending',
        'confirmed',
        'rejected',
        'pending',
      ])
      expect(new Date(queue[3]!.expiresAt).getTime()).toBeLessThan(Date.now())
      // The body is NEVER carried — only its hash (P5b Task 8).
      expect(queue[0]).not.toHaveProperty('body')
      // ONE row, re-read by id — the *Check* button's call. Asking for the pending id and
      // the confirmed id must give different answers, or the mock is ignoring the path
      // parameter, which is what it did until this assertion was written both ways.
      expect((await a.getPendingAction(PENDING_ACTION_ID)).state).toBe('pending')
      expect((await a.getPendingAction(CONFIRMED_ACTION_ID)).state).toBe('confirmed')
    })
  })

  it('consumes every mutation the console makes, with a key per action', async () => {
    await withMock(async (origin) => {
      const a = api(origin)
      const k = () => a.newKey()

      const project = await a.createProject(
        {
          slug: 'mock-app',
          blueprint: 'node-ts-mongo@1',
          starter: 'proof-app',
          audience: { scale: 'class', burst: 'synchronised' },
        },
        k(),
      )
      expect(project.spec.valid).toBe(true)
      expect((await a.validateSpec(PROJECT_ID, k())).sensitiveDiff.sensitive).toBe(false)

      // ANSWERS `202` WITH THE BUILD `running` (Rich's R6): the answer is not the outcome.
      expect((await a.startBuild(PROJECT_ID, {}, k())).status).toBe('running')
      expect(
        (await a.createRelease(PROJECT_ID, { buildId: BUILD_ID }, k())).imageDigest,
      ).toMatch(/^sha256:/)
      expect((await a.deploy(STAGING_ID, { releaseId: RELEASE_ID }, k())).state).toBe(
        'healthy',
      )

      expect(
        (await a.addMember(PROJECT_ID, { puid: 'stu000001', role: 'collaborator' }, k()))
          .role,
      ).toBe('collaborator')
      expect((await a.removeMember(PROJECT_ID, STUDENT_ID, k()))[0]?.role).toBe('owner')

      const minted = await a.mintToken(
        PROJECT_ID,
        { name: 'an agent', capabilities: ['project:read'], expiresInDays: 30 },
        k(),
      )
      // THE ONE ANSWER THAT CARRIES A CREDENTIAL, and the read schema has no `secret` at all.
      expect(minted.secret.startsWith('mft_')).toBe(true)
      expect(minted.token).not.toHaveProperty('secret')
      expect((await a.revokeToken(TOKEN_ID, k())).revokedAt).not.toBeNull()

      expect((await a.confirmPendingAction(PENDING_ACTION_ID, k())).state).toBe(
        'confirmed',
      )

      // §9's records, written by an administrator. The mock answers its fixture whatever
      // is sent (it keeps no state), so these prove the CALL — its path, its body and its
      // key — and the platform's tests prove what it does with them.
      expect(
        (
          await a.recordIamRegistration(
            PROJECT_ID,
            {
              state: 'active',
              externalTicketRef: 'IAM-2026-0412',
              entityId: 'https://manifest.internal/sp/mock-app/production',
              acsUrl: 'https://mock-app.manifest.internal/auth/callback',
              sloUrl: 'https://mock-app.manifest.internal/auth/logout',
              registeredAttributes: ['mail', 'ubcEduCwlPuid'],
            },
            k(),
          )
        ).state,
      ).toBe('active')
      expect(
        (
          await a.recordPrivacyAssessment(
            PROJECT_ID,
            { state: 'submitted', externalTicketRef: 'PIA-2026-0088' },
            k(),
          )
        ).state,
      ).toBe('submitted')

      // §13's approval: BOTH decisions answer `201` with the record, and a rejection carries
      // its reason. The mock answers one fixture for both (it keeps no state), so this proves
      // the calls — their paths, bodies and keys — and the platform's tests prove the rest.
      //
      // P6b Task 9: a PREVIEW first, re-read by its id, and both decisions NAME it — the
      // record's diff is the preview's (the mock shares one object, as the platform copies).
      // Naming NO preview is refused by code, the platform's runtime rule the mock plays.
      await expect(a.approveRelease(RELEASE_ID, {}, k())).rejects.toMatchObject({
        code: 'APPROVAL_PREVIEW_REQUIRED',
      })
      const preview = await a.createApprovalPreview(RELEASE_ID, k())
      expect(preview.releaseId).toBe(RELEASE_ID)
      expect(preview.diff.coverage).not.toBeNull()
      expect(await a.getApprovalPreview(RELEASE_ID, preview.id)).toEqual(preview)
      const approved = await a.approveRelease(RELEASE_ID, { previewId: preview.id }, k())
      expect(approved.decision).toBe('approved')
      expect(approved.previewId).toBe(preview.id)
      expect(approved.diff).toEqual(preview.diff)
      expect(approved.decidedByName.length).toBeGreaterThan(0)
      expect(
        (
          await a.rejectRelease(
            RELEASE_ID,
            { reason: 'the PIA does not cover it', previewId: preview.id },
            k(),
          )
        ).releaseId,
      ).toBe(RELEASE_ID)

      // D21's rehearsal. THE ANSWER IS A MEASUREMENT, and these are the three fields the
      // launch panel renders instead of a tick: the listener, what the sign-in answered, and
      // what the assertion actually released beside what the registration listed.
      const rehearsal = await a.runRehearsal(PROJECT_ID, k())
      expect(rehearsal.passed).toBe(true)
      expect(rehearsal.evidence.listener).toBe('public')
      expect(rehearsal.evidence.signInStatus).toBe(200)
      expect(rehearsal.evidence.attributesReleased).toEqual(rehearsal.attributes)
      const rejected = await a.rejectPendingAction(
        PENDING_ACTION_ID,
        { reason: 'not on this course' },
        k(),
      )
      expect(rejected.reason).not.toBeNull()
    })
  })

  /**
   * D23.6, BOTH DIRECTIONS. The key is made once per user ACTION and reused on a retry of
   * that action — so replaying it must answer the FIRST response rather than acting twice,
   * and reusing it for a different body must be refused.
   *
   * THE MISSING-KEY CASE CANNOT BE WRITTEN THROUGH `createApi`: the document makes
   * `Idempotency-Key` a required header parameter, so the generated types refuse the call
   * at compile time. That is the control working, one layer earlier than this test — the
   * raw `fetch` below is the only way to reach the refusal, and it asserts the CODE.
   */
  it('replays a repeated key and refuses one reused with a different body', async () => {
    await withMock(async (origin) => {
      const a = api(origin)
      const key = a.newKey()
      const first = await a.startBuild(PROJECT_ID, {}, key)
      const replay = await a.startBuild(PROJECT_ID, {}, key)
      expect(replay).toEqual(first)

      await expect(
        a.startBuild(PROJECT_ID, { commitSha: 'a'.repeat(40) }, key),
      ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
    })
  })

  it('refuses a mutation with no Idempotency-Key — 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
    await withMock(async (origin) => {
      const response = await fetch(`${origin}/v1/projects/${PROJECT_ID}/builds`, {
        method: 'POST',
        headers: {
          cookie: 'manifest_session=mock-session',
          'content-type': 'application/json',
        },
        body: '{}',
      })
      expect(response.status).toBe(400)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        'IDEMPOTENCY_KEY_REQUIRED',
      )
    })
  })

  /**
   * A REFUSAL REACHES THE CONSOLE AS A `ManifestApiError` CARRYING D23.7'S ENVELOPE, which
   * is what `<Refusal>` renders. Asserted by CODE, because `403` is reachable here for more
   * than one reason and a status-only assertion passes for the wrong one.
   */
  it('turns a refusal into a ManifestApiError the refusal surface can render', async () => {
    await withMock(async (origin) => {
      await expect(api(origin).listFleet()).rejects.toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        operation: 'listFleet',
      })
    })
    // The positive half, on an admin mock: a client that could never read the fleet would
    // satisfy the refusal above without proving anything.
    await withMock(
      async (origin) => {
        expect((await api(origin).listFleet())[0]?.slug).toBe('mock-app')
      },
      { role: 'admin' },
    )
  })

  /**
   * THE STREAM, WHICH IS THE HALF OPENAPI CANNOT DESCRIBE. `stream.ts`'s `useProjectStream`
   * is a React hook and cannot run here, but the thing it calls can — and the two properties
   * a client most easily gets wrong are both asserted:
   *
   *  - `ready` resolves on the CONTROL frame and on nothing else, after the replay;
   *  - the replay carries the three creation events and **no `LogFrame`**, because log
   *    frames are never replayed (P5c sitting 5, F1). A mock that replayed them would teach
   *    a client to drop its `getBuildLog` read.
   */
  it('subscribes, is replayed, and is told when the replay ends', async () => {
    await withMock(async (origin) => {
      const frames: StreamFrame[] = []
      const sub = subscribe({
        origin,
        session: 'mock-session',
        projectId: PROJECT_ID,
        onFrame: (frame) => frames.push(frame),
      })
      await sub.ready
      // Everything up to and including the control frame is the replay.
      expect(frames.map((f) => f.kind)).toEqual(['event', 'event', 'event', 'control'])
      expect(frames.filter((f) => f.kind === 'log')).toEqual([])
      expect(frames.slice(0, 3).map((f) => (f as { type: string }).type)).toEqual([
        'project.created',
        'repository.seeded',
        'spec.validated',
      ])

      // …and then it is live. The scripted build starts a second in.
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      expect(frames.some((f) => (f as { type?: string }).type === 'build.started')).toBe(
        true,
      )
      sub.close()
      await sub.closed
    })
  })

  it('refuses an upgrade that carries no credential', async () => {
    await withMock(async (origin) => {
      // NO `session` KEY AT ALL, not `session: undefined`: `exactOptionalPropertyTypes`
      // makes those two different types, and the second is a compile error.
      const sub = subscribe({
        origin,
        projectId: PROJECT_ID,
        onFrame: () => undefined,
      })
      // A refused upgrade reaches a WebSocket client as a close, never as a status.
      await expect(sub.ready).rejects.toThrow(/closed before it was ready/)
    })
  })
})
