import { z } from 'zod/v4'
import { defineRoute, NO_BODY, NO_PARAMS, NO_QUERY } from '../contract/route.js'
import { DocNotFoundError } from '../errors.js'
import {
  DocIndex,
  DocPage,
  OpenApiDocument,
  toDocIndexEntry,
  toDocPage,
} from '../representations/docs.js'

const SlugParams = z.strictObject({
  slug: z
    .string()
    .max(128)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .describe(
      'The page’s `slug`, as `listDocs` answers it — `agents`, `reference-errors`.',
    ),
})

/**
 * THE DOCUMENTATION, SERVED OVER THE API (the authoring API plan's Task 11, Decision 18; D23.4,
 * D25). **Any credential reads it** — a session, or a token of any project — because
 * documentation is no project's data: each route asserts no capability, and `registerRoutes`
 * has already refused a request with none (`401`). Read once at boot (`deps.docs`), so what is
 * served is what the control plane started with.
 */
export const docRoutes = [
  defineRoute({
    operationId: 'listDocs',
    method: 'GET',
    path: '/v1/docs',
    tag: 'docs',
    summary: 'The API’s documentation',
    description:
      'Every page of the API’s documentation, with the sentence that says what each is for — the guides for a person writing a client and for an AI agent, and the reference generated from this document. An agent’s first call is `getDoc` for `agents`. Any credential may read them.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'Every page.', schema: DocIndex },
    errors: [],
    examples: {
      response: {
        pages: [
          {
            slug: 'index',
            title: 'Manifest’s API',
            summary:
              'Manifest’s API is how a person’s tools and an AI agent create, build, deploy and launch an application on Manifest — the same API the platform’s own console uses, and the only one.',
          },
        ],
      },
    },
    handler: async ({ deps }) => ({ pages: deps.docs.pages.pages.map(toDocIndexEntry) }),
  }),
  defineRoute({
    operationId: 'getDoc',
    method: 'GET',
    path: '/v1/docs/{slug}',
    tag: 'docs',
    summary: 'A page of the documentation',
    description:
      'One page, as Markdown. Its links name other pages by their file (`authoring.md`); read each by its slug. Any credential may read it.',
    params: SlugParams,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The page.', schema: DocPage },
    errors: ['DOC_NOT_FOUND'],
    examples: {
      response: {
        slug: 'index',
        title: 'Manifest’s API',
        markdown:
          '# Manifest’s API\n\nManifest’s API is how a person’s tools and an AI agent create, build, deploy and launch an application on Manifest — the same API the platform’s own console uses, and the only one.\n',
      },
    },
    handler: async ({ deps, params }) => {
      const page = deps.docs.pages.page(params.slug)
      if (page === undefined) throw new DocNotFoundError(params.slug)
      return toDocPage(page)
    },
  }),
  defineRoute({
    operationId: 'getOpenApiDocument',
    method: 'GET',
    path: '/v1/openapi.json',
    tag: 'docs',
    summary: 'This OpenAPI document',
    description:
      'The OpenAPI 3.1 document describing every operation, representation, error code and event — generated from the platform’s own route definitions when it starts, so it is exactly the document the platform publishes. Any credential may read it.',
    params: NO_PARAMS,
    query: NO_QUERY,
    body: NO_BODY,
    success: { status: 200, description: 'The document.', schema: OpenApiDocument },
    errors: [],
    examples: {
      response: {
        openapi: '3.1.0',
        info: { title: 'Manifest', version: '1.3.0' },
        paths: {},
      },
    },
    handler: async ({ deps }) => deps.docs.openApi,
  }),
]
