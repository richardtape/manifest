import { z } from 'zod/v4'
import type { FleetEntry } from '../../projects/index.js'
import { representation, Timestamp, Uuid } from '../contract/schemas.js'
import { Audience } from './projects.js'

export const Fleet = representation(
  'Fleet',
  z
    .array(
      z.object({
        id: Uuid.describe('The project.'),
        slug: z.string().describe('Its slug, which its hostnames are made from.'),
        name: z.string().describe('Its name, as its owner gave it.'),
        state: z
          .enum(['active', 'archived'])
          .describe(
            'Whether it is switched on: `archived` is switched off by its owner, its environments taken down and restorable — not broken.',
          ),
        archivedAt: Timestamp.nullable().describe(
          'When it was last archived — kept through a restore, so it says the project once was. Null if it never has been.',
        ),
        blueprint: z.string().describe('Its blueprint, `name@major`.'),
        starter: z
          .string()
          .nullable()
          .describe('Its starter; null for the skeleton alone.'),
        owner: z
          .object({
            id: Uuid.describe('Their user id.'),
            displayName: z.string().describe('Their name.'),
            email: z.string().describe('Their address.'),
          })
          .describe('Its owner of record.'),
        audience: Audience.nullable().describe(
          'Who it is for; null for a project created before the question was asked.',
        ),
        createdAt: Timestamp.describe('When it was created.'),
        slugReserved: z
          .boolean()
          .describe(
            'Whether its slug is a label reserved after the project was created. Handle with the owner; it is never renamed automatically.',
          ),
        environments: z
          .array(
            z.object({
              kind: z
                .enum(['sandbox', 'staging', 'production'])
                .describe('Which environment.'),
              hostname: z
                .string()
                .describe('Its hostname: `<slug>.<zone for this kind>`.'),
              state: z
                .string()
                .nullable()
                .describe('The serving instance’s state; null before any deploy.'),
              releaseId: Uuid.nullable().describe(
                'The release serving; null before any deploy.',
              ),
              imageDigest: z
                .string()
                .nullable()
                .describe('The image that release runs; null before any deploy.'),
              lastDeployAt: Timestamp.nullable().describe('When it was last deployed.'),
              latestIncidentAt: Timestamp.nullable().describe(
                'When its newest Incident was recorded; null if it has none.',
              ),
            }),
          )
          .describe('Its three environments, and what each is running.'),
      }),
    )
    .describe(
      'The fleet — every project, active or archived, but none deleted — for administrators only. It does not carry a project’s department, custom domains or AI spend this month.',
    ),
)

export function toFleet(entries: readonly FleetEntry[]): z.input<typeof Fleet> {
  return entries.map((e) => ({
    id: e.project.id,
    slug: e.project.slug,
    name: e.project.name,
    // The fleet lists no deleted project (`listFleet`), so a project here is one or the other.
    state: e.project.state === 'archived' ? 'archived' : 'active',
    archivedAt: e.project.archivedAt?.toISOString() ?? null,
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
