import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Brain (D-133): svako polje profila se menja na mestu i zaključava, a pravi logo se otprema kad
 * Sova sa sajta uzme pogrešan (tangerineseo.rs: logo klijenta Altema).
 */
let seeded: Seeded | undefined

const f = <T>(value: T, confidence = 0.8) => ({ value, confidence, source_urls: [] as string[] })

/** Profil kao posle analize sajta, sa slogan i jednom uslugom. */
function profile() {
  return {
    schema_version: 1,
    identity: {
      name: f('E2E brend'),
      tagline: f('Stari slogan'),
      description: f('Agencija za SEO iz Beograda.'),
      industry: f('SEO'),
      location: f({ city: 'Beograd', country: 'Srbija' }),
      founded_year: f(null),
      languages: f(['sr']),
      content_locale: f('sr-Latn', 1),
    },
    offer: {
      services: f([{ name: 'SEO', description: null }]),
      products: f([]),
      differentiators: f([]),
      price_hints: f([]),
      guarantees: f([]),
    },
    audience: { segments: f([]), pain_points: f([]), market: f('both') },
    voice: {
      tone: f(['direktan']),
      address: f('vi'),
      formality: f('neutral'),
      emoji: f(false),
      sample_phrases: f([]),
      forbidden_words: f([]),
      key_terms: f([]),
      hashtags: f([]),
    },
    facts: f([]),
    contact: { email: f(null), phone: f(null), address: f(null), working_hours: f(null) },
    social: f({}),
    visual: {
      logo: f({ asset_id: null, source_url: null, mime_type: null }),
      colors: f({
        primary: '#990000',
        secondary: '#F26B1D',
        accent: '#5CB85C',
        neutral_light: '#F3F2F2',
        neutral_dark: '#201E1D',
        text_on_primary: '#FFFFFF',
        is_monochrome: false,
        candidates: [],
      }),
      fonts: f({
        headings: 'Inter',
        body: 'Inter',
        mapped_headings: 'Inter',
        mapped_body: 'Inter',
        detected: [],
      }),
      photo_style: f(null),
    },
    content: { has_blog: f(false), blog_topics: f([]), content_pillars: f([]), recent_posts: f([]) },
    meta: {
      generated_by: 'ai',
      model: 'e2e',
      crawl_id: null,
      pages_used: 1,
      source_url: 'https://primer.test/',
      generated_at: new Date().toISOString(),
      overall_confidence: 0.8,
    },
  }
}

test.beforeAll(async () => {
  seeded = await seedWorkspace('brain')
  const { error } = await admin.from('brand_profiles').insert({
    brand_id: seeded.brandId,
    version: 1,
    data: profile(),
    locked_fields: [],
    is_current: true,
  })
  if (error) throw new Error(`Profil: ${error.message}`)
})

test.afterAll(async () => cleanup(seeded))

test('Brain: polje se menja na mestu i zaključava, a pravi logo se otprema', async ({ page }) => {
  await login(page, seeded!)
  await page.goto('/app/brain#sajt')

  // slogan: tekst na mestu
  await page.getByRole('button', { name: 'Izmeni: Slogan' }).click()
  const tagline = page.getByRole('textbox', { name: 'Slogan' })
  await tagline.fill('Rast koji se meri')
  expect(await seriousViolations(page, 'brain: izmena polja')).toEqual([])
  await page.locator('form').filter({ has: tagline }).getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('Rast koji se meri')).toBeVisible()

  // usluge: „naziv: opis” po redu
  await page.getByRole('button', { name: 'Izmeni: Usluge' }).click()
  const services = page.getByRole('textbox', { name: 'Usluge' })
  await services.fill('SEO audit: Provera sajta u 200 tačaka\nLokalni SEO')
  await page.locator('form').filter({ has: services }).getByRole('button', { name: 'Sačuvaj' }).click()
  await expect(page.getByText('SEO audit: Provera sajta u 200 tačaka')).toBeVisible()
  await expect(page.getByText('Lokalni SEO', { exact: true })).toBeVisible()

  // tržište se prikazuje rečima, ne kodom
  await expect(page.getByText('Firme i ljudi')).toBeVisible()

  const { data: current } = await admin
    .from('brand_profiles')
    .select('version, locked_fields, data')
    .eq('brand_id', seeded!.brandId)
    .eq('is_current', true)
    .single()
  expect(current!.version).toBe(3)
  expect(current!.locked_fields).toEqual(expect.arrayContaining(['identity.tagline', 'offer.services']))
  expect((current!.data as ReturnType<typeof profile>).offer.services.value).toEqual([
    { name: 'SEO audit', description: 'Provera sajta u 200 tačaka' },
    { name: 'Lokalni SEO', description: null },
  ])

  // logo: otpremljen postaje „vaš logo” i ide na slajdove
  const png = await sharp({ create: { width: 240, height: 80, channels: 4, background: '#C8102E' } })
    .png()
    .toBuffer()
  await page
    .locator('input[type="file"][accept*="image/png"]')
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('Vaš logo')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Logo brenda' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vrati logo sa sajta' })).toBeVisible()
  const { data: brand } = await admin.from('brands').select('design').eq('id', seeded!.brandId).single()
  expect((brand!.design as { logoAssetId?: string }).logoAssetId).toBeTruthy()
})
