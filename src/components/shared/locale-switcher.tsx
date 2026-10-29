'use client'

import { Globe } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'

import { changeLocaleAction } from '@/i18n/actions'
import { locales } from '@/i18n/config'
import { cn } from '@/lib/utils'

/** Izbor jezika interfejsa (D-108): srpski, engleski, ukrajinski. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('locale')
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <label className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <Globe className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{t('label')}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          startTransition(async () => {
            await changeLocaleAction(next)
            router.refresh()
          })
        }}
        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {t(l)}
          </option>
        ))}
      </select>
    </label>
  )
}
