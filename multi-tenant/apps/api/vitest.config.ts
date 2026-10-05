import { defineConfig } from 'vitest/config';

/** Unit tests: pure logic, no database. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
