import { useEffect, useState, type MouseEvent } from 'react'

/**
 * Real paths over pushState, not a hash (Decision 3). `GET /auth/login?returnTo=<path>`
 * accepts a same-origin path and the callback lands back on it (`safeReturnTo`), so a deep
 * link survives a sign-in — which a hash, never sent to the server, could not do.
 *
 * Task 1's M6 MEASURED both halves of that on the platform, rather than reading the regex:
 * `returnTo=/projects/deep/path` round-trips through the `manifest_login` cookie intact and
 * `returnTo=//evil.example.com/x` falls back to `/`. So the fallback this task was told it
 * might need — carrying the route in a query string on `/` — is not needed and is not here.
 *
 * `vite dev` and `vite preview` both serve index.html for an unknown path (Vite's default
 * `appType: 'spa'`), which is what makes /projects/<id> reloadable. THE EDGE DOES NO SPA
 * FALLBACK (M1) — whatever serves the console has to, and both of those do.
 */
export type Route =
  | { name: 'projects' }
  | { name: 'blueprints' }
  | { name: 'fleet' }
  | { name: 'project'; projectId: string; tab: 'overview' | 'queue' | 'tokens' }
  | { name: 'unknown'; path: string }

export function parse(path: string): Route {
  const parts = path.split('/').filter((p) => p !== '')
  if (parts.length === 0) return { name: 'projects' }
  if (parts[0] === 'blueprints' && parts.length === 1) return { name: 'blueprints' }
  if (parts[0] === 'fleet' && parts.length === 1) return { name: 'fleet' }
  if (parts[0] === 'projects' && parts[1] !== undefined) {
    const tab = parts[2]
    if (tab === undefined || tab === 'queue' || tab === 'tokens')
      return { name: 'project', projectId: parts[1], tab: tab ?? 'overview' }
  }
  return { name: 'unknown', path }
}

export function navigate(path: string): void {
  window.history.pushState({}, '', path)
  // pushState does not fire popstate, so the one listener useRoute installs needs telling.
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return parse(path)
}

/**
 * An in-app link: a real anchor, so middle-click and copy-link work, with the navigation
 * intercepted for the plain left click.
 */
export function href(path: string): {
  href: string
  onClick: (e: MouseEvent) => void
} {
  return {
    href: path,
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(path)
    },
  }
}
