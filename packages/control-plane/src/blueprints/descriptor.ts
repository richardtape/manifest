import { z } from 'zod'

/** Base images are pinned by digest, never by tag (§12 supply chain). */
const DIGEST_PINNED = /@sha256:[0-9a-f]{64}$/

/**
 * The same quantity grammar the app-side schema uses. It is repeated rather than
 * imported because §5 forbids `blueprints/` reaching into `spec/`'s internals, and
 * because a blueprint default that the resolver cannot read is worse than a missing
 * one: Task 16 merges these underneath the app's own numbers, and `toMebibytes`
 * returns NaN for anything else — which compares false against every quota.
 */
const QUANTITY = /^\d+(\.\d+)?(Mi|Gi)?$/

export const descriptorSchema = z
  .object({
    blueprint: z.string().regex(/^[a-z][a-z0-9-]{2,38}$/),
    major_version: z.number().int().positive(),
    schema_versions: z.array(z.number().int().positive()).min(1),
    runtime: z
      .object({
        language: z.string().min(1),
        base_image: z.string().regex(DIGEST_PINNED, {
          message: 'base_image must be pinned by digest, not by tag',
        }),
        default_port: z.number().int().min(1).max(65535),
        health_path: z.string().regex(/^\/[A-Za-z0-9/_-]{1,64}$/),
        run_as_uid: z.number().int().min(1),
      })
      .strict(),
    provides: z
      .object({
        services: z.array(z.string().min(1)),
        auth_providers: z.array(z.enum(['cwl', 'none'])).min(1),
        ai: z.boolean(),
      })
      .strict(),
    defaults: z
      .object({
        resources: z
          .object({
            cpu: z.number().positive(),
            memory: z.string().regex(QUANTITY),
            pids: z.number().int().positive(),
            disk: z.string().regex(QUANTITY),
          })
          .strict(),
      })
      .strict(),
    injection: z.object({ contract: z.string().min(1) }).strict(),
    dockerfile: z.string().min(1),
    knowledge_pack: z.string().min(1),
    /**
     * Exact versions of app-side libraries this blueprint installs (C6). Ranges are
     * refused: §16's injection-contract drift test asserts against a stated version,
     * and a range would let the contract drift underneath the test built to catch drift.
     */
    pinned_dependencies: z.record(z.string().regex(/^\d+\.\d+\.\d+$/)).optional(),
    /**
     * §25 *Starters* (P5a Task 10): complete apps laid over the skeleton at project
     * creation and copied once. `path` must be `./starters/<name>/` — the registry checks
     * that the two agree, because a name that points at another starter's files is a
     * console offering one app and seeding a different one.
     */
    starters: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z][a-z0-9-]{2,38}$/),
            path: z.string().regex(/^\.\/starters\/[a-z][a-z0-9-]{2,38}\/$/),
            summary: z.string().min(1).max(200),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()

export type BlueprintDescriptor = z.infer<typeof descriptorSchema>
