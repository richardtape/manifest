# P2 — Control-Plane Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every part of the Manifest control plane that can be tested without Docker — spec validation, blueprints, the driver abstraction, identity and authorization, builds and releases — and prove it by driving the full project→spec→build→release→deploy lifecycle against an in-memory fake driver in under a second.

**Architecture:** A pnpm workspace whose `control-plane` package holds §5's module map as `src/<module>/` folders, each with a public `index.ts` and no reach into another module's internals. Domain logic is pure functions over plain data; all infrastructure sits behind the §11 `Driver` interface, which has two implementations — a fake one here, a Docker one in P3 — that pass the identical contract suite. Fastify serves a minimal HTTP surface; every mutating route takes an idempotency key and every route carries an explicit `ProjectMember` check.

**Tech Stack:** TypeScript (strict), Node 24 LTS, pnpm workspaces, Fastify, Postgres 16, Drizzle ORM + Drizzle Kit, Zod (+ `fastify-type-provider-zod`), Vitest, Supertest, ESLint flat config + Prettier.

**Spec:** [`docs/superpowers/specs/2026-08-29-manifest-platform-design.md`](../specs/2026-08-29-manifest-platform-design.md)

**Roadmap:** [`2026-08-29-plan-roadmap.md`](./2026-08-29-plan-roadmap.md) — P2's scope, and gaps 1, 2 and 3 which this plan discharges.

**Depends on:** P1 (for a running Postgres) to execute.

**Status: complete — 21 tasks.** There are no pause banners left in this plan and no
step in it stands in for a spike result. Execute it in order.

### How this plan came to be written in two passes

Worth two paragraphs, because a reader who finds Tasks 1–8 in one style and 11–21 in
another will otherwise wonder what happened.

**Tasks 1–8 were written first and paused there deliberately.** Scaffolding, `spec/`,
`blueprints/` and the database schema are settled by §7 and §25 and survive any spike
outcome. Tasks 9 and 10 — the §11 `Driver` interface and the contract suite **P3
inherits unchanged** — were drafted at the same time but marked *not instructions*,
because S1's brief listed *"a list of `Driver` interface signatures that turned out to
be wrong"* among the things that survive the spike. Writing the interface, an
implementation of it, and the suite that pins it, all before the spike meant to
correct it, is the precise rework the spikes exist to prevent. **Tasks 11 onward were
blocked behind Task 9 in turn, because every one of them consumes Task 9's types.**

**S1 reported on 2026-08-30 and cut both links at once: §11's `Driver` interface
needed no revision.** Every operation was implementable as declared, idempotency held
on the second call for both `ensure*` operations and both destroys, and the
sub-question about wrong signatures **came back empty**. So Tasks 9 and 10 were
*promoted* rather than rewritten, and Tasks 11–21 were written on 2026-08-31 against
the validated types. What S1 did change is recorded inline at Task 9 under
*What S1 changed, and what it confirmed* — three items, none of them structural.

---

## Decisions this plan makes

Recorded here rather than left implicit, so a later reader can see the option chosen,
the options rejected, and what changing course would cost.

**1. Sessions are stateless signed cookies, not a `sessions` table.**
D23.4 requires *"an interactive session cookie for browsers"*. A cookie carrying a
signed, expiring payload needs no schema, no cleanup job and no migration — and Task
8's table set deliberately excludes speculative entities. *Rejected:* a `sessions`
table, which buys server-side revocation P2 has no way to trigger yet. *Cost of
change:* one migration and one repository, both additive; the `Session` type and
`requireSession` signature stay as they are. P4 revisits this when real CWL arrives
and logout becomes meaningful.

**2. `buildImage` takes `{ blueprintRef, projectSlug }`, not the whole `AppSpec`.**
§11 writes the parameter as `spec: AppSpec`. Narrowing it is deliberate: the driver
needs the blueprint reference and the slug and nothing else, and handing an
infrastructure adapter the full validated spec invites it to make policy decisions
that belong in `spec/`. *Cost of change:* widening a parameter is source-compatible;
narrowing it later would not be. S1 built against the narrow shape and needed nothing
more.

**3. `DriverCapabilities` gains `enforcesUserNamespaceRemapping`.**
S1 found Docker Desktop provides no `userns`, and §12 already says the gap *"is
reported through `capabilities()` rather than assumed."* The spec's three-field line
in §11 is an example of what the Docker driver reports, not an exhaustive type — the
sketch already carried five fields — so this is a plan-level addition, not a spec
change. Task 10 asserts the field is **present and boolean on every driver**, which
is what stops P3's Docker driver from quietly omitting it.

**4. `hibernated` and `waking` are declared here; the wake *mechanism* is S4's.**
The state machine models both states and the transitions into them. How an inbound
request triggers a wake — an edge retry window versus a holding page — is a measured
choice S4 makes before Phase 4, and its brief says outright that nothing in Phases 1–2
needs it. Task 11 therefore has no `wake()` entry point, and that is a boundary, not
an omission.

**5. The D9 approval gate's *data* lands in P2; its *enforcement* lands in P4.**
`isSensitiveDiff()` (Task 5) and the release record are here, because the release is
immutable and the diff is a pure function. The `Approval` entity, step-up
re-authentication and `LaunchReadiness` need identity P2 does not have — Task 13 ships
a dev-only shim, and approving a production release against a shim would be a control
that exists only on paper. Task 19 therefore **refuses production deployment outright**
rather than approving it, and a test pins that refusal.

**6. `build/` from §5's module map lives inside `releases/` in P2.**
§5 lists `build/` and `releases/` as separate folders. P2 keeps build records in
`releases/build.ts` because in this plan a build exists only to become a release and
the two share one repository; splitting them would create a module whose public
interface is one function. *Cost of change:* a folder move and an import rewrite, no
signature changes. P3 adds the real builder and may take the split then.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Node 24 LTS**, pinned in `.nvmrc` and `engines`. Node 24 is the current Active LTS; Node 22 is in maintenance. `passport-ubcshib` declares `"node": ">=22.0.0"`, which is a **floor**, not a pin, and 24 clears it.

  *This was 22 in the first draft, for no reason that survived checking.* The spec names no Node version anywhere; no spike ever treated the Node version as a variable; and S1's use of `node:22-alpine` was incidental — it was the image already pulled. Repinned to 24 on 2026-08-31 at Rich's direction. **Nothing was tried on 24 and found wanting**, because nothing had been tried on 24 at all.

- **The app-side Node version is a separate decision, and is still 22.** The blueprint's `base_image` is `node:22-alpine` — what *faculty apps* run in, not what the control plane runs on. They need not match: §25 and D30 make blueprints independently versioned precisely so a blueprint's runtime is its own business. Changing it is not free — S1 recorded that image's exact digest and mirrored it into the local registry, P1 references it in three places including `make doctor` and the **offline** acceptance test, and `node:24-alpine` is not pulled on this machine. Decide it when P1 executes, not in passing here.
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
            ├── config.ts                   env parsing, dev-auth kill switch
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
            │   ├── driver-contract.ts      shared suite — P3 imports unchanged
            │   ├── state-machine.ts        §11 instance transitions
            │   └── index.ts
            ├── source/
            │   ├── git-driver.ts           SourceDriver interface
            │   ├── local-driver.ts         bare repos on disk (D5)
            │   └── index.ts
            ├── identity/
            │   ├── dev-auth.ts             the shim (roadmap gap 3) — P4 deletes it
            │   ├── session.ts              signed cookies
            │   └── index.ts
            ├── projects/
            │   ├── repository.ts
            │   ├── authz.ts                capability model, ProjectMember checks
            │   └── index.ts
            ├── releases/
            │   ├── build.ts
            │   ├── release.ts              create, deploy, promote
            │   └── index.ts
            └── api/
                ├── server.ts               Fastify wiring, session hook, idempotency hook
                ├── errors.ts               the D23.7 error envelope
                ├── idempotency.ts          D23.6
                ├── authz-contract.ts       shared suite — P3 imports unchanged
                ├── testing.ts              the ServerDeps bundle every API test uses
                ├── routes/
                │   ├── auth.ts             dev login, me, logout
                │   ├── projects.ts         projects, spec, members
                │   └── delivery.ts         builds, releases, deploy, environments
                └── index.ts
```

**Test files** sit beside their subject as `*.test.ts`, except the two contract suites, which are shared and live at `src/runtime/driver-contract.ts` and `src/api/authz-contract.ts` so P3 can import them unchanged.

**Why `routes/` is three files, not five.** The map originally split builds, releases
and environments. They are one file, `delivery.ts`, because they share the release
lifecycle and every one of them is under 120 lines; five files would have been split
by URL prefix rather than by responsibility. `projects.ts` keeps members for the same
reason — membership is a property of a project, not a subject of its own.

**Two public entry points per module, not one.** `index.ts` is the production surface;
`testing.ts` is what tests may reach for. Task 1's boundary test enforces exactly
those two, so a test helper never has to be exported from `index.ts` — which is how it
would end up in the shipped bundle.

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

# pnpm 10+ refuses to run a dependency's install scripts unless it is named here,
# and pnpm 11 makes an un-named one a HARD ERROR rather than a warning — `pnpm test`
# does not run at all. Allowing one is a supply-chain decision, so each entry
# carries its reason.
#
#   esbuild — vitest's bundler. Its postinstall (`node install.js`) fetches the
#   platform binary; without it vitest cannot start. Pulled in transitively by
#   vitest 2.1.9 as esbuild@0.21.5.
allowBuilds:
  esbuild: true
```

**Do not hand-write this key from memory.** pnpm 11 spells it `allowBuilds` (a map);
pnpm 10's documentation says `onlyBuiltDependencies` (a list). pnpm 11 still *reads*
the old key — `pnpm config get onlyBuiltDependencies` dutifully returns your value —
but does not act on it, so the install keeps failing with no hint that the setting was
seen. Run **`pnpm approve-builds esbuild`** and let pnpm write the key; then restore
the comment above, which `approve-builds` strips.

`.nvmrc`:

```
24
```

`package.json`:

```json
{
  "name": "manifest",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc -b --pretty"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
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
import { dirname, join, relative, resolve, sep } from 'node:path'
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

/** Every relative import. Package imports are somebody else's problem. */
const RELATIVE_IMPORT = /from\s+'(\.[^']+)'/g

/**
 * A module's public surface: `index` for production code, `testing` for the helpers
 * tests may reach for. Keeping test helpers out of `index` keeps them out of the
 * shipped bundle; naming `testing` here keeps tests honest about everything else.
 */
const PUBLIC_ENTRIES = new Set(['index.ts', 'index.js', 'testing.ts', 'testing.js'])

/**
 * The module a path belongs to — the first segment under `src/`, or null for files
 * that sit directly in `src/` (`config.ts`, `index.ts`) and belong to no module.
 */
function moduleOf(path: string): string | null {
  const rel = relative(SRC, path)
  if (rel.startsWith('..')) return null
  const segments = rel.split(sep)
  return segments.length > 1 ? segments[0]! : null
}

describe('module boundaries (§5)', () => {
  it('never imports another module by a deep path', async () => {
    const files = await sourceFiles(SRC)
    const violations: string[] = []

    for (const file of files) {
      const text = await readFile(file, 'utf8')
      const from = moduleOf(file)

      for (const match of text.matchAll(RELATIVE_IMPORT)) {
        const target = resolve(dirname(file), match[1]!)
        const to = moduleOf(target)

        // Inside one module, or reaching a file that belongs to no module
        // (`config.ts`): not a boundary crossing.
        if (to === null || to === from) continue

        // Crossing: the target must be that module's public entry point, not a
        // file inside it. `api/routes/x.ts -> ../../db/index.js` is fine;
        // `-> ../../db/schema.js` is not.
        const withinTarget = relative(join(SRC, to), target)
        if (!PUBLIC_ENTRIES.has(withinTarget)) {
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
import { nothing } from '../blueprints/descriptor.js'
```

Run `pnpm test`. Expected: **FAIL**, listing `spec/index.ts` in `violations`. Then delete those two lines and confirm it passes again.

**The target must be a module-internal file, not `index.js`.** `../blueprints/index.js` is a *public entry point* and is exactly what the rule permits — using it here would produce a green run and a false sense of a working control. `descriptor.ts` need not exist yet: the test reads source as text and resolves paths, it never imports anything.

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
      // An underscore prefix is the project's "deliberately unused" marker.
      // typescript-eslint does NOT honour it by default. The §11 Driver interface
      // fixes several signatures an implementation may not need in full — the fake
      // driver's `exec(id, cmd, _opts)` in Task 9 is the first — so without this,
      // `pnpm lint` fails on code that implements the interface correctly.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // ESLint 9's `group` takes gitignore-style globs, which have NO
              // extglob support: `!(index)` is read literally and matches nothing.
              // A leading `!` is the negation this syntax does support. Verified
              // against all four shapes — see the note below.
              group: [
                './*/*',
                '../*/*',
                '../../*/*',
                '!./*/index.js',
                '!../*/index.js',
                '!../../*/index.js',
                '!./*/testing.js',
                '!../*/testing.js',
                '!../../*/testing.js',
              ],
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

- [ ] **Step 7: Prove the ESLint half fires too — it is the half that silently does not**

The plan claims the boundary is enforced twice. A lint rule that never fires is worse
than no lint rule: it is a false report of a control. Check all four shapes with
throwaway fixtures, then delete them.

```bash
mkdir -p packages/control-plane/src/probe packages/control-plane/src/api/routes

# must be SILENT — these are the permitted public entry points
cat > packages/control-plane/src/probe/legit.ts <<'EOF'
// @ts-expect-error fixture
import { a } from '../db/index.js'
// @ts-expect-error fixture
import { b } from '../db/testing.js'
export const LEGIT = [a, b]
EOF

# must ERROR — one level up, into a module's internals
cat > packages/control-plane/src/probe/bad.ts <<'EOF'
// @ts-expect-error fixture
import { c } from '../db/schema.js'
export const BAD = c
EOF

# must ERROR — two levels up, the shape api/routes/*.ts actually uses
cat > packages/control-plane/src/api/routes/probe.ts <<'EOF'
// @ts-expect-error fixture
import { d } from '../../db/schema.js'
export const PROBE = d
EOF

pnpm lint
rm -rf packages/control-plane/src/probe packages/control-plane/src/api
```

Expected: **exactly two `no-restricted-imports` errors** — `probe/bad.ts` and
`api/routes/probe.ts` — and **nothing** for `probe/legit.ts`.

*The original pattern set (`['../*/!(index)', '../*/*/**']`) got this exactly
backwards:* it missed the one-level violation entirely, and caught the two-level one
only by accident, because `*` happened to match `..`. It would also have flagged the
legitimate `../db/index.js`. Both halves of a doubly-enforced rule have now been
watched failing and watched passing.

- [ ] **Step 8: Commit**

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

### What S1 changed, and what it confirmed

This task was drafted before S1 and reconciled against
[`S1-findings.md`](../spikes/S1-findings.md) afterwards. Recorded so a reader does not
mistake a deliberate reconciliation for a mistake, and does not re-derive any of it:

| | Outcome |
|---|---|
| **The interface itself** | **Unchanged.** S1 implemented `buildImage`, `ensureService`, `ensureInstance`, `stopInstance`, `destroyInstance`, `destroyService`, `status`, `logs` and `capabilities` against real Docker. All were implementable as declared, and the sub-question asking for wrong signatures came back empty. §11 now records this. |
| **Idempotency** | **Confirmed against real Docker.** The second call was a no-op for both `ensure*` operations and both destroys — which is the property Task 10 pins as a contract obligation rather than trusting per implementation. |
| **`capabilities()`** | **One field added** — `enforcesUserNamespaceRemapping`. Docker Desktop provides no `userns`; §12 already requires the gap be reported here rather than assumed. See *Decisions this plan makes*, item 3. |
| **`logs()`** | **Confirmed as declared.** `AsyncIterable<LogLine>`, demuxed from the Engine API's 8-byte-framed stream in ~40 dependency-free lines. The demux is **P3's** code; the fake driver below just yields buffered lines. |
| **`exec()`, `snapshotService()`** | **Still unexercised.** `exec()` belongs to S5, `snapshotService()` to production. They are declared and faked here, and the contract suite asserts their shape only. Do not treat either as validated. |

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
  /**
   * §12's hardening baseline lists user-namespace remapping "where the daemon
   * provides it". S1 established that Docker Desktop does not: `docker info`
   * reports only `seccomp` and `cgroupns`, with no `userns`, while every other
   * item in the baseline genuinely enforces. It is declared here rather than
   * assumed, and P3's Docker driver reports `false` on macOS. S6 reads it.
   */
  enforcesUserNamespaceRemapping: boolean
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
        enforcesUserNamespaceRemapping: false,   // honest: nothing is namespaced
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

**This suite is written against a validated interface.** It was drafted before S1 and held back deliberately, because P3 inherits it *unchanged* and a suite pinning an unvalidated interface would pin the wrong thing. S1 has since exercised every operation it covers against real Docker — see *What S1 changed, and what it confirmed* at Task 9.

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
      expect(typeof caps.supportsExec).toBe('boolean')
      expect(typeof caps.supportsSnapshot).toBe('boolean')
      // S1: Docker Desktop provides no userns. Every driver must say so either
      // way — an omitted field would read as "enforced" to §12's baseline check.
      expect(typeof caps.enforcesUserNamespaceRemapping).toBe('boolean')
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

---

## Task 11: The instance state machine

**Files:**
- Create: `packages/control-plane/src/runtime/state-machine.ts`
- Modify: `packages/control-plane/src/runtime/index.ts` (re-export)
- Test: `packages/control-plane/src/runtime/state-machine.test.ts`

**Interfaces:**
- Consumes: `InstanceState` from Task 9's `driver.ts`.
- Produces:
  - `type InstanceEvent` — the twelve events that move an instance
  - `TRANSITIONS` — the frozen table, one entry per `InstanceState`
  - `nextState(from: InstanceState, event: InstanceEvent): InstanceState` — throws `InvalidTransitionError`
  - `canTransition(from: InstanceState, event: InstanceEvent): boolean`
  - `class InvalidTransitionError` with `code = 'INSTANCE_INVALID_TRANSITION'`
  - `IDLE_POLICY` — §11's lifetime table as data

**Why a table and not `if` statements.** §11's states are a closed set that the driver
interface already names, and the reconciler in P4 will ask "may this instance go
there?" from several call sites. A frozen table is the version a drift test can check
against the union type — see Step 5, which is the test that catches a state added to
`driver.ts` and forgotten here.

**The S4 boundary.** `hibernated` and `waking` are modelled, and `wake_requested`
moves between them. **How an inbound request triggers that event is not decided here
and must not be invented.** S4 chooses between an edge retry window and a holding page
by measuring both against a real cold start, and it runs before Phase 4; its brief
says outright that nothing in Phases 1–2 needs it. There is deliberately no `wake()`
function in this task. See *Decisions this plan makes*, item 4.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/runtime/state-machine.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  IDLE_POLICY, InvalidTransitionError, TRANSITIONS, canTransition, nextState,
} from './state-machine.js'
import type { InstanceState } from './driver.js'

const ALL_STATES: InstanceState[] = [
  'pending', 'building', 'provisioning', 'starting', 'healthy',
  'failed', 'hibernated', 'waking', 'destroying', 'gone',
]

describe('instance state machine (§11)', () => {
  it('drives the happy path from pending to healthy', () => {
    let state: InstanceState = 'pending'
    state = nextState(state, 'build_started')
    expect(state).toBe('building')
    state = nextState(state, 'build_succeeded')
    expect(state).toBe('provisioning')
    state = nextState(state, 'services_bound')
    expect(state).toBe('starting')
    state = nextState(state, 'health_passed')
    expect(state).toBe('healthy')
  })

  it('sends a failed build to failed, and allows a retry', () => {
    expect(nextState('building', 'build_failed')).toBe('failed')
    expect(nextState('failed', 'build_started')).toBe('building')
  })

  it('hibernates on idle and wakes back through starting', () => {
    expect(nextState('healthy', 'idle_timeout')).toBe('hibernated')
    expect(nextState('hibernated', 'wake_requested')).toBe('waking')
    expect(nextState('waking', 'container_started')).toBe('starting')
  })

  it('lets any live state be destroyed, and gone accepts nothing', () => {
    for (const state of ALL_STATES) {
      if (state === 'gone' || state === 'destroying') continue
      expect(nextState(state, 'destroy_requested')).toBe('destroying')
    }
    expect(nextState('destroying', 'destroyed')).toBe('gone')
    expect(canTransition('gone', 'destroy_requested')).toBe(false)
    expect(canTransition('gone', 'build_started')).toBe(false)
  })

  it('refuses an illegal transition with a machine-readable code', () => {
    expect(() => nextState('healthy', 'build_succeeded')).toThrow(InvalidTransitionError)
    try {
      nextState('healthy', 'build_succeeded')
    } catch (error) {
      expect((error as InvalidTransitionError).code).toBe('INSTANCE_INVALID_TRANSITION')
      expect((error as InvalidTransitionError).from).toBe('healthy')
    }
  })

  // The drift test. If someone adds a state to InstanceState in driver.ts and
  // forgets this table, every other test here still passes and this one fails.
  it('has an entry for every state the driver interface declares', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ALL_STATES].sort())
  })

  it('matches §11 lifetime policy exactly', () => {
    expect(IDLE_POLICY.sandbox).toEqual({ action: 'destroy', afterMinutes: 45 })
    expect(IDLE_POLICY.staging).toEqual({ action: 'hibernate', afterMinutes: 10080 })
    expect(IDLE_POLICY.production).toEqual({ action: 'none', afterMinutes: null })
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/runtime/state-machine
```

Expected: FAIL — `Cannot find module './state-machine.js'`.

- [ ] **Step 3: Write the state machine**

`packages/control-plane/src/runtime/state-machine.ts`:

```ts
import type { InstanceState } from './driver.js'

/** Everything that can move an instance. §11's states are the nodes; these are the edges. */
export type InstanceEvent =
  | 'build_started'
  | 'build_succeeded'
  | 'build_failed'
  | 'services_bound'
  | 'container_started'
  | 'health_passed'
  | 'health_failed'
  | 'crashed'
  | 'idle_timeout'
  | 'wake_requested'
  | 'destroy_requested'
  | 'destroyed'

type TransitionTable = Readonly<
  Record<InstanceState, Readonly<Partial<Record<InstanceEvent, InstanceState>>>>
>

export const TRANSITIONS: TransitionTable = Object.freeze({
  pending: { build_started: 'building', destroy_requested: 'destroying' },
  building: {
    build_succeeded: 'provisioning',
    build_failed: 'failed',
    destroy_requested: 'destroying',
  },
  provisioning: {
    services_bound: 'starting',
    health_failed: 'failed',
    destroy_requested: 'destroying',
  },
  starting: {
    health_passed: 'healthy',
    health_failed: 'failed',
    destroy_requested: 'destroying',
  },
  healthy: {
    idle_timeout: 'hibernated',
    crashed: 'failed',
    destroy_requested: 'destroying',
  },
  // wake_requested is raised by whatever S4 chooses. Nothing in P2 raises it.
  hibernated: { wake_requested: 'waking', destroy_requested: 'destroying' },
  waking: {
    container_started: 'starting',
    health_failed: 'failed',
    destroy_requested: 'destroying',
  },
  failed: { build_started: 'building', destroy_requested: 'destroying' },
  destroying: { destroyed: 'gone' },
  gone: {},
} satisfies TransitionTable)

export class InvalidTransitionError extends Error {
  readonly code = 'INSTANCE_INVALID_TRANSITION'
  constructor(
    readonly from: InstanceState,
    readonly event: InstanceEvent,
  ) {
    super(`instance in state '${from}' has no transition for event '${event}'`)
    this.name = 'InvalidTransitionError'
  }
}

export function canTransition(from: InstanceState, event: InstanceEvent): boolean {
  return TRANSITIONS[from][event] !== undefined
}

export function nextState(from: InstanceState, event: InstanceEvent): InstanceState {
  const to = TRANSITIONS[from][event]
  if (to === undefined) throw new InvalidTransitionError(from, event)
  return to
}

export interface IdlePolicy {
  action: 'destroy' | 'hibernate' | 'none'
  afterMinutes: number | null
}

/** §11's lifetime table, as data. Enforced by whoever runs the reaper (P4). */
export const IDLE_POLICY: Readonly<
  Record<'sandbox' | 'staging' | 'production', IdlePolicy>
> = Object.freeze({
  sandbox: { action: 'destroy', afterMinutes: 45 },
  staging: { action: 'hibernate', afterMinutes: 60 * 24 * 7 },
  production: { action: 'none', afterMinutes: null },
})
```

- [ ] **Step 4: Re-export and run the tests**

Add to `packages/control-plane/src/runtime/index.ts`:

```ts
export * from './state-machine.js'
```

```bash
pnpm --filter @manifest/control-plane test src/runtime/
```

Expected: PASS — 7 state-machine tests plus Task 10's 11 contract tests.

- [ ] **Step 5: Prove the drift test has teeth**

Delete the `gone: {}` line from `TRANSITIONS` and add `// @ts-expect-error` above the
object so it still compiles. Run the tests again.

Expected: **FAIL** on *"has an entry for every state the driver interface declares"* —
and only that test. Restore the line and confirm green.

This is the control that matters in this task. Without it, a state added to
`driver.ts` in P3 gets a silently missing table entry, and `TRANSITIONS[from]` returns
`undefined` at the first call site that reaches it.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/runtime/
git commit -m "feat(runtime): §11 instance state machine with a drift test against InstanceState"
```

---

## Task 12: Configuration, and the dev-auth kill switch

**Files:**
- Create: `packages/control-plane/src/config.ts`
- Test: `packages/control-plane/src/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Config` — the parsed, validated environment
  - `loadConfig(env?: NodeJS.ProcessEnv): Config` — throws `ConfigError`
  - `class ConfigError` with `code`
  - `zoneFor(config: Config, kind: 'sandbox' | 'staging' | 'production'): string`

**This task discharges the first half of roadmap gap 3.** P2 needs a login it cannot
have — the Manifest IdP lands in P4 — so Task 13 ships a dev-only auth shim. The
roadmap's resolution names two safeguards, *because a temporary shim is exactly the
kind of thing that survives quietly*. This is the first: **the service refuses to
start** if the shim is enabled outside development. The second is its test, below.

**Stricter than the roadmap's wording, deliberately.** The roadmap says refuse when
`MANIFEST_ENV` is `staging` or `production`. This refuses when it is anything other
than `development`, so a new environment kind added later fails closed rather than
inheriting the shim.

**Zones come from configuration, never from the app (§23).** Three settings, one per
environment kind. The only app-supplied part of any hostname is the slug, which §7 has
already validated as `^[a-z][a-z0-9-]{2,38}$` — so nothing free-text can steer a
hostname. Defaults here are the laptop values S7 verified.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, zoneFor } from './config.js'

const base = {
  MANIFEST_DATABASE_URL: 'postgres://manifest:manifest@127.0.0.1:7103/manifest_control_plane',
  MANIFEST_SESSION_SECRET: 'x'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
}

describe('configuration', () => {
  it('parses a development environment and defaults the port to 7100', () => {
    const config = loadConfig({ ...base, MANIFEST_ENV: 'development', MANIFEST_DEV_AUTH: '1' })
    expect(config.env).toBe('development')
    expect(config.devAuth).toBe(true)
    expect(config.port).toBe(7100)
  })

  it('refuses to start with dev auth enabled in production', () => {
    expect(() =>
      loadConfig({ ...base, MANIFEST_ENV: 'production', MANIFEST_DEV_AUTH: '1' }),
    ).toThrow(ConfigError)
    try {
      loadConfig({ ...base, MANIFEST_ENV: 'production', MANIFEST_DEV_AUTH: '1' })
    } catch (error) {
      expect((error as ConfigError).code).toBe('CONFIG_DEV_AUTH_OUTSIDE_DEVELOPMENT')
    }
  })

  it('refuses to start with dev auth enabled in staging', () => {
    expect(() =>
      loadConfig({ ...base, MANIFEST_ENV: 'staging', MANIFEST_DEV_AUTH: '1' }),
    ).toThrow(ConfigError)
  })

  it('starts in production when dev auth is off', () => {
    const config = loadConfig({ ...base, MANIFEST_ENV: 'production', MANIFEST_DEV_AUTH: '0' })
    expect(config.devAuth).toBe(false)
  })

  it('refuses a session secret shorter than 32 characters', () => {
    expect(() =>
      loadConfig({ ...base, MANIFEST_SESSION_SECRET: 'too-short', MANIFEST_ENV: 'development' }),
    ).toThrow(ConfigError)
  })

  it('derives §23 zones per environment kind, one setting each', () => {
    const config = loadConfig({ ...base, MANIFEST_ENV: 'development' })
    expect(zoneFor(config, 'sandbox')).toBe('sandbox.manifest.internal')
    expect(zoneFor(config, 'staging')).toBe('staging.manifest.internal')
    expect(zoneFor(config, 'production')).toBe('manifest.internal')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/config
```

Expected: FAIL — `Cannot find module './config.js'`.

- [ ] **Step 3: Write the configuration module**

`packages/control-plane/src/config.ts`:

```ts
import { z } from 'zod'

export class ConfigError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}

const envSchema = z.object({
  MANIFEST_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  MANIFEST_DATABASE_URL: z.string().min(1),
  MANIFEST_PORT: z.coerce.number().int().min(1).max(65535).default(7100),
  // 32 chars is the HMAC-SHA256 block floor we are willing to accept for a
  // session secret; shorter is a configuration mistake, not a preference.
  MANIFEST_SESSION_SECRET: z.string().min(32),
  MANIFEST_DEV_AUTH: z.enum(['0', '1']).default('0'),
  MANIFEST_BLUEPRINTS_ROOT: z.string().min(1),
  MANIFEST_REPOS_ROOT: z.string().min(1),
  // §23: one zone setting per environment kind. Laptop defaults, verified in S7.
  MANIFEST_ZONE_SANDBOX: z.string().min(1).default('sandbox.manifest.internal'),
  MANIFEST_ZONE_STAGING: z.string().min(1).default('staging.manifest.internal'),
  MANIFEST_ZONE_PRODUCTION: z.string().min(1).default('manifest.internal'),
})

export interface Config {
  env: 'development' | 'staging' | 'production'
  databaseUrl: string
  port: number
  sessionSecret: string
  devAuth: boolean
  blueprintsRoot: string
  reposRoot: string
  zones: { sandbox: string; staging: string; production: string }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new ConfigError('CONFIG_INVALID', `invalid configuration — ${detail}`)
  }

  const raw = parsed.data
  const devAuth = raw.MANIFEST_DEV_AUTH === '1'

  // Roadmap gap 3, safeguard 1. The shim mints a session for a named test user
  // with no credential of any kind; outside development that is a total
  // authentication bypass. Fail closed on anything that is not `development`.
  if (devAuth && raw.MANIFEST_ENV !== 'development') {
    throw new ConfigError(
      'CONFIG_DEV_AUTH_OUTSIDE_DEVELOPMENT',
      `MANIFEST_DEV_AUTH is enabled while MANIFEST_ENV is '${raw.MANIFEST_ENV}'. ` +
        'The dev auth shim is an authentication bypass and may only run in development. ' +
        'P4 replaces it with real CWL and deletes it.',
    )
  }

  return {
    env: raw.MANIFEST_ENV,
    databaseUrl: raw.MANIFEST_DATABASE_URL,
    port: raw.MANIFEST_PORT,
    sessionSecret: raw.MANIFEST_SESSION_SECRET,
    devAuth,
    blueprintsRoot: raw.MANIFEST_BLUEPRINTS_ROOT,
    reposRoot: raw.MANIFEST_REPOS_ROOT,
    zones: {
      sandbox: raw.MANIFEST_ZONE_SANDBOX,
      staging: raw.MANIFEST_ZONE_STAGING,
      production: raw.MANIFEST_ZONE_PRODUCTION,
    },
  }
}

export function zoneFor(
  config: Config,
  kind: 'sandbox' | 'staging' | 'production',
): string {
  return config.zones[kind]
}

/** §23: `<slug>.<zone for that environment kind>`. The slug is the only app input. */
export function hostnameFor(
  config: Config,
  kind: 'sandbox' | 'staging' | 'production',
  slug: string,
): string {
  return `${slug}.${zoneFor(config, kind)}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/config
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the kill switch has teeth**

Comment out the `if (devAuth && raw.MANIFEST_ENV !== 'development')` block and run the
tests again.

Expected: **FAIL** on *"refuses to start with dev auth enabled in production"* and
*"refuses to start with dev auth enabled in staging"*. Restore it and confirm green.

A guard that has never been observed failing is a guard nobody has tested. Record this
in the commit message so the next reader knows the control was exercised, not assumed.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/config.ts packages/control-plane/src/config.test.ts
git commit -m "feat(config): typed configuration and the dev-auth kill switch (roadmap gap 3)

The guard was verified by removing it and watching both guard tests fail."
```

---

## Task 13: Sessions and the dev-only auth shim

**Files:**
- Create: `packages/control-plane/src/identity/session.ts`
- Create: `packages/control-plane/src/identity/dev-auth.ts`
- Create: `packages/control-plane/src/identity/index.ts`
- Test: `packages/control-plane/src/identity/session.test.ts`
- Test: `packages/control-plane/src/identity/dev-auth.test.ts`

**Interfaces:**
- Consumes: `Db`, `users` (Task 8); `Config` (Task 12).
- Produces:
  - `interface Session { userId, puid, role, issuedAt, expiresAt }`
  - `SESSION_COOKIE`, `SESSION_TTL_MS`
  - `issueSession(user, now?): Session`
  - `signSession(session, secret): string`
  - `verifySession(token, secret, now?): Session | null`
  - `DEV_USERS` — the three seeded test identities
  - `devLogin(db, puid, opts): Promise<{ user: User; session: Session }>`
  - `class DevAuthDisabledError`, `class UnknownDevUserError`

**This discharges the second half of roadmap gap 3.** §17 puts the authorization
contract suite in 1a, but the Manifest IdP lands in 1b — so 1a needs a login it cannot
have. The resolution is a shim that mints a session for a *named* test user, gated
behind `MANIFEST_DEV_AUTH`, with Task 12's kill switch behind it. **P4 carries an
explicit task to delete this module**, and the two safeguards exist because a
temporary shim is exactly the kind of thing that survives quietly.

**Why a signed cookie and not a `sessions` table.** D23.4 requires *"an interactive
session cookie for browsers"*, and a signed, expiring payload needs no schema, no
cleanup job and no migration. See *Decisions this plan makes*, item 1, for what
changing course would cost.

**Why the shim will not mint a session for an arbitrary string.** It accepts only the
three PUIDs in `DEV_USERS`. An endpoint that turns any text into a session is a
different and much worse thing than an endpoint that logs in `bio_prof`, and the
difference costs one lookup.

- [ ] **Step 1: Write the failing session test**

`packages/control-plane/src/identity/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SESSION_TTL_MS, issueSession, signSession, verifySession } from './session.js'

const SECRET = 'k'.repeat(32)
const NOW = 1_700_000_000_000

const user = { id: 'user-1', ubcCwlPuid: 'bio_prof', role: 'member' as const }

describe('sessions', () => {
  it('signs and verifies a round trip', () => {
    const token = signSession(issueSession(user, NOW), SECRET)
    const session = verifySession(token, SECRET, NOW + 1000)
    expect(session).not.toBeNull()
    expect(session?.userId).toBe('user-1')
    expect(session?.puid).toBe('bio_prof')
    expect(session?.role).toBe('member')
  })

  it('rejects a tampered payload', () => {
    const token = signSession(issueSession({ ...user, role: 'member' }, NOW), SECRET)
    const [payload, mac] = token.split('.') as [string, string]
    // Re-encode the payload claiming admin, keeping the original signature.
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), role: 'admin' }),
    ).toString('base64url')
    expect(verifySession(`${forged}.${mac}`, SECRET, NOW + 1000)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = signSession(issueSession(user, NOW), 'other-secret-that-is-long-enough')
    expect(verifySession(token, SECRET, NOW + 1000)).toBeNull()
  })

  it('rejects an expired session', () => {
    const token = signSession(issueSession(user, NOW), SECRET)
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_MS + 1)).toBeNull()
  })

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', 'nodot', 'a.b.c', '.', 'not-base64!.mac']) {
      expect(verifySession(bad, SECRET, NOW)).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/identity/
```

Expected: FAIL — `Cannot find module './session.js'`.

- [ ] **Step 3: Write the session module**

`packages/control-plane/src/identity/session.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'manifest_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export interface Session {
  userId: string
  puid: string
  role: 'admin' | 'member'
  /** epoch milliseconds */
  issuedAt: number
  /** epoch milliseconds */
  expiresAt: number
}

export function issueSession(
  user: { id: string; ubcCwlPuid: string; role: 'admin' | 'member' },
  now: number = Date.now(),
): Session {
  return {
    userId: user.id,
    puid: user.ubcCwlPuid,
    role: user.role,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  }
}

function mac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signSession(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  return `${payload}.${mac(payload, secret)}`
}

/**
 * Returns null for anything that is not a currently valid session — a bad
 * signature, a tampered payload, an expired session, or malformed input.
 * It never throws, because it runs on untrusted request data.
 */
export function verifySession(
  token: string,
  secret: string,
  now: number = Date.now(),
): Session | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts as [string, string]
  if (payload.length === 0 || signature.length === 0) return null

  const expected = mac(payload, secret)
  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  let session: Session
  try {
    session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session
  } catch {
    return null
  }
  if (typeof session.expiresAt !== 'number' || session.expiresAt <= now) return null
  if (session.role !== 'admin' && session.role !== 'member') return null
  if (typeof session.userId !== 'string' || session.userId.length === 0) return null
  return session
}
```

- [ ] **Step 4: Write the failing dev-auth test**

`packages/control-plane/src/identity/dev-auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { withRollback } from '../db/testing.js'
import { users } from '../db/index.js'
import { DevAuthDisabledError, UnknownDevUserError, devLogin } from './dev-auth.js'

describe('the dev auth shim (roadmap gap 3)', () => {
  it('creates the test user on first login', async () => {
    await withRollback(async (db) => {
      const { user, session } = await devLogin(db, 'bio_prof', { devAuthEnabled: true })
      expect(user.ubcCwlPuid).toBe('bio_prof')
      expect(session.userId).toBe(user.id)
      const rows = await db.select().from(users).where(eq(users.ubcCwlPuid, 'bio_prof'))
      expect(rows).toHaveLength(1)
    })
  })

  it('is idempotent — the second login returns the same user', async () => {
    await withRollback(async (db) => {
      const first = await devLogin(db, 'bio_prof', { devAuthEnabled: true })
      const second = await devLogin(db, 'bio_prof', { devAuthEnabled: true })
      expect(second.user.id).toBe(first.user.id)
      const rows = await db.select().from(users).where(eq(users.ubcCwlPuid, 'bio_prof'))
      expect(rows).toHaveLength(1)
    })
  })

  it('seeds the platform admin with the admin role', async () => {
    await withRollback(async (db) => {
      const { user, session } = await devLogin(db, 'platform_admin', { devAuthEnabled: true })
      expect(user.role).toBe('admin')
      expect(session.role).toBe('admin')
    })
  })

  it('refuses when dev auth is disabled', async () => {
    await withRollback(async (db) => {
      await expect(devLogin(db, 'bio_prof', { devAuthEnabled: false })).rejects.toThrow(
        DevAuthDisabledError,
      )
    })
  })

  it('refuses a PUID that is not one of the seeded test users', async () => {
    await withRollback(async (db) => {
      await expect(
        devLogin(db, 'someone-i-invented', { devAuthEnabled: true }),
      ).rejects.toThrow(UnknownDevUserError)
    })
  })
})
```

- [ ] **Step 5: Write the dev-auth shim**

`packages/control-plane/src/identity/dev-auth.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { users } from '../db/index.js'
import { type Session, issueSession } from './session.js'

/**
 * TEMPORARY (roadmap gap 3). P4 replaces this with real CWL against the Manifest
 * IdP and carries an explicit task to delete this file. Two safeguards keep it
 * from surviving quietly: config.ts refuses to start with it enabled outside
 * development, and a test asserts that refusal.
 *
 * The test identities are §9's `bio_prof` and `bio_student`, plus two the
 * authorization contract suite needs and §9 does not name: a platform admin, and
 * an unrelated user who is a member of nothing. §16's tier is "owner, collaborator,
 * unrelated user, and admin" — four distinct actors, so four distinct identities.
 * Reusing one identity for two tiers is how a suite comes to assert nothing.
 */
export const DEV_USERS = Object.freeze([
  {
    puid: 'bio_prof',
    email: 'bio_prof@example.ubc.ca',
    displayName: 'Bio Prof',
    role: 'member',
  },
  {
    puid: 'bio_student',
    email: 'bio_student@example.ubc.ca',
    displayName: 'Bio Student',
    role: 'member',
  },
  {
    puid: 'unrelated_user',
    email: 'unrelated_user@example.ubc.ca',
    displayName: 'Unrelated User',
    role: 'member',
  },
  {
    puid: 'platform_admin',
    email: 'platform_admin@example.ubc.ca',
    displayName: 'Platform Admin',
    role: 'admin',
  },
] as const)

export class DevAuthDisabledError extends Error {
  readonly code = 'DEV_AUTH_DISABLED'
  constructor() {
    super('the dev auth shim is disabled; set MANIFEST_DEV_AUTH=1 in development')
    this.name = 'DevAuthDisabledError'
  }
}

export class UnknownDevUserError extends Error {
  readonly code = 'DEV_AUTH_UNKNOWN_USER'
  constructor(puid: string) {
    super(
      `'${puid}' is not a seeded test user. The shim logs in a named identity, ` +
        `not an arbitrary one: ${DEV_USERS.map((u) => u.puid).join(', ')}`,
    )
    this.name = 'UnknownDevUserError'
  }
}

export type DevUser = typeof users.$inferSelect

export async function devLogin(
  db: Db,
  puid: string,
  opts: { devAuthEnabled: boolean },
  now: number = Date.now(),
): Promise<{ user: DevUser; session: Session }> {
  if (!opts.devAuthEnabled) throw new DevAuthDisabledError()

  const seed = DEV_USERS.find((candidate) => candidate.puid === puid)
  if (!seed) throw new UnknownDevUserError(puid)

  await db
    .insert(users)
    .values({
      ubcCwlPuid: seed.puid,
      email: seed.email,
      displayName: seed.displayName,
      role: seed.role,
    })
    .onConflictDoUpdate({
      target: users.ubcCwlPuid,
      set: { email: seed.email, displayName: seed.displayName, role: seed.role },
    })

  const [user] = await db.select().from(users).where(eq(users.ubcCwlPuid, seed.puid))
  if (!user) throw new Error(`dev login upserted '${seed.puid}' but could not read it back`)

  return { user, session: issueSession(user, now) }
}
```

`packages/control-plane/src/identity/index.ts`:

```ts
export * from './session.js'
export * from './dev-auth.js'
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/identity/
```

Expected: PASS — 5 session tests, 5 dev-auth tests.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/identity/
git commit -m "feat(identity): signed session cookies and the dev-only auth shim (roadmap gap 3)"
```

---

## Task 14: Projects, members and the authorization model

**Files:**
- Create: `packages/control-plane/src/projects/authz.ts`
- Create: `packages/control-plane/src/projects/repository.ts`
- Create: `packages/control-plane/src/projects/index.ts`
- Test: `packages/control-plane/src/projects/authz.test.ts`
- Test: `packages/control-plane/src/projects/repository.test.ts`

**Interfaces:**
- Consumes: `Db`, `projects`, `projectMembers`, `users`, `environments` (Task 8); `Config`, `hostnameFor` (Task 12).
- Produces:
  - `type Capability` — the nine things a request can want to do
  - `type ProjectRole = 'owner' | 'collaborator'`
  - `interface Actor { userId: string; platformRole: 'admin' | 'member' }`
  - `capabilitiesFor(projectRole: ProjectRole | null, platformRole: 'admin' | 'member'): ReadonlySet<Capability>`
  - `assertCapability(db, actor, projectId, capability): Promise<void>` — throws `AuthorizationError`
  - `class AuthorizationError` with `code: 'FORBIDDEN' | 'NOT_FOUND'`
  - `createProject(db, config, input): Promise<{ project: Project; environments: Environment[] }>`
  - `listProjectsFor(db, actor): Promise<Project[]>`
  - `getProject(db, projectId): Promise<Project | undefined>`
  - `addMember(db, projectId, userId, role): Promise<void>`

**Why authorization is a module and not a middleware detail.** §16 makes tenant
isolation a *test tier*: *"IDOR is the likeliest bug class in a multi-tenant control
plane, so tenant isolation is a test tier rather than a code-review hope."* A route
that forgets its check is the whole failure mode, so the capability set lives in one
pure function that Task 20's contract suite exercises against every route.

**The roles are §13's, exactly.** Platform admin approves releases, sets quotas,
manages blueprints and the model catalogue, and sees the whole fleet. Project owner
has full control of their own project. Collaborator is *"same as owner except member
management and deletion."*

**An unrelated user gets `NOT_FOUND`, not `FORBIDDEN`.** Answering "you may not touch
project X" confirms that project X exists, which is an enumeration oracle across
tenants. A member who lacks a capability gets `FORBIDDEN`, because they already know
the project exists. Task 20 asserts both codes, not merely that both were refused —
a suite that only checked "did not succeed" would pass on a server that leaked
existence to the whole internet.

**Three environments are created with the project.** §23: *"Every project has a
production canonical hostname from the moment it exists, and it never changes."* §13
wants `LaunchReadiness` surfaced *"the moment a project is created — not at the point
the owner asks to go live"*, and neither is possible if the production environment
row appears only at first deploy.

> **Spec action for Rich — a §11/§23 disagreement, not a decision this plan should
> make.** §11's lifetime table gives sandbox the hostname `{slug}-sbx-{id}` and
> staging `{slug}-staging`, i.e. a suffixed label in one zone. §23 gives
> `<slug>.<zone for that environment kind>` with a separate zone per kind, and says
> explicitly *"One sandbox environment per project at a time, so its hostname is
> stable and predictable"* — no id suffix. These cannot both be right. **This plan
> follows §23**, because that is the section whose stated job is to settle *"what the
> names are"*, it is the more specific rule, and S7 verified all three
> `manifest.internal` names serving under a wildcard certificate. Proposed change:
> replace §11's hostname row with a pointer to §23. Flagged, not applied.

- [ ] **Step 1: Write the failing authorization test**

`packages/control-plane/src/projects/authz.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AuthorizationError, assertCapability, capabilitiesFor } from './authz.js'
import { createProject } from './repository.js'
import { withRollback } from '../db/testing.js'
import { users } from '../db/index.js'
import { loadConfig } from '../config.js'

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

describe('the capability model (§13 roles)', () => {
  it('gives an owner everything except approval and quota', () => {
    const caps = capabilitiesFor('owner', 'member')
    expect(caps.has('project:write')).toBe(true)
    expect(caps.has('project:delete')).toBe(true)
    expect(caps.has('members:manage')).toBe(true)
    expect(caps.has('release:deploy')).toBe(true)
    expect(caps.has('release:approve')).toBe(false)
    expect(caps.has('quota:set')).toBe(false)
  })

  it('gives a collaborator everything an owner has except membership and deletion', () => {
    const owner = capabilitiesFor('owner', 'member')
    const collaborator = capabilitiesFor('collaborator', 'member')
    for (const cap of collaborator) expect(owner.has(cap)).toBe(true)
    expect(collaborator.has('members:manage')).toBe(false)
    expect(collaborator.has('project:delete')).toBe(false)
    expect(collaborator.has('build:create')).toBe(true)
  })

  it('gives an unrelated user nothing', () => {
    expect(capabilitiesFor(null, 'member').size).toBe(0)
  })

  it('gives a platform admin the fleet-wide capabilities without membership', () => {
    const admin = capabilitiesFor(null, 'admin')
    expect(admin.has('project:read')).toBe(true)
    expect(admin.has('release:approve')).toBe(true)
    expect(admin.has('quota:set')).toBe(true)
  })
})

describe('assertCapability', () => {
  async function seed(db: Parameters<typeof createProject>[0]) {
    const [owner] = await db
      .insert(users)
      .values({ ubcCwlPuid: 'owner', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
      .returning()
    const [stranger] = await db
      .insert(users)
      .values({ ubcCwlPuid: 'stranger', email: 's@ubc.ca', displayName: 'S', role: 'member' })
      .returning()
    const { project } = await createProject(db, config, {
      slug: 'chem-labs',
      ownerId: owner!.id,
      blueprintRef: 'fixture-node@1',
    })
    return { owner: owner!, stranger: stranger!, project }
  }

  it('allows the owner', async () => {
    await withRollback(async (db) => {
      const { owner, project } = await seed(db)
      await expect(
        assertCapability(db, { userId: owner.id, platformRole: 'member' }, project.id, 'project:write'),
      ).resolves.toBeUndefined()
    })
  })

  it('hides the project from an unrelated user with NOT_FOUND, not FORBIDDEN', async () => {
    await withRollback(async (db) => {
      const { stranger, project } = await seed(db)
      try {
        await assertCapability(
          db, { userId: stranger.id, platformRole: 'member' }, project.id, 'project:read',
        )
        throw new Error('expected the check to refuse')
      } catch (error) {
        expect(error).toBeInstanceOf(AuthorizationError)
        expect((error as AuthorizationError).code).toBe('NOT_FOUND')
      }
    })
  })

  it('refuses a member who lacks the capability with FORBIDDEN', async () => {
    await withRollback(async (db) => {
      const { owner, project } = await seed(db)
      try {
        await assertCapability(
          db, { userId: owner.id, platformRole: 'member' }, project.id, 'release:approve',
        )
        throw new Error('expected the check to refuse')
      } catch (error) {
        expect((error as AuthorizationError).code).toBe('FORBIDDEN')
      }
    })
  })

  it('returns NOT_FOUND for a project that does not exist', async () => {
    await withRollback(async (db) => {
      const { owner } = await seed(db)
      await expect(
        assertCapability(
          db,
          { userId: owner.id, platformRole: 'member' },
          '00000000-0000-0000-0000-000000000000',
          'project:read',
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/projects/
```

Expected: FAIL — `Cannot find module './authz.js'`.

- [ ] **Step 3: Write the authorization model**

`packages/control-plane/src/projects/authz.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { projectMembers, projects } from '../db/index.js'

export type ProjectRole = 'owner' | 'collaborator'

export type Capability =
  | 'project:read'
  | 'project:write'
  | 'project:delete'
  | 'members:manage'
  | 'build:create'
  | 'release:create'
  | 'release:deploy'
  | 'release:approve'
  | 'quota:set'

/** Who is asking. Carried from the session; never read from the request body. */
export interface Actor {
  userId: string
  platformRole: 'admin' | 'member'
}

const OWNER: readonly Capability[] = [
  'project:read', 'project:write', 'project:delete', 'members:manage',
  'build:create', 'release:create', 'release:deploy',
]

// §13: "same as owner except member management and deletion"
const COLLABORATOR: readonly Capability[] = OWNER.filter(
  (cap) => cap !== 'members:manage' && cap !== 'project:delete',
)

// §13: the platform admin approves releases, sets quotas, and sees the whole fleet.
const PLATFORM_ADMIN: readonly Capability[] = [...OWNER, 'release:approve', 'quota:set']

export function capabilitiesFor(
  projectRole: ProjectRole | null,
  platformRole: 'admin' | 'member',
): ReadonlySet<Capability> {
  if (platformRole === 'admin') return new Set(PLATFORM_ADMIN)
  if (projectRole === 'owner') return new Set(OWNER)
  if (projectRole === 'collaborator') return new Set(COLLABORATOR)
  return new Set()
}

export class AuthorizationError extends Error {
  constructor(
    readonly code: 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export async function membershipOf(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  return row?.role ?? null
}

/**
 * Throws NOT_FOUND when the actor has no business knowing the project exists, and
 * FORBIDDEN when they are a member who lacks this particular capability.
 *
 * The distinction is deliberate: answering FORBIDDEN to a stranger confirms the
 * project exists and turns the id space into an enumeration oracle across tenants.
 */
export async function assertCapability(
  db: Db,
  actor: Actor,
  projectId: string,
  capability: Capability,
): Promise<void> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId))
  if (!project) {
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  }

  const projectRole = actor.platformRole === 'admin' ? null : await membershipOf(db, actor.userId, projectId)
  if (actor.platformRole !== 'admin' && projectRole === null) {
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  }

  if (!capabilitiesFor(projectRole, actor.platformRole).has(capability)) {
    throw new AuthorizationError(
      'FORBIDDEN',
      `role '${projectRole ?? actor.platformRole}' may not '${capability}'`,
    )
  }
}
```

- [ ] **Step 4: Write the failing repository test**

`packages/control-plane/src/projects/repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { withRollback } from '../db/testing.js'
import { users } from '../db/index.js'
import { loadConfig } from '../config.js'
import { createProject, getProject, listProjectsFor } from './repository.js'

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

describe('project creation', () => {
  it('creates the project, the owner membership and all three environments', async () => {
    await withRollback(async (db) => {
      const [owner] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'o', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
        .returning()
      const { project, environments } = await createProject(db, config, {
        slug: 'chem-labs',
        ownerId: owner!.id,
        blueprintRef: 'fixture-node@1',
      })

      expect(project.slug).toBe('chem-labs')
      expect(environments.map((e) => e.kind).sort()).toEqual(['production', 'sandbox', 'staging'])

      // §23: <slug>.<zone for that environment kind>. One label deep, every time.
      const byKind = Object.fromEntries(environments.map((e) => [e.kind, e.hostname]))
      expect(byKind.sandbox).toBe('chem-labs.sandbox.manifest.internal')
      expect(byKind.staging).toBe('chem-labs.staging.manifest.internal')
      expect(byKind.production).toBe('chem-labs.manifest.internal')

      const owned = await listProjectsFor(db, { userId: owner!.id, platformRole: 'member' })
      expect(owned.map((p) => p.slug)).toEqual(['chem-labs'])
    })
  })

  it('lists only the projects a member belongs to', async () => {
    await withRollback(async (db) => {
      const [owner] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'o2', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
        .returning()
      const [stranger] = await db
        .insert(users)
        .values({ ubcCwlPuid: 's2', email: 's@ubc.ca', displayName: 'S', role: 'member' })
        .returning()
      await createProject(db, config, {
        slug: 'chem-labs', ownerId: owner!.id, blueprintRef: 'fixture-node@1',
      })

      expect(await listProjectsFor(db, { userId: stranger!.id, platformRole: 'member' })).toEqual([])
      // A platform admin sees the whole fleet (§13).
      const asAdmin = await listProjectsFor(db, { userId: stranger!.id, platformRole: 'admin' })
      expect(asAdmin.map((p) => p.slug)).toEqual(['chem-labs'])
    })
  })

  it('rejects a slug §7 would not accept, before it can reach a hostname', async () => {
    await withRollback(async (db) => {
      const [owner] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'o3', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
        .returning()
      for (const slug of ['Chem-Labs', 'ab', '-leading', 'has_underscore', 'a'.repeat(60)]) {
        await expect(
          createProject(db, config, { slug, ownerId: owner!.id, blueprintRef: 'fixture-node@1' }),
        ).rejects.toThrow(/slug/i)
      }
    })
  })

  it('returns undefined for a project that does not exist', async () => {
    await withRollback(async (db) => {
      expect(await getProject(db, '00000000-0000-0000-0000-000000000000')).toBeUndefined()
    })
  })
})
```

- [ ] **Step 5: Write the repository**

`packages/control-plane/src/projects/repository.ts`:

```ts
import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { environments, projectMembers, projects } from '../db/index.js'
import { type Config, hostnameFor } from '../config.js'
import type { Actor } from './authz.js'

export type Project = typeof projects.$inferSelect
export type Environment = typeof environments.$inferSelect

/**
 * §7's name rule, restated where a slug becomes a hostname. `spec/` validates the
 * name inside manifest.yaml; this validates the slug the API was handed, which is
 * a different input arriving by a different path. §23 depends on this holding:
 * "nothing free-text reaches a hostname".
 */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

const ENVIRONMENT_KINDS = ['sandbox', 'staging', 'production'] as const

export interface CreateProjectInput {
  slug: string
  ownerId: string
  blueprintRef: string
}

export async function createProject(
  db: Db,
  config: Config,
  input: CreateProjectInput,
): Promise<{ project: Project; environments: Environment[] }> {
  if (!SLUG.test(input.slug)) {
    throw new Error(
      `invalid project slug '${input.slug}' — must match ${SLUG.source} (§7)`,
    )
  }

  const [project] = await db
    .insert(projects)
    .values({ slug: input.slug, ownerId: input.ownerId, blueprintRef: input.blueprintRef })
    .returning()
  if (!project) throw new Error('project insert returned no row')

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: input.ownerId,
    role: 'owner',
  })

  // All three exist from the moment the project does. §23 requires the production
  // canonical hostname to be permanent, and §13 requires LaunchReadiness to be
  // visible "the moment a project is created", not at first deploy.
  const created = await db
    .insert(environments)
    .values(
      ENVIRONMENT_KINDS.map((kind) => ({
        projectId: project.id,
        kind,
        hostname: hostnameFor(config, kind, project.slug),
      })),
    )
    .returning()

  return { project, environments: created }
}

export async function getProject(db: Db, projectId: string): Promise<Project | undefined> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  return project
}

/** A platform admin sees the whole fleet (§13); everyone else sees their memberships. */
export async function listProjectsFor(db: Db, actor: Actor): Promise<Project[]> {
  if (actor.platformRole === 'admin') return db.select().from(projects)

  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, actor.userId))
  const ids = memberships.map((m) => m.projectId)
  if (ids.length === 0) return []
  return db.select().from(projects).where(inArray(projects.id, ids))
}

/**
 * Idempotent by conflict target, so a retried invitation updates the role rather
 * than violating the (project, user) primary key. D23.6 covers the HTTP replay; this
 * covers the same action arriving twice by any other route.
 */
export async function addMember(
  db: Db,
  projectId: string,
  userId: string,
  role: 'owner' | 'collaborator',
): Promise<void> {
  await db
    .insert(projectMembers)
    .values({ projectId, userId, role })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role },
    })
}

export async function listEnvironments(db: Db, projectId: string): Promise<Environment[]> {
  return db.select().from(environments).where(eq(environments.projectId, projectId))
}
```

`packages/control-plane/src/projects/index.ts`:

```ts
export * from './authz.js'
export * from './repository.js'
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/projects/
```

Expected: PASS — 4 capability tests, 4 `assertCapability` tests, 4 repository tests.

- [ ] **Step 7: Prove the tenant-isolation test has teeth**

In `assertCapability`, change the stranger branch to throw `FORBIDDEN` instead of
`NOT_FOUND`. Run the tests again.

Expected: **FAIL** on *"hides the project from an unrelated user with NOT_FOUND, not
FORBIDDEN"*. Restore it and confirm green.

Note what this demonstrates: a suite asserting only *"the request was refused"* stays
green through this change, and the server leaks project existence to every
authenticated user. Asserting the **shape** of the refusal is what catches it.

- [ ] **Step 8: Commit**

```bash
git add packages/control-plane/src/projects/
git commit -m "feat(projects): §13 capability model, tenant-safe checks, and project provisioning"
```

---

## Task 15: The source driver — local bare repositories

**Files:**
- Create: `packages/control-plane/src/source/git-driver.ts`
- Create: `packages/control-plane/src/source/local-driver.ts`
- Create: `packages/control-plane/src/source/index.ts`
- Test: `packages/control-plane/src/source/local-driver.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (deliberately — see below).
- Produces:
  - `interface RepoRef { projectSlug: string; path: string; url: string }`
  - `interface SourceDriver` — `createRepository`, `headCommit`, `readFile`, `listBranches`, `destroyRepository`
  - `createLocalSourceDriver(root: string): SourceDriver`
  - `class SourceError` with `code`

**D5, driver 1.** *"Git access is behind a provider interface; driver 1 is local bare
repos, driver 2 is a UBC GitHub org."* The interface is the deliverable; the local
implementation is one of two. C1 is the reason: *"the laptop build needs no GitHub
org, no tokens, no webhook tunnel."*

**Why this module imports nothing from `spec/`.** It re-implements the slug check
rather than importing §7's regex. `source/` is handed a slug and turns it into a
**filesystem path**; treating that as trusted because some other module validated some
other string is how directory traversal happens. §20's git driver requirement — a
sandbox *"cannot reach another project's repository"* — rests on this check, so it
belongs here even though it duplicates four characters of regex.

**Why `readFile` takes a commit.** The builder resolves a bare repo at a commit (S1
Evidence 1), and the spec that is validated must be the spec at the commit being
built, not whatever is in a working tree. There is no working tree here; a bare repo
has none, which is the point.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/source/local-driver.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SourceError, createLocalSourceDriver } from './local-driver.js'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'manifest-source-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const seed = {
  'manifest.yaml': 'manifest: 1\nname: chem-labs\nblueprint: fixture-node@1\nruntime:\n  port: 3000\n',
  'src/index.js': "console.log('hello')\n",
}

describe('the local bare-repo source driver (D5 driver 1)', () => {
  it('creates a bare repository seeded with the blueprint skeleton', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)

    expect(repo.projectSlug).toBe('chem-labs')
    expect((await stat(join(repo.path, 'HEAD'))).isFile()).toBe(true)

    const sha = await driver.headCommit(repo)
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    expect(await driver.readFile(repo, sha, 'manifest.yaml')).toContain('name: chem-labs')
    expect(await driver.readFile(repo, sha, 'src/index.js')).toContain('hello')
  })

  it('returns null for a path that is not in the tree', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    const sha = await driver.headCommit(repo)
    expect(await driver.readFile(repo, sha, 'not-there.yaml')).toBeNull()
  })

  // Reads happen AT a commit. A driver that shelled out to the working tree would
  // pass every other test here and silently build the wrong source.
  it('reads a file as it was at an older commit, not as it is at HEAD', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    const first = await driver.headCommit(repo)

    await driver.commitFiles(repo, { 'manifest.yaml': 'manifest: 1\nname: renamed\n' }, 'edit')
    const second = await driver.headCommit(repo)

    expect(second).not.toBe(first)
    expect(await driver.readFile(repo, first, 'manifest.yaml')).toContain('name: chem-labs')
    expect(await driver.readFile(repo, second, 'manifest.yaml')).toContain('name: renamed')
  })

  it('lists the default branch', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    expect(await driver.listBranches(repo)).toEqual(['main'])
  })

  it('refuses a slug that would escape the repository root', async () => {
    const driver = createLocalSourceDriver(root)
    for (const slug of ['../escape', 'a/b', '..', '.', 'Chem', 'has_underscore', '']) {
      await expect(driver.createRepository(slug, seed)).rejects.toThrow(SourceError)
    }
  })

  it('refuses to open a repository it did not create', async () => {
    const driver = createLocalSourceDriver(root)
    await expect(
      driver.headCommit({ projectSlug: 'ghost', path: '/etc', url: 'file:///etc' }),
    ).rejects.toThrow(SourceError)
  })

  it('destroys a repository', async () => {
    const driver = createLocalSourceDriver(root)
    const repo = await driver.createRepository('chem-labs', seed)
    await driver.destroyRepository(repo)
    await expect(stat(repo.path)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/source/
```

Expected: FAIL — `Cannot find module './local-driver.js'`.

- [ ] **Step 3: Write the provider interface**

`packages/control-plane/src/source/git-driver.ts`:

```ts
/** A repository this platform owns. `path` is meaningful only to the local driver. */
export interface RepoRef {
  projectSlug: string
  path: string
  /** What a builder is handed. `file://…` locally; an https URL for the GitHub driver. */
  url: string
}

export type SeedFiles = Readonly<Record<string, string>>

export class SourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SourceError'
  }
}

/**
 * D5: git access sits behind this interface so driver 2 (a UBC GitHub org) can
 * replace driver 1 without the control plane learning a second shape.
 */
export interface SourceDriver {
  readonly name: string
  createRepository(projectSlug: string, seed: SeedFiles): Promise<RepoRef>
  commitFiles(repo: RepoRef, files: SeedFiles, message: string): Promise<string>
  headCommit(repo: RepoRef, ref?: string): Promise<string>
  /** The file's content at that commit, or null if the path is not in the tree. */
  readFile(repo: RepoRef, commitSha: string, path: string): Promise<string | null>
  listBranches(repo: RepoRef): Promise<string[]>
  destroyRepository(repo: RepoRef): Promise<void>
}
```

- [ ] **Step 4: Write the local driver**

`packages/control-plane/src/source/local-driver.ts`:

```ts
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import {
  type RepoRef, type SeedFiles, SourceError, type SourceDriver,
} from './git-driver.js'

const run = promisify(execFile)

/**
 * §7's slug rule, re-stated because this module turns a slug into a path. Not
 * imported from spec/: this is a different input on a different path, and the
 * traversal defence must not depend on somebody else having checked something else.
 */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

/** Deterministic authorship so a seeded repo is reproducible across machines. */
const GIT_IDENTITY = [
  '-c', 'user.name=Manifest',
  '-c', 'user.email=manifest@manifest.internal',
  '-c', 'commit.gpgsign=false',
]

export { SourceError } from './git-driver.js'
export type { RepoRef, SourceDriver } from './git-driver.js'

export function createLocalSourceDriver(root: string): SourceDriver {
  const repoRoot = resolve(root)

  function pathFor(projectSlug: string): string {
    if (!SLUG.test(projectSlug)) {
      throw new SourceError(
        'SOURCE_INVALID_SLUG',
        `invalid project slug '${projectSlug}' — must match ${SLUG.source}`,
      )
    }
    const path = resolve(repoRoot, `${projectSlug}.git`)
    // Belt and braces: even with the regex above, never operate outside the root.
    if (path !== repoRoot && !path.startsWith(repoRoot + sep)) {
      throw new SourceError('SOURCE_PATH_ESCAPE', `'${projectSlug}' resolves outside the repo root`)
    }
    return path
  }

  function assertOwned(repo: RepoRef): string {
    const expected = pathFor(repo.projectSlug)
    if (resolve(repo.path) !== expected) {
      throw new SourceError(
        'SOURCE_FOREIGN_REPO',
        `refusing to operate on '${repo.path}', which this driver did not create`,
      )
    }
    return expected
  }

  async function git(cwd: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await run('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 })
      return stdout
    } catch (error) {
      throw new SourceError('SOURCE_GIT_FAILED', `git ${args[0]} failed: ${String(error)}`)
    }
  }

  /** Writes files in a throwaway worktree and pushes them into the bare repo. */
  async function commitThroughWorktree(
    bare: string, files: SeedFiles, message: string, firstCommit: boolean,
  ): Promise<string> {
    const work = await mkdtemp(join(tmpdir(), 'manifest-worktree-'))
    try {
      if (firstCommit) {
        await git(work, ['init', '--initial-branch=main', '.'])
        await git(work, ['remote', 'add', 'origin', bare])
      } else {
        await git(work, ['clone', '--branch', 'main', bare, '.'])
      }
      for (const [relative, content] of Object.entries(files)) {
        const target = resolve(work, relative)
        if (!target.startsWith(resolve(work) + sep)) {
          throw new SourceError('SOURCE_PATH_ESCAPE', `seed path '${relative}' escapes the worktree`)
        }
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, content, 'utf8')
      }
      await git(work, ['add', '-A'])
      await git(work, [...GIT_IDENTITY, 'commit', '-m', message])
      await git(work, ['push', 'origin', 'main'])
      return (await git(work, ['rev-parse', 'HEAD'])).trim()
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }

  return {
    name: 'local',

    async createRepository(projectSlug: string, seed: SeedFiles): Promise<RepoRef> {
      const path = pathFor(projectSlug)
      await mkdir(repoRoot, { recursive: true })
      await git(repoRoot, ['init', '--bare', '--initial-branch=main', path])
      await commitThroughWorktree(path, seed, 'chore: seed from blueprint skeleton', true)
      return { projectSlug, path, url: `file://${path}` }
    },

    async commitFiles(repo, files, message) {
      const path = assertOwned(repo)
      return commitThroughWorktree(path, files, message, false)
    },

    async headCommit(repo, ref = 'main') {
      const path = assertOwned(repo)
      return (await git(path, ['rev-parse', ref])).trim()
    },

    async readFile(repo, commitSha, filePath) {
      const path = assertOwned(repo)
      try {
        return await git(path, ['show', `${commitSha}:${filePath}`])
      } catch {
        // git exits non-zero for "path not in tree", which is a normal answer here.
        return null
      }
    },

    async listBranches(repo) {
      const path = assertOwned(repo)
      const stdout = await git(path, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])
      return stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
    },

    async destroyRepository(repo) {
      const path = assertOwned(repo)
      await rm(path, { recursive: true, force: true })
    },
  }
}
```

`packages/control-plane/src/source/index.ts`:

```ts
export * from './git-driver.js'
export { createLocalSourceDriver } from './local-driver.js'
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/source/
```

Expected: PASS, 7 tests.

**If `readFile` at an older commit fails**, the driver is reading a worktree rather
than the object store. A bare repo has no worktree; `git show <sha>:<path>` is the
only correct form.

- [ ] **Step 6: Prove the traversal defence has teeth**

Replace `pathFor`'s body with `return resolve(repoRoot, projectSlug + '.git')` — no
regex, no escape check. Run the tests again.

Expected: **FAIL** on *"refuses a slug that would escape the repository root"*. Restore
it and confirm green.

§20 requires that a sandbox cannot reach another project's repository. That property
is this function. Watch it fail once.

- [ ] **Step 7: Commit**

```bash
git add packages/control-plane/src/source/
git commit -m "feat(source): D5 provider interface and the local bare-repo driver"
```

---

## Task 16: Environment resolution, builds and immutable releases

**Files:**
- Create: `packages/control-plane/src/spec/resolve.ts`
- Modify: `packages/control-plane/src/spec/index.ts` (export `resolveConfig`)
- Create: `packages/control-plane/src/releases/build.ts`
- Create: `packages/control-plane/src/releases/release.ts`
- Create: `packages/control-plane/src/releases/index.ts`
- Test: `packages/control-plane/src/spec/resolve.test.ts`
- Test: `packages/control-plane/src/releases/releases.test.ts`

**Interfaces:**
- Consumes: `ManifestSpec` (Task 2); `Db` and the `builds`/`releases`/`instances` tables (Task 8); `Driver`, `instanceName` (Task 9); `nextState` (Task 11); `Config`, `hostnameFor` (Task 12).
- Produces:
  - `resolveConfig(spec: ManifestSpec, kind: EnvironmentKind): ResolvedConfig`
  - `startBuild(db, driver, input): Promise<Build>`
  - `createRelease(db, input): Promise<Release>`
  - `deployRelease(db, driver, config, input): Promise<Instance>`
  - `class ReleaseError` with `code`

**`spec/resolve.ts` is written here because this is the task that needs it.** It is in
the plan's file structure map (*"environment override merge"*) and no earlier task
creates it — an omission from the first pass, fixed here rather than by inserting a
task nobody would otherwise run.

**§7 fixes the merge rule exactly: `environments:` overrides `resources` and `env`,
and nothing else.** Not services, not egress, not auth, not `ai`. Anything else
differing between staging and production would mean the thing promoted is not the
thing tested.

**The merge has three layers, not two.** §7 says resource defaults are *"inherited
from blueprint"*, and Task 2's `resourcesSchema` makes every resource field
**optional with no default** for exactly that reason — so a spec that names only
`memory` leaves `cpu`, `pids` and `disk` genuinely absent rather than silently
defaulted. The order is therefore **blueprint defaults → spec `resources:` →
environment override**, and `ResolvedConfig.resources` is fully populated because the
blueprint layer guarantees it.

**Two traps in that merge, both silent:**

- **`{ ...base, ...override }` clobbers with `undefined`.** If an override object
  carries an explicit `cpu: undefined` key, the spread erases the base value. Zod
  omits absent optional keys rather than setting them undefined, so this is safe
  today — and `defined()` below keeps it safe if that ever changes.
- **There is no `sandbox` key to override.** Task 2's schema allows `staging` and
  `production` only, matching §7's example. Indexing `environments` with `'sandbox'`
  is a type error, not an empty result, so the resolver narrows first.

**§13's two load-bearing properties, both tested below:**

- *"A Release is immutable: Build (image digest) + AppSpec + resolved config."* So a
  release cannot be created from a build that has no digest — `createRelease` refuses
  it rather than storing a null and failing later at deploy.
- *"Promotion never rebuilds. Production runs the exact digest that staging ran."* So
  `deployRelease` never calls `buildImage`, and the test asserts that with a spy
  rather than by inspection.

**Production deployment is refused in P2, deliberately.** §13 gates first production
launch on the full `LaunchReadiness` checklist — `IamRegistration` active,
`PrivacyAssessment` approved, rehearsal passed, scans clean, admin approval — and none
of those entities exists yet (Task 8's scope note defers them to P4/P6). Approving a
production release against Task 13's *dev shim* would be a control that exists only on
paper. `deployRelease` therefore refuses `production` with a code that names what is
missing. See *Decisions this plan makes*, item 5.

- [ ] **Step 1: Write the failing resolution test**

`packages/control-plane/src/spec/resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { manifestSchema } from './schema.js'
import { resolveConfig } from './resolve.js'

const yaml = `
manifest: 1
name: chem-labs
blueprint: fixture-node@1
runtime:
  port: 3000
  health: /healthz
resources:
  cpu: 0.5
  memory: 512Mi
  pids: 256
  disk: 2Gi
env:
  - { name: COURSE_CODE, value: CHEM_121 }
  - { name: LOG_LEVEL, value: info }
environments:
  staging:    { resources: { memory: 256Mi } }
  production: { resources: { memory: 1Gi }, env: [{ name: LOG_LEVEL, value: warn }] }
`

const spec = manifestSchema.parse(parse(yaml))

/** What Task 6's descriptor supplies. Deliberately different from the spec's values
 *  so a test cannot pass by reading the wrong layer. */
const DEFAULTS = { cpu: 0.25, memory: '128Mi', pids: 64, disk: '1Gi' }

describe('environment override resolution (§7)', () => {
  it('leaves an environment with no overrides untouched', () => {
    const resolved = resolveConfig(spec, 'sandbox', DEFAULTS)
    expect(resolved.resources.memory).toBe('512Mi')
    expect(resolved.resources.cpu).toBe(0.5)
    expect(resolved.env).toEqual([
      { name: 'COURSE_CODE', value: 'CHEM_121' },
      { name: 'LOG_LEVEL', value: 'info' },
    ])
  })

  it('overrides only the resource fields the override names', () => {
    const resolved = resolveConfig(spec, 'staging', DEFAULTS)
    expect(resolved.resources.memory).toBe('256Mi')
    expect(resolved.resources.cpu).toBe(0.5)     // from the spec, untouched
    expect(resolved.resources.pids).toBe(256)    // from the spec, untouched
  })

  // The layer that is easiest to get wrong: §7 says resource defaults are
  // "inherited from blueprint", and Task 2 leaves every resource field optional
  // precisely so this layer has something to fill in.
  it('falls back to the blueprint defaults for fields the spec omits', () => {
    const sparse = manifestSchema.parse({
      manifest: 1,
      name: 'chem-labs',
      blueprint: 'fixture-node@1',
      runtime: { port: 3000 },
      resources: { memory: '512Mi' },
    })
    const resolved = resolveConfig(sparse, 'sandbox', DEFAULTS)
    expect(resolved.resources).toEqual({
      cpu: 0.25,          // blueprint
      memory: '512Mi',    // spec
      pids: 64,           // blueprint
      disk: '1Gi',        // blueprint
    })
  })

  it('lets an environment override beat both the spec and the blueprint', () => {
    const resolved = resolveConfig(spec, 'production', DEFAULTS)
    expect(resolved.resources.memory).toBe('1Gi')
  })

  it('replaces an env var by name and keeps the rest', () => {
    const resolved = resolveConfig(spec, 'production', DEFAULTS)
    expect(resolved.env).toEqual([
      { name: 'COURSE_CODE', value: 'CHEM_121' },
      { name: 'LOG_LEVEL', value: 'warn' },
    ])
  })

  it('appends an env var the base spec does not declare', () => {
    const withNew = manifestSchema.parse({
      ...parse(yaml),
      environments: { staging: { env: [{ name: 'STAGING_ONLY', value: 'yes' }] } },
    })
    const resolved = resolveConfig(withNew, 'staging', DEFAULTS)
    expect(resolved.env.map((e) => e.name)).toEqual(['COURSE_CODE', 'LOG_LEVEL', 'STAGING_ONLY'])
  })

  it('does not mutate the spec it was given', () => {
    const before = JSON.stringify(spec)
    resolveConfig(spec, 'production', DEFAULTS)
    expect(JSON.stringify(spec)).toBe(before)
  })

  it('carries the fields an override may never change straight through', () => {
    const staging = resolveConfig(spec, 'staging', DEFAULTS)
    const production = resolveConfig(spec, 'production', DEFAULTS)
    expect(staging.port).toBe(production.port)
    expect(staging.health).toBe(production.health)
    expect(staging.services).toEqual(production.services)
    expect(staging.egressAllow).toEqual(production.egressAllow)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails, then write the resolver**

```bash
pnpm --filter @manifest/control-plane test src/spec/resolve
```

Expected: FAIL — `Cannot find module './resolve.js'`.

`packages/control-plane/src/spec/resolve.ts`:

```ts
import type { ManifestSpec } from './schema.js'

export type EnvironmentKind = 'sandbox' | 'staging' | 'production'

export interface ResolvedEnvVar {
  name: string
  value?: string
  secret?: boolean
}

/**
 * One environment's view of a spec: the base document with §7's `environments:`
 * overrides applied. §7 permits overrides of `resources` and `env` only — anything
 * else differing between staging and production would mean the artefact promoted is
 * not the artefact tested (§13).
 */
export interface ResolvedConfig {
  environmentKind: EnvironmentKind
  port: number
  health: string
  resources: { cpu: number; memory: string; pids: number; disk: string }
  env: ResolvedEnvVar[]
  services: ManifestSpec['services']
  egressAllow: string[]
  classification: ManifestSpec['data']['classification']
}

/** Blueprint-supplied resource floor. §7: "defaults inherited from blueprint". */
export interface ResourceDefaults {
  cpu: number
  memory: string
  pids: number
  disk: string
}

/** Drops absent keys so a spread can never overwrite a set value with undefined. */
function defined<T extends object>(value: T | undefined): Partial<T> {
  if (!value) return {}
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

export function resolveConfig(
  spec: ManifestSpec,
  kind: EnvironmentKind,
  defaults: ResourceDefaults,
): ResolvedConfig {
  // §7 permits overrides for staging and production only; sandbox always takes the
  // base spec. Task 2's schema has no `sandbox` key, so this narrowing is required
  // for the index to typecheck, not merely defensive.
  const override = kind === 'sandbox' ? undefined : spec.environments[kind]

  const resources: ResolvedConfig['resources'] = {
    ...defaults,
    ...defined(spec.resources),
    ...defined(override?.resources),
  }

  const env: ResolvedEnvVar[] = spec.env.map((entry) => ({ ...entry }))
  for (const entry of override?.env ?? []) {
    const existing = env.findIndex((candidate) => candidate.name === entry.name)
    if (existing >= 0) env[existing] = { ...entry }
    else env.push({ ...entry })
  }

  return {
    environmentKind: kind,
    port: spec.runtime.port,
    health: spec.runtime.health,
    resources,
    env,
    services: spec.services.map((service) => ({ ...service })),
    egressAllow: [...spec.egress.allow],
    classification: spec.data.classification,
  }
}
```

Export it from `packages/control-plane/src/spec/index.ts`:

```ts
export * from './resolve.js'
```

Run the tests again. Expected: PASS, 8 tests.

- [ ] **Step 3: Write the failing releases test**

`packages/control-plane/src/releases/releases.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { withRollback } from '../db/testing.js'
import { appSpecs, builds, users } from '../db/index.js'
import { createFakeDriver } from '../runtime/index.js'
import { createProject } from '../projects/index.js'
import { loadConfig } from '../config.js'
import { ReleaseError, createRelease, deployRelease, startBuild } from './index.js'

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://unused',
  MANIFEST_SESSION_SECRET: 'k'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/blueprints',
  MANIFEST_REPOS_ROOT: '/tmp/repos',
})

const one = (kind: 'sandbox' | 'staging' | 'production') => ({
  environmentKind: kind,
  port: 3000,
  health: '/healthz',
  resources: { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' },
  env: [],
  services: [],
  egressAllow: [],
  classification: 'internal' as const,
})

const RESOLVED = {
  sandbox: one('sandbox'),
  staging: one('staging'),
  production: one('production'),
}

async function fixture(db: Parameters<typeof createProject>[0]) {
  const [user] = await db
    .insert(users)
    .values({ ubcCwlPuid: 'o', email: 'o@ubc.ca', displayName: 'O', role: 'member' })
    .returning()
  const { project, environments } = await createProject(db, config, {
    slug: 'chem-labs', ownerId: user!.id, blueprintRef: 'fixture-node@1',
  })
  const [appSpec] = await db
    .insert(appSpecs)
    .values({
      projectId: project.id, commitSha: 'a'.repeat(40), parsed: {},
      schemaVersion: 1, valid: true,
    })
    .returning()
  const byKind = Object.fromEntries(environments.map((e) => [e.kind, e]))
  return { user: user!, project, appSpec: appSpec!, byKind }
}

describe('builds', () => {
  it('records the image digest a successful build produced', async () => {
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      expect(build.status).toBe('succeeded')
      expect(build.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    })
  })

  it('records a failed build without a digest', async () => {
    await withRollback(async (db) => {
      const { project, appSpec } = await fixture(db)
      const driver = createFakeDriver()
      vi.spyOn(driver, 'buildImage').mockRejectedValueOnce(new Error('compile error'))
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      expect(build.status).toBe('failed')
      expect(build.imageDigest).toBeNull()
    })
  })
})

describe('releases (§13)', () => {
  it('refuses to create a release from a build with no image digest', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec } = await fixture(db)
      const [pending] = await db
        .insert(builds)
        .values({
          projectId: project.id, commitSha: appSpec.commitSha,
          appSpecId: appSpec.id, status: 'pending',
        })
        .returning()
      await expect(
        createRelease(db, {
          projectId: project.id, buildId: pending!.id, appSpecId: appSpec.id,
          createdBy: user.id, resolvedConfig: RESOLVED,
        }),
      ).rejects.toMatchObject({ code: 'RELEASE_BUILD_NOT_DEPLOYABLE' })
    })
  })

  it('deploys a release to staging and reaches healthy', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })
      const instance = await deployRelease(db, driver, config, {
        releaseId: release.id, environmentId: byKind.staging!.id,
      })
      expect(instance.state).toBe('healthy')
      expect(instance.handle).toBeTruthy()
    })
  })

  // §13: "Promotion never rebuilds. Production runs the exact digest that staging ran."
  it('never rebuilds when the same release is deployed a second time', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })

      const buildSpy = vi.spyOn(driver, 'buildImage')
      await deployRelease(db, driver, config, {
        releaseId: release.id, environmentId: byKind.staging!.id,
      })
      await deployRelease(db, driver, config, {
        releaseId: release.id, environmentId: byKind.sandbox!.id,
      })
      expect(buildSpy).not.toHaveBeenCalled()
    })
  })

  it('refuses production, naming the LaunchReadiness items that do not exist yet', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver()
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })
      await expect(
        deployRelease(db, driver, config, {
          releaseId: release.id, environmentId: byKind.production!.id,
        }),
      ).rejects.toMatchObject({ code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE' })
    })
  })

  // §13: laptop-built images live in `local/` and a remote-target driver must refuse
  // them. The rule is scoped to the DRIVER, not the environment kind, which is what
  // lets a laptop's own staging environment run a local image at all.
  it('refuses a local/ image on a driver that declares a remote target', async () => {
    await withRollback(async (db) => {
      const { user, project, appSpec, byKind } = await fixture(db)
      const driver = createFakeDriver({ capabilities: { remoteTarget: true } })
      const build = await startBuild(db, driver, {
        projectId: project.id, projectSlug: project.slug, appSpecId: appSpec.id,
        commitSha: appSpec.commitSha, blueprintRef: project.blueprintRef,
        repoUrl: 'file:///tmp/chem-labs.git',
      })
      const release = await createRelease(db, {
        projectId: project.id, buildId: build.id, appSpecId: appSpec.id,
        createdBy: user.id, resolvedConfig: RESOLVED,
      })
      await expect(
        deployRelease(db, driver, config, {
          releaseId: release.id, environmentId: byKind.staging!.id,
        }),
      ).rejects.toMatchObject({ code: 'RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER' })
    })
  })
})
```

- [ ] **Step 4: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/releases/
```

Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 5: Write the build recorder**

`packages/control-plane/src/releases/build.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { builds } from '../db/index.js'
import type { Driver } from '../runtime/index.js'

export type Build = typeof builds.$inferSelect

export interface StartBuildInput {
  projectId: string
  projectSlug: string
  appSpecId: string
  commitSha: string
  blueprintRef: string
  repoUrl: string
}

/**
 * Records a build, asks the driver for an image, and records the outcome. A failed
 * build is a recorded row with `status: 'failed'` and no digest — not an exception —
 * because a faculty member needs to see the failure and its logs (§14).
 */
export async function startBuild(db: Db, driver: Driver, input: StartBuildInput): Promise<Build> {
  const [created] = await db
    .insert(builds)
    .values({
      projectId: input.projectId,
      commitSha: input.commitSha,
      appSpecId: input.appSpecId,
      status: 'running',
    })
    .returning()
  if (!created) throw new Error('build insert returned no row')

  try {
    const image = await driver.buildImage(
      { repoPath: input.repoUrl, commitSha: input.commitSha },
      { blueprintRef: input.blueprintRef, projectSlug: input.projectSlug },
    )
    const [done] = await db
      .update(builds)
      .set({ status: 'succeeded', imageDigest: image.digest, logsRef: `build:${created.id}` })
      .where(eq(builds.id, created.id))
      .returning()
    return done!
  } catch (error) {
    const [failed] = await db
      .update(builds)
      .set({ status: 'failed', logsRef: `build:${created.id}` })
      .where(eq(builds.id, created.id))
      .returning()
    void error
    return failed!
  }
}

export async function getBuild(db: Db, buildId: string): Promise<Build | undefined> {
  const [build] = await db.select().from(builds).where(eq(builds.id, buildId))
  return build
}
```

- [ ] **Step 6: Write releases and deployment**

`packages/control-plane/src/releases/release.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { builds, environments, instances, releases } from '../db/index.js'
import type { Driver } from '../runtime/index.js'
import { instanceName } from '../runtime/index.js'
import { nextState } from '../runtime/index.js'
import type { ResolvedConfig } from '../spec/index.js'
import type { Config } from '../config.js'

export type Release = typeof releases.$inferSelect
export type Instance = typeof instances.$inferSelect

export class ReleaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ReleaseError'
  }
}

/**
 * Every environment's resolution, frozen together at release time.
 *
 * A release resolved for one environment could not be promoted to another, which
 * would defeat §13's "promotion never rebuilds": production has its own `resources`
 * override (§7), so promoting a staging-shaped release would either apply the wrong
 * numbers or force a re-resolution the approver never saw. Freezing all three means
 * the diff reviewed at approval is exactly what each environment will get.
 */
export type ResolvedConfigSet = Record<'sandbox' | 'staging' | 'production', ResolvedConfig>

export interface CreateReleaseInput {
  projectId: string
  buildId: string
  appSpecId: string
  createdBy: string
  resolvedConfig: ResolvedConfigSet
  summary?: string
}

/**
 * §13: "A Release is immutable: Build (image digest) + AppSpec + resolved config."
 * The digest is checked here rather than at deploy, because a release without one
 * is not a release — approval binds to the digest, and binding to nothing is how
 * "promotion never rebuilds" quietly stops being true.
 */
export async function createRelease(db: Db, input: CreateReleaseInput): Promise<Release> {
  const [build] = await db.select().from(builds).where(eq(builds.id, input.buildId))
  if (!build) throw new ReleaseError('RELEASE_BUILD_NOT_FOUND', `no build '${input.buildId}'`)
  if (build.status !== 'succeeded' || !build.imageDigest) {
    throw new ReleaseError(
      'RELEASE_BUILD_NOT_DEPLOYABLE',
      `build '${build.id}' is '${build.status}' with digest '${build.imageDigest ?? 'none'}'`,
    )
  }

  const [release] = await db
    .insert(releases)
    .values({
      projectId: input.projectId,
      buildId: input.buildId,
      appSpecId: input.appSpecId,
      createdBy: input.createdBy,
      resolvedConfig: input.resolvedConfig,
      summary: input.summary ?? null,
    })
    .returning()
  return release!
}

export interface DeployInput {
  releaseId: string
  environmentId: string
}

export async function deployRelease(
  db: Db,
  driver: Driver,
  config: Config,
  input: DeployInput,
): Promise<Instance> {
  const [release] = await db.select().from(releases).where(eq(releases.id, input.releaseId))
  if (!release) throw new ReleaseError('RELEASE_NOT_FOUND', `no release '${input.releaseId}'`)

  const [environment] = await db
    .select()
    .from(environments)
    .where(eq(environments.id, input.environmentId))
  if (!environment) {
    throw new ReleaseError('RELEASE_ENVIRONMENT_NOT_FOUND', `no environment '${input.environmentId}'`)
  }

  // Decisions item 5. The LaunchReadiness entities (§13) land in P4/P6; gating a
  // production launch on a checklist that does not exist would be a control on paper.
  if (environment.kind === 'production') {
    throw new ReleaseError(
      'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
      'production deployment requires the §13 LaunchReadiness checklist — IamRegistration ' +
        'active, PrivacyAssessment approved, rehearsal passed, scans clean, admin approval. ' +
        'None of those entities exists before P4, and P2 authenticates with a dev shim.',
    )
  }

  const [build] = await db.select().from(builds).where(eq(builds.id, release.buildId))
  const digest = build?.imageDigest
  if (!digest) throw new ReleaseError('RELEASE_DIGEST_MISSING', `release '${release.id}' has no digest`)

  const repository = `local/${environment.projectId}`
  // §13, scoped to the driver rather than the environment kind: a driver targeting
  // remote infrastructure refuses a laptop-built image, because the architectures
  // differ and "promote the exact digest" makes that unresolvable at deploy time.
  if (driver.capabilities().remoteTarget && repository.startsWith('local/')) {
    throw new ReleaseError(
      'RELEASE_LOCAL_IMAGE_ON_REMOTE_DRIVER',
      `driver '${driver.name}' declares a remote target and will not run a local/ image`,
    )
  }

  const resolved = (release.resolvedConfig as ResolvedConfigSet)[environment.kind]
  const name = instanceName(environment.hostname.split('.')[0]!, environment.kind, release.id)

  const [row] = await db
    .insert(instances)
    .values({
      environmentId: environment.id,
      releaseId: release.id,
      driver: driver.name,
      kind: 'web',
      state: 'provisioning',
    })
    .returning()

  const handle = await driver.ensureInstance({
    name,
    projectSlug: environment.hostname.split('.')[0]!,
    environmentKind: environment.kind,
    releaseId: release.id,
    image: { digest, repository },
    env: Object.fromEntries(
      resolved.env.filter((e) => e.value !== undefined).map((e) => [e.name, e.value!]),
    ),
    port: resolved.port,
    healthPath: resolved.health,
    resources: {
      cpu: resolved.resources.cpu,
      memoryMi: Number.parseInt(resolved.resources.memory, 10),
      pids: resolved.resources.pids,
      diskMi: Number.parseInt(resolved.resources.disk, 10) * 1024,
    },
    services: [],
    egressAllow: resolved.egressAllow,
  })

  // The fake driver reports healthy immediately; a real one goes through starting.
  const status = await driver.status(handle.id)
  const state = status.healthy
    ? nextState(nextState('provisioning', 'services_bound'), 'health_passed')
    : nextState('provisioning', 'services_bound')

  const [updated] = await db
    .update(instances)
    .set({ state, handle: handle.id, lastSeenAt: new Date() })
    .where(eq(instances.id, row!.id))
    .returning()
  return updated!
}
```

`packages/control-plane/src/releases/index.ts`:

```ts
export * from './build.js'
export * from './release.js'
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/releases/ src/spec/
```

Expected: PASS — 8 resolution tests, 2 build tests, 5 release tests, plus Tasks 2–5's
existing spec tests.

- [ ] **Step 8: Prove the promotion test has teeth**

In `deployRelease`, add a `await driver.buildImage(...)` call before `ensureInstance`,
using the release's commit. Run the tests again.

Expected: **FAIL** on *"never rebuilds when the same release is deployed a second
time"*. Remove it and confirm green.

*"Promotion never rebuilds"* is the sentence that makes staging evidence about
production. A test that only checked the instance came up healthy would pass through a
rebuild and prove nothing about it.

- [ ] **Step 9: Commit**

```bash
git add packages/control-plane/src/spec/resolve.ts packages/control-plane/src/spec/resolve.test.ts \
        packages/control-plane/src/spec/index.ts packages/control-plane/src/releases/
git commit -m "feat(releases): environment resolution, build records, and immutable releases

Promotion-never-rebuilds is asserted with a spy on buildImage, verified by
adding a rebuild and watching the test fail."
```

---

## Task 17: The Fastify server, idempotency and the auth routes

**Files:**
- Create: `packages/control-plane/src/api/errors.ts`
- Create: `packages/control-plane/src/api/idempotency.ts`
- Create: `packages/control-plane/src/api/server.ts`
- Create: `packages/control-plane/src/api/routes/auth.ts`
- Create: `packages/control-plane/src/api/index.ts`
- Create: `packages/control-plane/src/index.ts` (boot)
- Modify: `packages/control-plane/package.json` (add Fastify, `@fastify/cookie`)
- Test: `packages/control-plane/src/api/idempotency.test.ts`
- Test: `packages/control-plane/src/api/auth.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 12); `Session`, `verifySession`, `signSession`, `devLogin`, `SESSION_COOKIE` (Task 13); `AuthorizationError` (Task 14); `ReleaseError` (Task 16); `ManifestError` (Task 3); `Db` and `idempotencyKeys` (Task 8).
- Produces:
  - `buildServer(deps: ServerDeps): Promise<FastifyInstance>`
  - `interface ServerDeps { db; config; driver; source; blueprints }`
  - `interface RequestActor extends Actor { session: Session }` on `request.actor`
  - `replayOrStore(db, params, handler): Promise<StoredResponse>`
  - `toErrorResponse(error): { status: number; body: ErrorEnvelope }`

**The error envelope is D23.7 and §20.** *"A stable code and a remediation hint
alongside the human-readable message — the same discipline that makes §14's
faculty-legible events work, extended to clients that are programs."* Every failure
leaves through one function so no route invents its own shape.

**Idempotency is D23.6, and the subtle half is reuse.** *"Clients retry, and users
double-click."* Replaying a key with the **same** body returns the stored response.
Replaying it with a **different** body is a client bug and returns `409` — silently
returning the first response would tell a client its second, different request
succeeded. The request hash is what separates the two, and Task 8's primary key is
already `(key, user, route)`, so one user's key cannot collide with another's.

**`/auth/*` is exempt from the key requirement**, explicitly rather than by
forgetting: logging in twice is not a domain mutation, and requiring a key to log in
would put a header between a browser and its first request. Every other mutating route
requires one.

**The dev-login route is not registered at all when `MANIFEST_DEV_AUTH` is off.** Not
gated at request time — absent. A route that returns 403 advertises that it exists;
Task 12 already refuses to boot with the shim enabled outside development, and this
makes the surface match.

**Tests use `app.inject()` rather than Supertest.** Fastify's injector runs the full
route lifecycle — hooks, serialisation, error handler — without binding a port, so the
suite never collides with P1's control plane on 7100 and stays inside §16's
"milliseconds, no network" bar. Supertest remains available for P3's integration tier,
where a real listening server is the point.

- [ ] **Step 1: Add the dependencies**

```bash
pnpm --filter @manifest/control-plane add fastify @fastify/cookie
```

- [ ] **Step 2: Write the failing idempotency test**

`packages/control-plane/src/api/idempotency.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { withRollback } from '../db/testing.js'
import { users } from '../db/index.js'
import { IdempotencyConflictError, replayOrStore } from './idempotency.js'

async function aUser(db: Parameters<typeof replayOrStore>[0]) {
  const [user] = await db
    .insert(users)
    .values({ ubcCwlPuid: 'k', email: 'k@ubc.ca', displayName: 'K', role: 'member' })
    .returning()
  return user!
}

describe('idempotency (D23.6)', () => {
  it('runs the handler once and replays the stored response', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const handler = vi.fn().mockResolvedValue({ status: 201, body: { id: 'project-1' } })
      const params = { key: 'abc', userId: user.id, route: 'POST /projects', body: { slug: 'x' } }

      const first = await replayOrStore(db, params, handler)
      const second = await replayOrStore(db, params, handler)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(first).toEqual({ status: 201, body: { id: 'project-1' } })
      expect(second).toEqual(first)
    })
  })

  it('rejects the same key replayed with a different body', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const handler = vi.fn().mockResolvedValue({ status: 201, body: { id: 'project-1' } })
      await replayOrStore(
        db, { key: 'abc', userId: user.id, route: 'POST /projects', body: { slug: 'x' } }, handler,
      )
      await expect(
        replayOrStore(
          db, { key: 'abc', userId: user.id, route: 'POST /projects', body: { slug: 'DIFFERENT' } },
          handler,
        ),
      ).rejects.toThrow(IdempotencyConflictError)
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  it('scopes keys per user, so two users may use the same key', async () => {
    await withRollback(async (db) => {
      const one = await aUser(db)
      const [two] = await db
        .insert(users)
        .values({ ubcCwlPuid: 'k2', email: 'k2@ubc.ca', displayName: 'K2', role: 'member' })
        .returning()
      const handler = vi.fn()
        .mockResolvedValueOnce({ status: 201, body: { id: 'a' } })
        .mockResolvedValueOnce({ status: 201, body: { id: 'b' } })

      const first = await replayOrStore(
        db, { key: 'same', userId: one.id, route: 'POST /projects', body: {} }, handler,
      )
      const second = await replayOrStore(
        db, { key: 'same', userId: two!.id, route: 'POST /projects', body: {} }, handler,
      )
      expect(first.body).toEqual({ id: 'a' })
      expect(second.body).toEqual({ id: 'b' })
    })
  })

  it('does not store a response when the handler throws', async () => {
    await withRollback(async (db) => {
      const user = await aUser(db)
      const failing = vi.fn().mockRejectedValue(new Error('boom'))
      const params = { key: 'abc', userId: user.id, route: 'POST /projects', body: {} }
      await expect(replayOrStore(db, params, failing)).rejects.toThrow('boom')

      // A retry after a failure must actually retry, not replay a failure.
      const succeeding = vi.fn().mockResolvedValue({ status: 201, body: { id: 'ok' } })
      expect((await replayOrStore(db, params, succeeding)).body).toEqual({ id: 'ok' })
    })
  })
})
```

- [ ] **Step 3: Write the error envelope and the idempotency helper**

`packages/control-plane/src/api/errors.ts`:

```ts
import { AuthorizationError } from '../projects/index.js'
import { ReleaseError } from '../releases/index.js'
import { SourceError } from '../source/index.js'
import { ConfigError } from '../config.js'
import type { ManifestError } from '../errors/index.js'
import { IdempotencyConflictError } from './idempotency.js'

export interface ErrorEnvelope {
  error: {
    code: string
    message: string
    hint?: string
    details?: ManifestError[]
  }
}

export class SpecInvalidError extends Error {
  readonly code = 'SPEC_INVALID'
  constructor(readonly details: ManifestError[]) {
    super('the manifest.yaml in this commit is not valid')
    this.name = 'SpecInvalidError'
  }
}

export class BadRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'BadRequestError'
  }
}

/**
 * Every failure leaves through here, so no route invents its own shape. D23.7:
 * stable codes plus remediation hints, "so an agent can correct itself rather than
 * surfacing a wall of text to its user".
 */
export function toErrorResponse(error: unknown): { status: number; body: ErrorEnvelope } {
  if (error instanceof AuthorizationError) {
    return {
      status: error.code === 'NOT_FOUND' ? 404 : 403,
      body: {
        error: {
          code: error.code,
          message: error.code === 'NOT_FOUND' ? 'not found' : error.message,
          hint:
            error.code === 'FORBIDDEN'
              ? 'Ask a project owner to grant you the role this action needs.'
              : undefined,
        },
      },
    }
  }

  if (error instanceof SpecInvalidError) {
    return {
      status: 422,
      body: {
        error: {
          code: error.code,
          message: error.message,
          hint: 'Fix the listed paths in manifest.yaml and push again.',
          details: error.details,
        },
      },
    }
  }

  if (error instanceof IdempotencyConflictError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: error.message,
          hint: 'Use a fresh Idempotency-Key for a request with a different body.',
        },
      },
    }
  }

  if (error instanceof BadRequestError) {
    return { status: 400, body: { error: { code: error.code, message: error.message, hint: error.hint } } }
  }

  if (error instanceof ReleaseError || error instanceof SourceError || error instanceof ConfigError) {
    return { status: 409, body: { error: { code: error.code, message: error.message } } }
  }

  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'the control plane failed to handle this request' } },
  }
}
```

`packages/control-plane/src/api/idempotency.ts`:

```ts
import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { idempotencyKeys } from '../db/index.js'

export interface StoredResponse {
  status: number
  body: unknown
}

export interface IdempotencyParams {
  key: string
  userId: string
  /** `METHOD /path` — part of the key, so one key cannot span two operations. */
  route: string
  body: unknown
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED'
  constructor(key: string) {
    super(`Idempotency-Key '${key}' was already used on this route with a different body`)
    this.name = 'IdempotencyConflictError'
  }
}

function hashOf(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex')
}

/**
 * D23.6. Replays the stored response for a repeated key, refuses a key reused with a
 * different body, and stores nothing when the handler throws — a failed request must
 * be retryable with the same key, or a network blip becomes a permanent failure.
 */
export async function replayOrStore(
  db: Db,
  params: IdempotencyParams,
  handler: () => Promise<StoredResponse>,
): Promise<StoredResponse> {
  const requestHash = hashOf(params.body)

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.key, params.key),
        eq(idempotencyKeys.userId, params.userId),
        eq(idempotencyKeys.route, params.route),
      ),
    )

  if (existing) {
    if (existing.requestHash !== requestHash) throw new IdempotencyConflictError(params.key)
    return { status: existing.responseStatus, body: existing.responseBody }
  }

  const response = await handler()

  await db
    .insert(idempotencyKeys)
    .values({
      key: params.key,
      userId: params.userId,
      route: params.route,
      requestHash,
      responseStatus: response.status,
      responseBody: response.body as object,
    })
    .onConflictDoNothing()

  return response
}
```

- [ ] **Step 4: Run the idempotency tests**

```bash
pnpm --filter @manifest/control-plane test src/api/idempotency
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing auth test**

`packages/control-plane/src/api/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildServer } from './server.js'
import { testDeps } from './testing.js'

describe('auth routes', () => {
  it('logs in a seeded test user and returns them from /auth/me', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const login = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_prof' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find((c) => c.name === 'manifest_session')
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax')

    const me = await app.inject({
      method: 'GET', url: '/auth/me', cookies: { manifest_session: cookie!.value },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ puid: 'bio_prof', role: 'member' })
    await app.close()
  })

  it('refuses /auth/me without a session', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const me = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(me.statusCode).toBe(401)
    expect(me.json().error.code).toBe('UNAUTHENTICATED')
    await app.close()
  })

  it('refuses a tampered session cookie', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const login = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_prof' },
    })
    const value = login.cookies.find((c) => c.name === 'manifest_session')!.value
    const tampered = `${value.slice(0, -4)}AAAA`
    const me = await app.inject({
      method: 'GET', url: '/auth/me', cookies: { manifest_session: tampered },
    })
    expect(me.statusCode).toBe(401)
    await app.close()
  })

  // The route is absent, not forbidden. A 403 would confirm the shim is compiled in.
  it('does not register the dev-login route when dev auth is off', async () => {
    const app = await buildServer(await testDeps({ devAuth: false }))
    const login = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_prof' },
    })
    expect(login.statusCode).toBe(404)
    await app.close()
  })

  it('refuses a PUID that is not a seeded test user', async () => {
    const app = await buildServer(await testDeps({ devAuth: true }))
    const login = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'someone-i-invented' },
    })
    expect(login.statusCode).toBe(409)
    expect(login.json().error.code).toBe('DEV_AUTH_UNKNOWN_USER')
    await app.close()
  })
})
```

- [ ] **Step 6: Write the server, the test harness and the auth routes**

`packages/control-plane/src/api/server.ts`:

```ts
import cookie from '@fastify/cookie'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import type { Db } from '../db/index.js'
import type { Config } from '../config.js'
import type { Driver } from '../runtime/index.js'
import type { SourceDriver } from '../source/index.js'
import type { BlueprintRegistry } from '../blueprints/index.js'
import { SESSION_COOKIE, verifySession } from '../identity/index.js'
import type { Actor } from '../projects/index.js'
import { BadRequestError, toErrorResponse } from './errors.js'
import { replayOrStore } from './idempotency.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerProjectRoutes } from './routes/projects.js'
import { registerDeliveryRoutes } from './routes/delivery.js'

export interface ServerDeps {
  db: Db
  config: Config
  driver: Driver
  source: SourceDriver
  blueprints: BlueprintRegistry
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor & { puid: string }
  }
  interface FastifyContextConfig {
    /** `/auth/*` opts out: logging in twice is not a domain mutation. */
    idempotency?: 'exempt'
  }
  interface FastifyInstance {
    /** Wraps a mutating handler in its idempotency record. Decorated below. */
    idempotent(
      request: FastifyRequest,
      handler: () => Promise<{ status: number; body: unknown }>,
    ): Promise<{ status: number; body: unknown }>
    /** Every route registered, for Task 20's completeness check. */
    registeredRoutes: { method: string; url: string }[]
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function requireActor(request: FastifyRequest): Actor & { puid: string } {
  if (!request.actor) {
    throw Object.assign(new Error('a session is required'), { statusCode: 401 })
  }
  return request.actor
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(cookie)

  app.decorateRequest('actor', undefined)

  // One place turns a cookie into an actor. Routes never read the cookie.
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) return
    const session = verifySession(token, deps.config.sessionSecret)
    if (!session) return
    request.actor = { userId: session.userId, platformRole: session.role, puid: session.puid }
  })

  // D23.6, applied by the framework rather than remembered per route.
  app.addHook('preHandler', async (request) => {
    if (!MUTATING.has(request.method)) return
    if (request.routeOptions.config?.idempotency === 'exempt') return
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string' || key.length < 8) {
      throw new BadRequestError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'every mutating request needs an Idempotency-Key header of at least 8 characters',
        'Generate a UUID per user action and reuse it across retries of that action.',
      )
    }
  })

  app.setErrorHandler((error, request, reply) => {
    if ((error as { statusCode?: number }).statusCode === 401) {
      return reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'a session is required', hint: 'Log in first.' },
      })
    }
    const { status, body } = toErrorResponse(error)
    if (status === 500) request.log.error({ err: error }, 'unhandled error')
    return reply.status(status).send(body)
  })

  /** Wraps a mutating handler in its idempotency record. */
  app.decorate(
    'idempotent',
    async (request: FastifyRequest, handler: () => Promise<{ status: number; body: unknown }>) => {
      const actor = requireActor(request)
      return replayOrStore(
        deps.db,
        {
          key: request.headers['idempotency-key'] as string,
          userId: actor.userId,
          route: `${request.method} ${request.routeOptions.url}`,
          body: request.body,
        },
        handler,
      )
    },
  )

  await registerAuthRoutes(app, deps)
  await registerProjectRoutes(app, deps)
  await registerDeliveryRoutes(app, deps)

  return app
}
```

`packages/control-plane/src/api/routes/auth.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  SESSION_COOKIE, SESSION_TTL_MS, devLogin, signSession,
} from '../../identity/index.js'
import { requireActor, type ServerDeps } from '../server.js'

const loginBody = z.object({ puid: z.string().min(1).max(64) })

export async function registerAuthRoutes(app: FastifyInstance, deps: ServerDeps): Promise<void> {
  // Not registered at all outside development. Task 12 refuses to boot in that
  // state anyway; this makes the route surface match the configuration.
  if (deps.config.devAuth) {
    app.post('/auth/dev-login', { config: { idempotency: 'exempt' } }, async (request, reply) => {
      const { puid } = loginBody.parse(request.body)
      const { user, session } = await devLogin(deps.db, puid, { devAuthEnabled: true })
      reply.setCookie(SESSION_COOKIE, signSession(session, deps.config.sessionSecret), {
        httpOnly: true,
        sameSite: 'lax',
        secure: deps.config.env !== 'development',
        path: '/',
        maxAge: SESSION_TTL_MS / 1000,
      })
      return reply.status(200).send({
        id: user.id, puid: user.ubcCwlPuid, displayName: user.displayName, role: user.role,
      })
    })
  }

  app.get('/auth/me', async (request) => {
    const actor = requireActor(request)
    return { id: actor.userId, puid: actor.puid, role: actor.platformRole }
  })

  app.post('/auth/logout', { config: { idempotency: 'exempt' } }, async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.status(204).send()
  })
}
```

`packages/control-plane/src/api/testing.ts` — one place builds the dependency bundle,
so every API test file starts identically:

```ts
import { db } from '../db/index.js'
import { loadConfig } from '../config.js'
import { createFakeDriver } from '../runtime/index.js'
import { createLocalSourceDriver } from '../source/index.js'
import { loadBlueprints } from '../blueprints/index.js'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerDeps } from './server.js'

export async function testDeps(opts: { devAuth: boolean }): Promise<ServerDeps> {
  const reposRoot = await mkdtemp(join(tmpdir(), 'manifest-api-repos-'))
  const config = loadConfig({
    MANIFEST_ENV: 'development',
    MANIFEST_DATABASE_URL: process.env.MANIFEST_DATABASE_URL!,
    MANIFEST_SESSION_SECRET: 'k'.repeat(32),
    MANIFEST_DEV_AUTH: opts.devAuth ? '1' : '0',
    // Blueprints live at the repo root (see File Structure); Vitest runs with the
    // package directory as cwd, so this is two levels up, not 'blueprints'.
    MANIFEST_BLUEPRINTS_ROOT: '../../blueprints',
    MANIFEST_REPOS_ROOT: reposRoot,
  })
  return {
    db,
    config,
    driver: createFakeDriver(),
    source: createLocalSourceDriver(reposRoot),
    blueprints: await loadBlueprints(config.blueprintsRoot),
  }
}
```

`packages/control-plane/src/index.ts` — the boot entry point:

```ts
import { buildServer } from './api/index.js'
import { db } from './db/index.js'
import { loadConfig } from './config.js'
import { createFakeDriver } from './runtime/index.js'
import { createLocalSourceDriver } from './source/index.js'
import { loadBlueprints } from './blueprints/index.js'

// loadConfig throws before anything listens if MANIFEST_DEV_AUTH is set outside
// development. That is the point: the process must not come up in that state.
const config = loadConfig()

const app = await buildServer({
  db,
  config,
  // P3 swaps this for the Docker driver. Nothing else in this file changes.
  driver: createFakeDriver(),
  source: createLocalSourceDriver(config.reposRoot),
  blueprints: await loadBlueprints(config.blueprintsRoot),
})

await app.listen({ port: config.port, host: '127.0.0.1' })
```

`packages/control-plane/src/api/index.ts`:

```ts
export { buildServer, requireActor } from './server.js'
export type { ServerDeps } from './server.js'
export * from './errors.js'
export * from './idempotency.js'
```

- [ ] **Step 7: Run the auth tests**

They depend on Task 18's `registerProjectRoutes` and Task 19's
`registerDeliveryRoutes` existing as importable stubs. Create each as a
one-line no-op now — `export async function registerProjectRoutes(): Promise<void> {}`
— and fill them in in the next two tasks.

```bash
pnpm --filter @manifest/control-plane test src/api/
```

Expected: PASS — 4 idempotency tests, 5 auth tests.

- [ ] **Step 8: Prove the dev-login route really is absent**

In `registerAuthRoutes`, change `if (deps.config.devAuth)` to `if (true)`. Run again.

Expected: **FAIL** on *"does not register the dev-login route when dev auth is off"* —
it now answers 409 rather than 404, because the route exists and rejects the PUID.
Restore and confirm green.

Note the failure mode this catches: a shim that is *disabled* but *present* is one
configuration mistake away from being live, and every other test in this file passes
either way.

- [ ] **Step 9: Commit**

```bash
git add packages/control-plane/src/api/ packages/control-plane/src/index.ts \
        packages/control-plane/package.json pnpm-lock.yaml
git commit -m "feat(api): Fastify server, D23.6 idempotency, D23.7 error envelope, auth routes"
```

---

## Task 18: Project and spec routes

**Files:**
- Create: `packages/control-plane/src/api/routes/projects.ts` (replacing the stub)
- Test: `packages/control-plane/src/api/projects.test.ts`

**Interfaces:**
- Consumes: `buildServer`, `requireActor`, `SpecInvalidError` (Task 17); `createProject`, `listProjectsFor`, `getProject`, `listEnvironments`, `assertCapability` (Task 14); `createLocalSourceDriver` (Task 15); `validateSpec` (Task 4); `loadBlueprints` (Task 6).
- Produces the routes:
  - `POST /projects` — create, provision the repository, validate the seeded spec
  - `GET /projects` — the caller's projects
  - `GET /projects/:projectId` — one project, with `?expand=environments`
  - `GET /projects/:projectId/spec` — the parsed spec at a commit
  - `POST /projects/:projectId/members` — add a collaborator

**Why the members route is in P2 rather than deferred.** It is the only route that
requires `members:manage`, and §13's collaborator role is defined by *not* having it.
Without this route the capability is unreachable, `assertCapability`'s `FORBIDDEN`
branch is never exercised by any test, and Task 20's suite would contain no case where
an authenticated member of the project is refused — which is half of what the tier
exists to check. One route makes the difference between a model that is tested and a
model that is merely written down.

**This is §22's journey, steps 2 and 3**: *"Create a project — name and blueprint"* and
*"Watch provisioning: repository created, `manifest.yaml` validated."*

**`?expand=` rather than a view endpoint.** D23.1 forbids *"a `GET /dashboard`
returning a blob shaped for today's layout"*, and allows *"resources, plus an explicit
`?expand=` where round-trips genuinely hurt."* A project and its three environments is
exactly that case.

**Creation does four things in one request** — project row, owner membership, three
environments, seeded repository — and the idempotency key is what makes that safe to
retry. A double-click that created two repositories would be the D23.6 defect in its
most expensive form.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/api/projects.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildServer } from './server.js'
import { testDeps } from './testing.js'

async function loggedIn(puid = 'bio_prof') {
  const deps = await testDeps({ devAuth: true })
  const app = await buildServer(deps)
  const login = await app.inject({ method: 'POST', url: '/auth/dev-login', payload: { puid } })
  const session = login.cookies.find((c) => c.name === 'manifest_session')!.value
  return { app, deps, session }
}

const create = (slug: string) => ({
  method: 'POST' as const,
  url: '/projects',
  payload: { slug, blueprint: 'fixture-node@1' },
})

describe('POST /projects', () => {
  it('creates a project with three environments and a seeded repository', async () => {
    const { app, session } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.slug).toBe('chem-labs')
    expect(body.repositoryUrl).toMatch(/^file:\/\/.*chem-labs\.git$/)
    expect(body.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(body.specValid).toBe(true)
    expect(body.environments.map((e: { kind: string }) => e.kind).sort())
      .toEqual(['production', 'sandbox', 'staging'])
    await app.close()
  })

  it('refuses a mutating request with no Idempotency-Key', async () => {
    const { app, session } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'), cookies: { manifest_session: session },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
    await app.close()
  })

  it('creates one project when the same request is replayed', async () => {
    const { app, session } = await loggedIn()
    const headers = { 'idempotency-key': randomUUID() }
    const first = await app.inject({
      ...create('chem-labs'), cookies: { manifest_session: session }, headers,
    })
    const second = await app.inject({
      ...create('chem-labs'), cookies: { manifest_session: session }, headers,
    })
    expect(second.statusCode).toBe(first.statusCode)
    expect(second.json().id).toBe(first.json().id)

    const list = await app.inject({
      method: 'GET', url: '/projects', cookies: { manifest_session: session },
    })
    expect(list.json()).toHaveLength(1)
    await app.close()
  })

  it('rejects a slug §7 would not accept', async () => {
    const { app, session } = await loggedIn()
    const response = await app.inject({
      ...create('Chem_Labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('refuses an unauthenticated request', async () => {
    const { app } = await loggedIn()
    const response = await app.inject({
      ...create('chem-labs'), headers: { 'idempotency-key': randomUUID() },
    })
    expect(response.statusCode).toBe(401)
    await app.close()
  })
})

describe('GET /projects/:id', () => {
  it('expands environments only when asked (D23.1)', async () => {
    const { app, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    const id = created.json().id

    const plain = await app.inject({
      method: 'GET', url: `/projects/${id}`, cookies: { manifest_session: session },
    })
    expect(plain.json().environments).toBeUndefined()

    const expanded = await app.inject({
      method: 'GET', url: `/projects/${id}?expand=environments`,
      cookies: { manifest_session: session },
    })
    expect(expanded.json().environments).toHaveLength(3)
    await app.close()
  })

  it('returns the validated spec at the seeded commit', async () => {
    const { app, session } = await loggedIn()
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    const spec = await app.inject({
      method: 'GET', url: `/projects/${created.json().id}/spec`,
      cookies: { manifest_session: session },
    })
    expect(spec.statusCode).toBe(200)
    expect(spec.json().spec.name).toBe('chem-labs')
    expect(spec.json().commitSha).toBe(created.json().commitSha)
    await app.close()
  })

  it('hides another user’s project behind 404, not 403', async () => {
    const { app, session } = await loggedIn('bio_prof')
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    const other = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_student' },
    })
    const otherSession = other.cookies.find((c) => c.name === 'manifest_session')!.value

    const response = await app.inject({
      method: 'GET', url: `/projects/${created.json().id}`,
      cookies: { manifest_session: otherSession },
    })
    expect(response.statusCode).toBe(404)
    await app.close()
  })
})

describe('POST /projects/:id/members', () => {
  it('lets an owner add a collaborator, who can then read the project', async () => {
    const { app, session } = await loggedIn('bio_prof')
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    const id = created.json().id

    // The invitee must have logged in once — there is no user row otherwise.
    const invitee = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_student' },
    })
    const inviteeSession = invitee.cookies.find((c) => c.name === 'manifest_session')!.value

    const added = await app.inject({
      method: 'POST', url: `/projects/${id}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(added.statusCode).toBe(201)

    const read = await app.inject({
      method: 'GET', url: `/projects/${id}`, cookies: { manifest_session: inviteeSession },
    })
    expect(read.statusCode).toBe(200)
    await app.close()
  })

  it('refuses a collaborator with 403 — they are a member, so nothing is hidden', async () => {
    const { app, session } = await loggedIn('bio_prof')
    const created = await app.inject({
      ...create('chem-labs'),
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })
    const id = created.json().id

    const invitee = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_student' },
    })
    const inviteeSession = invitee.cookies.find((c) => c.name === 'manifest_session')!.value
    await app.inject({
      method: 'POST', url: `/projects/${id}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
      cookies: { manifest_session: session },
      headers: { 'idempotency-key': randomUUID() },
    })

    const response = await app.inject({
      method: 'POST', url: `/projects/${id}/members`,
      payload: { puid: 'unrelated_user', role: 'collaborator' },
      cookies: { manifest_session: inviteeSession },
      headers: { 'idempotency-key': randomUUID() },
    })
    // 403, not 404: a collaborator already knows this project exists.
    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('FORBIDDEN')
    await app.close()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/api/projects
```

Expected: FAIL — the stub registers no routes, so every request 404s.

- [ ] **Step 3: Write the routes**

`packages/control-plane/src/api/routes/projects.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { appSpecs } from '../../db/index.js'
import { assertCapability } from '../../projects/index.js'
import {
  createProject, getProject, listEnvironments, listProjectsFor,
} from '../../projects/index.js'
import { validateSpec } from '../../spec/index.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { requireActor, type ServerDeps } from '../server.js'

const createBody = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{2,38}$/, 'slug must match ^[a-z][a-z0-9-]{2,38}$'),
  blueprint: z.string().min(1),
})

/** The validation context §7 needs but manifest.yaml cannot contain (Task 4). */
function validationContext(projectSlug: string, quota: Record<string, unknown>) {
  return {
    projectSlug,
    attributeWhitelist: ['ubcEduCwlPuid', 'mail', 'givenName', 'sn', 'eduPersonAffiliation'],
    serviceCatalogue: ['mongo', 'qdrant'],
    modelCatalogue: [
      { name: 'default-chat-onprem', maxClassification: 'confidential' as const },
      { name: 'default-chat', maxClassification: 'internal' as const },
      { name: 'default-embed', maxClassification: 'internal' as const },
    ],
    quota: {
      maxCpu: Number(quota.max_cpu ?? 2),
      maxMemoryMi: 2048,
      maxServices: Number(quota.max_services ?? 3),
      aiMonthlyUsd: Number(quota.ai_monthly_usd ?? 50),
    },
  }
}

export async function registerProjectRoutes(app: FastifyInstance, deps: ServerDeps): Promise<void> {
  app.post('/projects', async (request, reply) => {
    const actor = requireActor(request)
    const parsed = createBody.safeParse(request.body)
    if (!parsed.success) {
      throw new BadRequestError(
        'PROJECT_INVALID_INPUT',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        'Slugs are lowercase letters, digits and hyphens, 3–39 characters, starting with a letter.',
      )
    }
    const { slug, blueprint } = parsed.data

    const descriptor = deps.blueprints.resolve(blueprint)
    if (!descriptor) {
      throw new BadRequestError(
        'BLUEPRINT_NOT_FOUND',
        `no blueprint '${blueprint}'`,
        `Available: ${deps.blueprints.list().map((b) => `${b.blueprint}@${b.major_version}`).join(', ')}`,
      )
    }

    const { status, body } = await app.idempotent(request, async () => {
      const { project, environments } = await createProject(deps.db, deps.config, {
        slug, ownerId: actor.userId, blueprintRef: blueprint,
      })

      // §22 step 3: "repository created, manifest.yaml validated".
      const repo = await deps.source.createRepository(slug, {
        'manifest.yaml': [
          'manifest: 1',
          `name: ${slug}`,
          `blueprint: ${blueprint}`,
          'runtime:',
          `  port: ${descriptor.runtime.default_port}`,
          `  health: ${descriptor.runtime.health_path}`,
          '',
        ].join('\n'),
        'src/index.js': "import http from 'node:http'\n",
      })
      const commitSha = await deps.source.headCommit(repo)
      const yamlText = (await deps.source.readFile(repo, commitSha, 'manifest.yaml')) ?? ''

      const result = validateSpec(
        yamlText,
        validationContext(slug, project.quota as Record<string, unknown>),
      )
      const [appSpec] = await deps.db
        .insert(appSpecs)
        .values({
          projectId: project.id,
          commitSha,
          parsed: result.valid ? result.spec : {},
          schemaVersion: 1,
          valid: result.valid,
          errors: result.valid ? [] : result.errors,
        })
        .returning()

      return {
        status: 201,
        body: {
          id: project.id,
          slug: project.slug,
          blueprint: project.blueprintRef,
          repositoryUrl: repo.url,
          commitSha,
          specValid: result.valid,
          specErrors: result.valid ? [] : result.errors,
          appSpecId: appSpec!.id,
          environments: environments.map((e) => ({
            id: e.id, kind: e.kind, hostname: e.hostname,
          })),
        },
      }
    })

    return reply.status(status).send(body)
  })

  app.get('/projects', async (request) => {
    const actor = requireActor(request)
    return listProjectsFor(deps.db, actor)
  })

  app.get('/projects/:projectId', async (request) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'project:read')

    const project = await getProject(deps.db, projectId)
    const expand = String((request.query as { expand?: string }).expand ?? '').split(',')
    if (!expand.includes('environments')) return project

    return { ...project, environments: await listEnvironments(deps.db, projectId) }
  })

  app.get('/projects/:projectId/spec', async (request) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'project:read')

    const [latest] = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
      .orderBy(desc(appSpecs.createdAt))
      .limit(1)

    if (!latest) throw new BadRequestError('SPEC_NOT_FOUND', 'this project has no validated spec yet')
    if (!latest.valid) throw new SpecInvalidError(latest.errors as never)

    return { commitSha: latest.commitSha, spec: latest.parsed, appSpecId: latest.id }
  })

  app.post('/projects/:projectId/members', async (request, reply) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    // A collaborator reaches this line and is refused here. §13: "same as owner
    // except member management and deletion."
    await assertCapability(deps.db, actor, projectId, 'members:manage')

    const parsed = memberBody.safeParse(request.body)
    if (!parsed.success) throw new BadRequestError('MEMBER_INVALID_INPUT', parsed.error.message)

    const [user] = await deps.db
      .select()
      .from(users)
      .where(eq(users.ubcCwlPuid, parsed.data.puid))
    if (!user) {
      throw new BadRequestError(
        'MEMBER_USER_NOT_FOUND',
        `no user with PUID '${parsed.data.puid}' has ever logged in`,
        'A person must log in once before they can be added to a project.',
      )
    }

    const { status, body } = await app.idempotent(request, async () => {
      await addMember(deps.db, projectId, user.id, parsed.data.role)
      return { status: 201, body: { projectId, userId: user.id, role: parsed.data.role } }
    })
    return reply.status(status).send(body)
  })
}
```

The imports this file needs, in full:

```ts
import type { FastifyInstance } from 'fastify'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { appSpecs, users } from '../../db/index.js'
import { assertCapability } from '../../projects/index.js'
import {
  addMember, createProject, getProject, listEnvironments, listProjectsFor,
} from '../../projects/index.js'
import { validateSpec } from '../../spec/index.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { requireActor, type ServerDeps } from '../server.js'
```

and one more schema beside `createBody`:

```ts
const memberBody = z.object({
  puid: z.string().min(1).max(64),
  role: z.enum(['owner', 'collaborator']),
})
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/api/projects
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Prove the replay test has teeth**

In `POST /projects`, call the inner function directly instead of through
`app.idempotent(request, …)`. Run the tests again.

Expected: **FAIL** on *"creates one project when the same request is replayed"* — the
second call now tries a second insert on a unique slug. Restore and confirm green.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/api/routes/projects.ts packages/control-plane/src/api/projects.test.ts
git commit -m "feat(api): project creation with repository provisioning and spec validation"
```

---

## Task 19: Build, release and deployment routes

**Files:**
- Create: `packages/control-plane/src/api/routes/delivery.ts` (replacing the stub)
- Test: `packages/control-plane/src/api/delivery.test.ts`

**Interfaces:**
- Consumes: `requireActor`, `app.idempotent`, `BadRequestError`, `SpecInvalidError` (Task 17); `assertCapability` (Task 14); `startBuild`, `getBuild`, `createRelease`, `deployRelease`, `resolveConfig` (Task 16); `checkBlueprintCompatibility` (Task 6).
- Produces the routes:
  - `POST /projects/:projectId/builds` — build the spec at a commit
  - `GET /builds/:buildId` — build status and digest
  - `POST /projects/:projectId/releases` — bind a succeeded build into an immutable release
  - `POST /environments/:environmentId/deploy` — run a release in an environment
  - `GET /environments/:environmentId` — the environment and its current instance

**§22's journey, steps 4 to 7**: trigger a build, deploy to staging, watch state
transitions, request production and be told what is blocking.

**Every route re-derives the project from the resource id.** `GET /builds/:buildId`
looks the build up, takes *its* `projectId`, and checks the capability against that —
never against a project id in the request. Trusting a client-supplied project id
alongside a resource id is the IDOR §16 names as *"the likeliest bug class in a
multi-tenant control plane"*, and Task 20's suite exercises exactly this shape.

**The production route answers 409 with a checklist, not 403.** A faculty member
asking for production is not doing something forbidden — they are doing something
that is not ready. §13: *"A faculty member should never discover the existence of a
PIA on the day they wanted to launch."* The error body lists the `LaunchReadiness`
items and which phase delivers them.

- [ ] **Step 1: Write the failing test**

`packages/control-plane/src/api/delivery.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildServer } from './server.js'
import { testDeps } from './testing.js'

const key = () => ({ 'idempotency-key': randomUUID() })

async function projectFor(puid: string) {
  const app = await buildServer(await testDeps({ devAuth: true }))
  const login = await app.inject({ method: 'POST', url: '/auth/dev-login', payload: { puid } })
  const session = login.cookies.find((c) => c.name === 'manifest_session')!.value
  const cookies = { manifest_session: session }
  const created = await app.inject({
    method: 'POST', url: '/projects',
    payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' },
    cookies, headers: key(),
  })
  return { app, cookies, project: created.json() }
}

describe('the delivery routes', () => {
  it('builds, releases and deploys to staging', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')

    const build = await app.inject({
      method: 'POST', url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha }, cookies, headers: key(),
    })
    expect(build.statusCode).toBe(201)
    expect(build.json().status).toBe('succeeded')
    expect(build.json().imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)

    const release = await app.inject({
      method: 'POST', url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id, summary: 'first' }, cookies, headers: key(),
    })
    expect(release.statusCode).toBe(201)

    const staging = project.environments.find((e: { kind: string }) => e.kind === 'staging')
    const deploy = await app.inject({
      method: 'POST', url: `/environments/${staging.id}/deploy`,
      payload: { releaseId: release.json().id }, cookies, headers: key(),
    })
    expect(deploy.statusCode).toBe(200)
    expect(deploy.json().state).toBe('healthy')

    const environment = await app.inject({
      method: 'GET', url: `/environments/${staging.id}`, cookies,
    })
    expect(environment.json().hostname).toBe('chem-labs.staging.manifest.internal')
    expect(environment.json().instance.state).toBe('healthy')
    await app.close()
  })

  it('refuses a release from a build that has not succeeded', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')
    const response = await app.inject({
      method: 'POST', url: `/projects/${project.id}/releases`,
      payload: { buildId: '00000000-0000-0000-0000-000000000000' }, cookies, headers: key(),
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('RELEASE_BUILD_NOT_FOUND')
    await app.close()
  })

  it('refuses production and says what is blocking it', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')
    const build = await app.inject({
      method: 'POST', url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha }, cookies, headers: key(),
    })
    const release = await app.inject({
      method: 'POST', url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id }, cookies, headers: key(),
    })
    const production = project.environments.find((e: { kind: string }) => e.kind === 'production')

    const response = await app.inject({
      method: 'POST', url: `/environments/${production.id}/deploy`,
      payload: { releaseId: release.json().id }, cookies, headers: key(),
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('RELEASE_PRODUCTION_GATE_UNAVAILABLE')
    expect(response.json().error.launchReadiness).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item: 'IamRegistration', blocking: true }),
        expect.objectContaining({ item: 'PrivacyAssessment', blocking: true }),
      ]),
    )
    await app.close()
  })

  // The IDOR shape: a valid build id belonging to somebody else.
  it('hides another user’s build behind 404', async () => {
    const { app, cookies, project } = await projectFor('bio_prof')
    const build = await app.inject({
      method: 'POST', url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha }, cookies, headers: key(),
    })

    const other = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_student' },
    })
    const otherCookies = {
      manifest_session: other.cookies.find((c) => c.name === 'manifest_session')!.value,
    }
    const response = await app.inject({
      method: 'GET', url: `/builds/${build.json().id}`, cookies: otherCookies,
    })
    expect(response.statusCode).toBe(404)
    await app.close()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @manifest/control-plane test src/api/delivery
```

Expected: FAIL — the stub registers no routes.

- [ ] **Step 3: Write the routes**

`packages/control-plane/src/api/routes/delivery.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { appSpecs, environments, instances, projects } from '../../db/index.js'
import { assertCapability, AuthorizationError } from '../../projects/index.js'
import { createRelease, deployRelease, getBuild, startBuild } from '../../releases/index.js'
import { checkBlueprintCompatibility } from '../../blueprints/index.js'
import { resolveConfig } from '../../spec/index.js'
import type { ManifestSpec } from '../../spec/index.js'
import { BadRequestError, SpecInvalidError } from '../errors.js'
import { requireActor, type ServerDeps } from '../server.js'

const buildBody = z.object({ commitSha: z.string().regex(/^[0-9a-f]{40}$/).optional() })
const releaseBody = z.object({ buildId: z.string().uuid(), summary: z.string().max(500).optional() })
const deployBody = z.object({ releaseId: z.string().uuid() })

/** §13's checklist, as data, so the refusal can name what is missing. */
const LAUNCH_READINESS = [
  { item: 'IamRegistration', owner: 'UBC IAM', blocking: true, deliveredBy: 'P4' },
  { item: 'PrivacyAssessment', owner: 'UBC Privacy Office', blocking: true, deliveredBy: 'P4' },
  { item: 'PreProductionRehearsal', owner: 'Manifest', blocking: true, deliveredBy: 'P4' },
  { item: 'DependencyAndSecretScans', owner: 'Manifest', blocking: true, deliveredBy: 'P3' },
  { item: 'AdminApproval', owner: 'platform admin', blocking: true, deliveredBy: 'P4' },
] as const

export async function registerDeliveryRoutes(app: FastifyInstance, deps: ServerDeps): Promise<void> {
  app.post('/projects/:projectId/builds', async (request, reply) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'build:create')

    const parsed = buildBody.safeParse(request.body ?? {})
    if (!parsed.success) throw new BadRequestError('BUILD_INVALID_INPUT', parsed.error.message)

    const [spec] = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
      .orderBy(desc(appSpecs.createdAt))
      .limit(1)
    if (!spec) throw new BadRequestError('SPEC_NOT_FOUND', 'this project has no validated spec yet')
    if (!spec.valid) {
      throw new BadRequestError(
        'SPEC_INVALID',
        'the latest manifest.yaml is not valid, so there is nothing to build',
        'GET /projects/:id/spec lists the errors.',
      )
    }

    const [project] = await deps.db.select().from(projects).where(eq(projects.id, projectId))
    if (!project) throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)

    // D30/§25: the spec is checked against the blueprint it pins, here rather than at
    // validation time, because a blueprint's major version can move under a spec that
    // has not changed. This is `checkBlueprintCompatibility`'s call site.
    const descriptor = deps.blueprints.resolve(project.blueprintRef)
    if (!descriptor) {
      throw new BadRequestError(
        'BLUEPRINT_NOT_FOUND',
        `this project pins '${project.blueprintRef}', which is no longer in the registry`,
      )
    }
    const incompatibilities = checkBlueprintCompatibility(spec.parsed as ManifestSpec, descriptor)
    if (incompatibilities.length > 0) throw new SpecInvalidError(incompatibilities)

    const { status, body } = await app.idempotent(request, async () => {
      const build = await startBuild(deps.db, deps.driver, {
        projectId,
        projectSlug: project.slug,
        appSpecId: spec.id,
        commitSha: parsed.data.commitSha ?? spec.commitSha,
        blueprintRef: project.blueprintRef,
        repoUrl: `file://${deps.config.reposRoot}/${project.slug}.git`,
      })
      return { status: 201, body: build }
    })
    return reply.status(status).send(body)
  })

  app.get('/builds/:buildId', async (request) => {
    const actor = requireActor(request)
    const { buildId } = request.params as { buildId: string }
    const build = await getBuild(deps.db, buildId)
    // The project comes from the resource, never from the request.
    if (!build) throw new AuthorizationError('NOT_FOUND', `no build '${buildId}'`)
    await assertCapability(deps.db, actor, build.projectId, 'project:read')
    return build
  })

  app.post('/projects/:projectId/releases', async (request, reply) => {
    const actor = requireActor(request)
    const { projectId } = request.params as { projectId: string }
    await assertCapability(deps.db, actor, projectId, 'release:create')

    const parsed = releaseBody.safeParse(request.body)
    if (!parsed.success) throw new BadRequestError('RELEASE_INVALID_INPUT', parsed.error.message)

    const [project] = await deps.db.select().from(projects).where(eq(projects.id, projectId))
    if (!project) throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)

    const [spec] = await deps.db
      .select()
      .from(appSpecs)
      .where(eq(appSpecs.projectId, projectId))
      .orderBy(desc(appSpecs.createdAt))
      .limit(1)
    if (!spec) throw new BadRequestError('SPEC_NOT_FOUND', 'this project has no validated spec yet')

    const { status, body } = await app.idempotent(request, async () => {
      const parsedSpec = spec.parsed as ManifestSpec
      const descriptor = deps.blueprints.resolve(project.blueprintRef)
      if (!descriptor) {
        throw new BadRequestError(
          'BLUEPRINT_NOT_FOUND',
          `this project pins '${project.blueprintRef}', which is no longer in the registry`,
        )
      }
      const defaults = descriptor.defaults.resources

      const release = await createRelease(deps.db, {
        projectId,
        buildId: parsed.data.buildId,
        appSpecId: spec.id,
        createdBy: actor.userId,
        summary: parsed.data.summary,
        // Resolved once, at release time, and frozen — all three environments
        // together, so promotion applies the exact numbers the approver saw.
        resolvedConfig: {
          sandbox: resolveConfig(parsedSpec, 'sandbox', defaults),
          staging: resolveConfig(parsedSpec, 'staging', defaults),
          production: resolveConfig(parsedSpec, 'production', defaults),
        },
      })
      return { status: 201, body: release }
    })
    return reply.status(status).send(body)
  })

  app.post('/environments/:environmentId/deploy', async (request, reply) => {
    const actor = requireActor(request)
    const { environmentId } = request.params as { environmentId: string }

    const [environment] = await deps.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
    if (!environment) throw new AuthorizationError('NOT_FOUND', `no environment '${environmentId}'`)
    await assertCapability(deps.db, actor, environment.projectId, 'release:deploy')

    const parsed = deployBody.safeParse(request.body)
    if (!parsed.success) throw new BadRequestError('DEPLOY_INVALID_INPUT', parsed.error.message)

    // §13: not forbidden, not ready. Say which items and who owns them.
    if (environment.kind === 'production') {
      return reply.status(409).send({
        error: {
          code: 'RELEASE_PRODUCTION_GATE_UNAVAILABLE',
          message: 'first production launch is a checklist, not a button (§13, D19)',
          hint: 'These items have multi-week lead times and are tracked from project creation.',
          launchReadiness: LAUNCH_READINESS,
        },
      })
    }

    const { status, body } = await app.idempotent(request, async () => {
      const instance = await deployRelease(deps.db, deps.driver, deps.config, {
        releaseId: parsed.data.releaseId,
        environmentId,
      })
      return { status: 200, body: instance }
    })
    return reply.status(status).send(body)
  })

  app.get('/environments/:environmentId', async (request) => {
    const actor = requireActor(request)
    const { environmentId } = request.params as { environmentId: string }

    const [environment] = await deps.db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
    if (!environment) throw new AuthorizationError('NOT_FOUND', `no environment '${environmentId}'`)
    await assertCapability(deps.db, actor, environment.projectId, 'project:read')

    const [instance] = await deps.db
      .select()
      .from(instances)
      .where(eq(instances.environmentId, environmentId))
      .orderBy(desc(instances.lastSeenAt))
      .limit(1)

    return { ...environment, instance: instance ?? null }
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @manifest/control-plane test src/api/delivery
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Prove the IDOR test has teeth**

In `GET /builds/:buildId`, change the capability check to use a `projectId` read from
the query string, falling back to the build's own: `request.query.projectId ??
build.projectId`. Run the tests again with the other user passing their own project id.

Expected: **FAIL** on *"hides another user's build behind 404"*. Restore and confirm
green.

This is the exact shape of the bug §16 puts in its own test tier. It is invisible in
review because both lines read as "check the project", and only one of them checks the
project that owns the resource.

- [ ] **Step 6: Commit**

```bash
git add packages/control-plane/src/api/routes/delivery.ts packages/control-plane/src/api/delivery.test.ts
git commit -m "feat(api): build, release and deploy routes, with §13's production checklist"
```

---

## Task 20: The authorization contract suite

**Files:**
- Create: `packages/control-plane/src/api/authz-contract.ts`
- Create: `packages/control-plane/src/api/authz-contract.test.ts`
- Modify: `packages/control-plane/src/api/server.ts` (record registered routes)

**Interfaces:**
- Consumes: `buildServer`, `ServerDeps` (Task 17); every route from Tasks 17–19.
- Produces: `describeAuthorizationContract(name: string, factory: () => Promise<ServerDeps>): void` — **P3 imports this unchanged and points it at a server backed by the Docker driver.**

**This is a §16 test tier, not a test file.** *"Every API route, exercised as owner,
collaborator, unrelated user, and admin. IDOR is the likeliest bug class in a
multi-tenant control plane, so tenant isolation is a test tier rather than a
code-review hope."*

**The property that makes it a tier rather than a checklist: the completeness test.**
A hand-written table of routes goes stale the moment somebody adds a route, and a
stale table is worse than none because it looks like coverage. So `buildServer`
records every route it registers, and the suite asserts that **every recorded route
appears in the table**. Adding a route without deciding its authorization now fails
the build — which is the same shape as Task 11's state-machine drift test, applied to
the API surface.

- [ ] **Step 1: Record the routes the server registers**

The `FastifyInstance` augmentation already declares `registeredRoutes` (Task 17).
Populate it in `packages/control-plane/src/api/server.ts`, **before** the
`registerAuthRoutes` / `registerProjectRoutes` / `registerDeliveryRoutes` calls —
`onRoute` fires as routes register, so a hook added afterwards records nothing:

```ts
const registered: { method: string; url: string }[] = []
app.addHook('onRoute', (route) => {
  const methods = Array.isArray(route.method) ? route.method : [route.method]
  for (const method of methods) {
    if (method === 'HEAD' || method === 'OPTIONS') continue
    registered.push({ method, url: route.url })
  }
})
app.decorate('registeredRoutes', registered)
```

- [ ] **Step 2: Write the contract suite**

`packages/control-plane/src/api/authz-contract.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer, type ServerDeps } from './server.js'

type Actor = 'owner' | 'collaborator' | 'stranger' | 'admin' | 'anonymous'

/** What each actor should get. `pass` means "not an authorization failure". */
type Expectation = 'pass' | 403 | 404 | 401

interface RouteCase {
  method: string
  /** The registered Fastify URL, so the completeness check can match on it. */
  url: string
  /** Fills path params and body from the fixture. */
  request(fixture: Fixture): { url: string; payload?: unknown }
  expect: Record<Actor, Expectation>
}

interface Fixture {
  projectId: string
  environmentId: { staging: string; production: string }
  buildId: string
  releaseId: string
  commitSha: string
}

const ALL_ACTORS: Actor[] = ['owner', 'collaborator', 'stranger', 'admin', 'anonymous']

/**
 * Every route, and what each actor is owed. `404` for a stranger is deliberate and
 * asserted rather than being folded into "refused": answering 403 would confirm the
 * resource exists and turn the id space into an enumeration oracle across tenants.
 */
const ROUTES: RouteCase[] = [
  {
    method: 'GET', url: '/auth/me',
    request: () => ({ url: '/auth/me' }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 401 },
  },
  {
    method: 'POST', url: '/auth/logout',
    request: () => ({ url: '/auth/logout' }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 'pass' },
  },
  {
    method: 'POST', url: '/auth/dev-login',
    request: () => ({ url: '/auth/dev-login', payload: { puid: 'bio_prof' } }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 'pass' },
  },
  {
    method: 'POST', url: '/projects',
    request: () => ({ url: '/projects', payload: { slug: `p-${randomUUID().slice(0, 8)}`, blueprint: 'fixture-node@1' } }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 401 },
  },
  {
    method: 'GET', url: '/projects',
    request: () => ({ url: '/projects' }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 'pass', admin: 'pass', anonymous: 401 },
  },
  {
    method: 'GET', url: '/projects/:projectId',
    request: (f) => ({ url: `/projects/${f.projectId}` }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
  {
    method: 'GET', url: '/projects/:projectId/spec',
    request: (f) => ({ url: `/projects/${f.projectId}/spec` }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
  {
    // The only route requiring `members:manage`, and so the only place a
    // collaborator is refused while a stranger is hidden. 403 and 404 in one row.
    // The payload re-adds a member who is already a collaborator: addMember is
    // idempotent, so running this case as owner and as admin does not change the
    // membership graph the other cases depend on.
    method: 'POST', url: '/projects/:projectId/members',
    request: (f) => ({
      url: `/projects/${f.projectId}/members`,
      payload: { puid: 'bio_student', role: 'collaborator' },
    }),
    expect: { owner: 'pass', collaborator: 403, stranger: 404, admin: 'pass', anonymous: 401 },
  },
  {
    method: 'POST', url: '/projects/:projectId/builds',
    request: (f) => ({ url: `/projects/${f.projectId}/builds`, payload: { commitSha: f.commitSha } }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
  {
    method: 'GET', url: '/builds/:buildId',
    request: (f) => ({ url: `/builds/${f.buildId}` }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
  {
    method: 'POST', url: '/projects/:projectId/releases',
    request: (f) => ({ url: `/projects/${f.projectId}/releases`, payload: { buildId: f.buildId } }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
  {
    method: 'POST', url: '/environments/:environmentId/deploy',
    request: (f) => ({ url: `/environments/${f.environmentId.staging}/deploy`, payload: { releaseId: f.releaseId } }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
  {
    method: 'GET', url: '/environments/:environmentId',
    request: (f) => ({ url: `/environments/${f.environmentId.staging}` }),
    expect: { owner: 'pass', collaborator: 'pass', stranger: 404, admin: 'pass', anonymous: 401 },
  },
]

export function describeAuthorizationContract(
  name: string,
  factory: () => Promise<ServerDeps>,
): void {
  describe(`authorization contract (${name})`, () => {
    let app: FastifyInstance
    let fixture: Fixture
    const cookies: Partial<Record<Actor, Record<string, string>>> = {}

    async function login(puid: string): Promise<Record<string, string>> {
      const response = await app.inject({
        method: 'POST', url: '/auth/dev-login', payload: { puid },
      })
      return {
        manifest_session: response.cookies.find((c) => c.name === 'manifest_session')!.value,
      }
    }

    beforeAll(async () => {
      app = await buildServer(await factory())
      // Four distinct identities for §16's four tiers. Reusing one for two tiers is
      // how a suite comes to assert nothing: a "collaborator" who is not a member
      // makes every collaborator expectation indistinguishable from the stranger's.
      cookies.owner = await login('bio_prof')
      cookies.collaborator = await login('bio_student')
      cookies.stranger = await login('unrelated_user')
      cookies.admin = await login('platform_admin')

      const project = await app.inject({
        method: 'POST', url: '/projects',
        payload: { slug: 'authz-fixture', blueprint: 'fixture-node@1' },
        cookies: cookies.owner, headers: { 'idempotency-key': randomUUID() },
      })
      const body = project.json()

      const build = await app.inject({
        method: 'POST', url: `/projects/${body.id}/builds`,
        payload: { commitSha: body.commitSha },
        cookies: cookies.owner, headers: { 'idempotency-key': randomUUID() },
      })
      const release = await app.inject({
        method: 'POST', url: `/projects/${body.id}/releases`,
        payload: { buildId: build.json().id },
        cookies: cookies.owner, headers: { 'idempotency-key': randomUUID() },
      })

      fixture = {
        projectId: body.id,
        commitSha: body.commitSha,
        buildId: build.json().id,
        releaseId: release.json().id,
        environmentId: {
          staging: body.environments.find((e: { kind: string }) => e.kind === 'staging').id,
          production: body.environments.find((e: { kind: string }) => e.kind === 'production').id,
        },
      }

      // Make the collaborator an actual member of the fixture project. Without
      // this line every "collaborator → pass" expectation below is a lie that
      // still goes green, because 404 is not 'pass' and the test would fail — but
      // the reverse mistake (a stranger who is secretly a member) fails silently.
      await app.inject({
        method: 'POST', url: `/projects/${body.id}/members`,
        payload: { puid: 'bio_student', role: 'collaborator' },
        cookies: cookies.owner, headers: { 'idempotency-key': randomUUID() },
      })

      // The stranger must be a member of nothing. Assert it rather than assume it.
      const strangerView = await app.inject({
        method: 'GET', url: '/projects', cookies: cookies.stranger,
      })
      expect(strangerView.json()).toEqual([])
    })

    // The drift guard. A route added without an entry here fails the build.
    it('covers every route the server registers', () => {
      const covered = new Set(ROUTES.map((route) => `${route.method} ${route.url}`))
      const registered = app.registeredRoutes.map((route) => `${route.method} ${route.url}`)
      const uncovered = registered.filter((route) => !covered.has(route))
      expect(uncovered).toEqual([])
    })

    for (const route of ROUTES) {
      for (const actor of ALL_ACTORS) {
        const expected = route.expect[actor]
        it(`${route.method} ${route.url} as ${actor} → ${expected}`, async () => {
          const { url, payload } = route.request(fixture)
          const response = await app.inject({
            method: route.method as 'GET',
            url,
            payload,
            cookies: actor === 'anonymous' ? undefined : cookies[actor],
            headers: { 'idempotency-key': randomUUID() },
          })

          if (expected === 'pass') {
            expect(response.statusCode).toBeLessThan(400)
          } else {
            expect(response.statusCode).toBe(expected)
          }
        })
      }
    }
  })
}
```

`packages/control-plane/src/api/authz-contract.test.ts`:

```ts
import { describeAuthorizationContract } from './authz-contract.js'
import { testDeps } from './testing.js'

describeAuthorizationContract('fake driver', () => testDeps({ devAuth: true }))
```

- [ ] **Step 3: Run it**

```bash
pnpm --filter @manifest/control-plane test src/api/authz-contract
```

Expected: PASS — 1 completeness test plus 13 routes × 5 actors = 65 authorization
tests.

**If the completeness test fails**, it is telling you a route exists that nobody
decided the authorization for. Add it to `ROUTES` with its four expectations — do not
delete the test.

- [ ] **Step 4: Prove the suite has teeth, twice**

This is the load-bearing artefact of the whole plan; a suite that has never failed
proves nothing. Break it in two different ways and watch two different tests fail.

**Break 1 — a missing check.** Delete the `await assertCapability(...)` line from
`GET /projects/:projectId`.

Expected: **FAIL** on *"GET /projects/:projectId as stranger → 404"*. Restore it.

**Break 2 — a route nobody authorized.** Add
`app.get('/projects/:projectId/secrets', async () => ({ nothing: true }))` to
`registerProjectRoutes`.

Expected: **FAIL** on *"covers every route the server registers"*, naming the new
route. Remove it and confirm green.

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/api/authz-contract.ts \
        packages/control-plane/src/api/authz-contract.test.ts \
        packages/control-plane/src/api/server.ts
git commit -m "test(api): the §16 authorization contract suite, with a route-completeness guard

Verified by deleting a capability check and by adding an unlisted route:
each broke a different test."
```

---

## Task 21: The lifecycle demo — P2's acceptance

**Files:**
- Create: `packages/control-plane/src/lifecycle.test.ts`
- Modify: `README.md` (a short "running the control plane" section)

**Interfaces:**
- Consumes: everything.
- Produces: the evidence that P2's demo holds.

**This is the plan's stated demo**, from the roadmap: *"the full lifecycle — create a
project, validate a spec, produce a release, deploy it — driven end to end against the
fake driver by a test suite that runs in under a second."* §16 calls the fake driver
*"the highest-leverage decision"* in the design; this test is what cashes it in, and
the timing assertion is what keeps it cashed — a lifecycle test that quietly grows to
thirty seconds stops being run.

**It asserts the shape of the answer at every step**, not that a step returned. A
lifecycle test that only checked for 2xx would pass with an invalid spec, a release
bound to no digest, and an instance that never became healthy.

- [ ] **Step 1: Write the test**

`packages/control-plane/src/lifecycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildServer } from './api/index.js'
import { testDeps } from './api/testing.js'

const key = () => ({ 'idempotency-key': randomUUID() })

describe('P2 acceptance: the full lifecycle against the fake driver', () => {
  it('goes from no project to a healthy staging instance, in under a second', async () => {
    const started = performance.now()
    const app = await buildServer(await testDeps({ devAuth: true }))

    // 1. Log in (§22 step 1 — the dev shim stands in for CWL until P4).
    const login = await app.inject({
      method: 'POST', url: '/auth/dev-login', payload: { puid: 'bio_prof' },
    })
    expect(login.statusCode).toBe(200)
    const cookies = {
      manifest_session: login.cookies.find((c) => c.name === 'manifest_session')!.value,
    }

    // 2. Create a project (§22 step 2) — and 3, provisioning: repository created,
    //    manifest.yaml validated.
    const created = await app.inject({
      method: 'POST', url: '/projects',
      payload: { slug: 'chem-labs', blueprint: 'fixture-node@1' },
      cookies, headers: key(),
    })
    expect(created.statusCode).toBe(201)
    const project = created.json()
    expect(project.specValid).toBe(true)
    expect(project.specErrors).toEqual([])
    expect(project.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(project.environments).toHaveLength(3)

    // The spec that was validated is the spec at that commit, read from a bare repo.
    const spec = await app.inject({
      method: 'GET', url: `/projects/${project.id}/spec`, cookies,
    })
    expect(spec.json().commitSha).toBe(project.commitSha)
    expect(spec.json().spec.name).toBe('chem-labs')

    // 4. Build (§22 step 4). Assert the digest, not that a build row came back.
    const build = await app.inject({
      method: 'POST', url: `/projects/${project.id}/builds`,
      payload: { commitSha: project.commitSha }, cookies, headers: key(),
    })
    expect(build.json().status).toBe('succeeded')
    expect(build.json().imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/)

    // 5. Release — immutable: build + appspec + resolved config (§13).
    const release = await app.inject({
      method: 'POST', url: `/projects/${project.id}/releases`,
      payload: { buildId: build.json().id, summary: 'first release' },
      cookies, headers: key(),
    })
    expect(release.statusCode).toBe(201)
    expect(release.json().buildId).toBe(build.json().id)
    expect(release.json().resolvedConfig.staging.port).toBe(3000)
    expect(release.json().resolvedConfig.production.resources.memory).toBe('512Mi')

    // 6. Deploy to staging (§22 step 5) and reach healthy.
    const staging = project.environments.find((e: { kind: string }) => e.kind === 'staging')
    const deployed = await app.inject({
      method: 'POST', url: `/environments/${staging.id}/deploy`,
      payload: { releaseId: release.json().id }, cookies, headers: key(),
    })
    expect(deployed.statusCode).toBe(200)
    expect(deployed.json().state).toBe('healthy')

    const environment = await app.inject({
      method: 'GET', url: `/environments/${staging.id}`, cookies,
    })
    expect(environment.json().hostname).toBe('chem-labs.staging.manifest.internal')
    expect(environment.json().instance.releaseId).toBe(release.json().id)

    // 7. Ask for production, and be told what is blocking (§22 step 7, §13 D19).
    const production = project.environments.find((e: { kind: string }) => e.kind === 'production')
    const blocked = await app.inject({
      method: 'POST', url: `/environments/${production.id}/deploy`,
      payload: { releaseId: release.json().id }, cookies, headers: key(),
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error.launchReadiness.filter((i: { blocking: boolean }) => i.blocking))
      .toHaveLength(5)

    await app.close()

    // §16's claim is "milliseconds, no Docker, no network". Hold it to that.
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
```

- [ ] **Step 2: Run the whole suite**

```bash
pnpm --filter @manifest/control-plane test
pnpm --filter @manifest/control-plane typecheck
pnpm lint
```

Expected: PASS across every task's tests, with no Docker running and the network off.

**If the timing assertion fails**, look for a real `git` call in the hot path before
assuming the budget is wrong: `createRepository` shells out three times, which is the
one genuinely slow step, and it runs once.

- [ ] **Step 3: Prove the demo is testing what it claims**

Stop Postgres — `docker stop manifest-postgres` — and run the lifecycle test.

Expected: **FAIL** at the first database call. This is the negative control for the
claim *"no Docker"*: P2 needs no Docker **for the driver**, and that is a different
statement from needing no containers at all. Recording the distinction here stops the
next reader over-reading §16's line. Restart Postgres and confirm green.

- [ ] **Step 4: Record what running it takes**

Add to `README.md`, under a new *Running the control plane* heading:

```markdown
## Running the control plane

Requires P1's substrate (`make up`) for Postgres on 7103.

    export MANIFEST_DATABASE_URL=postgres://manifest:manifest@127.0.0.1:7103/manifest_control_plane
    export MANIFEST_SESSION_SECRET=$(openssl rand -hex 32)
    export MANIFEST_DEV_AUTH=1
    export MANIFEST_BLUEPRINTS_ROOT=blueprints
    export MANIFEST_REPOS_ROOT=.manifest/repos
    pnpm --filter @manifest/control-plane db:migrate
    pnpm --filter @manifest/control-plane dev

`MANIFEST_DEV_AUTH=1` enables the temporary login shim and is refused outside
`MANIFEST_ENV=development`. P4 replaces it with CWL and deletes it.
```

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/lifecycle.test.ts README.md
git commit -m "test: P2 acceptance — the full lifecycle against the fake driver, under a second"
```

---

## What this plan does not build

Named so the next reader does not go looking, and so P3 and P4 know what they inherit.

| Not here | Where it lands | Why not here |
|---|---|---|
| The real Docker driver | **P3** | It is the whole of P3, and it passes Task 10's suite unchanged |
| `routing/` — Caddy admin API, listener assignment | **P3** | Needs containers to route to. S1 has the request shapes ready |
| The real builder — rootless BuildKit, registry push | **P3** | Task 16 records a build; P3 performs one |
| §12's per-app networks, egress policy, hardening flags | **P3** | Nothing to isolate until containers exist. S1 has the `HostConfig` |
| `services/` — Mongo and Qdrant provisioning | **P3** | `ensureService` is declared and faked; nothing binds a real one yet |
| Real CWL login, and **deleting `identity/dev-auth.ts`** | **P4** | Needs the Manifest IdP (S2's SQL metadata mechanism) |
| `secrets/`, the §8 injection contract and its drift test | **P4** | No secret has anywhere to be injected until P3 runs a container |
| `ai/` — the LiteLLM client and S3's three corrections | **P4** | Each of the three needs a §16 test, and all three fail silently |
| `Approval`, `LaunchReadiness`, step-up re-auth | **P4** | Decisions item 5: a gate over a dev shim is a control on paper |
| WebSocket `/projects/:id/events` (D23.2) | **P4** | Nothing streams yet; build logs are the first real producer |
| `contract/`, `manifest-mock`, `console/` | **P5** | D22's import rule needs a generated client to import |
| Wake-on-request | **S4, then Phase 4** | The mechanism is a measured choice, not a design decision |


---

## What the self-review caught

Recorded because the roadmap's lesson says to: *"Run the plan self-review, and record
what it caught. Writing down what the review caught stops the next reader mistaking a
deliberate fix for a mistake."* P1's found five defects. This one found seven, all in
Tasks 11–21 and all before anyone executed a line.

| # | Defect | Fix |
|---|---|---|
| 1 | **`resolveConfig` merged two layers where §7 has three.** Task 2 leaves every resource field optional *with no default*, because §7 says defaults are "inherited from blueprint". A two-layer merge would have produced a `ResolvedConfig` with `cpu: undefined` typed as `number` — and the driver would have received `undefined` as a CPU ceiling. | Blueprint defaults became an explicit third layer and a parameter. A test asserts a sparse spec picks up each field from the right layer. |
| 2 | **`spec.environments['sandbox']` does not typecheck.** Task 2's schema has `staging` and `production` keys only, matching §7. The resolver indexed it with all three kinds. | The resolver narrows before indexing, and the reason is a comment rather than a silent `?.`. |
| 3 | **A release resolved for one environment could not be promoted.** `resolvedConfig` held a single environment's resolution, so promoting to production would have applied staging's numbers — defeating the one property §13 spends a section on. | The release freezes **all three** resolutions together, so the diff an approver reviews is what each environment gets. |
| 4 | **The authorization contract suite's "collaborator" was never a member.** It reused the stranger's identity, which makes every collaborator expectation indistinguishable from a stranger's — a suite that looks like four tiers and tests two. | Four distinct dev identities; the collaborator is added through the API in `beforeAll`; the stranger's emptiness is asserted, not assumed. |
| 5 | **No route required `members:manage`, so `assertCapability`'s `FORBIDDEN` branch was never exercised.** Every case in the suite was pass-or-hidden. Half the capability model had no test. | `POST /projects/:id/members` was added to Task 18, giving the suite its 403 case. |
| 6 | **`checkBlueprintCompatibility` had no call site.** Task 6 built it; nothing called it, so D30's whole argument for pulling the descriptor forward would have shipped unused. | It gates the build route, where a blueprint major version can move under an unchanged spec. |
| 7 | **Task 1's boundary test exempted most boundary crossings.** Its regex matched one `../` only, so `src/index.ts`'s `./db/client.js` and `api/routes/*`'s `../../db/schema.js` — the majority of real crossings — were invisible. It would have stayed green through every violation Tasks 17–19 originally contained. | The test resolves each import and compares modules, so subdirectories inside a module (`api/routes/`) stay legal while any depth of crossing is caught. Every import in Tasks 11–21 was then routed through a public entry point. |

**Two of these — 1 and 7 — are the same failure in different clothes**: a check that
was green because it was not looking, rather than because the thing it checked was
right. That is the lesson the roadmap records as *"a green result is not evidence a
control is in force"*, arriving twice more in one review.

**The negative-control step in each task is not decoration.** Seven of the eleven new
tasks end by breaking the thing they just built and watching a **named** test fail.
Defect 7 is what happens when that step is skipped: Task 1's boundary test did have a
"prove it fails" step, it did fail as promised — and it still exempted two thirds of
the import graph, because the demonstration used the one shape the regex caught.
