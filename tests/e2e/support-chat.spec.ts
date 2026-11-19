import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

import { seriousViolations } from './axe'
import { admin, cleanup, login, seedWorkspace, type Seeded } from './fixtures'

/**
 * Chatbot podrške (D-172) u prozoru „Vodič i podrška”: raniji razgovor se učitava, novo pitanje dobija
 * odgovor, a razgovor ide podršci kao prijava problema. Odgovor modela je u testu zamenjen u
 * pregledaču, da test ne zavisi od pravog modela; slanje podršci ide kroz pravi server.
 */
let seeded: Seeded | undefined

test.beforeAll(async () => {
  seeded = await seedWorkspace('support')
})

test.afterAll(async () => {
  await cleanup(seeded)
})

test('chatbot podrške: raniji razgovor, novo pitanje, slanje podršci', async ({ page }) => {
  const s = seeded!
  const conversationId = randomUUID()
  // grupni upis traži iste ključeve u svakom redu
  const { error } = await admin.from('support_messages').insert([
    {
      conversation_id: conversationId,
      user_id: s.userId,
      brand_id: s.brandId,
      role: 'user',
      body: 'Kako da vratim novac za paket?',
      meta: {},
      created_at: new Date().toISOString(),
    },
    {
      conversation_id: conversationId,
      user_id: s.userId,
      brand_id: s.brandId,
      role: 'assistant',
      body: 'Povraćaj novca rešava podrška.',
      meta: { escalate: true },
      created_at: new Date(Date.now() + 1000).toISOString(),
    },
  ])
  if (error) throw new Error(error.message)

  await login(page, s)
  await page.goto('/app/calendar')
  await page.getByRole('button', { name: /Vodič i podrška/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Vodič i podrška' })
  await dialog.getByRole('tab', { name: 'Pitaj Sovu' }).click()
  await expect(dialog.getByRole('tab', { name: 'Pitaj Sovu' })).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByText('Kako da vratim novac za paket?')).toBeVisible()
  await expect(dialog.getByText('Povraćaj novca rešava podrška.')).toBeVisible()

  await page.route('**/api/support/chat', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const body = route.request().postDataJSON() as { conversationId: string; text: string }
    const at = new Date().toISOString()
    await route.fulfill({
      json: {
        ok: true,
        data: {
          conversationId: body.conversationId,
          messages: [
            { id: 'q', role: 'user', body: body.text, escalate: false, escalated: false, createdAt: at },
            {
              id: 'a',
              role: 'assistant',
              body: 'Otvorite „Kalendar” u meniju.',
              escalate: false,
              escalated: false,
              createdAt: at,
            },
          ],
        },
      },
    })
  })
  await dialog.getByLabel('Pitanje za podršku').fill('Gde je kalendar?')
  await dialog.getByRole('button', { name: 'Pošalji', exact: true }).click()
  await expect(dialog.getByText('Otvorite „Kalendar” u meniju.')).toBeVisible()
  await expect(dialog.getByText('Gde je kalendar?')).toBeVisible()
  await page.unroute('**/api/support/chat')
  expect(await seriousViolations(page, 'chatbot podrške')).toEqual([])

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/support/chat/escalate') && r.ok()),
    dialog.getByRole('button', { name: 'Pošalji razgovor podršci' }).click(),
  ])
  await expect(dialog.getByText(/Razgovor je poslat podršci kao prijava problema/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Pošalji razgovor podršci' })).toHaveCount(0)
  const { data: ideas } = await admin.from('feature_requests').select('kind, title').eq('author_id', s.userId)
  expect(ideas).toEqual([{ kind: 'bug', title: 'Podrška: Kako da vratim novac za paket?' }])

  // vodič je i dalje na prvoj kartici
  await dialog.getByRole('tab', { name: 'Vodič' }).click()
  await expect(dialog.getByRole('link', { name: /Povežite mrežu/ })).toBeVisible()
})
