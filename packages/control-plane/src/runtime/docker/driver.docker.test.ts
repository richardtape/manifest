import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll } from 'vitest'
import { describeDriverContract } from '../driver-contract.js'
import { describeDocker } from './docker-tier.js'
import { dockerDriverForTests, ensureContractRepo } from './testing.js'

const run = promisify(execFile)

// The identical suite the fake driver passes (§16). Not a copy, not a subset, and
// not weakened: every assertion in `driver-contract.ts` is exactly as P2 wrote it.
// The one thing supplied here is the fixture the suite could not invent — an image
// that really exists — and it is one this driver BUILT, so the run additionally
// proves `ensureInstance` can run what `buildImage` produced.
describeDocker('Docker driver', () => {
  beforeAll(() => {
    // The suite names `/tmp/repo` and `abc123` as literals. They are made real
    // here rather than by changing the contract — see `ensureContractRepo`.
    ensureContractRepo()
  })

  afterAll(async () => {
    await run('sh', [
      '-c',
      'docker ps -aq --filter label=manifest.slug=chem-labs | xargs docker rm -f 2>/dev/null || true',
    ]).catch(() => undefined)
    for (const name of ['mf-chem-labs-staging-db', 'mf-egress-chem-labs-staging']) {
      await run('docker', ['rm', '-f', name]).catch(() => undefined)
    }
  })

  describeDriverContract('docker', () => dockerDriverForTests(), {
    runnableImage: (driver) =>
      driver.buildImage(
        { repoPath: '/tmp/repo', commitSha: 'abc123' },
        { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
      ),
  })
})
