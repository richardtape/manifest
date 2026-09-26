import { z } from 'zod/v4'
import { representation } from '../contract/schemas.js'

export const SlugCheck = representation(
  'SlugCheck',
  z
    .object({
      slug: z.string().describe('The name checked, as sent.'),
      available: z.boolean().describe('Whether `createProject` would accept it now.'),
      reasons: z
        .array(
          z.object({
            code: z
              .enum(['SLUG_INVALID', 'SLUG_RESERVED', 'SLUG_TAKEN'])
              .describe('The code `createProject` would refuse it with.'),
            message: z.string().describe('What is wrong with it, for a person.'),
            hint: z.string().describe('What to do instead.'),
          }),
        )
        .optional()
        .describe('Present when `available` is false: every reason that applies.'),
    })
    .describe(
      '§23: exactly what project creation will answer — advisory, since creation checks again.',
    ),
)
