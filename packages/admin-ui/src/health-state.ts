import type { Schemas } from '@manifest/contract'
import { DEFAULT_SORT, NO_FILTER, rowsOf } from './fleet-state'
import { CAUSE_STATE, CAUSE_WORDS, type EnvKind } from './project-state'
import type { State } from './system'

/**
 * HEALTH AND RISK, FROM THE FLEET AND ITS FAN-OUT (the refreshed design's §7) — the pure half of the
 * Health screen: which reads the fleet calls for, and the four panels from their answers. Health is the
 * one screen still built by fan-out, so it says what it cost: the reads are counted, never estimated.
 * Archived apps are left out of every panel — nothing of theirs runs.
 */
const DAY = 86_400_000
/** Incidents read where the fleet says one happened in this many days. */
export const INCIDENT_DAYS = 14
/** A certificate is shown within this many days of its expiry, amber… */
export const CERT_AMBER_DAYS = 90
/** …and red within this many: an unnoticed expiry silently stops sign-in for a live course app. */
export const CERT_RED_DAYS = 14

export interface HealthRead {
  fleet: Schemas['Fleet']
  blueprints: Schemas['BlueprintList']
  /** `getLaunchRecords` of each active app. */
  records: { projectId: string; records: Schemas['LaunchRecords'] }[]
  /** `getRelease` of each release serving an active app's environment. */
  releases: Schemas['Release'][]
  /** `listIncidents` of each environment the fleet says had an Incident in the window. */
  incidents: { projectId: string; kind: EnvKind; incidents: Schemas['Incident'][] }[]
  /** How many reads the screen made — counted as each was sent. */
  reads: number
}

const active = (fleet: Schemas['Fleet']) => fleet.filter((p) => p.state === 'active')

/** Every active app — each one's launch records are read for its two certificates. */
export function recordTargets(fleet: Schemas['Fleet']): string[] {
  return active(fleet).map((p) => p.id)
}

/** Every release serving an active app's environment, once each — each one's scan is read. */
export function servingReleaseIds(fleet: Schemas['Fleet']): string[] {
  return [
    ...new Set(
      active(fleet).flatMap((p) =>
        p.environments.flatMap((e) => (e.releaseId === null ? [] : [e.releaseId])),
      ),
    ),
  ]
}

/**
 * Each active app with an environment whose newest Incident is within the window — the fleet narrows
 * the fan-out. The Fleet's environments carry no id, so the screen reads the app's environments first.
 */
export function incidentTargets(
  fleet: Schemas['Fleet'],
  now: Date,
): { projectId: string; kinds: EnvKind[] }[] {
  const since = now.getTime() - INCIDENT_DAYS * DAY
  return active(fleet).flatMap((p) => {
    const kinds = p.environments
      .filter(
        (e) => e.latestIncidentAt !== null && Date.parse(e.latestIncidentAt) >= since,
      )
      .map((e) => e.kind)
    return kinds.length === 0 ? [] : [{ projectId: p.id, kinds }]
  })
}

const slugOf = (read: HealthRead, projectId: string) =>
  read.fleet.find((p) => p.id === projectId)?.slug ?? projectId

export interface IncidentEntry {
  projectId: string
  slug: string
  kind: EnvKind
  incident: Schemas['Incident']
  words: string
  state: State
}

const RANK: Record<Schemas['Incident']['cause'], number> = {
  exit_stopped: 0,
  exit: 1,
  deploy: 2,
}

/**
 * THE INCIDENTS OF THE LAST 14 DAYS, BY CAUSE: replacing given up first (production is short of its count
 * until someone acts), then a serving instance stopped and replaced, then a failed deploy (what served is
 * untouched) — each newest first.
 */
export function incidentsPanel(read: HealthRead, now: Date): IncidentEntry[] {
  const since = now.getTime() - INCIDENT_DAYS * DAY
  return read.incidents
    .flatMap(({ projectId, kind, incidents }) =>
      incidents
        .filter((i) => Date.parse(i.createdAt) >= since)
        .map((incident) => ({
          projectId,
          slug: slugOf(read, projectId),
          kind,
          incident,
          words: CAUSE_WORDS[incident.cause],
          state: CAUSE_STATE[incident.cause],
        })),
    )
    .sort(
      (a, b) =>
        RANK[a.incident.cause] - RANK[b.incident.cause] ||
        Date.parse(b.incident.createdAt) - Date.parse(a.incident.createdAt),
    )
}

export interface CertificateEntry {
  projectId: string
  slug: string
  environment: 'staging' | 'production'
  entityId: string
  expiresAt: string
  /** Whole days left, rounded up; zero or less once it has expired. */
  days: number
  tone: 'red' | 'amber'
}

/** EACH REGISTRATION'S CERTIFICATE WITHIN 90 DAYS OF ITS EXPIRY — both registrations, soonest first. */
export function certificatesPanel(read: HealthRead, now: Date): CertificateEntry[] {
  return read.records
    .flatMap(({ projectId, records }) =>
      [records.stagingRegistration, records.iamRegistration].flatMap((r) => {
        if (r === null || r.certExpiresAt === null) return []
        const days = Math.ceil((Date.parse(r.certExpiresAt) - now.getTime()) / DAY)
        if (days > CERT_AMBER_DAYS) return []
        return [
          {
            projectId,
            slug: slugOf(read, projectId),
            environment: r.environment,
            entityId: r.entityId,
            expiresAt: r.certExpiresAt,
            days,
            tone: days <= CERT_RED_DAYS ? ('red' as const) : ('amber' as const),
          },
        ]
      }),
    )
    .sort((a, b) => a.days - b.days || a.slug.localeCompare(b.slug))
}

export interface ScanEntry {
  projectId: string
  slug: string
  release: Schemas['Release']
  /** The environments of the app this release serves. */
  kinds: EnvKind[]
  /** Not scanned at all, a stale database, or a fix that exists. */
  why: 'unscanned' | 'stale' | 'fixable'
}

/**
 * THE SCANS THAT PROVE LESS THAN THEY LOOK — the release serving each environment, where its scan is
 * missing, ran against a stale database, or found something a fix exists for. A stale scan with a
 * fixable finding is said as stale: the finding is why the checklist's `scans` stays unmet.
 */
export function scansPanel(read: HealthRead): ScanEntry[] {
  return active(read.fleet).flatMap((p) => {
    const ids = [
      ...new Set(
        p.environments.flatMap((e) => (e.releaseId === null ? [] : [e.releaseId])),
      ),
    ]
    return ids.flatMap((id): ScanEntry[] => {
      const release = read.releases.find((r) => r.id === id)
      if (release === undefined) return []
      const scan = release.scan
      const why =
        scan === null
          ? 'unscanned'
          : scan.stale
            ? 'stale'
            : scan.fixable.critical + scan.fixable.high > 0
              ? 'fixable'
              : null
      if (why === null) return []
      const kinds = p.environments.filter((e) => e.releaseId === id).map((e) => e.kind)
      return [{ projectId: p.id, slug: p.slug, release, kinds, why }]
    })
  })
}

/** THE APPS PINNED TO AN OLDER MAJOR than `listBlueprints`' newest of their blueprint — the fleet's own rule. */
export function supersededPanel(read: HealthRead): {
  projectId: string
  slug: string
  blueprint: string
  newer: string
  owner: string
}[] {
  return rowsOf(
    read.fleet,
    read.blueprints,
    { ...NO_FILTER, olderBlueprint: true },
    DEFAULT_SORT,
  )
    .filter((r) => r.newerBlueprint !== null)
    .map((r) => ({
      projectId: r.id,
      slug: r.slug,
      blueprint: r.blueprint,
      newer: r.newerBlueprint!,
      owner: r.owner,
    }))
}

/** *"Read just now from 31 reads"* — what the screen cost, and how long ago. */
export function readWords(reads: number, at: Date, now: Date): string {
  const ms = now.getTime() - at.getTime()
  const minutes = Math.floor(ms / 60_000)
  const when =
    minutes < 1
      ? 'just now'
      : minutes === 1
        ? 'a minute ago'
        : minutes < 60
          ? `${minutes} minutes ago`
          : `${Math.floor(minutes / 60)} hours ago`
  return `Read ${when} from ${reads} ${reads === 1 ? 'read' : 'reads'}`
}
