import { withProject } from '../db/testing.js'
import type { Db } from '../db/index.js'
import { generateMasterKeypair, type MasterKeypair } from './envelope.js'

/**
 * A rolled-back transaction with a project, a master keypair and a master
 * secret — the three things every test of a secret-scoped thing needs.
 *
 * The keypair is generated per call rather than shared: a keypair reused across
 * tests would let a test pass while reading a row another test sealed, which is
 * the test-isolation shape that made P2's suite depend on the order Vitest
 * happened to pick.
 */
export async function withSecretScope(
  fn: (
    tx: Db,
    ctx: {
      projectId: string
      ownerId: string
      keys: MasterKeypair
      masterSecret: string
    },
  ) => Promise<void>,
): Promise<void> {
  const keys = await generateMasterKeypair()
  await withProject(async (tx, { projectId, ownerId }) => {
    await fn(tx, {
      projectId,
      ownerId,
      keys,
      masterSecret: 'test-master-secret'.repeat(4),
    })
  })
}

/** The on-disk form `infra/lib/ensure-master-key.sh` writes and `loadMasterKeypair` reads. */
export function masterKeyFileContent(keys: MasterKeypair): string {
  return JSON.stringify({
    v: 1,
    publicKey: Buffer.from(keys.publicKey).toString('base64'),
    privateKey: Buffer.from(keys.privateKey).toString('base64'),
  })
}
