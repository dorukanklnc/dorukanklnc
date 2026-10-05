// @ts-check
import { base } from './base.js';

/**
 * NestJS (ESM) configuration.
 *
 * `consistent-type-imports` is disabled because Nest's dependency injection relies on
 * `emitDecoratorMetadata`: a class imported only for a constructor parameter type must stay a
 * value import, otherwise the emitted metadata degrades to `Object` and injection silently fails.
 *
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 */
export function nest(options) {
  return [
    ...base(options),
    {
      rules: {
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/no-extraneous-class': 'off',
      },
    },
    {
      files: ['src/scripts/**/*.ts', 'src/database/seed/**/*.ts'],
      rules: { 'no-console': 'off' },
    },
  ];
}
