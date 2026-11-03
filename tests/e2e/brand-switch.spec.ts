import { expect, test } from '@playwright/test'

import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Birač brenda (D-137): svaki brend sa znakom u svojoj boji, da agencija sa više brendova odmah vidi
 * u kom je; izbor u biraču prebacuje aplikaciju na drugi brend.
 */
let seeded: Seeded | undefined

const colors = (primary: string) => ({
  primary,
  secondary: '#F59E0B',
  background: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
})

test.beforeAll(async () => {
  seeded = await seedWorkspace('switch')
  const own = await admin
    .from('brands')
    .update({ design: { colors: colors('#0F766E') } })
    .eq('id', seeded.brandId)
  if (own.error) throw new Error(own.error.message)
  const other = await admin.from('brands').insert({
    workspace_id: seeded.workspaceId,
    name: 'Drugi brend',
    design: { colors: colors('#990000') },
    setup_completed_at: new Date().toISOString(),
  })
  if (other.error) throw new Error(other.error.message)
})

test.afterAll(async () => {
  await cleanup(seeded)
})

test('birač brenda: brendovi u svojim bojama, izbor prebacuje na drugi brend (D-137)', async ({ page }) => {
  await login(page, seeded!)
  const picker = page.getByRole('combobox', { name: 'Brend' })
  await expect(picker).toContainText('E2E brend switch')
  await expect(picker.locator('span[aria-hidden]').first()).toHaveCSS('background-color', 'rgb(15, 118, 110)')

  await picker.click()
  const option = page.getByRole('option', { name: 'Drugi brend' })
  await expect(option).toBeVisible()
  await expect(option.locator('span[aria-hidden]').first()).toHaveCSS('background-color', 'rgb(153, 0, 0)')
  expect(await seriousViolations(page, 'birač brenda')).toEqual([])

  await option.click()
  await expect(page.getByRole('combobox', { name: 'Brend' })).toContainText('Drugi brend')
  await expect(page.getByText('vlasnik · Drugi brend')).toBeVisible()
})

test('stara strana posle nove objave: radnja koju server ne prepozna osveži stranu, bez greške (D-141)', async ({
  page,
}) => {
  await login(page, seeded!)
  // isto kao kad je strana otvorena pre objave: server ne prepoznaje oznaku serverske radnje
  let stale = 0
  await page.route('**/app**', async (route) => {
    const req = route.request()
    if (req.method() === 'POST' && req.headers()['next-action'] && stale === 0) {
      stale += 1
      return route.fulfill({
        status: 404,
        headers: { 'x-nextjs-action-not-found': '1', 'content-type': 'text/plain' },
        body: 'Server action not found.',
      })
    }
    return route.continue()
  })
  const reloaded = page.waitForEvent('load')
  await page.getByRole('combobox', { name: 'Brend' }).click()
  await page.getByRole('option', { name: 'Drugi brend' }).click()
  await reloaded
  expect(stale).toBe(1)
  await expect(page.getByRole('combobox', { name: 'Brend' })).toBeVisible()
  await expect(page.getByText('Nešto je pošlo naopako')).toHaveCount(0)
})
