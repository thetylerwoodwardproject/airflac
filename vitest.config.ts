import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/test/**/*.test.ts'],
    globalSetup: ['server/test/fixtures/globalSetup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
