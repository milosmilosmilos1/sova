import type { Metadata } from 'next'
import Link from 'next/link'

import { fmtN, fmtPct, fmtUsd } from '@/components/admin/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { requireAdmin } from '@/services/admin/context'
import { getDashboard } from '@/services/admin/stats'

export const metadata: Metadata = { title: 'Pregled' }

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-xs text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  )
}

export default async function AdminHomePage() {
  await requireAdmin()
  const d = await getDashboard(30)
  const lastDays = d.users.perDay.slice(-14)
  const maxDay = Math.max(1, ...lastDays.map((x) => x.count))
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pregled platforme</h1>
        <p className="text-sm text-muted-foreground">
          Poslednjih 30 dana. Aktivni korisnici se računaju po osvežavanju sesije.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase">Korisnici</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Ukupno" value={fmtN(d.users.total)} hint={`${fmtN(d.users.banned)} blokirano`} />
          <Tile
            label="Novi"
            value={fmtN(d.users.new30d)}
            hint={`danas ${fmtN(d.users.new1d)} · 7 dana ${fmtN(d.users.new7d)}`}
          />
          <Tile
            label="DAU / MAU"
            value={`${fmtN(d.users.dau)} / ${fmtN(d.users.mau)}`}
            hint={`nedeljno ${fmtN(d.users.wau)}`}
          />
          <Tile label="Radni prostori / brendovi" value={`${fmtN(d.workspaces)} / ${fmtN(d.brands)}`} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nove registracije po danu (14 dana)</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {lastDays.map((x) => (
                  <tr key={x.day} className="border-t first:border-t-0">
                    <td className="w-28 py-1 pr-2 text-muted-foreground">
                      {x.day.slice(8, 10)}.{x.day.slice(5, 7)}.
                    </td>
                    <td className="py-1 pr-2">
                      <div
                        className="h-2 rounded-full bg-primary/70"
                        style={{ width: `${(x.count / maxDay) * 100}%`, minWidth: x.count ? 4 : 0 }}
                      />
                    </td>
                    <td className="w-12 py-1 text-right tabular-nums">{x.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase">Naplata</h2>
        {!d.billing.enabled ? (
          <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
            Još nema aktivnih pretplata: naplata stiže u fazi 12, pa su MRR, ARR i churn za sada nula.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="MRR" value={fmtUsd(d.billing.mrrUsd)} hint={`ARR ${fmtUsd(d.billing.arrUsd)}`} />
          <Tile
            label="Aktivne pretplate"
            value={fmtN(d.billing.activeTotal)}
            hint={d.billing.activeByPlan.map((p) => `${p.name}: ${p.active}`).join(' · ') || 'nema'}
          />
          <Tile label="Churn (30 dana)" value={fmtPct(d.billing.churn30d)} />
          <Tile
            label="Konverzija besplatno → plaćeno"
            value={fmtPct(d.billing.conversion)}
            hint={`${fmtN(d.billing.paidWorkspaces)} plaćenih, ${fmtN(d.billing.topupWorkspaces)} sa dopunom`}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase">Tokeni i AI</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Potrošeni tokeni"
            value={fmtN(d.tokens.consumed30d)}
            hint={`7 dana ${fmtN(d.tokens.consumed7d)} · dodeljeno ${fmtN(d.tokens.granted30d)}`}
          />
          <Tile
            label="AI generisanja"
            value={fmtN(d.ai.generations30d)}
            hint={`${fmtN(d.ai.failed30d)} neuspelih`}
          />
          <Tile label="AI trošak" value={fmtUsd(d.ai.cost30dUsd)} hint={`7 dana ${fmtUsd(d.ai.cost7dUsd)}`} />
          <Tile
            label="Procena marže"
            value={fmtUsd(d.ai.margin30dUsd)}
            hint={`vrednost tokena ${d.tokens.valueUsd ? fmtUsd(d.tokens.valueUsd, 4) : '—'} · detalji na strani AI troškovi`}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase">Objave</h2>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Po mreži (30 dana)</CardTitle>
            </CardHeader>
            <CardContent>
              {d.publishing.byPlatform.length ? (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">Mreža</th>
                      <th className="py-1 pr-2 text-right">Uspešne</th>
                      <th className="py-1 text-right">Neuspele</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.publishing.byPlatform.map((p) => (
                      <tr key={p.platform} className="border-t">
                        <td className="py-1 pr-2">
                          {PLATFORMS[p.platform as SocialPlatform]?.label ?? p.platform}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{fmtN(p.published)}</td>
                        <td className={`py-1 text-right tabular-nums ${p.failed ? 'text-destructive' : ''}`}>
                          {fmtN(p.failed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">Nema objava u periodu.</p>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-4">
            <Tile label="Kasne više od 3 min" value={fmtN(d.publishing.late)} />
            <Tile
              label="Neuspele (24 h)"
              value={fmtN(d.publishing.failed24h)}
              hint="Monitor objava ima ručni ponovni pokušaj."
            />
            <Link href="/admin/publishing" className="text-sm underline">
              Otvori monitor objava
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
