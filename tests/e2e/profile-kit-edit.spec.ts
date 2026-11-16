import { expect, test } from '@playwright/test'

import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Izmena i primena opisa profila (D-166): izmena u granici mreže, čuvanje i „Kopiraj i otvori profil”
 * za mrežu koja ne dozvoljava da Sova sama upiše opis. Poseban korisnik, jer je prijava ograničena na
 * pet pokušaja u 15 minuta po adresi i nalogu.
 */
let seeded: Seeded | undefined

test.beforeAll(async () => {
  seeded = await seedWorkspace('kitedit')
  const net = (fields: Record<string, unknown>) => fields
  const bios = {
    instagram: net({ name: 'Adaptiko', short: 'Adaptacija stanova po fiksnoj ceni' }),
    facebook: net({ short: 'Adaptacija stanova.', long: 'Renoviramo stanove u Beogradu.' }),
    linkedin: net({ short: 'Adaptacija', long: 'O nama.', keywords: ['Adaptacija'] }),
    tiktok: net({ name: 'Adaptiko', short: 'Pre i posle' }),
    x: net({ name: 'Adaptiko', short: 'Adaptacija stanova.' }),
    youtube: net({ long: 'Pre i posle adaptacija.', keywords: ['adaptacija'] }),
    pinterest: net({ name: 'Adaptiko', long: 'Ideje za stan.' }),
    google_business: net({ long: 'Adaptacija stanova u Beogradu po fiksnoj ceni.' }),
  }
  const { error } = await admin
    .from('brands')
    .update({ settings: { profileKit: { bios, biosAt: new Date().toISOString() } } })
    .eq('id', seeded.brandId)
  if (error) throw new Error(error.message)
})

test.afterAll(async () => {
  await cleanup(seeded)
})

test('profili mreža: izmena opisa, granica mreže i „Kopiraj i otvori profil” (D-166)', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // strana za izmenu profila se otvara u novom tabu; test ne ide na pravi Instagram
  await context.route('https://www.instagram.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Instagram</p>' }),
  )
  await login(page, seeded!)
  await page.goto('/app/brand/profiles')
  const instagram = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Instagram', exact: true }) })

  await instagram.getByRole('button', { name: 'Izmeni' }).click()
  const bio = instagram.getByLabel('Bio')
  await bio.fill('a'.repeat(151))
  await expect(instagram.getByText('Tekst je duži od granice mreže.')).toBeVisible()
  await expect(instagram.getByRole('button', { name: 'Sačuvaj' })).toBeDisabled()
  const text = 'Adaptacija stanova po fiksnoj ceni u Beogradu'
  await bio.fill(text)
  // čeka se odgovor servera: tekst u polju za unos se vidi i pre nego što je sačuvan
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/profile-kit/bios') && r.request().method() === 'PATCH' && r.ok(),
    ),
    instagram.getByRole('button', { name: 'Sačuvaj' }).click(),
  ])
  await expect(instagram.locator('textarea')).toHaveCount(0)
  await expect(instagram.getByText(text, { exact: true })).toBeVisible()
  await expect(instagram.getByText(`${text.length} / 150`)).toBeVisible()

  // izmena ostaje posle osvežavanja
  await page.reload()
  await expect(instagram.getByText(text, { exact: true })).toBeVisible()
  await expect(
    instagram.getByText('Ova mreža ne dozvoljava aplikacijama da menjaju opis profila'),
  ).toBeVisible()

  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    instagram.getByRole('button', { name: 'Kopiraj i otvori profil' }).click(),
  ])
  await tab.waitForURL('https://www.instagram.com/accounts/edit/')
  await tab.close()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text)
  await expect(instagram.getByText('Tekst je kopiran.')).toBeVisible()

  expect(await seriousViolations(page, 'izmena opisa')).toEqual([])
})
