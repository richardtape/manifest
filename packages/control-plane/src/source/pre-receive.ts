import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SECRET_PATTERNS } from '../build/index.js'
import { HUNK, PATCH_ARGS } from './scan-commits.js'

/** The line the shell half stops at and the JavaScript half starts after. */
const SPLIT = '// MANIFEST SECRET SCAN, IN JAVASCRIPT'

/**
 * THE HOOK'S LOOP — the one thing written twice (the D5 plan's Decision 14). Plain CommonJS,
 * run by `node -e`, with THE list and the patch options spliced in as JSON from the same
 * modules `scanText` and `scanNewCommits` use; the walk and the rule loop are the copy that
 * `source/pre-receive.test.ts` holds to `scanText`'s answer, entry by entry, over a real push.
 *
 * `git log <new…> --not --all` lists exactly the incoming commits: git's quarantine keeps them
 * out of every ref until this hook says yes. A deletion is skipped (it adds nothing). Every
 * incoming commit is read — no cap: this is a gate, and a gate that stops reading lets the
 * rest through. A patch too large to hold, or git failing, REFUSES the push, and says so.
 */
function hookScript(): string {
  const rules = JSON.stringify(
    SECRET_PATTERNS.map((p) => ({
      name: p.name,
      source: p.pattern.source,
      flags: p.pattern.flags,
    })),
  )
  return [
    SPLIT,
    "'use strict'",
    "const { execFileSync } = require('node:child_process')",
    `const RULES = ${rules}.map((r) => ({ name: r.name, pattern: new RegExp(r.source, r.flags) }))`,
    `const PATCH_ARGS = ${JSON.stringify(PATCH_ARGS)}`,
    `const HUNK = new RegExp(${JSON.stringify(HUNK.source)})`,
    "const LEAD = 'Manifest refused this push (§20): '",
    'function refuse(lines) {',
    "  process.stderr.write(lines.join('\\n') + '\\n')",
    '  process.exit(1)',
    '}',
    'function unquote(path) {',
    "  if (!path.startsWith('\"')) return path",
    '  const bytes = []',
    '  for (let i = 1; i < path.length - 1; i++) {',
    '    const c = path[i]',
    "    if (c !== '\\\\') { bytes.push(...Buffer.from(c, 'utf8')); continue }",
    '    const next = path[++i]',
    '    if (/[0-7]/.test(next)) { bytes.push(parseInt(path.slice(i, i + 3), 8)); i += 2 }',
    "    else bytes.push({ n: 10, t: 9, r: 13, '\"': 34, '\\\\': 92 }[next] ?? next.charCodeAt(0))",
    '  }',
    "  return Buffer.from(bytes).toString('utf8')",
    '}',
    'function scan(patch) {',
    '  const out = []',
    "  let commit = ''",
    '  let path',
    '  let header = false',
    '  let parents = 1',
    '  let lineNo = 0',
    "  for (const line of patch.split('\\n')) {",
    "    if (line.startsWith('\\0')) { commit = line.slice(1).trim(); path = undefined; header = false; continue }",
    "    if (line.startsWith('diff ')) { path = undefined; header = true; continue }",
    '    if (header) {',
    "      if (line.startsWith('+++ ')) {",
    '        const target = unquote(line.slice(4))',
    "        path = target.startsWith('b/') ? target.slice(2) : undefined",
    '        continue',
    '      }',
    '      const h = HUNK.exec(line)',
    '      if (h === null) continue',
    '      header = false',
    '      parents = h[1].length - 1',
    '      lineNo = Number(h[2])',
    '      continue',
    '    }',
    '    const h = HUNK.exec(line)',
    '    if (h !== null) { parents = h[1].length - 1; lineNo = Number(h[2]); continue }',
    "    if (path === undefined || line.startsWith('\\\\')) continue",
    '    const columns = line.slice(0, parents)',
    "    if (columns.length < parents || columns.includes('-')) continue",
    '    if (/^\\++$/.test(columns)) {',
    '      const text = line.slice(parents)',
    '      for (const r of RULES) {',
    '        if (!r.pattern.test(text)) continue',
    '        out.push({ commit, path, line: lineNo, rule: r.name })',
    '        break',
    '      }',
    '    }',
    '    lineNo += 1',
    '  }',
    '  return out',
    '}',
    'function main(input) {',
    '  const heads = []',
    "  for (const line of input.split('\\n')) {",
    '    const next = line.trim().split(/\\s+/)[1]',
    '    if (next === undefined || /^0+$/.test(next)) continue',
    '    heads.push(next)',
    '  }',
    '  if (heads.length === 0) return',
    "  const patch = execFileSync('git', [...PATCH_ARGS, ...heads, '--not', '--all'], {",
    "    encoding: 'utf8',",
    '    maxBuffer: 256 * 1024 * 1024,',
    "    stdio: ['ignore', 'pipe', 'pipe'],",
    '  })',
    '  const found = scan(patch)',
    '  if (found.length === 0) return',
    '  refuse([',
    "    ...found.map((f) => LEAD + f.path + ':' + f.line + ' looks like ' + f.rule + ' in ' + f.commit.slice(0, 12)),",
    "    'Remove it from EVERY commit in the push — a later commit that deletes it is not enough — and treat the secret as exposed: rotate it. Nothing was pushed.',",
    '  ])',
    '}',
    "let input = ''",
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', (chunk) => { input += chunk })",
    "process.stdin.on('end', () => {",
    '  try { main(input) }',
    '  catch (error) {',
    "    const said = error && error.message ? String(error.message).split('\\n')[0] : String(error)",
    "    refuse([LEAD + 'its secret scan could not run (' + said + '). Nothing was pushed.'])",
    '  }',
    '})',
    '',
  ].join('\n')
}

/**
 * DRIVER 1'S `pre-receive` (the D5 plan's Task 11, Decision 14 (b)), rendered from THE list —
 * one file: a POSIX shell half that finds Node.js, and the JavaScript half after `SPLIT`,
 * which it hands to `node -e` (git's ref lines stay on stdin, untouched).
 *
 * **Node is found by path FIRST** — the binary the control plane itself runs on, fixed at
 * render time, so a push from a terminal or a GUI client whose `PATH` has no Node is scanned
 * all the same — then on `PATH` (a Node upgrade moved the rendered one; the next boot re-renders
 * it). **With neither, the push is REFUSED and the hook says why**: a scan that cannot run is
 * not a scan that passed. *Rejected:* `#!/usr/bin/env node`, which refuses every push from a
 * client whose `PATH` lacks Node — with `env`'s words, not Manifest's.
 */
export function renderPreReceiveHook(node: string = process.execPath): string {
  const quoted = `'${node.replace(/'/g, `'\\''`)}'`
  return [
    '#!/bin/sh',
    '# MANIFEST (§20): a push carrying a secret-shaped value is refused here. Rendered by the',
    '# control plane (source/pre-receive.ts) from the list the build gate uses, and RE-RENDERED',
    '# AT EVERY BOOT — an edit to this file does not survive one.',
    `NODE=${quoted}`,
    '[ -x "$NODE" ] || NODE=$(command -v node 2>/dev/null)',
    'if [ -z "$NODE" ]; then',
    `  echo "Manifest refused this push (§20): its secret scan needs Node.js, and found none — not ${node.replace(/["\\$`]/g, '')}, and no node on PATH. Nothing was pushed." >&2`,
    '  exit 1',
    'fi',
    `exec "$NODE" -e "$(sed -n '/^${SPLIT.replace(/\//g, '\\/')}$/,$p' "$0")"`,
    'exit 1',
    hookScript(),
  ].join('\n')
}

/** Writes the rendered hook into a bare repository, executable (`0755`). Idempotent. */
export async function installPreReceiveHook(
  gitDir: string,
  node: string = process.execPath,
): Promise<void> {
  await mkdir(join(gitDir, 'hooks'), { recursive: true })
  const hook = join(gitDir, 'hooks', 'pre-receive')
  await writeFile(hook, renderPreReceiveHook(node))
  await chmod(hook, 0o755)
}
