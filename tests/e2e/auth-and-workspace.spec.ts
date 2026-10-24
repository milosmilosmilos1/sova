import { expect, test, type Page } from '@playwright/test'

import { extractLink, waitForEmail } from './mailpit'

const stamp = Date.now()
const owner = {
  name: 'E2E Vlasnik',
  email: `e2e-owner-${stamp}@sova.local`,
  password: `Lozinka-E2E-${stamp}!`,
}

async function register(page: Page, user: { name: string; email: string; password: string }) {
  await page.goto('/register')
  await page.getByLabel('Ime i prezime').fill(user.name)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Lozinka', { exact: true }).fill(user.password)
  await page.getByLabel(/Prihvatam/).check()
  await page.getByRole('button', { name: 'Napravite nalog' }).click()
  await expect(page).toHaveURL(/\/verify-email/)
}

async function confirmEmail(page: Page, email: string) {
  const mail = await waitForEmail(email, 'Confirm')
  const link = extractLink(mail, '/auth/v1/verify')
  await page.goto(link)
}

test.describe.serial('registracija, potvrda emaila, onboarding, tim, nacrt, odjava', () => {
  test('neulogovan korisnik ne vidi aplikaciju', async ({ page }) => {
    for (const path of ['/app', '/app/team', '/admin']) {
      const res = await page.request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(307)
      expect(res.headers()['location'], path).toContain(`/login?next=${encodeURIComponent(path)}`)
    }
    await page.goto('/app')
    await expect(page).toHaveURL(/\/login\?next=%2Fapp/)
    await expect(page.getByRole('heading', { name: 'Prijava' })).toBeVisible()
  })

  test('registracija traži potvrdu emaila, potvrda vodi na onboarding', async ({ page }) => {
    await register(page, owner)
    await expect(page.getByRole('heading', { name: 'Proverite poštu' })).toBeVisible()

    // prijava pre potvrde ne prolazi
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Lozinka').fill(owner.password)
    await page.getByRole('button', { name: 'Prijavite se' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /Potvrdite email/ })).toBeVisible()

    await confirmEmail(page, owner.email)
    await expect(page).toHaveURL(/\/app\/onboarding/)
    await expect(page.getByRole('heading', { name: 'Krenimo' })).toBeVisible()
  })

  test('onboarding pravi radni prostor sa 50 tokena i jednim brendom', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Lozinka').fill(owner.password)
    await page.getByRole('button', { name: 'Prijavite se' }).click()
    await expect(page).toHaveURL(/\/app\/onboarding/)

    // podrazumevani tip „Jedan biznis”: brend dobija naziv firme (prazno skriveno polje brandName)
    await page.getByLabel('Naziv firme').fill('E2E Firma')
    await page.getByLabel('Sajt brenda').fill('tangerineseo.rs')
    await page.getByRole('button', { name: 'Napravite radni prostor' }).click()

    await expect(page).toHaveURL(/\/app$/)
    // naziv firme je i naziv brenda, pa se traži u glavnom sadržaju (ne u <select> opcijama bočne trake)
    const main = page.getByRole('main')
    await expect(main.getByText(/Radni prostor/).first()).toContainText('E2E Firma')
    await expect(main.getByText('50', { exact: true }).first()).toBeVisible()
    await expect(main.getByText('E2E Firma').first()).toBeVisible()
  })

  test('tim: pozivnica, limit plana, podešavanja', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Lozinka').fill(owner.password)
    await page.getByRole('button', { name: 'Prijavite se' }).click()
    await expect(page).toHaveURL(/\/app$/)

    await page.goto('/app/team')
    await expect(page.getByText(owner.email).first()).toBeVisible()
    await expect(page.getByText('Vlasnik', { exact: true }).first()).toBeVisible()

    // besplatan plan: 1 član → pozivnica javlja limit
    await page.getByLabel('Email osobe').fill(`e2e-guest-${stamp}@sova.local`)
    await page.getByRole('button', { name: 'Pošaljite pozivnicu' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /plan dozvoljava/i })).toBeVisible()

    await page.goto('/app/settings')
    await page.getByLabel('Ime i prezime').fill('E2E Vlasnik Izmenjen')
    await page.getByRole('button', { name: 'Sačuvajte profil' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Profil je sačuvan' })).toBeVisible()
    await expect(page.getByText(/Dostigli ste limit brendova/).first()).toBeVisible()
  })

  test('composer čuva nacrt lokalno i nudi ga posle osvežavanja (A4)', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Lozinka').fill(owner.password)
    await page.getByRole('button', { name: 'Prijavite se' }).click()
    await expect(page).toHaveURL(/\/app$/)

    const text = `Nacrt koji preživljava osvežavanje ${stamp}`
    const banner = page.getByRole('status').filter({ hasText: 'Imate nesačuvan nacrt' })
    await page.goto('/app/posts/new')
    await page.getByLabel('Tekst objave').fill(text.slice(0, 10))
    // čuvanje u localStorage kreće 600 ms posle poslednje izmene
    await expect
      .poll(() =>
        page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sova:nacrt:')).length),
      )
      .toBe(1)
    // nacrt iz iste sesije se ne nudi dok korisnik kuca dalje
    await page.getByLabel('Tekst objave').fill(text)
    await page.getByLabel('Termin objave').fill('2030-03-31T02:30')
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('sova:nacrt:'))!),
        ),
      )
      .toContain('2030-03-31T02:30')
    await expect(banner).toHaveCount(0)

    await page.reload()
    await expect(banner).toBeVisible()
    await expect(page.getByLabel('Tekst objave')).toHaveValue('')
    await page.getByRole('button', { name: 'Vrati nacrt' }).click()
    await expect(page.getByLabel('Tekst objave')).toHaveValue(text)
    await expect(banner).toHaveCount(0)

    await page.getByRole('button', { name: 'Sačuvaj nacrt' }).click()
    await expect(page).toHaveURL(/\/app\/posts\/[0-9a-f-]{36}/)
    await expect(page.getByLabel('Tekst objave')).toHaveValue(text)
    // K2: 31.3.2030 02:30 ne postoji u Beogradu (prelaz na letnje vreme), pa termin ide unapred
    await expect(page.getByLabel('Termin objave')).toHaveValue('2030-03-31T03:30')
    await expect
      .poll(() =>
        page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sova:nacrt:')).length),
      )
      .toBe(0)
  })

  test('admin panel nije dostupan običnom korisniku, odjava radi', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Lozinka').fill(owner.password)
    await page.getByRole('button', { name: 'Prijavite se' }).click()
    await expect(page).toHaveURL(/\/app$/)

    const res = await page.goto('/admin')
    expect(res?.status()).toBe(404)

    await page.goto('/app')
    await page.getByRole('button', { name: 'Odjavite se' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/app')
    await expect(page).toHaveURL(/\/login\?next=%2Fapp/)
  })
})
