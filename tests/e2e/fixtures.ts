import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Pripremljen korisnik i radni prostor za E2E (faza 15): pravi se kroz service role nad lokalnim
 * Supabase-om, pa test ne prolazi registraciju svaki put (registracija ima svoj spec). Nalozi
 * mreža su lažni, sa asistiranim objavljivanjem i bez tokena, kao u demo podacima.
 */
function loadEnvLocal(): void {
  const file = path.resolve(process.cwd(), '.env.local')
  if (!existsSync(file)) return // u CI-ju okruženje dolazi iz posla
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, '$1')
  }
}

loadEnvLocal()
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(URL_))
  throw new Error(`E2E radi samo nad lokalnim Supabase-om (URL je „${URL_}”).`)

export const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

export interface Seeded {
  email: string
  password: string
  userId: string
  workspaceId: string
  brandId: string
  facebookId: string
  instagramId: string
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error || res.data === null) throw new Error(`${what}: ${res.error?.message ?? 'nema podataka'}`)
  return res.data
}

export async function seedWorkspace(tag: string): Promise<Seeded> {
  const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`
  const email = `e2e-${tag}-${stamp}@sova.local`
  const password = `Lozinka-${randomBytes(8).toString('base64url')}`
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `E2E ${tag}` },
  })
  if (created.error || !created.data.user) throw new Error(`Korisnik: ${created.error?.message}`)
  const userId = created.data.user.id
  const userClient = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const signIn = await userClient.auth.signInWithPassword({ email, password })
  if (signIn.error) throw new Error(`Prijava: ${signIn.error.message}`)
  const ws = must(
    await userClient.rpc('create_workspace', {
      p_name: `E2E ${tag}`,
      p_type: 'business',
      p_brand_name: `E2E brend ${tag}`,
    }),
    'Radni prostor',
  ) as { workspace_id: string; brand_id: string }
  const accounts = must(
    await admin
      .from('social_accounts')
      .insert(
        (['facebook', 'instagram'] as const).map((platform) => ({
          brand_id: ws.brand_id,
          workspace_id: ws.workspace_id,
          platform,
          external_id: `e2e-${platform}-${stamp}`,
          name: platform === 'facebook' ? 'E2E strana' : 'e2e.instagram',
          account_type: platform === 'facebook' ? 'facebook_page' : 'instagram_business',
          status: 'active',
          capabilities: { publish: false, image: true, text: true, link: true },
          metadata: { e2e: true },
          assisted_only: true,
          connected_by: userId,
        })),
      )
      .select('id, platform'),
    'Nalozi mreža',
  )
  return {
    email,
    password,
    userId,
    workspaceId: ws.workspace_id,
    brandId: ws.brand_id,
    facebookId: accounts.find((a) => a.platform === 'facebook')!.id,
    instagramId: accounts.find((a) => a.platform === 'instagram')!.id,
  }
}

export async function cleanup(seeded: Seeded | undefined): Promise<void> {
  if (!seeded) return
  const { data } = await admin.from('reports').select('storage_path').eq('brand_id', seeded.brandId)
  const paths = (data ?? []).map((r) => r.storage_path).filter((p): p is string => Boolean(p))
  if (paths.length) await admin.storage.from('exports').remove(paths)
  const { error } = await admin.auth.admin.deleteUser(seeded.userId)
  if (error && !/not found/i.test(error.message)) throw new Error(`Brisanje E2E korisnika: ${error.message}`)
}

export async function login(page: Page, seeded: Pick<Seeded, 'email' | 'password'>): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(seeded.email)
  await page.getByLabel('Lozinka').fill(seeded.password)
  await page.getByRole('button', { name: 'Prijavite se' }).click()
  await expect(page).toHaveURL(/\/app(\/|$|\?)/)
}
