import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { releases } from '../db/index.js'
import { resetDatabase } from '../db/testing.js'
import { sensitiveChangeOf } from '../releases/index.js'
import {
  commitManifest,
  CWL_LAUNCH_ATTRIBUTES,
  cwlManifest,
  launchedCwlProject,
  mutationHeaders,
  projectFor,
} from './testing.js'

beforeEach(resetDatabase)
afterAll(resetDatabase)

/**
 * FE-54: A COMMIT'S SENSITIVE CHANGE AGAINST THE LAST APPROVED RELEASE — the gate's own question,
 * asked of a commit before any release is made from it.
 *
 * `sensitiveDiff` compares a manifest with the project's newest VALID one, commit by commit, so an
 * addition and its own removal never cancel there. The production gate compares the candidate's
 * RESOLVED production config with the last approved release's — blueprint defaults and the
 * production override included, resources only when they rise. `sensitiveSinceApproved` is that
 * comparison, by the gate's own functions, and null before anything has been approved.
 */
describe('a commit’s sensitive change since the last approved release (FE-54)', () => {
  it('is null before anything has been approved — every change goes through the first launch’s approval', async () => {
    const { app, deps, cookies, project } = await projectFor('bio_prof', 'fe54-new')
    try {
      const validated = await commitManifest(
        { app, deps, cookies, project },
        [
          'manifest: 1',
          'name: fe54-new',
          'blueprint: fixture-node@1',
          'runtime:',
          '  port: 3000',
          '  health: /healthz',
          '# validated again',
        ],
        'chore: a comment in the manifest',
      )
      expect(validated).toMatchObject({ valid: true, sensitiveSinceApproved: null })
    } finally {
      await app.close()
    }
  })

  it('an addition and its removal cancel against the approved release, where the newest valid manifest still sees a change', async () => {
    const launched = await launchedCwlProject('fe54-cancel')
    const ctx = launched
    try {
      // THE POSITIVE CONTROL: an attribute added and kept reads as a change in BOTH fields.
      const added = await commitManifest(
        ctx,
        cwlManifest('fe54-cancel', [...CWL_LAUNCH_ATTRIBUTES, 'sn']),
        'feat: ask for the surname',
      )
      expect(added.sensitiveDiff.fields).toEqual(['auth.attributes'])
      expect(added.sensitiveSinceApproved).toEqual(['auth.attributes'])

      // [Leave it out]: the next commit takes it away again. Against the newest valid manifest that
      // is a second change; against what was approved, nothing changed at all.
      const removed = await commitManifest(
        ctx,
        cwlManifest('fe54-cancel', CWL_LAUNCH_ATTRIBUTES),
        'revert: leave the surname out',
      )
      expect(removed.sensitiveDiff.fields).toEqual(['auth.attributes'])
      expect(removed.sensitiveSinceApproved).toEqual([])
    } finally {
      await launched.app.close()
    }
  })

  it('is the gate’s own answer: equal to what the release built from the commit is held to', async () => {
    const launched = await launchedCwlProject('fe54-gate')
    const { app, deps, cookies, project } = launched
    try {
      /**
       * A REAL CHANGE AND A CHANGE THAT IS NONE, in one commit: an egress host added, and the
       * blueprint's own default memory (512Mi) written out — nothing changes in what production runs,
       * but an absent value becomes a declared one, which a view of the manifest alone must read as a
       * rise. So the newest-valid diff says `resources`, and the gate does not. (An attribute UBC has
       * not registered would be the obvious change, and no release can be built from it: the build
       * refuses it until UBC registers it.)
       */
      const changed = await commitManifest(
        { app, deps, cookies, project },
        cwlManifest('fe54-gate', CWL_LAUNCH_ATTRIBUTES, [
          'egress:',
          '  allow: [api.example.org]',
          'resources:',
          '  memory: 512Mi',
        ]),
        'feat: one host out, and the memory written out',
      )
      expect(changed.sensitiveDiff.fields).toEqual(['egress.allow', 'resources'])
      expect(changed.sensitiveSinceApproved).toEqual(['egress.allow'])

      // The release built from exactly that commit, and the gate's own question asked of it.
      const started = await app.inject({
        method: 'POST',
        url: `/v1/projects/${project.id}/builds`,
        payload: { commitSha: changed.commitSha },
        cookies,
        headers: mutationHeaders(deps),
      })
      expect(started.statusCode, started.body).toBe(202)
      await deps.builds.idle()
      const made = await app.inject({
        method: 'POST',
        url: `/v1/projects/${project.id}/releases`,
        payload: { buildId: started.json().id },
        cookies,
        headers: mutationHeaders(deps),
      })
      expect(made.statusCode, made.body).toBe(201)
      const [row] = await deps.db
        .select()
        .from(releases)
        .where(eq(releases.id, made.json().id))
      const gate = await sensitiveChangeOf(deps.db, row!)
      expect(gate.baseline?.id).toBe(launched.release.id)
      expect(changed.sensitiveSinceApproved).toEqual(gate.fields)
    } finally {
      await app.close()
    }
  })

  it('a commit made through the API answers it too, dry run and landed', async () => {
    const launched = await launchedCwlProject('fe54-commit')
    const { app, deps, cookies, project } = launched
    try {
      const base = await deps.source.headCommit(deps.source.repositoryFor(project.slug))
      const commit = (dryRun: boolean) =>
        app.inject({
          method: 'POST',
          url: `/v1/projects/${project.id}/commits`,
          cookies,
          headers: mutationHeaders(deps),
          payload: {
            baseCommit: base,
            message: 'feat: ask for the surname',
            dryRun,
            changes: [
              {
                op: 'write',
                path: 'manifest.yaml',
                content: [
                  ...cwlManifest('fe54-commit', [...CWL_LAUNCH_ATTRIBUTES, 'sn']),
                  '',
                ].join('\n'),
              },
            ],
          },
        })
      const dry = await commit(true)
      expect(dry.statusCode, dry.body).toBe(201)
      expect(dry.json().spec.sensitiveSinceApproved).toEqual(['auth.attributes'])
      const landed = await commit(false)
      expect(landed.statusCode, landed.body).toBe(201)
      expect(landed.json().spec.sensitiveSinceApproved).toEqual(['auth.attributes'])
    } finally {
      await app.close()
    }
  })
})
