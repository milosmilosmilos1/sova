import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { seedRequestMemo } from '@/lib/auth/request-memo'
import type { Viewer } from '@/lib/auth/viewer'
import { membershipsQuery, toMemberships, type Membership } from '@/lib/auth/workspace'
import { logger } from '@/lib/logger'
import {
  brandContextQuery,
  seedBrandRow,
  seedWorkspaceBrands,
  type BrandContextRow,
  type BrandRow,
} from '@/services/brands'
import type { Database } from '@/types/database'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AppPrefetch {
  sub: string
  memberships: Membership[]
  brands: BrandContextRow[]
  currentBrand: BrandRow | null
}

/**
 * Prvo čitanje strane aplikacije u istom krugu do baze kao provera prijave (D-164): članstva, svi
 * dostupni brendovi sa bojama za birač i pun red trenutnog brenda iz kolačića. Upiti idu kroz RLS sa
 * korisnikovim tokenom, a rezultat se koristi tek kad Auth potvrdi istog korisnika (seedAppPrefetch).
 * Greška ne obara stranu: tada layout i strana čitaju kao ranije.
 */
export async function prefetchAppContext(
  supabase: SupabaseClient<Database>,
  sub: string,
  brandCookie: string | undefined,
): Promise<AppPrefetch | null> {
  try {
    const [members, brands, current] = await Promise.all([
      membershipsQuery(supabase, sub),
      brandContextQuery(supabase),
      brandCookie && UUID.test(brandCookie)
        ? supabase.from('brands').select('*').eq('id', brandCookie).is('deleted_at', null).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    const error = members.error ?? brands.error ?? current.error
    if (error) {
      logger.warn('app_prefetch_failed', { error: error.message })
      return null
    }
    return {
      sub,
      memberships: toMemberships(members.data ?? []),
      brands: (brands.data ?? []) as unknown as BrandContextRow[],
      currentBrand: current.data,
    }
  } catch (error) {
    logger.warn('app_prefetch_failed', { error })
    return null
  }
}

/** Upis u pamćenje zahteva, samo za istog, potvrđenog korisnika (bez impersonacije). */
export function seedAppPrefetch(viewer: Viewer, prefetch: AppPrefetch | null): void {
  if (!prefetch || prefetch.sub !== viewer.user.id || viewer.impersonation) return
  seedRequestMemo(viewer, 'memberships', prefetch.memberships)
  for (const m of prefetch.memberships) seedWorkspaceBrands(viewer, m.workspaceId, prefetch.brands)
  if (prefetch.currentBrand) seedBrandRow(viewer, prefetch.currentBrand)
}
