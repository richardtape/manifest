import { readFile } from 'node:fs/promises'
import addFormatsModule, { type FormatsPlugin } from 'ajv-formats'
import { Ajv2020 } from 'ajv/dist/2020.js'

/**
 * THIS FILE IS TYPE-CHECKED TWICE, UNDER TWO DIFFERENT MODULE RESOLUTIONS, AND THE OBVIOUS
 * AJV IMPORT IS WRONG UNDER ONE OF THEM EITHER WAY. `@manifest/mock`'s `exports` map points
 * at this source, so `packages/console`'s `tsc` — `moduleResolution: Bundler` — compiles it
 * as well as the mock's own, which is `NodeNext`. Measured 2026-09-19, both directions:
 *
 *  - `import Ajv2020 from 'ajv/dist/2020.js'` is the CLASS under Bundler and the whole
 *    `module.exports` NAMESPACE under NodeNext (*"This expression is not constructable"*);
 *  - `Ajv2020Module.default` is therefore right under NodeNext and
 *    *"Property 'default' does not exist on type 'typeof Ajv2020'"* under Bundler.
 *
 * **The NAMED import is correct under both**, and needs no cast: ajv's CommonJS sets
 * `exports.Ajv2020` and then `module.exports.Ajv2020` as well as `module.exports`, and its
 * `.d.ts` declares the class as a named export. `ajv-formats` has no named export to use,
 * so it takes the one cast in this package — its runtime value is `module.exports`, which
 * IS the function under both loaders.
 */
const addFormats = addFormatsModule as unknown as FormatsPlugin

/**
 * §16's Contract tier, and the only thing besides `tsc` that holds this mock honest
 * (Decision 10). `tsc` cannot see `additionalProperties: false`, a `format` or a
 * `pattern`, and every representation in this document carries them — `PendingAction`
 * alone has two `uuid` patterns and two `date-time` ones.
 *
 * ONE VALIDATOR, TWO CALLERS: `validate.test.ts` checks the fixture table with it, and
 * `server.ts` checks every body on its way out with the same function. The plan drafted
 * it inside the test; a second copy in the server would be a second statement of what the
 * document means, which is the shape that let the error envelope disagree with itself for
 * six sittings (P5a Task 14, finding 1).
 *
 * OPENAPI 3.1 IS JSON SCHEMA 2020-12, so this is `ajv/dist/2020` and NOT ajv's default
 * export: a draft-07 `Ajv` refuses these schemas with an error that reads like a malformed
 * document rather than like the wrong dialect (P5c Task 1, M9).
 *
 * `strict: false` because an OpenAPI document carries keywords JSON Schema does not define
 * (`openapi`, `paths`, `example`); `strict: true` would reject the DOCUMENT rather than the
 * data, which is a gate that fails for the wrong reason.
 *
 * THE WHOLE DOCUMENT IS ADDED AS ONE SCHEMA and each representation is reached by JSON
 * pointer, rather than adding the 52 schemas one at a time: an internal
 * `$ref: "#/components/schemas/UserSummary"` then resolves against the document's own root,
 * which is what the document means by it. Measured 2026-09-19 — `Project`'s `owner`
 * resolved to `UserSummary` and refused an extra `puid`.
 */
export interface Validation {
  ok: boolean
  /** Ajv's errors, rendered for a person; empty when `ok`. */
  errors: string
}

export type Validate = (schemaName: string, value: unknown) => Validation

const DOCUMENT = new URL('../../contract/openapi.json', import.meta.url)

export async function createValidator(): Promise<Validate> {
  const document = JSON.parse(await readFile(DOCUMENT, 'utf8')) as object
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  // The document's `format: uuid`, `date-time` and `uri` are assertions Ajv v8 implements
  // none of on its own — it ignores an unknown format silently, which is a validator that
  // says yes to a fixture the platform would refuse (P5c Task 1, M9/F4).
  addFormats(ajv)
  ajv.addSchema(document, 'manifest')

  return (schemaName, value) => {
    const validate = ajv.getSchema(`manifest#/components/schemas/${schemaName}`)
    if (validate === undefined)
      throw new Error(`the document has no schema ${schemaName}`)
    const ok = validate(value) === true
    return {
      ok,
      errors: ok
        ? ''
        : (validate.errors ?? [])
            .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
            .join('; '),
    }
  }
}
