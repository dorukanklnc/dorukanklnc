import { next } from '@repo/eslint-config/next';

export default next({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['playwright-report/**', 'test-results/**'],
});
