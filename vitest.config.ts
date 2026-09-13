import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // Local bare-repo cases execute several Git subprocesses under concurrent CI workers.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
