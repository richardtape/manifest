import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/drizzle/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['packages/control-plane/src/**/*.ts'],
    rules: {
      // An underscore prefix is the project's "deliberately unused" marker. The
      // Driver interface fixes several signatures that an implementation may not
      // need in full — the fake driver's `exec(id, cmd, _opts)` is the first —
      // and without this the rule fires on faithfully implementing the interface.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // §5's module boundary is enforced by src/module-boundaries.test.ts, NOT here.
      //
      // `no-restricted-imports` matches its `group` globs with gitignore semantics,
      // and that dialect cannot express this rule. Measured 2026-09-05: a ban wide
      // enough to catch `../db/schema.js` — say `../*/*` — also matches the
      // DIRECTORY `../../identity`, and gitignore cannot re-include a file whose
      // parent directory is excluded. So `!../../*/index.js` is unreachable and a
      // legitimate `api/routes/auth.ts -> ../../identity/index.js` is reported as a
      // violation. Every arrangement of bans and negations tried had the same hole:
      // the two are the same pattern at different depths.
      //
      // This is the second defect this one rule has produced (the first: ESLint 9's
      // globs have no extglob, so `!(index)` matched nothing). The test resolves
      // each import and compares the modules the two files belong to, which is
      // correct at any depth and is what self-review defect 7 fixed it to do.
      // Verified by pointing api/routes/auth.ts at ../../identity/session.js and
      // watching the test name both violations.
      //
      // If a lint-time check is wanted back, it needs a rule that understands paths
      // rather than globs — eslint-plugin-import's `no-restricted-paths` zones.
    },
  },
)
