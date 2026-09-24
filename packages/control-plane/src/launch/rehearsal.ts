import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { Config } from '../config.js'
import { environments, events, projects, rehearsals, type Db } from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import { listenerFor } from '../routing/index.js'
import { deployRelease, type DeployDeps } from '../releases/index.js'
import type { Driver } from '../runtime/index.js'
import type { CwlSignInProbe } from '../sso/index.js'
import { candidateFor } from './candidate.js'
import type { LaunchItem } from './readiness.js'

export type RehearsalRow = typeof rehearsals.$inferSelect

export class RehearsalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RehearsalError'
  }
}

/**
 * What a rehearsal needs that is neither the database nor the driver — the same threading
 * `deployRelease` uses, for the same reason: `launch/` holds no key material and opens no
 * connection of its own.
 */
export interface RehearsalDeps {
  db: Db
  driver: Driver
  config: Config
  /** Everything `deployRelease` needs; `api/routes/launch.ts` builds it and `tsc` holds the two together. */
  deploy: DeployDeps
  /** R2's measurement: a REAL CWL sign-in, run from a container (`sso/sign-in.ts`). */
  signIn: CwlSignInProbe
  bus: EventBus
}

/**
 * D21'S PRE-PRODUCTION REHEARSAL, AS R2 REDEFINES IT (P6a Task 14), in five steps, each of
 * which can fail and each of which is recorded.
 *
 * 1. **Deploy the candidate digest into PRODUCTION, behind the gate.** Not a copy and not
 *    a simulation: §13 says production runs the exact digest staging ran, and a rehearsal
 *    against anything else rehearses something else. It calls `deployRelease` directly —
 *    the INTERNAL function, not the route — because the route's gate is what this item
 *    exists to help satisfy, and a rehearsal that needed the gate open would be circular.
 *    It passes `purpose: 'rehearsal'` for the same reason one step further in: §13 binds a
 *    LAUNCH to an approved digest, and this deploy is what the administrator reads before
 *    they approve (Task 15, and the sittings table's own ordering).
 * 2. **Its SP is registered with production-shaped values** — which `deployRelease` already
 *    does, deriving `https://<base>/sp/<slug>/production` and the public hostname from
 *    `environmentKind` (§9, D15). Read back off the `sso.registered` event the registration
 *    itself wrote, never recomputed here: a rehearsal that rebuilt the values would agree
 *    with itself and prove nothing about the row the IdP actually holds.
 * 3. **One real CWL sign-in**, through the three hops a browser makes, ending at the ACS
 *    the registration names, on the PUBLIC listener.
 * 4. **The attributes the assertion actually released are read**, out of the assertion, and
 *    compared with what was registered — §9's `core:AttributeLimit` enforcement measured
 *    rather than assumed, which is what S2 paid for.
 * 5. **Pass or fail is recorded with the evidence.**
 *
 * **WHAT IT PROVES AND WHAT IT DOES NOT.** It proves the SHAPE of the registration — the
 * entityID, the ACS URL, the attribute release and the certificate all working together.
 * It proves nothing about UBC's acceptance of it: the Manifest IdP is not real Shibboleth
 * (D6), and D21's run against `authentication.stg.id.ubc.ca` remains an external-track
 * obligation (§9). The checklist item below says so in those words, and has a test.
 */
export async function runRehearsal(
  deps: RehearsalDeps,
  projectId: string,
  actor: { userId: string; puid: string },
): Promise<RehearsalRow> {
  const [project] = await deps.db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
  /**
   * **A PROGRAMMING FAULT, NOT A WIRE REFUSAL** (and the registry test is what says so):
   * the route calls `assertCapability` before this, which answers `404` for a project that
   * does not exist or that the actor may not see, so neither of these can be reached
   * through the API. Throwing a coded `RehearsalError` here would register a wire code no
   * client can ever receive — `error-codes.test.ts` refuses exactly that. A plain `Error`
   * is an `INTERNAL`, which is what "this project has no production environment" is.
   */
  if (project === undefined) throw new Error(`no project '${projectId}'`)
  /**
   * **A LAUNCHED APP IS NOT REHEARSED** (P6b Task 4, Decision 16). Before a launch nothing is
   * public, which is why the rehearsal may deploy an unapproved candidate into production.
   * After one, the same deploy puts that candidate in front of real students with no
   * approval record — `[M7]` measured it, and `make demo-production`'s re-use path did it
   * for about a second on every run. Refused BEFORE the candidate is looked for, so the
   * answer is the launch whatever else is true. `deployRelease` refuses the exemption as
   * well — the second read of one condition, which is what a guard is.
   */
  if (project.launchedAt !== null)
    throw new RehearsalError(
      'REHEARSAL_LAUNCHED',
      `'${project.slug}' has launched: a rehearsal deploys into production, so it would put ` +
        'this candidate in front of real students with no approval. A change to its ' +
        'registration is proved by UBC IAM’s change request (§9).',
    )
  const [production] = await deps.db
    .select()
    .from(environments)
    .where(eq(environments.projectId, projectId))
    .then((rows) => rows.filter((e) => e.kind === 'production'))
  if (production === undefined)
    throw new Error(`project '${projectId}' has no production environment`)

  const candidate = await candidateFor(deps.db, projectId)
  if (candidate === undefined)
    throw new RehearsalError(
      'REHEARSAL_NO_CANDIDATE',
      'nothing is serving in staging, so there is no candidate release to rehearse. ' +
        'Production runs exactly what staging ran (§13).',
    )
  /**
   * `[M9]`'s finding as a code: an app with `auth.provider: none` registers no Service
   * Provider at all, so there is nothing to rehearse. **The ITEM says so and is `met`** —
   * a route that refused would be fine, a CHECKLIST that refused would make a non-CWL app
   * unlaunchable, which is R4(c)'s trap in a different costume.
   */
  if (candidate.auth.provider !== 'cwl')
    throw new RehearsalError(
      'REHEARSAL_NOT_CWL',
      `'${project.slug}' signs nobody in with CWL, so it registers no Service Provider ` +
        'and there is nothing to rehearse. Its launch checklist says so.',
    )

  // BEFORE THE DEPLOY, so the registration read below cannot pick up an OLDER one. See
  // `latestRegistration`, and P6a sitting 9's control (c), which is what found it.
  //
  // **READ OFF THE DATABASE'S CLOCK, NOT THE HOST'S** (P6b sitting 6): it bounds
  // `events.created_at`, which is Postgres's `clock_timestamp()` inside Docker Desktop's VM.
  // Measured: with `new Date()` here, a host clock ahead of the VM's hid the rehearsal's own
  // registration and answered "recorded no Service Provider registration" — eight times in
  // one `pnpm test` run and never in the next. One clock on both sides of a comparison.
  const startedAt = await databaseNow(deps.db)
  const instance = await deployRelease(deps.db, deps.driver, deps.config, deps.deploy, {
    releaseId: candidate.release.id,
    environmentId: production.id,
    purpose: 'rehearsal',
  }).catch((cause: unknown) => {
    throw new RehearsalError(
      'REHEARSAL_DEPLOY_FAILED',
      `the candidate release could not be deployed to production: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
  })

  /**
   * **THE EVIDENCE DESCRIBES WHAT HAPPENED, NOT WHAT WAS INTENDED** (P6a sitting 9's
   * control (c), which did NOT fire until this changed). Both values used to be read off
   * the production environment row two statements up — so a rehearsal that deployed
   * somewhere else would still have recorded *"production, public listener"*, and the
   * Docker test asserting exactly that would have stayed green. They are now read back off
   * the environment the INSTANCE says it is in, which is the only thing that knows.
   */
  const [deployed] = await deps.db
    .select()
    .from(environments)
    .where(eq(environments.id, instance.environmentId))
  const listener = listenerFor(deployed!.kind)
  const hostname = deployed!.hostname

  const registration = await latestRegistration(
    deps.db,
    projectId,
    `sp:${project.slug}:${deployed!.kind}`,
    startedAt,
  )
  if (registration === undefined)
    throw new RehearsalError(
      'REHEARSAL_DEPLOY_FAILED',
      'the deploy recorded no Service Provider registration, so there is nothing to ' +
        'rehearse against',
    )
  /**
   * A sign-in is only worth attempting against an instance that is actually serving. A
   * failed deploy is a `200` whose state is `failed` (P4c), and the previous instance —
   * if any — keeps serving, so the probe would measure something other than this release.
   */
  const signIn =
    instance.state === 'healthy'
      ? await deps.signIn.signIn({
          hostname,
          acsUrl: registration.acsUrl,
          ...(listener === 'public' ? { port: deps.config.edgePublicPort } : {}),
        })
      : {
          status: null,
          attributesReleased: [],
          reason: `the candidate release did not become healthy in ${deployed!.kind}: the instance is '${instance.state}'`,
        }

  const verdict = judge(signIn, registration.attributes)
  const [row] = await deps.db
    .insert(rehearsals)
    .values({
      projectId,
      releaseId: candidate.release.id,
      passed: verdict.passed,
      entityId: registration.entityId,
      acsUrl: registration.acsUrl,
      attributes: registration.attributes,
      evidence: {
        instanceId: instance.id,
        hostname,
        listener,
        signInStatus: signIn.status,
        attributesReleased: signIn.attributesReleased,
        reason: verdict.reason,
      },
      ranBy: actor.userId,
    })
    .returning()

  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId,
      subject: `rehearsal:${project.slug}:production`,
      type: 'rehearsal.completed',
      // THE COUNT, never the names and never the assertion (§14). The names are on the
      // row, which is read by somebody who may already read the project.
      machineDetail: {
        rehearsalId: row!.id,
        releaseId: candidate.release.id,
        passed: verdict.passed,
        attributeCount: signIn.attributesReleased.length,
      },
      humanMessage: verdict.passed
        ? `${actor.puid} ran the pre-production rehearsal and it passed.`
        : `${actor.puid} ran the pre-production rehearsal and it did not pass: ${verdict.reason}`,
    },
    makeRedactor([]),
  )
  return row!
}

/**
 * WHAT THE REGISTRATION ACTUALLY SAYS, read off the append-only Event the registration
 * itself wrote (§9: *"Every registration and change is an append-only audit Event"*).
 *
 * Not `deriveSpEntity` called a second time: the question a rehearsal answers is whether
 * the row the IdP holds works, and a value recomputed here would match whatever the
 * recomputation produced rather than whatever was written.
 */
/** Postgres's `clock_timestamp()` — the clock `events.created_at` is written with. */
async function databaseNow(db: Db): Promise<Date> {
  const result = await db.execute<{ now: Date | string }>(
    sql`select clock_timestamp() as now`,
  )
  const now = result.rows[0]?.now
  if (now === undefined) throw new Error('select clock_timestamp() answered no row')
  return now instanceof Date ? now : new Date(now)
}

async function latestRegistration(
  db: Db,
  projectId: string,
  subject: string,
  /**
   * **NOT OLDER THAN THIS DEPLOY.** The registrar publishes on EVERY deploy, changed or
   * not, so the event this rehearsal's own deploy wrote is newer than any before it —
   * and without this bound a rehearsal whose deploy registered nothing would read a
   * registration from last week and rehearse against it. Found by control (c), which
   * passed against exactly that (P6a sitting 9).
   */
  notBefore: Date,
): Promise<{ entityId: string; acsUrl: string; attributes: string[] } | undefined> {
  const [row] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.projectId, projectId),
        eq(events.subject, subject),
        eq(events.type, 'sso.registered'),
        gte(events.createdAt, notBefore),
      ),
    )
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(1)
  if (row === undefined) return undefined
  const detail = row.machineDetail as {
    entityId?: string
    acsUrl?: string
    attributes?: string[]
  }
  if (
    typeof detail.entityId !== 'string' ||
    typeof detail.acsUrl !== 'string' ||
    !Array.isArray(detail.attributes)
  )
    return undefined
  return {
    entityId: detail.entityId,
    acsUrl: detail.acsUrl,
    attributes: detail.attributes,
  }
}

/**
 * DID THE REHEARSAL PASS? Three questions, and each of them is a launch-day failure this
 * project can name.
 *
 * 1. **Did the sign-in complete at all?** `302` is the blueprint's own redirect after its
 *    callback and `200` is an app that renders in place; anything else means the app did
 *    not accept the assertion the IdP produced for it.
 * 2. **Did the IdP release anything?** An assertion with no attributes reaches an app that
 *    cannot key the person who signed in.
 * 3. **Did it release only what was registered?** §9's `core:AttributeLimit` is the control
 *    that makes an SP registration meaningful, and S2 measured that an EMPTY list releases
 *    everything — so a released attribute outside the registered set is the fail-open state
 *    itself, seen rather than assumed.
 *
 * `ubcEduCwlPuid` gets its own sentence because it is the only identifier UBC guarantees
 * (§9) and the blueprint's own bridge throws without it: a registration that lists it and
 * an assertion that does not carry it is an app whose every sign-in fails on launch day.
 */
function judge(
  signIn: { status: number | null; attributesReleased: string[]; reason: string },
  registered: string[],
): { passed: boolean; reason: string } {
  if (signIn.status !== 200 && signIn.status !== 302)
    return { passed: false, reason: signIn.reason }
  if (signIn.attributesReleased.length === 0)
    return {
      passed: false,
      reason:
        'the sign-in completed and the IdP released no attributes at all, so the app ' +
        'cannot identify anyone who signs in (§9)',
    }
  const extra = signIn.attributesReleased.filter((name) => !registered.includes(name))
  if (extra.length > 0)
    return {
      passed: false,
      reason: `the IdP released attribute(s) the registration does not list: ${extra.join(', ')}. §9 enforces release at the IdP, so this is the fail-open state an empty attribute list produces.`,
    }
  if (
    registered.includes('ubcEduCwlPuid') &&
    !signIn.attributesReleased.includes('ubcEduCwlPuid')
  )
    return {
      passed: false,
      reason:
        'the registration lists ubcEduCwlPuid and the assertion did not carry it — it is ' +
        'the only identifier UBC guarantees (§9), and an app that does not receive it ' +
        'cannot key anybody',
    }
  return { passed: true, reason: signIn.reason }
}

/**
 * DOES THIS REHEARSAL STILL CERTIFY WHAT WOULD BE REGISTERED NOW? (Decision 10.)
 *
 * Compared against what the CANDIDATE RELEASE would register — never against the stored
 * `IamRegistration`, which is what UBC accepted and is a different question (§13's
 * `iam-registration` item asks that one). Attributes are compared as a SORTED SET, because
 * reordering a list is not a change of intent (`spec/diff.ts` makes the same rule twice).
 *
 * **IT COMPARES THE TWO VALUES A RELEASE CAN CHANGE, AND NOT THE entityID.** The entityID
 * is `<MANIFEST_SP_ENTITY_BASE>/sp/<slug>/production` — a platform setting and two values
 * fixed for the life of the project — so a release cannot move it, and changing the
 * setting invalidates every registration on the platform rather than one rehearsal. The
 * run itself binds it: `runRehearsal` stores the entityID the registration actually wrote.
 */
export function rehearsalCovers(
  row: Pick<RehearsalRow, 'acsUrl' | 'attributes'>,
  would: { acsUrl: string; attributes: readonly string[] },
): boolean {
  return (
    row.acsUrl === would.acsUrl &&
    sortedSet(row.attributes) === sortedSet([...would.attributes])
  )
}

const sortedSet = (values: string[]): string => [...new Set(values)].sort().join('\u0000')

/** The newest rehearsal of this project, or `undefined` when nobody has run one. */
export async function latestRehearsalFor(
  db: Db,
  projectId: string,
): Promise<RehearsalRow | undefined> {
  const [row] = await db
    .select()
    .from(rehearsals)
    .where(eq(rehearsals.projectId, projectId))
    .orderBy(desc(rehearsals.ranAt), desc(rehearsals.id))
    .limit(1)
  return row
}

/**
 * §13's THIRD BLOCKING ITEM, met by a MEASUREMENT (R2) — the row `runRehearsal` wrote,
 * never a checkbox somebody ticked.
 *
 * **`ready` IS `readyOf(items)` AND THIS FUNCTION DOES NOT COMPUTE ONE** (Task 12's
 * Decision 6): an item says what is true of itself, and one place says what that means
 * for a launch.
 */
export async function rehearsalItem(
  db: Db,
  projectId: string,
  candidate:
    | {
        hostname: string
        auth: { provider: 'cwl' | 'none'; attributes: string[]; callback: string }
      }
    | undefined,
): Promise<LaunchItem> {
  const base = {
    id: 'rehearsal' as const,
    title: 'Pre-production rehearsal passed',
    owner: 'Manifest',
    blocking: true,
  }
  if (candidate === undefined)
    return {
      ...base,
      state: 'unmet',
      why: 'Nothing is serving in staging yet, so there is no candidate release to rehearse. Production runs exactly what staging ran (§13).',
    }
  if (candidate.auth.provider !== 'cwl')
    return {
      ...base,
      state: 'met',
      why: 'This app signs nobody in, so it registers no Service Provider and there is no registration to rehearse (D21).',
    }
  const row = await latestRehearsalFor(db, projectId)
  if (row === undefined)
    return {
      ...base,
      state: 'unmet',
      why: 'D21: before an app is public, Manifest deploys the candidate release to its production hostname, registers its Service Provider with production values and completes one CWL sign-in. Nobody has run it for this project yet.',
    }
  if (!row.passed)
    return {
      ...base,
      state: 'unmet',
      why: `The rehearsal did not pass: ${row.evidence.reason}`,
    }
  const would = {
    acsUrl: `https://${candidate.hostname}${candidate.auth.callback}`,
    attributes: candidate.auth.attributes,
  }
  if (!rehearsalCovers(row, would))
    // DECISION 10, IN WORDS. A rehearsal passed in week one must not certify a
    // registration that changed in week six — and this reads as a bug the first time
    // somebody meets it, so the checklist says which half moved.
    return {
      ...base,
      state: 'unmet',
      why: `The rehearsal passed on ${row.ranAt.toISOString().slice(0, 10)}, against a registration this release would no longer produce — it was run for ACS ${row.acsUrl} releasing ${[...row.attributes].sort().join(', ')}, and the release serving staging asks for ACS ${would.acsUrl} releasing ${[...would.attributes].sort().join(', ')}. Run it again.`,
    }
  return {
    ...base,
    state: 'met',
    why: `A production-shaped rehearsal passed on ${row.ranAt.toISOString().slice(0, 10)}: the app was deployed to its production hostname on the ${row.evidence.listener} listener, its Service Provider was registered with production values, and one CWL sign-in completed releasing ${row.evidence.attributesReleased.length} attribute(s). This proves the SHAPE of the registration — the entityID, the ACS URL, the attribute release and the certificate all work together. It proves nothing about UBC's acceptance of it: the Manifest IdP is not real Shibboleth (D6), and the run against UBC's staging IdP that D21 describes remains an external-track obligation (§9).`,
  }
}
