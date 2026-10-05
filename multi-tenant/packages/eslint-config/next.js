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
      rules: {
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
      },
    },
  ];
}
