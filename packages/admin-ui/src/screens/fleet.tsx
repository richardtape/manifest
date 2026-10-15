import { useEffect, useState } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { signIn } from '../auth'
import {
  archivedHidden,
  envCellOf,
  filterFromQuery,
  NO_FILTER,
  queryFromFilter,
  rowsOf,
  sortFromQuery,
  type FleetFilter,
  type FleetRow,
  type FleetSort,
  type Scale,
  type SortKey,
} from '../fleet-state'
import { Refusal } from '../refusal'
import { navigate, routePath } from '../router'
import { DataTable, EnvCell, FilterBar, MachineValue, type DataColumn } from '../system'
import { ageShort, dayInWords } from '../time'

const SCALE_WORDS: Record<Scale, string> = {
  solo: 'Solo',
  class: 'A class',
  large_course: 'A large course',
  public: 'Public',
}

const FLAG_FACETS = [
  ['inProduction', 'In production'],
  ['failedLast', 'Incident since its deploy'],
  ['olderBlueprint', 'Older blueprint'],
  ['archived', 'Archived'],
] as const

export interface FleetViewProps {
  fleet: Schemas['Fleet']
  blueprints: Schemas['BlueprintList']
  filter: FleetFilter
  sort: FleetSort
  now: Date
  onFilter?: (filter: FleetFilter) => void
  onSort?: (sort: FleetSort) => void
  /** A re-read that failed: shown above the fleet it left on screen. */
  error?: unknown
}

/**
 * THE FLEET, DRAWN (the design's §4): every app, its three environments — each its state, the instances
 * its hostname reaches, the last deploy's age and an Incident after it — what serves, its blueprint and
 * its last deploy; filtered and sorted from the URL; archived apps hidden unless asked for. A long table,
 * so striped (decision 17); each app a plain link to its page, which the shell's one listener keeps in
 * the app.
 */
export function FleetView(props: FleetViewProps) {
  const { fleet, blueprints, filter, sort, now } = props
  const rows = rowsOf(fleet, blueprints, filter, sort)
  const hidden = archivedHidden(fleet, filter)
  const narrowed =
    filter.text.trim() !== '' ||
    filter.inProduction ||
    filter.failedLast ||
    filter.olderBlueprint ||
    filter.archived ||
    filter.scale.length > 0
  const count = `${narrowed ? `${rows.length} of ` : ''}${fleet.length} apps${
    hidden === 0 ? '' : ` · ${hidden} archived, hidden`
  }`

  const env = (kind: 'sandbox' | 'staging' | 'production'): DataColumn<FleetRow> => ({
    key: kind,
    label: kind[0]!.toUpperCase() + kind.slice(1),
    sortable: true,
    render: (r) => <EnvCell env={envCellOf(r.envs[kind], now)} />,
  })
  const columns: DataColumn<FleetRow>[] = [
    {
      key: 'slug',
      label: 'App',
      sortable: true,
      render: (r) => (
        <span className="mfa-cellstack">
          <a
            className="mfa-slugbtn"
            href={routePath({ screen: 'project', projectId: r.id })}
          >
            {r.slug}
          </a>
          <small>{r.owner}</small>
          {r.archived ? (
            <small className="mfa-flag">
              {r.archivedAt === null
                ? 'archived'
                : `archived on ${dayInWords(r.archivedAt)}`}
            </small>
          ) : null}
        </span>
      ),
    },
    {
      key: 'audience',
      label: 'Audience',
      sortable: true,
      render: (r) =>
        r.scale === null ? 'Not asked' : <span className="mfa-mono">{r.scale}</span>,
    },
    env('sandbox'),
    env('staging'),
    env('production'),
    {
      key: 'serving',
      label: 'Serving',
      sortable: true,
      render: (r) =>
        r.serving === null ? (
          'Nothing'
        ) : (
          <span className="mfa-cellstack">
            <MachineValue
              value={r.serving.digest}
              label={`${r.slug} digest`}
              copy={false}
            />
            <small>{`in ${r.serving.in}`}</small>
          </span>
        ),
    },
    {
      key: 'blueprint',
      label: 'Blueprint',
      sortable: true,
      render: (r) => (
        <span className="mfa-cellstack">
          <span className="mfa-mono">{r.blueprint}</span>
          {r.newerBlueprint === null ? null : (
            <small className="mfa-flag">{`newer: ${r.newerBlueprint}`}</small>
          )}
        </span>
      ),
    },
    {
      key: 'deploy',
      label: 'Last deploy',
      sortable: true,
      align: 'right',
      render: (r) =>
        r.lastDeployAt === null ? 'Never' : `${ageShort(r.lastDeployAt, now)} ago`,
    },
  ]

  const toggle = (patch: Partial<FleetFilter>) =>
    props.onFilter?.({ ...filter, ...patch })
  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 className="mfa-h1">Fleet</h1>
        <p className="mfa-lede">
          Every app on the platform, and how many instances each environment runs. The
          fleet doesn’t carry an app’s data level, department, domains or this month’s AI
          spend yet.
        </p>
      </div>
      <Refusal error={props.error} />
      <FilterBar
        id="fleet-search"
        label="Filter the fleet"
        query={filter.text}
        placeholder="Filter by app, owner or blueprint  ( / )"
        onQuery={(text) => toggle({ text })}
        facets={[
          ...FLAG_FACETS.map(([field, label]) => ({
            label,
            on: filter[field],
            onToggle: () => {
              const next = { ...filter }
              next[field] = !filter[field]
              props.onFilter?.(next)
            },
          })),
          ...(Object.keys(SCALE_WORDS) as Scale[]).map((s) => ({
            label: SCALE_WORDS[s],
            on: filter.scale.includes(s),
            onToggle: () =>
              toggle({
                scale: filter.scale.includes(s)
                  ? filter.scale.filter((x) => x !== s)
                  : [...filter.scale, s],
              }),
          })),
        ]}
        onClear={() => props.onFilter?.(NO_FILTER)}
        count={count}
      />
      {rows.length === 0 ? (
        <p className="mfa-sec__body">No app matches the filter.</p>
      ) : (
        <DataTable
          caption="Every app on the platform"
          rowKey="id"
          rows={rows}
          columns={columns}
          striped
          sortKey={sort.key}
          sortDir={sort.dir}
          onSort={(key) =>
            props.onSort?.({
              key: key as SortKey,
              dir: sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc',
            })
          }
        />
      )}
    </>
  )
}

/**
 * THE FLEET SCREEN: `listFleet` and `listBlueprints` on entry, every 60 seconds and when the window is
 * shown again; the filter and the sort in the URL (each keystroke replacing the history entry, so Back
 * leaves the fleet); `/` to the filter. An ended session goes round the sign-in trip back to this URL.
 */
export function FleetScreen({ api, query }: { api: Api; query: string }) {
  const [read, setRead] = useState<{
    fleet: Schemas['Fleet']
    blueprints: Schemas['BlueprintList']
  } | null>(null)
  const [error, setError] = useState<unknown>(undefined)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let live = true
    const load = () =>
      Promise.all([api.listFleet(), api.listBlueprints()]).then(
        ([fleet, blueprints]) => {
          if (!live) return
          setRead({ fleet, blueprints })
          setNow(new Date())
          setError(undefined)
        },
        (e: unknown) => {
          if (!live) return
          if (
            e instanceof ManifestApiError &&
            e.status === 401 &&
            e.code === 'UNAUTHENTICATED'
          )
            signIn(window.location.pathname + window.location.search)
          else setError(e)
        },
      )
    void load()
    const every = window.setInterval(() => void load(), 60_000)
    const onShow = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onShow)
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as {
        tagName?: string
        isContentEditable?: boolean
      } | null
      const typing =
        target?.isContentEditable === true ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      if (event.key !== '/' || typing || event.metaKey || event.ctrlKey || event.altKey)
        return
      event.preventDefault()
      document.getElementById('fleet-search')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      live = false
      window.clearInterval(every)
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('keydown', onKey)
    }
  }, [api])

  if (read === null)
    return error === undefined ? (
      <p className="mfa-sec__body">Reading the fleet…</p>
    ) : (
      <Refusal error={error} />
    )
  const filter = filterFromQuery(query)
  const sort = sortFromQuery(query)
  return (
    <FleetView
      fleet={read.fleet}
      blueprints={read.blueprints}
      filter={filter}
      sort={sort}
      now={now}
      error={error}
      onFilter={(f) =>
        navigate({ screen: 'fleet', query: queryFromFilter(f, sort) }, { replace: true })
      }
      onSort={(s) =>
        navigate(
          { screen: 'fleet', query: queryFromFilter(filter, s) },
          { replace: true },
        )
      }
    />
  )
}
