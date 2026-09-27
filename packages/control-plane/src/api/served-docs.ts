import { loadApiDocs, type ApiDocs } from '../docs/index.js'
import { openApiDocument } from './contract/document.js'
import { ROUTE_DEFINITIONS } from './routes/index.js'

/**
 * WHAT `GET /v1/docs` AND `GET /v1/openapi.json` ANSWER, BUILT ONCE AT BOOT (the authoring API
 * plan's Task 11, Decision 18): `docs/api/`'s pages, and the OpenAPI document generated from
 * `ROUTE_DEFINITIONS` by the same function `pnpm contract:write` runs — so the document served is
 * the document published, and `api/docs.test.ts` holds the two equal byte for byte.
 *
 * Here and not in `routes/docs.ts`, which `routes/index.ts` imports: the route file reading the
 * route list would be an import cycle.
 */
export interface ServedDocs {
  pages: ApiDocs
  openApi: Readonly<Record<string, unknown>>
}

export async function loadServedDocs(root: string): Promise<ServedDocs> {
  return {
    pages: await loadApiDocs(root),
    openApi: openApiDocument(ROUTE_DEFINITIONS) as Record<string, unknown>,
  }
}
