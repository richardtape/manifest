import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SourceError } from '../git-driver.js'

const run = promisify(execFile)

/** Any value an `Authorization: Basic` header carries — the header form git is handed. */
const BASIC = /(Authorization:\s*Basic\s+)[A-Za-z0-9+/=]+/gi

/**
 * Every form a token can take on the way to git: itself, the base64 of
 * `x-access-token:<token>` that the header carries, and any `Authorization: Basic` value at
 * all. Applied to EVERY message this module builds, and by the driver to every
 * `SourceError` it lets out, with every live token (Decision 4).
 */
export function redactToken(text: string, token: string | undefined): string {
  let out = text.replace(BASIC, '$1[token]')
  if (token === undefined || token.length === 0) return out
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  out = out.split(token).join('[token]').split(basic).join('[token]')
  return out
}

/** git's own words when the network, not the request, is what failed (measured, sitting 4). */
const UNREACHABLE =
  /Could not resolve host|Failed to connect|Connection refused|Couldn't connect|timed out|Empty reply|Connection reset|Recv failure/i

/**
 * GitHub refused the credential. Git answers a `401` challenge by asking a credential helper
 * — there is none — and then the terminal, which `GIT_TERMINAL_PROMPT=0` forbids, so the
 * line is `could not read Username … terminal prompts disabled` (measured against the fake,
 * 2026-09-24, sitting 4 — NOT the plan's `Authentication failed`, which git prints only when
 * a helper supplied the credential).
 */
const AUTH_REFUSED =
  /could not read Username|Authentication failed|The requested URL returned error: 401/i

/** A push GitHub refused because its branch moved — not a hook, not a protection rule. */
const PUSH_CONFLICT = /! \[rejected\][^\n]*\((fetch first|non-fast-forward)\)/

/**
 * git with a GitHub token, the only way this codebase hands git one (Decision 4; Task 1
 * `[M5]`): through `GIT_CONFIG_*` in the ENVIRONMENT, never argv and never the URL — both of
 * which reach `String(error)` and from there a `SourceError` message on the wire. System AND
 * global config are ignored, so macOS's osxkeychain helper (Xcode's system gitconfig) never
 * stores or asks for a credential, and a developer's `~/.gitconfig` cannot change what the
 * platform does.
 *
 * **`GIT_TRACE_REDACT` is forced AFTER the spread** (`[M5]`, F3): an inherited
 * `GIT_TRACE_CURL=<file>` with `GIT_TRACE_REDACT=0` writes the header's base64 to that file,
 * where no message redactor reaches.
 *
 * The message is built from git's STDERR, never from `String(error)`, which begins with every
 * argument — and then redacted anyway, in case a remote echoes something back.
 *
 * `acceptExit` is for `git fetch`, which exits 1 when it refused a ref and still updated the
 * others: the caller reads the porcelain and decides (the driver's `sync`).
 */
export async function gitWithToken(
  args: readonly string[],
  o: {
    cwd: string
    token?: string
    timeoutMs?: number
    acceptExit?: readonly number[]
  },
): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GIT_TRACE_REDACT: '1',
  }
  const config: [string, string][] = [['credential.helper', '']]
  if (o.token !== undefined) {
    const basic = Buffer.from(`x-access-token:${o.token}`).toString('base64')
    config.push(['http.extraHeader', `Authorization: Basic ${basic}`])
  }
  config.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key
    env[`GIT_CONFIG_VALUE_${i}`] = value
  })
  env.GIT_CONFIG_COUNT = String(config.length)
  try {
    const { stdout } = await run('git', [...args], {
      cwd: o.cwd,
      env,
      maxBuffer: 32 * 1024 * 1024,
      timeout: o.timeoutMs ?? 120_000,
    })
    return stdout
  } catch (error) {
    const e = error as {
      code?: unknown
      stdout?: unknown
      stderr?: unknown
      killed?: unknown
    }
    if (typeof e.code === 'number' && (o.acceptExit ?? []).includes(e.code)) {
      return String(e.stdout ?? '')
    }
    const stderr = String(e.stderr ?? '').trim()
    // git's `hint:` lines explain; they never say what happened, and they can push the line
    // that does out of a short message.
    const said = stderr
      .split('\n')
      .filter((line) => line.length > 0 && !line.startsWith('hint:'))
      .slice(-5)
      .join(' | ')
    const what = `git ${args[0] ?? ''}`
    if (UNREACHABLE.test(stderr) || e.killed === true) {
      throw new SourceError(
        'SOURCE_UNREACHABLE',
        redactToken(`GitHub could not be reached (${what}): ${said}`, o.token),
      )
    }
    if (PUSH_CONFLICT.test(stderr)) {
      throw new SourceError(
        'SOURCE_CONFLICT',
        redactToken(
          `GitHub's branch moved since it was read (${what}); read it again and retry: ${said}`,
          o.token,
        ),
      )
    }
    throw new SourceError(
      'SOURCE_GIT_FAILED',
      redactToken(`${what} failed: ${said || 'no output'}`, o.token),
    )
  }
}

/** Whether a failure is GitHub refusing the token, which one fresh token may cure. */
export function isAuthRefusal(error: unknown): boolean {
  return (
    error instanceof SourceError &&
    error.code === 'SOURCE_GIT_FAILED' &&
    AUTH_REFUSED.test(error.message)
  )
}
