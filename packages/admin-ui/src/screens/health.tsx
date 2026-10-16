import { useEffect, useState, type ReactNode } from 'react'
import { ManifestApiError } from '@manifest/contract'
import type { Api } from '../api'
import { signIn } from '../auth'
import {
  certificatesPanel,
  incidentsPanel,
  incidentTargets,
  readWords,
  recordTargets,
  scansPanel,
  servingReleaseIds,
  supersededPanel,
  type HealthRead,
} from '../health-state'
import { Refusal } from '../refusal'
import { routePath } from '../router'
import { Button, FactList, InverseSurface, RawChip } from '../system'
import { ageShort, dayInWords } from '../time'

/**
 * HEALTH'S FAN-OUT, EVERY READ COUNTED AS IT IS SENT: the fleet and the blueprints; each active app's
 * launch records (its two certificates); each serving release (its scan); and, where the fleet says an
 * environment had an Incident in 14 days, the app's environments (the Fleet carries no environment id)
 * and that environment's Incidents.
 */
export async function readHealth(api: Api, now: Date): Promise<HealthRead> {
  let reads = 0
  function counted<T>(read: Promise<T>): Promise<T> {
    reads += 1
    return read
  }
  const [fleet, blueprints] = await Promise.all([
    counted(api.listFleet()),
    counted(api.listBlueprints()),
  ])
  const [records, releases, incidents] = await Promise.all([
    Promise.all(
      recordTargets(fleet).map(async (projectId) => ({
        projectId,
        records: await counted(api.getLaunchRecords(projectId)),
      })),
    ),
    Promise.all(servingReleaseIds(fleet).map((id) => counted(api.getRelease(id)))),
    Promise.all(
      incidentTargets(fleet, now).map(async ({ projectId, kinds }) => {
        const environments = await counted(api.listEnvironments(projectId))
        return Promise.all(
          environments
            .filter((e) => kinds.includes(e.kind))
            .map(async (e) => ({
              projectId,
              kind: e.kind,
              incidents: (await counted(api.listIncidents(e.id))).incidents,
            })),
        )
      }),
    ).then((lists) => lists.flat()),
  ])
  return { fleet, blueprints, records, releases, incidents, reads }
}

function Panel(props: {
  title: string
  count?: number
  foot: string
  children?: ReactNode[]
  empty?: string
}) {
  const items = props.children ?? []
  return (
    <section className="mfa-panel">
      <div className="mfa-panel__head">
        <h2 className="mfa-panel__title">{props.title}</h2>
        {props.count === undefined ? null : (
          <span className="mfa-panel__count">{props.count}</span>
        )}
      </div>
      {items.length > 0 ? (
        <ul className="mfa-panel__list">{items}</ul>
      ) : props.empty === undefined ? null : (
        <ul className="mfa-panel__list">
          <li className="mfa-panel__item">
            <span className="mfa-sec__body">{props.empty}</span>
          </li>
        </ul>
      )}
      <p className="mfa-panel__foot">{props.foot}</p>
    </section>
  )
}

const slugLink = (projectId: string, slug: string) => (
  <a
    className="mfa-slugbtn"
    href={routePath({ screen: 'project', projectId })}
    style={{ fontWeight: 500 }}
  >
    {slug}
  </a>
)

/** The words each panel ends with: what it read, and what it cannot see. */
export const CANNOT_SEE = {
  certificates:
    'Service Provider certificates, from each app’s two IAM registrations. Amber within 90 days, red within 14. Custom-domain certificates are not visible: domains are not modelled yet.',
  incidents:
    'Each environment’s Incidents of the last 14 days, read where the fleet says one happened. Nothing says whether one is still open.',
  scans:
    'From the scan recorded on each serving release. A scan’s database age is the age of the database that scan used — Manifest can’t read the database’s age now.',
  blueprints:
    'A major version is a breaking change, so nothing moves an app automatically: its owner rebuilds on the new one. What changed between majors is not visible here.',
  policies:
    'Not visible. Manifest can’t read which policies a driver reports it cannot enforce yet, so this panel has nothing to show.',
} as const

export interface HealthViewProps {
  read: HealthRead
  /** When the read was made. */
  at: Date
  now: Date
  /** A re-read that failed: shown above the panels it left on screen. */
  error?: unknown
  reading?: boolean
  onReadAgain?: () => void
}

/**
 * HEALTH AND RISK, DRAWN (the refreshed design's §7): what fails quietly — a certificate that expires, an
 * instance that stopped, a scan that proves less than it looks, an app on an older blueprint — each panel
 * saying what it cannot see, and the screen saying what it cost.
 */
export function HealthView(props: HealthViewProps) {
  const { read, now } = props
  const certs = certificatesPanel(read, now)
  const incidents = incidentsPanel(read, now)
  const scans = scansPanel(read)
  const superseded = supersededPanel(read)
  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 className="mfa-h1">Health and risk</h1>
        <p className="mfa-lede">
          What fails quietly: a certificate that expires, an instance that stopped, a scan
          that proves less than it looks.
        </p>
        <p className="mfa-sec__body" style={{ marginTop: 8 }}>
          {`${readWords(read.reads, props.at, now)}. `}
          <Button
            kind="tertiary"
            size="sm"
            onClick={props.onReadAgain}
            disabled={props.reading === true}
          >
            Read again
          </Button>
        </p>
      </div>
      <Refusal error={props.error} />
      <div className="mfa-health">
        <Panel
          title="Certificates expiring within 90 days"
          count={certs.length}
          foot={CANNOT_SEE.certificates}
          empty="No certificate expires within 90 days."
        >
          {certs.map((c) => (
            <li key={`${c.projectId}:${c.environment}`} className="mfa-panel__item">
              <div className="mfa-panel__line">
                {slugLink(c.projectId, c.slug)}
                <span className="mfa-mono" style={{ color: 'var(--ink-subtle)' }}>
                  {c.environment}
                </span>
                <span className={`mfa-days mfa-days--${c.tone}`}>
                  {c.days <= 0 ? 'expired' : `${c.days} ${c.days === 1 ? 'day' : 'days'}`}
                </span>
                <span style={{ color: 'var(--ink-subtle)', fontSize: 12 }}>
                  {`${c.days <= 0 ? 'expired' : 'expires'} ${dayInWords(c.expiresAt)}`}
                </span>
              </div>
              <span
                className="mfa-mono"
                style={{ color: 'var(--ink-subtle)', fontSize: 11.5 }}
              >
                {c.entityId}
              </span>
              {c.tone === 'red' ? (
                <span style={{ fontSize: 12.5, color: 'var(--attention-deep)' }}>
                  {c.environment === 'production'
                    ? 'If it expires, nobody can sign in to this live app. Renewing it is a change request to UBC IAM.'
                    : 'If it expires, nobody can sign in to this app’s staging. Renewing it is a change request to UBC IAM.'}
                </span>
              ) : null}
            </li>
          ))}
        </Panel>

        <Panel
          title="Incidents, by cause"
          count={incidents.length}
          foot={CANNOT_SEE.incidents}
          empty="No Incident in the last 14 days."
        >
          {incidents.map((e) => (
            <li key={e.incident.id} className="mfa-panel__item">
              <div className="mfa-panel__line">
                {slugLink(e.projectId, e.slug)}
                <span className="mfa-mono" style={{ color: 'var(--ink-subtle)' }}>
                  {e.kind}
                </span>
                <span style={{ color: 'var(--ink-subtle)', fontSize: 12 }}>
                  {`${ageShort(e.incident.createdAt, now)} ago`}
                </span>
                <RawChip
                  raw={e.incident.cause}
                  state={e.state}
                  label={e.words}
                  pulse={false}
                />
              </div>
              <FactList
                rows={[
                  { label: 'How it ended', value: e.incident.exitReason },
                  { label: 'The check', value: e.incident.failedCheck, mono: true },
                  {
                    label: 'Since healthy',
                    value: e.incident.diffSinceHealthy,
                    mono: true,
                  },
                ]}
              />
              {e.incident.logTail === '' ? null : (
                <InverseSurface inset={e.incident.logTail} />
              )}
            </li>
          ))}
        </Panel>

        <Panel
          title="Scans that prove less than they look"
          count={scans.length}
          foot={CANNOT_SEE.scans}
          empty="Every serving release was scanned against a fresh database, with nothing a fix exists for."
        >
          {scans.map((s) => {
            const scan = s.release.scan
            const chip =
              s.why === 'stale' ? (
                <RawChip state="waiting" label="Stale database" raw="stale: true" />
              ) : s.why === 'fixable' ? (
                <RawChip
                  state="attention"
                  label="A fix exists"
                  raw={`fixable.high: ${scan?.fixable.high ?? 0}`}
                  pulse={false}
                />
              ) : (
                <RawChip state="notyet" label="Not scanned" raw="scan: null" />
              )
            const where = `In ${s.kinds.join(' and ')}: ${s.release.summary ?? 'a release'}.`
            const what =
              scan === null
                ? ' Nothing was scanned for this build.'
                : s.why === 'stale'
                  ? ` Scanned against a database ${scan.databaseAgeDays ?? 'of unknown age'}${scan.databaseAgeDays === null ? '' : ' days old'}. A clean result from a stale database is not evidence there is nothing to find.`
                  : ` ${scan.fixable.critical} critical and ${scan.fixable.high} high findings this build introduced have a fix.`
            return (
              <li key={`${s.projectId}:${s.release.id}`} className="mfa-panel__item">
                <div className="mfa-panel__line">
                  {slugLink(s.projectId, s.slug)}
                  {chip}
                </div>
                <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                  {where + what}
                </span>
              </li>
            )
          })}
        </Panel>

        <Panel
          title="Pinned to an older blueprint"
          count={superseded.length}
          foot={CANNOT_SEE.blueprints}
          empty="Every app is on its blueprint’s newest major."
        >
          {superseded.map((p) => (
            <li key={p.projectId} className="mfa-panel__item">
              <div className="mfa-panel__line">
                {slugLink(p.projectId, p.slug)}
                <span className="mfa-mono">{`${p.blueprint} → ${p.newer}`}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-subtle)' }}>
                  {`owned by ${p.owner}`}
                </span>
              </div>
            </li>
          ))}
        </Panel>

        <Panel
          title="Policies a driver says it cannot enforce"
          foot={CANNOT_SEE.policies}
        />
      </div>
    </>
  )
}

/**
 * THE HEALTH SCREEN: its fan-out on entry, when the window is shown again, and on *Read again* — never
 * on a timer: thirty-odd reads a minute would be the screen's whole cost for news that changes by the
 * day. The clock moves by the minute, so *"Read 2 minutes ago"* stays true.
 */
export function HealthScreen({ api }: { api: Api }) {
  const [read, setRead] = useState<{ health: HealthRead; at: Date } | null>(null)
  const [error, setError] = useState<unknown>(undefined)
  const [reading, setReading] = useState(true)
  const [again, setAgain] = useState(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let live = true
    const load = () => {
      setReading(true)
      const at = new Date()
      readHealth(api, at).then(
        (health) => {
          if (!live) return
          setRead({ health, at })
          setNow(new Date())
          setError(undefined)
          setReading(false)
        },
        (e: unknown) => {
          if (!live) return
          setReading(false)
          if (
            e instanceof ManifestApiError &&
            e.status === 401 &&
            e.code === 'UNAUTHENTICATED'
          )
            signIn(window.location.pathname + window.location.search)
          else setError(e)
        },
      )
    }
    load()
    const onShow = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onShow)
    const tick = window.setInterval(() => setNow(new Date()), 60_000)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onShow)
      window.clearInterval(tick)
    }
  }, [api, again])

  if (read === null)
    return error === undefined ? (
      <p className="mfa-sec__body">Reading the fleet’s health…</p>
    ) : (
      <Refusal error={error} />
    )
  return (
    <HealthView
      read={read.health}
      at={read.at}
      now={now}
      error={error}
      reading={reading}
      onReadAgain={() => setAgain((n) => n + 1)}
    />
  )
}
