import { describe, expect, it } from 'vitest'
import { EngineError } from './engine.js'
import { assertDockerAvailable, dockerTierRequested } from './docker-tier.js'

describe('the Docker test tier', () => {
  it('is not requested by default, so `pnpm test` stays Docker-free', () => {
    expect(dockerTierRequested({})).toBe(false)
    expect(dockerTierRequested({ MANIFEST_TEST_DOCKER: '0' })).toBe(false)
  })

  it('is requested by MANIFEST_TEST_DOCKER=1', () => {
    expect(dockerTierRequested({ MANIFEST_TEST_DOCKER: '1' })).toBe(true)
  })

  // THE POINT OF THIS TASK. Requested-but-unavailable must fail, never skip.
  it('fails — does not skip — when it is requested and Docker is unreachable', async () => {
    await expect(
      assertDockerAvailable({
        MANIFEST_TEST_DOCKER: '1',
        MANIFEST_DOCKER_SOCKET: '/nonexistent.sock',
      }),
    ).rejects.toThrow(EngineError)
    try {
      await assertDockerAvailable({
        MANIFEST_TEST_DOCKER: '1',
        MANIFEST_DOCKER_SOCKET: '/nonexistent.sock',
      })
    } catch (error) {
      expect((error as EngineError).code).toBe('DOCKER_TIER_UNAVAILABLE')
      expect((error as EngineError).hint).toContain('MANIFEST_TEST_DOCKER')
    }
  })

  it('does nothing when the tier was never requested, even with a bad socket', async () => {
    await expect(
      assertDockerAvailable({ MANIFEST_DOCKER_SOCKET: '/nonexistent.sock' }),
    ).resolves.toBeUndefined()
  })
})
