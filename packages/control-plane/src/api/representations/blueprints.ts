import { z } from 'zod/v4'
import type { BlueprintDescriptor, KnowledgePackFile } from '../../blueprints/index.js'
import { representation } from '../contract/schemas.js'

export const Blueprint = representation(
  'Blueprint',
  z
    .object({
      ref: z.string().describe('`name@major` — what a project pins (§25).'),
      name: z.string(),
      majorVersion: z.number().int(),
      language: z.string(),
      defaultPort: z.number().int(),
      healthPath: z.string(),
      schemaVersions: z.array(z.number().int()),
      provides: z.object({
        services: z.array(z.string()),
        authProviders: z.array(z.enum(['cwl', 'none'])),
        ai: z.boolean(),
      }),
      starters: z
        .array(z.object({ name: z.string(), summary: z.string() }))
        .describe(
          '§25: what `POST /v1/projects` accepts as `starter` for this blueprint.',
        ),
    })
    .describe(
      'A blueprint as a client chooses one: what it provides and the starters it offers. Never its base image or build internals.',
    ),
)
export const BlueprintList = representation('BlueprintList', z.array(Blueprint))

export const KnowledgePack = representation(
  'KnowledgePack',
  z
    .object({
      blueprint: z.string(),
      files: z.array(
        z.object({
          path: z.string(),
          mediaType: z.enum(['text/markdown', 'text/plain']),
          sha256: z
            .string()
            .regex(/^[0-9a-f]{64}$/)
            .describe('Hex SHA-256 of `content` as UTF-8.'),
          content: z.string(),
        }),
      ),
    })
    .describe(
      'D25: the files that teach an agent to write a valid manifest.yaml and wire the blueprint, versioned with it.',
    ),
)

export function toBlueprint(d: BlueprintDescriptor): z.input<typeof Blueprint> {
  return {
    ref: `${d.blueprint}@${d.major_version}`,
    name: d.blueprint,
    majorVersion: d.major_version,
    language: d.runtime.language,
    defaultPort: d.runtime.default_port,
    healthPath: d.runtime.health_path,
    schemaVersions: d.schema_versions,
    provides: {
      services: d.provides.services,
      authProviders: d.provides.auth_providers,
      ai: d.provides.ai,
    },
    starters: (d.starters ?? []).map((s) => ({ name: s.name, summary: s.summary })),
  }
}

export function toKnowledgePack(
  ref: string,
  files: readonly KnowledgePackFile[],
): z.input<typeof KnowledgePack> {
  return {
    blueprint: ref,
    files: files.map((f) => ({
      path: f.path,
      mediaType: f.mediaType,
      sha256: f.sha256,
      content: f.content,
    })),
  }
}
