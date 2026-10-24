import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ImpersonateForm, TokenAdjustForm, UserControls } from '@/components/admin/admin-actions'
import { fmtDate, fmtN, fmtUsd } from '@/components/admin/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isApiError } from '@/lib/api/errors'
import { adminContextFromHeaders, requireAdmin } from '@/services/admin/context'
import { getUserDetail, type UserDetail } from '@/services/admin/users'

export const metadata: Metadata = { title: 'Korisnik' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  )
}

const Empty = ({ text }: { text: string }) => <p className="text-muted-foreground">{text}</p>

export default async function AdminUserPage({ params }: PageProps<'/admin/users/[id]'>) {
  const viewer = await requireAdmin()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  let d: UserDetail
  try {
    d = await getUserDetail(await adminContextFromHeaders(viewer), id)
  } catch (error) {
    if (isApiError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const p = d.profile
  const isAdmin = p.platformRole === 'platform_admin'
  const isSelf = p.id === viewer.user.id
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{p.email}</h1>
        {isAdmin ? <Badge>admin</Badge> : null}
        {p.isBanned ? <Badge variant="destructive">blokiran</Badge> : null}
        {!p.emailVerifiedAt ? <Badge variant="outline">email nije potvrđen</Badge> : null}
        {d.auth.mfaFactors ? <Badge variant="secondary">2FA</Badge> : null}
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        {p.fullName ?? 'bez imena'} · registrovan {fmtDate(p.createdAt)} · poslednja prijava{' '}
        {fmtDate(d.auth.lastSignInAt)} · {p.locale} · {p.timezone}
        {p.isBanned && p.bannedReason ? ` · razlog blokade: ${p.bannedReason}` : ''}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="Radni prostori i tokeni">
            {d.workspaces.length ? (
              <table className="w-full">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Radni prostor</th>
                    <th className="py-1 pr-2">Uloga</th>
                    <th className="py-1 pr-2">Plan</th>
                    <th className="py-1 pr-2 text-right">Članovi</th>
                    <th className="py-1 text-right">Tokeni (dostupno / rezervisano)</th>
                  </tr>
                </thead>
                <tbody>
                  {d.workspaces.map((w) => (
                    <tr key={w.id} className="border-t">
                      <td className="py-1 pr-2">{w.name}</td>
                      <td className="py-1 pr-2">{w.role}</td>
                      <td className="py-1 pr-2">
                        {w.plan}
                        {w.subscriptionStatus ? (
                          <span className="text-xs text-muted-foreground"> · {w.subscriptionStatus}</span>
                        ) : null}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{w.otherMembers + 1}</td>
                      <td className="py-1 text-right tabular-nums">
                        {fmtN(w.tokens.available)} / {fmtN(w.tokens.reserved)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text="Nije član nijednog radnog prostora." />
            )}
          </Section>

          <Section title="Brendovi i mreže (bez tokena)">
            {d.brands.length ? (
              <ul className="space-y-2">
                {d.brands.map((b) => (
                  <li key={b.id}>
                    <span className="font-medium">{b.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      · {b.status} · Autopilot nivo {b.autopilotLevel}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.socialAccounts
                        .filter((a) => a.brandId === b.id)
                        .map((a) => (
                          <Badge key={a.id} variant={a.status === 'active' ? 'secondary' : 'outline'}>
                            {a.platform}: {a.name} · {a.status}
                            {a.assistedOnly ? ' · asistirano' : ''}
                          </Badge>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="Nema brendova." />
            )}
          </Section>

          <Section title="Istorija tokena (poslednjih 25)">
            {d.ledger.length ? (
              <table className="w-full">
                <tbody>
                  {d.ledger.map((l) => (
                    <tr key={l.id} className="border-t first:border-t-0">
                      <td className="py-1 pr-2 whitespace-nowrap text-muted-foreground">
                        {fmtDate(l.createdAt)}
                      </td>
                      <td className="py-1 pr-2">{l.reason}</td>
                      <td
                        className={`py-1 pr-2 text-right tabular-nums ${l.delta < 0 ? 'text-destructive' : 'text-emerald-700'}`}
                      >
                        {l.delta > 0 ? '+' : ''}
                        {l.delta}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{l.balanceAfter}</td>
                      <td className="py-1 text-xs text-muted-foreground">{l.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text="Nema promena tokena." />
            )}
          </Section>

          <Section title="Poslednja generisanja">
            {d.generations.length ? (
              <table className="w-full">
                <tbody>
                  {d.generations.map((g) => (
                    <tr key={g.id} className="border-t align-top first:border-t-0">
                      <td className="py-1 pr-2 whitespace-nowrap text-muted-foreground">
                        {fmtDate(g.createdAt)}
                      </td>
                      <td className="py-1 pr-2">{g.type}</td>
                      <td className="py-1 pr-2">
                        <Badge variant={g.status === 'failed' ? 'destructive' : 'outline'}>{g.status}</Badge>
                      </td>
                      <td className="py-1 pr-2 font-mono text-xs">{g.model ?? '—'}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{g.tokensCharged}</td>
                      <td className="py-1 text-right tabular-nums">{fmtUsd(g.costUsd, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text="Nema generisanja." />
            )}
          </Section>

          <Section title="Neuspele objave">
            {d.failedTargets.length ? (
              <ul className="space-y-1">
                {d.failedTargets.map((t) => (
                  <li key={t.id}>
                    <span className="text-muted-foreground">{fmtDate(t.updatedAt)}</span> · {t.platform} ·{' '}
                    {t.errorCode ?? 'bez koda'}: {t.errorMessage ?? ''}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="Nema neuspelih objava." />
            )}
          </Section>

          <Section title="Audit (poslednjih 20 akcija nad korisnikom)">
            {d.audit.length ? (
              <ul className="space-y-1">
                {d.audit.map((a) => (
                  <li key={a.id}>
                    <span className="text-muted-foreground">{fmtDate(a.createdAt)}</span> ·{' '}
                    <span className="font-mono text-xs">{a.action}</span> · {a.adminEmail ?? a.adminId}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="Nema zapisa." />
            )}
          </Section>
        </div>

        <aside className="space-y-4">
          <ImpersonateForm
            userId={p.id}
            email={p.email}
            disabled={isAdmin ? 'Drugi admin se ne može impersonirati.' : isSelf ? 'Ovo je vaš nalog.' : null}
          />
          <TokenAdjustForm
            userId={p.id}
            workspaces={d.workspaces.map((w) => ({ id: w.id, name: w.name, available: w.tokens.available }))}
          />
          <UserControls
            userId={p.id}
            email={p.email}
            isBanned={p.isBanned}
            emailVerified={Boolean(p.emailVerifiedAt || d.auth.emailConfirmedAt)}
            isAdmin={isAdmin}
            isSelf={isSelf}
          />
          {d.flags.length ? (
            <Section title="Oznake zloupotrebe">
              <ul className="space-y-1">
                {d.flags.map((f) => (
                  <li key={f.kind}>
                    {f.kind}: {f.count} · {fmtDate(f.lastAt)}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Section title="Impersonacije ovog korisnika">
            {d.impersonations.length ? (
              <ul className="space-y-1">
                {d.impersonations.map((s) => (
                  <li key={s.id}>
                    {fmtDate(s.startedAt)} · {s.adminEmail} ·{' '}
                    {s.mode === 'full' ? 'pun režim' : 'samo čitanje'} · {s.requests} zahteva
                    <div className="text-xs text-muted-foreground">{s.reason}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="Nije bilo impersonacija." />
            )}
          </Section>
        </aside>
      </div>
    </div>
  )
}
