import 'server-only'

import { ApiError } from '@/lib/api/errors'
import { billingBlocked } from '@/lib/billing/rules'
import { env } from '@/lib/env'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'

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

export type PlanRow = Database['public']['Tables']['plans']['Row']

/** Aktivni planovi po redosledu prikaza (cenovnik i provera kupovine). */
export async function listPlans(): Promise<PlanRow[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

export async function planByCode(code: string): Promise<PlanRow | null> {
  const { data } = await createSupabaseAdminClient().from('plans').select('*').eq('code', code).maybeSingle()
  return data
}

/** Stripe cena plana: `plans.provider_price_ids.stripe`, inače env za mesečni i godišnji (D-090). */
export function stripePriceId(plan: Pick<PlanRow, 'code' | 'provider_price_ids'>): string | null {
  const ids = (plan.provider_price_ids ?? {}) as Record<string, unknown>
  if (typeof ids.stripe === 'string' && ids.stripe) return ids.stripe
  if (plan.code === 'monthly') return env.STRIPE_PRICE_MONTHLY ?? null
  if (plan.code === 'yearly') return env.STRIPE_PRICE_YEARLY ?? null
  return null
}

/** Plan pretplate po Stripe ceni; rezerva je `plan_code` iz metadata pretplate. */
export async function planForPrice(priceId: string | null, fallbackCode?: string): Promise<PlanRow | null> {
  const plans = (await listPlans()).filter((p) => p.kind === 'subscription' && p.code !== 'free')
  return (
    (priceId ? plans.find((p) => stripePriceId(p) === priceId) : undefined) ??
    (fallbackCode ? plans.find((p) => p.code === fallbackCode) : undefined) ??
    null
  )
}

/** Generisanje staje posle roka za plaćanje ili kad je pretplata `unpaid` (T9, K6). */
export async function assertBillingActive(workspaceId: string): Promise<void> {
  const { data } = await createSupabaseAdminClient()
    .from('subscriptions')
    .select('status, grace_until')
    .eq('workspace_id', workspaceId)
    .in('status', ['past_due', 'unpaid'])
    .order('updated_at', { ascending: false })
    .limit(1)
  if (billingBlocked(data?.[0] ?? null, new Date())) throw new ApiError('PAYMENT_REQUIRED')
}
