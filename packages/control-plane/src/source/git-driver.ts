/** A repository this platform owns. `path` is meaningful only to the local driver. */
export interface RepoRef {
  projectSlug: string
  path: string
  /** What a builder is handed. `file://…` locally; an https URL for the GitHub driver. */
  url: string
}

export type SeedFiles = Readonly<Record<string, string>>

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
  readonly name: string
  createRepository(projectSlug: string, seed: SeedFiles): Promise<RepoRef>
  /**
   * The reference for a repository this platform already provisioned.
   *
   * Without it a caller that did not create the repository has no way to name it,
   * and the only alternative is to build a `file://` URL by hand — which is
   * exactly the driver-specific knowledge D5 exists to keep out of the control
   * plane, and which `POST /projects/:id/builds` was already doing.
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
  destroyRepository(repo: RepoRef): Promise<void>
}
