import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { scanText } from './secret-patterns.js'

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

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage'])

async function* walk(root: string, dir = root): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(root, full)
    else if (entry.isFile()) yield full
  }
}

/**
 * §12's secret gate over a build context: every file read as text and handed to THE list
 * (`secret-patterns.ts` — the D5 plan's Task 11), so what a build refuses and what a push is
 * refused for are one answer. The finding's message names the rule and never the match: it
 * becomes an Event, and §14 redacts at capture.
 */
export async function scanForSecrets(dir: string): Promise<GateFinding[]> {
  const findings: GateFinding[] = []
  for await (const file of walk(dir)) {
    // 2 MB: past that it is an asset, not source, and reading it all would make
    // the gate the slowest part of a build.
    if ((await stat(file)).size > 2 * 1024 * 1024) continue
    const text = await readFile(file, 'utf8').catch(() => '')
    for (const f of scanText(text, relative(dir, file))) {
      findings.push({
        gate: 'secret',
        severity: 'block',
        message: `looks like ${f.rule}`,
        path: f.path,
        line: f.line,
      })
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
