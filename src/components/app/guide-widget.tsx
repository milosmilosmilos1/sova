'use client'

import { useQuery } from '@tanstack/react-query'
import { Bug, CheckCircle2, Circle, Compass, Lightbulb, LifeBuoy, Mail, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { api } from '@/components/shared/api-client'
import { GUIDE_HREF, type GuideStepKey as StepKey } from '@/lib/guide'
import { cn } from '@/lib/utils'

interface GuideView {
  steps: Array<{ key: StepKey; done: boolean }>
  done: number
  next: StepKey | null
  setupCompleted: boolean
}

/**
 * „Vodič i podrška” (D-115): plutajuće dugme sa sledećim ključnim korakom, a u prozoru svi koraci,
 * uvod, tabla predloga i email podrške. U uvodu se ne prikazuje, jer uvod ima svoje korake.
 */
export function GuideWidget({ brandId, supportEmail }: { brandId: string; supportEmail: string }) {
  const t = useTranslations('guide')
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['guide', brandId],
    queryFn: () => api<GuideView>(`/api/guide?brandId=${brandId}`),
    staleTime: 60_000,
  })
  const view = query.data
  if (!view || pathname.startsWith('/app/setup')) return null
  const total = view.steps.length

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2 print:hidden">
      {open ? (
        <section
          role="dialog"
          aria-label={t('title')}
          className="pointer-events-auto w-[min(22rem,calc(100vw-2rem))] space-y-4 rounded-2xl border bg-card p-4 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t('title')}</h2>
              <p className="text-sm text-muted-foreground">
                {view.next ? t('progress', { done: view.done, total }) : t('allDone')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('close')}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <ol className="space-y-1">
            {view.steps.map((s, i) => (
              <li key={s.key}>
                <Link
                  href={GUIDE_HREF[s.key]}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg p-2 text-sm transition-colors hover:bg-muted',
                    view.next === s.key && 'bg-primary/5 ring-1 ring-primary/30',
                  )}
                >
                  {s.done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className={cn('block font-medium', s.done && 'text-muted-foreground')}>
                      {i + 1}. {t(`steps.${s.key}.title`)}
                    </span>
                    {view.next === s.key ? (
                      <span className="block text-xs text-muted-foreground">{t(`steps.${s.key}.hint`)}</span>
                    ) : null}
                  </span>
                  <span className="sr-only">{s.done ? t('done') : t('todo')}</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="grid gap-1 border-t pt-3 text-sm">
            <Link
              href="/app/setup"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted"
            >
              <Compass className="size-4 text-primary" aria-hidden />
              {view.setupCompleted ? t('setupAgain') : t('setupContinue')}
            </Link>
            <Link
              href="/app/ideas"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted"
            >
              <Lightbulb className="size-4 text-primary" aria-hidden />
              {t('idea')}
            </Link>
            <Link
              href="/app/ideas?new=bug"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted"
            >
              <Bug className="size-4 text-primary" aria-hidden />
              {t('bug')}
            </Link>
            <a
              href={`mailto:${supportEmail}`}
              className="flex items-center gap-2 rounded-lg p-2 hover:bg-muted"
            >
              <Mail className="size-4 text-primary" aria-hidden />
              {t('email')}
            </a>
          </div>
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pointer-events-auto flex items-center gap-3 rounded-full bg-primary py-2 pr-2 pl-3 text-left text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
      >
        <LifeBuoy className="size-5 shrink-0" aria-hidden />
        <span className="hidden min-w-0 sm:block">
          <span className="block text-sm leading-tight font-semibold">{t('title')}</span>
          <span className="block max-w-48 truncate text-xs text-primary-foreground/80">
            {view.next ? t('next', { step: t(`steps.${view.next}.title`) }) : t('allDoneShort')}
          </span>
        </span>
        <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs font-semibold tabular-nums">
          {view.done}/{total}
        </span>
      </button>
    </div>
  )
}
