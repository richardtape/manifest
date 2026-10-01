import { BLUEPRINT_CODES } from '../blueprints/index.js'
import { POLICY_CODES, SPEC_CODES } from '../spec/index.js'

/**
 * §20's *Machine-actionable errors* and D23.7: EVERY code a client can receive, once,
 * with the status it is answered with (P5a Task 5).
 *
 * Held to the source by `error-codes.test.ts`, in both directions: a code thrown through
 * a class the API answers as itself and not listed here is red, and a code listed here
 * that nothing throws is red. `ErrorCode` is a union, so a route's `errors:` list
 * (Task 6) is checked by tsc. The contract publishes the list as an enum.
 *
 * ONE STATUS PER CODE. A client switches on the code, so a code answered with two
 * statuses is two answers wearing one name — `SPEC_INVALID` was 422 from one route and
 * 400 from another until this registry was written.
 *
 * A FAMILY is where the code comes from: a class `toErrorResponse` maps, or `api` for
 * the literals and fixed-code classes in `api/` itself.
 *
 * **EVERY CODE HAS A MEANING AND A REMEDY, AND BOTH ARE PUBLISHED** (the authoring API plan's
 * Task 9, Decision 14): `summary` is what happened and `remedy` is what a caller does next —
 * addressed to a person and an agent alike, never *"an error occurred"*. `document.ts` prints
 * both into the OpenAPI document (`x-enumDescriptions` on `ErrorCode`, and the top-level
 * `x-manifest-errors` table), so this file is PUBLIC TEXT: it cites the spec (`§13`, `D24`)
 * for depth and never a plan, a task or a person, which `api/contract/docs.test.ts` refuses.
 * The state-conflict family (a `ReleaseError`, `SourceError`, `ConfigError` or
 * `RehearsalError`) answers no `hint` on the wire, so for those codes this remedy is the only
 * one a client can read.
 */
export type ErrorFamily =
  | 'api'
  | 'AuthorizationError'
  | 'BadRequestError'
  | 'ReleaseError'
  | 'SourceError'
  | 'ConfigError'
  | 'SamlError'
  | 'AiError'
  | 'CatalogueError'
  | 'SlugRefusedError'
  | 'LaunchTransitionError'
  | 'LaunchRecordError'
  | 'RehearsalError'
  | 'ProductionGateError'
  | 'OutputError'
  | 'AgentSessionError'
  | 'ProjectStateError'
  | 'BuildingError'

interface Entry {
  status: number
  families: readonly ErrorFamily[]
  /** What happened — published as the code's meaning. */
  summary: string
  /** What a caller does next — one or two sentences a person or an agent can act on. */
  remedy: string
}

const api = (status: number, summary: string, remedy: string): Entry => ({
  status,
  families: ['api'],
  summary,
  remedy,
})
const bad = (summary: string, remedy: string): Entry => ({
  status: 400,
  families: ['BadRequestError'],
  summary,
  remedy,
})
const release = (summary: string, remedy: string): Entry => ({
  status: 409,
  families: ['ReleaseError'],
  summary,
  remedy,
})
const rehearsal = (summary: string, remedy: string): Entry => ({
  status: 409,
  families: ['RehearsalError'],
  summary,
  remedy,
})
const source = (summary: string, remedy: string): Entry => ({
  status: 409,
  families: ['SourceError'],
  summary,
  remedy,
})
/** Raised at BOOT: a control plane with one of these never serves a request. */
const OPERATOR_SETTING =
  'The control plane refuses to start until its operator corrects the setting the message names; nothing a client sends changes it.'
const config = (summary: string): Entry => ({
  status: 409,
  families: ['ConfigError'],
  summary,
  remedy: OPERATOR_SETTING,
})
const saml = (summary: string, remedy: string): Entry => ({
  status: 401,
  families: ['SamlError'],
  summary,
  remedy,
})
const ai = (summary: string, remedy: string): Entry => ({
  status: 503,
  families: ['AiError'],
  summary,
  remedy,
})

/** The remedy every build-side release refusal shares: the release names a build that cannot be run. */
const REBUILD =
  'Build the commit again (`startBuild`) and create the release from the new build (`createRelease`).'

export const ERROR_CODES = {
  // api/ — the envelope's own answers
  UNAUTHENTICATED: api(
    401,
    'The request carries no valid credential — no session, or a delegated token that is unknown, revoked or expired.',
    'Sign in at /auth/login for a session, or send a delegated token as `Authorization: Bearer mft_…`. A token that expired or was revoked is refused the same way: mint a new one (`mintToken`).',
  ),
  INTERNAL: api(
    500,
    'The control plane failed; its operator log has the reason. Nothing the client sent explains it.',
    'Retry once; if it recurs, the platform’s operator has a line naming it — report the time and the operation.',
  ),
  REQUEST_INVALID: api(
    400,
    'A field in the request is missing or malformed, or the body could not be read at all; the message says which.',
    'Read `message`: it names each part and field that failed (`body.changes.0.path: …`). Correct them against this operation’s schema and send it again. A request with no body — a GET, or a DELETE that takes none — carries no `Content-Type`.',
  ),
  REQUEST_BODY_TOO_LARGE: api(
    413,
    'The request body is larger than the API accepts.',
    'Send a smaller body. Every operation accepts at most 1 MiB except `createCommit`, which accepts 8 MiB — split a larger change into several commits.',
  ),
  REQUEST_MEDIA_TYPE_UNSUPPORTED: api(
    415,
    'The request body is a content type the route does not read.',
    'Send the body as JSON, with `Content-Type: application/json`.',
  ),
  ROUTE_NOT_FOUND: api(
    404,
    'No route has this method and path. Resource routes are under /v1/.',
    'Check the method and the path against this document: every resource route begins `/v1/`, and a path parameter is an id, never a name.',
  ),
  // POST /webhooks/github (the D5 plan's Task 9, Decision 9) — FOUR refusals, four codes: with
  // one shared code, deleting the absent-signature branch would leave every test green.
  WEBHOOK_SIGNATURE_MISSING: api(
    401,
    'The delivery carries no X-Hub-Signature-256 — including one that carries only the legacy SHA-1 X-Hub-Signature.',
    'Give the GitHub App’s webhook its secret, so that GitHub signs every delivery with X-Hub-Signature-256. Only GitHub calls this endpoint; a Manifest client never does.',
  ),
  WEBHOOK_SIGNATURE_MALFORMED: api(
    401,
    'X-Hub-Signature-256 is not exactly one sha256= and 64 lowercase hex characters.',
    'Send the signature exactly as GitHub computes it: `sha256=` and the HMAC-SHA256 of the raw body, as 64 lowercase hex characters.',
  ),
  WEBHOOK_SIGNATURE_INVALID: api(
    401,
    'X-Hub-Signature-256 is well formed and does not match the body under the App’s webhook secret.',
    'Make the App’s webhook secret and the control plane’s the same, and sign the exact bytes sent — a body re-serialised after signing no longer matches.',
  ),
  WEBHOOK_PAYLOAD_INVALID: api(
    400,
    'A correctly signed delivery whose body is not a JSON object, or which lacks X-GitHub-Delivery or X-GitHub-Event.',
    'Send GitHub’s delivery unchanged: a JSON object, with its X-GitHub-Delivery and X-GitHub-Event headers.',
  ),
  WEBHOOKS_NOT_CONFIGURED: api(
    404,
    'This control plane runs the local source driver, which receives no webhooks.',
    'Nothing to fix here: on the local driver a person pushes into Manifest’s own repository and no webhook is needed. Point a GitHub webhook only at a control plane that runs the GitHub driver.',
  ),
  IDEMPOTENCY_KEY_REUSED: api(
    409,
    'This Idempotency-Key was used on this route for a different request — another resource in the path, or a different body.',
    'Use a new Idempotency-Key for a new action. To retry the SAME action, send the same key to the same path with exactly the same body, and the first answer is replayed — except a mint, whose secret is never kept (`TOKEN_ALREADY_MINTED`).',
  ),
  TOKEN_ALREADY_MINTED: api(
    409,
    'A mint was retried with its Idempotency-Key: the first request minted the token named, and its secret was shown to that request alone and is not kept.',
    'If you have the first answer’s secret, use it. If that answer was lost, revoke the token named (`revokeToken`) and mint again with a new Idempotency-Key.',
  ),
  CSRF_ORIGIN_REFUSED: api(
    403,
    'A request carrying a session did not come from the origin it was sent to. Each of Manifest’s origins — the console’s, and the faculty front-end’s — takes a session’s request only from itself.',
    'Send `Origin` naming the origin the request is sent to — a browser does this itself, and `hint` names it. A session is its own origin’s: one set on the other origin is not a session here. A program that is not a browser sends a delegated token rather than a session cookie; a token needs no Origin.',
  ),
  RATE_LIMITED: api(
    429,
    'Too many requests from this credential; Retry-After says when to try again. A delegated token’s limit is its own, from its row (§20).',
    'Wait the number of seconds `Retry-After` gives, then retry. A token’s limit is its `rateLimit`, fixed when it was minted.',
  ),
  EVENTS_UPGRADE_REQUIRED: api(
    426,
    'The event stream is a WebSocket; a plain GET cannot read it.',
    'Open the same URL as a WebSocket (`wss://`), with the same credential.',
  ),
  SPEC_INVALID: api(
    422,
    'manifest.yaml at this commit is not valid; `details` lists each error with its path.',
    'Read `details`: each entry names a path in manifest.yaml, a code (`ManifestErrorCode`), a message and usually a hint. Correct each one and commit the file again (`createCommit`); `validateSpec` checks it without building.',
  ),
  RELEASE_PRODUCTION_GATE_UNAVAILABLE: {
    status: 409,
    // ONE family since P6a Task 7, and the change is the proof the deletion was complete:
    // it read `['api', 'ReleaseError']` while TWO gates threw it — the route's class in
    // `api/errors.ts` and `deployRelease`'s own `ReleaseError`, the second unreachable by
    // any client. The class now lives in `launch/` beside `assertLaunchable`, which is
    // the only thing that throws it, and the registry holds itself to the source in both
    // directions — so a stale family here is a red gate.
    families: ['ProductionGateError'],
    summary:
      'A blocking item an approval alone cannot fix is unmet — a first launch’s checklist (§13, D19), or a launched app’s (D9.2), a rejected release included; the body carries LaunchReadiness.',
    remedy:
      'Read `launchReadiness`: each unmet blocking item says what meets it. Meet them — most are records an administrator keeps, some with long lead times — and deploy again; a retry alone changes nothing.',
  },
  RELEASE_REESCALATED: {
    status: 409,
    // P6b Task 6 (Decision 9): thrown by `assertLaunchable` as a LITERAL, beside the code above.
    families: ['ProductionGateError'],
    summary:
      'A launched app’s release changes a sensitive field (§7) since the last approved release, and only an administrator’s approval is missing (§13 D9.2); the body carries LaunchReadiness.',
    remedy:
      'Ask an administrator to approve this release: they take a preview (`createApprovalPreview`), read it, and approve naming it (`approveRelease`). Deploy again once they have.',
  },
  RELEASE_NOT_STAGED: {
    status: 409,
    families: ['ProductionGateError'],
    summary:
      'Production deploys only the release serving staging — production runs exactly what staging ran (§13); the body carries the LaunchReadiness of the one that is.',
    remedy:
      'Deploy this release to staging first and let it become healthy, then deploy it to production — or deploy the release that is serving staging.',
  },

  // projects/authz.ts
  NOT_FOUND: {
    status: 404,
    families: ['AuthorizationError'],
    summary: 'No such resource — or one the caller has no business knowing exists.',
    remedy:
      'Check the id. If it is right you cannot see it: ask one of the project’s owners to add you (`addMember`), or use a token minted for that project.',
  },
  FORBIDDEN: {
    status: 403,
    families: ['AuthorizationError'],
    summary: 'A member of the project whose role does not hold this capability.',
    remedy:
      'Ask one of the project’s owners (`listMembers` names them) for a role that holds this capability — or, for a token, mint one that holds it (`mintToken`).',
  },

  // api/actor.ts — the credential class itself being refused (D24, P5b Task 5)
  TOKEN_CREDENTIAL_REFUSED: api(
    403,
    'A valid delegated token asked for something D24 reserves to an interactive session.',
    'Have a person do it in the console, in their own session: no delegated token may, and no confirmation changes that. The operation’s description says when a token is refused.',
  ),
  /**
   * D24's central refusal (P5b Task 6). DISTINCT from the one above: that is "no route
   * like this exists for a token", this is "this particular action needs a person's
   * confirmation, and here is the pending action to wait on". A client switches on the
   * code, and the two need different behaviour — one is a dead end, the other is a loop
   * that closes.
   */
  TOKEN_ACTION_PENDING: api(
    403,
    'A delegated token asked for one of D24’s privileged four; `pendingAction` is the question a person must answer.',
    'Ask the person who minted the token to confirm `pendingAction` in the console, then retry the identical request — same body, same Idempotency-Key — once. The confirmation grants exactly one retry.',
  ),
  /**
   * The third answer, and DISTINCT from both above (P5b Task 7). `TOKEN_ACTION_PENDING`
   * is a loop that closes — wait, and retry; this one is closed already. A client that
   * could not tell them apart would retry a refusal for ever, which is the behaviour
   * D23.7's stable codes exist to prevent. The `pendingAction` it carries has the
   * person's own reason.
   */
  TOKEN_ACTION_REJECTED: api(
    403,
    'A person refused this exact request. `pendingAction.reason` is why, in their words; retrying it will not change the answer.',
    'Do not retry it. Read `pendingAction.reason`, then ask the person, or ask for something different.',
  ),
  /**
   * §20's step-up (P6a Task 9), and the FIFTH answer that is a `403` on this API — after
   * `FORBIDDEN`, `TOKEN_CREDENTIAL_REFUSED`, `TOKEN_ACTION_PENDING` and
   * `TOKEN_ACTION_REJECTED`. A status-only assertion passes through all five, which is
   * why every refusal in this plan asserts its CODE.
   *
   * **403 and not 401**: the credential is valid and the person is who they say — they
   * are being told this particular action needs re-proving, which is a different thing
   * from *who are you* and needs a different client behaviour (D23.7). The HINT is the
   * remedy, and `errors.ts` names the route to navigate to.
   */
  STEP_UP_REQUIRED: api(
    403,
    'This action needs a second authentication round trip (§20). Send the person to /auth/step-up and retry.',
    'Send the person’s browser to `/auth/step-up?returnTo=<the page they are on>`, let them complete the CWL prompt, and repeat the request within ten minutes. A token cannot step up.',
  ),
  /**
   * D24's PERSON-ONLY class (P6b Task 2), and the SIXTH `403` on this API. Distinct from
   * `TOKEN_CREDENTIAL_REFUSED` (a route no token may use at all) and from
   * `TOKEN_ACTION_PENDING` (a question a person can confirm): this one is a dead end by
   * design, because each action is a person's to do — a record of what they decided, or (since
   * the launch path plan's Task 6b) the pre-production rehearsal they run.
   */
  TOKEN_PERSON_ONLY: api(
    403,
    'A delegated token asked for a person-only action (D24) — approving a release, recording UBC’s IAM or privacy decision, saying a request to UBC IAM or the Privacy Office was sent, running the pre-production rehearsal, or switching an app off, bringing it back or deleting it. Refused outright; no pending action is created.',
    'A person does this, in the console, in their own session. No token can hold it and no confirmation grants it — do not ask for one.',
  ),
  // GET /v1/docs/{slug} (the authoring API plan's Task 11)
  DOC_NOT_FOUND: api(
    404,
    'No page of the API’s documentation has this slug.',
    'Read the index (`listDocs`): it names every page with the slug to read it by. A page’s links name files — `authoring.md` is the slug `authoring`, `reference/errors.md` is `reference-errors`.',
  ),
  PROJECT_LAST_OWNER: api(
    409,
    'A project must always have an owner, so the last one cannot be removed or made a collaborator.',
    'Make another member an owner first (`addMember` with role `owner`), then remove this one or change their role.',
  ),
  /** A pending action already has an answer, and one question has one (P5b Task 7). */
  PENDING_ACTION_RESOLVED: api(
    409,
    'This pending action has already been confirmed or rejected; it cannot be answered twice.',
    'Read it again (`getPendingAction`): somebody has already answered, and its `state` says how.',
  ),

  // BuildingError — who may build (the launch path plan's Task 8a, FE-39). The status is each entry's.
  BUILDING_NOT_OPEN: {
    status: 403,
    families: ['BuildingError'],
    summary:
      'Building on Manifest — creating a project or starting an intake session — is open only to faculty members and platform administrators for now, and the signed-in person is neither. Nothing was created.',
    remedy:
      'Read `mayBuild` on `getMe` before offering to build, and tell a person for whom it is false that building is not open to them yet. The affiliation is read at sign-in, so a faculty member refused should sign out and sign in again first; if they still may not build, a platform administrator can help.',
  },
  MEMBER_MAY_NOT_BUILD: {
    status: 409,
    families: ['BuildingError'],
    summary:
      'The person named may not build on Manifest — only faculty members and platform administrators may, for now — so they cannot be added to a project. The message names them; nobody was added.',
    remedy:
      'Add a faculty colleague instead. A person already on the project keeps their place, and their role can still be changed.',
  },

  // BadRequestError — every one of these is 400
  IDEMPOTENCY_KEY_REQUIRED: bad(
    'A mutation arrived without an Idempotency-Key of at least 8 characters (D23.6).',
    'Send `Idempotency-Key` with every mutation: a new random value of 8 characters or more — a UUID — for each user action, reused unchanged when retrying that same action.',
  ),
  BLUEPRINT_NOT_FOUND: bad(
    'No blueprint with this reference is in the registry.',
    'Choose one from `listBlueprints` and name it `name@major`.',
  ),
  MEMBER_USER_NOT_FOUND: bad(
    'Nobody Manifest knows by the PUID, CWL login name or email given has signed in. A CWL login name is known only for a person who has signed in since Manifest began asking CWL for one, so a person who has signed in can still miss by login.',
    'Check it. For a CWL login name, add the person by their email or PUID instead; otherwise ask them to sign in to Manifest once with CWL, then add them again.',
  ),
  // The front-end enablement plan's Task 7 (Decision 14): an email two people share.
  MEMBER_USER_AMBIGUOUS: bad(
    'More than one person who has signed in to Manifest has the email given, so it names nobody in particular. The answer names none of them.',
    'Add the person by their CWL login name (`cwlLogin`) or their PUID (`puid`) instead.',
  ),
  SPEC_NOT_FOUND: bad(
    'The project has no validated spec yet.',
    'Validate the manifest on `main` (`validateSpec`), or commit one (`createCommit`), and try again.',
  ),
  // P6b Task 9 (Rich, 2026-09-22): a decision names the preview the administrator read.
  APPROVAL_PREVIEW_REQUIRED: bad(
    'An approval or rejection names no preview. Take one (`POST /v1/releases/{releaseId}/approval-preview`), read it, and decide naming its id.',
    'Take a preview (`createApprovalPreview`), read it, and send the decision again naming its `previewId`.',
  ),
  STARTER_NOT_FOUND: bad(
    'The blueprint offers no starter by that name (§25).',
    'Choose one of the starters `getBlueprint` lists, or leave `starter` out for the skeleton alone.',
  ),
  CREDENTIAL_AMBIGUOUS: bad(
    'The request carried both a session cookie and a delegated token; it carries one or the other.',
    'Send one credential: the session cookie from a browser, or `Authorization: Bearer` from a program — never both.',
  ),
  TOKEN_CAPABILITY_FORBIDDEN: bad(
    'A mint asked for one of D24’s four privileged capabilities, or for a person-only one; the message names which.',
    'Mint the token without them. A privileged action is granted to a token one request at a time, by a person’s confirmation (`TOKEN_ACTION_PENDING`); a person-only one never is.',
  ),
  // The authoring API plan's Task 8: its own code, so an agent told it stops asking.
  SECRET_NAME_RESERVED: bad(
    'That variable is one the platform sets for every app (§8) — the platform’s value always wins — so it cannot be an app secret. Choose another name.',
    'Name the secret something else, in manifest.yaml and here. The platform’s own variables are listed in the blueprint’s knowledge pack (`getKnowledgePack`).',
  ),

  // projects/slugs.ts — §23. The check answers them in a 200; creation refuses with them.
  SLUG_INVALID: {
    status: 400,
    families: ['SlugRefusedError'],
    summary: 'The slug breaks §7’s rule for slugs.',
    remedy:
      'Choose a slug of 3 to 39 lower-case letters, digits and hyphens that starts with a letter. `checkSlug` checks one without creating anything.',
  },
  SLUG_RESERVED: {
    status: 409,
    families: ['SlugRefusedError'],
    summary:
      'The slug is one of §23’s reserved labels; the message says what it stands for.',
    remedy: 'Choose another slug. `checkSlug` says whether one is free.',
  },
  SLUG_TAKEN: {
    status: 409,
    families: ['SlugRefusedError'],
    summary: 'Another project holds the slug.',
    remedy: 'Choose another slug. `checkSlug` says whether one is free.',
  },

  // releases/ — every one is 409
  APPROVAL_PREVIEW_EXPIRED: release(
    'The preview is older than thirty minutes, so it is no longer what was shown at decision time; take a new one.',
    'Take a new preview (`createApprovalPreview`), read it, and decide naming the new one.',
  ),
  APPROVAL_PREVIEW_STALE: release(
    'What the release would be approved as changed since the preview was taken — in practice another decision moved the last approved release. Take a new preview and read it.',
    'Take a new preview (`createApprovalPreview`), read what changed, and decide naming the new one.',
  ),
  RELEASE_AI_BUDGET_MISSING: release(
    'The release declares models and no AI budget.',
    'Set `ai.budget.project_monthly_usd` above 0 in manifest.yaml, or ask an administrator to raise the project’s AI quota, then build and release again. A budget of 0 would refuse the app’s every question.',
  ),
  RELEASE_AI_DISABLED: release(
    'The release declares models and AI is switched off on this control plane.',
    'Remove `ai.models` from manifest.yaml and release again to deploy without AI, or ask an administrator to switch AI on.',
  ),
  RELEASE_BLUEPRINT_NOT_FOUND: release(
    'The project’s blueprint is no longer in the registry.',
    'Ask an administrator to restore the blueprint to the registry; nothing in the project can change it.',
  ),
  RELEASE_BUILD_NOT_DEPLOYABLE: release(
    'The build did not succeed, so nothing can be released from it.',
    'Read the build’s log (`getBuildLog`), fix the cause, build again (`startBuild`) and release the build that succeeds.',
  ),
  RELEASE_BUILD_NOT_FOUND: release(
    'No build with this id.',
    'Check the build id; `listBuilds` lists the project’s builds.',
  ),
  RELEASE_DIGEST_MISSING: release('The release’s build recorded no digest.', REBUILD),
  RELEASE_DIGEST_NOT_APPROVED: release(
    'This production deploy needs an administrator’s approval — a first launch, or a launched app’s change to a sensitive field (§13 D9.2) — and none covers the digest it would run; or an administrator rejected this release, which is final. The message says which.',
    'Ask an administrator to approve this release — they take a preview (`createApprovalPreview`) and approve naming it — then deploy again. A rejected release stays rejected: build and release a new one.',
  ),
  RELEASE_ENVIRONMENT_NOT_FOUND: release(
    'No environment with this id.',
    'Check the environment id; `listEnvironments` lists the project’s three.',
  ),
  RELEASE_IMAGE_REPOSITORY_MISSING: release(
    'The build recorded a digest and no repository; rebuild it.',
    REBUILD,
  ),
  RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER: release(
    'A laptop-built image cannot reach a remote driver (§13).',
    'Nothing a client can change: this control plane builds on one machine and runs on another. Report it to the platform’s operator.',
  ),
  RELEASE_MODEL_CLASSIFICATION_TOO_LOW: release(
    'A declared model is not approved for the app’s data classification (D17).',
    'Declare a model approved for the app’s `data.classification`, or lower the classification if it is overstated; then build and release again.',
  ),
  RELEASE_MODEL_NOT_IN_CATALOGUE: release(
    'A declared model is no longer in the catalogue.',
    'Declare a model the catalogue has — `validateSpec` names them when one is unknown — then build and release again.',
  ),
  RELEASE_MODEL_UNCLASSIFIED: release(
    'A declared model has no classification in the catalogue.',
    'Declare another model, or ask an administrator to classify this one; then build and release again.',
  ),
  RELEASE_NOT_FOUND: release(
    'No release with this id.',
    'Check the release id; `listReleases` lists the project’s releases.',
  ),
  RELEASE_PROJECT_NOT_FOUND: release(
    'The environment names a project that does not exist.',
    'Check the environment id: its project has been deleted, and nothing can be deployed to it.',
  ),
  // The authoring API plan's Task 8: refused BEFORE anything starts, naming the names.
  RELEASE_SECRET_NOT_SET: release(
    'The release’s manifest.yaml declares a secret (`secret: true`) that has no value in this environment, so nothing was started. Set each name the message lists with `setAppSecret`, then deploy again.',
    'Set each name the message lists in this environment (`setAppSecret`) and deploy again; `listAppSecrets` shows which are set.',
  ),

  // launch/ — §9's two state machines, as the arrows that exist (P6a Task 5)
  LAUNCH_TRANSITION_INVALID: {
    status: 409,
    families: ['LaunchTransitionError'],
    summary:
      'An IAM registration or a privacy assessment was asked to make a move §9 does not have; the message names what that state CAN become.',
    remedy:
      'Move the record along §9’s states one step at a time, to one of the states the message names.',
  },
  LAUNCH_RECORD_INVALID: {
    status: 400,
    families: ['LaunchRecordError'],
    summary:
      'An external record’s fields cannot be accepted — today, an empty registered-attribute list, which §9 measured as the fail-open case.',
    remedy:
      'Correct the fields the message names — a registration lists at least one attribute — and record it again.',
  },
  // launch/records.ts — an owner's "I've sent it" (the launch path plan's Task 9)
  LAUNCH_DRAFT_REQUIRED: {
    status: 409,
    families: ['LaunchRecordError'],
    summary:
      'There is no draft of this registration or privacy assessment to have sent: Manifest drafts it, and what a person sends is that draft.',
    remedy:
      'Draft it first, send the draft to UBC, then say it was sent. Nothing was recorded.',
  },
  LAUNCH_SENT_AT_INVALID: {
    status: 400,
    families: ['LaunchRecordError'],
    summary:
      'The day given for when it was sent cannot be true: it is after today in Vancouver, or before the draft that was sent was made.',
    remedy:
      'Give the day you sent it, as YYYY-MM-DD — today or earlier, and not before the draft’s day — or leave it out for today.',
  },
  LAUNCH_PIA_NOT_APPROVED: {
    status: 409,
    families: ['LaunchRecordError'],
    summary:
      'Neither registration is sent until the privacy assessment is approved and carries its reference, the PIA number UBC IAM asks for. UBC’s order is the assessment first.',
    remedy:
      'Send the privacy assessment first. Once an administrator records it approved, with its PIA number, send the registration and say so again.',
  },
  LAUNCH_STAGING_NOT_REGISTERED: {
    status: 409,
    families: ['LaunchRecordError'],
    summary:
      'The production registration is sent only once the staging registration is active — registered by UBC IAM, and the app tested at staging. UBC’s order is staging before production.',
    remedy:
      'Send the staging registration first. Once an administrator records it active and you have tested the app at staging, send the production registration and say so again.',
  },

  // launch/rehearsal.ts — D21's rehearsal as R2 redefines it (P6a Task 14). Every one of
  // these is a STATE conflict: the project is not in a condition to be rehearsed. A
  // rehearsal that RAN and did not pass is a `200` with `passed: false`, never one of
  // these — a measurement that came out badly is not a request error.
  REHEARSAL_NO_CANDIDATE: rehearsal(
    'Nothing is serving staging, so there is no candidate release to rehearse (§13).',
    'Deploy a release to staging and let it become healthy, then rehearse again.',
  ),
  REHEARSAL_NOT_CWL: rehearsal(
    'The app signs nobody in with CWL, so it registers no Service Provider and there is nothing to rehearse. Its checklist item is met.',
    'Nothing to do: the launch checklist’s rehearsal item is already met for an app with no CWL sign-in.',
  ),
  REHEARSAL_DEPLOY_FAILED: rehearsal(
    'The candidate could not be deployed to production, or the deploy registered no Service Provider.',
    'Read the message and the project’s events for why the deploy failed, fix that, and rehearse again.',
  ),
  REHEARSAL_LAUNCHED: rehearsal(
    'The app has launched, so a rehearsal would put an unapproved candidate on its live production listener. A registration change is proved by UBC IAM’s change request.',
    'Nothing to rehearse: a launched app’s registration change goes to UBC IAM as a change request (§9), which an administrator records (`recordIamRegistration`).',
  ),
  // The launch path plan's Task 6c (the faculty front-end's FE-43): one rehearsal per project at a
  // time, a second REFUSED rather than queued — it would deploy and take down again for nobody.
  REHEARSAL_RUNNING: rehearsal(
    'A rehearsal of this project is already running, so this one was not started and nothing was deployed.',
    'Wait for the running rehearsal to answer — up to about two minutes — then read the launch checklist (`getLaunchReadiness`): its `rehearsal` item says how it went.',
  ),
  // Spec action 8 (c), the launch path plan's Task 6c: the rehearsal could not take its production
  // instance down. A 500, like PROJECT_TEARDOWN_INCOMPLETE — the request is not at fault, and the
  // platform could not finish — and no result is recorded, so this run cannot make §13's item read met.
  REHEARSAL_TEARDOWN_FAILED: {
    status: 500,
    families: ['RehearsalError'],
    summary:
      'The rehearsal ran, but could not take its production instance down afterwards (the message says what is left), so its result was not recorded.',
    remedy:
      'Run the rehearsal again: it deploys the candidate afresh and takes it down again. If it keeps failing, tell a platform administrator: the control plane’s operator log names the step that failed.',
  },

  // source/ — every one is 409 but SOURCE_UNREACHABLE, a 503 (the D5 plan's Task 8).
  // `SOURCE_FOREIGN_REPO` retired in the D5 plan's Task 2: a
  // reference no longer carries a path, so it cannot name a directory the driver did not
  // make, and the one foreign reference left — another driver's — is PROVIDER_MISMATCH.
  SOURCE_COMMIT_NOT_FOUND: source(
    'The repository has no such commit — or what was named is not a full commit id — so there is nothing to build or read from it.',
    'Name the full 40-character id of a commit the repository has; `listCommits` lists them.',
  ),
  SOURCE_CONFLICT: source(
    'The branch moved after the commit this request was computed from; read it again and retry.',
    'Read the tree again (`getTree`) for its `commitSha`, recompute your changes against it, and commit with that as `baseCommit`.',
  ),
  SOURCE_FILE_NOT_TEXT: source(
    'The file is binary or not UTF-8, so it is not read as text.',
    'Read it as bytes: `getFile` with `encoding=base64` answers any file up to 2 MiB. `getTree` marks a binary file `binary: true`.',
  ),
  SOURCE_FILE_TOO_LARGE: source(
    'The file is larger than the API carries in one read — 1 MiB as text, 2 MiB with `encoding=base64`.',
    'A text file between 1 and 2 MiB can be READ with `encoding=base64`, and changed only with git directly, by a push — as can any file past 2 MiB. `getTree` gives every file’s `size`.',
  ),
  SOURCE_GIT_FAILED: source(
    'git failed; the message names the operation.',
    'Retry once; if it recurs, report the time and the operation the message names to the platform’s operator.',
  ),
  SOURCE_GITHUB_KEY_UNREADABLE: source(
    'The GitHub App’s private key cannot be read, or is not an RSA key; the message names the file.',
    'Nothing a client can change: the platform’s operator restores the key file, readable by its owner alone.',
  ),
  SOURCE_GITHUB_REFUSED: source(
    'GitHub refused the request; the message carries GitHub’s own message and nothing else of its answer.',
    'Read GitHub’s message: a limit passes with time, and a permission is the GitHub App installation’s to grant. Retry once it is resolved.',
  ),
  SOURCE_INVALID_SLUG: source(
    'The slug cannot name a repository.',
    'Choose a slug that follows §23’s rule; `checkSlug` checks one.',
  ),
  SOURCE_NOTHING_TO_COMMIT: source(
    'Every change leaves its file as it is in the base commit, so there is nothing to commit.',
    'Nothing to do: every file already reads as you would write it. Read the file again (`getFile`) if you expected a difference.',
  ),
  SOURCE_PATH_CONFLICT: source(
    'A change does not fit the base commit’s tree: a file where a directory is, a path under a file, a symlink or a submodule, something other than a regular file to overwrite or a file to delete, or one path named twice; the message names the path.',
    'Read the tree at `baseCommit` (`getTree`) and change the path the message names: write beside a directory rather than over it, delete a directory’s files one by one, and name each path once. A symlink or a submodule is changed with git directly.',
  ),
  SOURCE_PATH_ESCAPE: source(
    'A slug that would leave the repository root, or a path that is not inside the repository — absolute, or with an empty, `.` or `..` component — or into a repository’s own `.git`.',
    'Name a path relative to the repository root, `/`-separated, with no empty, `.`, `..` or `.git` component.',
  ),
  SOURCE_PATH_NOT_A_FILE: source(
    'The path names a directory, a symlink or a submodule; the API reads and writes regular files.',
    'Name a file; `getTree` says what each path is, and lists a directory’s contents.',
  ),
  SOURCE_PATH_NOT_FOUND: source(
    'The commit has no such path — so there is nothing to read, or to delete.',
    'Check the path against `getTree` at the same commit; paths are case-sensitive.',
  ),
  SOURCE_PROVIDER_MISMATCH: source(
    'The project’s repository was not made by the source driver this control plane runs: either a different driver made it (driver 1’s local repository, or driver 2’s GitHub one), or the same GitHub driver made it against another GitHub — the fake or the real App, told apart by the API host recorded when the repository was made (one recorded before Manifest kept that host is answered by whichever GitHub is running); the message names both the driver or host that made it and the one running.',
    'Use a control plane running the project’s own driver, and for driver 2 the same GitHub (`MANIFEST_GITHUB_API_URL`): a project stays with the driver, and the GitHub, that created its repository.',
  ),
  SOURCE_REF_NOT_FOUND: source(
    'No branch has that name.',
    'Name `main`, another branch the repository has, or a full 40-character commit id.',
  ),
  SOURCE_REPOSITORY_EXISTS: source(
    'A repository of that name already exists — on GitHub, or as a mirror on this machine — and Manifest never adopts one it did not create.',
    'Choose another slug. A leftover repository of that name is removed by whoever owns it; Manifest will not take it over.',
  ),
  SOURCE_REPOSITORY_NOT_PRIVATE: source(
    'GitHub did not create the repository private, so it was deleted.',
    'Create the project again. If it recurs, the GitHub organisation’s settings forbid private repositories, and its administrator changes them.',
  ),
  SOURCE_REPOSITORY_PUBLIC: source(
    'The repository was last read PUBLIC on GitHub and could not be made private; it is not built while it is public (§20).',
    'Make the repository private on GitHub. The next push or read checks it again, and building resumes.',
  ),
  SOURCE_SECRET_DETECTED: source(
    'A commit Manifest was asked to make carries a secret-shaped value, and nothing was committed; the message names path:line and the rule, never the value (§20).',
    'Remove the value from the file — or the commit message — the message names, and never commit a credential: set it as an app secret instead (`setAppSecret`) and read it from the environment. Then commit again. In a file written with `encoding: base64`, the line counts runs of printable text, not lines.',
  ),
  // NOT a state conflict: a client retries a 503 and does not "fix" a 409 (Decision 18).
  SOURCE_UNREACHABLE: {
    status: 503,
    families: ['SourceError'],
    summary: 'The git host did not answer. A commit already mirrored still builds.',
    remedy:
      'Retry when the git host answers. Meanwhile a commit already mirrored still builds, releases and deploys.',
  },

  // observability/output.ts — reading a running app's recent output (§14; the front-end
  // enablement plan's Task 3). Each its own status: production is a refusal of the READ, not a
  // conflict a client can resolve; an instance that no longer runs is a state conflict.
  INSTANCE_OUTPUT_PRODUCTION: {
    status: 403,
    families: ['OutputError'],
    summary:
      'A production instance’s output is not readable (§14): it serves real people, whose input its output can carry.',
    remedy:
      'Read a sandbox instance’s output instead, or a failed production instance’s Incident (`listIncidents`) — its log tail is the only window onto production.',
  },
  // FE-24's code (the front-end enablement plan's sitting 10; §14 as Spec action 6 left it): a
  // SIBLING of the production code rather than a rename of it (D23.8 — a published code keeps its
  // meaning), because the rule it names is staging's own.
  INSTANCE_OUTPUT_STAGING: {
    status: 403,
    families: ['OutputError'],
    summary:
      'A staging instance’s output is not readable (§14): staging serves real people — staging CWL holders at UBC — whose input its output can carry. Decided by the environment’s kind, so a laptop’s staging is refused too.',
    remedy:
      'Read a sandbox instance’s output instead — deploy the same release there (`deploy`) to see what it prints — or a failed staging instance’s Incident (`listIncidents`), whose log tail is the only window onto staging.',
  },
  // The safeguard (§7 as Spec action 10 amended it; the front-end enablement plan's Task 14a): an
  // Incident's log tail is an app's output, and a confidential project's staging and production ones
  // can carry the input of the people the classification protects.
  INCIDENT_LOG_CONFIDENTIAL: {
    status: 403,
    families: ['OutputError'],
    summary:
      'A confidential project’s staging and production Incidents are not answered to a delegated token while the platform lets that project’s building agent use the capable model (§7): their log tails can carry the input of the real people the classification protects, and redaction does not remove names or student numbers.',
    remedy:
      'Read the sandbox’s Incidents instead — its users are test users — or ask the person you work for to read this environment’s Incidents in their own session and tell you, in their own words, what failed — never to paste its log tail or prompt to you, which is what this protects.',
  },
  INSTANCE_OUTPUT_UNAVAILABLE: {
    status: 409,
    families: ['OutputError'],
    summary:
      'The instance no longer runs, or never started, so there is no output to read — Manifest keeps none.',
    remedy:
      'Read the environment’s Incidents (`listIncidents`): a failed instance’s last lines are in its Incident. `listInstances` says which instance is running now.',
  },

  // projects/state.ts — §11's *Ending an app* (Spec action 3; the front-end enablement plan's Task
  // 11, Decisions 27–28). A project's STATE refused the request, not who asked; each code's status
  // is the registry's.
  PROJECT_ARCHIVED: {
    status: 409,
    families: ['ProjectStateError'],
    summary:
      'The project is archived — switched off by its owner (§11) — so it can be read and restored, and nothing else can change.',
    remedy:
      'Restore it (`restoreProject`, the owner or an administrator, in their own session), then deploy to bring it back. A delegated token of an archived project was revoked with it: mint a new one after the restore.',
  },
  PROJECT_TEARDOWN_INCOMPLETE: {
    status: 500,
    families: ['ProjectStateError'],
    summary:
      'Switching the project off, or deleting it, stopped at a step (named in the message). It is archived — nothing new starts — but something it ran, or something a delete destroys, may still be there.',
    remedy:
      'Send the same request again: every finished step answers at once, and the rest continue. The control plane’s next boot finishes an archive too — never a delete, which only the same request finishes. If it keeps stopping at the same step, tell a platform administrator.',
  },
  PROJECT_LAUNCHED_NOT_DELETABLE: {
    status: 409,
    families: ['ProjectStateError'],
    summary:
      'The project has been to production, so it cannot be deleted (§11): its data is disposed of under its retention period and UBC’s sunset procedure, which are the Privacy Office’s, and its production name stays held for good (D26). Nothing was destroyed — and nothing was changed, unless the launch completed while the delete was starting, when the app has been switched off (archived) with everything kept.',
    remedy:
      'Archive it instead (`archiveProject`) to switch it off for everyone; its data and records are kept for their retention period. One the delete switched off is restored with `restoreProject`.',
  },

  // ai/sessions.ts — a model session's start (§10; the front-end enablement plan's Task 10, Spec
  // actions 1 and 5). Each refused BEFORE anything is minted; the statuses are the registry's.
  AGENT_SESSION_ALREADY_STARTED: {
    status: 409,
    families: ['AgentSessionError'],
    summary:
      'This request — its Idempotency-Key — already started an agent session, and its key was answered then. A key is shown once and never again.',
    remedy:
      'Use the key from the first answer. If it was lost, end the session this refusal names (`endAgentSession`) and start another with a new Idempotency-Key.',
  },
  AGENT_BUDGET_EXHAUSTED: {
    status: 409,
    families: ['AgentSessionError'],
    summary:
      'The monthly agent budget of the person this credential acts for is spent, so no key was issued (§10).',
    remedy:
      'Wait for the month to reset (`getAgentBudget` says when), or ask a platform administrator to raise this person’s agent budget.',
  },
  AGENT_NO_MODEL_FOR_CLASSIFICATION: {
    status: 409,
    families: ['AgentSessionError'],
    summary:
      'No model in the platform’s catalogue is approved for this project’s data classification, so no key was issued (D17). An empty model list would be every model to the gateway.',
    remedy:
      'Ask a platform administrator to approve a model for this classification in the catalogue. The classification is the newest valid manifest’s, and never less restrictive than production’s release.',
  },

  // ai/intake.ts — an INTAKE session's start (Spec action 5, FE-1): the platform pays, so each
  // bound is the platform's. A person's day and the platform's month are TWO codes (sitting 7's
  // ruling): only the first is "paused for today".
  INTAKE_SESSION_ALREADY_STARTED: {
    status: 409,
    families: ['AgentSessionError'],
    summary:
      'This request — its Idempotency-Key — already started an intake session, and its key was answered then. A key is shown once and never again.',
    remedy:
      'Use the key from the first answer. If it was lost, end the session this refusal names (`endIntakeSession`) and start another with a new Idempotency-Key.',
  },
  INTAKE_DAILY_LIMIT_REACHED: {
    status: 409,
    families: ['AgentSessionError'],
    summary:
      'This person has started the intake sessions a person may start in a day (§10), so describing new apps is paused for them until midnight, Vancouver time.',
    remedy:
      'Try again tomorrow, or create the project now and continue under an agent session (`startAgentSession`), which is charged to the person instead.',
  },
  INTAKE_BUDGET_EXHAUSTED: {
    status: 409,
    families: ['AgentSessionError'],
    summary:
      'The platform’s monthly intake budget is spent (§10), so describing new apps is paused for everyone until the month resets. It is never charged to a person’s budget instead.',
    remedy:
      'Wait for the month to reset — the first of the month, 00:00 UTC — or ask a platform administrator to raise the intake budget.',
  },
  INTAKE_MODEL_UNAVAILABLE: {
    status: 503,
    families: ['AgentSessionError'],
    summary:
      'The platform’s intake model is not a catalogue model approved for internal data (D17), so intake is paused rather than sent to another model.',
    remedy:
      'A platform administrator names an intake model the catalogue approves for internal data (`MANIFEST_INTAKE_MODEL`).',
  },

  // config.ts — mapped by toErrorResponse, raised at boot
  CONFIG_INVALID: config('A setting failed validation.'),
  CONFIG_GITHUB_INSECURE_URL: config(
    'A GitHub URL is plain http beyond loopback, so an installation token would cross the network in plaintext.',
  ),
  CONFIG_GITHUB_FAKE_OUTSIDE_DEVELOPMENT: config(
    'A GitHub URL names loopback — the fake GitHub a laptop runs — on the GitHub driver outside development.',
  ),
  CONFIG_BUILD_CREDENTIAL_SECRET_REQUIRED: config(
    'MANIFEST_BUILD_CREDENTIAL_SECRET is required outside development.',
  ),
  CONFIG_CONTROL_PLANE_ORIGIN_PORT_MISMATCH: config(
    'A loopback origin names a port the control plane does not listen on.',
  ),
  CONFIG_FRONTEND_ORIGIN_PORT_MISMATCH: config(
    'MANIFEST_FRONTEND_ORIGIN is a loopback origin naming a port the control plane does not listen on.',
  ),
  CONFIG_ORIGINS_SHARE_A_HOST: config(
    'MANIFEST_CONTROL_PLANE_ORIGIN and MANIFEST_FRONTEND_ORIGIN are on one host, so a request could not say which it arrived on.',
  ),
  CONFIG_LITELLM_MASTER_KEY_REQUIRED: config(
    'MANIFEST_LITELLM_MASTER_KEY is required outside development.',
  ),
  CONFIG_MASTER_SECRET_REQUIRED: config(
    'MANIFEST_MASTER_SECRET is required outside development.',
  ),

  // identity/saml.ts and the callback — every one is 401, and the envelope names no detail
  SAML_ASSERTION_REJECTED: saml(
    'The assertion was refused; the operator log says why.',
    'Start the sign-in again at /auth/login. If it keeps failing, report the time to the platform’s operator, whose log has the reason.',
  ),
  SAML_NO_PUID: saml(
    'The assertion released no ubcEduCwlPuid.',
    'Nothing the person can change: the identity provider’s registration for Manifest must release ubcEduCwlPuid. Report it to the platform’s operator.',
  ),
  SAML_USER_UPSERT_FAILED: saml(
    'The user could not be recorded.',
    'Start the sign-in again at /auth/login. If it keeps failing, report the time to the platform’s operator.',
  ),
  SAML_LOGIN_NOT_BOUND: saml(
    'The assertion answers a sign-in this browser did not start.',
    'Start the sign-in again at /auth/login, in the browser that will receive the answer.',
  ),
  /**
   * §20's step-up (P6a Task 8). Both are 401 and both are `SamlError`, because a step-up
   * that cannot be completed IS a failed sign-in from the browser's point of view and
   * `/auth/login` is exactly where to go next — the distinction `SAML_LOGOUT_REJECTED`
   * records does not apply here.
   */
  SAML_STEP_UP_NO_SESSION: saml(
    'The step-up came back to a browser holding no valid session; sign in again.',
    'Sign in again at /auth/login, then step up.',
  ),
  SAML_STEP_UP_WRONG_USER: saml(
    'The step-up assertion is for a different person than the session in this browser.',
    'Step up as the person who is signed in — or sign out, sign in as the other person, and step up then.',
  ),

  /**
   * SINGLE LOGOUT IS NOT SIGN-IN, and this is deliberately not `saml()`. The
   * `SamlError` branch in `errors.ts` answers 401 with *"sign-in could not be
   * completed — start again at /auth/login"*, which fails closed correctly for an
   * assertion and is simply wrong for a LogoutRequest: nobody was signing in, and
   * `/auth/login` is not where to go. The caller here is the IdP, not a person, so
   * an unverifiable request is a malformed one (P5c sitting 9, F11).
   */
  SAML_LOGOUT_REJECTED: api(
    400,
    'The single-logout request could not be verified; the operator log says why.',
    'Nothing a client can change: this endpoint’s caller is the identity provider. The platform’s operator log says why its request could not be verified.',
  ),

  // ai/ — every one is 503, and carries nothing from the gateway (§14)
  AI_PROJECT_BUDGET_EXCEEDED: ai(
    'The app has used its AI budget for the month.',
    'Wait for next month’s budget, or raise `ai.budget.project_monthly_usd` within the project’s AI quota and release again.',
  ),
  AI_USER_BUDGET_EXCEEDED: ai(
    'The person has used their AI allowance for the month.',
    'Wait for next month’s allowance, or ask an administrator to raise it.',
  ),
  AI_MODEL_NOT_PERMITTED: ai(
    'The app’s key does not reach the model it asked for.',
    'Declare the model in manifest.yaml’s `ai.models`, then build, release and deploy: an app’s key reaches only the models its release declares.',
  ),
  AI_ROUTE_NOT_PERMITTED: ai(
    'The app’s key does not reach that gateway route.',
    'Call the gateway only through the routes the blueprint’s AI client uses; the key reaches no others.',
  ),
  AI_KEY_REVOKED: ai(
    'The app’s key was revoked.',
    'Deploy the app again: a deploy issues its instance a new key.',
  ),
  AI_KEY_EXPIRED: ai(
    'The app’s key expired.',
    'Deploy the app again: a deploy issues its instance a new key.',
  ),
  AI_MODEL_UNKNOWN: ai(
    'The gateway does not know the model.',
    'Use a logical model name from the catalogue, never a vendor’s model id.',
  ),
  AI_BACKEND_UNAVAILABLE: ai(
    'The gateway could not be reached.',
    'Retry later: the AI gateway did not answer.',
  ),
  AI_UNMAPPED: ai(
    'The gateway answered with a failure this platform does not map.',
    'Retry once; if it recurs, report the time to the platform’s operator, whose log has the gateway’s answer.',
  ),
  AI_CATALOGUE_EMPTY: {
    status: 503,
    families: ['CatalogueError'],
    summary: 'The gateway returned an empty model catalogue.',
    remedy:
      'Retry later, or ask an administrator: the AI gateway lists no models, so none can be declared or checked.',
  },
  AI_CATALOGUE_DISABLED: {
    status: 503,
    families: ['CatalogueError'],
    summary: 'AI is switched off on this control plane.',
    remedy:
      'Ask an administrator to switch AI on. A build or release can go on without AI: remove `ai.models` from manifest.yaml. A member removal or a token revocation answered this has already happened: repeat it once AI is back on, to end the agent sessions it left.',
  },
} as const satisfies Record<string, Entry>

export type ErrorCode = keyof typeof ERROR_CODES

export const ERROR_CODE_LIST = Object.keys(ERROR_CODES).sort() as readonly ErrorCode[]

/** The codes inside `details` (a `ManifestError[]`): §7's schema, its policy, and §25's compatibility check. */
export type ManifestErrorCode =
  | (typeof SPEC_CODES)[keyof typeof SPEC_CODES]
  | (typeof POLICY_CODES)[keyof typeof POLICY_CODES]
  | (typeof BLUEPRINT_CODES)[keyof typeof BLUEPRINT_CODES]

export const MANIFEST_ERROR_CODE_LIST: readonly ManifestErrorCode[] = [
  ...Object.values(SPEC_CODES),
  ...Object.values(POLICY_CODES),
  ...Object.values(BLUEPRINT_CODES),
].sort()

/**
 * THE CODES INSIDE `details`, EACH WITH A MEANING AND A REMEDY — published as
 * `x-enumDescriptions` on `ManifestErrorCode` and the top-level `x-manifest-spec-errors`
 * (the authoring API plan's Task 9). They are what an agent writing `manifest.yaml` meets most,
 * and until this map they published nothing. **Here, beside the list the contract is built
 * from, and not beside each code's definition**: this is the public text, and `Record<
 * ManifestErrorCode, …>` makes `tsc` refuse a code added in `spec/` or `blueprints/` without
 * one. Each `ManifestError` still carries its own `message` and `hint` per instance — those
 * name the values; this names the rule.
 */
export const MANIFEST_ERRORS: Record<
  ManifestErrorCode,
  { summary: string; remedy: string }
> = {
  // §7's schema (spec/errors.ts)
  SPEC_BUILD_BLOCK_FORBIDDEN: {
    summary:
      'manifest.yaml supplies its own build definition (`runtime.build`); the Dockerfile is the blueprint’s (D13).',
    remedy: 'Remove `runtime.build`. Declare what the app needs — never how to build it.',
  },
  SPEC_UNKNOWN_KEY: {
    summary: 'A key §7 does not define at that path.',
    remedy: 'Remove or rename the key; the hint lists the keys that path accepts.',
  },
  SPEC_PATH_EXPECTED: {
    summary: 'A field that takes a path was given a URL.',
    remedy:
      'Write a path beginning `/`, such as `/auth/ubcshib/callback`; Manifest derives the origin itself (D15).',
  },
  SPEC_INVALID_SLUG: {
    summary: '`name` is not a valid project slug.',
    remedy:
      'Set `name` to the project’s slug: 3 to 39 lower-case letters, digits and hyphens, starting with a letter.',
  },
  SPEC_RESERVED_BLOCK_NOT_EMPTY: {
    summary:
      '`integrations`, `jobs` or `checks` is not empty; §15 reserves each, empty, in schema version 1.',
    remedy: 'Leave the block out, or leave it as an empty list.',
  },
  SPEC_INVALID_BLUEPRINT_REF: {
    summary: '`blueprint` is not a name pinned to a major version.',
    remedy:
      'Write it as `name@major` — the project’s own pin, which `getProject` answers as `blueprint`.',
  },
  SPEC_INVALID_VALUE: {
    summary: 'A value has the wrong type, or is outside what §7 permits.',
    remedy:
      'Correct the value the path names. This document’s `ManifestYaml` schema gives every field’s type and permitted values.',
  },
  SPEC_YAML_PARSE_FAILED: {
    summary: 'manifest.yaml is not valid YAML.',
    remedy:
      'Fix the YAML at the place the message names; YAML indents with spaces, never tabs.',
  },
  // §7's policy (spec/policy.ts)
  SPEC_ENV_NAME_RESERVED: {
    summary: 'An `env` entry declares a variable the platform sets for every app (§8).',
    remedy:
      'Remove the entry, or choose another name: the platform’s value always wins, so this line would do nothing.',
  },
  SPEC_NAME_SLUG_MISMATCH: {
    summary: '`name` is not the project’s slug.',
    remedy: 'Set `name` to the project’s slug, which `getProject` answers as `slug`.',
  },
  SPEC_SERVICE_TYPE_UNKNOWN: {
    summary: 'A service type this platform does not offer.',
    remedy: 'Use a service type the hint lists — the ones this platform can provision.',
  },
  SPEC_ATTRIBUTE_NOT_WHITELISTED: {
    summary: 'A CWL attribute UBC does not release to applications.',
    remedy:
      'Use an attribute the hint lists. The person’s identifier is `ubcEduCwlPuid`, never `uid`.',
  },
  SPEC_ATTRIBUTE_NOT_REGISTERED: {
    summary:
      'A launched app asks for a CWL attribute its recorded IAM registration does not release (§7); refused when the production build runs.',
    remedy:
      'Remove the attribute from `auth.attributes`, or have UBC IAM approve the registration’s change and record it (`recordIamRegistration`), then build again.',
  },
  SPEC_MODEL_UNKNOWN: {
    summary: 'A model the catalogue does not name.',
    remedy: 'Use a logical model name the hint lists, never a vendor’s model id.',
  },
  SPEC_MODEL_UNCLASSIFIED: {
    summary: 'A model with no data classification, which no app may use (D17).',
    remedy: 'Choose another model, or ask an administrator to classify this one.',
  },
  SPEC_MODEL_CLASSIFICATION_TOO_LOW: {
    summary: 'A model that is not approved for the app’s `data.classification` (D17).',
    remedy:
      'Choose a model approved for that classification, or lower `data.classification` if it is overstated.',
  },
  SPEC_AI_DISABLED: {
    summary: 'The manifest declares models, and this platform offers none.',
    remedy: 'Remove `ai.models`, or ask an administrator to switch AI on.',
  },
  SPEC_AI_BUDGET_REQUIRED: {
    summary:
      'The manifest declares a model and its AI budget is $0, which would refuse every request the app makes.',
    remedy:
      'Set `ai.budget.project_monthly_usd` above 0, or leave it out to use the project’s AI quota — and if that quota is $0, ask an administrator to raise it.',
  },
  SPEC_QUOTA_EXCEEDED: {
    summary:
      'A resource, the number of services, or the AI budget is above the project’s quota.',
    remedy:
      'Lower what the manifest asks for, or ask an administrator to raise the quota.',
  },
  SPEC_FIELD_NOT_ENFORCED: {
    summary:
      'A WARNING, not an error: a field Manifest validates and records with the release but does not enforce yet — today `ai.budget.per_user_monthly_usd`, not enforced before Phase 4 (§10). The manifest is valid.',
    remedy:
      'Nothing to fix. Keep the value if you mean it — it applies once Manifest enforces it; what limits the app today is `ai.budget.project_monthly_usd`.',
  },
  SPEC_BLUEPRINT_NOT_PINNED: {
    summary:
      '`blueprint` names a different blueprint from the one the project is pinned to; a commit cannot move a project.',
    remedy: 'Set `blueprint` to the project’s pin, which the hint names.',
  },
  // §25's compatibility check (blueprints/compatibility.ts)
  BLUEPRINT_SERVICE_UNSUPPORTED: {
    summary: 'The pinned blueprint cannot bind that service type (§25).',
    remedy: 'Use a service type the hint lists, which the pinned blueprint can bind.',
  },
  BLUEPRINT_AUTH_UNSUPPORTED: {
    summary: 'The pinned blueprint does not support that `auth.provider` (§25).',
    remedy:
      'Set `auth.provider` to one the hint lists, which the pinned blueprint supports.',
  },
  BLUEPRINT_AI_UNSUPPORTED: {
    summary: 'The pinned blueprint does not provide AI (§25).',
    remedy: 'Remove `ai.models`: an app gets AI only from a blueprint that provides it.',
  },
  BLUEPRINT_SCHEMA_VERSION_UNSUPPORTED: {
    summary:
      'The pinned blueprint does not understand this `manifest:` schema version (§25).',
    remedy: 'Set `manifest:` to a schema version the hint lists.',
  },
}
