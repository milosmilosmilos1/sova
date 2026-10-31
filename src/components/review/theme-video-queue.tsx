'use client'

import { useQuery } from '@tanstack/react-query'
import { Clapperboard, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { uploadMediaFile } from '@/lib/media/client-upload'
import { canMakeVideo } from '@/lib/media/slides-video'
import { renderThemeVideo, type ThemeVideoSpec } from '@/lib/media/theme-video'

/**
 * Video u temi (D-128): dok je Odobravanje otvoreno, Sova redom pravi MP4 za videe koji čekaju, u
 * pregledaču, otprema ga i kači na nacrt. Traka pokazuje koji video se pravi i dokle je stigao;
 * pregledač bez WebCodecs-a dobija poruku gde video može da se napravi.
 */
interface Progress {
  index: number
  total: number
  share: number
}

export function ThemeVideoQueue({
  brandId,
  canEdit,
  onDone,
}: {
  brandId: string
  canEdit: boolean
  onDone: () => void
}) {
  const t = useTranslations('review.themeVideo')
  const pending = useQuery({
    queryKey: ['theme-videos', brandId],
    queryFn: () =>
      api<{ items: Array<{ id: string; title: string | null }> }>(`/api/approvals/videos?brandId=${brandId}`),
    enabled: canEdit,
    refetchInterval: 60_000,
  })
  const [supported, setSupported] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<unknown>(null)
  const running = useRef(false)
  // video koji nije uspeo se u ovoj poseti ne pokušava ponovo u krug
  const failed = useRef(new Set<string>())

  useEffect(() => {
    let alive = true
    void canMakeVideo('reel').then((ok) => alive && setSupported(ok))
    return () => {
      alive = false
    }
  }, [])

  const items = pending.data?.items
  const { refetch } = pending
  useEffect(() => {
    const todo = (items ?? []).filter((i) => !failed.current.has(i.id))
    if (!canEdit || !supported || running.current || !todo.length) return
    running.current = true
    void (async () => {
      for (let i = 0; i < todo.length; i++) {
        const item = todo[i]!
        setProgress({ index: i + 1, total: todo.length, share: 0 })
        try {
          const spec = await api<ThemeVideoSpec>(`/api/approvals/${item.id}/theme-video`)
          const blob = await renderThemeVideo(spec, (share) => setProgress((p) => (p ? { ...p, share } : p)))
          const asset = await uploadMediaFile(new File([blob], 'video-u-temi.mp4', { type: 'video/mp4' }), {
            brandId,
          })
          await api(`/api/approvals/${item.id}/theme-video`, {
            method: 'POST',
            json: { version: spec.version, mediaAssetId: asset.id },
          })
          onDone()
        } catch (err) {
          failed.current.add(item.id)
          setError(err)
        }
      }
      setProgress(null)
      running.current = false
      void refetch()
    })()
  }, [items, canEdit, supported, brandId, onDone, refetch])

  const waiting = (items ?? []).length
  if (!canEdit || (!progress && !error && (!waiting || supported !== false))) return null
  return (
    <div role="status" className="space-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <div className="flex items-center gap-3">
        {progress ? (
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Clapperboard className="size-4 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          {progress
            ? t('making', {
                index: progress.index,
                total: progress.total,
                percent: Math.round(progress.share * 100),
              })
            : supported === false && waiting
              ? t('unsupported', { count: waiting })
              : null}
        </span>
      </div>
      {progress ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.round(progress.share * 100)}%` }}
          />
        </div>
      ) : null}
      <ErrorBox error={error} />
    </div>
  )
}
