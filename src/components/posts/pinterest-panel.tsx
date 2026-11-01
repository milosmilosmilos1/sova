'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { pinterestTitle, type PinterestOptions } from '@/config/pinterest'
import type { ApiResponse } from '@/lib/api/response'

interface Board {
  id: string
  name: string
  privacy: string | null
}

async function fetchBoards(accountId: string): Promise<Board[]> {
  const res = await fetch(`/api/social-accounts/${accountId}/pinterest-boards`)
  const data = (await res.json()) as ApiResponse<Board[]>
  if (!data.ok) throw new Error(data.error.message)
  return data.data
}

/**
 * Pin (faza 8c): tabla se bira za svaki pin (pravila Pinterest-a, D-085) i čita se uživo; naslov
 * pina je podešavanje, naslov objave ili prvi red teksta.
 */
export function PinterestPanel({
  accountId,
  value,
  postTitle,
  text,
  onChange,
  disabled,
}: {
  accountId: string
  value: PinterestOptions
  postTitle: string
  text: string
  onChange: (next: PinterestOptions) => void
  disabled: boolean
}) {
  const t = useTranslations('postPanels')
  const boards = useQuery({
    queryKey: ['pinterest-boards', accountId],
    queryFn: () => fetchBoards(accountId),
    staleTime: 60_000,
    retry: 1,
  })
  const id = (name: string) => `pin-${name}-${accountId}`
  const set = (patch: Partial<PinterestOptions>) => onChange({ ...value, ...patch })
  const known = boards.data ?? []
  const missing = value.boardId && !known.some((b) => b.id === value.boardId)
  return (
    <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={id('board')}>{t('pinterest.board')}</Label>
          <select
            id={id('board')}
            value={value.boardId ?? ''}
            disabled={disabled || boards.isLoading}
            onChange={(e) => {
              const b = known.find((x) => x.id === e.target.value)
              set({ boardId: b?.id ?? null, boardName: b?.name ?? null })
            }}
            className="h-9 w-full rounded-md border border-input bg-background px-2"
          >
            <option value="">
              {boards.isLoading ? t('pinterest.loadingBoards') : t('pinterest.chooseBoard')}
            </option>
            {missing ? <option value={value.boardId!}>{value.boardName ?? value.boardId}</option> : null}
            {known.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.privacy && b.privacy !== 'PUBLIC' ? ` ${t('pinterest.secret')}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={id('title')}>{t('pinterest.pinTitle')}</Label>
          <Input
            id={id('title')}
            maxLength={100}
            placeholder={pinterestTitle(value, postTitle || null, text) || t('titlePlaceholder')}
            value={value.title ?? ''}
            disabled={disabled}
            onChange={(e) => set({ title: e.target.value || null })}
          />
        </div>
      </div>
      {boards.error ? (
        <p className="text-xs text-destructive" role="alert">
          {boards.error instanceof Error ? boards.error.message : t('pinterest.loadError')}
        </p>
      ) : null}
      {!boards.isLoading && !boards.error && known.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('pinterest.noBoards')}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('pinterest.hint')}</p>
    </div>
  )
}
