import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Protection } from './state.js'

/**
 * GITHUB'S BRANCH PROTECTION, AS GIT SHOWS IT (the D5 plan's Task 12, Decision 13): a push that
 * would rewrite or delete a protected branch is refused by the repository's `pre-receive`, in
 * GitHub's words — `GH006: Protected branch update failed for refs/heads/main.` — which is what
 * a person sees on GitHub (golden.json holds the words as documentation; a real App's
 * repositories on a free organisation cannot be protected, so they were never measured).
 *
 * The rule lives in a plain file beside the hook, one line per protected branch, holding only
 * its DENIALS — `refs/heads/main deny-force-push deny-deletion` — so the hook is POSIX `sh` and
 * `git`, and needs nothing the fake's image does not have. No file, or no line: not protected.
 */
export const PROTECTION_FILE = 'fake-protection'

const HOOK = `#!/bin/sh
# The GitHub FAKE's branch protection (the D5 plan, Task 12). Written by the fake; not GitHub.
zero=0000000000000000000000000000000000000000
status=0
while read -r old new ref; do
  rule=$(awk -v r="$ref" '$1 == r' ${PROTECTION_FILE} 2>/dev/null)
  [ -n "$rule" ] || continue
  if [ "$new" = "$zero" ]; then
    case "$rule" in *deny-deletion*)
      echo "error: GH006: Protected branch update failed for $ref." >&2
      echo "error: Cannot delete this protected branch" >&2
      status=1 ;;
    esac
    continue
  fi
  if [ "$old" != "$zero" ] && ! git merge-base --is-ancestor "$old" "$new" 2>/dev/null; then
    case "$rule" in *deny-force-push*)
      echo "error: GH006: Protected branch update failed for $ref." >&2
      echo "error: Cannot force-push to this branch" >&2
      status=1 ;;
    esac
  fi
done
exit $status
`

/** Every repository the fake makes gets the hook; it refuses nothing until a rule is written. */
export async function installProtectionHook(dir: string): Promise<void> {
  await mkdir(join(dir, 'hooks'), { recursive: true })
  const hook = join(dir, 'hooks', 'pre-receive')
  await writeFile(hook, HOOK)
  await chmod(hook, 0o755)
}

/** The rule for `branch`, as the hook reads it — or no rule at all. */
export async function writeProtection(
  dir: string,
  branch: string,
  protection: Protection | null,
): Promise<void> {
  await installProtectionHook(dir)
  const denials = [
    ...(protection !== null && !protection.allowForcePushes ? ['deny-force-push'] : []),
    ...(protection !== null && !protection.allowDeletions ? ['deny-deletion'] : []),
  ]
  await writeFile(
    join(dir, PROTECTION_FILE),
    denials.length === 0 ? '' : `refs/heads/${branch} ${denials.join(' ')}\n`,
  )
}
