// @ts-check
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';
import { base } from './base.js';

/**
 * Next.js application configuration.
 *
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 */
export function next(options) {
  return [
    ...base({ ...options, ignores: ['next-env.d.ts', ...(options.ignores ?? [])] }),
    ...nextCoreWebVitals,
    {
      languageOptions: { globals: { ...globals.browser } },
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // Async event handlers (onClick={async () => …}) are idiomatic in React.
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
      },
    },
    {
      // Next's parser handles plain JS config files; TS-AST rules do not apply to them.
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      rules: {
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-unused-vars': 'error',
      },
    },
  ];
}
