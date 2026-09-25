import type { FakeRepo } from './state.js'

/**
 * GitHub's REPOSITORY OBJECTS, built from explicit values. **The schema test is the
 * authority on which keys exist** (`repos.test.ts`, through GitHub's own `full-repository`
 * — 75 required properties — and `repository`, which the token answer nests and which adds
 * `has_downloads`). Every `*_url` follows GitHub's own pattern, under the fake's API URL.
 */

export interface Urls {
  /** `http://127.0.0.1:<port>/api/v3` — GitHub Enterprise Server's layout. */
  apiUrl: string
  /** `http://127.0.0.1:<port>` — clone URLs are `${gitUrl}/<org>/<repo>.git`. */
  gitUrl: string
}

/** An organisation as GitHub's `simple-user` describes one (`type: 'Organization'`). */
export function orgUser(org: string, orgId: number, u: Urls): Record<string, unknown> {
  const api = `${u.apiUrl}/users/${org}`
  return {
    login: org,
    id: orgId,
    node_id: nodeId('O_', orgId),
    avatar_url: `${u.gitUrl}/avatars/${org}`,
    gravatar_id: '',
    url: api,
    html_url: `${u.gitUrl}/${org}`,
    followers_url: `${api}/followers`,
    following_url: `${api}/following{/other_user}`,
    gists_url: `${api}/gists{/gist_id}`,
    starred_url: `${api}/starred{/owner}{/repo}`,
    subscriptions_url: `${api}/subscriptions`,
    organizations_url: `${api}/orgs`,
    repos_url: `${api}/repos`,
    events_url: `${api}/events{/privacy}`,
    received_events_url: `${api}/received_events`,
    type: 'Organization',
    user_view_type: 'public',
    site_admin: false,
  }
}

/** GitHub's opaque global node ids; the fake's need only be stable and distinct. */
export function nodeId(prefix: string, id: number): string {
  return `${prefix}${Buffer.from(`fake:${prefix}${id}`).toString('base64url')}`
}

/** The `permissions` a requester holds on the repository, in GitHub's booleans. */
export interface RepoPermissions {
  admin: boolean
  maintain: boolean
  push: boolean
  triage: boolean
  pull: boolean
}

/**
 * `full-repository` — what `POST /orgs/{org}/repos`, `GET` and `PATCH /repos/{owner}/{repo}`
 * answer. It satisfies `repository` too (its required keys are these plus `has_downloads`).
 */
export function fullRepository(
  repo: FakeRepo,
  ctx: { org: string; orgId: number; urls: Urls; permissions: RepoPermissions },
): Record<string, unknown> {
  const full = `${ctx.org}/${repo.name}`
  const api = `${ctx.urls.apiUrl}/repos/${full}`
  const pushedAt = repo.pushedAt ?? repo.createdAt
  return {
    id: repo.id,
    node_id: nodeId('R_', repo.id),
    name: repo.name,
    full_name: full,
    private: repo.private,
    visibility: repo.private ? 'private' : 'public',
    owner: orgUser(ctx.org, ctx.orgId, ctx.urls),
    html_url: `${ctx.urls.gitUrl}/${full}`,
    description: null,
    fork: false,
    url: api,
    archive_url: `${api}/{archive_format}{/ref}`,
    assignees_url: `${api}/assignees{/user}`,
    blobs_url: `${api}/git/blobs{/sha}`,
    branches_url: `${api}/branches{/branch}`,
    collaborators_url: `${api}/collaborators{/collaborator}`,
    comments_url: `${api}/comments{/number}`,
    commits_url: `${api}/commits{/sha}`,
    compare_url: `${api}/compare/{base}...{head}`,
    contents_url: `${api}/contents/{+path}`,
    contributors_url: `${api}/contributors`,
    deployments_url: `${api}/deployments`,
    downloads_url: `${api}/downloads`,
    events_url: `${api}/events`,
    forks_url: `${api}/forks`,
    git_commits_url: `${api}/git/commits{/sha}`,
    git_refs_url: `${api}/git/refs{/sha}`,
    git_tags_url: `${api}/git/tags{/sha}`,
    hooks_url: `${api}/hooks`,
    issue_comment_url: `${api}/issues/comments{/number}`,
    issue_events_url: `${api}/issues/events{/number}`,
    issues_url: `${api}/issues{/number}`,
    keys_url: `${api}/keys{/key_id}`,
    labels_url: `${api}/labels{/name}`,
    languages_url: `${api}/languages`,
    merges_url: `${api}/merges`,
    milestones_url: `${api}/milestones{/number}`,
    notifications_url: `${api}/notifications{?since,all,participating}`,
    pulls_url: `${api}/pulls{/number}`,
    releases_url: `${api}/releases{/id}`,
    stargazers_url: `${api}/stargazers`,
    statuses_url: `${api}/statuses/{sha}`,
    subscribers_url: `${api}/subscribers`,
    subscription_url: `${api}/subscription`,
    tags_url: `${api}/tags`,
    teams_url: `${api}/teams`,
    trees_url: `${api}/git/trees{/sha}`,
    clone_url: `${ctx.urls.gitUrl}/${full}.git`,
    git_url: `git:${new URL(ctx.urls.gitUrl).host}/${full}.git`,
    ssh_url: `git@${new URL(ctx.urls.gitUrl).hostname}:${full}.git`,
    svn_url: `${ctx.urls.gitUrl}/${full}`,
    mirror_url: null,
    homepage: null,
    language: null,
    default_branch: 'main',
    forks: 0,
    forks_count: 0,
    stargazers_count: 0,
    watchers: 0,
    watchers_count: 0,
    network_count: 0,
    subscribers_count: 0,
    size: 0,
    open_issues: 0,
    open_issues_count: 0,
    has_issues: true,
    has_projects: true,
    has_wiki: !repo.private,
    has_pages: false,
    has_downloads: true,
    has_discussions: false,
    archived: false,
    disabled: false,
    license: null,
    topics: [],
    permissions: ctx.permissions,
    created_at: repo.createdAt,
    updated_at: pushedAt > repo.createdAt ? pushedAt : repo.createdAt,
    pushed_at: pushedAt,
  }
}

/**
 * GitHub's rule for a repository name, as far as the fake needs it: ASCII letters, digits,
 * `.`, `-` and `_`, at most 100 characters, and never `.` or `..`.
 */
export function validRepoName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    /^[A-Za-z0-9._-]{1,100}$/.test(name) &&
    name !== '.' &&
    name !== '..'
  )
}
