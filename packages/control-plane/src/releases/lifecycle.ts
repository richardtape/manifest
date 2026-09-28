import { and, eq, gte, ne, sql } from 'drizzle-orm'
import {
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
import { personName, ProjectStateError, type SessionActor } from '../projects/index.js'
import { canTransition, nextState, serviceName, type Driver } from '../runtime/index.js'
import type { AppSecretResolver } from '../secrets/index.js'
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
 */
export const TEARDOWN_STEPS = [
  // Keys revoked by alias at the gateway BEFORE their rows are stamped (`endSessionsOf`).
  'end-agent-sessions',
  // Every token of the project, `revoked_at` now. `tokenActor` refuses them anyway (Decision 27).
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
            // The driver never created it (a deploy interrupted before its container): nothing to
            // drain or remove, so the row goes straight to where the retire would have left it.
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
      console.error(
        `[lifecycle] switching ${project.slug} off stopped at ${step}: ${
          (error as { code?: string }).code ?? (error as Error).name
        } — the same request retried, or the next boot, continues from the first step`,
      )
      throw new ProjectStateError(
        'PROJECT_TEARDOWN_INCOMPLETE',
        `switching '${project.slug}' off stopped at '${step}'. The project is archived; retrying the same request finishes it, and so does the control plane's next boot`,
      )
    }
  }
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
      humanMessage: `${await personName(deps.db, by.userId)} switched ${project.slug} off. Each of its names now answers a page saying so; its code, data and secrets are kept, and it can be restored.`,
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
  const by: EndedBy = { userId: input.actor.userId, tokenId: null }
  await withProjectLock(input.projectId, async () => {
    await deps.db
      .update(projects)
      .set({ state: 'archived', archivedAt: sql`now()`, archivedBy: input.actor.userId })
      .where(and(eq(projects.id, input.projectId), eq(projects.state, 'active')))
    await runTeardown(deps, { projectId: input.projectId, by }, { deleteData: false })
    await publishArchivedOnce(deps, input.projectId, by)
  })
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
