import 'server-only'

import type { Viewer } from '@/lib/auth/viewer'
import { parseVoice } from '@/lib/brand/voice'
import { GUIDE_STEPS, type GuideStepKey } from '@/lib/guide'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getBrand } from '@/services/brands'

/**
 * Vodič (D-115): četiri ključna koraka do objava koje Sova sama priprema. Isti koraci su na početnoj
 * i u plutajućem prozoru „Vodič i podrška”.
 */
export interface GuideView {
  steps: Array<{ key: GuideStepKey; done: boolean }>
  done: number
  next: GuideStepKey | null
  setupCompleted: boolean
}

export async function getGuide(viewer: Viewer, brandId: string): Promise<GuideView> {
  const brand = await getBrand(viewer, brandId)
  const admin = createSupabaseAdminClient()
  const [accounts, flows, decided] = await Promise.all([
    admin
      .from('social_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'active'),
    admin
      .from('content_flows')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('active', true)
      .is('deleted_at', null),
    // prva odluka: bar jedna objava je odobrena, zakazana ili objavljena
    admin
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .in('status', ['approved', 'scheduled', 'publishing', 'published', 'partially_published'])
      .is('deleted_at', null),
  ])
  const done: Record<GuideStepKey, boolean> = {
    networks: (accounts.count ?? 0) > 0,
    voice: Boolean(parseVoice(brand.voice)),
    flow: (flows.count ?? 0) > 0,
    decision: (decided.count ?? 0) > 0,
  }
  const steps = GUIDE_STEPS.map((key) => ({ key, done: done[key] }))
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    next: steps.find((s) => !s.done)?.key ?? null,
    setupCompleted: Boolean(brand.setup_completed_at),
  }
}
