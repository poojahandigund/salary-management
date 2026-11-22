import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Loads the repo-root .env so tests can read TEST_DATABASE_URL.
    setupFiles: ['./tests/helpers/load-env.ts'],
    // Test files that use the database reset it, so they must not run at the same time.
    // The suite takes about a second, so running files one after another costs almost nothing.
    fileParallelism: false,
  },
});
