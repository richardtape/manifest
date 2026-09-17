import { describe, expect, it } from 'vitest'
import { manifestSchema, type ManifestSpec } from './schema.js'
import { DESCRIBED_PATHS, describeDiff, isSensitiveDiff } from './diff.js'
import { resolveConfig, type ResolvedConfig } from './resolve.js'

const base = (extra: Record<string, unknown> = {}): ManifestSpec =>
  manifestSchema.parse({
    manifest: 1,
    name: 'chem-lab-scheduler',
    blueprint: 'node-ts-mongo@2',
    runtime: { port: 3000 },
    ...extra,
  })

describe('isSensitiveDiff (§7, D9)', () => {
  it('reports no change as not sensitive', () => {
    expect(isSensitiveDiff(base(), base())).toEqual({ sensitive: false, fields: [] })
  })

  it('ignores an insensitive change', () => {
    const after = base({ description: 'now with a description' })
    expect(isSensitiveDiff(base(), after).sensitive).toBe(false)
  })

  it('flags a new service', () => {
    const after = base({ services: [{ type: 'mongo', version: '7', name: 'db' }] })
    expect(isSensitiveDiff(base(), after)).toEqual({
      sensitive: true,
      fields: ['services'],
    })
  })

  it('flags a new CWL attribute (D16)', () => {
    const before = base({ auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid'] } })
    const after = base({
      auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] },
    })
    expect(isSensitiveDiff(before, after).fields).toEqual(['auth.attributes'])
  })

  it('flags a removed attribute too — the registration must still match', () => {
    const before = base({
      auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] },
    })
    const after = base({ auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid'] } })
    expect(isSensitiveDiff(before, after).fields).toEqual(['auth.attributes'])
  })

  it('flags a new egress destination', () => {
    const after = base({ egress: { allow: ['api.ubc.ca'] } })
    expect(isSensitiveDiff(base(), after).fields).toEqual(['egress.allow'])
  })

  it('flags a resource INCREASE but not a decrease', () => {
    const small = base({ resources: { cpu: 0.5, memory: '512Mi' } })
    const large = base({ resources: { cpu: 1, memory: '1Gi' } })
    expect(isSensitiveDiff(small, large).fields).toEqual(['resources'])
    expect(isSensitiveDiff(large, small).sensitive).toBe(false)
  })

  it('flags a classification change in either direction', () => {
    const before = base({ data: { classification: 'internal' } })
    const after = base({ data: { classification: 'confidential' } })
    expect(isSensitiveDiff(before, after).fields).toEqual(['data.classification'])
    expect(isSensitiveDiff(after, before).fields).toEqual(['data.classification'])
  })

  it('flags a model change — jurisdiction can move without classification changing', () => {
    const before = base({ ai: { models: ['default-chat'] } })
    const after = base({ ai: { models: ['default-chat-onprem'] } })
    expect(isSensitiveDiff(before, after).fields).toEqual(['ai.models'])
  })

  it('flags a blueprint MAJOR bump but not a name-identical repin', () => {
    const after = base({ blueprint: 'node-ts-mongo@3' })
    expect(isSensitiveDiff(base(), after).fields).toEqual(['blueprint'])
    expect(isSensitiveDiff(base(), base()).sensitive).toBe(false)
  })

  // The three below were added in execution. Each is a case the eleven above do
  // not reach, and in two of them the gate lets a change through unreviewed.

  it('flags a swap to a DIFFERENT blueprint at the same major version', () => {
    // §7's reason for gating `blueprint` is that under D13 the blueprint is the
    // build definition. Replacing it wholesale changes the Dockerfile, base image
    // and knowledge pack at least as much as a major bump does.
    const after = base({ blueprint: 'python-fastapi@2' })
    expect(isSensitiveDiff(base(), after).fields).toEqual(['blueprint'])
  })

  it('flags a declared resource being REMOVED, because the default may be higher', () => {
    // An absent field means "inherit the blueprint default" (§7), not zero. Going
    // from cpu: 0.5 to absent can therefore be an increase, and the gate cannot
    // tell which without the blueprint — so it escalates rather than guesses.
    const before = base({ resources: { cpu: 0.5 } })
    const after = base({ resources: {} })
    expect(isSensitiveDiff(before, after).fields).toEqual(['resources'])
  })

  it('does not escalate on services being REORDERED', () => {
    const order = (a: string, b: string) => ({
      services: [
        { type: 'mongo', version: '7', name: a },
        { type: 'qdrant', version: '1', name: b },
      ],
    })
    const before = base(order('db', 'vectors'))
    const after = base({
      services: [
        { type: 'qdrant', version: '1', name: 'vectors' },
        { type: 'mongo', version: '7', name: 'db' },
      ],
    })
    expect(isSensitiveDiff(before, after)).toEqual({ sensitive: false, fields: [] })
  })

  it('does not escalate on a service whose KEYS arrive in another order (P5a sitting 6)', () => {
    // The route compares the previous spec READ BACK FROM jsonb, which stores an object's
    // keys by length and then bytes — `{name, type, version}` — with one zod has just
    // parsed in schema order, `{type, version, name}`. Measured: every re-validation of a
    // manifest declaring a service reported `services` as a sensitive change.
    const parsed = base({ services: [{ type: 'mongo', version: '7', name: 'db' }] })
    const fromJsonb = {
      ...parsed,
      services: [{ name: 'db', type: 'mongo', version: '7' }],
    } as ManifestSpec
    expect(isSensitiveDiff(fromJsonb, parsed)).toEqual({ sensitive: false, fields: [] })
  })

  it('reports every changed field, not just the first', () => {
    const after = base({
      services: [{ type: 'mongo', version: '7', name: 'db' }],
      egress: { allow: ['api.ubc.ca'] },
      data: { classification: 'confidential' },
    })
    const result = isSensitiveDiff(base(), after)
    expect(result.sensitive).toBe(true)
    expect(result.fields.sort()).toEqual([
      'data.classification',
      'egress.allow',
      'services',
    ])
  })
})

/**
 * §14's "the diff since the last healthy release" — P4b Task 13.
 *
 * Over the FROZEN `ResolvedConfig`, not `app_specs.parsed`: a release is what §13
 * froze, and `deployRelease` reads nothing else (P4b sitting 1, divergence 4). So
 * these build their inputs through `resolveConfig`, which is how a release gets one.
 */
describe('describeDiff (§14)', () => {
  const DEFAULTS = { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' }
  const staged = (extra: Record<string, unknown> = {}): ResolvedConfig =>
    resolveConfig(base(extra), 'staging', DEFAULTS)
  const mongo = { type: 'mongo', version: '7', name: 'db' }
  const qdrant = { type: 'qdrant', version: '1', name: 'vectors' }

  it('reads as a change, not as a JSON dump', () => {
    expect(describeDiff(staged(), staged({ services: [mongo] }))).toEqual([
      {
        path: 'services',
        from: 'none',
        to: 'mongo 7 (db)',
        summary: 'added a mongo database called db',
      },
    ])
  })

  it('reports nothing for two identical configs', () => {
    expect(
      describeDiff(staged({ services: [mongo] }), staged({ services: [mongo] })),
    ).toEqual([])
  })

  it('ignores a reordering, like isSensitiveDiff does', () => {
    // P2 paid for this once: a plain JSON.stringify on `services` escalated a
    // release to approval for swapping two entries, which changed nothing. Here it
    // would tell an agent a working app's services had changed when they had not.
    expect(
      describeDiff(
        staged({ services: [mongo, qdrant] }),
        staged({ services: [qdrant, mongo] }),
      ),
    ).toEqual([])
    expect(
      describeDiff(
        staged({ egress: { allow: ['a.ubc.ca', 'b.ubc.ca'] } }),
        staged({ egress: { allow: ['b.ubc.ca', 'a.ubc.ca'] } }),
      ),
    ).toEqual([])
  })

  it('names a changed version and a removed service in one entry', () => {
    const changes = describeDiff(
      staged({ services: [mongo, qdrant] }),
      staged({ services: [{ ...mongo, version: '8' }] }),
    )
    expect(changes).toEqual([
      {
        path: 'services',
        from: 'mongo 7 (db), qdrant 1 (vectors)',
        to: 'mongo 8 (db)',
        summary:
          'changed the mongo database called db from version 7 to 8; ' +
          'removed the qdrant vector store called vectors',
      },
    ])
  })

  it('says which way a resource moved, one dimension at a time, in real units', () => {
    const changes = describeDiff(
      staged({ resources: { cpu: 0.5, memory: '512Mi', disk: '1Gi' } }),
      // 1024Mi IS 1Gi: a respelling is not a change.
      staged({ resources: { cpu: 1, memory: '256Mi', disk: '1024Mi' } }),
    )
    expect(changes).toEqual([
      {
        path: 'resources.cpu',
        from: '0.5',
        to: '1',
        summary: 'raised the CPU limit from 0.5 to 1',
      },
      {
        path: 'resources.memory',
        from: '512Mi',
        to: '256Mi',
        summary: 'lowered the memory limit from 512Mi to 256Mi',
      },
    ])
  })

  it('names environment variables and never prints their values', () => {
    // A value in manifest.yaml is not a secret by §7's rules, but it can still be a
    // URL with a token in it, and this text goes into an Incident an agent reads.
    const changes = describeDiff(
      staged({
        env: [
          { name: 'API_BASE', value: 'https://old.example.ubc.ca' },
          { name: 'TOKEN', secret: true },
        ],
      }),
      staged({
        env: [
          { name: 'API_BASE', value: 'https://new.example.ubc.ca' },
          { name: 'FEATURE_FLAG', value: 'enabled-for-all' },
        ],
      }),
    )
    expect(changes).toEqual([
      {
        path: 'env',
        from: 'API_BASE, TOKEN',
        to: 'API_BASE, FEATURE_FLAG',
        summary: 'added FEATURE_FLAG; removed TOKEN; changed the value of API_BASE',
      },
    ])
    const text = JSON.stringify(changes)
    expect(text).not.toContain('example.ubc.ca')
    expect(text).not.toContain('enabled-for-all')
  })

  it('reads a release frozen before `auth` and `ai` were resolved as the defaults it ran with', () => {
    // §13 froze the config, and a release from before P4a Task 9 has no `auth` key and
    // one from before Task 10 no `ai` (pre-flight 64). Such an app ran with no sign-on
    // and no models, so that is what it is compared as — not as a crash on undefined.
    const frozen: Partial<ResolvedConfig> = { ...staged() }
    delete frozen.auth
    delete frozen.ai
    expect(describeDiff(frozen as ResolvedConfig, staged())).toEqual([])
    expect(
      describeDiff(
        frozen as ResolvedConfig,
        staged({ ai: { models: ['default-chat'] } }),
      ).map((c) => c.path),
    ).toEqual(['ai.models'])
  })

  it('describes every field a resolved config carries — and a new field fails here', () => {
    // An Incident that says "nothing changed" when something did is the lie §14's
    // diff exists to prevent, and a field this function does not know about is
    // exactly how that happens. So every leaf changes at once, and every one must be
    // reported — and the list of leaves is read off a REAL resolved config, so a key
    // added to `ResolvedConfig` without a description is a red test, not a silence.
    const before = staged({
      runtime: { port: 3000, health: '/healthz' },
      resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '1Gi' },
      env: [{ name: 'A', value: '1' }],
      services: [mongo],
      egress: { allow: ['a.ubc.ca'] },
      data: { classification: 'internal' },
      auth: { provider: 'none', attributes: [], callback: '/cb', logout: '/out' },
      ai: { models: [], budget: { project_monthly_usd: 5, per_user_monthly_usd: 1 } },
    })
    const after = staged({
      runtime: { port: 8080, health: '/ready' },
      resources: { cpu: 1, memory: '1Gi', pids: 512, disk: '2Gi' },
      env: [{ name: 'B', value: '1' }],
      services: [qdrant],
      egress: { allow: ['b.ubc.ca'] },
      data: { classification: 'confidential' },
      auth: { provider: 'cwl', attributes: ['mail'], callback: '/cb2', logout: '/out2' },
      ai: {
        models: ['default-chat'],
        budget: { project_monthly_usd: 10, per_user_monthly_usd: 2 },
      },
    })
    const leaves = (value: unknown, prefix = ''): string[] =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value).flatMap(([key, v]) =>
            leaves(v, prefix === '' ? key : `${prefix}.${key}`),
          )
        : [prefix]
    // Same keys on both sides, so a leaf missing from one config is not hiding one.
    expect(leaves(after).sort()).toEqual(leaves(before).sort())
    expect(Object.keys(DESCRIBED_PATHS).sort()).toEqual(leaves(before).sort())

    const reported = describeDiff(before, after).map((c) => c.path)
    const expected = Object.values(DESCRIBED_PATHS).filter((path) => path !== null)
    expect(reported.sort()).toEqual([...new Set(expected)].sort())
  })
})
