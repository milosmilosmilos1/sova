import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Pregled na mreži (D-138): u Odobravanju se objava vidi kao na Instagramu i Facebooku, sa opisom
 * skraćenim gde mreža stavlja „više”, slikom objave i prvim komentarom; vide se i nesačuvane izmene.
 */
let seeded: Seeded | undefined

const TEXT =
  'Planirate team building, a niste sigurni koliki budžet da odvojite po zaposlenom? Troškovi zavise od formata događaja i broja ljudi, ali osnovna računica je jednostavna. #teambuilding'

test.beforeAll(async () => {
  seeded = await seedWorkspace('netpreview')
  const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`)
    return r.data
  }
  const image = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#0F766E' } })
    .jpeg()
    .toBuffer()
  const id = randomUUID()
  const path = `${seeded.workspaceId}/${seeded.brandId}/uploads/${id}.jpg`
  must(await admin.storage.from('uploads').upload(path, image, { contentType: 'image/jpeg' }), 'Slika')
  must(
    await admin.from('media_assets').insert({
      id,
      workspace_id: seeded.workspaceId,
      brand_id: seeded.brandId,
      kind: 'image',
      source: 'upload',
      bucket: 'uploads',
      storage_path: path,
      mime_type: 'image/jpeg',
      size_bytes: image.length,
      width: 1080,
      height: 1350,
    }),
    'Medij',
  )
  const post = must(
    await admin
      .from('posts')
      .insert({
        brand_id: seeded.brandId,
        workspace_id: seeded.workspaceId,
        title: 'Budžet za team building',
        master_text: TEXT,
        first_comment: 'Pišite nam za ponudu.',
        status: 'in_review',
        created_by: seeded.userId,
      })
      .select('id')
      .single(),
    'Objava',
  )!
  must(
    await admin.from('post_targets').insert([
      {
        post_id: post.id,
        brand_id: seeded.brandId,
        social_account_id: seeded.instagramId,
        platform: 'instagram',
      },
      {
        post_id: post.id,
        brand_id: seeded.brandId,
        social_account_id: seeded.facebookId,
        platform: 'facebook',
      },
    ]),
    'Mreže',
  )
  must(
    await admin.from('post_media').insert({ post_id: post.id, media_asset_id: id, sort_order: 0 }),
    'Slika objave',
  )
})

test.afterAll(async () => {
  await cleanup(seeded)
})

test('pregled na mreži: Instagram skraćuje opis i pokazuje sliku, Facebook prvi komentar (D-138)', async ({
  page,
}) => {
  await login(page, seeded!)
  await page.goto('/app/approvals')
  await page.getByRole('button', { name: 'Pregled na mreži', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Kako će objava izgledati' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('tab', { name: /Instagram/ }).click()
  const panel = dialog.getByRole('tabpanel')
  await expect(panel.getByText('e2e.instagram').first()).toBeVisible()
  await expect(panel.locator('img[src*="uploads"]')).toBeVisible()
  // opis je skraćen pre heštega, kao u feedu
  await expect(panel.getByText('#teambuilding')).toHaveCount(0)
  expect(await seriousViolations(page, 'pregled na mreži')).toEqual([])
  await panel.getByRole('button', { name: 'više' }).click()
  await expect(panel.getByText('#teambuilding')).toBeVisible()

  await dialog.getByRole('tab', { name: /Facebook/ }).click()
  await expect(panel.getByText('E2E strana').first()).toBeVisible()
  await expect(panel.getByText('Pišite nam za ponudu.')).toBeVisible()
  await page.keyboard.press('Escape')

  // nesačuvana izmena opisa odmah se vidi u pregledu
  await page.getByRole('textbox', { name: 'Opis', exact: true }).fill('Kratak opis za proveru')
  await page.getByRole('button', { name: 'Pregled na mreži', exact: true }).click()
  await expect(dialog.getByRole('tabpanel').getByText('Kratak opis za proveru')).toBeVisible()
})
