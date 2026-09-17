import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/test/**/*.test.ts'],
    globalSetup: ['server/test/fixtures/globalSetup.ts'],
    env: {
      // Keeps the suite's output to test results rather than application logs.
      AIRFLAC_LOG_LEVEL: 'error',
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
