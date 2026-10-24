import type { Metadata, Route } from 'next'
import Link from 'next/link'

import { fmtDate, fmtN } from '@/components/admin/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { listAudit } from '@/services/admin/audit'
import { requireAdmin } from '@/services/admin/context'
import { listImpersonationSessions } from '@/services/admin/impersonation'

export const metadata: Metadata = { title: 'Audit log' }

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

function short(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = JSON.stringify(v)
  return s.length > 140 ? `${s.slice(0, 137)}…` : s
}

export default async function AdminAuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  await requireAdmin()
  const sp = await searchParams
  const filters = {
    adminEmail: str(sp.admin) || null,
    action: str(sp.action) || null,
    target: str(sp.target) || null,
    from: str(sp.from) || null,
    to: str(sp.to) || null,
  }
  const page = Number(str(sp.page)) || 1
  const [r, sessions] = await Promise.all([
    listAudit({ ...filters, page, pageSize: 50 }),
    listImpersonationSessions({ limit: 15 }),
  ])
  const pages = Math.max(1, Math.ceil(r.total / r.pageSize))
  const qs = new URLSearchParams()
  if (filters.adminEmail) qs.set('admin', filters.adminEmail)
  if (filters.action) qs.set('action', filters.action)
  if (filters.target) qs.set('target', filters.target)
  if (filters.from) qs.set('from', filters.from)
  if (filters.to) qs.set('to', filters.to)
  const pageLink = (n: number) => {
    const q = new URLSearchParams(qs)
    q.set('page', String(n))
    return `/admin/audit?${q.toString()}` as Route
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          {fmtN(r.total)} zapisa po filterima. Tabela je append-only: baza odbija izmene i brisanje.
        </p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <Input
          name="admin"
          defaultValue={filters.adminEmail ?? ''}
          placeholder="email admina"
          className="w-48"
          aria-label="Admin"
        />
        <Input
          name="action"
          defaultValue={filters.action ?? ''}
          placeholder="akcija (npr. user., impersonation.)"
          className="w-56"
          aria-label="Akcija"
        />
        <Input
          name="target"
          defaultValue={filters.target ?? ''}
          placeholder="email ili ID korisnika"
          className="w-56"
          aria-label="Korisnik"
        />
        <label className="text-xs text-muted-foreground">
          od
          <Input type="date" name="from" defaultValue={filters.from ?? ''} className="w-40" />
        </label>
        <label className="text-xs text-muted-foreground">
          do
          <Input type="date" name="to" defaultValue={filters.to ?? ''} className="w-40" />
        </label>
        <Button type="submit" size="sm">
          Pretraži
        </Button>
        <a href={`/api/admin/audit/export?${qs.toString()}`} className="text-sm underline">
          Izvezi CSV
        </a>
      </form>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Vreme</th>
              <th className="px-3 py-2">Admin</th>
              <th className="px-3 py-2">Akcija</th>
              <th className="px-3 py-2">Cilj</th>
              <th className="px-3 py-2">Pre → posle</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((a) => (
              <tr key={a.id} className="border-t align-top">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(a.createdAt)}</td>
                <td className="px-3 py-2">{a.adminEmail ?? a.adminId}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {a.action}
                  {a.impersonationSessionId ? (
                    <div className="text-muted-foreground">sesija {a.impersonationSessionId.slice(0, 8)}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {a.targetType ?? ''} {a.targetEmail ?? a.targetId ?? ''}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {short(a.before)}
                  {a.before && a.after ? ' → ' : ''}
                  {short(a.after)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{a.ip ?? ''}</td>
              </tr>
            ))}
            {!r.items.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Nema zapisa po ovim filterima.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Strana {r.page} od {pages}
        </span>
        <div className="flex gap-2">
          {r.page > 1 ? (
            <Link href={pageLink(r.page - 1)} className="underline">
              Prethodna
            </Link>
          ) : null}
          {r.page < pages ? (
            <Link href={pageLink(r.page + 1)} className="underline">
              Sledeća
            </Link>
          ) : null}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sesije impersonacije</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length ? (
            <table className="w-full text-sm">
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t align-top first:border-t-0">
                    <td className="py-1 pr-2 whitespace-nowrap">{fmtDate(s.startedAt)}</td>
                    <td className="py-1 pr-2">{s.adminEmail}</td>
                    <td className="py-1 pr-2">
                      <Link href={`/admin/users/${s.userId}` as Route} className="hover:underline">
                        {s.userEmail ?? s.userId}
                      </Link>
                    </td>
                    <td className="py-1 pr-2">{s.mode === 'full' ? 'pun režim' : 'samo čitanje'}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{s.requests} zahteva</td>
                    <td className="py-1 pr-2 text-muted-foreground">
                      {s.endedAt ? `kraj: ${s.endReason ?? ''}` : 'aktivna'}
                    </td>
                    <td className="py-1 text-xs text-muted-foreground">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">Još nije bilo impersonacija.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
