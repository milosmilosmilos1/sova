import 'server-only'

import { toDataUri } from '@/lib/visuals/render'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { downloadAsset } from '@/services/media'

/**
 * Slika grupe `#pozadina` Figma šablona (D-162) kao data URI za crtanje. Ista slika važi za svaki
 * slajd šablona, pa se u jednom procesu preuzima jednom (keš do 24 slike).
 */
const MAX = 24
const cache = new Map<string, Promise<string>>()

export function templateBackground(assetId: string): Promise<string> {
  const hit = cache.get(assetId)
  if (hit) return hit
  const load = (async () => {
    const { data: asset } = await createSupabaseAdminClient()
      .from('media_assets')
      .select('*')
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!asset) throw new Error(`Pozadina šablona ${assetId} ne postoji.`)
    return toDataUri(await downloadAsset(asset), asset.mime_type)
  })()
  cache.set(assetId, load)
  load.catch(() => cache.delete(assetId))
  if (cache.size > MAX) cache.delete(cache.keys().next().value!)
  return load
}
