import { z } from 'zod/v4'
import {
  computeLaunchReadiness,
  getIamRegistration,
  getPrivacyAssessment,
  recordIamRegistration,
  recordPrivacyAssessment,
  runRehearsal,
} from '../../launch/index.js'
import { assertCapability } from '../../projects/index.js'
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
      '§13 and §22 step 7: the checklist, computed from what exists, surfaced from the moment a project exists — a first launch’s, or once launched the self-serve check, where only a sensitive change needs an administrator (D9). The production deploy is refused with this exact value until every blocking item is met.',
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
          },
          {
            id: 'iam-registration',
            title: 'Registered with UBC IAM',
            owner: 'UBC IAM, recorded by a platform administrator (§9)',
            blocking: true,
            state: 'unmet',
            why: 'Every production app that signs people in with CWL needs its own IAM registration (§9, C4), with a multi-week lead time. Nothing has been recorded for this project yet — an administrator records what UBC IAM said, with the ticket reference.',
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
    summary: 'The IAM registration and the privacy assessment, as recorded',
    description:
      '§9 and D19. Manifest tracks both; an administrator records what UBC IAM and the Privacy Office said, with the ticket reference. Manifest does not yet generate what they carry. Either may be absent, which is a state and not an error.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'Both records, either of which may be null.',
      schema: LaunchRecords,
    },
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: {
      response: {
        projectId: '11303e87-e32a-4264-9191-bc37307c218b',
        iamRegistration: {
          id: '77e7ddc9-7571-4de3-9ba7-6a4372526295',
          projectId: '11303e87-e32a-4264-9191-bc37307c218b',
          entityId: 'https://manifest.internal/sp/iam-pending/production',
          acsUrl: 'https://iam-pending.manifest.internal/auth/ubcshib/callback',
          sloUrl: 'https://iam-pending.manifest.internal/auth/logout',
          certFingerprint: null,
          certExpiresAt: null,
          registeredAttributes: ['ubcEduCwlPuid', 'mail'],
          requestedAttributes: ['ubcEduCwlPuid', 'mail'],
          registeredAt: '2026-09-26T21:48:50.164Z',
          state: 'change_requested',
          externalTicketRef: 'IAM-CR-7',
          updatedAt: '2026-09-26T21:48:50.262Z',
        },
        privacyAssessment: {
          id: '04f0ba9a-51c7-449e-ab08-90969a0d6357',
          projectId: '11303e87-e32a-4264-9191-bc37307c218b',
          state: 'approved',
          reviewer: 'K. Privacy',
          approvedAt: '2026-09-26T21:48:50.173Z',
          externalTicketRef: 'PIA-iam-pending',
          updatedAt: '2026-09-26T21:48:50.173Z',
        },
      },
    },
    handler: async ({ deps, actor, params }) => {
      // READABLE BY THE PROJECT, not only by an administrator: §13 says the checklist is
      // surfaced "the moment a project is created — not at the point the owner asks to go
      // live", and an owner who cannot see whether their PIA is in has no way to chase it.
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return {
        projectId: params.projectId,
        iamRegistration: toIamRegistration(
          await getIamRegistration(deps.db, params.projectId),
        ),
        privacyAssessment: toPrivacyAssessment(
          await getPrivacyAssessment(deps.db, params.projectId),
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
      '§9 and D19: a platform administrator records the Service Provider UBC IAM registered, with the ticket reference pasted in. The state is reached along §9’s arrows from wherever the record is, so a first write straight into `active` is refused exactly as a later one is. **A change request is the registration’s own `change_requested` state**: once UBC has registered the SP, `registeredAttributes`, `acsUrl` and `sloUrl` change only on a record that reaches `active`, the entityID never changes, and what is asked for goes in `requestedAttributes` — required when filing one from `active` (`LAUNCH_RECORD_INVALID` otherwise). A later Manifest release will submit these itself; the object and its states will not change when it does.',
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
      return toIamRegistration(
        await recordIamRegistration(deps.db, deps.bus, {
          projectId: params.projectId,
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
        }),
      )
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
      '§9 and D19: a platform administrator records it, in the same shape as the IAM registration, over §9’s three PIA states. There is deliberately no rejection state — a refused assessment goes back to `draft` with the reviewer’s note, which is what the Privacy Office actually does.',
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
        updatedAt: '2026-09-26T21:47:36.002Z',
      },
    },
    handler: async ({ deps, request, params, body }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      return toPrivacyAssessment(
        await recordPrivacyAssessment(deps.db, deps.bus, {
          projectId: params.projectId,
          state: body.state,
          reviewer: body.reviewer,
          externalTicketRef: body.externalTicketRef,
          actor: { id: actor.userId, puid: actor.puid },
        }),
      )
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
      'D21, run on this platform: deploys the candidate release into production behind the gate, registers its Service Provider with production-shaped values, completes one CWL sign-in and records pass or fail with the evidence. It proves the registration’s SHAPE, never UBC’s acceptance of it. **Who may run it:** the project’s owner, a collaborator or a platform administrator, each in their own signed-in session and with no second sign-in — never a delegated token (`403 TOKEN_CREDENTIAL_REFUSED`, whatever the token holds); anyone else is told the project does not exist (`404 NOT_FOUND`). Refused once the app has launched (`REHEARSAL_LAUNCHED`): after launch it would put an unapproved candidate on the live listener. Up to ~90 s.',
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
      'REHEARSAL_NO_CANDIDATE',
      'REHEARSAL_NOT_CWL',
      'REHEARSAL_DEPLOY_FAILED',
      'REHEARSAL_LAUNCHED',
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
      /**
       * FE-36 AFTER THE REHEARSAL'S PRODUCTION DEPLOY (the whole-branch review's I2), as the
       * `deploy` route runs it after a production deploy: a rehearsal's instance is what
       * production's route then serves, and `classificationFloor` floors every agent session by
       * that release — so the rehearsal may have RAISED the classification, and every session
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
