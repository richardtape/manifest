import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, expect, it } from 'vitest'
import pg from 'pg'
import { describeDocker, REPO_ROOT } from '../runtime/testing.js'
import { deleteSpRow } from '../sso/index.js'
import { idpDatabaseUrl } from '../sso/testing.js'

const run = promisify(execFile)

/**
 * The platform CA, passed EXPLICITLY on every https request.
 *
 * `NODE_EXTRA_CA_CERTS` is what `.env` uses and what the README exports, and it
 * cannot work here: Node reads it once at process START, so a test setup file
 * setting it runs far too late. S7's finding is the reason it is needed at all —
 * a host Node process ignores the macOS keychain, so the edge's certificate is
 * untrusted even though `curl` and the browser accept it. Measured here on
 * 2026-09-09 as `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` on the second hop, with the
 * first hop green.
 *
 * `ca`, never `rejectUnauthorized: false`: a probe that skips verification
 * passes against the wrong certificate, which is the failure P3 Task 14 paid for.
 */
const CA = readFileSync(join(REPO_ROOT, 'infra/ca/manifest-root.crt'))

/**
 * THIS TEST REGISTERS ITS OWN SERVICE PROVIDER, NOT THE PLATFORM'S.
 *
 * `MANIFEST_SP_ENTITY_BASE` is what §9's entityID is built from, so overriding
 * it gives this run an entityID of its own and the shared row is never touched.
 * That matters because the row is a BOOT artefact keyed on one entityID and
 * this test boots on a port of its own: writing the shared row would leave a
 * developer's running control plane registered at a port nothing listens on —
 * a login that completes at the IdP and dies on the redirect back, which reads
 * as an IdP fault. Deleting it afterwards was the first answer and is worse in
 * its own way: it takes the developer's login away until they restart.
 *
 * Nothing is weakened by the override. The entityID is opaque to SAML, the row
 * still goes through `renderSpMetadata`, the IdP still reads it, and the login
 * still proves that what the platform WRITES and what it SENDS describe one
 * Service Provider. That the DEFAULT base produces the documented entityID is a
 * pure function, asserted in `sso/platform.test.ts`.
 */
const TEST_ENTITY_BASE = 'https://test-suite.manifest.internal'
const TEST_ENTITY_ID = `${TEST_ENTITY_BASE}/sp/manifest-control-plane/platform`

async function removeOwnSpRow(): Promise<void> {
  const pool = new pg.Pool({ connectionString: idpDatabaseUrl() })
  try {
    await deleteSpRow(pool, TEST_ENTITY_ID)
  } finally {
    await pool.end()
  }
}

interface Res {
  status: number
  location?: string
  setCookie: string[]
  body: string
}

/**
 * One request helper for both origins, because the flow crosses between them.
 *
 * `node:http`/`node:https` rather than `fetch`, for the CA above: global fetch
 * on Node has no per-request way to add a root without an undici Dispatcher, and
 * adding a dependency to reach one is not worth it for four hops. Redirects are
 * followed by the caller, not here, so each hop stays visible in the test.
 */
async function request(
  url: string,
  init: { method?: string; cookie?: string; form?: Record<string, string> } = {},
): Promise<Res> {
  const target = new URL(url)
  const secure = target.protocol === 'https:'
  const body = init.form ? new URLSearchParams(init.form).toString() : undefined
  return new Promise<Res>((resolve, reject) => {
    const req = (secure ? https : http).request(
      target,
      {
        method: init.method ?? 'GET',
        ...(secure ? { ca: CA } : {}),
        headers: {
          ...(init.cookie ? { cookie: init.cookie } : {}),
          ...(body
            ? {
                'content-type': 'application/x-www-form-urlencoded',
                'content-length': Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (text += chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            ...(res.headers.location === undefined
              ? {}
              : { location: res.headers.location }),
            setCookie: res.headers['set-cookie'] ?? [],
            body: text,
          }),
        )
      },
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/** Follows redirects, carrying the jar — what a browser does between hops. */
async function follow(
  url: string,
  jar: ReturnType<typeof cookieJar>,
  init: { method?: string; form?: Record<string, string> } = {},
): Promise<Res> {
  let current = url
  let res = await request(current, { ...init, cookie: jar.header() })
  jar.take(res)
  for (let hops = 0; res.location && hops < 10; hops++) {
    current = new URL(res.location, current).toString()
    res = await request(current, { cookie: jar.header() })
    jar.take(res)
  }
  return res
}

/**
 * A cookie jar, because the flow needs two of them and they must not mix.
 *
 * SimpleSAMLphp carries the pending authentication in its own session cookie
 * between the SSO request and the credential POST — without a jar the second hop
 * starts a new authentication and the flow loops rather than failing, which is
 * the failure `sso/testing.ts` records at length. The control plane's session
 * cookie is a separate jar for the same reason it is a separate origin.
 */
function cookieJar() {
  const cookies = new Map<string, string>()
  return {
    header: () => [...cookies].map(([n, v]) => `${n}=${v}`).join('; '),
    take: (res: Res) => {
      for (const line of res.setCookie) {
        const pair = line.split(';')[0]!
        const eq = pair.indexOf('=')
        if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1))
      }
    },
    get: (name: string) => cookies.get(name),
  }
}

/**
 * §16's identity-path regression tier, for MANIFEST'S OWN login.
 *
 * `sso/login.docker.test.ts` proves a real CWL login into a deployed APP.
 * This proves the other one §9 requires and nothing had ever exercised: a real
 * person logging in to the control plane itself, against the real Manifest IdP,
 * through a Service Provider row the control plane wrote at its own boot.
 *
 * **Why it has to be here and not in the unit tier.** `api/auth.test.ts` drives
 * the same code against an IdP this process holds the signing key to, which is
 * the only way to produce the assertions a correct IdP will never issue — a
 * wrong signature, a wrong audience. What it cannot prove is that the row the
 * platform WRITES and the request the platform SENDS describe the same Service
 * Provider. That is defect 49's shape and P3 Session 5's seven defects: *the
 * test constructs the value correctly and the running system re-derives it
 * wrongly*. Only the real IdP, reading the real row, can tell them apart.
 *
 * **Why it drives the flow from the HOST**, unlike every other login test here,
 * which runs from a container. §21 puts the control plane on the host on 7100,
 * not behind the edge, so its ACS is the one Manifest ACS a container cannot
 * reach — and the host can reach both it and `idp.manifest.internal`, which
 * resolves to the edge. The platform CA is passed explicitly on every https hop;
 * see `CA` above for why `NODE_EXTRA_CA_CERTS` cannot do it from here.
 */
describeDocker('Manifest’s own CWL login, against the real IdP', () => {
  const PORT = 7189
  const ORIGIN = `http://127.0.0.1:${PORT}`
  const IDP = 'https://idp.manifest.internal'
  let child: ChildProcess | undefined

  /** An HTML attribute value. `&amp;` matters — see the unescape below. */
  const attr = (html: string, name: string): string | undefined => {
    const m = new RegExp(`name="${name}"[^>]*value="([^"]*)"`).exec(html)
    return m?.[1]
  }
  /**
   * These come out of HTML attributes, so `&` arrives as `&amp;` — and
   * `AuthState` carries a query string, so posting it undecoded means
   * SimpleSAMLphp cannot match the pending authentication and the SAML flow
   * loops rather than failing. Measured 2026-09-08.
   */
  const unescape = (value: string): string =>
    value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')

  beforeAll(async () => {
    await run('pnpm', ['--filter', '@manifest/control-plane', 'build'], {
      cwd: REPO_ROOT,
    })
    child = spawn('node', ['packages/control-plane/dist/index.js'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MANIFEST_ENV: 'development',
        MANIFEST_PORT: String(PORT),
        // Must move with the port: `loadConfig` refuses a loopback origin whose
        // port is not the one it listens on, and the ACS this registers is what
        // the IdP will POST the assertion to.
        MANIFEST_CONTROL_PLANE_ORIGIN: ORIGIN,
        // Its own SP scope — see TEST_ENTITY_BASE. Without it this run rewrites
        // the row a developer's control plane on 7100 is using.
        MANIFEST_SP_ENTITY_BASE: TEST_ENTITY_BASE,
        MANIFEST_SESSION_SECRET: 'x'.repeat(32),
        MANIFEST_MASTER_SECRET: 'm'.repeat(32),
        MANIFEST_BLUEPRINTS_ROOT: `${REPO_ROOT}blueprints`,
        MANIFEST_REPOS_ROOT: `${REPO_ROOT}.manifest/repos`,
        // AI OFF. Sign-on is this suite's subject, and a development boot with AI on
        // needs MANIFEST_LITELLM_MASTER_KEY (P4b sitting 4, finding 38) — so this is
        // also the one place the switched-off boot runs for real.
        MANIFEST_AI_ENABLED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // Wait for the boot line rather than for a port to open: the boot now
    // REGISTERS the platform's SP before it listens, so "listening" and
    // "registered" are the same event and the line is the one that says so.
    await new Promise<void>((resolve, reject) => {
      let out = ''
      const timer = setTimeout(
        () => reject(new Error(`no boot line in 90s; output was:\n${out}`)),
        90_000,
      )
      const onData = (chunk: Buffer): void => {
        out += chunk.toString('utf8')
        if (/"msg":"control plane ready"/.test(out)) {
          clearTimeout(timer)
          resolve()
        }
      }
      child!.stdout?.on('data', onData)
      child!.stderr?.on('data', onData)
      child!.on('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`the control plane exited with ${code}:\n${out}`))
      })
    })
  }, 180_000)

  afterAll(async () => {
    child?.kill('SIGTERM')
    await removeOwnSpRow()
  }, 30_000)

  it('logs a real test user in, end to end, through the row it registered itself', async () => {
    const idpJar = cookieJar()
    const appJar = cookieJar()

    // HOP 1: the control plane redirects to the IdP with a signed AuthnRequest.
    const login = await request(`${ORIGIN}/auth/login`)
    expect(login.status).toBe(302)
    const authnUrl = login.location!
    expect(authnUrl.startsWith(`${IDP}/module.php/saml/idp/singleSignOnService`)).toBe(
      true,
    )

    // HOP 2: the IdP serves its login form — which it only does once it has
    // ACCEPTED the request, so reaching a form at all means the row it read and
    // the signature the control plane sent both check out. If the row were
    // missing this is where it fails, with "Unable to locate metadata".
    const form = await follow(authnUrl, idpJar)
    expect(
      form.body,
      `the IdP served no login form (status ${form.status}):\n${form.body.slice(0, 1500)}`,
    ).toMatch(/name="username"/)

    // HOP 3: post the credentials. `AuthState` is what carries the pending
    // authentication between requests; dropping it restarts the flow.
    const authState = unescape(attr(form.body, 'AuthState') ?? '')
    const action = unescape(/<form[^>]*action="([^"]*)"/.exec(form.body)?.[1] ?? '')
    const postTo = action.startsWith('http') ? action : `${IDP}${action}`
    const autosubmit = await follow(postTo, idpJar, {
      method: 'POST',
      form: { username: 'instructor', password: 'instructor', AuthState: authState },
    })
    const samlResponse = unescape(attr(autosubmit.body, 'SAMLResponse') ?? '')
    expect(
      samlResponse,
      `no SAMLResponse in:\n${autosubmit.body.slice(0, 2000)}`,
    ).toBeTruthy()

    // HOP 4: the browser posts the assertion to the control plane's own ACS.
    const callback = await request(`${ORIGIN}/auth/saml/callback`, {
      method: 'POST',
      form: { SAMLResponse: samlResponse },
    })
    expect(callback.status, callback.body).toBe(302)
    // Where a browser actually lands. `/` was the first answer and is a route
    // this server does not have, so a successful login finished on a 404.
    expect(callback.location).toBe('/auth/me')
    appJar.take(callback)
    expect(appJar.get('manifest_session')).toBeTruthy()

    // ASSERT THE SHAPE OF THE ANSWER. "a session was minted" and "the session
    // belongs to the person the IdP authenticated" are different claims, and
    // only the second one means the login worked. `ins000001` is the
    // `ubcEduCwlPuid` the IdP's own auth source holds for `instructor`, and
    // `member` is Manifest's — the assertion says eduPersonAffiliation=faculty.
    const me = await request(`${ORIGIN}/auth/me`, {
      cookie: `manifest_session=${appJar.get('manifest_session')}`,
    })
    expect(me.status).toBe(200)
    expect(JSON.parse(me.body)).toMatchObject({ puid: 'ins000001', role: 'member' })
  }, 300_000)

  it('refuses an unsigned assertion, and does not crash on one', async () => {
    // An ACS is reachable without any credential at all, so it must refuse
    // malformed input rather than 500 on it — a handler that crashes on bad XML
    // is a denial-of-service surface anybody can reach. 401 and no cookie.
    const nobody = await request(`${ORIGIN}/auth/saml/callback`, {
      method: 'POST',
      form: {
        SAMLResponse: Buffer.from(
          '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"/>',
          'utf8',
        ).toString('base64'),
      },
    })
    expect(nobody.status).toBe(401)
    expect(nobody.setCookie).toHaveLength(0)
  }, 60_000)
})
