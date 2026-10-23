import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Integracioni testovi: API rute nad lokalnim Supabase-om, u procesu (bez dev servera).
 * Pokretanje: npm run test:integration (traži `supabase start` i .env.local).
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { 'server-only': path.resolve(root, 'tests/mocks/server-only.ts') },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
