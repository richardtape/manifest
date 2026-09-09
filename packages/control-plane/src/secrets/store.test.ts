import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  generateMasterKeypair,
  getSecret,
  loadMasterKeypair,
  putSecret,
  secretValuesFor,
  SecretError,
} from './index.js'
import { masterKeyFileContent, withSecretScope } from './testing.js'

describe('the secret store (§6, §12)', () => {
  it('round-trips a stored secret through Postgres', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      await putSecret(
        db,
        { projectId, environmentKind: 'staging', name: 'api-key', value: 'hunter2' },
        keys,
      )
      expect(
        await getSecret(
          db,
          { projectId, environmentKind: 'staging', name: 'api-key' },
          keys,
        ),
      ).toBe('hunter2')
    })
  })

  it('never writes the plaintext into the row', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const row = await putSecret(
        db,
        {
          projectId,
          environmentKind: 'staging',
          name: 'api-key',
          value: 'STUDENT-PII-CANARY',
        },
        keys,
      )
      // The whole row, because a plaintext that leaked into `name` or any other
      // column is just as exposed as one in `ciphertext`.
      expect(JSON.stringify(row)).not.toContain('STUDENT-PII-CANARY')
    })
  })

  it('is idempotent on (project, kind, name) — a second put UPDATES', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const scope = { projectId, environmentKind: 'staging' as const, name: 'api-key' }
      const first = await putSecret(db, { ...scope, value: 'one' }, keys)
      const second = await putSecret(db, { ...scope, value: 'two' }, keys)
      // Same row, not a second one — the unique index is what makes
      // `ensureServiceCredentials` safe to call on every deploy.
      expect(second.id).toBe(first.id)
      expect(await getSecret(db, scope, keys)).toBe('two')
    })
  })

  it('sets rotatedAt when the VALUE changed, and not when it did not', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      const scope = { projectId, environmentKind: 'staging' as const, name: 'api-key' }
      const first = await putSecret(db, { ...scope, value: 'one' }, keys)
      expect(first.rotatedAt).toBeNull()

      // Re-putting the SAME value is not a rotation. It cannot be decided by
      // comparing ciphertext — a fresh data key per seal means the same
      // plaintext encrypts differently every time — so the store has to open
      // the stored envelope and compare plaintexts.
      const same = await putSecret(db, { ...scope, value: 'one' }, keys)
      expect(same.rotatedAt).toBeNull()

      const changed = await putSecret(db, { ...scope, value: 'two' }, keys)
      expect(changed.rotatedAt).toBeInstanceOf(Date)
    })
  })

  it('scopes by environment kind, so a sandbox cannot read staging (§11)', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      await putSecret(
        db,
        {
          projectId,
          environmentKind: 'staging',
          name: 'api-key',
          value: 'staging-value',
        },
        keys,
      )
      expect(
        await getSecret(
          db,
          { projectId, environmentKind: 'sandbox', name: 'api-key' },
          keys,
        ),
      ).toBeUndefined()
    })
  })

  it('returns undefined for a name that was never stored', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      expect(
        await getSecret(
          db,
          { projectId, environmentKind: 'staging', name: 'absent' },
          keys,
        ),
      ).toBeUndefined()
    })
  })

  it('secretValuesFor returns this scope’s plaintexts and no other scope’s', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      await putSecret(
        db,
        { projectId, environmentKind: 'staging', name: 'a', value: 'staging-a' },
        keys,
      )
      await putSecret(
        db,
        { projectId, environmentKind: 'staging', name: 'b', value: 'staging-b' },
        keys,
      )
      await putSecret(
        db,
        { projectId, environmentKind: 'sandbox', name: 'a', value: 'sandbox-a' },
        keys,
      )
      // This is Task 8's redactor input: a value from another environment leaking
      // in here would be redacted out of events it does not belong to, and — far
      // worse — one MISSING from here is a secret that reaches an event log.
      const values = await secretValuesFor(
        db,
        { projectId, environmentKind: 'staging' },
        keys,
      )
      expect([...values.entries()].sort()).toEqual([
        ['a', 'staging-a'],
        ['b', 'staging-b'],
      ])
    })
  })

  it('loads a master keypair from a file and opens what it sealed', async () => {
    const keys = await generateMasterKeypair()
    const dir = await mkdtemp(join(tmpdir(), 'manifest-master-key-'))
    const path = join(dir, 'master.key')
    await writeFile(path, masterKeyFileContent(keys), 'utf8')
    await chmod(path, 0o600)

    const loaded = await loadMasterKeypair(path)
    await withSecretScope(async (db, { projectId }) => {
      await putSecret(
        db,
        { projectId, environmentKind: 'staging', name: 'api-key', value: 'from disk' },
        loaded,
      )
      expect(
        await getSecret(
          db,
          { projectId, environmentKind: 'staging', name: 'api-key' },
          keys,
        ),
      ).toBe('from disk')
    })
  })

  it('blames the MASTER KEY, not the database, when the key is the wrong one', async () => {
    await withSecretScope(async (db, { projectId, keys }) => {
      await putSecret(
        db,
        { projectId, environmentKind: 'staging', name: 'api-key', value: 'hunter2' },
        keys,
      )
      const other = await generateMasterKeypair()
      // The message an operator needs. "could not decrypt" would send them to
      // the database; this is a configuration problem and says so.
      await expect(
        getSecret(db, { projectId, environmentKind: 'staging', name: 'api-key' }, other),
      ).rejects.toThrow(SecretError)
      await expect(
        getSecret(db, { projectId, environmentKind: 'staging', name: 'api-key' }, other),
      ).rejects.toThrow(/master key/i)
    })
  })

  it('refuses a master key file that is not a keypair', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manifest-master-key-'))
    const path = join(dir, 'master.key')
    await writeFile(path, '{"v":1,"publicKey":"not-base64!!"}', 'utf8')
    await expect(loadMasterKeypair(path)).rejects.toThrow(/master key/i)
  })
})
