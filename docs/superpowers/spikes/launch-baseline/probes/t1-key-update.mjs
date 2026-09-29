// Task 1, Step 2 — does LiteLLM 1.98.0 narrow a LIVE key's models in place, and refuse a withdrawn model at once?
// Against the running proxy (127.0.0.1:7106) with the master key from the environment (`.env`, exported by the caller).
// The probe's key lives in this process's memory only and is NEVER printed; every line is checked for `sk-`.
// Removes its own key and user at the end, whatever happened.
//   set -a; . ./.env; set +a; node docs/superpowers/spikes/launch-baseline/probes/t1-key-update.mjs
const BASE = 'http://127.0.0.1:7106'
const MASTER = process.env.LITELLM_MASTER_KEY
if (!MASTER) throw new Error('LITELLM_MASTER_KEY is not set — export .env first')
const USER = 'probe-trim-person'
const ALIAS = 'probe-trim-1'
const ROUTES = ['/v1/chat/completions', '/v1/embeddings', '/v1/models'] // ai/keys.ts's AI_ALLOWED_ROUTES
let key // the probe key, in memory only

const say = (line) => {
  const s = typeof line === 'string' ? line : JSON.stringify(line)
  if (/sk-[A-Za-z0-9]/.test(s) || (key && s.includes(key)) || s.includes(MASTER)) throw new Error('refusing to print a key')
  console.log(s)
}
const admin = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { authorization: `Bearer ${MASTER}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}
const scrub = (j) => JSON.parse(JSON.stringify(j, (k, v) => (typeof v === 'string' && /^sk-/.test(v) ? '<a key>' : k === 'token' || k === 'key' ? '<hashed or plain token>' : v)))
const asKey = async (path, body) => {
  const t0 = Date.now()
  const res = await fetch(BASE + path, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 200) } }
  return { status: res.status, ms: Date.now() - t0, type: json?.error?.type, code: json?.error?.code, message: String(json?.error?.message ?? '').slice(0, 160), model: json?.model }
}
const chat = () => asKey('/v1/chat/completions', { model: 'default-chat', messages: [{ role: 'user', content: 'Answer with the one word: ok' }], max_tokens: 5 })
const embed = () => asKey('/v1/embeddings', { model: 'default-embed', input: 'ok' })

try {
  say('## (a) a user and a key holding default-chat and default-embed')
  say({ userNew: (await admin('POST', '/user/new', { user_id: USER, max_budget: 0.05, budget_duration: '1mo', auto_create_key: false })).status })
  const gen = await admin('POST', '/key/generate', { user_id: USER, key_alias: ALIAS, models: ['default-chat', 'default-embed'], duration: '10m', max_budget: 0.01, allowed_routes: ROUTES })
  key = gen.json.key
  say({ keyGenerate: gen.status, models: gen.json.models, alias: gen.json.key_alias })
  say({ chat: await chat() })
  say({ embed: await embed() })

  say('## (b) /key/update by ALIAS alone')
  const byAlias = await admin('POST', '/key/update', { key_alias: ALIAS, models: ['default-embed'] })
  say({ keyUpdateByAlias: byAlias.status, body: scrub(byAlias.json) })
  let updatedAt = Date.now()
  if (byAlias.status !== 200) {
    say('## (b2) the hashed token from /key/list, then /key/update by it')
    const list = await admin('GET', `/key/list?key_alias=${ALIAS}&return_full_object=true`)
    const entry = (list.json.keys ?? [])[0]
    say({ keyList: list.status, fields: entry && typeof entry === 'object' ? Object.keys(entry).sort() : typeof entry })
    const hashed = entry?.token
    const byHash = await admin('POST', '/key/update', { key: hashed, models: ['default-embed'] })
    say({ keyUpdateByHash: byHash.status, body: scrub(byHash.json)?.error ?? { models: byHash.json.models } })
    updatedAt = Date.now()
  }

  say('## (c) at once — a chat through the SAME key (default-chat withdrawn)')
  let c = await chat()
  say({ msAfterUpdate: Date.now() - updatedAt, chat: c })
  const until = Date.now() + 120_000
  while (c.status === 200 && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 5000))
    c = await chat()
    say({ msAfterUpdate: Date.now() - updatedAt, chat: c })
  }
  say('## (d) the model it kept')
  say({ embed: await embed() })
  say('## (e) what /key/list says of the key now')
  const after = await admin('GET', `/key/list?key_alias=${ALIAS}&return_full_object=true`)
  say({ keyListAfter: after.status, models: (after.json.keys ?? [])[0]?.models })
} finally {
  say('## (f) cleanup')
  say({ keyDelete: (await admin('POST', '/key/delete', { key_aliases: [ALIAS] })).status })
  say({ userDelete: (await admin('POST', '/user/delete', { user_ids: [USER] })).status })
}
