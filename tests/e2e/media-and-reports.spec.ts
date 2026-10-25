import { readFile, writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import { cleanup, login, seedWorkspace, type Seeded } from './fixtures'

let s: Seeded

test.beforeAll(async () => {
  s = await seedWorkspace('mediji')
})

test.afterAll(async () => {
  await cleanup(s)
})

/** Uspravna slika sa prelazom boja (isečci sa različitih položaja daju različite fajlove). */
async function portrait(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      raw[i] = Math.round((y / height) * 255)
      raw[i + 1] = 110
      raw[i + 2] = Math.round((x / width) * 255)
    }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 85 })
    .toBuffer()
}

test('slika 9:16 za Instagram dobija upozorenje i seče se na 4:5 uz pregled (N9)', async ({ page }, info) => {
  await login(page, s)
  const file = info.outputPath('uspravna-9x16.jpg')
  await writeFile(file, await portrait(540, 960))
  await page.goto('/app/posts/new')
  await page.locator('label', { hasText: 'e2e.instagram' }).locator('input[type=checkbox]').check()
  await page.getByLabel('Otpremi fotografiju ili video').setInputFiles(file)
  await expect(page.getByText('ima odnos 9:16')).toBeVisible()

  await page.getByRole('button', { name: 'Iseci na 4:5' }).click()
  await page.getByLabel('Položaj isečka').fill('20')
  await page.getByRole('button', { name: 'Iseci na 4:5' }).click()
  await expect(page.getByText('ima odnos 9:16')).toHaveCount(0)
  // isečak je izabran umesto originala, original ostaje u biblioteci
  await expect(page.locator('button:has(img)')).toHaveCount(2)
})

test('Analitika pravi mesečni PDF izveštaj i nudi ga za preuzimanje (D-094)', async ({ page }) => {
  await login(page, s)
  await page.goto('/app/analytics')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Napravi PDF' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^izvestaj-e2e-brend-mediji-\d{4}-\d{2}\.pdf$/)
  const bytes = await readFile(await download.path())
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  await expect(page.getByRole('link', { name: 'Preuzmi' })).toBeVisible()
})
