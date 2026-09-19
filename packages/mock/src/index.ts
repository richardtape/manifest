/**
 * THE PACKAGE ENTRY, added in Task 12 so `packages/console/src/api.test.ts` can import
 * `@manifest/mock` rather than reach across the workspace by relative path — which `tsc`
 * will not follow outside a package's `rootDir` (ORIENTATION §4, TS7016).
 */
export { createMockServer, ANSWERED, operationsOf, readDocument } from './server.js'
export type { MockOptions } from './server.js'
export * as fixtures from './fixtures.js'
export { REPLAY, READY, scripted, SCAN_SILENCE_MS } from './script.js'
export { createValidator } from './validate.js'
export type { Validate, Validation } from './validate.js'
