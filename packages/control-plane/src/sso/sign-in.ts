import { resolve } from 'node:path'
import { demux, type EngineClient } from '../runtime/index.js'
import { friendlyAttributeName } from './attributes.js'

/**
 * A REAL CWL SIGN-IN, DRIVEN BY THE PLATFORM ITSELF (P6a Task 14, D21 as R2 redefines it).
 *
 * D21 asks for a rehearsal against UBC's staging IdP before an app goes in front of
 * students; C1 puts that IdP out of reach of this laptop, so R2 redefines the rehearsal as
 * a local, production-shaped one that Manifest runs itself. Running it means completing an
 * actual sign-in — the three hops a browser makes — against the app as it is deployed, and
 * reading what the IdP actually released.
 *
 * **IT RUNS FROM A CONTAINER**, exactly as `routing/readiness.ts`'s probes do and for the
 * same two measured reasons: a host process cannot reach a container IP on Docker Desktop
 * (§21), and the app is only reachable through the edge by name, which the platform
 * resolver answers. `--cacert` and never `-k`: a probe that skips verification passes
 * against the wrong certificate, which is what P3 Task 14 paid for.
 */
export interface CwlSignInInput {
  /** The app's hostname, bare — §23's `<slug>.<zone>`. */
  hostname: string
  /**
   * §12's public listener, as a container reaches it (P6a Decision 15). A production app
   * is on `srv1`, which is `:8443` inside the platform network; everything else is on the
   * edge's `:443` and passes nothing here.
   */
  port?: number
  /**
   * WHERE THE ASSERTION IS POSTED, read back off the Service Provider REGISTRATION rather
   * than rebuilt here. That is the whole point of a rehearsal: if the registered ACS URL
   * is wrong, this hop is what discovers it, and a probe that recomputed the URL from the
   * hostname would agree with itself and prove nothing.
   */
  acsUrl: string
}

export interface CwlSignInResult {
  /** What the app answered when the assertion was posted to its ACS, or `null` if no assertion was ever produced. */
  status: number | null
  /**
   * The attributes the assertion ACTUALLY carried, as friendly names where this platform
   * knows one and as the raw `urn:oid:` value where it does not (`sso/attributes.ts`).
   * §9's `core:AttributeLimit` enforcement, measured rather than assumed — which is what
   * S2 paid for.
   */
  attributesReleased: string[]
  /** What happened, in a sentence a person reads in a launch record. Never a secret, never the assertion (§14). */
  reason: string
}

export interface CwlSignInProbe {
  signIn(input: CwlSignInInput): Promise<CwlSignInResult>
}

export interface CwlSignInProbeOptions {
  engine: EngineClient
  /** `config.idp.baseUrl` — where hop 2 posts the credentials. */
  idpBaseUrl: string
  /** `config.caCertPath`. Mounted into the probe, never bypassed. */
  caCertPath: string
  /** `config.dnsServer` — the platform resolver, which answers every app hostname. */
  dnsServer: string
  /**
   * THE ACCOUNT THE REHEARSAL SIGNS IN AS.
   *
   * On this laptop it is one of the Manifest IdP's three fixture users
   * (`infra/idp/config/authsources.php`), whose passwords equal their usernames and are in
   * the repository — they guard nothing. A rehearsal against UBC's staging IdP (D21, the
   * external-track obligation §9 names) would use a UBC-issued test account, and it goes
   * in the same two settings rather than in new code.
   */
  credentials: { user: string; password: string }
}

/** The image the probe runs in. `make seed` mirrors it locally, so this is offline. */
const PROBE_IMAGE = 'curlimages/curl:8.11.1'

/**
 * THE THREE HOPS, WRITTEN ONCE.
 *
 * A browser follows a redirect to the IdP, posts a login form, and posts the IdP's
 * auto-submitting form to the SP's ACS. curl does none of that by itself, so each form's
 * fields are extracted and re-POSTed.
 *
 * **Extracting them with `sed` is regex-over-HTML, which is normally a mistake.** It is
 * acceptable for one reason: this is a FIXTURE IdP whose SimpleSAMLphp version is pinned
 * and whose markup we re-check on upgrade — and that re-check is what `sso/`'s Docker tier
 * is for (S2's open question). If the markup moves, this fails loudly.
 *
 * It leaves `$saml` holding the base64 SAMLResponse and `$J` holding the cookie jar, and
 * says nothing about what to do with either — `sso/testing.ts` posts it and reads the
 * app's `/me`, the rehearsal posts it to the REGISTERED ACS and reads the assertion. Two
 * tails, one set of hops: they were two copies until P6a Task 14, and the one thing worse
 * than regex-over-HTML is two of it.
 */
export const SAML_LOGIN_HOPS = String.raw`
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
saml=$(echo "$assertion" | sed -n 's/.*name="SAMLResponse"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | unescape)
if [ -z "$saml" ]; then
  printf '{"status":0,"body":%s}\n' "$(json_escape "$assertion")"
  exit 0
fi
`

/**
 * THE REHEARSAL'S TAIL: post the assertion where the REGISTRATION says, and read what the
 * IdP released out of the assertion itself.
 *
 * **The attributes come from the assertion and not from the app**, and that is a decision
 * with a measurement behind it (P6a sitting 9): the blueprint's skeleton serves `/me` and
 * the proof-app starter serves `/api/me`, so there is no app endpoint a rehearsal can rely
 * on — while the assertion is the platform's own evidence and exists for every app. It is
 * base64 XML: the Manifest IdP signs assertions and does not encrypt them, measured live
 * on 2026-09-20 (`saml:Assertion`, five `urn:oid:` attributes for a registration of five).
 *
 * `--location-trusted`, not `-L`: the POST crosses from the IdP origin to the app origin
 * and plain `-L` drops the body on a cross-origin redirect, which reads as "the app
 * rejected the assertion".
 *
 * **NEITHER THE ASSERTION NOR A NameID IS EVER PRINTED** — §14 redacts at capture, and
 * what this returns is written into a launch record. Only attribute NAMES and a status.
 */
const REHEARSAL_TAIL = String.raw`
code=$(curl -sS --cacert /ca.crt -c $J -b $J --location-trusted -o /dev/null \
  -w '%{http_code}' --data-urlencode "SAMLResponse=$saml" "$ACS")
names=$(echo "$saml" | base64 -d | tr '<' '\n' \
  | sed -n 's/^[a-zA-Z0-9]*:*Attribute [^>]*Name="\([^"]*\)".*/\1/p' | sort -u | tr '\n' ' ')
printf '{"status":%s,"attributes":"%s"}\n' "$code" "$names"
`

/**
 * The probe, bound to the engine and the platform's own settings — the seam `src/index.ts`
 * constructs and `launch/rehearsal.ts` asks. An interface rather than a function so the
 * unit tier can rehearse without Docker, an IdP or an app, exactly as R4's `Reviewer` seam
 * does for code review.
 */
export function createCwlSignInProbe(options: CwlSignInProbeOptions): CwlSignInProbe {
  return {
    async signIn(input: CwlSignInInput): Promise<CwlSignInResult> {
      const authority =
        input.port === undefined ? input.hostname : `${input.hostname}:${input.port}`
      /**
       * **THE REGISTERED ACS, REACHED FROM HERE** (P6a Task 14, measured live). The path
       * and the host are the registration's and are never rebuilt; the PORT is how a
       * container reaches §12's public listener, which is `:8443` inside the platform
       * network and `:443` from the host. Posting to the bare registered URL from a
       * container arrives at `srv0`, the INTERNAL listener, which holds no route for a
       * production hostname and answers the wildcard.
       *
       * The assertion's own `Destination` is unaffected — it is whatever the IdP wrote,
       * which is the registered URL, and that is what the app compares against its own
       * configured callback.
       */
      const acs = new URL(input.acsUrl)
      if (input.port !== undefined) acs.port = String(input.port)
      const output = await runProbeContainer(options, {
        script: SAML_LOGIN_HOPS + REHEARSAL_TAIL,
        env: {
          APP: `https://${authority}`,
          IDP: options.idpBaseUrl,
          ACS: acs.toString(),
          USER: options.credentials.user,
          PASS: options.credentials.password,
        },
      })
      // The script prints ONE JSON line last, so the container's own diagnostics above it
      // are kept — they are the only record when a hop fails — without being parsed.
      const line = output.trim().split('\n').at(-1) ?? ''
      let parsed: { status?: number; attributes?: string; body?: string }
      try {
        parsed = JSON.parse(line) as typeof parsed
      } catch {
        return {
          status: null,
          attributesReleased: [],
          reason: `the sign-in probe printed no result. Last line: ${line.slice(0, 200)}`,
        }
      }
      if (parsed.attributes === undefined) {
        /**
         * One of the first two hops reported rather than threw: no login form (the app
         * does not sign anybody in, or the IdP refused the SP) or no SAMLResponse. Both
         * are rehearsal FAILURES, with the reason naming which hop.
         *
         * **`status` IS `null` HERE, AND THAT IS NOT TIDINESS — IT WAS A DEFECT** (P6a
         * sitting 9, measured by the Docker tier and invisible to every unit test): this
         * field means *what the app answered at its REGISTERED ACS*, and in this branch
         * nothing was ever posted there. Returning the `/login` answer instead put a `200`
         * in it, so `judge` read a failed rehearsal as *"the sign-in completed and the IdP
         * released no attributes"* — a wrong diagnosis of a right verdict, which is the
         * kind of evidence that sends somebody to the IdP for a day.
         */
        return {
          status: null,
          attributesReleased: [],
          reason:
            parsed.status === 0 || parsed.status === undefined
              ? 'the IdP produced no assertion for this Service Provider — the registration, the signature or the AuthnRequest was refused'
              : `the app did not offer a CWL login form: it answered ${parsed.status} at /login`,
        }
      }
      const attributesReleased = parsed.attributes
        .split(' ')
        .filter((name) => name !== '')
        .map(friendlyAttributeName)
      return {
        status: parsed.status ?? null,
        attributesReleased,
        reason:
          parsed.status === 200 || parsed.status === 302
            ? `the sign-in completed: the app answered ${parsed.status} at its registered ACS and the assertion carried ${attributesReleased.length} attribute(s)`
            : `the app answered ${parsed.status} at its registered ACS, so it did not accept the assertion`,
      }
    },
  }
}

/**
 * The same shape as `edgeProbe` in `routing/readiness.ts`: create, start, wait, read the
 * logs, remove with `v=true`.
 *
 * `--entrypoint sh` because this image's entrypoint is curl itself. The platform CA is
 * mounted rather than trusted blindly, and the platform resolver is passed as `Dns`.
 */
async function runProbeContainer(
  options: CwlSignInProbeOptions,
  input: { script: string; env: Record<string, string> },
): Promise<string> {
  const ca = resolve(options.caCertPath)
  const created = await options.engine.post<{ Id: string }>('/containers/create', {
    Image: PROBE_IMAGE,
    Entrypoint: ['sh'],
    Cmd: ['-c', input.script],
    Env: Object.entries(input.env).map(([k, v]) => `${k}=${v}`),
    HostConfig: {
      NetworkMode: 'manifest-platform',
      Dns: [options.dnsServer],
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
    await options.engine.post(`/containers/${id}/start`)
    await options.engine.post(`/containers/${id}/wait`)
    // demux, NOT a raw read: the Engine API frames its log stream as
    // `[type:u8][000][size:u32be][payload]`, and stripping non-digits out of the raw bytes
    // is a coincidence that holds only while no frame header carries an ASCII digit
    // (P3 defect 52).
    const stream = await options.engine.stream(
      `/containers/${id}/logs?stdout=true&stderr=true`,
    )
    let out = ''
    for await (const line of demux(stream as unknown as AsyncIterable<Buffer>)) {
      out += line.text
    }
    return out
  } finally {
    // `v=true` removes the anonymous volumes with the container (defect 24 was 42 orphaned
    // volumes from exactly this omission).
    await options.engine.del(`/containers/${id}?force=true&v=true`)
  }
}
