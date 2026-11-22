import 'server-only'

import { photoCreditOf, type PhotoCredit } from '@/lib/media/unsplash'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export interface CreditedAsset {
  id: string
  attribution?: unknown
  source_data?: unknown
}

/**
 * Potpis autora i Unsplash-a za prikazane slike (D-190): Unsplash fotografija i šablon sa njom nose
 * atribuciju sami, a slajd koji je Sova nacrtala preko fotografije (`source_data.photoAssetId`) dobija
 * potpis te fotografije. Fotografije se čitaju jednim upitom.
 */
export async function creditsFor(assets: CreditedAsset[]): Promise<Map<string, PhotoCredit>> {
  const out = new Map<string, PhotoCredit>()
  const viaPhoto = new Map<string, string[]>()
  for (const a of assets) {
    const own = photoCreditOf(a.attribution)
    if (own) {
      out.set(a.id, own)
      continue
    }
    const photoId = (a.source_data as { photoAssetId?: unknown } | null)?.photoAssetId
    if (typeof photoId === 'string' && photoId)
      viaPhoto.set(photoId, [...(viaPhoto.get(photoId) ?? []), a.id])
  }
  if (!viaPhoto.size) return out
  const { data } = await createSupabaseAdminClient()
    .from('media_assets')
    .select('id, attribution')
    .in('id', [...viaPhoto.keys()])
  for (const photo of data ?? []) {
    const credit = photoCreditOf(photo.attribution)
    if (credit) for (const id of viaPhoto.get(photo.id) ?? []) out.set(id, credit)
  }
  return out
}
