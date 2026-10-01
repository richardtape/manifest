import { z } from 'zod/v4'
import {
  computeLaunchReadiness,
  getIamRegistration,
  getPrivacyAssessment,
  recordIamRegistration,
  recordPrivacyAssessment,
  runRehearsal,
  submitIamRegistration,
  submitPrivacyAssessment,
  submitterOf,
} from '../../launch/index.js'
import { assertCapability, assertStepUp } from '../../projects/index.js'
import { requireSession } from '../actor.js'
import { withdrawWhatItNoLongerAllows } from '../spec-validation.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import {
  IamRegistration,
  LaunchReadiness,
  LaunchRecords,
  PrivacyAssessment,
  RecordIamRegistrationRequest,
  RecordPrivacyAssessmentRequest,
  Rehearsal,
  SubmitLaunchRecordRequest,
  toIamRegistration,
  toPrivacyAssessment,
  toRehearsal,
} from '../representations/launch.js'

/** §22 step 7 (P5a Task 15): what a first production launch still needs. */
export const launchRoutes = [
  defineRoute({
    operationId: 'getLaunchReadiness',
    method: 'GET',
    path: '/v1/projects/{projectId}/launch-readiness',
    tag: 'launch',
    summary: 'What a production release still needs',
    description:
      'The launch checklist, computed from what exists now: the first launch’s, or once launched the self-serve check, where only a sensitive change needs an administrator’s approval. A production `deploy` is refused with this value until every blocking item is met.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The checklist.', schema: LaunchReadiness },
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        projectId: 'bd8dfbcc-4c37-4e7d-ab4b-4e1ce0c032e6',
        launched: false,
        ready: false,
        candidateReleaseId: null,
        baselineReleaseId: null,
        sensitiveFields: [],
        reescalated: false,
        items: [
          {
            id: 'domain',
            title: 'Where the app will live',
            owner: 'project owner',
            blocking: true,
            state: 'met',
            why: 'Canonical hostname only — no action. A custom domain is Phase 2 (§23), and for a CWL app it must be chosen before IAM registration, because the registration carries it.',
            since: null,
          },
          {
            id: 'iam-registration',
            title: 'Registered with UBC IAM',
            owner: 'UBC IAM, recorded by a platform administrator (§9)',
            blocking: true,
            state: 'unmet',
            why: "It was sent to UBC IAM on October 14, 2026. The registration is 'submitted' (ticket IAM-2026-0500) and must be 'active' before a first production launch.",
            since: '2026-10-14T19:00:00.000Z',
          },
        ],
      },
    },
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return computeLaunchReadiness(deps.db, params.projectId)
    },
  }),
  defineRoute({
    operationId: 'getLaunchRecords',
    method: 'GET',
    path: '/v1/projects/{projectId}/launch-records',
    tag: 'launch',
    summary: 'The privacy assessment and the two IAM registrations',
    description:
      'The three records a first production launch waits on — the privacy assessment, the staging registration and the production registration — each with when a person said it was sent and what UBC said, as a platform administrator recorded it. Any may be absent: a state, not an error.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The three records, any of which may be null.',
      schema: LaunchRecords,
    },
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        projectId: '11303e87-e32a-4264-9191-bc37307c218b',
        iamRegistration: {
          id: '5d2b0c1e-9a3f-4d7e-8b21-6c0f9e4a7d13',
          projectId: '11303e87-e32a-4264-9191-bc37307c218b',
          environment: 'production',
          entityId: 'https://manifest.internal/sp/class-check-ins/production',
          acsUrl: 'https://class-check-ins.manifest.internal/auth/ubcshib/callback',
          sloUrl: 'https://class-check-ins.manifest.internal/auth/logout',
          certFingerprint: null,
          certExpiresAt: null,
          registeredAttributes: [],
          requestedAttributes: null,
          registeredAt: null,
          state: 'submitted',
          externalTicketRef: 'IAM-2026-0500',
          submittedAt: '2026-10-14T19:00:00.000Z',
          submittedBy: {
            id: 'a0b7c3d2-5e6f-4a1b-9c8d-7e6f5a4b3c2d',
            displayName: 'Bio Prof',
          },
          createdAt: '2026-10-09T17:22:41.508Z',
          updatedAt: '2026-10-14T18:03:12.117Z',
        },
        stagingRegistration: {
          id: '77e7ddc9-7571-4de3-9ba7-6a4372526295',
          projectId: '11303e87-e32a-4264-9191-bc37307c218b',
          environment: 'staging',
          entityId: 'https://manifest.internal/sp/class-check-ins/staging',
          acsUrl:
            'https://class-check-ins.staging.manifest.internal/auth/ubcshib/callback',
          sloUrl: 'https://class-check-ins.staging.manifest.internal/auth/logout',
          certFingerprint: null,
          certExpiresAt: null,
          registeredAttributes: ['ubcEduCwlPuid', 'mail'],
          requestedAttributes: null,
          registeredAt: '2026-10-07T21:48:50.164Z',
          state: 'active',
          externalTicketRef: 'IAM-2026-0480',
          submittedAt: '2026-09-29T19:00:00.000Z',
          submittedBy: {
            id: 'a0b7c3d2-5e6f-4a1b-9c8d-7e6f5a4b3c2d',
            displayName: 'Bio Prof',
          },
          createdAt: '2026-09-28T16:10:05.902Z',
          updatedAt: '2026-10-07T21:48:50.164Z',
        },
        privacyAssessment: {
          id: '04f0ba9a-51c7-449e-ab08-90969a0d6357',
          projectId: '11303e87-e32a-4264-9191-bc37307c218b',
          state: 'approved',
          reviewer: 'K. Privacy',
          approvedAt: '2026-09-26T21:48:50.173Z',
          externalTicketRef: 'PIA-2026-0088',
          submittedAt: '2026-09-15T19:00:00.000Z',
          submittedBy: {
            id: 'a0b7c3d2-5e6f-4a1b-9c8d-7e6f5a4b3c2d',
            displayName: 'Bio Prof',
          },
          createdAt: '2026-09-14T20:31:16.044Z',
          updatedAt: '2026-09-26T21:48:50.173Z',
        },
      },
    },
    handler: async ({ deps, actor, params }) => {
      // READABLE BY THE PROJECT, not only by an administrator: §13 says the checklist is
      // surfaced "the moment a project is created — not at the point the owner asks to go
      // live", and an owner who cannot see whether their PIA is in has no way to chase it.
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const [production, staging, pia] = await Promise.all([
        getIamRegistration(deps.db, params.projectId, 'production'),
        getIamRegistration(deps.db, params.projectId, 'staging'),
        getPrivacyAssessment(deps.db, params.projectId),
      ])
      return {
        projectId: params.projectId,
        iamRegistration: toIamRegistration(
          production,
          await submitterOf(deps.db, production?.submittedBy ?? null),
        ),
        stagingRegistration: toIamRegistration(
          staging,
          await submitterOf(deps.db, staging?.submittedBy ?? null),
        ),
        privacyAssessment: toPrivacyAssessment(
          pia,
          await submitterOf(deps.db, pia?.submittedBy ?? null),
        ),
      }
    },
  }),
  defineRoute({
    operationId: 'recordIamRegistration',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/iam-registration',
    tag: 'launch',
    summary: 'Record what UBC IAM registered',
    description:
      'A platform administrator, in their own session, records the Service Provider registration UBC IAM made — the staging registration or production’s (`environment`, production’s when absent) — with its ticket reference. The state moves only along the allowed transitions from `draft` — any other move, a first write straight into `active` included, is `409 LAUNCH_TRANSITION_INVALID`, naming the moves allowed. A change request is the `change_requested` state, and `requestedAttributes` — required when filing from `active` (`LAUNCH_RECORD_INVALID` otherwise) — says what it asks for. Once UBC has registered the SP, the entity ID never changes, and `registeredAttributes`, `acsUrl` and `sloUrl` change only on a write that reaches `active`. UBC’s answer is recorded whatever order it arrives in: this is never refused for the order the requests are sent in.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: RecordIamRegistrationRequest,
    success: {
      status: 200,
      description: 'The registration as it now stands.',
      schema: IamRegistration,
    },
    capability: 'launch:record',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_TRANSITION_INVALID',
      'LAUNCH_RECORD_INVALID',
    ],
    examples: {
      request: {
        entityId: 'https://manifest.internal/sp/iam-granted/production',
        acsUrl: 'https://iam-granted.manifest.internal/auth/ubcshib/callback',
        sloUrl: 'https://iam-granted.manifest.internal/auth/logout',
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
        requestedAttributes: ['ubcEduCwlPuid', 'mail'],
        state: 'change_requested',
        externalTicketRef: 'IAM-iam-granted',
      },
      response: {
        id: '62169b5f-1961-406a-8ad3-f5de46143c6f',
        projectId: '9aa37d53-038d-4e78-9270-01c2ea085d21',
        environment: 'production',
        entityId: 'https://manifest.internal/sp/iam-granted/production',
        acsUrl: 'https://iam-granted.manifest.internal/auth/ubcshib/callback',
        sloUrl: 'https://iam-granted.manifest.internal/auth/logout',
        certFingerprint: null,
        certExpiresAt: null,
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
        requestedAttributes: ['ubcEduCwlPuid', 'mail'],
        registeredAt: '2026-09-26T21:48:52.716Z',
        state: 'change_requested',
        externalTicketRef: 'IAM-iam-granted',
        submittedAt: '2026-09-26T21:48:52.796Z',
        submittedBy: {
          id: '3f9e1c2b-7d4a-4e8f-a6b5-0c1d2e3f4a5b',
          displayName: 'Platform Admin',
        },
        createdAt: '2026-09-26T21:48:52.611Z',
        updatedAt: '2026-09-26T21:48:52.796Z',
      },
    },
    handler: async ({ deps, request, params, body }) => {
      // D14 and Decision 4: an administrator, in a browser. `requireSession`'s RETURN TYPE
      // is the enforcement — reverting this line does not weaken a check, it stops
      // compiling, because `assertCapability` below needs the `Actor` it returns.
      //
      // IT RUNS FIRST, BEFORE THE CAPABILITY AND BEFORE THE PROJECT IS READ. That order is
      // the reason all four token actors are answered TOKEN_CREDENTIAL_REFUSED and not one
      // of them `404`: the answer is the same for every project id, so a token learns
      // nothing about which projects exist (P6a Task 6, and the plan's own matrix row for
      // `token-other-project` said 404).
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      const row = await recordIamRegistration(deps.db, deps.bus, {
        projectId: params.projectId,
        environment: body.environment,
        entityId: body.entityId,
        acsUrl: body.acsUrl,
        sloUrl: body.sloUrl,
        registeredAttributes: body.registeredAttributes,
        requestedAttributes: body.requestedAttributes,
        state: body.state,
        externalTicketRef: body.externalTicketRef,
        certFingerprint: body.certFingerprint,
        certExpiresAt:
          body.certExpiresAt === undefined ? undefined : new Date(body.certExpiresAt),
        actor: { id: actor.userId, puid: actor.puid },
      })
      return toIamRegistration(row, await submitterOf(deps.db, row.submittedBy))
    },
  }),
  defineRoute({
    operationId: 'recordPrivacyAssessment',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/privacy-assessment',
    tag: 'launch',
    summary: 'Record what the Privacy Office said',
    description:
      'A platform administrator, in their own session, records the Privacy Office’s assessment, shaped like the IAM registration, over the states `draft`, `submitted` and `approved` (`409 LAUNCH_TRANSITION_INVALID` for a move they do not allow). A refused assessment goes back to `draft` with the reviewer’s note.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: RecordPrivacyAssessmentRequest,
    success: {
      status: 200,
      description: 'The assessment as it now stands.',
      schema: PrivacyAssessment,
    },
    capability: 'launch:record',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_TRANSITION_INVALID',
    ],
    examples: {
      request: {
        state: 'approved',
        reviewer: 'K. Privacy',
        externalTicketRef: 'PIA-DELIVERY-1',
      },
      response: {
        id: '678fa833-25a5-4ddc-8f32-329d262e6c67',
        projectId: 'ed493bf0-5ff3-4f03-bfa2-ea7b7b53730f',
        state: 'approved',
        reviewer: 'K. Privacy',
        approvedAt: '2026-09-26T21:47:36.002Z',
        externalTicketRef: 'PIA-DELIVERY-1',
        submittedAt: '2026-09-26T21:47:35.912Z',
        submittedBy: {
          id: '3f9e1c2b-7d4a-4e8f-a6b5-0c1d2e3f4a5b',
          displayName: 'Platform Admin',
        },
        createdAt: '2026-09-26T21:47:35.912Z',
        updatedAt: '2026-09-26T21:47:36.002Z',
      },
    },
    handler: async ({ deps, request, params, body }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      const row = await recordPrivacyAssessment(deps.db, deps.bus, {
        projectId: params.projectId,
        state: body.state,
        reviewer: body.reviewer,
        externalTicketRef: body.externalTicketRef,
        actor: { id: actor.userId, puid: actor.puid },
      })
      return toPrivacyAssessment(row, await submitterOf(deps.db, row.submittedBy))
    },
  }),
  defineRoute({
    operationId: 'submitIamRegistration',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/submission',
    tag: 'launch',
    summary: 'Say a registration request was sent to UBC IAM',
    description:
      'The project’s owner, a collaborator or a platform administrator, in their own session, says the staging or production registration was sent to UBC IAM — on `sentAt` (today in Vancouver when absent), with UBC’s `reference` when they have one. The record moves to `submitted`, and the launch checklist and the record say how long it has waited from that day. What is sent is Manifest’s draft, so a record with none is `409 LAUNCH_DRAFT_REQUIRED`. UBC works in an order: the staging registration is sent only once the privacy assessment is approved with its PIA number (`409 LAUNCH_PIA_NOT_APPROVED`), and production’s only once staging’s is active (`409 LAUNCH_STAGING_NOT_REGISTERED`). It is sent from a draft, after UBC asked for changes, or once it lapsed — a second submission is `409 LAUNCH_TRANSITION_INVALID`. UBC’s answer is recorded by an administrator (`recordIamRegistration`). A delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`; anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({
      projectId: PATH.projectId,
      environment: z
        .enum(['staging', 'production'])
        .describe('Which registration was sent: `staging` or `production`.'),
    }),
    query: NO_QUERY,
    body: SubmitLaunchRecordRequest,
    success: {
      status: 200,
      description: 'The registration, now submitted.',
      schema: IamRegistration,
    },
    capability: 'launch:submit',
    // NO `FORBIDDEN`: every role that can see the project holds `launch:submit`, a stranger is
    // `NOT_FOUND`, and a token is refused first.
    errors: [
      'NOT_FOUND',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_DRAFT_REQUIRED',
      'LAUNCH_TRANSITION_INVALID',
      'LAUNCH_PIA_NOT_APPROVED',
      'LAUNCH_STAGING_NOT_REGISTERED',
      'LAUNCH_SENT_AT_INVALID',
    ],
    examples: {
      request: { sentAt: '2026-10-14', reference: 'IAM-2026-0500' },
      response: {
        id: '5d2b0c1e-9a3f-4d7e-8b21-6c0f9e4a7d13',
        projectId: '11303e87-e32a-4264-9191-bc37307c218b',
        environment: 'production',
        entityId: 'https://manifest.internal/sp/class-check-ins/production',
        acsUrl: 'https://class-check-ins.manifest.internal/auth/ubcshib/callback',
        sloUrl: 'https://class-check-ins.manifest.internal/auth/logout',
        certFingerprint: null,
        certExpiresAt: null,
        registeredAttributes: [],
        requestedAttributes: null,
        registeredAt: null,
        state: 'submitted',
        externalTicketRef: 'IAM-2026-0500',
        submittedAt: '2026-10-14T19:00:00.000Z',
        submittedBy: {
          id: 'a0b7c3d2-5e6f-4a1b-9c8d-7e6f5a4b3c2d',
          displayName: 'Bio Prof',
        },
        createdAt: '2026-10-09T17:22:41.508Z',
        updatedAt: '2026-10-14T18:03:12.117Z',
      },
    },
    handler: async ({ deps, request, params, body }) => {
      // A PERSON, in their own session (D24: *"saying that a request to either was sent"*).
      // `requireSession` first, so a token is answered the same for every project id and learns
      // nothing; the central rule refuses a token holding `launch:submit` whatever this line does.
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:submit')
      const row = await submitIamRegistration(deps.db, deps.bus, {
        projectId: params.projectId,
        environment: params.environment,
        actor: { id: actor.userId, puid: actor.puid },
        sentAt: body.sentAt,
        reference: body.reference,
      })
      return toIamRegistration(row, await submitterOf(deps.db, row.submittedBy))
    },
  }),
  defineRoute({
    operationId: 'submitPrivacyAssessment',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/privacy-assessment/submission',
    tag: 'launch',
    summary: 'Say the privacy assessment was sent to the Privacy Office',
    description:
      'The project’s owner, a collaborator or a platform administrator, in their own session, says the privacy impact assessment was sent to UBC’s Privacy Office — on `sentAt` (today in Vancouver when absent), with the Office’s `reference` when they have one. It comes first in UBC’s order, so nothing else gates it. The record moves to `submitted`, and the launch checklist says how long it has waited from that day. What is sent is Manifest’s draft, so a record with none is `409 LAUNCH_DRAFT_REQUIRED`, and a second submission is `409 LAUNCH_TRANSITION_INVALID`. The Office’s answer is recorded by an administrator (`recordPrivacyAssessment`). A delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`; anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: SubmitLaunchRecordRequest,
    success: {
      status: 200,
      description: 'The assessment, now submitted.',
      schema: PrivacyAssessment,
    },
    capability: 'launch:submit',
    errors: [
      'NOT_FOUND',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_DRAFT_REQUIRED',
      'LAUNCH_TRANSITION_INVALID',
      'LAUNCH_SENT_AT_INVALID',
    ],
    examples: {
      request: { sentAt: '2026-09-15', reference: 'PIA-2026-0088' },
      response: {
        id: '04f0ba9a-51c7-449e-ab08-90969a0d6357',
        projectId: '11303e87-e32a-4264-9191-bc37307c218b',
        state: 'submitted',
        reviewer: null,
        approvedAt: null,
        externalTicketRef: 'PIA-2026-0088',
        submittedAt: '2026-09-15T19:00:00.000Z',
        submittedBy: {
          id: 'a0b7c3d2-5e6f-4a1b-9c8d-7e6f5a4b3c2d',
          displayName: 'Bio Prof',
        },
        createdAt: '2026-09-14T20:31:16.044Z',
        updatedAt: '2026-09-15T17:40:09.330Z',
      },
    },
    handler: async ({ deps, request, params, body }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:submit')
      const row = await submitPrivacyAssessment(deps.db, deps.bus, {
        projectId: params.projectId,
        actor: { id: actor.userId, puid: actor.puid },
        sentAt: body.sentAt,
        reference: body.reference,
      })
      return toPrivacyAssessment(row, await submitterOf(deps.db, row.submittedBy))
    },
  }),
  defineRoute({
    operationId: 'runRehearsal',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/rehearsal',
    tag: 'launch',
    summary: 'Run the pre-production rehearsal',
    description:
      'Deploys the candidate release to production, registers its Service Provider with production-shaped values and completes one CWL sign-in, then takes the deployment down again and records pass or fail with the evidence — proving the registration’s shape, not UBC’s acceptance of it. The candidate answers production’s hostname on the public listener only while the sign-in runs; afterwards the hostname reaches nothing of the app’s, and production’s environment reads the rehearsal’s instance as `gone` (or `failed`, when the candidate never started). The owner, a collaborator or a platform administrator runs it in their own session, after a second sign-in (step-up) in the last ten minutes, or is refused `403 STEP_UP_REQUIRED`; a delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`, and anyone else is answered `404 NOT_FOUND`. One rehearsal of a project runs at a time (`REHEARSAL_RUNNING`), and none once the app has launched (`REHEARSAL_LAUNCHED`). If the deployment cannot be taken down, nothing is recorded and the answer is `500 REHEARSAL_TEARDOWN_FAILED`; running it again is the remedy. Up to ~90 s.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description:
        'The rehearsal, passed or failed. A failure is a 200 with `passed: false` and the reason in its evidence — it is a MEASUREMENT, and a measurement that came out badly is not a request error.',
      schema: Rehearsal,
    },
    capability: 'launch:rehearse',
    // NO `FORBIDDEN` SINCE TASK 6b: every role that can see the project holds `launch:rehearse`
    // (owner, collaborator, administrator), a stranger is `NOT_FOUND` and a token is refused
    // first, so no request can be answered it — and a declared code nothing answers is a
    // document that lies (`authz-contract.ts`'s archived measurement's rule).
    errors: [
      'NOT_FOUND',
      'TOKEN_CREDENTIAL_REFUSED',
      // §20, since Spec action 8 (b) — the launch path plan's Task 6c.
      'STEP_UP_REQUIRED',
      'REHEARSAL_NO_CANDIDATE',
      'REHEARSAL_NOT_CWL',
      'REHEARSAL_DEPLOY_FAILED',
      'REHEARSAL_LAUNCHED',
      // FE-43 and Spec action 8 (c) — Task 6c.
      'REHEARSAL_RUNNING',
      'REHEARSAL_TEARDOWN_FAILED',
      'RELEASE_DIGEST_MISSING',
    ],
    examples: {
      response: {
        id: 'eecbc16e-6428-4600-baf3-62b93200de80',
        projectId: '11303e87-e32a-4264-9191-bc37307c218b',
        releaseId: 'beefa3d6-c695-47e7-a632-ace8f5bd702a',
        passed: true,
        entityId: 'https://manifest.internal/sp/iam-pending/production',
        acsUrl: 'https://iam-pending.manifest.internal/auth/ubcshib/callback',
        attributes: ['ubcEduCwlPuid', 'mail'],
        evidence: {
          instanceId: '6ac3e6d7-3080-4c70-8af6-376e447829f6',
          hostname: 'iam-pending.manifest.internal',
          listener: 'public',
          signInStatus: 302,
          attributesReleased: ['ubcEduCwlPuid', 'mail'],
          reason: 'the unit tier’s labelled fake released exactly what was registered',
        },
        ranAt: '2026-09-26T21:48:50.190Z',
      },
    },
    handler: async ({ deps, request, params }) => {
      // A PERSON, in their own session — the owner, a collaborator or an administrator since the
      // launch path plan's Task 6b (FE-42, Rich's option (a)); an administrator alone before it
      // (D14, P6a Decision 4). `requireSession`'s RETURN TYPE is the enforcement, because
      // `runRehearsal` needs the `puid` it returns, and it runs BEFORE the project is read so a
      // token learns nothing about which projects exist (P6a Task 6's measured ordering).
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:rehearse')
      // §20's STEP-UP, since Spec action 8 (b) — the launch path plan's Task 6c: the rehearsal puts
      // an unapproved release on production's public listener while its sign-in runs, and a stolen
      // session alone must not be enough to do that. AFTER the capability, so a stranger is still
      // `404` and learns nothing; BEFORE anything is read or deployed.
      assertStepUp(actor, 'launch:rehearse')
      /**
       * FE-36 AFTER THE REHEARSAL'S PRODUCTION DEPLOY (the whole-branch review's I2), as the
       * `deploy` route runs it after a production deploy: a rehearsal's instance is what production
       * reads as its instance — serving while the sign-in ran, then `gone` after the take-down, which
       * `servingInstanceOf` still falls back to (the launch path plan's Task 6c, Decision 4) — and
       * `classificationFloor` floors every agent session by that release. So the rehearsal may have
       * RAISED the classification, and every session
       * holding what the project no longer allows is ended before this answers. In `finally`,
       * because the deploy may have landed although the rehearsal then failed (a registration it
       * could not read back, a sign-in that threw); on a rehearsal refused before its deploy the
       * sweep finds nothing to end. Never a refusal: `withdrawWhatItNoLongerAllows` writes an
       * operator line and the next boot's sweep ends what is left.
       */
      try {
        return toRehearsal(
          await runRehearsal(
            {
              db: deps.db,
              driver: deps.driver,
              config: deps.config,
              // THE SAME OBJECT THE DEPLOY ROUTE BUILDS, held equal by `tsc` rather than by
              // memory: `DeployDeps` gaining a field turns both call sites red.
              deploy: {
                secrets: deps.secrets,
                appSecrets: deps.appSecrets,
                sso: deps.sso,
                blueprints: deps.blueprints,
                ai: deps.ai,
                catalogue: deps.catalogue,
                bus: deps.bus,
                retirer: deps.retirer,
              },
              signIn: deps.signIn,
              bus: deps.bus,
            },
            params.projectId,
            { userId: actor.userId, puid: actor.puid },
          ),
        )
      } finally {
        await withdrawWhatItNoLongerAllows(deps, params.projectId, 'a rehearsal')
      }
    },
  }),
]
