/**
 * THE HTML REFERENCE (the authoring API plan's Task 11, Decision 17): Scalar's standalone bundle,
 * mounted over `GET /v1/openapi.json` — which the browser fetches with its own session, on the
 * console's origin. **Outside `src/` and importing nothing**: the bundle arrives as the one
 * script `reference.html` loads, so D22's rule for the console is unchanged, and this page's own
 * rule (`src/boundary.test.ts`) is that it imports nothing at all.
 *
 * **Configured exactly as the renderer was measured offline** (`spikes/authoring-baseline`,
 * `[M9]`): no web fonts, no telemetry, no request client, no MCP, no developer tools, and no
 * *Ask AI* — `agent` is not in Scalar's published configuration type, and without it the bundle
 * turns its cloud chat on for a local address. Any request to a host but this one is a defect.
 */
interface ScalarGlobal {
  createApiReference(selector: string, configuration: Record<string, unknown>): unknown
}

export const CONFIGURATION = {
  url: '/v1/openapi.json',
  withDefaultFonts: false,
  telemetry: false,
  hideClientButton: true,
  hideTestRequestButton: true,
  mcp: { disabled: true },
  showDeveloperTools: 'never',
  agent: { disabled: true },
} as const

async function mount(app: Element): Promise<void> {
  // The document needs a credential like every `/v1` route. Without a session, say so — and
  // where to get one — rather than let the renderer show a failed fetch.
  const me = await fetch('/v1/me', { credentials: 'same-origin' })
  if (me.status === 401) {
    app.innerHTML =
      '<p style="font-family: system-ui, sans-serif; margin: 2rem">The API reference needs you signed in. <a href="/auth/login?returnTo=/reference.html">Sign in with CWL</a>.</p>'
    return
  }
  const scalar = (globalThis as unknown as { Scalar?: ScalarGlobal }).Scalar
  if (scalar === undefined) {
    app.textContent = 'The renderer did not load.'
    return
  }
  scalar.createApiReference('#app', { ...CONFIGURATION })
}

const app = document.querySelector('#app')!
mount(app).catch((error: unknown) => {
  app.textContent = 'The API reference could not be shown.'
  console.error(error)
})
