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
    operations: [],
    later: {
      plan: 'a later release',
      why: 'the design keeps live tailing of a running app’s own output out of the first version (§14); a bounded, redacted read for sandbox and staging is proposed',
    },
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
  {
    step: 'See what a first launch needs, rehearse, and record UBC’s answers',
    who: 'either',
    operations: [
      'getLaunchReadiness',
      'getLaunchRecords',
      'runRehearsal',
      'recordIamRegistration',
      'recordPrivacyAssessment',
    ],
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
    step: 'Delete a project, or roll back a release',
    who: 'person',
    operations: [],
    later: { plan: 'not yet scheduled', why: 'neither is built yet' },
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
]

/** In the document, and deliberately in no faculty step — each with its reason. */
export const OUTSIDE_THE_JOURNEY: Readonly<Record<string, string>> = {
  listFleet: 'An administrator’s view of every app (§26), not a step in building one.',
}
