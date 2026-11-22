import { useTranslations } from 'next-intl'

import type { PhotoCredit } from '@/lib/media/unsplash'

/**
 * Potpis uz Unsplash fotografiju (D-190): autor i Unsplash sa linkovima, kako traže pravila Unsplash
 * API-ja. Stoji uz svaku prikazanu fotografiju sa Unsplash-a (biblioteka, editor, pregled, odobravanje).
 */
export function PhotoCreditLine({ credit, className }: { credit: PhotoCredit; className?: string }) {
  const t = useTranslations('common')
  const link = 'underline underline-offset-2 hover:text-foreground'
  return (
    <p
      className={className ?? 'text-[11px] leading-tight text-muted-foreground'}
      data-photo-credit="unsplash"
    >
      {t.rich('photoCredit', {
        name: credit.name,
        photographer: (chunks) => (
          <a href={credit.photographerUrl} target="_blank" rel="noopener noreferrer" className={link}>
            {chunks}
          </a>
        ),
        unsplash: (chunks) => (
          <a href={credit.unsplashUrl} target="_blank" rel="noopener noreferrer" className={link}>
            {chunks}
          </a>
        ),
      })}
    </p>
  )
}
