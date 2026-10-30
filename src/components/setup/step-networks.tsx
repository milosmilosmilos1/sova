'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CONNECT_TILES } from '@/components/accounts/accounts-client'
import { PlatformTile } from '@/components/landing/platform-tile'
import { byKey } from '@/components/landing/platforms'
import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { PLATFORMS, type SocialPlatform } from '@/config/platforms'
import { cn } from '@/lib/utils'

import { StepFooter } from './step-footer'

interface AccountView {
  id: string
  platform: SocialPlatform
  name: string
  username: string | null
  avatarUrl: string | null
  status: 'active' | 'needs_reauth' | 'disabled' | 'revoked'
  capabilities: Record<string, boolean>
}

interface AccountsResponse {
  accounts: AccountView[]
  pending: AccountView[]
  availability: Array<{ provider: string; configured: boolean; enabledPlatforms: string[] }>
}

/**
 * Korak 2: povezivanje mreža iz uvoda. OAuth se vraća na /app/setup sa `pending`, pa korisnik ovde
 * bira stranice i naloge, kao na strani Mreže.
 */
export function StepNetworks({
  brandId,
  canAdmin,
  pendingState,
  notice,
  onBack,
  onNext,
}: {
  brandId: string
  canAdmin: boolean
  pendingState: string | null
  notice: string | null
  onBack: () => void
  onNext: () => void
}) {
  const t = useTranslations('setup.networks')
  const qc = useQueryClient()
  const [pendingKey, setPendingKey] = useState(pendingState)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const key = ['social-accounts', brandId, pendingKey]
  const accounts = useQuery({
    queryKey: key,
    queryFn: () =>
      api<AccountsResponse>(
        `/api/social-accounts?brandId=${brandId}${pendingKey ? `&pending=${encodeURIComponent(pendingKey)}` : ''}`,
      ),
  })
  const activate = useMutation({
    mutationFn: () =>
      api('/api/social-accounts/activate', {
        method: 'POST',
        json: { brandId, pendingState: pendingKey, ids: [...selected] },
      }),
    onSuccess: () => {
      setSelected(new Set())
      setPendingKey(null)
      window.history.replaceState(null, '', '/app/setup?step=2')
      void qc.invalidateQueries({ queryKey: ['social-accounts', brandId] })
      void qc.invalidateQueries({ queryKey: ['setup-state', brandId] })
    },
  })

  const availability = accounts.data?.availability ?? []
  const connected = (accounts.data?.accounts ?? []).filter((a) => a.status === 'active')
  const pending = accounts.data?.pending ?? []
  const tileState = (tile: (typeof CONNECT_TILES)[number]) => {
    const a = availability.find((x) => x.provider === tile.provider)
    if (!a?.configured) return 'soon' as const
    if (!a.enabledPlatforms.includes(tile.platform)) return 'off' as const
    return canAdmin ? ('ready' as const) : ('admin' as const)
  }
  const href = (provider: string) =>
    `/api/integrations/${provider}/connect?brandId=${brandId}&redirectTo=/app/setup`

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('text')}</p>
        {!canAdmin ? <p className="text-sm text-muted-foreground">{t('adminOnly')}</p> : null}
      </div>

      {notice === 'denied' || notice === 'empty' ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{t(notice)}</p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {CONNECT_TILES.map((tile) => {
          const state = tileState(tile)
          const count = connected.filter((a) => a.platform === tile.platform).length
          const body = (
            <>
              <PlatformTile p={byKey(tile.platform)} size={40} radius={12} glyph={18} />
              <span className="min-w-0">
                <span className="block leading-tight font-medium">{PLATFORMS[tile.platform].label}</span>
                <span
                  className={cn(
                    'block text-xs',
                    state === 'ready' ? 'font-medium text-primary' : 'text-muted-foreground',
                  )}
                >
                  {count
                    ? t('connected', { count })
                    : state === 'ready'
                      ? t('connect')
                      : state === 'off'
                        ? t('off')
                        : state === 'soon'
                          ? t('soon')
                          : '—'}
                </span>
                {tile.platform === 'instagram' ? (
                  <span className="block text-xs text-muted-foreground">{t('instagramHint')}</span>
                ) : null}
              </span>
            </>
          )
          return (
            <li key={tile.platform}>
              {state === 'ready' ? (
                <a
                  href={href(tile.provider)}
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

      {pending.length ? (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h3 className="font-medium">{t('pickTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('pickText')}</p>
          </div>
          <ul className="divide-y">
            {pending.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.has(a.id)}
                  aria-label={t('pick', { name: a.name })}
                  onChange={(e) =>
                    setSelected((cur) => {
                      const next = new Set(cur)
                      if (e.target.checked) next.add(a.id)
                      else next.delete(a.id)
                      return next
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {PLATFORMS[a.platform]?.label ?? a.platform}
                    {a.username ? ` · @${a.username}` : ''}
                    {!a.capabilities.publish ? ` · ${t('readOnly')}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Button
            disabled={!canAdmin || selected.size === 0 || activate.isPending}
            onClick={() => activate.mutate()}
          >
            {activate.isPending ? t('picking') : t('pickButton', { count: selected.size })}
          </Button>
          <ErrorBox error={activate.error} />
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{t('list')}</h3>
        <ErrorBox error={accounts.error} />
        {connected.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {connected.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <PlatformTile p={byKey(a.platform)} size={28} radius={8} glyph={13} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  {a.username ? (
                    <span className="block text-xs text-muted-foreground">@{a.username}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : accounts.isSuccess ? (
          <p className="text-sm text-muted-foreground">{t('none')}</p>
        ) : null}
      </section>

      <StepFooter onBack={onBack} onNext={onNext} nextLabel={connected.length ? undefined : t('later')} />
    </div>
  )
}
