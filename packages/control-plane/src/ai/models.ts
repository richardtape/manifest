import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { appSpecs, environments, instances, releases } from '../db/index.js'
import { servingInstanceOf } from '../projects/index.js'
import { CLASSIFICATION_RANK, type Classification } from '../spec/index.js'
import { CAPABLE_MODEL_NAME } from './capable.js'
import type { CatalogueSnapshot } from './catalogue.js'

/**
 * WHICH MODELS THE AGENT THAT BUILDS A `confidential` APP MAY CALL (§7, §10 and §26 as Spec action 10
 * amended them; `MANIFEST_AGENT_BUILDER_MODELS`): `capable` — the default — adds the capable model to
 * the on-premise ones; `on-premise` is D17's rule alone. A platform setting, never a project's: the
 * app's OWN `ai.models` is validated by D17 whatever this says, so a `confidential` app's AI stays
 * on-premise either way.
 */
export type BuilderModels = 'capable' | 'on-premise'

/**
 * D17 FOR AN AGENT (Decision 23; Spec action 1's §10): the logical models an agent session's key may
 * call are EVERY classified catalogue entry approved for the project's data — its
 * `max_classification` rank at least the project's. An unclassified entry is never answered (§7's
 * rule — it is refused on its own). Read from the catalogue: nothing here names a model but the
 * capable one.
 *
 * **AND, ON A `confidential` PROJECT WHILE THE BUILDER SETTING IS `capable`, THE CAPABLE MODEL TOO**
 * (Spec action 10; the front-end enablement plan's Task 14a — Rich: *"It's okay to use the larger
 * models to BUILD the app"*). Its NAME only, and only when the catalogue holds it classified — never
 * another entry the classification refuses (`default-chat`, `default-chat-reasoning` and
 * `default-embed` stay out), so the exception is exactly one model wide. Its fallback is the
 * on-premise model (Spec action 8), which the floor allows anyway.
 */
export function agentModelsFor(
  catalogue: CatalogueSnapshot,
  floor: Classification,
  builder: BuilderModels,
): string[] {
  const building = floor === 'confidential' && builder === 'capable'
  return catalogue.models
    .filter(
      (entry) =>
        CLASSIFICATION_RANK[entry.maxClassification] >= CLASSIFICATION_RANK[floor] ||
        (building && entry.name === CAPABLE_MODEL_NAME),
    )
    .map((entry) => entry.name)
}

/** §7's default when a project has no valid manifest yet. */
const DEFAULT_CLASSIFICATION: Classification = 'internal'

interface ParsedSpec {
  data?: { classification?: unknown }
}
interface FrozenConfig {
  production?: { classification?: unknown }
}

const asClassification = (value: unknown): Classification | undefined =>
  typeof value === 'string' && value in CLASSIFICATION_RANK
    ? (value as Classification)
    : undefined

/**
 * The classification an agent session is routed by: the newest VALID manifest's — `internal` when
 * there is none — and, once production serves a release, NEVER LESS RESTRICTIVE than that release's.
 *
 * **THE PRODUCTION FLOOR EXISTS BECAUSE THE AGENT WRITES `manifest.yaml`** (Decision 23): without
 * it an agent could lower `data.classification` in a commit and start its next session on a model
 * the data production holds may not reach, while production — whose change would re-escalate —
 * still says `confidential`. The two reads are ONE function, so a caller cannot take one without
 * the other.
 */
export async function classificationFloor(
  db: Pick<Db, 'select'>,
  projectId: string,
): Promise<Classification> {
  const [newest] = await db
    .select({ parsed: appSpecs.parsed })
    .from(appSpecs)
    .where(and(eq(appSpecs.projectId, projectId), eq(appSpecs.valid, true)))
    .orderBy(desc(appSpecs.createdAt), desc(appSpecs.id))
    .limit(1)
  const declared =
    asClassification((newest?.parsed as ParsedSpec | undefined)?.data?.classification) ??
    DEFAULT_CLASSIFICATION

  const [production] = await db
    .select()
    .from(environments)
    .where(
      and(eq(environments.projectId, projectId), eq(environments.kind, 'production')),
    )
    .limit(1)
  if (production === undefined) return declared
  const serving = await servingInstanceOf(db, production)
  if (serving === undefined) return declared
  const [release] = await db
    .select({ resolvedConfig: releases.resolvedConfig })
    .from(releases)
    .where(eq(releases.id, serving.releaseId))
    .limit(1)
  const frozen = asClassification(
    (release?.resolvedConfig as FrozenConfig | undefined)?.production?.classification,
  )
  if (frozen === undefined) return declared
  return CLASSIFICATION_RANK[frozen] > CLASSIFICATION_RANK[declared] ? frozen : declared
}

/**
 * **THE CLASSIFICATION AN ENVIRONMENT'S RECORDS ARE PROTECTED BY** (the front-end enablement plan's Task
 * 14a, its review's I1): the most restrictive of the project's floor and of the classification frozen, for
 * this environment's kind, into EVERY release that has had an instance here. An Incident's log tail is
 * what a release printed while it ran, so it is as protected as the release that printed it — and the
 * floor alone would fall on a commit a building agent's own token may make (`data.classification:
 * internal`; D9 binds only at a production deploy), while staging's Incidents of the confidential
 * release that came before stay on record. Read metadata only, never a log line.
 */
export async function environmentFloor(
  db: Pick<Db, 'select' | 'selectDistinct'>,
  environment: {
    id: string
    projectId: string
    kind: 'sandbox' | 'staging' | 'production'
  },
): Promise<Classification> {
  let floor = await classificationFloor(db, environment.projectId)
  const ran = await db
    .selectDistinct({ resolvedConfig: releases.resolvedConfig })
    .from(instances)
    .innerJoin(releases, eq(instances.releaseId, releases.id))
    .where(eq(instances.environmentId, environment.id))
  for (const { resolvedConfig } of ran) {
    const frozen = asClassification(
      (resolvedConfig as Record<string, { classification?: unknown }> | undefined)?.[
        environment.kind
      ]?.classification,
    )
    if (frozen !== undefined && CLASSIFICATION_RANK[frozen] > CLASSIFICATION_RANK[floor])
      floor = frozen
  }
  return floor
}
