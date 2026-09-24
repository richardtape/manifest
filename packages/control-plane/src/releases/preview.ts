import { and, eq } from 'drizzle-orm'
import { approvalPreviews, type Db } from '../db/index.js'
import { stable } from '../spec/index.js'
import {
  diffFactsFor,
  type DiffFacts,
  type DiffSnapshot,
  type ReleaseRow,
  type SnapshotDeps,
} from './approval.js'
import { ReleaseError } from './release.js'

/**
 * How long "shown at decision time" may be stretched (P6b Decision 10): ten minutes of
 * step-up and twenty of reading. A preview older than this is refused, and the console takes
 * a new one — a stale reading recorded as "what was shown" is the thing the store exists to
 * prevent.
 */
export const PREVIEW_TTL_MS = 30 * 60 * 1000

export type PreviewRow = typeof approvalPreviews.$inferSelect

/**
 * The deterministic half of a stored snapshot — what the approval compares. NEVER the summary
 * or the verdict (Decision 10).
 *
 * The three are taken out BY NAME, so a key added to `DiffSnapshot` later is a fact by default
 * and compared — the conservative direction: a new field that moved refuses a stale preview
 * rather than letting it through.
 */
export function factsOf(snapshot: DiffSnapshot): DiffFacts {
  const {
    summary: _summary,
    summarySource: _source,
    review: _review,
    ...facts
  } = snapshot
  return facts
}

/**
 * Key-order-insensitive, at every depth: a snapshot read back from jsonb has its keys in
 * Postgres's order, and the one computed a moment ago has them in JavaScript's. **One
 * serialisation, `spec/diff.ts`'s `stable`, exported for this** — not a second one that would
 * disagree with the first about something nobody thought to test.
 */
export function sameFacts(a: DiffFacts, b: DiffFacts): boolean {
  return stable(a) === stable(b)
}

/**
 * Stores what the administrator is about to read (Decision 10). INSERT ONLY; `expires_at` is
 * `now + PREVIEW_TTL_MS`, and `created_at` is the same `now`, so a test that passes one has a
 * row whose two instants agree.
 *
 * **Caller:** `POST /v1/releases/{releaseId}/approval-preview` (`api/routes/releases.ts`).
 */
export async function recordPreview(
  db: Db,
  input: {
    release: Pick<ReleaseRow, 'id' | 'projectId'>
    actor: { userId: string }
    snapshot: DiffSnapshot
    digest: string
    now?: Date
  },
): Promise<PreviewRow> {
  const now = input.now ?? new Date()
  const [row] = await db
    .insert(approvalPreviews)
    .values({
      releaseId: input.release.id,
      projectId: input.release.projectId,
      createdBy: input.actor.userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + PREVIEW_TTL_MS),
      imageDigest: input.digest,
      diffSnapshot: input.snapshot,
    })
    .returning()
  return row!
}

/**
 * A preview OF THIS RELEASE, or `undefined`. **Scoped by both ids in one query**: a preview of
 * another release is indistinguishable from no preview at all, which is the enumeration rule
 * `getRelease` states — and what stops an administrator's decision on R2 recording R1's diff.
 *
 * **Callers:** `decide()` and `GET …/approval-previews/{previewId}`.
 */
export async function previewFor(
  db: Db,
  previewId: string,
  releaseId: string,
): Promise<PreviewRow | undefined> {
  const [row] = await db
    .select()
    .from(approvalPreviews)
    .where(
      and(eq(approvalPreviews.id, previewId), eq(approvalPreviews.releaseId, releaseId)),
    )
  return row
}

/**
 * Whether a decision may still name this preview: NOT EXPIRED, then NOT STALE — the facts
 * recomputed NOW, by the same `diffFactsFor` that took them, and compared; never the summary,
 * never the verdict (Decision 10).
 *
 * Each refusal is a `ReleaseError` with a LITERAL code, because `error-codes.test.ts` finds a
 * code by reading `new <Class>('CODE'` in the source. **The stale message names what moved**,
 * and says so plainly whenever it was the baseline — in practice the only thing that can move,
 * because a release's digest and frozen configuration are immutable.
 *
 * **Caller:** `decide()` in `api/routes/releases.ts`.
 */
export async function assertPreviewCurrent(
  deps: Pick<SnapshotDeps, 'db'>,
  preview: PreviewRow,
  release: ReleaseRow,
  digest: string,
  now: number = Date.now(),
): Promise<void> {
  if (now >= preview.expiresAt.getTime())
    throw new ReleaseError(
      'APPROVAL_PREVIEW_EXPIRED',
      `preview '${preview.id}' expired at ${preview.expiresAt.toISOString()} — take a new one and read it before deciding.`,
    )
  const shown = factsOf(preview.diffSnapshot)
  const current = await diffFactsFor(deps, release, digest)
  if (sameFacts(shown, current)) return
  const moved = (Object.keys({ ...shown, ...current }) as (keyof DiffFacts)[]).filter(
    (key) => stable(shown[key] ?? null) !== stable(current[key] ?? null),
  )
  throw new ReleaseError(
    'APPROVAL_PREVIEW_STALE',
    (moved.includes('baselineReleaseId')
      ? 'the last approved release of this project changed since this preview was taken — take a new one.'
      : 'what this release would be approved as changed since this preview was taken — take a new one.') +
      ` Moved: ${moved.join(', ')}.`,
  )
}
