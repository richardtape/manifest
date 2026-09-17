import { z } from 'zod/v4'
import type { FleetEntry } from '../../projects/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'
import { Audience } from './projects.js'

export const Fleet = representation(
  'Fleet',
  z
    .array(
      z.object({
        id: Uuid,
        slug: z.string(),
        blueprint: z.string(),
        starter: z.string().nullable(),
        owner: z.object({ id: Uuid, displayName: z.string(), email: z.string() }),
        audience: Audience.nullable(),
        createdAt: Timestamp,
        slugReserved: z
          .boolean()
          .describe(
            '§23: holds a label reserved after it was created. Handle with the owner; never renamed automatically.',
          ),
        environments: z.array(
          z.object({
            kind: z.enum(['sandbox', 'staging', 'production']),
            hostname: z.string(),
            state: z.string().nullable(),
            releaseId: Uuid.nullable(),
            imageDigest: z.string().nullable(),
            lastDeployAt: Timestamp.nullable(),
            latestIncidentAt: Timestamp.nullable(),
          }),
        ),
      }),
    )
    .describe(
      '§26’s fleet, administrators only. Not yet: department, custom domains, AI spend this month.',
    ),
)

export function toFleet(entries: readonly FleetEntry[]): z.input<typeof Fleet> {
  return entries.map((e) => ({
    id: e.project.id,
    slug: e.project.slug,
    blueprint: e.project.blueprintRef,
    starter: e.project.starter,
    owner: e.owner,
    audience:
      e.audience === null
        ? null
        : {
            scale: e.audience.scale,
            burst: e.audience.burst,
            justification: e.audience.justification,
            setBy: e.audience.set_by,
            setAt: e.audience.set_at,
          },
    createdAt: e.project.createdAt.toISOString(),
    slugReserved: e.slugReserved,
    environments: e.environments,
  }))
}
