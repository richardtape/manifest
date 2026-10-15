import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import { createApi } from './api'
import { signIn } from './auth'
import { Refusal } from './refusal'
import {
  canonicalPath,
  linkTarget,
  navigate,
  routePath,
  useRoute,
  type Route,
} from './router'
import { NotAdmin } from './screens/not-admin'

/**
 * THE ADMINISTRATOR'S GATE, decided from `getMe`'s answer or its refusal: an administrator is let
 * in; a member is told why not (`<NotAdmin>`); an ended or absent session (`401 UNAUTHENTICATED`)
 * goes round the sign-in trip back to the same URL; anything else is shown as the refusal it is.
 * Never a blank page, never a screen of `403`s.
 */
export type Gate = 'admin' | 'not-admin' | 'sign-in' | 'refused'

export function gateOf(answer: unknown): Gate {
  if (answer instanceof ManifestApiError)
    return answer.status === 401 && answer.code === 'UNAUTHENTICATED'
      ? 'sign-in'
      : 'refused'
  if (answer instanceof Error || answer === null || typeof answer !== 'object')
    return 'refused'
  return (answer as Schemas['Me']).role === 'admin' ? 'admin' : 'not-admin'
}

type Signed = { me: Schemas['Me'] } | { error: unknown } | null

export function App() {
  const api = useMemo(() => createApi({ origin: window.location.origin }), [])
  const [signed, setSigned] = useState<Signed>(null)

  useEffect(() => {
    // `/` (and any path this console does not have) is shown as the screen it opens on (M6).
    const here = window.location.pathname + window.location.search
    const canonical = canonicalPath(here)
    if (canonical !== here) window.history.replaceState({}, '', canonical)
    let live = true
    api.getMe().then(
      (me) => live && setSigned({ me }),
      (error: unknown) => live && setSigned({ error }),
    )
    return () => {
      live = false
    }
  }, [api])

  const gate = signed === null ? null : gateOf('me' in signed ? signed.me : signed.error)
  useEffect(() => {
    if (gate === 'sign-in') signIn(window.location.pathname + window.location.search)
  }, [gate])

  if (signed === null || gate === 'sign-in')
    return <p className="signing-in">Signing you in…</p>
  if ('error' in signed) return <Refusal error={signed.error} />
  if (gate === 'not-admin') return <NotAdmin me={signed.me} />
  return <Shell me={signed.me} />
}

const RAIL: { label: string; route: Route }[] = [
  { label: 'Queue', route: { screen: 'queue' } },
  { label: 'Fleet', route: { screen: 'fleet', query: '' } },
  { label: 'Health', route: { screen: 'health' } },
]
const RAIL_FOOT: { label: string; route: Route }[] = [
  { label: 'Settings', route: { screen: 'settings' } },
]

/**
 * THE SHELL: the rail and the route's screen. Its ONE click listener (M5) keeps a plain click on one
 * of this console's own links in the app — the rail and, from Task 5, the ported table render plain
 * `<a href>`s — so an open pane and the reason typed into it survive a move. The rail is plain
 * markup until Task 5 ports `ConsoleRail`.
 */
function Shell({ me }: { me: Schemas['Me'] }) {
  const route = useRoute()
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const to = linkTarget(event.nativeEvent, window.location.origin)
    if (to === null) return
    event.preventDefault()
    navigate(to)
  }
  const link = ({ label, route: to }: { label: string; route: Route }) => (
    <li key={label}>
      <a
        href={routePath(to)}
        aria-current={to.screen === route.screen ? 'page' : undefined}
      >
        {label}
      </a>
    </li>
  )
  return (
    <div className="shell" onClick={onClick}>
      <nav className="rail" aria-label="Manifest operations">
        <p className="rail__name">Manifest operations</p>
        <ul>{RAIL.map(link)}</ul>
        <ul className="rail__foot">{RAIL_FOOT.map(link)}</ul>
        <p className="rail__who">{me.displayName}</p>
      </nav>
      <main className="screen">
        <Screen route={route} />
      </main>
    </div>
  )
}

/** Each screen's placeholder until its task builds it. */
function Screen({ route }: { route: Route }) {
  switch (route.screen) {
    case 'queue':
      return <h1>Queue</h1>
    case 'release':
      return <h1>Release approval</h1>
    case 'fleet':
      return <h1>Fleet</h1>
    case 'project':
      return <h1>Project</h1>
    case 'health':
      return <h1>Health</h1>
    case 'settings':
      return <h1>Settings</h1>
  }
}
