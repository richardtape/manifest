// [M1] What headless Chrome keeps (faculty-ready Task 1). Drives Chrome over CDP with Node 24's WebSocket.
// Needs m1-server.mjs on 7195/7196 and Chrome started with --remote-debugging-port=7194 (see m1-run.sh).
const enc = encodeURIComponent
const ORIGINS = {
  https: 'https://probe.manifest.internal:7196',
  'http-127': 'http://127.0.0.1:7195',
  'http-localhost': 'http://localhost:7195',
}
const S = {
  'S1 __Host- Secure Path=/': ['__Host-x=1; Secure; Path=/'],
  'S2 __Host- no Secure': ['__Host-x=1; Path=/'],
  'S3 __Host- with Domain=manifest.internal': ['__Host-x=1; Secure; Path=/; Domain=manifest.internal'],
  'S4 __Host- Path=/auth': ['__Host-x=1; Secure; Path=/auth'],
  'S7 plain name, control': ['manifest_session=1; Path=/'],
}
const CLEARS = {
  'S5 clear WITHOUT Secure': '__Host-x=; Path=/; Max-Age=0',
  'S6 clear WITH Secure': '__Host-x=; Secure; Path=/; Max-Age=0',
}
const version = await (await fetch('http://127.0.0.1:7194/json/version')).json()
const targets = await (await fetch('http://127.0.0.1:7194/json/list')).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map()
const events = []
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } else events.push(msg)
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Network.enable'); await send('Page.enable')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function go(url) { await send('Page.navigate', { url }); await sleep(700) }
async function jar() {
  const r = await send('Network.getAllCookies')
  return r.result.cookies.map((c) => `${c.name}=${c.value} domain=${c.domain} path=${c.path} secure=${c.secure}`).sort()
}
const out = [`chrome: ${version.Browser}`]
const line = (k, v) => out.push(`${k.padEnd(52)} ${v.length ? v.join(' | ') : '(none kept)'}`)
for (const [o, base] of Object.entries(ORIGINS)) {
  for (const [name, cookies] of Object.entries(S)) {
    await send('Network.clearBrowserCookies')
    await go(`${base}/set?${cookies.map((c) => `c=${enc(c)}`).join('&')}`)
    line(`[${o}] ${name}`, await jar())
  }
  for (const [name, clear] of Object.entries(CLEARS)) {
    await send('Network.clearBrowserCookies')
    await go(`${base}/set?c=${enc('__Host-x=1; Secure; Path=/')}`)
    const before = await jar()
    await go(`${base}/set?c=${enc(clear)}`)
    line(`[${o}] ${name} (before: ${before.length} kept)`, await jar())
  }
}
// Tossing from a sibling host, then what console.manifest.internal would be sent.
const evil = 'https://evil.manifest.internal:7196'
for (const [name, c] of Object.entries({
  'T1 sibling tosses plain manifest_session, Domain=': 'manifest_session=tossed; Domain=manifest.internal; Path=/',
  'T2 sibling tosses __Host-manifest_session, Domain=': '__Host-manifest_session=tossed; Secure; Path=/; Domain=manifest.internal',
  'T3 sibling tosses plain manifest_login, Path=/auth': 'manifest_login=tossed; Domain=manifest.internal; Path=/auth',
})) {
  await send('Network.clearBrowserCookies')
  await go(`${evil}/set?c=${enc(c)}`)
  const sent = await send('Network.getCookies', { urls: ['https://console.manifest.internal/v1/me', 'https://console.manifest.internal/auth/acs'] })
  line(`[toss] ${name} -> sent to console.`, sent.result.cookies.map((k) => `${k.name}=${k.value} domain=${k.domain} path=${k.path}`))
}
// The REAL edge: document.cookie on https://console.manifest.internal (a /v1 page; nothing is sent but GETs).
await send('Network.clearBrowserCookies')
await go('https://console.manifest.internal/v1/me')
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr })).result.result.value
for (const [name, js] of Object.entries({
  'E1 edge: JS sets __Host- Secure Path=/': `document.cookie='__Host-e1=1; Secure; Path=/'`,
  'E2 edge: JS sets __Host- without Secure': `document.cookie='__Host-e2=1; Path=/'`,
  'E3 edge: JS sets __Host- Path=/auth': `document.cookie='__Host-e3=1; Secure; Path=/auth'`,
})) { await evalJs(js); line(`[edge] ${name} (all __Host-e* now)`, (await jar()).filter((c) => c.startsWith('__Host-e'))) }
await evalJs(`document.cookie='__Host-e1=; Path=/; Max-Age=0'`)
line('[edge] E4 JS clears __Host-e1 WITHOUT Secure', (await jar()).filter((c) => c.startsWith('__Host-e1')))
await evalJs(`document.cookie='__Host-e1=; Secure; Path=/; Max-Age=0'`)
line('[edge] E5 JS clears __Host-e1 WITH Secure', (await jar()).filter((c) => c.startsWith('__Host-e1')))
console.log(out.join('\n'))
ws.close()
