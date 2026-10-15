import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  BAND,
  bandsOf,
  filterOf,
  headlineOf,
  holderWords,
  itemKey,
  kindWords,
  moveSelection,
  queryOf,
  queueKeyAction,
  selectionAfterRead,
} from './queue-state.js'
import type { Schemas } from '@manifest/contract'

const item = (
  kind: Schemas['QueueItem']['kind'],
  since: string,
  who: string | null,
): Schemas['QueueItem'] => ({
  kind,
  since,
  summary: 's',
  note: null,
  environment: null,
  project: { id: '00000000-0000-4000-8000-000000000001', slug: 'p', name: 'P' },
  subjectId: crypto.randomUUID(),
  requestedBy: who === null ? null : { id: who, displayName: who },
})

/**
 * REVIEW FOCUS 5 — THE HEADLINE LIES: UBC's three-week wait headlined as the team's staleness; an
 * empty queue drawn as zeros; a truncated queue counted as whole.
 */
describe('the headline', () => {
  it('is the oldest wait on US — never UBC’s, whatever oldestSince says', () => {
    const q = {
      items: [
        item('privacy-assessment', '2026-09-21T00:00:00Z', 'a'),
        item('release-approval', '2026-10-11T00:00:00Z', 'b'),
      ],
      oldestSince: '2026-09-21T00:00:00Z',
      truncated: false,
    }
    expect(headlineOf(q).oldestOnUs).toBe('2026-10-11T00:00:00Z')
  })
  it('counts distinct people on our band, nobody-recorded as one', () => {
    const q = {
      items: [
        item('release-approval', '2026-10-11T00:00:00Z', 'b'),
        item('iam-change-to-file', '2026-10-12T00:00:00Z', 'b'),
        item('iam-registration-to-submit', '2026-10-13T00:00:00Z', null),
        item('iam-registration', '2026-10-01T00:00:00Z', 'c'),
      ],
      oldestSince: '2026-10-01T00:00:00Z',
      truncated: false,
    }
    expect(headlineOf(q)).toMatchObject({
      peopleWaiting: 2,
      items: 4,
      onUs: 3,
      withUbc: 1,
    })
  })
  it('is null — "Nobody is waiting on us." — when our band is empty, even with UBC items', () => {
    expect(
      headlineOf({
        items: [item('iam-registration', '2026-10-01T00:00:00Z', 'c')],
        oldestSince: '2026-10-01T00:00:00Z',
        truncated: false,
      }).oldestOnUs,
    ).toBeNull()
  })
  it('says when the read was truncated', () => {
    expect(headlineOf({ items: [], oldestSince: null, truncated: true }).truncated).toBe(
      true,
    )
  })
  it('finds the oldest by instant, not by the order the items arrived in', () => {
    const q = {
      items: [
        item('release-approval', '2026-10-12T00:00:00Z', 'b'),
        item('iam-change-to-file', '2026-10-10T00:00:00Z', 'd'),
      ],
      oldestSince: '2026-10-10T00:00:00Z',
      truncated: false,
    }
    expect(headlineOf(q).oldestOnUs).toBe('2026-10-10T00:00:00Z')
  })
})

describe('the bands', () => {
  it('put every kind in exactly one band, oldest first, filtering never regrouping', () => {
    expect(Object.keys(BAND).sort()).toEqual([
      'iam-change-request',
      'iam-change-to-file',
      'iam-registration',
      'iam-registration-to-submit',
      'privacy-assessment',
      'privacy-assessment-to-submit',
      'release-approval',
    ])
    const q = {
      items: [
        item('release-approval', '2026-10-12T00:00:00Z', 'b'),
        item('iam-registration', '2026-09-20T00:00:00Z', 'c'),
        item('iam-change-to-file', '2026-10-10T00:00:00Z', 'd'),
        item('privacy-assessment', '2026-10-01T00:00:00Z', 'e'),
      ],
      oldestSince: '2026-09-20T00:00:00Z',
      truncated: false,
    }
    const { us, ubc } = bandsOf(q, { text: '', kinds: [] })
    expect(us.map((i) => i.kind)).toEqual(['iam-change-to-file', 'release-approval']) // oldest first
    expect(ubc.map((i) => i.kind)).toEqual(['iam-registration', 'privacy-assessment'])
    expect(bandsOf(q, { text: 'd', kinds: [] }).us.map((i) => i.kind)).toEqual([
      'iam-change-to-file',
    ]) // the requester's name
    expect(
      bandsOf(q, { text: '', kinds: ['release-approval', 'iam-registration'] }),
    ).toEqual({
      us: [q.items[0]],
      ubc: [q.items[1]], // a filter, never a regrouping
    })
  })

  it('matches the text over slug and name too, ignoring case, and never over the sentence', () => {
    const a = {
      ...item('release-approval', '2026-10-12T00:00:00Z', 'b'),
      project: {
        id: '00000000-0000-4000-8000-000000000002',
        slug: 'chem-lab-booking',
        name: 'Chem lab booking',
      },
      summary: 'reading',
    }
    const q = { items: [a], oldestSince: a.since, truncated: false }
    expect(bandsOf(q, { text: 'CHEM-LAB', kinds: [] }).us).toEqual([a])
    expect(bandsOf(q, { text: 'lab booking', kinds: [] }).us).toEqual([a])
    expect(bandsOf(q, { text: 'reading', kinds: [] }).us).toEqual([])
  })

  /** A new kind from the platform turns this red, not grey (the plan's Task 6, Step 1). */
  it('names exactly the document’s QueueItem kinds', async () => {
    const doc = JSON.parse(
      await readFile(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
    ) as {
      components: { schemas: { QueueItem: { properties: { kind: { enum: string[] } } } } }
    }
    expect(Object.keys(BAND).sort()).toEqual(
      [...doc.components.schemas.QueueItem.properties.kind.enum].sort(),
    )
  })
})

describe('the words for a kind, and for who holds it', () => {
  it('says each kind as the drawing does', () => {
    expect(kindWords('release-approval')).toBe('Release approval')
    expect(kindWords('iam-registration-to-submit')).toBe('Registration to submit')
    expect(kindWords('iam-change-to-file')).toBe('Change to file')
    expect(kindWords('privacy-assessment-to-submit')).toBe('Assessment to submit')
    expect(kindWords('iam-registration')).toBe('IAM registration')
    expect(kindWords('iam-change-request')).toBe('IAM change request')
    expect(kindWords('privacy-assessment')).toBe('Privacy assessment')
  })
  it('names who holds the wait: us, UBC IAM or the Privacy Office', () => {
    const at = '2026-10-12T00:00:00Z'
    expect(holderWords(item('iam-change-to-file', at, 'b'))).toBe('Waiting on us')
    expect(holderWords(item('iam-change-request', at, 'b'))).toBe('With UBC IAM')
    expect(holderWords(item('iam-registration', at, 'b'))).toBe('With UBC IAM')
    expect(holderWords(item('privacy-assessment', at, 'b'))).toBe(
      'With the Privacy Office',
    )
  })
})

/**
 * REVIEW FOCUS 4 — THE QUEUE MOVES UNDER AN OPEN PANE: another administrator decides the item while
 * it is open and the 60-second read drops it. The selection stays on its subject; Task 7's pane says
 * what became of it.
 */
describe('the selection after a read', () => {
  const a = item('release-approval', '2026-10-12T00:00:00Z', 'b')
  const b = item('iam-registration', '2026-10-01T00:00:00Z', 'c')
  it('is kept, and said to have left, when the read no longer lists it', () => {
    const q = { items: [b], oldestSince: b.since, truncated: false }
    expect(selectionAfterRead(itemKey(a), q)).toEqual({ key: itemKey(a), left: true })
  })
  it('is kept and has not left while the read lists it; nothing selected stays nothing', () => {
    const q = { items: [a, b], oldestSince: b.since, truncated: false }
    expect(selectionAfterRead(itemKey(a), q)).toEqual({ key: itemKey(a), left: false })
    expect(selectionAfterRead(null, q)).toEqual({ key: null, left: false })
  })
  it('keys an item by its kind and subject — the URL’s and React’s key', () => {
    expect(itemKey(a)).toBe(`release-approval:${a.subjectId}`)
  })
})

describe('the filter, in the URL', () => {
  it('writes the text and the kinds, and reads them back', () => {
    const filter = {
      text: 'chem lab',
      kinds: ['release-approval', 'iam-registration'],
    } as const
    expect(queryOf({ ...filter, kinds: [...filter.kinds] })).toBe(
      'q=chem+lab&kind=release-approval&kind=iam-registration',
    )
    expect(filterOf(queryOf({ ...filter, kinds: [...filter.kinds] }))).toEqual(filter)
  })
  it('is empty with nothing set, and drops a kind the platform has not got', () => {
    expect(queryOf({ text: '', kinds: [] })).toBe('')
    expect(filterOf('')).toEqual({ text: '', kinds: [] })
    expect(filterOf('kind=domain&kind=release-approval&kind=release-approval')).toEqual({
      text: '',
      kinds: ['release-approval'],
    })
  })
})

/** KEYBOARD-FIRST (the plan's Global Constraints): `j`/`k`, `Esc`, `/` — none while a text field has focus. */
describe('the keyboard', () => {
  const key = (
    k: string,
    init: {
      tag?: string
      editable?: boolean
      meta?: boolean
      ctrl?: boolean
      alt?: boolean
    } = {},
  ) => ({
    key: k,
    metaKey: init.meta ?? false,
    ctrlKey: init.ctrl ?? false,
    altKey: init.alt ?? false,
    target: {
      tagName: init.tag ?? 'BODY',
      isContentEditable: init.editable ?? false,
    } as unknown as EventTarget,
  })
  it('reads j, k, Escape and / on the page', () => {
    expect(queueKeyAction(key('j'))).toBe('next')
    expect(queueKeyAction(key('k'))).toBe('previous')
    expect(queueKeyAction(key('Escape'))).toBe('close')
    expect(queueKeyAction(key('/'))).toBe('filter')
    expect(queueKeyAction(key('x'))).toBeNull()
  })
  it('reads nothing while a text field has focus, or with a modifier', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT'])
      expect(queueKeyAction(key('j', { tag })), tag).toBeNull()
    expect(queueKeyAction(key('/', { editable: true }))).toBeNull()
    expect(queueKeyAction(key('k', { meta: true }))).toBeNull()
    expect(queueKeyAction(key('j', { ctrl: true }))).toBeNull()
    expect(queueKeyAction(key('j', { alt: true }))).toBeNull()
  })
  it('moves within the visible rows and stops at the ends', () => {
    const order = ['a', 'b', 'c']
    expect(moveSelection(order, 'a', 'next')).toBe('b')
    expect(moveSelection(order, 'c', 'next')).toBe('c')
    expect(moveSelection(order, 'b', 'previous')).toBe('a')
    expect(moveSelection(order, 'a', 'previous')).toBe('a')
  })
  it('starts at the first row from nothing, or from an item the filter hides', () => {
    expect(moveSelection(['a', 'b'], null, 'next')).toBe('a')
    expect(moveSelection(['a', 'b'], 'gone', 'previous')).toBe('a')
    expect(moveSelection([], 'gone', 'next')).toBe('gone')
  })
})
