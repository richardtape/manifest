import { unwrap, type ManifestClient } from '@manifest/contract'

/**
 * WHAT A LAUNCHED APP DURABLY IS, AS PRODUCTION SERVES IT — the launch demos' re-use check (`make demo-launch`,
 * `make demo-production`; the FIX session, the roadmap's tracked defect placed `1fe7d7f`).
 *
 * Since P6b a launched app's production may serve a SELF-SERVE release — one that changes nothing sensitive since
 * the last approved release, which no administrator decides, so it has no approval — and `make demo-capacity`
 * leaves its app on one. The re-use paths asked *"the release production serves was approved"*, read `getApproval`
 * `404` and were red in seconds (A1 sitting 8). The durable trace of the first launch is instead: **A RELEASE OF
 * THIS PROJECT WAS APPROVED, AND WHAT SERVES IS IT OR A SELF-SERVE RELEASE SINCE** — deployed after an approval was
 * decided, because a production deploy with no approval is refused until the project has launched (§13 D9.1).
 */

/** The latest decision about the release production serves, as `getApproval` answered it. */
export type ServingDecision =
  | { kind: 'approved' }
  | { kind: 'rejected' }
  /** `404 NOT_FOUND`: nobody has decided — a release that went to production self-serve. */
  | { kind: 'undecided' }
  /** Any other answer — never read as "undecided". */
  | { kind: 'refused'; status: number; code: string }

/** One release of the project whose LATEST decision is `approved`. */
export interface Approved {
  releaseId: string
  decidedAt: string
}

export interface TraceFacts {
  servingReleaseId: string
  /** When the instance answering for production was made — a self-serve release's deploy is no later. */
  servingSince: string
  decision: ServingDecision
  /** The project's OTHER approved releases, among the newest 50 `listReleases` answers. */
  approved: readonly Approved[]
}

/** `getApproval`'s answer, by its status and CODE — a 404 for any other reason is not "undecided". */
export function decisionOf(result: {
  data?: { decision: 'approved' | 'rejected' }
  error?: unknown
  response: { status: number }
}): ServingDecision {
  if (result.data !== undefined && result.error === undefined)
    return { kind: result.data.decision }
  const code =
    typeof result.error === 'object' &&
    result.error !== null &&
    'error' in result.error &&
    typeof (result.error as { error?: { code?: unknown } }).error?.code === 'string'
      ? (result.error as { error: { code: string } }).error.code
      : 'UNPARSEABLE'
  return result.response.status === 404 && code === 'NOT_FOUND'
    ? { kind: 'undecided' }
    : { kind: 'refused', status: result.response.status, code }
}

/** The check itself, on facts already read — `ok`, and a line saying why either way. */
export function judgeTrace(facts: TraceFacts): { ok: boolean; detail: string } {
  const serving = facts.servingReleaseId
  switch (facts.decision.kind) {
    case 'approved':
      return { ok: true, detail: `${serving}: approved` }
    case 'rejected':
      return { ok: false, detail: `${serving}: REJECTED, and production serves it` }
    case 'refused':
      return {
        ok: false,
        detail: `${serving}: getApproval answered ${facts.decision.status} ${facts.decision.code}`,
      }
    case 'undecided': {
      const before = facts.approved
        .filter((a) => Date.parse(a.decidedAt) < Date.parse(facts.servingSince))
        .sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt))[0]
      return before === undefined
        ? {
            ok: false,
            detail: `${serving}: no decision, and no release of the project (of the newest 50) approved before it served, at ${facts.servingSince}`,
          }
        : {
            ok: true,
            detail: `${serving}: self-serve, serving since ${facts.servingSince}; ${before.releaseId} approved at ${before.decidedAt}`,
          }
    }
  }
}

/** A decision, `undefined` for `404 NOT_FOUND`, and a throw for any other refusal. */
function unwrapUnlessUndecided<T>(result: {
  data?: T
  error?: unknown
  response: Response
}): T | undefined {
  if (decisionOf(result as Parameters<typeof decisionOf>[0]).kind === 'undecided')
    return undefined
  return unwrap(result, 'getApproval')
}

/**
 * Reads the facts through the contract and judges them. `serving` is `getEnvironment`'s `instance` for production.
 * The approved releases are read only when what serves was not approved itself.
 */
export async function launchTrace(
  client: ManifestClient,
  projectId: string,
  serving: { releaseId: string; createdAt: string },
): Promise<{ ok: boolean; detail: string }> {
  const ask = (releaseId: string) =>
    client.GET('/v1/releases/{releaseId}/approval', { params: { path: { releaseId } } })
  const decision = decisionOf(await ask(serving.releaseId))
  const approved: Approved[] = []
  if (decision.kind === 'undecided') {
    // A failed read throws (`unwrap`) rather than reading as "nothing approved".
    const releases = unwrap(
      await client.GET('/v1/projects/{projectId}/releases', {
        params: { path: { projectId } },
      }),
      'listReleases',
    )
    for (const release of releases) {
      if (release.id === serving.releaseId) continue
      const latest = unwrapUnlessUndecided(await ask(release.id))
      if (latest?.decision === 'approved')
        approved.push({ releaseId: release.id, decidedAt: latest.decidedAt })
    }
  }
  return judgeTrace({
    servingReleaseId: serving.releaseId,
    servingSince: serving.createdAt,
    decision,
    approved,
  })
}
