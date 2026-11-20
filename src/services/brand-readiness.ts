import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { brandProfileSchema } from '@/lib/brand/profile-schema'
import { readinessFrom, type Readiness } from '@/lib/brand/readiness'
import { parseVoice } from '@/lib/brand/voice'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import type { BrandRow } from '@/services/brands'
import { storedDesign } from '@/services/design/brand-design'

/**
 * Kompletan brend (D-174), iz baze: izvori Brain-a (uspešna analiza sajta, pročitan PDF, beleška),
 * glas brenda, logo (sopstveni ili sa sajta) i boje i stil koje je izabrao korisnik.
 */
export type ReadinessBrand = Pick<BrandRow, 'id' | 'voice' | 'design' | 'logo_asset_id'>

export async function brandReadiness(brand: ReadinessBrand): Promise<Readiness> {
  const admin = createSupabaseAdminClient()
  const stored = storedDesign(brand)
  const ownLogo = Boolean(stored.logoAssetId || brand.logo_asset_id)
  const [crawls, documents, profile] = await Promise.all([
    admin
      .from('website_crawls')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .in('status', ['succeeded', 'partial']),
    // beleška važi čim je napisana; PDF tek kad je pročitan
    admin
      .from('brand_documents')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .is('deleted_at', null)
      .or('kind.eq.note,status.eq.ready'),
    ownLogo ? Promise.resolve(null) : getCurrentProfileRow(brand.id),
  ])
  if (crawls.error) throw new Error(`readiness crawls: ${crawls.error.message}`)
  if (documents.error) throw new Error(`readiness documents: ${documents.error.message}`)
  const parsed = profile ? brandProfileSchema.safeParse(profile.data) : null
  const siteLogo = parsed?.success ? Boolean(parsed.data.visual.logo.value.asset_id) : false
  return readinessFrom({
    brainSources: (crawls.count ?? 0) + (documents.count ?? 0),
    voice: parseVoice(brand.voice),
    logo: ownLogo || siteLogo,
    colors: Boolean(stored.colors || stored.look),
    style: Boolean(stored.styleId),
  })
}

export async function brandReadinessById(brandId: string): Promise<Readiness | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('brands')
    .select('id, voice, design, logo_asset_id')
    .eq('id', brandId)
    .maybeSingle()
  if (error) throw new Error(`readiness brand: ${error.message}`)
  return data ? brandReadiness(data) : null
}

/**
 * Integracioni testovi drugih delova prave brend bez podešavanja, pa za njih postoji prekidač u
 * okruženju testova. Strane aplikacije ga ne gledaju: tamo se kompletan brend uvek traži.
 */
function enforced(): boolean {
  return process.env.SOVA_BRAND_GATE !== 'off'
}

/** Pravljenje sadržaja traži kompletan brend (D-174); inače 409 SETUP_INCOMPLETE. */
export async function assertBrandReady(brandId: string): Promise<void> {
  if (!enforced()) return
  const readiness = await brandReadinessById(brandId)
  if (readiness && !readiness.complete) throw new ApiError('SETUP_INCOMPLETE')
}
