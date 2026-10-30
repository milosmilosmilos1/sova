'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

const TABS: Array<{ key: 'voice' | 'visual' | 'styles' | 'billing' | 'account'; href: Route }> = [
  { key: 'voice', href: '/app/brand' },
  { key: 'visual', href: '/app/brand/visual' },
  { key: 'styles', href: '/app/brand/styles' },
  { key: 'billing', href: '/app/billing' },
  { key: 'account', href: '/app/settings' },
]

/**
 * Zaglavlje „Brend i nalog” (D-113): glas brenda, vizuelni identitet, stilovi, pretplata i nalog kao
 * kartice. Svaka kartica je svoja strana, pa stari linkovi (/app/billing, /app/settings) i dalje rade.
 */
export function BrandAccountHeader() {
  const t = useTranslations('brandAccount')
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/app/brand' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t('eyebrow')}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <nav aria-label={t('tabsLabel')} className="-mx-1 overflow-x-auto px-1 pb-1">
        <ul className="flex w-max gap-1 rounded-xl border bg-card p-1">
          {TABS.map((tab) => {
            const active = isActive(tab.href)
            return (
              <li key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t(`tabs.${tab.key}`)}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
