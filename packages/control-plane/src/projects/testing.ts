import { fileURLToPath } from 'node:url'
import { loadReservedLabels, type ReservedLabels } from './reserved-labels.js'
import type { StoredAudience } from './repository.js'

/** The repository's own list — the one the control plane boots with by default. */
export const RESERVED_LABELS_DIR = fileURLToPath(
  new URL('../../../../infra/reserved-labels', import.meta.url),
)

let loaded: Promise<ReservedLabels> | undefined

/**
 * §23's REAL reserved labels, read once per test process (P5a Task 9). The real list and
 * not a stub, so a test slug that is reserved fails where it is written, not at a demo.
 */
export function testReservedLabels(): Promise<ReservedLabels> {
  loaded ??= loadReservedLabels(RESERVED_LABELS_DIR)
  return loaded
}

/**
 * A fixed §24 audience for a project a test creates through `createProject` directly (P5a
 * Task 11), where no assertion depends on it. Over HTTP, `api/testing.ts`'s `projectBody`.
 */
export function testAudience(setBy: string): StoredAudience {
  return {
    scale: 'solo',
    burst: 'steady',
    justification: null,
    set_by: setBy,
    set_at: '2026-09-16T00:00:00.000Z',
  }
}
