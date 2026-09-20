import { z } from 'zod/v4'
import {
  computeLaunchReadiness,
  getIamRegistration,
  getPrivacyAssessment,
  recordIamRegistration,
  recordPrivacyAssessment,
} from '../../launch/index.js'
import { assertCapability } from '../../projects/index.js'
import { requireSession } from '../actor.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import {
  IamRegistration,
  LaunchReadiness,
  LaunchRecords,
  PrivacyAssessment,
  RecordIamRegistrationRequest,
  RecordPrivacyAssessmentRequest,
  toIamRegistration,
  toPrivacyAssessment,
} from '../representations/launch.js'

/** §22 step 7 (P5a Task 15): what a first production launch still needs. */
export const launchRoutes = [
  defineRoute({
    operationId: 'getLaunchReadiness',
    method: 'GET',
    path: '/v1/projects/{projectId}/launch-readiness',
    tag: 'launch',
    summary: 'What a first production launch still needs',
    description:
      '§13 and §22 step 7: the checklist, computed from what exists, surfaced from the moment a project exists. Read-only in Phase 1.',
    params: z.strictObject({ projectId: z.uuid() }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The checklist.', schema: LaunchReadiness },
    errors: ['NOT_FOUND'],
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
      '§9 and D19. Manifest tracks both; an administrator records what UBC IAM and the Privacy Office said, with the ticket reference. P8 generates what they carry. Either may be absent, which is a state and not an error.',
    params: z.strictObject({ projectId: z.uuid() }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'Both records, either of which may be null.',
      schema: LaunchRecords,
    },
    errors: ['NOT_FOUND'],
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
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/iam-registration',
    tag: 'launch',
    summary: 'Record what UBC IAM registered',
    description:
      '§9, D19 and R1: an administrator records the Service Provider UBC IAM registered, with the ticket reference pasted in. The state is reached along §9’s arrows from wherever the record is, so a first write straight into `active` is refused exactly as a later one is. P8 will submit these programmatically; the object and its states do not change when it does.',
    params: z.strictObject({ projectId: z.uuid() }),
    query: NO_QUERY,
    body: RecordIamRegistrationRequest,
    success: {
      status: 200,
      description: 'The registration as it now stands.',
      schema: IamRegistration,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_TRANSITION_INVALID',
      'LAUNCH_RECORD_INVALID',
    ],
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
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/privacy-assessment',
    tag: 'launch',
    summary: 'Record what the Privacy Office said',
    description:
      '§9, D19 and R1: the same shape as the IAM registration, over §9’s three PIA states. There is deliberately no rejection state — a refused assessment goes back to `draft` with the reviewer’s note, which is what the Privacy Office actually does.',
    params: z.strictObject({ projectId: z.uuid() }),
    query: NO_QUERY,
    body: RecordPrivacyAssessmentRequest,
    success: {
      status: 200,
      description: 'The assessment as it now stands.',
      schema: PrivacyAssessment,
    },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_TRANSITION_INVALID',
    ],
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
]
