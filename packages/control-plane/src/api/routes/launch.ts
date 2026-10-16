import { z } from 'zod/v4'
import {
  computeLaunchReadiness,
  draftIamRegistration,
  draftPrivacyAssessment,
  getIamRegistration,
  getPrivacyAssessment,
  loadRehearsalById,
  loadRehearsalsOf,
  recordAssessmentSubmission,
  recordIamRegistration,
  recordIamSubmission,
  recordPrivacyAssessment,
  returnIamRegistration,
  returnPrivacyAssessment,
  runRehearsal,
  sendIamRegistration,
  sendPrivacyAssessment,
  submitterOf,
} from '../../launch/index.js'
import type { Db } from '../../db/index.js'
import {
  assertCapability,
  assertStepUp,
  AuthorizationError,
} from '../../projects/index.js'
import { requireSession } from '../actor.js'
import { withdrawWhatItNoLongerAllows } from '../spec-validation.js'
import { defineRoute, NO_BODY, NO_QUERY } from '../contract/route.js'
import { PATH } from '../contract/schemas.js'
import {
  ASSESSMENT_APPROVED_EXAMPLE,
  ASSESSMENT_DRAFTED_EXAMPLE,
  ASSESSMENT_RETURNED_EXAMPLE,
  ASSESSMENT_SEND_REQUEST_EXAMPLE,
  ASSESSMENT_SENT_EXAMPLE,
  ASSESSMENT_SUBMIT_REQUEST_EXAMPLE,
  ASSESSMENT_SUBMITTED_EXAMPLE,
  DRAFTED_EXAMPLE,
  RECORDS_EXAMPLE,
  RETURNED_EXAMPLE,
  SEND_REQUEST_EXAMPLE,
  SENT_EXAMPLE,
  SUBMITTED_EXAMPLE,
  TEAM_SUBMISSION_REQUEST_EXAMPLE,
} from './launch-examples.js'
import {
  IamRegistration,
  LaunchReadiness,
  LaunchRecords,
  LoadRehearsal,
  LoadRehearsalList,
  PrivacyAssessment,
  RecordIamRegistrationRequest,
  RecordPrivacyAssessmentRequest,
  RecordSubmissionRequest,
  Rehearsal,
  SendLaunchRecordRequest,
  SendPrivacyAssessmentRequest,
  toIamRegistration,
  toLoadRehearsal,
  toPrivacyAssessment,
  toRehearsal,
  type RecordPeople,
} from '../representations/launch.js'

/** Who a record names, by name: who last sent it to the Manifest team, and who recorded it with UBC. */
async function peopleOf(
  db: Db,
  row: { sentBy: string | null; submittedBy: string | null } | undefined,
): Promise<RecordPeople> {
  return {
    sentBy: await submitterOf(db, row?.sentBy ?? null),
    submittedBy: await submitterOf(db, row?.submittedBy ?? null),
  }
}

/** Which registration a route acts on: `staging` or `production`, in its path. */
const ENVIRONMENT = (what: string) =>
  z
    .enum(['staging', 'production'])
    .describe(`Which registration ${what}: \`staging\` or \`production\`.`)

/** One load rehearsal, as `getLoadRehearsal` answers a finished one — the document's example. */
const LOAD_REHEARSAL_EXAMPLE = {
  id: '0d5b6f4e-8c1a-4e7b-9a2d-3f6c1b8e4a90',
  projectId: '11303e87-e32a-4264-9191-bc37307c218b',
  releaseId: 'beefa3d6-c695-47e7-a632-ace8f5bd702a',
  state: 'passed' as const,
  audience: { scale: 'large_course' as const, burst: 'synchronised' as const },
  profile: {
    phases: [
      { name: 'arrive', rps: 75, seconds: 60 },
      { name: 'sustain', rps: 50, seconds: 300 },
    ],
    paths: ['/', '/healthz', '/login'],
    timeoutMs: 10000,
    pass: { answeredRatio: 0.99, p95Ms: 2000, achievedRatio: 0.9 },
  },
  granted: {
    count: 3,
    instanceIds: [
      '6ac3e6d7-3080-4c70-8af6-376e447829f6',
      '7bd4f7e8-4191-4d81-9b07-487f558930a7',
      '8ce508f9-52a2-4e92-8c18-598066904ab8',
    ],
    resources: { environment: 'production' as const, cpu: 0.5, memory: '512Mi' },
  },
  evidence: {
    reason:
      '100% of requests answered, p95 0.01 s, at 54.2 requests a second; every instance stayed healthy',
    requests: 19500,
    answered: 19500,
    answeredRatio: 1,
    timeouts: 0,
    achievedRps: 54.2,
    p50Ms: 1.8,
    p95Ms: 12.4,
    p99Ms: 14.5,
    durationMs: 360000,
    phases: [
      { name: 'arrive', asked: 75, achieved: 75.02, requests: 4500, answered: 4500 },
      { name: 'sustain', asked: 50, achieved: 50, requests: 15000, answered: 15000 },
    ],
    byPath: {
      '/': { '200': 6500 },
      '/healthz': { '200': 6500 },
      '/login': { '302': 6500 },
    },
    instanceExits: 0,
    outOfMemory: false,
    unhealthy: false,
  },
  runBy: '5604d74f-590f-41e9-a34f-75d343aec6f6',
  createdAt: '2026-10-15T23:56:41.000Z',
  finishedAt: '2026-10-16T00:02:48.000Z',
  takenDownAt: '2026-10-16T00:02:48.000Z',
  pollAfterSeconds: null,
}

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
        projectId: '5604d74f-590f-41e9-a34f-75d343aec6f6',
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
            why: 'Canonical hostname only — no action. A custom domain is not offered yet, and for a CWL app one must be chosen before IAM registration, because the registration carries it.',
            since: null,
          },
          {
            id: 'iam-registration',
            title: 'Registered with UBC IAM',
            owner: 'UBC IAM, through the Manifest team',
            blocking: true,
            state: 'unmet',
            why: "It was sent to UBC IAM on September 30, 2026. The registration is 'submitted' (ticket IAM-2026-0500) and must be 'active' before a first production launch.",
            since: '2026-09-30T19:00:00.000Z',
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
      'The three records a first production launch waits on — the privacy assessment, the staging registration and the production registration — each with when its owner sent it to the Manifest team, when the team submitted it to UBC, and what UBC said, as a platform administrator recorded it. Any may be absent: a state, not an error.',
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
    examples: { response: RECORDS_EXAMPLE },
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
          await peopleOf(deps.db, production),
        ),
        stagingRegistration: toIamRegistration(staging, await peopleOf(deps.db, staging)),
        privacyAssessment: toPrivacyAssessment(pia, await peopleOf(deps.db, pia)),
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
      'A platform administrator, in their own session, records the Service Provider registration UBC IAM made — the staging registration or production’s (`environment`, production’s when absent) — with its ticket reference. The state moves only along the allowed transitions from `draft` — any other move, a first write straight into `active` included, is `409 LAUNCH_TRANSITION_INVALID`, naming the moves allowed. A change request is the `change_requested` state, and `requestedAttributes` — required when filing from `active` (`LAUNCH_RECORD_INVALID` otherwise) — says what it asks for. Once UBC has registered the SP, the entity ID never changes, and `registeredAttributes`, `acsUrl` and `sloUrl` change only on a write that reaches `active`. UBC’s answer is recorded whatever order it arrives in: this is never refused for the order the requests are sent in. A registration with the Manifest team (`sent`) is not recorded here — `409 LAUNCH_TRANSITION_INVALID`, naming the team’s own two operations, `submitIamRegistration` and `returnIamRegistration` — and only its owner’s `sendIamRegistration` puts one there.',
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
        entityId: 'https://manifest.internal/sp/fixture/production',
        acsUrl: 'https://fixture.production.manifest.internal/auth/ubcshib/callback',
        sloUrl: 'https://fixture.production.manifest.internal/auth/logout',
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
        state: 'submitted',
        externalTicketRef: 'IAM-1',
      },
      response: {
        id: 'af154ce9-c826-4ebe-aece-fde843b1ecbe',
        projectId: '4282b668-6e36-42ec-8083-9ab697e04732',
        environment: 'production',
        entityId: 'https://manifest.internal/sp/fixture/production',
        acsUrl: 'https://fixture.production.manifest.internal/auth/ubcshib/callback',
        sloUrl: 'https://fixture.production.manifest.internal/auth/logout',
        certFingerprint: null,
        certExpiresAt: null,
        registeredAttributes: ['ubcEduCwlPuid', 'mail'],
        requestedAttributes: null,
        registeredAt: null,
        state: 'submitted',
        changeRequestedFrom: null,
        externalTicketRef: 'IAM-1',
        sentFrom: null,
        sentAt: null,
        sentBy: null,
        submittedAt: '2026-10-01T06:56:08.961Z',
        submittedBy: {
          id: '7cdb83c7-6a58-49e2-a8a8-0f480232ed6d',
          displayName: 'Platform Admin',
        },
        package: null,
        createdAt: '2026-10-01T06:56:08.960Z',
        updatedAt: '2026-10-01T06:56:08.960Z',
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
      return toIamRegistration(row, await peopleOf(deps.db, row))
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
      'A platform administrator, in their own session, records the Privacy Office’s assessment, shaped like the IAM registration, over the states `draft`, `submitted` and `approved` (`409 LAUNCH_TRANSITION_INVALID` for a move they do not allow). A refused assessment goes back to `draft` with the reviewer’s note. An assessment with the Manifest team (`sent`) is not recorded here: the team submits it (`submitPrivacyAssessment`) or hands it back (`returnPrivacyAssessment`).',
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
      request: { state: 'approved', reviewer: 'K. Privacy' },
      response: ASSESSMENT_APPROVED_EXAMPLE,
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
      return toPrivacyAssessment(row, await peopleOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'draftIamRegistration',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/draft',
    tag: 'launch',
    summary: 'Draft a registration request for UBC IAM',
    description:
      'Manifest generates what the project’s owner sends UBC IAM to register the staging or production environment of an app that signs people in with CWL, and keeps it on the record as `package`: the entity ID and the sign-in and sign-out addresses for that environment; the certificate the app signs with there (never its private key, which stays with Manifest); every attribute the app asks for, with its purpose and the lines of the app’s code that read it; the contacts; the privacy assessment’s PIA number once it is approved; and the SAML metadata, built from the same values. An attribute nothing reads is flagged, so it can be removed before it is asked for. Production’s is drawn from the release serving staging — or, while nothing serves staging, from the newest valid manifest, and the package says so — and staging’s from the newest valid manifest. Drafting again replaces the draft until it is sent: once the registration is with the Manifest team (`sent`), `submitted`, or holds a change request the team filed with UBC IAM, what was sent is kept and drafting is `409 LAUNCH_RECORD_SUBMITTED` — until the team hands it back, UBC IAM answers, or the registration lapses. **A registration UBC registered (`active`) is drafted again as a change**, from the newest valid manifest, whichever environment — that is where the change is being made — and the package says so; the record keeps what UBC registered. An app that signs nobody in with CWL, or asks for no attribute, is `409 LAUNCH_NOT_CWL`. The project’s owner, a collaborator, a platform administrator, or an agent on a token holding `launch:draft`, may draft — a draft sends nothing and decides nothing. Sending it to the Manifest team is `sendIamRegistration`.',
    params: z.strictObject({
      projectId: PATH.projectId,
      environment: z
        .enum(['staging', 'production'])
        .describe('Which registration to draft: `staging` or `production`.'),
    }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The registration, with its new draft in `package`.',
      schema: IamRegistration,
    },
    capability: 'launch:draft',
    examples: { response: DRAFTED_EXAMPLE },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'LAUNCH_RECORD_SUBMITTED',
      'LAUNCH_NOT_CWL',
      // Reading the app's code at the commit it is drawn from — the source routes' own refusals.
      'SOURCE_COMMIT_NOT_FOUND',
      'SOURCE_GIT_FAILED',
      'SOURCE_PROVIDER_MISMATCH',
      'SOURCE_UNREACHABLE',
    ],
    handler: async ({ deps, actor, params }) => {
      // MINTABLE (Decision 11): no `requireSession` — an agent on its person's token may prepare a
      // draft for them to read. The capability first, so a stranger is `404` and learns nothing.
      await assertCapability(deps.db, actor, params.projectId, 'launch:draft')
      const row = await draftIamRegistration(deps, {
        projectId: params.projectId,
        environment: params.environment,
        actor: { id: actor.userId },
      })
      return toIamRegistration(row, await peopleOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'draftPrivacyAssessment',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/privacy-assessment/draft',
    tag: 'launch',
    summary: 'Draft the privacy impact assessment for the Privacy Office',
    description:
      'Manifest generates the privacy impact assessment the project’s owner completes and sends UBC’s Privacy Office, and keeps it on the record as `draft`: six questions — what personal information the app collects, where it is stored, where it flows, how long it is kept, who is accountable, and where it is hosted — each answered with facts and where Manifest read them (`manifest.yaml`, the model catalogue, the project’s members), and the gaps only the owner can fill, such as what the app keeps in its own database; and the whole as plain text to paste. It is drawn from the release serving staging — or, while nothing serves staging, from the newest valid manifest, and the draft says so. Each gap has a stable `id`, kept when the app is drafted again. Drafting again replaces the draft until it is sent: once the assessment is with the Manifest team (`sent`), `submitted` or `approved`, what was sent is kept and drafting is `409 LAUNCH_RECORD_SUBMITTED`, until the team hands it back or the Privacy Office sends it back. The project’s owner, a collaborator, a platform administrator, or an agent on a token holding `launch:draft`, may draft — a draft sends nothing and decides nothing. Sending it to the Manifest team, with an answer to every gap, is `sendPrivacyAssessment`.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The assessment, with its new draft in `draft`.',
      schema: PrivacyAssessment,
    },
    capability: 'launch:draft',
    examples: { response: ASSESSMENT_DRAFTED_EXAMPLE },
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'LAUNCH_RECORD_SUBMITTED',
      // Reading `manifest.yaml` at the commit it is drawn from — the source routes' own refusals.
      'SOURCE_COMMIT_NOT_FOUND',
      'SOURCE_GIT_FAILED',
      'SOURCE_PROVIDER_MISMATCH',
      'SOURCE_UNREACHABLE',
      // Reading the model catalogue, for an app that declares a model — validation's own refusals.
      'AI_BACKEND_UNAVAILABLE',
      'AI_CATALOGUE_EMPTY',
    ],
    handler: async ({ deps, actor, params }) => {
      // MINTABLE, as the registration's draft is: no `requireSession`. The capability first, so a
      // stranger is `404` and learns nothing.
      await assertCapability(deps.db, actor, params.projectId, 'launch:draft')
      const row = await draftPrivacyAssessment(deps, {
        projectId: params.projectId,
        actor: { id: actor.userId },
      })
      return toPrivacyAssessment(row, await peopleOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'sendIamRegistration',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/send',
    tag: 'launch',
    summary: 'Send a registration request to the Manifest team',
    description:
      'The project’s owner, a collaborator or a platform administrator, in their own session, sends the staging or production registration to the Manifest team, who submit it to UBC IAM (`submitIamRegistration`) or hand it back (`returnIamRegistration`). It is sent now, from Manifest: the record moves to `sent`, with `sentAt`, `sentBy` and `sentFrom`, and the Manifest team is emailed — the app, the record and who sent it, never what the package says. What is sent is Manifest’s draft, so a record with none is `409 LAUNCH_DRAFT_REQUIRED`. UBC works in an order: neither registration is sent until the privacy assessment is approved with its PIA number (`409 LAUNCH_PIA_NOT_APPROVED`), and production’s only once staging’s is active as well (`409 LAUNCH_STAGING_NOT_REGISTERED`). What is sent must be the draft the person read — name it with `draftGeneratedAt`, or a draft made since is `409 LAUNCH_DRAFT_CHANGED` — and it must carry the assessment’s PIA number: a draft made before the assessment was approved is `409 LAUNCH_DRAFT_STALE`, to be drafted again. It is sent from a draft, once UBC IAM has asked its owner for changes, or once it lapsed — a second send, or one while UBC holds it, is `409 LAUNCH_TRANSITION_INVALID`. **Sent from a live registration (`active`), it is a change**: the Manifest team files it with UBC IAM as a change request, what the package asks for becomes `requestedAttributes`, and what UBC registered stands until UBC answers — a change that asks for exactly what UBC registered (the same attributes, at the same ACS and SLO) is `409 LAUNCH_CHANGE_EMPTY`. A delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`; anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({
      projectId: PATH.projectId,
      environment: ENVIRONMENT('to send'),
    }),
    query: NO_QUERY,
    body: SendLaunchRecordRequest,
    success: {
      status: 200,
      description: 'The registration, now with the Manifest team.',
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
      'LAUNCH_DRAFT_CHANGED',
      'LAUNCH_DRAFT_STALE',
      'LAUNCH_CHANGE_EMPTY',
    ],
    examples: { request: SEND_REQUEST_EXAMPLE, response: SENT_EXAMPLE },
    handler: async ({ deps, request, params, body }) => {
      // A PERSON, in their own session (D24: *"saying that a request to either was sent"*).
      // `requireSession` first, so a token is answered the same for every project id and learns
      // nothing; the central rule refuses a token holding `launch:submit` whatever this line does.
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:submit')
      const row = await sendIamRegistration(
        { db: deps.db, bus: deps.bus, mailer: deps.mailer },
        {
          projectId: params.projectId,
          environment: params.environment,
          actor: { id: actor.userId, puid: actor.puid },
          draftGeneratedAt: body.draftGeneratedAt,
        },
      )
      return toIamRegistration(row, await peopleOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'sendPrivacyAssessment',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/privacy-assessment/send',
    tag: 'launch',
    summary: 'Send the privacy assessment to the Manifest team, every gap answered',
    description:
      'The project’s owner, a collaborator or a platform administrator, in their own session, sends the privacy impact assessment to the Manifest team, who submit it to UBC’s Privacy Office (`submitPrivacyAssessment`) or hand it back (`returnPrivacyAssessment`) — with an answer to EVERY gap of the draft, once each, by its `id` (`answers`; “does not apply” is an answer). A gap without an answer, a blank one, a gap answered twice or one the draft does not have is `400 LAUNCH_GAP_ANSWERS_INVALID`, naming each gap at fault; an answer over 2,000 characters is refused by the request’s own limit, `400 REQUEST_INVALID`. It is sent now, from Manifest: the record moves to `sent`, with `sentAt`, `sentBy` and the answers in `gapAnswers`, and the Manifest team is emailed — the app and who sent it, never an answer. It comes first in UBC’s order, so nothing else gates it. What is sent is Manifest’s draft, so a record with none is `409 LAUNCH_DRAFT_REQUIRED`, one drafted again after the draft `draftGeneratedAt` names is `409 LAUNCH_DRAFT_CHANGED`, and a second send is `409 LAUNCH_TRANSITION_INVALID`. A delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`; anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: SendPrivacyAssessmentRequest,
    success: {
      status: 200,
      description: 'The assessment, now with the Manifest team.',
      schema: PrivacyAssessment,
    },
    capability: 'launch:submit',
    errors: [
      'NOT_FOUND',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_DRAFT_REQUIRED',
      'LAUNCH_TRANSITION_INVALID',
      'LAUNCH_DRAFT_CHANGED',
      'LAUNCH_GAP_ANSWERS_INVALID',
    ],
    examples: {
      request: ASSESSMENT_SEND_REQUEST_EXAMPLE,
      response: ASSESSMENT_SENT_EXAMPLE,
    },
    handler: async ({ deps, request, params, body }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:submit')
      const row = await sendPrivacyAssessment(
        { db: deps.db, bus: deps.bus, mailer: deps.mailer },
        {
          projectId: params.projectId,
          actor: { id: actor.userId, puid: actor.puid },
          draftGeneratedAt: body.draftGeneratedAt,
          answers: body.answers,
        },
      )
      return toPrivacyAssessment(row, await peopleOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'submitIamRegistration',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/submission',
    tag: 'launch',
    summary: 'Record that the Manifest team submitted a registration to UBC IAM',
    description:
      'A platform administrator, in their own session, records that the Manifest team submitted the staging or production registration its owner sent them to UBC IAM — on `sentAt` (today in Vancouver when absent; not after today, and not before its owner sent it to the team, or `400 LAUNCH_SENT_AT_INVALID`), with UBC IAM’s `reference`. The record moves from `sent` to `submitted`, and the launch checklist says how long it has waited for UBC from that day. **A change to a live registration** (sent from `active`) is filed as a change request instead: it moves to `change_requested`, `changeRequestedFrom: active`, what it asks for kept as `requestedAttributes` and what UBC registered still standing. Only a registration with the Manifest team is submitted: any other is `409 LAUNCH_TRANSITION_INVALID`. It is never refused for UBC’s order, which was held when its owner sent it. UBC’s answer is recorded later (`recordIamRegistration`). A delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`; a member who is not an administrator `403 FORBIDDEN`; anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({
      projectId: PATH.projectId,
      environment: ENVIRONMENT('was submitted'),
    }),
    query: NO_QUERY,
    body: RecordSubmissionRequest,
    success: {
      status: 200,
      description: 'The registration, now submitted to UBC IAM.',
      schema: IamRegistration,
    },
    capability: 'launch:record',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_TRANSITION_INVALID',
      'LAUNCH_SENT_AT_INVALID',
    ],
    examples: { request: TEAM_SUBMISSION_REQUEST_EXAMPLE, response: SUBMITTED_EXAMPLE },
    handler: async ({ deps, request, params, body }) => {
      // AN ADMINISTRATOR'S RECORD, in their own session: `requireSession` first, as the record routes'.
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      const row = await recordIamSubmission(deps.db, deps.bus, {
        projectId: params.projectId,
        environment: params.environment,
        actor: { id: actor.userId, puid: actor.puid },
        sentAt: body.sentAt,
        reference: body.reference,
      })
      return toIamRegistration(row, await peopleOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'submitPrivacyAssessment',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/privacy-assessment/submission',
    tag: 'launch',
    summary: 'Record that the Manifest team submitted the privacy assessment',
    description:
      'A platform administrator, in their own session, records that the Manifest team submitted the privacy impact assessment its owner sent them to UBC’s Privacy Office — on `sentAt` (today in Vancouver when absent; not after today, and not before its owner sent it to the team, or `400 LAUNCH_SENT_AT_INVALID`), with the Office’s `reference`, the PIA number. The record moves from `sent` to `submitted`; the owner’s answers stay on it. Only an assessment with the Manifest team is submitted: any other is `409 LAUNCH_TRANSITION_INVALID`. The Office’s answer is recorded later (`recordPrivacyAssessment`). A delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`; a member who is not an administrator `403 FORBIDDEN`; anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: RecordSubmissionRequest,
    success: {
      status: 200,
      description: 'The assessment, now submitted to the Privacy Office.',
      schema: PrivacyAssessment,
    },
    capability: 'launch:record',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_TRANSITION_INVALID',
      'LAUNCH_SENT_AT_INVALID',
    ],
    examples: {
      request: ASSESSMENT_SUBMIT_REQUEST_EXAMPLE,
      response: ASSESSMENT_SUBMITTED_EXAMPLE,
    },
    handler: async ({ deps, request, params, body }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      const row = await recordAssessmentSubmission(deps.db, deps.bus, {
        projectId: params.projectId,
        actor: { id: actor.userId, puid: actor.puid },
        sentAt: body.sentAt,
        reference: body.reference,
      })
      return toPrivacyAssessment(row, await peopleOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'returnIamRegistration',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/iam-registration/{environment}/return',
    tag: 'launch',
    summary: 'Hand a registration back to its owner, unsubmitted',
    description:
      'A platform administrator, in their own session, hands the staging or production registration the Manifest team holds back to its owner, unsubmitted: it returns to the state it was sent from (`sentFrom`) — a draft, UBC IAM’s questions to its owner, a lapsed registration, or the live registration a change was asked of (`active`, with nothing requested any more) — for its owner to change and send again. Why it came back travels outside the record, as UBC’s questions do. Only a registration with the Manifest team is handed back: any other is `409 LAUNCH_TRANSITION_INVALID`. A delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`; a member who is not an administrator `403 FORBIDDEN`; anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({
      projectId: PATH.projectId,
      environment: ENVIRONMENT('to hand back'),
    }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The registration, back with its owner.',
      schema: IamRegistration,
    },
    capability: 'launch:record',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_TRANSITION_INVALID',
    ],
    examples: { response: RETURNED_EXAMPLE },
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      const row = await returnIamRegistration(deps.db, deps.bus, {
        projectId: params.projectId,
        environment: params.environment,
        actor: { id: actor.userId, puid: actor.puid },
      })
      return toIamRegistration(row, await peopleOf(deps.db, row))
    },
  }),
  defineRoute({
    operationId: 'returnPrivacyAssessment',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/launch-records/privacy-assessment/return',
    tag: 'launch',
    summary: 'Hand the privacy assessment back to its owner, unsubmitted',
    description:
      'A platform administrator, in their own session, hands the privacy impact assessment the Manifest team holds back to its owner, unsubmitted: it is a `draft` again, for its owner to draft again or answer differently and send. Why it came back travels outside the record. Only an assessment with the Manifest team is handed back: any other is `409 LAUNCH_TRANSITION_INVALID`. A delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`; a member who is not an administrator `403 FORBIDDEN`; anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The assessment, a draft again.',
      schema: PrivacyAssessment,
    },
    capability: 'launch:record',
    errors: [
      'NOT_FOUND',
      'FORBIDDEN',
      'TOKEN_CREDENTIAL_REFUSED',
      'LAUNCH_TRANSITION_INVALID',
    ],
    examples: { response: ASSESSMENT_RETURNED_EXAMPLE },
    handler: async ({ deps, request, params }) => {
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:record')
      const row = await returnPrivacyAssessment(deps.db, deps.bus, {
        projectId: params.projectId,
        actor: { id: actor.userId, puid: actor.puid },
      })
      return toPrivacyAssessment(row, await peopleOf(deps.db, row))
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
      'Deploys the candidate release to production, registers its Service Provider with production-shaped values and completes one CWL sign-in, then takes the deployment down again and records pass or fail with the evidence — proving the registration’s shape, not UBC’s acceptance of it. The candidate answers production’s hostname on the public listener only while the sign-in runs; afterwards the hostname reaches nothing of the app’s, and production’s environment reads the rehearsal’s instance as `gone` (or `failed`, when the candidate never started). The owner, a collaborator or a platform administrator runs it in their own session, after a second sign-in (step-up) in the last ten minutes, or is refused `403 STEP_UP_REQUIRED`; a delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`, and anyone else is answered `404 NOT_FOUND`. One rehearsal of a project runs at a time (`REHEARSAL_RUNNING`), none while its load rehearsal runs (`LOAD_REHEARSAL_RUNNING`), and none once the app has launched (`REHEARSAL_LAUNCHED`). If the deployment cannot be taken down, nothing is recorded and the answer is `500 REHEARSAL_TEARDOWN_FAILED`; running it again is the remedy. Up to ~90 s.',
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
      // §24 (the load rehearsal plan's Task 5, Decision 6): not while the app's load rehearsal runs — the two exclude
      // each other both ways.
      'LOAD_REHEARSAL_RUNNING',
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
  defineRoute({
    operationId: 'runLoadRehearsal',
    credential: 'session',
    method: 'POST',
    path: '/v1/projects/{projectId}/load-rehearsal',
    tag: 'launch',
    summary: 'Run the load rehearsal',
    description:
      'Gives staging production’s capacity for the app’s audience — production’s count of instances, at production’s resources, behind one balanced route — puts that audience’s arrival on it through the edge for a few minutes, watches the app, judges it against the pass mark, records what it measured, and gives staging back its own shape. For an app whose audience is a large course or the public; any other is refused `409 LOAD_REHEARSAL_NOT_NEEDED`. ANSWERED AT ONCE, `202`, with the record in state `running`: a run takes up to about ten minutes, so read it with `getLoadRehearsal` every `pollAfterSeconds` until its `state` is not `running`. It rehearses the release serving staging (`409 REHEARSAL_NO_CANDIDATE` when nothing does). One runs at a time across the platform (`409 LOAD_REHEARSAL_BUSY`, naming no other app), one per app (`409 LOAD_REHEARSAL_RUNNING`), and not while the app’s pre-production rehearsal runs (`409 REHEARSAL_RUNNING`); while it runs, every other deploy to the app’s staging, and that rehearsal, are refused `409 LOAD_REHEARSAL_RUNNING`. The owner, a collaborator or a platform administrator runs it in their own session, after a second sign-in (step-up) in the last ten minutes, or is refused `403 STEP_UP_REQUIRED`; a delegated token is refused `403 TOKEN_CREDENTIAL_REFUSED`, and anyone else is answered `404 NOT_FOUND`.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 202,
      description:
        'The run, started: its record in state `running`, with what it will put on the app and the mark it will be held to. A run that then fails is still a run — its record says why, in numbers — never a request error.',
      schema: LoadRehearsal,
    },
    capability: 'launch:rehearse',
    errors: [
      'NOT_FOUND',
      'TOKEN_CREDENTIAL_REFUSED',
      'STEP_UP_REQUIRED',
      'LOAD_REHEARSAL_NOT_NEEDED',
      'LOAD_REHEARSAL_BUSY',
      'LOAD_REHEARSAL_RUNNING',
      'REHEARSAL_NO_CANDIDATE',
      'REHEARSAL_RUNNING',
    ],
    examples: {
      response: {
        ...LOAD_REHEARSAL_EXAMPLE,
        state: 'running' as const,
        granted: null,
        evidence: null,
        finishedAt: null,
        takenDownAt: null,
        pollAfterSeconds: 10,
      },
    },
    handler: async ({ deps, request, params }) => {
      // A PERSON, in their own session (D24's person-only list): `requireSession` before the project is read, so a token
      // learns nothing about which projects exist — D21's rehearsal's order.
      const actor = requireSession(request)
      await assertCapability(deps.db, actor, params.projectId, 'launch:rehearse')
      // §20's STEP-UP: a run grants staging production's capacity and holds staging for its length, and a stolen session
      // alone must not be enough to do that. After the capability, so a stranger is still `404`; before anything moves.
      assertStepUp(actor, 'launch:rehearse')
      return toLoadRehearsal(
        await deps.loadRehearsals.start(
          {
            db: deps.db,
            driver: deps.driver,
            config: deps.config,
            // THE SAME OBJECT THE DEPLOY ROUTE BUILDS, held equal by `tsc`: `DeployDeps` gaining a field turns this red.
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
          },
          { projectId: params.projectId, actor: { id: actor.userId } },
        ),
      )
    },
  }),
  defineRoute({
    operationId: 'getLoadRehearsal',
    method: 'GET',
    path: '/v1/projects/{projectId}/load-rehearsals/{loadRehearsalId}',
    tag: 'launch',
    summary: 'Read a load rehearsal',
    description:
      'One load rehearsal of the project: while it runs, its `state` is `running` and `pollAfterSeconds` says when to read it again; then what it measured, and whether it passed. A run of another project is answered `404 NOT_FOUND`.',
    params: z.strictObject({
      projectId: PATH.projectId,
      loadRehearsalId: PATH.loadRehearsalId,
    }),
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The load rehearsal.', schema: LoadRehearsal },
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: { response: LOAD_REHEARSAL_EXAMPLE },
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      const row = await loadRehearsalById(
        deps.db,
        params.projectId,
        params.loadRehearsalId,
      )
      if (row === undefined)
        throw new AuthorizationError(
          'NOT_FOUND',
          `no load rehearsal '${params.loadRehearsalId}' of this project`,
        )
      return toLoadRehearsal(row)
    },
  }),
  defineRoute({
    operationId: 'listLoadRehearsals',
    method: 'GET',
    path: '/v1/projects/{projectId}/load-rehearsals',
    tag: 'launch',
    summary: 'List the load rehearsals',
    description:
      'The project’s load rehearsals, the newest first — at most 20 — each as `getLoadRehearsal` answers it.',
    params: z.strictObject({ projectId: PATH.projectId }),
    query: NO_QUERY,
    body: NO_BODY,
    success: {
      status: 200,
      description: 'The load rehearsals, the newest first.',
      schema: LoadRehearsalList,
    },
    capability: 'project:read',
    errors: ['NOT_FOUND'],
    examples: { response: { loadRehearsals: [LOAD_REHEARSAL_EXAMPLE] } },
    handler: async ({ deps, actor, params }) => {
      await assertCapability(deps.db, actor, params.projectId, 'project:read')
      return {
        loadRehearsals: (await loadRehearsalsOf(deps.db, params.projectId)).map(
          toLoadRehearsal,
        ),
      }
    },
  }),
]
