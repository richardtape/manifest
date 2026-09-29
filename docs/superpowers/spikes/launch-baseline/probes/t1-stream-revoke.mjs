// Task 1, Step 3 — FE-33 on this machine: does a token's OPEN event stream outlive the token's revocation?
// Needs MANIFEST_SESSION (the instructor's manifest_session value, from the probe's cookie jar), PROJECT_ID and
// NODE_EXTRA_CA_CERTS=infra/ca/manifest-root.crt. Mints its own token (project:read, 1 day), revokes it, renames the
// project and renames it back. Prints frame TYPES and codes — never the token or the cookie.
const ORIGIN = 'https://console.manifest.internal'
const { MANIFEST_SESSION: session, PROJECT_ID: projectId } = process.env
if (!session || !projectId) throw new Error('MANIFEST_SESSION and PROJECT_ID are required')
const cookie = `manifest_session=${session}`
const say = (x) => { const s = typeof x === 'string' ? x : JSON.stringify(x); if (/mft_|sk-/.test(s) || s.includes(session)) throw new Error('refusing to print a credential'); console.log(s) }
const call = async (method, path, body) => {
  const headers = { cookie, origin: ORIGIN, 'idempotency-key': crypto.randomUUID() }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, json: await res.json().catch(() => undefined) }
}
const name = (await call('GET', `/v1/projects/${projectId}`)).json.name
const minted = await call('POST', `/v1/projects/${projectId}/tokens`, { name: 'probe-stream-revoke', capabilities: ['project:read'], expiresInDays: 1 })
say({ mint: minted.status, tokenId: minted.json?.token?.id ?? minted.json?.id })
const tokenId = minted.json?.token?.id ?? minted.json?.id
const secret = minted.json?.secret ?? minted.json?.token?.secret ?? minted.json?.plaintext
if (typeof secret !== 'string') { say({ mintAnswerFields: Object.keys(minted.json ?? {}) }); process.exit(1) }

const url = `wss://console.manifest.internal/v1/projects/${projectId}/events`
const frames = []
let closed = null
const ws = new WebSocket(url, { headers: { authorization: `Bearer ${secret}` } })
ws.onclose = (e) => { closed = { code: e.code, reason: e.reason, atMs: Date.now() } }
ws.onerror = (e) => say({ streamError: e.message ?? 'error' })
const ready = new Promise((resolve) => { ws.onmessage = (m) => { const f = JSON.parse(m.data); frames.push({ type: f.type, at: Date.now() }); if (f.type === 'manifest.stream.ready') resolve() } })
await Promise.race([ready, new Promise((_, r) => setTimeout(() => r(new Error('no ready frame in 10 s')), 10_000))])
say({ openedWith: 'the token', replayAndReady: frames.length })

const revokedAt = Date.now()
const revoke = await call('DELETE', `/v1/tokens/${tokenId}`)
say({ revoke: revoke.status, revokedAt: revoke.json?.revokedAt ?? null })
const rename = await call('PATCH', `/v1/projects/${projectId}`, { name: `${name} (probe rename)` })
say({ rename: rename.status })
await new Promise((r) => setTimeout(r, 30_000))
say({ after30s: { open: closed === null, closed, framesAfterRevoke: frames.filter((f) => f.at > revokedAt).map((f) => f.type) } })
ws.close()

// a NEW upgrade with the revoked token, and a GET of the same URL
const again = await new Promise((resolve) => {
  const w2 = new WebSocket(url, { headers: { authorization: `Bearer ${secret}` } })
  w2.onopen = () => { resolve({ opened: true }); w2.close() }
  w2.onclose = (e) => resolve({ opened: false, code: e.code })
  w2.onerror = () => {}
})
say({ newUpgradeWithRevokedToken: again })
const get = await fetch(`https://console.manifest.internal/v1/projects/${projectId}/events`, { headers: { authorization: `Bearer ${secret}` } })
say({ getWithRevokedToken: get.status, code: (await get.json().catch(() => ({})))?.error?.code })
say({ renameBack: (await call('PATCH', `/v1/projects/${projectId}`, { name })).status })
