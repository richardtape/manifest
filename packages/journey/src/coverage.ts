/**
 * §22'S END-TO-END PATH, AS DATA (the authoring API plan's Task 11, Decision 19) — every step a
 * person or their agent takes from an idea to a launched app, and the operations that serve
 * each. A step nothing serves yet names the plan or phase that will, and why.
 *
 * `coverage.test.ts` holds it against the published document in both directions: an operation
 * a step names that the document lacks is red, and so is an operation the document has that no
 * step names — unless `OUTSIDE_THE_JOURNEY` says why it is not a step. That is how *"the API can
 * deploy and not create"* stayed true for a phase: nothing stated the path as a thing a test
 * could read. `docs/api/journey.md`'s table is generated from this list (`pnpm docs:write`).
 */
export interface JourneyStep {
  /** What a person or an agent is doing, in their words. */
  step: string
  who: 'person' | 'agent' | 'either' | 'administrator'
  /** The operationIds that serve it. */
  operations: readonly string[]
  /** When nothing serves it yet: which plan or phase will, and why. */
  later?: { plan: string; why: string }
}

export const JOURNEY: readonly JourneyStep[] = [
  { step: 'Sign in with CWL', who: 'person', operations: ['getMe'] },
  {
    step: 'Choose a blueprint and a starter, and read its knowledge pack',
    who: 'either',
    operations: ['listBlueprints', 'getBlueprint', 'getKnowledgePack'],
  },
  {
    step: 'Check a name, and create the project for an audience',
    who: 'person',
    operations: ['checkSlug', 'createProject'],
  },
  {
    step: 'Give the project a name people read, and change it',
    who: 'either',
    operations: ['updateProject'],
  },
  {
    step: 'Give an agent a delegated token',
    who: 'person',
    operations: ['mintToken', 'listTokens', 'revokeToken'],
  },
  {
    step: 'Read the documentation',
    who: 'either',
    operations: ['listDocs', 'getDoc', 'getOpenApiDocument'],
  },
  {
    step: 'See the code: the tree, a file, the history, one commit',
    who: 'either',
    operations: ['getTree', 'getFile', 'listCommits', 'getCommit'],
  },
  {
    step: 'Change the code and manifest.yaml, checked before it is written',
    who: 'either',
    operations: ['createCommit', 'validateSpec', 'getSpec'],
  },
  {
    step: 'Set the values of the app’s secrets',
    who: 'either',
    operations: ['listAppSecrets', 'setAppSecret', 'clearAppSecret'],
  },
  {
    step: 'Build it and read the log',
    who: 'either',
    operations: [
      'startBuild',
      'getBuild',
      'getBuildLog',
      'listBuilds',
      'streamProjectEvents',
    ],
  },
  {
    step: 'Release it and deploy it to staging',
    who: 'either',
    operations: [
      'createRelease',
      'getRelease',
      'listReleases',
      'deploy',
      'listEnvironments',
      'getEnvironment',
      'listIncidents',
    ],
  },
  {
    step: 'Read a running app’s recent output to debug it',
    who: 'either',
    operations: ['listInstances', 'getInstanceOutput'],
  },
  {
    step: 'Describe an app before it exists, on a model the platform pays for',
    who: 'person',
    operations: ['startIntakeSession', 'endIntakeSession'],
  },
  {
    step: 'Give an agent model access, charged to you, and see what it has spent',
    who: 'either',
    operations: [
      'startAgentSession',
      'listAgentSessions',
      'endAgentSession',
      'getAgentBudget',
    ],
  },
  {
    step: 'Ask for a privileged action and wait for a person',
    who: 'agent',
    operations: ['listPendingActions', 'getPendingAction'],
  },
  {
    step: 'Answer an agent’s question',
    who: 'person',
    operations: ['confirmPendingAction', 'rejectPendingAction'],
  },
  // THREE ROWS, NOT ONE (the launch path plan's sitting 4a, the whole-branch review's M1): the
  // row said `either` over all five, so the public journey offered an agent the rehearsal and
  // both records — each session-only (`TOKEN_CREDENTIAL_REFUSED`), and the records an
  // administrator's alone.
  {
    step: 'See what a first launch needs',
    who: 'either',
    operations: ['getLaunchReadiness', 'getLaunchRecords'],
  },
  {
    step: 'Rehearse the CWL sign-in before launch',
    who: 'person',
    operations: ['runRehearsal'],
  },
  {
    step: 'Record what UBC IAM and the Privacy Office said',
    who: 'administrator',
    operations: ['recordIamRegistration', 'recordPrivacyAssessment'],
  },
  {
    step: 'Approve a release from a stored preview',
    who: 'administrator',
    operations: [
      'createApprovalPreview',
      'getApprovalPreview',
      'approveRelease',
      'rejectRelease',
      'getApproval',
    ],
  },
  {
    step: 'Manage who works on the project',
    who: 'person',
    operations: [
      'listMembers',
      'addMember',
      'removeMember',
      'listProjects',
      'getProject',
    ],
  },
  {
    step: 'Change who the app is for',
    who: 'person',
    operations: [],
    later: {
      plan: 'the administrators’ queue (§26)',
      why: 'raising an audience is a request an administrator approves (§24)',
    },
  },
  {
    step: 'Roll back a release',
    who: 'person',
    operations: [],
    later: { plan: 'not yet scheduled', why: 'it is not built yet' },
  },
  {
    step: 'Work on a branch in a sandbox, with exec',
    who: 'agent',
    operations: [],
    later: {
      plan: 'Phase 3 (§17)',
      why: 'an agent working inside a platform sandbox is not built before then',
    },
  },
  {
    step: 'Switch the app off when the course ends, and bring it back',
    who: 'person',
    operations: ['archiveProject', 'restoreProject'],
  },
  {
    step: 'Delete an app that never launched — a trial, or a mistake',
    who: 'person',
    operations: ['deleteProject'],
  },
]

/** In the document, and deliberately in no faculty step — each with its reason. */
export const OUTSIDE_THE_JOURNEY: Readonly<Record<string, string>> = {
  listFleet: 'An administrator’s view of every app (§26), not a step in building one.',
  // The launch path plan's Tasks 9 to 11 — until its Task 15's `make demo-launch` makes them steps.
  draftIamRegistration:
    'Drafting a registration request for UBC IAM is a step of launching an app, after it is built; the launch’s own demo drives it.',
  submitIamRegistration:
    'Saying a registration request was sent is a step of launching an app, after it is built and the request drafted; the launch’s own demo drives it.',
  // Task 11.
  draftPrivacyAssessment:
    'Drafting the privacy assessment for the Privacy Office is a step of launching an app, after it is built; the launch’s own demo drives it.',
  submitPrivacyAssessment:
    'Saying the privacy assessment was sent is a step of launching an app, after it is built and the assessment drafted; the launch’s own demo drives it.',
  // Task 12.
  requestApproval:
    'Asking an administrator to sign off a release is a step of launching an app, once it serves staging; the launch’s own demo drives it.',
  listQueue:
    'An administrator’s view of everything waiting on them, not a step in building an app.',
}
