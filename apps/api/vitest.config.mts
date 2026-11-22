import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Loads the repo-root .env so tests can read TEST_DATABASE_URL.
    setupFiles: ['./tests/helpers/load-env.ts'],
  },
});
