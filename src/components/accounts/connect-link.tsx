'use client'

import { useTranslations } from 'next-intl'
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

const LINKEDIN_POINTS = ['data', 'purpose', 'approval', 'revoke', 'deletion', 'renew'] as const

/**
 * Link „Poveži” za mrežu. LinkedIn (API Terms 5.2) traži saglasnost pre povezivanja: koji podaci,
 * zašto, kako se opoziva i briše; ista saglasnost važi i za obnovu veze na 60 dana („Poveži ponovo”).
 * Za ostale mreže je običan link ka prijavi na mreži.
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
