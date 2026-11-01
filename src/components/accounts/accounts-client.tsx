'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { PlatformTile } from '@/components/landing/platform-tile'
import { byKey } from '@/components/landing/platforms'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PLATFORMS } from '@/config/platforms'
import { INTL_UI } from '@/i18n/config'
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

/** OAuth tokovi sa porukom kad mreža ne vrati nijedan nalog (tekst je u `accounts.emptyNotice`). */
const EMPTY_NOTICE_PROVIDERS = [
  'meta',
  'linkedin',
  'tiktok',
  'google_business',
  'youtube',
  'pinterest',
  'x',
] as const
type EmptyNoticeProvider = (typeof EMPTY_NOTICE_PROVIDERS)[number]

function emptyNoticeProvider(provider: string | null): EmptyNoticeProvider {
  return EMPTY_NOTICE_PROVIDERS.find((p) => p === provider) ?? 'meta'
}

/**
 * Mreže na ekranu za povezivanje, redom; Facebook i Instagram dele Meta tok (jedna prijava za obe).
 * `hint` je ključ napomene u `accounts`.
 */
export const CONNECT_TILES: Array<{
  platform: AccountView['platform']
  provider: string
  hint?: 'viaFacebook'
}> = [
  { platform: 'facebook', provider: 'meta' },
  { platform: 'instagram', provider: 'meta', hint: 'viaFacebook' },
  { platform: 'linkedin', provider: 'linkedin' },
  { platform: 'tiktok', provider: 'tiktok' },
  { platform: 'youtube', provider: 'youtube' },
  { platform: 'pinterest', provider: 'pinterest' },
  { platform: 'x', provider: 'x' },
  { platform: 'google_business', provider: 'google_business' },
]

function ErrorBox({ error }: { error: unknown }) {
  const tc = useTranslations('common')
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : tc('error')}
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
  const t = useTranslations('accounts')
  const locale = useLocale()
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
  const tileState = (tile: (typeof CONNECT_TILES)[number]): 'ready' | 'admin' | 'off' | 'soon' => {
    const a = availability.find((x) => x.provider === tile.provider)
    if (!a?.configured) return 'soon'
    if (!a.enabledPlatforms.includes(tile.platform)) return 'off'
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
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle', { brand: brandName })}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('connectTitle')}</CardTitle>
          <CardDescription>{canAdmin ? t('connectAdmin') : t('connectMember')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CONNECT_TILES.map((tile) => {
              const state = tileState(tile)
              const count = connectedCount(tile.platform)
              const label = platformLabel(tile.platform)
              const status =
                state === 'ready'
                  ? count
                    ? t('tile.connectMore', { count })
                    : t('tile.connect')
                  : state === 'admin'
                    ? count
                      ? t('tile.connected', { count })
                      : t('tile.byAdmin')
                    : state === 'off'
                      ? t('tile.off')
                      : t('tile.soon')
              const body = (
                <>
                  <PlatformTile p={byKey(tile.platform)} size={48} radius={14} glyph={21} />
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
                    {tile.hint ? (
                      <span className="block text-xs text-muted-foreground">{t(tile.hint)}</span>
                    ) : null}
                  </span>
                </>
              )
              return (
                <li key={tile.platform}>
                  {state === 'ready' ? (
                    <a
                      href={connectHref(tile.provider)}
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
              {notConfigured.length
                ? t('adminNoteMissing', { list: notConfigured.join(', ') })
                : t('adminNote')}
              {flaggedOff.length ? ` ${t('adminFlagged', { list: flaggedOff.join(', ') })}` : ''}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {notice === 'denied' ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('denied')}
        </p>
      ) : null}
      {notice === 'empty' ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t(`emptyNotice.${emptyNoticeProvider(noticeProvider)}`)}
        </p>
      ) : null}

      {pending.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('pickTitle')}</CardTitle>
            <CardDescription>{t('pickDescription')}</CardDescription>
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
                    aria-label={t('pickOne', { name: a.name })}
                  />
                  <AccountAvatar account={a} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {platformLabel(a.platform)}
                      {a.username ? ` · @${a.username}` : ''}
                      {a.followers !== null ? ` · ${t('followers', { count: a.followers })}` : ''}
                      {!a.capabilities.publish ? ` · ${t('readOnly')}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => activate.mutate()}
              disabled={!canAdmin || selected.size === 0 || activate.isPending}
            >
              {activate.isPending ? t('connecting') : t('connectSelected', { count: selected.size })}
            </Button>
            <ErrorBox error={activate.error} />
          </CardContent>
        </Card>
      ) : null}

      {accounts.isPending ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : null}
      <ErrorBox error={accounts.error} />
      {accounts.data && accounts.data.accounts.length === 0 && !pending.length ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t('empty')} {canAdmin ? t('emptyAdmin') : t('emptyMember')}
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
                      {t(`status.${a.status}`)}
                    </Badge>
                    {a.assistedOnly ? <Badge variant="outline">{t('assisted')}</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.username ? `@${a.username} · ` : ''}
                    {a.followers !== null ? `${t('followers', { count: a.followers })} · ` : ''}
                    {t('imported', { count: a.historyCount })}
                    {a.lastSyncedAt
                      ? ` · ${t('synced', { date: new Date(a.lastSyncedAt).toLocaleString(INTL_UI[locale]) })}`
                      : ''}
                  </div>
                  {a.platform === 'linkedin' && a.tokenExpiresAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('linkedinExpiry', {
                        date: new Date(a.tokenExpiresAt).toLocaleDateString(INTL_UI[locale]),
                      })}
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
                    {t('sync')}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHistoryFor(historyFor === a.id ? null : a.id)}
                >
                  {historyFor === a.id ? t('hideHistory') : t('history')}
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
                    {t('reconnect')}
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
                    {t('disconnect')}
                  </Button>
                ) : null}
              </div>
              {historyFor === a.id ? (
                <div className="space-y-1 rounded-md bg-muted p-3 text-xs">
                  {history.isPending ? t('historyLoading') : null}
                  <ErrorBox error={history.error} />
                  {history.data && history.data.length === 0 ? t('historyEmpty') : null}
                  {history.data?.map((h) => (
                    <div key={h.id} className="border-b py-1 last:border-b-0">
                      <span className="text-muted-foreground">
                        {h.published_at ? new Date(h.published_at).toLocaleDateString(INTL_UI[locale]) : '—'}
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
                        · {t('metrics', { likes: h.metrics.likes ?? 0, comments: h.metrics.comments ?? 0 })}
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
