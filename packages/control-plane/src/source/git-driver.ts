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
  commitFiles(repo: RepoRef, files: SeedFiles, message: string): Promise<string>
  headCommit(repo: RepoRef, ref?: string): Promise<string>
  /** The file's content at that commit, or null if the path is not in the tree. */
  readFile(repo: RepoRef, commitSha: string, path: string): Promise<string | null>
  listBranches(repo: RepoRef): Promise<string[]>
  destroyRepository(repo: RepoRef): Promise<void>
}
