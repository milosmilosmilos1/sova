'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { NetworkMockup, type MockMedia, type MockTarget } from '@/components/review/network-mockups'
import { NetworkIcon } from '@/components/shared/network-badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PLATFORMS } from '@/config/platforms'
import { placementOf } from '@/lib/posts/preview'
import { cn } from '@/lib/utils'

export interface PreviewTarget extends MockTarget {
  id: string
}

/**
 * Pregled na mreži (D-138): objava iz Odobravanja onako kako bi izgledala na telefonu, za svaku mrežu
 * posebno, sa tekstom koji je trenutno u obrascu (i nesačuvanim izmenama).
 */
export function NetworkPreviewDialog({
  open,
  onOpenChange,
  targets,
  initial,
  media,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  targets: PreviewTarget[]
  /** mreža izabrana u panelu za odluku */
  initial: string | null
  media: MockMedia[]
  /** video u temi se još pravi, pa se vidi njegova slika */
  pending: boolean
}) {
  const t = useTranslations('review')
  const [picked, setPicked] = useState<string | null>(null)
  const active = targets.find((x) => x.id === (picked ?? initial)) ?? targets[0]
  const twice = (x: PreviewTarget) => targets.filter((y) => y.platform === x.platform).length > 1
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicked(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('netPreview.title')}</DialogTitle>
          <DialogDescription>{t('netPreview.hint')}</DialogDescription>
        </DialogHeader>
        <div role="tablist" aria-label={t('netPreview.networks')} className="flex flex-wrap gap-1.5">
          {targets.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={x.id === active?.id}
              onClick={() => setPicked(x.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
                x.id === active?.id && 'border-primary bg-primary/10 text-accent-foreground',
              )}
            >
              <NetworkIcon platform={x.platform} size={14} />
              {PLATFORMS[x.platform].label}
              {twice(x) ? <span className="text-muted-foreground">· {x.name}</span> : null}
            </button>
          ))}
        </div>
        {active ? (
          <div className="space-y-2">
            <div
              role="tabpanel"
              aria-label={PLATFORMS[active.platform].label}
              className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[28px] border-[6px] border-zinc-900 shadow-lg dark:border-zinc-700"
              style={{
                fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              }}
            >
              <NetworkMockup key={active.id} target={active} media={media} />
            </div>
            {placementOf(active.platform, active.options, media) === 'story' ? (
              <p className="text-center text-xs text-muted-foreground">{t('netPreview.storyNoCaption')}</p>
            ) : null}
            {pending ? (
              <p className="text-center text-xs text-muted-foreground">{t('netPreview.videoPending')}</p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
