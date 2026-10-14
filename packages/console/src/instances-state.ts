import type { Schemas, StreamFrame } from '@manifest/contract'

/**
 * WHAT SERVES AN ENVIRONMENT, AS THE CONSOLE SAYS IT (A1 Task 7). Production runs a SET — as many
 * instances as its audience needs, two for `class` — named by `Environment.instances`; `instance` is
 * the set's FIRST, the instance a deploy answered. And since the set watcher, a production member that
 * stopped stays in the set, `failed`, until its replacement serves while the rest serve on — so the
 * first is not always one that serves, and a pill read off it would say `failed` while the app served
 * (the platform's fleet answers by the same rule). The console has no DOM tier (P5c Decision 7).
 */

type State = Schemas['Instance']['state']

/**
 * The set as one state — its first HEALTHY member's, or, none being healthy, its first's — and the words
 * beside it: one instance reads as its state alone, as it always has; more say how many and, when they
 * differ, how many are in each state.
 */
export function servingWords(env: Schemas['Environment']): {
  state: State | null
  text: string
} {
  const set =
    env.instances.length > 0 ? env.instances : env.instance === null ? [] : [env.instance]
  const answering = set.find((i) => i.state === 'healthy') ?? set[0]
  if (answering === undefined) return { state: null, text: 'never deployed' }
  if (set.length === 1) return { state: answering.state, text: answering.state }
  // The state that answers for the set first, then the rest in the set's order.
  const counts = new Map<State, number>([[answering.state, 0]])
  for (const member of set) counts.set(member.state, (counts.get(member.state) ?? 0) + 1)
  const text =
    counts.size === 1
      ? `${set.length} instances, ${answering.state}`
      : `${set.length} instances: ${[...counts].map(([state, n]) => `${n} ${state}`).join(', ')}`
  return { state: answering.state, text }
}

/**
 * AN EXIT, IN THE ENVIRONMENT'S OWN LIST (A1 Task 7): `instance.exited` carries the environment's id in
 * `machineDetail.environmentId`, as the deploy's own `instance.*` frames do. Its sentence is the
 * platform's — whether the app kept serving, and whether it is being replaced — and nothing else is
 * read from it.
 */
export function exitedFramesFor(
  frames: StreamFrame[],
  env: Pick<Schemas['Environment'], 'id'>,
): { id: string; at: string; label: string; message: string }[] {
  const out: { id: string; at: string; label: string; message: string }[] = []
  for (const f of frames) {
    if (f.kind !== 'event' || f.type !== 'instance.exited') continue
    if (f.machineDetail.environmentId !== env.id) continue
    out.push({ id: f.id, at: f.createdAt, label: f.type, message: f.humanMessage })
  }
  return out
}
