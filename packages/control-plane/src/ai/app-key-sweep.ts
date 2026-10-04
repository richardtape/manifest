import { count, eq, ne } from 'drizzle-orm'
import {
  environments,
  instances,
  projects,
  releases,
  secrets,
  type Db,
} from '../db/index.js'
import { makeRedactor, publishEvent, type EventBus } from '../observability/index.js'
import type { MasterKeypair } from '../secrets/index.js'
import { getSecret } from '../secrets/store.js'
import { CLASSIFICATION_RANK, canonicalLevel, levelWords } from '../spec/index.js'
import { loadModelCatalogue } from './catalogue.js'
import type { LiteLlmClient } from './client.js'
import { AiError } from './errors.js'
import { instanceKeySecretName, LLM_API_KEY_SECRET, revokeInstanceKey } from './keys.js'
import { failureOf } from './registration.js'
import { inWords } from './sessions.js'

/** What the sweep reads and writes — no catalogue cache: the catalogue is read FRESH (M8). */
export interface AppKeySweepDeps {
  db: Db
  bus: EventBus
  llm: LiteLlmClient
  keys: MasterKeypair
}

/** Instance ids, by what happened to each one's key — and the count of P4b's environment-level keys, never checked. */
export interface AppKeySweep {
  narrowed: string[]
  revoked: string[]
  failed: string[]
  legacy: number
}

/**
 * What `key` HOLDS now, as LiteLLM's own record says (`GET /key/info?key=<value>`, with the master key — the review's I2):
 * `undefined` when LiteLLM holds no such key (`404`, measured at Task 6 Step 1). Anything else THROWS.
 */
export async function heldModels(
  llm: LiteLlmClient,
  key: string,
): Promise<string[] | undefined> {
  try {
    const body = await llm.get<{ info?: { models?: unknown } }>('/key/info', { key })
    const models = body.info?.models
    return Array.isArray(models)
      ? models.filter((m): m is string => typeof m === 'string')
      : []
  } catch (error) {
    if (error instanceof AiError && error.status === 404) return undefined
    throw error
  }
}

/** P4b's environment-level `app:llmApiKey`s: counted and named, never checked — none survives a redeploy since P4c. */
export async function countLegacyKeys(db: Pick<Db, 'select'>): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(secrets)
    .where(eq(secrets.name, LLM_API_KEY_SECRET))
  return Number(row?.n ?? 0)
}

/**
 * A LOWERED LEVEL TAKES EFFECT ON RUNNING APPS (§7 as the U1 spec action amended it; S11 — Rich, 2026-10-03, 22:21). A model's
 * level is lowered when everything that may answer it no longer meets the rule its old level needed — a provider's zero
 * retention lapsing — and the catalogue then refuses it to new validations and deploys (D17, twice). A key a RUNNING instance
 * already holds would still reach it. So at every boot, after the boot's own registrations and the agent sessions' sweep, each
 * instance's key loses every model it HOLDS that the level of the release it runs (its FROZEN level — E3, Rich's 13:53 words)
 * no longer allows — or, when nothing it may use is left, is REVOKED: LiteLLM reads `models: []` as every model
 * (`ai/keys.ts`'s `mintAppKey`). What a key holds is LiteLLM's own record (`/key/info`), so a second boot finds nothing to do
 * (the review's I2). The catalogue is read FRESH (M8). Each change is an `ai.models_withdrawn` event to the project's people
 * and an operator line. The rule is the agent sweep's (`ai/sessions.ts`): a model the catalogue SERVES and does not allow is
 * withdrawn; one it no longer serves stays, and LiteLLM refuses it. A release whose level cannot be read is NAMED and skipped
 * — never assumed, in either direction. An operator line never carries a key or a provider's message.
 */
export async function withdrawLoweredAppModels(
  deps: AppKeySweepDeps,
): Promise<AppKeySweep> {
  const snapshot = await loadModelCatalogue(deps.llm)
  const served = new Set([
    ...snapshot.models.map((m) => m.name),
    ...snapshot.unclassified,
  ])
  const rows = await deps.db
    .select({
      instance: instances,
      environment: environments,
      release: releases,
      slug: projects.slug,
    })
    .from(instances)
    .innerJoin(environments, eq(instances.environmentId, environments.id))
    .innerJoin(releases, eq(instances.releaseId, releases.id))
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(ne(instances.state, 'gone'))
  const result: AppKeySweep = { narrowed: [], revoked: [], failed: [], legacy: 0 }
  for (const { instance, environment, release, slug } of rows) {
    const scope = {
      projectId: environment.projectId,
      kind: environment.kind,
      instanceId: instance.id,
    }
    const where = `instance ${instance.id} (${slug}, ${environment.kind})`
    try {
      const key = await getSecret(
        deps.db,
        {
          projectId: scope.projectId,
          environmentKind: scope.kind,
          name: instanceKeySecretName(instance.id),
        },
        deps.keys,
      )
      if (key === undefined) continue
      const frozen = (
        release.resolvedConfig as Record<string, { classification?: unknown } | undefined>
      )[environment.kind]
      const level = canonicalLevel(frozen?.classification)
      if (level === undefined) {
        console.error(
          `app key sweep: ${where}: its release names no level the platform reads, so its AI key was not checked; ` +
            'redeploy it',
        )
        result.failed.push(instance.id)
        continue
      }
      const held = await heldModels(deps.llm, key)
      if (held === undefined) continue // LiteLLM holds no such key: nothing to withdraw
      const allowed = (m: string) =>
        snapshot.models.some(
          (e) =>
            e.name === m &&
            CLASSIFICATION_RANK[e.maxClassification] >= CLASSIFICATION_RANK[level],
        )
      const withdrawn = held.filter((m) => served.has(m) && !allowed(m))
      if (withdrawn.length === 0) continue
      const kept = held.filter((m) => !withdrawn.includes(m))
      // NEVER `models: []` — LiteLLM reads it as EVERY model. A key left with nothing it may use is revoked.
      const revoked = !kept.some(allowed)
      if (revoked) await revokeInstanceKey(deps.db, deps.llm, deps.keys, scope)
      else await deps.llm.post('/key/update', { key, models: kept })
      await publishEvent(
        deps.db,
        deps.bus,
        {
          projectId: environment.projectId,
          subject: `instance:${instance.id}`,
          type: 'ai.models_withdrawn',
          machineDetail: {
            instanceId: instance.id,
            environment: environment.kind,
            withdrawn,
            models: revoked ? [] : kept,
            revoked,
          },
          humanMessage: revoked
            ? `${slug} in ${environment.kind} may no longer call ${inWords(withdrawn)}: each is now approved only below ` +
              `its ${levelWords(level)} data, and nothing it declared is still allowed, so its AI key was revoked. ` +
              'Change ai.models or data.classification, then deploy again.'
            : `${slug} in ${environment.kind} may no longer call ${inWords(withdrawn)}: each is now approved only below ` +
              `its ${levelWords(level)} data. Its AI key keeps ${inWords(kept)}.`,
        },
        makeRedactor([key]),
      )
      console.error(
        `app key sweep: ${where}: its AI key ${revoked ? 'was revoked' : 'was narrowed'} — ` +
          `${inWords(withdrawn)} now approved only below its ${levelWords(level)} data`,
      )
      ;(revoked ? result.revoked : result.narrowed).push(instance.id)
    } catch (error) {
      console.error(
        `app key sweep: ${where}: its AI key could not be narrowed or revoked; it may still reach a model its ` +
          `data's level no longer allows, until the next boot: ${failureOf(error)}`,
      )
      result.failed.push(instance.id)
    }
  }
  result.legacy = await countLegacyKeys(deps.db)
  if (result.legacy > 0)
    console.error(
      `app key sweep: ${result.legacy} environment-level AI key(s) from before per-instance keys were not checked; ` +
        'redeploy those apps',
    )
  return result
}

/** What the boot did to running apps' keys — the boot line's `appKeysWithdrawn`. */
export type AppKeysAtBoot =
  { narrowed: number; revoked: number; failed: number } | 'failed'

/**
 * The boot's call, in `gatewayModelsAtBoot`'s shape (`index.ts`, straight after the agent sessions' sweep): NEVER FATAL — a
 * gateway that does not answer is ONE `[boot]` line and `'failed'`, and the next boot tries again. Each key narrowed, revoked
 * or not checked has its own operator line from the sweep. `console.error`: this server runs `logger: false`.
 */
export async function appKeysAtBoot(deps: AppKeySweepDeps): Promise<AppKeysAtBoot> {
  try {
    const r = await withdrawLoweredAppModels(deps)
    return {
      narrowed: r.narrowed.length,
      revoked: r.revoked.length,
      failed: r.failed.length,
    }
  } catch (error) {
    console.error(
      `[boot] the running apps' AI keys could not be checked: ${failureOf(error)}. A key may still reach a model its ` +
        "data's level no longer allows until the next boot.",
    )
    return 'failed'
  }
}
