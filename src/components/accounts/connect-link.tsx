'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GOOGLE_PERMISSIONS_URL, GOOGLE_PRIVACY_URL, YOUTUBE_TERMS_URL } from '@/config/youtube'
import { isAppLocale } from '@/i18n/config'
import { localePath } from '@/i18n/paths'

const LINKEDIN_POINTS = ['data', 'purpose', 'approval', 'revoke', 'deletion', 'renew'] as const

/**
 * Link „Poveži” za mrežu. LinkedIn (API Terms 5.2) traži saglasnost pre povezivanja: koji podaci,
 * zašto, kako se opoziva i briše; ista saglasnost važi i za obnovu veze na 60 dana („Poveži ponovo”).
 * YouTube (API pravila) traži da korisnik pre povezivanja vidi da prihvata YouTube uslove, uz linkove na
 * uslove, Google politiku privatnosti i opoziv pristupa (D-188). Za ostale mreže je običan link.
 */
export function ConnectLink({
  platform,
  href,
  className,
  children,
}: {
  platform: string
  href: string
  className?: string
  children: ReactNode
}) {
  const t = useTranslations('accounts.linkedinConsent')
  const [open, setOpen] = useState(false)
  if (platform === 'youtube')
    return (
      <YouTubeConnect href={href} className={className}>
        {children}
      </YouTubeConnect>
    )
  if (platform !== 'linkedin')
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('intro')}</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {LINKEDIN_POINTS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button nativeButton={false} render={<a href={href} />}>
              {t('agree')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function external(href: string) {
  return function ExternalLink(chunks: ReactNode) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="underline">
        {chunks}
      </a>
    )
  }
}

function YouTubeConnect({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  const t = useTranslations('accounts.youtubeConsent')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const privacy = localePath(isAppLocale(locale) ? locale : 'sr-Latn', '/privacy')
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('intro')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              {t.rich('terms', {
                tos: external(YOUTUBE_TERMS_URL),
                gpp: external(GOOGLE_PRIVACY_URL),
                privacy: external(privacy),
              })}
            </p>
            <p>{t.rich('revoke', { google: external(GOOGLE_PERMISSIONS_URL) })}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button nativeButton={false} render={<a href={href} />}>
              {t('agree')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
