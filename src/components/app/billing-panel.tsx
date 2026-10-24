'use client'

import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ApiResponse } from '@/lib/api/response'

interface PlanView {
  code: string
  name: string
  kind: 'subscription' | 'topup'
  interval: string | null
  priceCents: number
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

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
    cents / 100,
  )

const date = (iso: string) => new Date(iso).toLocaleDateString('sr-Latn-RS')

const STATUS: Record<string, string> = {
  active: 'aktivna',
  trialing: 'probni period',
  past_due: 'plaćanje nije uspelo',
  unpaid: 'neplaćena',
  canceled: 'završena',
  incomplete: 'čeka prvo plaćanje',
  paused: 'pauzirana',
}

function ledgerLabel(e: LedgerEntry): string {
  if (e.reason === 'consume') return 'Potrošeno'
  if (e.reason === 'expire') return 'Isteklo'
  if (e.reason === 'refund') return 'Oduzeto posle povraćaja novca'
  if (e.reason === 'admin_adjust') return e.delta > 0 ? 'Dodela podrške' : 'Izmena podrške'
  switch (e.source) {
    case 'signup':
      return 'Poklon pri registraciji'
    case 'subscription':
      return 'Pretplata'
    case 'topup':
      return 'Dopuna'
    case 'refund':
      return 'Vraćeni tokeni'
    default:
      return 'Dodela'
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
          Plaćanje je primljeno. Plan i tokeni se ažuriraju za nekoliko sekundi.
        </p>
      ) : null}
      {checkout === 'canceled' ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Plaćanje je otkazano; ništa nije naplaćeno.
        </p>
      ) : null}
      {overview.isError ? <p className="text-sm text-destructive">Podaci o naplati nisu učitani.</p> : null}
      {go.isError ? <p className="text-sm text-destructive">{go.error.message}</p> : null}

      {o && !o.configured ? (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Plaćanje još nije uključeno na serveru (Stripe ključevi). Plan i tokeni rade kao i do sada.
        </p>
      ) : null}
      {o && !o.canManage ? (
        <p className="text-sm text-muted-foreground">Plaćanja vodi vlasnik radnog prostora.</p>
      ) : null}

      {sub?.status === 'past_due' && sub.graceUntil ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {sub.blocked
            ? 'Rok za plaćanje je istekao: generisanje je zaustavljeno. Zakazane objave i dalje izlaze.'
            : `Plaćanje pretplate nije uspelo. Ažurirajte karticu do ${date(sub.graceUntil)}; posle toga generisanje staje.`}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Plan <Badge variant="secondary">{o?.plan.name ?? '…'}</Badge>
          </CardTitle>
          <CardDescription>
            {o
              ? `Do ${o.plan.limits.brands} brenda, ${o.plan.limits.social_accounts} mreža i ${o.plan.limits.members} člana.`
              : 'Učitavam…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {o ? (
            <p>
              Dostupno tokena: <strong>{o.balance.available}</strong>
              {o.balance.reserved ? ` (još ${o.balance.reserved} u radu)` : ''}
            </p>
          ) : null}
          {sub ? (
            <p>
              Pretplata: {STATUS[sub.status] ?? sub.status}
              {sub.currentPeriodEnd
                ? sub.cancelAtPeriodEnd
                  ? `, završava se ${date(sub.currentPeriodEnd)}`
                  : `, sledeća obnova ${date(sub.currentPeriodEnd)}`
                : ''}
              .
            </p>
          ) : null}
          {sub && o?.hasCustomer && o.canManage ? (
            <Button
              variant="outline"
              disabled={!canBuy || go.isPending}
              onClick={() => go.mutate({ path: '/api/billing/portal', body: { workspaceId } })}
            >
              Upravljajte pretplatom i karticom
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!sub ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {subscriptionPlans.map((p) => (
            <Card key={p.code}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>
                  {money(p.priceCents, p.currency)} {p.interval === 'year' ? 'godišnje' : 'mesečno'}
                  {p.interval === 'year'
                    ? ` (oko ${money(Math.round(p.priceCents / 12), p.currency)} mesečno)`
                    : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{p.tokens} tokena svakog meseca, veći limiti brendova, mreža i članova.</p>
                <Button
                  disabled={!canBuy || go.isPending}
                  onClick={() =>
                    go.mutate({ path: '/api/billing/checkout', body: { workspaceId, planCode: p.code } })
                  }
                >
                  Pretplatite se
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dopuna tokena</CardTitle>
          <CardDescription>Kupljeni tokeni ne ističu i troše se posle tokena iz pretplate.</CardDescription>
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
              {p.name} · {money(p.priceCents, p.currency)}
            </Button>
          ))}
        </CardContent>
      </Card>

      {canSeeLedger ? (
        <Card>
          <CardHeader>
            <CardTitle>Istorija tokena</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {ledger.data?.pages[0]?.entries.length === 0 ? (
              <p className="text-muted-foreground">Još nema promena.</p>
            ) : null}
            <table className="w-full text-left">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-normal">Datum</th>
                  <th className="py-1 font-normal">Promena</th>
                  <th className="py-1 text-right font-normal">Promena tokena</th>
                  <th className="py-1 text-right font-normal">Stanje</th>
                </tr>
              </thead>
              <tbody>
                {ledger.data?.pages
                  .flatMap((p) => p.entries)
                  .map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="py-1">{date(e.createdAt)}</td>
                      <td className="py-1">{ledgerLabel(e)}</td>
                      <td className={`py-1 text-right ${e.delta > 0 ? 'text-emerald-700' : ''}`}>
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
                Prikaži starije
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
