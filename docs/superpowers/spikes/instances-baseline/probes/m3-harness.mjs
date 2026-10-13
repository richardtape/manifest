// [M3], library level: two SP processes (A and B, the same configuration, as two
// instances of one app are), a throwaway IdP key. Each AuthnRequest is issued by one
// process; the IdP's answer to it is signed here and posted to one process.
import { fork } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { randomBytes } from 'node:crypto'
import { SignedXml } from 'xml-crypto'

const ACS = 'https://m3.staging.manifest.internal/auth/ubcshib/callback'
const ISSUER = 'https://manifest.internal/sp/m3/staging'
const IDP = 'https://idp.m3.invalid'
const env = {
  ...process.env,
  SAML_ENVIRONMENT: 'LOCAL',
  SAML_ISSUER: ISSUER,
  SAML_CALLBACK_URL: ACS,
  SAML_ENTRY_POINT: `${IDP}/sso`,
  SAML_LOGOUT_URL: `${IDP}/slo`,
  SAML_IDP_METADATA_URL: `${IDP}/metadata`,
  SAML_IDP_CERT_PATH: '/m3keys/idp.crt',
}
const key = readFileSync('/m3keys/idp.key', 'utf8')
const cert = readFileSync('/m3keys/idp.crt', 'utf8')

function start(name, port) {
  return new Promise((resolve, reject) => {
    const child = fork('/app/m3/sp.mjs', { env: { ...env, NAME: name, PORT: String(port) } })
    child.once('message', () => resolve({ name, port, child }))
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`${name} exited ${code}`)))
  })
}

async function authnRequestId(sp) {
  const res = await fetch(`http://127.0.0.1:${sp.port}/login`, { redirect: 'manual' })
  const loc = new URL(res.headers.get('location'))
  const xml = inflateRawSync(Buffer.from(loc.searchParams.get('SAMLRequest'), 'base64')).toString()
  return { status: res.status, to: `${loc.origin}${loc.pathname}`, id: /\sID="([^"]+)"/.exec(xml)[1] }
}

const iso = (ms) => new Date(Date.now() + ms).toISOString()
function signedResponse(inResponseTo) {
  const rid = `_r${randomBytes(8).toString('hex')}`
  const aid = `_a${randomBytes(8).toString('hex')}`
  const xml =
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${rid}" Version="2.0" IssueInstant="${iso(0)}" Destination="${ACS}" InResponseTo="${inResponseTo}">` +
    `<saml:Issuer>${IDP}</saml:Issuer>` +
    `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
    `<saml:Assertion ID="${aid}" Version="2.0" IssueInstant="${iso(0)}">` +
    `<saml:Issuer>${IDP}</saml:Issuer>` +
    `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">_n${randomBytes(6).toString('hex')}</saml:NameID>` +
    `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${iso(300000)}" Recipient="${ACS}" InResponseTo="${inResponseTo}"/></saml:SubjectConfirmation></saml:Subject>` +
    `<saml:Conditions NotBefore="${iso(-60000)}" NotOnOrAfter="${iso(300000)}"><saml:AudienceRestriction><saml:Audience>${ISSUER}</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
    `<saml:AuthnStatement AuthnInstant="${iso(0)}" SessionIndex="_s1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>` +
    `<saml:AttributeStatement><saml:Attribute Name="ubcEduCwlPuid"><saml:AttributeValue>M3PUID0001</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>` +
    `</saml:Assertion></samlp:Response>`
  const sig = new SignedXml({
    privateKey: key,
    publicCert: cert,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  })
  sig.addReference({
    xpath: "//*[local-name(.)='Assertion']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
  })
  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='Assertion']/*[local-name(.)='Issuer']", action: 'after' },
  })
  return Buffer.from(sig.getSignedXml()).toString('base64')
}

async function post(sp, samlResponse) {
  const res = await fetch(`http://127.0.0.1:${sp.port}/auth/ubcshib/callback`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ SAMLResponse: samlResponse }),
  })
  const text = await res.text()
  return { status: res.status, location: res.headers.get('location'), body: text.slice(0, 160) }
}

const A = await start('A', 4001)
const B = await start('B', 4002)
const versions = Object.fromEntries(
  ['passport-ubcshib', '@node-saml/node-saml', '@node-saml/passport-saml', 'passport', 'xml-crypto'].map((p) => [
    p,
    JSON.parse(readFileSync(`/app/node_modules/${p}/package.json`, 'utf8')).version,
  ]),
)
console.log(JSON.stringify({ versions, node: process.version }))
for (const [label, from, to] of [
  ['control A->A', A, A],
  ['ACROSS  A->B', A, B],
  ['ACROSS  B->A', B, A],
  ['control B->B', B, B],
  ['control A->A (again, after the across runs)', A, A],
]) {
  const req = await authnRequestId(from)
  const answer = await post(to, signedResponse(req.id))
  console.log(`${label}: AuthnRequest ${req.status} -> ${req.to} id=${req.id.slice(0, 10)}…; assertion posted to ${to.name}: ${JSON.stringify(answer)}`)
}
// Replay: an assertion already consumed by A, posted to A again.
const r = await authnRequestId(A)
const once = signedResponse(r.id)
console.log(`replay on A: first ${JSON.stringify(await post(A, once))}; second ${JSON.stringify(await post(A, once))}`)
A.child.kill()
B.child.kill()
process.exit(0)
