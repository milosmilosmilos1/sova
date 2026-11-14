'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { api } from '@/components/shared/api-client'
import { ErrorBox } from '@/components/shared/error-box'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface GalleryItem {
  id: string
  url: string
  description?: string | null
}

export interface PickedPhoto {
  id: string
  url: string
}

/** Izbor jedne fotografije iz Galerije brenda (D-165: tim, pre i posle). */
export function GalleryPhotoPicker({
  open,
  onOpenChange,
  brandId,
  value,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandId: string
  value: string | null
  onPick: (photo: PickedPhoto) => void
}) {
  const t = useTranslations('brandContent.picker')
  const gallery = useQuery({
    queryKey: ['gallery', brandId, 'all'],
    queryFn: () => api<{ items: GalleryItem[] }>(`/api/gallery?brandId=${brandId}`),
    enabled: open,
  })
  // Galerija vraća samo slike brenda
  const items = gallery.data?.items ?? []
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <ErrorBox error={gallery.error} />
        {gallery.data && !items.length ? (
          <div className="space-y-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            <p>{t('empty')}</p>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/gallery" />}>
              {t('openGallery')}
            </Button>
          </div>
        ) : null}
        <ul className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === value}
                aria-label={item.description || t('photo', { n: index + 1 })}
                onClick={() => {
                  onPick({ id: item.id, url: item.url })
                  onOpenChange(false)
                }}
                className={cn(
                  'relative block aspect-square w-full overflow-hidden rounded-lg border-2',
                  item.id === value ? 'border-primary' : 'border-transparent',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- potpisan URL iz skladišta */}
                <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
