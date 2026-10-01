import { z } from 'zod/v4'
import {
  approvalDecision,
  environmentKind,
  iamRegistrationState,
  instanceState,
  memberRole,
  privacyAssessmentState,
} from '../db/index.js'
import type { EventType } from './events.js'

/**
 * EVERY EVENT TYPE'S `machineDetail`, as a schema (P5a Decision 33). Enforced where events
 * are written — `recordEvent` refuses a detail that does not parse — and published as the
 * contract's EventFrame union, so a client switches on `type` and gets a typed payload, and
 * the document cannot describe a shape nothing produces.
 *
 * **STRICT OBJECTS, so the document cannot under-describe either.** A representation's
 * objects are `additionalProperties: false` in the document; a plain `z.object` would let a
 * call site add a key the document says no client will ever see, and parsing would pass it.
 * Refusing it — not stripping it, which would lose it from the audit trail with nothing
 * saying so — makes the author of that call site add it here, where a client reads it.
 *
 * Validated BEFORE redaction. Redaction only rewrites strings, and nothing below constrains
 * a string that a redactor could rewrite: an id is a UUID and a commit is hex, both of which
 * the heuristics leave alone by design (`observability/redact.ts`).
 *
 * **Adding an event type is FOUR edits** — this map, `EVENT_TYPES`, the database's CHECK (a
 * migration) and `EXAMPLE_DETAILS` in `observability/examples.ts` — and `events.test.ts` holds
 * each pair equal. It said three until P5a Task 14 counted them: `EXAMPLE_DETAILS` became the
 * fourth in Task 12 and nothing here said so. The contract's `EventFrame` union is NOT a fifth:
 * `api/representations/events.ts` builds it from `EVENT_TYPES` and this map, so a new type
 * appears in the document by construction (and `pnpm contract:write` then shows the drift).
 *
 * Read from the call sites on 2026-09-17: `sso/registration.ts`, `releases/build.ts`,
 * `releases/release.ts`, `releases/retire.ts` and `api/routes/projects.ts`.
 *
 * **EVERY TYPE AND EVERY FIELD IS DESCRIBED, AND THE DESCRIPTIONS ARE PUBLIC** (the authoring API
 * plan's Task 9): the contract's `EventFrame` carries each field's, and the stream's
 * `x-manifest-event-types` publishes each TYPE's — the `.describe()` on its map entry below, one
 * sentence saying what happened and when — beside its example from `examples.ts`. So the
 * `.describe()` strings are public text (`api/contract/docs.test.ts` holds them to that); the
 * comments are not. A shared shape is described per TYPE, on the map entry, because four types
 * sharing `InstanceDetail` mean four different things.
 */
const Kind = z
  .enum(environmentKind.enumValues)
  .describe('Which of the project’s three environments.')
const Uuid = z.uuid()
const Sha = z.string().regex(/^[0-9a-f]{40}$/)
const Via = z
  .enum(['session', 'token'])
  .describe(
    'How the person acted: `session` in their own interactive session, `token` through a delegated token they minted.',
  )
const ActingUser = Uuid.describe(
  'The person who acted — for a token, the person who minted it. `listMembers` names them.',
)
/** §13's two roles on a project — the database's own enum, as the Member representation reads it. */
const MemberRole = z.enum(memberRole.enumValues)
const ActingToken = Uuid.nullable().describe(
  'The delegated token that acted (`listTokens`); null when the person acted in their own session.',
)
const Ref = z
  .string()
  .regex(/^refs\/heads\/.+$/)
  .describe('The branch, as git names it: `refs/heads/main`.')
/** Where and which rule — NEVER THE VALUE (§14): a finding carries no text of its line. */
const Finding = z.strictObject({
  path: z.string().min(1).describe('The file, from the repository root.'),
  line: z
    .number()
    .int()
    .min(1)
    .describe(
      'The line, counting from 1 — in a file written through the API with `encoding: base64`, the run of printable text, counting from 1.',
    ),
  rule: z
    .string()
    .min(1)
    .describe(
      'Which kind of secret it looks like — `an AWS access key id`. Never the value.',
    ),
})
/** Task 8's two events share one shape: which name, where, and who — never the value. */
const AppSecretChange = z.strictObject({
  environmentKind: Kind,
  name: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,127}$/)
    .describe('The secret’s name, as manifest.yaml declares it. Never its value.'),
  via: Via,
  userId: ActingUser,
  tokenId: ActingToken,
})

const InstanceDetail = z.strictObject({
  instanceId: Uuid.describe('The instance (`listInstances`).'),
  releaseId: Uuid.describe('The release it runs (`getRelease`).'),
  environmentId: Uuid.describe('Its environment (`getEnvironment`).'),
  environment: Kind,
  // The database's own enum, as the Instance representation reads it (P5a sitting 6).
  state: z
    .enum(instanceState.enumValues)
    .describe('The state the instance moved to (§11).'),
})

/**
 * Both halves of §13's approval answer (P6a Decision 14). One shape for two types, so a
 * client switches on the TYPE rather than reading a field to find out what happened —
 * `decision` is carried as well because the audit trail is read as rows, not as a switch.
 */
const ApprovalDetail = z.strictObject({
  releaseId: Uuid.describe(
    'The release decided on (`getApproval` has the whole decision).',
  ),
  imageDigest: z
    .string()
    .describe(
      'The first 19 characters of the image digest decided on — recognisable, and never mistaken for the binding itself.',
    ),
  decision: z
    .enum(approvalDecision.enumValues)
    .describe('What the administrator decided.'),
})

/**
 * `handle` is the driver's name for the container, which Decision 23 keeps out of an
 * `Instance`. It is here because a container a crash or a truncated database left has NO
 * row, and the handle is then the only thing naming what was removed — §14's trail matters
 * most once the thing is gone. The event's `subject` carries it for the same reason.
 */
const RetireDetail = z.strictObject({
  instanceId: Uuid.nullable().describe(
    'The instance being retired; null for a container no instance row names any more, which `handle` then names.',
  ),
  handle: z
    .string()
    .describe(
      'The runtime’s own name for the container — what an operator would look for.',
    ),
  environment: Kind,
  drainMs: z
    .number()
    .int()
    .nonnegative()
    .describe(
      'How long, in milliseconds, requests already in flight are given to finish before the container stops (§11).',
    ),
})

const Commit = Sha.describe('A full 40-character commit id.')

export const EVENT_DETAIL_SCHEMAS = {
  'sso.registered': z
    .strictObject({
      entityId: z.string().describe('The app’s SAML entity id in this environment (§9).'),
      acsUrl: z.string().describe('Where the identity provider sends its assertions.'),
      attributes: z
        .array(z.string())
        .describe('The CWL attributes the identity provider releases to the app.'),
      certificateFingerprint: z
        .string()
        .describe('The SHA-256 fingerprint of the app’s SAML signing certificate.'),
      changed: z
        .boolean()
        .describe(
          'Whether the registration differs from the one before; false when it was written again unchanged.',
        ),
    })
    .describe(
      'The app’s SAML Service Provider registration with the identity provider was written for one environment (§9).',
    ),
  'sso.acs_changed': z
    .strictObject({
      from: z
        .string()
        .nullable()
        .describe('Where assertions were sent before; null for a first registration.'),
      to: z.string().describe('Where they are sent now.'),
    })
    .describe(
      'Where the app receives CWL sign-in assertions moved (§9). Worth a person’s attention: it is where a sign-in is sent.',
    ),
  'build.started': z
    .strictObject({
      buildId: Uuid.describe('The build (`getBuild`); its log streams after this event.'),
      commitSha: Commit,
      blueprintRef: z
        .string()
        .describe('The blueprint it is built with, `name@major` (§25).'),
    })
    .describe(
      'A build began (§14). Its log lines follow on the stream as LogFrames, and `build.succeeded` or `build.failed` ends it.',
    ),
  'build.succeeded': z
    .strictObject({
      buildId: Uuid.describe('The build (`getBuild`).'),
      imageDigest: z
        .string()
        .nullable()
        .describe('The image’s content digest, `sha256:…` — what a release freezes.'),
      imageRepository: z
        .string()
        .nullable()
        .describe('Where the image is stored in the platform’s registry.'),
    })
    .describe(
      'A build finished and passed every gate (§12); create a release from it next.',
    ),
  'build.failed': z
    .strictObject({
      buildId: Uuid.describe(
        'The build (`getBuild`); `getBuildLog` has its whole output.',
      ),
      code: z
        .string()
        .nullable()
        .describe(
          'A stable code for the failure when there is one; null for a failure with no code.',
        ),
      reason: z
        .string()
        .describe(
          'Redacted at capture (§14). For the agent; the human message is for a person.',
        ),
    })
    .describe(
      'A build failed. `reason` says why, and `getBuildLog` has the whole output to correct it from.',
    ),
  'instance.provisioning': InstanceDetail.describe(
    'A deploy made an instance and is binding its services — the first step of a deploy (§11).',
  ),
  'instance.starting': InstanceDetail.describe(
    'The instance’s services are bound and the runtime is starting it, beside the one already serving (§11).',
  ),
  'instance.healthy': InstanceDetail.describe(
    'The instance passed its health check and now serves the environment; a deploy has succeeded (§11).',
  ),
  'instance.failed': InstanceDetail.extend({
    failedCheck: z
      .string()
      .describe(
        'Which check it failed, and how — the health check, and what it answered.',
      ),
  }).describe(
    'The instance never became healthy — whatever was already serving keeps serving — and an Incident records why (§11, §14).',
  ),
  'incident.opened': z
    .strictObject({
      incidentId: Uuid.describe('The Incident (`listIncidents`).'),
      instanceId: Uuid.describe('The instance that failed.'),
      releaseId: Uuid.describe('The release it ran.'),
      environment: Kind,
    })
    .describe(
      'An Incident was recorded for a failed instance (§14): its logs, redacted, and a prompt an agent can work from.',
    ),
  'ai.key_rotated': z
    .strictObject({
      instanceId: Uuid.describe('The instance the key was issued to.'),
      environment: Kind,
      models: z.array(z.string()).describe('The logical models the new key reaches.'),
    })
    .describe(
      'The app’s AI key was replaced by a deploy that became healthy (§10). The key itself is never in an event.',
    ),
  'instance.retiring': RetireDetail.describe(
    'An instance a deploy replaced is finishing the requests it already had, before it stops (§11).',
  ),
  'instance.retired': RetireDetail.describe(
    'A replaced instance finished: its container is gone and its AI key is revoked (§11).',
  ),
  'instance.retire_failed': RetireDetail.extend({
    error: z.string().describe('A code or an error class name — never a message (§14).'),
  }).describe(
    'A replaced instance could not be retired, and will be tried again — never silently (§11).',
  ),
  'project.created': z
    .strictObject({
      slug: z
        .string()
        .describe(
          'The project’s slug (§23) — what its hostnames and repository are made from, and never changes.',
        ),
      blueprint: z.string().describe('Its blueprint, `name@major` (§25).'),
      starter: z
        .string()
        .nullable()
        .describe('The starter it was seeded from; null for the skeleton alone.'),
      // §24's two answers. The same lists as the Audience representation, which this module
      // cannot import; `api/stream-contract.test.ts` holds them equal.
      audience: z
        .strictObject({
          scale: z
            .enum(['solo', 'class', 'large_course', 'public'])
            .describe('§24: how many people the app is for.'),
          burst: z
            .enum(['steady', 'synchronised'])
            .describe('§24: whether they arrive steadily or all at once.'),
        })
        .describe('Who the app is for, as its owner answered at creation (§24).'),
    })
    .describe(
      'A project and its three environments were created (§22). `repository.seeded` and `spec.validated` follow.',
    ),
  'repository.seeded': z
    .strictObject({
      commitSha: Commit,
      files: z
        .number()
        .int()
        .positive()
        .describe('How many files the first commit holds.'),
      starter: z
        .string()
        .nullable()
        .describe('The starter laid over the skeleton; null for the skeleton alone.'),
    })
    .describe(
      'The project’s repository was created and its first commit made, from the blueprint’s skeleton and starter (§25).',
    ),
  /**
   * D24 (P5b Task 4). NO `projectId` — the event ROW carries it, and every other detail
   * in this map leaves it to the column rather than storing a second copy. NO secret and
   * NO hash: §14, and `redact.ts` would not catch either (`[M9]`).
   */
  'token.minted': z
    .strictObject({
      tokenId: Uuid.describe('The token (`listTokens`).'),
      capabilities: z.array(z.string()).describe('What it may do (D24).'),
      expiresAt: z.iso.datetime().describe('When it stops working, in UTC.'),
    })
    .describe(
      'A person minted a delegated token for this project (D24). Never carries the token or its hash.',
    ),
  /**
   * D24 (P5b Task 6). The QUESTION, not what was in it: no body, no fingerprint hash and
   * no summary — the row carries those, and this is the audit trail a person reads.
   * `projectId` is the event's own column, as everywhere else in this map.
   */
  'pending_action.created': z
    .strictObject({
      pendingActionId: Uuid.describe('The question (`getPendingAction`).'),
      tokenId: Uuid.describe('The token that asked.'),
      action: z.string().describe('The privileged capability it asked to use (D24).'),
    })
    .describe(
      'A delegated token asked for one of D24’s privileged actions, and a person must confirm or reject it in the console.',
    ),
  /**
   * D24 (P5b Task 7). `resolvedBy` is WHO answered, which is the whole point of the
   * record: §20's audit trail has to say which person let a delegated token past D24's
   * rule. No reason — a confirmation needs none, and the human sentence carries the rest.
   */
  'pending_action.confirmed': z
    .strictObject({
      pendingActionId: Uuid.describe('The question (`getPendingAction`).'),
      tokenId: Uuid.describe('The token that asked.'),
      action: z.string().describe('The privileged capability it asked to use (D24).'),
      resolvedBy: Uuid.describe('The person who confirmed it.'),
    })
    .describe(
      'A person confirmed a token’s pending action, which grants that one request exactly one retry (D24).',
    ),
  /** The other answer. `reason` is the person's own words, which is what the agent is told. */
  'pending_action.rejected': z
    .strictObject({
      pendingActionId: Uuid.describe('The question (`getPendingAction`).'),
      tokenId: Uuid.describe('The token that asked.'),
      action: z.string().describe('The privileged capability it asked to use (D24).'),
      resolvedBy: Uuid.describe('The person who rejected it.'),
      reason: z.string().describe('Why, in their own words — what the agent is told.'),
    })
    .describe(
      'A person rejected a token’s pending action; a retry of it is refused `TOKEN_ACTION_REJECTED` (D24).',
    ),
  'spec.validated': z
    .strictObject({
      appSpecId: Uuid.describe('The recorded validation (`getSpec` reads the newest).'),
      commitSha: Commit,
      valid: z.boolean().describe('Whether manifest.yaml at that commit is valid.'),
      errorCount: z
        .number()
        .int()
        .nonnegative()
        .describe('How many errors it has; 0 when it is valid.'),
    })
    .describe(
      'manifest.yaml at a commit was validated — by a commit through the API, a push, or `validateSpec` — valid or not (§7).',
    ),
  /**
   * §9 and R1 (P6a Task 6). **THE TICKET REFERENCE IS HERE AND THE ATTRIBUTES ARE NOT**:
   * a list of requested CWL attributes on a project's stream is more than the stream needs
   * to carry, so the COUNT goes here and `getLaunchRecords` is where a member reads the
   * list itself. `projectId` is the event's own column, as everywhere else in this map.
   */
  'iam_registration.recorded': z
    .strictObject({
      state: z
        .enum(iamRegistrationState.enumValues)
        .describe('The registration’s state, as UBC IAM gave it (§9).'),
      environment: z
        .enum(['staging', 'production'])
        .describe('Which registration: the staging one, or production’s.'),
      entityId: z.string().describe('The entity id registered.'),
      externalTicketRef: z
        .string()
        .nullable()
        .describe('UBC IAM’s own reference for the request; null when none was given.'),
      attributeCount: z
        .number()
        .int()
        .positive()
        .describe('How many attributes are registered; `getLaunchRecords` lists them.'),
    })
    .describe(
      'An administrator recorded what UBC IAM registered for the app’s staging or production sign-in.',
    ),
  /** The same shape for the other external record. No reviewer note — §14, and the row has it. */
  'privacy_assessment.recorded': z
    .strictObject({
      state: z
        .enum(privacyAssessmentState.enumValues)
        .describe('The assessment’s state, as the Privacy Office gave it (§9).'),
      externalTicketRef: z
        .string()
        .nullable()
        .describe('The Privacy Office’s own reference; null when none was given.'),
    })
    .describe(
      'An administrator recorded what UBC’s Privacy Office said of the app’s privacy impact assessment (§9).',
    ),
  /**
   * AN OWNER'S *"I'VE SENT IT"* (the launch path plan's Task 9). The day, never the moment — a person
   * says which day they sent it — and never the package: a project's stream carries that a request
   * went, and `getLaunchRecords` is where a member reads what it said.
   */
  'iam_registration.submitted': z
    .strictObject({
      environment: z
        .enum(['staging', 'production'])
        .describe('Which registration was sent: the staging one, or production’s.'),
      sentAt: z
        .string()
        .describe('The day it was sent, `YYYY-MM-DD`, as the person who sent it said.'),
      externalTicketRef: z
        .string()
        .nullable()
        .describe(
          'UBC IAM’s reference for the request; null when the person had none yet.',
        ),
    })
    .describe(
      'A person said the app’s staging or production registration request was sent to UBC IAM. It now waits for UBC’s answer, which an administrator records.',
    ),
  'privacy_assessment.submitted': z
    .strictObject({
      sentAt: z
        .string()
        .describe('The day it was sent, `YYYY-MM-DD`, as the person who sent it said.'),
      externalTicketRef: z
        .string()
        .nullable()
        .describe('The Privacy Office’s reference; null when the person had none yet.'),
    })
    .describe(
      'A person said the app’s privacy impact assessment was sent to UBC’s Privacy Office. It now waits for the Office’s answer, which an administrator records.',
    ),
  'iam_registration.drafted': z
    .strictObject({
      environment: z
        .enum(['staging', 'production'])
        .describe('Which registration was drafted: the staging one, or production’s.'),
      entityId: z
        .string()
        .describe(
          'The Service Provider entity ID the draft registers, for that environment.',
        ),
      fromCommit: z
        .string()
        .describe('The commit whose manifest and code the draft was drawn from.'),
      attributeCount: z
        .number()
        .int()
        .describe(
          'How many attributes the draft asks for. The names are in the record, not here.',
        ),
      unusedCount: z
        .number()
        .int()
        .describe(
          'How many of them nothing in the app was found reading — each to remove before sending.',
        ),
    })
    .describe(
      'Manifest drafted the app’s staging or production registration request for a person to send to UBC IAM. Nothing was sent; the draft is on the record.',
    ),
  'privacy_assessment.drafted': z
    .strictObject({
      fromCommit: z
        .string()
        .describe('The commit whose manifest the draft was drawn from.'),
      gapCount: z
        .number()
        .int()
        .describe(
          'How many things the draft names for the owner to add before sending — what Manifest cannot know. The draft itself is on the record, not here.',
        ),
    })
    .describe(
      'Manifest drafted the app’s privacy impact assessment for a person to complete and send to UBC’s Privacy Office. Nothing was sent; the draft is on the record.',
    ),
  /**
   * D21 as R2 redefines it (P6a Task 14). The COUNT of attributes released, never the
   * names, and never the assertion or a NameID — `launch/rehearsal.ts` holds the evidence.
   */
  'rehearsal.completed': z
    .strictObject({
      rehearsalId: Uuid.describe(
        'The rehearsal (`getLaunchReadiness` reads the newest).',
      ),
      releaseId: Uuid.describe('The candidate release rehearsed.'),
      passed: z.boolean().describe('Whether the production-shaped sign-in worked.'),
      attributeCount: z
        .number()
        .int()
        .nonnegative()
        .describe('How many attributes the sign-in released.'),
    })
    .describe(
      'A production-shaped rehearsal of the app’s CWL sign-in ran for the release serving staging, and passed or did not (D21).',
    ),
  /**
   * §13 (P6a Task 10). **THE DIGEST, NOT THE DIFF.** The diff is on the approval row and is
   * read through `getApproval`; an event goes on a project's stream and a manifest diff can
   * name services, attributes and egress destinations (§14's redaction argument, applied by
   * omission). The digest is truncated to its first 19 characters, which is enough to
   * recognise and not enough to be mistaken for the binding itself.
   */
  'release.approved': ApprovalDetail.describe(
    'An administrator approved a release for production, bound to the image digest it froze (§13).',
  ),
  /** The same detail; the reason is in the human message, in the administrator's own words. */
  'release.approval_rejected': ApprovalDetail.describe(
    'An administrator rejected a release for production, which is final for that release (§13); the sentence carries their reason.',
  ),
  /**
   * §13 D9 (P6b Task 4): the first production deploy for purpose `launch` that became
   * healthy. Written ONCE per project — `recordLaunch`'s WHERE clause, not a read-then-write.
   */
  'project.launched': z
    .strictObject({
      releaseId: Uuid.describe('The release that launched it.'),
      instanceId: Uuid.describe('The production instance that became healthy.'),
      imageDigest: z
        .string()
        .describe(
          'The first 19 characters — recognisable, and never mistaken for the binding.',
        ),
    })
    .describe(
      'The app’s first production launch became healthy (§13 D9). Published once per project, ever.',
    ),
  /**
   * D5 driver 2 (the D5 plan's Task 9). COMMIT IDS AND A REF, NOTHING ELSE: no author, no
   * message and no GitHub body, which are free text somebody else wrote (§14). `from` is
   * null for a branch that appeared.
   */
  'repository.pushed': z
    .strictObject({
      ref: Ref,
      from: Sha.nullable().describe(
        'Where the branch was; null for a branch that appeared.',
      ),
      to: Sha.describe('Where it is now.'),
    })
    .describe(
      'A branch moved on GitHub and Manifest’s copy took it (D5). Commit ids only — never an author or a message.',
    ),
  /** `mirror` is what Manifest kept (§13's buildable history); `upstream` is GitHub's now. */
  'repository.history_rewritten': z
    .strictObject({
      ref: Ref,
      mirror: Sha.describe(
        'What Manifest kept — the history an approved release may name.',
      ),
      upstream: Sha.describe('What GitHub has now.'),
    })
    .describe(
      'A branch’s history was rewritten on GitHub; Manifest kept the history its releases name, and reads GitHub’s for what comes next (§13).',
    ),
  /** `detail` is Manifest's own sentence — never GitHub's error body (Task 10). */
  'repository.visibility_enforced': z
    .strictObject({
      observed: z
        .literal('public')
        .describe('What the repository was found to be on GitHub.'),
      result: z
        .enum(['private', 'still-public'])
        .describe(
          '`private` when Manifest made it private again; `still-public` when it could not, and nothing is built from it until it is private.',
        ),
      detail: z.string().describe('Manifest’s own sentence about what happened.'),
    })
    .describe(
      'The repository was found public on GitHub, and was made private again or could not be (§20).',
    ),
  /**
   * Task 11. WHERE, AND WHICH RULE — NEVER THE VALUE (§14): a finding carries no text of the
   * line it was found on. At most 50 per commit; `truncated` says there were more.
   */
  'repository.secret_detected': z
    .strictObject({
      commit: Sha.describe('The commit that added the value.'),
      findings: z
        .array(Finding)
        .min(1)
        .max(50)
        .describe('Where each value is, and what kind — at most 50.'),
      truncated: z.boolean().describe('True when there were more than 50.'),
    })
    .describe(
      'A commit pushed to GitHub adds a value shaped like a secret (§20). Never the value; the commit is never deployed with it.',
    ),
  /**
   * The authoring API plan's Task 12. COMMIT IDS ONLY: the scan read none of these commits'
   * lines, so there is nothing else to say about them — and nothing of their content is here.
   */
  'repository.scan_incomplete': z
    .strictObject({
      commits: z
        .array(Sha)
        .min(1)
        .describe('The commits whose own changes were too large to scan, oldest first.'),
    })
    .describe(
      'Commits pushed to GitHub were too large for Manifest to scan for secrets (§20). Nothing in them was read; a build of any commit still scans the whole tree it builds.',
    ),
  /**
   * Task 12. `detail` is MANIFEST's sentence; GitHub's own words are on the project's
   * repository link, not in an event (a GitHub body never goes into one verbatim).
   */
  'repository.protection_unavailable': z
    .strictObject({
      ref: Ref,
      detail: z.string().describe('Manifest’s own sentence about why.'),
    })
    .describe(
      'GitHub would not protect the new repository’s `main`, so a person can rewrite or delete it there; `getProject`’s repository says so too.',
    ),
  /**
   * The authoring API plan's Task 6. COUNTS AND IDS — never a path, a file's content or the
   * message, which are an agent's free text (§14); the sentence carries the subject, cut at 72.
   * `userId` is the person — for a token, its minter — and `tokenId` the token, or null.
   */
  'repository.committed': z
    .strictObject({
      commitSha: Sha.describe('The commit made.'),
      parent: Sha.describe('The commit it was made on — the request’s `baseCommit`.'),
      added: z.number().int().nonnegative().describe('How many files it added.'),
      modified: z.number().int().nonnegative().describe('How many files it changed.'),
      deleted: z.number().int().nonnegative().describe('How many files it deleted.'),
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'A commit was made through Manifest’s API (`createCommit`) — the platform’s own record of who made it, which `listCommits` reads as `madeThrough`.',
    ),
  /** Where and which rule — NEVER THE VALUE (§20; Decision 10), exactly as `secret_detected`. */
  'repository.secret_refused': z
    .strictObject({
      findings: z.array(Finding).min(1).describe('Where each value was, and what kind.'),
    })
    .describe(
      'A commit Manifest was asked to make carried a value shaped like a secret, and was refused (§20). Never the value.',
    ),
  /**
   * The authoring API plan's Task 8. The environment and the NAME — never the value — and who:
   * `userId` is the person (for a token, its minter) and `tokenId` the token or null, because
   * `audit.events` has no actor column and a sentence is not a record (Task 6's reason).
   */
  'app_secret.set': AppSecretChange.describe(
    'A value was set for one of the app’s secrets in one environment; the next deploy there renders it. Never the value.',
  ),
  'app_secret.cleared': AppSecretChange.describe(
    'A secret’s value was removed from one environment; deploying a release that declares it there is refused until it is set again.',
  ),
  /**
   * The front-end enablement plan's Task 6. Who, as `app_secret.set` records it — `userId` is the
   * person (for a token, its minter) and `tokenId` the token or null — because `audit.events` has
   * no actor column and a sentence is not a record.
   */
  'project.renamed': z
    .strictObject({
      from: z.string().min(1).describe('What people called the project before.'),
      to: z.string().min(1).describe('What they call it now (`Project.name`).'),
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'The project’s name — what people call it — changed. Its slug, and so every hostname it has, did not.',
    ),
  /**
   * The front-end enablement plan's Task 7. `memberId` is the person the change is ABOUT;
   * `userId` keeps the meaning it has in every other event — who ACTED — beside `via` and
   * `tokenId`, because `audit.events` has no actor column and a sentence is not a record.
   */
  'member.added': z
    .strictObject({
      memberId: Uuid.describe('The person added — `listMembers` names them.'),
      role: MemberRole.describe('The role they now have.'),
      previousRole: MemberRole.nullable().describe(
        'The role they had before; null when they were not a member.',
      ),
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'A person was added to the project, or their role on it changed (§13). Not published when nothing changed.',
    ),
  /**
   * The launch path plan's Task 8 (Spec action 2) adds the two counts — what the removal did to the
   * person's agent besides. Additive: a client that reads neither reads the event as it did.
   */
  'member.removed': z
    .strictObject({
      memberId: Uuid.describe('The person taken off the project.'),
      tokensRevoked: z
        .number()
        .int()
        .nonnegative()
        .describe(
          'How many delegated tokens they had minted on the project were revoked with the removal — every one not already revoked, an expired one included; a token of theirs on another project is not touched.',
        ),
      sessionsEnded: z
        .number()
        .int()
        .nonnegative()
        .describe(
          'How many of their agent sessions on the project the removal ended — started by a token or in their own browser alike. When some could not be ended (the request was answered an error), repeating the removal ends them; each end is its own `agent_session.ended`.',
        ),
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'A person was taken off the project (§13) — and with them their agent: every delegated token they had minted on it revoked, their agent sessions there ended, and their open event streams closed (§6, §10, §20). Not published for somebody who was not a member.',
    ),
  /**
   * The front-end enablement plan's Task 10. `userId` is who started it — the person charged, a
   * token's minter when a token did — beside `via` and `tokenId`, as every event since Task 6.
   */
  'agent_session.started': z
    .strictObject({
      sessionId: Uuid.describe('The session — `listAgentSessions` names it.'),
      models: z
        .array(z.string())
        .describe(
          'The logical models its key may call — what D17 allows for the project’s data.',
        ),
      capUsd: z.number().describe('The most its key may spend, in US dollars.'),
      expiresAt: z.iso
        .datetime()
        .describe('When its key stops working, whatever anybody does.'),
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'An agent was given a model key for this project, charged to the person who started it (§10). The key itself is never published.',
    ),
  /**
   * The launch path plan's Task 7 (§7 as Spec action 1 amended it). Nobody asked for it: it is attributed,
   * as `agent_session.ended`'s `models_withdrawn` is, to the person the session is charged to — `via`
   * `session`, no token. `models` is what the key holds NOW, so a client needs no second read.
   */
  'agent_session.narrowed': z
    .strictObject({
      sessionId: Uuid.describe('The session — `listAgentSessions` names it.'),
      withdrawn: z
        .array(z.string())
        .min(1)
        .describe(
          'The logical models its key may no longer call — the gateway refuses them from now on. Never empty.',
        ),
      models: z
        .array(z.string())
        .min(1)
        .describe(
          'The logical models its key still holds: what it held that the project still allows. Never empty — a session left with nothing it may use is ended instead.',
        ),
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'An agent session’s key lost the models its project no longer allows — its data classification was raised, or the platform now keeps a confidential project’s building agent on-premise — and kept the rest (§7, §10). The session goes on with the same key.',
    ),
  'agent_session.ended': z
    .strictObject({
      sessionId: Uuid.describe('The session that ended.'),
      reason: z
        .enum([
          'ended',
          'token_revoked',
          'project_archived',
          'project_deleted',
          'models_withdrawn',
          'member_removed',
        ])
        .describe(
          'Why: `endAgentSession`, the token that started it revoked, its project switched off or deleted, `models_withdrawn` — its project no longer allows any of the models it held (its data classification was raised, or the platform now keeps a confidential project’s building agent on-premise) — or `member_removed`: the person it works for was taken off the project. A session that keeps any model it may still use is narrowed instead (`agent_session.narrowed`).',
        ),
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe('An agent session’s key was revoked at the gateway (§10).'),
  /** The front-end enablement plan's Task 11 — an entity id is public in the SP's own metadata. */
  'sso.deregistered': z
    .strictObject({
      entityId: z
        .string()
        .describe('The app’s SAML entity id in this environment (§9), now unregistered.'),
    })
    .describe(
      'The app’s SAML Service Provider registration with the Manifest identity provider was removed for one environment — its project was switched off (§9, §11).',
    ),
  /**
   * The front-end enablement plan's Task 11. Who, as every event since Task 6 records it — and
   * archiving is person-only (D24), so `via` is always `session` and `tokenId` null today; the
   * fields are kept so a reader needs no special case.
   */
  'project.archived': z
    .strictObject({
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'The project was switched off by its owner (§11): each of its names answers a page saying so, its instances are retired and its services stopped. Its code, data, secrets and records are kept, and it can be restored.',
    ),
  'project.restored': z
    .strictObject({
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'A switched-off project was restored (§11). Nothing started: its names answer the switched-off page until its next deploy brings the app back on its kept data. Its delegated tokens stay revoked.',
    ),
  /** The front-end enablement plan's Task 12 — who, as `project.archived` records it (person-only). */
  'project.deleted': z
    .strictObject({
      via: Via,
      userId: ActingUser,
      tokenId: ActingToken,
    })
    .describe(
      'The project, which never launched, was deleted by its owner (§11): switched off, then its repository, every data volume, every secret and its model budgets destroyed, and its names released. Its record and this trail remain; its name (slug) is free for another project. The last event a project has.',
    ),
} satisfies Record<EventType, z.ZodType>
