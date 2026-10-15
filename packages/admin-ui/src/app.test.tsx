import { readFile } from 'node:fs/promises'
import { ManifestApiError, type ErrorCode, type Schemas } from '@manifest/contract'
import { fixtures } from '@manifest/mock'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { gateOf } from './app.js'
import { NotAdmin } from './screens/not-admin.js'

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
