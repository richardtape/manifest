import type { Schemas } from '@manifest/contract'
import type { EnvCellProps } from './system'
import { ageShort } from './time'

/**
 * THE FLEET'S PURE HALF: its rows from `listFleet` and `listBlueprints`, filtered and sorted, the filter
 * and the sort held in the URL's query so a filtered fleet is a pasteable link, and one environment's
 * cell — its state, the instances the hostname reaches, the last deploy's age, and an Incident after it.
 */
export type Scale = Schemas['Audience']['scale']
export type EnvKind = 'sandbox' | 'staging' | 'production'
type FleetProject = Schemas['Fleet'][number]
export type FleetEnv = FleetProject['environments'][number]

export interface FleetFilter {
  text: string
  /** Something serves production. */
  inProduction: boolean
  /** An environment whose newest Incident came after its last deploy. */
  failedLast: boolean
  /** On a blueprint whose major a newer one has superseded. */
  olderBlueprint: boolean
  /** Archived apps only — hidden otherwise. */
  archived: boolean
  scale: Scale[]
}

export const NO_FILTER: FleetFilter = {
  text: '',
  inProduction: false,
  failedLast: false,
  olderBlueprint: false,
  archived: false,
  scale: [],
}

export type SortKey =
  | 'slug'
  | 'audience'
  | 'sandbox'
  | 'staging'
  | 'production'
  | 'serving'
  | 'blueprint'
  | 'deploy'
export interface FleetSort {
  key: SortKey
  dir: 'asc' | 'desc'
}
export const DEFAULT_SORT: FleetSort = { key: 'deploy', dir: 'desc' }

const SCALES: readonly Scale[] = ['solo', 'class', 'large_course', 'public']
const SORT_KEYS: readonly SortKey[] = [
  'slug',
  'audience',
  'sandbox',
  'staging',
  'production',
  'serving',
  'blueprint',
  'deploy',
]
const FLAGS = [
  ['inProduction', 'prod'],
  ['failedLast', 'failed'],
  ['olderBlueprint', 'older'],
  ['archived', 'archived'],
] as const

/** The query a filter and a sort are written as — empty for no filter and the default sort. */
export function queryFromFilter(
  filter: FleetFilter,
  sort: FleetSort = DEFAULT_SORT,
): string {
  const q = new URLSearchParams()
  if (filter.text.trim() !== '') q.set('q', filter.text)
  for (const [field, param] of FLAGS) if (filter[field]) q.set(param, '1')
  for (const s of SCALES) if (filter.scale.includes(s)) q.append('scale', s)
  if (sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir) {
    q.set('sort', sort.key)
    q.set('dir', sort.dir)
  }
  return q.toString()
}

/** A filter read from the query; anything it does not know is left out, never guessed. */
export function filterFromQuery(query: string): FleetFilter {
  const q = new URLSearchParams(query)
  const filter: FleetFilter = { ...NO_FILTER, text: q.get('q') ?? '', scale: [] }
  for (const [field, param] of FLAGS) filter[field] = q.get(param) === '1'
  const asked = q.getAll('scale')
  filter.scale = SCALES.filter((s) => asked.includes(s))
  return filter
}

export function sortFromQuery(query: string): FleetSort {
  const q = new URLSearchParams(query)
  const key = q.get('sort')
  const dir = q.get('dir')
  return key !== null &&
    (SORT_KEYS as readonly string[]).includes(key) &&
    (dir === 'asc' || dir === 'desc')
    ? { key: key as SortKey, dir }
    : DEFAULT_SORT
}

/**
 * AN INCIDENT AFTER THE LAST DEPLOY — the platform's own two instants: `lastDeployAt` is the newest
 * deploy's (`max(lastSeenAt)`, which only the deploy that starts an instance writes — a replacement is a
 * deploy), `latestIncidentAt` the newest Incident's. So a member that stopped and was replaced reads
 * clean, a member whose replacing stopped does not, and an environment that never served (no deploy
 * recorded) with an Incident does.
 */
export function incidentAfterDeploy(env: FleetEnv): boolean {
  if (env.latestIncidentAt === null) return false
  return (
    env.lastDeployAt === null ||
    Date.parse(env.latestIncidentAt) > Date.parse(env.lastDeployAt)
  )
}

/**
 * ONE ENVIRONMENT'S CELL (`<EnvCell>`): the platform's state word, the instances the hostname reaches as
 * the fleet counts them (a stopped member stays in the set until its replacement serves — which of them
 * serve is the project page's `listInstances`), the last deploy's age, and the Incident after it.
 */
export function envCellOf(env: FleetEnv | null, now: Date): EnvCellProps['env'] {
  if (env === null) return null
  if (env.state === null) return { state: null }
  return {
    state: env.state,
    instances: env.instances,
    ...(env.lastDeployAt === null
      ? {}
      : { age: `${ageShort(env.lastDeployAt, now)} ago` }),
    ...(incidentAfterDeploy(env)
      ? { incident: `${ageShort(env.latestIncidentAt!, now)} ago` }
      : {}),
  }
}

export interface FleetRow {
  id: string
  slug: string
  name: string
  owner: string
  scale: Scale | null
  blueprint: string
  /** The blueprint that superseded this one's major; null when it is current. */
  newerBlueprint: string | null
  archived: boolean
  archivedAt: string | null
  createdAt: string
  envs: Record<EnvKind, FleetEnv | null>
  /** The newest of its environments' last deploys. */
  lastDeployAt: string | null
  /** What serves furthest along — production, else staging, else the sandbox. */
  serving: { digest: string; in: EnvKind } | null
}

/** `name@major` → the newest `ref` of that name, when it is newer. */
function newerOf(blueprint: string, blueprints: Schemas['BlueprintList']): string | null {
  const at = blueprint.lastIndexOf('@')
  const name = blueprint.slice(0, at)
  const major = Number(blueprint.slice(at + 1))
  const newest = blueprints
    .filter((b) => b.name === name)
    .sort((a, b) => b.majorVersion - a.majorVersion)[0]
  return newest !== undefined && newest.majorVersion > major ? newest.ref : null
}

function rowOf(p: FleetProject, blueprints: Schemas['BlueprintList']): FleetRow {
  const env = (kind: EnvKind) => p.environments.find((e) => e.kind === kind) ?? null
  const envs = {
    sandbox: env('sandbox'),
    staging: env('staging'),
    production: env('production'),
  }
  const deploys = p.environments
    .map((e) => e.lastDeployAt)
    .filter((t): t is string => t !== null)
    .sort((a, b) => Date.parse(b) - Date.parse(a))
  const servingIn = (['production', 'staging', 'sandbox'] as const).find(
    (k) => envs[k]?.state != null && envs[k]?.imageDigest != null,
  )
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    owner: p.owner.displayName,
    scale: p.audience?.scale ?? null,
    blueprint: p.blueprint,
    newerBlueprint: newerOf(p.blueprint, blueprints),
    archived: p.state === 'archived',
    archivedAt: p.archivedAt,
    createdAt: p.createdAt,
    envs,
    lastDeployAt: deploys[0] ?? null,
    serving:
      servingIn === undefined
        ? null
        : { digest: envs[servingIn]!.imageDigest!, in: servingIn },
  }
}

function matches(row: FleetRow, p: FleetProject, filter: FleetFilter): boolean {
  if (row.archived !== filter.archived) return false
  if (filter.inProduction && row.envs.production?.state == null) return false
  if (filter.failedLast && !p.environments.some(incidentAfterDeploy)) return false
  if (filter.olderBlueprint && row.newerBlueprint === null) return false
  if (
    filter.scale.length > 0 &&
    (row.scale === null || !filter.scale.includes(row.scale))
  )
    return false
  const text = filter.text.trim().toLowerCase()
  if (text === '') return true
  return [row.slug, row.name, row.owner, p.owner.email, row.blueprint].some((s) =>
    s.toLowerCase().includes(text),
  )
}

const STATE_RANK: Record<string, number> = { failed: 0, starting: 1, healthy: 2, gone: 3 }

/** A sort's value for a row; `null` sorts last, whichever way the rest go. */
function sortValue(row: FleetRow, key: SortKey): string | number | null {
  switch (key) {
    case 'slug':
      return row.slug
    case 'audience':
      return row.scale === null ? null : SCALES.indexOf(row.scale)
    case 'sandbox':
    case 'staging':
    case 'production': {
      const e = row.envs[key]
      if (e === null || e.state === null) return null
      return (STATE_RANK[e.state] ?? 9) * 1000 + Math.min(e.instances, 999)
    }
    case 'serving':
      return row.serving?.digest ?? null
    case 'blueprint':
      return row.blueprint
    case 'deploy':
      return row.lastDeployAt === null ? null : Date.parse(row.lastDeployAt)
  }
}

/** The fleet's rows: filtered (archived apps hidden unless asked for), then sorted, ties by slug. */
export function rowsOf(
  fleet: Schemas['Fleet'],
  blueprints: Schemas['BlueprintList'],
  filter: FleetFilter,
  sort: FleetSort,
): FleetRow[] {
  const dir = sort.dir === 'asc' ? 1 : -1
  return fleet
    .map((p) => ({ p, row: rowOf(p, blueprints) }))
    .filter(({ p, row }) => matches(row, p, filter))
    .map(({ row }) => row)
    .sort((a, b) => {
      const x = sortValue(a, sort.key)
      const y = sortValue(b, sort.key)
      if (x === null && y === null) return a.slug.localeCompare(b.slug)
      if (x === null) return 1
      if (y === null) return -1
      const c = x < y ? -1 : x > y ? 1 : 0
      return c === 0 ? a.slug.localeCompare(b.slug) : c * dir
    })
}

/** How many archived apps the filter is hiding. */
export function archivedHidden(fleet: Schemas['Fleet'], filter: FleetFilter): number {
  return filter.archived ? 0 : fleet.filter((p) => p.state === 'archived').length
}
