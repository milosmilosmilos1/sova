import { defineConfig, devices } from '@playwright/test'

/**
 * E2E nad lokalnim dev serverom i lokalnim Supabase-om (Mailpit za emailove).
 * Pokretanje: npm run test:e2e (ako dev server ne radi, Playwright ga pokreće sam).
 */
export default defineConfig({
  testDir: './tests/e2e',
  // dev server prevodi rutu pri prvom zahtevu (10–20 s na hladnom .next), pa su granice šire nego za build
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    // Svaki run dobija svoju "IP adresu" da rate limit po IP (registracija 3/h) ne obara ponovljene lokalne runove.
    // U produkciji platforma prepisuje x-forwarded-for, pa ovo nema bezbednosni uticaj.
    extraHTTPHeaders: {
      'x-forwarded-for': `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'sr-Latn-RS',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3001/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
