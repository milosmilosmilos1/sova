import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Živi testovi: pravi Gemini i pravi sajt nad lokalnim Supabase-om. Troše prave pozive (oko 0,2 USD
 * po prolazu), pa se pokreću samo ručno: npm run test:live. Nikad u CI-ju.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': path.resolve(root, 'tests/mocks/server-only.ts') },
  },
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.test.ts'],
    setupFiles: ['tests/live/setup.ts'],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
