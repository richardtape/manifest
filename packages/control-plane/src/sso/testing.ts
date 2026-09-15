import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import pg from 'pg'
import type { Driver, ImageRef } from '../runtime/index.js'
import { INJECTED_FILE_PATHS, renderInjection } from '../spec/index.js'
import type { SpKeypair } from './keypair.js'
import {
  createIdpPool,
  deleteSpRow,
  upsertSpRow,
  type SpMetadataRow,
} from './metadata-store.js'
import { demux, instanceName } from '../runtime/index.js'
import {
  CA_CERT,
  REPO_ROOT,
  appContainer,
  createEngineClient,
  dockerDriverForTests,
  egressContainer,
  fixtureBareRepo,
  resolveSocketPath,
} from '../runtime/testing.js'

/**
 * `sso/`'s test surface. Everything here composes what `runtime/docker/` and
 * `routing/` already do — building an image, an app network with the platform
 * neighbours attached, the forced egress proxy, a Caddy route and the readiness
 * gate — and reimplements none of it. A second implementation of any of that
 * would test itself rather than the platform.
 */

/**
 * The IdP's metadata database, from the setting the control plane itself reads.
 *
 * Task 7 promoted this to `MANIFEST_IDP_DATABASE_URL`, which `vitest.env.ts`
 * derives from `.env` for every test process. Deriving it a second time here
 * would be a second producer of one value — the shape that cost P3 seven defects
 * in one session — so this reads the variable and refuses without it.
 */
export function idpDatabaseUrl(): string {
  const url = process.env.MANIFEST_IDP_DATABASE_URL
  if (!url) {
    throw new Error(
      'MANIFEST_IDP_DATABASE_URL is not set. vitest.env.ts derives it from the repo ' +
        '`.env`, which `make seed` writes; outside the test runner, export it the way ' +
        'README does.',
    )
  }
  return url
}

/**
 * The IdP's signing certificate, where `make up` mints it.
 *
 * Resolved from THIS FILE rather than from the working directory: `pnpm test`
 * and `pnpm --filter … test` have different ones, and that difference has been a
 * defect three times in this repository.
 */
export function idpSigningCertPath(): string {
  return join(REPO_ROOT, 'infra/idp/cert/server.crt')
}

/** The `entity_data` document S2 recorded. Task 7 derives this from an AppSpec;
 *  here it is written by hand, which is the whole point of this suite. */
export interface SpRow {
  entityId: string
  acsUrl: string
  attributes: string[]
  /**
   * The SP's certificate, base64 body — required as soon as the SP SIGNS.
   *
   * Measured 2026-09-09: SimpleSAMLphp validates any signature that is PRESENT,
   * whether or not the row asks it to. A signing SP registered with a row that
   * carries no `certData` is refused with *"Missing certificate in metadata"*,
   * which reads as a missing registration rather than a missing key.
   */
  certData?: string
}

function entityData(row: SpRow): Record<string, unknown> {
  return {
    entityid: row.entityId,
    AssertionConsumerService: [
      {
        index: 0,
        isDefault: true,
        Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
        Location: row.acsUrl,
      },
    ],
    // The list §9's rule is about. An empty or absent one releases everything,
    // which is why `ensure-idp-sql.sh` puts a CHECK constraint under it.
    attributes: row.attributes,
    // OID naming on the wire, matching what core:AttributeMap produces at
    // priority 60 and what passport-ubcshib's reverse map reads.
    'attributes.NameFormat': 'urn:oasis:names:tc:SAML:2.0:attrname-format:uri',
    ...(row.certData === undefined ? {} : { certData: row.certData }),
  }
}

/**
 * Inserts the row, runs the callback, removes the row — always, including when
 * the callback throws.
 *
 * The delete is in a `finally` because a leaked row makes the NEXT run's
 * "refuses an entityID with no row" control pass a login instead, and that is
 * the order-dependence that made five of P2's tests pass or fail on the order
 * Vitest happened to pick.
 */
export async function withRegisteredSp<T>(row: SpRow, fn: () => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: idpDatabaseUrl() })
  try {
    await pool.query(
      `INSERT INTO saml20_sp_remote (entity_id, entity_data) VALUES ($1, $2)
       ON CONFLICT (entity_id) DO UPDATE SET entity_data = EXCLUDED.entity_data`,
      [row.entityId, JSON.stringify(entityData(row))],
    )
    try {
      return await fn()
    } finally {
      await pool.query('DELETE FROM saml20_sp_remote WHERE entity_id = $1', [
        row.entityId,
      ])
    }
  } finally {
    await pool.end()
  }
}

/**
 * Registers a FULLY RENDERED row — what `renderSpMetadata` produces — runs the
 * callback, and removes it, always.
 *
 * `withRegisteredSp` above writes a hand-built document, which is what Task 3
 * needed before `sso/` existed. This one writes the real thing through the real
 * store, so a login driven under it exercises the row the platform will actually
 * write: signing flags, per-app certData, OID naming and all.
 */
export async function withRegisteredMetadata<T>(
  entityId: string,
  row: SpMetadataRow,
  fn: () => Promise<T>,
): Promise<T> {
  const pool = createIdpPool(idpDatabaseUrl())
  try {
    await upsertSpRow(pool, entityId, row)
    try {
      return await fn()
    } finally {
      await deleteSpRow(pool, entityId)
    }
  } finally {
    await pool.end()
  }
}

export interface SamlSpHandle {
  hostname: string
  row: SpRow
  idpBaseUrl: string
  instance: string
  stop: () => Promise<void>
}

const IDP_BASE_URL = 'https://idp.manifest.internal'

/**
 * §8's variables for the fixture SP, through the PLATFORM's renderer.
 *
 * The endpoint paths are no longer restated here: `spec/injection.ts` builds
 * them from the IdP base URL, off the running container's own `routes.yml`
 * (passport-ubcshib hardcodes SimpleSAMLphp 1.x's paths, which 404 against 2.x —
 * exactly why §8 makes SAML_ENTRY_POINT mandatory). A copy here is a copy that
 * can be right while the platform is wrong.
 */
function samlSpEnv(input: {
  slug: string
  kind: 'sandbox' | 'staging' | 'production'
  hostname: string
  row: SpRow
  signing: boolean
}): Record<string, string> {
  const auth = {
    provider: 'cwl' as const,
    attributes: [...input.row.attributes],
    callback: '/auth/ubcshib/callback',
    logout: '/auth/logout',
  }
  const env = renderInjection({
    resolved: {
      environmentKind: input.kind,
      // 8080, deliberately not the blueprint's default_port of 3000: if PORT
      // were not really injected the app would listen on 3000 and this fixture
      // would fail rather than pass by coincidence.
      port: 8080,
      health: '/healthz',
      resources: { cpu: 0.5, memory: '256Mi', pids: 128, disk: '1Gi' },
      env: [],
      services: [],
      egressAllow: [],
      classification: 'internal',
      auth,
      ai: { models: [], budget: { project_monthly_usd: 0, per_user_monthly_usd: 0 } },
    },
    environmentKind: input.kind,
    hostname: input.hostname,
    projectSlug: input.slug,
    idp: {
      entityId: `${IDP_BASE_URL}/idp/shibboleth`,
      baseUrl: IDP_BASE_URL,
      spEntityBase: 'https://manifest.internal',
    },
    spEntity: {
      entityId: input.row.entityId,
      acsUrl: input.row.acsUrl,
      sloUrl: `https://${input.hostname}${auth.logout}`,
      attributes: [...input.row.attributes],
    },
    secrets: { sessionSecret: 'saml-fixture-session-secret' },
    services: [],
  })
  /**
   * The ONE deliberate subtraction, and it is a negative control rather than a
   * convenience: an SP that does not sign its AuthnRequest is the only thing
   * that can show `validate.authnrequest` doing anything (SimpleSAMLphp
   * validates any signature that is PRESENT, whatever the row says). The
   * platform never deploys a staging app this way — `renderInjection` always
   * renders the path outside sandbox — so the fixture removes it explicitly
   * instead of the platform having a mode that produces it.
   */
  if (!input.signing) delete env.SAML_PRIVATE_KEY_PATH
  return env
}

/**
 * Builds and deploys `fixtures/saml-sp` through the REAL driver, and returns the
 * row that would register it.
 *
 * The IdP's public signing certificate is placed in the container by the
 * platform, through `InstanceSpec.files` — which is what §8's
 * `SAML_IDP_CERT_PATH` means by "Manifest mounts it". Until 2026-09-08 there was
 * no way to put a file in a container at all and this fixture committed the
 * certificate into its own repository as a stand-in; that is now the real
 * mechanism, so this suite exercises the path Task 11 will use.
 */
export async function startSamlSp(input: {
  slug: string
  kind: 'sandbox' | 'staging' | 'production'
  /**
   * The SP's own keypair. Given one, its private key is placed at §8's
   * `SAML_PRIVATE_KEY_PATH` and the fixture SIGNS its AuthnRequest — which is
   * what a row carrying `validate.authnrequest: true` requires, and what
   * `renderSpMetadata` always writes. The certificate goes into the returned
   * row, because a signature the IdP cannot check is worse than none.
   *
   * Mode 0440 owned by root with the blueprint's gid, not 0400 owned by the app:
   * §12's `CapDrop: ALL` takes CAP_DAC_OVERRIDE with it, so ownership and group
   * are the only things that can grant a read, and root-owned means the app
   * cannot rewrite its own key (measured 2026-09-08).
   */
  signing?: SpKeypair
}): Promise<SamlSpHandle> {
  const { slug, kind } = input
  const hostname =
    kind === 'production'
      ? `${slug}.manifest.internal`
      : `${slug}.${kind}.manifest.internal`
  const appUrl = `https://${hostname}`
  const idpCert = readFileSync(join(REPO_ROOT, 'infra/idp/cert/server.crt'), 'utf8')

  const driver = await dockerDriverForTests()
  const repo = fixtureBareRepo(join(tmpdir(), `mf-${slug}.git`), {
    source: join(REPO_ROOT, 'fixtures/saml-sp'),
  })
  const image: ImageRef = await driver.buildImage(repo, {
    blueprintRef: 'fixture-node@1',
    projectSlug: slug,
  })

  const name = instanceName(slug, kind, 'r1')
  const row: SpRow = {
    // §9's shape: https://{platform-domain}/sp/{slug}/{env}. Manifest supplies
    // the origin; the app supplies only a path.
    entityId: `https://manifest.internal/sp/${slug}/${kind}`,
    acsUrl: `${appUrl}/auth/ubcshib/callback`,
    attributes: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn', 'eduPersonAffiliation'],
    ...(input.signing === undefined ? {} : { certData: input.signing.certData }),
  }

  await driver.ensureInstance({
    name,
    projectSlug: slug,
    environmentKind: kind,
    releaseId: 'r1',
    image,
    /**
     * THE PLATFORM'S OWN RENDERER, not a hand-built block (Task 11).
     *
     * This fixture used to construct §8's variables itself, which made §16's
     * identity-path regression tier prove that a login works against an
     * environment the platform does not produce — so `renderInjection` could
     * have had any SAML row wrong and this suite would still have passed. It is
     * the second producer Task 11's grep exists to find.
     *
     * The one deliberate subtraction is below: this fixture also models an SP
     * that does NOT sign, which the platform never deploys in staging.
     */
    env: samlSpEnv({ slug, kind, hostname, row, signing: input.signing !== undefined }),
    port: 8080,
    healthPath: '/healthz',
    needsAiGateway: false,
    resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 1024 },
    services: [],
    egressAllow: [],
    // §8: "Manifest mounts it; the blueprint never fetches it at runtime."
    files: [
      { path: INJECTED_FILE_PATHS.idpCertificate, contents: idpCert },
      ...(input.signing
        ? [
            {
              path: INJECTED_FILE_PATHS.spPrivateKey,
              contents: input.signing.privateKeyPem,
              mode: 0o440,
              // The blueprint's run_as_uid group. fixture-node@1 creates both at
              // 10001; Task 11 threads this from the descriptor instead.
              gid: 10001,
            },
          ]
        : []),
    ],
  })

  return {
    hostname,
    row,
    idpBaseUrl: IDP_BASE_URL,
    instance: name,
    stop: async () => {
      // THE CONTAINER NAME, not the instance name — and the failure is REPORTED.
      // `destroyInstance(instanceName(...))` matches nothing, and a swallowed
      // error made that invisible: the container survived, `ensureInstance` is
      // idempotent by name, and every later run silently redeployed nothing and
      // exercised the FIRST image it ever built. Negative control (c) passed
      // against an app it had already edited. Measured 2026-09-08.
      await driver.destroyInstance(appContainer(name)).catch((error: unknown) => {
        console.error(
          `[sso/testing] destroyInstance(${appContainer(name)}) failed:`,
          error,
        )
      })
      // The forced egress proxy is a second container the driver creates per
      // app+environment, and roundtrip.docker.test.ts removes it explicitly for
      // the same reason.
      const engine = createEngineClient({ socketPath: resolveSocketPath() })
      await engine
        .del(`/containers/${egressContainer(slug, kind)}?force=true&v=true`)
        .catch(() => undefined)
    },
  }
}

/**
 * The IdP's own log, most recent lines first read.
 *
 * SimpleSAMLphp's error page deliberately says only "Unhandled exception" — the
 * REASON is in the server log and nowhere else, and turning `showerrors` on to
 * make a test easier would leak stack traces from a deployed IdP. So a test that
 * wants to know WHY the IdP refused reads the log, and counts occurrences before
 * and after rather than matching once: a message left by an earlier run would
 * otherwise let the assertion pass without the IdP having refused anything.
 */
export async function idpLogTail(lines = 500): Promise<string> {
  const engine = createEngineClient({ socketPath: resolveSocketPath() })
  const res = await engine.stream(
    `/containers/manifest-idp/logs?stdout=true&stderr=true&tail=${lines}`,
  )
  try {
    const out: string[] = []
    for await (const line of demux(res as unknown as AsyncIterable<Buffer>)) {
      out.push(line.text)
    }
    return out.join('\n')
  } finally {
    res.destroy()
  }
}

export interface LoginResult {
  status: number
  body: string
  attributes?: Record<string, string | string[]>
}

/**
 * The SAML flow, driven the way a browser drives it, from a CONTAINER.
 *
 * From a container because a host process cannot reach a container IP on Docker
 * Desktop (§21), and because the app under test is only reachable through the
 * edge by name. The cookie jar matters: SimpleSAMLphp carries the authentication
 * state in a session cookie between the SSO request and the login POST, and
 * without a jar the second hop starts a new session and the flow loops.
 *
 * `--cacert`, never `-k`: a probe that skips verification would pass against the
 * wrong certificate, which is the failure P3 Task 14 paid for.
 */
export async function idpLogin(
  sp: SamlSpHandle,
  credentials: { user: string; password: string },
): Promise<LoginResult> {
  const output = await runProbeContainer({
    script: LOGIN_SCRIPT,
    env: {
      APP: `https://${sp.hostname}`,
      IDP: sp.idpBaseUrl,
      USER: credentials.user,
      PASS: credentials.password,
    },
  })
  // The script prints one JSON line last, so the container's own diagnostics
  // above it are kept (they are the only record when a hop fails) without being
  // parsed.
  const line = output.trim().split('\n').at(-1) ?? '{}'
  try {
    return JSON.parse(line) as LoginResult
  } catch {
    throw new Error(`the login probe printed no JSON. Full output:\n${output}`)
  }
}

/**
 * Three hops, because that is what a browser does. curl cannot auto-submit an
 * HTML form, so each form's fields are extracted and re-POSTed.
 *
 * Extracting them with `sed` is regex-over-HTML, which is normally a mistake. It
 * is acceptable here for one reason: this is a FIXTURE IdP whose exact
 * SimpleSAMLphp version we pin and whose markup we can re-check on upgrade — and
 * that re-check is precisely what this suite is for (S2's open question). If the
 * markup moves, this test fails loudly, which is the desired behaviour.
 */
const LOGIN_SCRIPT = String.raw`
set -eu
J=/tmp/jar

json_escape() {
  # One argument, printed as a JSON string. sed cannot see a newline inside its
  # own pattern space, so the newlines are removed FIRST with tr, and the
  # backslash is escaped BEFORE the quote or the escaping escapes itself.
  printf '%s' "$1" | head -c 4000 | tr '\n\r' '  ' \
    | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/'
}

# HOP 1: the app redirects to the IdP with a SAMLRequest. -L follows it; the jar
# picks up SimpleSAMLphp's session cookie, without which hop 2 starts a new
# authentication and the flow loops forever rather than failing.
form=$(curl -sS --cacert /ca.crt -c $J -b $J -L "$APP/login")

# If there is no login form, the IdP refused the SP. That is the negative
# control's expected path, so report it rather than failing the container.
if ! echo "$form" | grep -q 'name="username"'; then
  code=$(curl -sS --cacert /ca.crt -c $J -b $J -L -o /dev/null -w '%{http_code}' "$APP/login")
  printf '{"status":%s,"body":%s}\n' "$code" "$(json_escape "$form")"
  exit 0
fi

# HOP 2: post the credentials. AuthState is what carries the pending
# authentication between requests; dropping it restarts the flow.
# HTML-DECODE BOTH. These come out of an HTML attribute, so '&' arrives as
# '&amp;' - and AuthState carries a query string, so an undecoded value posts
# '...&amp;cookieTime=...' and SimpleSAMLphp cannot match the pending
# authentication. Measured 2026-09-08: the raw value ends
# '...singleSignOnService?spentityid=...&amp;cookieTime=1788919480'.
unescape() { sed 's/&amp;/\&/g; s/&quot;/"/g; s/&#039;/'"'"'/g; s/&lt;/</g; s/&gt;/>/g'; }
state=$(echo "$form" | sed -n 's/.*name="AuthState"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | unescape)
action=$(echo "$form" | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | head -1 | unescape)
case "$action" in http*) post="$action" ;; *) post="$IDP$action" ;; esac
assertion=$(curl -sS --cacert /ca.crt -c $J -b $J -L \
  --data-urlencode "username=$USER" --data-urlencode "password=$PASS" \
  --data-urlencode "AuthState=$state" "$post")

# HOP 3: the IdP answers with an auto-submitting form carrying the SAMLResponse.
# Post it to the app's ACS. --location-trusted, not -L: the POST crosses from the
# IdP origin to the app origin and plain -L drops the body on a cross-origin
# redirect, which reads as "the app rejected the assertion".
saml=$(echo "$assertion" | sed -n 's/.*name="SAMLResponse"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | unescape)
if [ -z "$saml" ]; then
  printf '{"status":0,"body":%s}\n' "$(json_escape "$assertion")"
  exit 0
fi
body=$(curl -sS --cacert /ca.crt -c $J -b $J --location-trusted \
  --data-urlencode "SAMLResponse=$saml" "$APP/auth/ubcshib/callback")
me=$(curl -sS --cacert /ca.crt -b $J "$APP/me")
code=$(curl -sS --cacert /ca.crt -b $J -o /dev/null -w '%{http_code}' "$APP/me")

# /me returns {"attributes": …}; passed through untouched so the TEST decides
# what is correct, not this script. If the login failed there is no attributes
# key and the test sees 'undefined', which is the honest answer.
attrs=$(printf '%s' "$me" | sed -n 's/^{"attributes":\(.*\)}$/\1/p')
[ -n "$attrs" ] || attrs=null
printf '{"status":%s,"body":%s,"attributes":%s}\n' "$code" "$(json_escape "$body")" "$attrs"
`

/** The image the probe runs in. Mirrored locally by `make seed`, so this is offline. */
const PROBE_IMAGE = 'curlimages/curl:8.11.1'

/**
 * The same shape as `edgeProbe` in `routing/readiness.ts`: create, start, wait,
 * read the logs, remove with `v=true`.
 *
 * `--entrypoint sh` because this image's entrypoint is curl itself. The platform
 * CA is mounted rather than trusted blindly, and the platform resolver is passed
 * as Dns, exactly as `edgeProbe` does.
 */
async function runProbeContainer(input: {
  script: string
  env: Record<string, string>
}): Promise<string> {
  const engine = createEngineClient({ socketPath: resolveSocketPath() })
  const ca = resolve(CA_CERT)
  const created = await engine.post<{ Id: string }>('/containers/create', {
    Image: PROBE_IMAGE,
    Entrypoint: ['sh'],
    Cmd: ['-c', input.script],
    Env: Object.entries(input.env).map(([k, v]) => `${k}=${v}`),
    HostConfig: {
      NetworkMode: 'manifest-platform',
      Dns: ['10.89.0.53'],
      Binds: [`${ca}:/ca.crt:ro`],
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      RestartPolicy: { Name: 'no' },
    },
  })
  if (!created) {
    throw new Error(
      `no such image: ${PROBE_IMAGE} — \`make seed\` mirrors it for exactly this`,
    )
  }
  const id = created.Id
  try {
    await engine.post(`/containers/${id}/start`)
    await engine.post(`/containers/${id}/wait`)
    // demux, NOT a raw read: the Engine API frames its log stream as
    // `[type:u8][000][size:u32be][payload]`, and stripping non-digits out of the
    // raw bytes is a coincidence that holds only while no frame header happens
    // to carry an ASCII digit (P3 defect 52).
    const stream = await engine.stream(`/containers/${id}/logs?stdout=true&stderr=true`)
    let out = ''
    for await (const line of demux(stream as unknown as AsyncIterable<Buffer>)) {
      out += line.text
    }
    return out
  } finally {
    await engine.del(`/containers/${id}?force=true&v=true`)
  }
}

export type { Driver }
