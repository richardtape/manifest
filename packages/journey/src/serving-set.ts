/**
 * EVERY MEMBER OF A SERVING SET, SEEN THROUGH THE EDGE (A1 Task 5).
 *
 * Production runs as many instances as its audience needs, and the edge balances across them
 * round robin — so one answer's `X-Manifest-Instance` names ONE member, and a reader that compares
 * it to one id is right half the time on a set of two. This asks until every id of the set has
 * answered, within `4 × N` requests (round robin's N, with room for a health check's interleaving),
 * and says what it saw: which members answered, any answer from an instance OUTSIDE the set, and any
 * answer that was not what an instance of the app says.
 *
 * The set comes from `getEnvironment`'s `instances` — a deploy answers one instance of its set, never
 * the set.
 */
export interface SeenSet {
  /** Every member answered, nothing outside the set did, and every answer was the app's. */
  ok: boolean
  /** The members that answered, in the order first seen. */
  seen: string[]
  /** Instances that answered and are not in the set — `(none)` for an answer with no header. */
  strangers: string[]
  /** Answers that were not the app's, as `<status> <instance>`. */
  wrong: string[]
  /** How many requests it took. */
  asked: number
}

export interface EdgeAnswer {
  status: number
  instance: string | undefined
  body: string
}

export async function seeEveryMember<A extends EdgeAnswer>(
  ask: () => Promise<A>,
  set: readonly string[],
  isTheApp: (answer: A) => boolean = (answer) => answer.status === 200,
): Promise<SeenSet> {
  const seen: string[] = []
  const strangers: string[] = []
  const wrong: string[] = []
  let asked = 0
  while (asked < 4 * set.length && seen.length < set.length) {
    const answer = await ask()
    asked += 1
    const instance = answer.instance ?? '(none)'
    if (!isTheApp(answer)) wrong.push(`${answer.status} ${instance}`)
    if (!set.includes(instance)) strangers.push(instance)
    else if (!seen.includes(instance)) seen.push(instance)
  }
  return {
    ok:
      set.length > 0 &&
      seen.length === set.length &&
      strangers.length === 0 &&
      wrong.length === 0,
    seen,
    strangers,
    wrong,
    asked,
  }
}

/** One line for a failed check's detail: what was expected, and what answered. */
export function describeSeen(set: readonly string[], result: SeenSet): string {
  const unseen = set.filter((id) => !result.seen.includes(id))
  return (
    `set [${set.join(', ')}]; in ${result.asked} requests seen [${result.seen.join(', ')}]` +
    (unseen.length > 0 ? `, never [${unseen.join(', ')}]` : '') +
    (result.strangers.length > 0
      ? `, from outside the set [${result.strangers.join(', ')}]`
      : '') +
    (result.wrong.length > 0 ? `, not the app: ${result.wrong.join('; ')}` : '')
  )
}
