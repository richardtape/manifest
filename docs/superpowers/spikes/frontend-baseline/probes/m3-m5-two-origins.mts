// m3-m5-two-origins.mts — [M3] one SP row carrying TWO assertion-consumer URLs, and an AuthnRequest naming
// the second; a third URL the row does not list. [M5] a logout begun by the second client with a RelayState:
// which SingleLogoutService the IdP answers, and whether RelayState comes back unchanged.
//
// The row is the platform's own renderSpMetadata output, hand-extended to two ACS and two SLO entries, for the
// PROBE entity https://manifest.internal/sp/probe-origins/platform. It is upserted through the platform's own
// store (sso/metadata-store.ts) and deleted in a finally, whatever happens. The sign-in is driven from the host
// (NODE_EXTRA_CA_CERTS = the platform CA) the way SAML_LOGIN_HOPS drives it from a container; nothing listens on
// either ACS — the IdP's auto-submitting form, and the Destination inside the signed response, say where it posted.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createSamlSp } from '../../../../../packages/control-plane/src/identity/saml.ts'
import { mintSpKeypair } from '../../../../../packages/control-plane/src/sso/keypair.ts'
import { renderSpMetadata, createIdpPool, upsertSpRow, deleteSpRow, SP_NAME_ID_FORMAT } from '../../../../../packages/control-plane/src/sso/metadata-store.ts'

const require = createRequire(new URL('../../../../../packages/control-plane/package.json', import.meta.url))
const { SAML } = require('@node-saml/node-saml') as typeof import('@node-saml/node-saml')

const ROOT = new URL('../../../../../', import.meta.url).pathname
const IDP = 'https://idp.manifest.internal'
const IDP_ENTITY = `${IDP}/idp/shibboleth`
const ENTITY = 'https://manifest.internal/sp/probe-origins/platform'
const CONSOLE = 'https://console.manifest.internal'
const APP = 'https://app.manifest.internal'
const EVIL = 'https://evil.manifest.internal'
const idpCert = readFileSync(`${ROOT}infra/idp/cert/server.crt`, 'utf8')
const idpDb = process.env.MANIFEST_IDP_DATABASE_URL
if (!idpDb) throw new Error('MANIFEST_IDP_DATABASE_URL is not set — the wrapper sources .env as RUNBOOK does')

// ---- a cookie jar and a redirect follower, enough for SimpleSAMLphp's session cookie
const jar = new Map<string, string>()
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
function keep(res: Response) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';'); const i = pair!.indexOf('=')
    const name = pair!.slice(0, i).trim(); const value = pair!.slice(i + 1).trim()
    if (/expires=Thu, 01 Jan 1970|max-age=0/i.test(c) || value === 'deleted') jar.delete(name); else jar.set(name, value)
  }
}
async function go(url: string, init: RequestInit = {}, stopAt?: (u: string) => boolean) {
  const hops: string[] = []
  let res: Response
  for (;;) {
    res = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: cookieHeader() } })
    keep(res)
    hops.push(`${res.status} ${url.slice(0, 110)}`)
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).toString()
      if (stopAt?.(url)) { hops.push(`(stopped before) ${url.slice(0, 160)}`); return { res, body: '', hops, url } }
      init = {}
      continue
    }
    return { res, body: await res.text(), hops, url }
  }
}
const un = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const attr = (html: string, re: RegExp) => { const m = re.exec(html); return m ? un(m[1]!) : null }

async function signIn(loginUrl: string, user: string, pass: string) {
  const first = await go(loginUrl)
  const hasForm = /name="username"/.test(first.body)
  if (!hasForm) {
    const title = attr(first.body, /<title>([^<]*)<\/title>/) ?? ''
    const h1 = first.body.replace(/\s+/g, ' ').match(/<h[12][^>]*>(.*?)<\/h[12]>/g)?.slice(0, 3).map((h) => h.replace(/<[^>]+>/g, '')) ?? []
    return { refused: true, status: first.res.status, title, headings: h1, hops: first.hops }
  }
  const state = attr(first.body, /name="AuthState"[^>]*value="([^"]*)"/)!
  const action = attr(first.body, /<form[^>]*action="([^"]*)"/)!
  const post = action.startsWith('http') ? action : new URL(action, first.url).toString()
  const second = await go(post, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: user, password: pass, AuthState: state }).toString() })
  const acs = attr(second.body, /<form[^>]*action="([^"]*)"/)
  const samlResponse = attr(second.body, /name="SAMLResponse"[^>]*value="([^"]*)"/)
  const xml = samlResponse ? Buffer.from(samlResponse, 'base64').toString('utf8') : ''
  return { refused: false, formAction: acs, responseDestination: attr(xml, /<samlp:Response[^>]*Destination="([^"]*)"/),
    recipient: attr(xml, /SubjectConfirmationData[^>]*Recipient="([^"]*)"/), samlResponse, hops: [...first.hops, ...second.hops] }
}

// ---- the probe SP: a keypair, and the platform's row with two ACS and two SLO entries
const keypair = await mintSpKeypair({ projectId: '00000000-0000-4000-8000-00000000fe01', environmentKind: 'staging', slug: 'probe-origins', entityId: ENTITY })
const entity = { entityId: ENTITY, acsUrl: `${CONSOLE}/auth/saml/callback`, sloUrl: `${CONSOLE}/auth/logout`, attributes: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn'] }
const row = renderSpMetadata(entity as never, keypair) as Record<string, unknown>
row.AssertionConsumerService = [
  { index: 0, Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', Location: `${CONSOLE}/auth/saml/callback` },
  { index: 1, Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST', Location: `${APP}/auth/saml/callback` },
]
row.SingleLogoutService = [
  { Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect', Location: `${CONSOLE}/auth/logout` },
  { Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect', Location: `${APP}/auth/logout` },
]
const clientFor = (origin: string) => createSamlSp({ entity: { ...entity, acsUrl: `${origin}/auth/saml/callback`, sloUrl: `${origin}/auth/logout` } as never,
  idpBaseUrl: IDP, idpEntityId: IDP_ENTITY, idpCertificatePem: idpCert, privateKeyPem: keypair.privateKeyPem, certificatePem: keypair.certificatePem })

const pool = createIdpPool(idpDb)
try {
  await upsertSpRow(pool, ENTITY, row as never)
  console.log('probe row upserted:', ENTITY, '— ACS', (row.AssertionConsumerService as { Location: string }[]).map((a) => a.Location).join(' , '))

  for (const [label, origin] of [['M3 client 1 (console ACS, index 0)', CONSOLE], ['M3 client 2 (app ACS, index 1)', APP]] as const) {
    jar.clear()
    const sp = clientFor(origin)
    const url = await sp.loginUrl('/')
    const r = await signIn(url, 'student', 'student')
    const shown: Record<string, unknown> = { ...r }
    delete shown.samlResponse // never printed: the assertion carries a NameID (§14)
    console.log(`--- ${label}: AuthnRequest's AssertionConsumerServiceURL = ${origin}/auth/saml/callback`)
    console.log(JSON.stringify(shown, null, 1))
  }

  console.log('--- M3 client 3 (a URL the row does NOT list):', `${EVIL}/auth/saml/callback`)
  jar.clear()
  const evil = await signIn(await clientFor(EVIL).loginUrl('/'), 'student', 'student')
  const evilShown: Record<string, unknown> = { ...evil }
  delete evilShown.samlResponse
  console.log(JSON.stringify(evilShown, null, 1))

  // ---- M5: sign in through client 2, then a logout with RelayState naming app's origin
  console.log('--- M5: sign in through client 2, then LogoutRequest with RelayState =', APP)
  jar.clear()
  const sp2 = clientFor(APP)
  const signed = await signIn(await sp2.loginUrl('/'), 'student', 'student')
  if (signed.refused || !('samlResponse' in signed) || !signed.samlResponse) throw new Error('M5: the sign-in did not complete')
  const identity = await sp2.validate(signed.samlResponse)
  const session = identity.idpSession!
  const raw = new SAML({ issuer: ENTITY, callbackUrl: `${APP}/auth/saml/callback`, entryPoint: `${IDP}/module.php/saml/idp/singleSignOnService`,
    logoutUrl: `${IDP}/module.php/saml/idp/singleLogout`, idpCert, privateKey: keypair.privateKeyPem, publicCert: keypair.certificatePem,
    signatureAlgorithm: 'sha256', digestAlgorithm: 'sha256', identifierFormat: SP_NAME_ID_FORMAT, audience: ENTITY })
  const logoutUrl = await raw.getLogoutUrlAsync({ issuer: ENTITY, nameID: session.nameID, nameIDFormat: session.nameIDFormat,
    ...(session.sessionIndex ? { sessionIndex: session.sessionIndex } : {}) } as never, APP, {})
  const out = await go(logoutUrl, {}, (u) => u.startsWith(CONSOLE) || u.startsWith(APP))
  // THE FULL URL, from go()'s answer — never the hop string, which is cut at 160 characters for display (the
  // first run of this probe parsed the cut string and read RelayState and Signature as absent: a probe defect).
  const dest = out.url
  const q = dest.includes('?') ? new URL(dest).searchParams : new URLSearchParams()
  console.log(JSON.stringify({ validatedAs: identity.ubcCwlPuid, sessionIndexPresent: session.sessionIndex !== null,
    hops: out.hops.map((h) => h.replace(/SAMLRequest=[^&]+/, 'SAMLRequest=…').replace(/Signature=[^&]+/, 'Signature=…')),
    logoutResponseTo: dest.split('?')[0], hasSAMLResponse: q.has('SAMLResponse'), relayStateReceived: q.get('RelayState'),
    relayStateUnchanged: q.get('RelayState') === APP, signed: q.has('Signature') }, null, 1))
} finally {
  await deleteSpRow(pool, ENTITY)
  const left = await pool.query('SELECT count(*)::int AS n FROM saml20_sp_remote WHERE entity_id = $1', [ENTITY])
  console.log('probe row deleted; rows left for the probe entity:', left.rows[0].n)
  await pool.end()
}
