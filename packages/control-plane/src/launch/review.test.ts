import { describe, expect, it } from 'vitest'
import { NullReviewer, REVIEW_STATES, type ReviewRequest } from './review.js'

const request = (repoPath: string): ReviewRequest => ({
  projectId: '00000000-0000-4000-8000-000000000001',
  releaseId: '00000000-0000-4000-8000-000000000002',
  changes: [
    { path: 'resources.memory', from: '512Mi', to: '1Gi', summary: 'more memory' },
  ],
  source: { repoPath, commitSha: 'a'.repeat(40) },
})

describe('R4’s seam — the honest NullReviewer (D33, §15, P6a Task 12)', () => {
  /**
   * **THE CONTROL R4(b) EXISTS FOR, AND THE ONE THAT WOULD BE FORGOTTEN** (control b). A
   * `NullReviewer` that answered `{ state: 'clean', checked: 0 }` would satisfy every other
   * test in the repository — the snapshot would store a verdict, the item would still read
   * `not_built`, and the next person to read an approval would believe code had been
   * reviewed. This is the only assertion that makes that stub a red test.
   */
  it('the null reviewer’s verdict is `not_performed`, and it names itself', async () => {
    const verdict = await NullReviewer.review(request('/tmp/does-not-matter.git'))
    expect(verdict.state).toBe('not_performed')
    expect(verdict.reviewer).toBe('none')
    expect(NullReviewer.name).toBe('none')
    // NARROWED BY THE ASSERTION ABOVE, so `reason` is read off the union honestly.
    if (verdict.state !== 'not_performed') throw new Error('unreachable')
    // §20's control-map row, in the reviewer's own words: nothing reviews code, and the
    // controls are containment. A reason that stopped saying so would be a stub again.
    expect(verdict.reason).toContain('No code reviewer is configured')
    expect(verdict.reason).toContain('not code (§13)')
    expect(verdict.reason).toContain('containment')
  })

  it('does not read the request — an unreachable repository is answered identically', async () => {
    // The statement that this reviewer touches no disk. Its CALLER's arguments are
    // therefore invisible through it, which is why `approval.test.ts` injects a reviewer
    // that records the request rather than trusting this one to notice a wrong path.
    const real = await NullReviewer.review(request('/tmp'))
    const nowhere = await NullReviewer.review(request('/no/such/repository.git'))
    expect(nowhere).toEqual(real)
  })

  it('publishes exactly the union’s three states, in the order the contract lists them', () => {
    // `tsc` holds the list to the union in both directions; this holds the ORDER, which is
    // what the generated `schema.d.ts` and `openapi.json` carry.
    expect(REVIEW_STATES).toEqual(['not_performed', 'clean', 'findings'])
  })
})
