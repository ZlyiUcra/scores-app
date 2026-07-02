import tseslint from 'typescript-eslint';

// Import-boundary lint: the ONLY rule set here is architectural. Style and
// correctness stay with TypeScript; this config exists to keep the layering
// honest (routes -> services -> repos, never skipping a layer).
export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // The one sanctioned namespace is the Express Request augmentation in
      // auth.ts (inline-disabled there); anywhere else it is a mistake.
      '@typescript-eslint/no-namespace': 'error',
    },
  },
  {
    files: ['src/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/repos/*'],
              message: 'Routes must not touch repositories directly - go through a service.',
            },
            {
              group: ['**/db.js', '**/db'],
              message: 'Routes must not touch the database directly - go through a service.',
            },
          ],
        },
      ],
    },
  },
);
