// §10's end-user identifier, in its own module so it can be imported — and tested —
// without constructing a model client: `llm.js` loads the toolkit and three SDKs.
import { createHash } from 'node:crypto'

/**
 * The `user` every AI request is attributed to, and it is NOT a bare hash of the PUID.
 *
 * The namespace is the whole point. S3 measured that LiteLLM keys an end-user budget
 * on this string GLOBALLY rather than per API key, so an un-namespaced hash means a
 * student who exhausts their allowance in one course tool is refused by every other
 * Manifest application — an ordinary day's use turning into a cross-app outage.
 *
 * `sha256(puid + ' ' + MANIFEST_PROJECT_SLUG + ' ' + MANIFEST_ENV)`, space-separated,
 * in that order. It is BYTE-IDENTICAL to `fixtures/proof-app/identity.js`, which
 * computed it a plan early so that apps store this string from day one;
 * `blueprints/proof-app-identity.test.ts` holds the two to each other until the proof
 * app imports this one.
 */
export function endUserId(ubcEduCwlPuid) {
  // Read at call time, not at import: §8 injects both, and a module-level read would
  // bake in whatever the environment happened to be when it loaded.
  const slug = process.env.MANIFEST_PROJECT_SLUG
  const env = process.env.MANIFEST_ENV
  if (!ubcEduCwlPuid || !slug || !env) {
    // Never a partial identifier. A hash built from an undefined namespace is a
    // stable, WRONG key that collides across every environment — one person's budget
    // shared between staging and production.
    throw new Error('endUserId needs a PUID, MANIFEST_PROJECT_SLUG and MANIFEST_ENV (§8, §10)')
  }
  return createHash('sha256')
    .update(ubcEduCwlPuid + ' ' + slug + ' ' + env)
    .digest('hex')
}
