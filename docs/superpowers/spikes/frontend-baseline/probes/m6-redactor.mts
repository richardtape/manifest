// m6-redactor.mts — [M6] the redactor over an app's OWN output. makeRedactor is fed the secret set an app
// would have (its MONGODB_URI as runtime/docker/services.ts renders it, an LLM_API_KEY of LiteLLM's shape,
// and one SAMPLE_SECRETS value), then lines an app might print. Every value is generated at run time.
import { randomBytes } from 'node:crypto'
import { makeRedactor } from '../../../../../packages/control-plane/src/observability/redact.ts'
import { SAMPLE_SECRETS } from '../../../../../packages/control-plane/src/build/testing.ts'

const password = randomBytes(32).toString('hex') // secrets/store.ts:175's shape
const mongoUri = `mongodb://app:${password}@mf-probe-staging-db:27017/app?authSource=admin` // services.ts:27
const llmKey = 'sk-' + randomBytes(16).toString('base64url') // LiteLLM's key shape: sk- + token_urlsafe(16)
const sample = SAMPLE_SECRETS['a GitHub token']
// Pass 1 is the plan's wording (the URI whole in the set). Pass 2 is the set the platform actually builds:
// secretValuesFor answers every ROW for the app+environment — `service:<name>:password` (the password, NOT the
// URI: services/credentials.ts:72), `app:sessionSecret` (64 hex), the instance's AI key (ai/keys.ts:178) and
// declared app secrets — so the URI is redacted by its password's exact match.
const sessionSecret = randomBytes(32).toString('hex')
const SETS: Record<string, string[]> = {
  "plan's wording — [MONGODB_URI, LLM_API_KEY, sample]": [mongoUri, llmKey, sample],
  'the real set — [service password, session secret, AI key, sample]': [password, sessionSecret, llmKey, sample],
}

const notInSet = 'bearer-' + randomBytes(24).toString('base64url') // a Bearer credential the app was never given
const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from('{"sub":"student","iat":1}').toString('base64url'), randomBytes(24).toString('base64url')].join('.')
const lines: [string, string, 'redacted' | 'kept'][] = [
  ['the MONGODB_URI printed whole', `connecting to ${mongoUri}`, 'redacted'],
  ["the URI's password alone", `pw=${password}`, 'redacted'],
  ['the LLM_API_KEY (in the set)', `LLM_API_KEY=${llmKey}`, 'redacted'],
  ['a SAMPLE_SECRETS value (in the set)', `token ${sample}`, 'redacted'],
  ['Authorization: Bearer sk-… (NOT in the set)', `Authorization: Bearer sk-${randomBytes(18).toString('base64url')}`, 'redacted'],
  ['Authorization: Bearer <opaque> (NOT in the set)', `Authorization: Bearer ${notInSet}`, 'redacted'],
  ['a JWT (NOT in the set)', `session=${jwt}`, 'redacted'],
  ['a 40-character hex string (a commit id)', `deployed ${randomBytes(20).toString('hex')}`, 'kept'],
  ['a UUID', `request ${crypto.randomUUID()}`, 'kept'],
  ['an 8-lowercase-letter password NOT in the set', 'login ok for student with password hunter-z → abcdefgh', 'kept'],
  ['a different Mongo URI (NOT in the set)', `mongodb://admin:${randomBytes(8).toString('hex')}@other:27017/x`, 'redacted'],
  ['a 64-hex value NOT in the set (a platform-shaped secret of ANOTHER app)', `other=${randomBytes(32).toString('hex')}`, 'kept'],
  ['the SESSION_SECRET printed (in the real set only)', `SESSION_SECRET=${sessionSecret}`, 'redacted'],
  ['a 24-char base64 random value NOT in the set', `api_key=${randomBytes(18).toString('base64')}`, 'redacted'],
]
for (const [setName, set] of Object.entries(SETS)) {
const redact = makeRedactor(set) as (v: string) => string
console.log(`=== ${setName}`)
const rows = lines.map(([what, line, predicted]) => {
  const out = redact(line)
  const actual = out === line ? 'kept' : 'redacted'
  return { what, predicted, actual, match: predicted === actual, out: out.replace(/[0-9a-f]{64}/g, '<64hex>').replace(/[A-Za-z0-9_-]{30,}/g, '<long>') }
})
for (const r of rows) console.log(JSON.stringify(r))
console.log(`predictions matched: ${rows.filter((r) => r.match).length}/${rows.length}`)
}
