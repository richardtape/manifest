// m7-m8-litellm.mts — [M7] LiteLLM's agent-key mechanics and [M8] a person's spend, against the RUNNING proxy
// (127.0.0.1:7106) with the master key. Every user and key it makes is named probe-agent-*, and deleted at the end
// by value and by user, whatever happened. NO KEY'S PLAINTEXT IS EVER PRINTED — a key is shown as its alias.
const URL_ = process.env.MANIFEST_LITELLM_URL ?? 'http://127.0.0.1:7106'
const MASTER = process.env.LITELLM_MASTER_KEY
if (!MASTER) throw new Error('LITELLM_MASTER_KEY is not set — the wrapper sources .env')
const ROUTES = ['/v1/chat/completions', '/v1/embeddings', '/v1/models'] // ai/keys.ts's AI_ALLOWED_ROUTES
const t0 = Date.now()
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`

async function call(method: string, path: string, body?: unknown, bearer = MASTER!) {
  const res = await fetch(`${URL_}${path}`, { method, headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let json: unknown; try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}
/** One field of an untyped JSON body, by path — `undefined` wherever the path does not exist. */
const get = (v: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((o, k) => (o !== null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), v)
const errShape = (j: unknown) => get(j, 'error') !== undefined
  ? { type: get(j, 'error', 'type'), code: get(j, 'error', 'code'), param: get(j, 'error', 'param'), message: String(get(j, 'error', 'message')).slice(0, 180) }
  : j
const chat = (key: string, model = 'default-chat') => call('POST', '/v1/chat/completions',
  { model, messages: [{ role: 'user', content: 'Say ok.' }], max_tokens: 5 }, key)

const users: string[] = []
const keys: string[] = []
async function newUser(id: string, maxBudget: number) {
  const r = await call('POST', '/user/new', { user_id: id, max_budget: maxBudget, budget_duration: '1mo', auto_create_key: false })
  users.push(id)
  return r
}
async function newKey(body: Record<string, unknown>) {
  const r = await call('POST', '/key/generate', { allowed_routes: ROUTES, ...body })
  const key = get(r.json, 'key') as string | undefined
  if (r.status === 200 && key) keys.push(key)
  return { status: r.status, key: key as string, expires: get(r.json, 'expires'), alias: get(r.json, 'key_alias'), maxBudget: get(r.json, 'max_budget'), err: r.status === 200 ? undefined : errShape(r.json) }
}
const userSpend = async (id: string) => {
  const r = await call('GET', `/user/info?user_id=${id}`)
  return { status: r.status, userInfoSpend: get(r.json, 'user_info', 'spend') as number | undefined, userInfoMaxBudget: get(r.json, 'user_info', 'max_budget'),
    budgetResetAt: get(r.json, 'user_info', 'budget_reset_at'), keys: ((get(r.json, 'keys') ?? []) as unknown[]).map((k) => ({ alias: get(k, 'key_alias'), spend: get(k, 'spend') })) }
}

try {
  const health = await call('GET', '/health/readiness')
  console.log('LiteLLM', JSON.stringify({ status: health.status, version: get(health.json, 'litellm_version'), db: get(health.json, 'db') }))

  console.log('--- user probe-agent-person: max_budget 0.05, budget_duration 1mo, auto_create_key false')
  const u = await newUser('probe-agent-person', 0.05)
  console.log(JSON.stringify({ status: u.status, err: u.status === 200 ? undefined : errShape(u.json), keyCreatedAlongside: Boolean(get(u.json, 'key')) }))
  console.log('M8 before (a):', JSON.stringify(await userSpend('probe-agent-person')))

  console.log('--- (a) key probe-agent-1: max_budget 0.00001, duration 300s (plan: 60s — longer so a budget refusal cannot read as expiry), models [default-chat]')
  const a = await newKey({ user_id: 'probe-agent-person', key_alias: 'probe-agent-1', duration: '300s', max_budget: 0.00001, models: ['default-chat'] })
  console.log(JSON.stringify({ ...a, key: a.key ? '<probe-agent-1>' : null }))
  const first = await chat(a.key)
  console.log(`call 1 at ${at()}:`, first.status, JSON.stringify(first.status === 200 ? { usage: get(first.json, 'usage') } : errShape(first.json)))
  let refusedAt: string | null = null
  for (let i = 0; i < 40 && !refusedAt; i++) {
    const r = await chat(a.key)
    if (r.status !== 200) { refusedAt = at(); console.log(`call ${i + 2} at ${refusedAt}: REFUSED`, r.status, JSON.stringify(errShape(r.json))) }
    else if (i < 3 || i % 10 === 0) console.log(`call ${i + 2} at ${at()}: 200`)
    if (!refusedAt) await new Promise((res) => setTimeout(res, 1000))
  }
  if (!refusedAt) console.log('(a) NOT REFUSED within ~40 calls')

  console.log('--- M8: /user/info and /key/info until the user spend is non-zero (lag after call 1)')
  const callOneAt = Date.now()
  let lag: string | null = null
  for (let i = 0; i < 40 && !lag; i++) {
    const s = await userSpend('probe-agent-person')
    if ((s.userInfoSpend ?? 0) > 0) { lag = `${((Date.now() - callOneAt) / 1000).toFixed(1)}s after the loop above ended`; console.log('M8 after (a):', JSON.stringify(s), 'lag:', lag) }
    else await new Promise((res) => setTimeout(res, 1000))
  }
  if (!lag) console.log('M8: user spend still 0 after 40 s:', JSON.stringify(await userSpend('probe-agent-person')))
  const ki = await call('GET', `/key/info?key=${encodeURIComponent(a.key)}`)
  console.log('/key/info for probe-agent-1:', JSON.stringify({ status: ki.status, spend: get(ki.json, 'info', 'spend'), max_budget: get(ki.json, 'info', 'max_budget'), expires: get(ki.json, 'info', 'expires'), key_alias: get(ki.json, 'info', 'key_alias') }))

  console.log('--- (b) key probe-agent-2: duration 5s')
  const b = await newKey({ user_id: 'probe-agent-person', key_alias: 'probe-agent-2', duration: '5s', models: ['default-chat'] })
  console.log(JSON.stringify({ status: b.status, expires: b.expires }))
  const b1 = await chat(b.key)
  console.log(`immediately (${at()}):`, b1.status, b1.status === 200 ? '' : JSON.stringify(errShape(b1.json)))
  await new Promise((res) => setTimeout(res, 6500))
  const b2 = await chat(b.key)
  console.log(`after 6.5 s (${at()}):`, b2.status, JSON.stringify(b2.status === 200 ? 'ACCEPTED — not refused' : { body: errShape(b2.json) }))

  console.log("--- (c) /key/delete { key_aliases: ['probe-agent-1'] }")
  const c = await call('POST', '/key/delete', { key_aliases: ['probe-agent-1'] })
  console.log(JSON.stringify({ status: c.status, body: c.status === 200 ? c.json : errShape(c.json) }))
  const cInfo = await call('GET', `/key/info?key=${encodeURIComponent(a.key)}`)
  const cChat = await chat(a.key)
  console.log('after: /key/info', cInfo.status, '| chat with the deleted key', cChat.status, JSON.stringify(errShape(cChat.json)))

  console.log('--- (d) user probe-agent-person-d: max_budget 0.00001; key with max_budget 1 (higher than its user)')
  await newUser('probe-agent-person-d', 0.00001)
  const d = await newKey({ user_id: 'probe-agent-person-d', key_alias: 'probe-agent-d', duration: '300s', max_budget: 1, models: ['default-chat'] })
  const d1 = await chat(d.key)
  console.log(`call 1 (${at()}):`, d1.status)
  let dRefused = false
  for (let i = 0; i < 40 && !dRefused; i++) {
    const r = await chat(d.key)
    if (r.status !== 200) { dRefused = true; console.log(`call ${i + 2} (${at()}): REFUSED`, r.status, JSON.stringify(errShape(r.json))) }
    else await new Promise((res) => setTimeout(res, 1000))
  }
  if (!dRefused) console.log('(d) NOT REFUSED within ~40 calls')

  console.log("--- (e) key models ['default-chat-onprem'] calling default-chat, then default-chat-onprem")
  const e = await newKey({ user_id: 'probe-agent-person', key_alias: 'probe-agent-e', duration: '300s', models: ['default-chat-onprem'] })
  const e1 = await chat(e.key, 'default-chat')
  const e2 = await chat(e.key, 'default-chat-onprem')
  console.log('default-chat:', e1.status, JSON.stringify(errShape(e1.json)), '| default-chat-onprem:', e2.status)

  console.log('--- (f) an EMPTY models list: does it mean every model? (Read this first 5)')
  const f = await newKey({ user_id: 'probe-agent-person', key_alias: 'probe-agent-f', duration: '300s', models: [] })
  const f1 = await chat(f.key, 'default-chat-onprem-reasoning')
  console.log('empty list calling default-chat-onprem-reasoning:', f1.status)
} finally {
  const delKeys = keys.length ? await call('POST', '/key/delete', { keys }) : { status: 'none' }
  const delUsers = await call('POST', '/user/delete', { user_ids: users })
  const left = await Promise.all(users.map(async (id) => [id, (await call('GET', `/user/info?user_id=${id}`)).status]))
  console.log('cleanup:', JSON.stringify({ keysDeleted: keys.length, keyDeleteStatus: delKeys.status, userDeleteStatus: delUsers.status, userInfoAfter: Object.fromEntries(left) }))
}
