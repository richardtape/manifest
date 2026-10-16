import type { Schemas } from '@manifest/contract'
import type { State } from './system'

/**
 * ONE PROJECT AS AN OPERATOR SEES IT, FROM ITS READS (the refreshed design's §6) — the pure half of the
 * project's page: which release serves each environment and so what U1 level the app's data is, the set
 * each hostname reaches, the Incidents by cause, the releases, who minted each token, and the agents'
 * questions. Nothing here calls the API; `screens/project.tsx` reads and draws.
 */
export type EnvKind = 'sandbox' | 'staging' | 'production'

/** One environment's three reads: the environment, the instances it lists, its Incidents. */
export interface EnvironmentRead {
  environment: Schemas['Environment']
  instances: Schemas['InstanceList']
  incidents: Schemas['IncidentList']
}

/** Everything the page reads about one project (`screens/project.tsx`'s `readProject`). */
export interface ProjectRead {
  project: Schemas['Project']
  environments: EnvironmentRead[]
  /** `listReleases`' newest 50, and any release serving an environment that is older than them. */
  releases: Schemas['Release'][]
  readiness: Schemas['LaunchReadiness']
  records: Schemas['LaunchRecords']
  members: Schemas['MemberList']
  tokens: Schemas['TokenList']
  pendingActions: Schemas['PendingActionList']
  sessions: Schemas['AgentSessionList']
}

/** The order the page draws environments in — production first, where people are. */
export const ENV_ORDER: readonly EnvKind[] = ['production', 'staging', 'sandbox']

export const byEnvOrder = (a: { kind: EnvKind }, b: { kind: EnvKind }): number =>
  ENV_ORDER.indexOf(a.kind) - ENV_ORDER.indexOf(b.kind)

/**
 * THE RELEASE AN ENVIRONMENT SERVES: the release its serving instances run — `listInstances`' first
 * `serving` one (the list is the one seen most recently first) — else the set the hostname reaches
 * (`Environment.instances`, the instance a successful deploy answered first). `null` before any deploy,
 * and when nothing serves: a first staging deploy that never became healthy serves nothing.
 */
export function servingReleaseId(read: EnvironmentRead): string | null {
  const serving = read.instances.instances.find((i) => i.serving)
  if (serving !== undefined) return serving.releaseId
  const reached = read.environment.instances.find((i) => i.state === 'healthy')
  return reached?.releaseId ?? null
}

/** The serving release of each environment that has one, by kind. */
export function servingReleases(
  environments: readonly EnvironmentRead[],
): Partial<Record<EnvKind, string>> {
  const out: Partial<Record<EnvKind, string>> = {}
  for (const read of environments) {
    const id = servingReleaseId(read)
    if (id !== null) out[read.environment.kind] = id
  }
  return out
}

/**
 * THE APP'S DATA LEVEL (the design's A17: no project read carries it) — the U1 level the SERVING
 * production release declares for production, else the serving staging release's for staging. Never the
 * newest release: a candidate that raises the level is not yet the data the app holds (M2). `null` when
 * nothing serves staging or production — said as *"not deployed yet"*.
 */
export function levelOf(
  environments: readonly EnvironmentRead[],
  releases: readonly Schemas['Release'][],
): { level: string; from: 'production' | 'staging' } | null {
  const serving = servingReleases(environments)
  for (const kind of ['production', 'staging'] as const) {
    const id = serving[kind]
    if (id === undefined) continue
    const release = releases.find((r) => r.id === id)
    if (release !== undefined)
      return { level: release.config[kind].classification, from: kind }
  }
  return null
}

export const NO_LONGER_ON_THE_PROJECT = 'someone no longer on the project'

/**
 * A PERSON THE PLATFORM RECORDS BY ID, NAMED FROM THE PROJECT'S MEMBERS — a token's `mintedBy`, a
 * release's `createdBy` (A8). A minter removed since is *"someone no longer on the project"*: their
 * tokens were revoked with them, so the row still says who it was not.
 */
export function personOf(userId: string, members: readonly Schemas['Member'][]): string {
  return members.find((m) => m.userId === userId)?.displayName ?? NO_LONGER_ON_THE_PROJECT
}

/** What an Incident is about, in words — the platform's `cause`, read for an operator. */
export const CAUSE_WORDS: Record<Schemas['Incident']['cause'], string> = {
  deploy: 'A deploy failed',
  exit: 'A serving instance stopped and was replaced',
  exit_stopped: 'It stopped, and replacing it gave up',
}

/**
 * An Incident's state: red only for breakage (decision 3) — replacing given up leaves production short
 * until someone acts; a replaced exit, and a failed deploy that left what served serving, are amber. The
 * drawing's Health draws a failed deploy green beside *"Still serving …"*; beside *"A deploy failed"*
 * green would read as fine. None pulses: an Incident is a record, not a machine moving.
 */
export const CAUSE_STATE: Record<Schemas['Incident']['cause'], State> = {
  exit_stopped: 'attention',
  exit: 'waiting',
  deploy: 'waiting',
}

export interface IncidentGroup {
  kind: EnvKind
  incidents: { incident: Schemas['Incident']; words: string }[]
}

/**
 * THE INCIDENTS, BY ENVIRONMENT, NEWEST FIRST, EACH WITH ITS CAUSE IN WORDS — production first. An
 * environment with none is left out; the page says when there are none at all.
 */
export function incidentGroups(
  environments: readonly EnvironmentRead[],
): IncidentGroup[] {
  return environments
    .map((read) => ({
      kind: read.environment.kind,
      incidents: [...read.incidents.incidents]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((incident) => ({ incident, words: CAUSE_WORDS[incident.cause] })),
    }))
    .filter((g) => g.incidents.length > 0)
    .sort(byEnvOrder)
}

/** An instance's state, in words beside the platform's enum. */
export const INSTANCE_WORDS: Record<Schemas['InstanceSummary']['state'], string> = {
  pending: 'Waiting',
  building: 'Building',
  provisioning: 'Preparing',
  starting: 'Starting',
  healthy: 'Healthy',
  failed: 'Failed',
  hibernated: 'Asleep',
  waking: 'Waking',
  destroying: 'Stopping',
  gone: 'Retired',
}

/**
 * THE SET AN ENVIRONMENT RUNS: how many of the instances its hostname reaches serve now (*"1 of 2
 * serving"* — econ's stopped member stays in the set until its replacement serves, sitting 2's F1), and
 * every instance `listInstances` keeps, a failed one after its replacement included.
 */
export function setOf(read: EnvironmentRead): {
  serving: number
  size: number
  words: string
  truncated: boolean
} {
  const serving = read.instances.instances.filter((i) => i.serving).length
  const size = read.environment.instances.length
  return {
    serving,
    size,
    words: size === 0 ? 'Nothing deployed' : `${serving} of ${size} serving`,
    truncated: read.instances.truncated,
  }
}

/** When the environment was last deployed: the newest `lastSeenAt` — only a deploy writes it (sitting 6, F2). */
export function lastDeployOf(read: EnvironmentRead): string | null {
  let newest: string | null = null
  for (const i of read.instances.instances)
    if (
      i.lastSeenAt !== null &&
      (newest === null || Date.parse(i.lastSeenAt) > Date.parse(newest))
    )
      newest = i.lastSeenAt
  return newest
}

/** A `TwoFacts` cell: the shape `system/TwoFacts`' `Fact` takes. */
export interface FactCell {
  overline: string
  title: string
  note?: string
  tone: 'steady' | 'attention' | 'working' | 'neutral'
}

/**
 * WHAT THE LAST ATTEMPT DID — the right half of an environment's two facts. An Incident AFTER the last
 * deploy is the last thing that happened (the fleet's marker rule, `fleet-state.ts`'s
 * `incidentAfterDeploy`): a deploy that never became healthy, or a serving instance that stopped — being
 * replaced, or with replacing given up. Otherwise the last deploy is, and it served: an exit the watcher
 * replaced is followed by the replacement's deploy, which is the newer fact.
 */
export function attemptOf(
  read: EnvironmentRead,
  ageOf: (iso: string) => string,
): FactCell {
  const deployed = lastDeployOf(read)
  const newest = [...read.incidents.incidents].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )[0]
  if (
    newest !== undefined &&
    (deployed === null || Date.parse(newest.createdAt) > Date.parse(deployed))
  ) {
    const age = ageOf(newest.createdAt)
    switch (newest.cause) {
      case 'deploy':
        return {
          overline: `Last attempt · ${age} ago`,
          title: `Failed: ${newest.exitReason}`,
          note: newest.failedCheck,
          tone: 'attention',
        }
      case 'exit':
        return {
          overline: `Stopped · ${age} ago`,
          title: newest.exitReason,
          note: 'A serving instance stopped; the platform is replacing it.',
          tone: 'working',
        }
      case 'exit_stopped':
        return {
          overline: `Stopped, not replaced · ${age} ago`,
          title: newest.exitReason,
          note: 'Replacing it gave up: nothing more starts until the app is deployed again.',
          tone: 'attention',
        }
    }
  }
  if (deployed === null)
    return { overline: 'Last attempt', title: 'Never deployed', tone: 'neutral' }
  return {
    overline: `Last deploy · ${ageOf(deployed)} ago`,
    title: 'It became healthy',
    tone: 'neutral',
  }
}

type LaunchRecord = Schemas['IamRegistration'] | Schemas['PrivacyAssessment']

/**
 * SINCE WHEN A LAUNCH RECORD HAS BEEN WHERE IT IS — the instant its state was written: sent to the team
 * (`sentAt`), with UBC (`submittedAt` — a change the team filed with UBC included), registered
 * (`registeredAt`) or approved (`approvedAt`); a draft, a lapse or UBC's questions back with its owner
 * since the record last changed (`updatedAt`). `null` where the platform recorded no instant.
 */
export function recordSince(record: LaunchRecord): string | null {
  switch (record.state) {
    case 'sent':
      return record.sentAt
    case 'submitted':
      return record.submittedAt
    case 'approved':
      return 'approvedAt' in record ? record.approvedAt : null
    case 'active':
      return 'registeredAt' in record ? record.registeredAt : null
    case 'change_requested':
      return 'changeRequestedFrom' in record && record.changeRequestedFrom === 'active'
        ? record.submittedAt
        : record.updatedAt
    case 'draft':
    case 'expired':
      return record.updatedAt
  }
}

/** Each release with the environments it serves now, and who made it named from the members. */
export function releaseRows(
  releases: readonly Schemas['Release'][],
  environments: readonly EnvironmentRead[],
  members: readonly Schemas['Member'][],
): { release: Schemas['Release']; servesIn: EnvKind[]; madeBy: string }[] {
  const serving = servingReleases(environments)
  return releases.map((release) => ({
    release,
    servesIn: ENV_ORDER.filter((k) => serving[k] === release.id),
    madeBy: personOf(release.createdBy, members),
  }))
}

/**
 * THE AGENTS' QUESTIONS (`listQueue` omits them — Decision 11): the ones still waiting, which the page
 * offers to reject, oldest first (the longest wait first, as the queue reads); then the answered or
 * lapsed ones, newest first, read only.
 */
export function questionsOf(actions: readonly Schemas['PendingAction'][]): {
  waiting: Schemas['PendingAction'][]
  answered: Schemas['PendingAction'][]
} {
  const at = (a: Schemas['PendingAction']) => Date.parse(a.createdAt)
  return {
    waiting: actions.filter((a) => a.state === 'pending').sort((a, b) => at(a) - at(b)),
    answered: actions.filter((a) => a.state !== 'pending').sort((a, b) => at(b) - at(a)),
  }
}

/**
 * WHAT AN AGENT ASKED TO DO, IN WORDS — the platform's own (`tokens/pending.ts`'s `whatIsAsked`), so the
 * sentence the operator is shown before rejecting is the one the project's people will read. A person
 * by their name when they are a member, else as the request named them. Held to the platform's sentence
 * by `project.test.tsx` (the demo fleet publishes the platform's words).
 */
export function askedWords(action: Schemas['PendingAction']): string {
  const object = action.object
  if (object === null)
    return `${action.summary.charAt(0).toLowerCase()}${action.summary.slice(1)}`
  const person = (p: Schemas['NamedPerson']): string =>
    p.member !== null
      ? p.member.displayName
      : p.namedBy === 'cwlLogin'
        ? `the person whose CWL login is ${p.value}`
        : p.namedBy === 'email'
          ? `the person whose email is ${p.value}`
          : p.namedBy === 'puid'
            ? 'the person the request named by their PUID'
            : `the person with user id ${p.value}`
  switch (object.kind) {
    case 'member':
      return `make ${person(object.person)} ${object.role === 'owner' ? 'an owner' : 'a collaborator'} of this project`
    case 'member-removal':
      return `remove ${person(object.person)} from this project`
    case 'deploy':
      return (
        `deploy release ${object.release.id.slice(0, 8)}` +
        (object.release.commitSha === null
          ? ''
          : ` (commit ${object.release.commitSha.slice(0, 12)})`) +
        ` to ${object.environment.kind}`
      )
  }
}
