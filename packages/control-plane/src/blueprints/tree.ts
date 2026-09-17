import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * A blueprint's skeleton, a starter and a knowledge pack are TEXT the platform copies into
 * a project's repository or serves to a client (P5a Task 10). Read once at boot, bounded,
 * and refused — naming the file — when a tree holds something a repository seed cannot
 * carry. A boot error, never answered on the wire.
 */
export class BlueprintLoadError extends Error {
  constructor(
    readonly code:
      | 'BLUEPRINT_TREE_SYMLINK'
      | 'BLUEPRINT_TREE_NOT_TEXT'
      | 'BLUEPRINT_TREE_TOO_LARGE'
      | 'BLUEPRINT_STARTER_PATH'
      | 'BLUEPRINT_STARTER_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'BlueprintLoadError'
  }
}

/**
 * FATAL, so a file that is not UTF-8 is refused rather than decoded with U+FFFD in place
 * of its bytes: a NUL check alone lets a Latin-1 file through, and the seeded copy would
 * differ from the blueprint's with nothing saying so.
 */
const UTF8 = new TextDecoder('utf-8', { fatal: true })

/**
 * Every file under `root` as `{ 'posix/relative/path': text }`, in a stable order.
 * `node_modules` is skipped; a symbolic link, a file that is not UTF-8 text, or a tree
 * over `limits` is refused.
 */
export async function readTextTree(
  root: string,
  limits: { maxFiles: number; maxBytes: number },
  what: string,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  let count = 0
  let bytes = 0
  async function walk(dir: string): Promise<void> {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue
      const full = join(dir, entry.name)
      const path = relative(root, full).split(sep).join('/')
      const stat = await lstat(full)
      if (stat.isSymbolicLink()) {
        throw new BlueprintLoadError(
          'BLUEPRINT_TREE_SYMLINK',
          `${what}: ${path} is a symbolic link, which a repository seed cannot carry`,
        )
      }
      if (stat.isDirectory()) {
        await walk(full)
        continue
      }
      count += 1
      bytes += stat.size
      if (count > limits.maxFiles || bytes > limits.maxBytes) {
        throw new BlueprintLoadError(
          'BLUEPRINT_TREE_TOO_LARGE',
          `${what} is over ${limits.maxFiles} files or ${limits.maxBytes} bytes`,
        )
      }
      const content = await readFile(full)
      let text: string
      try {
        if (content.includes(0)) throw new Error('NUL')
        text = UTF8.decode(content)
      } catch {
        throw new BlueprintLoadError(
          'BLUEPRINT_TREE_NOT_TEXT',
          `${what}: ${path} is not UTF-8 text — a skeleton, a starter and a knowledge pack hold text files only`,
        )
      }
      files[path] = text
    }
  }
  await walk(root)
  return files
}
