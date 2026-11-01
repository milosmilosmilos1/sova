'use client'

import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { INTL_UI } from '@/i18n/config'
import type { ApiResponse } from '@/lib/api/response'

interface PlanView {
  code: string
  name: string
  kind: 'subscription' | 'topup'
  interval: string | null
  priceCents: number
  regularPriceCents: number | null
  currency: string
  tokens: number
  tokenPeriod: string
}

interface Overview {
  configured: boolean
  canManage: boolean
  plan: { code: string; name: string; limits: { brands: number; social_accounts: number; members: number } }
  subscription: {
    status: string
    planCode: string
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    graceUntil: string | null
    blocked: boolean
  } | null
  hasCustomer: boolean
  balance: { total: number; reserved: number; available: number }
  plans: PlanView[]
}

interface LedgerEntry {
  id: number
  delta: number
  balanceAfter: number
  reason: string
  source: string | null
  createdAt: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

const post = <T,>(path: string, body: unknown) =>
  api<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

type LedgerKey =
  | 'consume'
  | 'expire'
  | 'refund'
  | 'supportGrant'
  | 'supportAdjust'
  | 'signup'
  | 'subscription'
  | 'topup'
  | 'refunded'
  | 'grant'

/** Ključ natpisa promene u istoriji tokena (poruke billing.ledger). */
function ledgerKey(e: LedgerEntry): LedgerKey {
  if (e.reason === 'consume') return 'consume'
  if (e.reason === 'expire') return 'expire'
  if (e.reason === 'refund') return 'refund'
  if (e.reason === 'admin_adjust') return e.delta > 0 ? 'supportGrant' : 'supportAdjust'
  switch (e.source) {
    case 'signup':
      return 'signup'
    case 'subscription':
      return 'subscription'
    case 'topup':
      return 'topup'
    case 'refund':
      return 'refunded'
    default:
      return 'grant'
  }
}

/** Naplata (faza 12, D-090): plan i pretplata, kupovina kroz Stripe Checkout, Portal, istorija tokena. */
export function BillingPanel({
  workspaceId,
  canSeeLedger,
  checkout,
}: {
  workspaceId: string
  canSeeLedger: boolean
  checkout: 'success' | 'canceled' | null
}) {
  const t = useTranslations('billing')
  const tag = INTL_UI[useLocale()]
  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat(tag, { style: 'currency', currency, maximumFractionDigits: 2 }).format(cents / 100)
  const date = (iso: string) => new Date(iso).toLocaleDateString(tag)
  // naziv plana iz baze se prevodi po kodu; nepoznat kod ostaje sa nazivom iz baze
  const planName = (code: string, name: string) => {
    const key = `planNames.${code}` as 'planNames.free'
    return t.has(key) ? t(key) : name
  }
  const statusLabel = (status: string) => {
    const key = `status.${status}` as 'status.active'
    return t.has(key) ? t(key) : status
  }
  const [pollUntil] = useState(() => (checkout === 'success' ? Date.now() + 60_000 : 0))
  const overview = useQuery({
    queryKey: ['billing', workspaceId],
    queryFn: () => api<Overview>(`/api/billing?workspaceId=${workspaceId}`),
    // posle povratka sa Checkout-a stanje stiže webhook-om; osvežava se 60 s (T7)
    refetchInterval: () => (Date.now() < pollUntil ? 3_000 : false),
  })
  const ledger = useInfiniteQuery({
    queryKey: ['billing-ledger', workspaceId],
    enabled: canSeeLedger,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<{ entries: LedgerEntry[]; nextBefore: number | null }>(
        `/api/billing/ledger?workspaceId=${workspaceId}&limit=25${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  })
  const go = useMutation({
    mutationFn: (v: { path: string; body: unknown }) => post<{ url: string }>(v.path, v.body),
    onSuccess: (r) => {
      window.location.href = r.url
    },
  })

  const o = overview.data
  const sub = o?.subscription && o.subscription.status !== 'canceled' ? o.subscription : null
  const subscriptionPlans = o?.plans.filter((p) => p.kind === 'subscription') ?? []
  const topups = o?.plans.filter((p) => p.kind === 'topup') ?? []
  const canBuy = Boolean(o?.configured && o.canManage)

  return (
    <div className="space-y-6">
      {checkout === 'success' ? (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {t('paid')}
        </p>
      ) : null}
      {checkout === 'canceled' ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('canceled')}
        </p>
      ) : null}
      {overview.isError ? <p className="text-sm text-destructive">{t('loadFailed')}</p> : null}
      {go.isError ? <p className="text-sm text-destructive">{go.error.message}</p> : null}

      {o && !o.configured ? (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">{t('notConfigured')}</p>
      ) : null}
      {o && !o.canManage ? <p className="text-sm text-muted-foreground">{t('ownerOnly')}</p> : null}

      {sub?.status === 'past_due' && sub.graceUntil ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {sub.blocked ? t('blocked') : t('pastDue', { date: date(sub.graceUntil) })}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('plan')} <Badge variant="secondary">{o ? planName(o.plan.code, o.plan.name) : '…'}</Badge>
          </CardTitle>
          <CardDescription>
            {o
              ? t('limits', {
                  brands: o.plan.limits.brands,
                  networks: o.plan.limits.social_accounts,
                  members: o.plan.limits.members,
                })
              : t('loading')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {o ? (
            <p>
              {t.rich('available', {
                count: o.balance.available,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
              {o.balance.reserved ? ` ${t('reserved', { count: o.balance.reserved })}` : ''}
            </p>
          ) : null}
          {sub ? (
            <p>
              {sub.currentPeriodEnd
                ? t(sub.cancelAtPeriodEnd ? 'subscriptionEnds' : 'subscriptionRenews', {
                    status: statusLabel(sub.status),
                    date: date(sub.currentPeriodEnd),
                  })
                : t('subscription', { status: statusLabel(sub.status) })}
            </p>
          ) : null}
          {sub && o?.hasCustomer && o.canManage ? (
            <Button
              variant="outline"
              disabled={!canBuy || go.isPending}
              onClick={() => go.mutate({ path: '/api/billing/portal', body: { workspaceId } })}
            >
              {t('manage')}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!sub ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {subscriptionPlans.map((p) => (
            <Card key={p.code}>
              <CardHeader>
                <CardTitle>{planName(p.code, p.name)}</CardTitle>
                <CardDescription>
                  {p.regularPriceCents ? (
                    <>
                      <s>
                        <span className="sr-only">{t('regularPrice')} </span>
                        {money(p.regularPriceCents, p.currency)}
                      </s>{' '}
                      <span className="sr-only">{t('introPrice')} </span>
                    </>
                  ) : null}
                  {t(p.interval === 'year' ? 'perYear' : 'perMonth', {
                    price: money(p.priceCents, p.currency),
                  })}
                  {p.interval === 'year'
                    ? ` ${t('aboutMonthly', { price: money(Math.round(p.priceCents / 12), p.currency) })}`
                    : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{t('monthlyTokens', { count: p.tokens })}</p>
                <Button
                  disabled={!canBuy || go.isPending}
                  onClick={() =>
                    go.mutate({ path: '/api/billing/checkout', body: { workspaceId, planCode: p.code } })
                  }
                >
                  {t('subscribe')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('topup.title')}</CardTitle>
          <CardDescription>{t('topup.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {topups.map((p) => (
            <Button
              key={p.code}
              variant="outline"
              disabled={!canBuy || go.isPending}
              onClick={() =>
                go.mutate({ path: '/api/billing/topup', body: { workspaceId, planCode: p.code } })
              }
            >
              {t('topup.name', { count: p.tokens })} · {money(p.priceCents, p.currency)}
            </Button>
          ))}
        </CardContent>
      </Card>

      {canSeeLedger ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('ledger.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {ledger.data?.pages[0]?.entries.length === 0 ? (
              <p className="text-muted-foreground">{t('ledger.empty')}</p>
            ) : null}
            <table className="w-full text-left">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-normal">{t('ledger.date')}</th>
                  <th className="py-1 font-normal">{t('ledger.change')}</th>
                  <th className="py-1 text-right font-normal">{t('ledger.tokenChange')}</th>
                  <th className="py-1 text-right font-normal">{t('ledger.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.data?.pages
                  .flatMap((p) => p.entries)
                  .map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="py-1">{date(e.createdAt)}</td>
                      <td className="py-1">{t(`ledger.${ledgerKey(e)}`)}</td>
                      <td className={`py-1 text-right ${e.delta > 0 ? 'text-success' : ''}`}>
                        {e.delta > 0 ? `+${e.delta}` : e.delta}
                      </td>
                      <td className="py-1 text-right">{e.balanceAfter}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {ledger.hasNextPage ? (
              <Button
                variant="ghost"
                disabled={ledger.isFetchingNextPage}
                onClick={() => ledger.fetchNextPage()}
              >
                {t('ledger.more')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
