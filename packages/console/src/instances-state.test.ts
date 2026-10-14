import { fixtures } from '@manifest/mock'
import type { Schemas, StreamFrame } from '@manifest/contract'
import { describe, expect, it } from 'vitest'
import { exitedFramesFor, servingWords } from './instances-state.js'

/**
 * WHAT SERVES AN ENVIRONMENT, AS THE CONSOLE SAYS IT (A1 Task 7). Production runs a SET — two for a
 * `class` app — and since the set watcher a member that stopped stays in it, `failed`, until its
 * replacement serves while the rest serve on. A pill read off `instance`, the set's first, would say
 * `failed` while the app served. No DOM tier (P5c Decision 7): the screens' words are decided here.
 */

const production = (envs: Schemas['EnvironmentList']) =>
  envs.find((e) => e.kind === 'production')!

describe('servingWords — an environment’s set, in words', () => {
  it('a launched `class` app’s production: two instances, healthy', () => {
    expect(servingWords(production(fixtures.LAUNCHED_ENVIRONMENTS))).toEqual({
      state: 'healthy',
      text: '2 instances, healthy',
    })
  })

  it('one member stopped and awaiting its replacement: healthy, and it says which', () => {
    const env = production(fixtures.LAUNCHED_ENVIRONMENTS)
    const stopped: Schemas['Environment'] = {
      ...env,
      instance: { ...env.instance!, state: 'failed' },
      instances: [{ ...env.instances[0]!, state: 'failed' }, env.instances[1]!],
    }
    expect(servingWords(stopped)).toEqual({
      state: 'healthy',
      text: '2 instances: 1 healthy, 1 failed',
    })
  })

  it('one instance reads as its state alone, as before', () => {
    expect(servingWords(fixtures.STAGING)).toEqual({ state: 'healthy', text: 'healthy' })
  })

  it('never deployed: no state', () => {
    expect(servingWords(production(fixtures.ENVIRONMENTS))).toEqual({
      state: null,
      text: 'never deployed',
    })
  })
})

describe('exitedFramesFor — an exit, in the environment’s own list', () => {
  const exited = (environmentId: string): StreamFrame =>
    ({
      kind: 'event',
      id: '77777777-7777-4777-8777-777777777777',
      type: 'instance.exited',
      subject: 'instance:x',
      createdAt: '2026-10-14T07:00:00.000Z',
      humanMessage: 'An instance of production stopped; it is being replaced.',
      machineDetail: { environmentId },
    }) as unknown as StreamFrame

  it('lists an exit of this environment’s instance, and no other environment’s', () => {
    const env = production(fixtures.LAUNCHED_ENVIRONMENTS)
    expect(
      exitedFramesFor([exited(env.id), exited(fixtures.STAGING.id)], env).map(
        (f) => f.message,
      ),
    ).toEqual(['An instance of production stopped; it is being replaced.'])
  })
})
