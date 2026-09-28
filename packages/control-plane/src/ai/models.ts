import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { appSpecs, environments, releases } from '../db/index.js'
import { servingInstanceOf } from '../projects/index.js'
import { CLASSIFICATION_RANK, type Classification } from '../spec/index.js'
import type { CatalogueSnapshot } from './catalogue.js'

/**
 * D17 FOR AN AGENT (Decision 23; Spec action 1's §10): the logical models an agent session's key may
 * call are EVERY classified catalogue entry approved for the project's data — its
 * `max_classification` rank at least the project's. An unclassified entry is never answered (§7's
 * rule — it is refused on its own). Read from the catalogue, never from a list here: nothing in
 * this module names a model, so the capable model Rich has decided to add later arrives by the
 * catalogue alone (sitting 7's check).
 */
export function agentModelsFor(
  catalogue: CatalogueSnapshot,
  floor: Classification,
): string[] {
  return catalogue.models
    .filter(
      (entry) =>
        CLASSIFICATION_RANK[entry.maxClassification] >= CLASSIFICATION_RANK[floor],
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
  db: Db,
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
