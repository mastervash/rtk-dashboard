import { defineConfig } from 'vitest/config';

// Deliberately not extending vite.config.ts — these are Node-side API tests and
// have no need for the React or Tailwind plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // paths.js reads process.env at import time and the helpers reset the
    // module graph per case, so files must not share a worker.
    fileParallelism: false,
    restoreMocks: true,
  },
});
