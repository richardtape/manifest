// M3b (P5a Task 1): print a signed AuthnRequest URL whose RelayState is a known value.
//   node m3b-relaystate.mjs <origin>
// The IdP must echo RelayState in the form it posts back, or Decision 16's binding
// cannot ride on it. The request is signed with infra/sp/control-plane.key, the same
// key the running control plane registered, so the IdP accepts it.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const ROOT = new URL('../../../../', import.meta.url)
const require = createRequire(new URL('packages/control-plane/package.json', ROOT))
const { SAML } = require('@node-saml/node-saml')
const { controlPlaneSpEntity, SP_NAME_ID_FORMAT } = await import(
  new URL('packages/control-plane/dist/sso/index.js', ROOT)
)

const origin = process.argv[2]
const entity = controlPlaneSpEntity({ entityBase: 'https://manifest.internal', origin })
const saml = new SAML({
  issuer: entity.entityId,
  callbackUrl: entity.acsUrl,
  entryPoint: 'https://idp.manifest.internal/module.php/saml/idp/singleSignOnService',
  idpCert: readFileSync(new URL('infra/idp/cert/server.crt', ROOT), 'utf8'),
  privateKey: readFileSync(new URL('infra/sp/control-plane.key', ROOT), 'utf8'),
  signatureAlgorithm: 'sha256',
  digestAlgorithm: 'sha256',
  identifierFormat: SP_NAME_ID_FORMAT,
  disableRequestedAuthnContext: true,
})
console.log(await saml.getAuthorizeUrlAsync('p5a-m3-relaystate-probe', undefined, {}))
