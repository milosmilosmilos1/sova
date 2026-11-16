import { expect, test } from '@playwright/test'

import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * „Označi sve” na mesečnom planu: označava stavke koje još čekaju na pravljenje. Napravljen nacrt se
 * ne označava (menja se u Odobravanju), pa kad u planu ostanu samo napravljeni nacrti, umesto kvačice
 * koja ništa ne radi stoji naslov liste.
 */
let seeded: Seeded | undefined
let planId = ''

const day = (d: Date) => d.toISOString().slice(0, 10)

test.beforeAll(async () => {
  const s = await seedWorkspace('planbulk')
  seeded = s
  const now = new Date()
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0))
  const { data: plan, error } = await admin
    .from('month_plans')
    .insert({
      workspace_id: s.workspaceId,
      brand_id: s.brandId,
      month: day(first),
      period_start: day(first),
      period_end: day(last),
      status: 'ready',
      settings: {
        kind: 'next',
        months: 1,
        perWeek: 3,
        platforms: ['facebook', 'instagram'],
        formats: ['image'],
        locale: 'sr-Latn',
        notes: null,
      },
      created_by: s.userId,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  planId = plan.id
  const items = [
    { topic: 'Kako izabrati hranu za štene', status: 'planned', date: 3 },
    { topic: 'Pet grešaka pri prelasku na novu hranu', status: 'planned', date: 5 },
    { topic: 'Upoznajte naš tim', status: 'done', date: 7 },
  ]
  const { error: itemsError } = await admin.from('month_plan_items').insert(
    items.map((i, position) => ({
      plan_id: planId,
      brand_id: s.brandId,
      position,
      scheduled_for: new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i.date, 9)).toISOString(),
      format: 'image',
      platforms: ['facebook', 'instagram'],
      topic: i.topic,
      status: i.status,
    })),
  )
  if (itemsError) throw new Error(itemsError.message)
})

test.afterAll(async () => {
  await cleanup(seeded)
})

test('mesečni plan: „Označi sve” označava stavke koje čekaju, a bez njih kvačice nema', async ({ page }) => {
  await login(page, seeded!)
  await page.goto('/app/plan')
  const list = page.getByRole('region', { name: 'Objave u planu' })
  const selectAll = list.getByRole('checkbox', { name: 'Označi sve' })
  await expect(selectAll).toBeVisible()

  await selectAll.check()
  await expect(list.getByRole('checkbox', { name: 'Označi: Kako izabrati hranu za štene' })).toBeChecked()
  await expect(
    list.getByRole('checkbox', { name: 'Označi: Pet grešaka pri prelasku na novu hranu' }),
  ).toBeChecked()
  // napravljen nacrt nema kvačicu
  await expect(list.getByRole('checkbox', { name: 'Označi: Upoznajte naš tim' })).toHaveCount(0)
  const bar = page.getByRole('region', { name: 'Radnje za označeno' })
  await expect(bar.getByText('Označeno: 2')).toBeVisible()

  page.once('dialog', (dialog) => void dialog.accept())
  await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/plans/${planId}/items/delete`) && r.ok()),
    bar.getByRole('button', { name: 'Obriši označene' }).click(),
  ])
  // ostao je samo napravljen nacrt: nema šta da se označi, pa umesto „Označi sve” stoji naslov liste
  await expect(list.getByText('Kako izabrati hranu za štene')).toHaveCount(0)
  await expect(list.getByText('Upoznajte naš tim')).toBeVisible()
  await expect(list.getByRole('checkbox')).toHaveCount(0)
  await expect(list.getByText('Objave u planu', { exact: true })).toBeVisible()
  await expect(bar).toHaveCount(0)

  await page.reload()
  await expect(list.getByText('Upoznajte naš tim')).toBeVisible()
  await expect(list.getByRole('checkbox')).toHaveCount(0)
  await expect(list.getByText('Objave u planu', { exact: true })).toBeVisible()
  expect(await seriousViolations(page, 'plan bez stavki za označavanje')).toEqual([])
})
