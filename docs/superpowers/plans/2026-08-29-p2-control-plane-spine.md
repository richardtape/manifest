# P2 — Control-Plane Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every part of the Manifest control plane that can be tested without Docker — spec validation, blueprints, the driver abstraction, identity and authorization, builds and releases — and prove it by driving the full project→spec→build→release→deploy lifecycle against an in-memory fake driver in under a second.

**Architecture:** A pnpm workspace whose `control-plane` package holds §5's module map as `src/<module>/` folders, each with a public `index.ts` and no reach into another module's internals. Domain logic is pure functions over plain data; all infrastructure sits behind the §11 `Driver` interface, which has two implementations — a fake one here, a Docker one in P3 — that pass the identical contract suite. Fastify serves a minimal HTTP surface; every mutating route takes an idempotency key and every route carries an explicit `ProjectMember` check.

**Tech Stack:** TypeScript (strict), Node 22 LTS, pnpm workspaces, Fastify, Postgres 16, Drizzle ORM + Drizzle Kit, Zod (+ `fastify-type-provider-zod`), Vitest, Supertest, ESLint flat config + Prettier.

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md)

**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — P2's scope, and gaps 1, 2 and 3 which this plan discharges.

**Depends on:** P1 (for a running Postgres) to execute, and **S1** to finish being written.

> ## ⚠ This plan is incomplete and deliberately paused
>
> **Tasks 1–8 are final.** Scaffolding, `spec/`, `blueprints/` and the database
> schema are settled by §7 and §25 of the spec. No spike outcome changes them, and
> they can be executed as soon as P1 provides a Postgres.
>
> **Tasks 9 onward are not written, and must not be written until S1 reports.**
> Task 9 is the §11 `Driver` interface; Task 10 is the contract suite **P3 inherits
> unchanged**. S1's brief lists *"a list of `Driver` interface signatures that
> turned out to be wrong"* among the things that survive the spike — so writing the
> interface, an implementation of it, and the suite that pins it, all before the
> spike that corrects it, is the precise rework the spike exists to prevent.
>
> Tasks 9 and 10 below were drafted before this was noticed. **Treat them as a
> starting sketch to be reconciled against S1's findings, not as instructions.**
> Everything from Task 11 — source driver, identity, authorization, releases,
> deploy — is unwritten because it consumes Task 9's types.
>
> Resume when S1's findings note exists at `docs/superpowers/spikes/S1-findings.md`.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Node 22 LTS**, pinned in `.nvmrc` and `engines`. `passport-ubcshib` declares `"node": ">=22.0.0"`.
- **TypeScript `strict: true`.** No `any` in committed code; use `unknown` and narrow.
- **No module reaches into another module's internals** (§5). Imports cross module boundaries only through `src/<module>/index.ts`. Enforced by ESLint *and* by a test (Task 1).
- **Project slug / `name` regex:** `^[a-z][a-z0-9-]{2,38}$` (§7).
- **`auth.callback` and `auth.logout` are PATHS**, regex `^/[A-Za-z0-9/_-]{1,64}$`. Never URLs (D15).
- **The seven sensitive fields**, and only these, re-escalate to approval (§7): `services`, `auth.attributes`, `egress.allow`, `resources` (increase only), `data.classification`, `ai.models`, `blueprint` (major version).
- **Classification ordering:** `public` < `internal` < `confidential`. An app may use a logical model only if the model's `max_classification` is greater than or equal to the app's `data.classification` (D17).
- **Reserved blocks must be empty:** `integrations`, `jobs`, `checks` (§7, §15).
- **A `runtime.build` block of any kind is rejected** (D13).
- **`uid` is not a UBC attribute.** The identifier is `ubcEduCwlPuid` (§7).
- **Errors are machine-actionable** (§20, D23.7): every error carries a stable `code` and a `hint` alongside its human `message`.
- **Idempotency keys on every mutating action** (D23.6).
- **Every route carries an explicit ownership check** against `ProjectMember` (§20). IDOR is the likeliest defect class here.
- **Ports:** the platform uses the 7100–7199 block. The control plane is **7100**; Postgres is **7103**.
- **Never commit a secret**, and never log one.
- **Commit after every task.** Conventional commit messages (`feat:`, `test:`, `chore:`).

---

## File Structure

```
manifest/
├── .nvmrc                                  Node version pin
├── package.json                            workspace root, scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json                      strict, shared
├── eslint.config.js                        flat config incl. module boundaries
├── vitest.workspace.ts
├── blueprints/
│   └── fixture-node/
│       ├── blueprint.yaml                  §25 descriptor
│       ├── Dockerfile.tmpl                 D13 — blueprint-managed
│       └── skeleton/                       minimal app source
└── packages/
    └── control-plane/
        ├── package.json
        ├── tsconfig.json
        ├── drizzle.config.ts
        ├── drizzle/                        generated migrations
        └── src/
            ├── index.ts                    boot
            ├── config.ts                   env parsing, dev-auth guard
            ├── db/
            │   ├── schema.ts               Drizzle tables for §6
            │   ├── client.ts
            │   └── index.ts
            ├── errors/
            │   └── index.ts                ManifestError, codes, hints
            ├── spec/
            │   ├── schema.ts               Zod schema for manifest.yaml (§7)
            │   ├── errors.ts               Zod issue → ManifestError
            │   ├── policy.ts               whitelist, catalogues, quota, D17
            │   ├── diff.ts                 isSensitiveDiff (§7)
            │   ├── resolve.ts              environment override merge
            │   └── index.ts
            ├── blueprints/
            │   ├── descriptor.ts           Zod schema for blueprint.yaml (§25)
            │   ├── registry.ts             load, list, pin by major
            │   ├── compatibility.ts        checkBlueprintCompatibility
            │   └── index.ts
            ├── runtime/
            │   ├── driver.ts               the §11 Driver interface
            │   ├── fake-driver.ts          in-memory implementation
            │   ├── state-machine.ts        §11 instance transitions
            │   └── index.ts
            ├── source/
            │   ├── git-driver.ts           SourceDriver interface
            │   ├── local-driver.ts         bare repos on disk (D5)
            │   └── index.ts
            ├── identity/
            │   ├── dev-auth.ts             the shim (roadmap gap 3)
            │   ├── session.ts
            │   └── index.ts
            ├── projects/
            │   ├── repository.ts
            │   ├── authz.ts                ProjectMember checks
            │   └── index.ts
            ├── releases/
            │   ├── build.ts
            │   ├── release.ts
            │   └── index.ts
            └── api/
                ├── server.ts               Fastify wiring
                ├── idempotency.ts          D23.6
                ├── routes/
                │   ├── auth.ts   projects.ts   builds.ts
                │   ├── releases.ts   environments.ts
                └── index.ts
```

**Test files** sit beside their subject as `*.test.ts`, except the two contract suites, which are shared and live at `src/runtime/driver-contract.ts` and `src/api/authz-contract.ts` so P3 can import them unchanged.

---

## Task 1: Workspace scaffolding and the module-boundary rule

**Files:**
- Create: `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `vitest.workspace.ts`
- Create: `packages/control-plane/package.json`, `packages/control-plane/tsconfig.json`
- Create: `packages/control-plane/src/spec/index.ts` (placeholder export, replaced in Task 2)
- Test: `packages/control-plane/src/module-boundaries.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a workspace where `pnpm test` runs Vitest, `pnpm lint` runs ESLint, and a **test** fails if any file imports another module by a deep path. Every later task depends on this harness existing.

**Why the boundary is enforced twice.** §5 requires each module to have its own public interface with no reach into another's internals, and D22 requires the same rule of `console/` later. A lint rule can be disabled inline with a comment; a test that walks the import graph cannot be waved away as easily. Both, per the spec's own wording: *"A lint boundary and a test enforce this."*

- [ ] **Step 1: Create the workspace root**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

`.nvmrc`:

```
22
```

`package.json`:

```json
{
  "name": "manifest",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc -b --pretty"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "eslint": "^9.17.0",
    "prettier": "^3.4.2",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.1",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`vitest.workspace.ts`:

```ts
export default ['packages/*']
```

- [ ] **Step 2: Create the control-plane package**

`packages/control-plane/package.json`:

```json
{
  "name": "@manifest/control-plane",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.1",
    "yaml": "^2.6.1"
  }
}
```

`packages/control-plane/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`packages/control-plane/src/spec/index.ts`:

```ts
export const MODULE = 'spec'
```

- [ ] **Step 3: Write the failing boundary test**

`packages/control-plane/src/module-boundaries.test.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = new URL('.', import.meta.url).pathname

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await sourceFiles(full)))
    else if (e.name.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Matches a relative import that climbs out of the current module: ../<module>/<something> */
const CROSS_MODULE = /from\s+'\.\.\/([a-z-]+)\/(.+)'/g

describe('module boundaries (§5)', () => {
  it('never imports another module by a deep path', async () => {
    const files = await sourceFiles(SRC)
    const violations: string[] = []

    for (const file of files) {
      const text = await readFile(file, 'utf8')
      for (const match of text.matchAll(CROSS_MODULE)) {
        const [, , rest] = match
        // '../spec/index.js' and '../spec/index' are the public interface. Anything else is internals.
        if (rest !== 'index.js' && rest !== 'index') {
          violations.push(`${relative(SRC, file)}: ${match[0]}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 4: Run it and confirm the harness works**

```bash
pnpm install
pnpm test
```

Expected: PASS with 1 test. An empty `violations` array is the correct starting state — the test's job is to *stay* green as modules are added.

- [ ] **Step 5: Prove the test actually catches a violation**

Temporarily add to `src/spec/index.ts`:

```ts
// @ts-expect-error deliberate violation, removed in the next step
import { nothing } from '../blueprints/registry.js'
```

Run `pnpm test`. Expected: **FAIL**, listing `spec/index.ts` in `violations`. Then delete those two lines and confirm it passes again.

A test that has never failed is not evidence of anything. This step is not optional.

- [ ] **Step 6: Add the ESLint boundary rule**

`eslint.config.js`:

```js
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/drizzle/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['packages/control-plane/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*/!(index)', '../*/*/**'],
              message:
                'Cross-module imports must go through the module’s public index.ts (§5).',
            },
          ],
        },
      ],
    },
  },
)
```

- [ ] **Step 7: Commit**

```bash
git add .nvmrc package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.js \
        vitest.workspace.ts packages/control-plane pnpm-lock.yaml
git commit -m "feat: pnpm workspace, strict TS, Vitest, and the §5 module boundary rule"
```

---

## Task 2: The `manifest.yaml` schema

**Files:**
- Create: `packages/control-plane/src/spec/schema.ts`
- Test: `packages/control-plane/src/spec/schema.test.ts`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces:
  - `manifestSchema: z.ZodType` — the §7 v1 schema
  - `type ManifestSpec = z.infer<typeof manifestSchema>` — the parsed shape every later module consumes
  - `type Classification = 'public' | 'internal' | 'confidential'`

**Scope note.** This task covers *shape* — types, regexes, defaults, strictness. The checks that need outside context (attribute whitelist, model catalogue, quota, blueprint) are Task 4, because they cannot be expressed in a schema alone.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/spec/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { manifestSchema } from './schema.js'

const minimal = {
  manifest: 1,
  name: 'chem-lab-scheduler',
  blueprint: 'node-ts-mongo@2',
  runtime: { port: 3000 },
}

describe('manifest.yaml schema (§7)', () => {
  it('accepts a minimal valid spec and applies defaults', () => {
    const result = manifestSchema.safeParse(minimal)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.runtime.health).toBe('/healthz')
    expect(result.data.auth.provider).toBe('none')
    expect(result.data.services).toEqual([])
    expect(result.data.data.classification).toBe('internal')
  })

  it('rejects a name that breaks the slug regex', () => {
    for (const name of ['Ab', 'a', '1abc', 'has_underscore', 'a'.repeat(40)]) {
      expect(manifestSchema.safeParse({ ...minimal, name }).success).toBe(false)
    }
  })

  it('rejects unknown top-level keys', () => {
    const r = manifestSchema.safeParse({ ...minimal, cunning: true })
    expect(r.success).toBe(false)
  })

  it('rejects a runtime.build block of any kind (D13)', () => {
    const r = manifestSchema.safeParse({
      ...minimal,
      runtime: { port: 3000, build: { dockerfile: './Dockerfile' } },
    })
    expect(r.success).toBe(false)
  })

  it('rejects auth.callback that is a URL rather than a path (D15)', () => {
    const withAuth = (callback: string) => ({
      ...minimal,
      auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid'], callback },
    })
    expect(manifestSchema.safeParse(withAuth('/auth/cb')).success).toBe(true)
    expect(
      manifestSchema.safeParse(withAuth('https://evil.example/cb')).success,
    ).toBe(false)
    expect(manifestSchema.safeParse(withAuth('auth/cb')).success).toBe(false)
    expect(manifestSchema.safeParse(withAuth('/a?b=c')).success).toBe(false)
  })

  it('rejects non-empty reserved blocks (§15)', () => {
    for (const key of ['integrations', 'jobs', 'checks']) {
      const r = manifestSchema.safeParse({ ...minimal, [key]: [{ any: 'thing' }] })
      expect(r.success, `${key} must be empty`).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/spec/schema.test.ts
```

Expected: FAIL — `Cannot find module './schema.js'`.

- [ ] **Step 3: Write the schema**

`packages/control-plane/src/spec/schema.ts`:

```ts
import { z } from 'zod'

export const SLUG = /^[a-z][a-z0-9-]{2,38}$/
export const AUTH_PATH = /^\/[A-Za-z0-9/_-]{1,64}$/
const BLUEPRINT_REF = /^[a-z][a-z0-9-]*@\d+$/
const QUANTITY = /^\d+(\.\d+)?(Mi|Gi)?$/

export const CLASSIFICATIONS = ['public', 'internal', 'confidential'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

/** public < internal < confidential (D17). */
export const CLASSIFICATION_RANK: Record<Classification, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
}

const serviceSchema = z
  .object({
    type: z.string().min(1),
    version: z.string().min(1),
    name: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
  })
  .strict()

const envEntrySchema = z
  .object({
    name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    value: z.string().optional(),
    secret: z.boolean().optional(),
  })
  .strict()
  .refine((e) => (e.secret === true) !== (e.value !== undefined), {
    message: 'an env entry carries either a value or secret: true, never both',
  })

const resourcesSchema = z
  .object({
    cpu: z.number().positive().optional(),
    memory: z.string().regex(QUANTITY).optional(),
    pids: z.number().int().positive().optional(),
    disk: z.string().regex(QUANTITY).optional(),
  })
  .strict()

// runtime is NOT .strict() — it is .strip()ped after an explicit `build` check, so
// that a build block produces its own error code (D13) rather than a generic
// "unrecognized key". Task 3 maps it.
const runtimeSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    health: z.string().regex(AUTH_PATH).default('/healthz'),
    command: z.string().nullable().default(null),
    build: z.never().optional(),
  })
  .strict()

const authSchema = z
  .object({
    provider: z.enum(['cwl', 'none']).default('none'),
    attributes: z.array(z.string().min(1)).default([]),
    callback: z.string().regex(AUTH_PATH).default('/auth/ubcshib/callback'),
    logout: z.string().regex(AUTH_PATH).default('/auth/logout'),
  })
  .strict()

const environmentOverrideSchema = z
  .object({ resources: resourcesSchema.optional(), env: z.array(envEntrySchema).optional() })
  .strict()

export const manifestSchema = z
  .object({
    manifest: z.literal(1),
    name: z.string().regex(SLUG),
    blueprint: z.string().regex(BLUEPRINT_REF),
    description: z.string().max(500).optional(),
    runtime: runtimeSchema,
    resources: resourcesSchema.default({}),
    services: z.array(serviceSchema).default([]),
    auth: authSchema.default({}),
    ai: z
      .object({
        models: z.array(z.string().min(1)).default([]),
        budget: z
          .object({
            project_monthly_usd: z.number().nonnegative().default(0),
            per_user_monthly_usd: z.number().nonnegative().default(0),
          })
          .strict()
          .default({}),
      })
      .strict()
      .default({}),
    env: z.array(envEntrySchema).default([]),
    egress: z.object({ allow: z.array(z.string().min(1)).default([]) }).strict().default({}),
    data: z
      .object({
        classification: z.enum(CLASSIFICATIONS).default('internal'),
        retention_days: z.number().int().positive().default(365),
      })
      .strict()
      .default({}),
    // §15 hooks — reserved, must be empty in v1
    integrations: z.array(z.never()).max(0).default([]),
    jobs: z.array(z.never()).max(0).default([]),
    checks: z.array(z.never()).max(0).default([]),
    environments: z
      .object({
        staging: environmentOverrideSchema.optional(),
        production: environmentOverrideSchema.optional(),
      })
      .strict()
      .default({}),
  })
  .strict()

export type ManifestSpec = z.infer<typeof manifestSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @manifest/control-plane test src/spec/schema.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/spec/
git commit -m "feat(spec): manifest.yaml v1 schema with §7 shape rules"
```

---

## Task 3: Machine-actionable spec errors

**Files:**
- Create: `packages/control-plane/src/errors/index.ts`
- Create: `packages/control-plane/src/spec/errors.ts`
- Test: `packages/control-plane/src/spec/errors.test.ts`

**Interfaces:**
- Consumes: `manifestSchema`, `ManifestSpec` from Task 2.
- Produces:
  - `interface ManifestError { code: string; path: string; message: string; hint: string }`
  - `toManifestErrors(issues: z.ZodIssue[]): ManifestError[]`
  - `SPEC_CODES` — the frozen code set later modules and clients match on

**Why this is its own task.** §20 requires *"a stable code and a remediation hint alongside the human-readable message — the same discipline that makes §14's faculty-legible events work, extended to clients that are programs."* An agent reading `invalid_string at runtime.build` cannot self-correct; one reading `SPEC_BUILD_BLOCK_FORBIDDEN` with a hint can. Getting this shape right before there are forty call sites is the whole point.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/spec/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { manifestSchema } from './schema.js'
import { toManifestErrors } from './errors.js'

const minimal = {
  manifest: 1,
  name: 'chem-lab-scheduler',
  blueprint: 'node-ts-mongo@2',
  runtime: { port: 3000 },
}

function errorsFor(input: unknown) {
  const r = manifestSchema.safeParse(input)
  if (r.success) throw new Error('expected the spec to be rejected')
  return toManifestErrors(r.error.issues)
}

describe('machine-actionable spec errors (§20)', () => {
  it('gives a build block its own code and a hint naming D13', () => {
    const [err] = errorsFor({ ...minimal, runtime: { port: 3000, build: {} } })
    expect(err?.code).toBe('SPEC_BUILD_BLOCK_FORBIDDEN')
    expect(err?.path).toBe('runtime.build')
    expect(err?.hint).toMatch(/blueprint/i)
  })

  it('gives an unknown top-level key its own code listing what is allowed', () => {
    const [err] = errorsFor({ ...minimal, cunning: true })
    expect(err?.code).toBe('SPEC_UNKNOWN_KEY')
    expect(err?.hint).toMatch(/services/)
  })

  it('gives a non-path callback a code that says PATH, not URL', () => {
    const [err] = errorsFor({
      ...minimal,
      auth: { provider: 'cwl', callback: 'https://evil.example/cb' },
    })
    expect(err?.code).toBe('SPEC_PATH_EXPECTED')
    expect(err?.hint).toMatch(/path/i)
  })

  it('gives a bad slug a code and quotes the rule', () => {
    const [err] = errorsFor({ ...minimal, name: 'Not_A_Slug' })
    expect(err?.code).toBe('SPEC_INVALID_SLUG')
    expect(err?.hint).toContain('a-z')
  })

  it('gives a non-empty reserved block a code naming the hook', () => {
    const [err] = errorsFor({ ...minimal, integrations: [{ lti: true }] })
    expect(err?.code).toBe('SPEC_RESERVED_BLOCK_NOT_EMPTY')
    expect(err?.path).toBe('integrations')
  })

  it('every error carries all four fields, always', () => {
    for (const e of errorsFor({ ...minimal, name: 'X', cunning: 1 })) {
      expect(e.code).toBeTruthy()
      expect(e.message).toBeTruthy()
      expect(e.hint).toBeTruthy()
      expect(typeof e.path).toBe('string')
    }
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/spec/errors.test.ts
```

Expected: FAIL — `Cannot find module './errors.js'`.

- [ ] **Step 3: Write the error types and mapping**

`packages/control-plane/src/errors/index.ts`:

```ts
/**
 * Every error Manifest surfaces to a client — human or program — carries a stable
 * code and a remediation hint (§20, D23.7). Codes are permanent API surface: rename
 * one and you break an agent that was correcting itself against it.
 */
export interface ManifestError {
  code: string
  path: string
  message: string
  hint: string
}

export class ManifestValidationError extends Error {
  constructor(readonly errors: ManifestError[]) {
    super(errors.map((e) => `${e.path}: ${e.message}`).join('; '))
    this.name = 'ManifestValidationError'
  }
}
```

`packages/control-plane/src/spec/errors.ts`:

```ts
import type { z } from 'zod'
import type { ManifestError } from '../errors/index.js'

export const SPEC_CODES = {
  BUILD_BLOCK_FORBIDDEN: 'SPEC_BUILD_BLOCK_FORBIDDEN',
  UNKNOWN_KEY: 'SPEC_UNKNOWN_KEY',
  PATH_EXPECTED: 'SPEC_PATH_EXPECTED',
  INVALID_SLUG: 'SPEC_INVALID_SLUG',
  RESERVED_BLOCK_NOT_EMPTY: 'SPEC_RESERVED_BLOCK_NOT_EMPTY',
  INVALID_BLUEPRINT_REF: 'SPEC_INVALID_BLUEPRINT_REF',
  INVALID_VALUE: 'SPEC_INVALID_VALUE',
} as const

const TOP_LEVEL_KEYS =
  'manifest, name, blueprint, description, runtime, resources, services, auth, ai, env, egress, data, integrations, jobs, checks, environments'

const RESERVED = new Set(['integrations', 'jobs', 'checks'])

const pathOf = (issue: z.ZodIssue) => issue.path.join('.')

export function toManifestErrors(issues: z.ZodIssue[]): ManifestError[] {
  return issues.map((issue): ManifestError => {
    const path = pathOf(issue)

    if (path === 'runtime.build' || (issue.code === 'unrecognized_keys' && issue.keys.includes('build') && path === 'runtime')) {
      return {
        code: SPEC_CODES.BUILD_BLOCK_FORBIDDEN,
        path: 'runtime.build',
        message: 'an app may not supply its own build definition',
        hint: 'Remove the build block. The Dockerfile comes from the blueprint (D13) — declare what you need, never how to build it.',
      }
    }

    if (RESERVED.has(path)) {
      return {
        code: SPEC_CODES.RESERVED_BLOCK_NOT_EMPTY,
        path,
        message: `${path} is reserved and must be empty in schema version 1`,
        hint: `${path} is a forward-compatibility hook (§15). Leave it as an empty list.`,
      }
    }

    if (issue.code === 'unrecognized_keys') {
      return {
        code: SPEC_CODES.UNKNOWN_KEY,
        path: [path, issue.keys[0]].filter(Boolean).join('.'),
        message: `unknown key: ${issue.keys.join(', ')}`,
        hint: `Allowed top-level keys are: ${TOP_LEVEL_KEYS}.`,
      }
    }

    if (path === 'name') {
      return {
        code: SPEC_CODES.INVALID_SLUG,
        path,
        message: 'name must be a valid project slug',
        hint: 'Lower-case letters, digits and hyphens, starting with a letter, 3–39 characters: ^[a-z][a-z0-9-]{2,38}$',
      }
    }

    if (path === 'blueprint') {
      return {
        code: SPEC_CODES.INVALID_BLUEPRINT_REF,
        path,
        message: 'blueprint must be a name pinned to a major version',
        hint: 'Write it as name@major, for example node-ts-mongo@2.',
      }
    }

    if (path.endsWith('callback') || path.endsWith('logout') || path === 'runtime.health') {
      return {
        code: SPEC_CODES.PATH_EXPECTED,
        path,
        message: 'this field is a path, not a URL',
        hint: 'Supply a path beginning with / such as /auth/ubcshib/callback. Manifest derives the origin itself (D15); an app never supplies one.',
      }
    }

    return {
      code: SPEC_CODES.INVALID_VALUE,
      path,
      message: issue.message,
      hint: `Check the type and permitted values of ${path || 'this field'} in §7 of the platform design.`,
    }
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @manifest/control-plane test src/spec/errors.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/errors/ packages/control-plane/src/spec/errors.ts \
        packages/control-plane/src/spec/errors.test.ts
git commit -m "feat(spec): machine-actionable error codes with remediation hints"
```

---

## Task 4: Policy validation — whitelist, catalogues, quota, and the D17 gate

**Files:**
- Create: `packages/control-plane/src/spec/policy.ts`
- Create: `packages/control-plane/src/spec/index.ts` (replaces Task 1's placeholder)
- Test: `packages/control-plane/src/spec/policy.test.ts`

**Interfaces:**
- Consumes: `manifestSchema`, `ManifestSpec`, `CLASSIFICATION_RANK` (Task 2); `toManifestErrors`, `SPEC_CODES` (Task 3).
- Produces — **this is `spec/`'s public interface; every later task uses it:**

```ts
interface ValidationContext {
  projectSlug: string
  attributeWhitelist: readonly string[]
  serviceCatalogue: readonly string[]
  modelCatalogue: readonly { name: string; maxClassification: Classification }[]
  quota: { maxCpu: number; maxMemoryMi: number; maxServices: number; aiMonthlyUsd: number }
  registeredAttributes?: readonly string[]   // production releases only (§9)
}

type ValidationResult =
  | { valid: true; spec: ManifestSpec }
  | { valid: false; errors: ManifestError[] }

function validateSpec(yamlText: string, ctx: ValidationContext): ValidationResult
```

**Why these cannot live in the schema.** Each needs information the file does not contain — what the platform offers, what this project is allowed, what UBC IAM actually registered. §7 lists them as a separate stage for exactly that reason.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/spec/policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateSpec, type ValidationContext } from './index.js'

const ctx: ValidationContext = {
  projectSlug: 'chem-lab-scheduler',
  attributeWhitelist: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn', 'eduPersonAffiliation'],
  serviceCatalogue: ['mongo', 'qdrant'],
  modelCatalogue: [
    { name: 'default-chat-onprem', maxClassification: 'confidential' },
    { name: 'default-chat', maxClassification: 'internal' },
    { name: 'default-embed', maxClassification: 'internal' },
  ],
  quota: { maxCpu: 2, maxMemoryMi: 2048, maxServices: 3, aiMonthlyUsd: 100 },
}

const yaml = (extra = '') => `
manifest: 1
name: chem-lab-scheduler
blueprint: node-ts-mongo@2
runtime:
  port: 3000
${extra}`

function errorCodes(text: string, c: ValidationContext = ctx) {
  const r = validateSpec(text, c)
  return r.valid ? [] : r.errors.map((e) => e.code)
}

describe('policy validation (§7)', () => {
  it('accepts a valid spec', () => {
    const r = validateSpec(yaml(), ctx)
    expect(r.valid).toBe(true)
  })

  it('rejects a name that differs from the project slug', () => {
    expect(errorCodes(yaml(), { ...ctx, projectSlug: 'something-else' })).toContain(
      'SPEC_NAME_SLUG_MISMATCH',
    )
  })

  it('rejects a service type outside the catalogue', () => {
    const text = yaml(`services:\n  - { type: postgres, version: "16", name: db }`)
    expect(errorCodes(text)).toContain('SPEC_SERVICE_TYPE_UNKNOWN')
  })

  it('rejects an attribute outside the whitelist, including uid', () => {
    const text = yaml(`auth:\n  provider: cwl\n  attributes: [uid]`)
    expect(errorCodes(text)).toContain('SPEC_ATTRIBUTE_NOT_WHITELISTED')
  })

  it('rejects a model outside the catalogue', () => {
    const text = yaml(`ai:\n  models: [gpt-9-turbo]`)
    expect(errorCodes(text)).toContain('SPEC_MODEL_UNKNOWN')
  })

  it('rejects an off-premise model for confidential data (D17)', () => {
    const text = yaml(
      `ai:\n  models: [default-chat]\ndata:\n  classification: confidential`,
    )
    expect(errorCodes(text)).toContain('SPEC_MODEL_CLASSIFICATION_TOO_LOW')
  })

  it('accepts an on-premise model for confidential data (D17)', () => {
    const text = yaml(
      `ai:\n  models: [default-chat-onprem]\ndata:\n  classification: confidential`,
    )
    expect(errorCodes(text)).toEqual([])
  })

  it('rejects resources above the project quota', () => {
    const text = yaml(`resources:\n  cpu: 8\n  memory: 8Gi`)
    const codes = errorCodes(text)
    expect(codes).toContain('SPEC_QUOTA_EXCEEDED')
  })

  it('rejects more services than the quota allows', () => {
    const text = yaml(
      `services:\n` +
        `  - { type: mongo, version: "7", name: a }\n` +
        `  - { type: mongo, version: "7", name: b }\n` +
        `  - { type: mongo, version: "7", name: c }\n` +
        `  - { type: mongo, version: "7", name: d }`,
    )
    expect(errorCodes(text)).toContain('SPEC_QUOTA_EXCEEDED')
  })

  it('rejects attributes not registered with UBC IAM, for a production release (§9)', () => {
    const text = yaml(`auth:\n  provider: cwl\n  attributes: [ubcEduCwlPuid, sn]`)
    const codes = errorCodes(text, { ...ctx, registeredAttributes: ['ubcEduCwlPuid'] })
    expect(codes).toContain('SPEC_ATTRIBUTE_NOT_REGISTERED')
  })

  it('reports malformed YAML as an error rather than throwing', () => {
    const r = validateSpec('name: [unclosed', ctx)
    expect(r.valid).toBe(false)
    if (r.valid) return
    expect(r.errors[0]?.code).toBe('SPEC_YAML_PARSE_FAILED')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/spec/policy.test.ts
```

Expected: FAIL — `validateSpec` is not exported from `./index.js`.

- [ ] **Step 3: Write the policy checks**

`packages/control-plane/src/spec/policy.ts`:

```ts
import type { ManifestError } from '../errors/index.js'
import { CLASSIFICATION_RANK, type Classification, type ManifestSpec } from './schema.js'

export interface ValidationContext {
  projectSlug: string
  attributeWhitelist: readonly string[]
  serviceCatalogue: readonly string[]
  modelCatalogue: readonly { name: string; maxClassification: Classification }[]
  quota: { maxCpu: number; maxMemoryMi: number; maxServices: number; aiMonthlyUsd: number }
  /** Present only when validating a release bound for production (§9). */
  registeredAttributes?: readonly string[]
}

export const POLICY_CODES = {
  NAME_SLUG_MISMATCH: 'SPEC_NAME_SLUG_MISMATCH',
  SERVICE_TYPE_UNKNOWN: 'SPEC_SERVICE_TYPE_UNKNOWN',
  ATTRIBUTE_NOT_WHITELISTED: 'SPEC_ATTRIBUTE_NOT_WHITELISTED',
  ATTRIBUTE_NOT_REGISTERED: 'SPEC_ATTRIBUTE_NOT_REGISTERED',
  MODEL_UNKNOWN: 'SPEC_MODEL_UNKNOWN',
  MODEL_CLASSIFICATION_TOO_LOW: 'SPEC_MODEL_CLASSIFICATION_TOO_LOW',
  QUOTA_EXCEEDED: 'SPEC_QUOTA_EXCEEDED',
} as const

/** Converts "512Mi" / "2Gi" / "512" to mebibytes. */
export function toMebibytes(quantity: string): number {
  const m = /^(\d+(?:\.\d+)?)(Mi|Gi)?$/.exec(quantity)
  if (!m) return Number.NaN
  const value = Number(m[1])
  return m[2] === 'Gi' ? value * 1024 : value
}

export function checkPolicy(spec: ManifestSpec, ctx: ValidationContext): ManifestError[] {
  const errors: ManifestError[] = []

  if (spec.name !== ctx.projectSlug) {
    errors.push({
      code: POLICY_CODES.NAME_SLUG_MISMATCH,
      path: 'name',
      message: `name "${spec.name}" does not match the project slug "${ctx.projectSlug}"`,
      hint: 'The name in manifest.yaml must equal the project slug. Rename the project, or correct the file.',
    })
  }

  spec.services.forEach((service, i) => {
    if (!ctx.serviceCatalogue.includes(service.type)) {
      errors.push({
        code: POLICY_CODES.SERVICE_TYPE_UNKNOWN,
        path: `services.${i}.type`,
        message: `unknown service type "${service.type}"`,
        hint: `Available service types are: ${ctx.serviceCatalogue.join(', ')}.`,
      })
    }
  })

  spec.auth.attributes.forEach((attr, i) => {
    if (!ctx.attributeWhitelist.includes(attr)) {
      errors.push({
        code: POLICY_CODES.ATTRIBUTE_NOT_WHITELISTED,
        path: `auth.attributes.${i}`,
        message: `"${attr}" is not a releasable UBC attribute`,
        hint:
          `Permitted attributes: ${ctx.attributeWhitelist.join(', ')}. ` +
          'Note that "uid" is not a UBC attribute — the identifier is ubcEduCwlPuid.',
      })
    }
    if (ctx.registeredAttributes && !ctx.registeredAttributes.includes(attr)) {
      errors.push({
        code: POLICY_CODES.ATTRIBUTE_NOT_REGISTERED,
        path: `auth.attributes.${i}`,
        message: `"${attr}" is not registered with UBC IAM for this app`,
        hint:
          'A production release may only request attributes UBC IAM has registered. ' +
          'Raise an IAM change request, or remove the attribute. Failing here at build time ' +
          'is deliberate — the alternative is a broken login on launch day.',
      })
    }
  })

  const appRank = CLASSIFICATION_RANK[spec.data.classification]
  spec.ai.models.forEach((model, i) => {
    const entry = ctx.modelCatalogue.find((m) => m.name === model)
    if (!entry) {
      errors.push({
        code: POLICY_CODES.MODEL_UNKNOWN,
        path: `ai.models.${i}`,
        message: `unknown logical model "${model}"`,
        hint: `Available models: ${ctx.modelCatalogue.map((m) => m.name).join(', ')}. Use logical names, never vendor model IDs.`,
      })
      return
    }
    if (CLASSIFICATION_RANK[entry.maxClassification] < appRank) {
      errors.push({
        code: POLICY_CODES.MODEL_CLASSIFICATION_TOO_LOW,
        path: `ai.models.${i}`,
        message: `"${model}" may not process ${spec.data.classification} data`,
        hint:
          `"${model}" is approved up to ${entry.maxClassification} data and this app declares ` +
          `${spec.data.classification}. Choose an on-premise model, or lower data.classification ` +
          'if it is overstated. A BC public body may not send personal information to a model running outside Canada.',
      })
    }
  })

  const cpu = spec.resources.cpu
  if (cpu !== undefined && cpu > ctx.quota.maxCpu) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'resources.cpu',
      message: `requested ${cpu} CPU, quota is ${ctx.quota.maxCpu}`,
      hint: 'Lower the request, or ask an administrator to raise the project quota.',
    })
  }

  const memory = spec.resources.memory
  if (memory !== undefined && toMebibytes(memory) > ctx.quota.maxMemoryMi) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'resources.memory',
      message: `requested ${memory}, quota is ${ctx.quota.maxMemoryMi}Mi`,
      hint: 'Lower the request, or ask an administrator to raise the project quota.',
    })
  }

  if (spec.services.length > ctx.quota.maxServices) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'services',
      message: `declared ${spec.services.length} services, quota is ${ctx.quota.maxServices}`,
      hint: 'Remove a service, or ask an administrator to raise the project quota.',
    })
  }

  if (spec.ai.budget.project_monthly_usd > ctx.quota.aiMonthlyUsd) {
    errors.push({
      code: POLICY_CODES.QUOTA_EXCEEDED,
      path: 'ai.budget.project_monthly_usd',
      message: `requested $${spec.ai.budget.project_monthly_usd}/month, quota is $${ctx.quota.aiMonthlyUsd}`,
      hint: 'Lower the budget, or ask an administrator to raise the project quota.',
    })
  }

  return errors
}
```

- [ ] **Step 4: Write the module's public interface**

`packages/control-plane/src/spec/index.ts` — replaces Task 1's placeholder:

```ts
import { parse as parseYaml } from 'yaml'
import type { ManifestError } from '../errors/index.js'
import { manifestSchema, type ManifestSpec } from './schema.js'
import { toManifestErrors } from './errors.js'
import { checkPolicy, type ValidationContext } from './policy.js'

export type { ManifestSpec, Classification } from './schema.js'
export type { ValidationContext } from './policy.js'
export { CLASSIFICATION_RANK, SLUG, AUTH_PATH } from './schema.js'
export { toMebibytes } from './policy.js'

export type ValidationResult =
  | { valid: true; spec: ManifestSpec }
  | { valid: false; errors: ManifestError[] }

export function validateSpec(yamlText: string, ctx: ValidationContext): ValidationResult {
  let raw: unknown
  try {
    raw = parseYaml(yamlText)
  } catch (cause) {
    return {
      valid: false,
      errors: [
        {
          code: 'SPEC_YAML_PARSE_FAILED',
          path: '',
          message: cause instanceof Error ? cause.message : 'manifest.yaml is not valid YAML',
          hint: 'Check indentation and quoting. Every value must be valid YAML before Manifest can read it.',
        },
      ],
    }
  }

  const parsed = manifestSchema.safeParse(raw)
  if (!parsed.success) return { valid: false, errors: toManifestErrors(parsed.error.issues) }

  const policyErrors = checkPolicy(parsed.data, ctx)
  if (policyErrors.length > 0) return { valid: false, errors: policyErrors }

  return { valid: true, spec: parsed.data }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/spec/
```

Expected: PASS — all three spec test files, 23 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/spec/
git commit -m "feat(spec): policy validation — catalogues, whitelist, quota, D17 classification gate"
```

---

## Task 5: `isSensitiveDiff` — the seven fields that re-escalate

**Files:**
- Create: `packages/control-plane/src/spec/diff.ts`
- Modify: `packages/control-plane/src/spec/index.ts` (export the new function)
- Test: `packages/control-plane/src/spec/diff.test.ts`

**Interfaces:**
- Consumes: `ManifestSpec`, `toMebibytes` (Task 4).
- Produces: `isSensitiveDiff(before: ManifestSpec, after: ManifestSpec): { sensitive: boolean; fields: string[] }`

**Why it lives in `spec/`.** §7 is explicit: *"The schema and the approval policy are therefore the same object."* P6 builds the approval gate on top of this function; getting it wrong means either a gate that blocks everything or one that lets an attribute change through unreviewed.

**The `resources` rule is asymmetric.** Only an *increase* is sensitive — §7 says `resources` (increase only). A faculty member reducing memory should not wait for an approval.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/spec/diff.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { manifestSchema, type ManifestSpec } from './schema.js'
import { isSensitiveDiff } from './diff.js'

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
    expect(isSensitiveDiff(base(), after)).toEqual({ sensitive: true, fields: ['services'] })
  })

  it('flags a new CWL attribute (D16)', () => {
    const before = base({ auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid'] } })
    const after = base({ auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] } })
    expect(isSensitiveDiff(before, after).fields).toEqual(['auth.attributes'])
  })

  it('flags a removed attribute too — the registration must still match', () => {
    const before = base({ auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] } })
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

  it('reports every changed field, not just the first', () => {
    const after = base({
      services: [{ type: 'mongo', version: '7', name: 'db' }],
      egress: { allow: ['api.ubc.ca'] },
      data: { classification: 'confidential' },
    })
    const result = isSensitiveDiff(base(), after)
    expect(result.sensitive).toBe(true)
    expect(result.fields.sort()).toEqual(['data.classification', 'egress.allow', 'services'])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/spec/diff.test.ts
```

Expected: FAIL — `Cannot find module './diff.js'`.

- [ ] **Step 3: Write the implementation**

`packages/control-plane/src/spec/diff.ts`:

```ts
import type { ManifestSpec } from './schema.js'
import { toMebibytes } from './policy.js'

/**
 * The seven fields of §7, and only these, re-escalate a release to approval (D9).
 * Adding an eighth is a design change, not a code change — see §7 before touching this.
 */
export const SENSITIVE_FIELDS = [
  'services',
  'auth.attributes',
  'egress.allow',
  'resources',
  'data.classification',
  'ai.models',
  'blueprint',
] as const

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number]

const stable = (value: unknown): string => JSON.stringify(value)

/** Order-insensitive comparison — reordering a list is not a change of intent. */
const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  stable([...a].sort()) === stable([...b].sort())

const majorOf = (blueprintRef: string): string => blueprintRef.split('@')[1] ?? ''

/**
 * `resources` is sensitive on INCREASE only (§7). A faculty member trimming memory
 * should not wait on an approval; one quietly tripling it should.
 */
function resourcesIncreased(before: ManifestSpec, after: ManifestSpec): boolean {
  const beforeCpu = before.resources.cpu ?? 0
  const afterCpu = after.resources.cpu ?? 0
  if (afterCpu > beforeCpu) return true

  const beforeMem = before.resources.memory ? toMebibytes(before.resources.memory) : 0
  const afterMem = after.resources.memory ? toMebibytes(after.resources.memory) : 0
  if (afterMem > beforeMem) return true

  const beforeDisk = before.resources.disk ? toMebibytes(before.resources.disk) : 0
  const afterDisk = after.resources.disk ? toMebibytes(after.resources.disk) : 0
  if (afterDisk > beforeDisk) return true

  return (after.resources.pids ?? 0) > (before.resources.pids ?? 0)
}

export function isSensitiveDiff(
  before: ManifestSpec,
  after: ManifestSpec,
): { sensitive: boolean; fields: string[] } {
  const fields: string[] = []

  if (stable(before.services) !== stable(after.services)) fields.push('services')

  // Both directions matter: in production auth.attributes must remain a subset of
  // what UBC IAM registered, so a removal is still a change worth seeing (D16, §9).
  if (!sameSet(before.auth.attributes, after.auth.attributes)) fields.push('auth.attributes')

  if (!sameSet(before.egress.allow, after.egress.allow)) fields.push('egress.allow')

  if (resourcesIncreased(before, after)) fields.push('resources')

  if (before.data.classification !== after.data.classification) fields.push('data.classification')

  // A model change can move personal information to a different jurisdiction, which
  // invalidates an approved PIA — data.classification catches a change to the claim,
  // not to where the data actually goes (§7).
  if (!sameSet(before.ai.models, after.ai.models)) fields.push('ai.models')

  // Under D13 the blueprint IS the build definition, so a major bump changes the
  // Dockerfile, base image and knowledge pack beneath the app.
  if (majorOf(before.blueprint) !== majorOf(after.blueprint)) fields.push('blueprint')

  return { sensitive: fields.length > 0, fields }
}
```

- [ ] **Step 4: Export it from the module interface**

Add to `packages/control-plane/src/spec/index.ts`:

```ts
export { isSensitiveDiff, SENSITIVE_FIELDS } from './diff.js'
export type { SensitiveField } from './diff.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/spec/
```

Expected: PASS, 34 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/spec/
git commit -m "feat(spec): isSensitiveDiff over the seven fields that re-escalate (D9)"
```

---

## Task 6: The blueprint descriptor and compatibility check

**Files:**
- Create: `packages/control-plane/src/blueprints/descriptor.ts`
- Create: `packages/control-plane/src/blueprints/compatibility.ts`
- Create: `packages/control-plane/src/blueprints/registry.ts`
- Create: `packages/control-plane/src/blueprints/index.ts`
- Test: `packages/control-plane/src/blueprints/blueprints.test.ts`

**Interfaces:**
- Consumes: `ManifestSpec`, `ManifestError` types.
- Produces:

```ts
type BlueprintDescriptor = { blueprint: string; major_version: number; schema_versions: number[]
  runtime: { language: string; base_image: string; default_port: number; health_path: string; run_as_uid: number }
  provides: { services: string[]; auth_providers: ('cwl'|'none')[]; ai: boolean }
  defaults: { resources: { cpu: number; memory: string; pids: number; disk: string } }
  injection: { contract: string }
  dockerfile: string
  knowledge_pack: string
  pinned_dependencies?: Record<string, string> }

function loadBlueprints(root: string): Promise<BlueprintRegistry>
interface BlueprintRegistry {
  list(): BlueprintDescriptor[]
  resolve(ref: string): BlueprintDescriptor | undefined   // "name@major"
}
function checkBlueprintCompatibility(spec: ManifestSpec, d: BlueprintDescriptor): ManifestError[]
```

**This is roadmap gap 2 being discharged.** §17 as written put the descriptor in 1b while putting the build that needs it in 1a. D30's own argument — *"a descriptor added after the fact is a refactor of the builder, the health check, the service catalogue and the injection contract at once"* — puts it here, because all four of those live in P2 and P3.

**The rule this task establishes:** after it, **no module outside `blueprints/` names a language.** §25 is explicit about that, and it is the difference between a second blueprint being a folder and being a rewrite.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/blueprints/blueprints.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { manifestSchema, type ManifestSpec } from '../spec/index.js'
import { descriptorSchema, checkBlueprintCompatibility, loadBlueprints } from './index.js'

const descriptor = descriptorSchema.parse({
  blueprint: 'fixture-node',
  major_version: 1,
  schema_versions: [1],
  runtime: {
    language: 'typescript',
    base_image: 'node@sha256:0000000000000000000000000000000000000000000000000000000000000000',
    default_port: 3000,
    health_path: '/healthz',
    run_as_uid: 10001,
  },
  provides: { services: ['mongo'], auth_providers: ['none'], ai: false },
  defaults: { resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' } },
  injection: { contract: 'v1' },
  dockerfile: './Dockerfile.tmpl',
  knowledge_pack: './agents/',
})

const spec = (extra: Record<string, unknown> = {}): ManifestSpec =>
  manifestSchema.parse({
    manifest: 1,
    name: 'fixture-app',
    blueprint: 'fixture-node@1',
    runtime: { port: 3000 },
    ...extra,
  })

describe('blueprint descriptor (§25, D30)', () => {
  it('rejects a base image pinned by tag rather than digest (§12)', () => {
    const bad = { ...descriptor, runtime: { ...descriptor.runtime, base_image: 'node:22' } }
    expect(descriptorSchema.safeParse(bad).success).toBe(false)
  })
})

describe('checkBlueprintCompatibility (§25)', () => {
  it('accepts a compatible spec', () => {
    expect(checkBlueprintCompatibility(spec(), descriptor)).toEqual([])
  })

  it('rejects a service the blueprint cannot bind, listing what it can', () => {
    const errors = checkBlueprintCompatibility(
      spec({ services: [{ type: 'qdrant', version: '1.9', name: 'v' }] }),
      descriptor,
    )
    expect(errors[0]?.code).toBe('BLUEPRINT_SERVICE_UNSUPPORTED')
    expect(errors[0]?.message).toContain('qdrant')
    expect(errors[0]?.hint).toContain('mongo')
  })

  it('rejects an auth provider the blueprint does not support', () => {
    const errors = checkBlueprintCompatibility(
      spec({ auth: { provider: 'cwl', attributes: [] } }),
      descriptor,
    )
    expect(errors[0]?.code).toBe('BLUEPRINT_AUTH_UNSUPPORTED')
  })

  it('rejects AI use when the blueprint does not provide it', () => {
    const errors = checkBlueprintCompatibility(spec({ ai: { models: ['default-chat'] } }), descriptor)
    expect(errors[0]?.code).toBe('BLUEPRINT_AI_UNSUPPORTED')
  })

  it('rejects a manifest schema version the blueprint does not understand', () => {
    const older = { ...descriptor, schema_versions: [2] }
    const errors = checkBlueprintCompatibility(spec(), older)
    expect(errors[0]?.code).toBe('BLUEPRINT_SCHEMA_VERSION_UNSUPPORTED')
  })
})

describe('blueprint registry', () => {
  it('loads the on-disk catalogue and resolves by name@major', async () => {
    const registry = await loadBlueprints(new URL('../../../../blueprints/', import.meta.url).pathname)
    expect(registry.list().length).toBeGreaterThan(0)
    expect(registry.resolve('fixture-node@1')?.blueprint).toBe('fixture-node')
    expect(registry.resolve('fixture-node@9')).toBeUndefined()
    expect(registry.resolve('does-not-exist@1')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/blueprints/
```

Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write the descriptor schema**

`packages/control-plane/src/blueprints/descriptor.ts`:

```ts
import { z } from 'zod'

/** Base images are pinned by digest, never by tag (§12 supply chain). */
const DIGEST_PINNED = /@sha256:[0-9a-f]{64}$/

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
            memory: z.string(),
            pids: z.number().int().positive(),
            disk: z.string(),
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
  })
  .strict()

export type BlueprintDescriptor = z.infer<typeof descriptorSchema>
```

- [ ] **Step 4: Write the compatibility check**

`packages/control-plane/src/blueprints/compatibility.ts`:

```ts
import type { ManifestError } from '../errors/index.js'
import type { ManifestSpec } from '../spec/index.js'
import type { BlueprintDescriptor } from './descriptor.js'

export const BLUEPRINT_CODES = {
  SERVICE_UNSUPPORTED: 'BLUEPRINT_SERVICE_UNSUPPORTED',
  AUTH_UNSUPPORTED: 'BLUEPRINT_AUTH_UNSUPPORTED',
  AI_UNSUPPORTED: 'BLUEPRINT_AI_UNSUPPORTED',
  SCHEMA_VERSION_UNSUPPORTED: 'BLUEPRINT_SCHEMA_VERSION_UNSUPPORTED',
} as const

/**
 * Stage two of validation (§25). Schema validation says the file is well-formed;
 * this says the pinned blueprint can actually deliver what it asks for.
 */
export function checkBlueprintCompatibility(
  spec: ManifestSpec,
  descriptor: BlueprintDescriptor,
): ManifestError[] {
  const errors: ManifestError[] = []
  const ref = `${descriptor.blueprint}@${descriptor.major_version}`

  if (!descriptor.schema_versions.includes(spec.manifest)) {
    errors.push({
      code: BLUEPRINT_CODES.SCHEMA_VERSION_UNSUPPORTED,
      path: 'manifest',
      message: `blueprint ${ref} does not understand manifest schema version ${spec.manifest}`,
      hint: `${ref} understands: ${descriptor.schema_versions.join(', ')}. Pin a blueprint major that supports your schema version.`,
    })
  }

  spec.services.forEach((service, i) => {
    if (!descriptor.provides.services.includes(service.type)) {
      errors.push({
        code: BLUEPRINT_CODES.SERVICE_UNSUPPORTED,
        path: `services.${i}.type`,
        message: `blueprint ${ref} cannot bind service type "${service.type}"`,
        hint: `${ref} supports: ${descriptor.provides.services.join(', ')}.`,
      })
    }
  })

  if (!descriptor.provides.auth_providers.includes(spec.auth.provider)) {
    errors.push({
      code: BLUEPRINT_CODES.AUTH_UNSUPPORTED,
      path: 'auth.provider',
      message: `blueprint ${ref} does not support auth.provider "${spec.auth.provider}"`,
      hint: `${ref} supports: ${descriptor.provides.auth_providers.join(', ')}.`,
    })
  }

  if (spec.ai.models.length > 0 && !descriptor.provides.ai) {
    errors.push({
      code: BLUEPRINT_CODES.AI_UNSUPPORTED,
      path: 'ai.models',
      message: `blueprint ${ref} does not provide AI model access`,
      hint: `Remove ai.models, or pin a blueprint that provides AI.`,
    })
  }

  return errors
}
```

- [ ] **Step 5: Write the registry and the module interface**

`packages/control-plane/src/blueprints/registry.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { descriptorSchema, type BlueprintDescriptor } from './descriptor.js'

export interface BlueprintRegistry {
  list(): BlueprintDescriptor[]
  /** Resolves a "name@major" reference, exactly as manifest.yaml pins it. */
  resolve(ref: string): BlueprintDescriptor | undefined
  /** Absolute path to a blueprint's directory — the builder needs it for the Dockerfile. */
  pathOf(ref: string): string | undefined
}

export async function loadBlueprints(root: string): Promise<BlueprintRegistry> {
  const entries = await readdir(root, { withFileTypes: true })
  const byRef = new Map<string, { descriptor: BlueprintDescriptor; dir: string }>()

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const text = await readFile(join(dir, 'blueprint.yaml'), 'utf8')
    const descriptor = descriptorSchema.parse(parseYaml(text))
    byRef.set(`${descriptor.blueprint}@${descriptor.major_version}`, { descriptor, dir })
  }

  return {
    list: () => [...byRef.values()].map((v) => v.descriptor),
    resolve: (ref) => byRef.get(ref)?.descriptor,
    pathOf: (ref) => byRef.get(ref)?.dir,
  }
}
```

`packages/control-plane/src/blueprints/index.ts`:

```ts
export { descriptorSchema } from './descriptor.js'
export type { BlueprintDescriptor } from './descriptor.js'
export { checkBlueprintCompatibility, BLUEPRINT_CODES } from './compatibility.js'
export { loadBlueprints } from './registry.js'
export type { BlueprintRegistry } from './registry.js'
```

- [ ] **Step 6: Run the tests**

The registry test needs Task 7's blueprint on disk, so expect it to fail until then.

```bash
pnpm --filter @manifest/control-plane test src/blueprints/
```

Expected: the descriptor and compatibility tests PASS (6 tests); the registry test FAILS with `ENOENT` on `blueprints/`. That is the correct intermediate state — Task 7 closes it.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/blueprints/
git commit -m "feat(blueprints): §25 descriptor, registry and compatibility check (D30)"
```

---

## Task 7: The `fixture-node` blueprint

**Files:**
- Create: `blueprints/fixture-node/blueprint.yaml`
- Create: `blueprints/fixture-node/Dockerfile.tmpl`
- Create: `blueprints/fixture-node/skeleton/package.json`
- Create: `blueprints/fixture-node/skeleton/server.js`
- Create: `blueprints/fixture-node/agents/AGENTS.md`

**Interfaces:**
- Consumes: `descriptorSchema` (Task 6).
- Produces: an on-disk blueprint that `loadBlueprints()` resolves as `fixture-node@1`, and that P3's builder turns into an image.

**Scope, stated so nobody over-builds it.** This is P2/P3's build target, **not** §16's proof app. It has no auth, no AI and no attribute bridge — P4 ships `node-ts-mongo@1` with all of that. `fixture-node` exists so the builder, health check, service catalogue and injection contract have something real to work against while the interesting blueprint is still months away.

- [ ] **Step 1: Write the descriptor**

`blueprints/fixture-node/blueprint.yaml`:

```yaml
blueprint: fixture-node
major_version: 1
schema_versions: [1]

runtime:
  language: typescript
  # Digest-pinned per §12. Replace with a real digest during P1's `make seed`, which
  # is the step that pulls it; `make doctor` reports the pinned value.
  base_image: node@sha256:0000000000000000000000000000000000000000000000000000000000000000
  default_port: 3000
  health_path: /healthz
  run_as_uid: 10001

provides:
  services: [mongo]
  auth_providers: [none]
  ai: false

defaults:
  resources:
    cpu: 0.5
    memory: 512Mi
    pids: 256
    disk: 2Gi

injection:
  contract: v1

dockerfile: ./Dockerfile.tmpl
knowledge_pack: ./agents/
```

- [ ] **Step 2: Write the Dockerfile template**

`blueprints/fixture-node/Dockerfile.tmpl`. Under D13 this is blueprint-managed and an app may never supply its own. `{{BASE_IMAGE}}` and `{{RUN_AS_UID}}` are substituted from the descriptor by P3's builder.

```dockerfile
# syntax=docker/dockerfile:1
FROM {{BASE_IMAGE}}

# Non-root by construction (§12 hardening baseline).
RUN groupadd --gid {{RUN_AS_UID}} app \
 && useradd --uid {{RUN_AS_UID}} --gid {{RUN_AS_UID}} --create-home app

WORKDIR /app

# A committed lockfile is required; the build fails without one (§12 supply chain).
COPY package.json package-lock.json ./
# Install scripts are disabled: a malicious or hallucinated dependency does not get
# to run arbitrary code at build time (§12).
RUN npm ci --omit=dev --ignore-scripts

COPY . .

USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Write the skeleton app**

`blueprints/fixture-node/skeleton/package.json`:

```json
{
  "name": "fixture-app",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "dependencies": { "mongodb": "6.12.0" }
}
```

`blueprints/fixture-node/skeleton/server.js` — exercises exactly what P3 needs to prove: it starts, it answers the health path, and it writes to its declared service using the injected variables.

```js
import { createServer } from 'node:http'
import { MongoClient } from 'mongodb'

const PORT = Number(process.env.PORT ?? 3000)
const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME

const client = MONGODB_URI ? new MongoClient(MONGODB_URI) : null

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  // The health endpoint leaks nothing (§20 — the blueprint is a security multiplier).
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  if (url.pathname === '/notes' && req.method === 'POST' && client) {
    const db = client.db(MONGODB_DB_NAME)
    const { insertedId } = await db.collection('notes').insertOne({ at: new Date() })
    res.writeHead(201, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: String(insertedId) }))
    return
  }

  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end(`fixture-app in ${process.env.MANIFEST_ENV ?? 'unknown'}\n`)
})

if (client) await client.connect()
server.listen(PORT, '0.0.0.0')
```

- [ ] **Step 4: Write the knowledge pack stub**

`blueprints/fixture-node/agents/AGENTS.md`. Served over the API in P5 (D25); a stub here so the path in the descriptor resolves.

```markdown
# fixture-node

A minimal blueprint used to exercise Manifest's build and deploy path. It is not a
blueprint faculty use — see `node-ts-mongo` for that.

## What you may declare

- `services: [{ type: mongo, ... }]` — injected as `MONGODB_URI` and `MONGODB_DB_NAME`
- `auth.provider: none` only. This blueprint has no authentication component.
- No `ai:` block. This blueprint has no model access.

## What you may never do

- Supply a Dockerfile or any `runtime.build` block. The build definition belongs to
  the blueprint (D13).
- Write an origin into `auth.callback`. Those fields are paths; Manifest derives every
  origin itself (D15).
```

- [ ] **Step 5: Run the blueprint tests, which should now all pass**

```bash
pnpm --filter @manifest/control-plane test src/blueprints/
```

Expected: PASS, 7 tests — including the registry test that failed at the end of Task 6.

- [ ] **Step 6: Commit**

```bash
git add blueprints/
git commit -m "feat(blueprints): fixture-node@1, the minimal build target for P2/P3"
```

---

## Task 8: Database schema and migrations

**Files:**
- Create: `packages/control-plane/src/db/schema.ts`
- Create: `packages/control-plane/src/db/client.ts`
- Create: `packages/control-plane/src/db/index.ts`
- Create: `packages/control-plane/src/db/testing.ts`
- Create: `packages/control-plane/drizzle.config.ts`
- Modify: `packages/control-plane/package.json` (add Drizzle, pg, scripts)
- Test: `packages/control-plane/src/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `db` — a Drizzle client bound to `MANIFEST_DATABASE_URL`
  - table objects: `users`, `projects`, `projectMembers`, `appSpecs`, `builds`, `releases`, `environments`, `instances`, `serviceInstances`, `idempotencyKeys`
  - `withRollback(fn)` — a test helper giving each test a transaction that never commits

**Scope.** Only the §6 entities P2 actually writes. `Event`, `Incident`, `Secret`, `IamRegistration`, `PrivacyAssessment`, `Domain`, `Approval`, `DelegatedToken`, `PendingAction` and `AgentSession` arrive with the phases that use them — P4, P5 and P6. Creating empty tables now would be speculative schema, and the migration is cheap either way.

**Prerequisite:** P1's Postgres on port 7103. Set `MANIFEST_DATABASE_URL=postgres://manifest:manifest@127.0.0.1:7103/manifest_control_plane`.

- [ ] **Step 1: Add the dependencies**

```bash
pnpm --filter @manifest/control-plane add drizzle-orm pg
pnpm --filter @manifest/control-plane add -D drizzle-kit @types/pg
```

Add to `packages/control-plane/package.json` scripts:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate"
}
```

- [ ] **Step 2: Write the failing test**

`packages/control-plane/src/db/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { withRollback } from './testing.js'
import { projects, projectMembers, users } from './schema.js'

describe('control plane schema (§6)', () => {
  it('stores a user, a project and its owner membership', async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'puid-1', email: 'a@ubc.ca', displayName: 'A', role: 'member' })
        .returning()
      const [project] = await db
        .insert(projects)
        .values({ slug: 'chem-labs', ownerId: user!.id, blueprintRef: 'fixture-node@1' })
        .returning()
      await db
        .insert(projectMembers)
        .values({ projectId: project!.id, userId: user!.id, role: 'owner' })

      const found = await db.select().from(projects).where(eq(projects.slug, 'chem-labs'))
      expect(found).toHaveLength(1)
      expect(found[0]?.audience).toBeNull()
    })
  })

  it('refuses two projects with the same slug', async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'puid-2', email: 'b@ubc.ca', displayName: 'B', role: 'member' })
        .returning()
      const values = { slug: 'duplicate', ownerId: user!.id, blueprintRef: 'fixture-node@1' }
      await db.insert(projects).values(values)
      await expect(db.insert(projects).values(values)).rejects.toThrow()
    })
  })

  it('refuses the same user twice on one project', async () => {
    await withRollback(async (db) => {
      const [user] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'puid-3', email: 'c@ubc.ca', displayName: 'C', role: 'member' })
        .returning()
      const [project] = await db
        .insert(projects)
        .values({ slug: 'once-only', ownerId: user!.id, blueprintRef: 'fixture-node@1' })
        .returning()
      const membership = { projectId: project!.id, userId: user!.id, role: 'owner' as const }
      await db.insert(projectMembers).values(membership)
      await expect(db.insert(projectMembers).values(membership)).rejects.toThrow()
    })
  })
})
```

- [ ] **Step 3: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/db/
```

Expected: FAIL — `Cannot find module './schema.js'`.

- [ ] **Step 4: Write the schema**

`packages/control-plane/src/db/schema.ts`:

```ts
import {
  boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey,
  text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'

export const userRole = pgEnum('user_role', ['admin', 'member'])
export const memberRole = pgEnum('member_role', ['owner', 'collaborator'])
export const environmentKind = pgEnum('environment_kind', ['sandbox', 'staging', 'production'])
export const buildStatus = pgEnum('build_status', ['pending', 'running', 'succeeded', 'failed'])
export const instanceKind = pgEnum('instance_kind', ['web', 'worker', 'cron'])
export const instanceState = pgEnum('instance_state', [
  'pending', 'building', 'provisioning', 'starting', 'healthy',
  'failed', 'hibernated', 'waking', 'destroying', 'gone',
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  ubcCwlPuid: text('ubc_cwl_puid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: userRole('role').notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    ownerId: uuid('owner_id').notNull().references(() => users.id),
    blueprintRef: text('blueprint_ref').notNull(),
    // { max_cpu, max_memory, max_services, ai_monthly_usd } — §6
    quota: jsonb('quota').notNull().default({
      max_cpu: 2, max_memory: '2Gi', max_services: 3, ai_monthly_usd: 50,
    }),
    // Human-set, shapes production capacity only (§24, D29). Null until asked in P5.
    audience: jsonb('audience'),
    visibility: text('visibility').notNull().default('private'),
    published: boolean('published').notNull().default(false),
    forkedFrom: uuid('forked_from'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('projects_slug_key').on(t.slug)],
)

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: memberRole('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
)

export const appSpecs = pgTable('app_specs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  commitSha: text('commit_sha').notNull(),
  parsed: jsonb('parsed').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  valid: boolean('valid').notNull(),
  errors: jsonb('errors').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const builds = pgTable('builds', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  commitSha: text('commit_sha').notNull(),
  appSpecId: uuid('app_spec_id').notNull().references(() => appSpecs.id),
  imageDigest: text('image_digest'),
  status: buildStatus('status').notNull().default('pending'),
  logsRef: text('logs_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** A Release is immutable: Build + AppSpec + resolved config (§13). */
export const releases = pgTable('releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  buildId: uuid('build_id').notNull().references(() => builds.id),
  appSpecId: uuid('app_spec_id').notNull().references(() => appSpecs.id),
  resolvedConfig: jsonb('resolved_config').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const environments = pgTable(
  'environments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: environmentKind('kind').notNull(),
    policy: jsonb('policy').notNull().default({}),
    hostname: text('hostname').notNull(),
  },
  (t) => [uniqueIndex('environments_project_kind_key').on(t.projectId, t.kind)],
)

export const instances = pgTable(
  'instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    environmentId: uuid('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id').notNull().references(() => releases.id),
    driver: text('driver').notNull(),
    kind: instanceKind('kind').notNull().default('web'),
    state: instanceState('state').notNull().default('pending'),
    handle: text('handle'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [index('instances_environment_idx').on(t.environmentId)],
)

export const serviceInstances = pgTable('service_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  environmentId: uuid('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  version: text('version').notNull(),
  name: text('name').notNull(),
  handle: text('handle'),
  credentialsSecretId: uuid('credentials_secret_id'),
})

/**
 * D23.6 — clients retry and users double-click. The response is stored so a replay
 * returns the original result rather than creating a second project.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id),
    route: text('route').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.key, t.userId, t.route] })],
)
```

- [ ] **Step 5: Write the client, the module interface and the test helper**

`packages/control-plane/src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

const connectionString = process.env.MANIFEST_DATABASE_URL
if (!connectionString) throw new Error('MANIFEST_DATABASE_URL is not set')

export const pool = new pg.Pool({ connectionString })
export const db = drizzle(pool, { schema })
export type Db = typeof db
```

`packages/control-plane/src/db/index.ts`:

```ts
export { db, pool } from './client.js'
export type { Db } from './client.js'
export * from './schema.js'
```

`packages/control-plane/src/db/testing.ts` — every test runs inside a transaction that is always rolled back, so tests share one database without sharing state and without a truncate step between them:

```ts
import { db } from './client.js'
import type { Db } from './client.js'

class Rollback extends Error {}

export async function withRollback(fn: (tx: Db) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx as unknown as Db)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}
```

- [ ] **Step 6: Generate and apply the migration**

`packages/control-plane/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.MANIFEST_DATABASE_URL! },
})
```

```bash
pnpm --filter @manifest/control-plane db:generate
pnpm --filter @manifest/control-plane db:migrate
```

Expected: a migration file appears in `packages/control-plane/drizzle/` and applies cleanly.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/db/
```

Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/control-plane/src/db/ packages/control-plane/drizzle/ \
        packages/control-plane/drizzle.config.ts packages/control-plane/package.json pnpm-lock.yaml
git commit -m "feat(db): Drizzle schema and first migration for the §6 entities P2 writes"
```

---

## Task 9: The `Driver` interface and the fake driver

> **⚠ Drafted before S1. Not instructions.** Reconcile against `docs/superpowers/spikes/S1-findings.md` before implementing. See the banner at the top of this plan.

**Files:**
- Create: `packages/control-plane/src/runtime/driver.ts`
- Create: `packages/control-plane/src/runtime/fake-driver.ts`
- Create: `packages/control-plane/src/runtime/index.ts`
- Test: covered by Task 10's contract suite — this task ships the interface and one implementation of it

**Interfaces:**
- Consumes: nothing.
- Produces — **transcribed from §11, and P3's Docker driver implements the identical interface:**

```ts
interface Driver {
  buildImage(src: SourceRef, spec: AppSpec): Promise<ImageRef>
  ensureService(b: ServiceBinding): Promise<ServiceHandle>
  ensureInstance(d: InstanceSpec): Promise<InstanceHandle>
  stopInstance(id: string): Promise<void>
  destroyInstance(id: string): Promise<void>
  destroyService(id: string, opts: { deleteData: boolean }): Promise<void>
  status(id: string): Promise<InstanceStatus>
  logs(id: string, opts: LogOpts): AsyncIterable<LogLine>
  exec(id: string, cmd: string[], opts: ExecOpts): ExecStream
  snapshotService(id: string): Promise<SnapshotRef>
  capabilities(): DriverCapabilities
}
```

**The property that makes the whole design work:** every call is idempotent and keyed by a deterministic name derived from `(project, environment, release)`. §11 says that *"is the entire reason reconciliation is safe to retry"*, and P4's reconciler depends on it. Task 10 tests it as a contract obligation rather than trusting each implementation.

- [ ] **Step 1: Write the interface**

`packages/control-plane/src/runtime/driver.ts`:

```ts
export interface SourceRef { repoPath: string; commitSha: string }
export interface ImageRef { digest: string; repository: string }

export interface ServiceBinding {
  /** Deterministic, derived from (project, environment, service name). */
  name: string
  type: string
  version: string
  environmentId: string
  projectSlug: string
}
export interface ServiceHandle { id: string; name: string; endpoint: string }

export interface InstanceSpec {
  /** Deterministic, derived from (project, environment, release) — §11. */
  name: string
  projectSlug: string
  environmentKind: 'sandbox' | 'staging' | 'production'
  releaseId: string
  image: ImageRef
  env: Record<string, string>
  port: number
  healthPath: string
  resources: { cpu: number; memoryMi: number; pids: number; diskMi: number }
  services: ServiceHandle[]
  /** Default-deny egress: the allowlist, never a flag to disable it (D18). */
  egressAllow: string[]
}
export interface InstanceHandle { id: string; name: string; url: string }

export type InstanceState =
  | 'pending' | 'building' | 'provisioning' | 'starting' | 'healthy'
  | 'failed' | 'hibernated' | 'waking' | 'destroying' | 'gone'

export interface InstanceStatus { id: string; state: InstanceState; healthy: boolean; message?: string }

export interface LogOpts { follow?: boolean; tail?: number }
export interface LogLine { at: Date; stream: 'stdout' | 'stderr'; text: string }

export interface ExecOpts { cwd?: string; env?: Record<string, string> }
export interface ExecStream {
  stdout: AsyncIterable<string>
  stderr: AsyncIterable<string>
  exitCode: Promise<number>
}

export interface SnapshotRef { id: string; createdAt: Date; sizeBytes: number }

/**
 * A driver declares honestly what it cannot enforce rather than silently pretending.
 * The control plane surfaces declared-but-unenforced policy as a warning on the app (§11).
 */
export interface DriverCapabilities {
  enforcesEgress: boolean
  isolationLevel: 'container' | 'gvisor' | 'vm'
  remoteTarget: boolean
  supportsExec: boolean
  supportsSnapshot: boolean
}

export interface Driver {
  readonly name: string
  buildImage(src: SourceRef, spec: { blueprintRef: string; projectSlug: string }): Promise<ImageRef>
  ensureService(binding: ServiceBinding): Promise<ServiceHandle>
  ensureInstance(spec: InstanceSpec): Promise<InstanceHandle>
  stopInstance(id: string): Promise<void>
  destroyInstance(id: string): Promise<void>
  destroyService(id: string, opts: { deleteData: boolean }): Promise<void>
  status(id: string): Promise<InstanceStatus>
  logs(id: string, opts: LogOpts): AsyncIterable<LogLine>
  exec(id: string, cmd: string[], opts: ExecOpts): ExecStream
  snapshotService(id: string): Promise<SnapshotRef>
  capabilities(): DriverCapabilities
}

/** §11: keyed by a deterministic name derived from (project, environment, release). */
export function instanceName(projectSlug: string, environmentKind: string, releaseId: string): string {
  return `${projectSlug}-${environmentKind}-${releaseId.slice(0, 8)}`
}

export function serviceName(projectSlug: string, environmentKind: string, declared: string): string {
  return `${projectSlug}-${environmentKind}-${declared}`
}
```

- [ ] **Step 2: Write the fake driver**

`packages/control-plane/src/runtime/fake-driver.ts`. §16 calls this *"the highest-leverage decision"* in the design — it is what lets the reconciler, approval logic, API and routing decisions be tested with no Docker, no network, in milliseconds.

```ts
import { createHash } from 'node:crypto'
import type {
  Driver, DriverCapabilities, ExecOpts, ExecStream, ImageRef, InstanceHandle,
  InstanceSpec, InstanceStatus, LogLine, LogOpts, ServiceBinding, ServiceHandle,
  SnapshotRef, SourceRef,
} from './driver.js'

interface FakeInstance { spec: InstanceSpec; state: InstanceStatus['state']; logs: LogLine[] }
interface FakeService { binding: ServiceBinding; handle: ServiceHandle; dataDeleted: boolean }

export interface FakeDriverOptions {
  /** Make ensureInstance land in `failed` — for testing failure paths without Docker. */
  failInstances?: boolean
  capabilities?: Partial<DriverCapabilities>
}

export function createFakeDriver(options: FakeDriverOptions = {}): Driver & {
  /** Test affordance: advance a starting instance to healthy. */
  markHealthy(id: string): void
  instanceCount(): number
} {
  const instances = new Map<string, FakeInstance>()
  const services = new Map<string, FakeService>()
  const byName = new Map<string, string>()

  const digestOf = (input: string) =>
    `sha256:${createHash('sha256').update(input).digest('hex')}`

  return {
    name: 'fake',

    async buildImage(src: SourceRef, spec): Promise<ImageRef> {
      return {
        repository: `local/${spec.projectSlug}`,
        digest: digestOf(`${spec.projectSlug}:${src.commitSha}:${spec.blueprintRef}`),
      }
    },

    async ensureService(binding: ServiceBinding): Promise<ServiceHandle> {
      const existingId = byName.get(`service:${binding.name}`)
      if (existingId) return services.get(existingId)!.handle
      const id = `svc-${services.size + 1}`
      const handle: ServiceHandle = {
        id,
        name: binding.name,
        endpoint: `${binding.type}://${binding.name}.fake:27017`,
      }
      services.set(id, { binding, handle, dataDeleted: false })
      byName.set(`service:${binding.name}`, id)
      return handle
    },

    async ensureInstance(spec: InstanceSpec): Promise<InstanceHandle> {
      const existingId = byName.get(`instance:${spec.name}`)
      if (existingId) {
        const existing = instances.get(existingId)!
        existing.spec = spec
        if (existing.state === 'hibernated') existing.state = 'starting'
        return { id: existingId, name: spec.name, url: `https://${spec.name}.manifest.internal` }
      }
      const id = `inst-${instances.size + 1}`
      instances.set(id, {
        spec,
        state: options.failInstances ? 'failed' : 'starting',
        logs: [{ at: new Date(), stream: 'stdout', text: `starting ${spec.name}` }],
      })
      byName.set(`instance:${spec.name}`, id)
      return { id, name: spec.name, url: `https://${spec.name}.manifest.internal` }
    },

    async stopInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (instance) instance.state = 'hibernated'   // volumes survive — §11
    },

    async destroyInstance(id: string): Promise<void> {
      const instance = instances.get(id)
      if (!instance) return
      instance.state = 'gone'
      byName.delete(`instance:${instance.spec.name}`)
      instances.delete(id)
    },

    async destroyService(id: string, opts: { deleteData: boolean }): Promise<void> {
      const service = services.get(id)
      if (!service) return
      service.dataDeleted = opts.deleteData
      byName.delete(`service:${service.binding.name}`)
      services.delete(id)
    },

    async status(id: string): Promise<InstanceStatus> {
      const instance = instances.get(id)
      if (!instance) return { id, state: 'gone', healthy: false }
      return { id, state: instance.state, healthy: instance.state === 'healthy' }
    },

    async *logs(id: string, opts: LogOpts): AsyncIterable<LogLine> {
      const instance = instances.get(id)
      if (!instance) return
      const lines = opts.tail ? instance.logs.slice(-opts.tail) : instance.logs
      for (const line of lines) yield line
    },

    exec(id: string, cmd: string[], _opts: ExecOpts): ExecStream {
      async function* out() { yield `fake exec: ${cmd.join(' ')}\n` }
      async function* err() {}
      return { stdout: out(), stderr: err(), exitCode: Promise.resolve(0) }
    },

    async snapshotService(id: string): Promise<SnapshotRef> {
      return { id: `snap-${id}-${Date.now()}`, createdAt: new Date(), sizeBytes: 0 }
    },

    capabilities(): DriverCapabilities {
      return {
        enforcesEgress: false,   // honest: an in-memory driver enforces nothing
        isolationLevel: 'container',
        remoteTarget: false,
        supportsExec: true,
        supportsSnapshot: true,
        ...options.capabilities,
      }
    },

    markHealthy(id: string) {
      const instance = instances.get(id)
      if (instance) instance.state = 'healthy'
    },

    instanceCount: () => instances.size,
  }
}
```

- [ ] **Step 3: Write the module interface**

`packages/control-plane/src/runtime/index.ts`:

```ts
export type {
  Driver, DriverCapabilities, ImageRef, InstanceHandle, InstanceSpec, InstanceState,
  InstanceStatus, LogLine, LogOpts, ExecOpts, ExecStream, ServiceBinding,
  ServiceHandle, SnapshotRef, SourceRef,
} from './driver.js'
export { instanceName, serviceName } from './driver.js'
export { createFakeDriver } from './fake-driver.js'
export type { FakeDriverOptions } from './fake-driver.js'
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @manifest/control-plane typecheck
```

Expected: no errors. There is no test yet by design — Task 10 supplies it, and it supplies it as a *shared contract* rather than as tests written for this implementation alone.

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/runtime/
git commit -m "feat(runtime): the §11 Driver interface and an in-memory fake implementation"
```

---

## Task 10: The driver contract suite

> **⚠ Drafted before S1. Not instructions.** This suite is what P3 inherits unchanged, so it must be written against a validated interface. See the banner at the top of this plan.

**Files:**
- Create: `packages/control-plane/src/runtime/driver-contract.ts`
- Create: `packages/control-plane/src/runtime/fake-driver.test.ts`

**Interfaces:**
- Consumes: everything from Task 9.
- Produces: `describeDriverContract(name: string, factory: () => Driver | Promise<Driver>): void` — **P3 imports this unchanged and points it at the Docker driver.**

**Why it is shared rather than duplicated.** §16: *"One suite every driver must pass. The k8s driver later proves itself against the exact tests the Docker driver passes — this is what keeps the abstraction honest rather than aspirational."* If P3 writes its own tests, the abstraction is a hope. If P3 imports these, it is a contract.

- [ ] **Step 1: Write the contract suite**

`packages/control-plane/src/runtime/driver-contract.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Driver, InstanceSpec, ServiceBinding } from './driver.js'
import { instanceName, serviceName } from './driver.js'

const binding = (): ServiceBinding => ({
  name: serviceName('chem-labs', 'staging', 'db'),
  type: 'mongo',
  version: '7',
  environmentId: 'env-1',
  projectSlug: 'chem-labs',
})

const spec = (overrides: Partial<InstanceSpec> = {}): InstanceSpec => ({
  name: instanceName('chem-labs', 'staging', 'release-abcdef12'),
  projectSlug: 'chem-labs',
  environmentKind: 'staging',
  releaseId: 'release-abcdef12',
  image: { repository: 'local/chem-labs', digest: 'sha256:' + 'a'.repeat(64) },
  env: { MANIFEST_ENV: 'staging', PORT: '3000' },
  port: 3000,
  healthPath: '/healthz',
  resources: { cpu: 0.5, memoryMi: 512, pids: 256, diskMi: 2048 },
  services: [],
  egressAllow: [],
  ...overrides,
})

/**
 * Every Driver implementation must pass this suite unchanged (§16).
 * P3 calls it with the Docker driver; a future k8s driver calls it too.
 */
export function describeDriverContract(
  name: string,
  factory: () => Driver | Promise<Driver>,
): void {
  describe(`Driver contract: ${name}`, () => {
    it('produces a digest-addressed image reference', async () => {
      const driver = await factory()
      const image = await driver.buildImage(
        { repoPath: '/tmp/repo', commitSha: 'abc123' },
        { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
      )
      expect(image.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
      expect(image.repository).toContain('chem-labs')
    })

    it('builds the same source to the same digest', async () => {
      const driver = await factory()
      const args = [
        { repoPath: '/tmp/repo', commitSha: 'abc123' },
        { blueprintRef: 'fixture-node@1', projectSlug: 'chem-labs' },
      ] as const
      const first = await driver.buildImage(...args)
      const second = await driver.buildImage(...args)
      expect(second.digest).toBe(first.digest)
    })

    it('ensureService is idempotent — the second call returns the same handle', async () => {
      const driver = await factory()
      const first = await driver.ensureService(binding())
      const second = await driver.ensureService(binding())
      expect(second.id).toBe(first.id)
    })

    it('ensureInstance is idempotent — the second call does not create a second instance', async () => {
      const driver = await factory()
      const first = await driver.ensureInstance(spec())
      const second = await driver.ensureInstance(spec())
      expect(second.id).toBe(first.id)
    })

    it('reports a created instance as not-gone, and a destroyed one as gone', async () => {
      const driver = await factory()
      const handle = await driver.ensureInstance(spec())
      expect((await driver.status(handle.id)).state).not.toBe('gone')
      await driver.destroyInstance(handle.id)
      expect((await driver.status(handle.id)).state).toBe('gone')
    })

    it('stopInstance hibernates rather than destroys — volumes survive (§11)', async () => {
      const driver = await factory()
      const handle = await driver.ensureInstance(spec())
      await driver.stopInstance(handle.id)
      expect((await driver.status(handle.id)).state).toBe('hibernated')
      const woken = await driver.ensureInstance(spec())
      expect(woken.id).toBe(handle.id)
    })

    it('status of an unknown id is gone, never a throw', async () => {
      const driver = await factory()
      expect((await driver.status('no-such-instance')).state).toBe('gone')
    })

    it('destroying an unknown instance is a no-op, not an error', async () => {
      const driver = await factory()
      await expect(driver.destroyInstance('no-such-instance')).resolves.toBeUndefined()
    })

    it('streams logs as an async iterable', async () => {
      const driver = await factory()
      const handle = await driver.ensureInstance(spec())
      const lines = []
      for await (const line of driver.logs(handle.id, { tail: 10 })) lines.push(line)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines[0]).toHaveProperty('stream')
      expect(lines[0]).toHaveProperty('text')
    })

    it('declares its capabilities honestly and completely', async () => {
      const driver = await factory()
      const caps = driver.capabilities()
      expect(typeof caps.enforcesEgress).toBe('boolean')
      expect(['container', 'gvisor', 'vm']).toContain(caps.isolationLevel)
      expect(typeof caps.remoteTarget).toBe('boolean')
    })

    it('derives instance names deterministically from project, environment and release', () => {
      expect(instanceName('chem-labs', 'staging', 'release-abcdef12')).toBe(
        instanceName('chem-labs', 'staging', 'release-abcdef12'),
      )
      expect(instanceName('chem-labs', 'staging', 'release-abcdef12')).not.toBe(
        instanceName('chem-labs', 'production', 'release-abcdef12'),
      )
    })
  })
}
```

- [ ] **Step 2: Point it at the fake driver**

`packages/control-plane/src/runtime/fake-driver.test.ts`:

```ts
import { describeDriverContract } from './driver-contract.js'
import { createFakeDriver } from './fake-driver.js'

describeDriverContract('fake', () => createFakeDriver())
```

- [ ] **Step 3: Run it**

```bash
pnpm --filter @manifest/control-plane test src/runtime/
```

Expected: PASS, 11 tests, in well under a second.

- [ ] **Step 4: Prove the suite has teeth**

Temporarily break idempotency in `fake-driver.ts` by deleting the `if (existingId)` early return in `ensureInstance`. Run the suite again.

Expected: **FAIL** on *"ensureInstance is idempotent"* and *"stopInstance hibernates"*. Restore the lines and confirm green.

The contract suite is the load-bearing artefact P3 inherits. A suite that has never failed proves nothing about P3.

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/runtime/
git commit -m "test(runtime): shared driver contract suite, passed by the fake driver"
```
