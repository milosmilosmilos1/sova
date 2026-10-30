import 'server-only'

import type { Viewer } from '@/lib/auth/viewer'
import { parsePlaybook, type Playbook } from '@/lib/brand/playbook'
import { parseVoice, voiceFromProfile } from '@/lib/brand/voice'
import { brandProfileSchema } from '@/lib/brand/profile-schema'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { MIN_POSTS_FOR_INSIGHTS } from '@/services/analytics/insights'
import { computeOverview } from '@/services/analytics/overview'
import { listDocuments, type DocumentView } from '@/services/brand-brain/documents'
import { getCurrentProfileRow } from '@/services/brand-brain/profile'
import { getBrand } from '@/services/brands'

/**
 * Strana Brain (D-113): šta Sova zna o brendu (glas vlasnika, inače profil sa sajta), odakle uči
 * (mreže, sajt, dokumenti, beleške, rezultati) i playbook naučen iz rezultata objava.
 */
export const BRAIN_RESULTS_DAYS = 30

export type KnowKey = 'name' | 'offer' | 'audience' | 'tone'

export interface BrainView {
  active: boolean
  knows: {
    items: Array<{ key: KnowKey; value: string | null }>
    filled: number
    source: 'voice' | 'profile' | null
  }
  sources: {
    accounts: number
    posts: number
    site: { url: string | null; analyzedAt: string | null; status: string | null }
    documents: number
    notes: DocumentView[]
    results: number
  }
  playbook: Playbook | null
  /** ručno osvežavanje playbook-a kroz uvide: treba bar `needed` objava sa metrikama u 30 dana */
  refresh: { possible: boolean; needed: number }
}

export async function getBrainView(viewer: Viewer, brandId: string): Promise<BrainView> {
  const brand = await getBrand(viewer, brandId)
  const admin = createSupabaseAdminClient()
  const now = new Date()
  const from = new Date(now.getTime() - BRAIN_RESULTS_DAYS * 86_400_000).toISOString()
  const [profileRow, accounts, posts, crawl, docs, overview] = await Promise.all([
    getCurrentProfileRow(brand.id),
    admin
      .from('social_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'active'),
    admin.from('historical_posts').select('id', { count: 'exact', head: true }).eq('brand_id', brand.id),
    admin
      .from('website_crawls')
      .select('status, finished_at, url')
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    listDocuments(viewer, brand.id),
    computeOverview(admin, brand.id, from, now.toISOString()).catch(() => null),
  ])

  const saved = parseVoice(brand.voice)
  const profile = profileRow ? brandProfileSchema.safeParse(profileRow.data) : null
  const fromProfile = profile?.success ? voiceFromProfile(profile.data) : null
  const pick = (k: 'offer' | 'audience' | 'tone') => saved?.[k] || fromProfile?.[k] || null
  const items: BrainView['knows']['items'] = [
    { key: 'name', value: brand.name },
    { key: 'offer', value: pick('offer') },
    { key: 'audience', value: pick('audience') },
    { key: 'tone', value: pick('tone') },
  ]
  const results = overview?.totals.withMetrics ?? 0
  return {
    active: Boolean(saved || fromProfile),
    knows: {
      items,
      filled: items.filter((i) => i.value).length,
      source: saved ? 'voice' : fromProfile ? 'profile' : null,
    },
    sources: {
      accounts: accounts.count ?? 0,
      posts: posts.count ?? 0,
      site: {
        url: brand.website_url ?? crawl.data?.url ?? null,
        analyzedAt:
          crawl.data && ['succeeded', 'partial'].includes(crawl.data.status) ? crawl.data.finished_at : null,
        status: crawl.data?.status ?? null,
      },
      documents: docs.filter((d) => d.kind === 'pdf' && d.status === 'ready').length,
      notes: docs.filter((d) => d.kind === 'note'),
      results,
    },
    playbook: parsePlaybook(brand.playbook),
    refresh: { possible: results >= MIN_POSTS_FOR_INSIGHTS, needed: MIN_POSTS_FOR_INSIGHTS },
  }
}
