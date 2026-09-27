/** Which of D5's drivers made a repository: driver 1 (bare repositories) or driver 2. */
export type SourceProvider = 'local' | 'github'

/**
 * A repository this platform owns. **NO PATH AND NO URL: where it lives is the driver's
 * business** (the D5 plan's Task 2). Until then it carried the local driver's laptop path,
 * and two callers read it straight off the reference — the builder and the code reviewer —
 * which is the D5 leak the roadmap's finding 2 names. With the field gone, a reader of it
 * is a `tsc` error rather than something to remember; the build path asks `localGitDir`.
 */
export interface RepoRef {
  projectSlug: string
  provider: SourceProvider
}

/**
 * WHERE A PROJECT'S CODE LIVES, for a client (the D5 plan's Task 12, Decision 15) — and whether
 * its `main` is protected there, RECORDED HONESTLY where the host would not protect it
 * (Decision 13): GitHub will not protect a private repository's branch on a free organisation,
 * and the link says so in GitHub's own words rather than claiming a protection it refused.
 */
export interface RepositoryLink {
  provider: SourceProvider
  /** Driver 1: the slug. Driver 2: GitHub's `full_name`, as GitHub answered it at creation. */
  fullName: string
  /** Driver 1: null — a laptop path is not an address (Decision 15). Driver 2: `html_url`. */
  webUrl: string | null
  /** Whether a PERSON's force-push or deletion of `main` is refused where the code lives. */
  mainProtected: boolean
  /** The host's own words when it would not protect `main`; null when it did. */
  protectionDetail: string | null
}

/** A repository's visibility where it is hosted, as Manifest last READ it (the D5 plan's Task 10). */
export type RepositoryVisibility = 'private' | 'public'

/** What `createRepository` answers: the reference, and the link the project records. */
export interface CreatedRepository {
  ref: RepoRef
  link: RepositoryLink
}

/** A commit, present in a bare repository on THIS machine — what `git --git-dir=` is handed. */
export interface LocalGitDir {
  gitDir: string
  commitSha: string
}

export type SeedFiles = Readonly<Record<string, string>>

/**
 * ONE CHANGE A COMMIT MAKES (the authoring API plan's Task 3): a regular file written, or a file
 * deleted. Planned against the base tree before anything is built (`source/plumbing.ts`'s
 * `planChanges`), never applied at the file's own path. A write's `content` is TEXT — written as
 * its UTF-8 bytes — or, since the front-end enablement plan's Task 4, the BYTES themselves: a
 * string cannot carry a PNG (`[M11]`: every invalid UTF-8 sequence became U+FFFD, and an
 * 18,403-byte PNG a 33,360-byte blob). The route decides which, from the request's `encoding`.
 */
export type Change =
  | { op: 'write'; path: string; content: string | Uint8Array }
  | { op: 'delete'; path: string }

export interface GitIdentity {
  name: string
  email: string
}

export interface CommitRequest {
  /** The commit these changes were computed from; `main` must be exactly this (Decision 3). */
  base: string
  changes: readonly Change[]
  message: string
  author: GitIdentity
  /** Every check, and the objects built — and nothing pushed (Decision 6). */
  dryRun?: boolean
}

export type ChangeStatus = 'added' | 'modified' | 'deleted'

export interface CommitResult {
  /** The new commit — or null on a dry run, which pushes nothing. */
  commitSha: string | null
  parent: string
  changes: readonly { path: string; status: ChangeStatus }[]
}

/**
 * THE READ PRIMITIVES' ANSWERS (the authoring API plan's Task 4; `source/reading.ts`). Every
 * read names a COMMIT, and a symlink or a submodule is REPORTED, never followed.
 */
export type EntryType = 'file' | 'directory' | 'symlink' | 'submodule'

export interface SourceEntry {
  path: string
  type: EntryType
  /** git's mode: `100644`, `100755`, `120000`, `040000` or `160000`. */
  mode: string
  /** Bytes, for a file or a symlink (its target's length); null otherwise. */
  size: number | null
  /** Whether git calls a FILE binary; null for anything that is not a file. */
  binary: boolean | null
}

/** One regular text file, exactly: its UTF-8 bytes decoded with nothing replaced or stripped. */
export interface TextFile {
  path: string
  content: string
  size: number
  mode: string
  blobSha: string
}

/**
 * ONE REGULAR FILE AT A COMMIT, AS BYTES (the front-end enablement plan's Task 4): any file — text
 * or binary — of at most 2 MiB, exactly as git holds it. What `getFile?encoding=base64` answers.
 */
export interface FileBytes {
  path: string
  content: Buffer
  size: number
  mode: string
  blobSha: string
}

export interface CommitInfo {
  commitSha: string
  /** First parent first; empty for a root commit. */
  parents: string[]
  subject: string
  message: string
  messageTruncated: boolean
  /** What git recorded — never its address, which can be a person's own. */
  authorName: string
  /** ISO 8601, in UTC. */
  authoredAt: string
}

export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'type_changed'

export interface FileChange {
  path: string
  status: FileChangeStatus
  binary: boolean
  additions: number | null
  deletions: number | null
  /** A unified diff; null for a binary file, or once the patch budget is spent. */
  patch: string | null
}

export interface CommitDetail extends CommitInfo {
  changes: FileChange[]
  patchesTruncated: boolean
}

/**
 * WHAT ONE SYNC MOVED (the D5 plan's Task 9, Decision 11) — commit ids only: no author and no
 * message text, which are an app author's free text (§14's redaction applies to an event).
 * `ref` is GitHub's name for the branch, `refs/heads/<b>`.
 */
export interface MirrorAdvance {
  projectSlug: string
  /** Branches that moved (or appeared) on the provider, as the mirror now has them. */
  updated: { ref: string; from: string | null; to: string }[]
  /**
   * Branches the provider REWROTE, which the mirror's history REFUSED: it keeps `mirror`
   * (what an approved release may name), and GitHub has `upstream`. Reported ONCE — the
   * rewrite itself, never every later push onto it (`[M14]`).
   */
  rewritten: { ref: string; mirror: string; upstream: string }[]
  /**
   * ENFORCED PRIVATE (the D5 plan's Task 10, Decision 12): what the sync READ of the
   * repository's visibility, whether it tried to make it private again, and what GitHub
   * said AFTER. `null` when it was not read — driver 1, whose repository has no visibility,
   * or GitHub unreachable after the fetch.
   */
  visibility: {
    observed: 'private' | 'public'
    enforced: boolean
    result: 'private' | 'still-public'
  } | null
  /**
   * PUSH-TIME SECRET SCANNING (the D5 plan's Task 11, Decision 14 (c)): every secret-shaped
   * line ADDED by a commit the mirror has not yet REPORTED scanned — a person's push straight
   * to GitHub, which GitHub.com lets through and Manifest can only find. Where, which rule,
   * which commit; never the value. Driver 1's is always empty: its hook refuses the push.
   */
  findings: CommitFinding[]
  /**
   * COMMITS THE SCAN COULD NOT READ (the authoring API plan's Task 12): each one's own patch is
   * past what one read may hold, so no line of it was scanned — REPORTED, so a person learns
   * it, and never counted read. The build's gate still scans every tree it builds. Driver 1's
   * is always empty: its hook reads every push before it lands.
   */
  unscannable: string[]
}

/** A secret-shaped value in a commit's added lines (`source/scan-commits.ts`). */
export interface CommitFinding {
  commit: string
  path: string
  line: number
  rule: string
}

/**
 * THE ONE PLACE A MIRROR'S ADVANCE IS REPORTED (Decision 11): built at boot with the database
 * and the bus (`projects/source-events.ts`), so a git driver never holds either. Called
 * inside the sync, before it resolves — so a failure to report is the caller's failure,
 * never swallowed — and only when something moved.
 */
export interface SourceObserver {
  advanced(advance: MirrorAdvance): Promise<void>
}

/**
 * A source driver's refusal. `api/errors.ts` answers every one as `409 { code, message }` —
 * but `SOURCE_UNREACHABLE`, a `503` (the D5 plan's Decision 18) — so **the message goes on
 * the wire** and a driver never puts a credential in it. Driver 1 throws
 * `SOURCE_INVALID_SLUG`, `SOURCE_PATH_ESCAPE`, `SOURCE_GIT_FAILED`, `SOURCE_COMMIT_NOT_FOUND`
 * and `SOURCE_PROVIDER_MISMATCH` (a reference another driver made — Decision 3); driver 2
 * those and `SOURCE_UNREACHABLE`, `SOURCE_GITHUB_REFUSED`, `SOURCE_REPOSITORY_EXISTS`,
 * `SOURCE_REPOSITORY_NOT_PRIVATE` and `SOURCE_REPOSITORY_PUBLIC` (a repository last read public
 * is never built — Task 10). Both refuse `SOURCE_SECRET_DETECTED` — a commit of Manifest's own
 * carrying a secret-shaped value, before it leaves (Task 11) — and, since the authoring API
 * plan's Task 3, `SOURCE_CONFLICT` (a moved `main`), `SOURCE_PATH_CONFLICT`,
 * `SOURCE_PATH_NOT_FOUND` and `SOURCE_NOTHING_TO_COMMIT` (`source/plumbing.ts`'s planner). Each
 * is registered in `api/error-codes.ts`.
 */
export class SourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SourceError'
  }
}

/**
 * D5: git access sits behind this interface so driver 2 (a UBC GitHub org) can
 * replace driver 1 without the control plane learning a second shape.
 */
export interface SourceDriver {
  readonly name: SourceProvider
  /**
   * A NEW repository, seeded, with `main` protected where the host allows it (Task 12) — and
   * the link that says where it lives and whether it was, which `POST /v1/projects` records.
   */
  createRepository(projectSlug: string, seed: SeedFiles): Promise<CreatedRepository>
  /**
   * The reference for a repository this platform already provisioned.
   *
   * Without it a caller that did not create the repository has no way to name it,
   * and the only alternative is to build a `file://` URL by hand — which is
   * exactly the driver-specific knowledge D5 exists to keep out of the control
   * plane, and which `POST /v1/projects/:id/builds` was already doing.
   *
   * Synchronous and total: it derives a name, it does not check that the
   * repository exists. Every other method already fails honestly if it does not.
   */
  repositoryFor(projectSlug: string): RepoRef
  /**
   * THE ONE WRITE (the authoring API plan's Task 3): `changes` against `request.base`, which
   * must be `main`'s head — or `SOURCE_CONFLICT`, whether the base was already stale or the race
   * was lost at the push. Planned against the base's tree (`SOURCE_PATH_CONFLICT`,
   * `SOURCE_PATH_NOT_FOUND`, `SOURCE_NOTHING_TO_COMMIT`), built with git plumbing and NO
   * worktree, and pushed non-forced. A dry run makes every check and pushes nothing.
   */
  commit(repo: RepoRef, request: CommitRequest): Promise<CommitResult>
  /**
   * A BRANCH NAME OR A FULL COMMIT ID, as the commit it names NOW (the authoring API plan's
   * Task 4) — on driver 2, GitHub's branch as of a sync made first. `SOURCE_REF_NOT_FOUND` for
   * a branch that does not exist, or a name that could not be one (it is checked before git
   * sees it: a name beginning `-` in argv is an option); `SOURCE_COMMIT_NOT_FOUND` for an id
   * the repository lacks.
   */
  resolveRef(repo: RepoRef, ref: string): Promise<string>
  /** `resolveRef(repo, ref)` — the one name its callers had before Task 4. */
  headCommit(repo: RepoRef, ref?: string): Promise<string>
  /** Every entry of a commit's tree, sorted by path; the first 10,000 and `truncated` past it. */
  listTree(
    repo: RepoRef,
    commitSha: string,
  ): Promise<{ entries: SourceEntry[]; truncated: boolean }>
  /**
   * One regular text file at a commit — or `SOURCE_PATH_NOT_FOUND`, `SOURCE_PATH_NOT_A_FILE`,
   * `SOURCE_FILE_TOO_LARGE` or `SOURCE_FILE_NOT_TEXT`.
   */
  readText(repo: RepoRef, commitSha: string, path: string): Promise<TextFile>
  /**
   * One regular file at a commit AS BYTES, text or binary (the front-end enablement plan's Task
   * 4) — or `SOURCE_PATH_NOT_FOUND`, `SOURCE_PATH_NOT_A_FILE` or `SOURCE_FILE_TOO_LARGE` past
   * 2 MiB. Neither text rule applies.
   */
  readBytes(repo: RepoRef, commitSha: string, path: string): Promise<FileBytes>
  /** `limit` commits from `from`, newest first, and the id the next page starts AT. */
  history(
    repo: RepoRef,
    from: string,
    limit: number,
  ): Promise<{ commits: CommitInfo[]; next: string | null }>
  /** One commit and what it changed against its first parent, with a patch budget. */
  describeCommit(repo: RepoRef, commitSha: string): Promise<CommitDetail>
  /** The file's content at that commit, or null if the path is not in the tree. */
  readFile(repo: RepoRef, commitSha: string, path: string): Promise<string | null>
  listBranches(repo: RepoRef): Promise<string[]>
  /**
   * THE BUILD PATH (roadmap finding 2). The commit, present locally — fetched first if this
   * driver keeps a mirror and lacks it. Refuses `SOURCE_COMMIT_NOT_FOUND` for a commit the
   * repository does not have, and for anything but a full 40-character commit id: a build
   * names a COMMIT, and a revision such as `main` would build whatever it points at when
   * the build starts rather than what was validated. The builder and the code reviewer call
   * this and nothing else.
   */
  localGitDir(repo: RepoRef, commitSha: string): Promise<LocalGitDir>
  /**
   * Bring the local copy up to date with the provider, and report what moved (Decision 11).
   * Driver 1's repository IS the source, so its answer is always empty.
   */
  sync(repo: RepoRef): Promise<MirrorAdvance>
  /**
   * WHAT THIS MACHINE LAST READ of the repository's visibility where it is hosted — no network
   * (the authoring API plan's Task 12; the D5 plan's final review, minor 3, found the console
   * saying *private* whatever GitHub last said). Driver 1: `null`, a repository here has none.
   * Driver 2: the mirror's last read — `public` until a sync reads it private again — and
   * `null` before any read.
   */
  lastVisibility(repo: RepoRef): Promise<RepositoryVisibility | null>
  destroyRepository(repo: RepoRef): Promise<void>
  /**
   * BOOT (the D5 plan's Task 11): make every repository THIS driver owns under its root what it
   * must be now — driver 1's secret-scanning `pre-receive`, rendered from the current list;
   * driver 2's mirror hook, which refuses every push. A repository the OTHER driver made in
   * the same root is left exactly as it is (Decision 3). Idempotent; called before the control
   * plane listens, and the count is on the boot line.
   */
  prepare(): Promise<{ repositories: number }>
}
