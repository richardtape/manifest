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
import {
  loadState,
  repoDir,
  saveState,
  type FakeRepo,
  type FakeState,
  type Protection,
} from './state.js'
import {
  changesBetween,
  createWebhooks,
  pushPayload,
  refsOf,
  repositoryPayload,
  type RefChange,
  type Webhooks,
} from './webhooks.js'
import { installProtectionHook, writeProtection } from './protection.js'

const run = promisify(execFile)

/**
 * THE FAKE'S HTTP SURFACE — GitHub's REST API under `/api/v3` (GitHub Enterprise Server's
 * layout, so one host serves the API and git), git over HTTP at `/<org>/<repo>.git`, and the
 * fake's own `/_fake/*`, which GitHub does not have.
 *
 * It serves exactly what D5's driver 2 calls, and nothing more: the App (`GET /app`), its
 * installation, installation tokens, and an organisation's repositories — create, read,
 * change visibility, delete — and, after every push it accepts, one signed `push` webhook per
 * ref that moved (Task 9, `webhooks.ts`). Every JSON answer and payload is held to GitHub's
 * own schema by the unit tier; visibility events are Task 10's and protection Task 12's.
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
  /** What GitHub and the App's webhook both hold: every delivery is signed with it (Task 9). */
  webhookSecret: string
  /** Where deliveries go — the control plane's `/webhooks/github`. None: nothing is sent. */
  webhookUrl?: string
  /** The URLs the fake advertises in its answers — the HOST's view (Task 5). */
  urls: () => Urls
  now?: () => Date
  /** TEST-ONLY misbehaviour (`testing.ts`); `main.ts` never sets it. */
  quirks?: FakeQuirks
}

/**
 * TEST-ONLY MISBEHAVIOUR, never set by `main.ts` — so conformance never sees it. The object is
 * read at each request, so a test may change it mid-run.
 */
export interface FakeQuirks {
  /** Every repository is made PUBLIC whatever was asked — the answer Decision 12's check must refuse (Task 7). */
  createPublic?: boolean
  /** A change TO private is refused `422`, as an organisation's policy could (Task 10). */
  refusePrivatize?: boolean
  /**
   * FE-41 (the launch path plan's Task 6a, measured on real GitHub 2026-09-29): a repository GitHub
   * made seconds before is answered NOT FOUND over git — `404`, `Repository not found.` — for 2–4
   * s. Each count is how many requests of one kind, to each repository made through `POST
   * /orgs/{org}/repos` in this process, are answered so: `push` the push's first request (its
   * advertisement — git prints `remote: Repository not found.` and exits 128), `pushPack` its
   * second (the pack — git exits 1 with `Done` and no line for the ref: lp-starter-g's answer),
   * `fetch` a fetch's or an ls-remote's first, and `fetchPack` a fetch's second (git exits 128 with
   * `error: RPC failed; HTTP 404` and `fatal: the remote end hung up unexpectedly`). The refusals
   * MADE are counted, so a count raised mid-run refuses the next requests of that kind.
   */
  notFoundAfterCreate?: {
    push?: number
    pushPack?: number
    fetch?: number
    fetchPack?: number
  }
  /**
   * A fetch is served git's PROTOCOL V2 when its client asks — as GitHub serves it — where the fake
   * otherwise speaks v0 (FE-41's fix round 2). Under v2 a fetch's first POST is `ls-refs`, so
   * `fetchPack` refuses THAT, and git says `fatal: expected flush after ref listing`: GitHub's own
   * second-leg 404 in git's words, measured on github.com 2026-09-29 (lp-starter-m).
   */
  protocolV2?: boolean
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
  webhooks: Webhooks
  /** TEST SUPPORT: the `push` GitHub would send for this change, made by `faculty-dev`. */
  pushPayloadFor(name: string, change: RefChange): Promise<Record<string, unknown>>
}

export function createFakeServer(config: FakeConfig): FakeServer {
  const now = config.now ?? (() => new Date())
  const state = loadState(config.dataDir, { org: config.org, plan: config.plan })
  const save = () => saveState(config.dataDir, state)
  save()

  const webhooks = createWebhooks({
    secret: config.webhookSecret,
    url: config.webhookUrl,
    appId: config.appId,
    installationId: config.installationId,
    now,
    dataDir: config.dataDir,
  })

  const sameOrg = (org: string) => org.toLowerCase() === state.org.toLowerCase()
  const repoOf = (name: string): FakeRepo | undefined => state.repos[name.toLowerCase()]
  /** The `notFoundAfterCreate` quirk's refusals made so far, per repository created in this process. */
  const refusedSinceCreate = new Map<
    string,
    Record<keyof NonNullable<FakeQuirks['notFoundAfterCreate']>, number>
  >()

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
      // GitHub ADDS metadata: read to what it answers, whatever was requested (measured
      // 2026-09-24, conformance C5 — the documentation-first golden said only the request).
      permissions: { ...permissions, metadata: 'read' },
      repository_selection: repositories === 'all' ? 'all' : 'selected',
      ...(repositories === 'all'
        ? {}
        : { repositories: dedupe(named).map((r) => repoJson(r, grant)) }),
    }
  }

  async function createRepo(req: IncomingMessage, org: string) {
    const g = requireGrant(req)
    if (!sameOrg(org)) throw notFound()
    // administration: write, and NOTHING ELSE: GitHub does not confine creation to a token's
    // repositories. Measured 2026-09-24 (conformance C7s): a token SCOPED to one existing
    // repository created another. The fake first refused it — its guess at [M19](a) — and
    // follows GitHub now.
    if (g.permissions.administration !== 'write') {
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
    const visibility =
      config.quirks?.createPublic === true ? 'public' : visibilityOf(body, false)
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
    // Branch protection is enforced by the repository's own hook (Task 12): installed now,
    // it refuses nothing until a rule is PUT.
    await installProtectionHook(dir)
    state.repos[repo.name.toLowerCase()] = repo
    refusedSinceCreate.set(repo.name.toLowerCase(), {
      push: 0,
      pushPack: 0,
      fetch: 0,
      fetchPack: 0,
    })
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
      const wasPrivate = repo.private
      const nowPrivate = visibilityOf(body, repo.private) === 'private'
      if (nowPrivate && !wasPrivate && config.quirks?.refusePrivatize === true) {
        // TEST-ONLY (Task 10): the revert refused, as an organisation's policy could refuse it.
        throw new HttpError(
          422,
          'Visibility cannot be changed to private (the GitHub fake’s refusePrivatize quirk).',
        )
      }
      repo.private = nowPrivate
      save()
      // GitHub tells an App's webhook when a repository's visibility CHANGED (Task 10).
      if (nowPrivate !== wasPrivate) {
        webhooks.deliver(
          'repository',
          repositoryPayload({
            action: nowPrivate ? 'privatized' : 'publicized',
            repo,
            org: state.org,
            orgId: ORG_ID,
            urls: config.urls(),
            installationId: config.installationId,
            sender: { login: g.login, kind: g.kind },
          }),
        )
      }
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
    refusedSinceCreate.delete(repo.name.toLowerCase())
    save()
    await rm(repoDir(config.dataDir, state.org, repo.name), {
      recursive: true,
      force: true,
    })
  }

  /**
   * BRANCH PROTECTION, BY PLAN (the D5 plan's Task 12, Decision 13). On a FREE organisation a
   * PRIVATE repository cannot be protected: `403` with GitHub's upgrade message (measured,
   * conformance C13, 2026-09-24) — a public one can. On `team`, any can. Permission first, as
   * everywhere here: without `administration` it is GitHub's integration refusal. The fake
   * protects `main` only — the one branch Manifest protects — and says so for any other,
   * loudly rather than silently different.
   */
  function protectable(
    req: IncomingMessage,
    owner: string,
    name: string,
    branch: string,
    level: Permission,
  ): FakeRepo {
    const g = requireGrant(req)
    const repo = repoOf(name)
    if (!sameOrg(owner) || repo === undefined || !canSee(g, repo.name)) throw notFound()
    if (!can(g, repo.name, 'administration', level)) {
      throw new HttpError(403, 'Resource not accessible by integration')
    }
    if (state.plan === 'free' && repo.private) {
      throw new HttpError(
        403,
        'Upgrade to GitHub Pro or make this repository public to enable this feature.',
      )
    }
    if (branch !== 'main') {
      throw new HttpError(422, 'The GitHub fake protects only main (D5 plan, Task 12).')
    }
    return repo
  }

  /** GitHub's `protected-branch`, as much of it as the fake keeps — held to its schema. */
  function protectionJson(
    repo: FakeRepo,
    protection: Protection,
  ): Record<string, unknown> {
    const url = `${config.urls().apiUrl}/repos/${state.org}/${repo.name}/branches/main/protection`
    return {
      url,
      enforce_admins: { url: `${url}/enforce_admins`, enabled: false },
      required_linear_history: { enabled: false },
      allow_force_pushes: { enabled: protection.allowForcePushes },
      allow_deletions: { enabled: protection.allowDeletions },
      block_creations: { enabled: false },
      required_conversation_resolution: { enabled: false },
      lock_branch: { enabled: false },
      allow_fork_syncing: { enabled: false },
    }
  }

  async function protectBranch(
    req: IncomingMessage,
    owner: string,
    name: string,
    branch: string,
  ) {
    const repo = protectable(req, owner, name, branch, 'write')
    const body = await readJson(req)
    const protection: Protection = {
      allowForcePushes: body.allow_force_pushes === true,
      allowDeletions: body.allow_deletions === true,
    }
    repo.protection = protection
    save()
    await writeProtection(
      repoDir(config.dataDir, state.org, repo.name),
      branch,
      protection,
    )
    return protectionJson(repo, protection)
  }

  function readProtection(
    req: IncomingMessage,
    owner: string,
    name: string,
    branch: string,
  ) {
    const repo = protectable(req, owner, name, branch, 'read')
    if (repo.protection === null) throw new HttpError(404, 'Branch not protected')
    return protectionJson(repo, repo.protection)
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
    if ((m = /^\/repos\/([^/]+)\/([^/]+)\/branches\/([^/]+)\/protection$/.exec(path))) {
      const [owner, name, branch] = [m[1]!, m[2]!, decodeURIComponent(m[3]!)]
      if (method === 'PUT') return [200, await protectBranch(req, owner, name, branch)]
      if (method === 'GET') return [200, readProtection(req, owner, name, branch)]
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

  /**
   * A repository's `html_url` — where a PERSON lands from `Project.repository.webUrl` (the D5
   * plan's Task 15). GitHub shows the code there; **the fake says, in its own words, that it is
   * not GitHub, and shows none.** A STATED DIVERGENCE: GitHub answers an anonymous visitor to a
   * private repository 404, and this page names a repository the fake holds and its visibility
   * — on a loopback-only port, and nothing Manifest calls reads it.
   */
  function repositoryPage(res: ServerResponse, owner: string, name: string): void {
    const repo = sameOrg(owner) ? repoOf(name) : undefined
    const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
    const held =
      repo === undefined
        ? `<p>It holds no repository named <code>${esc(owner)}/${esc(name)}</code>.</p>`
        : `<p>It holds <code>${esc(state.org)}/${esc(repo.name)}</code>, which is <strong>${repo.private ? 'private' : 'PUBLIC'}</strong>. ` +
          `Its code is not shown here: clone <code>${esc(config.urls().gitUrl)}/${esc(state.org)}/${esc(repo.name)}.git</code> with a token.</p>`
    res.writeHead(repo === undefined ? 404 : 200, {
      'content-type': 'text/html; charset=utf-8',
    })
    res.end(
      `<!doctype html>\n<meta charset="utf-8">\n<title>${esc(owner)}/${esc(name)} — not GitHub</title>\n` +
        `<h1>This is not GitHub.</h1>\n` +
        `<p>This page is served by <code>manifest-github-fake</code>, the GitHub-compatible fake that Manifest's ` +
        `GitHub source driver is accepted against on one laptop, offline (the D5 plan). A real GitHub organisation ` +
        `would show the repository's code here; the fake has no web interface.</p>\n${held}\n`,
    )
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    if (url.pathname === '/_fake/health') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok\n')
      return
    }
    if (url.pathname === '/_fake/deliveries' && req.method === 'GET') {
      return json(res, 200, webhooks.deliveries())
    }
    const again = /^\/_fake\/deliveries\/([^/]+)\/redeliver$/.exec(url.pathname)
    if (again !== null && req.method === 'POST') {
      return webhooks.redeliver(again[1]!)
        ? json(res, 200, { redelivered: again[1] })
        : json(res, 404, new HttpError(404, 'Not Found').body)
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
        protocolV2: config.quirks?.protocolV2 === true,
        resolve: (r, g) => {
          const repo = repoOf(r.repo)
          if (!sameOrg(r.org) || repo === undefined || !canSee(g, repo.name))
            return undefined
          return {
            dir: repoDir(config.dataDir, state.org, repo.name),
            fullName: `${state.org}/${repo.name}`,
          }
        },
        notYetFound: (r, service) => {
          const counts = config.quirks?.notFoundAfterCreate
          const made = refusedSinceCreate.get(r.repo.toLowerCase())
          if (counts === undefined || made === undefined) return false
          const advertisement = r.op === 'info/refs'
          const kind =
            service === 'git-receive-pack'
              ? advertisement
                ? 'push'
                : 'pushPack'
              : advertisement
                ? 'fetch'
                : 'fetchPack'
          if (made[kind] >= (counts[kind] ?? 0)) return false
          made[kind] += 1
          return true
        },
        onPushed: async (r, pusher, previous) => {
          const repo = repoOf(r.repo)
          if (repo === undefined) return
          repo.pushedAt = timestamp(now())
          save()
          // ONE `push` per ref that moved, as GitHub sends them.
          const dir = repoDir(config.dataDir, state.org, repo.name)
          for (const change of changesBetween(previous, await refsOf(dir))) {
            webhooks.deliver(
              'push',
              await pushPayload({
                dir,
                repo,
                org: state.org,
                orgId: ORG_ID,
                urls: config.urls(),
                installationId: config.installationId,
                change,
                previous,
                pusher: { login: pusher.login, kind: pusher.kind },
              }),
            )
          }
        },
      })
      return
    }
    const page = /^\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname)
    if (page !== null && req.method === 'GET') {
      return repositoryPage(
        res,
        decodeURIComponent(page[1]!),
        decodeURIComponent(page[2]!),
      )
    }
    json(res, 404, new HttpError(404, 'Not Found').body)
  })

  async function pushPayloadFor(name: string, change: RefChange) {
    const repo = repoOf(name)
    if (repo === undefined) throw new Error(`the fake has no repository '${name}'`)
    return pushPayload({
      dir: repoDir(config.dataDir, state.org, repo.name),
      repo,
      org: state.org,
      orgId: ORG_ID,
      urls: config.urls(),
      installationId: config.installationId,
      change,
      previous: new Map(),
      pusher: { login: 'faculty-dev', kind: 'person' },
    })
  }

  return { server, state, webhooks, pushPayloadFor }
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
