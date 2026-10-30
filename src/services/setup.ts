import 'server-only'

import type { Viewer } from '@/lib/auth/viewer'
import { EDIT_ROLES, requireMembership } from '@/lib/auth/workspace'
import { createFlowSchema } from '@/lib/schemas/flows'
import { setupFlowDays, type CompleteSetupInput } from '@/lib/schemas/setup'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { mapDbError } from '@/lib/supabase/errors'
import { parseVoice } from '@/lib/brand/voice'
import { getBrand } from '@/services/brands'
import { createFlow, type FlowView } from '@/services/flows/flows'

/**
 * Uvod u sedam koraka (D-112). Koraci čuvaju svoje podatke kroz postojeće rute (jezik, mreže, analiza,
 * glas, dizajn); ovde je samo stanje uvoda i kraj, kad izabrane teme postaju tokovi automatizacije.
 */
export interface SetupState {
  brandId: string
  completedAt: string | null
  accounts: number
  crawled: boolean
  documents: number
  voiceSaved: boolean
  flows: number
}

export async function getSetupState(viewer: Viewer, brandId: string): Promise<SetupState> {
  const brand = await getBrand(viewer, brandId)
  const admin = createSupabaseAdminClient()
  const [accounts, crawls, documents, flows] = await Promise.all([
    admin
      .from('social_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .eq('status', 'active'),
    admin
      .from('website_crawls')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .in('status', ['succeeded', 'partial']),
    admin
      .from('brand_documents')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .is('deleted_at', null),
    admin
      .from('content_flows')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.id)
      .is('deleted_at', null),
  ])
  return {
    brandId: brand.id,
    completedAt: brand.setup_completed_at,
    accounts: accounts.count ?? 0,
    crawled: (crawls.count ?? 0) > 0,
    documents: documents.count ?? 0,
    voiceSaved: Boolean(parseVoice(brand.voice)),
    flows: flows.count ?? 0,
  }
}

export interface CompleteSetupResult {
  completedAt: string
  flows: FlowView[]
  /** tokovi su napravljeni pauzirani jer brend još nema povezanu mrežu */
  pausedForAccounts: boolean
}

/**
 * Kraj uvoda: svaka izabrana tema postaje tok (karusel u stilu brenda, sve povezane mreže, vreme koje
 * bira Sova). Tema koju brend već ima kao tok se preskače, pa ponovljen poziv ne pravi duplikate.
 * Bez povezane mreže tokovi nastaju pauzirani, jer prolaz bez naloga ne može da napravi nacrt.
 */
export async function completeSetup(
  viewer: Viewer,
  brandId: string,
  input: CompleteSetupInput,
): Promise<CompleteSetupResult> {
  const brand = await getBrand(viewer, brandId)
  await requireMembership(viewer, brand.workspace_id, EDIT_ROLES)
  const admin = createSupabaseAdminClient()
  const flows: FlowView[] = []
  let pausedForAccounts = false
  if (!input.skip && input.flows.length) {
    const [{ count: accounts }, { data: existing }] = await Promise.all([
      admin
        .from('social_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', brand.id)
        .eq('status', 'active'),
      admin.from('content_flows').select('topic').eq('brand_id', brand.id).is('deleted_at', null),
    ])
    pausedForAccounts = (accounts ?? 0) === 0
    const taken = new Set((existing ?? []).map((f) => f.topic.trim().toLocaleLowerCase()))
    const cta = parseVoice(brand.voice)?.cta || null
    let index = 0
    for (const item of input.flows) {
      const key = item.topic.trim().toLocaleLowerCase()
      if (taken.has(key)) continue
      taken.add(key)
      const name = item.topic.length > 80 ? `${item.topic.slice(0, 79).trimEnd()}…` : item.topic
      const flow = await createFlow(
        viewer,
        createFlowSchema.parse({
          brandId: brand.id,
          name,
          topic: item.topic,
          cta,
          format: 'carousel',
          days: setupFlowDays(index),
          autoTime: true,
          active: item.active && !pausedForAccounts,
        }),
      )
      flows.push(flow)
      index++
    }
  }
  const completedAt = new Date().toISOString()
  const { error } = await admin.from('brands').update({ setup_completed_at: completedAt }).eq('id', brand.id)
  if (error) throw mapDbError(error)
  return { completedAt, flows, pausedForAccounts }
}
