import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export interface PlanLimits {
  brands: number
  social_accounts: number
  members: number
  crawl_pages: number
}

const FREE_FALLBACK: PlanLimits = { brands: 1, social_accounts: 2, members: 1, crawl_pages: 30 }

export interface WorkspacePlan {
  code: string
  name: string
  limits: PlanLimits
  subscriptionStatus: string | null
}

/**
 * Aktivan plan workspace-a: aktivna pretplata → njen plan, inače besplatni.
 * Čita se admin klijentom jer editor nema RLS pristup pretplati, a limiti su mu potrebni.
 */
export async function getWorkspacePlan(workspaceId: string): Promise<WorkspacePlan> {
  const admin = createSupabaseAdminClient()
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, plans!inner(code, name, limits)')
    .eq('workspace_id', workspaceId)
    .in('status', ['trialing', 'active', 'past_due'])
    .maybeSingle()

  if (sub?.plans) {
    return {
      code: sub.plans.code,
      name: sub.plans.name,
      limits: { ...FREE_FALLBACK, ...(sub.plans.limits as Partial<PlanLimits>) },
      subscriptionStatus: sub.status,
    }
  }

  const { data: free } = await admin
    .from('plans')
    .select('code, name, limits')
    .eq('code', 'free')
    .maybeSingle()
  return {
    code: 'free',
    name: free?.name ?? 'Besplatno',
    limits: { ...FREE_FALLBACK, ...((free?.limits as Partial<PlanLimits> | undefined) ?? {}) },
    subscriptionStatus: null,
  }
}
