import type { z } from 'zod'
import type { ManifestError } from '../errors/index.js'

export const SPEC_CODES = {
  BUILD_BLOCK_FORBIDDEN: 'SPEC_BUILD_BLOCK_FORBIDDEN',
  UNKNOWN_KEY: 'SPEC_UNKNOWN_KEY',
  PATH_EXPECTED: 'SPEC_PATH_EXPECTED',
  INVALID_SLUG: 'SPEC_INVALID_SLUG',
  RESERVED_BLOCK_NOT_EMPTY: 'SPEC_RESERVED_BLOCK_NOT_EMPTY',
  INVALID_BLUEPRINT_REF: 'SPEC_INVALID_BLUEPRINT_REF',
  INVALID_VALUE: 'SPEC_INVALID_VALUE',
  YAML_PARSE_FAILED: 'SPEC_YAML_PARSE_FAILED',
} as const

const TOP_LEVEL_KEYS =
  'manifest, name, blueprint, description, runtime, resources, services, auth, ai, env, egress, data, integrations, jobs, checks, environments'

const RESERVED = new Set(['integrations', 'jobs', 'checks'])

const pathOf = (issue: z.ZodIssue) => issue.path.join('.')

/**
 * Two zod issues can describe one mistake — a reserved block raises both a
 * length error and an element error — so the mapped errors are deduplicated by
 * (code, path). Order is preserved: the first occurrence wins.
 */
function dedupe(errors: ManifestError[]): ManifestError[] {
  const seen = new Set<string>()
  return errors.filter((e) => {
    const key = `${e.code}\u0000${e.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function toManifestErrors(issues: z.ZodIssue[]): ManifestError[] {
  return dedupe(
    issues.map((issue): ManifestError => {
      const path = pathOf(issue)

      if (
        path === 'runtime.build' ||
        (issue.code === 'unrecognized_keys' &&
          issue.keys.includes('build') &&
          path === 'runtime')
      ) {
        return {
          code: SPEC_CODES.BUILD_BLOCK_FORBIDDEN,
          path: 'runtime.build',
          message: 'an app may not supply its own build definition',
          hint: 'Remove the build block. The Dockerfile comes from the blueprint (D13) — declare what you need, never how to build it.',
        }
      }

      // Matched on the FIRST SEGMENT, not the whole path. A non-empty reserved
      // block raises two issues — `too_big` at `integrations` and `invalid_type`
      // at `integrations.0` — and mapping only the first left the second to fall
      // through to SPEC_INVALID_VALUE, whose hint invites the reader to look up
      // the permitted values of `integrations.0`. §15 permits none. Both issues
      // now collapse onto the one true error, and `dedupe` drops the repeat.
      const block = path.split('.')[0] ?? ''
      if (RESERVED.has(block)) {
        return {
          code: SPEC_CODES.RESERVED_BLOCK_NOT_EMPTY,
          path: block,
          message: `${block} is reserved and must be empty in schema version 1`,
          hint: `${block} is a forward-compatibility hook (§15). Leave it as an empty list.`,
        }
      }

      if (issue.code === 'unrecognized_keys') {
        // The top-level key list is only the right vocabulary at the top level.
        // Naming it for `data.bogus` would send a self-correcting agent to rename
        // the key to `services`, which `data` does not accept either.
        const hint = path
          ? `${path} does not define that key. Check §7 for the keys ${path} accepts.`
          : `Allowed top-level keys are: ${TOP_LEVEL_KEYS}.`
        return {
          code: SPEC_CODES.UNKNOWN_KEY,
          path: [path, issue.keys[0]].filter(Boolean).join('.'),
          message: `unknown key: ${issue.keys.join(', ')}`,
          hint,
        }
      }

      if (path === 'name') {
        return {
          code: SPEC_CODES.INVALID_SLUG,
          path,
          message: 'name must be a valid project slug',
          hint: 'Lower-case letters, digits and hyphens, starting with a letter, 3–39 characters: ^[a-z][a-z0-9-]{2,38}$',
        }
      }

      if (path === 'blueprint') {
        return {
          code: SPEC_CODES.INVALID_BLUEPRINT_REF,
          path,
          message: 'blueprint must be a name pinned to a major version',
          hint: 'Write it as name@major, for example node-ts-mongo@2.',
        }
      }

      if (
        path.endsWith('callback') ||
        path.endsWith('logout') ||
        path === 'runtime.health'
      ) {
        return {
          code: SPEC_CODES.PATH_EXPECTED,
          path,
          message: 'this field is a path, not a URL',
          hint: 'Supply a path beginning with / such as /auth/ubcshib/callback. Manifest derives the origin itself (D15); an app never supplies one.',
        }
      }

      return {
        code: SPEC_CODES.INVALID_VALUE,
        path,
        // zod's message for a failed `.regex()` is the single word "Invalid",
        // which satisfies "an error has a message" and tells a reader nothing.
        // §20 asks for a human-readable one, so name the field and the reason.
        message:
          issue.message === 'Invalid'
            ? `${path || 'this field'} does not match the format §7 requires`
            : issue.message,
        hint: `Check the type and permitted values of ${path || 'this field'} in §7 of the platform design.`,
      }
    }),
  )
}
