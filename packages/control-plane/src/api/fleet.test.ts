import { describe, expect, it } from 'vitest'
import { loginAs, mutationHeaders, withProjectServer } from './testing.js'

/**
 * THE FLEET NAMES EACH PROJECT, AND SAYS WHEN IT IS ARCHIVED (the launch path plan's Task 12; the front-end
 * enablement plan's review, M3): without them an administrator read an archived project — its
 * environments torn down, nothing serving — as a broken one.
 */
describe('the fleet (Task 12, M3)', () => {
  it('names each project, and says it is archived and since when', async () => {
    await withProjectServer(async (ctx) => {
      const admin = await loginAs(ctx.deps, 'platform_admin')
      const read = async () => {
        const res = await ctx.app.inject({
          method: 'GET',
          url: '/v1/fleet',
          cookies: admin,
        })
        expect(res.statusCode, res.body).toBe(200)
        return (
          res.json() as {
            id: string
            name: string
            state: string
            archivedAt: string | null
          }[]
        ).find((p) => p.id === ctx.projectId)!
      }
      const project = await ctx.app.inject({
        method: 'GET',
        url: `/v1/projects/${ctx.projectId}`,
        cookies: ctx.ownerCookies,
      })
      const name = (project.json() as { name: string }).name
      // THE POSITIVE CONTROL: an active project, named, never archived.
      expect(await read()).toMatchObject({ name, state: 'active', archivedAt: null })

      const archived = await ctx.app.inject({
        method: 'POST',
        url: `/v1/projects/${ctx.projectId}/archive`,
        cookies: ctx.ownerSteppedUp,
        headers: mutationHeaders(ctx.deps),
      })
      expect(archived.statusCode, archived.body).toBe(200)
      const entry = await read()
      expect(entry).toMatchObject({ name, state: 'archived' })
      expect(entry.archivedAt).toBe(
        (archived.json() as { archivedAt: string }).archivedAt,
      )
    })
  })
})
