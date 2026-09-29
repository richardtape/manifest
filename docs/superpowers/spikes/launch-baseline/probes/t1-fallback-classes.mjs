// Task 1, Step 4(a) — which provider errors LiteLLM 1.98.0's GENERAL fallback answers.
// Needs the stub (t1-stub-provider.mjs) on 127.0.0.1:7199 and LITELLM_MASTER_KEY in the environment. For each
// status it registers probe-fb-<case> (openai/stub at the stub's /s<status>), a general fallback to default-chat,
// then calls it with one probe key holding every probe name. Prints status, x-litellm-attempted-fallbacks and the
// answering model. Removes every model, fallback, key and user it made, in a finally. Never prints a key.
const BASE = 'http://127.0.0.1:7106'
const MASTER = process.env.LITELLM_MASTER_KEY
if (!MASTER) throw new Error('LITELLM_MASTER_KEY is not set')
const STUB = 'http://host.docker.internal:7199'
const CASES = [
  ['400', `${STUB}/s400/v1`], ['401', `${STUB}/s401/v1`], ['403', `${STUB}/s403/v1`], ['404', `${STUB}/s404/v1`],
  ['408', `${STUB}/s408/v1`], ['422', `${STUB}/s422/v1`], ['429', `${STUB}/s429/v1`], ['500', `${STUB}/s500/v1`],
  ['502', `${STUB}/s502/v1`], ['503', `${STUB}/s503/v1`], ['slow', `${STUB}/slow/v1`], ['refused', 'http://host.docker.internal:7198/v1'],
  ['ok', `${STUB}/ok/v1`],
]
let key
const say = (x) => { const s = typeof x === 'string' ? x : JSON.stringify(x); if ((key && s.includes(key)) || s.includes(MASTER) || /sk-[A-Za-z0-9]{8}/.test(s)) throw new Error('refusing to print a key'); console.log(s) }
const admin = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${MASTER}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text(); let json; try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}
const ids = []
try {
  for (const [c, apiBase] of CASES) {
    const id = `probe-fb-${c}-${crypto.randomUUID()}`
    const made = await admin('POST', '/model/new', { model_name: `probe-fb-${c}`, litellm_params: { model: 'openai/stub', api_base: apiBase, api_key: 'probe', timeout: 5, num_retries: 0, input_cost_per_token: 0.000001, output_cost_per_token: 0.000001 }, model_info: { id } })
    ids.push({ c, id })
    const fb = await admin('POST', '/fallback', { model: `probe-fb-${c}`, fallback_models: ['default-chat'], fallback_type: 'general' })
    say({ case: c, modelNew: made.status, fallback: fb.status })
  }
  await admin('POST', '/user/new', { user_id: 'probe-fb-person', max_budget: 0.05, budget_duration: '1mo', auto_create_key: false })
  const gen = await admin('POST', '/key/generate', { user_id: 'probe-fb-person', key_alias: 'probe-fb-key', models: CASES.map(([c]) => `probe-fb-${c}`), duration: '15m', max_budget: 0.02, allowed_routes: ['/v1/chat/completions', '/v1/embeddings', '/v1/models'] })
  key = gen.json.key
  say({ keyGenerate: gen.status })
  for (const [c] of CASES) {
    const t0 = Date.now()
    const res = await fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: `probe-fb-${c}`, messages: [{ role: 'user', content: 'Answer with the one word: ok' }], max_tokens: 5 }) })
    const text = await res.text(); let j; try { j = JSON.parse(text) ?? {} } catch { j = { error: { message: `not JSON: ${text.slice(0, 100)}` } } }
    say({ case: c, status: res.status, ms: Date.now() - t0, attemptedFallbacks: res.headers.get('x-litellm-attempted-fallbacks'), attemptedRetries: res.headers.get('x-litellm-attempted-retries'), model: j.model ?? null, bodyWasNull: text === 'null', errorType: j.error?.type ?? null, errorCode: j.error?.code ?? null, message: String(j.error?.message ?? '').slice(0, 140) })
  }
} finally {
  for (const { c, id } of ids) {
    const f = await admin('DELETE', `/fallback/probe-fb-${c}?fallback_type=general`)
    const d = await admin('POST', '/model/delete', { id })
    say({ cleanup: c, fallbackDelete: f.status, modelDelete: d.status })
  }
  say({ keyDelete: (await admin('POST', '/key/delete', { key_aliases: ['probe-fb-key'] })).status, userDelete: (await admin('POST', '/user/delete', { user_ids: ['probe-fb-person'] })).status })
}
