import { expect, test } from '@playwright/test'

import { emptyProfile } from '../../src/lib/brand/profile-schema'
import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Profili mreža (D-143): sačuvani opisi profila za svaku mrežu, sa brojačem znakova, linkom u profilu i
 * dugmetom za kopiranje; napomena da Google ne dozvoljava link u opisu.
 * Instagram highlights (D-144): naslovne u boji brenda, preuzimanje i priča od kadrova u Odobravanju.
 * Naslovne slike profila (D-145): pregled za šest mreža, izmena teksta i preuzimanje.
 * Dodaci po mreži (D-146): table, pitanja za početak razgovora, kopiranje i nacrt od objave za vrh.
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
  const highlights = [
    {
      title: 'Usluge',
      icon: 'services',
      visual_query: 'apartment renovation',
      frames: [
        { title: 'Adaptacija od projekta do ključa', body: 'Jedan koordinator vodi ceo posao.' },
        { title: 'Zakažite procenu', body: 'Pišite nam u poruke.' },
      ],
    },
    {
      title: 'Kontakt',
      icon: 'contact',
      visual_query: 'phone call',
      frames: [{ title: 'Pozovite nas', body: 'Radnim danima od 8 do 16.' }],
    },
  ]
  const extras = {
    pinterest_boards: [{ name: 'Adaptacija malog stana', description: 'Ideje za male stanove u Beogradu.' }],
    youtube_playlists: [{ title: 'Pre i posle', description: 'Završeni stanovi.' }],
    youtube_trailer: { hook: 'Renovirate stan?', script: 'Ovde vidite kako radimo.', cta: 'Pretplatite se.' },
    google_services: [{ name: 'Adaptacija stanova', description: 'Od projekta do ključa.' }],
    ice_breakers: [{ question: 'Koliko traje adaptacija?', answer: 'Zavisi od stana; pišite nam.' }],
    pinned_posts: [
      { title: 'Ko smo', why: 'Prvi utisak.', text: 'Adaptiko renovira stanove od projekta do ključa.' },
    ],
  }
  const at = new Date().toISOString()
  const updated = await admin
    .from('brands')
    .update({
      website_url: SITE,
      settings: { profileKit: { bios, biosAt: at, highlights, highlightsAt: at, extras, extrasAt: at } },
      // priča se crta bez fotografija, da test ne zove Unsplash i Pexels
      design: { photoSource: 'none' },
    })
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

  const instagram = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Instagram', exact: true }) })
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

test('profili mreža: Instagram highlights, naslovne, preuzimanje i priča u Odobravanju (D-144)', async ({
  page,
}) => {
  await login(page, seeded!)
  await page.goto('/app/brand/profiles')
  await expect(page.getByRole('button', { name: /Napravi nove \(3 tokena\)/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preuzmi sve naslovne (ZIP)' })).toHaveAttribute(
    'href',
    `/api/brands/${seeded!.brandId}/profile-kit/highlights/covers`,
  )
  await expect(page.getByText('Ovako izgledaju na profilu')).toBeVisible()

  // naslovna stiže kao PNG 1080×1920
  const cover = page.getByRole('img', { name: 'Naslovna za Usluge' })
  await expect(cover).toBeVisible()
  await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1080)
  const item = page.locator('section').filter({ has: cover })
  await expect(item.getByText('6 / 15')).toBeVisible()
  await expect(item.getByText('Adaptacija od projekta do ključa')).toBeVisible()
  await expect(item.getByRole('button', { name: 'Preuzmi naslovnu' })).toHaveAttribute(
    'href',
    /\/highlights\/0\/cover\?v=.+&download=1$/,
  )
  await expect(page.getByText('Kako ih dodati na profil')).toBeVisible()

  await item.getByRole('button', { name: 'Napravi priču' }).click()
  await expect(item.getByRole('status')).toContainText('Priča je u Odobravanju.', { timeout: 30_000 })
  await expect(item.getByRole('link', { name: 'Otvori objavu' })).toHaveAttribute(
    'href',
    /^\/app\/posts\/[0-9a-f-]{36}$/,
  )

  expect(await seriousViolations(page, 'instagram highlights')).toEqual([])
})

test('profili mreža: naslovne slike profila, izmena teksta i preuzimanje (D-145)', async ({ page }) => {
  await login(page, seeded!)
  await page.goto('/app/brand/profiles')
  await expect(page.getByText('Profilna i naslovne slike', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Profilna slika brenda' })).toBeVisible()
  const title = page.getByLabel('Naslov', { exact: true })
  await expect(title).toHaveValue('E2E brend profilekit')
  await expect(page.getByLabel('Podnaslov')).toHaveValue('Adaptacija stanova')
  await expect(page.getByLabel('Sajt ili nalog')).toHaveValue('adaptiko.rs')
  await expect(page.getByRole('img', { name: /^Naslovna slika za / })).toHaveCount(6)

  // pregled je PNG širok 960 px
  const facebook = page.getByRole('img', { name: 'Naslovna slika za Facebook stranica' })
  await facebook.scrollIntoViewIfNeeded()
  await expect.poll(() => facebook.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(960)

  await title.fill('Adaptiko Beograd')
  await expect(facebook).toHaveAttribute('src', /title=Adaptiko\+Beograd/)
  await expect(page.getByRole('button', { name: 'Preuzmi: Facebook stranica' })).toHaveAttribute(
    'href',
    /\/banners\/facebook\?.*title=Adaptiko\+Beograd.*download=1/,
  )
  await expect(page.getByRole('button', { name: 'Preuzmi sve (ZIP)' })).toHaveAttribute(
    'href',
    new RegExp(`^/api/brands/${seeded!.brandId}/profile-kit/banners\?`),
  )

  expect(await seriousViolations(page, 'naslovne profila')).toEqual([])
})

test('profili mreža: sadržaj po mreži, kopiranje i nacrt od objave za vrh profila (D-146)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page, seeded!)
  await page.goto('/app/brand/profiles')
  await expect(page.getByRole('button', { name: /Napravi nov sadržaj \(3 tokena\)/ })).toBeVisible()
  const section = (name: string | RegExp) =>
    page.locator('section').filter({ has: page.getByRole('heading', { name }) })

  const boards = section('Pinterest: table')
  await expect(boards.getByText('Adaptacija malog stana')).toBeVisible()
  await expect(boards.getByText(`${'Adaptacija malog stana'.length} / 50`)).toBeVisible()
  await expect(section('Google profil: usluge').getByText('Adaptacija stanova')).toBeVisible()

  const ice = section(/pitanja za početak razgovora/)
  await ice.getByRole('button', { name: 'Kopiraj: Pitanje' }).click()
  await expect(ice.getByRole('button', { name: 'Kopiraj: Pitanje' })).toContainText('Kopirano')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Koliko traje adaptacija?')

  const pinned = section('Objave za vrh profila')
  await pinned.getByRole('button', { name: 'Napravi nacrt' }).click()
  await expect(pinned.getByRole('status')).toContainText('Nacrt je napravljen.')
  await expect(pinned.getByRole('link', { name: 'Otvori nacrt' })).toHaveAttribute(
    'href',
    /^\/app\/posts\/[0-9a-f-]{36}$/,
  )

  expect(await seriousViolations(page, 'sadržaj po mreži')).toEqual([])
})
