import type { KeyObject } from 'node:crypto'
import { createGithubClient } from './client.js'
import { redactToken } from './git.js'
import { createTokenCache } from './tokens.js'

/**
 * EVERY REPOSITORY IN THE ORGANISATION, AGAINST THE PROJECT THAT OWNS IT (the launch path plan's
 * Task 2) — `scripts/github-real-repos.sh`'s program, run from `real-repos-main.ts`. A Vitest run
 * truncates `source_repositories` and leaves the real repositories on GitHub (Task 1: `lp-real-a`
 * lives on github.com whatever the database says), so nothing else can say which of them a
 * project still holds.
 *
 * Here and not in `packages/journey`, which the brief named: journey's import boundary
 * (`boundary.test.ts` — `@manifest/contract`, `node:` builtins and its own files, nothing else)
 * holds a CLIENT OF THE CONTRACT, and this is not one — it talks to GitHub as the App, through the
 * driver's own `app-auth.ts` (the JWT, by way of `client.ts`) and `tokens.ts`, in memory.
 *
 * **It never prints a key or a token**: every line goes through `say`, which refuses one holding a
 * token's shape, and every failure is redacted with each token minted before it is said.
 * **It never deletes a repository a project row names** — live, or a deleted project's tombstone:
 * only a repository whose line reads `NONE`, one named repository at a time, after `yes`.
 */

/** One `source_repositories` row as the script's `psql -At -F '|'` prints it. */
export interface OwnershipRow {
  fullName: string
  projectId: string
  state: string
}

export type Ownership =
  { kind: 'live'; projectId: string } | { kind: 'deleted' } | { kind: 'none' }

/** `full_name|project_id|state`, one per line — anything else is refused, never guessed at. */
export function parseOwnershipRows(text: string): OwnershipRow[] {
  const rows: OwnershipRow[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const [fullName, projectId, state, ...extra] = trimmed.split('|')
    if (
      fullName === undefined ||
      projectId === undefined ||
      state === undefined ||
      extra.length > 0 ||
      fullName === '' ||
      projectId === '' ||
      state === ''
    ) {
      throw new Error(
        `an ownership row is not full_name|project_id|state: '${trimmed.slice(0, 120)}'`,
      )
    }
    rows.push({ fullName, projectId, state })
  }
  return rows
}

/**
 * Who owns `fullName` — matched CASE-INSENSITIVELY: GitHub keeps an organisation's own capitals
 * (`Manifest-local-dev`), and a name is one name to GitHub whatever its case. A live project's row
 * wins over a deleted one's: a slug freed by a delete may be a new project's (the D5 plan's Task 12).
 */
export function ownershipOf(fullName: string, rows: readonly OwnershipRow[]): Ownership {
  const name = fullName.toLowerCase()
  const named = rows.filter((r) => r.fullName.toLowerCase() === name)
  const live = named.find((r) => r.state !== 'deleted')
  if (live !== undefined) return { kind: 'live', projectId: live.projectId }
  return named.length > 0 ? { kind: 'deleted' } : { kind: 'none' }
}

/** What a line says of its owner: `live <project id>`, `deleted` or `NONE`. */
export function ownershipWords(o: Ownership): string {
  return o.kind === 'live'
    ? `live ${o.projectId}`
    : o.kind === 'deleted'
      ? 'deleted'
      : 'NONE'
}

export interface GithubAccess {
  apiUrl: string
  org: string
  appId: string
  installationId: string
  appKey: KeyObject
  /** A test's spy; production uses the global. */
  fetch?: typeof fetch
}

interface OrgRepository {
  name: string
  fullName: string
}

/** A token's shape, as `conformance.ts` and Task 1's probe refuse to print one. */
const CREDENTIAL = /ghs_|ghp_|gho_|ghu_|github_pat_|-----BEGIN/

/** GitHub's own name rule, re-stated: letters, digits, `.`, `_` and `-`. */
const REPOSITORY_NAME = /^[A-Za-z0-9._-]{1,100}$/

/**
 * List every repository, each beside its owner; with `deleteName`, delete that ONE repository
 * when its line reads `NONE` and the person answers `yes`. Answers the process's exit code: `0`
 * listed or deleted, `1` refused or failed — each said, with the reason.
 */
export async function realRepos(o: {
  github: GithubAccess
  rows: readonly OwnershipRow[]
  deleteName?: string
  /** One line from the person, after the question is shown. */
  ask: (question: string) => Promise<string>
  /** One line of output. */
  say: (line: string) => void
  /** GitHub's page size — 100, its maximum, unless a test pages a short list. */
  perPage?: number
}): Promise<number> {
  const g = o.github
  const host = new URL(g.apiUrl).host
  const client = createGithubClient({
    apiUrl: g.apiUrl,
    appId: g.appId,
    appKey: g.appKey,
    ...(g.fetch === undefined ? {} : { fetch: g.fetch }),
  })
  const tokens = createTokenCache({
    client,
    installationId: g.installationId,
    now: () => new Date(),
  })
  let listing: string | undefined
  const redact = (text: string) => tokens.redact(redactToken(text, listing))
  const say = (line: string) => {
    const safe = redact(line)
    if (CREDENTIAL.test(safe))
      throw new Error('refusing to print a line that holds a credential')
    o.say(safe)
  }

  try {
    // METADATA ONLY, installation-wide: the least a list needs. `tokens.ts` mints only per
    // repository, or installation-wide for creation (`administration: write`), so this is the
    // one mint made directly — the call Task 1's probe made against github.com (`list: 200`).
    const minted = await client.asApp(
      'POST',
      `/app/installations/${g.installationId}/access_tokens`,
      { permissions: { metadata: 'read' } },
    )
    const token = (minted.json as { token?: unknown } | undefined)?.token
    if (minted.status !== 201 || typeof token !== 'string' || token === '') {
      throw client.refusal('mint a token to list the organisation', minted)
    }
    listing = token
    const perPage = o.perPage ?? 100
    const repositories: OrgRepository[] = []
    let total: number | undefined
    for (let page = 1; total === undefined || repositories.length < total; page++) {
      const res = await client.asToken(
        token,
        'GET',
        `/installation/repositories?per_page=${perPage}&page=${page}`,
      )
      if (res.status !== 200)
        throw client.refusal('list the installation’s repositories', res)
      const body = res.json as { total_count?: unknown; repositories?: unknown }
      if (typeof body.total_count !== 'number' || !Array.isArray(body.repositories)) {
        throw client.refusal(
          'list the installation’s repositories (no list in the answer)',
          res,
        )
      }
      total = body.total_count
      if (body.repositories.length === 0) break
      for (const r of body.repositories as { name?: unknown; full_name?: unknown }[]) {
        if (typeof r.name !== 'string' || typeof r.full_name !== 'string') {
          throw client.refusal(
            'list the installation’s repositories (a repository with no name)',
            res,
          )
        }
        repositories.push({ name: r.name, fullName: r.full_name })
      }
    }
    // ITS OWN OUTPUT, ASSERTED: every repository GitHub counted was read, or nothing is said as if
    // it were the whole organisation.
    if (repositories.length !== total) {
      throw new Error(
        `GitHub counted ${total} repositories and ${repositories.length} were read; nothing is listed as if it were all of them`,
      )
    }
    repositories.sort((a, b) => a.name.localeCompare(b.name))
    say(`${g.org} on ${host}: ${repositories.length} repositories`)
    const width = Math.max(0, ...repositories.map((r) => r.name.length))
    for (const r of repositories) {
      say(`  ${r.name.padEnd(width)}  ${ownershipWords(ownershipOf(r.fullName, o.rows))}`)
    }
    if (o.deleteName === undefined) return 0

    // --delete <name>: ONE repository, and only one no project row names.
    const name = o.deleteName
    if (!REPOSITORY_NAME.test(name)) {
      say(`FAIL '${name.slice(0, 100)}' is not a repository name; nothing was deleted`)
      return 1
    }
    const repo = repositories.find((r) => r.name.toLowerCase() === name.toLowerCase())
    if (repo === undefined) {
      say(`FAIL ${g.org}/${name} is not in the list above; nothing was deleted`)
      return 1
    }
    const owner = ownershipOf(repo.fullName, o.rows)
    if (owner.kind !== 'none') {
      say(
        `FAIL ${repo.fullName} reads '${ownershipWords(owner)}': ${
          owner.kind === 'live'
            ? 'a live project owns it, and this never deletes one — delete the project instead'
            : 'a deleted project’s row names it — Manifest’s own delete owns it'
        }; nothing was deleted`,
      )
      return 1
    }
    say(
      `This DELETES ${repo.fullName} on ${host} — no project row names it — and it cannot be undone.`,
    )
    const answer = (await o.ask('Type yes to delete it: ')).trim()
    if (answer !== 'yes') {
      say(`Not deleted: the answer was not 'yes'.`)
      return 1
    }
    // The driver's own delete token (`deleteOnGithub`'s): this one repository, administration.
    const admin = await tokens.forRepository(repo.name, { administration: 'write' })
    const res = await client.asToken(admin, 'DELETE', `/repos/${g.org}/${repo.name}`)
    if (res.status === 404) {
      say(`${repo.fullName} was already gone from ${host}.`)
      return 0
    }
    if (res.status !== 204) throw client.refusal(`delete ${repo.fullName}`, res)
    say(`Deleted ${repo.fullName} on ${host}.`)
    return 0
  } catch (error) {
    // Said, redacted with every token minted — never swallowed, and never a token's shape.
    const line = `FAIL ${redact(error instanceof Error ? error.message : String(error))}`
    o.say(
      CREDENTIAL.test(line)
        ? 'FAIL (the failure’s own words held a credential’s shape, so they are not shown)'
        : line,
    )
    return 1
  }
}
