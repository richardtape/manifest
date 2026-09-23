import { expect } from 'vitest'
import type { EventType } from './events.js'

/**
 * Asserts a query failed with a specific Postgres SQLSTATE.
 *
 * `rejects.toThrow(/permission denied/i)` does NOT work here and the way it fails
 * is worth keeping: drizzle wraps every driver error in its own, whose message is
 * `Failed query: UPDATE audit.events …` and carries the real one on `.cause`. So
 * the regex matched nothing while the query was in fact being refused — a test
 * that would have gone red against a working control and green against a broken
 * one the moment somebody relaxed it to `.rejects.toThrow()`.
 *
 * The code is also the stronger assertion. `42501` is insufficient_privilege and
 * `23503` is foreign_key_violation; a message match would accept a typo'd table
 * name or a rolled-back transaction as proof of a grant.
 *
 * Shared by every `audit` table's tests (`events`, `build_logs`), because it is the
 * one helper whose subtlety has already cost a defect, and a second copy drifts.
 */
export async function expectSqlState(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  let thrown: unknown
  try {
    await promise
  } catch (error) {
    thrown = error
  }
  expect(thrown, 'the query was expected to fail and did not').toBeDefined()
  const codes: string[] = []
  for (let e = thrown; e instanceof Error; e = e.cause) {
    const found = (e as { code?: string }).code
    if (found !== undefined) codes.push(found)
  }
  expect(codes).toContain(code)
}

/**
 * ONE WELL-FORMED `machineDetail` PER EVENT TYPE, for a test that needs an event to exist
 * and is not about its payload (P5a Task 12). `recordEvent` refuses a detail its type's
 * schema does not accept, so `{}` is no longer an event. Shaped as each call site sends it
 * — the retirer, `deployRelease`, `runBuild`, `registerServiceProvider` and creation — and
 * `events.test.ts` holds every one to its schema, so a schema change that forgets these
 * fails there rather than in whichever test happened to borrow one.
 */
const UUID = '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f'
const SHA = '0123456789abcdef0123456789abcdef01234567'
export const EXAMPLE_DETAILS: { readonly [T in EventType]: Record<string, unknown> } = {
  'sso.registered': {
    entityId: 'https://manifest.internal/sp/chem-labs/staging',
    acsUrl: 'https://chem-labs.staging.manifest.internal/auth/saml/callback',
    attributes: ['displayName', 'mail'],
    certificateFingerprint: 'AB:CD:EF',
    changed: true,
  },
  'sso.acs_changed': {
    from: 'http://127.0.0.1:7188/auth/saml/callback',
    to: 'https://chem-labs.staging.manifest.internal/auth/saml/callback',
  },
  'build.started': { buildId: UUID, commitSha: SHA, blueprintRef: 'fixture-node@1' },
  'build.succeeded': {
    buildId: UUID,
    imageDigest: `sha256:${'a'.repeat(64)}`,
    imageRepository: 'manifest-registry:5000/apps/chem-labs',
  },
  'build.failed': { buildId: UUID, code: 'BUILD_FAILED', reason: 'npm ci exited 1' },
  'instance.provisioning': {
    instanceId: UUID,
    releaseId: UUID,
    environmentId: UUID,
    environment: 'staging',
    state: 'provisioning',
  },
  'instance.starting': {
    instanceId: UUID,
    releaseId: UUID,
    environmentId: UUID,
    environment: 'staging',
    state: 'starting',
  },
  'instance.healthy': {
    instanceId: UUID,
    releaseId: UUID,
    environmentId: UUID,
    environment: 'staging',
    state: 'healthy',
  },
  'instance.failed': {
    instanceId: UUID,
    releaseId: UUID,
    environmentId: UUID,
    environment: 'staging',
    state: 'failed',
    failedCheck: 'health: GET /healthz on port 3000 — connection refused',
  },
  'incident.opened': {
    incidentId: UUID,
    instanceId: UUID,
    releaseId: UUID,
    environment: 'staging',
  },
  'ai.key_rotated': {
    instanceId: UUID,
    environment: 'staging',
    models: ['default-chat'],
  },
  'instance.retiring': {
    instanceId: UUID,
    handle: 'mf-x',
    environment: 'staging',
    drainMs: 0,
  },
  'instance.retired': {
    instanceId: null,
    handle: 'mf-x',
    environment: 'staging',
    drainMs: 0,
  },
  'instance.retire_failed': {
    instanceId: UUID,
    handle: 'mf-x',
    environment: 'staging',
    drainMs: 0,
    error: 'DRIVER_UNAVAILABLE',
  },
  'project.created': {
    slug: 'chem-labs',
    blueprint: 'fixture-node@1',
    starter: null,
    audience: { scale: 'solo', burst: 'steady' },
  },
  'repository.seeded': { commitSha: SHA, files: 2, starter: null },
  'spec.validated': { appSpecId: UUID, commitSha: SHA, valid: true, errorCount: 0 },
  'pending_action.created': {
    pendingActionId: UUID,
    tokenId: UUID,
    action: 'members:manage',
  },
  'pending_action.confirmed': {
    pendingActionId: UUID,
    tokenId: UUID,
    action: 'members:manage',
    resolvedBy: UUID,
  },
  'pending_action.rejected': {
    pendingActionId: UUID,
    tokenId: UUID,
    action: 'members:manage',
    resolvedBy: UUID,
    reason: 'not this term',
  },
  'token.minted': {
    tokenId: UUID,
    capabilities: ['project:read', 'build:create'],
    expiresAt: '2026-10-17T00:00:00.000Z',
  },
  'iam_registration.recorded': {
    state: 'submitted',
    entityId: 'https://manifest.internal/sp/chem-labs/production',
    externalTicketRef: 'IAM-2026-0412',
    attributeCount: 2,
  },
  'privacy_assessment.recorded': {
    state: 'submitted',
    externalTicketRef: 'PIA-2026-0088',
  },
  'rehearsal.completed': {
    rehearsalId: UUID,
    releaseId: UUID,
    passed: true,
    attributeCount: 2,
  },
  'release.approved': {
    releaseId: UUID,
    imageDigest: `sha256:${'a'.repeat(64)}`.slice(0, 19),
    decision: 'approved',
  },
  'release.approval_rejected': {
    releaseId: UUID,
    imageDigest: `sha256:${'a'.repeat(64)}`.slice(0, 19),
    decision: 'rejected',
  },
  'project.launched': {
    releaseId: UUID,
    instanceId: UUID,
    imageDigest: `sha256:${'a'.repeat(64)}`.slice(0, 19),
  },
}
