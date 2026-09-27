import type { Api } from '../api'
import { href } from '../router'
import { Field, Panel, Refusal, useAsync } from '../ui'

/**
 * THE API'S DOCUMENTATION, AS THE PLATFORM SERVES IT (the authoring API plan's Task 11, Decision
 * 18): the index from `GET /v1/docs`, each page's Markdown from `GET /v1/docs/{slug}`, and the
 * contract's version from `GET /v1/openapi.json`. **Plain text, deliberately** — §22's reference
 * console proves the API, and a Markdown renderer here would be a dependency `src/`'s boundary
 * exists to refuse. The rendered reference is its own page, outside `src/`.
 *
 * Not a project's screen: documentation is no project's data, and any credential reads it.
 */
export function Docs({ api }: { api: Api }) {
  const index = useAsync(() => api.listDocs(), [])
  const document = useAsync(() => api.getOpenApiDocument(), [])
  const info = document.value?.info as { version?: string } | undefined
  return (
    <Panel title="Documentation">
      <Refusal error={index.error} />
      <Refusal error={document.error} />
      <Field label="API version">
        {info?.version === undefined ? '…' : <code>{info.version}</code>}
      </Field>
      <Field label="OpenAPI document">
        <code>GET /v1/openapi.json</code> ·{' '}
        {/* A second page, not a route of this one: the renderer lives outside `src/`. */}
        <a href="/reference.html">the API reference, rendered</a>
      </Field>
      <ul className="doc-index">
        {(index.value?.pages ?? []).map((page) => (
          <li key={page.slug}>
            <a {...href(`/docs/${page.slug}`)}>{page.title}</a>
            <p>{page.summary}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function Doc({ api, slug }: { api: Api; slug: string }) {
  const page = useAsync(() => api.getDoc(slug), [slug])
  return (
    <Panel title={page.value?.title ?? slug}>
      <p>
        <a {...href('/docs')}>← Documentation</a> · <code>GET /v1/docs/{slug}</code>
      </p>
      <Refusal error={page.error} />
      {page.value !== undefined && <pre className="doc">{page.value.markdown}</pre>}
    </Panel>
  )
}
