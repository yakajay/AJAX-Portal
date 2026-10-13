import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/helpers/setup.js'],
    include: ['tests/**/*.test.js'],
    // Integration tests share one database per file; files run in separate workers
    testTimeout: 30000,
    hookTimeout: 120000,
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent', JWT_SECRET: 'test-secret-test-secret-test-secret' }
  }
});
