import { expect, test } from '@playwright/test'

import { admin } from './fixtures'

/**
 * Linkovi iz mejlova (šabloni u supabase/templates) nose token_hash i redirect_to,
 * pa rade i u pregledaču u kom nalog nije napravljen (Gmail na telefonu, drugi profil).
 */
test.describe('linkovi iz mejlova', () => {
  const stamp = Date.now()
  const email = `e2e-link-${stamp}@sova.local`
  let userId: string | undefined

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
  })

  test('potvrda emaila sa token_hash radi u novom pregledaču i vodi na next', async ({ page, baseURL }) => {
    const redirectTo = `${baseURL}/auth/callback?next=${encodeURIComponent('/app/onboarding')}`
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password: `Lozinka-Link-${stamp}!`,
      options: { redirectTo },
    })
    expect(error).toBeNull()
    userId = data.user?.id
    const tokenHash = data.properties?.hashed_token
    expect(tokenHash).toBeTruthy()

    // isti oblik kao href u supabase/templates/confirmation.html
    await page.goto(
      `/auth/callback?token_hash=${tokenHash}&type=email&redirect_to=${encodeURIComponent(redirectTo)}`,
    )
    await expect(page).toHaveURL(/\/app\/onboarding/)

    const { data: user } = await admin.auth.admin.getUserById(userId!)
    expect(user.user?.email_confirmed_at).toBeTruthy()
  })

  test('iskorišćen token_hash vraća na prijavu sa porukom o linku', async ({ page }) => {
    await page.goto('/auth/callback?token_hash=nepostojeci-token&type=email')
    await expect(page).toHaveURL(/\/login\?error=link/)
    await expect(page.getByText('Link je nevažeći ili je istekao.')).toBeVisible()
  })

  test('PKCE link otvoren u drugom pregledaču daje poruku o pregledaču, ne o nevažećem linku', async ({
    page,
  }) => {
    // Bez verifier cookie-ja razmena koda pada pre poziva Supabase-a.
    await page.goto('/auth/callback?code=kod-iz-drugog-pregledaca&next=%2Fapp%2Fonboarding')
    await expect(page).toHaveURL(/\/login\?error=browser/)
    await expect(page.getByText('Link je otvoren u drugom pregledaču.')).toBeVisible()
  })
})
