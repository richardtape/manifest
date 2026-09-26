import { z } from 'zod/v4'
import { environmentKind } from '../../db/index.js'
import { MIN_SECRET_LENGTH } from '../../observability/index.js'
import { representation, request, Timestamp, Uuid } from '../contract/schemas.js'
import { LONE_SURROGATE } from './source.js'

/**
 * AN APP'S DECLARED SECRETS (the authoring API plan's Task 8, Decision 13): write-only, per
 * environment. Names and whether each is set — never a value, in any answer.
 */

/** §7's `env` name rule, bounded at 128 characters. */
export const SecretName = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,127}$/)
  .describe(
    'The variable’s name, as manifest.yaml’s `env` declares it: an upper-case letter, then upper-case letters, digits and underscores, at most 128 characters.',
  )

export const AppSecretStatus = representation(
  'AppSecretStatus',
  z.object({
    name: SecretName,
    declared: z
      .boolean()
      .describe(
        'Whether the environment’s newest valid manifest.yaml declares this name with `secret: true`. Only a declared name reaches the app.',
      ),
    set: z
      .boolean()
      .describe(
        'Whether a value is stored. The value itself is never answered by any operation.',
      ),
    updatedAt: Timestamp.nullable().describe(
      'When the value last changed, or was first set; null when none is.',
    ),
  }),
)

export const AppSecretList = representation(
  'AppSecretList',
  z.object({
    environmentId: Uuid,
    environmentKind: z.enum(environmentKind.enumValues),
    secrets: z
      .array(AppSecretStatus)
      .describe(
        'Every name declared or set, sorted. A declared name with `set: false` stops the next deploy of this environment (`RELEASE_SECRET_NOT_SET`).',
      ),
  }),
)

/** 16 KiB of UTF-8: a PEM private key is ~3 KiB; nothing an app is handed as a variable needs more. */
const MAX_VALUE_BYTES = 16384

export const SetAppSecretRequest = request(
  'SetAppSecretRequest',
  z.strictObject({
    value: z
      .string()
      /**
       * AT LEAST SIX CHARACTERS — the redactor's own `MIN_SECRET_LENGTH`, not the plan's one
       * byte. §14's redactor silently skips a secret shorter than that (it would match too
       * much), so a shorter value would be rendered into the app and NEVER redacted from its
       * Incident: accepted here, it is a value the platform promises to hide and cannot.
       */
      .min(MIN_SECRET_LENGTH)
      .superRefine((value, ctx) => {
        if (LONE_SURROGATE.test(value) || value.includes('\u0000')) {
          ctx.addIssue({
            code: 'custom',
            message: 'a value is text: well-formed Unicode, with no NUL character',
          })
        }
        if (Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES) {
          ctx.addIssue({
            code: 'custom',
            message: `a value is at most ${MAX_VALUE_BYTES} bytes of UTF-8`,
          })
        }
      })
      .describe(
        `The value, as text: at least ${MIN_SECRET_LENGTH} characters (a shorter one could not be redacted from the app’s Incidents), at most ${MAX_VALUE_BYTES} bytes of UTF-8, well-formed, with no NUL. Takes effect at the next deploy of this environment; it is never answered back.`,
      ),
  }),
)
