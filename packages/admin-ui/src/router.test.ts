import { describe, expect, it } from 'vitest'
import {
  canonicalPath,
  linkTarget,
  parseRoute,
  routePath,
  type LinkClick,
} from './router.js'

const RELEASE = '6f1c2a40-3b2d-4c5e-9f10-1a2b3c4d5e6f'
const PROJECT = '0b9e8d7c-6a5b-4c3d-8e2f-1a0b9c8d7e6f'
const RECORD = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d'

describe('the console’s URLs (Decision 13)', () => {
  const PATHS: [string, ReturnType<typeof parseRoute>][] = [
    ['/queue', { screen: 'queue' }],
    [
      `/queue/release-approval/${RELEASE}`,
      { screen: 'queue', kind: 'release-approval', subjectId: RELEASE },
    ],
    [
      `/queue/iam-change-request/${RECORD}`,
      { screen: 'queue', kind: 'iam-change-request', subjectId: RECORD },
    ],
    [`/releases/${RELEASE}/approval`, { screen: 'release', releaseId: RELEASE }],
    // The step-up round trip comes back to the same preview, named in the URL (Task 7).
    [
      `/releases/${RELEASE}/approval?preview=${RECORD}`,
      { screen: 'release', releaseId: RELEASE, preview: RECORD },
    ],
    // The queue's filter is in the URL, so a filtered queue is pasteable (Task 6).
    [
      '/queue?q=chem&kind=release-approval',
      { screen: 'queue', query: 'q=chem&kind=release-approval' },
    ],
    [
      `/queue/iam-registration/${RECORD}?q=chem`,
      { screen: 'queue', kind: 'iam-registration', subjectId: RECORD, query: 'q=chem' },
    ],
    [`/projects/${PROJECT}`, { screen: 'project', projectId: PROJECT }],
    [
      `/projects/${PROJECT}/records`,
      { screen: 'project', projectId: PROJECT, section: 'records' },
    ],
    ['/fleet', { screen: 'fleet', query: '' }],
    [
      '/fleet?state=active&env=production',
      { screen: 'fleet', query: 'state=active&env=production' },
    ],
    ['/health', { screen: 'health' }],
    ['/settings', { screen: 'settings' }],
  ]

  it.each(PATHS)('parses %s', (path, route) => {
    expect(parseRoute(path)).toStrictEqual(route)
  })

  it.each(PATHS)('writes %s back exactly', (path) => {
    expect(routePath(parseRoute(path))).toBe(path)
  })

  it('reads an unknown path, or a queue item of no kind the platform has, as the queue', () => {
    for (const path of [
      '/nope',
      '/queue/not-a-kind/x',
      '/queue/release-approval',
      `/releases/${RELEASE}`,
      `/projects/${PROJECT}/code`,
    ])
      expect(parseRoute(path), path).toStrictEqual({ screen: 'queue' })
  })

  it('reads / as the queue, and the shell replaces it with /queue (M6)', () => {
    expect(parseRoute('/')).toStrictEqual({ screen: 'queue' })
    expect(canonicalPath('/')).toBe('/queue')
    expect(canonicalPath('/fleet?state=archived')).toBe('/fleet?state=archived')
  })

  it('keeps a release pane’s preview and nothing else of its query, and an empty query is no query', () => {
    expect(canonicalPath(`/releases/${RELEASE}/approval?preview=${RECORD}&x=1`)).toBe(
      `/releases/${RELEASE}/approval?preview=${RECORD}`,
    )
    expect(canonicalPath(`/releases/${RELEASE}/approval?x=1`)).toBe(
      `/releases/${RELEASE}/approval`,
    )
    expect(canonicalPath('/queue?')).toBe('/queue')
    expect(canonicalPath('/nope?q=chem')).toBe('/queue')
  })
})

/**
 * THE SHELL'S ONE CLICK LISTENER (M5): the ported rail and tables render plain `<a href>`s, and a
 * port may not add a handler its reference lacks — so the shell decides, for any click inside it,
 * whether to keep it in the app (an open pane and the reason typed into it survive) or leave it to
 * the browser. Node has no DOM, so a click is the few fields the decision reads.
 */
describe('linkTarget — which clicks stay in the app', () => {
  const ORIGIN = 'http://127.0.0.1:7101'

  function click(
    href: string | null,
    init: Partial<Omit<LinkClick, 'target'>> & {
      target?: string
      download?: boolean
    } = {},
  ): LinkClick {
    const { target, download, ...fields } = init
    const anchor = {
      getAttribute: (name: string) =>
        name === 'href' ? href : name === 'target' ? (target ?? null) : null,
      hasAttribute: (name: string) => name === 'download' && download === true,
    }
    // `closest('a[href]')` answers the anchor a click landed inside, or null off any link.
    const element = { closest: () => (href === null ? null : anchor) }
    return {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: element as unknown as EventTarget,
      ...fields,
    }
  }

  it('keeps a plain left click on one of its own links', () => {
    expect(linkTarget(click('/fleet'), ORIGIN)).toStrictEqual({
      screen: 'fleet',
      query: '',
    })
    expect(linkTarget(click(`/queue/release-approval/${RELEASE}`), ORIGIN)).toStrictEqual(
      {
        screen: 'queue',
        kind: 'release-approval',
        subjectId: RELEASE,
      },
    )
    expect(linkTarget(click(`${ORIGIN}/health`), ORIGIN)).toStrictEqual({
      screen: 'health',
    })
  })

  it('leaves every other click to the browser', () => {
    for (const [why, event] of [
      ['meta', click('/fleet', { metaKey: true })],
      ['ctrl', click('/fleet', { ctrlKey: true })],
      ['shift', click('/fleet', { shiftKey: true })],
      ['alt', click('/fleet', { altKey: true })],
      ['middle button', click('/fleet', { button: 1 })],
      ['already handled', click('/fleet', { defaultPrevented: true })],
      ['another origin', click('https://example.com/fleet')],
      ['the sign-in round trip', click('/auth/login?returnTo=%2Fqueue')],
      ['the API', click('/v1/queue')],
      ['a new tab', click('/fleet', { target: '_blank' })],
      ['a download', click('/fleet', { download: true })],
      ['a path this console does not have', click('/docs')],
      ['not a link', click(null)],
    ] as const)
      expect(linkTarget(event, ORIGIN), why).toBeNull()
  })
})
