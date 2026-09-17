import { z } from 'zod/v4'
import { representation } from '../contract/schemas.js'

export const SlugCheck = representation(
  'SlugCheck',
  z
    .object({
      slug: z.string(),
      available: z.boolean(),
      reasons: z
        .array(
          z.object({
            code: z.enum(['SLUG_INVALID', 'SLUG_RESERVED', 'SLUG_TAKEN']),
            message: z.string(),
            hint: z.string(),
          }),
        )
        .optional()
        .describe('Present when `available` is false: every reason that applies.'),
    })
    .describe(
      '§23: exactly what project creation will answer — advisory, since creation checks again.',
    ),
)
