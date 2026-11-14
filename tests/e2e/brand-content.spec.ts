import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Vrste objava (D-165): prekidač po vrsti, utisak klijenta unet ručno i član tima sa fotografijom iz
 * Galerije brenda. Sova od ovih podataka pravi objave i ništa ne izmišlja.
 */
let seeded: Seeded | undefined

test.beforeAll(async () => {
  seeded = await seedWorkspace('content')
  const id = crypto.randomUUID()
  const path = `ws/${seeded.workspaceId}/brand/${seeded.brandId}/uploads/${id}.png`
  const png = await sharp({ create: { width: 96, height: 96, channels: 3, background: '#2f6f5e' } })
    .png()
    .toBuffer()
  const up = await admin.storage.from('uploads').upload(path, png, { contentType: 'image/png' })
  if (up.error) throw new Error(up.error.message)
  const { error } = await admin.from('media_assets').insert({
    id,
    workspace_id: seeded.workspaceId,
    brand_id: seeded.brandId,
    kind: 'image',
    source: 'upload',
    bucket: 'uploads',
    storage_path: path,
    mime_type: 'image/png',
    size_bytes: png.length,
    width: 96,
    height: 96,
    description: 'Nikola u radionici',
  })
  if (error) throw new Error(error.message)
})

test.afterAll(async () => {
  await cleanup(seeded)
})

test('vrste objava: prekidač, utisak klijenta i član tima sa fotografijom (D-165)', async ({ page }) => {
  await login(page, seeded!)
  await page.goto('/app/brand/content')
  await expect(page.getByRole('link', { name: 'Vrste objava' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Još ništa nije uneto, pa Sova ovu vrstu ne predlaže.')).toHaveCount(3)

  // humor isključen
  const humorOff = page.getByRole('group', { name: 'Humor' }).getByRole('button', { name: 'Isključeno' })
  await humorOff.click()
  await expect(humorOff).toHaveAttribute('aria-pressed', 'true')

  // utisak klijenta
  await page.getByRole('button', { name: 'Dodaj utisak' }).click()
  await page.getByLabel('Ko je napisao').fill('Marija P.')
  await page.getByLabel('Kratak opis klijenta').fill('vlasnica stana na Vračaru')
  await page.getByLabel('Utisak', { exact: true }).fill('Majstori su došli na vreme i ostavili čisto.')
  await page.getByLabel('Ocena').selectOption('5')
  await page.getByLabel('Odakle je').selectOption('google')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('„Majstori su došli na vreme i ostavili čisto.”')).toBeVisible()
  await expect(page.getByText('Marija P., vlasnica stana na Vračaru · Google · ★★★★★')).toBeVisible()
  await expect(page.getByText('Uneto: 1')).toBeVisible()

  // član tima sa fotografijom iz Galerije
  await page.getByRole('button', { name: 'Dodaj osobu' }).click()
  await page.getByRole('button', { name: 'Izaberite fotografiju' }).click()
  const picker = page.getByRole('dialog')
  await expect(picker.getByRole('heading', { name: 'Izaberite fotografiju' })).toBeVisible()
  await picker.getByRole('button', { name: 'Nikola u radionici' }).click()
  await expect(picker).toBeHidden()
  await page.getByLabel('Ime', { exact: true }).fill('Nikola')
  await page.getByLabel('Uloga').fill('Keramičar')
  await page.getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByRole('img', { name: 'Nikola', exact: true })).toBeVisible()
  await expect(page.getByText('Keramičar', { exact: true })).toBeVisible()

  // posle osvežavanja sve ostaje
  await page.reload()
  await expect(humorOff).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('„Majstori su došli na vreme i ostavili čisto.”')).toBeVisible()
  expect(await seriousViolations(page, 'vrste objava')).toEqual([])
})
