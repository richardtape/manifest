import { and, eq, gte, ne, sql } from 'drizzle-orm'
import {
  deleteAppUsers,
  endSessionsOf,
  type AiKeyService,
  type EndedBy,
  type LiteLlmClient,
} from '../ai/index.js'
import {
  environments,
  events,
  instances,
  projects,
  releases,
  routes,
  withEnvironmentLock,
  withProjectLock,
  type Db,
} from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import {
  personName,
  ProjectStateError,
  repositoryOf,
  type SessionActor,
} from '../projects/index.js'
import { canTransition, nextState, serviceName, type Driver } from '../runtime/index.js'
import { deleteSecretsOf, type AppSecretResolver } from '../secrets/index.js'
import type { SourceDriver } from '../source/index.js'
import type { SsoDeregistrar } from '../sso/index.js'
import { EVERY_QUESTION, expirePendingActions, revokeTokensOf } from '../tokens/index.js'
import type { ResolvedConfigSet } from './release.js'
import { retireInstanceRow } from './retire.js'

/**
 * §11's *Ending an app* — archive and restore (Spec action 3, applied 2026-09-27; the front-end
 * enablement plan's Task 11, Decisions 27–30). Task 12's delete builds on every export here.
 *
 * Beside `retire.ts`, which already reaches `runtime/`, `ai/` and the audit trail through their
 * `index.ts`: an archive is a retire of every instance, plus the things a retire never touches.
 */
export interface LifecycleDeps {
  db: Db
  bus: EventBus
  driver: Driver
  /** Ends agent sessions (`endSessionsOf`); `undefined` with AI switched off. */
  llm: LiteLlmClient | undefined
  sso: SsoDeregistrar
  /** Revokes a retired instance's app key, and the environment's pre-P4c one. */
  ai: AiKeyService
  appSecrets: AppSecretResolver
  /** §11's drain bound, as every retire has it. */
  drainMs: number
}

/**
 * DECISION 28'S STEPS, AS DATA, IN ORDER. Each is idempotent by construction — an ended session, a
 * revoked token, an expired question, a replaced route, a gone instance, a missing container, a
 * missing SP row each answer at once — so a retry, or the next boot, runs them all again from the
 * first and the finished ones cost a read.
 *
 * **THE ONE STEP THAT NEEDS THE MODEL GATEWAY RUNS LAST** (the whole-branch review's I1, sitting 8):
 * Decision 28 listed it first, and a run stops at its first failure — so with LiteLLM down and one
 * live agent session, an "archived" app kept serving its students and its tokens stayed live. No step
 * depends on the sessions being ended, and an agent key is a gateway credential, not a way into the
 * app; so everything a student or a token meets is taken down first, and a gateway outage leaves
 * only the sessions for the retry, or the boot, to end.
 */
export const TEARDOWN_STEPS = [
  // Every token of the project, `revoked_at` now — also inside the archive's state change, so a
  // project is never archived with a live token (`archiveProject`). `tokenActor` refuses them anyway.
  'revoke-tokens',
  // Every pending question of the project, whatever its expiry: nobody can answer one now.
  'expire-pending-actions',
  // Each name to the switched-off page, and the record of what serves emptied.
  'switch-off-names',
  // Every instance not `gone`: RETIRED — drained, removed, its key revoked — never destroyed.
  'retire-instances',
  // Each environment's services (KEEPING their data), egress proxy and network.
  'stop-environments',
  // Sandbox's and staging's registrations with the Manifest IdP (§11, as Spec action 6 wrote it).
  'deregister-sps',
  // Keys revoked by alias at the gateway BEFORE their rows are stamped (`endSessionsOf`). LAST.
  'end-agent-sessions',
] as const

export type TeardownStep = (typeof TEARDOWN_STEPS)[number]

type EnvironmentRow = typeof environments.$inferSelect

interface Teardown {
  deps: LifecycleDeps
  projectId: string
  slug: string
  environments: EnvironmentRow[]
  by: EndedBy
  deleteData: boolean
}

const STEP: Record<TeardownStep, (t: Teardown) => Promise<unknown>> = {
  'end-agent-sessions': (t) =>
    endSessionsOf(t.deps, { projectId: t.projectId }, 'project_archived', t.by),

  'revoke-tokens': (t) => revokeTokensOf(t.deps.db, t.projectId),

  'expire-pending-actions': (t) =>
    expirePendingActions(t.deps.db, EVERY_QUESTION, { projectId: t.projectId }),

  /**
   * THE NAME FIRST, then what served it: once the name answers the page, no route dials the old
   * instance, so the retire below is not refused `INSTANCE_SERVING` — and a student never meets
   * the wildcard, another app or a half-stopped one in between (Decision 29). The Route record goes
   * with it: nothing serves the name now, and boot must not route it back to a retired instance.
   * Under the ENVIRONMENT's lock, which a deploy holds — so a deploy that began first finishes
   * first, and its instance is retired below.
   */
  'switch-off-names': async (t) => {
    for (const environment of t.environments) {
      await withEnvironmentLock(environment.id, async () => {
        await t.deps.driver.switchOff(environment.hostname, environment.kind)
        await t.deps.db.delete(routes).where(eq(routes.hostname, environment.hostname))
      })
    }
  },

  /**
   * RETIRE, NEVER `destroyInstance`: the Docker driver's `destroyInstance` removes the hostname's
   * route, which here is the switched-off page, and the name would fall through to the wildcard.
   * `retireInstance` never changes what a name reaches. Every row not `gone` is marked `destroying`
   * under the lock, as `retireEnvironment` marks its own, then retired by `retireInstanceRow` — which
   * takes no lock itself, so calling it from inside this one cannot wait on itself. A container the
   * driver holds for the name with no row (a crashed boot's, a truncated database's) goes too.
   */
  'retire-instances': async (t) => {
    for (const environment of t.environments) {
      await withEnvironmentLock(environment.id, async () => {
        const rows = await t.deps.db
          .select()
          .from(instances)
          .where(
            and(eq(instances.environmentId, environment.id), ne(instances.state, 'gone')),
          )
        const redact = makeRedactor(
          await t.deps.appSecrets.secretValues(t.deps.db, {
            projectId: t.projectId,
            environmentKind: environment.kind,
          }),
        )
        for (const row of rows) {
          if (row.state !== 'destroying') {
            if (!canTransition(row.state, 'destroy_requested')) continue
            await t.deps.db
              .update(instances)
              .set({ state: nextState(row.state, 'destroy_requested') })
              .where(eq(instances.id, row.id))
          }
          if (row.handle === null) {
            // The driver never recorded it (a deploy interrupted before its handle was written):
            // nothing to drain through a handle — a container it did start is swept below, by the
            // driver's own list — so the row goes straight to where the retire would have left it.
            // BUT ITS MODEL KEY FIRST (the whole-branch review's I2): a deploy stores the instance's
            // key BEFORE its container is ready, and nothing else would ever revoke it once the row
            // is `gone`. Idempotent — `false` for an instance that never had one.
            if (t.deps.ai.enabled) {
              await t.deps.ai.revokeInstanceKey(t.deps.db, {
                projectId: t.projectId,
                kind: environment.kind,
                instanceId: row.id,
              })
            }
            await t.deps.db
              .update(instances)
              .set({ state: nextState('destroying', 'destroyed') })
              .where(eq(instances.id, row.id))
            continue
          }
          await retireInstanceRow(t.deps, {
            environment,
            handle: row.handle,
            row,
            marked: true,
            redact,
          })
        }
        const known = new Set(rows.map((row) => row.handle))
        for (const handle of await t.deps.driver.listInstances(environment.hostname)) {
          if (known.has(handle)) continue
          await retireInstanceRow(t.deps, {
            environment,
            handle,
            row: undefined,
            marked: false,
            redact,
          })
        }
        // P4b's environment-level key (§10: "revoked on archive"): nobody's once every instance is.
        if (t.deps.ai.enabled) {
          await t.deps.ai.revokeLegacyAppKey(t.deps.db, {
            projectId: t.projectId,
            kind: environment.kind,
          })
        }
      })
    }
  },

  /**
   * THE SERVICES BY NAME, from the releases the environment ran (`instances ⋈ releases`) through
   * `serviceName` — the one derivation `deployRelease` uses — never by a prefix, which could reach
   * another project whose slug extends this one's with a `-`.
   */
  'stop-environments': async (t) => {
    for (const environment of t.environments) {
      const ran = await t.deps.db
        .selectDistinct({ resolvedConfig: releases.resolvedConfig })
        .from(instances)
        .innerJoin(releases, eq(releases.id, instances.releaseId))
        .where(eq(instances.environmentId, environment.id))
      const services = new Set<string>()
      for (const { resolvedConfig } of ran) {
        const declared =
          (resolvedConfig as Partial<ResolvedConfigSet>)[environment.kind]?.services ?? []
        for (const service of declared)
          services.add(serviceName(t.slug, environment.kind, service.name))
      }
      await withEnvironmentLock(environment.id, () =>
        t.deps.driver.destroyEnvironment(
          { slug: t.slug, kind: environment.kind, services: [...services].sort() },
          { deleteData: t.deleteData },
        ),
      )
    }
  },

  'deregister-sps': async (t) => {
    for (const environmentKind of ['sandbox', 'staging'] as const) {
      await t.deps.sso.deregisterServiceProvider(t.deps.db, {
        projectId: t.projectId,
        slug: t.slug,
        environmentKind,
      })
    }
  },
}

/**
 * Runs the teardown's steps in order — all of them, or the prefix `steps` names (a test's seam for
 * an archive interrupted part-way). A step that throws stops the run with `500
 * PROJECT_TEARDOWN_INCOMPLETE` naming the step, and one operator line naming the step and the
 * error's CODE — never its message, which could carry a path or a key. The project stays archived,
 * so the same request retried, or the next boot, runs the steps again from the first.
 */
export async function runTeardown(
  deps: LifecycleDeps,
  target: { projectId: string; by: EndedBy },
  options: { deleteData: boolean; steps?: readonly TeardownStep[] },
): Promise<void> {
  const [project] = await deps.db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, target.projectId))
  if (project === undefined) throw new Error(`no project '${target.projectId}'`)
  const teardown: Teardown = {
    deps,
    projectId: target.projectId,
    slug: project.slug,
    environments: await deps.db
      .select()
      .from(environments)
      .where(eq(environments.projectId, target.projectId))
      .orderBy(environments.kind),
    by: target.by,
    deleteData: options.deleteData,
  }
  for (const step of options.steps ?? TEARDOWN_STEPS) {
    try {
      await STEP[step](teardown)
    } catch (error) {
      throw stoppedAt(
        project.slug,
        step,
        error,
        options.deleteData
          ? { doing: 'deleting', then: 'retrying the same request finishes it' }
          : {
              doing: 'switching off',
              then: "retrying the same request finishes it, and so does the control plane's next boot",
            },
      )
    }
  }
}

/**
 * A step that threw: ONE operator line naming the step and the error's CODE — never its message,
 * which could carry a path or a key — and `500 PROJECT_TEARDOWN_INCOMPLETE` naming the step. The
 * project stays archived either way, so nothing new starts on a half-finished one.
 */
function stoppedAt(
  slug: string,
  step: string,
  error: unknown,
  words: { doing: string; then: string },
): ProjectStateError {
  console.error(
    `[lifecycle] ${words.doing} ${slug} stopped at ${step}: ${
      (error as { code?: string }).code ?? (error as Error).name
    } — ${words.then}, continuing from the first step`,
  )
  return new ProjectStateError(
    'PROJECT_TEARDOWN_INCOMPLETE',
    `${words.doing} '${slug}' stopped at '${step}'. The project is archived; ${words.then}`,
  )
}

/**
 * `project.archived`, ONCE PER ARCHIVE: published when every step has run, by whichever run got
 * there — the request, its retry or the boot — and never twice, because a retry of a finished
 * archive runs every step again. "Once" is read from the trail itself: an event of this type
 * recorded since the project's `archived_at`, both stamped by the database's own clock.
 */
async function publishArchivedOnce(
  deps: LifecycleDeps,
  projectId: string,
  by: EndedBy,
  purpose: 'archive' | 'delete' = 'archive',
): Promise<void> {
  const [project] = await deps.db
    .select({ slug: projects.slug, archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
  if (project?.archivedAt === null || project?.archivedAt === undefined) return
  const [published] = await deps.db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.projectId, projectId),
        eq(events.type, 'project.archived'),
        gte(events.createdAt, project.archivedAt),
      ),
    )
    .limit(1)
  if (published !== undefined) return
  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId,
      subject: `project:${projectId}`,
      type: 'project.archived',
      machineDetail: { via: 'session', userId: by.userId, tokenId: by.tokenId },
      humanMessage:
        purpose === 'delete'
          ? `${await personName(deps.db, by.userId)} switched ${project.slug} off, to delete it.`
          : `${await personName(deps.db, by.userId)} switched ${project.slug} off. Each of its names now answers a page saying so; its code, data and secrets are kept, and it can be restored.`,
    },
    makeRedactor([]),
  )
}

/**
 * §11's ARCHIVE: the state to `archived` FIRST — from that line `assertCapability` refuses every
 * change (Decision 27), and a deploy that authorized before it is refused under its environment's
 * lock — then every step of the teardown, then `project.archived`. Under the project's lock, so two
 * archives, or an archive and a restore, never interleave. A project archived already is archived
 * again: its steps run once more, and every finished one answers at once — which is how the same
 * request retried finishes one that stopped.
 */
export async function archiveProject(
  deps: LifecycleDeps,
  input: { projectId: string; actor: SessionActor },
): Promise<void> {
  await withProjectLock(input.projectId, async () => {
    const by = await switchOffUnderLock(deps, input.projectId, input.actor)
    await publishArchivedOnce(deps, input.projectId, by)
  })
}

/**
 * The archive's body, but for its event — for `archiveProject`, and for `deleteProject`, which must
 * switch the app off under the SAME lock (`withProjectLock` is a session-level advisory lock on a
 * pooled connection, so taking it again from inside would wait on itself for ever) and read
 * `launched_at` again BEFORE it says what the switch-off was for. **ALWAYS KEEPING THE DATA** (the
 * sitting's whole-branch review, I1 and I2): whatever a delete destroys goes only after this has
 * finished, so a delete interrupted here — and the boot that finishes it as an archive, saying the
 * data is kept — leaves exactly what an archive leaves.
 */
async function switchOffUnderLock(
  deps: LifecycleDeps,
  projectId: string,
  actor: SessionActor,
): Promise<EndedBy> {
  const by: EndedBy = { userId: actor.userId, tokenId: null }
  // THE STATE, THE TOKENS AND THE QUESTIONS IN ONE TRANSACTION (the whole-branch review's I1): all
  // three are the database's alone, so no failure after this — the gateway's included — can leave
  // an archived project with a live token that a restore would revive. The steps below revoke and
  // expire again, idempotently, for a boot finishing an archive.
  await deps.db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        state: 'archived',
        archivedAt: sql`now()`,
        archivedBy: actor.userId,
      })
      .where(and(eq(projects.id, projectId), eq(projects.state, 'active')))
    await revokeTokensOf(tx, projectId)
    await expirePendingActions(tx, EVERY_QUESTION, { projectId })
  })
  await runTeardown(deps, { projectId, by }, { deleteData: false })
  return by
}

/**
 * §11's RESTORE: an ordinary project again — and it STARTS NOTHING. Its names keep answering the
 * switched-off page until the next deploy replaces each route in place, and that deploy re-creates
 * the services on their kept volumes (`[M9]`) and registers the SP again. Its tokens stay revoked; a
 * person mints again. An active project is answered as it is, and nothing is published.
 */
export async function restoreProject(
  deps: LifecycleDeps,
  input: { projectId: string; actor: SessionActor },
): Promise<void> {
  await withProjectLock(input.projectId, async () => {
    const moved = await deps.db
      .update(projects)
      .set({ state: 'active' })
      .where(and(eq(projects.id, input.projectId), eq(projects.state, 'archived')))
      .returning({ slug: projects.slug })
    if (moved.length === 0) return
    await publishEvent(
      deps.db,
      deps.bus,
      {
        projectId: input.projectId,
        subject: `project:${input.projectId}`,
        type: 'project.restored',
        machineDetail: { via: 'session', userId: input.actor.userId, tokenId: null },
        humanMessage: `${await personName(deps.db, input.actor.userId)} restored ${moved[0]!.slug}. It is off until its next deploy, which brings it back on its kept data.`,
      },
      makeRedactor([]),
    )
  })
}

export interface TeardownsFinished {
  /** The slugs of archived projects whose teardown this boot ran to the end. */
  finished: string[]
  /** Those it could not, with the step's refusal's code — tried again at the next boot. */
  failed: { slug: string; reason: string }[]
}

/**
 * EVERY ARCHIVED PROJECT, TORN DOWN AGAIN AT BOOT (Decision 28) — because an edge restart drops
 * every runtime route, the switched-off page's included, and a crash mid-archive leaves containers
 * running. `recoverAtBoot` calls it after it has put the Route records back. NEVER THROWS for one
 * project: a boot that failed because one archive could not finish would take the whole platform
 * down to report one app — each is an operator line with a code, and a row in the report.
 */
export async function finishTeardowns(deps: LifecycleDeps): Promise<TeardownsFinished> {
  const archived = await deps.db
    .select({
      id: projects.id,
      slug: projects.slug,
      archivedBy: projects.archivedBy,
      ownerId: projects.ownerId,
    })
    .from(projects)
    .where(eq(projects.state, 'archived'))
  const report: TeardownsFinished = { finished: [], failed: [] }
  for (const project of archived) {
    // Who archived it — for the events the steps publish. The owner only when nothing recorded
    // anybody (a row archived outside `archiveProject`), which no request path writes.
    const by: EndedBy = { userId: project.archivedBy ?? project.ownerId, tokenId: null }
    try {
      await withProjectLock(project.id, async () => {
        // A restore may have landed between the read above and this lock.
        const [still] = await deps.db
          .select({ state: projects.state })
          .from(projects)
          .where(eq(projects.id, project.id))
        if (still?.state !== 'archived') return
        await runTeardown(deps, { projectId: project.id, by }, { deleteData: false })
        await publishArchivedOnce(deps, project.id, by)
      })
      report.finished.push(project.slug)
      console.error(
        `[boot] ${project.slug} is archived: its names answer the switched-off page and its teardown is finished`,
      )
    } catch (error) {
      const reason = (error as { code?: string }).code ?? (error as Error).name
      report.failed.push({ slug: project.slug, reason })
      console.error(
        `[boot] ${project.slug} is archived and its teardown could not be finished (${reason}); the next boot, or archiving it again, tries again`,
      )
    }
  }
  return report
}

/** What a delete needs beyond an archive: the source driver that holds the repository. */
export interface DeleteDeps extends LifecycleDeps {
  source: Pick<SourceDriver, 'name' | 'repositoryFor' | 'destroyRepository'>
}

/**
 * WHAT A DELETE DESTROYS AFTER ITS SWITCH-OFF (Decision 31) — which KEPT everything, and after which
 * `launched_at` is read again. Each step is idempotent, so the same request retried runs them all
 * again from the first; the finished ones answer at once.
 */
export const DELETE_STEPS = [
  // Every environment's services destroyed WITH their data volumes — the archive's own stop, again,
  // now destroying. FIRST, and only here: the switch-off before it kept everything (I1, I2).
  'destroy-data',
  // The Manifest IdP's production row — written by a laptop's launch REHEARSAL (D21), which a
  // never-launched project may have run. Sandbox's and staging's went with the archive. A UBC
  // registration is never in this IdP, so there is nothing of UBC's to remove.
  'deregister-production-sp',
  // Each environment's name, the switched-off page included: the slug is the next project's.
  'release-names',
  // The three LiteLLM users carrying the app's monthly spend (`mf-<projectId>-<kind>`).
  'delete-model-users',
  // The repository — on driver 2 the GitHub repository and its mirror.
  'destroy-repository',
  // Every secret of the project, LAST: an archive revoked every key a row names, and a row is the
  // only reference to one, so a failure above must leave them for the retry to find.
  'destroy-secrets',
] as const

export type DeleteStep = (typeof DELETE_STEPS)[number]

/** A teardown whose stop destroys — what `destroy-data` hands the archive's own step. */
interface Deletion extends Teardown {
  deps: DeleteDeps
}

const DELETE_STEP: Record<DeleteStep, (d: Deletion) => Promise<unknown>> = {
  // The services by the names the releases gave them, as the archive's stop finds them.
  'destroy-data': (d) => STEP['stop-environments'](d),

  'deregister-production-sp': (d) =>
    d.deps.sso.deregisterServiceProvider(d.deps.db, {
      projectId: d.projectId,
      slug: d.slug,
      environmentKind: 'production',
    }),

  'release-names': async (d) => {
    for (const environment of d.environments) {
      await withEnvironmentLock(environment.id, () =>
        d.deps.driver.removeName(environment.hostname, environment.kind),
      )
    }
  },

  // With AI switched off there is no gateway to ask; `scripts/litellm-orphans.sh` reclaims the
  // users, because no container holds a key of theirs.
  'delete-model-users': (d) =>
    d.deps.llm === undefined
      ? Promise.resolve()
      : deleteAppUsers(d.deps.llm, d.projectId),

  // By the project's own driver (`repositoryOf`), which the delete checked before anything began.
  'destroy-repository': async (d) =>
    d.deps.source.destroyRepository(
      await repositoryOf(d.deps, { id: d.projectId, slug: d.slug }),
    ),

  'destroy-secrets': (d) => deleteSecretsOf(d.deps.db, d.projectId),
}

/** A deleted project's record, as the one route that ever answers it answers it. */
export interface Tombstone {
  id: string
  slug: string
  deletedAt: Date
}

/**
 * §11's DELETE (Spec action 3; the front-end enablement plan's Task 12, Decision 31) — for a project
 * that has NEVER LAUNCHED. Under the project's lock:
 *
 * 1. **Refused before anything is touched** — a launched project (`409
 *    PROJECT_LAUNCHED_NOT_DELETABLE`: its data is disposed of under `data.retention_days` and UBC's
 *    sunset procedure, and its canonical hostname is permanent, D26), or one whose repository another
 *    source driver made (`409 SOURCE_PROVIDER_MISMATCH`: this driver cannot destroy it, and a delete
 *    that archived first would then stop at that step for ever).
 * 2. **Switched off** — the archive's own body, KEEPING everything — then `launched_at` read AGAIN
 *    (a launch in flight when the delete began is recorded under a lock the switch-off waited for:
 *    refused then, and left archived); then `project.archived`, and `DELETE_STEPS`, the first of
 *    which destroys every data volume.
 * 3. `project.deleted` published ONCE, then the row made a TOMBSTONE: `state = 'deleted'`,
 *    `deleted_at`. The row stays because the append-only audit trail references it; the partial
 *    `projects_slug_key` frees its slug. In that order, so a failure between the two is finished by
 *    the retry without a second event — and never leaves a deleted project with no event.
 *
 * A step that fails answers `500 PROJECT_TEARDOWN_INCOMPLETE` with the project ARCHIVED: the same
 * request retried finishes it. **The boot does not**: `finishTeardowns` finishes an archive, keeping
 * whatever data is left, and the delete is finished only when somebody asks again.
 */
export async function deleteProject(
  deps: DeleteDeps,
  input: { projectId: string; actor: SessionActor },
): Promise<Tombstone> {
  return withProjectLock(input.projectId, async () => {
    const [project] = await deps.db
      .select({
        slug: projects.slug,
        state: projects.state,
        launchedAt: projects.launchedAt,
        deletedAt: projects.deletedAt,
      })
      .from(projects)
      .where(eq(projects.id, input.projectId))
    if (project === undefined) throw new Error(`no project '${input.projectId}'`)
    // A delete that finished while this one waited for the lock: answered as it is.
    if (project.state === 'deleted' && project.deletedAt !== null)
      return { id: input.projectId, slug: project.slug, deletedAt: project.deletedAt }
    if (project.launchedAt !== null) {
      throw new ProjectStateError(
        'PROJECT_LAUNCHED_NOT_DELETABLE',
        `'${project.slug}' has been to production, so it cannot be deleted: its data is disposed of under its retention period and UBC's sunset procedure, and its production name stays held. Archive it to switch it off`,
      )
    }
    // Throws SOURCE_PROVIDER_MISMATCH for another driver's repository — before anything is taken down.
    await repositoryOf(deps, { id: input.projectId, slug: project.slug })

    const by = await switchOffUnderLock(deps, input.projectId, input.actor)
    /**
     * `launched_at` AGAIN (the whole-branch review's I1). A launch's deploy that took production's
     * environment lock BEFORE the state changed passed its own re-check, and records the launch
     * inside that lock — after the read above. The switch-off just took every environment's lock
     * after the state changed, so no launch can be recorded from here on: read now, it is final.
     * A launched app is never deleted by its owner; it stays switched off, keeping everything.
     */
    const [now] = await deps.db
      .select({ launchedAt: projects.launchedAt })
      .from(projects)
      .where(eq(projects.id, input.projectId))
    if (now?.launchedAt !== null && now?.launchedAt !== undefined) {
      await publishArchivedOnce(deps, input.projectId, by)
      throw new ProjectStateError(
        'PROJECT_LAUNCHED_NOT_DELETABLE',
        `'${project.slug}' went to production while the delete was starting, so it cannot be deleted. It is switched off (archived), and its code, data and secrets are kept; restore it to bring it back`,
      )
    }
    await publishArchivedOnce(deps, input.projectId, by, 'delete')
    const deletion: Deletion = {
      deps,
      projectId: input.projectId,
      slug: project.slug,
      environments: await deps.db
        .select()
        .from(environments)
        .where(eq(environments.projectId, input.projectId))
        .orderBy(environments.kind),
      by,
      deleteData: true,
    }
    for (const step of DELETE_STEPS) {
      try {
        await DELETE_STEP[step](deletion)
      } catch (error) {
        throw stoppedAt(project.slug, step, error, {
          doing: 'deleting',
          then: 'retrying the same request finishes it',
        })
      }
    }
    await publishDeletedOnce(deps, input.projectId, project.slug, input.actor.userId)
    const [tombstone] = await deps.db
      .update(projects)
      .set({ state: 'deleted', deletedAt: sql`now()` })
      .where(eq(projects.id, input.projectId))
      .returning({ deletedAt: projects.deletedAt })
    return { id: input.projectId, slug: project.slug, deletedAt: tombstone!.deletedAt! }
  })
}

/** `project.deleted`, once: a project is deleted once, ever, so any such event is THE one. */
async function publishDeletedOnce(
  deps: LifecycleDeps,
  projectId: string,
  slug: string,
  userId: string,
): Promise<void> {
  const [published] = await deps.db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.type, 'project.deleted')))
    .limit(1)
  if (published !== undefined) return
  await publishEvent(
    deps.db,
    deps.bus,
    {
      projectId,
      subject: `project:${projectId}`,
      type: 'project.deleted',
      machineDetail: { via: 'session', userId, tokenId: null },
      humanMessage: `${await personName(deps.db, userId)} deleted ${slug}. Its code, data and secrets are gone; this record remains, and the name ${slug} is free for another project.`,
    },
    makeRedactor([]),
  )
}
