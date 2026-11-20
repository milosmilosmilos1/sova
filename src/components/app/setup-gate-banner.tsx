'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

/**
 * Traka dok brend nije kompletno podešen (D-174): strane sa objavama su zaključane, a ovde je put
 * do koraka koji fali. Na samom uvodu se ne prikazuje.
 */
export function SetupGateBanner({ brand, step }: { brand: string; step: number }) {
  const t = useTranslations('shell.setupGate')
  const pathname = usePathname()
  if (pathname.startsWith('/app/setup')) return null
  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span>{t('text', { brand })}</span>
      <Link
        href={{ pathname: '/app/setup', query: { step } }}
        className="shrink-0 font-medium underline underline-offset-2"
      >
        {t('cta')}
      </Link>
    </div>
  )
}
