import 'server-only'

import { dunningStepDue, GRACE_DAYS } from '@/lib/billing/rules'
import { logger } from '@/lib/logger'
import { pluralSr } from '@/lib/plural'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { notifyUsers } from '@/services/notifications'

import { grantSubscriptionSlice, processPaymentEvent } from './events'

/**
 * Dnevni posao naplate (D-090): mesečni tokeni godišnjeg plana (T13), podsetnici za neuspelo plaćanje
 * dan 1, 3 i 6 roka (T9) i čišćenje isteklih rezervacija i grantova (T3, trag u istoriji tokena).
 */
export async function runBillingDaily(
  now = new Date(),
): Promise<{ yearlyGrants: number; reminders: number; expiredReservations: number; expiredGrants: number }> {
  const admin = createSupabaseAdminClient()
  let yearlyGrants = 0
  let reminders = 0

  const { data: yearly } = await admin
    .from('subscriptions')
    .select(
      'workspace_id, provider_subscription_id, current_period_start, current_period_end, last_invoice_id, plans!inner(*)',
    )
    .in('status', ['active', 'trialing'])
    .eq('plans.interval', 'year')
  for (const s of yearly ?? []) {
    if (!s.current_period_start || !s.current_period_end) continue
    try {
      const created = await grantSubscriptionSlice({
        workspaceId: s.workspace_id,
        plan: s.plans,
        subscriptionId: s.provider_subscription_id,
        periodStart: new Date(s.current_period_start),
        periodEnd: new Date(s.current_period_end),
        invoiceId: s.last_invoice_id,
        now,
      })
      if (created) yearlyGrants++
    } catch (error) {
      logger.error('billing_yearly_grant_failed', { subscriptionId: s.provider_subscription_id, error })
    }
  }

  const { data: pastDue } = await admin
    .from('subscriptions')
    .select('id, workspace_id, grace_until, dunning_step, workspaces!inner(owner_id)')
    .eq('status', 'past_due')
    .not('grace_until', 'is', null)
  for (const s of pastDue ?? []) {
    const step = dunningStepDue(s.grace_until!, now)
    if (step <= s.dunning_step) continue
    const daysLeft = Math.max(0, Math.ceil((new Date(s.grace_until!).getTime() - now.getTime()) / 86_400_000))
    await notifyUsers({
      userIds: [s.workspaces.owner_id],
      workspaceId: s.workspace_id,
      brandId: null,
      type: 'billing_payment_failed',
      title:
        daysLeft > 0
          ? `Plaćanje i dalje nije uspelo: još ${daysLeft} ${pluralSr(daysLeft, 'dan', 'dana', 'dana')}`
          : 'Rok za plaćanje ističe danas',
      body: `Ažurirajte karticu u upravljanju pretplatom. Posle ${GRACE_DAYS} dana od neuspelog plaćanja generisanje staje, a zakazane objave ostaju.`,
      link: '/app/billing',
    })
    await admin.from('subscriptions').update({ dunning_step: step }).eq('id', s.id)
    reminders++
  }

  // događaji zaglavljeni u stanju received (pozadinski servis nije primio posao)
  const { data: stuck } = await admin
    .from('payment_events')
    .select('id')
    .eq('status', 'received')
    .lt('received_at', new Date(now.getTime() - 30 * 60_000).toISOString())
    .order('received_at')
    .limit(50)
  for (const ev of stuck ?? []) {
    try {
      await processPaymentEvent(ev.id)
    } catch (error) {
      logger.error('billing_stuck_event_failed', { paymentEventId: ev.id, error })
    }
  }

  const [res, grants] = await Promise.all([admin.rpc('expire_reservations'), admin.rpc('expire_grants')])
  if (res.error) logger.error('billing_expire_reservations_failed', { error: res.error })
  if (grants.error) logger.error('billing_expire_grants_failed', { error: grants.error })
  return {
    yearlyGrants,
    reminders,
    expiredReservations: Number(res.data ?? 0),
    expiredGrants: Number(grants.data ?? 0),
  }
}
