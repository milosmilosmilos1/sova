import { expect, test } from '@playwright/test'

import { seriousViolations } from './axe'
import { cleanup, login, seedWorkspace, type Seeded } from './fixtures'

let s: Seeded

test.beforeAll(async () => {
  s = await seedWorkspace('objave')
})

test.afterAll(async () => {
  await cleanup(s)
})

/** termin sutra; vreme u polju je po zoni brenda (Europe/Belgrade) bez obzira na zonu pregledača */
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

test.describe.serial('objava od nacrta do kalendara i odobrenje klijenta', () => {
  test('nacrt se čuva, zakazuje i vidi u kalendaru', async ({ page }) => {
    await login(page, s)
    const text = `Pred zimu očistite filtere klime i proverite odvod (${Date.now()}).`
    await page.goto('/app/posts/new')
    await page.getByLabel('Tekst objave').fill(text)
    await page.locator('label', { hasText: 'E2E strana' }).locator('input[type=checkbox]').check()
    await page.getByRole('button', { name: 'Sačuvaj nacrt' }).click()
    await expect(page).toHaveURL(/\/app\/posts\/[0-9a-f-]{36}$/)

    await page.getByLabel('Termin objave').fill(`${tomorrow}T10:17`)
    await page.getByRole('button', { name: 'Zakaži' }).click()
    await expect(page.getByText('zakazano', { exact: true }).first()).toBeVisible()

    await page.goto('/app/calendar')
    await expect(page.getByText(text.slice(0, 40))).toBeVisible()
  })

  test('klijent bez naloga odobrava objavu preko javnog linka', async ({ page, browser }) => {
    await login(page, s)
    const text = `Jesenja akcija: servis klime uz dezinfekciju unutrašnje jedinice (${Date.now()}).`
    await page.goto('/app/posts/new')
    await page.getByLabel('Tekst objave').fill(text)
    await page.locator('label', { hasText: 'E2E strana' }).locator('input[type=checkbox]').check()
    await page.getByRole('button', { name: 'Sačuvaj nacrt' }).click()
    await expect(page).toHaveURL(/\/app\/posts\/[0-9a-f-]{36}$/)
    await page.getByRole('button', { name: 'Pošalji na odobrenje' }).click()
    await expect(page.getByText('na odobrenju', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Napravi link' }).click()
    const link = page.getByLabel('Link za klijenta')
    await expect(link).toHaveValue(/\/approve\//)
    const url = await link.inputValue()

    const client = await browser.newContext()
    const cp = await client.newPage()
    await cp.goto(url)
    await expect(cp.getByRole('heading', { name: /Objave za odobrenje/ })).toBeVisible()
    await expect(cp.getByText(text)).toBeVisible()
    expect(await seriousViolations(cp, '/approve')).toEqual([])
    await cp.getByLabel('Vaše ime (opciono)').fill('Klijent E2E')
    await cp.getByRole('button', { name: 'Odobri' }).click()
    await expect(cp.getByText(/^Odluka:/)).toBeVisible()
    await client.close()

    await page.reload()
    await expect(page.getByText('odobreno', { exact: true }).first()).toBeVisible()
  })
})
