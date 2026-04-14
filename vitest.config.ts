import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // `threads` is faster; switch to `forks` if tests need process isolation.
    pool: 'threads',
  },
});
