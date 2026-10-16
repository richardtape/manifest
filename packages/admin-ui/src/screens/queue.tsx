import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { signIn } from '../auth'
import {
  BAND,
  bandsOf,
  facetOn,
  FACETS,
  filterOf,
  headlineOf,
  holderWords,
  itemKey,
  kindWords,
  moveSelection,
  queryOf,
  queueKeyAction,
  selectionAfterRead,
  toggleFacet,
  type QueueFilter,
  type QueueItem,
} from '../queue-state'
import { Refusal } from '../refusal'
import { navigate, type Route } from '../router'
import { FilterBar, QueueRow, WaitHeadline, type QueueRowMeta } from '../system'
import { ageShort, ageWords, dayInWords } from '../time'
import { ApprovalPane } from './approval-pane'
import { RecordPane } from './record-pane'

const READ_EVERY_MS = 60_000

/** *"Read just now"* — when the queue on screen was read. */
function readWords(readAt: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - readAt.getTime())
  if (ms < 15_000) return 'just now'
  if (ms < 60_000) return `${Math.round(ms / 1000)} seconds ago`
  return `${ageWords(readAt.toISOString(), now)} ago`
}

/** Who asked, and the day — the platform's own instant, said as a Vancouver day. */
function askedWords(item: QueueItem): string {
  const who = item.requestedBy?.displayName
  const day = dayInWords(item.since)
  switch (item.kind) {
    case 'release-approval':
      return `${who ?? 'Someone'} asked on ${day}`
    case 'iam-registration-to-submit':
    case 'iam-change-to-file':
    case 'privacy-assessment-to-submit':
      return `${who ?? 'Someone'} sent it on ${day}`
    case 'iam-change-request':
      return `Filed on ${day}, sent by ${who ?? 'someone'}`
    case 'iam-registration':
    case 'privacy-assessment':
      return `Submitted on ${day}, sent by ${who ?? 'someone'}`
  }
}

/**
 * A ROW IS ONE `QueueItem` AND NO MORE (the design's §3.3 and decision 21): age, kind, slug, the
 * platform's own sentence, who asked and when, the environment for a registration, a note marker
 * (the note itself is read in the pane), and who holds the wait. What a grant would change is the
 * pane's to read.
 */
function rowOf(item: QueueItem, now: Date) {
  const meta: QueueRowMeta[] = [{ text: askedWords(item) }]
  if (item.environment !== null) meta.push({ text: item.environment, mono: true })
  if (item.note !== null) meta.push({ text: '✎ a note', flag: true })
  meta.push({ text: holderWords(item), holder: true })
  return {
    ageText: ageShort(item.since, now),
    kindLabel: kindWords(item.kind),
    project: item.project.slug,
    ask: item.summary,
    meta,
  }
}

const rowId = (key: string) => `row-${key}`

export interface QueueViewProps {
  queue: Schemas['Queue']
  now: Date
  /** When `queue` was read. */
  readAt: Date
  filter: QueueFilter
  /** The selected item's key (`itemKey`), or null. */
  selected: string | null
  onFilter?: (filter: QueueFilter) => void
  onSelect?: (item: QueueItem) => void
  /** The selected item's pane; without one, the pane asks for a choice. */
  pane?: ReactNode
  /** A re-read that failed: shown above the queue it left on screen. */
  error?: unknown
}

/**
 * THE QUEUE, DRAWN — §26's primary screen: the oldest wait on US as its headline, the people waiting
 * and the items; the filter; the two bands by who holds the wait, oldest first; and the selected
 * item's pane beside them. Every row amber, red kept for breakage (decision 3); every age still.
 */
export function QueueView(props: QueueViewProps) {
  const { queue, now, filter } = props
  const headline = headlineOf(queue)
  const { us, ubc } = bandsOf(queue, filter)
  const oldest = queue.items
    .filter((i) => BAND[i.kind] === 'us')
    .find((i) => i.since === headline.oldestOnUs)
  const truncated = headline.truncated
    ? 'Only the oldest 200 are shown, and every number here counts those. '
    : ''
  const read = `${truncated}Read ${readWords(props.readAt, now)} · again every 60 seconds`
  const filtered = filter.text.trim() !== '' || filter.kinds.length > 0

  const band = (title: string, note: string, list: QueueItem[]) => (
    <section className="mfa-band" aria-label={title}>
      <div className="mfa-band__head">
        <h2 className="mfa-band__title">{title}</h2>
        <span className="mfa-band__note">{note}</span>
      </div>
      <ul className="mfa-rows">
        {list.length > 0 ? (
          list.map((item) => {
            const key = itemKey(item)
            return (
              <QueueRow
                key={key}
                id={rowId(key)}
                item={rowOf(item, now)}
                selected={key === props.selected}
                onSelect={() => props.onSelect?.(item)}
              />
            )
          })
        ) : (
          <li className="mfa-rows__empty">
            {filtered ? 'Nothing here matches the filter.' : 'Nothing is waiting here.'}
          </li>
        )}
      </ul>
    </section>
  )

  return (
    <>
      <Refusal error={props.error} />
      <WaitHeadline
        oldest={
          oldest === undefined
            ? null
            : {
                text: ageWords(oldest.since, now),
                note: `${kindWords(oldest.kind)}, ${oldest.project.slug}. Its age is from when it was ${
                  oldest.kind === 'release-approval' ? 'asked for' : 'sent'
                }.`,
              }
        }
        people={headline.peopleWaiting}
        items={headline.items}
        itemsLabel={`${headline.items === 1 ? 'item' : 'items'} · ${headline.onUs} on us, ${headline.withUbc} with UBC`}
        assembled={read}
      />
      {oldest === undefined ? <p className="mfa-sec__body">{read}</p> : null}
      <FilterBarFor
        filter={filter}
        shown={us.length + ubc.length}
        all={queue.items.length}
        {...(props.onFilter === undefined ? {} : { onFilter: props.onFilter })}
      />
      <div className="mfa-queue">
        <div>
          {band('Waiting on us', 'The headline counts these.', us)}
          {band('Waiting on UBC', 'Ours to chase and record.', ubc)}
        </div>
        <section className="mfa-pane" id="pane" aria-label="The selected item">
          {props.pane ?? (
            <section className="mfa-sec">
              <p className="mfa-sec__body">
                Choose an item to see what it asks, and decide it.
              </p>
            </section>
          )}
        </section>
      </div>
    </>
  )
}

function FilterBarFor(props: {
  filter: QueueFilter
  shown: number
  all: number
  onFilter?: (filter: QueueFilter) => void
}) {
  const { filter } = props
  return (
    <FilterBar
      id="queue-search"
      label="Filter the queue"
      query={filter.text}
      placeholder="Filter by app or person  ( / )"
      onQuery={(text) => props.onFilter?.({ ...filter, text })}
      facets={FACETS.map((f) => ({
        label: f.label,
        on: facetOn(filter, f.kinds),
        onToggle: () => props.onFilter?.(toggleFacet(filter, f.kinds)),
      }))}
      onClear={() => props.onFilter?.({ text: '', kinds: [] })}
      count={`${props.shown} of ${props.all} · j and k move`}
    />
  )
}

/**
 * The selected item's pane, by kind: a release's sign-off is the approval pane — opened by its queue
 * URL or by `/releases/<id>/approval`, in the queue or no longer — and every other kind is a launch
 * record's: the team's step, or UBC's answer (`record-pane.tsx`).
 */
function ItemPane(props: {
  api: Api
  me: Schemas['Me']
  selected: string
  item: QueueItem | null
  left: boolean
  preview: string | undefined
  now: Date
  onDecided: () => void
}) {
  const { item, left, now } = props
  const release = 'release-approval:'
  if (props.selected.startsWith(release))
    return (
      <ApprovalPane
        api={props.api}
        me={props.me}
        releaseId={props.selected.slice(release.length)}
        item={item}
        left={left}
        preview={props.preview}
        now={now}
        onDecided={props.onDecided}
      />
    )
  if (item === null)
    return (
      <section className="mfa-sec">
        <p className="mfa-sec__body">This is no longer waiting on us.</p>
      </section>
    )
  return (
    <RecordPane
      api={props.api}
      me={props.me}
      item={item}
      now={now}
      left={left}
      onDecided={props.onDecided}
    />
  )
}

/** The selected item's key from the route: a queue item's URL, or a release pane's. */
export function selectedOf(route: Route): string | null {
  if (route.screen === 'release') return `release-approval:${route.releaseId}`
  if (
    route.screen === 'queue' &&
    route.kind !== undefined &&
    route.subjectId !== undefined
  )
    return `${route.kind}:${route.subjectId}`
  return null
}

/** The route that shows `key` selected (or nothing) under `filter`. */
function routeOf(key: string | null, filter: QueueFilter): Route {
  const query = queryOf(filter)
  const at = key === null ? -1 : key.indexOf(':')
  const base: Route =
    key === null || at === -1
      ? { screen: 'queue' }
      : {
          screen: 'queue',
          kind: key.slice(0, at) as QueueItem['kind'],
          subjectId: key.slice(at + 1),
        }
  return query === '' ? base : { ...base, query }
}

/**
 * THE QUEUE SCREEN: one `listQueue` read on mount, every 60 seconds and when the window is shown
 * again (decision 10); the clock re-read by the minute; the selection and the filter in the URL; the
 * keyboard. A failed re-read leaves the last queue on screen with the refusal above it; an ended
 * session goes round the sign-in trip back to this URL.
 */
export function QueueScreen({
  api,
  me,
  route,
}: {
  api: Api
  me: Schemas['Me']
  route: Route
}) {
  const [queue, setQueue] = useState<Schemas['Queue'] | null>(null)
  const [readAt, setReadAt] = useState(() => new Date())
  const [now, setNow] = useState(() => new Date())
  const [error, setError] = useState<unknown>(undefined)
  // Every item this screen has read, by key: an item that leaves the queue while its pane is open
  // keeps its facts here (Review Focus 4), never the next item's.
  const known = useRef(new Map<string, QueueItem>())

  const selected = selectedOf(route)
  const filter = useMemo(
    () =>
      route.screen === 'queue' ? filterOf(route.query ?? '') : { text: '', kinds: [] },
    [route],
  )

  const read = useCallback(() => {
    api.listQueue().then(
      (q) => {
        for (const item of q.items) known.current.set(itemKey(item), item)
        const at = new Date()
        setQueue(q)
        setReadAt(at)
        setNow(at)
        setError(undefined)
      },
      (e: unknown) => {
        if (
          e instanceof ManifestApiError &&
          e.status === 401 &&
          e.code === 'UNAUTHENTICATED'
        )
          signIn(window.location.pathname + window.location.search)
        else setError(e)
      },
    )
  }, [api])

  useEffect(() => {
    read()
    const every = window.setInterval(read, READ_EVERY_MS)
    const tick = window.setInterval(() => setNow(new Date()), 60_000)
    const onShow = () => {
      if (document.visibilityState === 'visible') read()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      window.clearInterval(every)
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [read])

  const order = useMemo(() => {
    if (queue === null) return []
    const { us, ubc } = bandsOf(queue, filter)
    return [...us, ...ubc].map(itemKey)
  }, [queue, filter])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = queueKeyAction(event)
      if (action === null) return
      if (action === 'filter') {
        document.getElementById('queue-search')?.focus()
        event.preventDefault()
        return
      }
      if (action === 'close') {
        if (selected !== null) navigate(routeOf(null, filter))
        return
      }
      const next = moveSelection(order, selected, action)
      event.preventDefault()
      if (next === null || next === selected) return
      navigate(routeOf(next, filter), { replace: true })
      document.getElementById(rowId(next))?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [order, selected, filter])

  if (queue === null)
    return error === undefined ? (
      <p className="mfa-sec__body">Reading the queue…</p>
    ) : (
      <Refusal error={error} />
    )

  const { left } = selectionAfterRead(selected, queue)
  const item =
    selected === null
      ? null
      : (queue.items.find((i) => itemKey(i) === selected) ??
        known.current.get(selected) ??
        null)

  return (
    <QueueView
      queue={queue}
      now={now}
      readAt={readAt}
      filter={filter}
      selected={selected}
      error={error}
      onFilter={(f) => navigate(routeOf(selected, f), { replace: true })}
      onSelect={(i) => navigate(routeOf(itemKey(i), filter))}
      {...(selected === null
        ? {}
        : {
            pane: (
              <ItemPane
                key={selected}
                api={api}
                me={me}
                selected={selected}
                item={item}
                left={left}
                preview={route.screen === 'release' ? route.preview : undefined}
                now={now}
                onDecided={read}
              />
            ),
          })}
    />
  )
}
