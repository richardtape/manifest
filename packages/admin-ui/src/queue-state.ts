import type { Schemas } from '@manifest/contract'

/**
 * THE QUEUE, AS PURE FUNCTIONS (§26; the design's §3): one `listQueue` read, split by who holds the
 * wait, headlined from our own band, filtered and never regrouped. The screen draws what these
 * answer, and each is tested in Node.
 */
export type QueueItem = Schemas['QueueItem']
export type QueueKind = QueueItem['kind']
export type Band = 'us' | 'ubc'

/**
 * WHO HOLDS EACH KIND'S WAIT. The first four are an administrator's to decide; the last three are
 * with UBC — ours to chase and record, never our staleness. A record so typed that `tsc` refuses it
 * the day the contract's kinds change, and `queue-state.test.ts` holds it to the document's enum.
 */
export const BAND: Record<QueueKind, Band> = {
  'release-approval': 'us',
  'iam-registration-to-submit': 'us',
  'iam-change-to-file': 'us',
  'privacy-assessment-to-submit': 'us',
  'iam-registration': 'ubc',
  'iam-change-request': 'ubc',
  'privacy-assessment': 'ubc',
}

/** Each kind as the drawing says it (`design/admin/data.js`'s `kindLabel`s). */
const KIND_WORDS: Record<QueueKind, string> = {
  'release-approval': 'Release approval',
  'iam-registration-to-submit': 'Registration to submit',
  'iam-change-to-file': 'Change to file',
  'privacy-assessment-to-submit': 'Assessment to submit',
  'iam-registration': 'IAM registration',
  'iam-change-request': 'IAM change request',
  'privacy-assessment': 'Privacy assessment',
}

export function kindWords(kind: QueueKind): string {
  return KIND_WORDS[kind]
}

/** Who holds the wait, in the row's and the pane's words. */
export function holderWords(item: QueueItem): string {
  if (BAND[item.kind] === 'us') return 'Waiting on us'
  return item.kind === 'privacy-assessment' ? 'With the Privacy Office' : 'With UBC IAM'
}

/** An item's key — its kind and subject — which the URL and React both use. */
export function itemKey(item: QueueItem): string {
  return `${item.kind}:${item.subjectId}`
}

const at = (iso: string) => new Date(iso).getTime()
const oldestFirst = (a: QueueItem, b: QueueItem) => at(a.since) - at(b.since)

export interface Headline {
  /** The oldest `since` on OUR band; null when nobody is waiting on us. */
  oldestOnUs: string | null
  /** Distinct people on our band — an item with nobody recorded counts as one, "someone". */
  peopleWaiting: number
  items: number
  onUs: number
  withUbc: number
  /** The read stopped at 200: the numbers are of the oldest 200. */
  truncated: boolean
}

/**
 * THE HEADLINE, FROM OUR BAND ALONE (the design's A15): `Queue.oldestSince` is the oldest of every
 * item, UBC's waits included, so a privacy assessment three weeks with the Privacy Office would
 * headline as our staleness. It is never read here.
 */
export function headlineOf(queue: Schemas['Queue']): Headline {
  const us = queue.items.filter((i) => BAND[i.kind] === 'us').sort(oldestFirst)
  const people = new Set(us.map((i) => i.requestedBy?.id ?? null))
  return {
    oldestOnUs: us[0]?.since ?? null,
    peopleWaiting: people.size,
    items: queue.items.length,
    onUs: us.length,
    withUbc: queue.items.length - us.length,
    truncated: queue.truncated,
  }
}

export interface QueueFilter {
  /** Matched, ignoring case, against the slug, the name and who asked. */
  text: string
  /** None: every kind. */
  kinds: QueueKind[]
}

function matches(item: QueueItem, filter: QueueFilter): boolean {
  if (filter.kinds.length > 0 && !filter.kinds.includes(item.kind)) return false
  const text = filter.text.trim().toLowerCase()
  if (text === '') return true
  return [item.project.slug, item.project.name, item.requestedBy?.displayName ?? '']
    .join('\n')
    .toLowerCase()
    .includes(text)
}

/** The two bands, each oldest first, each filtered — a filter, never a regrouping. */
export function bandsOf(
  queue: Schemas['Queue'],
  filter: QueueFilter,
): { us: QueueItem[]; ubc: QueueItem[] } {
  const items = queue.items.filter((i) => matches(i, filter)).sort(oldestFirst)
  return {
    us: items.filter((i) => BAND[i.kind] === 'us'),
    ubc: items.filter((i) => BAND[i.kind] === 'ubc'),
  }
}

/**
 * THE SELECTION SURVIVES A READ (Review Focus 4): an item another administrator decided leaves the
 * next read, and the pane open on it must not vanish or show the next item's facts. So the key is
 * kept, and `left` says the read no longer lists it — the pane says what became of it.
 */
export function selectionAfterRead(
  selected: string | null,
  queue: Schemas['Queue'],
): { key: string | null; left: boolean } {
  if (selected === null) return { key: null, left: false }
  return { key: selected, left: !queue.items.some((i) => itemKey(i) === selected) }
}

const isKind = (value: string): value is QueueKind => Object.hasOwn(BAND, value)

/** The filter as the URL's query: `q=<text>&kind=<kind>…`. Empty when nothing is set. */
export function queryOf(filter: QueueFilter): string {
  const params = new URLSearchParams()
  if (filter.text !== '') params.set('q', filter.text)
  for (const kind of filter.kinds) params.append('kind', kind)
  return params.toString()
}

/** The URL's query as a filter: a kind the platform has not got is dropped, a repeat read once. */
export function filterOf(query: string): QueueFilter {
  const params = new URLSearchParams(query)
  const kinds: QueueKind[] = []
  for (const kind of params.getAll('kind'))
    if (isKind(kind) && !kinds.includes(kind)) kinds.push(kind)
  return { text: params.get('q') ?? '', kinds }
}

/**
 * The filter's facets: the kinds grouped as the drawing groups them — what an administrator decides
 * a release on, the Manifest team's step, and what is with UBC.
 */
export const FACETS: readonly { label: string; kinds: readonly QueueKind[] }[] = [
  { label: 'Release approvals', kinds: ['release-approval'] },
  {
    label: 'The team’s step',
    kinds: [
      'iam-registration-to-submit',
      'iam-change-to-file',
      'privacy-assessment-to-submit',
    ],
  },
  {
    label: 'With UBC',
    kinds: ['iam-registration', 'iam-change-request', 'privacy-assessment'],
  },
]

/** A facet is on when every kind it stands for is in the filter. */
export function facetOn(filter: QueueFilter, kinds: readonly QueueKind[]): boolean {
  return kinds.every((k) => filter.kinds.includes(k))
}

/** The filter with a facet's kinds added, or taken out when it was on. */
export function toggleFacet(
  filter: QueueFilter,
  kinds: readonly QueueKind[],
): QueueFilter {
  return facetOn(filter, kinds)
    ? { ...filter, kinds: filter.kinds.filter((k) => !kinds.includes(k)) }
    : {
        ...filter,
        kinds: [...filter.kinds, ...kinds.filter((k) => !filter.kinds.includes(k))],
      }
}

/** What the queue does with a key press. */
export type QueueKeyAction = 'next' | 'previous' | 'close' | 'filter'

/** What the screen's keydown listener reads of a press — a DOM `KeyboardEvent` is one. */
export interface QueueKeyPress {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  target: EventTarget | null
}

/**
 * `j` and `k` move, `Esc` closes the pane, `/` goes to the filter — and NONE of them while a text
 * field has focus (a reason being typed must never move the queue) or with a modifier held (the
 * browser's and the system's shortcuts are theirs). `Enter` opens the row the keyboard is on:
 * every row is a button, and `Enter` presses it.
 */
export function queueKeyAction(press: QueueKeyPress): QueueKeyAction | null {
  if (press.metaKey || press.ctrlKey || press.altKey) return null
  const node = press.target as unknown as {
    tagName?: string
    isContentEditable?: boolean
  } | null
  const tag = node?.tagName ?? ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null
  if (node?.isContentEditable === true) return null
  switch (press.key) {
    case 'j':
      return 'next'
    case 'k':
      return 'previous'
    case 'Escape':
      return 'close'
    case '/':
      return 'filter'
    default:
      return null
  }
}

/**
 * Where `j`/`k` take the selection among the VISIBLE rows (`order`), stopping at the ends. From
 * nothing, or from an item the filter hides or the read dropped, either key starts at the first.
 */
export function moveSelection(
  order: readonly string[],
  selected: string | null,
  direction: 'next' | 'previous',
): string | null {
  if (order.length === 0) return selected
  const i = selected === null ? -1 : order.indexOf(selected)
  if (i === -1) return order[0]!
  return direction === 'next'
    ? order[Math.min(order.length - 1, i + 1)]!
    : order[Math.max(0, i - 1)]!
}
