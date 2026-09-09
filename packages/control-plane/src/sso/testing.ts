import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import pg from 'pg'
import type { Driver, ImageRef } from '../runtime/index.js'
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

/** The IdP's metadata database. Task 7 promotes this to config as
 *  MANIFEST_IDP_DATABASE_URL; until then it is derived the same way
 *  `vitest.env.ts` derives the control-plane URL, from `.env`. */
function idpDatabaseUrl(): string {
  if (process.env.MANIFEST_IDP_DATABASE_URL) return process.env.MANIFEST_IDP_DATABASE_URL
  const password = readFileSync(join(REPO_ROOT, '.env'), 'utf8')
    .split('\n')
    .find((line) => line.startsWith('POSTGRES_PASSWORD='))
    ?.slice('POSTGRES_PASSWORD='.length)
    .trim()
  if (!password) {
    throw new Error(
      'no POSTGRES_PASSWORD in .env — `make seed` writes it, and the IdP metadata ' +
        'database cannot be reached without it',
    )
  }
  return `postgres://manifest:${password}@127.0.0.1:7103/manifest_idp`
}

/** The `entity_data` document S2 recorded. Task 7 derives this from an AppSpec;
 *  here it is written by hand, which is the whole point of this suite. */
export interface SpRow {
  entityId: string
  acsUrl: string
  attributes: string[]
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

export interface SamlSpHandle {
  hostname: string
  row: SpRow
  idpBaseUrl: string
  instance: string
  stop: () => Promise<void>
}

const IDP_BASE_URL = 'https://idp.manifest.internal'
/** Measured off the running container's own routes.yml, not inferred from 1.x
 *  documentation — passport-ubcshib hardcodes SimpleSAMLphp 1.x's paths, which
 *  404 against 2.x, and that is exactly why §8 makes SAML_ENTRY_POINT mandatory. */
const IDP_SSO = `${IDP_BASE_URL}/module.php/saml/idp/singleSignOnService`
const IDP_SLO = `${IDP_BASE_URL}/module.php/saml/idp/singleLogout`
const IDP_METADATA = `${IDP_BASE_URL}/module.php/saml/idp/metadata`

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
  }

  await driver.ensureInstance({
    name,
    projectSlug: slug,
    environmentKind: kind,
    releaseId: 'r1',
    image,
    env: {
      MANIFEST_ENV: kind,
      MANIFEST_PROJECT_SLUG: slug,
      MANIFEST_APP_URL: appUrl,
      PORT: '8080',
      SESSION_SECRET: 'saml-fixture-session-secret',
      // LOCAL, and never left unset: the library defaults to 'STAGING' at both
      // read sites, which points a deployed app at real UBC infrastructure (§8).
      SAML_ENVIRONMENT: 'LOCAL',
      SAML_ISSUER: row.entityId,
      SAML_CALLBACK_URL: row.acsUrl,
      SAML_ENTRY_POINT: IDP_SSO,
      SAML_LOGOUT_URL: IDP_SLO,
      SAML_IDP_METADATA_URL: IDP_METADATA,
      SAML_IDP_CERT_PATH: '/manifest/idp-signing.crt',
    },
    port: 8080,
    healthPath: '/healthz',
    resources: { cpu: 0.5, memoryMi: 256, pids: 128, diskMi: 1024 },
    services: [],
    egressAllow: [],
    // §8: "Manifest mounts it; the blueprint never fetches it at runtime."
    files: [{ path: '/manifest/idp-signing.crt', contents: idpCert }],
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
  printf '%s' "$1" | head -c 400 | tr '\n\r' '  ' \
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
