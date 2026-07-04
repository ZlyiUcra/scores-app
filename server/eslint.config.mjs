import tseslint from 'typescript-eslint';

// Import-boundary lint: the rule set here is architectural plus the one
// correctness rule the async storage contracts made mandatory. Layering:
// routes/socket -> services -> storage contracts -> storage driver; nothing
// skips a layer and only the sqlite driver knows sqlite exists.
export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // The one sanctioned namespace is the Express Request augmentation in
      // auth.ts (inline-disabled there); anywhere else it is a mistake.
      '@typescript-eslint/no-namespace': 'error',
      // A forgotten `await` on a mutation compiles clean and silently never
      // persists (Express 4 also swallows the rejection). Non-negotiable
      // since the storage contracts went async.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // Only the sqlite driver may know sqlite exists. Everything outside
    // src/storage imports the contracts surface (storage/index.js) at most.
    files: ['src/**/*.ts'],
    ignores: ['src/storage/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:sqlite',
              message: 'Only the storage/sqlite driver may import node:sqlite.',
            },
          ],
          patterns: [
            {
              group: ['**/storage/sqlite/**'],
              message: 'Driver internals are private - import from storage/index.js.',
            },
          ],
        },
      ],
    },
  },
  {
    // Routes and the socket bridge talk to SERVICES only — never to storage
    // (this block REPLACES the one above for these files, so it restates the
    // node:sqlite path; no-restricted-imports configs do not merge).
    files: ['src/routes/**/*.ts', 'src/socket.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:sqlite',
              message: 'Only the storage/sqlite driver may import node:sqlite.',
            },
          ],
          patterns: [
            {
              group: ['**/storage/**'],
              message: 'Routes and socket.ts must not touch storage directly - go through a service.',
            },
          ],
        },
      ],
    },
  },
  {
    // The storage layer is a leaf: no upward imports into app layers.
    files: ['src/storage/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/**', '**/routes/**'],
              message: 'Storage must not import app layers above it.',
            },
          ],
        },
      ],
    },
  },
);
