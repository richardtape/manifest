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
// P11's demo fleet (`MANIFEST_MOCK_FLEET=demo`): its builder and its ids, for the administrator's console's tests.
export { createFleet, FLEET_PROJECTS, fleetId, KIND } from './fleet.js'
export type { Fleet, FleetAnswer, FleetContext } from './fleet.js'
