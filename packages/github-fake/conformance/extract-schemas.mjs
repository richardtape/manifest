// docs/superpowers/spikes/d5-baseline/extract-schemas.mjs — node extract-schemas.mjs <api.github.com.json> <out.json>
// Pulls, out of GitHub's own REST description, the response schemas of the operations the fake
// serves and the payload schemas of the webhooks it sends, with every component they reference.
import { readFileSync, writeFileSync } from 'node:fs'
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const OPS = [
  ['/app', 'get', '200'],
  ['/orgs/{org}/installation', 'get', '200'],
  ['/app/installations/{installation_id}/access_tokens', 'post', '201'],
  ['/orgs/{org}/repos', 'post', '201'],
  ['/repos/{owner}/{repo}', 'get', '200'],
  ['/repos/{owner}/{repo}', 'patch', '200'],
  ['/repos/{owner}/{repo}/branches/{branch}/protection', 'put', '200'],
]
const HOOKS = ['push', 'repository-publicized', 'ping']
const need = new Set()
const walk = (n) => {
  if (!n || typeof n !== 'object') return
  if (typeof n.$ref === 'string') {
    const k = n.$ref.split('/').pop()
    if (!need.has(k)) {
      need.add(k)
      walk(d.components.schemas[k])
    }
  }
  for (const v of Object.values(n)) walk(v)
}
const roots = {}
for (const [p, m, s] of OPS) {
  const schema = d.paths[p][m].responses[s].content['application/json'].schema
  roots[`${m.toUpperCase()} ${p} ${s}`] = schema
  walk(schema)
}
for (const h of HOOKS) {
  const schema = d['x-webhooks'][h].post.requestBody.content['application/json'].schema
  roots[`webhook ${h}`] = schema
  walk(schema)
}
const facts = {
  'POST /user/repos enabledForGitHubApps':
    d.paths['/user/repos'].post['x-github'].enabledForGitHubApps,
  'POST /orgs/{org}/repos enabledForGitHubApps':
    d.paths['/orgs/{org}/repos'].post['x-github'].enabledForGitHubApps,
  'branch protection availability':
    d.paths['/repos/{owner}/{repo}/branches/{branch}/protection'].put.description.split(
      '\n',
    )[0],
  'installation token description':
    d.paths['/app/installations/{installation_id}/access_tokens'].post.description,
}
const schemas = Object.fromEntries(
  [...need]
    .filter((k) => d.components.schemas[k])
    .map((k) => [k, d.components.schemas[k]]),
)
writeFileSync(
  process.argv[3],
  JSON.stringify(
    {
      source: `github/rest-api-description ${d.info.version}`,
      extracted: new Date().toISOString(),
      facts,
      roots,
      components: { schemas },
    },
    null,
    1,
  ),
)
console.log(d.info.version, 'schemas', Object.keys(schemas).length)
