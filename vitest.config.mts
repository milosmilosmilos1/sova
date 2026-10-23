import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` baca grešku van React Server okruženja; u testovima je prazan modul.
      'server-only': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tests/mocks/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'tests/integration/**', 'node_modules/**'],
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3001',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-test-anon-key-test',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-test-service',
      TOKEN_ENCRYPTION_KEY: 'v1:YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=',
      CRON_SECRET: 'test-cron-secret-123456',
      IMPERSONATION_SECRET: 'test-impersonation-secret-at-least-32-chars',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/services/**', 'src/integrations/**', 'src/inngest/**'],
      reporter: ['text', 'lcov'],
    },
  },
})
