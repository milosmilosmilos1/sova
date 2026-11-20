import { expect, test } from '@playwright/test'

import { seriousViolations } from './axe'
import { cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Šabloni koje biznis popunjava sam (D-175): spisak, forma sa pregledom u stilu brenda, opis od
 * upisanih podataka i nacrt koji se otvara u editoru za zakazivanje. Bez AI-ja i bez tokena.
 */
let s: Seeded

test.beforeAll(async () => {
  s = await seedWorkspace('sabloni')
})
test.afterAll(async () => cleanup(s))

test('kviz: od popunjavanja do nacrta u editoru', async ({ page }) => {
  await login(page, s)
  await page.goto('/app/templates')
  await expect(page.getByRole('heading', { level: 1, name: 'Šabloni' })).toBeVisible()
  expect(await seriousViolations(page, 'šabloni')).toEqual([])

  await page.getByRole('link', { name: /Kviz/ }).click()
  await expect(page).toHaveURL(/\/app\/templates\/quiz$/)
  // pre unosa nema pregleda, a čuvanje pokazuje šta fali
  await expect(page.getByText('Popunite obavezna polja i pregled se pojavljuje ovde.')).toBeVisible()
  await page.getByRole('button', { name: 'Napravi nacrt' }).click()
  await expect(page.getByText('Popunite ovo polje.').first()).toBeVisible()

  await page.getByLabel('Pitanje', { exact: true }).fill('Koliko često se čisti klima?')
  await page.getByLabel('Odgovori 1').fill('Jednom godišnje')
  await page.getByRole('button', { name: 'Dodaj' }).click()
  await page.getByLabel('Odgovori 2').fill('Dvaput godišnje')
  await page.getByRole('radio', { name: /B\)/ }).check()

  // pregled u stilu brenda i opis od upisanih podataka
  await expect(page.getByRole('img', { name: 'Slajd 1' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Slajd 2' })).toBeVisible()
  await expect(page.getByLabel('Opis objave')).toHaveValue(/Kviz: Koliko često se čisti klima\?/)
  await expect(page.getByLabel('Opis objave')).toHaveValue(/A\) Jednom godišnje\nB\) Dvaput godišnje/)
  expect(await seriousViolations(page, 'kviz')).toEqual([])

  // korisnik menja opis; nacrt se otvara u editoru, gde se zakazuje
  await page.getByLabel('Opis objave').fill('Kviz za pratioce: koliko često čistite klimu?')
  await page.getByRole('button', { name: 'Napravi nacrt' }).click()
  await expect(page).toHaveURL(/\/app\/posts\/[0-9a-f-]{36}/)
  await expect(page.getByLabel('Tekst objave')).toHaveValue('Kviz za pratioce: koliko često čistite klimu?')
})
