import type { SpecChange } from '../spec/index.js'

/**
 * D33 and §15: a seam for reviewing what the AGENT WROTE, shipped in Phase 2 with **no
 * implementation behind it**.
 *
 * §13's residual risk is that the gate reviews `manifest.yaml` and not code, and §20's
 * control map says the risk is **still accepted under D9** with containment as the control.
 * **Nothing in this file changes that**, and a reader who takes the existence of this
 * interface as evidence that code is reviewed has read it exactly backwards.
 *
 * TWO ARGUMENTS, because the two implementations that will follow read different things: a
 * static analyser reads the TREE (`source`) and an LLM reads the DIFF (`changes`). Shipping
 * one now and adding the other later would touch the builder, the approval record and
 * `LaunchReadiness` at once — D30's argument, which is D33's rationale in as many words.
 */
export interface ReviewRequest {
  projectId: string
  releaseId: string
  /** What the release CHANGED, from `describeDiff`. EMPTY for a first release, legitimately. */
  changes: readonly SpecChange[]
  /**
   * Where the code IS: a bare repository path and a commit — `source/`'s driver 1 shape.
   * **The BUILD's commit**, not the spec's: the approval binds the build's digest (§13),
   * so the code a reviewer reads must be the code that digest was built from.
   */
  source: { repoPath: string; commitSha: string }
}

export interface ReviewFinding {
  severity: 'block' | 'advise'
  message: string
  path?: string
  line?: number
}

/**
 * `not_performed` IS A MEMBER OF THE UNION and not a null verdict, so `tsc` makes every
 * reader handle it and **nobody can mistake "no findings" for "nothing looked"**. That
 * confusion is the whole of what R4(b) forbids.
 */
export type ReviewVerdict =
  | { state: 'not_performed'; reviewer: string; reason: string }
  | { state: 'clean'; reviewer: string; checked: number }
  | { state: 'findings'; reviewer: string; findings: readonly ReviewFinding[] }

/**
 * The three states, as a VALUE — what `api/representations/releases.ts` publishes as the
 * stored verdict's closed enum. **Held to the union in BOTH directions by `tsc`**, through
 * the console's `everyCapability` idiom: a member the union lacks makes the array
 * un-assignable, and a union member this list lacks makes `Exclude<…>` non-`never`, which
 * collapses the parameter to `never` and refuses the call. So a fourth verdict state is a
 * type error here as well as in `describeVerdict`, and the contract cannot lag the union.
 */
function everyReviewState<T extends readonly ReviewVerdict['state'][]>(
  list: T & (Exclude<ReviewVerdict['state'], T[number]> extends never ? unknown : never),
): T {
  return list
}

export const REVIEW_STATES = everyReviewState([
  'not_performed',
  'clean',
  'findings',
] as const)

export interface Reviewer {
  readonly name: string
  review(request: ReviewRequest): Promise<ReviewVerdict>
}

/**
 * THE HONEST NULL IMPLEMENTATION (D33, §15, R4b).
 *
 * **It is not a stub that purports to review.** A placeholder that answered `clean` would be
 * another setting that reads like a control and is not — a class this project has measured
 * four instances of (P4a) — and the next person to read an approval record would believe it.
 * So the verdict names itself and says why there is nothing behind it.
 *
 * It takes the request and does not read it, deliberately: `review.test.ts` asserts that a
 * request with an unreachable `repoPath` is answered identically, which is the statement
 * that this reviewer does not touch the disk. **That makes the ARGUMENTS invisible through
 * it** — a caller could pass the wrong commit and nothing here would say so — so the
 * caller's own test (`releases/approval.test.ts`) injects a reviewer that RECORDS what it
 * was asked, and asserts the request, not just the verdict.
 */
export const NullReviewer: Reviewer = {
  name: 'none',
  review: () =>
    Promise.resolve({
      state: 'not_performed',
      reviewer: 'none',
      reason:
        'No code reviewer is configured. Manifest reviews manifest.yaml, not code (§13); the ' +
        'controls that make that tolerable are containment — default-deny egress, network ' +
        'isolation, least privilege and edge protections (§20).',
    }),
}
