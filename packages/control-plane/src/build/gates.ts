import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export interface GateFinding {
  gate: 'secret' | 'lockfile'
  severity: 'block'
  message: string
  path?: string
  line?: number
}

export class BuildGateError extends Error {
  readonly code = 'BUILD_GATE_FAILED'
  constructor(
    readonly findings: GateFinding[],
    readonly hint: string,
  ) {
    // NAME THEM. "blocked by 1 finding" tells the app's author nothing they can
    // act on, and a build failure that does not say what to change is a failure
    // they have to reproduce outside the platform to understand. The finding
    // messages are already written for them and already redacted at construction
    // — §14 redacts at capture, so the matched text is never in one.
    super(
      `build blocked by ${findings.length} mandatory gate finding(s): ` +
        findings
          .map(
            (f) =>
              `[${f.gate}] ${f.message}${f.path === undefined ? '' : ` (${f.path}${f.line === undefined ? '' : `:${f.line}`})`}`,
          )
          .join('; '),
    )
    this.name = 'BuildGateError'
  }
}

/**
 * Pattern-based, so it works with the network off and never degrades — §12 draws
 * exactly this line between secret/lockfile scanning and vulnerability scanning.
 * Each entry names what it matches; the match itself is NEVER put in the message,
 * because the message becomes an Event and §14 redacts at capture.
 */
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'an AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: 'a private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  { name: 'a GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'a Slack token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    name: 'a JSON Web Token',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'a generic assigned secret',
    pattern: /\b(?:secret|password|passwd|api[_-]?key)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  },
]

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage'])

async function* walk(root: string, dir = root): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(root, full)
    else if (entry.isFile()) yield full
  }
}

export async function scanForSecrets(dir: string): Promise<GateFinding[]> {
  const findings: GateFinding[] = []
  for await (const file of walk(dir)) {
    // 2 MB: past that it is an asset, not source, and reading it all would make
    // the gate the slowest part of a build.
    if ((await stat(file)).size > 2 * 1024 * 1024) continue
    const text = await readFile(file, 'utf8').catch(() => '')
    const lines = text.split('\n')
    for (const [index, line] of lines.entries()) {
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (!pattern.test(line)) continue
        findings.push({
          gate: 'secret',
          severity: 'block',
          // The matched text is deliberately absent. Putting it here would push
          // the secret into the Event stream this gate exists to protect.
          message: `looks like ${name}`,
          path: relative(dir, file),
          line: index + 1,
        })
        break
      }
    }
  }
  return findings
}

export async function requireLockfile(
  dir: string,
  blueprint: { lockfile: string },
): Promise<GateFinding[]> {
  const exists = await stat(join(dir, blueprint.lockfile)).then(
    () => true,
    () => false,
  )
  return exists
    ? []
    : [
        {
          gate: 'lockfile',
          severity: 'block',
          message:
            `${blueprint.lockfile} is missing. Manifest builds from a committed lockfile so ` +
            'that the dependency set is the one that was reviewed (§12).',
        },
      ]
}

/**
 * Two parameters, and deliberately no third. §12: these gates "are not app-declared
 * and cannot be waived by an app". An options object is where a waiver goes.
 */
export async function runMandatoryGates(
  dir: string,
  blueprint: { lockfile: string },
): Promise<GateFinding[]> {
  const [secrets, lockfile] = await Promise.all([
    scanForSecrets(dir),
    requireLockfile(dir, blueprint),
  ])
  return [...secrets, ...lockfile]
}
