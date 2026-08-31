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
              group: [
                // ESLint 9's `group` takes gitignore-style globs, which have no
                // extglob: `!(index)` is read literally and matches nothing. A
                // leading `!` is the negation this syntax does support.
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
