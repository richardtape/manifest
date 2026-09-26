// Usage, from the repository root, with a throwaway container already running:
//   docker run -d --rm --name mf-exec-probe 127.0.0.1:7107/base/node@sha256:<the blueprint's digest> sleep 300
//   MANIFEST_DATABASE_URL=postgres://nobody:nobody@127.0.0.1:1/unreachable \
//     node --experimental-transform-types --import ./packages/github-fake/resolve-ts.mjs \
//     docs/superpowers/spikes/authoring-baseline/probes/exec-probe.ts mf-exec-probe
//   docker rm -f mf-exec-probe
// The authoring API plan's Task 1, Step 8 (the brief's §7): drive the SHIPPED runtime/docker/exec.ts
// `containerExec` once against a real container, for S5's brief. This plan does not build on exec.
import { createEngineClient, resolveSocketPath } from '../../../../../packages/control-plane/src/runtime/docker/engine.ts'
import { containerExec } from '../../../../../packages/control-plane/src/runtime/docker/exec.ts'

const id = process.argv[2]
if (!id) throw new Error('usage: exec-probe.ts <container name>')
const engine = createEngineClient({ socketPath: resolveSocketPath() })

async function run(label: string, cmd: string[]) {
  const t0 = Date.now()
  const s = containerExec(engine, id, cmd, {})
  const out: string[] = []
  const err: string[] = []
  let firstLineAt: number | null = null
  for await (const line of s.stdout) {
    firstLineAt ??= Date.now() - t0
    out.push(line)
  }
  for await (const line of s.stderr) err.push(line)
  const code = await s.exitCode
  console.log(`${label}: stdout=${JSON.stringify(out)} stderr=${JSON.stringify(err)} exit=${code}` +
    ` first stdout line after ${firstLineAt} ms; exit known after ${Date.now() - t0} ms; streams ended: yes`)
}

await run('(1) the plan\'s command', ['sh', '-c', 'echo out; echo err >&2; exit 3'])
await run('(2) streamed or buffered?', ['sh', '-c', 'echo first; sleep 2; echo second'])
