import { expect, test, type Page } from '@playwright/test'

import { seriousViolations } from './axe'
import { cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Pristupačnost (faza 15): axe nad javnim stranama i stranama aplikacije u svetloj i tamnoj temi.
 * Strana za odobravanje se proverava u posts.spec.ts (traži link iz objave).
 */
const PUBLIC_PAGES = ['/', '/login', '/register', '/privacy', '/terms', '/data-deletion', '/kontakt', '/bot']
const APP_PAGES = [
  '/app',
  '/app/posts',
  '/app/posts/new',
  '/app/calendar',
  '/app/analytics',
  '/app/inbox',
  '/app/strategy',
  '/app/autopilot',
  '/app/studio',
  '/app/brand',
  '/app/accounts',
  '/app/team',
  '/app/billing',
  '/app/settings',
  '/app/notifications',
]

async function auditAll(page: Page, paths: string[], suffix = ''): Promise<string[]> {
  const problems: string[] = []
  for (const path of paths) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    problems.push(...(await seriousViolations(page, `${path}${suffix}`)))
  }
  return problems
}

let s: Seeded

test.beforeAll(async () => {
  s = await seedWorkspace('pristupacnost')
})

test.afterAll(async () => {
  await cleanup(s)
})

test('javne strane nemaju ozbiljne prepreke pristupačnosti', async ({ page }) => {
  // demo na landingu se sam menja na 4,5 s i panel se pojavljuje kroz providnost; bez animacija
  // axe meri konačan izgled, a ne trenutak usred prelaza (D-098)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await auditAll(page, PUBLIC_PAGES)).toEqual([])
})

test('strane aplikacije nemaju ozbiljne prepreke pristupačnosti (svetla tema)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await login(page, s)
  expect(await auditAll(page, APP_PAGES)).toEqual([])
})

test('strane aplikacije nemaju ozbiljne prepreke pristupačnosti (tamna tema)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await login(page, s)
  expect(await auditAll(page, APP_PAGES, ' (tamna)')).toEqual([])
})
