import { readFile } from 'node:fs/promises'
import { ManifestApiError, type ErrorCode, type Schemas } from '@manifest/contract'
import { fixtures } from '@manifest/mock'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { gateOf, isSignOut, railOf } from './app.js'
import type { LinkClick, Route } from './router.js'
import { NotAdmin } from './screens/not-admin.js'
import { ConsoleRail } from './system/index.js'

/**
 * A NON-ADMINISTRATOR, OR AN ENDED SESSION, MEETS A SENTENCE OR A SIGN-IN ROUND TRIP BACK TO THE
 * SAME URL — never a blank page or a screen of `403`s (the plan's Global Constraints; pinned here).
 */
const refusedWith = (status: number, code: ErrorCode) =>
  new ManifestApiError(
    status,
    { error: { code, message: 'refused', requestId: 'req-1' } },
    'getMe',
  )

describe('the administrator’s gate', () => {
  const member: Schemas['Me'] = { ...fixtures.ME, role: 'member' }

  it('lets an administrator in, tells a member why not, and signs an ended session in again', () => {
    expect(gateOf(fixtures.OPERATOR_ME)).toBe('admin')
    expect(gateOf(member)).toBe('not-admin')
    expect(gateOf(refusedWith(401, 'UNAUTHENTICATED'))).toBe('sign-in')
  })

  it('shows any other refusal as what it is, not as a sign-in or a blank page', () => {
    expect(gateOf(refusedWith(500, 'INTERNAL'))).toBe('refused')
    expect(gateOf(refusedWith(403, 'FORBIDDEN'))).toBe('refused')
    expect(gateOf(new Error('network down'))).toBe('refused')
  })

  it('says to a member, by name, whose console this is and how the role is had', () => {
    const html = renderToStaticMarkup(<NotAdmin me={member} />)
    expect(html).toContain('This console is for platform administrators.')
    expect(html).toContain(member.displayName)
    expect(html).toContain('An administrator’s role is granted on the host')
  })
})

describe('index.html — what make doctor asks 7101 (Decision 16)', () => {
  it('carries the root element and this console’s own title, which is not the reference console’s', async () => {
    const page = await readFile(new URL('../index.html', import.meta.url), 'utf8')
    expect(page).toContain('id="root"')
    expect(page).toContain('<title>Manifest operations</title>')
    expect(page).not.toContain('<title>Manifest</title>')
  })
})

describe('the shell’s rail — the drawing’s ConsoleRail (Task 5)', () => {
  const me = fixtures.OPERATOR_ME
  const onOf = (route: Route) => {
    const rail = railOf(route, me)
    return [...rail.items, ...rail.footItems].filter((i) => i.on).map((i) => i.label)
  }

  it('marks the one item each screen sits under — a release pane the queue’s, a project the fleet’s', () => {
    expect(onOf({ screen: 'queue' })).toEqual(['Queue'])
    expect(onOf({ screen: 'queue', kind: 'release-approval', subjectId: 'r1' })).toEqual([
      'Queue',
    ])
    expect(onOf({ screen: 'release', releaseId: 'r1' })).toEqual(['Queue'])
    expect(onOf({ screen: 'fleet', query: 'stage=production' })).toEqual(['Fleet'])
    expect(onOf({ screen: 'project', projectId: 'p1', section: 'records' })).toEqual([
      'Fleet',
    ])
    expect(onOf({ screen: 'health' })).toEqual(['Health'])
    expect(onOf({ screen: 'settings' })).toEqual(['Settings'])
  })

  it('links every item to this console’s own path, and names the person and their platform role', () => {
    const html = renderToStaticMarkup(
      <ConsoleRail {...railOf({ screen: 'fleet', query: '' }, me)} />,
    )
    for (const path of ['/queue', '/fleet', '/health', '/settings'])
      expect(html).toContain(`href="${path}"`)
    expect(html).toContain('<span class="mf-rail__over">Operations</span>')
    expect(html).toContain(`<span class="mf-rail__who">${me.displayName}</span>`)
    expect(html).toContain('<span class="mfa-rail__role">Platform administrator</span>')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toContain(
      'class="mf-rail__item mf-rail__item--on" aria-current="page"><svg',
    )
    // What isSignOut reads: the rail's own sign-out link, as the drawing draws it.
    expect(html).toContain('<a class="mf-rail__out" href="#">Sign out</a>')
  })

  it('signs out on a plain left click on the rail’s Sign out, and on nothing else', () => {
    const on = (selector: string) => ({
      closest: (s: string) => (s === selector ? { tagName: 'A' } : null),
    })
    const click = (target: unknown, over: Partial<LinkClick> = {}): LinkClick => ({
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
      target: target as EventTarget,
      ...over,
    })
    const signOutLink = on('a.mf-rail__out')
    expect(isSignOut(click(signOutLink))).toBe(true)
    expect(isSignOut(click(on('a[href]')))).toBe(false)
    expect(isSignOut(click(null))).toBe(false)
    expect(isSignOut(click(signOutLink, { button: 1 }))).toBe(false)
    expect(isSignOut(click(signOutLink, { metaKey: true }))).toBe(false)
    expect(isSignOut(click(signOutLink, { defaultPrevented: true }))).toBe(false)
  })
})
