// `make seed` pushes base images into a registry that now requires a token, and it
// cannot use `docker login`: there is no password to type and the realm is the
// control plane, which is not running during `make seed`. A pre-minted bearer token
// in a throwaway docker config is the supported path.
// Usage: node infra/seed/mint-token.mjs base/node
import { createSign, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const repository = process.argv[2]
if (!repository) {
  console.error('usage: mint-token.mjs <repository>')
  process.exit(2)
}
const key = readFileSync('infra/registry-auth/token.key', 'utf8')
const cert = readFileSync('infra/registry-auth/token.crt', 'utf8')
const b64u = (v) => Buffer.from(v).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const header = {
  typ: 'JWT',
  alg: 'RS256',
  x5c: [cert.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, '')],
}
const claims = {
  iss: 'manifest-control-plane', sub: 'make-seed', aud: 'manifest-registry',
  exp: now + 900, nbf: now - 10, iat: now, jti: randomUUID(),
  access: [{ type: 'repository', name: repository, actions: ['pull', 'push'] }],
}
const signing = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`
process.stdout.write(`${signing}.${b64u(createSign('RSA-SHA256').update(signing).end().sign(key))}`)
