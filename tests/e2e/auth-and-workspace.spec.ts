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

test.describe.serial('registracija, potvrda emaila, onboarding, tim, odjava', () => {
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

    await page.getByText('Agencija ili freelancer').click()
    await page.getByLabel('Naziv agencije').fill('E2E Agencija')
    await page.getByLabel('Prvi klijent (brend)').fill('Klijent Jedan')
    await page.getByLabel('Sajt brenda').fill('tangerineseo.rs')
    await page.getByRole('button', { name: 'Napravite radni prostor' }).click()

    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByText(/Radni prostor/).first()).toContainText('E2E Agencija')
    await expect(page.getByText('50', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Klijent Jedan').first()).toBeVisible()
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
