import { useEffect, useState } from 'react'
import type { Schemas } from '@manifest/contract'

/**
 * THE CONSOLE'S URLS ARE PATHS, ROUTED IN-APP (Decision 13; no router dependency): every queue item
 * and every project is a pasteable URL, and the three the platform's emails link to — `/queue`,
 * `/releases/<id>/approval`, `/projects/<id>/records` (`mail/team.ts`) — are among them, so P11b's
 * move under the edge is a base path and nothing else. `vite dev` and `vite preview` answer any
 * path with `index.html`, which is what makes a deep link reloadable here.
 */
export type QueueKind = Schemas['QueueItem']['kind']

export type Route =
  /** `query`: the queue's filter (`queue-state.ts`'s `queryOf`), so a filtered queue is a pasteable URL. */
  | { screen: 'queue'; kind?: QueueKind; subjectId?: string; query?: string }
  /**
   * `preview`: the stored preview the pane had taken — the step-up round trip comes back to it
   * (`auth.ts`'s `stepUpUrl`). Nothing else of a release pane's query is kept.
   */
  | { screen: 'release'; releaseId: string; preview?: string }
  | { screen: 'fleet'; query: string }
  | { screen: 'project'; projectId: string; section?: 'records' }
  | { screen: 'health' }
  | { screen: 'settings' }

/**
 * The platform's seven kinds (`launch/queue.ts`'s `QUEUE_KINDS`), as a record so `tsc` refuses this
 * list the day the contract's enum gains or loses one.
 */
const KINDS: Record<QueueKind, true> = {
  'release-approval': true,
  'iam-registration-to-submit': true,
  'iam-change-to-file': true,
  'privacy-assessment-to-submit': true,
  'iam-registration': true,
  'iam-change-request': true,
  'privacy-assessment': true,
}
const isKind = (value: string): value is QueueKind => Object.hasOwn(KINDS, value)

/** A segment as written, decoded; a malformed escape is read as no route rather than thrown. */
function segment(raw: string): string | null {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/** A path (with its query string) as a route. Anything this console does not have is the queue. */
export function parseRoute(path: string): Route {
  const at = path.indexOf('?')
  const pathname = at === -1 ? path : path.slice(0, at)
  const query = at === -1 ? '' : path.slice(at + 1)
  const parts = pathname
    .split('/')
    .filter((p) => p !== '')
    .map(segment)
  const QUEUE: Route = { screen: 'queue' }
  if (parts.some((p) => p === null)) return QUEUE
  const [first, second, third, ...rest] = parts as string[]
  if (rest.length > 0) return QUEUE
  switch (first) {
    case 'queue': {
      const filtered = query === '' ? {} : { query }
      if (second === undefined) return { screen: 'queue', ...filtered }
      return third !== undefined && isKind(second)
        ? { screen: 'queue', kind: second, subjectId: third, ...filtered }
        : QUEUE
    }
    case 'releases': {
      if (second === undefined || third !== 'approval') return QUEUE
      const preview = new URLSearchParams(query).get('preview')
      return preview === null || preview === ''
        ? { screen: 'release', releaseId: second }
        : { screen: 'release', releaseId: second, preview }
    }
    case 'projects':
      if (second === undefined) return QUEUE
      if (third === undefined) return { screen: 'project', projectId: second }
      return third === 'records'
        ? { screen: 'project', projectId: second, section: 'records' }
        : QUEUE
    case 'fleet':
      return second === undefined ? { screen: 'fleet', query } : QUEUE
    case 'health':
      return second === undefined ? { screen: 'health' } : QUEUE
    case 'settings':
      return second === undefined ? { screen: 'settings' } : QUEUE
    default:
      return QUEUE
  }
}

/** A route as the one path that names it. `routePath(parseRoute(p)) === p` for every path it has. */
export function routePath(route: Route): string {
  const e = encodeURIComponent
  switch (route.screen) {
    case 'queue': {
      const query =
        route.query === undefined || route.query === '' ? '' : `?${route.query}`
      return route.kind !== undefined && route.subjectId !== undefined
        ? `/queue/${route.kind}/${e(route.subjectId)}${query}`
        : `/queue${query}`
    }
    case 'release':
      return `/releases/${e(route.releaseId)}/approval${route.preview === undefined ? '' : `?preview=${e(route.preview)}`}`
    case 'project':
      return `/projects/${e(route.projectId)}${route.section === 'records' ? '/records' : ''}`
    case 'fleet':
      return route.query === '' ? '/fleet' : `/fleet?${route.query}`
    case 'health':
      return '/health'
    case 'settings':
      return '/settings'
  }
}

/**
 * The URL the shell shows for a path: `/` becomes `/queue` (M6), and any path this console does not
 * have becomes the screen it shows instead — applied with `history.replaceState` on load, so the
 * address bar never names a page that is not on screen.
 */
export function canonicalPath(path: string): string {
  return routePath(parseRoute(path))
}

/**
 * Moves to a route without reloading the page: an open pane's typed reason survives. `replace`
 * takes the current history entry's place — the keyboard's `j`/`k` and the filter's every keystroke,
 * so Back leaves the queue rather than stepping through each row and each letter.
 */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  if (options.replace === true) window.history.replaceState({}, '', routePath(route))
  else window.history.pushState({}, '', routePath(route))
  // Neither fires popstate, so the one listener useRoute installs is told.
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** The route the address bar names, kept current across navigate() and Back/Forward. */
export function useRoute(): Route {
  const [path, setPath] = useState(
    () => window.location.pathname + window.location.search,
  )
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.search)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return parseRoute(path)
}

/** What the shell's click listener reads of a click — a DOM `MouseEvent` is one. */
export interface LinkClick {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
  target: EventTarget | null
}

interface AnchorLike {
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
}

/**
 * THE SHELL'S ONE DELEGATED CLICK LISTENER DECIDES WITH THIS (M5): the ported rail and tables
 * render plain `<a href>`s — a port may not add a handler its reference lacks — so a click inside
 * the shell stays in the app when it is a plain left click on a link to one of this console's own
 * paths, and is the browser's otherwise: a modifier or the middle button (a new tab is the
 * operator's choice), another origin, `/auth/…` (the sign-in round trip leaves the page by design),
 * `/v1/…`, a `target` or a `download`, or a path this console does not have.
 */
export function linkTarget(event: LinkClick, origin: string): Route | null {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const node = event.target as unknown as {
    closest?: (selector: string) => AnchorLike | null
  } | null
  const anchor = typeof node?.closest === 'function' ? node.closest('a[href]') : null
  if (anchor === null) return null
  const target = anchor.getAttribute('target')
  if (
    (target !== null && target !== '' && target !== '_self') ||
    anchor.hasAttribute('download')
  )
    return null
  const href = anchor.getAttribute('href')
  if (href === null || href.startsWith('#')) return null
  let url: URL
  try {
    url = new URL(href, `${origin}/`)
  } catch {
    return null
  }
  if (url.origin !== origin) return null
  const path = url.pathname + url.search
  const route = parseRoute(path)
  return routePath(route) === path ? route : null
}
