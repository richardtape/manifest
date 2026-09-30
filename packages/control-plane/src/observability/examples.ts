import type { EventType } from './events.js'

/**
 * ONE WELL-FORMED `machineDetail` PER EVENT TYPE (P5a Task 12) — and, since the authoring API
 * plan's Task 9, THE EXAMPLE THE OPENAPI DOCUMENT PUBLISHES for each type
 * (`x-manifest-event-types` on the stream), so it is PUBLIC TEXT: realistic, and naming no plan
 * or person. `recordEvent` refuses a detail its type's schema does not accept, so `{}` is no
 * longer an event, and a test that needs an event to exist and is not about its payload borrows
 * one of these (through `testing.ts`). Shaped as each call site sends it — the retirer,
 * `deployRelease`, `runBuild`, `registerServiceProvider` and creation — and `events.test.ts`
 * and `api/contract/docs.test.ts` hold every one to its schema, so a schema change that forgets
 * these fails there rather than in whichever test happened to borrow one.
 *
 * **Production code, not `testing.ts`**, because the document is built at boot and `testing.ts`
 * imports `vitest`.
 */
const UUID = '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f'
/** A second person, for the details that name two: who acted, and who it was about. */
const OTHER_UUID = '2b7e4f90-3c1d-4a6e-8f25-9d0c1b3a4e57'
const SHA = '0123456789abcdef0123456789abcdef01234567'
/** A second commit, for the details that name two: a move from one to the other. */
const NEXT_SHA = '89abcdef0123456789abcdef0123456789abcdef'
const DIGEST = `sha256:${'a'.repeat(64)}`

export const EXAMPLE_DETAILS: { readonly [T in EventType]: Record<string, unknown> } = {
  'sso.registered': {
    entityId: 'https://manifest.internal/sp/chem-labs/staging',
    acsUrl: 'https://chem-labs.staging.manifest.internal/auth/saml/callback',
    attributes: ['displayName', 'mail'],
    certificateFingerprint:
      '3A:9C:04:E7:B2:5D:18:6A:C3:47:0E:9B:D2:61:A8:35:7C:E0:4B:93:2D:A6:15:C8:E9:30:7A:4E:B1:6C:D5:08',
    changed: true,
  },
  'sso.acs_changed': {
    from: 'http://127.0.0.1:7188/auth/saml/callback',
    to: 'https://chem-labs.staging.manifest.internal/auth/saml/callback',
  },
  'build.started': { buildId: UUID, commitSha: SHA, blueprintRef: 'fixture-node@1' },
  'build.succeeded': {
    buildId: UUID,
    imageDigest: DIGEST,
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
    handle: 'mf-chem-labs-staging-6f1c1d2e-9b8a7c6d-app',
    environment: 'staging',
    drainMs: 1240,
  },
  'instance.retired': {
    instanceId: null,
    handle: 'mf-chem-labs-staging-6f1c1d2e-9b8a7c6d-app',
    environment: 'staging',
    drainMs: 1240,
  },
  'instance.retire_failed': {
    instanceId: UUID,
    handle: 'mf-chem-labs-staging-6f1c1d2e-9b8a7c6d-app',
    environment: 'staging',
    drainMs: 1240,
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
    imageDigest: DIGEST.slice(0, 19),
    decision: 'approved',
  },
  'release.approval_rejected': {
    releaseId: UUID,
    imageDigest: DIGEST.slice(0, 19),
    decision: 'rejected',
  },
  'project.launched': {
    releaseId: UUID,
    instanceId: UUID,
    imageDigest: DIGEST.slice(0, 19),
  },
  'repository.pushed': { ref: 'refs/heads/main', from: SHA, to: NEXT_SHA },
  'repository.history_rewritten': {
    ref: 'refs/heads/main',
    mirror: SHA,
    upstream: NEXT_SHA,
  },
  'repository.visibility_enforced': {
    observed: 'public',
    result: 'private',
    detail: 'made private again',
  },
  'repository.secret_detected': {
    commit: SHA,
    findings: [{ path: 'config/aws.js', line: 2, rule: 'an AWS access key id' }],
    truncated: false,
  },
  'repository.scan_incomplete': { commits: [NEXT_SHA] },
  'repository.protection_unavailable': {
    ref: 'refs/heads/main',
    detail: 'GitHub would not protect main on this repository',
  },
  'repository.committed': {
    commitSha: NEXT_SHA,
    parent: SHA,
    added: 1,
    modified: 2,
    deleted: 0,
    via: 'token',
    userId: UUID,
    tokenId: UUID,
  },
  'repository.secret_refused': {
    findings: [{ path: 'config.js', line: 1, rule: 'an AWS access key id' }],
  },
  'app_secret.set': {
    environmentKind: 'staging',
    name: 'SIS_API_KEY',
    via: 'session',
    userId: UUID,
    tokenId: null,
  },
  'app_secret.cleared': {
    environmentKind: 'staging',
    name: 'SIS_API_KEY',
    via: 'token',
    userId: UUID,
    tokenId: UUID,
  },
  'project.renamed': {
    from: 'chem-labs',
    to: 'CHEM 121 — Lab notebook',
    via: 'session',
    userId: UUID,
    tokenId: null,
  },
  'member.added': {
    memberId: OTHER_UUID,
    role: 'collaborator',
    previousRole: null,
    via: 'session',
    userId: UUID,
    tokenId: null,
  },
  'member.removed': {
    memberId: OTHER_UUID,
    tokensRevoked: 1,
    sessionsEnded: 1,
    via: 'session',
    userId: UUID,
    tokenId: null,
  },
  'agent_session.started': {
    sessionId: OTHER_UUID,
    models: ['default-chat', 'default-embed'],
    capUsd: 2,
    expiresAt: '2026-09-27T23:15:00.000Z',
    via: 'token',
    userId: UUID,
    tokenId: OTHER_UUID,
  },
  'agent_session.narrowed': {
    sessionId: OTHER_UUID,
    withdrawn: ['default-chat', 'default-chat-reasoning', 'default-embed'],
    models: [
      'default-chat-onprem',
      'default-chat-onprem-reasoning',
      'default-chat-large',
    ],
    via: 'session',
    userId: UUID,
    tokenId: null,
  },
  'agent_session.ended': {
    sessionId: OTHER_UUID,
    reason: 'token_revoked',
    via: 'session',
    userId: UUID,
    tokenId: null,
  },
  'sso.deregistered': {
    entityId: 'https://manifest.internal/sp/chem-labs/staging',
  },
  'project.archived': { via: 'session', userId: UUID, tokenId: null },
  'project.restored': { via: 'session', userId: UUID, tokenId: null },
  'project.deleted': { via: 'session', userId: UUID, tokenId: null },
}
