# The journey

Every step from an idea to a launched app, who takes it, and the operations that serve it — including the steps nothing serves yet, and what will. For a developer planning a client and for an agent working out which call comes next. The table is generated from the list the API is tested against: an operation the API has that no step names, or a step naming one it lacks, fails that test, so the table cannot fall behind the API.

<!-- journey -->

| Step | Who | Operations |
|---|---|---|
| Sign in with CWL | person | `getMe` |
| Choose a blueprint and a starter, and read its knowledge pack | either | `listBlueprints`, `getBlueprint`, `getKnowledgePack` |
| Check a name, and create the project for an audience | person | `checkSlug`, `createProject` |
| Give the project a name people read, and change it | either | `updateProject` |
| Give an agent a delegated token | person | `mintToken`, `listTokens`, `revokeToken` |
| Read the documentation | either | `listDocs`, `getDoc`, `getOpenApiDocument` |
| See the code: the tree, a file, the history, one commit | either | `getTree`, `getFile`, `listCommits`, `getCommit` |
| Change the code and manifest.yaml, checked before it is written | either | `createCommit`, `validateSpec`, `getSpec` |
| Set the values of the app’s secrets | either | `listAppSecrets`, `setAppSecret`, `clearAppSecret` |
| Build it and read the log | either | `startBuild`, `getBuild`, `getBuildLog`, `listBuilds`, `streamProjectEvents` |
| Release it and deploy it to staging | either | `createRelease`, `getRelease`, `listReleases`, `deploy`, `listEnvironments`, `getEnvironment`, `listIncidents` |
| Read a running app’s recent output to debug it | either | `listInstances`, `getInstanceOutput` |
| Describe an app before it exists, on a model the platform pays for | person | `startIntakeSession`, `endIntakeSession` |
| Give an agent model access, charged to you, and see what it has spent | either | `startAgentSession`, `listAgentSessions`, `endAgentSession`, `getAgentBudget` |
| Ask for a privileged action and wait for a person | agent | `listPendingActions`, `getPendingAction` |
| Answer an agent’s question | person | `confirmPendingAction`, `rejectPendingAction` |
| See what a first launch needs | either | `getLaunchReadiness`, `getLaunchRecords` |
| Rehearse the CWL sign-in before launch | person | `runRehearsal` |
| Record what UBC IAM and the Privacy Office said | administrator | `recordIamRegistration`, `recordPrivacyAssessment` |
| Approve a release from a stored preview | administrator | `createApprovalPreview`, `getApprovalPreview`, `approveRelease`, `rejectRelease`, `getApproval` |
| Manage who works on the project | person | `listMembers`, `addMember`, `removeMember`, `listProjects`, `getProject` |
| Change who the app is for | person | *Not yet — not built yet:* raising who an app is for needs an administrator’s approval, and there is no way to ask for it |
| Roll back a release | person | *Not yet — not yet scheduled:* it is not built yet |
| Work on a branch in a sandbox, with exec | agent | *Not yet — not built yet:* an agent works on an app through the API, from outside the platform; it cannot work inside a platform sandbox |
| Switch the app off when the course ends, and bring it back | person | `archiveProject`, `restoreProject` |
| Delete an app that never launched — a trial, or a mistake | person | `deleteProject` |

<!-- /journey -->

*Who*: a **person** in their own session; an **agent** with a delegated token; **either**; or a platform **administrator**. One operation is in no step, deliberately: `listFleet`, an administrator’s view of every app on the platform, which is not a step in building one.
