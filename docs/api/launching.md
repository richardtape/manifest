# Launching

How an app reaches production: the checklist a first launch must meet, the rehearsal of its CWL sign-in, the records of UBC’s decisions, an administrator’s approval of a stored preview — and, once launched, the releases that follow. For a developer building the launch screens and for an agent that must know what it may do here and what it must leave to a person.

## The checklist

`getLaunchReadiness` answers the checklist, **computed from what exists and never stored**, from the moment a project exists: each item with its owner, whether it blocks a launch, and its state — `met`, `unmet` with `why` saying what to do, or `not_built` when Manifest does not track it yet. A production deploy is refused `409` with this exact checklist until every blocking item is met.

<!-- example: example-launch -->

```ts
import { createManifestClient, unwrap } from '@manifest/contract'

/**
 * What a first production launch still needs, computed from what exists and never stored:
 * each blocking item that is not met, with who owns it and what to do.
 */
export async function whatALaunchNeeds(
  origin: string,
  token: string,
  projectId: string,
): Promise<{ ready: boolean; todo: { title: string; owner: string; why: string }[] }> {
  const client = createManifestClient({ origin, token })
  const readiness = unwrap(
    await client.GET('/v1/projects/{projectId}/launch-readiness', {
      params: { path: { projectId } },
    }),
    'getLaunchReadiness',
  )
  return {
    ready: readiness.ready,
    todo: readiness.items
      .filter((item) => item.blocking && item.state !== 'met')
      .map((item) => ({ title: item.title, owner: item.owner, why: item.why })),
  }
}
```

<!-- /example -->

## A first launch

1. **Deploy to staging, and prove it there.** Production deploys only the release that is serving staging.
2. **Rehearse the sign-in** (`runRehearsal`): the candidate release is deployed behind the gate with its CWL registration shaped as production’s, and one sign-in is completed and recorded. It proves the registration’s *shape* — never that UBC has accepted it. The project’s owner, a collaborator or a platform administrator runs it, in their own session, with no second sign-in.
3. **Record UBC’s decisions.** A platform administrator records the IAM registration (`recordIamRegistration`) and the Privacy Office’s assessment (`recordPrivacyAssessment`), each with its reference, in their own session.
4. **Approve.** An administrator takes a **stored preview** of the release (`createApprovalPreview`) — the exact change it makes, the security notes and a summary — reads it, and approves or rejects the release **naming that preview** (`approveRelease`, `rejectRelease`), after signing in again. The approval is bound to the release’s exact image; a later rebuild is a new image the approval does not cover.
5. **Deploy to production** (`deploy`, to the production environment), by a person who has signed in again.

## After the first launch

A launched app’s releases are **self-serve**: a release that is serving staging deploys to production with no administrator — unless its manifest changes one of the seven **sensitive fields**: `services`, `auth.attributes`, `egress.allow`, `resources`, `data.classification`, `ai.models` and `blueprint` — what it connects to, what it learns about the people who sign in, where it may reach, what it runs on, what data it holds, which models it asks, and what it is built from. Then it **re-escalates**: the checklist asks for an administrator’s approval again, from a new stored preview. A commit’s dry run already tells you whether it would (`spec.sensitiveDiff`).

## What an agent may do here, and what it may not

- **May:** read the checklist, the launch records and the approval; deploy to sandbox and staging; and *ask* for a production deploy.
- **Asking for a production deploy** is answered `403 TOKEN_ACTION_PENDING`: the person who minted the token confirms that one request — after signing in again — and the agent retries it once, identically. *For an AI agent* has the loop.
- **May not, ever:** run the rehearsal, record UBC’s decisions, take a preview, or approve or reject a release. The rehearsal deploys into production, and each of the others is a person’s own record of what they decided — so a person does each, in their own session, and a token is refused it outright (`403 TOKEN_CREDENTIAL_REFUSED`).
