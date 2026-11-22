import { randomUUID } from 'node:crypto'

import { expect, test, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'

import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Unsplash fotografija u prikazu (D-190): u editoru, Odobravanju, pregledu na mreži i na javnoj strani
 * za odobrenje slika se učitava sa Unsplash adrese (hotlink), a uz nju stoje autor i Unsplash sa
 * linkovima (utm parametri po pravilima Unsplash API-ja). `E2E_SHOTS_DIR` čuva snimke ekrana.
 */
let seeded: Seeded | undefined
let postId = ''

const RAW =
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixid=M3wxfDB8MXxyYW5kb218MHx8fHx8fHx8MTY&ixlib=rb-4.0.3'
const UTM = 'utm_source=sova&utm_medium=referral'
const SHOTS = process.env.E2E_SHOTS_DIR

async function shot(target: Page | Locator, name: string) {
  if (!SHOTS) return
  // snimak tek kad se Unsplash slike učitaju (sa mreže, ne iz skladišta)
  const page = 'page' in target ? target.page() : target
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((i) => i.src.startsWith('https://images.unsplash.com/'))
          .every((i) => i.complete && i.naturalWidth > 0),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined)
  await target.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function expectCredit(scope: Page | Locator) {
  const credit = scope.locator('[data-photo-credit="unsplash"]').first()
  await expect(credit).toBeVisible()
  await expect(credit.getByRole('link', { name: 'Bailey Zindel' })).toHaveAttribute(
    'href',
    `https://unsplash.com/@baileyzindel?${UTM}`,
  )
  await expect(credit.getByRole('link', { name: 'Unsplash' })).toHaveAttribute(
    'href',
    `https://unsplash.com/?${UTM}`,
  )
}

test.beforeAll(async () => {
  seeded = await seedWorkspace('unsplash-potpis')
  const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`)
    return r.data
  }
  // kopija u skladištu (za objavu na mreži) i zapis kao posle izbora iz pretrage
  const image = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#335577' } })
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
      source: 'unsplash',
      bucket: 'uploads',
      storage_path: path,
      mime_type: 'image/jpeg',
      size_bytes: image.length,
      width: 1200,
      height: 800,
      alt_text: 'Jezero u planinama',
      tags: ['unsplash'],
      attribution: {
        provider: 'unsplash',
        text: 'Photo by Bailey Zindel on Unsplash',
        photographerName: 'Bailey Zindel',
        photographerUrl: `https://unsplash.com/@baileyzindel?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
      source_data: { photoId: 'e2e-unsplash', urls: { raw: RAW } },
      uploaded_by: seeded.userId,
    }),
    'Medij',
  )
  const post = must(
    await admin
      .from('posts')
      .insert({
        brand_id: seeded.brandId,
        workspace_id: seeded.workspaceId,
        title: 'Vikend na planini',
        master_text: 'Vikend na planini: mir, jezero i dobar vazduh. #planina',
        status: 'in_review',
        created_by: seeded.userId,
      })
      .select('id')
      .single(),
    'Objava',
  )!
  postId = post.id
  must(
    await admin.from('post_targets').insert({
      post_id: post.id,
      brand_id: seeded.brandId,
      social_account_id: seeded.facebookId,
      platform: 'facebook',
    }),
    'Mreža',
  )
  must(
    await admin.from('post_media').insert({ post_id: post.id, media_asset_id: id, sort_order: 0 }),
    'Slika objave',
  )
})

test.afterAll(async () => {
  await cleanup(seeded)
})

test('Unsplash fotografija sa Unsplash adrese i sa potpisom: editor, Odobravanje, pregled i javna strana (D-190)', async ({
  page,
  browser,
}) => {
  await login(page, seeded!)

  // editor: biblioteka i fotografija u objavi
  await page.goto(`/app/posts/${postId}`)
  await expect(
    page.locator('img[src^="https://images.unsplash.com/photo-1506744038136"]').first(),
  ).toBeAttached()
  await expectCredit(page)
  await page.locator('[data-photo-credit="unsplash"]').first().scrollIntoViewIfNeeded()
  await shot(page, 'editor')

  // Odobravanje: slajd i potpis, pa pregled na mreži
  await page.goto('/app/approvals')
  await expect(
    page.locator('img[src^="https://images.unsplash.com/photo-1506744038136"]').first(),
  ).toBeAttached()
  await expectCredit(page.getByRole('main'))
  await shot(page, 'odobravanje')
  expect(await seriousViolations(page, 'odobravanje sa Unsplash fotografijom')).toEqual([])
  await page.getByRole('button', { name: 'Pregled na mreži', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Kako će objava izgledati' })
  await expectCredit(dialog)
  await shot(dialog, 'pregled-mreze')
  await page.keyboard.press('Escape')

  // javna strana za odobrenje (klijent bez naloga)
  const link = await page.request.post('/api/approval-links', {
    data: { brandId: seeded!.brandId, postIds: [postId], clientLabel: 'Klijent', expiresInDays: 3 },
  })
  expect(link.status()).toBe(201)
  const token = ((await link.json()) as { data: { url: string } }).data.url.split('/approve/')[1]!
  const client = await browser.newContext()
  const cp = await client.newPage()
  await cp.goto(`${new URL(page.url()).origin}/approve/${token}`)
  await expect(
    cp.locator('img[src^="https://images.unsplash.com/photo-1506744038136"]').first(),
  ).toBeAttached()
  await expectCredit(cp)
  await shot(cp, 'javna-strana')
  await client.close()
})
