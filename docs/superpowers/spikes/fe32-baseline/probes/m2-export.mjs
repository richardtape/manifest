/**
 * FE-32 sitting 1, [M2] (and [M3] (iii), [M4]): the builder exports a file.
 *
 * Starts a throwaway builder THROUGH THE DRIVER'S OWN `withEphemeralBuilder` (runtime/docker/builder.ts —
 * `mf-builder-<id>`, rootless BuildKit v0.32.2 on `manifest-build-internal`, the generated buildkitd.toml), registers
 * it with buildx's `remote` driver under a throwaway DOCKER_CONFIG exactly as `runBuildxBuild` does, and builds one
 * recipe with `--no-cache --output type=local,dest=<out>` through the driver's own `runStreamed`, every line kept.
 * The builder is destroyed by `withEphemeralBuilder`'s `finally`; the DOCKER_CONFIG (and with it buildx's record of
 * the builder) is removed in this file's.
 *
 * Run (from anywhere): node m2-export.mjs <results-dir> <case> [<case> …]
 * It imports the COMPILED control plane (dist/, built 2026-10-16 14:49, after the last src change).
 */
import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = '/Users/rich/Developer/manifest'
const SRC = `${REPO}/packages/control-plane/dist`
const { withEphemeralBuilder, DEFAULT_BUILD_LIMITS, runStreamed } = await import(`${SRC}/runtime/docker/builder.js`)
const { createEngineClient, resolveSocketPath } = await import(`${SRC}/runtime/docker/engine.js`)
const { mintRegistryToken } = await import(`${SRC}/runtime/docker/registry-auth.js`)

const SKELETON = `${REPO}/blueprints/node-ts-mongo/skeleton`
const NPMRC = `${REPO}/blueprints/node-ts-mongo/.npmrc`
const BASE_IMAGE = /^\s*base_image:\s*(\S+)/m.exec(await readFile(`${REPO}/blueprints/node-ts-mongo/blueprint.yaml`, 'utf8'))[1]
const REGISTRY_HOST = 'manifest-registry:5000'

/** Step 2's Dockerfile, as the plan writes it. */
const RECIPE_M2 = `FROM ${BASE_IMAGE}
WORKDIR /resolve
COPY package.json package-lock.json .npmrc ./
RUN npm install --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache --loglevel http
FROM scratch
COPY --from=0 /resolve/package-lock.json /
`

/** Task 2's Resolve.tmpl, verbatim but for {{BASE_IMAGE}} — its glob COPY and Decision 12's rewrite. */
const RECIPE_TASK2 = `# THE RESOLUTION RECIPE — what \`resolveDependencies\` builds (Decision 3). Blueprint-managed, as the Dockerfile
# is, and with the same rule: NO \`# syntax=\` LINE, because the builder has no route to Docker Hub.
FROM ${BASE_IMAGE}
WORKDIR /resolve
# The platform's \`.npmrc\` with them: every lookup and every tarball through the mirror.
COPY package.json package-lock.jso[n] .npmrc ./
# A FULL install, so every tarball is fetched THROUGH the mirror and kept there — the build that follows then
# works offline. \`--package-lock-only\` would cache none (infra/seed/seed.sh). Scripts never run; the cache is
# this build's own, so nothing is taken from a machine's ~/.npm instead of the mirror.
# \`--loglevel http\`: one line per fetch, so the log shows every tarball came THROUGH the mirror (Task 2's tests read it).
RUN npm install --ignore-scripts --no-audit --no-fund --cache /tmp/npm-cache --loglevel http
# THE LOCKFILE NAMES THE PUBLIC REGISTRY, not the mirror npm fetched from — so it is portable, and \`make seed\`'s warm
# loop on the host can install it. The registry comes from npm's own config (the platform's \`.npmrc\`), never a host
# written here; the integrity hashes are untouched. \`[M2]\` measured the shape of this line.
RUN reg="$(npm config get registry)"; reg="\${reg%/}/" && \\
    sed -i "s#\\"resolved\\": \\"\${reg}#\\"resolved\\": \\"https://registry.npmjs.org/#g" package-lock.json
FROM scratch
COPY --from=0 /resolve/package-lock.json /
`

/** [M4]: Task 2's recipe, plus an exported stage holding the whole install, so "RAN is absent from it" is a read. */
const RECIPE_M4 = RECIPE_TASK2.replace(
  'COPY --from=0 /resolve/package-lock.json /\n',
  'COPY --from=0 /resolve/ /resolve/\n',
)

const skeletonManifest = JSON.parse(await readFile(`${SKELETON}/package.json`, 'utf8'))
const withDeps = (extra) =>
  JSON.stringify({ ...skeletonManifest, dependencies: { ...skeletonManifest.dependencies, ...extra } }, null, 2) + '\n'
const PROBE_NPMRC = (host) => `registry=http://${host}:4873/\nreplace-registry-host=always\nstrict-ssl=false\naudit=false\nfund=false\n`

/**
 * Each case: the recipe, the manifest, whether the skeleton's lockfile goes in as the base, the .npmrc, and
 * whether the build gets a pull token for the base image (every case but `notoken`).
 */
const CASES = {
  // Task 2 says `runBuildxResolve` takes "no registry token (it pushes nothing)" — the FROM still pulls.
  notoken: { recipe: RECIPE_M2, manifest: withDeps({ 'passport-saml': '3.2.4' }), base: true, token: false },
  // [M2] proper: one package the mirror holds, at an exact version, not in the skeleton's lockfile.
  add: { recipe: RECIPE_M2, manifest: withDeps({ 'passport-saml': '3.2.4' }), base: true },
  // The same through Task 2's recipe: the glob COPY and Decision 12's rewrite.
  'add-rewrite': { recipe: RECIPE_TASK2, manifest: withDeps({ 'passport-saml': '3.2.4' }), base: true },
  // A first resolution: no base lockfile, so the glob matches nothing. NOT the skeleton's manifest: without its
  // lockfile every transitive RANGE is resolved afresh, and a newer version than the mirror holds would send the
  // live mirror to npmjs (the plan's *The network*). One exact package the mirror holds, with no dependencies.
  first: {
    recipe: RECIPE_TASK2,
    manifest: JSON.stringify({ name: 'first-resolution', private: true, dependencies: { ms: '2.1.3' } }, null, 2) + '\n',
    base: false,
  },
  // A range the new manifest forces: an exact cookie below the hoisted 0.7.2 (express asks ~0.7.1).
  forced: { recipe: RECIPE_TASK2, manifest: withDeps({ cookie: '0.7.1' }), base: true },
  // [M3] (iii): the two non-registry specifiers, at the driver (Task 4 refuses both before a builder).
  'spec-git': { recipe: RECIPE_TASK2, manifest: withDeps({ 'left-pad': 'git+https://github.com/left-pad/left-pad.git' }), base: true },
  'spec-file': { recipe: RECIPE_TASK2, manifest: withDeps({ x: 'file:../x' }), base: true },
}
// [M3] (i), (ii), (iv) and [M4]: through a builder pointed at the THROWAWAY mirror, `mf-verdaccio-probe` on the
// builder's network. The name each asks is passed as `name@spec` after the case: `probe:<name>@<spec>`.
// `probe:` carries the skeleton's manifest and lockfile, as a real request would; `min:` and `m4:` a manifest naming the
// one package and no base lockfile — the throwaway holds none of the skeleton's tarballs, so a full install of the
// skeleton through it fails on the first of them, whatever the package asked.
function probeCase(arg, recipe = RECIPE_TASK2) {
  const [kind, nameSpec] = [arg.slice(0, arg.indexOf(':')), arg.slice(arg.indexOf(':') + 1)]
  const at = nameSpec.lastIndexOf('@')
  const name = nameSpec.slice(0, at)
  const spec = nameSpec.slice(at + 1)
  const npmrc = PROBE_NPMRC('mf-verdaccio-probe')
  if (kind === 'probe') return { recipe, manifest: withDeps({ [name]: spec }), base: true, npmrc }
  const manifest = JSON.stringify({ name: 'probe-resolution', private: true, dependencies: { [name]: spec } }, null, 2) + '\n'
  return { recipe, manifest, base: false, npmrc }
}
/** [M4]'s positive control: the same recipe WITH scripts, so "RAN is absent" is shown able to be false. */
const RECIPE_M4_SCRIPTS_ON = RECIPE_M4.replace('npm install --ignore-scripts ', 'npm install ')

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, opts, (error, stdout, stderr) => (error ? reject(Object.assign(error, { stderr })) : resolve(stdout))),
  )

const results = process.argv[2]
const engine = createEngineClient({ socketPath: resolveSocketPath() })
const keyPem = await readFile(`${REPO}/infra/registry-auth/token.key`, 'utf8')
const certPem = await readFile(`${REPO}/infra/registry-auth/token.crt`, 'utf8')

for (const arg of process.argv.slice(3)) {
  // FE32_PHASE prefixes the directory, so one case run under several uplink states keeps each run's lines.
  const name = (process.env.FE32_PHASE ? `${process.env.FE32_PHASE}-` : '') + arg.replace(/[:@/]/g, '_')
  const c = arg.startsWith('probe:') || arg.startsWith('min:')
    ? probeCase(arg)
    : arg.startsWith('m4:')
      ? probeCase(arg, RECIPE_M4)
      : arg.startsWith('m4on:')
        ? probeCase(arg, RECIPE_M4_SCRIPTS_ON)
        : CASES[arg]
  if (c === undefined) throw new Error(`no case ${arg}`)
  const dir = join(results, name)
  const ctx = join(dir, 'context')
  const out = join(dir, 'out')
  await rm(dir, { recursive: true, force: true })
  await mkdir(ctx, { recursive: true })
  await mkdir(out, { recursive: true })
  await writeFile(join(ctx, 'Dockerfile'), c.recipe)
  await writeFile(join(ctx, 'package.json'), c.manifest)
  if (c.base) await copyFile(`${SKELETON}/package-lock.json`, join(ctx, 'package-lock.json'))
  if (c.npmrc) await writeFile(join(ctx, '.npmrc'), c.npmrc)
  else await copyFile(NPMRC, join(ctx, '.npmrc'))

  const buildId = `fe32-${name.slice(0, 20).replace(/[^a-z0-9-]/gi, '-').toLowerCase()}-${Date.now().toString(36)}`
  const token = mintRegistryToken(keyPem, certPem, {
    issuer: 'manifest-control-plane',
    service: 'manifest-registry',
    subject: buildId,
    access: [{ type: 'repository', name: 'base/node', actions: ['pull'] }],
    ttlSeconds: 1020,
  })
  const lines = []
  const t0 = performance.now()
  let t1 = 0
  let outcome
  try {
    outcome = await withEphemeralBuilder(engine, buildId, DEFAULT_BUILD_LIMITS, async (builder) => {
      const configDir = await mkdtemp(join(tmpdir(), 'mf-fe32cfg-'))
      try {
        await writeFile(
          join(configDir, 'config.json'),
          JSON.stringify(c.token === false ? {} : { auths: { [REGISTRY_HOST]: { registrytoken: token } } }),
        )
        await symlink(join(homedir(), '.docker', 'cli-plugins'), join(configDir, 'cli-plugins'))
        const env = { ...process.env, DOCKER_CONFIG: configDir }
        await run('docker', ['buildx', 'create', '--name', builder, '--driver', 'remote', `docker-container://${builder}`], { env })
        t1 = performance.now()
        return await runStreamed({
          command: 'docker',
          args: ['buildx', '--builder', builder, 'build', '--no-cache', '--provenance=false', '--output', `type=local,dest=${out}`, ctx],
          env,
          timeoutMs: 300_000,
          secrets: [token],
          onLine: (line) => lines.push(`${line.stream}\t${line.text}`),
        })
      } finally {
        await rm(configDir, { recursive: true, force: true })
      }
    })
  } catch (error) {
    outcome = { error: String(error?.message ?? error) }
  }
  const t2 = performance.now()
  const files = await readdir(out, { recursive: true }).catch(() => [])
  const result = {
    case: arg,
    buildId,
    baseImage: BASE_IMAGE,
    exitCode: outcome?.exitCode ?? null,
    timedOut: outcome?.timedOut ?? null,
    error: outcome?.error ?? null,
    msBuilderStart: Math.round(t1 - t0),
    msBuild: Math.round(t2 - t1),
    msTotal: Math.round(t2 - t0),
    exported: files.slice(0, 40),
    exportedCount: files.length,
    logLines: lines.length,
  }
  await writeFile(join(dir, 'log.txt'), lines.join('\n') + '\n')
  await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
