import { fileURLToPath } from 'node:url'
import { loadReservedLabels, type ReservedLabels } from './reserved-labels.js'

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
