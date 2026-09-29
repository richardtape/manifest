import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { loadAppKey } from './app-auth.js'
import { parseOwnershipRows, realRepos } from './real-repos.js'

/**
 * `scripts/github-real-repos.sh`'s entry (the launch path plan's Task 2), run from the BUILT
 * `dist/` — node's strip-only TypeScript cannot import `src/` (TRAPS, the launch path plan) — with
 * `.env`'s real-App lines in its environment, never printed. Argv: the file of ownership rows the
 * script read with `psql`, then `--delete <name>` or nothing.
 *
 * The App's key goes through `loadAppKey`, the master key's custody rule, exactly as at the control
 * plane's boot: a key its group can read is refused, naming the file.
 */
const [rowsFile, flag, name, ...extra] = process.argv.slice(2)
if (
  rowsFile === undefined ||
  extra.length > 0 ||
  (flag !== undefined && (flag !== '--delete' || name === undefined))
) {
  console.error('usage: real-repos-main.js <ownership rows file> [--delete <name>]')
  process.exit(2)
}

function env(variable: string): string {
  const value = process.env[variable]
  if (value === undefined || value === '') {
    console.error(
      `FAIL ${variable} is not set — the script exports .env's real-App lines`,
    )
    process.exit(2)
  }
  return value
}

/** One line of stdin; EOF is no answer, and no answer is not `yes`. */
async function ask(question: string): Promise<string> {
  process.stdout.write(question)
  const lines = createInterface({ input: process.stdin, terminal: false })
  try {
    for await (const line of lines) return line
    return ''
  } finally {
    lines.close()
  }
}

process.exitCode = await realRepos({
  github: {
    apiUrl: env('MANIFEST_GITHUB_API_URL'),
    org: env('MANIFEST_GITHUB_ORG'),
    appId: env('MANIFEST_GITHUB_APP_ID'),
    installationId: env('MANIFEST_GITHUB_INSTALLATION_ID'),
    appKey: await loadAppKey(env('MANIFEST_GITHUB_APP_KEY')),
  },
  rows: parseOwnershipRows(readFileSync(rowsFile, 'utf8')),
  ...(name === undefined ? {} : { deleteName: name }),
  ask,
  say: (line) => console.log(line),
})
