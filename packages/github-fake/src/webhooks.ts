import { execFile } from 'node:child_process'
import { createHmac, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fullRepository, nodeId, simpleUser, type Urls } from './repos.js'
import type { FakeRepo } from './state.js'

const run = promisify(execFile)

/**
 * THE FAKE'S WEBHOOKS (the D5 plan's Task 9) — what GitHub sends an App's webhook URL, as far
 * as D5's driver 2 reads it: one `push` per ref a push moved. **Signed as GitHub signs**:
 * `X-Hub-Signature-256` (HMAC-SHA256 of the exact bytes sent, under the App's webhook
 * secret) and the legacy `X-Hub-Signature` (SHA-1), which GitHub still sends *"for legacy
 * purposes"* and which a receiver must never accept on its own (Decision 9). The signer is
 * held to GitHub's own published test vector (`webhooks.test.ts`).
 *
 * Delivered as GitHub delivers: AFTER the push is accepted, with a 10-second timeout, and
 * the answer recorded — never retried. **A redelivery keeps its delivery id**, which is the
 * fake's choice and is UNMEASURED against GitHub (Decision 10): the receiver's once-only
 * record is what makes either answer safe.
 */

export function sign(
  secret: string | Buffer,
  body: Buffer,
): { sha256: string; sha1: string } {
  return {
    sha256: `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
    sha1: `sha1=${createHmac('sha1', secret).update(body).digest('hex')}`,
  }
}

/** One attempt, as `GET /_fake/deliveries` lists it. The payload is not in the log. */
export interface Delivery {
  id: string
  event: string
  url: string
  /** The receiver's status, or `null` when there was no answer — `error` says why. */
  status: number | null
  /**
   * The receiver's answer BODY, its first 300 characters (the D5 plan's Task 15): a status
   * alone cannot tell a `200 { duplicate: true }` from a ping's `200`. GitHub's own delivery
   * log shows the response body too. Absent when there was no answer.
   */
  answer?: string
  error?: string
  deliveredAt: string
}

export interface Webhooks {
  /** Sends one delivery. Returns once it is IN FLIGHT; `idle()` waits for its answer. */
  deliver(event: string, payload: unknown): void
  /** Re-sends a delivery's exact bytes under its own id; `false` for an id never sent. */
  redeliver(id: string): boolean
  deliveries(): Delivery[]
  setUrl(url: string | undefined): void
  /** Resolves when no delivery is in flight. */
  idle(): Promise<void>
}

/** GitHub's own window: *"You can redeliver a webhook delivery from the past 3 days."* */
const KEPT_MS = 3 * 24 * 60 * 60 * 1000
const FILE = 'deliveries.json'

interface Saved {
  log: Delivery[]
  sent: { id: string; event: string; body: string; at: string }[]
}

export function createWebhooks(o: {
  secret: string
  url: string | undefined
  appId: string
  installationId: string
  now?: () => Date
  /**
   * Where the log and every delivery's bytes are KEPT (the D5 plan's Task 15), so a restarted
   * fake can still list and redeliver them, as GitHub can — three days of them. None: memory.
   */
  dataDir?: string
}): Webhooks {
  const now = o.now ?? (() => new Date())
  let url = o.url
  const saved: Saved =
    o.dataDir !== undefined && existsSync(join(o.dataDir, FILE))
      ? (JSON.parse(readFileSync(join(o.dataDir, FILE), 'utf8')) as Saved)
      : { log: [], sent: [] }
  const log: Delivery[] = saved.log
  const sent = new Map<string, { event: string; body: Buffer; at: string }>(
    saved.sent.map((d) => [
      d.id,
      { event: d.event, body: Buffer.from(d.body, 'base64'), at: d.at },
    ]),
  )
  const inFlight = new Set<Promise<void>>()
  /** Written to a temporary file and renamed over, as the state is; older than 3 days: gone. */
  function save(): void {
    if (o.dataDir === undefined) return
    const since = now().getTime() - KEPT_MS
    const kept = (at: string) => Date.parse(at) >= since
    const next: Saved = {
      log: log.filter((d) => kept(d.deliveredAt)),
      sent: [...sent]
        .filter(([, d]) => kept(d.at))
        .map(([id, d]) => ({
          id,
          event: d.event,
          body: d.body.toString('base64'),
          at: d.at,
        })),
    }
    mkdirSync(o.dataDir, { recursive: true })
    const tmp = join(o.dataDir, `${FILE}.tmp`)
    writeFileSync(tmp, JSON.stringify(next))
    renameSync(tmp, join(o.dataDir, FILE))
  }

  function send(id: string, event: string, body: Buffer): void {
    if (url === undefined) return
    const target = url
    const { sha256, sha1 } = sign(o.secret, body)
    const attempt = fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'GitHub-Hookshot/fake',
        'x-github-event': event,
        'x-github-delivery': id,
        'x-hub-signature-256': sha256,
        'x-hub-signature': sha1,
        'x-github-hook-installation-target-type': 'integration',
        'x-github-hook-installation-target-id': o.appId,
      },
      body: new Uint8Array(body), // the same bytes; `Buffer` is not a `BodyInit` to tsc 5.9
      signal: AbortSignal.timeout(10_000),
    }).then(
      async (res) => {
        const answer = (await res.text().catch(() => '')).slice(0, 300)
        log.push({
          id,
          event,
          url: target,
          status: res.status,
          answer,
          deliveredAt: stamp(),
        })
        save()
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        log.push({
          id,
          event,
          url: target,
          status: null,
          error: message,
          deliveredAt: stamp(),
        })
        save()
      },
    )
    inFlight.add(attempt)
    void attempt.finally(() => inFlight.delete(attempt))
  }
  const stamp = () => now().toISOString()

  return {
    deliver(event, payload) {
      if (url === undefined) return
      const id = randomUUID()
      const body = Buffer.from(JSON.stringify(payload))
      sent.set(id, { event, body, at: stamp() })
      save()
      send(id, event, body)
    },
    redeliver(id) {
      const d = sent.get(id)
      if (d === undefined) return false
      send(id, d.event, d.body)
      return true
    },
    deliveries: () => log.map((d) => ({ ...d })),
    setUrl(next) {
      url = next
    },
    async idle() {
      while (inFlight.size > 0) await Promise.all([...inFlight])
    },
  }
}

/** A ref a push moved: `before` is forty zeros for a ref it created, `after` for one it deleted. */
export interface RefChange {
  ref: string
  before: string
  after: string
}

export const ZERO = '0'.repeat(40)

/** Who pushed, as the fake knows them: the App's installation or `faculty-dev`. */
export interface Pusher {
  login: string
  kind: 'installation' | 'person'
}

const USER_IDS = { installation: 5000001, person: 4000001 } as const

/** git in the fake's bare repository: no system or global config, nothing of the caller's. */
async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', args, {
    cwd: dir,
    env: {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    },
    maxBuffer: 16 * 1024 * 1024,
  })
  return stdout
}

/** Every ref in a bare repository, `ref → commit`. */
export async function refsOf(dir: string): Promise<Map<string, string>> {
  const out = await git(dir, ['for-each-ref', '--format=%(refname) %(objectname)'])
  return new Map(
    out
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => l.split(' ') as [string, string]),
  )
}

/** What moved between two snapshots, one entry per ref, in ref order. */
export function changesBetween(
  before: Map<string, string>,
  after: Map<string, string>,
): RefChange[] {
  const refs = [...new Set([...before.keys(), ...after.keys()])].sort()
  return refs
    .map((ref) => ({
      ref,
      before: before.get(ref) ?? ZERO,
      after: after.get(ref) ?? ZERO,
    }))
    .filter((c) => c.before !== c.after)
}

/**
 * GitHub's `push` payload for one ref (`webhook push` in `github-schemas.json`, which holds
 * it). `commits` lists at most the newest twenty, oldest first, as GitHub does; `forced` is
 * true when `before` is not an ancestor of `after`.
 */
export async function pushPayload(ctx: {
  dir: string
  repo: FakeRepo
  org: string
  orgId: number
  urls: Urls
  installationId: string
  change: RefChange
  /** Every ref's commit BEFORE the push — what a created ref's new commits are measured against. */
  previous: Map<string, string>
  pusher: Pusher
}): Promise<Record<string, unknown>> {
  const { change, urls } = ctx
  const created = change.before === ZERO
  const deleted = change.after === ZERO
  const web = `${urls.gitUrl}/${ctx.org}/${ctx.repo.name}`
  let range: string[] = []
  if (!deleted) {
    range = created
      ? [change.after, '--not', ...[...ctx.previous.values()]]
      : [`${change.before}..${change.after}`]
  }
  const commits = deleted ? [] : await commitsIn(ctx.dir, range, web)
  const forced =
    !created &&
    !deleted &&
    !(await git(ctx.dir, [
      'merge-base',
      '--is-ancestor',
      change.before,
      change.after,
    ]).then(
      () => true,
      () => false,
    ))
  const head = deleted
    ? null
    : ((await commitsIn(ctx.dir, ['-1', change.after], web))[0] ?? null)
  // A webhook's repository carries no `permissions`: it is nobody's view of it.
  const repository = fullRepository(ctx.repo, {
    org: ctx.org,
    orgId: ctx.orgId,
    urls,
    permissions: {
      admin: false,
      maintain: false,
      push: false,
      triage: false,
      pull: true,
    },
  })
  delete repository.permissions
  const id = USER_IDS[ctx.pusher.kind]
  const type = ctx.pusher.kind === 'installation' ? 'Bot' : 'User'
  return {
    ref: change.ref,
    before: change.before,
    after: change.after,
    created,
    deleted,
    forced,
    base_ref: null,
    compare: created
      ? `${web}/commit/${change.after.slice(0, 12)}`
      : `${web}/compare/${change.before.slice(0, 12)}...${change.after.slice(0, 12)}`,
    commits,
    head_commit: head,
    repository,
    pusher: { name: ctx.pusher.login, email: null },
    sender: simpleUser(ctx.pusher.login, id, type, urls),
    installation: {
      id: Number(ctx.installationId),
      node_id: nodeId('MDIz', Number(ctx.installationId)),
    },
  }
}

/**
 * GitHub's `repository` payload for a visibility change (Task 10): `publicized` is
 * `webhook repository-publicized` in `github-schemas.json`, which holds it; `privatized` is
 * the same shape with the other action.
 */
export function repositoryPayload(ctx: {
  action: 'publicized' | 'privatized'
  repo: FakeRepo
  org: string
  orgId: number
  urls: Urls
  installationId: string
  sender: Pusher
}): Record<string, unknown> {
  const repository = fullRepository(ctx.repo, {
    org: ctx.org,
    orgId: ctx.orgId,
    urls: ctx.urls,
    permissions: {
      admin: false,
      maintain: false,
      push: false,
      triage: false,
      pull: true,
    },
  })
  delete repository.permissions
  return {
    action: ctx.action,
    repository,
    sender: simpleUser(
      ctx.sender.login,
      USER_IDS[ctx.sender.kind],
      ctx.sender.kind === 'installation' ? 'Bot' : 'User',
      ctx.urls,
    ),
    installation: {
      id: Number(ctx.installationId),
      node_id: nodeId('MDIz', Number(ctx.installationId)),
    },
  }
}

const SEP = '\u001f'
const END = '\u001e'

/** The newest twenty commits in `range`, oldest first, in GitHub's commit shape. */
async function commitsIn(
  dir: string,
  range: string[],
  web: string,
): Promise<Record<string, unknown>[]> {
  const format = ['%H', '%T', '%an', '%ae', '%cn', '%ce', '%aI', '%B'].join(SEP) + END
  const out = await git(dir, [
    'log',
    '-n',
    '20',
    '--reverse',
    `--format=${format}`,
    ...range,
  ])
  const commits: Record<string, unknown>[] = []
  for (const record of out.split(END)) {
    const fields = record.replace(/^\n/, '').split(SEP)
    if (fields.length < 8) continue
    const [sha, tree, an, ae, cn, ce, when, message] = fields as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ]
    const files = await git(dir, [
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '-r',
      '--root',
      sha,
    ])
    const added: string[] = []
    const removed: string[] = []
    const modified: string[] = []
    for (const line of files.split('\n')) {
      const [status, path] = line.split('\t')
      if (path === undefined) continue
      if (status === 'A') added.push(path)
      else if (status === 'D') removed.push(path)
      else modified.push(path)
    }
    commits.push({
      id: sha,
      tree_id: tree,
      distinct: true,
      message: message.trimEnd(),
      timestamp: when,
      url: `${web}/commit/${sha}`,
      author: { name: an, email: ae },
      committer: { name: cn, email: ce },
      added,
      removed,
      modified,
    })
  }
  return commits
}
