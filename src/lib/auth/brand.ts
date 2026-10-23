import 'server-only'

import { cookies } from 'next/headers'

import type { Viewer } from '@/lib/auth/viewer'
import { listBrands, type BrandSummary } from '@/services/brands'

export const BRAND_COOKIE = 'sova_brand'

/** Trenutni brend u okviru workspace-a (cookie ili prvi). */
export async function getCurrentBrand(viewer: Viewer, workspaceId: string): Promise<BrandSummary | null> {
  const brands = await listBrands(viewer, workspaceId)
  if (brands.length === 0) return null
  const store = await cookies()
  const wanted = store.get(BRAND_COOKIE)?.value
  return brands.find((b) => b.id === wanted) ?? brands[0]!
}

export async function setCurrentBrandCookie(brandId: string): Promise<void> {
  const store = await cookies()
  store.set(BRAND_COOKIE, brandId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}
