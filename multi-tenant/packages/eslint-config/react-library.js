// @ts-check
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { base } from './base.js';

/**
 * React component library configuration (no Next.js specifics).
 *
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 */
export function reactLibrary(options) {
  return [
    ...base(options),
    reactHooks.configs.flat['recommended-latest'] ?? reactHooks.configs['recommended-latest'],
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
