'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { PlatformTile } from '@/components/landing/platform-tile'
import { byKey } from '@/components/landing/platforms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORMS } from '@/config/platforms'
import type { ApiResponse } from '@/lib/api/response'
import { cn } from '@/lib/utils'

/**
 * Mreže (faze 8a–8b): povezani nalozi brenda, izbor naloga posle OAuth-a, sinhronizacija, prekid veze.
 * Facebook i Instagram dele jedan tok (`meta`); LinkedIn i TikTok imaju svoje.
 * Dizajn dolazi u fazi 14; ovde su funkcionalnost i 4 stanja.
 */
interface AccountView {
  id: string
  platform: keyof typeof PLATFORMS
  name: string
  username: string | null
  avatarUrl: string | null
  accountType: string
  status: 'active' | 'needs_reauth' | 'disabled' | 'revoked'
  statusReason: string | null
  capabilities: Record<string, boolean>
  assistedOnly: boolean
  followers: number | null
  pending: boolean
  pendingState: string | null
  tokenExpiresAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
  historyCount: number
}

interface AccountsResponse {
  accounts: AccountView[]
  pending: AccountView[]
  availability: Array<{ provider: string; label: string; configured: boolean; enabledPlatforms: string[] }>
}

interface HistoryItem {
  id: string
  external_id: string
  post_type: string | null
  text_content: string | null
  permalink: string | null
  published_at: string | null
  metrics: Record<string, number>
}

async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) headers.set('content-type', 'application/json')
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  const data = (await res.json()) as ApiResponse<T>
  if (!data.ok) throw new Error(`${data.error.message} (${data.error.code})`)
  return data.data
}

/** Ključ OAuth toka za mrežu naloga (za „Poveži ponovo”). */
function providerOf(platform: string): string {
  return platform === 'facebook' || platform === 'instagram' ? 'meta' : platform
}

const EMPTY_NOTICE: Record<string, string> = {
  meta: 'Facebook nije vratio nijednu stranicu. Proverite da ste administrator stranice i da je Instagram nalog poslovni i povezan sa stranicom.',
  linkedin: 'LinkedIn nije vratio nijedan nalog.',
  tiktok: 'TikTok nije vratio nalog.',
  google_business:
    'Google nije vratio nijednu lokaciju. Proverite da ste vlasnik ili menadžer poslovnog profila i da je profil verifikovan.',
  youtube: 'Google nalog nema YouTube kanal. Napravite kanal na YouTube-u pa povežite ponovo.',
  pinterest: 'Pinterest nije vratio nalog.',
  x: 'X nije vratio nalog.',
}

/** Mreže na ekranu za povezivanje, redom; Facebook i Instagram dele Meta tok (jedna prijava za obe). */
const CONNECT_TILES: Array<{ platform: AccountView['platform']; provider: string; hint?: string }> = [
  { platform: 'facebook', provider: 'meta' },
  { platform: 'instagram', provider: 'meta', hint: 'prijava preko Facebook-a' },
  { platform: 'linkedin', provider: 'linkedin' },
  { platform: 'tiktok', provider: 'tiktok' },
  { platform: 'youtube', provider: 'youtube' },
  { platform: 'pinterest', provider: 'pinterest' },
  { platform: 'x', provider: 'x' },
  { platform: 'google_business', provider: 'google_business' },
]

const STATUS_LABEL: Record<AccountView['status'], string> = {
  active: 'aktivno',
  needs_reauth: 'treba ponovo povezati',
  disabled: 'isključeno',
  revoked: 'opozvano',
}

function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : 'Greška.'}
    </div>
  )
}

export function AccountsClient({
  brandId,
  brandName,
  canAdmin,
  canEdit,
  isPlatformAdmin,
  pendingState,
  notice,
  noticeProvider,
}: {
  brandId: string
  brandName: string
  canAdmin: boolean
  canEdit: boolean
  /** admin platforme vidi zašto mreža piše „Uskoro” (nema ključeva aplikacije) */
  isPlatformAdmin: boolean
  pendingState: string | null
  notice: string | null
  noticeProvider: string | null
}) {
  const qc = useQueryClient()
  const key = ['social-accounts', brandId, pendingState]
  const accounts = useQuery({
    queryKey: key,
    queryFn: () =>
      api<AccountsResponse>(
        `/api/social-accounts?brandId=${brandId}${pendingState ? `&pending=${encodeURIComponent(pendingState)}` : ''}`,
      ),
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['social-accounts', brandId] })

  const activate = useMutation({
    mutationFn: () =>
      api<AccountView[]>('/api/social-accounts/activate', {
        method: 'POST',
        json: { brandId, pendingState, ids: [...selected] },
      }),
    onSuccess: () => {
      setSelected(new Set())
      window.history.replaceState(null, '', '/app/accounts')
      void invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/social-accounts/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
  const sync = useMutation({
    mutationFn: (id: string) => api(`/api/social-accounts/${id}/sync`, { method: 'POST' }),
    onSuccess: invalidate,
  })
  const history = useQuery({
    queryKey: ['social-history', historyFor],
    queryFn: () => api<HistoryItem[]>(`/api/social-accounts/${historyFor}/history?limit=20`),
    enabled: Boolean(historyFor),
  })

  const availability = accounts.data?.availability ?? []
  const tileState = (t: (typeof CONNECT_TILES)[number]): 'ready' | 'admin' | 'off' | 'soon' => {
    const a = availability.find((x) => x.provider === t.provider)
    if (!a?.configured) return 'soon'
    if (!a.enabledPlatforms.includes(t.platform)) return 'off'
    return canAdmin ? 'ready' : 'admin'
  }
  const connectedCount = (platform: string) =>
    (accounts.data?.accounts ?? []).filter((x) => x.platform === platform).length
  const notConfigured = availability.filter((a) => !a.configured).map((a) => a.label)
  const flaggedOff = availability
    .filter((a) => a.configured && a.enabledPlatforms.length === 0)
    .map((a) => a.label)
  const providerReady = (platform: string) =>
    availability.some((a) => a.provider === providerOf(platform) && a.configured)
  const connectHref = (provider: string) =>
    `/api/integrations/${provider}/connect?brandId=${brandId}&redirectTo=/app/accounts`
  const pending = accounts.data?.pending ?? []
  const platformLabel = (p: AccountView['platform']) => PLATFORMS[p]?.label ?? p

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mreže</h1>
          <p className="text-sm text-muted-foreground">
            Brend: {brandName}. Povezani nalozi na koje Sova objavljuje i sa kojih uvozi istoriju.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Povežite mrežu</CardTitle>
          <CardDescription>
            {canAdmin
              ? 'Kliknite mrežu, prijavite se na njoj i dozvolite Sovi pristup. Lozinku unosite samo na stranici mreže, Sova je ne vidi.'
              : 'Mreže povezuje vlasnik ili administrator radnog prostora.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CONNECT_TILES.map((t) => {
              const state = tileState(t)
              const count = connectedCount(t.platform)
              const label = platformLabel(t.platform)
              const status =
                state === 'ready'
                  ? count
                    ? `Povezano: ${count}, dodaj još`
                    : 'Poveži'
                  : state === 'admin'
                    ? count
                      ? `Povezano: ${count}`
                      : 'Povezuje administrator'
                    : state === 'off'
                      ? 'Privremeno isključeno'
                      : 'Uskoro'
              const body = (
                <>
                  <PlatformTile p={byKey(t.platform)} size={48} radius={14} glyph={21} />
                  <span className="min-w-0">
                    <span className="block leading-tight font-medium">{label}</span>
                    <span
                      className={cn(
                        'block text-xs',
                        state === 'ready' ? 'font-medium text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {status}
                    </span>
                    {t.hint ? <span className="block text-xs text-muted-foreground">{t.hint}</span> : null}
                  </span>
                </>
              )
              return (
                <li key={t.platform}>
                  {state === 'ready' ? (
                    <a
                      href={connectHref(t.provider)}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      {body}
                    </a>
                  ) : (
                    <div
                      aria-disabled="true"
                      className="flex items-center gap-3 rounded-lg border border-dashed p-3 opacity-60"
                    >
                      {body}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {isPlatformAdmin && (notConfigured.length || flaggedOff.length) ? (
            <p className="text-xs text-muted-foreground">
              Za administratora platforme: „Uskoro” znači da na serveru nema ključeva aplikacije
              {notConfigured.length ? ` (${notConfigured.join(', ')})` : ''}.
              {flaggedOff.length ? ` Isključeno feature flagom: ${flaggedOff.join(', ')}.` : ''}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {notice === 'denied' ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Povezivanje je otkazano na mreži.
        </p>
      ) : null}
      {notice === 'empty' ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {EMPTY_NOTICE[noticeProvider ?? 'meta'] ?? EMPTY_NOTICE.meta}
        </p>
      ) : null}

      {pending.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Izaberite naloge</CardTitle>
            <CardDescription>
              Mreža je vratila ove naloge (stranice, profile). Štiklirajte one na koje Sova sme da objavljuje.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y">
              {pending.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.has(a.id)}
                    onChange={(e) =>
                      setSelected((cur) => {
                        const next = new Set(cur)
                        if (e.target.checked) next.add(a.id)
                        else next.delete(a.id)
                        return next
                      })
                    }
                    aria-label={`Izaberi ${a.name}`}
                  />
                  <AccountAvatar account={a} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {platformLabel(a.platform)}
                      {a.username ? ` · @${a.username}` : ''}
                      {a.followers !== null ? ` · ${a.followers} pratilaca` : ''}
                      {!a.capabilities.publish ? ' · bez prava objavljivanja (samo čitanje)' : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => activate.mutate()}
              disabled={!canAdmin || selected.size === 0 || activate.isPending}
            >
              {activate.isPending ? 'Povezujem…' : `Poveži izabrane (${selected.size})`}
            </Button>
            <ErrorBox error={activate.error} />
          </CardContent>
        </Card>
      ) : null}

      {accounts.isPending ? <p className="text-sm text-muted-foreground">Učitavam naloge…</p> : null}
      <ErrorBox error={accounts.error} />
      {accounts.data && accounts.data.accounts.length === 0 && !pending.length ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Još nema povezanih mreža.{' '}
            {canAdmin ? 'Kliknite mrežu iznad da počnete.' : 'Vlasnik ili administrator povezuje mreže.'}
          </CardContent>
        </Card>
      ) : null}

      {accounts.data?.accounts.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {accounts.data.accounts.map((a) => (
            <li key={a.id} className="space-y-2 rounded-lg border p-4 text-sm">
              <div className="flex items-start gap-3">
                <AccountAvatar account={a} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{a.name}</span>
                    <Badge variant="secondary">{platformLabel(a.platform)}</Badge>
                    <Badge variant={a.status === 'active' ? 'default' : 'outline'}>
                      {STATUS_LABEL[a.status]}
                    </Badge>
                    {a.assistedOnly ? <Badge variant="outline">asistirano objavljivanje</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.username ? `@${a.username} · ` : ''}
                    {a.followers !== null ? `${a.followers} pratilaca · ` : ''}
                    {a.historyCount} uvezenih objava
                    {a.lastSyncedAt
                      ? ` · sinhronizovano ${new Date(a.lastSyncedAt).toLocaleString('sr-Latn-RS')}`
                      : ''}
                  </div>
                  {a.platform === 'linkedin' && a.tokenExpiresAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Veza važi do {new Date(a.tokenExpiresAt).toLocaleDateString('sr-Latn-RS')}; LinkedIn
                      traži ponovno povezivanje na 60 dana.
                    </p>
                  ) : null}
                  {a.statusReason ? <p className="mt-1 text-xs text-amber-800">{a.statusReason}</p> : null}
                  {a.lastError ? <p className="mt-1 text-xs text-destructive">{a.lastError}</p> : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canEdit && a.status === 'active' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sync.mutate(a.id)}
                    disabled={sync.isPending}
                  >
                    Sinhronizuj
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHistoryFor(historyFor === a.id ? null : a.id)}
                >
                  {historyFor === a.id ? 'Sakrij istoriju' : 'Istorija objava'}
                </Button>
                {(a.status !== 'active' || a.platform === 'linkedin') &&
                canAdmin &&
                providerReady(a.platform) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<a href={connectHref(providerOf(a.platform))} />}
                  >
                    Poveži ponovo
                  </Button>
                ) : null}
                {canAdmin ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove.mutate(a.id)}
                    disabled={remove.isPending}
                  >
                    Prekini vezu
                  </Button>
                ) : null}
              </div>
              {historyFor === a.id ? (
                <div className="space-y-1 rounded-md bg-muted p-3 text-xs">
                  {history.isPending ? 'Učitavam…' : null}
                  <ErrorBox error={history.error} />
                  {history.data && history.data.length === 0
                    ? 'Još nema uvezenih objava (uvoz traje do minut posle povezivanja).'
                    : null}
                  {history.data?.map((h) => (
                    <div key={h.id} className="border-b py-1 last:border-b-0">
                      <span className="text-muted-foreground">
                        {h.published_at ? new Date(h.published_at).toLocaleDateString('sr-Latn-RS') : '—'}
                      </span>{' '}
                      {h.permalink ? (
                        <a href={h.permalink} target="_blank" rel="noreferrer" className="underline">
                          {(h.text_content ?? h.post_type ?? h.external_id).slice(0, 90)}
                        </a>
                      ) : (
                        (h.text_content ?? h.post_type ?? h.external_id).slice(0, 90)
                      )}
                      <span className="text-muted-foreground">
                        {' '}
                        · {h.metrics.likes ?? 0} sviđanja, {h.metrics.comments ?? 0} komentara
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ErrorBox error={remove.error ?? sync.error} />
    </div>
  )
}

function AccountAvatar({ account }: { account: AccountView }) {
  if (account.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={account.avatarUrl} alt="" className="size-10 shrink-0 rounded-full border object-cover" />
    )
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium">
      {account.name.slice(0, 2).toUpperCase()}
    </div>
  )
}
