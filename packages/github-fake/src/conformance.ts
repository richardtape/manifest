import { execFile } from 'node:child_process'
import { createSign, generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

/**
 * THE CONFORMANCE RUN (the D5 plan, Task 6) — Rich's decision's second half: *a short
 * opt-in run against a real GitHub App checks that the fake answers what GitHub answers.*
 *
 * One request script, run against a TARGET — the in-process fake on every `pnpm test`, or
 * real GitHub from `make github-conformance` at Rich's yes — recording a NORMALISED answer
 * per step: a status and a few facts, **never a token, a key, or an id that changes per
 * run**. `conformance.test.ts` holds the fake to `conformance/golden.json`; the real run
 * writes what GitHub said beside it, for a person to compare and fold in.
 *
 * **It signs its JWT with its own twelve lines**, and imports nothing from the control
 * plane or the fake's server, so a defect in either cannot be reproduced here and agree
 * with itself.
 *
 * **It creates at most two repositories, pushes one commit, and deletes both in a
 * `finally`**, printing their names if a delete fails. It never makes a repository public
 * (Decision 21).
 */

export interface ConformanceTarget {
  apiUrl: string
  gitUrl: string
  org: string
  appId: string
  installationId: string
  appKeyPem: string
  label: string
}

export type Fact = string | number | boolean | null

/** For an HTTP step `status` is the HTTP status; for a git step (C9, C11) it is git's exit code. */
export interface StepAnswer {
  step: string
  status: number
  facts: Record<string, Fact>
}

const run = promisify(execFile)
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

/** GitHub's App JWT, in its own twelve lines — deliberately not the control plane's `appJwt`. */
function jwt(keyPem: string, appId: string, opts: { expIn?: number } = {}): string {
  const t = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: appId,
    iat: t - 60,
    exp: t + (opts.expIn ?? 540),
  })}`
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(keyPem).toString('base64url')}`
}

/** `stateless` for `ghs_<APPID>_eyJ…`, `classic` for `ghs_` and 36 characters, else `other`. */
export function tokenClass(token: unknown): 'stateless' | 'classic' | 'other' {
  if (typeof token !== 'string') return 'other'
  if (/^ghs_\d+_eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    return 'stateless'
  if (/^ghs_[A-Za-z0-9]{36}$/.test(token)) return 'classic'
  return 'other'
}

/** A permission map as one comparable string: `administration:write,metadata:read`. */
function permissionsFact(p: unknown): string {
  if (p === null || typeof p !== 'object') return String(p)
  return Object.entries(p as Record<string, unknown>)
    .map(([k, v]) => `${k}:${String(v)}`)
    .sort()
    .join(',')
}

/**
 * git's first `remote:` or `fatal:` line, with `<org>/<repo>` for the repository's path —
 * GitHub echoes a login in its own case, so the replacement ignores case (ORIENTATION §7e)
 * — and `<host>` for the git URL, so the fake's line and GitHub's compare. **Only the PATH
 * is replaced, never a bare org name**: the real org (`Manifest-local-dev`) and the App's
 * bot login (`manifest-local-dev[bot]`) share a name, and a bare replacement would turn the
 * bot into `<org>[bot]` on GitHub and not on the fake.
 */
export function normaliseGitLine(
  stderr: string,
  names: { org: string; repo: string; gitUrl: string },
): string | null {
  const line = stderr.split('\n').find((l) => /^(remote|fatal):/.test(l.trim()))
  if (line === undefined) return null
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return line
    .trim()
    .replace(new RegExp(esc(names.gitUrl.replace(/\/$/, '')), 'gi'), '<host>')
    .replace(new RegExp(esc(`${names.org}/${names.repo}`), 'gi'), '<org>/<repo>')
    .replace(new RegExp(esc(names.repo), 'gi'), '<repo>')
}

/**
 * THE NO-SECRET RULE, asserted on every answer before anything reads or writes it: no
 * string anywhere in it may start `ghs_`, `ghp_` or `-----BEGIN`.
 */
export function assertNoSecrets(answers: readonly StepAnswer[]): void {
  const found: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      if (/(^|[^A-Za-z0-9])(ghs_|ghp_|-----BEGIN)/.test(v)) found.push(v)
    } else if (v !== null && typeof v === 'object') {
      for (const x of Object.values(v)) walk(x)
    }
  }
  walk(answers)
  if (found.length > 0) {
    throw new Error(
      `a conformance answer carries a credential: ${found.map((f) => f.slice(0, 12) + '…').join(', ')}`,
    )
  }
}

export async function runConformance(t: ConformanceTarget): Promise<StepAnswer[]> {
  const answers: StepAnswer[] = []
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const repoA = `mf-conformance-${stamp}-a`
  const repoB = `mf-conformance-${stamp}-b`
  const repoNever = `mf-conformance-${stamp}-never`
  const work = await mkdtemp(join(tmpdir(), 'mf-conformance-'))
  const created = new Set<string>()
  let adminToken = ''

  const api = async (method: string, path: string, auth: string, body?: unknown) => {
    const res = await fetch(`${t.apiUrl}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'manifest-conformance (the D5 plan, Task 6)',
        authorization: auth,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    let json: Record<string, unknown> = {}
    try {
      json = text === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
    } catch {
      json = {}
    }
    return { status: res.status, json }
  }
  const app = (opts?: { expIn?: number }) => `Bearer ${jwt(t.appKeyPem, t.appId, opts)}`
  const mint = (body: Record<string, unknown>) =>
    api('POST', `/app/installations/${t.installationId}/access_tokens`, app(), body)
  const record = (step: string, status: number, facts: Record<string, Fact> = {}) => {
    answers.push({ step, status, facts })
  }
  /** A step that throws is recorded as status -1 with its error, and the run goes on. */
  const step = async (name: string, body: () => Promise<void>) => {
    try {
      await body()
    } catch (error) {
      record(name, -1, { error: String(error).slice(0, 200) })
    }
  }
  const git = async (args: string[], opts: { cwd?: string; token?: string } = {}) => {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: work,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    }
    if (opts.token !== undefined) {
      // In the ENVIRONMENT, never an argument or a URL (the plan's Read this first 3).
      const basic = Buffer.from(`x-access-token:${opts.token}`).toString('base64')
      Object.assign(env, {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraHeader',
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
      })
    }
    try {
      const r = await run('git', args, { cwd: opts.cwd ?? work, env, timeout: 60_000 })
      return { code: 0, stdout: r.stdout, stderr: r.stderr }
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string }
      return {
        code: typeof e.code === 'number' ? e.code : 1,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? '',
      }
    }
  }
  const remote = (repo: string) => `${t.gitUrl}/${t.org}/${repo}.git`

  try {
    await step('C1', async () => {
      const r = await api('GET', '/app', app())
      record('C1', r.status, {
        slug_present: typeof r.json.slug === 'string' && r.json.slug !== '',
        permission_keys: Object.keys((r.json.permissions as object) ?? {})
          .sort()
          .join(','),
      })
    })
    await step('C2', async () => {
      const r = await api('GET', '/app', app({ expIn: 660 }))
      record('C2', r.status, { message: (r.json.message as string) ?? null })
    })
    await step('C3', async () => {
      const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
        .privateKey.export({ type: 'pkcs8', format: 'pem' })
        .toString()
      const r = await api('GET', '/app', `Bearer ${jwt(other, t.appId)}`)
      record('C3', r.status, { message: (r.json.message as string) ?? null })
    })
    await step('C4', async () => {
      const r = await api('GET', `/orgs/${t.org}/installation`, app())
      record('C4', r.status, {
        repository_selection: (r.json.repository_selection as string) ?? null,
      })
    })
    await step('C5', async () => {
      const r = await mint({ permissions: { administration: 'write' } })
      adminToken = typeof r.json.token === 'string' ? r.json.token : ''
      const expires = Date.parse(String(r.json.expires_at))
      record('C5', r.status, {
        token_class: tokenClass(r.json.token),
        expires_in_minutes: Number.isNaN(expires)
          ? null
          : Math.round((expires - Date.now()) / 60_000 / 5) * 5,
        permissions: permissionsFact(r.json.permissions),
        repository_selection: (r.json.repository_selection as string) ?? null,
      })
    })
    // Spec action 3's premise, measured directly: a token cannot NAME a repository that
    // does not exist yet. Creates nothing either way.
    await step('C5b', async () => {
      const r = await mint({
        repositories: [repoNever],
        permissions: { administration: 'write' },
      })
      record('C5b', r.status, { message: (r.json.message as string) ?? null })
    })
    const createdAt = Date.now()
    await step('C6', async () => {
      const r = await api('POST', `/orgs/${t.org}/repos`, `token ${adminToken}`, {
        name: repoA,
        private: true,
        auto_init: false,
      })
      if (r.status === 201) created.add(repoA)
      record('C6', r.status, {
        private: (r.json.private as boolean) ?? null,
        visibility: (r.json.visibility as string) ?? null,
        default_branch: (r.json.default_branch as string) ?? null,
      })
    })
    // Spec action 3's other half: can creation be SCOPED some other way — by a token that
    // names an existing repository? Tried for `-b` first; C7 then creates `-b` as planned
    // if this was refused. Never a third repository.
    await step('C7s', async () => {
      const scoped = await mint({
        repositories: [repoA],
        permissions: { administration: 'write' },
      })
      const token = typeof scoped.json.token === 'string' ? scoped.json.token : ''
      const r = await api('POST', `/orgs/${t.org}/repos`, `token ${token}`, {
        name: repoB,
        private: true,
      })
      if (r.status === 201) created.add(repoB)
      record('C7s', r.status, { message: (r.json.message as string) ?? null })
    })
    await step('C7', async () => {
      if (created.has(repoB)) return record('C7', 201, { created_by: 'C7s' })
      const r = await api('POST', `/orgs/${t.org}/repos`, `token ${adminToken}`, {
        name: repoB,
        private: true,
      })
      if (r.status === 201) created.add(repoB)
      record('C7', r.status)
    })
    let writeToken = ''
    await step('C8', async () => {
      const wait = createdAt + 1000 - Date.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      const r = await mint({ repositories: [repoA], permissions: { contents: 'write' } })
      writeToken = typeof r.json.token === 'string' ? r.json.token : ''
      record('C8', r.status, {
        repository_selection: (r.json.repository_selection as string) ?? null,
      })
    })
    await step('C9', async () => {
      const src = join(work, 'src')
      await git(['init', '-q', '-b', 'main', src])
      await writeFile(join(src, 'README.md'), 'conformance\n')
      await git(['add', 'README.md'], { cwd: src })
      await git(
        [
          '-c',
          'user.name=Manifest conformance',
          '-c',
          'user.email=conformance@manifest.invalid',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-qm',
          'conformance',
        ],
        { cwd: src },
      )
      const sha = (await git(['rev-parse', 'HEAD'], { cwd: src })).stdout.trim()
      const push = await git(['push', '-q', remote(repoA), 'main'], {
        cwd: src,
        token: writeToken,
      })
      const ls = await git(['ls-remote', remote(repoA), 'main'], { token: writeToken })
      record('C9', push.code, {
        ls_remote_shows_commit: sha !== '' && ls.stdout.includes(sha),
      })
    })
    await step('C10', async () => {
      const r = await api('GET', `/repos/${t.org}/${repoB}`, `token ${writeToken}`)
      record('C10', r.status, { message: (r.json.message as string) ?? null })
    })
    await step('C11', async () => {
      const read = await mint({
        repositories: [repoA],
        permissions: { contents: 'read' },
      })
      const token = typeof read.json.token === 'string' ? read.json.token : ''
      const src = join(work, 'src')
      await writeFile(join(src, 'second.md'), 'refused\n')
      await git(['add', 'second.md'], { cwd: src })
      await git(
        [
          '-c',
          'user.name=Manifest conformance',
          '-c',
          'user.email=conformance@manifest.invalid',
          '-c',
          'commit.gpgsign=false',
          'commit',
          '-qm',
          'refused',
        ],
        { cwd: src },
      )
      const push = await git(['push', remote(repoA), 'main'], { cwd: src, token })
      record('C11', push.code, {
        first_line: normaliseGitLine(push.stderr, {
          org: t.org,
          repo: repoA,
          gitUrl: t.gitUrl,
        }),
      })
    })
    await step('C12', async () => {
      const r = await api('PATCH', `/repos/${t.org}/${repoA}`, `token ${adminToken}`, {
        private: true,
      })
      record('C12', r.status, { private: (r.json.private as boolean) ?? null })
    })
    await step('C13', async () => {
      const r = await api(
        'PUT',
        `/repos/${t.org}/${repoA}/branches/main/protection`,
        `token ${adminToken}`,
        {
          required_status_checks: null,
          enforce_admins: false,
          required_pull_request_reviews: null,
          restrictions: null,
          allow_force_pushes: false,
          allow_deletions: false,
        },
      )
      record('C13', r.status, {
        message: r.status >= 400 ? ((r.json.message as string) ?? null) : null,
      })
    })
  } finally {
    // C14 — ALWAYS, so a failing step still removes both real repositories.
    // Only what THIS run created is deleted: a name it was refused (422) may be somebody
    // else's repository, and deleting it is never this script's to do.
    const statuses: string[] = []
    let worst = 204
    for (const repo of [repoA, repoB]) {
      if (!created.has(repo)) {
        statuses.push('not-created')
        worst = -1
        continue
      }
      try {
        const r = await api('DELETE', `/repos/${t.org}/${repo}`, `token ${adminToken}`)
        statuses.push(String(r.status))
        if (r.status === 204) created.delete(repo)
        else worst = r.status
      } catch {
        statuses.push('error')
        worst = -1
      }
    }
    record('C14', worst, { statuses: statuses.join(',') })
    if (created.size > 0) {
      console.error(
        `conformance: COULD NOT DELETE ${[...created].map((r) => `${t.org}/${r}`).join(', ')} on ${t.label} — remove by hand`,
      )
    }
    await rm(work, { recursive: true, force: true })
  }
  assertNoSecrets(answers)
  return answers
}
