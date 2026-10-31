import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Fotografije i snimci koje je brend već dobio sa Unsplash-a i Pexels-a (D-121). Automatski izbor
 * („Nova objava”, plan, tokovi, Autopilot) ih preskače, pa se ista slika ili isti snimak ne
 * ponavljaju ni posle brisanja iz galerije. Ručni izbor u Studiju ih i dalje može uzeti ponovo.
 */
export type StockKind = 'unsplash' | 'pexels-photo' | 'pexels-video'

/** Koliko fotografija automatski izbor preuzima i čuva u isto vreme (D-122). */
export const STOCK_PARALLEL = 4

export async function usedStockIds(brandId: string, kind: StockKind): Promise<Set<string>> {
  const admin = createSupabaseAdminClient()
  const query =
    kind === 'unsplash'
      ? admin.from('media_assets').select('ref:source_data->>photoId').eq('source', 'unsplash')
      : admin
          .from('media_assets')
          .select('ref:source_data->>pexelsId')
          .eq('source', 'pexels')
          .eq('source_data->>kind', kind === 'pexels-video' ? 'video' : 'photo')
  const { data } = await query.eq('brand_id', brandId).limit(10_000)
  const rows = (data ?? []) as unknown as Array<{ ref: string | null }>
  return new Set(rows.map((r) => r.ref).filter((r): r is string => Boolean(r)))
}

/** Upit pa kraći oblici (prve dve reči, prva reč), da ima novih rezultata kad su prvi potrošeni. */
export function queryVariants(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  return [...new Set([words.join(' '), words.slice(0, 2).join(' '), words[0] ?? ''])].filter(Boolean)
}
