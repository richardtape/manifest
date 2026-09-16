import { describe, expect, it } from 'vitest'
import {
  dialHostOf,
  hostOfAddress,
  upstreamFor,
  type AppContainer,
} from './containers.js'
import { LABEL } from './instances.js'
import { instanceAlias } from './names.js'

/**
 * The three pure reads the retire rests on. They are exercised end to end by
 * `redeploy.docker.test.ts` and the driver contract, and pinned here because the
 * PRE-P4C branch of each is the one a Docker test can only reach by hand-building a
 * container — so it is the branch most likely to rot quietly.
 */
const container = (
  labels: Record<string, string>,
  ports: number[] = [],
): AppContainer => ({
  name: 'mf-chem-labs-staging-abcd1234-efab5678-app',
  labels,
  running: true,
  exposedPorts: ports,
})

const INSTANCE = 'efab5678-0000-4000-8000-000000000001'

describe('the address the edge dials for a container', () => {
  it('is the instance alias, with the labelled port, since P4c', () => {
    const app = container({ [LABEL.instance]: INSTANCE, [LABEL.port]: '3000' }, [3000])
    expect(dialHostOf(app)).toBe(instanceAlias(INSTANCE))
    expect(upstreamFor(app)).toBe(`${instanceAlias(INSTANCE)}:3000`)
    // NEVER the container name: 72 characters for a long slug, and a 72-character
    // name does not resolve at all (Decision 2, measured 2026-09-15).
    expect(upstreamFor(app)).not.toContain('chem-labs')
  })

  it('is the container NAME for a container from before P4c', () => {
    // No instance label, no port label — which is every container this platform
    // deployed before this plan, and what `ensureInstance` wrote until Task 4:
    // `${handle.name}:${spec.port}`.
    const app = container({ [LABEL.slug]: 'chem-labs' }, [8080])
    expect(dialHostOf(app)).toBe(app.name)
    expect(upstreamFor(app)).toBe(`${app.name}:8080`)
  })

  it('falls back to the port the container EXPOSES when no label carries one', () => {
    // The label is the answer since P4c; this is where a pre-P4c container's port
    // comes from, and the platform writes exactly one `ExposedPorts` entry.
    expect(upstreamFor(container({ [LABEL.instance]: INSTANCE }, [8080]))).toBe(
      `${instanceAlias(INSTANCE)}:8080`,
    )
  })

  it('is undefined when nothing names a port at all', () => {
    // Undefined is load-bearing: the retire does NOT invent an address, it skips the
    // drain — safe only because the serving guard has already proved that no route
    // references this container.
    expect(upstreamFor(container({ [LABEL.slug]: 'chem-labs' }, []))).toBeUndefined()
  })

  it('prefers the label over the exposed port when they disagree', () => {
    // They cannot disagree for a container this driver created. If they ever do, the
    // label is what the ROUTE was written from, so it is the one that matters.
    expect(
      upstreamFor(
        container({ [LABEL.instance]: INSTANCE, [LABEL.port]: '3000' }, [9999]),
      ),
    ).toBe(`${instanceAlias(INSTANCE)}:3000`)
  })
})

describe('hostOfAddress', () => {
  it('splits on the last colon, so a port never ends up in the host', () => {
    expect(hostOfAddress(`${instanceAlias(INSTANCE)}:3000`)).toBe(instanceAlias(INSTANCE))
    expect(hostOfAddress('mf-chem-labs-staging-abcd1234-app:8080')).toBe(
      'mf-chem-labs-staging-abcd1234-app',
    )
  })

  it('returns an address with no port unchanged', () => {
    expect(hostOfAddress('mf-i-nowhere')).toBe('mf-i-nowhere')
  })
})
