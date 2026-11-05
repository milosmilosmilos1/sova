'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export interface LightboxItem {
  url: string
  video?: boolean
}

/**
 * Slajdovi i fotografije preko celog ekrana (D-157): klik na slajd ga otvara u punoj veličini, a kroz
 * slajdove se ide strelicama, tasterima ← i → ili prevlačenjem prstom. Esc ili X zatvara.
 */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  open,
  onOpenChange,
  labels,
}: {
  items: LightboxItem[]
  index: number
  onIndexChange: (index: number) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  labels: { slide: (n: number, total: number) => string; prev: string; next: string }
}) {
  const touchX = useRef<number | null>(null)
  const last = items.length - 1

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
      else if (e.key === 'ArrowRight' && index < last) onIndexChange(index + 1)
    }
    // u fazi hvatanja: prozor dijaloga drži fokus i ne pušta taster dalje
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, index, last, onIndexChange])

  const item = items[index]
  const label = labels.slide(index + 1, items.length)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-dvh w-screen max-w-none place-items-center rounded-none bg-black/95 p-0 text-white ring-0 sm:max-w-none">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <div
          className="grid size-full place-items-center px-14 py-12"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null
          }}
          onTouchEnd={(e) => {
            const start = touchX.current
            const end = e.changedTouches[0]?.clientX
            touchX.current = null
            if (start === null || end === undefined || Math.abs(end - start) < 50) return
            if (end < start && index < last) onIndexChange(index + 1)
            if (end > start && index > 0) onIndexChange(index - 1)
          }}
        >
          {item?.video ? (
            <video
              key={item.url}
              src={item.url}
              controls
              autoPlay
              playsInline
              className="max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-7rem)]"
              aria-label={label}
            />
          ) : item ? (
            // eslint-disable-next-line @next/next/no-img-element -- potpisan URL slajda u punoj veličini
            <img
              src={item.url}
              alt={label}
              className="max-h-[calc(100dvh-6rem)] max-w-[calc(100vw-7rem)] object-contain select-none"
            />
          ) : null}
        </div>
        {items.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => onIndexChange(index - 1)}
              disabled={index === 0}
              className="absolute top-1/2 left-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30"
              aria-label={labels.prev}
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onIndexChange(index + 1)}
              disabled={index === last}
              className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-30"
              aria-label={labels.next}
            >
              <ChevronRight className="size-6" aria-hidden />
            </button>
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-sm tabular-nums">
              {index + 1} / {items.length}
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
