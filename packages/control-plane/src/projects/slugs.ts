import { eq } from 'drizzle-orm'
import { projects, type Db } from '../db/index.js'
import { SLUG } from '../spec/index.js'
import type { ReservedLabels } from './reserved-labels.js'

/**
 * §23: "One function answers both" — the slug check, project creation, and any rename
 * (P5a Decision 24). It returns EVERY reason that applies; creation throws the first.
 */
export const SLUG_CODES = {
  INVALID: 'SLUG_INVALID',
  RESERVED: 'SLUG_RESERVED',
  TAKEN: 'SLUG_TAKEN',
} as const

export interface SlugReason {
  code: (typeof SLUG_CODES)[keyof typeof SLUG_CODES]
  message: string
  hint: string
}

export type SlugVerdict =
  | { slug: string; available: true }
  | { slug: string; available: false; reasons: SlugReason[] }

/**
 * The TAKEN reason, ONE copy: `checkSlug` gives it, and creation gives it again when two
 * requests race between the check and the insert (`createProject`'s unique-violation
 * catch), so a person reads the same sentence either way.
 */
export function slugTaken(slug: string): SlugReason {
  // NOTHING ABOUT THE HOLDER (§23): no owner, no id, no environment.
  return {
    code: SLUG_CODES.TAKEN,
    message: `'${slug}' is already a project's name.`,
    hint: 'Project names are unique across the platform, because each becomes a hostname (§23). Choose another.',
  }
}

export async function checkSlug(
  db: Db,
  reserved: ReservedLabels,
  slug: string,
): Promise<SlugVerdict> {
  if (!SLUG.test(slug)) {
    return {
      slug,
      available: false,
      reasons: [
        {
          code: SLUG_CODES.INVALID,
          message: `'${slug.slice(0, 64)}' cannot be a project name`,
          hint: 'Lower-case letters, digits and hyphens, 3–39 characters, starting with a letter (§7).',
        },
      ],
    }
  }
  const reasons: SlugReason[] = []
  const label = reserved.lookup(slug)
  if (label !== undefined) {
    reasons.push({
      code: SLUG_CODES.RESERVED,
      message: `'${slug}' is reserved — ${label.standsFor}.`,
      hint: `${label.reason} Choose another name.`,
    })
  }
  const [holder] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1)
  if (holder !== undefined) reasons.push(slugTaken(slug))
  return reasons.length === 0
    ? { slug, available: true }
    : { slug, available: false, reasons }
}

export class SlugRefusedError extends Error {
  readonly code: SlugReason['code']
  readonly hint: string
  constructor(reason: SlugReason) {
    super(reason.message)
    this.code = reason.code
    this.hint = reason.hint
    this.name = 'SlugRefusedError'
  }
}

export async function assertSlugAvailable(
  db: Db,
  reserved: ReservedLabels,
  slug: string,
): Promise<void> {
  const verdict = await checkSlug(db, reserved, slug)
  if (!verdict.available) throw new SlugRefusedError(verdict.reasons[0]!)
}
