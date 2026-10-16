/**
 * `make demo-admin`'s WALK — THE ADMINISTRATOR'S CONSOLE, HEADLESS, ON THE DEMO FLEET (P11's Task 12).
 *
 * Nine checks, each asserting the SHAPE of what an operator sees, never only that a page loaded: the
 * sign-in and the rail; the headline from our own band; the keyboard; a release approved through the
 * step-up and back; a registration submitted to UBC IAM; UBC's answer recorded and read back through the
 * API; the fleet filtered; a project's page and an agent's question rejected; Health and Settings. Then
 * the console itself: nothing on it but the lines this console is known to print.
 *
 * Raw CDP over Node 24's global `WebSocket` — no library. Chrome is started by `scripts/demo-admin.sh`
 * with `--remote-debugging-port=0` and the profile named in `DEMO_ADMIN_PROFILE`; its port is the one
 * the system gave, read back from the profile's `DevToolsActivePort` (Decision 17), never one in
 * 7100–7199. The console answers on `DEMO_ADMIN_ORIGIN` (7101), its mock behind it with
 * `MANIFEST_MOCK_FLEET=demo` and `MANIFEST_MOCK_STEP_UP=1`. The demo fleet keeps the walk's decisions
 * until the mock restarts, so a walk needs a fresh mock — the script starts one every time.
 *
 *   DEMO_ADMIN_PROFILE    Chrome's --user-data-dir (required)
 *   DEMO_ADMIN_SHOTS      where each check's screenshot goes (required)
 *   DEMO_ADMIN_STOP_AFTER 1–9: stop after that check (a negative control's short run)
 *   DEMO_ADMIN_ORIGIN     the console (default http://127.0.0.1:7101)
 *
 * Every text is read by `textContent`: the drawing uppercases overlines in CSS, and `innerText` returns
 * them so. Exit 0 only when every check that ran passed; each failure names its check.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ORIGIN = process.env.DEMO_ADMIN_ORIGIN ?? 'http://127.0.0.1:7101'
const PROFILE = process.env.DEMO_ADMIN_PROFILE
const SHOTS = process.env.DEMO_ADMIN_SHOTS
const STOP_AFTER = Number(process.env.DEMO_ADMIN_STOP_AFTER ?? '9')
if (PROFILE === undefined || SHOTS === undefined) {
  console.error(
    'walk: DEMO_ADMIN_PROFILE and DEMO_ADMIN_SHOTS are required — run it by make demo-admin',
  )
  process.exit(2)
}
if (!Number.isInteger(STOP_AFTER) || STOP_AFTER < 1 || STOP_AFTER > 9) {
  console.error(
    `walk: DEMO_ADMIN_STOP_AFTER is 1–9, not ${process.env.DEMO_ADMIN_STOP_AFTER}`,
  )
  process.exit(2)
}
mkdirSync(SHOTS, { recursive: true })

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── Chrome, over CDP ──────────────────────────────────────────────────────────────────────────

let port: string | undefined
for (let i = 0; i < 300 && port === undefined; i++) {
  const file = join(PROFILE, 'DevToolsActivePort')
  if (existsSync(file))
    port = readFileSync(file, 'utf8').split('\n')[0]?.trim() || undefined
  if (port === undefined) await sleep(100)
}
if (port === undefined) {
  console.error(`walk: Chrome wrote no DevToolsActivePort in ${PROFILE} within 30 s`)
  process.exit(2)
}
const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as {
  webSocketDebuggerUrl: string
}
const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

/** The parts of Chrome's answers this walk reads — each optional, as Chrome leaves out what is empty. */
interface CdpResult {
  targetId?: string
  sessionId?: string
  data?: string
  result?: { value?: unknown }
  exceptionDetails?: { text?: string; exception?: { description?: string } }
}
/** The parts of the three events this walk listens to. */
interface CdpEvent {
  type?: string
  args?: { value?: unknown; description?: string }[]
  exceptionDetails?: { text?: string; exception?: { description?: string } }
  entry?: { level?: string; text?: string; url?: string }
}
interface CdpMessage {
  id?: number
  method?: string
  params?: CdpEvent
  result?: CdpResult
  error?: unknown
}
let nextId = 1
const pending = new Map<
  number,
  { resolve: (r: CdpResult) => void; reject: (e: Error) => void }
>()
/** Everything the console said: its own `console.*`, an exception, and the browser's log (a failed load). */
const consoleLines: string[] = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(String(event.data)) as CdpMessage
  const p = msg.params ?? {}
  if (msg.id !== undefined && pending.has(msg.id)) {
    const waiter = pending.get(msg.id)!
    pending.delete(msg.id)
    if (msg.error !== undefined) waiter.reject(new Error(JSON.stringify(msg.error)))
    else waiter.resolve(msg.result ?? {})
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    if (p.type === 'error' || p.type === 'warning' || p.type === 'assert')
      consoleLines.push(
        `console.${p.type}: ${(p.args ?? []).map((a) => a.value ?? a.description).join(' ')}`,
      )
  } else if (msg.method === 'Runtime.exceptionThrown') {
    consoleLines.push(
      `exception: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`,
    )
  } else if (msg.method === 'Log.entryAdded') {
    const e = p.entry ?? {}
    if (e.level === 'error' || e.level === 'warning')
      consoleLines.push(`log.${e.level}: ${e.text} ${e.url ?? ''}`.trim())
  }
})
/** One CDP call; an answer that never comes is a failure naming the call, not a walk that hangs. */
const send = (
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
): Promise<CdpResult> =>
  new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Chrome did not answer ${method} within 30 s`))
    }, 30_000)
    pending.set(id, {
      resolve: (r) => (clearTimeout(timer), resolve(r)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId: session } = await send('Target.attachToTarget', {
  targetId,
  flatten: true,
})
/** A call to the walk's own page. */
const cdp = (method: string, params: Record<string, unknown> = {}) =>
  send(method, params, session)
await cdp('Page.enable')
await cdp('Runtime.enable')
await cdp('Log.enable')
await cdp('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
})

async function evaluate<T = unknown>(expression: string): Promise<T> {
  const r = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result?.value as T
}
const js = (v: unknown) => JSON.stringify(v)

/** True once `expression` is truthy in the page, false after `ms`. */
async function until(expression: string, ms = 15_000): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (await evaluate<boolean>(`!!(${expression})`)) return true
    } catch {
      // A navigation between two reads destroys the context the expression ran in: ask again.
    }
    await sleep(150)
  }
  return false
}
async function go(path: string): Promise<void> {
  await cdp('Page.navigate', { url: ORIGIN + path })
  await until('document.readyState === "complete"')
}
async function key(k: 'j' | 'k' | 'Enter' | 'Escape'): Promise<void> {
  const codes = {
    j: { code: 'KeyJ', text: 'j', windowsVirtualKeyCode: 74 },
    k: { code: 'KeyK', text: 'k', windowsVirtualKeyCode: 75 },
    Enter: { code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 },
    Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
  }[k]
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, ...codes })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, ...codes })
}
const mainText = () =>
  evaluate<string>('document.querySelector("main")?.textContent ?? ""')
const paneText = () =>
  evaluate<string>('document.getElementById("pane")?.textContent ?? ""')
/**
 * What the screen shows instead, for a failure's line: the refusal `<Refusal>` drew (its code first),
 * or the start of the pane.
 */
const shown = async () => {
  const refused = await evaluate<string[]>(
    '[...document.querySelectorAll(".refusal")].map((r) => r.textContent)',
  )
  return refused.length > 0
    ? `the screen shows the refusal "${refused.join(' | ').slice(0, 240)}"`
    : `the pane reads "${(await paneText()).slice(0, 200)}"`
}
/** A button by its exact words: 'clicked', 'disabled', or 'none'. */
const press = (label: string, within = 'document') =>
  evaluate<'clicked' | 'disabled' | 'none'>(`(() => {
    const b = [...${within}.querySelectorAll('button')].find((x) => x.textContent.trim() === ${js(label)})
    if (!b) return 'none'
    if (b.disabled) return 'disabled'
    b.click()
    return 'clicked'
  })()`)
/** A button by its exact words, read and NOT pressed: 'enabled', 'disabled', or 'none'. */
const button = (label: string) =>
  evaluate<'enabled' | 'disabled' | 'none'>(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${js(label)})
    return !b ? 'none' : b.disabled ? 'disabled' : 'enabled'
  })()`)
/** A text field's value set as a person's typing sets it, so React's onChange runs. */
const fill = (selector: string, value: string) =>
  evaluate<boolean>(`(() => {
    const el = document.querySelector(${js(selector)})
    if (!el) return false
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${js(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
const click = (selector: string) =>
  evaluate<boolean>(`(() => {
    const el = document.querySelector(${js(selector)})
    if (!el) return false
    el.click()
    return true
  })()`)
/** The API, asked from the page — the console's own origin and session, through the same proxy. */
const api = <T>(path: string) =>
  evaluate<T>(`fetch(${js(path)}).then((r) => r.ok ? r.json() : { status: r.status })`)
const bandSlugs = (band: 'Waiting on us' | 'Waiting on UBC') =>
  evaluate<string[]>(
    `[...document.querySelectorAll('section.mfa-band[aria-label=${js(band)}] .mfa-row__slug')].map((s) => s.textContent)`,
  )
async function shot(name: string): Promise<void> {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SHOTS!, `${name}.png`), Buffer.from(data ?? '', 'base64'))
}

// ── What the walk knows without the console: the API, and the words for an age ────────────────

interface QueueItem {
  kind: string
  subjectId: string
  since: string
  environment?: string | null
  project: { id: string; slug: string }
  requestedBy: { id: string } | null
}
interface Queue {
  items: QueueItem[]
  oldestSince: string | null
  truncated: boolean
}
interface FleetProject {
  id: string
  slug: string
  archivedAt: string | null
  environments: { kind: string; state: string | null; instances: number }[]
}
/**
 * WHO HOLDS EACH KIND'S WAIT, as the published document's `QueueItem.kind` reads: an administrator
 * (*"Waiting on us"*), or UBC (IAM, or the Privacy Office). Written here, not imported from the console,
 * so the console's own table is what is checked. A kind this map lacks fails check 2 by name.
 */
const HOLDER: Record<string, 'us' | 'ubc'> = {
  'release-approval': 'us',
  'iam-registration-to-submit': 'us',
  'iam-change-to-file': 'us',
  'privacy-assessment-to-submit': 'us',
  'iam-registration': 'ubc',
  'iam-change-request': 'ubc',
  'privacy-assessment': 'ubc',
}
/** *"3 days, 4 hours"*: the two largest units, the second only when it is not zero — the drawing's. */
function ageWords(fromIso: string, now: number): string {
  const ms = now - Date.parse(fromIso)
  if (ms < 0) return 'today'
  if (ms < 60_000) return 'under a minute'
  const parts: [number, string][] = [
    [Math.floor(ms / 86_400_000), 'day'],
    [Math.floor(ms / 3_600_000) % 24, 'hour'],
    [Math.floor(ms / 60_000) % 60, 'minute'],
  ]
  const first = parts.findIndex(([n]) => n > 0)
  const said = ([n, unit]: [number, string]) => `${n} ${unit}${n === 1 ? '' : 's'}`
  const next = parts[first + 1]
  return next !== undefined && next[0] > 0
    ? `${said(parts[first]!)}, ${said(next)}`
    : said(parts[first]!)
}
const VANCOUVER_DAY = new Intl.DateTimeFormat('en-CA', {
  dateStyle: 'long',
  timeZone: 'America/Vancouver',
})

// ── The checks ────────────────────────────────────────────────────────────────────────────────

/** Each check collects what it found wrong; an empty list is a pass. */
type Check = (wrong: (what: string) => void) => Promise<void>
const results: { n: number; name: string; wrong: string[] }[] = []
const REASON =
  'The egress change is in the privacy assessment; Mathematics IT checked it.'
const REJECTION = 'Ask Dr. Moreno first — the lab groups are hers.'

const checks: [string, Check][] = [
  [
    'signs in, lands on /queue, the rail names the operator, and moves without a reload',
    async (wrong) => {
      await go('/')
      if (!(await until('document.querySelector(".mfa-rail")', 20_000))) {
        const said =
          (await mainText()) || (await evaluate<string>('document.body.textContent'))
        wrong(`no rail after signing in — the page says: "${said.trim().slice(0, 160)}"`)
        return
      }
      const path = await evaluate<string>('location.pathname')
      if (path !== '/queue') wrong(`the URL is ${path}, not /queue`)
      const who = await evaluate<string>(
        'document.querySelector(".mf-rail__who")?.textContent',
      )
      const role = await evaluate<string>(
        'document.querySelector(".mfa-rail__role")?.textContent',
      )
      if (who !== 'Operator One' || role !== 'Platform administrator')
        wrong(
          `the rail names "${who} · ${role}", not "Operator One · Platform administrator"`,
        )
      await evaluate('window.__walkStayed = "kept"')
      if (!(await click('.mfa-rail a[href="/fleet"]'))) wrong('no Fleet in the rail')
      if (!(await until('document.querySelector("main table")')))
        wrong('the rail’s Fleet drew no table')
      if (!(await click('.mfa-rail a[href="/queue"]'))) wrong('no Queue in the rail')
      await until('document.querySelector(".mfa-head")')
      if ((await evaluate('window.__walkStayed')) !== 'kept')
        wrong('the rail reloaded the page (in-app navigation must not)')
      if ((await evaluate<string>('location.pathname')) !== '/queue')
        wrong('the rail’s Queue did not come back to /queue')
    },
  ],
  [
    'the headline is our band’s oldest wait, not UBC’s; the people; both bands as the API counts them',
    async (wrong) => {
      // Each check opens its own page, so one that fails leaves the next its own start.
      await go('/queue')
      await until('document.querySelector(".mfa-head__age")')
      const queue = await api<Queue>('/v1/queue')
      const unknown = queue.items.filter((i) => HOLDER[i.kind] === undefined)
      if (unknown.length > 0)
        wrong(`kinds the walk does not know: ${unknown.map((i) => i.kind)}`)
      const us = queue.items
        .filter((i) => HOLDER[i.kind] === 'us')
        .sort((a, b) => Date.parse(a.since) - Date.parse(b.since))
      const ubc = queue.items.filter((i) => HOLDER[i.kind] === 'ubc')
      const oldest = us[0]
      if (oldest?.project.slug !== 'reading-responses')
        wrong(
          `our band's oldest is ${oldest?.project.slug}, not reading-responses (the demo fleet moved)`,
        )
      const age = await evaluate<string>(
        'document.querySelector(".mfa-head__age")?.textContent ?? ""',
      )
      const now = Date.now()
      // The minute can turn between the read and the reckoning: either side of it is the same wait.
      const ours = [ageWords(oldest!.since, now - 60_000), ageWords(oldest!.since, now)]
      if (!ours.some((w) => age.includes(w)))
        wrong(`the headline reads "${age}", not reading-responses' ${ours[1]}`)
      if (queue.oldestSince !== null) {
        const theirs = ageWords(queue.oldestSince, now)
        if (age.includes(theirs))
          wrong(`the headline reads oldestSince's ${theirs} — UBC's wait`)
      }
      const people = new Set(us.map((i) => i.requestedBy?.id ?? null)).size
      const stat = await evaluate<string[]>(
        '[...document.querySelectorAll(".mfa-head__stat")].map((s) => s.textContent)',
      )
      if (!stat.some((s) => s.startsWith(String(people)) && /people|person/.test(s)))
        wrong(`the people waiting read ${js(stat)}, not ${people}`)
      if (people !== 5) wrong(`${people} people wait on us, not the demo fleet's 5`)
      const usRows = await bandSlugs('Waiting on us')
      const ubcRows = await bandSlugs('Waiting on UBC')
      if (usRows.length !== us.length)
        wrong(`our band draws ${usRows.length} rows, the API ${us.length}`)
      if (ubcRows.length !== ubc.length)
        wrong(`UBC's band draws ${ubcRows.length} rows, the API ${ubc.length}`)
      if (js(usRows) !== js(us.map((i) => i.project.slug)))
        wrong(`our band is not oldest first: ${js(usRows)}`)
    },
  ],
  [
    'j j Enter opens the second row of our band, its URL the item’s',
    async (wrong) => {
      await go('/queue')
      await until('document.querySelector(".mfa-head__age")')
      const queue = await api<Queue>('/v1/queue')
      const second = queue.items
        .filter((i) => HOLDER[i.kind] === 'us')
        .sort((a, b) => Date.parse(a.since) - Date.parse(b.since))[1]!
      await evaluate('document.activeElement?.blur()')
      await key('j')
      await key('j')
      await key('Enter')
      const want = `/queue/${second.kind}/${second.subjectId}`
      if (!(await until(`location.pathname === ${js(want)}`, 5_000)))
        wrong(`the URL is ${await evaluate('location.pathname')}, not ${want}`)
      if (
        !(await until(
          `document.getElementById("pane")?.textContent.includes(${js(second.project.slug)})`,
        ))
      )
        wrong(`the pane does not name ${second.project.slug}`)
      const on = await evaluate<string>(
        'document.querySelector(".mfa-row--on .mfa-row__slug")?.textContent',
      )
      if (on !== second.project.slug)
        wrong(`the selected row is ${on}, not ${second.project.slug}`)
      await key('Escape')
    },
  ],
  [
    'reading-responses: asked through its agent, the preview’s diff, approved through the step-up and back',
    async (wrong) => {
      const queue = await api<Queue>('/v1/queue')
      const item = queue.items.find((i) => i.project.slug === 'reading-responses')
      if (item === undefined) return wrong('reading-responses is not in the queue')
      const id = item.subjectId
      await go(`/releases/${id}/approval`)
      if (
        !(await until(
          `document.getElementById("pane")?.textContent.includes("the agent that builds this app")`,
        ))
      )
        wrong(
          'the request does not name the token it came through, “the agent that builds this app”',
        )
      if ((await button('Approve for production')) !== 'none')
        wrong('Approve is offered before the preview')
      if ((await press('Take the preview')) !== 'clicked')
        return wrong('no Take the preview')
      if (!(await until('document.querySelector(".mfa-diff__meta")')))
        return wrong('the preview drew no diff')
      const changes = await evaluate<string[]>(
        '[...document.querySelectorAll(".mfa-diff__change")].map((c) => c.textContent)',
      )
      if (changes.length !== 2)
        wrong(`the diff shows ${changes.length} sensitive changes, not 2`)
      if ((await button('Reject')) !== 'disabled')
        wrong('Reject is pressable before a reason is written')
      if (!(await fill(`#reason-${id}`, REASON)))
        return wrong(`no reason field #reason-${id}`)
      await shot('4a-previewed')
      if ((await press('Approve for production')) !== 'clicked')
        return wrong('Approve not pressable')
      // The mock answers 403 STEP_UP_REQUIRED; the console leaves for the step-up and comes back.
      if (!(await until(`location.search.includes("preview=")`, 20_000)))
        return wrong(
          `not back on the preview after the step-up: ${await evaluate('location.href')}`,
        )
      if (
        !(await until(`document.querySelector("#reason-${id}")?.value === ${js(REASON)}`))
      )
        wrong('the reason was not kept across the step-up')
      if (!(await until('document.querySelector(".mfa-diff__meta")')))
        wrong('the preview was not restored after the step-up')
      if ((await press('Approve for production')) !== 'clicked')
        return wrong('Approve not pressable after the step-up')
      const decided = 'Operator One approved this release for production.'
      if (
        !(await until(
          `document.getElementById("pane")?.textContent.includes(${js(decided)})`,
        ))
      )
        wrong(`no “${decided}” — ${await shown()}`)
      await shot('4b-approved')
      // The 60-second read, asked now: the row is gone.
      await go('/queue')
      await until('document.querySelector(".mfa-head__age")')
      if ((await bandSlugs('Waiting on us')).includes('reading-responses'))
        wrong('reading-responses is still waiting on us')
      // The team's email links the release: opened after the decision, it says who decided, and offers nothing.
      await go(`/releases/${id}/approval`)
      const elsewhere = `Operator One approved this on ${VANCOUVER_DAY.format(new Date())}.`
      if (
        !(await until(
          `document.getElementById("pane")?.textContent.includes(${js(elsewhere)})`,
        ))
      )
        wrong(`the emailed link to the decided release does not say “${elsewhere}”`)
      if (!(await paneText()).includes(REASON))
        wrong('the decided release does not quote the reason')
      if ((await button('Approve for production')) !== 'none')
        wrong('the decided release offers a second decision')
    },
  ],
  [
    'phys-101-labs: submitted to UBC IAM with its ticket, and moved to UBC’s band',
    async (wrong) => {
      await go('/queue')
      await until('document.querySelector(".mfa-head__age")')
      const queue = await api<Queue>('/v1/queue')
      const item = queue.items.find((i) => i.project.slug === 'phys-101-labs')
      if (item === undefined) return wrong('phys-101-labs is not in the queue')
      if (!(await click(`[id="row-${item.kind}:${item.subjectId}"]`)))
        return wrong('no row for phys-101-labs')
      if (!(await until(`document.getElementById("ticket-${item.subjectId}")`)))
        return wrong('the team’s pane has no ticket field')
      if ((await button('Submit to UBC IAM')) !== 'disabled')
        wrong('Submit is pressable without UBC’s ticket')
      await fill(`#ticket-${item.subjectId}`, 'IAM-2026-0612')
      if ((await press('Submit to UBC IAM')) !== 'clicked')
        return wrong('Submit not pressable')
      if (
        !(await until(
          `document.getElementById("pane")?.textContent.includes("Submitted to UBC IAM")`,
        ))
      )
        wrong(`no “Submitted to UBC IAM” — ${await shown()}`)
      if (
        !(await until(
          `[...document.querySelectorAll('section.mfa-band[aria-label="Waiting on UBC"] .mfa-row__slug')].some((s) => s.textContent === "phys-101-labs")`,
        ))
      )
        wrong('phys-101-labs did not move to Waiting on UBC')
      if ((await bandSlugs('Waiting on us')).includes('phys-101-labs'))
        wrong('phys-101-labs is still waiting on us')
      const records = await api<{
        iamRegistration: { state: string; externalTicketRef: string }
      }>(`/v1/projects/${item.project.id}/launch-records`)
      if (
        records.iamRegistration?.state !== 'submitted' ||
        records.iamRegistration.externalTicketRef !== 'IAM-2026-0612'
      )
        wrong(
          `the platform holds ${js(records.iamRegistration && { state: records.iamRegistration.state, ref: records.iamRegistration.externalTicketRef })}`,
        )
    },
  ],
  [
    'stats-sim: UBC’s answer recorded on STAGING, read back through the API — production untouched',
    async (wrong) => {
      await go('/queue')
      await until('document.querySelector(".mfa-head__age")')
      const queue = await api<Queue>('/v1/queue')
      const item = queue.items.find((i) => i.project.slug === 'stats-sim')
      if (item === undefined) return wrong('stats-sim is not in the queue')
      if (item.environment !== 'staging')
        wrong(`stats-sim's item is ${item.environment}'s, not staging's`)
      type Reg = {
        state: string
        entityId: string
        acsUrl: string
        sloUrl: string | null
        registeredAttributes: string[]
        certFingerprint: string | null
      }
      type Records = { iamRegistration: Reg | null; stagingRegistration: Reg | null }
      const path = `/v1/projects/${item.project.id}/launch-records`
      const before = await api<Records>(path)
      if (!(await click(`[id="row-${item.kind}:${item.subjectId}"]`)))
        return wrong('no row for stats-sim')
      if (!(await until(`document.getElementById("registered-${item.subjectId}")`)))
        return wrong(
          'the answer form has no attributes field (active not the answer offered?)',
        )
      const form = await evaluate<{ registered: string; fp: string }>(`({
        registered: document.getElementById("registered-${item.subjectId}").value,
        fp: document.getElementById("fp-${item.subjectId}")?.value ?? '',
      })`)
      await shot('6a-answer')
      if ((await press('Record it')) !== 'clicked')
        return wrong('Record it not pressable')
      if (
        !(await until(
          `document.getElementById("pane")?.textContent.includes("Recorded as active")`,
        ))
      )
        wrong(`no “Recorded as active” — ${await shown()}`)
      await sleep(500)
      if ((await bandSlugs('Waiting on UBC')).includes('stats-sim'))
        wrong('stats-sim is still in UBC’s band')
      const after = await api<Records>(path)
      const s = after.stagingRegistration
      const b = before.stagingRegistration!
      if (s?.state !== 'active')
        wrong(`staging's registration is ${s?.state}, not active`)
      if (s?.entityId !== b.entityId || s?.acsUrl !== b.acsUrl || s?.sloUrl !== b.sloUrl)
        wrong(
          `staging's entity, ACS or SLO changed: ${js(s && [s.entityId, s.acsUrl, s.sloUrl])}`,
        )
      const sent = form.registered.split(/[\s,]+/).filter((a) => a !== '')
      if (sent.length === 0 || js(s?.registeredAttributes) !== js(sent))
        wrong(`registered ${js(s?.registeredAttributes)}, the form sent ${js(sent)}`)
      if (form.fp === '' || s?.certFingerprint !== form.fp)
        wrong(
          `the certificate is ${s?.certFingerprint}, the form sent ${form.fp || 'none'}`,
        )
      if (js(after.iamRegistration) !== js(before.iamRegistration))
        wrong(`production's registration moved: ${js(after.iamRegistration)}`)
    },
  ],
  [
    'the fleet in production: the launched apps only; econ-101-polls’ set and its Incident since the deploy',
    async (wrong) => {
      await go('/fleet?prod=1')
      if (!(await until('document.querySelector("main tbody tr")')))
        return wrong('the fleet drew no rows')
      const fleet = await api<FleetProject[]>('/v1/fleet')
      const launched = fleet
        .filter((p) => p.archivedAt === null)
        .filter((p) =>
          p.environments.some((e) => e.kind === 'production' && e.state !== null),
        )
        .map((p) => p.slug)
        .sort()
      const shown = (
        await evaluate<string[]>(
          '[...document.querySelectorAll("main tbody .mfa-slugbtn")].map((a) => a.textContent)',
        )
      ).sort()
      if (js(shown) !== js(launched))
        wrong(`in production shows ${js(shown)}, the API ${js(launched)}`)
      if (launched.length !== 6)
        wrong(`${launched.length} apps are in production, not the demo fleet's 6`)
      // econ-101-polls' production cell, found by its column's heading: its state, the set the Fleet
      // answers (2 — sitting 2's F1 and F5, as Task 9 decided), and an Incident after its last deploy.
      const econ = await evaluate<{
        cls: string
        state: string
        n: string
        inc: string
      } | null>(`(() => {
        const table = document.querySelector("main table")
        const col = [...table.querySelectorAll("thead th")].findIndex((th) => th.textContent.trim().startsWith("Production"))
        const row = [...table.querySelectorAll("tbody tr")].find((r) => r.textContent.includes("econ-101-polls"))
        const cell = row?.children[col]?.querySelector(".mfa-env")
        return cell ? {
          cls: cell.className,
          state: [...cell.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE).map((c) => c.textContent).join(""),
          n: cell.querySelector(".mfa-env__n")?.textContent ?? "",
          inc: cell.querySelector(".mfa-env__inc")?.textContent ?? "",
        } : null
      })()`)
      if (econ === null) wrong('no production cell for econ-101-polls')
      else {
        // `healthy` is drawn in the steady state's colour (the five states, `20-states.md`).
        if (
          econ.state !== 'healthy' ||
          !econ.cls.includes('mfa-env--steady') ||
          econ.n !== '· 2'
        )
          wrong(
            `econ-101-polls' production is "${econ.state} ${econ.n}" (${econ.cls}), not healthy · 2, steady`,
          )
        if (!/^failed \d+m ago$/.test(econ.inc))
          wrong(
            `econ-101-polls' production shows no Incident since its deploy ("${econ.inc}")`,
          )
      }
    },
  ],
  [
    'bio-201-scheduler: an administrator’s event with its reason; the agent’s question rejected for them',
    async (wrong) => {
      // Read here, not borrowed from check 7: a check that fails must not take the next one with it.
      const id = (await api<FleetProject[]>('/v1/fleet')).find(
        (p) => p.slug === 'bio-201-scheduler',
      )?.id
      if (id === undefined) return wrong('no id for bio-201-scheduler')
      await go(`/projects/${id}`)
      if (!(await until('document.querySelector(".mfa-ev__who--admin")')))
        return wrong('no event signed by a platform administrator')
      const signed = await evaluate<string>(
        'document.querySelector(".mfa-ev__who--admin")?.closest(".mfa-ev")?.textContent ?? ""',
      )
      if (
        !signed.includes('Operator One · as a platform administrator') ||
        !signed.includes('The course code changed this term')
      )
        wrong(`the administrator's event reads "${signed.slice(0, 200)}"`)
      const [question] = await api<{ id: string; state: string }[]>(
        `/v1/projects/${id}/pending-actions`,
      )
      if (question?.state !== 'pending')
        return wrong(`bio-201-scheduler's question is ${question?.state}`)
      if ((await button('Reject for them')) !== 'disabled')
        wrong('Reject is pressable without a reason')
      if (!(await fill(`#reason-${question.id}`, REJECTION)))
        return wrong('no reason field for the question')
      if ((await press('Reject for them')) !== 'clicked')
        return wrong('Reject not pressable')
      if (
        !(await until(
          'document.querySelector("main")?.textContent.includes("Refused for them")',
        ))
      )
        wrong(`no “Refused for them” — ${await shown()}`)
      const [after] = await api<{ state: string; reason: string }[]>(
        `/v1/projects/${id}/pending-actions`,
      )
      if (after?.state !== 'rejected' || after.reason !== REJECTION)
        wrong(
          `the platform holds ${js(after && { state: after.state, reason: after.reason })}`,
        )
      if (
        !(await until(
          `[...document.querySelectorAll(".mfa-ev")].some((li) => li.textContent.includes("pending_action.rejected") && li.querySelector(".mfa-ev__who--admin") && li.textContent.includes(${js(REJECTION)}))`,
          8_000,
        ))
      )
        wrong(
          'the rejection is not on the events, signed as an administrator with its reason',
        )
    },
  ],
  [
    'Health: math-oh-queue’s certificate red, an exit stopped first; Settings: the blueprints, every other value an admission',
    async (wrong) => {
      await go('/health')
      if (
        !(await until(
          'document.querySelector("main")?.textContent.includes("Read just now from")',
          20_000,
        ))
      )
        return wrong('Health did not finish reading')
      const red = await evaluate<string>(
        'document.querySelector(".mfa-days--red")?.closest("li")?.textContent ?? ""',
      )
      if (!red.includes('math-oh-queue'))
        wrong(`the red certificate is "${red.slice(0, 120)}", not math-oh-queue's`)
      const first = await evaluate<string>(
        '[...document.querySelectorAll(".mfa-panel")][1]?.querySelector(".mfa-panel__item")?.textContent ?? ""',
      )
      if (!first.includes('econ-101-polls') || !first.includes('exit_stopped'))
        wrong(
          `the first Incident is "${first.slice(0, 160)}", not econ-101-polls' exit_stopped`,
        )
      await shot('9a-health')
      await go('/settings')
      if (!(await until('document.querySelector(".mfa-set__value")')))
        return wrong('Settings drew no values')
      const values = await evaluate<string[]>(
        '[...document.querySelectorAll(".mfa-set__value")].map((v) => v.textContent)',
      )
      const admitted = values.filter((v) => v === 'Manifest can’t read this yet.').length
      if (admitted !== values.length - 1)
        wrong(`${values.length - 1 - admitted} values claim to be read`)
      if (!(await mainText()).includes('node-ts-mongo@1'))
        wrong('the blueprints are not listed')
    },
  ],
]

/**
 * WHAT THIS CONSOLE IS KNOWN TO PRINT, and why — anything else on the console fails the walk:
 * the session read before signing in (`/v1/me` answers 401 — the administrator's gate working); the
 * page's icon (the console has none: `/favicon.ico` answers 404); the step-up (the approval answers 403
 * STEP_UP_REQUIRED, then the round trip); and a project's socket closed before it opened — React's
 * StrictMode closes the first in `vite dev`, and the page leaving for the step-up can close one in either.
 */
const EXPECTED: RegExp[] = [
  /status of 401 .*\/v1\/me$/,
  /status of 404 .*\/favicon\.ico$/,
  /status of 403 .*\/v1\/releases\/[0-9a-f-]+\/approve$/,
  /WebSocket is closed before the connection is established/,
]

let n = 0
for (const [name, run] of checks) {
  n++
  const wrong: string[] = []
  try {
    await run((what) => wrong.push(what))
  } catch (e) {
    wrong.push(`threw: ${(e as Error).message.split('\n')[0]}`)
  }
  try {
    await shot(`${n}-${wrong.length === 0 ? 'pass' : 'fail'}`)
  } catch {
    // A screenshot is evidence, not a check.
  }
  results.push({ n, name, wrong })
  console.log(`${wrong.length === 0 ? 'PASS' : 'FAIL'} ${n}. ${name}`)
  for (const w of wrong) console.log(`       ✗ ${w}`)
  if (n === STOP_AFTER) break
}

const unexpected = consoleLines.filter((l) => !EXPECTED.some((re) => re.test(l)))
console.log(
  `${unexpected.length === 0 ? 'PASS' : 'FAIL'} console: ${consoleLines.length} line(s), ${unexpected.length} unexpected`,
)
for (const l of consoleLines)
  console.log(`       ${unexpected.includes(l) ? '✗' : '·'} ${l}`)

ws.close()
const failed = results.filter((r) => r.wrong.length > 0)
if (failed.length > 0 || unexpected.length > 0) {
  console.log(
    `walk: ${failed.length} of ${results.length} checks failed${failed.length > 0 ? ` (${failed.map((r) => r.n).join(', ')})` : ''}${unexpected.length > 0 ? `; ${unexpected.length} unexpected console line(s)` : ''} — screenshots in ${SHOTS}`,
  )
  process.exit(1)
}
console.log(
  `walk: ${results.length} of ${results.length} checks passed — screenshots in ${SHOTS}`,
)
