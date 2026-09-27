import { z } from 'zod/v4'
import type { ApiDocPage } from '../../docs/index.js'
import { representation } from '../contract/schemas.js'

const Slug = z
  .string()
  .describe(
    'The page’s name in `getDoc`: its path under the documentation without `.md`, `/` as `-` — `reference-errors` is `reference/errors.md`.',
  )
const Title = z.string().describe('The page’s title — its first heading.')

export const DocIndex = representation(
  'DocIndex',
  z
    .object({
      pages: z
        .array(
          z.object({
            slug: Slug,
            title: Title,
            summary: z
              .string()
              .describe(
                'The page’s first paragraph: what it is for and who it is for, in a sentence or two.',
              ),
          }),
        )
        .describe(
          'Every page, the index first, then the guides, then the generated reference.',
        ),
    })
    .describe(
      'The API’s documentation: every page Manifest serves, for a person and for an agent.',
    ),
)

export const DocPage = representation(
  'DocPage',
  z
    .object({
      slug: Slug,
      title: Title,
      markdown: z
        .string()
        .describe(
          'The page, as Markdown. Its links name other pages by their file, as `authoring.md` — `getDoc` reads each by its slug.',
        ),
    })
    .describe('One page of the API’s documentation, as the platform serves it.'),
)

export const OpenApiDocument = representation(
  'OpenApiDocument',
  z
    .record(z.string(), z.unknown())
    .describe(
      'This API’s OpenAPI 3.1 document — the one the platform publishes, generated from its own route definitions when it starts, so what is served is what is published.',
    ),
)

export const toDocIndexEntry = (page: ApiDocPage) => ({
  slug: page.slug,
  title: page.title,
  summary: page.summary,
})

export const toDocPage = (page: ApiDocPage) => ({
  slug: page.slug,
  title: page.title,
  markdown: page.markdown,
})
