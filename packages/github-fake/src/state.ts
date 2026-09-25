import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The fake's whole state, in one JSON file beside the bare repositories it serves. It is a
 * FAKE's state: an organisation, its plan, its repositories and their protection — no users
 * beyond the two it knows (the App's installation and `faculty-dev`), and no history.
 */
export interface FakeRepo {
  id: number
  name: string
  private: boolean
  createdAt: string
  pushedAt: string | null
  protection: Protection | null
}

/** What `PUT …/branches/main/protection` recorded (Task 12 fills it). */
export interface Protection {
  allowForcePushes: boolean
  allowDeletions: boolean
}

export interface FakeState {
  org: string
  plan: 'free' | 'team'
  /** Keyed by the repository's name LOWERCASED: GitHub treats a name case-insensitively. */
  repos: Record<string, FakeRepo>
  nextRepoId: number
}

const FILE = 'state.json'

/**
 * The state in `dataDir`, or a fresh one from `defaults`. A saved state for another
 * organisation is not reused: the repositories on disk are laid out under the org's name,
 * so a renamed org would serve rows whose directories are elsewhere.
 */
export function loadState(
  dataDir: string,
  defaults: Omit<FakeState, 'repos' | 'nextRepoId'>,
): FakeState {
  const path = join(dataDir, FILE)
  if (existsSync(path)) {
    const saved = JSON.parse(readFileSync(path, 'utf8')) as FakeState
    if (saved.org === defaults.org) return { ...saved, plan: defaults.plan }
  }
  return { ...defaults, repos: {}, nextRepoId: 1 }
}

/** Written to a temporary file and renamed over, so a crash never leaves half a file. */
export function saveState(dataDir: string, state: FakeState): void {
  mkdirSync(dataDir, { recursive: true })
  const tmp = join(dataDir, `${FILE}.tmp`)
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, join(dataDir, FILE))
}

/** Where a repository's bare git directory lives: `<dataDir>/<org>/<name>.git`. */
export function repoDir(dataDir: string, org: string, name: string): string {
  return join(dataDir, org.toLowerCase(), `${name.toLowerCase()}.git`)
}
