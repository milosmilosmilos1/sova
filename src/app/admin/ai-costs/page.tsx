import type { Metadata, Route } from 'next'
import Link from 'next/link'

import { fmtN, fmtUsd } from '@/components/admin/format'
import { ColumnChart } from '@/components/charts/column-chart'
import { dayLabel } from '@/components/charts/scale'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/services/admin/context'
import { getAiCosts } from '@/services/admin/stats'

export const metadata: Metadata = { title: 'AI troškovi' }

export default async function AdminAiCostsPage({ searchParams }: PageProps<'/admin/ai-costs'>) {
  await requireAdmin()
  const sp = await searchParams
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30
  const d = await getAiCosts(days)
  const total = d.byModel.reduce((n, m) => n + m.costUsd, 0)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI troškovi</h1>
          <p className="text-sm text-muted-foreground">
            Ukupno {fmtUsd(total, 4)} za {days} dana. Vrednost tokena za maržu:{' '}
            {d.tokenValueUsd ? fmtUsd(d.tokenValueUsd, 4) : '—'} (najniža cena po tokenu; besplatni tokeni
            nemaju prihod).
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {[7, 30, 90].map((x) => (
            <Link
              key={x}
              href={`/admin/ai-costs?days=${x}` as Route}
              className={x === days ? 'font-medium underline' : 'text-muted-foreground hover:underline'}
            >
              {x} dana
            </Link>
          ))}
        </div>
      </div>
      {d.negativeCount ? (
        <p
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {d.negativeCount} radnih prostora ima negativnu maržu u periodu (trošak provajdera veći od prihoda
          od tokena).
        </p>
      ) : null}
      <Card>
        <CardContent className="grid gap-8 lg:grid-cols-2">
          <ColumnChart
            title="Trošak provajdera po danu (USD)"
            unit="usd"
            bars={d.byDay.map((x) => ({
              key: x.day,
              label: dayLabel(x.day),
              longLabel: dayLabel(x.day),
              value: x.costUsd,
            }))}
            emptyText="U periodu nije bilo AI poziva."
          />
          <ColumnChart
            title="Generisanja po danu"
            bars={d.byDay.map((x) => ({
              key: x.day,
              label: dayLabel(x.day),
              longLabel: dayLabel(x.day),
              value: x.generations,
            }))}
            emptyText="U periodu nije bilo AI poziva."
          />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Po modelu</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Model</th>
                  <th className="py-1 pr-2 text-right">Generisanja</th>
                  <th className="py-1 pr-2 text-right">Neuspela</th>
                  <th className="py-1 pr-2 text-right">Tokeni</th>
                  <th className="py-1 text-right">Trošak</th>
                </tr>
              </thead>
              <tbody>
                {d.byModel.map((m) => (
                  <tr key={m.model} className="border-t">
                    <td className="py-1 pr-2 font-mono text-xs">{m.model}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtN(m.generations)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtN(m.failed)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtN(m.tokens)}</td>
                    <td className="py-1 text-right tabular-nums">{fmtUsd(m.costUsd, 4)}</td>
                  </tr>
                ))}
                {!d.byModel.length ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-muted-foreground">
                      Nema generisanja u periodu.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Po danu</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {[...d.byDay].reverse().map((x) => (
                  <tr key={x.day} className="border-t first:border-t-0">
                    <td className="py-1 pr-2 text-muted-foreground">{x.day}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtN(x.generations)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtN(x.tokens)} tok.</td>
                    <td className="py-1 text-right tabular-nums">{fmtUsd(x.costUsd, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Po radnom prostoru (korisniku)</CardTitle>
          <CardDescription>
            Vlasnik radnog prostora; generisanja Autopilota nemaju korisnika pa se vode na radni prostor.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Radni prostor</th>
                <th className="py-1 pr-2">Vlasnik</th>
                <th className="py-1 pr-2 text-right">Generisanja</th>
                <th className="py-1 pr-2 text-right">Tokeni</th>
                <th className="py-1 pr-2 text-right">Trošak</th>
                <th className="py-1 pr-2 text-right">Prihod</th>
                <th className="py-1 text-right">Marža</th>
              </tr>
            </thead>
            <tbody>
              {d.byWorkspace.map((w) => (
                <tr key={w.workspaceId} className="border-t">
                  <td className="py-1 pr-2">
                    {w.workspaceName}{' '}
                    {w.paid ? (
                      <Badge variant="secondary">plaća</Badge>
                    ) : (
                      <Badge variant="outline">besplatno</Badge>
                    )}
                  </td>
                  <td className="py-1 pr-2">{w.ownerEmail ?? '—'}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmtN(w.generations)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmtN(w.tokens)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmtUsd(w.costUsd, 4)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmtUsd(w.revenueUsd, 4)}</td>
                  <td
                    className={`py-1 text-right tabular-nums ${w.negative && w.costUsd > 0 ? 'font-medium text-destructive' : ''}`}
                  >
                    {fmtUsd(w.marginUsd, 4)}
                  </td>
                </tr>
              ))}
              {!d.byWorkspace.length ? (
                <tr>
                  <td colSpan={7} className="py-3 text-center text-muted-foreground">
                    Nema podataka.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
