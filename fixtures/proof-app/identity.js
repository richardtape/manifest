// §10's end-user identifier, in its own module for one reason: `server.js` has
// a top-level `await client.connect()` and starts listening on import, so a
// test that imported it to check this function would start an application.
import { createHash } from 'node:crypto'

/**
 * THE KEY EVERY NOTE IS STORED UNDER, and it is not a bare hash of the PUID.
 *
 * The namespace is the whole point. S3 measured that LiteLLM keys an end-user
 * budget on this string GLOBALLY rather than per API key, so an un-namespaced
 * hash means a student who exhausts their allowance in one course tool is
 * refused by every other Manifest application — an ordinary day's use turning
 * into a cross-app outage.
 *
 * Nothing reads it as a budget key until P4b. It is computed correctly HERE,
 * from day one, so P4b passes the same string through to LiteLLM rather than
 * migrating what an app has already stored about people.
 *
 * It must stay byte-identical to P4b's `skeleton/ai/llm.js`:
 *   sha256(`${puid} ${MANIFEST_PROJECT_SLUG} ${MANIFEST_ENV}`)
 * space-separated, in that order, reading the two names from the environment
 * exactly as that file does. `blueprints/proof-app-identity.test.ts` asserts it
 * against this real export so the two cannot drift apart quietly.
 *
 * Storing the HASH and never the PUID is also the privacy answer: this app's
 * database holds no UBC identifier at all, which is what its PIA will say.
 */
export function endUserId(ubcEduCwlPuid) {
  // Read at call time, not at import: §8 injects both, and a module-level read
  // would bake in whatever the environment happened to be when it loaded.
  const slug = process.env.MANIFEST_PROJECT_SLUG
  const env = process.env.MANIFEST_ENV
  if (!ubcEduCwlPuid || !slug || !env) {
    // Never a partial identifier. A hash built from an undefined namespace is
    // a stable, wrong key that collides across every environment — which is a
    // student's notes appearing in a production deployment.
    throw new Error(
      'endUserId needs a PUID, MANIFEST_PROJECT_SLUG and MANIFEST_ENV (§8, §10)',
    )
  }
  return createHash('sha256')
    .update(ubcEduCwlPuid + ' ' + slug + ' ' + env)
    .digest('hex')
}
