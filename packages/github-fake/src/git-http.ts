import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createGunzip } from 'node:zlib'
import type { Grant } from './app-auth.js'

/**
 * GIT OVER HTTP — git's "smart" protocol, served by core git alone (the plan's *Read this
 * first* 2, Task 1's `[M4]`): `GET …/info/refs?service=` answers a pkt-line service header
 * and `git <service> --stateless-rpc --advertise-refs`; `POST …/git-upload-pack` and
 * `…/git-receive-pack` pipe the request through `--stateless-rpc`. Alpine's git package has
 * no `git-http-backend`, and nothing here needs one.
 *
 * Four things over Task 1's probe, and they are GitHub's behaviour as git shows it:
 *  - no credential → `401` with `WWW-Authenticate: Basic realm="GitHub"`, so git asks for
 *    one (and, with `GIT_TERMINAL_PROMPT=0`, fails saying prompts are disabled);
 *  - a credential that cannot SEE the repository → `404` `Repository not found.` — GitHub
 *    hides a private repository's existence, from git as from the REST API;
 *  - `upload-pack` needs `contents: read` and `receive-pack` `contents: write`; short of it
 *    → `403` in GitHub's words — to an App's token, `Write access to repository not granted.`;
 *  - git runs with no system or global config, so the host's `~/.gitconfig` cannot change
 *    what the fake serves.
 *
 * **It records nothing about a credential except its login**, and only in a refusal.
 */

export const GIT_PATH =
  /^\/([^/]+)\/([^/]+?)(?:\.git)?\/(info\/refs|git-upload-pack|git-receive-pack)$/

export interface GitRoute {
  org: string
  repo: string
  op: 'info/refs' | 'git-upload-pack' | 'git-receive-pack'
}

export function gitRouteOf(pathname: string): GitRoute | undefined {
  const m = GIT_PATH.exec(pathname)
  if (m === null) return undefined
  const [, org, repo, op] = m as unknown as [string, string, string, GitRoute['op']]
  return { org, repo, op }
}

export interface GitContext {
  /** The repository's bare directory, when it exists and the credential can see it. */
  resolve(route: GitRoute, grant: Grant): { dir: string; fullName: string } | undefined
  /** Whether the Authorization header named a credential the fake does not recognise. */
  grant: Grant | undefined
  authorizationPresent: boolean
  /** Called once a push has been accepted by receive-pack. */
  onPushed(route: GitRoute): void
}

const pkt = (s: string) => (s.length + 4).toString(16).padStart(4, '0') + s

function plain(
  res: ServerResponse,
  status: number,
  text: string,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers })
  res.end(text)
}

/** git's environment: no system config, no global config, nothing of the caller's. */
function gitEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  }
}

export function serveGit(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  route: GitRoute,
  ctx: GitContext,
): void {
  if (ctx.grant === undefined) {
    // GitHub answers an anonymous request for a private (or absent) repository with a
    // challenge, never with a 404 that would say whether it exists.
    plain(
      res,
      401,
      ctx.authorizationPresent
        ? 'Invalid username or token. Password authentication is not supported for Git operations.\n'
        : '',
      { 'www-authenticate': 'Basic realm="GitHub"' },
    )
    return
  }
  const grant = ctx.grant
  const found = ctx.resolve(route, grant)
  if (found === undefined) return plain(res, 404, 'Repository not found.\n')

  const service = route.op === 'info/refs' ? url.searchParams.get('service') : route.op
  if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
    return plain(res, 403, 'Service not enabled.\n')
  }
  if ((route.op === 'info/refs') !== (req.method === 'GET')) {
    return plain(res, 405, 'Method not allowed.\n')
  }
  const held = grant.permissions.contents
  const allowed = service === 'git-upload-pack' ? held !== undefined : held === 'write'
  if (!allowed) {
    // GitHub's own words to an installation token, measured 2026-09-24 (conformance C11) —
    // not the "Permission to <repo> denied to <login>" that community answers report, which
    // is its answer to a PERSON.
    return plain(
      res,
      403,
      grant.kind === 'installation'
        ? 'Write access to repository not granted.\n'
        : `Permission to ${found.fullName}.git denied to ${grant.login}.\n`,
    )
  }

  const verb = service.slice(4)
  if (route.op === 'info/refs') {
    res.writeHead(200, {
      'content-type': `application/x-${service}-advertisement`,
      'cache-control': 'no-cache',
    })
    res.write(pkt(`# service=${service}\n`) + '0000')
    const p = spawn('git', [verb, '--stateless-rpc', '--advertise-refs', found.dir], {
      env: gitEnv(),
    })
    wire(p, res, `${verb} --advertise-refs`)
    p.stdout.pipe(res)
    return
  }

  res.writeHead(200, {
    'content-type': `application/x-${service}-result`,
    'cache-control': 'no-cache',
  })
  const p = spawn('git', [verb, '--stateless-rpc', found.dir], { env: gitEnv() })
  wire(p, res, verb)
  const body = req.headers['content-encoding'] === 'gzip' ? req.pipe(createGunzip()) : req
  body.pipe(p.stdin)
  p.stdout.pipe(res)
  if (service === 'git-receive-pack') {
    p.on('close', (code) => {
      if (code === 0) ctx.onPushed(route)
    })
  }
}

/**
 * A git that cannot start (not installed — Task 5's control (e)) or that fails is an
 * operator line and an ended response, never a request left hanging.
 */
function wire(p: ReturnType<typeof spawn>, res: ServerResponse, what: string): void {
  let stderr = ''
  p.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString()
  })
  p.on('error', (error) => {
    console.error(`github-fake: git ${what} could not start: ${error.message}`)
    if (!res.headersSent) plain(res, 500, 'git is not available\n')
    else res.end()
  })
  p.on('close', (code) => {
    if (code !== 0) {
      console.error(
        `github-fake: git ${what} exited ${code}: ${stderr.trim().slice(0, 500)}`,
      )
    }
  })
}
