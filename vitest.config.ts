import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{mjs,ts}', 'src/**/*.test.ts', 'proxy/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 15000,
  },
});
