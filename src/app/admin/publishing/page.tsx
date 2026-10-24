import type { Metadata, Route } from 'next'
import Link from 'next/link'

import { RetryButton } from '@/components/admin/admin-actions'
import { fmtDate, fmtN } from '@/components/admin/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { requireAdmin } from '@/services/admin/context'
import { getPublishMonitor, type FailedTargetRow } from '@/services/admin/monitor'

export const metadata: Metadata = { title: 'Monitor objava' }

const label = (p: string) => PLATFORMS[p as SocialPlatform]?.label ?? p

function Rows({ rows, retry }: { rows: FailedTargetRow[]; retry: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nema.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 pr-2">Vreme</th>
            <th className="py-1 pr-2">Mreža</th>
            <th className="py-1 pr-2">Radni prostor · brend</th>
            <th className="py-1 pr-2">Objava</th>
            <th className="py-1 pr-2">Greška</th>
            <th className="py-1 pr-2 text-right">Pokušaji</th>
            {retry ? <th className="py-1">&nbsp;</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(retry ? r.updatedAt : r.scheduledAt)}</td>
              <td className="py-1 pr-2">{label(r.platform)}</td>
              <td className="py-1 pr-2">
                {r.workspaceName ?? '—'} · {r.brandName ?? '—'}
              </td>
              <td className="py-1 pr-2">{r.postTitle ?? r.postId}</td>
              <td className="py-1 pr-2">
                <span className="font-mono text-xs">{r.errorCode ?? '—'}</span>
                {r.errorMessage ? (
                  <div className="text-xs text-muted-foreground">{r.errorMessage}</div>
                ) : null}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{r.attempts}</td>
              {retry ? (
                <td className="py-1">
                  <RetryButton targetId={r.id} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function AdminPublishingPage({ searchParams }: PageProps<'/admin/publishing'>) {
  await requireAdmin()
  const sp = await searchParams
  const platform = typeof sp.platform === 'string' ? sp.platform : null
  const code = typeof sp.code === 'string' ? sp.code : null
  const m = await getPublishMonitor({ platform, code, days: 30 })
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monitor objava</h1>
        <p className="text-sm text-muted-foreground">
          Neuspele objave u celom sistemu za {m.days} dana: {fmtN(m.total)}. Čeka ponovno povezivanje naloga:{' '}
          {fmtN(m.needsReauth)}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Po mreži i kodu greške</CardTitle>
          <CardDescription>Klik na red filtrira listu ispod.</CardDescription>
        </CardHeader>
        <CardContent>
          {m.groups.length ? (
            <table className="w-full text-sm">
              <tbody>
                {m.groups.map((g) => (
                  <tr key={`${g.platform}-${g.code}`} className="border-t first:border-t-0">
                    <td className="py-1 pr-2">
                      <Link
                        href={
                          `/admin/publishing?platform=${g.platform}&code=${encodeURIComponent(g.code)}` as Route
                        }
                        className="hover:underline"
                      >
                        {label(g.platform)}
                      </Link>
                    </td>
                    <td className="py-1 pr-2 font-mono text-xs">{g.code}</td>
                    <td className="py-1 text-right tabular-nums">{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Nema neuspelih objava.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Neuspele objave{platform ? ` · ${label(platform)}` : ''}
            {code ? ` · ${code}` : ''}
          </CardTitle>
          {platform || code ? (
            <CardDescription>
              <Link href="/admin/publishing" className="underline">
                Ukloni filter
              </Link>
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          <Rows rows={m.failed} retry />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zakazane koje kasne više od 3 minuta</CardTitle>
          <CardDescription>
            Watchdog ih sam ponovo šalje svakih 5 minuta; ovde se vidi šta stoji.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Rows rows={m.late} retry={false} />
        </CardContent>
      </Card>
    </div>
  )
}
