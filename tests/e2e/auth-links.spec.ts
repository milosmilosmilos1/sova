import { expect, test } from '@playwright/test'

import { admin } from './fixtures'
import { extractLink, waitForEmail } from './mailpit'

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

/**
 * Mejlove za nalog šalje Sova (D-187), ne Supabase: link sa token_hash ne zavisi od kolačića iz
 * pregledača u kom je nalog napravljen. Vlasnik je 22.11. dobio „otvoren u drugom pregledaču” i za
 * link otvoren u istom pregledaču, a Supabase podrazumevano šalje samo članovima tima.
 */
test.describe('mejlovi za nalog koje šalje Sova', () => {
  const stamp = Date.now()
  const ids: string[] = []
  // svoja „IP adresa”: registracija ima granicu 3 na sat po adresi
  const headers = { 'x-forwarded-for': `10.77.${stamp % 250}.${Math.floor(stamp / 256) % 250}` }

  test.afterAll(async () => {
    for (const id of ids) await admin.auth.admin.deleteUser(id)
  })

  test('registracija: mejl na srpskom, link radi u drugom pregledaču bez kolačića', async ({ browser }) => {
    const email = `e2e-sova-mejl-${stamp}@sova.local`
    const first = await browser.newContext({ extraHTTPHeaders: headers, locale: 'en-US' })
    const page = await first.newPage()
    await page.goto('/register')
    // pregledač na engleskom ne menja jezik sajta (D-187)
    await expect(page).toHaveURL(/\/register$/)
    await page.getByLabel('Ime i prezime').fill('Mejl Proba')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Lozinka', { exact: true }).fill(`Lozinka-Mejl-${stamp}!`)
    await page.getByLabel(/Prihvatam/).check()
    await page.getByRole('button', { name: 'Napravite nalog' }).click()
    await expect(page).toHaveURL(/\/verify-email/)
    await first.close()

    const mail = await waitForEmail(email, 'Potvrdite email adresu za Sovu')
    expect(mail.HTML).toContain('Potvrdi email')
    const link = extractLink(mail, '/auth/callback?token_hash=')
    expect(link).toContain('type=email')

    const second = await browser.newContext({ extraHTTPHeaders: headers })
    const other = await second.newPage()
    await other.goto(link)
    await expect(other).toHaveURL(/\/app\/onboarding/)
    await second.close()

    const { data } = await admin.from('profiles').select('id, locale').eq('email', email).single()
    ids.push(data!.id)
    expect(data!.locale).toBe('sr-Latn')
    const { data: user } = await admin.auth.admin.getUserById(data!.id)
    expect(user.user?.email_confirmed_at).toBeTruthy()
  })

  test('zaboravljena lozinka i prijava linkom: mejl od Sove, link vodi na pravu stranu', async ({
    browser,
  }) => {
    const email = `e2e-sova-lozinka-${stamp}@sova.local`
    const { data: created } = await admin.auth.admin.createUser({
      email,
      password: `Lozinka-Stara-${stamp}!`,
      email_confirm: true,
      user_metadata: { full_name: 'Lozinka Proba' },
    })
    ids.push(created.user!.id)

    const ctx = await browser.newContext({ extraHTTPHeaders: headers })
    const page = await ctx.newPage()
    await page.goto('/forgot-password')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Pošaljite link za promenu lozinke' }).click()
    await expect(page.getByText('Ako nalog postoji, poslali smo link za promenu lozinke.')).toBeVisible()
    const reset = await waitForEmail(email, 'Promena lozinke za Sovu')
    await page.goto(extractLink(reset, '/auth/callback?token_hash='))
    await expect(page).toHaveURL(/\/reset-password/)
    await expect(page.getByLabel('Nova lozinka')).toBeVisible()
    await ctx.close()

    const fresh = await browser.newContext({ extraHTTPHeaders: headers })
    const login = await fresh.newPage()
    await login.goto('/login')
    await login.getByRole('button', { name: 'Prijava linkom na email' }).click()
    await login.getByLabel('Email').fill(email)
    await login.getByRole('button', { name: 'Pošaljite mi link za prijavu' }).click()
    await expect(login.getByText('Ako nalog postoji, poslali smo link za prijavu.')).toBeVisible()
    const magic = await waitForEmail(email, 'Link za prijavu u Sovu')
    await login.goto(extractLink(magic, '/auth/callback?token_hash='))
    await expect(login).toHaveURL(/\/app/)
    await fresh.close()
  })

  test('prijava linkom za nepostojeći nalog ne pravi nalog i ne šalje mejl', async ({ browser }) => {
    const email = `e2e-nema-naloga-${stamp}@sova.local`
    const ctx = await browser.newContext({ extraHTTPHeaders: headers })
    const page = await ctx.newPage()
    await page.goto('/login')
    await page.getByRole('button', { name: 'Prijava linkom na email' }).click()
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Pošaljite mi link za prijavu' }).click()
    await expect(page.getByText('Ako nalog postoji, poslali smo link za prijavu.')).toBeVisible()
    await ctx.close()
    const { data } = await admin.from('profiles').select('id').eq('email', email)
    expect(data).toEqual([])
    await expect(waitForEmail(email, 'Sovu', 3000)).rejects.toThrow()
  })
})
