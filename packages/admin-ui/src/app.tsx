import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import { createApi, type Api } from './api'
import { signIn, signOut } from './auth'
import { Refusal } from './refusal'
import {
  canonicalPath,
  linkTarget,
  navigate,
  routePath,
  useRoute,
  type LinkClick,
  type Route,
} from './router'
import { NotAdmin } from './screens/not-admin'
import { FleetScreen } from './screens/fleet'
import { HealthScreen } from './screens/health'
import { ProjectScreen } from './screens/project'
import { QueueScreen } from './screens/queue'
import { RecordsScreen } from './screens/record-pane'
import { SettingsScreen } from './screens/settings'
import { ConsoleRail, type ConsoleRailProps, type RailItem } from './system'

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
  return <Shell me={signed.me} api={api} />
}

/** Which rail item a route sits under: a release pane is the queue's, a project's page the fleet's. */
const RAIL_OF: Record<Route['screen'], RailItem['icon']> = {
  queue: 'queue',
  release: 'queue',
  fleet: 'fleet',
  project: 'fleet',
  health: 'health',
  settings: 'settings',
}

/**
 * THE RAIL'S PROPS FOR A ROUTE AND A PERSON — Queue, Fleet and Health, Settings above the person, the
 * item the route sits under marked `on`. Its links are this console's own paths, so the shell's one
 * click listener keeps them in the app.
 */
export function railOf(route: Route, me: Schemas['Me']): ConsoleRailProps {
  const on = RAIL_OF[route.screen]
  const item = (label: string, icon: RailItem['icon'], to: Route): RailItem => ({
    label,
    icon,
    href: routePath(to),
    on: icon === on,
  })
  return {
    items: [
      item('Queue', 'queue', { screen: 'queue' }),
      item('Fleet', 'fleet', { screen: 'fleet', query: '' }),
      item('Health', 'health', { screen: 'health' }),
    ],
    footItems: [item('Settings', 'settings', { screen: 'settings' })],
    user: me.displayName,
    homeHref: routePath({ screen: 'queue' }),
  }
}

/**
 * A plain left click on the rail's *Sign out*. The drawing's rail draws it as a link, and a port adds
 * no handler its reference lacks (M5), so the shell's listener reads it: signing out is a `POST`
 * (`auth.ts`), never a link the browser follows.
 */
export function isSignOut(event: LinkClick): boolean {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  const node = event.target as unknown as {
    closest?: (selector: string) => unknown
  } | null
  return typeof node?.closest === 'function' && node.closest('a.mf-rail__out') !== null
}

/**
 * THE SHELL: the drawing's rail (`<ConsoleRail>`) and the route's screen, in the drawing's columns. Its
 * ONE click listener (M5) keeps a plain click on one of this console's own links in the app — the rail
 * and the ported table render plain `<a href>`s — so an open pane and the reason typed into it survive
 * a move; and it signs out from the rail. A refused sign-out is shown, never swallowed: the person
 * would otherwise still be signed in with nothing saying so.
 */
function Shell({ me, api }: { me: Schemas['Me']; api: Api }) {
  const route = useRoute()
  const [signOutError, setSignOutError] = useState<unknown>(undefined)
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isSignOut(event.nativeEvent)) {
      event.preventDefault()
      signOut().catch((error: unknown) => setSignOutError(error))
      return
    }
    const to = linkTarget(event.nativeEvent, window.location.origin)
    if (to === null) return
    event.preventDefault()
    navigate(to)
  }
  return (
    <div className="mfa-shell" onClick={onClick}>
      <ConsoleRail {...railOf(route, me)} />
      <div className="mfa-content">
        <main className="mfa-main">
          <Refusal error={signOutError} />
          <Screen route={route} api={api} me={me} />
        </main>
      </div>
    </div>
  )
}

/**
 * The route's screen. A release pane is the queue's, its
 * item selected — the same element in the same place, so moving between the two keeps the queue
 * read and the pane's state.
 */
function Screen({ route, api, me }: { route: Route; api: Api; me: Schemas['Me'] }) {
  switch (route.screen) {
    case 'queue':
    case 'release':
      return <QueueScreen api={api} me={me} route={route} />
    case 'fleet':
      return <FleetScreen api={api} query={route.query} />
    case 'project':
      return route.section === 'records' ? (
        <RecordsScreen api={api} me={me} projectId={route.projectId} />
      ) : (
        <ProjectScreen
          key={route.projectId}
          api={api}
          me={me}
          projectId={route.projectId}
        />
      )
    case 'health':
      return <HealthScreen api={api} />
    case 'settings':
      return <SettingsScreen api={api} />
  }
}
