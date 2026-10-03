// [M2] Lets the test harness's modules load OUTSIDE Vitest: `vitest` resolves to an inert stub. The probe calls no
// test helper that asserts, and nothing here runs a test (no global setup, so nothing is truncated).
import { register } from 'node:module'
const stub = 'export const expect = () => ({}); export const vi = {}; export const describe = () => {}; export const it = () => {};' +
  'export const test = () => {}; export const beforeEach = () => {}; export const afterEach = () => {};' +
  'export const beforeAll = () => {}; export const afterAll = () => {}; export const inject = () => undefined;'
const hooks = `export async function resolve(spec, ctx, next) {
  if (spec === 'vitest') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true }
  return next(spec, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(hooks))
