import { useState } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import { createApi } from './api'
import { signIn, signOut } from './auth'
import { href, useRoute, type Route } from './router'
import { Blueprints } from './screens/blueprints'
import { Projects } from './screens/projects'
import { Field, Panel, Pill, Refusal, useAsync } from './ui'

/**
 * §22's reference console. QUALITY BAR, from §22: plain but presentable — no design system,
 * no branding, system fonts, minimal CSS. Coherent enough to walk a pilot faculty member
 * through, obviously not polished enough that anyone mistakes its choices for product
 * decisions. The real experience is the separate front-end project's job.
 *
 * ONE ORIGIN: the API is same-origin with this page (§21), so the client is built with
 * `window.location.origin` and the browser supplies the cookie and §20's `Origin` itself.
 * `createManifestClient`'s browser branch sets no headers at all, deliberately — which is
 * why this page must be reached at `console.manifest.internal` and never at
 * `127.0.0.1:7104`, where a mutation would be refused `403 CSRF_ORIGIN_REFUSED`.
 */
const api = createApi({ origin: window.location.origin })

export function App() {
  const me = useAsync(() => api.getMe(), [])
  const route = useRoute()
  // A FAILED SIGN-OUT MUST BE VISIBLE. `signOut` throws unless the route answered 204, and
  // without this the rejection would be swallowed by `void signOut()` and the person would
  // stay signed in with nothing saying so.
  const [signOutError, setSignOutError] = useState<unknown>(undefined)

  if (me.loading) return <main className="shell">…</main>

  // 401 IS NOT AN ERROR TO DISPLAY; IT IS THE SIGN-IN SCREEN. Keyed on the STATUS rather
  // than on the code: `GET /v1/me` with no credential answers `401 UNAUTHENTICATED`, and
  // every other 401 the API can give a browser means the same thing to a person — sign in.
  // `instanceof` rather than a cast, so a network failure (which has no `status` at all)
  // reaches <Refusal> instead of silently rendering the sign-in screen.
  if (me.error instanceof ManifestApiError && me.error.status === 401) {
    return (
      <main className="shell signin">
        <h1>Manifest</h1>
        <p>Sign in with your CWL to continue.</p>
        <button type="button" onClick={() => signIn()}>
          Sign in with CWL
        </button>
      </main>
    )
  }
  if (me.error !== undefined)
    return (
      <main className="shell">
        <Refusal error={me.error} />
      </main>
    )

  const person = me.value!
  return (
    <>
      <header className="shell-header">
        <a className="brand" {...href('/')}>
          Manifest
        </a>
        <nav>
          <a {...href('/')}>Projects</a>
          <a {...href('/blueprints')}>Blueprints</a>
          {/*
            AN AFFORDANCE, NEVER A CONTROL. `GET /v1/fleet` answers a non-administrator
            `403`, not `404` — there is no tenant's resource to hide (§26, P5a Task 16) —
            so hiding the link saves a person a refusal and enforces nothing. A reader
            would otherwise assume the console is doing authorization, and it is not:
            §13's authorization is `projects/authz.ts`, in the control plane, and this
            console could be replaced by `curl` without weakening anything.
          */}
          {person.role === 'admin' && <a {...href('/fleet')}>Fleet</a>}
        </nav>
        <span className="who">
          {person.displayName} <code>{person.puid}</code>
          {person.role === 'admin' && ' · administrator'}
        </span>
        <button
          type="button"
          onClick={() => {
            setSignOutError(undefined)
            signOut().catch((error: unknown) => setSignOutError(error))
          }}
        >
          Sign out
        </button>
      </header>
      <main className="shell">
        <Refusal error={signOutError} />
        <You person={person} />
        <Screen route={route} />
      </main>
    </>
  )
}

/**
 * §22 STEP 1's ACTUAL DELIVERABLE: a person signs in with CWL and sees who the platform
 * thinks they are. Everything here comes from `GET /v1/me` and nothing is inferred.
 *
 * It is also what gives `<Panel>`, `<Field>` and `<Pill>` a CALLER from this task's first
 * commit rather than from sitting 4 — a module with no call site is not built, and this
 * project has shipped that defect four times (ORIENTATION §9; this plan's Global
 * Constraints say every task names its caller). `<Ago>` is the one bit of ui.tsx this task
 * leaves uncalled: the shell has no instant to render, and its first caller is Task 6's
 * event feed. That is stated rather than hidden.
 */
function You({ person }: { person: Schemas['Me'] }) {
  return (
    <Panel title="You">
      <Field label="Name">{person.displayName}</Field>
      <Field label="CWL PUID">
        <code>{person.puid}</code>
      </Field>
      <Field label="Email">{person.email}</Field>
      <Field label="Platform role">
        {/* `admin` and `member` are the only two §20 has. The role is carried BY THE
            SESSION, so a grant made out of band reaches a person only when they sign in
            again (P5a Task 16) — which is why this reads from /v1/me and not from
            anything the console remembers. */}
        <Pill tone={person.role === 'admin' ? 'good' : 'plain'}>{person.role}</Pill>
      </Field>
    </Panel>
  )
}

/**
 * Each arm reads through the ONE `api` above (Decision 6). The arms a later task builds
 * keep an honest placeholder rather than a blank page — a person who deep-links to
 * `/projects/<id>` before Task 6 should be told which task builds it, not shown nothing.
 */
function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'projects':
      return <Projects api={api} />
    case 'blueprints':
      return <Blueprints api={api} />
    default:
      return (
        <p>
          The <code>{route.name}</code> screen is built by a later task of P5c.
        </p>
      )
  }
}
