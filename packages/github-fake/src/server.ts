import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { KeyObject } from 'node:crypto'
import { promisify } from 'node:util'
import {
  grantFor,
  mintInstallationToken,
  verifyAppJwt,
  type Grant,
  type Permission,
} from './app-auth.js'
import { gitRouteOf, serveGit } from './git-http.js'
import { fullRepository, orgUser, nodeId, validRepoName, type Urls } from './repos.js'
import { loadState, repoDir, saveState, type FakeRepo, type FakeState } from './state.js'

const run = promisify(execFile)

/**
 * THE FAKE'S HTTP SURFACE — GitHub's REST API under `/api/v3` (GitHub Enterprise Server's
 * layout, so one host serves the API and git), git over HTTP at `/<org>/<repo>.git`, and the
 * fake's own `/_fake/*`, which GitHub does not have.
 *
 * It serves exactly what D5's driver 2 calls, and nothing more: the App (`GET /app`), its
 * installation, installation tokens, and an organisation's repositories — create, read,
 * change visibility, delete. Every JSON answer is held to GitHub's own schema by the unit
 * tier; webhooks are Task 9's, visibility events Task 10's and branch protection Task 12's.
 */

export interface FakeConfig {
  dataDir: string
  org: string
  plan: 'free' | 'team'
  appId: string
  installationId: string
  /** The App's PUBLIC key — GitHub holds only this half, and so does the fake. */
  appPublicKey: KeyObject
  /** The HMAC key installation tokens are signed with; only the fake holds it. */
  tokenKey: Buffer
  developerToken: string
  /** The URLs the fake advertises in its answers — the HOST's view (Task 5). */
  urls: () => Urls
  now?: () => Date
}

/** The App's permissions — exactly what `Manifest (local dev)` is registered with. */
const APP_PERMISSIONS = {
  administration: 'write',
  contents: 'write',
  metadata: 'read',
} as const
type PermissionName = keyof typeof APP_PERMISSIONS
const ORG_ID = 3000001
const APP_SLUG = 'manifest-local-dev'
const CREATED_AT = '2026-09-24T00:00:00Z'

class HttpError extends Error {
  readonly status: number
  readonly body: Record<string, unknown>
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.body = {
      message,
      ...extra,
      documentation_url: 'https://docs.github.com/rest',
      status: String(status),
    }
  }
}

const notFound = () => new HttpError(404, 'Not Found')

function json(res: ServerResponse, status: number, body: unknown): void {
  if (status === 204) {
    res.writeHead(204)
    res.end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 1024 * 1024) throw new HttpError(413, 'Payload too large')
    chunks.push(chunk as Buffer)
  }
  if (size === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Problems parsing JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'Problems parsing JSON')
  }
  return parsed as Record<string, unknown>
}

/** GitHub's answer to a private repository you may not see is 404, never 403 — it hides existence. */
function canSee(g: Grant | undefined, repo: string): boolean {
  const name = repo.toLowerCase()
  return (
    g !== undefined &&
    (g.repositories === 'all' || g.repositories.some((r) => r.toLowerCase() === name))
  )
}
function can(
  g: Grant | undefined,
  repo: string,
  perm: 'administration' | 'contents',
  level: Permission,
): boolean {
  if (!canSee(g, repo)) return false
  const held = g!.permissions[perm]
  return held === 'write' || (level === 'read' && held === 'read')
}

export interface FakeServer {
  server: Server
  state: FakeState
}

export function createFakeServer(config: FakeConfig): FakeServer {
  const now = config.now ?? (() => new Date())
  const state = loadState(config.dataDir, { org: config.org, plan: config.plan })
  const save = () => saveState(config.dataDir, state)
  save()

  const sameOrg = (org: string) => org.toLowerCase() === state.org.toLowerCase()
  const repoOf = (name: string): FakeRepo | undefined => state.repos[name.toLowerCase()]

  const appJson = () => {
    const u = config.urls()
    return {
      id: Number(config.appId),
      slug: APP_SLUG,
      node_id: nodeId('A_', Number(config.appId)),
      client_id: `Iv23fake${config.appId}`,
      owner: orgUser(state.org, ORG_ID, u),
      name: 'Manifest (local dev)',
      description: 'The GitHub FAKE’s App (D5 plan, Task 4). Not GitHub.',
      external_url: `${u.gitUrl}/${state.org}`,
      html_url: `${u.gitUrl}/apps/${APP_SLUG}`,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
      permissions: { ...APP_PERMISSIONS },
      events: [],
      installations_count: 1,
    }
  }

  const installationJson = () => {
    const u = config.urls()
    const id = Number(config.installationId)
    return {
      id,
      account: orgUser(state.org, ORG_ID, u),
      repository_selection: 'all',
      access_tokens_url: `${u.apiUrl}/app/installations/${id}/access_tokens`,
      repositories_url: `${u.apiUrl}/installation/repositories`,
      html_url: `${u.gitUrl}/organizations/${state.org}/settings/installations/${id}`,
      app_id: Number(config.appId),
      client_id: `Iv23fake${config.appId}`,
      app_slug: APP_SLUG,
      target_id: ORG_ID,
      target_type: 'Organization',
      permissions: { ...APP_PERMISSIONS },
      events: [],
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
      single_file_name: null,
      has_multiple_single_files: false,
      single_file_paths: [],
      suspended_by: null,
      suspended_at: null,
    }
  }

  const repoJson = (repo: FakeRepo, g: Grant) =>
    fullRepository(repo, {
      org: state.org,
      orgId: ORG_ID,
      urls: config.urls(),
      permissions: {
        admin: g.permissions.administration === 'write',
        maintain: g.permissions.administration === 'write',
        push: g.permissions.contents === 'write',
        triage: g.permissions.contents === 'write',
        pull: true,
      },
    })

  /** The App authenticates as itself only with a JWT (the three `/app…` and `/orgs/…/installation` routes). */
  const requireAppJwt = (req: IncomingMessage) => {
    const verdict = verifyAppJwt(
      req.headers.authorization,
      config.appPublicKey,
      config.appId,
      now(),
    )
    if (!verdict.ok) throw new HttpError(401, verdict.message)
  }

  /** An installation token or the PAT; anything else is `401`, as GitHub answers it. */
  const requireGrant = (req: IncomingMessage): Grant => {
    const g = grantFor(req.headers.authorization, {
      tokenKey: config.tokenKey,
      developerToken: config.developerToken,
      now: now(),
    })
    if (g === undefined) {
      throw new HttpError(
        401,
        req.headers.authorization ? 'Bad credentials' : 'Requires authentication',
      )
    }
    return g
  }

  async function mintToken(req: IncomingMessage, installationId: string) {
    requireAppJwt(req)
    if (installationId !== config.installationId) throw notFound()
    const body = await readJson(req)
    const requested = body.permissions
    let permissions: Record<string, Permission> = { ...APP_PERMISSIONS }
    if (requested !== undefined) {
      if (
        requested === null ||
        typeof requested !== 'object' ||
        Array.isArray(requested)
      ) {
        throw new HttpError(422, 'Invalid request.')
      }
      permissions = {}
      for (const [name, level] of Object.entries(requested)) {
        const granted = APP_PERMISSIONS[name as PermissionName] as Permission | undefined
        const ok =
          granted !== undefined &&
          (level === granted || (level === 'read' && granted === 'write'))
        if (!ok)
          throw new HttpError(
            422,
            'The permissions requested are not granted to this installation.',
          )
        permissions[name] = level as Permission
      }
    }
    const names = body.repositories
    const ids = body.repository_ids
    let repositories: 'all' | string[] = 'all'
    const named: FakeRepo[] = []
    if (names !== undefined || ids !== undefined) {
      const wantNames = Array.isArray(names) ? names : []
      const wantIds = Array.isArray(ids) ? ids : []
      if (
        (names !== undefined && !Array.isArray(names)) ||
        (ids !== undefined && !Array.isArray(ids))
      ) {
        throw new HttpError(422, 'Invalid request.')
      }
      for (const n of wantNames) {
        const r = typeof n === 'string' ? repoOf(n) : undefined
        if (r === undefined) throw inaccessible()
        named.push(r)
      }
      for (const id of wantIds) {
        const r = Object.values(state.repos).find((x) => x.id === id)
        if (r === undefined) throw inaccessible()
        named.push(r)
      }
      repositories = [...new Set(named.map((r) => r.name))]
    }
    const perms = {
      administration: permissions.administration,
      contents: permissions.contents,
      metadata: permissions.metadata,
    }
    const { token, expiresAt } = mintInstallationToken({
      appId: config.appId,
      installationId: config.installationId,
      tokenKey: config.tokenKey,
      repositories,
      permissions: perms,
      now: now(),
    })
    const grant: Grant = {
      kind: 'installation',
      login: `${APP_SLUG}[bot]`,
      repositories,
      permissions: perms,
    }
    return {
      token,
      expires_at: expiresAt,
      permissions,
      repository_selection: repositories === 'all' ? 'all' : 'selected',
      ...(repositories === 'all'
        ? {}
        : { repositories: dedupe(named).map((r) => repoJson(r, grant)) }),
    }
  }

  async function createRepo(req: IncomingMessage, org: string) {
    const g = requireGrant(req)
    if (!sameOrg(org)) throw notFound()
    // A token scoped to NAMED repositories cannot name the one being created, so creating
    // needs an installation-wide token — the fake's conservative guess at [M19](a), which
    // the real App's conformance run measures.
    if (g.permissions.administration !== 'write' || g.repositories !== 'all') {
      throw new HttpError(403, 'Resource not accessible by integration')
    }
    const body = await readJson(req)
    if (!validRepoName(body.name)) {
      throw new HttpError(422, 'Repository creation failed.', {
        errors: [
          {
            resource: 'Repository',
            code: 'custom',
            field: 'name',
            message: 'name is invalid',
          },
        ],
      })
    }
    if (body.auto_init === true) {
      // Loud rather than silently different: GitHub would commit a README here.
      throw new HttpError(
        422,
        'The GitHub fake does not implement auto_init (D5 plan, Task 4).',
      )
    }
    if (repoOf(body.name) !== undefined) {
      throw new HttpError(422, 'Repository creation failed.', {
        errors: [
          {
            resource: 'Repository',
            code: 'custom',
            field: 'name',
            message: 'name already exists on this account',
          },
        ],
      })
    }
    const visibility = visibilityOf(body, false)
    const createdAt = timestamp(now())
    const repo: FakeRepo = {
      id: state.nextRepoId++,
      name: body.name,
      private: visibility === 'private',
      createdAt,
      pushedAt: null,
      protection: null,
    }
    const dir = repoDir(config.dataDir, state.org, repo.name)
    // `-b main`: without it a bare repository's HEAD names `master`, and a clone of it
    // "succeeds" with nothing checked out (the plan's [M4], F2).
    await run('git', ['init', '--quiet', '--bare', '-b', 'main', dir], {
      env: {
        PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
      },
    })
    state.repos[repo.name.toLowerCase()] = repo
    save()
    return repoJson(repo, g)
  }

  function readRepo(req: IncomingMessage, owner: string, name: string) {
    const g = requireGrant(req)
    const repo = repoOf(name)
    if (!sameOrg(owner) || repo === undefined || !canSee(g, repo.name)) throw notFound()
    return repoJson(repo, g)
  }

  async function patchRepo(req: IncomingMessage, owner: string, name: string) {
    const g = requireGrant(req)
    const repo = repoOf(name)
    if (!sameOrg(owner) || repo === undefined || !canSee(g, repo.name)) throw notFound()
    if (!can(g, repo.name, 'administration', 'write')) {
      throw new HttpError(403, 'Resource not accessible by integration')
    }
    const body = await readJson(req)
    if (body.private !== undefined || body.visibility !== undefined) {
      repo.private = visibilityOf(body, repo.private) === 'private'
      save()
    }
    return repoJson(repo, g)
  }

  async function deleteRepo(req: IncomingMessage, owner: string, name: string) {
    const g = requireGrant(req)
    const repo = repoOf(name)
    if (!sameOrg(owner) || repo === undefined || !canSee(g, repo.name)) throw notFound()
    if (!can(g, repo.name, 'administration', 'write')) {
      throw new HttpError(403, 'Must have admin rights to Repository.')
    }
    delete state.repos[repo.name.toLowerCase()]
    save()
    await rm(repoDir(config.dataDir, state.org, repo.name), {
      recursive: true,
      force: true,
    })
  }

  async function api(req: IncomingMessage, path: string): Promise<[number, unknown]> {
    const method = req.method ?? 'GET'
    let m: RegExpExecArray | null
    if (path === '/app' && method === 'GET') {
      requireAppJwt(req)
      return [200, appJson()]
    }
    if ((m = /^\/orgs\/([^/]+)\/installation$/.exec(path)) && method === 'GET') {
      requireAppJwt(req)
      if (!sameOrg(m[1]!)) throw notFound()
      return [200, installationJson()]
    }
    if (
      (m = /^\/app\/installations\/([^/]+)\/access_tokens$/.exec(path)) &&
      method === 'POST'
    ) {
      return [201, await mintToken(req, m[1]!)]
    }
    if ((m = /^\/orgs\/([^/]+)\/repos$/.exec(path)) && method === 'POST') {
      return [201, await createRepo(req, m[1]!)]
    }
    if ((m = /^\/repos\/([^/]+)\/([^/]+)$/.exec(path))) {
      const [owner, name] = [m[1]!, m[2]!]
      if (method === 'GET') return [200, readRepo(req, owner, name)]
      if (method === 'PATCH') return [200, await patchRepo(req, owner, name)]
      if (method === 'DELETE') {
        await deleteRepo(req, owner, name)
        return [204, undefined]
      }
    }
    throw notFound()
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    if (url.pathname === '/_fake/health') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok\n')
      return
    }
    if (url.pathname === '/api/v3' || url.pathname.startsWith('/api/v3/')) {
      api(req, url.pathname.slice('/api/v3'.length))
        .then(([status, body]) => json(res, status, body))
        .catch((error: unknown) => {
          if (error instanceof HttpError) return json(res, error.status, error.body)
          console.error(
            `github-fake: ${req.method} ${url.pathname} failed: ${String(error)}`,
          )
          json(res, 500, { message: 'Server Error' })
        })
      return
    }
    const route = gitRouteOf(url.pathname)
    if (route !== undefined) {
      const grant = grantFor(req.headers.authorization, {
        tokenKey: config.tokenKey,
        developerToken: config.developerToken,
        now: now(),
      })
      serveGit(req, res, url, route, {
        grant,
        authorizationPresent: req.headers.authorization !== undefined,
        resolve: (r, g) => {
          const repo = repoOf(r.repo)
          if (!sameOrg(r.org) || repo === undefined || !canSee(g, repo.name))
            return undefined
          return {
            dir: repoDir(config.dataDir, state.org, repo.name),
            fullName: `${state.org}/${repo.name}`,
          }
        },
        onPushed: (r) => {
          const repo = repoOf(r.repo)
          if (repo === undefined) return
          repo.pushedAt = timestamp(now())
          save()
        },
      })
      return
    }
    json(res, 404, new HttpError(404, 'Not Found').body)
  })

  return { server, state }
}

function inaccessible() {
  return new HttpError(
    422,
    'There is at least one repository that does not exist or is not accessible to the parent installation.',
  )
}

/**
 * GitHub's `POST /orgs/{org}/repos` defaults `private` to FALSE — a repository is PUBLIC
 * unless asked otherwise — and `visibility` wins over `private` when both are sent. The fake
 * keeps GitHub's default, so a driver that forgets `private: true` gets a public repository
 * here exactly as it would on GitHub (Decision 12's check is what must catch it).
 */
function visibilityOf(
  body: Record<string, unknown>,
  currentlyPrivate: boolean,
): 'private' | 'public' {
  if (body.visibility !== undefined) {
    if (body.visibility === 'private' || body.visibility === 'public')
      return body.visibility
    throw new HttpError(
      422,
      'Visibility can only be public or private for this organization.',
    )
  }
  if (body.private === undefined) return currentlyPrivate ? 'private' : 'public'
  if (typeof body.private !== 'boolean') throw new HttpError(422, 'Invalid request.')
  return body.private ? 'private' : 'public'
}

function dedupe(repos: FakeRepo[]): FakeRepo[] {
  return [...new Map(repos.map((r) => [r.id, r])).values()]
}

/** GitHub's timestamps: ISO 8601, whole seconds, `Z`. */
function timestamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
