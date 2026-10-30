'use client'

import { Download, Film, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { uploadMediaFile } from '@/lib/media/client-upload'
import {
  canMakeVideo,
  loadSlides,
  renderSlidesVideo,
  videoPlan,
  type VideoFormat,
} from '@/lib/media/slides-video'
import { cn } from '@/lib/utils'

/**
 * „Napravi video” (D-118): slajdovi karusela postaju kratak video u pregledaču (uspravan za Reels
 * i priče ili 4:5 za objavu), otpremaju se u biblioteku i postaju nov nacrt. Bez tokena.
 */
type Stage = 'setup' | 'rendering' | 'uploading' | 'done'

export function VideoDialog({
  open,
  onOpenChange,
  postId,
  brandId,
  slides,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  postId: string
  brandId: string
  slides: string[]
  onCreated: () => void
}) {
  const t = useTranslations('review.video')
  const [format, setFormat] = useState<VideoFormat>('reel')
  const [seconds, setSeconds] = useState(3)
  const [fade, setFade] = useState(true)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [stage, setStage] = useState<Stage>('setup')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<{ url: string; postId: string; status: string } | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    void canMakeVideo(format).then((ok) => alive && setSupported(ok))
    return () => {
      alive = false
    }
  }, [open, format])

  // privremeni URL pregleda se oslobađa kad se dijalog zatvori ili napravi nov video
  useEffect(() => () => (result ? URL.revokeObjectURL(result.url) : undefined), [result])

  const plan = videoPlan(slides.length, seconds, fade)
  const busy = stage === 'rendering' || stage === 'uploading'

  const make = async () => {
    setError(null)
    setResult(null)
    setProgress(0)
    try {
      setStage('rendering')
      const bitmaps = await loadSlides(slides)
      const blob = await renderSlidesVideo({
        slides: bitmaps,
        format,
        secondsPerSlide: seconds,
        fade,
        onProgress: setProgress,
      })
      bitmaps.forEach((b) => b.close())
      setStage('uploading')
      const asset = await uploadMediaFile(new File([blob], `karusel-${format}.mp4`, { type: 'video/mp4' }), {
        brandId,
      })
      const created = await api<{ postId: string; status: string }>(`/api/approvals/${postId}/video`, {
        method: 'POST',
        json: { mediaAssetId: asset.id },
      })
      setResult({ url: URL.createObjectURL(blob), postId: created.postId, status: created.status })
      setStage('done')
      onCreated()
    } catch (err) {
      setError(err)
      setStage('setup')
    }
  }

  const chip = (on: boolean) =>
    cn(
      'rounded-lg border px-3 py-2 text-left text-sm',
      on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted',
    )

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { slides: slides.length })}</DialogDescription>
        </DialogHeader>

        {supported === false ? (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">{t('unsupported')}</p>
        ) : null}

        {stage === 'done' && result ? (
          <div className="space-y-3">
            <video
              src={result.url}
              controls
              playsInline
              className={cn(
                'mx-auto max-h-[50vh] rounded-lg bg-black',
                format === 'reel' ? 'aspect-[9/16]' : 'aspect-[4/5]',
              )}
              aria-label={t('preview')}
            />
            <p role="status" className="text-sm">
              {result.status === 'in_review' ? t('createdReview') : t('created')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<a href={result.url} download={`karusel-${format}.mp4`} />}
              >
                <Download aria-hidden />
                {t('download')}
              </Button>
              <Button nativeButton={false} render={<Link href={`/app/posts/${result.postId}`} />}>
                {t('open')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('format')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['reel', 'feed'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={format === f}
                    disabled={busy}
                    onClick={() => setFormat(f)}
                    className={chip(format === f)}
                  >
                    <span className="block font-medium">{t(`formats.${f}.label`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`formats.${f}.hint`)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="video-seconds" className="text-sm font-medium">
                  {t('seconds')}
                </label>
                <select
                  id="video-seconds"
                  value={seconds}
                  disabled={busy}
                  onChange={(e) => setSeconds(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {[2, 3, 4, 5].map((s) => (
                    <option key={s} value={s}>
                      {t('secondsValue', { n: s })}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={fade}
                  disabled={busy}
                  onChange={(e) => setFade(e.target.checked)}
                />
                {t('fade')}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('length', { seconds: Math.round(plan.seconds) })}
            </p>
            {busy ? (
              <div className="space-y-1.5" role="status">
                <p className="flex items-center gap-2 text-sm">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  {stage === 'rendering'
                    ? t('rendering', { percent: Math.round(progress * 100) })
                    : t('uploading')}
                </p>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.round((stage === 'uploading' ? 1 : progress) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
            <ErrorBox error={error} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button disabled={busy || supported !== true || slides.length < 2} onClick={() => void make()}>
                <Film aria-hidden />
                {t('make')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
