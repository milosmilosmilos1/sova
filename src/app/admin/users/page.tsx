import type { Metadata, Route } from 'next'
import Link from 'next/link'

import { fmtDate, fmtN } from '@/components/admin/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { requireAdmin } from '@/services/admin/context'
import { listUsers, type UserListFilters } from '@/services/admin/users'

export const metadata: Metadata = { title: 'Korisnici' }

const STATUS: Record<string, string> = {
  '': 'svi',
  active: 'aktivni',
  banned: 'blokirani',
  unverified: 'nepotvrđen email',
  admin: 'admini',
}
const SORT: Record<string, string> = {
  created_desc: 'najnoviji',
  created_asc: 'najstariji',
  email_asc: 'email A–Z',
  email_desc: 'email Z–A',
}

function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

export default async function AdminUsersPage({ searchParams }: PageProps<'/admin/users'>) {
  await requireAdmin()
  const sp = await searchParams
  const filters: UserListFilters = {
    q: str(sp.q) || null,
    status: (str(sp.status) || null) as UserListFilters['status'],
    plan: str(sp.plan) || null,
    from: str(sp.from) || null,
    to: str(sp.to) || null,
    sort: (str(sp.sort) || 'created_desc') as UserListFilters['sort'],
    page: Number(str(sp.page)) || 1,
    pageSize: 25,
  }
  const r = await listUsers(filters)
  const pages = Math.max(1, Math.ceil(r.total / r.pageSize))
  const link = (page: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({
      q: filters.q,
      status: filters.status,
      plan: filters.plan,
      from: filters.from,
      to: filters.to,
      sort: filters.sort,
    }))
      if (v) q.set(k, String(v))
    q.set('page', String(page))
    return `/admin/users?${q.toString()}` as Route
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Korisnici</h1>
        <p className="text-sm text-muted-foreground">
          {fmtN(r.total)} korisnika po filterima. Pretraga po emailu, imenu ili nazivu radnog prostora.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-2" method="get">
        <Input
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="email, ime, radni prostor"
          className="w-64"
          aria-label="Pretraga"
        />
        <select
          name="status"
          defaultValue={filters.status ?? ''}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Status"
        >
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          name="plan"
          defaultValue={filters.plan ?? ''}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Plan"
        >
          <option value="">svi planovi</option>
          <option value="free">besplatni</option>
          <option value="monthly">mesečni</option>
          <option value="yearly">godišnji</option>
        </select>
        <label className="text-xs text-muted-foreground">
          od
          <Input type="date" name="from" defaultValue={filters.from ?? ''} className="w-40" />
        </label>
        <label className="text-xs text-muted-foreground">
          do
          <Input type="date" name="to" defaultValue={filters.to ?? ''} className="w-40" />
        </label>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Sortiranje"
        >
          {Object.entries(SORT).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">
          Primeni
        </Button>
      </form>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Korisnik</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2 text-right">Radni prostori</th>
              <th className="px-3 py-2 text-right">Tokeni</th>
              <th className="px-3 py-2">Registracija</th>
              <th className="px-3 py-2">Poslednja prijava</th>
            </tr>
          </thead>
          <tbody>
            {r.items.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">
                  <Link href={`/admin/users/${u.id}` as Route} className="font-medium hover:underline">
                    {u.email}
                  </Link>
                  {u.fullName ? <div className="text-xs text-muted-foreground">{u.fullName}</div> : null}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.platformRole === 'platform_admin' ? <Badge>admin</Badge> : null}
                    {u.isBanned ? <Badge variant="destructive">blokiran</Badge> : null}
                    {!u.emailVerifiedAt ? <Badge variant="outline">nepotvrđen</Badge> : null}
                    {u.mfa ? <Badge variant="secondary">2FA</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-2">{u.plan}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.workspaces}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(u.tokensAvailable)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(u.createdAt, false)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(u.lastSignInAt)}</td>
              </tr>
            ))}
            {!r.items.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Nema korisnika po ovim filterima.
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
            <Link href={link(r.page - 1)} className="underline">
              Prethodna
            </Link>
          ) : null}
          {r.page < pages ? (
            <Link href={link(r.page + 1)} className="underline">
              Sledeća
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
