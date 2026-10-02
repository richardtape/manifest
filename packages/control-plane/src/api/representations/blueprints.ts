import { z } from 'zod/v4'
import type { BlueprintDescriptor, KnowledgePackFile } from '../../blueprints/index.js'
import { representation } from '../contract/schemas.js'

export const Blueprint = representation(
  'Blueprint',
  z
    .object({
      ref: z.string().describe('`name@major` — what a project pins.'),
      name: z.string().describe('The blueprint’s name.'),
      majorVersion: z
        .number()
        .int()
        .describe('Its major version — the `@major` a project pins.'),
      language: z.string().describe('What an app on it is written in.'),
      defaultPort: z
        .number()
        .int()
        .describe('The port its apps listen on unless `runtime.port` says otherwise.'),
      healthPath: z.string().describe('The health path its skeleton answers.'),
      schemaVersions: z
        .array(z.number().int())
        .describe('The `manifest:` schema versions it understands.'),
      provides: z
        .object({
          services: z
            .array(z.string())
            .describe('The service types it can bind — what `services[].type` may name.'),
          authProviders: z
            .array(z.enum(['cwl', 'none']))
            .describe('What `auth.provider` may be.'),
          ai: z.boolean().describe('Whether its apps may declare `ai.models`.'),
        })
        .describe('What an app on it may declare in manifest.yaml.'),
      starters: z
        .array(
          z.object({
            name: z
              .string()
              .describe('The starter’s name, as `starter` in `createProject`.'),
            summary: z.string().describe('What it is, in a sentence.'),
          }),
        )
        .describe('What `POST /v1/projects` accepts as `starter` for this blueprint.'),
    })
    .describe(
      'A blueprint as a client chooses one: what it provides and the starters it offers. Never its base image or build internals.',
    ),
)
export const BlueprintList = representation(
  'BlueprintList',
  z.array(Blueprint).describe('Every blueprint a project can be created from.'),
)

export const KnowledgePack = representation(
  'KnowledgePack',
  z
    .object({
      blueprint: z.string().describe('The blueprint it belongs to, `name@major`.'),
      files: z
        .array(
          z.object({
            path: z.string().describe('The file’s path in the pack — `AGENTS.md` first.'),
            mediaType: z
              .enum(['text/markdown', 'text/plain'])
              .describe('What kind of text it is.'),
            sha256: z
              .string()
              .regex(/^[0-9a-f]{64}$/)
              .describe('Hex SHA-256 of `content` as UTF-8.'),
            content: z.string().describe('The file’s text, whole.'),
          }),
        )
        .describe('Every file in the pack; read them all before writing code.'),
    })
    .describe(
      'The blueprint’s knowledge pack: the files that teach an agent to write a valid manifest.yaml and wire the blueprint, versioned with it.',
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
