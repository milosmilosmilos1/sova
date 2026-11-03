import { expect, test } from '@playwright/test'

import { emptyProfile } from '../../src/lib/brand/profile-schema'
import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Profili mreža (D-143): sačuvani opisi profila za svaku mrežu, sa brojačem znakova, linkom u profilu i
 * dugmetom za kopiranje; napomena da Google ne dozvoljava link u opisu.
 */
let seeded: Seeded | undefined
const SITE = 'https://adaptiko.rs'
const BIO = 'Adaptacija stanova po fiksnoj ceni\nBeograd\nZakažite besplatnu procenu'

test.beforeAll(async () => {
  seeded = await seedWorkspace('profilekit')
  const profile = emptyProfile({ name: 'Adaptiko', contentLocale: 'sr-Latn', websiteUrl: SITE })
  const inserted = await admin
    .from('brand_profiles')
    .insert({ brand_id: seeded.brandId, version: 1, data: profile, is_current: true })
  if (inserted.error) throw new Error(inserted.error.message)
  const bios = {
    instagram: { name: 'Adaptiko | Adaptacija stanova', short: BIO },
    facebook: {
      short: 'Adaptacija stanova po fiksnoj ceni.',
      long: `Renoviramo stanove u Beogradu.\n\n${SITE}`,
    },
    linkedin: {
      short: 'Adaptacija stanova',
      long: `O nama.\n\n${SITE}`,
      keywords: ['Adaptacija stanova', 'Enterijer'],
    },
    tiktok: { name: 'Adaptiko', short: 'Pre i posle adaptacije' },
    x: { name: 'Adaptiko', short: 'Adaptacija stanova u Beogradu.' },
    youtube: { long: `Pre i posle adaptacija.\n\n${SITE}`, keywords: ['adaptacija'] },
    pinterest: { name: 'Adaptiko', long: `Ideje za stan.\n\n${SITE}` },
    google_business: { long: 'Adaptacija stanova u Beogradu po fiksnoj ceni.' },
  }
  const updated = await admin
    .from('brands')
    .update({ website_url: SITE, settings: { profileKit: { bios, biosAt: new Date().toISOString() } } })
    .eq('id', seeded.brandId)
  if (updated.error) throw new Error(updated.error.message)
})

test.afterAll(async () => {
  await cleanup(seeded)
})

test('profili mreža: opisi po mreži, brojač, link u profilu i kopiranje (D-143)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page, seeded!)
  await page.goto('/app/brand/profiles')
  await expect(page.getByRole('link', { name: 'Profili mreža' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: /Napravi ponovo \(3 tokena\)/ })).toBeVisible()
  await expect(page.getByText(`Sajt u opisima: ${SITE}`)).toBeVisible()

  const instagram = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Instagram' }) })
  await expect(instagram.getByText('Adaptiko | Adaptacija stanova')).toBeVisible()
  await expect(instagram.getByText(`${Array.from(BIO).length} / 150`)).toBeVisible()
  await expect(instagram.getByText(SITE)).toBeVisible()
  await expect(page.getByText('Google ne dozvoljava linkove u opisu')).toBeVisible()

  await instagram.getByRole('button', { name: 'Kopiraj: Bio' }).click()
  await expect(instagram.getByRole('button', { name: 'Kopiraj: Bio' })).toContainText('Kopirano')
  // Windows klipbord menja prelaz reda u CRLF
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied.replace(/\r\n/g, '\n')).toBe(BIO)

  expect(await seriousViolations(page, 'profili mreža')).toEqual([])
})
