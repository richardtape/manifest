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

/** A commit, present in a bare repository on THIS machine — what `git --git-dir=` is handed. */
export interface LocalGitDir {
  gitDir: string
  commitSha: string
}

export type SeedFiles = Readonly<Record<string, string>>

/**
 * A source driver's refusal. `api/errors.ts` answers every one as `409 { code, message }` —
 * but `SOURCE_UNREACHABLE`, a `503` (the D5 plan's Decision 18) — so **the message goes on
 * the wire** and a driver never puts a credential in it. Driver 1 throws
 * `SOURCE_INVALID_SLUG`, `SOURCE_PATH_ESCAPE`, `SOURCE_GIT_FAILED`, `SOURCE_COMMIT_NOT_FOUND`
 * and `SOURCE_PROVIDER_MISMATCH` (a reference another driver made — Decision 3); driver 2
 * those and `SOURCE_UNREACHABLE`, `SOURCE_CONFLICT`, `SOURCE_GITHUB_REFUSED`,
 * `SOURCE_REPOSITORY_EXISTS` and `SOURCE_REPOSITORY_NOT_PRIVATE`. Each is registered in
 * `api/error-codes.ts`.
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
  createRepository(projectSlug: string, seed: SeedFiles): Promise<RepoRef>
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
  commitFiles(repo: RepoRef, files: SeedFiles, message: string): Promise<string>
  headCommit(repo: RepoRef, ref?: string): Promise<string>
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
   * What the repository's HOST calls it, for the project's `source_repositories` row (the D5
   * plan's Task 8): driver 1 its slug and no address — a laptop path is not an address
   * (Decision 15) — driver 2 the full name and `html_url` GitHub answered at creation, kept
   * on the mirror. No network. Task 12 folds it into the repository link.
   */
  describeRepository(repo: RepoRef): Promise<{ fullName: string; webUrl: string | null }>
  destroyRepository(repo: RepoRef): Promise<void>
}
