import { defineConfig } from 'vitest/config';

// Tests use their own database: API tests TRUNCATE tables between cases.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://dreamway:dreamway@localhost:5433/dreamway_operation_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    // API tests truncate shared tables, so test files must not run concurrently
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-only-jwt-secret',
    },
  },
});
